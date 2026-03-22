# Contributing to dag-map

Contributions are welcome. The scope of this library is **DAG visualization** (metro-map style) and **Hasse diagrams** (partial orders and lattices). Please keep contributions within this scope.

## What fits

- Bug fixes in `layoutMetro`, `layoutHasse`, or `renderSVG`
- New themes or theme improvements
- Layout quality improvements (better routing, crossing reduction, spacing)
- New options for existing layout engines
- New lattice or DAG examples in the demo
- Documentation and README improvements
- Items from the [Planned section of the ROADMAP](ROADMAP.md)

## What doesn't fit (yet)

- New layout engines beyond metro and Hasse
- Framework wrappers (React, Svelte, Vue) — see ROADMAP Someday/Maybe
- Build tooling, bundlers, package registry publishing

## How to contribute

1. Fork the repo and create a branch from `main`
2. Make your changes — no build step required, the library is raw ES modules
3. Test against the demo pages (`demo/dag-map.html`, `demo/hasse.html`) — open directly in a browser, no server needed
4. Open a pull request with a clear description of what and why

## Code style

- Vanilla JS, no dependencies, no transpilation
- ES modules (`import`/`export`) in `src/`
- Keep standalone demos (`demo/*.html`) working as pure `file://` pages
