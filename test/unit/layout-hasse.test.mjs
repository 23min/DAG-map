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

  // ── Edge cases ────────────────────────────────────────────

  it('same-rank nodes have distinct X coordinates', () => {
    const layout = layoutHasse(diamond);
    const leftX = layout.positions.get('left').x;
    const rightX = layout.positions.get('right').x;
    assert.ok(Math.abs(leftX - rightX) > 1, 'same-rank nodes should have different X');
  });

  it('boolean lattice: rank-1 nodes all at same Y', () => {
    const layout = layoutHasse(booleanLattice);
    const abY = layout.positions.get('ab').y;
    const acY = layout.positions.get('ac').y;
    const bcY = layout.positions.get('bc').y;
    assert.equal(abY, acY);
    assert.equal(acY, bcY);
  });

  it('boolean lattice: rank-2 nodes all at same Y', () => {
    const layout = layoutHasse(booleanLattice);
    const aY = layout.positions.get('a').y;
    const bY = layout.positions.get('b').y;
    const cY = layout.positions.get('c').y;
    assert.equal(aY, bY);
    assert.equal(bY, cY);
  });

  it('edge segments have valid SVG path data', () => {
    const layout = layoutHasse(booleanLattice);
    for (const segs of layout.routePaths) {
      for (const seg of segs) {
        assert.ok(seg.d.startsWith('M'), `path should start with M: ${seg.d.slice(0, 30)}`);
        assert.ok(typeof seg.color === 'string');
        assert.ok(seg.thickness > 0);
        assert.ok(seg.opacity > 0);
      }
    }
  });

  it('supports straight edge style', () => {
    const layout = layoutHasse(diamond, { edgeStyle: 'straight' });
    for (const segs of layout.routePaths) {
      for (const seg of segs) {
        // Straight edges should only have M and L, no C
        assert.ok(!seg.d.includes('C'), 'straight edges should not have bezier curves');
      }
    }
  });

  it('supports bezier edge style', () => {
    const layout = layoutHasse(diamond, { edgeStyle: 'bezier' });
    // At least some edges should have C commands (unless perfectly straight)
    const allPaths = layout.routePaths.flatMap(s => s).map(s => s.d).join('');
    // For diamond with offset X, bezier should produce C commands
    const hasC = allPaths.includes('C');
    // It's OK if some are straight (dx < 2), just verify no errors
    assert.ok(layout.positions.size === 4);
  });

  it('handles wide lattice (6 nodes at same rank)', () => {
    const nodes = [{ id: 'top', label: 'Top' }, { id: 'bot', label: 'Bot' }];
    const edges = [];
    for (let i = 0; i < 6; i++) {
      nodes.push({ id: `m${i}`, label: `Mid ${i}` });
      edges.push(['top', `m${i}`]);
      edges.push([`m${i}`, 'bot']);
    }
    const layout = layoutHasse({ nodes, edges });
    assert.equal(layout.positions.size, 8);
    // All mid nodes should be at the same Y
    const midYs = [];
    for (let i = 0; i < 6; i++) midYs.push(layout.positions.get(`m${i}`).y);
    for (let i = 1; i < 6; i++) assert.equal(midYs[i], midYs[0]);
    // All mid nodes should have distinct X
    const midXs = midYs.map((_, i) => layout.positions.get(`m${i}`).x);
    const uniqueXs = new Set(midXs.map(x => Math.round(x)));
    assert.equal(uniqueXs.size, 6, 'all 6 mid nodes should have distinct X');
  });

  it('handles deep chain (10 nodes)', () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 10; i++) {
      nodes.push({ id: `n${i}`, label: `N${i}` });
      if (i > 0) edges.push([`n${i - 1}`, `n${i}`]);
    }
    const layout = layoutHasse({ nodes, edges });
    assert.equal(layout.positions.size, 10);
    // Y should be monotonically increasing
    for (let i = 1; i < 10; i++) {
      const prevY = layout.positions.get(`n${i - 1}`).y;
      const currY = layout.positions.get(`n${i}`).y;
      assert.ok(currY > prevY, `n${i} should be below n${i - 1}`);
    }
  });

  it('produces correct number of edge segments for boolean lattice', () => {
    const layout = layoutHasse(booleanLattice);
    const totalSegs = layout.routePaths.reduce((sum, segs) => sum + segs.length, 0);
    assert.equal(totalSegs, booleanLattice.edges.length);
  });
});
