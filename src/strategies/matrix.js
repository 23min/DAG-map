// matrix.js — sparse matrix representation for DAG layout.
//
// Provides adjacency matrix, graph Laplacian, and O(|E| log |V|)
// crossing count via merge sort inversion counting.

/**
 * Sparse matrix backed by a Map of Maps.
 */
class SparseMatrix {
  constructor(nodeIds) {
    this.nodeIds = nodeIds;
    this.size = nodeIds.length;
    this._rows = new Map();
    this._idx = new Map(nodeIds.map((id, i) => [id, i]));
  }

  get(row, col) {
    return this._rows.get(row)?.get(col) ?? 0;
  }

  set(row, col, val) {
    if (!this._rows.has(row)) this._rows.set(row, new Map());
    this._rows.get(row).set(col, val);
  }

  add(row, col, val) {
    this.set(row, col, this.get(row, col) + val);
  }

  rowEntries(row) {
    return this._rows.get(row) || new Map();
  }

  indexOf(id) {
    return this._idx.get(id);
  }
}

/**
 * Build adjacency matrix from node/edge arrays.
 * A[i][j] = 1 if edge i→j exists. Undirected: treats edges as bidirectional.
 */
export function buildAdjacencyMatrix(nodes, edges) {
  const nodeIds = nodes.map(n => n.id);
  const m = new SparseMatrix(nodeIds);

  for (const [from, to] of edges) {
    m.set(from, to, 1);
    // Symmetric for Laplacian (treat as undirected for spectral analysis)
    m.set(to, from, 1);
  }

  return m;
}

/**
 * Build the graph Laplacian L = D - A.
 *
 * @param {SparseMatrix} adj - adjacency matrix (symmetric)
 * @param {'combinatorial'|'normalized'} type
 * @returns {SparseMatrix}
 */
export function buildLaplacian(adj, type = 'combinatorial') {
  const L = new SparseMatrix(adj.nodeIds);

  // Compute degree and off-diagonal entries
  for (const id of adj.nodeIds) {
    let degree = 0;
    for (const jd of adj.nodeIds) {
      const w = adj.get(id, jd);
      if (w !== 0 && id !== jd) {
        degree += w;
        L.set(id, jd, -w);
      }
    }
    L.set(id, id, degree);
  }

  if (type === 'normalized') {
    // Normalized Laplacian: L_norm = D^{-1/2} L D^{-1/2}
    const sqrtDeg = new Map();
    for (const id of adj.nodeIds) {
      const d = L.get(id, id);
      sqrtDeg.set(id, d > 0 ? 1 / Math.sqrt(d) : 0);
    }
    const Ln = new SparseMatrix(adj.nodeIds);
    for (const i of adj.nodeIds) {
      for (const j of adj.nodeIds) {
        const val = L.get(i, j);
        if (val !== 0) {
          Ln.set(i, j, val * sqrtDeg.get(i) * sqrtDeg.get(j));
        }
      }
    }
    return Ln;
  }

  return L;
}

/**
 * Count edge crossings between two adjacent layers using merge sort
 * inversion counting. O(|E| log |V|) instead of O(|E|²).
 *
 * @param {string[]} upperLayer - node IDs in the upper layer (ordered)
 * @param {string[]} lowerLayer - node IDs in the lower layer (ordered)
 * @param {Map} childrenOf - adjacency map
 * @returns {number} crossing count
 */
export function countCrossingsMergeSort(upperLayer, lowerLayer, childrenOf) {
  // Build position map for lower layer
  const posInLower = new Map();
  lowerLayer.forEach((id, i) => posInLower.set(id, i));

  // Collect lower-layer positions for each edge, in upper-layer order
  const positions = [];
  for (const uid of upperLayer) {
    const children = childrenOf.get(uid) || [];
    for (const child of children) {
      const pos = posInLower.get(child);
      if (pos !== undefined) positions.push(pos);
    }
  }

  // Count inversions via merge sort
  return mergeSortCount(positions);
}

/**
 * Count inversions in an array via merge sort. O(n log n).
 */
function mergeSortCount(arr) {
  if (arr.length <= 1) return 0;

  const mid = Math.floor(arr.length / 2);
  const left = arr.slice(0, mid);
  const right = arr.slice(mid);

  let count = 0;
  count += mergeSortCount(left);
  count += mergeSortCount(right);

  // Merge and count split inversions
  let i = 0, j = 0, k = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      arr[k++] = left[i++];
    } else {
      // right[j] is smaller — it crosses all remaining elements in left
      count += left.length - i;
      arr[k++] = right[j++];
    }
  }
  while (i < left.length) arr[k++] = left[i++];
  while (j < right.length) arr[k++] = right[j++];

  return count;
}

export { SparseMatrix };
