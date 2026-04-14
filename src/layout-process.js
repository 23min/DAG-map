// ================================================================
// layout-process.js — Celonis-style process flow layout (Mode 2)
// ================================================================
//
// Sugiyama layout with direction support (LTR or TTB):
//   - Stations are circles ON the route lines (like metro dots)
//   - Cards are positioned BESIDE stations (labels, not nodes)
//   - Thick colored route lines with orthogonal routing through dots
//   - LTR: layers = columns, H-V-H routing, cards above/below
//   - TTB: layers = rows, V-H-V routing, cards left/right

import { assertValidDag, buildGraph, topoSortAndRank } from './graph-utils.js';
import { OccupancyGrid } from './occupancy.js';
import { resolveTheme } from './themes.js';

/**
 * @param {object} dag - { nodes, edges }
 * @param {object} [options]
 * @param {Array}  [options.routes] - [{id, cls, nodes}]
 * @param {number} [options.scale=1.5]
 * @param {number} [options.layerGap=80]
 * @param {number} [options.stationGap=60]
 * @param {number} [options.trackSpread=8]
 * @param {number} [options.cornerRadius=6]
 * @param {number} [options.labelSize=4]
 * @param {'ltr'|'ttb'} [options.direction='ltr']
 */
export function layoutProcess(dag, options = {}) {
  const { nodes, edges } = dag;
  const s = options.scale ?? 1.5;
  const theme = resolveTheme(options.theme);
  const isLTR = (options.direction ?? 'ltr') === 'ltr';

  const layerGap = (options.layerGap ?? 90) * s;
  const stationGap = (options.stationGap ?? 70) * s;
  const bundling = options.bundling ?? false;
  const trackSpread = (options.trackSpread ?? (bundling ? 5 : 12)) * s;
  const cornerRadius = (options.cornerRadius ?? 6) * s;
  const fontSize = (options.labelSize ?? 4.5) * s;
  const fsMetric = fontSize * 0.75;
  const dotR = 4 * s;
  const lineThickness = 3 * s;
  const cardPadX = 7 * s;
  const cardPadY = 5 * s;
  const cardRadius = 3 * s;
  const margin = { left: 40 * s, top: 35 * s, right: 40 * s, bottom: 35 * s };

  assertValidDag(nodes, edges, 'layoutProcess');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);

  // ── Phase 1: Layer assignment ──────────────────────────────────
  const { topo, rank, maxRank } = topoSortAndRank(nodes, childrenOf, parentsOf);

  const layers = [];
  for (let i = 0; i <= maxRank; i++) layers.push([]);
  for (const nd of nodes) layers[rank.get(nd.id)].push(nd.id);

  // ── Phase 2: Crossing reduction — barycenter sweep ─────────────
  const nodeOrder = new Map();
  for (const layer of layers) {
    layer.forEach((id, i) => nodeOrder.set(id, i));
  }

  for (let iter = 0; iter < 24; iter++) {
    const forward = iter % 2 === 0;
    const start = forward ? 1 : layers.length - 2;
    const end = forward ? layers.length : -1;
    const step = forward ? 1 : -1;

    for (let li = start; li !== end; li += step) {
      const layer = layers[li];
      const adjLayer = layers[li - step];
      if (!adjLayer) continue;
      const adjSet = new Set(adjLayer);

      for (const id of layer) {
        const neighbors = forward
          ? (parentsOf.get(id) || [])
          : (childrenOf.get(id) || []);
        const relevant = neighbors.filter(n => adjSet.has(n));
        if (relevant.length > 0) {
          const avg = relevant.reduce((sum, n) => sum + nodeOrder.get(n), 0) / relevant.length;
          nodeOrder.set(id, avg);
        }
      }

      layer.sort((a, b) => nodeOrder.get(a) - nodeOrder.get(b));
      layer.forEach((id, i) => nodeOrder.set(id, i));
    }
  }

  // ── Phase 3: Divergence-aware positioning ────────────────────────
  // Solves the staircase problem: stations on shared trunk sections
  // stay at the SAME Y. Only stations where routes actually diverge
  // get spread vertically. Linear chains → horizontal. Forks → spread.
  //
  // Rule: "same Y on shared path, spread only at divergence points"
  //
  // Algorithm:
  // 1. Start with centered positions (barycenter ordering)
  // 2. For each layer, compute which routes are present
  // 3. If all routes at this layer are the same set as the previous
  //    layer → stations stay at the same Y (no divergence)
  // 4. If routes differ → spread stations by their position among
  //    the unique route groups at this layer

  const earlyNodeRoutes = new Map();
  nodes.forEach(nd => earlyNodeRoutes.set(nd.id, new Set()));
  for (let ri = 0; ri < (options.routes || []).length; ri++) {
    for (const nodeId of (options.routes || [])[ri].nodes) {
      earlyNodeRoutes.get(nodeId)?.add(ri);
    }
  }

  const maxStationsPerLayer = Math.max(...layers.map(l => l.length), 1);

  // Compute "route signature" per station — the set of routes it belongs to.
  // Stations with the same signature should be at similar Y.
  // Stations with different signatures should spread.
  const stationCrossPos = new Map();
  const crossAxisSpan = (maxStationsPerLayer - 1) * stationGap;
  const centerY = margin.top + crossAxisSpan / 2;

  // First: assign initial positions from barycenter ordering (centered, compact)
  for (const layer of layers) {
    const n = layer.length;
    const span = (n - 1) * stationGap;
    const startY = centerY - span / 2;
    layer.forEach((id, i) => stationCrossPos.set(id, startY + i * stationGap));
  }

  // Second: at layers where routes DIVERGE (multiple distinct route groups),
  // spread the groups apart. At layers where all stations share the same
  // routes, keep them together (no staircase).
  for (const layer of layers) {
    if (layer.length <= 1) continue;

    // Compute unique route membership groups
    const groups = new Map();
    for (const id of layer) {
      const memberRoutes = earlyNodeRoutes.get(id);
      const sig = memberRoutes ? [...memberRoutes].sort().join(',') : '';
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(id);
    }

    // If only one group → all stations share same routes → keep centered (no divergence)
    if (groups.size <= 1) continue;

    // Multiple groups = divergence point! Spread groups apart.
    const sortedGroups = [...groups.entries()].sort((a, b) => {
      const avgA = a[0] ? a[0].split(',').reduce((s, v) => s + Number(v), 0) / a[0].split(',').length : 0;
      const avgB = b[0] ? b[0].split(',').reduce((s, v) => s + Number(v), 0) / b[0].split(',').length : 0;
      return avgA - avgB;
    });

    // Compute total stations across all groups
    const totalStations = layer.length;
    const totalSpan = (totalStations - 1) * stationGap;
    let curY = centerY - totalSpan / 2;

    const newOrder = [];
    for (const [sig, members] of sortedGroups) {
      members.sort((a, b) => nodeOrder.get(a) - nodeOrder.get(b));
      for (let i = 0; i < members.length; i++) {
        stationCrossPos.set(members[i], curY);
        newOrder.push(members[i]);
        curY += stationGap;
      }
    }
    for (let i = 0; i < newOrder.length; i++) layer[i] = newOrder[i];
  }

  // No barycenter refinement — the divergence grouping provides clean
  // positioning. Barycenter adds micro-variations that look like noise
  // on linear chains (consecutive stations vary slightly = bad signal).

  // (B) Adaptive layer gaps
  const gapComplexity = [];
  for (let li = 0; li < maxRank; li++) {
    let bending = 0;
    const srcSet = new Set(layers[li]);
    const dstSet = new Set(layers[li + 1]);
    for (const route of (options.routes || [])) {
      for (let i = 1; i < route.nodes.length; i++) {
        if (srcSet.has(route.nodes[i - 1]) && dstSet.has(route.nodes[i])) {
          const srcCross = stationCrossPos.get(route.nodes[i - 1]) ?? 0;
          const dstCross = stationCrossPos.get(route.nodes[i]) ?? 0;
          if (Math.abs(srcCross - dstCross) > stationGap * 0.3) bending++;
        }
      }
    }
    gapComplexity.push(bending);
  }

  const adaptiveGaps = gapComplexity.map(bending => {
    const complexity = Math.max(bending, 1);
    return layerGap * (0.7 + 0.3 * Math.min(complexity, 5));
  });
  if (adaptiveGaps.length === 0) adaptiveGaps.push(layerGap);

  // (C) Junction stagger — offset junction stations slightly in primary axis
  const junctionOffset = new Map();
  for (const nd of nodes) {
    const outDeg = (childrenOf.get(nd.id) || []).length;
    const inDeg = (parentsOf.get(nd.id) || []).length;
    const fanDeg = Math.max(outDeg, inDeg);
    if (fanDeg > 1) {
      // Fan-out: push slightly forward. Fan-in: push slightly back.
      const dir = outDeg > inDeg ? 1 : -1;
      junctionOffset.set(nd.id, dir * stationGap * 0.12 * (fanDeg - 1));
    }
  }

  // Assemble station positions — break the grid!
  // Each station gets a unique primary-axis position based on:
  // 1. Base layer position (from adaptive gaps)
  // 2. Junction offset (fan-out/fan-in stagger)
  // 3. Neighbor attraction: pulled toward connected neighbors' average
  //    position, breaking the rigid layer alignment.
  // Rule: "stations gravitate toward their neighbors"

  const stationPos = new Map();

  // First pass: assign base positions on the grid
  if (isLTR) {
    let curX = margin.left;
    for (let li = 0; li <= maxRank; li++) {
      for (const id of layers[li]) {
        stationPos.set(id, { x: curX + (junctionOffset.get(id) || 0), y: stationCrossPos.get(id) });
      }
      curX += adaptiveGaps[li] || layerGap;
    }
  } else {
    let curY = margin.top;
    for (let li = 0; li <= maxRank; li++) {
      for (const id of layers[li]) {
        stationPos.set(id, { x: stationCrossPos.get(id), y: curY + (junctionOffset.get(id) || 0) });
      }
      curY += adaptiveGaps[li] || layerGap;
    }
  }

  // Second pass: primary-axis neighbor attraction only.
  // Cross-axis stays on route lanes (prevents crossings).
  // Primary-axis nudges toward parent/child midpoint, breaking the
  // rigid grid and creating variable spacing (time/distance effect).
  // Rule: "stations gravitate toward their neighbors on the flow axis"
  for (let iter = 0; iter < 3; iter++) {
    for (const nd of nodes) {
      const pos = stationPos.get(nd.id);
      const parents = (parentsOf.get(nd.id) || []).filter(n => stationPos.has(n));
      const children = (childrenOf.get(nd.id) || []).filter(n => stationPos.has(n));
      if (parents.length === 0 && children.length === 0) continue;

      const currentPrimary = isLTR ? pos.x : pos.y;
      let newPrimary = currentPrimary;

      if (parents.length > 0 && children.length > 0) {
        const parentAvg = parents.reduce((s, n) => s + (isLTR ? stationPos.get(n).x : stationPos.get(n).y), 0) / parents.length;
        const childAvg = children.reduce((s, n) => s + (isLTR ? stationPos.get(n).x : stationPos.get(n).y), 0) / children.length;
        const idealPrimary = (parentAvg + childAvg) / 2;
        newPrimary = currentPrimary + (idealPrimary - currentPrimary) * 0.15;
      } else if (parents.length > 0) {
        // Leaf node: pull toward parents
        const parentAvg = parents.reduce((s, n) => s + (isLTR ? stationPos.get(n).x : stationPos.get(n).y), 0) / parents.length;
        newPrimary = currentPrimary + (parentAvg + layerGap - currentPrimary) * 0.1;
      }

      if (isLTR) {
        stationPos.set(nd.id, { x: newPrimary, y: pos.y }); // y unchanged!
      } else {
        stationPos.set(nd.id, { x: pos.x, y: newPrimary }); // x unchanged!
      }
    }
  }

  // ── Phase 4: Route analysis ────────────────────────────────────
  const routes = options.routes || [];
  const PALETTE = [
    '#7b3fa0', '#1a9e7a', '#d4456a', '#2678b2',
    '#c4782a', '#5d6cc1', '#3aab5f', '#c94040',
    '#8a6d3b', '#607d8b',
  ];
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

  const nodeRoutes = new Map();
  nodes.forEach(nd => nodeRoutes.set(nd.id, new Set()));
  for (let ri = 0; ri < routes.length; ri++) {
    for (const nodeId of routes[ri].nodes) {
      nodeRoutes.get(nodeId)?.add(ri);
    }
  }

  const segmentRoutes = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    for (let i = 1; i < routes[ri].nodes.length; i++) {
      const key = `${routes[ri].nodes[i - 1]}\u2192${routes[ri].nodes[i]}`;
      if (!segmentRoutes.has(key)) segmentRoutes.set(key, []);
      segmentRoutes.get(key).push(ri);
    }
  }

  // ── Phase 5: Card placement (beside stations) ─────────────────
  const grid = new OccupancyGrid(2 * s);

  for (const [id, pos] of stationPos) {
    grid.place({ x: pos.x - dotR, y: pos.y - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: id });
  }

  const cardPlacements = new Map();
  for (const nd of nodes) {
    const pos = stationPos.get(nd.id);
    if (!pos) continue;

    const label = nd.label || nd.id;
    const metricValue = nd.times ?? nd.count;
    const labelW = label.length * fontSize * 0.52;
    const metricH = metricValue !== undefined && metricValue !== null ? fsMetric + 2 * s : 0;
    const cardW = labelW + cardPadX * 2;
    const cardH = fontSize + metricH + cardPadY * 2;
    const gap = 6 * s;

    let candidates;
    if (isLTR) {
      // LTR: cards below or above the station dot
      candidates = [
        { x: pos.x - cardW / 2, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2, y: pos.y - dotR - gap - cardH },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: pos.y - dotR - gap - cardH },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: pos.y - dotR - gap - cardH },
      ];
    } else {
      // TTB: cards right or left of station dot
      candidates = [
        { x: pos.x + dotR + gap, y: pos.y - cardH / 2 },
        { x: pos.x - dotR - gap - cardW, y: pos.y - cardH / 2 },
        { x: pos.x + dotR + gap, y: pos.y },
        { x: pos.x - dotR - gap - cardW, y: pos.y },
        { x: pos.x + dotR + gap, y: pos.y - cardH },
        { x: pos.x - dotR - gap - cardW, y: pos.y - cardH },
      ];
    }

    let placed = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nd.id}` };
      if (grid.tryPlace(rect)) {
        cardPlacements.set(nd.id, { rect, cardW, cardH, cardPadX, cardPadY });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const c = candidates[0];
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nd.id}` };
      grid.place(rect);
      cardPlacements.set(nd.id, { rect, cardW, cardH, cardPadX, cardPadY });
    }
  }

  // ── Phase 6: Obstacle-aware routing ─────────────────────────
  // Each track is an obstacle for every other track. Process
  // segments sequentially: for each, try many midFrac candidates,
  // score against the occupancy grid, pick zero-collision placement.
  // Fan-out segments from the same source cluster jogs together
  // so diverging routes don't cross each other.

  const lt = lineThickness;
  const routeGrid = new OccupancyGrid(lt);

  // Seed grid with station zones
  for (const [id, pos] of stationPos) {
    routeGrid.place({ x: pos.x - dotR * 1.5, y: pos.y - dotR * 1.5, w: dotR * 3, h: dotR * 3, type: 'dot', owner: `sta_${id}` });
  }

  // Per-station offset with CONSISTENT ordering.
  // Compact at each station (only spread by routes present),
  // but sorted by global route index to prevent zig-zags.
  // Rule: "per-station compact spread, globally consistent order"
  function routeDotOffset(nodeId, ri) {
    const members = nodeRoutes.get(nodeId);
    // Sort by global route index — same order everywhere
    const sorted = members ? [...members].sort((a, b) => a - b) : [ri];
    const idx = sorted.indexOf(ri);
    const n = sorted.length;
    return (idx - (n - 1) / 2) * trackSpread;
  }

  function buildPath(px, py, qx, qy, midFrac) {
    if (isLTR) {
      const dx = qx - px, dyAbs = Math.abs(qy - py);
      if (dyAbs < 0.5) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
      const midX = px + dx * midFrac;
      const r = Math.min(cornerRadius, dyAbs / 2, Math.abs(dx) / 4);
      const sy = Math.sign(qy - py);
      let d = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
      d += ` L ${(midX - r).toFixed(1)} ${py.toFixed(1)}`;
      d += ` Q ${midX.toFixed(1)} ${py.toFixed(1)} ${midX.toFixed(1)} ${(py + sy * r).toFixed(1)}`;
      d += ` L ${midX.toFixed(1)} ${(qy - sy * r).toFixed(1)}`;
      d += ` Q ${midX.toFixed(1)} ${qy.toFixed(1)} ${(midX + r).toFixed(1)} ${qy.toFixed(1)}`;
      d += ` L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      return { d, jogPos: midX };
    } else {
      const dy = qy - py, dxAbs = Math.abs(qx - px);
      if (dxAbs < 0.5) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
      const midY = py + dy * midFrac;
      const r = Math.min(cornerRadius, dxAbs / 2, Math.abs(dy) / 4);
      const sx = Math.sign(qx - px);
      let d = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
      d += ` L ${px.toFixed(1)} ${(midY - r).toFixed(1)}`;
      d += ` Q ${px.toFixed(1)} ${midY.toFixed(1)} ${(px + sx * r).toFixed(1)} ${midY.toFixed(1)}`;
      d += ` L ${(qx - sx * r).toFixed(1)} ${midY.toFixed(1)}`;
      d += ` Q ${qx.toFixed(1)} ${midY.toFixed(1)} ${qx.toFixed(1)} ${(midY + r).toFixed(1)}`;
      d += ` L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      return { d, jogPos: midY };
    }
  }

  function scorePath(px, py, qx, qy, jogPos, ignore) {
    // Scoring rects use trackSpread for the cross-axis extent (not just
    // lineThickness). This ensures parallel routes at trackSpread distance
    // are detected as conflicts, forcing their jogs to different positions.
    const ts = trackSpread;
    if (isLTR) {
      const h1 = { x: Math.min(px, jogPos) - lt, y: py - ts, w: Math.abs(jogPos - px) + lt * 2, h: ts * 2 };
      const vj = { x: jogPos - ts, y: Math.min(py, qy), w: ts * 2, h: Math.abs(qy - py) };
      const h2 = { x: Math.min(jogPos, qx) - lt, y: qy - ts, w: Math.abs(qx - jogPos) + lt * 2, h: ts * 2 };
      return routeGrid.overlapCount(h1, ignore) + routeGrid.overlapCount(vj, ignore) + routeGrid.overlapCount(h2, ignore);
    } else {
      const v1 = { x: px - ts, y: Math.min(py, jogPos), w: ts * 2, h: Math.abs(jogPos - py) };
      const hj = { x: Math.min(px, qx), y: jogPos - ts, w: Math.abs(qx - px), h: ts * 2 };
      const v2 = { x: qx - ts, y: Math.min(jogPos, qy), w: ts * 2, h: Math.abs(qy - jogPos) };
      return routeGrid.overlapCount(v1, ignore) + routeGrid.overlapCount(hj, ignore) + routeGrid.overlapCount(v2, ignore);
    }
  }

  function registerPath(px, py, qx, qy, jogPos, owner) {
    if (isLTR) {
      routeGrid.placeLine(px, py, jogPos, py, lt, owner);
      routeGrid.placeLine(jogPos, py, jogPos, qy, lt, owner);
      routeGrid.placeLine(jogPos, qy, qx, qy, lt, owner);
    } else {
      routeGrid.placeLine(px, py, px, jogPos, lt, owner);
      routeGrid.placeLine(px, jogPos, qx, jogPos, lt, owner);
      routeGrid.placeLine(qx, jogPos, qx, qy, lt, owner);
    }
  }

  // H-V-H-V-H detour routing: when straight H-V-H can't avoid crossings,
  // route around the obstacle via a detour lane above or below.
  function tryDetourRoute(px, py, qx, qy, owner, ignore) {
    const detourDist = 20 * s; // how far to detour above/below
    const dx = qx - px;

    if (isLTR) {
      // Try detour above (py - detourDist) and below (py + detourDist)
      // Also try detour above/below destination: qy ± detourDist
      const detourYs = [
        Math.min(py, qy) - detourDist,
        Math.max(py, qy) + detourDist,
      ];
      const jogFracs = [0.2, 0.35, 0.5, 0.65, 0.8];

      let bestD = null, bestScore = Infinity;
      for (const detourY of detourYs) {
        for (const frac1 of [0.15, 0.25, 0.35]) {
          const frac2 = 1 - frac1;
          const jogX1 = px + dx * frac1;
          const jogX2 = px + dx * frac2;
          const r = Math.min(cornerRadius, Math.abs(detourY - py) / 2, Math.abs(dx) / 8);
          if (r < 1) continue;

          // Score the 5 segments
          const segs = [
            { x: Math.min(px, jogX1)-lt, y: py-lt*2, w: Math.abs(jogX1-px)+lt*2, h: lt*4 },
            { x: jogX1-lt, y: Math.min(py, detourY), w: lt*2, h: Math.abs(detourY-py) },
            { x: Math.min(jogX1, jogX2)-lt, y: detourY-lt*2, w: Math.abs(jogX2-jogX1)+lt*2, h: lt*4 },
            { x: jogX2-lt, y: Math.min(detourY, qy), w: lt*2, h: Math.abs(qy-detourY) },
            { x: Math.min(jogX2, qx)-lt, y: qy-lt*2, w: Math.abs(qx-jogX2)+lt*2, h: lt*4 },
          ];
          let score = 0;
          for (const seg of segs) score += routeGrid.overlapCount(seg, ignore);

          if (score < bestScore) {
            bestScore = score;
            const sy1 = Math.sign(detourY - py), sy2 = Math.sign(qy - detourY);
            let d = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
            d += ` L ${(jogX1 - r).toFixed(1)} ${py.toFixed(1)}`;
            d += ` Q ${jogX1.toFixed(1)} ${py.toFixed(1)} ${jogX1.toFixed(1)} ${(py + sy1 * r).toFixed(1)}`;
            d += ` L ${jogX1.toFixed(1)} ${(detourY - sy1 * r).toFixed(1)}`;
            d += ` Q ${jogX1.toFixed(1)} ${detourY.toFixed(1)} ${(jogX1 + Math.sign(dx) * r).toFixed(1)} ${detourY.toFixed(1)}`;
            d += ` L ${(jogX2 - Math.sign(dx) * r).toFixed(1)} ${detourY.toFixed(1)}`;
            d += ` Q ${jogX2.toFixed(1)} ${detourY.toFixed(1)} ${jogX2.toFixed(1)} ${(detourY + sy2 * r).toFixed(1)}`;
            d += ` L ${jogX2.toFixed(1)} ${(qy - sy2 * r).toFixed(1)}`;
            d += ` Q ${jogX2.toFixed(1)} ${qy.toFixed(1)} ${(jogX2 + Math.sign(dx) * r).toFixed(1)} ${qy.toFixed(1)}`;
            d += ` L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            bestD = d;

            if (score === 0) {
              // Register all 5 segments
              routeGrid.placeLine(px, py, jogX1, py, lt, owner);
              routeGrid.placeLine(jogX1, py, jogX1, detourY, lt, owner);
              routeGrid.placeLine(jogX1, detourY, jogX2, detourY, lt, owner);
              routeGrid.placeLine(jogX2, detourY, jogX2, qy, lt, owner);
              routeGrid.placeLine(jogX2, qy, qx, qy, lt, owner);
              return { d: bestD, score: 0 };
            }
          }
        }
      }
      if (bestD && bestScore < Infinity) {
        // Register best detour even if imperfect
        const frac1 = 0.25, frac2 = 0.75;
        const jogX1 = px + dx * frac1, jogX2 = px + dx * frac2;
        const detourY = bestScore === 0 ? 0 : (Math.min(py,qy) - detourDist); // approximate
        routeGrid.placeLine(px, py, jogX1, py, lt, owner);
        routeGrid.placeLine(jogX1, py, jogX1, detourY, lt, owner);
        routeGrid.placeLine(jogX1, detourY, jogX2, detourY, lt, owner);
        routeGrid.placeLine(jogX2, detourY, jogX2, qy, lt, owner);
        routeGrid.placeLine(jogX2, qy, qx, qy, lt, owner);
        return { d: bestD, score: bestScore };
      }
      return null;
    } else {
      // TTB: V-H-V-H-V detour
      const dy = qy - py;
      const detourXs = [
        Math.min(px, qx) - detourDist,
        Math.max(px, qx) + detourDist,
      ];

      let bestD = null, bestScore = Infinity;
      for (const detourX of detourXs) {
        for (const frac1 of [0.15, 0.25, 0.35]) {
          const frac2 = 1 - frac1;
          const jogY1 = py + dy * frac1;
          const jogY2 = py + dy * frac2;
          const r = Math.min(cornerRadius, Math.abs(detourX - px) / 2, Math.abs(dy) / 8);
          if (r < 1) continue;

          const segs = [
            { x: px-lt*2, y: Math.min(py, jogY1), w: lt*4, h: Math.abs(jogY1-py) },
            { x: Math.min(px, detourX), y: jogY1-lt, w: Math.abs(detourX-px), h: lt*2 },
            { x: detourX-lt*2, y: Math.min(jogY1, jogY2), w: lt*4, h: Math.abs(jogY2-jogY1) },
            { x: Math.min(detourX, qx), y: jogY2-lt, w: Math.abs(qx-detourX), h: lt*2 },
            { x: qx-lt*2, y: Math.min(jogY2, qy), w: lt*4, h: Math.abs(qy-jogY2) },
          ];
          let score = 0;
          for (const seg of segs) score += routeGrid.overlapCount(seg, ignore);

          if (score < bestScore) {
            bestScore = score;
            const sx1 = Math.sign(detourX - px), sx2 = Math.sign(qx - detourX);
            let d = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
            d += ` L ${px.toFixed(1)} ${(jogY1 - r * Math.sign(dy)).toFixed(1)}`;
            d += ` Q ${px.toFixed(1)} ${jogY1.toFixed(1)} ${(px + sx1 * r).toFixed(1)} ${jogY1.toFixed(1)}`;
            d += ` L ${(detourX - sx1 * r).toFixed(1)} ${jogY1.toFixed(1)}`;
            d += ` Q ${detourX.toFixed(1)} ${jogY1.toFixed(1)} ${detourX.toFixed(1)} ${(jogY1 + Math.sign(dy) * r).toFixed(1)}`;
            d += ` L ${detourX.toFixed(1)} ${(jogY2 - Math.sign(dy) * r).toFixed(1)}`;
            d += ` Q ${detourX.toFixed(1)} ${jogY2.toFixed(1)} ${(detourX + sx2 * r).toFixed(1)} ${jogY2.toFixed(1)}`;
            d += ` L ${(qx - sx2 * r).toFixed(1)} ${jogY2.toFixed(1)}`;
            d += ` Q ${qx.toFixed(1)} ${jogY2.toFixed(1)} ${qx.toFixed(1)} ${(jogY2 + Math.sign(dy) * r).toFixed(1)}`;
            d += ` L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            bestD = d;

            if (score === 0) {
              routeGrid.placeLine(px, py, px, jogY1, lt, owner);
              routeGrid.placeLine(px, jogY1, detourX, jogY1, lt, owner);
              routeGrid.placeLine(detourX, jogY1, detourX, jogY2, lt, owner);
              routeGrid.placeLine(detourX, jogY2, qx, jogY2, lt, owner);
              routeGrid.placeLine(qx, jogY2, qx, qy, lt, owner);
              return { d: bestD, score: 0 };
            }
          }
        }
      }
      if (bestD && bestScore < Infinity) {
        const jogY1 = py + dy * 0.25, jogY2 = py + dy * 0.75;
        const detourX = Math.min(px,qx) - detourDist;
        routeGrid.placeLine(px, py, px, jogY1, lt, owner);
        routeGrid.placeLine(px, jogY1, detourX, jogY1, lt, owner);
        routeGrid.placeLine(detourX, jogY1, detourX, jogY2, lt, owner);
        routeGrid.placeLine(detourX, jogY2, qx, jogY2, lt, owner);
        routeGrid.placeLine(qx, jogY2, qx, qy, lt, owner);
        return { d: bestD, score: bestScore };
      }
      return null;
    }
  }

  // Collect all segments with endpoints
  const allSegments = [];
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const fp = stationPos.get(fromId), tp = stationPos.get(toId);
      if (!fp || !tp) continue;
      const dotOff1 = routeDotOffset(fromId, ri);
      const dotOff2 = routeDotOffset(toId, ri);
      allSegments.push({
        ri, fromId, toId,
        px: isLTR ? fp.x : fp.x + dotOff1,
        py: isLTR ? fp.y + dotOff1 : fp.y,
        qx: isLTR ? tp.x : tp.x + dotOff2,
        qy: isLTR ? tp.y + dotOff2 : tp.y,
        fromLayer: rank.get(fromId),
        toLayer: rank.get(toId),
      });
    }
  }

  // Sort: process by layer order, then SHORTEST route first.
  // GA discovery: branches first, trunk last. When branch routes are
  // placed first, they establish paths in clear space. The trunk,
  // placed last, has the most connectivity and benefits most from
  // seeing all other routes — it can route around them using the
  // occupancy grid.
  // Rule: "branches first, trunk adapts" (GA-validated, reverses
  // the intuitive trunk-first approach)
  const routeLength = new Map();
  for (let ri = 0; ri < routes.length; ri++) routeLength.set(ri, routes[ri].nodes.length);
  allSegments.sort((a, b) =>
    a.fromLayer - b.fromLayer ||
    (routeLength.get(a.ri) || 0) - (routeLength.get(b.ri) || 0) ||
    a.ri - b.ri
  );

  // ── Pre-assign complementary jog positions at fan-in/fan-out ────
  // At stations where multiple segments converge or diverge, assign
  // staggered midFrac hints so their jogs don't overlap.
  // Rule: "converging routes get complementary jog positions"
  const jogHints = new Map(); // "ri:from→to" → suggested midFrac

  // Group outgoing segments by source station
  const outgoing = new Map(); // stationId → [segments]
  const incoming = new Map(); // stationId → [segments]
  for (const seg of allSegments) {
    if (!outgoing.has(seg.fromId)) outgoing.set(seg.fromId, []);
    outgoing.get(seg.fromId).push(seg);
    if (!incoming.has(seg.toId)) incoming.set(seg.toId, []);
    incoming.get(seg.toId).push(seg);
  }

  // For fan-out stations (multiple outgoing to different destinations)
  for (const [stationId, segs] of outgoing) {
    const uniqueDests = new Set(segs.map(s => s.toId));
    if (uniqueDests.size <= 1) continue;
    // Sort by destination cross-axis position
    const sorted = [...segs].sort((a, b) => {
      const crossA = isLTR ? a.qy : a.qx;
      const crossB = isLTR ? b.qy : b.qx;
      return crossA - crossB;
    });
    // Wide spread: 0.12 to 0.88 — maximum separation between jogs
    for (let i = 0; i < sorted.length; i++) {
      const mf = sorted.length === 1 ? 0.5 : 0.12 + (i / (sorted.length - 1)) * 0.76;
      jogHints.set(`${sorted[i].ri}:${sorted[i].fromId}\u2192${sorted[i].toId}`, mf);
    }
  }

  // For fan-in stations (multiple incoming from different sources)
  for (const [stationId, segs] of incoming) {
    const uniqueSrcs = new Set(segs.map(s => s.fromId));
    if (uniqueSrcs.size <= 1) continue;
    // Sort by source cross-axis position (reversed: top source → late jog)
    const sorted = [...segs].sort((a, b) => {
      const crossA = isLTR ? a.py : a.px;
      const crossB = isLTR ? b.py : b.px;
      return crossA - crossB;
    });
    // Wide spread reversed: top routes jog late, bottom jog early
    for (let i = 0; i < sorted.length; i++) {
      const key = `${sorted[i].ri}:${sorted[i].fromId}\u2192${sorted[i].toId}`;
      if (!jogHints.has(key)) {
        const mf = sorted.length === 1 ? 0.5 : 0.88 - (i / (sorted.length - 1)) * 0.76;
        jogHints.set(key, mf);
      }
    }
  }

  // Route each segment: use hint if available, else try all candidates
  const segmentPaths = new Map();
  const candidates = [0.12, 0.18, 0.24, 0.30, 0.36, 0.42, 0.48, 0.52, 0.58, 0.64, 0.70, 0.76, 0.82, 0.88];

  for (const seg of allSegments) {
    const { ri, fromId, toId, px, py, qx, qy } = seg;
    const crossDiff = isLTR ? Math.abs(qy - py) : Math.abs(qx - px);

    const layerSpan = Math.abs((seg.toLayer ?? 0) - (seg.fromLayer ?? 0));
    if (crossDiff < trackSpread * 1.2 && layerSpan <= 1) {
      // Small Y diff: draw horizontal at source Y, then short vertical
      // step at destination (hidden by station dot). No diagonals ever.
      // H-step: (px,py) → (qx,py), V-step: (qx,py) → (qx,qy)
      const d = isLTR
        ? `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`
        : `M ${px.toFixed(1)} ${py.toFixed(1)} L ${px.toFixed(1)} ${qy.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
      routeGrid.placeLine(px, py, qx, isLTR ? py : qy, lt, `r${ri}_${fromId}_${toId}`);
      routeGrid.placeLine(isLTR ? qx : px, isLTR ? py : qy, qx, qy, lt, `r${ri}_${fromId}_${toId}`);
      segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, d);
      continue;
    }

    const owner = `r${ri}_${fromId}_${toId}`;
    // Ignore: own path, endpoint stations, own route's other segments.
    // Do NOT ignore parallel routes on same segment — their jogs need
    // separation even though their horizontal runs are at different Y.
    const ignore = new Set([owner, `sta_${fromId}`, `sta_${toId}`]);
    // Ignore own route's segments (continuity, not obstacles)
    for (let k = 0; k < routes[ri].nodes.length - 1; k++) {
      ignore.add(`r${ri}_${routes[ri].nodes[k]}_${routes[ri].nodes[k + 1]}`);
    }

    let bestD = null, bestScore = Infinity, bestJog = null;
    // Use hint from fan-in/fan-out pre-assignment
    const hintKey = `${ri}:${fromId}\u2192${toId}`;
    const hint = jogHints.get(hintKey);

    // If hint exists, try it first. If it scores 0, use it immediately
    // (don't let scoring find a "better" position that creates overlays).
    if (hint !== undefined) {
      const { d, jogPos } = buildPath(px, py, qx, qy, hint);
      if (jogPos !== null) {
        const score = scorePath(px, py, qx, qy, jogPos, ignore);
        if (score === 0) {
          registerPath(px, py, qx, qy, jogPos, owner);
          segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, d);
          continue; // skip full search — hint is clean
        }
        bestD = d; bestScore = score; bestJog = jogPos;
      }
    }

    // Full search: try all candidates (or hint + candidates if hint scored > 0)
    const searchCandidates = hint !== undefined
      ? candidates.filter(c => Math.abs(c - hint) > 0.05)
      : candidates;
    for (const mf of searchCandidates) {
      const { d, jogPos } = buildPath(px, py, qx, qy, mf);
      if (jogPos === null) { bestD = d; bestJog = null; break; }
      const score = scorePath(px, py, qx, qy, jogPos, ignore);
      if (score < bestScore) { bestScore = score; bestD = d; bestJog = jogPos; }
      if (score === 0) break;
    }

    // If all H-V-H candidates have crossings, try H-V-H-V-H detour routing.
    // Only use detour if it achieves ZERO crossings — a detour with crossings
    // is worse than a simple H-V-H with crossings (longer path, more visual noise).
    if (bestScore > 0) {
      const detourResult = tryDetourRoute(px, py, qx, qy, owner, ignore);
      if (detourResult && detourResult.score === 0) {
        bestD = detourResult.d;
        bestScore = 0;
        bestJog = 'detour';
      }
    }

    if (bestJog === 'detour') {
      // Detour path registered inside tryDetourRoute
    } else if (bestJog !== null) {
      registerPath(px, py, qx, qy, bestJog, owner);
    } else {
      routeGrid.placeLine(px, py, qx, qy, lt, owner);
    }
    segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, bestD);
  }

  // ── Multi-pass refinement ────────────────────────────────────
  // After initial placement, re-route each segment against the final
  // grid state. Removes the segment first, then re-routes, giving it
  // the chance to find a better path now that all other routes are placed.
  // Rule: "for each segment, remove → re-score → re-place if improved"
  for (let pass = 0; pass < 2; pass++) {
    for (const seg of allSegments) {
      const { ri, fromId, toId, px, py, qx, qy } = seg;
      const crossDiff = isLTR ? Math.abs(qy - py) : Math.abs(qx - px);
      if (crossDiff < trackSpread * 1.2) continue;

      const owner = `r${ri}_${fromId}_${toId}`;
      // Remove this segment's grid entries
      routeGrid.removeOwner(owner);

      const ignore = new Set([owner, `sta_${fromId}`, `sta_${toId}`]);
      const edgeMembers = segmentRoutes.get(`${fromId}\u2192${toId}`) || [];
      for (const otherRi of edgeMembers) ignore.add(`r${otherRi}_${fromId}_${toId}`);
      for (let k = 0; k < routes[ri].nodes.length - 1; k++) {
        ignore.add(`r${ri}_${routes[ri].nodes[k]}_${routes[ri].nodes[k + 1]}`);
      }

      let bestD = null, bestScore = Infinity, bestJog = null;
      for (const mf of candidates) {
        const { d, jogPos } = buildPath(px, py, qx, qy, mf);
        if (jogPos === null) { bestD = d; bestJog = null; break; }
        const score = scorePath(px, py, qx, qy, jogPos, ignore);
        if (score < bestScore) { bestScore = score; bestD = d; bestJog = jogPos; }
        if (score === 0) break;
      }

      if (bestScore > 0) {
        const detourResult = tryDetourRoute(px, py, qx, qy, owner, ignore);
        if (detourResult && detourResult.score === 0) {
          bestD = detourResult.d; bestScore = 0; bestJog = 'detour';
        }
      }

      if (bestJog === 'detour') { /* registered inside tryDetourRoute */ }
      else if (bestJog !== null) registerPath(px, py, qx, qy, bestJog, owner);
      else routeGrid.placeLine(px, py, qx, qy, lt, owner);
      segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, bestD);
    }
  }

  // ── Card re-placement: check cards against route grid ─────────
  // Cards placed in Phase 5 may overlap with routes built in Phase 6.
  // Re-place any conflicting cards using the route grid.
  for (const nd of nodes) {
    const cp = cardPlacements.get(nd.id);
    if (!cp) continue;
    const pos = stationPos.get(nd.id);
    if (!pos) continue;

    // Check if current card position overlaps any route
    const overlaps = routeGrid.overlapCount(cp.rect, new Set([`card_${nd.id}`, `sta_${nd.id}`]));
    if (overlaps === 0) continue;

    // Try all candidates again, now checking against route grid too
    const { cardW, cardH, cardPadX: cpx, cardPadY: cpy } = cp;
    const gap = 6 * s;
    let candidates;
    if (isLTR) {
      candidates = [
        { x: pos.x - cardW / 2, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2, y: pos.y - dotR - gap - cardH },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: pos.y + dotR + gap },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: pos.y - dotR - gap - cardH },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: pos.y - dotR - gap - cardH },
        { x: pos.x - cardW / 2, y: pos.y + dotR + gap * 3 },
        { x: pos.x - cardW / 2, y: pos.y - dotR - gap * 3 - cardH },
      ];
    } else {
      candidates = [
        { x: pos.x + dotR + gap, y: pos.y - cardH / 2 },
        { x: pos.x - dotR - gap - cardW, y: pos.y - cardH / 2 },
        { x: pos.x + dotR + gap * 3, y: pos.y - cardH / 2 },
        { x: pos.x - dotR - gap * 3 - cardW, y: pos.y - cardH / 2 },
        { x: pos.x + dotR + gap, y: pos.y },
        { x: pos.x - dotR - gap - cardW, y: pos.y },
      ];
    }

    grid.removeOwner(`card_${nd.id}`);
    let replaced = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nd.id}` };
      const gridOK = grid.canPlace(rect);
      const routeOK = routeGrid.overlapCount(rect, new Set([`card_${nd.id}`, `sta_${nd.id}`])) === 0;
      if (gridOK && routeOK) {
        grid.place(rect);
        cardPlacements.set(nd.id, { rect, cardW, cardH, cardPadX: cpx, cardPadY: cpy });
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      // Keep original position as fallback
      grid.place(cp.rect);
    }
  }

  // Assemble per-route path arrays
  // Route weight: data-driven if available, otherwise structural heuristic.
  // Priority: route.frequency > sum(node.count) > route length
  const routeWeight = new Map();
  let maxWeight = 0;
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    let w;
    if (route.frequency !== undefined) {
      w = route.frequency;
    } else {
      // Sum node counts along route as proxy for frequency
      let countSum = 0, hasCount = false;
      for (const nodeId of route.nodes) {
        const nd = nodeMap.get(nodeId);
        const c = nd?.count ?? nd?.times;
        if (c !== undefined) { countSum += c; hasCount = true; }
      }
      w = hasCount ? countSum : route.nodes.length;
    }
    routeWeight.set(ri, w);
    if (w > maxWeight) maxWeight = w;
  }

  let trunkRi = 0;
  for (let ri = 1; ri < routes.length; ri++) {
    if (routeWeight.get(ri) > routeWeight.get(trunkRi)) trunkRi = ri;
  }

  const routePaths = [];
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    const color = routeColors.get(ri);
    const weight = routeWeight.get(ri) || 1;
    const relWeight = maxWeight > 0 ? weight / maxWeight : 1;
    // Thickness and opacity scale with relative weight
    const thick = lineThickness * (0.6 + 0.6 * relWeight);
    const op = 0.4 + 0.4 * relWeight;
    const segments = [];
    for (let i = 1; i < route.nodes.length; i++) {
      const key = `${ri}:${route.nodes[i - 1]}\u2192${route.nodes[i]}`;
      const d = segmentPaths.get(key);
      if (d) segments.push({
        d, color,
        thickness: thick,
        opacity: op,
        dashed: false,
        fromId: route.nodes[i - 1],
        toId: route.nodes[i],
      });
    }
    routePaths.push({ ri, color, isTrunk: ri === trunkRi, relWeight, segments });
  }

  // Extra edges
  const routeEdgeSet = new Set();
  routes.forEach(route => {
    for (let i = 1; i < route.nodes.length; i++)
      routeEdgeSet.add(`${route.nodes[i - 1]}\u2192${route.nodes[i]}`);
  });

  const extraEdges = [];
  for (const [from, to] of edges) {
    if (routeEdgeSet.has(`${from}\u2192${to}`)) continue;
    const p = stationPos.get(from), q = stationPos.get(to);
    if (!p || !q) continue;

    let d;
    if (isLTR) {
      const dx = q.x - p.x, dyAbs = Math.abs(q.y - p.y);
      if (dyAbs < 0.5) { d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }
      else {
        const midX = p.x + dx / 2, r = Math.min(cornerRadius, dyAbs / 2, Math.abs(dx) / 4);
        const sy = Math.sign(q.y - p.y);
        d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(midX - r).toFixed(1)} ${p.y.toFixed(1)} Q ${midX.toFixed(1)} ${p.y.toFixed(1)} ${midX.toFixed(1)} ${(p.y + sy * r).toFixed(1)} L ${midX.toFixed(1)} ${(q.y - sy * r).toFixed(1)} Q ${midX.toFixed(1)} ${q.y.toFixed(1)} ${(midX + r).toFixed(1)} ${q.y.toFixed(1)} L ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      }
    } else {
      const dy = q.y - p.y, dxAbs = Math.abs(q.x - p.x);
      if (dxAbs < 0.5) { d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }
      else {
        const midY = p.y + dy / 2, r = Math.min(cornerRadius, dxAbs / 2, Math.abs(dy) / 4);
        const sx = Math.sign(q.x - p.x);
        d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${p.x.toFixed(1)} ${(midY - r).toFixed(1)} Q ${p.x.toFixed(1)} ${midY.toFixed(1)} ${(p.x + sx * r).toFixed(1)} ${midY.toFixed(1)} L ${(q.x - sx * r).toFixed(1)} ${midY.toFixed(1)} Q ${q.x.toFixed(1)} ${midY.toFixed(1)} ${q.x.toFixed(1)} ${(midY + r).toFixed(1)} L ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      }
    }
    extraEdges.push({ d, color: theme.muted || '#999', thickness: 1.5 * s, opacity: 0.2, dashed: true });
  }

  // Dimensions
  let maxX = margin.left, maxY = margin.top;
  for (const [, pos] of stationPos) { maxX = Math.max(maxX, pos.x); maxY = Math.max(maxY, pos.y); }
  for (const [, cp] of cardPlacements) {
    maxX = Math.max(maxX, cp.rect.x + cp.rect.w);
    maxY = Math.max(maxY, cp.rect.y + cp.rect.h);
  }
  const totalWidth = maxX + margin.right;
  const totalHeight = maxY + margin.bottom;

  return {
    stationPos, cardPlacements, routePaths, extraEdges,
    width: totalWidth, height: totalHeight,
    layers, routes, routeColors, nodeRoutes, segmentRoutes,
    scale: s, theme, fontSize, fsMetric, isLTR,
    cardPadX, cardPadY, cardRadius, dotR,
    lineThickness, trackSpread, trunkRi,
  };
}
