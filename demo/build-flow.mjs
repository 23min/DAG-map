#!/usr/bin/env node
// Builds demo/flow.html — a single file that works from file://
// Uses the same CSS and HTML structure as dag.html and hasse.html.
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function stripModuleSyntax(code) {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '');
}

// Read library + demo CSS
const css = readFileSync(join(root, 'src/dag-map.css'), 'utf-8');
const demoCss = readFileSync(join(root, 'demo/demo.css'), 'utf-8');

// Read and strip module syntax from source files
const themes = stripModuleSyntax(readFileSync(join(root, 'src/themes.js'), 'utf-8'));
const graphUtils = stripModuleSyntax(readFileSync(join(root, 'src/graph-utils.js'), 'utf-8'));
const occupancy = stripModuleSyntax(readFileSync(join(root, 'src/occupancy.js'), 'utf-8'));
const layoutFlow = stripModuleSyntax(readFileSync(join(root, 'src/layout-flow.js'), 'utf-8'));
const render = stripModuleSyntax(readFileSync(join(root, 'src/render.js'), 'utf-8'));
const renderStation = stripModuleSyntax(readFileSync(join(root, 'src/render-flow-station.js'), 'utf-8'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>dag-map — flow layout demo</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
${css}
${demoCss}

/* ── Flow demo: split layout ── */
.dm-split {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.dm-split.dm-ltr {
  flex-direction: column;
}
.dm-graph {
  flex: 1;
  overflow: auto;
  min-width: 0;
}
.dm-split.dm-ltr .dm-graph {
  flex: none;
}
.dm-panels-row {
  display: contents;
}
.dm-split.dm-ltr .dm-panels-row {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.dm-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-left: 1px solid var(--dm-border);
}
.dm-split.dm-ltr .dm-panel {
  border-left: none;
  border-top: 1px solid var(--dm-border);
}
.dm-panel-header {
  padding: 6px 16px;
  font-size: 10px;
  font-family: var(--dm-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dm-muted);
  border-bottom: 1px solid var(--dm-border);
  background: rgba(0,0,0,0.03);
  flex-shrink: 0;
  font-weight: 500;
}
.dm-panel pre {
  flex: 1;
  margin: 0;
  padding: 12px 16px;
  font-family: var(--dm-font);
  font-size: 11px;
  line-height: 1.5;
  color: var(--dm-ink);
  overflow: auto;
  white-space: pre;
  background: transparent;
  border: none;
  border-radius: 0;
}
body.dm-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
</style>
</head>
<body class="dm-container">
<div class="dm-controls">
  <label for="modelSelect">Model:</label>
  <select id="modelSelect"></select>
  <label for="directionSelect">Direction:</label>
  <select id="directionSelect">
    <option value="ttb">Top → Bottom</option>
    <option value="ltr">Left → Right</option>
  </select>
  <label for="themeSelect">Theme:</label>
  <select id="themeSelect">
    <option value="cream">cream</option>
    <option value="dark">dark</option>
    <option value="light">light</option>
    <option value="blueprint">blueprint</option>
    <option value="mono">mono</option>
    <option value="metro">metro</option>
  </select>
  <span class="dm-version">dag-map flow 0.1.0</span>
  <a href="dag.html" class="dm-version" title="DAG metro demo">dag</a>
  <a href="hasse.html" class="dm-version" title="Hasse diagram demo">hasse</a>
  <a href="https://github.com/23min/DAG-map" target="_blank" rel="noopener" class="dm-github" title="View on GitHub">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
</div>
<details class="dm-advanced">
  <summary>advanced</summary>
  <div class="dm-grid">
    <label>scale <input type="range" id="scaleSlider" min="0.5" max="3" step="0.1" value="1.8">
      <span class="dm-val" id="scaleValue">1.8</span></label>
    <label>layer spacing <input type="range" id="layerSpacingSlider" min="20" max="120" step="5" value="50">
      <span class="dm-val" id="layerSpacingValue">50</span></label>
    <label>column spacing <input type="range" id="columnSpacingSlider" min="30" max="160" step="5" value="70">
      <span class="dm-val" id="columnSpacingValue">70</span></label>
    <label>dot spacing <input type="range" id="dotSpacingSlider" min="4" max="30" step="1" value="12">
      <span class="dm-val" id="dotSpacingValue">12</span></label>
    <label>corner radius <input type="range" id="cornerRadiusSlider" min="0" max="20" step="1" value="5">
      <span class="dm-val" id="cornerRadiusValue">5</span></label>
    <label>line thickness <input type="range" id="lineThicknessSlider" min="1" max="8" step="0.5" value="3">
      <span class="dm-val" id="lineThicknessValue">3</span></label>
    <label>label size <input type="range" id="labelSizeSlider" min="2" max="6" step="0.2" value="3.6">
      <span class="dm-val" id="labelSizeValue">3.6</span></label>
  </div>
</details>
<div class="dm-split" id="splitContainer">
  <div class="dm-graph" id="mapContainer"></div>
  <div class="dm-panels-row">
    <div class="dm-panel">
      <div class="dm-panel-header">json</div>
      <pre id="jsonBlock"></pre>
    </div>
    <div class="dm-panel">
      <div class="dm-panel-header">js</div>
      <pre id="jsBlock"></pre>
    </div>
  </div>
</div>
<script>
// ============================================================
// dag-map flow demo — all modules inlined
// ============================================================

// --- themes.js ---
${themes}

// --- graph-utils.js ---
${graphUtils}

// --- occupancy.js ---
${occupancy}

// --- layout-flow.js ---
${layoutFlow}

// --- render.js ---
${render}

// --- render-flow-station.js ---
${renderStation}

// ============================================================
// Model data
// ============================================================

const palette = {
  paper: '#1E1E2E', ink: '#CDD6F4', muted: '#6C7086', border: '#313244',
  classes: {
    a: '#E06C9F', b: '#2B9DB5', c: '#3D5BA9', d: '#94E2D5', e: '#D4944C',
    f: '#A6E3A1', g: '#CBA6F7', h: '#F38BA8', i: '#89B4FA', j: '#FAB387',
  },
};

function mkModel(id, label, subtitle, nodes, edges, routes, opts) {
  // Auto-generate edge volumes from node counts for demo purposes.
  // For each route, each consecutive pair gets a volume derived from
  // the source node's count (if available).
  var edgeVolumes = new Map();
  routes.forEach(function(r, ri) {
    for (var i = 1; i < r.nodes.length; i++) {
      var fromNode = nodes.find(function(n) { return n[0] === r.nodes[i - 1]; });
      var vol = fromNode && fromNode[2] ? fromNode[2] : '';
      if (vol) edgeVolumes.set(ri + ':' + r.nodes[i - 1] + '\\u2192' + r.nodes[i], vol);
    }
  });

  return {
    id, label, subtitle,
    dag: {
      nodes: nodes.map(n => ({ id: n[0], label: n[1], count: n[2] || '' })),
      edges,
    },
    routes: routes.map(r => ({ id: r.id, cls: r.cls, nodes: r.nodes })),
    edgeVolumes,
    theme: { ...palette, classes: Object.fromEntries(routes.map(r => [r.cls, palette.classes[r.cls]])) },
    opts: { scale: 1.8, layerSpacing: 50, columnSpacing: 70, dotSpacing: 12, cornerRadius: 5, lineThickness: 3, labelSize: 3.6, ...opts },
  };
}

const models = [
  mkModel('o2c_full', 'Order-to-Cash', 'Order | Delivery | Invoice | Shipping | Payment', [
    ['create_order', 'Create Sales Order', '1.32M'],
    ['change_order', 'Change Sales Order', '253K'],
    ['gen_delivery', 'Generate Delivery', '1.22M'],
    ['release_delivery', 'Release Delivery', '1.3M'],
    ['pick_goods', 'Pick Goods', '330K'],
    ['ship_goods', 'Ship Goods', '1.29M'],
    ['create_invoice', 'Create Invoice', '1.29M'],
    ['send_invoice', 'Send Invoice', '1.29M'],
    ['receive_confirm', 'Receive Confirmation', '1.29M'],
    ['clear_invoice', 'Clear Invoice', '1.29M'],
    ['delivery_passed', 'Delivery Date Passed', '1.21M'],
    ['record_payment', 'Record Payment', '892K'],
  ], [
    ['create_order','change_order'],['create_order','gen_delivery'],['change_order','gen_delivery'],
    ['gen_delivery','release_delivery'],['release_delivery','pick_goods'],['pick_goods','ship_goods'],
    ['ship_goods','create_invoice'],['ship_goods','receive_confirm'],['create_invoice','send_invoice'],
    ['send_invoice','clear_invoice'],['receive_confirm','delivery_passed'],
    ['clear_invoice','record_payment'],['delivery_passed','record_payment'],
  ], [
    { id: 'order', cls: 'a', nodes: ['create_order','change_order','gen_delivery','release_delivery','pick_goods','ship_goods','create_invoice','send_invoice','clear_invoice','record_payment'] },
    { id: 'delivery', cls: 'b', nodes: ['create_order','gen_delivery','release_delivery','pick_goods','ship_goods','receive_confirm','delivery_passed','record_payment'] },
    { id: 'invoice', cls: 'c', nodes: ['ship_goods','create_invoice','send_invoice','clear_invoice','record_payment'] },
    { id: 'shipping', cls: 'd', nodes: ['release_delivery','pick_goods','ship_goods','receive_confirm'] },
    { id: 'payment', cls: 'e', nodes: ['clear_invoice','record_payment'] },
  ]),
  mkModel('healthcare', 'Healthcare Patient Flow', 'Patient | Doctor | Lab | Radiology | Nursing', [
    ['register', 'Register Patient'],['triage', 'Triage'],['consult', 'Doctor Consult'],
    ['lab', 'Lab Tests'],['imaging', 'Imaging'],['diagnose', 'Diagnosis'],
    ['treat', 'Treatment'],['discharge', 'Discharge'],['followup', 'Follow-up'],
  ], [
    ['register','triage'],['triage','consult'],['consult','lab'],['consult','imaging'],
    ['lab','diagnose'],['imaging','diagnose'],['diagnose','treat'],['treat','discharge'],['discharge','followup'],
  ], [
    { id: 'patient', cls: 'a', nodes: ['register','triage','consult','lab','diagnose','treat','discharge','followup'] },
    { id: 'doctor', cls: 'b', nodes: ['triage','consult','lab','diagnose','treat'] },
    { id: 'lab_tech', cls: 'c', nodes: ['lab','diagnose'] },
    { id: 'radiology', cls: 'd', nodes: ['imaging','diagnose'] },
    { id: 'nursing', cls: 'e', nodes: ['treat','discharge'] },
  ]),
  mkModel('event_planning', 'Event Planning', 'Organizer | Marketing | Venue | Speaker | Attendee', [
    ['concept', 'Event Concept'],['budget', 'Budget'],['venue', 'Book Venue'],
    ['speakers', 'Book Speakers'],['promo', 'Promote'],['tickets', 'Ticket Sales'],
    ['setup', 'Setup'],['event', 'Event Day'],['feedback', 'Feedback'],
  ], [
    ['concept','budget'],['budget','venue'],['budget','speakers'],['venue','promo'],
    ['speakers','promo'],['promo','tickets'],['tickets','setup'],['setup','event'],['event','feedback'],
  ], [
    { id: 'organizer', cls: 'a', nodes: ['concept','budget','venue','promo','tickets','setup','event'] },
    { id: 'marketing', cls: 'b', nodes: ['promo','tickets'] },
    { id: 'venue_mgr', cls: 'c', nodes: ['venue','promo','tickets','setup'] },
    { id: 'speaker', cls: 'd', nodes: ['speakers','promo','tickets','setup','event'] },
    { id: 'attendee', cls: 'e', nodes: ['tickets','setup','event','feedback'] },
  ]),
  mkModel('procurement', 'Procurement', 'Purchasing | Warehouse | Finance', [
    ['req', 'Create Requisition', '45K'],['approve', 'Approve', '42K'],['po', 'Create PO', '40K'],
    ['receive', 'Receive Goods', '38K'],['invoice', 'Match Invoice', '37K'],['pay', 'Payment', '36K'],
  ], [
    ['req','approve'],['approve','po'],['po','receive'],['receive','invoice'],['invoice','pay'],
  ], [
    { id: 'purchasing', cls: 'a', nodes: ['req','approve','po','receive'] },
    { id: 'warehouse', cls: 'b', nodes: ['receive','invoice'] },
    { id: 'finance', cls: 'c', nodes: ['invoice','pay'] },
  ]),
  mkModel('movie_production', 'Movie Production', 'Writer | Director | Producer | VFX | Composer | Distributor', [
    ['script', 'Script'],['cast', 'Casting'],['location', 'Location Scout'],
    ['film', 'Principal Photography'],['vfx', 'VFX'],['edit', 'Editing'],
    ['score', 'Score Music'],['market', 'Marketing'],['release', 'Release'],
  ], [
    ['script','cast'],['script','location'],['cast','film'],['location','film'],
    ['film','vfx'],['film','edit'],['vfx','edit'],['edit','score'],['score','market'],['market','release'],
  ], [
    { id: 'writer', cls: 'a', nodes: ['script'] },
    { id: 'director', cls: 'b', nodes: ['script','cast','film','edit'] },
    { id: 'producer', cls: 'c', nodes: ['cast','film','edit','score','market','release'] },
    { id: 'vfx_studio', cls: 'd', nodes: ['vfx','edit'] },
    { id: 'composer', cls: 'e', nodes: ['score'] },
    { id: 'distributor', cls: 'f', nodes: ['market','release'] },
  ]),
  mkModel('insurance_claim', 'Insurance Claim', 'Claimant | Adjuster | Reject | Repair', [
    ['report', 'Report Claim', '150K'],['assess', 'Assess Damage', '145K'],
    ['approve_claim', 'Approve Claim', '130K'],['reject', 'Reject Claim', '20K'],
    ['repair', 'Arrange Repair', '110K'],['pay', 'Pay Out', '125K'],
  ], [
    ['report','assess'],['assess','approve_claim'],['assess','reject'],
    ['approve_claim','repair'],['approve_claim','pay'],['repair','pay'],
  ], [
    { id: 'claimant', cls: 'a', nodes: ['report','assess','approve_claim','pay'] },
    { id: 'adjuster', cls: 'b', nodes: ['report','assess','approve_claim'] },
    { id: 'reject_flow', cls: 'c', nodes: ['assess','reject'] },
    { id: 'repair_flow', cls: 'd', nodes: ['approve_claim','repair','pay'] },
  ]),
];

// ============================================================
// UI wiring
// ============================================================

const $model = document.getElementById('modelSelect');
const $direction = document.getElementById('directionSelect');
const $theme = document.getElementById('themeSelect');
const $container = document.getElementById('mapContainer');
const $jsBlock = document.getElementById('jsBlock');
const $jsonBlock = document.getElementById('jsonBlock');

// Syntax highlight (matches dag.html style)
function highlight(src) {
  return src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/\\/(.*)/g, '<span style="color:var(--dm-muted)">//$1</span>')
    .replace(/\\b(import|from|const|let|var)\\b/g, '<span style="color:#CF222E">$1</span>')
    .replace(/\\b(layoutFlow|renderSVG|createStationRenderer|createEdgeRenderer)\\b/g, '<span style="color:#8250DF">$1</span>')
    .replace(/\\b(dag|layout|routes|theme|svg)\\b/g, '<span style="color:#953800">$1</span>')
    .replace(/"([^"]+)"\\s*:/g, '<span style="color:#0550AE">"$1"</span>:')
    .replace(/:\\s*"([^"]+)"/g, ': <span style="color:#0A3069">"$1"</span>')
    .replace(/:\\s*(true|false)/g, ': <span style="color:#CF222E">$1</span>')
    .replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span style="color:#0550AE">$1</span>');
}
function highlightJSON(src) {
  return src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)"\\s*:/g, '<span style="color:#0550AE">"$1"</span>:')
    .replace(/:\\s*"([^"]+)"/g, ': <span style="color:#0A3069">"$1"</span>')
    .replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span style="color:#0550AE">$1</span>')
    .replace(/\\[/g, '<span style="color:var(--dm-muted)">[</span>')
    .replace(/\\]/g, '<span style="color:var(--dm-muted)">]</span>');
}

