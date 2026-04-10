// position-stress-y.js — stress minimization for Y positions.
//
// Minimizes: Σ_ij w_ij (||y_i - y_j|| - d_ij)²
// where d_ij is shortest path distance in the graph.
// Nodes that are close in the graph end up close on screen.
// Deterministic: fixed initial positions and iteration count.

import { buildLayers } from './crossing-utils.js';

/**
 * Compute Y positions via stress minimization.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.layer
 * @param {number} ctx.maxLayer
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {object} ctx.config
 * @param {number} [ctx.config.stressIterations=50]
 * @param {number} [ctx.config.stressSeed=42]
 * @returns {Map<string, number>} node id → Y
 */
export function positionStressY(ctx) {
  const { nodes, childrenOf, parentsOf, config } = ctx;
  const iterations = config?.stressIterations ?? 50;
  const seed = config?.stressSeed ?? 42;
  const n = nodes.length;

  // Compute shortest path distances (BFS on undirected graph)
  const ids = nodes.map(nd => nd.id);
  const idxMap = new Map(ids.map((id, i) => [id, i]));

  const dist = [];
  for (let i = 0; i < n; i++) {
    dist[i] = new Float64Array(n).fill(Infinity);
    dist[i][i] = 0;
  }

  // BFS from each node
  for (let s = 0; s < n; s++) {
    const queue = [ids[s]];
    dist[s][s] = 0;
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      const ui = idxMap.get(u);
      const neighbors = [
        ...(childrenOf.get(u) || []),
        ...(parentsOf.get(u) || []),
      ];
      for (const v of neighbors) {
        const vi = idxMap.get(v);
        if (vi !== undefined && dist[s][vi] === Infinity) {
          dist[s][vi] = dist[s][ui] + 1;
          queue.push(v);
        }
      }
    }
  }

  // Initialize Y deterministically
  const y = new Float64Array(n);
  let rng = seed;
  for (let i = 0; i < n; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    y[i] = ((rng / 0x7fffffff) - 0.5) * 100;
  }

  // Iterative stress minimization (majorization)
  const spacing = 40; // desired distance per graph hop
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      let numerator = 0;
      let denominator = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = dist[i][j];
        if (d === Infinity) continue;

        const ideal = d * spacing;
        const w = 1 / (d * d); // weight: close pairs matter more
        const dy = y[i] - y[j];
        const absDy = Math.abs(dy) + 0.1; // avoid zero

        numerator += w * (y[j] + ideal * (dy / absDy));
        denominator += w;
      }

      if (denominator > 0) {
        y[i] = numerator / denominator;
      }
    }
  }

  const result = new Map();
  for (let i = 0; i < n; i++) {
    result.set(ids[i], y[i]);
  }
  return result;
}
