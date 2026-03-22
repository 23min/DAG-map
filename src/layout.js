// ================================================================
// layout.js — Shared layout engine for dag-map
// ================================================================
// Topological sort, route extraction via greedy longest-path,
// Y-position assignment with occupancy tracking, node positioning,
// and route/extra-edge path building with pluggable routing.

import { bezierPath } from './route-bezier.js';
import { angularPath } from './route-angular.js';
import { resolveTheme } from './themes.js';

// ================================================================
// COLORS & CONSTANTS (kept for backward compatibility)
// ================================================================
export const C = {
  paper: '#F5F0E8', ink: '#2C2C2C', muted: '#8C8680', border: '#D4CFC7',
  teal: '#2B8A8E', coral: '#E8846B', amber: '#D4944C', red: '#C45B4A',
};

export const CLASS_COLOR = {
  pure: C.teal,
  recordable: C.coral,
  side_effecting: C.amber,
  gate: C.red,
};

/**
 * Determine the dominant node class among a set of node IDs.
 * @param {string[]} nodeIds
 * @param {Map} nodeMap - Map from id to node object
 * @returns {string}
 */
export function dominantClass(nodeIds, nodeMap) {
  const counts = {};
  nodeIds.forEach(id => {
    const cls = nodeMap.get(id)?.cls || 'pure';
    counts[cls] = (counts[cls] || 0) + 1;
  });
  let best = 'pure', bestCount = 0;
  for (const [cls, count] of Object.entries(counts)) {
    if (count > bestCount) { best = cls; bestCount = count; }
  }
  return best;
}

/**
 * Compute the full metro-map layout for a DAG.
 *
 * @param {object} dag - { nodes: [{id, label, cls}], edges: [[from, to]] }
 * @param {object} [options]
 * @param {'bezier'|'angular'} [options.routing='bezier'] - routing style
 * @param {number} [options.trunkY=160] - absolute Y for trunk route
 * @param {number} [options.mainSpacing=34] - px between depth-1 branch lanes
 * @param {number} [options.subSpacing=16] - px between depth-2+ sub-branch lanes
 * @param {number} [options.layerSpacing=38] - px between topological layers
 * @param {number} [options.progressivePower=2.2] - power for progressive curves
 * @param {number} [options.scale=1.5] - scale multiplier for all spatial values
 * @param {'ltr'|'ttb'} [options.direction='ltr'] - layout direction
 * @returns {object} { positions, routePaths, extraEdges, width, height, routes, ... }
 */
