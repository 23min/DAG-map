// ================================================================
// render-process.js — Celonis-style SVG renderer for layoutProcess
// ================================================================
//
// Stations are punched-out circles ON the route lines (like metro).
// Cards are positioned BESIDE stations (labels, not the nodes).
// Thick colored route lines pass through station dots.

import { resolveTheme } from './themes.js';

function esc(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render a layoutProcess result as SVG.
 */
export function renderProcess(dag, layout, options = {}) {
  const { stationPos, cardPlacements, routePaths, extraEdges,
          width, height, scale: s, theme: themeObj,
          fontSize, fsMetric, cardPadX, cardPadY, cardRadius, dotR,
          routes, routeColors, nodeRoutes, segmentRoutes, trackSpread,
          trunkRi, lineThickness } = layout;

  const theme = themeObj || resolveTheme(options.theme);
  const showFrequency = options.frequency ?? false;
  const showBundling = options.bundling ?? false;

  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">`);

  // Background
  lines.push(`<rect width="${width}" height="${height}" fill="${theme.paper}"/>`);

  // Extra edges (dashed, behind everything)
  for (const seg of extraEdges) {
    lines.push(`<path d="${seg.d}" fill="none" stroke="${seg.color}" stroke-width="${seg.thickness.toFixed(1)}" opacity="${seg.opacity}" stroke-linecap="round" stroke-dasharray="${4 * s},${3 * s}"/>`);
  }

  // Route paths
  if (showBundling && segmentRoutes) {
    // Ribbon-cable bundling: shared segments draw each route's line
    // at reduced spacing (tight parallel) so all colors are visible.
    // Non-shared segments draw normally.
    const drawnSegments = new Set();
    for (const rp of routePaths) {
      for (const seg of rp.segments) {
        const segKey = `${seg.fromId}\u2192${seg.toId}`;
        if (drawnSegments.has(segKey)) continue;
        drawnSegments.add(segKey);

        const members = segmentRoutes?.get(segKey) || [rp.ri];
        if (members.length > 1) {
          // Ribbon cable: each route draws at its own (tight) path position
          for (const ri of members) {
            const color = routeColors?.get(ri) || '#999';
            const memberRp = routePaths.find(r => r.ri === ri);
            const memberSeg = memberRp?.segments.find(s => s.fromId === seg.fromId && s.toId === seg.toId);
            const d = memberSeg?.d || seg.d;
            const thick = lineThickness * 0.85;
            lines.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${thick.toFixed(1)}" opacity="0.8" stroke-linecap="round" stroke-linejoin="round"/>`);
          }
        } else {
          // Single route — normal rendering with weight-based styling
          const dash = showFrequency && rp.relWeight < 0.5 ? ` stroke-dasharray="${4*s},${3*s}"` : '';
          lines.push(`<path d="${seg.d}" fill="none" stroke="${seg.color}" stroke-width="${seg.thickness.toFixed(1)}" opacity="${seg.opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
        }
      }
    }
  } else {
    // Standard rendering with data-driven frequency styling
    for (const rp of routePaths) {
      for (const seg of rp.segments) {
        let dash = '';
        let thick = seg.thickness;
        let op = seg.opacity;
        if (showFrequency) {
          // Weight already encoded in thickness/opacity from layout
          // Add dashing for low-weight routes
          if (rp.relWeight < 0.4) dash = ` stroke-dasharray="${4*s},${3*s}"`;
        }
        lines.push(`<path d="${seg.d}" fill="none" stroke="${seg.color}" stroke-width="${thick.toFixed(1)}" opacity="${op}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
      }
    }
  }

  // Station dots + cards (on top of routes)
  for (const nd of dag.nodes) {
    const pos = stationPos.get(nd.id);
    if (!pos) continue;

    const memberRoutes = nodeRoutes?.get(nd.id);
    const sortedRoutes = memberRoutes ? [...memberRoutes].sort((a, b) => a - b) : [];

    lines.push(`<g data-node-id="${esc(nd.id)}">`);

    // Station dots — pill for junctions (multi-route), circle for single
    const isLTR = layout.isLTR;
    if (sortedRoutes.length > 1) {
      // Junction: elongated pill spanning all route dots
      const n = sortedRoutes.length;
      const minOff = (0 - (n - 1) / 2) * trackSpread;
      const maxOff = ((n - 1) - (n - 1) / 2) * trackSpread;
      const pillPad = dotR * 0.6;

      if (isLTR) {
        // Vertical pill
        const pillX = pos.x - dotR;
        const pillY = pos.y + minOff - pillPad;
        const pillW = dotR * 2;
        const pillH = (maxOff - minOff) + pillPad * 2;
        lines.push(`<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${dotR}" fill="${theme.paper}" stroke="${theme.muted || '#ccc'}" stroke-width="${0.6 * s}"/>`);
      } else {
        // Horizontal pill
        const pillX = pos.x + minOff - pillPad;
        const pillY = pos.y - dotR;
        const pillW = (maxOff - minOff) + pillPad * 2;
        const pillH = dotR * 2;
        lines.push(`<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${dotR}" fill="${theme.paper}" stroke="${theme.muted || '#ccc'}" stroke-width="${0.6 * s}"/>`);
      }

      // Individual punched-out dots inside the pill
      for (let i = 0; i < n; i++) {
        const ri = sortedRoutes[i];
        const color = routeColors?.get(ri) || '#999';
        const off = (i - (n - 1) / 2) * trackSpread;
        const cx = isLTR ? pos.x : pos.x + off;
        const cy = isLTR ? pos.y + off : pos.y;
        lines.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dotR * 0.75).toFixed(1)}" fill="${color}"/>`);
        lines.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dotR * 0.3).toFixed(1)}" fill="${theme.paper}"/>`);
      }
    } else if (sortedRoutes.length === 1) {
      // Single route — simple punched-out dot
      const color = routeColors?.get(sortedRoutes[0]) || '#999';
      lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${color}"/>`);
      lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${(dotR * 0.35).toFixed(1)}" fill="${theme.paper}"/>`);
    } else {
      // No route — muted dot
      lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${theme.muted || '#999'}"/>`);
      lines.push(`<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${(dotR * 0.35).toFixed(1)}" fill="${theme.paper}"/>`);
    }

    // Card beside station
    const cp = cardPlacements?.get(nd.id);
    if (cp) {
      const { rect } = cp;

      // Card shadow
      lines.push(`<rect x="${(rect.x + 0.8).toFixed(1)}" y="${(rect.y + 1.2).toFixed(1)}" width="${rect.w.toFixed(1)}" height="${rect.h.toFixed(1)}" rx="${cardRadius}" fill="#000" opacity="0.05"/>`);

      // Card body
      lines.push(`<rect x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.w.toFixed(1)}" height="${rect.h.toFixed(1)}" rx="${cardRadius}" fill="${theme.paper}" stroke="${theme.muted || '#d0d0d0'}" stroke-width="${0.6 * s}"/>`);

      // Label
      const labelX = rect.x + cardPadX;
      const labelY = rect.y + cardPadY + fontSize * 0.78;
      lines.push(`<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="${fontSize.toFixed(1)}" fill="${theme.ink}" font-weight="600">${esc(nd.label || nd.id)}</text>`);

      // Metric
      const metricValue = nd.times ?? nd.count;
      if (metricValue !== undefined && metricValue !== null) {
        const metricY = labelY + fsMetric + 2 * s;
        lines.push(`<text x="${labelX.toFixed(1)}" y="${metricY.toFixed(1)}" font-size="${fsMetric.toFixed(1)}" fill="${theme.muted || '#999'}">${esc(String(metricValue))}</text>`);
      }
    }

    lines.push(`</g>`);
  }

  // Title
  const title = options.title || `DAG (${dag.nodes.length} OPS)`;
  lines.push(`<text x="${(10 * s).toFixed(1)}" y="${(16 * s).toFixed(1)}" font-size="${(4.5 * s).toFixed(1)}" fill="${theme.ink}" opacity="0.35" font-weight="300">${esc(title)}</text>`);

  // Legend
  if (routes && routes.length > 0) {
    const legendY = height - 12 * s;
    let legendX = 10 * s;
    for (let ri = 0; ri < Math.min(routes.length, 10); ri++) {
      const route = routes[ri];
      const color = routeColors?.get(ri) || '#999';
      const label = route.id || route.cls || `R${ri}`;
      lines.push(`<line x1="${legendX.toFixed(1)}" y1="${(legendY + 1.5 * s).toFixed(1)}" x2="${(legendX + 10 * s).toFixed(1)}" y2="${(legendY + 1.5 * s).toFixed(1)}" stroke="${color}" stroke-width="${3 * s}" stroke-linecap="round" opacity="0.7"/>`);
      lines.push(`<text x="${(legendX + 13 * s).toFixed(1)}" y="${(legendY + 2.8 * s).toFixed(1)}" font-size="${(fontSize * 0.7).toFixed(1)}" fill="${theme.ink}" opacity="0.5">${esc(label)}</text>`);
      legendX += (label.length * fontSize * 0.4 + 20 * s);
    }
  }

  // Stats
  lines.push(`<text x="${(10 * s).toFixed(1)}" y="${(height - 4 * s).toFixed(1)}" font-size="${(fontSize * 0.6).toFixed(1)}" fill="${theme.muted || '#999'}" opacity="0.35">${dag.nodes.length} ops | ${dag.edges.length} edges | ${routes?.length || 0} routes</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
