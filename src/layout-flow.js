// ================================================================
// layout-flow.js — Obstacle-aware process flow layout
// ================================================================
//
// Lays down routes one at a time, trunk-first with obstacle avoidance.
// Each element (track segment, station card, edge label) is placed
// into an occupancy grid. Subsequent elements route around obstacles.
//
// Algorithm:
//   1. Topological sort, layer assignment, column assignment (topo sort + layers)
//   2. Order routes by length (longest = trunk, laid first)
//   3. For each route:
//      a. Place station dots + cards (try RIGHT, then LEFT, then fallback)
//      b. Route segments between stations (V-H-V with collision avoidance)
//      c. Place edge labels on straight runs
//   4. Tracks that share stations maintain neighbor adjacency
//
// Routes to the RIGHT of the trunk stay right. Parallel tracks through
// shared stations maintain their relative order.

import { resolveTheme } from './themes.js';
import { OccupancyGrid } from './occupancy.js';
import { assertValidDag, buildGraph, topoSortAndRank, swapPathXY } from './graph-utils.js';

export function layoutFlow(dag, options = {}) {
  const { nodes, edges } = dag;
  const theme = resolveTheme(options.theme);
  const s = options.scale ?? 1.5;
  const layerSpacing = (options.layerSpacing ?? 55) * s;
  const columnSpacing = (options.columnSpacing ?? 90) * s;
  const dotSpacing = (options.dotSpacing ?? 12) * s;
  const cornerRadius = (options.cornerRadius ?? 5) * s;
  const lineThickness = (options.lineThickness ?? 3) * s;
  const lineOpacity = Math.min((theme.lineOpacity ?? 1.0) * 0.7, 1);
  const labelSize = (options.labelSize ?? 3.6) * s;  // station card label font size
  const routes = options.routes;
  const direction = options.direction || 'ttb';
  const cardSide = options.cardSide ?? 'right'; // default card placement
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('layoutFlow: routes is required and must contain at least one route');
  }

  // ── Orientation abstraction ──
  // CK = column key (secondary/spread axis): 'x' for TTB, 'y' for LTR
  // LK = layer key (primary/flow axis): 'y' for TTB, 'x' for LTR
  const isLTR = direction === 'ltr';
  const CK = isLTR ? 'y' : 'x';  // column key
  const LK = isLTR ? 'x' : 'y';  // layer key

  assertValidDag(nodes, edges, 'layoutFlow');
  const { nodeMap, childrenOf, parentsOf } = buildGraph(nodes, edges);
  const classColor = {};
  for (const [cls, hex] of Object.entries(theme.classes)) classColor[cls] = hex;

  // ── STEP 1: Topological sort + layers ──
  const { topo, rank: layer } = topoSortAndRank(nodes, childrenOf, parentsOf);

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

  // ── STEP 3: Topology-based column assignment ──
  // Instead of assigning columns by route membership, position nodes
  // based on DAG structure: the backbone (longest path) gets X=0,
  // and other nodes offset based on their distance from the backbone.

  // 3a. Find the DAG backbone — longest path from any source to any sink
  const backbone = [];
  {
    // Dynamic programming: for each node, compute longest path ending there
    const longestTo = new Map(); // nodeId → { length, prev }
    for (const id of topo) {
      const parents = parentsOf.get(id);
      if (parents.length === 0) {
        longestTo.set(id, { length: 0, prev: null });
      } else {
        let best = { length: -1, prev: null };
        for (const p of parents) {
          const pl = longestTo.get(p);
          if (pl && pl.length > best.length) best = { length: pl.length, prev: p };
        }
        longestTo.set(id, { length: best.length + 1, prev: best.prev });
      }
    }
    // Find the sink with longest path
    let endNode = topo[0], maxLen = -1;
    for (const [id, info] of longestTo) {
      if (info.length > maxLen) { maxLen = info.length; endNode = id; }
    }
    // Trace back to build backbone
    let cur = endNode;
    while (cur) {
      backbone.unshift(cur);
      cur = longestTo.get(cur)?.prev;
    }
  }
  const backboneSet = new Set(backbone);

  // 3b. Route-based columns (same as before) but with a width cap
  const columns = routes.map(() => []);
  nodes.forEach(nd => columns[nodePrimary.get(nd.id)]?.push(nd.id));
  columns.forEach(col => col.sort((a, b) => layer.get(a) - layer.get(b)));

  const activeColumns = [];
  columns.forEach((col, ri) => { if (col.length > 0) activeColumns.push({ ri, nodes: col }); });
  const nCols = activeColumns.length;
  const columnCol = new Map(); // column-axis value per route
  activeColumns.forEach((col, ci) => columnCol.set(col.ri, (ci - (nCols - 1) / 2) * columnSpacing));

  // 3c. Adaptive layer spacing — detect congested gaps, give them more room
  const maxLayer = Math.max(...[...layer.values()], 0);
  const layerPos = new Array(maxLayer + 1); // layer-axis positions
  {
    // For each gap between layer L and L+1, count complexity:
    // - routes that pass through (have nodes in both layers or straddle)
    // - routes that bend (different column at source vs dest)
    // - nodes that merge (multiple parents) or fork (multiple children)
    const layerNodeIds = new Map(); // layer → [nodeId]
    nodes.forEach(nd => {
      const l = layer.get(nd.id);
      if (!layerNodeIds.has(l)) layerNodeIds.set(l, []);
      layerNodeIds.get(l).push(nd.id);
    });

    // Compute raw column-axis value per node for congestion analysis (before positions exist)
    const rawCol = new Map();
    nodes.forEach(nd => {
      const memberRoutes = nodeRoutes.get(nd.id);
      let col;
      if (memberRoutes.size <= 1) {
        col = columnCol.get(nodePrimary.get(nd.id)) ?? 0;
      } else {
        const colVals = [...memberRoutes].map(ri => columnCol.get(ri)).filter(v => v !== undefined);
        const uniqueVals = [...new Set(colVals)];
        col = uniqueVals.length > 0 ? uniqueVals.reduce((a, b) => a + b, 0) / uniqueVals.length : 0;
      }
      rawCol.set(nd.id, col);
    });

    layerPos[0] = 0;
    for (let l = 0; l < maxLayer; l++) {
      const topNodes = layerNodeIds.get(l) || [];
      const botNodes = layerNodeIds.get(l + 1) || [];

      // Count routes that cross this gap (have a node in layer l and l+1)
      const topRouteSet = new Set();
      const botRouteSet = new Set();
      topNodes.forEach(id => nodeRoutes.get(id)?.forEach(ri => topRouteSet.add(ri)));
      botNodes.forEach(id => nodeRoutes.get(id)?.forEach(ri => botRouteSet.add(ri)));
      const crossingRoutes = [...topRouteSet].filter(ri => botRouteSet.has(ri));

      // Count bending routes (different column value at top vs bottom of this gap)
      let benders = 0;
      for (const ri of crossingRoutes) {
        const route = routes[ri];
        for (let i = 1; i < route.nodes.length; i++) {
          const fId = route.nodes[i - 1], tId = route.nodes[i];
          const fL = layer.get(fId), tL = layer.get(tId);
          if (fL === l && tL === l + 1) {
            const fc = rawCol.get(fId) ?? 0, tc = rawCol.get(tId) ?? 0;
            if (Math.abs(tc - fc) > dotSpacing) benders++;
          }
        }
      }

      // Count merge/fork complexity at bottom layer nodes
      let mergeFork = 0;
      for (const id of botNodes) {
        const pCount = parentsOf.get(id)?.length ?? 0;
        if (pCount > 1) mergeFork += pCount - 1;
      }
      for (const id of topNodes) {
        const cCount = childrenOf.get(id)?.length ?? 0;
        if (cCount > 1) mergeFork += cCount - 1;
      }

      // Compute multiplier: base 1.0, +0.25 per bender, +0.15 per merge/fork, capped at 2.0
      const multiplier = Math.min(2.0, 1.0 + benders * 0.25 + mergeFork * 0.15);
      layerPos[l + 1] = layerPos[l] + layerSpacing * multiplier;
    }
  }

  // 3d. Compute raw positions (centroid-based) with adaptive layer positions
  const positions = new Map();
  nodes.forEach(nd => {
    const memberRoutes = nodeRoutes.get(nd.id);
    let colVal;
    if (memberRoutes.size <= 1) {
      colVal = columnCol.get(nodePrimary.get(nd.id)) ?? 0;
    } else {
      const colVals = [...memberRoutes].map(ri => columnCol.get(ri)).filter(v => v !== undefined);
      const uniqueVals = [...new Set(colVals)];
      colVal = uniqueVals.length > 0 ? uniqueVals.reduce((a, b) => a + b, 0) / uniqueVals.length : 0;
    }
    const layerVal = layerPos[layer.get(nd.id)] ?? (layer.get(nd.id) * layerSpacing);
    positions.set(nd.id, { [CK]: colVal, [LK]: layerVal });
  });

  // 3d. Pull backbone nodes toward their spine (reduces drift)
  if (backbone.length >= 3) {
    const boneCols = backbone.map(id => positions.get(id)?.[CK]).filter(v => v !== undefined);
    const boneSpan = Math.max(...boneCols) - Math.min(...boneCols);
    if (boneSpan > columnSpacing * 1.5) {
      boneCols.sort((a, b) => a - b);
      const spineCol = boneCols[Math.floor(boneCols.length / 2)];
      // Pull strength proportional to how badly it drifts
      const pull = Math.min(0.6, boneSpan / (columnSpacing * 8));
      for (const id of backbone) {
        const pos = positions.get(id);
        if (!pos) continue;
        pos[CK] = pos[CK] * (1 - pull) + spineCol * pull;
      }
    }
  }

  // ── STEP 4: Separate same-layer nodes that overlap in column axis ──
  const layerNodes = new Map();
  nodes.forEach(nd => {
    const l = layer.get(nd.id);
    if (!layerNodes.has(l)) layerNodes.set(l, []);
    layerNodes.get(l).push(nd.id);
  });
  for (const [, ids] of layerNodes) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => positions.get(a)[CK] - positions.get(b)[CK]);
    for (let i = 1; i < ids.length; i++) {
      const prev = positions.get(ids[i - 1]);
      const curr = positions.get(ids[i]);
      const minGap = columnSpacing * 0.5;
      if (curr[CK] - prev[CK] < minGap) {
        curr[CK] = prev[CK] + minGap;
      }
    }
  }

  // Normalize — margins are orientation-aware
  const margin = isLTR
    ? { top: 80 * s, left: 50 * s, bottom: 140 * s, right: 40 * s }
    : { top: 50 * s, left: 80 * s, bottom: 40 * s, right: 140 * s };
  let minCK = Infinity, maxCK = -Infinity, minLK = Infinity, maxLK = -Infinity;
  positions.forEach(pos => {
    if (pos[CK] < minCK) minCK = pos[CK]; if (pos[CK] > maxCK) maxCK = pos[CK];
    if (pos[LK] < minLK) minLK = pos[LK]; if (pos[LK] > maxLK) maxLK = pos[LK];
  });
  // For CK (column axis): shift by left margin (TTB) or top margin (LTR)
  // For LK (layer axis): shift by top margin (TTB) or left margin (LTR)
  const ckShift = -minCK + (isLTR ? margin.top : margin.left);
  const lkShift = -minLK + (isLTR ? margin.left : margin.top);
  positions.forEach(pos => { pos[CK] += ckShift; pos[LK] = pos[LK] - minLK + (isLTR ? margin.left : margin.top); });

  // ── STEP 5: Flow layout — sequential, obstacle-aware ──
  const grid = new OccupancyGrid(2);        // tracks + cards + dots
  const badgeGrid = new OccupancyGrid(2);   // edge labels only (don't block routes)

  // Sort routes: longest first (trunk gets best placement)
  const routeOrder = routes.map((_, ri) => ri)
    .sort((a, b) => routes[b].nodes.length - routes[a].nodes.length);

  // Track waypoint column for each route at each node (for parallel adjacency)
  const waypointX = new Map(); // "nodeId:routeIdx" → column value

  // Track card placements
  const cardPlacements = new Map(); // nodeId → { rect, side }
  const placedNodes = new Set();

  // For each route at a node, compute the average column-axis value of
  // neighboring nodes in that route (prev + next). Used to order dots
  // so lines don't cross.
  function neighborCol(nodeId, ri) {
    const route = routes[ri];
    if (!route) return positions.get(nodeId)?.[CK] ?? 0;
    const idx = route.nodes.indexOf(nodeId);
    if (idx < 0) return positions.get(nodeId)?.[CK] ?? 0;
    let sum = 0, count = 0;
    if (idx > 0) {
      const p = positions.get(route.nodes[idx - 1]);
      if (p) { sum += p[CK]; count++; }
    }
    if (idx < route.nodes.length - 1) {
      const p = positions.get(route.nodes[idx + 1]);
      if (p) { sum += p[CK]; count++; }
    }
    return count > 0 ? sum / count : (positions.get(nodeId)?.[CK] ?? 0);
  }

  // Global side assignment: each non-trunk route gets a FIXED side
  // (left or right of the trunk) that it maintains at every node.
  // This prevents crossings — once a route is on the left, it stays left.
  const trunkRi = routeOrder[0]; // longest route

  // Compute the trunk's average column value as the spine reference
  const trunkAvgCol = (() => {
    const cols = routes[trunkRi].nodes.map(id => positions.get(id)?.[CK]).filter(v => v !== undefined);
    return cols.length > 0 ? cols.reduce((a, b) => a + b, 0) / cols.length : 0;
  })();

  // For each non-trunk route, determine its side by where its nodes
  // tend to be relative to the trunk spine.
  const routeSide = new Map(); // ri → -1 (left) | 0 (on trunk) | 1 (right)
  routeSide.set(trunkRi, 0);

  routes.forEach((route, ri) => {
    if (ri === trunkRi) return;
    // Compute avg column of this route's nodes that are NOT shared with trunk
    const trunkNodeSet = new Set(routes[trunkRi].nodes);
    const uniqueNodes = route.nodes.filter(id => !trunkNodeSet.has(id));
    let avgCol;
    if (uniqueNodes.length > 0) {
      const cols = uniqueNodes.map(id => positions.get(id)?.[CK]).filter(v => v !== undefined);
      avgCol = cols.length > 0 ? cols.reduce((a, b) => a + b, 0) / cols.length : trunkAvgCol;
    } else {
      // All nodes shared with trunk — use neighbor direction at first shared node
      const firstShared = route.nodes.find(id => trunkNodeSet.has(id));
      avgCol = firstShared ? neighborCol(firstShared, ri) : trunkAvgCol;
    }
    routeSide.set(ri, avgCol < trunkAvgCol - 1 ? -1 : avgCol > trunkAvgCol + 1 ? 1 : 1);
  });

  // Assign a global sort key: left routes get negative keys, trunk=0, right=positive
  // Within same side, sort by route index for consistency
  const routeSortKey = new Map();
  {
    const leftRoutes = [...routeSide.entries()].filter(([, s]) => s < 0).map(([ri]) => ri).sort((a, b) => a - b);
    const rightRoutes = [...routeSide.entries()].filter(([, s]) => s > 0).map(([ri]) => ri).sort((a, b) => a - b);
    leftRoutes.forEach((ri, i) => routeSortKey.set(ri, -(leftRoutes.length - i)));
    routeSortKey.set(trunkRi, 0);
    rightRoutes.forEach((ri, i) => routeSortKey.set(ri, i + 1));
  }

  const dotOrderCache = new Map();
  function getDotOrder(nodeId) {
    if (dotOrderCache.has(nodeId)) return dotOrderCache.get(nodeId);
    const memberRoutes = nodeRoutes.get(nodeId);
    if (!memberRoutes || memberRoutes.size <= 1) {
      const list = memberRoutes ? [...memberRoutes] : [];
      dotOrderCache.set(nodeId, list);
      return list;
    }

    // Sort by global side assignment — consistent at every node
    const sorted = [...memberRoutes].sort((a, b) => {
      const ka = routeSortKey.get(a) ?? a;
      const kb = routeSortKey.get(b) ?? b;
      return ka !== kb ? ka - kb : a - b;
    });

    dotOrderCache.set(nodeId, sorted);
    return sorted;
  }

  // Precompute trunk's ABSOLUTE column position: propagate from node to node
  // so the trunk forms a perfectly straight spine. At single-route nodes
  // the trunk is at pos[CK]. Once established, the absolute column propagates
  // forward regardless of column changes at merge/fork points.
  const trunkAbsCol = new Map(); // nodeId → absolute column for trunk dot
  {
    let prevAbsCol = null;
    for (const nodeId of routes[trunkRi].nodes) {
      const pos = positions.get(nodeId);
      if (!pos) continue;
      const memberRoutes = nodeRoutes.get(nodeId);

      if (!memberRoutes || memberRoutes.size <= 1) {
        // Single-route node: trunk at node center
        const absCol = pos[CK];
        trunkAbsCol.set(nodeId, absCol);
        prevAbsCol = absCol;
      } else if (prevAbsCol !== null) {
        // Propagate previous absolute column — trunk stays straight
        trunkAbsCol.set(nodeId, prevAbsCol);
      } else {
        // First multi-route node: compute default position
        const sorted = getDotOrder(nodeId);
        const localIdx = sorted.indexOf(trunkRi);
        const n = sorted.length;
        const absCol = pos[CK] + (localIdx - (n - 1) / 2) * dotSpacing;
        trunkAbsCol.set(nodeId, absCol);
        prevAbsCol = absCol;
      }
    }
  }

  // Precompute dot positions for all routes at each node.
  // The trunk gets its propagated fixed position. Other routes are
  // spaced evenly around it, maintaining consistent dotSpacing.
  const nodeDotPositions = new Map(); // nodeId → Map<ri, columnValue>

  for (const [nodeId, memberRoutes] of nodeRoutes) {
    const pos = positions.get(nodeId);
    if (!pos) continue;
    const dotMap = new Map();

    if (memberRoutes.size <= 1) {
      for (const ri of memberRoutes) dotMap.set(ri, pos[CK]);
    } else {
      const sorted = getDotOrder(nodeId);
      const hasTrunk = sorted.includes(trunkRi) && trunkAbsCol.has(nodeId);

      const trunkCol = trunkAbsCol.get(nodeId);
      if (hasTrunk && trunkCol !== undefined) {
        // Anchor: trunk at its fixed absolute position. Pack others around it.
        const trunkIdx = sorted.indexOf(trunkRi);
        for (let i = 0; i < sorted.length; i++) {
          dotMap.set(sorted[i], trunkCol + (i - trunkIdx) * dotSpacing);
        }
      } else {
        // No trunk — standard dense centering
        const n = sorted.length;
        const center = (n - 1) / 2;
        for (let i = 0; i < sorted.length; i++) {
          dotMap.set(sorted[i], pos[CK] + (i - center) * dotSpacing);
        }
      }
    }

    nodeDotPositions.set(nodeId, dotMap);
  }

  // dotCol returns the column-axis coordinate of a dot
  function dotCol(nodeId, ri) {
    const dotMap = nodeDotPositions.get(nodeId);
    if (dotMap && dotMap.has(ri)) return dotMap.get(ri);
    return positions.get(nodeId)?.[CK] ?? 0;
  }

  // dotX returns the X-coordinate of a dot (regardless of orientation)
  function dotX(nodeId, ri) {
    if (isLTR) {
      // In LTR: column axis is Y, layer axis is X
      // dotX should return the X-coordinate, which is the layer position
      return positions.get(nodeId)?.x ?? 0;
    }
    // In TTB: column axis is X, so dotCol = X
    return dotCol(nodeId, ri);
  }

  // dotPos returns {x, y} for a dot — the actual screen coordinates
  function dotPos(nodeId, ri) {
    const dc = dotCol(nodeId, ri);
    const pos = positions.get(nodeId);
    if (!pos) return { x: 0, y: 0 };
    if (isLTR) {
      return { x: pos.x, y: dc };
    } else {
      return { x: dc, y: pos.y };
    }
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

    // Compute dots span (in column-axis)
    const dcs = routeIndices.map(ri => dotCol(nodeId, ri));
    const rightmostDot = Math.max(...dcs);
    const leftmostDot = Math.min(...dcs);
    const dotR = 3.2 * s;

    // Card dimensions (always in screen w/h)
    const labelW = nd.label.length * fsLabel * 0.52;
    const indicatorW = n * 5 * s;
    const metricValue = nd.times ?? nd.count;
    const metricText = metricValue === undefined || metricValue === null ? '' : String(metricValue);
    const dataW = metricText.length * fsData * 0.55;
    const contentW = Math.max(labelW, indicatorW + dataW + 4 * s);
    const cardPadX = 5 * s;
    const cardPadY = 3 * s;
    const cardW = contentW + cardPadX * 2;
    const cardH = fsLabel + fsData + cardPadY * 2 + 3 * s;
    const cardGap = 4 * s;

    let candidates;
    if (isLTR) {
      // LTR: cards above/below dots (column axis is Y), centered at pos.x
      const baseAbove = leftmostDot - dotR - cardGap - cardH;
      const baseBelow = rightmostDot + dotR + cardGap;
      const xCenter = pos.x - cardW / 2;
      const xShiftAmt = cardW + 4 * s;
      candidates = [
        { side: 'right', x: xCenter, y: baseBelow },     // below
        { side: 'left',  x: xCenter, y: baseAbove },     // above
        { side: 'right', x: xCenter - xShiftAmt, y: baseBelow },  // below, left
        { side: 'right', x: xCenter + xShiftAmt, y: baseBelow },  // below, right
        { side: 'left',  x: xCenter - xShiftAmt, y: baseAbove },  // above, left
        { side: 'left',  x: xCenter + xShiftAmt, y: baseAbove },  // above, right
      ];
    } else {
      // TTB: cards to right/left of dots (column axis is X), centered at pos.y
      const baseRight = rightmostDot + dotR + cardGap;
      const baseLeft = leftmostDot - dotR - cardGap - cardW;
      const yCenter = pos.y - cardH / 2;
      const yShift = cardH + 4 * s;
      candidates = [
        { side: 'right', x: baseRight, y: yCenter },
        { side: 'left',  x: baseLeft,  y: yCenter },
        { side: 'right', x: baseRight, y: yCenter - yShift },
        { side: 'right', x: baseRight, y: yCenter + yShift },
        { side: 'left',  x: baseLeft,  y: yCenter - yShift },
        { side: 'left',  x: baseLeft,  y: yCenter + yShift },
      ];
    }

    let placed = false;
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nodeId}` };
      if (grid.tryPlace(rect)) {
        cardPlacements.set(nodeId, { rect, side: c.side, cardW, cardH, cardPadX, cardPadY });
        placed = true;
        break;
      }
    }

    // Fallback: place first candidate regardless of collision (better than nothing)
    if (!placed) {
      const c = candidates[0];
      const rect = { x: c.x, y: c.y, w: cardW, h: cardH, type: 'card', owner: `card_${nodeId}` };
      grid.place(rect);
      cardPlacements.set(nodeId, { rect, side: candidates[0].side, cardW, cardH, cardPadX, cardPadY });
    }
  }

  // Build route path string with rounded elbows — orientation-aware
  // TTB: V-H-V paths. LTR: H-V-H paths.
  // px,py,qx,qy are always screen coordinates.
  // midFrac applies to the primary axis (layer axis).
  function buildRoute(px, py, qx, qy, midFrac, r) {
    const dx = qx - px, dy = qy - py;
    // "same column" check: column-axis difference < 1
    const colDiff = isLTR ? Math.abs(dy) : Math.abs(dx);
    const layerDiff = isLTR ? Math.abs(dx) : Math.abs(dy);
    if (colDiff < 1) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
    if (layerDiff < 1) return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };

    if (isLTR) {
      // H-V-H path: horizontal run → vertical jog at midX → horizontal run
      const cr = Math.min(r, Math.abs(dy) / 2, Math.abs(dx) / 2);
      const midX = px + dx * midFrac;
      const sx = Math.sign(dx), sy = Math.sign(dy);

      // First elbow at (midX, py)
      const e1x = midX - sx * cr;
      const e1ey = py + sy * cr;
      // Second elbow at (midX, qy)
      const e2y = qy - sy * cr;
      const e2ex = midX + sx * cr;

      let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
      d += `L ${e1x.toFixed(1)} ${py.toFixed(1)} `;
      d += `Q ${midX.toFixed(1)} ${py.toFixed(1)} ${midX.toFixed(1)} ${e1ey.toFixed(1)} `;
      d += `L ${midX.toFixed(1)} ${e2y.toFixed(1)} `;
      d += `Q ${midX.toFixed(1)} ${qy.toFixed(1)} ${e2ex.toFixed(1)} ${qy.toFixed(1)} `;
      d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;

      return { d, jogPos: midX };
    } else {
      // V-H-V path: vertical run → horizontal jog at midY → vertical run
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

      return { d, jogPos: midY };
    }
  }

  // Check collision for all 3 segments of a route path — orientation-aware
  function scoreRoute(px, py, qx, qy, jogPos, ignore) {
    const t = lineThickness;
    if (isLTR) {
      // H-V-H: horiz run 1, vert jog, horiz run 2
      const h1 = { x: Math.min(px, jogPos) - t, y: py - t * 2, w: Math.abs(jogPos - px) + t * 2, h: t * 4, type: 'track' };
      const vj = { x: jogPos - t, y: Math.min(py, qy), w: t * 2, h: Math.abs(qy - py), type: 'track' };
      const h2 = { x: Math.min(jogPos, qx) - t, y: qy - t * 2, w: Math.abs(qx - jogPos) + t * 2, h: t * 4, type: 'track' };
      return grid.overlapCount(h1, ignore) + grid.overlapCount(vj, ignore) + grid.overlapCount(h2, ignore);
    } else {
      // V-H-V: vert run 1, horiz jog, vert run 2
      const v1 = { x: px - t, y: Math.min(py, jogPos), w: t * 2, h: Math.abs(jogPos - py), type: 'track' };
      const hj = { x: Math.min(px, qx) - t, y: jogPos - t * 2, w: Math.abs(qx - px) + t * 2, h: t * 4, type: 'track' };
      const v2 = { x: qx - t, y: Math.min(jogPos, qy), w: t * 2, h: Math.abs(qy - jogPos), type: 'track' };
      return grid.overlapCount(v1, ignore) + grid.overlapCount(hj, ignore) + grid.overlapCount(v2, ignore);
    }
  }

  // Register all 3 segments of a route path in the grid — orientation-aware
  function registerRoute(px, py, qx, qy, jogPos, owner) {
    if (isLTR) {
      // H-V-H
      grid.placeLine(px, py, jogPos, py, lineThickness, owner);
      grid.placeLine(jogPos, py, jogPos, qy, lineThickness, owner);
      grid.placeLine(jogPos, qy, qx, qy, lineThickness, owner);
    } else {
      // V-H-V
      grid.placeLine(px, py, px, jogPos, lineThickness, owner);
      grid.placeLine(px, jogPos, qx, jogPos, lineThickness, owner);
      grid.placeLine(qx, jogPos, qx, qy, lineThickness, owner);
    }
  }

  // Route a segment with collision avoidance.
  // Returns { d, jogPos } — jogPos is the jog coordinate on the primary axis (null for straight).
  // ignore: Set of owners to ignore in collision checks (segment + endpoint nodes)
  function routeSegment(px, py, qx, qy, ri, owner, ignore, assignedMidFrac) {
    const r = cornerRadius;

    // "Same column" check: column-axis difference < 1
    const colDiff = isLTR ? Math.abs(qy - py) : Math.abs(qx - px);
    const layerDiff = isLTR ? Math.abs(qx - px) : Math.abs(qy - py);

    // Straight along primary axis — check for card collisions (excluding endpoint nodes)
    if (colDiff < 1) {
      // Shrink along layer axis by lineThickness at each end to avoid false positives
      const shrink = lineThickness;
      if (isLTR) {
        // Straight horizontal line (same Y)
        const checkX = Math.min(px, qx) + shrink;
        const checkW = Math.abs(qx - px) - 2 * shrink;
        if (checkW <= 0) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
        }
        const hRect = { x: checkX, y: py - lineThickness, w: checkW, h: lineThickness * 2, type: 'track' };
        const collisions = grid.overlapCount(hRect, ignore);

        if (collisions === 0) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
        }

        // Straight horizontal segment hits obstacle — detour up/down
        const detourDist = 15 * s;
        const upY = py - detourDist;
        const downY = py + detourDist;

        const upScore = scoreRoute(px, py, qx, upY, (px + qx) / 2, ignore)
          + scoreRoute(qx, upY, qx, qy, (px + qx) * 0.7, ignore);
        const downScore = scoreRoute(px, py, qx, downY, (px + qx) / 2, ignore)
          + scoreRoute(qx, downY, qx, qy, (px + qx) * 0.7, ignore);

        const detourY = upScore <= downScore ? upY : downY;
        const midX1 = px + (qx - px) * 0.3;
        const midX2 = px + (qx - px) * 0.7;

        const cr = Math.min(r, detourDist / 2, Math.abs(midX1 - px) / 2);
        if (cr < 1) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
        }

        // H-V-H-V-H detour path
        const sx = Math.sign(qx - px);
        const sy = Math.sign(detourY - py);
        let d = `M ${px.toFixed(1)} ${py.toFixed(1)} `;
        d += `L ${(midX1 - sx * cr).toFixed(1)} ${py.toFixed(1)} `;
        d += `Q ${midX1.toFixed(1)} ${py.toFixed(1)} ${midX1.toFixed(1)} ${(py + sy * cr).toFixed(1)} `;
        d += `L ${midX1.toFixed(1)} ${(detourY - sy * cr).toFixed(1)} `;
        d += `Q ${midX1.toFixed(1)} ${detourY.toFixed(1)} ${(midX1 + sx * cr).toFixed(1)} ${detourY.toFixed(1)} `;
        d += `L ${(midX2 - sx * cr).toFixed(1)} ${detourY.toFixed(1)} `;
        d += `Q ${midX2.toFixed(1)} ${detourY.toFixed(1)} ${midX2.toFixed(1)} ${(detourY - sy * cr).toFixed(1)} `;
        d += `L ${midX2.toFixed(1)} ${(qy + sy * cr).toFixed(1)} `;
        d += `Q ${midX2.toFixed(1)} ${qy.toFixed(1)} ${(midX2 + sx * cr).toFixed(1)} ${qy.toFixed(1)} `;
        d += `L ${qx.toFixed(1)} ${qy.toFixed(1)}`;

        grid.placeLine(px, py, midX1, py, lineThickness, owner);
        grid.placeLine(midX1, py, midX1, detourY, lineThickness, owner);
        grid.placeLine(midX1, detourY, midX2, detourY, lineThickness, owner);
        grid.placeLine(midX2, detourY, midX2, qy, lineThickness, owner);
        grid.placeLine(midX2, qy, qx, qy, lineThickness, owner);
        return { d, jogPos: midX1 };
      } else {
        // TTB: Straight vertical line (same X)
        const checkY = Math.min(py, qy) + shrink;
        const checkH = Math.abs(qy - py) - 2 * shrink;
        if (checkH <= 0) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
        }
        const vRect = { x: px - lineThickness, y: checkY, w: lineThickness * 2, h: checkH, type: 'track' };
        const collisions = grid.overlapCount(vRect, ignore);

        if (collisions === 0) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
        }

        // Vertical segment hits a real obstacle — detour left/right
        const detourDist = 15 * s;
        const leftX = px - detourDist;
        const rightX = px + detourDist;

        const leftScore = scoreRoute(px, py, leftX, qy, (py + qy) / 2, ignore)
          + scoreRoute(leftX, (py + qy) / 2, qx, qy, (py + qy) * 0.7, ignore);
        const rightScore = scoreRoute(px, py, rightX, qy, (py + qy) / 2, ignore)
          + scoreRoute(rightX, (py + qy) / 2, qx, qy, (py + qy) * 0.7, ignore);

        const detourX = leftScore <= rightScore ? leftX : rightX;
        const midY1 = py + (qy - py) * 0.3;
        const midY2 = py + (qy - py) * 0.7;

        const cr = Math.min(r, detourDist / 2, Math.abs(midY1 - py) / 2);
        if (cr < 1) {
          grid.placeLine(px, py, qx, qy, lineThickness, owner);
          return { d: `M ${px.toFixed(1)} ${py.toFixed(1)} L ${qx.toFixed(1)} ${qy.toFixed(1)}`, jogPos: null };
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
        return { d, jogPos: midY1 };
      }
    }

    // Non-straight: try multiple midFrac values, score ALL segments.
    // For small column diff (dot centering shifts), prefer extreme midFrac to push
    // the jog close to a node — makes the short cross run less visible.
    const dotR = 3.2 * s;
    const hiddenFrac = layerDiff > 0 ? Math.max(0.5, 1 - dotR / layerDiff) : 0.5;
    // Use pre-assigned staggered midFrac first (crossing avoidance),
    // then fall back to defaults
    const baseFracs = colDiff <= dotSpacing
      ? [hiddenFrac, 1 - hiddenFrac, 0.85, 0.15]
      : [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
    const midFracs = assignedMidFrac !== undefined
      ? [assignedMidFrac, ...baseFracs.filter(f => Math.abs(f - assignedMidFrac) > 0.05)]
      : baseFracs;
    let bestD = null;
    let bestMf = 0.5;
    let bestCollisions = Infinity;

    for (const mf of midFracs) {
      const { d, jogPos } = buildRoute(px, py, qx, qy, mf, r);
      if (jogPos === null) return { d, jogPos: null };

      const collisions = scoreRoute(px, py, qx, qy, jogPos, ignore);
      if (collisions === 0) {
        registerRoute(px, py, qx, qy, jogPos, owner);
        return { d, jogPos };
      }
      if (collisions < bestCollisions) {
        bestCollisions = collisions;
        bestD = d;
        bestMf = mf;
      }
    }

    // Register the best option even if it has collisions
    // Compute jogPos from midFrac along the primary axis
    const bestJogPos = isLTR
      ? px + (qx - px) * bestMf
      : py + (qy - py) * bestMf;
    registerRoute(px, py, qx, qy, bestJogPos, owner);
    return { d: bestD, jogPos: bestJogPos };
  }

  // ── STEP 6: Lay routes sequentially ──
  const fsLabel = labelSize;
  const fsData = labelSize * 0.78;  // data text slightly smaller than label
  const routePaths = routes.map(() => []);
  const edgeLabelPositions = new Map(); // "from→to" → {x, y, color}

  // Phase A: Register all dots + place ALL cards BEFORE routing.
  // This ensures routes will avoid all cards.
  const dotR = 3.2 * s;
  for (const ri of routeOrder) {
    for (const nodeId of routes[ri].nodes) {
      if (!placedNodes.has(nodeId)) {
        const dcs = [...nodeRoutes.get(nodeId)].map(r => dotCol(nodeId, r));
        dcs.forEach(dc => {
          const pos = positions.get(nodeId);
          if (!pos) return;
          const dotRect = isLTR
            ? { x: pos.x - dotR, y: dc - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: nodeId }
            : { x: dc - dotR, y: pos.y - dotR, w: dotR * 2, h: dotR * 2, type: 'dot', owner: nodeId };
          grid.place(dotRect);
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

  // Pre-compute staggered jog assignments for crossing avoidance.
  // For each layer gap, routes that bend are assigned different midFrac
  // values so their horizontal jogs don't overlap.
  const jogAssignments = new Map(); // "fromLayer→toLayer" → Map<ri, midFrac>
  {
    const gapBenders = new Map(); // "layerA→layerB" → [{ri, fromCol, toCol}]
    routes.forEach((route, ri) => {
      for (let i = 1; i < route.nodes.length; i++) {
        const fromId = route.nodes[i - 1], toId = route.nodes[i];
        const fromPos = positions.get(fromId), toPos = positions.get(toId);
        if (!fromPos || !toPos) continue;
        const fromLayer = layer.get(fromId), toLayer = layer.get(toId);
        const fc = dotCol(fromId, ri), tc = dotCol(toId, ri);
        if (Math.abs(tc - fc) < 1) continue; // straight, no bend
        const gapKey = `${fromLayer}\u2192${toLayer}`;
        if (!gapBenders.has(gapKey)) gapBenders.set(gapKey, []);
        gapBenders.get(gapKey).push({ ri, fromCol: fc, toCol: tc });
      }
    });
    for (const [gapKey, benders] of gapBenders) {
      if (benders.length < 2) continue;

      // Only stagger when routes bend in OPPOSITE directions.
      // Routes going the same direction should stay parallel.
      const hasLeft = benders.some(b => b.toCol < b.fromCol);
      const hasRight = benders.some(b => b.toCol > b.fromCol);
      if (!hasLeft || !hasRight) continue; // all same direction — skip

      // Sort by destination column: leftmost dest jogs near source,
      // rightmost dest jogs near destination. This prevents crossings.
      benders.sort((a, b) => a.toCol - b.toCol);
      const n = benders.length;
      const assignment = new Map();
      benders.forEach((b, i) => {
        const frac = n === 1 ? 0.5 : 0.25 + (i / (n - 1)) * 0.5;
        assignment.set(b.ri, frac);
      });
      jogAssignments.set(gapKey, assignment);
    }
  }

  // Phase B: Route ALL segments (grid has dots + cards as obstacles)
  for (const ri of routeOrder) {
    const route = routes[ri];
    const color = classColor[route.cls] || Object.values(classColor)[0];
    const waypoints = route.nodes.map(id => {
      const pos = positions.get(id);
      if (!pos) return null;
      const dc = dotCol(id, ri);
      // Waypoint in screen coordinates
      if (isLTR) {
        return { id, x: pos.x, y: dc };
      } else {
        return { id, x: dc, y: pos.y };
      }
    }).filter(Boolean);

    const routeOwner = `route${ri}`;
    const segments = [];
    for (let i = 1; i < waypoints.length; i++) {
      const p = waypoints[i - 1], q = waypoints[i];
      // "small column diff" check uses the column-axis distance
      const smallColDiff = isLTR ? Math.abs(q.y - p.y) <= dotSpacing : Math.abs(q.x - p.x) <= dotSpacing;
      const ignoreSet = smallColDiff
        ? new Set([routeOwner, p.id, q.id, `card_${p.id}`, `card_${q.id}`])
        : new Set([routeOwner, p.id, q.id]);

      // Use pre-assigned staggered midFrac for crossing avoidance
      const fromLayer = layer.get(p.id), toLayer = layer.get(q.id);
      const gapKey = `${fromLayer}\u2192${toLayer}`;
      const gapAssign = jogAssignments.get(gapKey);
      const assignedMidFrac = gapAssign?.get(ri);

      const result = routeSegment(p.x, p.y, q.x, q.y, ri, routeOwner, ignoreSet, assignedMidFrac);
      const srcDim = nodeMap.get(p.id)?.dim === true;
      const dstDim = nodeMap.get(q.id)?.dim === true;
      const segOpacity = (srcDim || dstDim) ? Math.min(lineOpacity, 0.12) : lineOpacity;
      segments.push({ d: result.d, color, thickness: lineThickness, opacity: segOpacity, dashed: false });

      // Try to place edge label — per route, on straight runs along the primary axis
      const edgeKey = `${ri}:${p.id}\u2192${q.id}`;
      if (!edgeLabelPositions.has(edgeKey)) {
        const fs = 2.4 * s;
        const tw = 12 * s;
        const th = fs + 2.5 * s;

        const candidates = [];
        if (result.jogPos !== null) {
          if (isLTR) {
            // H-V-H: straight runs are horizontal
            const jp = result.jogPos; // midX
            candidates.push({ x: (p.x + jp) / 2, y: p.y - th / 2 });    // on first horiz run
            candidates.push({ x: (jp + q.x) / 2, y: q.y - th / 2 });    // on second horiz run
            candidates.push({ x: jp - tw / 2, y: (p.y + q.y) / 2 - th / 2 }); // on vertical jog
          } else {
            // V-H-V: straight runs are vertical
            const jp = result.jogPos; // midY
            candidates.push({ x: p.x, y: (p.y + jp) / 2 - th / 2 });
            candidates.push({ x: q.x, y: (jp + q.y) / 2 - th / 2 });
            candidates.push({ x: (p.x + q.x) / 2, y: jp - th / 2 });
          }
        } else {
          if (isLTR) {
            candidates.push({ x: (p.x + q.x) / 2, y: p.y - th / 2 });
          } else {
            candidates.push({ x: p.x, y: (p.y + q.y) / 2 - th / 2 });
          }
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
  // Extra dots go on the "left" side (lower column value) of route dots.
  const extraSlotCount = new Map();
  function extraDotCol(nodeId) {
    const pos = positions.get(nodeId);
    if (!pos) return 0;
    const memberRoutes = nodeRoutes.get(nodeId);
    if (!memberRoutes || memberRoutes.size === 0) return pos[CK];
    const leftmost = Math.min(...[...memberRoutes].map(ri => dotCol(nodeId, ri)));
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
    const fc = extraDotCol(f), tc = extraDotCol(t);
    // Convert to screen coordinates
    let fx, fy, tx, ty;
    if (isLTR) {
      fx = pBase.x; fy = fc;
      tx = qBase.x; ty = tc;
    } else {
      fx = fc; fy = pBase.y;
      tx = tc; ty = qBase.y;
    }
    const extraOwner = `extra_${f}_${t}`;
    const result = routeSegment(fx, fy, tx, ty, 999, extraOwner, new Set([extraOwner, f, t]));
    extraEdges.push({ d: result.d, color: theme.muted, thickness: 1.5 * s, opacity: 0.3, dashed: true });
    extraDotPositions.set(`${f}\u2192${t}`, { fromX: fx, fromY: fy, toX: tx, toY: ty });
  });

  // Compute bounds from actual positions for width/height
  let actualMinX = Infinity, actualMaxX = -Infinity, actualMinY = Infinity, actualMaxY = -Infinity;
  positions.forEach(pos => {
    if (pos.x < actualMinX) actualMinX = pos.x;
    if (pos.x > actualMaxX) actualMaxX = pos.x;
    if (pos.y < actualMinY) actualMinY = pos.y;
    if (pos.y > actualMaxY) actualMaxY = pos.y;
  });

  const width = (actualMaxX - actualMinX) + margin.left + margin.right;
  const height = (actualMaxY - actualMinY) + margin.top + margin.bottom;

  // Compute minY/maxY on the layer axis for scroll/viewport logic
  const lkMarginStart = isLTR ? margin.left : margin.top;
  const finalMaxLayerPos = layerPos[maxLayer] ?? maxLayer * layerSpacing;
  const minLayerScreen = lkMarginStart;
  const maxLayerScreen = lkMarginStart + finalMaxLayerPos;

  return {
    positions,
    routePaths,
    extraEdges,
    width,
    height,
    routes,
    nodeRoute: new Map([...nodes.map(nd => [nd.id, nodePrimary.get(nd.id)])]),
    nodeRoutes,
    nodePrimary,
    dotSpacing,
    dotX,
    dotPos,
    cardPlacements,
    edgeLabelPositions,
    extraDotPositions,
    scale: s,
    labelSize,
    theme,
    orientation: direction,
    minY: isLTR ? actualMinY : minLayerScreen,
    maxY: isLTR ? actualMaxY : maxLayerScreen,
  };
}
