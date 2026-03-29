# Flow Layout — Known Gaps & Issues

Tracked issues for the `layoutFlow` engine before merging to main.

## Critical

- [ ] **O2C card/line overlap** — `change_order` card overlaps route 1 segment in `o2c_full` model. Card placement only tries 6 positions (right/left + shifted); insufficient for 5+ route nodes. Needs expanded search (quadrant scan, dynamic offset).
  - `src/layout-flow.js` lines 458-517 (`placeCard`)

## High

- [ ] **Short elbows (17 warnings across models)** — V-H-V bends with small horizontal jogs (11-30px) from dense centering shifts. Most visible in event_planning (7), manufacturing (4), hire_to_retire (3). These are acceptable per rule #10 but noisy in validation.
  - Validator threshold (`dotSp * 1.5`) may be too strict
  - Could reduce with wider jog stagger range (currently [0.25, 0.75], could go [0.1, 0.9])

- [ ] **Line crossings in loan_approval** — Routes 1 and 2 jogs cross near y~324. Stagger logic only activates for opposite-direction bends; doesn't check spatial proximity of same-direction routes.
  - `src/layout-flow.js` lines 705-744

## Medium

- [ ] **Public API incomplete** — `createStationRenderer` and `createEdgeRenderer` not exported from `index.js`. Users must deep-import from `src/render-flow-station.js`.

- [ ] **Invalid export name** — tracked in `gaps.md` (cross-cutting). `export function dag-map(...)` → `dagMap`.

- [ ] **Fake hops in airport_luggage** — Route definitions include edges not in the DAG (`scan->carousel`, `load->unload`). Model data issue, but layout should validate route edges against DAG and warn.

- [ ] **Detour distance hardcoded** — Vertical obstacle detour is `15 * s` pixels. Should scale with `columnSpacing` (e.g., `columnSpacing * 0.2`).
  - `src/layout-flow.js` line 593

- [ ] **Character width multipliers hardcoded** — Card sizing uses `0.52` and `0.55` for label/data character widths. Breaks with non-monospace fonts or unusually long labels.
  - `src/layout-flow.js` lines 477, 479

## Low

- [ ] **Archive files** — `archive/layout-process.js`, `archive/flowtime-process.mjs`, `archive/flowtime-process.html` should either be deleted or documented as superseded.

- [ ] **No JSDoc on return value** — `layoutFlow()` returns 17 properties, none documented. Key undocumented: `cardPlacements`, `edgeLabelPositions`, `extraDotPositions`, `dotX` (function), `labelSize`.

- [ ] **Occupancy grid is O(n^2)** — Brute-force AABB overlap checks. Fine for current model sizes (<30 nodes) but will not scale to 100+ nodes without spatial indexing.
  - `src/occupancy.js`

- [ ] **Trunk propagation is forward-only** — Trunk absolute X propagates through nodes in order; doesn't backtrack at merge/fork points. Can cause unnecessary jogs on complex trunk paths.
  - `src/layout-flow.js` lines 389-412

- [ ] **Adaptive spacing coefficients are arbitrary** — Layer gap multiplier uses `benders * 0.25 + mergeFork * 0.15`, capped at 2.0. These were tuned empirically. No way to override.
  - `src/layout-flow.js` line 217

## Test Coverage

- [ ] No tests for disconnected route segments
- [ ] No tests for extreme parameter values (scale <0.5, dotSpacing >50)
- [ ] No tests for label overflow in very narrow cards
- [ ] Validator uses `dotSpacing || 20` (default 20) but layout defaults to 12 — mismatch
