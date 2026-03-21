# DAG Visualization Landscape

Research notes on approaches to rendering directed acyclic graphs, with context for dag-map's design choices.

## 1. The challenge of DAG visualization

DAGs sit in an awkward middle ground between trees (which have a single canonical layout) and general graphs (which are genuinely hard). A tree has exactly one path between any two nodes; a general graph can have cycles. A DAG has the directionality constraint of a tree but allows convergence (multiple paths to a single node), which means fan-in and fan-out at different scales.

The standard aesthetic criteria for graph drawing, roughly ordered by importance for DAGs:

- **Crossing minimization.** Edge crossings are the single largest source of visual confusion. NP-hard in general, but heuristics work well for moderate sizes.
- **Edge bends.** Fewer bends = easier to trace. Straight-line edges are ideal but often impossible without crossings.
- **Flow direction.** DAGs have an inherent direction (topological order). Layouts that respect this — left-to-right or top-to-bottom — are immediately more legible.
- **Area efficiency.** Compact layouts let you see more of the graph at once. But too compact and labels collide.
- **Mental map preservation.** For dynamic/streaming DAGs, stable node positions across updates are critical. Moving a node that the user already located destroys spatial memory.

The fundamental tension: information density vs. readability. A compact orthogonal layout packs more nodes per pixel but feels mechanical. An organic force-directed layout reads naturally but wastes space. The transit-map aesthetic — which dag-map pursues — attempts to split this difference.

## 2. Common approaches

### Sugiyama/Layered (dagre, ELK)

The workhorse. Four phases:
1. **Layer assignment** — assign each node to a horizontal (or vertical) layer respecting edge direction
2. **Crossing minimization** — reorder nodes within each layer to minimize edge crossings (barycenter heuristic, median heuristic)
3. **Coordinate assignment** — compute exact x/y positions (Brandes-Köpf, network simplex)
4. **Edge routing** — route edges around nodes (orthogonal, polyline, or spline)

Strengths: predictable, handles large graphs, well-studied. Weaknesses: rigid output, uniform spacing wastes area, edges can feel mechanical. dagre (JavaScript) and ELK (Java/JS) are the standard implementations.

### Force-directed with constraints (Cola.js, d3-force + DAG plugin)

Model nodes as charged particles and edges as springs, then simulate until equilibrium. Add constraints to enforce directionality (e.g., "all edges must point right").

Strengths: organic, aesthetically pleasing for small graphs. Weaknesses: non-deterministic (different runs produce different layouts), slow convergence for large graphs, can produce poor layouts if constraints conflict with the force model. Cola.js adds constraint support to make this practical for DAGs.

### Orthogonal (OGDF)

All edges run at 0 or 90 degrees. Every bend is a right angle. Compact and unambiguous, but visually rigid. Used heavily in circuit diagrams and UML tools. OGDF (C++) is the reference implementation.

### Octilinear/Metro (this library)

Edges restricted to 0, 45, and 90 degrees (or organic variations thereof). The transit-map metaphor: routes are colored lines, nodes are stations, interchanges are emphasized. Fewer aesthetic rules than orthogonal (45-degree diagonals are allowed) but more structure than force-directed.

dag-map extends this by using progressive curves instead of strict angles, creating an organic feel while maintaining the route-based mental model.

## 3. Scale considerations

### Small (< 50 nodes)
Any approach works. Aesthetics matter most — this is where the difference between a dagre layout and a metro-map layout is most visible. Label placement is the main challenge.

### Medium (50-500 nodes)
Layout computation starts to matter. Sugiyama is O(n^2) in practice for crossing minimization. Layout caching becomes important — don't recompute on every frame. Viewport culling (only rendering visible nodes) helps rendering performance. This is dag-map's current sweet spot with the factory DAG (65 nodes).

### Large (500+ nodes)
DOM-based SVG rendering hits its limits around 1000-2000 elements. Solutions:
- **WebGL rendering**: Cytoscape.js, Sigma.js, deck.gl. GPU-accelerated, handles millions of edges.
- **Clustering**: group related nodes, show/hide detail on demand. Compound graphs (nested subgraphs).
- **Semantic zoom**: show labels only at certain zoom levels, simplify edges when zoomed out.
- **Level-of-detail**: render distant nodes as dots, near nodes as full stations.

