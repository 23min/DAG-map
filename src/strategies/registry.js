// registry.js — strategy registry for the layoutMetro pipeline.
//
// Each pipeline step has a slot with one or more named strategies.
// The registry maps slot names to strategy implementations.
// Default strategies reproduce the current monolithic layoutMetro behavior.

const registry = {
  // Slot: extractRoutes
  // Input: { nodes, edges, topo, layer, childrenOf, parentsOf, nodeMap, options }
  // Output: { routes, nodeRoute, nodeRoutes, segmentRoutes, assigned }
  extractRoutes: {},

  // Slot: orderNodes
  // Input: { nodes, layers, childrenOf, parentsOf }
  // Output: { layers } (reordered)
  orderNodes: {},

  // Slot: reduceCrossings
  // Input: { layers, childrenOf, parentsOf, passes }
  // Output: { layers } (reordered to reduce crossings)
  reduceCrossings: {},

  // Slot: assignLanes
  // Input: { routes, layer, nodeRoute, routeLayerRange, routeOwnLength, routeDomClass, config }
  // Output: { routeY }
  assignLanes: {},

  // Slot: refineCoordinates
  // Input: { nodes, positions, childrenOf, parentsOf, iterations }
  // Output: { positions } (adjusted)
  refineCoordinates: {},
};

export function registerStrategy(slot, name, fn) {
  if (!registry[slot]) {
    throw new Error(`registerStrategy: unknown slot "${slot}"`);
  }
  registry[slot][name] = fn;
}

export function getStrategy(slot, name) {
  const strategies = registry[slot];
  if (!strategies) {
    throw new Error(`getStrategy: unknown slot "${slot}"`);
  }
  const fn = strategies[name];
  if (!fn) {
    throw new Error(`getStrategy: unknown strategy "${name}" for slot "${slot}". Available: ${Object.keys(strategies).join(', ')}`);
  }
  return fn;
}

export function resolveStrategies(options = {}) {
  const strategies = options.strategies || {};
  return {
    extractRoutes: getStrategy('extractRoutes', strategies.extractRoutes || 'default'),
    orderNodes: getStrategy('orderNodes', strategies.orderNodes || 'none'),
    reduceCrossings: getStrategy('reduceCrossings', strategies.reduceCrossings || 'none'),
    assignLanes: getStrategy('assignLanes', strategies.assignLanes || 'default'),
    refineCoordinates: getStrategy('refineCoordinates', strategies.refineCoordinates || 'none'),
  };
}

export { registry };
