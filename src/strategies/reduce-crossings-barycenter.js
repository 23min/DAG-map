// reduce-crossings-barycenter.js — multi-pass barycenter sweep crossing reduction.
// Alternates top-down and bottom-up passes, sorting each layer by the
// barycenter of its neighbors. Keeps the best configuration seen.

import {
  buildLayers, countCrossings, barycenterSort,
  insertVirtualNodes, removeVirtualNodes,
} from './crossing-utils.js';

/**
 * Reduce edge crossings via alternating barycenter sweeps.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes - node array
 * @param {Map} ctx.childrenOf - adjacency (will be temporarily modified for virtual nodes)
 * @param {Map} ctx.parentsOf - adjacency (will be temporarily modified for virtual nodes)
 * @param {Map} ctx.layer - node → rank map (will be temporarily modified for virtual nodes)
 * @param {number} ctx.maxLayer
 * @param {object} [ctx.config] - { passes: number }
 */
export function reduceCrossingsBarycenter(ctx) {
  const { nodes, childrenOf, parentsOf, layer, maxLayer, config } = ctx;
  const passes = config?.crossingPasses ?? 24;
  const edges = [];

  // Collect edges from the original adjacency
  for (const nd of nodes) {
    for (const child of (childrenOf.get(nd.id) || [])) {
      edges.push([nd.id, child]);
    }
  }

  // Insert virtual nodes for long edges
  const virtualNodeIds = insertVirtualNodes(edges, layer, maxLayer, childrenOf, parentsOf);
  const allNodeIds = [...nodes.map(n => n.id), ...virtualNodeIds];

  // Build layers
  const layers = buildLayers(allNodeIds, layer, maxLayer);

  // Run multi-pass barycenter sweep
  let best = layers.map(l => [...l]);
  let bestCrossings = countCrossings(best, childrenOf);

  const current = layers.map(l => [...l]);

  for (let pass = 0; pass < passes; pass++) {
    if (pass % 2 === 0) {
      // Top-down sweep
      for (let r = 1; r < current.length; r++) {
        const upperPos = new Map();
        current[r - 1].forEach((id, i) => upperPos.set(id, i));
        current[r] = barycenterSort(current[r], (id) => {
          const parents = parentsOf.get(id) || [];
          return parents.map(p => upperPos.get(p)).filter(p => p !== undefined);
        });
      }
    } else {
      // Bottom-up sweep
      for (let r = current.length - 2; r >= 0; r--) {
        const lowerPos = new Map();
        current[r + 1].forEach((id, i) => lowerPos.set(id, i));
        current[r] = barycenterSort(current[r], (id) => {
          const children = childrenOf.get(id) || [];
          return children.map(c => lowerPos.get(c)).filter(c => c !== undefined);
        });
      }
    }

    const crossings = countCrossings(current, childrenOf);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      for (let r = 0; r < current.length; r++) best[r] = [...current[r]];
    }
  }

  // Apply the best node order back to the topo order by updating layer positions.
  // The pipeline uses layer positions to influence route extraction and lane assignment.
  // We store the ordering as a position map on the context for downstream use.
  const nodeOrder = new Map();
  for (const layerNodes of best) {
    layerNodes.forEach((id, pos) => {
      if (!id.startsWith('__v_')) {
        nodeOrder.set(id, pos);
      }
    });
  }
  ctx.nodeOrder = nodeOrder;
  ctx.crossings = bestCrossings;

  // Clean up virtual nodes
  removeVirtualNodes(virtualNodeIds, layer, childrenOf, parentsOf);
}
