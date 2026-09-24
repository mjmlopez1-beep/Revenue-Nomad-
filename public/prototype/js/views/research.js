/* Research surfaces, the platform's public IP:
     #framework       GTM Framework explorer: 6 areas x 7 customer-journey stages, bowtie, cell panels, client self-diagnostic
     #library         Fit Tag Library: the public taxonomy with definitions, claimed vs client-verified supply and demand
     #guides          Guides index (grouped) + glossary of 20 terms
     #guide.<slug>    One question per page, written for search and AI answer engines (direct answer, data, FAQ, JSON-LD)
   Prefix: rs- (actions, inputs, CSS). Shared helpers live on RN.research so they can be promoted to core:
     RN.research.stageOf(tag)  curated stage for a fit tag (see CURATED below and the hand-off notes)
     RN.research.def(tag)      published definition for a fit tag (library d, else Revenue Nomad Research's)
     RN.research.guides        guide registry
   Market figures come from RN.data.market and are illustrative; every surface says so. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = RN.fields;
  const R = (RN.research = RN.research || {});
  const MK = () => RN.data.market;
  const REP = () => RN.data.market.report;
  const RIX = () => RN.data.market.rateIndex;
  const plural = (n, one, many) => RN.fmt.plural(n, one, many);

  /* =====================================================================
     GTM Framework model
     ===================================================================== */

  // Area definitions (AXIS_DEF, Operator Profile Explorer, verbatim)
  const AXIS_DEF = {
    'Lead & plan': 'Strategy, positioning, org design, planning and interim leadership: work that sets direction for every stage.',
    'Build the team': 'Hiring, onboarding, coaching, comp and methodology: work that makes the people in every stage better.',
    'Generate demand': 'Pipeline creation: demand gen, ABM, outbound, content and partner-sourced opportunities.',
    'Win deals': 'Turning pipeline into revenue: sales process, discovery, deal execution, pricing and forecasting.',
    'Retain & expand': 'Keeping and growing customers: onboarding, adoption, renewals, expansion and advocacy.',
    'Systems & data': 'CRM, reporting, routing, tech stack and automation: the plumbing every stage runs on.',
  };
  // Icon and the role category that most often leads the area (diagnostic recommendation)
  const AREA_META = {
    'Lead & plan': { icon: 'compass', cat: 'sales_leadership' },
    'Build the team': { icon: 'users', cat: 'sales_enablement' },
    'Generate demand': { icon: 'megaphone', cat: 'marketing' },
    'Win deals': { icon: 'handshake', cat: 'sales_leadership' },
    'Retain & expand': { icon: 'refresh', cat: 'customer_success_growth' },
    'Systems & data': { icon: 'layers', cat: 'revenue_operations' },
  };
  R.areas = () => (RN.data.framework.axes || Object.keys(AXIS_DEF)).map((name) => Object.assign({ name, def: AXIS_DEF[name] || '' }, AREA_META[name] || { icon: 'grid', cat: 'sales_leadership' }));

  // Tags with stage "foundation" serve every stage: they count toward their area, not a single stage.
  const FOUNDATION = {
    id: 'foundation', name: 'Foundation', side: 'all',
    what: 'Work that serves every stage at once: hiring and ramp, compensation, CRM architecture, enablement programs and AI tooling. It counts toward its area, not toward a single stage.',
    skilled: 'Operators strong here build the machinery the whole revenue team runs on, from the CRM data model to the program that gets new reps selling on their own.',
  };
  const journey = () => RN.data.framework.stages;
  const allStages = () => journey().concat([FOUNDATION]);
  const stageBy = (name) => allStages().find((s) => s.name === name || s.id === name);
  // "Win deals at Qualify", but "Lead & plan across every stage" for Foundation
  const cellText = (area, stage) => (stage === 'Foundation' ? `${area} across every stage` : `${area} at ${stage}`);
  const cellHtml = (area, stage) => `${esc(area)} <span class="serif">${stage === 'Foundation' ? 'across' : 'at'}</span> ${stage === 'Foundation' ? 'every stage' : esc(stage)}`;
  // The title a client would hire for in each role category (from RN.fields.rolesByCat)
  const ROLE_PICK = { sales_leadership: 1, sales_enablement: 1 };
  const roleFor = (cat) => { const r = F.rolesByCat[cat] || []; return r[ROLE_PICK[cat] || 0] || F.catLabel(cat) + ' leader'; };

  /* Curation pass (Revenue Nomad Research, taxonomy v1, Sep 2026).
     The live mapping places tags by role category, which leaves Onboard and Expand empty and files brand work under
     Engage. Each tag below is moved to the stage its definition changes, using the stage copy in RN.data.framework
     ("Awareness: positioning, brand, content and events", "Commit: pricing, negotiation, mutual action plans"...).
     Areas are unchanged. Everything not listed keeps its live stage; tags with no stage count as Foundation. */
  const CURATED = {
    // Awareness: positioning, brand, content and events
    'Content Marketing Strategy': 'Awareness', 'Brand Strategy': 'Awareness', 'SEO & Organic Growth': 'Awareness', 'Brand positioning': 'Awareness', 'Brand voice': 'Awareness',
    'GTM launch': 'Awareness', 'Brand architecture': 'Awareness', 'Brand audit': 'Awareness', 'Brand guidelines': 'Awareness', 'Brand identity': 'Awareness',
    'Competitive messaging': 'Awareness', 'Event & Field Marketing': 'Awareness', 'Founder brand': 'Awareness', 'Positioning workshop': 'Awareness', 'Product launch': 'Awareness',
    'Rebranding': 'Awareness', 'Social media strategy': 'Awareness', 'Thought leadership': 'Awareness', 'Economic Buyer Messaging': 'Awareness', 'Messaging Audit': 'Awareness', 'Webinar Program': 'Awareness',
    // Engage: outbound, ABM, routing, enrichment and deciding who to go after
    'Outbound Motion Build': 'Engage', 'Outbound motion': 'Engage', 'Outbound selling': 'Engage', 'Cold call scripts': 'Engage', 'Cold Email': 'Engage',
    'Mid-Market Segmentation': 'Engage', 'Customer Segmentation': 'Engage', 'Segment prioritization': 'Engage', 'AI SDR / Outbound Automation': 'Engage', 'ABM Strategy': 'Engage',
    'Apollo Admin': 'Engage', 'Clay Workflow Build': 'Engage', 'Demand Gen Program': 'Engage', 'Enrichment Automation': 'Engage', 'Lavender Implementation': 'Engage',
    'Lead Routing': 'Engage', 'Meta Ads Implementation': 'Engage', 'Programmatic ABM': 'Engage', 'Round Robin Setup': 'Engage', 'Warmly Setup': 'Engage',
    // Qualify: discovery, demos, pipeline inspection, forecasting, competitive and call intelligence
    'Discovery Framework': 'Qualify', 'Call Coaching & Feedback': 'Qualify', 'Live call coaching': 'Qualify', 'Competitive Battlecards': 'Qualify', 'AI Competitive Monitoring': 'Qualify',
    'AI Revenue Forecasting': 'Qualify', 'Pipeline Health AI': 'Qualify', 'Competitive Intelligence': 'Qualify', 'Demo training': 'Qualify', 'Discovery training': 'Qualify',
    'MEDDIC/MEDDPICC': 'Qualify', 'Gong implementation': 'Qualify', 'Pipeline management': 'Qualify', 'Inbound selling': 'Qualify', 'Competitive Displacement Playbook': 'Qualify',
    'Discovery Execution': 'Qualify', 'Forecast Dashboard': 'Qualify', 'Opportunity Qualification': 'Qualify', 'Pipeline Dashboard': 'Qualify', 'Rolling Forecast': 'Qualify',
    'Stage Definitions': 'Qualify', 'Weighted Pipeline Model': 'Qualify',
    // Commit: deal execution, pricing, negotiation, mutual action plans, proposals
    'Multithreading training': 'Commit', 'Objection Handling Framework': 'Commit', 'Value selling training': 'Commit', 'Objection handling training': 'Commit', 'Closing Training': 'Commit',
    'Deal Desk Setup': 'Commit', 'Mutual Action Plan': 'Commit', 'Pricing Strategy': 'Commit', 'Proposal Process': 'Commit',
    // Onboard: onboarding and implementation design, the sales to CS handoff
    'Customer Onboarding Program': 'Onboard', 'Customer Onboarding': 'Onboard', 'High-touch onboarding': 'Onboard', 'Sales-CS handoff process': 'Onboard', 'Onboarding Process Design': 'Onboard',
    // Expand: expansion motion, upsell and cross-sell, account management
    'Account Expansion Selling': 'Expand', 'Account management': 'Expand', 'NRR & Expansion Motion': 'Expand', 'CS → Sales Expansion Handoff': 'Expand', 'Expansion Motion Design': 'Expand',
  };
  R.curated = CURATED;
  R.stageOf = function (tag) {
    const name = tag.t || tag.v || tag.l;
    if (CURATED[name]) return CURATED[name];
    let s = tag.stage;
    if (s === undefined) { const info = RN.model.tagInfo(name); s = info ? info.stage : ''; }
    if (!s || s === 'foundation') return 'Foundation';
    const hit = journey().find((x) => x.name.toLowerCase() === String(s).toLowerCase());
    return hit ? hit.name : 'Foundation';
  };

  /* Definitions written by Revenue Nomad Research for the most used tags that had none in the library. */
  const DEFS = {
    'Outbound Motion Build': 'Designing and launching a repeatable outbound program: target accounts, sequences, messaging, roles and the metrics to run it.',
    'Account Expansion Selling': 'Selling more to existing customers through new seats, products or business units, using account plans and executive relationships.',
    'Outbound Prospecting': 'Finding and contacting target prospects by email, phone and social to book first meetings.',
    'Pipeline Inspection': 'A weekly review of every open deal against stage criteria, so risks surface early and the forecast holds.',
    'RevOps Infrastructure Build': 'Standing up revenue operations: CRM, data model, reporting, routing and the processes that keep them clean.',
    'Demand Generation': 'Running the programs and channels that create qualified pipeline for sales, measured on cost and conversion.',
    'Rep Performance Management': 'Setting activity and outcome expectations for each rep, reviewing them on a cadence and acting on the gaps.',
    'GTM Tech Stack Audit': 'Reviewing every sales and marketing tool for use, cost and overlap, then deciding what to keep, fix or cut.',
    'Churn Reduction Program': 'Finding why customers leave and running the fixes: early risk signals, save plays and feedback to product.',
    'Board Revenue Reporting': 'Preparing the revenue metrics, forecast and narrative a board expects every quarter.',
    'Discovery Framework': 'A shared structure for first calls: the questions, qualification criteria and next-step rules every rep uses.',
    'Channel Sales Build': 'Building a route to market through resellers or referral partners: selection, terms, enablement and co-selling.',
    'Mid-Market Segmentation': 'Choosing which mid-market accounts to target and fitting coverage, pricing and the sales motion to them.',
    'AI Sales Automation': 'Using AI tools to automate research, outreach, follow-up and CRM updates so reps spend more time selling.',
    'Content Marketing Strategy': 'Deciding which topics, formats and channels build trust with prospects, and running the calendar that ships them.',
    'Pipeline architecture': 'Designing pipeline stages, entry and exit criteria and coverage targets so pipeline data reflects reality.',
    'AI Lead Scoring': 'Ranking leads by likelihood to buy with models built on firmographic, intent and engagement data.',
    'Deal velocity improvement': 'Shortening the time from first meeting to close by removing the stalls at specific stages.',
    'LLM Content Generation': 'Setting up large language model workflows that draft emails, content and sales assets, with human review.',
    'Brand Strategy': 'Defining what the company stands for, who it is for and how it sounds, so every touchpoint is consistent.',
    'HubSpot Implementation': 'Setting up HubSpot from scratch or migrating into it, configured around how the team actually sells.',
    'Pipeline coverage ratio': 'Tracking open pipeline against quota to know early whether a quarter is reachable.',
    'Forecast Methodology': 'The rules for calling a forecast: categories, commit criteria, roll-up cadence and who is accountable.',
    'GTM Workflow Automation': 'Automating handoffs, alerts and data updates across sales and marketing tools to remove manual work.',
    'Marketing Operations': 'Running the systems behind marketing: automation platform, lead lifecycle, attribution and campaign reporting.',
    'Partner Program Build': 'Designing a partner program from scratch: tiers, benefits, recruitment, enablement and partner-sourced pipeline targets.',
    'Reseller Channel Build': 'Recruiting and managing resellers who sell the product to their own customers under agreed margins and terms.',
    'SEO & Organic Growth': 'Growing unpaid search traffic through technical fixes, content and links that match what prospects search for.',
    'AI maturity audit': 'Assessing how a go-to-market team uses AI today and where automation would pay back first.',
    'AI Revenue Forecasting': 'Predicting bookings and flagging at-risk deals with models trained on pipeline and activity data.',
    'Brand positioning': 'Choosing the position the company owns against alternatives, and the proof that supports it.',
    'Brand voice': 'Defining how the company sounds in writing and speech, with rules the whole team can apply.',
    'CRM workflow automation': 'CRM automations for assignment, tasks, stage changes and alerts, so data stays current without chasing.',
    'CS Team Build': 'Hiring and structuring a customer success team: roles, coverage ratios, comp and the first playbooks.',
    'Customer Onboarding Program': 'A repeatable plan that takes new customers from signature to first value, with owners and milestones.',
    'Data Analytics & BI': 'The data models and dashboards that answer revenue questions without manual spreadsheet work.',
    'Enablement Content Library': 'An organized, searchable set of sales assets reps can find and use in the moment.',
    'Forecast accuracy': 'Improving how closely the called forecast matches actual bookings, quarter after quarter.',
    'GTM AI Strategy': 'Deciding where AI fits across the go-to-market team, which tools to adopt and how to measure the payoff.',
    'GTM launch': 'Planning and running a product or market launch: positioning, sales readiness, channels and success metrics.',
    'ICP definition': 'Describing the companies and people most likely to buy and succeed, based on closed-won and churn data.',
    'KPI framework': 'Choosing the few revenue metrics each team owns, how they are defined and how often they are reviewed.',
    'Manager coaching': 'Training frontline sales managers to coach reps on deals and skills, beyond inspecting the numbers.',
    'MEDDIC / MEDDPICC Implementation': 'Rolling out the MEDDIC or MEDDPICC qualification method in the CRM, deal reviews and rep training.',
    'Mid-market motion': 'The sales process, team and pricing needed to sell to mid-sized companies efficiently.',
    'NRR & Expansion Motion': 'Raising net revenue retention through renewal discipline and a planned motion for upsell and cross-sell.',
    'Objection Handling Framework': 'A documented set of common objections with tested responses, used in training and in live deals.',
    'Outbound motion': 'Running outbound as a system: who to target, the cadence, and the handoff to account executives.',
    'PLG → Sales Bridge': 'Adding sales on top of a self-serve product: which users to contact, when, and with what offer.',
    'Product Marketing': 'Positioning, messaging, launches and sales tools that connect the product to what customers care about.',
  };
  R.def = (name) => { const info = RN.model.tagInfo(name); return (info && info.d) || DEFS[name] || (info && DEFS[info.v]) || ''; };
  R.defSource = (name) => { const info = RN.model.tagInfo(name); return info && info.d ? 'library' : DEFS[name] ? 'research' : ''; };

  /* Network index: which operators list each tag, claimed vs client-verified, placed on the curated map.
     Recomputed per render (100 operators, under a millisecond) so Studio edits and reviews show up at once. */
  function netIndex() {
    try { RN.model.applyEdits(); } catch (e) { /* model not ready */ }
    const cells = {};
    const cell = (a, s) => cells[a + '|' + s] || (cells[a + '|' + s] = { area: a, stage: s, lib: [], tags: {}, any: new Set(), ver: new Set() });
    F.fitTags.options.forEach((o) => { if (o.axis) cell(o.axis, R.stageOf(o)).lib.push(o.v); });
    const tags = {};
    const verOps = new Set();
    RN.model.ops.forEach((op) => {
      if (op.hidden) return;
      op.tags.forEach((t) => {
        const k = t.t.toLowerCase();
        const ts = tags[k] || (tags[k] = { t: t.t, any: [], ver: [] });
        if (!ts.any.includes(op)) ts.any.push(op);
        const verified = t.tier !== 'claimed';
        if (verified) { ts.ver.push(op); verOps.add(op.id); }
        const info = RN.model.tagInfo(t.t) || {};
        const axis = t.axis || info.axis;
        if (!axis) return;
        const c = cell(axis, R.stageOf({ t: t.t, stage: t.stage || info.stage || '' }));
        const ct = c.tags[t.t] || (c.tags[t.t] = { t: t.t, any: 0, ver: 0 });
        ct.any++; if (verified) ct.ver++;
        c.any.add(op.id); if (verified) c.ver.add(op.id);
      });
    });
    return { cells, tags, verOps };
  }
  R.index = netIndex;

  // Aggregate one cell, a whole area (stage null) or a whole stage (area null)
  function agg(ix, area, stage) {
    const tags = {}, any = new Set(), ver = new Set();
    Object.values(ix.cells).forEach((c) => {
      if ((area && c.area !== area) || (stage && c.stage !== stage)) return;
      c.lib.forEach((v) => { if (!tags[v]) tags[v] = { t: v, any: 0, ver: 0 }; });
      Object.values(c.tags).forEach((t) => { const x = tags[t.t] || (tags[t.t] = { t: t.t, any: 0, ver: 0 }); x.any += t.any; x.ver += t.ver; });
      c.any.forEach((i) => any.add(i)); c.ver.forEach((i) => ver.add(i));
    });
    const list = Object.values(tags).sort((a, b) => b.ver - a.ver || b.any - a.any || a.t.localeCompare(b.t));
    return { area, stage, tags: list, any: any.size, ver: ver.size };
  }

  // Operators strongest in a cell, area or stage: verified proof first, then claims, then Reputation Index
  function topOps(area, stage, n, cat) {
    return RN.model.ops.filter((op) => !op.hidden && (!cat || op.catKey === cat)).map((op) => {
      const hits = op.tags.filter((t) => {
        const info = RN.model.tagInfo(t.t) || {};
        const ax = t.axis || info.axis;
        return (!area || ax === area) && (!stage || R.stageOf({ t: t.t, stage: t.stage || info.stage || '' }) === stage);
      });
      const v = hits.filter((t) => t.tier !== 'claimed');
      return { op, hits, v, s: v.length * 100 + Math.min(hits.length, 6) * 8 + op.ris.score * 0.5 + (op.photo ? 4 : 0) };
    }).filter((x) => x.hits.length).sort((a, b) => b.s - a.s).slice(0, n || 3);
  }
  const whyLine = (x) => x.v.length ? `Client-verified in ${x.v[0].t}${x.v.length > 1 ? ` and ${x.v.length - 1} more here` : ''}` : `Claims ${x.hits.slice(0, 2).map((t) => t.t).join(' and ')}`;

  // Proof-strength fill: tint -> brand by verified operators (sqrt spreads the low end). Claimed-only and empty get their own styles.
  function fill(ver, any, maxV, libN) {
    if (ver > 0) {
      const t = Math.min(1, Math.sqrt(ver / Math.max(1, maxV)));
      const p = Math.round(18 + t * 74);
      return { cls: 'is-v' + (p > 55 ? ' is-hi' : ''), style: `--rs-p:${p}%` };
    }
    if (any > 0) return { cls: 'is-c', style: '' };
    return { cls: libN ? 'is-open' : 'is-empty', style: '' };
  }

  /* =====================================================================
     Shared bits
     ===================================================================== */
  const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#insights">Insights</a>${items.map((x) => `${icon('chev-right')}${x.to ? `<a href="#${esc(x.to)}">${esc(x.l)}</a>` : `<span>${esc(x.l)}</span>`}`).join('')}</nav>`;
  const illus = (label) => `<span class="pill pill-warn rs-illus" title="Market and survey figures in this prototype are invented to show shape and value">${icon('info')}${esc(label || 'Illustrative data')}</span>`;
  const jsonAttr = (o) => esc(JSON.stringify(o));

  // Browse hand-off (SPEC loop 10): same store keys Browse reads, same event Insights logs
  function goBrowse(o) {
    const f = {};
    Object.keys(o.filters || {}).forEach((k) => { const v = o.filters[k]; if (Array.isArray(v) ? v.length : v) f[k] = v; });
    RN.store.update((s) => { s.browse = Object.assign({}, s.browse, { q: o.q || '', tags: o.tags || [], filters: f, sort: 'best' }); }, 'browse');
    RN.track('research_cta', { source: o.source || 'research', filters: f, q: o.q || '', tags: o.tags || [] });
    while (RN.ui.modalEl()) RN.ui.closeModal();
    RN.go('browse');
  }
  RN.actions['rs-browse'] = (el) => {
    let f = {}, tags = [];
    try { f = JSON.parse(el.dataset.f || '{}'); } catch (e) { f = {}; }
    try { tags = el.dataset.tags ? JSON.parse(el.dataset.tags) : []; } catch (e) { tags = []; }
    goBrowse({ filters: f, tags, q: el.dataset.q || '', source: el.dataset.src });
  };
  const browseBtn = (label, o, cls) => `<button type="button" class="${cls || 'btn'}" data-act="rs-browse" data-src="${esc(o.src || 'research')}" data-f="${jsonAttr(o.filters || {})}" data-tags="${jsonAttr(o.tags || [])}" data-q="${esc(o.q || '')}">${esc(label)}${icon('arrow')}</button>`;

  RN.actions['rs-scroll'] = (el) => {
    const t = document.getElementById(el.dataset.to);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  RN.actions['rs-copy'] = (el) => {
    const src = document.getElementById(el.dataset.src);
    const text = src ? src.textContent : '';
    let settled = false;
    const done = () => { if (settled) return; settled = true; RN.ui.toast('Structured data copied', { icon: 'copy' }); };
    const fallback = () => { if (settled) return; settled = true; fallbackCopy(text, () => RN.ui.toast('Structured data copied', { icon: 'copy' })); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
        setTimeout(fallback, 700); // some browsers never settle without a permission prompt
      } else fallback();
    } catch (e) { fallback(); }
  };
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { RN.ui.toast('Select the code and copy it by hand', { icon: 'info' }); }
    ta.remove();
  }
  // JSON-LD block for the dev team: shown in a collapsible and embedded as a real script tag
  function schemaBlock(id, obj, note) {
    const json = JSON.stringify(obj, null, 2);
    return `<details class="rs-schema" id="${esc(id)}-wrap">
      <summary>${icon('code')}<span><b>Structured data</b><span class="tiny muted">${esc(note || 'For the dev team: schema.org JSON-LD for this page')}</span></span>${icon('chev-down', 'rs-chev')}</summary>
      <div class="rs-schema-bd">
        <div class="row between"><span class="tiny muted">Paste into the page head as <span class="mono">application/ld+json</span>.</span><button type="button" class="act" data-act="rs-copy" data-src="${esc(id)}">${icon('copy')}Copy</button></div>
        <pre class="mono" id="${esc(id)}">${esc(json)}</pre>
      </div>
    </details>
    <script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script>`;
  }

  // Charts are drawn in mount() at the container's real pixel width so chart text stays at 12px.
  let chartFns = {};
  const chartSlot = (key, fn, cls) => { chartFns[key] = fn; return `<div class="rs-chart ${cls || ''}" data-rs-chart="${esc(key)}"></div>`; };
  function drawCharts(root) {
    RN.$$('[data-rs-chart]', root || document).forEach((el) => {
      const fn = chartFns[el.dataset.rsChart];
      if (!fn) return;
      const w = Math.max(240, Math.round(el.clientWidth || el.parentElement.clientWidth || 320));
      try { el.innerHTML = fn(w); } catch (e) { console.error(e); }
    });
  }
  // Bars that stay legible on phones: RN.chart.bars at desktop widths, same data with the label above the bar when narrow
  function bars(rows, o, w) {
    o = o || {};
    const fmt = o.fmt || ((n) => RN.fmt.int(n));
    if (w >= 460) {
      const longest = Math.max(...rows.map((r) => String(r.label).length));
      const labelW = Math.round(RN.clamp(longest * 6.8 + 16, 96, w * 0.44));
      return RN.chart.bars(rows, { w: Math.round(w), labelW, fmt, max: o.max, label: o.label, rowH: 34, barH: 16 });
    }
    return rows.map((r) => `<div class="rs-sbar-row"><div class="row between"><span class="small">${esc(r.label)}</span><b class="small tnum">${esc(fmt(r.value, r))}</b></div>${RN.chart.bars([{ label: '', value: r.value, hi: r.hi, muted: r.muted }], { w: Math.round(w), labelW: 0, rowH: 20, barH: 12, max: o.max || Math.max(...rows.map((x) => x.value), 1), fmt: () => '' })}</div>`).join('');
  }

  let resizeTimer = null, lastW = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      if (Math.abs(w - lastW) < 24) return;
      lastW = w;
      drawCharts(document.getElementById('main'));
    }, 160);
  }
  function mountCommon(root) {
    lastW = window.innerWidth;
    drawCharts(root);
    window.addEventListener('resize', onResize);
  }
  function unmountCommon() {
    window.removeEventListener('resize', onResize);
    while (RN.ui.modalEl()) RN.ui.closeModal();
  }

  // Engagement Blueprints live in projects.js; link to the matching one when it is loaded, else to the library
  function blueprintFor(cat, prefId) {
    const bps = (RN.data.blueprints || (RN.projects && RN.projects.blueprints) || []);
    const list = Array.isArray(bps) ? bps : Object.values(bps);
    const hit = (prefId && list.find((b) => b.id === prefId)) || (cat ? list.find((b) => (b.fields && b.fields.roleCategory === cat) || b.roleCategory === cat || b.cat === cat) : null);
    return hit ? { to: 'blueprint.' + (hit.id || hit.slug || hit.key), title: hit.title || hit.name || 'Engagement Blueprint', sub: hit.blurb || hit.summary || hit.problem || '' } : null;
  }

  /* =====================================================================
     #framework
     ===================================================================== */
  const fw = { mStage: 'Qualify' };

  function bowtie(ix) {
    const st = journey();
    const H = { awareness: [1, 0.82], engage: [0.82, 0.65], qualify: [0.65, 0.49], commit: [0.49, 0.34], onboard: [0.34, 0.55], adopt: [0.55, 0.78], expand: [0.78, 1] };
    const aggs = st.map((s) => agg(ix, null, s.name));
    const maxV = Math.max(1, ...aggs.map((a) => a.ver));
    const inset = (x) => (((1 - x) / 2) * 100).toFixed(1) + '%';
    const seg = (s, a) => {
      const hh = H[s.id] || [1, 1];
      const f = fill(a.ver, a.any, maxV, a.tags.length);
      return `<button type="button" class="rs-seg ${f.cls}" style="--a:${inset(hh[0])};--b:${inset(hh[1])};${f.style}" data-act="rs-fw-open" data-stage="${esc(s.name)}"
        aria-label="${esc(s.name)}: ${a.ver} operators with client-verified proof, ${a.any} claim work here. Open the stage.">
        <span class="rs-seg-shape" aria-hidden="true"></span>
        <span class="rs-seg-txt"><b>${esc(s.name)}</b><span class="rs-seg-n">${a.ver} verified</span><span class="rs-seg-sub">${a.any} claim</span></span>
      </button>`;
    };
    const before = st.filter((s) => s.side === 'before');
    const after = st.filter((s) => s.side !== 'before');
    return `<div class="rs-bow-wrap">
      <div class="rs-bow-sides" aria-hidden="true"><span style="flex:${before.length}">Before the sale</span><span class="rs-bow-sides-k"></span><span style="flex:${after.length}">After the sale</span></div>
      <div class="rs-bow">
        <span class="rs-bow-m">Before the sale</span>
        ${before.map((s) => seg(s, aggs[st.indexOf(s)])).join('')}
        <div class="rs-knot" aria-hidden="true"><span class="rs-knot-dot">${icon('seal')}</span><span>Signed</span></div>
        <span class="rs-bow-m">After the sale</span>
        ${after.map((s) => seg(s, aggs[st.indexOf(s)])).join('')}
      </div>
    </div>`;
  }

  function legend() {
    return `<div class="rs-legend" aria-label="Legend">
      <span><i class="rs-sw rs-sw-v"></i>Client-verified proof (stronger color, more operators)</span>
      <span><i class="rs-sw rs-sw-c"></i>Self-claimed only</span>
      <span><i class="rs-sw rs-sw-o"></i>Focus areas mapped, no operators yet</span>
    </div>`;
  }

  function gridCells(ix) {
    const areas = R.areas(), stages = allStages();
    const map = {};
    let maxV = 1;
    areas.forEach((a) => stages.forEach((s) => { const x = agg(ix, a.name, s.name); map[a.name + '|' + s.name] = x; maxV = Math.max(maxV, x.ver); }));
    return { map, maxV, areas, stages };
  }
  function cellBtn(g, a, s, mobile) {
    const x = g.map[a.name + '|' + s.name];
    const f = fill(x.ver, x.any, g.maxV, x.tags.length);
    const label = `${a.name} at ${s.name}: ${x.ver} operators with client-verified proof, ${x.any} claim work here, ${x.tags.length} focus areas`;
    if (mobile) {
      return `<button type="button" class="rs-mcell ${f.cls}" style="${f.style}" data-act="rs-fw-open" data-area="${esc(a.name)}" data-stage="${esc(s.name)}" aria-label="${esc(label)}">
        <span class="rs-mcell-sw" aria-hidden="true"></span>
        <span class="rs-mcell-name">${icon(a.icon)}<b>${esc(a.name)}</b></span>
        <span class="rs-mcell-n">${!x.tags.length ? 'None mapped' : !x.any ? 'No operators yet' : `<b>${x.ver}</b> verified · ${x.any} claim`}</span>
        ${icon('chev-right')}
      </button>`;
    }
    return `<button type="button" class="rs-cell ${f.cls}" style="${f.style}" data-act="rs-fw-open" data-area="${esc(a.name)}" data-stage="${esc(s.name)}" aria-label="${esc(label)}">
      ${!x.tags.length ? '<span class="rs-cell-none">None mapped</span>'
        : !x.any ? `<span class="rs-cell-c">No operators yet</span><span class="rs-cell-t">${plural(x.tags.length, 'focus area')}</span>`
        : `<span class="rs-cell-v"><b>${x.ver}</b><span>verified</span></span><span class="rs-cell-c">${x.any} claim</span><span class="rs-cell-t">${plural(x.tags.length, 'focus area')}</span>`}
    </button>`;
  }
  function grid(ix) {
    const g = gridCells(ix);
    const js = journey();
    const nb = js.filter((s) => s.side === 'before').length;
    const desktop = `<div class="rs-grid" role="group" aria-label="GTM Framework: areas by stage. Each cell opens a panel.">
      <div class="rs-gh rs-gh-corner" aria-hidden="true"></div>
      <div class="rs-gh rs-gh-side" style="grid-column: span ${nb}">Before the sale</div>
      <div class="rs-gh rs-gh-side is-after" style="grid-column: span ${js.length - nb}">After the sale</div>
      <div class="rs-gsp" aria-hidden="true"></div>
      <div class="rs-gh rs-gh-side is-all">Every stage</div>
      <div class="rs-gh rs-gh-corner"><span class="label">Area</span></div>
      ${js.map((s) => `<button type="button" class="rs-gh rs-gh-stage" data-act="rs-fw-open" data-stage="${esc(s.name)}">${esc(s.name)}</button>`).join('')}
      <div class="rs-gsp" aria-hidden="true"></div>
      <button type="button" class="rs-gh rs-gh-stage is-all" data-act="rs-fw-open" data-stage="Foundation">Foundation</button>
      ${g.areas.map((a) => `<button type="button" class="rs-ga" data-act="rs-fw-open" data-area="${esc(a.name)}"><span class="rs-ga-ic">${icon(a.icon)}</span><span><b>${esc(a.name)}</b><span class="rs-ga-d">${esc(a.def.split(':')[0])}</span></span></button>
        ${js.map((s) => cellBtn(g, a, s)).join('')}
        <div class="rs-gsp" aria-hidden="true"></div>
        ${cellBtn(g, a, FOUNDATION)}`).join('')}
    </div>`;
    const cur = stageBy(fw.mStage) || journey()[2];
    const mobile = `<div class="rs-mgrid">
      <div class="rs-mstages" role="tablist" aria-label="Stage">
        ${allStages().map((s) => `<button type="button" class="chip chip-sm ${s.name === cur.name ? 'on' : ''}" role="tab" aria-selected="${s.name === cur.name}" data-act="rs-fw-mstage" data-stage="${esc(s.name)}">${esc(s.name)}</button>`).join('')}
      </div>
      <div class="rs-mhead"><span class="label">${esc(cur.side === 'before' ? 'Before the sale' : cur.side === 'after' ? 'After the sale' : 'Every stage')}</span><p class="small muted">${esc(cur.what)}</p></div>
      <div class="rs-mrows">${g.areas.map((a) => cellBtn(g, a, cur, true)).join('')}</div>
    </div>`;
    return desktop + mobile;
  }
  RN.actions['rs-fw-mstage'] = (el) => {
    fw.mStage = el.dataset.stage;
    const box = RN.$('[data-rs-grid]');
    if (box) box.innerHTML = grid(netIndex());
  };

  // What the map shows today: computed findings, so the copy stays true as reviews arrive
  function findings(ix) {
    const areas = R.areas();
    const out = [];
    const verTotal = ix.verOps.size;
    const stAggs = journey().map((s) => ({ s, a: agg(ix, null, s.name) }));
    const topStage = stAggs.slice().sort((x, y) => y.a.ver - x.a.ver || y.a.any - x.a.any)[0];
    const where = topStage.a.ver === verTotal ? `All of them have it at ${topStage.s.name}.` : `${topStage.a.ver} of them have it at ${topStage.s.name}, more than at any other stage.`;
    out.push({ v: String(verTotal), l: `${verTotal === 1 ? 'operator on the network has' : 'operators on the network have'} client-verified proof so far. ${where}`, act: `data-act="rs-fw-open" data-stage="${esc(topStage.s.name)}"`, cta: `Open ${topStage.s.name}` });
    const afterOps = new Set();
    Object.values(ix.cells).forEach((c) => { const st = stageBy(c.stage); if (st && st.side === 'after') c.ver.forEach((i) => afterOps.add(i)); });
    const afterClaim = new Set();
    Object.values(ix.cells).forEach((c) => { const st = stageBy(c.stage); if (st && st.side === 'after') c.any.forEach((i) => afterClaim.add(i)); });
    out.push({ v: String(afterOps.size), l: `${afterOps.size === 1 ? 'operator has' : 'operators have'} verified proof after the sale, while ${afterClaim.size} claim onboarding, adoption or expansion work. That is the thinnest proof on the map.`, act: 'data-act="rs-fw-open" data-stage="Adopt"', cta: 'Open Adopt' });
    let best = null;
    areas.forEach((a) => journey().forEach((s) => { const x = agg(ix, a.name, s.name); if (!best || x.any > best.any) best = x; }));
    if (best) out.push({ v: String(best.any), l: `operators claim ${cellText(best.area + ' work', best.stage)}, the most crowded cell. Clients should ask for verified proof here before they hire.`, act: `data-act="rs-fw-open" data-area="${esc(best.area)}" data-stage="${esc(best.stage)}"`, cta: 'Open the cell' });
    return out;
  }

  function openPanel(area, stage) {
    const ix = netIndex();
    const a = agg(ix, area || null, stage || null);
    const st = stage ? stageBy(stage) : null;
    const ar = area ? R.areas().find((x) => x.name === area) : null;
    const tops = topOps(area || null, stage || null, 3);
    const topTag = a.tags.find((t) => t.any > 0) || a.tags[0];
    const title = area && stage ? cellHtml(area, stage) : esc(area || stage);
    const sub = `${plural(a.ver, 'operator')} with client-verified proof · ${a.any} claim work here`;
    const libFilter = { area: area || '', stage: stage || '' };

    // Breakdown along the open dimension (stage panel lists areas, area panel lists stages)
    let breakdown = '';
    if (!area || !stage) {
      const rows = !area ? R.areas().map((x) => ({ k: x.name, a: agg(ix, x.name, stage), attrs: `data-area="${esc(x.name)}" data-stage="${esc(stage)}"`, ic: x.icon }))
        : allStages().map((s) => ({ k: s.name, a: agg(ix, area, s.name), attrs: `data-area="${esc(area)}" data-stage="${esc(s.name)}"`, ic: s.side === 'after' ? 'arrow-up-right' : s.side === 'all' ? 'layers' : 'arrow' }));
      const maxAny = Math.max(1, ...rows.map((r) => r.a.any));
      breakdown = `<div class="rs-pn-block"><span class="label">${!area ? 'By area' : 'By stage'}</span>
        <div class="rs-pn-rows">${rows.map((r) => `<button type="button" class="rs-pn-row" data-act="rs-fw-open" ${r.attrs}>
          <span class="rs-pn-row-k">${icon(r.ic)}${esc(r.k)}</span>
          <span class="rs-pn-row-m" aria-hidden="true"><i style="width:${Math.round((r.a.any / maxAny) * 100)}%"></i></span>
          <span class="rs-pn-row-v tnum"><b>${r.a.ver}</b> / ${r.a.any}</span>
        </button>`).join('')}</div>
        <p class="tiny muted">Verified / claimed operators. Select a row to open that cell.</p></div>`;
    }

    const tagRows = a.tags.slice(0, 10).map((t) => `<li class="rs-pn-tag">
      <button type="button" class="rs-pn-tag-b" data-act="rs-lib-open" data-q="${esc(t.t)}" title="Open in the Fit Tag Library">
        <span class="rs-pn-tag-n">${t.ver ? icon('check-circle') : ''}${esc(t.t)}</span>
        <span class="tiny muted tnum">${t.ver ? `<b class="accent">${t.ver} verified</b> · ` : ''}${t.any ? `${t.any} claim` : 'No operators yet'}</span>
      </button></li>`).join('');

    const body = `<div class="rs-pn">
      ${st ? `<div class="rs-pn-block"><span class="label">What good looks like${st.side === 'all' ? '' : ` at ${esc(st.name)}`}</span>
        <p class="rs-pn-what">${esc(st.what)}</p>
        <p class="rs-pn-skilled serif-up">${esc(st.skilled)}</p></div>` : ''}
      ${ar ? `<div class="rs-pn-block"><span class="label">The area</span><p class="rs-pn-what">${esc(ar.def)}</p></div>` : ''}
      ${breakdown}
      <div class="rs-pn-block"><div class="row between"><span class="label">Focus areas here (${a.tags.length})</span>${a.tags.length ? `<button type="button" class="act" data-act="rs-lib-open" data-area="${esc(libFilter.area)}" data-stage="${esc(libFilter.stage)}">${a.tags.length > 10 ? 'See all' : 'Open in library'}${icon('arrow')}</button>` : ''}</div>
        ${a.tags.length ? `<ul class="rs-pn-tags">${tagRows}</ul>` : `<p class="small muted">No focus areas are mapped to this cell yet. It is open ground in the taxonomy.</p>`}
        ${topTag && topTag.any ? `<p class="tiny muted">“Find operators strong here” opens Browse filtered to ${esc(topTag.t)}, the most proven focus area in this ${area && stage ? 'cell' : area ? 'area' : 'stage'}.</p>` : ''}</div>
      <div class="rs-pn-block"><span class="label">Operators strong here</span>
        ${tops.length ? `<div class="stack" style="--gap:12px">${tops.map((x) => RN.ui.opCard(x.op, { compact: true, why: whyLine(x) })).join('')}</div>`
          : RN.ui.empty({ icon: 'users', title: 'No operators here yet', body: 'Nobody on the network lists work in this cell. Tell us what you need and we will source it.', cta: '<a class="btn btn-line btn-sm" href="#talk">Talk to us</a>' })}
      </div>
    </div>`;
    const foot = topTag && topTag.any
      ? browseBtn('Find operators strong here', { tags: [topTag.t], src: 'framework_cell' }, 'btn btn-block')
      : `<a class="btn btn-block" href="#talk">Talk to us${icon('arrow')}</a>`;
    RN.ui.drawer({ title, sub: esc(sub), body, foot });
  }
  R.openPanel = openPanel;
  RN.actions['rs-fw-open'] = (el) => {
    while (RN.ui.modalEl()) RN.ui.closeModal();
    openPanel(el.dataset.area || null, el.dataset.stage || null);
  };

  /* ---------- Client self-diagnostic: "Where is your revenue engine leaking?" ---------- */
  const DIAG = [
    { q: 'Where do deals get stuck most often?', w: 3, o: [
      { l: 'We do not get enough first meetings', area: 'Generate demand', stage: 'Engage', cat: 'marketing' },
      { l: 'Meetings happen, but few turn into real opportunities', area: 'Win deals', stage: 'Qualify', cat: 'sales_leadership' },
      { l: 'Deals reach a proposal, then slip or get discounted', area: 'Win deals', stage: 'Commit', cat: 'sales_leadership' },
      { l: 'Customers sign, then go quiet or leave', area: 'Retain & expand', stage: 'Adopt', cat: 'customer_success_growth' },
    ] },
    { q: 'Who closes deals today?', w: 2, o: [
      { l: 'The founder closes almost every deal', area: 'Lead & plan', stage: 'Foundation', cat: 'sales_leadership', tag: 'Founder-Led Sales Exit' },
      { l: 'A few reps, and nobody leading them', area: 'Build the team', stage: 'Foundation', cat: 'sales_leadership', tag: 'Sales Team Hiring & Ramp' },
      { l: 'A team with a leader, but results vary a lot by rep', area: 'Build the team', stage: 'Qualify', cat: 'sales_enablement', tag: 'Call Coaching & Feedback' },
      { l: 'A team that hits its number', none: true },
    ] },
    { q: 'How much do you trust your forecast?', w: 2, o: [
      { l: 'We do not really have one', area: 'Win deals', stage: 'Qualify', cat: 'sales_leadership', tag: 'Pipeline Inspection' },
      { l: 'It is a spreadsheet and a gut call', area: 'Systems & data', stage: 'Qualify', cat: 'revenue_operations', tag: 'Forecast Dashboard' },
      { l: 'It lives in the CRM, but nobody trusts the data', area: 'Systems & data', stage: 'Foundation', cat: 'revenue_operations', tag: 'CRM cleanup' },
      { l: 'It usually lands within 10%', none: true },
    ] },
    { q: 'What happens after a customer signs?', w: 2, o: [
      { l: 'Sales hands off by email and hopes for the best', area: 'Retain & expand', stage: 'Onboard', cat: 'customer_success_growth', tag: 'Customer Onboarding Program' },
      { l: 'Onboarding works, but usage fades after a few months', area: 'Retain & expand', stage: 'Adopt', cat: 'customer_success_growth', tag: 'Churn Reduction Program' },
      { l: 'Customers stay, but rarely buy more', area: 'Retain & expand', stage: 'Expand', cat: 'customer_success_growth', tag: 'NRR & Expansion Motion' },
      { l: 'Retention and expansion are strong', none: true },
    ] },
    { q: 'How do the right companies find out about you?', w: 2, o: [
      { l: 'Most of them have never heard of us', area: 'Generate demand', stage: 'Awareness', cat: 'marketing', tag: 'Brand Strategy' },
      { l: 'They know us, but our message sounds like everyone else', area: 'Generate demand', stage: 'Awareness', cat: 'marketing', tag: 'Brand positioning' },
      { l: 'Plenty of inbound, but few leads become pipeline', area: 'Systems & data', stage: 'Engage', cat: 'revenue_operations', tag: 'Lead Routing' },
      { l: 'Awareness is not our problem', none: true },
    ] },
  ];
  const diag = { step: 0, ans: [] };

  function diagScore() {
    const cells = {}, cats = {};
    diag.ans.forEach((ai, qi) => {
      const o = DIAG[qi].o[ai];
      if (!o || o.none) return;
      const w = DIAG[qi].w;
      const k = o.area + '|' + o.stage;
      cells[k] = cells[k] || { area: o.area, stage: o.stage, s: 0, first: qi, tags: [] };
      cells[k].s += w;
      if (o.tag) cells[k].tags.push(o.tag);
      cats[o.cat] = (cats[o.cat] || 0) + w;
    });
    const ranked = Object.values(cells).sort((a, b) => b.s - a.s || a.first - b.first);
    const top = ranked[0] || null;
    let cat = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0] || null;
    if (top) { const topCat = DIAG[top.first].o[diag.ans[top.first]].cat; if (cats[topCat] === cats[cat]) cat = topCat; }
    return { top, second: ranked[1] || null, cat };
  }

  function diagQuestion() {
    const i = diag.step;
    const q = DIAG[i];
    return `<div class="rs-dq" role="group" aria-labelledby="rs-dq-t">
      <div class="row between"><span class="step-count">Question ${i + 1} of ${DIAG.length}</span>${i ? `<button type="button" class="act rs-dq-back" data-act="rs-dg-back">${icon('arrow-left')}Back</button>` : ''}</div>
      <div class="stepper" aria-hidden="true">${DIAG.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <h3 class="rs-dq-t" id="rs-dq-t">${esc(q.q)}</h3>
      <div class="rs-dq-opts" role="radiogroup" aria-labelledby="rs-dq-t">
        ${q.o.map((o, k) => `<button type="button" class="rs-dq-opt" role="radio" aria-checked="${diag.ans[i] === k}" data-act="rs-dg-pick" data-i="${k}"><span class="rs-dq-radio" aria-hidden="true"></span><span>${esc(o.l)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  function diagResult() {
    const r = diagScore();
    if (!r.top) {
      return `<div class="rs-dr">
        <span class="eyebrow">Your result</span>
        <h3 class="rs-dr-t">No clear leak. Your engine looks healthy.</h3>
        <p class="rs-dr-p">Companies in your position usually hire fractional help to scale what already works, often a new segment, a new channel or a larger team. Engagement Blueprints show what those projects look like.</p>
        <div class="row" style="margin-top:22px"><a class="btn btn-leaf" href="#blueprints">Browse Engagement Blueprints${icon('arrow')}</a><button type="button" class="btn btn-line" data-act="rs-dg-reset">${icon('refresh')}Start over</button></div>
      </div>`;
    }
    const st = stageBy(r.top.stage);
    const cat = r.cat || AREA_META[r.top.area].cat;
    const ri = RIX().byCat[cat];
    const range = monthRange(cat, '40', '5m_20m');
    const catL = F.catLabel(cat);
    const bp = blueprintFor(cat);
    return `<div class="rs-dr">
      <span class="eyebrow">Your result</span>
      <h3 class="rs-dr-t">Your biggest leak: <span class="serif">${esc(r.top.area)}</span> ${r.top.stage === 'Foundation' ? 'across every stage' : 'at ' + esc(r.top.stage)}.</h3>
      <p class="rs-dr-p">${esc(st ? st.skilled : '')}</p>
      ${r.second ? `<p class="small rs-dr-also">Also worth a look: ${esc(cellText(r.second.area, r.second.stage))}.</p>` : ''}
      <div class="rs-dr-grid">
        <div class="rs-dr-box"><span class="label">Who to hire</span><b>A fractional ${esc(roleFor(cat))}</b><span class="small">${esc(catL)}${ri ? `, median ${esc(RN.fmt.rate(ri.p50))} on the Rate Index. At 40 hrs a month for a $5M–$20M company: ${esc(range)}.` : '.'}</span></div>
        <div class="rs-dr-box"><span class="label">How to scope it</span><b>${esc(bp ? bp.title + ' Blueprint' : 'Start from an Engagement Blueprint')}</b><span class="small">Hours, term and a 30/60/90-day plan for this kind of work, ready to post as a project.</span></div>
      </div>
      <div class="row rs-dr-acts">
        ${browseBtn(`See ${catL} operators`, { filters: { roleCategories: [cat] }, src: 'framework_diagnostic' }, 'btn btn-leaf')}
        <a class="btn btn-line" href="#${esc(bp ? bp.to : 'blueprints')}">${bp ? 'See the Blueprint' : 'Blueprints'}</a>
        <button type="button" class="btn btn-line" data-act="rs-fw-open" data-area="${esc(r.top.area)}" data-stage="${esc(r.top.stage)}">Open this cell</button>
        <button type="button" class="act rs-dr-reset" data-act="rs-dg-reset">${icon('refresh')}Start over</button>
      </div>
      <p class="tiny rs-dr-note">Your answers stay in this browser tab. We record only the cell and role category, never your answers.</p>
    </div>`;
  }
  function diagOps() {
    const r = diagScore();
    if (!r.top) return '';
    const cat = r.cat || AREA_META[r.top.area].cat;
    let list = topOps(r.top.area, r.top.stage, 3, cat);
    if (list.length < 3) list = list.concat(topOps(r.top.area, null, 6, cat).filter((x) => !list.some((y) => y.op.id === x.op.id))).slice(0, 3);
    if (list.length < 3) list = list.concat(RN.model.search({ filters: { roleCategories: [cat] }, sort: 'ris' }).map((x) => ({ op: x.op, hits: [], v: [] })).filter((x) => !list.some((y) => y.op.id === x.op.id))).slice(0, 3);
    return `<div class="rs-dops">
      <div class="row between" style="align-items:flex-end"><div><span class="eyebrow">Matched to your result</span><h3 class="h3" style="margin-top:8px">Operators strong in ${esc(cellText(r.top.area, r.top.stage))}</h3></div>
      ${browseBtn('See more', { filters: { roleCategories: [cat] }, src: 'framework_diagnostic' }, 'btn btn-line btn-sm')}</div>
      <div class="grid g-3" style="margin-top:20px">${list.map((x) => RN.ui.opCard(x.op, { compact: true, why: x.hits.length ? whyLine(x) : `Fractional ${x.op.role}` })).join('')}</div>
    </div>`;
  }
  function paintDiag(scroll) {
    const box = RN.$('#rs-diag-flow');
    if (!box) return;
    const done = diag.step >= DIAG.length;
    box.innerHTML = done ? diagResult() : diagQuestion();
    const ops = RN.$('#rs-diag-ops');
    if (ops) { ops.innerHTML = done ? diagOps() : ''; ops.hidden = !done; }
    if (scroll) { const t = RN.$('#rs-diag'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const first = box.querySelector(done ? '.rs-dr-t' : '.rs-dq-opt');
    if (first && !done) first.focus({ preventScroll: true });
  }
  RN.actions['rs-dg-pick'] = (el) => {
    diag.ans[diag.step] = +el.dataset.i;
    RN.$$('.rs-dq-opt', el.parentElement).forEach((b) => b.setAttribute('aria-checked', b === el));
    setTimeout(() => {
      diag.step += 1;
      if (diag.step >= DIAG.length) {
        const r = diagScore();
        RN.track('diagnostic_complete', { source: 'framework', meta: r.top ? { area: r.top.area, stage: r.top.stage, roleCategory: r.cat } : { area: null } });
      }
      paintDiag(diag.step >= DIAG.length);
    }, 160);
  };
  RN.actions['rs-dg-back'] = () => { diag.step = Math.max(0, diag.step - 1); paintDiag(); };
  RN.actions['rs-dg-reset'] = () => { diag.step = 0; diag.ans = []; paintDiag(true); };

  function renderFramework() {
    chartFns = {};
    const ix = netIndex();
    const libN = F.fitTags.options.length;
    const finds = findings(ix);
    const areas = R.areas();
    return `<div class="rs rs-fw">
    <header class="wrap phead rs-head">
      ${crumbs([{ l: 'GTM Framework' }])}
      <span class="eyebrow">Revenue Nomad GTM Framework</span>
      <h1 class="h1">Every revenue problem has <span class="serif">an address.</span></h1>
      <p class="lede">The framework places all go-to-market work on two lenses: the area of work, and the stage of the customer's journey it changes. Every focus area, profile, client review and Engagement Blueprint on Revenue Nomad uses it, so a company's problem and an operator's proof are described in the same words.</p>
      <div class="stats-row rs-kpis" style="--cols:4">
        <div class="stat"><span class="stat-v">6</span><span class="stat-l">Areas of work</span></div>
        <div class="stat"><span class="stat-v">7</span><span class="stat-l">Customer-journey stages</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(libN)}</span><span class="stat-l">Focus areas mapped</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(ix.verOps.size)}</span><span class="stat-l">Operators with client-verified proof</span></div>
      </div>
    </header>

    <section class="wrap rs-sec" aria-labelledby="rs-bow-t">
      <div class="rs-sec-hd">
        <div><span class="kicker">The customer journey</span><h2 class="h2" id="rs-bow-t">Seven stages, <span class="serif">one bowtie.</span></h2></div>
        <p class="body">Four stages narrow toward the signature. Three widen after it, as a customer adopts and grows. Shading shows where operators on the network have client-verified proof. Select a stage for what good looks like there.</p>
      </div>
      ${bowtie(ix)}
      ${legend()}
    </section>

    <section class="wrap rs-sec" aria-labelledby="rs-grid-t">
      <div class="rs-sec-hd">
        <div><span class="kicker">The map</span><h2 class="h2" id="rs-grid-t">Six areas <span class="serif">across seven stages.</span></h2></div>
        <p class="body">Each cell counts the operators with client-verified proof there and the operators who claim the work. Select a cell to see what good looks like, the focus areas that live in it and who is strongest. Foundation holds the work every stage runs on.</p>
      </div>
      <div class="rs-grid-box" data-rs-grid>${grid(ix)}</div>
      ${legend()}
    </section>

    <section class="wrap rs-sec rs-find" aria-labelledby="rs-find-t">
      <h2 class="sr-only" id="rs-find-t">What the map shows today</h2>
      <div class="rs-finds">
        <div class="rs-finds-hd"><span class="kicker">What the map shows today</span><p class="small muted">Computed live from ${RN.fmt.int(RN.model.ops.length)} operator profiles${MK().network && MK().network.operators ? ` (this prototype loads a sample of the ${esc(MK().network.operators)} on the network)` : ''}. A focus area counts as verified once a client review rated 4.0 or higher confirms it.</p></div>
        ${finds.map((f) => `<div class="rs-fnd"><span class="rs-fnd-v num">${esc(f.v)}</span><p>${esc(f.l)}</p><button type="button" class="act" ${f.act}>${esc(f.cta)}${icon('arrow')}</button></div>`).join('')}
      </div>
    </section>

    <section class="wrap rs-sec" aria-labelledby="rs-areas-t">
      <div class="rs-sec-hd">
        <div><span class="kicker">The areas</span><h2 class="h2" id="rs-areas-t">Six kinds of <span class="serif">go-to-market work.</span></h2></div>
        <p class="body">An operator's profile shows how much client-verified proof they have in each area. The same six areas describe what a company needs and what an Engagement Blueprint delivers.</p>
      </div>
      <div class="grid g-3 rs-areas">
        ${areas.map((a) => { const x = agg(ix, a.name, null); return `<button type="button" class="rs-area card" data-act="rs-fw-open" data-area="${esc(a.name)}">
          <span class="rs-area-ic">${icon(a.icon)}</span>
          <h3 class="h4">${esc(a.name)}</h3>
          <p class="small muted">${esc(a.def)}</p>
          <span class="rs-area-n"><span><b class="num">${x.ver}</b> verified</span><span><b class="num">${x.any}</b> claim</span><span><b class="num">${x.tags.length}</b> focus areas</span></span>
        </button>`; }).join('')}
      </div>
    </section>

    <section class="night rs-diag-band" id="rs-diag" aria-labelledby="rs-diag-t">
      <div class="wrap rs-diag">
        <div class="rs-diag-intro">
          <span class="eyebrow">Self-diagnostic for companies</span>
          <h2 class="h2" id="rs-diag-t">Where is your revenue engine <span class="serif">leaking?</span></h2>
          <p class="lede">Five questions, about a minute. You get the cell where your gap sits, the role to hire for it, a Blueprint to scope it and three operators with proof there.</p>
          <ul class="rs-diag-list">
            <li>${icon('check')}No sign-up, nothing to type</li>
            <li>${icon('check')}Built on the same map as every profile</li>
            <li>${icon('lock')}Your answers are not stored</li>
          </ul>
        </div>
        <div class="rs-diag-flow" id="rs-diag-flow" aria-live="polite">${diag.step >= DIAG.length ? diagResult() : diagQuestion()}</div>
      </div>
    </section>
    <section class="wrap rs-diag-ops-sec" id="rs-diag-ops" ${diag.step >= DIAG.length && diagScore().top ? '' : 'hidden'}>${diag.step >= DIAG.length ? diagOps() : ''}</section>

    <section class="wrap rs-sec rs-method" aria-labelledby="rs-m-t">
      <div class="rs-method-in">
        <div><span class="kicker">How the map is built</span><h2 class="h3" id="rs-m-t">Method and sources</h2></div>
        <div class="prose small">
          <p>Every fit tag in the <a href="#library">Fit Tag Library</a> carries one area and one stage. Counts on this page come from the ${RN.fmt.int(RN.model.ops.length)} operator profiles on the network. An operator counts as <b>claiming</b> a cell when they list a focus area in it, and as <b>client-verified</b> when a client review rated 4.0 or higher confirms that focus area.</p>
          <p>Revenue Nomad Research reviewed the stage of ${Object.keys(CURATED).length} focus areas in this edition so each sits at the stage it changes: brand and content work at Awareness, pricing and negotiation at Commit, onboarding at Onboard, expansion selling at Expand. Areas were not changed.</p>
          <p>Stage copy is Revenue Nomad's own. Cite it as "Revenue Nomad GTM Framework, 2026".</p>
        </div>
        <div class="rs-method-links">
          <a class="rs-link" href="#library">${icon('list')}<span><b>Fit Tag Library</b><small>Every focus area, defined</small></span>${icon('arrow')}</a>
          <a class="rs-link" href="#guides">${icon('book')}<span><b>Guides</b><small>Straight answers with the numbers</small></span>${icon('arrow')}</a>
          <a class="rs-link" href="#blueprints">${icon('doc')}<span><b>Engagement Blueprints</b><small>Scoped projects by cell</small></span>${icon('arrow')}</a>
        </div>
      </div>
    </section>
    </div>`;
  }

  /* =====================================================================
     #library
     ===================================================================== */
  const lib = { q: '', cat: '', area: '', stage: '', sort: 'used' };

  function demandMap() {
    const m = {};
    try { RN.model.market().tags.forEach((t) => { m[t.t.toLowerCase()] = t; }); } catch (e) { /* market not ready */ }
    return m;
  }
  function libRows(ix, dm) {
    return F.fitTags.options.map((o) => {
      const k = o.v.toLowerCase();
      const ts = ix.tags[k] || { any: [], ver: [] };
      const d = dm[k];
      return { o, name: o.l, cat: o.c, g: o.g || '', area: o.axis || '', stage: R.stageOf(o), def: R.def(o.v), any: ts.any.length, ver: ts.ver.length, verOps: ts.ver, demand: d ? d.demand : 0 };
    });
  }
  function libFilter(rows) {
    const words = lib.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (lib.cat && r.cat !== lib.cat) return false;
      if (lib.area && r.area !== lib.area) return false;
      if (lib.stage && r.stage !== lib.stage) return false;
      if (!words.length) return true;
      const hay = [r.name, r.def, r.g, r.area, r.stage, F.catLabel(r.cat)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  function libSort(rows) {
    const by = {
      used: (a, b) => b.ver - a.ver || b.any - a.any || a.name.localeCompare(b.name),
      demand: (a, b) => b.demand - a.demand || b.any - a.any || a.name.localeCompare(b.name),
      az: (a, b) => a.name.localeCompare(b.name),
    }[lib.sort] || ((a, b) => 0);
    return rows.slice().sort(by);
  }

  function tagRow(r) {
    const me = RN.myOp();
    const mine = me ? me.tags.find((t) => t.t.toLowerCase() === r.name.toLowerCase()) : null;
    const gap = r.demand >= 50 && r.ver < 2;
    const vShow = r.verOps.slice(0, 4);
    let opAct = '';
    if (me) {
      opAct = mine
        ? (mine.tier === 'claimed' ? `<button type="button" class="act" data-act="go" data-to="studio.credibility">${icon('seal')}Ask a client to verify</button>` : '')
        : `<button type="button" class="act" data-act="rs-add-tag" data-tag="${esc(r.name)}">${icon('plus')}Add to my profile</button>`;
    }
    return `<article class="rs-tag" id="rs-tag-${esc(RN.slug(r.name))}">
      <div class="rs-tag-main">
        <h3 class="rs-tag-name">${esc(r.name)}${mine ? `<span class="pill ${mine.tier === 'claimed' ? 'pill-line' : 'pill-good'} rs-tag-mine">${mine.tier === 'claimed' ? 'On your profile' : 'Yours, verified'}</span>` : ''}</h3>
        ${r.def ? `<p class="rs-tag-def">${esc(r.def)}</p>` : ''}
        <div class="rs-tag-meta">
          <span class="rs-tag-cat">${RN.ui.catDot(r.cat)}${esc(F.catLabel(r.cat))}${r.g ? ` · ${esc(r.g)}` : ''}</span>
          ${r.area ? `<button type="button" class="pill pill-accent rs-chip-b" data-act="rs-lib-open" data-area="${esc(r.area)}" title="Show focus areas in ${esc(r.area)}">${esc(r.area)}</button>` : ''}
          <button type="button" class="pill pill-line rs-chip-b" data-act="rs-fw-open" data-area="${esc(r.area)}" data-stage="${esc(r.stage)}" title="Open this cell in the GTM Framework">${icon('grid')}${esc(r.stage)}</button>
        </div>
      </div>
      <div class="rs-tag-stats">
        <div class="rs-tag-n">${r.any ? `<span><b class="num">${r.any}</b> ${r.any === 1 ? 'operator' : 'operators'}</span><span class="${r.ver ? 'accent' : 'muted'}">${r.ver ? icon('check-circle') : ''}<b class="num">${r.ver}</b> client-verified</span>` : '<span class="muted">No operators yet</span>'}</div>
        ${vShow.length ? `<div class="rs-tag-vops">${vShow.map((op) => `<a href="#op.${esc(op.slug)}" title="${esc(op.name)}, verified">${RN.ui.avatar(op, 'ava-xs')}</a>`).join('')}<span class="tiny muted">verified by clients</span></div>` : ''}
        ${r.demand ? `<div class="rs-tag-d">${icon('trend-up')}<span><b class="tnum">${RN.fmt.int(r.demand)}</b> client searches / mo</span>${gap ? '<span class="pill pill-warn">Proof is thin</span>' : ''}</div>` : ''}
      </div>
      <div class="rs-tag-acts">
        <button type="button" class="btn btn-line btn-sm" data-act="rs-browse" data-src="library" data-f="{}" data-tags="${jsonAttr([r.name])}" data-q="">Find operators${icon('arrow')}</button>
        ${opAct}
      </div>
    </article>`;
  }

  function groupOrder(cat) {
    const lab = F.catLabel(cat);
    return (RN.data.roleGroups && RN.data.roleGroups[lab]) || [];
  }
  function libResults() {
    const ix = netIndex();
    const dm = demandMap();
    const all = libRows(ix, dm);
    const rows = libSort(libFilter(all));
    const filtered = lib.q || lib.cat || lib.area || lib.stage;
    const cats = F.roleCategory.options.map((o) => o.v);
    let html = '';
    if (!rows.length) {
      html = RN.ui.empty({ icon: 'search', title: `No focus areas match “${lib.q}”`, body: 'Try a broader word, or clear the filters. Operators can add a new tag from their profile and the team reviews it for the library.', cta: `<button type="button" class="btn btn-line btn-sm" data-act="rs-lib-clear">Clear search and filters</button>` });
    } else if (!filtered) {
      // Overview: each role category with its most used focus areas
      html = cats.map((c) => {
        const cr = rows.filter((r) => r.cat === c);
        if (!cr.length) return '';
        const ver = cr.reduce((a, r) => a + r.ver, 0);
        return `<section class="rs-lib-cat">
          <div class="rs-lib-cat-hd">
            <h2 class="h3">${RN.ui.catDot(c)}${esc(F.catLabel(c))}</h2>
            <span class="small muted">${plural(cr.length, 'focus area')} · ${ver} client-verified</span>
            <button type="button" class="act" data-act="rs-lib-cat-set" data-cat="${esc(c)}">See all ${cr.length}${icon('arrow')}</button>
          </div>
          <div class="rs-tags card">${cr.slice(0, 4).map(tagRow).join('')}</div>
        </section>`;
      }).join('');
    } else if (lib.cat && !lib.q && lib.sort !== 'az' && lib.sort !== 'demand') {
      // One category: grouped by its taxonomy groups in the published order
      const order = groupOrder(lib.cat);
      const groups = {};
      rows.forEach((r) => { (groups[r.g] = groups[r.g] || []).push(r); });
      const keys = Object.keys(groups).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b))));
      html = keys.map((g) => `<section class="rs-lib-grp">
        <div class="rs-lib-grp-hd"><h2 class="h4">${esc(g || `More ${F.catLabel(lib.cat)} focus areas`)}</h2><span class="tiny muted">${groups[g].length}</span></div>
        <div class="rs-tags card">${groups[g].map(tagRow).join('')}</div></section>`).join('');
    } else {
      // Search or a sort across categories: one ranked list, capped for speed with a way to see the rest
      const cap = lib.showAll ? rows.length : 60;
      html = `<div class="rs-tags card">${rows.slice(0, cap).map(tagRow).join('')}</div>
        ${rows.length > cap ? `<div class="rs-more"><button type="button" class="btn btn-line" data-act="rs-lib-more">Show all ${rows.length}</button></div>` : ''}`;
    }
    const count = filtered ? `${plural(rows.length, 'focus area')}${lib.cat ? ` in ${F.catLabel(lib.cat)}` : ''}${lib.q ? ` matching “${lib.q}”` : ''}` : `${plural(all.length, 'focus area')} in ${cats.length} role categories`;
    return { html, count };
  }
  function paintLib() {
    const box = RN.$('#rs-lib-results');
    if (!box) return;
    const r = libResults();
    box.innerHTML = r.html;
    const c = RN.$('#rs-lib-count');
    if (c) c.textContent = r.count;
    const act = RN.$('#rs-lib-active');
    if (act) act.innerHTML = activeChips();
  }
  function activeChips() {
    const chips = [];
    if (lib.area) chips.push(`<button type="button" class="chip chip-sm on" data-act="rs-lib-unset" data-k="area">Area: ${esc(lib.area)}<span class="x">${icon('x')}</span></button>`);
    if (lib.stage) chips.push(`<button type="button" class="chip chip-sm on" data-act="rs-lib-unset" data-k="stage">Stage: ${esc(lib.stage)}<span class="x">${icon('x')}</span></button>`);
    if (lib.q || lib.cat || lib.area || lib.stage) chips.push(`<button type="button" class="act" data-act="rs-lib-clear">Clear all</button>`);
    return chips.join('');
  }
  RN.inputs['rs-lib-q'] = (el) => { lib.q = el.value; lib.showAll = false; paintLib(); };
  RN.inputs['rs-lib-cat'] = (el) => { lib.cat = el.value || ''; lib.showAll = false; paintLib(); };
  RN.actions['rs-lib-sort'] = (el) => {
    lib.sort = el.dataset.v;
    RN.$$('[data-act="rs-lib-sort"]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === lib.sort));
    paintLib();
  };
  RN.actions['rs-lib-more'] = () => { lib.showAll = true; paintLib(); };
  RN.actions['rs-lib-unset'] = (el) => { lib[el.dataset.k] = ''; paintLib(); };
  RN.actions['rs-lib-cat-set'] = (el) => {
    lib.cat = el.dataset.cat;
    RN.rerender();
    const t = RN.$('#rs-lib-browser');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  RN.actions['rs-lib-clear'] = () => { Object.assign(lib, { q: '', cat: '', area: '', stage: '', showAll: false }); RN.rerender(); };
  // Open the library with a search or an area/stage filter (from framework panels, tag chips, guides)
  RN.actions['rs-lib-open'] = (el) => {
    Object.assign(lib, { q: el.dataset.q || '', cat: '', area: el.dataset.area || '', stage: el.dataset.stage || '', showAll: false });
    while (RN.ui.modalEl()) RN.ui.closeModal();
    if (RN.currentRoute() && RN.currentRoute().view.name === 'library') { RN.rerender(); }
    else RN.go('library');
    setTimeout(() => { const t = RN.$('#rs-lib-browser'); if (t) t.scrollIntoView({ block: 'start' }); }, 60);
  };

  RN.actions['rs-add-tag'] = (el) => {
    const me = RN.myOp();
    if (!me) { RN.actions.login(); return; }
    const t = el.dataset.tag;
    if (me.tags.some((x) => x.t.toLowerCase() === t.toLowerCase())) { RN.ui.toast(`“${esc(t)}” is already on your profile`, { icon: 'info' }); return; }
    const max = F.fitTags.max || 25;
    const claimed = me.tags.filter((x) => x.tier === 'claimed').length;
    // Cap applies to self-claimed tags only (Fit Tags System spec); verified tags never count against it
    if (claimed >= max) { RN.ui.toast(`Your profile holds ${max} self-claimed tags. Remove one in Studio to add another.`, { icon: 'info', action: { label: 'Open Studio', act: 'go', attrs: 'data-to="studio.profile"' } }); return; }
    RN.store.update((s) => { const e = (s.edits[me.id] = s.edits[me.id] || {}); e.addTags = (e.addTags || []).filter((x) => x.toLowerCase() !== t.toLowerCase()).concat(t); }, 'edits');
    RN.model.applyEdits();
    RN.ui.toast(`Added “${esc(t)}” to your profile as self-claimed. A client review verifies it.`, { ms: 4200, action: { label: 'Ask a client', act: 'go', attrs: 'data-to="studio.credibility"' } });
    RN.rerender();
  };

  function curveCard() {
    const rows = [];
    for (let r = 0; r <= 10; r++) rows.push({ label: r === 10 ? '10+' : String(r), value: RN.model.tagScore(r), hi: r === 1 || r === 5 });
    return `<div class="card rs-curve">
      <div class="card-hd"><div><h3>How a focus area gets verified</h3><p class="sub">Score of one focus area by the number of client reviews that confirm it</p></div></div>
      ${chartSlot('curve', (w) => RN.chart.columns(rows, { w, h: 196, fmt: (n) => String(n), label: 'Focus area score by client reviews' }))}
      <p class="tiny muted rs-curve-x">Client reviews rated 4.0 or higher that confirm the focus area</p>
      <ol class="rs-steps">
        <li><b>0 reviews: self-claimed.</b> The operator added it. It shows with a dashed outline and counts only a little in search.</li>
        <li><b>1 review: verified at 50.</b> A client confirmed it in a CORE review. Each further review adds points: 60, 70, 80.</li>
        <li><b>5+ reviews: Expert.</b> 85 at five reviews, rising to 100 at ten.</li>
      </ol>
      <p class="small rs-curve-rule">${icon('shield')}Only reviews rated 4.0 or higher verify a focus area. Nobody can buy, request or edit a verification.</p>
    </div>`;
  }
  function gapCard(ix) {
    let tags = [];
    try { tags = RN.model.market().tags; } catch (e) { tags = []; }
    const me = RN.myOp();
    const rows = tags.filter((t) => t.verified <= 1).sort((a, b) => b.demand - a.demand).slice(0, 6);
    return `<div class="card rs-gaps">
      <div class="card-hd"><div><h3>Where clients search and proof is thin</h3><p class="sub">Monthly client searches vs operators with client-verified proof</p></div>${illus('Illustrative')}</div>
      <div class="rs-gap-list">
        ${rows.map((t) => {
          const mine = me && me.tags.find((x) => x.t.toLowerCase() === t.t.toLowerCase());
          const act = me
            ? (mine ? (mine.tier === 'claimed' ? `<button type="button" class="act" data-act="go" data-to="studio.credibility">${icon('seal')}Verify</button>` : `<span class="pill pill-good">${icon('check-circle')}Yours</span>`) : `<button type="button" class="act" data-act="rs-add-tag" data-tag="${esc(t.t)}">${icon('plus')}Add</button>`)
            : `<button type="button" class="act" data-act="rs-browse" data-src="library_gap" data-f="{}" data-tags="${jsonAttr([t.t])}" data-q="">Find</button>`;
          return `<div class="rs-gap">
            <div class="rs-gap-main"><button type="button" class="rs-gap-name" data-act="rs-lib-open" data-q="${esc(t.t)}">${esc(t.t)}</button>
              <span class="tiny muted tnum">${RN.fmt.int(t.demand)} searches · ${t.supply} claim · <b class="${t.verified ? 'accent' : ''}">${t.verified} verified</b></span></div>
            ${act}
          </div>`;
        }).join('')}
      </div>
      <p class="tiny muted" style="margin-top:14px">${me ? 'Do this work? Add the tag, then ask a past client to confirm it in a review.' : 'Clients: these are the focus areas where a verified operator is hardest to find. Talk to us and we will source one.'}</p>
    </div>`;
  }

  function renderLibrary() {
    chartFns = {};
    const ix = netIndex();
    const libN = F.fitTags.options.length;
    const groupsN = new Set(F.fitTags.options.map((o) => o.c + '|' + o.g).filter((k) => !/\|$/.test(k))).size;
    const claims = Object.values(ix.tags).reduce((a, t) => a + t.any.length, 0);
    const verified = Object.values(ix.tags).reduce((a, t) => a + t.ver.length, 0);
    const r = libResults();
    const sortBtn = (v, l) => `<button type="button" data-act="rs-lib-sort" data-v="${v}" aria-pressed="${lib.sort === v}">${l}</button>`;
    const sample = F.fitTags.options.filter((o) => R.def(o.v)).slice(0, 3);
    const schema = {
      '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Revenue Nomad Fit Tag Library', url: 'https://revenuenomad.com/library',
      description: 'The public taxonomy of fractional go-to-market work: focus areas with definitions, the GTM Framework area and stage, and verification counts.',
      hasDefinedTerm: sample.map((o) => ({ '@type': 'DefinedTerm', name: o.l, description: R.def(o.v), inDefinedTermSet: 'https://revenuenomad.com/library', url: 'https://revenuenomad.com/library/' + RN.slug(o.l) })),
    };
    return `<div class="rs rs-lib">
    <header class="wrap phead rs-head">
      ${crumbs([{ l: 'Fit Tag Library' }])}
      <span class="eyebrow">Fit Tag Library</span>
      <h1 class="h1">The shared vocabulary of <span class="serif">fractional GTM work.</span></h1>
      <p class="lede">Operators add fit tags to say what they do. Clients see them as focus areas and filter by them. A client review turns a claim into proof. One list, used on every profile, brief and review.</p>
      <div class="stats-row rs-kpis" style="--cols:4">
        <div class="stat"><span class="stat-v">${RN.fmt.int(libN)}</span><span class="stat-l">Focus areas, ${groupsN} groups</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(claims)}</span><span class="stat-l">Fit tags on operator profiles</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(verified)}</span><span class="stat-l">Confirmed by a client review</span></div>
        <div class="stat"><span class="stat-v">${Object.values(ix.tags).filter((t) => t.any.length).length}</span><span class="stat-l">In use on live profiles</span></div>
      </div>
    </header>

    <section class="wrap rs-sec-sm">
      <div class="grid g-2 rs-lib-top">${curveCard()}${gapCard(ix)}</div>
    </section>

    <section class="wrap rs-sec-sm" id="rs-lib-browser" aria-labelledby="rs-lib-t">
      <h2 class="sr-only" id="rs-lib-t">Browse the library</h2>
      <div class="rs-lib-bar">
        <div class="input-wrap rs-lib-search">${icon('search')}<input class="input" type="search" value="${esc(lib.q)}" placeholder="Search ${libN} focus areas" aria-label="Search focus areas" data-input="rs-lib-q" autocomplete="off"></div>
        <div class="rs-lib-cats" data-deselect><span class="label">${esc(F.roleCategory.label)}</span>${RN.w.control('roleCategory', lib.cat, { name: 'rsLibCat', id: 'rs-lib-cat', change: 'rs-lib-cat' })}</div>
        <div class="rs-lib-meta">
          <span class="small" id="rs-lib-count" aria-live="polite">${esc(r.count)}</span>
          <div class="row" style="--gap:10px"><span id="rs-lib-active" class="row" style="--gap:8px">${activeChips()}</span>
          <div class="seg" role="group" aria-label="Sort">${sortBtn('used', 'Most proven')}${sortBtn('demand', 'Most searched')}${sortBtn('az', 'A–Z')}</div></div>
        </div>
      </div>
      <div id="rs-lib-results" class="rs-lib-results">${r.html}</div>
    </section>

    <section class="wrap rs-sec-sm">
      <div class="rs-lib-foot">
        <p class="small muted">Definitions come from the live library and from Revenue Nomad Research. Tap a stage chip to open that cell in the <a href="#framework">GTM Framework</a>. Demand counts are illustrative.</p>
        ${schemaBlock('rs-lib-schema', schema, 'For the dev team: DefinedTermSet markup, one DefinedTerm per focus area (first three shown)')}
      </div>
    </section>
    </div>`;
  }

  /* =====================================================================
     Guides
     ===================================================================== */
  const hoursNum = (code) => (String(code) === '19' ? 15 : +code || 0);
  const mult = (rev) => (rev && RIX().byRevenue[rev]) || 1;
  const r500 = (n) => Math.round(n / 500) * 500;
  const usd = (n) => RN.fmt.usd(n);
  const hr = (n) => '$' + Math.round(n);
  // Same formula and rounding as the Rate Index estimator (insights.js) so numbers agree across surfaces
  function monthRange(cat, hours, rev) {
    const b = RIX().byCat[cat] || RIX().byCat.sales_leadership;
    const h = hoursNum(hours), m = mult(rev);
    return `${usd(r500(b.p25 * m * h))} - ${usd(r500(b.p75 * m * h))}/mo`;
  }
  const HOURS = { h_under_20: '19', h_20: '20', h_40: '40', h_60: '60', h_80: '80', h_100: '100', h_160: '160' };
  const hoursRows = () => REP().hours.map((r) => ({ code: HOURS[r.h] || r.h, v: r.v }));
  const sumStat = (re, dflt) => { const x = (REP().summary || []).find((s) => re.test(s.l)); return x ? x.v : dflt; };
  const trig = (re) => { const x = (REP().triggers || []).find((t) => re.test(t.l)); return x ? x.v : 0; };
  const yoy = () => { const x = (REP().summary || []).find((s) => /year over year/i.test(s.l)); const m = x && x.l.match(/up (\d+%)/i); return m ? '+' + m[1] : '+9%'; };
  const latestMedian = () => { const t = RIX().trend || []; return t.length ? t[t.length - 1].v : 240; };
  // Tables with 3+ columns stack into labelled rows on phones (data-l carries the column label)
  const tbl = (head, rows, cls) => `<div class="tbl-wrap rs-tbl ${head.length > 2 ? 'rs-tbl-stack' : ''}"><table class="tbl ${cls || ''}"><thead><tr>${head.map((x, i) => `<th class="${i ? 'r' : ''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}" data-l="${esc(head[i] || '')}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const src = (t) => `<p class="rs-src">${icon('info')}<span>${t}</span></p>`;
  // Every chart hands its cut to Browse (SPEC loop 10)
  const chartGo = (label, o) => `<p class="rs-chart-go">${browseBtn(label, o, 'act')}</p>`;
  const L = (to, t) => `<a href="#${esc(to)}">${esc(t)}</a>`;

  const GROUPS = [
    { k: 'clients', l: 'For clients', d: 'Hiring a fractional go-to-market leader: cost, scope, timing and how to judge proof.' },
    { k: 'operators', l: 'For operators', d: 'Pricing your work and winning clients, with or without a marketplace intro.' },
    { k: 'methods', l: 'About our methods', d: 'How Revenue Nomad measures reputation and collects client reviews.' },
  ];

  const GUIDES = [
    {
      slug: 'fractional-vp-of-sales-cost', bp: 'vp-sales', group: 'clients', updated: '2026-09-18', mins: 6, cat: 'sales_leadership', opsQ: 'VP of Sales',
      q: 'How much does a fractional VP of Sales cost?',
      answer: () => { const b = RIX().byCat.sales_leadership; return [`A fractional VP of Sales costs a median of ${hr(b.p50)} an hour on the Revenue Nomad Rate Index, and the middle half of operators charge between ${hr(b.p25)} and ${hr(b.p75)}.`, `At 40 hours a month, the most common engagement size, that is a typical range of ${monthRange('sales_leadership', '40', '5m_20m')} for a company with $5M–$20M in revenue.`]; },
      stats: () => { const b = RIX().byCat.sales_leadership; return [{ v: hr(b.p50) + '/hr', l: 'Median rate, Sales Leadership' }, { v: monthRange('sales_leadership', '40', '5m_20m').replace('/mo', ''), l: 'Typical month at 40 hrs' }, { v: plural(b.n, 'rate'), l: 'In the index for this role' }]; },
      sections: () => {
        const b = RIX().byCat.sales_leadership;
        const revRows = F.companyRevenue.options.filter((o) => RIX().byRevenue[o.v]).map((o) => ({ label: o.l, value: Math.round(b.p50 * mult(o.v)), hi: o.v === '5m_20m' }));
        const hrs = ['20', '40', '60', '80'];
        const ff = REP().fracVsFull || [];
        return [
          { id: 'drivers', h: 'What sets the price', html: `<p>Four things move the number: how many hours a month you buy, the size of your company, the scope of the seat and how much proof the operator has. Hours matter most. Most engagements on the network run between 20 and 59 hours a month (${hoursRows().filter((r) => r.code === '20' || r.code === '40').reduce((a, r) => a + r.v, 0)}% of engagements in our survey).</p>
            <p>Company size shifts the hourly rate. Operators serving larger companies charge more because the work carries more risk: bigger teams, longer cycles and a board that expects a forecast.</p>
            ${chartSlot('g1-rev', (w) => bars(revRows, { fmt: (n) => '$' + n + '/hr', label: 'Median hourly rate for Sales Leadership by company revenue' }, w))}
            ${src(`Median hourly rate for Sales Leadership by company revenue range. Rate Index, ${esc((RIX().trend || []).slice(-1)[0] ? RIX().trend.slice(-1)[0].l : 'Q3 26')}. Illustrative.`)}
            ${chartGo('Browse Sales Leadership operators who work with $5M–$20M companies', { filters: { roleCategories: ['sales_leadership'], revenueRange: ['5m_20m'] }, src: 'guide_chart_rate_revenue' })}` },
          { id: 'monthly', h: 'What a month costs at each size', html: `<p>Multiply the hourly range by the hours you need. For a $5M–$20M company:</p>
            ${tbl(['Available time', 'Typical Engagement Range'], hrs.map((h) => [esc(RN.w.label('hoursPerMonth', h)), esc(monthRange('sales_leadership', h, '5m_20m'))]))}
            <p>Twenty hours buys a leader who sets the plan, runs the weekly pipeline review and coaches the team. Forty hours adds hands-on work: hiring, building the playbook and joining key deals. Sixty or more usually means the operator is also managing reps day to day.</p>` },
          { id: 'vs-full-time', h: 'How it compares with a full-time hire', html: `<p>A full-time VP of Sales costs more than twice as much per month once base, commission, benefits and equity are counted, and takes three to four months to hire.</p>
            ${ff.length ? tbl(['Option', 'Monthly cost', 'Time to start'], ff.map((r) => [esc(r[0]), esc(r[1]), esc(r[2])])) : ''}
            <p>The trade is time. A fractional leader gives you part of a week from an operator who has built the same seat before. Read ${L('guide.fractional-vs-full-time-vp-of-sales', 'Fractional vs full-time VP of Sales')} for when each makes sense.</p>` },
          { id: 'spend-less', h: 'How to get more for the same budget', html: `<ul>
            <li><b>Scope one outcome.</b> "Two reps hired and ramping, a written sales process and a forecast the board trusts" is easier to price than "own sales".</li>
            <li><b>Start at 20 to 40 hours</b> for the first 90 days, then adjust. Scaling hours up is easier than paying for hours you do not use.</li>
            <li><b>Pay for proof.</b> Operators with client-verified focus areas in the work you need cost about the same per hour and waste fewer of them.</li>
            <li><b>Start from a Blueprint.</b> An ${L('blueprints', 'Engagement Blueprint')} gives you the hours, term and a 30/60/90-day plan before you talk to anyone.</li></ul>` },
        ];
      },
      faq: () => { const b = RIX().byCat.sales_leadership; return [
        { q: 'Is a fractional CRO more expensive than a fractional VP of Sales?', a: `Usually, by 10% to 20% an hour, because a CRO also owns marketing and customer success. Both roles sit in the Sales Leadership category of the Rate Index, where the median is ${hr(b.p50)} an hour.` },
        { q: 'Is there a minimum commitment?', a: 'Most operators ask for an initial term of three months, since the first month is spent learning the business. After that, 30 days notice is common.' },
        { q: 'Do fractional sales leaders take commission or equity?', a: 'Some do, on top of a lower base rate. On Revenue Nomad rates are listed per hour; any variable pay is agreed between you and the operator.' },
        { q: 'Can I see an operator\'s rate before I contact them?', a: 'Yes. Signed-in clients see each operator\'s hourly rate on their profile and can filter search by rate.' },
      ]; },
      cta: { label: 'Browse Sales Leadership', filters: { roleCategories: ['sales_leadership'] } },
    },
    {
      slug: 'fractional-vs-full-time-vp-of-sales', bp: 'vp-sales', group: 'clients', updated: '2026-09-12', mins: 7, cat: 'sales_leadership', opsQ: 'sales team hiring',
      q: 'Fractional vs full-time VP of Sales: which should your first sales leader be?',
      answer: () => [`Hire fractional first when you still need someone to build the sales motion, and hire full-time once there is a proven process and a team to run every day.`, `In our survey, ${sumStat(/first sales leadership hire/i, '31%')} of first-time clients made a fractional leader their first sales leadership hire, and ${(REP().outcomes || []).find((o) => /full time/i.test(o.l)) ? REP().outcomes.find((o) => /full time/i.test(o.l)).v : '22%'} of fractional engagements later converted to a full-time role.`],
      stats: () => [{ v: sumStat(/first sales leadership hire/i, '31%'), l: 'Chose fractional for their first sales leader' }, { v: (REP().outcomes || [])[1] ? REP().outcomes[1].v : '22%', l: 'Of engagements converted to full time' }, { v: sumStat(/pipeline change/i, '67 days'), l: 'Median time to a measurable pipeline change' }],
      sections: () => {
        const ff = REP().fracVsFull || [];
        return [
          { id: 'cost', h: 'The cost difference', html: `${ff.length ? tbl(['Option', 'Monthly cost', 'Time to start', 'Cost to exit'], ff.map((r) => r.map(esc))) : ''}
            <p>The full-time number includes base, on-target commission, benefits and equity. The exit column matters as much as the monthly cost: a mis-hired full-time leader typically costs severance plus four to six months of lost pipeline.</p>` },
          { id: 'fractional-first', h: 'When fractional is the better first hire', html: `<ul>
            <li>The founder still closes most deals and there is no written process yet.</li>
            <li>You have fewer than five reps, so a full-time leader would spend most of the week selling.</li>
            <li>You need someone within weeks. Fractional leaders on the network start in two to three weeks.</li>
            <li>You are not sure yet what kind of leader the company needs next. A fractional engagement answers that question with data.</li></ul>` },
          { id: 'full-time', h: 'When to hire full-time', html: `<ul>
            <li>There is a repeatable process that new reps ramp on without the founder.</li>
            <li>The team is large enough (usually eight or more quota carriers) to need daily management.</li>
            <li>The board wants a named executive who will be there for several years.</li></ul>
            <p>Many companies do both in sequence: a fractional leader builds the playbook, hires the first reps, then helps interview the full-time leader who inherits a working machine.</p>` },
          { id: 'risks', h: 'Risks on each side', html: `<p>With a full-time hire, the risk is the wrong person for your stage. With fractional, the risk is attention: the operator has other clients. In our survey, clients rated communication cadence as a hiring factor far more in hindsight than at the time of hiring.</p>
            ${(REP().hindsight || []).length ? tbl(['What clients weighed', 'At hire', 'In hindsight'], REP().hindsight.map((r) => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`])) : ''}
            <p>Ask how the operator reports progress, how many clients they carry and which hours are yours. ${L('guide.evaluate-fractional-operator-track-record', 'How to evaluate a fractional operator')} covers the rest.</p>` },
        ];
      },
      faq: () => [
        { q: 'Can a fractional VP of Sales manage my reps day to day?', a: 'At 40 hours a month or more, yes: they run one-on-ones, the weekly pipeline review and deal coaching. Below that, they coach a player-coach or the founder who manages the reps.' },
        { q: 'Can the fractional leader become our full-time VP of Sales?', a: `Sometimes. ${(REP().outcomes || [])[1] ? REP().outcomes[1].v : '22%'} of engagements in our survey converted to a full-time hire. Agree up front whether that is on the table.` },
        { q: 'How long should the first fractional engagement run?', a: 'Six to twelve months is common for a first sales leader. The median engagement lasts 6.4 months and about half are extended.' },
      ],
      cta: { label: 'Browse Sales Leadership', filters: { roleCategories: ['sales_leadership'] } },
    },
    {
      slug: 'how-to-scope-a-fractional-sales-engagement', bp: 'vp-sales', group: 'clients', updated: '2026-09-05', mins: 6, cat: 'sales_leadership', opsQ: 'sales playbook',
      q: 'How do you scope a fractional sales engagement?',
      answer: () => ['Scope a fractional sales engagement around one measurable outcome, a fixed number of hours a month and an initial term, usually three to six months.', 'Before day one, write down the 90-day deliverables, who the operator reports to and how progress is reviewed.'],
      stats: () => { const hrsTop = hoursRows().slice().sort((a, b) => b.v - a.v)[0]; const term = REP().term || []; const tTop = term.slice().sort((a, b) => b.v - a.v)[0]; return [{ v: RN.w.label('hoursPerMonth', hrsTop.code), l: `Most common size (${hrsTop.v}% of engagements)` }, { v: tTop ? tTop.l : '3 to 6 mo', l: `Most common initial term (${tTop ? tTop.v : 38}%)` }, { v: sumStat(/Median engagement length/i, '6.4 mo'), l: 'Median engagement length' }]; },
      sections: () => {
        const hRows = hoursRows().map((r) => ({ label: RN.w.label('hoursPerMonth', r.code), value: r.v, hi: r.code === '40' }));
        const term = REP().term || [];
        return [
          { id: 'outcome', h: 'Start with the outcome', html: `<p>A title is not a scope. Write the result you want in 90 days in a sentence a board member would understand, for example: "A written sales process, two reps hired and ramping, and a forecast within 10% of actuals."</p>
            <p>Then pick the one number you will review every month. Pipeline created, win rate, ramp time and forecast accuracy all work. Revenue alone does not, because it lags the work by a quarter or more.</p>` },
          { id: 'type', h: 'Pick the engagement type', html: `<p>Revenue Nomad uses four engagement types on every profile and project:</p>
            <dl class="rs-dl">${F.engagementTypes.options.map((o) => `<div><dt>${esc(o.l)}</dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>` },
          { id: 'hours', h: 'Choose hours and term', html: `<p>Most engagements run 20 to 59 hours a month. Buy fewer hours than you think for the first 90 days: the operator spends the first weeks learning, and adding hours later is easy.</p>
            ${chartSlot('g3-hours', (w) => bars(hRows, { fmt: (n) => n + '%', label: 'Share of engagements by available time' }, w))}
            ${src('Share of fractional GTM engagements by hours a month, State of Fractional GTM 2027 survey. Illustrative.')}
            ${chartGo(`Browse operators with ${RN.w.label('hoursPerMonth', '40')} or more available`, { filters: { hoursPerMonth: ['40'] }, src: 'guide_chart_hours' })}
            ${term.length ? `<p>For the initial term, ${term.map((t, i) => `${esc(F.term.options[i] ? F.term.options[i].l : t.l)} (${t.v}%)`).join(', ')}. Three to six months is long enough to ship a playbook and see it work.</p>` : ''}` },
          { id: 'plan', h: 'Write the 30/60/90-day plan', html: `<ol>
            <li><b>Days 1 to 30: learn and diagnose.</b> Sit in on calls, read the CRM, interview the team and five customers. Deliver a written diagnosis and a plan.</li>
            <li><b>Days 31 to 60: build.</b> Stage definitions, discovery guide, pipeline review cadence, hiring plan and job descriptions.</li>
            <li><b>Days 61 to 90: run and hand over.</b> The team runs the new process with the operator coaching. Agree what happens next: extend, reduce hours or hand over to a hire.</li></ol>
            <p>Every ${L('blueprints', 'Engagement Blueprint')} ships with a plan like this, the focus areas it needs and a typical rate range.</p>` },
          { id: 'rhythm', h: 'Set the operating rhythm', html: `<ul>
            <li>A weekly 30-minute check-in with the person the operator reports to.</li>
            <li>A monthly review of the one number, with what changed and why.</li>
            <li>Clear hours: which days, which meetings, how fast they reply between them.</li>
            <li>Access on day one: CRM, call recordings, the team's calendar and the last two board decks.</li></ul>` },
        ];
      },
      faq: () => [
        { q: 'How many hours a month should I buy?', a: 'For a first sales leader, 40 hours a month is the most common starting point. Advisory work runs under 20; interim cover is closer to 160.' },
        { q: 'Should I pay hourly or a monthly retainer?', a: 'Most operators price per hour and bill a fixed monthly retainer for an agreed block of hours. Scoped projects are priced per project.' },
        { q: 'What if the scope changes halfway through?', a: 'Review scope at day 30 and day 60. Changing hours or outcomes at those points is normal and cheaper than pushing through the wrong plan.' },
        { q: 'Can I post the scope and get matched?', a: 'Yes. Post a project from a Blueprint and Revenue Nomad ranks operators against it using the same fields as their profiles.' },
      ],
      cta: { label: 'Post a project', to: 'project.new' },
    },
    {
      slug: 'fractional-revops-first-90-days', bp: 'vp-revops', group: 'clients', updated: '2026-08-29', mins: 6, cat: 'revenue_operations', opsQ: 'RevOps',
      q: 'What does a fractional RevOps leader do in the first 90 days?',
      answer: () => ['In the first 30 days a fractional RevOps leader audits the CRM, tech stack and reporting, and agrees one source of truth for pipeline.', 'By day 90 they have fixed the data model, rebuilt stages and routing, and shipped the dashboards leadership uses to run the business.'],
      stats: () => { const b = RIX().byCat.revenue_operations; return [{ v: hr(b.p50) + '/hr', l: 'Median rate, Revenue Operations' }, { v: monthRange('revenue_operations', '40', '5m_20m').replace('/mo', ''), l: 'Typical month at 40 hrs' }, { v: String((REP().intent || []).find((x) => x.cat === 'revenue_operations') ? REP().intent.find((x) => x.cat === 'revenue_operations').v + '%' : '22%'), l: 'Of companies plan to hire RevOps in 12 months' }]; },
      sections: () => [
        { id: 'audit', h: 'Days 1 to 30: audit', html: `<p>The first month is diagnosis. Expect a written audit that covers:</p><ul>
          <li><b>The CRM.</b> Duplicates, stale records, fields nobody uses, stages that mean different things to different reps. See ${L('library', 'CRM cleanup')} in the library.</li>
          <li><b>The tech stack.</b> Every tool, what it costs, who uses it and what overlaps (a ${esc('GTM Tech Stack Audit')}).</li>
          <li><b>Reporting.</b> Which numbers leadership looks at, where they come from and which ones disagree.</li></ul>
          <p>The deliverable is one agreed definition for pipeline, bookings and forecast, and a prioritized fix list.</p>` },
        { id: 'rebuild', h: 'Days 31 to 60: rebuild', html: `<ul>
          <li>Stage definitions with entry and exit criteria, enforced in the CRM.</li>
          <li>Lead routing and assignment rules so no inbound lead waits more than a day.</li>
          <li>Data cleanup: merge duplicates, archive dead records, fix required fields.</li>
          <li>Fixing or replacing the one integration that breaks most often.</li></ul>` },
        { id: 'operate', h: 'Days 61 to 90: operate and hand over', html: `<ul>
          <li>Dashboards for pipeline, conversion by stage and forecast, used in the weekly meeting.</li>
          <li>A forecast cadence that the sales leader runs, with RevOps preparing the data.</li>
          <li>Documentation: a metrics dictionary and a short admin guide, so the next hire can take over.</li></ul>` },
        { id: 'cost', h: 'What it costs', html: `<p>Revenue Operations has a median of ${hr(RIX().byCat.revenue_operations.p50)} an hour on the Rate Index. At 40 hours a month for a $5M–$20M company, a typical range is ${monthRange('revenue_operations', '40', '5m_20m')}. Many RevOps engagements drop to 20 hours after the rebuild, at ${monthRange('revenue_operations', '20', '5m_20m')}.</p>` },
        { id: 'signs', h: 'Signs you need RevOps now', html: `<ul><li>Two leaders quote different pipeline numbers in the same meeting.</li><li>Reps keep their own spreadsheets because they do not trust the CRM.</li><li>You are about to hire a sales leader and want them to inherit clean data.</li><li>Tool spend keeps growing and nobody can say what each tool does.</li></ul>` },
      ],
      faq: () => [
        { q: 'Does it matter if the operator knows HubSpot or Salesforce?', a: 'Yes. Rebuilds go faster with someone who has administered your CRM before. Filter by the HubSpot admin or Salesforce Implementation focus areas.' },
        { q: 'Should RevOps come before a VP of Sales?', a: 'If the CRM is a mess, fix it first or at the same time. A new sales leader who cannot trust the data spends the first quarter cleaning it.' },
        { q: 'How many hours does RevOps need?', a: 'Forty hours a month for the first 90 days is typical, then 20 hours for ongoing administration and reporting.' },
      ],
      cta: { label: 'Browse Revenue Operations', filters: { roleCategories: ['revenue_operations'] } },
    },
    {
      slug: 'fractional-cmo-vs-marketing-agency', bp: 'cmo', group: 'clients', updated: '2026-08-22', mins: 5, cat: 'marketing', opsQ: 'CMO',
      q: 'Fractional CMO vs marketing agency: which one do you need?',
      answer: () => ['A fractional CMO owns your marketing strategy, budget and team, and decides what to do; an agency executes defined work such as ads, content or design.', 'If nobody at the company owns marketing yet, start with a fractional CMO who sets the plan, then hire agencies for the execution they choose.'],
      stats: () => { const b = RIX().byCat.marketing; const ag = (REP().fracVsFull || []).find((r) => /agency/i.test(r[0])); return [{ v: hr(b.p50) + '/hr', l: 'Median rate, Marketing' }, { v: monthRange('marketing', '40', '5m_20m').replace('/mo', ''), l: 'Fractional CMO at 40 hrs a month' }, { v: ag ? ag[1] : '$15,000+', l: 'Typical agency retainer a month' }]; },
      sections: () => [
        { id: 'difference', h: 'What each one does', html: tbl(['', 'Fractional CMO', 'Agency'], [
          ['Owns', 'Strategy, budget, positioning, the plan', 'A defined scope of execution'],
          ['Accountable for', 'Pipeline and the marketing number', 'Deliverables and channel metrics'],
          ['Typical cost', esc(monthRange('marketing', '40', '5m_20m')), esc(((REP().fracVsFull || []).find((r) => /agency/i.test(r[0])) || [])[1] || '$15,000+') + '/mo'],
          ['Time to start', '2 to 3 weeks', esc(((REP().fracVsFull || []).find((r) => /agency/i.test(r[0])) || [])[2] || '4 to 6 weeks')],
          ['Best when', 'Nobody owns marketing or the plan is unclear', 'The plan is clear and you need hands'],
        ].map((r) => [`<b>${r[0]}</b>`, r[1], r[2]])) + src('Monthly costs from the Rate Index (Marketing, $5M–$20M company, 40 hrs a month) and the State of Fractional GTM 2027 survey. Illustrative.') },
        { id: 'agency', h: 'When an agency is enough', html: `<ul><li>You already know your ICP, positioning and the channels that work.</li><li>Someone in-house can brief the agency and judge its work.</li><li>You need output fast in one channel: paid search, content production, design.</li></ul>` },
        { id: 'cmo', h: 'When you need a fractional CMO', html: `<ul><li>Marketing activity is busy but pipeline does not move.</li><li>Positioning is unclear, so every campaign says something different.</li><li>You are about to spend on agencies and have nobody to choose or manage them.</li><li>Sales and marketing disagree about what a qualified lead is.</li></ul>` },
        { id: 'both', h: 'Using both', html: `<p>The most common setup on the network is a fractional CMO at 20 to 40 hours a month directing one or two agencies. The CMO writes the brief, sets the targets and reviews the work; the agencies execute. Browse the ${L('library', 'Fit Tag Library')} for focus areas like Demand Generation and Brand Strategy.</p>` },
      ],
      faq: () => [
        { q: 'Can a fractional CMO also do the execution?', a: 'Some do, especially at 40 hours a month or more. Most prefer to direct execution and keep their hours for strategy, positioning and the team.' },
        { q: 'Is a fractional CMO cheaper than an agency?', a: `Often similar per month. The Rate Index median for Marketing is ${hr(RIX().byCat.marketing.p50)} an hour; a 40-hour month for a $5M–$20M company is ${monthRange('marketing', '40', '5m_20m')}.` },
        { q: 'How do I measure a fractional CMO?', a: 'On pipeline sourced or influenced by marketing, cost per qualified opportunity and progress against the 90-day plan.' },
      ],
      cta: { label: 'Browse Marketing', filters: { roleCategories: ['marketing'] } },
    },
    {
      slug: 'evaluate-fractional-operator-track-record', group: 'clients', updated: '2026-09-15', mins: 7, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How do you evaluate a fractional operator\'s track record?',
      answer: () => ['Look for proof that they have done the same work at your stage and deal size, confirmed by the clients they did it for.', 'On Revenue Nomad that proof is client-verified focus areas, CORE review scores, Engagement History and the Reputation Index, all built from client evidence rather than self-description.'],
      stats: () => { const h = (REP().hindsight || [])[0]; return [{ v: h ? h[2] : '81%', l: 'Of clients say stage fit mattered most, in hindsight' }, { v: sumStat(/Rehire rate/i, '2.4x'), l: 'Rehire rate with 3+ verified reviews' }, { v: '4.0+', l: 'Review rating needed to verify a focus area' }]; },
      sections: () => [
        { id: 'hindsight', h: 'What clients wish they had checked', html: `<p>We asked companies what they weighed when they hired a fractional leader, and what they would weigh now.</p>
          ${(REP().hindsight || []).length ? tbl(['Factor', 'Weighed at hire', 'Would weigh now'], REP().hindsight.map((r) => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`])) : ''}
          ${src('State of Fractional GTM 2027 survey of companies that hired a fractional leader in the last 18 months. Illustrative.')}
          <p>Stage and deal-size fit came first by a wide margin. Brand-name employers came last.</p>` },
        { id: 'fit', h: 'Check stage and deal-size fit', html: `<p>Compare the operator's ${esc(F.revenueRange.label.toLowerCase())} and ${esc(F.employeeRange.label.toLowerCase())} with yours, then read their Engagement History for companies like yours. Signed-in clients see Match Signals on every profile, scored against the company profile they filled in once.</p>` },
        { id: 'verified', h: 'Separate verified from self-claimed', html: `<p>Every focus area on a profile is either <b>self-claimed</b> (dashed outline) or <b>client-verified</b> (solid, with a check). A focus area verifies when a client review rated 4.0 or higher confirms it; five or more make it Expert. The ${L('library', 'Fit Tag Library')} shows how many operators hold each one verified.</p>` },
        { id: 'reviews', h: 'Read the reviews the right way', html: `<p>CORE reviews rate four things. Look for the one that matters most for your seat:</p>
          <dl class="rs-dl">${F.coreDims.options.map((o) => `<div><dt>${esc(o.l)}</dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>
          <p>Then read "Would hire again". A yes there is the strongest single signal on a profile. ${L('guide.what-is-core', 'What is CORE?')} explains the questions.</p>` },
        { id: 'questions', h: 'Questions to ask on the first call', html: `<ol>
          <li>Tell me about a company at our stage where this worked. What did you ship in the first 90 days?</li>
          <li>Where did it not work, and what did you change?</li>
          <li>How many clients do you carry, and which hours would be ours?</li>
          <li>How will you report progress, and how often?</li>
          <li>Can I speak with the client from that engagement?</li></ol>` },
      ],
      faq: () => [
        { q: 'What is a good Reputation Index score?', a: 'Every approved profile starts at 50 (Vetted). Scores of 70 and above (Trusted) mean repeat engagements and consistently strong client reviews.' },
        { q: 'Can an operator pay to raise their score or verify a focus area?', a: 'No. Only client reviews, verified engagements and a complete profile move the score, and only reviews rated 4.0 or higher verify a focus area.' },
        { q: 'Should I ask for references if a profile has verified reviews?', a: 'Yes, for the engagement most like yours. Verified reviews tell you the work happened; a call tells you how it would go at your company.' },
      ],
      cta: { label: 'Browse Reputation Index 70+', filters: { risMin: '70' } },
    },
    {
      slug: 'transition-out-of-founder-led-sales', bp: 'vp-sales', group: 'clients', updated: '2026-09-09', mins: 7, cat: 'sales_leadership', opsQ: 'founder-led',
      q: 'How do you transition out of founder-led sales?',
      answer: () => ['Write down how the founder actually wins deals, turn it into a repeatable process, then hand deals over in stages while the founder stays in the room for the largest ones.', `Most companies bring in a fractional sales leader to run this: founders stepping out of sales was the second most common reason clients gave for hiring one, at ${trig(/Founder/i) || 24}%.`],
      stats: () => [{ v: (trig(/Founder/i) || 24) + '%', l: 'Hired fractional to move sales off the founder' }, { v: '6 months', l: 'Typical handover, from shadowing to full ownership' }, { v: String(((RN.model.market().tags || []).find((t) => /founder-led/i.test(t.t)) || { demand: 155 }).demand), l: 'Client searches a month for Founder-Led Sales Exit' }],
      sections: () => {
        const mk = (RN.model.market().tags || []).find((t) => /founder-led/i.test(t.t));
        return [
          { id: 'signs', h: 'Signs it is time', html: `<ul><li>The founder is on every late-stage call and pipeline stalls when they travel.</li><li>You have passed roughly $1M in annual revenue and want to double it.</li><li>Your first reps are struggling to close without the founder.</li><li>The board is asking who owns the number.</li></ul>` },
          { id: 'capture', h: 'Step 1: capture what works', html: `<p>Record the founder's next ten sales calls. Map the questions they ask, the objections they hear and how they price. Look at the last 20 closed-won and closed-lost deals for patterns in company size, trigger and the title of the person who signed. That is your first ICP and discovery guide.</p>` },
          { id: 'playbook', h: 'Step 2: build the playbook', html: `<p>Turn the notes into stages with exit criteria, a discovery guide, a pricing and discount policy, and a short list of case stories. Keep it to a few pages the team will actually use. Focus areas to look for: ${L('library', 'Sales Playbook')}, Sales Process Design, Discovery Framework.</p>` },
          { id: 'handover', h: 'Step 3: hand over deals in stages', html: tbl(['Months', 'Who leads', 'Founder\'s role'], [
            ['1 to 2', 'Founder', 'Runs calls; the rep or sales leader shadows and takes notes'],
            ['3 to 4', 'Rep', 'Joins late-stage calls and the largest deals only'],
            ['5 to 6', 'Rep, with the sales leader coaching', 'Executive sponsor on strategic accounts'],
          ].map((r) => [`<b>${r[0]}</b>`, r[1], r[2]])) + `<p>Measure win rate and sales cycle by who led the deal. When rep-led deals close at a similar rate, the handover is done.</p>` },
          { id: 'who', h: 'Who to hire for it', html: `<p>A fractional VP of Sales who has done this before, usually at 40 hours a month for six months, at a typical ${monthRange('sales_leadership', '40', '1m_5m')} for a $1M–$5M company.</p>
            ${mk ? `<p>Clients search for the Founder-Led Sales Exit focus area about ${RN.fmt.int(mk.demand)} times a month, and only ${mk.verified} ${mk.verified === 1 ? 'operator holds' : 'operators hold'} it client-verified today (${mk.supply} claim it). Ask candidates for the client they did it with.</p>` : ''}` },
        ];
      },
      faq: () => [
        { q: 'Should the first hire be a rep or a sales leader?', a: 'Usually a sales leader first, even part time. Reps hired into a founder-led motion with no process tend to fail, and the founder ends up selling again.' },
        { q: 'How long does the transition take?', a: 'About six months from the first shadowed call to reps closing on their own, longer for enterprise deals with long cycles.' },
        { q: 'Does the founder stop selling completely?', a: 'Rarely. Most founders stay involved in the largest deals and key renewals as an executive sponsor.' },
      ],
      cta: { label: 'Find founder-led sales experts', tags: ['Founder-Led Sales Exit'] },
    },
    {
      slug: 'how-much-should-a-fractional-operator-charge', group: 'operators', updated: '2026-09-20', mins: 6, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How much should a fractional operator charge?',
      answer: () => { const c = RIX().byCat; return [`Price from the Rate Index for your role category and the revenue range of the clients you serve, then adjust for your verified proof and the scope of the seat.`, `The median across fractional GTM leaders is ${hr(latestMedian())} an hour, from ${hr(c.sellers.p50)} for sellers to ${hr(c.sales_leadership.p50)} for sales leadership.`]; },
      stats: () => [{ v: hr(latestMedian()) + '/hr', l: 'All-category median, latest quarter' }, { v: yoy(), l: 'Change in the median, year over year' }, { v: (REP().concurrent || []).slice().sort((a, b) => b.v - a.v)[0] ? REP().concurrent.slice().sort((a, b) => b.v - a.v)[0].l : '2 clients', l: 'Most common client load' }],
      sections: () => {
        const cats = F.roleCategory.options.filter((o) => RIX().byCat[o.v]);
        const rows = cats.map((o) => ({ label: o.l, value: RIX().byCat[o.v].p50 })).sort((a, b) => b.value - a.value);
        return [
          { id: 'index', h: 'Start from the Rate Index', html: `<p>The Rate Index reports the median and middle half of hourly rates for every role category, from rates operators list on their profiles.</p>
            ${chartSlot('g8-cats', (w) => bars(rows, { fmt: (n) => '$' + n, label: 'Median hourly rate by role category' }, w))}
            ${tbl(['Role category', '25th pct', 'Median', '75th pct'], cats.map((o) => { const b = RIX().byCat[o.v]; return [esc(o.l), hr(b.p25), `<b>${hr(b.p50)}</b>`, hr(b.p75)]; }))}
            ${src(`Rate Index, latest quarter. See the full index and estimator on ${L('rates', 'Rates')}. Illustrative.`)}
            ${chartGo('Browse operators by role category and rate', { filters: {}, src: 'guide_chart_rate_cat' })}` },
          { id: 'revenue', h: 'Adjust for the clients you serve', html: `<p>Rates rise with client size. Against a $5M–$20M company as the baseline:</p>
            ${tbl(['Company revenue', 'Rate vs baseline'], F.companyRevenue.options.filter((o) => RIX().byRevenue[o.v]).map((o) => { const m = RIX().byRevenue[o.v]; return [esc(o.l), `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`]; }))}` },
          { id: 'model', h: 'Hourly, retainer or project', html: `<p>Most operators list an hourly rate and bill a monthly retainer for a block of hours. At the Sales Leadership median, 20 hours a month is ${usd(RIX().byCat.sales_leadership.p50 * 20)}, 40 hours is ${usd(RIX().byCat.sales_leadership.p50 * 40)}. Scoped projects (${esc(F.engagementTypes.options.find((o) => o.v === 'project').d.toLowerCase().replace(/\.$/, ''))}) are priced per project, from the hours you expect to spend.</p>` },
          { id: 'proof', h: 'Proof moves your rate more than discounts do', html: `<p>Operators with three or more client-verified reviews are rehired ${sumStat(/Rehire rate/i, '2.4x')} as often as those with none. Clients comparing two operators at similar rates pick the one with verified proof in the work they need. Before you lower your rate, ask two past clients for a CORE review.</p>
            <p>Signed in, the Positioning tab in Studio shows where your rate sits against the 25th, 50th and 75th percentile for your category, next to how often operators at each band win.</p>` },
          { id: 'load', h: 'How many clients to carry', html: (REP().concurrent || []).length ? `<p>${REP().concurrent.map((c) => `${esc(c.l)}: ${c.v}%`).join(', ')}. Two clients is the most common load. Price so that two clients at your usual hours cover your income target, with a third as upside.</p>` : '' },
        ];
      },
      faq: () => [
        { q: 'Should I show my rate on my profile?', a: 'Yes. Clients filter by rate, and profiles without a rate drop out of those searches. Rates are visible to signed-in clients only.' },
        { q: 'Should I discount for my first client on the platform?', a: 'Prefer a shorter initial term or fewer hours over a lower rate. A discounted rate becomes the reference point for renewals.' },
        { q: 'How often should I raise my rate?', a: 'Review it each quarter against the Rate Index and after every new verified review. Raise it for new clients first.' },
      ],
      cta: { label: 'See your rate position', to: 'studio.positioning', operator: true },
    },
    {
      slug: 'how-fractional-operators-win-direct-deals', group: 'operators', updated: '2026-09-16', mins: 5, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How do fractional operators win clients without a marketplace intro?',
      answer: () => { const s = REP().sources || []; const ref = s.filter((x) => /Referral|colleague/i.test(x.l)).reduce((a, x) => a + x.v, 0) || 67; return [`Most fractional work still comes from referrals and former colleagues: ${ref}% of clients in our survey found their operator that way.`, 'Operators win those deals faster when they can send proof: a profile with client-verified focus areas, CORE reviews and a private proof link that shows which parts the prospect read.']; },
      stats: () => { const s = REP().sources || []; const ref = s.filter((x) => /Referral|colleague/i.test(x.l)).reduce((a, x) => a + x.v, 0); return [{ v: (ref || 67) + '%', l: 'Found their operator through a referral or colleague' }, { v: sumStat(/Rehire rate/i, '2.4x'), l: 'Rehire rate with 3+ verified reviews' }, { v: '0%', l: 'Fee on deals you source yourself' }]; },
      sections: () => {
        const s = (REP().sources || []).map((x) => ({ label: x.l, value: x.v, hi: /Referral/i.test(x.l) }));
        return [
          { id: 'sources', h: 'Where clients find operators', html: `${chartSlot('g9-src', (w) => bars(s, { fmt: (n) => n + '%', label: 'Where companies found their fractional operator' }, w))}
            ${src('State of Fractional GTM 2027 survey of companies that hired a fractional leader. Illustrative.')}
            <p class="rs-chart-go"><a class="act" href="#${RN.store.state.persona === 'operator' ? 'studio.visibility' : 'join'}">${RN.store.state.persona === 'operator' ? 'See where your own profile views come from' : 'Join the network to see where your views come from'}${icon('arrow')}</a></p>
            <p>A referral gets you the first call. What the prospect checks after that call decides the deal.</p>` },
          { id: 'check', h: 'What prospects check before they call you back', html: `<p>Stage and deal-size fit, how you communicate in a part-time seat and verified references from prior clients were the top three factors companies wish they had weighed. A résumé shows none of them. A profile with client-verified focus areas, CORE reviews and Engagement History shows all three.</p>` },
          { id: 'proof-link', h: 'Send proof, not a résumé', html: `<p>From Studio you can create a <b>proof link</b>: a private version of your profile prepared for one prospect, with the sections you choose. The prospect sees a notice that you can see what they read. You see which sections they opened, for how long, and whether they forwarded it inside their team.</p>
            <p>Revenue Nomad charges no fee on deals you source yourself. The link makes the deal easier to win; it does not route it through the marketplace.</p>` },
          { id: 'findable', h: 'Get found in search and AI answers', html: `<ul><li>Write a headline that names the problem you solve and the stage you solve it at.</li><li>Ask past clients to verify your top focus areas: verified tags rank first on cards and in search.</li><li>Keep availability current; fresh availability ranks higher.</li><li>A long-form About section feeds Google and AI answer engines, which increasingly answer "who is a good fractional VP of Sales for..." directly.</li></ul>` },
          { id: 'studio', h: 'What you get even without an intro', html: `<p>Studio shows every search you appeared in and why, the firmographic segments that viewed you (never company names), where you were compared and not chosen, and how your rate and focus areas compare with demand. None of it depends on an intro.</p>` },
        ];
      },
      faq: () => [
        { q: 'Does Revenue Nomad take a fee on clients I bring myself?', a: 'No. There is no fee on operator-sourced deals. Proof links exist to help you close them.' },
        { q: 'Will the prospect know I can see what they read?', a: 'Yes. Every proof link shows the prospect a notice that viewing is shared with the operator.' },
        { q: 'How do I get my first verified review?', a: 'Send a review request from Studio to a past client. When they submit a CORE review rated 4.0 or higher, the focus areas they confirm turn verified.' },
      ],
      cta: { label: 'Create a proof link', to: 'studio.credibility', operator: true },
    },
    {
      slug: 'what-is-the-reputation-index', group: 'methods', updated: '2026-09-01', mins: 5, cat: null, opsQ: '', opsSort: 'ris',
      q: 'What is the Revenue Nomad Reputation Index?',
      answer: () => ['The Reputation Index is a 0 to 100 score that shows how much client evidence stands behind an operator\'s profile.', 'Every approved profile starts at 50 (Vetted), and the score rises only with client reviews, verified focus areas, strong CORE ratings, a complete profile and recent verified engagements.'],
      stats: () => { const ops = RN.model.ops; const hi = ops.filter((o) => o.ris.score >= 60).length; return [{ v: '50', l: 'Starting score for every approved profile' }, { v: String(F.risFactors.options.length), l: 'Factors, all from client evidence' }, { v: String(hi), l: `Operators at Proven or above today` }]; },
      sections: () => {
        const ops = RN.model.ops.filter((o) => !o.hidden);
        const tiers = F.risTier.options.filter((t) => t.v !== 'indexing').slice().reverse();
        const tierRows = tiers.map((t) => ({ label: `${t.l} (${t.min}–${t.max})`, value: ops.filter((o) => o.ris.tier === t.v).length }));
        return [
          { id: 'factors', h: 'The five factors', html: `<dl class="rs-dl rs-dl-w">${F.risFactors.options.map((o) => `<div><dt>${esc(o.l)}<span class="tnum">${Math.round((o.w || 0) * 100)}%</span></dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>
            <p>Weights are published so operators know exactly what moves the score and clients know what it measures.</p>` },
          { id: 'tiers', h: 'The tiers', html: `${tbl(['Tier', 'Score', 'What it means'], F.risTier.options.map((t) => [`<b>${esc(t.l)}</b>`, `${t.min}–${t.max}`, esc(t.d)]), 'rs-tbl-l')}
            <p>"Vetted" means the Revenue Nomad team checked identity and work history. "Verified" is reserved for proof a client confirmed: verified focus areas and verified engagements.</p>` },
          { id: 'network', h: 'Where the network sits today', html: `${chartSlot('g10-tiers', (w) => bars(tierRows, { label: 'Operators by Reputation Index tier' }, w))}
            ${src(`Live count across ${ops.length} operator profiles in this prototype.`)}
            ${chartGo('Browse operators at Trusted and above (Reputation Index 70+)', { filters: { risMin: '70' }, src: 'guide_chart_tiers' })}
            <p>Most profiles sit at Vetted because the index only moves with client evidence. That is by design: a score that starts high means nothing.</p>` },
          { id: 'not', h: 'What it is not', html: `<ul><li>It is not for sale. No plan, fee or sponsorship changes it.</li><li>It is not a popularity score. Profile views and searches do not count.</li><li>It does not punish operators for engagements that were never reviewed.</li></ul>
            <p>Operators can see how their own score breaks down in Studio, and the ${L('levels', 'Levels page')} explains what each tier unlocks.</p>` },
        ];
      },
      faq: () => [
        { q: 'Why do most operators have a score of 50?', a: 'Every approved profile starts at 50 and rises only with client evidence. New operators have not collected reviews on the platform yet.' },
        { q: 'How quickly does the score update?', a: 'Immediately. A submitted review, a verified engagement or a completed profile recalculates the score the same day.' },
        { q: 'Can a bad review lower the score?', a: 'Low CORE ratings reduce the Strong ratings factor, and reviews rated under 4.0 do not verify focus areas. Reviews publish automatically; there is no moderation queue to hide them.' },
      ],
      cta: { label: 'Browse Reputation Index 70+', filters: { risMin: '70' } },
    },
    {
      slug: 'what-is-core', group: 'methods', updated: '2026-09-01', mins: 4, cat: null, opsQ: '', opsSort: 'ris',
      q: 'What is CORE?',
      answer: () => ['CORE is Revenue Nomad\'s client review framework: Communication, Ownership, Results Focus and Expertise, each rated 1 to 5 by a client who worked with the operator.', 'Every review ends with a yes or no answer to "Would you hire this operator again?", and reviews rated 4.0 or higher verify the focus areas the client confirms.'],
      stats: () => [{ v: '4', l: 'Questions, each rated 1 to 5' }, { v: '4.0+', l: 'Average needed to verify focus areas' }, { v: '3', l: 'Short steps for the client' }],
      sections: () => [
        { id: 'questions', h: 'The four questions', html: `<dl class="rs-dl">${F.coreDims.options.map((o) => `<div><dt><span class="rs-core-l">${esc(o.v)}</span>${esc(o.l)}</dt><dd><span class="rs-core-q">“${esc(o.q)}”</span> ${esc(o.d)}</dd></div>`).join('')}</dl>` },
        { id: 'how', h: 'How a review works', html: `<ol>
          <li><b>The engagement.</b> The client confirms the role delivered, the dates, the ${esc(F.engagementType.label.toLowerCase())} and the spend.</li>
          <li><b>CORE.</b> Four ratings from 1 to 5, each with an optional reason, a required overall experience note, and ${esc(F.hireAgain.label.replace(/\?$/, '').toLowerCase())}.</li>
          <li><b>Focus areas and outcomes.</b> The client confirms the operator's focus areas they saw in action and rates up to three outcomes: ${esc(RN.w.labels('outcomeRating', F.outcomeRating.options.map((o) => o.v)))}.</li></ol>
          <p>Only clients the operator requests a review from can submit one. Reviews publish automatically. Operators see two states for each request: ${esc(RN.w.labels('reviewStatus', ['sent', 'completed'], ' and '))}.</p>` },
        { id: 'feeds', h: 'What a review changes', html: `<ul><li>Focus areas the client confirms turn <b>verified</b> when the review averages 4.0 or higher. Five such reviews make a focus area Expert.</li><li>The Reputation Index recalculates: review volume, strong ratings and fit tag verification all move.</li><li>The review appears on the profile, in the CORE section and on any proof link that includes reviews.</li></ul>` },
        { id: 'why', h: 'Why four dimensions instead of five stars', html: `<p>Star averages drift toward 4.9 on most marketplaces, which makes them useless for comparison. Four specific questions show where an operator is strong and where they are average, and "Would hire again" is harder to inflate than a star.</p>` },
      ],
      faq: () => [
        { q: 'Who can leave a CORE review?', a: 'A client the operator worked with and sent a review request to. Operators cannot review themselves or each other.' },
        { q: 'Can an operator hide a review?', a: 'No. Reviews publish automatically and there is no moderation queue.' },
        { q: 'What does CORE stand for?', a: 'Communication, Ownership, Results Focus and Expertise, the four things clients rate.' },
      ],
      cta: { label: 'Read how the score works', to: 'levels' },
    },
  ];
  R.guides = GUIDES;
  const guideBy = (slug) => GUIDES.find((g) => g.slug === slug);
  const KIND = {
    'fractional-vp-of-sales-cost': 'Cost', 'fractional-vs-full-time-vp-of-sales': 'Hiring decision', 'how-to-scope-a-fractional-sales-engagement': 'Scoping',
    'fractional-revops-first-90-days': 'First 90 days', 'fractional-cmo-vs-marketing-agency': 'Comparison', 'evaluate-fractional-operator-track-record': 'Due diligence',
    'transition-out-of-founder-led-sales': 'Playbook', 'how-much-should-a-fractional-operator-charge': 'Pricing', 'how-fractional-operators-win-direct-deals': 'Winning work',
    'what-is-the-reputation-index': 'Methodology', 'what-is-core': 'Methodology',
  };

  const GLOSSARY = [
    { t: 'Fractional', d: () => `${F.engagementTypes.options.find((o) => o.v === 'fractional').d} Usually 20 to 80 hours a month.`, to: 'guide.fractional-vs-full-time-vp-of-sales' },
    { t: 'Interim', d: () => F.engagementTypes.options.find((o) => o.v === 'interim').d + ' Closer to full time for a defined period.' },
    { t: 'Advisory', d: () => F.engagementTypes.options.find((o) => o.v === 'advisory').d },
    { t: 'Project engagement', d: () => F.engagementTypes.options.find((o) => o.v === 'project').d, to: 'blueprints' },
    { t: 'Available time', d: () => `The hours a month an operator can give a new client, from ${RN.w.label('hoursPerMonth', F.hoursPerMonth.options[0].v)} to ${RN.w.label('hoursPerMonth', F.hoursPerMonth.options.slice(-1)[0].v)}. Clients filter by it; projects ask for it.` },
    { t: 'Initial term', d: () => `How long the first engagement is agreed for: ${F.term.options.map((o) => o.l).join(', ')}.`, to: 'guide.how-to-scope-a-fractional-sales-engagement' },
    { t: 'Role category', d: () => `The discipline an operator leads. There are ${F.roleCategory.options.length}: ${F.roleCategory.options.map((o) => o.l).join(', ')}.`, to: 'browse' },
    { t: 'Focus area (fit tag)', d: () => 'A specific kind of work, such as Pipeline Inspection or HubSpot admin. Operators call them fit tags and add up to 25; clients see them as focus areas and filter by them.', to: 'library' },
    { t: 'Self-claimed', d: () => 'A focus area the operator added that no client review has confirmed yet. Shown with a dashed outline.', to: 'library' },
    { t: 'Client-verified', d: () => 'A focus area confirmed by at least one client review rated 4.0 or higher. One review verifies it at a score of 50.', to: 'library' },
    { t: 'Expert', d: () => 'A focus area confirmed by five or more client reviews rated 4.0 or higher, scored 85 to 100.', to: 'library' },
    { t: 'Reputation Index', d: () => 'A 0 to 100 score of the client evidence behind a profile, from five published factors. Every approved profile starts at 50.', to: 'guide.what-is-the-reputation-index' },
    { t: 'Vetted', d: () => F.risTier.options.find((t) => t.v === 'vetted').d, to: 'levels' },
    { t: 'CORE', d: () => 'Revenue Nomad\'s client review: Communication, Ownership, Results Focus and Expertise, each rated 1 to 5, plus "Would you hire this operator again?"', to: 'guide.what-is-core' },
    { t: 'Engagement History', d: () => 'The client engagements on an operator\'s profile, with dates, scope and company size, marked verified when the client confirmed them.' },
    { t: 'Engagement Blueprint', d: () => 'A scoped project template: role category, typical hours and term, a 30/60/90-day plan, the focus areas it needs and a typical rate range. Post one as a project in three steps.', to: 'blueprints' },
    { t: 'GTM Framework', d: () => 'Revenue Nomad\'s map of go-to-market work: six areas across seven customer-journey stages, from Awareness to Expand. Every focus area sits in one cell.', to: 'framework' },
    { t: 'Rate Index', d: () => 'Revenue Nomad\'s benchmark of hourly rates by role category and company revenue range, reported as the 25th percentile, median and 75th percentile each quarter.', to: 'rates' },
    { t: 'Match Signals', d: () => 'Five checks shown to a signed-in client on every profile: company revenue, company size, GTM motion, industry and expertise, scored against the client\'s company profile.' },
    { t: 'Proof link', d: () => 'A private version of an operator\'s profile prepared for one prospect. The prospect is told the operator can see which sections they read.', to: 'guide.how-fractional-operators-win-direct-deals' },
  ];
  R.glossary = GLOSSARY;

  function guideFeature(g) {
    const a = g.answer();
    const st = g.stats ? g.stats() : [];
    return `<a class="card card-link rs-gfeat" href="#guide.${esc(g.slug)}">
      <div class="rs-gfeat-main">
        <span class="label">${esc(KIND[g.slug] || 'Guide')} · Start here</span>
        <h3 class="h2">${esc(g.q)}</h3>
        <p class="rs-gfeat-a">${a.map(esc).join(' ')}</p>
        <span class="rs-gcard-ft"><span class="tiny muted">${g.mins} min read · Updated ${esc(RN.fmt.date(g.updated + 'T12:00:00'))}</span><span class="act">Read the guide${icon('arrow')}</span></span>
      </div>
      <div class="rs-gfeat-stats">${st.map((x) => `<div class="stat"><span class="stat-v">${esc(x.v)}</span><span class="stat-l">${esc(x.l)}</span></div>`).join('')}</div>
    </a>`;
  }
  function guideCard(g) {
    const a = g.answer();
    return `<a class="card card-link rs-gcard" href="#guide.${esc(g.slug)}">
      <span class="label">${esc(KIND[g.slug] || GROUPS.find((x) => x.k === g.group).l)}</span>
      <h3 class="h4">${esc(g.q)}</h3>
      <p class="small muted clamp-3">${esc(a[0])}</p>
      <span class="rs-gcard-ft"><span class="tiny muted">${g.mins} min read · Updated ${esc(RN.fmt.date(g.updated + 'T12:00:00'))}</span>${icon('arrow')}</span>
    </a>`;
  }

  function renderGuides() {
    chartFns = {};
    const schema = {
      '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Fractional GTM glossary', url: 'https://revenuenomad.com/guides#glossary',
      hasDefinedTerm: GLOSSARY.map((x) => ({ '@type': 'DefinedTerm', name: x.t, description: x.d() })),
    };
    return `<div class="rs rs-guides">
    <header class="wrap phead rs-head">
      ${crumbs([{ l: 'Guides' }])}
      <span class="eyebrow">Guides</span>
      <h1 class="h1">Straight answers on <span class="serif">fractional go-to-market.</span></h1>
      <p class="lede">Each guide answers one question in two sentences, then shows the numbers behind it from the Rate Index, the State of Fractional GTM survey and live profiles on the network. Written by Revenue Nomad Research.</p>
      <div class="row rs-gjump">${GROUPS.map((g) => `<button type="button" class="chip" data-act="rs-scroll" data-to="rs-g-${g.k}">${esc(g.l)}<span class="tiny muted">${GUIDES.filter((x) => x.group === g.k).length}</span></button>`).join('')}<button type="button" class="chip" data-act="rs-scroll" data-to="rs-glossary">Glossary<span class="tiny muted">${GLOSSARY.length}</span></button></div>
    </header>
    ${(() => {
      const cl = GUIDES.filter((x) => x.group === 'clients');
      const grpHd = (g) => `<div class="rs-ggrp-hd"><h2 class="h3" id="rs-g-${g.k}-t">${esc(g.l)}</h2><p class="small muted">${esc(g.d)}</p></div>`;
      return `<section class="wrap rs-sec-sm rs-ggrp" id="rs-g-clients" aria-labelledby="rs-g-clients-t">
        ${grpHd(GROUPS[0])}
        ${guideFeature(cl[0])}
        <div class="grid g-3" style="margin-top:24px">${cl.slice(1).map(guideCard).join('')}</div>
      </section>
      <div class="wrap rs-sec-sm"><div class="grid g-2 rs-gpair">${GROUPS.slice(1).map((g) => `<section class="rs-ggrp" id="rs-g-${g.k}" aria-labelledby="rs-g-${g.k}-t">
        ${grpHd(g)}
        <div class="grid g-2 rs-gpair-in">${GUIDES.filter((x) => x.group === g.k).map(guideCard).join('')}</div>
      </section>`).join('')}</div></div>`;
    })()}
    <section class="wrap rs-sec-sm" id="rs-glossary" aria-labelledby="rs-gl-t">
      <div class="rs-gloss card">
        <div class="rs-ggrp-hd"><span class="eyebrow">Glossary</span><h2 class="h3" id="rs-gl-t" style="margin-top:8px">The words we use, <span class="serif">defined once.</span></h2><p class="small muted">The same terms appear on every profile, brief, review and report on Revenue Nomad.</p></div>
        <dl class="rs-gl">${GLOSSARY.map((x) => `<div class="rs-gl-i" id="rs-term-${esc(RN.slug(x.t))}"><dt>${esc(x.t)}</dt><dd>${esc(x.d())}${x.to ? ` <a class="rs-gl-a" href="#${esc(x.to)}" aria-label="More on ${esc(x.t)}">More${icon('arrow')}</a>` : ''}</dd></div>`).join('')}</dl>
      </div>
      <div style="margin-top:20px">${schemaBlock('rs-gl-schema', schema, 'For the dev team: DefinedTermSet markup for the glossary')}</div>
    </section>
    </div>`;
  }


  function renderGuide(slug) {
    chartFns = {};
    const g = guideBy(slug);
    if (!g) {
      return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'book', title: 'We could not find that guide', body: 'It may have moved. Every guide is listed on the Guides page.', cta: '<a class="btn" href="#guides">See all guides</a>' })}</section>`;
    }
    const grp = GROUPS.find((x) => x.k === g.group);
    const answer = g.answer();
    const secs = g.sections().filter((s) => s.html);
    const faq = g.faq();
    const stats = g.stats ? g.stats() : [];
    const updated = RN.fmt.date(g.updated + 'T12:00:00');
    const persona = RN.store.state.persona;

    // Related operators
    let rel = [];
    if (g.opsQ) rel = RN.model.search({ q: g.opsQ, filters: g.cat ? { roleCategories: [g.cat] } : {} }).slice(0, 3);
    if (rel.length < 3) rel = rel.concat(RN.model.search({ filters: g.cat ? { roleCategories: [g.cat] } : {}, sort: 'ris' }).filter((x) => !rel.some((y) => y.op.id === x.op.id))).slice(0, 3);
    const bp = blueprintFor(g.cat, g.bp);

    // CTA
    const c = g.cta || {};
    let cta = '';
    if (c.operator && persona !== 'operator') cta = `<a class="btn btn-block" href="#join">Join as an operator${icon('arrow')}</a>`;
    else if (c.to) cta = `<a class="btn btn-block" href="#${esc(c.to)}">${esc(c.label)}${icon('arrow')}</a>`;
    else cta = browseBtn(c.label || 'Browse operators', { filters: c.filters || {}, tags: c.tags || [], src: 'guide_' + g.slug }, 'btn btn-block');

    const schema = {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: [{ q: g.q, a: answer.join(' ') }].concat(faq).map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
    };
    const others = GUIDES.filter((x) => x.slug !== g.slug).sort((a, b) => (a.group === g.group ? -1 : 0) - (b.group === g.group ? -1 : 0)).slice(0, 3);
    const toc = secs.map((s) => ({ id: s.id, h: s.h })).concat([{ id: 'faq', h: 'Common questions' }, { id: 'operators', h: rel.length ? 'Operators' : 'Next steps' }]);

    return `<div class="rs rs-guide-pg">
    <div class="wrap rs-guide">
      <article class="rs-art" aria-labelledby="rs-g-h1">
        ${crumbs([{ l: 'Guides', to: 'guides' }, { l: grp.l }])}
        <span class="eyebrow">${esc(grp.l)}</span>
        <h1 class="rs-g-h1" id="rs-g-h1">${esc(g.q)}</h1>
        <div class="rs-byline">
          <span class="rs-by-ava" aria-hidden="true">${icon('book')}</span>
          <span><b>Revenue Nomad Research</b><span class="tiny muted">Last updated <time datetime="${esc(g.updated)}">${esc(updated)}</time> · ${g.mins} min read</span></span>
          ${illus()}
        </div>
        <div class="rs-answer" role="note" aria-label="Short answer">
          <span class="label">The short answer</span>
          <p>${answer.map(esc).join(' ')}</p>
        </div>
        ${stats.length ? `<div class="stats-row rs-gstats" style="--cols:${stats.length}">${stats.map((s) => `<div class="stat"><span class="stat-v">${esc(s.v)}</span><span class="stat-l">${esc(s.l)}</span></div>`).join('')}</div>` : ''}
        <div class="prose rs-prose">
          ${secs.map((s) => `<section id="rs-s-${esc(s.id)}" class="rs-gsec"><h2>${esc(s.h)}</h2>${s.html}</section>`).join('')}
        </div>
        <section id="rs-s-faq" class="rs-faq" aria-labelledby="rs-faq-t">
          <h2 class="h3" id="rs-faq-t">Common questions</h2>
          ${faq.map((f, i) => `<details class="rs-faq-i" ${i === 0 ? 'open' : ''}><summary><span>${esc(f.q)}</span>${icon('chev-down', 'rs-chev')}</summary><p>${esc(f.a)}</p></details>`).join('')}
        </section>
        <footer class="rs-gfoot">
          <p class="small muted">Sources: Revenue Nomad Rate Index (${esc((RIX().trend || []).slice(-1)[0] ? RIX().trend.slice(-1)[0].l : 'latest quarter')}), the State of Fractional GTM ${esc(String(REP().year || 2027))} survey (fieldwork ${esc(REP().fieldwork || '')}) and live operator profiles. Market and survey figures in this prototype are illustrative. Cite as "Revenue Nomad Research, ${esc(RN.fmt.monthYear(g.updated + 'T12:00:00'))}".</p>
          ${schemaBlock('rs-faq-schema', schema, 'For the dev team: FAQPage JSON-LD built from the short answer and the FAQ. Also add Article (author Revenue Nomad Research, dateModified) and BreadcrumbList.')}
        </footer>
      </article>
      <aside class="rs-rail" aria-label="On this page">
        <div class="rs-rail-in">
          <div class="rs-toc"><span class="label">On this page</span>
            <ul>${toc.map((t) => `<li><button type="button" data-act="rs-scroll" data-to="rs-s-${esc(t.id)}">${esc(t.h)}</button></li>`).join('')}</ul>
          </div>
          <div class="card rs-rail-cta">
            <b class="h5">${esc(g.group === 'operators' ? 'Put this to work' : g.group === 'methods' ? 'See it on a profile' : 'Ready to hire?')}</b>
            <p class="small muted">${esc(g.group === 'operators' ? (persona === 'operator' ? 'Studio shows your numbers next to the benchmarks in this guide.' : 'Join the network to get a Studio with your numbers next to these benchmarks.') : g.group === 'methods' ? 'Every profile shows its Reputation Index, CORE reviews and verified focus areas.' : 'Browse operators with client-verified proof, or estimate the cost first.')}</p>
            ${cta}
            ${g.group === 'clients' ? `<a class="btn btn-line btn-block" href="#rates">Estimate the cost</a>` : ''}
          </div>
        </div>
      </aside>
    </div>
    <div class="wrap rs-guide-after">
        <section id="rs-s-operators" class="rs-rel" aria-labelledby="rs-rel-t">
          <div class="row between" style="align-items:flex-end"><div><span class="kicker">From the network</span><h2 class="h3" id="rs-rel-t" style="margin-top:6px">${g.cat ? `${esc(F.catLabel(g.cat))} operators who do this work` : 'Operators with the most client evidence'}</h2></div>
          ${browseBtn('Browse all', { filters: g.cat ? { roleCategories: [g.cat] } : {}, src: 'guide_' + g.slug }, 'btn btn-line btn-sm')}</div>
          <div class="grid g-3 rs-rel-ops">${rel.map((x) => RN.ui.opCard(x.op, { compact: true, why: x.why && x.why[0] ? x.why[0] : `Reputation Index ${x.op.ris.score}` })).join('')}</div>
          <div class="grid g-2 rs-glinks">
          <a class="rs-bp card card-link" href="#${esc(bp ? bp.to : 'blueprints')}">
            <span class="rs-bp-ic">${icon('doc')}</span>
            <span class="grow"><span class="label">Engagement Blueprint</span><b>${esc(bp ? bp.title : `Scope this work${g.cat ? ` with a ${F.catLabel(g.cat)} Blueprint` : ' with a Blueprint'}`)}</b><span class="small muted">${esc(bp && bp.sub ? bp.sub : 'Typical hours, term, a 30/60/90-day plan and a rate range from the Rate Index, ready to post as a project.')}</span></span>
            ${icon('arrow')}
          </a>
          ${g.cat && RIX().byCat[g.cat] ? `<a class="rs-bp card card-link" href="#rates">
            <span class="rs-bp-ic">${icon('chart')}</span>
            <span class="grow"><span class="label">Rate Index</span><b>${esc(F.catLabel(g.cat))}: median ${esc(RN.fmt.rate(RIX().byCat[g.cat].p50))}</b><span class="small muted">Middle half ${hr(RIX().byCat[g.cat].p25)} to ${hr(RIX().byCat[g.cat].p75)} an hour. Estimate a month for your company size.</span></span>
            ${icon('arrow')}
          </a>` : `<a class="rs-bp card card-link" href="#framework">
            <span class="rs-bp-ic">${icon('grid')}</span>
            <span class="grow"><span class="label">GTM Framework</span><b>Where operators have client-verified proof</b><span class="small muted">Six areas across seven stages of the customer journey, counted from live profiles.</span></span>
            ${icon('arrow')}
          </a>`}
          </div>
        </section>
        <nav class="rs-next" aria-label="More guides">
          <span class="label">Keep reading</span>
          <div class="grid g-3">${others.map(guideCard).join('')}</div>
        </nav>
    </div>
    </div>`;
  }

  /* =====================================================================
     Register views
     ===================================================================== */
  RN.view('framework', {
    route: 'framework', nav: 'insights',
    title: () => 'GTM Framework',
    render: renderFramework,
    mount: (root) => { mountCommon(root); },
    unmount: unmountCommon,
  });
  RN.view('library', {
    route: 'library', nav: 'insights',
    title: () => 'Fit Tag Library',
    render: renderLibrary,
    mount: (root) => { mountCommon(root); },
    unmount: unmountCommon,
  });
  RN.view('guides', {
    route: 'guides', nav: 'insights',
    title: () => 'Guides',
    render: renderGuides,
    mount: (root) => { mountCommon(root); },
    unmount: unmountCommon,
  });
  RN.view('guide', {
    route: 'guide.:slug', nav: 'insights',
    samples: { slug: GUIDES[0].slug, extra: GUIDES.slice(1).map((g) => 'guide.' + g.slug) },
    title: (p) => { const g = guideBy(p.slug); return g ? g.q : 'Guide'; },
    render: (p) => renderGuide(p.slug),
    mount: (root) => { mountCommon(root); },
    unmount: unmountCommon,
  });
})();
