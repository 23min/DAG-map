#!/usr/bin/env node
// FlowTime parallel lines demo — routes = classes
// Usage: node flowtime-parallel.mjs > flowtime-parallel.html

import { layoutMetro } from '../src/layout.js';
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
    id: 'standard',
    cls: 'standard',
    nodes: ['OriginNorth', 'CentralHub', 'HubQueue', 'LineDowntown', 'Downtown'],
  },
  {
    id: 'priority',
    cls: 'priority',
    nodes: ['OriginNorth', 'CentralHub', 'HubQueue', 'LineAirport', 'Airport'],
  },
  {
    id: 'bulk',
    cls: 'bulk',
    nodes: ['OriginSouth', 'CentralHub', 'HubQueue', 'LineIndustrial', 'Industrial'],
  },
];

const layout = layoutMetro(dag, {
  routes,
  routing: 'bezier',
  theme,
  scale: 2.2,
  layerSpacing: 58,
  mainSpacing: 42,
  subSpacing: 26,
  lineGap: 5,
  direction: 'ttb',
});

// Station renderer — adapts pill orientation to layout direction
const isTTB = true;

function renderStation(node, pos, ctx) {
  const s = ctx.scale;
  const n = ctx.routeCount;
  const gap = 5 * s; // must match layout lineGap
  let svg = '';

  if (n > 1) {
    // Interchange: pill perpendicular to flow spanning all tracks
    // LTR: vertical pill. TTB: horizontal pill.
    const span = (n - 1) * gap + 12 * s;
    const thick = 7 * s;
    const pillW = isTTB ? span : thick;
    const pillH = isTTB ? thick : span;
    const r = thick / 2;
    svg += `<rect x="${pos.x - pillW / 2}" y="${pos.y - pillH / 2}" width="${pillW}" height="${pillH}" rx="${r}" `;
    svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.ink}" stroke-width="${1.6 * s}" opacity="0.7"/>`;

    // Colored dots for each route
    const colors = ctx.routeClasses.map(cls => ctx.theme.classes[cls]).filter(Boolean);
    colors.forEach((col, i) => {
      const off = (i - (colors.length - 1) / 2) * gap;
      const cx = isTTB ? pos.x + off : pos.x;
      const cy = isTTB ? pos.y : pos.y + off;
      svg += `<circle cx="${cx}" cy="${cy}" r="${2.2 * s}" fill="${col}" opacity="0.8"/>`;
    });
  } else {
    // Single-route: small circle
    const routeCls = ctx.routeClasses[0];
    const col = routeCls ? ctx.theme.classes[routeCls] : (ctx.color || ctx.theme.ink);
    const r = 3.5 * s;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${ctx.theme.paper}" stroke="${col}" stroke-width="${1.6 * s}"/>`;
  }

  // Label to the right in TTB, below in LTR
  const fs = 4.5 * s;
  if (isTTB) {
    const labelX = pos.x + (n > 1 ? (n - 1) * gap / 2 + 14 * s : 10 * s);
    svg += `<text x="${labelX}" y="${pos.y + fs * 0.35}" font-size="${fs}" fill="${ctx.theme.ink}" text-anchor="start" opacity="0.6">${node.label}</text>`;
  } else {
    const labelY = pos.y + (n > 1 ? (n - 1) * gap / 2 + 14 * s : 12 * s);
    svg += `<text x="${pos.x}" y="${labelY}" font-size="${fs}" fill="${ctx.theme.ink}" text-anchor="middle" opacity="0.6">${node.label}</text>`;
  }

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
