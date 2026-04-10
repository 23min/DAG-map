// assign-lanes-composed.js — composable lane assignment via blended position primitives.
//
// Computes Y positions from multiple approaches (force, spectral, stress, lane)
// and blends them with evolvable weights. The GA evolves which mix works best.

import { positionForceY } from './position-force.js';
import { positionStressY } from './position-stress-y.js';
import { blendPositions, applyGravity } from './position-blend.js';
import { buildLayers } from './crossing-utils.js';

/**
 * Composable lane assignment.
 *
 * @param {object} ctx
 * @param {Array} ctx.routes
 * @param {Map} ctx.layer
 * @param {Map} ctx.nodeRoute
 * @param {Map} ctx.nodeMap
 * @param {boolean} ctx.hasProvidedRoutes
 * @param {Map} [ctx.nodeOrder] - from crossing reduction
 * @param {object} ctx.config
 * @param {string} [ctx.config.yPrimary='force'] - primary Y method
 * @param {string} [ctx.config.ySecondary='stress'] - secondary Y method
 * @param {number} [ctx.config.yBlend=0.5] - blend weight (0=primary, 1=secondary)
 * @param {number} [ctx.config.gravityStrength=0.1] - centering pull
 * @param {number} [ctx.config.TRUNK_Y]
 * @param {number} [ctx.config.MAIN_SPACING]
 */
export function assignLanesComposed(ctx) {
  const { routes, layer, nodeRoute, config } = ctx;
  const nodes = [...new Set([...layer.keys()])].map(id => ({ id }));
  const maxLayer = Math.max(0, ...[...layer.values()]);

  const yPrimary = config?.yPrimary ?? 'force';
  const ySecondary = config?.ySecondary ?? 'stress';
  const yBlend = config?.yBlend ?? 0.5;
  const gravityStrength = config?.gravityStrength ?? 0.1;

  const subCtx = { ...ctx, nodes, maxLayer };

  // Compute primary Y
  const yA = computeY(yPrimary, subCtx);

  // Compute secondary Y
  const yB = computeY(ySecondary, subCtx);

  // Blend
  let y = blendPositions(yA, yB, yBlend);

  // Apply gravity
  applyGravity(y, gravityStrength);

  // Compute route Y from median of member node Y values
  const routeY = new Map();
  for (let ri = 0; ri < routes.length; ri++) {
    const ys = routes[ri].nodes
      .map(id => y.get(id))
      .filter(v => v !== undefined)
      .sort((a, b) => a - b);

    if (ys.length === 0) {
      routeY.set(ri, config?.TRUNK_Y ?? 240);
    } else {
      routeY.set(ri, ys[Math.floor(ys.length / 2)]);
    }
  }

  return { routeY, nodeY: y };
}

function computeY(method, ctx) {
  switch (method) {
    case 'force':
      return positionForceY(ctx);
    case 'stress':
      return positionStressY(ctx);
    case 'ordered': {
      // Use nodeOrder from crossing reduction (if available)
      const { nodes, layer, maxLayer, config, nodeOrder } = ctx;
      const TRUNK_Y = config?.TRUNK_Y ?? 240;
      const spacing = config?.MAIN_SPACING ?? 50;
      const y = new Map();
      if (nodeOrder && nodeOrder.size > 0) {
        const layers = buildLayers(nodes.map(n => n.id), layer, maxLayer);
        for (const layerNodes of layers) {
          layerNodes.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
          const n = layerNodes.length;
          for (let i = 0; i < n; i++) {
            y.set(layerNodes[i], TRUNK_Y + (i - (n - 1) / 2) * spacing);
          }
        }
      } else {
        for (const nd of nodes) {
          y.set(nd.id, TRUNK_Y);
        }
      }
      return y;
    }
    default:
      // Fallback: all at center
      const y = new Map();
      for (const nd of ctx.nodes) y.set(nd.id, ctx.config?.TRUNK_Y ?? 240);
      return y;
  }
}
