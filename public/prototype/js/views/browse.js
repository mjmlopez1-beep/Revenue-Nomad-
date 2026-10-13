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
   "Client-verified proof" (filters.verifiedProof) is applied here, after RN.model.search.
   Location filters (D9): filters.locations (countries or US states, OR), filters.timeZones (OR) and
   filters.usHours ('yes': based in the US or answered yes). RN.model.search applies them; the drawer uses
   RN.fields.locations / RN.fields.timeZones and RN.model.place(op), with small fallbacks until those exist. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const BR = (RN.browse = RN.browse || {});

  // 24 per page; 12 on phones, where each card is a full screen tall
  const pageSize = () => (window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 12 : 24);
  const FILTER_KEYS = ['verifiedProof', 'roleCategories', 'availability', 'hoursPerMonth', 'locations', 'timeZones', 'usHours', 'revenueRange', 'employeeRange', 'industries', 'salesMotions', 'engagementTypes', 'rateMax', 'risMin'];
  // Chip colour by field type (L222): role, focus area, industry, availability, location, company, engagement, rate, reputation, proof
  const TYPE = { q: 'q', tags: 'focus', roleCategories: 'role', availability: 'avail', hoursPerMonth: 'avail', locations: 'location', timeZones: 'location', usHours: 'location', revenueRange: 'company', employeeRange: 'company', industries: 'industry', engagementTypes: 'engage', salesMotions: 'motion', rateMax: 'rate', risMin: 'ris', verifiedProof: 'proof' };
  const PROOF = 'Company-verified proof';
  const US_HOURS = 'Works US hours';
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

  let limit = pageSize();
  let lastAdded = null;      // the criterion added most recently (zero-result relax picks it first)
  let tagsOpen = false;      // Focus areas popover
  let landedCat = null;      // category landing currently applied
  let compact = false;       // sticky bar minimized while scrolling down

  /* Client-verified proof: at least one client review, or a focus area a client confirmed (tier verified or expert) */
  const hasProof = (op) => (op.reviews || []).length > 0 || (op.tags || []).some((t) => t.tier !== 'claimed');
  BR.hasProof = hasProof;

  /* ---------- Location (D9) ---------- */
  const TZ_OPTS = [['eastern', 'Eastern (ET)'], ['central', 'Central (CT)'], ['mountain', 'Mountain (MT)'], ['pacific', 'Pacific (PT)'], ['alaska_hawaii', 'Alaska and Hawaii'], ['uk_europe', 'UK and Europe'], ['other', 'Other']];
  const optsOf = (a) => (a || []).map((x) => (Array.isArray(x) ? { v: x[0], l: x[1] } : x));
  // RN.model.place(op) -> {city, state, country, tz}; a rough reading of op.location until the model has it
  function placeOf(op) {
    if (RN.model.place) return RN.model.place(op) || {};
    const parts = String(op.location || '').split(',').map((x) => x.trim()).filter(Boolean);
    return { city: parts.length > 1 ? parts[0] : '', state: '', country: parts[parts.length - 1] || '', tz: 'other' };
  }
  const usBased = (p) => !!(p && (p.state || p.country === 'United States'));
  // The registry fields the drawer renders; filled here only if the registry does not provide them yet
  function ensureLocationFields() {
    const F = RN.fields;
    if (!F.locations) F.locations = { label: 'Location', type: 'tagsearch', max: 5, help: 'Country, or US state', options: [] };
    if (!(F.locations.options || []).length) {
      const countries = new Set(), states = new Set();
      RN.model.ops.forEach((op) => { if (op.hidden) return; const p = placeOf(op); if (p.country) countries.add(p.country); if (p.state) states.add(p.state); });
      F.locations.options = [...countries].sort().concat([...states].sort()).map((v) => ({ v, l: v }));
    }
    if (!F.timeZones) F.timeZones = { label: 'Time zone', type: 'multi', options: optsOf(TZ_OPTS) };
    else if (Array.isArray((F.timeZones.options || [])[0])) F.timeZones.options = optsOf(F.timeZones.options);
  }
  // Until RN.model.search reads the location keys, apply them here (same rules: OR within a key, AND across keys)
  function locationFilter(res, f) {
    if (RN.model.place || !(f.locations || f.timeZones || f.usHours)) return res;
    return res.filter((r) => {
      const p = placeOf(r.op);
      if (f.locations && !f.locations.some((x) => x === p.country || x === p.state)) return false;
      if (f.timeZones && !f.timeZones.includes(p.tz || 'other')) return false;
      if (f.usHours && !(usBased(p) || r.op.usHours === 'yes')) return false;
      return true;
    });
  }

  /* Run the model search with the view's sort rules. */
  function run(c, sort) {
    RN.model.applyEdits && RN.model.applyEdits();
    sort = sort || st().sort;
    let res = RN.model.search({ q: c.q, tags: c.tags, filters: c.filters, sort });
    // A budget filter only keeps operators who publish a rate (Studio tells operators: no rate, no budget searches)
    if (c.filters.rateMax) res = res.filter((r) => r.op.rate);
    if (c.filters.verifiedProof) res = res.filter((r) => hasProof(r.op));
    res = locationFilter(res, c.filters);
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
    limit = pageSize();
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
  /* Free text gets the ranked view (RN.rank): everyone who passes the filters set by hand, force-ranked by the
     vector search. view 'cards' is the opt-out back to the card grid. */
  const searchText = () => (st().said || st().q || '').trim();
  const ranked = () => !!searchText() && st().view !== 'cards';
  const rankPool = () => run({ q: '', tags: [], filters: saidBase() }).map((r) => r.op);
  const setSaid = (said, keys, dropped, need) => RN.store.update((s) => { s.browse.said = said || ''; s.browse.saidKeys = keys || []; s.browse.saidDropped = dropped || []; if (need) s.browse.need = need; }, 'browse');
  function applyText(text, o) {
    if (st().view === 'cards') RN.store.update((s) => { s.browse.view = 'grid'; }, 'browse');
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
      s.browse = Object.assign({ sort: 'best' }, s.browse || {}, { view: 'grid', q: c.q || '', tags: (c.tags || []).slice(0, 5), filters: cleanFilters(c.filters || {}), said: c.said || '', saidKeys: c.saidKeys || [], saidDropped: c.saidDropped || [] }, c.need ? { need: c.need } : {});
    }, 'browse');
    RN.go('browse');
  };

  /* ---------- Labels ---------- */
  const rateText = (v) => (+v >= RN.fields.rateMax.max ? 'Any rate' : '$' + Math.round(+v) + '/hr');
  function chipText(k, v) {
    switch (k) {
      case 'q': return `“${v}”`;
      case 'tags': return v;
      case 'hoursPerMonth': return v === '19' ? 'Any available time' : 'At least ' + RN.w.label('hoursPerMonth', v);
      case 'revenueRange': return RN.w.label('revenueRange', v) + ' revenue';
      case 'employeeRange': return RN.w.label('employeeRange', v) + ' employees';
      case 'rateMax': return 'Up to $' + Math.round(+v) + '/hr';
      case 'risMin': return 'Reputation Index ' + RN.w.label('risMin', v);
      case 'verifiedProof': return PROOF;
      case 'usHours': return US_HOURS;
      case 'locations': return RN.fields.locations ? RN.w.label('locations', v) : String(v);
      case 'timeZones': return RN.fields.timeZones ? RN.w.label('timeZones', v) : String(v);
      default: return RN.fields[k] ? RN.w.label(k, v) : String(v);
    }
  }
  const typeName = (k) => ({ q: 'Search', tags: 'Focus area', revenueRange: REV_LABEL(), rateMax: 'Hourly rate', hoursPerMonth: 'Minimum available time', verifiedProof: 'Proof', locations: 'Location', timeZones: 'Time zone', usHours: 'US hours' }[k] || (RN.fields[k] ? RN.fields[k].label : k));
  const chipAria = (k, v) => (k === 'verifiedProof' ? `Remove filter: ${PROOF}` : k === 'usHours' ? `Remove filter: ${US_HOURS}` : k === 'locations' ? `Remove location: ${chipText(k, v)}` : `Remove ${typeName(k)}: ${chipText(k, v)}`);
  const CHIP_ICON = { q: 'search', verifiedProof: 'seal', locations: 'pin', timeZones: 'clock', usHours: 'clock' };
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

  /* ---------- Rank for your company ----------
     Signed-out visitors answer three registry fields in a card a few rows into the grid (after card 6, card 4 on
     phones): companyRevenue, companyEmployees and need. Once all three are in, the default grid ("Best match", no
     search text) is re-ranked by RN.model.fit, the same match signals buyers see, and each card shows its fit.
     Answers live in seen.searchMe {revenueRange, employeeRange, need}: the visitor profile RN.fitme and the ranked
     view already read, so "Save my company and shortlist" opens RN.fitme's company sign-up, which creates the
     company with that revenue and headcount. need is copied into seen.companyPrefs when the account is created.
     Signed-in companies with a revenue or headcount on file are ranked by RN.clientBrief(), with no card. */
  const FIT_Q = [
    { k: 'revenueRange', field: 'companyRevenue', q: 'How much revenue does your company make a year?' },
    { k: 'employeeRange', field: 'companyEmployees', q: 'How many people work there?' },
    { k: 'need', field: 'need', q: 'What do you need help with first?' },
  ];
  const FIT = { step: -1, editing: false, dismissed: false, justDone: false, saving: false };
  const fitAnswers = () => (RN.store.state.seen || {}).searchMe || {};
  const fitComplete = (m) => FIT_Q.every((x) => !!m[x.k]);
  const toRange = (t) => String(t || '').replace(/\s*[–—]\s*/g, ' to ');
  function fitBrief() {
    const p = RN.store.state.persona;
    if (p === 'visitor') {
      const m = fitAnswers();
      if (!fitComplete(m)) return null;
      return { revenueRange: m.revenueRange, employeeRange: m.employeeRange, need: m.need === 'not_sure' ? '' : m.need };
    }
    if (p === 'buyer' && RN.clientBrief) {
      const co = RN.personas.buyer.company || {};
      return co.revenueRange || co.employeeRange ? RN.clientBrief() : null;
    }
    return null;
  }
  // Fit ranking applies to the default order only: a chosen sort or a written search keeps its own order
  const fitRanked = () => (!searchText() && st().sort === 'best' ? fitBrief() : null);
  // The most telling matched signal on the card (as on the buyer's cards): expertise and industry first
  const SIG_ORDER = ['expertise', 'industry', 'motion', 'revenue', 'employees', 'role'];
  function fitSignal(f, op) {
    const by = (a, b) => SIG_ORDER.indexOf(a.k) - SIG_ORDER.indexOf(b.k);
    const hit = f.signals.filter((x) => x.state === 'match').sort(by)[0] || f.signals.filter((x) => x.state === 'partial' && !x.unknown).sort(by)[0];
    return hit ? hit.text : 'Fractional ' + op.role;
  }
  // Strong (75+) and Good (50+) on the model's one scale; a lower fit shows its best signal only
  function fitMark(f) {
    const n = f.signals.length;
    if (f.pct < 50) return icon('target');
    return `<span class="br-fitmark ${f.pct >= 75 ? 'is-strong' : 'is-good'}" title="${esc(`${f.count} of ${n} match signals`)}">${esc(f.label)}<b>${esc(f.pct)}%</b></span>`;
  }

  function fitTokens(m) {
    const out = [];
    if (m.industry) out.push(RN.w.label('industry', m.industry));
    if (m.revenueRange) { const l = toRange(RN.w.label('companyRevenue', m.revenueRange)); out.push(m.revenueRange === 'pre_revenue' ? l : l + ' revenue'); }
    if (m.employeeRange) out.push(toRange(RN.w.label('companyEmployees', m.employeeRange)) + ' people');
    if (m.need && m.need !== 'not_sure') out.push(RN.w.label('need', m.need));
    return out;
  }
  function fitCard(o) {
    const persona = RN.store.state.persona;
    if (persona === 'buyer') {
      if (o.at !== 'top' || !fitBrief()) return '';
      const co = RN.personas.buyer.company || {};
      const toks = fitTokens({ industry: co.industry, revenueRange: co.revenueRange, employeeRange: co.employeeRange, need: (BR.prefsNeed && BR.prefsNeed()) || '' });
      return `<aside class="br-fit is-done" aria-label="How these are ranked">
        <p class="br-fit-sum">${icon('target')}<span>Ranked for <b>${esc(co.name || 'your company')}</b></span>${toks.map((t) => `<span class="br-fit-tok">${esc(t)}</span>`).join('')}<a class="act" href="#buyer.company">Edit</a></p>
      </aside>`;
    }
    if (persona !== 'visitor' || FIT.dismissed) return '';
    const m = fitAnswers();
    const done = fitComplete(m) && !FIT.editing;
    // The finished summary sits where it was answered; on a later visit it leads the grid
    const where = done && !FIT.justDone ? 'top' : 'slot';
    if (o.at !== where) return '';
    if (done) {
      return `<aside class="br-fit is-done" aria-label="How these are ranked">
        <p class="br-fit-sum">${icon('check-circle')}<span>Ranked for</span>${fitTokens(m).map((t) => `<span class="br-fit-tok">${esc(t)}</span>`).join('')}<button type="button" class="act" data-act="br-fit-edit">Edit</button></p>
        <button type="button" class="btn btn-sm br-fit-save" data-act="br-fit-save">${icon('bookmark')}Save my company and shortlist</button>
      </aside>`;
    }
    let i = FIT.step;
    if (i < 0 || i >= FIT_Q.length) { i = FIT_Q.findIndex((x) => !m[x.k]); if (i < 0) i = 0; }
    FIT.step = i;
    const q = FIT_Q[i];
    return `<aside class="br-fit" aria-labelledby="br-fit-h">
      <div class="br-fit-hd">
        ${RN.ui.icoTile('target', { round: true, cls: 'br-fit-ic' })}
        <div class="br-fit-tt"><h2 class="h5" id="br-fit-h">Rank these for your company</h2><p class="small muted">Three quick answers and every card is re-ranked by fit.</p></div>
        <span class="br-fit-n" aria-hidden="true">${FIT_Q.map((x, j) => `<i class="${m[x.k] ? 'on' : ''}${j === i ? ' cur' : ''}"></i>`).join('')}</span>
        <button type="button" class="br-fit-x" data-act="br-fit-x" aria-label="Hide this for now">${icon('x')}</button>
      </div>
      <div class="br-fit-q">
        <p class="br-fit-l" id="br-fit-q"><span class="label">${i + 1} of ${FIT_Q.length}</span>${esc(q.q)}</p>
        ${RN.w.control(q.field, m[q.k] || '', { name: q.k, id: 'br-fit-c', change: 'br-fit' })}
      </div>
      ${i > 0 ? `<button type="button" class="act muted br-fit-back" data-act="br-fit-back">${icon('chev-left')}Back</button>` : ''}
    </aside>`;
  }
  const fitAt = () => (window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 4 : 6);
  RN.inputs['br-fit'] = (el) => {
    const k = el.name, v = el.value;
    if (!FIT_Q.some((x) => x.k === k) || !v) return;
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { searchMe: Object.assign({}, (s.seen || {}).searchMe, { [k]: v }) }); }, 'seen');
    RN.track('search_profile_answer', { meta: { k, v, source: 'browse' } });
    const m = fitAnswers();
    const next = FIT_Q.findIndex((x, j) => j > FIT.step && (FIT.editing || !m[x.k]));
    if (next >= 0) FIT.step = next;
    else { FIT.step = -1; FIT.editing = false; FIT.justDone = true; }
    refresh({ noTrack: true });
    const box = document.querySelector('.br-fit');
    const f = box && (box.querySelector('.chip[aria-pressed="true"]') || box.querySelector('.chip, .br-fit-save'));
    if (f) f.focus({ preventScroll: true });
  };
  RN.actions['br-fit-back'] = () => { FIT.step = Math.max(0, FIT.step - 1); refresh({ noTrack: true }); const c = document.querySelector('.br-fit .chip'); if (c) c.focus({ preventScroll: true }); };
  RN.actions['br-fit-edit'] = () => { FIT.editing = true; FIT.step = 0; FIT.justDone = true; refresh({ noTrack: true }); const c = document.querySelector('.br-fit .chip[aria-pressed="true"], .br-fit .chip'); if (c) c.focus(); };
  RN.actions['br-fit-x'] = () => { FIT.dismissed = true; FIT.editing = false; refresh({ noTrack: true }); };
  RN.actions['br-fit-save'] = () => {
    FIT.saving = true;
    RN.track('search_profile_save', { meta: { source: 'browse' } });
    // RN.fitme's sign-up: one work email, and the company is created with the answers above
    if (RN.fitme) RN.fitme.ask('shortlist');
    else BR.loginPrompt({ title: 'Save your company and shortlist', sub: 'Signed-in companies keep their shortlist and see every card ranked for them.' });
  };
  BR.prefsNeed = () => { const p = (RN.store.state.seen || {}).companyPrefs; return p && p.need && p.need !== 'not_sure' ? p.need : ''; };

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
    // The card's tier mark already shows the score; the reason names the tier (risMin options start at Proven)
    const tier = f.risMin && op.ris ? RN.fields.risTierFor(op.ris.score) : null;
    if (tier) out.push(`${tier.l} tier on the Reputation Index`);
    if ((f.locations || f.timeZones || f.usHours) && !out.some((x) => /^Based in /.test(x))) {
      const p = placeOf(op);
      const where = [p.city, p.state || p.country].filter(Boolean).join(', ') || op.location;
      if (where) out.unshift('Based in ' + where);
    }
    return out.slice(0, 2).join(' · ');
  }
  const firstLine = (t) => { const m = String(t || '').replace(/\s+/g, ' ').trim().match(/^.{20,180}?[.!?](\s|$)/); return m ? m[0].trim() : ''; };
  BR.card = function (op, opts) {
    opts = opts || {};
    const visitor = RN.store.state.persona === 'visitor';
    // No tagline yet: the first sentence of the operator's own bio, so the card never reads as a stub
    const shown = Object.assign({}, op, visitor ? { rate: null } : {}, !op.headline && op.bio ? { headline: firstLine(op.bio) } : {});
    const fit = opts.fit && opts.fit.signals.length ? opts.fit : null;
    let html = RN.ui.opCard(shown, { why: fit ? fitSignal(fit, op) : opts.why || '' });
    if (fit) html = html.replace(`<div class="opc-why">${icon('target')}`, () => `<div class="opc-why br-fitwhy">${fitMark(fit)}`);
    // Replace the card's 3 tags with 4, verified first (2 on phones, with the rest counted). Expert tags (5+ reviews)
    // are company-verified too, but RN.ui.ftag only styles tier === 'verified', so normalize them here.
    const vFirst = (a, b) => (a.tier === 'verified' ? -1 : 1) - (b.tier === 'verified' ? -1 : 1);
    const three = RN.ui.ftags((op.tags || []).slice().sort(vFirst), 3);
    const all = (op.tags || []).map((t) => (t.tier === 'claimed' ? t : Object.assign({}, t, { tier: 'verified' }))).sort(vFirst);
    const n = all.length;
    const four = `<div class="opc-tags">${all.slice(0, 4).map((t, i) => (i >= 2 ? RN.ui.ftag(t).replace('class="ftag', 'class="ftag br-t-x') : RN.ui.ftag(t))).join('')}${n > 4 ? `<span class="ftag more br-t-d">+${n - 4} more</span>` : ''}${n > 2 ? `<span class="ftag more br-t-m">+${n - 2}</span>` : ''}</div>`;
    if (html.includes(three)) html = html.replace(three, () => four);
    const a = `<span>${RN.ui.avail(op)}</span>`;
    const put = (x) => { html = html.includes(a) ? html.replace(a, () => a + x) : html.replace('<div class="opc-meta">', () => '<div class="opc-meta">' + x); };
    if (visitor && op.rate) {
      // Visitors see what it typically costs a month; the exact hourly rate stays for signed-in companies
      const rg = RN.model.opMonthlyRange ? RN.model.opMonthlyRange(op) : null;
      if (rg) put(`<span class="br-range" title="${esc(rg.note)} The exact hourly rate shows after you sign in.">${icon('clock')}${esc(rg.short + ' ' + rg.text)}</span>`);
    } else if (!op.rate) {
      put(`<span class="br-norate" title="${esc(op.first || op.name)} quotes a rate on the first call.">${icon('clock')}Rate on request</span>`);
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
      sub: esc(o.sub || 'Hourly rates and match signals are shown to signed-in companies. Browsing stays open to everyone.'),
      body: `<div class="stack" style="--gap:12px">
        <button type="button" class="optcard" data-act="persona" data-p="buyer"><b>Continue as ${esc(p.name)} <span class="muted" style="font-weight:500">· ${esc(p.sub)}</span></b><span>Company account. You stay on this page.</span></button>
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
      b.filters = cleanFilters(f); limit = pageSize(); lastAdded = null;
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
            <span id="br-mode" class="br-mode-slot">${modeHtml()}</span>
            <span id="br-save-slot" class="br-save-slot">${saveBtn(c)}</span>
          </div>
          <div class="br-rhead-r">
            ${proofSwitch(c)}
            <span id="br-sort-slot"${searchText() ? ' hidden' : ''}>${sortHtml()}</span>
          </div>
        </div>
        <div id="br-results" data-view-source="search">${resultsHtml(res, c)}</div>
      </section>
      ${cat ? thinBlock(cat) : ''}
      ${cat ? catPlan(cat) : ''}
      ${rolesNav(cat)}
      <div class="br-mbar" role="region" aria-label="Quick actions"><a class="btn btn-line" href="#talk">${icon('message')}Talk to us</a><span id="br-mbar-save">${mbarSave(c)}</span></div>
    </div>`;
  }

  /* Operators with a photo who can start now, one per role category first, strongest Reputation Index first */
  const risOf = (op) => RN.fields.risRank(op); // no score yet: the neutral 50
  function featured(n) {
    const pool = RN.model.ops.filter((op) => !op.hidden && !op.isMatt && op.photo && op.avail && op.avail.key === 'available_now')
      .sort((a, b) => risOf(b) - risOf(a) || (b.reviews || []).length - (a.reviews || []).length || (b.completeness || 0) - (a.completeness || 0));
    const out = [], seen = new Set();
    pool.forEach((op) => { if (out.length < n && !seen.has(op.catKey)) { seen.add(op.catKey); out.push(op); } });
    pool.forEach((op) => { if (out.length < n && !out.includes(op)) out.push(op); });
    return out;
  }
  function genHead() {
    const live = RN.model.ops.filter((op) => !op.hidden);
    const now = live.filter((op) => op.avail && op.avail.key === 'available_now').length;
    const proof = live.filter(hasProof).length;
    const feat = featured(5);
    const visitor = RN.store.state.persona === 'visitor';
    const price = (op) => { if (!op.rate) return 'Rate on request'; if (!visitor) return RN.fmt.rate(op.rate); const r = RN.model.opMonthlyRange && RN.model.opMonthlyRange(op); return r ? r.short + ' ' + r.text : ''; };
    return `<header class="wrap br-head br-head-gen">
      <div class="br-head-copy">
        <span class="eyebrow">Direct access to talent</span>
        <h1 class="h1">Browse <span class="serif">operators</span></h1>
        <p class="lede">Open profiles. Reviews and focus areas a company confirmed are marked Verified. No login needed to browse.</p>
        <dl class="br-head-stats">
          <div><dt>Operators</dt><dd>${RN.fmt.int(live.length)}</dd></div>
          <div><dt>Available now</dt><dd>${RN.fmt.int(now)}</dd></div>
          <div><dt>With company-verified proof</dt><dd>${RN.fmt.int(proof)}</dd></div>
        </dl>
      </div>
      ${feat.length ? `<aside class="br-feat" aria-labelledby="br-feat-h">
        <div class="br-feat-hd"><span class="br-feat-live"><i class="dot dot-now"></i></span><h2 class="h5" id="br-feat-h">Available now</h2><span class="small muted">${RN.fmt.int(now)} can start this week</span></div>
        <ul class="br-feat-list">${feat.map((op, i) => `<li style="--i:${i}"><a href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">
          ${RN.ui.avatar(op, 'ava-md', { decorative: true })}
          <span class="br-feat-who"><b>${esc(op.name)}</b><span>Fractional ${esc(op.role)}</span></span>
          <span class="br-feat-meta">${RN.ui.cardTier(op, { pill: true, inLink: true })}<span>${esc(price(op))}</span></span>
        </a></li>`).join('')}</ul>
      </aside>` : ''}
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

  // "$7.5k - $11.5k/month", the way monthly ranges read on cards and profiles (RN.fmt.moRange)
  const kMonth = (m) => (m && m.lo && m.hi ? RN.fmt.moRange(m.lo, m.hi) : (m && m.label) || '');
  RN.actions['br-lede'] = (el) => { const box = el.closest('.br-cat-intro'); if (!box) return; const open = !box.classList.contains('is-open'); box.classList.toggle('is-open', open); el.setAttribute('aria-expanded', open); el.innerHTML = (open ? 'Show less' : 'Read more') + icon(open ? 'chev-up' : 'chev-down'); };
  function catHead(cat) {
    const label = RN.fields.catLabel(cat);
    const copy = CAT[cat];
    const idx = RN.data.market.rateIndex.byCat[cat];
    const titles = (RN.fields.rolesByCat[cat] || []).join(' · ');
    const tags = catTopTags(cat);
    const sel = st().tags.map((t) => t.toLowerCase());
    // A typical month at 40 hrs, from the same range and $500 rounding as the Rate Index estimator. Rates are the price.
    const mr = idx && RN.model.monthlyRange ? RN.model.monthlyRange(cat, null, '40') : null;
    return `<header class="wrap br-head br-head-cat">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#browse">Browse talent</a>${icon('chev-right')}<span>${esc(label)}</span></nav>
      <div class="br-cat-grid">
        <div class="br-cat-copy">
          <span class="eyebrow br-cat-eyebrow">${RN.ui.catDot(cat)}Role category</span>
          <h1 class="h1">Fractional <span class="serif">${esc(label)}</span></h1>
          <div class="br-cat-intro"><p class="lede" id="br-cat-lede">${esc(copy.body)}</p><button type="button" class="act br-lede-more" data-act="br-lede" aria-controls="br-cat-lede" aria-expanded="false">Read more${icon('chev-down')}</button></div>
          ${titles ? `<p class="small br-titles"><span class="label">Common titles</span>${esc(titles)}</p>` : ''}
          ${tags.length ? `<div class="br-cat-tags"><span class="label">Most searched focus areas</span>
            <div class="row" style="--gap:8px">${tags.map((t) => `<button type="button" class="chip chip-sm" data-act="br-tag-toggle" data-t="${esc(t)}" aria-pressed="${sel.includes(t.toLowerCase())}">${icon('plus', 'br-i-off')}${icon('check', 'br-i-on')}${esc(t)}</button>`).join('')}</div></div>` : ''}
        </div>
        ${idx ? `<aside class="card br-rate-card" aria-label="Rate Index for ${esc(label)}">
          <span class="label">Rate Index · ${esc(label)}</span>
          <div class="br-rate-big"><span class="num">$${esc(idx.p50)}</span><span class="small muted">median per hour</span></div>
          <p class="small">Typical range <b>${esc(RN.fmt.hrRange(idx.p25, idx.p75))}</b> (middle half of ${esc(idx.n)} profiles).</p>
          ${mr ? `<dl class="br-rate-mo">
            <div><dt>Typical month at ${esc(RN.w.label('hoursPerMonth', '40'))}</dt><dd class="tnum">${esc(kMonth(mr))}</dd></div>
          </dl>
          <p class="small muted br-rate-free">No fees for companies. You pay the operator’s rate, nothing more.</p>` : ''}
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
    const general = all.filter((g) => !g.cat && g.group !== 'operators');
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
      <div class="br-plan-hd"><span class="eyebrow">Plan it</span><h2 class="h3" id="br-plan-h">Plan a fractional ${esc(noun)} engagement</h2></div>
      <div class="grid g-3" style="--gap:16px">
        <a class="card card-link br-plan-card" href="#rates">${RN.ui.icoTile('chart', { tone: 'gold' })}<h3 class="h4">What does a fractional ${esc(noun)} cost?</h3><p class="small muted">Hourly medians and ranges for ${esc(label)}, adjusted for company revenue, in the Rate Index.</p><span class="act">See rates${icon('arrow')}</span></a>
        <div class="card br-plan-card">${RN.ui.icoTile('layers', { tone: 'info' })}<h3 class="h4">Scope it from a Blueprint</h3>
          <p class="small muted">${bps.length ? esc(bps[0].blurb) + ' ' : ''}Hours, term and a 30/60/90-day plan. Post it as an engagement in minutes.</p>
          <ul class="br-plan-links">${bps.length ? bps.map((b) => link('#blueprint.' + esc(b.id), `${b.role} Blueprint`)).join('') : link('#blueprints', 'Browse Blueprints')}</ul></div>
        <div class="card br-plan-card">${RN.ui.icoTile('book', { tone: 'enable' })}<h3 class="h4">Hiring guides</h3>
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
      ${RN.ui.icoTile('users', { round: true, cls: 'br-zero-ic' })}
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
      .sort((a, b) => b.v - a.v || b.t.length - a.t.length || risOf(b.op) - risOf(a.op))
      .slice(0, 3);
    if (!near.length) return '';
    return `<section class="wrap br-near" aria-labelledby="br-near-h" data-view-source="search">
      <h2 class="h4" id="br-near-h">Operators in other categories with ${esc(label)} focus areas</h2>
      <div class="grid g-3 br-grid">${near.map((x) => BR.card(x.op, { why: x.v ? `Company-verified in ${x.t.filter((t) => t.tier !== 'claimed').slice(0, 2).map((t) => t.t).join(' and ')}` : `Lists ${x.t.slice(0, 2).map((t) => t.t).join(' and ')}` })).join('')}</div>
    </section>`;
  }

  function rolesNav(cat) {
    const counts = {};
    RN.model.ops.forEach((op) => { if (!op.hidden) counts[op.catKey] = (counts[op.catKey] || 0) + 1; });
    return `<nav class="wrap br-roles" aria-label="Browse by role category">
      <span class="label">${cat ? 'Other role categories' : 'Browse by role'}</span>
      <div class="br-roles-list">${RN.fields.roleCategory.options.filter((o) => o.v !== cat).map((o) => `<a class="chip br-pill" href="#browse.${esc(o.v)}">${RN.ui.catDot(o.v)}Fractional ${esc(o.l)}${counts[o.v] ? `<b class="chip-n">${counts[o.v]}</b>` : ''}</a>`).join('')}</div>
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
    // Ranked: the words live in the search box and the facts read from them are drawn as checks, so only hand-set filters show
    const rk = !!searchText(), sk = st().saidKeys || [];
    const chips = rk ? chipList(c).filter((x) => x.k !== 'q' && !sk.includes(x.k)) : chipList(c);
    if (rk && !chips.length) return '';
    if (chips.length) {
      return `${rk ? '' : saidNote()}<div class="br-chips" role="list" aria-label="Active filters">
        ${chips.map((x) => `<span role="listitem"><button type="button" class="chip chip-sm br-fchip" data-type="${esc(TYPE[x.k] || 'other')}" data-act="br-chip-x" data-k="${esc(x.k)}" data-v="${esc(x.v)}" title="${esc(typeName(x.k))}" aria-label="${esc(chipAria(x.k, x.v))}">${CHIP_ICON[x.k] ? icon(CHIP_ICON[x.k]) : '<i></i>'}<span>${esc(chipText(x.k, x.v))}</span>${icon('x')}</button></span>`).join('')}
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
  // Phone action bar: the two next steps, always in reach
  function mbarSave(c) {
    const ex = isClient() && hasCrit(c) ? findSaved(c) : null;
    return ex ? `<button type="button" class="btn" data-act="br-save">${icon('check')}Saved</button>` : `<button type="button" class="btn" data-act="br-save" ${hasCrit(c) ? '' : 'disabled'}>${icon('bookmark')}Save search</button>`;
  }
  function proofSwitch(c) {
    return `<label class="switch br-proof-sw" title="Operators with a company review or a focus area a company confirmed"><input type="checkbox" data-change="br-proof" ${c.filters.verifiedProof ? 'checked' : ''}><i></i><span>${PROOF}</span></label>`;
  }
  const refocus = (sel) => { const el = document.querySelector('.br-page ' + sel); if (el) el.focus(); };
  function syncSaved() {
    const c = crit();
    const a = document.getElementById('br-saved'); if (a) a.innerHTML = savedRow(c);
    const b = document.getElementById('br-save-slot'); if (b) b.innerHTML = saveBtn(c);
    const m = document.getElementById('br-mbar-save'); if (m) m.innerHTML = mbarSave(c);
  }

  // A rate filter hides operators who don't publish a rate; say how many, with a one-click way back
  function unlistedNote(c) {
    if (!c.filters.rateMax) return '';
    const f = Object.assign({}, c.filters); delete f.rateMax;
    const n = RN.model.search({ q: c.q, tags: c.tags, filters: f }).filter((r) => !r.op.rate && (!c.filters.verifiedProof || hasProof(r.op))).length;
    return n ? ` <span class="br-count-note">· ${RN.fmt.int(n)} more don’t list a rate. <button type="button" class="act" data-act="br-chip-x" data-k="rateMax">Clear the rate filter</button></span>` : '';
  }
  function countHtml(res, c) {
    if (searchText()) { const n = rankPool().length; if (n) return `<b class="num">${RN.fmt.int(n)}</b> ranked for you${unlistedNote(c)}`; }
    const n = res.length;
    if (!n) return '<b class="num">0</b> operators match' + unlistedNote(c);
    return `<b class="num">${RN.fmt.int(n)}</b> ${n === 1 ? 'operator' : 'operators'}${hasCrit(c) ? ' match' : ''}${unlistedNote(c)}`;
  }
  function modeHtml() {
    if (!searchText()) return '';
    const r = ranked();
    return `<div class="seg br-mode" role="group" aria-label="Show results as"><button type="button" data-act="br-mode" data-v="grid" aria-pressed="${r}">${icon('chart')}Ranked</button><button type="button" data-act="br-mode" data-v="cards" aria-pressed="${!r}">${icon('users')}Cards</button></div>`;
  }
  RN.actions['br-mode'] = (el) => { RN.store.update((s) => { s.browse.view = el.dataset.v; }, 'browse'); refresh({ noTrack: true }); };
  function sortHtml() {
    const s = st().sort;
    return `<div class="br-sort">
      <span class="label br-sort-l">Sort</span>
      <div class="seg br-sort-seg" role="group" aria-label="Sort results">${SORTS.map(([k, l]) => `<button type="button" data-act="br-sort" data-s="${k}" aria-pressed="${s === k}">${esc(l)}</button>`).join('')}</div>
      <label class="br-sort-sel"><span class="sr-only">Sort results</span><select class="select" data-change="br-sort-sel">${SORTS.map(([k, l]) => `<option value="${k}" ${s === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    </div>`;
  }

  function moreHtml(n, total) {
    if (total <= n) return '';
    return `<div class="br-more"><span class="br-more-meter" aria-hidden="true"><i style="width:${Math.round((n / total) * 100)}%"></i></span>
      <span class="br-more-n">Showing <b>${RN.fmt.int(n)}</b> of ${RN.fmt.int(total)}</span>
      <button type="button" class="btn btn-line br-more-btn" data-act="br-more">Show ${Math.min(pageSize(), total - n)} more${icon('chev-down')}</button></div>`;
  }
  /* One break in the grid after the third row: the role categories with live counts, on a dark band */
  function gridBreak(c) {
    if (hasCrit(c) || landedCat) return '';
    const counts = {};
    RN.model.ops.forEach((op) => { if (!op.hidden) counts[op.catKey] = (counts[op.catKey] || 0) + 1; });
    return `<aside class="br-break night" aria-label="Browse by role">
      <div class="br-break-l"><span class="eyebrow">Narrow it down</span><h2 class="h3">Start from the seat you need to fill</h2></div>
      <div class="br-break-pills">${RN.fields.roleCategory.options.filter((o) => counts[o.v]).map((o) => `<a class="chip br-pill" href="#browse.${esc(o.v)}">${RN.ui.catDot(o.v)}${esc(o.l)}<b class="chip-n">${counts[o.v]}</b></a>`).join('')}</div>
    </aside>`;
  }
  // The rank card goes in a few rows down (or after the last card when there are fewer); its summary can lead the grid
  function withFit(cards) {
    const top = fitCard({ at: 'top' }), slot = fitCard({ at: 'slot' });
    const out = cards.slice();
    if (slot) out.splice(Math.min(fitAt(), out.length), 0, slot);
    if (top) out.unshift(top);
    return { list: out, extra: (top ? 1 : 0) + (slot ? 1 : 0), slotAt: slot ? Math.min(fitAt(), cards.length) : -1, top: !!top };
  }
  const withBreak = (cards, c) => {
    if (cards && cards.list) {
      // The dark band still follows the 9th operator card, counted without the rank card
      const at = 9 + (cards.top ? 1 : 0) + (cards.slotAt >= 0 && cards.slotAt <= 9 ? 1 : 0);
      const l = cards.list;
      if (l.length - cards.extra <= 9) return l.join('');
      return l.slice(0, at).join('') + gridBreak(c) + l.slice(at).join('');
    }
    const at = 9; if (cards.length <= at) return cards.join(''); return cards.slice(0, at).join('') + gridBreak(c) + cards.slice(at).join('');
  };

  function resultsHtml(res, c) {
    if (searchText()) {
      const pool = rankPool();
      if (pool.length && ranked()) return RN.rank.html(searchText(), pool);
      // Cards: the same ranking as the ranked view, shown as cards
      if (pool.length) {
        const rows = RN.rank.rows(searchText(), pool);
        const shown = rows.slice(0, limit), more = rows.length - shown.length;
        return `<div class="grid g-3 br-grid">${shown.map((r) => BR.card(r.op, { why: RN.rank.why(r) })).join('')}</div>
          ${moreHtml(shown.length, rows.length)}`;
      }
    }
    if (!res.length) return zeroHtml(c);
    const brief = fitRanked();
    let fits = null;
    if (brief) {
      // Stable: equal fits keep the search order
      const rows = res.map((r, i) => ({ r, i, f: RN.model.fit(r.op, brief) })).sort((a, b) => b.f.pct - a.f.pct || a.i - b.i);
      res = rows.map((x) => x.r); fits = new Map(rows.map((x) => [x.r.op.id, x.f]));
    }
    const shown = res.slice(0, limit);
    const more = res.length - shown.length;
    // A last row with one gap closes on a dark "tell us" tile (wide screens only; the line below covers phones)
    const closer = more <= 0 && shown.length % 3 === 2 && !(landedCat && catCount(landedCat) < THIN);
    const cards = withFit(shown.map((r) => BR.card(r.op, { why: whyFor(r, c), fit: fits && fits.get(r.op.id) })));
    return `<div class="grid g-3 br-grid">${withBreak(cards, c)}${closer ? `<aside class="br-closer night">${RN.ui.icoTile('message', { round: true, cls: 'br-zero-ic' })}<h3 class="h4">Not seeing the right fit?</h3><p>Tell us what you need and our team will shortlist operators for you. Your search comes with you.</p><button type="button" class="btn btn-leaf" data-act="br-tell" data-zero="">Tell us what you need</button></aside>` : ''}</div>
      ${moreHtml(shown.length, res.length)}
      ${landedCat && catCount(landedCat) < THIN ? thinNote(landedCat) : `<p class="br-tell${closer ? ' br-tell-alt' : ''}">${icon('message')}<span>Not seeing the right fit? <button type="button" class="act" data-act="br-tell" data-zero="">Tell us what you need</button> and our team will shortlist operators for you.</span></p>`}`;
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
        ${RN.ui.icoTile('search', { round: true, cls: 'br-zero-ic' })}
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
  BR.refresh = (o) => refresh(o);
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
    set('br-mode', modeHtml());
    const ss = document.getElementById('br-sort-slot'); if (ss) ss.hidden = !!searchText();
    if (ranked()) RN.rank.mount(rankPool);
    set('br-bar-acts', barBtns(c));
    set('br-saved', savedRow(c));
    set('br-save-slot', saveBtn(c));
    set('br-mbar-save', mbarSave(c));
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
        <div class="br-ratelock">${icon('lock')}<span>Rates are shown to signed-in companies.</span><button type="button" class="act" data-act="br-login">Log in</button></div></div>`;
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
        <label class="switch br-proof"><input type="checkbox" name="verifiedProof" value="1" ${f.verifiedProof ? 'checked' : ''}><i></i><span><b>${PROOF}</b><span class="small muted">Only operators with a company review or a focus area a company confirmed.</span></span></label>
      </div>
      ${RN.w.field('roleCategories', f.roleCategories || [], { name: 'roleCategories' })}
      ${availField(f.availability || [])}
      <div data-deselect>${RN.w.field('minHours', (f.hoursPerMonth || [])[0] || '', { name: 'hoursPerMonth', help: 'Operators with at least this much time a month for a new company.' })}</div>
      ${locationFields(f)}
      ${RN.w.field('revenueRange', f.revenueRange || [], { name: 'revenueRange', label: REV_LABEL(), help: 'Operators who work with companies in any selected range.' })}
      ${RN.w.field('employeeRange', f.employeeRange || [], { name: 'employeeRange', help: 'Operators who work with companies of any selected size.' })}
      ${RN.w.field('industries', f.industries || [], { name: 'industries', max: 3, help: 'Pick up to 3. Operators in any selected industry are shown.' })}
      ${RN.w.field('salesMotions', f.salesMotions || [], { name: 'salesMotions', help: 'Operators with experience in any selected motion.' + (RN.model.ops.filter((op) => !op.hidden && (op.motions || []).length).length < 10 ? ' Few profiles list it yet.' : '') })}
      ${RN.w.field('engagementTypes', f.engagementTypes || [], { name: 'engagementTypes', help: 'Operators who offer any selected type.' })}
      ${rateField(f.rateMax)}
      <div data-deselect>${RN.w.field('risMin', f.risMin || '', { name: 'risMin', help: 'Minimum score. Tiers start at 50, Emerging.' })}</div>`;
  }
  /* Location, Time zone and Works US hours: the registry fields (tag search and chips) and one switch */
  function locationFields(f) {
    ensureLocationFields();
    const loc = RN.w.field('locations', f.locations || [], { name: 'locations', id: 'f-br-locations', max: 5, help: 'Country, or US state. Operators based in any selected place are shown.' })
      .replace(/(placeholder="Search [\d,]+ )location"/, '$1countries and US states"').replace('aria-label="Search location"', 'aria-label="Search countries and US states"');
    const tz = RN.w.field('timeZones', f.timeZones || [], { name: 'timeZones', id: 'f-br-timeZones', help: 'Where the operator is based. Operators in any selected time zone are shown.' });
    const us = `<div class="field br-us-field" data-field="usHours">
        <label class="switch br-proof br-us"><input type="checkbox" name="usHours" value="yes" ${f.usHours ? 'checked' : ''}><i></i><span><b>${US_HOURS}</b><span class="small muted">Based in the US, or said yes to working US time zone hours.</span></span></label>
      </div>`;
    return loc + tz + us;
  }
  function readForm(form) {
    const d = RN.ui.formData(form);
    const cur = st().filters;
    const f = {};
    if ([].concat(d.verifiedProof || []).length) f.verifiedProof = true;
    ['roleCategories', 'locations', 'timeZones', 'revenueRange', 'employeeRange', 'industries', 'salesMotions', 'engagementTypes'].forEach((k) => { if (Array.isArray(d[k]) && d[k].length) f[k] = d[k]; });
    if ([].concat(d.usHours || []).length) f.usHours = 'yes';
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
    // A visitor who saved from the rank card: the new company account keeps what they said they need
    if (FIT.saving && isClient()) {
      FIT.saving = false;
      const need = fitAnswers().need;
      if (need) RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { companyPrefs: Object.assign({}, (s.seen || {}).companyPrefs, { need, savedAt: RN.now().toISOString() }) }); }, 'seen');
    }
    if (document.querySelector('.br-page')) setTimeout(() => refresh({ noTrack: true }), 0);
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
    // A visitor saves with one field (a work email) and keeps searching; RN.fitme creates the account and saves it
    if (st().persona === 'visitor' && RN.fitme) { RN.fitme.ask('search'); return; }
    if (!isClient()) {
      pendingSave = true;
      BR.loginPrompt({ title: 'Log in to save this search', sub: 'Signed-in companies save searches and run them again in one click. Browsing stays open to everyone.', onClose: () => { pendingSave = false; } });
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
  RN.actions['br-sort'] = (el) => { RN.store.update((s) => { s.browse.sort = el.dataset.s; }, 'browse'); limit = pageSize(); refresh({ noTrack: true }); const sel = document.querySelector('.br-sort-sel select'); if (sel) sel.value = el.dataset.s; };
  RN.inputs['br-sort-sel'] = (el) => { RN.store.update((s) => { s.browse.sort = el.value; }, 'browse'); limit = pageSize(); refresh({ noTrack: true }); };
  RN.actions['br-more'] = () => { limit += pageSize(); refresh({ noTrack: true }); };
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
    if (ranked()) RN.rank.mount(rankPool);
    scheduleTrack();
  }
  function unmount() {
    clearTimeout(trackTimer);
    RN.rank.reset();
    lastKey = null; mountedAt = 0; landedCat = null; tagsOpen = false; compact = false; limit = pageSize();
    FIT.justDone = false; FIT.editing = false; FIT.step = -1;
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
