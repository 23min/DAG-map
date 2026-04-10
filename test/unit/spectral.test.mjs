import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeFiedlerVector } from '../../src/strategies/spectral.js';
import { layoutMetro } from '../../src/layout-metro.js';
import { countCrossings, buildLayers } from '../../src/strategies/crossing-utils.js';
import { buildGraph, topoSortAndRank } from '../../src/graph-utils.js';
import { models } from '../models.js';

const PATH = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
  edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']],
};

const DIAMOND = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
};

describe('Fiedler vector', () => {
  it('returns a vector with one entry per node', () => {
    const result = computeFiedlerVector(PATH.nodes, PATH.edges);
    assert.ok(result);
    assert.equal(result.vector.size, 5);
  });

  it('Fiedler vector of a path graph is monotonic', () => {
    const result = computeFiedlerVector(PATH.nodes, PATH.edges);
    assert.ok(result);
    const vals = PATH.nodes.map(n => result.vector.get(n.id));
    // Should be monotonically increasing or decreasing
    let increasing = true, decreasing = true;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] <= vals[i - 1]) increasing = false;
      if (vals[i] >= vals[i - 1]) decreasing = false;
    }
    assert.ok(increasing || decreasing,
      `Fiedler vector of path should be monotonic, got: ${vals.map(v => v.toFixed(3))}`);
  });

  it('is deterministic — same input produces same output', () => {
    const a = computeFiedlerVector(DIAMOND.nodes, DIAMOND.edges);
    const b = computeFiedlerVector(DIAMOND.nodes, DIAMOND.edges);
    for (const id of DIAMOND.nodes.map(n => n.id)) {
      assert.equal(a.vector.get(id), b.vector.get(id));
    }
  });

  it('returns null for single node', () => {
    assert.equal(computeFiedlerVector([{ id: 'x' }], []), null);
  });

  it('eigenvalue is positive (algebraic connectivity)', () => {
    const result = computeFiedlerVector(DIAMOND.nodes, DIAMOND.edges);
    assert.ok(result.eigenvalue > 0, `eigenvalue should be positive, got ${result.eigenvalue}`);
  });
});

describe('spectral ordering strategy', () => {
  it('produces valid layout via layoutMetro', () => {
    const layout = layoutMetro(DIAMOND, {
      strategies: { orderNodes: 'spectral' },
    });
    assert.equal(layout.positions.size, 4);
    assert.ok(layout.width > 0);
  });

  it('is deterministic', () => {
    const opts = { strategies: { orderNodes: 'spectral' } };
    const a = layoutMetro(DIAMOND, opts);
    const b = layoutMetro(DIAMOND, opts);
    for (const [id, posA] of a.positions) {
      const posB = b.positions.get(id);
      assert.equal(posA.x, posB.x);
      assert.equal(posA.y, posB.y);
    }
  });

  it('works on complex Tier A fixtures', () => {
    const model = models.find(m => m.dag.nodes.length > 10) || models[0];
    const opts = { ...(model.opts || {}), theme: model.theme,
      strategies: { orderNodes: 'spectral' } };
    if (model.routes) opts.routes = model.routes;
    const layout = layoutMetro(model.dag, opts);
    assert.ok(layout.positions.size > 0);
  });

  it('never increases crossings compared to no ordering on Tier A fixtures', () => {
    for (const model of models) {
      const { childrenOf, parentsOf } = buildGraph(model.dag.nodes, model.dag.edges);
      const { rank, maxRank } = topoSortAndRank(model.dag.nodes, childrenOf, parentsOf);

      const layersNone = buildLayers(model.dag.nodes.map(n => n.id), rank, maxRank);
      const crossNone = countCrossings(layersNone, childrenOf);

      const result = computeFiedlerVector(model.dag.nodes, model.dag.edges);
      if (!result) continue;
      const layersSpectral = buildLayers(model.dag.nodes.map(n => n.id), rank, maxRank);
      for (const layer of layersSpectral) {
        layer.sort((a, b) => (result.vector.get(a) ?? 0) - (result.vector.get(b) ?? 0));
      }
      const crossSpectral = countCrossings(layersSpectral, childrenOf);

      assert.ok(crossSpectral <= crossNone,
        `spectral should not increase crossings on "${model.id}": ${crossSpectral} > ${crossNone}`);
    }
  });
});
