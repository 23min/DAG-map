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
- [ ] `maxLanes` enforcement in lane assignment
- [ ] Label collision detection and resolution
- [ ] Incremental layout: add/remove nodes without full recompute
- [ ] Mental map preservation — don't move existing nodes on update
- [ ] Layout caching

### Animation

- [ ] Node state transitions (pending → running → completed) with color animation
- [ ] Running node breathing animation
- [ ] Fade-in for newly added nodes
- [ ] Artifact flow particles along edges
- [ ] Temporal unfolding / replay mode

### Content & Annotation

- [ ] Node content preview (text/JSON snippets inside or beside stations)
- [ ] Edge labels
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
