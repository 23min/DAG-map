# Changelog

## v0.3 — Flow Layout (unreleased, feat/flow-layout branch)

### New: `layoutFlow` engine

Process-mining layout where multiple object types (routes) flow through shared activities. Inspired by Celonis Process Explorer.

- **Trunk-first placement** — longest route laid as a straight vertical spine; other routes branch off to the sides
- **Obstacle-aware routing** — occupancy grid prevents lines from crossing cards, dots, and other routes
- **V-H-V paths** — vertical-horizontal-vertical bends with rounded elbows (no diagonals)
- **Adaptive layer spacing** — congested merge/fork zones automatically get up to 2x vertical space
- **Station cards** — punched-out dots on the line, info cards with labels and route indicators
- **Edge labels** — per-route volume badges positioned on vertical runs
- **Extra edges** — DAG edges not covered by any route drawn as dashed gray lines with endpoint dots
- **Global side assignment** — routes consistently stay left or right of the trunk to prevent crossings
- **Staggered jogs** — opposite-direction bends get different Y levels to avoid crossings

### New: `render-flow-station.js`

Reusable renderers for flow layout visuals:
- `createStationRenderer(layout, routes)` — punched-out dots + rich cards
- `createEdgeRenderer(layout, edgeVolumes?)` — route paths + on-line volume badges

### New parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `routes` | `[]` | Object types as `{id, cls, nodes}` |
| `layerSpacing` | `55` | Base vertical gap (adaptive: up to 2x at congested layers) |
| `columnSpacing` | `90` | Horizontal gap between node columns |
| `dotSpacing` | `12` | Gap between parallel route dots at shared stations |
| `cornerRadius` | `5` | V-H-V elbow bend radius |
| `lineThickness` | `3` | Route line width |
| `labelSize` | `3.6` | Station card label font size (scales data text and edge labels) |

### New: Interactive flow demo

- `demo/flow.html` — self-contained demo with 6 sample models (O2C, healthcare, event planning, procurement, movie production, insurance claim)
- Three-column layout: graph | JSON data | JS code
- Theme selector (all 6 themes), parameter sliders, syntax-highlighted code panels
- Cross-linked with dag and hasse demos

### New: LTR direction support

`layoutFlow` now supports `direction: 'ltr'` for left-to-right process flows. Native orientation-aware computation (not a coordinate swap) — H-V-H routing, cards above/below, dots on horizontal lines. Flow demo has a Direction toggle with responsive layout.

### New: `graph-utils.js` shared module

- `buildGraph(nodes, edges)` — adjacency map construction
- `topoSortAndRank(nodes, childrenOf, parentsOf)` — Kahn's algorithm with longest-path ranking
- `validateDag(nodes, edges)` — non-throwing validation (cycles, unknown nodes, duplicates)
- `swapPathXY(d)` — robust SVG path X↔Y swap for all commands (M/L/C/Q/S/T/H↔V/Z)

### New: 253 unit tests + 60 visual tests

Test suite using `node:test` (zero dependencies). Covers all modules: themes, occupancy grid, all three routers, layoutMetro, layoutHasse, layoutFlow, renderSVG, render-flow-station, graph-utils, and index.js barrel. Visual tests run all 30 models in both TTB and LTR via Playwright.

### Fixed

- **XSS in SVG rendering** — all user-supplied strings (labels, titles, subtitles, legend labels, volume badges) are now XML-escaped
- **Invalid export name** — `dag-map()` renamed to `dagMap()`
- **Public API** — `createStationRenderer`, `createEdgeRenderer`, `validateDag`, `swapPathXY` exported from barrel
- **Fragile TTB swap** — replaced regex-only M/L/C/Q handler with full SVG command parser
- **Backward-compat constants** — removed `C` and `CLASS_COLOR`; `render.js` uses `resolveTheme('cream')` fallback
- **Triplicated topo sort** — extracted into shared `graph-utils.js`
- **CSS files** — moved from repo root to `src/`

### Known issues

See `gaps.md` (cross-cutting) and `flow-gaps.md` (flow-layout-specific) for the full tracked issue list. The only error-level issue is the O2C card/line overlap in flow layout.

### Changed

- **`layout.js` renamed to `layout-metro.js`** — consistent naming (`layoutMetro` function in `layout-metro.js`)
- **`layout-snake.js` renamed to `layout-flow.js`** — public API name
- **`render-snake-station.js` renamed to `render-flow-station.js`**
- **`demo.css` font sizes** — updated to 14px controls (matching dag.html)
- **README** — added flow layout section with examples, images, and options table
- **Demo cross-links** — all three demos (dag, hasse, flow) link to each other

### Removed

- `layout-lanes.js` — superseded by layoutFlow
- `dag-map.html` — redirect, replaced by `dag.html`
- `flowtime-preview.mjs/.html/.svg` — layoutMetro styling demos, no longer needed
- `flowtime-pills.mjs/.html` — layoutMetro styling demos, no longer needed
- `flowtime-parallel.mjs/.html` — renamed to flowtime-process, then archived

### Archived

- `layout-process.js` → `archive/` — Celonis-style clustered columns, superseded by layoutFlow

## v0.2 — Hasse & Interop

- Top-to-bottom layout direction (TTB) for metro layout
- Hasse diagram layout engine (`layoutHasse`) — Sugiyama method
- Hasse demo page with 13 example lattices
- Data attributes, custom renderers, font/subtitle options
- Consumer-provided routes with parallel line rendering

## v0.1 — Foundation

- Layout engine: greedy longest-path route decomposition
- Bezier and angular routing
- 6 built-in themes, custom themes, CSS variable mode
- Interactive standalone demo with controls
- Zero dependencies, raw ES modules
