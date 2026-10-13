/* Compare (#compare): up to four operators side by side on the standard fields.
   Rows use the registry labels (RN.fields) so compare reads exactly like intake, profile and filters,
   including the role details for each compared category (RN.fields.roleFields read through RN.roleDetail).
   Missing data says "Not added" (never N/A). The best value in a row is tinted, never shouted.
   Mixed role categories (D8): every role has its own onboarding questions. Shared questions stay as normal rows;
   role answers that measure the same thing sit in "Comparable scope" (with the source question under each value);
   the rest is grouped by role, and a question another role was never asked reads "Not asked for {role}".
   Rates are the price (no fees for companies), so the rate row shows the operator's rate only.
   Rate and match signals are login-gated. Loops: compare_view per operator (Studio "Compared, not
   chosen"), intro-open per column (shared intro flow), shortlist-toggle; profile links inherit
   data-view-source="compare" so core ui.js records profile_view source=compare. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const none = (t) => `<span class="cmp-na">${t || 'Not added'}</span>`;
  const NA = none();
  const AVAIL_SCORE = { available_now: 3, available_2_weeks: 2, available_2_plus_weeks: 1 };
  const viewed = new Set();
  let undo = null;

  /* ---------- Values ---------- */
  const day = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => { const d = RN.now(); d.setHours(0, 0, 0, 0); return d; };
  // MM/DD/YYYY on profile and compare (Sheet3 #4); RN.fmt.mdy once core has it
  const mdy = (d) => (RN.fmt.mdy ? RN.fmt.mdy(d) : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`);
  /* Next available start date: never a past date; "Available now" uses today when no future date exists (L506). */
  function startFor(op) {
    const t = today();
    const sd = op.avail && op.avail.startDate ? day(op.avail.startDate) : null;
    if (sd && sd >= t) return sd;
    return op.avail && op.avail.key === 'available_now' ? t : null;
  }
  function coreAvg(op) {
    const vals = (op.reviews || []).map((r) => {
      if (r.coreAvg) return +r.coreAvg;
      if (r.core && typeof r.core === 'object') { const v = Object.values(r.core).map(Number).filter((x) => x > 0); if (v.length) return v.reduce((a, b) => a + b, 0) / v.length; }
      return +r.overall || 0;
    }).filter((x) => x > 0);
    return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
  }
  // Tag tiers are claimed | verified | expert; every non-claimed tag is client-verified
  const verifiedTags = (op) => (op.tags || []).filter((t) => t.tier !== 'claimed').sort((a, b) => (b.score || 0) - (a.score || 0) || (b.r || 0) - (a.r || 0));
  // The signed-in client's firmographics plus saved match preferences (same brief the profile page scores with)
  function brief(op) {
    const co = RN.personas.buyer.company;
    const base = RN.clientBrief ? RN.clientBrief() : { revenueRange: co.revenueRange, employeeRange: co.employeeRange, industries: co.industry ? [co.industry] : [] };
    return Object.assign({}, base, { roleCategory: base.roleCategory || op.catKey });
  }
  const sortBy = (key, vals) => { const order = RN.fields[key].options.map((o) => o.v); return vals.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)); };

  /* ---------- Cells ---------- */
  const sub = (t) => `<span class="cmp-sub">${t}</span>`;
  function risCell(op) {
    const t = RN.fields.risTierFor(op.ris && op.ris.score);
    if (!t) return none(RN.fields.risNone.l); // not scored yet: no tier, no number
    return `<span class="ris t-${esc(t.v)}">${RN.ui.tierBadge(t.v, { size: 40, score: op.ris.score, label: `${t.l}, Reputation Index ${op.ris.score}` })}<span class="ris-txt"><b>${esc(t.l)}</b><span>${esc(t.min)} to ${esc(t.max)} tier</span></span></span>`;
  }
  function coreCell(op) {
    const c = coreAvg(op);
    if (!c) return none('No reviews yet');
    return `<div class="cmp-core"><b class="cmp-v">${c.avg.toFixed(1)}</b><span class="muted">/ 5</span>${RN.ui.stars(c.avg)}</div>${sub(esc(RN.fmt.plural(c.n, 'company review')))}`;
  }
  function engCell(op) {
    const e = op.engagements || [];
    if (!e.length) return NA;
    const names = e.map((x) => x.company).filter(Boolean);
    return `<div><b class="cmp-v">${e.length}</b> <span>${e.length === 1 ? 'engagement' : 'engagements'}</span></div>${names.length ? sub(esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ` +${names.length - 3}` : '')) : ''}`;
  }
  function tagsCell(op) {
    const v = verifiedTags(op);
    if (!v.length) return none('None verified yet') + sub(`${esc(RN.fmt.plural((op.tags || []).length, 'focus area'))} listed by the operator`);
    const sel = ((RN.store.state.browse || {}).tags || []).map((t) => t.toLowerCase());
    return `<div class="cmp-tags">${v.slice(0, 6).map((t) => RN.ui.ftag({ t: t.t, tier: 'verified' }).replace('class="ftag ', `class="ftag ${sel.includes(t.t.toLowerCase()) ? 'cmp-tag-hit ' : ''}`)).join('')}</div>${v.length > 6 ? sub(`+${v.length - 6} more verified`) : ''}`;
  }
  function startCell(op) {
    const d = startFor(op);
    if (!d) return NA;
    const days = Math.round((d - today()) / 864e5);
    return `<b class="cmp-v cmp-v-sm tnum">${mdy(d)}</b>${sub(days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`)}`;
  }
  function hoursCell(op) {
    const c = op.avail && op.avail.hoursCode;
    return c ? `<span class="cmp-txt">${esc(RN.w.label('hoursPerMonth', c))}</span>` : NA;
  }
  function rateCell(op) {
    // The Browse wording for an operator who has not listed a rate
    if (!op.rate) return none(RN.fmt.rate(null));
    if (RN.store.state.persona === 'visitor') { const rg = RN.model.opMonthlyRange ? RN.model.opMonthlyRange(op) : null; return `<b class="cmp-v cmp-v-sm" ${rg ? `title="${esc(rg.note)}"` : ''}>${rg ? esc(rg.text) : '—'}</b>${rg ? sub(rg.retainer ? 'Listed retainer' : 'Estimate from the hourly rate') : ''}${sub('<button type="button" class="act" data-act="cmp-login">Exact hourly rate after sign-in</button>')}`; }
    const idx = RN.data.market.rateIndex.byCat[op.catKey];
    return `<b class="cmp-v cmp-v-sm">${esc(RN.fmt.rate(op.rate))}</b>${idx ? sub(`${esc(RN.fields.catLabel(op.catKey))} median $${esc(idx.p50)}/hr`) : ''}`;
  }
  // Registry label, or a readable fallback for stored values the registry does not list (e.g. mid_market)
  const SEG = { smb: 'SMB', mid_market: 'Mid-market', enterprise: 'Enterprise', plg: 'PLG' };
  function lab(key, v) {
    const o = RN.w.opt && RN.w.opt(key, v);
    if (o) return o.l;
    const k = String(v == null ? '' : v);
    if (SEG[k.toLowerCase()]) return SEG[k.toLowerCase()];
    return /[_]/.test(k) || k === k.toLowerCase() ? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : k;
  }
  function listCell(key, vals, mine) {
    vals = (vals || []).filter(Boolean);
    if (!vals.length) return NA;
    const sorted = key === 'industries' ? vals.slice().sort((a, b) => (b === mine) - (a === mine)) : sortBy(key, vals);
    const max = key === 'industries' ? 5 : 8;
    return `<div class="cmp-chips">${sorted.slice(0, max).map((v) => `<span class="pill ${v === mine ? 'pill-accent' : 'pill-line'}"${v === mine ? ' title="Matches your company"' : ''}>${v === mine ? icon('check') : ''}${esc(lab(key, v))}</span>`).join('')}${sorted.length > max ? `<span class="pill">+${sorted.length - max} more</span>` : ''}</div>`;
  }
  function fitCell(op) {
    const f = RN.model.fit(op, brief(op));
    const ic = { match: 'check', partial: 'minus', low: 'x' };
    return `<div class="cmp-fit">
      <div class="cmp-fit-hd"><span class="cmp-ring">${RN.chart.ring(f.pct, { size: 48, stroke: 5, label: f.pct + '% match' })}<b>${f.pct}</b></span><div><b>${esc(f.label)}</b>${sub(`${f.count} of ${f.signals.length} signals`)}</div></div>
      <ul class="cmp-sig">${f.signals.map((s) => `<li class="is-${s.state}">${icon(ic[s.state] || 'minus')}<span>${esc(s.text)}</span></li>`).join('')}</ul>
      ${f.notes.length ? `<p class="cmp-sub">${esc(f.notes.join('. '))}.</p>` : ''}
    </div>`;
  }

  /* Role details (intake step 4): one reading for profile and compare through RN.roleDetail */
  function roleCell(op, key) {
    const t = RN.roleDetail && RN.roleDetail.text ? RN.roleDetail.text(op, key) : '';
    return t ? `<span class="cmp-txt">${esc(t)}</span>` : NA;
  }
  // A category's role-detail keys, in registry order. GTM motion and CRM are shared rows (every role is asked them).
  const SHARED_ROLE = ['salesMotions', 'crm'];
  const catKeys = (cat) => (RN.fields.roleFields[cat] || []).filter((k) => !SHARED_ROLE.includes(k) && RN.fields[k]);
  const asked = (op, key) => catKeys(op.catKey).includes(key);
  const notAsked = (op) => `<span class="cmp-na cmp-na-ask">Not asked for ${esc(RN.fields.catLabel(op.catKey))}</span>`;
  const srcOf = (key) => `<span class="cmp-src">${esc(RN.fields[key].label)}</span>`;

  /* Comparable scope: role answers mapped onto shared measures. Each value names the question it came from. */
  const SCOPE = [
    { l: 'Team led', by: { sales_leadership: 'largestTeamManaged', marketing: 'typicalTeamSize', customer_success_growth: 'largestCsTeam', sales_enablement: 'largestRepCount' } },
    { l: 'Revenue or budget owned', by: { sales_leadership: 'largestTeamQuota', marketing: 'largestBudget', customer_success_growth: 'largestArrBook', partnerships: 'partnerRevenue', sellers: 'individualQuota' },
      kind: { sales_leadership: 'sales quota', marketing: 'marketing budget', customer_success_growth: 'ARR book', partnerships: 'partner-attributed revenue', sellers: 'seller quota' } },
    { l: 'Built the function from zero', key: 'builtFromZero' },
    { key: 'methodologies' },
  ];
  const scopeKey = (row, cat) => (row.key ? (catKeys(cat).includes(row.key) ? row.key : null) : row.by[cat] || null);
  const SCOPE_KEYS = ['largestTeamManaged', 'typicalTeamSize', 'largestCsTeam', 'largestRepCount', 'largestTeamQuota', 'largestBudget', 'largestArrBook', 'partnerRevenue', 'individualQuota', 'builtFromZero', 'methodologies'];
  function scopeCell(op, row) {
    const key = scopeKey(row, op.catKey);
    if (!key) return notAsked(op);
    // The source question, unless the row is already named after it
    const src = (k) => ((row.l || RN.fields[k].label) === RN.fields[k].label ? '' : srcOf(k));
    if (key === 'builtFromZero') {
      const t = RN.roleDetail.text(op, key);
      const rf = op.roleFields || {}, rd = op.roleDetails || {};
      const no = !t && [rf.builtFromZero, rd.built_from_zero, rd.built_revops_from_zero].some((v) => v === false || /^(no|false)$/i.test(String(v == null ? '' : v)));
      return (t ? `<span class="cmp-txt">Yes</span>` : no ? `<span class="cmp-txt">No</span>` : NA) + src(key);
    }
    const rv = RN.roleDetail.value(op, key);
    if (!rv) return NA + src(key);
    if (rv.kind === 'big') {
      const unit = row.kind ? row.kind[op.catKey] : rv.unit;
      return `<b class="cmp-v cmp-v-sm">${esc(rv.value)}</b>${unit ? ` <span class="cmp-unit">${esc(unit)}</span>` : ''}${src(key)}`;
    }
    return `<span class="cmp-txt">${esc(RN.roleDetail.text(op, key))}</span>${src(key)}`;
  }

  /* ---------- Rows (standard labels) ---------- */
  function rowsFor(ops) {
    const st = RN.store.state;
    const buyer = st.persona === 'buyer', visitor = st.persona === 'visitor';
    const co = RN.personas.buyer.company;
    const F = RN.fields;
    const coreTip = `<b>CORE company reviews</b><br>Companies rate ${F.coreDims.options.map((d) => esc(d.l)).join(', ')} from 1 to 5 after an engagement. Shown as the average across reviews.`;
    const R = [];
    if (buyer) R.push({ sec: `Fit for ${esc(co.name)}`, l: 'Match signals', tip: `<b>Match signals</b><br>Scored against ${esc(co.name)}: company revenue, employee range, industry, plus the role, GTM motion and need in your saved match preferences.`, cell: fitCell, val: (op) => RN.model.fit(op, brief(op)).pct, dir: 'max' });
    else if (visitor) R.push({ sec: 'Fit for your company', l: 'Match signals', lock: true });
    R.push({ sec: 'Standing', l: 'Reputation Index', tip: RN.ui.risExplainer(), cell: risCell, val: (op) => op.ris.score, dir: 'max' });
    R.push({ l: 'CORE average', tip: coreTip, cell: coreCell, val: (op) => { const c = coreAvg(op); return c ? c.avg : null; }, dir: 'max' });
    R.push({ l: 'Engagement history', cell: engCell, val: (op) => (op.engagements || []).length || null, dir: 'max' });
    R.push({ sec: 'Expertise', l: 'Verified focus areas', note: 'Top 6 by score', cell: tagsCell, val: (op) => verifiedTags(op).length || null, dir: 'max' });
    const cats = [...new Set(ops.map((op) => op.catKey))];
    const mixed = cats.length > 1;
    const byRole = [];
    if (!mixed) {
      // One role category: its role-detail rows, as every operator here answered the same questions
      const rtip = `<b>Operating range</b><br>Role details each operator gave when they joined, from the standard fields for ${esc(F.catLabel(cats[0]))}.`;
      catKeys(cats[0]).forEach((k, i) => R.push({ sec: i === 0 ? 'Operating range' : '', secTip: i === 0 ? rtip : '', l: F[k].label, cell: (op) => roleCell(op, k) }));
    } else {
      // Mixed: role answers that measure the same thing, side by side, with the question each one answers
      const stip = '<b>Comparable scope</b><br>Each role answers its own onboarding questions. These rows line up answers that measure the same thing, such as team size or the revenue or budget owned. The question each value answers is shown under it.';
      const scopeRows = SCOPE.filter((row) => cats.some((c) => scopeKey(row, c)));
      scopeRows.forEach((row, i) => R.push({ sec: i === 0 ? 'Comparable scope' : '', secTip: i === 0 ? stip : '', l: row.l || F[row.key].label, cell: (op) => scopeCell(op, row) }));
      // The rest, grouped by role; each question once, under the first compared role that asks it
      const done = new Set(SCOPE_KEYS);
      cats.forEach((cat) => {
        const keys = catKeys(cat).filter((k) => !done.has(k));
        keys.forEach((k) => done.add(k));
        keys.forEach((k, i) => byRole.push({ sec: i === 0 ? `${esc(F.catLabel(cat))} questions` : '', secTip: i === 0 ? `<b>${esc(F.catLabel(cat))} questions</b><br>Asked of ${esc(F.catLabel(cat))} operators when they join. Operators in other roles were not asked.` : '', l: F[k].label, cell: (op) => (asked(op, k) ? roleCell(op, k) : notAsked(op)) }));
      });
    }
    R.push({ sec: 'Availability', l: F.availability.label, cell: (op) => RN.ui.avail(op, { hours: false }), val: (op) => AVAIL_SCORE[op.avail.key] || null, dir: 'max' });
    R.push({ l: F.startDate.label, cell: startCell, val: (op) => { const d = startFor(op); return d ? -d.getTime() : null; }, dir: 'max' });
    R.push({ l: F.hoursPerMonth.label, cell: hoursCell, val: (op) => +(op.avail.hoursCode || 0) || null, dir: 'max' });
    R.push({ l: visitor ? 'Monthly cost' : F.rate.label, cell: rateCell, val: (op) => (visitor ? null : op.rate || null), dir: 'min' });
    R.push({ l: F.engagementTypes.label, cell: (op) => listCell('engagementTypes', op.engagementTypes) });
    R.push({ sec: 'Company fit', l: F.revenueRange.clientLabel || 'Company revenue', cell: (op) => listCell('revenueRange', op.revenueRanges, buyer ? co.revenueRange : null), val: buyer ? (op) => (op.revenueRanges.includes(co.revenueRange) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.employeeRange.label, cell: (op) => listCell('employeeRange', op.employeeRanges, buyer ? co.employeeRange : null), val: buyer ? (op) => (op.employeeRanges.includes(co.employeeRange) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.industries.label, cell: (op) => listCell('industries', op.industries, buyer ? co.industry : null), val: buyer ? (op) => (op.industries.includes(co.industry) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.salesMotions.label, cell: (op) => listCell('salesMotions', op.motions) });
    R.push({ l: F.crm.label, cell: (op) => roleCell(op, 'crm') });
    return R.concat(byRole);
  }
  function bestSet(ops, r) {
    if (!r.val || !r.dir || ops.length < 2) return new Set();
    const vals = ops.map((op) => { const v = r.val(op); return v == null || isNaN(v) ? null : +v; });
    const have = vals.map((v, i) => [v, i]).filter((x) => x[0] != null);
    if (!have.length) return new Set();
    const target = r.dir === 'min' ? Math.min(...have.map((x) => x[0])) : Math.max(...have.map((x) => x[0]));
    const win = have.filter((x) => x[0] === target).map((x) => x[1]);
    return win.length === ops.length ? new Set() : new Set(win);
  }

  /* ---------- Suggestions to fill empty columns ---------- */
  function suggestions(ops, n) {
    const st = RN.store.state;
    const inCmp = new Set(st.compare);
    const seen = new Set();
    const out = [];
    const push = (op, why) => { if (RN.model.listed(op) && !inCmp.has(op.id) && !seen.has(op.id)) { seen.add(op.id); out.push({ op, why }); } };
    st.shortlist.map(RN.model.byId).forEach((op) => push(op, 'On your shortlist'));
    ops.forEach((op) => RN.model.similar(op, 4).forEach((x) => push(x, `Similar to ${op.first}`)));
    RN.model.ops.slice().sort((a, b) => RN.fields.risRank(b) - RN.fields.risRank(a) || b.completeness - a.completeness).slice(0, 8).forEach((x) => push(x, 'High Reputation Index'));
    return out.slice(0, n || 3);
  }
  /* The card rule in a text sub-line: Proven up the score and tier, below that nothing */
  function suggStanding(op) {
    const t = RN.fields.risTierFor(op.ris && op.ris.score);
    if (!t) return '';
    return RN.ui.tierShown(t.v) ? ` · ${esc(op.ris.score)} ${esc(t.l)}` : '';
  }
  function suggItem(s) {
    const op = s.op;
    return `<div class="cmp-sug">
      ${RN.ui.avatar(op, 'ava-sm')}
      <div class="grow"><a class="cmp-sug-n" href="#op.${esc(op.slug)}">${esc(op.name)}</a>
        <span class="cmp-sub">Fractional ${esc(op.role)}${suggStanding(op)}</span>
        <span class="cmp-sug-why">${esc(s.why)}</span></div>
      <button type="button" class="btn btn-line btn-sm cmp-sug-add" data-act="compare-toggle" data-id="${esc(op.id)}" aria-label="Add ${esc(op.name)} to compare">${icon('plus')}Add</button>
    </div>`;
  }

  /* ---------- Page ---------- */
  function colHead(op) {
    const st = RN.store.state;
    const saved = st.shortlist.includes(op.id);
    const asked = st.persona === 'buyer' && !!RN.intro.mine(op.id);
    return `<th scope="col" class="cmp-col"><div class="cmp-hd">
      <div class="cmp-hd-id">${RN.ui.avatar(op, 'ava-md')}<div class="grow"><a class="cmp-name" href="#op.${esc(op.slug)}" title="${esc(op.name)}">${esc(op.name)}</a><span class="cmp-role">Fractional ${esc(op.role)}</span></div></div>
      <button type="button" class="btn btn-sm cmp-intro ${asked ? 'btn-line' : ''}" data-act="intro-open" data-id="${esc(op.id)}" aria-label="${asked ? `Intro requested with ${esc(op.first)}. See status` : `Request intro to ${esc(op.name)}`}">${asked ? icon('check') + 'Intro requested' : 'Request intro'}</button>
      <div class="cmp-hd-acts">
        <button type="button" class="act ${saved ? '' : 'muted'}" data-act="shortlist-toggle" data-id="${esc(op.id)}" aria-pressed="${saved}" aria-label="${saved ? `Saved to shortlist: ${esc(op.name)}` : `Save ${esc(op.name)} to shortlist`}">${icon('bookmark')}${saved ? 'Saved' : 'Save'}</button>
        <button type="button" class="act muted" data-act="cmp-remove" data-id="${esc(op.id)}" aria-label="Remove ${esc(op.name)} from compare">${icon('x')}Remove</button>
      </div>
    </div></th>`;
  }

  let showEmpty = false;
  function table(ops) {
    const all = rowsFor(ops);
    // Rows where no column has an answer ("Not added" or "Not asked" everywhere) fold into one disclosure
    const blank = (h) => /^\s*<span class="cmp-na[^"]*">[^<]*<\/span>(<span class="cmp-src">[^<]*<\/span>)?\s*$/.test(h);
    all.forEach((r) => { if (!r.lock && ops.length) { r.html = ops.map((op) => r.cell(op)); r.empty = r.html.every(blank); } });
    const rows = all.filter((r) => !r.empty);
    const empties = all.filter((r) => r.empty);
    // A folded row that opened a section hands its heading to the next visible row of that section
    let carry = null;
    all.forEach((r) => {
      if (r.sec) carry = null;
      if (r.empty && r.sec) { carry = { sec: r.sec, secTip: r.secTip }; return; }
      if (!r.empty && !r.sec && carry) { r.sec = carry.sec; r.secTip = carry.secTip; carry = null; }
    });
    const add = ops.length < 4;
    const cols = ops.length + (add ? 1 : 0);
    const sugg = add ? suggestions(ops, Math.min(4, 5 - ops.length)) : [];
    const addHead = add ? `<th scope="col" class="cmp-col cmp-col-add"><div class="cmp-add-hd">
        ${RN.ui.icoTile('plus', { size: 'sm', round: true, soft: true, cls: 'cmp-add-ic' })}
        <b>${ops.length < 2 ? 'Add one more to compare' : 'Add an operator'}</b>
        <span class="cmp-sub">${4 - ops.length} of 4 slots open</span>
        <a class="act" href="#browse">Browse operators${icon('arrow')}</a>
      </div></th>` : '';
    const span = rows.length + (empties.length ? 1 : 0);
    const addCell = add ? `<td class="cmp-add-cell" rowspan="${span}"><div class="cmp-sugg">
        ${sugg.length ? `<span class="label">Suggested</span>${sugg.map(suggItem).join('')}` : `<p class="small muted">Browse to add more operators.</p>`}
      </div></td>` : '';
    const rowHtml = (r, i, extra) => {
      const lab = `<th scope="row" class="cmp-lab">${r.sec ? `<span class="cmp-sec">${r.sec}${r.secTip ? RN.ui.tip(r.secTip, 'About ' + r.sec) : ''}</span>` : ''}<span class="cmp-l">${esc(r.l)}${r.tip ? RN.ui.tip(r.tip, 'About ' + r.l) : ''}</span>${r.note ? `<span class="cmp-sub">${esc(r.note)}</span>` : ''}</th>`;
      let cells;
      if (r.lock) {
        cells = `<td colspan="${ops.length}" class="cmp-lockrow"><div class="cmp-lockbox">${icon('lock')}<span><b>See how each operator fits your company.</b> Sign in as a company and every column is scored on company revenue, employee range, industry and expertise.</span><button type="button" class="act" data-act="cmp-login" data-fit="1">Log in to see fit${icon('arrow')}</button></div></td>`;
      } else {
        const best = bestSet(ops, r);
        cells = ops.map((op, j) => `<td class="${best.has(j) ? 'cmp-best' : ''}">${r.html ? r.html[j] : r.cell(op)}</td>`).join('');
      }
      return `<tr class="${r.sec ? 'cmp-sec-start' : ''}">${lab}${cells}${i === 0 ? addCell : ''}${extra || ''}</tr>`;
    };
    const body = rows.map((r, i) => rowHtml(r, i)).join('');
    const n = empties.length;
    const fold = n ? `<tr class="cmp-fold-row"><th scope="row" class="cmp-lab"></th><td colspan="${ops.length}">
        <button type="button" class="cmp-fold" data-act="cmp-empty-toggle" aria-expanded="${showEmpty}" aria-controls="cmp-empty">${icon(showEmpty ? 'chev-up' : 'chev-down')}<span>${showEmpty ? 'Hide' : 'Show'} ${n === 1 ? 'one question' : RN.fmt.int(n) + ' questions'} no one here has answered</span><em>${esc(empties.map((r) => r.l).slice(0, 3).join(', '))}${n > 3 ? ` +${n - 3}` : ''}</em></button>
      </td></tr>` : '';
    const emptyBody = n ? `<tbody id="cmp-empty" class="cmp-empty-rows" ${showEmpty ? '' : 'hidden'}>${empties.map((r) => rowHtml(Object.assign({}, r, { sec: '' }), 1, add ? '<td class="cmp-add-cell"></td>' : '')).join('')}</tbody>` : '';
    return `<div class="tbl-wrap cmp-wrap" role="region" aria-label="Operator comparison" tabindex="0">
      <table class="cmp-tbl" style="--cols:${cols}">
        <thead><tr><th scope="col" class="cmp-lab cmp-corner"><span class="cmp-legend"><i></i>Best in row</span></th>${ops.map(colHead).join('')}${addHead}</tr></thead>
        <tbody>${body}${fold}</tbody>${emptyBody}
      </table>
    </div>`;
  }
  RN.actions['cmp-empty-toggle'] = () => {
    showEmpty = !showEmpty;
    const tb = document.getElementById('cmp-empty');
    const b = document.querySelector('[data-act="cmp-empty-toggle"]');
    if (!tb || !b) { RN.rerender(); return; }
    tb.hidden = !showEmpty;
    b.setAttribute('aria-expanded', showEmpty);
    b.innerHTML = b.innerHTML.replace(showEmpty ? 'Show' : 'Hide', showEmpty ? 'Hide' : 'Show');
    const sv = b.querySelector('svg'); if (sv) sv.outerHTML = icon(showEmpty ? 'chev-up' : 'chev-down');
  };

  /* Empty compare: a ghosted three-column comparison (faces from the network, the real row names) with the
     next step laid over it, and one-tap adds from the suggestions. Nothing in the ghost is a value. */
  function emptyState() {
    const st = RN.store.state;
    const sugg = suggestions([], 3);
    const faces = RN.model.ops.filter((op) => !op.hidden && op.photo && !op.isMatt).sort((a, b) => RN.fields.risRank(b) - RN.fields.risRank(a)).slice(0, 3);
    const ROWS = [['Reputation Index', [62, 48, 70]], ['CORE average', [40, 55, 34]], ['Verified focus areas', [78, 52, 64]], [RN.fields.availability.label, [46, 60, 38]], [st.persona === 'visitor' ? 'Monthly cost' : RN.fields.rate.label, [58, 44, 66]], [RN.fields.industries.label, [70, 36, 52]]];
    const best = [2, 1, 0, 1, 2, 0];
    const ghost = `<div class="cmp-ghost" aria-hidden="true">
        <div class="cmp-gh-row cmp-gh-head"><span></span>${faces.map((op) => `<span class="cmp-gh-col">${RN.ui.avatar(op, 'ava-md', { decorative: true })}<i class="cmp-gh-name"></i><i class="cmp-gh-btn"></i></span>`).join('')}</div>
        ${ROWS.map(([l, w], i) => `<div class="cmp-gh-row"><b>${esc(l)}</b>${w.map((x, j) => `<span class="${best[i] === j ? 'is-best' : ''}"><i style="width:${x}%"></i>${i % 2 ? '' : `<i class="sm" style="width:${Math.round(x * 0.6)}%"></i>`}</span>`).join('')}</div>`).join('')}
      </div>`;
    const slots = `<span class="cmp-slots" aria-label="0 of 4 slots filled">${[0, 1, 2, 3].map(() => '<i></i>').join('')}<span>0 of 4</span></span>`;
    return `<div class="cmp-empty">
        ${ghost}
        <div class="cmp-empty-card">
          ${slots}
          <h2 class="h2">Line operators up side by side</h2>
          <p class="cmp-empty-p">Add up to four from Browse or any profile. Compare puts them on the same standard fields and tints the best value in each row.</p>
          ${sugg.length ? `<div class="cmp-quick"><span class="label">${st.shortlist.length ? 'From your shortlist' : 'Start with these'}</span>
            <ul>${sugg.map((x) => `<li>${RN.ui.avatar(x.op, 'ava-sm', { decorative: true })}<span class="grow"><a href="#op.${esc(x.op.slug)}">${esc(x.op.name)}</a><span>Fractional ${esc(x.op.role)}</span></span>${RN.ui.cardTier(x.op, { size: 28 })}<button type="button" class="btn btn-sm btn-line" data-act="compare-toggle" data-id="${esc(x.op.id)}" aria-label="Add ${esc(x.op.name)} to compare">${icon('plus')}Add</button></li>`).join('')}</ul></div>` : ''}
          <div class="cmp-empty-act"><a class="btn" href="#browse">Browse operators${icon('arrow')}</a><span class="small muted">Use Compare on any card to add it.</span></div>
        </div>
      </div>`;
  }

  function render() {
    RN.model.applyEdits && RN.model.applyEdits();
    const st = RN.store.state;
    const ops = st.compare.map(RN.model.byId).filter(Boolean).slice(0, 4);
    const visitor = st.persona === 'visitor';
    const head = `<header class="wrap cmp-head">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#browse">Browse talent</a>${icon('chev-right')}<span>Compare</span></nav>
      <div class="cmp-head-row">
        <div class="stack" style="--gap:12px">
          <h1 class="h1">Compare <span class="serif">operators</span></h1>
          <p class="lede">The same standard fields for everyone, side by side. ${ops.length > 1 ? 'The best value in each row is tinted.' : 'Add up to four.'}</p>
        </div>
        ${ops.length ? `<div class="cmp-head-acts"><a class="btn btn-line" href="#browse">${icon('plus')}Add operators</a><button type="button" class="act muted" data-act="cmp-clear">Clear compare</button></div>` : ''}
      </div>
    </header>`;
    if (!ops.length) return `<div class="cmp-page cmp-is-empty" data-view-source="compare">${head}<section class="wrap cmp-body">${emptyState()}</section></div>`;
    return `<div class="cmp-page" data-view-source="compare">${head}
      <section class="wrap cmp-body">
        ${new Set(ops.map((op) => op.catKey)).size > 1 ? `<p class="cmp-mixnote">${icon('info')}<span>These operators answered different onboarding questions for their roles. Shared questions and comparable scope sit side by side; the rest is grouped by role.</span></p>` : ''}
        ${ops.length > 1 ? `<p class="cmp-swipe">${icon('arrow')}Swipe sideways to see all ${ops.length} operators</p>` : ''}
        ${table(ops)}
        <p class="cmp-foot tiny muted">Not added means the operator has not added this to their profile yet.${new Set(ops.map((op) => op.catKey)).size > 1 ? ' Not asked means the question is not part of that role’s onboarding.' : ''} No fees for companies. You pay the operator’s rate, nothing more. Rate Index medians are illustrative.${visitor ? ` <button type="button" class="act" data-act="cmp-login">Log in to see rates and match signals</button>` : ''}</p>
      </section></div>`;
  }

  /* ---------- Actions ---------- */
  RN.actions['cmp-remove'] = (el) => {
    const id = el.dataset.id;
    const op = RN.model.byId(id);
    undo = RN.store.state.compare.slice();
    RN.store.update((s) => { s.compare = s.compare.filter((x) => x !== id); }, 'compare');
    RN.ui.toast(`Removed ${esc(op ? op.first : 'operator')} from compare`, { icon: 'check-circle', action: { label: 'Undo', act: 'cmp-undo' } });
    RN.rerender();
  };
  RN.actions['cmp-clear'] = () => {
    undo = RN.store.state.compare.slice();
    RN.store.set('compare', []);
    RN.ui.toast('Compare cleared', { icon: 'check-circle', action: { label: 'Undo', act: 'cmp-undo' } });
    RN.rerender();
  };
  RN.actions['cmp-undo'] = () => {
    if (!undo) return;
    RN.store.set('compare', undo.slice(0, 4));
    undo = null;
    RN.rerender();
  };
  RN.actions['cmp-login'] = (el) => {
    const fit = el && el.dataset.fit;
    if (RN.browse && RN.browse.loginPrompt) RN.browse.loginPrompt(fit ? { title: 'Log in to see match signals', sub: 'Every operator is scored against your company once you sign in as a company. Browsing and compare stay open to everyone.' } : { title: 'Log in to see rates', sub: 'Hourly rates are shown to signed-in companies. Browsing and compare stay open to everyone.' });
    else RN.actions.login();
  };

  RN.view('compare', {
    route: 'compare', nav: 'browse',
    title: () => 'Compare operators',
    render,
    mount: () => {
      const ids = RN.store.state.compare.filter((id) => RN.model.byId(id)).slice(0, 4);
      ids.forEach((id) => {
        if (viewed.has(id)) return;
        viewed.add(id);
        RN.track('compare_view', { opId: id, source: 'compare', meta: { with: ids.filter((x) => x !== id) } });
      });
    },
    unmount: () => { viewed.clear(); },
  });
})();
