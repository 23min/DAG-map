// ================================================================
// occupancy.js — Spatial occupancy tracker for collision detection
// ================================================================
// Tracks placed rectangles in 2D space. Used by layoutFlow to
// detect and avoid collisions between tracks, cards, and labels.
//
// Uses a simple array of axis-aligned bounding boxes (AABBs).
// For our graph sizes (<100 items), brute-force AABB checks are fast enough.

/**
 * @typedef {Object} Rect
 * @property {number} x - left edge
 * @property {number} y - top edge
 * @property {number} w - width
 * @property {number} h - height
 * @property {string} [type] - 'card'|'track'|'badge'|'dot'
 * @property {string} [owner] - node/edge/route id
 */

export class OccupancyGrid {
  constructor(padding = 2) {
    /** @type {Rect[]} */
    this.items = [];
    this.padding = padding;
  }

  /**
   * Check if a rect can be placed without collision.
   * @param {Rect} rect
   * @param {string|Set<string>} [ignoreOwner] - ignore items with this owner (string or Set)
   * @returns {boolean}
   */
  canPlace(rect, ignoreOwner) {
    const p = this.padding;
    for (const item of this.items) {
      if (this._ignored(item, ignoreOwner)) continue;
      if (this._overlaps(rect, item, p)) return false;
    }
    return true;
  }

  /**
   * Place a rect in the grid.
   * @param {Rect} rect
   */
  place(rect) {
    this.items.push(rect);
  }

  /**
   * Place if no collision, return success.
   * @param {Rect} rect
   * @param {string} [ignoreOwner]
   * @returns {boolean}
   */
  tryPlace(rect, ignoreOwner) {
    if (this.canPlace(rect, ignoreOwner)) {
      this.place(rect);
      return true;
    }
    return false;
  }

  /**
   * Find all items that overlap with a given rect.
   * @param {Rect} rect
   * @returns {Rect[]}
   */
  query(rect) {
    const p = this.padding;
    return this.items.filter(item => this._overlaps(rect, item, p));
  }

  /**
   * Count overlaps for a candidate rect (for scoring).
   * @param {Rect} rect
   * @param {string|Set<string>} [ignoreOwner]
   * @returns {number}
   */
  overlapCount(rect, ignoreOwner) {
    const p = this.padding;
    let count = 0;
    for (const item of this.items) {
      if (this._ignored(item, ignoreOwner)) continue;
      if (this._overlaps(rect, item, p)) count++;
    }
    return count;
  }

  /**
   * Register a line segment as a thin rectangle in the grid.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} thickness
   * @param {string} [owner]
   */
  placeLine(x1, y1, x2, y2, thickness, owner) {
    const t = thickness / 2;
    const rect = {
      x: Math.min(x1, x2) - t,
      y: Math.min(y1, y2) - t,
      w: Math.abs(x2 - x1) + thickness,
      h: Math.abs(y2 - y1) + thickness,
      type: 'track',
      owner,
    };
    this.items.push(rect);
  }

  /**
   * Remove all items with a given owner.
   * @param {string} owner
   */
  removeOwner(owner) {
    this.items = this.items.filter(item => item.owner !== owner);
  }

  /** @private */
  _ignored(item, ignoreOwner) {
    if (!ignoreOwner || !item.owner) return false;
    if (typeof ignoreOwner === 'string') return item.owner === ignoreOwner;
    return ignoreOwner.has(item.owner);
  }

  /**
   * @private
   */
  _overlaps(a, b, padding) {
    return !(
      a.x + a.w + padding <= b.x ||
      b.x + b.w + padding <= a.x ||
      a.y + a.h + padding <= b.y ||
      b.y + b.h + padding <= a.y
    );
  }
}
