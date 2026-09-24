/* Browse talent (#browse) and role category landing pages (#browse.<roleCategory slug>).
   State lives in RN.store.state.browse {q, tags, filters, sort, view}. The home hero (and any
   Insights chart) writes q / tags / filters there and routes here, or calls RN.browse.go(criteria).
   Search rules come from RN.model.search: role categories OR, focus areas AND (up to 5),
   industries OR (up to 3), every other filter AND. Every filter control is RN.w.field, so the
   values are the same slugs operators store at signup.
   Loops wired here: search + impressions (Studio "Why you appeared"), zero-result searches
   ("Tell us what you need" -> Admin demand), compare_add / shortlist via the shared card. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const BR = (RN.browse = RN.browse || {});

  const PAGE = 24;
  const FILTER_KEYS = ['roleCategories', 'availability', 'hoursPerMonth', 'revenueRange', 'employeeRange', 'industries', 'engagementTypes', 'rateMax', 'risMin'];
  // Chip colour by field type (founder L222): role, focus area, industry, availability, company, engagement, rate, reputation
  const TYPE = { q: 'q', tags: 'focus', roleCategories: 'role', availability: 'avail', hoursPerMonth: 'avail', revenueRange: 'company', employeeRange: 'company', industries: 'industry', engagementTypes: 'engage', salesMotions: 'motion', rateMax: 'rate', risMin: 'ris' };
  const SORTS = [['best', 'Best match'], ['ris', 'Reputation Index'], ['available', 'Available soonest'], ['rate', 'Rate']];
  const AVAIL_RANK = { available_now: 0, available_2_weeks: 1, available_2_plus_weeks: 2 };

  /* What each role category does (category landing pages, written for search and AI answers). */
  const CAT = {
    sales_leadership: { noun: 'sales leader', body: 'A fractional sales leader owns the number part time. They build or fix the sales process, hire and coach reps, run pipeline reviews and the forecast, and report revenue to the board. Companies bring one in when the founder still closes every deal, when a first sales leader leaves, or after two missed quarters.' },
    marketing: { noun: 'marketing leader', body: 'A fractional marketing leader sets positioning, picks the channels that fit the budget and builds a demand engine that sales trusts. They hire and run the team or agencies and report the pipeline marketing creates. Companies hire one before a full-time CMO makes sense, or to reset a program that spends without producing pipeline.' },
    revenue_operations: { noun: 'RevOps leader', body: 'A fractional RevOps leader makes the revenue system work: CRM design and cleanup, lead routing, pipeline stages, forecasting, dashboards and comp plan administration. They connect sales, marketing and customer success data so leadership can trust the numbers. Companies bring one in after a messy CRM migration, before a fundraise, or when reporting takes days instead of minutes.' },
    sales_enablement: { noun: 'enablement leader', body: 'A fractional enablement leader gets reps productive faster. They build onboarding, write playbooks, roll out a methodology such as MEDDPICC and coach calls against a clear standard. Companies hire one when ramp time is too long, when a new methodology is not sticking, or when the sales team doubles in a year.' },
    customer_success_growth: { noun: 'customer success leader', body: 'A fractional customer success leader protects and grows the revenue you already have. They design onboarding and renewal playbooks, set up health scoring, reduce churn and build an expansion motion. Companies bring one in when churn climbs, when net revenue retention stalls, or when account managers work without a clear process.' },
    ai_gtm: { noun: 'AI GTM specialist', body: 'A fractional AI GTM specialist automates the work around selling: enrichment, lead scoring, outbound sequencing and account research, often with tools like Clay and custom workflows. They build systems a small team can run without adding headcount. Companies hire one to scale outbound, to enrich data at volume, or to test AI in the sales process with measurable results.' },
    partnerships: { noun: 'partnerships leader', body: 'A fractional partnerships leader builds revenue through other companies: technology integrations, resellers, agencies and cloud marketplaces. They pick the partner model, sign and enable the first partners and track partner-sourced pipeline. Companies hire one when direct sales alone cannot reach the market, or to launch a channel program without a full-time hire.' },
    sellers: { noun: 'seller', body: 'A fractional seller works deals part time or on a defined project: an account executive who runs and closes deals, an SDR who books meetings, or an account manager who grows existing accounts. Companies use fractional sellers to prove a new segment or product before hiring, or to cover a gap while they recruit.' },
  };

  /* ---------- State ---------- */
  function st() {
    const s = RN.store.state;
    if (!s.browse || typeof s.browse !== 'object') s.browse = {};
    const b = s.browse;
    if (typeof b.q !== 'string') b.q = b.q ? String(b.q) : '';
    if (!Array.isArray(b.tags)) b.tags = [];
    if (!b.filters || typeof b.filters !== 'object') b.filters = {};
    if (!SORTS.some((x) => x[0] === b.sort)) b.sort = 'best';
    if (!b.view) b.view = 'grid';
    return b;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function cleanFilters(f) {
    const out = {};
    Object.keys(f || {}).forEach((k) => {
      const v = f[k];
      if (Array.isArray(v)) { if (v.filter(Boolean).length) out[k] = v.filter(Boolean); }
      else if (v !== '' && v != null && v !== false) out[k] = v;
    });
    if (out.rateMax && +out.rateMax >= RN.fields.rateMax.max) delete out.rateMax;
    return out;
  }
  function crit() { const b = st(); return { q: b.q.trim(), tags: b.tags.slice(), filters: cleanFilters(b.filters) }; }
  const hasCrit = (c) => !!(c.q || c.tags.length || Object.keys(c.filters).length);
  const critKey = (c) => JSON.stringify([c.q.toLowerCase(), c.tags.slice().sort(), Object.keys(c.filters).sort().map((k) => [k, c.filters[k]])]);

  let limit = PAGE;
  let lastAdded = null;      // the criterion added most recently (zero-result relax picks it first)
  let tagsOpen = false;      // Focus areas popover
  let landedCat = null;      // category landing currently applied
  let compact = false;       // sticky bar minimized while scrolling down

  /* Run the model search with the view's sort rules. */
  function run(c, sort) {
    RN.model.applyEdits && RN.model.applyEdits();
    sort = sort || st().sort;
    let res = RN.model.search({ q: c.q, tags: c.tags, filters: c.filters, sort });
    // A budget filter only keeps operators who publish a rate (Studio tells operators: no rate, no budget searches)
    if (c.filters.rateMax) res = res.filter((r) => r.op.rate);
    if (sort === 'available') {
      const t = (r) => { const d = r.op.avail.startDate ? new Date(r.op.avail.startDate).getTime() : 0; return Math.max(d, RN.now().getTime() - 864e5); };
      res.sort((a, b) => (AVAIL_RANK[a.op.avail.key] || 0) - (AVAIL_RANK[b.op.avail.key] || 0) || t(a) - t(b) || b.score - a.score);
    }
    return res;
  }

  /* Change criteria from anywhere in the view. Records what was added last for the zero-result relax. */
  function setCrit(patch, o) {
    o = o || {};
    const before = crit();
    RN.store.update((s) => {
      const b = s.browse;
      if ('q' in patch) b.q = patch.q;
      if ('tags' in patch) b.tags = patch.tags.slice(0, 5);
      if ('filters' in patch) b.filters = cleanFilters(patch.filters);
    }, 'browse');
    const after = crit();
    const added = [];
    if (after.q && after.q !== before.q) added.push({ k: 'q' });
    after.tags.filter((t) => !before.tags.includes(t)).forEach((t) => added.push({ k: 'tags', v: t }));
    Object.keys(after.filters).forEach((k) => { if (JSON.stringify(after.filters[k]) !== JSON.stringify(before.filters[k]) && (!before.filters[k] || (Array.isArray(after.filters[k]) && after.filters[k].length > (before.filters[k] || []).length) || !Array.isArray(after.filters[k]))) added.push({ k }); });
    if (added.length) lastAdded = added[added.length - 1];
    limit = PAGE;
    // A category landing stays a landing only while its category is the one role filter
    const cur = RN.currentRoute();
    if (cur && cur.view.name === 'browse-cat') {
      const rc = after.filters.roleCategories || [];
      if (!(rc.length === 1 && rc[0] === landedCat)) { RN.go('browse'); return; }
    }
    refresh(o);
  }

  BR.go = function (c) {
    c = c || {};
    RN.store.update((s) => {
      s.browse = Object.assign({ sort: 'best', view: 'grid' }, s.browse || {}, { q: c.q || '', tags: (c.tags || []).slice(0, 5), filters: cleanFilters(c.filters || {}) });
    }, 'browse');
    RN.go('browse');
  };

  /* ---------- Labels ---------- */
  const rateText = (v) => (+v >= RN.fields.rateMax.max ? 'Any rate' : '$' + Math.round(+v) + ' / hr');
  function chipText(k, v) {
    switch (k) {
      case 'q': return `“${v}”`;
      case 'tags': return v;
      case 'hoursPerMonth': return v === '19' ? 'Any available time' : 'At least ' + RN.w.label('hoursPerMonth', v);
      case 'revenueRange': return RN.w.label('revenueRange', v) + ' revenue';
      case 'employeeRange': return RN.w.label('employeeRange', v) + ' employees';
      case 'rateMax': return 'Up to $' + Math.round(+v) + ' / hr';
      case 'risMin': return 'Reputation Index ' + RN.w.label('risMin', v);
      default: return RN.fields[k] ? RN.w.label(k, v) : String(v);
    }
  }
  const typeName = (k) => ({ q: 'Search', tags: 'Focus area', revenueRange: 'Company revenue', rateMax: 'Hourly rate', hoursPerMonth: 'Available time' }[k] || (RN.fields[k] ? RN.fields[k].label : k));
  function groupLabel(k, v) {
    if (k === 'q') return `“${v}”`;
    if (Array.isArray(v)) return v.map((x) => chipText(k, x)).join(' or ');
    return chipText(k, v);
  }
  function chipList(c) {
    const out = [];
    if (c.q) out.push({ k: 'q', v: c.q });
    c.tags.forEach((t) => out.push({ k: 'tags', v: t }));
    const keys = FILTER_KEYS.filter((k) => k in c.filters).concat(Object.keys(c.filters).filter((k) => !FILTER_KEYS.includes(k)));
    keys.forEach((k) => { const v = c.filters[k]; (Array.isArray(v) ? v : [v]).forEach((x) => out.push({ k, v: x })); });
    return out;
  }
  const filterCount = (c) => Object.keys(c.filters).reduce((a, k) => a + (Array.isArray(c.filters[k]) ? c.filters[k].length : 1), 0);

  /* ---------- Card: RN.ui.opCard with 4 focus areas (Scope L318) and the rate gated for visitors ---------- */
  function whyFor(r, c) {
    const out = (r.why || []).slice();
    const op = r.op, f = c.filters;
    const ind = f.industries && f.industries.find((i) => op.industries.includes(i));
    if (ind && !out.some((x) => x.startsWith('Works in'))) out.push('Works in ' + RN.w.label('industries', ind));
    const rev = f.revenueRange && f.revenueRange.find((x) => op.revenueRanges.includes(x));
    if (rev) out.push(`Works with ${RN.w.label('revenueRange', rev)} companies`);
    const emp = !rev && f.employeeRange && f.employeeRange.find((x) => op.employeeRanges.includes(x));
    if (emp) out.push(`Works with ${RN.w.label('employeeRange', emp)} employee companies`);
    if (f.risMin) out.push(`Reputation Index ${op.ris.score}`);
    return out.slice(0, 2).join(' · ');
  }
  BR.card = function (op, opts) {
    opts = opts || {};
    const visitor = RN.store.state.persona === 'visitor';
    let html = RN.ui.opCard(visitor ? Object.assign({}, op, { rate: null }) : op, { why: opts.why || '' });
    // Replace the card's 3 tags with 4, verified first. Expert tags (5+ reviews) are client-verified too,
    // but RN.ui.ftag only styles tier === 'verified', so normalize them here.
    const vFirst = (a, b) => (a.tier === 'verified' ? -1 : 1) - (b.tier === 'verified' ? -1 : 1);
    const three = RN.ui.ftags((op.tags || []).slice().sort(vFirst), 3);
    const four = RN.ui.ftags((op.tags || []).map((t) => (t.tier === 'claimed' ? t : Object.assign({}, t, { tier: 'verified' }))).sort(vFirst), 4);
    if (html.includes(three)) html = html.replace(three, () => four);
    if (visitor && op.rate) {
      const lock = `<button type="button" class="br-lock" data-act="br-login" aria-label="Log in to see ${esc(op.first)}’s hourly rate">${icon('lock')}Log in to see rate</button>`;
      const a = `<span>${RN.ui.avail(op)}</span>`;
      html = html.includes(a) ? html.replace(a, () => a + lock) : html.replace('<div class="opc-meta">', () => '<div class="opc-meta">' + lock);
    }
    return html;
  };

  /* ---------- Login prompt that keeps the visitor on the page ---------- */
  BR.loginPrompt = function (o) {
    o = o || {};
    const p = RN.personas.buyer;
    RN.ui.modal({
      width: 480,
      title: esc(o.title || 'Log in to see rates'),
      sub: esc(o.sub || 'Hourly rates and match signals are shown to signed-in clients. Browsing stays open to everyone.'),
      body: `<div class="stack" style="--gap:12px">
        <button type="button" class="optcard" data-act="persona" data-p="buyer"><b>Continue as ${esc(p.name)} <span class="muted" style="font-weight:500">· ${esc(p.sub)}</span></b><span>Prototype client account. You stay on this page.</span></button>
        <button type="button" class="act" data-act="br-login-all" style="align-self:flex-start">${icon('user')}Log in as an operator or the team</button>
      </div>`,
    });
  };
  RN.actions['br-login'] = () => BR.loginPrompt();
  RN.actions['br-login-all'] = (el) => { RN.ui.closeModal(); RN.actions.login(el); };

  /* ---------- Page ---------- */
  function catValid(c) { if (!c) return null; const k = RN.fields.catKey(String(c).replace(/-/g, '_')); return CAT[k] ? k : null; }

  function page(cat) {
    const b = st();
    if (cat && landedCat !== cat) {
      landedCat = cat;
      const f = Object.assign({}, b.filters, { roleCategories: [cat] });
      b.filters = cleanFilters(f); limit = PAGE; lastAdded = null;
      RN.store.save();
    }
    const c = crit();
    const res = run(c);
    return `<div class="br-page${cat ? ' br-is-cat' : ''}" data-cat="${esc(cat || '')}">
      ${cat ? catHead(cat) : genHead()}
      ${bar(c)}
      <section class="wrap br-body">
        <div id="br-assist" class="br-assist">${assist(c, cat)}</div>
        <div class="br-rhead">
          <p id="br-count" class="br-count" aria-live="polite">${countHtml(res, c)}</p>
          ${sortHtml()}
        </div>
        <div id="br-results" data-view-source="search">${resultsHtml(res, c)}</div>
      </section>
      ${cat ? catPlan(cat) : ''}
      ${rolesNav(cat)}
    </div>`;
  }

  function genHead() {
    return `<header class="wrap br-head">
      <span class="eyebrow">Direct access to talent</span>
      <h1 class="h1">Browse <span class="serif">operators</span></h1>
      <p class="lede">Open profiles with client-verified proof of work. No login needed to browse.</p>
    </header>`;
  }

  function catTopTags(cat) {
    const have = new Map();
    RN.model.ops.forEach((op) => op.tags.forEach((t) => { const k = t.t.toLowerCase(); if (!have.has(k)) have.set(k, t.t); }));
    const m = {};
    RN.data.market.queries.filter((q) => q.cat === cat && !q.zero).forEach((q) => q.tags.forEach((t) => { if (have.has(t.toLowerCase())) m[have.get(t.toLowerCase())] = (m[have.get(t.toLowerCase())] || 0) + q.vol / q.tags.length; }));
    let list = Object.keys(m).sort((a, b) => m[b] - m[a]);
    if (list.length < 5) {
      const n = {};
      RN.model.ops.filter((op) => op.catKey === cat).forEach((op) => op.tags.forEach((t) => { n[t.t] = (n[t.t] || 0) + 1; }));
      list = list.concat(Object.keys(n).sort((a, b) => n[b] - n[a]).filter((t) => !list.includes(t)));
    }
    return list.slice(0, 6);
  }

  function catHead(cat) {
    const label = RN.fields.catLabel(cat);
    const copy = CAT[cat];
    const idx = RN.data.market.rateIndex.byCat[cat];
    const titles = (RN.fields.rolesByCat[cat] || []).join(' · ');
    const tags = catTopTags(cat);
    const sel = st().tags.map((t) => t.toLowerCase());
    const mo = (h) => RN.fmt.usd(Math.round((idx.p50 * h) / 100) * 100);
    return `<header class="wrap br-head br-head-cat">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#browse">Browse talent</a>${icon('chev-right')}<span>${esc(label)}</span></nav>
      <div class="br-cat-grid">
        <div class="br-cat-copy">
          <span class="eyebrow br-cat-eyebrow">${RN.ui.catDot(cat)}Role category</span>
          <h1 class="h1">Fractional <span class="serif">${esc(label)}</span></h1>
          <p class="lede">${esc(copy.body)}</p>
          ${titles ? `<p class="small br-titles"><span class="label">Common titles</span>${esc(titles)}</p>` : ''}
          ${tags.length ? `<div class="br-cat-tags"><span class="label">Most searched focus areas</span>
            <div class="row" style="--gap:8px">${tags.map((t) => `<button type="button" class="chip chip-sm" data-act="br-tag-toggle" data-t="${esc(t)}" aria-pressed="${sel.includes(t.toLowerCase())}">${icon('plus', 'br-i-off')}${icon('check', 'br-i-on')}${esc(t)}</button>`).join('')}</div></div>` : ''}
        </div>
        ${idx ? `<aside class="card br-rate-card" aria-label="Rate Index for ${esc(label)}">
          <span class="label">Rate Index · ${esc(label)}</span>
          <div class="br-rate-big"><span class="num">$${esc(idx.p50)}</span><span class="small muted">median per hour</span></div>
          <p class="small">Typical range <b>$${esc(idx.p25)}–$${esc(idx.p75)} / hr</b> (middle half of ${esc(idx.n)} profiles). About <b>${mo(20)}–${mo(40)} a month</b> at 20 to 40 hrs.</p>
          <div class="br-rate-chart" data-br-chart="${esc(cat)}" aria-label="Median hourly rate by role category"></div>
          <div class="row between br-rate-foot"><a class="act" href="#rates">Open the Rate Index${icon('arrow')}</a><span class="tiny muted">Illustrative figures</span></div>
        </aside>` : ''}
      </div>
    </header>`;
  }

  function rateChart(cat, w) {
    const by = RN.data.market.rateIndex.byCat;
    const rows = RN.fields.roleCategory.options.filter((o) => by[o.v]).map((o) => ({ label: o.l, value: by[o.v].p50, hi: o.v === cat }))
      .sort((a, b) => b.value - a.value);
    // Leave room for the longest registry label ("Customer Success & Growth") at 12px
    const labelW = RN.clamp(Math.round(w * 0.5), 164, 176);
    return RN.chart.bars(rows, { w: Math.max(240, Math.round(w)), labelW, rowH: 26, barH: 10, fmt: (n) => '$' + n, label: 'Median hourly rate by role category' });
  }

  function catPlan(cat) {
    const noun = CAT[cat].noun;
    const label = RN.fields.catLabel(cat);
    const card = (href, ic, h, p, cta) => `<a class="card card-link br-plan-card" href="${href}">${icon(ic)}<h3 class="h4">${esc(h)}</h3><p class="small muted">${esc(p)}</p><span class="act">${esc(cta)}${icon('arrow')}</span></a>`;
    return `<section class="wrap br-plan" aria-labelledby="br-plan-h">
      <h2 class="h3" id="br-plan-h">Plan a fractional ${esc(noun)} engagement</h2>
      <div class="grid g-3" style="--gap:16px">
        ${card('#rates', 'chart', `What does a fractional ${noun} cost?`, `Hourly medians and ranges for ${label}, adjusted for company revenue, in the Rate Index.`, 'See rates')}
        ${card('#blueprints', 'layers', 'Scope the work', 'Engagement Blueprints give you the hours, term and a 30/60/90-day plan. Post one as a project in minutes.', 'Browse Blueprints')}
        ${card('#guides', 'book', 'Hiring guides', 'Plain answers on scoping, pricing and managing a fractional GTM leader.', 'Read the guides')}
      </div>
    </section>`;
  }

  function rolesNav(cat) {
    return `<nav class="wrap br-roles" aria-label="Browse by role category">
      <span class="label">${cat ? 'Other role categories' : 'Browse by role'}</span>
      <div class="br-roles-list">${RN.fields.roleCategory.options.filter((o) => o.v !== cat).map((o) => `<a href="#browse.${esc(o.v)}">${RN.ui.catDot(o.v)}Fractional ${esc(o.l)}</a>`).join('')}</div>
    </nav>`;
  }

  /* ---------- Sticky search bar ---------- */
  function badge(n) { return n ? `<span class="nav-count br-badge">${n}</span>` : ''; }
  function barBtns(c) {
    return `<button type="button" class="btn btn-line br-bar-btn" data-act="br-tags-toggle" aria-expanded="${tagsOpen}" aria-controls="br-tp" id="br-tags-btn">${icon('target')}<span class="br-bar-l">Focus areas</span>${badge(c.tags.length)}</button>
      <button type="button" class="btn btn-line br-bar-btn" data-act="br-filters" id="br-filters-btn">${icon('sliders')}<span class="br-bar-l">Filters</span>${badge(filterCount(c))}</button>`;
  }
  function bar(c) {
    return `<div class="br-bar${compact ? ' is-compact' : ''}" id="br-bar">
      <div class="wrap br-bar-in">
        <form class="br-search" role="search" data-submit="br-search" autocomplete="off">
          <label class="sr-only" for="br-q">Search operators</label>
          ${icon('search')}
          <input id="br-q" class="br-q" name="q" type="search" enterkeyhint="search" value="${esc(st().q)}" placeholder="Search a role, skill, industry or name" data-input="br-q">
          <button type="button" class="br-q-x" data-act="br-q-clear" aria-label="Clear search" ${st().q ? '' : 'hidden'}>${icon('x')}</button>
        </form>
        <div class="br-bar-acts" id="br-bar-acts">${barBtns(c)}</div>
        <div class="br-tp" id="br-tp" role="dialog" aria-label="Focus areas" ${tagsOpen ? '' : 'hidden'}>${tagsOpen ? tagPanel() : ''}</div>
      </div>
    </div>`;
  }
  function tagPanel() {
    const b = st();
    const cat = landedCat || (b.filters.roleCategories || [])[0] || '';
    return `<div class="br-tp-hd"><div><b>${esc(RN.fields.fitTags.clientLabel)}</b><p class="small muted">Operators must have every focus area you pick.</p></div>
        <button type="button" class="x-btn" data-act="br-tags-close" aria-label="Close focus areas">${icon('x')}</button></div>
      ${RN.w.tagPicker('brTags', b.tags, { id: 'br-tagpick', source: 'fitTags', client: true, max: 5, noCustom: true, cat, change: 'br-tags', emptyText: 'No focus areas picked. Search or pick from the list.' })}
      <div class="br-tp-ft"><button type="button" class="btn btn-sm" data-act="br-tags-close">Done</button></div>`;
  }
  function setTagsOpen(open) {
    tagsOpen = open;
    const tp = document.getElementById('br-tp');
    const btn = document.getElementById('br-tags-btn');
    if (!tp) return;
    tp.hidden = !open;
    tp.innerHTML = open ? tagPanel() : '';
    if (btn) btn.setAttribute('aria-expanded', open);
    if (open) { setCompact(false); const i = tp.querySelector('input[type=search]'); if (i) setTimeout(() => i.focus(), 20); }
  }

  /* ---------- Assist row: active chips, or popular searches when nothing is set ---------- */
  function assist(c, cat) {
    const chips = chipList(c);
    if (chips.length) {
      return `<div class="br-chips" role="list" aria-label="Active filters">
        ${chips.map((x) => `<span role="listitem"><button type="button" class="br-fchip" data-type="${esc(TYPE[x.k] || 'other')}" data-act="br-chip-x" data-k="${esc(x.k)}" data-v="${esc(x.v)}" title="${esc(typeName(x.k))}" aria-label="Remove ${esc(typeName(x.k))}: ${esc(chipText(x.k, x.v))}">${x.k === 'q' ? icon('search') : '<i></i>'}<span>${esc(chipText(x.k, x.v))}</span>${icon('x')}</button></span>`).join('')}
        ${chips.length > 1 ? `<span role="listitem"><button type="button" class="act muted br-clear" data-act="br-clear">Clear all</button></span>` : ''}
      </div>`;
    }
    if (cat) return '';
    const pop = RN.data.market.queries.filter((q) => !q.zero).slice().sort((a, b) => b.vol - a.vol).slice(0, 6);
    return `<div class="br-popular"><span class="label">Popular searches</span>
      <div class="br-popular-list">${pop.map((q) => `<button type="button" class="chip chip-sm" data-act="br-q-set" data-q="${esc(q.q)}">${esc(q.q)}</button>`).join('')}</div></div>`;
  }

  function countHtml(res, c) {
    const n = res.length;
    if (!n) return '<b class="num">0</b> operators match';
    return `<b class="num">${RN.fmt.int(n)}</b> ${n === 1 ? 'operator' : 'operators'}${hasCrit(c) ? ' match' : ''}`;
  }
  function sortHtml() {
    const s = st().sort;
    return `<div class="br-sort">
      <span class="label br-sort-l">Sort</span>
      <div class="seg br-sort-seg" role="group" aria-label="Sort results">${SORTS.map(([k, l]) => `<button type="button" data-act="br-sort" data-s="${k}" aria-pressed="${s === k}">${esc(l)}</button>`).join('')}</div>
      <label class="br-sort-sel"><span class="sr-only">Sort results</span><select class="select" data-change="br-sort-sel">${SORTS.map(([k, l]) => `<option value="${k}" ${s === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    </div>`;
  }

  function resultsHtml(res, c) {
    if (!res.length) return zeroHtml(c);
    const shown = res.slice(0, limit);
    const more = res.length - shown.length;
    return `<div class="grid g-3 br-grid">${shown.map((r) => BR.card(r.op, { why: whyFor(r, c) })).join('')}</div>
      ${more > 0 ? `<div class="br-more"><button type="button" class="btn btn-line" data-act="br-more">Show ${Math.min(PAGE, more)} more</button><span class="small muted">Showing ${shown.length} of ${res.length}</span></div>` : ''}
      <p class="br-tell">${icon('message')}<span>Not seeing the right fit? <button type="button" class="act" data-act="br-tell" data-zero="">Tell us what you need</button> and our team will shortlist operators for you.</span></p>`;
  }

  /* ---------- Zero results: never a dead end ---------- */
  function candidates(c) {
    const out = [];
    if (c.q) out.push({ k: 'q', label: `“${c.q}”` });
    c.tags.forEach((t) => out.push({ k: 'tags', v: t, label: t }));
    Object.keys(c.filters).forEach((k) => out.push({ k, label: groupLabel(k, c.filters[k]) }));
    return out;
  }
  function without(c, x) {
    const n = clone(c);
    if (x.k === 'q') n.q = '';
    else if (x.k === 'tags') n.tags = n.tags.filter((t) => t !== x.v);
    else if (x.k === '*filters') { n.tags = []; n.filters = {}; }
    else if (x.k === '*all') { n.q = ''; n.tags = []; n.filters = {}; }
    else delete n.filters[x.k];
    return n;
  }
  function relax(c) {
    const cands = candidates(c);
    const attempt = (x) => { const r = run(without(c, x)); return { x, n: r.length, res: r }; };
    let best = null;
    const last = lastAdded && cands.find((x) => x.k === lastAdded.k && (x.k !== 'tags' || x.v === lastAdded.v));
    if (last) { const r = attempt(last); if (r.n) best = r; }
    if (!best) cands.forEach((x) => { const r = attempt(x); if (r.n && (!best || r.n > best.n)) best = r; });
    if (!best && c.q && (c.tags.length || Object.keys(c.filters).length)) { const r = attempt({ k: '*filters', label: 'your filters' }); if (r.n) best = r; }
    if (!best) best = attempt({ k: '*all', label: 'any filters' });
    return best;
  }
  function zeroHtml(c) {
    const alt = relax(c);
    const x = alt.x;
    const multi = candidates(c).length > 1;
    return `<div class="br-zero">
      <div class="br-zero-hd">
        <span class="br-zero-ic">${icon('search')}</span>
        <div class="stack" style="--gap:6px">
          <h2 class="h3">No exact matches</h2>
          <p class="muted">${multi ? 'No operator matches every filter you picked.' : c.q && !c.tags.length && !Object.keys(c.filters).length ? `No operator profile mentions <b>${esc(c.q)}</b> yet.` : 'No operator matches this filter yet.'} ${alt.n ? (multi ? `The closest matches drop <b>${esc(x.label)}</b>.` : 'Here are the closest matches.') : ''}</p>
        </div>
      </div>
      ${alt.n ? `<div class="br-zero-alt">
        <div class="row between br-zero-bar"><span class="label">${x.k === '*all' || (x.k === 'q' && !multi) ? 'Top operators on the network' : `Closest matches · ${esc(RN.fmt.plural(alt.n, 'operator'))} without ${esc(x.label)}`}</span>
          <button type="button" class="btn btn-line btn-sm" data-act="br-relax" data-k="${esc(x.k)}" data-v="${esc(x.v || '')}">${x.k === 'q' ? 'Clear search' : x.k.startsWith('*') ? 'Clear filters' : 'Remove this filter'}</button></div>
        <div class="grid g-3 br-grid">${alt.res.slice(0, 6).map((r) => BR.card(r.op, { why: whyFor(r, without(c, x)) })).join('')}</div>
      </div>` : ''}
      <p class="br-tell br-tell-zero">${icon('message')}<span>Looking for someone specific? <button type="button" class="act" data-act="br-tell" data-zero="1">Tell us what you need</button> and our team will find them. Searches with no match go straight to our recruiting list.</span></p>
    </div>`;
  }

  /* ---------- Refresh the result region in place (keeps focus in the search field) ---------- */
  function refresh(o) {
    o = o || {};
    const root = document.querySelector('.br-page');
    if (!root) return;
    const c = crit();
    const res = run(c);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('br-assist', assist(c, landedCat && root.dataset.cat ? landedCat : null));
    set('br-count', countHtml(res, c));
    set('br-results', resultsHtml(res, c));
    set('br-bar-acts', barBtns(c));
    const x = root.querySelector('.br-q-x'); if (x) x.hidden = !st().q;
    const qi = document.getElementById('br-q'); if (qi && document.activeElement !== qi && qi.value !== st().q) qi.value = st().q;
    RN.$$('[data-act="br-tag-toggle"]', root).forEach((b) => b.setAttribute('aria-pressed', st().tags.some((t) => t.toLowerCase() === b.dataset.t.toLowerCase())));
    RN.$$('[data-act="br-sort"]', root).forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === st().sort));
    if (tagsOpen && !o.fromPicker) { const tp = document.getElementById('br-tp'); if (tp) { tp.innerHTML = tagPanel(); } }
    if (!o.noTrack) scheduleTrack(o.trackNow);
  }

  /* ---------- Analytics: one search event per changed query/filter set, impressions for the first 12 ---------- */
  let trackTimer = null, lastKey = null, mountedAt = 0;
  /* The home hero (and any surface that searches, then routes here) already logged this search.
     Skip ours when the most recent search event has the same criteria and arrived within 5 seconds
     (real time since this page mounted; RN.now() is a simulated clock). Impressions are still logged. */
  function justLogged(c) {
    const ev = (RN.store.state.events || []).slice(0, 5).find((e) => e.type === 'search');
    if (!ev || ev.source === 'tell_us') return false;
    const same = critKey({ q: String(ev.q || '').trim(), tags: ev.tags || [], filters: cleanFilters(ev.filters || {}) }) === critKey(c);
    const fresh = Date.now() - mountedAt < 5000 && Math.abs(RN.now().getTime() - new Date(ev.ts).getTime()) < 5000;
    return same && fresh;
  }
  function scheduleTrack(now) {
    const c = crit();
    const key = critKey(c);
    clearTimeout(trackTimer);
    if (key === lastKey) return;
    const source = landedCat ? 'category' : 'browse';
    trackTimer = setTimeout(() => {
      if (key === lastKey) return;
      lastKey = key;
      const res = run(c, 'best');
      const sorted = run(c);
      if (hasCrit(c) && !justLogged(c)) RN.track('search', { q: c.q, tags: c.tags, filters: clone(c.filters), results: res.length, source });
      sorted.slice(0, 12).forEach((r, i) => RN.track('impression', { opId: r.op.id, q: c.q, tags: c.tags, filters: clone(c.filters), position: i + 1, source }));
    }, now ? 0 : 900);
  }

  /* ---------- Filters drawer: RN.w.field only, standard keys and values ---------- */
  function withTempDef(key, def, fn) {
    // Browse needs availability as multi-select with the same options and slugs as RN.fields.availability.
    const had = Object.prototype.hasOwnProperty.call(RN.fields, key);
    RN.fields[key] = def;
    try { return fn(); } finally { if (!had) delete RN.fields[key]; }
  }
  function rateField(v) {
    const d = RN.fields.rateMax;
    if (RN.store.state.persona === 'visitor') {
      return `<div class="field" data-field="rateMax" data-br-rate><label>${esc(d.label)}</label>
        <div class="br-ratelock">${icon('lock')}<span>Rates are shown to signed-in clients.</span><button type="button" class="act" data-act="br-login">Log in</button></div></div>`;
    }
    const val = v && +v < d.max ? +v : d.max;
    return `<div class="field" data-field="rateMax" data-br-rate>
      <label for="f-rateMax">${esc(d.label)} <output class="br-rate-out" for="f-rateMax">${esc(rateText(val))}</output></label>
      <input class="range" type="range" id="f-rateMax" name="rateMax" min="${d.min}" max="${d.max}" step="25" value="${val}" aria-valuetext="${esc(rateText(val))}">
      <div class="br-rate-scale" aria-hidden="true"><span>$${d.min}</span><span>$${d.max}+</span></div>
    </div>`;
  }
  function formHtml(f) {
    const F = RN.fields;
    return `${RN.w.field('roleCategories', f.roleCategories || [], { name: 'roleCategories' })}
      ${withTempDef('brAvailability', Object.assign({}, F.availability, { type: 'multi', options: F.availability.options }), () => RN.w.field('brAvailability', f.availability || [], { name: 'availability', id: 'f-br-availability', help: 'Pick any that work for you.' }))}
      <div data-deselect>${RN.w.field('hoursPerMonth', (f.hoursPerMonth || [])[0] || '', { name: 'hoursPerMonth', help: 'Shows operators with at least this much time each month.' })}</div>
      ${RN.w.field('revenueRange', f.revenueRange || [], { name: 'revenueRange', label: 'Company revenue', help: 'Operators who work with companies in any selected range.' })}
      ${RN.w.field('employeeRange', f.employeeRange || [], { name: 'employeeRange', help: 'Operators who work with companies of any selected size.' })}
      ${RN.w.field('industries', f.industries || [], { name: 'industries', max: 3, help: 'Pick up to 3. Operators in any selected industry are shown.' })}
      ${RN.w.field('engagementTypes', f.engagementTypes || [], { name: 'engagementTypes', help: 'Operators who offer any selected type.' })}
      ${rateField(f.rateMax)}
      <div data-deselect>${RN.w.field('risMin', f.risMin || '', { name: 'risMin', help: 'Minimum score. Every approved profile starts at 50.' })}</div>`;
  }
  function readForm(form) {
    const d = RN.ui.formData(form);
    const cur = st().filters;
    const f = {};
    ['roleCategories', 'revenueRange', 'employeeRange', 'industries', 'engagementTypes'].forEach((k) => { if (Array.isArray(d[k]) && d[k].length) f[k] = d[k]; });
    const av = d.availability ? (Array.isArray(d.availability) ? d.availability : String(d.availability).split('|')).filter(Boolean) : [];
    if (av.length) f.availability = av;
    if (d.hoursPerMonth) f.hoursPerMonth = [d.hoursPerMonth];
    if (d.risMin) f.risMin = d.risMin;
    if ('rateMax' in d) { if (+d.rateMax < RN.fields.rateMax.max) f.rateMax = +d.rateMax; }
    else if (cur.rateMax) f.rateMax = cur.rateMax;
    Object.keys(cur).forEach((k) => { if (!FILTER_KEYS.includes(k)) f[k] = cur[k]; });
    return cleanFilters(f);
  }
  function drawerCount(form) {
    const c = crit();
    const n = run({ q: c.q, tags: c.tags, filters: readForm(form) }, 'best').length;
    const btn = document.querySelector('[data-br-apply]');
    if (btn) btn.textContent = n ? `Show ${RN.fmt.plural(n, 'operator')}` : 'Show closest matches';
  }
  function openDrawer() {
    setTagsOpen(false);
    const f = st().filters;
    RN.ui.drawer({
      title: 'Filters',
      sub: 'Same fields operators fill in when they join, so results line up exactly.',
      body: `<form id="br-ff" class="br-ff stack" data-submit="br-apply">${formHtml(f)}</form>`,
      foot: `<button type="button" class="btn btn-ghost" data-act="br-ff-clear">Clear all</button><button class="btn br-apply" type="submit" form="br-ff" data-br-apply>Show results</button>`,
      mount: (el) => {
        const form = el.querySelector('#br-ff');
        const onChange = () => drawerCount(form);
        el.addEventListener('change', onChange);
        el.addEventListener('input', (e) => {
          if (e.target.name === 'rateMax') {
            const out = el.querySelector('.br-rate-out');
            if (out) out.textContent = rateText(e.target.value);
            e.target.setAttribute('aria-valuetext', rateText(e.target.value));
            drawerCount(form);
          }
        });
        drawerCount(form);
      },
    });
  }
  RN.actions['br-filters'] = () => openDrawer();
  RN.actions['br-ff-clear'] = () => {
    const form = document.getElementById('br-ff');
    if (!form) return;
    form.innerHTML = formHtml({});
    drawerCount(form);
  };
  RN.submits['br-apply'] = (form) => {
    const f = readForm(form);
    RN.ui.closeModal();
    setCrit({ filters: f }, { trackNow: true });
  };
  // Signing in from inside the drawer unlocks the rate control in place
  RN.store.on((key) => {
    if (key !== 'persona') return;
    const box = document.querySelector('#br-ff [data-br-rate]');
    if (box) box.outerHTML = rateField(st().filters.rateMax);
  });

  /* ---------- Actions ---------- */
  let qTimer = null;
  RN.inputs['br-q'] = (el) => {
    const x = document.querySelector('.br-q-x'); if (x) x.hidden = !el.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => setCrit({ q: el.value }), 160);
  };
  RN.submits['br-search'] = (form) => {
    clearTimeout(qTimer);
    const i = form.querySelector('input[name=q]');
    setCrit({ q: i.value }, { trackNow: true });
    if (window.matchMedia('(max-width: 640px)').matches) i.blur();
  };
  RN.actions['br-q-clear'] = () => { clearTimeout(qTimer); const i = document.getElementById('br-q'); if (i) { i.value = ''; i.focus(); } setCrit({ q: '' }); };
  RN.actions['br-q-set'] = (el) => { const i = document.getElementById('br-q'); if (i) i.value = el.dataset.q; setCrit({ q: el.dataset.q }, { trackNow: true }); };
  RN.actions['br-tags-toggle'] = () => setTagsOpen(!tagsOpen);
  RN.actions['br-tags-close'] = () => { setTagsOpen(false); const b = document.getElementById('br-tags-btn'); if (b) b.focus(); };
  RN.inputs['br-tags'] = (el) => { const v = el.value ? el.value.split('|').filter(Boolean) : []; setCrit({ tags: v }, { fromPicker: true }); };
  RN.actions['br-tag-toggle'] = (el) => {
    const t = (RN.model.tagInfo(el.dataset.t) || {}).v || el.dataset.t;
    const tags = st().tags.slice();
    const i = tags.findIndex((x) => x.toLowerCase() === t.toLowerCase());
    if (i >= 0) tags.splice(i, 1);
    else { if (tags.length >= 5) { RN.ui.toast('Pick up to 5 focus areas. Remove one to add another.', { icon: 'info' }); return; } tags.push(t); }
    setCrit({ tags });
  };
  RN.actions['br-chip-x'] = (el) => {
    const k = el.dataset.k, v = el.dataset.v;
    const b = st();
    if (k === 'q') { const i = document.getElementById('br-q'); if (i) i.value = ''; setCrit({ q: '' }); return; }
    if (k === 'tags') { setCrit({ tags: b.tags.filter((t) => t !== v) }); return; }
    const f = clone(b.filters);
    if (Array.isArray(f[k])) f[k] = f[k].filter((x) => String(x) !== v); else delete f[k];
    setCrit({ filters: f });
  };
  RN.actions['br-clear'] = () => { const i = document.getElementById('br-q'); if (i) i.value = ''; setCrit({ q: '', tags: [], filters: {} }); };
  RN.actions['br-relax'] = (el) => {
    const c = without(crit(), { k: el.dataset.k, v: el.dataset.v });
    const i = document.getElementById('br-q'); if (i) i.value = c.q;
    setCrit({ q: c.q, tags: c.tags, filters: c.filters }, { trackNow: true });
  };
  RN.actions['br-sort'] = (el) => { RN.store.update((s) => { s.browse.sort = el.dataset.s; }, 'browse'); limit = PAGE; refresh({ noTrack: true }); const sel = document.querySelector('.br-sort-sel select'); if (sel) sel.value = el.dataset.s; };
  RN.inputs['br-sort-sel'] = (el) => { RN.store.update((s) => { s.browse.sort = el.value; }, 'browse'); limit = PAGE; refresh({ noTrack: true }); };
  RN.actions['br-more'] = () => { limit += PAGE; refresh({ noTrack: true }); };
  RN.actions['br-tell'] = (el) => {
    // The unmet need reaches Admin as a search event (results 0 from the zero state). If this exact search was
    // already logged, mark it (meta.tellUs) instead of logging it twice, so Admin's zero-result list does not double count.
    const c = crit();
    const key = critKey(c);
    const n = el.dataset.zero === '1' ? 0 : run(c).length;
    clearTimeout(trackTimer);
    const prev = (RN.store.state.events || []).slice(0, 15).find((e) => e.type === 'search');
    const same = prev && critKey({ q: String(prev.q || '').trim(), tags: prev.tags || [], filters: cleanFilters(prev.filters || {}) }) === key;
    if (same && lastKey === key) RN.store.update(() => { prev.meta = Object.assign({}, prev.meta, { tellUs: true }); }, 'events');
    else RN.track('search', { q: c.q, tags: c.tags, filters: clone(c.filters), results: n, source: 'tell_us', meta: { tellUs: true } });
    lastKey = key;
    RN.go('talk');
  };

  /* ---------- Sticky bar: minimize on scroll down, full again after 100px of scrolling up (L197) ---------- */
  let lastY = 0, upRun = 0;
  function setCompact(v) {
    if (compact === v) return;
    compact = v;
    const b = document.getElementById('br-bar');
    if (b) b.classList.toggle('is-compact', v);
  }
  window.addEventListener('scroll', () => {
    if (!document.getElementById('br-bar')) return;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    if (y < 180 || tagsOpen) { upRun = 0; setCompact(false); return; }
    if (dy > 0) { upRun = 0; setCompact(true); }
    else { upRun -= dy; if (upRun >= 100) setCompact(false); }
  }, { passive: true });
  document.addEventListener('mousedown', (e) => {
    if (!tagsOpen) return;
    const tp = document.getElementById('br-tp');
    if (!tp || tp.contains(e.target) || e.target.closest('#br-tags-btn') || e.target.closest('.scrim')) return;
    setTagsOpen(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tagsOpen) { e.stopPropagation(); RN.actions['br-tags-close'](); } }, true);
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawCharts, 150); });
  function drawCharts() {
    RN.$$('[data-br-chart]').forEach((box) => { box.innerHTML = rateChart(box.dataset.brChart, box.clientWidth || 360); });
  }

  /* Other surfaces can link with filters: <button data-act="br-open" data-q="" data-tags="A|B" data-filters='{"roleCategories":["marketing"]}'> */
  RN.actions['br-open'] = (el) => {
    let f = {};
    try { f = el.dataset.filters ? JSON.parse(el.dataset.filters) : {}; } catch (e) { f = {}; }
    RN.ui.closeModal && RN.ui.closeModal();
    BR.go({ q: el.dataset.q || '', tags: el.dataset.tags ? el.dataset.tags.split('|').filter(Boolean) : [], filters: f });
  };

  function mount() {
    if (!mountedAt) mountedAt = Date.now();
    lastY = window.scrollY;
    const qi = document.getElementById('br-q');
    if (qi && window.matchMedia('(max-width: 640px)').matches) qi.placeholder = 'Search operators';
    drawCharts();
    scheduleTrack();
  }
  function unmount() {
    clearTimeout(trackTimer);
    lastKey = null; mountedAt = 0; landedCat = null; tagsOpen = false; compact = false; limit = PAGE;
  }

  /* ---------- Views ---------- */
  RN.view('browse', {
    route: 'browse', nav: 'browse',
    title: () => 'Browse fractional GTM operators',
    render: () => { RN.model.applyEdits(); landedCat = null; return page(null); },
    mount, unmount,
  });
  RN.view('browse-cat', {
    route: 'browse.:cat', nav: 'browse',
    samples: { cat: 'revenue_operations', extra: RN.fields.roleCategory.options.map((o) => 'browse.' + o.v).filter((r) => r !== 'browse.revenue_operations') },
    title: (p) => { const k = catValid(p.cat); return k ? `Fractional ${RN.fields.catLabel(k)} for hire` : 'Browse fractional GTM operators'; },
    render: (p) => { RN.model.applyEdits(); const k = catValid(p.cat); if (!k) { landedCat = null; return page(null); } return page(k); },
    mount, unmount,
  });
})();
