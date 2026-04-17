import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bindEvents } from '../../src/events.js';

// Minimal DOM mock for Node.js testing
function createMockContainer(html) {
  // We simulate the DOM by tracking listeners and providing
  // a minimal closest() implementation
  const listeners = new Map();
  const container = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) {
        const arr = listeners.get(type);
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
    _listeners: listeners,
    _dispatch(type, target) {
      const handlers = listeners.get(type) || [];
      const event = { target, relatedTarget: null, type };
      for (const h of handlers) h(event);
    },
  };
  return container;
}

function mockElement(attrs = {}) {
  return {
    closest(selector) {
      // Parse selector like [data-node-id] or [data-edge-from]
      const attrMatch = selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
      if (!attrMatch) return null;
      const key = attrMatch[1];
      const val = attrMatch[2];
      if (key in attrs) {
        if (val !== undefined) {
          return attrs[key] === val ? this : null;
        }
        return this;
      }
      return null;
    },
    getAttribute(key) {
      return attrs[key] ?? null;
    },
  };
}

describe('bindEvents', () => {
  it('fires onNodeClick with node ID', () => {
    const container = createMockContainer();
    const clicks = [];
    bindEvents(container, {
      onNodeClick: (id, e) => clicks.push(id),
    });

    const target = mockElement({ 'data-node-id': 'api_svc' });
    container._dispatch('click', target);
    assert.deepStrictEqual(clicks, ['api_svc']);
  });

  it('fires onEdgeClick with from/to IDs', () => {
    const container = createMockContainer();
    const clicks = [];
    bindEvents(container, {
      onEdgeClick: (from, to, e) => clicks.push({ from, to }),
    });

    const target = mockElement({ 'data-edge-from': 'a', 'data-edge-to': 'b' });
    container._dispatch('click', target);
    assert.deepStrictEqual(clicks, [{ from: 'a', to: 'b' }]);
  });

  it('fires onNodeHover on mouseover with node ID', () => {
    const container = createMockContainer();
    const hovers = [];
    bindEvents(container, {
      onNodeHover: (id, e) => hovers.push(id),
    });

    const target = mockElement({ 'data-node-id': 'db_pool' });
    container._dispatch('mouseover', target);
    assert.deepStrictEqual(hovers, ['db_pool']);
  });

  it('fires onNodeHover with null on mouseout', () => {
    const container = createMockContainer();
    const hovers = [];
    bindEvents(container, {
      onNodeHover: (id, e) => hovers.push(id),
    });

    const target = mockElement({ 'data-node-id': 'db_pool' });
    container._dispatch('mouseover', target);
    container._dispatch('mouseout', target);
    assert.deepStrictEqual(hovers, ['db_pool', null]);
  });

  it('fires onEdgeHover with from/to on mouseover', () => {
    const container = createMockContainer();
    const hovers = [];
    bindEvents(container, {
      onEdgeHover: (from, to, e) => hovers.push({ from, to }),
    });

    const target = mockElement({ 'data-edge-from': 'x', 'data-edge-to': 'y' });
    container._dispatch('mouseover', target);
    assert.deepStrictEqual(hovers, [{ from: 'x', to: 'y' }]);
  });

  it('fires onEdgeHover with nulls on mouseout', () => {
    const container = createMockContainer();
    const hovers = [];
    bindEvents(container, {
      onEdgeHover: (from, to, e) => hovers.push({ from, to }),
    });

    const target = mockElement({ 'data-edge-from': 'x', 'data-edge-to': 'y' });
    container._dispatch('mouseover', target);
    container._dispatch('mouseout', target);
    assert.deepStrictEqual(hovers, [{ from: 'x', to: 'y' }, { from: null, to: null }]);
  });

  it('does not fire node click for non-node elements', () => {
    const container = createMockContainer();
    const clicks = [];
    bindEvents(container, {
      onNodeClick: (id) => clicks.push(id),
    });

    const target = mockElement({});
    container._dispatch('click', target);
    assert.deepStrictEqual(clicks, []);
  });

  it('does not duplicate hover events for same node', () => {
    const container = createMockContainer();
    const hovers = [];
    bindEvents(container, {
      onNodeHover: (id) => hovers.push(id),
    });

    const target = mockElement({ 'data-node-id': 'a' });
    container._dispatch('mouseover', target);
    container._dispatch('mouseover', target); // same node again
    assert.deepStrictEqual(hovers, ['a']); // only one event
  });

  it('returns a cleanup function that removes listeners', () => {
    const container = createMockContainer();
    const clicks = [];
    const cleanup = bindEvents(container, {
      onNodeClick: (id) => clicks.push(id),
    });

    const target = mockElement({ 'data-node-id': 'a' });
    container._dispatch('click', target);
    assert.deepStrictEqual(clicks, ['a']);

    cleanup();

    // Verify listeners were removed
    assert.strictEqual(container._listeners.get('click')?.length ?? 0, 0);
    assert.strictEqual(container._listeners.get('mouseover')?.length ?? 0, 0);
    assert.strictEqual(container._listeners.get('mouseout')?.length ?? 0, 0);
  });

  it('works with empty callbacks', () => {
    const container = createMockContainer();
    const cleanup = bindEvents(container, {});

    // Should not throw
    const target = mockElement({ 'data-node-id': 'a' });
    container._dispatch('click', target);
    container._dispatch('mouseover', target);
    container._dispatch('mouseout', target);

    cleanup();
  });

  it('prefers node click over edge click when both match', () => {
    const container = createMockContainer();
    const nodeClicks = [];
    const edgeClicks = [];
    bindEvents(container, {
      onNodeClick: (id) => nodeClicks.push(id),
      onEdgeClick: (from, to) => edgeClicks.push({ from, to }),
    });

    // Element with both node and edge attributes — node wins
    const target = mockElement({ 'data-node-id': 'a', 'data-edge-from': 'x', 'data-edge-to': 'y' });
    container._dispatch('click', target);
    assert.deepStrictEqual(nodeClicks, ['a']);
    assert.deepStrictEqual(edgeClicks, []); // edge not fired
  });
});
