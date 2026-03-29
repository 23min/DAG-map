#!/usr/bin/env node
// ================================================================
// Flow layout visual test suite
// ================================================================
// Generates each model, takes a Playwright screenshot, and runs
// structural validation on the SVG. Results saved to test/results/.
//
// Usage: node test/flow-visual.spec.mjs
//
// Output:
//   test/results/<model-id>.png   — screenshot
//   test/results/report.json      — structural validation results

import { chromium } from 'playwright';
import { layoutFlow } from '../src/layout-flow.js';
import { renderSVG } from '../src/render.js';
import { createStationRenderer, createEdgeRenderer } from '../src/render-flow-station.js';
import { models } from './models.js';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Versioned results: find next version number
const baseResultsDir = join(__dirname, 'results');
function nextVersion() {
  try {
    const entries = readdirSync(baseResultsDir);
    const versions = entries.filter(e => e.startsWith('v')).map(e => parseInt(e.slice(1))).filter(n => !isNaN(n));
    return versions.length > 0 ? Math.max(...versions) + 1 : 1;
  } catch { return 1; }
}
const version = nextVersion();
const resultsDir = join(baseResultsDir, `v${version}`);
mkdirSync(resultsDir, { recursive: true });

// ── Structural validators ──────────────────────────────────────

function validateSVG(svgString, layout, model) {
  const issues = [];

  // 1. No diagonal lines — all L (line-to) segments must be axis-aligned.
  // Track pen position through M, L, and Q commands.
  const pathDRegex = /d="([^"]+)"/g;
  let match;
  while ((match = pathDRegex.exec(svgString)) !== null) {
    const d = match[1];
    let penX = 0, penY = 0;
    // Parse all commands: M x y, L x y, Q cx cy x y
    const cmds = d.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g);
    for (const cmd of cmds) {
      const type = cmd[1];
      if (type === 'M') {
        penX = parseFloat(cmd[2]); penY = parseFloat(cmd[3]);
      } else if (type === 'L') {
        const x = parseFloat(cmd[2]), y = parseFloat(cmd[3]);
        const dx = Math.abs(x - penX), dy = Math.abs(y - penY);
        if (dx > 1 && dy > 1) {
          issues.push({ rule: 'no-diagonal', severity: 'error', detail: `Diagonal L from (${penX.toFixed(0)},${penY.toFixed(0)}) to (${x.toFixed(0)},${y.toFixed(0)})` });
        }
        penX = x; penY = y;
      } else if (type === 'Q') {
        // Q cx cy x y — pen moves to (x, y), the 3rd and 4th numbers
        if (cmd[4] !== undefined) { penX = parseFloat(cmd[4]); penY = parseFloat(cmd[5]); }
        else { penX = parseFloat(cmd[2]); penY = parseFloat(cmd[3]); }
      }
    }
  }

  // 2. Edge labels on their route's line X
  if (layout.edgeLabelPositions) {
    for (const [key, pos] of layout.edgeLabelPositions) {
      const parts = key.split(':');
      if (parts.length !== 2) continue;
      const ri = parseInt(parts[0]);
      const [from] = parts[1].split('\u2192');
      if (isNaN(ri) || !layout.dotX) continue;
      const lineX = layout.dotX(from, ri);
      const toNode = parts[1].split('\u2192')[1];
      const lineXTo = layout.dotX(toNode, ri);
      // Label should be near one of the run X positions
      const distFrom = Math.abs(pos.x - lineX);
      const distTo = Math.abs(pos.x - lineXTo);
      const distMid = Math.abs(pos.x - (lineX + lineXTo) / 2);
      const minDist = Math.min(distFrom, distTo, distMid);
      if (minDist > 2) {
        issues.push({ rule: 'label-on-line', severity: 'warn', detail: `${key}: label at x=${pos.x.toFixed(0)}, nearest line x=${minDist.toFixed(0)}px away` });
      }
    }
  }

  // 3. Fake hops — route segments that aren't DAG edges
  if (model.routes && model.dag.edges) {
    for (const route of model.routes) {
      for (let i = 1; i < route.nodes.length; i++) {
        const f = route.nodes[i - 1], t = route.nodes[i];
        const isEdge = model.dag.edges.some(([a, b]) => a === f && b === t);
        if (!isEdge) {
          issues.push({ rule: 'fake-hop', severity: 'warn', detail: `Route "${route.id}": ${f}→${t} is not a DAG edge` });
        }
      }
    }
  }

  // 4. Cards overlapping route lines — check each card rect against each route path
  if (layout.cardPlacements && layout.routePaths) {
    for (const [nodeId, cp] of layout.cardPlacements) {
      const card = cp.rect;
      // Check against all route segments
      layout.routePaths.forEach((segs, ri) => {
        segs.forEach((seg, si) => {
          // Extract vertical and horizontal runs from the path
          let px = 0, py = 0;
          const cmds = seg.d.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g);
          for (const cmd of cmds) {
            const type = cmd[1];
            let nx, ny;
            if (type === 'M') { nx = parseFloat(cmd[2]); ny = parseFloat(cmd[3]); }
            else if (type === 'L') { nx = parseFloat(cmd[2]); ny = parseFloat(cmd[3]); }
            else if (type === 'Q') {
              nx = cmd[4] !== undefined ? parseFloat(cmd[4]) : parseFloat(cmd[2]);
              ny = cmd[4] !== undefined ? parseFloat(cmd[5]) : parseFloat(cmd[3]);
            }
            if (type === 'L' && nx !== undefined) {
              // Check if this line segment overlaps with the card
              const lx1 = Math.min(px, nx), lx2 = Math.max(px, nx);
              const ly1 = Math.min(py, ny), ly2 = Math.max(py, ny);
              const t = 3; // line half-thickness approx
              const overlapX = lx1 - t < card.x + card.w && lx2 + t > card.x;
              const overlapY = ly1 - t < card.y + card.h && ly2 + t > card.y;
              if (overlapX && overlapY) {
                // Ignore if the card belongs to an endpoint of this segment's route
                const route = model.routes[ri];
                const fromNode = route?.nodes[si], toNode = route?.nodes[si + 1];
                if (nodeId !== fromNode && nodeId !== toNode) {
                  issues.push({ rule: 'card-over-line', severity: 'error',
                    detail: `"${nodeId}" card overlaps route ${ri} seg ${si}` });
                }
              }
            }
            if (nx !== undefined) { px = nx; py = ny; }
          }
        });
      });
    }
  }

  // 5. Same-layer nodes at same position
  if (model.dag.nodes.length > 1) {
    const posArr = [...layout.positions.entries()];
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const [idA, pA] = posArr[i], [idB, pB] = posArr[j];
        if (Math.abs(pA.x - pB.x) < 1 && Math.abs(pA.y - pB.y) < 1) {
          issues.push({ rule: 'same-position', severity: 'error',
            detail: `${idA} and ${idB} at same position (${pA.x.toFixed(0)},${pA.y.toFixed(0)})` });
        }
      }
    }
  }

  // 6. Short elbows — V-H-V bends where horizontal run is very short
  if (layout.routePaths) {
    const dotSp = layout.dotSpacing || 20;
    layout.routePaths.forEach((segs, ri) => {
      segs.forEach((seg, si) => {
        if (!seg.d.includes('Q')) return; // straight, no elbow
        // Extract all coordinates to find horizontal runs
        const nums = seg.d.match(/-?[\d.]+/g)?.map(Number);
        if (!nums || nums.length < 6) return;
        const startX = nums[0], endX = nums[nums.length - 2];
        const dx = Math.abs(endX - startX);
        if (dx > 0.5 && dx < dotSp * 1.5) {
          issues.push({ rule: 'short-elbow', severity: 'warn',
            detail: `Route ${ri} seg ${si}: horizontal jog of ${dx.toFixed(0)}px` });
        }
      });
    });
  }

  // 7. Overlapping route lines — two routes at the same X on the same Y range
  if (layout.routePaths) {
    // Collect vertical runs: [{ri, x, y1, y2}]
    const vertRuns = [];
    layout.routePaths.forEach((segs, ri) => {
      segs.forEach(seg => {
        // Extract start/end of path
        const startM = seg.d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        const nums = seg.d.match(/-?[\d.]+/g)?.map(Number);
        if (!startM || !nums || nums.length < 4) return;
        const sx = nums[0], sy = nums[1];
        const ex = nums[nums.length - 2], ey = nums[nums.length - 1];
        // If start and end share similar X, it's a vertical run (or near-vertical)
        if (Math.abs(sx - ex) < 1 && Math.abs(ey - sy) > 10) {
          vertRuns.push({ ri, x: sx, y1: Math.min(sy, ey), y2: Math.max(sy, ey) });
        }
      });
    });
    // Check pairs for overlap
    for (let i = 0; i < vertRuns.length; i++) {
      for (let j = i + 1; j < vertRuns.length; j++) {
        const a = vertRuns[i], b = vertRuns[j];
        if (a.ri === b.ri) continue; // same route is fine
        const lineThick = (layout.scale || 1.5) * 3; // one line thickness
        if (Math.abs(a.x - b.x) > lineThick) continue; // visually separated
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (overlapY > 20) {
          issues.push({ rule: 'line-overlap', severity: 'error',
            detail: `Route ${a.ri} and ${b.ri} overlap at x≈${a.x.toFixed(0)} for ${overlapY.toFixed(0)}px` });
        }
      }
    }
  }

  // 8. Edge labels too close to stations
  if (layout.edgeLabelPositions && layout.positions) {
    const minLabelGap = 10; // pixels
    for (const [key, labelPos] of layout.edgeLabelPositions) {
      for (const [nodeId, nodePos] of layout.positions) {
        const dy = Math.abs(labelPos.y - nodePos.y);
        const dx = Math.abs(labelPos.x - nodePos.x);
        if (dy < minLabelGap && dx < 30) {
          issues.push({ rule: 'label-near-station', severity: 'warn',
            detail: `Label ${key} is ${dy.toFixed(0)}px from ${nodeId} station` });
        }
      }
    }
  }

  // 9. Line crossings — two route V-H-V horizontal jogs crossing each other
  if (layout.routePaths) {
    // Collect all horizontal jog segments: {ri, y, x1, x2}
    const hJogs = [];
    layout.routePaths.forEach((segs, ri) => {
      segs.forEach(seg => {
        if (!seg.d.includes('Q')) return;
        // Find horizontal segments by looking for consecutive points at same Y
        const nums = seg.d.match(/-?[\d.]+/g)?.map(Number);
        if (!nums || nums.length < 8) return;
        // V-H-V pattern: the middle horizontal run is at the jog Y
        // Approximate by finding the start and end X and the midpoint Y
        const startX = nums[0], startY = nums[1];
        const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
        if (Math.abs(startX - endX) < 1) return; // straight, no jog
        const jogY = startY + (endY - startY) * 0.5; // approximate
        const x1 = Math.min(startX, endX), x2 = Math.max(startX, endX);
        hJogs.push({ ri, y: jogY, x1, x2, startX, endX });
      });
    });
    // Check for crossings: two jogs at similar Y where one goes left→right and the other right→left
    for (let i = 0; i < hJogs.length; i++) {
      for (let j = i + 1; j < hJogs.length; j++) {
        const a = hJogs[i], b = hJogs[j];
        if (a.ri === b.ri) continue;
        if (Math.abs(a.y - b.y) > 30) continue; // different Y range
        // Check if the horizontal spans overlap AND go in opposite directions
        const aDir = Math.sign(a.endX - a.startX);
        const bDir = Math.sign(b.endX - b.startX);
        if (aDir === bDir) continue; // same direction, won't cross
        // Check X span overlap
        if (a.x1 < b.x2 && a.x2 > b.x1) {
          issues.push({ rule: 'line-crossing', severity: 'warn',
            detail: `Route ${a.ri} and ${b.ri} jogs cross near y≈${a.y.toFixed(0)}` });
        }
      }
    }
  }

  // 10. Station dots must be on their route's line
  if (layout.routePaths && layout.dotX) {
    model.routes.forEach((route, ri) => {
      const segs = layout.routePaths[ri];
      if (!segs) return;
      for (let si = 0; si < segs.length; si++) {
        const fromId = route.nodes[si], toId = route.nodes[si + 1];
        if (!fromId || !toId) continue;
        const seg = segs[si];
        // Check that the path starts at fromId's dotX and ends at toId's dotX
        const startM = seg.d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        const nums = seg.d.match(/-?[\d.]+/g)?.map(Number);
        if (!startM || !nums) continue;
        const pathStartX = parseFloat(startM[1]);
        const pathEndX = nums[nums.length - 2];
        const dotStartX = layout.dotX(fromId, ri);
        const dotEndX = layout.dotX(toId, ri);
        if (Math.abs(pathStartX - dotStartX) > 2) {
          issues.push({ rule: 'dot-off-line', severity: 'error',
            detail: `Route ${ri} seg ${si}: start x=${pathStartX.toFixed(0)} but ${fromId} dot at ${dotStartX.toFixed(0)}` });
        }
        if (Math.abs(pathEndX - dotEndX) > 2) {
          issues.push({ rule: 'dot-off-line', severity: 'error',
            detail: `Route ${ri} seg ${si}: end x=${pathEndX.toFixed(0)} but ${toId} dot at ${dotEndX.toFixed(0)}` });
        }
      }
    });
  }

  // Count metrics
  const routeSegments = layout.routePaths ? layout.routePaths.reduce((a, segs) => a + segs.length, 0) : 0;
  const straightCount = layout.routePaths ? layout.routePaths.reduce((a, segs) =>
    a + segs.filter(s => !s.d.includes('Q')).length, 0) : 0;
  const fakeHops = issues.filter(i => i.rule === 'fake-hop').length;
  const cardOverLines = issues.filter(i => i.rule === 'card-over-line').length;
  const lineOverlaps = issues.filter(i => i.rule === 'line-overlap').length;
  const shortElbows = issues.filter(i => i.rule === 'short-elbow').length;

  return {
    passed: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    metrics: {
      totalSegments: routeSegments,
      straightSegments: straightCount,
      bends: routeSegments - straightCount,
      straightRatio: routeSegments > 0 ? (straightCount / routeSegments * 100).toFixed(0) + '%' : 'N/A',
      edgeLabels: layout.edgeLabelPositions?.size || 0,
      fakeHops,
      cardOverLines,
      lineOverlaps,
      shortElbows,
      width: layout.width?.toFixed(0) || 'N/A',
      height: layout.height?.toFixed(0) || 'N/A',
    },
  };
}

