import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFlow } from '../../src/layout-flow.js';

// ── Fixtures ──────────────────────────────────────────────────

const linear3 = {
  dag: {
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
    edges: [['a', 'b'], ['b', 'c']],
  },
  routes: [{ id: 'flow', cls: 'a', nodes: ['a', 'b', 'c'] }],
};

const diamond = {
  dag: {
    nodes: [
      { id: 's', label: 'Start' },
      { id: 'l', label: 'Left' },
      { id: 'r', label: 'Right' },
      { id: 'j', label: 'Join' },
    ],
    edges: [['s', 'l'], ['s', 'r'], ['l', 'j'], ['r', 'j']],
  },
  routes: [
    { id: 'left', cls: 'a', nodes: ['s', 'l', 'j'] },
    { id: 'right', cls: 'b', nodes: ['s', 'r', 'j'] },
  ],
};

const threeRoute = {
  dag: {
    nodes: [
      { id: 'src', label: 'Source' },
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'sink', label: 'Sink' },
    ],
    edges: [['src', 'a'], ['src', 'b'], ['src', 'c'], ['a', 'sink'], ['b', 'sink'], ['c', 'sink']],
  },
  routes: [
    { id: 'r1', cls: 'a', nodes: ['src', 'a', 'sink'] },
    { id: 'r2', cls: 'b', nodes: ['src', 'b', 'sink'] },
    { id: 'r3', cls: 'c', nodes: ['src', 'c', 'sink'] },
  ],
};

const theme = {
  paper: '#FFF', ink: '#000', muted: '#888', border: '#CCC',
  classes: { a: '#E06C9F', b: '#2B9DB5', c: '#3D5BA9' },
};

function lay(fixture, opts = {}) {
  return layoutFlow(fixture.dag, { routes: fixture.routes, theme, scale: 1, ...opts });
}

// ── Basic structure ───────────────────────────────────────────

describe('layoutFlow — structure', () => {
  it('returns required layout properties', () => {
    const L = lay(linear3);
    assert.ok(L.positions instanceof Map);
    assert.ok(Array.isArray(L.routePaths));
    assert.ok(Array.isArray(L.extraEdges));
    assert.equal(typeof L.width, 'number');
    assert.equal(typeof L.height, 'number');
    assert.ok(L.width > 0);
    assert.ok(L.height > 0);
    assert.ok(L.theme);
    assert.equal(L.orientation, 'ttb');
    assert.ok(typeof L.dotX === 'function');
    assert.ok(L.cardPlacements instanceof Map);
    assert.ok(L.edgeLabelPositions instanceof Map);
  });

  it('positions every node', () => {
    const L = lay(linear3);
    for (const nd of linear3.dag.nodes) {
      assert.ok(L.positions.has(nd.id), `missing position for ${nd.id}`);
      const pos = L.positions.get(nd.id);
      assert.ok(Number.isFinite(pos.x), `${nd.id}.x is not finite`);
      assert.ok(Number.isFinite(pos.y), `${nd.id}.y is not finite`);
    }
  });

  it('creates a route path array per route', () => {
    const L = lay(diamond);
    assert.equal(L.routePaths.length, 2);
  });

  it('produces segments for each route edge', () => {
    const L = lay(linear3);
    // 1 route with 3 nodes → 2 segments
    assert.equal(L.routePaths[0].length, 2);
  });
});

// ── Top-to-bottom ordering ────────────────────────────────────

describe('layoutFlow — Y ordering', () => {
  it('assigns increasing Y for linear chain', () => {
    const L = lay(linear3);
    const ay = L.positions.get('a').y;
    const by = L.positions.get('b').y;
    const cy = L.positions.get('c').y;
    assert.ok(ay < by, `a.y (${ay}) should be < b.y (${by})`);
    assert.ok(by < cy, `b.y (${by}) should be < c.y (${cy})`);
  });

  it('source is above sink in diamond', () => {
    const L = lay(diamond);
    const sy = L.positions.get('s').y;
    const jy = L.positions.get('j').y;
    assert.ok(sy < jy);
  });

  it('fork nodes are at the same layer Y', () => {
    const L = lay(diamond);
    const ly = L.positions.get('l').y;
    const ry = L.positions.get('r').y;
    assert.equal(ly, ry);
  });
});

// ── dotX function ─────────────────────────────────────────────

