// refine-coordinates-barycenter.js — iterative barycenter Y-coordinate refinement.
// After initial BFS lane allocation, pulls each node's Y toward the
// barycenter of its neighbors, then enforces minimum spacing.
// Adapted from layoutHasse's assignXCoordinates (applied to Y axis).

/**
 * Refine Y coordinates by pulling toward neighbor barycenters.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes - node array
 * @param {Map} ctx.positions - id → {x, y} (mutated in place)
 * @param {Map} ctx.childrenOf
 * @param {Map} ctx.parentsOf
 * @param {object} [ctx.config] - { refinementIterations, minSpacing }
 */
export function refineCoordinatesBarycenter(ctx) {
  const { nodes, positions, childrenOf, parentsOf, config } = ctx;
  const iterations = config?.refinementIterations ?? 12;
  const minSpacing = config?.minSpacing ?? 20;

  // Group nodes by their x-coordinate (layer) for spacing enforcement
  const layerGroups = new Map();
  for (const nd of nodes) {
    const pos = positions.get(nd.id);
    if (!pos) continue;
    const key = pos.x;
    if (!layerGroups.has(key)) layerGroups.set(key, []);
    layerGroups.get(key).push(nd.id);
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Pull each node toward barycenter of its neighbors
    for (const nd of nodes) {
      const id = nd.id;
      const neighbors = [];
      for (const p of (parentsOf.get(id) || [])) {
        const pos = positions.get(p);
        if (pos) neighbors.push(pos.y);
      }
      for (const c of (childrenOf.get(id) || [])) {
        const pos = positions.get(c);
        if (pos) neighbors.push(pos.y);
      }
      if (neighbors.length === 0) continue;

      const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
      const pos = positions.get(id);
      // Blend: move 30% toward barycenter (conservative to preserve route coherence)
      pos.y = pos.y * 0.7 + avg * 0.3;
    }

    // Enforce minimum spacing within each layer
    for (const [, group] of layerGroups) {
      if (group.length < 2) continue;
      // Sort by current Y
      group.sort((a, b) => positions.get(a).y - positions.get(b).y);

      // Push apart if too close (top-down)
      for (let i = 1; i < group.length; i++) {
        const prev = positions.get(group[i - 1]);
        const curr = positions.get(group[i]);
        if (curr.y - prev.y < minSpacing) {
          curr.y = prev.y + minSpacing;
        }
      }
      // Balance (bottom-up)
      for (let i = group.length - 2; i >= 0; i--) {
        const next = positions.get(group[i + 1]);
        const curr = positions.get(group[i]);
        if (next.y - curr.y < minSpacing) {
          curr.y = next.y - minSpacing;
        }
      }
    }
  }
}
