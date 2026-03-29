#!/usr/bin/env node
// Flow layout demo — obstacle-aware process flow
// Usage: node flow.mjs > flow.html

import { layoutFlow } from '../src/layout-flow.js';
import { renderSVG } from '../src/render.js';

const theme = {
  paper: '#1E1E2E',
  ink: '#CDD6F4',
  muted: '#6C7086',
  border: '#313244',
  classes: {
    order:    '#E06C9F',   // pink/coral
    delivery: '#2B9DB5',   // teal
    invoice:  '#3D5BA9',   // navy
    shipping: '#94E2D5',   // mint
    payment:  '#D4944C',   // amber
  },
};

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

const routes = [
  {
    id: 'order', cls: 'order',
    nodes: ['create_order', 'change_order', 'gen_delivery', 'release_delivery',
            'pick_goods', 'ship_goods', 'create_invoice', 'send_invoice',
            'clear_invoice', 'record_payment'],
  },
  {
    id: 'delivery', cls: 'delivery',
    nodes: ['create_order', 'gen_delivery', 'release_delivery', 'pick_goods',
            'ship_goods', 'receive_confirm', 'delivery_passed', 'record_payment'],
  },
  {
    id: 'invoice', cls: 'invoice',
    nodes: ['ship_goods', 'create_invoice', 'send_invoice', 'clear_invoice', 'record_payment'],
  },
  {
    id: 'shipping', cls: 'shipping',
    nodes: ['release_delivery', 'pick_goods', 'ship_goods', 'receive_confirm'],
  },
  {
    id: 'payment', cls: 'payment',
    nodes: ['clear_invoice', 'delivery_passed', 'record_payment'],
  },
];

// Per-route edge volumes: "routeIndex:from→to" → volume string
const edgeVolumes = new Map([
  // Order (route 0, pink)
  ['0:create_order\u2192change_order', '840K'],
  ['0:change_order\u2192gen_delivery', '229K'],
  ['0:gen_delivery\u2192release_delivery', '1.22M'],
  ['0:release_delivery\u2192pick_goods', '725K'],
  ['0:pick_goods\u2192ship_goods', '672K'],
  ['0:ship_goods\u2192create_invoice', '1.29M'],
  ['0:create_invoice\u2192send_invoice', '1.29M'],
  ['0:send_invoice\u2192clear_invoice', '883K'],
  ['0:clear_invoice\u2192record_payment', '562K'],
  // Delivery (route 1, teal)
  ['1:create_order\u2192gen_delivery', '1.32M'],
  ['1:gen_delivery\u2192release_delivery', '1.15M'],
  ['1:release_delivery\u2192pick_goods', '680K'],
  ['1:pick_goods\u2192ship_goods', '650K'],
  ['1:ship_goods\u2192receive_confirm', '1.08M'],
  ['1:receive_confirm\u2192delivery_passed', '1.12M'],
  ['1:delivery_passed\u2192record_payment', '573K'],
  // Invoice (route 2, navy)
  ['2:ship_goods\u2192create_invoice', '1.18M'],
  ['2:create_invoice\u2192send_invoice', '1.18M'],
  ['2:send_invoice\u2192clear_invoice', '820K'],
  ['2:clear_invoice\u2192record_payment', '510K'],
  // Shipping (route 3, mint)
  ['3:release_delivery\u2192pick_goods', '620K'],
  ['3:pick_goods\u2192ship_goods', '590K'],
  ['3:ship_goods\u2192receive_confirm', '985K'],
  // Payment (route 4, amber)
  ['4:delivery_passed\u2192record_payment', '480K'],
]);

const layout = layoutFlow(dag, {
  routes,
  theme,
  scale: 1.8,
  layerSpacing: 50,
  columnSpacing: 70,
  dotSpacing: 12,
  cornerRadius: 5,
  lineThickness: 3,
});

