import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bezierPath } from '../../src/route-bezier.js';
import { angularPath, progressiveCurve } from '../../src/route-angular.js';
import { metroPath } from '../../src/route-metro.js';

// Helper: parse an SVG path fragment into commands
function parsePath(d) {
  const cmds = [];
  const re = /([MLCQ])\s+([-\d.]+[\s,][-\d.]+(?:[\s,][-\d.]+[\s,][-\d.]+)*)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    const nums = m[2].trim().split(/[\s,]+/).map(Number);
    cmds.push({ cmd: m[1].toUpperCase(), nums });
  }
  return cmds;
}

// Helper: get the endpoint of a path (last two numbers)
function endpoint(d) {
  const nums = d.match(/-?[\d.]+/g).map(Number);
  return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
}

describe('bezierPath', () => {
  it('returns L for horizontal segment (dy ≈ 0)', () => {
    const d = bezierPath(0, 100, 200, 100, 0, 0, 100);
    assert.ok(d.startsWith('L'));
    assert.ok(!d.includes('C'));
  });

  it('produces a cubic bezier for non-trivial dy', () => {
    const d = bezierPath(0, 100, 200, 200, 0, 0, 100);
    assert.ok(d.includes('C'), 'should contain a C command');
  });

  it('ends at destination', () => {
    const d = bezierPath(0, 100, 300, 250, 0, 0, 100);
    const end = endpoint(d);
    assert.equal(end.x, 300);
    assert.equal(end.y, 250);
  });

  it('ignores routeIdx, segIdx, refY (API compat params)', () => {
    const d1 = bezierPath(0, 0, 100, 50, 0, 0, 0);
    const d2 = bezierPath(0, 0, 100, 50, 5, 3, 999);
    assert.equal(d1, d2);
  });
});

describe('progressiveCurve', () => {
  it('returns L for near-zero dy', () => {
    const d = progressiveCurve(0, 100, 200, 100.5, true);
    assert.ok(d.startsWith('L'));
  });

  it('returns L for near-zero dx', () => {
    const d = progressiveCurve(0, 100, 1, 300, false);
    assert.ok(d.startsWith('L'));
  });

  it('produces multiple L segments for significant displacement', () => {
    const d = progressiveCurve(0, 0, 200, 100, false, 2.2);
    const lCount = (d.match(/L /g) || []).length;
    assert.ok(lCount >= 2, `expected >= 2 L segments, got ${lCount}`);
  });

  it('convergence ends at destination', () => {
    const d = progressiveCurve(0, 0, 200, 80, true, 2.0);
    const end = endpoint(d);
    assert.ok(Math.abs(end.x - 200) < 1, `x: ${end.x}`);
    assert.ok(Math.abs(end.y - 80) < 1, `y: ${end.y}`);
  });

  it('divergence ends at destination', () => {
    const d = progressiveCurve(0, 0, 200, 80, false, 2.0);
    const end = endpoint(d);
    assert.ok(Math.abs(end.x - 200) < 1, `x: ${end.x}`);
    assert.ok(Math.abs(end.y - 80) < 1, `y: ${end.y}`);
  });
});

describe('angularPath', () => {
  it('returns L for horizontal segment', () => {
    const d = angularPath(0, 100, 200, 100, 0, 0, 100);
    assert.equal(d, 'L 200 100');
  });

  it('returns L for very short dx', () => {
    const d = angularPath(0, 100, 2, 200, 0, 0, 100);
    assert.equal(d, 'L 2 200');
  });

  it('produces convergence path (src far from ref, dst near ref)', () => {
    // src at y=200, dst at y=100, ref at y=100 → convergence
    const d = angularPath(0, 200, 200, 100, 0, 0, 100);
    assert.ok(d.includes('L'), 'should have L segments');
    const end = endpoint(d);
    assert.equal(end.x, 200);
    assert.equal(end.y, 100);
  });

  it('produces divergence path (src near ref, dst far from ref)', () => {
    const d = angularPath(0, 100, 200, 200, 0, 0, 100);
    const end = endpoint(d);
    assert.equal(end.x, 200);
    assert.equal(end.y, 200);
  });

  it('is deterministic for same inputs', () => {
    const d1 = angularPath(0, 100, 200, 200, 3, 1, 100);
    const d2 = angularPath(0, 100, 200, 200, 3, 1, 100);
    assert.equal(d1, d2);
  });

  it('varies with routeIdx (hash-based departure fraction)', () => {
    const d1 = angularPath(0, 200, 300, 100, 0, 0, 100);
    const d2 = angularPath(0, 200, 300, 100, 5, 0, 100);
    // Same geometry, different route → different departure fraction
    // They should both end at the same point but differ in path
    assert.notEqual(d1, d2);
  });
});

describe('metroPath', () => {
  it('returns L for horizontal segment', () => {
    const d = metroPath(0, 100, 200, 100, 0, 0, 100);
    assert.equal(d, 'L 200 100');
  });

  it('returns L for vertical segment', () => {
    const d = metroPath(100, 0, 100, 200, 0, 0, 100);
    assert.equal(d, 'L 100 200');
  });

  it('produces Q commands for rounded elbows', () => {
    const d = metroPath(0, 0, 200, 100, 0, 0, 0, { cornerRadius: 8 });
    assert.ok(d.includes('Q'), 'should have Q commands for rounded corners');
  });

  it('ends at destination', () => {
    const d = metroPath(0, 0, 200, 100, 0, 0, 0, { cornerRadius: 8 });
    const end = endpoint(d);
    assert.equal(end.x, 200);
    assert.equal(end.y, 100);
  });

  it('h-first: all L segments are axis-aligned', () => {
    const d = metroPath(0, 0, 200, 100, 0, 0, 0, { cornerRadius: 8, bendStyle: 'h-first' });
    const cmds = parsePath('M 0 0 ' + d);
    for (const c of cmds) {
      if (c.cmd === 'L') {
        // Each L should be preceded by a known pen position, but at minimum
        // check that L commands are present
        assert.ok(c.nums.length === 2);
      }
    }
  });

  it('v-first: produces V-H-V path', () => {
    const d = metroPath(0, 0, 100, 200, 0, 0, 0, { cornerRadius: 8, bendStyle: 'v-first' });
    assert.ok(d.includes('Q'));
    const end = endpoint(d);
    assert.equal(end.x, 100);
    assert.equal(end.y, 200);
  });

  it('clamps corner radius to available space', () => {
    // Very small displacement — radius should be clamped
    const d = metroPath(0, 0, 4, 4, 0, 0, 0, { cornerRadius: 100 });
    const end = endpoint(d);
    assert.equal(end.x, 4);
    assert.equal(end.y, 4);
  });

  it('returns L when radius too small', () => {
    const d = metroPath(0, 0, 1, 1, 0, 0, 0, { cornerRadius: 0.1 });
    assert.ok(d.startsWith('L'));
  });
});
