/* Insights hub (#insights), The State of Fractional GTM 2027 (#report) and the Rate Index (#rates).
   Everything here is cut on the standard picklists (RN.fields), so every chart can hand its exact
   filter to Browse: research -> shortlist in one click (SPEC loop 10).
   Figures come from RN.data.market and are illustrative (labelled on every surface). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = RN.fields;
  const MK = () => RN.data.market;
  const REP = () => RN.data.market.report;
  const RI = () => RN.data.market.rateIndex;

  /* ---------- Shared helpers (exported on RN.ins so they can be promoted to core) ---------- */
  const ins = (RN.ins = RN.ins || {});

  // market.report.hours uses its own keys; map them to RN.fields.hoursPerMonth codes
  const HOURS = { h_under_20: '19', h_20: '20', h_40: '40', h_60: '60', h_80: '80', h_100: '100', h_160: '160' };
  // market.report.term is in RN.fields.term order
  const TERM = ['1_3', '3_6', '6_12', '12_plus'];
  ins.hoursRows = () => REP().hours.map((r) => ({ code: HOURS[r.h] || r.h, v: r.v }));
  // Hours used for a monthly estimate. "<20" (code 19) is counted as 15 hours.
  ins.hoursNum = (code) => (String(code) === '19' ? 15 : +code || 0);
  ins.mult = (rev) => (rev && RI().byRevenue[rev]) || 1;
  ins.rate = function (cat, rev) {
    const b = RI().byCat[cat] || RI().byCat.sales_leadership;
    const m = ins.mult(rev);
    return { p25: b.p25 * m, p50: b.p50 * m, p75: b.p75 * m, n: b.n, m };
  };
  ins.range = function (cat, rev, hours) {
    const r = ins.rate(cat, rev);
    const h = ins.hoursNum(hours);
    return { lo: r.p25 * h, mid: r.p50 * h, hi: r.p75 * h, h, r };
  };
  const r500 = (n) => Math.round(n / 500) * 500;
  const usd = (n) => RN.fmt.usd(n);
  const hr = (n) => '$' + Math.round(n);
  // L58 format: "$10,000 - $30,000/mo"
  ins.fmtRange = (lo, hi) => `${usd(r500(lo))} - ${usd(r500(hi))}/mo`;
  const catLabel = (c) => F.catLabel(c);
  const revLabel = (v) => RN.w.label('companyRevenue', v);
  const hoursLabel = (v) => RN.w.label('hoursPerMonth', v);
  const pctChange = (a, b) => Math.round(((a - b) / b) * 100);
  const MIN_CELL = 20;
  const sampleNote = (n) => (n < MIN_CELL ? `Only ${n} rates in this category, below our minimum of ${MIN_CELL}. Read it as directional.` : '');
  const personaCo = () => (RN.store.state.persona === 'buyer' ? RN.personas.buyer.company : null);
  const opMe = () => (RN.store.state.persona === 'operator' ? RN.myOp() : null);
  const weekStart = () => { const d = RN.now(); const back = (d.getDay() + 6) % 7; const m = new Date(d.getTime() - back * 864e5); m.setHours(0, 0, 0, 0); return m; };
  const nextMonday = () => new Date(weekStart().getTime() + 7 * 864e5);
  const illus = (extra) => `<span class="pill ins-illus" title="Figures are invented to show shape and value">${icon('info')}Illustrative${extra ? ' ' + esc(extra) : ''}</span>`;
  const jsonAttr = (o) => esc(JSON.stringify(o || {}));

  /* Browse hand-off: the same filter keys RN.model.search reads, so Browse needs no translation */
  function cleanFilters(f) {
    const out = {};
    Object.keys(f || {}).forEach((k) => {
      const v = f[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    return out;
  }
  ins.goBrowse = function (filters, source, q, tags) {
    const f = cleanFilters(filters);
    RN.store.update((s) => { s.browse = Object.assign({}, s.browse, { q: q || '', tags: tags || [], filters: f, sort: 'best' }); }, 'browse');
    RN.track('research_cta', { source: source || 'insights', filters: f, q: q || '', tags: tags || [] });
    RN.go('browse');
  };
  RN.actions['ins-browse'] = (el) => {
    let f = {}, tags = [];
    try { f = JSON.parse(el.dataset.f || '{}'); } catch (e) { f = {}; }
    try { tags = el.dataset.tags ? JSON.parse(el.dataset.tags) : []; } catch (e) { tags = []; }
    ins.goBrowse(f, el.dataset.src, el.dataset.q, tags);
  };
  function browseBtn(label, f, src, cls, extra) {
    return `<button type="button" class="${cls || 'btn'}" data-act="ins-browse" data-src="${esc(src)}" data-f="${jsonAttr(f)}" ${extra || ''}>${esc(label)}${icon('arrow')}</button>`;
  }

  /* Charts: drawn in mount() at the container's real pixel width so chart text stays at 12px. */
  function bars(rows, o, w) {
    o = o || {};
    const fmt = o.fmt || ((n) => RN.fmt.int(n));
    if (w >= 460) {
      const longest = Math.max(...rows.map((r) => String(r.label).length));
      const labelW = Math.round(RN.clamp(longest * 6.6 + 18, 110, w * 0.46));
      return RN.chart.bars(rows, { w: Math.round(w), labelW, fmt, max: o.max, label: o.label, rowH: 36, barH: 16 });
    }
    // Narrow screens: label above the bar so the bar keeps the full width (RN.chart.bars has no stacked layout)
    const max = o.max || Math.max(...rows.map((r) => r.value), 1);
    return `<div class="chart ins-sbars" role="img" aria-label="${esc(o.label || 'Bar chart')}">${rows.map((r) => `<div class="ins-sbar">
        <div class="ins-sbar-top"><span>${esc(r.label)}</span><b>${esc(fmt(r.value, r))}</b></div>
        <div class="ins-sbar-track"><i class="${r.hi ? 'hi' : r.muted ? 'mu' : ''}" style="width:${Math.max(1.5, (r.value / max) * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`;
  }
  function cols(rows, o, w) {
    o = o || {};
    // Column labels collide when the slot is narrower than the longest label: fall back to bars
    const longest = Math.max(...rows.map((r) => String(r.label).length));
    if (longest * 6.4 + 10 > w / rows.length) return bars(rows, o, w);
    return RN.chart.columns(rows, { w: Math.round(w), h: o.h || (w < 460 ? 196 : 220), fmt: o.fmt, max: o.max, label: o.label });
  }
  const DRAW = {};
  function drawAll(root) {
    RN.$$('[data-ins-chart]', root || document).forEach(drawOne);
  }
  function drawOne(el) {
    const fn = DRAW[el.dataset.insChart];
    if (!fn) return;
    const w = Math.round(el.clientWidth || el.getBoundingClientRect().width || 600);
    el.innerHTML = fn(Math.max(240, w));
  }
  function redraw(key) { RN.$$(`[data-ins-chart="${key}"]`).forEach(drawOne); }

  /* Lifecycle shared by the three views: redraw charts on resize, clean up listeners */
  let cleanup = null;
  function lifecycle(root, extra) {
    if (cleanup) cleanup();
    let lastW = window.innerWidth, t = null;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 8) { lastW = window.innerWidth; drawAll(); } }, 140); };
    window.addEventListener('resize', onResize);
    drawAll(root);
    const more = extra ? extra(root) : null;
    cleanup = () => { window.removeEventListener('resize', onResize); clearTimeout(t); if (more) more(); cleanup = null; };
  }
  function unmount() { if (cleanup) cleanup(); }

  /* Clipboard with a fallback for file:// and older browsers */
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
    };
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback); else fallback(); } catch (e) { fallback(); }
  }

  /* Scroll to a section below the fixed header and the sticky chapter nav */
  function jump(id, smooth) {
    const el = document.getElementById(id);
    if (!el) return;
    const nav = document.querySelector('.ins-chapnav');
    const hdr = document.getElementById('hdr');
    const off = (hdr && !hdr.hidden ? hdr.offsetHeight : 0) + (nav ? nav.offsetHeight : 0) + 12;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - off), behavior: smooth === false ? 'auto' : 'smooth' });
  }
  RN.actions['ins-jump'] = (el) => jump(el.dataset.to);
  let pendingJump = null;
  RN.actions['ins-report-ch'] = (el) => { pendingJump = el.dataset.ch; RN.go('report'); };

  /* ---------- Newsletter (hub and report end) ---------- */
  const SUB_KEY = 'ins-pulse';
  function newsForm(src) {
    const st = RN.store.state;
    const sub = st.seen && st.seen[SUB_KEY];
    if (sub) {
      return `<div class="ins-news-done" data-ins-news>
        <p class="ins-news-ok">${icon('check-circle')}<span>Subscribed as <b>${esc(sub.email)}</b>. The next Pulse lands ${esc(RN.fmt.date(nextMonday()))}.</span></p>
        <button type="button" class="act" data-act="ins-unsub">Unsubscribe</button>
      </div>`;
    }
    const me = RN.me && RN.me();
    const pre = me && me.email ? me.email : '';
    return `<form class="ins-news-form" data-submit="ins-subscribe" data-src="${esc(src)}" data-ins-news novalidate>
      <label class="sr-only" for="ins-news-${esc(src)}">${esc(F.email.label)}</label>
      ${RN.w.control('email', pre, { name: 'email', id: 'ins-news-' + src })}
      <button class="btn btn-leaf" type="submit">Subscribe</button>
    </form>
    <p class="ins-news-fine">One email every Monday. Unsubscribe in one click.</p>`;
  }
  RN.submits['ins-subscribe'] = (form, data) => {
    const email = String(data.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { RN.ui.toast('Enter a work email so we can send the Pulse.', { icon: 'info' }); form.querySelector('input[name=email]').focus(); return; }
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen[SUB_KEY] = { email, ts: RN.now().toISOString(), source: form.dataset.src }; }, 'seen');
    RN.track('newsletter_signup', { source: form.dataset.src, meta: { list: 'pulse' } });
    RN.mail(email, 'You are subscribed to the Fractional GTM Pulse', `Every Monday: the Rate Index by role category, the demand index, and the focus areas clients searched for that week.\n\nFirst issue: ${RN.fmt.date(nextMonday())}.\nUnsubscribe from any issue in one click.`, 'newsletter');
    RN.ui.toast(`Subscribed. The next Pulse lands ${esc(RN.fmt.dateShort(nextMonday()))}.`);
    RN.$$('[data-ins-news]').forEach((n) => { const box = n.closest('.ins-news-slot'); if (box) box.innerHTML = newsForm(box.dataset.src); });
  };
  RN.actions['ins-unsub'] = () => {
    const sub = RN.store.state.seen && RN.store.state.seen[SUB_KEY];
    RN.store.update((s) => { if (s.seen) delete s.seen[SUB_KEY]; }, 'seen');
    if (sub) RN.mail(sub.email, 'You are unsubscribed from the Fractional GTM Pulse', 'You will not get the Monday email anymore. Rates and research stay open at Revenue Nomad Insights.', 'newsletter');
    RN.ui.toast('Unsubscribed. No more Monday emails.');
    RN.$$('.ins-news-slot').forEach((box) => { box.innerHTML = newsForm(box.dataset.src); });
  };
  const newsSlot = (src) => `<div class="ins-news-slot" data-src="${esc(src)}">${newsForm(src)}</div>`;

  /* =====================================================================
     1. INSIGHTS HUB (#insights)
     ===================================================================== */
  function summaryStats() {
    const R = REP();
    const h = ins.hoursRows();
    const under40 = h.filter((r) => +r.code < 40).reduce((a, r) => a + r.v, 0);
    // Stat 2 recomputed from the hours data (the stored caption says "20 to 39 hours", which the hours cut does not support)
    return R.summary.map((s, i) => {
      if (i === 1) return { v: under40 + '%', l: 'Of engagements are scoped under 40 hours a month', to: 'ins-ch3' };
      return { v: s.v, l: s.l.replace(/\bbuyers\b/g, 'clients').replace(/\bbuyer\b/g, 'client'), to: ['ins-ch2', 'ins-ch3', 'ins-ch3', 'ins-ch5', 'ins-ch1', 'ins-ch1'][i] };
    });
  }

  function hub() {
    const R = REP(), ri = RI();
    const st = RN.store.state;
    const tr = ri.trend, last = tr[tr.length - 1], prev = tr[tr.length - 2];
    const di = R.demandIndex;
    const cur = di[3], prevY = di[2];
    const mk = RN.model.market();
    const ops = RN.model.ops.filter((o) => !o.hidden);
    const weekAgo = RN.now().getTime() - 7 * 864e5;
    const newApps = (st.pending || []).filter((a) => !a.submittedAt || new Date(a.submittedAt).getTime() >= weekAgo).length;
    const topDemand = mk.tags.slice().sort((a, b) => b.demand - a.demand).slice(0, 6);
    const topQ = mk.queries.filter((q) => !q.zero).slice().sort((a, b) => b.vol - a.vol).slice(0, 6);
    const maxDemand = Math.max(...topDemand.map((t) => t.demand), 1);
    const verifiedTags = new Set();
    ops.forEach((o) => o.tags.forEach((t) => { if (t.tier !== 'claimed') verifiedTags.add(t.t.toLowerCase()); }));
    const sum = summaryStats();
    const week = weekStart();
    const co = personaCo();
    const me = opMe();
    const pos = me ? RN.model.positioning(me.id) : null;
    const coRange = ins.range('sales_leadership', co ? co.revenueRange : '5m_20m', '40');
    const topCats = Object.keys(ri.byCat).map((k) => ({ k, v: ri.byCat[k] })).sort((a, b) => b.v.p50 - a.v.p50).slice(0, 4);
    const bps = (RN.data.blueprints || (RN.projects && RN.projects.blueprints) || []);
    const bpList = Array.isArray(bps) ? bps.slice(0, 3).map((b) => b.title || b.name).filter(Boolean) : [];
    const libCount = F.fitTags.options.length;

    return `<div class="ins-hub">
    <section class="wrap ins-hero">
      <div class="ins-hero-copy">
        <span class="eyebrow">Revenue Nomad Insights</span>
        <h1 class="h1">The numbers behind <span class="serif ins-nw">fractional go-to-market.</span></h1>
        <p class="lede">Rates, demand and the frameworks behind engagements that get renewed. Built from what clients search for and what operators report on Revenue Nomad. Open to everyone, no login.</p>
        <div class="row ins-hero-cta">
          <a class="btn btn-lg" href="#report">Read the 2027 report${icon('arrow')}</a>
          <a class="btn btn-line btn-lg" href="#rates">Estimate a rate</a>
        </div>
        <p class="ins-hero-meta small muted">${icon('clock')}<span>Updated ${esc(RN.fmt.date(RN.now()))}. Market figures in this prototype are illustrative.</span></p>
      </div>
      <a class="ins-book" href="#report" aria-label="Read The State of Fractional GTM 2027">
        <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
        <span class="eyebrow">Revenue Nomad Research</span>
        <span class="ins-book-yr">2027</span>
        <span class="ins-book-t">The State of Fractional GTM</span>
        <span class="ins-book-stats">
          <span><b>${esc(sum[0].v)}</b>median hourly rate</span>
          <span><b>${esc(sum[2].v)}</b>median engagement</span>
          <span><b>${esc(sum[3].v)}</b>rehire rate with 3+ reviews</span>
        </span>
        <span class="ins-book-foot"><span>6 chapters · ${RN.fmt.int(R.sample.operators + R.sample.companies)} respondents · Free to read</span>${icon('arrow')}</span>
      </a>
    </section>

    <section class="wrap ins-tools-sec">
      <div class="ins-sec-hd"><div><span class="eyebrow">Tools and research</span><h2 class="h2">Our own data, <span class="serif">open to everyone.</span></h2></div></div>
      <div class="ins-tools">
        <article class="card ins-tool ins-tool-wide">
          <div class="ins-tool-hd"><span class="ins-tool-ic">${icon('chart')}</span><div><h3 class="h4"><a href="#rates" class="ins-stretch">Rate Index</a></h3><p class="small muted">Hourly medians and ranges for every role category, updated quarterly.</p></div></div>
          <div class="ins-ri">
            <div class="ins-ri-now">
              <span class="label">All-category median, ${esc(last.l)}</span>
              <div class="ins-ri-v"><span class="num">${hr(last.v)}</span><small>/hr</small></div>
              <div class="row-nw" style="--gap:8px">${RN.ui.delta(last.v, prev.v)}<span class="tiny muted">vs ${esc(prev.l)}</span></div>
              <div class="ins-ri-spark">${RN.chart.spark(tr.map((t) => t.v), { w: 160, h: 40, label: 'Rate Index median by quarter' })}</div>
            </div>
            <ul class="ins-ri-list">${topCats.map((c) => `<li><span class="row-nw" style="--gap:8px">${RN.ui.catDot(c.k)}${esc(catLabel(c.k))}</span><b class="num">${hr(c.v.p50)}</b></li>`).join('')}</ul>
          </div>
          <span class="ins-tool-go">Open the Rate Index${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd"><span class="ins-tool-ic">${icon('grid')}</span><div><h3 class="h4"><a href="#framework" class="ins-stretch">GTM Framework</a></h3><p class="small muted">6 areas across 7 stages of the client journey. See what good looks like in each cell and who is strong there.</p></div></div>
          <div class="ins-fw" aria-hidden="true">${Array.from({ length: 42 }, (_, i) => `<i class="${[3, 9, 10, 16, 17, 24, 30, 31, 38].includes(i) ? 'on' : [2, 4, 11, 23, 25, 37].includes(i) ? 'mid' : ''}"></i>`).join('')}</div>
          <span class="ins-tool-go">Explore the framework${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd"><span class="ins-tool-ic">${icon('layers')}</span><div><h3 class="h4"><a href="#library" class="ins-stretch">Fit Tag Library</a></h3><p class="small muted">${RN.fmt.int(libCount)} focus areas with definitions, client demand and verified supply.</p></div></div>
          <div class="opc-tags">${topDemand.slice(0, 3).map((t) => RN.ui.ftag({ t: t.t, tier: t.verified ? 'verified' : 'claimed' })).join('')}</div>
          <p class="tiny muted">${RN.fmt.int(verifiedTags.size)} focus areas are client-verified on the network today.</p>
          <span class="ins-tool-go">Search the library${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd"><span class="ins-tool-ic">${icon('doc')}</span><div><h3 class="h4"><a href="#blueprints" class="ins-stretch">Engagement Blueprints</a></h3><p class="small muted">Scoped projects with the hours, term and 30/60/90-day plan they need, priced from the Rate Index.</p></div></div>
          ${bpList.length ? `<ul class="ins-mini-list">${bpList.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          <ol class="ins-plan" aria-label="Every Blueprint has a 30, 60 and 90-day plan"><li><b>30</b><span>days</span></li><li><b>60</b><span>days</span></li><li><b>90</b><span>days</span></li></ol>
          <p class="tiny muted">Start from a Blueprint and post a project in three steps.</p>
          <span class="ins-tool-go">Browse Blueprints${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd"><span class="ins-tool-ic">${icon('book')}</span><div><h3 class="h4">Guides</h3><p class="small muted">Straight answers to the questions clients ask before they hire.</p></div></div>
          <ul class="ins-q-list">
            <li><a href="#rates">How much does a fractional VP of Sales cost?${icon('chev-right')}</a></li>
            <li><a href="#guides">Should my first sales leader be fractional or full time?${icon('chev-right')}</a></li>
            <li><a href="#guides">How do I scope a fractional sales engagement?${icon('chev-right')}</a></li>
          </ul>
          <a class="ins-tool-go" href="#guides">All guides${icon('arrow')}</a>
        </article>
      </div>
    </section>

    <section class="wrap ins-pulse">
      <div class="ins-sec-hd">
        <div><span class="eyebrow">This week in fractional GTM</span><h2 class="h2">Week of ${esc(RN.fmt.dateShort(week))}. <span class="serif">What clients looked for.</span></h2></div>
        ${illus()}
      </div>
      <div class="stats-row ins-kpis" style="--cols:4">
        <div class="stat"><span class="stat-l">Demand index, ${esc(cur.l)}</span><span class="stat-v">${RN.fmt.int(cur.v)}</span><span class="row-nw" style="--gap:8px">${RN.ui.delta(cur.v, prevY.v)}<span class="tiny muted">vs ${esc(prevY.l)}. 2023 = 100</span></span></div>
        <div class="stat"><span class="stat-l">Rate Index median</span><span class="stat-v">${hr(last.v)}<small class="ins-unit">/hr</small></span><span class="row-nw" style="--gap:8px">${RN.ui.delta(last.v, prev.v)}<span class="tiny muted">vs ${esc(prev.l)}</span></span></div>
        <div class="stat"><span class="stat-l">New operator applications</span><span class="stat-v">${RN.fmt.int(newApps)}</span><span class="tiny muted">This week · ${RN.fmt.int(ops.length)} operators live on the network</span></div>
        <div class="stat"><span class="stat-l">Searches with no match</span><span class="stat-v">${RN.fmt.int(mk.zero.length)}</span><span class="tiny muted">Clients searched and nobody fit</span></div>
      </div>
      <div class="grid g-2 ins-pulse-grid">
        <div class="card">
          <div class="card-hd"><div><h3>Most searched focus areas</h3><p class="sub">Client searches in the last 7 days, and how many operators are verified in each</p></div></div>
          <ol class="ins-trows">${topDemand.map((t, i) => `<li><button type="button" class="ins-trow" data-act="ins-browse" data-src="hub_top_searched" data-tags="${jsonAttr([t.t])}" data-f="{}">
              <span class="ins-trow-n num">${i + 1}</span>
              <span class="ins-trow-b"><span class="ins-trow-t"><b>${esc(t.t)}</b><span class="tiny muted">${esc(catLabel(t.c))}</span></span>
                <span class="meter"><i style="width:${((t.demand / maxDemand) * 100).toFixed(1)}%"></i></span>
                <span class="tiny muted">${RN.fmt.int(t.demand)} searches · ${RN.fmt.int(t.supply)} claim it · ${t.verified ? `${RN.fmt.int(t.verified)} client-verified` : 'none verified yet'}</span></span>
              ${icon('chev-right')}</button></li>`).join('')}</ol>
        </div>
        <div class="card ins-unmet">
          <div class="card-hd"><div><h3>What clients typed</h3><p class="sub">Top searches in the last 7 days. Select one to run it</p></div></div>
          <ul class="ins-qs">${topQ.map((q) => `<li><button type="button" class="chip chip-sm" data-act="ins-browse" data-src="hub_top_query" data-q="${esc(q.q)}" data-f="{}">${icon('search')}${esc(q.q)}<span class="ins-qs-n">${RN.fmt.int(q.vol)}</span></button></li>`).join('')}</ul>
          <div class="card-hd ins-unmet-hd"><div><h3>Searches that found no one</h3><p class="sub">Real client needs the network cannot fill yet</p></div></div>
          ${mk.zero.length ? `<ul class="ins-zero">${mk.zero.slice(0, 3).map((z) => `<li><span class="ins-zero-q">“${esc(z.q)}”</span><span class="tiny muted">${esc([z.cat ? catLabel(z.cat) : '', z.industry ? RN.w.label('industries', z.industry) : '', z.live ? 'searched today' : RN.fmt.plural(z.vol, 'search', 'searches') + ' this week'].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : RN.ui.empty({ icon: 'search', title: 'Every search found a match this week', body: 'When a client search finds no one, it shows up here.' })}
          <div class="ins-unmet-ft">
            <a class="act" href="#studio.positioning">${icon('target')}Operators: add or verify these focus areas</a>
            <a class="act" href="#talk">${icon('message')}Hiring for one of these? Talk to us</a>
          </div>
        </div>
      </div>
    </section>

    <section class="wrap ins-finds">
      <div class="ins-sec-hd"><div><span class="eyebrow">From the 2027 report</span><h2 class="h2">Three findings <span class="serif">worth knowing before you hire.</span></h2></div><a class="act" href="#report">Read all six chapters${icon('arrow')}</a></div>
      <div class="grid g-3">
        ${[
          { s: sum[0], ch: 'ins-ch2', n: 'Chapter 2 · What it costs' },
          { s: sum[1], ch: 'ins-ch3', n: 'Chapter 3 · How engagements are scoped' },
          { s: sum[3], ch: 'ins-ch5', n: 'Chapter 5 · Who gets rehired' },
        ].map((f) => `<button type="button" class="card card-link ins-find" data-act="ins-report-ch" data-ch="${f.ch}">
            <span class="label">${esc(f.n)}</span><span class="ins-find-v">${esc(f.s.v)}</span><span class="ins-find-l">${esc(f.s.l)}</span><span class="ins-tool-go">Read the chapter${icon('arrow')}</span></button>`).join('')}
      </div>
    </section>

    <section class="wrap ins-you">
      <div class="grid g-2">
        <div class="card ins-you-card">
          <span class="eyebrow">For companies hiring</span>
          <h3 class="h3">Price the role before you post it.</h3>
          <p class="body">${co
            ? `For ${esc(co.name)} (${esc(revLabel(co.revenueRange))} revenue), a fractional Sales Leadership leader at 40 hrs / month typically costs <b>${esc(ins.fmtRange(coRange.lo, coRange.hi))}</b>.`
            : `A fractional Sales Leadership leader at 40 hrs / month for a ${esc(revLabel('5m_20m'))} company typically costs <b>${esc(ins.fmtRange(coRange.lo, coRange.hi))}</b>. Pick your role and company size for your number.`}</p>
          <a class="btn btn-line" href="#rates">Open the estimator${icon('arrow')}</a>
        </div>
        <div class="card ins-you-card">
          <span class="eyebrow">For operators</span>
          <h3 class="h3">See where your rate sits.</h3>
          <p class="body">${pos && pos.rate
            ? `Your rate of <b>${hr(pos.rate)}/hr</b> sits at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}, where the median is ${hr(pos.idx.p50)}/hr.`
            : 'Compare your hourly rate with the Rate Index for your role category, and see which focus areas clients searched for this week.'}</p>
          <a class="btn btn-line" href="#studio.positioning">Open Positioning in Studio${icon('arrow')}</a>
        </div>
      </div>
    </section>

    <section class="wrap">
      <div class="panel-night ins-news">
        <div>
          <span class="eyebrow">The Fractional GTM Pulse</span>
          <h2 class="h3 ins-news-h">One email every Monday. <span class="serif">Rates, demand and what clients searched for.</span></h2>
        </div>
        ${newsSlot('hub')}
      </div>
    </section>
    </div>`;
  }
  function ordinal(n) { n = Math.round(n); const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  RN.view('insights', {
    route: 'insights', nav: 'insights',
    title: () => 'Insights',
    render: hub,
    mount: (root) => lifecycle(root),
    unmount,
  });

  /* =====================================================================
     2. THE STATE OF FRACTIONAL GTM 2027 (#report)
     ===================================================================== */
  const rep = { rev: undefined, cat: undefined, hours: '40' };
  function repDefaults() {
    if (rep.rev === undefined) { const co = personaCo(); rep.rev = co ? co.revenueRange : ''; }
    if (rep.cat === undefined) { const me = opMe(); rep.cat = me ? me.catKey : 'sales_leadership'; }
  }
  const CHAPTERS = [
    { id: 'ins-sum', n: 'Summary', t: 'Summary' },
    { id: 'ins-ch1', n: '1', t: 'Who is hiring' },
    { id: 'ins-ch2', n: '2', t: 'What it costs' },
    { id: 'ins-ch3', n: '3', t: 'How it is scoped' },
    { id: 'ins-ch4', n: '4', t: 'Roles in demand' },
    { id: 'ins-ch5', n: '5', t: 'Who gets rehired' },
    { id: 'ins-ch6', n: '6', t: 'The operator side' },
    { id: 'ins-method', n: '', t: 'Method and citation' },
  ];

  DRAW.triggers = (w) => bars(REP().triggers.map((r, i) => ({ label: r.l, value: r.v, hi: i === 0 })), { fmt: (n) => n + '%', max: 40, label: 'Primary trigger for hiring a fractional leader' }, w);
  DRAW.demand = (w) => {
    const di = REP().demandIndex;
    return cols(di.map((d) => ({ label: d.l, value: d.v, hi: !/proj/i.test(d.l) })), { fmt: (n) => RN.fmt.int(n), label: 'Fractional GTM demand index, 2023 = 100' }, w);
  };
  DRAW.rateCat = (w) => {
    const m = ins.mult(rep.rev);
    const rows = REP().rateByCat.map((r) => ({ label: catLabel(r.cat), value: Math.round(r.v * m), hi: r.cat === rep.cat })).sort((a, b) => b.value - a.value);
    return bars(rows, { fmt: (n) => '$' + n, max: 400, label: 'Median hourly rate by role category' }, w);
  };
  DRAW.rateRev = (w) => {
    const rows = REP().rateByRevenue.map((r) => ({ label: revLabel(r.range), value: r.v, hi: r.range === rep.rev }));
    return cols(rows, { fmt: (n) => '$' + n, label: 'Median hourly rate by company revenue range' }, w);
  };
  DRAW.hours = (w) => bars(ins.hoursRows().map((r) => ({ label: hoursLabel(r.code), value: r.v, hi: r.code === rep.hours })), { fmt: (n) => n + '%', max: 35, label: 'Share of engagements by hours per month' }, w);
  DRAW.term = (w) => cols(REP().term.map((r, i) => ({ label: RN.w.label('term', TERM[i]) || r.l, value: r.v, hi: i === 1 })), { fmt: (n) => n + '%', label: 'Share of engagements by initial term' }, w);
  DRAW.intent = (w) => bars(REP().intent.map((r) => ({ label: catLabel(r.cat), value: r.v, hi: r.cat === 'revenue_operations' })), { fmt: (n) => n + '%', max: 40, label: 'Hiring intent by role category, next 12 months' }, w);
  DRAW.sources = (w) => bars(REP().sources.map((r) => ({ label: r.l, value: r.v, hi: /Marketplace/.test(r.l) })), { fmt: (n) => n + '%', max: 50, label: 'Where the last engagement came from' }, w);
  DRAW.concurrent = (w) => cols(REP().concurrent.map((r, i) => ({ label: r.l, value: r.v, hi: i === 1 })), { fmt: (n) => n + '%', label: 'Concurrent clients per operator', h: w < 460 ? 250 : 220 }, w);

  function chapterHead(ch, eyebrow, title, lede) {
    return `<header class="ins-ch-hd"><span class="eyebrow">${esc(eyebrow)}</span><h2 class="h2">${title}</h2>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</header>`;
  }
  function figure(o) {
    return `<figure class="card ins-fig ${o.cls || ''}">
      <figcaption class="ins-fig-hd"><div><h3>${esc(o.title)}</h3>${o.sub ? `<p class="sub">${esc(o.sub)}</p>` : ''}</div>${illus()}</figcaption>
      ${o.controls || ''}
      ${o.chart ? `<div class="ins-chart" data-ins-chart="${esc(o.chart)}"></div>` : ''}
      ${o.body || ''}
      ${o.take ? `<p class="ins-take">${o.take}</p>` : ''}
    </figure>`;
  }
  function chLink(o) {
    return `<div class="ins-chlink">
      <div class="ins-chlink-t"><span class="label">${esc(o.label || 'From research to shortlist')}</span><p>${o.text}</p></div>
      <div class="row ins-chlink-a">${o.secondary || ''}${o.primary}</div>
    </div>`;
  }
  function ch2Link() {
    const f = { roleCategories: [rep.cat], revenueRange: rep.rev ? [rep.rev] : [] };
    return browseBtn('See operators', f, 'report_ch2', 'btn', 'data-ins-ch2-go');
  }
  function catSelect(value, change) {
    return `<select class="select ins-inline-select" aria-label="${esc(F.roleCategory.label)}" data-change="${esc(change)}">${F.roleCategory.options.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  }
  const ch2RevText = () => (rep.rev ? `for ${revLabel(rep.rev)} companies` : 'for companies of any size');
  const ch2Adj = () => (rep.rev ? `Adjusted for ${revLabel(rep.rev)} companies with the Rate Index multiplier (×${ins.mult(rep.rev).toFixed(2)}).` : 'All company sizes. Pick a revenue range to adjust with the Rate Index multiplier.');

  function report() {
    repDefaults();
    const R = REP();
    const sum = summaryStats();
    const me = opMe();
    const pos = me ? RN.model.positioning(me.id) : null;
    const co = personaCo();
    const byRev = R.rateByRevenue;
    const lo = byRev[0], hi = byRev[byRev.length - 1];
    const stagePremium = pctChange(hi.v, lo.v);
    const mk = RN.model.market();
    const net = RN.model.ops.filter((o) => !o.hidden);
    const netN = net.length || 1;
    const dsMax = Math.max(...R.intent.map((r) => Math.max(r.v, ((mk.catSupply[r.cat] || 0) / netN) * 100)), 1);
    const outcomes = R.outcomes;
    const fvf = R.fracVsFull;
    const citation = `Revenue Nomad. (2027). The State of Fractional GTM 2027 [Illustrative prototype edition]. Survey of ${R.sample.operators} fractional GTM operators and ${R.sample.companies} hiring companies, fieldwork ${R.fieldwork}. https://www.revenuenomad.com/research/state-of-fractional-gtm-2027`;

    return `<article class="ins-report">
    <header class="night ins-cover">
      <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
      <div class="wrap ins-cover-in">
        <span class="eyebrow">Revenue Nomad Research</span>
        <div class="ins-yr" aria-hidden="true">${esc(R.year)}</div>
        <h1 class="ins-cover-h">${esc(R.title)} <span class="sr-only">${esc(R.year)}</span></h1>
        <p class="ins-cover-lede">${esc(R.lede)}</p>
        <div class="row ins-cover-cta">
          <button type="button" class="btn btn-leaf btn-lg" data-act="ins-jump" data-to="ins-sum">Read the summary${icon('arrow')}</button>
          <button type="button" class="btn btn-line btn-lg" data-act="ins-jump" data-to="ins-cite">${icon('quote')}Cite this report</button>
        </div>
        <dl class="ins-meta">
          <div><dt>Operators surveyed</dt><dd>${RN.fmt.int(R.sample.operators)}</dd></div>
          <div><dt>Hiring companies surveyed</dt><dd>${RN.fmt.int(R.sample.companies)}</dd></div>
          <div><dt>Profiles analyzed</dt><dd>${esc(R.sample.profiles)}</dd></div>
          <div><dt>Fieldwork</dt><dd>${esc(R.fieldwork)}</dd></div>
        </dl>
        <p class="ins-cover-note">${icon('info')}<span>Prototype edition with illustrative data. Every figure is invented to show shape and value. Do not cite the numbers.</span></p>
      </div>
    </header>

    <nav class="ins-chapnav" aria-label="Report chapters">
      <div class="wrap ins-chapnav-in">
        ${CHAPTERS.map((c, i) => `<button type="button" class="ins-chap ${i === 0 ? 'on' : ''}" data-act="ins-jump" data-to="${c.id}" data-chap="${c.id}">${c.n && c.n !== 'Summary' ? `<span class="num">${esc(c.n)}</span>` : ''}${esc(c.t)}</button>`).join('')}
      </div>
      <span class="ins-prog" aria-hidden="true"><i></i></span>
    </nav>

    <section class="wrap-narrow ins-ch" id="ins-sum">
      ${chapterHead('sum', 'Executive summary', 'Fractional stopped being a stopgap. <span class="serif">It became a hiring strategy.</span>', 'Six findings that matter if you are deciding whether to hire a fractional leader, or deciding what to charge as one.')}
      <div class="stats-row ins-sumstats" style="--cols:3">
        ${sum.map((s) => `<button type="button" class="stat ins-sumstat" data-act="ins-jump" data-to="${s.to}"><span class="stat-v">${esc(s.v)}</span><span class="stat-l">${esc(s.l)}</span><span class="ins-sumgo">See the chart${icon('arrow')}</span></button>`).join('')}
      </div>
    </section>

    <section class="wrap-narrow ins-ch" id="ins-ch1">
      ${chapterHead('1', 'Chapter 1', 'Who is hiring, <span class="serif">and what triggered it</span>')}
      ${figure({ title: 'Why companies bring in a fractional leader', sub: 'Share of hiring companies, primary trigger', chart: 'triggers', take: 'The biggest trigger is not a crisis. It is a founder deciding <em>they should no longer be the sales leader.</em>' })}
      ${figure({ title: 'Growth in fractional GTM demand', sub: 'Indexed, 2023 = 100. Job post scan plus stated hiring intent', chart: 'demand',
        body: `<div class="ins-est-legend tiny ins-fig-legend"><span><i class="m sq"></i>Measured</span><span><i class="b sq"></i>2027 projection</span><span>Up ${pctChange(R.demandIndex[3].v, R.demandIndex[2].v)}% in 2026, ${(R.demandIndex[3].v / 100).toFixed(1)}x the 2023 level</span></div>` })}
      ${chLink({ text: 'The most common trigger is the first sales leadership hire. Start with operators who have built that seat before.', primary: browseBtn('Browse Sales Leadership', { roleCategories: ['sales_leadership'] }, 'report_ch1'), secondary: `<a class="btn btn-line" href="#blueprints">See Blueprints</a>` })}
    </section>

    <section class="wrap-narrow ins-ch" id="ins-ch2">
      ${chapterHead('2', 'Chapter 2', 'What it costs', 'The question every hiring company asks first and every operator asks quietly.')}
      ${figure({ title: 'Median hourly rate by role category', sub: 'Operator reported, blended across company sizes',
        controls: `<div class="ins-ctl"><span class="label">${esc(F.companyRevenue.label)}</span><div data-deselect>${RN.w.control('companyRevenue', rep.rev || '', { name: 'ins-rep-rev', id: 'ins-rep-rev', change: 'ins-rep-rev' })}</div><p class="tiny muted" data-ins-adj>${esc(ch2Adj())}</p></div>`,
        chart: 'rateCat',
        body: pos && pos.rate ? `<p class="note info ins-you-note">${icon('user')}<span>Your rate of <b>${hr(pos.rate)}/hr</b> sits at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}. <a href="#studio.positioning">See your positioning in Studio</a></span></p>`
          : co ? `<p class="note info ins-you-note" data-ins-co-note ${rep.rev === co.revenueRange ? '' : 'hidden'}>${icon('building')}<span>Filtered to ${esc(co.name)}’s revenue range. Tap it again to see all company sizes.</span></p>` : '' })}
      ${figure({ title: 'Median hourly rate by company revenue range', sub: 'Same role mix. Larger companies pay more and scope more hours', chart: 'rateRev',
        take: `Companies at ${esc(revLabel(hi.range))} pay ${stagePremium}% more per hour than companies ${esc(revLabel(lo.range).replace(/^Under/, 'under'))} for the same role. <em>Stage, not title, sets the rate.</em>` })}
      ${figure({ title: 'Fractional vs full time, all-in monthly cost', sub: 'Illustrative comparison for a VP of Sales',
        body: `<div class="tbl-wrap"><table class="tbl ins-tbl ins-tbl-stack"><thead><tr><th>Option</th><th class="r">Monthly cost</th><th>Time to start</th><th>Exit cost</th></tr></thead>
          <tbody>${fvf.map((r, i) => `<tr class="${i === 0 ? 'ins-tr-hi' : ''}"><td class="ins-td-h">${esc(r[0])}</td><td class="r num" data-l="Monthly cost"><b>${esc(r[1])}</b></td><td data-l="Time to start">${esc(r[2])}</td><td data-l="Exit cost">${esc(r[3])}</td></tr>`).join('')}</tbody></table></div>
          <p class="ins-fig-more"><a class="act" href="#rates">${icon('sliders')}Run the numbers for your company in the Rate Index</a></p>` })}
      ${chLink({ text: `Browse ${catSelect(rep.cat, 'ins-rep-cat')} operators <span data-ins-ch2-rev>${esc(ch2RevText())}</span>.`, primary: ch2Link() })}
    </section>

    <section class="night ins-band ins-ch" id="ins-ch3">
      <div class="wrap-narrow">
        ${chapterHead('3', 'Chapter 3', 'How engagements <span class="serif">are scoped</span>')}
        ${figure({ title: 'Hours per month', sub: 'Share of engagements, cut by the Available time field operators fill in', chart: 'hours', cls: 'ins-fig-night',
          controls: `<div class="ins-ctl"><span class="label">Highlight a shape</span>${RN.w.control('hoursPerMonth', rep.hours, { name: 'ins-rep-hours', id: 'ins-rep-hours', change: 'ins-rep-hours' })}</div>`,
          take: `${esc(String(summaryStats()[1].v))} of engagements are scoped under 40 hours a month. <em>Most clients buy a senior leader in slices.</em>` })}
        <div class="ins-two">
          ${figure({ title: 'Initial term length', sub: 'Share of engagements, by the Initial term field', chart: 'term', cls: 'ins-fig-night' })}
          ${figure({ title: 'How the first term ends', sub: 'Share of engagements', cls: 'ins-fig-night',
            body: `<ul class="ins-outcomes">${outcomes.map((o) => `<li><span class="ins-outcome-v">${esc(o.v)}</span><span>${esc(o.l)}</span></li>`).join('')}</ul>` })}
        </div>
        ${chLink({ label: 'Find this shape', text: `Browse operators with at least <b data-ins-ch3-h>${esc(hoursLabel(rep.hours))}</b> available.`, primary: browseBtn('See operators', { hoursPerMonth: [rep.hours] }, 'report_ch3', 'btn btn-leaf', 'data-ins-ch3-go') })}
      </div>
    </section>

    <section class="wrap-narrow ins-ch" id="ins-ch4">
      ${chapterHead('4', 'Chapter 4', 'Which roles <span class="serif">are in demand</span>')}
      ${figure({ title: 'Hiring intent by role category, next 12 months', sub: 'Share of hiring companies. Sellers were not part of this question', chart: 'intent',
        take: 'Sales leadership still leads, but Revenue Operations is the fastest riser. Companies are hiring <em>the systems person before the second sales leader.</em>' })}
      ${figure({ title: 'Demand vs supply on Revenue Nomad', sub: `Hiring intent next to the share of the ${RN.fmt.int(netN)} operators in this prototype’s network sample (live export)`,
        body: `<div class="tbl-wrap"><table class="tbl ins-tbl ins-ds"><thead><tr><th>${esc(F.roleCategory.label)}</th><th>Hiring intent</th><th>Share of operators</th><th><span class="sr-only">Browse</span></th></tr></thead><tbody>
          ${R.intent.map((r) => { const s = (mk.catSupply[r.cat] || 0) / netN * 100; const gap = r.v - s >= 4; return `<tr>
            <td><div class="ins-ds-name"><span class="row-nw" style="--gap:8px">${RN.ui.catDot(r.cat)}${esc(catLabel(r.cat))}</span>${gap ? '<span class="pill pill-gold ins-gap">Undersupplied</span>' : ''}</div></td>
            <td><span class="ins-cellbar"><span class="meter"><i style="width:${Math.min(100, (r.v / dsMax) * 100).toFixed(1)}%"></i></span><b class="num">${r.v}%</b></span></td>
            <td><span class="ins-cellbar"><span class="meter ins-meter-mu"><i style="width:${Math.min(100, (s / dsMax) * 100).toFixed(1)}%"></i></span><span class="num">${Math.round(s)}%</span></span></td>
            <td class="r"><button type="button" class="act" data-act="ins-browse" data-src="report_ch4_table" data-f="${jsonAttr({ roleCategories: [r.cat] })}" aria-label="Browse ${esc(catLabel(r.cat))} operators"><span class="ins-hide-s">Browse</span>${icon('chev-right')}</button></td></tr>`; }).join('')}
          </tbody></table></div>` })}
      <blockquote class="ins-quote"><span class="ins-quote-ic" aria-hidden="true">${icon('quote')}</span><p>“${esc(R.quote.text)}”</p><cite>${esc(R.quote.by)}</cite></blockquote>
      ${chLink({ text: 'Revenue Operations has the biggest gap between what companies plan to hire and who is on the network.', primary: browseBtn('Browse Revenue Operations', { roleCategories: ['revenue_operations'] }, 'report_ch4'), secondary: `<a class="btn btn-line" href="#library">Open the Fit Tag Library</a>` })}
    </section>

    <section class="wrap-narrow ins-ch" id="ins-ch5">
      ${chapterHead('5', 'Chapter 5', 'What separates the operators <span class="serif">who get rehired</span>')}
      <div class="stats-row" style="--cols:3">
        <div class="stat"><span class="stat-v">2.4x</span><span class="stat-l">Rehire rate with 3+ verified client reviews</span></div>
        <div class="stat"><span class="stat-v">81%</span><span class="stat-l">Of hiring companies rank stage fit above title</span></div>
        <div class="stat"><span class="stat-v">3 of 4</span><span class="stat-l">Top-rated operators had solved the same problem at the same stage before</span></div>
      </div>
      ${figure({ title: 'What hiring companies say mattered most in hindsight', sub: 'Share of hiring companies',
        body: `<div class="tbl-wrap"><table class="tbl ins-tbl"><thead><tr><th>Factor</th><th class="r">Ranked first</th><th class="r">In top three</th></tr></thead><tbody>
          ${R.hindsight.map((r) => `<tr><td>${esc(r[0])}</td><td class="r num">${esc(r[1])}</td><td class="r num"><b>${esc(r[2])}</b></td></tr>`).join('')}</tbody></table></div>`,
        take: 'Big logos ranked last. <em>Fit and proof beat fame.</em>' })}
      ${chLink({ text: 'Proof is what the Reputation Index measures: client reviews, verified focus areas and repeat engagements.', primary: browseBtn('Browse Reputation Index 70+', { risMin: '70' }, 'report_ch5'), secondary: `<a class="btn btn-line" href="#levels">How the score works</a>` })}
    </section>

    <section class="wrap-narrow ins-ch" id="ins-ch6">
      ${chapterHead('6', 'Chapter 6', 'The operator side', 'How fractional leaders find work, and how full their plate is.')}
      <div class="ins-two">
        ${figure({ title: 'Where the last engagement came from', sub: 'Operators', chart: 'sources' })}
        ${figure({ title: 'Concurrent clients', sub: 'Operators, today', chart: 'concurrent' })}
      </div>
      <p class="ins-take ins-take-solo">Two thirds of work still comes through personal networks. <em>The market is large, fragmented and hard to see into,</em> which is why rate and demand data has been guesswork until now.</p>
      ${chLink({ text: 'Operators get found here even without a referral: open profiles, verified proof and a Studio that shows who viewed you and why.', primary: browseBtn('Browse available now', { availability: ['available_now'] }, 'report_ch6'), secondary: `<a class="btn btn-line" href="#operators">For operators</a>` })}
    </section>

    <section class="wrap-narrow ins-ch ins-method" id="ins-method">
      ${chapterHead('m', 'Methodology', 'How this was built')}
      <div class="prose">${R.methodology.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="card-flat ins-fields">
        <span class="label">Every cut uses the platform’s own fields</span>
        <ul>${['roleCategory', 'companyRevenue', 'companyEmployees', 'hoursPerMonth', 'term', 'industry'].map((k) => `<li><b>${esc(RN.w.def(k).label)}</b><span>${RN.w.def(k).options ? esc(RN.w.def(k).options.length + ' options, the same as operator signup') : ''}</span></li>`).join('')}</ul>
      </div>
      <div class="ins-cite" id="ins-cite">
        <span class="label">Cite this report</span>
        <p class="ins-cite-t" id="ins-cite-text">${esc(citation)}</p>
        <div class="row">
          <button type="button" class="btn btn-sm" data-act="ins-copy" data-what="citation" data-target="ins-cite-text">${icon('copy')}Copy citation</button>
          <button type="button" class="btn btn-line btn-sm" data-act="ins-copy" data-what="link">${icon('link')}Copy link</button>
        </div>
        <p class="tiny muted">Data may be cited with attribution to “Revenue Nomad, The State of Fractional GTM 2027”.</p>
      </div>
    </section>

    <section class="wrap-narrow ins-end">
      <div class="panel-night ins-news">
        <div>
          <span class="eyebrow">Get the next edition</span>
          <h2 class="h3 ins-news-h">Get the next edition first, <span class="serif">and the weekly Pulse by email.</span></h2>
        </div>
        ${newsSlot('report')}
      </div>
      <div class="ins-end-row">
        <p class="body">See who is available now. Every profile is open, no login required.</p>
        ${browseBtn('Browse operators', {}, 'report_end', 'btn btn-line')}
      </div>
    </section>
    </article>`;
  }

  /* Chapter controls */
  RN.inputs['ins-rep-rev'] = (el) => {
    rep.rev = el.value || '';
    redraw('rateCat'); redraw('rateRev');
    const adj = RN.$('[data-ins-adj]'); if (adj) adj.textContent = ch2Adj();
    const t = RN.$('[data-ins-ch2-rev]'); if (t) t.textContent = ch2RevText();
    const go = RN.$('[data-ins-ch2-go]'); if (go) go.outerHTML = ch2Link();
    const note = RN.$('[data-ins-co-note]'); const co = personaCo(); if (note) note.hidden = !(co && rep.rev === co.revenueRange);
  };
  RN.inputs['ins-rep-cat'] = (el) => {
    rep.cat = el.value;
    redraw('rateCat');
    const go = RN.$('[data-ins-ch2-go]'); if (go) go.outerHTML = ch2Link();
  };
  RN.inputs['ins-rep-hours'] = (el) => {
    rep.hours = el.value || '40';
    redraw('hours');
    const t = RN.$('[data-ins-ch3-h]'); if (t) t.textContent = hoursLabel(rep.hours);
    const go = RN.$('[data-ins-ch3-go]'); if (go) go.outerHTML = browseBtn('See operators', { hoursPerMonth: [rep.hours] }, 'report_ch3', 'btn btn-leaf', 'data-ins-ch3-go');
  };
  RN.actions['ins-copy'] = (el) => {
    if (el.dataset.what === 'link') {
      copyText(location.href.split('#')[0] + '#report');
      RN.ui.toast('Link to the report copied');
      RN.track('research_share', { source: 'report', meta: { kind: 'link' } });
      return;
    }
    const t = document.getElementById(el.dataset.target);
    copyText(t ? t.textContent.trim() : '');
    RN.ui.toast('Citation copied');
    RN.track('research_share', { source: 'report', meta: { kind: 'citation' } });
  };

  /* Sticky chapter nav: active chapter and reading progress */
  function reportScroll(root) {
    let raf = 0;
    const nav = RN.$('.ins-chapnav', root);
    const bar = RN.$('.ins-prog i', root);
    const links = RN.$$('.ins-chap', root);
    let active = '';
    const update = () => {
      raf = 0;
      if (!nav || !document.body.contains(nav)) return;
      const off = (document.getElementById('hdr') || { offsetHeight: 0 }).offsetHeight + nav.offsetHeight + 40;
      let cur = CHAPTERS[0].id;
      CHAPTERS.forEach((c) => { const s = document.getElementById(c.id); if (s && s.getBoundingClientRect().top - off <= 0) cur = c.id; });
      const art = RN.$('.ins-report', root);
      const max = art ? art.offsetHeight - window.innerHeight : document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = `scaleX(${RN.clamp(window.scrollY / Math.max(1, max), 0, 1).toFixed(4)})`;
      if (cur !== active) {
        active = cur;
        links.forEach((l) => { const on = l.dataset.chap === cur; l.classList.toggle('on', on); if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
        const on = links.find((l) => l.dataset.chap === cur);
        const sc = RN.$('.ins-chapnav-in', root);
        if (on && sc && sc.scrollWidth > sc.clientWidth) {
          const l = on.offsetLeft, r = l + on.offsetWidth;
          if (l < sc.scrollLeft + 16 || r > sc.scrollLeft + sc.clientWidth - 16) sc.scrollTo({ left: Math.max(0, l - 24), behavior: 'smooth' });
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    let jt = null;
    if (pendingJump) { const id = pendingJump; pendingJump = null; jt = setTimeout(() => jump(id, false), 80); }
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); clearTimeout(jt); };
  }

  RN.view('report', {
    route: 'report', nav: 'insights', chrome: 'over',
    title: () => 'The State of Fractional GTM 2027',
    render: report,
    mount: (root) => lifecycle(root, reportScroll),
    unmount,
  });

  /* =====================================================================
     3. RATE INDEX (#rates)
     ===================================================================== */
  const est = { cat: undefined, rev: undefined, hours: undefined };
  const calc = { base: 220000, benefits: 25, fee: 25, months: 4 };
  let idxRev = undefined;
  function estDefaults() {
    const me = opMe(), co = personaCo();
    if (est.cat === undefined) est.cat = me ? me.catKey : 'sales_leadership';
    if (est.rev === undefined) est.rev = co ? co.revenueRange : me && me.revenueRanges[0] ? me.revenueRanges[0] : '5m_20m';
    if (est.hours === undefined) est.hours = me && me.avail.hoursCode ? me.avail.hoursCode : '40';
    if (idxRev === undefined) idxRev = co ? co.revenueRange : '';
  }

  function rangeBar(p25, p50, p75, max, o) {
    o = o || {};
    const pc = (v) => RN.clamp((v / max) * 100, 0, 100).toFixed(2);
    return `<div class="ins-rtrack ${o.cls || ''}" title="p25 ${hr(p25)} · median ${hr(p50)} · p75 ${hr(p75)} per hour">
      <span class="ins-rband" style="left:${pc(p25)}%;width:${(pc(p75) - pc(p25)).toFixed(2)}%"></span>
      <span class="ins-rmed" style="left:${pc(p50)}%"></span>
      ${o.labels ? `<span class="ins-rlab lo" style="left:${pc(p25)}%">${hr(p25)}</span><span class="ins-rlab mid" style="left:${pc(p50)}%">${hr(p50)}</span><span class="ins-rlab hi" style="left:${pc(p75)}%">${hr(p75)}</span>` : ''}
    </div>`;
  }

  /* Browse hand-off for the estimate: role, company revenue and a rate ceiling at the p75.
     Counts use the same rule Browse applies (a rate ceiling keeps only operators who publish a rate),
     and relax step by step so the button never lands on an empty page. */
  function browseCount(f) {
    let res = RN.model.search({ filters: f });
    if (f.rateMax) res = res.filter((x) => x.op.rate);
    return res.length;
  }
  function estHandoff(r) {
    const cat = catLabel(est.cat);
    const steps = [
      { f: { roleCategories: [est.cat], revenueRange: [est.rev], rateMax: Math.min(F.rateMax.max, Math.ceil(r.p75 / 5) * 5) }, l: (n) => `See ${RN.fmt.plural(n, 'operator')} in this range` },
      { f: { roleCategories: [est.cat], revenueRange: [est.rev] }, l: (n) => `See ${n} ${cat} ${n === 1 ? 'operator' : 'operators'}` },
      { f: { roleCategories: [est.cat] }, l: () => `Browse ${cat}` },
    ];
    for (const s of steps) { const n = browseCount(s.f); if (n) return { f: s.f, label: s.l(n), n }; }
    return { f: steps[2].f, label: steps[2].l(0), n: 0 };
  }
  function estOut() {
    const g = ins.range(est.cat, est.rev, est.hours);
    const r = g.r;
    const low = sampleNote(r.n);
    const hand = estHandoff(r);
    return `<span class="label">Typical Engagement Range</span>
      <div class="ins-est-big num">${esc(ins.fmtRange(g.lo, g.hi))}</div>
      <p class="ins-est-mid">Median <b>${usd(r500(g.mid))}/mo</b> · ${esc(String(est.hours) === '19' ? 'about 15 hrs' : g.h + ' hrs')} a month at ${hr(r.p50)}/hr</p>
      <div class="ins-est-scale">${rangeBar(r.p25, r.p50, r.p75, 450, { labels: true, cls: 'ins-rtrack-night' })}
        <div class="ins-est-legend tiny"><span><i class="b"></i>Middle 50% of rates (p25 to p75)</span><span><i class="m"></i>Median</span></div></div>
      <div class="ins-est-sizes"><span class="label">Same role and hours, by company revenue</span>
        <ul>${F.companyRevenue.options.map((o) => { const x = ins.range(est.cat, o.v, est.hours); const maxX = ins.range(est.cat, '50m_plus', est.hours).mid; return `<li class="${o.v === est.rev ? 'on' : ''}"><button type="button" data-act="ins-est-size" data-v="${esc(o.v)}"><span>${esc(o.l)}</span><span class="ins-est-sbar"><i style="width:${((x.mid / maxX) * 100).toFixed(1)}%"></i></span><b class="num">${usd(r500(x.mid))}</b></button></li>`; }).join('')}</ul></div>
      <p class="ins-est-term">Most first terms run ${esc(RN.w.label('term', '3_6').toLowerCase())} (${REP().term[1].v}% of engagements). At the median that is <b>${usd(r500(g.mid * 3))} to ${usd(r500(g.mid * 6))}</b> for the first term.</p>
      <p class="ins-est-basis small">Based on ${RN.fmt.int(r.n)} ${esc(catLabel(est.cat))} rates, adjusted for ${esc(revLabel(est.rev))} companies (×${r.m.toFixed(2)}).${low ? ` <span class="ins-low">${icon('info')}${esc(low)}</span>` : ''}</p>
      <div class="row ins-est-cta">
        <button type="button" class="btn btn-leaf" data-act="ins-browse" data-src="rates_estimator" data-f="${jsonAttr(hand.f)}">${esc(hand.label)}${icon('arrow')}</button>
        <button type="button" class="btn btn-line" data-act="ins-jump" data-to="ins-calc">Compare with full time</button>
      </div>`;
  }

  function idxRows() {
    const ri = RI();
    const m = ins.mult(idxRev);
    const max = 450;
    const rows = F.roleCategory.options.map((o) => ({ k: o.v, l: o.l, v: ri.byCat[o.v] })).filter((r) => r.v).sort((a, b) => b.v.p50 - a.v.p50);
    return `<div class="ins-raxis" aria-hidden="true"><span></span><div class="ins-raxis-t">${[0, 100, 200, 300, 400].map((t) => `<span style="left:${(t / max) * 100}%">$${t}</span>`).join('')}</div><span></span><span></span></div>
      ${rows.map((r) => {
        const p25 = r.v.p25 * m, p50 = r.v.p50 * m, p75 = r.v.p75 * m;
        const low = r.v.n < MIN_CELL;
        return `<div class="ins-rrow">
          <div class="ins-rrow-l">${RN.ui.catDot(r.k)}<span><b>${esc(r.l)}</b><span class="tiny muted">n=${r.v.n}${low ? ' · directional' : ''}</span></span></div>
          <div class="ins-rrow-bar">${rangeBar(p25, p50, p75, max)}</div>
          <div class="ins-rrow-v"><b class="num">${hr(p50)}</b><span class="tiny muted">${hr(p25)} to ${hr(p75)}</span></div>
          <button type="button" class="act ins-rrow-go" data-act="ins-browse" data-src="rates_index" data-f="${jsonAttr({ roleCategories: [r.k], revenueRange: idxRev ? [idxRev] : [] })}" aria-label="Browse ${esc(r.l)} operators"><span class="ins-hide-s">Browse</span>${icon('chev-right')}</button>
        </div>`;
      }).join('')}`;
  }
  const idxCaption = () => (idxRev ? `Adjusted for ${revLabel(idxRev)} companies (×${ins.mult(idxRev).toFixed(2)} on the network median).` : 'Network-wide medians. Pick a company revenue range to adjust.');

  function calcNums() {
    const g = ins.range(est.cat, est.rev, est.hours);
    const base = Math.max(0, +calc.base || 0), b = Math.max(0, +calc.benefits || 0) / 100, fee = Math.max(0, +calc.fee || 0) / 100;
    const months = RN.clamp(+calc.months || 0, 0, 12);
    const ftBase = (base * (1 + b)) / 12;
    const ftFee = (base * fee) / 12;
    const ft = ftBase + ftFee;
    const frac = g.mid;
    const fracYear = frac * 11.5; // in the seat within 2 to 3 weeks
    const ftYear = base * fee + ftBase * Math.max(0, 12 - months);
    return { g, base, b, fee, months, ftBase, ftFee, ft, frac, fracYear, ftYear };
  }
  DRAW.calc = (w) => {
    const c = calcNums();
    return bars([
      { label: `Fractional, ${String(est.hours) === '19' ? 'under 20' : c.g.h} hrs / month`, value: Math.round(c.frac), hi: true },
      { label: 'Full-time hire, all in', value: Math.round(c.ft), muted: false },
    ], { fmt: (n) => RN.fmt.usdK(n), label: 'Monthly cost, fractional vs full time' }, w);
  };
  function calcOut() {
    const c = calcNums();
    const diff = c.ft - c.frac;
    const share = c.ft ? Math.round((c.frac / c.ft) * 100) : 0;
    return `<div class="ins-chart" data-ins-chart="calc"></div>
      <div class="ins-calc-sum">
        <p class="body">${diff >= 0 ? `A fractional leader costs <b>${usd(r500(diff))} less per month</b>, about ${share}% of a full-time hire.` : `At these inputs a fractional leader costs <b>${usd(r500(-diff))} more per month</b> than a full-time hire.`}</p>
        <div class="stats-row" style="--cols:2">
          <div class="stat"><span class="stat-l">Next 12 months, fractional</span><span class="stat-v">${RN.fmt.usdK(r500(c.fracYear))}</span><span class="tiny muted">In the seat within 2 to 3 weeks</span></div>
          <div class="stat"><span class="stat-l">Next 12 months, full time</span><span class="stat-v">${RN.fmt.usdK(r500(c.ftYear))}</span><span class="tiny muted">${c.months ? `Seat empty for ${RN.fmt.plural(c.months, 'month')} while you hire` : 'Starts right away'}</span></div>
        </div>
        <dl class="ins-calc-break small">
          <div><dt>Base plus benefits and taxes</dt><dd>${usd(r500(c.ftBase))}/mo</dd></div>
          <div><dt>Recruiting fee, spread over year one</dt><dd>${usd(r500(c.ftFee))}/mo</dd></div>
          <div><dt>Fractional median (from your estimate)</dt><dd>${usd(r500(c.frac))}/mo</dd></div>
        </dl>
        <p class="tiny muted">A fractional leader works ${String(est.hours) === '19' ? 'under 20' : c.g.h} hours a month. A full-time leader works about 170. Compare the outcomes you need, not the hours.</p>
      </div>`;
  }
  function calcInput(key, label, val, o) {
    return `<div class="field"><label for="ins-calc-${key}">${esc(label)}</label>
      <div class="input-affix">${o.pre ? `<span class="affix">${esc(o.pre)}</span>` : ''}<input class="input" id="ins-calc-${key}" name="${key}" type="number" inputmode="numeric" min="${o.min}" max="${o.max}" step="${o.step}" value="${esc(val)}" data-input="ins-calc">${o.unit ? `<span class="affix">${esc(o.unit)}</span>` : ''}</div>
      ${o.help ? `<p class="help">${esc(o.help)}</p>` : ''}</div>`;
  }

  function rates() {
    estDefaults();
    const ri = RI();
    const tr = ri.trend, last = tr[tr.length - 1], prev = tr[tr.length - 2], first = tr[0];
    const nTotal = Object.values(ri.byCat).reduce((a, x) => a + x.n, 0);
    const me = opMe();
    const pos = me ? RN.model.positioning(me.id) : null;
    const lowCats = Object.keys(ri.byCat).filter((k) => ri.byCat[k].n < MIN_CELL);
    const topCat = Object.keys(ri.byCat).map((k) => ({ k, v: ri.byCat[k] })).sort((a, b) => b.v.p50 - a.v.p50)[0];

    return `<div class="ins-rates">
    <header class="wrap phead ins-rates-hd">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#insights">Insights</a>${icon('chev-right')}<span>Rate Index</span></nav>
      <div class="ins-rates-top">
        <div>
          <span class="eyebrow">Rate Index · ${esc(last.l)} · Updated quarterly</span>
          <h1 class="h1">What fractional GTM leaders <span class="serif">charge by the hour.</span></h1>
          <p class="lede">Medians and ranges for every role category on Revenue Nomad, adjusted for company size. Price an engagement before you post it, or check where your own rate sits.</p>
        </div>
        ${illus()}
      </div>
      <div class="stats-row ins-rates-kpis" style="--cols:4">
        <div class="stat"><span class="stat-l">All-category median</span><span class="stat-v">${hr(last.v)}<small class="ins-unit">/hr</small></span><span class="row-nw" style="--gap:8px">${RN.ui.delta(last.v, prev.v)}<span class="tiny muted">vs ${esc(prev.l)}</span></span></div>
        <div class="stat"><span class="stat-l">Since ${esc(first.l)}</span><span class="stat-v">+${pctChange(last.v, first.v)}%</span><span class="tiny muted">${hr(first.v)} to ${hr(last.v)} an hour</span></div>
        <div class="stat"><span class="stat-l">Rates in the index</span><span class="stat-v">${RN.fmt.int(nTotal)}</span><span class="tiny muted">Across ${F.roleCategory.options.length} role categories</span></div>
        <div class="stat"><span class="stat-l">Highest median</span><span class="stat-v">${hr(topCat.v.p50)}<small class="ins-unit">/hr</small></span><span class="tiny muted">${esc(catLabel(topCat.k))}</span></div>
      </div>
    </header>

    <section class="wrap ins-est" id="ins-est">
      <div class="ins-est-in">
        <form class="ins-est-form stack" style="--gap:22px" data-submit="ins-est-noop" aria-label="Rate estimator">
          <div><span class="eyebrow">Estimator</span><h2 class="h3" style="margin-top:8px">What will this engagement cost?</h2></div>
          ${RN.w.field('roleCategory', est.cat, { name: 'ins-est-cat', id: 'ins-est-cat', change: 'ins-est', help: 'The discipline you need to lead the work.' })}
          ${RN.w.field('companyRevenue', est.rev, { name: 'ins-est-rev', id: 'ins-est-rev', change: 'ins-est' })}
          ${RN.w.field('hoursPerMonth', est.hours, { name: 'ins-est-hours', id: 'ins-est-hours', change: 'ins-est', label: 'Available time needed', help: 'Hours a month you want from the operator. Under 20 is counted as 15.' })}
        </form>
        <div class="ins-est-out night" id="ins-est-out" aria-live="polite">${estOut()}</div>
      </div>
    </section>

    <section class="wrap ins-idx" id="ins-idx">
      <div class="ins-sec-hd"><div><span class="eyebrow">The index</span><h2 class="h2">Hourly rates <span class="serif">by role category</span></h2></div></div>
      <div class="card ins-idx-card">
        <div class="ins-ctl"><span class="label">${esc(F.companyRevenue.label)}</span><div data-deselect>${RN.w.control('companyRevenue', idxRev || '', { name: 'ins-idx-rev', id: 'ins-idx-rev', change: 'ins-idx-rev' })}</div><p class="tiny muted" data-ins-idx-cap>${esc(idxCaption())}</p></div>
        <div class="ins-rrows" data-ins-idx>${idxRows()}</div>
        <div class="ins-idx-ft">
          <div class="ins-est-legend tiny"><span><i class="b"></i>Middle 50% of rates (p25 to p75)</span><span><i class="m"></i>Median</span></div>
          ${lowCats.length ? `<p class="tiny muted">${icon('info')} ${esc(lowCats.map(catLabel).join(', '))}: fewer than ${MIN_CELL} rates, read as directional.</p>` : ''}
        </div>
      </div>
    </section>

    <section class="wrap ins-rates-2">
      <div class="grid g-2">
        <figure class="card ins-fig">
          <figcaption class="ins-fig-hd"><div><h3>All-category median by quarter</h3><p class="sub">Hourly, every role category blended</p></div>${illus()}</figcaption>
          <div class="ins-chart" data-ins-chart="trend"></div>
          <div class="ins-qoq"><span class="label">Quarter over quarter</span>
            <ul>${tr.slice(1).map((t, i) => `<li><span>${esc(tr[i].l)} to ${esc(t.l)}</span>${RN.ui.delta(t.v, tr[i].v)}<b class="num">+${hr(t.v - tr[i].v)}</b></li>`).join('')}</ul></div>
        </figure>
        <div class="card ins-how">
          <h3 class="h4">How the Rate Index works</h3>
          <ul class="ins-how-list">
            <li><b>Sources.</b> Hourly rates operators list on their profiles, rates from client-verified engagements, and the State of Fractional GTM survey.</li>
            <li><b>Median and range.</b> The median is the middle rate. The range covers the middle half of rates, from the 25th to the 75th percentile.</li>
            <li><b>Company size.</b> Larger companies pay more for the same role. We adjust with one multiplier per revenue range.</li>
            <li><b>Sample size.</b> We show n for every category. Under ${MIN_CELL} rates, read the number as directional.</li>
          </ul>
          <div class="tbl-wrap"><table class="tbl ins-tbl ins-mult"><thead><tr><th>${esc(F.companyRevenue.label)}</th><th class="r">Multiplier</th></tr></thead><tbody>
            ${F.companyRevenue.options.map((o) => `<tr class="${o.v === '5m_20m' ? 'ins-tr-hi' : ''}"><td>${esc(o.l)}${o.v === '5m_20m' ? ' <span class="tiny muted">baseline</span>' : ''}</td><td class="r num">×${ins.mult(o.v).toFixed(2)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>
    </section>

    <section class="wrap ins-calc" id="ins-calc">
      <div class="ins-sec-hd"><div><span class="eyebrow">Calculator</span><h2 class="h2">Fractional or full time? <span class="serif">Compare the monthly cost.</span></h2></div></div>
      <div class="card ins-calc-card">
        <div class="ins-calc-in stack" style="--gap:18px">
          <p class="small muted ins-calc-uses">${icon('sliders')}<span>Fractional side uses your estimate: <b data-ins-calc-uses>${esc(catLabel(est.cat))}, ${esc(revLabel(est.rev))}, ${esc(hoursLabel(est.hours))}</b>. <button type="button" class="act" data-act="ins-jump" data-to="ins-est">Change</button></span></p>
          ${calcInput('base', 'Full-time base salary', calc.base, { pre: '$', min: 50000, max: 1000000, step: 5000, help: 'Base only. Add expected bonus if the role carries variable pay.' })}
          <div class="grid g-2" style="--gap:16px">
            ${calcInput('benefits', 'Benefits and payroll taxes', calc.benefits, { unit: '%', min: 0, max: 60, step: 1 })}
            ${calcInput('fee', 'Recruiting fee, % of base', calc.fee, { unit: '%', min: 0, max: 40, step: 1 })}
          </div>
          ${calcInput('months', 'Months to hire full time', calc.months, { unit: 'months', min: 0, max: 12, step: 1, help: 'The report median is 90 to 120 days for a VP of Sales.' })}
        </div>
        <div class="ins-calc-out" id="ins-calc-out" aria-live="polite">${calcOut()}</div>
      </div>
    </section>

    <section class="wrap">
      <div class="panel-night ins-opband ${pos && pos.rate ? 'has-bar' : ''}">
        <div>
          <span class="eyebrow">For operators</span>
          <h2 class="h3 ins-news-h">See where your rate sits.</h2>
          <p class="ins-opband-p">${pos && pos.rate
            ? `Your rate of <b>${hr(pos.rate)}/hr</b> is at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}. Studio shows how that compares with the operators clients shortlisted.`
            : 'Studio compares your rate with the Rate Index for your role category and shows which focus areas clients searched for. Your rate stays on your profile; the index only uses it in aggregate.'}</p>
        </div>
        ${pos && pos.rate ? `<div class="ins-opband-bar"><div class="ins-opband-track"><span class="ins-you-mark" style="left:${RN.clamp((pos.rate / 450) * 100, 0, 100).toFixed(1)}%">You ${hr(pos.rate)}</span>${rangeBar(pos.idx.p25, pos.idx.p50, pos.idx.p75, 450, { cls: 'ins-rtrack-night' })}</div>
          <p class="tiny ins-opband-cap">${esc(catLabel(pos.op.catKey))} median ${hr(pos.idx.p50)} · middle 50% ${hr(pos.idx.p25)} to ${hr(pos.idx.p75)} an hour</p></div>` : ''}
        <a class="btn btn-leaf" href="#studio.positioning">Open Positioning in Studio${icon('arrow')}</a>
      </div>
    </section>
    </div>`;
  }

  DRAW.trend = (w) => {
    const tr = RI().trend;
    return cols(tr.map((t, i) => ({ label: t.l, value: t.v, hi: i === tr.length - 1 })), { fmt: (n) => '$' + Math.round(n), label: 'Rate Index all-category median by quarter', h: w < 460 ? 200 : 230 }, w);
  };

  RN.submits['ins-est-noop'] = () => {};
  let estTrack = null;
  RN.inputs['ins-est'] = (el) => {
    const k = { 'ins-est-cat': 'cat', 'ins-est-rev': 'rev', 'ins-est-hours': 'hours' }[el.name];
    if (!k || !el.value) return;
    est[k] = el.value;
    const out = document.getElementById('ins-est-out'); if (out) out.innerHTML = estOut();
    const uses = RN.$('[data-ins-calc-uses]'); if (uses) uses.textContent = `${catLabel(est.cat)}, ${revLabel(est.rev)}, ${hoursLabel(est.hours)}`;
    const co = document.getElementById('ins-calc-out'); if (co) { co.innerHTML = calcOut(); drawAll(co); }
    clearTimeout(estTrack);
    estTrack = setTimeout(() => RN.track('rate_estimate', { filters: { roleCategories: [est.cat], revenueRange: [est.rev], hoursPerMonth: [est.hours] } }), 600);
  };
  // Pick a revenue range from the size list: keeps the chip control in sync
  RN.actions['ins-est-size'] = (el) => {
    const chip = document.querySelector(`#ins-est-rev [data-v="${el.dataset.v}"]`);
    if (chip) RN.actions['w-chip'](chip);
  };
  RN.inputs['ins-idx-rev'] = (el) => {
    idxRev = el.value || '';
    const box = RN.$('[data-ins-idx]'); if (box) box.innerHTML = idxRows();
    const cap = RN.$('[data-ins-idx-cap]'); if (cap) cap.textContent = idxCaption();
  };
  RN.inputs['ins-calc'] = (el) => {
    const v = el.value === '' ? '' : +el.value;
    calc[el.name] = v;
    const co = document.getElementById('ins-calc-out'); if (co) { co.innerHTML = calcOut(); drawAll(co); }
  };

  RN.view('rates', {
    route: 'rates', nav: 'insights',
    title: () => 'Rate Index',
    render: rates,
    mount: (root) => lifecycle(root),
    unmount,
  });
})();
