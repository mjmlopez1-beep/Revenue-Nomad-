/* Compare (#compare): up to four operators side by side on the standard fields.
   Rows use the registry labels (RN.fields) so compare reads exactly like intake, profile and filters.
   Missing data shows "N/A" (Scope L272/L281). The best value in a row is tinted, never shouted.
   Rate and match signals are login-gated. Loops: compare_view per operator (Studio "Compared, not
   chosen"), intro-open per column (shared intro flow), shortlist-toggle; profile links inherit
   data-view-source="compare" so core ui.js records profile_view source=compare. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const NA = '<span class="cmp-na">N/A</span>';
  const AVAIL_SCORE = { available_now: 3, available_2_weeks: 2, available_2_plus_weeks: 1 };
  const viewed = new Set();
  let undo = null;

  /* ---------- Values ---------- */
  const day = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => { const d = RN.now(); d.setHours(0, 0, 0, 0); return d; };
  const mdy = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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
    const t = RN.fields.risTierFor(op.ris.score);
    return `<span class="ris"><span class="ris-seal">${RN.ui.hexSeal(op.ris.label)}<b>${esc(op.ris.score)}</b></span><span class="ris-txt"><b>${esc(op.ris.label)}</b><span>${esc(t.min)}–${esc(t.max)} tier</span></span></span>`;
  }
  function coreCell(op) {
    const c = coreAvg(op);
    if (!c) return NA + sub('No client reviews yet');
    return `<div class="cmp-core"><b class="cmp-v">${c.avg.toFixed(1)}</b><span class="muted">/ 5</span>${RN.ui.stars(c.avg)}</div>${sub(esc(RN.fmt.plural(c.n, 'client review')))}`;
  }
  function engCell(op) {
    const e = op.engagements || [];
    if (!e.length) return NA + sub('None listed yet');
    const names = e.map((x) => x.company).filter(Boolean);
    return `<div><b class="cmp-v">${e.length}</b> <span>${e.length === 1 ? 'engagement' : 'engagements'}</span></div>${names.length ? sub(esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ` +${names.length - 3}` : '')) : ''}`;
  }
  function tagsCell(op) {
    const v = verifiedTags(op);
    if (!v.length) return NA + sub(`${esc(RN.fmt.plural((op.tags || []).length, 'focus area'))} claimed, none verified yet`);
    const sel = ((RN.store.state.browse || {}).tags || []).map((t) => t.toLowerCase());
    return `<div class="cmp-tags">${v.slice(0, 6).map((t) => RN.ui.ftag({ t: t.t, tier: 'verified' }).replace('class="ftag ', `class="ftag ${sel.includes(t.t.toLowerCase()) ? 'cmp-tag-hit ' : ''}`)).join('')}</div>${v.length > 6 ? sub(`+${v.length - 6} more verified`) : ''}`;
  }
  function startCell(op) {
    const d = startFor(op);
    if (!d) return NA + sub('Date not confirmed');
    const days = Math.round((d - today()) / 864e5);
    return `<b class="cmp-v cmp-v-sm tnum">${mdy(d)}</b>${sub(days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`)}`;
  }
  function hoursCell(op) {
    const c = op.avail && op.avail.hoursCode;
    return c ? `<span class="cmp-txt">${esc(RN.w.label('hoursPerMonth', c))}</span>` : NA;
  }
  function rateCell(op) {
    if (!op.rate) return NA;
    if (RN.store.state.persona === 'visitor') return `<button type="button" class="cmp-lock" data-act="cmp-login">${icon('lock')}Log in to see rate</button>`;
    const idx = RN.data.market.rateIndex.byCat[op.catKey];
    return `<b class="cmp-v cmp-v-sm">${esc(RN.fmt.rate(op.rate))}</b>${idx ? sub(`${esc(RN.fields.catLabel(op.catKey))} median $${esc(idx.p50)}`) : ''}`;
  }
  function listCell(key, vals, mine) {
    vals = (vals || []).filter(Boolean);
    if (!vals.length) return NA;
    const sorted = key === 'industries' ? vals.slice().sort((a, b) => (b === mine) - (a === mine)) : sortBy(key, vals);
    const max = key === 'industries' ? 5 : 8;
    return `<div class="cmp-chips">${sorted.slice(0, max).map((v) => `<span class="cmp-chip${v === mine ? ' on' : ''}"${v === mine ? ' title="Matches your company"' : ''}>${v === mine ? icon('check') : ''}${esc(RN.w.label(key, v))}</span>`).join('')}${sorted.length > max ? `<span class="cmp-chip more">+${sorted.length - max} more</span>` : ''}</div>`;
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

  /* ---------- Rows (standard labels) ---------- */
  function rowsFor() {
    const st = RN.store.state;
    const buyer = st.persona === 'buyer', visitor = st.persona === 'visitor';
    const co = RN.personas.buyer.company;
    const F = RN.fields;
    const coreTip = `<b>CORE client reviews</b><br>Clients rate ${F.coreDims.options.map((d) => esc(d.l)).join(', ')} from 1 to 5 after an engagement. Shown as the average across reviews.`;
    const R = [];
    if (buyer) R.push({ sec: `Fit for ${esc(co.name)}`, l: 'Match signals', tip: `<b>Match signals</b><br>Scored against ${esc(co.name)}: company revenue, employee range, industry, plus the role, GTM motion and need in your saved match preferences.`, cell: fitCell, val: (op) => RN.model.fit(op, brief(op)).pct, dir: 'max' });
    else if (visitor) R.push({ sec: 'Fit for your company', l: 'Match signals', lock: true });
    R.push({ sec: 'Standing', l: 'Reputation Index', tip: RN.ui.risExplainer(), cell: risCell, val: (op) => op.ris.score, dir: 'max' });
    R.push({ l: 'CORE average', tip: coreTip, cell: coreCell, val: (op) => { const c = coreAvg(op); return c ? c.avg : null; }, dir: 'max' });
    R.push({ l: 'Engagement history', cell: engCell, val: (op) => (op.engagements || []).length || null, dir: 'max' });
    R.push({ sec: 'Expertise', l: 'Verified focus areas', note: 'Top 6 by score', cell: tagsCell, val: (op) => verifiedTags(op).length || null, dir: 'max' });
    R.push({ sec: 'Availability', l: F.availability.label, cell: (op) => RN.ui.avail(op, { hours: false }), val: (op) => AVAIL_SCORE[op.avail.key] || null, dir: 'max' });
    R.push({ l: F.startDate.label, cell: startCell, val: (op) => { const d = startFor(op); return d ? -d.getTime() : null; }, dir: 'max' });
    R.push({ l: F.hoursPerMonth.label, cell: hoursCell, val: (op) => +(op.avail.hoursCode || 0) || null, dir: 'max' });
    R.push({ l: F.rate.label, cell: rateCell, val: (op) => (visitor ? null : op.rate || null), dir: 'min' });
    R.push({ l: F.engagementTypes.label, cell: (op) => listCell('engagementTypes', op.engagementTypes) });
    R.push({ sec: 'Company fit', l: 'Company revenue', cell: (op) => listCell('revenueRange', op.revenueRanges, buyer ? co.revenueRange : null), val: buyer ? (op) => (op.revenueRanges.includes(co.revenueRange) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.employeeRange.label, cell: (op) => listCell('employeeRange', op.employeeRanges, buyer ? co.employeeRange : null), val: buyer ? (op) => (op.employeeRanges.includes(co.employeeRange) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.industries.label, cell: (op) => listCell('industries', op.industries, buyer ? co.industry : null), val: buyer ? (op) => (op.industries.includes(co.industry) ? 1 : 0) : null, dir: buyer ? 'max' : null });
    R.push({ l: F.salesMotions.label, cell: (op) => listCell('salesMotions', op.motions) });
    return R;
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
    const push = (op, why) => { if (op && !inCmp.has(op.id) && !seen.has(op.id) && !op.hidden) { seen.add(op.id); out.push({ op, why }); } };
    st.shortlist.map(RN.model.byId).forEach((op) => push(op, 'On your shortlist'));
    ops.forEach((op) => RN.model.similar(op, 4).forEach((x) => push(x, `Similar to ${op.first}`)));
    RN.model.ops.slice().sort((a, b) => b.ris.score - a.ris.score || b.completeness - a.completeness).slice(0, 8).forEach((x) => push(x, 'High Reputation Index'));
    return out.slice(0, n || 3);
  }
  function suggItem(s) {
    const op = s.op;
    return `<div class="cmp-sug">
      ${RN.ui.avatar(op, 'ava-sm')}
      <div class="grow"><a class="cmp-sug-n" href="#op.${esc(op.slug)}">${esc(op.name)}</a>
        <span class="cmp-sub">Fractional ${esc(op.role)} · ${esc(op.ris.score)} ${esc(op.ris.label)}</span>
        <span class="cmp-sug-why">${esc(s.why)}</span></div>
      <button type="button" class="btn btn-line btn-sm cmp-sug-add" data-act="compare-toggle" data-id="${esc(op.id)}" aria-label="Add ${esc(op.name)} to compare">${icon('plus')}Add</button>
    </div>`;
  }

  /* ---------- Page ---------- */
  function colHead(op) {
    const st = RN.store.state;
    const saved = st.shortlist.includes(op.id);
    const asked = st.persona === 'buyer' && st.intros.some((i) => i.opId === op.id && i.status !== 'declined');
    return `<th scope="col" class="cmp-col"><div class="cmp-hd">
      <div class="cmp-hd-id">${RN.ui.avatar(op, 'ava-md')}<div class="grow"><a class="cmp-name" href="#op.${esc(op.slug)}" title="${esc(op.name)}">${esc(op.name)}</a><span class="cmp-role">Fractional ${esc(op.role)}</span></div></div>
      <button type="button" class="btn btn-sm cmp-intro ${asked ? 'btn-line' : ''}" data-act="intro-open" data-id="${esc(op.id)}">${asked ? icon('check') + 'Intro requested' : 'Request intro'}</button>
      <div class="cmp-hd-acts">
        <button type="button" class="act ${saved ? '' : 'muted'}" data-act="shortlist-toggle" data-id="${esc(op.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved ? 'Saved' : 'Save'}</button>
        <button type="button" class="act muted" data-act="cmp-remove" data-id="${esc(op.id)}" aria-label="Remove ${esc(op.name)} from compare">${icon('x')}Remove</button>
      </div>
    </div></th>`;
  }

  function table(ops) {
    const rows = rowsFor();
    const add = ops.length < 4;
    const cols = ops.length + (add ? 1 : 0);
    const sugg = add ? suggestions(ops, Math.min(4, 5 - ops.length)) : [];
    const addHead = add ? `<th scope="col" class="cmp-col cmp-col-add"><div class="cmp-add-hd">
        <span class="cmp-add-ic">${icon('plus')}</span>
        <b>${ops.length < 2 ? 'Add one more to compare' : 'Add an operator'}</b>
        <span class="cmp-sub">${4 - ops.length} of 4 slots open</span>
        <a class="act" href="#browse">Browse operators${icon('arrow')}</a>
      </div></th>` : '';
    const addCell = add ? `<td class="cmp-add-cell" rowspan="${rows.length}"><div class="cmp-sugg">
        ${sugg.length ? `<span class="label">Suggested</span>${sugg.map(suggItem).join('')}` : `<p class="small muted">Browse to add more operators.</p>`}
      </div></td>` : '';
    const body = rows.map((r, i) => {
      const lab = `<th scope="row" class="cmp-lab">${r.sec ? `<span class="cmp-sec">${r.sec}</span>` : ''}<span class="cmp-l">${esc(r.l)}${r.tip ? RN.ui.tip(r.tip, 'About ' + r.l) : ''}</span>${r.note ? `<span class="cmp-sub">${esc(r.note)}</span>` : ''}</th>`;
      let cells;
      if (r.lock) {
        cells = `<td colspan="${ops.length}" class="cmp-lockrow"><div class="cmp-lockbox">${icon('lock')}<span><b>See how each operator fits your company.</b> Sign in as a client and every column is scored on company revenue, size, industry and expertise.</span><button type="button" class="btn btn-sm" data-act="cmp-login" data-fit="1">Log in as a client</button></div></td>`;
      } else {
        const best = bestSet(ops, r);
        cells = ops.map((op, j) => `<td class="${best.has(j) ? 'cmp-best' : ''}">${r.cell(op)}</td>`).join('');
      }
      return `<tr class="${r.sec ? 'cmp-sec-start' : ''}">${lab}${cells}${i === 0 ? addCell : ''}</tr>`;
    }).join('');
    return `<div class="tbl-wrap cmp-wrap" role="region" aria-label="Operator comparison" tabindex="0">
      <table class="cmp-tbl" style="--cols:${cols}">
        <thead><tr><th scope="col" class="cmp-lab cmp-corner"><span class="cmp-legend"><i></i>Best in row</span></th>${ops.map(colHead).join('')}${addHead}</tr></thead>
        <tbody>${body}</tbody>
      </table>
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
    if (!ops.length) {
      const sugg = suggestions([], 3);
      const card = (op) => (RN.browse && RN.browse.card ? RN.browse.card(op) : RN.ui.opCard(op));
      return `<div class="cmp-page" data-view-source="compare">${head}
        <section class="wrap cmp-body">
          ${RN.ui.empty({ icon: 'compare', title: 'Nothing to compare yet', body: 'Add up to four operators from Browse or any profile. Compare lines them up on the same fields, so the differences are easy to see.', cta: '<a class="btn" href="#browse">Browse operators</a>' })}
          ${sugg.length ? `<div class="cmp-start"><h2 class="h4">${st.shortlist.length ? 'Start with your shortlist' : 'Start with these operators'}</h2><p class="small muted">Use Compare on any card to add it.</p>
            <div class="grid g-3 cmp-start-grid">${sugg.map((s) => card(s.op)).join('')}</div></div>` : ''}
        </section></div>`;
    }
    return `<div class="cmp-page" data-view-source="compare">${head}
      <section class="wrap cmp-body">
        ${ops.length > 1 ? `<p class="cmp-swipe">${icon('arrow')}Swipe sideways to see all ${ops.length} operators</p>` : ''}
        ${table(ops)}
        <p class="cmp-foot tiny muted">N/A means the operator has not added this to their profile yet. Rate Index medians are illustrative.${visitor ? ` <button type="button" class="act" data-act="cmp-login">Log in to see rates and match signals</button>` : ''}</p>
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
    if (RN.browse && RN.browse.loginPrompt) RN.browse.loginPrompt(fit ? { title: 'Log in to see match signals', sub: 'Every operator is scored against your company once you sign in as a client. Browsing and compare stay open to everyone.' } : { title: 'Log in to see rates', sub: 'Hourly rates are shown to signed-in clients. Browsing and compare stay open to everyone.' });
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
