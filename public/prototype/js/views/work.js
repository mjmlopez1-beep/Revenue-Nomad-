/* The work (#work, #work.<problem>, #work.<id>): the deliverables operators publish, as a second, visual way into
   the marketplace alongside people. Companies come in by the deliverable they need (a comp plan, a 30/60/90 plan)
   or by the template they want to start from, then meet the operator who built it.

   Data: RN.data.work (js/data/work.js, placeholders until the portfolio export lands).
   Access: the cover, contents and outcome are public; the full document is shared after an intro.

   API (for Home and other views):
     RN.work.all()                 every sample whose operator is listed, in gallery order
     RN.work.get(id)               one sample or null
     RN.work.byProblem(key)        samples for a RN.fields.need key (sales_motion, pipeline, ...), gallery order
     RN.work.forOp(opId)           one operator's samples
     RN.work.card(s, o)            the cover card HTML (o.size: 'sm' for rows)
     RN.work.cover(s, o)           the designed cover alone
     RN.work.preview(s)            the deliverable preview drawn on the cover (SVG, per type)
     RN.work.grid(list, o)         the packed showcase grid (o = { limit, phone, features, ragged, source })
     RN.work.showcase(o)           Home's featured section body: type tabs that filter in place (wk-show-type),
                                   the grid of 12 (8 on phones), "Explore all" into #work via RN.work.openType
     RN.work.strip(o)              a horizontal row of 6 to 8 cover cards:
                                   o = { need, limit (6 to 8, default 8), title, link (default true), source }
                                   The isMatt operator's samples never sit in the first four. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = () => RN.fields;
  const W = (RN.work = RN.work || {});

  const TYPES = ['Playbook', 'Comp plan', 'Dashboard', '30/60/90 plan', 'Process map', 'Template', 'Framework', 'Program'];
  const TYPE_PL = { Playbook: 'Playbooks', 'Comp plan': 'Comp plans', Dashboard: 'Dashboards', '30/60/90 plan': '30/60/90 plans', 'Process map': 'Process maps', Template: 'Templates', Framework: 'Frameworks', Program: 'Programs' };
  const TYPE_IC = { Playbook: 'book', 'Comp plan': 'trend-up', Dashboard: 'chart', '30/60/90 plan': 'calendar', 'Process map': 'layers', Template: 'doc', Framework: 'grid', Program: 'users' };
  const PROB_SHORT = { sales_motion: 'Sales motion', pipeline: 'Pipeline', team: 'Team', systems: 'Systems', ai: 'AI', retention: 'Retention', partners: 'Partners' };
  const LANDSCAPE = { Dashboard: 1, 'Process map': 1 };

  const dash = (s) => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, '-');
  const needOpts = () => F().need.options.filter((o) => o.v !== 'not_sure');
  const needLabel = (k) => { const o = F().need.options.find((x) => x.v === k); return o ? o.l : k; };
  const opOf = (s) => (RN.model && RN.model.byId ? RN.model.byId(s.opId) : null);
  const fmtLen = (s) => (s.pages ? `${s.pages} ${s.unit === 'slides' ? (s.pages === 1 ? 'slide' : 'slides') : (s.pages === 1 ? 'page' : 'pages')}` : '');
  const sizeLabel = (v) => (v ? `${dash(RN.w.label('employeeRange', v))} employees` : '');
  const indLabel = (v) => (v ? RN.w.label('industry', v) : '');
  const isLand = (s) => s.unit === 'slides' || !!LANDSCAPE[s.type];

  /* ---------- Data access ---------- */
  W.all = () => (RN.data.work || []).filter((s) => { const op = opOf(s); return op && !op.hidden; });
  W.get = (id) => W.all().find((s) => s.id === id) || null;
  W.byProblem = (key) => W.all().filter((s) => !key || key === 'all' || s.problem === key);
  W.forOp = (opId) => W.all().filter((s) => s.opId === opId);
  W.types = TYPES;
  /* Keep the isMatt operator's samples out of the first n of a list (founder decision: no founder up front) */
  function demoteMatt(list, n) {
    const out = list.slice();
    const head = out.slice(0, n);
    const moved = head.filter((s) => { const op = opOf(s); return op && op.isMatt; });
    if (!moved.length) return out;
    const rest = out.filter((s) => !moved.includes(s));
    const at = Math.min(n, rest.length);
    return rest.slice(0, at).concat(moved, rest.slice(at));
  }
  W.demote = demoteMatt;

  /* ---------- The cover ----------
     A designed document cover: type and length on a top rule, the title set like a cover, a preview of the
     deliverable drawn in SVG (a believable page, chart or grid per type, generic labels only, numbers only where
     they are structure: tiers, weeks, days), a footer with the problem and a catalogue number. Paper texture is a
     CSS overlay. Portrait for documents (preview under the title), landscape for slides (preview beside it).
     Preview colours read the cover tone variables, so every tone works in light and dark. Text inside the preview
     drops out on small covers (container query in work.css) so cards stay calm. */
  const T = (x, y, s, c, fs, a) => `<text x="${x}" y="${y}" class="${c || 'm'}" font-size="${fs || 5.5}"${a ? ` text-anchor="${a}"` : ''}>${esc(s)}</text>`;
  const Ln = (x, y, w, c) => `<rect class="${c || 'tx'}" x="${x}" y="${y}" width="${w}" height="2.6" rx="1.3"/>`;
  const R = (x, y, w, h, c, r) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r == null ? 2 : r}"/>`;
  const svg = (inner, cls) => `<svg class="wk-v${cls ? ' ' + cls : ''}" viewBox="0 0 160 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${inner}</svg>`;
  const panel = () => R(0.5, 0.5, 159, 119, 'pn', 4);

  function vDashboard(s) {
    const kpis = s.fig === 'funnel' ? ['Leads', 'MQL to SQL', 'Cost per SQL'] : ['Coverage', 'Win rate', 'Cycle time'];
    const spark = ['M0 8L6 6L12 7L18 3L24 2', 'M0 5L6 7L12 4L18 5L24 3', 'M0 2L6 4L12 3L18 6L24 7'];
    let k = '';
    kpis.forEach((l, i) => {
      const x = 8 + i * 49;
      k += R(x, 20, 45, 25, 'cell', 2.5) + T(x + 4, 28, l, 'm t', 5) + R(x + 4, 33, 16 + (i % 2) * 5, 6, i === 0 ? 'hi' : 'ink', 1.2)
        + `<path class="sp" d="${spark[i]}" transform="translate(${x + 17 + (i % 2) * 2} 33)"/>`;
    });
    // Line chart with gridlines and week ticks
    let ch = '';
    [56, 68, 80, 92].forEach((y) => { ch += `<path class="gl" d="M8 ${y}H96"/>`; });
    ['W1', 'W4', 'W8', 'W12'].forEach((t, i) => { ch += T(10 + i * 27, 100, t, 'm t', 4.6, 'middle'); });
    ch += '<path class="ar" d="M8 86L20 82L32 84L44 74L56 72L68 66L80 62L96 56V92H8Z"/><path class="st" d="M8 86L20 82L32 84L44 74L56 72L68 66L80 62L96 56"/><path class="dh" d="M8 78L96 62"/><circle class="hi" cx="96" cy="56" r="2.2"/>';
    // Stage table
    const rows = s.fig === 'funnel' ? [['Visit', 40], ['Lead', 32], ['MQL', 22], ['SQL', 14], ['Opp', 9]] : [['Disc.', 38], ['Eval.', 30], ['Prop.', 22], ['Neg.', 15], ['Commit', 10]];
    let tb = T(104, 56, 'By stage', 'k t b', 5.2);
    rows.forEach(([l, w], i) => { const y = 62 + i * 8.6; tb += T(104, y + 4.6, l, 'm t', 4.6) + R(124, y, w * 0.7, 5, i === rows.length - 1 ? 'hi' : 'a2', 1) + `<path class="gl" d="M104 ${y + 7.2}H152"/>`; });
    const head = T(8, 12.5, s.fig === 'funnel' ? 'Funnel and attribution' : 'Pipeline and forecast', 'k b t', 6.6) + R(122, 6, 30, 9, 'cell', 4.5) + T(137, 12, 'This quarter', 'm t', 4.2, 'middle');
    const leg = `<circle class="a" cx="10" cy="110" r="1.8"/>${T(14, 112, 'Actual', 'm t', 4.6)}<path class="dh" d="M36 110H44"/>${T(47, 112, 'Target', 'm t', 4.6)}`;
    return svg(panel() + head + k + ch + tb + leg);
  }

  function vComp() {
    let g = T(8, 12.5, 'Payout curve', 'k b t', 6.6) + T(152, 12.5, 'Plan year', 'm t', 4.8, 'end');
    // Axes, quota line, ticks
    g += '<path class="ax" d="M22 20V70H152"/>';
    [['50%', 54], ['100%', 87], ['150%', 120]].forEach(([l, x]) => { g += `<path class="ax" d="M${x} 70V72"/>` + T(x, 78, l, 'm t', 4.6, 'middle'); });
    [['1x', 58], ['2x', 42], ['3x', 26]].forEach(([l, y]) => { g += T(19, y + 1.6, l, 'm t', 4.4, 'end') + `<path class="gl" d="M22 ${y}H152"/>`; });
    g += '<path class="dh" d="M87 20V70"/>' + T(89, 24, 'Quota', 'm t', 4.4);
    g += '<path class="ar" d="M22 70L54 62L87 50L120 33L152 18V70Z"/><path class="st w" d="M22 70L54 62L87 50L120 33L152 18"/>';
    g += '<circle class="hi" cx="87" cy="50" r="2.2"/><circle class="hi" cx="120" cy="33" r="2.2"/>';
    g += R(58, 46, 18, 8, 'pill', 4) + T(67, 51.6, '1.0x', 'k t b', 4.6, 'middle');
    g += R(92, 34, 18, 8, 'pill', 4) + T(101, 39.6, '1.5x', 'k t b', 4.6, 'middle');
    g += R(124, 17, 18, 8, 'hi', 4) + T(133, 22.6, '2.0x', 'oh t b', 4.6, 'middle');
    // Payout table
    g += R(8, 84, 144, 9, 'cell', 1.5) + T(12, 90.2, 'Tier', 'm t b', 4.6) + T(40, 90.2, 'Attainment', 'm t b', 4.6) + T(148, 90.2, 'Rate', 'm t b', 4.6, 'end');
    [['1', '0 to 100%', '1.0x'], ['2', '100 to 150%', '1.5x'], ['3', '150% and up', '2.0x']].forEach(([a, b, c], i) => {
      const y = 100 + i * 8;
      g += T(12, y, a, 'k t', 4.8) + T(40, y, b, 'k t', 4.8) + T(148, y, c, i === 2 ? 'k t b' : 'k t', 4.8, 'end') + `<path class="gl" d="M8 ${y + 2.6}H152"/>`;
    });
    return svg(panel() + g);
  }

  function vPlaybook(s) {
    const H = { pyramid: ['Positioning', 'Message house'], phases: ['Territory plan', 'Account tiers'], flow: ['Discovery', 'Qualify the deal'] }[s.fig] || ['Discovery', 'Qualify the deal'];
    let g = T(10, 15, '2', 'hit b', 8) + T(20, 15, H[0], 'k b t', 7.4) + T(150, 15, 'p. 7', 'm t', 4.6, 'end');
    g += '<path class="gl" d="M10 19.5H150"/>';
    g += Ln(10, 24, 140) + Ln(10, 29.5, 132) + Ln(10, 35, 96);
    g += T(10, 46, '2.1', 'hit b t', 5.4) + T(21, 46, H[1], 'k b t', 5.4);
    g += Ln(10, 50, 136) + Ln(10, 55.5, 118);
    // Callout
    g += R(10, 62, 140, 20, 'call', 2) + R(10, 62, 2.2, 20, 'hi', 1) + T(17, 69.5, 'Rule of thumb', 'k b t', 4.8) + Ln(17, 73, 120, 'tx2') + Ln(17, 77.4, 84, 'tx2');
    // Small diagram
    if (s.fig === 'pyramid') {
      g += '<path class="hi" d="M80 88L92 98H68Z"/><path class="a2s" d="M66 99.5H94L102 108H58Z"/><path class="a2s" d="M56 109.5H104L112 117H48Z"/>';
      g += T(116, 96, 'Category', 'm t', 4.4) + T(116, 105, 'Message', 'm t', 4.4) + T(118, 115, 'Proof', 'm t', 4.4);
    } else if (s.fig === 'phases') {
      ['Tier 1', 'Tier 2', 'Tier 3'].forEach((l, i) => { g += R(10 + i * 47.5, 90, 45, 22, i === 0 ? 'hic' : 'cell', 2) + T(14 + i * 47.5, 98, l, i === 0 ? 'oh t b' : 'k t b', 4.8) + Ln(14 + i * 47.5, 103, 34 - i * 6, i === 0 ? 'txo' : 'tx'); });
    } else {
      ['Open', 'Discover', 'Qualify', 'Propose', 'Close'].forEach((l, i) => {
        const x = 10 + i * 28.4;
        g += `<path class="${i === 2 ? 'hi' : 'a2'}" d="M${x} 92H${x + 25}L${x + 29} 99L${x + 25} 106H${x}L${x + 4} 99Z"/>` + T(x + 15, 100.6, l, i === 2 ? 'oh t b' : 'k t', 4.2, 'middle');
      });
      g += Ln(10, 112, 108);
    }
    return svg(R(0.5, 0.5, 159, 119, 'pg', 3) + g);
  }

  function vPlan() {
    const cols = ['Days 1-30', '31-60', '61-90'], rows = ['Listen', 'Diagnose', 'Plan', 'Build'];
    const x0 = 40, cw = 37.3, y0 = 22, rh = 18;
    let g = '';
    cols.forEach((c, i) => { g += R(x0 + i * cw + 0.8, 6, cw - 1.6, 11, i === 1 ? 'hic' : 'cell', 2) + T(x0 + i * cw + cw / 2, 13.2, c, i === 1 ? 'oh t b' : 'k t b', 4.8, 'middle'); });
    rows.forEach((r, i) => { const y = y0 + i * rh; g += T(8, y + 10.6, r, 'k t', 5) + `<path class="gl" d="M8 ${y + rh}H152"/>`; });
    [0, 1, 2, 3].forEach((i) => { g += `<path class="gl" d="M${x0 + i * cw} ${y0}V${y0 + 4 * rh}"/>`; });
    const bars = [[0, 0, 1.0], [1, 0.4, 1.5], [2, 1.0, 2.6], [3, 1.8, 3.0]];
    bars.forEach(([r, a, b]) => { g += R(x0 + a * cw + 2, y0 + r * rh + 6, (b - a) * cw - 4, 6, r === 2 ? 'hi' : 'a2', 3); });
    g += T(8, 108, 'Checkpoint', 'm t', 4.8);
    ['30', '60', '90'].forEach((d, i) => { const x = x0 + (i + 1) * cw - 2; g += `<path class="hi" d="M${x} 99.5L${x + 3.5} 103L${x} 106.5L${x - 3.5} 103Z"/>` + T(x, 114, d, 'k t b', 4.8, 'middle'); });
    return svg(panel() + g);
  }

  function vProcess(s) {
    const L = s.problem === 'ai' ? ['Agent', 'SDR', 'Review'] : s.fig === 'stages' ? ['Buyer', 'Sales', 'RevOps'] : ['Sales', 'Finance', 'RevOps'];
    const B = s.problem === 'ai' ? [['Enrich', 'Draft brief'], ['Read', 'Call'], ['Check']] : s.fig === 'stages' ? [['Request', 'Evaluate'], ['Qualify', 'Propose'], ['Route']] : [['Quote', 'Close'], ['Invoice', 'Collect'], ['Provision']];
    let g = '';
    L.forEach((l, i) => { const y = 4 + i * 38; g += R(4, y, 152, 36, i === 1 ? 'lane2' : 'lane', 2) + R(4, y, 22, 36, 'cell', 2) + `<text class="k t b" font-size="5" transform="translate(16.5 ${y + 18}) rotate(-90)" text-anchor="middle">${esc(l)}</text>`; });
    const box = (x, y, t, hi) => R(x, y, 30, 14, hi ? 'hi' : 'nd', 2.5) + T(x + 15, y + 8.8, t, hi ? 'oh t b' : 'k t', 4.6, 'middle');
    g += '<path class="cn" d="M62 22H72M102 22H114V57H102M72 64H66V95H80M110 95H118V22"/>';
    g += box(32, 15, B[0][0]) + box(72, 15, B[0][1]) + box(72, 53, B[1][0]) + box(36, 53, B[1][1], false);
    g += '<path class="nd" d="M128 15L136 22L128 29L120 22Z"/>' + T(128, 24, '?', 'k t b', 5.4, 'middle');
    g += box(80, 88, B[2][0], true);
    g += '<path class="cn" d="M136 22H148V95H110"/><circle class="a" cx="148" cy="95" r="2.4"/>';
    return svg(R(0.5, 0.5, 159, 119, 'pn', 4) + g);
  }

  function vTemplate(s) {
    const name = { bars: 'Business review', check: 'Plan of record' }[s.fig] || 'Plan of record';
    let g = T(8, 13, name, 'k b t', 6.8) + R(118, 6, 34, 9, 'cell', 4.5) + T(135, 12, 'Draft', 'm t', 4.4, 'middle') + '<path class="gl" d="M8 18H152"/>';
    const field = (x, y, w, l, fill) => T(x, y, l, 'm t', 4.6) + R(x, y + 2.5, w, 9, 'fld', 1.5) + Ln(x + 3, y + 5.7, fill, 'tx2');
    g += field(8, 26, 70, 'Account', 46) + field(82, 26, 70, 'Owner', 30);
    g += T(8, 46, 'Stage', 'm t', 4.6);
    ['Discover', 'Evaluate', 'Decide'].forEach((l, i) => { g += R(8 + i * 34, 48.5, 31, 9, i === 1 ? 'hi' : 'pill', 4.5) + T(23.5 + i * 34, 54.4, l, i === 1 ? 'oh t b' : 'k t', 4.4, 'middle'); });
    g += field(112, 46, 40, 'Target date', 22);
    const items = [['Success criteria agreed', 1], ['Security review', 1], ['Legal redlines', 1], ['Pricing approved', 0], ['Signature', 0]];
    items.forEach(([l, d], i) => {
      const y = 66 + i * 10;
      g += R(8, y, 7, 7, d ? 'hi' : 'box', 1.5) + (d ? `<path class="ck" d="M9.8 ${y + 3.6}L11.2 ${y + 5}L13.4 ${y + 2}"/>` : '') + T(19, y + 5.4, l, d ? 'k t' : 'm t', 4.8) + Ln(100, y + 2.2, 26 + (i % 3) * 8, 'tx');
    });
    return svg(R(0.5, 0.5, 159, 119, 'pg', 3) + g);
  }

  function vFramework(s) {
    let g = '';
    if (s.fig === 'matrix') {
      g += T(8, 12.5, 'Prioritise', 'k b t', 6.6) + T(152, 12.5, '2 x 2', 'm t', 4.8, 'end');
      const x0 = 22, y0 = 18, w = 130, h = 84;
      g += R(x0, y0, w / 2 - 1, h / 2 - 1, 'hic', 2) + R(x0 + w / 2 + 1, y0, w / 2 - 1, h / 2 - 1, 'cell', 2) + R(x0, y0 + h / 2 + 1, w / 2 - 1, h / 2 - 1, 'cell', 2) + R(x0 + w / 2 + 1, y0 + h / 2 + 1, w / 2 - 1, h / 2 - 1, 'cell', 2);
      g += T(x0 + 4, y0 + 8, 'Act now', 'oh t b', 5) + T(x0 + w / 2 + 5, y0 + 8, 'Plan', 'k t b', 5) + T(x0 + 4, y0 + h / 2 + 9, 'Watch', 'k t b', 5) + T(x0 + w / 2 + 5, y0 + h / 2 + 9, 'Monitor', 'k t b', 5);
      [[38, 34, 'oh'], [52, 46, 'oh'], [100, 30, 'a'], [120, 50, 'a'], [44, 78, 'a'], [70, 90, 'a'], [112, 84, 'a'], [134, 72, 'a']].forEach(([x, y, c]) => { g += `<circle class="${c === 'oh' ? 'dot2' : 'a'}" cx="${x}" cy="${y}" r="2.6"/>`; });
      g += `<text class="m t" font-size="4.6" transform="translate(16 ${y0 + h / 2}) rotate(-90)" text-anchor="middle">Impact</text>` + T(x0 + w / 2, 112, 'Effort', 'm t', 4.6, 'middle');
      return svg(panel() + g);
    }
    // Scoring table
    const rows = s.fig === 'nodes' ? ['Fit', 'Shared accounts', 'Co-sell motion', 'Enablement'] : ['Opening', 'Discovery', 'Next steps', 'Talk ratio'];
    g += T(8, 12.5, 'Scorecard', 'k b t', 6.6) + T(152, 12.5, 'Score 1-5', 'm t', 4.8, 'end');
    g += R(8, 18, 144, 10, 'cell', 1.5) + T(12, 24.6, 'Criteria', 'm t b', 4.6);
    [1, 2, 3, 4, 5].forEach((n) => { g += T(84 + (n - 1) * 15, 24.6, String(n), 'm t b', 4.6, 'middle'); });
    const sc = [4, 3, 5, 2];
    rows.forEach((r, i) => {
      const y = 34 + i * 15;
      g += T(12, y + 6, r, 'k t', 5) + `<path class="gl" d="M8 ${y + 11}H152"/>`;
      [1, 2, 3, 4, 5].forEach((n) => { g += `<circle class="${n === sc[i] ? 'hi' : n < sc[i] ? 'a2' : 'box'}" cx="${84 + (n - 1) * 15}" cy="${y + 4.4}" r="3.4"/>`; });
    });
    g += R(8, 99, 144, 14, 'call', 2) + R(8, 99, 2.2, 14, 'hi', 1) + T(15, 107.6, 'Weighted total', 'k t b', 5) + R(120, 103, 28, 6, 'tx2', 3);
    return svg(panel() + g);
  }

  function vProgram(s) {
    const rows = s.fig === 'pyramid' ? ['Recruit', 'Onboard', 'Enable', 'Co-sell'] : ['Learn', 'Shadow', 'Practice', 'Certify'];
    const x0 = 36, cw = 19.3, y0 = 20, rh = 17;
    let g = '';
    for (let w = 0; w < 6; w++) g += T(x0 + w * cw + cw / 2, 13, `Wk ${w + 1}`, 'k t b', 4.6, 'middle');
    rows.forEach((r, i) => { const y = y0 + i * rh; g += T(8, y + 10, r, 'k t', 5); });
    const fill = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [4, 5]];
    rows.forEach((r, i) => {
      for (let w = 0; w < 6; w++) {
        const on = fill[i].includes(w);
        g += R(x0 + w * cw + 1, y0 + i * rh + 2, cw - 2, rh - 4, on ? (i === 3 ? 'hi' : 'a2') : 'cell', 2);
      }
    });
    g += '<path class="gl" d="M8 92H152"/>' + T(8, 102, 'Checkpoints', 'm t', 4.6);
    [2, 4, 6].forEach((w) => { const x = x0 + w * cw - cw / 2; g += `<path class="hi" d="M${x} 97L${x + 3.5} 100.5L${x} 104L${x - 3.5} 100.5Z"/>`; });
    g += Ln(36, 110, 90);
    return svg(panel() + g);
  }

  function preview(s) {
    switch (s.type) {
      case 'Dashboard': return vDashboard(s);
      case 'Comp plan': return vComp(s);
      case '30/60/90 plan': return vPlan(s);
      case 'Process map': return vProcess(s);
      case 'Template': return vTemplate(s);
      case 'Framework': return vFramework(s);
      case 'Program': return vProgram(s);
      default: return vPlaybook(s);
    }
  }
  W.preview = preview;
  W.cover = function (s, o) {
    o = o || {};
    const op = opOf(s);
    const no = String(W.all().indexOf(s) + 1).padStart(2, '0');
    return `<span class="wk-cover tone-${esc(s.tone || 'paper')} ${isLand(s) ? 'land' : 'port'}${o.big ? ' big' : ''}" aria-hidden="true">
      <span class="wk-cv-top"><span>${esc(s.type)}</span><span>${esc(fmtLen(s))}</span></span>
      <span class="wk-cv-title">${esc(s.title)}</span>
      <span class="wk-cv-fig">${preview(s)}</span>
      <span class="wk-cv-foot"><span>${esc(PROB_SHORT[s.problem] || '')}${op ? ` · ${esc(op.initials || RN.fmt.initials(op.name))}` : ''}</span><span>No. ${no}</span></span>
    </span>`;
  };

  /* ---------- The card ---------- */
  W.card = function (s, o) {
    o = o || {};
    const op = opOf(s);
    if (!op) return '';
    const href = `#work.${esc(s.id)}`;
    return `<article class="wk-card${o.size === 'sm' ? ' sm' : ''}">
      <a class="wk-card-cover" href="${href}" tabindex="-1" aria-hidden="true">${W.cover(s)}</a>
      <div class="wk-card-body">
        <span class="wk-card-type">${esc(s.type)}<span aria-hidden="true"> · </span>${esc(fmtLen(s))}</span>
        <h3 class="wk-card-t"><a href="${href}">${esc(s.title)}</a></h3>
        ${o.size === 'sm' ? '' : `<p class="wk-card-out">${esc(s.outcome)}</p>`}
        <a class="wk-by" href="#op.${esc(op.slug)}" data-view-source="work">
          ${RN.ui.avatar(op, 'ava-xs', { decorative: true })}<span class="wk-by-n">${esc(op.name)}</span>${RN.ui.cardTier(op, { pill: true, inLink: true })}
        </a>
      </div>
    </article>`;
  };

  /* ---------- Home row ---------- */
  W.strip = function (o) {
    o = o || {};
    const n = RN.clamp(+o.limit || 8, 6, 8);
    let list = W.byProblem(o.need);
    if (list.length < 6 && o.need) list = list.concat(W.all().filter((s) => !list.includes(s)));
    // One per operator first, so the row shows range, then the rest
    const seen = new Set(), first = [], rest = [];
    list.forEach((s) => { if (seen.has(s.opId)) rest.push(s); else { seen.add(s.opId); first.push(s); } });
    list = demoteMatt(first.concat(rest), 4).slice(0, n);
    const title = o.title == null ? 'See the work' : o.title;
    const link = o.need && o.need !== 'all' ? `work.${o.need}` : 'work';
    return `<div class="wk-strip" data-view-source="${esc(o.source || 'home')}">
      ${title || o.link !== false ? `<div class="wk-strip-hd">${title ? `<h3 class="label">${esc(title)}</h3>` : '<span></span>'}${o.link === false ? '' : `<a class="act" href="#${esc(link)}">See all the work${icon('arrow')}</a>`}</div>` : ''}
      <ul class="wk-strip-row" aria-label="${esc(title || 'Work samples')}">${list.map((s) => `<li>${W.card(s, { size: 'sm' })}</li>`).join('')}</ul>
    </div>`;
  };

  /* ---------- Showcase (Home's "The work" and the gallery grid) ----------
     A dense, justified grid of covers in the spirit of a portfolio home page. Three layouts are packed in JS
     (6 columns from 1100px, 4 from 720px, 2 below) so every row ends flush: a portrait cover takes one cell,
     a landscape cover two cells side by side, and feature tiles take 2 x 2 (portrait) or 4 x 2 (landscape).
     Rows are sized from the column width in CSS (container query units), so covers fill their tiles.
     DOM order is the desktop order; the isMatt operator never lands in the first four tiles of any layout. */
  const isMatt = (s) => { const op = opOf(s); return !!(op && op.isMatt); };
  const calm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.webdriver; } catch (e) { return true; } };

  /* Packing: a small search over shapes (portrait 1x1, landscape 2x1, features 2x2 and 4x2) in row-major
     first-free order, preferring at each step the shape of the next cover in gallery order. Covers are then dealt
     into the shapes in order, so the visual order stays close to the gallery order. Every row must end flush. */
  function shapes(cands, cols, k, feats, small, minF, maxRows) {
    const nP = cands.filter((s) => !isLand(s)).length, nL = cands.length - nP;
    const occ = [], seq = [];
    let budget = 20000;
    const free = (x, y) => !(occ[y] && occ[y][x]);
    const fits = (x, y, w, h) => { if (x + w > cols || y + h > maxRows) return false; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!free(i, j)) return false; return true; };
    const mark = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) { occ[j] = occ[j] || []; for (let i = x; i < x + w; i++) occ[j][i] = v; } };
    const first = () => { for (let y = 0; ; y++) for (let x = 0; x < cols; x++) if (free(x, y)) return [x, y]; };
    const holes = () => { let h = 0; for (let y = 0; y < occ.length; y++) for (let x = 0; x < cols; x++) if (free(x, y)) h++; return h; };
    const bigOk = (t, i, x, y, fc) => {
      if (!feats || cols < 4 || (t === 'L' && cols < 6)) return false;
      if (small) return t === 'P' && fc < 3;
      if (fc === 0) return i === 0;
      return fc === 1 && t === 'P' && i >= 5 && y >= 1 && (x === 0 || x >= cols - 2);
    };
    function go(np, nl, fc) {
      if (budget-- < 0) return false;
      const left = k - seq.length;
      const h = holes();
      if (!small && nl > Math.floor(k / 2)) return false;
      if (!left) return h === 0 && fc >= (minF || 0) && (small || nl >= Math.ceil(k / 4));
      if (h > left * 4) return false;
      const [x, y] = first();
      // Mix each row: after a landscape prefer a portrait and the other way round; a row starts with the next cover's shape
      const prev = seq.length && seq[seq.length - 1].y === y && x > 0 ? seq[seq.length - 1].t : null;
      const nextT = cands[seq.length] && isLand(cands[seq.length]) ? 'L' : 'P';
      const lead = prev ? (prev === 'L' ? 'P' : 'L') : nextT;
      const want = lead === 'L' ? ['L', 'P'] : ['P', 'L'];
      for (const t of want) {
        if (t === 'P' ? np >= nP : nl >= nL) continue;
        const opts = [];
        if (bigOk(t, seq.length, x, y, fc)) opts.push(t === 'L' ? [4, 2, 1] : [2, 2, 1]);
        opts.push(t === 'L' ? [2, 1, 0] : [1, 1, 0]);
        for (const [w, hh, b] of opts) {
          if (!fits(x, y, w, hh)) continue;
          mark(x, y, w, hh, 1); seq.push({ t, x, y, w, h: hh });
          if (go(np + (t === 'P' ? 1 : 0), nl + (t === 'L' ? 1 : 0), fc + b)) return true;
          mark(x, y, w, hh, 0); seq.pop();
        }
      }
      return false;
    }
    return go(0, 0, 0) ? seq : null;
  }
  function deal(cands, seq) {
    const used = new Set();
    return seq.map((p, i) => {
      const ok = (s) => !used.has(s) && (p.t === 'L') === isLand(s);
      const s = cands.find((c) => ok(c) && (i >= 4 || !isMatt(c))) || cands.find(ok);
      used.add(s);
      return Object.assign({ s }, p);
    });
  }
  function pack(cands, cols, n, o) {
    o = o || {};
    n = Math.min(n, cands.length);
    const small = n <= 6;
    // Richest first: two features, then one, then none; exactly n tiles before one fewer or one more
    const featOpts = o.features && cols >= 4 ? (small ? [[true, 0], [false, 0]] : [[true, 2], [true, 1], [false, 0]]) : [[false, 0]];
    for (const [f, minF] of featOpts) {
      for (const k of small || o.ragged ? [n] : [n, n - 1, n + 1]) {
        if (k < 1 || k > cands.length) continue;
        // Fewest rows first: denser rows carry more covers side by side
        for (let rows = Math.ceil(k / cols); rows <= Math.ceil((2 * k) / cols) + 2; rows++) {
          const seq = shapes(cands, cols, k, f, small, minF, rows);
          if (seq) return deal(cands, seq);
        }
      }
    }
    // Else place in order and let the last row end ragged
    const occ = [];
    const fits = (x, y, w) => { for (let i = x; i < x + w; i++) if (occ[y] && occ[y][i]) return false; return x + w <= cols; };
    const out = [];
    const list = cands.slice(0, n);
    const head = list.filter((s, i) => i >= 4 || !isMatt(s));
    head.concat(list.filter((s) => !head.includes(s))).forEach((s) => {
      const w = isLand(s) && cols > 1 ? 2 : 1;
      for (let y = 0; ; y++) {
        let x = 0;
        while (x <= cols - w && !fits(x, y, w)) x++;
        if (x <= cols - w) { occ[y] = occ[y] || []; for (let i = x; i < x + w; i++) occ[y][i] = 1; out.push({ s, x, y, w, h: 1 }); break; }
      }
    });
    return out;
  }

  function tile(s, i, lay, src) {
    const op = opOf(s);
    if (!op) return '';
    const href = `#work.${esc(s.id)}`;
    const vars = [], inn = [];
    const big = [];
    Object.keys(lay).forEach((k) => {
      const p = lay[k].get(s);
      if (!p) return;
      inn.push(k);
      vars.push(`--x${k}:${p.x + 1};--y${k}:${p.y + 1};--w${k}:${p.w};--h${k}:${p.h}`);
      if (p.h === 2) big.push(k);
    });
    if (!inn.length) return '';
    return `<article class="wk-tile ${isLand(s) ? 'land' : 'port'}" data-in="${inn.join(' ')}"${big.length ? ` data-big="${big.join(' ')}"` : ''} style="${vars.join(';')};--i:${i}">
      <a class="wk-tile-cv" href="${href}" tabindex="-1" aria-hidden="true">${W.cover(s)}</a>
      <div class="wk-tile-info">
        <span class="wk-tile-k">${esc(s.type)}<span aria-hidden="true"> · </span>${esc(fmtLen(s))}</span>
        <h3 class="wk-tile-t"><a href="${href}">${esc(s.title)}</a></h3>
        ${big.length ? `<p class="wk-tile-out">${esc(s.outcome)}</p>` : ''}
        <a class="wk-by" href="#op.${esc(op.slug)}" data-view-source="${esc(src || 'work')}">${RN.ui.avatar(op, 'ava-xs', { decorative: true })}<span class="wk-by-n">${esc(op.name)}</span>${RN.ui.cardTier(op, { pill: true, inLink: true })}</a>
      </div>
    </article>`;
  }

  /* RN.work.grid(list, o): the packed grid alone. o = { limit (12), phone (8), features (true), ragged, source } */
  W.grid = function (list, o) {
    o = o || {};
    const lim = o.limit || 12;
    const cands = demoteMatt(list, 4);
    const L6 = pack(cands, 6, lim, { features: o.features !== false, ragged: o.ragged });
    const first = L6.slice().sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.s);
    // Narrower layouts start from the desktop order and may take the next covers to end their rows flush
    const pool = first.concat(cands.filter((s) => !first.includes(s)));
    const L4 = pack(pool, 4, first.length, { features: o.features !== false, ragged: o.ragged });
    const L2 = pack(pool, 2, Math.min(o.phone || 8, first.length), { ragged: o.ragged });
    const order = pool.filter((s) => first.includes(s) || L4.some((p) => p.s === s) || L2.some((p) => p.s === s));
    const toMap = (L) => new Map(L.map((p) => [p.s, p]));
    const lay = { 6: toMap(L6), 4: toMap(L4), 2: toMap(L2) };
    return `<div class="wk-show-grid">${order.map((s, i) => tile(s, i, lay, o.source)).join('')}</div>`;
  };

  /* RN.work.showcase(o): type tabs, the grid and the way into the gallery.
     o = { source ('home'), limit (12), phone (8) }. The tabs filter in place (data-act wk-show-type). */
  const SH = { type: 'all' };
  const typesLive = () => TYPES.filter((t) => W.all().some((s) => s.type === t));
  function showBody(o) {
    const all = W.all();
    const list = SH.type === 'all' ? all : all.filter((s) => s.type === SH.type);
    const n = list.length;
    const what = SH.type === 'all' ? RN.fmt.plural(n, 'work sample') : `${n} ${(TYPE_PL[SH.type] || SH.type).toLowerCase()}`;
    const label = n === 1 && SH.type !== 'all' ? `Explore the ${SH.type.toLowerCase()}` : `Explore all ${what}`;
    return `${W.grid(list, o)}
      <div class="wk-show-foot">
        <button type="button" class="btn btn-line" data-act="wk-go" data-v="${esc(SH.type)}">${esc(label)}${icon('arrow')}</button>
        <p class="wk-show-proto" data-proto>${icon('info')}<span>Placeholder covers</span></p>
      </div>`;
  }
  W.showcase = function (o) {
    o = Object.assign({ source: 'home', limit: 12, phone: 8 }, o || {});
    const types = typesLive();
    if (SH.type !== 'all' && !types.includes(SH.type)) SH.type = 'all';
    const tabs = [['all', 'All']].concat(types.map((t) => [t, TYPE_PL[t] || t]));
    return `<div class="wk-show" data-no-rv data-src="${esc(o.source)}" data-limit="${o.limit}" data-phone="${o.phone}">
      <div class="wk-show-tabs" role="group" aria-label="Filter the work by type">
        <div class="wk-show-tabs-in">${tabs.map(([k, l]) => `<button type="button" class="chip" data-act="wk-show-type" data-v="${esc(k)}" aria-pressed="${SH.type === k}">${esc(l)}</button>`).join('')}</div>
      </div>
      <div class="wk-show-body" aria-live="polite">${showBody(o)}</div>
    </div>`;
  };
  RN.actions['wk-show-type'] = (el) => {
    const root = el.closest('.wk-show');
    SH.type = el.dataset.v || 'all';
    if (!root) return RN.rerender();
    root.querySelectorAll('[data-act="wk-show-type"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    const body = root.querySelector('.wk-show-body');
    body.innerHTML = showBody({ source: root.dataset.src, limit: +root.dataset.limit || 12, phone: +root.dataset.phone || 8 });
    if (!calm()) body.querySelector('.wk-show-grid').classList.add('is-swap');
    // Keep the start of the grid just under the sticky tabs, and the chosen tab in view in its own row
    const tabs = root.querySelector('.wk-show-tabs');
    const grid = body.querySelector('.wk-show-grid');
    if (tabs && grid) { const tb = tabs.getBoundingClientRect().bottom, gt = grid.getBoundingClientRect().top; if (gt < tb) window.scrollTo({ top: window.scrollY + gt - tb - 12, behavior: 'auto' }); }
    const tin = el.parentElement;
    if (tin && tin.scrollWidth > tin.clientWidth) tin.scrollTo({ left: el.offsetLeft - tin.clientWidth / 2 + el.offsetWidth / 2, behavior: calm() ? 'auto' : 'smooth' });
    if (RN.track) RN.track('work_showcase_type', { type: SH.type, source: root.dataset.src });
  };

  /* ---------- Gallery state ---------- */
  const G = { type: 'all' };

  function crumbs(items) {
    return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((x, i) => `${i ? icon('chev-right') : ''}${x[1] ? `<a href="#${esc(x[1])}">${esc(x[0])}</a>` : `<span>${esc(x[0])}</span>`}`).join('')}</nav>`;
  }

  function renderGallery(need) {
    const all = W.all();
    const byNeed = W.byProblem(need);
    const list = demoteMatt(byNeed.filter((s) => G.type === 'all' || s.type === G.type), 1);
    const ops = new Set(list.map((s) => s.opId));
    const nCount = (k) => all.filter((s) => s.problem === k).length;
    const tCount = (t) => byNeed.filter((s) => s.type === t).length;
    const types = TYPES.filter((t) => all.some((s) => s.type === t));
    const needChips = [['all', 'All problems', all.length]].concat(needOpts().filter((o) => nCount(o.v)).map((o) => [o.v, o.l, nCount(o.v)]));
    const typeChips = [['all', 'All types', byNeed.length]].concat(types.map((t) => [t, TYPE_PL[t] || t, tCount(t)]));
    const cur = need || 'all';
    return `<section class="wrap phead wk-head">
        <div class="wk-head-copy">
          <span class="eyebrow">See the work</span>
          <h1 class="h1">The work behind <span class="serif">the operators</span><span class="vm">.</span></h1>
          <p class="lede">Playbooks, comp plans, dashboards and 30/60/90 plans operators have built. Start from the deliverable you need, then meet who built it.</p>
          <p class="wk-proto" data-proto>${icon('info')}<span>Placeholder covers until the portfolio export lands.</span></p>
        </div>
        <ul class="wk-head-types" aria-label="Kinds of work">${types.map((t) => `<li>${RN.ui.icoTile(TYPE_IC[t] || 'doc', { size: 'sm', soft: true, still: true })}<span>${esc(TYPE_PL[t] || t)}</span></li>`).join('')}</ul>
      </section>
      <section class="wrap wk-filters" aria-label="Filter the work">
        <div class="wk-frow">
          <span class="label" id="wk-f-need">By problem</span>
          <div class="chipset wk-chips" role="group" aria-labelledby="wk-f-need">${needChips.map(([k, l, n]) => `<button type="button" class="chip chip-sm" aria-pressed="${cur === k}" data-act="wk-need" data-v="${esc(k)}">${esc(l)}<span class="chip-n">${n}</span></button>`).join('')}</div>
        </div>
        <div class="wk-frow">
          <span class="label" id="wk-f-type">By type</span>
          <div class="chipset wk-chips" role="group" aria-labelledby="wk-f-type">${typeChips.map(([k, l, n]) => `<button type="button" class="chip chip-sm" aria-pressed="${G.type === k}" data-act="wk-type" data-v="${esc(k)}" ${n || k === G.type ? '' : 'disabled'}>${esc(l)}<span class="chip-n">${n}</span></button>`).join('')}</div>
        </div>
        <p class="wk-count small muted" aria-live="polite">${list.length ? `${RN.fmt.plural(list.length, 'work sample')} from ${RN.fmt.plural(ops.size, 'operator')}${cur !== 'all' ? ` · <b>${esc(needLabel(cur))}</b>` : ''}${G.type !== 'all' ? ` · ${esc(TYPE_PL[G.type] || G.type)}` : ''}` : 'No work samples match these filters.'}${cur !== 'all' || G.type !== 'all' ? ` <button type="button" class="act" data-act="wk-clear">Clear filters</button>` : ''}</p>
      </section>
      <section class="wrap wk-gallery-sec">
        ${list.length ? `<div class="wk-show wk-show-gallery">${W.grid(list, { limit: list.length, phone: list.length, ragged: true, source: 'work' })}</div>` : RN.ui.empty({ icon: 'doc', title: 'Nothing here yet', body: 'No operator has published this kind of work for this problem. Tell us what you need and we will find who has built it.', cta: '<a class="btn btn-sm" href="#talk">Talk to us</a>' })}
        <div class="wk-band">
          <div><h2 class="h3">Need something specific built?</h2><p class="muted">Tell us the deliverable and the problem behind it. We match you with operators who have built it before.</p></div>
          <div class="row"><a class="btn" href="#talk${cur !== 'all' ? '.' + esc(cur) : ''}">Talk to us${icon('arrow')}</a><a class="btn btn-line" href="#browse">Browse operators</a></div>
        </div>
      </section>`;
  }

  /* ---------- Sample page ---------- */
  function docPage(s, op, i, locked, label) {
    const toc = s.toc && s.toc.length ? s.toc : [s.title];
    const head = toc[i % toc.length];
    return `<figure class="wk-pg${locked ? ' locked' : ''}${isLand(s) ? ' land' : ''}">
      <span class="wk-pg-sheet" aria-hidden="true">
        <span class="wk-pg-hd"><span>${esc(s.type.toUpperCase())}</span><span>${i + 2}</span></span>
        <b>${esc(head)}</b>
        ${i === 0 ? `<span class="wk-pg-fig">${preview(s)}</span>` : ''}
        <i></i><i class="w8"></i><i></i><i class="w6"></i>${i ? '<i></i><i class="w8"></i><i class="w5"></i>' : ''}
      </span>
      ${locked ? `<span class="wk-pg-lock">${icon('lock')}<b>${esc(label || 'Shared after an intro')}</b></span>` : ''}
      <figcaption>${locked ? `Section ${i + 1}` : `Section ${i + 1} · ${esc(head)}`}</figcaption>
    </figure>`;
  }

  function bpFor(s) {
    const PJ = RN.projects;
    if (!PJ || !PJ.blueprints) return null;
    const list = PJ.forNeed ? PJ.forNeed(s.problem, s.role) : PJ.blueprints.filter((b) => b.need === s.problem);
    return list.find((b) => b.cat === s.role) || PJ.blueprints.find((b) => b.cat === s.role) || list[0] || null;
  }
  function bpCard(bp) {
    return `<a class="wk-bp card" href="#blueprint.${esc(bp.id)}" style="--cat:${RN.fields.catColor(bp.cat)}">
      <span class="wk-bp-hd">${RN.ui.icoTile('doc', { size: 'sm', cat: bp.cat })}<span class="label">Engagement Blueprint</span></span>
      <b class="wk-bp-t">${esc(bp.problem)}</b>
      <span class="small muted">${esc(bp.title || 'Fractional ' + bp.role)}${bp.blurb ? ` · ${esc(bp.blurb)}` : ''}</span>
      <span class="act">Open the Blueprint${icon('arrow')}</span>
    </a>`;
  }
  function row(title, list, more) {
    if (!list.length) return '';
    return `<section class="wk-more"><div class="wk-more-hd"><h2 class="h3">${esc(title)}</h2>${more || ''}</div><div class="wk-more-row">${list.map((x) => W.card(x, { size: 'sm' })).join('')}</div></section>`;
  }

  function renderSample(s) {
    const op = opOf(s);
    if (!op) return renderGallery();
    const first = op.first || RN.fmt.first(op.name);
    const toc = s.toc || [];
    const pages = Math.min(4, Math.max(3, toc.length));
    const left = Math.max(1, (s.pages || pages) - 1);
    const bp = bpFor(s);
    const mine = W.forOp(op.id).filter((x) => x.id !== s.id);
    const like = demoteMatt(W.all().filter((x) => x.id !== s.id && x.opId !== op.id && (x.problem === s.problem || x.type === s.type))
      .sort((a, b) => (b.problem === s.problem) - (a.problem === s.problem) || (b.type === s.type) - (a.type === s.type)), 1).slice(0, 4);
    const facts = [
      ['Industry', indLabel(s.industry)],
      ['Company size', sizeLabel(s.size)],
      ['Built by a', F().catLabel(s.role)],
      ['Solves', needLabel(s.problem)],
      ['Length', fmtLen(s)],
    ].filter((f) => f[1]);
    return `<section class="wrap phead wk-sp">
        ${crumbs([['The work', 'work'], [needLabel(s.problem), 'work.' + s.problem], [TYPE_PL[s.type] || s.type, '']])}
        <div class="wk-sp-grid">
          <div class="wk-sp-cover">${W.cover(s, { big: true })}</div>
          <div class="wk-sp-copy">
            <span class="eyebrow">${esc(s.type)}</span>
            <h1 class="h1 wk-sp-t">${esc(s.title)}</h1>
            <p class="lede wk-sp-out">${esc(s.outcome)}.</p>
            <dl class="wk-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            <div class="row wk-sp-cta">
              <button type="button" class="btn" data-act="wk-hire" data-id="${esc(s.id)}">Hire who built it${icon('arrow')}</button>
              <a class="btn btn-line" href="#talk.${esc(s.problem)}" data-act="wk-adapt" data-id="${esc(s.id)}">Adapt this for us</a>
            </div>
            <a class="wk-by wk-by-lg" href="#op.${esc(op.slug)}" data-view-source="work">${RN.ui.avatar(op, 'ava-sm', { decorative: true })}<span><span class="faint small">Built by</span> <span class="wk-by-n">${esc(op.name)}</span></span>${RN.ui.cardTier(op, { pill: true, inLink: true })}</a>
          </div>
        </div>
      </section>
      <section class="wrap wk-sp-body">
        <div class="wk-sp-main">
          <section class="wk-toc-sec" aria-labelledby="wk-toc-t">
            <h2 class="h3" id="wk-toc-t">Contents</h2>
            <ol class="wk-toc">${toc.map((t, i) => `<li><span class="wk-toc-n tnum">${String(i + 1).padStart(2, '0')}</span><span>${esc(t)}</span>${i ? icon('lock', 'wk-toc-lock') : ''}</li>`).join('')}</ol>
          </section>
          <section class="wk-inside" aria-labelledby="wk-in-t">
            <h2 class="h3" id="wk-in-t">What’s inside</h2>
            <div class="wk-pages">${Array.from({ length: pages }, (_, i) => docPage(s, op, i, i > 0, i === pages - 1 && left > pages - 1 ? `${left - (pages - 2)} more ${s.unit === 'slides' ? 'slides' : 'pages'}` : '')).join('')}</div>
            <p class="wk-note">${icon('lock')}<span>Full document shared after an intro. Operators choose what they publish; client names stay private.</span></p>
          </section>
        </div>
        <aside class="wk-sp-side" aria-label="Who built it">
          <span class="label">Who built it</span>
          ${RN.ui.opCard(op, { compact: true })}
          ${bp ? `<span class="label wk-side-l">Hire for this as an engagement</span>${bpCard(bp)}` : ''}
        </aside>
      </section>
      <div class="wrap wk-sp-rows">
        ${row(`More from ${first}`, mine, `<a class="act" href="#op.${esc(op.slug)}">See ${esc(first)}’s profile${icon('arrow')}</a>`)}
        ${row('More like this', like, `<a class="act" href="#work.${esc(s.problem)}">See all for this problem${icon('arrow')}</a>`)}
      </div>`;
  }

  /* ---------- Actions ---------- */
  function goNeed(v) {
    const path = v && v !== 'all' ? 'work.' + v : 'work';
    RN.go(path, { replace: true, noScroll: true });
  }
  RN.actions['wk-need'] = (el) => { G.type = 'all'; goNeed(el.dataset.v); };
  RN.actions['wk-type'] = (el) => { G.type = el.dataset.v || 'all'; RN.rerender(); };
  // From another page (Home's showcase "Explore all"): open the gallery on one kind of work ('all' for every type)
  W.openType = (t) => { G.type = t || 'all'; RN.go ? RN.go('work') : (location.hash = '#work'); };
  RN.actions['wk-go'] = (el) => W.openType(el.dataset.v);
  RN.actions['wk-clear'] = () => { G.type = 'all'; goNeed('all'); };
  RN.actions['wk-hire'] = (el) => {
    const s = W.get(el.dataset.id);
    const op = s && opOf(s);
    if (!op) return;
    if (RN.track) RN.track('work_hire', { opId: op.id, sample: s.id });
    if (RN.intro && RN.intro.open) RN.intro.open(op.id, { need: s.problem, note: `We saw your ${s.type.toLowerCase()} “${s.title}” and want to talk about building something like it for us.` });
    else RN.go('op.' + op.slug);
  };
  RN.actions['wk-adapt'] = (el) => {
    const s = W.get(el.dataset.id);
    if (RN.track && s) RN.track('work_adapt', { opId: s.opId, sample: s.id });
    RN.go(s ? 'talk.' + s.problem : 'talk');
  };

  /* ---------- Views ---------- */
  const isNeed = (k) => needOpts().some((o) => o.v === k);
  RN.view('work', {
    route: 'work', nav: 'browse',
    title: () => 'The work',
    render: () => renderGallery(''),
  });
  RN.view('work-item', {
    route: 'work.:id', nav: 'browse',
    samples: { id: 'wk-enterprise-comp', extra: ['work.wk-pipeline-dashboard', 'work.wk-ai-research-agent', 'work.pipeline'] },
    title: (p) => { if (isNeed(p.id)) return `The work · ${needLabel(p.id)}`; const s = W.get(p.id); return s ? s.title : 'The work'; },
    render: (p) => {
      if (isNeed(p.id)) return renderGallery(p.id);
      const s = W.get(p.id);
      if (!s) return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'doc', title: 'This work sample is not available', body: 'It may have been unpublished by the operator.', cta: '<a class="btn btn-sm" href="#work">See all the work</a>' })}</section>`;
      return renderSample(s);
    },
  });
})();
