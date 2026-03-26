// ================================================================
// layout-process.js — Process-map layout (Celonis-style)
// ================================================================
//
// KEY INSIGHT: Object types are NOT lanes. Activity CLUSTERS are lanes.
//
// Layout rules derived from Celonis Process Explorer:
//
// 1. Group activities by their PRIMARY object type → each group forms
//    a vertical column (cluster).
// 2. Order columns left-to-right by topological depth or frequency.
// 3. Within each column, activities are ordered top-to-bottom by layer.
// 4. Single-type chains are straight vertical lines — no bends.
// 5. Lines bend (V-H-V) only when transitioning between columns.
// 6. Source/sink "object" nodes sit at the edges of their type's column.
// 7. Station cards are rendered at the activity position.
//
// Input:
//   - dag: { nodes, edges } — standard dag-map input
//   - options.routes — object types as routes [{id, cls, nodes}]
//
// Each node's "primary" object type is the route that contributes the
// most edges to/from it, or the first route if tied.

import { resolveTheme } from './themes.js';
import { metroPath } from './route-metro.js';
import { bezierPath } from './route-bezier.js';

export function layoutProcess(dag, options = {}) {
  const { nodes, edges } = dag;
  const theme = resolveTheme(options.theme);
  const s = options.scale ?? 1.5;
  const layerSpacing = (options.layerSpacing ?? 55) * s;
  const columnSpacing = (options.columnSpacing ?? 90) * s;
  const dotSpacing = (options.dotSpacing ?? 12) * s;
  const cornerRadius = (options.cornerRadius ?? 5) * s;
  const routing = options.routing ?? 'metro';
  const routes = options.routes || [];
  const lineThickness = (options.lineThickness ?? 3) * s;
  const lineOpacity = Math.min((theme.lineOpacity ?? 1.0) * 0.7, 1);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const classColor = {};
  for (const [cls, hex] of Object.entries(theme.classes)) classColor[cls] = hex;

  // ── STEP 1: Topological sort + layer assignment ──
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

  const layer = new Map();
  topo.forEach(id => {
    const parents = parentsOf.get(id);
    layer.set(id, parents.length === 0 ? 0 : Math.max(...parents.map(p => layer.get(p))) + 1);
  });

  // ── STEP 2: Route membership ──
  const nodeRoutes = new Map();
  nodes.forEach(n => nodeRoutes.set(n.id, new Set()));
  routes.forEach((route, ri) => {
    route.nodes.forEach(id => nodeRoutes.get(id)?.add(ri));
  });

  // ── STEP 3: Determine primary object type per node ──
  // Primary = the route that has the most edges involving this node.
  // Ties broken by lowest route index.
  const nodePrimary = new Map();
  nodes.forEach(nd => {
    const memberRoutes = nodeRoutes.get(nd.id);
    if (memberRoutes.size === 0) {
      nodePrimary.set(nd.id, 0);
      return;
    }
    if (memberRoutes.size === 1) {
      nodePrimary.set(nd.id, [...memberRoutes][0]);
      return;
    }

    // Count edges per route for this node
    const routeEdgeCount = new Map();
    memberRoutes.forEach(ri => routeEdgeCount.set(ri, 0));
    routes.forEach((route, ri) => {
      if (!memberRoutes.has(ri)) return;
      const nodeIdx = route.nodes.indexOf(nd.id);
      if (nodeIdx >= 0) {
        // Count edges: predecessor and successor in route
        let count = 0;
        if (nodeIdx > 0) count++;
        if (nodeIdx < route.nodes.length - 1) count++;
        routeEdgeCount.set(ri, (routeEdgeCount.get(ri) || 0) + count);
      }
    });

    // Pick highest count, lowest index for ties
    let bestRi = [...memberRoutes][0], bestCount = -1;
    for (const [ri, count] of routeEdgeCount) {
      if (count > bestCount || (count === bestCount && ri < bestRi)) {
        bestRi = ri;
        bestCount = count;
      }
    }
    nodePrimary.set(nd.id, bestRi);
  });

  // ── STEP 4: Group nodes into columns by primary type ──
  // Column order = route order (consumer controls this)
  const columns = routes.map(() => []);
  nodes.forEach(nd => {
    const pri = nodePrimary.get(nd.id);
    columns[pri].push(nd.id);
  });

  // Sort each column by layer
  columns.forEach(col => col.sort((a, b) => layer.get(a) - layer.get(b)));

  // ── STEP 5: Assign X per column, Y per layer ──
  // Active columns only (skip empty)
  const activeColumns = [];
  columns.forEach((col, ri) => {
    if (col.length > 0) activeColumns.push({ ri, nodes: col });
  });

  const nCols = activeColumns.length;
  const columnX = new Map();
  activeColumns.forEach((col, ci) => {
    const x = (ci - (nCols - 1) / 2) * columnSpacing;
    columnX.set(col.ri, x);
  });

  const positions = new Map();
  nodes.forEach(nd => {
    const pri = nodePrimary.get(nd.id);
    const x = columnX.get(pri) ?? 0;
    const y = layer.get(nd.id) * layerSpacing;
    positions.set(nd.id, { x, y });
  });

  // ── STEP 6: Normalize ──
  const margin = { top: 50 * s, left: 80 * s, bottom: 40 * s, right: 100 * s };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  });
  const xShift = -minX + margin.left;
  positions.forEach(pos => {
    pos.x += xShift;
    pos.y = pos.y - minY + margin.top;
  });

  // Shifted column X for dot positioning
  const shiftedColumnX = new Map();
  for (const [ri, x] of columnX) shiftedColumnX.set(ri, x + xShift);

  const width = (maxX - minX) + margin.left + margin.right;
  const height = (maxY - minY) + margin.top + margin.bottom;

  // ── STEP 7: Build route paths ──
  const pathFn = routing === 'metro' ? metroPath : bezierPath;
  const nodeRoute = new Map();
  nodes.forEach(nd => nodeRoute.set(nd.id, nodePrimary.get(nd.id)));

  const routePaths = routes.map((route, ri) => {
    const color = classColor[route.cls] || Object.values(classColor)[0];

    // Waypoints: for each node in this route, the line passes through
    // the node's position but at this route's dot slot within the station.
    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      const memberRoutes = nodeRoutes.get(id);

      let wx;
      if (memberRoutes.size <= 1) {
        wx = pos.x;
      } else {
        // Dot position: route's column X relative to node position
        // This creates the horizontal spread within multi-type stations
        const memberList = [...memberRoutes].sort((a, b) => a - b);
        const idx = memberList.indexOf(ri);
        const n = memberList.length;
        wx = pos.x + (idx - (n - 1) / 2) * dotSpacing;
      }

      return { id, x: wx, y: pos.y };
    }).filter(Boolean);

    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} ` +
        pathFn(p.x, p.y, q.x, q.y, ri, i, 0, { cornerRadius, bendStyle: 'v-first' });
      segments.push({ d, color, thickness: lineThickness, opacity: lineOpacity, dashed: false });
    }
    return segments;
  });

  // ── STEP 8: Extra edges ──
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
    extraEdges.push({ d, color: theme.muted, thickness: 1.5 * s, opacity: 0.3, dashed: true });
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
    nodePrimary,
    columnX: shiftedColumnX,
    dotSpacing,
    scale: s,
    theme,
    orientation: 'ttb',
    minY: margin.top,
    maxY: height - margin.bottom,
  };
}
