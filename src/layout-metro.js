// ================================================================
// layout.js — Shared layout engine for dag-map
// ================================================================
// Topological sort, route extraction via greedy longest-path,
// Y-position assignment with occupancy tracking, node positioning,
// and route/extra-edge path building with pluggable routing.

import { bezierPath } from './route-bezier.js';
import { angularPath } from './route-angular.js';
import { metroPath } from './route-metro.js';
import { resolveTheme } from './themes.js';
import { assertValidDag, buildGraph, topoSortAndRank, swapPathXY } from './graph-utils.js';

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
  const isTTB = direction === 'ttb';
  const theme = resolveTheme(options.theme);
  // Build classColor from all theme classes (not just hardcoded four)
  const classColor = { ...theme.classes };
  const s = options.scale ?? 1.5;
  const TRUNK_Y = (options.trunkY ?? 160) * s;
  const MAIN_SPACING = (options.mainSpacing ?? 34) * s;
  const SUB_SPACING = (options.subSpacing ?? 16) * s;
  const layerSpacing = (options.layerSpacing ?? 38) * s;
  const progressivePower = options.progressivePower ?? 2.2;
  const cornerRadius = (options.cornerRadius ?? 8) * s;
  const dimOpacity = options.dimOpacity ?? 0.25;
  const maxLanes = options.maxLanes ?? null;
  const hasProvidedRoutes = !!(options.routes && options.routes.length > 0);

  const { nodes, edges } = dag;
  assertValidDag(nodes, edges, 'layoutMetro');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // ── STEP 1: Topological sort + layer assignment ──
  const { topo, rank: layer, maxRank: maxLayer } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // ── STEP 2: Extract routes ──
  // Either use consumer-provided routes or auto-discover via greedy longest-path.
  // lineGap is set after route discovery (needs route count)

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
  const nodeRoutes = new Map(); // node → Set<routeIdx> (all routes through this node)
  nodes.forEach(nd => nodeRoutes.set(nd.id, new Set()));

  if (options.routes && options.routes.length > 0) {
    // ── Consumer-provided routes ──
    // Sort by length descending — longest route becomes trunk
    const provided = options.routes
      .map((r, i) => ({ ...r, originalIndex: i }))
      .sort((a, b) => b.nodes.length - a.nodes.length);

    provided.forEach((pr, i) => {
      // Determine parent route: the earlier route that shares the most nodes
      let parentRouteIdx = -1;
      let bestOverlap = 0;
      const prNodeSet = new Set(pr.nodes);
      for (let j = 0; j < i; j++) {
        const overlap = routes[j].nodes.filter(id => prNodeSet.has(id)).length;
        if (overlap > bestOverlap) { bestOverlap = overlap; parentRouteIdx = j; }
      }
      if (i === 0) parentRouteIdx = -1;
      const depth = parentRouteIdx >= 0 ? routes[parentRouteIdx].depth + 1 : 0;

      routes.push({
        nodes: pr.nodes,
        lane: 0,
        parentRoute: parentRouteIdx >= 0 ? parentRouteIdx : (i === 0 ? -1 : 0),
        depth,
        cls: pr.cls || null,
        id: pr.id || null,
      });

      const ri = routes.length - 1;
      pr.nodes.forEach(id => {
        if (!assigned.has(id)) { assigned.add(id); nodeRoute.set(id, ri); }
        nodeRoutes.get(id)?.add(ri);
      });
    });

    // Any nodes not in any route get assigned to route 0
    nodes.forEach(nd => {
      if (!assigned.has(nd.id)) {
        assigned.add(nd.id);
        nodeRoute.set(nd.id, 0);
      }
    });
  } else {
    // ── Auto-discover routes via greedy longest-path ──
    const trunk = longestPathIn(new Set(topo));
    routes.push({ nodes: trunk, lane: 0, parentRoute: -1, depth: 0 });
    trunk.forEach(id => { assigned.add(id); nodeRoute.set(id, 0); nodeRoutes.get(id)?.add(0); });

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
        nodeRoutes.get(id)?.add(ri);
      });
    }
  }

  // ── Build shared segment map for parallel offset rendering ──
  // segmentRoutes: "A→B" → [routeIdx, ...] (ordered)
  const segmentRoutes = new Map();
  routes.forEach((route, ri) => {
    for (let i = 1; i < route.nodes.length; i++) {
      const key = `${route.nodes[i - 1]}\u2192${route.nodes[i]}`;
      if (!segmentRoutes.has(key)) segmentRoutes.set(key, []);
      segmentRoutes.get(key).push(ri);
    }
  });

  // lineGap: perpendicular gap between parallel lines at shared nodes.
  // Only non-zero when consumer provides multiple routes (visible parallel lines).
  // Auto-discovered routes are internal — they don't need visual separation.
  const lineGap = (options.lineGap ?? (hasProvidedRoutes && routes.length > 1 ? 5 : 0)) * s;

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

    // With provided routes, keep route order (gives consumer control over above/below).
    // With auto-discovered routes, sort longest first.
    if (!hasProvidedRoutes) {
      children.sort((a, b) => routeOwnLength[b] - routeOwnLength[a]);
    }

    let childAbove = 0, childBelow = 0;

    for (const ci of children) {
      if (assignedRoutes.has(ci)) continue;
      const [sL, eL] = routeLayerRange[ci];
      const cls = routeDomClass[ci];
      const depth = routes[ci].depth;
      const ownLength = routeOwnLength[ci];

      // Spacing depends on depth and route length
      const spacing = (depth <= 1 && ownLength > 2) ? MAIN_SPACING : SUB_SPACING;

      // With provided routes, alternate strictly: first child above, second below, etc.
      // With auto-discovered routes, use class-based heuristics.
      let preferBelow;
      if (hasProvidedRoutes) {
        preferBelow = childBelow <= childAbove;
      } else if (cls === 'side_effecting') {
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
  const pathFn = routing === 'metro' ? metroPath : routing === 'bezier' ? bezierPath : angularPath;
  const opBoost = theme.lineOpacity ?? 1.0;

  const routePaths = routes.map((route, ri) => {
    const pts = route.nodes.map(id => ({ ...positions.get(id), id }));
    const ownNodes = route.nodes.filter(id => nodeRoute.get(id) === ri);

    // Route color: use route's cls if provided, else dominant class
    const routeCls = route.cls || dominantClass(ownNodes, nodeMap);
    const color = classColor[routeCls] || classColor.pure || Object.values(classColor)[0];

    let thickness, opacity;
    if (hasProvidedRoutes) {
      // With provided routes, all lines are equal weight
      thickness = 3 * s;
      opacity = Math.min(0.55 * opBoost, 1);
    } else if (ri === 0) {
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

    // Precompute per-node offset for this route.
    // At each node, find all routes passing through it and assign a consistent
    // slot so the line enters and exits at the same Y-offset.
    const nodeOffsetY = new Map();
    for (const id of route.nodes) {
      const nr = nodeRoutes.get(id);
      if (nr && nr.size > 1) {
        const allRoutes = [...nr].sort((a, b) => a - b); // stable order
        const idx = allRoutes.indexOf(ri);
        const n = allRoutes.length;
        nodeOffsetY.set(id, (idx - (n - 1) / 2) * lineGap);
      } else {
        nodeOffsetY.set(id, 0);
      }
    }

    const segments = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];

      // Use node-based offsets for continuity through stations
      const offPy = nodeOffsetY.get(p.id) || 0;
      const offQy = nodeOffsetY.get(q.id) || 0;

      const px = p.x, py = p.y + offPy;
      const qx = q.x, qy = q.y + offQy;

      // Segment color: use route color for provided routes, else source node class
      const srcNode = nodeMap.get(p.id);
      const segColor = hasProvidedRoutes ? color : (classColor[srcNode?.cls] || color);
      const segDashed = srcNode?.cls === 'gate' || route.cls === 'gate';

      // Determine reference Y for convergence/divergence detection
      let segRefY;
      if (routing === 'angular') {
        const srcIsOwn = nodeRoute.get(p.id) === ri;
        const dstIsOwn = nodeRoute.get(q.id) === ri;

        if (!srcIsOwn && dstIsOwn) {
          segRefY = py;
        } else if (srcIsOwn && !dstIsOwn) {
          segRefY = qy;
        } else {
          segRefY = trunkYScreen;
        }
      } else {
        segRefY = trunkYScreen;
      }

      const d = `M ${px} ${py} ` + pathFn(px, py, qx, qy, ri, i, segRefY, { progressivePower, cornerRadius, bendStyle: isTTB ? 'v-first' : 'h-first' });
      const dstNode = nodeMap.get(q.id);
      const srcDim = srcNode?.dim === true;
      const dstDim = dstNode?.dim === true;
      const segOpacity = (srcDim || dstDim) ? Math.min(opacity, dimOpacity * 0.48) : opacity;
      segments.push({ d, color: segColor, thickness, opacity: segOpacity, dashed: segDashed });
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

    const d = `M ${p.x} ${p.y} ` + pathFn(p.x, p.y, q.x, q.y, extraIdx, 0, refY, { progressivePower, cornerRadius, bendStyle: isTTB ? 'v-first' : 'h-first' });
    const dstNode = nodeMap.get(t);
    const extraDim = srcNode?.dim === true || dstNode?.dim === true;
    const extraOpacity = extraDim ? Math.min(dimOpacity * 0.32, Math.min(0.22 * opBoost, 1)) : Math.min(0.22 * opBoost, 1);
    extraEdges.push({ d, color, thickness: 1.8 * s, opacity: extraOpacity, dashed: srcNode?.cls === 'gate' });
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
    for (const segments of routePaths) {
      for (const seg of segments) {
        seg.d = swapPathXY(seg.d);
      }
    }
    for (const seg of extraEdges) {
      seg.d = swapPathXY(seg.d);
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
      nodeRoutes,
      segmentRoutes,
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
    nodeRoutes,
    segmentRoutes,
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
