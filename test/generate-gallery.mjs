#!/usr/bin/env node
// Generate an HTML gallery of all test models rendered with layoutFlow.
// Uses the same Celonis-style station cards + edge renderers as the demo.
// Usage: node test/generate-gallery.mjs > test/gallery.html

import { layoutFlow } from '../src/layout-flow.js';
import { renderSVG } from '../src/render.js';
import { createStationRenderer, createEdgeRenderer } from '../src/render-flow-station.js';
import { models } from './models.js';

// Auto-generate per-route edge volumes from model structure
function generateVolumes(model) {
  const vols = new Map();
  const fmtK = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
  const fmtM = n => n >= 1000000 ? (n / 1000000).toFixed(2).replace(/0$/, '').replace(/\.$/, '') + 'M' : fmtK(n);
  model.routes.forEach((route, ri) => {
    // Base volume decays along the route
    const base = 50000 + Math.floor(Math.random() * 950000);
    for (let i = 1; i < route.nodes.length; i++) {
      const from = route.nodes[i - 1], to = route.nodes[i];
      // Only add volume if this is an actual DAG edge
      const isEdge = model.dag.edges.some(([f, t]) => f === from && t === to);
      if (!isEdge) continue;
      const vol = Math.floor(base * (1 - i * 0.05 + Math.random() * 0.1));
      vols.set(`${ri}:${from}\u2192${to}`, fmtM(vol));
    }
  });
  return vols;
}

let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Flow Layout Gallery — ${models.length} models</title>
<style>
  body { margin: 0; background: #1E1E2E; color: #CDD6F4; font-family: 'Inter', system-ui, sans-serif; padding: 20px; }
  h1 { font-size: 24px; opacity: 0.7; margin-bottom: 30px; }
  .model { margin-bottom: 60px; border: 1px solid #313244; border-radius: 12px; padding: 20px; background: #181825; }
  .model h2 { font-size: 16px; margin: 0 0 4px 0; opacity: 0.9; }
  .model .meta { font-size: 12px; color: #6C7086; margin-bottom: 12px; }
  .model svg { max-width: 100%; height: auto; display: block; }
  .error { color: #F38BA8; font-size: 13px; padding: 10px; }
</style></head><body>
<h1>Flow Layout Gallery — ${models.length} models</h1>\n`;

for (const model of models) {
  html += `<div class="model" id="${model.id}">\n`;
  html += `<h2>${model.name}</h2>\n`;

  const nNodes = model.dag.nodes.length;
  const nEdges = model.dag.edges.length;
  const nRoutes = model.routes.length;
  html += `<div class="meta">${nNodes} nodes, ${nEdges} edges, ${nRoutes} route${nRoutes !== 1 ? 's' : ''}</div>\n`;

  try {
    const layout = layoutFlow(model.dag, { routes: model.routes, theme: model.theme, ...model.opts });

    const edgeVolumes = generateVolumes(model);
    const renderNode = createStationRenderer(layout, model.routes);
    const renderEdge = createEdgeRenderer(layout, edgeVolumes);

    const svg = renderSVG(model.dag, layout, {
      title: model.name,
      font: "'Inter', 'Segoe UI', system-ui, sans-serif",
      showLegend: false,
      renderNode,
      renderEdge,
    });

    html += svg + '\n';
  } catch (err) {
    html += `<div class="error">Error: ${err.message}\n${err.stack}</div>\n`;
  }

  html += `</div>\n`;
}

html += `</body></html>`;
process.stdout.write(html);
