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
import { OccupancyGrid } from './occupancy.js';

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
  const trackSpread = (options.trackSpread ?? 2) * s; // per-segment parallel offset
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

  // ── Phase 4: Dot positions — converge at shared, spread between ──
  //
  // At shared stations: routes converge toward a common center,
  //   spread by minimal dotSpacing to stay distinguishable.
  // At single-route stations: route stays at its "home" Y.
  // Between stations: routes smoothly transition.
  //
  // Like a physical metro: tracks come together at stations,
  // spread apart in between.

  const dotPositions = new Map();

  // Each route's "home" Y = SPINE_Y + sortKey × dotSpacing
  // This is where the route goes when it's alone (not sharing a station).
  const routeHomeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    const sortKey = routeSortKey.get(ri) ?? 0;
    routeHomeY.set(ri, SPINE_Y + sortKey * dotSpacing);
  }

  // Minimum spacing at shared stations — tighter than home spacing
  // but enough to distinguish routes visually.
  const sharedSpacing = Math.max(dotSpacing * 0.5, 6 * s);

  for (const nd of nodes) {
    const x = margin.left + layer.get(nd.id) * layerSpacing;
    const nRoutes = nodeRoutes.get(nd.id);
    const routesList = nRoutes ? [...nRoutes].sort((a, b) => (routeSortKey.get(a) ?? 0) - (routeSortKey.get(b) ?? 0)) : [];

    if (routesList.length > 1) {
      // SHARED station — routes converge.
      // Center = average of all routes' home Y positions.
      // Spread by sharedSpacing around that center, maintaining order.
      const homeYs = routesList.map(ri => routeHomeY.get(ri));
      const centerY = homeYs.reduce((a, b) => a + b, 0) / homeYs.length;
      const trunkIdx = routesList.indexOf(trunkRi);
      const anchor = trunkIdx >= 0 ? trunkIdx : Math.floor(routesList.length / 2);

      for (let i = 0; i < routesList.length; i++) {
        const ri = routesList[i];
        const y = centerY + (i - anchor) * sharedSpacing;
        dotPositions.set(`${nd.id}:${ri}`, { x, y });
      }
    } else if (routesList.length === 1) {
      // SINGLE-route station — route at its home Y.
      const ri = routesList[0];
      dotPositions.set(`${nd.id}:${ri}`, { x, y: routeHomeY.get(ri) });
    }

    // Nodes not on any route
    if (!nRoutes || nRoutes.size === 0) {
      const ri = nodeRoute.get(nd.id) ?? 0;
      dotPositions.set(`${nd.id}:${ri}`, { x, y: routeHomeY.get(ri) ?? SPINE_Y });
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

  // ── Phase 6: Colors ──
  const PALETTE = ['#268bd2','#dc322f','#859900','#d33682','#b58900','#2aa198','#6c71c4','#cb4b16','#586e75','#073642'];
  const routeColors = new Map();
  const usedColors = new Set();
  for (let ri = 0; ri < routes.length; ri++) {
    const cls = routes[ri].cls;
    const themeColor = cls ? theme.classes?.[cls] : null;
    if (themeColor && !usedColors.has(themeColor)) {
      routeColors.set(ri, themeColor);
      usedColors.add(themeColor);
    } else {
      let color = PALETTE[ri % PALETTE.length];
      for (let j = 0; j < PALETTE.length; j++) {
        const c = PALETTE[(ri + j) % PALETTE.length];
        if (!usedColors.has(c)) { color = c; break; }
      }
      routeColors.set(ri, color);
      usedColors.add(color);
    }
  }

  const opBoost = theme.lineOpacity ?? 1.0;
  const lineThickness = 2.5 * s;
  const labelSize = (options.labelSize ?? 3.6) * s;

  // ── Phase 7: Card placement + occupancy grid ──
  // Cards go in a separate zone BELOW the route area. Routes pass
  // through cards (like Celonis — routes visit activities). Cards
  // are NOT registered in the occupancy grid — only route-on-route
  // conflicts use obstacle avoidance.
  const grid = new OccupancyGrid(2 * s);
  const dotR = 3.2 * s;

  // Register dots in the grid (for route-on-route avoidance)
  for (const [key, dp] of dotPositions) {
    grid.place({ x: dp.x - dotR, y: dp.y - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: key });
  }

  // Find the bottom of the route zone (lowest dot Y)
  let routeZoneBottom = -Infinity;
  for (const [, dp] of dotPositions) {
    if (dp.y > routeZoneBottom) routeZoneBottom = dp.y;
  }

  const cardPlacements = new Map();
  const fsLabel = labelSize;
  const fsData = labelSize * 0.78;
  const cardGap = 8 * s;
  const cardZoneTop = routeZoneBottom + dotR + cardGap;

  // Card grid: collision-free placement within the card zone only
  const cardGrid = new OccupancyGrid(2 * s);

  for (const nd of nodes) {
    const pos = positions.get(nd.id);
    if (!pos) continue;

    const nRoutes = nodeRoutes.get(nd.id);
    const routeIndices = nRoutes ? [...nRoutes].sort((a, b) => a - b) : [];
    const n = routeIndices.length || 1;

    // Card dimensions
    const labelW = (nd.label || nd.id).length * fsLabel * 0.52;
    const indicatorW = n * 5 * s;
    const contentW = Math.max(labelW, indicatorW + 4 * s);
    const cardPadX = 5 * s;
    const cardPadY = 3 * s;
    const cardW = contentW + cardPadX * 2;
    const cardH = fsLabel + fsData + cardPadY * 2 + 3 * s;

    // Place cards below route zone, centered on dot X
    const xCenter = pos.x - cardW / 2;
    // Try rows: first row, then stagger down if collision
    const candidates = [
      { x: xCenter, y: cardZoneTop },
      { x: xCenter, y: cardZoneTop + cardH + 4 * s },
      { x: xCenter, y: cardZoneTop + (cardH + 4 * s) * 2 },
    ];

    let placed = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nd.id}` };
      if (cardGrid.tryPlace(rect)) {
        cardPlacements.set(nd.id, { rect, cardW, cardH, cardPadX, cardPadY, routeIndices });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const c = candidates[0];
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nd.id}` };
      cardGrid.place(rect);
      cardPlacements.set(nd.id, { rect, cardW, cardH, cardPadX, cardPadY, routeIndices });
    }
  }

  // Recalculate height to accommodate card zone
  let cardMaxY = routeZoneBottom + dotR + cardGap;
  for (const item of cardGrid.items) {
    const bottom = item.y + item.h;
    if (bottom > cardMaxY) cardMaxY = bottom;
  }
  const newHeight = Math.max(height, cardMaxY + margin.bottom);

  // ── Phase 8: Obstacle-aware edge routing (H-V-H) ──

  // Build H-V-H path string with rounded elbows
  function buildRoute(px, py, qx, qy, midFrac, r) {
    const dx = qx - px, dy = qy - py;
    if (Math.abs(dy) < 0.5) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
    if (Math.abs(dx) < 0.5) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
    const cr = Math.min(r, Math.abs(dy) / 2, Math.abs(dx) / 2);
    const midX = px + dx * midFrac;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
    d += `L ${(midX - sx * cr).toFixed(1)} ${py.toFixed(1)} `;
    d += `Q ${midX.toFixed(1)} ${py.toFixed(1)} ${midX.toFixed(1)} ${(py + sy * cr).toFixed(1)} `;
    d += `L ${midX.toFixed(1)} ${(qy - sy * cr).toFixed(1)} `;
    d += `Q ${midX.toFixed(1)} ${qy.toFixed(1)} ${(midX + sx * cr).toFixed(1)} ${qy.toFixed(1)} `;
    d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
    return { d, jogPos: midX };
  }

  // Score a 3-segment H-V-H path against the occupancy grid
  function scoreRoute(px, py, qx, qy, jogPos, ignore) {
    const t = lineThickness;
    const h1 = { x: Math.min(px, jogPos) - t, y: py - t * 2, w: Math.abs(jogPos - px) + t * 2, h: t * 4 };
    const vj = { x: jogPos - t, y: Math.min(py, qy), w: t * 2, h: Math.abs(qy - py) };
    const h2 = { x: Math.min(jogPos, qx) - t, y: qy - t * 2, w: Math.abs(qx - jogPos) + t * 2, h: t * 4 };
    return grid.overlapCount(h1, ignore) + grid.overlapCount(vj, ignore) + grid.overlapCount(h2, ignore);
  }

  // Register a routed path's segments in the grid
  function registerRoute(px, py, qx, qy, jogPos, owner) {
    grid.placeLine(px, py, jogPos, py, lineThickness, owner);
    grid.placeLine(jogPos, py, jogPos, qy, lineThickness, owner);
    grid.placeLine(jogPos, qy, qx, qy, lineThickness, owner);
  }

  // Route a segment with collision avoidance
  function routeSegment(px, py, qx, qy, owner, ignore) {
    const r = cornerRadius;
    const dy = qy - py, dx = qx - px;

    // Straight horizontal — check for card collisions
    if (Math.abs(dy) < 0.5) {
      const shrink = lineThickness;
      const checkX = Math.min(px, qx) + shrink;
      const checkW = Math.abs(dx) - 2 * shrink;
      if (checkW <= 0) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      }
      const hRect = { x: checkX, y: py - lineThickness, w: checkW, h: lineThickness * 2 };
      const collisions = grid.overlapCount(hRect, ignore);
      if (collisions === 0) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      }

      // Detour: H-V-H-V-H around obstacle
      const detourDist = 15 * s;
      const upY = py - detourDist, downY = py + detourDist;
      const upScore = scoreRoute(px, py, qx, upY, (px + qx) / 2, ignore);
      const downScore = scoreRoute(px, py, qx, downY, (px + qx) / 2, ignore);
      const detourY = upScore <= downScore ? upY : downY;
      const midX1 = px + dx * 0.3, midX2 = px + dx * 0.7;
      const cr = Math.min(r, detourDist / 2, Math.abs(midX1 - px) / 2);
      if (cr < 1) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      }
      const sx = Math.sign(dx), sy = Math.sign(detourY - py);
      let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
      d += `L ${(midX1 - sx * cr).toFixed(1)} ${py.toFixed(1)} `;
      d += `Q ${midX1.toFixed(1)} ${py.toFixed(1)} ${midX1.toFixed(1)} ${(py + sy * cr).toFixed(1)} `;
      d += `L ${midX1.toFixed(1)} ${(detourY - sy * cr).toFixed(1)} `;
      d += `Q ${midX1.toFixed(1)} ${detourY.toFixed(1)} ${(midX1 + sx * cr).toFixed(1)} ${detourY.toFixed(1)} `;
      d += `L ${(midX2 - sx * cr).toFixed(1)} ${detourY.toFixed(1)} `;
      d += `Q ${midX2.toFixed(1)} ${detourY.toFixed(1)} ${midX2.toFixed(1)} ${(detourY - sy * cr).toFixed(1)} `;
      d += `L ${midX2.toFixed(1)} ${(py + sy * cr).toFixed(1)} `;
      d += `Q ${midX2.toFixed(1)} ${py.toFixed(1)} ${(midX2 + sx * cr).toFixed(1)} ${py.toFixed(1)} `;
      d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      grid.placeLine(px, py, midX1, py, lineThickness, owner);
      grid.placeLine(midX1, py, midX1, detourY, lineThickness, owner);
      grid.placeLine(midX1, detourY, midX2, detourY, lineThickness, owner);
      grid.placeLine(midX2, detourY, midX2, py, lineThickness, owner);
      grid.placeLine(midX2, py, qx, qy, lineThickness, owner);
      return d;
    }

    // Non-straight: try multiple midFrac values, pick lowest collision count
    const midFracs = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
    let bestD = null, bestCollisions = Infinity;
    for (const mf of midFracs) {
      const { d, jogPos } = buildRoute(px, py, qx, qy, mf, r);
      if (jogPos === null) {
        grid.placeLine(px, py, qx, qy, lineThickness, owner);
        return d;
      }
      const collisions = scoreRoute(px, py, qx, qy, jogPos, ignore);
      if (collisions === 0) {
        registerRoute(px, py, qx, qy, jogPos, owner);
        return d;
      }
      if (collisions < bestCollisions) { bestCollisions = collisions; bestD = d; }
    }
    // Use best option even if imperfect
    const bestMf = midFracs[0];
    const bestJogPos = px + (qx - px) * bestMf;
    registerRoute(px, py, qx, qy, bestJogPos, owner);
    return bestD;
  }

  // Build segment → routes map
  const segmentMembers = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    for (let i = 1; i < routes[ri].nodes.length; i++) {
      const key = `${routes[ri].nodes[i - 1]}\u2192${routes[ri].nodes[i]}`;
      if (!segmentMembers.has(key)) segmentMembers.set(key, []);
      segmentMembers.get(key).push(ri);
    }
  }

  const routePaths = routes.map((route, ri) => {
    const color = routeColors.get(ri);
    const thickness = ri === trunkRi ? 3 * s : 2 * s;
    const opacity = Math.min((ri === trunkRi ? 0.65 : 0.5) * opBoost, 1);

    const segments = [];
    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const p = dotPositions.get(`${fromId}:${ri}`) || positions.get(fromId);
      const q = dotPositions.get(`${toId}:${ri}`) || positions.get(toId);
      if (!p || !q) continue;

      const owner = `route_${ri}_${fromId}_${toId}`;
      const ignore = new Set([owner, fromId, toId, `card_${fromId}`, `card_${toId}`,
        `${fromId}:${ri}`, `${toId}:${ri}`]);

      const d = routeSegment(p.x, p.y, q.x, q.y, owner, ignore);
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
    const owner = `extra_${f}_${t}`;
    const ignore = new Set([owner, f, t, `card_${f}`, `card_${t}`]);
    const d = routeSegment(p.x, p.y, q.x, q.y, owner, ignore);
    extraEdges.push({ d, color: '#999', thickness: 1.2 * s, opacity: 0.2, dashed: true });
  });

  return {
    positions, routePaths, extraEdges, width, height: newHeight,
    routes, nodeRoute, nodeRoutes, maxLayer,
    dotPositions, dotSpacing, routeSide, routeSortKey, trunkRi,
    laneDividers: [], laneHeight: dotSpacing * 3,
    layerSpacing, scale: s, theme,
    routeYScreen: new Map(routes.map((_, i) => [i, SPINE_Y + shiftY + (routeSortKey.get(i) ?? 0) * dotSpacing])),
    trunkYScreen: SPINE_Y + shiftY,
    minY: margin.top, maxY: margin.top + newHeight,
    laneSpacing: dotSpacing, lineGap: dotSpacing,
    globalRouteOffset: new Map(routes.map((_, i) => [i, (routeSortKey.get(i) ?? 0) * dotSpacing])),
    trackAssignment: new Map(),
    segmentRoutes: new Map(),
    nodeLane: nodeRoute,
    cardPlacements, routeColors, labelSize,
  };
}
