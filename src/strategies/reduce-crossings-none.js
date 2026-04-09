// reduce-crossings-none.js — no-op crossing reduction strategy.
// Passes layers through unchanged. This is the current layoutMetro behavior.

export function reduceCrossingsNone(/* { layers, childrenOf, parentsOf } */) {
  // No crossing reduction — layers stay as-is.
  // This matches the current layoutMetro behavior.
}