// ── Main ────────────────────────────────────────────────────────

async function runModel(model, direction, browser, resultsDir, report) {
  const suffix = direction === 'ltr' ? '-ltr' : '';
  const tag = `${model.id}${suffix}`;
  process.stdout.write(`  ${tag.padEnd(30)}`);

  let layout, svg, validation;
  try {
    layout = layoutFlow(model.dag, { routes: model.routes, theme: model.theme, direction, ...model.opts });

    const renderNode = createStationRenderer(layout, model.routes);
    const renderEdge = createEdgeRenderer(layout, null);
    svg = renderSVG(model.dag, layout, {
      title: `${model.name} (${direction.toUpperCase()})`,
      font: "'Inter', 'Segoe UI', system-ui, sans-serif",
      showLegend: false,
      renderNode,
      renderEdge,
    });
    validation = validateSVG(svg, layout, model);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    report.push({ id: tag, name: model.name, direction, error: err.message });
    return;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body { margin: 0; background: #1E1E2E; display: inline-block; padding: 10px; }</style>
</head><body>${svg}</body></html>`;

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });

  const box = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    if (!svg) return { width: 800, height: 600 };
    return { width: Math.ceil(svg.getBoundingClientRect().width) + 20, height: Math.ceil(svg.getBoundingClientRect().height) + 20 };
  });
  await page.setViewportSize({ width: Math.max(box.width, 400), height: Math.max(box.height, 200) });

  const pngPath = join(resultsDir, `${tag}.png`);
  await page.screenshot({ path: pngPath, fullPage: true });
  await page.close();

  const status = validation.passed ? 'PASS' : 'FAIL';
  const errors = validation.issues.filter(i => i.severity === 'error').length;
  const warns = validation.issues.filter(i => i.severity === 'warn').length;
  const details = [];
  if (validation.metrics.cardOverLines > 0) details.push(`${validation.metrics.cardOverLines} card/line`);
  if (validation.metrics.lineOverlaps > 0) details.push(`${validation.metrics.lineOverlaps} line-overlap`);
  if (validation.metrics.shortElbows > 0) details.push(`${validation.metrics.shortElbows} short-elbow`);
  if (validation.metrics.fakeHops > 0) details.push(`${validation.metrics.fakeHops} fake-hop`);
  const detailStr = details.length > 0 ? `  [${details.join(', ')}]` : '';
  console.log(`${status}  ${validation.metrics.straightRatio} straight  ${errors}E ${warns}W${detailStr}`);

  report.push({
    id: tag,
    name: model.name,
    direction,
    nodes: model.dag.nodes.length,
    edges: model.dag.edges.length,
    routes: model.routes.length,
    validation,
    screenshot: `${tag}.png`,
  });
}

async function main() {
  const directions = ['ttb', 'ltr'];
  console.log(`Running visual tests v${version} for ${models.length} models × ${directions.length} directions...\n`);

  const browser = await chromium.launch();
  const report = [];

  for (const dir of directions) {
    console.log(`  ── ${dir.toUpperCase()} ──`);
    for (const model of models) {
      await runModel(model, dir, browser, resultsDir, report);
    }
    console.log();
  }

  await browser.close();

  const reportPath = join(resultsDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const passed = report.filter(r => r.validation?.passed).length;
  const failed = report.filter(r => r.validation && !r.validation.passed).length;
  const errored = report.filter(r => r.error).length;

  console.log(`${passed} passed, ${failed} failed, ${errored} errors (${directions.length * models.length} total)`);
  console.log(`Screenshots: ${resultsDir}/`);
  console.log(`Report: ${reportPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
