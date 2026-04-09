// order-nodes-none.js — no-op node ordering strategy.
// Passes layers through unchanged. This is the current layoutMetro behavior.

export function orderNodesNone(/* { layers, childrenOf, parentsOf } */) {
  // No reordering — nodes stay in their original order within each layer.
  // This matches the current layoutMetro behavior where no crossing
  // reduction or node ordering is performed.
}
