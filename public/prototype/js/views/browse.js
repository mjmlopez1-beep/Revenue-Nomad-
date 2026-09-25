/* Browse talent (#browse) and role category landing pages (#browse.<roleCategory slug>).
   State lives in RN.store.state.browse {q, tags, filters, sort, view}. The home hero (and any
   Insights chart) writes q / tags / filters there and routes here, or calls RN.browse.go(criteria).
   Search rules come from RN.model.search: role categories OR, focus areas AND (up to 5),
   industries OR (up to 3), every other filter AND. Every filter control is RN.w.field, so the
   values are the same slugs operators store at signup.
   Loops wired here: search + impressions (Studio "Why you appeared"), zero-result searches
   ("Tell us what you need" -> Admin demand, with the search handed to #talk in seen.talkPrefill),
   compare_add / shortlist via the shared card, saved searches (seen.savedSearches
   [{id, name, q, tags, filters, createdAt, owner}], owner = the client's email; also listed in the
   client workspace; run one from anywhere with data-act="br-saved-apply" data-id="<id>").
   "Client-verified proof" (filters.verifiedProof) is applied here, after RN.model.search. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const BR = (RN.browse = RN.browse || {});

  const PAGE = 24;
  const FILTER_KEYS = ['verifiedProof', 'roleCategories', 'availability', 'hoursPerMonth', 'revenueRange', 'employeeRange', 'industries', 'salesMotions', 'engagementTypes', 'rateMax', 'risMin'];
  // Chip colour by field type (founder L222): role, focus area, industry, availability, company, engagement, rate, reputation, proof
  const TYPE = { q: 'q', tags: 'focus', roleCategories: 'role', availability: 'avail', hoursPerMonth: 'avail', revenueRange: 'company', employeeRange: 'company', industries: 'industry', engagementTypes: 'engage', salesMotions: 'motion', rateMax: 'rate', risMin: 'ris', verifiedProof: 'proof' };
  const PROOF = 'Client-verified proof';
  const REV_LABEL = () => RN.fields.revenueRange.clientLabel || 'Company revenue';
  // Each category page links to its own Engagement Blueprint (RN.projects.blueprints ids)
  const CAT_BP = { sales_leadership: 'vp-sales', marketing: 'vp-marketing', revenue_operations: 'vp-revops', customer_success_growth: 'vp-cs', sales_enablement: 'enablement-director', ai_gtm: 'ai-gtm-architect', partnerships: 'vp-partnerships', sellers: 'account-executive' };
  const THIN = 5; // fewer live operators than this in a category: capture the demand instead of showing a thin page
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

  /* Client-verified proof: at least one client review, or a focus area a client confirmed (tier verified or expert) */
  const hasProof = (op) => (op.reviews || []).length > 0 || (op.tags || []).some((t) => t.tier !== 'claimed');
  BR.hasProof = hasProof;

  /* Run the model search with the view's sort rules. */
  function run(c, sort) {
    RN.model.applyEdits && RN.model.applyEdits();
    sort = sort || st().sort;
    let res = RN.model.search({ q: c.q, tags: c.tags, filters: c.filters, sort });
    // A budget filter only keeps operators who publish a rate (Studio tells operators: no rate, no budget searches)
    if (c.filters.rateMax) res = res.filter((r) => r.op.rate);
    if (c.filters.verifiedProof) res = res.filter((r) => hasProof(r.op));
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

  /* A request written the way clients talk becomes standard filters (RN.model.understandSearch). Returns the browse
     state patch, or null when the text reads as plain keywords. base: filters to keep (set by hand). */
  BR.fromText = function (text, base) {
    const u = String(text || '').trim() ? RN.model.understandSearch(text, base || {}) : null;
    if (!u || !u.natural) return null;
    return { q: u.applied.q, filters: u.applied.filters, said: String(text).trim(), saidKeys: u.keys, saidDropped: u.dropped.map((f) => f.label), need: u.need || undefined };
  };
  const saidBase = () => { const b = st(); const base = cleanFilters(b.filters); (b.saidKeys || []).forEach((k) => delete base[k]); return base; };
  const setSaid = (said, keys, dropped, need) => RN.store.update((s) => { s.browse.said = said || ''; s.browse.saidKeys = keys || []; s.browse.saidDropped = dropped || []; if (need) s.browse.need = need; }, 'browse');
  function applyText(text, o) {
    const patch = BR.fromText(text, saidBase());
    if (patch) { setSaid(patch.said, patch.saidKeys, patch.saidDropped, patch.need); setCrit({ q: patch.q, filters: patch.filters }, o); return; }
    const hadSaid = !!st().said;
    const base = saidBase();
    if (hadSaid) setSaid('');
    setCrit(hadSaid ? { q: text, filters: base } : { q: text }, o);
  }

  BR.go = function (c) {
    c = c || {};
    if (c.q && !c.said && !Object.keys(c.filters || {}).length) { const p = BR.fromText(c.q, {}); if (p) c = Object.assign({}, c, p); }
    RN.store.update((s) => {
      s.browse = Object.assign({ sort: 'best', view: 'grid' }, s.browse || {}, { q: c.q || '', tags: (c.tags || []).slice(0, 5), filters: cleanFilters(c.filters || {}), said: c.said || '', saidKeys: c.saidKeys || [], saidDropped: c.saidDropped || [] }, c.need ? { need: c.need } : {});
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
      case 'verifiedProof': return PROOF;
      default: return RN.fields[k] ? RN.w.label(k, v) : String(v);
    }
  }
  const typeName = (k) => ({ q: 'Search', tags: 'Focus area', revenueRange: REV_LABEL(), rateMax: 'Hourly rate', hoursPerMonth: 'Minimum available time', verifiedProof: 'Proof' }[k] || (RN.fields[k] ? RN.fields[k].label : k));
  const chipAria = (k, v) => (k === 'verifiedProof' ? `Remove filter: ${PROOF}` : `Remove ${typeName(k)}: ${chipText(k, v)}`);
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
      onClose: o.onClose,
      title: esc(o.title || 'Log in to see rates'),
      sub: esc(o.sub || 'Hourly rates and match signals are shown to signed-in clients. Browsing stays open to everyone.'),
      body: `<div class="stack" style="--gap:12px">
        <button type="button" class="optcard" data-act="persona" data-p="buyer"><b>Continue as ${esc(p.name)} <span class="muted" style="font-weight:500">· ${esc(p.sub)}</span></b><span>Prototype client account. You stay on this page.</span></button>
        <button type="button" class="act" data-act="br-login-all" style="align-self:flex-start">${icon('user')}Log in as an operator or the team</button>
      </div>`,
    });
  };
  // Remember the search that led to a profile, so Studio can count views per search term
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('main[data-view^="browse"] a[data-track-view]');
    if (a && st().q) RN.store.state._viewQ = st().q;
  }, true);
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
        <div id="br-saved" class="br-saved">${savedRow(c)}</div>
        <div id="br-assist" class="br-assist">${assist(c, cat)}</div>
        <div class="br-rhead">
          <div class="br-rhead-l">
            <p id="br-count" class="br-count" aria-live="polite">${countHtml(res, c)}</p>
            <span id="br-save-slot" class="br-save-slot">${saveBtn(c)}</span>
          </div>
          <div class="br-rhead-r">
            ${proofSwitch(c)}
            ${sortHtml()}
          </div>
        </div>
        <div id="br-results" data-view-source="search">${resultsHtml(res, c)}</div>
      </section>
      ${cat ? thinBlock(cat) : ''}
      ${cat ? catPlan(cat) : ''}
      ${rolesNav(cat)}
    </div>`;
  }

  function genHead() {
    return `<header class="wrap br-head">
      <span class="eyebrow">Direct access to talent</span>
      <h1 class="h1">Browse <span class="serif">operators</span></h1>
      <p class="lede">Open profiles. Reviews and focus areas a client confirmed are marked Verified. No login needed to browse.</p>
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
    // Same range and $500 rounding as the Rate Index estimator; all-in adds the 25% Revenue Nomad fee (rate / 0.75)
    const mr = idx && RN.model.monthlyRange ? RN.model.monthlyRange(cat, null, '40') : null;
    const r500 = (n) => Math.round(n / 500) * 500;
    const allIn = mr ? `${RN.fmt.usd(r500(mr.lo / 0.75))} - ${RN.fmt.usd(r500(mr.hi / 0.75))}/mo` : '';
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
          <p class="small">Typical range <b>$${esc(idx.p25)}–$${esc(idx.p75)} / hr</b> (middle half of ${esc(idx.n)} profiles).</p>
          ${mr ? `<dl class="br-rate-mo">
            <div><dt>Operator rates at ${esc(RN.w.label('hoursPerMonth', '40'))}</dt><dd class="tnum">${esc(mr.label)}</dd></div>
            <div><dt>All-in through Revenue Nomad, including the 25% fee</dt><dd class="tnum">${esc(allIn)}</dd></div>
          </dl>` : ''}
          <div class="br-rate-chart" data-br-chart="${esc(cat)}" aria-label="Median hourly rate by role category"></div>
          <div class="row between br-rate-foot"><a class="act" href="#rates">Open the Rate Index${icon('arrow')}</a>${RN.ui.illus('Illustrative figures')}</div>
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

  /* The category's own Blueprints (primary first) and up to 2 guides for it (general client guides fill the gap) */
  function catBlueprints(cat) {
    const all = (RN.projects && RN.projects.blueprints) || [];
    const main = all.find((b) => b.id === CAT_BP[cat]);
    return (main ? [main] : []).concat(all.filter((b) => b.cat === cat && b !== main));
  }
  function catGuides(cat) {
    const all = (RN.research && RN.research.guides) || [];
    const own = all.filter((g) => g.cat === cat);
    const general = all.filter((g) => !g.cat && g.group === 'clients');
    return own.concat(general).slice(0, 2);
  }
  const guideRoute = () => Object.values(RN.views || {}).some((v) => v.tokens && v.tokens.length === 2 && v.tokens[0] === 'guide');
  function catPlan(cat) {
    const noun = CAT[cat].noun;
    const label = RN.fields.catLabel(cat);
    const bps = catBlueprints(cat);
    const guides = catGuides(cat);
    const perGuide = guideRoute();
    const link = (href, text) => `<li><a class="act" href="${href}">${esc(text)}${icon('arrow')}</a></li>`;
    return `<section class="wrap br-plan" aria-labelledby="br-plan-h">
      <h2 class="h3" id="br-plan-h">Plan a fractional ${esc(noun)} engagement</h2>
      <div class="grid g-3" style="--gap:16px">
        <a class="card card-link br-plan-card" href="#rates">${icon('chart')}<h3 class="h4">What does a fractional ${esc(noun)} cost?</h3><p class="small muted">Hourly medians and ranges for ${esc(label)}, adjusted for company revenue, in the Rate Index.</p><span class="act">See rates${icon('arrow')}</span></a>
        <div class="card br-plan-card">${icon('layers')}<h3 class="h4">Scope it from a Blueprint</h3>
          <p class="small muted">${bps.length ? esc(bps[0].blurb) + ' ' : ''}Hours, term and a 30/60/90-day plan. Post it as a project in minutes.</p>
          <ul class="br-plan-links">${bps.length ? bps.map((b) => link('#blueprint.' + esc(b.id), `${b.role} Blueprint`)).join('') : link('#blueprints', 'Browse Blueprints')}</ul></div>
        <div class="card br-plan-card">${icon('book')}<h3 class="h4">Hiring guides</h3>
          <p class="small muted">Plain answers on scoping, pricing and managing a fractional ${esc(noun)}.</p>
          <ul class="br-plan-links">${perGuide ? guides.map((g) => link('#guide.' + esc(g.slug), g.q)).join('') : ''}${link('#guides', perGuide && guides.length ? 'All guides' : 'Read the guides')}</ul></div>
      </div>
    </section>`;
  }

  /* Thin categories (fewer than THIN live operators): say so, capture the need, show adjacent expertise */
  const catCount = (cat) => RN.model.ops.filter((op) => !op.hidden && op.catKey === cat).length;
  function thinNote(cat) {
    const n = catCount(cat);
    const label = RN.fields.catLabel(cat);
    return `<div class="br-thin-note">
      <span class="br-zero-ic">${icon('users')}</span>
      <div class="grow stack" style="--gap:4px">
        <h2 class="h4">${n === 1 ? `One ${esc(label)} operator is live today` : `${esc(RN.fmt.int(n))} ${esc(label)} operators are live today`}</h2>
        <p class="small muted">Tell us what you need and our team will find more ${esc(CAT[cat].noun)}s for you. Your search comes with you.</p>
      </div>
      <button type="button" class="btn btn-line" data-act="br-tell" data-zero="">Tell us what you need</button>
    </div>`;
  }
  function thinBlock(cat) {
    if (catCount(cat) >= THIN) return '';
    const label = RN.fields.catLabel(cat);
    const near = RN.model.ops.filter((op) => !op.hidden && op.catKey !== cat)
      .map((op) => { const t = (op.tags || []).filter((x) => x.c === cat).sort((a, b) => (a.tier === 'claimed') - (b.tier === 'claimed')); return { op, t, v: t.filter((x) => x.tier !== 'claimed').length }; })
      .filter((x) => x.t.length)
      .sort((a, b) => b.v - a.v || b.t.length - a.t.length || b.op.ris.score - a.op.ris.score)
      .slice(0, 3);
    if (!near.length) return '';
    return `<section class="wrap br-near" aria-labelledby="br-near-h" data-view-source="search">
      <h2 class="h4" id="br-near-h">Operators in other categories with ${esc(label)} focus areas</h2>
      <div class="grid g-3 br-grid">${near.map((x) => BR.card(x.op, { why: x.v ? `Client-verified in ${x.t.filter((t) => t.tier !== 'claimed').slice(0, 2).map((t) => t.t).join(' and ')}` : `Lists ${x.t.slice(0, 2).map((t) => t.t).join(' and ')}` })).join('')}</div>
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
    const nt = c.tags.length, nf = filterCount(c);
    return `<button type="button" class="btn btn-line br-bar-btn" data-act="br-tags-toggle" aria-expanded="${tagsOpen}" aria-controls="br-tp" id="br-tags-btn" aria-label="Focus areas${nt ? `, ${nt} selected` : ''}">${icon('target')}<span class="br-bar-l">Focus areas</span>${badge(nt)}</button>
      <button type="button" class="btn btn-line br-bar-btn" data-act="br-filters" id="br-filters-btn" aria-haspopup="dialog" aria-label="Filters${nf ? `, ${nf} active` : ''}">${icon('sliders')}<span class="br-bar-l">Filters</span>${badge(nf)}</button>`;
  }
  function bar(c) {
    return `<div class="br-bar${compact ? ' is-compact' : ''}" id="br-bar">
      <div class="wrap br-bar-in">
        <form class="br-search" role="search" data-submit="br-search" autocomplete="off">
          <label class="sr-only" for="br-q">Search operators</label>
          ${icon('search')}
          <input id="br-q" class="br-q" name="q" type="search" enterkeyhint="search" value="${esc(st().said || st().q)}" placeholder="Describe what you need, or search a role, skill or name" data-input="br-q">
          <button type="button" class="br-q-x" data-act="br-q-clear" aria-label="Clear search" ${st().said || st().q ? '' : 'hidden'}>${icon('x')}</button>
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
  function saidNote() {
    const b = st();
    if (!b.said) return '';
    const dropped = b.saidDropped || [];
    return `<div class="br-said" role="status">${icon('message')}<p><b>We matched your request to these filters.</b> Remove any that don’t fit.${dropped.length ? ` No operator matched all of it, so we left out: ${dropped.map(esc).join('; ')}.` : ''}</p>
      <button type="button" class="act" data-act="br-said-exact">Search the exact words instead</button></div>`;
  }
  function assist(c, cat) {
    const chips = chipList(c);
    if (chips.length) {
      return `${saidNote()}<div class="br-chips" role="list" aria-label="Active filters">
        ${chips.map((x) => `<span role="listitem"><button type="button" class="br-fchip" data-type="${esc(TYPE[x.k] || 'other')}" data-act="br-chip-x" data-k="${esc(x.k)}" data-v="${esc(x.v)}" title="${esc(typeName(x.k))}" aria-label="${esc(chipAria(x.k, x.v))}">${x.k === 'q' ? icon('search') : x.k === 'verifiedProof' ? icon('seal') : '<i></i>'}<span>${esc(chipText(x.k, x.v))}</span>${icon('x')}</button></span>`).join('')}
        ${chips.length > 1 ? `<span role="listitem"><button type="button" class="act muted br-clear" data-act="br-clear">Clear all</button></span>` : ''}
      </div>`;
    }
    if (cat) return '';
    const pop = RN.data.market.queries.filter((q) => !q.zero).slice().sort((a, b) => b.vol - a.vol).slice(0, 6);
    return `<div class="br-popular"><span class="label">Popular searches</span>
      <div class="br-popular-list">${pop.map((q) => `<button type="button" class="chip chip-sm" data-act="br-q-set" data-q="${esc(q.q)}">${esc(q.q)}</button>`).join('')}</div></div>`;
  }

  /* ---------- Saved searches: RN.store.state.seen.savedSearches [{id, name, q, tags, filters, createdAt}] ---------- */
  const isClient = () => RN.store.state.persona === 'buyer';
  // Each record carries owner (the client's email); Browse and the workspace list only the signed-in client's own
  const me = () => String(RN.personas.buyer.email || '').toLowerCase();
  const allSaved = () => { const s = RN.store.state.seen; return s && Array.isArray(s.savedSearches) ? s.savedSearches : []; };
  function savedList() { const m = me(); return allSaved().filter((x) => String(x.owner || '').toLowerCase() === m); }
  BR.saved = savedList;
  const savedKey = (x) => critKey({ q: String(x.q || '').trim(), tags: (x.tags || []).slice(0, 5), filters: cleanFilters(x.filters || {}) });
  const findSaved = (c) => { const k = critKey(c); return savedList().find((x) => savedKey(x) === k) || null; };
  function critParts(c) { return chipList(c).map((x) => (x.k === 'q' ? x.v : chipText(x.k, x.v))); }
  function defaultName(c) {
    const parts = critParts(c);
    let name = parts.slice(0, 2).join(' · ') + (parts.length > 2 ? ` +${parts.length - 2}` : '');
    return name.length > 60 ? name.slice(0, 59).trim() + '…' : name;
  }
  function savedRow(c) {
    const list = isClient() ? savedList() : [];
    if (!list.length) return '';
    const k = critKey(c);
    return `<div class="br-sv-row"><span class="label" id="br-sv-l">Saved searches</span>
      <ul class="br-sv-list" aria-labelledby="br-sv-l">${list.map((x) => {
        const on = savedKey(x) === k;
        return `<li class="br-sv${on ? ' on' : ''}"><button type="button" class="br-sv-go" data-act="br-saved-apply" data-id="${esc(x.id)}" aria-pressed="${on}" aria-label="Saved search: ${esc(x.name)}" title="${esc(critParts({ q: x.q || '', tags: x.tags || [], filters: cleanFilters(x.filters || {}) }).join(' · '))}">${icon(on ? 'check' : 'bookmark')}<span>${esc(x.name)}</span></button><button type="button" class="br-sv-x" data-act="br-saved-del" data-id="${esc(x.id)}" aria-label="Delete saved search: ${esc(x.name)}">${icon('x')}</button></li>`;
      }).join('')}</ul></div>`;
  }
  function saveBtn(c) {
    if (!hasCrit(c)) return '';
    const ex = isClient() ? findSaved(c) : null;
    return ex
      ? `<button type="button" class="act br-save on" data-act="br-save" aria-label="Saved as ${esc(ex.name)}. Rename or delete">${icon('check')}Saved</button>`
      : `<button type="button" class="act br-save" data-act="br-save">${icon('bookmark')}Save search</button>`;
  }
  function proofSwitch(c) {
    return `<label class="switch br-proof-sw" title="Operators with a client review or a focus area a client confirmed"><input type="checkbox" data-change="br-proof" ${c.filters.verifiedProof ? 'checked' : ''}><i></i><span>${PROOF}</span></label>`;
  }
  const refocus = (sel) => { const el = document.querySelector('.br-page ' + sel); if (el) el.focus(); };
  function syncSaved() {
    const c = crit();
    const a = document.getElementById('br-saved'); if (a) a.innerHTML = savedRow(c);
    const b = document.getElementById('br-save-slot'); if (b) b.innerHTML = saveBtn(c);
  }

  // A rate filter hides operators who don't publish a rate; say how many, with a one-click way back
  function unlistedNote(c) {
    if (!c.filters.rateMax) return '';
    const f = Object.assign({}, c.filters); delete f.rateMax;
    const n = RN.model.search({ q: c.q, tags: c.tags, filters: f }).filter((r) => !r.op.rate && (!c.filters.verifiedProof || hasProof(r.op))).length;
    return n ? ` <span class="br-count-note">· ${RN.fmt.int(n)} more don’t list a rate. <button type="button" class="act" data-act="br-chip-x" data-k="rateMax">Clear the rate filter</button></span>` : '';
  }
  function countHtml(res, c) {
    const n = res.length;
    if (!n) return '<b class="num">0</b> operators match' + unlistedNote(c);
    return `<b class="num">${RN.fmt.int(n)}</b> ${n === 1 ? 'operator' : 'operators'}${hasCrit(c) ? ' match' : ''}${unlistedNote(c)}`;
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
      ${landedCat && catCount(landedCat) < THIN ? thinNote(landedCat) : `<p class="br-tell">${icon('message')}<span>Not seeing the right fit? <button type="button" class="act" data-act="br-tell" data-zero="">Tell us what you need</button> and our team will shortlist operators for you.</span></p>`}`;
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
    set('br-saved', savedRow(c));
    set('br-save-slot', saveBtn(c));
    const pc = root.querySelector('.br-proof-sw input'); if (pc) pc.checked = !!c.filters.verifiedProof;
    const shown = st().said || st().q;
    const x = root.querySelector('.br-q-x'); if (x) x.hidden = !shown;
    const qi = document.getElementById('br-q'); if (qi && document.activeElement !== qi && qi.value !== shown) qi.value = shown;
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
      if (hasCrit(c) && !justLogged(c)) RN.track('search', Object.assign({ q: c.q, tags: c.tags, filters: clone(c.filters), results: res.length, source }, st().said ? { said: st().said } : {}));
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
  function availField(v) {
    const F = RN.fields;
    const o = { name: 'availability', id: 'f-br-availability', help: 'Pick any that work for you.' };
    // Uses the registry's multi-select availability once it exists (core request); until then a same-slug stand-in
    if (F.availabilities) return RN.w.field('availabilities', v, o);
    return withTempDef('brAvailability', Object.assign({}, F.availability, { type: 'multi', options: F.availability.options }), () => RN.w.field('brAvailability', v, o));
  }
  function formHtml(f) {
    return `<div class="field br-proof-field" data-field="verifiedProof">
        <label class="switch br-proof"><input type="checkbox" name="verifiedProof" value="1" ${f.verifiedProof ? 'checked' : ''}><i></i><span><b>${PROOF}</b><span class="small muted">Only operators with a client review or a focus area a client confirmed.</span></span></label>
      </div>
      ${RN.w.field('roleCategories', f.roleCategories || [], { name: 'roleCategories' })}
      ${availField(f.availability || [])}
      <div data-deselect>${RN.w.field('minHours', (f.hoursPerMonth || [])[0] || '', { name: 'hoursPerMonth', help: 'Operators with at least this much time a month for a new client.' })}</div>
      ${RN.w.field('revenueRange', f.revenueRange || [], { name: 'revenueRange', label: REV_LABEL(), help: 'Operators who work with companies in any selected range.' })}
      ${RN.w.field('employeeRange', f.employeeRange || [], { name: 'employeeRange', help: 'Operators who work with companies of any selected size.' })}
      ${RN.w.field('industries', f.industries || [], { name: 'industries', max: 3, help: 'Pick up to 3. Operators in any selected industry are shown.' })}
      ${RN.w.field('salesMotions', f.salesMotions || [], { name: 'salesMotions', help: 'Operators with experience in any selected motion.' + (RN.model.ops.filter((op) => !op.hidden && (op.motions || []).length).length < 10 ? ' Few profiles list it yet.' : '') })}
      ${RN.w.field('engagementTypes', f.engagementTypes || [], { name: 'engagementTypes', help: 'Operators who offer any selected type.' })}
      ${rateField(f.rateMax)}
      <div data-deselect>${RN.w.field('risMin', f.risMin || '', { name: 'risMin', help: 'Minimum score. Every approved profile starts at 50.' })}</div>`;
  }
  function readForm(form) {
    const d = RN.ui.formData(form);
    const cur = st().filters;
    const f = {};
    if ([].concat(d.verifiedProof || []).length) f.verifiedProof = true;
    ['roleCategories', 'revenueRange', 'employeeRange', 'industries', 'salesMotions', 'engagementTypes'].forEach((k) => { if (Array.isArray(d[k]) && d[k].length) f[k] = d[k]; });
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
  // Signing in from inside the drawer unlocks the rate control in place.
  // A visitor who clicked Save search and then signed in as a client gets the search saved (no second click).
  let pendingSave = false;
  RN.store.on((key) => {
    if (key !== 'persona') return;
    const box = document.querySelector('#br-ff [data-br-rate]');
    if (box) box.outerHTML = rateField(st().filters.rateMax);
    if (pendingSave && isClient()) {
      pendingSave = false;
      setTimeout(() => { if (document.querySelector('.br-page') && isClient()) RN.actions['br-save'](); }, 80);
    }
  });

  /* ---------- Saved search and proof actions ---------- */
  RN.inputs['br-proof'] = (el) => {
    const f = clone(st().filters);
    if (el.checked) f.verifiedProof = true; else delete f.verifiedProof;
    setCrit({ filters: f }, { trackNow: true });
  };
  RN.actions['br-save'] = () => {
    const c = crit();
    if (!hasCrit(c)) return;
    if (!isClient()) {
      pendingSave = true;
      BR.loginPrompt({ title: 'Log in to save this search', sub: 'Signed-in clients save searches and run them again in one click. Browsing stays open to everyone.', onClose: () => { pendingSave = false; } });
      return;
    }
    const ex = findSaved(c);
    if (ex) { renameSaved(ex.id); return; }
    const rec = { id: RN.uid('ss'), name: defaultName(c), q: c.q, tags: c.tags.slice(), filters: clone(c.filters), createdAt: RN.now().toISOString(), owner: RN.personas.buyer.email };
    RN.store.update((s) => {
      s.seen = s.seen || {};
      s.seen.savedSearches = [rec].concat(Array.isArray(s.seen.savedSearches) ? s.seen.savedSearches : []).slice(0, 20);
    }, 'seen');
    RN.track('saved_search', { q: rec.q, tags: rec.tags, filters: clone(rec.filters), results: run(c, 'best').length, source: landedCat ? 'category' : 'browse', meta: { savedSearchId: rec.id, name: rec.name } });
    RN.mail(RN.personas.buyer.email, `Search saved: ${rec.name}`, `You saved “${rec.name}” on Revenue Nomad.\n\nRun it again in one click from Browse or your workspace. We will email you when a new operator matches it.`, 'system');
    syncSaved();
    refocus('.br-save');
    RN.ui.toast(`Search saved as “${esc(rec.name)}”`, { action: { label: 'Rename', act: 'br-saved-rename', attrs: `data-id="${esc(rec.id)}"` } });
  };
  function renameSaved(id) {
    const x = savedList().find((s) => s.id === id);
    if (!x) return;
    const summary = critParts({ q: x.q || '', tags: x.tags || [], filters: cleanFilters(x.filters || {}) }).join(' · ');
    RN.ui.modal({
      width: 460,
      title: 'Name this search',
      sub: 'Saved searches are listed on Browse and in your workspace.',
      body: `<form id="br-sv-form" class="stack" style="--gap:12px" data-submit="br-saved-name" data-id="${esc(id)}">
        <div class="field"><label for="br-sv-name">Name</label><input class="input" id="br-sv-name" name="name" maxlength="60" required autocomplete="off" value="${esc(x.name)}"></div>
        <p class="small muted">${esc(summary)}</p>
      </form>`,
      foot: `<button type="button" class="act muted" data-act="br-saved-del" data-id="${esc(id)}">${icon('x')}Delete saved search</button><span class="grow"></span><button class="btn" type="submit" form="br-sv-form">Save name</button>`,
    });
  }
  RN.actions['br-saved-rename'] = (el) => renameSaved(el.dataset.id);
  RN.submits['br-saved-name'] = (form, data) => {
    const name = String(data.name || '').trim().slice(0, 60);
    if (!name) { RN.ui.toast('Give the search a name.', { icon: 'info' }); return; }
    RN.store.update((s) => { const x = ((s.seen || {}).savedSearches || []).find((y) => y.id === form.dataset.id); if (x) x.name = name; }, 'seen');
    RN.ui.closeModal();
    syncSaved();
    RN.ui.toast(`Renamed to “${esc(name)}”`);
  };
  let lastDeleted = null;
  RN.actions['br-saved-del'] = (el) => {
    const id = el.dataset.id;
    const list = savedList();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const inModal = !!el.closest('.modal');
    if (inModal) RN.ui.closeModal();
    lastDeleted = { rec: list[i], at: allSaved().indexOf(list[i]) };
    RN.store.update((s) => { s.seen.savedSearches = s.seen.savedSearches.filter((x) => x.id !== id); }, 'seen');
    syncSaved();
    if (!inModal) { const left = RN.$$('[data-act="br-saved-apply"]'); if (left.length) left[Math.min(i, left.length - 1)].focus(); else refocus('#br-q'); }
    else refocus('.br-save');
    RN.ui.toast(`Deleted “${esc(lastDeleted.rec.name)}”`, { action: { label: 'Undo', act: 'br-saved-undo' } });
  };
  RN.actions['br-saved-undo'] = () => {
    if (!lastDeleted) return;
    const d = lastDeleted; lastDeleted = null;
    RN.store.update((s) => { s.seen = s.seen || {}; const l = Array.isArray(s.seen.savedSearches) ? s.seen.savedSearches : []; l.splice(Math.min(Math.max(0, d.at), l.length), 0, d.rec); s.seen.savedSearches = l; }, 'seen');
    syncSaved();
  };
  /* Run a saved search. On Browse the chip toggles (pressed again clears it); anywhere else it opens Browse. */
  RN.actions['br-saved-apply'] = (el) => {
    const x = savedList().find((s) => s.id === el.dataset.id);
    if (!x) return;
    const c = { q: x.q || '', tags: (x.tags || []).slice(0, 5), filters: clone(x.filters || {}) };
    if (!el.closest('.br-page')) { RN.ui.closeModal(); BR.go(c); return; }
    if (el.getAttribute('aria-pressed') === 'true') { RN.actions['br-clear'](); return; }
    const i = document.getElementById('br-q'); if (i) i.value = c.q;
    setCrit(c, { trackNow: true });
    refocus(`[data-act="br-saved-apply"][data-id="${x.id}"]`);
  };

  /* ---------- Actions ---------- */
  let qTimer = null;
  // Keywords search as you type; a sentence waits for a pause (or Enter) so filters don't jump while you write
  RN.inputs['br-q'] = (el) => {
    const x = document.querySelector('.br-q-x'); if (x) x.hidden = !el.value;
    clearTimeout(qTimer);
    const natural = RN.model.understand(el.value).natural;
    qTimer = setTimeout(() => applyText(el.value), natural ? 900 : 160);
  };
  RN.submits['br-search'] = (form) => {
    clearTimeout(qTimer);
    const i = form.querySelector('input[name=q]');
    applyText(i.value, { trackNow: true });
    if (window.matchMedia('(max-width: 640px)').matches) i.blur();
  };
  RN.actions['br-q-clear'] = () => { clearTimeout(qTimer); const i = document.getElementById('br-q'); if (i) { i.value = ''; i.focus(); } applyText(''); };
  // Undo the reading: search the sentence as plain words, without the filters it produced
  RN.actions['br-said-exact'] = () => { const said = st().said; const base = saidBase(); setSaid(''); setCrit({ q: said, filters: base }, { trackNow: true }); };
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
  RN.actions['br-clear'] = () => { const i = document.getElementById('br-q'); if (i) i.value = ''; setSaid(''); setCrit({ q: '', tags: [], filters: {} }); };
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
    // Hand the search to Talk to us so the client does not describe the need twice (pages.js reads and clears it)
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen.talkPrefill = { q: c.q, tags: c.tags.slice(), filters: clone(c.filters), source: landedCat ? 'category' : 'browse', results: n }; }, 'seen');
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
