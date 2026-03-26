// ================================================================
// layout-lanes.js — Lane-based DAG layout (Celonis-style)
// ================================================================
// Each route gets its own X-lane (column). Nodes sit at the
// intersection of their route's lane and their topological layer.
// Bends happen in the gaps between layers, never at stations.
//
// This layout is designed for consumer-provided routes where
// routes represent entity types / flow classes.

import { resolveTheme } from './themes.js';
import { metroPath } from './route-metro.js';
import { bezierPath } from './route-bezier.js';

/**
 * Lane-based layout for DAGs with consumer-provided routes.
 *
 * @param {object} dag - { nodes: [{id, label, cls}], edges: [[from, to]] }
 * @param {object} [options]
 * @param {Array} options.routes - required: [{id, cls, nodes: [nodeId...]}]
 * @param {string|object} [options.theme='dark']
 * @param {number} [options.scale=1.5]
 * @param {number} [options.layerSpacing=60] - vertical gap between layers
 * @param {number} [options.laneSpacing=40] - horizontal gap between route lanes
 * @param {number} [options.cornerRadius=6] - rounded elbow radius
 * @param {'metro'|'bezier'} [options.routing='metro']
 * @returns {object} layout result compatible with renderSVG
 */
export function layoutLanes(dag, options = {}) {
  const { nodes, edges } = dag;
  const theme = resolveTheme(options.theme);
  const s = options.scale ?? 1.5;
  const layerSpacing = (options.layerSpacing ?? 60) * s;
  const laneSpacing = (options.laneSpacing ?? 40) * s;
  const cornerRadius = (options.cornerRadius ?? 6) * s;
  const routing = options.routing ?? 'metro';
  const routes = options.routes || [];
  const lineThickness = (options.lineThickness ?? 3) * s;
  const lineOpacity = Math.min((theme.lineOpacity ?? 1.0) * 0.7, 1);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build classColor from theme
  const classColor = {};
  for (const [cls, hex] of Object.entries(theme.classes)) {
    classColor[cls] = hex;
  }

  // ── STEP 1: Topological sort ──
  const childrenOf = new Map(), parentsOf = new Map();
  nodes.forEach(n => { childrenOf.set(n.id, []); parentsOf.set(n.id, []); });
  edges.forEach(([f, t]) => { childrenOf.get(f).push(t); parentsOf.get(t).push(f); });

  const topo = [];
  const inDeg = new Map();
  nodes.forEach(n => inDeg.set(n.id, 0));
  edges.forEach(([, t]) => inDeg.set(t, inDeg.get(t) + 1));
  const queue = [];
  nodes.forEach(n => { if (inDeg.get(n.id) === 0) queue.push(n.id); });
  while (queue.length > 0) {
    const u = queue.shift();
    topo.push(u);
    for (const v of childrenOf.get(u)) {
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }

  // ── STEP 2: Layer assignment (longest-path from sources) ──
  const layer = new Map();
  topo.forEach(id => {
    const parents = parentsOf.get(id);
    if (parents.length === 0) {
      layer.set(id, 0);
    } else {
      layer.set(id, Math.max(...parents.map(p => layer.get(p))) + 1);
    }
  });

  const maxLayer = Math.max(...[...layer.values()], 0);

  // ── STEP 3: Build route membership ──
  const nodeRoute = new Map();  // node → primary route index
  const nodeRoutes = new Map(); // node → Set of route indices
  nodes.forEach(n => nodeRoutes.set(n.id, new Set()));

  routes.forEach((route, ri) => {
    route.nodes.forEach(id => {
      nodeRoutes.get(id)?.add(ri);
      if (!nodeRoute.has(id)) nodeRoute.set(id, ri);
    });
  });

  // ── STEP 4: Assign X-lanes to routes ──
  // Each route gets its own X column. Center the lanes around 0.
  const nRoutes = routes.length;
  const routeLaneX = routes.map((_, ri) => {
    return (ri - (nRoutes - 1) / 2) * laneSpacing;
  });

  // ── STEP 5: Position nodes ──
  const margin = { top: 50 * s, left: 60 * s, bottom: 40 * s, right: 60 * s };
  const positions = new Map();

  // For each node, compute X based on which routes it belongs to
  nodes.forEach(nd => {
    const memberRoutes = nodeRoutes.get(nd.id);
    const ly = layer.get(nd.id);

    let x;
    if (memberRoutes.size === 0) {
      // Orphan node — place at center
      x = 0;
    } else if (memberRoutes.size === 1) {
      // Single-route node — place in that route's lane
      const ri = [...memberRoutes][0];
      x = routeLaneX[ri];
    } else {
      // Multi-route node — place at centroid of its routes' lanes
      const laneXs = [...memberRoutes].map(ri => routeLaneX[ri]);
      x = laneXs.reduce((a, b) => a + b, 0) / laneXs.length;
    }

    const y = ly * layerSpacing;
    positions.set(nd.id, { x, y });
  });

  // ── STEP 6: Normalize positions (shift to positive space + margins) ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  });

  positions.forEach(pos => {
    pos.x = pos.x - minX + margin.left;
    pos.y = pos.y - minY + margin.top;
  });

  const width = (maxX - minX) + margin.left + margin.right;
  const height = (maxY - minY) + margin.top + margin.bottom;

  // ── STEP 7: Build route paths ──
  // Each route draws through its nodes. For shared nodes (multi-route),
  // the line passes through the node's position BUT offset to its own lane X.
  const pathFn = routing === 'metro' ? metroPath : bezierPath;

  // Compute segment routes for data enrichment
  const segmentRoutes = new Map();
  routes.forEach((route, ri) => {
    for (let i = 1; i < route.nodes.length; i++) {
      const key = `${route.nodes[i - 1]}\u2192${route.nodes[i]}`;
      if (!segmentRoutes.has(key)) segmentRoutes.set(key, []);
      segmentRoutes.get(key).push(ri);
    }
  });

  const routePaths = routes.map((route, ri) => {
    const color = classColor[route.cls] || Object.values(classColor)[0];
    const laneX = routeLaneX[ri];

    // Build waypoints: for each node in the route, use the node's Y
    // but the route's own lane X. This keeps lines straight in their lane.
    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      const memberRoutes = nodeRoutes.get(id);

      let wx;
      if (memberRoutes.size <= 1) {
        // Single-route node — line goes through node center
        wx = pos.x;
      } else {
        // Multi-route node — line passes at its own lane X, adjusted to node center
        // The line should hit the node position but at its lane offset within the station
        const routeList = [...memberRoutes].sort((a, b) => a - b);
        const idx = routeList.indexOf(ri);
        const n = routeList.length;
        const stationWidth = (n - 1) * laneSpacing * 0.3; // compact station
        wx = pos.x + (idx - (n - 1) / 2) * laneSpacing * 0.3;
      }

      return { id, x: wx, y: pos.y };
    }).filter(Boolean);

    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} ` +
        pathFn(p.x, p.y, q.x, q.y, ri, i, 0, { cornerRadius, bendStyle: 'v-first' });
      segments.push({
        d,
        color,
        thickness: lineThickness,
        opacity: lineOpacity,
        dashed: false,
      });
    }
    return segments;
  });

  // ── STEP 8: Extra edges (not covered by any route) ──
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
    const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} ` +
      pathFn(p.x, p.y, q.x, q.y, 999, 0, 0, { cornerRadius, bendStyle: 'v-first' });
    extraEdges.push({
      d,
      color: theme.muted,
      thickness: 1.5 * s,
      opacity: 0.3,
      dashed: true,
    });
  });

  return {
    positions,
    routePaths,
    extraEdges,
    width,
    height,
    routes,
    nodeRoute,
    nodeRoutes,
    scale: s,
    theme,
    orientation: 'ttb',
    minY: margin.top,
    maxY: margin.top + maxLayer * layerSpacing,
  };
}