export function layoutMetro(dag, options = {}) {
  const routing = options.routing || 'bezier';
  const direction = options.direction || 'ltr';
  const theme = resolveTheme(options.theme);
  const classColor = {
    pure: theme.classes.pure,
    recordable: theme.classes.recordable,
    side_effecting: theme.classes.side_effecting,
    gate: theme.classes.gate,
  };
  const s = options.scale ?? 1.5;
  const TRUNK_Y = (options.trunkY ?? 160) * s;
  const MAIN_SPACING = (options.mainSpacing ?? 34) * s;
  const SUB_SPACING = (options.subSpacing ?? 16) * s;
  const layerSpacing = (options.layerSpacing ?? 38) * s;
  const progressivePower = options.progressivePower ?? 2.2;
  const maxLanes = options.maxLanes ?? null;

  const { nodes, edges } = dag;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenOf = new Map(), parentsOf = new Map();
  nodes.forEach(n => { childrenOf.set(n.id, []); parentsOf.set(n.id, []); });
  edges.forEach(([f, t]) => { childrenOf.get(f).push(t); parentsOf.get(t).push(f); });

  // ── STEP 1: Topological sort + layer assignment ──
  const layer = new Map();
  const inDeg = new Map();
  nodes.forEach(nd => inDeg.set(nd.id, parentsOf.get(nd.id).length));
  const queue = nodes.filter(nd => inDeg.get(nd.id) === 0).map(nd => nd.id);
  queue.forEach(id => layer.set(id, 0));
  const topo = [];
  while (queue.length) {
    const u = queue.shift(); topo.push(u);
    for (const v of childrenOf.get(u)) {
      layer.set(v, Math.max(layer.get(v) || 0, layer.get(u) + 1));
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }
  const maxLayer = Math.max(...topo.map(id => layer.get(id)));

  // ── STEP 2: Extract routes via greedy longest-path ──
  function longestPathIn(nodeSet) {
    const dist = new Map(), prev = new Map();
    nodeSet.forEach(id => { dist.set(id, 0); prev.set(id, null); });
    for (const u of topo) {
      if (!nodeSet.has(u)) continue;
      for (const v of childrenOf.get(u)) {
        if (!nodeSet.has(v)) continue;
        if (dist.get(u) + 1 > dist.get(v)) {
          dist.set(v, dist.get(u) + 1); prev.set(v, u);
        }
      }
    }
    let best = -1, end = null;
    nodeSet.forEach(id => { if (dist.get(id) > best) { best = dist.get(id); end = id; } });
    if (end === null) return [];
    const path = [];
    for (let c = end; c !== null; c = prev.get(c)) path.unshift(c);
    return path;
  }

  const routes = [];
  const assigned = new Set();
  const nodeRoute = new Map();

  const trunk = longestPathIn(new Set(topo));
  routes.push({ nodes: trunk, lane: 0, parentRoute: -1, depth: 0 });
  trunk.forEach(id => { assigned.add(id); nodeRoute.set(id, 0); });

  let safety = 0;
  while (assigned.size < nodes.length && safety++ < 300) {
    const unassigned = [];
    nodes.forEach(nd => { if (!assigned.has(nd.id)) unassigned.push(nd.id); });
    if (unassigned.length === 0) break;

    const unassignedSet = new Set(unassigned);
    let bestPath = longestPathIn(unassignedSet);
    if (bestPath.length === 0) {
      unassigned.forEach(id => { assigned.add(id); nodeRoute.set(id, 0); });
      break;
    }

    const firstNode = bestPath[0];
    const assignedParents = parentsOf.get(firstNode).filter(p => assigned.has(p));
    let parentRouteIdx = 0;
    if (assignedParents.length > 0) {
      bestPath.unshift(assignedParents[0]);
      parentRouteIdx = nodeRoute.get(assignedParents[0]) ?? 0;
    }

    const lastNode = bestPath[bestPath.length - 1];
    const assignedChildren = childrenOf.get(lastNode).filter(c => assigned.has(c));
    if (assignedChildren.length > 0) {
      bestPath.push(assignedChildren[0]);
    }

    const ri = routes.length;
    const parentDepth = routes[parentRouteIdx]?.depth ?? 0;
    routes.push({ nodes: bestPath, lane: 0, parentRoute: parentRouteIdx, depth: parentDepth + 1 });
    bestPath.forEach(id => {
      if (!assigned.has(id)) { assigned.add(id); nodeRoute.set(id, ri); }
    });
  }

  // ── STEP 3: Y-position assignment with occupancy tracking ──
  const routeChildren = new Map();
  routes.forEach((_, i) => routeChildren.set(i, []));
  for (let ri = 1; ri < routes.length; ri++) {
    const pi = routes[ri].parentRoute;
    if (routeChildren.has(pi)) routeChildren.get(pi).push(ri);
    else routeChildren.set(pi, [ri]);
  }

  const routeLayerRange = routes.map(route => {
    let min = Infinity, max = -Infinity;
    route.nodes.forEach(id => {
      const l = layer.get(id);
      if (l < min) min = l;
      if (l > max) max = l;
    });
    return [min, max];
  });

  const routeOwnLength = routes.map((route, ri) => {
    return route.nodes.filter(id => nodeRoute.get(id) === ri).length;
  });

  const routeDomClass = routes.map((route, ri) => {
    const ownNodes = route.nodes.filter(id => nodeRoute.get(id) === ri);
    return dominantClass(ownNodes, nodeMap);
  });

  // Y occupancy tracker: tracks used Y ranges per layer range
  const yOccupancy = []; // [{y, sL, eL}]
  function canUseY(y, sL, eL, minGap) {
    for (const occ of yOccupancy) {
      if (sL <= occ.eL + 1 && eL >= occ.sL - 1) {
        if (Math.abs(y - occ.y) < minGap) return false;
      }
    }
    return true;
  }
  function claimY(y, sL, eL) {
    yOccupancy.push({ y, sL, eL });
  }

  // Assign trunk
  const routeY = new Map();
  routeY.set(0, TRUNK_Y);
  claimY(TRUNK_Y, routeLayerRange[0][0], routeLayerRange[0][1]);

  // BFS from trunk
  const laneQueue = [0];
  const assignedRoutes = new Set([0]);

  while (laneQueue.length > 0) {
    const pi = laneQueue.shift();
    const parentY = routeY.get(pi);
    const children = routeChildren.get(pi) || [];

    // Sort: longest routes first
    children.sort((a, b) => routeOwnLength[b] - routeOwnLength[a]);

    let childAbove = 0, childBelow = 0;

    for (const ci of children) {
      if (assignedRoutes.has(ci)) continue;
      const [sL, eL] = routeLayerRange[ci];
      const cls = routeDomClass[ci];
      const depth = routes[ci].depth;
      const ownLength = routeOwnLength[ci];

      // Spacing depends on depth and route length
      const spacing = (depth <= 1 && ownLength > 2) ? MAIN_SPACING : SUB_SPACING;

      // Direction: side_effecting below, recordable above,
      // pure alternates but prefers above for balance
      let preferBelow;
      if (cls === 'side_effecting') {
        preferBelow = true;
      } else if (cls === 'recordable' && depth === 1) {
        preferBelow = false;
      } else {
        preferBelow = childBelow <= childAbove;
      }

      // Search for an available Y position
      const maxDist = maxLanes ? maxLanes : 8;
      let y = null;
      for (let dist = 1; dist <= maxDist; dist++) {
        const tryY = parentY + (preferBelow ? dist * spacing : -dist * spacing);
        if (canUseY(tryY, sL, eL, spacing * 0.8)) {
          y = tryY; break;
        }
        const tryAlt = parentY + (preferBelow ? -dist * spacing : dist * spacing);
        if (canUseY(tryAlt, sL, eL, spacing * 0.8)) {
          y = tryAlt; break;
        }
      }
      if (y === null) {
        y = parentY + (preferBelow ? (childBelow + 1) * spacing : -(childAbove + 1) * spacing);
      }

      routeY.set(ci, y);
      claimY(y, sL, eL);
      assignedRoutes.add(ci);
      laneQueue.push(ci);

      if (y > parentY) childBelow++;
      else childAbove++;
    }
  }

  // ── STEP 4: Position nodes ──
  const margin = { top: 0, left: 50 * s, bottom: 0, right: 40 * s };

  // Each node's Y comes from its route's Y
  const nodeYDirect = new Map();
  nodes.forEach(nd => {
    const ri = nodeRoute.get(nd.id);
    nodeYDirect.set(nd.id, (ri !== undefined) ? routeY.get(ri) : TRUNK_Y);
  });

  // Find Y bounds
  let minY = Infinity, maxY = -Infinity;
  nodes.forEach(nd => {
    const y = nodeYDirect.get(nd.id);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  // Add padding
  const topPad = 50 * s;
  const bottomPad = 80 * s;

  const positions = new Map();
  nodes.forEach(nd => {
    positions.set(nd.id, {
      x: margin.left + layer.get(nd.id) * layerSpacing,
      y: topPad + (nodeYDirect.get(nd.id) - minY),
    });
  });

  const width = margin.left + (maxLayer + 1) * layerSpacing + margin.right;
  const height = topPad + (maxY - minY) + bottomPad;

  // Compute screen Y for each route (after topPad/minY shift)
  const routeYScreen = new Map();
  for (const [ri, y] of routeY.entries()) {
    routeYScreen.set(ri, topPad + (y - minY));
  }
  const trunkYScreen = topPad + (TRUNK_Y - minY);

  // ── STEP 5: Build route paths ──
  const pathFn = routing === 'bezier' ? bezierPath : angularPath;
  const opBoost = theme.lineOpacity ?? 1.0;

  const routePaths = routes.map((route, ri) => {
    const pts = route.nodes.map(id => ({ ...positions.get(id), id }));
    const ownNodes = route.nodes.filter(id => nodeRoute.get(id) === ri);
    const color = classColor[dominantClass(ownNodes, nodeMap)] || classColor.pure;

    let thickness, opacity;
    if (ri === 0) {
      thickness = 5 * s;
      opacity = Math.min(0.6 * opBoost, 1);
    } else if (ownNodes.length > 5) {
      thickness = 3.5 * s;
      opacity = Math.min(0.45 * opBoost, 1);
    } else if (ownNodes.length > 2) {
      thickness = 2.5 * s;
      opacity = Math.min(0.35 * opBoost, 1);
    } else {
      thickness = 2 * s;
      opacity = Math.min(0.28 * opBoost, 1);
    }

    const segments = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const srcNode = nodeMap.get(p.id);
      const segColor = classColor[srcNode?.cls] || color;
      const segDashed = srcNode?.cls === 'gate';

      // Determine reference Y for convergence/divergence detection
      let segRefY;
      if (routing === 'angular') {
        // R9: Interchange-based direction detection
        const srcIsOwn = nodeRoute.get(p.id) === ri;
        const dstIsOwn = nodeRoute.get(q.id) === ri;

        if (!srcIsOwn && dstIsOwn) {
          // FORK: source is interchange, dest is own node -> DIVERGENCE
          segRefY = p.y;
        } else if (srcIsOwn && !dstIsOwn) {
          // RETURN: source is own node, dest is interchange -> CONVERGENCE
          segRefY = q.y;
        } else {
          // Both own or both interchange -> use trunk Y as fallback
          segRefY = trunkYScreen;
        }
      } else {
        segRefY = trunkYScreen;
      }

      const d = `M ${p.x} ${p.y} ` + pathFn(p.x, p.y, q.x, q.y, ri, i, segRefY, { progressivePower });
      segments.push({ d, color: segColor, thickness, opacity, dashed: segDashed });
    }
    return segments;
  });

  // ── STEP 6: Extra edges (cross-route connections) ──
  const routeEdgeSet = new Set();
  routes.forEach(route => {
    for (let i = 1; i < route.nodes.length; i++)
      routeEdgeSet.add(`${route.nodes[i - 1]}\u2192${route.nodes[i]}`);
  });

  const extraEdges = [];
  edges.forEach(([f, t]) => {
    if (routeEdgeSet.has(`${f}\u2192${t}`)) return;
    const p = positions.get(f), q = positions.get(t);
    if (!p || !q) return;
    const srcNode = nodeMap.get(f);
    const color = classColor[srcNode?.cls] || classColor.pure;
    const extraIdx = (f.length * 3 + t.length * 7) % 17;

    // Extra edges always use trunkScreenY as reference
    const refY = trunkYScreen;

    const d = `M ${p.x} ${p.y} ` + pathFn(p.x, p.y, q.x, q.y, extraIdx, 0, refY, { progressivePower });
    extraEdges.push({ d, color, thickness: 1.8 * s, opacity: Math.min(0.22 * opBoost, 1), dashed: srcNode?.cls === 'gate' });
  });

  // Node lane info (for compatibility)
  const nodeLane = new Map();
  nodes.forEach(nd => {
    const ri = nodeRoute.get(nd.id);
    nodeLane.set(nd.id, ri !== undefined ? routes[ri].lane : 0);
  });

  if (direction === 'ttb') {
    // Swap X↔Y in all positions
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.y, y: pos.x });
    }

    // Rewrite SVG path data: swap all coordinate pairs
    function swapPathCoords(d) {
      // Tokenize: split on SVG commands, swap each x,y pair
      return d.replace(/([MLCQ])\s*/gi, '\n$1 ').split('\n').filter(Boolean).map(seg => {
        const cmd = seg[0];
        const nums = seg.slice(1).trim().split(/[\s,]+/).map(Number);
        const swapped = [];
        for (let i = 0; i < nums.length; i += 2) {
          swapped.push(nums[i + 1], nums[i]);
        }
        return cmd + ' ' + swapped.join(' ');
      }).join(' ');
    }

    for (const segments of routePaths) {
      for (const seg of segments) {
        seg.d = swapPathCoords(seg.d);
      }
    }
    for (const seg of extraEdges) {
      seg.d = swapPathCoords(seg.d);
    }

    return {
      positions,
      routePaths,
      extraEdges,
      width: height,
      height: width,
      maxLayer,
      routes,
      nodeLane,
      nodeRoute,
      laneSpacing: MAIN_SPACING,
      layerSpacing,
      minY,
      maxY,
      routeYScreen,
      trunkYScreen,
      scale: s,
      theme,
      orientation: 'ttb',
    };
  }

  return {
    positions,
    routePaths,
    extraEdges,
    width,
    height,
    maxLayer,
    routes,
    nodeLane,
    nodeRoute,
    laneSpacing: MAIN_SPACING,
    layerSpacing,
    minY,
    maxY,
    routeYScreen,
    trunkYScreen,
    scale: s,
    theme,
  };
}
