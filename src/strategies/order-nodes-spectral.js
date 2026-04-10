// order-nodes-spectral.js — spectral node ordering strategy.
// Sorts nodes within each layer by their Fiedler vector component.
// Connected nodes end up adjacent — a globally optimal ordering.

import { buildLayers } from './crossing-utils.js';
import { computeFiedlerVector } from './spectral.js';

/**
 * Order nodes within each layer by their Fiedler vector value.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {Map} ctx.layer - node → rank
 * @param {number} ctx.maxLayer
 * @param {object} [ctx.config] - { laplacianType, seed }
 */
export function orderNodesSpectral(ctx) {
  const { nodes, layer, maxLayer, config } = ctx;

  const edges = [];
  for (const nd of nodes) {
    for (const child of (ctx.childrenOf.get(nd.id) || [])) {
      edges.push([nd.id, child]);
    }
  }

  const result = computeFiedlerVector(nodes, edges, {
    laplacianType: config?.laplacianType || 'combinatorial',
    seed: config?.spectralSeed ?? 42,
  });

  if (!result) return; // too few nodes, no ordering

  const { vector } = result;
  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Sort each layer by Fiedler value
  for (let r = 0; r <= maxLayer; r++) {
    layers[r].sort((a, b) => (vector.get(a) ?? 0) - (vector.get(b) ?? 0));
  }

  // Store ordering
  const nodeOrder = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => nodeOrder.set(id, pos));
  }
  ctx.nodeOrder = nodeOrder;
}
