// order-nodes-shuffle.js — deterministic shuffle ordering.
// Shuffles non-trunk nodes within each layer using a seeded PRNG.
// Trunk nodes (route 0 in auto-discovery) keep their natural position
// so the spine stays coherent while branches are randomized.

import { buildLayers } from './crossing-utils.js';

export function orderNodesShuffle(ctx) {
  const { nodes, layer, maxLayer, childrenOf, config } = ctx;
  const seed = config?.shuffleSeed ?? 42;

  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Find trunk nodes (longest path) to preserve their order
  const trunkNodes = new Set();
  if (childrenOf) {
    const topo = nodes.map(n => n.id);
    // Simple longest path: DP on topo order
    const dist = new Map();
    const prev = new Map();
    topo.forEach(id => { dist.set(id, 0); prev.set(id, null); });
    for (const u of topo) {
      for (const v of (childrenOf.get(u) || [])) {
        if ((dist.get(u) + 1) > (dist.get(v) || 0)) {
          dist.set(v, dist.get(u) + 1);
          prev.set(v, u);
        }
      }
    }
    let best = -1, end = null;
    for (const [id, d] of dist) { if (d > best) { best = d; end = id; } }
    for (let c = end; c !== null; c = prev.get(c)) trunkNodes.add(c);
  }

  // Fisher-Yates shuffle with seeded PRNG, but skip trunk nodes
  let rng = seed;
  function nextInt(max) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng % (max + 1);
  }

  for (const layerNodes of layers) {
    // Separate trunk and non-trunk
    const trunkPositions = [];
    const nonTrunk = [];
    for (let i = 0; i < layerNodes.length; i++) {
      if (trunkNodes.has(layerNodes[i])) {
        trunkPositions.push({ pos: i, id: layerNodes[i] });
      } else {
        nonTrunk.push(layerNodes[i]);
      }
    }

    // Shuffle only non-trunk nodes
    for (let i = nonTrunk.length - 1; i > 0; i--) {
      const j = nextInt(i);
      const tmp = nonTrunk[i];
      nonTrunk[i] = nonTrunk[j];
      nonTrunk[j] = tmp;
    }

    // Rebuild layer: trunk nodes stay in their positions, non-trunk fill the rest
    const result = [];
    let ntIdx = 0;
    for (let i = 0; i < layerNodes.length; i++) {
      const trunkEntry = trunkPositions.find(t => t.pos === i);
      if (trunkEntry) {
        result.push(trunkEntry.id);
      } else {
        result.push(nonTrunk[ntIdx++]);
      }
    }
    layerNodes.length = 0;
    layerNodes.push(...result);
  }

  const nodeOrder = new Map();
  for (const layerNodes of layers) {
    layerNodes.forEach((id, pos) => nodeOrder.set(id, pos));
  }
  ctx.nodeOrder = nodeOrder;
}
