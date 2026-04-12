// strategies/index.js — registers all built-in strategies and exports
// the resolver for use by layoutMetro.

import { registerStrategy, resolveStrategies } from './registry.js';

// Route extraction
import { extractRoutesDefault } from './extract-routes-default.js';

// Lane assignment
import { assignLanesDefault } from './assign-lanes-default.js';
import { assignLanesOrdered } from './assign-lanes-ordered.js';
import { assignLanesComposed } from './assign-lanes-composed.js';

// Node ordering
import { orderNodesNone } from './order-nodes-none.js';
import { orderNodesBarycenter } from './order-nodes-barycenter.js';
import { orderNodesMedian } from './order-nodes-median.js';
import { orderNodesSpectral } from './order-nodes-spectral.js';
import { orderNodesHybrid } from './order-nodes-hybrid.js';
import { orderNodesShuffle } from './order-nodes-shuffle.js';

// Crossing reduction
import { reduceCrossingsNone } from './reduce-crossings-none.js';
import { reduceCrossingsBarycenter } from './reduce-crossings-barycenter.js';
import { reduceCrossingsGreedy } from './reduce-crossings-greedy.js';
import { reduceCrossingsRouteAware } from './reduce-crossings-route-aware.js';

// X positioning
import { positionXFixed } from './position-x-fixed.js';
import { positionXCompact } from './position-x-compact.js';
import { positionXCustom } from './position-x-custom.js';
import { positionXProportional } from './position-x-proportional.js';

// Coordinate refinement
import { refineCoordinatesNone } from './refine-coordinates-none.js';
import { refineCoordinatesBarycenter } from './refine-coordinates-barycenter.js';

// Register all strategies
registerStrategy('extractRoutes', 'default', extractRoutesDefault);
registerStrategy('assignLanes', 'default', assignLanesDefault);
registerStrategy('assignLanes', 'ordered', assignLanesOrdered);
registerStrategy('assignLanes', 'composed', assignLanesComposed);

import { assignLanesDirect } from './assign-lanes-direct.js';
registerStrategy('assignLanes', 'direct', assignLanesDirect);

import { assignLanesSwimlane } from './assign-lanes-swimlane.js';
registerStrategy('assignLanes', 'swimlane', assignLanesSwimlane);

registerStrategy('orderNodes', 'none', orderNodesNone);
registerStrategy('orderNodes', 'barycenter', orderNodesBarycenter);
registerStrategy('orderNodes', 'median', orderNodesMedian);
registerStrategy('orderNodes', 'spectral', orderNodesSpectral);
registerStrategy('orderNodes', 'hybrid', orderNodesHybrid);
registerStrategy('orderNodes', 'shuffle', orderNodesShuffle);

registerStrategy('reduceCrossings', 'none', reduceCrossingsNone);
registerStrategy('reduceCrossings', 'barycenter', reduceCrossingsBarycenter);
registerStrategy('reduceCrossings', 'greedy', reduceCrossingsGreedy);
registerStrategy('reduceCrossings', 'route-aware', reduceCrossingsRouteAware);

registerStrategy('positionX', 'fixed', positionXFixed);
registerStrategy('positionX', 'compact', positionXCompact);
registerStrategy('positionX', 'custom', positionXCustom);
registerStrategy('positionX', 'proportional', positionXProportional);

registerStrategy('refineCoordinates', 'none', refineCoordinatesNone);
registerStrategy('refineCoordinates', 'barycenter', refineCoordinatesBarycenter);

export { resolveStrategies };
