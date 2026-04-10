// position-force.js — force-directed Y positioning.
//
// Same-layer nodes repel each other. Connected nodes attract.
// Deterministic: uses a seeded PRNG for initial positions and
// fixed iteration count. Produces organic, symmetric layouts.

import { buildLayers } from './crossing-utils.js';

/**
 * Compute Y positions via force simulation.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Map} ctx.layer - node → rank
 * @param {number} ctx.maxLayer
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {object} ctx.config
 * @param {number} [ctx.config.forceRepulsion=100] - repulsion strength
 * @param {number} [ctx.config.forceAttraction=0.05] - attraction along edges
 * @param {number} [ctx.config.forceIterations=50] - simulation steps
 * @param {number} [ctx.config.forceGravity=0.01] - pull toward center
 * @param {number} [ctx.config.forceSeed=42] - deterministic seed
 * @returns {Map<string, number>} node id → Y position
 */
export function positionForceY(ctx) {
  const { nodes, layer, maxLayer, childrenOf, parentsOf, config } = ctx;
  const repulsion = config?.forceRepulsion ?? 100;
  const attraction = config?.forceAttraction ?? 0.05;
  const iterations = config?.forceIterations ?? 50;
  const gravity = config?.forceGravity ?? 0.01;
  const seed = config?.forceSeed ?? 42;

  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Deterministic initial Y: spread within each layer using seeded values
  const y = new Map();
  let rng = seed;
  for (let r = 0; r <= maxLayer; r++) {
    const n = layers[r].length;
    for (let i = 0; i < n; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      const jitter = ((rng / 0x7fffffff) - 0.5) * 20;
      y.set(layers[r][i], (i - (n - 1) / 2) * 50 + jitter);
    }
  }

  // Simulation
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map();
    for (const nd of nodes) forces.set(nd.id, 0);

    // Repulsion: same-layer nodes push apart
    for (let r = 0; r <= maxLayer; r++) {
      const ln = layers[r];
      for (let i = 0; i < ln.length; i++) {
        for (let j = i + 1; j < ln.length; j++) {
          const dy = y.get(ln[i]) - y.get(ln[j]);
          const dist = Math.abs(dy) + 1; // avoid division by zero
          const force = repulsion / (dist * dist);
          const sign = dy > 0 ? 1 : -1;
          forces.set(ln[i], forces.get(ln[i]) + sign * force);
          forces.set(ln[j], forces.get(ln[j]) - sign * force);
        }
      }
    }

    // Attraction: connected nodes pull together
    for (const nd of nodes) {
      const myY = y.get(nd.id);
      for (const child of (childrenOf.get(nd.id) || [])) {
        const childY = y.get(child);
        if (childY === undefined) continue;
        const dy = childY - myY;
        forces.set(nd.id, forces.get(nd.id) + attraction * dy);
        forces.set(child, forces.get(child) - attraction * dy);
      }
    }

    // Gravity: pull toward Y=0 (center)
    if (gravity > 0) {
      for (const nd of nodes) {
        forces.set(nd.id, forces.get(nd.id) - gravity * y.get(nd.id));
      }
    }

    // Apply forces with damping
    const damping = 0.8 * (1 - iter / iterations); // cool down
    for (const nd of nodes) {
      y.set(nd.id, y.get(nd.id) + forces.get(nd.id) * damping);
    }
  }

  return y;
}
