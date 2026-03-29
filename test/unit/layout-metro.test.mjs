import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetro, dominantClass } from '../../src/layout-metro.js';

// Minimal DAG fixtures
const linear3 = {
  nodes: [
    { id: 'a', label: 'A', cls: 'pure' },
    { id: 'b', label: 'B', cls: 'pure' },
    { id: 'c', label: 'C', cls: 'pure' },
  ],
  edges: [['a', 'b'], ['b', 'c']],
};

const diamond = {
  nodes: [
    { id: 's', label: 'S', cls: 'pure' },
    { id: 'l', label: 'L', cls: 'recordable' },
    { id: 'r', label: 'R', cls: 'side_effecting' },
    { id: 'j', label: 'J', cls: 'pure' },
  ],
  edges: [['s', 'l'], ['s', 'r'], ['l', 'j'], ['r', 'j']],
};

describe('dominantClass', () => {
  it('returns the most common class', () => {
    const nodeMap = new Map([
      ['a', { cls: 'pure' }],
      ['b', { cls: 'recordable' }],
      ['c', { cls: 'pure' }],
    ]);
    assert.equal(dominantClass(['a', 'b', 'c'], nodeMap), 'pure');
  });

  it('defaults to pure for missing cls', () => {
    const nodeMap = new Map([['a', {}], ['b', {}]]);
    assert.equal(dominantClass(['a', 'b'], nodeMap), 'pure');
  });
});

