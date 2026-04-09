import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { layoutMetro } from '../../src/layout-metro.js';
import { models } from '../models.js';

describe('pipeline equivalence', () => {
  // Verify the refactored pipeline produces deterministic, stable output.
  // This test locks in the current behavior so strategy additions
  // (M-EVOLVE-02/03) can prove they don't break defaults.

  for (const model of models) {
    test(`layoutMetro is deterministic for fixture "${model.id}"`, () => {
      const opts = { ...(model.opts || {}), theme: model.theme };
      if (model.routes) opts.routes = model.routes;

      const a = layoutMetro(model.dag, opts);
      const b = layoutMetro(model.dag, opts);

      // Positions must be identical
      for (const [id, posA] of a.positions) {
        const posB = b.positions.get(id);
        assert.ok(posB, `position missing for ${id}`);
        assert.equal(posA.x, posB.x, `x mismatch for ${id}`);
        assert.equal(posA.y, posB.y, `y mismatch for ${id}`);
      }

      // Route paths must be byte-identical
      assert.equal(a.routePaths.length, b.routePaths.length);
      for (let ri = 0; ri < a.routePaths.length; ri++) {
        assert.equal(a.routePaths[ri].length, b.routePaths[ri].length, `route ${ri} segment count`);
        for (let si = 0; si < a.routePaths[ri].length; si++) {
          assert.equal(a.routePaths[ri][si].d, b.routePaths[ri][si].d, `route ${ri} seg ${si} path`);
        }
      }

      // Extra edges must be identical
      assert.equal(a.extraEdges.length, b.extraEdges.length);
      for (let i = 0; i < a.extraEdges.length; i++) {
        assert.equal(a.extraEdges[i].d, b.extraEdges[i].d, `extra edge ${i} path`);
      }

      // Dimensions
      assert.equal(a.width, b.width);
      assert.equal(a.height, b.height);
    });
  }

  test('default strategies produce same output as no strategies option', () => {
    const model = models[0];
    const opts = { ...(model.opts || {}), theme: model.theme };
    if (model.routes) opts.routes = model.routes;

    const withoutStrategies = layoutMetro(model.dag, opts);
    const withStrategies = layoutMetro(model.dag, {
      ...opts,
      strategies: {
        extractRoutes: 'default',
        orderNodes: 'none',
        reduceCrossings: 'none',
        assignLanes: 'default',
        refineCoordinates: 'none',
      },
    });

    for (const [id, posA] of withoutStrategies.positions) {
      const posB = withStrategies.positions.get(id);
      assert.equal(posA.x, posB.x, `x mismatch for ${id}`);
      assert.equal(posA.y, posB.y, `y mismatch for ${id}`);
    }

    assert.equal(withoutStrategies.width, withStrategies.width);
    assert.equal(withoutStrategies.height, withStrategies.height);
  });
});
