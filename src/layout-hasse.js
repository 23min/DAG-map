// ================================================================
// layout-hasse.js — Hasse diagram layout engine for dag-map
// ================================================================
// Sugiyama-style layered layout for partial orders / lattices.
// Top-to-bottom: ⊤ (top) at the top, ⊥ (bottom) at the bottom.
// Edges represent covering relations pointing downward.
//
// Algorithm phases:
//   1. Rank assignment (longest path from sources)
//   2. Virtual node insertion for long edges
//   3. Crossing reduction (barycenter heuristic, multi-pass)
//   4. X-coordinate assignment (barycenter positioning + spacing)
//   5. Y-coordinate assignment (rank × spacing)
//   6. Edge path generation

import { resolveTheme } from './themes.js';
import { assertValidDag, buildGraph, topoSortAndRank } from './graph-utils.js';

// ================================================================
// PHASE 2: Virtual node insertion
// ================================================================

function insertVirtualNodes(edges, rank, childrenOf, parentsOf) {
  const virtualNodes = []; // { id, rank }
  const expandedEdges = []; // all edges after splitting
  const virtualChains = new Map(); // original edge key -> [virtual node ids]

  for (const [from, to] of edges) {
    const rFrom = rank.get(from);
    const rTo = rank.get(to);
    const span = rTo - rFrom;

    if (span <= 1) {
      expandedEdges.push([from, to]);
      continue;
    }

    // Insert virtual nodes at each intermediate rank
    const chain = [];
    let prev = from;
    for (let r = rFrom + 1; r < rTo; r++) {
      const vid = `__v_${from}_${to}_${r}`;
      virtualNodes.push({ id: vid, rank: r });
      chain.push(vid);
      expandedEdges.push([prev, vid]);

      // Register in adjacency
      if (!childrenOf.has(vid)) childrenOf.set(vid, []);
      if (!parentsOf.has(vid)) parentsOf.set(vid, []);
      childrenOf.get(prev).push(vid);
      parentsOf.get(vid).push(prev);

      prev = vid;
    }
    expandedEdges.push([prev, to]);
    childrenOf.get(prev).push(to);
    parentsOf.get(to).push(prev);

    virtualChains.set(`${from}->${to}`, chain);
  }

  // Update rank map for virtual nodes
  for (const vn of virtualNodes) {
    rank.set(vn.id, vn.rank);
  }

  return { virtualNodes, expandedEdges, virtualChains };
}

// ================================================================
// PHASE 3: Crossing reduction (barycenter heuristic)
// ================================================================

function buildLayers(nodeIds, rank, maxRank) {
  const layers = [];
  for (let r = 0; r <= maxRank; r++) layers.push([]);
  for (const id of nodeIds) {
    const r = rank.get(id);
    if (r !== undefined) layers[r].push(id);
  }
  return layers;
}

function countCrossings(layers, childrenOf) {
  let total = 0;
  for (let r = 0; r < layers.length - 1; r++) {
    const upper = layers[r];
    const lower = layers[r + 1];
    const posInLower = new Map();
    lower.forEach((id, i) => posInLower.set(id, i));

    // Collect edges as (upper_pos, lower_pos) pairs
    const edgePairs = [];
    for (let ui = 0; ui < upper.length; ui++) {
      const children = childrenOf.get(upper[ui]) || [];
      for (const child of children) {
        const li = posInLower.get(child);
        if (li !== undefined) edgePairs.push([ui, li]);
      }
    }

    // Count inversions
    for (let i = 0; i < edgePairs.length; i++) {
      for (let j = i + 1; j < edgePairs.length; j++) {
        if ((edgePairs[i][0] - edgePairs[j][0]) * (edgePairs[i][1] - edgePairs[j][1]) < 0) {
          total++;
        }
      }
    }
  }
  return total;
}

