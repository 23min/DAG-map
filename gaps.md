# dag-map — Cross-cutting Gaps

Code review findings that span multiple modules or affect the library as a whole.
Flow-layout-specific issues are tracked separately in `flow-gaps.md`.

## Critical

[x] **~~XSS in SVG rendering~~** — Fixed in `f14f6a5`. Added `esc()` helper to `render.js` and `render-flow-station.js`. All user-supplied strings (labels, titles, subtitles, legend labels, volume badges) are now XML-escaped. 12 tests verify escaping.

## High

[x] **~~SVG attribute injection via unescaped `data-*` attributes~~** — Fixed locally (unreleased). `render.js` now escapes node/edge IDs and class names before writing `data-node-id`, `data-node-cls`, `data-edge-from`, and `data-edge-to`. Added regression test in `test/unit/render.test.mjs`.

[x] **~~Layout engines accept invalid DAGs then fail deep with TypeErrors/NaNs~~** — Fixed locally (unreleased). Added `assertValidDag()` and called it from `layoutMetro`, `layoutHasse`, and `layoutFlow` so invalid input fails early with readable errors. Added validation regression tests.

[x] **~~`layoutFlow` empty `routes` crashes with opaque TypeError~~** — Fixed locally (unreleased). `layoutFlow` now validates `routes` upfront and throws a clear error when empty/missing. Added regression test in `test/unit/edge-cases.test.mjs`.

[x] **~~Triplicated topo sort + graph building~~** — Fixed in `9b59f76`. Extracted `buildGraph()` and `topoSortAndRank()` into `graph-utils.js`. All three engines import from the shared module. 13 tests cover the shared functions.

[x] **~~No unit tests for 9 of 11 modules~~** — Fixed across `7661d28` and `b4e1550`. 213 tests now cover all modules: themes, occupancy, all three routers, layoutMetro, layoutHasse, layoutFlow, renderSVG, render-flow-station, graph-utils, and index.js barrel.

[x] **~~Fragile TTB coordinate swap~~** — Fixed in `749a02e`. Replaced inline regex with `swapPathXY()` in `graph-utils.js`. Handles all SVG commands (M/L/C/Q/S/T/H↔V/Z), throws on arcs. 29 tests. Exported for future layoutFlow LTR support.

## Medium

[x] **~~Flow card sizing/data rendering mismatch~~** — Fixed locally (unreleased). `layoutFlow` card sizing now accounts for `node.times ?? node.count`, and station rendering now preserves numeric `count: 0`. Added regressions in `layout-flow.test.mjs` and `render-flow-station.test.mjs`.

[x] **~~Invalid export name in `index.js:43`~~** — Fixed in `6c94508`. Renamed `dag-map()` to `dagMap()`. Also exported `createStationRenderer` and `createEdgeRenderer` from barrel. 10 tests verify all public exports.

[ ] **SVG width/height may clip content** — All three layout engines compute `width`/`height` from node positions only. Cards, detour paths, edge labels, and legend text can extend beyond node bounds.

[x] **~~Backward-compat constants removed~~** — Fixed in `ff718be`. Removed `C` and `CLASS_COLOR` from `layout-metro.js`. `render.js` now uses `resolveTheme('cream')` as its fallback.

[x] **~~No input validation at API boundaries~~** — Fixed in `de6cba7`. Added `validateDag()` to `graph-utils.js` — checks for duplicate node IDs, unknown edge endpoints, and cycles. Exported from barrel. 7 tests.

[ ] **Inconsistent return shape across layout engines** — Each engine returns a different set of properties. Consider documenting a shared base shape.

## Low

[x] ~~`.DS_Store` files tracked~~ — verified: not tracked.

[ ] **`queue.shift()` as BFS** — O(n) per dequeue in all three engines' topo sorts. Fine for current graph sizes (<100 nodes).

[x] ~~44 versioned test result directories~~ — verified: not tracked.

[ ] **`maxLanes` option partially implemented** — `layout-metro.js` reads `options.maxLanes` but never enforces it as a hard limit.

[ ] **`render.js` legend spacing assumes ≤4 classes** — Legend entries overflow SVG width with 8+ classes.
