// ================================================================
// render-flow-v2.js — Self-contained SVG renderer for layoutFlowV2
// ================================================================
// Produces clean process flow visuals: H-V-H routing, station dots
// with labels, lane backgrounds, route coloring.
// Independent from render.js (which is for metro mode).

import { resolveTheme } from './themes.js';

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
    const route = routes[ri];
    const color = theme.classes?.[route?.cls] || theme.classes?.pure || '#268bd2';
    const nRoutes = nodeRoutes?.get(nd.id);
    const routeCount = nRoutes ? nRoutes.size : 1;

    // Station dot — punched-out style (colored ring, white center)
    lines.push(`<g data-node-id="${esc(nd.id)}">`);
    lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR}" fill="${color}" opacity="0.9"/>`);
    lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR * 0.4}" fill="${theme.paper}"/>`);

    // Label below the dot
    lines.push(`<text class="dm-label" x="${pos.x.toFixed(1)}" y="${(pos.y + dotR + fontSize + 2 * s).toFixed(1)}" font-size="${fontSize}" fill="${theme.ink}" text-anchor="middle" opacity="0.6">${esc(nd.label)}</text>`);

    // Multi-route indicator: additional dots for other routes through this node
    if (routeCount > 1 && nRoutes) {
      let dotIdx = 0;
      for (const otherRi of nRoutes) {
        if (otherRi === ri) continue;
        const otherRoute = routes[otherRi];
        const otherColor = theme.classes?.[otherRoute?.cls] || '#268bd2';
        const offsetX = (dotIdx + 1) * dotR * 2.5;
        lines.push(`<circle cx="${(pos.x + offsetX).toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR * 0.7}" fill="${otherColor}" opacity="0.6"/>`);
        dotIdx++;
      }
    }

    lines.push(`</g>`);
  }

  // Title
  const title = options.title || `DAG (${dag.nodes.length} OPS)`;
  lines.push(`<text x="${10 * s}" y="${16 * s}" font-size="${(options.titleSize ?? 4) * s}" fill="${theme.ink}" opacity="0.4">${esc(title)}</text>`);

  // Legend
  const legendY = height - 12 * s;
  let legendX = 10 * s;
  for (let ri = 0; ri < Math.min(routes.length, 8); ri++) {
    const route = routes[ri];
    const color = theme.classes?.[route.cls] || '#268bd2';
    const label = route.id || route.cls || `R${ri}`;
    lines.push(`<rect x="${legendX}" y="${legendY}" width="${8 * s}" height="${3 * s}" rx="${1 * s}" fill="${color}" opacity="0.7"/>`);
    lines.push(`<text x="${legendX + 10 * s}" y="${legendY + 2.5 * s}" font-size="${fontSize * 0.8}" fill="${theme.ink}" opacity="0.5">${esc(label)}</text>`);
    legendX += (label.length * fontSize * 0.5 + 16 * s);
  }

  // Stats
  lines.push(`<text x="${10 * s}" y="${height - 4 * s}" font-size="${fontSize * 0.7}" fill="${theme.muted || '#999'}" opacity="0.4">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes.length} routes</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