describe('layoutMetro', () => {
  it('returns required layout properties', () => {
    const layout = layoutMetro(linear3);
    assert.ok(layout.positions instanceof Map);
    assert.ok(Array.isArray(layout.routePaths));
    assert.ok(Array.isArray(layout.extraEdges));
    assert.equal(typeof layout.width, 'number');
    assert.equal(typeof layout.height, 'number');
    assert.ok(layout.width > 0);
    assert.ok(layout.height > 0);
    assert.ok(Array.isArray(layout.routes));
    assert.ok(layout.nodeRoute instanceof Map);
    assert.ok(layout.nodeLane instanceof Map);
    assert.ok(layout.theme);
  });

  it('positions every node', () => {
    const layout = layoutMetro(linear3);
    for (const nd of linear3.nodes) {
      assert.ok(layout.positions.has(nd.id), `missing position for ${nd.id}`);
      const pos = layout.positions.get(nd.id);
      assert.equal(typeof pos.x, 'number');
      assert.equal(typeof pos.y, 'number');
    }
  });

  it('assigns monotonically increasing X for linear chain (LTR)', () => {
    const layout = layoutMetro(linear3);
    const ax = layout.positions.get('a').x;
    const bx = layout.positions.get('b').x;
    const cx = layout.positions.get('c').x;
    assert.ok(ax < bx, `a.x (${ax}) should be < b.x (${bx})`);
    assert.ok(bx < cx, `b.x (${bx}) should be < c.x (${cx})`);
  });

  it('produces at least one route', () => {
    const layout = layoutMetro(linear3);
    assert.ok(layout.routes.length >= 1);
  });

  it('produces route path segments', () => {
    const layout = layoutMetro(linear3);
    assert.ok(layout.routePaths.length >= 1);
    const segments = layout.routePaths[0];
    assert.ok(segments.length >= 1);
    assert.ok(segments[0].d.startsWith('M'));
    assert.ok(typeof segments[0].color === 'string');
    assert.ok(typeof segments[0].thickness === 'number');
    assert.ok(typeof segments[0].opacity === 'number');
  });

  it('handles diamond fork-join', () => {
    const layout = layoutMetro(diamond);
    assert.equal(layout.positions.size, 4);
    // Source should be leftmost
    const sx = layout.positions.get('s').x;
    const jx = layout.positions.get('j').x;
    assert.ok(sx < jx);
  });

  it('respects scale option', () => {
    const layout1 = layoutMetro(linear3, { scale: 1 });
    const layout2 = layoutMetro(linear3, { scale: 3 });
    // Larger scale → larger dimensions
    assert.ok(layout2.width > layout1.width);
    assert.ok(layout2.height > layout1.height);
  });

  it('applies theme option', () => {
    const layout = layoutMetro(linear3, { theme: 'dark' });
    assert.equal(layout.theme.paper, '#1E1E2E');
  });

  it('supports TTB direction', () => {
    const layout = layoutMetro(linear3, { direction: 'ttb' });
    // In TTB, Y should increase monotonically for a linear chain
    const ay = layout.positions.get('a').y;
    const by = layout.positions.get('b').y;
    const cy = layout.positions.get('c').y;
    assert.ok(ay < by, `a.y (${ay}) should be < b.y (${by})`);
    assert.ok(by < cy, `b.y (${by}) should be < c.y (${cy})`);
  });

  it('detects extra edges (cross-route connections)', () => {
    const layout = layoutMetro(diamond);
    // Diamond has 4 edges but the trunk route covers at most 3
    // So there should be at least one extra edge
    const totalRouteEdges = layout.routePaths.reduce((sum, segs) => sum + segs.length, 0);
    const totalEdges = diamond.edges.length;
    if (totalRouteEdges < totalEdges) {
      assert.ok(layout.extraEdges.length > 0);
    }
  });

  it('supports consumer-provided routes', () => {
    const routes = [
      { nodes: ['s', 'l', 'j'], cls: 'pure' },
      { nodes: ['s', 'r', 'j'], cls: 'recordable' },
    ];
    const layout = layoutMetro(diamond, { routes });
    assert.equal(layout.routes.length, 2);
    assert.equal(layout.routePaths.length, 2);
  });

  // ── Edge cases ────────────────────────────────────────────

  it('handles single node (no edges)', () => {
    const dag = { nodes: [{ id: 'x', label: 'X', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    assert.equal(layout.positions.size, 1);
    assert.ok(layout.positions.has('x'));
    assert.ok(layout.width > 0);
    assert.ok(layout.height > 0);
  });

  it('handles two disconnected nodes', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }, { id: 'b', label: 'B', cls: 'pure' }],
      edges: [],
    };
    const layout = layoutMetro(dag);
    assert.equal(layout.positions.size, 2);
  });

  it('handles wide fan-out (1→many)', () => {
    const nodes = [{ id: 'root', label: 'Root', cls: 'pure' }];
    const edges = [];
    for (let i = 0; i < 8; i++) {
      nodes.push({ id: `c${i}`, label: `Child ${i}`, cls: 'pure' });
      edges.push(['root', `c${i}`]);
    }
    const layout = layoutMetro({ nodes, edges });
    assert.equal(layout.positions.size, 9);
    // Root should be leftmost
    const rootX = layout.positions.get('root').x;
    for (let i = 0; i < 8; i++) {
      assert.ok(layout.positions.get(`c${i}`).x > rootX);
    }
  });

  it('handles wide fan-in (many→1)', () => {
    const nodes = [{ id: 'sink', label: 'Sink', cls: 'pure' }];
    const edges = [];
    for (let i = 0; i < 6; i++) {
      nodes.push({ id: `p${i}`, label: `Parent ${i}`, cls: 'pure' });
      edges.push([`p${i}`, 'sink']);
    }
    const layout = layoutMetro({ nodes, edges });
    assert.equal(layout.positions.size, 7);
    const sinkX = layout.positions.get('sink').x;
    for (let i = 0; i < 6; i++) {
      assert.ok(layout.positions.get(`p${i}`).x < sinkX);
    }
  });

  it('assigns all nodes to a route', () => {
    const layout = layoutMetro(diamond);
    for (const nd of diamond.nodes) {
      assert.ok(layout.nodeRoute.has(nd.id), `${nd.id} not assigned to a route`);
    }
  });

  it('trunk route is the longest', () => {
    const layout = layoutMetro(diamond);
    const trunk = layout.routes[0];
    for (let i = 1; i < layout.routes.length; i++) {
      assert.ok(trunk.nodes.length >= layout.routes[i].nodes.length,
        `trunk (${trunk.nodes.length}) shorter than route ${i} (${layout.routes[i].nodes.length})`);
    }
  });

  it('all routing modes produce valid output', () => {
    for (const routing of ['bezier', 'angular', 'metro']) {
      const layout = layoutMetro(diamond, { routing });
      assert.ok(layout.routePaths.length >= 1, `${routing} routing failed`);
      for (const segs of layout.routePaths) {
        for (const seg of segs) {
          assert.ok(seg.d.startsWith('M'), `${routing}: path should start with M`);
        }
      }
    }
  });

  it('nodeRoutes tracks multi-route membership', () => {
    const routes = [
      { nodes: ['s', 'l', 'j'], cls: 'pure' },
      { nodes: ['s', 'r', 'j'], cls: 'recordable' },
    ];
    const layout = layoutMetro(diamond, { routes });
    // 's' and 'j' are in both routes
    assert.ok(layout.nodeRoutes.get('s').size === 2);
    assert.ok(layout.nodeRoutes.get('j').size === 2);
    assert.ok(layout.nodeRoutes.get('l').size === 1);
    assert.ok(layout.nodeRoutes.get('r').size === 1);
  });

  it('segment routes tracks shared edges', () => {
    const routes = [
      { nodes: ['s', 'l', 'j'], cls: 'pure' },
      { nodes: ['s', 'r', 'j'], cls: 'recordable' },
    ];
    const layout = layoutMetro(diamond, { routes });
    assert.ok(layout.segmentRoutes instanceof Map);
  });
});
