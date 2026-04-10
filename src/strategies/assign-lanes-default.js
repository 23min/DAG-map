// assign-lanes-default.js — default BFS lane assignment strategy.
// Assigns Y positions to routes via BFS from trunk with occupancy tracking.
// Extracted from layoutMetro lines 204-316.

/**
 * Assign Y positions to routes via BFS from trunk.
 *
 * @param {object} ctx
 * @param {Array} ctx.routes - route array
 * @param {Map} ctx.layer - node → layer map
 * @param {Map} ctx.nodeRoute - node → primary route index
 * @param {Map} ctx.nodeMap - id → node object
 * @param {boolean} ctx.hasProvidedRoutes
 * @param {object} ctx.config - { TRUNK_Y, MAIN_SPACING, SUB_SPACING, maxLanes }
 * @returns {{ routeY: Map<number, number> }}
 */
export function assignLanesDefault(ctx) {
  const { routes, layer, nodeRoute, nodeMap, hasProvidedRoutes, config } = ctx;
  const { TRUNK_Y, MAIN_SPACING, SUB_SPACING, maxLanes } = config;

  // Compute per-route metadata
  const routeLayerRange = routes.map(route => {
    let min = Infinity, max = -Infinity;
    route.nodes.forEach(id => {
      const l = layer.get(id);
      if (l < min) min = l;
      if (l > max) max = l;
    });
    return [min, max];
  });

  const routeOwnLength = routes.map((route, ri) => {
    return route.nodes.filter(id => nodeRoute.get(id) === ri).length;
  });

  const routeDomClass = routes.map((route, ri) => {
    const ownNodes = route.nodes.filter(id => nodeRoute.get(id) === ri);
    return _dominantClass(ownNodes, nodeMap);
  });

  // Route parent-child relationships
  const routeChildren = new Map();
  routes.forEach((_, i) => routeChildren.set(i, []));
  for (let ri = 1; ri < routes.length; ri++) {
    const pi = routes[ri].parentRoute;
    if (routeChildren.has(pi)) routeChildren.get(pi).push(ri);
    else routeChildren.set(pi, [ri]);
  }

  // Y occupancy tracker
  const yOccupancy = [];
  function canUseY(y, sL, eL, minGap) {
    for (const occ of yOccupancy) {
      if (sL <= occ.eL + 1 && eL >= occ.sL - 1) {
        if (Math.abs(y - occ.y) < minGap) return false;
      }
    }
    return true;
  }
  function claimY(y, sL, eL) {
    yOccupancy.push({ y, sL, eL });
  }

  // Assign trunk
  const routeY = new Map();
  routeY.set(0, TRUNK_Y);
  claimY(TRUNK_Y, routeLayerRange[0][0], routeLayerRange[0][1]);

  // BFS from trunk
  const laneQueue = [0];
  const assignedRoutes = new Set([0]);

  while (laneQueue.length > 0) {
    const pi = laneQueue.shift();
    const parentY = routeY.get(pi);
    const children = routeChildren.get(pi) || [];

    if (!hasProvidedRoutes) {
      children.sort((a, b) => routeOwnLength[b] - routeOwnLength[a]);
    }

    let childAbove = 0, childBelow = 0;

    for (const ci of children) {
      if (assignedRoutes.has(ci)) continue;
      const [sL, eL] = routeLayerRange[ci];
      const depth = routes[ci].depth;
      const ownLength = routeOwnLength[ci];

      const spacing = (depth <= 1 && ownLength > 2) ? MAIN_SPACING : SUB_SPACING;

      // Pure topological alternation — cls does not influence layout.
      // Styling (color, thickness) is a separate rendering overlay.
      const preferBelow = childBelow <= childAbove;

      const maxDist = maxLanes ? maxLanes : 8;
      let y = null;
      for (let dist = 1; dist <= maxDist; dist++) {
        const tryY = parentY + (preferBelow ? dist * spacing : -dist * spacing);
        if (canUseY(tryY, sL, eL, spacing * 0.8)) {
          y = tryY; break;
        }
        const tryAlt = parentY + (preferBelow ? -dist * spacing : dist * spacing);
        if (canUseY(tryAlt, sL, eL, spacing * 0.8)) {
          y = tryAlt; break;
        }
      }
      if (y === null) {
        y = parentY + (preferBelow ? (childBelow + 1) * spacing : -(childAbove + 1) * spacing);
      }

      routeY.set(ci, y);
      claimY(y, sL, eL);
      assignedRoutes.add(ci);
      laneQueue.push(ci);

      if (y > parentY) childBelow++;
      else childAbove++;
    }
  }

  return { routeY };
}

// Inline helper to avoid circular import with layout-metro.js
function _dominantClass(nodeIds, nodeMap) {
  const counts = {};
  nodeIds.forEach(id => {
    const cls = nodeMap.get(id)?.cls || 'pure';
    counts[cls] = (counts[cls] || 0) + 1;
  });
  let best = 'pure', bestCount = 0;
  for (const [cls, count] of Object.entries(counts)) {
    if (count > bestCount) { best = cls; bestCount = count; }
  }
  return best;
}
