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
 * @param {string|null} [options.subtitle] - subtitle text (null to hide)
 * @param {string} [options.font] - font-family for SVG text
 * @param {boolean} [options.diagonalLabels=false] - tube-map style diagonal labels
 * @param {number} [options.labelAngle=45] - angle in degrees for diagonal labels (0-90)
 * @param {boolean} [options.showLegend=true] - show legend at bottom
 * @param {object} [options.legendLabels] - custom legend labels per class
 * @param {boolean} [options.cssVars=false] - use CSS var() references instead of inline colors
 * @param {number} [options.labelSize=5] - label font size multiplier (before scale)
 * @param {function} [options.renderNode] - custom node renderer: (node, pos, ctx) => SVG string
 * @param {function} [options.renderEdge] - custom edge renderer: (edge, segment, ctx) => SVG string
 * @returns {string} SVG markup
 */
export function renderSVG(dag, layout, options = {}) {
  const {
    title,
    subtitle,
    diagonalLabels = false,
    labelAngle = 45,
    showLegend = true,
    cssVars = false,
    labelSize = 5,
    renderNode,
    renderEdge,
  } = options;

  const font = options.font || "'IBM Plex Mono', 'Courier New', monospace";

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

  const { positions, routePaths, extraEdges, width, height, routes, nodeRoute, nodeRoutes } = layout;
  const s = layout.scale || 1;
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  const inDeg = new Map(), outDeg = new Map();
  dag.nodes.forEach(nd => { inDeg.set(nd.id, 0); outDeg.set(nd.id, 0); });
  dag.edges.forEach(([f, t]) => { outDeg.set(f, outDeg.get(f) + 1); inDeg.set(t, inDeg.get(t) + 1); });

  const displayTitle = title || `DAG (${dag.nodes.length} OPS)`;
  const displaySubtitle = subtitle !== undefined ? subtitle : 'Topological layout. Colored lines = execution paths by node class.';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}">\n`;
  svg += `<rect width="${width}" height="${height}" fill="${col.paper}"/>\n`;

  svg += `<text x="${24 * s}" y="${22 * s}" font-size="${10 * s}" fill="${col.ink}" letter-spacing="0.06em" opacity="0.5">${displayTitle}</text>\n`;
  if (displaySubtitle) {
    svg += `<text x="${24 * s}" y="${34 * s}" font-size="${6.5 * s}" fill="${col.muted}">${displaySubtitle}</text>\n`;
  }

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

  // Build edge lookup for data attributes
  const edgeIndex = new Map();
  dag.edges.forEach(([f, t], i) => { edgeIndex.set(`${f}\u2192${t}`, i); });

  // Extra edges (cross-route connections)
  extraEdges.forEach((seg, i) => {
    if (renderEdge) {
      const ctx = { theme, scale: s, isExtraEdge: true, index: i };
      svg += renderEdge(null, { ...seg, color: segColor(seg.color) }, ctx);
      svg += '\n';
    } else {
      svg += `<path d="${seg.d}" stroke="${segColor(seg.color)}" stroke-width="${seg.thickness}" fill="none" `;
      svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${seg.opacity}"`;
      if (seg.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
      svg += ` data-edge-extra="true"`;
      svg += `/>\n`;
    }
  });

  // Route edges
  routes.forEach((route, ri) => {
    const segments = routePaths[ri];
    if (!segments) return;
    segments.forEach((seg, si) => {
      const fromId = route.nodes[si];
      const toId = route.nodes[si + 1];

      if (renderEdge) {
        const edge = fromId && toId ? { from: fromId, to: toId } : null;
        const ctx = { theme, scale: s, isExtraEdge: false, routeIndex: ri, segmentIndex: si };
        svg += renderEdge(edge, { ...seg, color: segColor(seg.color) }, ctx);
        svg += '\n';
      } else {
        svg += `<path d="${seg.d}" stroke="${segColor(seg.color)}" stroke-width="${seg.thickness}" fill="none" `;
        svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${seg.opacity}"`;
        if (seg.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
        if (fromId && toId) svg += ` data-edge-from="${fromId}" data-edge-to="${toId}" data-route="${ri}"`;
        svg += `/>\n`;
      }
    });
  });

  // Stations (nodes)
  dag.nodes.forEach(nd => {
    const pos = positions.get(nd.id);
    if (!pos) return;
    const color = col.cls(nd.cls || 'pure');
    const isInterchange = (inDeg.get(nd.id) > 1 || outDeg.get(nd.id) > 1);
    const isGate = nd.cls === 'gate';

    const ri = nodeRoute.get(nd.id);
    const depth = (ri !== undefined && routes[ri]) ? routes[ri].depth : 0;

    // Compute route info for this node
    const nRoutes = nodeRoutes ? nodeRoutes.get(nd.id) : null;
    const routeCount = nRoutes ? nRoutes.size : 1;
    const routeClasses = nRoutes
      ? [...nRoutes].map(idx => routes[idx]?.cls).filter(Boolean)
      : [];

    if (renderNode) {
      const ctx = {
        theme,
        scale: s,
        isInterchange,
        depth,
        inDegree: inDeg.get(nd.id),
        outDegree: outDeg.get(nd.id),
        color,
        routeIndex: ri,
        routeCount,
        routeClasses,
        orientation: layout.orientation || 'ltr',
        laneX: layout.laneX || null,
      };
      svg += `<g data-node-id="${nd.id}" data-node-cls="${nd.cls || 'pure'}">`;
      svg += renderNode(nd, pos, ctx);
      svg += `</g>\n`;
    } else {
      let r;
      if (isInterchange) {
        r = 5.5 * s;
      } else if (depth <= 1) {
        r = 3.5 * s;
      } else {
        r = 3 * s;
      }

      svg += `<g data-node-id="${nd.id}" data-node-cls="${nd.cls || 'pure'}">`;

      svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" `;
      svg += `fill="${col.paper}" stroke="${color}" stroke-width="${(isGate ? 2 : 1.6) * s}"`;
      if (isGate) svg += ` stroke-dasharray="${2 * s},${1.5 * s}"`;
      svg += `/>`;

      if (isInterchange && !isGate) {
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2 * s}" fill="${color}" opacity="0.3"/>`;
      }
      if (isGate) {
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2.2 * s}" fill="${col.cls('gate')}" opacity="0.4"/>`;
      }

      const fs = labelSize * s;
      if (diagonalLabels) {
        const tickLen = 6 * s;
        const angle = -labelAngle;
        const rad = angle * Math.PI / 180;
        const tickEndX = pos.x + Math.cos(rad) * tickLen;
        const tickEndY = pos.y + Math.sin(rad) * tickLen;
        svg += `<line x1="${pos.x.toFixed(1)}" y1="${(pos.y - r).toFixed(1)}" `;
        svg += `x2="${tickEndX.toFixed(1)}" y2="${(tickEndY - r).toFixed(1)}" `;
        svg += `stroke="${col.ink}" stroke-width="${0.6 * s}" opacity="0.3"/>`;
        const textX = tickEndX + 1 * s;
        const textY = tickEndY - r - 1 * s;
        svg += `<text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" `;
        svg += `font-size="${fs * 0.9}" fill="${col.ink}" text-anchor="start" opacity="0.55" `;
        svg += `transform="rotate(${angle} ${textX.toFixed(1)} ${textY.toFixed(1)})">${nd.label}</text>`;
      } else if (layout.orientation === 'ttb') {
        // TTB layout: place labels to the right of nodes
        const labelX = pos.x + r + 4 * s;
        const labelY = pos.y + fs * 0.35;
        svg += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" `;
        svg += `font-size="${fs}" fill="${col.ink}" text-anchor="start" opacity="0.55">${nd.label}</text>`;
      } else {
        const labelY = pos.y + r + 8 * s;
        svg += `<text x="${pos.x.toFixed(1)}" y="${labelY.toFixed(1)}" `;
        svg += `font-size="${fs}" fill="${col.ink}" text-anchor="middle" opacity="0.55">${nd.label}</text>`;
      }

      svg += `</g>\n`;
    }
  });

  // Legend
  if (showLegend) {
    const ly = height - 55 * s;
    svg += `<line x1="${24 * s}" y1="${ly}" x2="${width - 24 * s}" y2="${ly}" stroke="${col.border}" stroke-width="${0.3 * s}"/>\n`;

    // Derive legend entries from theme classes
    const classKeys = Object.keys(theme.classes);
    classKeys.forEach((cls, i) => {
      const label = legendLabels[cls] || cls;
      const color = col.cls(cls);
      const x = 24 * s + i * 160 * s;
      svg += `<line x1="${x}" y1="${ly + 16 * s}" x2="${x + 22 * s}" y2="${ly + 16 * s}" stroke="${color}" stroke-width="${3.5 * s}" opacity="0.5" stroke-linecap="round"`;
      if (cls === 'gate') svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
      svg += `/>\n`;
      svg += `<text x="${x + 28 * s}" y="${ly + 19 * s}" font-size="${6.5 * s}" fill="${col.muted}">${label}</text>\n`;
    });

    const vertSpread = layout.maxY - layout.minY;
    svg += `<text x="${24 * s}" y="${ly + 38 * s}" font-size="${6 * s}" fill="${col.muted}">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes.length} routes | spread: ${vertSpread.toFixed(0)}px | scale: ${s}x</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}