dag-map does not currently target this scale. The route-based decomposition would need to be paired with clustering to handle graphs beyond a few hundred nodes.

## 4. Dynamic/Streaming DAGs

When the DAG grows during execution (nodes completing, new nodes appearing), the visualization needs to update without disorienting the user.

### Incremental layout
- **DynaDAG** (North, 1995): maintains a layered layout incrementally, inserting/removing nodes without full recomputation. Academic, not widely implemented.
- **Cola.js incremental**: re-runs the force simulation with existing positions as starting state. Nodes drift but don't jump.

### Mental map preservation
The key principle: don't move nodes the user has already located. Strategies:
- **Pin completed nodes**: once a node's position is computed, freeze it. New nodes fill gaps.
- **Append-only layout**: new layers appear at the right edge. The left side never changes.
- **Stable ordering**: maintain the within-layer order across updates, even if crossing-minimization would prefer a different order.

### Animation strategies
- **Fade-in**: new nodes appear with opacity transition
- **Edge growth**: edges extend from source to destination over ~200ms
- **Particle flow**: animated dots along edges to show data/control flow direction (Airflow does this)
- **Pulse on completion**: completed nodes briefly glow or change color

## 5. Domain precedents

### Data pipeline tools
- **Dagster** (asset graph): Sugiyama-based, left-to-right, group-by-repository. Good labeling, mediocre edge routing. Uses dagre internally.
- **Airflow** (task graph): Simple grid layout, sparkline status indicators. Functional but not beautiful.
- **Prefect** (flow graph): Force-directed with constraints. Clean but unstable positioning.
- **dbt** (lineage graph): Sugiyama with column-level lineage overlay. Handles fan-out well.

### Process mining
- **Celonis**: Directly-Follows Graph with a "happy path" slider that progressively reveals less-common paths. Brilliant interaction model.
- **Disco** (Fluxicon): Similar progressive disclosure. Frequency-weighted edge thickness.
- **ProM**: Academic toolkit, every algorithm imaginable. Reference implementation for process mining visualization.

### Supply chain / logistics
- **SAP IBP**: Network visualization with geographic overlay. Interesting hybrid of graph layout and map rendering.
- **Sourcemap**: Supply chain as a geographic network. Sankey-like flow width encoding.

### Blockchain analysis
- **Chainalysis Reactor**: Progressive expansion from a seed address. User-driven layout — drag nodes to arrange, system routes edges. Good example of human-in-the-loop layout.

### CI/CD
- **GitHub Actions**: Simple left-to-right with parallel lanes. The "matrix" visualization (fan-out per platform) is effective for its limited scope.
- **GitLab CI**: Pipeline stages as columns, jobs as rows within stages. Grid layout, not a graph.

## 6. What dag-map does differently

### Route-based decomposition
Instead of treating each edge independently (Sugiyama) or each node as a force particle, dag-map decomposes the DAG into **routes** — sequences of nodes that form execution paths. The trunk (longest path) anchors the layout, and branches diverge from it. This mirrors how humans think about pipelines: as paths through a system, not as collections of edges.

The greedy longest-path algorithm for route extraction is O(V+E) per route, O(V*(V+E)) total. It produces stable, deterministic routes.

### Progressive angular curves
Edges are not straight lines, cubic beziers, or orthogonal bends. They use **progressive piecewise-linear curves** where the angle changes continuously along the edge:
- **Convergence** (returning to trunk): starts flat, steepens toward the destination. Concave profile.
- **Divergence** (departing from trunk): starts steep, flattens toward the destination. Convex profile.

The steepening/flattening is controlled by a power parameter (default 2.2) that distributes horizontal distance unevenly across equal-Y segments.

### Forward-only diagonal rule
All edges proceed left-to-right. There are no backward edges, no upward-only edges, no crossings caused by edge direction reversal. This is guaranteed by the topological layer assignment.

### Interchange-based direction detection
Route segments determine convergence vs. divergence by the **structural role** of their endpoints (fork node = divergence, return node = convergence), not by geometric distance from a reference line. This eliminates misclassification bugs that occur when edges cross the trunk.

### Deterministic per-route variation
Each route gets a slightly different departure/arrival horizontal run length, computed from a hash of the route index and segment index. This creates organic visual variation without randomness — the same DAG always produces the same layout.
