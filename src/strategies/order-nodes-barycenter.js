// order-nodes-barycenter.js — barycenter node ordering strategy.
// Sorts nodes within each layer by the mean position of their neighbors.
// Single top-down pass. For multi-pass with crossing tracking, use
// reduce-crossings-barycenter instead.

import { buildLayers, barycenterSort } from './crossing-utils.js';

/**
 * Order nodes within each layer by barycenter of parent positions (top-down).
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {Map} ctx.layer - node → rank
 * @param {number} ctx.maxLayer
 */
export function orderNodesBarycenter(ctx) {
  const { nodes, parentsOf, layer, maxLayer } = ctx;
  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Top-down: sort each layer by barycenter of parents
  for (let r = 1; r < layers.length; r++) {
    const upperPos = new Map();
    layers[r - 1].forEach((id, i) => upperPos.set(id, i));

    layers[r] = barycenterSort(layers[r], (id) => {
      const parents = parentsOf.get(id) || [];
      return parents.map(p => upperPos.get(p)).filter(p => p !== undefined);
    });
  }

  // Store ordering for downstream use
  const nodeOrder = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => nodeOrder.set(id, pos));
  }
  ctx.nodeOrder = nodeOrder;
}
