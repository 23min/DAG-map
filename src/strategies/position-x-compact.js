// position-x-compact.js — flexible X positioning via iterative barycenter.
//
// Nodes find their own X by being pulled toward the mean X of their
// neighbors. The only constraints are:
//   1. Topological ordering: parents are always left of children
//   2. Minimum spacing: nodes don't overlap
//
// There is NO layer grid. Nodes on the same topological rank can end up
// at different X positions if their connections pull them apart.

import { buildLayers } from './crossing-utils.js';

/**
 * Compute flexible X positions for all nodes.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes - node array
 * @param {Map} ctx.layer - node → rank map
 * @param {number} ctx.maxLayer
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {object} ctx.config - { layerSpacing, minNodeSpacing, compactionIterations, marginLeft }
 * @returns {Map<string, number>} node id → x position
 */
export function positionXCompact(ctx) {
  const { nodes, layer, maxLayer, childrenOf, parentsOf, config } = ctx;
  const layerSpacing = config.layerSpacing ?? 57;
  const minSpacing = config.minNodeSpacing ?? 30;
  const iterations = config.compactionIterations ?? 12;
  const marginLeft = config.marginLeft ?? 75;

  const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);

  // Initialize at layer grid positions (starting point only)
  const x = new Map();
  for (let r = 0; r <= maxLayer; r++) {
    for (const id of layers[r]) {
      x.set(id, marginLeft + r * layerSpacing);
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Pull each node toward the barycenter of its neighbors
    for (let r = 0; r <= maxLayer; r++) {
      for (const id of layers[r]) {
        const neighbors = [];
        for (const p of (parentsOf.get(id) || [])) {
          if (x.has(p)) neighbors.push(x.get(p));
        }
        for (const c of (childrenOf.get(id) || [])) {
          if (x.has(c)) neighbors.push(x.get(c));
        }
        if (neighbors.length > 0) {
          const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          x.set(id, avg);
        }
      }
    }

    // Enforce topological ordering: every edge must have horizontal progress.
    // Minimum edge gap = minSpacing (no vertical or backward edges).
    // Forward pass: push children right
    for (let r = 0; r < maxLayer; r++) {
      for (const id of layers[r]) {
        const myX = x.get(id);
        for (const child of (childrenOf.get(id) || [])) {
          if (x.has(child) && x.get(child) < myX + minSpacing) {
            x.set(child, myX + minSpacing);
          }
        }
      }
    }
    // Backward pass: pull parents left if children are too close
    for (let r = maxLayer; r > 0; r--) {
      for (const id of layers[r]) {
        const myX = x.get(id);
        for (const parent of (parentsOf.get(id) || [])) {
          if (x.has(parent) && x.get(parent) > myX - minSpacing) {
            x.set(parent, myX - minSpacing);
          }
        }
      }
    }

    // Enforce minimum spacing between nodes in the same layer
    for (let r = 0; r <= maxLayer; r++) {
      const layerNodes = layers[r];
      if (layerNodes.length < 2) continue;

      // Sort by current X
      const sorted = [...layerNodes].sort((a, b) => x.get(a) - x.get(b));

      // Push apart if too close
      for (let i = 1; i < sorted.length; i++) {
        const prevX = x.get(sorted[i - 1]);
        const currX = x.get(sorted[i]);
        if (currX - prevX < minSpacing) {
          x.set(sorted[i], prevX + minSpacing);
        }
      }
    }
  }

  // Final topological enforcement: guarantee no edge has dx <= 0
  for (let r = 0; r < maxLayer; r++) {
    for (const id of layers[r]) {
      const myX = x.get(id);
      for (const child of (childrenOf.get(id) || [])) {
        if (x.has(child) && x.get(child) <= myX + minSpacing) {
          x.set(child, myX + minSpacing);
        }
      }
    }
  }

  // Shift everything so minimum X = marginLeft
  let minX = Infinity;
  for (const [, val] of x) {
    if (val < minX) minX = val;
  }
  const shift = marginLeft - minX;
  if (Math.abs(shift) > 0.01) {
    for (const [id, val] of x) {
      x.set(id, val + shift);
    }
  }

  return x;
}
