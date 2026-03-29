import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetro } from '../../src/layout-metro.js';
import { layoutHasse } from '../../src/layout-hasse.js';
import { layoutFlow } from '../../src/layout-flow.js';
import { renderSVG } from '../../src/render.js';
import { bezierPath } from '../../src/route-bezier.js';
import { angularPath } from '../../src/route-angular.js';
import { metroPath } from '../../src/route-metro.js';
import { OccupancyGrid } from '../../src/occupancy.js';

const theme = {
  paper: '#FFF', ink: '#000', muted: '#888', border: '#CCC',
  classes: { pure: '#2B8A8E', a: '#E06C9F', b: '#2B9DB5' },
};

// ── Empty and minimal DAGs ────────────────────────────────────

describe('empty and minimal DAGs', () => {
  it('layoutMetro handles empty nodes array', () => {
    const dag = { nodes: [], edges: [] };
    // Should not throw
    const layout = layoutMetro(dag);
    assert.equal(layout.positions.size, 0);
  });

  it('layoutHasse handles empty nodes array', () => {
    const dag = { nodes: [], edges: [] };
    const layout = layoutHasse(dag);
    assert.equal(layout.positions.size, 0);
  });

  it('layoutFlow throws a clear error on empty routes', () => {
    const dag = { nodes: [], edges: [] };
    assert.throws(
      () => layoutFlow(dag, { routes: [], theme, scale: 1 }),
      /layoutflow.*routes/i,
    );
  });

  it('renderSVG handles layout with no nodes', () => {
    const dag = { nodes: [], edges: [] };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('layoutMetro handles two nodes, no edges', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }, { id: 'b', label: 'B', cls: 'pure' }],
      edges: [],
    };
    const layout = layoutMetro(dag);
    assert.equal(layout.positions.size, 2);
  });

  it('layoutHasse handles two nodes, no edges', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [],
    };
    const layout = layoutHasse(dag);
    assert.equal(layout.positions.size, 2);
  });
});

describe('input validation', () => {
  it('layoutMetro throws a clear error for unknown edge endpoints', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }],
      edges: [['a', 'missing']],
    };
    assert.throws(
      () => layoutMetro(dag),
      /invalid dag|known node|missing/i,
    );
  });

  it('layoutHasse throws a clear error for cycles', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [['a', 'b'], ['b', 'a']],
    };
    assert.throws(
      () => layoutHasse(dag),
      /invalid dag|cycle/i,
    );
  });

  it('layoutFlow throws a clear error for cycles', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [['a', 'b'], ['b', 'a']],
    };
    const routes = [{ id: 'r', cls: 'a', nodes: ['a', 'b'] }];
    assert.throws(
      () => layoutFlow(dag, { routes, theme, scale: 1 }),
      /invalid dag|cycle/i,
    );
  });
});

// ── Large graphs ──────────────────────────────────────────────

describe('larger graphs', () => {
  it('layoutMetro handles 20-node chain', () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 20; i++) {
      nodes.push({ id: `n${i}`, label: `Node ${i}`, cls: 'pure' });
      if (i > 0) edges.push([`n${i - 1}`, `n${i}`]);
    }
    const layout = layoutMetro({ nodes, edges });
    assert.equal(layout.positions.size, 20);
  });

  it('layoutMetro handles 15-node wide fan-out', () => {
    const nodes = [{ id: 'root', label: 'R', cls: 'pure' }];
    const edges = [];
    for (let i = 0; i < 15; i++) {
      nodes.push({ id: `c${i}`, label: `C${i}`, cls: 'pure' });
      edges.push(['root', `c${i}`]);
    }
    const layout = layoutMetro({ nodes, edges });
    assert.equal(layout.positions.size, 16);
  });

  it('layoutHasse handles 20-node lattice', () => {
    // 4 ranks: 1 top, 6 rank-1, 6 rank-2, 1 bottom, plus 6 connectors
    const nodes = [{ id: 'top', label: 'T' }];
    const edges = [];
    for (let i = 0; i < 6; i++) {
      nodes.push({ id: `r1_${i}`, label: `R1_${i}` });
      edges.push(['top', `r1_${i}`]);
    }
    for (let i = 0; i < 6; i++) {
      nodes.push({ id: `r2_${i}`, label: `R2_${i}` });
      edges.push([`r1_${i}`, `r2_${i}`]);
    }
    nodes.push({ id: 'bot', label: 'B' });
    for (let i = 0; i < 6; i++) {
      edges.push([`r2_${i}`, 'bot']);
    }
    const layout = layoutHasse({ nodes, edges });
    assert.equal(layout.positions.size, 14);
  });
});

