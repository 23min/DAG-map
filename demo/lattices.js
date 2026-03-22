// ================================================================
// lattices.js — Sample lattice definitions for Hasse diagram demo
// ================================================================
// Edges point downward: [a, b] means a ≥ b (a covers b).
// Convention: top (⊤) is the supremum, bottom (⊥) is the infimum.
// Node classes are used for coloring by role in the lattice.

/**
 * Node constructor helper.
 * @param {string} id
 * @param {string} [label]
 * @param {string} [cls='type'] - node class for coloring
 * @returns {{id: string, label: string, cls: string}}
 */
function n(id, label, cls) {
  return { id, label: label || id, cls: cls || 'type' };
}

export const LATTICES = {

  // ── Boolean lattice: simplest non-trivial lattice ──
  // Two elements plus top and bottom.
  //     ⊤
  //    / \
  //   a   b
  //    \ /
  //     ⊥
  boolean: () => ({
    label: 'Boolean lattice',
    description: '4 elements — the simplest diamond shape',
    nodes: [
      n('top', '⊤', 'top'),
      n('a', 'a', 'type'),
      n('b', 'b', 'type'),
      n('bot', '⊥', 'bottom'),
    ],
    edges: [
      ['top', 'a'], ['top', 'b'],
      ['a', 'bot'], ['b', 'bot'],
    ],
  }),

  // ── Power set lattice P({1,2,3}) ──
  // All subsets of {1,2,3} ordered by inclusion.
  // Classic 3-cube (Boolean lattice B₃). 8 nodes, 12 edges.
  //            {1,2,3}
  //          /   |    \
  //      {1,2} {1,3} {2,3}
  //       /  \  / \  / \
  //     {1}  {2}   {3}
  //       \   |   /
  //          ∅
  powerset_3: () => ({
    label: 'P({1,2,3})',
    description: 'Power set of {1,2,3} — Boolean lattice B₃ (cube)',
    nodes: [
      n('123', '{1,2,3}', 'top'),
      n('12', '{1,2}', 'type'),
      n('13', '{1,3}', 'type'),
      n('23', '{2,3}', 'type'),
      n('1', '{1}', 'type'),
      n('2', '{2}', 'type'),
      n('3', '{3}', 'type'),
      n('empty', '∅', 'bottom'),
    ],
    edges: [
      ['123', '12'], ['123', '13'], ['123', '23'],
      ['12', '1'], ['12', '2'],
      ['13', '1'], ['13', '3'],
      ['23', '2'], ['23', '3'],
      ['1', 'empty'], ['2', 'empty'], ['3', 'empty'],
    ],
  }),

  // ── Divisor lattice D(30) ──
  // Divisors of 30 = {1, 2, 3, 5, 6, 10, 15, 30}, ordered by divisibility.
  // Non-Boolean — different shape than the power set.
  //          30
  //        / | \
  //       6  10  15
  //      /\ / \ /\
  //     2  3   5
  //      \ |  /
  //        1
  divisors_30: () => ({
    label: 'D(30)',
    description: 'Divisors of 30 ordered by divisibility',
    nodes: [
      n('30', '30', 'top'),
      n('6', '6', 'type'),
      n('10', '10', 'type'),
      n('15', '15', 'type'),
      n('2', '2', 'type'),
      n('3', '3', 'type'),
      n('5', '5', 'type'),
      n('1', '1', 'bottom'),
    ],
    edges: [
      ['30', '6'], ['30', '10'], ['30', '15'],
      ['6', '2'], ['6', '3'],
      ['10', '2'], ['10', '5'],
      ['15', '3'], ['15', '5'],
      ['2', '1'], ['3', '1'], ['5', '1'],
    ],
  }),

  // ── Divisor lattice D(60) ──
  // 12 divisors, richer crossing structure.
  //               60
  //           /  |   \
  //         12   20    30
  //        /| \  |\ \  /|\
  //       4  6  10 15
  //      /\ /\ /\ /\
  //     2   3   5
  //      \  |  /
  //        1
  divisors_60: () => ({
    label: 'D(60)',
    description: 'Divisors of 60 — 12 nodes, tests wider layers',
    nodes: [
      n('60', '60', 'top'),
      n('30', '30', 'type'),
      n('20', '20', 'type'),
      n('12', '12', 'type'),
      n('15', '15', 'type'),
      n('10', '10', 'type'),
      n('6', '6', 'type'),
      n('4', '4', 'type'),
      n('5', '5', 'type'),
      n('3', '3', 'type'),
      n('2', '2', 'type'),
      n('1', '1', 'bottom'),
    ],
    edges: [
      ['60', '30'], ['60', '20'], ['60', '12'],
      ['30', '15'], ['30', '10'], ['30', '6'],
      ['20', '10'], ['20', '4'],
      ['12', '6'], ['12', '4'],
      ['15', '5'], ['15', '3'],
      ['10', '5'], ['10', '2'],
      ['6', '3'], ['6', '2'],
      ['4', '2'],
      ['5', '1'], ['3', '1'], ['2', '1'],
    ],
  }),

  // ── Pentagon lattice (N₅) ──
  // The smallest non-modular lattice. Important in lattice theory
  // because a lattice is modular iff it has no N₅ sublattice.
  //     ⊤
  //    / \
  //   a   b
  //   |   |
  //   c   |
  //    \ /
  //     ⊥
  pentagon: () => ({
    label: 'N₅ (Pentagon)',
    description: 'Smallest non-modular lattice — 5 elements',
    nodes: [
      n('top', '⊤', 'top'),
      n('a', 'a', 'type'),
      n('b', 'b', 'type'),
      n('c', 'c', 'constraint'),
      n('bot', '⊥', 'bottom'),
    ],
    edges: [
      ['top', 'a'], ['top', 'b'],
      ['a', 'c'],
      ['b', 'bot'],
      ['c', 'bot'],
    ],
  }),

  // ── Diamond lattice (M₃) ──
  // The smallest non-distributive modular lattice. A lattice is
  // distributive iff it has no M₃ or N₅ sublattice.
  //       ⊤
  //      /|\
  //     a b c
  //      \|/
  //       ⊥
  diamond_m3: () => ({
    label: 'M₃ (Diamond)',
    description: 'Smallest non-distributive modular lattice — 5 elements',
    nodes: [
      n('top', '⊤', 'top'),
      n('a', 'a', 'type'),
      n('b', 'b', 'type'),
      n('c', 'c', 'type'),
      n('bot', '⊥', 'bottom'),
    ],
    edges: [
      ['top', 'a'], ['top', 'b'], ['top', 'c'],
      ['a', 'bot'], ['b', 'bot'], ['c', 'bot'],
    ],
  }),

  // ── Linear chain (total order) ──
  // Degenerate lattice — every pair is comparable.
  // Tests that the layout handles single-column arrangements.
  chain_5: () => ({
    label: 'Chain (5)',
    description: 'Total order — 5 elements in a line',
    nodes: [
      n('e4', '4', 'top'),
      n('e3', '3', 'type'),
      n('e2', '2', 'type'),
      n('e1', '1', 'type'),
      n('e0', '0', 'bottom'),
    ],
    edges: [
      ['e4', 'e3'], ['e3', 'e2'], ['e2', 'e1'], ['e1', 'e0'],
    ],
  }),

  // ── Product lattice 2×3 ──
  // Cartesian product of chain {0,1} and chain {0,1,2}.
  // Tests rectangular grid structure.
  //   (1,2)
  //   / \
  // (0,2)(1,1)
  //  | \/ |
  //  | /\ |
  // (0,1)(1,0)
  //   \ /
  //  (0,0)
  product_2x3: () => ({
    label: '2 × 3',
    description: 'Product of chains {0,1} × {0,1,2} — grid lattice',
    nodes: [
      n('12', '(1,2)', 'top'),
      n('02', '(0,2)', 'type'),
      n('11', '(1,1)', 'type'),
      n('01', '(0,1)', 'type'),
      n('10', '(1,0)', 'type'),
      n('00', '(0,0)', 'bottom'),
    ],
    edges: [
      ['12', '02'], ['12', '11'],
      ['02', '01'],
      ['11', '01'], ['11', '10'],
      ['01', '00'],
      ['10', '00'],
    ],
  }),

  // ── Partition lattice Π(3) ──
  // Partitions of {1,2,3} ordered by refinement.
  // Non-geometric, tests asymmetric structure.
  //         {123}           (everything in one block)
  //        / | \
  //   {12|3} {13|2} {1|23}
  //        \  |  /
  //       {1|2|3}           (all singletons)
  partition_3: () => ({
    label: 'Π(3)',
    description: 'Partitions of {1,2,3} by refinement — non-distributive',
    nodes: [
      n('all', '{123}', 'top'),
      n('12_3', '{12|3}', 'type'),
      n('13_2', '{13|2}', 'type'),
      n('1_23', '{1|23}', 'type'),
      n('disc', '{1|2|3}', 'bottom'),
    ],
    edges: [
      ['all', '12_3'], ['all', '13_2'], ['all', '1_23'],
      ['12_3', 'disc'], ['13_2', 'disc'], ['1_23', 'disc'],
    ],
  }),

  // ── Partition lattice Π(4) ──
  // 15 partitions — significantly more complex, good stress test.
  partition_4: () => ({
    label: 'Π(4)',
    description: 'Partitions of {1,2,3,4} by refinement — 15 elements',
    nodes: [
      n('1234', '{1234}', 'top'),
      // 2-block partitions with one block of 3
      n('123_4', '{123|4}', 'type'),
      n('124_3', '{124|3}', 'type'),
      n('134_2', '{134|2}', 'type'),
      n('234_1', '{234|1}', 'type'),
      // 2-block partitions with two blocks of 2
      n('12_34', '{12|34}', 'type'),
      n('13_24', '{13|24}', 'type'),
      n('14_23', '{14|23}', 'type'),
      // 3-block partitions
      n('12_3_4', '{12|3|4}', 'constraint'),
      n('13_2_4', '{13|2|4}', 'constraint'),
      n('14_2_3', '{14|2|3}', 'constraint'),
      n('23_1_4', '{23|1|4}', 'constraint'),
      n('24_1_3', '{24|1|3}', 'constraint'),
      n('34_1_2', '{34|1|2}', 'constraint'),
      // discrete partition
      n('disc', '{1|2|3|4}', 'bottom'),
    ],
    edges: [
      // top -> 3+1 blocks
      ['1234', '123_4'], ['1234', '124_3'], ['1234', '134_2'], ['1234', '234_1'],
      // top -> 2+2 blocks
      ['1234', '12_34'], ['1234', '13_24'], ['1234', '14_23'],
      // 3+1 -> 2+1+1 (each 3-block refines into three 2-blocks)
      ['123_4', '12_3_4'], ['123_4', '13_2_4'], ['123_4', '23_1_4'],
      ['124_3', '12_3_4'], ['124_3', '14_2_3'], ['124_3', '24_1_3'],
      ['134_2', '13_2_4'], ['134_2', '14_2_3'], ['134_2', '34_1_2'],
      ['234_1', '23_1_4'], ['234_1', '24_1_3'], ['234_1', '34_1_2'],
      // 2+2 -> 2+1+1
      ['12_34', '12_3_4'], ['12_34', '34_1_2'],
      ['13_24', '13_2_4'], ['13_24', '24_1_3'],
      ['14_23', '14_2_3'], ['14_23', '23_1_4'],
      // 2+1+1 -> discrete
      ['12_3_4', 'disc'], ['13_2_4', 'disc'], ['14_2_3', 'disc'],
      ['23_1_4', 'disc'], ['24_1_3', 'disc'], ['34_1_2', 'disc'],
    ],
  }),

  // ── Young's lattice (truncated) ──
  // Integer partitions up to size 4, ordered by containment of Young diagrams.
  // Important in combinatorics and representation theory.
  // NOTE: This is a poset (partial order), not a lattice — the size-4
  // partitions have no common upper bound. Included because it's a
  // classic Hasse diagram with interesting irregular structure.
  young_4: () => ({
    label: 'Young (≤4)',
    description: 'Integer partitions up to 4 — poset, not a lattice (no top element)',
    nodes: [
      n('4', '[4]', 'type'),
      n('31', '[3,1]', 'type'),
      n('22', '[2,2]', 'type'),
      n('211', '[2,1,1]', 'type'),
      n('1111', '[1,1,1,1]', 'type'),
      n('3', '[3]', 'type'),
      n('21', '[2,1]', 'type'),
      n('111', '[1,1,1]', 'type'),
      n('2', '[2]', 'type'),
      n('11', '[1,1]', 'type'),
      n('1', '[1]', 'type'),
      n('0', '∅', 'bottom'),
    ],
    edges: [
      ['4', '3'], ['31', '3'], ['31', '21'],
      ['22', '21'],
      ['211', '21'], ['211', '111'],
      ['1111', '111'],
      ['3', '2'], ['21', '2'], ['21', '11'],
      ['111', '11'],
      ['2', '1'], ['11', '1'],
      ['1', '0'],
    ],
  }),

  // ── Type hierarchy lattice ──
  // Subtype lattice with multiple inheritance. Verified to be a proper
  // lattice: every pair has a unique meet and join.
  //
  // Key structure:
  //   Sequence = Equatable ∧ Iterable (meet of the two interfaces)
  //   List = Sequence ∧ Collection (both ordered and a container)
  //
  //                Any
  //              /     \
  //       Equatable   Iterable
  //           |    \ /    |
  //           |  Sequence |
  //           |  /     \  |
  //        Number   Collection
  //         / \      / \
  //       Int Float List Set
  //         \   |    |  /
  //            Never
  type_hierarchy: () => ({
    label: 'Type hierarchy',
    description: 'Subtype lattice with multiple inheritance — a proper lattice (12 nodes)',
    nodes: [
      n('any', 'Any', 'top'),
      n('equatable', 'Equatable', 'type'),
      n('iterable', 'Iterable', 'type'),
      n('sequence', 'Sequence', 'type'),
      n('number', 'Number', 'type'),
      n('collection', 'Collection', 'type'),
      n('int', 'Int', 'concrete'),
      n('float', 'Float', 'concrete'),
      n('str', 'String', 'concrete'),
      n('list', 'List', 'concrete'),
      n('set', 'Set', 'concrete'),
      n('never', 'Never', 'bottom'),
    ],
    edges: [
      ['any', 'equatable'], ['any', 'iterable'],
      ['equatable', 'sequence'], ['equatable', 'number'],
      ['iterable', 'sequence'], ['iterable', 'collection'],
      ['sequence', 'str'], ['sequence', 'list'],
      ['number', 'int'], ['number', 'float'],
      ['collection', 'list'], ['collection', 'set'],
      ['int', 'never'], ['float', 'never'], ['str', 'never'],
      ['list', 'never'], ['set', 'never'],
    ],
  }),

  // ── Divisor lattice D(12) ──
  // Divisors of 12 = {1, 2, 3, 4, 6, 12}, ordered by divisibility.
  // Compact non-Boolean lattice with an asymmetric shape (4 has depth 2
  // through 2 only, while 6 connects to both 2 and 3).
  //       12
  //      / \
  //     4   6
  //     |  / \
  //     2   3
  //      \ /
  //       1
  divisors_12: () => ({
    label: 'D(12)',
    description: 'Divisors of 12 — compact asymmetric lattice (6 nodes)',
    nodes: [
      n('12', '12', 'top'),
      n('4', '4', 'type'),
      n('6', '6', 'type'),
      n('2', '2', 'type'),
      n('3', '3', 'type'),
      n('1', '1', 'bottom'),
    ],
    edges: [
      ['12', '4'], ['12', '6'],
      ['4', '2'],
      ['6', '2'], ['6', '3'],
      ['2', '1'], ['3', '1'],
    ],
  }),
};
