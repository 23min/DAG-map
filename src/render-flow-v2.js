// ================================================================
// render-flow-v2.js — Self-contained SVG renderer for layoutFlowV2
// ================================================================
// Produces clean process flow visuals: H-V-H routing, station dots
// with labels, lane backgrounds, route coloring.
// Independent from render.js (which is for metro mode).

import { resolveTheme } from './themes.js';

// Distinct color palette for routes when theme colors are insufficient.
// Chosen for visual distinction on both light and dark backgrounds.
const ROUTE_PALETTE = [
  '#268bd2', // blue
  '#dc322f', // red
  '#859900', // green
  '#d33682', // magenta
  '#b58900', // yellow
  '#2aa198', // cyan
  '#6c71c4', // violet
  '#cb4b16', // orange
  '#586e75', // gray
  '#073642', // dark
];

function esc(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render a layoutFlowV2 result as SVG.
 *
 * @param {object} dag - { nodes, edges }
 * @param {object} layout - result from layoutFlowV2()
 * @param {object} [options]
 * @returns {string} SVG string
 */
export function renderFlowV2(dag, layout, options = {}) {
  const { positions, routePaths, extraEdges, width, height, routes,
          nodeRoute, nodeRoutes, laneDividers, scale: s, theme: themeObj } = layout;

  const theme = themeObj || resolveTheme(options.theme);
  const showCards = options.showCards ?? false;
  const dotR = 3.5 * s;
  const fontSize = (options.labelSize ?? 3.2) * s;

  // Build per-route color map. Use theme class colors when available,
  // fall back to cycling through the palette for distinct colors.
  const routeColor = new Map();
  const usedColors = new Set();
  for (let ri = 0; ri < routes.length; ri++) {
    const cls = routes[ri].cls;
    const themeColor = cls ? theme.classes?.[cls] : null;
    if (themeColor && !usedColors.has(themeColor)) {
      routeColor.set(ri, themeColor);
      usedColors.add(themeColor);
    } else {
      // Cycle through palette, skipping already-used colors
      let color = ROUTE_PALETTE[ri % ROUTE_PALETTE.length];
      for (let j = 0; j < ROUTE_PALETTE.length; j++) {
        const candidate = ROUTE_PALETTE[(ri + j) % ROUTE_PALETTE.length];
        if (!usedColors.has(candidate)) { color = candidate; break; }
      }
      routeColor.set(ri, color);
      usedColors.add(color);
    }
  }

  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="'IBM Plex Mono', 'Courier New', monospace">`);

  // Background
  lines.push(`<rect width="${width}" height="${height}" fill="${theme.paper}"/>`);

  // Lane backgrounds (alternating subtle tint)
  if (laneDividers && routes) {
    const laneH = layout.laneHeight;
    for (let ri = 0; ri < routes.length; ri++) {
      const y = (layout.routeYScreen?.get(ri) ?? (30 * s + ri * laneH)) - laneH / 2;
      if (ri % 2 === 1) {
        lines.push(`<rect x="0" y="${y.toFixed(1)}" width="${width}" height="${laneH.toFixed(1)}" fill="${theme.ink}" opacity="0.03"/>`);
      }
    }
    // Lane divider lines
    for (const div of laneDividers) {
      lines.push(`<line x1="0" y1="${div.y.toFixed(1)}" x2="${width}" y2="${div.y.toFixed(1)}" stroke="${theme.muted || '#ccc'}" stroke-width="${0.5 * s}" stroke-dasharray="${3 * s},${3 * s}" opacity="0.3"/>`);
    }
    // Lane labels
    for (let ri = 0; ri < routes.length; ri++) {
      const laneY = layout.routeYScreen?.get(ri) ?? (30 * s + ri * laneH);
      const label = routes[ri].id || routes[ri].cls || `Route ${ri}`;
      lines.push(`<text x="${4 * s}" y="${(laneY + fontSize * 0.35).toFixed(1)}" font-size="${fontSize * 0.8}" fill="${theme.muted || '#999'}" opacity="0.5">${esc(label)}</text>`);
    }
  }

  // Extra edges (dashed, behind everything)
  for (const seg of extraEdges) {
    lines.push(`<path d="${seg.d}" fill="none" stroke="${seg.color}" stroke-width="${seg.thickness}" opacity="${seg.opacity}" stroke-dasharray="${3 * s},${2 * s}" stroke-linecap="round"/>`);
  }

  // Route paths
  for (let ri = 0; ri < routePaths.length; ri++) {
    for (const seg of routePaths[ri]) {
      lines.push(`<path d="${seg.d}" fill="none" stroke="${seg.color}" stroke-width="${seg.thickness}" opacity="${seg.opacity}" stroke-linecap="round" stroke-linejoin="round"`);
      if (seg.dashed) lines.push(` stroke-dasharray="${4 * s},${3 * s}"`);
      lines.push(`/>`);
    }
  }

  // Stations
  for (const nd of dag.nodes) {
    const pos = positions.get(nd.id);
    if (!pos) continue;

    const ri = nodeRoute?.get(nd.id) ?? 0;
    const color = routeColor.get(ri) || '#268bd2';
    const nRoutes = nodeRoutes?.get(nd.id);
    const routeCount = nRoutes ? nRoutes.size : 1;

    // Station dot — punched-out style (colored ring, white center)
    lines.push(`<g data-node-id="${esc(nd.id)}">`);
    lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR}" fill="${color}" opacity="0.9"/>`);
    lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR * 0.4}" fill="${theme.paper}"/>`);

    // Label below the dot
    lines.push(`<text class="dm-label" x="${pos.x.toFixed(1)}" y="${(pos.y + dotR + fontSize + 2 * s).toFixed(1)}" font-size="${fontSize}" fill="${theme.ink}" text-anchor="middle" opacity="0.6">${esc(nd.label)}</text>`);

    // At shared nodes, each route's dot is drawn at its own Y via dotPositions.
    // Draw additional dots for OTHER routes through this node at their dot positions.
    if (routeCount > 1 && nRoutes && layout.dotPositions) {
      for (const otherRi of nRoutes) {
        if (otherRi === ri) continue;
        const otherColor = routeColor.get(otherRi) || '#268bd2';
        const dp = layout.dotPositions.get(`${nd.id}:${otherRi}`);
        if (dp) {
          lines.push(`<circle cx="${dp.x.toFixed(1)}" cy="${dp.y.toFixed(1)}" r="${dotR * 0.8}" fill="${otherColor}" opacity="0.7"/>`);
          lines.push(`<circle cx="${dp.x.toFixed(1)}" cy="${dp.y.toFixed(1)}" r="${dotR * 0.3}" fill="${theme.paper}"/>`);
        }
      }
    }

    lines.push(`</g>`);
  }

  // Title
  const title = options.title || `DAG (${dag.nodes.length} OPS)`;
  lines.push(`<text x="${10 * s}" y="${16 * s}" font-size="${(options.titleSize ?? 4) * s}" fill="${theme.ink}" opacity="0.4">${esc(title)}</text>`);

  // Legend — each swatch is a <g> with data-route-id for tooltip
  const legendY = height - 12 * s;
  let legendX = 10 * s;
  for (let ri = 0; ri < Math.min(routes.length, 10); ri++) {
    const route = routes[ri];
    const color = routeColor.get(ri) || '#268bd2';
    const label = route.id || route.cls || `R${ri}`;
    const nodes = route.nodes.join(' → ');
    lines.push(`<g data-route-id="${esc(label)}" data-route-nodes="${esc(nodes)}">`);
    lines.push(`<rect x="${legendX}" y="${legendY}" width="${8 * s}" height="${3 * s}" rx="${1 * s}" fill="${color}" opacity="0.7"/>`);
    lines.push(`<text x="${legendX + 10 * s}" y="${legendY + 2.5 * s}" font-size="${fontSize * 0.8}" fill="${theme.ink}" opacity="0.5">${esc(label)}</text>`);
    lines.push(`</g>`);
    legendX += (label.length * fontSize * 0.5 + 16 * s);
  }

  // Stats
  lines.push(`<text x="${10 * s}" y="${height - 4 * s}" font-size="${fontSize * 0.7}" fill="${theme.muted || '#999'}" opacity="0.4">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes.length} routes</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
