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
    const memberRoutes = nodeRoutes.get(nd.id);
    let x;
    if (memberRoutes.size <= 1) {
      // Single-route: use primary column
      const pri = nodePrimary.get(nd.id);
      x = columnX.get(pri) ?? 0;
    } else {
      // Multi-route: centroid of the columns that member routes belong to.
      // Each route's "column" is determined by which column has that route's nodes.
      // For simplicity: each route index maps to its own column (if active).
      // Collect the unique column X values for all routes through this node.
      const colXs = [];
      for (const ri of memberRoutes) {
        const cx = columnX.get(ri);
        if (cx !== undefined) colXs.push(cx);
      }
      if (colXs.length > 0) {
        const uniqueXs = [...new Set(colXs)];
        x = uniqueXs.reduce((a, b) => a + b, 0) / uniqueXs.length;
      } else {
        x = columnX.get(nodePrimary.get(nd.id)) ?? 0;
      }
    }
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

  // ── Pre-compute jog assignments for crossing avoidance ──
  // For each pair of layers, find all routes that bend (dx != 0) and assign
  // staggered midFrac values so their horizontal jogs don't overlap.
  // Key: "fromLayer→toLayer", Value: Map<routeIdx, midFrac>
  const jogAssignments = new Map();

  // First pass: collect all bending segments per layer gap
  const gapBenders = new Map(); // "layerA→layerB" → [{ri, fromX, toX}]
  routes.forEach((route, ri) => {
    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const fromPos = positions.get(fromId), toPos = positions.get(toId);
      if (!fromPos || !toPos) continue;

      const fromLayer = layer.get(fromId), toLayer = layer.get(toId);
      const memberFrom = nodeRoutes.get(fromId);
      const memberTo = nodeRoutes.get(toId);

      // Compute this route's waypoint X at each end
      let fromX = fromPos.x, toX = toPos.x;
      if (memberFrom.size > 1) {
        const ml = [...memberFrom].sort((a, b) => a - b);
        fromX = fromPos.x + (ri - (ml[0] + ml[ml.length - 1]) / 2) * dotSpacing;
      }
      if (memberTo.size > 1) {
        const ml = [...memberTo].sort((a, b) => a - b);
        toX = toPos.x + (ri - (ml[0] + ml[ml.length - 1]) / 2) * dotSpacing;
      }

      const dx = toX - fromX;
      if (Math.abs(dx) < 1) continue; // straight segment, no bend

      const gapKey = `${fromLayer}\u2192${toLayer}`;
      if (!gapBenders.has(gapKey)) gapBenders.set(gapKey, []);
      gapBenders.get(gapKey).push({ ri, fromX, toX, dx });
    }
  });

  // Assign staggered midFrac for crossing avoidance.
  // Sort by destination X: routes ending further LEFT jog EARLIER (higher Y fraction = closer to source).
  // Routes ending further RIGHT jog LATER (lower Y fraction = closer to destination).
  // This prevents crossings because left-bound routes clear out of the way first.
  for (const [gapKey, benders] of gapBenders) {
    // Sort by toX ascending — leftmost destination gets earliest jog
    benders.sort((a, b) => a.toX - b.toX);
    const n = benders.length;
    const assignment = new Map();
    benders.forEach((b, i) => {
      // Spread jogs across 0.2-0.8 range (leaving room at top/bottom for straight runs)
      const frac = n === 1 ? 0.5 : 0.2 + (i / (n - 1)) * 0.6;
      assignment.set(b.ri, frac);
    });
    jogAssignments.set(gapKey, assignment);
  }

  const routePaths = routes.map((route, ri) => {
    const color = classColor[route.cls] || Object.values(classColor)[0];

    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      const memberRoutes = nodeRoutes.get(id);

      let wx;
      if (memberRoutes.size <= 1) {
        wx = pos.x;
      } else {
        // Use GLOBAL route index as slot position. This keeps each route's
        // dot at a consistent X across all stations, eliminating zigzag.
        // The station centroid is at the midpoint of the min/max global slots.
        const memberList = [...memberRoutes].sort((a, b) => a - b);
        const minSlot = memberList[0];
        const maxSlot = memberList[memberList.length - 1];
        const slotCenter = (minSlot + maxSlot) / 2;
        wx = pos.x + (ri - slotCenter) * dotSpacing;
      }

      return { id, x: wx, y: pos.y };
    }).filter(Boolean);

    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const fromLayer = layer.get(fromId), toLayer = layer.get(toId);
      const gapKey = `${fromLayer}\u2192${toLayer}`;

      // Look up staggered jog fraction for crossing avoidance
      const gapAssign = jogAssignments.get(gapKey);
      const midFrac = gapAssign?.get(ri) ?? 0.5;

      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} ` +
        pathFn(p.x, p.y, q.x, q.y, ri, i, 0, { cornerRadius, bendStyle: 'v-first', midFrac });
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
