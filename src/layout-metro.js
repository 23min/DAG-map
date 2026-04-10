// ================================================================
// layout-metro.js — Metro-map layout engine for dag-map
// ================================================================
//
// Pipeline (routes decoupled from layout):
//   1. Topological sort + layer assignment
//   2. Order nodes within layers (strategy)
//   3. Reduce crossings (strategy)
//   4. Assign Y positions from ordering (NO route dependency)
//   5. Assign X positions (strategy)
//   6. Refine coordinates (strategy)
//   7. Extract routes (AFTER positioning — for rendering only)
//   8. Build route paths + extra edges
//
// Routes are a RENDERING concept, not a layout concept. Node positions
// are computed purely from topology. Routes are discovered afterward
// and used only for visual grouping (colored lines through stations).

import { bezierPath } from './route-bezier.js';
import { angularPath } from './route-angular.js';
import { metroPath } from './route-metro.js';
import { resolveTheme } from './themes.js';
import { assertValidDag, buildGraph, topoSortAndRank, swapPathXY } from './graph-utils.js';
import { resolveStrategies } from './strategies/index.js';
import { buildLayers } from './strategies/crossing-utils.js';

/**
 * Determine the dominant node class among a set of node IDs.
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
 * @param {'bezier'|'angular'|'metro'} [options.routing='bezier']
 * @param {number} [options.scale=1.5]
 * @param {'ltr'|'ttb'} [options.direction='ltr']
 * @param {object} [options.strategies] - strategy overrides
 * @param {Object<string,number>} [options.nodeX] - consumer-provided X positions
 * @param {number[]} [options.layerWeights] - per-layer width multipliers
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
  const MAIN_SPACING = (options.mainSpacing ?? 40) * s;
  const SUB_SPACING = (options.subSpacing ?? 25) * s;
  const layerSpacing = (options.layerSpacing ?? 38) * s;
  const progressivePower = options.progressivePower ?? 2.2;
  const cornerRadius = (options.cornerRadius ?? 8) * s;
  const dimOpacity = options.dimOpacity ?? 0.25;
  const maxLanes = options.maxLanes ?? null;
  const hasProvidedRoutes = !!(options.routes && options.routes.length > 0);
  const strategyConfig = options.strategyConfig || {};

  const { nodes, edges } = dag;
  assertValidDag(nodes, edges, 'layoutMetro');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);
  const strats = resolveStrategies(options);

  // ── STEP 1: Topological sort + layer assignment ──
  const { topo, rank: layer, maxRank: maxLayer } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // ── STEP 2: Order nodes within layers ──
  const orderCtx = { nodes, childrenOf, parentsOf, layer, maxLayer, config: strategyConfig };
  strats.orderNodes(orderCtx);

  // ── STEP 3: Reduce crossings ──
  const crossCtx = { nodes, childrenOf, parentsOf, layer, maxLayer, config: strategyConfig };
  strats.reduceCrossings(crossCtx);

  const nodeOrder = crossCtx.nodeOrder || orderCtx.nodeOrder || null;

  // ── STEP 4: Assign Y positions (from ordering, NO routes) ──
  // Build layers sorted by nodeOrder for Y assignment
  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);
  if (nodeOrder && nodeOrder.size > 0) {
    for (const layerNodes of layers) {
      layerNodes.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    }
  }

  const nodeYDirect = new Map();
  for (const layerNodes of layers) {
    const n = layerNodes.length;
    const totalHeight = (n - 1) * MAIN_SPACING;
    const startY = TRUNK_Y - totalHeight / 2;
    for (let i = 0; i < n; i++) {
      nodeYDirect.set(layerNodes[i], startY + i * MAIN_SPACING);
    }
  }

  // ── STEP 5: Position nodes (X + final Y) ──
  const margin = { top: 0, left: 50 * s, bottom: 0, right: 40 * s };

  let minY = Infinity, maxY = -Infinity;
  nodes.forEach(nd => {
    const y = nodeYDirect.get(nd.id);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const topPad = 50 * s;
  const bottomPad = 80 * s;

  // X positioning via strategy
  const nodeX = strats.positionX({
    nodes, layer, maxLayer, childrenOf, parentsOf,
    config: {
      layerSpacing,
      marginLeft: margin.left,
      minNodeSpacing: 30 * s,
      compactionIterations: Math.round(strategyConfig.compactionIterations ?? 12),
      nodeX: options.nodeX,
      layerWeights: options.layerWeights,
    },
  });

  const positions = new Map();
  nodes.forEach(nd => {
    positions.set(nd.id, {
      x: nodeX.get(nd.id),
      y: topPad + (nodeYDirect.get(nd.id) - minY),
    });
  });

  // ── STEP 6: Refine coordinates ──
  strats.refineCoordinates({ nodes, positions, childrenOf, parentsOf, config: strategyConfig });

  // Recompute bounds after refinement
  let finalMinX = Infinity, finalMaxX = -Infinity;
  let finalMinY = Infinity, finalMaxY = -Infinity;
  for (const [, pos] of positions) {
    if (pos.x < finalMinX) finalMinX = pos.x;
    if (pos.x > finalMaxX) finalMaxX = pos.x;
    if (pos.y < finalMinY) finalMinY = pos.y;
    if (pos.y > finalMaxY) finalMaxY = pos.y;
  }

  const shiftX = finalMinX < margin.left ? margin.left - finalMinX : 0;
  const shiftY = finalMinY < topPad ? topPad - finalMinY : 0;
  if (shiftX > 0 || shiftY > 0) {
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
    }
    finalMaxX += shiftX;
    finalMaxY += shiftY;
  }

  const width = finalMaxX + margin.right;
  const height = finalMaxY + bottomPad;

  // ── STEP 7: Extract routes AFTER positioning (rendering only) ──
  const routeResult = strats.extractRoutes({
    nodes, topo, childrenOf, parentsOf, nodeMap, options,
  });
  const { routes, nodeRoute, nodeRoutes, segmentRoutes } = routeResult;

  const lineGap = (options.lineGap ?? (hasProvidedRoutes && routes.length > 1 ? 5 : 0)) * s;

  // Compute route Y as median of member node positioned Y
  const routeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    const ys = routes[ri].nodes
      .map(id => positions.get(id)?.y)
      .filter(y => y !== undefined)
      .sort((a, b) => a - b);
    routeY.set(ri, ys.length > 0 ? ys[Math.floor(ys.length / 2)] : topPad);
  }

  const routeYScreen = new Map(routeY);
  const trunkYScreen = routeY.get(0) ?? topPad;

  // ── STEP 8: Build route paths ──
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

    // Trunk (route 0) always passes through station center (offset 0).
    // Other routes distribute above/below at shared nodes.
    const nodeOffsetY = new Map();
    for (const id of route.nodes) {
      const nr = nodeRoutes.get(id);
      if (nr && nr.size > 1) {
        const allRoutes = [...nr].sort((a, b) => a - b);
        const nonTrunk = allRoutes.filter(r => r !== 0);
        if (ri === 0) {
          nodeOffsetY.set(id, 0);
        } else {
          const ntIdx = nonTrunk.indexOf(ri);
          const n = nonTrunk.length;
          nodeOffsetY.set(id, (ntIdx - (n - 1) / 2) * lineGap);
        }
      } else {
        nodeOffsetY.set(id, 0);
      }
    }

    // Fan distance for non-trunk routes at shared stations
    const fanDist = (lineGap > 0 && ri !== 0) ? Math.max(12 * s, layerSpacing * 0.15) : 0;

    const segments = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const offPy = nodeOffsetY.get(p.id) || 0;
      const offQy = nodeOffsetY.get(q.id) || 0;

      const srcNode = nodeMap.get(p.id);
      const segColor = hasProvidedRoutes ? color : (classColor[srcNode?.cls] || color);
      const segDashed = srcNode?.cls === 'gate' || route.cls === 'gate';

      let segRefY = trunkYScreen;
      if (routing === 'angular') {
        const srcIsOwn = nodeRoute.get(p.id) === ri;
        const dstIsOwn = nodeRoute.get(q.id) === ri;
        if (!srcIsOwn && dstIsOwn) segRefY = p.y + offPy;
        else if (srcIsOwn && !dstIsOwn) segRefY = q.y + offQy;
      }

      let d;
      if (fanDist > 0 && (offPy !== 0 || offQy !== 0)) {
        const dx = q.x - p.x;
        const fanLen = Math.min(fanDist, dx * 0.25);
        const depX = p.x + fanLen, depY = p.y + offPy;
        const arrX = q.x - fanLen, arrY = q.y + offQy;
        d = `M ${p.x} ${p.y} C ${p.x + fanLen * 0.5} ${p.y}, ${depX - fanLen * 0.3} ${depY}, ${depX} ${depY} `;
        d += pathFn(depX, depY, arrX, arrY, ri, i, segRefY, { progressivePower, cornerRadius, bendStyle: isTTB ? 'v-first' : 'h-first' });
        d += ` C ${arrX + fanLen * 0.3} ${arrY}, ${q.x - fanLen * 0.5} ${q.y}, ${q.x} ${q.y}`;
      } else {
        const px = p.x, py = p.y + offPy;
        const qx = q.x, qy = q.y + offQy;
        d = `M ${px} ${py} ` + pathFn(px, py, qx, qy, ri, i, segRefY, { progressivePower, cornerRadius, bendStyle: isTTB ? 'v-first' : 'h-first' });
      }

      const dstNode = nodeMap.get(q.id);
      const srcDim = srcNode?.dim === true;
      const dstDim = dstNode?.dim === true;
      const segOpacity = (srcDim || dstDim) ? Math.min(opacity, dimOpacity * 0.48) : opacity;
      segments.push({ d, color: segColor, thickness, opacity: segOpacity, dashed: segDashed });
    }
    return segments;
  });

  // ── Extra edges (cross-route connections) ──
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
      for (const seg of segments) seg.d = swapPathXY(seg.d);
    }
    for (const seg of extraEdges) seg.d = swapPathXY(seg.d);

    return {
      positions, routePaths, extraEdges, width: height, height: width,
      maxLayer, routes, nodeLane, nodeRoute, nodeRoutes, segmentRoutes,
      laneSpacing: MAIN_SPACING, layerSpacing, minY, maxY,
      routeYScreen, trunkYScreen, scale: s, theme, orientation: 'ttb',
    };
  }

  return {
    positions, routePaths, extraEdges, width, height,
    maxLayer, routes, nodeLane, nodeRoute, nodeRoutes, segmentRoutes,
    laneSpacing: MAIN_SPACING, layerSpacing, minY, maxY,
    routeYScreen, trunkYScreen, scale: s, theme,
  };
}
