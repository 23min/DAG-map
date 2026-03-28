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

  // ── STEP 4b: Separate same-layer nodes that overlap in X ──
  const layerNodes = new Map(); // layer → [nodeId]
  nodes.forEach(nd => {
    const l = layer.get(nd.id);
    if (!layerNodes.has(l)) layerNodes.set(l, []);
    layerNodes.get(l).push(nd.id);
  });
  for (const [, ids] of layerNodes) {
    if (ids.length < 2) continue;
    // Sort by X, then spread overlapping nodes
    ids.sort((a, b) => positions.get(a).x - positions.get(b).x);
    for (let i = 1; i < ids.length; i++) {
      const prev = positions.get(ids[i - 1]);
      const curr = positions.get(ids[i]);
      const minGap = columnSpacing * 0.5; // minimum separation
      if (curr.x - prev.x < minGap) {
        curr.x = prev.x + minGap;
      }
    }
  }

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
  const grid = new OccupancyGrid(2);        // tracks + cards + dots
  const badgeGrid = new OccupancyGrid(2);   // edge labels only (don't block routes)

  // Sort routes: longest first (trunk gets best placement)
  const routeOrder = routes.map((_, ri) => ri)
    .sort((a, b) => routes[b].nodes.length - routes[a].nodes.length);

  // Track waypoint X for each route at each node (for parallel adjacency)
  const waypointX = new Map(); // "nodeId:routeIdx" → x

  // Track card placements
  const cardPlacements = new Map(); // nodeId → { rect, side }
  const placedNodes = new Set();

  // For each route at a node, compute the average X of neighboring nodes
  // in that route (prev + next). Used to order dots so lines don't cross.
  function neighborX(nodeId, ri) {
    const route = routes[ri];
    if (!route) return positions.get(nodeId)?.x ?? 0;
    const idx = route.nodes.indexOf(nodeId);
    if (idx < 0) return positions.get(nodeId)?.x ?? 0;
    let sum = 0, count = 0;
    if (idx > 0) {
      const p = positions.get(route.nodes[idx - 1]);
      if (p) { sum += p.x; count++; }
    }
    if (idx < route.nodes.length - 1) {
      const p = positions.get(route.nodes[idx + 1]);
      if (p) { sum += p.x; count++; }
    }
    return count > 0 ? sum / count : (positions.get(nodeId)?.x ?? 0);
  }

  // Determine if a node needs dot reordering (convergence node:
  // 3+ routes arriving from very different directions).
  const dotOrderCache = new Map();
  function getDotOrder(nodeId) {
    if (dotOrderCache.has(nodeId)) return dotOrderCache.get(nodeId);
    const memberRoutes = nodeRoutes.get(nodeId);
    if (!memberRoutes || memberRoutes.size <= 1) {
      const list = memberRoutes ? [...memberRoutes] : [];
      dotOrderCache.set(nodeId, list);
      return list;
    }
    const globalOrder = [...memberRoutes].sort((a, b) => a - b);

    // Only reorder at nodes with 3+ routes where routes span a full column
    if (memberRoutes.size >= 3) {
      const nxValues = [...memberRoutes].map(ri => neighborX(nodeId, ri));
      const span = Math.max(...nxValues) - Math.min(...nxValues);
      if (span >= columnSpacing) {
        const sorted = [...memberRoutes].sort((a, b) => {
          const diff = neighborX(nodeId, a) - neighborX(nodeId, b);
          return diff !== 0 ? diff : a - b;
        });
        dotOrderCache.set(nodeId, sorted);
        return sorted;
      }
    }

    dotOrderCache.set(nodeId, globalOrder);
    return globalOrder;
  }

  // For each route, compute dot X at a given node.
  // Dense centering keeps shared-station dots compact (no index gaps).
  // Convergence nodes get neighbor-aware reordering to reduce crossings.
  function dotX(nodeId, ri) {
    const memberRoutes = nodeRoutes.get(nodeId);
    const pos = positions.get(nodeId);
    if (!memberRoutes || !pos) return pos?.x ?? 0;
    if (memberRoutes.size <= 1) return pos.x;
    const sorted = getDotOrder(nodeId);
    const localIdx = sorted.indexOf(ri);
    if (localIdx < 0) return pos.x;
    const n = sorted.length;
    const center = (n - 1) / 2;
    return pos.x + (localIdx - center) * dotSpacing;
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

    // Try positions: RIGHT, LEFT, then shifted up/down variants
    const baseRight = rightmostDot + dotR + cardGap;
    const baseLeft = leftmostDot - dotR - cardGap - cardW;
    const yCenter = pos.y - cardH / 2;
    const yShift = cardH + 4 * s; // shift by full card height + gap
    const candidates = [
      { side: 'right', x: baseRight, y: yCenter },
      { side: 'left',  x: baseLeft,  y: yCenter },
      { side: 'right', x: baseRight, y: yCenter - yShift },  // right, above
      { side: 'right', x: baseRight, y: yCenter + yShift },  // right, below
      { side: 'left',  x: baseLeft,  y: yCenter - yShift },  // left, above
      { side: 'left',  x: baseLeft,  y: yCenter + yShift },  // left, below
    ];

    let placed = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nodeId}` };
      if (grid.tryPlace(rect)) {
        cardPlacements.set(nodeId, { rect, side: c.side, cardW, cardH, cardPadX, cardPadY });
        placed = true;
        break;
      }
    }

    // Fallback: place right regardless of collision (better than nothing)
    if (!placed) {
      const c = candidates[0];
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nodeId}` };
      grid.place(rect);
      cardPlacements.set(nodeId, { rect, side: 'right', cardW, cardH, cardPadX, cardPadY });
    }
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

  // Check collision for all 3 segments of a V-H-V path
  function scoreVHV(px, py, qx, qy, jogY, ignore) {
    const t = lineThickness;
    // Vertical run 1: (px, py) to (px, jogY)
    const v1 = { x: px - t, y: Math.min(py, jogY), w: t * 2, h: Math.abs(jogY - py), type: 'track' };
    // Horizontal jog: (px, jogY) to (qx, jogY)
    const hj = { x: Math.min(px, qx) - t, y: jogY - t * 2, w: Math.abs(qx - px) + t * 2, h: t * 4, type: 'track' };
    // Vertical run 2: (qx, jogY) to (qx, qy)
    const v2 = { x: qx - t, y: Math.min(jogY, qy), w: t * 2, h: Math.abs(qy - jogY), type: 'track' };

    return grid.overlapCount(v1, ignore) + grid.overlapCount(hj, ignore) + grid.overlapCount(v2, ignore);
  }

  // Register all 3 segments of a V-H-V path in the grid
  function registerVHV(px, py, qx, qy, jogY, owner) {
    grid.placeLine(px, py, px, jogY, lineThickness, owner);
    grid.placeLine(px, jogY, qx, jogY, lineThickness, owner);
    grid.placeLine(qx, jogY, qx, qy, lineThickness, owner);
  }

  // Route a segment with collision avoidance.
  // Returns { d, jogY } — jogY is the Y of the horizontal jog (null for straight).
  // ignore: Set of owners to ignore in collision checks (segment + endpoint nodes)
  function routeSegment(px, py, qx, qy, ri, owner, ignore) {
    const r = cornerRadius;

    // Straight vertical — check for card collisions (excluding endpoint nodes)
    if (Math.abs(qx - px) < 1) {
      // Shrink Y by lineThickness at each end to avoid false positives
      // from adjacent segments that terminate at the same node
      const yShrink = lineThickness;
      const checkY = Math.min(py, qy) + yShrink;
      const checkH = Math.abs(qy - py) - 2 * yShrink;
      if (checkH <= 0) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogY: null };
      }
      const vRect = { x: px - lineThickness, y: checkY, w: lineThickness * 2, h: checkH, type: 'track' };
      const collisions = grid.overlapCount(vRect, ignore);

      if (collisions === 0) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogY: null };
      }

      // Vertical segment hits a real obstacle — detour around it
      const detourDist = 15 * s;
      const leftX = px - detourDist;
      const rightX = px + detourDist;

      const leftScore = scoreVHV(px, py, leftX, qy, (py + qy) / 2, ignore)
        + scoreVHV(leftX, (py + qy) / 2, qx, qy, (py + qy) * 0.7, ignore);
      const rightScore = scoreVHV(px, py, rightX, qy, (py + qy) / 2, ignore)
        + scoreVHV(rightX, (py + qy) / 2, qx, qy, (py + qy) * 0.7, ignore);

      const detourX = leftScore <= rightScore ? leftX : rightX;
      const midY1 = py + (qy - py) * 0.3;
      const midY2 = py + (qy - py) * 0.7;

      const cr = Math.min(r, detourDist / 2, Math.abs(midY1 - py) / 2);
      if (cr < 1) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogY: null };
      }

      // V-H-V-H-V detour path
      const sx = Math.sign(detourX - px);
      const sy = Math.sign(qy - py);
      let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
      d += `L ${px.toFixed(1)} ${(midY1 - sy * cr).toFixed(1)} `;
      d += `Q ${px.toFixed(1)} ${midY1.toFixed(1)} ${(px + sx * cr).toFixed(1)} ${midY1.toFixed(1)} `;
      d += `L ${(detourX - sx * cr).toFixed(1)} ${midY1.toFixed(1)} `;
      d += `Q ${detourX.toFixed(1)} ${midY1.toFixed(1)} ${detourX.toFixed(1)} ${(midY1 + sy * cr).toFixed(1)} `;
      d += `L ${detourX.toFixed(1)} ${(midY2 - sy * cr).toFixed(1)} `;
      d += `Q ${detourX.toFixed(1)} ${midY2.toFixed(1)} ${(detourX - sx * cr).toFixed(1)} ${midY2.toFixed(1)} `;
      d += `L ${(qx + sx * cr).toFixed(1)} ${midY2.toFixed(1)} `;
      d += `Q ${qx.toFixed(1)} ${midY2.toFixed(1)} ${qx.toFixed(1)} ${(midY2 + sy * cr).toFixed(1)} `;
      d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;

      grid.placeLine(px, py, px, midY1, lineThickness, owner);
      grid.placeLine(px, midY1, detourX, midY1, lineThickness, owner);
      grid.placeLine(detourX, midY1, detourX, midY2, lineThickness, owner);
      grid.placeLine(detourX, midY2, qx, midY2, lineThickness, owner);
      grid.placeLine(qx, midY2, qx, qy, lineThickness, owner);
      return { d, jogY: midY1 };
    }

    // Non-straight: try multiple midFrac values, score ALL segments.
    // For small dx (dot centering shifts), prefer extreme midFrac to push
    // the elbow close to a node — makes the short horizontal run less visible.
    const dx = Math.abs(qx - px);
    const midFracs = dx < 2 * dotSpacing
      ? [0.85, 0.15, 0.75, 0.25, 0.5, 0.35, 0.65]  // extreme first for small jogs
      : [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];  // balanced first for big bends
    let bestD = null;
    let bestMf = 0.5;
    let bestCollisions = Infinity;

    for (const mf of midFracs) {
      const { d, jogY } = buildVHV(px, py, qx, qy, mf, r);
      if (jogY === null) return { d, jogY: null };

      const collisions = scoreVHV(px, py, qx, qy, jogY, ignore);
      if (collisions === 0) {
        registerVHV(px, py, qx, qy, jogY, owner);
        return { d, jogY };
      }
      if (collisions < bestCollisions) {
        bestCollisions = collisions;
        bestD = d;
        bestMf = mf;
      }
    }

    // Register the best option even if it has collisions
    const bestJogY = py + (qy - py) * bestMf;
    registerVHV(px, py, qx, qy, bestJogY, owner);
    return { d: bestD, jogY: bestJogY };
  }

  // ── STEP 6: Lay routes sequentially ──
  const fsLabel = 3.6 * s;
  const fsData = 2.8 * s;
  const routePaths = routes.map(() => []);
  const edgeLabelPositions = new Map(); // "from→to" → {x, y, color}

  // Phase A: Register all dots + place ALL cards BEFORE routing.
  // This ensures routes will avoid all cards.
  const dotR = 3.2 * s;
  for (const ri of routeOrder) {
    for (const nodeId of routes[ri].nodes) {
      if (!placedNodes.has(nodeId)) {
        const dxs = [...nodeRoutes.get(nodeId)].map(r => dotX(nodeId, r));
        dxs.forEach(dx => {
          const py = positions.get(nodeId)?.y ?? 0;
          grid.place({ x: dx - dotR, y: py - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: nodeId });
        });
        placedNodes.add(nodeId);
      }
    }
  }
  placedNodes.clear(); // reset for card placement
  for (const ri of routeOrder) {
    for (const nodeId of routes[ri].nodes) {
      placeCard(nodeId, fsLabel, fsData);
    }
  }

  // Phase B: Route ALL segments (grid has dots + cards as obstacles)
  for (const ri of routeOrder) {
    const route = routes[ri];
    const color = classColor[route.cls] || Object.values(classColor)[0];
    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      return { id, x: dotX(id, ri), y: pos.y };
    }).filter(Boolean);

    // Straightening pass: snap small dx shifts to make segments vertical.
    // This eliminates short elbows from dense centering changes.
    for (let i = 1; i < waypoints.length; i++) {
      const dx = Math.abs(waypoints[i].x - waypoints[i - 1].x);
      if (dx > 0.5 && dx < dotSpacing) {
        waypoints[i].x = waypoints[i - 1].x;
      }
    }

    const routeOwner = `route${ri}`;
    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      const ignore = new Set([routeOwner, p.id, q.id]);
      const result = routeSegment(p.x, p.y, q.x, q.y, ri, routeOwner, ignore);
      segments.push({ d: result.d, color, thickness: lineThickness, opacity: lineOpacity, dashed: false });

      // Try to place edge label — per route, on vertical runs
      const edgeKey = `${ri}:${p.id}\u2192${q.id}`;
      if (!edgeLabelPositions.has(edgeKey)) {
        const fs = 2.4 * s;
        const tw = 12 * s;
        const th = fs + 2.5 * s;

        const candidates = [];
        if (result.jogY !== null) {
          const jy = result.jogY;
          candidates.push({ x: p.x, y: (p.y + jy) / 2 - th / 2 });
          candidates.push({ x: q.x, y: (jy + q.y) / 2 - th / 2 });
          candidates.push({ x: (p.x + q.x) / 2, y: jy - th / 2 });
        } else {
          candidates.push({ x: p.x, y: (p.y + q.y) / 2 - th / 2 });
        }

        let placed = false;
        for (const c of candidates) {
          const labelY = c.y + th / 2;
          const rect = { x: c.x - tw / 2, y: c.y, w: tw, h: th, type: 'badge', owner: edgeKey };
          if (badgeGrid.tryPlace(rect)) {
            edgeLabelPositions.set(edgeKey, { x: c.x, y: labelY, color });
            placed = true;
            break;
          }
        }
        if (!placed) {
          const c = candidates[0];
          edgeLabelPositions.set(edgeKey, { x: c.x, y: c.y + th / 2, color });
        }
      }
    }

    routePaths[ri] = segments;
  }

  // ── STEP 7: Extra edges (DAG edges not covered by any route) ──
  const routeEdgeSet = new Set();
  routes.forEach(route => {
    for (let i = 1; i < route.nodes.length; i++)
      routeEdgeSet.add(`${route.nodes[i - 1]}\u2192${route.nodes[i]}`);
  });

  // For each node, track how many extra-edge slots have been assigned.
  // Extra dots go to the LEFT of route dots (cards are on the right).
  const extraSlotCount = new Map();
  function extraDotX(nodeId) {
    const pos = positions.get(nodeId);
    if (!pos) return 0;
    const memberRoutes = nodeRoutes.get(nodeId);
    if (!memberRoutes || memberRoutes.size === 0) return pos.x;
    const leftmost = Math.min(...[...memberRoutes].map(ri => dotX(nodeId, ri)));
    const slotIdx = extraSlotCount.get(nodeId) || 0;
    extraSlotCount.set(nodeId, slotIdx + 1);
    return leftmost - (slotIdx + 1) * dotSpacing;
  }

  const extraEdges = [];
  const extraDotPositions = new Map(); // "from→to" → {fromX, fromY, toX, toY}
  edges.forEach(([f, t]) => {
    if (routeEdgeSet.has(`${f}\u2192${t}`)) return;
    const pBase = positions.get(f), qBase = positions.get(t);
    if (!pBase || !qBase) return;
    const fx = extraDotX(f), tx = extraDotX(t);
    const extraOwner = `extra_${f}_${t}`;
    const result = routeSegment(fx, pBase.y, tx, qBase.y, 999, extraOwner, new Set([extraOwner, f, t]));
    extraEdges.push({ d: result.d, color: theme.muted, thickness: 1.5 * s, opacity: 0.3, dashed: true });
    extraDotPositions.set(`${f}\u2192${t}`, { fromX: fx, fromY: pBase.y, toX: tx, toY: qBase.y });
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
    dotX,
    cardPlacements,
    edgeLabelPositions,
    extraDotPositions,
    scale: s,
    theme,
    orientation: 'ttb',
    minY: margin.top,
    maxY: margin.top + maxLayer * layerSpacing,
  };
}