// ── Router boundary conditions ────────────────────────────────

describe('router boundary conditions', () => {
  it('bezierPath handles negative dx (right-to-left)', () => {
    const d = bezierPath(200, 100, 50, 200, 0, 0, 100);
    const nums = d.match(/-?[\d.]+/g).map(Number);
    const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
    assert.equal(endX, 50);
    assert.equal(endY, 200);
  });

  it('bezierPath handles zero dx', () => {
    const d = bezierPath(100, 0, 100, 200, 0, 0, 0);
    assert.ok(d.includes('100'));
  });

  it('angularPath handles negative dy (upward)', () => {
    const d = angularPath(0, 200, 200, 50, 0, 0, 100);
    const nums = d.match(/-?[\d.]+/g).map(Number);
    assert.equal(nums[nums.length - 2], 200);
    assert.equal(nums[nums.length - 1], 50);
  });

  it('metroPath handles negative dx and dy', () => {
    const d = metroPath(200, 200, 50, 50, 0, 0, 0, { cornerRadius: 8 });
    const nums = d.match(/-?[\d.]+/g).map(Number);
    assert.equal(nums[nums.length - 2], 50);
    assert.equal(nums[nums.length - 1], 50);
  });

  it('all routers handle large displacement', () => {
    for (const fn of [bezierPath, angularPath]) {
      const d = fn(0, 0, 5000, 3000, 0, 0, 0);
      assert.ok(d.length > 5, `${fn.name} should produce path for large displacement`);
    }
    const d = metroPath(0, 0, 5000, 3000, 0, 0, 0, { cornerRadius: 20 });
    assert.ok(d.length > 5);
  });

  it('all routers handle very small displacement', () => {
    for (const fn of [bezierPath, angularPath]) {
      const d = fn(100, 100, 101, 100.5, 0, 0, 100);
      assert.ok(d.length > 0);
    }
    const d = metroPath(100, 100, 101, 100.5, 0, 0, 100, { cornerRadius: 2 });
    assert.ok(d.length > 0);
  });

  it('metroPath L segments are axis-aligned for h-first', () => {
    const d = metroPath(0, 0, 200, 100, 0, 0, 0, { cornerRadius: 10, bendStyle: 'h-first' });
    const full = `M 0 0 ${d}`;
    let penX = 0, penY = 0;
    const cmds = full.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g);
    for (const cmd of cmds) {
      if (cmd[1] === 'M') { penX = parseFloat(cmd[2]); penY = parseFloat(cmd[3]); }
      else if (cmd[1] === 'L') {
        const x = parseFloat(cmd[2]), y = parseFloat(cmd[3]);
        const dx = Math.abs(x - penX), dy = Math.abs(y - penY);
        assert.ok(dx < 0.1 || dy < 0.1, `Diagonal L: (${penX},${penY}) to (${x},${y})`);
        penX = x; penY = y;
      } else if (cmd[1] === 'Q') {
        penX = cmd[4] !== undefined ? parseFloat(cmd[4]) : parseFloat(cmd[2]);
        penY = cmd[4] !== undefined ? parseFloat(cmd[5]) : parseFloat(cmd[3]);
      }
    }
  });

  it('metroPath L segments are axis-aligned for v-first', () => {
    const d = metroPath(0, 0, 100, 200, 0, 0, 0, { cornerRadius: 10, bendStyle: 'v-first' });
    const full = `M 0 0 ${d}`;
    let penX = 0, penY = 0;
    const cmds = full.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g);
    for (const cmd of cmds) {
      if (cmd[1] === 'M') { penX = parseFloat(cmd[2]); penY = parseFloat(cmd[3]); }
      else if (cmd[1] === 'L') {
        const x = parseFloat(cmd[2]), y = parseFloat(cmd[3]);
        const dx = Math.abs(x - penX), dy = Math.abs(y - penY);
        assert.ok(dx < 0.1 || dy < 0.1, `Diagonal L: (${penX},${penY}) to (${x},${y})`);
        penX = x; penY = y;
      } else if (cmd[1] === 'Q') {
        penX = cmd[4] !== undefined ? parseFloat(cmd[4]) : parseFloat(cmd[2]);
        penY = cmd[4] !== undefined ? parseFloat(cmd[5]) : parseFloat(cmd[3]);
      }
    }
  });
});

// ── OccupancyGrid edge cases ──────────────────────────────────

