#!/usr/bin/env node
// FlowTime parallel lines demo — complex order management flow
// Usage: node flowtime-parallel.mjs > flowtime-parallel.html

import { layoutLanes } from '../src/layout-lanes.js';
import { renderSVG } from '../src/render.js';

const theme = {
  paper: '#1E1E2E',
  ink: '#CDD6F4',
  muted: '#6C7086',
  border: '#313244',
  classes: {
    order:    '#E06C9F',   // pink/coral — sales orders
    delivery: '#2B9DB5',   // teal — delivery
    invoice:  '#3D5BA9',   // navy — invoicing
    shipping: '#94E2D5',   // mint — shipping/logistics
    payment:  '#D4944C',   // amber — payment
  },
};

// A complex order management DAG (inspired by Celonis O2C)
const dag = {
  nodes: [
    { id: 'create_order',    label: 'Create Sales Order' },
    { id: 'change_order',    label: 'Change Sales Order' },
    { id: 'gen_delivery',    label: 'Generate Delivery' },
    { id: 'release_delivery', label: 'Release Delivery' },
    { id: 'pick_goods',      label: 'Pick Goods' },
    { id: 'ship_goods',      label: 'Ship Goods' },
    { id: 'create_invoice',  label: 'Create Invoice' },
    { id: 'send_invoice',    label: 'Send Invoice' },
    { id: 'receive_confirm', label: 'Receive Confirmation' },
    { id: 'clear_invoice',   label: 'Clear Invoice' },
    { id: 'delivery_passed', label: 'Delivery Date Passed' },
    { id: 'record_payment',  label: 'Record Payment' },
  ],
  edges: [
    ['create_order', 'change_order'],
    ['create_order', 'gen_delivery'],
    ['change_order', 'gen_delivery'],
    ['gen_delivery', 'release_delivery'],
    ['release_delivery', 'pick_goods'],
    ['pick_goods', 'ship_goods'],
    ['ship_goods', 'create_invoice'],
    ['ship_goods', 'receive_confirm'],
    ['create_invoice', 'send_invoice'],
    ['send_invoice', 'clear_invoice'],
    ['receive_confirm', 'delivery_passed'],
    ['clear_invoice', 'record_payment'],
    ['delivery_passed', 'record_payment'],
  ],
};

// Five entity types flowing through the order process
const routes = [
  {
    id: 'order',
    cls: 'order',
    nodes: ['create_order', 'change_order', 'gen_delivery', 'release_delivery',
            'pick_goods', 'ship_goods', 'create_invoice', 'send_invoice',
            'clear_invoice', 'record_payment'],
  },
  {
    id: 'delivery',
    cls: 'delivery',
    nodes: ['create_order', 'gen_delivery', 'release_delivery', 'pick_goods',
            'ship_goods', 'receive_confirm', 'delivery_passed', 'record_payment'],
  },
  {
    id: 'invoice',
    cls: 'invoice',
    nodes: ['ship_goods', 'create_invoice', 'send_invoice', 'clear_invoice', 'record_payment'],
  },
  {
    id: 'shipping',
    cls: 'shipping',
    nodes: ['release_delivery', 'pick_goods', 'ship_goods', 'receive_confirm'],
  },
  {
    id: 'payment',
    cls: 'payment',
    nodes: ['clear_invoice', 'delivery_passed', 'record_payment'],
  },
];

const LANE_SPACING = 36;

const layout = layoutLanes(dag, {
  routes,
  routing: 'metro',
  theme,
  scale: 1.8,
  layerSpacing: 50,
  laneSpacing: LANE_SPACING,
  cornerRadius: 4,
  lineThickness: 3,
});

// Station renderer — globally consistent dot positions (Celonis-style)
function renderStation(node, pos, ctx) {
  const s = ctx.scale;
  const n = ctx.routeCount;
  const laneX = ctx.laneX;
  const dotR = 3.2 * s;
  const dotGap = LANE_SPACING * 0.35 * s;
  let svg = '';

  // Get route indices through this node, sorted for consistent ordering
  const routeIndices = [];
  routes.forEach((route, ri) => {
    if (route.nodes.includes(node.id)) routeIndices.push(ri);
  });

  if (routeIndices.length > 1 && laneX) {
    // Compute dot positions matching the layout waypoint logic:
    // dots preserve global slot ratios within the station
    const memberLaneXs = routeIndices.map(ri => laneX[ri]);
    const memberCentroid = memberLaneXs.reduce((a, b) => a + b, 0) / memberLaneXs.length;
    const globalSpan = Math.max(...memberLaneXs) - Math.min(...memberLaneXs);
    const memberSpan = (routeIndices.length - 1) * dotGap;
    const scaleFactor = globalSpan > 0 ? memberSpan / globalSpan : 0;

    const dotXs = routeIndices.map(ri => pos.x + (laneX[ri] - memberCentroid) * scaleFactor);
    const minDotX = Math.min(...dotXs);
    const maxDotX = Math.max(...dotXs);

    const padding = dotR + 2 * s;
    const pillW = (maxDotX - minDotX) + padding * 2;
    const pillH = dotR * 2 + 2.5 * s;
    const r = pillH / 2;
    const pillCX = (minDotX + maxDotX) / 2;

    svg += `<rect x="${pillCX - pillW / 2}" y="${pos.y - pillH / 2}" width="${pillW}" height="${pillH}" rx="${r}" `;
    svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.muted}" stroke-width="${1 * s}"/>`;

    routeIndices.forEach((ri, i) => {
      const col = ctx.theme.classes[routes[ri].cls];
      if (!col) return;
      svg += `<circle cx="${dotXs[i]}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
      svg += `<circle cx="${dotXs[i]}" cy="${pos.y}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;
    });

    const fs = 3.6 * s;
    const labelX = pillCX + pillW / 2 + 4 * s;
    svg += `<text x="${labelX}" y="${pos.y + fs * 0.35}" font-size="${fs}" fill="${ctx.theme.ink}" text-anchor="start" opacity="0.7">${node.label}</text>`;
  } else {
    // Single-route: dot at node position
    const routeCls = ctx.routeClasses?.[0];
    const col = routeCls ? ctx.theme.classes[routeCls] : (ctx.color || ctx.theme.ink);
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;

    const fs = 3.6 * s;
    svg += `<text x="${pos.x + dotR + 4 * s}" y="${pos.y + fs * 0.35}" font-size="${fs}" fill="${ctx.theme.ink}" text-anchor="start" opacity="0.7">${node.label}</text>`;
  }

  return svg;
}

const svg = renderSVG(dag, layout, {
  title: 'Order-to-Cash — 5 Object Types',
  subtitle: 'Order (pink) | Delivery (teal) | Invoice (navy) | Shipping (mint) | Payment (amber)',
  font: "'Inter', 'Segoe UI', system-ui, sans-serif",
  showLegend: false,
  renderNode: renderStation,
});

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FlowTime lane layout</title>
<style>
  body { margin: 0; background: #1E1E2E; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 95vw; max-height: 95vh; }
</style></head><body>${svg}</body></html>`;

process.stdout.write(html);
