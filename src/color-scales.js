// ================================================================
// color-scales.js — Curated color scales for heatmap mode
// ================================================================
// Each scale is a function (t: 0..1) => "rgb(r,g,b)"
// 0 = low/cool/good, 1 = high/hot/bad

/**
 * Palette scale — teal → amber → red.
 * Matches the cream theme's accent colors.
 * Default scale used by renderSVG when no colorScale is provided.
 */
function palette(t) {
  const c = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (c < 0.5) {
    const u = c * 2;
    r = Math.round(0x2B + (0xD4 - 0x2B) * u);
    g = Math.round(0x8A + (0x94 - 0x8A) * u);
    b = Math.round(0x8E + (0x4C - 0x8E) * u);
  } else {
    const u = (c - 0.5) * 2;
    r = Math.round(0xD4 + (0xC4 - 0xD4) * u);
    g = Math.round(0x94 + (0x5B - 0x94) * u);
    b = Math.round(0x4C + (0x4A - 0x4C) * u);
  }
  return `rgb(${r},${g},${b})`;
}

/**
 * Thermal scale — steel blue → warm salmon.
 * Good contrast on both light and dark backgrounds.
 */
function thermal(t) {
  const c = Math.max(0, Math.min(1, t));
  // Steel blue #4682B4 → muted lavender #9B7FB4 → warm salmon #D4796B
  let r, g, b;
  if (c < 0.5) {
    const u = c * 2;
    r = Math.round(70 + 85 * u);    // 70 → 155
    g = Math.round(130 - 3 * u);    // 130 → 127
    b = Math.round(180 + 0 * u);    // 180 → 180
  } else {
    const u = (c - 0.5) * 2;
    r = Math.round(155 + 57 * u);   // 155 → 212
    g = Math.round(127 - 6 * u);    // 127 → 121
    b = Math.round(180 - 73 * u);   // 180 → 107
  }
  return `rgb(${r},${g},${b})`;
}

/**
 * Mono scale — light gray → dark charcoal.
 * Theme-neutral, works everywhere.
 */
function mono(t) {
  const c = Math.max(0, Math.min(1, t));
  const v = Math.round(200 - 150 * c); // 200 → 50
  return `rgb(${v},${v},${v})`;
}

export const colorScales = { palette, thermal, mono };