describe('OccupancyGrid edge cases', () => {
  it('handles zero-size rects', () => {
    const g = new OccupancyGrid(0);
    g.place({ x: 10, y: 10, w: 0, h: 0 });
    assert.ok(g.canPlace({ x: 10, y: 10, w: 0, h: 0 }));
  });

  it('handles negative coordinates', () => {
    const g = new OccupancyGrid(0);
    g.place({ x: -50, y: -50, w: 20, h: 20 });
    assert.equal(g.canPlace({ x: -45, y: -45, w: 10, h: 10 }), false);
    assert.ok(g.canPlace({ x: 0, y: 0, w: 10, h: 10 }));
  });

  it('handles many items without error', () => {
    const g = new OccupancyGrid(1);
    for (let i = 0; i < 200; i++) {
      g.place({ x: i * 20, y: 0, w: 15, h: 15, owner: `item${i}` });
    }
    assert.equal(g.items.length, 200);
    assert.ok(g.canPlace({ x: 5000, y: 0, w: 10, h: 10 }));
  });

  it('placeLine handles vertical line', () => {
    const g = new OccupancyGrid(0);
    g.placeLine(100, 0, 100, 200, 4, 'vline');
    const r = g.items[0];
    assert.equal(r.x, 98); // 100 - 2
    assert.equal(r.w, 4);
    assert.equal(r.h, 204);
  });

  it('placeLine handles horizontal line', () => {
    const g = new OccupancyGrid(0);
    g.placeLine(0, 100, 200, 100, 6, 'hline');
    const r = g.items[0];
    assert.equal(r.y, 97); // 100 - 3
    assert.equal(r.h, 6);
    assert.equal(r.w, 206);
  });

  it('removeOwner is idempotent', () => {
    const g = new OccupancyGrid(0);
    g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'a' });
    g.removeOwner('a');
    g.removeOwner('a'); // second call should be harmless
    assert.equal(g.items.length, 0);
  });

  it('removeOwner with no matching items is harmless', () => {
    const g = new OccupancyGrid(0);
    g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'a' });
    g.removeOwner('nonexistent');
    assert.equal(g.items.length, 1);
  });
});

// ── Render edge cases ─────────────────────────────────────────

describe('renderSVG edge cases', () => {
  it('renders node with missing cls as pure', () => {
    const dag = {
      nodes: [{ id: 'x', label: 'X' }], // no cls
      edges: [],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('data-node-cls="pure"'));
  });

  it('renders nodes with very long labels without error', () => {
    const dag = {
      nodes: [{ id: 'x', label: 'A'.repeat(200), cls: 'pure' }],
      edges: [],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('A'.repeat(200)));
  });

  it('renders with diagonal labels', () => {
    const dag = {
      nodes: [
        { id: 'a', label: 'Alpha', cls: 'pure' },
        { id: 'b', label: 'Beta', cls: 'pure' },
      ],
      edges: [['a', 'b']],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { diagonalLabels: true, labelAngle: 30 });
    assert.ok(svg.includes('rotate('));
    assert.ok(svg.includes('Alpha'));
  });

  it('renders with different label angles', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }, { id: 'b', label: 'B', cls: 'pure' }],
      edges: [['a', 'b']],
    };
    const layout = layoutMetro(dag);
    const svg45 = renderSVG(dag, layout, { diagonalLabels: true, labelAngle: 45 });
    const svg60 = renderSVG(dag, layout, { diagonalLabels: true, labelAngle: 60 });
    assert.ok(svg45.includes('rotate(-45'));
    assert.ok(svg60.includes('rotate(-60'));
  });

  it('renders TTB layout labels to the right', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'Alpha', cls: 'pure' }, { id: 'b', label: 'Beta', cls: 'pure' }],
      edges: [['a', 'b']],
    };
    const layout = layoutMetro(dag, { direction: 'ttb' });
    const svg = renderSVG(dag, layout);
    assert.ok(svg.includes('text-anchor="start"'));
  });

  it('legend renders all theme classes', () => {
    const dag = {
      nodes: [
        { id: 'a', label: 'A', cls: 'pure' },
        { id: 'b', label: 'B', cls: 'recordable' },
        { id: 'c', label: 'C', cls: 'side_effecting' },
        { id: 'd', label: 'D', cls: 'gate' },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd']],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { showLegend: true });
    assert.ok(svg.includes('Primary'));
    assert.ok(svg.includes('Secondary'));
    assert.ok(svg.includes('Tertiary'));
    assert.ok(svg.includes('Control'));
  });

  it('supports custom legendLabels', () => {
    const dag = {
      nodes: [{ id: 'a', label: 'A', cls: 'pure' }],
      edges: [],
    };
    const layout = layoutMetro(dag);
    const svg = renderSVG(dag, layout, { legendLabels: { pure: 'My Custom Label' } });
    assert.ok(svg.includes('My Custom Label'));
  });
});
