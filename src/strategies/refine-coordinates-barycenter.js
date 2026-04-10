// refine-coordinates-barycenter.js — route-level Y-coordinate refinement.
// Moves entire routes toward the barycenter of their neighbor routes,
// preserving the constraint that all nodes on the same route share Y.
// Prevents the zig-zag problem caused by per-node refinement.

/**
 * Refine Y coordinates at the route level.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes - node array
 * @param {Map} ctx.positions - id → {x, y} (mutated in place)
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {object} [ctx.config] - { refinementIterations, minSpacing }
 * @param {Map} [ctx.nodeRoute] - node id → route index
 * @param {Array} [ctx.routes] - route objects with .nodes arrays
 * @param {Map} [ctx.routeY] - route index → Y position
 */
export function refineCoordinatesBarycenter(ctx) {
  const { nodes, positions, childrenOf, parentsOf, config,
          nodeRoute, routes, routeY } = ctx;
  const iterations = config?.refinementIterations ?? 8;
  const minSpacing = config?.minSpacing ?? 40;

  // If we don't have route info, fall back to no-op (don't break things)
  if (!routes || !routeY || !nodeRoute) return;

  // Build route adjacency: which routes are connected by edges?
  const routeNeighbors = new Map(); // routeIdx → Set<routeIdx>
  for (let ri = 0; ri < routes.length; ri++) {
    routeNeighbors.set(ri, new Set());
  }
  for (const nd of nodes) {
    const ri = nodeRoute.get(nd.id);
    if (ri === undefined) continue;
    for (const child of (childrenOf.get(nd.id) || [])) {
      const cri = nodeRoute.get(child);
      if (cri !== undefined && cri !== ri) {
        routeNeighbors.get(ri).add(cri);
        routeNeighbors.get(cri).add(ri);
      }
    }
  }

  // Current route Y values (copy so we can iterate)
  const currentY = new Map(routeY);

  for (let iter = 0; iter < iterations; iter++) {
    // Pull each non-trunk route toward its neighbor routes' Y
    for (let ri = 1; ri < routes.length; ri++) { // skip trunk (ri=0)
      const neighbors = routeNeighbors.get(ri);
      if (!neighbors || neighbors.size === 0) continue;

      let sum = 0, count = 0;
      for (const nri of neighbors) {
        sum += currentY.get(nri);
        count++;
      }
      if (count === 0) continue;

      const avg = sum / count;
      const cur = currentY.get(ri);
      // Blend conservatively: 20% toward neighbor average
      currentY.set(ri, cur * 0.8 + avg * 0.2);
    }

    // Enforce minimum spacing between routes
    const sortedRoutes = [...currentY.entries()].sort((a, b) => a[1] - b[1]);
    // Push apart (top-down)
    for (let i = 1; i < sortedRoutes.length; i++) {
      const prevY = sortedRoutes[i - 1][1];
      const curY = sortedRoutes[i][1];
      if (curY - prevY < minSpacing) {
        sortedRoutes[i][1] = prevY + minSpacing;
        currentY.set(sortedRoutes[i][0], sortedRoutes[i][1]);
      }
    }
    // Balance (bottom-up)
    for (let i = sortedRoutes.length - 2; i >= 0; i--) {
      const nextY = sortedRoutes[i + 1][1];
      const curY = sortedRoutes[i][1];
      if (nextY - curY < minSpacing) {
        sortedRoutes[i][1] = nextY - minSpacing;
        currentY.set(sortedRoutes[i][0], sortedRoutes[i][1]);
      }
    }
  }

  // Apply refined route Y to all node positions
  // All nodes on the same route get the same Y (no zig-zag)
  const minOldY = Math.min(...[...routeY.values()]);
  const minNewY = Math.min(...[...currentY.values()]);
  const topPad = positions.values().next().value?.y ?? 0; // preserve existing top padding

  for (const nd of nodes) {
    const ri = nodeRoute.get(nd.id);
    if (ri === undefined) continue;
    const oldRouteY = routeY.get(ri);
    const newRouteY = currentY.get(ri);
    const pos = positions.get(nd.id);
    if (!pos) continue;
    // Shift by the route's Y delta
    pos.y += (newRouteY - oldRouteY);
  }
}
