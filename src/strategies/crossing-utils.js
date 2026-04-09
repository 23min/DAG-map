// crossing-utils.js — shared utilities for crossing reduction and node ordering.
// Adapted from layout-hasse.js phases 2-3.

/**
 * Build layers array: layers[rank] = [node IDs at that rank].
 */
export function buildLayers(nodeIds, rank, maxRank) {
  const layers = [];
  for (let r = 0; r <= maxRank; r++) layers.push([]);
  for (const id of nodeIds) {
    const r = rank.get(id);
    if (r !== undefined) layers[r].push(id);
  }
  return layers;
}

/**
 * Count edge crossings between consecutive layers.
 * An edge (u1→v1) crosses (u2→v2) when their relative orders are inverted.
 */
export function countCrossings(layers, childrenOf) {
  let total = 0;
  for (let r = 0; r < layers.length - 1; r++) {
    const upper = layers[r];
    const lower = layers[r + 1];
    const posInLower = new Map();
    lower.forEach((id, i) => posInLower.set(id, i));

    const edgePairs = [];
    for (let ui = 0; ui < upper.length; ui++) {
      const children = childrenOf.get(upper[ui]) || [];
      for (const child of children) {
        const li = posInLower.get(child);
        if (li !== undefined) edgePairs.push([ui, li]);
      }
    }

    for (let i = 0; i < edgePairs.length; i++) {
      for (let j = i + 1; j < edgePairs.length; j++) {
        if ((edgePairs[i][0] - edgePairs[j][0]) * (edgePairs[i][1] - edgePairs[j][1]) < 0) {
          total++;
        }
      }
    }
  }
  return total;
}

/**
 * Insert virtual (dummy) nodes for edges spanning multiple layers.
 * Returns new node IDs and expanded edge list. Mutates childrenOf/parentsOf.
 */
export function insertVirtualNodes(edges, rank, maxRank, childrenOf, parentsOf) {
  const virtualNodeIds = [];

  for (const [from, to] of edges) {
    const rFrom = rank.get(from);
    const rTo = rank.get(to);
    if (rFrom === undefined || rTo === undefined) continue;
    const span = rTo - rFrom;
    if (span <= 1) continue;

    // Insert virtual nodes at each intermediate rank
    let prev = from;
    for (let r = rFrom + 1; r < rTo; r++) {
      const vid = `__v_${from}_${to}_${r}`;
      virtualNodeIds.push(vid);
      rank.set(vid, r);

      if (!childrenOf.has(vid)) childrenOf.set(vid, []);
      if (!parentsOf.has(vid)) parentsOf.set(vid, []);

      // Wire: prev → vid
      childrenOf.get(prev).push(vid);
      parentsOf.get(vid).push(prev);

      prev = vid;
    }
    // Wire: last virtual → to
    childrenOf.get(prev).push(to);
    parentsOf.get(to).push(prev);
  }

  return virtualNodeIds;
}

/**
 * Remove virtual nodes from adjacency maps and rank map.
 */
export function removeVirtualNodes(virtualNodeIds, rank, childrenOf, parentsOf) {
  for (const vid of virtualNodeIds) {
    rank.delete(vid);
    childrenOf.delete(vid);
    parentsOf.delete(vid);
  }
  // Clean up references in remaining nodes' adjacency lists
  for (const [, children] of childrenOf) {
    const filtered = children.filter(id => !id.startsWith('__v_'));
    children.length = 0;
    children.push(...filtered);
  }
  for (const [, parents] of parentsOf) {
    const filtered = parents.filter(id => !id.startsWith('__v_'));
    parents.length = 0;
    parents.push(...filtered);
  }
}

/**
 * Sort nodes in a layer by barycenter (mean position) of their neighbors.
 */
export function barycenterSort(layer, getNeighborPositions) {
  const indexed = layer.map((id, i) => {
    const positions = getNeighborPositions(id);
    const bc = positions.length > 0
      ? positions.reduce((a, b) => a + b, 0) / positions.length
      : Infinity;
    return { id, bc, orig: i };
  });
  indexed.sort((a, b) => {
    if (a.bc !== b.bc) return a.bc - b.bc;
    return a.orig - b.orig;
  });
  return indexed.map(e => e.id);
}

/**
 * Sort nodes in a layer by median position of their neighbors.
 */
export function medianSort(layer, getNeighborPositions) {
  const indexed = layer.map((id, i) => {
    const positions = getNeighborPositions(id).sort((a, b) => a - b);
    let med;
    if (positions.length === 0) {
      med = Infinity;
    } else if (positions.length % 2 === 1) {
      med = positions[Math.floor(positions.length / 2)];
    } else {
      med = (positions[positions.length / 2 - 1] + positions[positions.length / 2]) / 2;
    }
    return { id, med, orig: i };
  });
  indexed.sort((a, b) => {
    if (a.med !== b.med) return a.med - b.med;
    return a.orig - b.orig;
  });
  return indexed.map(e => e.id);
}
