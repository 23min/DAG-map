// ================================================================
// Test models for snake layout visual testing
// ================================================================
// 30 models ranging from trivial (1 class, 3 nodes) to complex
// (10 classes, 15+ nodes). Designed to stress different layout aspects.

const palette = {
  paper: '#1E1E2E', ink: '#CDD6F4', muted: '#6C7086', border: '#313244',
  classes: {
    a: '#E06C9F', b: '#2B9DB5', c: '#3D5BA9', d: '#94E2D5', e: '#D4944C',
    f: '#A6E3A1', g: '#CBA6F7', h: '#F38BA8', i: '#89B4FA', j: '#FAB387',
  },
};

function m(id, name, nodes, edges, routes, opts = {}) {
  return {
    id, name,
    dag: { nodes: nodes.map(n => ({ id: n[0], label: n[1], count: n[2] || '' })), edges },
    routes: routes.map((r, i) => ({ id: r.id, cls: r.cls, nodes: r.nodes })),
    theme: { ...palette, classes: Object.fromEntries(routes.map(r => [r.cls, palette.classes[r.cls]])) },
    opts: { scale: 1.8, layerSpacing: 50, columnSpacing: 70, dotSpacing: 12, cornerRadius: 5, lineThickness: 3, ...opts },
  };
}

