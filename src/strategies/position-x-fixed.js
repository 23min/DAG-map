// position-x-fixed.js — rigid X positioning (current layoutMetro behavior).
// X = marginLeft + layer * layerSpacing for every node.

export function positionXFixed(ctx) {
  const { nodes, layer, config } = ctx;
  const layerSpacing = config.layerSpacing ?? 57;
  const marginLeft = config.marginLeft ?? 75;

  const x = new Map();
  for (const nd of nodes) {
    x.set(nd.id, marginLeft + layer.get(nd.id) * layerSpacing);
  }
  return x;
}
