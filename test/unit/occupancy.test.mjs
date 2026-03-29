import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OccupancyGrid } from '../../src/occupancy.js';

describe('OccupancyGrid', () => {
  it('starts empty', () => {
    const g = new OccupancyGrid();
    assert.equal(g.items.length, 0);
  });

  it('place adds an item', () => {
    const g = new OccupancyGrid();
    g.place({ x: 0, y: 0, w: 10, h: 10 });
    assert.equal(g.items.length, 1);
  });

  describe('canPlace', () => {
    it('returns true when grid is empty', () => {
      const g = new OccupancyGrid(0);
      assert.ok(g.canPlace({ x: 5, y: 5, w: 10, h: 10 }));
    });

    it('returns false for overlapping rects', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10 });
      assert.equal(g.canPlace({ x: 5, y: 5, w: 10, h: 10 }), false);
    });

    it('returns true for non-overlapping rects', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10 });
      assert.ok(g.canPlace({ x: 20, y: 20, w: 10, h: 10 }));
    });

    it('respects padding', () => {
      const g = new OccupancyGrid(5);
      g.place({ x: 0, y: 0, w: 10, h: 10 });
      // Without padding these don't overlap, but with padding=5 they do
      assert.equal(g.canPlace({ x: 12, y: 0, w: 10, h: 10 }), false);
      // Far enough away
      assert.ok(g.canPlace({ x: 25, y: 0, w: 10, h: 10 }));
    });

    it('ignores items by owner string', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'nodeA' });
      assert.equal(g.canPlace({ x: 5, y: 5, w: 10, h: 10 }), false);
      assert.ok(g.canPlace({ x: 5, y: 5, w: 10, h: 10 }, 'nodeA'));
    });

    it('ignores items by owner Set', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'nodeA' });
      g.place({ x: 5, y: 5, w: 10, h: 10, owner: 'nodeB' });
      assert.equal(g.canPlace({ x: 2, y: 2, w: 5, h: 5 }, new Set(['nodeA', 'nodeB'])), true);
    });
  });

  describe('tryPlace', () => {
    it('places and returns true when no collision', () => {
      const g = new OccupancyGrid(0);
      assert.ok(g.tryPlace({ x: 0, y: 0, w: 10, h: 10 }));
      assert.equal(g.items.length, 1);
    });

    it('does not place and returns false on collision', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10 });
      assert.equal(g.tryPlace({ x: 5, y: 5, w: 10, h: 10 }), false);
      assert.equal(g.items.length, 1);
    });
  });

  describe('query', () => {
    it('returns overlapping items', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'a' });
      g.place({ x: 50, y: 50, w: 10, h: 10, owner: 'b' });
      const hits = g.query({ x: 5, y: 5, w: 5, h: 5 });
      assert.equal(hits.length, 1);
      assert.equal(hits[0].owner, 'a');
    });
  });

  describe('overlapCount', () => {
    it('counts overlapping items', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 20, h: 20 });
      g.place({ x: 5, y: 5, w: 20, h: 20 });
      g.place({ x: 100, y: 100, w: 10, h: 10 });
      assert.equal(g.overlapCount({ x: 8, y: 8, w: 5, h: 5 }), 2);
    });

    it('respects ignoreOwner', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 20, h: 20, owner: 'skip' });
      g.place({ x: 5, y: 5, w: 20, h: 20, owner: 'count' });
      assert.equal(g.overlapCount({ x: 8, y: 8, w: 5, h: 5 }, 'skip'), 1);
    });
  });

  describe('placeLine', () => {
    it('registers a line as a thin rect', () => {
      const g = new OccupancyGrid(0);
      g.placeLine(0, 0, 100, 0, 4, 'line1');
      assert.equal(g.items.length, 1);
      const r = g.items[0];
      assert.equal(r.x, -2); // x - thickness/2
      assert.equal(r.w, 104); // |dx| + thickness
      assert.equal(r.owner, 'line1');
    });
  });

  describe('removeOwner', () => {
    it('removes all items with matching owner', () => {
      const g = new OccupancyGrid(0);
      g.place({ x: 0, y: 0, w: 10, h: 10, owner: 'a' });
      g.place({ x: 20, y: 0, w: 10, h: 10, owner: 'b' });
      g.place({ x: 40, y: 0, w: 10, h: 10, owner: 'a' });
      g.removeOwner('a');
      assert.equal(g.items.length, 1);
      assert.equal(g.items[0].owner, 'b');
    });
  });
});
