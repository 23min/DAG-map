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
  const jogSpread = 12 * s; // jog markers always use full spread, even in bundling
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

  // Late-start adjustment: source nodes (no parents) that connect to nodes
  // far ahead should be placed just before their children, not at layer 0.
  // Rule: "a component arriving at step 5 should appear at step 4, not step 0"
  for (const nd of nodes) {
    const parents = parentsOf.get(nd.id) || [];
    if (parents.length > 0) continue; // not a source
    const children = childrenOf.get(nd.id) || [];
    if (children.length === 0) continue;
    const minChildRank = Math.min(...children.map(c => rank.get(c) ?? 0));
    if (minChildRank > 1) {
      // Shift this source to just before its earliest child
      rank.set(nd.id, minChildRank - 1);
    }
  }
  // Same for sinks: nodes with no children that connect from early layers
  // should be placed just after their parents, not at the last layer.
  for (const nd of nodes) {
    const children = childrenOf.get(nd.id) || [];
    if (children.length > 0) continue; // not a sink
    const parents = parentsOf.get(nd.id) || [];
    if (parents.length === 0) continue;
    const maxParentRank = Math.max(...parents.map(p => rank.get(p) ?? 0));
    if (maxParentRank < maxRank - 1) {
      rank.set(nd.id, maxParentRank + 1);
    }
  }

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

  // ── Phase 2b: Route-aware ordering refinement ───────────────────
  // Barycenter uses topology (parent/child positions). This pass adds
  // route continuity: if routes R0,R2 pass through A1 at position 0,
  // then B1 (also used by R0) should prefer position 0 in the next layer.
  // This prevents criss-cross assignments where same-route nodes end up
  // on opposite sides of adjacent layers.
  const earlyRoutes = options.routes || [];
  if (earlyRoutes.length > 0) {
    // Build route membership per node
    const routeOf = new Map();
    nodes.forEach(nd => routeOf.set(nd.id, new Set()));
    for (let ri = 0; ri < earlyRoutes.length; ri++) {
      for (const nodeId of earlyRoutes[ri].nodes) routeOf.get(nodeId)?.add(ri);
    }

    for (let iter = 0; iter < 8; iter++) {
      const forward = iter % 2 === 0;
      const start = forward ? 1 : layers.length - 2;
      const end = forward ? layers.length : -1;
      const step = forward ? 1 : -1;

      for (let li = start; li !== end; li += step) {
        const layer = layers[li];
        const prevLayer = layers[li - step];
        if (!prevLayer || layer.length < 2) continue;

        // For each node in this layer, compute a route-weighted position:
        // average position of same-route nodes in the previous layer
        for (const id of layer) {
          const myRoutes = routeOf.get(id);
          if (!myRoutes || myRoutes.size === 0) continue;

          let weightedSum = 0, weightCount = 0;
          for (const prevId of prevLayer) {
            const prevRoutes = routeOf.get(prevId);
            if (!prevRoutes) continue;
            // Count shared routes as weight
            let shared = 0;
            for (const r of myRoutes) if (prevRoutes.has(r)) shared++;
            if (shared > 0) {
              weightedSum += nodeOrder.get(prevId) * shared;
              weightCount += shared;
            }
          }
          if (weightCount > 0) {
            // Blend route-aware position with current barycenter position
            const routePos = weightedSum / weightCount;
            const currentPos = nodeOrder.get(id);
            nodeOrder.set(id, currentPos * 0.3 + routePos * 0.7);
          }
        }

        layer.sort((a, b) => nodeOrder.get(a) - nodeOrder.get(b));
        layer.forEach((id, i) => nodeOrder.set(id, i));
      }
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
    const groupGap = stationGap * 0.5; // extra separation between divergent groups
    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const [sig, members] = sortedGroups[gi];
      if (gi > 0) curY += groupGap; // extra gap between groups
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

  // Geometric gap constraint: each layer gap must be wide enough for
  // route transitions to have clean entry/exit H segments AND not squeeze
  // jog positions against endpoints.
  //
  // For H-V-H (Mode 2): need dx >= 2 * minEntry + 2 * cornerRadius.
  // For Bezier 45° (Mode 2.5): need dx >= dy + 2 * minEntry + 2 * cornerRadius.
  //
  // Both are predictable at positioning time from dy = |src_cross - dst_cross|
  // plus port spread. Widening upfront avoids short entry/exit artifacts.
  const maxPortSpread = Math.max(...layers.map(l => l.length)) * trackSpread;
  const minEntry = Math.max(15, stationGap * 0.25);
  for (let li = 0; li < maxRank; li++) {
    let maxDy = 0;
    const srcSet = new Set(layers[li]);
    const dstSet = new Set(layers[li + 1]);
    for (const route of (options.routes || [])) {
      for (let i = 1; i < route.nodes.length; i++) {
        if (srcSet.has(route.nodes[i - 1]) && dstSet.has(route.nodes[i])) {
          const srcCross = stationCrossPos.get(route.nodes[i - 1]) ?? 0;
          const dstCross = stationCrossPos.get(route.nodes[i]) ?? 0;
          maxDy = Math.max(maxDy, Math.abs(srcCross - dstCross));
        }
      }
    }
    // Effective dy includes port spread (routes at opposite ports of adjacent pills)
    const effectiveDy = maxDy + maxPortSpread * 0.5;
    // H-V-H base requirement: room for entries + jog corner radius
    const hvhRequired = 2 * minEntry + 2 * cornerRadius;
    // Bezier r = 2 * cornerRadius (big visible arcs). Required dx = dy + 2*minEntry + 2*r
    const bezierR = 2 * cornerRadius;
    const bezierRequired = effectiveDy + 2 * minEntry + 2 * bezierR;
    const required = options.routing === 'bezier' ? bezierRequired : hvhRequired;
    adaptiveGaps[li] = Math.max(adaptiveGaps[li], required * 1.1);
  }

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

  // ── Edge weight → layer gap scaling ────────────────────────────
  // If edges carry time/distance/weight data, use it to scale the gap
  // between layers. Longer edges get proportionally wider gaps.
  // This creates natural variable spacing — not all steps are equal.
  //
  // Accepts: options.edgeWeights (Map "from→to" → number)
  //   or edge objects with .weight property
  //   or edge arrays with [from, to, weight]
  const edgeWeights = new Map();
  if (options.edgeWeights) {
    // Explicit weight map
    for (const [key, w] of Object.entries(options.edgeWeights)) edgeWeights.set(key, w);
  } else {
    // Check edge format for inline weights
    for (const e of edges) {
      if (Array.isArray(e) && e.length >= 3) edgeWeights.set(`${e[0]}\u2192${e[1]}`, e[2]);
      else if (e.weight !== undefined) edgeWeights.set(`${e.from || e[0]}\u2192${e.to || e[1]}`, e.weight);
    }
  }

  // If we have edge weights, compute per-gap weight as max weight of edges crossing that gap
  const weightedGaps = [...adaptiveGaps];
  if (edgeWeights.size > 0) {
    const gapWeights = new Array(maxRank + 1).fill(1);
    for (const [key, w] of edgeWeights) {
      const [from, to] = key.split('\u2192');
      const fromRank = rank.get(from), toRank = rank.get(to);
      if (fromRank !== undefined && toRank !== undefined) {
        for (let li = Math.min(fromRank, toRank); li < Math.max(fromRank, toRank); li++) {
          gapWeights[li] = Math.max(gapWeights[li], w);
        }
      }
    }
    // Normalize: max weight → 1.5× base gap, min → 0.6× base gap
    const maxW = Math.max(...gapWeights), minW = Math.min(...gapWeights);
    const range = maxW - minW || 1;
    for (let li = 0; li < weightedGaps.length; li++) {
      const norm = (gapWeights[li] - minW) / range; // 0-1
      const scale = 0.6 + norm * 0.9; // 0.6× to 1.5×
      weightedGaps[li] = (weightedGaps[li] || layerGap) * scale;
    }
  }

  // First pass: assign base positions on the grid
  if (isLTR) {
    let curX = margin.left;
    for (let li = 0; li <= maxRank; li++) {
      for (const id of layers[li]) {
        stationPos.set(id, { x: curX + (junctionOffset.get(id) || 0), y: stationCrossPos.get(id) });
      }
      curX += weightedGaps[li] || layerGap;
    }
  } else {
    let curY = margin.top;
    for (let li = 0; li <= maxRank; li++) {
      for (const id of layers[li]) {
        stationPos.set(id, { x: stationCrossPos.get(id), y: curY + (junctionOffset.get(id) || 0) });
      }
      curY += weightedGaps[li] || layerGap;
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

  // ── Geographic positioning adjustment ──────────────────────────
  // If nodes carry geoX/geoY coordinates, adjust BOTH axes to reflect
  // geographic layout. The Sugiyama grid provides structure; geo coords
  // add realistic variation. Cross-axis uses geo directly (scaled).
  // Primary axis blends grid position with geo position.
  const hasGeo = nodes.some(n => n.geoX !== undefined && n.geoY !== undefined);
  if (hasGeo) {
    const geoNodes = nodes.filter(n => n.geoX !== undefined);
    const geoXs = geoNodes.map(n => n.geoX);
    const geoYs = geoNodes.map(n => n.geoY);
    const geoMinX = Math.min(...geoXs), geoMaxX = Math.max(...geoXs);
    const geoMinY = Math.min(...geoYs), geoMaxY = Math.max(...geoYs);
    const geoRangeX = geoMaxX - geoMinX || 1;
    const geoRangeY = geoMaxY - geoMinY || 1;

    // Target range for geo-mapped positions
    const allPos = [...stationPos.values()];
    const layoutMinX = Math.min(...allPos.map(p => p.x));
    const layoutMaxX = Math.max(...allPos.map(p => p.x));
    const layoutMinY = Math.min(...allPos.map(p => p.y));
    const layoutMaxY = Math.max(...allPos.map(p => p.y));
    const layoutRangeX = layoutMaxX - layoutMinX || layerGap * maxRank;
    const layoutRangeY = layoutMaxY - layoutMinY || stationGap * 5;

    for (const nd of geoNodes) {
      const pos = stationPos.get(nd.id);
      if (!pos) continue;
      const geoMappedX = layoutMinX + ((nd.geoX - geoMinX) / geoRangeX) * layoutRangeX;
      const geoMappedY = layoutMinY + ((nd.geoY - geoMinY) / geoRangeY) * layoutRangeY;
      // Blend: 40% geo for primary axis (preserve layer ordering), 70% for cross axis (geographic shape)
      stationPos.set(nd.id, {
        x: isLTR ? pos.x * 0.6 + geoMappedX * 0.4 : pos.x * 0.3 + geoMappedX * 0.7,
        y: isLTR ? pos.y * 0.3 + geoMappedY * 0.7 : pos.y * 0.6 + geoMappedY * 0.4,
      });
    }

    // Enforce layer ordering: parent's primary axis must be < child's
    // Geo blending can violate this. Fix by pushing violators apart.
    for (let pass = 0; pass < 3; pass++) {
      for (const [from, to] of edges) {
        const fp = stationPos.get(from), tp = stationPos.get(to);
        if (!fp || !tp) continue;
        const minGap = layerGap * 0.4;
        if (isLTR && fp.x >= tp.x - minGap) {
          const mid = (fp.x + tp.x) / 2;
          fp.x = mid - minGap / 2;
          tp.x = mid + minGap / 2;
        } else if (!isLTR && fp.y >= tp.y - minGap) {
          const mid = (fp.y + tp.y) / 2;
          fp.y = mid - minGap / 2;
          tp.y = mid + minGap / 2;
        }
      }
    }

    // Enforce minimum distance between stations in same layer
    for (const layer of layers) {
      if (layer.length < 2) continue;
      const sorted = layer.map(id => ({ id, pos: stationPos.get(id) }))
        .sort((a, b) => (isLTR ? a.pos.y - b.pos.y : a.pos.x - b.pos.x));
      const minDist = stationGap * 0.5;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].pos, cur = sorted[i].pos;
        const dist = isLTR ? cur.y - prev.y : cur.x - prev.x;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          if (isLTR) { prev.y -= push; cur.y += push; }
          else { prev.x -= push; cur.x += push; }
        }
      }
    }
  }

  // ── Enforce 45° constraint (BEZIER ONLY, post-positioning) ─────
  // After all positioning passes (neighbor attraction, geo blending),
  // re-check that every route edge has dx >= 2*dy. If not, push the
  // destination station forward in primary axis until it does.
  // Only for bezier rendering — orthogonal H-V-H handles steep dy fine.
  if (options.routing === 'bezier') for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    // Process layers left to right so downstream pushes propagate
    for (let li = 0; li < maxRank; li++) {
      const srcSet = new Set(layers[li]);
      const dstSet = new Set(layers[li + 1]);
      for (const route of (options.routes || [])) {
        for (let i = 1; i < route.nodes.length; i++) {
          if (!srcSet.has(route.nodes[i - 1]) || !dstSet.has(route.nodes[i])) continue;
          const fp = stationPos.get(route.nodes[i - 1]);
          const tp = stationPos.get(route.nodes[i]);
          if (!fp || !tp) continue;
          const dx = isLTR ? Math.abs(tp.x - fp.x) : Math.abs(tp.y - fp.y);
          const dy = isLTR ? Math.abs(tp.y - fp.y) : Math.abs(tp.x - fp.x);
          const minDx = dy + 2 * cornerRadius + 4 * lineThickness; // 45° with fixed corner radius
          if (dx < minDx) {
            // Push all stations in layer li+1 (and beyond) forward
            const push = minDx - dx;
            for (let lj = li + 1; lj < layers.length; lj++) {
              for (const id of layers[lj]) {
                const p = stationPos.get(id);
                if (!p) continue;
                if (isLTR) stationPos.set(id, { x: p.x + push, y: p.y });
                else stationPos.set(id, { x: p.x, y: p.y + push });
              }
            }
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
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
    // Compute station's pill half-span (for multi-route stations)
    const memberCount = nodeRoutes.get(nd.id)?.size ?? 1;
    const halfSpan = memberCount > 1
      ? ((memberCount - 1) / 2) * trackSpread + dotR * 1.5
      : dotR;

    let candidates;
    if (isLTR) {
      // LTR: cards below or above the station pill (outside port range)
      const below = pos.y + halfSpan + gap;
      const above = pos.y - halfSpan - gap - cardH;
      candidates = [
        { x: pos.x - cardW / 2, y: below },
        { x: pos.x - cardW / 2, y: above },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: below },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: below },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: above },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: above },
      ];
    } else {
      // TTB: cards right or left of station pill
      const right = pos.x + halfSpan + gap;
      const left = pos.x - halfSpan - gap - cardW;
      candidates = [
        { x: right, y: pos.y - cardH / 2 },
        { x: left, y: pos.y - cardH / 2 },
        { x: right, y: pos.y },
        { x: left, y: pos.y },
        { x: right, y: pos.y - cardH },
        { x: left, y: pos.y - cardH },
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
    // Station obstacle — small zone around the station center.
    // Multi-route pills don't need huge obstacles: the routes at this station
    // ignore it (it's in their ignore set), and other routes rarely need
    // to pass through the station's pill horizontally anyway.
    routeGrid.place({ x: pos.x - dotR * 1.5, y: pos.y - dotR * 1.5, w: dotR * 3, h: dotR * 3, type: 'dot', owner: `sta_${id}` });
  }

  // Cards NOT registered as obstacles — card placement via halfSpan already
  // puts them outside route Y range (above/below pills). Having them as
  // obstacles forced H-V-H into short-H-and-jog zigzags when cards were
  // anywhere near the route's Y (even for valid horizontal paths).

  // ── Port assignment ────────────────────────────────────────────
  // Each station assigns a fixed port (cross-axis offset) to each route.
  // Port ordering is based on where routes go NEXT (exit port) or came
  // FROM (entry port). Routes heading to higher cross-axis positions
  // get higher ports. This ensures:
  //   1. Routes don't cross unnecessarily between adjacent stations
  //   2. A route enters and exits a station at the same Y
  //   3. End stations can have different port ordering than start stations
  //
  // Rule: "port order follows flow direction — top port goes to top destination"

  // For each station, compute exit-port order (by next station's cross-axis pos)
  // and entry-port order (by prev station's cross-axis pos).
  // Through-stations blend both: a route's port = average of its entry and exit rank.
  const portOffset = new Map(); // "nodeId:ri" → cross-axis offset

  for (const [nodeId, memberSet] of nodeRoutes) {
    const members = [...memberSet];
    if (members.length <= 1) {
      // Single route — centered
      if (members.length === 1) portOffset.set(`${nodeId}:${members[0]}`, 0);
      continue;
    }

    const pos = stationPos.get(nodeId);
    if (!pos) continue;
    const crossAxis = isLTR ? 'y' : 'x';

    // For each route through this station, find prev/next station positions
    const routeInfo = [];
    for (const ri of members) {
      const route = routes[ri];
      const idx = route.nodes.indexOf(nodeId);
      const prevNode = idx > 0 ? route.nodes[idx - 1] : null;
      const nextNode = idx < route.nodes.length - 1 ? route.nodes[idx + 1] : null;
      const prevPos = prevNode ? stationPos.get(prevNode) : null;
      const nextPos = nextNode ? stationPos.get(nextNode) : null;

      // Sort key: exit direction (where route goes next).
      // Fall back to entry direction at terminal stations.
      // Rule: "port order follows flow — top port goes to top destination"
      let sortKey;
      if (nextPos) sortKey = nextPos[crossAxis];
      else if (prevPos) sortKey = prevPos[crossAxis];
      else sortKey = pos[crossAxis] + ri * 0.01;

      routeInfo.push({ ri, sortKey });
    }

    // Sort routes by their flow direction
    routeInfo.sort((a, b) => a.sortKey - b.sortKey);

    // Assign ports centered around 0
    const n = routeInfo.length;
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * trackSpread;
      portOffset.set(`${nodeId}:${routeInfo[i].ri}`, offset);
    }
  }

  function routeDotOffset(nodeId, ri) {
    return portOffset.get(`${nodeId}:${ri}`) ?? 0;
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
    // Three-layer scoring:
    // 1. Hard conflicts (×100) — tracks overlapping station obstacles
    // 2. Soft proximity — routes too close (pheromone gradient)
    // 3. Short-entry penalty — H1 or H2 below minEntryLen looks bad
    //
    // The short-entry penalty is a soft constraint that prefers jogs
    // in the middle of the layer gap over jogs squeezed against endpoints.
    const pw = pheromoneW / 2;
    const proxRange = stationGap * 0.6;
    const minEntryLen = Math.max(15, stationGap * 0.25); // min clean H/V length
    if (isLTR) {
      const h1Len = Math.abs(jogPos - px), h2Len = Math.abs(qx - jogPos);
      const h1 = { x: Math.min(px, jogPos) - lt, y: py - pw, w: h1Len + lt * 2, h: pw * 2 };
      const vj = { x: jogPos - jogSpread, y: Math.min(py, qy), w: jogSpread * 2, h: Math.abs(qy - py) };
      const h2 = { x: Math.min(jogPos, qx) - lt, y: qy - pw, w: h2Len + lt * 2, h: pw * 2 };
      const hard = routeGrid.overlapCount(h1, ignore) + routeGrid.overlapCount(vj, ignore) + routeGrid.overlapCount(h2, ignore);
      const soft = routeGrid.proximityScore(h1, proxRange, ignore) + routeGrid.proximityScore(h2, proxRange, ignore);
      // Short-entry penalty: quadratic ramp up as length drops below min
      const shortH1 = h1Len < minEntryLen ? Math.pow((minEntryLen - h1Len) / minEntryLen, 2) * 15 : 0;
      const shortH2 = h2Len < minEntryLen ? Math.pow((minEntryLen - h2Len) / minEntryLen, 2) * 15 : 0;
      return hard * 100 + soft + shortH1 + shortH2;
    } else {
      const v1Len = Math.abs(jogPos - py), v2Len = Math.abs(qy - jogPos);
      const v1 = { x: px - pw, y: Math.min(py, jogPos), w: pw * 2, h: v1Len };
      const hj = { x: Math.min(px, qx), y: jogPos - jogSpread, w: Math.abs(qx - px), h: jogSpread * 2 };
      const v2 = { x: qx - pw, y: Math.min(jogPos, qy), w: pw * 2, h: v2Len };
      const hard = routeGrid.overlapCount(v1, ignore) + routeGrid.overlapCount(hj, ignore) + routeGrid.overlapCount(v2, ignore);
      const soft = routeGrid.proximityScore(v1, proxRange, ignore) + routeGrid.proximityScore(v2, proxRange, ignore);
      const shortV1 = v1Len < minEntryLen ? Math.pow((minEntryLen - v1Len) / minEntryLen, 2) * 15 : 0;
      const shortV2 = v2Len < minEntryLen ? Math.pow((minEntryLen - v2Len) / minEntryLen, 2) * 15 : 0;
      return hard * 100 + soft + shortV1 + shortV2;
    }
  }

  // Pheromone width: how wide each track segment's repulsion zone is.
  // Wider = stronger stigmergy. Routes within this distance are detected
  // as conflicts. Set to trackSpread so parallel routes at the same Y
  // are forced apart. "There's a track here — stay away."
  const pheromoneW = trackSpread;

  function registerPath(px, py, qx, qy, jogPos, owner) {
    if (isLTR) {
      routeGrid.placeLine(px, py, jogPos, py, pheromoneW, owner);
      routeGrid.placeLine(jogPos, py, jogPos, qy, pheromoneW, owner);
      routeGrid.placeLine(jogPos, qy, qx, qy, pheromoneW, owner);
      // Jog marker: extra-wide obstacle at the jog X
      routeGrid.place({ x: jogPos - jogSpread, y: Math.min(py, qy) - lt, w: jogSpread * 2, h: Math.abs(qy - py) + lt * 2, type: 'jog', owner: owner + '_jog' });
    } else {
      routeGrid.placeLine(px, py, px, jogPos, pheromoneW, owner);
      routeGrid.placeLine(px, jogPos, qx, jogPos, pheromoneW, owner);
      routeGrid.placeLine(qx, jogPos, qx, qy, pheromoneW, owner);
      routeGrid.place({ x: Math.min(px, qx) - lt, y: jogPos - jogSpread, w: Math.abs(qx - px) + lt * 2, h: jogSpread * 2, type: 'jog', owner: owner + '_jog' });
    }
  }

  // H-V-H-V-H detour routing: when straight H-V-H can't avoid crossings,
  // route around the obstacle via a detour lane above or below.
  // Tries multiple detour distances and jog positions.
  function tryDetourRoute(px, py, qx, qy, owner, ignore) {
    const dx = qx - px;

    if (isLTR) {
      // Try multiple detour distances — station obstacles may be tall,
      // so aggressive detours may be needed
      const detourYs = [
        Math.min(py, qy) - stationGap * 0.5,
        Math.max(py, qy) + stationGap * 0.5,
        Math.min(py, qy) - stationGap * 0.8,
        Math.max(py, qy) + stationGap * 0.8,
        Math.min(py, qy) - stationGap * 1.2,
        Math.max(py, qy) + stationGap * 1.2,
      ];
      const jogFracs = [0.2, 0.35, 0.5, 0.65, 0.8];

      let bestD = null, bestScore = Infinity;
      let bestDetourY = null, bestFrac1 = null;
      for (const detourY of detourYs) {
        for (const frac1 of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) {
          const frac2 = 1 - frac1;
          const jogX1 = px + dx * frac1;
          const jogX2 = px + dx * frac2;
          const r = Math.min(cornerRadius, Math.abs(detourY - py) / 2, Math.abs(dx) / 8);
          if (r < 1) continue;

          // Score the 5 segments with proper widths (H uses pheromoneW, V uses lt)
          const pw = pheromoneW;
          const segs = [
            { x: Math.min(px, jogX1)-lt, y: py - pw/2, w: Math.abs(jogX1-px)+lt*2, h: pw },
            { x: jogX1-lt, y: Math.min(py, detourY), w: lt*2, h: Math.abs(detourY-py) },
            { x: Math.min(jogX1, jogX2)-lt, y: detourY - pw/2, w: Math.abs(jogX2-jogX1)+lt*2, h: pw },
            { x: jogX2-lt, y: Math.min(detourY, qy), w: lt*2, h: Math.abs(qy-detourY) },
            { x: Math.min(jogX2, qx)-lt, y: qy-lt*2, w: Math.abs(qx-jogX2)+lt*2, h: lt*4 },
          ];
          let score = 0;
          for (const seg of segs) score += routeGrid.overlapCount(seg, ignore);

          if (score < bestScore) {
            bestScore = score;
            bestDetourY = detourY;
            bestFrac1 = frac1;
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

            if (score === 0) break; // perfect, but keep looking for same score (keep best)
          }
        }
        if (bestScore === 0) break;
      }
      if (bestD && bestScore < Infinity && bestDetourY !== null) {
        // Register using the ACTUAL best parameters found
        const frac2 = 1 - bestFrac1;
        const jogX1 = px + dx * bestFrac1, jogX2 = px + dx * frac2;
        routeGrid.placeLine(px, py, jogX1, py, pheromoneW, owner);
        routeGrid.placeLine(jogX1, py, jogX1, bestDetourY, lt, owner);
        routeGrid.placeLine(jogX1, bestDetourY, jogX2, bestDetourY, pheromoneW, owner);
        routeGrid.placeLine(jogX2, bestDetourY, jogX2, qy, lt, owner);
        routeGrid.placeLine(jogX2, qy, qx, qy, pheromoneW, owner);
        return { d: bestD, score: bestScore };
      }
      return null;
    } else {
      // TTB: V-H-V-H-V detour
      const dy = qy - py;
      const detourXs = [
        Math.min(px, qx) - stationGap * 0.5,
        Math.max(px, qx) + stationGap * 0.5,
        Math.min(px, qx) - stationGap * 0.8,
        Math.max(px, qx) + stationGap * 0.8,
        Math.min(px, qx) - stationGap * 1.2,
        Math.max(px, qx) + stationGap * 1.2,
      ];

      let bestD = null, bestScore = Infinity;
      let bestDetourX = null, bestFrac1 = null;
      for (const detourX of detourXs) {
        for (const frac1 of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) {
          const frac2 = 1 - frac1;
          const jogY1 = py + dy * frac1;
          const jogY2 = py + dy * frac2;
          const r = Math.min(cornerRadius, Math.abs(detourX - px) / 2, Math.abs(dy) / 8);
          if (r < 1) continue;

          const pw = pheromoneW;
          const segs = [
            { x: px - pw/2, y: Math.min(py, jogY1), w: pw, h: Math.abs(jogY1-py) },
            { x: Math.min(px, detourX), y: jogY1 - pw/2, w: Math.abs(detourX-px), h: pw },
            { x: detourX - pw/2, y: Math.min(jogY1, jogY2), w: pw, h: Math.abs(jogY2-jogY1) },
            { x: Math.min(detourX, qx), y: jogY2 - pw/2, w: Math.abs(qx-detourX), h: pw },
            { x: qx - pw/2, y: Math.min(jogY2, qy), w: pw, h: Math.abs(qy-jogY2) },
          ];
          let score = 0;
          for (const seg of segs) score += routeGrid.overlapCount(seg, ignore);

          if (score < bestScore) {
            bestScore = score;
            bestDetourX = detourX;
            bestFrac1 = frac1;
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

            if (score === 0) break;
          }
        }
        if (bestScore === 0) break;
      }
      if (bestD && bestScore < Infinity && bestDetourX !== null) {
        const frac2 = 1 - bestFrac1;
        const jogY1 = py + dy * bestFrac1, jogY2 = py + dy * frac2;
        routeGrid.placeLine(px, py, px, jogY1, pheromoneW, owner);
        routeGrid.placeLine(px, jogY1, bestDetourX, jogY1, lt, owner);
        routeGrid.placeLine(bestDetourX, jogY1, bestDetourX, jogY2, pheromoneW, owner);
        routeGrid.placeLine(bestDetourX, jogY2, qx, jogY2, lt, owner);
        routeGrid.placeLine(qx, jogY2, qx, qy, pheromoneW, owner);
        return { d: bestD, score: bestScore };
      }
      return null;
    }
  }

  // ── Global route-based routing ─────────────────────────────────
  // Routes are processed as WHOLE PATHS, not individual segments.
  // Each route claims a "channel" (cross-axis position) in each gap
  // between layers. Channels act as wide obstacles (strong stigmergy)
  // that push later routes to different positions.
  //
  // Rule: "route as a snake — claim your channel, leave a wide trail"
  //
  // Process order: shortest routes first (fewer constraints, establish
  // clear channels). Longest route (trunk) placed last, adapts around
  // all existing channels.

  const segmentPaths = new Map();
  const candidates = [0.12, 0.18, 0.24, 0.30, 0.36, 0.42, 0.48, 0.52, 0.58, 0.64, 0.70, 0.76, 0.82, 0.88];
  const channelWidth = trackSpread * 2.5; // strong stigmergy: wide channel claim

  // Sort routes: shortest first (branches first, trunk adapts)
  const routeOrder = routes.map((_, ri) => ri)
    .sort((a, b) => routes[a].nodes.length - routes[b].nodes.length);

  for (const ri of routeOrder) {
    const route = routes[ri];
    const owner = `route_${ri}`;

    // Build ignore set: own route's segments + station dots + own cards
    const ignore = new Set();
    for (let k = 0; k < route.nodes.length; k++) {
      ignore.add(`sta_${route.nodes[k]}`);
      ignore.add(`card_${route.nodes[k]}`); // route can pass beside its own stations' cards
    }
    // Ignore own route's everything
    ignore.add(owner);
    for (let k = 0; k < route.nodes.length - 1; k++) {
      ignore.add(`r${ri}_${route.nodes[k]}_${route.nodes[k + 1]}`);
      ignore.add(`r${ri}_${route.nodes[k]}_${route.nodes[k + 1]}_chan`);
    }

    // Route each segment, carrying forward the previous exit Y
    // so the route maintains continuity through stations.
    let prevExitCross = null; // cross-axis position where previous segment ended

    for (let i = 1; i < route.nodes.length; i++) {
      const fromId = route.nodes[i - 1], toId = route.nodes[i];
      const fp = stationPos.get(fromId), tp = stationPos.get(toId);
      if (!fp || !tp) continue;

      const dotOff1 = routeDotOffset(fromId, ri);
      const dotOff2 = routeDotOffset(toId, ri);
      const px = isLTR ? fp.x : fp.x + dotOff1;
      const py = isLTR ? fp.y + dotOff1 : fp.y;
      const qx = isLTR ? tp.x : tp.x + dotOff2;
      const qy = isLTR ? tp.y + dotOff2 : tp.y;
      const segOwner = `r${ri}_${fromId}_${toId}`;

      // Y-continuity: if previous segment exited at a different cross position
      // than this segment's source port, we need to adjust. The route should
      // depart from prevExitCross (where it arrived) not from the port position.
      const startCross = isLTR ? py : px;
      const endCross = isLTR ? qy : qx;
      const effectiveStartCross = (prevExitCross !== null && Math.abs(prevExitCross - startCross) > 0.5)
        ? prevExitCross : startCross;

      // Compute effective start position with Y-continuity
      const epx = isLTR ? px : (fp.x + (effectiveStartCross - fp.x));
      const epy = isLTR ? (fp.y + (effectiveStartCross - fp.y)) : py;

      const crossDiff = Math.abs(endCross - effectiveStartCross);

      // Small port difference: put the V-step on the side that has a pill
      // (multi-route junction), where the pill hides the V-step. Single-route
      // stations use simple circle dots (too small to hide a V-step).
      // If neither side has a pill, just draw straight at epy — any Y mismatch
      // at the destination is tiny because port[single-route] = 0.
      const portDiff = Math.abs(endCross - startCross);
      if (portDiff < dotR * 2.5 && crossDiff < dotR * 2.5) {
        const srcMulti = (nodeRoutes.get(fromId)?.size ?? 1) > 1;
        const dstMulti = (nodeRoutes.get(toId)?.size ?? 1) > 1;
        // Before taking the near-straight shortcut, check that the straight
        // path doesn't pass through other STATION obstacles (other pills/dots
        // on different routes). Parallel routes on the same path are OK —
        // those are expected to bundle alongside.
        const nearStraightY = isLTR ? epy : epy;
        const checkRect = isLTR
          ? { x: Math.min(epx, qx), y: nearStraightY - lt, w: Math.abs(qx - epx), h: lt * 2 }
          : { x: epx - lt, y: Math.min(epy, qy), w: lt * 2, h: Math.abs(qy - epy) };
        // Only count station obstacles as conflicts (owner starts with 'sta_')
        let straightConflict = false;
        for (const item of routeGrid.items) {
          if (!item.owner?.startsWith('sta_')) continue;
          if (ignore.has(item.owner)) continue;
          // Check AABB overlap
          if (!(checkRect.x + checkRect.w < item.x || item.x + item.w < checkRect.x ||
                checkRect.y + checkRect.h < item.y || item.y + item.h < checkRect.y)) {
            straightConflict = true; break;
          }
        }
        if (straightConflict) {
          // Fall through to full routing
        } else {
        let d;
        if (isLTR) {
          if (dstMulti) {
            // V-step at destination (hidden by pill)
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${qx.toFixed(1)} ${epy.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, qx, epy, pheromoneW, segOwner);
            routeGrid.placeLine(qx, epy, qx, qy, lt, segOwner);
            prevExitCross = endCross;
          } else if (srcMulti) {
            // V-step at source (hidden by pill)
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${epx.toFixed(1)} ${qy.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, epx, qy, lt, segOwner);
            routeGrid.placeLine(epx, qy, qx, qy, pheromoneW, segOwner);
            prevExitCross = endCross;
          } else {
            // Both single-route — draw straight at epy (no V-step)
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${qx.toFixed(1)} ${epy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, qx, epy, pheromoneW, segOwner);
            prevExitCross = effectiveStartCross;
          }
        } else {
          if (dstMulti) {
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${epx.toFixed(1)} ${qy.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, epx, qy, pheromoneW, segOwner);
            routeGrid.placeLine(epx, qy, qx, qy, lt, segOwner);
            prevExitCross = endCross;
          } else if (srcMulti) {
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${qx.toFixed(1)} ${epy.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, qx, epy, lt, segOwner);
            routeGrid.placeLine(qx, epy, qx, qy, pheromoneW, segOwner);
            prevExitCross = endCross;
          } else {
            d = `M ${epx.toFixed(1)} ${epy.toFixed(1)} L ${epx.toFixed(1)} ${qy.toFixed(1)}`;
            routeGrid.placeLine(epx, epy, epx, qy, pheromoneW, segOwner);
            prevExitCross = effectiveStartCross;
          }
        }
        segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, d);
        continue;
        } // end else (no straight conflict)
      }

      // Full H-V-H routing with occupancy scoring
      let bestD = null, bestScore = Infinity, bestJog = null;

      for (const mf of candidates) {
        const { d, jogPos } = buildPath(epx, epy, qx, qy, mf);
        if (jogPos === null) {
          // Straight line (same Y endpoints). Score it so detour doesn't
          // fire gratuitously. Check the single H run against obstacles.
          const checkRect = isLTR
            ? { x: Math.min(epx, qx), y: epy - pheromoneW / 2, w: Math.abs(qx - epx), h: pheromoneW }
            : { x: epx - pheromoneW / 2, y: Math.min(epy, qy), w: pheromoneW, h: Math.abs(qy - epy) };
          const straightHard = routeGrid.overlapCount(checkRect, ignore);
          const straightSoft = routeGrid.proximityScore(checkRect, stationGap * 0.6, ignore);
          const score = straightHard * 100 + straightSoft;
          bestD = d; bestJog = null; bestScore = score;
          break;
        }
        const score = scorePath(epx, epy, qx, qy, jogPos, ignore);
        if (score < bestScore) { bestScore = score; bestD = d; bestJog = jogPos; }
        if (score < 100) break; // no hard conflicts — proximity-only score is acceptable
      }

      // Try detour if H-V-H has hard conflicts (score >= 100 = station overlap).
      // Accept detour ONLY if it clears all hard conflicts (score < 100).
      // Soft-conflict H-V-H is better than a longer, still-conflicting detour.
      if (bestScore >= 100) {
        const detourResult = tryDetourRoute(epx, epy, qx, qy, segOwner, ignore);
        if (detourResult && detourResult.score < 100) {
          bestD = detourResult.d; bestScore = detourResult.score; bestJog = 'detour';
        }
      }

      // Register path + WIDE channel claim (strong stigmergy)
      if (bestJog === 'detour') {
        // Detour path registered inside tryDetourRoute
      } else if (bestJog !== null) {
        registerPath(epx, epy, qx, qy, bestJog, segOwner);
        // Claim the channel with a wider obstacle — this is stigmergy.
        // The channel strip makes the jog position a "no-go zone" for
        // future routes, forcing them to find different jog positions.
        if (isLTR) {
          routeGrid.place({
            x: bestJog - channelWidth / 2,
            y: Math.min(epy, qy) - lt,
            w: channelWidth,
            h: Math.abs(qy - epy) + lt * 2,
            type: 'channel', owner: segOwner + '_chan',
          });
        } else {
          routeGrid.place({
            x: Math.min(epx, qx) - lt,
            y: bestJog - channelWidth / 2,
            w: Math.abs(qx - epx) + lt * 2,
            h: channelWidth,
            type: 'channel', owner: segOwner + '_chan',
          });
        }
      } else {
        routeGrid.placeLine(epx, epy, qx, qy, lt, segOwner);
      }
      segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, bestD);
      prevExitCross = endCross;
    }
  }

  // ── Multi-pass refinement ────────────────────────────────────
  // After all routes placed, re-route each route against the final
  // grid state. Removes the route first, then re-routes, giving it
  // the chance to find better channels now that all other routes are placed.
  for (let pass = 0; pass < 2; pass++) {
    for (const ri of routeOrder) {
      const route = routes[ri];
      // Remove all segments of this route
      for (let i = 1; i < route.nodes.length; i++) {
        const fromId = route.nodes[i - 1], toId = route.nodes[i];
        const owner = `r${ri}_${fromId}_${toId}`;
        routeGrid.removeOwner(owner);
        routeGrid.removeOwner(owner + '_chan');
      }

      const ignore = new Set();
      for (const nodeId of route.nodes) {
        ignore.add(`sta_${nodeId}`);
        ignore.add(`card_${nodeId}`);
      }
      ignore.add(`route_${ri}`);
      for (let k = 0; k < route.nodes.length - 1; k++) {
        const o = `r${ri}_${route.nodes[k]}_${route.nodes[k + 1]}`;
        ignore.add(o); ignore.add(o + '_chan');
      }

      let prevExitCross = null;
      for (let i = 1; i < route.nodes.length; i++) {
        const fromId = route.nodes[i - 1], toId = route.nodes[i];
        const fp = stationPos.get(fromId), tp = stationPos.get(toId);
        if (!fp || !tp) continue;

        const dotOff1 = routeDotOffset(fromId, ri);
        const dotOff2 = routeDotOffset(toId, ri);
        const px = isLTR ? fp.x : fp.x + dotOff1;
        const py = isLTR ? fp.y + dotOff1 : fp.y;
        const qx = isLTR ? tp.x : tp.x + dotOff2;
        const qy = isLTR ? tp.y + dotOff2 : tp.y;
        const segOwner = `r${ri}_${fromId}_${toId}`;
        const startCross = isLTR ? py : px;
        const endCross = isLTR ? qy : qx;
        const effectiveStartCross = (prevExitCross !== null && Math.abs(prevExitCross - startCross) > 0.5)
          ? prevExitCross : startCross;
        const epx = isLTR ? px : (fp.x + (effectiveStartCross - fp.x));
        const epy = isLTR ? (fp.y + (effectiveStartCross - fp.y)) : py;
        const crossDiff = Math.abs(endCross - effectiveStartCross);

        const portDiff = Math.abs(endCross - startCross);
        if (portDiff < dotR * 2.5) {
          prevExitCross = endCross;
          continue; // straight line — no refinement needed
        }

        let bestD = null, bestScore = Infinity, bestJog = null;
        for (const mf of candidates) {
          const { d, jogPos } = buildPath(epx, epy, qx, qy, mf);
          if (jogPos === null) { bestD = d; bestJog = null; break; }
          const score = scorePath(epx, epy, qx, qy, jogPos, ignore);
          if (score < bestScore) { bestScore = score; bestD = d; bestJog = jogPos; }
          if (score < 100) break;
        }

        if (bestScore >= 100) {
          const detourResult = tryDetourRoute(epx, epy, qx, qy, segOwner, ignore);
          if (detourResult && detourResult.score === 0) {
            bestD = detourResult.d; bestScore = 0; bestJog = 'detour';
          }
        }

        if (bestJog === 'detour') { /* registered inside tryDetourRoute */ }
        else if (bestJog !== null) {
          registerPath(epx, epy, qx, qy, bestJog, segOwner);
          if (isLTR) {
            routeGrid.place({ x: bestJog - channelWidth/2, y: Math.min(epy,qy)-lt, w: channelWidth, h: Math.abs(qy-epy)+lt*2, type:'channel', owner: segOwner+'_chan' });
          } else {
            routeGrid.place({ x: Math.min(epx,qx)-lt, y: bestJog - channelWidth/2, w: Math.abs(qx-epx)+lt*2, h: channelWidth, type:'channel', owner: segOwner+'_chan' });
          }
        } else {
          routeGrid.placeLine(epx, epy, qx, qy, lt, segOwner);
        }
        segmentPaths.set(`${ri}:${fromId}\u2192${toId}`, bestD);
        prevExitCross = endCross;
      }
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
    const memberCount = nodeRoutes.get(nd.id)?.size ?? 1;
    const halfSpan = memberCount > 1
      ? ((memberCount - 1) / 2) * trackSpread + dotR * 1.5
      : dotR;
    let candidates;
    if (isLTR) {
      const below = pos.y + halfSpan + gap;
      const above = pos.y - halfSpan - gap - cardH;
      candidates = [
        { x: pos.x - cardW / 2, y: below },
        { x: pos.x - cardW / 2, y: above },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: below },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: below },
        { x: pos.x - cardW / 2 + cardW * 0.6, y: above },
        { x: pos.x - cardW / 2 - cardW * 0.6, y: above },
        { x: pos.x - cardW / 2, y: below + gap * 3 },
        { x: pos.x - cardW / 2, y: above - gap * 3 },
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
  // Route weight: data-driven if available, otherwise all routes equal.
  // Only differentiate when real frequency data exists (route.frequency or node.count).
  const routeWeight = new Map();
  let maxWeight = 0;
  let hasFrequencyData = false;
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    let w = 1;
    if (route.frequency !== undefined) {
      w = route.frequency;
      hasFrequencyData = true;
    } else {
      let countSum = 0, hasCount = false;
      for (const nodeId of route.nodes) {
        const nd = nodeMap.get(nodeId);
        const c = nd?.count ?? nd?.times;
        if (c !== undefined) { countSum += c; hasCount = true; }
      }
      if (hasCount) { w = countSum; hasFrequencyData = true; }
    }
    routeWeight.set(ri, w);
    if (w > maxWeight) maxWeight = w;
  }
  // No frequency data → all routes equal weight
  if (!hasFrequencyData) {
    for (let ri = 0; ri < routes.length; ri++) routeWeight.set(ri, 1);
    maxWeight = 1;
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
      let d = segmentPaths.get(key);
      if (!d) continue;
      // Convert H-V-H paths to bezier curves with 45°-max-slope constraint.
      // Uses the H-V-H's chosen jog position (preserving obstacle avoidance).
      // Pattern: H at source Y → smooth curve around jogX → H at dest Y.
      // Curve width = 2*|dy| for 45° max slope (or capped at available space).
      if (options.routing === 'bezier') {
        const nums = d.match(/[\d.-]+/g)?.map(Number);
        if (nums && nums.length >= 4) {
          const sx = nums[0], sy = nums[1];
          const ex = nums[nums.length - 2], ey = nums[nums.length - 1];
          // Extract jogX from the H-V-H path's Q curve (first Q's control point)
          const qMatch = d.match(/Q\s+([\d.-]+)\s+([\d.-]+)/);
          let jogCross = null;
          if (qMatch) {
            jogCross = isLTR ? parseFloat(qMatch[1]) : parseFloat(qMatch[2]);
          }
          // Rounded-corner 45° style: H → Q corner → 45° diagonal → Q corner → H.
          // Fixed corner radius r (larger than default cornerRadius for visible arcs).
          // 45° fit: dx >= dy (corner+diag+corner block width = dy) + 2*minExt.
          const r = cornerRadius * 2; // larger visible corner arcs
          if (isLTR) {
            const dx = ex - sx, dy = Math.abs(ey - sy);
            const sign = Math.sign(ey - sy);
            const minExt = Math.min(dx * 0.1, 15);
            // 45° fit requires: dx >= dy + 2*minExt AND dy >= 2*r (so corners fit)
            if (dy < 1) {
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            } else if (dx < dy + 2 * minExt || dy < 2 * r) {
              // Can't fit 45° with corners — use a smooth cubic bezier fallback
              // (no vertical V-jog, but slope may exceed 45°)
              const jogX = jogCross ?? (sx + dx / 2);
              const maxReach = Math.min(jogX - sx - minExt, ex - jogX - minExt, dy);
              const halfCurve = Math.max(4, maxReach);
              const cStart = jogX - halfCurve, cEnd = jogX + halfCurve;
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${cStart.toFixed(1)} ${sy.toFixed(1)} C ${jogX.toFixed(1)} ${sy.toFixed(1)}, ${jogX.toFixed(1)} ${ey.toFixed(1)}, ${cEnd.toFixed(1)} ${ey.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            } else {
              // Clamp jogX so (cornerX1 - r) >= sx+minExt and (cornerX2 + r) <= ex-minExt
              // cornerX1 = jogX - dy/2, cornerX2 = jogX + dy/2
              // So jogX in [sx + minExt + r + dy/2, ex - minExt - r - dy/2]
              const proposedJogX = jogCross ?? (sx + dx / 2);
              const jogX = Math.max(sx + minExt + r + dy / 2, Math.min(ex - minExt - r - dy / 2, proposedJogX));
              const cornerX1 = jogX - dy / 2;
              const cornerX2 = jogX + dy / 2;
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
              d += ` L ${(cornerX1 - r).toFixed(1)} ${sy.toFixed(1)}`;
              d += ` Q ${cornerX1.toFixed(1)} ${sy.toFixed(1)} ${(cornerX1 + r).toFixed(1)} ${(sy + r * sign).toFixed(1)}`;
              d += ` L ${(cornerX2 - r).toFixed(1)} ${(ey - r * sign).toFixed(1)}`;
              d += ` Q ${cornerX2.toFixed(1)} ${ey.toFixed(1)} ${(cornerX2 + r).toFixed(1)} ${ey.toFixed(1)}`;
              d += ` L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            }
          } else {
            const dy = ey - sy, dx = Math.abs(ex - sx);
            const sign = Math.sign(ex - sx);
            const dyAbs = Math.abs(dy);
            const minExt = Math.min(dyAbs * 0.1, 15);
            if (dx < 1) {
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            } else if (dyAbs < dx + 2 * minExt || dx < 2 * r) {
              const jogY = jogCross ?? (sy + dy / 2);
              const maxReach = Math.min(jogY - sy - minExt, ey - jogY - minExt, dx);
              const halfCurve = Math.max(4, maxReach);
              const cStart = jogY - halfCurve, cEnd = jogY + halfCurve;
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${sx.toFixed(1)} ${cStart.toFixed(1)} C ${sx.toFixed(1)} ${jogY.toFixed(1)}, ${ex.toFixed(1)} ${jogY.toFixed(1)}, ${ex.toFixed(1)} ${cEnd.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            } else {
              const proposedJogY = jogCross ?? (sy + dy / 2);
              const sgn = Math.sign(dy);
              const lowBound = sy + (minExt + r + dyAbs / 2) * sgn;
              const highBound = ey - (minExt + r + dyAbs / 2) * sgn;
              const jogY = sgn > 0
                ? Math.max(lowBound, Math.min(highBound, proposedJogY))
                : Math.min(lowBound, Math.max(highBound, proposedJogY));
              const cornerY1 = jogY - dyAbs / 2 * sgn;
              const cornerY2 = jogY + dyAbs / 2 * sgn;
              d = `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
              d += ` L ${sx.toFixed(1)} ${(cornerY1 - r * Math.sign(dy)).toFixed(1)}`;
              d += ` Q ${sx.toFixed(1)} ${cornerY1.toFixed(1)} ${(sx + r * sign).toFixed(1)} ${(cornerY1 + r * Math.sign(dy)).toFixed(1)}`;
              d += ` L ${(ex - r * sign).toFixed(1)} ${(cornerY2 - r * Math.sign(dy)).toFixed(1)}`;
              d += ` Q ${ex.toFixed(1)} ${cornerY2.toFixed(1)} ${ex.toFixed(1)} ${(cornerY2 + r * Math.sign(dy)).toFixed(1)}`;
              d += ` L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
            }
          }
        }
      }
      segments.push({
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

  // Dimensions — include route paths so detours outside station bbox are visible
  let minX = Infinity, minY = Infinity, maxX = margin.left, maxY = margin.top;
  for (const [, pos] of stationPos) {
    minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x); maxY = Math.max(maxY, pos.y);
  }
  for (const [, cp] of cardPlacements) {
    minX = Math.min(minX, cp.rect.x); minY = Math.min(minY, cp.rect.y);
    maxX = Math.max(maxX, cp.rect.x + cp.rect.w);
    maxY = Math.max(maxY, cp.rect.y + cp.rect.h);
  }
  // Scan route paths for points outside station/card bbox (detours)
  for (const rp of routePaths) {
    for (const seg of rp.segments) {
      const nums = seg.d.match(/[\d.-]+/g)?.map(Number) || [];
      for (let i = 0; i < nums.length - 1; i += 2) {
        minX = Math.min(minX, nums[i]); minY = Math.min(minY, nums[i + 1]);
        maxX = Math.max(maxX, nums[i]); maxY = Math.max(maxY, nums[i + 1]);
      }
    }
  }
  // Shift everything to positive coords if detours went negative
  const shiftX = minX < margin.left ? margin.left - minX : 0;
  const shiftY = minY < margin.top ? margin.top - minY : 0;
  if (shiftX > 0 || shiftY > 0) {
    for (const [id, pos] of stationPos) stationPos.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
    for (const [id, cp] of cardPlacements) {
      cp.rect.x += shiftX; cp.rect.y += shiftY;
    }
    // Shift all path strings
    const shiftPath = (d) => d.replace(/([MLQC])\s*([\d.-]+)\s+([\d.-]+)(\s*,?\s*([\d.-]+)\s+([\d.-]+))?(\s*,?\s*([\d.-]+)\s+([\d.-]+))?/g, (m, cmd, x1, y1, g2, x2, y2, g3, x3, y3) => {
      let r = cmd + ' ' + (parseFloat(x1) + shiftX).toFixed(1) + ' ' + (parseFloat(y1) + shiftY).toFixed(1);
      if (x2) r += ', ' + (parseFloat(x2) + shiftX).toFixed(1) + ' ' + (parseFloat(y2) + shiftY).toFixed(1);
      if (x3) r += ', ' + (parseFloat(x3) + shiftX).toFixed(1) + ' ' + (parseFloat(y3) + shiftY).toFixed(1);
      return r;
    });
    for (const rp of routePaths) {
      for (const seg of rp.segments) seg.d = shiftPath(seg.d);
    }
    for (const eg of extraEdges) eg.d = shiftPath(eg.d);
    maxX += shiftX; maxY += shiftY;
  }
  const totalWidth = maxX + margin.right;
  const totalHeight = maxY + margin.bottom;

  return {
    stationPos, cardPlacements, routePaths, extraEdges, portOffset,
    width: totalWidth, height: totalHeight,
    layers, routes, routeColors, nodeRoutes, segmentRoutes,
    scale: s, theme, fontSize, fsMetric, isLTR,
    cardPadX, cardPadY, cardRadius, dotR,
    lineThickness, trackSpread, trunkRi,
  };
}