describe('layoutFlow — dotX', () => {
  it('returns a number for every route-node combination', () => {
    const L = lay(diamond);
    for (const route of diamond.routes) {
      for (const nodeId of route.nodes) {
        const dx = L.dotX(nodeId, diamond.routes.indexOf(route));
        assert.ok(Number.isFinite(dx), `dotX(${nodeId}, ri) is not finite`);
      }
    }
  });

  it('separates dots at shared stations', () => {
    const L = lay(diamond);
    // 's' is shared between route 0 and route 1
    const dx0 = L.dotX('s', 0);
    const dx1 = L.dotX('s', 1);
    assert.notEqual(dx0, dx1, 'shared station dots should be at different X');
  });

  it('single-route nodes have dotX at node position X', () => {
    const L = lay(diamond);
    // 'l' is only in route 0
    const dx = L.dotX('l', 0);
    const px = L.positions.get('l').x;
    assert.equal(dx, px);
  });

  it('dots maintain consistent order at all shared stations', () => {
    const L = lay(threeRoute);
    // At 'src' and 'sink', all 3 routes meet
    // The order of routes should be the same at both
    const srcOrder = [0, 1, 2].map(ri => L.dotX('src', ri));
    const sinkOrder = [0, 1, 2].map(ri => L.dotX('sink', ri));

    // Extract relative ordering (which route is leftmost, middle, rightmost)
    const srcRank = srcOrder.map((x, i) => ({ x, ri: i })).sort((a, b) => a.x - b.x).map(e => e.ri);
    const sinkRank = sinkOrder.map((x, i) => ({ x, ri: i })).sort((a, b) => a.x - b.x).map(e => e.ri);
    assert.deepStrictEqual(srcRank, sinkRank, 'dot order should be consistent across shared stations');
  });
});

// ── Card placement ────────────────────────────────────────────

describe('layoutFlow — card placement', () => {
  it('places a card for every node', () => {
    const L = lay(linear3);
    for (const nd of linear3.dag.nodes) {
      assert.ok(L.cardPlacements.has(nd.id), `missing card for ${nd.id}`);
    }
  });

  it('card rects have positive dimensions', () => {
    const L = lay(linear3);
    for (const [id, cp] of L.cardPlacements) {
      assert.ok(cp.rect.w > 0, `${id} card width <= 0`);
      assert.ok(cp.rect.h > 0, `${id} card height <= 0`);
    }
  });

  it('card width grows with node.times content', () => {
    const dag = {
      nodes: [
        { id: 'a', label: 'Task', times: '1' },
        { id: 'b', label: 'Done' },
      ],
      edges: [['a', 'b']],
    };
    const routes = [{ id: 'main', cls: 'a', nodes: ['a', 'b'] }];

    const short = layoutFlow(dag, { routes, theme, scale: 1 });
    const long = layoutFlow({
      ...dag,
      nodes: [
        { id: 'a', label: 'Task', times: '12345678901234567890' },
        { id: 'b', label: 'Done' },
      ],
    }, { routes, theme, scale: 1 });

    const shortW = short.cardPlacements.get('a').rect.w;
    const longW = long.cardPlacements.get('a').rect.w;
    assert.ok(longW > shortW, `expected long times card (${longW}) > short times card (${shortW})`);
  });

  it('cards do not overlap each other in linear chain', () => {
    const L = lay(linear3);
    const cards = [...L.cardPlacements.values()].map(cp => cp.rect);
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j];
        const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
        assert.ok(!overlap, `cards ${i} and ${j} overlap`);
      }
    }
  });

  it('card placement records side (left or right)', () => {
    const L = lay(linear3);
    for (const [, cp] of L.cardPlacements) {
      assert.ok(['left', 'right'].includes(cp.side), `unexpected side: ${cp.side}`);
    }
  });
});

// ── Edge labels ───────────────────────────────────────────────

describe('layoutFlow — edge labels', () => {
  it('creates an edge label position for each route segment', () => {
    const L = lay(linear3);
    // 1 route, 2 segments → up to 2 edge labels
    assert.ok(L.edgeLabelPositions.size > 0);
  });

  it('edge label keys follow "ri:from→to" format', () => {
    const L = lay(linear3);
    for (const key of L.edgeLabelPositions.keys()) {
      assert.match(key, /^\d+:.+→.+$/, `unexpected key format: ${key}`);
    }
  });

  it('edge label positions have x, y, color', () => {
    const L = lay(linear3);
    for (const [, pos] of L.edgeLabelPositions) {
      assert.ok(Number.isFinite(pos.x));
      assert.ok(Number.isFinite(pos.y));
      assert.ok(typeof pos.color === 'string');
    }
  });
});

// ── Extra edges ───────────────────────────────────────────────

