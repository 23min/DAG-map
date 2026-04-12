// ================================================================
// layout-flow-v2.js — Process flow layout engine (Mode 2)
// ================================================================
//
// Shared-spine model: routes share the trunk's axis and deviate
// only at divergence points. Each route gets a fixed side (left/right
// of trunk) maintained at every node. Compact dot spacing at shared
// stations. H-V-H routing with rounded corners.
//
// Based on Legacy layoutFlow's proven layout model, rebuilt with:
// - Clean, documented code
// - GA-evolvable parameters
// - Crossing minimization (future: FV2-3)
// - Dedicated renderer (renderFlowV2)

import { assertValidDag, buildGraph, topoSortAndRank } from './graph-utils.js';
import { resolveTheme } from './themes.js';

/**
 * @param {object} dag - { nodes, edges }
 * @param {object} options
 * @param {Array} options.routes - required: [{id, cls, nodes}]
 * @param {number} [options.scale=1.5]
 * @param {number} [options.layerSpacing=55] - X distance between layers
 * @param {number} [options.dotSpacing=12] - Y offset between parallel routes at shared nodes
 * @param {number} [options.cornerRadius=6] - H-V-H corner radius
 * @param {'ltr'|'ttb'} [options.direction='ltr']
 */
export function layoutFlowV2(dag, options = {}) {
  const { nodes, edges } = dag;
  const routes = options.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('layoutFlowV2: routes is required');
  }

  const theme = resolveTheme(options.theme);
  const s = options.scale ?? 1.5;
  const layerSpacing = (options.layerSpacing ?? 55) * s;
  const dotSpacing = (options.dotSpacing ?? 12) * s;
  const cornerRadius = (options.cornerRadius ?? 6) * s;
  const margin = { left: 40 * s, right: 40 * s, top: 30 * s, bottom: 30 * s };

  assertValidDag(nodes, edges, 'layoutFlowV2');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // ── Phase 1: Topo sort + layer assignment ──
  const { topo, rank: layer, maxRank: maxLayer } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // ── Phase 2: Route analysis ──
  const nodeRoute = new Map();
  const nodeRoutes = new Map();
  nodes.forEach(nd => nodeRoutes.set(nd.id, new Set()));

  for (let ri = 0; ri < routes.length; ri++) {
    for (const nodeId of routes[ri].nodes) {
      if (!nodeRoute.has(nodeId)) nodeRoute.set(nodeId, ri);
      nodeRoutes.get(nodeId)?.add(ri);
    }
  }
  nodes.forEach(nd => {
    if (!nodeRoute.has(nd.id)) nodeRoute.set(nd.id, 0);
  });

  // ── Phase 3: Trunk + global side assignment ──
  let trunkRi = 0;
  for (let ri = 1; ri < routes.length; ri++) {
    if (routes[ri].nodes.length > routes[trunkRi].nodes.length) trunkRi = ri;
  }
  const trunkNodeSet = new Set(routes[trunkRi].nodes);
  const SPINE_Y = 100 * s;

  // Assign sides: alternate left/right for balance
  const routeSide = new Map();
  routeSide.set(trunkRi, 0);
  let leftCount = 0, rightCount = 0;
  for (let ri = 0; ri < routes.length; ri++) {
    if (ri === trunkRi) continue;
    if (leftCount <= rightCount) {
      routeSide.set(ri, -1); leftCount++;
    } else {
      routeSide.set(ri, 1); rightCount++;
    }
  }

  // Sort key for consistent dot ordering
  const routeSortKey = new Map();
  const left = [...routeSide.entries()].filter(([, s]) => s < 0).map(([ri]) => ri).sort((a, b) => a - b);
  const right = [...routeSide.entries()].filter(([, s]) => s > 0).map(([ri]) => ri).sort((a, b) => a - b);
  left.forEach((ri, i) => routeSortKey.set(ri, -(left.length - i)));
  routeSortKey.set(trunkRi, 0);
  right.forEach((ri, i) => routeSortKey.set(ri, i + 1));

  // ── Phase 4: Dot positions at shared nodes ──
  // At each node, compute per-route Y position.
  // Trunk at center, others offset by routeSortKey × dotSpacing.
  const dotPositions = new Map(); // "nodeId:routeIdx" → {x, y}

  for (const nd of nodes) {
    const x = margin.left + layer.get(nd.id) * layerSpacing;
    const nRoutes = nodeRoutes.get(nd.id);
    const sorted = nRoutes ? [...nRoutes].sort((a, b) => (routeSortKey.get(a) ?? 0) - (routeSortKey.get(b) ?? 0)) : [];

    if (sorted.length <= 1) {
      // Single route — place at spine or offset by route side
      const ri = nodeRoute.get(nd.id);
      const side = routeSortKey.get(ri) ?? 0;
      dotPositions.set(`${nd.id}:${ri}`, { x, y: SPINE_Y + side * dotSpacing * 2 });
    } else {
      // Multiple routes — spread by dotSpacing, trunk at center
      const trunkIdx = sorted.indexOf(trunkRi);
      const anchor = trunkIdx >= 0 ? trunkIdx : Math.floor(sorted.length / 2);
      for (let i = 0; i < sorted.length; i++) {
        dotPositions.set(`${nd.id}:${sorted[i]}`, { x, y: SPINE_Y + (i - anchor) * dotSpacing });
      }
    }
  }

  // ── Phase 5: Node positions (for rendering stations) ──
  // Each node's "primary" position = its primary route's dot position
  const positions = new Map();
  for (const nd of nodes) {
    const ri = nodeRoute.get(nd.id);
    const dp = dotPositions.get(`${nd.id}:${ri}`);
    positions.set(nd.id, dp || { x: margin.left + layer.get(nd.id) * layerSpacing, y: SPINE_Y });
  }

  // Shift everything so min Y = margin.top
  let minY = Infinity, maxY = -Infinity;
  for (const [, pos] of dotPositions) {
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  }
  const shiftY = margin.top - minY + 10 * s;
  for (const [key, pos] of dotPositions) dotPositions.set(key, { x: pos.x, y: pos.y + shiftY });
  for (const [id, pos] of positions) positions.set(id, { x: pos.x, y: pos.y + shiftY });

  const width = margin.left + (maxLayer + 1) * layerSpacing + margin.right;
  const height = (maxY - minY) + margin.top + margin.bottom + 40 * s;

  // ── Phase 6: Edge routing (H-V-H) using dot positions ──
  const classColor = { ...theme.classes };
  const opBoost = theme.lineOpacity ?? 1.0;

  const routePaths = routes.map((route, ri) => {
    const color = classColor[route.cls] || classColor.pure || Object.values(classColor)[0] || '#268bd2';
    const thickness = ri === trunkRi ? 3.5 * s : 2.5 * s;
    const opacity = Math.min((ri === trunkRi ? 0.6 : 0.45) * opBoost, 1);

    const segments = [];
    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const p = dotPositions.get(`${fromId}:${ri}`) || positions.get(fromId);
      const q = dotPositions.get(`${toId}:${ri}`) || positions.get(toId);
      if (!p || !q) continue;

      const dx = q.x - p.x, dy = q.y - p.y;
      let d;
      if (Math.abs(dy) < 0.5) {
        d = `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
      } else {
        const midX = p.x + dx / 2;
        const r = Math.min(cornerRadius, Math.abs(dx) / 4, Math.abs(dy) / 2);
        const sy = dy > 0 ? 1 : -1;
        d = `M ${p.x} ${p.y} L ${midX - r} ${p.y} Q ${midX} ${p.y}, ${midX} ${p.y + sy * r} L ${midX} ${q.y - sy * r} Q ${midX} ${q.y}, ${midX + r} ${q.y} L ${q.x} ${q.y}`;
      }
      segments.push({ d, color, thickness, opacity, dashed: false });
    }
    return segments;
  });

  // ── Extra edges ──
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
    const dx = q.x - p.x, dy = q.y - p.y;
    let d;
    if (Math.abs(dy) < 0.5) {
      d = `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
    } else {
      const midX = p.x + dx / 2;
      const r = Math.min(cornerRadius, Math.abs(dx) / 4, Math.abs(dy) / 2);
      const sy = dy > 0 ? 1 : -1;
      d = `M ${p.x} ${p.y} L ${midX - r} ${p.y} Q ${midX} ${p.y}, ${midX} ${p.y + sy * r} L ${midX} ${q.y - sy * r} Q ${midX} ${q.y}, ${midX + r} ${q.y} L ${q.x} ${q.y}`;
    }
    extraEdges.push({ d, color: '#999', thickness: 1.2 * s, opacity: 0.2, dashed: true });
  });

  return {
    positions, routePaths, extraEdges, width, height,
    routes, nodeRoute, nodeRoutes, maxLayer,
    dotPositions, dotSpacing, routeSide, routeSortKey, trunkRi,
    laneDividers: [], laneHeight: dotSpacing * 3,
    layerSpacing, scale: s, theme,
    routeYScreen: new Map(routes.map((_, i) => [i, SPINE_Y + shiftY + (routeSortKey.get(i) ?? 0) * dotSpacing])),
    trunkYScreen: SPINE_Y + shiftY,
    minY: margin.top, maxY: margin.top + height,
    laneSpacing: dotSpacing, lineGap: dotSpacing,
    globalRouteOffset: new Map(routes.map((_, i) => [i, (routeSortKey.get(i) ?? 0) * dotSpacing])),
    trackAssignment: new Map(),
    segmentRoutes: new Map(),
    nodeLane: nodeRoute,
  };
}
