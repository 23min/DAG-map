// strategies/index.js — registers all built-in strategies and exports
// the resolver for use by layoutMetro.

import { registerStrategy, resolveStrategies } from './registry.js';

// Route extraction
import { extractRoutesDefault } from './extract-routes-default.js';

// Lane assignment
import { assignLanesDefault } from './assign-lanes-default.js';

// Node ordering
import { orderNodesNone } from './order-nodes-none.js';
import { orderNodesBarycenter } from './order-nodes-barycenter.js';
import { orderNodesMedian } from './order-nodes-median.js';

// Crossing reduction
import { reduceCrossingsNone } from './reduce-crossings-none.js';
import { reduceCrossingsBarycenter } from './reduce-crossings-barycenter.js';
import { reduceCrossingsGreedy } from './reduce-crossings-greedy.js';

// Coordinate refinement
import { refineCoordinatesNone } from './refine-coordinates-none.js';
import { refineCoordinatesBarycenter } from './refine-coordinates-barycenter.js';

// Register all strategies
registerStrategy('extractRoutes', 'default', extractRoutesDefault);
registerStrategy('assignLanes', 'default', assignLanesDefault);

registerStrategy('orderNodes', 'none', orderNodesNone);
registerStrategy('orderNodes', 'barycenter', orderNodesBarycenter);
registerStrategy('orderNodes', 'median', orderNodesMedian);

registerStrategy('reduceCrossings', 'none', reduceCrossingsNone);
registerStrategy('reduceCrossings', 'barycenter', reduceCrossingsBarycenter);
registerStrategy('reduceCrossings', 'greedy', reduceCrossingsGreedy);

registerStrategy('refineCoordinates', 'none', refineCoordinatesNone);
registerStrategy('refineCoordinates', 'barycenter', refineCoordinatesBarycenter);

export { resolveStrategies };
