// position-spectral-2d.js — spectral 2D positioning.
//
// Uses eigenvectors 2 and 3 of the graph Laplacian as raw (x, y)
// coordinates. One-shot global optimization — no iteration needed.
// Then constrains X to maintain topological ordering.

import { buildAdjacencyMatrix, buildLaplacian, SparseMatrix } from './matrix.js';

/**
 * Compute 2D positions from eigenvectors of the Laplacian.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes
 * @param {Array} ctx.edges (via childrenOf)
 * @param {Map} ctx.layer - node → rank (for X ordering constraint)
 * @param {number} ctx.maxLayer
 * @param {Map} ctx.childrenOf
 * @param {object} ctx.config
 * @param {number} [ctx.config.spectralScale=100] - scale factor for positions
 * @param {number} [ctx.config.spectralSeed=42]
 * @returns {{ x: Map<string, number>, y: Map<string, number> }}
 */
export function positionSpectral2D(ctx) {
  const { nodes, childrenOf, layer, maxLayer, config } = ctx;
  const scale = config?.spectralScale ?? 100;
  const seed = config?.spectralSeed ?? 42;
  const n = nodes.length;

  if (n < 3) {
    // Too few nodes for spectral — fall back to simple placement
    const x = new Map();
    const y = new Map();
    nodes.forEach((nd, i) => {
      x.set(nd.id, i * 60);
      y.set(nd.id, 0);
    });
    return { x, y };
  }

  // Build edges list
  const edges = [];
  for (const nd of nodes) {
    for (const child of (childrenOf.get(nd.id) || [])) {
      edges.push([nd.id, child]);
    }
  }

  const adj = buildAdjacencyMatrix(nodes, edges);
  const L = buildLaplacian(adj, 'combinatorial');
  const ids = L.nodeIds;

  // Convert to dense for eigen computation
  const Ld = [];
  for (let i = 0; i < n; i++) {
    Ld[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      Ld[i][j] = L.get(ids[i], ids[j]);
    }
  }

  // Compute eigenvectors 2 and 3 via power iteration on shifted matrix
  let maxEig = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += Math.abs(Ld[i][j]);
    if (rowSum > maxEig) maxEig = rowSum;
  }
  if (maxEig < 1e-10) maxEig = 1;

  const trivial = new Float64Array(n).fill(1 / Math.sqrt(n));

  function computeEigenvector(deflectAgainst, seedOffset) {
    let v = new Float64Array(n);
    let rng = seed + seedOffset;
    for (let i = 0; i < n; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      v[i] = (rng / 0x7fffffff) - 0.5;
    }

    for (let iter = 0; iter < 200; iter++) {
      // w = (maxEig*I - L) * v
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let Lv = 0;
        for (let j = 0; j < n; j++) Lv += Ld[i][j] * v[j];
        w[i] = maxEig * v[i] - Lv;
      }

      // Deflate against trivial and all previous eigenvectors
      for (const u of deflectAgainst) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += w[i] * u[i];
        for (let i = 0; i < n; i++) w[i] -= dot * u[i];
      }

      let norm = 0;
      for (let i = 0; i < n; i++) norm += w[i] * w[i];
      norm = Math.sqrt(norm);
      if (norm < 1e-12) break;
      for (let i = 0; i < n; i++) w[i] /= norm;

      v = w;
    }
    return v;
  }

  const ev2 = computeEigenvector([trivial], 0);
  const ev3 = computeEigenvector([trivial, ev2], 1);

  // Use ev2 for Y, ev3 as secondary signal
  const x = new Map();
  const y = new Map();

  for (let i = 0; i < n; i++) {
    y.set(ids[i], ev2[i] * scale);
    x.set(ids[i], ev3[i] * scale);
  }

  // Constrain X to respect topological ordering
  // Sort nodes by layer, then adjust X so layer order is maintained
  const minSpacing = 30;
  const layerMinX = new Map();
  for (let r = 0; r <= maxLayer; r++) {
    const layerNodes = nodes.filter(nd => layer.get(nd.id) === r);
    if (r === 0) {
      // First layer: just record
      for (const nd of layerNodes) {
        layerMinX.set(r, Math.min(layerMinX.get(r) ?? Infinity, x.get(nd.id)));
      }
    } else {
      // Ensure all nodes in this layer are right of previous layer
      const prevMax = Math.max(...nodes
        .filter(nd => layer.get(nd.id) === r - 1)
        .map(nd => x.get(nd.id)));
      for (const nd of layerNodes) {
        if (x.get(nd.id) <= prevMax + minSpacing) {
          x.set(nd.id, prevMax + minSpacing + (x.get(nd.id) % 20));
        }
      }
    }
  }

  return { x, y };
}
