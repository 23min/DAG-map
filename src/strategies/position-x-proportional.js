// position-x-proportional.js — variable-width layer spacing.
//
// Like rank-based but each layer can have a different width.
// Consumer provides layerWeights: [1, 1, 3, 1, 2] meaning layer 2
// gets 3x the horizontal space. Useful for showing layer complexity
// (crowded layers get more room) or duration (slow stages get more space).
//
// If no weights provided, computes them from node count per layer.

export function positionXProportional(ctx) {
  const { nodes, layer, maxLayer, config } = ctx;
  const baseSpacing = config.layerSpacing ?? 57;
  const marginLeft = config.marginLeft ?? 75;
  const weights = config.layerWeights || null;

  // Compute weights from node count if not provided
  let w;
  if (weights && weights.length > maxLayer) {
    w = weights;
  } else {
    // Count nodes per layer, normalize so average = 1
    const counts = new Array(maxLayer + 1).fill(0);
    for (const nd of nodes) {
      const r = layer.get(nd.id);
      if (r !== undefined) counts[r]++;
    }
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length || 1;
    w = counts.map(c => Math.max(0.5, c / avg)); // floor at 0.5 so empty layers don't collapse
  }

  // Compute cumulative X for each layer
  const layerX = [marginLeft];
  for (let r = 1; r <= maxLayer; r++) {
    layerX.push(layerX[r - 1] + w[r - 1] * baseSpacing);
  }

  const x = new Map();
  for (const nd of nodes) {
    const r = layer.get(nd.id);
    x.set(nd.id, layerX[r] ?? marginLeft);
  }
  return x;
}
