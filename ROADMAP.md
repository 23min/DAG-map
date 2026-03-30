# dag-map Roadmap

## v0.1 — Foundation

- [x] Layout engine: greedy longest-path route decomposition
- [x] Bezier routing (smooth S-curves)
- [x] Angular routing (progressive steepening/flattening)
- [x] Forward-only diagonal rule
- [x] Interchange-based convergence/divergence detection
- [x] 6 built-in themes (cream, light, dark, blueprint, mono, metro)
- [x] Custom themes via JS objects
- [x] CSS variable mode (`cssVars: true`) for CSS-only theming
- [x] Configurable layout parameters (scale, spacing, progressive power)
- [x] Diagonal labels with angle slider
- [x] Station styles (through-hole with interchange dots)
- [x] Legend with configurable labels
- [x] Standalone demo with interactive controls
- [x] Syntax-highlighted copyable code snippet
- [x] CSS file (`dag-map.css`) with custom properties
- [x] Zero dependencies, raw ES modules

## v0.2 — Hasse & Interop

- [x] Top-to-bottom layout direction (TTB) for metro layout (`direction: 'ttb'`)
- [x] Hasse diagram layout engine (`layoutHasse`) — Sugiyama method
- [x] Hasse demo page with 13 example lattices and DAGs
- [x] Callout panel with mathematical context for each lattice

## v0.3 — Flow Layout + Quality

- [x] `layoutFlow` engine — obstacle-aware, trunk-first, TTB + LTR
- [x] Station renderers (`createStationRenderer`, `createEdgeRenderer`)
- [x] `route-metro.js` — right-angle routing with rounded elbows
- [x] `occupancy.js` — AABB collision detection for obstacle-aware placement
- [x] `graph-utils.js` — shared topo sort, `validateDag()`, `swapPathXY()`
- [x] Interactive flow demo with 30 models, direction toggle, theme + parameter controls
- [x] XSS escaping, barrel exports, `dagMap()` convenience function
- [x] 253 unit tests + 60 Playwright visual tests
- [x] Heatmap mode — per-node/edge metric coloring with 3 color scales
- [x] Node dimming (`dim: true`) — configurable opacity for nodes, labels, edges
- [x] `pending` class in all 6 themes + `--dm-cls-pending` CSS variable
- [x] `data-id` attribute on station circles for DOM scripting
- [x] Self-contained heatmap demo with unified navigation
- [ ] Fix O2C card/line overlap (expand card placement search)
- [ ] See `gaps.md` and `flow-gaps.md` for remaining issues

## Vision — Flow visualization toolkit

The library's direction is **visualizing how things flow through systems**: work through processes, data through pipelines, entities through state machines. Each layout answers a different question about the same underlying graph.

### Heatmap mode

Not a new layout — a rendering layer on top of Flow. Color nodes and edges by a metric: throughput time, wait time, frequency, cost. Red = bottleneck, green = smooth. The same graph, but answering "where does it slow down?" instead of "what paths exist?"

- Input: Flow layout + `metrics: Map<nodeId, { value, label }>` + `edgeMetrics`
- Rendering: gradient coloring on existing stations/routes, metric values in cards

### Variant explorer (`layoutVariant`)

Given observed case paths ranked by frequency, show the top N variants as distinct highlighted routes. "42% of orders follow A→B→D→E, 31% follow A→C→D→E." The #1 feature in process mining — shows the happy path vs the messy paths.

- Input: same DAG + `variants: [{ path: [nodeId], count, pct }]`
- Layout: similar to Flow but routes are mined paths, not object types
- Rendering: thickness or opacity proportional to frequency

### Sankey (`layoutSankey`)

Quantitative flow: ribbon widths proportional to volume. Answers "how much goes where?" — the quantitative counterpart to Flow's "which types go where?"

- Input: same DAG + `weight` on edges (or derived from route volumes)
- Layout: nodes are variable-height bars, edges are ribbons
- Rendering: thick colored bands, no station dots

### Funnel (`layoutFunnel`)

Simplified stage-by-stage view: ordered stages with bar heights proportional to volume, dropout shown between stages. Great for dashboards and summaries.

- Input: ordered stages + volumes (or derived from DAG + edge weights)
- Layout: horizontal or vertical bars with connecting flows
- Rendering: bars + dropout annotations + conversion percentages

### Swim lanes (`layoutSwim`)

Activities grouped into horizontal lanes by resource, department, or system. Every lane crossing is a handoff. Answers "who touches this work and how often does it change hands?"

- Input: same DAG + `lane` assignment per node
- Layout: nodes positioned within their lane, edges cross lanes
- Rendering: lane headers, handoff highlights

---

## Planned

- [ ] `edgeDirection` option — `'downward'` vs `'upward'` to prevent "upside-down diagram" confusion
- [ ] `reduceTransitive(dag)` utility — compute transitive reduction
- [ ] `fromDOT(string)` parser — convert Graphviz DOT digraphs to `{nodes, edges}`

- [ ] Click/tap events on stations — callback with node ID
- [ ] Hover tooltips on stations
- [ ] Selected node highlighting (visual state)

## Someday / Maybe

### Layout & Algorithm

- [ ] Trunk selection modes: `'auto'` (weighted), `'longest'`, explicit node list
- [ ] Document shared base return shape for layout engines
- [ ] Label collision detection and resolution
- [ ] Incremental layout: add/remove nodes without full recompute
- [ ] Mental map preservation — don't move existing nodes on update
- [ ] Layout caching
- [ ] Spatial indexing in occupancy grid (quadtree) for 100+ node layouts

### Animation

- [ ] Node state transitions (pending → running → completed) with color animation
- [ ] Running node breathing animation
- [ ] Fade-in for newly added nodes
- [ ] Artifact flow particles along edges
- [ ] Temporal unfolding / replay mode

### Content & Annotation

- [ ] Node content preview (text/JSON snippets inside or beside stations)
- [ ] Annotation layer: leader lines + floating text
- [ ] Phase/region labels (group boundaries)
- [ ] Timing bars on stations (duration encoded as width)
- [ ] Critical path highlighting
- [ ] Happy-path slider (show top N% of paths by execution time)

### Scale

- [ ] Semantic zoom (dot → station → card at different zoom levels)
- [ ] Viewport culling for large DAGs (render only visible nodes)
- [ ] Edge bundling for dense fan-in/fan-out
- [ ] Clustering / collapse (group N parallel ops into one visual node)

### Export

- [ ] Print presets: A3, A2, letter (mm-based viewBox, print-scaled fonts/strokes)
- [ ] Self-contained SVG export (embedded fonts, no CSS var dependencies)
- [ ] PNG export via canvas rasterization
- [ ] PDF export recipe (Playwright-based)

### Styling

- [ ] Station style variants: `'filled'`, `'ring'`, `'card'`
- [ ] Font family option
- [ ] Right-to-left (RTL) layout for Arabic/Hebrew contexts

### Ecosystem

- [ ] Canvas/WebGL renderer for 1000+ node DAGs
- [ ] WASM build of the layout engine
- [ ] Framework adapters (React, Svelte, Vue wrapper components)
- [ ] CLI tool for headless SVG/PDF generation
- [ ] Storybook-style component gallery
