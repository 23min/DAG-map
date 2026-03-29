import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, resolveTheme } from '../../src/themes.js';

describe('THEMES', () => {
  it('has six built-in themes', () => {
    const names = Object.keys(THEMES);
    assert.deepStrictEqual(names.sort(), ['blueprint', 'cream', 'dark', 'light', 'metro', 'mono']);
  });

  it('every theme has required keys', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      assert.ok(theme.paper, `${name} missing paper`);
      assert.ok(theme.ink, `${name} missing ink`);
      assert.ok(theme.muted, `${name} missing muted`);
      assert.ok(theme.border, `${name} missing border`);
      assert.ok(theme.classes, `${name} missing classes`);
      assert.ok(Object.keys(theme.classes).length >= 4, `${name} has fewer than 4 classes`);
    }
  });
});

describe('resolveTheme', () => {
  it('returns cream for undefined/null/empty', () => {
    assert.deepStrictEqual(resolveTheme(), THEMES.cream);
    assert.deepStrictEqual(resolveTheme(null), THEMES.cream);
    assert.deepStrictEqual(resolveTheme(''), THEMES.cream);
  });

  it('returns cream when passed "cream"', () => {
    assert.deepStrictEqual(resolveTheme('cream'), THEMES.cream);
  });

  it('resolves named themes', () => {
    assert.deepStrictEqual(resolveTheme('dark'), THEMES.dark);
    assert.deepStrictEqual(resolveTheme('blueprint'), THEMES.blueprint);
    assert.deepStrictEqual(resolveTheme('metro'), THEMES.metro);
  });

  it('falls back to cream for unknown string', () => {
    assert.deepStrictEqual(resolveTheme('nonexistent'), THEMES.cream);
  });

  it('merges custom theme object with cream defaults', () => {
    const custom = { paper: '#000', classes: { pure: '#FFF' } };
    const result = resolveTheme(custom);
    assert.equal(result.paper, '#000');
    assert.equal(result.ink, THEMES.cream.ink); // inherited
    assert.equal(result.classes.pure, '#FFF'); // overridden
    assert.equal(result.classes.recordable, THEMES.cream.classes.recordable); // inherited
  });

  it('returns a new object for custom themes (no mutation)', () => {
    const custom = { paper: '#111' };
    const r1 = resolveTheme(custom);
    const r2 = resolveTheme(custom);
    assert.notStrictEqual(r1, r2);
    assert.notStrictEqual(r1, THEMES.cream);
  });
});
