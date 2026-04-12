// extract-routes-default.js — default route extraction strategy.
// Handles both consumer-provided routes and auto-discovery via greedy
// longest-path. Extracted from layoutMetro lines 73-197.

import { dominantClass } from '../layout-metro.js';

/**
 * Find the longest path within a subset of nodes using DP on topo order.
 */
function longestPathIn(nodeSet, topo, childrenOf) {
  const dist = new Map(), prev = new Map();
  nodeSet.forEach(id => { dist.set(id, 0); prev.set(id, null); });
  for (const u of topo) {
    if (!nodeSet.has(u)) continue;
    for (const v of childrenOf.get(u)) {
      if (!nodeSet.has(v)) continue;
      if (dist.get(u) + 1 > dist.get(v)) {
        dist.set(v, dist.get(u) + 1); prev.set(v, u);
      }
    }
  }
  let best = -1, end = null;
  nodeSet.forEach(id => { if (dist.get(id) > best) { best = dist.get(id); end = id; } });
  if (end === null) return [];
  const path = [];
  for (let c = end; c !== null; c = prev.get(c)) path.unshift(c);
  return path;
}

/**
 * Extract routes from the DAG.
 *
 * @param {object} ctx
 * @param {Array} ctx.nodes - node array
 * @param {Array} ctx.topo - topologically sorted node IDs
 * @param {Map} ctx.childrenOf - adjacency map
 * @param {Map} ctx.parentsOf - adjacency map
 * @param {Map} ctx.nodeMap - id → node object
 * @param {object} ctx.options - layout options (may contain routes)
 * @returns {{ routes, nodeRoute, nodeRoutes, segmentRoutes, assigned, hasProvidedRoutes }}
 */
export function extractRoutesDefault(ctx) {
  const { nodes, topo, childrenOf, parentsOf, nodeMap, options } = ctx;

  const routes = [];
  const assigned = new Set();
  const nodeRoute = new Map();
  const nodeRoutes = new Map();
  nodes.forEach(nd => nodeRoutes.set(nd.id, new Set()));

  const hasProvidedRoutes = !!(options.routes && options.routes.length > 0);

  if (hasProvidedRoutes) {
    // Consumer-provided routes
    const provided = options.routes
      .map((r, i) => ({ ...r, originalIndex: i }))
      .sort((a, b) => b.nodes.length - a.nodes.length);

    provided.forEach((pr, i) => {
      let parentRouteIdx = -1;
      let bestOverlap = 0;
      const prNodeSet = new Set(pr.nodes);
      for (let j = 0; j < i; j++) {
        const overlap = routes[j].nodes.filter(id => prNodeSet.has(id)).length;
        if (overlap > bestOverlap) { bestOverlap = overlap; parentRouteIdx = j; }
      }
      if (i === 0) parentRouteIdx = -1;
      const depth = parentRouteIdx >= 0 ? routes[parentRouteIdx].depth + 1 : 0;

      routes.push({
        nodes: pr.nodes,
        lane: 0,
        parentRoute: parentRouteIdx >= 0 ? parentRouteIdx : (i === 0 ? -1 : 0),
        depth,
        cls: pr.cls || null,
        id: pr.id || null,
      });

      const ri = routes.length - 1;
      pr.nodes.forEach(id => {
        if (!assigned.has(id)) { assigned.add(id); nodeRoute.set(id, ri); }
        nodeRoutes.get(id)?.add(ri);
      });
    });

    nodes.forEach(nd => {
      if (!assigned.has(nd.id)) {
        assigned.add(nd.id);
        nodeRoute.set(nd.id, 0);
      }
    });
  } else {
    // Auto-discover routes via greedy longest-path
    const trunk = longestPathIn(new Set(topo), topo, childrenOf);
    routes.push({ nodes: trunk, lane: 0, parentRoute: -1, depth: 0 });
    trunk.forEach(id => { assigned.add(id); nodeRoute.set(id, 0); nodeRoutes.get(id)?.add(0); });

    let safety = 0;
    while (assigned.size < nodes.length && safety++ < 300) {
      const unassigned = [];
      nodes.forEach(nd => { if (!assigned.has(nd.id)) unassigned.push(nd.id); });
      if (unassigned.length === 0) break;

      const unassignedSet = new Set(unassigned);
      let bestPath = longestPathIn(unassignedSet, topo, childrenOf);
      if (bestPath.length === 0) {
        unassigned.forEach(id => { assigned.add(id); nodeRoute.set(id, 0); });
        break;
      }

      const firstNode = bestPath[0];
      const assignedParents = parentsOf.get(firstNode).filter(p => assigned.has(p));
      let parentRouteIdx = 0;
      if (assignedParents.length > 0) {
        bestPath.unshift(assignedParents[0]);
        parentRouteIdx = nodeRoute.get(assignedParents[0]) ?? 0;
      }

      const lastNode = bestPath[bestPath.length - 1];
      const assignedChildren = childrenOf.get(lastNode).filter(c => assigned.has(c));
      if (assignedChildren.length > 0) {
        bestPath.push(assignedChildren[0]);
      }

      const ri = routes.length;
      const parentDepth = routes[parentRouteIdx]?.depth ?? 0;
      routes.push({ nodes: bestPath, lane: 0, parentRoute: parentRouteIdx, depth: parentDepth + 1 });
      bestPath.forEach(id => {
        if (!assigned.has(id)) { assigned.add(id); nodeRoute.set(id, ri); }
        nodeRoutes.get(id)?.add(ri);
      });
    }
  }

  // Cover any remaining uncovered edges as short 2-node routes.
  // This ensures ALL DAG edges are route segments — no "extra" edges.
  const coveredEdges = new Set();
  routes.forEach(route => {
    for (let i = 1; i < route.nodes.length; i++) {
      coveredEdges.add(`${route.nodes[i - 1]}\u2192${route.nodes[i]}`);
    }
  });

  const { edges } = ctx.options?.dag ?? { edges: [] };
  const allEdges = edges ?? [];
  // Also check the original DAG edges from the context
  const dagEdges = ctx.nodes && ctx.childrenOf ? [] : allEdges;
  if (ctx.childrenOf) {
    for (const nd of ctx.nodes) {
      for (const child of (ctx.childrenOf.get(nd.id) || [])) {
        dagEdges.push([nd.id, child]);
      }
    }
  }

  for (const [from, to] of dagEdges) {
    if (coveredEdges.has(`${from}\u2192${to}`)) continue;
    const ri = routes.length;
    const parentRouteIdx = nodeRoute.get(from) ?? 0;
    const parentDepth = routes[parentRouteIdx]?.depth ?? 0;
    routes.push({ nodes: [from, to], lane: 0, parentRoute: parentRouteIdx, depth: parentDepth + 1 });
    if (!assigned.has(from)) { assigned.add(from); nodeRoute.set(from, ri); }
    if (!assigned.has(to)) { assigned.add(to); nodeRoute.set(to, ri); }
    nodeRoutes.get(from)?.add(ri);
    nodeRoutes.get(to)?.add(ri);
    coveredEdges.add(`${from}\u2192${to}`);
  }

  // Build shared segment map for parallel offset rendering
  const segmentRoutes = new Map();
  routes.forEach((route, ri) => {
    for (let i = 1; i < route.nodes.length; i++) {
      const key = `${route.nodes[i - 1]}\u2192${route.nodes[i]}`;
      if (!segmentRoutes.has(key)) segmentRoutes.set(key, []);
      segmentRoutes.get(key).push(ri);
    }
  });

  return { routes, nodeRoute, nodeRoutes, segmentRoutes, assigned, hasProvidedRoutes };
}
