/* Home (#home): the destination for fractional GTM.
   One bold moment (the photo hero with search), then calm, ruled sections that each open a deeper
   surface: Browse (search, role chips, focus areas, problems), profiles (featured operators),
   the GTM Framework, the Rate Index and Insights (market pulse), the 2027 report, Studio (for
   operators) and Talk to us.

   Loops wired here:
   - Hero search, role chips, problems and trending searches write RN.store.state.browse
     ({q, tags, filters:{roleCategories}}) with standard slugs, then route to #browse or #browse.<slug>.
   - Hero search and trending clicks log RN.track('search', {q, tags, filters, results, source}).
   - Featured cards log one 'impression' each per visit (source 'home') and mark the next
     profile_view source as 'home' (RN.store.state._viewSource).
   - The network strip reads intros, projects, review requests, reviews and pending applications
     from the store, plus labelled illustrative items. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;

  /* ---------- Module state (kept across re-renders of the same visit) ---------- */
  const S = { q: '', tags: [], played: false, impressed: false, timers: [], offs: [], raf: 0 };
  const PH = 'Search a role, focus area or industry';
  const TYPE_WORDS = ['VP of Sales', 'RevOps', 'Demand Generation', 'Outbound Motion Build', 'Partnerships', 'HubSpot'];

  // GTM Framework area definitions (Operator Profile Explorer AXIS_DEF, verbatim)
  const AREA_DEF = {
    'Lead & plan': 'Strategy, positioning, org design, planning and interim leadership: work that sets direction for every stage.',
    'Build the team': 'Hiring, onboarding, coaching, comp and methodology: work that makes the people in every stage better.',
    'Generate demand': 'Pipeline creation: demand gen, ABM, outbound, content and partner-sourced opportunities.',
    'Win deals': 'Turning pipeline into revenue: sales process, discovery, deal execution, pricing and forecasting.',
    'Retain & expand': 'Keeping and growing customers: onboarding, adoption, renewals, expansion and advocacy.',
    'Systems & data': 'CRM, reporting, routing, tech stack and automation: the plumbing every stage runs on.',
  };

  /* ---------- Helpers ---------- */
  const calm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.webdriver; } catch (e) { return true; } };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); S.timers.push(t); return t; };
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); S.offs.push(() => target.removeEventListener(type, fn, opts)); };
  function teardown() {
    S.timers.forEach(clearTimeout); S.timers = [];
    S.offs.forEach((off) => off()); S.offs = [];
    if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0;
  }
  const liveOps = () => RN.model.ops.filter((o) => !o.hidden);
  const opsIn = (cats) => liveOps().filter((o) => cats.includes(o.catKey)).length;
  const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  const catLabel = (c) => RN.fields.catLabel(c);
  const more = (label, attrs) => `<a class="hm-more" ${attrs}>${esc(label)}${icon('arrow')}</a>`;
  const head = (eyebrow, title, right, sub) => `<header class="hm-head">
      <div class="hm-head-l"><span class="eyebrow">${esc(eyebrow)}</span><h2 class="hm-h2">${title}</h2>${sub ? `<p class="lede hm-head-sub">${esc(sub)}</p>` : ''}</div>
      ${right ? `<div class="hm-head-r">${right}</div>` : ''}
    </header>`;

  /* Write the Browse state with standard slugs, then route. From home every entry starts fresh. */
  function toBrowse(patch, route) {
    RN.store.update((s) => {
      const prev = s.browse || {};
      s.browse = Object.assign({ q: '', tags: [], filters: {}, sort: 'best', view: prev.view || 'grid' }, patch);
    }, 'browse');
    RN.go(route || 'browse');
  }

  function featured() {
    // Founder's curation order (L466): photo, then Reputation Index, video, reviews, engagements, completeness
    return liveOps().filter((o) => o.photo)
      .sort((a, b) => b.ris.score - a.ris.score || (b.video ? 1 : 0) - (a.video ? 1 : 0) || b.reviews.length - a.reviews.length || b.engagements.length - a.engagements.length || b.completeness - a.completeness)
      .slice(0, 6);
  }

  function guessCat(q) {
    const terms = RN.model.expand(q || '');
    const o = RN.fields.roleCategory.options.find((x) => terms.includes(x.l.toLowerCase()));
    return o ? o.v : '';
  }

  /* ---------- Hero ---------- */
  function selHtml() {
    return `<span class="label">Focus areas</span>
      ${S.tags.map((t) => `<button type="button" class="chip chip-sm on" data-act="hm-tag-x" data-t="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)}<span class="x">${icon('x')}</span></button>`).join('')}
      <button type="button" class="act hm-sel-clear" data-act="hm-tags-clear">Clear</button>`;
  }

  function hero(anim) {
    const n = liveOps().length;
    const cats = RN.fields.roleCategory.options;
    return `<section class="hm-hero night ${anim ? 'hm-anim' : ''}" aria-labelledby="hm-h1">
      <img class="hm-hero-img" src="assets/brand/hero-highfive.webp" alt="" fetchpriority="high">
      <div class="hm-hero-shade" aria-hidden="true"></div>
      <div class="wrap hm-hero-grid">
        <div class="hm-hero-main">
          <p class="hm-kicker">Scale with proven experts</p>
          <h1 class="h-hero hm-h1" id="hm-h1">
            <span class="hm-ln"><span>Meet the operators</span></span>
            <span class="hm-ln"><span>who already solved</span></span>
            <span class="hm-ln"><span class="serif">your revenue problem.</span></span>
          </h1>
          <p class="hm-sub">Vetted fractional sales, marketing, RevOps and AI GTM leaders. Open profiles, client-verified proof of work, no login to browse.</p>
          <form class="hm-search" data-submit="hm-search" role="search" aria-label="Search operators">
            <label class="hm-search-f">${icon('search')}<span class="sr-only">Search operators</span>
              <input id="hm-q" name="q" type="search" autocomplete="off" enterkeyhint="search" value="${esc(S.q)}" placeholder="${esc(PH)}" data-input="hm-q"></label>
            <div class="hm-search-acts">
              <button type="button" class="hm-fa" data-act="hm-tags-open" aria-haspopup="dialog">${icon('plus')}<span>Focus areas</span><b class="hm-fa-n" ${S.tags.length ? '' : 'hidden'}>${S.tags.length}</b></button>
              <button type="submit" class="btn btn-lg hm-go-btn">Browse operators</button>
            </div>
          </form>
          <div class="hm-sel" ${S.tags.length ? '' : 'hidden'}>${selHtml()}</div>
          <div class="hm-cats">
            <span class="label">Or browse by role</span>
            <div class="hm-cats-row">${cats.map((o) => `<a class="chip" href="#browse.${esc(o.v)}" data-act="hm-cat" data-cat="${esc(o.v)}">${esc(o.l)}<span class="hm-cat-n">${opsIn([o.v])}</span></a>`).join('')}</div>
          </div>
        </div>
        <dl class="hm-stats">
          <div><dt>Vetted operators on the network</dt><dd class="num">${esc(RN.data.market.network.operators)}</dd></div>
          <div><dt>GTM disciplines</dt><dd class="num" data-count="${cats.length}">${cats.length}</dd></div>
          <div><dt>Login to browse</dt><dd class="num">None</dd></div>
        </dl>
      </div>
    </section>`;
  }

  /* ---------- Live network strip (store activity + labelled illustrative items) ---------- */
  function networkItems() {
    const st = RN.store.state;
    const role = (opId) => { const op = RN.model.byId(opId); return op ? 'Fractional ' + op.role : 'A fractional operator'; };
    const co = (c) => { const ind = c && c.industry ? RN.w.label('industries', c.industry) : ''; return ind ? `${an(ind)} ${ind} company` : 'a company'; };
    const out = [];
    (st.intros || []).forEach((i) => {
      if (i.status === 'declined') return;
      const c = (i.buyer && i.buyer.company) || {};
      const last = (i.thread && i.thread.length ? i.thread[i.thread.length - 1].ts : i.createdAt) || i.createdAt;
      if (i.status === 'hired') out.push({ ts: last, text: `${role(i.opId)} hired by ${co(c)}`, meta: RN.fmt.ago(last) });
      else if (i.status === 'introduced') out.push({ ts: last, text: `${role(i.opId)} introduced to ${co(c)}`, meta: RN.fmt.ago(last) });
      else out.push({ ts: i.createdAt, text: `${role(i.opId)} requested by ${co(c)}`, meta: RN.fmt.ago(i.createdAt) });
    });
    (st.projects || []).filter((p) => p.status !== 'draft' && p.postedAt).forEach((p) => {
      const f = p.fields || {};
      out.push({ ts: p.postedAt, text: `${co({ industry: (f.industries || [])[0] }).replace(/^./, (x) => x.toUpperCase())} posted a ${RN.fields.catLabel(f.roleCategory || '') || 'fractional'} project`, meta: RN.fmt.ago(p.postedAt) });
    });
    const done = (st.reviewRequests || []).filter((r) => r.status === 'completed');
    done.forEach((r) => out.push({ ts: r.completedAt, text: `${role(r.opId)} received a new client review`, meta: RN.fmt.ago(r.completedAt) }));
    (st.reviews || []).filter((rv) => rv && rv.opId && !done.some((r) => r.id === rv.requestId)).forEach((rv) => {
      const ts = rv.ts || rv.date || rv.createdAt || RN.now().toISOString();
      out.push({ ts, text: `${role(rv.opId)} received a new client review`, meta: RN.fmt.ago(ts) });
    });
    (st.pending || []).forEach((a) => { const p = a.profile || {}; if (p.role) out.push({ ts: a.submittedAt, text: `Fractional ${p.role} applied to join the network`, meta: RN.fmt.ago(a.submittedAt) }); });
    out.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const live = out.slice(0, 8);
    const d = (n) => RN.fmt.dateShort(RN.daysAgo(n));
    const sample = [
      { text: 'Fractional VP of Sales matched with a physical therapy marketing agency', meta: 'started ' + d(10), illus: true },
      { text: 'Fractional Sales Manager now leading an 8-rep team', meta: 'started ' + d(16), illus: true },
      { text: 'Fractional Chief Marketing Officer shortlisted by a $50M+ govtech SaaS company', meta: 'shortlist in progress', illus: true },
      { text: 'Fractional RevOps Manager matched with a $5M–$20M SaaS company', meta: 'started ' + d(21), illus: true },
    ];
    // Interleave so live activity leads and samples never cluster
    const mixed = [];
    for (let i = 0; i < Math.max(live.length, sample.length); i++) { if (live[i]) mixed.push(live[i]); if (sample[i] && (i % 2 === 1 || !live[i])) mixed.push(sample[i]); }
    sample.forEach((s) => { if (!mixed.includes(s)) mixed.push(s); });
    return mixed;
  }
  function strip() {
    const items = networkItems();
    const row = (hidden) => `<ul class="hm-strip-list" ${hidden ? 'aria-hidden="true"' : ''}>${items.map((it) => `<li class="hm-tick"><span>${esc(it.text)}</span><small>${esc(it.meta)}</small>${it.illus ? '<em class="hm-illus">Illustrative</em>' : ''}</li>`).join('')}</ul>`;
    return `<section class="hm-strip" aria-label="Recent activity on the network">
      <span class="hm-strip-tag"><i class="hm-live" aria-hidden="true"></i><span class="hide-sm">Live on the network</span><span class="show-sm">Live</span></span>
      <div class="hm-strip-view"><div class="hm-strip-track">${row(false)}${row(true)}</div></div>
    </section>`;
  }

  /* ---------- Start from the problem ---------- */
  function problems() {
    const needs = RN.fields.need.options;
    const cells = needs.map((o, i) => {
      const cats = RN.fields.needCats[o.v] || [];
      const num = String(i + 1).padStart(2, '0');
      if (!cats.length) {
        return `<button type="button" class="hm-need hm-need-talk" data-act="hm-need" data-need="${esc(o.v)}">
          <span class="hm-num">${num}</span><span class="hm-go">${icon('arrow')}</span>
          <span class="hm-need-body"><span class="hm-need-t">${esc(o.l)}</span><span class="hm-need-cats">Talk it through with a person first</span></span>
          <span class="hm-need-n">Reply within one business day</span>
        </button>`;
      }
      return `<button type="button" class="hm-need" data-act="hm-need" data-need="${esc(o.v)}">
        <span class="hm-num">${num}</span><span class="hm-go">${icon('arrow')}</span>
        <span class="hm-need-body"><span class="hm-need-t">${esc(o.l)}</span>
          <span class="hm-need-cats">${cats.map((c) => `<span>${RN.ui.catDot(c)}${esc(catLabel(c))}</span>`).join('')}</span></span>
        <span class="hm-need-n">${RN.fmt.plural(opsIn(cats), 'operator')}</span>
      </button>`;
    }).join('');
    return `<section class="hm-sec">
      <div class="wrap">
        ${head('Start here', 'Start from the problem <span class="serif">you have.</span>', '', 'Pick what is broken. Browse opens on the role categories that fix it, with every operator who does that work.')}
        <div class="hm-ruled hm-needs">${cells}</div>
      </div>
    </section>`;
  }

  /* ---------- Featured operators ---------- */
  function featuredSec() {
    const ops = featured();
    const n = liveOps().length;
    return `<section class="hm-sec hm-band">
      <div class="wrap">
        ${head('Featured operators', 'See exactly who you would work with, <span class="serif">before you talk to anyone.</span>', more(`View all ${n} operators`, 'href="#browse" data-act="hm-all"'))}
        <div class="hm-ops">${ops.map((op) => RN.ui.opCard(op)).join('')}</div>
        <p class="hm-note small">${icon('seal')}<span>Featured by Reputation Index ${RN.ui.tip(RN.ui.risExplainer(), 'How the Reputation Index is calculated')}, then client reviews and engagement history. Placement is never paid. <a class="link" href="#levels">How levels work</a></span></p>
      </div>
    </section>`;
  }

  /* ---------- GTM Framework teaser ---------- */
  function frameworkSec() {
    const fw = RN.data.framework || { axes: [], stages: [] };
    const stages = (fw.stages || []).map((s) => s.name);
    const lib = RN.fields.fitTags.options;
    const ops = liveOps();
    const tiles = (fw.axes || []).map((axis, i) => {
      const tags = lib.filter((t) => t.axis === axis);
      // 'foundation' focus areas support every stage (explorer bowtie), so they count toward all seven
      const base = tags.filter((t) => t.stage === 'foundation').length;
      const per = stages.map((st) => tags.filter((t) => t.stage === st).length + base);
      const max = Math.max(1, ...per);
      const nOps = ops.filter((o) => o.tags.some((t) => t.axis === axis)).length;
      const where = base && per.every((c) => c === base) ? 'every stage' : stages.filter((st, k) => per[k] > 0).join(', ');
      return `<a class="hm-area" href="#framework">
        <span class="hm-num">${String(i + 1).padStart(2, '0')}</span><span class="hm-go">${icon('arrow')}</span>
        <span class="hm-area-body"><span class="hm-area-t">${esc(axis)}</span><span class="hm-area-d">${esc(AREA_DEF[axis] || '')}</span></span>
        <span class="hm-stages" role="img" aria-label="${esc(axis)} focus areas sit in: ${esc(where || 'no stage yet')}">${per.map((c, k) => `<i title="${esc(stages[k])}: ${c}"><b style="opacity:${c ? (0.28 + 0.72 * (c / max)).toFixed(2) : 0}"></b></i>`).join('')}</span>
        <span class="hm-area-meta">${RN.fmt.plural(tags.length, 'focus area')} · ${RN.fmt.plural(nOps, 'operator')}</span>
      </a>`;
    }).join('');
    return `<section class="hm-sec">
      <div class="wrap hm-fw">
        <div class="hm-fw-intro">
          <span class="eyebrow">The GTM Framework</span>
          <h2 class="hm-h2">One shared map of <span class="serif">go-to-market work.</span></h2>
          <p class="lede">Every focus area on Revenue Nomad maps to an area of go-to-market work and the stage of the client journey it moves. Operators are scored against it. Companies use it to find the gap.</p>
          <dl class="hm-fw-stats"><div><dt class="num">${(fw.axes || []).length}</dt><dd>Areas</dd></div><div><dt class="num">${stages.length}</dt><dd>Journey stages</dd></div><div><dt class="num">${lib.length}</dt><dd>Focus areas</dd></div></dl>
          ${more('Explore the framework', 'href="#framework"')}
        </div>
        <div>
          <div class="hm-ruled hm-areas">${tiles}</div>
          <p class="hm-legend tiny"><span class="hm-stages hm-stages-key" aria-hidden="true">${stages.map(() => '<i><b style="opacity:.6"></b></i>').join('')}</span><span>Bars show where each area's focus areas sit across the client journey: ${esc(stages.join(', '))}. Foundation areas support every stage.</span></p>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Market pulse ---------- */
  function topSearches() {
    const Q = RN.data.market.queries.filter((q) => !q.zero).map((q) => ({ q: q.q, n: q.vol }));
    const week = RN.daysAgo(7);
    (RN.store.state.events || []).filter((e) => e.type === 'search' && e.q && new Date(e.ts) >= week).forEach((e) => {
      const x = Q.find((q) => q.q.toLowerCase() === e.q.toLowerCase());
      if (x) x.n += 1; else Q.push({ q: e.q, n: 1, live: true });
    });
    return Q.sort((a, b) => b.n - a.n).slice(0, 5);
  }
  // Monthly range in the "Typical Engagement Range" format (L58): "$8,800 - $13,600/mo"
  function typical() {
    const byCat = RN.data.market.rateIndex.byCat;
    const cat = Object.keys(byCat).sort((a, b) => byCat[b].n - byCat[a].n)[0];
    const r = byCat[cat];
    const hrs = 40;
    const ft = (RN.data.market.report.fracVsFull || [])[1];
    return `<dl class="hm-typ">
      <div><dt>${esc(catLabel(cat))} at ${esc(RN.w.label('hoursPerMonth', String(hrs)))}</dt><dd class="num">${esc(RN.fmt.usd(r.p25 * hrs))} - ${esc(RN.fmt.usd(r.p75 * hrs))}<small>/mo</small></dd></div>
      ${ft ? `<div><dt>Full-time VP of Sales, fully loaded</dt><dd class="num">${esc(ft[1])}<small>/mo</small></dd></div>` : ''}
    </dl>`;
  }
  function pulseSec() {
    const mk = RN.data.market;
    const trend = mk.rateIndex.trend;
    const cur = trend[trend.length - 1], first = trend[0];
    const di = mk.report.demandIndex;
    const diCur = di.find((x) => x.l === '2026') || di[di.length - 2];
    const diPrev = di.find((x) => x.l === '2025') || di[di.length - 3];
    const top = topSearches();
    const maxN = Math.max(...top.map((t) => t.n), 1);
    return `<section class="hm-sec hm-band">
      <div class="wrap">
        ${head('Market pulse', 'This week in <span class="serif">fractional GTM.</span>', `<span class="pill pill-gold">${icon('info')}Illustrative data</span>${more('All insights', 'href="#insights"')}`)}
        <div class="hm-pulse">
          <article class="card hm-card hm-rate">
            <div class="hm-card-hd">
              <div><h3 class="h4">Median hourly rate by role</h3><p class="small muted">Rate Index, ${esc(cur.l.replace(' ', ' 20'))}. Select a role to browse its operators.</p></div>
              <div class="hm-kpi"><span class="num">${esc(RN.fmt.usd(cur.v))}</span><span class="small muted">all roles ${RN.ui.delta(cur.v, first.v)}</span></div>
            </div>
            <div class="hm-bars" data-hm-chart="rates"></div>
            ${typical()}
            <div class="hm-card-ft">${more('Open the Rate Index', 'href="#rates"')}<span class="small muted">p25 to p75 by role and company revenue</span></div>
          </article>
          <div class="hm-pulse-side">
            <article class="card hm-card">
              <div class="hm-card-hd">
                <div><h3 class="h4">Demand Index</h3><p class="small muted">Fractional GTM hiring demand, 2023 = 100</p></div>
                <div class="hm-kpi"><span class="num">${esc(diCur.v)}</span><span class="small muted">${RN.ui.delta(diCur.v, diPrev.v)} vs ${esc(diPrev.l)}</span></div>
              </div>
              <div class="hm-spark" data-hm-chart="demand"></div>
              <div class="hm-axis tiny"><span>${esc(di[0].l)}</span><span>${esc(di[di.length - 1].l.replace('proj', 'projected'))}</span></div>
            </article>
            <article class="card hm-card">
              <div class="hm-card-hd"><div><h3 class="h4">Top searched this week</h3><p class="small muted">Searches by clients in the last 7 days. Select one to run it.</p></div></div>
              <ol class="hm-top">${top.map((t, i) => `<li><button type="button" data-act="hm-q" data-q="${esc(t.q)}">
                <span class="hm-top-i">${i + 1}</span>
                <span class="hm-top-b"><span class="hm-top-q">${esc(t.q)}</span><span class="hm-top-m"><i style="width:${Math.max(4, Math.round((t.n / maxN) * 100))}%"></i></span></span>
                <span class="hm-top-v tnum">${RN.fmt.int(t.n)}</span></button></li>`).join('')}</ol>
            </article>
          </div>
        </div>
      </div>
    </section>`;
  }

  /* ---------- State of Fractional GTM 2027 teaser ---------- */
  function reportSec() {
    const r = RN.data.market.report;
    const picks = [r.summary[0], r.summary[2], r.summary[3]].filter(Boolean);
    return `<section class="hm-sec hm-report">
      <div class="wrap hm-rep">
        <a class="hm-book" href="#report" aria-label="Read ${esc(r.title)} ${esc(r.year)}">
          <span class="hm-book-sheet" aria-hidden="true"></span>
          <span class="hm-book-cover">
            <span class="hm-book-k">Revenue Nomad Research</span>
            <span class="hm-book-y">${esc(r.year)}</span>
            <span class="hm-book-t">${esc(r.title)}</span>
            <span class="hm-book-m">${esc(r.sample.operators)} operators · ${esc(r.sample.companies)} companies surveyed</span>
          </span>
        </a>
        <div class="hm-rep-txt">
          <span class="eyebrow">New research · Free to read</span>
          <h2 class="hm-h2">${esc(r.title)} ${esc(r.year)}. <span class="serif">Where GTM leadership is going.</span></h2>
          <p class="lede">${esc(String(r.lede).split('. ')[0].replace(/\.$/, ''))}. Read it on the web, chapter by chapter. Every chart opens the matching operators in Browse.</p>
          <dl class="hm-rep-stats">${picks.map((s) => `<div><dt class="num">${esc(s.v)}</dt><dd>${esc(s.l)}</dd></div>`).join('')}</dl>
          <div class="row hm-ctas"><a class="btn" href="#report">Read the report${icon('arrow')}</a><a class="btn btn-line" href="#rates">Estimate a budget</a></div>
          <p class="tiny muted">Open to read, no email needed. Figures in this prototype are illustrative.</p>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Client quotes ---------- */
  function quotesSec() {
    const matt = RN.model.matt;
    const eric = matt && matt.reviews.find((r) => r.reviewer === 'Eric Barbalace');
    const sq = RN.data.market.report.quote;
    return `<section class="hm-sec">
      <div class="wrap">
        ${head('Results, in their words', 'The people who hired through Revenue Nomad <span class="serif">tell it better than we do.</span>')}
        <div class="hm-q-feature">
          <div class="hm-arch"><div class="arch-logo">${RN.ui.logo('ferryWordmark', { h: 46, name: 'Ferry' })}</div></div>
          <figure class="hm-q">
            <span class="hm-q-mark" aria-hidden="true">“</span>
            <blockquote class="hm-q-text">I couldn’t recommend working with Matt and his team more. <em>I hope to work with him again</em> on future growth projects.</blockquote>
            <figcaption class="hm-q-by"><i aria-hidden="true"></i><b>Trista Kempa</b><span>COO, Ferry</span></figcaption>
            <div class="row hm-q-links"><span class="pill pill-good">${icon('check-circle')}Client review</span>${matt ? `<a class="act" href="#op.${esc(matt.slug)}" data-track-view="${esc(matt.id)}">Read the full review on ${esc(matt.first)}’s profile${icon('arrow')}</a>` : ''}</div>
          </figure>
        </div>
        <div class="hm-q-row">
          ${eric ? `<figure class="hm-q-mini">
            <blockquote>${esc(/[.!?]$/.test(eric.quote.trim()) ? eric.quote.trim() : eric.quote.trim() + '.')}</blockquote>
            <figcaption><b>${esc(eric.reviewer)}</b><span>${esc(eric.role)}, ${esc(eric.company)}</span><span class="pill pill-good">${icon('check-circle')}Client review</span></figcaption>
          </figure>` : ''}
          <figure class="hm-q-mini">
            <blockquote>${esc(sq.text)}</blockquote>
            <figcaption><b>${esc(sq.by.split(',')[0])}</b><span>${esc(sq.by.split(',').slice(1, 2).join(',').trim())}</span><span class="pill pill-gold">Sample quote</span></figcaption>
          </figure>
        </div>
      </div>
    </section>`;
  }

  /* ---------- How it works ---------- */
  function howSec() {
    const steps = [
      ['Search the network', 'Search by role, focus area or the problem you have. Every profile is open, with client-verified proof of work. No login needed.'],
      ['Request an intro or post a project', 'Ask to meet one operator, or post a project and get ranked matches. Operators reply within 72 hours.'],
      ['Start on clear terms', 'Agree scope, hours and rate up front: fractional, interim, advisory or a scoped project. Built to move revenue from the first month.'],
    ];
    return `<section class="hm-sec hm-band">
      <div class="wrap">
        ${head('How it works', 'Three steps. <span class="serif">No retained search, no mystery bench.</span>', more('Clients and operators, side by side', 'href="#how"'))}
        <ol class="hm-ruled hm-steps">${steps.map((s, i) => `<li><span class="hm-step-n">${String(i + 1).padStart(2, '0')}</span><h3 class="h3">${esc(s[0])}</h3><p>${esc(s[1])}</p></li>`).join('')}</ol>
      </div>
    </section>`;
  }

  /* ---------- For operators ---------- */
  function operatorsSec() {
    const persona = RN.store.state.persona;
    const matt = RN.model.matt;
    const a = matt ? RN.model.analytics(matt.id, { days: 30 }) : null;
    const vals = [
      ['eye', 'Who viewed and why', 'Firmographic segments and the search terms behind every view. Never names.'],
      ['target', 'Positioning', 'Your rate against the Rate Index, and the focus areas clients search for most.'],
      ['link', 'Proof links for direct deals', 'Send a tracked profile to a prospect and see which sections they read.'],
      ['ai', 'Search and AI visibility', 'How often Google and AI answer engines surface your profile.'],
    ];
    const ctas = persona === 'operator'
      ? `<a class="btn" href="#studio">Open your Studio${icon('arrow')}</a>${matt ? `<a class="btn btn-line" href="#op.${esc(matt.slug)}">See your public profile</a>` : ''}`
      : `<a class="btn" href="#operators">Why operators join${icon('arrow')}</a><a class="btn btn-line" href="#join">Join the network</a>`;
    let preview = '';
    if (a) {
      const seg = a.viewers[0];
      const tile = (l, v, p) => `<div class="hm-st-tile"><span class="hm-st-v num">${RN.fmt.int(v)}</span><span class="hm-st-l">${esc(l)}</span>${p != null ? RN.ui.delta(v, p) : ''}</div>`;
      preview = `<div class="hm-studio" aria-label="Illustrative preview of the operator Studio">
        <div class="hm-studio-hd"><span class="row-nw" style="--gap:10px">${RN.ui.avatar(matt, 'ava-sm')}<span><b>Studio</b><span>${esc(matt.name)} · last 30 days</span></span></span><span class="pill">Illustrative preview</span></div>
        <div class="hm-st-tiles">${tile('Search impressions', a.totals.impressions, a.prev.impressions)}${tile('Profile views', a.totals.views, a.prev.views)}${tile('Shortlists', a.totals.shortlists, a.prev.shortlists)}</div>
        <div class="hm-studio-spark" data-hm-chart="studio"></div>
        <div class="hm-studio-blk"><span class="label">Why clients found you</span>
          <ul class="hm-st-q">${a.queries.slice(0, 3).map((q) => `<li><span>“${esc(q.q)}”</span><span class="hm-st-m"><i style="width:${Math.max(6, Math.round(q.share * 100 / Math.max(0.01, a.queries[0].share)))}%"></i></span><span class="tnum">${Math.round(q.share * 100)}%</span></li>`).join('')}</ul></div>
        ${seg ? `<div class="hm-studio-blk"><span class="label">Viewed most by</span><p>${esc(RN.w.label('industries', seg.industry))} companies · ${esc(RN.w.label('revenueRange', seg.revenueRange))} revenue · ${esc(RN.w.label('employeeRange', seg.employeeRange))} employees</p></div>` : ''}
      </div>`;
    }
    return `<section class="hm-sec">
      <div class="wrap hm-opv">
        <div class="hm-opv-txt">
          <span class="eyebrow">For operators</span>
          <h2 class="hm-h2">Your Studio shows who viewed you <span class="serif">and why.</span></h2>
          <p class="lede">Most months, most operators get no intro. Studio pays off anyway: the searches you appeared in, the companies that viewed you by industry and size, how your rate compares, and what to add to rank higher.</p>
          <ul class="hm-vals">${vals.map((v) => `<li>${icon(v[0])}<div><b>${esc(v[1])}</b><span>${esc(v[2])}</span></div></li>`).join('')}</ul>
          <div class="row hm-ctas">${ctas}</div>
          <p class="tiny muted">No pay-to-win. Rank comes from client-verified proof of work.</p>
        </div>
        ${preview}
      </div>
    </section>`;
  }

  /* ---------- Talk to us ---------- */
  function talkSec() {
    return `<section class="hm-talk night">
      <div class="wrap hm-talk-in">
        <h2 class="hm-talk-h">Rather talk it through <span class="serif">with a person?</span></h2>
        <div class="hm-talk-r">
          <p>Four quick questions, then a reply from a person within one business day. Or call <a href="tel:+12032000482">+1 203-200-0482</a>.</p>
          <div class="row hm-ctas"><a class="btn btn-leaf btn-lg" href="#talk">Talk to us${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#browse" data-act="hm-all">Browse operators</a></div>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Charts: drawn at the real rendered width so chart text stays at 12px ---------- */
  function fillCharts(root) {
    const rates = root.querySelector('[data-hm-chart="rates"]');
    if (rates) {
      const w = Math.max(260, Math.round(rates.clientWidth));
      const byCat = RN.data.market.rateIndex.byCat;
      const rows = RN.fields.roleCategory.options.filter((o) => byCat[o.v])
        .map((o) => ({ cat: o.v, label: o.l, value: byCat[o.v].p50, p25: byCat[o.v].p25, p75: byCat[o.v].p75 }))
        .sort((a, b) => b.value - a.value);
      rows[0].hi = true;
      const rowH = w > 560 ? 38 : 34;
      rates.innerHTML = RN.chart.bars(rows, { w, labelW: Math.round(Math.min(196, Math.max(166, w * 0.46))), rowH, barH: w > 560 ? 16 : 14, fmt: (n) => '$' + n, label: 'Median hourly rate by role category, Rate Index' })
        + rows.map((r, i) => `<a class="hm-bars-hit" href="#browse.${esc(r.cat)}" data-act="hm-cat" data-cat="${esc(r.cat)}" style="top:${i * rowH}px;height:${rowH}px" aria-label="Browse ${esc(r.label)} operators. Median $${r.value} an hour, $${r.p25} to $${r.p75} typical."></a>`).join('');
    }
    const dem = root.querySelector('[data-hm-chart="demand"]');
    if (dem) dem.innerHTML = RN.chart.spark(RN.data.market.report.demandIndex.map((x) => x.v), { w: Math.max(200, Math.round(dem.clientWidth)), h: 64, label: 'Demand Index, 2023 to 2027 projected' });
    const stu = root.querySelector('[data-hm-chart="studio"]');
    if (stu && RN.model.matt) {
      const a = RN.model.analytics(RN.model.matt.id, { days: 30 });
      stu.innerHTML = RN.chart.spark(a.series.views, { w: Math.max(200, Math.round(stu.clientWidth)), h: 52, stroke: 'var(--leaf)', label: 'Profile views, last 30 days' });
    }
  }

  /* ---------- Motion (skipped for reduced motion and automated captures) ---------- */
  function countUp(el) {
    const to = +el.dataset.count;
    if (!to) return;
    const t0 = performance.now(), dur = 1600;
    el.textContent = '0';
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = RN.fmt.int(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1 && document.body.contains(el)) S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }
  function startTyping(input) {
    if (!input) return;
    let wi = 0, ci = 0, dir = 1;
    const tick = () => {
      if (!document.body.contains(input)) return;
      if (document.activeElement === input || input.value) { input.placeholder = PH; ci = 0; dir = 1; later(tick, 700); return; }
      const word = TYPE_WORDS[wi];
      ci += dir;
      input.placeholder = 'Search ' + word.slice(0, Math.max(0, ci));
      if (dir > 0 && ci >= word.length) { dir = -1; later(tick, 1700); return; }
      if (dir < 0 && ci <= 0) { dir = 1; wi = (wi + 1) % TYPE_WORDS.length; later(tick, 320); return; }
      later(tick, dir > 0 ? 78 : 34);
    };
    later(tick, 1200);
  }
  function parallax(root) {
    const img = root.querySelector('.hm-hero-img');
    if (!img) return;
    let ticking = false;
    const upd = () => { ticking = false; const y = window.scrollY; if (y < 1400) img.style.transform = `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0)`; };
    on(window, 'scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  }

  /* ---------- Focus areas picker (shared tag picker with inline search, E479) ---------- */
  function matchCount() { return RN.model.search({ q: S.q, tags: S.tags }).length; }
  function syncTagUI() {
    const main = document.querySelector('main[data-view="home"]');
    if (main) {
      const sel = main.querySelector('.hm-sel');
      if (sel) { sel.innerHTML = selHtml(); sel.hidden = !S.tags.length; }
      const badge = main.querySelector('.hm-fa-n');
      if (badge) { badge.textContent = S.tags.length; badge.hidden = !S.tags.length; }
    }
    const m = RN.ui.modalEl();
    if (m && m.querySelector('.hm-tp')) {
      const n = matchCount();
      const note = m.querySelector('[data-hm-note]');
      if (note) {
        note.className = 'hm-tp-note small' + (S.tags.length && !n ? ' warn' : '');
        note.innerHTML = !S.tags.length ? `${icon('info')}<span>Operators must match every focus area you add. Client-verified matches rank first.</span>`
          : n ? `${icon('check-circle')}<span>${RN.fmt.plural(n, 'operator')} ${n === 1 ? 'matches' : 'match'} ${S.tags.length > 1 ? 'all ' + S.tags.length : 'it'}${S.q ? ` with “${esc(S.q)}”` : ''}.</span>`
            : `${icon('info')}<span>No operator matches all ${S.tags.length} yet. Remove one to widen the search, or search anyway to see the closest profiles.</span>`;
      }
      const btn = m.querySelector('[data-hm-apply]');
      if (btn) btn.innerHTML = (S.tags.length && !n ? 'Search anyway' : `Show ${RN.fmt.plural(S.tags.length ? n : RN.model.search({ q: S.q }).length, 'operator')}`) + icon('arrow');
      const clr = m.querySelector('[data-act="hm-tags-clear"]');
      if (clr) clr.disabled = !S.tags.length;
    }
  }
  function openPicker() {
    const inp = document.getElementById('hm-q');
    if (inp) S.q = inp.value.trim();
    RN.ui.modal({
      width: 640,
      title: 'Add focus areas',
      sub: 'Search the full Fit Tag Library. Pick up to 5.',
      body: `<div class="hm-tp">
        ${S.q ? `<p class="small muted hm-tp-q">${icon('search')}<span>Searching “${esc(S.q)}” with these focus areas.</span></p>` : ''}
        <div data-hm-picker>${RN.w.tagPicker('hmTags', S.tags, { id: 'hm-tp', client: true, max: 5, noCustom: true, cat: guessCat(S.q), change: 'hm-tags', emptyText: 'No focus areas yet. Search the library or pick from the list.' })}</div>
        <p class="hm-tp-note small" data-hm-note></p>
      </div>`,
      foot: `<button type="button" class="act muted" data-act="hm-tags-clear">Clear all</button><span class="grow"></span><button type="button" class="btn" data-act="hm-tags-apply" data-hm-apply>Show operators</button>`,
      onClose: syncTagUI,
    });
    syncTagUI();
  }

  function runSearch(source) {
    const inp = document.getElementById('hm-q');
    if (inp) S.q = inp.value.trim();
    const q = S.q, tags = S.tags.slice();
    if (RN.ui.modalEl()) RN.ui.closeModal();
    if (q || tags.length) RN.track('search', { q, tags, filters: {}, results: RN.model.search({ q, tags }).length, source });
    // The search is handed to Browse; the hero starts clean on the next visit
    S.q = ''; S.tags = [];
    toBrowse({ q, tags });
  }

  /* ---------- Actions ---------- */
  RN.submits['hm-search'] = () => runSearch('home');
  RN.inputs['hm-q'] = (el) => { S.q = el.value; };
  RN.actions['hm-tags-open'] = openPicker;
  RN.inputs['hm-tags'] = (el) => { S.tags = el.value ? el.value.split('|').filter(Boolean) : []; syncTagUI(); };
  RN.actions['hm-tags-apply'] = () => runSearch('home');
  RN.actions['hm-tags-clear'] = () => {
    S.tags = [];
    const m = RN.ui.modalEl();
    const box = m && m.querySelector('[data-hm-picker]');
    if (box) box.innerHTML = RN.w.tagPicker('hmTags', [], { id: 'hm-tp', client: true, max: 5, noCustom: true, cat: guessCat(S.q), change: 'hm-tags', emptyText: 'No focus areas yet. Search the library or pick from the list.' });
    syncTagUI();
  };
  RN.actions['hm-tag-x'] = (el) => { S.tags = S.tags.filter((t) => t !== el.dataset.t); syncTagUI(); };
  RN.actions['hm-cat'] = (el) => { const c = el.dataset.cat; toBrowse({ filters: { roleCategories: [c] } }, 'browse.' + c); };
  RN.actions['hm-all'] = () => toBrowse({});
  RN.actions['hm-need'] = (el) => {
    const need = el.dataset.need;
    const cats = RN.fields.needCats[need] || [];
    if (!cats.length) { RN.go('talk'); return; }
    toBrowse({ need, filters: { roleCategories: cats.slice() } }, cats.length === 1 ? 'browse.' + cats[0] : 'browse');
  };
  RN.actions['hm-q'] = (el) => {
    const q = el.dataset.q;
    RN.track('search', { q, tags: [], filters: {}, results: RN.model.search({ q }).length, source: 'home_trending' });
    toBrowse({ q });
  };

  /* ---------- View ---------- */
  RN.view('home', {
    route: 'home',
    nav: '',
    chrome: 'over',
    title: () => 'Revenue Nomad · Fractional GTM leaders, research and rates',
    render: () => {
      const anim = !S.played && !calm();
      return [hero(anim), strip(), problems(), featuredSec(), frameworkSec(), pulseSec(), reportSec(), quotesSec(), howSec(), operatorsSec(), talkSec()].join('');
    },
    mount: (root) => {
      teardown();
      const first = !S.played;
      S.played = true;
      fillCharts(root);
      let rz = 0;
      on(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { const m = document.querySelector('main[data-view="home"]'); if (m) fillCharts(m); }, 150); });
      const quiet = calm();
      if (!quiet) {
        if (first) root.querySelectorAll('.hm-stats [data-count]').forEach(countUp);
        startTyping(root.querySelector('#hm-q'));
        parallax(root);
      }
      // Profile views that start on a home card are attributed to 'home'. Window listeners run after
      // the global document handler (which sets 'card'), so this wins for clicks inside home.
      on(window, 'click', (e) => {
        const a = e.target && e.target.closest && e.target.closest('main[data-view="home"] a[data-track-view]');
        if (a) RN.store.state._viewSource = 'home';
      });
      if (!S.impressed) {
        S.impressed = true;
        featured().forEach((op, i) => RN.track('impression', { opId: op.id, position: i + 1, source: 'home', surface: 'homepage_carousel' }));
      }
    },
    unmount: () => { teardown(); S.played = false; S.impressed = false; },
  });
})();
