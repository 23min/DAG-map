import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('index.js barrel exports', () => {
  it('can be imported without syntax errors', async () => {
    const mod = await import('../../src/index.js');
    assert.ok(mod);
  });

  it('exports dagMap convenience function', async () => {
    const { dagMap } = await import('../../src/index.js');
    assert.equal(typeof dagMap, 'function');
  });

  it('dagMap returns { layout, svg }', async () => {
    const { dagMap } = await import('../../src/index.js');
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }, { id: 'b', label: 'B', cls: 'pure' }],
      edges: [['a', 'b']],
    };
    const result = dagMap(dag);
    assert.ok(result.layout);
    assert.ok(typeof result.svg === 'string');
    assert.ok(result.svg.startsWith('<svg'));
  });

  it('exports layoutMetro', async () => {
    const { layoutMetro } = await import('../../src/index.js');
    assert.equal(typeof layoutMetro, 'function');
  });

  it('exports layoutHasse', async () => {
    const { layoutHasse } = await import('../../src/index.js');
    assert.equal(typeof layoutHasse, 'function');
  });

  it('exports layoutFlow', async () => {
    const { layoutFlow } = await import('../../src/index.js');
    assert.equal(typeof layoutFlow, 'function');
  });

  it('exports renderSVG', async () => {
    const { renderSVG } = await import('../../src/index.js');
    assert.equal(typeof renderSVG, 'function');
  });

  it('exports routing functions', async () => {
    const { bezierPath, angularPath, progressiveCurve, metroPath } = await import('../../src/index.js');
    assert.equal(typeof bezierPath, 'function');
    assert.equal(typeof angularPath, 'function');
    assert.equal(typeof progressiveCurve, 'function');
    assert.equal(typeof metroPath, 'function');
  });

  it('exports theme utilities', async () => {
    const { THEMES, resolveTheme } = await import('../../src/index.js');
    assert.ok(THEMES);
    assert.equal(typeof resolveTheme, 'function');
  });

  it('exports flow station renderers', async () => {
    const { createStationRenderer, createEdgeRenderer } = await import('../../src/index.js');
    assert.equal(typeof createStationRenderer, 'function');
    assert.equal(typeof createEdgeRenderer, 'function');
  });
});
