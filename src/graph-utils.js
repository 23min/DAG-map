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
  edges.forEach(([f, t]) => {
    childrenOf.get(f).push(t);
    parentsOf.get(t).push(f);
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
