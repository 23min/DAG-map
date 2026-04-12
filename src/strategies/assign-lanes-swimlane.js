// assign-lanes-swimlane.js — swimlane lane assignment (Mode 2).
//
// Each route gets its own horizontal lane. The trunk is at Y=0,
// other routes are spaced below in route order. Shared nodes
// appear at their primary route's lane.
//
// This creates a process-mining / swimlane view using Mode 1's
// rendering infrastructure (bezier curves, pills, parallel tracks).

/**
 * @param {object} ctx
 * @param {Array} ctx.routes
 * @param {Map} ctx.layer - node → rank
 * @param {Map} ctx.nodeRoute - node → primary route index
 * @param {Map} ctx.nodeMap
 * @param {boolean} ctx.hasProvidedRoutes
 * @param {Map} [ctx.nodeOrder]
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

  // Each node gets Y from its primary route's lane
  const nodeY = new Map();
  const allNodes = [...(ctx.layer?.keys() || [])];
  for (const id of allNodes) {
    const ri = nodeRoute?.get(id) ?? 0;
    nodeY.set(id, routeY.get(ri) ?? TRUNK_Y);
  }

  return { routeY, nodeY };
}
