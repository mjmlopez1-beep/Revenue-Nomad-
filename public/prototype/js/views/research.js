/* Research surfaces, the platform's public IP:
     #framework       GTM Framework explorer: 6 areas x 7 customer-journey stages, bowtie, cell panels, client self-diagnostic
     #library         Fit Tag Library: the public taxonomy with definitions, claimed vs client-verified supply and demand
     #guides          Guides index (grouped) + glossary of 20 terms
     #guide.<slug>    One question per page, written for search and AI answer engines (direct answer, data, FAQ, JSON-LD)
   Prefix: rs- (actions, inputs, CSS). Shared helpers live on RN.research so they can be promoted to core:
     RN.research.stageOf(tag)  curated stage for a fit tag (see CURATED below and the hand-off notes)
     RN.research.def(tag)      published definition for a fit tag (library d, else Revenue Nomad Research's)
     RN.research.guides        guide registry. Each entry: { id, title, cat, group, href, slug, q, ... }
                               id = slug, route #guide.<id>; title = the question; cat = roleCategory slug or null
     RN.research.guidesFor(cat, n)  up to n guides for a role category (cost guide first), for Browse category pages
     RN.research.relatedOps(guide|id) the operators a guide's "From the network" module shows
   Market figures come from RN.data.market and are illustrative; every surface says so.
   Fee copy (founder decision, Sep 25, 2026): companies pay no fees, so research quotes the operator's rate as the price
   and never mentions a fee, margin, split or all-in figure. Research is public and client-facing, including the guides
   written for operators; they point to #operators, which is the only place the operator fee is stated.
   Editorial modules rank every operator by the same rules, with no exclusions or callouts for any profile. */
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
  // Three phases of the revenue journey (owner, Oct 13, 2026): Pre-sale, New business, Post-sale
  const PHASES = [['Pre-sale', ['Awareness', 'Engage']], ['New business', ['Qualify', 'Commit']], ['Post-sale', ['Onboard', 'Adopt', 'Expand']]];
  const phaseOf = (name) => { const f = PHASES.find((x) => x[1].includes(name)); return f ? f[0] : 'Every stage'; };
  const phaseRuns = (stages) => { const out = []; stages.forEach((s) => { const k = phaseOf(s.name), last = out[out.length - 1]; if (last && last.k === k) last.n++; else out.push({ k, n: 1 }); }); return out; };
  const allStages = () => journey().concat([FOUNDATION]);
  const stageBy = (name) => allStages().find((s) => s.name === name || s.id === name);
  // "Win deals at Qualify", but "Lead & plan across every stage" for Foundation
  const cellText = (area, stage) => (stage === 'Foundation' ? `${area} across every stage` : `${area} at ${stage}`);
  const cellHtml = (area, stage) => esc(cellText(area, stage));
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
     Recomputed per render (about 300 operators, a few milliseconds) so Studio edits and reviews show up at once. */
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
    const ranked = RN.model.ops.filter((op) => !op.hidden && (!cat || op.catKey === cat)).map((op) => {
      const hits = op.tags.filter((t) => {
        const info = RN.model.tagInfo(t.t) || {};
        const ax = t.axis || info.axis;
        return (!area || ax === area) && (!stage || R.stageOf({ t: t.t, stage: t.stage || info.stage || '' }) === stage);
      });
      const v = hits.filter((t) => t.tier !== 'claimed');
      return { op, hits, v, s: v.length * 100 + Math.min(hits.length, 6) * 8 + RN.fields.risRank(op) * 0.5 + (op.photo ? 4 : 0) };
    }).filter((x) => x.hits.length).sort((a, b) => b.s - a.s);
    // The founder stays eligible but never takes the first slot (owner rule, Oct 14, 2026)
    return RN.model.notFirst(ranked).slice(0, n || 3);
  }
  const whyLine = (x) => x.v.length ? `Company-verified in ${x.v[0].t}${x.v.length > 1 ? ` and ${x.v.length - 1} more here` : ''}` : `Claims ${x.hits.slice(0, 2).map((t) => t.t).join(' and ')}`;

  /* Proof-strength fill: five steps from tint to brand by verified operators (sqrt spreads the low end).
     The steps skip the middle of the ramp on purpose. In light and dark, --ink reads at 4.5:1 or better on
     steps 1-3 and --accent-ink on steps 4-5; no text color passes on a mid-green in dark mode.
     Claimed-only and empty cells get their own styles. */
  const STEPS = [14, 27, 40, 82, 94];
  function fill(ver, any, maxV, libN) {
    if (ver > 0) {
      const t = Math.min(1, Math.sqrt(ver / Math.max(1, maxV)));
      const i = Math.min(STEPS.length - 1, Math.floor(t * STEPS.length));
      return { cls: 'is-v' + (i >= 3 ? ' is-hi' : ''), style: `--rs-p:${STEPS[i]}%` };
    }
    if (any > 0) return { cls: 'is-c', style: '' };
    return { cls: libN ? 'is-open' : 'is-empty', style: '' };
  }

  /* =====================================================================
     Shared bits
     ===================================================================== */
  const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#insights">Insights</a>${items.map((x) => `${icon('chev-right')}${x.to ? `<a href="#${esc(x.to)}">${esc(x.l)}</a>` : `<span>${esc(x.l)}</span>`}`).join('')}</nav>`;
  // Rate Index, survey and demand figures are illustrative: the tag is visible to every visitor (owner rule, Oct 14, 2026)
  const illus = (label) => RN.ui.illusTag(label || 'Illustrative');
  const jsonAttr = (o) => esc(JSON.stringify(o));
  // The one line companies read about pricing
  const NO_FEES = 'No fees for companies. The listed rate is the price, with no fee added on top.';

  /* [[cost:key.field]] in guide copy reads the canonical cost record (RN.costs, js/data/costs.js), so a guide quotes the
     same figure as the cost hub, the function pages and the rates pages. field: a text field of the record (hourly,
     hours, monthly, fixed, yearly, fullTime, fullTimeMonthly, pct, price), or answer, basis, tenure, replace, firstYear.
     |lower lowercases a leading "About" or "Up to" for use mid-sentence; |bare drops the unit ("$200 - $250/hr" ->
     "$200 - $250", "About 40 hours a month" -> "About 40"). Money ranges keep no-break spaces so they never wrap. */
  // RN.fmt.keepRange: no-break spaces plus a word joiner after the hyphen, so Chrome never breaks a range
  const NB = (s) => RN.fmt.keepRange(s);
  // "40 hrs / month" with no-break spaces, so the unit never splits on phones
  const HRS = (v) => String(RN.w.label('hoursPerMonth', v) || '').replace(/ /g, '\u00a0');
  function costVal(key, field, mods) {
    const C = RN.costs, r = C && C.get(key);
    if (!r) { console.warn('Unknown cost key', key); return ''; }
    const ft = r.fullTime || {};
    let v;
    if (field === 'answer') v = C.answer(key);
    else if (field === 'basis') v = C.basis(key);
    else if (field === 'tenure') v = ft.tenureMonths ? `About ${ft.tenureMonths} months` : '';
    else if (field === 'replace') v = ft.replace ? `Up to ${ft.replace.mult}x salary` : '';
    else if (field === 'firstYear') v = r.firstYear ? RN.fmt.k(r.firstYear) : '';
    else v = (r.text && r.text[field]) || '';
    if (mods.includes('bare')) v = v.replace(/\/(hr|month|year)( flat)?$/, '').replace(/ fixed$/, '').replace(/ hours a month$/, '').replace(/ a year$/, '');
    if (mods.includes('lower')) v = v.replace(/^About /, 'about ').replace(/^Up to /, 'up to ');
    return NB(v);
  }
  const costTok = (t) => String(t == null ? '' : t).replace(/\[\[cost:([\w.-]+?)\.(\w+)((?:\|\w+)*)\]\]/g, (m, k, f, mods) => costVal(k, f, mods.split('|').filter(Boolean)));

  // Browse hand-off (SPEC loop 10): same store keys Browse reads, same event Insights logs.
  // A single role category lands on that category's page (#browse.<cat>), the SEO role page.
  function goBrowse(o) {
    const f = {};
    Object.keys(o.filters || {}).forEach((k) => { const v = o.filters[k]; if (Array.isArray(v) ? v.length : v) f[k] = v; });
    RN.store.update((s) => { s.browse = Object.assign({}, s.browse, { q: o.q || '', tags: o.tags || [], filters: f, sort: o.sort || 'best' }); }, 'browse');
    RN.track('research_cta', { source: o.source || 'research', filters: f, q: o.q || '', tags: o.tags || [] });
    while (RN.ui.modalEl()) RN.ui.closeModal();
    const cats = f.roleCategories || [];
    RN.go(cats.length === 1 ? 'browse.' + cats[0] : 'browse');
  }
  RN.actions['rs-browse'] = (el) => {
    let f = {}, tags = [];
    try { f = JSON.parse(el.dataset.f || '{}'); } catch (e) { f = {}; }
    try { tags = el.dataset.tags ? JSON.parse(el.dataset.tags) : []; } catch (e) { tags = []; }
    goBrowse({ filters: f, tags, q: el.dataset.q || '', sort: el.dataset.sort || '', source: el.dataset.src });
  };
  // A real link to the role page (crawlable), with the same hand-off and tracking as the Browse buttons
  RN.actions['rs-browse-cat'] = (el) => goBrowse({ filters: { roleCategories: [el.dataset.cat] }, source: el.dataset.src });
  const browseBtn = (label, o, cls) => `<button type="button" class="${cls || 'btn'}" data-act="rs-browse" data-src="${esc(o.src || 'research')}" data-f="${jsonAttr(o.filters || {})}" data-tags="${jsonAttr(o.tags || [])}" data-q="${esc(o.q || '')}"${o.sort ? ` data-sort="${esc(o.sort)}"` : ''}>${esc(label)}${icon('arrow')}</button>`;

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
  function drawCharts(root, first) {
    RN.$$('[data-rs-chart]', root || document).forEach((el) => {
      const fn = chartFns[el.dataset.rsChart];
      if (!fn) return;
      const w = Math.max(240, Math.round(el.clientWidth || el.parentElement.clientWidth || 320));
      try { el.innerHTML = fn(w); } catch (e) { console.error(e); }
      // A chart draws once, the first time it scrolls into view (RN.chart output carries data-draw); a resize redraw is still
      if (first && RN.motion) RN.motion.draw(el, { key: 'rs-chart:' + el.dataset.rsChart });
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
  /* Motion (policy, Oct 14, 2026): the shared RN.motion helpers. Blocks marked data-rs-reveal get the one scroll reveal
     (only blocks still below the screen at the first scroll, 12px and 300ms, once per visit, never on a re-render), so
     nothing already on screen is hidden and faded back in. HTML bar charts (rate by seat, cost bars, findings meters,
     scorecard weights) carry data-draw and draw once when they first scroll into view. The diagnostic's leak pulse is
     the page's one looping element and marks the answer, so it stays (CSS, with a still ring under reduced motion). */
  let spyFn = null;
  function reveal(root) {
    if (!RN.motion) return;
    RN.motion.reveal(root || document, '[data-rs-reveal]', { key: 'rs-reveal' });
    RN.$$('[data-rs-draw]', root || document).forEach((el, i) => RN.motion.draw(el, { key: 'rs-draw:' + (el.id || el.dataset.rsDraw || i) }));
  }
  // Guide pages: the "On this page" list marks the section being read and fills a progress rule
  function tocSpy(root) {
    const btns = RN.$$('.rs-toc button[data-to]', root);
    const bar = RN.$('.rs-toc-prog i', root);
    const art = RN.$('.rs-art', root);
    if (!btns.length || !art) return;
    let raf = 0;
    const run = () => {
      raf = 0;
      let cur = null;
      btns.forEach((b) => { const s = document.getElementById(b.dataset.to); if (s && s.getBoundingClientRect().top < 160) cur = b; });
      btns.forEach((b) => b.classList.toggle('on', b === cur));
      if (bar) { const r = art.getBoundingClientRect(); const f = RN.clamp((window.innerHeight * 0.4 - r.top) / Math.max(1, r.height), 0, 1); bar.style.transform = `scaleY(${f.toFixed(3)})`; }
    };
    // A re-render (RN.rerender) mounts again: drop the last listener first so they never stack
    if (spyFn) window.removeEventListener('scroll', spyFn);
    spyFn = () => { if (!raf) raf = requestAnimationFrame(run); };
    window.addEventListener('scroll', spyFn, { passive: true });
    run();
  }
  function mountCommon(root) {
    lastW = window.innerWidth;
    drawCharts(root, true);
    window.addEventListener('resize', onResize);
    reveal(root);
    tocSpy(root);
  }
  function unmountCommon() {
    window.removeEventListener('resize', onResize);
    if (spyFn) { window.removeEventListener('scroll', spyFn); spyFn = null; }
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

  // Bowtie heights per stage, [left edge, right edge] as a share of full height: narrowing to the signature, widening after
  const BOW_H = { awareness: [1, 0.82], engage: [0.82, 0.65], qualify: [0.65, 0.49], commit: [0.49, 0.34], onboard: [0.34, 0.55], adopt: [0.55, 0.78], expand: [0.78, 1] };
  function bowtie(ix) {
    const st = journey();
    const H = BOW_H;
    const aggs = st.map((s) => agg(ix, null, s.name));
    const maxV = Math.max(1, ...aggs.map((a) => a.ver));
    const inset = (x) => (((1 - x) / 2) * 100).toFixed(1) + '%';
    const seg = (s, a) => {
      const hh = H[s.id] || [1, 1];
      const f = fill(a.ver, a.any, maxV, a.tags.length);
      return `<button type="button" class="rs-seg ${f.cls}" style="--a:${inset(hh[0])};--b:${inset(hh[1])};${f.style}" data-act="rs-fw-open" data-stage="${esc(s.name)}"
        aria-label="${esc(s.name)}: ${a.ver} operators with company-verified proof, ${a.any} claim work here. Open the stage.">
        <span class="rs-seg-shape" aria-hidden="true"></span>
        <span class="rs-seg-txt"><b>${esc(s.name)}</b><span class="rs-seg-n">${a.ver} verified</span><span class="rs-seg-sub">${a.any} claim</span></span>
      </button>`;
    };
    const before = st.filter((s) => s.side === 'before');
    const after = st.filter((s) => s.side !== 'before');
    return `<div class="rs-bow-wrap">
      <div class="rs-bow-sides" aria-hidden="true">${phaseRuns(before).map((r) => `<span class="label" style="flex:${r.n}">${esc(r.k)}</span>`).join('')}<span class="rs-bow-sides-k"></span>${phaseRuns(after).map((r) => `<span class="label" style="flex:${r.n}">${esc(r.k)}</span>`).join('')}</div>
      <div class="rs-bow">
        ${before.map((s, i) => (i === 0 || phaseOf(s.name) !== phaseOf(before[i - 1].name) ? `<span class="rs-bow-m label">${esc(phaseOf(s.name))}</span>` : '') + seg(s, aggs[st.indexOf(s)])).join('')}
        <div class="rs-knot" aria-hidden="true"><span class="rs-knot-dot">${icon('seal')}</span><span class="label">Signed</span></div>
        <span class="rs-bow-m label">Post-sale</span>
        ${after.map((s) => seg(s, aggs[st.indexOf(s)])).join('')}
      </div>
    </div>`;
  }

  function legend() {
    return `<div class="rs-legend" aria-label="Legend">
      <span><span class="rs-ramp" aria-hidden="true">${STEPS.map((p) => `<i class="rs-sw rs-sw-v" style="--rs-p:${p}%"></i>`).join('')}</span>Operators with company-verified proof, fewer to more</span>
      <span><i class="rs-sw rs-sw-c"></i>Self-claimed only</span>
      <span><i class="rs-sw rs-sw-o"></i>Open, no operators yet</span>
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
    const label = `${a.name} at ${s.name}: ${x.ver} operators with company-verified proof, ${x.any} claim work here, ${x.tags.length} focus areas`;
    if (mobile) {
      return `<button type="button" class="rs-mcell ${f.cls}" style="${f.style}" data-act="rs-fw-open" data-area="${esc(a.name)}" data-stage="${esc(s.name)}" aria-label="${esc(label)}">
        <span class="rs-mcell-sw" aria-hidden="true"></span>
        <span class="rs-mcell-name">${icon(a.icon)}<b>${esc(a.name)}</b></span>
        <span class="rs-mcell-n">${!x.any ? 'Open' : `<b>${x.ver}</b> verified · ${x.any} claim`}</span>
        ${icon('chev-right')}
      </button>`;
    }
    // One number per cell, the verified count; the claim count and focus areas show on hover and in the panel
    const tip = !x.any ? `${plural(x.tags.length, 'focus area')}, no operators yet` : `${x.ver} verified · ${x.any} claim · ${plural(x.tags.length, 'focus area')}`;
    return `<button type="button" class="rs-cell ${f.cls}" style="${f.style}" data-act="rs-fw-open" data-area="${esc(a.name)}" data-stage="${esc(s.name)}" aria-label="${esc(label)}" title="${esc(tip)}">
      ${!x.any ? '<span class="rs-cell-c rs-cell-none">Open</span>'
        : `<b class="rs-cell-n">${x.ver}</b><span class="rs-cell-c">${x.any} claim</span>`}
    </button>`;
  }
  function grid(ix) {
    const g = gridCells(ix);
    const js = journey();
    const desktop = `<div class="rs-grid" data-rs-reveal role="group" aria-label="GTM Framework: areas by stage. Each cell opens a panel.">
      <div class="rs-gh rs-gh-corner" aria-hidden="true"></div>
      ${phaseRuns(js).map((r, i) => `<div class="rs-gh rs-gh-side label${i ? ' is-after' : ''}" style="grid-column: span ${r.n}">${esc(r.k)}</div>`).join('')}
      <div class="rs-gsp" aria-hidden="true"></div>
      <div class="rs-gh rs-gh-side label is-all">Every stage</div>
      <div class="rs-gh rs-gh-corner"><span class="label">Area</span></div>
      ${js.map((s) => `<button type="button" class="rs-gh rs-gh-stage" data-act="rs-fw-open" data-stage="${esc(s.name)}">${esc(s.name)}</button>`).join('')}
      <div class="rs-gsp" aria-hidden="true"></div>
      <button type="button" class="rs-gh rs-gh-stage is-all" data-act="rs-fw-open" data-stage="Foundation">Foundation</button>
      ${g.areas.map((a) => { const t = agg(ix, a.name, null); return `<button type="button" class="rs-ga" data-act="rs-fw-open" data-area="${esc(a.name)}" title="${esc(a.def)}">${RN.ui.icoTile(a.icon, { size: 'sm', cls: 'rs-ga-ic' })}<span class="rs-ga-tx"><b>${esc(a.name)}</b><span class="rs-ga-d">${esc(a.def.split(':')[0])}</span><span class="rs-ga-n"><span><b class="tnum">${t.ver}</b> verified</span><span>${t.any} claim</span></span></span></button>
        ${js.map((s) => cellBtn(g, a, s)).join('')}
        <div class="rs-gsp" aria-hidden="true"></div>
        ${cellBtn(g, a, FOUNDATION)}`; }).join('')}
    </div>`;
    const cur = stageBy(fw.mStage) || journey()[2];
    const mobile = `<div class="rs-mgrid">
      <div class="rs-mstages" role="tablist" aria-label="Stage">
        ${allStages().map((s) => `<button type="button" class="chip chip-sm ${s.name === cur.name ? 'on' : ''}" role="tab" aria-selected="${s.name === cur.name}" data-act="rs-fw-mstage" data-stage="${esc(s.name)}">${esc(s.name)}</button>`).join('')}
      </div>
      <div class="rs-mhead"><span class="label">${esc(phaseOf(cur.name))}</span><p class="small muted">${esc(cur.what)}</p></div>
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
    const live = RN.model.ops.filter((o) => !o.hidden).length;
    out.push({ n: verTotal, d: live, dl: `of ${live} operator profiles`, v: String(verTotal), l: `${verTotal === 1 ? 'operator on the network has' : 'operators on the network have'} company-verified proof so far. ${where}`, act: `data-act="rs-fw-open" data-stage="${esc(topStage.s.name)}"`, cta: `Open ${topStage.s.name}` });
    const afterOps = new Set();
    Object.values(ix.cells).forEach((c) => { const st = stageBy(c.stage); if (st && st.side === 'after') c.ver.forEach((i) => afterOps.add(i)); });
    const afterClaim = new Set();
    Object.values(ix.cells).forEach((c) => { const st = stageBy(c.stage); if (st && st.side === 'after') c.any.forEach((i) => afterClaim.add(i)); });
    out.push({ n: afterOps.size, d: afterClaim.size, dl: `of ${afterClaim.size} who claim it`, v: String(afterOps.size), l: `${afterOps.size === 1 ? 'operator has' : 'operators have'} verified proof after the sale, while ${afterClaim.size} claim onboarding, adoption or expansion work. That is the thinnest proof on the map.`, act: 'data-act="rs-fw-open" data-stage="Adopt"', cta: 'Open Adopt' });
    let best = null;
    areas.forEach((a) => journey().forEach((s) => { const x = agg(ix, a.name, s.name); if (!best || x.any > best.any) best = x; }));
    if (best) out.push({ n: best.ver, d: best.any, dl: `${best.ver} of ${best.any} verified`, claim: true, v: String(best.any), l: `operators claim ${cellText(best.area + ' work', best.stage)}, the most crowded cell. Companies should ask for verified proof here before they hire.`, act: `data-act="rs-fw-open" data-area="${esc(best.area)}" data-stage="${esc(best.stage)}"`, cta: 'Open the cell' });
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
    const sub = `${plural(a.ver, 'operator')} with company-verified proof · ${a.any} claim work here`;
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
        <p class="rs-pn-skilled">${esc(st.skilled)}</p></div>` : ''}
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
    return { top, second: ranked[1] || null, ranked, cat };
  }

  function diagQuestion() {
    const i = diag.step;
    const q = DIAG[i];
    return `<div class="rs-dq" role="group" aria-labelledby="rs-dq-t">
      <div class="row between"><span class="step-count">Question ${i + 1} of ${DIAG.length}</span>${i ? `<button type="button" class="act rs-dq-back" data-act="rs-dg-back">${icon('arrow-left')}Back</button>` : ''}</div>
      <div class="stepper" aria-hidden="true">${DIAG.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <h3 class="h3 rs-dq-t" id="rs-dq-t">${esc(q.q)}</h3>
      <div class="rs-dq-opts" role="radiogroup" aria-labelledby="rs-dq-t">
        ${q.o.map((o, k) => `<button type="button" class="rs-dq-opt" role="radio" aria-checked="${diag.ans[i] === k}" data-act="rs-dg-pick" data-i="${k}"><span class="rs-dq-radio" aria-hidden="true"></span><span>${esc(o.l)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  /* The result's bowtie: the 7 stages as the bowtie, the 6 areas as lanes running through it. The leak cell is solid,
     its lane is tinted, stages before it fade as upstream and stages after it are hatched as downstream impact.
     Other cells the answers point to show as small hollow markers. Two drawings of the same model: horizontal for a
     wide card, vertical (stages top to bottom) when the card is narrow; CSS shows one. */
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const firstItem = (what) => { const t = String(what || '').split(/,\s*/)[0].replace(/\.$/, ''); return t.charAt(0).toLowerCase() + t.slice(1); };
  function diagImpact(r) {
    const st = journey();
    if (r.top.stage === 'Foundation') return `${r.top.area} work at Foundation serves every stage at once, so this gap shows up in all ${st.length}, from ${st[0].name} to ${st[st.length - 1].name}.`;
    const i = st.findIndex((s) => s.name === r.top.stage);
    const down = st.slice(i + 1);
    if (!down.length) {
      const parts = String(st[i].what || '').replace(/\.$/, '').split(/,\s*/);
      return `${st[i].name} is the last stage and it feeds the first, so a gap here costs the ${parts[parts.length - 1]} that bring the next companies in at ${st[0].name}.`;
    }
    const n = down[0];
    const rest = down.slice(1).map((s) => s.name);
    const cross = st[i].side === 'before' && down.some((s) => s.side !== 'before') && n.side === 'before' ? ', past the signature' : '';
    return `What leaks at ${st[i].name} never reaches ${n.name}, where the work is ${firstItem(n.what)}${rest.length ? `, and ${listAnd(rest)} inherit${rest.length === 1 ? 's' : ''} the gap${cross}` : ''}.`;
  }
  function diagBow(r) {
    const st = journey();
    const areas = R.areas().map((a) => a.name);
    const NA = areas.length;
    const ai = Math.max(0, areas.indexOf(r.top.area));
    const fnd = r.top.stage === 'Foundation';
    const li = fnd ? -1 : st.findIndex((s) => s.name === r.top.stage);
    const others = (r.ranked || []).slice(1).filter((c) => areas.includes(c.area));
    const role = (si) => (fnd ? 'is-all' : si < li ? 'is-up' : si === li ? 'is-leak' : 'is-down');
    const P = (pts) => pts.map((p) => p.map((v) => +v.toFixed(1)).join(',')).join(' ');
    const mid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

    // geometry(o) returns, per stage, its 4 corners and a cell(k) function for area lane k
    function draw(o) {
      const V = o === 'v';
      const segs = st.map((s, si) => {
        const h = BOW_H[s.id] || [1, 1];
        if (!V) {
          const X0 = 116, K = 22, W = (636 - X0 - K) / st.length, cy = 95, R0 = 64;
          const x0 = X0 + si * W + (s.side === 'before' ? 0 : K), x1 = x0 + W;
          const t0 = cy - h[0] * R0, t1 = cy - h[1] * R0, b0 = cy + h[0] * R0, b1 = cy + h[1] * R0;
          return { s, si, x0, x1, c: (x0 + x1) / 2, box: [[x0, t0], [x1, t1], [x1, b1], [x0, b0]],
            cell: (k) => [[x0, t0 + (k * (b0 - t0)) / NA], [x1, t1 + (k * (b1 - t1)) / NA], [x1, t1 + ((k + 1) * (b1 - t1)) / NA], [x0, t0 + ((k + 1) * (b0 - t0)) / NA]] };
        }
        const Y0 = 26, K = 14, Hh = 27, cx = 200, R0 = 114;
        const y0 = Y0 + si * Hh + (s.side === 'before' ? 0 : K), y1 = y0 + Hh;
        const l0 = cx - h[0] * R0, l1 = cx - h[1] * R0, q0 = cx + h[0] * R0, q1 = cx + h[1] * R0;
        return { s, si, y0, y1, c: (y0 + y1) / 2, box: [[l0, y0], [q0, y0], [q1, y1], [l1, y1]],
          cell: (k) => [[l0 + (k * (q0 - l0)) / NA, y0], [l0 + ((k + 1) * (q0 - l0)) / NA, y0], [l1 + ((k + 1) * (q1 - l1)) / NA, y1], [l1 + (k * (q1 - l1)) / NA, y1]] };
      });
      const pid = 'rs-dbh-' + o;
      const leakSeg = li >= 0 ? segs[li] : null;
      const leakPt = leakSeg ? mid(leakSeg.cell(ai)) : null;
      // Foundation: the marker sits on the lane at the signature
      const knotPt = (() => {
        const a = segs[3].cell(ai), b = segs[4].cell(ai);
        return V ? [(a[2][0] + a[3][0]) / 2, (a[2][1] + b[0][1]) / 2] : [(a[1][0] + b[0][0]) / 2, (a[1][1] + a[2][1]) / 2];
      })();
      const pin = leakPt || knotPt;
      const lanes = segs.map((g) => `<g class="rs-dbow-seg ${role(g.si)}">
        ${areas.map((_, k) => `<polygon class="rs-dbow-cell${k === ai ? ' is-lane' : ''}${k === ai && g.si === li ? ' is-hit' : ''}" points="${P(g.cell(k))}"/>`).join('')}
        ${role(g.si) === 'is-down' ? `<polygon class="rs-dbow-hatch" points="${P(g.box)}" fill="url(#${pid})"/>` : ''}
        <polygon class="rs-dbow-edge${g.si === li ? ' is-leak' : ''}" points="${P(g.box)}"/>
      </g>`).join('');
      const sec = others.map((c) => {
        const k = areas.indexOf(c.area);
        if (c.stage === 'Foundation') return `<g class="rs-dbow-sig is-lane">${segs.map((g) => `<polygon points="${P(g.cell(k))}"/>`).join('')}</g>`;
        const si = st.findIndex((s) => s.name === c.stage);
        if (si < 0) return '';
        const p = mid(segs[si].cell(k));
        return `<circle class="rs-dbow-sig" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${V ? 3.6 : 3.8}"/>`;
      }).join('');
      const marker = `<g class="rs-dbow-pin" transform="translate(${pin[0].toFixed(1)} ${pin[1].toFixed(1)})"><circle class="rs-dbow-ring" r="7"/><circle class="rs-dbow-ring rs-dbow-ring-2" r="7"/><circle class="rs-dbow-halo" r="7"/><circle class="rs-dbow-dot" r="3.2"/></g>`;
      const knot = V ? `<circle class="rs-dbow-knot" cx="${200}" cy="${(segs[3].y1 + segs[4].y0) / 2}" r="3"/>`
        : `<circle class="rs-dbow-knot" cx="${((segs[3].x1 + segs[4].x0) / 2).toFixed(1)}" cy="95" r="3"/>`;
      let labels;
      if (!V) {
        // Area lanes, named where they enter the bowtie; stage names below; upstream, leak and downstream brackets above
        const a0 = segs[0];
        const lanesTx = areas.map((a, k) => { const c = a0.cell(k); return `<text class="rs-dbow-area${k === ai ? ' is-on' : ''}" x="108" y="${((c[0][1] + c[3][1]) / 2 + 4).toFixed(1)}" text-anchor="end">${esc(a)}</text>`; }).join('');
        const stTx = segs.map((g) => `<text class="rs-dbow-st ${role(g.si)}" x="${g.c.toFixed(1)}" y="176" text-anchor="middle">${esc(g.s.name)}</text>`).join('')
          + `<text class="rs-dbow-sgn" x="${((segs[3].x1 + segs[4].x0) / 2).toFixed(1)}" y="189" text-anchor="middle">Signed</text>`;
        const br = (x0, x1, t, cls) => `<g class="rs-dbow-br ${cls}"><path d="M${(x0 + 2).toFixed(1)} 22 V16 H${(x1 - 2).toFixed(1)} V22"/><text x="${((x0 + x1) / 2).toFixed(1)}" y="10" text-anchor="middle">${t}</text></g>`;
        let brs;
        if (fnd) brs = br(segs[0].x0, segs[st.length - 1].x1, `${esc(r.top.area)} across every stage`, 'is-leak');
        else {
          brs = (li > 0 ? br(segs[0].x0, segs[li - 1].x1, 'Upstream', 'is-up') : '')
            + br(segs[li].x0, segs[li].x1, 'Leak', 'is-leak')
            + (li < st.length - 1 ? br(segs[li + 1].x0, segs[st.length - 1].x1, li === st.length - 2 ? 'Impact' : 'Downstream impact', 'is-down') : '');
        }
        labels = lanesTx + stTx + brs;
      } else {
        const stTx = segs.map((g) => `<text class="rs-dbow-st ${role(g.si)}" x="72" y="${(g.c + 4.5).toFixed(1)}" text-anchor="end">${esc(g.s.name)}</text>`).join('')
          + `<text class="rs-dbow-sgn" x="70" y="${((segs[3].y1 + segs[4].y0) / 2 + 3).toFixed(1)}" text-anchor="end">Signed</text>`;
        const c = segs[0].cell(ai);
        const ax = Math.min(316 - 30, Math.max(84 + 30, (c[0][0] + c[1][0]) / 2));
        labels = stTx + `<text class="rs-dbow-area is-on" x="${ax.toFixed(1)}" y="14" text-anchor="middle">${esc(r.top.area)}</text><path class="rs-dbow-tick" d="M${((c[0][0] + c[1][0]) / 2).toFixed(1)} 18 V24"/>`;
      }
      const vb = V ? '0 0 320 240' : '0 0 640 193';
      return `<svg class="rs-dbow-svg rs-dbow-${o}" viewBox="${vb}" role="img" aria-label="${esc(aria)}" focusable="false">
        <defs><pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6"/></pattern></defs>
        ${lanes}${knot}${sec}${labels}${marker}
      </svg>`;
    }
    // Other signals grouped by stage: "Lead & plan and Systems & data across every stage; Retain & expand at Adopt"
    const groups = [];
    others.forEach((c) => { const g = groups.find((x) => x.stage === c.stage); if (g) g.areas.push(c.area); else groups.push({ stage: c.stage, areas: [c.area] }); });
    const othersTx = groups.map((g) => cellText(listAnd(g.areas), g.stage)).join('; ');
    const up = fnd ? [] : st.slice(0, li).map((s) => s.name);
    const dn = fnd ? [] : st.slice(li + 1).map((s) => s.name);
    const aria = `Bowtie of the ${st.length} customer-journey stages with the ${NA} areas as lanes. ` + (fnd
      ? `The leak sits in the ${r.top.area} lane across every stage.`
      : `The leak sits at ${r.top.stage}, in the ${r.top.area} lane.${up.length ? ` Upstream: ${listAnd(up)}.` : ''}${dn.length ? ` Downstream impact: ${listAnd(dn)}.` : ''}`)
      + (others.length ? ` Other signals: ${othersTx}.` : '');
    return `<figure class="rs-dbow">
      ${draw('h')}${draw('v')}
      <figcaption class="rs-dbow-cap">
        <span class="rs-dbow-key" aria-hidden="true">
          ${fnd ? '<span class="rs-dbow-k-v"><i class="rs-dbow-sw is-leak"></i>Leak, every stage</span>' : `${li > 0 ? '<span class="rs-dbow-k-v"><i class="rs-dbow-sw is-up"></i>Upstream</span>' : ''}<span class="rs-dbow-k-v"><i class="rs-dbow-sw is-leak"></i>Leak</span>${li < st.length - 1 ? '<span class="rs-dbow-k-v"><i class="rs-dbow-sw is-down"></i>Downstream impact</span>' : ''}`}
          ${others.length ? `<span class="rs-dbow-k-s"><i class="rs-dbow-sw is-sig"></i>Also in your answers: ${esc(othersTx)}</span>` : ''}
        </span>
        <span class="rs-dbow-impact"><b>${fnd ? 'Across the journey' : 'Downstream impact'}</b> ${esc(diagImpact(r))}</span>
      </figcaption>
    </figure>`;
  }

  function diagResult() {
    const r = diagScore();
    if (!r.top) {
      return `<div class="rs-dr">
        <span class="eyebrow">Your result</span>
        <h3 class="h3 rs-dr-t">No clear leak. Your engine looks healthy.</h3>
        <p class="rs-dr-p">Companies in your position usually hire fractional help to scale what already works, often a new segment, a new channel or a larger team. Engagement Blueprints show what those engagements look like.</p>
        <div class="row" style="margin-top:22px"><a class="btn btn-leaf" href="#blueprints">Browse Engagement Blueprints${icon('arrow')}</a><button type="button" class="btn btn-line" data-act="rs-dg-reset">${icon('refresh')}Start over</button></div>
      </div>`;
    }
    const st = stageBy(r.top.stage);
    const cat = r.cat || AREA_META[r.top.area].cat;
    const ri = RIX().byCat[cat];
    const range = monthRange(cat, '40', '5m_20m');
    const catL = F.catLabel(cat);
    const bp = blueprintFor(cat);
    const saved = diag.saved && diag.saved.key === diagKey() ? diag.saved : null;
    return `<div class="rs-dr">
      <span class="eyebrow">Your result</span>
      <h3 class="h3 rs-dr-t">Your biggest leak is ${esc(cellText(r.top.area, r.top.stage))}.</h3>
      ${diagBow(r)}
      <p class="rs-dr-p">${esc(st ? st.skilled : '')}</p>
      <div class="rs-dr-grid">
        <div class="rs-dr-box"><span class="row between" style="--gap:8px"><span class="label">Who to hire</span>${ri ? illus() : ''}</span><b>A fractional ${esc(roleFor(cat))}</b><span class="small">${esc(catL)}${ri ? `, median ${esc(RN.fmt.rate(ri.p50))} on the Rate Index. At 40 hrs a month for a $5M to $20M company: ${esc(NB(range))}.` : '.'}</span></div>
        <div class="rs-dr-box"><span class="label">How to scope it</span><b>${esc(bp ? bp.title + ' Blueprint' : 'Start from an Engagement Blueprint')}</b><span class="small">Hours, term and a 30/60/90-day plan for this kind of work, ready to post as an engagement.</span></div>
      </div>
      <div class="row rs-dr-acts">
        <button type="button" class="btn btn-leaf" data-act="rs-dg-talk">Talk it through with our team${icon('arrow')}</button>
        ${browseBtn(`See ${catL} operators`, { filters: { roleCategories: [cat] }, src: 'framework_diagnostic' }, 'btn btn-line')}
      </div>
      <p class="small rs-dr-talk-note">${icon('check')}<span>We pass on this result, with the other signals, the role and the Blueprint, so you do not answer again.</span></p>
      <div class="row rs-dr-more">
        <a class="act rs-dr-reset" href="#${esc(bp ? bp.to : 'blueprints')}">${icon('doc')}${bp ? 'See the Blueprint' : 'Blueprints'}</a>
        <button type="button" class="act rs-dr-reset" data-act="rs-fw-open" data-area="${esc(r.top.area)}" data-stage="${esc(r.top.stage)}">${icon('grid')}Open this cell</button>
        ${saved ? `<span class="rs-dr-sent">${icon('check-circle')}Sent to ${esc(saved.email)}</span>` : `<button type="button" class="act rs-dr-reset" data-act="rs-dg-save">${icon('mail')}Email me this result</button>`}
        <button type="button" class="act rs-dr-reset" data-act="rs-dg-reset">${icon('refresh')}Start over</button>
      </div>
      <p class="tiny rs-dr-note">We record only the cell and role category until you send this result to our team or ask for the email. For the email, we keep your work email and company revenue range to send it.</p>
    </div>`;
  }
  const diagKey = () => diag.ans.join('-');
  /* Talk it through with our team: the result goes to Talk to us through RN.handoff (js/core/handoff.js) with the
     leak, its stage and the role it recommends, so the flow opens with the need answered and our team gets the
     context. The result travels as shown (leak, stage, role, the other signals, the Blueprint), never the raw answers;
     the note under the result says so. */
  function diagHandoff() {
    const r = diagScore();
    if (!r.top) return null;
    const cat = r.cat || AREA_META[r.top.area].cat;
    const role = roleFor(cat);
    const st = r.top.stage;
    const fnd = st === 'Foundation';
    const others = (r.ranked || []).slice(1);
    // The summary names at most two other areas; the details list every other signal
    const sec = others.length ? listAnd(Array.from(new Set(others.map((c) => c.area))).filter((a) => a !== r.top.area).slice(0, 2)) : '';
    const bp = blueprintFor(cat);
    const summary = (fnd ? `Biggest leak in ${r.top.area}, across every stage` : `Biggest leak at ${st}, in ${r.top.area}`) + (sec ? `, with secondary signals in ${sec}` : '');
    return {
      source: 'diagnostic',
      need: RN.handoff.needFor(cat, r.top.area),
      roleCategory: cat,
      role,
      summary,
      details: [
        { l: 'Biggest leak', v: cellText(r.top.area, st) },
        { l: 'Stage', v: fnd ? 'Foundation, every stage' : `${st} (${phaseOf(st)})` },
        { l: 'Role it recommends', v: `A fractional ${role} (${F.catLabel(cat)})` },
      ].concat(others.length ? [{ l: 'Other signals', v: others.map((c) => cellText(c.area, c.stage)).join('; ') }] : [], bp ? [{ l: 'Blueprint', v: bp.title }] : []),
    };
  }
  RN.actions['rs-dg-talk'] = () => {
    const p = diagHandoff();
    if (!p || !RN.handoff) { RN.go('talk'); return; }
    RN.track('research_cta', { source: 'framework_diagnostic', meta: { to: 'talk', area: p.details[0].v, roleCategory: p.roleCategory } });
    RN.handoff.go(p);
  };
  // Save the result by email (value: a reason to come back). Work email + the standard company revenue field.
  RN.actions['rs-dg-save'] = () => {
    const me = RN.me && RN.me();
    const co = (me && me.company) || {};
    RN.ui.modal({
      width: 480,
      title: 'Email me this result',
      sub: 'We send the cell, the role to hire, the Blueprint and three operators with proof there.',
      body: `<form id="rs-dg-form" data-submit="rs-dg-save" class="stack" style="--gap:18px" novalidate>
        ${RN.w.field('email', (me && me.email) || '', { name: 'email' })}
        ${RN.w.field('companyRevenue', co.revenueRange || '', { name: 'revenueRange' })}
        <button class="btn" type="submit">Email my result</button>
      </form>`,
    });
  };
  RN.submits['rs-dg-save'] = (form, data) => {
    const email = String(data.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { RN.ui.toast('Enter a work email so we can send your result.', { icon: 'info' }); const i = form.querySelector('input[name=email]'); if (i) i.focus(); return; }
    const rev = Array.isArray(data.revenueRange) ? data.revenueRange[0] : data.revenueRange;
    const r = diagScore();
    const cat = r.top ? (r.cat || AREA_META[r.top.area].cat) : null;
    const ops = r.top ? diagList(r).map((x) => x.op) : [];
    const bp = cat ? blueprintFor(cat) : null;
    const where = r.top ? cellText(r.top.area, r.top.stage) : 'No clear leak';
    const range = cat ? monthRange(cat, '40', rev || '5m_20m') : '';
    RN.track('diagnostic_save', { source: 'framework', meta: r.top ? { area: r.top.area, stage: r.top.stage, roleCategory: cat, revenueRange: rev || null } : { area: null, revenueRange: rev || null } });
    RN.mail(email, 'Your GTM Framework result', [
      `Your biggest leak: ${where}.`,
      cat ? `Who to hire: a fractional ${roleFor(cat)} (${F.catLabel(cat)}). Typical month at 40 hrs${rev ? ` for a ${RN.w.label('companyRevenue', rev)} company` : ''}: ${range}. ${NO_FEES}` : '',
      bp ? `Scope it: ${bp.title} Blueprint, revenuenomad.com/${bp.to.replace('.', '/')}` : '',
      ops.length ? `Operators with proof there: ${ops.map((o) => `${o.name} (${o.role})`).join(', ')}.` : '',
      'Retake it any time at revenuenomad.com/framework.',
    ].filter(Boolean).join('\n\n'), 'research');
    diag.saved = { key: diagKey(), email };
    RN.ui.closeModal();
    RN.ui.toast(`Result sent to ${esc(email)}`, { icon: 'mail' });
    paintDiag();
  };
  function diagList(r) {
    const cat = r.cat || AREA_META[r.top.area].cat;
    let list = topOps(r.top.area, r.top.stage, 3, cat);
    if (list.length < 3) list = list.concat(topOps(r.top.area, null, 6, cat).filter((x) => !list.some((y) => y.op.id === x.op.id))).slice(0, 3);
    if (list.length < 3) list = list.concat(RN.model.search({ filters: { roleCategories: [cat] }, sort: 'ris' }).map((x) => ({ op: x.op, hits: [], v: [] })).filter((x) => !list.some((y) => y.op.id === x.op.id))).slice(0, 3);
    return RN.model.notFirst(list);
  }
  function diagOps() {
    const r = diagScore();
    if (!r.top) return '';
    const cat = r.cat || AREA_META[r.top.area].cat;
    const list = diagList(r);
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
    return `<div class="rs rs-fw">
    <header class="wrap phead rs-head">
      ${crumbs([{ l: 'GTM Framework' }])}
      <span class="eyebrow">Revenue Nomad GTM Framework</span>
      <div class="rs-fw-hero">
        <div>
          <h1 class="h1">Every revenue problem has <span class="serif">an address</span><span class="vm">.</span></h1>
          <p class="lede">The framework places all go-to-market work on two lenses: the area of work, and the stage of the customer's journey it changes. Every focus area, profile, company review and Engagement Blueprint on Revenue Nomad uses it, so a company's problem and an operator's proof are described in the same words.</p>
        </div>
        <dl class="rs-fw-kpis">
          <div><dt>Areas of work</dt><dd class="num">6</dd></div>
          <div><dt>Customer-journey stages</dt><dd class="num">7</dd></div>
          <div><dt>Focus areas mapped</dt><dd class="num">${RN.fmt.int(libN)}</dd></div>
          <div><dt>Operators with company-verified proof</dt><dd class="num">${RN.fmt.int(ix.verOps.size)}</dd></div>
        </dl>
      </div>
    </header>

    <section class="wrap section-sm rs-sec" aria-labelledby="rs-bow-t">
      <div class="rs-sec-hd">
        <div><span class="eyebrow">The customer journey</span><h2 class="h2" id="rs-bow-t">Seven stages, one bowtie</h2></div>
        <p class="body">Four stages narrow toward the signature. Three widen after it, as a customer adopts and grows. Shading shows where operators on the network have company-verified proof. Select a stage for what good looks like there.</p>
      </div>
      ${bowtie(ix)}
      ${legend()}
    </section>

    <section class="wrap section-sm rs-sec" aria-labelledby="rs-grid-t">
      <div class="rs-sec-hd">
        <div><span class="eyebrow">The map</span><h2 class="h2" id="rs-grid-t">Six areas across seven stages</h2></div>
        <p class="body">Each number is the operators with company-verified proof in that cell<span class="rs-hover-only">; hover for how many claim the work</span>. Select a cell, a stage or an area to see what good looks like, the focus areas that live there and who is strongest. Foundation holds the work every stage runs on.</p>
      </div>
      <div class="rs-grid-box" data-rs-grid>${grid(ix)}</div>
      ${legend()}
    </section>

    <section class="wrap section-sm rs-sec rs-find" aria-labelledby="rs-find-t">
      <h2 class="sr-only" id="rs-find-t">What the map shows today</h2>
      <div class="rs-finds" data-rs-draw="finds">
        <div class="rs-finds-hd"><span class="eyebrow">What the map shows today</span><p class="small muted">Computed live from ${RN.fmt.int(RN.model.ops.length)} operator profiles${MK().network && MK().network.operators ? `<span data-proto> (this prototype loads a sample of the ${esc(MK().network.operators)} on the network)</span>` : ''}. A focus area counts as verified once a company review rated 4.0 or higher confirms it.</p></div>
        ${finds.map((f, i) => `<div class="rs-fnd" style="--i:${i}"><span class="rs-fnd-v num">${esc(f.v)}</span>
          ${f.d ? `<span class="rs-fnd-m${f.claim ? ' is-claim' : ''}" role="img" aria-label="${esc(f.dl)}"><span class="rs-fnd-bar"><i data-draw="x" style="width:${Math.max(2, Math.round((f.n / f.d) * 100))}%"></i></span><span class="tiny muted tnum">${esc(f.dl)}</span></span>` : ''}
          <p>${esc(f.l)}</p><button type="button" class="act" ${f.act}>${esc(f.cta)}${icon('arrow')}</button></div>`).join('')}
      </div>
    </section>

    <section class="night rs-diag-band" id="rs-diag" aria-labelledby="rs-diag-t">
      <svg class="rs-diag-bow" viewBox="0 0 720 260" aria-hidden="true" focusable="false">${(() => {
        // The bowtie's outline: four segments narrowing to the signature, three widening after it
        const L = [[0, 0, 260], [80, 22, 238], [160, 44, 216], [240, 66, 194], [320, 88, 172]];
        const R = [[400, 88, 172], [506, 44, 216], [613, 22, 238], [720, 0, 260]];
        const segs = (pts) => pts.slice(0, -1).map((a, i) => { const b = pts[i + 1]; return `<polygon points="${a[0]},${a[1]} ${b[0]},${b[1]} ${b[0]},${b[2]} ${a[0]},${a[2]}"/>`; }).join('');
        return segs(L) + segs(R) + '<circle cx="360" cy="130" r="22"/>';
      })()}</svg>
      <div class="wrap rs-diag">
        <div class="rs-diag-intro">
          <span class="eyebrow">Self-diagnostic for companies</span>
          <h2 class="h2" id="rs-diag-t">Where is your revenue engine leaking?</h2>
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

    <section class="wrap section-sm rs-sec rs-method" aria-labelledby="rs-m-t">
      <div class="rs-method-in">
        <div><span class="eyebrow">How the map is built</span><h2 class="h3" id="rs-m-t">Method and sources</h2></div>
        <div class="prose small">
          <p>Every focus area in the <a href="#library">Fit Tag Library</a> carries one area and one stage. Counts on this page come from the ${RN.fmt.int(RN.model.ops.length)} operator profiles on the network. An operator counts as <b>claiming</b> a cell when they list a focus area in it, and as <b>company-verified</b> when a company review rated 4.0 or higher confirms that focus area.</p>
          <p>Revenue Nomad Research reviewed the stage of ${Object.keys(CURATED).length} focus areas in this edition so each sits at the stage it changes: brand and content work at Awareness, pricing and negotiation at Commit, onboarding at Onboard, expansion selling at Expand. Areas were not changed.</p>
          <p>Stage copy is Revenue Nomad's own. Cite it as "Revenue Nomad GTM Framework, 2026".</p>
        </div>
        <div class="rs-method-links">
          <a class="rs-link" href="#library">${icon('list')}<span><b>Fit Tag Library</b><small>Every focus area, defined</small></span>${icon('arrow')}</a>
          <a class="rs-link" href="#guides">${icon('book')}<span><b>Guides</b><small>Straight answers with the numbers</small></span>${icon('arrow')}</a>
          <a class="rs-link" href="#blueprints">${icon('doc')}<span><b>Engagement Blueprints</b><small>Scoped engagements by cell</small></span>${icon('arrow')}</a>
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
    let vShow = RN.model.notFirst(r.verOps).slice(0, 4);
    if (vShow.length && RN.model.isFounder(vShow[0])) vShow = [];
    let opAct = '';
    if (me) {
      opAct = mine
        ? (mine.tier === 'claimed' ? `<button type="button" class="act" data-act="go" data-to="studio.credibility">${icon('seal')}Ask a company to verify</button>` : '')
        : `<button type="button" class="act" data-act="rs-add-tag" data-tag="${esc(r.name)}">${icon('plus')}Add to my profile</button>`;
    }
    return `<article class="rs-tag" id="rs-tag-${esc(RN.slug(r.name))}">
      <button type="button" class="rs-tag-hit" data-act="rs-browse" data-src="library" data-f="{}" data-tags="${jsonAttr([r.name])}" data-q="" aria-label="Find operators for ${esc(r.name)}"></button>
      <div class="rs-tag-main">
        <h3 class="rs-tag-name">${esc(r.name)}${mine ? `<span class="pill ${mine.tier === 'claimed' ? 'pill-line' : 'pill-good'} rs-tag-mine">${mine.tier === 'claimed' ? 'On your profile' : 'Yours, verified'}</span>` : ''}</h3>
        ${r.def ? `<p class="rs-tag-def">${esc(r.def)}</p>` : ''}
        <div class="rs-tag-meta">
          <span class="rs-tag-cat">${esc(F.catLabel(r.cat))}${r.g ? ` · ${esc(r.g)}` : ''}</span>
          ${r.area ? `<button type="button" class="pill pill-accent rs-chip-b" data-act="rs-lib-open" data-area="${esc(r.area)}" title="Show focus areas in ${esc(r.area)}">${esc(r.area)}</button>` : ''}
          <button type="button" class="pill pill-line rs-chip-b" data-act="rs-fw-open" data-area="${esc(r.area)}" data-stage="${esc(r.stage)}" title="Open this cell in the GTM Framework">${icon('grid')}${esc(r.stage)}</button>
        </div>
      </div>
      <div class="rs-tag-stats">
        <div class="rs-tag-n">${r.any ? `<span><b class="num">${r.any}</b> ${r.any === 1 ? 'operator' : 'operators'}</span><span class="${r.ver ? 'accent' : 'muted'}">${r.ver ? icon('check-circle') : ''}<b class="num">${r.ver}</b> company-verified</span>` : '<span class="muted">No operators yet</span>'}</div>
        ${vShow.length ? `<div class="rs-tag-vops"><span class="rs-tag-faces">${vShow.map((op) => `<a href="#op.${esc(op.slug)}" title="${esc(op.name)}, verified by a company">${RN.ui.avatar(op, 'ava-sm')}</a>`).join('')}</span><span class="tiny muted">Verified by companies</span></div>` : ''}
        ${r.demand ? `<div class="rs-tag-d">${icon('trend-up')}<span><b class="tnum">${RN.fmt.int(r.demand)}</b> company searches / mo</span>${gap ? `<span class="rs-thin">${icon('info')}Proof is thin</span>` : ''}</div>` : ''}
      </div>
      <div class="rs-tag-acts">
        ${opAct}
        <span class="rs-tag-go" aria-hidden="true"><span>Find operators</span>${icon('chev-right')}</span>
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
        let faces = [];
        cr.forEach((r) => r.verOps.forEach((op) => { if (!faces.includes(op)) faces.push(op); }));
        faces = RN.model.notFirst(faces);
        // A strip whose only face is the founder would make him the face of the category: leave it out
        if (faces.length && RN.model.isFounder(faces[0])) faces = [];
        const used = cr.filter((r) => r.any).length;
        return `<section class="rs-lib-cat">
          <div class="rs-lib-cat-hd">
            <h2 class="h3">${esc(F.catLabel(c))}</h2>
            <span class="small muted">${plural(cr.length, 'focus area')} · ${ver} company-verified</span>
            <span class="rs-lib-use" role="img" aria-label="${used} of ${cr.length} in use on live profiles"><span class="rs-lib-use-bar"><i style="width:${Math.max(2, Math.round((used / cr.length) * 100))}%"></i></span><span class="tiny muted">${used} in use</span></span>
            ${faces.length ? `<span class="rs-lib-faces" title="Operators with company-verified proof in ${esc(F.catLabel(c))}">${faces.slice(0, 5).map((op) => RN.ui.avatar(op, 'ava-sm', { decorative: true })).join('')}${faces.length > 5 ? `<span class="rs-lib-more">+${faces.length - 5}</span>` : ''}</span>` : ''}
            <button type="button" class="act" data-act="rs-lib-cat-set" data-cat="${esc(c)}">Show all ${cr.length}${icon('arrow')}</button>
          </div>
          <div class="rs-tags rs-tags-ov card">${cr.slice(0, 3).map(tagRow).join('')}</div>
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
    const gd = RN.$('#rs-lib-guides');
    if (gd) gd.innerHTML = libGuides();
  }
  /* Guides for the work on screen: the role categories that own most of the filtered focus areas
     (the whole library when nothing is filtered), cost guide first. Links to real #guide.<id> routes. */
  function libGuides() {
    const rows = libFilter(libRows(netIndex(), {}));
    const n = {};
    rows.forEach((r) => { if (r.cat) n[r.cat] = (n[r.cat] || 0) + 1; });
    let cats = Object.keys(n).sort((a, b) => n[b] - n[a]);
    if (lib.cat) cats = [lib.cat].concat(cats.filter((c) => c !== lib.cat));
    else if (lib.area && !lib.stage && AREA_META[lib.area]) cats = [AREA_META[lib.area].cat].concat(cats.filter((c) => c !== AREA_META[lib.area].cat));
    const out = [];
    cats.forEach((c) => { R.guidesFor(c, 2).forEach((g) => { if (out.length < 3 && !out.includes(g)) out.push(g); }); });
    if (!out.length) return '';
    const what = lib.stage && lib.area ? cellText(lib.area, lib.stage) : lib.stage ? `${lib.stage === 'Foundation' ? 'Foundation work' : 'the ' + lib.stage + ' stage'}` : lib.area ? lib.area : lib.cat ? F.catLabel(lib.cat) : lib.q ? `“${lib.q}”` : 'this work';
    return `<nav class="rs-lg" aria-label="Guides on ${esc(what)}">
      <span class="label">Guides on ${esc(what)}</span>
      <div class="rs-lg-list">${out.map((g) => `<a class="rs-lg-a" href="#guide.${esc(g.id)}">${icon('book')}<span>${esc(g.title)}</span>${icon('arrow')}</a>`).join('')}</div>
    </nav>`;
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
    RN.ui.toast(`Added “${esc(t)}” to your profile as self-claimed. A company review verifies it.`, { ms: 4200, action: { label: 'Ask a company', act: 'go', attrs: 'data-to="studio.credibility"' } });
    RN.rerender();
  };

  function curveCard() {
    const rows = [];
    for (let r = 0; r <= 10; r++) rows.push({ label: r === 10 ? '10+' : String(r), value: RN.model.tagScore(r), hi: r === 1 || r === 5 });
    return `<div class="card rs-curve">
      <div class="card-hd"><div><h3>How a focus area gets verified</h3><p class="sub">Score of one focus area by the number of company reviews that confirm it</p></div></div>
      ${chartSlot('curve', (w) => RN.chart.columns(rows, { w, h: 196, fmt: (n) => String(n), label: 'Focus area score by company reviews' }))}
      <p class="tiny muted rs-curve-x">Company reviews rated 4.0 or higher that confirm the focus area</p>
      <ol class="rs-steps">
        <li><b>0 reviews: self-claimed.</b> The operator added it. It shows with a dashed outline and counts only a little in search.</li>
        <li><b>1 review: verified at 50.</b> A company confirmed it in a CORE review. Each further review adds points: 60, 70, 80.</li>
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
      <div class="card-hd"><div><h3>Where companies search and proof is thin</h3><p class="sub">Monthly company searches vs operators with company-verified proof</p></div>${illus()}</div>
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
      <p class="tiny muted" style="margin-top:14px">${me ? 'Do this work? Add the tag, then ask a past company to confirm it in a review.' : 'Companies: these are the focus areas where a verified operator is hardest to find. Talk to us and we will source one.'}</p>
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
      <h1 class="h1">The shared vocabulary of <span class="serif">fractional GTM work</span><span class="vm">.</span></h1>
      <p class="lede">Focus areas (fit tags) name the specific work an operator does. Operators add them to their profiles, companies filter by them, and a company review turns a claim into proof. One list, used on every profile, posted engagement and review.</p>
      <div class="stats-row rs-kpis" style="--cols:4">
        <div class="stat"><span class="stat-v">${RN.fmt.int(libN)}</span><span class="stat-l">Focus areas, ${groupsN} groups</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(claims)}</span><span class="stat-l">Focus areas listed on operator profiles</span></div>
        <div class="stat"><span class="stat-v">${RN.fmt.int(verified)}</span><span class="stat-l">Confirmed by a company review</span></div>
        <div class="stat"><span class="stat-v">${Object.values(ix.tags).filter((t) => t.any.length).length}</span><span class="stat-l">In use on live profiles</span></div>
      </div>
    </header>

    <section class="wrap rs-sec-sm" id="rs-lib-browser" aria-labelledby="rs-lib-t">
      <h2 class="sr-only" id="rs-lib-t">Browse the library</h2>
      <div class="rs-lib-bar">
        <div class="input-wrap rs-lib-search">${icon('search')}<input class="input" type="search" value="${esc(lib.q)}" placeholder="Search ${RN.fmt.int(libN)} focus areas" aria-label="Search focus areas" data-input="rs-lib-q" autocomplete="off"></div>
        <div class="rs-lib-cats" data-deselect><span class="label">${esc(F.roleCategory.label)}</span>${RN.w.control('roleCategory', lib.cat, { name: 'rsLibCat', id: 'rs-lib-cat', change: 'rs-lib-cat' })}</div>
        <div class="rs-lib-meta">
          <span class="row rs-lib-count-row" style="--gap:10px"><span class="small" id="rs-lib-count" aria-live="polite">${esc(r.count)}</span>${illus()}</span>
          <div class="row" style="--gap:10px"><span id="rs-lib-active" class="row" style="--gap:8px">${activeChips()}</span>
          <div class="seg" role="group" aria-label="Sort">${sortBtn('used', 'Most proven')}${sortBtn('demand', 'Most searched')}${sortBtn('az', 'A to Z')}</div></div>
        </div>
      </div>
      <div id="rs-lib-guides" class="rs-lib-guides">${libGuides()}</div>
      <div id="rs-lib-results" class="rs-lib-results">${r.html}</div>
    </section>

    <section class="wrap rs-sec-sm rs-lib-how" aria-label="How proof works">
      <div class="grid g-2 rs-lib-top">${curveCard()}${gapCard(ix)}</div>
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
  // Same formula and rounding as the Rate Index estimator (RN.model.monthlyRange, $500 steps) so numbers agree across surfaces
  function monthRange(cat, hours, rev) {
    if (RN.model.monthlyRange) return RN.model.monthlyRange(cat, rev, hours).label;
    const b = RIX().byCat[cat] || RIX().byCat.sales_leadership;
    const h = hoursNum(hours), m = mult(rev);
    return RN.fmt.moRange(r500(b.p25 * m * h), r500(b.p75 * m * h));
  }
  const rateNote = () => `<p class="rs-src">${icon('info')}<span>Rates come from the Rate Index: the middle half of hourly rates for the role, times the hours. ${esc(NO_FEES)}</span>${illus()}</p>`;
  // Monthly table for a role category at a $5M to $20M company. The rate is the price (no fees for companies).
  const monthTable = (cat, hrs) => tbl(['Available time', 'Typical month'], hrs.map((h) => [esc(HRS(h)), esc(NB(monthRange(cat, h, '5m_20m')))])) + rateNote();
  const HOURS = { h_under_20: '19', h_20: '20', h_40: '40', h_60: '60', h_80: '80', h_100: '100', h_160: '160' };
  const hoursRows = () => REP().hours.map((r) => ({ code: HOURS[r.h] || r.h, v: r.v }));
  const sumStat = (re, dflt) => { const x = (REP().summary || []).find((s) => re.test(s.l)); return x ? x.v : dflt; };
  const trig = (re) => { const x = (REP().triggers || []).find((t) => re.test(t.l)); return x ? x.v : 0; };
  const yoy = () => { const x = (REP().summary || []).find((s) => /year over year/i.test(s.l)); const m = x && x.l.match(/up (\d+%)/i); return m ? '+' + m[1] : '+9%'; };
  // Where a key number comes from: only published research figures carry a Share pill (never product facts or sample counts)
  const SRC_REP = () => `State of Fractional GTM ${REP().year}`;
  const SRC_RI = () => `Rate Index, ${RN.contrib ? RN.contrib.indexLabel().replace(/ index$/, '') : 'latest quarter'}`;
  const latestMedian = () => { const t = RIX().trend || []; return t.length ? t[t.length - 1].v : 240; };
  // Tables with 3+ columns stack into labelled rows on phones (data-l carries the column label)
  // Phones: short numeric tables stay tables (rs-tbl-num); only wide tables or ones with text cells (rs-tbl-l) stack
  const tbl = (head, rows, cls) => `<div class="tbl-wrap rs-tbl ${head.length > 4 || (head.length > 2 && /\brs-tbl-l\b/.test(cls || '')) ? 'rs-tbl-stack' : head.length > 2 ? 'rs-tbl-num' : ''}"><table class="tbl ${cls || ''}"><thead><tr>${head.map((x, i) => `<th class="${i ? 'r' : ''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}" data-l="${esc(head[i] || '')}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const src = (t) => `<p class="rs-src">${icon('info')}<span>${t}</span></p>`;
  // Every chart hands its cut to Browse (SPEC loop 10)
  const chartGo = (label, o) => `<p class="rs-chart-go">${browseBtn(label, o, 'act')}</p>`;
  const L = (to, t) => `<a href="#${esc(to)}">${esc(t)}</a>`;

  // Client guides are grouped by function, the way the function homes and the content playbook split the work
  const GROUPS = [
    { k: 'sales', l: 'Sales leadership', d: 'Hiring, cost and the first 90 days with a fractional VP of Sales, sales director or CRO.', home: 'hire-fractional-sales-vp', cat: 'sales_leadership' },
    { k: 'revops', l: 'RevOps', d: 'When a SaaS company needs RevOps, what a fractional RevOps leader fixes and why forecasts miss.', home: 'fractional-revops', cat: 'revenue_operations' },
    { k: 'marketing', l: 'Marketing', d: 'Vetting a fractional CMO, what one costs and how it compares with an agency or a full-time hire.', home: 'fractional-marketing-leadership', cat: 'marketing' },
    { k: 'costs', l: 'What each role costs', d: 'Rates for every role category, from our 2026 engagements where we have them and the Rate Index for the rest.' },
    { k: 'operators', l: 'For operators', d: 'Pricing your work and winning companies, with or without a marketplace intro.' },
    { k: 'methods', l: 'About our methods', d: 'How Revenue Nomad measures reputation, collects company reviews and how to read the proof on a profile.' },
  ];
  const CLIENT_GROUPS = ['sales', 'revops', 'marketing', 'costs'];
  R.isClientGuide = (g) => !!g && CLIENT_GROUPS.includes(g.group);

  const GUIDES = [
    {
      slug: 'how-to-scope-a-fractional-sales-engagement', bp: 'vp-sales', group: 'sales', updated: '2026-09-05', mins: 6, cat: 'sales_leadership', opsQ: 'sales playbook',
      q: 'How do you scope a fractional sales engagement?',
      answer: () => ['Scope it around one measurable outcome, a fixed number of hours a month and an initial term, usually three to six months.', 'Before day one, agree the 90-day deliverables and who the operator reports to.'],
      stats: () => { const hrsTop = hoursRows().slice().sort((a, b) => b.v - a.v)[0]; const term = REP().term || []; const tTop = term.slice().sort((a, b) => b.v - a.v)[0]; return [{ v: RN.w.label('hoursPerMonth', hrsTop.code), l: `Most common size (${hrsTop.v}% of engagements)`, src: SRC_REP() }, { v: tTop ? tTop.l : '3 to 6 mo', l: `Most common initial term (${tTop ? tTop.v : 38}%)`, src: SRC_REP() }, { v: sumStat(/Median engagement length/i, '6.4 mo'), l: 'Median engagement length', src: SRC_REP() }]; },
      sections: () => {
        const hRows = hoursRows().map((r) => ({ label: RN.w.label('hoursPerMonth', r.code), value: r.v, hi: r.code === '40' }));
        const term = REP().term || [];
        return [
          { id: 'outcome', h: 'Start with the outcome', html: `<p>Write the outcome before the title. Describe the result you want in 90 days in a sentence a board member would understand, for example: "A written sales process, two reps hired and ramping, and a forecast within 10% of actuals."</p>
            <p>Then pick the one number you will review every month. Pipeline created, win rate, ramp time and forecast accuracy all work. Revenue alone does not, because it lags the work by a quarter or more.</p>` },
          { id: 'type', h: 'Pick the engagement type', html: `<p>Revenue Nomad uses four engagement types on every profile and every engagement a company posts:</p>
            <dl class="rs-dl">${F.engagementTypes.options.map((o) => `<div><dt>${esc(o.l)}</dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>` },
          { id: 'hours', h: 'Choose hours and term', html: `<p>Most engagements run 20 to 59 hours a month. Buy fewer hours than you think for the first 90 days: the operator spends the first weeks learning, and adding hours later is easy.</p>
            ${chartSlot('g3-hours', (w) => bars(hRows, { fmt: (n) => n + '%', label: 'Share of engagements by available time' }, w))}
            ${src('Share of fractional GTM engagements by hours a month, State of Fractional GTM 2027 survey. Illustrative.')}
            ${chartGo(`Browse operators with ${HRS('40')} or more available`, { filters: { hoursPerMonth: ['40'] }, src: 'guide_chart_hours' })}
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
        { q: 'Should I pay hourly or a monthly retainer?', a: 'Most operators price per hour and bill a fixed monthly retainer for an agreed block of hours. Project engagements, with a fixed scope and price, are priced per project.' },
        { q: 'What if the scope changes halfway through?', a: 'Review scope at day 30 and day 60. Changing hours or outcomes at those points is normal and cheaper than pushing through the wrong plan.' },
        { q: 'Can I post the scope and get matched?', a: 'Yes. Post an engagement from a Blueprint and Revenue Nomad ranks operators against it using the same fields as their profiles. Posting is free, like everything else for companies.' },
      ],
      cta: { label: 'Post an engagement', to: 'engagement.new' },
    },
    {
      slug: 'fractional-revops-first-90-days', bp: 'vp-revops', group: 'revops', updated: '2026-08-29', mins: 6, cat: 'revenue_operations', opsQ: 'RevOps',
      q: 'What does a fractional RevOps leader do in the first 90 days?',
      answer: () => ['In the first 30 days a fractional RevOps leader audits the CRM, stack and reporting.', 'By day 90 they have fixed the data model, stages and routing, and shipped the dashboards leadership uses.'],
      stats: () => { const b = RIX().byCat.revenue_operations; return [{ v: hr(b.p50) + '/hr', l: 'Median rate, Revenue Operations', src: SRC_RI() }, { v: monthRange('revenue_operations', '40', '5m_20m').replace(/\/month$/, ''), l: 'Typical month at 40 hrs', src: SRC_RI() }, { v: String((REP().intent || []).find((x) => x.cat === 'revenue_operations') ? REP().intent.find((x) => x.cat === 'revenue_operations').v + '%' : '22%'), l: 'Of companies plan to hire RevOps in 12 months', src: SRC_REP() }]; },
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
        { id: 'cost', h: 'What it costs', html: `<p>Revenue Operations has a median of ${hr(RIX().byCat.revenue_operations.p50)} an hour on the Rate Index. At 40 hours a month for a $5M to $20M company, a typical range is ${monthRange('revenue_operations', '40', '5m_20m')}, and that is the whole cost: companies pay no fees. Many RevOps engagements drop to 20 hours after the rebuild, at ${monthRange('revenue_operations', '20', '5m_20m')}.</p>` },
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
      slug: 'evaluate-fractional-operator-track-record', group: 'methods', updated: '2026-09-15', mins: 7, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How do you evaluate a fractional operator\'s track record?',
      answer: () => ['Look for proof they have done the same work at your stage and deal size, confirmed by those companies.', 'On Revenue Nomad that means company-verified focus areas, CORE reviews and Engagement History.'],
      stats: () => { const h = (REP().hindsight || [])[0]; return [{ v: h ? h[2] : '81%', l: 'Of companies say stage fit mattered most, in hindsight', src: SRC_REP() }, { v: sumStat(/Rehire rate/i, '2.4x'), l: 'Rehire rate with 3+ verified reviews', src: SRC_REP() }, { v: '4.0+', l: 'Review rating needed to verify a focus area' }]; },
      sections: () => [
        { id: 'hindsight', h: 'What companies wish they had checked', html: `<p>We asked companies what they weighed when they hired a fractional leader, and what they would weigh now.</p>
          ${(REP().hindsight || []).length ? tbl(['Factor', 'Weighed at hire', 'Would weigh now'], REP().hindsight.map((r) => [esc(r[0]), esc(r[1]), `<b>${esc(r[2])}</b>`])) : ''}
          ${src('State of Fractional GTM 2027 survey of companies that hired a fractional leader in the last 18 months. Illustrative.')}
          <p>Stage and deal-size fit came first by a wide margin. Brand-name employers came last.</p>` },
        { id: 'fit', h: 'Check stage and deal-size fit', html: `<p>Compare the operator's ${esc(F.revenueRange.label.toLowerCase())} and ${esc(F.employeeRange.label.toLowerCase())} with yours, then read their Engagement History for companies like yours. Signed-in companies see Match Signals on every profile, scored against the company profile they filled in once.</p>` },
        { id: 'verified', h: 'Separate verified from self-claimed', html: `<p>Every focus area on a profile is either <b>self-claimed</b> (dashed outline) or <b>company-verified</b> (solid, with a check). A focus area verifies when a company review rated 4.0 or higher confirms it; five or more make it Expert. The ${L('library', 'Fit Tag Library')} shows how many operators hold each one verified.</p>` },
        { id: 'reviews', h: 'Read the reviews the right way', html: `<p>CORE reviews rate four things. Look for the one that matters most for your seat:</p>
          <dl class="rs-dl">${F.coreDims.options.map((o) => `<div><dt>${esc(o.l)}</dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>
          <p>Then read "Would hire again". A yes there is the strongest single signal on a profile. ${L('guide.what-is-core', 'What is CORE?')} explains the questions.</p>` },
        { id: 'questions', h: 'Questions to ask on the first call', html: `<ol>
          <li>Tell me about a company at our stage where this worked. What did you ship in the first 90 days?</li>
          <li>Where did it not work, and what did you change?</li>
          <li>How many companies do you carry, and which hours would be ours?</li>
          <li>How will you report progress, and how often?</li>
          <li>Can I speak with the company from that engagement?</li></ol>` },
      ],
      faq: () => [
        { q: 'What is a good Reputation Index score?', a: 'Tiers start at 50 (Emerging). Scores of 70 and above (Trusted) mean repeat engagements and consistently strong company reviews.' },
        { q: 'Can an operator pay to raise their score or verify a focus area?', a: 'No. Only company reviews, verified engagements and a complete profile move the score, and only reviews rated 4.0 or higher verify a focus area.' },
        { q: 'Should I ask for references if a profile has verified reviews?', a: 'Yes, for the engagement most like yours. Verified reviews tell you the work happened; a call tells you how it would go at your company.' },
      ],
      cta: { label: 'Browse operators, highest Reputation Index first', sort: 'ris' },
    },
    {
      slug: 'how-much-should-a-fractional-operator-charge', group: 'operators', updated: '2026-09-20', mins: 6, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How much should a fractional operator charge?',
      answer: () => [`Price from the Rate Index for your role and the size of the companies you serve, then adjust for verified proof and scope.`, `The median across fractional GTM leaders is ${hr(latestMedian())} an hour.`],
      stats: () => [{ v: hr(latestMedian()) + '/hr', l: 'All-category median, latest quarter', src: SRC_RI() }, { v: yoy(), l: 'Change in the median, year over year', src: SRC_REP() }, { v: (REP().concurrent || []).slice().sort((a, b) => b.v - a.v)[0] ? REP().concurrent.slice().sort((a, b) => b.v - a.v)[0].l : '2 companies', l: 'Most common company load', src: SRC_REP() }],
      sections: () => {
        const cats = F.roleCategory.options.filter((o) => RIX().byCat[o.v]);
        const rows = cats.map((o) => ({ label: o.l, value: RIX().byCat[o.v].p50 })).sort((a, b) => b.value - a.value);
        return [
          { id: 'index', h: 'Start from the Rate Index', html: `<p>The Rate Index reports the median and middle half of hourly rates for every role category, from rates operators list on their profiles.</p>
            ${chartSlot('g8-cats', (w) => bars(rows, { fmt: (n) => '$' + n, label: 'Median hourly rate by role category' }, w))}
            ${tbl(['Role category', '25th pct', 'Median', '75th pct'], cats.map((o) => { const b = RIX().byCat[o.v]; return [esc(o.l), hr(b.p25), `<b>${hr(b.p50)}</b>`, hr(b.p75)]; }))}
            ${src(`Rate Index, latest quarter. See the full index and estimator on ${L('rates', 'Rates')}. Illustrative.`)}
            ${chartGo('Browse operators by role category and rate', { filters: {}, src: 'guide_chart_rate_cat' })}` },
          { id: 'revenue', h: 'Adjust for the companies you serve', html: `<p>Rates rise with company size. Against a $5M to $20M company as the baseline:</p>
            ${tbl(['Company revenue', 'Rate vs baseline'], F.companyRevenue.options.filter((o) => RIX().byRevenue[o.v]).map((o) => { const m = RIX().byRevenue[o.v]; return [esc(o.l), `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`]; }))}` },
          { id: 'model', h: 'Hourly, retainer or project', html: `<p>Most operators list an hourly rate and bill a monthly retainer for a block of hours. At the Sales Leadership median, 20 hours a month is ${usd(RIX().byCat.sales_leadership.p50 * 20)}, 40 hours is ${usd(RIX().byCat.sales_leadership.p50 * 40)}. Scoped projects (${esc(F.engagementTypes.options.find((o) => o.v === 'project').d.toLowerCase().replace(/\.$/, ''))}) are priced per project, from the hours you expect to spend.</p>
            <p>The rate on your profile is the price companies pay. Set it in ${L('studio.profile', 'Studio')} and compare it with the Rate Index for your role.</p>` },
          { id: 'proof', h: 'Proof moves your rate more than discounts do', html: `<p>Operators with three or more company-verified reviews are rehired ${sumStat(/Rehire rate/i, '2.4x')} as often as those with none. Companies comparing two operators at similar rates pick the one with verified proof in the work they need. Before you lower your rate, ask two past companies for a CORE review.</p>
            <p>Signed in, the Positioning tab in Studio shows where your rate sits against the 25th, 50th and 75th percentile for your category, next to how often operators at each band win.</p>` },
          { id: 'load', h: 'How many companies to carry', html: (REP().concurrent || []).length ? `<p>${REP().concurrent.map((c) => `${esc(c.l)}: ${c.v}%`).join(', ')}. Two companies is the most common load. Price so that two companies at your usual hours cover your income target, with a third as upside.</p>` : '' },
        ];
      },
      faq: () => [
        { q: 'Should I show my rate on my profile?', a: 'Yes. Companies filter by rate, and profiles without a rate drop out of those searches. Rates are visible to signed-in companies only.' },
        { q: 'Should I discount for my first company on the platform?', a: 'Prefer a shorter initial term or fewer hours over a lower rate. A discounted rate becomes the reference point for renewals.' },
        { q: 'How often should I raise my rate?', a: 'Review it each quarter against the Rate Index and after every new verified review. Raise it for new companies first.' },
        { q: 'What does it cost to join?', a: 'Nothing. Joining, your profile and Studio are free.' },
      ],
      cta: { label: 'See your rate position', to: 'studio.positioning', operator: true },
    },
    {
      slug: 'how-fractional-operators-win-direct-deals', group: 'operators', updated: '2026-09-16', mins: 5, cat: null, opsQ: '', opsSort: 'ris',
      q: 'How do fractional operators win companies without a marketplace intro?',
      answer: () => ['Most fractional work comes from referrals and former colleagues.', 'Operators win those deals faster with proof: company-verified focus areas, CORE reviews and a private proof link.'],
      stats: () => { const s = REP().sources || []; const ref = s.filter((x) => /Referral|colleague/i.test(x.l)).reduce((a, x) => a + x.v, 0); return [{ v: (ref || 67) + '%', l: 'Found their operator through a referral or colleague', src: SRC_REP() }, { v: sumStat(/Rehire rate/i, '2.4x'), l: 'Rehire rate with 3+ verified reviews', src: SRC_REP() }, { v: ((REP().hindsight || [])[0] || [])[2] || '81%', l: 'Of companies say stage fit mattered most, in hindsight', src: SRC_REP() }]; },
      sections: () => {
        const s = (REP().sources || []).map((x) => ({ label: x.l, value: x.v, hi: /Referral/i.test(x.l) }));
        return [
          { id: 'sources', h: 'Where companies find operators', html: `${chartSlot('g9-src', (w) => bars(s, { fmt: (n) => n + '%', label: 'Where companies found their fractional operator' }, w))}
            ${src('State of Fractional GTM 2027 survey of companies that hired a fractional leader. Illustrative.')}
            <p class="rs-chart-go"><a class="act" href="#${RN.store.state.persona === 'operator' ? 'studio.visibility' : 'join'}">${RN.store.state.persona === 'operator' ? 'See where your own profile views come from' : 'Join the network to see where your views come from'}${icon('arrow')}</a></p>
            <p>A referral gets you the first call. What the prospect checks after that call decides the deal.</p>` },
          { id: 'check', h: 'What prospects check before they call you back', html: `<p>Stage and deal-size fit, how you communicate in a part-time seat and verified references from prior companies were the top three factors companies wish they had weighed. A résumé shows none of them. A profile with company-verified focus areas, CORE reviews and Engagement History shows all three.</p>` },
          { id: 'proof-link', h: 'Send proof with every proposal', html: `<p>From Studio you can create a <b>proof link</b>: a private version of your profile prepared for one prospect, with the sections you choose. The prospect sees a notice that you can see what they read. You see which sections they opened, for how long, and whether they forwarded it inside their team.</p>
            <p>The link makes the deal easier to win; it does not route it through the marketplace.</p>` },
          { id: 'findable', h: 'Get found in search and AI answers', html: `<ul><li>Write a headline that names the problem you solve and the stage you solve it at.</li><li>Ask past companies to verify your top focus areas: verified tags rank first on cards and in search.</li><li>Keep availability current; fresh availability ranks higher.</li><li>A long-form About section feeds Google and AI answer engines, which increasingly answer "who is a good fractional VP of Sales for..." directly.</li></ul>` },
          { id: 'studio', h: 'What you get even without an intro', html: `<p>Studio shows every search you appeared in and why, the firmographic segments that viewed you (never company names), where you were compared and not chosen, and how your rate and focus areas compare with demand. None of it depends on an intro.</p>` },
        ];
      },
      faq: () => [
        { q: 'Does a proof link route the deal through Revenue Nomad?', a: 'No. The deal stays between you and your company; the link helps you close it.' },
        { q: 'Will the prospect know I can see what they read?', a: 'Yes. Every proof link shows the prospect a notice that viewing is shared with the operator.' },
        { q: 'How do I get my first verified review?', a: 'Send a review request from Studio to a past company. When they submit a CORE review rated 4.0 or higher, the focus areas they confirm turn verified.' },
      ],
      cta: { label: 'Create a proof link', to: 'studio.credibility', operator: true },
    },
    {
      slug: 'what-is-the-reputation-index', group: 'methods', updated: '2026-09-01', mins: 5, cat: null, opsQ: '', opsSort: 'ris',
      q: 'What is the Revenue Nomad Reputation Index?',
      answer: () => ['The Reputation Index is a 0 to 100 score of the company evidence behind an operator\'s profile.', 'Most approved profiles sit at 50, the start of Emerging, and rise only with company evidence.'],
      stats: () => { const ops = RN.model.ops; const hi = ops.filter((o) => o.ris.score >= 60).length; return [{ v: '50', l: 'Where the first tier, Emerging, starts' }, { v: String(F.risFactors.options.length), l: `Factors, ${F.risFactors.options.filter((o) => o.v !== 'complete').length} from company evidence` }, { v: String(hi), l: `Operators at Proven or above today` }]; },
      sections: () => {
        const ops = RN.model.ops.filter((o) => !o.hidden);
        const tiers = F.risTier.options.slice().reverse();
        const tierRows = tiers.map((t) => ({ label: `${t.l} (${t.min} to ${t.max})`, value: ops.filter((o) => o.ris.tier === t.v).length }));
        // Profiles with no score yet, so the bars add up to the count below
        const unscored = ops.filter((o) => !o.ris.tier).length;
        if (unscored) tierRows.push({ label: F.risNone.l, value: unscored });
        return [
          { id: 'factors', h: 'The five factors', html: `<dl class="rs-dl rs-dl-w">${F.risFactors.options.map((o) => `<div><dt>${esc(o.l)}<span class="tnum">${Math.round((o.w || 0) * 100)}%</span></dt><dd>${esc(o.d)}</dd></div>`).join('')}</dl>
            <p>Weights are published so operators know exactly what moves the score and companies know what it measures.</p>` },
          { id: 'tiers', h: 'The tiers', html: `${tbl(['Tier', 'Score', 'What it means'], F.risTier.options.map((t) => [`<b>${esc(t.l)}</b>`, `${t.min} to ${t.max}`, esc(t.d)]), 'rs-tbl-l')}
            <p>"Emerging" means the Revenue Nomad team checked identity and work history. "Verified" is reserved for proof a company confirmed: verified focus areas and verified engagements.</p>
            <p>Cards and lists show a badge from Proven up and no mark below it. Every profile page shows the full tier and score.</p>` },
          { id: 'network', h: 'Where the network sits today', html: `${chartSlot('g10-tiers', (w) => bars(tierRows, { label: 'Operators by Reputation Index tier' }, w))}
            ${src(`Live count across ${ops.length} operator profiles<span data-proto> in this prototype</span>.`)}
            ${chartGo('Browse operators, highest Reputation Index first', { filters: {}, sort: 'ris', src: 'guide_chart_tiers' })}
            <p>Most profiles sit at Emerging because the index only moves with company evidence. That is by design: a score that starts high means nothing.</p>` },
          { id: 'not', h: 'What it is not', html: `<ul><li>It is not for sale. No plan, fee or sponsorship changes it.</li><li>It is not a popularity score. Profile views and searches do not count.</li><li>It does not punish operators for engagements that were never reviewed.</li></ul>
            <p>Operators can see how their own score breaks down in Studio, and the ${L('levels', 'Levels page')} explains what each tier unlocks.</p>` },
        ];
      },
      faq: () => [
        { q: 'Why do most operators have a score of 50?', a: 'Most approved profiles sit at 50, the start of Emerging, and rise only with company evidence. New operators have not collected reviews on the platform yet. Some profiles are not scored yet and show no tier.' },
        { q: 'How quickly does the score update?', a: 'Immediately. A submitted review, a verified engagement or a completed profile recalculates the score the same day.' },
        { q: 'Can a bad review lower the score?', a: 'Low CORE ratings reduce the Strong ratings factor, and reviews rated under 4.0 do not verify focus areas. Reviews publish automatically; there is no moderation queue to hide them.' },
      ],
      cta: { label: 'Browse operators, highest Reputation Index first', sort: 'ris' },
    },
    {
      slug: 'what-is-core', group: 'methods', updated: '2026-09-01', mins: 4, cat: null, opsQ: '', opsSort: 'ris',
      q: 'What is CORE?',
      answer: () => ['CORE is Revenue Nomad\'s company review: Communication, Ownership, Results Focus and Expertise, each rated 1 to 5.', 'Reviews rated 4.0 or higher verify the focus areas the company confirms.'],
      stats: () => [{ v: '4', l: 'Questions, each rated 1 to 5' }, { v: '4.0+', l: 'Average needed to verify focus areas' }, { v: '3', l: 'Short steps for the company' }],
      sections: () => [
        { id: 'questions', h: 'The four questions', html: `<dl class="rs-dl">${F.coreDims.options.map((o) => `<div><dt><span class="rs-core-l">${esc(o.v)}</span>${esc(o.l)}</dt><dd><span class="rs-core-q">“${esc(o.q)}”</span> ${esc(o.d)}</dd></div>`).join('')}</dl>` },
        { id: 'how', h: 'How a review works', html: `<ol>
          <li><b>The engagement.</b> The company confirms the role delivered, the dates, the ${esc(F.engagementType.label.toLowerCase())} and the spend.</li>
          <li><b>CORE.</b> Four ratings from 1 to 5, each with an optional reason, a required overall experience note, and ${esc(F.hireAgain.label.replace(/\?$/, '').toLowerCase())}.</li>
          <li><b>Focus areas and outcomes.</b> The company confirms the operator's focus areas they saw in action and rates up to three outcomes: ${esc(RN.w.labels('outcomeRating', F.outcomeRating.options.map((o) => o.v)))}.</li></ol>
          <p>Only companies the operator requests a review from can submit one. Reviews publish automatically. Operators see two states for each request: ${esc(RN.w.labels('reviewStatus', ['sent', 'completed'], ' and '))}.</p>` },
        { id: 'feeds', h: 'What a review changes', html: `<ul><li>Focus areas the company confirms turn <b>verified</b> when the review averages 4.0 or higher. Five such reviews make a focus area Expert.</li><li>The Reputation Index recalculates: review volume, strong ratings and focus area verification all move.</li><li>The review appears on the profile, in the CORE section and on any proof link that includes reviews.</li></ul>` },
        { id: 'why', h: 'Why four dimensions instead of five stars', html: `<p>Star averages drift toward 4.9 on most marketplaces, which makes them useless for comparison. Four specific questions show where an operator is strong and where they are average, and "Would hire again" is harder to inflate than a star.</p>` },
      ],
      faq: () => [
        { q: 'Who can leave a CORE review?', a: 'A company the operator worked with and sent a review request to. Operators cannot review themselves or each other.' },
        { q: 'Can an operator hide a review?', a: 'No. Reviews publish automatically and there is no moderation queue.' },
        { q: 'What does CORE stand for?', a: 'Communication, Ownership, Results Focus and Expertise, the four things companies rate.' },
      ],
      cta: { label: 'Read how the score works', to: 'levels' },
    },
  ];

  /* Cost guides for every other role category (value: each Browse category page links to its own guide).
     Built from one template on the Rate Index, so the numbers match #rates, Blueprints and the category pages. */
  const COST = {
    revenue_operations: { slug: 'fractional-revops-cost', noun: 'RevOps leader', bp: 'vp-revops', opsQ: 'RevOps', hours: '40',
      buys: 'Twenty hours covers CRM administration, reporting and the data behind the weekly forecast. Forty hours adds a rebuild: stages, routing, data cleanup and dashboards. Sixty or more usually means a CRM migration or a new tool rollout.' },
    sales_enablement: { slug: 'fractional-sales-enablement-cost', noun: 'sales enablement leader', bp: 'enablement-director', opsQ: 'enablement', hours: '40',
      buys: 'Twenty hours buys a training calendar and call coaching for a small team. Forty hours adds a full onboarding program, a content library and coaching for managers. Sixty or more usually means running enablement for several teams at once.' },
    customer_success_growth: { slug: 'fractional-customer-success-cost', noun: 'VP of Customer Success', bp: 'vp-cs', opsQ: 'customer success', hours: '40',
      buys: 'Twenty hours buys a retention review, a customer health score and a renewal forecast. Forty hours adds an onboarding program and an expansion motion with a named owner. Sixty or more usually means managing the CS team day to day.' },
    ai_gtm: { slug: 'fractional-ai-gtm-cost', noun: 'AI GTM architect', bp: 'ai-gtm-architect', opsQ: 'AI', hours: '40',
      buys: 'Twenty hours buys an audit of how the team uses AI today and one or two automated workflows. Forty hours adds building and measuring workflows across research, outreach and CRM updates. Sixty or more usually means rebuilding part of the go-to-market stack.' },
    partnerships: { slug: 'fractional-partnerships-cost', noun: 'VP of Partnerships', bp: 'vp-partnerships', opsQ: 'partner', hours: '40',
      buys: 'Twenty hours buys partner selection, terms and the first two or three partners. Forty hours adds partner enablement, co-selling and a target for partner-sourced pipeline. Sixty or more usually means running a reseller channel.' },
    sellers: { slug: 'fractional-account-executive-cost', noun: 'account executive', bp: 'account-executive', opsQ: 'account executive', hours: '60', hrs: ['40', '60', '80', '100'],
      buys: 'Forty hours covers one segment or a short list of named accounts. Sixty to eighty hours is a part-time closer who owns a pipeline number. At 100 hours or more, compare the cost with a full-time hire.' },
  };
  function costGuide(cat, c) {
    const b = () => RIX().byCat[cat];
    const catL = F.catLabel(cat);
    const hrsL = RN.w.label('hoursPerMonth', c.hours);
    const bpOf = () => blueprintFor(cat, c.bp);
    return {
      slug: c.slug, bp: c.bp, group: 'costs', updated: '2026-09-22', mins: 4, cat, opsQ: c.opsQ,
      q: `How much does a fractional ${c.noun} cost?`,
      answer: () => { const r = RN.costs && RN.costs.get('ri.' + cat); const t = r ? r.text : { median: hr(b().p50) + '/hr', hourly: RN.fmt.hrRange(b().p25, b().p75), monthly: monthRange(cat, c.hours, '5m_20m') }; return [NB(`A fractional ${c.noun} costs a median of ${t.median} on the Rate Index (middle half ${t.hourly}), or ${t.monthly} at ${r ? r.hours.lo : c.hours} hours for a $5M to $20M company.`)]; },
      stats: () => [{ v: hr(b().p50) + '/hr', l: `Median rate, ${catL}`, src: SRC_RI() }, { v: monthRange(cat, c.hours, '5m_20m').replace(/\/month$/, ''), l: `Typical month at ${hrsL}`, src: SRC_RI() }, { v: plural(b().n, 'rate'), l: 'In the index for this role category', src: SRC_RI() }],
      sections: () => {
        const revRows = F.companyRevenue.options.filter((o) => RIX().byRevenue[o.v]).map((o) => ({ label: o.l, value: Math.round(b().p50 * mult(o.v)), hi: o.v === '5m_20m' }));
        const bp = bpOf();
        return [
          { id: 'drivers', h: 'What sets the price', html: `<p>Hours a month move the number most, then the size of your company. Operators who serve larger companies charge more per hour because the work carries more risk: bigger teams, longer cycles and more people who depend on the result.</p>
            ${chartSlot('gc-' + cat, (w) => bars(revRows, { fmt: (n) => '$' + n + '/hr', label: `Median hourly rate for ${catL} by company revenue` }, w))}
            ${src(`Median hourly rate for ${esc(catL)} by company revenue range. Rate Index, ${esc((RIX().trend || []).slice(-1)[0] ? RIX().trend.slice(-1)[0].l : 'Q3 26')}. Illustrative.`)}
            ${chartGo(`Browse ${catL} operators`, { filters: { roleCategories: [cat] }, src: 'guide_cost_' + cat })}` },
          { id: 'monthly', h: 'What a month costs', html: `<p>Multiply the hourly range by the hours you need. For a $5M to $20M company:</p>
            ${monthTable(cat, c.hrs || ['20', '40', '60', '80'])}
            <p>${esc(c.buys)}</p>` },
          { id: 'scope', h: 'Scope it before you talk to anyone', html: `<p>${bp ? `The ${L(bp.to, bp.title + ' Blueprint')} gives you` : `An ${L('blueprints', 'Engagement Blueprint')} gives you`} the hours, term, a 30/60/90-day plan and the focus areas the work needs, ready to post as an engagement. ${L('guide.how-to-scope-a-fractional-sales-engagement', 'How to scope a fractional engagement')} covers the outcome, the hours and the operating rhythm.</p>` },
        ];
      },
      faq: () => [
        { q: 'Is there a minimum commitment?', a: 'Most operators ask for an initial term of three months, since the first month is spent learning the business. After that, 30 days notice is common.' },
        { q: 'Does Revenue Nomad charge companies a fee?', a: `No. Browsing, posting an engagement, intros and hiring are free for companies. The listed rate is the price, with no fee added on top. At the ${catL} median of ${hr(b().p50)} an hour, ${hrsL.replace(/\s\/\u2060?\s/, ' a ')} is ${usd(b().p50 * hoursNum(c.hours))}.` },
        { q: 'Can I see an operator\'s rate before I contact them?', a: 'Yes. Signed-in companies see each operator\'s hourly rate on their profile and can filter search by rate. The rate you see is the price you pay.' },
      ],
      cta: { label: `Browse ${catL}`, filters: { roleCategories: [cat] } },
    };
  }
  Object.keys(COST).forEach((cat) => GUIDES.push(costGuide(cat, COST[cat])));

  /* ---------- Answer posts (content playbook, Oct 10, 2026), from RN.data.posts (js/data/posts.js) ----------
     The playbook's ten refresh-list posts rebuilt into eight guides (the sixteen sales city pages fold into the
     hiring guide) and five drafted Content Bank posts (post 2 also takes the two marketing city pages). Copy is the
     Content Bank draft, or rebuilt from the Content Bank, Site pages and plan data where no draft exists; nothing is
     invented, and pending tokens ([[gap:what|Owner]]) render as pending chips. Posts lead GUIDES, so Browse category pages,
     the guide samples and Keep reading start with them. They replace the prototype guides they cover. */
  const POSTS = (RN.data.posts && RN.data.posts.list) || [];
  const NETS = () => String((MK() && MK().network && MK().network.operators) || '350+');
  // Plain text for cards, titles and JSON-LD: a pending figure drops out, a link keeps its label
  const plainOf = (t) => costTok(t)
    .replace(/\s*\[\[gap:[^\]]*\]\]/g, '')
    .replace(/\[\[(?:link|url):[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[net\]\]/g, NETS()).replace(/\*\*/g, '')
    .replace(/\s+([.,;?!])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  // Body copy with the same tokens as the function pages (RN.fn.rich loads later, so it is looked up at render time)
  // Headings and titles: typographic quotes, and a hyphenated word never breaks across lines ("full-" / "time")
  const disp = (t) => esc(RN.fmt.smart(t)).replace(/(\w)-(?=\w)/g, '$1\u2011');
  // A money range never breaks across lines ("$200 - $250/hr"). RN.fmt.smart turns no-break spaces back into spaces and
  // a hyphen is itself a break point, so a rendered range sits in a no-wrap span
  const keepRanges = (html) => String(html).replace(/(\$[\d.,]+[kKM]?)[\s\u00a0]-\u2060?[\s\u00a0](\$[\d.,]+[kKM]?(?:\/(?:hr|month|year))?)/g, '<span class="rs-nw">$1 - $2</span>');
  const prich = (t) => keepRanges(RN.fn && RN.fn.rich ? RN.fn.rich(costTok(t)) : esc(plainOf(t)));
  // Post tables read as text in every column; three or more columns stack into labelled rows on phones
  const prow = (r, head) => {
    const cells = [];
    r.forEach((c, i) => { if (String(c || '').trim() === '' && cells.length && i > 1) cells[cells.length - 1].span++; else cells.push({ c, i, span: 1 }); });
    return `<tr>${cells.map((x) => `<td data-l="${esc(plainOf(x.span > 1 ? '' : head[x.i] || ''))}"${x.span > 1 ? ` colspan="${x.span}"` : ''}>${prich(x.c)}</td>`).join('')}</tr>`;
  };
  // Wide tables (5+ columns) keep readable columns and scroll inside their frame
  const ptbl = (head, rows, cls) => `<div class="tbl-wrap rs-tbl rs-ptbl${head.length > 2 ? ' rs-tbl-stack' : ''}${head.length > 4 ? ' rs-ptbl-wide' : ''}${cls ? ' ' + cls : ''}"><table class="tbl"><thead><tr>${head.map((x) => `<th>${prich(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => prow(r, head)).join('')}</tbody></table></div>`;
  /* Visual blocks drawn from each post's own data (design pass, Oct 2026). Nothing here adds copy: every label,
     number and step comes from the post's blocks, keys and tables.
       ol whose items all open with a bold lead     -> a step timeline (time markers in the text become chips)
       ol of short plain items                      -> a numbered checklist
       ul whose items all open with a bold lead     -> a two-column ruled list
       table whose first column is "Days 1 to 30"…  -> a phase timeline
       table that compares options (blank corner)   -> a comparison table, the fractional column highlighted
       a column of percentages                      -> inline bars scaled to the column
       "What this looked like at a real company"    -> a case file with a Before -> After rail
     A paragraph or quote that is only a pending chip carries data-proto, so it disappears with the chip. */
  const LEAD_RE = /^\*\*([^*]+?)\*\*\s*([\s\S]*)$/;
  const leadOf = (t) => { const m = String(t || '').match(LEAD_RE); return m ? { h: m[1].trim().replace(/[.:]$/, ''), t: m[2].trim() } : null; };
  const gapOnly = (t) => plainOf(t) === '';
  const protoIf = (t) => (gapOnly(t) ? ' data-proto' : '');
  // A time marker the step's own text names ("often within 48 hours", "Week 1 to 2", "a 3 to 4 month initial term")
  function timeMark(t) {
    const s = plainOf(t);
    let m = s.match(/within (\d+ (?:hours|days|weeks))/i); if (m) return m[1];
    m = s.match(/\b(week \d+(?: to \d+)?)\b/i); if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
    m = s.match(/\b(\d+ to \d+) month/i); if (m) return m[1] + ' months';
    return '';
  }
  // The rule-out list in the CMO guide opens with bold leads but is not a sequence
  const NOT_STEPS = { 'how-to-hire-a-fractional-cmo:rule-out-and-interview:0': 1 };
  function stepsTl(items) {
    const n = items.length;
    const cols = n <= 4 ? n : Math.ceil(n / 2);
    return `<ol class="rs-tl" style="--cols:${cols}" data-rs-reveal>${items.map((x, i) => {
      const l = leadOf(x) || { h: plainOf(x), t: '' };
      const tm = timeMark(x);
      return `<li class="rs-tl-i${i % cols === cols - 1 ? ' is-eor' : ''}" style="--i:${i}"><span class="rs-tl-top"><span class="rs-tl-node" aria-hidden="true"><span class="rs-tl-n">${i + 1}</span></span>${tm ? `<span class="pill pill-accent rs-tl-when">${icon('clock')}${esc(tm)}</span>` : ''}</span>
        <span class="rs-tl-b"><b class="rs-tl-h">${prich(l.h)}</b>${l.t ? `<span class="rs-tl-t">${prich(l.t)}</span>` : ''}</span></li>`;
    }).join('')}</ol>`;
  }
  const numList = (items) => `<ol class="rs-nl">${items.map((x) => `<li>${prich(x)}</li>`).join('')}</ol>`;
  const leadList = (items, cls) => `<ul class="rs-ll ${cls || ''}">${items.map((x) => { const l = leadOf(x); return `<li>${cls === 'rs-ll-no' ? `<span class="rs-ll-ic" aria-hidden="true">${icon('x')}</span>` : ''}<b>${prich(l.h)}</b><span>${prich(l.t)}</span></li>`; }).join('')}</ul>`;
  // The older guides write their sections as HTML: an ol whose items all open with <b> becomes the same timeline
  const olToTl = (html) => String(html || '').replace(/<ol>([\s\S]*?)<\/ol>/g, (m, inner) => {
    const items = inner.split(/<li>/).slice(1).map((x) => x.replace(/<\/li>\s*$/, '').trim());
    if (items.length >= 2 && items.every((x) => /^<b>[^<]+<\/b>/.test(x))) {
      const n = items.length, cols = n <= 4 ? n : Math.ceil(n / 2);
      return `<ol class="rs-tl" style="--cols:${cols}" data-rs-reveal>${items.map((x, i) => { const mm = x.match(/^<b>([^<]+)<\/b>\s*([\s\S]*)$/); return `<li class="rs-tl-i${i % cols === cols - 1 ? ' is-eor' : ''}" style="--i:${i}"><span class="rs-tl-top"><span class="rs-tl-node" aria-hidden="true"><span class="rs-tl-n">${i + 1}</span></span></span><span class="rs-tl-b"><b class="rs-tl-h">${mm[1].trim().replace(/[.:]$/, '')}</b><span class="rs-tl-t">${mm[2]}</span></span></li>`; }).join('')}</ol>`;
    }
    return `<ol class="rs-nl">${inner}</ol>`;
  });
  const isPhaseTable = (t) => (t.rows || []).length >= 2 && t.rows.every((r) => /^days? \d/i.test(plainOf(r[0])));
  function phaseTl(t) {
    const head = t.head || [];
    return `<ol class="rs-phase" style="--cols:${t.rows.length}" data-rs-reveal>${t.rows.map((r, i) => `<li class="rs-ph" style="--i:${i}">
      <span class="rs-ph-hd"><span class="rs-tl-node" aria-hidden="true"><span class="rs-tl-n">${i + 1}</span></span><b>${prich(r[0])}</b></span>
      <dl>${r.slice(1).map((c, j) => (String(c || '').trim() ? `<div><dt>${prich(head[j + 1] || '')}</dt><dd>${prich(c)}</dd></div>` : '')).join('')}</dl>
    </li>`).join('')}</ol>`;
  }
  // Inline bars for a column of percentages (the CMO scorecard weights)
  function pctCols(t) {
    const out = {};
    (t.head || []).forEach((_, i) => {
      if (!i) return;
      const vals = t.rows.map((r) => String(r[i] || '').trim()).filter(Boolean);
      if (vals.length >= 3 && vals.every((v) => /^\d+%$/.test(v))) out[i] = Math.max(...vals.map((v) => parseInt(v, 10)));
    });
    return out;
  }
  /* Hourly rates by seat, drawn from the post's own rate table ("About $150", "$200 - $250", "$200 to $250"): a range bar
     per seat on one scale. Rows still pending a figure are left out; the table under it shows them. */
  const usdN = (n, k) => +String(n).replace(/,/g, '') * (k ? 1000 : 1);
  function money(c) {
    const t = plainOf(c);
    const m = t.match(/\$([\d,.]+)(k)?(?:\s*(?:to|-)\s*\$([\d,.]+)(k)?)?/i);
    if (!m) return null;
    const lo = usdN(m[1], m[2]), hi = m[3] ? usdN(m[3], m[4]) : lo;
    return { lo, hi, approx: /^about/i.test(t), txt: t };
  }
  function rateChart(t) {
    const head = t.head || [];
    const col = head.findIndex((h) => /hourly rate/i.test(plainOf(h)));
    if (col < 1) return '';
    const rows = (t.rows || []).map((r) => ({ l: plainOf(r[0]), v: money(r[col]) })).filter((x) => x.v);
    if (rows.length < 2) return '';
    const max = Math.ceil(Math.max(...rows.map((x) => x.v.hi)) / 100) * 100;
    const ticks = []; for (let v = 0; v <= max; v += 100) ticks.push(v);
    const pct = (v) => (v / max * 100).toFixed(2) + '%';
    return `<figure class="rs-rate" data-rs-draw="rate">
      <figcaption class="label">${esc(plainOf(head[col]))} by ${esc(plainOf(head[0]).toLowerCase())}</figcaption>
      <div class="rs-rate-rows">${rows.map((x, i) => `<div class="rs-rate-r" style="--i:${i}">
        <span class="rs-rate-l">${esc(x.l)}</span>
        <span class="rs-rate-t" aria-hidden="true">${ticks.slice(1, -1).map((v) => `<i class="rs-rate-g" style="left:${pct(v)}"></i>`).join('')}<span class="rs-rate-b${x.v.hi === x.v.lo ? ' is-pt' : ''}" data-draw="${x.v.hi === x.v.lo ? 'fade' : 'x'}" style="left:${pct(x.v.lo)};width:${x.v.hi === x.v.lo ? '0' : pct(x.v.hi - x.v.lo)}"></span></span>
        <b class="rs-rate-v tnum">${esc(x.v.txt)}</b>
      </div>`).join('')}</div>
      <div class="rs-rate-ax" aria-hidden="true"><span></span><span class="rs-rate-ticks">${ticks.map((v) => `<i style="left:${pct(v)}">$${v}</i>`).join('')}</span><span></span></div>
    </figure>`;
  }
  // A source or method line under a table or tile row: a caption of the figure, not a paragraph of the article
  const figCap = (note) => (note ? `<figcaption class="fig-note rs-fig-note">${icon('info')}<span>${prich(note)}</span></figcaption>` : '');
  function richTable(t, ctx, note) {
    const head = t.head || [], rows = t.rows || [];
    if (isPhaseTable(t)) return phaseTl(t);
    const pc = pctCols(t);
    const byRow = /^option$/i.test(plainOf(head[0]));
    const cmp = head.length >= 3 && (!plainOf(head[0]) || byRow);
    const hi = cmp && !byRow ? head.findIndex((h, i) => i && /^fractional/i.test(plainOf(h))) : -1;
    const hiRow = cmp && byRow ? rows.findIndex((r) => /^fractional/i.test(plainOf(r[0]))) : -1;
    const cell = (c, i, r) => {
      if (pc[i] && /^\d+%$/.test(String(c).trim())) return `<span class="rs-pct"><b class="tnum">${esc(String(c).trim())}</b><span class="rs-pct-bar" aria-hidden="true"><i data-draw="x" style="width:${Math.round((parseInt(c, 10) / pc[i]) * 100)}%"></i></span></span>`;
      return prich(c);
    };
    const cls = ['tbl-wrap rs-tbl rs-ptbl', head.length > 2 ? 'rs-tbl-stack' : '', head.length > 4 ? 'rs-ptbl-wide' : '', cmp ? 'rs-cmp' : '', head.length === 2 ? 'rs-spec' : '', Object.keys(pc).length ? 'rs-has-pct' : ''].filter(Boolean).join(' ');
    const rowHtml = (r) => {
      const cells = [];
      r.forEach((c, i) => { if (String(c || '').trim() === '' && cells.length && i > 1) cells[cells.length - 1].span++; else cells.push({ c, i, span: 1 }); });
      const proto = r.slice(1).every((c) => !String(c || '').trim() || gapOnly(c)) && r.slice(1).some((c) => /\[\[gap:/.test(String(c || '')));
      return `<tr${proto ? ' data-proto' : ''}${rows.indexOf(r) === hiRow ? ' class="rs-hi-row"' : ''}>${cells.map((x) => `<${x.i === 0 && cmp ? 'th scope="row"' : 'td'} data-l="${esc(plainOf(x.span > 1 ? '' : head[x.i] || ''))}"${x.span > 1 ? ` colspan="${x.span}"` : ''}${x.i === hi ? ' class="rs-hi"' : ''}>${cell(x.c, x.i, r)}</${x.i === 0 && cmp ? 'th' : 'td'}>`).join('')}</tr>`;
    };
    const table = `<div class="${cls}"${Object.keys(pc).length ? ' data-rs-draw="pct"' : ''}><table class="tbl"><thead><tr>${head.map((x, i) => `<th${i === hi ? ' class="rs-hi"' : ''}>${prich(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
    return `${rateChart(t)}${note ? `<figure class="rs-fig">${table}${figCap(note)}</figure>` : table}`;
  }
  /* Stat tiles, a post block: { stats: [{ v, l, src?, url? }], note? }. A paragraph that is mostly arithmetic becomes two
     or three tiles: the figure large, what it is under it, then its source. Values and labels take the body-copy tokens,
     so [[cost:...]] keeps every money figure on the canonical record. A tile whose value is still pending is left out. */
  function statsBlock(b) {
    const list = (b.stats || []).filter((x) => x && !gapOnly(x.v));
    if (!list.length) return '';
    const srcOf = (x) => (x.url ? `<a class="link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(plainOf(x.src))}</a>` : prich(x.src));
    return `<figure class="rs-stats-fig"><div class="rs-stats" data-n="${list.length}">${list.map((x) => `<div class="rs-st">
        <span class="rs-st-v">${prich(NB(x.v))}</span>
        <span class="rs-st-l">${prich(NB(x.l))}</span>
        ${x.src ? `<span class="rs-st-s">${srcOf(x)}</span>` : ''}
      </div>`).join('')}</div>${figCap(b.note)}</figure>`;
  }
  // "What this looked like at a real company": bold-led paragraphs become a case file with a rail
  function caseFile(blocks) {
    const parts = blocks.map((b) => {
      if (b.p != null && leadOf(b.p)) { const l = leadOf(b.p); return { k: 'step', h: l.h, t: l.t, raw: b.p }; }
      return { k: 'other', b };
    });
    if (parts.filter((x) => x.k === 'step').length < 2) return null;
    return `<div class="rs-case" data-rs-reveal>${parts.map((x, i) => {
      if (x.k === 'step') {
        const proto = gapOnly(x.t) ? ' data-proto' : '';
        const after = /^after$/i.test(x.h);
        return `<div class="rs-case-i${after ? ' is-after' : ''}"${proto} style="--i:${i}"><span class="rs-case-dot" aria-hidden="true"></span><span class="label">${prich(x.h)}</span><p>${prich(x.t)}</p></div>`;
      }
      return postBlock(x.b, {});
    }).join('')}</div>`;
  }
  // A sentence that lists eight or more places ("Atlanta, Austin, … and Seattle.") becomes a row of place chips
  const PLACE = '[A-Z][a-z]+(?: [A-Z][a-z]+)*';
  const PLACES_RE = new RegExp(`\\s*((?:${PLACE}, ){7,}${PLACE},? and ${PLACE})\\.`);
  function placesPara(t) {
    const m = String(t).match(PLACES_RE);
    if (!m || /\[\[/.test(m[1])) return '';
    const names = m[1].split(/, (?:and )?|,? and /);
    const rest = String(t).replace(m[0], '');
    return `<p>${prich(rest)}</p><ul class="rs-places" aria-label="${names.length} places" data-rs-reveal>${names.map((n, i) => `<li class="pill pill-line" style="--i:${i}">${icon('pin')}${esc(n)}</li>`).join('')}</ul>`;
  }
  function postBlock(b, ctx, bi) {
    if (b.p != null) return placesPara(b.p) || `<p${protoIf(b.p)}>${prich(b.p)}</p>`;
    if (b.ul) return b.ul.length >= 2 && b.ul.every(leadOf) ? leadList(b.ul, ctx.sec === 'not-right' ? 'rs-ll-no' : '') : `<ul>${b.ul.map((x) => `<li${protoIf(x)}>${prich(x)}</li>`).join('')}</ul>`;
    if (b.ol) {
      const k = `${ctx.slug}:${ctx.sec}:${ctx.oi = (ctx.oi == null ? 0 : ctx.oi + 1)}`;
      if (b.ol.length >= 2 && b.ol.every(leadOf) && !NOT_STEPS[k]) return stepsTl(b.ol);
      if (b.ol.every(leadOf)) return leadList(b.ol, 'rs-ll-num');
      return numList(b.ol);
    }
    if (b.table) return richTable(b.table, ctx, b.note);
    if (b.stats) return statsBlock(b);
    if (b.quote != null) return `<blockquote class="rs-pq"${protoIf(b.quote)}>${icon('quote')}<p>${prich(b.quote)}</p>${b.by ? `<cite>${prich(b.by)}</cite>` : ''}</blockquote>`;
    return '';
  }
  function postBlocks(blocks, ctx) {
    ctx = ctx || {};
    if (ctx.sec === 'real-company') { const cf = caseFile(blocks || []); if (cf) return cf; }
    return (blocks || []).map((b, i) => postBlock(b, ctx, i)).join('');
  }
  const POST_BP = { sales_leadership: 'vp-sales', revenue_operations: 'vp-revops', marketing: 'cmo' };
  function postGuide(p) {
    return {
      slug: p.slug, post: p, fn: p.fn, group: p.template === 'cost' ? 'costs' : p.fn, cat: p.cat, bp: p.bp || POST_BP[p.cat], opsQ: p.opsQ || '',
      updated: p.updated, mins: Math.max(4, Math.round((p.words || 1400) / 230)),
      q: p.q,
      answer: () => [plainOf(p.answer)],
      sections: () => p.sections.map((x) => ({ id: x.id, h: x.h, html: postBlocks(x.blocks, { slug: p.slug, sec: x.id }) })),
      faq: () => p.faq.map((f) => ({ q: f.q, a: plainOf(f.a) })),
      cta: { label: `Browse ${F.catLabel(p.cat)}`, filters: { roleCategories: [p.cat] } },
    };
  }
  GUIDES.unshift(...POSTS.map(postGuide));
  // A prototype guide a post replaced keeps its link: #guide.<old> is rewritten to the post (router path aliases)
  const POST_ALIASES = (RN.data.posts && RN.data.posts.aliases) || {};
  Object.keys(POST_ALIASES).forEach((old) => { if (POSTS.some((p) => p.slug === POST_ALIASES[old])) RN.pathAliases['guide.' + old] = 'guide.' + POST_ALIASES[old]; });
  // A legacy guide a post replaced is not listed twice: its card goes, and its link lands on the post
  for (let i = GUIDES.length - 1; i >= 0; i--) if (!GUIDES[i].post && RN.pathAliases['guide.' + GUIDES[i].slug]) GUIDES.splice(i, 1);
  // Public shape for other surfaces: { id, title, cat, group, href } (slug and q stay for older callers)
  GUIDES.forEach((g) => { g.id = g.slug; g.title = g.q; g.href = '#guide.' + g.slug; });
  R.guides = GUIDES;
  const guideBy = (slug) => GUIDES.find((g) => g.slug === slug);
  // Resolves a guide id stored before a post replaced it (answers saved in state, admin review)
  const guideFor = (id) => guideBy(POST_ALIASES[id] || id);
  R.guideFor = guideFor;
  const isCost = (g) => g.group === 'costs';
  R.guidesFor = (cat, n) => GUIDES.filter((g) => g.cat === cat).sort((a, b) => (isCost(b) ? 1 : 0) - (isCost(a) ? 1 : 0)).slice(0, n || 2);
  const KIND = {
    'how-to-scope-a-fractional-sales-engagement': 'Scoping', 'fractional-revops-first-90-days': 'First 90 days', 'evaluate-fractional-operator-track-record': 'Due diligence',
    'how-much-should-a-fractional-operator-charge': 'Pricing', 'how-fractional-operators-win-direct-deals': 'Winning work',
    'what-is-the-reputation-index': 'Methodology', 'what-is-core': 'Methodology',
  };
  POSTS.forEach((p) => { if (p.kindL) KIND[p.slug] = p.kindL; });

  const GLOSSARY = [
    { t: 'Fractional', d: () => `${F.engagementTypes.options.find((o) => o.v === 'fractional').d} Usually 20 to 80 hours a month.`, to: 'guide.interim-vs-fractional-vs-full-time-sales-leader' },
    { t: 'Interim', d: () => F.engagementTypes.options.find((o) => o.v === 'interim').d + ' Closer to full time for a defined period.' },
    { t: 'Advisory', d: () => F.engagementTypes.options.find((o) => o.v === 'advisory').d },
    { t: 'Project engagement', d: () => F.engagementTypes.options.find((o) => o.v === 'project').d, to: 'blueprints' },
    { t: 'Available time', d: () => `The hours a month an operator can give a new company, from ${RN.w.label('hoursPerMonth', F.hoursPerMonth.options[0].v)} to ${RN.w.label('hoursPerMonth', F.hoursPerMonth.options.slice(-1)[0].v)}. Companies filter by it; every posted engagement asks for it.` },
    { t: 'Initial term', d: () => `How long the first engagement is agreed for: ${F.term.options.map((o) => o.l).join(', ')}.`, to: 'guide.how-to-scope-a-fractional-sales-engagement' },
    { t: 'Role category', d: () => `The discipline an operator leads. There are ${F.roleCategory.options.length}: ${F.roleCategory.options.map((o) => o.l).join(', ')}.`, to: 'browse' },
    { t: 'Focus area (fit tag)', d: () => 'A specific kind of work, such as Pipeline Inspection or HubSpot admin. Operators call them fit tags and add up to 25; companies see them as focus areas and filter by them.', to: 'library' },
    { t: 'Self-claimed', d: () => 'A focus area the operator added that no company review has confirmed yet. Shown with a dashed outline.', to: 'library' },
    { t: 'Client-verified', d: () => 'A focus area confirmed by at least one company review rated 4.0 or higher. One review verifies it at a score of 50.', to: 'library' },
    { t: 'Expert', d: () => 'A focus area confirmed by five or more company reviews rated 4.0 or higher, scored 85 to 100.', to: 'library' },
    { t: 'Reputation Index', d: () => 'A 0 to 100 score of the company evidence behind a profile, from five published factors. Tiers start at 50.', to: 'guide.what-is-the-reputation-index' },
    { t: 'Emerging', d: () => F.risTier.options.find((t) => t.v === 'emerging').d, to: 'levels' },
    { t: 'CORE', d: () => 'Revenue Nomad\'s company review: Communication, Ownership, Results Focus and Expertise, each rated 1 to 5, plus "Would you hire this operator again?"', to: 'guide.what-is-core' },
    { t: 'Engagement History', d: () => 'The company engagements on an operator\'s profile, with dates, scope and company size, marked verified when the company confirmed them.' },
    { t: 'Engagement Blueprint', d: () => 'A scoped engagement template: role category, typical hours and term, a 30/60/90-day plan, the focus areas it needs and a typical rate range. Post it as is, or adjust the hours, term and start first.', to: 'blueprints' },
    { t: 'GTM Framework', d: () => 'Revenue Nomad\'s map of go-to-market work: six areas across seven customer-journey stages, from Awareness to Expand. Every focus area sits in one cell.', to: 'framework' },
    { t: 'Rate Index', d: () => 'Revenue Nomad\'s benchmark of hourly rates by role category and company revenue range, reported as the 25th percentile, median and 75th percentile each quarter.', to: 'rates' },
    { t: 'Match Signals', d: () => 'Five checks shown to a signed-in company on every profile: company revenue, company size, GTM motion, industry and expertise, scored against the company\'s company profile.' },
    { t: 'Proof link', d: () => 'A private version of an operator\'s profile prepared for one prospect. The prospect is told the operator can see which sections they read.', to: 'guide.how-fractional-operators-win-direct-deals' },
  ];
  R.glossary = GLOSSARY;

  // "Updated Oct 11, 2026 · 7 min read": every card and row on the index carries the date from posts.js
  const stamp = (g) => `Updated ${RN.fmt.date(g.updated + 'T12:00:00')} · ${g.mins} min read`;
  /* One row in a function group: kind, the question, the first sentence of the answer (two lines), the date */
  function qrow(g) {
    const a = g.answer()[0] || '';
    return `<li><a class="rs-qrow" href="#guide.${esc(g.slug)}">
      <span class="rs-qrow-t"><span class="label">${esc(KIND[g.slug] || 'Guide')}</span><h3 class="rs-qrow-q">${disp(g.q)}</h3><span class="small muted clamp-2">${esc(a)}</span><span class="tiny muted">${esc(stamp(g))}</span></span>
      ${icon('arrow')}
    </a></li>`;
  }
  function rateTable(p) {
    for (const sec of (p.sections || [])) for (const b of sec.blocks) if (b.table && (b.table.head || []).some((h) => /hourly rate/i.test(plainOf(h)))) return b.table;
    return null;
  }
  const teamBy = (g, extra) => `<span class="rs-pl-by">${RN.ui.teamAva('ava-sm')}<span><b>By Revenue Nomad Research</b><span class="tiny muted">${esc(stamp(g))}</span></span>${extra || ''}</span>`;
  /* Index card, one layout for every function: kind, the question, the guide's headline number (its key number, the
     big figure instead of a thumbnail), then the date. A card without a key number shows two lines of the answer.
     The lead card ("Start here") adds the short answer and the byline; the cost card adds the rate-by-seat chart. */
  function pcard(g, lead, o) {
    o = o || {};
    const st = g.post && g.post.stat && !gapOnly(g.post.stat.v) ? g.post.stat : null;
    const a = g.answer()[0] || '';
    const num = st ? `<span class="rs-pcard-n"><b class="tnum">${keepRanges(disp(plainOf(st.v)))}</b><span class="small muted">${esc(RN.fmt.smart(plainOf(st.l)))}</span></span>` : '';
    if (lead) {
      return `<a class="card card-link rs-pcard rs-pcard-lead" href="#guide.${esc(g.slug)}">
        <span class="rs-pl">
          <span class="rs-pl-main">
            <span class="label">${esc(KIND[g.slug] || 'Guide')} · Start here</span>
            <h3 class="h2 rs-pcard-q">${disp(g.q)}</h3>
            <span class="rs-pcard-a clamp-3">${esc(RN.fmt.smart(a))}</span>
          </span>
          ${num ? `<span class="rs-pl-side">${num}</span>` : ''}
        </span>
        ${teamBy(g, `<span class="act rs-pl-go">Read the guide${icon('arrow')}</span>`)}
      </a>`;
    }
    const rt = o.rates && g.post ? rateTable(g.post) : null;
    const chart = rt ? rateChart(rt).replace('class="rs-rate"', 'class="rs-rate rs-rate-mini"') : '';
    return `<a class="card card-link rs-pcard${chart ? ' rs-pcard-rates' : ''}" href="#guide.${esc(g.slug)}">
      <span class="label">${esc(KIND[g.slug] || 'Guide')}</span>
      <h3 class="h4 rs-pcard-q">${disp(g.q)}</h3>
      ${chart}
      ${num || `<span class="small muted clamp-2 rs-pcard-s">${esc(RN.fmt.smart(a))}</span>`}
      <span class="rs-gcard-ft"><span class="tiny muted">${esc(stamp(g))}</span>${icon('arrow')}</span>
    </a>`;
  }
  const fnGuides = (k) => GUIDES.filter((x) => (x.fn || x.group) === k);
  const OLD_BLOG = 'https://www.revenuenomad.com';
  const ACTION_L = { merge: 'Merged in', rebuild: 'Rebuilt here', city: 'City page, merged in' };
  const fmtN = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
  // HTML-cell table for the dev notes (cells are already escaped)
  const htbl = (head, rows, cls) => `<div class="tbl-wrap rs-tbl rs-ptbl rs-tbl-stack${cls ? ' ' + cls : ''}"><table class="tbl"><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-l="${esc(head[i] || '')}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const oldUrlCell = (r) => (r.url ? `<span class="mono rs-url">${esc(r.url)}</span>` : `<span class="rs-url-t">${esc(r.title)}</span> ${RN.fn && RN.fn.gap ? RN.fn.gap('exact URL', 'Rapid Neuron') : ''}`);
  // A collapsible dev note in the same shell as the structured-data block
  const devNote = (id, title, note, body) => `<details class="rs-schema rs-notes" id="${esc(id)}">
      <summary>${icon('doc')}<span><b>${esc(title)}</b><span class="tiny muted">${esc(note)}</span></span>${icon('chev-down', 'rs-chev')}</summary>
      <div class="rs-schema-bd rs-notes-bd">${body}</div>
    </details>`;
  // The page title's last mark in vermilion (the brand full stop, one per H1)
  const vmEnd = (html) => String(html).replace(/([.?!])(<\/span>)?$/, (m, c, close) => (close ? `</span><span class="vm">${c}</span>` : `<span class="vm">${c}</span>`));

  function renderGuides() {
    chartFns = {};
    const schema = {
      '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Fractional GTM glossary', url: 'https://revenuenomad.com/guides#glossary',
      hasDefinedTerm: GLOSSARY.map((x) => ({ '@type': 'DefinedTerm', name: x.t, description: x.d() })),
    };
    const grp = (k) => GROUPS.find((x) => x.k === k);
    const count = (k) => (['sales', 'revops', 'marketing'].includes(k) ? fnGuides(k) : GUIDES.filter((x) => x.group === k)).length;
    // Section heading on the hub rhythm: eyebrow, H2 and description 16px apart, then 32px to the cards
    const grpHd = (g, extra) => `<div class="sec-head rs-ggrp-hd"><span class="eyebrow">${esc(plural(count(g.k), 'guide'))}</span><div class="rs-ggrp-row"><h2 class="h2" id="rs-g-${g.k}-t">${esc(g.l)}</h2>${extra || ''}</div><p class="rs-ggrp-d">${esc(g.d)}</p></div>`;
    const homeLink = (g) => (g.home ? `<a class="act rs-ghome" href="#${esc(g.home)}">${esc(g.l)} home${icon('arrow')}</a>` : '');
    const sales = fnGuides('sales');
    const costs = F.roleCategory.options.map((o) => ({ o, g: GUIDES.find((x) => x.cat === o.v && isCost(x)) })).filter((x) => x.g && (x.g.post || RIX().byCat[x.o.v]));
    const redirects = POSTS.flatMap((p) => (p.replaces || []).map((r) => ({ r, p })));
    let costBar = () => '';
    const known = redirects.filter((x) => x.r.impressions != null);
    return `<div class="rs rs-guides">
    <header class="wrap phead rs-head">
      ${crumbs([{ l: 'Guides' }])}
      <span class="eyebrow">Guides</span>
      <h1 class="h1">Straight answers on <span class="serif">fractional go-to-market</span><span class="vm">.</span></h1>
      <p class="lede">Each guide answers one question a client asks before hiring, in the first few lines, then shows the numbers behind it from Revenue Nomad's own engagements.</p>
      <a class="rs-ghero-by" href="#report">${RN.ui.teamAva('ava-md')}<span><span class="label">Written by</span><b>Revenue Nomad Research</b><span class="small muted">From our engagements and the Rate Index</span></span></a>
      <p class="rs-gnew small" data-proto>${icon('book')}<span><b>New in October 2026.</b> ${POSTS.length} guides rebuilt from the blog and the content plan, with ${(POSTS.reduce((n, p) => n + (p.replaces || []).length, 0))} older posts merged into them.</span></p>
    </header>
    <nav class="rs-gjump-bar" aria-label="Guide groups"><div class="wrap row rs-gjump">${GROUPS.map((g) => `<button type="button" class="chip" data-act="rs-scroll" data-to="rs-g-${g.k}">${esc(g.l)}<span class="tiny muted">${count(g.k)}</span></button>`).join('')}<button type="button" class="chip" data-act="rs-scroll" data-to="rs-glossary">Glossary<span class="tiny muted">${GLOSSARY.length}</span></button></div></nav>
    <section class="wrap sec rs-ggrp" id="rs-g-sales" aria-labelledby="rs-g-sales-t">
      ${grpHd(grp('sales'), homeLink(grp('sales')))}
      <div class="rs-pgrid rs-pgrid-top">${pcard(sales[0], true)}${sales[1] ? pcard(sales[1], false, { rates: true }) : ''}</div>
      <div class="rs-pgrid rs-pgrid-more">${sales.slice(2).map((g) => pcard(g)).join('')}</div>
    </section>
    ${['revops', 'marketing'].map((k) => { const list = fnGuides(k); const G = grp(k); return `<section class="wrap sec rs-ggrp" id="rs-g-${k}" aria-labelledby="rs-g-${k}-t">
      ${grpHd(G, homeLink(G))}
      <div class="rs-pgrid rs-pgrid-4 rs-pgrid-more">${list.map((g) => pcard(g)).join('')}${list.length % 4 ? `<a class="card card-link rs-pcard rs-pcard-home" href="#${esc(G.home)}"><span class="label">${esc(G.l)}</span><h3 class="h4 rs-pcard-q">Who you get, what it costs, what happens first</h3><span class="small muted clamp-2 rs-pcard-s">Vetted ${esc(F.catLabel(G.cat))} operators and the Talk to us form.</span><span class="rs-gcard-ft"><span class="tiny muted">${esc(G.l)} home</span>${icon('arrow')}</span></a>` : ''}</div>
    </section>`; }).join('')}
    <section class="wrap sec rs-ggrp" id="rs-g-costs" aria-labelledby="rs-g-costs-t">
      ${grpHd(grp('costs'), `<a class="act rs-ghome" href="#fractional-cost">The cost hub${icon('arrow')}</a>`)}
      <div class="card rs-costs" data-rs-draw="costs">${(() => {
        // One hourly scale for every row: a bar for a quoted range, a dot for a median
        const hourly = costs.map(({ o, g }) => (g.post && g.post.headline ? money(g.post.headline.rate) : RIX().byCat[o.v] ? { lo: RIX().byCat[o.v].p50, hi: RIX().byCat[o.v].p50 } : null));
        const top = Math.ceil(Math.max(...hourly.filter(Boolean).map((x) => x.hi)) / 50) * 50;
        costBar = (i) => { const x = hourly[i]; return x ? `<span class="rs-cost-bar" aria-hidden="true"><i class="${x.hi === x.lo ? 'is-pt' : ''}" data-draw="${x.hi === x.lo ? 'fade' : 'x'}" style="left:${(x.lo / top * 100).toFixed(1)}%;width:${((x.hi - x.lo) / top * 100).toFixed(1)}%"></i></span>` : ''; };
        return '';
      })()}${costs.map(({ o, g }, ci) => {
        const p = g.post;
        if (p && p.headline) {
          const h = p.headline;
          return `<a class="rs-cost rs-cost-real" href="#guide.${esc(g.id)}">
          <span class="rs-cost-k"><span><b>${esc(g.title)}</b><span class="tiny muted">${esc(o.l)} · ${esc(plainOf(h.basis))}</span></span></span>
          <span class="rs-cost-v"><span class="label">${esc(h.rateL)}</span><b class="tnum">${esc(NB(plainOf(h.rate)))}</b>${costBar(ci)}</span>
          <span class="rs-cost-v"><span class="label">${esc(h.monthL)}</span><b class="tnum">${esc(NB(plainOf(h.month)))}</b></span>
          ${icon('arrow')}</a>`;
        }
        const b = RIX().byCat[o.v]; const hh = (COST[o.v] && COST[o.v].hours) || '40';
        return `<a class="rs-cost" href="#guide.${esc(g.id)}">
          <span class="rs-cost-k"><span><b>${esc(g.title)}</b><span class="tiny muted rs-cost-b">${esc(o.l)} · Rate Index ${illus()}</span></span></span>
          <span class="rs-cost-v"><span class="label">An hour, median</span><b class="tnum">${hr(b.p50)}</b>${costBar(ci)}</span>
          <span class="rs-cost-v"><span class="label">A month, ${esc(hh)} hrs</span><b class="tnum">${esc(NB(monthRange(o.v, hh, '5m_20m').replace(/\/month$/, '')))}</b></span>
          ${icon('arrow')}</a>`;
      }).join('')}</div>
      <p class="rs-src rs-src-note">${icon('info')}<span>Sales leadership and marketing rows are what clients paid or were quoted in our 2026 engagements. The other rows are Rate Index medians and a typical month for a $5M to $20M company, illustrative until the first survey closes. Companies pay no platform fee; hiring an operator full time later carries a 20% conversion fee.</span></p>
      ${RN.contrib ? `<div class="rs-gcontrib">${RN.contrib.cta('rates', { variant: 'band', ctx: { source: 'guides' } })}</div>` : ''}
    </section>
    <div class="wrap sec"><div class="grid g-2 rs-gpair">${['operators', 'methods'].map((k) => `<section class="rs-ggrp" id="rs-g-${k}" aria-labelledby="rs-g-${k}-t">
        ${grpHd(grp(k))}
        <ul class="rs-qlist">${GUIDES.filter((x) => x.group === k).map(qrow).join('')}</ul>
      </section>`).join('')}</div></div>
    <section class="wrap sec" id="rs-glossary" aria-labelledby="rs-gl-t">
      <div class="sec-head rs-ggrp-hd"><span class="eyebrow">Glossary</span><h2 class="h2" id="rs-gl-t">The words we use, defined once</h2><p class="rs-ggrp-d">The same terms appear on every profile, posted engagement, review and report on Revenue Nomad.</p></div>
      <div class="rs-gloss card">
        ${(() => { const term = (x) => `<div class="rs-gl-i" id="rs-term-${esc(RN.slug(x.t))}"><dt>${esc(x.t)}</dt><dd>${esc(x.d())}${x.to ? ` <a class="rs-gl-a" href="#${esc(x.to)}" aria-label="More on ${esc(x.t)}">More${icon('arrow')}</a>` : ''}</dd></div>`;
          return `<dl class="rs-gl">${GLOSSARY.slice(0, 6).map(term).join('')}</dl>
          <details class="rs-gl-more"><summary><span>Show all ${GLOSSARY.length} terms</span>${icon('chev-down', 'rs-chev')}</summary><dl class="rs-gl">${GLOSSARY.slice(6).map(term).join('')}</dl></details>`; })()}
      </div>
      <div class="stack" style="--gap:12px;margin-top:20px">
        ${schemaBlock('rs-gl-schema', schema, 'For the dev team: DefinedTermSet markup for the glossary')}
        ${redirects.length ? devNote('rs-redirects', 'Redirects from the old blog', `For Rapid Neuron: ${redirects.length} old posts fold into ${POSTS.filter((p) => (p.replaces || []).length).length} guides. 301 each one when its guide goes live.`, `
          <p class="small">Search Console figures are the May 2026 export (clicks, impressions, average position). The ${known.length} posts with figures earned ${fmtN(known.reduce((n, x) => n + (x.r.clicks || 0), 0))} clicks on ${fmtN(known.reduce((n, x) => n + (x.r.impressions || 0), 0))} impressions. Posts published after May have no figures yet, and their exact URLs need confirming. The ad landing pages (/hire-fractional-vp-of-sales-in-new-york, -atlanta, -boston and /fractional-vp/vp-new-york) are not on this list. They go to the sales leadership home once the old Google Ads destinations are checked.</p>
          ${htbl(['Old post', 'New guide', 'What happens', 'Clicks', 'Impressions'], redirects.map(({ r, p }) => [oldUrlCell(r), `<a href="#guide.${esc(p.slug)}" class="mono rs-url">/post/${esc(p.slug)}</a>`, esc(ACTION_L[r.action] || r.action), ...(r.impressions == null ? ['<span class="muted">Not in the May export</span>', ''] : [esc(fmtN(r.clicks)), esc(fmtN(r.impressions))])]), 'rs-redir-tbl')}
          ${(RN.data.posts.candidates || []).length ? `<h3 class="h5">Candidates for the team to approve</h3><p class="small">Older posts on the same questions, not yet on the map. Each would 301 to the guide named, once that guide answers the old page's query.</p>
          ${htbl(['Old post', 'Would go to', 'Impressions'], RN.data.posts.candidates.map((c) => [`<span class="mono rs-url">${esc(c.url)}</span>`, `<a href="#guide.${esc(c.to)}" class="mono rs-url">/post/${esc(c.to)}</a>`, esc(fmtN(c.impressions))]), 'rs-redir-tbl')}` : ''}`) : ''}
      </div>
    </section>
    </div>`;
  }

  /* ---------- One answer post (content playbook template) ----------
     The client's question, "By Revenue Nomad Research · Updated · Reviewed by", the direct answer, key numbers with sources,
     H2s phrased as questions, the FAQ, then the function's Talk to us block and two operators. No eyebrow above the
     headline (playbook, Voice and style). The dev notes carry the meta fields, the 301s from the old blog with their
     Search Console numbers, the open gaps and the calculated numbers the team still has to approve. */
  // Phones and tablets lose the rail, so the contents fold into the article under the key numbers
  const mtoc = (toc) => `<details class="rs-mtoc"><summary>${icon('list')}<span>On this page</span><span class="tiny muted">${toc.length} sections</span>${icon('chev-down', 'rs-chev')}</summary>
    <ol>${toc.map((t) => `<li><button type="button" data-act="rs-scroll" data-to="rs-s-${esc(t.id)}">${disp(t.h)}</button></li>`).join('')}</ol></details>`;
  /* Byline: the company is the author (founder decision Oct 12, 2026), then updated, read time, reviewer */
  function postByline(upd, mins, rev) {
    return `<div class="rs-byline">
      <a class="rs-by-pic" href="#about" tabindex="-1" aria-hidden="true">${RN.ui.teamAva('ava-md rs-by-ava')}</a>
      <span class="rs-by-txt">
        <span class="rs-by-l"><a class="rs-by-who" href="#about">By Revenue Nomad Research</a></span>
        <span class="rs-by-meta"><span>Updated <time datetime="${esc(upd)}">${esc(RN.fmt.date(upd + 'T12:00:00'))}</time> · ${mins} min read</span>${rev || ''}</span>
      </span>
    </div>`;
  }
  /* Key numbers as a stat band: the value up to its first comma is the number, the rest of the value, the key and
     its source sit under it. A value that is only a pending figure is a prototype tile (data-proto) and sorts last. */
  function splitKey(v) {
    const s = String(v || '');
    let depth = 0;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === '[' && s[i + 1] === '[') depth++;
      else if (s[i] === ']' && s[i + 1] === ']') depth--;
      else if (!depth && s[i] === ',' && s[i + 1] === ' ') return { h: s.slice(0, i), t: s.slice(i + 2) };
    }
    return { h: s, t: '' };
  }
  /* Click-to-share on a key number: a small Share pill at the end of the tile's source line (opens RN.share's sheet,
     operators get "Share with your take"). The shared text is the number, its key and the source, in plain words. */
  const kbShare = (num, key, src, g) => {
    if (!RN.share || !num) return '';
    const sent = (t) => { t = String(t || '').trim(); return t && !/[.?!]$/.test(t) ? t + '.' : t; };
    const quote = `${sent(num)} ${sent(key)}${src ? ` Source: ${src}.` : ''}`.replace(/\s+/g, ' ').trim();
    const o = { title: g.post ? g.post.q : g.q, route: 'guide.' + g.slug, quote, kind: 'key-number' };
    return `<button type="button" class="shr-q-btn rs-kb-sh" data-act="shr-open" data-share="${esc(JSON.stringify(o))}" aria-label="${esc('Share this number: ' + num)}">${icon('share')}<span>Share</span></button>`;
  };
  /* Key numbers, two tiles (clarity and ratio audits, Oct 14, 2026). The first is the guide's headline number at about
     56px, the same figure its index card shows, with the source of the key it summarises; the second is the next key
     number. Every key number, with its source, stays listed under "The numbers in this guide" at the foot of the
     article. A key still waiting for a figure is a reviewer-only tile (data-proto). */
  function keyTiles(keys, stat) {
    const live = (keys || []).filter((k) => !gapOnly(k.v));
    return live.slice(0, 2).map((k, i) => {
      const v = splitKey(k.v);
      if (i === 0 && stat && !gapOnly(stat.v)) return { v: stat.v, k: stat.l, x: '', src: k.src, url: k.url };
      return { v: v.h, k: k.k, x: v.t, src: k.src, url: k.url };
    });
  }
  const srcLink = (k) => (k.url ? `<a class="link" href="${esc(k.url)}" target="_blank" rel="noopener">${esc(plainOf(k.src))}</a>` : esc(plainOf(k.src)));
  function keyBand(keys, g, stat) {
    const tiles = keyTiles(keys, stat);
    const pend = (keys || []).filter((k) => gapOnly(k.v));
    const tile = (t, i) => `<div class="rs-kb-i${i === 0 ? ' is-lead' : ''}">
          <span class="rs-kb-v">${prich(t.v)}</span>
          <span class="rs-kb-k">${prich(t.k)}${t.x ? `<span class="rs-kb-x">${prich(plainOf(t.x).charAt(0).toUpperCase() + plainOf(t.x).slice(1) + (/[.?!]$/.test(plainOf(t.x)) ? '' : '.'))}</span>` : ''}</span>
          ${t.src ? `<span class="rs-kb-s">${icon('info')}<span class="rs-kb-src">${srcLink(t)}</span>${kbShare(plainOf(t.v), plainOf(t.k), plainOf(t.src), g)}</span>` : ''}
        </div>`;
    return `<section class="rs-kb" data-n="${tiles.length}" aria-label="Key numbers">
      <span class="label rs-kb-l">Key numbers</span>
      <div class="rs-kb-g">${tiles.map(tile).join('')}${pend.map((k) => `<div class="rs-kb-i" data-proto><span class="rs-kb-v">${prich(k.v)}</span><span class="rs-kb-k">${prich(k.k)}</span><span class="rs-kb-s">${icon('info')}<span class="rs-kb-src">${srcLink(k)}</span></span></div>`).join('')}</div>
    </section>`;
  }
  // Every key number with its source, folded at the foot of the article (for citing; the top shows two)
  function keyList(keys) {
    const live = (keys || []).filter((k) => !gapOnly(k.v));
    if (!live.length) return '';
    return `<details class="rs-kb-all"><summary>${icon('list')}<span>The numbers in this guide, with sources</span><span class="tiny muted">${live.length}</span>${icon('chev-down', 'rs-chev')}</summary>
      <ul class="rs-kb-list">${live.map((k) => `<li class="rs-kb-i rs-kb-row"><b class="tnum">${prich(k.v)}</b><span>${prich(k.k)}</span><span class="rs-kb-src tiny muted">${srcLink(k)}</span></li>`).join('')}</ul>
    </details>`;
  }

  // Keep reading: three plain links at the foot of the article, not a second copy of the index cards
  const moreLinks = (list) => (list.length ? `<nav class="rs-more-g" aria-label="Keep reading"><span class="label">Keep reading</span><ul>${list.map((x) => `<li><a href="#guide.${esc(x.slug)}">${disp(x.post ? x.post.q : x.q)}${icon('arrow')}</a></li>`).join('')}</ul></nav>` : '');
  /* An operator who does this work, inside the article (layout audit, Oct 14, 2026): the visitor who reads this far wants a
     specific operator, so the card's action is Request intro. One card sits after the first table, one after the
     real-company case. Talk to us stays the page's main path (owner, Oct 14): rail, contents and the closing strip. */
  const inOp = (x, g) => {
    const catL = F.catLabel(g.cat);
    return `<aside class="rs-prel rs-inop" aria-label="${esc(catL)} operator who does this work">
      <div class="rs-inop-hd"><span class="label">From the network</span><b class="rs-inop-t">${esc(catL)} operators who do this work</b>
        <a class="act" href="#browse.${esc(g.cat)}" data-act="rs-browse-cat" data-cat="${esc(g.cat)}" data-src="guide_${esc(g.slug)}">Browse ${esc(catL)}${icon('arrow')}</a></div>
      ${RN.ui.opCard(x.op, { compact: true, why: relWhy(x), cta: 'invite', ctaAct: 'intro-open', ctaLabel: 'Request intro' })}
    </aside>`;
  };
  // Where the two cards go: after the first section with a table (else the second section), then after the case
  function opSlots(sections, n) {
    const last = sections.length - 1;
    let a = sections.findIndex((x) => (x.blocks || []).some((b) => b.table));
    if (a < 0) a = Math.min(1, last);
    let b = sections.findIndex((x) => x.id === 'real-company');
    if (b < 0 || b === a) {
      b = a + 2;
      // No room after the table: the closing section never sits between two cards, so the first card moves up
      if (b >= last && a >= 2) { b = a; a -= 2; } else b = Math.min(last, b);
    }
    return n > 1 && b !== a ? [a, b] : [a];
  }
  // The guide's closing strip: one line and one Talk to us button, on night (it replaces the 387px form band)
  const talkStrip = (h, to, sub) => `<section class="night rs-ptalk" id="rs-s-talk" aria-labelledby="rs-ptalk-t"><div class="wrap rs-ptalk-in">
      <h2 class="rs-ptalk-h" id="rs-ptalk-t">${esc(h)}</h2>
      ${sub ? `<span class="rs-ptalk-sub">${esc(sub)}</span>` : ''}
      <span class="fn-form-cta"><a class="btn btn-leaf" href="#${esc(to)}">Talk to us${icon('arrow')}</a></span>
    </div></section>`;
  // The rail card: Talk to us first (owner, Oct 14, 2026), then a text link to the role's rates
  const railCta = (h, sub, to, cat) => `<div class="card rs-rail-cta rs-rail-talk">
      <b class="h5">${esc(h)}</b>
      <p class="small muted">${esc(sub)}</p>
      <a class="btn btn-block" href="#${esc(to)}">Talk to us${icon('arrow')}</a>
      ${cat ? `<a class="rs-rail-link" href="#rates.${esc(cat)}">${esc(F.catLabel(cat))} rates${icon('arrow')}</a>` : ''}
    </div>`;
  function renderPost(g) {
    const p = g.post;
    const grp = GROUPS.find((x) => x.k === p.fn);
    const FN = RN.fn || {};
    const gap = (w, o) => (FN.gap ? FN.gap(w, o) : esc(w));
    const secs = g.sections();
    const rel = relatedOps(g).slice(0, 2);
    const page = (FN.pages && FN.pages[p.fn]) || { fn: p.fn, need: p.need, form: { h: 'Tell us what you need', lede: '' } };
    const talk = 'talk.' + p.need;
    const plainFaq = (/\?$/.test(p.q) ? [{ q: p.q, a: plainOf(p.answer) }] : []).concat(p.faq.map((f) => ({ q: f.q, a: plainOf(f.a) })));
    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', headline: p.q, description: p.metaDescription, datePublished: p.publish || p.updated, dateModified: p.updated, mainEntityOfPage: `${OLD_BLOG}/post/${p.slug}`,
          author: { '@type': 'Organization', name: 'Revenue Nomad', url: OLD_BLOG },
          publisher: { '@type': 'Organization', name: 'Revenue Nomad', url: OLD_BLOG } },
        { '@type': 'BreadcrumbList', itemListElement: [['Guides', `${OLD_BLOG}/guides`], [grp.l, `${OLD_BLOG}/${grp.home}`], [p.q, `${OLD_BLOG}/post/${p.slug}`]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) },
        { '@type': 'FAQPage', mainEntity: plainFaq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) },
      ],
    };
    const others = (p.related || []).map(guideBy).filter(Boolean)
      .concat(GUIDES.filter((x) => x.post && x.fn === p.fn && x.slug !== p.slug && !(p.related || []).includes(x.slug)))
      .concat(GUIDES.filter((x) => x.post && x.slug !== p.slug))
      .filter((x, i, a) => a.indexOf(x) === i && x.slug !== p.slug).slice(0, 3);
    const ans = answersBlock(g);
    const toc = secs.map((x) => ({ id: x.id, h: x.h })).concat([{ id: 'faq', h: 'Common questions' }], ans ? [{ id: 'answers', h: 'Operators who answered' }] : [], [{ id: 'talk', h: 'Talk to us' }]);
    const slots = opSlots(p.sections, rel.length);
    const reps = p.replaces || [];
    const notes = `<dl class="rs-notes-dl">
        <div><dt>URL</dt><dd class="mono">/post/${esc(p.slug)}</dd></div>
        <div><dt>Meta title</dt><dd>${esc(p.metaTitle)} <span class="tiny muted">${p.metaTitle.length} characters</span></dd></div>
        <div><dt>Meta description</dt><dd>${esc(p.metaDescription)} <span class="tiny muted">${p.metaDescription.length} characters</span></dd></div>
        <div><dt>Search term</dt><dd>${esc(p.term)}</dd></div>
        <div><dt>AI prompt to track</dt><dd>${esc(p.prompt)}</dd></div>
        <div><dt>Persona</dt><dd>${esc(p.persona)}</dd></div>
        <div><dt>Publish</dt><dd>${p.publish ? `Scheduled for ${esc(RN.fmt.date(p.publish + 'T12:00:00'))} in the content calendar` : 'A rebuild of a live post. Publish once its pending items close.'}</dd></div>
        <div><dt>Built from</dt><dd>${esc(p.base)}</dd></div>
      </dl>
      ${reps.length ? `<h3 class="h5">301s into this page</h3>${htbl(['Old post', 'What happens', 'Clicks', 'Impressions', 'Avg position'], reps.map((r) => [oldUrlCell(r), esc(ACTION_L[r.action] || r.action), ...(r.impressions == null ? ['<span class="muted">Not in the May export</span>', '', ''] : [esc(fmtN(r.clicks)), esc(fmtN(r.impressions)), esc(String(r.position))])]))}<p class="tiny muted">Search Console, May 2026 export. Blank figures mean the post went up after the export.</p>` : ''}
      ${(p.gaps || []).length ? `<h3 class="h5">Still pending</h3><ul class="rs-notes-gaps">${p.gaps.map((x) => `<li>${gap(x.what, x.owner)}</li>`).join('')}</ul>` : ''}
      ${(p.flags || []).length ? `<h3 class="h5">For the team to approve</h3><ul class="rs-notes-flags">${p.flags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;

    return `<div class="rs rs-guide-pg rs-post-pg">
    <div class="wrap rs-guide">
      <article class="rs-art" aria-labelledby="rs-g-h1">
        ${crumbs([{ l: 'Guides', to: 'guides' }, { l: grp.l }])}
        <h1 class="h1 rs-g-h1" id="rs-g-h1">${vmEnd(disp(p.q))}</h1>
        ${postByline(p.updated, g.mins, `<span class="rs-by-rev" data-proto>Reviewed by ${gap('reviewing operator', 'Matt')}</span>`)}
        <div class="rs-answer" role="note" aria-label="Short answer">
          <span class="label">The short answer</span>
          <p>${prich(p.answer)}</p>
        </div>
        ${keyBand(p.keys, g, p.stat)}
        ${mtoc(toc)}
        <div class="rs-prose">
          ${secs.map((x, i) => `<section id="rs-s-${esc(x.id)}" class="prose rs-gsec rs-gsec-${esc(x.id)}"><h2>${disp(x.h)}</h2>${x.html}</section>${slots.indexOf(i) >= 0 && rel[slots.indexOf(i)] ? inOp(rel[slots.indexOf(i)], g) : ''}`).join('')}
        </div>
        <section id="rs-s-faq" class="rs-faq" aria-labelledby="rs-faq-t">
          <h2 class="h3" id="rs-faq-t">Common questions</h2>
          ${p.faq.map((f) => `<details class="rs-faq-i"><summary><span>${disp(f.q)}</span>${icon('chev-down', 'rs-chev')}</summary><p>${prich(f.a)}</p></details>`).join('')}
        </section>
        ${ans}
        ${closingBlock(g)}
        ${moreLinks(others)}
        <footer class="rs-gfoot">
          <p class="small muted">Built from Revenue Nomad's 2026 engagements and the outside sources linked in the key numbers. <span data-proto>A pending chip marks a figure or quote we do not have yet. </span>Cite as "Revenue Nomad, ${esc(RN.fmt.monthYear(p.updated + 'T12:00:00'))}".</p>
          ${keyList(p.keys)}
          ${devNote('rs-post-notes', 'Publishing notes', 'For the team: meta fields, the 301s from the old blog, what is still pending', notes)}
          ${schemaBlock('rs-faq-schema', schema, 'For the dev team: Article, BreadcrumbList and FAQPage JSON-LD. Add reviewedBy once the reviewing operator signs off, and an image hosted on revenuenomad.com.')}
        </footer>
      </article>
      <aside class="rs-rail" aria-label="On this page">
        <div class="rs-rail-in">
          <div class="rs-toc"><span class="label">On this page</span>
            <div class="rs-toc-list"><span class="rs-toc-prog" aria-hidden="true"><i></i></span><ul>${toc.map((t) => `<li><button type="button" data-act="rs-scroll" data-to="rs-s-${esc(t.id)}">${disp(t.h)}</button></li>`).join('')}</ul></div>
          </div>
          ${railCta(page.form.h, 'Four short questions. Only your name and email are required.', talk, g.cat)}
        </div>
      </aside>
    </div>
    ${talkStrip(page.form.h, talk, 'Four short questions. A role profile and 2 to 3 vetted operators, often within 48 hours.')}
    </div>`;
  }


  /* Operator answers (value: an input operators control). Stored in state.answers as
     { id, guideId, opId, text, engagementId, engagement: {company, role}, status: 'in_review' | 'approved', createdAt }; the team approves them.
     Approved answers show with a byline and profile link. They earn placement here, never Reputation Index points.
     Operators add one from the closing block ("Add a field note", RN.contrib's 'insight' flow, which writes the same record),
     so this section only lists approved answers. */
  const answersFor = (id) => (RN.store.state.answers || []).filter((a) => (POST_ALIASES[a.guideId] || a.guideId) === id);
  const engKey = (e) => e.id || `${e.company}|${e.start || ''}`;
  function answersBlock(g) {
    const live = answersFor(g.id).filter((a) => a.status === 'approved' && RN.model.byId(a.opId));
    if (!live.length) return '';
    const card = (a) => {
      const op = RN.model.byId(a.opId);
      const eng = (op.engagements || []).find((e) => engKey(e) === a.engagementId) || (a.engagement ? { company: a.engagement.company, clientVerified: false } : null);
      return `<article class="rs-ans">
        <div class="rs-ans-by">${RN.ui.avatar(op, 'ava-sm')}<span><a class="rs-ans-n" href="#op.${esc(op.slug)}">${esc(op.name)}</a><span class="tiny muted">${esc(op.role)}${eng ? ` · Proof: ${esc(eng.company)}${eng.clientVerified ? ', company-verified' : ''}` : ''}</span></span>${RN.ui.ris(op)}</div>
        <p class="rs-ans-t">${esc(a.text)}</p>
      </article>`;
    };
    return `<section id="rs-s-answers" class="rs-answers" aria-labelledby="rs-ans-t">
      <h2 class="h3" id="rs-ans-t">Operators who answered</h2>
      <div class="rs-ans-list">${live.map(card).join('')}</div>
    </section>`;
  }

  /* ---------- Closing block (bottom of every guide and answer post) ----------
     ONE compact card, in this order: a topic-matched one-tap question that feeds a dataset (cost guides ask what a seat
     cost and lead into 'paid' or 'rate'; the rest ask a Pulse or 2028-report question), the share row (operators also
     get "Share with your take"), "Add a field note" for operators, and the Pulse sign-up unless already subscribed.
     Everything comes from RN.contrib / RN.share; the sign-up is the Insights one (RN.ins.newsSlot). */
  const CLOSE_Q = {
    'how-to-hire-a-fractional-vp-of-sales': 'pulse-hiring',
    'fractional-vp-of-sales-first-90-days': 'topic-length',
    'interim-vs-fractional-vs-full-time-sales-leader': 'topic-hours',
    'how-to-stop-running-sales-as-a-founder': 'pulse-problem',
    'sales-meetings-not-converting': 'pulse-problem',
    'fractional-cro-vs-full-time-cro': 'pulse-hiring',
    'how-to-scope-a-fractional-sales-engagement': 'topic-hours',
    'revops-vs-sales-ops': 'pulse-hiring',
    'fractional-revops-consultant': 'pulse-problem',
    'how-to-fix-sales-forecast-accuracy': 'pulse-outlook',
    'fractional-revops-first-90-days': 'topic-length',
    'how-to-hire-a-fractional-cmo': 'topic-first-seat',
    'fractional-cmo-vs-agency': 'pulse-outlook',
    'how-fractional-operators-win-direct-deals': 'pulse-hiring',
    'evaluate-fractional-operator-track-record': 'topic-length',
    'what-is-the-reputation-index': 'pulse-outlook',
    'what-is-core': 'pulse-problem',
  };
  // "What does a fractional VP of Sales cost" -> "a fractional VP of Sales"
  const seatOf = (g) => { const m = /does (an? fractional .+?) cost/i.exec(g.q || ''); return m ? m[1].replace(/^(an?) /i, (x, a) => a.toLowerCase() + ' ') : ''; };
  R.closeQuestion = (g) => (isCost(g) ? 'topic-cost' : g.group === 'operators' && !CLOSE_Q[g.slug] ? 'rates' : CLOSE_Q[g.slug] || 'pulse-hiring');
  const firstSentences = (t, max) => { const x = plainOf(t).replace(/\s+/g, ' ').trim(); if (x.length <= max) return x; const cut = x.slice(0, max); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? ')); return end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…'; };
  function closingBlock(g) {
    const CX = RN.contrib, SH = RN.share;
    if (!CX || !SH) return '';
    const qid = R.closeQuestion(g);
    const ctx = { cat: g.cat || '', source: 'guide-' + g.slug };
    const seat = seatOf(g);
    if (seat) ctx.seat = seat;
    // Operator-audience guides without a question ask for a rate (a known company viewer gets 'what you paid')
    const ask = qid === 'rates' ? CX.cta(CX.side() === 'company' ? 'rates' : 'rate', { variant: 'band', ctx }) : CX.pulse(qid, ctx);
    const quote = firstSentences(g.post ? g.post.answer : g.answer().join(' '), 240);
    const note = CX.cta('insight', { variant: 'line', ctx: { guideId: g.id, source: 'guide-close' } });
    const news = !CX.subscribed() && RN.ins && RN.ins.newsSlot ? `<div class="rs-close-news">
        <p class="rs-close-news-t"><b>The Fractional GTM Pulse</b><span>Once a quarter, the Rate Index, the Demand Index and new research. Free.</span></p>
        ${RN.ins.newsSlot('guide')}
      </div>` : '';
    return `<section class="rs-close" id="rs-s-close" aria-label="Add to the research and share this guide">
      <div class="rs-close-ask">${ask}</div>
      <div class="rs-close-ft">
        ${SH.row({ title: g.post ? g.post.q : g.q, route: 'guide.' + g.slug, quote, kind: 'guide', label: 'Share this guide' })}
        ${note ? `<div class="rs-close-note">${note}</div>` : ''}
        ${news}
      </div>
    </section>`;
  }

  /* The guide's "From the network" module: search results for the guide's topic in its role category, then the
     highest Reputation Index. Every operator is ranked by the same rules. Returns RN.model.search rows {op, why}. */
  /* A related operator card's reason line: the match reason, else the score from Proven up (the card rule: no score for Emerging) */
  const relWhy = (x) => (x.why && x.why[0]) || (RN.ui.tierShown((RN.fields.risTierFor(x.op.ris && x.op.ris.score) || {}).v) ? `Reputation Index ${x.op.ris.score}` : '');
  function relatedOps(g) {
    const f = g.cat ? { roleCategories: [g.cat] } : {};
    // The founder's own operator listing is never the one a company-voice guide singles out (founder decision Oct 12, 2026)
    const ok = (x) => !x.op.isMatt;
    let rel = g.opsQ ? RN.model.search({ q: g.opsQ, filters: f }).filter(ok).slice(0, 3) : [];
    if (rel.length < 4) rel = rel.concat(RN.model.search({ filters: f, sort: 'ris' }).filter((x) => ok(x) && !rel.some((y) => y.op.id === x.op.id))).slice(0, 4);
    // Guides on the same topic would all open on the same operator, so each guide starts at its own place in the top 4
    if (g.post && rel.length > 1) { const h = String(g.slug || '').split('').reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7); const k = h % rel.length; rel = rel.slice(k).concat(rel.slice(0, k)); }
    return rel.slice(0, 3);
  }
  // Same count the page shows: answer posts end on 2 operator cards (playbook template), older guides show 3
  R.relatedOps = (g) => { const x = typeof g === 'string' ? guideFor(g) || {} : g; return relatedOps(x).slice(0, x.post ? 2 : 3); };

  // Talk to us with the need already picked, for guides that predate the posts (role category -> the function's need)
  const NEED_OF = { sales_leadership: 'sales_motion', sales_enablement: 'sales_motion', sellers: 'sales_motion', revenue_operations: 'systems', marketing: 'pipeline' };
  const RI_SRC = () => [SRC_RI(), SRC_REP()];
  function renderGuide(slug) {
    chartFns = {};
    const g = guideBy(slug);
    if (g && g.post) return renderPost(g);
    if (!g) {
      return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'book', title: 'We could not find that guide', body: 'It may have moved. Every guide is listed on the Guides page.', cta: '<a class="btn" href="#guides">See all guides</a>' })}</section>`;
    }
    const grp = GROUPS.find((x) => x.k === g.group);
    const answer = g.answer();
    const secs = g.sections().filter((s) => s.html);
    const faq = g.faq();
    const stats = g.stats ? g.stats() : [];
    const persona = RN.store.state.persona;
    // Byline: Revenue Nomad Research is the author. The reviewer is the highest Reputation Index sample operator in the
    // guide's category, so no real operator is named as a reviewer without their OK; no sample in that category: pending.
    const reviewer = g.cat ? RN.model.ops.filter((o) => o.sample && !o.hidden && o.catKey === g.cat).sort((a, b) => RN.fields.risRank(b) - RN.fields.risRank(a))[0] : null;
    const rel = relatedOps(g);
    const bp = blueprintFor(g.cat, g.bp);
    const client = R.isClientGuide(g);
    // Rate Index and survey figures are illustrative: the short answer of a cost guide and any key number from them carry the tag
    const riStats = stats.some((x) => RI_SRC().includes(x.src));
    const riAnswer = isCost(g) || g.slug === 'how-much-should-a-fractional-operator-charge';
    const keys = stats.map((x) => ({ k: x.l, v: x.v, src: x.src || '' }));

    // Rail: Talk to us leads on the client guides (owner, Oct 14, 2026); operator and method guides keep their own action
    const c = g.cta || {};
    let cta = '';
    if (c.operator && persona !== 'operator') cta = `<a class="btn btn-block" href="#join">Join as an operator${icon('arrow')}</a>`;
    else if (c.to) cta = `<a class="btn btn-block" href="#${esc(c.to)}">${esc(c.label)}${icon('arrow')}</a>`;
    else cta = browseBtn(c.label || 'Browse operators', { filters: c.filters || {}, tags: c.tags || [], sort: c.sort, src: 'guide_' + g.slug }, 'btn btn-block');
    const talk = NEED_OF[g.cat] ? 'talk.' + NEED_OF[g.cat] : 'talk';

    const schema = {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: [{ q: g.q, a: answer.join(' ') }].concat(faq).map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
    };
    const others = GUIDES.filter((x) => x.slug !== g.slug).sort((a, b) => (a.group === g.group ? -1 : 0) - (b.group === g.group ? -1 : 0)).slice(0, 3);
    const ans = answersBlock(g);
    const toc = secs.map((s) => ({ id: s.id, h: s.h })).concat([{ id: 'faq', h: 'Common questions' }], ans ? [{ id: 'answers', h: 'Operators who answered' }] : [], [{ id: 'operators', h: rel.length ? 'Operators' : 'Next steps' }]);
    const tiles = keys.slice(0, 2);

    return `<div class="rs rs-guide-pg">
    <div class="wrap rs-guide">
      <article class="rs-art" aria-labelledby="rs-g-h1">
        ${crumbs([{ l: 'Guides', to: 'guides' }, { l: grp.l }])}
        <h1 class="h1 rs-g-h1" id="rs-g-h1">${vmEnd(esc(g.q))}</h1>
        ${postByline(g.updated, g.mins, reviewer ? `<span class="rs-by-rev" data-proto>Reviewed by <a href="#op.${esc(reviewer.slug)}">${esc(reviewer.name)}</a>${RN.ui.illus('Illustrative', 'A sample operator stands in as the reviewer until the team picks one for this guide.')}</span>` : `<span class="rs-by-rev" data-proto>Reviewed by ${RN.fn && RN.fn.gap ? RN.fn.gap('reviewing operator', 'Matt') : 'an operator, pending'}</span>`)}
        <div class="rs-answer" role="note" aria-label="Short answer">
          <span class="rs-answer-l"><span class="label">The short answer</span>${riAnswer ? illus() : ''}</span>
          <p>${answer.map(esc).join(' ')}</p>
        </div>
        ${tiles.length ? `<section class="rs-kb" data-n="${tiles.length}" aria-label="Key numbers"><span class="rs-kb-l"><span class="label">Key numbers</span>${riStats ? illus() : ''}</span><div class="rs-kb-g">${tiles.map((s, i) => `<div class="rs-kb-i${i === 0 ? ' is-lead' : ''}"><span class="rs-kb-v">${esc(s.v)}</span><span class="rs-kb-k">${esc(s.k)}</span>${s.src ? `<span class="rs-kb-s">${icon('info')}<span class="rs-kb-src">${esc(s.src)}</span>${kbShare(s.v, s.k, s.src, g)}</span>` : ''}</div>`).join('')}</div></section>` : ''}
        ${mtoc(toc)}
        <div class="rs-prose">
          ${secs.map((s) => `<section id="rs-s-${esc(s.id)}" class="prose rs-gsec"><h2>${esc(s.h)}</h2>${olToTl(s.html)}</section>`).join('')}
        </div>
        <section id="rs-s-faq" class="rs-faq" aria-labelledby="rs-faq-t">
          <h2 class="h3" id="rs-faq-t">Common questions</h2>
          ${faq.map((f) => `<details class="rs-faq-i"><summary><span>${esc(f.q)}</span>${icon('chev-down', 'rs-chev')}</summary><p>${esc(f.a)}</p></details>`).join('')}
        </section>
        ${ans}
        ${closingBlock(g)}
        ${moreLinks(others)}
        <footer class="rs-gfoot">
          <p class="small muted">Sources: Revenue Nomad Rate Index (${esc((RIX().trend || []).slice(-1)[0] ? RIX().trend.slice(-1)[0].l : 'latest quarter')}), the State of Fractional GTM ${esc(String(REP().year || 2027))} survey (fieldwork ${esc(REP().fieldwork || '')}) and live operator profiles. Market and survey figures are illustrative until the first survey closes. Cite as "Revenue Nomad Research, ${esc(RN.fmt.monthYear(g.updated + 'T12:00:00'))}".</p>
          ${keyList(keys)}
          ${schemaBlock('rs-faq-schema', schema, 'For the dev team: FAQPage JSON-LD built from the short answer and the FAQ. Also add Article (author Revenue Nomad as an Organization, reviewedBy the reviewing operator, dateModified) and BreadcrumbList.')}
        </footer>
      </article>
      <aside class="rs-rail" aria-label="On this page">
        <div class="rs-rail-in">
          <div class="rs-toc"><span class="label">On this page</span>
            <div class="rs-toc-list"><span class="rs-toc-prog" aria-hidden="true"><i></i></span><ul>${toc.map((t) => `<li><button type="button" data-act="rs-scroll" data-to="rs-s-${esc(t.id)}">${disp(t.h)}</button></li>`).join('')}</ul></div>
          </div>
          ${client ? railCta('Tell us what you need', 'Four short questions. Only your name and email are required.', talk, g.cat && RIX().byCat[g.cat] ? g.cat : '') : `<div class="card rs-rail-cta">
            <b class="h5">${esc(g.group === 'operators' ? 'Put this to work' : 'See it on a profile')}</b>
            <p class="small muted">${esc(g.group === 'operators' ? (persona === 'operator' ? 'Studio shows your numbers next to the benchmarks in this guide.' : 'Join the network to get a Studio with your numbers next to these benchmarks.') : 'Every profile shows its Reputation Index, CORE reviews and verified focus areas.')}</p>
            ${cta}
          </div>`}
        </div>
      </aside>
    </div>
    <div class="wrap rs-guide-after">
        <section id="rs-s-operators" class="rs-rel" aria-labelledby="rs-rel-t">
          <div class="row between" style="align-items:flex-end"><div><span class="eyebrow">From the network</span><h2 class="h3" id="rs-rel-t" style="margin-top:16px">${g.cat ? `${esc(F.catLabel(g.cat))} operators who do this work` : 'Operators with the most company evidence'}</h2></div>
          ${browseBtn(g.cat ? `Browse ${F.catLabel(g.cat)}` : 'Browse all', { filters: g.cat ? { roleCategories: [g.cat] } : {}, src: 'guide_' + g.slug }, 'btn btn-line btn-sm')}</div>
          <div class="grid g-3 rs-rel-ops">${rel.map((x) => RN.ui.opCard(x.op, { compact: true, why: relWhy(x), cta: 'invite', ctaAct: 'intro-open', ctaLabel: 'Request intro' })).join('')}</div>
          <div class="grid g-2 rs-glinks">
          <a class="rs-bp card card-link" href="#${esc(bp ? bp.to : 'blueprints')}">
            ${RN.ui.icoTile('doc', { cls: 'rs-bp-ic' })}
            <span class="grow"><span class="label">Engagement Blueprint</span><b>${esc(bp ? bp.title : `Scope this work${g.cat ? ` with a ${F.catLabel(g.cat)} Blueprint` : ' with a Blueprint'}`)}</b><span class="small muted">${esc(bp && bp.sub ? bp.sub : 'Typical hours, term, a 30/60/90-day plan and a rate range from the Rate Index, ready to post as an engagement.')}</span></span>
            ${icon('arrow')}
          </a>
          ${g.cat && RIX().byCat[g.cat] ? `<a class="rs-bp card card-link" href="#rates.${esc(g.cat)}">
            ${RN.ui.icoTile('chart', { cls: 'rs-bp-ic' })}
            <span class="grow"><span class="rs-bp-l"><span class="label">Rate Index</span>${illus()}</span><b>${esc(F.catLabel(g.cat))}: median ${esc(RN.fmt.rate(RIX().byCat[g.cat].p50))}</b><span class="small muted">Middle half ${esc(RN.fmt.hrRange(RIX().byCat[g.cat].p25, RIX().byCat[g.cat].p75))}. Estimate a month for your company size.</span></span>
            ${icon('arrow')}
          </a>` : `<a class="rs-bp card card-link" href="#framework">
            ${RN.ui.icoTile('grid', { cls: 'rs-bp-ic' })}
            <span class="grow"><span class="label">GTM Framework</span><b>Where operators have company-verified proof</b><span class="small muted">Six areas across seven stages of the customer journey, counted from live profiles.</span></span>
            ${icon('arrow')}
          </a>`}
          </div>
        </section>
    </div>
    ${client ? talkStrip('Tell us what you need', talk, 'Four short questions. A role profile and 2 to 3 vetted operators, often within 48 hours.') : ''}
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
    title: (p) => { const g = guideBy(p.slug); return g ? (g.post ? g.post.metaTitle : g.q) : 'Guide'; },
    render: (p) => renderGuide(p.slug),
    mount: (root) => { mountCommon(root); },
    unmount: unmountCommon,
  });
})();