function barycenterSort(layer, getNeighborPositions) {
  const barycenters = new Map();
  for (const id of layer) {
    const positions = getNeighborPositions(id);
    if (positions.length > 0) {
      const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
      barycenters.set(id, avg);
    } else {
      barycenters.set(id, Infinity); // keep original position
    }
  }

  // Stable sort by barycenter
  const indexed = layer.map((id, i) => ({ id, bc: barycenters.get(id), orig: i }));
  indexed.sort((a, b) => {
    if (a.bc !== b.bc) return a.bc - b.bc;
    return a.orig - b.orig; // stable tie-break
  });
  return indexed.map(e => e.id);
}

function reduceCrossings(layers, childrenOf, parentsOf, passes) {
  let best = layers.map(l => [...l]);
  let bestCrossings = countCrossings(best, childrenOf);

  const current = layers.map(l => [...l]);

  for (let pass = 0; pass < passes; pass++) {
    if (pass % 2 === 0) {
      // Top-down sweep
      for (let r = 1; r < current.length; r++) {
        const upperPos = new Map();
        current[r - 1].forEach((id, i) => upperPos.set(id, i));

        current[r] = barycenterSort(current[r], (id) => {
          const parents = parentsOf.get(id) || [];
          return parents.map(p => upperPos.get(p)).filter(p => p !== undefined);
        });
      }
    } else {
      // Bottom-up sweep
      for (let r = current.length - 2; r >= 0; r--) {
        const lowerPos = new Map();
        current[r + 1].forEach((id, i) => lowerPos.set(id, i));

        current[r] = barycenterSort(current[r], (id) => {
          const children = childrenOf.get(id) || [];
          return children.map(c => lowerPos.get(c)).filter(c => c !== undefined);
        });
      }
    }

    const crossings = countCrossings(current, childrenOf);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      for (let r = 0; r < current.length; r++) best[r] = [...current[r]];
    }
  }

  return best;
}

// ================================================================
// PHASE 4: X-coordinate assignment
// ================================================================

function assignXCoordinates(layers, childrenOf, parentsOf, nodeSpacing) {
  const x = new Map();

  // Initialize: evenly spaced within each layer
  for (const layer of layers) {
    layer.forEach((id, i) => {
      x.set(id, i * nodeSpacing);
    });
  }

  // Iterative refinement: move each node toward the barycenter of its neighbors
  for (let iter = 0; iter < 12; iter++) {
    // Top-down pass
    for (let r = 1; r < layers.length; r++) {
      for (const id of layers[r]) {
        const parents = (parentsOf.get(id) || []).filter(p => x.has(p));
        const children = (childrenOf.get(id) || []).filter(c => x.has(c));
        const neighbors = [...parents, ...children];
        if (neighbors.length > 0) {
          const avg = neighbors.reduce((sum, n) => sum + x.get(n), 0) / neighbors.length;
          x.set(id, avg);
        }
      }
      // Enforce minimum spacing
      enforceSpacing(layers[r], x, nodeSpacing);
    }

    // Bottom-up pass
    for (let r = layers.length - 2; r >= 0; r--) {
      for (const id of layers[r]) {
        const parents = (parentsOf.get(id) || []).filter(p => x.has(p));
        const children = (childrenOf.get(id) || []).filter(c => x.has(c));
        const neighbors = [...parents, ...children];
        if (neighbors.length > 0) {
          const avg = neighbors.reduce((sum, n) => sum + x.get(n), 0) / neighbors.length;
          x.set(id, avg);
        }
      }
      enforceSpacing(layers[r], x, nodeSpacing);
    }
  }

  // Center all layers around the same midpoint
  centerLayers(layers, x);

  return x;
}

function enforceSpacing(layer, x, minSpacing) {
  // Sort layer by current x position (maintain layer order)
  const sorted = [...layer].sort((a, b) => x.get(a) - x.get(b));

  // Left-to-right sweep: push right if too close
  for (let i = 1; i < sorted.length; i++) {
    const prev = x.get(sorted[i - 1]);
    const curr = x.get(sorted[i]);
    if (curr - prev < minSpacing) {
      x.set(sorted[i], prev + minSpacing);
    }
  }

  // Right-to-left sweep: push left if too close (balance)
  for (let i = sorted.length - 2; i >= 0; i--) {
    const next = x.get(sorted[i + 1]);
    const curr = x.get(sorted[i]);
    if (next - curr < minSpacing) {
      x.set(sorted[i], next - minSpacing);
    }
  }
}

