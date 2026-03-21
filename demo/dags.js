// ================================================================
// dags.js — Sample DAG definitions for dag-map demo
// ================================================================

/**
 * Node constructor helper.
 * @param {string} id
 * @param {string} [label]
 * @param {string} [cls='pure'] - node class: pure, recordable, side_effecting, gate
 * @returns {{id: string, label: string, cls: string}}
 */
export function n(id, label, cls) {
  return { id, label: label || id, cls: cls || 'pure' };
}

export const DAGS = {
  data_pipeline: () => ({
    nodes: [
      n('fetch_a', 'fetch_a', 'side_effecting'), n('fetch_b', 'fetch_b', 'side_effecting'),
      n('fetch_c', 'fetch_c', 'side_effecting'), n('transform', 'transform', 'pure'),
      n('analyze', 'analyze', 'recordable'), n('publish', 'publish', 'side_effecting'),
    ],
    edges: [
      ['fetch_a', 'transform'], ['fetch_b', 'transform'], ['fetch_c', 'transform'],
      ['transform', 'analyze'], ['analyze', 'publish'],
    ]
  }),

  factory: () => ({
    nodes: [
      n('parse', 'parse_req', 'recordable'), n('analyze', 'analyze', 'recordable'),
      n('decompose', 'decompose', 'recordable'), n('plan_impl', 'plan_impl', 'recordable'),
      n('plan_test', 'plan_test', 'recordable'), n('arch_review', 'arch_review', 'recordable'),
      n('deps', 'deps', 'recordable'), n('arch_plan', 'arch_plan', 'recordable'),
      n('coverage', 'coverage', 'recordable'), n('approve', 'approve_plan', 'gate'),
      n('begin', 'begin_impl', 'pure'), n('scaffold', 'scaffold', 'pure'),
      n('gen_core', 'gen_core', 'pure'), n('gen_types', 'gen_types', 'pure'),
      n('gen_logic', 'gen_logic', 'pure'), n('compile', 'compile', 'pure'),
      n('link', 'link', 'pure'), n('schema', 'schema', 'pure'), n('models', 'models', 'pure'),
      n('validate', 'validate', 'pure'), n('serialize', 'serialize', 'pure'), n('index', 'index', 'pure'),
      n('routes', 'routes', 'pure'), n('handlers', 'handlers', 'pure'),
      n('middleware', 'middleware', 'pure'), n('auth', 'auth', 'pure'),
      n('layout', 'layout', 'pure'), n('components', 'components', 'pure'),
      n('pages', 'pages', 'pure'), n('styles', 'styles', 'pure'),
      n('storybook', 'storybook', 'pure'), n('a11y', 'a11y', 'pure'), n('ui_bundle', 'ui_bundle', 'pure'),
      n('forms', 'forms', 'pure'), n('tables', 'tables', 'pure'), n('charts', 'charts', 'pure'),
      n('env_conf', 'env_conf', 'side_effecting'), n('docker', 'docker', 'side_effecting'),
      n('ci_conf', 'ci_conf', 'side_effecting'), n('secrets', 'secrets', 'side_effecting'),
      n('deploy_conf', 'deploy_conf', 'side_effecting'),
      n('migrate', 'migrate', 'side_effecting'), n('db_tables', 'db_tables', 'side_effecting'),
      n('db_indexes', 'db_indexes', 'side_effecting'), n('constraints', 'constraints', 'side_effecting'),
      n('triggers', 'triggers', 'side_effecting'), n('db_verify', 'db_verify', 'side_effecting'),
      n('seed_ref', 'seed_ref', 'side_effecting'), n('seed_test', 'seed_test', 'side_effecting'),
      n('seed_demo', 'seed_demo', 'side_effecting'), n('db_ready', 'db_ready', 'side_effecting'),
      n('refactor', 'refactor', 'recordable'), n('optimize', 'optimize', 'recordable'),
      n('gen_docs', 'gen_docs', 'recordable'), n('merge_all', 'merge_all', 'pure'),
      n('begin_test', 'begin_test', 'pure'), n('test_setup', 'test_setup', 'pure'),
      n('unit_core', 'unit_core', 'pure'), n('lint', 'lint', 'pure'),
      n('format', 'format', 'pure'), n('typecheck', 'typecheck', 'pure'),
      n('integ_api', 'integ_api', 'side_effecting'), n('integ_db', 'integ_db', 'side_effecting'),
      n('integ_auth', 'integ_auth', 'side_effecting'),
      n('all_pass', 'all_pass', 'pure'), n('llm_review', 'llm_review', 'recordable'),
      n('review', 'review', 'gate'), n('deploy', 'deploy', 'side_effecting'),
      n('verify', 'verify', 'side_effecting'), n('notify', 'notify', 'side_effecting'),
      n('log_run', 'log', 'side_effecting'),
    ],
    edges: [
      ['parse', 'analyze'], ['analyze', 'decompose'],
      ['decompose', 'plan_impl'], ['decompose', 'plan_test'], ['decompose', 'arch_review'],
      ['arch_review', 'deps'], ['deps', 'arch_plan'], ['plan_test', 'coverage'],
      ['plan_impl', 'approve'], ['coverage', 'approve'], ['arch_plan', 'approve'],
      ['approve', 'begin'],
      ['begin', 'scaffold'], ['begin', 'schema'], ['begin', 'routes'], ['begin', 'layout'],
      ['begin', 'env_conf'], ['begin', 'migrate'],
      ['scaffold', 'gen_core'], ['gen_core', 'gen_types'], ['gen_types', 'gen_logic'],
      ['gen_logic', 'compile'], ['compile', 'link'],
      ['schema', 'models'], ['models', 'validate'], ['validate', 'serialize'], ['serialize', 'index'],
      ['routes', 'handlers'], ['handlers', 'middleware'], ['middleware', 'auth'],
      ['layout', 'components'], ['components', 'pages'], ['pages', 'styles'],
      ['components', 'forms'], ['components', 'tables'], ['components', 'charts'],
      ['styles', 'storybook'], ['storybook', 'a11y'], ['a11y', 'ui_bundle'],
      ['forms', 'storybook'], ['tables', 'storybook'], ['charts', 'storybook'],
      ['env_conf', 'docker'], ['docker', 'ci_conf'], ['ci_conf', 'secrets'], ['secrets', 'deploy_conf'],
      ['migrate', 'db_tables'], ['db_tables', 'db_indexes'], ['db_indexes', 'constraints'],
      ['constraints', 'triggers'], ['triggers', 'db_verify'],
      ['constraints', 'seed_ref'], ['seed_ref', 'seed_test'], ['seed_test', 'seed_demo'],
      ['seed_demo', 'db_ready'], ['db_verify', 'db_ready'],
      ['gen_logic', 'refactor'], ['refactor', 'optimize'], ['optimize', 'link'],
      ['compile', 'gen_docs'],
      ['link', 'merge_all'], ['index', 'merge_all'], ['auth', 'merge_all'],
      ['ui_bundle', 'merge_all'], ['deploy_conf', 'merge_all'], ['db_ready', 'merge_all'],
      ['gen_docs', 'merge_all'],
      ['merge_all', 'begin_test'], ['begin_test', 'test_setup'],
      ['test_setup', 'unit_core'], ['test_setup', 'lint'], ['test_setup', 'integ_api'], ['test_setup', 'integ_db'],
      ['lint', 'format'], ['format', 'typecheck'],
      ['unit_core', 'all_pass'], ['typecheck', 'all_pass'], ['integ_api', 'integ_auth'],
      ['integ_auth', 'all_pass'], ['integ_db', 'all_pass'],
      ['all_pass', 'llm_review'], ['llm_review', 'review'],
      ['review', 'deploy'], ['deploy', 'verify'], ['deploy', 'notify'], ['notify', 'log_run'],
    ]
  }),

  diamond: () => ({
    nodes: [
      n('start', 'start', 'pure'),
      n('a', 'branch_a', 'recordable'), n('b', 'branch_b', 'side_effecting'),
      n('c', 'branch_c', 'pure'), n('d', 'branch_d', 'recordable'),
      n('merge', 'merge', 'pure'),
      n('final', 'final', 'gate'),
    ],
    edges: [
      ['start', 'a'], ['start', 'b'], ['start', 'c'], ['start', 'd'],
      ['a', 'merge'], ['b', 'merge'], ['c', 'merge'], ['d', 'merge'],
      ['merge', 'final'],
    ]
  }),

  linear: () => ({
    nodes: [
      n('a', 'step_1', 'pure'), n('b', 'step_2', 'pure'), n('c', 'step_3', 'recordable'),
      n('d', 'step_4', 'pure'), n('e', 'step_5', 'side_effecting'),
    ],
    edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']]
  }),

  wide_fan: () => {
    const nodes = [n('src', 'source', 'pure')];
    const edges = [];
    const classes = ['pure', 'pure', 'recordable', 'side_effecting', 'pure', 'recordable', 'side_effecting', 'pure'];
    for (let i = 0; i < 8; i++) {
      nodes.push(n(`w${i}`, `worker_${i}`, classes[i]));
      edges.push(['src', `w${i}`]);
    }
    nodes.push(n('sink', 'collect', 'pure'));
    for (let i = 0; i < 8; i++) edges.push([`w${i}`, 'sink']);
    return { nodes, edges };
  },

  pipeline: () => {
    const nodes = []; const edges = [];
    for (let i = 0; i < 15; i++) {
      const cls = i < 3 ? 'recordable' : i < 10 ? 'pure' : 'side_effecting';
      nodes.push(n(`p${i}`, `stage_${i}`, cls));
      if (i > 0) edges.push([`p${i - 1}`, `p${i}`]);
    }
    for (let b = 0; b < 3; b++) {
      const start = 3 + b * 3;
      nodes.push(n(`b${b}a`, `branch_${b}_a`, 'side_effecting'));
      nodes.push(n(`b${b}b`, `branch_${b}_b`, 'side_effecting'));
      edges.push([`p${start}`, `b${b}a`]);
      edges.push([`b${b}a`, `b${b}b`]);
      edges.push([`b${b}b`, `p${start + 2}`]);
    }
    return { nodes, edges };
  },

  deep_tree: () => {
    const nodes = [n('root', 'root', 'recordable')];
    const edges = [];
    function addLevel(parentId, depth, maxDepth) {
      if (depth >= maxDepth) return;
      const cls = depth < 2 ? 'pure' : 'side_effecting';
      const l = n(`${parentId}_l`, `${parentId}_l`, cls);
      const r = n(`${parentId}_r`, `${parentId}_r`, cls);
      nodes.push(l, r);
      edges.push([parentId, l.id], [parentId, r.id]);
      addLevel(l.id, depth + 1, maxDepth);
      addLevel(r.id, depth + 1, maxDepth);
    }
    addLevel('root', 0, 4);
    return { nodes, edges };
  },

  dense_merge: () => {
    const nodes = []; const edges = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) {
        nodes.push(n(`c${i}_${j}`, `chain${i}_${j}`, ['pure', 'recordable', 'side_effecting'][j]));
        if (j > 0) edges.push([`c${i}_${j - 1}`, `c${i}_${j}`]);
      }
    }
    for (let i = 0; i < 4; i++) {
      nodes.push(n(`m${i}`, `merge_${i}`, 'pure'));
      edges.push([`c${i * 2}_2`, `m${i}`]);
      edges.push([`c${i * 2 + 1}_2`, `m${i}`]);
    }
    nodes.push(n('final', 'final', 'recordable'));
    for (let i = 0; i < 4; i++) edges.push([`m${i}`, 'final']);
    return { nodes, edges };
  },
};
