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
  /* Rate maths come from the model (RN.model.rateFor / monthlyRange), so the Rate Index, Blueprints,
     profiles and Home show the same numbers. monthlyRange rounds to $500 and counts "<20" as 15 hours. */
  ins.rate = (cat, rev) => RN.model.rateFor(cat, rev);
  ins.range = (cat, rev, hours) => RN.model.monthlyRange(cat, rev, hours);
  ins.mult = (rev) => RN.model.rateFor('sales_leadership', rev).m;
  const r500 = (n) => Math.round(n / 500) * 500;
  const usd = (n) => RN.fmt.usd(n);
  const hr = (n) => '$' + Math.round(n);
  // Monthly range format: "$7.5k - $11.5k/month"
  ins.fmtRange = (lo, hi) => RN.fmt.moRange(r500(lo), r500(hi));
  /* The Rate Index is the price: a client pays the operator's listed rate and no fees (founder
     decision D1, Sep 25, 2026). Nothing on these client-facing pages mentions a fee, margin or split. */
  const NO_FEES = 'No fees for companies. You pay the operator’s rate, nothing more.';
  ins.noFees = NO_FEES;
  const catLabel = (c) => F.catLabel(c);
  const revLabel = (v) => (RN.contrib && RN.contrib.revLabel ? RN.contrib.revLabel(v) : RN.w.label('companyRevenue', v));
  const hoursLabel = (v) => RN.w.label('hoursPerMonth', v);
  const pctChange = (a, b) => Math.round(((a - b) / b) * 100);
  const MIN_CELL = 20;
  const sampleNote = (n) => (n < MIN_CELL ? `Only ${n} rates in this category, below our minimum of ${MIN_CELL}. Read it as directional.` : '');
  const personaCo = () => (RN.store.state.persona === 'buyer' ? RN.personas.buyer.company : null);
  const opMe = () => (RN.store.state.persona === 'operator' ? RN.myOp() : null);
  const weekStart = () => { const d = RN.now(); const back = (d.getDay() + 6) % 7; const m = new Date(d.getTime() - back * 864e5); m.setHours(0, 0, 0, 0); return m; };
  // The Pulse is quarterly: the next issue lands on the first day of the next calendar quarter (Jan 1, Apr 1, Jul 1, Oct 1)
  const nextQuarter = () => { const d = RN.now(); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 1); };
  ins.nextIssue = nextQuarter;
  // One "Illustrative" label for every invented figure (RN.ui.illus)
  const illus = (text) => RN.ui.illus(text);
  const jsonAttr = (o) => esc(JSON.stringify(o || {}));
  // Network size, worded the same everywhere: "350+ operators (294 profiles)"
  const liveOps = () => RN.model.ops.filter((o) => !o.hidden);
  const netText = () => `${MK().network.operators} operators (${RN.fmt.int(liveOps().length)} profiles)`;
  // Rate Index as-of date (market.asOf, read as a local date)
  const asOfDate = () => { const p = String(MK().asOf || '').split('-').map(Number); return p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : RN.now(); };
  const longDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /* Contribute and share (RN.contrib, RN.share in js/core/contribute.js). Every piece below comes from that core:
     the CTAs switch to their thanks state on their own after a contribution (RN.contrib.refresh). */
  const CX = () => RN.contrib;
  const lowerFirst = (s) => String(s).replace(/^./, (c) => c.toLowerCase());
  const reportShare = (quote) => ({ title: `The State of Fractional GTM ${REP().year}`, route: 'report', kind: 'report', quote });
  // Small click-to-share pill for a figure (the same look as RN.share.quote's button). The label hides on narrow cells.
  function shareBtn(o, cls) {
    return `<button type="button" class="shr-q-btn ins-shr ${cls || ''}" data-act="shr-open" data-share="${jsonAttr(o)}" aria-label="${esc('Share: ' + String(o.quote || o.title).slice(0, 140))}">${icon('share')}<span>Share</span></button>`;
  }

  /* Browse hand-off: the same filter keys RN.model.search reads, so Browse needs no translation.
     Research never hands off a rate ceiling (rateMax): it would silently drop every operator who
     does not publish a rate. Hand-offs carry role category, and company revenue where Browse has it. */
  function cleanFilters(f) {
    const out = {};
    Object.keys(f || {}).forEach((k) => {
      const v = f[k];
      if (k === 'rateMax' || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    return out;
  }
  const SORTS = ['best', 'ris', 'available', 'rate'];
  ins.goBrowse = function (filters, source, q, tags, sort) {
    const f = cleanFilters(filters);
    const so = SORTS.includes(sort) ? sort : 'best';
    RN.store.update((s) => { s.browse = Object.assign({}, s.browse, { q: q || '', tags: tags || [], filters: f, sort: so }); }, 'browse');
    RN.track('research_cta', { source: source || 'insights', filters: f, q: q || '', tags: tags || [] });
    RN.go('browse');
  };
  RN.actions['ins-browse'] = (el) => {
    let f = {}, tags = [];
    try { f = JSON.parse(el.dataset.f || '{}'); } catch (e) { f = {}; }
    try { tags = el.dataset.tags ? JSON.parse(el.dataset.tags) : []; } catch (e) { tags = []; }
    ins.goBrowse(f, el.dataset.src, el.dataset.q, tags, el.dataset.sort);
  };
  function browseBtn(label, f, src, cls, extra) {
    return `<button type="button" class="${cls || 'btn'}" data-act="ins-browse" data-src="${esc(src)}" data-f="${jsonAttr(f)}" ${extra || ''}>${esc(label)}${icon('arrow')}</button>`;
  }

  /* Charts: drawn in mount() at the container's real pixel width so chart text stays at 12px. */
  function bars(rows, o, w) {
    o = o || {};
    const fmt = o.fmt || ((n) => RN.fmt.int(n));
    // Inline labels from 400px (half of the report's reading column); narrower charts stack the label above the bar
    if (w >= 400) {
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

  /* Clipboard. Call from inside the click handler so the browser sees a user gesture.
     navigator.clipboard.writeText first; if it is missing or refused (file://, permissions), select the
     visible text (el) so the reader can copy it by hand, or use a hidden textarea when there is none. */
  function copyText(text, el, okMsg) {
    const done = () => RN.ui.toast(esc(okMsg || 'Copied'));
    const fallback = () => {
      let ok = false;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        if (ok) done(); else RN.ui.toast('Text selected. Press Ctrl+C, or ⌘C on a Mac, to copy it.', { icon: 'info' });
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else RN.ui.toast(`Copy this link: ${esc(text)}`, { icon: 'info', ms: 6000 });
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* Scroll to a section below the fixed header and the sticky chapter nav */
  function jump(id, smooth) {
    const el = document.getElementById(id);
    if (!el) return;
    const nav = document.querySelector('.ins-chapnav');
    const hdr = document.getElementById('hdr');
    const off = (hdr && !hdr.hidden ? hdr.offsetHeight : 0) + (nav && !railMode() ? nav.offsetHeight : 0) + 16;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - off), behavior: smooth === false ? 'auto' : 'smooth' });
  }
  RN.actions['ins-jump'] = (el) => jump(el.dataset.to);
  let pendingJump = null;
  RN.actions['ins-report-ch'] = (el) => { pendingJump = el.dataset.ch; RN.go('report'); };

  /* ---------- Newsletter (hub and report end): the Fractional GTM Pulse, quarterly ---------- */
  const SUB_KEY = 'ins-pulse';
  function newsForm(src) {
    const st = RN.store.state;
    const sub = st.seen && st.seen[SUB_KEY];
    if (sub) {
      return `<div class="ins-news-done" data-ins-news>
        <p class="ins-news-ok">${icon('check-circle')}<span>Subscribed as <b>${esc(sub.email)}</b>. The next Pulse lands ${esc(RN.fmt.date(nextQuarter()))}.</span></p>
        <button type="button" class="act" data-act="ins-unsub">Unsubscribe</button>
      </div>`;
    }
    const me = RN.me && RN.me();
    const pre = me && me.email ? me.email : '';
    return `<form class="ins-news-form" data-submit="ins-subscribe" data-src="${esc(src)}" data-ins-news novalidate>
      <label class="sr-only" for="ins-news-${esc(src)}">${esc(F.email.label)}</label>
      ${RN.w.control('email', pre, { name: 'email', id: 'ins-news-' + src })}
      <button class="btn btn-leaf" type="submit">Get the quarterly Pulse</button>
    </form>
    <p class="ins-news-fine">One email a quarter. Unsubscribe in one click.</p>`;
  }
  RN.submits['ins-subscribe'] = (form, data) => {
    const email = String(data.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { RN.ui.toast('Enter a work email so we can send the Pulse.', { icon: 'info' }); form.querySelector('input[name=email]').focus(); return; }
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen[SUB_KEY] = { email, ts: RN.now().toISOString(), source: form.dataset.src }; }, 'seen');
    RN.track('newsletter_signup', { source: form.dataset.src, meta: { list: 'pulse' } });
    RN.mail(email, 'You are subscribed to the Fractional GTM Pulse', `Once a quarter: the Rate Index by role category, the Demand Index and new research.\n\nFirst issue: ${RN.fmt.date(nextQuarter())}.\nOne email a quarter. Unsubscribe from any issue in one click.`, 'newsletter');
    RN.ui.toast(`Subscribed. The next Pulse lands ${esc(RN.fmt.dateShort(nextQuarter()))}.`);
    RN.$$('[data-ins-news]').forEach((n) => { const box = n.closest('.ins-news-slot'); if (box) box.innerHTML = newsForm(box.dataset.src); });
  };
  RN.actions['ins-unsub'] = () => {
    const sub = RN.store.state.seen && RN.store.state.seen[SUB_KEY];
    RN.store.update((s) => { if (s.seen) delete s.seen[SUB_KEY]; }, 'seen');
    if (sub) RN.mail(sub.email, 'You are unsubscribed from the Fractional GTM Pulse', 'You will not get the quarterly Pulse anymore. Rates and research stay open at Revenue Nomad Insights.', 'newsletter');
    RN.ui.toast('Unsubscribed. No more quarterly emails.');
    RN.$$('.ins-news-slot').forEach((box) => { box.innerHTML = newsForm(box.dataset.src); });
  };
  const newsSlot = (src) => `<div class="ins-news-slot" data-src="${esc(src)}">${newsForm(src)}</div>`;
  // Exported so Home can place the same Pulse sign-up (value-07): RN.ins.newsSlot('home')
  ins.newsSlot = newsSlot;

  /* =====================================================================
     1. INSIGHTS HUB (#insights)
     ===================================================================== */
  function summaryStats() {
    const R = REP();
    const h = ins.hoursRows();
    const under40 = h.filter((r) => +r.code < 40).reduce((a, r) => a + r.v, 0);
    // Stat 2 recomputed from the hours data (the stored caption says "20 to 39 hours", which the hours cut does not support)
    return R.summary.map((s, i) => {
      if (i === 1) return { v: under40 + '%', l: `Of engagements are scoped under ${hoursLabel('40')}`, to: 'ins-ch3' };
      return { v: s.v, l: s.l.replace(/\bbuyers\b/g, 'clients').replace(/\bbuyer\b/g, 'client'), to: ['ins-ch2', 'ins-ch3', 'ins-ch3', 'ins-ch5', 'ins-ch1', 'ins-ch1'][i] };
    });
  }

  /* People drawn from the live sample network: operators with a photo first, highest Reputation Index first */
  const byRis = (a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || RN.fields.risRank(b) - RN.fields.risRank(a);
  const claimers = (tag) => liveOps().filter((o) => o.tags.some((t) => t.t === tag));
  function faces(ops, n, o) {
    o = o || {};
    const pick = ops.slice().sort(byRis).slice(0, n);
    const more = (o.total != null ? o.total : ops.length) - pick.length;
    return `<span class="ava-stack ins-faces ${o.cls || ''}" aria-hidden="true">${pick.map((op) => RN.ui.avatar(op, o.size || 'ava-xs', { decorative: true })).join('')}${more > 0 && !o.noMore ? `<span class="pill ins-faces-more">+${RN.fmt.int(more)}</span>` : ''}</span>`;
  }

  /* Small rising line for the findings strip: y runs from just under the lowest value, so a 9% rise reads as a rise */
  function trendLine(vals) {
    const W = 300, H = 60, pad = 6;
    const lo = Math.min(...vals) * 0.97, hi = Math.max(...vals);
    const pts = vals.map((v, i) => [pad + (i / (vals.length - 1)) * (W - pad * 2), H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="ins-tline" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="a" d="${d} L ${last[0].toFixed(1)} ${H} L ${pad} ${H} Z"/><path class="l" d="${d}"/>${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" class="${i === pts.length - 1 ? 'on' : ''}"/>`).join('')}</svg>`;
  }

  function hub() {
    const R = REP(), ri = RI();
    const st = RN.store.state;
    const tr = ri.trend, last = tr[tr.length - 1], prev = tr[tr.length - 2], first = tr[0];
    const di = R.demandIndex;
    const cur = di[3], prevY = di[2];
    const mk = RN.model.market();
    const ops = liveOps();
    // A "search that found no one" must still find no one when run today (operators add focus areas)
    const zero = mk.zero.filter((z) => !RN.model.search({ q: z.q, any: true }).length);
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
    const coRev = co ? co.revenueRange : '5m_20m';
    const coRange = ins.range('sales_leadership', coRev, '40');
    const coRate = coRange.r || ins.rate('sales_leadership', coRev);
    const topCats = Object.keys(ri.byCat).map((k) => ({ k, v: ri.byCat[k] })).sort((a, b) => b.v.p50 - a.v.p50).slice(0, 4);
    const bps = (RN.data.blueprints || (RN.projects && RN.projects.blueprints) || []);
    const bpList = Array.isArray(bps) ? bps.slice(0, 3).map((b) => b.title || b.name).filter(Boolean) : [];
    const libCount = F.fitTags.options.length;
    // Fit Tag Library tile: searches next to the operators who claim each focus area, on one scale
    const libRows = topDemand.slice(0, 3);
    const libMax = Math.max(...libRows.map((t) => Math.max(t.demand, t.supply)), 1);
    // Findings strip: small pictures drawn from the same report data
    const hrs = ins.hoursRows();
    const hrsMax = Math.max(...hrs.map((r) => r.v), 1);
    const rehire = parseFloat(String(sum[3].v)) || 0;

    return `<div class="ins-hub">
    <section class="wrap ins-hero">
      <div class="ins-hero-copy">
        <span class="eyebrow">Revenue Nomad Insights</span>
        <h1 class="h1">The numbers behind fractional <span class="serif">go-to-market.</span></h1>
        <p class="lede">Rates, demand and the frameworks behind engagements that get renewed. Built from what companies search for and what operators report on Revenue Nomad. Open to everyone, no login.</p>
        <div class="row ins-hero-cta">
          <a class="btn btn-lg" href="#report">Read the 2027 report${icon('arrow')}</a>
          <a class="btn btn-line btn-lg" href="#rates">Estimate a rate</a>
        </div>
        <div class="ins-hero-people">
          ${faces(ops.filter((o) => o.photo), 5, { size: 'ava-sm', noMore: true })}
          <p class="small muted">Built from ${esc(netText())} and the searches companies run every week. Rate Index as of ${esc(RN.fmt.date(asOfDate()))}.</p>
        </div>
        <p class="ins-hero-illus" data-proto>${illus('Illustrative figures')}</p>
      </div>
      <a class="ins-book night" href="#report" aria-label="Read The State of Fractional GTM 2027">
        <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
        <span class="ins-book-top"><span class="eyebrow">Revenue Nomad Research</span></span>
        <span class="ins-book-yr">2027</span>
        <span class="ins-book-t">The State of Fractional GTM</span>
        ${(() => { const sum = (R.summary || []); return sum[3] ? `<span class="ins-book-stats">
          <span><b>${esc(sum[0].v)}</b>median hourly rate</span>
          <span><b>${esc(sum[2].v)}</b>median engagement</span>
          <span><b>${esc(sum[3].v)}</b>rehire rate with 3+ reviews</span>
        </span>` : ''; })()}
        <span class="ins-book-foot"><span>6 chapters · ${RN.fmt.int(R.sample.operators + R.sample.companies)} respondents</span>${icon('arrow')}</span>
      </a>
    </section>

    <section class="wrap ins-tools-sec">
      <div class="ins-sec-hd"><div><span class="eyebrow">Tools and research</span><h2 class="h2">Our own data, open to everyone.</h2></div></div>
      <div class="ins-tools">
        <article class="ins-tool ins-tool-wide ins-tool-night night">
          <div class="ins-tool-hd">${RN.ui.icoTile('chart', { tone: 'gold', cls: 'ins-tool-ic' })}<div><h3 class="h4"><a href="#rates" class="ins-stretch">Rate Index</a></h3><p class="small">Hourly medians and ranges for every role category, updated quarterly.</p></div></div>
          <div class="ins-ri">
            <div class="ins-ri-now">
              <span class="label">All-category median, ${esc(last.l)}</span>
              <div class="ins-ri-v"><span class="num">${hr(last.v)}</span><small>/hr</small></div>
              <div class="row-nw" style="--gap:8px">${RN.ui.delta(last.v, prev.v)}<span class="tiny">vs ${esc(prev.l)}</span></div>
              <div class="ins-ri-cols" aria-label="Rate Index median by quarter, ${esc(first.l)} to ${esc(last.l)}" role="img">${tr.map((t, i) => `<span class="${i === tr.length - 1 ? 'on' : ''}" style="--h:${Math.round(((t.v - first.v * 0.8) / (last.v - first.v * 0.8)) * 100)}%"><i></i><em>${esc(t.l)}</em></span>`).join('')}</div>
            </div>
            <ul class="ins-ri-list">${topCats.map((c) => `<li><span class="row-nw" style="--gap:8px">${RN.ui.catDot(c.k)}${esc(catLabel(c.k))}</span><span class="ins-ri-bar"><i style="width:${((c.v.p50 / topCats[0].v.p50) * 100).toFixed(1)}%"></i></span><b class="num">${hr(c.v.p50)}</b></li>`).join('')}</ul>
          </div>
          <span class="ins-tool-go">Open the Rate Index${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd">${RN.ui.icoTile('grid', { tone: 'forest', cls: 'ins-tool-ic' })}<div><h3 class="h4"><a href="#framework" class="ins-stretch">GTM Framework</a></h3><p class="small muted">6 areas across 7 stages of the company journey. See what good looks like in each cell and who is strong there.</p></div></div>
          <div class="ins-fw" aria-hidden="true">${Array.from({ length: 42 }, (_, i) => `<i class="${[3, 9, 10, 16, 17, 24, 30, 31, 38].includes(i) ? 'on' : [2, 4, 11, 23, 25, 37].includes(i) ? 'mid' : ''}"></i>`).join('')}</div>
          <span class="ins-tool-go">Explore the framework${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd">${RN.ui.icoTile('layers', { tone: 'cs', cls: 'ins-tool-ic' })}<div><h3 class="h4"><a href="#library" class="ins-stretch">Fit Tag Library</a></h3><p class="small muted">${RN.fmt.int(libCount)} focus areas with definitions, company demand and verified supply.</p></div></div>
          <ul class="ins-lib" aria-label="Most searched focus areas, company searches next to operators who claim each">${libRows.map((t) => `<li><span class="ins-lib-t"><b>${esc(t.t)}</b><span class="tiny muted">${RN.fmt.int(t.demand)} · ${RN.fmt.int(t.supply)}</span></span>
            <span class="ins-lib-b"><i class="d" style="width:${((t.demand / libMax) * 100).toFixed(1)}%"></i><i class="s" style="width:${Math.max(1.5, (t.supply / libMax) * 100).toFixed(1)}%"></i></span></li>`).join('')}</ul>
          <p class="ins-est-legend tiny"><span><i class="ins-lib-k d"></i>Company searches</span><span><i class="ins-lib-k s"></i>Operators who claim it</span></p>
          <p class="tiny muted">${RN.fmt.int(verifiedTags.size)} focus areas are company-verified across ${RN.fmt.int(ops.length)} open profiles.</p>
          <span class="ins-tool-go">Search the library${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd">${RN.ui.icoTile('doc', { tone: 'info', cls: 'ins-tool-ic' })}<div><h3 class="h4"><a href="#blueprints" class="ins-stretch">Engagement Blueprints</a></h3><p class="small muted">Scoped engagements with the hours, term and 30/60/90-day plan they need, priced from the Rate Index.</p></div></div>
          ${bpList.length ? `<ul class="ins-mini-list">${bpList.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          <ol class="ins-plan" aria-label="Every Blueprint has a 30, 60 and 90-day plan"><li><b>30</b><span>days</span></li><li><b>60</b><span>days</span></li><li><b>90</b><span>days</span></li></ol>
          <span class="ins-tool-go">Browse Blueprints${icon('arrow')}</span>
        </article>
        <article class="card ins-tool">
          <div class="ins-tool-hd">${RN.ui.icoTile('book', { tone: 'enable', cls: 'ins-tool-ic' })}<div><h3 class="h4">Guides</h3><p class="small muted">Straight answers to the questions companies ask before they hire.</p></div></div>
          <ul class="ins-q-list">
            <li><a href="#guide.fractional-vp-of-sales-cost">What does a fractional VP of Sales cost in 2026?${icon('chev-right')}</a></li>
            <li><a href="#guide.how-to-hire-a-fractional-vp-of-sales">How do you hire a fractional VP of Sales in 2026?${icon('chev-right')}</a></li>
            <li><a href="#guide.interim-vs-fractional-vs-full-time-sales-leader">Interim, fractional or full-time sales leader, which fits?${icon('chev-right')}</a></li>
          </ul>
          <a class="ins-tool-go" href="#guides">All guides${icon('arrow')}</a>
        </article>
      </div>
    </section>

    <section class="wrap ins-pulse">
      <div class="ins-sec-hd">
        <div><span class="eyebrow">This week in fractional GTM</span><h2 class="h2">Week of ${esc(RN.fmt.dateShort(week))}. What companies looked for.</h2></div>
      </div>
      <div class="stats-row ins-kpis" style="--cols:3">
        <div class="stat"><span class="stat-l">Demand index, ${esc(cur.l)}</span><span class="stat-v">${RN.fmt.int(cur.v)}</span><span class="row-nw" style="--gap:8px">${RN.ui.delta(cur.v, prevY.v)}<span class="tiny muted">vs ${esc(prevY.l)}. 2023 = 100</span></span></div>
        <div class="stat"><span class="stat-l">New operator applications</span><span class="stat-v">${RN.fmt.int(newApps)}</span><span class="tiny muted">This week. Network: ${esc(netText())}</span></div>
        <div class="stat"><span class="stat-l">Searches with no match</span><span class="stat-v">${RN.fmt.int(zero.length)}</span><span class="tiny muted">Companies searched and nobody fit</span></div>
      </div>
      <div class="grid g-2 ins-pulse-grid">
        <div class="card">
          <div class="card-hd"><div><h3>Most searched focus areas</h3><p class="sub">Company searches in the last 7 days, and the operators who claim each one</p></div></div>
          ${(() => { const row = (t, i) => { const cl = claimers(t.t); return `<li><button type="button" class="ins-trow" data-act="ins-browse" data-src="hub_top_searched" data-tags="${jsonAttr([t.t])}" data-f="{}">
              <span class="ins-trow-n num">${i + 1}</span>
              <span class="ins-trow-b"><span class="ins-trow-t"><b>${esc(t.t)}</b><span class="tiny muted">${esc(catLabel(t.c))}</span></span>
                <span class="meter"><i style="width:${((t.demand / maxDemand) * 100).toFixed(1)}%"></i></span>
                <span class="tiny muted">${RN.fmt.int(t.demand)} searches · ${RN.fmt.int(t.supply)} claim it · ${t.verified ? `${RN.fmt.int(t.verified)} company-verified` : 'none verified yet'}</span></span>
              ${cl.length ? faces(cl, 3, { noMore: true }) : '<span></span>'}
              ${icon('chev-right')}</button></li>`; }; return `<ol class="ins-trows">${topDemand.slice(0, 3).map(row).join('')}</ol>${topDemand.length > 3 ? `<details class="ins-more"><summary>Show all ${topDemand.length}</summary><ol class="ins-trows" start="4">${topDemand.slice(3).map((t, i) => row(t, i + 3)).join('')}</ol></details>` : ''}`; })()}
          <div class="card-hd ins-unmet-hd"><div><h3>What companies typed</h3><p class="sub">Top searches in the last 7 days. Select one to run it</p></div></div>
          <ul class="ins-qs">${topQ.map((q) => `<li><button type="button" class="chip chip-sm" data-act="ins-browse" data-src="hub_top_query" data-q="${esc(q.q)}" data-f="{}">${icon('search')}${esc(q.q)}<span class="ins-qs-n">${RN.fmt.int(q.vol)}</span></button></li>`).join('')}</ul>
        </div>
        <div class="card ins-unmet">
          <div class="card-hd"><div><h3>Searches that found no one</h3><p class="sub">Company needs the network cannot fill yet</p></div></div>
          ${zero.length ? `<ul class="ins-zero">${zero.slice(0, 3).map((z) => `<li><span class="ins-zero-q">“${esc(z.q)}”</span><span class="tiny muted">${esc([z.cat ? catLabel(z.cat) : '', z.industry ? RN.w.label('industries', z.industry) : '', z.live ? 'searched today' : RN.fmt.plural(z.vol, 'search', 'searches') + ' this week'].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : RN.ui.empty({ icon: 'search', title: 'Every search found a match this week', body: 'When a company search finds no one, it shows up here.' })}
          <div class="ins-unmet-ft">
            <a class="act" href="#studio.positioning">${icon('target')}Operators: add or verify these focus areas</a>
            <a class="act" href="#talk">${icon('message')}Hiring for one of these? Talk to us</a>
          </div>
        </div>
      </div>
    </section>

    <section class="wrap ins-finds">
      <div class="ins-sec-hd"><div><span class="eyebrow">From the 2027 report</span><h2 class="h2">Three findings worth knowing before you hire.</h2></div><a class="act" href="#report">Read all six chapters${icon('arrow')}</a></div>
      <div class="ins-finds-in">
        <button type="button" class="ins-find" data-act="ins-report-ch" data-ch="ins-ch2">
          <span class="label">Chapter 2 · What it costs</span>
          <span class="ins-find-v">${esc(sum[0].v)}</span>
          <span class="ins-find-viz" role="img" aria-label="Rate Index median by quarter, ${esc(first.l)} ${hr(first.v)} to ${esc(last.l)} ${hr(last.v)}">${trendLine(tr.map((t) => t.v))}<span class="ins-find-ax tiny"><span>${esc(first.l)} ${hr(first.v)}</span><span>${esc(last.l)} ${hr(last.v)}</span></span></span>
          <span class="ins-find-l">${esc(sum[0].l)}</span>
          <span class="ins-tool-go">Read the chapter${icon('arrow')}</span></button>
        <button type="button" class="ins-find" data-act="ins-report-ch" data-ch="ins-ch3">
          <span class="label">Chapter 3 · How it is scoped</span>
          <span class="ins-find-v">${esc(sum[1].v)}</span>
          <span class="ins-find-viz ins-find-hrs" role="img" aria-label="Share of engagements by hours a month. Under 40 hours highlighted">${hrs.map((r) => `<span class="${+r.code < 40 ? 'on' : ''}" style="--h:${((r.v / hrsMax) * 100).toFixed(1)}%"><i></i><em>${esc(r.code === '19' ? '<20' : r.code)}</em></span>`).join('')}</span>
          <span class="ins-find-l">${esc(sum[1].l)}</span>
          <span class="ins-tool-go">Read the chapter${icon('arrow')}</span></button>
        <button type="button" class="ins-find" data-act="ins-report-ch" data-ch="ins-ch5">
          <span class="label">Chapter 5 · Who gets rehired</span>
          <span class="ins-find-v">${esc(sum[3].v)}</span>
          <span class="ins-find-viz ins-find-pair" role="img" aria-label="Rehire rate, 3 or more verified reviews against none">
            <span><em>No reviews</em><i style="width:${rehire ? (100 / rehire).toFixed(1) : 40}%"></i><b>1x</b></span>
            <span class="on"><em>3+ reviews</em><i style="width:100%"></i><b>${esc(sum[3].v)}</b></span></span>
          <span class="ins-find-l">${esc(sum[3].l)}</span>
          <span class="ins-tool-go">Read the chapter${icon('arrow')}</span></button>
      </div>
    </section>

    <section class="wrap ins-contrib" id="ins-contribute" aria-labelledby="ins-contrib-h">
      <div class="ins-sec-hd">
        <div><span class="eyebrow">Contribute</span><h2 class="h2" id="ins-contrib-h">Add your numbers to the next edition.</h2>
          <p class="ins-contrib-p">The Rate Index, the 2028 report and the Pulse are built from what companies and operators tell us. Each one gives something back right away.</p></div>
        ${CX().trust({ cls: 'ins-contrib-trust' })}
      </div>
      <div class="ins-contrib-grid">
        ${CX().cta('rates', { variant: 'card', ctx: { source: 'hub_contribute' } })}
        ${CX().cta('survey', { variant: 'card', ctx: { source: 'hub_contribute' } })}
        ${CX().cta('pulse', { variant: 'card', ctx: { source: 'hub_contribute' } })}
      </div>
    </section>

    <section class="wrap ins-you">
      <div class="ins-split">
        <div class="ins-split-a">
          <span class="eyebrow">For companies hiring</span>
          <h3 class="h3">Price the role before you post it.</h3>
          <div class="ins-split-big"><span class="num">${esc(coRange.label)}</span><span class="tiny muted">Sales Leadership · ${esc(hoursLabel('40'))} · ${esc(revLabel(coRev))}${co ? ` (${esc(co.name)})` : ''}</span></div>
          <p class="body">${esc(NO_FEES)} Pick your role and company revenue for your own number.</p>
          <a class="btn" href="#rates">Open the estimator${icon('arrow')}</a>
        </div>
        <div class="ins-split-b night">
          <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
          <span class="eyebrow">For operators</span>
          <h3 class="h3">See where your rate sits.</h3>
          ${pos && pos.rate
            ? `<div class="ins-opband-track ins-split-track"><span class="ins-you-mark" style="left:${RN.clamp((pos.rate / 450) * 100, 0, 100).toFixed(1)}%">You ${hr(pos.rate)}</span>${rangeBar(pos.idx.p25, pos.idx.p50, pos.idx.p75, 450, { cls: 'ins-rtrack-night' })}</div>
              <p class="ins-split-p">Your rate of <b>${hr(pos.rate)}/hr</b> sits at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}, where the median is ${hr(pos.idx.p50)}/hr.</p>`
            : `<div class="ins-split-scale">${rangeBar(coRate.p25, coRate.p50, coRate.p75, 450, { labels: true, cls: 'ins-rtrack-night' })}<span class="tiny">Sales Leadership, middle 50% of hourly rates</span></div>
              <p class="ins-split-p">Compare your hourly rate with the Rate Index for your role category, and see which focus areas companies searched for this week.</p>`}
          <a class="btn btn-leaf" href="#studio.positioning">Open Positioning in Studio${icon('arrow')}</a>
        </div>
      </div>
    </section>

    <section class="wrap ins-news-sec">
      <div class="ins-news ins-news-lite">
        <div>
          <span class="eyebrow">Quarterly newsletter</span>
          <h2 class="h3 ins-news-h">The Fractional GTM Pulse</h2>
          <p class="ins-news-p">Once a quarter: the Rate Index by role category, the Demand Index and new research.</p>
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
    // Same numbers as the Rate Index (RN.model.rateFor), adjusted for the picked revenue range
    const rows = F.roleCategory.options.filter((o) => RI().byCat[o.v]).map((o) => ({ label: o.l, value: Math.round(ins.rate(o.v, rep.rev).p50), hi: o.v === rep.cat })).sort((a, b) => b.value - a.value);
    return bars(rows, { fmt: (n) => '$' + n, max: 400, label: 'Median hourly rate by role category' }, w);
  };
  DRAW.rateRev = (w) => {
    const rows = REP().rateByRevenue.map((r) => ({ label: revLabel(r.range), value: r.v, hi: r.range === rep.rev }));
    return cols(rows, { fmt: (n) => '$' + n, label: 'Median hourly rate by company revenue range' }, w);
  };
  DRAW.hours = (w) => bars(ins.hoursRows().map((r) => ({ label: hoursLabel(r.code), value: r.v, hi: r.code === rep.hours })), { fmt: (n) => n + '%', max: 35, label: `Share of engagements by ${F.hoursPerMonth.label.toLowerCase()}` }, w);
  DRAW.term = (w) => cols(REP().term.map((r, i) => ({ label: RN.w.label('term', TERM[i]) || r.l, value: r.v, hi: i === 1 })), { fmt: (n) => n + '%', label: 'Share of engagements by initial term' }, w);
  DRAW.intent = (w) => bars(REP().intent.map((r) => ({ label: catLabel(r.cat), value: r.v, hi: r.cat === 'revenue_operations' })), { fmt: (n) => n + '%', max: 40, label: 'Hiring intent by role category, next 12 months' }, w);
  DRAW.sources = (w) => bars(REP().sources.map((r) => ({ label: r.l, value: r.v, hi: /Marketplace/.test(r.l) })), { fmt: (n) => n + '%', max: 50, label: 'Where the last engagement came from' }, w);
  DRAW.concurrent = (w) => cols(REP().concurrent.map((r, i) => ({ label: r.l, value: r.v, hi: i === 1 })), { fmt: (n) => n + '%', label: 'Concurrent companies per operator', h: w < 460 ? 250 : 220 }, w);

  /* Chapter opener: chapter number and title on the left, the chapter's headline number on the right */
  function chapterHead(n, title, o) {
    o = o || {};
    return `<header class="ins-ch-hd">
      <div class="ins-ch-ttl">${n ? `<span class="ins-ch-n" aria-hidden="true">${esc(n)}</span>` : ''}<div><span class="eyebrow">${esc(o.eyebrow || 'Chapter ' + n)}</span><h2 class="h2">${title}</h2>${o.lede ? `<p class="lede">${esc(o.lede)}</p>` : ''}</div></div>
      ${o.v ? `<div class="ins-ch-stat"><span class="ins-ch-v">${esc(o.v)}</span><span class="ins-ch-l">${esc(o.l)}</span>${o.more ? `<span class="ins-ch-more">${o.more}</span>` : ''}${shareBtn(reportShare(`${o.v} ${lowerFirst(o.l)}.`), 'ins-ch-share')}</div>` : ''}
    </header>`;
  }
  /* Per-chapter ask: one line that opens the 2028 survey at this chapter. Hidden once the survey is finished
     (the rail and the end of the report carry the thanks state). */
  const chAsk = (n) => `<div class="ins-ch-ask">${CX().cta('survey', { variant: 'line', ctx: { chapter: n, source: 'report_ch' + n } })}</div>`;
  function figure(o) {
    return `<figure class="card ins-fig ${o.cls || ''}">
      <figcaption class="ins-fig-hd"><div><h3 class="h4">${esc(o.title)}</h3>${o.sub ? `<p class="sub">${esc(o.sub)}</p>` : ''}</div>${o.hi ? `<span class="ins-hi-note"><i aria-hidden="true"></i>${esc(o.hi)}</span>` : ''}</figcaption>
      ${o.controls || ''}
      ${o.chart ? `<div class="ins-chart" data-ins-chart="${esc(o.chart)}"></div>` : ''}
      ${o.body || ''}
      ${o.take ? `<p class="ins-take">${o.take}</p>` : ''}
      ${o.foot || ''}
    </figure>`;
  }
  /* Citation block (report and Rate Index): suggested text, copy button, one note.
     The "[Prototype edition, illustrative figures]" tag and the note are reviewer-only (data-proto). */
  const citeHtml = (t) => esc(t).replace(/ \[Prototype edition, illustrative figures\]/, '<span data-proto> [Prototype edition, illustrative figures]</span>');
  function citeBlock(o) {
    return `<div class="ins-cite" id="${esc(o.id)}">
      <div class="ins-cite-hd"><span class="label">${esc(o.label)}</span></div>
      <p class="ins-cite-t" id="${esc(o.id)}-text" ${o.attr || ''}>${citeHtml(o.text)}</p>
      <div class="row ins-cite-a">
        <button type="button" class="btn btn-sm" data-act="ins-copy" data-target="${esc(o.id)}-text" data-src="${esc(o.src)}">${icon('copy')}Copy citation</button>
        ${o.link || ''}
      </div>
      <p class="tiny muted" data-proto>${esc(o.note)}</p>
    </div>`;
  }
  function chLink(o) {
    return `<div class="ins-chlink ${o.cls || ''}">
      <div class="ins-chlink-t"><span class="label">${esc(o.label || 'From research to shortlist')}</span><p>${o.text}</p></div>
      <div class="row ins-chlink-a">${o.secondary || ''}${o.primary}</div>
    </div>`;
  }
  function ch2Link() {
    const f = { roleCategories: [rep.cat], revenueRange: rep.rev ? [rep.rev] : [] };
    return browseBtn('See operators', f, 'report_ch2', 'btn', 'data-ins-ch2-go');
  }
  const ch3Link = () => browseBtn('See operators', { hoursPerMonth: [rep.hours] }, 'report_ch3', 'act', 'data-ins-ch3-go');
  function catSelect(value, change) {
    return `<select class="select ins-inline-select" aria-label="${esc(F.roleCategory.label)}" data-change="${esc(change)}">${F.roleCategory.options.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  }
  const ch2RevText = () => (rep.rev ? `for ${revLabel(rep.rev)} companies` : 'for companies of any revenue');
  const ch2Adj = () => (rep.rev ? `Adjusted for ${revLabel(rep.rev)} companies with the Rate Index multiplier (×${ins.mult(rep.rev).toFixed(2)}).` : 'All revenue ranges. Pick one to adjust with the Rate Index multiplier.');
  // "$27,000+" in the stored table reads "$27k+", the house money format
  const kStr = (s) => String(s).replace(/\$([\d,]{4,})/g, (m, d) => RN.fmt.k(+d.replace(/,/g, '')));
  // Sentences that only say the figures are illustrative are reviewer-only
  const protoSentences = (p) => esc(p).replace(/([^.]*\billustrative\b[^.]*\.)/gi, '<span data-proto>$1</span>');
  // Wide screens read the report with a chapter rail on the left
  const railMode = () => window.matchMedia('(min-width: 1100px)').matches;

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
    const net = liveOps();
    const netN = net.length || 1;
    const dsMax = Math.max(...R.intent.map((r) => Math.max(r.v, ((mk.catSupply[r.cat] || 0) / netN) * 100)), 1);
    const outcomes = R.outcomes;
    const di = R.demandIndex;
    const topHours = ins.hoursRows().slice().sort((a, b) => b.v - a.v)[0];
    const revOps = R.intent.find((r) => r.cat === 'revenue_operations') || R.intent[0];
    const src0 = R.sources[0];
    // Fractional row priced from the Rate Index (Sales Leadership median at 40 hrs / month), shown as the
    // rate itself (the price a client pays), so it matches #rates, Blueprints and the guides
    const vp = ins.range('sales_leadership', null, '40');
    const fvf = R.fracVsFull.map((r, i) => (i === 0 ? [`Fractional VP of Sales, ${hoursLabel('40')}`, RN.fmt.k(vp.mid), r[2], r[3]] : [r[0], kStr(r[1]), r[2], r[3]]));
    // One fieldwork line, read from the methodology so the cover, citation and method never disagree
    const fieldwork = ((R.methodology[0] || '').match(/fielded (.+?\d{4})/) || [])[1] || R.fieldwork;
    const citation = `Revenue Nomad Research. (${asOfDate().getFullYear()}). The State of Fractional GTM ${R.year} [Prototype edition, illustrative figures]. Survey of ${R.sample.operators} fractional GTM operators and ${R.sample.companies} hiring companies, fieldwork ${fieldwork}. ${RN.share.url('report')}`;

    return `<article class="ins-report">
    <header class="night ins-cover">
      <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
      <div class="wrap ins-cover-in">
        <div class="ins-cover-main">
          <div class="ins-cover-top"><span class="eyebrow">Revenue Nomad Research</span>${illus('Prototype edition, illustrative figures')}</div>
          <h1 class="h-hero ins-cover-h">${esc(R.title)} <span class="serif">${esc(R.year)}</span></h1>
          <p class="ins-cover-lede">${esc(R.lede)}</p>
          <div class="row ins-cover-cta">
            <button type="button" class="btn btn-leaf btn-lg" data-act="ins-jump" data-to="ins-sum">Read the key findings${icon('arrow')}</button>
            <button type="button" class="btn btn-line btn-lg" data-act="ins-jump" data-to="ins-cite">${icon('quote')}Cite this report</button>
          </div>
          <dl class="ins-meta">
            <div><dt>Operators surveyed</dt><dd>${RN.fmt.int(R.sample.operators)}</dd></div>
            <div><dt>Hiring companies surveyed</dt><dd>${RN.fmt.int(R.sample.companies)}</dd></div>
            <div><dt>Operator profiles</dt><dd>${esc(MK().network.operators)} <small>(${RN.fmt.int(netN)} profiles)</small></dd></div>
            <div><dt>Fieldwork</dt><dd>${esc(R.fieldwork)}</dd></div>
          </dl>
        </div>
        <button type="button" class="ins-cbook" data-act="ins-jump" data-to="ins-sum" aria-label="Start reading at the key findings">
          <span class="ins-cbook-sheet" aria-hidden="true"></span>
          <span class="ins-cbook-cover" aria-hidden="true">
            <span class="ins-cbook-k">Revenue Nomad Research</span>
            <span class="ins-cbook-cols">${di.map((d, i) => `<i class="${/proj/i.test(d.l) ? 'p' : ''}" style="--h:${((d.v / Math.max(...di.map((x) => x.v))) * 100).toFixed(1)}%;--d:${i * 0.07}s"></i>`).join('')}</span>
            <span class="ins-cbook-y">${esc(R.year)}</span>
            <span class="ins-cbook-t">${esc(R.title)}</span>
            <span class="ins-cbook-m">${esc(R.sample.operators)} operators · ${esc(R.sample.companies)} companies surveyed</span>
          </span>
        </button>
      </div>
    </header>

    <div class="wrap ins-read">
    <nav class="ins-chapnav" aria-label="Report chapters">
      <div class="ins-chapnav-in">
        <span class="ins-rail-k label">Contents</span>
        ${CHAPTERS.map((c, i) => `<button type="button" class="ins-chap ${i === 0 ? 'on' : ''}" data-act="ins-jump" data-to="${c.id}" data-chap="${c.id}">${c.n && c.n !== 'Summary' ? `<span class="num">${esc(c.n)}</span>` : '<span class="num ins-chap-dot" aria-hidden="true"></span>'}<span class="ins-chap-t">${esc(c.t)}</span></button>`).join('')}
      </div>
      <span class="ins-prog" aria-hidden="true"><i></i></span>
      <div class="ins-rail-ft">
        <button type="button" class="act" data-act="ins-jump" data-to="ins-cite">${icon('quote')}Cite this report</button>
        <button type="button" class="act" data-act="ins-copy-link" data-path="report">${icon('link')}Copy link</button>
        ${RN.share.button(reportShare(R.lede), 'Share the report', 'act')}
      </div>
      <div class="ins-rail-cx">${CX().cta('survey', { variant: 'card', h: 'h3', ctx: { source: 'report_rail' } })}</div>
    </nav>

    <div class="ins-main">
    <section class="ins-ch ins-sum" id="ins-sum">
      ${chapterHead('', 'Companies now plan fractional hires on purpose.', { eyebrow: 'Key findings' })}
      <ol class="ins-sumgrid">
        ${sum.map((s) => `<li class="ins-sumli"><button type="button" class="ins-sumstat" data-act="ins-jump" data-to="${s.to}"><span class="ins-sum-v">${esc(s.v)}</span><span class="ins-sum-l">${esc(s.l)}</span><span class="ins-sumgo">Chapter ${esc(s.to.replace('ins-ch', ''))}${icon('arrow')}</span></button>${shareBtn(reportShare(`${s.v} ${lowerFirst(s.l)}.`), 'ins-sum-share')}</li>`).join('')}
      </ol>
    </section>

    <section class="ins-ch" id="ins-ch1">
      ${chapterHead('1', 'Who is hiring, and what triggered it', { v: `${(di[3].v / 100).toFixed(1)}x`, l: `Fractional GTM demand in ${di[3].l} against 2023, up ${pctChange(di[3].v, di[2].v)}% on ${di[2].l}` })}
      <div class="ins-grid2">
        ${figure({ title: 'Why companies bring in a fractional leader', sub: 'Share of hiring companies, primary trigger', chart: 'triggers', hi: 'Top trigger', take: 'The biggest trigger is a founder deciding <em>they should no longer be the sales leader.</em>',
          foot: `<p class="ins-fig-go">${browseBtn('Browse Sales Leadership', { roleCategories: ['sales_leadership'] }, 'report_ch1', 'act')}</p>` })}
        ${figure({ title: 'Growth in fractional GTM demand', sub: 'Indexed, 2023 = 100. Job post scan plus stated hiring intent', chart: 'demand',
          body: `<div class="ins-est-legend tiny ins-fig-legend"><span><i class="m sq"></i>Measured</span><span><i class="b sq"></i>2027 projection</span></div>` })}
      </div>
      ${chAsk(1)}
    </section>

    <section class="ins-ch" id="ins-ch2">
      ${chapterHead('2', 'What it costs', { v: `${stagePremium}%`, l: `More per hour at ${revLabel(hi.range)} than ${revLabel(lo.range).replace(/^Under/, 'under')}, for the same role` })}
      <div class="ins-grid2">
        ${figure({ title: 'Median hourly rate by role category', sub: 'Rate Index medians, the hourly rates operators list',
          controls: `<div class="ins-ctl"><span class="label">${esc(F.companyRevenue.label)}</span><div data-deselect>${RN.w.control('companyRevenue', rep.rev || '', { name: 'ins-rep-rev', id: 'ins-rep-rev', change: 'ins-rep-rev' })}</div><p class="tiny muted" data-ins-adj>${esc(ch2Adj())}</p></div>`,
          chart: 'rateCat', hi: 'Picked role category',
          body: pos && pos.rate ? `<p class="note info ins-you-note">${icon('user')}<span>Your rate of <b>${hr(pos.rate)}/hr</b> sits at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}. <a href="#studio.positioning">See your positioning in Studio</a></span></p>`
            : co ? `<p class="note info ins-you-note" data-ins-co-note ${rep.rev === co.revenueRange ? '' : 'hidden'}>${icon('building')}<span>Filtered to ${esc(co.name)}’s revenue range. Tap it again to see all revenue ranges.</span></p>` : '' })}
        <div class="ins-stack">
          ${figure({ title: 'Median hourly rate by company revenue range', sub: 'Same role mix. Larger companies pay more and scope more hours', chart: 'rateRev', hi: 'Your revenue range',
          take: '<em>Company stage sets the rate more than the title does.</em>' })}
        ${chLink({ cls: 'ins-chlink-tint', label: 'Your shortlist', text: `Browse ${catSelect(rep.cat, 'ins-rep-cat')} operators <span data-ins-ch2-rev>${esc(ch2RevText())}</span>.`, primary: ch2Link(),
        secondary: `<a class="act" href="#rates">${icon('sliders')}Price it in the Rate Index</a>` })}
        </div>
      </div>
      ${figure({ cls: 'ins-fig-wide', title: 'Fractional vs full time, monthly cost', sub: 'For a VP of Sales. The fractional row uses the Rate Index median rate',
        body: `<div class="tbl-wrap"><table class="tbl ins-tbl ins-tbl-stack"><thead><tr><th>Option</th><th class="r">Monthly cost</th><th>Time to start</th><th>Exit cost</th></tr></thead>
          <tbody>${fvf.map((r, i) => `<tr class="${i === 0 ? 'ins-tr-hi' : ''}"><td class="ins-td-h">${esc(r[0])}</td><td class="r num" data-l="Monthly cost"><b>${esc(r[1])}</b></td><td data-l="Time to start">${esc(r[2])}</td><td data-l="Exit cost">${esc(r[3])}</td></tr>`).join('')}</tbody></table></div>` })}
      ${chAsk(2)}
    </section>

    <section class="night ins-band ins-ch" id="ins-ch3">
      ${chapterHead('3', 'How engagements are scoped', { v: `${topHours.v}%`, l: `Of engagements run at ${hoursLabel(topHours.code)}, the most common shape` })}
      <div class="ins-grid-3">
        ${figure({ title: F.hoursPerMonth.label, sub: 'Share of engagements by hours a month', chart: 'hours', cls: 'ins-fig-night ins-g3-a', hi: 'Selected shape',
          controls: `<div class="ins-ctl"><span class="label">Highlight a shape</span>${RN.w.control('hoursPerMonth', rep.hours, { name: 'ins-rep-hours', id: 'ins-rep-hours', change: 'ins-rep-hours' })}</div>`,
          take: '<em>Most companies buy a senior leader in slices.</em>',
          foot: `<p class="ins-fig-go"><span>Operators with at least <b data-ins-ch3-h>${esc(hoursLabel(rep.hours))}</b> available</span>${ch3Link()}</p>` })}
        ${figure({ title: 'Initial term length', sub: 'Share of engagements', chart: 'term', cls: 'ins-fig-night' })}
        ${figure({ title: 'How the first term ends', sub: 'Share of engagements', cls: 'ins-fig-night',
          body: `<ul class="ins-outcomes">${outcomes.map((o) => `<li><span class="ins-outcome-v">${esc(o.v)}</span><span>${esc(o.l)}</span></li>`).join('')}</ul>` })}
      </div>
      ${chAsk(3)}
    </section>

    <section class="ins-ch" id="ins-ch4">
      ${chapterHead('4', 'Which roles are in demand', { v: `${revOps.v}%`, l: `Of hiring companies plan to hire ${catLabel(revOps.cat)} in the next 12 months, the biggest gap against who is on the network` })}
      <div class="ins-grid2 ins-grid-aside">
        ${figure({ title: 'Hiring intent by role category, next 12 months', sub: 'Share of hiring companies. Sellers were not part of this question', chart: 'intent', hi: 'Fastest riser',
          take: 'Sales leadership still leads, but Revenue Operations is the fastest riser. Companies are hiring <em>the systems person before the second sales leader.</em>' })}
        <blockquote class="ins-quote"><span class="ins-quote-ic" aria-hidden="true">${icon('quote')}</span><p>“${esc(R.quote.text)}”</p><footer class="ins-quote-by">${RN.ui.icoTile('building', { soft: true, round: true, cls: 'ins-quote-mark' })}<span class="ins-quote-who"><cite>${esc(R.quote.by.split(',')[0])}</cite><span>${esc(R.quote.by.split(',').slice(1).join(',').trim())}</span></span>${illus('Sample quote')}</footer></blockquote>
      </div>
      ${figure({ cls: 'ins-fig-wide', title: 'Demand vs supply on Revenue Nomad', sub: `Hiring intent next to each role’s share of the network: ${netText()}`,
        body: `<div class="tbl-wrap"><table class="tbl ins-tbl ins-ds"><thead><tr><th>${esc(F.roleCategory.label)}</th><th>Hiring intent</th><th>Share of operators</th><th><span class="sr-only">Browse</span></th></tr></thead><tbody>
          ${R.intent.map((r) => { const s = (mk.catSupply[r.cat] || 0) / netN * 100; const gap = r.v - s >= 4; return `<tr>
            <td><div class="ins-ds-name"><span class="row-nw" style="--gap:8px">${RN.ui.catDot(r.cat)}${esc(catLabel(r.cat))}</span>${gap ? '<span class="pill pill-warn">Undersupplied</span>' : ''}</div></td>
            <td><span class="ins-cellbar"><span class="meter"><i style="width:${Math.min(100, (r.v / dsMax) * 100).toFixed(1)}%"></i></span><b class="num">${r.v}%</b></span></td>
            <td><span class="ins-cellbar"><span class="meter ins-meter-mu"><i style="width:${Math.min(100, (s / dsMax) * 100).toFixed(1)}%"></i></span><span class="num">${Math.round(s)}%</span></span></td>
            <td class="r"><button type="button" class="act" data-act="ins-browse" data-src="report_ch4_table" data-f="${jsonAttr({ roleCategories: [r.cat] })}" aria-label="Browse ${esc(catLabel(r.cat))} operators"><span class="ins-hide-s">Browse</span>${icon('chev-right')}</button></td></tr>`; }).join('')}
          </tbody></table></div>` })}
      ${chAsk(4)}
    </section>

    <section class="ins-ch" id="ins-ch5">
      ${chapterHead('5', 'What separates the operators who get rehired', { v: R.hindsight[0][2], l: 'Of hiring companies rank stage and deal-size experience among their three deciding factors', more: '<b>3 of 4</b> top-rated operators had solved the same problem at the same stage before' })}
      <div class="ins-grid2 ins-grid-aside ins-grid-top">
        ${figure({ title: 'What hiring companies say mattered most in hindsight', sub: 'Share of hiring companies',
          body: `<div class="tbl-wrap"><table class="tbl ins-tbl ins-tbl-stack ins-hind"><thead><tr><th>Factor</th><th class="r">Ranked first</th><th class="r">In top three</th></tr></thead><tbody>
            ${R.hindsight.map((r) => `<tr><td class="ins-td-h">${esc(r[0])}</td><td class="r num" data-l="Ranked first">${esc(r[1])}</td><td class="r num" data-l="In top three"><span class="ins-cellbar ins-cellbar-r"><span class="meter"><i style="width:${parseFloat(r[2]) || 0}%"></i></span><b>${esc(r[2])}</b></span></td></tr>`).join('')}</tbody></table></div>`,
          take: 'Big logos ranked last. <em>Fit and proof beat fame.</em>' })}
        <aside class="ins-proof">
          <span class="label">Proof, not logos</span>
          <p>The Reputation Index measures what companies said mattered: company reviews, verified focus areas and repeat engagements.</p>
          <div class="ins-proof-a">${browseBtn('Top by Reputation Index', {}, 'report_ch5', 'btn btn-sm', 'data-sort="ris"')}<a class="act" href="#levels">How the score works</a></div>
        </aside>
      </div>
      ${chAsk(5)}
    </section>

    <section class="ins-ch" id="ins-ch6">
      ${chapterHead('6', 'The operator side', { v: `${src0.v}%`, l: `Of operators’ last engagements came from “${src0.l}”, the most common source` })}
      <div class="ins-grid2">
        ${figure({ title: 'Where the last engagement came from', sub: 'Operators', chart: 'sources', hi: 'Revenue Nomad' })}
        ${figure({ title: 'Concurrent companies', sub: 'Operators, today', chart: 'concurrent', hi: 'Most common' })}
      </div>
      <p class="ins-take ins-take-solo">Two thirds of work still comes through personal networks. <em>The market is large, fragmented and hard to see into,</em> which is why rate and demand data has been guesswork until now.</p>
      ${chAsk(6)}
    </section>

    <section class="ins-ch ins-method" id="ins-method">
      ${chapterHead('', 'How this was built', { eyebrow: 'Methodology' })}
      <div class="ins-grid2">
        <div class="prose">${R.methodology.map((p) => `<p>${protoSentences(p)}</p>`).join('')}
          <h3 class="h5 ins-method-h">How contributions are used</h3>
          <p>From the 2028 edition, the report and the quarterly Rate Index also draw on what companies and operators add on Revenue Nomad through the year: the 2028 survey, rates operators charge and what companies paid, and the quarterly Pulse. Every answer is published only in aggregate, never individually; one-tap and Pulse answers given without an email are anonymous. A figure publishes only when its group has at least 5 responses, and Rate Index categories with fewer than ${MIN_CELL} rates are marked directional. ${esc(CX().emailUse)} Nothing anyone adds changes their Reputation Index. Fieldwork for the 2028 edition closes ${esc(CX().datasets.report2028.window().closesLabel)}.</p></div>
        <div>
          <div class="card-flat ins-fields">
            <span class="label">Every cut uses the platform’s own fields</span>
            <ul>${['roleCategory', 'companyRevenue', 'companyEmployees', 'hoursPerMonth', 'term', 'industry'].map((k) => `<li><b>${esc(RN.w.def(k).label)}</b><span>${RN.w.def(k).options ? esc(RN.w.def(k).options.length + ' options, the same as operator signup') : ''}</span></li>`).join('')}</ul>
          </div>
          ${citeBlock({ id: 'ins-cite', label: 'Cite this report', text: citation, src: 'report',
            link: `<button type="button" class="btn btn-line btn-sm" data-act="ins-copy-link" data-path="report">${icon('link')}Copy link</button>`,
            note: 'This shows how the published edition will be cited. The figures in this prototype edition are illustrative.' })}
        </div>
      </div>
    </section>

    <section class="ins-end">
      ${RN.share.row({ title: `The State of Fractional GTM ${R.year}`, route: 'report', kind: 'report', quote: R.lede, label: 'Share the report' })}
      <div class="ins-end-grid">
      ${CX().cta('survey', { variant: 'card', h: 'h2', ctx: { source: 'report_end' } })}
      <div class="panel-night ins-news">
        <div>
          <span class="eyebrow">Quarterly newsletter</span>
          <h2 class="h3 ins-news-h">The Fractional GTM Pulse, by email.</h2>
          <p class="ins-news-p">Once a quarter: the Rate Index by role category, the Demand Index and new research.</p>
        </div>
        ${newsSlot('report')}
      </div>
      </div>
    </section>
    </div>
    </div>
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
    const go = RN.$('[data-ins-ch3-go]'); if (go) go.outerHTML = ch3Link();
  };
  // Copy a citation: navigator.clipboard.writeText inside the click, falling back to selecting the text
  RN.actions['ins-copy'] = (el) => {
    const t = document.getElementById(el.dataset.target);
    let txt = '';
    if (t) { const c = t.cloneNode(true); if (!RN.store.state.notes) c.querySelectorAll('[data-proto]').forEach((n) => n.remove()); txt = c.textContent.replace(/\s+/g, ' ').trim(); }
    copyText(txt, t, 'Citation copied');
    RN.track('research_share', { source: el.dataset.src || 'report', meta: { kind: 'citation' } });
  };
  RN.actions['ins-copy-link'] = (el) => {
    const path = el.dataset.path || 'report';
    copyText(location.href.split('#')[0] + '#' + path, null, 'Link copied');
    RN.track('research_share', { source: path.split('.')[0], meta: { kind: 'link' } });
  };

  /* Sticky chapter nav: active chapter and reading progress */
  function reportScroll(root) {
    let raf = 0;
    const nav = RN.$('.ins-chapnav', root);
    const links = RN.$$('.ins-chap', root);
    let active = '';
    const update = () => {
      raf = 0;
      if (!nav || !document.body.contains(nav)) return;
      const off = (document.getElementById('hdr') || { offsetHeight: 0 }).offsetHeight + (railMode() ? 0 : nav.offsetHeight) + 40;
      let cur = CHAPTERS[0].id;
      CHAPTERS.forEach((c) => { const s = document.getElementById(c.id); if (s && s.getBoundingClientRect().top - off <= 0) cur = c.id; });
      const art = RN.$('.ins-report', root);
      const max = art ? art.offsetHeight - window.innerHeight : document.documentElement.scrollHeight - window.innerHeight;
      nav.style.setProperty('--p', RN.clamp(window.scrollY / Math.max(1, max), 0, 1).toFixed(4));
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
  // Full-time side of the calculator. variable is '' until the user types their own figure (then varCustom).
  const calc = { base: 220000, benefits: 25, variable: '', recruit: 25, months: 4 };
  let varCustom = false;
  let idxRev = undefined;
  let routeCat = null; // role permalink (#rates.<roleCategory>)
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

  /* Browse hand-off for the estimate: role category plus company revenue (both are Browse filters).
     No rate ceiling: visitors cannot see rates, and a ceiling would silently drop every operator
     without a published rate. Falls back to the role alone when fewer than 5 operators match. */
  const MIN_HANDOFF = 5;
  const count = (f) => RN.model.search({ filters: f }).length;
  function handoffFor(cat, rev) {
    const withRev = { roleCategories: [cat], revenueRange: [rev] };
    return rev && count(withRev) >= MIN_HANDOFF ? withRev : { roleCategories: [cat] };
  }
  function estHandoff() {
    const cat = catLabel(est.cat);
    const withRev = { roleCategories: [est.cat], revenueRange: [est.rev] };
    const n1 = count(withRev);
    if (n1 >= MIN_HANDOFF) return { f: withRev, label: `See ${n1} operators`, note: `Opens Browse filtered to ${cat} and ${revLabel(est.rev)} company revenue.`, n: n1 };
    const roleOnly = { roleCategories: [est.cat] };
    const n2 = count(roleOnly);
    if (n2) return { f: roleOnly, label: n2 === 1 ? 'See the operator' : `See all ${n2} operators`, note: `Opens Browse filtered to ${cat}. Fewer than ${MIN_HANDOFF} list ${revLabel(est.rev)} companies.`, n: n2 };
    return { f: {}, label: 'Browse all operators', note: `No ${cat} operators are live yet.`, n: 0 };
  }
  function estOut() {
    const g = ins.range(est.cat, est.rev, est.hours);
    const r = g.r;
    const low = sampleNote(r.n);
    const hand = estHandoff();
    const under20 = String(est.hours) === '19';
    const maxX = ins.range(est.cat, '50m_plus', est.hours).mid || 1;
    return `<span class="label">Typical Engagement Range</span>
      <div class="ins-est-big num">${esc(g.label)}</div>
      <p class="ins-est-mid">Median <b>${RN.fmt.k(g.mid)}/month</b> at ${esc(hoursLabel(est.hours))}${under20 ? ' (counted as 15 hours)' : ''} and ${hr(r.p50)}/hr.</p>
      <p class="ins-est-nofee">${icon('check-circle')}<span>${esc(NO_FEES)}</span></p>
      <div class="ins-est-scale">${rangeBar(r.p25, r.p50, r.p75, 450, { labels: true, cls: 'ins-rtrack-night' })}
        <div class="ins-est-legend tiny"><span><i class="b"></i>Middle 50% of rates (p25 to p75)</span><span><i class="m"></i>Median</span></div></div>
      <div class="ins-est-sizes"><span class="label">Median by company revenue</span>
        <ul>${F.companyRevenue.options.map((o) => { const x = ins.range(est.cat, o.v, est.hours); return `<li class="${o.v === est.rev ? 'on' : ''}"><button type="button" data-act="ins-est-size" data-v="${esc(o.v)}" aria-pressed="${o.v === est.rev}"><span>${esc(o.l)}</span><span class="ins-est-sbar"><i style="width:${((x.mid / maxX) * 100).toFixed(1)}%"></i></span><b class="num">${RN.fmt.k(x.mid)}</b></button></li>`; }).join('')}</ul></div>
      <p class="ins-est-term">Most first terms run ${esc(RN.w.label('term', '3_6').toLowerCase())} (${REP().term[1].v}% of engagements). At the median that is <b>${RN.fmt.k(r500(g.mid * 3))} - ${RN.fmt.k(r500(g.mid * 6))}</b> for the first term.</p>
      <p class="ins-est-basis small">Based on ${RN.fmt.int(r.n)} ${esc(catLabel(est.cat))} rates, adjusted for ${esc(revLabel(est.rev))} companies (×${r.m.toFixed(2)}).${low ? ` <span class="ins-low">${icon('info')}${esc(low)}</span>` : ''}</p>
      <div class="row ins-est-cta">
        <button type="button" class="btn btn-leaf" data-act="ins-browse" data-src="rates_estimator" data-f="${jsonAttr(hand.f)}">${esc(hand.label)}${icon('arrow')}</button>
        <button type="button" class="btn btn-line" data-act="ins-jump" data-to="ins-calc">Compare with full time</button>
      </div>
      <p class="tiny ins-est-hand">${esc(hand.note)}</p>`;
  }
  function idxRows() {
    const ri = RI();
    const max = 450;
    const rows = F.roleCategory.options.map((o) => ({ k: o.v, l: o.l, v: ri.byCat[o.v] })).filter((r) => r.v).sort((a, b) => (b.k === routeCat) - (a.k === routeCat) || b.v.p50 - a.v.p50);
    return `<div class="ins-raxis" aria-hidden="true"><span></span><div class="ins-raxis-t">${[0, 100, 200, 300, 400].map((t) => `<span style="left:${(t / max) * 100}%">$${t}</span>`).join('')}</div><span></span><span></span></div>
      ${rows.map((r) => {
        const x = ins.rate(r.k, idxRev);
        const low = r.v.n < MIN_CELL;
        // Hand-off by role category, plus the picked company revenue when 5+ operators match. Never a rate ceiling.
        const f = handoffFor(r.k, idxRev);
        return `<div class="ins-rrow ${routeCat === r.k ? 'on' : ''}" id="ins-rate-${esc(r.k)}" style="--cat:${F.catColor(r.k)}">
          <div class="ins-rrow-l">${RN.ui.catDot(r.k)}<span><a class="ins-rrow-name" href="#rates.${esc(r.k)}" aria-label="${esc(r.l)} rates">${esc(r.l)}</a><span class="tiny muted">n=${r.v.n}${low ? ' · directional' : ''}${routeCat === r.k ? ' · <b class="ins-pin">Pinned</b>' : ''}</span></span></div>
          <div class="ins-rrow-bar">${rangeBar(x.p25, x.p50, x.p75, max)}</div>
          <div class="ins-rrow-v"><b class="num">${hr(x.p50)}</b><span class="tiny muted">${RN.fmt.hrRange(Math.round(x.p25), Math.round(x.p75))}</span></div>
          <button type="button" class="act ins-rrow-go" data-act="ins-browse" data-src="rates_index" data-f="${jsonAttr(f)}" aria-label="See ${esc(r.l)} operators"><span class="ins-hide-s">See operators</span>${icon('chev-right')}</button>
        </div>`;
      }).join('')}`;
  }
  const idxCaption = () => (idxRev ? `Adjusted for ${revLabel(idxRev)} companies (×${ins.mult(idxRev).toFixed(2)} on the network median).` : 'Network-wide medians. Pick a company revenue range to adjust.');

  /* Fractional vs full time (founder decisions D1 and D2, Sep 25, 2026).
     Fractional side: the Rate Index median monthly cost at the estimate's hours. The rate is the price.
     Full-time side: (base x (1 + benefits) + target commission and bonus) / 12, plus the recruiting fee on
     first-year cash pay (base + variable), spread over year one. */
  // Typical target commission and bonus as a share of base, by role category (illustrative defaults)
  const VAR_PCT = { sales_leadership: 60, sellers: 100, marketing: 25, revenue_operations: 25, sales_enablement: 25, customer_success_growth: 25, partnerships: 25, ai_gtm: 15 };
  const varPct = (cat) => (VAR_PCT[cat] != null ? VAR_PCT[cat] : 25);
  const varDefault = () => Math.round((Math.max(0, +calc.base || 0) * varPct(est.cat)) / 100 / 1000) * 1000;
  const varValue = () => (varCustom && calc.variable !== '' ? Math.max(0, +calc.variable || 0) : varDefault());
  function varHelp() {
    const pct = varPct(est.cat);
    return `<span>Default: ${pct}% of base, typical for ${esc(catLabel(est.cat))}.${varCustom ? ` <button type="button" class="act" data-act="ins-calc-var-reset">Reset to ${esc(usd(varDefault()))}</button>` : ' Type your own to change it.'}</span>`;
  }
  // Keep the variable-pay default in step with the estimate's role and the base, unless the user typed their own
  function syncVar() {
    const inp = document.getElementById('ins-calc-variable');
    if (inp) inp.placeholder = varDefault(); // an empty field shows the default in use
    if (inp && !varCustom && document.activeElement !== inp) inp.value = varDefault();
    const h = RN.$('[data-ins-var-help]'); if (h) h.innerHTML = varHelp();
  }
  // Leaving the variable field empty puts the role default back in it (the breakdown already uses the default)
  function bindVar(root) {
    const v = root.querySelector('#ins-calc-variable');
    if (v) v.addEventListener('blur', () => { if (!varCustom) v.value = varDefault(); });
  }
  function calcNums() {
    const g = ins.range(est.cat, est.rev, est.hours);
    const base = Math.max(0, +calc.base || 0), b = Math.max(0, +calc.benefits || 0) / 100, fee = Math.max(0, +calc.recruit || 0) / 100;
    const variable = varValue();
    const months = RN.clamp(+calc.months || 0, 0, 12);
    const ftBase = (base * (1 + b)) / 12;
    const ftVar = variable / 12;
    const ftFee = ((base + variable) * fee) / 12;
    const ft = ftBase + ftVar + ftFee;
    const frac = g.mid;
    const fracYear = frac * 11.5; // in the seat within 2 to 3 weeks
    const ftYear = (base + variable) * fee + (ftBase + ftVar) * Math.max(0, 12 - months);
    return { g, base, b, fee, variable, months, ftBase, ftVar, ftFee, ft, frac, fracYear, ftYear };
  }
  DRAW.calc = (w) => {
    const c = calcNums();
    return bars([
      { label: `Fractional, ${hoursLabel(est.hours)}`, value: Math.round(c.frac), hi: true },
      { label: 'Full-time hire', value: Math.round(c.ft), muted: false },
    ], { fmt: (n) => RN.fmt.k(r500(n)) + '/month', label: 'Monthly cost, fractional vs full time' }, w);
  };
  function calcOut() {
    const c = calcNums();
    const diff = c.ft - c.frac;
    const share = c.ft ? Math.round((c.frac / c.ft) * 100) : 0;
    return `<div class="ins-chart" data-ins-chart="calc"></div>
      <div class="ins-calc-sum">
        <p class="body">${diff >= 0 ? `A fractional leader costs <b>${RN.fmt.k(r500(diff))}/month less</b>, about ${share}% of a full-time hire.` : `At these inputs a fractional leader costs <b>${RN.fmt.k(r500(-diff))}/month more</b> than a full-time hire.`}</p>
        <div class="stats-row" style="--cols:2">
          <div class="stat"><span class="stat-l">Next 12 months, fractional</span><span class="stat-v">${RN.fmt.k(r500(c.fracYear))}</span><span class="tiny muted">In the seat within 2 to 3 weeks</span></div>
          <div class="stat"><span class="stat-l">Next 12 months, full time</span><span class="stat-v">${RN.fmt.k(r500(c.ftYear))}</span><span class="tiny muted">${c.months ? `Seat empty for ${RN.fmt.plural(c.months, 'month')} while you hire` : 'Starts right away'}</span></div>
        </div>
        <dl class="ins-calc-break small">
          <div><dt>Base plus benefits and taxes</dt><dd>${RN.fmt.k(r500(c.ftBase))}/month</dd></div>
          <div><dt>Commission and bonus</dt><dd>${RN.fmt.k(r500(c.ftVar))}/month</dd></div>
          <div><dt>Recruiting fee, spread over year one</dt><dd>${RN.fmt.k(r500(c.ftFee))}/month</dd></div>
          <div><dt>Fractional, typical monthly rate</dt><dd>${RN.fmt.k(c.frac)}/month</dd></div>
        </dl>
        <p class="tiny muted">A fractional leader works ${esc(hoursLabel(est.hours))}. A full-time leader works about 170 hours a month. Compare the outcomes you need in those hours.</p>
      </div>`;
  }
  function calcInput(key, label, val, o) {
    return `<div class="field"><label for="ins-calc-${key}">${esc(label)}</label>
      <div class="input-affix">${o.pre ? `<span class="affix">${esc(o.pre)}</span>` : ''}<input class="input" id="ins-calc-${key}" name="${key}" type="number" inputmode="numeric" min="${o.min}" max="${o.max}" step="${o.step}" value="${esc(val)}"${o.placeholder != null ? ` placeholder="${esc(o.placeholder)}"` : ''} data-input="ins-calc"${o.helpHtml || o.help ? ` aria-describedby="ins-calc-${key}-help"` : ''}>${o.unit ? `<span class="affix">${esc(o.unit)}</span>` : ''}</div>
      ${o.helpHtml ? `<p class="help ins-calc-help" id="ins-calc-${key}-help" ${o.helpAttr || ''}>${o.helpHtml}</p>` : o.help ? `<p class="help" id="ins-calc-${key}-help">${esc(o.help)}</p>` : ''}</div>`;
  }

  /* Plain-English role names for the role permalink headline ("What fractional RevOps leaders charge") */
  const ROLE_H = { sales_leadership: 'sales leaders', marketing: 'marketing leaders', revenue_operations: 'RevOps leaders', sales_enablement: 'enablement leaders', customer_success_growth: 'customer success leaders', ai_gtm: 'AI GTM leaders', partnerships: 'partnerships leaders', sellers: 'sellers' };
  const roleH = (k) => ROLE_H[k] || catLabel(k).toLowerCase() + ' leaders';
  const ordWord = (n) => ['', 'Highest', '2nd highest', '3rd highest'][n] || `${ordinal(n)} highest`;
  /* Share a median: the role's on a permalink, the all-category median on #rates */
  function rateShare(cat) {
    const ri = RI(), tr = ri.trend, q = quarterLong(tr[tr.length - 1].l);
    if (cat && ri.byCat[cat]) {
      const c = ri.byCat[cat];
      return { title: `${catLabel(cat)} rates, Revenue Nomad Rate Index`, route: 'rates.' + cat, kind: 'rateIndex',
        quote: `The median fractional ${catLabel(cat)} rate is ${hr(c.p50)}/hr, with the middle half between ${RN.fmt.hrRange(Math.round(c.p25), Math.round(c.p75))}. Revenue Nomad Rate Index, ${q}.` };
    }
    return { title: 'The Revenue Nomad Rate Index', route: 'rates', kind: 'rateIndex',
      quote: `The all-category median for fractional GTM leaders is ${hr(tr[tr.length - 1].v)}/hr. Revenue Nomad Rate Index, ${q}.` };
  }
  /* "Add your rate" / "Add what you paid": the Q4 window, its close date and the role's n, prefilled with the
     estimator's role (the role permalink's role on #rates.<cat>). Re-rendered when the estimator's role changes. */
  const rateCx = () => (RN.store.state.persona === 'operator' ? '' : CX().cta('rates', { variant: 'card', h: 'h2', ctx: { cat: est.cat, source: routeCat ? 'rates_role' : 'rates' } }));
  /* Operators: the "See where your rate sits" band is the one contribute moment (Add it to the Q4 index), with
     Studio as the secondary link. Re-rendered by RN.contrib.refresh after a contribution. */
  CX().renderers['ins-opband'] = (ctx) => {
    const P = CX().period(), d = CX().done('rate');
    const studio = `<a class="act ins-opband-studio" href="#studio.positioning">Open Positioning in Studio${icon('arrow')}</a>`;
    if (d) return `<p class="tiny ins-opband-note">${icon('check-circle')}<span>You're in the ${esc(P.label)} Rate Index. It publishes in the first two weeks of ${esc(P.publishes)}.</span></p><button type="button" class="btn btn-leaf" data-act="cx-result" data-id="${esc(d.id)}">See where your rate sits</button>${studio}`;
    return `<p class="tiny ins-opband-note">${icon('clock')}<span>The ${esc(P.label)} window closes ${esc(P.closes)}. Published only in aggregate.</span></p><button type="button" class="btn btn-leaf" data-act="cx-open" data-kind="rate" data-ctx="${esc(JSON.stringify(ctx))}">Add it to the ${esc(P.short)} index${icon('arrow')}</button>${studio}`;
  };
  function ratesHead() {
    const ri = RI();
    const tr = ri.trend, last = tr[tr.length - 1], prev = tr[tr.length - 2], first = tr[0];
    const nTotal = Object.values(ri.byCat).reduce((a, x) => a + x.n, 0);
    const ranked = Object.keys(ri.byCat).map((k) => ({ k, v: ri.byCat[k] })).sort((a, b) => b.v.p50 - a.v.p50);
    const topCat = ranked[0], lowCat = ranked[ranked.length - 1];
    const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#insights">Insights</a>${icon('chev-right')}${routeCat ? `<a href="#rates">Rate Index</a>${icon('chev-right')}<span data-ins-crumb-cat>${esc(catLabel(routeCat))}</span>` : '<span>Rate Index</span>'}</nav>`;
    const eyebrow = `<span class="eyebrow">${routeCat ? `${esc(catLabel(routeCat))} rates` : 'Rate Index'} · As of ${esc(RN.fmt.date(asOfDate()))} · Updated quarterly</span>`;
    if (routeCat) {
      const c = ri.byCat[routeCat];
      const rank = ranked.findIndex((r) => r.k === routeCat) + 1;
      const g = ins.range(routeCat, null, '40');
      const vsAll = pctChange(c.p50, last.v);
      const n = count({ roleCategories: [routeCat] });
      return `${crumbs}
      <div class="ins-rates-top">
        <div class="ins-rates-copy">
          ${eyebrow}
          <h1 class="h1">What fractional ${esc(roleH(routeCat))} <span class="serif">charge by the hour.</span></h1>
          <p class="lede">The ${esc(catLabel(routeCat))} median and range on Revenue Nomad, adjusted for company revenue. Price the engagement below, then see who fits.</p>
          <p class="ins-rates-illus" data-proto>${illus('Illustrative figures')}</p>
        </div>
        <div class="ins-rcard night" style="--cat:${F.catColor(routeCat)}">
          <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
          <div class="ins-rcard-top"><span class="ins-rcard-k">${RN.ui.catDot(routeCat)}${esc(catLabel(routeCat))} · ${esc(last.l)}</span>${shareBtn(rateShare(routeCat))}</div>
          <div class="ins-rcard-v"><span class="num">${hr(c.p50)}</span><small>/hr median</small></div>
          <p class="ins-rcard-sub">${esc(ordWord(rank))} of ${ranked.length} role categories. ${vsAll === 0 ? 'Level with' : `${Math.abs(vsAll)}% ${vsAll > 0 ? 'above' : 'below'}`} the all-category median of ${hr(last.v)}.</p>
          <div class="ins-rcard-scale">${rangeBar(c.p25, c.p50, c.p75, 450, { labels: true, cls: 'ins-rtrack-night' })}</div>
          <div class="ins-est-legend tiny"><span><i class="b"></i>Middle 50% of rates</span><span><i class="m"></i>Median</span></div>
        </div>
      </div>
      <div class="stats-row ins-rates-kpis" style="--cols:3">
        <div class="stat"><span class="stat-l">Typical month at ${esc(hoursLabel('40'))}</span><span class="stat-v ins-stat-sm">${esc(g.label.replace(/\/month$/, ''))}</span><span class="tiny muted">${esc(revLabel('5m_20m'))} companies, the baseline</span></div>
        <div class="stat"><span class="stat-l">Rates in this category</span><span class="stat-v">${RN.fmt.int(c.n)}</span><span class="tiny muted">${c.n < MIN_CELL ? `Under ${MIN_CELL}, read as directional` : `Of ${RN.fmt.int(nTotal)} in the index`}</span></div>
        <div class="stat"><span class="stat-l">Operators on the network</span><span class="stat-v">${RN.fmt.int(n)}</span><span class="tiny muted">${esc(catLabel(routeCat))} profiles you can browse</span></div>
      </div>`;
    }
    return `${crumbs}
      <div class="ins-rates-top">
        <div class="ins-rates-copy">
          ${eyebrow}
          <h1 class="h1">What fractional GTM leaders <span class="serif">charge by the hour.</span></h1>
          <p class="lede">Medians and ranges for every role category on Revenue Nomad, adjusted for company revenue. Price an engagement before you post it, or check where your own rate sits.</p>
          <p class="ins-rates-illus" data-proto>${illus('Illustrative figures')}</p>
        </div>
        <div class="ins-rcard night">
          <span class="ins-rings" aria-hidden="true"><i></i><i></i></span>
          <div class="ins-rcard-top"><span class="ins-rcard-k">All-category median · ${esc(last.l)}</span>${shareBtn(rateShare(null))}</div>
          <div class="ins-rcard-v"><span class="num">${hr(last.v)}</span><small>/hr</small></div>
          <p class="ins-rcard-sub">${RN.ui.delta(last.v, prev.v)} vs ${esc(prev.l)}, and +${pctChange(last.v, first.v)}% since ${esc(first.l)}.</p>
          <div class="ins-ri-cols ins-rcard-cols" role="img" aria-label="All-category median by quarter, ${esc(first.l)} ${hr(first.v)} to ${esc(last.l)} ${hr(last.v)}">${tr.map((t, i) => `<span class="${i === tr.length - 1 ? 'on' : ''}" style="--h:${Math.round(((t.v - first.v * 0.8) / (last.v - first.v * 0.8)) * 100)}%"><b>${hr(t.v)}</b><i></i><em>${esc(t.l)}</em></span>`).join('')}</div>
        </div>
      </div>
      <div class="stats-row ins-rates-kpis" style="--cols:3">
        <div class="stat"><span class="stat-l">Rates in the index</span><span class="stat-v">${RN.fmt.int(nTotal)}</span><span class="tiny muted">Across ${F.roleCategory.options.length} role categories</span></div>
        <div class="stat"><span class="stat-l">Highest median</span><span class="stat-v">${hr(topCat.v.p50)}<small class="ins-unit">/hr</small></span><span class="tiny muted">${esc(catLabel(topCat.k))}</span></div>
        <div class="stat"><span class="stat-l">Lowest median</span><span class="stat-v">${hr(lowCat.v.p50)}<small class="ins-unit">/hr</small></span><span class="tiny muted">${esc(catLabel(lowCat.k))}</span></div>
      </div>`;
  }

  function rates() {
    estDefaults();
    const ri = RI();
    const me = opMe();
    const pos = me ? RN.model.positioning(me.id) : null;
    const lowCats = Object.keys(ri.byCat).filter((k) => ri.byCat[k].n < MIN_CELL);

    return `<div class="ins-rates">
    <header class="wrap phead ins-rates-hd" data-ins-rhead>${ratesHead()}</header>

    <section class="wrap ins-est" id="ins-est">
      <div class="ins-est-in">
        <form class="ins-est-form stack" style="--gap:22px" data-submit="ins-est-noop" aria-label="Rate estimator">
          <div><span class="eyebrow">Estimator</span><h2 class="h3" style="margin-top:8px">What will this engagement cost?</h2></div>
          ${RN.w.field('roleCategory', est.cat, { name: 'ins-est-cat', id: 'ins-est-cat', change: 'ins-est', help: 'The discipline you need to lead the work.' })}
          ${RN.w.field('companyRevenue', est.rev, { name: 'ins-est-rev', id: 'ins-est-rev', change: 'ins-est' })}
          ${RN.w.field('hoursPerMonth', est.hours, { name: 'ins-est-hours', id: 'ins-est-hours', change: 'ins-est', help: `Hours a month you want from the operator. ${hoursLabel('19')} is counted as 15.` })}
        </form>
        <div class="ins-est-out night" id="ins-est-out" aria-live="polite">${estOut()}</div>
      </div>
    </section>

    <section class="wrap ins-idx" id="ins-idx">
      <div class="ins-sec-hd"><div><span class="eyebrow">The index</span><h2 class="h2">Hourly rates by role category</h2></div>${routeCat ? `<span class="pill pill-accent" data-ins-pin-note>${esc(catLabel(routeCat))} is pinned to the top</span>` : ''}</div>
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
      <div class="ins-rates-ref">
        <div class="ins-rates-ref-a">
        <div class="ins-rcx" data-ins-rcx>${rateCx()}</div>
        <details class="card ins-how" id="ins-rates-method">
          <summary><h2 class="h4">How the Rate Index works</h2><span class="tiny muted">Sources, ranges and the company revenue multipliers</span>${icon('chev-down')}</summary>
          <ul class="ins-how-list">
            <li><b>Sources.</b> Hourly rates operators list on their profiles (claimed), rates from company-verified engagements (verified), and the State of Fractional GTM survey (survey).</li>
            <li><b>Median and range.</b> The median is the middle rate. The range covers the middle half of rates, from the 25th to the 75th percentile.</li>
            <li><b>Company revenue.</b> Larger companies pay more for the same role. We adjust with one multiplier per revenue range.</li>
            <li><b>The rate is the price.</b> The index shows the hourly rates operators list. That is what a company pays.</li>
            <li><b>Sample size.</b> We show n for every category. Under ${MIN_CELL} rates, read the number as directional.</li>
            <li><b>Contributions.</b> Each quarter operators add rates they charge and companies add what they paid. Published only in aggregate, never individually, and a figure publishes only from 5 responses per group. The ${esc(CX().period().label)} window closes ${esc(CX().period().closes)}.</li>
          </ul>
          <div class="tbl-wrap"><table class="tbl ins-tbl ins-mult"><thead><tr><th>${esc(F.companyRevenue.label)}</th><th class="r">Multiplier</th></tr></thead><tbody>
            ${F.companyRevenue.options.map((o) => `<tr class="${o.v === '5m_20m' ? 'ins-tr-hi' : ''}"><td>${esc(o.l)}${o.v === '5m_20m' ? ' <span class="tiny muted">baseline</span>' : ''}</td><td class="r num">×${ins.mult(o.v).toFixed(2)}</td></tr>`).join('')}
          </tbody></table></div>
          <button type="button" class="act ins-how-more" data-act="ins-report-ch" data-ch="ins-method">Survey methodology in the 2027 report${icon('arrow')}</button>
        </details>
        </div>
        ${citeBlock({ id: 'ins-rcite', label: 'Cite the Rate Index', text: rateCitation(), src: 'rates', attr: 'data-ins-rcite',
          link: `<button type="button" class="btn btn-line btn-sm" data-act="ins-copy-link" data-path="${routeCat ? 'rates.' + esc(routeCat) : 'rates'}">${icon('link')}Copy link</button>`,
          note: 'This shows how the published Rate Index will be cited. The figures in this prototype are illustrative.' })}
      </div>
    </section>

    <section class="wrap ins-calc" id="ins-calc">
      <div class="ins-sec-hd"><div><span class="eyebrow">Calculator</span><h2 class="h2">Fractional or full time? Compare the monthly cost.</h2></div></div>
      <div class="card ins-calc-card">
        <div class="ins-calc-in">
          <p class="small muted ins-calc-uses">${icon('sliders')}<span>Fractional side uses your estimate: <b data-ins-calc-uses>${esc(catLabel(est.cat))}, ${esc(revLabel(est.rev))}, ${esc(hoursLabel(est.hours))}</b>. <button type="button" class="act" data-act="ins-jump" data-to="ins-est">Change</button></span></p>
          ${calcInput('base', 'Full-time base salary', calc.base, { pre: '$', min: 50000, max: 1000000, step: 5000, help: 'Base salary only. Commission and bonus go in the next field.' })}
          ${calcInput('variable', 'Target commission and bonus (annual)', varCustom ? calc.variable : varDefault(), { pre: '$', min: 0, max: 2000000, step: 5000, placeholder: varDefault(), helpHtml: varHelp(), helpAttr: 'data-ins-var-help' })}
          <div class="ins-calc-pair">
            ${calcInput('benefits', 'Benefits and payroll taxes', calc.benefits, { unit: '%', min: 0, max: 60, step: 1 })}
            ${calcInput('recruit', 'Recruiting fee, % of first-year cash pay', calc.recruit, { unit: '%', min: 0, max: 40, step: 1 })}
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
            ? `Your rate of <b>${hr(pos.rate)}/hr</b> is at about the ${esc(ordinal(pos.pctile))} percentile for ${esc(catLabel(pos.op.catKey))}. Studio shows how that compares with the operators companies shortlisted.`
            : 'Studio compares your rate with the Rate Index for your role category and shows which focus areas companies searched for. Your rate stays on your profile; the index only uses it in aggregate.'}</p>
        </div>
        ${pos && pos.rate ? `<div class="ins-opband-bar"><div class="ins-opband-track"><span class="ins-you-mark" style="left:${RN.clamp((pos.rate / 450) * 100, 0, 100).toFixed(1)}%">You ${hr(pos.rate)}</span>${rangeBar(pos.idx.p25, pos.idx.p50, pos.idx.p75, 450, { cls: 'ins-rtrack-night' })}</div>
          <p class="tiny ins-opband-cap">${esc(catLabel(pos.op.catKey))} median ${hr(pos.idx.p50)}/hr · middle 50% ${RN.fmt.hrRange(Math.round(pos.idx.p25), Math.round(pos.idx.p75))}</p></div>` : ''}
        ${RN.store.state.persona === 'operator' && me
          ? `<div class="ins-opband-acts" data-cx-r="ins-opband" data-ctx="${esc(JSON.stringify({ cat: me.catKey, source: 'rates_band' }))}">${CX().renderers['ins-opband']({ cat: me.catKey, source: 'rates_band' })}</div>`
          : `<a class="btn btn-leaf" href="#studio.positioning">Open Positioning in Studio${icon('arrow')}</a>`}
      </div>
    </section>
    <script type="application/ld+json">${JSON.stringify(rateSchema()).replace(/</g, '\\u003c')}</script>
    </div>`;
  }

  /* Citation and schema.org Dataset for the Rate Index (AEO: "how much does a fractional X cost").
     On a role permalink (#rates.<roleCategory>) both name the role. */
  const quarterLong = (l) => String(l || '').replace(/^Q(\d) (\d\d)$/, 'Q$1 20$2');
  // One public URL form, the same one the share sheet uses (RN.share.url)
  const rateUrl = () => RN.share.url(routeCat ? 'rates.' + routeCat : 'rates');
  function rateCitation() {
    const tr = RI().trend, q = quarterLong(tr[tr.length - 1].l);
    const role = routeCat ? `: ${catLabel(routeCat)}` : '';
    return `Revenue Nomad Research. (${asOfDate().getFullYear()}). Revenue Nomad Rate Index${role}, ${q} [Prototype edition, illustrative figures]. Median and p25 to p75 hourly rates for fractional go-to-market leaders by role category and company revenue range. As of ${longDate(asOfDate())}. ${rateUrl()}`;
  }
  function rateSchema() {
    const d = asOfDate();
    const qStart = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return {
      '@context': 'https://schema.org', '@type': 'Dataset',
      name: 'Revenue Nomad Rate Index' + (routeCat ? `: ${catLabel(routeCat)}` : ''),
      description: 'Median and p25 to p75 hourly rates for fractional go-to-market leaders, by role category and company revenue range. Updated quarterly. Figures in this edition are illustrative.',
      url: rateUrl(),
      creator: { '@type': 'Organization', name: 'Revenue Nomad', url: RN.share.url('home') },
      temporalCoverage: `${iso(qStart)}/${iso(d)}`,
      dateModified: iso(d),
      variableMeasured: 'Median hourly rate by role category and company revenue range',
      measurementTechnique: 'Hourly rates operators list on their profiles (claimed), rates from company-verified engagements (verified), and the State of Fractional GTM survey (survey)',
      isAccessibleForFree: true,
    };
  }


  RN.submits['ins-est-noop'] = () => {};
  let estTrack = null;
  RN.inputs['ins-est'] = (el) => {
    const k = { 'ins-est-cat': 'cat', 'ins-est-rev': 'rev', 'ins-est-hours': 'hours' }[el.name];
    if (!k || !el.value) return;
    est[k] = el.value;
    // On a role permalink, the page follows the estimator's role: URL, crumb, highlighted row and citation
    if (k === 'cat' && routeCat && routeCat !== est.cat) {
      routeCat = est.cat;
      try { history.replaceState(null, '', '#rates.' + est.cat); } catch (e) { /* file:// in some browsers */ }
      document.title = `${catLabel(est.cat)} rates · Rate Index · Revenue Nomad`;
      const hd = RN.$('[data-ins-rhead]'); if (hd) hd.innerHTML = ratesHead();
      const pn = RN.$('[data-ins-pin-note]'); if (pn) pn.textContent = `${catLabel(est.cat)} is pinned to the top`;
      const box = RN.$('[data-ins-idx]'); if (box) box.innerHTML = idxRows();
      const ct = RN.$('[data-ins-rcite]'); if (ct) ct.innerHTML = citeHtml(rateCitation());
    }
    if (k === 'cat') { const rcx = RN.$('[data-ins-rcx]'); if (rcx) rcx.innerHTML = rateCx(); }
    const out = document.getElementById('ins-est-out'); if (out) out.innerHTML = estOut();
    const uses = RN.$('[data-ins-calc-uses]'); if (uses) uses.textContent = `${catLabel(est.cat)}, ${revLabel(est.rev)}, ${hoursLabel(est.hours)}`;
    syncVar();
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
    // Typing a commission and bonus figure keeps it; clearing the field goes back to the role default
    if (el.name === 'variable') varCustom = v !== '';
    syncVar();
    const co = document.getElementById('ins-calc-out'); if (co) { co.innerHTML = calcOut(); drawAll(co); }
  };
  RN.actions['ins-calc-var-reset'] = () => {
    varCustom = false; calc.variable = '';
    const inp = document.getElementById('ins-calc-variable'); if (inp) inp.value = varDefault();
    syncVar();
    const co = document.getElementById('ins-calc-out'); if (co) { co.innerHTML = calcOut(); drawAll(co); }
  };

  RN.view('rates', {
    route: 'rates', nav: 'insights',
    title: () => 'Rate Index',
    render: () => { routeCat = null; return rates(); },
    mount: (root) => { lifecycle(root); bindVar(root); },
    unmount,
  });
  /* Role permalink (#rates.revenue_operations): the estimator opens on that role and the row is marked */
  const rateCat = (c) => (F.roleCategory.options.some((o) => o.v === c) && RI().byCat[c] ? c : null);
  RN.view('rates-role', {
    route: 'rates.:cat', nav: 'insights',
    samples: { cat: 'revenue_operations' },
    title: (p) => (rateCat(p.cat) ? `${catLabel(p.cat)} rates · Rate Index` : 'Rate Index'),
    render: (p) => {
      routeCat = rateCat(p.cat);
      if (routeCat) { estDefaults(); est.cat = routeCat; }
      return rates();
    },
    mount: (root) => { lifecycle(root); bindVar(root); },
    unmount,
  });
})();
