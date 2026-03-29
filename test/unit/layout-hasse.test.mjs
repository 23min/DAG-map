import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutHasse } from '../../src/layout-hasse.js';

const linear3 = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ],
  edges: [['a', 'b'], ['b', 'c']],
};

const diamond = {
  nodes: [
    { id: 'top', label: 'Top' },
    { id: 'left', label: 'Left' },
    { id: 'right', label: 'Right' },
    { id: 'bot', label: 'Bottom' },
  ],
  edges: [['top', 'left'], ['top', 'right'], ['left', 'bot'], ['right', 'bot']],
};

const booleanLattice = {
  nodes: [
    { id: 'abc', label: '{a,b,c}' },
    { id: 'ab', label: '{a,b}' },
    { id: 'ac', label: '{a,c}' },
    { id: 'bc', label: '{b,c}' },
    { id: 'a', label: '{a}' },
    { id: 'b', label: '{b}' },
    { id: 'c', label: '{c}' },
    { id: 'e', label: '{}' },
  ],
  edges: [
    ['abc', 'ab'], ['abc', 'ac'], ['abc', 'bc'],
    ['ab', 'a'], ['ab', 'b'],
    ['ac', 'a'], ['ac', 'c'],
    ['bc', 'b'], ['bc', 'c'],
    ['a', 'e'], ['b', 'e'], ['c', 'e'],
  ],
};

describe('layoutHasse', () => {
  it('returns required layout properties', () => {
    const layout = layoutHasse(linear3);
    assert.ok(layout.positions instanceof Map);
    assert.ok(Array.isArray(layout.routePaths));
    assert.ok(Array.isArray(layout.extraEdges));
    assert.equal(typeof layout.width, 'number');
    assert.equal(typeof layout.height, 'number');
    assert.ok(layout.width > 0);
    assert.ok(layout.height > 0);
    assert.ok(layout.theme);
    assert.equal(layout.orientation, 'ttb');
  });

  it('positions every node', () => {
    const layout = layoutHasse(linear3);
    for (const nd of linear3.nodes) {
      assert.ok(layout.positions.has(nd.id), `missing position for ${nd.id}`);
    }
  });

  it('assigns increasing Y for linear chain (top-to-bottom)', () => {
    const layout = layoutHasse(linear3);
    const ay = layout.positions.get('a').y;
    const by = layout.positions.get('b').y;
    const cy = layout.positions.get('c').y;
    assert.ok(ay < by, `a.y (${ay}) should be < b.y (${by})`);
    assert.ok(by < cy, `b.y (${by}) should be < c.y (${cy})`);
  });

  it('handles diamond lattice', () => {
    const layout = layoutHasse(diamond);
    assert.equal(layout.positions.size, 4);
    const topY = layout.positions.get('top').y;
    const botY = layout.positions.get('bot').y;
    const leftY = layout.positions.get('left').y;
    const rightY = layout.positions.get('right').y;
    // Top is highest (smallest Y), bottom is lowest
    assert.ok(topY < leftY);
    assert.ok(topY < rightY);
    assert.ok(leftY < botY);
    assert.ok(rightY < botY);
    // Left and right are at the same rank → same Y
    assert.equal(leftY, rightY);
  });

  it('handles boolean lattice (8 nodes, 3 ranks)', () => {
    const layout = layoutHasse(booleanLattice);
    assert.equal(layout.positions.size, 8);
    // abc is rank 0 (top), e is rank 3 (bottom)
    const topY = layout.positions.get('abc').y;
    const botY = layout.positions.get('e').y;
    assert.ok(topY < botY);
  });

  it('produces edge segments for every edge', () => {
    const layout = layoutHasse(linear3);
    const totalSegments = layout.routePaths.reduce((sum, segs) => sum + segs.length, 0);
    assert.equal(totalSegments, linear3.edges.length);
  });

  it('uses mono theme by default', () => {
    const layout = layoutHasse(linear3);
    assert.equal(layout.theme.paper, '#FFFFFF');
  });

  it('respects scale option', () => {
    const l1 = layoutHasse(linear3, { scale: 1 });
    const l2 = layoutHasse(linear3, { scale: 3 });
    assert.ok(l2.width > l1.width);
    assert.ok(l2.height > l1.height);
  });

  it('handles long edges with virtual nodes', () => {
    // a→c spans 2 ranks, needs a virtual node
    const dag = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [['a', 'b'], ['a', 'c'], ['b', 'c']],
    };
    const layout = layoutHasse(dag);
    assert.equal(layout.positions.size, 3);
    // a→c is a long edge (span 2), should still have a smooth path
    const segs = layout.routePaths[0];
    assert.ok(segs.length >= 2, 'should have segments for both short and long edges');
  });

  it('handles single node', () => {
    const dag = { nodes: [{ id: 'x', label: 'X' }], edges: [] };
    const layout = layoutHasse(dag);
    assert.equal(layout.positions.size, 1);
    assert.ok(layout.positions.has('x'));
  });
});