const sliders = {
  scale:         { el: document.getElementById('scaleSlider'),         val: document.getElementById('scaleValue') },
  layerSpacing:  { el: document.getElementById('layerSpacingSlider'),  val: document.getElementById('layerSpacingValue') },
  columnSpacing: { el: document.getElementById('columnSpacingSlider'), val: document.getElementById('columnSpacingValue') },
  dotSpacing:    { el: document.getElementById('dotSpacingSlider'),    val: document.getElementById('dotSpacingValue') },
  cornerRadius:  { el: document.getElementById('cornerRadiusSlider'),  val: document.getElementById('cornerRadiusValue') },
  lineThickness: { el: document.getElementById('lineThicknessSlider'), val: document.getElementById('lineThicknessValue') },
  labelSize:     { el: document.getElementById('labelSizeSlider'),     val: document.getElementById('labelSizeValue') },
};

// Populate model selector
models.forEach((m, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = m.label + ' (' + m.dag.nodes.length + ' nodes, ' + m.routes.length + ' routes)';
  $model.appendChild(opt);
});

function getOpts() {
  const o = {};
  for (const [k, s] of Object.entries(sliders)) o[k] = parseFloat(s.el.value);
  return o;
}

function doRender() {
  const idx = parseInt($model.value, 10);
  const model = models[idx];
  const opts = getOpts();
  const themeName = $theme.value;

  // Update slider value displays
  for (const [k, s] of Object.entries(sliders)) s.val.textContent = s.el.value;

  // Map route class keys (a, b, c...) to colors from the selected theme.
  // The 'dark' theme uses the model's curated palette; other themes derive
  // route colors from their own class palette (cycling through 4 colors).
  const baseTheme = resolveTheme(themeName);
  let routeClassColors;
  if (themeName === 'dark') {
    routeClassColors = model.theme.classes;
  } else {
    const themeColors = Object.values(baseTheme.classes);
    routeClassColors = {};
    model.routes.forEach((r, i) => { routeClassColors[r.cls] = themeColors[i % themeColors.length]; });
  }
  const theme = { ...baseTheme, classes: { ...baseTheme.classes, ...routeClassColors } };

  // Update CSS custom properties so controls, code block, etc. follow the theme
  const root = document.documentElement.style;
  root.setProperty('--dm-paper', theme.paper);
  root.setProperty('--dm-ink', theme.ink);
  root.setProperty('--dm-muted', theme.muted);
  root.setProperty('--dm-border', theme.border);

  try {
    const direction = $direction.value;
    document.getElementById('splitContainer').classList.toggle('dm-ltr', direction === 'ltr');
    const layout = layoutFlow(model.dag, { routes: model.routes, theme, direction, ...opts });
    const renderNode = createStationRenderer(layout, model.routes);
    const renderEdge = createEdgeRenderer(layout, model.edgeVolumes);
    const svg = renderSVG(model.dag, layout, {
      title: model.label,
      subtitle: model.subtitle || '',
      font: "'Inter', 'Segoe UI', system-ui, sans-serif",
      showLegend: false,
      renderNode,
      renderEdge,
    });
    $container.innerHTML = svg;

    // JS panel — the call you'd write
    var jsCode = "import { layoutFlow } from 'dag-map';\\n"
      + "import { renderSVG } from 'dag-map';\\n"
      + "import { createStationRenderer, createEdgeRenderer }\\n"
      + "  from 'dag-map/render-flow-station';\\n\\n"
      + 'const layout = layoutFlow(dag, {\\n'
      + '  routes,\\n'
      + (direction !== 'ttb' ? '  direction: ' + JSON.stringify(direction) + ',\\n' : '')
      + '  theme: ' + JSON.stringify(themeName) + ',\\n'
      + Object.entries(opts).map(([k, v]) => '  ' + k + ': ' + v + ',').join('\\n')
      + '\\n});\\n\\n'
      + 'const renderNode = createStationRenderer(layout, routes);\\n'
      + 'const renderEdge = createEdgeRenderer(layout);\\n'
      + 'const svg = renderSVG(dag, layout, {\\n'
      + '  renderNode,\\n'
      + '  renderEdge,\\n'
      + '  showLegend: false,\\n'
      + '});';
    $jsBlock.innerHTML = highlight(jsCode);

    // JSON panel — the model data
    var jsonData = {
      nodes: model.dag.nodes.map(function(n) { return { id: n.id, label: n.label }; }),
      edges: model.dag.edges,
      routes: model.routes.map(function(r) { return { id: r.id, cls: r.cls, nodes: r.nodes }; }),
    };
    $jsonBlock.innerHTML = highlightJSON(JSON.stringify(jsonData, null, 2));
  } catch (err) {
    $container.innerHTML = '<pre style="color:red;padding:24px">' + err.message + '\\n' + err.stack + '</pre>';
  }
}

function onModelChange() {
  const idx = parseInt($model.value, 10);
  const defaults = models[idx].opts;
  for (const [k, s] of Object.entries(sliders)) {
    if (defaults[k] !== undefined) { s.el.value = defaults[k]; s.val.textContent = defaults[k]; }
  }
  doRender();
}

$model.addEventListener('change', onModelChange);
$direction.addEventListener('change', doRender);
$theme.addEventListener('change', doRender);
for (const s of Object.values(sliders)) s.el.addEventListener('input', doRender);

// Initial render
onModelChange();
</script>
</body>
</html>`;

writeFileSync(join(__dirname, 'flow.html'), html);
console.log(`Built demo/flow.html (${(html.length / 1024).toFixed(0)} KB)`);
