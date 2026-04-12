// reduce-crossings-route-aware.js — crossing reduction that keeps same-route
// nodes at consistent positions across layers.
//
// Works as a refinement on top of an existing ordering (from orderNodes).
// For each layer, tries swapping adjacent nodes if:
//   1. The swap brings same-route nodes closer together, AND
//   2. The swap doesn't increase crossings
//
// This reduces the "wiggly route" problem where a route's nodes end up
// at different Y positions in consecutive layers.

import { buildLayers, countCrossings } from './crossing-utils.js';

/**
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {Map} ctx.layer
 * @param {number} ctx.maxLayer
 * @param {object} [ctx.config]
 * @param {Array} [ctx.providedRoutes] - route objects with .nodes arrays
 */
export function reduceCrossingsRouteAware(ctx) {
  const { nodes, childrenOf, parentsOf, layer, maxLayer, config, providedRoutes } = ctx;
  const passes = config?.crossingPasses ?? 12;

  // Build node-to-route membership
  const nodeToRoutes = new Map(); // nodeId → Set<routeIdx>
  const routes = providedRoutes || [];
  if (routes.length === 0) {
    // No routes — fall back to basic barycenter
    return;
  }

  for (let ri = 0; ri < routes.length; ri++) {
    for (const nodeId of routes[ri].nodes) {
      if (!nodeToRoutes.has(nodeId)) nodeToRoutes.set(nodeId, new Set());
      nodeToRoutes.get(nodeId).add(ri);
    }
  }

  // Use existing nodeOrder if available, otherwise build layers from topo order
  const nodeOrder = ctx.nodeOrder;
  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);
  if (nodeOrder && nodeOrder.size > 0) {
    for (const layerNodes of layers) {
      layerNodes.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    }
  }

  // For each route, compute the "ideal" Y position at each layer:
  // the position of the route's node in the previous layer.
  // A node is "displaced" if its position differs from this ideal.

  for (let pass = 0; pass < passes; pass++) {
    let anySwap = false;

    for (let r = 0; r < layers.length; r++) {
      const layerNodes = layers[r];
      if (layerNodes.length < 2) continue;

      for (let i = 0; i < layerNodes.length - 1; i++) {
        const a = layerNodes[i], b = layerNodes[i + 1];

        // Would swapping a and b improve route coherence?
        const aRoutes = nodeToRoutes.get(a);
        const bRoutes = nodeToRoutes.get(b);
        if (!aRoutes && !bRoutes) continue;

        // Compute route coherence score: for each route through this node,
        // how close is this node's position to the same route's node in
        // adjacent layers?
        function routeCoherenceAt(nodeId, pos) {
          const routes = nodeToRoutes.get(nodeId);
          if (!routes) return 0;
          let score = 0;
          for (const ri of routes) {
            const route = providedRoutes[ri];
            // Find this route's nodes in adjacent layers
            for (const otherLayer of [r - 1, r + 1]) {
              if (otherLayer < 0 || otherLayer >= layers.length) continue;
              for (let j = 0; j < layers[otherLayer].length; j++) {
                if (route.nodes.includes(layers[otherLayer][j])) {
                  score += Math.abs(pos - j); // distance from same-route neighbor
                }
              }
            }
          }
          return score;
        }

        const currentScore = routeCoherenceAt(a, i) + routeCoherenceAt(b, i + 1);
        const swappedScore = routeCoherenceAt(a, i + 1) + routeCoherenceAt(b, i);

        if (swappedScore < currentScore) {
          // Check that swap doesn't increase crossings
          const crossBefore = countCrossings(layers, childrenOf);
          layerNodes[i] = b;
          layerNodes[i + 1] = a;
          const crossAfter = countCrossings(layers, childrenOf);

          if (crossAfter <= crossBefore) {
            anySwap = true; // keep swap
          } else {
            // Undo
            layerNodes[i] = a;
            layerNodes[i + 1] = b;
          }
        }
      }
    }

    if (!anySwap) break;
  }

  // Store result
  const nodeOrderOut = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => nodeOrderOut.set(id, pos));
  }
  ctx.nodeOrder = nodeOrderOut;
}
