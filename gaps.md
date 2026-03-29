# dag-map — Cross-cutting Gaps

Code review findings that span multiple modules or affect the library as a whole.
Flow-layout-specific issues are tracked separately in `flow-gaps.md`.

## Critical

- [ ] **XSS in SVG rendering** — Node labels, titles, and subtitles are interpolated raw into SVG markup without XML escaping. A label containing `<`, `>`, `"`, or `&` produces malformed SVG; a crafted label enables script injection in browsers.
  - `src/render.js` lines 89, 91, 222-228 (title, subtitle, node labels)
  - `src/render-flow-station.js` lines 45, 56 (card labels, count/times)
  - Fix: add an `escapeXml(s)` helper (`& → &amp;`, `< → &lt;`, `> → &gt;`, `" → &quot;`) and apply to all user-supplied strings before SVG interpolation.

## High

- [ ] **Triplicated topo sort + graph building** — Adjacency map construction and Kahn's algorithm BFS are copy-pasted across three files:
  - `src/layout-metro.js` lines 81–99
  - `src/layout-hasse.js` lines 22–55 (already factored into `buildGraph` + `topoSortAndRank`)
  - `src/layout-flow.js` lines 43–66
  - Fix: extract `layout-hasse.js`'s factored versions into a shared `graph-utils.js` and import from all three engines.

- [ ] **No unit tests for 9 of 11 modules** — Only `layoutFlow` has tests (visual/structural). Zero coverage for:
  - `layoutMetro`, `layoutHasse` — no regression safety for the two original engines
  - `renderSVG` — no test that output is valid SVG or that labels render
  - `bezierPath`, `angularPath`, `metroPath` — pure functions, ideal for unit tests
  - `OccupancyGrid` — pure class with clear contract
  - `resolveTheme` — trivial but untested merge logic
  - Priority: routers and occupancy grid first (pure, fast, high leverage).

- [ ] **Fragile TTB coordinate swap** — `swapPathCoords` in `layout-metro.js` lines 506–514 uses regex to swap X/Y in SVG path data. Only handles `M`, `L`, `C`, `Q` commands. Lowercase relative commands, `A` (arc), `S`/`T` (smooth curves), and `Z` are silently passed through or mishandled. No test covers this.
  - Risk: any router change that introduces new SVG commands will silently break TTB mode.

## Medium

- [ ] **Invalid export name in `index.js:43`** — `export function dag-map(...)` is a syntax error (hyphen in identifier). Should be `dagMap` to match the README.
  - Also tracked in `flow-gaps.md`. Fix once, remove from both.

- [ ] **SVG width/height may clip content** — All three layout engines compute `width`/`height` from node positions only. Cards (`layout-flow.js` line 849), detour paths, edge labels, and legend text can extend beyond node bounds. The SVG viewBox may clip visual content at the edges.
  - Fix: after all placements, scan occupancy grid / card rects for true extents.

- [ ] **Backward-compat constants should be removed** — `C` and `CLASS_COLOR` in `layout-metro.js` lines 16–18 duplicate the `cream` theme. They're exported from `index.js` and used as a fallback in `render.js:58`. Now that the theme system exists, these should be retired.
  - Remove `C` and `CLASS_COLOR` exports, update `render.js` to use `resolveTheme('cream')` as its fallback.

- [ ] **No input validation at API boundaries** — None of the three layout functions validate inputs:
  - Edges referencing non-existent node IDs → silent undefined lookups
  - Cycles in the DAG → `topo.length < nodes.length`, unreachable nodes get no position
  - Duplicate edges → double-counted routes
  - Fix: after topo sort, check `topo.length === nodes.length` and warn/throw if not. Validate edge endpoints exist in node set.

- [ ] **Inconsistent return shape across layout engines** — Each engine returns a different set of properties:
  - `layoutMetro` → `nodeRoutes`, `segmentRoutes`, no `dotX`, no `cardPlacements`
  - `layoutHasse` → no `nodeRoutes`, no `segmentRoutes`
  - `layoutFlow` → `dotX` (function), `cardPlacements`, `edgeLabelPositions`
  - `renderSVG` handles some of this but custom renderers need to know which engine was used. Consider documenting a shared base shape.

## Low

- [ ] **`.DS_Store` files tracked** — `.gitignore` covers `.DS_Store` but existing files in `test/` and `docs/` are already tracked. Run `git rm --cached` to remove them.

- [ ] **`queue.shift()` as BFS** — O(n) per dequeue in all three engines' topo sorts. Fine for current graph sizes (<100 nodes) but a known anti-pattern. Would matter if graphs grow to 1000+.

- [ ] **44 versioned test result directories** — `test/results/` has v1–v44. `.gitignore` covers `test/results/` so these may be local-only — verify they aren't tracked. If tracked, remove from git history.

- [ ] **`maxLanes` option partially implemented** — `layout-metro.js` line 76 reads `options.maxLanes` and line 317 uses it in the Y-position search loop, but it's never enforced as a hard limit. Documented in ROADMAP as "Someday/Maybe" but accepted as an option today — confusing contract.

- [ ] **`render.js` legend spacing assumes ≤4 classes** — Line 249: `i * 160 * s` spacing. With 8+ classes (e.g. supply_chain_10cls model), legend entries overflow the SVG width. No wrapping logic.