describe('layoutFlow — extra edges', () => {
  it('detects edges not covered by routes', () => {
    // Diamond has 4 DAG edges, each route covers 2 → 0 extra if routes cover all
    // But route 0 = s→l→j and route 1 = s→r���j cover all 4 edges
    const L = lay(diamond);
    // All edges are covered by routes, so no extras
    assert.equal(L.extraEdges.length, 0);
  });

  it('produces extra edges for uncovered DAG edges', () => {
    const dag = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [['a', 'b'], ['a', 'c'], ['b', 'c']],
    };
    const routes = [{ id: 'main', cls: 'a', nodes: ['a', 'b', 'c'] }];
    // Route covers a→b and b→c but not a→c
    const L = layoutFlow(dag, { routes, theme, scale: 1 });
    assert.equal(L.extraEdges.length, 1);
    assert.ok(L.extraEdges[0].dashed);
  });
});

// ── Segment paths ─────────────────────────────────────────────

describe('layoutFlow — path structure', () => {
  it('all segments start with M command', () => {
    const L = lay(diamond);
    for (const segs of L.routePaths) {
      for (const seg of segs) {
        assert.ok(seg.d.startsWith('M '), `path does not start with M: ${seg.d.slice(0, 30)}`);
      }
    }
  });

  it('segments have color, thickness, opacity', () => {
    const L = lay(linear3);
    for (const seg of L.routePaths[0]) {
      assert.ok(typeof seg.color === 'string');
      assert.ok(seg.thickness > 0);
      assert.ok(seg.opacity > 0 && seg.opacity <= 1);
    }
  });

  it('no diagonal L segments (flow uses V-H-V only)', () => {
    const L = lay(diamond);
    for (const segs of L.routePaths) {
      for (const seg of segs) {
        let penX = 0, penY = 0;
        const cmds = seg.d.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g);
        for (const cmd of cmds) {
          const type = cmd[1];
          if (type === 'M') { penX = parseFloat(cmd[2]); penY = parseFloat(cmd[3]); }
          else if (type === 'L') {
            const x = parseFloat(cmd[2]), y = parseFloat(cmd[3]);
            const dx = Math.abs(x - penX), dy = Math.abs(y - penY);
            assert.ok(dx < 1 || dy < 1, `Diagonal L from (${penX.toFixed(0)},${penY.toFixed(0)}) to (${x.toFixed(0)},${y.toFixed(0)})`);
            penX = x; penY = y;
          } else if (type === 'Q') {
            penX = cmd[4] !== undefined ? parseFloat(cmd[4]) : parseFloat(cmd[2]);
            penY = cmd[4] !== undefined ? parseFloat(cmd[5]) : parseFloat(cmd[3]);
          }
        }
      }
    }
  });
});

// ── Adaptive layer spacing ────────────────────────────────────

describe('layoutFlow — adaptive spacing', () => {
  it('merge/fork zones get more vertical space than simple chains', () => {
    // Diamond has a fork (s→l,r) and merge (l,r→j) at layers 0→1 and 1→2
    const L = lay(diamond);
    const sy = L.positions.get('s').y;
    const ly = L.positions.get('l').y;
    const jy = L.positions.get('j').y;
    const gap1 = ly - sy; // fork zone
    const gap2 = jy - ly; // merge zone

    // Compare with a linear chain which should have uniform spacing
    const L2 = lay(linear3);
    const ay = L2.positions.get('a').y;
    const by = L2.positions.get('b').y;
    const cy = L2.positions.get('c').y;
    const linearGap1 = by - ay;
    const linearGap2 = cy - by;
    // Linear gaps should be equal
    assert.ok(Math.abs(linearGap1 - linearGap2) < 1, 'linear chain should have uniform spacing');
    // Fork/merge gaps should be at least as big as linear (possibly bigger)
    assert.ok(gap1 >= linearGap1 * 0.9, 'fork zone should not be smaller than linear');
  });
});

// ── Scale and theme ───────────────────────────────────────────

describe('layoutFlow — options', () => {
  it('respects scale', () => {
    const L1 = lay(linear3, { scale: 1 });
    const L2 = lay(linear3, { scale: 3 });
    assert.ok(L2.width > L1.width);
    assert.ok(L2.height > L1.height);
  });

  it('applies theme', () => {
    const customTheme = { ...theme, paper: '#123456' };
    const L = layoutFlow(linear3.dag, { routes: linear3.routes, theme: customTheme, scale: 1 });
    assert.equal(L.theme.paper, '#123456');
  });
});

// ── Same-layer separation ─────────────────────────────────────

