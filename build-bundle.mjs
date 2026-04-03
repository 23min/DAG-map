#!/usr/bin/env node
// Builds dag-map-bundle.js — a single IIFE that exposes window.DagMap
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function stripModuleSyntax(code) {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '');
}

const files = [
  'route-bezier.js',
  'route-angular.js',
  'route-metro.js',
  'graph-utils.js',
  'themes.js',
  'color-scales.js',
  'layout-metro.js',
  'layout-hasse.js',
  'occupancy.js',
  'layout-flow.js',
  'render-flow-station.js',
  'render.js',
];
const sources = files.map(f => `// --- ${f} ---\n` + stripModuleSyntax(readFileSync(join(__dirname, 'src', f), 'utf-8')));

const bundle = `// dag-map-bundle.js — auto-generated, do not edit
(function() {
${sources.join('\n\n')}

  window.DagMap = {
    layoutMetro: layoutMetro,
    layoutHasse: layoutHasse,
    layoutFlow: layoutFlow,
    renderSVG: renderSVG,
    resolveTheme: resolveTheme,
    THEMES: THEMES,
    dominantClass: dominantClass,
    validateDag: validateDag,
    swapPathXY: swapPathXY,
    colorScales: colorScales,
    createStationRenderer: createStationRenderer,
    createEdgeRenderer: createEdgeRenderer,
  };
})();
`;

const outPath = process.argv[2] || join(__dirname, 'dist', 'dag-map-bundle.js');

// Ensure output directory exists
const outDir = dirname(outPath);
mkdirSync(outDir, { recursive: true });

writeFileSync(outPath, bundle);
console.log('Built ' + outPath);
