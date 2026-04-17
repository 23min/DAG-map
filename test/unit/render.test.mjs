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

  it('escapes node and edge IDs in data-* attributes', () => {
    const evilId = 'a" onload="alert(1)';
    const dag = {
      nodes: [
        { id: evilId, label: 'A', cls: 'pure" data-pwned="1' },
        { id: 'b', label: 'B', cls: 'pure' },
      ],
      edges: [[evilId, 'b']],
    };
    const layout = layoutMetro(dag, {
      routes: [{ id: 'r', cls: 'pure', nodes: [evilId, 'b'] }],
    });
    const svg = renderSVG(dag, layout);

    assert.ok(svg.includes('data-node-id="a&quot; onload=&quot;alert(1)"'));
    assert.ok(svg.includes('data-node-cls="pure&quot; data-pwned=&quot;1"'));
    assert.ok(svg.includes('data-edge-from="a&quot; onload=&quot;alert(1)"'));
    assert.ok(!svg.includes('data-node-id="a" onload="alert(1)"'));
    assert.ok(!svg.includes('data-edge-from="a" onload="alert(1)"'));
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

  // ── XSS escaping tests ──────────────────────────────────────

  it('escapes & in node labels', () => {
    const dag = { nodes: [{ id: 'x', label: 'A & B', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('A &amp; B'), 'ampersand should be escaped');
    assert.ok(!svg.includes('>A & B<'), 'raw ampersand should not appear in text content');
  });

  it('escapes < and > in node labels', () => {
    const dag = { nodes: [{ id: 'x', label: '<script>alert(1)</script>', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(!svg.includes('<script>'), 'script tag should not appear raw');
    assert.ok(svg.includes('&lt;script&gt;'));
  });

  it('escapes " in node labels', () => {
    const dag = { nodes: [{ id: 'x', label: 'say "hello"', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('&quot;hello&quot;'));
  });

  it('escapes & in title', () => {
    const dag = { nodes: [{ id: 'x', label: 'X', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { title: 'Foo & Bar' });
    assert.ok(svg.includes('Foo &amp; Bar'));
  });

  it('escapes < in subtitle', () => {
    const dag = { nodes: [{ id: 'x', label: 'X', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { subtitle: 'a < b' });
    assert.ok(svg.includes('a &lt; b'));
  });

  it('escapes & in legend labels', () => {
    const dag = { nodes: [{ id: 'x', label: 'X', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { legendLabels: { pure: 'R&D' } });
    assert.ok(svg.includes('R&amp;D'));
  });

  it('escapes entities in diagonal labels mode', () => {
    const dag = { nodes: [{ id: 'a', label: 'A&B', cls: 'pure' }, { id: 'b', label: 'C', cls: 'pure' }], edges: [['a', 'b']] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { diagonalLabels: true });
    assert.ok(svg.includes('A&amp;B'));
  });

  it('renders correctly when layout.theme is missing (fallback)', () => {
    const dag = { nodes: [{ id: 'a', label: 'A', cls: 'pure' }], edges: [] };
    const layout = layoutMetro(dag);
    delete layout.theme; // simulate missing theme
    const svg = renderSVG(dag, layout);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('A'));
  });

  it('escapes entities in TTB label mode', () => {
    const dag = { nodes: [{ id: 'a', label: 'X<Y', cls: 'pure' }, { id: 'b', label: 'B', cls: 'pure' }], edges: [['a', 'b']] };
    const layout = layoutMetro(dag, { direction: 'ttb' });
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('X&lt;Y'));
  });

  // ── CSS classes on text elements ───────────────────────────────

  it('adds dm-title class to title text', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { title: 'My Title' });
    assert.ok(svg.includes('class="dm-title"'));
  });

  it('adds dm-subtitle class to subtitle text', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { subtitle: 'My Sub' });
    assert.ok(svg.includes('class="dm-subtitle"'));
  });

  it('adds dm-label class to node labels', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(svg.includes('class="dm-label"'));
  });

  it('adds dm-legend-text class to legend labels', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { showLegend: true });
    assert.ok(svg.includes('class="dm-legend-text"'));
  });

  it('adds dm-stats class to stats line', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { showLegend: true });
    assert.ok(svg.includes('class="dm-stats"'));
  });

  // ── Font size options ──────────────────────────────────────────

  it('respects titleSize option', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { title: 'T', titleSize: 14 });
    const s = layout.scale || 1;
    assert.ok(svg.includes(`font-size="${14 * s}"`));
  });

  it('respects subtitleSize option', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { subtitle: 'S', subtitleSize: 8 });
    const s = layout.scale || 1;
    assert.ok(svg.includes(`font-size="${8 * s}"`));
  });

  it('respects legendSize option', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { legendSize: 8 });
    const s = layout.scale || 1;
    assert.ok(svg.includes(`font-size="${8 * s}"`));
  });

  // ── cssVars mode: size variables ───────────────────────────────

  it('emits CSS size variables in cssVars mode', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { cssVars: true });
    assert.ok(svg.includes('--dm-title-size:'));
    assert.ok(svg.includes('--dm-label-size:'));
    assert.ok(svg.includes('--dm-legend-size:'));
    assert.ok(svg.includes('--dm-stats-size:'));
  });

  it('uses style= with var() for font-size in cssVars mode', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { cssVars: true, title: 'T' });
    assert.ok(svg.includes('style="font-size: var(--dm-title-size,'));
  });

  it('does not emit CSS variables in inline mode', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { cssVars: false });
    assert.ok(!svg.includes('--dm-title-size'));
  });

  // ── Selected state tests ─────────────────────────────────────

  it('renders selection ring for selected nodes', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { selected: new Set(['b']) });
    assert.ok(svg.includes('dag-map-selected'), 'should have selection class');
    // Count selection rings — only node b should have one
    const matches = svg.match(/dag-map-selected/g);
    assert.strictEqual(matches.length, 1);
  });

  it('renders selection ring for multiple selected nodes', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { selected: new Set(['a', 'c']) });
    const matches = svg.match(/dag-map-selected/g);
    assert.strictEqual(matches.length, 2);
  });

  it('renders no selection ring when selected set is empty', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { selected: new Set() });
    assert.ok(!svg.includes('dag-map-selected'));
  });

  it('renders no selection ring when selected is undefined', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, {});
    assert.ok(!svg.includes('dag-map-selected'));
  });

  it('selection ring composes with heatmap metrics', () => {
    const layout = layoutMetro(linear3);
    const metrics = new Map([['b', { value: 0.8, label: '80%' }]]);
    const svg = renderSVG(linear3, layout, {
      metrics,
      selected: new Set(['b']),
    });
    // Both metric value and selection indicator present
    assert.ok(svg.includes('dag-map-selected'));
    assert.ok(svg.includes('80%'));
    assert.ok(svg.includes('data-metric-value="0.8"'));
  });

  // ── Edge hit area tests ──────────────────────────────────────

  it('does not render edge hit areas when interactive is false (default)', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout);
    assert.ok(!svg.includes('data-edge-hit="true"'), 'should not have edge hit area by default');
    assert.ok(!svg.includes('pointer-events="none"'), 'visible edges should keep default pointer-events');
  });

  it('renders invisible edge hit areas when interactive is true', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { interactive: true });
    assert.ok(svg.includes('data-edge-hit="true"'), 'should have edge hit area');
    assert.ok(svg.includes('pointer-events="stroke"'), 'hit area should capture pointer events');
    assert.ok(svg.includes('stroke="transparent"'), 'hit area should be invisible');
  });

  it('edge hit areas have wider stroke than visible edges', () => {
    const layout = layoutMetro(linear3);
    const svg = renderSVG(linear3, layout, { interactive: true });
    const hitMatch = svg.match(/stroke-width="([^"]+)"[^>]*data-edge-hit="true"/);
    assert.ok(hitMatch, 'should find hit area with stroke-width');
    const hitWidth = parseFloat(hitMatch[1]);
    assert.ok(hitWidth >= 8, `hit area stroke-width ${hitWidth} should be >= 8`);
  });
});
