#!/usr/bin/env node
// FlowTime process layout demo — Celonis-style clustered columns
// Usage: node flowtime-process.mjs > flowtime-process.html

import { layoutProcess } from '../src/layout-process.js';
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
    { id: 'create_order',    label: 'Create Sales Order',    count: '1.32M', times: '1.32M Times' },
    { id: 'change_order',    label: 'Change Sales Order',    count: '253K',  times: '27.7K Times' },
    { id: 'gen_delivery',    label: 'Generate Delivery',     count: '1.22M', times: '1.2M Times' },
    { id: 'release_delivery', label: 'Release Delivery',     count: '1.3M',  times: '1.3M Times' },
    { id: 'pick_goods',      label: 'Pick Goods',            count: '330K',  times: '330K Times' },
    { id: 'ship_goods',      label: 'Ship Goods',            count: '1.29M', times: '1.29M Times' },
    { id: 'create_invoice',  label: 'Create Invoice',        count: '1.29M', times: '1.29M Times' },
    { id: 'send_invoice',    label: 'Send Invoice',          count: '1.29M', times: '1.29M Times' },
    { id: 'receive_confirm', label: 'Receive Confirmation',  count: '1.29M', times: '1M Times' },
    { id: 'clear_invoice',   label: 'Clear Invoice',         count: '1.29M', times: '1.29M Times' },
    { id: 'delivery_passed', label: 'Delivery Date Passed',  count: '1.21M', times: '1.21M Times' },
    { id: 'record_payment',  label: 'Record Payment',        count: '892K',  times: '892K Times' },
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

// Edge volume data (would come from FlowTime metrics in production)
const edgeVolumes = new Map([
  ['create_order\u2192change_order', '840K'],
  ['create_order\u2192gen_delivery', '1.32M'],
  ['change_order\u2192gen_delivery', '229K'],
  ['gen_delivery\u2192release_delivery', '1.22M'],
  ['release_delivery\u2192pick_goods', '725K'],
  ['pick_goods\u2192ship_goods', '672K'],
  ['ship_goods\u2192create_invoice', '1.29M'],
  ['ship_goods\u2192receive_confirm', '1.08M'],
  ['create_invoice\u2192send_invoice', '1.29M'],
  ['send_invoice\u2192clear_invoice', '883K'],
  ['receive_confirm\u2192delivery_passed', '1.12M'],
  ['clear_invoice\u2192record_payment', '562K'],
  ['delivery_passed\u2192record_payment', '573K'],
]);

const layout = layoutProcess(dag, {
  routes,
  routing: 'metro',
  theme,
  scale: 1.8,
  layerSpacing: 50,
  columnSpacing: 100,
  dotSpacing: 12,
  cornerRadius: 5,
  lineThickness: 3,
});

// Station renderer — dots ON the line, rich card to the right (Celonis-style)
function renderStation(node, pos, ctx) {
  const s = ctx.scale;
  const dotR = 3.2 * s;
  const dSpacing = layout.dotSpacing || 12 * s;
  const fsLabel = 3.6 * s;
  const fsData = 2.8 * s;
  let svg = '';

  // Get route indices through this node
  const routeIndices = [];
  routes.forEach((route, ri) => {
    if (route.nodes.includes(node.id)) routeIndices.push(ri);
  });
  const n = routeIndices.length;

  // Compute dot positions using GLOBAL slot index
  const dotPositions = routeIndices.map(ri => {
    if (n <= 1) return pos.x;
    const minSlot = routeIndices[0];
    const maxSlot = routeIndices[routeIndices.length - 1];
    const slotCenter = (minSlot + maxSlot) / 2;
    return pos.x + (ri - slotCenter) * dSpacing;
  });

  // Punched-out dots ON the line
  routeIndices.forEach((ri, i) => {
    const col = ctx.theme.classes[routes[ri].cls];
    if (!col) return;
    svg += `<circle cx="${dotPositions[i]}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
    svg += `<circle cx="${dotPositions[i]}" cy="${pos.y}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;
  });

  // Rich card to the right
  const rightmostDot = Math.max(...dotPositions);
  const cardGap = 4 * s;
  const cardPadX = 5 * s;
  const cardPadY = 3 * s;
  const labelW = node.label.length * fsLabel * 0.52;

  // Colored route indicators (small squares) for routes through this node
  const indicatorW = n * 5 * s;
  const dataText = node.count ? `${node.count}` : '';
  const dataW = dataText.length * fsData * 0.55;

  const contentW = Math.max(labelW, indicatorW + dataW + 4 * s);
  const cardW = contentW + cardPadX * 2;
  const cardH = fsLabel + fsData + cardPadY * 2 + 3 * s;
  const cardX = rightmostDot + dotR + cardGap;
  const cardY = pos.y - cardH / 2;

  // Card background
  svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${2.5 * s}" `;
  svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.muted}" stroke-width="${0.7 * s}"/>`;

  // Label (top line)
  const labelY = cardY + cardPadY + fsLabel * 0.85;
  svg += `<text x="${cardX + cardPadX}" y="${labelY}" font-size="${fsLabel}" fill="${ctx.theme.ink}" text-anchor="start" font-weight="500">${node.label}</text>`;

  // Bottom row: colored squares + count
  const dataY = labelY + fsData + 3 * s;
  let dx = cardX + cardPadX;

  // Route color indicators (small filled squares)
  routeIndices.forEach(ri => {
    const col = ctx.theme.classes[routes[ri].cls];
    if (!col) return;
    svg += `<rect x="${dx}" y="${dataY - fsData * 0.7}" width="${3.5 * s}" height="${3.5 * s}" rx="${0.5 * s}" fill="${col}"/>`;
    dx += 5 * s;
  });

  // Count text
  if (dataText) {
    svg += `<text x="${dx + 2 * s}" y="${dataY}" font-size="${fsData}" fill="${ctx.theme.muted}" text-anchor="start">${node.times || dataText}</text>`;
  }

  return svg;
}

