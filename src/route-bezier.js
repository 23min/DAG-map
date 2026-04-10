// ================================================================
// route-bezier.js — Bezier S-curve routing (v5 style)
// ================================================================
// Cubic bezier S-curves for smooth, organic edge routing.
// Depart horizontal, curve through a C-shaped bend, arrive horizontal.
// The departure/arrival horizontal run length adapts to the dy/dx ratio.
//
// A small hash-based perturbation on control points prevents overlapping
// beziers from coinciding exactly — deterministic per (route, segment).

/**
 * Generate a bezier S-curve path segment from (px, py) to (qx, qy).
 *
 * @param {number} px - source x
 * @param {number} py - source y
 * @param {number} qx - destination x
 * @param {number} qy - destination y
 * @param {number} routeIdx - route index (used for hash-based variation)
 * @param {number} segIdx - segment index (used for hash-based variation)
 * @param {number} _refY - (unused)
 * @returns {string} SVG path data (without leading M)
 */
export function bezierPath(px, py, qx, qy, routeIdx, segIdx, _refY) {
  const dx = qx - px, dy = qy - py;
  if (Math.abs(dy) < 0.5) {
    return `L ${qx} ${qy}`;
  }

  const absDy = Math.abs(dy);
  const ratio = absDy / Math.max(dx, 1);

  let departLen, arriveLen;
  if (ratio < 0.4) {
    departLen = dx * 0.30;
    arriveLen = dx * 0.30;
  } else if (ratio < 0.8) {
    departLen = dx * 0.20;
    arriveLen = dx * 0.20;
  } else {
    departLen = dx * 0.12;
    arriveLen = dx * 0.12;
  }

  const x1 = px + departLen;
  const x2 = qx - arriveLen;

  // Hash-based perturbation: small Y offset on control points so
  // overlapping beziers (same endpoints, different routes) separate.
  // Deterministic: same (routeIdx, segIdx) always produces the same offset.
  const hash = ((routeIdx * 7 + segIdx * 13) % 11) - 5; // range -5..+5
  const perturb = hash * 0.8; // ±4px max

  // Cubic bezier: smooth S-curve with slight perturbation
  const cp1x = x1 + (x2 - x1) * 0.45;
  const cp1y = py + perturb;
  const cp2x = x1 + (x2 - x1) * 0.55;
  const cp2y = qy - perturb;

  return `L ${x1} ${py} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${qy} L ${qx} ${qy}`;
}
