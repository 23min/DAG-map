import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFlow } from '../../src/layout-flow.js';
import { createStationRenderer, createEdgeRenderer } from '../../src/render-flow-station.js';

const theme = {
  paper: '#FFF', ink: '#000', muted: '#888', border: '#CCC',
  classes: { a: '#E06C9F', b: '#2B9DB5' },
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

function makeLayout() {
  return layoutFlow(diamond.dag, { routes: diamond.routes, theme, scale: 1 });
}

describe('createStationRenderer', () => {
  it('returns a function', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    assert.equal(typeof renderNode, 'function');
  });

  it('produces SVG string with circles (station dots)', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'Start' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('<circle'), 'should have station dot circles');
  });

  it('renders card rect when card placement exists', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    // Find a node that has a card placement
    const nodeId = [...layout.cardPlacements.keys()][0];
    const node = diamond.dag.nodes.find(n => n.id === nodeId);
    const pos = layout.positions.get(nodeId);
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('<rect'), 'should have card rect');
  });

  it('renders label text in card', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'Start' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('Start'), 'should include node label text');
  });

  it('renders route color indicators in card', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    // 's' is in both routes
    const node = { id: 's', label: 'Start' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    // Should have colored indicator rects
    assert.ok(svg.includes(theme.classes.a) || svg.includes(theme.classes.b),
      'should have route color indicators');
  });

  it('renders punched-out dots (inner white circle)', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'Start' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    // Punched-out = outer colored circle + inner paper-colored circle
    assert.ok(svg.includes(`fill="${theme.paper}"`), 'should have punched-out inner circle');
  });
});

describe('createEdgeRenderer', () => {
  it('returns a function', () => {
    const layout = makeLayout();
    const renderEdge = createEdgeRenderer(layout, null);
    assert.equal(typeof renderEdge, 'function');
  });

  it('produces path SVG from segment', () => {
    const layout = makeLayout();
    const renderEdge = createEdgeRenderer(layout, null);
    const segment = layout.routePaths[0][0];
    const ctx = { scale: 1, theme, isExtraEdge: false, routeIndex: 0, segmentIndex: 0 };
    const edge = { from: diamond.routes[0].nodes[0], to: diamond.routes[0].nodes[1] };
    const svg = renderEdge(edge, segment, ctx);
    assert.ok(svg.includes('<path'), 'should render path element');
    assert.ok(svg.includes('stroke='), 'should have stroke');
  });

  it('renders volume badge when edgeVolumes provided', () => {
    const layout = makeLayout();
    const route = diamond.routes[0];
    const fromId = route.nodes[0], toId = route.nodes[1];
    const edgeKey = `0:${fromId}→${toId}`;
    const edgeVolumes = new Map([[edgeKey, '42K']]);
    const renderEdge = createEdgeRenderer(layout, edgeVolumes);

    const segment = layout.routePaths[0][0];
    const ctx = { scale: 1, theme, isExtraEdge: false, routeIndex: 0, segmentIndex: 0 };
    const edge = { from: fromId, to: toId };
    const svg = renderEdge(edge, segment, ctx);
    assert.ok(svg.includes('42K'), 'should render volume label');
  });

  it('does not render volume badge for extra edges', () => {
    const layout = makeLayout();
    const edgeVolumes = new Map([['0:s→l', 'VOL_MARKER']]);
    const renderEdge = createEdgeRenderer(layout, edgeVolumes);
    const segment = { d: 'M 0 0 L 50 50', color: '#888', thickness: 2, opacity: 0.3, dashed: true };
    const ctx = { scale: 1, theme, isExtraEdge: true, index: 0 };
    const svg = renderEdge(null, segment, ctx);
    assert.ok(!svg.includes('VOL_MARKER'), 'extra edges should not get volume badges');
  });

  it('renders dashed path when segment.dashed is true', () => {
    const layout = makeLayout();
    const renderEdge = createEdgeRenderer(layout, null);
    const segment = { d: 'M 0 0 L 100 100', color: '#888', thickness: 2, opacity: 0.5, dashed: true };
    const ctx = { scale: 1, theme, isExtraEdge: false, routeIndex: 0, segmentIndex: 0 };
    const svg = renderEdge({ from: 's', to: 'l' }, segment, ctx);
    assert.ok(svg.includes('stroke-dasharray'), 'dashed segment should have dasharray');
  });
});

// ── XSS escaping in flow station renderers ────────────────────

describe('flow station XSS escaping', () => {
  it('escapes & in station card label', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'A & B' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('A &amp; B'), 'ampersand in label should be escaped');
    assert.ok(!svg.includes('>A & B<'), 'raw ampersand should not appear');
  });

  it('escapes < in station card label', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'x<y' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('x&lt;y'));
  });

  it('escapes & in node.count', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'Test', count: '1&2' };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('1&amp;2'));
  });

  it('renders numeric zero in node.count', () => {
    const layout = makeLayout();
    const renderNode = createStationRenderer(layout, diamond.routes);
    const node = { id: 's', label: 'Test', count: 0 };
    const pos = layout.positions.get('s');
    const ctx = { scale: 1, theme };
    const svg = renderNode(node, pos, ctx);
    assert.ok(svg.includes('>0<'));
  });

  it('escapes & in edge volume badge', () => {
    const layout = makeLayout();
    const route = diamond.routes[0];
    const fromId = route.nodes[0], toId = route.nodes[1];
    const edgeKey = `0:${fromId}\u2192${toId}`;
    const edgeVolumes = new Map([[edgeKey, 'A&B']]);
    const renderEdge = createEdgeRenderer(layout, edgeVolumes);
    const segment = layout.routePaths[0][0];
    const ctx = { scale: 1, theme, isExtraEdge: false, routeIndex: 0, segmentIndex: 0 };
    const svg = renderEdge({ from: fromId, to: toId }, segment, ctx);
    assert.ok(svg.includes('A&amp;B'));
  });
});
