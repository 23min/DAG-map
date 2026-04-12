// ================================================================
// layout-flow-v2.js — Process flow layout engine (Mode 2)
// ================================================================
//
// Swimlane-based process flow layout. Each route gets its own
// horizontal lane. Nodes are placed at topological X × lane Y.
// Edges use H-V-H routing with rounded corners.
//
// FV2-1: Basic pipeline — topo sort, lanes, H-V-H routing, dot stations.
//
// Pipeline:
//   1. Topo sort + layer assignment
//   2. Route analysis: membership, lane assignment
//   3. Node positioning: X from layer, Y from lane
//   4. Edge routing: H-V-H between nodes
//   5. Output: positions, edges, dimensions

import { assertValidDag, buildGraph, topoSortAndRank } from './graph-utils.js';
import { resolveTheme } from './themes.js';

/**
 * @param {object} dag - { nodes, edges }
 * @param {object} options
 * @param {Array} options.routes - required: [{id, cls, nodes}]
 * @param {number} [options.scale=1.5]
 * @param {number} [options.layerSpacing=55] - horizontal distance between layers
 * @param {number} [options.laneHeight=70] - vertical distance between lanes
 * @param {number} [options.cornerRadius=6] - H-V-H corner radius
 * @param {'ltr'|'ttb'} [options.direction='ltr']
 * @param {string} [options.theme='cream']
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
  const laneHeight = (options.laneHeight ?? 70) * s;
  const cornerRadius = (options.cornerRadius ?? 6) * s;
  const margin = { left: 40 * s, right: 40 * s, top: 30 * s, bottom: 30 * s };

  assertValidDag(nodes, edges, 'layoutFlowV2');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // ── Phase 1: Topo sort + layer assignment ──
  const { topo, rank: layer, maxRank: maxLayer } = topoSortAndRank(nodes, childrenOf, parentsOf);

  // ── Phase 2: Route analysis ──
  // Build node → primary route, node → all routes
  const nodeRoute = new Map();
  const nodeRoutes = new Map();
  nodes.forEach(nd => nodeRoutes.set(nd.id, new Set()));

  for (let ri = 0; ri < routes.length; ri++) {
    for (const nodeId of routes[ri].nodes) {
      if (!nodeRoute.has(nodeId)) nodeRoute.set(nodeId, ri);
      nodeRoutes.get(nodeId)?.add(ri);
    }
  }
  // Assign unrouted nodes to route 0
  nodes.forEach(nd => {
    if (!nodeRoute.has(nd.id)) nodeRoute.set(nd.id, 0);
  });

  // ── Phase 3: Node positioning ──
  // X = layer × layerSpacing
  // Y = primary route lane × laneHeight
  const positions = new Map();
  nodes.forEach(nd => {
    const x = margin.left + layer.get(nd.id) * layerSpacing;
    const ri = nodeRoute.get(nd.id);
    const y = margin.top + ri * laneHeight;
    positions.set(nd.id, { x, y });
  });

  const width = margin.left + (maxLayer + 1) * layerSpacing + margin.right;
  const height = margin.top + routes.length * laneHeight + margin.bottom;

  // ── Phase 4: Edge routing (H-V-H) ──
  // For each route, build segments between consecutive nodes.
  // If source and target are on the same Y → straight horizontal.
  // If different Y → H-V-H with rounded corners.
  const classColor = { ...theme.classes };
  const opBoost = theme.lineOpacity ?? 1.0;

  const routePaths = routes.map((route, ri) => {
    const color = classColor[route.cls] || classColor.pure || Object.values(classColor)[0] || '#268bd2';
    const thickness = ri === 0 ? 3.5 * s : 2.5 * s;
    const opacity = Math.min((ri === 0 ? 0.6 : 0.45) * opBoost, 1);

    const segments = [];
    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const p = positions.get(fromId), q = positions.get(toId);
      if (!p || !q) continue;

      let d;
      const dx = q.x - p.x;
      const dy = q.y - p.y;

      if (Math.abs(dy) < 0.5) {
        // Same lane — straight horizontal
        d = `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
      } else {
        // Different lanes — H-V-H with rounded corners
        const midX = p.x + dx / 2;
        const r = Math.min(cornerRadius, Math.abs(dx) / 4, Math.abs(dy) / 2);
        const sy = dy > 0 ? 1 : -1; // direction of vertical segment

        d = `M ${p.x} ${p.y}`;
        // Horizontal to just before the turn
        d += ` L ${midX - r} ${p.y}`;
        // First rounded corner
        d += ` Q ${midX} ${p.y}, ${midX} ${p.y + sy * r}`;
        // Vertical segment
        d += ` L ${midX} ${q.y - sy * r}`;
        // Second rounded corner
        d += ` Q ${midX} ${q.y}, ${midX + r} ${q.y}`;
        // Horizontal to destination
        d += ` L ${q.x} ${q.y}`;
      }

      segments.push({ d, color, thickness, opacity, dashed: false });
    }
    return segments;
  });

  // ── Extra edges (DAG edges not in any route) ──
  const routeEdgeSet = new Set();
  routes.forEach(route => {
    for (let i = 1; i < route.nodes.length; i++) {
      routeEdgeSet.add(`${route.nodes[i - 1]}\u2192${route.nodes[i]}`);
    }
  });

  const extraEdges = [];
  edges.forEach(([f, t]) => {
    if (routeEdgeSet.has(`${f}\u2192${t}`)) return;
    const p = positions.get(f), q = positions.get(t);
    if (!p || !q) return;
    const dx = q.x - p.x, dy = q.y - p.y;
    const midX = p.x + dx / 2;
    const r = Math.min(cornerRadius, Math.abs(dx) / 4, Math.abs(dy) / 2);
    const sy = dy > 0 ? 1 : -1;

    let d;
    if (Math.abs(dy) < 0.5) {
      d = `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
    } else {
      d = `M ${p.x} ${p.y} L ${midX - r} ${p.y}`;
      d += ` Q ${midX} ${p.y}, ${midX} ${p.y + sy * r}`;
      d += ` L ${midX} ${q.y - sy * r}`;
      d += ` Q ${midX} ${q.y}, ${midX + r} ${q.y}`;
      d += ` L ${q.x} ${q.y}`;
    }

    extraEdges.push({ d, color: '#999', thickness: 1.2 * s, opacity: 0.2, dashed: true });
  });

  // ── Lane dividers ──
  const laneDividers = [];
  for (let ri = 0; ri < routes.length; ri++) {
    const y = margin.top + ri * laneHeight - laneHeight / 2;
    if (ri > 0) {
      laneDividers.push({ y, width });
    }
  }

  return {
    positions,
    routePaths,
    extraEdges,
    width,
    height,
    routes,
    nodeRoute,
    nodeRoutes,
    maxLayer,
    laneDividers,
    laneHeight,
    layerSpacing,
    scale: s,
    theme,
    // Compatibility with renderSVG
    segmentRoutes: new Map(),
    nodeLane: nodeRoute,
    routeYScreen: new Map(routes.map((_, i) => [i, margin.top + i * laneHeight])),
    trunkYScreen: margin.top,
    minY: margin.top,
    maxY: margin.top + (routes.length - 1) * laneHeight,
    laneSpacing: laneHeight,
    lineGap: 0,
    globalRouteOffset: new Map(routes.map((_, i) => [i, 0])),
    trackAssignment: new Map(),
  };
}
