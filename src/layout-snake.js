// ================================================================
// layout-snake.js — Obstacle-aware sequential "snake" layout
// ================================================================
//
// Lays down routes one at a time like snakes on a board game.
// Each element (track segment, station card, edge label) is placed
// into an occupancy grid. Subsequent elements route around obstacles.
//
// Algorithm:
//   1. Topological sort, layer assignment, column assignment (same as layoutProcess)
//   2. Order routes by length (longest = trunk, laid first)
//   3. For each route ("snake"):
//      a. Place station dots + cards (try RIGHT, then LEFT, then fallback)
//      b. Route segments between stations (V-H-V with collision avoidance)
//      c. Place edge labels on straight runs
//   4. Tracks that share stations maintain neighbor adjacency
//
// Routes to the RIGHT of the trunk stay right. Parallel tracks through
// shared stations maintain their relative order.

import { resolveTheme } from './themes.js';
import { OccupancyGrid } from './occupancy.js';

export function layoutSnake(dag, options = {}) {
  const { nodes, edges } = dag;
  const theme = resolveTheme(options.theme);
  const s = options.scale ?? 1.5;
  const layerSpacing = (options.layerSpacing ?? 55) * s;
  const columnSpacing = (options.columnSpacing ?? 90) * s;
  const dotSpacing = (options.dotSpacing ?? 12) * s;
  const cornerRadius = (options.cornerRadius ?? 5) * s;
  const lineThickness = (options.lineThickness ?? 3) * s;
  const lineOpacity = Math.min((theme.lineOpacity ?? 1.0) * 0.7, 1);
  const routes = options.routes || [];
  const cardSide = options.cardSide ?? 'right'; // default card placement

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const classColor = {};
  for (const [cls, hex] of Object.entries(theme.classes)) classColor[cls] = hex;

  // ── STEP 1: Topological sort + layers ──
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

  // ── STEP 2: Route membership + primary type ──
  const nodeRoutes = new Map();
  nodes.forEach(n => nodeRoutes.set(n.id, new Set()));
  routes.forEach((route, ri) => {
    route.nodes.forEach(id => nodeRoutes.get(id)?.add(ri));
  });

  const nodePrimary = new Map();
  nodes.forEach(nd => {
    const memberRoutes = nodeRoutes.get(nd.id);
    if (memberRoutes.size === 0) { nodePrimary.set(nd.id, 0); return; }
    if (memberRoutes.size === 1) { nodePrimary.set(nd.id, [...memberRoutes][0]); return; }
    // Primary = route with most edges through this node
    const routeEdgeCount = new Map();
    routes.forEach((route, ri) => {
      if (!memberRoutes.has(ri)) return;
      const idx = route.nodes.indexOf(nd.id);
      if (idx >= 0) {
        let count = 0;
        if (idx > 0) count++;
        if (idx < route.nodes.length - 1) count++;
        routeEdgeCount.set(ri, (routeEdgeCount.get(ri) || 0) + count);
      }
    });
    let bestRi = [...memberRoutes][0], bestCount = -1;
    for (const [ri, count] of routeEdgeCount) {
      if (count > bestCount || (count === bestCount && ri < bestRi)) {
        bestRi = ri; bestCount = count;
      }
    }
    nodePrimary.set(nd.id, bestRi);
  });

  // ── STEP 3: Column assignment ──
  const columns = routes.map(() => []);
  nodes.forEach(nd => columns[nodePrimary.get(nd.id)]?.push(nd.id));
  columns.forEach(col => col.sort((a, b) => layer.get(a) - layer.get(b)));

  const activeColumns = [];
  columns.forEach((col, ri) => { if (col.length > 0) activeColumns.push({ ri, nodes: col }); });
  const nCols = activeColumns.length;
  const columnX = new Map();
  activeColumns.forEach((col, ci) => columnX.set(col.ri, (ci - (nCols - 1) / 2) * columnSpacing));

  // ── STEP 4: Node positions ──
  const positions = new Map();
  nodes.forEach(nd => {
    const memberRoutes = nodeRoutes.get(nd.id);
    let x;
    if (memberRoutes.size <= 1) {
      x = columnX.get(nodePrimary.get(nd.id)) ?? 0;
    } else {
      const colXs = [...memberRoutes].map(ri => columnX.get(ri)).filter(v => v !== undefined);
      const uniqueXs = [...new Set(colXs)];
      x = uniqueXs.length > 0 ? uniqueXs.reduce((a, b) => a + b, 0) / uniqueXs.length : 0;
    }
    positions.set(nd.id, { x, y: layer.get(nd.id) * layerSpacing });
  });

  // Normalize
  const margin = { top: 50 * s, left: 80 * s, bottom: 40 * s, right: 140 * s };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    if (pos.x < minX) minX = pos.x; if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y; if (pos.y > maxY) maxY = pos.y;
  });
  const xShift = -minX + margin.left;
  positions.forEach(pos => { pos.x += xShift; pos.y = pos.y - minY + margin.top; });

  // ── STEP 5: Snake layout — sequential, obstacle-aware ──
  const grid = new OccupancyGrid(lineThickness);

  // Sort routes: longest first (trunk gets best placement)
  const routeOrder = routes.map((_, ri) => ri)
    .sort((a, b) => routes[b].nodes.length - routes[a].nodes.length);

  // Track waypoint X for each route at each node (for parallel adjacency)
  const waypointX = new Map(); // "nodeId:routeIdx" → x

  // Track card placements
  const cardPlacements = new Map(); // nodeId → { rect, side }
  const placedNodes = new Set();

  // For each route, compute dot X at a given node
  function dotX(nodeId, ri) {
    const memberRoutes = nodeRoutes.get(nodeId);
    const pos = positions.get(nodeId);
    if (!memberRoutes || !pos) return pos?.x ?? 0;
    if (memberRoutes.size <= 1) return pos.x;
    const memberList = [...memberRoutes].sort((a, b) => a - b);
    const minSlot = memberList[0];
    const maxSlot = memberList[memberList.length - 1];
    const slotCenter = (minSlot + maxSlot) / 2;
    return pos.x + (ri - slotCenter) * dotSpacing;
  }

  // Place a station card, trying multiple positions
  function placeCard(nodeId, fsLabel, fsData) {
    if (placedNodes.has(nodeId)) return;
    placedNodes.add(nodeId);

    const nd = nodeMap.get(nodeId);
    const pos = positions.get(nodeId);
    if (!nd || !pos) return;

    const memberRoutes = nodeRoutes.get(nodeId);
    const routeIndices = [...memberRoutes].sort((a, b) => a - b);
    const n = routeIndices.length;

    // Compute dots span
    const dxs = routeIndices.map(ri => dotX(nodeId, ri));
    const rightmostDot = Math.max(...dxs);
    const leftmostDot = Math.min(...dxs);
    const dotR = 3.2 * s;

    // Card dimensions
    const labelW = nd.label.length * fsLabel * 0.52;
    const indicatorW = n * 5 * s;
    const dataW = (nd.count || '').length * fsData * 0.55;
    const contentW = Math.max(labelW, indicatorW + dataW + 4 * s);
    const cardPadX = 5 * s;
    const cardPadY = 3 * s;
    const cardW = contentW + cardPadX * 2;
    const cardH = fsLabel + fsData + cardPadY * 2 + 3 * s;
    const cardGap = 4 * s;

    // Try positions: RIGHT, LEFT, then fallback to RIGHT regardless
    const candidates = [
      { side: 'right', x: rightmostDot + dotR + cardGap, y: pos.y - cardH / 2 },
      { side: 'left',  x: leftmostDot - dotR - cardGap - cardW, y: pos.y - cardH / 2 },
    ];

    let placed = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: nodeId };
      if (grid.tryPlace(rect)) {
        cardPlacements.set(nodeId, { rect, side: c.side, cardW, cardH, cardPadX, cardPadY });
        placed = true;
        break;
      }
    }

    // Fallback: place right regardless of collision (better than nothing)
    if (!placed) {
      const c = candidates[0];
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: nodeId };
      grid.place(rect);
      cardPlacements.set(nodeId, { rect, side: 'right', cardW, cardH, cardPadX, cardPadY });
    }

    // Register dot positions in grid
    dxs.forEach(dx => {
      grid.place({ x: dx - dotR, y: pos.y - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: nodeId });
    });
  }

  // Build V-H-V path string with rounded elbows
  function buildVHV(px, py, qx, qy, midFrac, r) {
    const dx = qx - px, dy = qy - py;
    if (Math.abs(dx) < 1) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogY: null };
    if (Math.abs(dy) < 1) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogY: null };

    const cr = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 2);
    const midY = py + dy * midFrac;
    const sy = Math.sign(dy), sx = Math.sign(dx);

    // First elbow at (px, midY)
    const e1y = midY - sy * cr;
    const e1ex = px + sx * cr;
    // Second elbow at (qx, midY)
    const e2x = qx - sx * cr;
    const e2ey = midY + sy * cr;

    let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
    d += `L ${px.toFixed(1)} ${e1y.toFixed(1)} `;
    d += `Q ${px.toFixed(1)} ${midY.toFixed(1)} ${e1ex.toFixed(1)} ${midY.toFixed(1)} `;
    d += `L ${e2x.toFixed(1)} ${midY.toFixed(1)} `;
    d += `Q ${qx.toFixed(1)} ${midY.toFixed(1)} ${qx.toFixed(1)} ${e2ey.toFixed(1)} `;
    d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;

    return { d, jogY: midY };
  }

  // Route a segment with collision avoidance
  function routeSegment(px, py, qx, qy, ri, owner) {
    const r = cornerRadius;

    // Straight vertical — no collision concern
    if (Math.abs(qx - px) < 1) {
      return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
    }

    // Try multiple midFrac values, pick the first that avoids collisions
    const midFracs = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
    let bestD = null;
    let bestCollisions = Infinity;

    for (const mf of midFracs) {
      const { d, jogY } = buildVHV(px, py, qx, qy, mf, r);
      if (jogY === null) return d; // straight line

      // Check collision of the horizontal jog segment
      const jogRect = {
        x: Math.min(px, qx) - lineThickness,
        y: jogY - lineThickness * 2,
        w: Math.abs(qx - px) + lineThickness * 2,
        h: lineThickness * 4,
        type: 'track',
        owner,
      };

      const collisions = grid.overlapCount(jogRect, owner);
      if (collisions === 0) {
        // Register the path in the grid
        grid.placeLine(px, py, px, jogY, lineThickness, owner);
        grid.placeLine(px, jogY, qx, jogY, lineThickness, owner);
        grid.placeLine(qx, jogY, qx, qy, lineThickness, owner);
        return d;
      }
      if (collisions < bestCollisions) {
        bestCollisions = collisions;
        bestD = d;
      }
    }

    // No collision-free option — use the best one
    return bestD;
  }

  // ── STEP 6: Lay routes sequentially ──
  const fsLabel = 3.6 * s;
  const fsData = 2.8 * s;
  const routePaths = routes.map(() => []);
  const edgeLabelPositions = new Map(); // "from→to" → {x, y, color}

  for (const ri of routeOrder) {
    const route = routes[ri];
    const color = classColor[route.cls] || Object.values(classColor)[0];

    // a. Place station cards for nodes first encountered on this route
    for (const nodeId of route.nodes) {
      placeCard(nodeId, fsLabel, fsData);
    }

    // b. Route segments
    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      return { id, x: dotX(id, ri), y: pos.y };
    }).filter(Boolean);

    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      const segOwner = `route${ri}_seg${i}`;
      const d = routeSegment(p.x, p.y, q.x, q.y, ri, segOwner);
      segments.push({ d, color, thickness: lineThickness, opacity: lineOpacity, dashed: false });

      // c. Try to place edge label
      const edgeKey = `${p.id}\u2192${q.id}`;
      if (!edgeLabelPositions.has(edgeKey)) {
        const fromPos = positions.get(p.id);
        const toPos = positions.get(q.id);
        if (fromPos && toPos) {
          const midY = (fromPos.y + toPos.y) / 2;
          const fs = 2.4 * s;
          const tw = 28 * s; // approximate max badge width
          const th = fs + 2.5 * s;

          // Try left of line, then right
          const candidates = [
            { x: p.x - tw / 2 - 3 * s, y: midY - th / 2 },
            { x: p.x + tw / 2 + 3 * s, y: midY - th / 2 },
          ];

          for (const c of candidates) {
            const rect = { x: c.x - tw / 2, y: c.y, w: tw, h: th, type: 'badge', owner: edgeKey };
            if (grid.tryPlace(rect)) {
              edgeLabelPositions.set(edgeKey, { x: c.x, y: midY, color });
              break;
            }
          }

          // Fallback: place left regardless
          if (!edgeLabelPositions.has(edgeKey)) {
            const c = candidates[0];
            edgeLabelPositions.set(edgeKey, { x: c.x, y: midY, color });
          }
        }
      }
    }

    routePaths[ri] = segments;
  }

  // ── STEP 7: Extra edges ──
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
    const d = routeSegment(p.x, p.y, q.x, q.y, 999, `extra_${f}_${t}`);
    extraEdges.push({ d, color: theme.muted, thickness: 1.5 * s, opacity: 0.3, dashed: true });
  });

  const maxLayer = Math.max(...[...layer.values()], 0);

  return {
    positions,
    routePaths,
    extraEdges,
    width: (maxX - minX) + margin.left + margin.right,
    height: (maxY - minY) + margin.top + margin.bottom,
    routes,
    nodeRoute: new Map([...nodes.map(nd => [nd.id, nodePrimary.get(nd.id)])]),
    nodeRoutes,
    nodePrimary,
    dotSpacing,
    cardPlacements,
    edgeLabelPositions,
    scale: s,
    theme,
    orientation: 'ttb',
    minY: margin.top,
    maxY: margin.top + maxLayer * layerSpacing,
  };
}
