#!/usr/bin/env node
// Builds demo/standalone.html — a single file that works from file://
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function stripModuleSyntax(code) {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '') // remove import lines
    .replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ') // export function → function
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '') // remove export { ... } lines
    .replace(/^export\s+default\s+/gm, ''); // remove export default
}

const css = readFileSync(join(root, 'src/dag-map.css'), 'utf-8');
const demoCss = readFileSync(join(root, 'demo/demo.css'), 'utf-8');
const routeBezier = stripModuleSyntax(readFileSync(join(root, 'src/route-bezier.js'), 'utf-8'));
const routeAngular = stripModuleSyntax(readFileSync(join(root, 'src/route-angular.js'), 'utf-8'));
const themes = stripModuleSyntax(readFileSync(join(root, 'src/themes.js'), 'utf-8'));
const layout = stripModuleSyntax(readFileSync(join(root, 'src/layout.js'), 'utf-8'));
const render = stripModuleSyntax(readFileSync(join(root, 'src/render.js'), 'utf-8'));
const dags = stripModuleSyntax(readFileSync(join(root, 'demo/dags.js'), 'utf-8'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>dag-map — standalone demo</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
${css}
${demoCss}
</style>
</head>
<body class="dm-container">
<div class="dm-controls">
  <label for="dagSelect">DAG:</label>
  <select id="dagSelect">
    <option value="factory">factory</option>
    <option value="data_pipeline">data_pipeline</option>
    <option value="diamond">diamond</option>
    <option value="linear">linear</option>
    <option value="wide_fan">wide_fan</option>
    <option value="pipeline">pipeline</option>
    <option value="deep_tree">deep_tree</option>
    <option value="dense_merge">dense_merge</option>
  </select>
  <label for="routingSelect">Routing:</label>
  <select id="routingSelect">
    <option value="bezier">Bezier (smooth)</option>
    <option value="angular">Angular (progressive)</option>
  </select>
  <label for="themeSelect">Theme:</label>
  <select id="themeSelect">
    <option value="cream">cream</option>
    <option value="light">light</option>
    <option value="dark">dark</option>
    <option value="blueprint">blueprint</option>
    <option value="mono">mono</option>
    <option value="metro">metro</option>
  </select>
  <label class="dm-inline">
    <input type="checkbox" id="diagonalLabels"> diagonal labels
  </label>
  <label class="dm-inline">
    <input type="checkbox" id="cssVars"> CSS vars
  </label>
  <span id="angleControl" class="dm-angle-control">
    <input type="range" id="labelAngle" min="0" max="90" value="45">
    <span id="angleValue" class="dm-val">45\u00B0</span>
  </span>
  <span class="dm-version">dag-map 0.1.0 (standalone)</span>
  <a href="https://github.com/23min/DAG-map" target="_blank" rel="noopener" class="dm-github" title="View on GitHub">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
</div>
<details class="dm-advanced">
  <summary>advanced</summary>
  <div class="dm-grid">
    <label>scale <input type="range" id="scaleSlider" min="0.5" max="3" step="0.1" value="1.5">
      <span class="dm-val" id="scaleValue">1.5</span></label>
    <label>layer spacing <input type="range" id="layerSpacingSlider" min="20" max="60" step="1" value="38">
      <span class="dm-val" id="layerSpacingValue">38</span></label>
    <label>lane spacing <input type="range" id="mainSpacingSlider" min="15" max="60" step="1" value="34">
      <span class="dm-val" id="mainSpacingValue">34</span></label>
    <label>sub-lane spacing <input type="range" id="subSpacingSlider" min="8" max="30" step="1" value="16">
      <span class="dm-val" id="subSpacingValue">16</span></label>
    <label>progressive power <input type="range" id="powerSlider" min="1.0" max="3.5" step="0.1" value="2.2">
      <span class="dm-val" id="powerValue">2.2</span></label>
  </div>
</details>
<div id="mapContainer"></div>
<pre id="optionsBlock" class="dm-code"></pre>
<script>
// ============================================================
// dag-map standalone — all modules inlined
// ============================================================

// --- route-bezier.js ---
${routeBezier}

// --- route-angular.js ---
${routeAngular}

// --- themes.js ---
${themes}

// --- layout.js ---
${layout}

// --- render.js ---
${render}

// --- dags.js ---
${dags}

// --- app ---
function render() {
  var dagName = document.getElementById('dagSelect').value;
  var routing = document.getElementById('routingSelect').value;
  var theme = document.getElementById('themeSelect').value;
  var diagonalLabels = document.getElementById('diagonalLabels').checked;
  var cssVars = document.getElementById('cssVars').checked;
  var labelAngle = parseInt(document.getElementById('labelAngle').value, 10);
  var scale = parseFloat(document.getElementById('scaleSlider').value);
  var layerSpacing = parseInt(document.getElementById('layerSpacingSlider').value, 10);
  var mainSpacing = parseInt(document.getElementById('mainSpacingSlider').value, 10);
  var subSpacing = parseInt(document.getElementById('subSpacingSlider').value, 10);
  var progressivePower = parseFloat(document.getElementById('powerSlider').value);

  // Update value displays
  document.getElementById('scaleValue').textContent = scale;
  document.getElementById('layerSpacingValue').textContent = layerSpacing;
  document.getElementById('mainSpacingValue').textContent = mainSpacing;
  document.getElementById('subSpacingValue').textContent = subSpacing;
  document.getElementById('powerValue').textContent = progressivePower;

  document.getElementById('angleControl').classList.toggle('visible', diagonalLabels);
  document.getElementById('angleValue').textContent = labelAngle + '\u00B0';

  // Update CSS custom properties to match theme
  var resolved = resolveTheme(theme);
  var root = document.documentElement;
  root.style.setProperty('--dm-paper', resolved.paper);
  root.style.setProperty('--dm-ink', resolved.ink);
  root.style.setProperty('--dm-muted', resolved.muted);
  root.style.setProperty('--dm-border', resolved.border);

  var dag = DAGS[dagName]();
  var title = dagName.toUpperCase().replace(/_/g, ' ') + ' (' + dag.nodes.length + ' OPS)';
  var layoutOpts = { routing: routing, theme: theme, scale: scale, layerSpacing: layerSpacing, mainSpacing: mainSpacing, subSpacing: subSpacing, progressivePower: progressivePower };
  var renderOpts = { title: title, diagonalLabels: diagonalLabels, labelAngle: labelAngle, cssVars: cssVars };
  var layout = layoutMetro(dag, layoutOpts);
  var svg = renderSVG(dag, layout, renderOpts);
  document.getElementById('mapContainer').innerHTML = svg;

  // Build copyable code snippet — only show non-default options
  var lo = {};
  if (routing !== 'bezier') lo.routing = routing;
  if (theme !== 'cream') lo.theme = theme;
  if (scale !== 1.5) lo.scale = scale;
  if (layerSpacing !== 38) lo.layerSpacing = layerSpacing;
  if (mainSpacing !== 34) lo.mainSpacing = mainSpacing;
  if (subSpacing !== 16) lo.subSpacing = subSpacing;
  if (progressivePower !== 2.2) lo.progressivePower = progressivePower;

  var ro = {};
  if (diagonalLabels) ro.diagonalLabels = true;
  if (diagonalLabels && labelAngle !== 45) ro.labelAngle = labelAngle;
  if (cssVars) ro.cssVars = true;

  var loStr = Object.keys(lo).length ? ', ' + JSON.stringify(lo, null, 2) : '';
  var roStr = Object.keys(ro).length ? ', ' + JSON.stringify(ro, null, 2) : '';

  var code = 'const layout = layoutMetro(dag' + loStr + ');\\nconst svg = renderSVG(dag, layout' + roStr + ');';

  // Syntax highlight (GitHub-style)
  function highlight(src) {
    return src
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\\b(const|let|var)\\b/g, '<span style="color:#CF222E">$1</span>')
      .replace(/\\b(layoutMetro|renderSVG)\\b/g, '<span style="color:#8250DF">$1</span>')
      .replace(/\\b(dag|layout|svg)\\b/g, '<span style="color:#953800">$1</span>')
      .replace(/"([^"]+)"\\s*:/g, '<span style="color:#0550AE">"$1"</span>:')
      .replace(/:\\s*"([^"]+)"/g, ': <span style="color:#0A3069">"$1"</span>')
      .replace(/:\\s*(true|false)/g, ': <span style="color:#CF222E">$1</span>')
      .replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span style="color:#0550AE">$1</span>');
  }

  var el = document.getElementById('optionsBlock');
  el.innerHTML = highlight(code);
}
['dagSelect', 'routingSelect', 'themeSelect'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', render);
});
['diagonalLabels', 'cssVars'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', render);
});
['labelAngle', 'scaleSlider', 'layerSpacingSlider', 'mainSpacingSlider', 'subSpacingSlider', 'powerSlider'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', render);
});
render();
</script>
</body>
</html>`;

writeFileSync(join(__dirname, 'dag-map.html'), html);
console.log('Built demo/dag-map.html');
