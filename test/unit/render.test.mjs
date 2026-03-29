import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetro } from '../../src/layout-metro.js';
import { layoutHasse } from '../../src/layout-hasse.js';
import { renderSVG } from '../../src/render.js';

const linear3 = {
  nodes: [
    { id: 'a', label: 'Alpha', cls: 'pure' },
    { id: 'b', label: 'Beta', cls: 'recordable' },
    { id: 'c', label: 'Gamma', cls: 'pure' },
  ],
  edges: [['a', 'b'], ['b', 'c']],
};

describe('renderSVG', () => {
  it('returns a valid SVG string', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  });

  it('includes a viewBox', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.includes('viewBox="'));
  });

  it('renders node labels', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.includes('Alpha'));
    assert.ok(svg.includes('Beta'));
    assert.ok(svg.includes('Gamma'));
  });

  it('renders data-node-id attributes', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.includes('data-node-id="a"'));
    assert.ok(svg.includes('data-node-id="b"'));
    assert.ok(svg.includes('data-node-id="c"'));
  });

  it('renders route paths', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.includes('<path d="M'));
  });

  it('displays custom title', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { title: 'My Graph' });
    assert.ok(svg.includes('My Graph'));
  });

  it('displays custom subtitle', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { subtitle: 'test sub' });
    assert.ok(svg.includes('test sub'));
  });

  it('hides subtitle when set to null', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { subtitle: null });
    // Default subtitle should not appear
    assert.ok(!svg.includes('Topological layout'));
  });

  it('hides legend when showLegend is false', () => {
    const layout = layoutMetro(linear3);
    const svgWith = renderSVG(linear3, layout, { showLegend: true });
    const svgWithout = renderSVG(linear3, layout, { showLegend: false });
    // Legend contains class labels and stats line
    assert.ok(svgWith.includes('routes'));
    assert.ok(!svgWithout.includes(' ops |'));
  });

  it('works with Hasse layout', () => {
    const layout = layoutHasse(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('Alpha'));
  });

  it('respects cssVars mode', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { cssVars: true });
    assert.ok(svg.includes('var(--dm-paper)'));
    assert.ok(svg.includes('var(--dm-ink)'));
  });

  it('supports custom renderNode callback', () => {
    const layout = layoutMetro(linear3);
    const calls = [];
    const renderNode = (node, pos, ctx) => {
      calls.push(node.id);
      return `<rect x="${pos.x}" y="${pos.y}" width="10" height="10"/>`;
    };
    const svg = renderSVG(linear3, layout, { renderNode });
    assert.equal(calls.length, 3);
    assert.ok(svg.includes('<rect'));
  });

  it('supports custom renderEdge callback', () => {
    const layout = layoutMetro(linear3);
    let edgeCalls = 0;
    const renderEdge = (edge, segment, ctx) => {
      edgeCalls++;
      return `<path d="${segment.d}" stroke="red"/>`;
    };
    const svg = renderSVG(linear3, layout, { renderEdge });
    assert.ok(edgeCalls > 0);
    assert.ok(svg.includes('stroke="red"'));
  });

  // XSS-relevant: this test documents CURRENT behavior (no escaping)
  // and should be updated when we add escaping
  it('includes raw label text in SVG (XSS gap — pre-fix baseline)', () => {
    const dag = {
      nodes: [{ id: 'x', label: 'A & B', cls: 'pure' }],
      edges: [],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    // Currently the & is NOT escaped — this test documents that gap
    assert.ok(svg.includes('A & B'), 'raw & should appear (unescaped)');
  });
});
