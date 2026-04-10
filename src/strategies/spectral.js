// spectral.js — Fiedler vector computation for spectral node ordering.
//
// The Fiedler vector is the eigenvector corresponding to the second-smallest
// eigenvalue of the graph Laplacian. Sorting nodes by their Fiedler value
// places connected nodes close together — a globally optimal 1D embedding
// for crossing minimization on many graph classes.
//
// Implementation: inverse power iteration with deflation against the
// trivial eigenvector (all-ones). No external dependencies.

import { buildAdjacencyMatrix, buildLaplacian } from './matrix.js';

/**
 * Compute the Fiedler vector of a graph.
 *
 * @param {Array} nodes - [{id, ...}]
 * @param {Array} edges - [[from, to], ...]
 * @param {object} [opts]
 * @param {'combinatorial'|'normalized'} [opts.laplacianType='combinatorial']
 * @param {number} [opts.maxIterations=200]
 * @param {number} [opts.tolerance=1e-8]
 * @param {number} [opts.seed=42] - for deterministic initial vector
 * @returns {{ vector: Map<string, number>, eigenvalue: number } | null}
 */
export function computeFiedlerVector(nodes, edges, opts = {}) {
  const { laplacianType = 'combinatorial', maxIterations = 200, tolerance = 1e-8, seed = 42 } = opts;

  if (nodes.length < 2) return null;

  const adj = buildAdjacencyMatrix(nodes, edges);
  const L = buildLaplacian(adj, laplacianType);
  const ids = L.nodeIds;
  const n = ids.length;

  if (n < 2) return null;

  // Convert to dense arrays for iteration (sparse is overhead for n<200)
  const Ld = [];
  for (let i = 0; i < n; i++) {
    Ld[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      Ld[i][j] = L.get(ids[i], ids[j]);
    }
  }

  // Find the largest eigenvalue estimate (Gershgorin bound) for shift
  let maxEig = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += Math.abs(Ld[i][j]);
    if (rowSum > maxEig) maxEig = rowSum;
  }

  // Shifted matrix: M = maxEig * I - L
  // The smallest eigenvalue of L becomes the largest of M.
  // We want the SECOND smallest of L, so we use inverse iteration
  // with deflation against the trivial eigenvector.

  // Trivial eigenvector of L: v0 = [1,1,...,1] / sqrt(n)
  const v0 = new Float64Array(n).fill(1 / Math.sqrt(n));

  // Initialize with a deterministic pseudo-random vector
  let v = new Float64Array(n);
  let rng = seed;
  for (let i = 0; i < n; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    v[i] = (rng / 0x7fffffff) - 0.5;
  }

  // Orthogonalize against v0
  let dot0 = 0;
  for (let i = 0; i < n; i++) dot0 += v[i] * v0[i];
  for (let i = 0; i < n; i++) v[i] -= dot0 * v0[i];

  // Normalize
  let norm = 0;
  for (let i = 0; i < n; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-12) return null;
  for (let i = 0; i < n; i++) v[i] /= norm;

  // Power iteration on shifted matrix M = maxEig*I - L
  // to find the eigenvector of the largest eigenvalue of M
  // (= second-smallest eigenvector of L)
  let eigenvalue = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    // w = M * v = maxEig * v - L * v
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let Lv = 0;
      for (let j = 0; j < n; j++) Lv += Ld[i][j] * v[j];
      w[i] = maxEig * v[i] - Lv;
    }

    // Deflate: remove component along v0
    let dotW0 = 0;
    for (let i = 0; i < n; i++) dotW0 += w[i] * v0[i];
    for (let i = 0; i < n; i++) w[i] -= dotW0 * v0[i];

    // Normalize
    norm = 0;
    for (let i = 0; i < n; i++) norm += w[i] * w[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) break;
    for (let i = 0; i < n; i++) w[i] /= norm;

    // Check convergence: |w - v| < tolerance
    let diff = 0;
    for (let i = 0; i < n; i++) diff += (w[i] - v[i]) * (w[i] - v[i]);
    diff = Math.sqrt(diff);

    eigenvalue = maxEig - norm; // eigenvalue of L
    v = w;

    if (diff < tolerance) break;
  }

  // Build result map
  const vector = new Map();
  for (let i = 0; i < n; i++) {
    vector.set(ids[i], v[i]);
  }

  return { vector, eigenvalue };
}