function centerLayers(layers, x) {
  // Find the global center
  let globalMin = Infinity, globalMax = -Infinity;
  for (const layer of layers) {
    for (const id of layer) {
      const val = x.get(id);
      if (val < globalMin) globalMin = val;
      if (val > globalMax) globalMax = val;
    }
  }
  const globalCenter = (globalMin + globalMax) / 2;

  // Center each layer
  for (const layer of layers) {
    if (layer.length === 0) continue;
    let layerMin = Infinity, layerMax = -Infinity;
    for (const id of layer) {
      const val = x.get(id);
      if (val < layerMin) layerMin = val;
      if (val > layerMax) layerMax = val;
    }
    const layerCenter = (layerMin + layerMax) / 2;
    const shift = globalCenter - layerCenter;
    for (const id of layer) {
      x.set(id, x.get(id) + shift);
    }
  }
}

// ================================================================
// PHASE 5+6: Edge path generation
// ================================================================

function hasseEdgePath(points, edgeStyle) {
  if (points.length < 2) return '';

  if (points.length === 2) {
    const [p, q] = points;
    const dx = Math.abs(q.x - p.x);

    if (edgeStyle === 'straight' || dx < 2) {
      return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
    }

    // Gentle vertical cubic bezier
    const dy = q.y - p.y;
    const cp1y = p.y + dy * 0.4;
    const cp2y = p.y + dy * 0.6;
    return `M ${p.x} ${p.y} C ${p.x} ${cp1y}, ${q.x} ${cp2y}, ${q.x} ${q.y}`;
  }

  // Multi-segment through virtual nodes
  if (edgeStyle === 'straight') {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  // Smooth multi-segment: cubic bezier through control points
  // Use Catmull-Rom-like approach: bezier between consecutive points
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const dy = q.y - p.y;
    const cp1y = p.y + dy * 0.4;
    const cp2y = p.y + dy * 0.6;
    d += ` C ${p.x} ${cp1y}, ${q.x} ${cp2y}, ${q.x} ${q.y}`;
  }
  return d;
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Compute a Hasse diagram layout for a DAG (lattice / partial order).
 *
 * Edges point downward: [a, b] means a ≥ b (a covers b).
 * Layout is top-to-bottom: rank 0 at top, max rank at bottom.
 *
 * @param {object} dag - { nodes: [{id, label, cls}], edges: [[from, to]] }
 * @param {object} [options]
 * @param {number} [options.rankSpacing=80] - vertical distance between layers (before scale)
 * @param {number} [options.nodeSpacing=60] - horizontal distance between nodes (before scale)
 * @param {number} [options.scale=1.5] - global size multiplier
 * @param {number} [options.crossingPasses=24] - barycenter sweep iterations
 * @param {'straight'|'bezier'} [options.edgeStyle='bezier'] - edge rendering style
 * @param {string|object} [options.theme='mono'] - theme name or custom object
 * @returns {object} layout compatible with renderSVG()
 */
export function layoutHasse(dag, options = {}) {
  const theme = resolveTheme(options.theme ?? 'mono');
  const s = options.scale ?? 1.5;
  const rankSpacing = (options.rankSpacing ?? 80) * s;
  const nodeSpacing = (options.nodeSpacing ?? 60) * s;
  const crossingPasses = options.crossingPasses ?? 24;
  const edgeStyle = options.edgeStyle ?? 'bezier';

  const { nodes, edges } = dag;
  assertValidDag(nodes, edges, 'layoutHasse');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // Phase 1: Rank assignment
  const { topo, rank, maxRank } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // Phase 2: Virtual nodes for long edges
  // Work on copies of adjacency so we don't mutate the originals
  const expandedChildren = new Map();
  const expandedParents = new Map();
  for (const [k, v] of childrenOf) expandedChildren.set(k, [...v]);
  for (const [k, v] of parentsOf) expandedParents.set(k, [...v]);

  const { virtualNodes, expandedEdges, virtualChains } =
    insertVirtualNodes(edges, rank, expandedChildren, expandedParents);

  // All node IDs (real + virtual) for layering
  const allIds = [...topo, ...virtualNodes.map(v => v.id)];

  // Phase 3: Crossing reduction
  let layers = buildLayers(allIds, rank, maxRank);
  layers = reduceCrossings(layers, expandedChildren, expandedParents, crossingPasses);

  // Phase 4: X-coordinate assignment
  const xCoord = assignXCoordinates(layers, expandedChildren, expandedParents, nodeSpacing);

  // Phase 5: Compute positions
  const topPad = 50 * s;
  const leftPad = 50 * s;

  // Shift X so minimum is at leftPad
  let minX = Infinity;
  for (const id of allIds) {
    const val = xCoord.get(id);
    if (val < minX) minX = val;
  }
  const xShift = leftPad - minX;

  const allPositions = new Map(); // includes virtual nodes
  for (const id of allIds) {
    allPositions.set(id, {
      x: xCoord.get(id) + xShift,
      y: topPad + rank.get(id) * rankSpacing,
    });
  }

  // Real node positions only (for renderSVG)
  const positions = new Map();
  for (const nd of nodes) {
    const pos = allPositions.get(nd.id);
    if (pos) positions.set(nd.id, pos);
  }

  // Compute dimensions
  let maxX = 0, maxY = 0, layoutMinY = Infinity, layoutMaxY = -Infinity;
  for (const nd of nodes) {
    const pos = positions.get(nd.id);
    if (!pos) continue;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
    if (pos.y < layoutMinY) layoutMinY = pos.y;
    if (pos.y > layoutMaxY) layoutMaxY = pos.y;
  }
  const rightPad = 50 * s;
  const bottomPad = 80 * s;
  const width = maxX + rightPad;
  const height = maxY + bottomPad;

  // Phase 6: Build edge paths
  // Hasse diagrams use uniform edge color (the structure IS the information)
  const edgeColor = theme.ink;
  const opBoost = theme.lineOpacity ?? 1.0;
  const edgeThickness = 2.2 * s;
  const edgeOpacity = Math.min(0.35 * opBoost, 1);

  // Build one segment per original edge
  const segments = [];
  for (const [from, to] of edges) {
    // Collect path points: source -> virtual nodes -> target
    const chainKey = `${from}->${to}`;
    const chain = virtualChains.get(chainKey);

    let pathPoints;
    if (chain) {
      pathPoints = [
        allPositions.get(from),
        ...chain.map(vid => allPositions.get(vid)),
        allPositions.get(to),
      ];
    } else {
      pathPoints = [allPositions.get(from), allPositions.get(to)];
    }

    const d = hasseEdgePath(pathPoints, edgeStyle);
    segments.push({ d, color: edgeColor, thickness: edgeThickness, opacity: edgeOpacity, dashed: false });
  }

  // Package as routePaths: single route containing all segments
  const routePaths = [segments];

  // Route metadata for renderSVG compatibility
  const routes = [{ nodes: topo, lane: 0, parentRoute: -1, depth: 0 }];
  const nodeRoute = new Map();
  const nodeLane = new Map();
  for (const nd of nodes) {
    nodeRoute.set(nd.id, 0);
    nodeLane.set(nd.id, 0);
  }

  const centerY = (layoutMinY + layoutMaxY) / 2;

  return {
    positions,
    routePaths,
    extraEdges: [],
    width,
    height,
    maxLayer: maxRank,
    routes,
    nodeLane,
    nodeRoute,
    laneSpacing: nodeSpacing,
    layerSpacing: rankSpacing,
    minY: layoutMinY,
    maxY: layoutMaxY,
    routeYScreen: new Map([[0, centerY]]),
    trunkYScreen: centerY,
    scale: s,
    theme,
    orientation: 'ttb',
  };
}
