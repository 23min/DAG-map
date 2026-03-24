#!/usr/bin/env node
// FlowTime pill-node demo using renderNode callback
// Usage: node flowtime-pills.mjs > flowtime-pills.html

import { layoutMetro } from '../src/layout.js';
import { renderSVG } from '../src/render.js';

const theme = {
  paper: '#1E1E2E',
  ink: '#CDD6F4',
  muted: '#6C7086',
  border: '#313244',
  classes: {
    source:            '#89B4FA',
    service:           '#94E2D5',
    serviceWithBuffer: '#F38BA8',
    router:            '#CBA6F7',
    dlq:               '#F9E2AF',
    loss:              '#585B70',
  },
};

const dag = {
  nodes: [
    { id: 'OriginNorth', label: 'Origin North', cls: 'source' },
    { id: 'OriginSouth', label: 'Origin South', cls: 'source' },
    { id: 'CentralHub', label: 'Central Hub', cls: 'service' },
    { id: 'HubQueue', label: 'Hub Queue', cls: 'serviceWithBuffer' },
    { id: 'HubLossQueue', label: 'Hub Loss Queue', cls: 'dlq' },
    { id: 'LineAirport', label: 'Line Airport', cls: 'router' },
    { id: 'LineIndustrial', label: 'Line Industrial', cls: 'router' },
    { id: 'LineDowntown', label: 'Line Downtown', cls: 'router' },
    { id: 'Airport', label: 'Airport', cls: 'service' },
    { id: 'Downtown', label: 'Downtown', cls: 'service' },
    { id: 'Industrial', label: 'Industrial', cls: 'service' },
    { id: 'AirportStrandedDlq', label: 'Airport Stranded', cls: 'dlq' },
    { id: 'unmet_south', label: 'unmet south', cls: 'loss' },
    { id: 'unmet_north', label: 'unmet north', cls: 'loss' },
    { id: 'unmet_industrial', label: 'unmet industrial', cls: 'loss' },
    { id: 'unmet_downtown', label: 'unmet downtown', cls: 'loss' },
    { id: 'hub_loss_attrition', label: 'hub loss attrition', cls: 'loss' },
    { id: 'hub_loss_inflow', label: 'hub loss inflow', cls: 'loss' },
    { id: 'hub_queue_attrition', label: 'hub queue attrition', cls: 'loss' },
    { id: 'errors_airport', label: 'errors airport', cls: 'loss' },
    { id: 'airport_dlq_inflow', label: 'dlq inflow', cls: 'loss' },
  ],
  edges: [
    ['OriginNorth', 'CentralHub'],
    ['OriginSouth', 'CentralHub'],
    ['CentralHub', 'HubQueue'],
    ['HubQueue', 'LineAirport'],
    ['HubQueue', 'LineIndustrial'],
    ['HubQueue', 'LineDowntown'],
    ['HubQueue', 'HubLossQueue'],
    ['LineAirport', 'Airport'],
    ['LineIndustrial', 'Industrial'],
    ['LineDowntown', 'Downtown'],
    ['Airport', 'AirportStrandedDlq'],
    ['OriginNorth', 'unmet_north'],
    ['OriginSouth', 'unmet_south'],
    ['CentralHub', 'hub_loss_inflow'],
    ['CentralHub', 'hub_loss_attrition'],
    ['HubQueue', 'hub_queue_attrition'],
    ['HubLossQueue', 'hub_loss_attrition'],
    ['LineAirport', 'errors_airport'],
    ['LineIndustrial', 'unmet_industrial'],
    ['LineDowntown', 'unmet_downtown'],
    ['AirportStrandedDlq', 'airport_dlq_inflow'],
  ],
};

const layout = layoutMetro(dag, {
  routing: 'bezier',
  theme,
  scale: 2.0,
  layerSpacing: 58,
  mainSpacing: 44,
  subSpacing: 26,
});

// Measure approximate text width (monospace assumption)
function textWidth(str, fontSize) {
  return str.length * fontSize * 0.6;
}

function renderPillNode(node, pos, ctx) {
  const s = ctx.scale;
  const color = ctx.color;
  const isLoss = node.cls === 'loss';

  // Pill dimensions based on label + interchange status
  const fontSize = isLoss ? 4.5 * s : 5.2 * s;
  const labelW = textWidth(node.label, fontSize);
  const padX = 6 * s;
  const padY = 3.5 * s;
  const w = Math.max(labelW + padX * 2, (ctx.isInterchange ? 36 : 28) * s);
  const h = (ctx.isInterchange ? 14 : 11) * s;
  const r = h / 2; // fully rounded ends = pill

  const x = pos.x - w / 2;
  const y = pos.y - h / 2;

  let svg = '';

  if (isLoss) {
    // Loss nodes: small, subtle, no fill
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" `;
    svg += `fill="none" stroke="${color}" stroke-width="${0.8 * s}" opacity="0.5"/>`;
    svg += `<text x="${pos.x}" y="${pos.y + fontSize * 0.35}" `;
    svg += `font-size="${fontSize}" fill="${color}" text-anchor="middle" opacity="0.5">${node.label}</text>`;
  } else {
    // Main nodes: filled pill with border
    const fillOpacity = ctx.isInterchange ? 0.2 : 0.1;
    const strokeW = ctx.isInterchange ? 2.2 * s : 1.6 * s;

    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" `;
    svg += `fill="${color}" opacity="${fillOpacity}"/>`;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" `;
    svg += `fill="none" stroke="${color}" stroke-width="${strokeW}"`;
    if (node.cls === 'dlq') svg += ` stroke-dasharray="${3 * s},${2 * s}"`;
    svg += `/>`;

    // Inner dot for interchanges
    if (ctx.isInterchange) {
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${2.5 * s}" fill="${color}" opacity="0.4"/>`;
    }

    svg += `<text x="${pos.x}" y="${pos.y + fontSize * 0.35}" `;
    svg += `font-size="${fontSize}" fill="${ctx.theme.ink}" text-anchor="middle" opacity="0.75">${node.label}</text>`;
  }

  return svg;
}

const svg = renderSVG(dag, layout, {
  title: 'FlowTime — Transit Hub Model',
  subtitle: null,
  font: "'Inter', 'Segoe UI', system-ui, sans-serif",
  showLegend: false,
  renderNode: renderPillNode,
});

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FlowTime dag-map pills</title>
<style>
  body { margin: 0; background: #1E1E2E; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 95vw; max-height: 95vh; }
</style></head><body>${svg}</body></html>`;

process.stdout.write(html);