// Station renderer — uses layout's obstacle-aware card placements
function renderStation(node, pos, ctx) {
  const s = ctx.scale;
  const dotR = 3.2 * s;
  const dSpacing = layout.dotSpacing || 12 * s;
  const fsLabel = 3.6 * s;
  const fsData = 2.8 * s;
  let svg = '';

  const routeIndices = [];
  routes.forEach((route, ri) => {
    if (route.nodes.includes(node.id)) routeIndices.push(ri);
  });
  const n = routeIndices.length;

  const dotPositions = routeIndices.map(ri => layout.dotX(node.id, ri));

  // Punched-out dots ON the line
  routeIndices.forEach((ri, i) => {
    const col = ctx.theme.classes[routes[ri].cls];
    if (!col) return;
    svg += `<circle cx="${dotPositions[i]}" cy="${pos.y}" r="${dotR}" fill="${col}"/>`;
    svg += `<circle cx="${dotPositions[i]}" cy="${pos.y}" r="${dotR * 0.35}" fill="${ctx.theme.paper}"/>`;
  });

  // Card from layout's obstacle-aware placement
  const cp = layout.cardPlacements?.get(node.id);
  if (cp) {
    const { rect, cardPadX, cardPadY } = cp;

    svg += `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${2.5 * s}" `;
    svg += `fill="${ctx.theme.paper}" stroke="${ctx.theme.muted}" stroke-width="${0.7 * s}"/>`;

    const labelY = rect.y + cardPadY + fsLabel * 0.85;
    svg += `<text x="${rect.x + cardPadX}" y="${labelY}" font-size="${fsLabel}" fill="${ctx.theme.ink}" text-anchor="start" font-weight="500">${node.label}</text>`;

    const dataY = labelY + fsData + 3 * s;
    let dx = rect.x + cardPadX;
    routeIndices.forEach(ri => {
      const col = ctx.theme.classes[routes[ri].cls];
      if (!col) return;
      svg += `<rect x="${dx}" y="${dataY - fsData * 0.7}" width="${3.5 * s}" height="${3.5 * s}" rx="${0.5 * s}" fill="${col}"/>`;
      dx += 5 * s;
    });
    if (node.times || node.count) {
      svg += `<text x="${dx + 2 * s}" y="${dataY}" font-size="${fsData}" fill="${ctx.theme.muted}" text-anchor="start">${node.times || node.count}</text>`;
    }
  }

  return svg;
}

// Edge renderer — uses layout's per-route label positions
function renderEdgeWithLabel(edge, segment, ctx) {
  const s = ctx.scale;
  let svg = '';

  svg += `<path d="${segment.d}" stroke="${segment.color}" stroke-width="${segment.thickness}" fill="none" `;
  svg += `stroke-linecap="round" stroke-linejoin="round" opacity="${segment.opacity}"`;
  if (segment.dashed) svg += ` stroke-dasharray="${4 * s},${3 * s}"`;
  svg += `/>`;

  if (!ctx.isExtraEdge && edge && ctx.routeIndex !== undefined) {
    const ri = ctx.routeIndex;
    const routeEdgeKey = `${ri}:${edge.from}\u2192${edge.to}`;
    const vol = edgeVolumes.get(routeEdgeKey);

    if (vol) {
      const labelPos = layout.edgeLabelPositions?.get(routeEdgeKey);
      if (labelPos) {
        const fs = 2.4 * s;
        const tw = vol.length * fs * 0.55 + 3.5 * s;
        const th = fs + 2.5 * s;

        svg += `<rect x="${labelPos.x - tw / 2}" y="${labelPos.y - th / 2}" width="${tw}" height="${th}" rx="${1.5 * s}" `;
        svg += `fill="${ctx.theme.paper}" stroke="${labelPos.color}" stroke-width="${0.5 * s}" opacity="0.9"/>`;
        svg += `<text x="${labelPos.x}" y="${labelPos.y + fs * 0.35}" font-size="${fs}" fill="${labelPos.color}" text-anchor="middle" opacity="0.9">${vol}</text>`;
      }
    }
  }

  return svg;
}

const svg = renderSVG(dag, layout, {
  title: 'Order-to-Cash — Flow Layout',
  subtitle: 'Order (pink) | Delivery (teal) | Invoice (navy) | Shipping (mint) | Payment (amber)',
  font: "'Inter', 'Segoe UI', system-ui, sans-serif",
  showLegend: false,
  renderNode: renderStation,
  renderEdge: renderEdgeWithLabel,
});

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>dag-map flow layout</title>
<style>
  body { margin: 0; background: #1E1E2E; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 95vw; max-height: 95vh; }
</style></head><body>${svg}</body></html>`;

process.stdout.write(html);