// Track which edges have already had their badge rendered
const renderedEdgeBadges = new Set();

// Pre-compute: for each DAG edge, the full vertical run available
// We need this to place badges at the midpoint of the straight segment
const edgeBadgePositions = new Map();

// Edge renderer — draws the path + volume badge (once per DAG edge)
function renderEdgeWithLabel(edge, segment, ctx) {
  const s = ctx.scale;
  let svg = '';

  // Draw the path
  svg += `<path d="${segment.d}" stroke="${segment.color}" stroke-width="${segment.thickness}" fill="none" `;
  svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${segment.opacity}"`;
  if (segment.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
  svg += `/>`;

  // Volume badge — render once per DAG edge (first route to draw it wins)
  if (!ctx.isExtraEdge && edge) {
    const edgeKey = `${edge.from}\u2192${edge.to}`;
    const vol = edgeVolumes.get(edgeKey);

    if (vol && !renderedEdgeBadges.has(edgeKey)) {
      renderedEdgeBadges.add(edgeKey);

      const fromPos = layout.positions.get(edge.from);
      const toPos = layout.positions.get(edge.to);
      if (fromPos && toPos) {
        const pathParts = segment.d.match(/-?[\d.]+/g)?.map(Number);
        const startX = pathParts ? pathParts[0] : fromPos.x;
        const endX = pathParts ? pathParts[pathParts.length - 2] : toPos.x;

        const fs = 2.4 * s;
        const tw = vol.length * fs * 0.55 + 3.5 * s;
        const th = fs + 2.5 * s;

        // Determine badge position:
        // For straight segments: beside the line, midpoint Y
        // For bending segments: beside the longest straight run
        let badgeX, badgeY;

        const isStraight = Math.abs(startX - endX) < 2;
        if (isStraight) {
          // Straight: badge to the left of the line, midpoint Y
          badgeY = (fromPos.y + toPos.y) / 2;
          badgeX = startX - tw / 2 - 3 * s;
        } else {
          // Bending: find which straight run is longer
          // V-H-V: initial vertical = startY to jogY, final vertical = jogY to endY
          // Approximate jogY from midFrac (~50% of gap)
          const jogY = fromPos.y + (toPos.y - fromPos.y) * 0.5;
          const initialRun = Math.abs(jogY - fromPos.y);
          const finalRun = Math.abs(toPos.y - jogY);

          if (initialRun >= finalRun) {
            // Badge on initial vertical run (at startX)
            badgeY = fromPos.y + initialRun * 0.5;
            badgeX = startX - tw / 2 - 3 * s;
          } else {
            // Badge on final vertical run (at endX)
            badgeY = jogY + finalRun * 0.5;
            badgeX = endX - tw / 2 - 3 * s;
          }
        }

        svg += `<rect x="${badgeX - tw / 2}" y="${badgeY - th / 2}" width="${tw}" height="${th}" rx="${1.5 * s}" `;
        svg += `fill="${ctx.theme.paper}" stroke="${segment.color}" stroke-width="${0.5 * s}" opacity="0.9"/>`;
        svg += `<text x="${badgeX}" y="${badgeY + fs * 0.35}" font-size="${fs}" fill="${segment.color}" text-anchor="middle" opacity="0.9">${vol}</text>`;
      }
    }
  }

  return svg;
}

const svg = renderSVG(dag, layout, {
  title: 'Order-to-Cash — 5 Object Types',
  subtitle: 'Order (pink) | Delivery (teal) | Invoice (navy) | Shipping (mint) | Payment (amber)',
  font: "'Inter', 'Segoe UI', system-ui, sans-serif",
  showLegend: false,
  renderNode: renderStation,
  renderEdge: renderEdgeWithLabel,
});

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FlowTime lane layout</title>
<style>
  body { margin: 0; background: #1E1E2E; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 95vw; max-height: 95vh; }
</style></head><body>${svg}</body></html>`;

process.stdout.write(html);