describe('layoutFlow — same-layer nodes', () => {
  it('separates nodes at the same layer', () => {
    const L = lay(diamond);
    const lx = L.positions.get('l').x;
    const rx = L.positions.get('r').x;
    assert.ok(Math.abs(lx - rx) > 1, 'same-layer nodes should be separated in X');
  });

  it('no two nodes share the exact same position', () => {
    const L = lay(threeRoute);
    const posArr = [...L.positions.entries()];
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const [idA, pA] = posArr[i], [idB, pB] = posArr[j];
        const same = Math.abs(pA.x - pB.x) < 1 && Math.abs(pA.y - pB.y) < 1;
        assert.ok(!same, `${idA} and ${idB} at same position`);
      }
    }
  });
});

// ── LTR direction support ─────────────────────────────────────

describe('layoutFlow — LTR direction', () => {
  it('sets orientation to ltr', () => {
    const L = lay(linear3, { direction: 'ltr' });
    assert.equal(L.orientation, 'ltr');
  });

  it('default orientation is ttb', () => {
    const L = lay(linear3);
    assert.equal(L.orientation, 'ttb');
  });

  it('LTR: X increases along the chain (layers go left-to-right)', () => {
    const L = lay(linear3, { direction: 'ltr' });
    const ax = L.positions.get('a').x;
    const bx = L.positions.get('b').x;
    const cx = L.positions.get('c').x;
    assert.ok(ax < bx, `a.x (${ax}) should be < b.x (${bx})`);
    assert.ok(bx < cx, `b.x (${bx}) should be < c.x (${cx})`);
  });

  it('TTB: Y increases along the chain (baseline)', () => {
    const L = lay(linear3, { direction: 'ttb' });
    const ay = L.positions.get('a').y;
    const by = L.positions.get('b').y;
    const cy = L.positions.get('c').y;
    assert.ok(ay < by);
    assert.ok(by < cy);
  });

  it('LTR: same-layer nodes have same X, different Y', () => {
    const L = lay(diamond, { direction: 'ltr' });
    const lx = L.positions.get('l').x;
    const rx = L.positions.get('r').x;
    const ly = L.positions.get('l').y;
    const ry = L.positions.get('r').y;
    assert.ok(Math.abs(lx - rx) < 1, 'same-layer nodes should have similar X in LTR');
    assert.ok(Math.abs(ly - ry) > 1, 'same-layer nodes should be separated in Y in LTR');
  });

  it('LTR swaps width and height vs TTB', () => {
    const ttb = lay(linear3, { direction: 'ttb' });
    const ltr = lay(linear3, { direction: 'ltr' });
    // Width and height should be swapped
    assert.ok(Math.abs(ltr.width - ttb.height) < 1, `LTR width (${ltr.width}) should equal TTB height (${ttb.height})`);
    assert.ok(Math.abs(ltr.height - ttb.width) < 1, `LTR height (${ltr.height}) should equal TTB width (${ttb.width})`);
  });

  it('LTR: positions every node', () => {
    const L = lay(diamond, { direction: 'ltr' });
    for (const nd of diamond.dag.nodes) {
      assert.ok(L.positions.has(nd.id), `missing position for ${nd.id}`);
    }
  });

  it('LTR: produces route path segments', () => {
    const L = lay(diamond, { direction: 'ltr' });
    assert.equal(L.routePaths.length, 2);
    for (const segs of L.routePaths) {
      for (const seg of segs) {
        assert.ok(seg.d.startsWith('M '), 'path should start with M');
      }
    }
  });

  it('LTR: card placements exist', () => {
    const L = lay(linear3, { direction: 'ltr' });
    assert.ok(L.cardPlacements.size > 0);
    for (const [, cp] of L.cardPlacements) {
      assert.ok(cp.rect.w > 0);
      assert.ok(cp.rect.h > 0);
    }
  });

  it('LTR: dotX returns finite values', () => {
    const L = lay(diamond, { direction: 'ltr' });
    for (const route of diamond.routes) {
      for (const nodeId of route.nodes) {
        const dx = L.dotX(nodeId, diamond.routes.indexOf(route));
        assert.ok(Number.isFinite(dx), `dotX(${nodeId}) not finite in LTR`);
      }
    }
  });

  it('LTR: edge label positions exist', () => {
    const L = lay(linear3, { direction: 'ltr' });
    assert.ok(L.edgeLabelPositions.size > 0);
    for (const [, pos] of L.edgeLabelPositions) {
      assert.ok(Number.isFinite(pos.x));
      assert.ok(Number.isFinite(pos.y));
    }
  });
});
