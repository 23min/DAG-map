// ================================================================
// render.js — SVG rendering for dag-map
// ================================================================
// Renders a DAG layout into an SVG string.
// Supports horizontal and diagonal label modes.
// Colors are driven by layout.theme (from the theme system).
//
// Two color modes:
//   cssVars: false (default) — inline hex colors, portable SVG
//   cssVars: true — CSS var() references, themeable from CSS

// Backward-compat import — only used if layout.theme is missing
import { C, CLASS_COLOR } from './layout.js';

/**
 * Render a DAG layout as an SVG string.
 *
 * @param {object} dag - { nodes: [{id, label, cls}], edges: [[from, to]] }
 * @param {object} layout - result from layoutMetro()
 * @param {object} [options]
 * @param {string} [options.title] - title displayed at top of SVG
 * @param {boolean} [options.diagonalLabels=false] - tube-map style diagonal labels
 * @param {number} [options.labelAngle=45] - angle in degrees for diagonal labels (0-90)
 * @param {boolean} [options.showLegend=true] - show legend at bottom
 * @param {object} [options.legendLabels] - custom legend labels per class
 * @param {boolean} [options.cssVars=false] - use CSS var() references instead of inline colors
 * @returns {string} SVG markup
 */
export function renderSVG(dag, layout, options = {}) {
  const {
    title,
    diagonalLabels = false,
    labelAngle = 45,
    showLegend = true,
    cssVars = false,
  } = options;

  const defaultLegendLabels = {
    pure: 'Primary',
    recordable: 'Secondary',
    side_effecting: 'Tertiary',
    gate: 'Control',
  };
  const legendLabels = { ...defaultLegendLabels, ...(options.legendLabels || {}) };

  // Resolve colors from theme (with backward-compat fallback)
  const theme = layout.theme || { paper: C.paper, ink: C.ink, muted: C.muted, border: C.border, classes: { pure: C.teal, recordable: C.coral, side_effecting: C.amber, gate: C.red } };

  // Color resolver: either inline hex or CSS var() reference
  const clsVar = (cls) => `var(--dm-cls-${cls.replace(/_/g, '-')})`;
  const col = cssVars ? {
    paper:  'var(--dm-paper)',
    ink:    'var(--dm-ink)',
    muted:  'var(--dm-muted)',
    border: 'var(--dm-border)',
    cls:    (cls) => clsVar(cls),
  } : {
    paper:  theme.paper,
    ink:    theme.ink,
    muted:  theme.muted,
    border: theme.border,
    cls:    (cls) => theme.classes[cls] || theme.classes.pure,
  };

  const { positions, routePaths, extraEdges, width, height, routes, nodeRoute } = layout;
  const s = layout.scale || 1;
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  const inDeg = new Map(), outDeg = new Map();
  dag.nodes.forEach(nd => { inDeg.set(nd.id, 0); outDeg.set(nd.id, 0); });
  dag.edges.forEach(([f, t]) => { outDeg.set(f, outDeg.get(f) + 1); inDeg.set(t, inDeg.get(t) + 1); });

  const displayTitle = title || `DAG (${dag.nodes.length} OPS)`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="'IBM Plex Mono', 'Courier New', monospace">\n`;
  svg += `<rect width="${width}" height="${height}" fill="${col.paper}"/>\n`;

  svg += `<text x="${24 * s}" y="${22 * s}" font-size="${10 * s}" fill="${col.ink}" letter-spacing="0.06em" opacity="0.5">${displayTitle}</text>\n`;
  svg += `<text x="${24 * s}" y="${34 * s}" font-size="${6.5 * s}" fill="${col.muted}">Topological layout. Colored lines = execution paths by node class.</text>\n`;

  // Route lines — extra edges first (behind)
  // Note: route/edge colors come from layout (already resolved to hex).
  // In cssVars mode, we need to map them back to CSS var references.
  function segColor(hexColor) {
    if (!cssVars) return hexColor;
    // Find which class this hex color belongs to
    for (const [cls, clsHex] of Object.entries(theme.classes)) {
      if (clsHex === hexColor) return clsVar(cls);
    }
    return hexColor; // fallback to hex if no match
  }

  extraEdges.forEach(seg => {
    svg += `<path d="${seg.d}" stroke="${segColor(seg.color)}" stroke-width="${seg.thickness}" fill="none" `;
    svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${seg.opacity}"`;
    if (seg.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
    svg += `/>\n`;
  });

  routePaths.forEach(segments => {
    segments.forEach(seg => {
      svg += `<path d="${seg.d}" stroke="${segColor(seg.color)}" stroke-width="${seg.thickness}" fill="none" `;
      svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${seg.opacity}"`;
      if (seg.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
      svg += `/>\n`;
    });
  });

  // Stations
  dag.nodes.forEach(nd => {
    const pos = positions.get(nd.id);
    if (!pos) return;
    const color = col.cls(nd.cls || 'pure');
    const isInterchange = (inDeg.get(nd.id) > 1 || outDeg.get(nd.id) > 1);
    const isGate = nd.cls === 'gate';

    const ri = nodeRoute.get(nd.id);
    const depth = (ri !== undefined && routes[ri]) ? routes[ri].depth : 0;
    let r;
    if (isInterchange) {
      r = 5.5 * s;
    } else if (depth <= 1) {
      r = 3.5 * s;
    } else {
      r = 3 * s;
    }

    svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" `;
    svg += `fill="${col.paper}" stroke="${color}" stroke-width="${(isGate ? 2 : 1.6) * s}"`;
    if (isGate) svg += ` stroke-dasharray="${2 * s},${1.5 * s}"`;
    svg += `/>\n`;

    if (isInterchange && !isGate) {
      svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2 * s}" fill="${color}" opacity="0.3"/>\n`;
    }
    if (isGate) {
      svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2.2 * s}" fill="${col.cls('gate')}" opacity="0.4"/>\n`;
    }

    if (diagonalLabels) {
      const tickLen = 6 * s;
      const angle = -labelAngle;
      const rad = angle * Math.PI / 180;
      const tickEndX = pos.x + Math.cos(rad) * tickLen;
      const tickEndY = pos.y + Math.sin(rad) * tickLen;
      svg += `<line x1="${pos.x.toFixed(1)}" y1="${(pos.y - r).toFixed(1)}" `;
      svg += `x2="${tickEndX.toFixed(1)}" y2="${(tickEndY - r).toFixed(1)}" `;
      svg += `stroke="${col.ink}" stroke-width="${0.6 * s}" opacity="0.3"/>\n`;
      const textX = tickEndX + 1 * s;
      const textY = tickEndY - r - 1 * s;
      svg += `<text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" `;
      svg += `font-size="${4.5 * s}" fill="${col.ink}" text-anchor="start" opacity="0.55" `;
      svg += `transform="rotate(${angle} ${textX.toFixed(1)} ${textY.toFixed(1)})">${nd.label}</text>\n`;
    } else {
      const labelY = pos.y + r + 8 * s;
      svg += `<text x="${pos.x.toFixed(1)}" y="${labelY.toFixed(1)}" `;
      svg += `font-size="${5 * s}" fill="${col.ink}" text-anchor="middle" opacity="0.55">${nd.label}</text>\n`;
    }
  });

  // Legend
  if (showLegend) {
    const ly = height - 55 * s;
    svg += `<line x1="${24 * s}" y1="${ly}" x2="${width - 24 * s}" y2="${ly}" stroke="${col.border}" stroke-width="${0.3 * s}"/>\n`;

    const lines = [
      [legendLabels.pure, col.cls('pure')], [legendLabels.side_effecting, col.cls('side_effecting')],
      [legendLabels.recordable, col.cls('recordable')], [legendLabels.gate, col.cls('gate')],
    ];
    lines.forEach(([label, color], i) => {
      const x = 24 * s + i * 160 * s;
      svg += `<line x1="${x}" y1="${ly + 16 * s}" x2="${x + 22 * s}" y2="${ly + 16 * s}" stroke="${color}" stroke-width="${3.5 * s}" opacity="0.5" stroke-linecap="round"`;
      if (i === 3) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
      svg += `/>\n`;
      svg += `<text x="${x + 28 * s}" y="${ly + 19 * s}" font-size="${6.5 * s}" fill="${col.muted}">${label}</text>\n`;
    });

    const vertSpread = layout.maxY - layout.minY;
    svg += `<text x="${24 * s}" y="${ly + 38 * s}" font-size="${6 * s}" fill="${col.muted}">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes.length} routes | spread: ${vertSpread.toFixed(0)}px | scale: ${s}x</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}
