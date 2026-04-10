// position-blend.js — blend two position maps with an evolvable weight.
//
// final_y = alpha * yA + (1 - alpha) * yB
//
// This is the core combinator that makes all layout approaches composable.
// The GA evolves alpha.

/**
 * Blend two Y-position maps.
 *
 * @param {Map<string, number>} yA - first position map
 * @param {Map<string, number>} yB - second position map
 * @param {number} alpha - blend weight: 0.0 = pure A, 1.0 = pure B
 * @returns {Map<string, number>}
 */
export function blendPositions(yA, yB, alpha) {
  const result = new Map();
  const a = Math.max(0, Math.min(1, alpha));

  for (const [id, valA] of yA) {
    const valB = yB.get(id);
    if (valB !== undefined) {
      result.set(id, (1 - a) * valA + a * valB);
    } else {
      result.set(id, valA);
    }
  }
  // Include nodes only in yB
  for (const [id, valB] of yB) {
    if (!result.has(id)) {
      result.set(id, valB);
    }
  }

  return result;
}

/**
 * Apply gravity: pull all Y positions toward center.
 *
 * @param {Map<string, number>} y - position map (mutated)
 * @param {number} strength - 0.0 = no gravity, 1.0 = full centering
 */
export function applyGravity(y, strength) {
  if (strength <= 0) return;

  let sum = 0, count = 0;
  for (const val of y.values()) {
    sum += val;
    count++;
  }
  if (count === 0) return;
  const center = sum / count;

  const s = Math.max(0, Math.min(1, strength));
  for (const [id, val] of y) {
    y.set(id, val + s * (center - val));
  }
}
