// order-nodes-hybrid.js — hybrid spectral+barycenter node ordering.
//
// Blends spectral ordering (global, one-shot) with barycenter ordering
// (local, iterative) using a continuous blend parameter. The GA can
// evolve the optimal blend ratio.
//
// blend = 0.0: pure spectral
// blend = 1.0: pure barycenter
// blend = 0.7: 70% barycenter, 30% spectral

import { buildLayers, barycenterSort } from './crossing-utils.js';
import { computeFiedlerVector } from './spectral.js';

/**
 * Hybrid node ordering: blend spectral and barycenter positions.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {Map} ctx.layer - node → rank
 * @param {number} ctx.maxLayer
 * @param {object} [ctx.config]
 * @param {number} [ctx.config.spectralBlend=0.5] - 0=spectral, 1=barycenter
 * @param {string} [ctx.config.laplacianType='combinatorial']
 */
export function orderNodesHybrid(ctx) {
  const { nodes, childrenOf, parentsOf, layer, maxLayer, config } = ctx;
  const blend = config?.spectralBlend ?? 0.5;
  const laplacianType = config?.laplacianType || 'combinatorial';

  const ids = nodes.map(n => n.id);
  const layers = buildLayers(ids, layer, maxLayer);

  // Step 1: Compute spectral positions
  const edges = [];
  for (const nd of nodes) {
    for (const child of (childrenOf.get(nd.id) || [])) {
      edges.push([nd.id, child]);
    }
  }

  const fiedler = computeFiedlerVector(nodes, edges, { laplacianType });
  const spectralPos = new Map();
  if (fiedler) {
    // Normalize Fiedler values to [0, layerSize-1] within each layer
    for (let r = 0; r <= maxLayer; r++) {
      const layerNodes = layers[r];
      if (layerNodes.length < 2) {
        layerNodes.forEach((id, i) => spectralPos.set(id, i));
        continue;
      }
      const vals = layerNodes.map(id => ({ id, v: fiedler.vector.get(id) ?? 0 }));
      vals.sort((a, b) => a.v - b.v);
      vals.forEach((item, i) => spectralPos.set(item.id, i));
    }
  }

  // Step 2: Compute barycenter positions (single top-down pass)
  const baryPos = new Map();
  for (let r = 0; r <= maxLayer; r++) {
    const layerNodes = layers[r];
    if (r === 0 || layerNodes.length < 2) {
      layerNodes.forEach((id, i) => baryPos.set(id, i));
      continue;
    }
    // Build upper layer position map from already-assigned blended positions
    const upperPos = new Map();
    layers[r - 1].forEach((id, i) => {
      upperPos.set(id, baryPos.get(id) ?? i);
    });

    const sorted = barycenterSort(layerNodes, (id) => {
      const parents = parentsOf.get(id) || [];
      return parents.map(p => upperPos.get(p)).filter(p => p !== undefined);
    });
    sorted.forEach((id, i) => baryPos.set(id, i));
  }

  // Step 3: Blend positions and sort each layer by blended value
  const nodeOrder = new Map();
  for (let r = 0; r <= maxLayer; r++) {
    const layerNodes = layers[r];
    if (layerNodes.length < 2) {
      layerNodes.forEach((id, i) => nodeOrder.set(id, i));
      continue;
    }

    // Compute blended position for each node
    const blended = layerNodes.map(id => {
      const sp = spectralPos.get(id) ?? 0;
      const bp = baryPos.get(id) ?? 0;
      return { id, pos: blend * bp + (1 - blend) * sp };
    });

    // Sort by blended position
    blended.sort((a, b) => a.pos - b.pos);
    blended.forEach((item, i) => nodeOrder.set(item.id, i));
  }

  ctx.nodeOrder = nodeOrder;
}
