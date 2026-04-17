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

import { resolveTheme } from './themes.js';
import { colorScales } from './color-scales.js';

/** Escape user-supplied strings for safe SVG/XML interpolation. */
function esc(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape values interpolated into quoted XML attributes. */
function escAttr(v) {
  return esc(String(v ?? ''));
}

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
 * @param {number} [options.titleSize=10] - title font size multiplier (before scale)
 * @param {number} [options.subtitleSize=6.5] - subtitle font size multiplier (before scale)
 * @param {number} [options.legendSize=6.5] - legend text font size multiplier (before scale)
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
    titleSize = 10,
    subtitleSize = 6.5,
    legendSize = 6.5,
    dimOpacity = 0.25,
    renderNode,
    renderEdge,
    metrics,
    edgeMetrics,
    colorScale: userColorScale,
    selected,
    interactive = false,
  } = options;

  const colorScale = userColorScale || colorScales.palette;

  const font = options.font || "'IBM Plex Mono', 'Courier New', monospace";

  const defaultLegendLabels = {
    pure: 'Primary',
    recordable: 'Secondary',
    side_effecting: 'Tertiary',
    gate: 'Control',
  };
  const legendLabels = { ...defaultLegendLabels, ...(options.legendLabels || {}) };

  // Resolve colors from theme (with backward-compat fallback)
  const theme = layout.theme || resolveTheme('cream');

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

  // Computed sizes in SVG coordinate units
  const sz = {
    title: titleSize * s,
    subtitle: subtitleSize * s,
    label: labelSize * s,
    legend: legendSize * s,
    stats: (legendSize - 0.5) * s,
  };

  // Size resolver: either inline value or CSS var() reference
  const fs = cssVars ? {
    title:    `var(--dm-title-size, ${sz.title})`,
    subtitle: `var(--dm-subtitle-size, ${sz.subtitle})`,
    label:    `var(--dm-label-size, ${sz.label})`,
    legend:   `var(--dm-legend-size, ${sz.legend})`,
    stats:    `var(--dm-stats-size, ${sz.stats})`,
  } : sz;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}">\n`;

  if (cssVars) {
    svg += `<style>\n`;
    svg += `  svg { --dm-title-size: ${sz.title}; --dm-subtitle-size: ${sz.subtitle}; --dm-label-size: ${sz.label}; --dm-legend-size: ${sz.legend}; --dm-stats-size: ${sz.stats}; }\n`;
    svg += `</style>\n`;
  }

  svg += `<rect width="${width}" height="${height}" fill="${col.paper}"/>\n`;

  // In cssVars mode, use style= (CSS property) so var() works; otherwise use font-size= (SVG attribute)
  const fsAttr = (cls, size) => cssVars
    ? `style="font-size: ${size}"`
    : `font-size="${size}"`;

  svg += `<text class="dm-title" x="${24 * s}" y="${22 * s}" ${fsAttr('title', fs.title)} fill="${col.ink}" letter-spacing="0.06em" opacity="0.5">${esc(displayTitle)}</text>\n`;
  if (displaySubtitle) {
    svg += `<text class="dm-subtitle" x="${24 * s}" y="${34 * s}" ${fsAttr('subtitle', fs.subtitle)} fill="${col.muted}">${esc(displaySubtitle)}</text>\n`;
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

      // Check for edge-level metric
      const edgeKey = fromId && toId ? `${fromId}\u2192${toId}` : null;
      const edgeMetric = edgeKey && edgeMetrics && edgeMetrics.get ? edgeMetrics.get(edgeKey) : undefined;
      const hasEdgeMetric = edgeMetric !== undefined && edgeMetric !== null;
      const edgeColor = hasEdgeMetric ? colorScale(edgeMetric.value) : segColor(seg.color);
      const edgeOpacity = hasEdgeMetric ? Math.max(seg.opacity, 0.8) : seg.opacity;

      if (renderEdge) {
        const edge = fromId && toId ? { from: fromId, to: toId } : null;
        const ctx = { theme, scale: s, isExtraEdge: false, routeIndex: ri, segmentIndex: si, edgeMetric };
        svg += renderEdge(edge, { ...seg, color: edgeColor }, ctx);
        svg += '\n';
      } else {
        // When interactive, emit a wider invisible hit area so thin edges are clickable
        if (interactive && fromId && toId) {
          svg += `<path d="${seg.d}" stroke="transparent" stroke-width="${Math.max(seg.thickness, 8 * s)}" fill="none" `;
          svg += `stroke-linecap="round" pointer-events="stroke" `;
          svg += `data-edge-from="${escAttr(fromId)}" data-edge-to="${escAttr(toId)}" data-route="${ri}" data-edge-hit="true"`;
          svg += `/>\n`;
        }
        svg += `<path d="${seg.d}" stroke="${edgeColor}" stroke-width="${seg.thickness}" fill="none" `;
        svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${edgeOpacity}"`;
        if (interactive) svg += ` pointer-events="none"`;
        if (seg.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
        if (fromId && toId) {
          svg += ` data-edge-from="${escAttr(fromId)}" data-edge-to="${escAttr(toId)}" data-route="${ri}"`;
        }
        svg += `/>\n`;
      }
    });
  });

  // Stations (nodes)
  dag.nodes.forEach(nd => {
    const pos = positions.get(nd.id);
    if (!pos) return;
    const metric = metrics && metrics.get ? metrics.get(nd.id) : undefined;
    const hasMetric = metric !== undefined && metric !== null;
    const baseColor = col.cls(nd.cls || 'pure');
    const color = hasMetric ? colorScale(metric.value) : baseColor;
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

    const metricAttr = hasMetric ? ` data-metric-value="${metric.value}"` : '';

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
        metric,
      };
      svg += `<g data-node-id="${escAttr(nd.id)}" data-node-cls="${escAttr(nd.cls || 'pure')}"${metricAttr}>`;
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

      const isDim = nd.dim === true;
      const dO = dimOpacity;
      const nodeOpacity = isDim ? dO : 1;

      svg += `<g data-node-id="${escAttr(nd.id)}" data-node-cls="${escAttr(nd.cls || 'pure')}"${metricAttr}>`;

      svg += `<circle data-id="${escAttr(nd.id)}" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" `;
      svg += `fill="${col.paper}" stroke="${color}" stroke-width="${(isGate ? 2 : 1.6) * s}"`;
      if (isGate) svg += ` stroke-dasharray="${2 * s},${1.5 * s}"`;
      if (isDim) svg += ` opacity="${nodeOpacity}"`;
      svg += `/>`;

      if (isInterchange && !isGate) {
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2 * s}" fill="${color}" opacity="${isDim ? dO * 0.4 : 0.3}"/>`;
      }
      if (isGate) {
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${2.2 * s}" fill="${col.cls('gate')}" opacity="${isDim ? dO * 0.6 : 0.4}"/>`;
      }

      // Selection ring (rendered around the node when selected)
      const isSelected = selected && selected.has && selected.has(nd.id);
      if (isSelected) {
        const selR = r + 3 * s;
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${selR}" `;
        svg += `fill="none" stroke="${col.ink}" stroke-width="${1.2 * s}" opacity="0.8" class="dag-map-selected"/>`;
      }

      // Metric label (rendered above the node)
      if (hasMetric && metric.label) {
        svg += `<text class="dm-metric-label" x="${pos.x.toFixed(1)}" y="${(pos.y - r - 2 * s).toFixed(1)}" `;
        svg += `font-size="${labelSize * 0.9 * s}" fill="${color}" text-anchor="middle" font-weight="600" opacity="${isDim ? dO * 0.8 : 0.9}">${esc(metric.label)}</text>`;
      }

      const lfs = sz.label;  // label font size in SVG units (for positioning)
      const lfsCss = fs.label;  // label font size value (inline or var())
      const labelOpacity = isDim ? dO * 0.8 : 0.55;
      if (diagonalLabels) {
        const tickLen = 6 * s;
        const angle = -labelAngle;
        const rad = angle * Math.PI / 180;
        const tickEndX = pos.x + Math.cos(rad) * tickLen;
        const tickEndY = pos.y + Math.sin(rad) * tickLen;
        svg += `<line x1="${pos.x.toFixed(1)}" y1="${(pos.y - r).toFixed(1)}" `;
        svg += `x2="${tickEndX.toFixed(1)}" y2="${(tickEndY - r).toFixed(1)}" `;
        svg += `stroke="${col.ink}" stroke-width="${0.6 * s}" opacity="${isDim ? dO * 0.4 : 0.3}"/>`;
        const textX = tickEndX + 1 * s;
        const textY = tickEndY - r - 1 * s;
        svg += `<text class="dm-label" x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" `;
        svg += `${fsAttr('label', lfs * 0.9)} fill="${col.ink}" text-anchor="start" opacity="${labelOpacity}" `;
        svg += `transform="rotate(${angle} ${textX.toFixed(1)} ${textY.toFixed(1)})">${esc(nd.label)}</text>`;
      } else if (layout.orientation === 'ttb') {
        const labelX = pos.x + r + 4 * s;
        const labelY = pos.y + lfs * 0.35;
        svg += `<text class="dm-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" `;
        svg += `${fsAttr('label', lfsCss)} fill="${col.ink}" text-anchor="start" opacity="${labelOpacity}">${esc(nd.label)}</text>`;
      } else {
        const labelY = pos.y + r + 8 * s;
        svg += `<text class="dm-label" x="${pos.x.toFixed(1)}" y="${labelY.toFixed(1)}" `;
        svg += `${fsAttr('label', lfsCss)} fill="${col.ink}" text-anchor="middle" opacity="${labelOpacity}">${esc(nd.label)}</text>`;
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
      svg += `<text class="dm-legend-text" x="${x + 28 * s}" y="${ly + 19 * s}" ${fsAttr('legend', fs.legend)} fill="${col.muted}">${esc(label)}</text>\n`;
    });

    const vertSpread = layout.maxY - layout.minY;
    svg += `<text class="dm-stats" x="${24 * s}" y="${ly + 38 * s}" ${fsAttr('stats', fs.stats)} fill="${col.muted}">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes.length} routes | spread: ${vertSpread.toFixed(0)}px | scale: ${s}x</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}
