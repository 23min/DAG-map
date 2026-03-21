// ================================================================
// route-angular.js — Angular progressive routing (R9/R10 style)
// ================================================================
// Interchange-aware angular routing with progressive curves.
// Convergence edges steepen toward the reference line.
// Divergence edges flatten away from it.
// Deterministic per-route variation via hash-based departure/arrival fractions.

/**
 * Progressive curve generator.
 *
 * For convergence (isConvergence=true): the edge is returning toward the
 * reference line (trunk or parent route). The curve STARTS flat (large
 * horizontal run) and ENDS steep (small horizontal run) — "steepening."
 *   Weights: (nSegs - i)^power — first segment gets the most X.
 *
 * For divergence (isConvergence=false): the edge is departing from the
 * reference line. The curve STARTS steep and ENDS flat — "flattening."
 *   Weights: (i + 1)^power — first segment gets the least X.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {boolean} isConvergence
 * @param {number} [power=2.2]
 * @returns {string} SVG path data (L segments, no leading M)
 */
export function progressiveCurve(startX, startY, endX, endY, isConvergence, power = 2.2) {
  const totalDx = endX - startX;
  const totalDy = endY - startY;
  if (Math.abs(totalDy) < 1) return `L ${endX} ${endY}`;
  if (totalDx < 3) return `L ${endX} ${endY}`;

  // Number of segments based on Y distance
  // ~1 segment per 18px of vertical distance, minimum 2, maximum 5
  const nSegs = Math.max(2, Math.min(5, Math.round(Math.abs(totalDy) / 18)));

  // X distribution: power curve
  const weights = [];
  for (let i = 0; i < nSegs; i++) {
    if (isConvergence) {
      // Convergence: first segments are flat (more X), last are steep (less X)
      weights.push(Math.pow(nSegs - i, power));
    } else {
      // Divergence: first segments are steep (less X), last are flat (more X)
      weights.push(Math.pow(i + 1, power));
    }
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Y is distributed EVENLY across segments
  const segDy = totalDy / nSegs;

  // Build path segments
  let d = '';
  let cx = startX;
  let cy = startY;

  for (let i = 0; i < nSegs; i++) {
    const segDx = totalDx * (weights[i] / totalWeight);
    cx += segDx;
    cy += segDy;
    d += `L ${cx.toFixed(1)} ${cy.toFixed(1)} `;
  }

  return d;
}

/**
 * Angular path with interchange-aware direction detection.
 *
 * Route segments determine convergence/divergence by ROLE, not distance:
 *   - FORK segment (src is interchange): always DIVERGENCE
 *   - RETURN segment (dst is interchange): always CONVERGENCE
 *   - INTERNAL segment (both own): use trunk Y fallback
 *
 * @param {number} px - source x
 * @param {number} py - source y
 * @param {number} qx - destination x
 * @param {number} qy - destination y
 * @param {number} routeIdx - route index (used for deterministic variation)
 * @param {number} segIdx - segment index within route
 * @param {number} refY - reference Y for convergence/divergence detection
 * @param {object} [options]
 * @param {number} [options.progressivePower=2.2]
 * @returns {string} SVG path data (without leading M)
 */
export function angularPath(px, py, qx, qy, routeIdx, segIdx, refY, options = {}) {
  const power = options.progressivePower ?? 2.2;
  const dx = qx - px, dy = qy - py;
  if (Math.abs(dy) < 1) return `L ${qx} ${qy}`; // horizontal
  if (dx < 3) return `L ${qx} ${qy}`; // too tight

  const srcDistFromRef = Math.abs(py - refY);
  const dstDistFromRef = Math.abs(qy - refY);

  const isConvergence = srcDistFromRef > dstDistFromRef + 0.5;
  const isDivergence = srcDistFromRef + 0.5 < dstDistFromRef;

  // Per-route variation for departure/arrival horizontal runs
  const hash = ((routeIdx * 7 + segIdx * 13) % 17) / 17;

  if (isConvergence) {
    // Long horizontal at branch level (35-45%), then progressive curve to trunk
    const departFrac = 0.35 + hash * 0.10;
    const departX = px + dx * departFrac;
    const remainDx = qx - departX;

    if (remainDx < 5) return `L ${qx} ${qy}`;

    let d = `L ${departX.toFixed(1)} ${py} `; // horizontal at branch level
    d += progressiveCurve(departX, py, qx, qy, true, power); // progressive curve
    return d;

  } else if (isDivergence) {
    // Progressive curve from trunk, then long horizontal at branch level (35-45%)
    const arriveFrac = 0.35 + hash * 0.10;
    const arriveX = qx - dx * arriveFrac;
    const curveDx = arriveX - px;

    if (curveDx < 5) return `L ${qx} ${qy}`;

    let d = progressiveCurve(px, py, arriveX, qy, false, power); // progressive curve
    d += `L ${qx} ${qy}`; // horizontal at branch level
    return d;

  } else {
    // Same level — symmetric
    const departFrac = 0.18 + hash * 0.08;
    const arriveFrac = 0.18 + ((hash * 7) % 1) * 0.08;
    const departX = px + dx * departFrac;
    const arriveX = qx - dx * arriveFrac;
    if (arriveX <= departX + 2) return `L ${qx} ${qy}`;
    return `L ${departX.toFixed(1)} ${py} L ${arriveX.toFixed(1)} ${qy} L ${qx} ${qy}`;
  }
}
