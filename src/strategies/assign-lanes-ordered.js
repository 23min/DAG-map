// assign-lanes-ordered.js — lane assignment that respects crossing-reduction order.
//
// Uses the nodeOrder computed by crossing reduction to assign Y positions.
// The trunk (route 0) is pinned straight at TRUNK_Y. Other nodes are
// positioned top-to-bottom by their crossing-optimized order, centered
// around the trunk.

/**
 * Assign Y positions based on crossing-reduction node order.
 *
 * @param {object} ctx
 * @param {Array} ctx.routes
 * @param {Map} ctx.layer - node → layer rank
 * @param {Map} ctx.nodeRoute - node → primary route index
 * @param {Map} ctx.nodeMap - id → node object
 * @param {boolean} ctx.hasProvidedRoutes
 * @param {object} ctx.config - { TRUNK_Y, MAIN_SPACING, SUB_SPACING, maxLanes }
 * @param {Map} [ctx.nodeOrder] - node id → position within layer (from crossing reduction)
 * @returns {{ routeY: Map<number, number>, nodeY: Map<string, number> }}
 */
export function assignLanesOrdered(ctx) {
  const { routes, layer, nodeRoute, config, nodeOrder } = ctx;
  const { TRUNK_Y, MAIN_SPACING } = config;
  const spacing = MAIN_SPACING || 51;

  if (!nodeOrder || nodeOrder.size === 0) {
    return _fallbackAssign(routes, TRUNK_Y);
  }

  // Identify trunk nodes (route 0)
  const trunkNodes = new Set(routes[0]?.nodes || []);

  // Build layers with ordered nodes
  const layerNodes = new Map();
  for (const [id, order] of nodeOrder) {
    const r = layer.get(id);
    if (r === undefined) continue;
    if (!layerNodes.has(r)) layerNodes.set(r, []);
    layerNodes.get(r).push({ id, order });
  }
  for (const [, nodes] of layerNodes) {
    nodes.sort((a, b) => a.order - b.order);
  }

  // Step 1: For each layer, find where the trunk node sits in the order.
  // Position the trunk node at TRUNK_Y and space others around it.
  const nodeY = new Map();

  for (const [, orderedNodes] of layerNodes) {
    // Find trunk node index in this layer
    let trunkIdx = -1;
    for (let i = 0; i < orderedNodes.length; i++) {
      if (trunkNodes.has(orderedNodes[i].id)) {
        trunkIdx = i;
        break;
      }
    }

    if (trunkIdx === -1) {
      // No trunk node in this layer — center around TRUNK_Y
      const n = orderedNodes.length;
      const totalHeight = (n - 1) * spacing;
      const startY = TRUNK_Y - totalHeight / 2;
      for (let i = 0; i < n; i++) {
        nodeY.set(orderedNodes[i].id, startY + i * spacing);
      }
    } else {
      // Pin trunk node at TRUNK_Y, position others relative to it
      for (let i = 0; i < orderedNodes.length; i++) {
        nodeY.set(orderedNodes[i].id, TRUNK_Y + (i - trunkIdx) * spacing);
      }
    }
  }

  // Step 2: Assign route Y = median Y of member nodes
  const routeY = new Map();
  routeY.set(0, TRUNK_Y); // trunk always at TRUNK_Y
  for (let ri = 1; ri < routes.length; ri++) {
    const ys = routes[ri].nodes
      .map(id => nodeY.get(id))
      .filter(y => y !== undefined)
      .sort((a, b) => a - b);

    if (ys.length === 0) {
      routeY.set(ri, TRUNK_Y);
    } else if (ys.length % 2 === 1) {
      routeY.set(ri, ys[Math.floor(ys.length / 2)]);
    } else {
      routeY.set(ri, (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2);
    }
  }

  return { routeY, nodeY };
}

function _fallbackAssign(routes, trunkY) {
  const routeY = new Map();
  routeY.set(0, trunkY);
  for (let ri = 1; ri < routes.length; ri++) {
    routeY.set(ri, trunkY);
  }
  return { routeY };
}
