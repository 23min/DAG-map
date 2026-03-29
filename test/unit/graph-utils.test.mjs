import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import will initially come from layout-hasse (existing), then graph-utils after extraction
import { buildGraph, topoSortAndRank } from '../../src/graph-utils.js';

const linear = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  edges: [['a', 'b'], ['b', 'c']],
};

const diamond = {
  nodes: [{ id: 's' }, { id: 'l' }, { id: 'r' }, { id: 'j' }],
  edges: [['s', 'l'], ['s', 'r'], ['l', 'j'], ['r', 'j']],
};

describe('buildGraph', () => {
  it('creates nodeMap from nodes', () => {
    const { nodeMap } = buildGraph(linear.nodes, linear.edges);
    assert.equal(nodeMap.size, 3);
    assert.ok(nodeMap.has('a'));
  });

  it('builds childrenOf adjacency', () => {
    const { childrenOf } = buildGraph(linear.nodes, linear.edges);
    assert.deepStrictEqual(childrenOf.get('a'), ['b']);
    assert.deepStrictEqual(childrenOf.get('b'), ['c']);
    assert.deepStrictEqual(childrenOf.get('c'), []);
  });

  it('builds parentsOf adjacency', () => {
    const { parentsOf } = buildGraph(linear.nodes, linear.edges);
    assert.deepStrictEqual(parentsOf.get('a'), []);
    assert.deepStrictEqual(parentsOf.get('b'), ['a']);
    assert.deepStrictEqual(parentsOf.get('c'), ['b']);
  });

  it('handles diamond fork-join', () => {
    const { childrenOf, parentsOf } = buildGraph(diamond.nodes, diamond.edges);
    assert.deepStrictEqual(childrenOf.get('s').sort(), ['l', 'r']);
    assert.deepStrictEqual(parentsOf.get('j').sort(), ['l', 'r']);
  });

  it('handles empty graph', () => {
    const { nodeMap, childrenOf, parentsOf } = buildGraph([], []);
    assert.equal(nodeMap.size, 0);
    assert.equal(childrenOf.size, 0);
    assert.equal(parentsOf.size, 0);
  });

  it('handles nodes with no edges', () => {
    const nodes = [{ id: 'x' }, { id: 'y' }];
    const { childrenOf, parentsOf } = buildGraph(nodes, []);
    assert.deepStrictEqual(childrenOf.get('x'), []);
    assert.deepStrictEqual(parentsOf.get('y'), []);
  });
});

describe('topoSortAndRank', () => {
  it('returns topo order for linear chain', () => {
    const { childrenOf, parentsOf } = buildGraph(linear.nodes, linear.edges);
    const { topo, rank, maxRank } = topoSortAndRank(linear.nodes, childrenOf, parentsOf);
    assert.deepStrictEqual(topo, ['a', 'b', 'c']);
    assert.equal(rank.get('a'), 0);
    assert.equal(rank.get('b'), 1);
    assert.equal(rank.get('c'), 2);
    assert.equal(maxRank, 2);
  });

  it('assigns same rank to parallel nodes in diamond', () => {
    const { childrenOf, parentsOf } = buildGraph(diamond.nodes, diamond.edges);
    const { rank, maxRank } = topoSortAndRank(diamond.nodes, childrenOf, parentsOf);
    assert.equal(rank.get('s'), 0);
    assert.equal(rank.get('l'), 1);
    assert.equal(rank.get('r'), 1);
    assert.equal(rank.get('j'), 2);
    assert.equal(maxRank, 2);
  });

  it('includes all nodes in topo order', () => {
    const { childrenOf, parentsOf } = buildGraph(diamond.nodes, diamond.edges);
    const { topo } = topoSortAndRank(diamond.nodes, childrenOf, parentsOf);
    assert.equal(topo.length, 4);
    assert.ok(topo.indexOf('s') < topo.indexOf('l'));
    assert.ok(topo.indexOf('s') < topo.indexOf('r'));
    assert.ok(topo.indexOf('l') < topo.indexOf('j'));
    assert.ok(topo.indexOf('r') < topo.indexOf('j'));
  });

  it('handles single node', () => {
    const nodes = [{ id: 'x' }];
    const { childrenOf, parentsOf } = buildGraph(nodes, []);
    const { topo, rank, maxRank } = topoSortAndRank(nodes, childrenOf, parentsOf);
    assert.deepStrictEqual(topo, ['x']);
    assert.equal(rank.get('x'), 0);
    assert.equal(maxRank, 0);
  });

  it('handles disconnected components', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const edges = [['a', 'b'], ['c', 'd']];
    const { childrenOf, parentsOf } = buildGraph(nodes, edges);
    const { topo, rank } = topoSortAndRank(nodes, childrenOf, parentsOf);
    assert.equal(topo.length, 4);
    assert.equal(rank.get('a'), 0);
    assert.equal(rank.get('b'), 1);
    assert.equal(rank.get('c'), 0);
    assert.equal(rank.get('d'), 1);
  });

  it('handles empty graph', () => {
    const { childrenOf, parentsOf } = buildGraph([], []);
    const { topo, maxRank } = topoSortAndRank([], childrenOf, parentsOf);
    assert.equal(topo.length, 0);
    assert.equal(maxRank, 0);
  });

  it('detects cycles (topo length < nodes length)', () => {
    // Manually create a cycle: a→b→c→a
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [['a', 'b'], ['b', 'c'], ['c', 'a']];
    const { childrenOf, parentsOf } = buildGraph(nodes, edges);
    const { topo } = topoSortAndRank(nodes, childrenOf, parentsOf);
    // With a cycle, topo sort won't include all nodes
    assert.ok(topo.length < nodes.length, 'cycle should cause incomplete topo sort');
  });
});
