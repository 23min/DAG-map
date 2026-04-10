// assign-lanes-direct.js — Y positions directly from node ordering.
//
// Takes the nodeOrder computed by crossing reduction / node ordering
// and converts it directly into Y positions. No force simulation,
// no route-based BFS — the ordering IS the layout.
//
// This is the simplest possible lane assignment: sort nodes within
// each layer by their order value, space them evenly, center around TRUNK_Y.

import { buildLayers } from './crossing-utils.js';

/**
 * @param {object} ctx
 * @param {Array} ctx.routes
 * @param {Map} ctx.layer
 * @param {Map} ctx.nodeRoute
 * @param {Map} [ctx.nodeOrder] - node id → position (from ordering strategy)
 * @param {number} ctx.maxLayer
 * @param {object} ctx.config
 */
export function assignLanesDirect(ctx) {
  const { routes, layer, nodeRoute, nodeOrder, maxLayer, config } = ctx;
  const TRUNK_Y = config?.TRUNK_Y ?? 240;
  const spacing = config?.MAIN_SPACING ?? 50;
  const nodes = [...layer.keys()].map(id => ({ id }));

  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Sort each layer by nodeOrder (or alphabetically as fallback)
  for (const layerNodes of layers) {
    if (nodeOrder && nodeOrder.size > 0) {
      layerNodes.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    }
  }

  // Find trunk nodes (route 0) to pin them at TRUNK_Y
  const trunkNodes = new Set(routes[0]?.nodes || []);

  // Assign Y: pin trunk at TRUNK_Y, space others around it
  const nodeY = new Map();
  for (const layerNodes of layers) {
    // Find trunk node index in this layer's sorted order
    let trunkIdx = -1;
    for (let i = 0; i < layerNodes.length; i++) {
      if (trunkNodes.has(layerNodes[i])) { trunkIdx = i; break; }
    }

    if (trunkIdx >= 0) {
      // Pin trunk at TRUNK_Y, others relative
      for (let i = 0; i < layerNodes.length; i++) {
        nodeY.set(layerNodes[i], TRUNK_Y + (i - trunkIdx) * spacing);
      }
    } else {
      // No trunk node — center around TRUNK_Y
      const n = layerNodes.length;
      const totalHeight = (n - 1) * spacing;
      const startY = TRUNK_Y - totalHeight / 2;
      for (let i = 0; i < n; i++) {
        nodeY.set(layerNodes[i], startY + i * spacing);
      }
    }
  }

  // Route Y = median of member nodes
  const routeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    const ys = routes[ri].nodes
      .map(id => nodeY.get(id))
      .filter(y => y !== undefined)
      .sort((a, b) => a - b);
    routeY.set(ri, ys.length > 0 ? ys[Math.floor(ys.length / 2)] : TRUNK_Y);
  }

  return { routeY, nodeY };
}
