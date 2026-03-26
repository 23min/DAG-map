#!/usr/bin/env node
// FlowTime parallel lines demo — routes = classes
// Usage: node flowtime-parallel.mjs > flowtime-parallel.html

import { layoutMetro } from '../src/layout.js';
import { layoutLanes } from '../src/layout-lanes.js';
import { renderSVG } from '../src/render.js';

const theme = {
  paper: '#1E1E2E',
  ink: '#CDD6F4',
  muted: '#6C7086',
  border: '#313244',
  classes: {
    priority: '#89B4FA',   // blue
    standard: '#94E2D5',   // teal
    bulk:     '#F9E2AF',   // yellow
    loss:     '#585B70',   // muted
  },
};

// The graph — nodes don't need cls when routes define the colors
const dag = {
  nodes: [
    { id: 'OriginNorth', label: 'Origin North' },
    { id: 'OriginSouth', label: 'Origin South' },
    { id: 'CentralHub', label: 'Central Hub' },
    { id: 'HubQueue', label: 'Hub Queue' },
    { id: 'LineAirport', label: 'Line Airport' },
    { id: 'LineIndustrial', label: 'Line Industrial' },
    { id: 'LineDowntown', label: 'Line Downtown' },
    { id: 'Airport', label: 'Airport' },
    { id: 'Downtown', label: 'Downtown' },
    { id: 'Industrial', label: 'Industrial' },
  ],
  edges: [
    ['OriginNorth', 'CentralHub'],
    ['OriginSouth', 'CentralHub'],
    ['CentralHub', 'HubQueue'],
    ['HubQueue', 'LineAirport'],
    ['HubQueue', 'LineIndustrial'],
    ['HubQueue', 'LineDowntown'],
    ['LineAirport', 'Airport'],
    ['LineIndustrial', 'Industrial'],
    ['LineDowntown', 'Downtown'],
  ],
};

// Three flow classes, each as a route through the graph
const routes = [
  {
    id: 'priority',
    cls: 'priority',
    nodes: ['OriginNorth', 'CentralHub', 'HubQueue', 'LineAirport', 'Airport'],
  },
  {
    id: 'standard',
    cls: 'standard',
    nodes: ['OriginNorth', 'CentralHub', 'HubQueue', 'LineDowntown', 'Downtown'],
  },
  {
    id: 'bulk',
    cls: 'bulk',
    nodes: ['OriginSouth', 'CentralHub', 'HubQueue', 'LineIndustrial', 'Industrial'],
  },
];

const LANE_SPACING = 45;

const layout = layoutLanes(dag, {
  routes,
  routing: 'metro',
  theme,
  scale: 2.0,
  layerSpacing: 55,
  laneSpacing: LANE_SPACING,
  cornerRadius: 4,
  lineThickness: 3.5,
});

// Station renderer — Celonis-inspired
function renderStation(node, pos, ctx) {
  const s = ctx.scale;
  const n = ctx.routeCount;
  const laneGap = LANE_SPACING * 0.3 * s; // must match layout-lanes station spread
  let svg = '';

  if (n > 1) {
    // Multi-route station: pill spanning ALL tracks with large colored dots
    const routeList = [...(ctx.routeClasses || [])];
    const dotSpan = (n - 1) * laneGap;
    const dotR = 5 * s;
    const padding = dotR + 3 * s;
    const pillW = dotSpan + padding * 2;
    const pillH = dotR * 2 + 4 * s;
    const r = pillH / 2;

    // Pill background — white fill, covers the tracks
    svg += `<rect x="${pos.x - pillW / 2}" y="${pos.y - pillH / 2}" width="${pillW}" height="${pillH}" rx="${r}" `;
    svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.muted}" stroke-width="${1.5 * s}"/>`;

    // Large colored dots with white center (Celonis punched-out style)
    routeList.forEach((cls, i) => {
      const col = ctx.theme.classes[cls];
      if (!col) return;
      const cx = pos.x + (i - (n - 1) / 2) * laneGap;
      svg += `<circle cx="${cx}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
      svg += `<circle cx="${cx}" cy="${pos.y}" r="${dotR * 0.45}" fill="${ctx.theme.paper}"/>`;
    });
  } else {
    // Single-route station: large filled dot with white center
    const routeCls = ctx.routeClasses?.[0];
    const col = routeCls ? ctx.theme.classes[routeCls] : (ctx.color || ctx.theme.ink);
    const dotR = 5 * s;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${dotR * 0.45}" fill="${ctx.theme.paper}"/>`;
  }

  // Label to the right
  const fs = 4.2 * s;
  const labelX = pos.x + (n > 1 ? (n - 1) * laneGap / 2 + 12 * s : 8 * s);
  svg += `<text x="${labelX}" y="${pos.y + fs * 0.35}" font-size="${fs}" fill="${ctx.theme.ink}" text-anchor="start" opacity="0.7" font-weight="500">${node.label}</text>`;

  return svg;
}

const svg = renderSVG(dag, layout, {
  title: 'FlowTime — Parallel Lines (3 classes)',
  subtitle: 'Blue = priority | Teal = standard | Yellow = bulk',
  font: "'Inter', 'Segoe UI', system-ui, sans-serif",
  showLegend: false,
  renderNode: renderStation,
});

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FlowTime parallel lines</title>
<style>
  body { margin: 0; background: #1E1E2E; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 95vw; max-height: 95vh; }
</style></head><body>${svg}</body></html>`;

process.stdout.write(html);
