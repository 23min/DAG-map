// reduce-crossings-greedy.js — greedy adjacent-swap crossing reduction.
// For each pair of adjacent nodes in a layer, swap if it reduces crossings.
// Simpler than barycenter, sometimes finds local improvements barycenter misses.

import {
  buildLayers, countCrossings,
  insertVirtualNodes, removeVirtualNodes,
} from './crossing-utils.js';

/**
 * Reduce crossings by greedily swapping adjacent nodes in each layer.
 *
 * @param {object} ctx - same shape as reduceCrossingsBarycenter
 */
export function reduceCrossingsGreedy(ctx) {
  const { nodes, childrenOf, parentsOf, layer, maxLayer, config } = ctx;
  const passes = config?.crossingPasses ?? 24;
  const edges = [];

  for (const nd of nodes) {
    for (const child of (childrenOf.get(nd.id) || [])) {
      edges.push([nd.id, child]);
    }
  }

  const virtualNodeIds = insertVirtualNodes(edges, layer, maxLayer, childrenOf, parentsOf);
  const allNodeIds = [...nodes.map(n => n.id), ...virtualNodeIds];
  const layers = buildLayers(allNodeIds, layer, maxLayer);

  let improved = true;
  let passCount = 0;

  while (improved && passCount < passes) {
    improved = false;
    passCount++;

    for (let r = 0; r < layers.length; r++) {
      for (let i = 0; i < layers[r].length - 1; i++) {
        const before = countCrossings(layers, childrenOf);

        // Try swap
        const tmp = layers[r][i];
        layers[r][i] = layers[r][i + 1];
        layers[r][i + 1] = tmp;

        const after = countCrossings(layers, childrenOf);

        if (after < before) {
          improved = true; // keep swap
        } else {
          // Undo swap
          layers[r][i + 1] = layers[r][i];
          layers[r][i] = tmp;
        }
      }
    }
  }

  const nodeOrder = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => {
      if (!id.startsWith('__v_')) {
        nodeOrder.set(id, pos);
      }
    });
  }
  ctx.nodeOrder = nodeOrder;
  ctx.crossings = countCrossings(layers, childrenOf);

  removeVirtualNodes(virtualNodeIds, layer, childrenOf, parentsOf);
}