export const models = [

  // ── 1. Trivial: single class ──────────────────────────────────

  m('linear3', '1 — Linear chain (3 nodes, 1 class)', [
    ['start', 'Start'],
    ['mid', 'Process'],
    ['end', 'End'],
  ], [['start','mid'], ['mid','end']], [
    { id: 'flow', cls: 'a', nodes: ['start','mid','end'] },
  ]),

  m('linear5', '2 — Longer chain (5 nodes, 1 class)', [
    ['receive', 'Receive Order'],
    ['validate', 'Validate'],
    ['pick', 'Pick Items'],
    ['pack', 'Pack'],
    ['ship', 'Ship'],
  ], [['receive','validate'],['validate','pick'],['pick','pack'],['pack','ship']], [
    { id: 'flow', cls: 'a', nodes: ['receive','validate','pick','pack','ship'] },
  ]),

  m('diamond', '3 — Diamond fork-join (4 nodes, 2 classes)', [
    ['start', 'Order Placed'],
    ['left', 'Credit Check'],
    ['right', 'Stock Check'],
    ['join', 'Approve'],
  ], [['start','left'],['start','right'],['left','join'],['right','join']], [
    { id: 'credit', cls: 'a', nodes: ['start','left','join'] },
    { id: 'stock', cls: 'b', nodes: ['start','right','join'] },
  ]),

  m('wide_fork', '4 — Wide fork (1→4, 4 classes)', [
    ['src', 'Dispatch'],
    ['a', 'Route North'],
    ['b', 'Route South'],
    ['c', 'Route East'],
    ['d', 'Route West'],
  ], [['src','a'],['src','b'],['src','c'],['src','d']], [
    { id: 'north', cls: 'a', nodes: ['src','a'] },
    { id: 'south', cls: 'b', nodes: ['src','b'] },
    { id: 'east', cls: 'c', nodes: ['src','c'] },
    { id: 'west', cls: 'd', nodes: ['src','d'] },
  ]),

  m('two_node', '5 — Minimal (2 nodes, 1 class)', [
    ['in', 'Request'],
    ['out', 'Response'],
  ], [['in','out']], [
    { id: 'flow', cls: 'a', nodes: ['in','out'] },
  ]),

  // ── 2. Two classes ────────────────────────────────────────────

  m('two_cls_linear', '6 — Two classes, shared path', [
    ['order', 'Place Order', '120K'],
    ['pay', 'Payment', '118K'],
    ['fulfill', 'Fulfill', '115K'],
    ['deliver', 'Deliver', '112K'],
  ], [['order','pay'],['pay','fulfill'],['fulfill','deliver']], [
    { id: 'sales', cls: 'a', nodes: ['order','pay','fulfill','deliver'] },
    { id: 'logistics', cls: 'b', nodes: ['pay','fulfill','deliver'] },
  ]),

  m('two_cls_diverge', '7 — Two classes diverge mid-flow', [
    ['intake', 'Intake'],
    ['triage', 'Triage'],
    ['er', 'Emergency Room'],
    ['clinic', 'Outpatient Clinic'],
    ['discharge', 'Discharge'],
  ], [['intake','triage'],['triage','er'],['triage','clinic'],['er','discharge'],['clinic','discharge']], [
    { id: 'emergency', cls: 'a', nodes: ['intake','triage','er','discharge'] },
    { id: 'outpatient', cls: 'b', nodes: ['intake','triage','clinic','discharge'] },
  ]),

  m('two_cls_merge', '8 — Two classes merge at end', [
    ['web', 'Web Order'],
    ['phone', 'Phone Order'],
    ['process', 'Process'],
    ['ship', 'Ship'],
  ], [['web','process'],['phone','process'],['process','ship']], [
    { id: 'online', cls: 'a', nodes: ['web','process','ship'] },
    { id: 'call_center', cls: 'b', nodes: ['phone','process','ship'] },
  ]),

  m('two_cls_parallel', '9 — Two classes, order triggers invoice', [
    ['a1', 'Order Created'],
    ['a2', 'Order Shipped'],
    ['b1', 'Invoice Created'],
    ['b2', 'Invoice Paid'],
  ], [['a1','a2'],['b1','b2'],['a1','b1']], [
    { id: 'order', cls: 'a', nodes: ['a1','a2'] },
    { id: 'invoice', cls: 'b', nodes: ['a1','b1','b2'] },
  ]),

  // ── 3. Three classes ──────────────────────────────────────────

  m('procurement', '10 — Procurement (3 classes)', [
    ['req', 'Create Requisition', '45K'],
    ['approve', 'Approve', '42K'],
    ['po', 'Create PO', '40K'],
    ['receive', 'Receive Goods', '38K'],
    ['invoice', 'Match Invoice', '37K'],
    ['pay', 'Payment', '36K'],
  ], [['req','approve'],['approve','po'],['po','receive'],['receive','invoice'],['invoice','pay']], [
    { id: 'purchasing', cls: 'a', nodes: ['req','approve','po','receive'] },
    { id: 'warehouse', cls: 'b', nodes: ['receive','invoice'] },
    { id: 'finance', cls: 'c', nodes: ['invoice','pay'] },
  ]),

  m('food_delivery', '11 — Food delivery (3 classes)', [
    ['place', 'Place Order', '85K'],
    ['confirm', 'Restaurant Confirms', '82K'],
    ['prep', 'Prepare Food', '80K'],
    ['pickup', 'Courier Pickup', '78K'],
    ['deliver', 'Deliver', '75K'],
    ['rate', 'Customer Rates', '60K'],
  ], [['place','confirm'],['confirm','prep'],['prep','pickup'],['pickup','deliver'],['deliver','rate']], [
    { id: 'customer', cls: 'a', nodes: ['place','confirm','prep','pickup','deliver','rate'] },
    { id: 'restaurant', cls: 'b', nodes: ['confirm','prep','pickup'] },
    { id: 'courier', cls: 'c', nodes: ['pickup','deliver','rate'] },
  ]),

  m('loan_approval', '12 — Loan approval (3 classes)', [
    ['apply', 'Application'],
    ['credit', 'Credit Check'],
    ['appraise', 'Appraisal'],
    ['underwrite', 'Underwriting'],
    ['approve', 'Approval'],
    ['close', 'Closing'],
  ], [['apply','credit'],['apply','appraise'],['credit','underwrite'],['appraise','underwrite'],['underwrite','approve'],['approve','close']], [
    { id: 'borrower', cls: 'a', nodes: ['apply','credit','underwrite','approve','close'] },
    { id: 'property', cls: 'b', nodes: ['apply','appraise','underwrite'] },
    { id: 'bank', cls: 'c', nodes: ['credit','underwrite','approve','close'] },
  ]),

  // ── 4. Four classes ───────────────────────────────────────────

  m('insurance_claim', '13 — Insurance claim (4 classes)', [
    ['report', 'Report Claim', '150K'],
    ['assess', 'Assess Damage', '145K'],
    ['approve', 'Approve Claim', '130K'],
    ['reject', 'Reject Claim', '20K'],
    ['repair', 'Arrange Repair', '110K'],
    ['pay', 'Pay Out', '125K'],
  ], [['report','assess'],['assess','approve'],['assess','reject'],['approve','repair'],['approve','pay'],['repair','pay']], [
    { id: 'claimant', cls: 'a', nodes: ['report','assess','approve','pay'] },
    { id: 'adjuster', cls: 'b', nodes: ['report','assess','approve'] },
    { id: 'reject_flow', cls: 'c', nodes: ['assess','reject'] },
    { id: 'repair', cls: 'd', nodes: ['approve','repair','pay'] },
  ]),

  m('airport_luggage', '14 — Airport luggage (4 classes)', [
    ['checkin', 'Check-in', '25K'],
    ['scan', 'Security Scan', '24K'],
    ['sort', 'Sorting', '24K'],
    ['load', 'Load Aircraft', '23K'],
    ['fly', 'In Flight', '23K'],
    ['unload', 'Unload', '23K'],
    ['carousel', 'Carousel', '22K'],
    ['collect', 'Collect', '21K'],
  ], [['checkin','scan'],['scan','sort'],['sort','load'],['load','fly'],['fly','unload'],['unload','carousel'],['carousel','collect']], [
    { id: 'passenger', cls: 'a', nodes: ['checkin','scan','carousel','collect'] },
    { id: 'security', cls: 'b', nodes: ['scan','sort'] },
    { id: 'ground', cls: 'c', nodes: ['sort','load','unload','carousel'] },
    { id: 'airline', cls: 'd', nodes: ['load','fly','unload'] },
  ]),

  m('cicd', '15 — CI/CD pipeline (4 classes)', [
    ['commit', 'Commit Code'],
    ['build', 'Build'],
    ['unit', 'Unit Tests'],
    ['integ', 'Integration Tests'],
    ['stage', 'Deploy Staging'],
    ['approve', 'Manual Approval'],
    ['prod', 'Deploy Prod'],
    ['monitor', 'Monitor'],
  ], [['commit','build'],['build','unit'],['build','integ'],['unit','stage'],['integ','stage'],['stage','approve'],['approve','prod'],['prod','monitor']], [
    { id: 'dev', cls: 'a', nodes: ['commit','build','unit'] },
    { id: 'qa', cls: 'b', nodes: ['build','integ','stage'] },
    { id: 'ops', cls: 'c', nodes: ['stage','approve','prod','monitor'] },
    { id: 'mgmt', cls: 'd', nodes: ['approve'] },
  ]),

  m('customer_onboard', '16 — Customer onboarding (4 classes)', [
    ['signup', 'Sign Up'],
    ['verify', 'Verify Identity'],
    ['kyc', 'KYC Review'],
    ['account', 'Create Account'],
    ['welcome', 'Welcome Email'],
    ['first_tx', 'First Transaction'],
  ], [['signup','verify'],['verify','kyc'],['kyc','account'],['account','welcome'],['welcome','first_tx']], [
    { id: 'customer', cls: 'a', nodes: ['signup','verify','kyc','account','welcome','first_tx'] },
    { id: 'compliance', cls: 'b', nodes: ['verify','kyc','account'] },
    { id: 'banking', cls: 'c', nodes: ['account','welcome','first_tx'] },
    { id: 'marketing', cls: 'd', nodes: ['welcome'] },
  ]),

  // ── 5. Five classes ───────────────────────────────────────────

  m('o2c_full', '17 — Order-to-Cash full (5 classes)', [
    ['create_order', 'Create Sales Order', '1.32M'],
    ['change_order', 'Change Sales Order', '253K'],
    ['gen_delivery', 'Generate Delivery', '1.22M'],
    ['release_delivery', 'Release Delivery', '1.3M'],
    ['pick_goods', 'Pick Goods', '330K'],
    ['ship_goods', 'Ship Goods', '1.29M'],
    ['create_invoice', 'Create Invoice', '1.29M'],
    ['send_invoice', 'Send Invoice', '1.29M'],
    ['receive_confirm', 'Receive Confirmation', '1.29M'],
    ['clear_invoice', 'Clear Invoice', '1.29M'],
    ['delivery_passed', 'Delivery Date Passed', '1.21M'],
    ['record_payment', 'Record Payment', '892K'],
  ], [
    ['create_order','change_order'],['create_order','gen_delivery'],['change_order','gen_delivery'],
    ['gen_delivery','release_delivery'],['release_delivery','pick_goods'],['pick_goods','ship_goods'],
    ['ship_goods','create_invoice'],['ship_goods','receive_confirm'],['create_invoice','send_invoice'],
    ['send_invoice','clear_invoice'],['receive_confirm','delivery_passed'],
    ['clear_invoice','record_payment'],['delivery_passed','record_payment'],
  ], [
    { id: 'order', cls: 'a', nodes: ['create_order','change_order','gen_delivery','release_delivery','pick_goods','ship_goods','create_invoice','send_invoice','clear_invoice','record_payment'] },
    { id: 'delivery', cls: 'b', nodes: ['create_order','gen_delivery','release_delivery','pick_goods','ship_goods','receive_confirm','delivery_passed','record_payment'] },
    { id: 'invoice', cls: 'c', nodes: ['ship_goods','create_invoice','send_invoice','clear_invoice','record_payment'] },
    { id: 'shipping', cls: 'd', nodes: ['release_delivery','pick_goods','ship_goods','receive_confirm'] },
    { id: 'payment', cls: 'e', nodes: ['clear_invoice','record_payment'] },
  ]),

  m('hire_to_retire', '18 — Hire-to-Retire (5 classes)', [
    ['post', 'Post Job', '5K'],
    ['screen', 'Screen Applicants', '4.8K'],
    ['interview', 'Interview', '2K'],
    ['offer', 'Make Offer', '1.2K'],
    ['onboard', 'Onboard', '1.1K'],
    ['assign', 'Assign Role', '1.1K'],
    ['review', 'Performance Review', '3.2K'],
    ['promote', 'Promote', '800'],
    ['exit', 'Exit Interview', '500'],
  ], [['post','screen'],['screen','interview'],['interview','offer'],['offer','onboard'],['onboard','assign'],['assign','review'],['review','promote'],['review','exit']], [
    { id: 'recruiting', cls: 'a', nodes: ['post','screen','interview','offer'] },
    { id: 'hr', cls: 'b', nodes: ['offer','onboard','assign','review','exit'] },
    { id: 'manager', cls: 'c', nodes: ['assign','review','promote'] },
    { id: 'employee', cls: 'd', nodes: ['onboard','assign','review','promote'] },
    { id: 'finance', cls: 'e', nodes: ['offer'] },
  ]),

  m('logistics_ship', '19 — Logistics shipment (5 classes)', [
    ['book', 'Book Shipment'],
    ['pickup', 'Pickup'],
    ['hub_in', 'Hub Inbound'],
    ['sort', 'Sort'],
    ['hub_out', 'Hub Outbound'],
    ['customs', 'Customs'],
    ['last_mile', 'Last Mile'],
    ['deliver', 'Deliver'],
    ['pod', 'Proof of Delivery'],
  ], [['book','pickup'],['pickup','hub_in'],['hub_in','sort'],['sort','hub_out'],['hub_out','customs'],['customs','last_mile'],['last_mile','deliver'],['deliver','pod']], [
    { id: 'shipper', cls: 'a', nodes: ['book','pickup'] },
    { id: 'carrier', cls: 'b', nodes: ['pickup','hub_in','sort','hub_out','customs','last_mile','deliver'] },
    { id: 'customs_auth', cls: 'c', nodes: ['customs'] },
    { id: 'receiver', cls: 'd', nodes: ['deliver','pod'] },
    { id: 'tracking', cls: 'e', nodes: ['book','pickup','hub_in','sort','hub_out','customs','last_mile','deliver','pod'] },
  ]),

  m('healthcare', '20 — Healthcare patient flow (5 classes)', [
    ['register', 'Register Patient'],
    ['triage', 'Triage'],
    ['consult', 'Doctor Consult'],
    ['lab', 'Lab Tests'],
    ['imaging', 'Imaging'],
    ['diagnose', 'Diagnosis'],
    ['treat', 'Treatment'],
    ['discharge', 'Discharge'],
    ['followup', 'Follow-up'],
  ], [['register','triage'],['triage','consult'],['consult','lab'],['consult','imaging'],['lab','diagnose'],['imaging','diagnose'],['diagnose','treat'],['treat','discharge'],['discharge','followup']], [
    { id: 'patient', cls: 'a', nodes: ['register','triage','consult','lab','diagnose','treat','discharge','followup'] },
    { id: 'doctor', cls: 'b', nodes: ['triage','consult','lab','diagnose','treat'] },
    { id: 'lab_tech', cls: 'c', nodes: ['lab','diagnose'] },
    { id: 'radiology', cls: 'd', nodes: ['imaging','diagnose'] },
    { id: 'nursing', cls: 'e', nodes: ['treat','discharge'] },
  ]),

  // ── 6. Six+ classes ───────────────────────────────────────────

  m('manufacturing', '21 — Manufacturing (6 classes)', [
    ['design', 'Product Design'],
    ['bom', 'Create BOM'],
    ['source', 'Source Materials'],
    ['receive_mat', 'Receive Materials'],
    ['assemble', 'Assembly'],
    ['qc', 'Quality Control'],
    ['pack', 'Pack'],
    ['warehouse', 'Warehouse'],
    ['ship', 'Ship'],
  ], [['design','bom'],['bom','source'],['source','receive_mat'],['receive_mat','assemble'],['assemble','qc'],['qc','pack'],['pack','warehouse'],['warehouse','ship']], [
    { id: 'engineering', cls: 'a', nodes: ['design','bom'] },
    { id: 'procurement', cls: 'b', nodes: ['bom','source','receive_mat'] },
    { id: 'production', cls: 'c', nodes: ['receive_mat','assemble','qc'] },
    { id: 'quality', cls: 'd', nodes: ['qc'] },
    { id: 'logistics', cls: 'e', nodes: ['pack','warehouse','ship'] },
    { id: 'planning', cls: 'f', nodes: ['design','bom'] },
  ]),

  m('movie_production', '22 — Movie production (6 classes)', [
    ['script', 'Script'],
    ['cast', 'Casting'],
    ['location', 'Location Scout'],
    ['film', 'Principal Photography'],
    ['vfx', 'VFX'],
    ['edit', 'Editing'],
    ['score', 'Score Music'],
    ['market', 'Marketing'],
    ['release', 'Release'],
  ], [['script','cast'],['script','location'],['cast','film'],['location','film'],['film','vfx'],['film','edit'],['vfx','edit'],['edit','score'],['score','market'],['market','release']], [
    { id: 'writer', cls: 'a', nodes: ['script'] },
    { id: 'director', cls: 'b', nodes: ['script','cast','film','edit'] },
    { id: 'producer', cls: 'c', nodes: ['cast','film','edit','score','market','release'] },
    { id: 'vfx_studio', cls: 'd', nodes: ['vfx','edit'] },
    { id: 'composer', cls: 'e', nodes: ['score'] },
    { id: 'distributor', cls: 'f', nodes: ['market','release'] },
  ]),

  // ── 7. Edge cases ─────────────────────────────────────────────

  m('single_node', '23 — Single node', [
    ['only', 'Standalone Event'],
  ], [], [
    { id: 'flow', cls: 'a', nodes: ['only'] },
  ]),

  m('deep_chain', '24 — Deep chain (10 nodes, 2 classes)', [
    ['n1','Step 1'],['n2','Step 2'],['n3','Step 3'],['n4','Step 4'],['n5','Step 5'],
    ['n6','Step 6'],['n7','Step 7'],['n8','Step 8'],['n9','Step 9'],['n10','Step 10'],
  ], [['n1','n2'],['n2','n3'],['n3','n4'],['n4','n5'],['n5','n6'],['n6','n7'],['n7','n8'],['n8','n9'],['n9','n10']], [
    { id: 'primary', cls: 'a', nodes: ['n1','n2','n3','n4','n5','n6','n7','n8','n9','n10'] },
    { id: 'secondary', cls: 'b', nodes: ['n1','n2','n3','n4','n5','n6','n7','n8','n9','n10'] },
  ]),

  m('multi_start', '25 — Multiple start nodes (3 sources)', [
    ['web', 'Web Channel'],
    ['mobile', 'Mobile App'],
    ['store', 'In Store'],
    ['queue', 'Order Queue'],
    ['process', 'Process'],
    ['complete', 'Complete'],
  ], [['web','queue'],['mobile','queue'],['store','queue'],['queue','process'],['process','complete']], [
    { id: 'web_flow', cls: 'a', nodes: ['web','queue','process','complete'] },
    { id: 'mobile_flow', cls: 'b', nodes: ['mobile','queue','process','complete'] },
    { id: 'store_flow', cls: 'c', nodes: ['store','queue','process','complete'] },
  ]),

  m('multi_end', '26 — Multiple end nodes (3 sinks)', [
    ['start', 'Receive Request'],
    ['classify', 'Classify'],
    ['urgent', 'Urgent Response'],
    ['normal', 'Standard Response'],
    ['archive', 'Archive'],
  ], [['start','classify'],['classify','urgent'],['classify','normal'],['classify','archive']], [
    { id: 'urgent_flow', cls: 'a', nodes: ['start','classify','urgent'] },
    { id: 'normal_flow', cls: 'b', nodes: ['start','classify','normal'] },
    { id: 'archive_flow', cls: 'c', nodes: ['classify','archive'] },
  ]),

  m('cross_hatch', '27 — Cross-hatch (many shared nodes, 3 classes)', [
    ['a', 'Alpha'],['b', 'Beta'],['c', 'Gamma'],['d', 'Delta'],
    ['e', 'Epsilon'],['f', 'Zeta'],
  ], [['a','b'],['a','c'],['b','d'],['c','d'],['d','e'],['d','f']], [
    { id: 'left', cls: 'a', nodes: ['a','b','d','e'] },
    { id: 'right', cls: 'b', nodes: ['a','c','d','f'] },
    { id: 'through', cls: 'c', nodes: ['a','c','d','f'] },
  ]),

  // ── 8. More realistic/creative ────────────────────────────────

  m('ecommerce_return', '28 — E-commerce return (4 classes)', [
    ['request', 'Return Request'],
    ['approve_ret', 'Approve Return'],
    ['ship_back', 'Ship Back'],
    ['inspect', 'Inspect Item'],
    ['refund', 'Issue Refund'],
    ['restock', 'Restock'],
    ['dispose', 'Dispose'],
  ], [['request','approve_ret'],['approve_ret','ship_back'],['ship_back','inspect'],['inspect','refund'],['inspect','restock'],['inspect','dispose']], [
    { id: 'customer', cls: 'a', nodes: ['request','approve_ret','ship_back','inspect','refund'] },
    { id: 'warehouse', cls: 'b', nodes: ['inspect','restock'] },
    { id: 'finance', cls: 'c', nodes: ['refund'] },
    { id: 'quality', cls: 'd', nodes: ['inspect','dispose'] },
  ]),

  m('event_planning', '29 — Event planning (5 classes)', [
    ['concept', 'Event Concept'],
    ['budget', 'Budget'],
    ['venue', 'Book Venue'],
    ['speakers', 'Book Speakers'],
    ['promo', 'Promote'],
    ['tickets', 'Ticket Sales'],
    ['setup', 'Setup'],
    ['event', 'Event Day'],
    ['feedback', 'Feedback'],
  ], [['concept','budget'],['budget','venue'],['budget','speakers'],['venue','promo'],['speakers','promo'],['promo','tickets'],['tickets','setup'],['setup','event'],['event','feedback']], [
    { id: 'organizer', cls: 'a', nodes: ['concept','budget','venue','promo','tickets','setup','event'] },
    { id: 'marketing', cls: 'b', nodes: ['promo','tickets'] },
    { id: 'venue_mgr', cls: 'c', nodes: ['venue','promo','tickets','setup'] },
    { id: 'speaker', cls: 'd', nodes: ['speakers','promo','tickets','setup','event'] },
    { id: 'attendee', cls: 'e', nodes: ['tickets','setup','event','feedback'] },
  ]),

  m('supply_chain_10cls', '30 — Supply chain (8 classes, complex)', [
    ['forecast', 'Demand Forecast'],
    ['plan', 'Production Plan'],
    ['source', 'Source Raw Materials'],
    ['warehouse_in', 'Warehouse Receiving'],
    ['manufacture', 'Manufacture'],
    ['qc', 'Quality Check'],
    ['pack', 'Pack & Label'],
    ['dist_center', 'Distribution Center'],
    ['transport', 'Transport'],
    ['retail', 'Retail Store'],
    ['customer', 'Customer Purchase'],
    ['return', 'Return'],
  ], [
    ['forecast','plan'],['plan','source'],['source','warehouse_in'],['warehouse_in','manufacture'],
    ['manufacture','qc'],['qc','pack'],['pack','dist_center'],['dist_center','transport'],
    ['transport','retail'],['retail','customer'],['customer','return'],
  ], [
    { id: 'planning', cls: 'a', nodes: ['forecast','plan'] },
    { id: 'procurement', cls: 'b', nodes: ['plan','source','warehouse_in'] },
    { id: 'production', cls: 'c', nodes: ['warehouse_in','manufacture','qc','pack'] },
    { id: 'quality', cls: 'd', nodes: ['qc'] },
    { id: 'distribution', cls: 'e', nodes: ['pack','dist_center','transport'] },
    { id: 'retail_ops', cls: 'f', nodes: ['retail','customer'] },
    { id: 'logistics', cls: 'g', nodes: ['source','warehouse_in','manufacture','qc','pack','dist_center','transport'] },
    { id: 'customer_svc', cls: 'h', nodes: ['customer','return'] },
  ]),

  // ── 9. Dim/heatmap models ───────────────────────────────────

  (function() {
    var model = m('mfg_dim', '31 — Manufacturing with dim (4 classes, 10 nodes)', [
      ['order', 'Order', '2K'], ['plan', 'Plan', '1.8K'],
      ['source', 'Source', '900'], ['inspect', 'Inspect', '228'],
      ['prepare', 'Prepare'], ['assemble', 'Assemble'],
      ['weld', 'Weld'], ['paint', 'Paint'],
      ['qa', 'QA Check'], ['ship', 'Ship'],
    ], [
      ['order','plan'],['plan','source'],['source','inspect'],['inspect','prepare'],
      ['prepare','assemble'],['assemble','weld'],['weld','paint'],['paint','qa'],['qa','ship'],
    ], [
      { id: 'material', cls: 'a', nodes: ['order','plan','source','inspect','prepare'] },
      { id: 'assembly', cls: 'b', nodes: ['prepare','assemble','weld','paint'] },
      { id: 'quality', cls: 'c', nodes: ['paint','qa','ship'] },
      { id: 'logistics', cls: 'd', nodes: ['qa','ship'] },
    ]);
    ['prepare','assemble','weld','paint','qa','ship'].forEach(function(id) {
      var nd = model.dag.nodes.find(function(n) { return n.id === id; });
      if (nd) nd.dim = true;
    });
    return model;
  })(),

  (function() {
    var model = m('pipeline_dim', '32 — Pipeline with dim (3 classes, 8 nodes)', [
      ['ingest_a', 'API Ingest', '1.3M'], ['ingest_b', 'File Import'],
      ['validate', 'Validate', '1.5M'], ['transform', 'Transform', '1.5M'],
      ['score', 'ML Score', '1.4M'], ['review', 'Manual Review'],
      ['store', 'Store', '1.4M'], ['archive', 'Archive'],
    ], [
      ['ingest_a','validate'],['ingest_b','validate'],
      ['validate','transform'],['transform','score'],
      ['score','store'],['score','review'],['review','store'],
      ['store','archive'],
    ], [
      { id: 'hot_path', cls: 'a', nodes: ['ingest_a','validate','transform','score','store'] },
      { id: 'cold_ingest', cls: 'b', nodes: ['ingest_b','validate'] },
      { id: 'manual', cls: 'c', nodes: ['score','review','store'] },
    ]);
    ['ingest_b','review','archive'].forEach(function(id) {
      var nd = model.dag.nodes.find(function(n) { return n.id === id; });
      if (nd) nd.dim = true;
    });
    return model;
  })(),

];
