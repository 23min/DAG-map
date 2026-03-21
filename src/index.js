// ================================================================
// dag-map — DAG visualization as metro maps
// ================================================================
// Public API

import { layoutMetro, C, CLASS_COLOR, dominantClass } from './layout.js';
import { renderSVG } from './render.js';
import { bezierPath } from './route-bezier.js';
import { angularPath, progressiveCurve } from './route-angular.js';
import { THEMES, resolveTheme } from './themes.js';

export { layoutMetro, C, CLASS_COLOR, dominantClass };
export { renderSVG };
export { bezierPath };
export { angularPath, progressiveCurve };
export { THEMES, resolveTheme };

/**
 * Convenience function: compute layout and render SVG in one call.
 *
 * @param {object} dag - { nodes: [{id, label, cls}], edges: [[from, to]] }
 * @param {object} [options] - combined layout + render options
 * @param {'bezier'|'angular'} [options.routing='angular']
 * @param {string|object} [options.theme='cream'] - theme name or custom theme object
 * @param {string} [options.title]
 * @param {boolean} [options.diagonalLabels=false]
 * @param {boolean} [options.showLegend=true]
 * @param {number} [options.trunkY=160]
 * @param {number} [options.mainSpacing=34]
 * @param {number} [options.subSpacing=16]
 * @param {number} [options.layerSpacing=38]
 * @param {number} [options.progressivePower=2.2]
 * @param {number} [options.scale=1.5]
 * @param {number} [options.maxLanes] - max number of lanes to search
 * @returns {{ layout: object, svg: string }}
 */
export function dag-map(dag, options = {}) {
  const layout = layoutMetro(dag, options);
  const svg = renderSVG(dag, layout, options);
  return { layout, svg };
}
