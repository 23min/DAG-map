// strategies/index.js — registers all built-in strategies and exports
// the resolver for use by layoutMetro.

import { registerStrategy, resolveStrategies } from './registry.js';
import { extractRoutesDefault } from './extract-routes-default.js';
import { assignLanesDefault } from './assign-lanes-default.js';
import { orderNodesNone } from './order-nodes-none.js';
import { reduceCrossingsNone } from './reduce-crossings-none.js';
import { refineCoordinatesNone } from './refine-coordinates-none.js';

// Register defaults
registerStrategy('extractRoutes', 'default', extractRoutesDefault);
registerStrategy('assignLanes', 'default', assignLanesDefault);
registerStrategy('orderNodes', 'none', orderNodesNone);
registerStrategy('reduceCrossings', 'none', reduceCrossingsNone);
registerStrategy('refineCoordinates', 'none', refineCoordinatesNone);

export { resolveStrategies };
