// ================================================================
// render-flow-station.js — Station card + edge label renderers
// ================================================================
// Reusable renderers for the flow layout's Celonis-style visuals:
// punched-out dots on the line, rich cards to the side, on-line badges.

/** Escape user-supplied strings for safe SVG/XML interpolation. */
function esc(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Create a station (node) renderer for flow layouts.
 * @param {object} layout - result from layoutFlow()
 * @param {Array} routes - route definitions [{id, cls, nodes}]
 * @returns {function} renderNode(node, pos, ctx) => SVG string
 */
export function createStationRenderer(layout, routes) {
  return function renderStation(node, pos, ctx) {
    const s = ctx.scale;
    const dotR = 3.2 * s;
    const fsLabel = layout.labelSize || 3.6 * s;
    const fsData = fsLabel * 0.78;
    const isDim = node.dim === true;
    const dimOp = isDim ? 0.25 : 1;
    let svg = '';

    const routeIndices = [];
    routes.forEach((route, ri) => {
      if (route.nodes.includes(node.id)) routeIndices.push(ri);
    });

    const dotCoords = routeIndices.map(ri =>
      layout.dotPos ? layout.dotPos(node.id, ri) : { x: layout.dotX(node.id, ri), y: pos.y }
    );

    // Punched-out dots ON the line
    routeIndices.forEach((ri, i) => {
      const col = ctx.theme.classes[routes[ri].cls];
      if (!col) return;
      svg += `<circle cx="${dotCoords[i].x}" cy="${dotCoords[i].y}" r="${dotR}" fill="${col}"${isDim ? ` opacity="${dimOp}"` : ''}/>`;
      svg += `<circle cx="${dotCoords[i].x}" cy="${dotCoords[i].y}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"${isDim ? ` opacity="${dimOp}"` : ''}/>`;
    });

    // Card from layout's obstacle-aware placement
    const cp = layout.cardPlacements?.get(node.id);
    if (cp) {
      const { rect, cardPadX, cardPadY } = cp;

      svg += `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${2.5 * s}" `;
      svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.muted}" stroke-width="${0.7 * s}"${isDim ? ` opacity="${dimOp}"` : ''}/>`;

      const labelY = rect.y + cardPadY + fsLabel * 0.85;
      svg += `<text x="${rect.x + cardPadX}" y="${labelY}" font-size="${fsLabel}" fill="${ctx.theme.ink}" text-anchor="start" font-weight="500"${isDim ? ` opacity="${dimOp * 0.8}"` : ''}>${esc(node.label)}</text>`;

      const dataY = labelY + fsData + 3 * s;
      let dx = rect.x + cardPadX;
      routeIndices.forEach(ri => {
        const col = ctx.theme.classes[routes[ri].cls];
        if (!col) return;
        svg += `<rect x="${dx}" y="${dataY - fsData * 0.7}" width="${3.5 * s}" height="${3.5 * s}" rx="${0.5 * s}" fill="${col}"${isDim ? ` opacity="${dimOp}"` : ''}/>`;
        dx += 5 * s;
      });
      const metricValue = node.times ?? node.count;
      if (metricValue !== undefined && metricValue !== null) {
        svg += `<text x="${dx + 2 * s}" y="${dataY}" font-size="${fsData}" fill="${ctx.theme.muted}" text-anchor="start"${isDim ? ` opacity="${dimOp * 0.8}"` : ''}>${esc(String(metricValue))}</text>`;
      }
    }

    return svg;
  };
}

/**
 * Create an edge renderer that draws route paths + on-line volume badges.
 * @param {object} layout - result from layoutFlow()
 * @param {Map<string,string>} [edgeVolumes] - per-route volumes: "ri:from→to" → label
 * @returns {function} renderEdge(edge, segment, ctx) => SVG string
 */
export function createEdgeRenderer(layout, edgeVolumes) {
  return function renderEdge(edge, segment, ctx) {
    const s = ctx.scale;
    let svg = '';

    svg += `<path d="${segment.d}" stroke="${segment.color}" stroke-width="${segment.thickness}" fill="none" `;
    svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${segment.opacity}"`;
    if (segment.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
    svg += `/>`;

    // Extra edges: draw station-sized dots at start and end
    if (ctx.isExtraEdge && layout.extraDotPositions) {
      // Find matching extra edge positions
      for (const [key, pos] of layout.extraDotPositions) {
        // Match by checking if this segment's path starts at the expected position
        const startM = segment.d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        if (!startM) continue;
        const mx = parseFloat(startM[1]), my = parseFloat(startM[2]);
        if (Math.abs(mx - pos.fromX) < 1 && Math.abs(my - pos.fromY) < 1) {
          const dotR = 3.2 * s;
          // Punched-out dots matching route station style, but in muted color
          svg += `<circle cx="${pos.fromX}" cy="${pos.fromY}" r="${dotR}" fill="${ctx.theme.muted}"/>`;
          svg += `<circle cx="${pos.fromX}" cy="${pos.fromY}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;
          svg += `<circle cx="${pos.toX}" cy="${pos.toY}" r="${dotR}" fill="${ctx.theme.muted}"/>`;
          svg += `<circle cx="${pos.toX}" cy="${pos.toY}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;
          break;
        }
      }
    }

    if (edgeVolumes && !ctx.isExtraEdge && edge && ctx.routeIndex !== undefined) {
      const ri = ctx.routeIndex;
      const routeEdgeKey = `${ri}:${edge.from}\u2192${edge.to}`;
      const vol = edgeVolumes.get(routeEdgeKey);

      if (vol) {
        const labelPos = layout.edgeLabelPositions?.get(routeEdgeKey);
        if (labelPos) {
          const fs = (layout.labelSize || 3.6 * s) * 0.67;
          const tw = vol.length * fs * 0.55 + 3.5 * s;
          const th = fs + 2.5 * s;

          svg += `<rect x="${labelPos.x - tw / 2}" y="${labelPos.y - th / 2}" width="${tw}" height="${th}" rx="${1.5 * s}" `;
          svg += `fill="${ctx.theme.paper}" stroke="${labelPos.color}" stroke-width="${0.5 * s}" opacity="0.9"/>`;
          svg += `<text x="${labelPos.x}" y="${labelPos.y + fs * 0.35}" font-size="${fs}" fill="${labelPos.color}" text-anchor="middle" opacity="0.9">${esc(vol)}</text>`;
        }
      }
    }

    return svg;
  };
}
