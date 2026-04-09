// order-nodes-median.js — median node ordering strategy.
// Sorts nodes within each layer by the median position of their neighbors.
// More robust to outliers than barycenter.

import { buildLayers, medianSort } from './crossing-utils.js';

/**
 * Order nodes within each layer by median of parent positions (top-down).
 *
 * @param {object} ctx - same shape as orderNodesBarycenter
 */
export function orderNodesMedian(ctx) {
  const { nodes, parentsOf, layer, maxLayer } = ctx;
  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  for (let r = 1; r < layers.length; r++) {
    const upperPos = new Map();
    layers[r - 1].forEach((id, i) => upperPos.set(id, i));

    layers[r] = medianSort(layers[r], (id) => {
      const parents = parentsOf.get(id) || [];
      return parents.map(p => upperPos.get(p)).filter(p => p !== undefined);
    });
  }

  const nodeOrder = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => nodeOrder.set(id, pos));
  }
  ctx.nodeOrder = nodeOrder;
}
