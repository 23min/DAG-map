import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { swapPathXY } from '../../src/graph-utils.js';

describe('swapPathXY', () => {
  // ── Basic commands (M, L) ───────────────────────────────────

  it('swaps M coordinates', () => {
    assert.equal(swapPathXY('M 10 20'), 'M 20 10');
  });

  it('swaps L coordinates', () => {
    assert.equal(swapPathXY('M 0 0 L 100 200'), 'M 0 0 L 200 100');
  });

  it('swaps multiple L segments', () => {
    assert.equal(
      swapPathXY('M 0 0 L 10 20 L 30 40'),
      'M 0 0 L 20 10 L 40 30',
    );
  });

  // ── Quadratic bezier (Q) ────────────────────────────────────

  it('swaps Q control point and endpoint', () => {
    assert.equal(
      swapPathXY('M 0 0 Q 10 20 30 40'),
      'M 0 0 Q 20 10 40 30',
    );
  });

  // ── Cubic bezier (C) ───────────────────────────────────────

  it('swaps C three coordinate pairs', () => {
    assert.equal(
      swapPathXY('M 0 0 C 10 20 30 40 50 60'),
      'M 0 0 C 20 10 40 30 60 50',
    );
  });

  // ── Smooth curves (S, T) ────────────────────────────────────

  it('swaps S two coordinate pairs', () => {
    assert.equal(
      swapPathXY('M 0 0 S 10 20 30 40'),
      'M 0 0 S 20 10 40 30',
    );
  });

  it('swaps T single coordinate pair', () => {
    assert.equal(
      swapPathXY('M 0 0 T 10 20'),
      'M 0 0 T 20 10',
    );
  });

  // ── H ↔ V swap ─────────────────────────────────────────────

  it('converts H to V', () => {
    assert.equal(swapPathXY('M 0 0 H 100'), 'M 0 0 V 100');
  });

  it('converts V to H', () => {
    assert.equal(swapPathXY('M 0 0 V 100'), 'M 0 0 H 100');
  });

  // ── Z (close path) ─────────────────────────────────────────

  it('preserves Z', () => {
    assert.equal(
      swapPathXY('M 0 0 L 10 20 Z'),
      'M 0 0 L 20 10 Z',
    );
  });

  // ── Lowercase (relative) commands ───────────────────────────

  it('swaps lowercase m', () => {
    assert.equal(swapPathXY('m 10 20'), 'm 20 10');
  });

  it('swaps lowercase l', () => {
    assert.equal(swapPathXY('M 0 0 l 10 20'), 'M 0 0 l 20 10');
  });

  it('swaps lowercase c', () => {
    assert.equal(
      swapPathXY('M 0 0 c 10 20 30 40 50 60'),
      'M 0 0 c 20 10 40 30 60 50',
    );
  });

  it('swaps lowercase q', () => {
    assert.equal(
      swapPathXY('M 0 0 q 10 20 30 40'),
      'M 0 0 q 20 10 40 30',
    );
  });

  it('swaps lowercase s', () => {
    assert.equal(
      swapPathXY('M 0 0 s 10 20 30 40'),
      'M 0 0 s 20 10 40 30',
    );
  });

  it('swaps lowercase t', () => {
    assert.equal(swapPathXY('M 0 0 t 10 20'), 'M 0 0 t 20 10');
  });

  it('converts lowercase h to v', () => {
    assert.equal(swapPathXY('M 0 0 h 50'), 'M 0 0 v 50');
  });

  it('converts lowercase v to h', () => {
    assert.equal(swapPathXY('M 0 0 v 50'), 'M 0 0 h 50');
  });

  it('preserves lowercase z', () => {
    assert.equal(swapPathXY('M 0 0 l 10 20 z'), 'M 0 0 l 20 10 z');
  });

  // ── Arc (A) — should throw ─────────────────────────────────

  it('throws on A command', () => {
    assert.throws(
      () => swapPathXY('M 0 0 A 25 25 0 0 1 50 25'),
      /arc/i,
    );
  });

  it('throws on lowercase a command', () => {
    assert.throws(
      () => swapPathXY('M 0 0 a 25 25 0 0 1 50 25'),
      /arc/i,
    );
  });

  // ── Real-world paths from our routers ───────────────────────

  it('handles a bezierPath output', () => {
    const d = 'M 75 240 L 105 240 C 118.5 240, 121.5 160, 135 160 L 165 160';
    const swapped = swapPathXY(d);
    // Commas normalized to spaces in output
    assert.equal(swapped, 'M 240 75 L 240 105 C 240 118.5 160 121.5 160 135 L 160 165');
  });

  it('handles a metroPath output (Q elbows)', () => {
    const d = 'M 50 100 L 90.5 100 Q 100.0 100 100.0 110.0 L 100.0 190.0 Q 100.0 200 110.0 200 L 200 200';
    const swapped = swapPathXY(d);
    // Number('100.0') → 100, so trailing .0 is stripped — mathematically identical
    assert.equal(swapped, 'M 100 50 L 100 90.5 Q 100 100 110 100 L 190 100 Q 200 100 200 110 L 200 200');
  });

  it('handles angularPath output (multiple L segments)', () => {
    const d = 'M 0 200 L 70.0 200 L 115.4 170.0 L 148.4 150.0 L 200 100';
    const swapped = swapPathXY(d);
    assert.equal(swapped, 'M 200 0 L 200 70 L 170 115.4 L 150 148.4 L 100 200');
  });

  // ── Edge cases ──────────────────────────────────────────────

  it('handles empty string', () => {
    assert.equal(swapPathXY(''), '');
  });

  it('handles commas as separators', () => {
    assert.equal(swapPathXY('M 10,20 L 30,40'), 'M 20 10 L 40 30');
  });

  it('handles negative coordinates', () => {
    assert.equal(swapPathXY('M -10 -20 L -30 40'), 'M -20 -10 L 40 -30');
  });

  it('preserves decimal precision', () => {
    assert.equal(swapPathXY('M 10.5 20.3'), 'M 20.3 10.5');
  });

  it('round-trip: double swap returns original', () => {
    const original = 'M 10 20 L 30 40 Q 50 60 70 80 C 1 2 3 4 5 6';
    assert.equal(swapPathXY(swapPathXY(original)), original);
  });
});
