import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetro } from '../../src/layout-metro.js';
import { renderSVG } from '../../src/render.js';
import { colorScales } from '../../src/color-scales.js';

const linear3 = {
  nodes: [
    { id: 'a', label: 'Alpha', cls: 'pure' },
    { id: 'b', label: 'Beta', cls: 'recordable' },
    { id: 'c', label: 'Gamma', cls: 'pure' },
  ],
  edges: [['a', 'b'], ['b', 'c']],
};

const diamond = {
  nodes: [
    { id: 's', label: 'Start', cls: 'pure' },
    { id: 'x', label: 'Left', cls: 'pure' },
    { id: 'y', label: 'Right', cls: 'pure' },
    { id: 'e', label: 'End', cls: 'pure' },
  ],
  edges: [['s', 'x'], ['s', 'y'], ['x', 'e'], ['y', 'e']],
};

describe('heatmap mode', () => {
  it('accepts a metrics option as a Map', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.2, label: '20%' }],
      ['b', { value: 0.8, label: '80%' }],
      ['c', { value: 0.5, label: '50%' }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    assert.ok(svg.startsWith('<svg'));
  });

  it('colors nodes by metric value instead of class', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.0, label: '0%' }],
      ['b', { value: 1.0, label: '100%' }],
      ['c', { value: 0.5, label: '50%' }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    // Node b (value=1.0) should have a different fill than node a (value=0.0)
    // Both should differ from the class-based colors
    // The SVG should contain data-metric-value attributes for each metriced node
    assert.ok(svg.includes('data-metric-value="0"'), 'node a should have metric value 0');
    assert.ok(svg.includes('data-metric-value="1"'), 'node b should have metric value 1');
    assert.ok(svg.includes('data-metric-value="0.5"'), 'node c should have metric value 0.5');
  });

  it('renders metric labels on nodes', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.2, label: '20%' }],
      ['b', { value: 0.8, label: '80%' }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    assert.ok(svg.includes('20%'), 'metric label for node a');
    assert.ok(svg.includes('80%'), 'metric label for node b');
  });

  it('nodes without metrics keep their class color', () => {
    const layout = layoutMetro(linear3);
    // Only give metrics to node 'a' — b and c should keep class colors
    const metrics = new Map([
      ['a', { value: 0.5, label: '50%' }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    assert.ok(svg.includes('data-metric-value="0.5"'));
    // Nodes b and c should NOT have metric attributes
    assert.ok(!svg.includes('data-node-id="b" data-metric'), 'node b should not have metric');
  });

  it('supports custom color scale', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.0, label: '0%' }],
      ['b', { value: 1.0, label: '100%' }],
    ]);
    // Custom scale: green (0) to red (1)
    const colorScale = (t) => {
      const r = Math.round(255 * t);
      const g = Math.round(255 * (1 - t));
      return `rgb(${r},${g},0)`;
    };
    const svg = renderSVG(linear3, layout, { metrics, colorScale });
    assert.ok(svg.includes('rgb(0,255,0)'), 'node a at value 0 should be green');
    assert.ok(svg.includes('rgb(255,0,0)'), 'node b at value 1 should be red');
  });

  it('uses default green-to-red scale when no colorScale provided', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.0, label: 'low' }],
      ['b', { value: 1.0, label: 'high' }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    // Should not crash and should produce valid SVG
    assert.ok(svg.startsWith('<svg'));
    // The exact default colors are implementation detail, but they should differ
    assert.ok(svg.includes('data-metric-value="0"'));
    assert.ok(svg.includes('data-metric-value="1"'));
  });

  it('works with diamond DAG (all nodes metriced)', () => {
    const layout = layoutMetro(diamond);
    const metrics = new Map([
      ['s', { value: 0.1 }],
      ['x', { value: 0.4 }],
      ['y', { value: 0.9 }],
      ['e', { value: 0.6 }],
    ]);
    const svg = renderSVG(diamond, layout, { metrics });
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('data-metric-value="0.1"'));
    assert.ok(svg.includes('data-metric-value="0.9"'));
  });

  it('metric value without label renders value only', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.75 }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics });
    assert.ok(svg.includes('data-metric-value="0.75"'));
  });

  it('works with heatmap + showLegend false', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([['a', { value: 0.5, label: '50%' }]]);
    const svg = renderSVG(linear3, layout, { metrics, showLegend: false, title: ' ', subtitle: null });
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('50%'));
  });

  it('colors edges by edgeMetrics', () => {
    const layout = layoutMetro(linear3);
    const edgeMetrics = new Map([
      ['a\u2192b', { value: 0.0 }],
      ['b\u2192c', { value: 1.0 }],
    ]);
    const colorScale = (t) => {
      const r = Math.round(255 * t);
      const g = Math.round(255 * (1 - t));
      return `rgb(${r},${g},0)`;
    };
    const svg = renderSVG(linear3, layout, { edgeMetrics, colorScale });
    assert.ok(svg.includes('rgb(0,255,0)'), 'edge a→b at value 0 should be green');
    assert.ok(svg.includes('rgb(255,0,0)'), 'edge b→c at value 1 should be red');
  });

  it('edges without metrics keep route color', () => {
    const layout = layoutMetro(linear3);
    // Only edge a→b gets a metric
    const edgeMetrics = new Map([
      ['a\u2192b', { value: 0.5 }],
    ]);
    const svg = renderSVG(linear3, layout, { edgeMetrics });
    // Should still produce valid SVG with both metriced and non-metriced edges
    assert.ok(svg.startsWith('<svg'));
  });

  it('colorScales exports palette, thermal, mono', () => {
    assert.equal(typeof colorScales.palette, 'function');
    assert.equal(typeof colorScales.thermal, 'function');
    assert.equal(typeof colorScales.mono, 'function');

    // All return rgb() strings
    assert.ok(colorScales.palette(0).startsWith('rgb('));
    assert.ok(colorScales.palette(1).startsWith('rgb('));
    assert.ok(colorScales.thermal(0.5).startsWith('rgb('));
    assert.ok(colorScales.mono(0).startsWith('rgb('));

    // Palette endpoints match cream theme accents
    assert.equal(colorScales.palette(0), 'rgb(43,138,142)');  // teal
    assert.equal(colorScales.palette(1), 'rgb(196,91,74)');   // red
  });

  it('colorScales clamp out-of-range values', () => {
    // Should not crash on values outside 0..1
    assert.ok(colorScales.palette(-0.5).startsWith('rgb('));
    assert.ok(colorScales.palette(1.5).startsWith('rgb('));
    assert.equal(colorScales.palette(-1), colorScales.palette(0));
    assert.equal(colorScales.palette(2), colorScales.palette(1));
  });

  it('combines node metrics and edge metrics', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([
      ['a', { value: 0.2, label: '20%' }],
      ['b', { value: 0.8, label: '80%' }],
    ]);
    const edgeMetrics = new Map([
      ['a\u2192b', { value: 0.5 }],
    ]);
    const svg = renderSVG(linear3, layout, { metrics, edgeMetrics });
    assert.ok(svg.includes('data-metric-value="0.2"'), 'node a metriced');
    assert.ok(svg.includes('data-metric-value="0.8"'), 'node b metriced');
    assert.ok(svg.startsWith('<svg'));
  });
});
