// assign-lanes-swimlane.js — swimlane lane assignment (Mode 2).
//
// Each route gets its own horizontal lane. Routes stay FLAT in their
// lane — no dipping to other lanes at shared nodes. Instead, the
// path builder uses per-route Y values so each route always renders
// at its own lane height.
//
// Shared nodes: the physical node is positioned at its primary route's
// lane, but when a secondary route passes through it, the route's
// path stays at ITS lane height. The MLCM track assignment handles
// the visual interchange.

/**
 * @param {object} ctx
 * @param {Array} ctx.routes
 * @param {Map} ctx.layer - node → rank
 * @param {Map} ctx.nodeRoute - node → primary route index
 * @param {Map} ctx.nodeRoutes - node → Set of route indices
 * @param {Map} ctx.nodeMap
 * @param {boolean} ctx.hasProvidedRoutes
 * @param {number} ctx.maxLayer
 * @param {object} ctx.config
 */
export function assignLanesSwimlane(ctx) {
  const { routes, nodeRoute, config } = ctx;
  const TRUNK_Y = config?.TRUNK_Y ?? 240;
  const laneHeight = config?.MAIN_SPACING ?? 60;

  // Each route gets its own lane
  const routeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    routeY.set(ri, TRUNK_Y + ri * laneHeight);
  }

  // Node Y = primary route's lane
  const nodeY = new Map();
  const allNodes = [...(ctx.layer?.keys() || [])];
  for (const id of allNodes) {
    const ri = nodeRoute?.get(id) ?? 0;
    nodeY.set(id, routeY.get(ri) ?? TRUNK_Y);
  }

  // Per-route node Y: when route R draws through node N, it uses
  // route R's lane Y — not node N's primary Y. This keeps routes flat.
  const routeNodeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    const rny = new Map();
    const ry = routeY.get(ri);
    for (const nodeId of routes[ri].nodes) {
      rny.set(nodeId, ry);
    }
    routeNodeY.set(ri, rny);
  }

  return { routeY, nodeY, routeNodeY };
}
