import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdjacencyMatrix,
  buildLaplacian,
  countCrossingsMergeSort,
} from '../../src/strategies/matrix.js';
import { countCrossings, buildLayers } from '../../src/strategies/crossing-utils.js';
import { buildGraph, topoSortAndRank } from '../../src/graph-utils.js';
import { models } from '../models.js';

// Simple test graphs
const DIAMOND = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
};

const CHAIN = {
  nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
  edges: [['x', 'y'], ['y', 'z']],
};

const CROSSING = {
  // a→d and b→c cross when a is above b and c is above d
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [['a', 'd'], ['b', 'c']],
};

describe('adjacency matrix', () => {
  it('builds correct matrix for diamond graph', () => {
    const m = buildAdjacencyMatrix(DIAMOND.nodes, DIAMOND.edges);
    assert.equal(m.size, 4);
    assert.deepStrictEqual(m.get('a', 'b'), 1);
    assert.deepStrictEqual(m.get('a', 'c'), 1);
    assert.deepStrictEqual(m.get('b', 'd'), 1);
    assert.deepStrictEqual(m.get('c', 'd'), 1);
    assert.deepStrictEqual(m.get('a', 'd'), 0);
    assert.deepStrictEqual(m.get('d', 'a'), 0);
  });

  it('builds correct matrix for chain', () => {
    const m = buildAdjacencyMatrix(CHAIN.nodes, CHAIN.edges);
    assert.equal(m.size, 3);
    assert.equal(m.get('x', 'y'), 1);
    assert.equal(m.get('y', 'z'), 1);
    assert.equal(m.get('x', 'z'), 0);
  });

  it('nodeIds returns nodes in insertion order', () => {
    const m = buildAdjacencyMatrix(DIAMOND.nodes, DIAMOND.edges);
    assert.deepStrictEqual(m.nodeIds, ['a', 'b', 'c', 'd']);
  });
});

describe('Laplacian', () => {
  it('row sums are zero (combinatorial Laplacian)', () => {
    const adj = buildAdjacencyMatrix(DIAMOND.nodes, DIAMOND.edges);
    const L = buildLaplacian(adj, 'combinatorial');
    for (const id of L.nodeIds) {
      let rowSum = 0;
      for (const jd of L.nodeIds) {
        rowSum += L.get(id, jd);
      }
      assert.ok(Math.abs(rowSum) < 1e-10, `row sum for ${id} should be 0, got ${rowSum}`);
    }
  });

  it('diagonal equals degree (combinatorial)', () => {
    const adj = buildAdjacencyMatrix(DIAMOND.nodes, DIAMOND.edges);
    const L = buildLaplacian(adj, 'combinatorial');
    // a has out-degree 2, in-degree 0 → total degree 2
    // d has out-degree 0, in-degree 2 → total degree 2
    // b has out-degree 1, in-degree 1 → total degree 2
    assert.equal(L.get('a', 'a'), 2);
    assert.equal(L.get('b', 'b'), 2);
    assert.equal(L.get('d', 'd'), 2);
  });
});

describe('efficient crossing count (merge sort)', () => {
  it('returns 0 for no crossings', () => {
    const { childrenOf } = buildGraph(CHAIN.nodes, CHAIN.edges);
    const count = countCrossingsMergeSort(['x'], ['y'], childrenOf);
    assert.equal(count, 0);
  });

  it('detects crossings correctly', () => {
    const { childrenOf } = buildGraph(CROSSING.nodes, CROSSING.edges);
    // a→d, b→c with order [a,b] and [c,d]: edges cross
    const count = countCrossingsMergeSort(['a', 'b'], ['c', 'd'], childrenOf);
    assert.equal(count, 1);
  });

  it('returns 0 when order prevents crossings', () => {
    const { childrenOf } = buildGraph(CROSSING.nodes, CROSSING.edges);
    // Reorder: [b,a] and [c,d] — b→c and a→d don't cross
    const count = countCrossingsMergeSort(['b', 'a'], ['c', 'd'], childrenOf);
    assert.equal(count, 0);
  });

  it('matches naive crossing count on all Tier A fixtures', () => {
    for (const model of models.slice(0, 15)) {
      const { childrenOf, parentsOf } = buildGraph(model.dag.nodes, model.dag.edges);
      const { rank, maxRank } = topoSortAndRank(model.dag.nodes, childrenOf, parentsOf);
      const layers = buildLayers(model.dag.nodes.map(n => n.id), rank, maxRank);

      const naiveCount = countCrossings(layers, childrenOf);

      let fastCount = 0;
      for (let r = 0; r < layers.length - 1; r++) {
        fastCount += countCrossingsMergeSort(layers[r], layers[r + 1], childrenOf);
      }

      assert.equal(fastCount, naiveCount,
        `crossing count mismatch on "${model.id}": fast=${fastCount} naive=${naiveCount}`);
    }
  });
});
