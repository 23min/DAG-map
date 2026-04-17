// ================================================================
// events.js — DOM event binding for dag-map SVG
// ================================================================
// Uses event delegation on data-* attributes emitted by render.js.
// Returns a cleanup function that removes all listeners.

/**
 * Bind click and hover events to dag-map SVG elements.
 *
 * @param {HTMLElement|SVGElement} container - the element containing the dag-map SVG
 * @param {object} callbacks
 * @param {function} [callbacks.onNodeClick] - (nodeId: string, event: MouseEvent) => void
 * @param {function} [callbacks.onNodeHover] - (nodeId: string|null, event: MouseEvent) => void
 * @param {function} [callbacks.onEdgeClick] - (fromId: string, toId: string, event: MouseEvent) => void
 * @param {function} [callbacks.onEdgeHover] - (fromId: string, toId: string|null, event: MouseEvent) => void
 * @returns {function} cleanup - removes all event listeners
 */
export function bindEvents(container, callbacks = {}) {
  const { onNodeClick, onNodeHover, onEdgeClick, onEdgeHover } = callbacks;

  function findNode(el) {
    const g = el.closest('[data-node-id]');
    return g ? g.getAttribute('data-node-id') : null;
  }

  function findEdge(el) {
    const path = el.closest('[data-edge-from]');
    if (!path) return null;
    return {
      from: path.getAttribute('data-edge-from'),
      to: path.getAttribute('data-edge-to'),
    };
  }

  function handleClick(e) {
    const nodeId = findNode(e.target);
    if (nodeId) {
      if (onNodeClick) onNodeClick(nodeId, e);
      return;
    }
    const edge = findEdge(e.target);
    if (edge) {
      if (onEdgeClick) onEdgeClick(edge.from, edge.to, e);
    }
  }

  let hoveredNode = null;
  let hoveredEdgeKey = null;

  function handleMouseOver(e) {
    const nodeId = findNode(e.target);
    if (nodeId && nodeId !== hoveredNode) {
      hoveredNode = nodeId;
      if (onNodeHover) onNodeHover(nodeId, e);
      return;
    }

    const edge = findEdge(e.target);
    if (edge) {
      const key = `${edge.from}\u2192${edge.to}`;
      if (key !== hoveredEdgeKey) {
        hoveredEdgeKey = key;
        if (onEdgeHover) onEdgeHover(edge.from, edge.to, e);
      }
    }
  }

  function handleMouseOut(e) {
    // Check if we're leaving a node
    if (hoveredNode) {
      const nodeId = findNode(e.target);
      if (nodeId === hoveredNode) {
        const related = e.relatedTarget;
        const stillInNode = related && related.closest && related.closest(`[data-node-id="${hoveredNode}"]`);
        if (!stillInNode) {
          hoveredNode = null;
          if (onNodeHover) onNodeHover(null, e);
        }
      }
    }

    // Check if we're leaving an edge
    if (hoveredEdgeKey) {
      const edge = findEdge(e.target);
      if (edge) {
        const key = `${edge.from}\u2192${edge.to}`;
        if (key === hoveredEdgeKey) {
          const related = e.relatedTarget;
          const stillOnEdge = related && related.closest && related.closest(`[data-edge-from="${edge.from}"][data-edge-to="${edge.to}"]`);
          if (!stillOnEdge) {
            hoveredEdgeKey = null;
            if (onEdgeHover) onEdgeHover(null, null, e);
          }
        }
      }
    }
  }

  container.addEventListener('click', handleClick);
  container.addEventListener('mouseover', handleMouseOver);
  container.addEventListener('mouseout', handleMouseOut);

  return function cleanup() {
    container.removeEventListener('click', handleClick);
    container.removeEventListener('mouseover', handleMouseOver);
    container.removeEventListener('mouseout', handleMouseOut);
  };
}
