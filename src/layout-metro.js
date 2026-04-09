// ================================================================
// layout.js — Shared layout engine for dag-map
// ================================================================
// Topological sort, route extraction via greedy longest-path,
// Y-position assignment with occupancy tracking, node positioning,
// and route/extra-edge path building with pluggable routing.
//
// The pipeline is decomposed into swappable strategy slots:
//   1. assignLayers     (shared — topoSortAndRank)
//   2. extractRoutes    (strategy: default)
//   3. orderNodes       (strategy: none — slot for M-EVOLVE-02)
//   4. reduceCrossings  (strategy: none — slot for M-EVOLVE-02)
//   5. assignLanes      (strategy: default)
//   6. refineCoordinates(strategy: none — slot for M-EVOLVE-03)
//   7. buildRoutePaths  (inline — uses pluggable routing fn)

import { bezierPath } from './route-bezier.js';
import { angularPath } from './route-angular.js';
import { metroPath } from './route-metro.js';
import { resolveTheme } from './themes.js';
import { assertValidDag, buildGraph, topoSortAndRank, swapPathXY } from './graph-utils.js';
import { resolveStrategies } from './strategies/index.js';

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
 * @param {object} [options.strategies] - strategy overrides per pipeline slot
 * @returns {object} { positions, routePaths, extraEdges, width, height, routes, ... }
 */
export function layoutMetro(dag, options = {}) {
  const routing = options.routing || 'bezier';
  const direction = options.direction || 'ltr';
  const isTTB = direction === 'ttb';
  const theme = resolveTheme(options.theme);
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

  const { nodes, edges } = dag;
  assertValidDag(nodes, edges, 'layoutMetro');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // Resolve strategies
  const strats = resolveStrategies(options);

  // ── STEP 1: Topological sort + layer assignment ──
  const { topo, rank: layer, maxRank: maxLayer } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // ── STEP 2: Extract routes (strategy) ──
  const routeResult = strats.extractRoutes({
    nodes, topo, childrenOf, parentsOf, nodeMap, options,
  });
  const { routes, nodeRoute, nodeRoutes, segmentRoutes, hasProvidedRoutes } = routeResult;

  // ── STEP 3: Order nodes within layers (strategy — no-op by default) ──
  const strategyConfig = options.strategyConfig || {};
  strats.orderNodes({ nodes, childrenOf, parentsOf, layer, maxLayer, config: strategyConfig });

  // ── STEP 4: Reduce crossings (strategy — no-op by default) ──
  strats.reduceCrossings({ nodes, childrenOf, parentsOf, layer, maxLayer, config: strategyConfig });

  // ── STEP 5: Assign Y positions (strategy) ──
  const lineGap = (options.lineGap ?? (hasProvidedRoutes && routes.length > 1 ? 5 : 0)) * s;

  const laneResult = strats.assignLanes({
    routes, layer, nodeRoute, nodeMap, hasProvidedRoutes,
    config: { TRUNK_Y, MAIN_SPACING, SUB_SPACING, maxLanes },
  });
  const { routeY } = laneResult;

  // ── STEP 6: Position nodes ──
  const margin = { top: 0, left: 50 * s, bottom: 0, right: 40 * s };

  const nodeYDirect = new Map();
  nodes.forEach(nd => {
    const ri = nodeRoute.get(nd.id);
    nodeYDirect.set(nd.id, (ri !== undefined) ? routeY.get(ri) : TRUNK_Y);
  });

  let minY = Infinity, maxY = -Infinity;
  nodes.forEach(nd => {
    const y = nodeYDirect.get(nd.id);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

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

  // ── STEP 6b: Refine coordinates (strategy — no-op by default) ──
  strats.refineCoordinates({ nodes, positions, childrenOf, parentsOf });

  // Compute screen Y for each route (after topPad/minY shift)
  const routeYScreen = new Map();
  for (const [ri, y] of routeY.entries()) {
    routeYScreen.set(ri, topPad + (y - minY));
  }
  const trunkYScreen = topPad + (TRUNK_Y - minY);

  // ── STEP 7: Build route paths ──
  const pathFn = routing === 'metro' ? metroPath : routing === 'bezier' ? bezierPath : angularPath;
  const opBoost = theme.lineOpacity ?? 1.0;

  const routePaths = routes.map((route, ri) => {
    const pts = route.nodes.map(id => ({ ...positions.get(id), id }));
    const ownNodes = route.nodes.filter(id => nodeRoute.get(id) === ri);

    const routeCls = route.cls || dominantClass(ownNodes, nodeMap);
    const color = classColor[routeCls] || classColor.pure || Object.values(classColor)[0];

    let thickness, opacity;
    if (hasProvidedRoutes) {
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

    const nodeOffsetY = new Map();
    for (const id of route.nodes) {
      const nr = nodeRoutes.get(id);
      if (nr && nr.size > 1) {
        const allRoutes = [...nr].sort((a, b) => a - b);
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
      const offPy = nodeOffsetY.get(p.id) || 0;
      const offQy = nodeOffsetY.get(q.id) || 0;
      const px = p.x, py = p.y + offPy;
      const qx = q.x, qy = q.y + offQy;

      const srcNode = nodeMap.get(p.id);
      const segColor = hasProvidedRoutes ? color : (classColor[srcNode?.cls] || color);
      const segDashed = srcNode?.cls === 'gate' || route.cls === 'gate';

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

  // ── STEP 8: Extra edges (cross-route connections) ──
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
    const refY = trunkYScreen;
    const d = `M ${p.x} ${p.y} ` + pathFn(p.x, p.y, q.x, q.y, extraIdx, 0, refY, { progressivePower, cornerRadius, bendStyle: isTTB ? 'v-first' : 'h-first' });
    const dstNode = nodeMap.get(t);
    const extraDim = srcNode?.dim === true || dstNode?.dim === true;
    const extraOpacity = extraDim ? Math.min(dimOpacity * 0.32, Math.min(0.22 * opBoost, 1)) : Math.min(0.22 * opBoost, 1);
    extraEdges.push({ d, color, thickness: 1.8 * s, opacity: extraOpacity, dashed: srcNode?.cls === 'gate' });
  });

  const nodeLane = new Map();
  nodes.forEach(nd => {
    const ri = nodeRoute.get(nd.id);
    nodeLane.set(nd.id, ri !== undefined ? routes[ri].lane : 0);
  });

  if (direction === 'ttb') {
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.y, y: pos.x });
    }
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
