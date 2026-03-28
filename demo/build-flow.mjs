#!/usr/bin/env node
// Builds demo/flow.html — a single file that works from file://
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

const themes = stripModuleSyntax(readFileSync(join(root, 'src/themes.js'), 'utf-8'));
const occupancy = stripModuleSyntax(readFileSync(join(root, 'src/occupancy.js'), 'utf-8'));
const layoutFlow = stripModuleSyntax(readFileSync(join(root, 'src/layout-flow.js'), 'utf-8'));
const render = stripModuleSyntax(readFileSync(join(root, 'src/render.js'), 'utf-8'));
const renderStation = stripModuleSyntax(readFileSync(join(root, 'src/render-flow-station.js'), 'utf-8'));
// render.js needs C and CLASS_COLOR from layout-metro.js — extract just those constants
const layoutMetro = readFileSync(join(root, 'src/layout-metro.js'), 'utf-8');
const cBlock = layoutMetro.match(/const C = \{[\s\S]*?\};/)?.[0] || '';
const classColorBlock = layoutMetro.match(/const CLASS_COLOR = \{[\s\S]*?\};/)?.[0] || '';

// Read the existing flow.html and extract HTML (up to <script>) and JS (model data + UI logic)
const flowHtml = readFileSync(join(__dirname, 'flow.html'), 'utf-8');
const htmlPart = flowHtml.substring(0, flowHtml.indexOf('<script'));
const scriptContent = flowHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';
// Extract everything after the imports
const jsAfterImports = scriptContent.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '').trim();

const output = `${htmlPart}<script>
// ============================================================
// dag-map flow demo — all modules inlined
// ============================================================

// --- themes.js ---
${themes}

// --- occupancy.js ---
${occupancy}

// --- layout-metro.js (constants only) ---
${cBlock}
${classColorBlock}

// --- layout-flow.js ---
${layoutFlow}

// --- render.js ---
${render}

// --- render-flow-station.js ---
${renderStation}

// --- model data + UI ---
${jsAfterImports}
</script>
</body>
</html>`;

writeFileSync(join(__dirname, 'flow.html'), output);
console.log(`Built demo/flow.html (${(output.length / 1024).toFixed(0)} KB)`);
