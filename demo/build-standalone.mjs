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
  body { background: #F5F0E8; font-family: 'IBM Plex Mono', 'Courier New', monospace; transition: background 0.2s; }
  svg { display: block; }
  #controls {
    padding: 12px 24px; display: flex; align-items: center; gap: 16px;
    border-bottom: 1px solid #D4CFC7; flex-wrap: wrap;
  }
  #controls label { font-size: 11px; color: #8C8680; letter-spacing: 0.06em; }
  #controls select {
    font-family: inherit; font-size: 11px; padding: 4px 8px;
    border: 1px solid #D4CFC7; background: #F5F0E8; color: #2C2C2C; cursor: pointer;
  }
  #versionTag { font-size: 9px; color: #B0A99F; margin-left: auto; }
  #advanced { padding: 8px 24px; font-size: 11px; color: #8C8680; border-bottom: 1px solid #D4CFC7; }
  #advanced summary { cursor: pointer; letter-spacing: 0.06em; padding: 4px 0; font-weight: 500; }
  #advanced .controls-grid {
    display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 0; align-items: center;
  }
  #advanced label { font-size: 10px; color: #8C8680; display: flex; align-items: center; gap: 4px; }
  #advanced input[type="range"] { width: 60px; }
  #advanced span.val { min-width: 24px; font-size: 9px; color: #B0A99F; }
  #optionsBlock {
    margin: 12px 24px; padding: 12px 16px;
    background: rgba(0,0,0,0.03); border: 1px solid #D4CFC7; border-radius: 4px;
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; line-height: 1.5;
    color: #555; white-space: pre; overflow-x: auto; cursor: text;
    user-select: all; -webkit-user-select: all;
  }
</style>
</head>
<body>
<div id="controls">
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
  <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
    <input type="checkbox" id="diagonalLabels"> diagonal labels
  </label>
  <span id="angleControl" style="display:none;align-items:center;gap:4px">
    <input type="range" id="labelAngle" min="0" max="90" value="45" style="width:80px">
    <span id="angleValue" style="font-size:9px;color:#8C8680;min-width:28px">45\u00B0</span>
  </span>
  <span id="versionTag">dag-map 0.1.0 (standalone)</span>
</div>
<details id="advanced">
  <summary>advanced</summary>
  <div class="controls-grid">
    <label>scale <input type="range" id="scaleSlider" min="0.5" max="3" step="0.1" value="1.5">
      <span class="val" id="scaleValue">1.5</span></label>
    <label>layer spacing <input type="range" id="layerSpacingSlider" min="20" max="60" step="1" value="38">
      <span class="val" id="layerSpacingValue">38</span></label>
    <label>lane spacing <input type="range" id="mainSpacingSlider" min="15" max="60" step="1" value="34">
      <span class="val" id="mainSpacingValue">34</span></label>
    <label>sub-lane spacing <input type="range" id="subSpacingSlider" min="8" max="30" step="1" value="16">
      <span class="val" id="subSpacingValue">16</span></label>
    <label>progressive power <input type="range" id="powerSlider" min="1.0" max="3.5" step="0.1" value="2.2">
      <span class="val" id="powerValue">2.2</span></label>
  </div>
</details>
<div id="mapContainer"></div>
<pre id="optionsBlock"></pre>
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

  document.getElementById('angleControl').style.display = diagonalLabels ? 'flex' : 'none';
  document.getElementById('angleValue').textContent = labelAngle + '\u00B0';

  // Update body background to match theme
  var resolved = resolveTheme(theme);
  document.body.style.background = resolved.paper;

  // Update control styling for dark themes
  var controlsEl = document.getElementById('controls');
  controlsEl.style.borderColor = resolved.border;
  controlsEl.querySelectorAll('label').forEach(function(l) { l.style.color = resolved.muted; });
  controlsEl.querySelectorAll('select').forEach(function(sel) {
    sel.style.borderColor = resolved.border;
    sel.style.background = resolved.paper;
    sel.style.color = resolved.ink;
  });
  document.getElementById('versionTag').style.color = resolved.muted;
  var advEl = document.getElementById('advanced');
  advEl.style.color = resolved.muted;
  advEl.querySelectorAll('label').forEach(function(l) { l.style.color = resolved.muted; });
  advEl.querySelectorAll('span.val').forEach(function(v) { v.style.color = resolved.muted; });

  var dag = DAGS[dagName]();
  var title = dagName.toUpperCase().replace(/_/g, ' ') + ' (' + dag.nodes.length + ' OPS)';
  var layoutOpts = { routing: routing, theme: theme, scale: scale, layerSpacing: layerSpacing, mainSpacing: mainSpacing, subSpacing: subSpacing, progressivePower: progressivePower };
  var renderOpts = { title: title, diagonalLabels: diagonalLabels, labelAngle: labelAngle };
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
  el.style.borderColor = resolved.border;
  el.style.background = resolved.paper === '#FFFFFF' ? '#F5F5F5' : 'rgba(0,0,0,0.05)';
}
['dagSelect', 'routingSelect', 'themeSelect'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', render);
});
['diagonalLabels'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', render);
});
['labelAngle', 'scaleSlider', 'layerSpacingSlider', 'mainSpacingSlider', 'subSpacingSlider', 'powerSlider'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', render);
});
render();
</script>
</body>
</html>`;

writeFileSync(join(__dirname, 'standalone.html'), html);
console.log('Built demo/standalone.html');
