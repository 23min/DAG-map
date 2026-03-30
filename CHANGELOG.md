# Changelog

## v0.3 — Flow Layout + Quality (unreleased)

### New: `layoutFlow` engine

Process-mining layout where multiple object types (routes) flow through shared activities. Inspired by Celonis Process Explorer.

- **TTB and LTR directions** — `direction: 'ttb'` (default) or `'ltr'`, natively computed
- **Trunk-first placement** — longest route laid as a straight spine; other routes branch off
- **Obstacle-aware routing** — occupancy grid prevents lines from crossing cards, dots, and other routes
- **Adaptive layer spacing** — congested merge/fork zones automatically get up to 2x space
- **Station cards** — punched-out dots on the line, info cards with labels and route indicators
- **Edge labels** — per-route volume badges on straight runs
- **Extra edges** — DAG edges not covered by any route drawn as dashed gray lines
- **Crossing avoidance** — global side assignment + staggered jog heights

### New: `render-flow-station.js`

- `createStationRenderer(layout, routes)` — punched-out dots + rich cards
- `createEdgeRenderer(layout, edgeVolumes?)` — route paths + volume badges

### New: `graph-utils.js`

Shared graph primitives used by all three layout engines:
- `buildGraph(nodes, edges)` — adjacency map construction
- `topoSortAndRank(nodes, childrenOf, parentsOf)` — Kahn's algorithm with longest-path ranking
- `validateDag(nodes, edges)` — non-throwing validation (cycles, unknown nodes, duplicates)
- `swapPathXY(d)` — SVG path X↔Y coordinate swap (all commands: M/L/C/Q/S/T/H↔V/Z)

### New: `route-metro.js`

Metro-style right-angle routing with rounded quadratic bezier elbows. H-V-H and V-H-V paths.

### New: `occupancy.js`

Spatial occupancy tracker (AABB collision detection) for obstacle-aware placement.

### New: Interactive flow demo

`demo/flow.html` — self-contained demo with 30 models, direction toggle, theme selector, parameter sliders, and syntax-highlighted JS/JSON panels.

### New: Test suite

253 unit tests (`node:test`, zero dependencies) + 60 Playwright visual tests (30 models × TTB + LTR).

### New: Node dimming (`dim` property)

Nodes with `dim: true` are rendered at reduced opacity — useful for showing pending/inactive nodes in execution visualizations or heatmap overlays.

- **Nodes**: circle stroke opacity 0.25, interchange/gate fill opacity reduced proportionally
- **Labels**: opacity reduced to 0.2 (from 0.55)
- **Route segments**: edges touching a dimmed node are reduced to opacity 0.12
- **Extra edges**: cross-route edges touching a dimmed node are reduced to opacity 0.08
- Works with all themes and both layout engines (metro, flow)

### New: `pending` node class

All 6 built-in themes now include a `pending` class color (muted/neutral tones). CSS variable `--dm-cls-pending` added to `dag-map.css`. Useful for visualizing node execution state (pending/running/completed).

### New: `data-id` attribute on station circles

Each station `<circle>` element now carries a `data-id` attribute matching the node ID, enabling DOM queries like `circle[data-id="myNode"]` for click handlers and highlighting. This is in addition to the `data-node-id` on the parent `<g>` group.

### Changed

- **`layout.js` renamed to `layout-metro.js`**
- **`index.js` barrel** — exports `dagMap`, `layoutFlow`, `createStationRenderer`, `createEdgeRenderer`, `validateDag`, `swapPathXY`
- **`render.js`** — XSS escaping on all user-supplied strings; theme-system-only fallback (removed `C`/`CLASS_COLOR` backward-compat constants)
- **`layout-hasse.js`** — uses shared `graph-utils.js` instead of private copies
- **CSS files** — moved to `src/dag-map.css` and `src/hasse.css`

### Known issues

See `gaps.md` and `flow-gaps.md` for tracked issues. The only error-level issue is the O2C card/line overlap in flow layout.

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
