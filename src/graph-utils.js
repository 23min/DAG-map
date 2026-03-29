// ================================================================
// graph-utils.js — Shared graph primitives for dag-map layout engines
// ================================================================
// Adjacency map construction and Kahn's algorithm topological sort
// with longest-path rank assignment. Used by all three layout engines.

/**
 * Build adjacency maps from nodes and edges.
 * @param {Array<{id: string}>} nodes
 * @param {Array<[string, string]>} edges
 * @returns {{ nodeMap: Map, childrenOf: Map, parentsOf: Map }}
 */
export function buildGraph(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenOf = new Map();
  const parentsOf = new Map();
  nodes.forEach(n => { childrenOf.set(n.id, []); parentsOf.set(n.id, []); });
  edges.forEach(([f, t], edgeIdx) => {
    const srcChildren = childrenOf.get(f);
    const dstParents = parentsOf.get(t);
    if (!srcChildren || !dstParents) {
      const parts = [];
      if (!srcChildren) parts.push(`source "${f}"`);
      if (!dstParents) parts.push(`target "${t}"`);
      throw new Error(`buildGraph: edge[${edgeIdx}] references unknown ${parts.join(' and ')}`);
    }
    srcChildren.push(t);
    dstParents.push(f);
  });
  return { nodeMap, childrenOf, parentsOf };
}

/**
 * Topological sort via Kahn's algorithm with longest-path rank assignment.
 * @param {Array<{id: string}>} nodes
 * @param {Map} childrenOf
 * @param {Map} parentsOf
 * @returns {{ topo: string[], rank: Map<string, number>, maxRank: number }}
 */
export function topoSortAndRank(nodes, childrenOf, parentsOf) {
  const rank = new Map();
  const inDeg = new Map();
  nodes.forEach(nd => inDeg.set(nd.id, parentsOf.get(nd.id).length));

  const queue = nodes.filter(nd => inDeg.get(nd.id) === 0).map(nd => nd.id);
  queue.forEach(id => rank.set(id, 0));

  const topo = [];
  while (queue.length) {
    const u = queue.shift();
    topo.push(u);
    for (const v of childrenOf.get(u)) {
      rank.set(v, Math.max(rank.get(v) || 0, rank.get(u) + 1));
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }

  const maxRank = topo.length > 0 ? Math.max(...topo.map(id => rank.get(id))) : 0;
  return { topo, rank, maxRank };
}

/**
 * Validate a DAG definition and return warnings for common issues.
 * Non-throwing — returns an array of human-readable warning strings.
 * @param {Array<{id: string}>} nodes
 * @param {Array<[string, string]>} edges
 * @returns {string[]} warnings (empty if valid)
 */
export function validateDag(nodes, edges) {
  const warnings = [];
  const ids = new Set();

  // Duplicate node IDs
  for (const n of nodes) {
    if (ids.has(n.id)) warnings.push(`Duplicate node ID: "${n.id}"`);
    ids.add(n.id);
  }

  // Edges referencing unknown nodes
  for (const [f, t] of edges) {
    if (!ids.has(f)) warnings.push(`Edge source "${f}" is not a known node`);
    if (!ids.has(t)) warnings.push(`Edge target "${t}" is not a known node`);
  }

  // Cycle detection via topo sort
  if (warnings.length === 0 && nodes.length > 0) {
    const { childrenOf, parentsOf } = buildGraph(nodes, edges);
    const { topo } = topoSortAndRank(nodes, childrenOf, parentsOf);
    if (topo.length < nodes.length) {
      const missing = nodes.filter(n => !topo.includes(n.id)).map(n => n.id);
      warnings.push(`Cycle detected — ${missing.length} node(s) unreachable: ${missing.join(', ')}`);
    }
  }

  return warnings;
}

/**
 * Validate a DAG definition and throw with a useful message if invalid.
 * @param {Array<{id: string}>} nodes
 * @param {Array<[string, string]>} edges
 * @param {string} [context='DAG']
 */
export function assertValidDag(nodes, edges, context = 'DAG') {
  const warnings = validateDag(nodes, edges);
  if (warnings.length > 0) {
    throw new Error(`${context}: invalid DAG input. ${warnings.join('; ')}`);
  }
}

// ================================================================
// SVG path coordinate swap (X↔Y) for orientation transforms
// ================================================================

// How many coordinate values each SVG command consumes per repetition.
// Commands that take (x,y) pairs: values are swapped pairwise.
// H↔V are single-axis and swap command letter instead.
// A (arc) is not supported — its 7-param layout doesn't pair-swap cleanly.
const CMD_PARAMS = {
  M: 2, L: 2, T: 2,      // 1 pair
  Q: 4, S: 4,             // 2 pairs
  C: 6,                   // 3 pairs
  H: 1, V: 1,             // single axis — letter swaps
  Z: 0,                   // no params
};

/**
 * Swap X↔Y coordinates in an SVG path string.
 * Handles M, L, C, Q, S, T, H, V, Z (both absolute and relative).
 * Throws on A/a (arc) — arc parameter layout requires special handling.
 *
 * @param {string} d - SVG path data string
 * @returns {string} path with all X and Y coordinates swapped
 */
export function swapPathXY(d) {
  if (!d) return '';

  // Tokenize: split into command + numbers sequences.
  // Regex captures a command letter followed by its numeric arguments.
  const tokens = [];
  const re = /([MLCSQTHVZAmlcsqthvza])\s*([^MLCSQTHVZAmlcsqthvza]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const argStr = m[2].trim();
    const nums = argStr.length > 0 ? argStr.split(/[\s,]+/).map(Number) : [];
    tokens.push({ cmd, nums });
  }

  const parts = [];
  for (const { cmd, nums } of tokens) {
    const upper = cmd.toUpperCase();

    if (upper === 'A') {
      throw new Error('swapPathXY: arc commands (A/a) are not supported');
    }

    if (upper === 'Z') {
      parts.push(cmd);
      continue;
    }

    if (upper === 'H') {
      // H x → V x (swap command letter, keep value)
      parts.push((cmd === 'H' ? 'V' : 'v') + ' ' + nums.join(' '));
      continue;
    }

    if (upper === 'V') {
      // V y → H y
      parts.push((cmd === 'V' ? 'H' : 'h') + ' ' + nums.join(' '));
      continue;
    }

    // Pair-swapping commands: swap every (x, y) → (y, x)
    const swapped = [];
    for (let i = 0; i < nums.length; i += 2) {
      swapped.push(nums[i + 1], nums[i]);
    }
    parts.push(cmd + ' ' + swapped.join(' '));
  }

  return parts.join(' ');
}
