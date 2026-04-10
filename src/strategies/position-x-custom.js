// position-x-custom.js — consumer-provided X positions.
//
// The consumer supplies a nodeX map (node id → x coordinate) via options.
// Nodes without an explicit X fall back to rank-based positioning.
// This enables domain-specific X semantics: time-proportional, duration-weighted,
// stage-based, or fully manual placement.

export function positionXCustom(ctx) {
  const { nodes, layer, config } = ctx;
  const layerSpacing = config.layerSpacing ?? 57;
  const marginLeft = config.marginLeft ?? 75;
  const customX = config.nodeX || {};

  const x = new Map();
  for (const nd of nodes) {
    if (nd.id in customX) {
      x.set(nd.id, customX[nd.id]);
    } else if (customX instanceof Map && customX.has(nd.id)) {
      x.set(nd.id, customX.get(nd.id));
    } else {
      // Fallback to rank-based
      x.set(nd.id, marginLeft + layer.get(nd.id) * layerSpacing);
    }
  }
  return x;
}
