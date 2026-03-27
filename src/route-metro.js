// ================================================================
// route-metro.js — Metro-style right-angle routing with rounded elbows
// ================================================================
// Produces clean H-V-H or V-H-V paths with quadratic bezier corners.
// Designed for parallel-line layouts where visual clarity is paramount.
//
// For LTR layouts: horizontal → rounded elbow → vertical → rounded elbow → horizontal
// For TTB layouts: vertical → rounded elbow → horizontal → rounded elbow → vertical

/**
 * Rounded elbow path between two points using right-angle bends.
 *
 * @param {number} px - source x
 * @param {number} py - source y
 * @param {number} qx - destination x
 * @param {number} qy - destination y
 * @param {number} routeIdx - route index (for deterministic midpoint variation)
 * @param {number} segIdx - segment index within route
 * @param {number} refY - reference Y (not used, kept for API compat)
 * @param {object} [options]
 * @param {number} [options.cornerRadius=8] - corner radius in px (before scale)
 * @param {'h-first'|'v-first'|'auto'} [options.bendStyle='auto'] - which axis to run first
 * @returns {string} SVG path data (without leading M)
 */
export function metroPath(px, py, qx, qy, routeIdx, segIdx, refY, options = {}) {
  const cornerRadius = options.cornerRadius ?? 8;
  const bendStyle = options.bendStyle ?? 'auto';
  const dx = qx - px, dy = qy - py;

  // Straight horizontal or vertical — no bend needed
  if (Math.abs(dy) < 1) return `L ${qx} ${qy}`;
  if (Math.abs(dx) < 1) return `L ${qx} ${qy}`;

  // Clamp radius so it doesn't exceed available space
  const r = Math.min(cornerRadius, Math.abs(dx) / 2, Math.abs(dy) / 2);

  if (r < 1) return `L ${qx} ${qy}`; // too small for rounded corners

  // Determine bend direction
  const useHFirst = bendStyle === 'h-first' ||
    (bendStyle === 'auto' && Math.abs(dx) >= Math.abs(dy));

  if (useHFirst) {
    // H-V path: horizontal run → rounded corner → vertical run
    const midFrac = options.midFrac ?? (0.45 + (((routeIdx * 7 + segIdx * 13) % 17) / 17) * 0.10);
    const midX = px + dx * midFrac;

    return hvPath(px, py, midX, qx, qy, r);
  } else {
    // V-H path: vertical run → rounded corner → horizontal run
    const midFrac = options.midFrac ?? (0.45 + (((routeIdx * 7 + segIdx * 13) % 17) / 17) * 0.10);
    const midY = py + dy * midFrac;

    return vhPath(px, py, midY, qx, qy, r);
  }
}

/**
 * H-V-H path: horizontal → corner → vertical → corner → horizontal
 */
function hvPath(px, py, midX, qx, qy, r) {
  const dy = qy - py;
  const sy = Math.sign(dy); // +1 down, -1 up

  // First elbow: at (midX, py) turning toward qy
  const e1x = midX - r;        // approach point
  const e1cx = midX;            // corner control point
  const e1cy = py;
  const e1ex = midX;            // exit point
  const e1ey = py + sy * r;

  // Second elbow: at (midX, qy) turning toward qx
  const e2x = midX;             // approach point
  const e2y = qy - sy * r;
  const e2cx = midX;            // corner control point
  const e2cy = qy;
  const e2ex = midX + r * Math.sign(qx - midX); // exit toward qx
  const e2ey = qy;

  let d = '';
  d += `L ${e1x.toFixed(1)} ${py} `;                      // horizontal to first elbow approach
  d += `Q ${e1cx.toFixed(1)} ${e1cy} ${e1ex.toFixed(1)} ${e1ey.toFixed(1)} `; // rounded corner
  d += `L ${e2x.toFixed(1)} ${e2y.toFixed(1)} `;          // vertical run
  d += `Q ${e2cx.toFixed(1)} ${e2cy} ${e2ex.toFixed(1)} ${e2ey.toFixed(1)} `; // rounded corner
  d += `L ${qx} ${qy}`;                                    // horizontal to destination

  return d;
}

/**
 * V-H-V path: vertical → corner → horizontal → corner → vertical
 */
function vhPath(px, py, midY, qx, qy, r) {
  const dx = qx - px;
  const sx = Math.sign(dx); // +1 right, -1 left
  const dy = qy - py;
  const sy = Math.sign(dy);

  // First elbow: at (px, midY) turning toward qx
  const e1y = midY - sy * r;
  const e1cx = px;
  const e1cy = midY;
  const e1ex = px + sx * r;
  const e1ey = midY;

  // Second elbow: at (qx, midY) turning toward qy
  const e2x = qx - sx * r;
  const e2y = midY;
  const e2cx = qx;
  const e2cy = midY;
  const e2ex = qx;
  const e2ey = midY + sy * r;

  let d = '';
  d += `L ${px} ${e1y.toFixed(1)} `;                       // vertical to first elbow
  d += `Q ${e1cx.toFixed(1)} ${e1cy.toFixed(1)} ${e1ex.toFixed(1)} ${e1ey.toFixed(1)} `; // rounded corner
  d += `L ${e2x.toFixed(1)} ${e2y.toFixed(1)} `;           // horizontal run
  d += `Q ${e2cx.toFixed(1)} ${e2cy.toFixed(1)} ${e2ex.toFixed(1)} ${e2ey.toFixed(1)} `; // rounded corner
  d += `L ${qx} ${qy}`;                                     // vertical to destination

  return d;
}
