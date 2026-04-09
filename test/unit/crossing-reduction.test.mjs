import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutMetro } from '../../src/layout-metro.js';
import {
  buildLayers, countCrossings, barycenterSort, medianSort,
} from '../../src/strategies/crossing-utils.js';
import { models } from '../models.js';

// A fixture with known crossings: diamond shape a→b, a→c, b→d, c→d
// With naive ordering [b, c] in layer 1, edges cross if b is above c
// but a→c goes down-then-up.
const DIAMOND = {
  nodes: [
    { id: 'a', label: 'a' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'c' },
    { id: 'd', label: 'd' },
  ],
  edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
};

// A fixture with definite crossings: a→d, b→c in layer 0→1
const CROSSING_PAIR = {
  nodes: [
    { id: 'a', label: 'a' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'c' },
    { id: 'd', label: 'd' },
  ],
  edges: [['a', 'd'], ['b', 'c']],
};

describe('crossing-utils', () => {
  test('buildLayers partitions nodes by rank', () => {
    const rank = new Map([['a', 0], ['b', 1], ['c', 1], ['d', 2]]);
    const layers = buildLayers(['a', 'b', 'c', 'd'], rank, 2);
    assert.deepStrictEqual(layers[0], ['a']);
    assert.equal(layers[1].length, 2);
    assert.deepStrictEqual(layers[2], ['d']);
  });

  test('countCrossings returns 0 for no crossings', () => {
    const childrenOf = new Map([
      ['a', ['b']], ['b', ['d']], ['c', ['d']], ['d', []],
    ]);
    // a→b, c→d in layers [a], [b,c], [d] — no crossings
    const layers = [['a'], ['b', 'c'], ['d']];
    assert.equal(countCrossings(layers, childrenOf), 0);
  });

  test('countCrossings detects crossings', () => {
    // a→d, b→c with order [a,b] and [c,d] — edges cross
    const childrenOf = new Map([
      ['a', ['d']], ['b', ['c']], ['c', []], ['d', []],
    ]);
    const layers = [['a', 'b'], ['c', 'd']];
    assert.ok(countCrossings(layers, childrenOf) > 0);
  });

  test('countCrossings returns 0 after reordering', () => {
    const childrenOf = new Map([
      ['a', ['d']], ['b', ['c']], ['c', []], ['d', []],
    ]);
    // Reorder: [b,a] and [c,d] — no crossings
    const layers = [['b', 'a'], ['c', 'd']];
    assert.equal(countCrossings(layers, childrenOf), 0);
  });

  test('barycenterSort sorts by mean neighbor position', () => {
    const sorted = barycenterSort(['x', 'y', 'z'], (id) => {
      if (id === 'x') return [2];
      if (id === 'y') return [0];
      if (id === 'z') return [1];
      return [];
    });
    assert.deepStrictEqual(sorted, ['y', 'z', 'x']);
  });

  test('medianSort sorts by median neighbor position', () => {
    const sorted = medianSort(['x', 'y', 'z'], (id) => {
      if (id === 'x') return [0, 10]; // median 5
      if (id === 'y') return [1];     // median 1
      if (id === 'z') return [2, 3];  // median 2.5
      return [];
    });
    assert.deepStrictEqual(sorted, ['y', 'z', 'x']);
  });
});

describe('crossing reduction strategies via layoutMetro', () => {
  test('barycenter crossing reduction produces valid layout', () => {
    const layout = layoutMetro(DIAMOND, {
      strategies: { reduceCrossings: 'barycenter' },
      strategyConfig: { crossingPasses: 10 },
    });
    assert.ok(layout.positions.size === 4);
    assert.ok(layout.width > 0);
    assert.ok(layout.height > 0);
  });

  test('greedy crossing reduction produces valid layout', () => {
    const layout = layoutMetro(DIAMOND, {
      strategies: { reduceCrossings: 'greedy' },
      strategyConfig: { crossingPasses: 10 },
    });
    assert.ok(layout.positions.size === 4);
    assert.ok(layout.width > 0);
  });

  test('barycenter node ordering produces valid layout', () => {
    const layout = layoutMetro(DIAMOND, {
      strategies: { orderNodes: 'barycenter' },
    });
    assert.ok(layout.positions.size === 4);
  });

  test('median node ordering produces valid layout', () => {
    const layout = layoutMetro(DIAMOND, {
      strategies: { orderNodes: 'median' },
    });
    assert.ok(layout.positions.size === 4);
  });

  test('strategies are deterministic', () => {
    const opts = {
      strategies: { reduceCrossings: 'barycenter', orderNodes: 'barycenter' },
      strategyConfig: { crossingPasses: 10 },
    };
    const a = layoutMetro(DIAMOND, opts);
    const b = layoutMetro(DIAMOND, opts);

    for (const [id, posA] of a.positions) {
      const posB = b.positions.get(id);
      assert.equal(posA.x, posB.x, `x mismatch for ${id}`);
      assert.equal(posA.y, posB.y, `y mismatch for ${id}`);
    }
  });

  test('strategies work on complex fixtures (Tier A)', () => {
    // Run on a complex fixture to verify no crashes
    const model = models.find(m => m.dag.nodes.length > 10) || models[models.length - 1];
    const opts = {
      ...(model.opts || {}),
      theme: model.theme,
      strategies: { reduceCrossings: 'barycenter', orderNodes: 'median' },
      strategyConfig: { crossingPasses: 8 },
    };
    if (model.routes) opts.routes = model.routes;

    const layout = layoutMetro(model.dag, opts);
    assert.ok(layout.positions.size > 0);
    assert.ok(layout.routePaths.length > 0);
  });

  test('all strategy combinations work on diamond fixture', () => {
    const orderings = ['none', 'barycenter', 'median'];
    const reductions = ['none', 'barycenter', 'greedy'];

    for (const orderNodes of orderings) {
      for (const reduceCrossings of reductions) {
        const layout = layoutMetro(DIAMOND, {
          strategies: { orderNodes, reduceCrossings },
          strategyConfig: { crossingPasses: 5 },
        });
        assert.ok(
          layout.positions.size === 4,
          `failed for orderNodes=${orderNodes}, reduceCrossings=${reduceCrossings}`,
        );
      }
    }
  });
});
