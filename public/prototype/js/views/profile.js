/* Operator profile (#op.<slug>) and tracked proof link (#proof.<id>).
   The profile is the visual source of truth for the system. Every block reads the shared operator model
   (RN.model), the field registry (RN.fields, RN.w) and the platform's own IP: Reputation Index, CORE reviews,
   GTM Framework (6 areas x 7 stages), Fit Tag Library, Rate Index.
   Viewer states: visitor (rate and match signals locked), signed-in client (rate + match signals),
   the operator on their own profile (owner bar, Studio shortcuts, Preview as visitor or client), admin. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon, F = RN.fields;
  const lc = (s) => String(s == null ? '' : s).toLowerCase().trim();
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Operator Profile Explorer content that is not in the live export ----------
     Matt's engagement sizes, industries and outcome come from the explorer's demo record (the founder's own
     profile). Work samples, tool proficiency and CORE notes marked "sample" are illustrative. */
  const MATT_ENG = {
    Ferry: { revenueRange: '1m_5m', employeeRange: '11_50', industry: 'Saas', outcome: "Built and launched the company's first digital demand generation program, which delivered their first 20 inbound leads. Converted that pipeline into two closed deals, doubling the client base. Recruited and onboarded their first AE, who closed a deal within 60 days of starting." },
    'myHR Partner': { revenueRange: '5m_20m', employeeRange: '51_200', industry: 'Professional Services', context: 'Worked with the sales team on new business and expansion: playbook, segmentation, pipeline reviews and the handoff to customer success.' },
    Trialbee: { revenueRange: '5m_20m', employeeRange: '51_200', industry: 'Pharma & Biotech' },
    BuildingLink: { revenueRange: '20m_50m', employeeRange: '201_500', industry: 'Property Management' },
  };
  const MATT_VIDEO_LINE = 'How I turn founder-led sales into a motion your team can run';

  const SAMPLES = [
    { id: 'playbook', type: 'Playbook', title: 'Sales playbook for a first repeatable motion', pages: 24, at: 'Ferry', skills: ['Sales playbook build', 'Inbound selling'], tone: 'forest', feature: true, fig: 'flow',
      toc: ['ICP and buyer personas', 'Discovery call flow', 'Stage exit criteria', 'Objection handling'] },
    { id: 'accounts', type: 'Framework', title: 'Top 100 restaurant chain account plan', pages: 12, at: 'Ferry', skills: ['1:1 ABM', 'Customer Segmentation'], tone: 'paper', fig: 'pyramid',
      toc: ['Tiering model', 'Account scoring', 'Buying committee map'] },
    { id: 'onboarding', type: 'Program', title: 'New AE onboarding: first 60 days', pages: 18, at: 'Ferry', skills: ['New Hire Sales Onboarding', 'Call Coaching & Feedback'], tone: 'tint', fig: 'gantt',
      toc: ['Week-by-week ramp', 'Certification checkpoints', 'Call review rubric'] },
    { id: 'crm', type: 'Process map', title: 'HubSpot pipeline and stage cleanup', pages: 9, at: 'myHR Partner', skills: ['HubSpot admin', 'CRM cleanup'], tone: 'ink', fig: 'stages',
      toc: ['Stage definitions', 'Required fields', 'Dashboard set'] },
    { id: 'handoff', type: 'Template', title: 'Sales-to-CS handoff checklist', pages: 4, at: 'myHR Partner', skills: ['Sales-CS handoff process'], tone: 'paper', fig: 'check',
      toc: ['Handoff call agenda', 'Account brief', '30-day success plan'] },
  ];
  // Portfolio filter chips (L324): All / Playbooks / Frameworks / Builds
  const PF_GROUP = { Playbook: 'playbooks', Program: 'playbooks', Framework: 'frameworks', 'Process map': 'builds', Template: 'builds', Build: 'builds', System: 'builds' };
  const PF_FILTERS = [['all', 'All'], ['playbooks', 'Playbooks'], ['frameworks', 'Frameworks'], ['builds', 'Builds']];

  /* Matt's tool list, seeded from the explorer's demo record. Tool names come from the registry (F.techStack);
     proficiency levels are illustrative. HubSpot is backed by a real review tag from myHR Partner.
     Every other operator's stack comes from op.roleFields.techStack (intake or Studio) and client reviews. */
  const MATT_STACK = { HubSpot: 'admin', Salesforce: 'power_user', Apollo: 'admin', Outreach: 'power_user', Salesloft: 'end_user', Gong: 'power_user', Clari: 'end_user', ZoomInfo: 'power_user', Clay: 'end_user' };
  const MATT_STACK_BY = { HubSpot: 'myHR Partner' };
  const TOOL_LOGO = { HubSpot: 'hubspot', Salesforce: 'salesforce', Gong: 'gong' };
  // Live export time zones (IANA ids) shown with the same labels as operator intake (join.js)
  const TZ = { 'America/New_York': 'Eastern Time (ET)', 'America/Detroit': 'Eastern Time (ET)', 'America/Chicago': 'Central Time (CT)', 'America/Denver': 'Mountain Time (MT)', 'America/Phoenix': 'Mountain Time (MT)', 'America/Los_Angeles': 'Pacific Time (PT)', 'Africa/Nairobi': 'East Africa Time (EAT)', 'Asia/Singapore': 'Singapore Time (SGT)', 'Europe/London': 'UK Time (GMT/BST)', 'Europe/Dublin': 'Irish Time (GMT/IST)', 'Asia/Kolkata': 'India Standard Time (IST)', 'Australia/Sydney': 'Australian Eastern Time (AEST)' };

  // CORE notes submitted with each review (explorer REVIEW_DETAIL). Trista's scores and notes are real.
  // Eric's scores are from the explorer record (founder to confirm the source); he left no notes, so none are shown.
  const REVIEW_DETAIL = {
    'Trista Kempa': { core: [5, 5, 5, 5], title: 'VP of Sales', notes: [
      'Matt was consistently and proactively communicative as a partner and consultant.',
      'I never questioned whether or not Matt would follow through - he never let us down, and if deadlines were at risk, he was forthcoming and communicated early.',
      'Matt brought results-focused rigor to our team, via the introduction of the Traction / EOS model. He was proactive in building our pipeline and creating benchmarks at each phase to achieve our growth goals.',
      'Matt was a godsend when it came to helping our team build a Sales organization and GTM motion. He consistently moved us forward and helped us build a team, pipeline, and process to grow our business.',
    ] },
    'Eric Barbalace': { core: [5, 5, 5, 5], title: 'Fractional VP Sales' },
  };
  // Platform CORE benchmark per dimension (illustrative)
  const CORE_BENCH = [{ mean: 4.2, sd: 0.45 }, { mean: 4.1, sd: 0.5 }, { mean: 3.9, sd: 0.55 }, { mean: 4.3, sd: 0.4 }];
  // Peer Reputation Index distribution (illustrative)
  const PEER = { mean: 60, sd: 11 };

  const CONTRIB = { sellers: 'Does the work', sales_leadership: 'Leads the team', customer_success_growth: 'Leads the team', revenue_operations: 'Builds the system', sales_enablement: 'Builds the system', ai_gtm: 'Builds the system', marketing: 'Drives demand', partnerships: 'Drives demand' };
  const CONTRIB_ORDER = ['Does the work', 'Leads the team', 'Builds the system', 'Drives demand'];
  const AXIS_DEF = {
    'Lead & plan': 'Strategy, positioning, org design, planning and interim leadership: work that sets direction for every stage.',
    'Build the team': 'Hiring, onboarding, coaching, comp and methodology: work that makes the people in every stage better.',
    'Generate demand': 'Pipeline creation: demand gen, ABM, outbound, content and partner-sourced opportunities.',
    'Win deals': 'Turning pipeline into revenue: sales process, discovery, deal execution, pricing and forecasting.',
    'Retain & expand': 'Keeping and growing customers: onboarding, adoption, renewals, expansion and advocacy.',
    'Systems & data': 'CRM, reporting, routing, tech stack and automation: the plumbing every stage runs on.',
  };
  const LOGO_WORD = { ferry: 'ferryWordmark' };
  const PROOF_SECTIONS = { reviews: 'Client reviews', core: 'CORE ratings', engagements: 'Engagement history', samples: 'Work samples', rate: 'Rate and availability' };

  /* ---------- Per-visit state ---------- */
  let S = fresh();
  function fresh() { return { key: null, focus: null, tagsAll: false, engOpen: null, pf: 'all', stackQ: '', viewAs: 'owner', coreIdx: {}, tracked: false, timer: null, unsub: null, obs: [], ctx: null, coreHover: false, plForm: null }; }
  function visit(key) { if (S.key !== key) { cleanup(true); S = fresh(); S.key = key; } }
  function cleanup(all) {
    clearInterval(S.timer); S.timer = null;
    S.railFit = null;
    S.scrollFn = null;
    S.obs.forEach((o) => { try { o.disconnect(); } catch (e) { /* ignore */ } });
    S.obs = [];
    if (all && S.unsub) { S.unsub(); S.unsub = null; }
  }
  const DUR = {};

  /* ---------- Small helpers ---------- */
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp((-x * x) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const smart = (s) => String(s || '').replace(/"([^"]*)"/g, '“$1”').replace(/(\w)'(\w)/g, '$1’$2');
  const mon = (ym) => { if (!ym) return 'Present'; const [y, m] = String(ym).split('-').map(Number); return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
  const usdShort = (n) => { n = +n; if (!n) return ''; if (n >= 1e6) return '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M'; if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return '$' + n; };
  const tzLabel = (s) => TZ[s] || String(s || '').replace(/_/g, ' ');
  const nextStart = (op) => { const d = op.avail.startDate ? new Date(op.avail.startDate + 'T12:00:00') : null; return !d || d < RN.now() ? RN.now() : d; };
  // MM/DD/YYYY, the same format compare uses for Next available start date (Sheet3 #4)
  const mdy = (d) => (RN.fmt.mdy ? RN.fmt.mdy(d) : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`);
  // Client-facing name of the operator's revenue range field (the registry label is the operator's "Revenue range")
  const revLabel = () => F.revenueRange.clientLabel || 'Company revenue';
  const allIn = (rate) => (RN.projects && RN.projects.allIn ? RN.projects.allIn(rate) : Math.round(rate / 0.75));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const jumpBtn = (to, html, cls) => `<button type="button" class="${cls || 'act'}" data-act="pf-jump" data-to="${esc(to)}">${html}</button>`;
  const catLabel = (c) => F.catLabel(c);
  function bandSlug(str) {
    if (!str) return '';
    const s = String(str).replace(/\s/g, '').replace('<', 'under').toLowerCase();
    const o = F.revenueRange.options.find((x) => x.l.replace(/\s/g, '').toLowerCase() === s || x.v === s);
    if (o) return o.v;
    return { 'under$1m': 'under_1m' }[s] || '';
  }
  function logoHtml(key, name, h) {
    if (!key) return '';
    return RN.ui.logo(LOGO_WORD[key] || key, { name, h: h || 26 });
  }

  /* ---------- Derived data ---------- */
  function viewer(op) {
    const p = RN.store.state.persona;
    const own = p === 'operator' && RN.personas.operator.opId === op.id;
    const mode = own ? S.viewAs : p === 'buyer' ? 'client' : p === 'admin' ? 'admin' : p === 'operator' ? 'operator' : 'visitor';
    return { persona: p, own, mode, preview: own && mode !== 'owner', owner: own && mode === 'owner', client: mode === 'client', rate: mode !== 'visitor' };
  }
  function samplesFor(op) {
    const edits = (RN.store.state.edits || {})[op.id] || {};
    const mine = (edits.samples || []).map((s, i) => ({
      id: s.id || 'mine-' + i, type: s.type || 'Playbook', title: s.title || 'Work sample', pages: +s.pages || null, at: s.at || s.company || '',
      skills: s.skills || s.tags || [], toc: s.toc || [], tone: ['tint', 'paper', 'forest', 'ink'][i % 4], fig: 'flow', mine: true,
    }));
    return (op.isMatt ? SAMPLES : []).concat(mine);
  }
  function engagements(op) {
    const extra = op.isMatt ? MATT_ENG : {};
    const samples = samplesFor(op);
    return (op.engagements || []).map((e, i) => {
      const x = extra[e.company] || {};
      const review = (op.reviews || []).find((r) => lc(r.company) === lc(e.company)) || null;
      return Object.assign({}, e, {
        key: 'e' + i,
        revenueRange: e.revenueRange || x.revenueRange || bandSlug(e.revenueBand),
        employeeRange: e.employeeRange || x.employeeRange || '',
        industry: e.industry || x.industry || '',
        outcome: e.outcome || x.outcome || '',
        context: e.context || x.context || '',
        review, verified: !!(e.clientVerified || review),
        samples: samples.filter((s) => s.at && lc(s.at) === lc(e.company)),
      });
    }).sort((a, b) => String(b.end || '9999').localeCompare(String(a.end || '9999')) || String(b.start || '').localeCompare(String(a.start || '')));
  }
  // The signed-in client's open intro request to this operator (shared RN.intro record)
  function myIntro(op) {
    const st = RN.store.state;
    return st.persona === 'buyer' ? st.intros.find((i) => i.opId === op.id && i.status !== 'declined' && i.buyer && i.buyer.email === RN.personas.buyer.email) || null : null;
  }
  // The signed-in client can review an operator they were introduced to or hired, once
  function reviewIntro(op) {
    const i = myIntro(op);
    if (!i || !['introduced', 'hired'].includes(i.status)) return null;
    const me = RN.personas.buyer;
    const done = (RN.store.state.reviews || []).some((r) => r.opId === op.id && (r.reviewerEmail === me.email || r.reviewer === me.name));
    return done ? null : i;
  }
  function sortTags(tags) {
    const rank = (t) => (t.tier === 'expert' ? 2 : t.tier === 'verified' ? 1 : 0);
    return (tags || []).slice().sort((a, b) => rank(b) - rank(a) || b.score - a.score || (b.r || 0) - (a.r || 0) || a.t.localeCompare(b.t));
  }
  function confirmers(op, t) { return (op.reviews || []).filter((r) => (r.tags || []).some((x) => lc(x) === lc(t.t))).map((r) => r.company).filter(Boolean); }
  // "Best three skills": each stage and area scores its three strongest tags; self-claimed tags count 10
  function agg(tags) {
    if (!tags.length) return null;
    const ranked = tags.map((t) => ({ t, p: t.tier === 'claimed' ? 10 : t.score })).sort((a, b) => b.p - a.p || (b.t.r || 0) - (a.t.r || 0));
    const top = ranked.slice(0, 3);
    const sum = top.reduce((a, x) => a + x.p, 0);
    return { pct: Math.round((sum / 300) * 100), top, sum, n: tags.length, claimedOnly: !tags.some((t) => t.tier !== 'claimed') };
  }
  function coreOf(r) {
    let scores = null, notes = null;
    const k = ['C', 'O', 'R', 'E'];
    if (Array.isArray(r.core) && r.core.length === 4 && r.core.every((x) => x != null)) scores = r.core.map((x) => (typeof x === 'object' ? +(x.score || x.rating) : +x));
    else if (r.core && typeof r.core === 'object' && !Array.isArray(r.core)) {
      const vals = k.map((d) => (r.core[d] != null ? r.core[d] : r.core[d.toLowerCase()]));
      if (vals.every((x) => x != null)) { scores = vals.map((x) => (typeof x === 'object' ? +(x.score || x.rating) : +x)); notes = vals.map((x) => (typeof x === 'object' ? x.note || x.reason || '' : '')); }
    }
    if (Array.isArray(r.core) && r.core.length === 4 && r.core.some((x) => x && typeof x === 'object')) notes = r.core.map((x) => (x && (x.note || x.reason)) || '');
    if (!notes || !notes.some(Boolean)) notes = r.notes || r.coreNotes || r.reasons || notes;
    if (!scores && REVIEW_DETAIL[r.reviewer]) { const d = REVIEW_DETAIL[r.reviewer]; scores = d.core; notes = d.notes || null; }
    if (!scores || scores.some((x) => !(x > 0))) return null;
    return { scores, notes: Array.isArray(notes) ? notes : null };
  }

  /* ---------- Role details: map live intake answers onto the standard role fields ---------- */
  const MAPS = {
    channelsRun: { content: 'Content', paid_social: 'Paid Social', paid_search: 'Paid Search', seo: 'SEO', abm: 'ABM', events: 'Events', pr: 'PR', community: 'Community', webinars: 'Webinars', email: 'Lifecycle Email', lifecycle_email: 'Lifecycle Email', 'email & lifecycle': 'Lifecycle Email' },
    enablementFocus: { program_builder: 'Program builder', onboarding_specialist: 'Onboarding specialist', skills_coaching: 'Skills coaching', skills_coach: 'Skills coaching', content_creator: 'Content creator', trainer: 'Trainer', functional_leader: 'Function leader', function_leader: 'Function leader', e_learning: 'E-Learning specialist' },
    audienceSpecialty: { ae: 'AE', sdr_bdr: 'SDR / BDR', sales_manager: 'Sales Manager / Frontline manager', account_manager: 'Account Manager', csm: 'Customer Success Manager', sales_leadership: 'Sales Leadership (VP/Director coaching)', channel: 'Channel / Partner reps', solutions: 'Solutions / Sales Engineering' },
    csMotion: { high_touch: 'High-touch', low_touch: 'Low-touch / scaled', tech_touch: 'Tech-touch / digital CS', plg: 'PLG / self-serve customer base' },
    ownershipModel: { renewals: 'Renewals owned', renewals_owned: 'Renewals owned', expansion: 'Expansion owned', expansion_owned: 'Expansion owned', adoption: 'Adoption / health only', adoption_health: 'Adoption / health only', implementation: 'Implementation / onboarding lead', onboarding: 'Implementation / onboarding lead' },
    aiSpecialization: { outbound: 'Outbound / prospecting AI', inbound: 'Inbound routing & scoring AI', ai_sdr: 'AI SDR / autonomous agents', revops_automation: 'RevOps automation & data pipelines', cs_automation: 'CS automation', forecasting: 'Forecasting / scoring models', voice: 'Voice / phone agents', content_automation: 'Content & enablement automation', ai_gtm_builder: 'Generalist AI GTM builder', generalist: 'Generalist AI GTM builder' },
    salesCycle: { lt_5_days: '<5 days', '5_30_days': '5 - 30 days', '30_90_days': '30 - 90 days', '3_6_months': '3 - 6 months', '6_12_months': '6 - 12 months', '12_plus_months': '12+ months' },
  };
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : v == null ? [] : [v]).map((s) => String(s).trim()).filter(Boolean);
  const yes = (v) => v === true || lc(v) === 'yes' || lc(v) === 'true';
  function optMatch(key, raw) {
    const d = F[key];
    const m = MAPS[key] && MAPS[key][lc(raw)];
    if (m) return m;
    const o = (d.options || []).find((x) => lc(x.v) === lc(raw) || lc(x.l) === lc(raw));
    return o ? o.v : null;
  }
  function parseBandM(s) {
    const m = String(s || '').replace(/\$/g, '').replace(/\s/g, '').replace(/M$/i, '').match(/^([\d.]+)(?:-([\d.]+))?(\+)?/);
    if (!m) return null;
    return { lo: +m[1], hi: m[2] ? +m[2] : null, plus: !!m[3] };
  }
  const UNITS = { largestTeamQuota: 'annual quota', largestBudget: 'annual budget', largestArrBook: 'ARR book', partnerRevenue: 'partner-attributed', individualQuota: 'annual quota', avgDealSize: 'ACV', largestAccountArr: 'account ARR', bestNrr: 'net revenue retention', bestGrr: 'gross revenue retention', largestRepCount: 'reps enabled', largestCsTeam: 'CSMs', typicalTeamSize: 'people', partnerEcosystem: 'partners', largestTeamManaged: 'people' };
  const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
  /* Answers stored under registry keys (intake, Studio, Admin), rendered by the field's type */
  function fromRegistry(key, v) {
    const d = F[key];
    if (!d) return null;
    if (key === 'builtFromZero' || key === 'commissionOnly') return v === 'yes' ? { kind: 'flag', value: key === 'builtFromZero' ? 'Built the function from zero' : 'Open to commission-only' } : null;
    if (key === 'b2bShare') return isNaN(parseInt(v, 10)) ? null : { kind: 'split', value: Math.max(0, Math.min(100, parseInt(v, 10))) };
    if (d.type === 'money') return +v > 0 ? { kind: 'big', value: usdShort(v), unit: UNITS[key] || '' } : null;
    if (d.type === 'number') return +v > 0 ? { kind: 'big', value: RN.fmt.int(+v) + (d.unit === '%' ? '%' : ''), unit: UNITS[key] || d.unit || '' } : null;
    if (key === 'largestTeamManaged' || key === 'largestTeamQuota') return { kind: 'big', value: RN.w.label(key, v).replace(' people', ''), unit: UNITS[key] };
    const vals = [].concat(v).filter(Boolean);
    if ((d.options || []).some((o) => o.level) && vals.length === 1) return { kind: 'scale', value: vals[0] };
    return { kind: 'chips', value: key === 'aiSpecialization' || key === 'partnershipMotion' ? vals.slice(0, 1) : vals, gold: key === 'aiSpecialization' || key === 'partnershipMotion' };
  }
  /* Returns {kind, value, unit, note} for a standard role field, or null when the operator has not answered it.
     Registry answers (op.roleFields) win; otherwise the live export's legacy keys are parsed. */
  function roleVal(op, key) {
    const rf = op.roleFields || {};
    if (filled(rf[key])) { const r = fromRegistry(key, rf[key]); if (r) return r; }
    const rd = op.roleDetails || {};
    const num = (...ks) => { for (const k of ks) { const v = rd[k]; if (typeof v === 'number' && v > 0) return v; if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && +v > 0) return +v; } return null; };
    const multi = (...ks) => { for (const k of ks) { const vals = list(rd[k]).map((x) => optMatch(key, x)).filter(Boolean); if (vals.length) return [...new Set(vals)]; } return null; };
    switch (key) {
      case 'largestTeamManaged': {
        const v = rd.largest_team_managed != null ? rd.largest_team_managed : rd.salespeople_managed;
        if (typeof v === 'number' || /^\d+$/.test(String(v || ''))) return +v > 0 ? { kind: 'big', value: String(+v), unit: 'people' } : null;
        const o = v && optMatch(key, v);
        return o ? { kind: 'big', value: RN.w.label(key, o).replace(' people', ''), unit: 'people' } : null;
      }
      case 'largestTeamQuota': {
        const n = num('largest_team_quota_managed', 'largest_team_quota_usd');
        if (n) return { kind: 'big', value: usdShort(n), unit: 'annual quota' };
        const b = parseBandM(rd.largest_team_quota_managed);
        if (!b) return null;
        const code = b.plus ? '100m_plus' : { 1: '1_5m', 5: '5_10m', 10: '10_25m', 25: '25_50m', 50: '50_100m' }[b.lo];
        return code ? { kind: 'big', value: RN.w.label(key, code), unit: 'annual quota' } : null;
      }
      case 'salesCycle': {
        const vals = multi('sales_cycle_range', 'sales_cycle_experience');
        const days = num('avg_sales_cycle_days');
        if (!vals && !days) return null;
        let v = vals;
        if (!v && days) v = [days < 5 ? '<5 days' : days <= 30 ? '5 - 30 days' : days <= 90 ? '30 - 90 days' : days <= 180 ? '3 - 6 months' : days <= 365 ? '6 - 12 months' : '12+ months'];
        return { kind: 'chips', value: v, note: days ? `${days}-day average cycle` : '' };
      }
      case 'salesMotions': { const v = (op.motions && op.motions.length ? op.motions : list(rd.gtm_motion_experience || rd.motion_focus)).map((x) => optMatch(key, x)).filter(Boolean); return v.length ? { kind: 'chips', value: v } : null; }
      case 'methodologies': {
        const v = (op.methodologies && op.methodologies.length ? op.methodologies : list(rd.methodology_certs)).map((x) => optMatch(key, x)).filter((x) => x && x !== 'Other');
        if (rd.methodologies_other_text) v.push(rd.methodologies_other_text);
        return v.length ? { kind: 'chips', value: [...new Set(v)], raw: true } : null;
      }
      case 'largestBudget': {
        const n = num('budget_managed_usd', 'largest_annual_budget_managed');
        if (n) return { kind: 'big', value: usdShort(n), unit: 'annual budget' };
        const b = parseBandM(rd.largest_annual_budget_managed);
        return b ? { kind: 'big', value: b.plus ? `$${b.lo}M+` : `$${b.lo}M–$${b.hi}M`, unit: 'annual budget' } : null;
      }
      case 'channelsRun': { const v = multi('channels_personally_run', 'primary_demand_channels'); return v ? { kind: 'chips', value: v } : null; }
      case 'b2bShare': {
        const raw = rd.b2b_share != null ? rd.b2b_share : rd.b2b_b2c_split;
        const n = raw == null || raw === '' ? null : parseInt(String(raw).split(/[/:]/)[0], 10);
        return n != null && n >= 0 && n <= 100 ? { kind: 'split', value: n } : null;
      }
      case 'crm': {
        const raw = op.crm || rd.primary_crm || list(rd.primary_crm_platforms)[0];
        const o = raw && optMatch(key, raw);
        return o ? { kind: 'chips', value: [o] } : null;
      }
      case 'stackComplexity': case 'codeCapability': case 'automationScale': {
        const raw = rd[{ stackComplexity: 'stack_complexity', codeCapability: 'code_capability', automationScale: 'automation_scale' }[key]];
        const o = raw && optMatch(key, raw);
        return o ? { kind: 'scale', value: o } : null;
      }
      case 'builtFromZero': return yes(rd.built_from_zero) || yes(rd.built_revops_from_zero) ? { kind: 'flag', value: 'Built the function from zero' } : null;
      case 'largestRepCount': { const n = num('rep_count_enabled', 'largest_rep_count_enabled'); return n ? { kind: 'big', value: RN.fmt.int(n), unit: 'reps enabled' } : null; }
      case 'enablementFocus': { const v = multi('enablement_focus', 'primary_enablement_focus'); return v ? { kind: 'chips', value: v } : null; }
      case 'audienceSpecialty': { const v = multi('audience_specialty'); return v ? { kind: 'chips', value: v } : null; }
      case 'bestNrr': { const n = num('nrr_achieved_pct', 'best_nrr_percent'); return n ? { kind: 'big', value: n + '%', unit: 'net revenue retention' } : null; }
      case 'largestArrBook': { const n = num('arr_book_managed_usd', 'largest_arr_book_managed'); return n ? { kind: 'big', value: usdShort(n), unit: 'ARR book' } : null; }
      case 'csMotion': { const v = multi('motion_specialty', 'cs_motion_specialty'); return v ? { kind: 'chips', value: v } : null; }
      case 'bestGrr': { const n = num('grr_achieved_pct', 'best_grr_percent'); return n ? { kind: 'big', value: n + '%', unit: UNITS[key] } : null; }
      case 'largestCsTeam': { const n = num('cs_team_size', 'largest_cs_team_size'); return n ? { kind: 'big', value: RN.fmt.int(n), unit: UNITS[key] } : null; }
      case 'largestAccountArr': { const n = num('largest_account_arr_usd', 'largest_single_account_arr'); return n ? { kind: 'big', value: usdShort(n), unit: UNITS[key] } : null; }
      case 'ownershipModel': { const v = multi('ownership_model'); return v ? { kind: 'chips', value: v } : null; }
      case 'typicalTeamSize': { const n = num('team_size', 'typical_team_size'); return n ? { kind: 'big', value: RN.fmt.int(n), unit: UNITS[key] } : null; }
      case 'partnerEcosystem': { const n = num('largest_partner_ecosystem_managed'); return n ? { kind: 'big', value: RN.fmt.int(n), unit: UNITS[key] } : null; }
      case 'aiSpecialization': { const v = multi('specialization', 'primary_ai_specialization'); return v ? { kind: 'chips', value: v.slice(0, 1), gold: true } : null; }
      case 'partnershipMotion': { const v = multi('primary_partnership_motion'); return v ? { kind: 'chips', value: v.slice(0, 1), gold: true } : null; }
      case 'partnerRevenue': { const n = num('largest_partner_attributed_revenue'); return n ? { kind: 'big', value: usdShort(n), unit: 'partner-attributed' } : null; }
      case 'individualQuota': { const n = num('individual_quota_usd', 'average_individual_quota'); return n ? { kind: 'big', value: usdShort(n), unit: 'annual quota' } : null; }
      case 'avgDealSize': { const n = num('avg_deal_size_acv', 'average_deal_size'); return n ? { kind: 'big', value: usdShort(n), unit: 'ACV' } : null; }
      case 'commissionOnly': return yes(rd.open_to_commission_only) ? { kind: 'flag', value: 'Open to commission-only' } : null;
      default: return null;
    }
  }
  function roleValHtml(key, rv, compact) {
    const d = F[key];
    if (rv.kind === 'big') return `<div class="pf-rv pf-rv-big"><span class="pf-rv-l">${esc(d.label)}</span><span class="pf-rv-n"><b>${esc(rv.value)}</b>${rv.unit ? `<small>${esc(rv.unit)}</small>` : ''}</span></div>`;
    if (rv.kind === 'split') return `<div class="pf-rv"><span class="pf-rv-l">${esc(d.label)}</span><div class="pf-split" role="img" aria-label="${rv.value}% B2B, ${100 - rv.value}% B2C"><i style="width:${rv.value}%"></i></div><span class="pf-split-l"><b>B2B ${rv.value}%</b><span>B2C ${100 - rv.value}%</span></span></div>`;
    if (rv.kind === 'scale') {
      const o = d.options.find((x) => x.v === rv.value);
      return `<div class="pf-rv"><span class="pf-rv-l">${esc(d.label)}</span><div class="pf-scale" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= o.level ? 'on' : ''} ${i === 4 && o.level === 4 ? 'top' : ''}"></i>`).join('')}</div>
        <span class="pf-scale-l"><b>${esc(o.l)}</b><span>${o.level} of 4</span></span>${compact ? '' : `<p class="pf-rv-d">${esc(o.d)}</p>`}</div>`;
    }
    if (rv.kind === 'flag') return `<div class="pf-rv"><span class="pf-flag">${icon('check-circle')}${esc(rv.value)}</span></div>`;
    const labels = rv.value.map((x) => (rv.raw ? x : RN.w.label(key, x)));
    return `<div class="pf-rv"><span class="pf-rv-l">${esc(d.label)}</span><div class="pf-chips">${labels.map((l) => `<span class="pf-chip ${rv.gold ? 'gold' : ''}">${esc(l)}</span>`).join('')}</div>${rv.note ? `<span class="pf-rv-note">${esc(rv.note)}</span>` : ''}</div>`;
  }

  /* Shared with compare and admin: one reading of role details everywhere */
  RN.roleDetail = {
    value: roleVal,
    html: roleValHtml,
    text: (op, key) => {
      const rv = roleVal(op, key);
      if (!rv) return '';
      if (rv.kind === 'big') return rv.value + (rv.unit ? ' ' + rv.unit : '');
      if (rv.kind === 'split') return `${rv.value}% B2B`;
      if (rv.kind === 'scale') return RN.w.label(key, rv.value);
      if (rv.kind === 'flag') return 'Yes';
      return rv.value.map((x) => (rv.raw ? x : RN.w.label(key, x))).join(', ');
    },
  };

  /* ================================================================================================
     Profile view
     ================================================================================================ */
  function build(op) {
    const v = viewer(op);
    const tags = sortTags(op.tags);
    const axes = RN.data.framework.axes, stages = RN.data.framework.stages;
    const axAgg = {}, stAgg = {};
    axes.forEach((a) => { axAgg[a] = agg(op.tags.filter((t) => t.axis === a)); });
    stages.forEach((s) => { stAgg[s.name] = agg(op.tags.filter((t) => t.stage === s.name)); });
    const reviews = (op.reviews || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      op, v, first: op.first, tags, reviews,
      verified: tags.filter((t) => t.tier !== 'claimed'),
      engs: engagements(op), samples: samplesFor(op),
      coreRevs: reviews.map((r) => ({ r, c: coreOf(r) })).filter((x) => x.c),
      axes, stages, axAgg, stAgg,
      stack: stackFor(op),
    };
  }
  /* Tech stack: registry tool names (F.techStack) with a standard proficiency level (F.stackProficiency) and the
     client who confirmed the tool in a review. Reads op.roleFields.techStack (a list, or {tool: level}); Matt's
     seed record is the only illustrative one. */
  function stackFor(op) {
    const P = F.stackProficiency.options;
    const raw = (op.roleFields || {}).techStack;
    let tools = {};
    if (Array.isArray(raw)) raw.forEach((t) => { tools[t] = null; });
    else if (raw && typeof raw === 'object') tools = Object.assign({}, raw);
    const illus = !raw && !!op.isMatt;
    if (illus) tools = Object.assign({}, MATT_STACK);
    const by = illus ? Object.assign({}, MATT_STACK_BY) : {};
    (op.reviews || []).forEach((r) => [].concat(r.techStack || []).forEach((t) => { if (!by[t]) by[t] = r.company || ''; if (!(t in tools)) tools[t] = null; }));
    const lvl = (v) => (typeof v === 'number' ? v : ((P.find((o) => o.v === v || o.l === v) || {}).level || 0));
    const list = Object.keys(tools).map((name) => ({ name, lvl: lvl(tools[name]), by: by[name] || '' }));
    return list.length ? { tools: list, illus } : null;
  }

  function renderProfile(p) {
    RN.model.applyEdits(); // Studio edits and reviews submitted on #review.<id> show immediately
    const op = RN.model.bySlug(p.slug);
    if (!op) return notFound(p.slug);
    visit('op:' + op.slug);
    const c = build(op);
    S.ctx = c;
    const secs = sections(c);
    return `<div class="pf" data-op="${esc(op.id)}">
      ${hero(c)}
      <div class="wrap pf-proofs">${proofCards(c)}</div>
      ${subnav(c, secs)}
      <div class="wrap pf-body">
        <div class="pf-main">${secs.map((s) => s.html).join('')}</div>
        <aside class="pf-rail" aria-label="Engage ${esc(op.first)}">${engageCard(c)}${matchCard(c)}${risCard(c)}${talkCard(c)}</aside>
      </div>
      ${similar(c)}
      ${mobileBar(c)}
    </div>`;
  }

  function sections(c) {
    const out = [];
    const add = (key, label, html) => { if (html) out.push({ key, label, html }); };
    const hasReviews = c.reviews.length > 0;
    add('about', 'About', secAbout(c));
    add('offers', 'Ways to work', secOffers(c));
    if (!hasReviews) add('engagements', 'Engagements', secEngagements(c));
    add('fit', 'Fit', secFit(c));
    add('expertise', 'Expertise', secExpertise(c));
    if (c.stack) add('stack', 'Stack', secStack(c));
    if (c.samples.length) add('portfolio', 'Portfolio', secPortfolio(c));
    if (hasReviews) add('engagements', 'Track record', secEngagements(c));
    if (hasReviews) add('reviews', 'Reviews', secReviews(c));
    if (c.coreRevs.length) add('core', 'CORE', secCore(c));
    return out;
  }

  function sec(c, key, eyebrow, title, body, o) {
    o = o || {};
    return `<section class="pf-sec ${o.cls || ''}" id="pf-${key}" data-sec="${key}" aria-labelledby="pf-${key}-h">
      <header class="pf-sec-hd"><div class="grow"><span class="eyebrow">${eyebrow}</span><h2 class="h2 pf-h2" id="pf-${key}-h">${title}</h2>${o.sub ? `<p class="pf-sec-sub">${o.sub}</p>` : ''}</div>
      ${o.side || ''}${c.v.owner && o.edit ? `<a class="act pf-edit" href="#${o.edit}">${icon('edit')}${esc(o.editLabel || 'Edit in Studio')}</a>` : ''}</header>
      ${body}</section>`;
  }

  /* ---------- Hero band ---------- */
  const availDot = (op) => (op.avail.key === 'available_now' ? 'dot-now' : op.avail.key === 'available_2_weeks' ? 'dot-soon' : 'dot-later');
  // Registry order, not pick order, so chips read low to high
  const ordered = (key, vals) => F[key].options.map((o) => o.v).filter((v) => (vals || []).includes(v));
  function founderLine(op) {
    return op.isMatt ? `<p class="pf-founder">${icon('info')}<span>${esc(op.first)} founded Revenue Nomad. His profile follows the same rules as every operator.</span></p>` : '';
  }
  function hero(c) {
    const op = c.op, v = c.v;
    const tier = F.risTierFor(op.ris.score);
    const start = nextStart(op);
    const availTxt = op.avail.key === 'available_now' ? 'Available now' : `Available ${RN.fmt.dateShort(start)}`;
    // Available time sits in the At a glance tiles when they show; with a video it rides on the availability pill
    const hrs = op.video && op.avail.hoursCode ? ` · ${RN.w.label('hoursPerMonth', op.avail.hoursCode)}` : '';
    const heroTags = c.verified.length ? c.verified.slice(0, 3) : c.tags.slice(0, 3);
    const moreVerified = c.verified.length - 3;
    const engs = c.engs.slice().sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
    const logos = engs.slice(0, 5);
    const tierTip = `<b>${esc(tier.l)}</b> · Reputation Index ${esc(op.ris.score)}<br>${esc(tier.d)}`;
    const headline = op.headline || '';
    const hlCls = headline.length > 140 ? 'l' : headline.length > 80 ? 'm' : 's';
    return `<section class="pf-band night" aria-label="${esc(op.name)}">
      <div class="pf-band-bg" aria-hidden="true">${hexLattice()}</div>
      <div class="wrap pf-band-in">
        ${v.own ? ownerBar(c) : ''}
        <div class="pf-hero">
          <div class="pf-id">
            <div class="pf-id-top">
              <div class="pf-photo">${op.photo ? `<img src="${esc(op.photo)}" alt="${esc(op.name)}">` : `<span class="pf-initials">${esc(op.initials)}</span>`}
                ${op.ris.score >= 50 ? `<span class="pf-photo-seal" title="${esc(tier.l)} · Reputation Index ${esc(op.ris.score)}">${RN.ui.hexSeal(tier.l)}</span>` : ''}</div>
              <div class="pf-id-main">
                <div class="pf-pills">
                  <button type="button" class="pf-pill pf-pill-tier ${tier.v === 'elite' || tier.v === 'apex' ? 'gold' : ''}" data-tip="${esc(tierTip)}"><span class="pf-pill-hex">${RN.ui.hexSeal(tier.l)}</span>${esc(tier.l)}</button>
                  <span class="pf-pill"><i class="dot ${availDot(op)}"></i>${esc(availTxt + hrs)}</span>
                </div>
                <h1 class="h1 pf-name serif-up">${esc(op.name)}</h1>
                <p class="pf-role">Fractional ${esc(op.role)}</p>
              </div>
            </div>
            ${founderLine(op)}
            ${headline ? `<p class="pf-headline hl-${hlCls}" title="${esc(smart(headline))}">${esc(smart(headline))}</p>` : ''}
            <div class="pf-herotags">
              ${heroTags.map((t) => `<button type="button" class="pf-gtag ${t.tier === 'claimed' ? 'claimed' : ''}" data-tip="${esc(tagTip(op, t))}">${t.tier !== 'claimed' ? icon('check-circle') : ''}${esc(t.t)}</button>`).join('')}
              ${moreVerified > 0 ? jumpBtn('pf-expertise', `+${moreVerified} verified`, 'pf-more') : !c.verified.length && c.tags.length > 3 ? jumpBtn('pf-expertise', `+${c.tags.length - 3} focus areas`, 'pf-more') : ''}
            </div>
            <div class="pf-meta">
              ${op.location ? `<span>${icon('pin')}${esc(op.location)}</span>` : ''}
              ${op.timezone ? `<span>${icon('clock')}${esc(tzLabel(op.timezone))}</span>` : ''}
              <span>${icon('briefcase')}${esc(catLabel(op.catKey))}</span>
            </div>
            ${clientsBlock(c, logos)}
          </div>
          <div class="pf-media">
            ${op.video ? videoCard(c) : heroTiles(c)}
            ${heroCtas(c)}
          </div>
        </div>
      </div>
    </section>`;
  }
  // Client logos (2+ engagements) or, when a video takes the tile slot, the industries
  function clientsBlock(c, logos) {
    const op = c.op;
    let html = '';
    if (c.engs.length >= 2) {
      html = `<span class="eyebrow pf-clients-l">Clients</span>
        <div class="pf-logos">${logos.map((e) => `<span class="pf-logo ${e.verified ? 'ver' : ''}" title="${esc(e.company)} · ${esc(plural(e.months || 0, 'month'))}${e.verified ? ' · client verified' : ' · self-reported'}">${e.logo ? logoHtml(e.logo, e.company, 30) : `<b>${esc(e.company)}</b>`}${e.verified ? `<span class="pf-logo-seal">${icon('check')}</span>` : ''}</span>`).join('')}
          ${c.engs.length > 5 ? jumpBtn('pf-engagements', `+${c.engs.length - 5} more`, 'pf-more') : ''}</div>
        ${c.engs.some((e) => e.verified) ? `<span class="pf-clients-note">${icon('check-circle')}Client-verified engagement${c.engs.length > 5 ? ` · showing 5 of ${c.engs.length}, verified first` : ''}</span>` : `<span class="pf-clients-note">Self-reported engagements</span>`}`;
    } else if (op.video && op.industries.length) {
      html = `<span class="eyebrow pf-clients-l">${esc(F.industries.label)}</span><p class="pf-inds">${op.industries.slice(0, 5).map((i) => esc(RN.w.label('industries', i))).join('<span> · </span>')}</p>`;
    }
    return html ? `<div class="pf-clients">${html}</div>` : '';
  }
  function hexLattice() {
    return `<svg width="100%" height="100%"><defs><pattern id="pf-hexp" width="42" height="72.75" patternUnits="userSpaceOnUse" patternTransform="scale(1.3)">
      <path d="M21 0 42 12.1v24.3L21 48.5 0 36.4V12.1Z M21 48.5v24.25 M0 12.1 -21 0 M42 12.1 63 0" fill="none" stroke="currentColor" stroke-width=".8"/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#pf-hexp)"/></svg>`;
  }
  function ownerBar(c) {
    const m = c.v.mode;
    return `<div class="pf-owner" role="region" aria-label="Owner view">
      <span class="pf-owner-l">${icon('eye')}<span><b>${m === 'owner' ? 'This is how clients see your profile' : m === 'client' ? 'Previewing as a signed-in client' : 'Previewing as a logged-out visitor'}</b><span class="pf-owner-sub">${m === 'owner' ? 'Rate and Studio shortcuts are shown to you only.' : m === 'client' ? 'Sample client: Northwind Health. Buttons are inactive in preview.' : 'Rate and match signals are locked for visitors.'}</span></span></span>
      <div class="seg pf-seg-night" role="group" aria-label="View as">
        ${[['owner', 'Your view'], ['visitor', 'Visitor'], ['client', 'Client']].map(([k, l]) => `<button type="button" class="${m === k ? 'on' : ''}" aria-pressed="${m === k}" data-act="pf-viewas" data-v="${k}">${l}</button>`).join('')}
      </div>
    </div>`;
  }
  function videoCard(c) {
    const op = c.op;
    const dur = DUR[op.video] || '0:45';
    return `<div class="pf-video" data-pf-video>
      <button type="button" class="pf-video-poster" data-act="pf-video-play" aria-label="Play ${esc(op.first)}'s intro video, ${esc(dur)}">
        <span class="pf-video-dur" data-pf-dur>${icon('video')}<span>${esc(dur)}</span></span>
        <span class="pf-wave" aria-hidden="true">${Array.from({ length: 34 }, (_, i) => `<i style="--h:${(18 + Math.round(Math.abs(Math.sin(i * 1.7) * 30) + (i % 5) * 4))}px"></i>`).join('')}</span>
        <span class="pf-play">${icon('play')}</span>
        <span class="pf-video-cap">${RN.ui.avatar(op, 'ava-sm')}<span><b>Meet ${esc(op.first)}</b><em>${esc(op.isMatt ? MATT_VIDEO_LINE : 'A short intro in their own words')}</em></span></span>
      </button>
      ${c.v.owner ? `<a class="pf-video-edit" href="#studio.profile">${icon('refresh')}Update video</a>` : ''}
    </div>`;
  }
  /* At a glance: firmographic and availability facts only. Role details live once, in the Fit section's Operating range. */
  function heroTiles(c) {
    const op = c.op;
    const chips = (key, vals, max) => { const o = ordered(key, vals); const lab = (x) => RN.w.label(key === 'industries' ? 'industries' : key, x); return `<span class="pf-tile-chips">${o.slice(0, max).map((x) => `<span>${esc(lab(x))}</span>`).join('')}${o.length > max ? `<span class="more">+${o.length - max}</span>` : ''}</span>`; };
    const inds = op.industries.slice(0, 2).map((i) => `<span>${esc(RN.w.label('industries', i))}</span>`).join('') + (op.industries.length > 2 ? `<span class="more">+${op.industries.length - 2}</span>` : '');
    const tiles = [
      op.revenueRanges.length && `<div class="pf-tile"><span class="pf-tile-l">${esc(revLabel())}</span>${chips('revenueRange', op.revenueRanges, 3)}</div>`,
      op.employeeRanges.length && `<div class="pf-tile"><span class="pf-tile-l">${esc(F.employeeRange.label)}</span>${chips('employeeRange', op.employeeRanges, 3)}</div>`,
      op.avail.hoursCode && `<div class="pf-tile"><span class="pf-tile-l">${esc(F.hoursPerMonth.label)}</span><b class="pf-tile-v">${esc(RN.w.label('hoursPerMonth', op.avail.hoursCode).replace(' / month', ''))}<small>/ month</small></b></div>`,
      op.industries.length && `<div class="pf-tile"><span class="pf-tile-l">${esc(F.industries.label)}</span><span class="pf-tile-chips">${inds}</span></div>`,
    ].filter(Boolean);
    if (!tiles.length && !c.v.owner) return '';
    return `<div class="pf-tiles">
      <span class="pf-tiles-hd"><span class="eyebrow">At a glance</span><span>${esc(catLabel(op.catKey))}</span></span>
      ${tiles.length ? `<div class="pf-tiles-grid">${tiles.join('')}</div>` : ''}
      ${c.v.owner ? `<a class="pf-video-edit" href="#studio.profile">${icon('video')}Add an intro video</a>` : ''}
    </div>`;
  }
  function heroCtas(c) {
    const op = c.op, v = c.v;
    const inCompare = RN.store.state.compare.includes(op.id);
    if (v.owner) {
      return `<div class="pf-cta" data-pf-cta>
        <a class="btn btn-leaf btn-lg btn-block" href="#studio.profile">${icon('edit')}Edit in Studio</a>
        <div class="pf-cta-2"><button type="button" class="btn btn-line btn-sm" data-act="pf-share">${icon('share')}Share profile</button></div>
      </div>`;
    }
    const act = v.preview ? 'pf-preview-cta' : 'intro-open';
    const intro = myIntro(op);
    return `<div class="pf-cta" data-pf-cta>
      ${intro ? `<a class="btn btn-leaf btn-lg btn-block" href="#buyer.intros">Track your intro · ${esc(RN.w.label('introStatus', intro.status))}${icon('arrow')}</a>`
        : `<button type="button" class="btn btn-leaf btn-lg btn-block" data-act="${act}" data-id="${esc(op.id)}">Request intro${icon('arrow')}</button>`}
      <div class="pf-cta-2">
        <button type="button" class="btn btn-line btn-sm ${inCompare ? 'is-on' : ''}" data-act="${v.preview ? 'pf-preview-cta' : 'compare-toggle'}" data-id="${esc(op.id)}" aria-pressed="${inCompare}">${icon(inCompare ? 'check' : 'compare')}${inCompare ? 'Added to compare' : 'Add to compare'}</button>
        <button type="button" class="btn btn-line btn-sm" data-act="pf-share">${icon('share')}Share</button>
      </div>
    </div>`;
  }
  /* Phones: the primary action stays one tap away (hidden while the hero or Engage buttons are on screen) */
  function mobileBar(c) {
    const op = c.op, v = c.v;
    const intro = !v.owner && myIntro(op);
    const cta = v.owner ? `<a class="btn btn-sm" href="#studio.profile">${icon('edit')}Edit in Studio</a>`
      : intro ? `<a class="btn btn-sm btn-line" href="#buyer.intros">Track your intro</a>`
      : `<button type="button" class="btn btn-sm" data-act="${v.preview ? 'pf-preview-cta' : 'intro-open'}" data-id="${esc(op.id)}">Request intro</button>`;
    return `<div class="pf-mbar" data-pf-mbar role="region" aria-label="${esc(v.owner ? 'Edit your profile' : 'Request an intro to ' + op.first)}">
      <span class="pf-mbar-who"><b>${esc(op.name)}</b><span><i class="dot ${availDot(op)}"></i>${esc(op.avail.label)}</span></span>${cta}
    </div>`;
  }

  /* ---------- Proof strip: 3 cards overlapping the band ---------- */
  function proofCards(c) {
    const op = c.op;
    const tier = F.risTierFor(op.ris.score);
    const pctile = RN.clamp(Math.round(ncdf((op.ris.score - PEER.mean) / PEER.sd) * 100), 1, 99);
    const rep = `<article class="pf-proof pf-proof-rep">
      <div class="pf-ring">${RN.chart.ring(op.ris.score, { size: 88, stroke: 8, label: 'Reputation Index ' + op.ris.score })}<b class="serif-up">${esc(op.ris.score)}</b></div>
      <div class="pf-rep-r">
        <div class="pf-proof-hd"><span>Reputation Index ${RN.ui.tip(RN.ui.risExplainer(), 'How score is calculated')}</span><span class="pf-tierchip ${tier.v === 'elite' || tier.v === 'apex' ? 'gold' : ''}">${RN.ui.hexSeal(tier.l)}${esc(tier.l)}</span></div>
        <div class="pf-bell">${RN.chart.bell({ w: 230, h: 64, mean: PEER.mean, sd: PEER.sd, value: op.ris.score, label: `${ordinal(pctile)} percentile of ${catLabel(op.catKey)} operators` })}</div>
        <div class="pf-bell-foot"><span>Median ${PEER.mean} ${RN.ui.illus('Illustrative peers')}</span><b>${ordinal(pctile)} percentile</b></div>
      </div>
      <div class="pf-rep-x"><b class="${tier.v === 'elite' || tier.v === 'apex' ? 'gold' : ''}">${esc(tier.l)} · ${esc(op.ris.score)} of 100</b><p>${esc(tier.d)}</p><span>One score for every client, built from review volume, verified focus areas, ratings, profile completeness and engagement recency.</span></div>
    </article>`;
    // How long clients stay
    const median = medianMonths();
    const ver = c.engs.filter((e) => e.verified);
    const rows = (ver.length ? ver : c.engs).slice(0, 3);
    const scale = Math.max(24, ...rows.map((e) => e.months || 0));
    const stay = `<article class="pf-proof">
      <div class="pf-proof-hd"><span>How long clients stay</span></div>
      ${rows.length ? `<div class="pf-stay" style="--med:${((median / scale) * 100).toFixed(1)}%">
          ${rows.map((e) => `<div class="pf-stay-row ${e.verified ? '' : 'self'}"><i style="width:calc(${Math.max(6, ((e.months || 0) / scale) * 100).toFixed(1)}% * .6)"></i><span><b>${esc(plural(e.months || 0, 'mo', 'mo'))}</b> · ${esc(e.company)}</span></div>`).join('')}
          <span class="pf-stay-med" aria-hidden="true"><em>median ${median} mo</em></span>
        </div>
        <p class="pf-proof-note">${ver.length ? `Client-verified engagements vs the ${median}-month median in the ${jumpBtnLink('report', 'State of Fractional GTM')}` : `Self-reported. Each turns verified when that client leaves a review.`}</p>`
      : `<p class="pf-proof-empty">No engagements added yet</p><p class="pf-proof-note">${c.v.owner ? '<a class="act" href="#studio.profile">Add engagement history</a>' : `Shown once ${esc(op.first)} adds engagement history.`}</p>`}
    </article>`;
    // Would hire again
    const n = c.reviews.length;
    const again = n ? Math.round((c.reviews.filter((r) => r.hireAgain !== false).length / n) * 100) : 0;
    const avg = n ? mean(c.reviews.map((r) => +r.overall || 5)) : 0;
    const hire = n ? `<article class="pf-proof">
      <div class="pf-proof-hd"><span>Would hire again</span></div>
      <p class="pf-big serif-up">${again}%</p>
      <button type="button" class="pf-hire-link" data-act="pf-jump" data-to="pf-reviews"><span class="pf-dots">${c.reviews.map(() => '<i></i>').join('')}</span><u>${esc(plural(n, 'client'))}</u><span>· ${avg.toFixed(1)}</span>${RN.ui.stars(avg)}${icon('arrow')}</button>
    </article>` : `<article class="pf-proof">
      <div class="pf-proof-hd"><span>Client reviews</span></div>
      <p class="pf-proof-empty">None yet</p>
      <p class="pf-proof-note">${c.v.owner ? `<a class="act" href="#studio.credibility">Request a review from a past client</a>` : `Reviews come from past clients ${esc(op.first)} invites. Each one verifies focus areas.`}</p>
    </article>`;
    return rep + stay + hire;
  }
  function jumpBtnLink(route, label) { return `<a class="link" href="#${route}">${esc(label)}</a>`; }
  function medianMonths() {
    const s = (RN.data.market.report.summary || []).find((x) => /mo$/.test(x.v));
    return s ? parseFloat(s.v) : 6.4;
  }

  /* ---------- Sticky sub-nav: only sections that exist ---------- */
  function subnav(c, secs) {
    const op = c.op;
    return `<nav class="pf-subnav" aria-label="Profile sections">
      <div class="wrap pf-subnav-in">
        <div class="pf-subnav-links">${secs.map((s, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-act="pf-jump" data-to="pf-${s.key}" data-nav="${s.key}">${esc(s.label)}</button>`).join('')}</div>
        <div class="pf-subnav-cta">${RN.ui.avatar(op, 'ava-xs')}<span class="pf-subnav-name">${esc(op.name)}</span>
          ${c.v.owner ? `<a class="btn btn-sm" href="#studio.profile">Edit</a>` : `<button type="button" class="btn btn-sm" data-act="${c.v.preview ? 'pf-preview-cta' : 'intro-open'}" data-id="${esc(op.id)}">Request intro</button>`}</div>
      </div>
    </nav>`;
  }

  /* ---------- About ---------- */
  function secAbout(c) {
    const op = c.op;
    const text = op.bio || op.headline;
    if (!text) return '';
    const paras = String(text).split(/\n+/).filter(Boolean);
    // Each data point once: CRM and methodologies show here only when the Fit section's Operating range does not carry them
    const inRange = (k) => (F.roleFields[op.catKey] || []).includes(k) && !!roleVal(op, k);
    const methods = op.methodologies.filter((m) => m !== 'Other');
    const facts = [
      op.crm && !inRange('crm') && `<div><dt>${esc(F.crm.label)}</dt><dd>${esc(RN.w.label('crm', op.crm))}</dd></div>`,
      methods.length && !inRange('methodologies') && `<div><dt>${esc(F.methodologies.label)}</dt><dd>${esc(RN.w.labels('methodologies', methods))}</dd></div>`,
    ].filter(Boolean);
    return sec(c, 'about', 'About', `In ${esc(op.first)}’s words`, `<div class="pf-about">${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${facts.length ? `<dl class="pf-about-facts">${facts.join('')}</dl>` : ''}`, { edit: 'studio.profile' });
  }

  /* ---------- Ways to work with {first}: packaged engagements built on Engagement Blueprints ---------- */
  // A representative company revenue band for pricing: the middle of the operator's own ranges
  function repRev(op) { const o = ordered('revenueRange', op.revenueRanges); return o.length ? o[Math.floor((o.length - 1) / 2)] : '5m_20m'; }
  function offersFor(op) {
    const PJ = RN.projects || {};
    const find = (id) => (PJ.blueprint ? PJ.blueprint(id) : (PJ.blueprints || []).find((b) => b.id === id));
    return (op.offers || []).map(find).filter(Boolean);
  }
  function secOffers(c) {
    const op = c.op, v = c.v;
    const bps = offersFor(op);
    if (!bps.length) {
      if (!v.owner) return '';
      return sec(c, 'offers', 'Ways to work', `Ways to work with ${esc(op.first)}`, RN.ui.empty({ icon: 'briefcase', title: 'No packaged engagements yet',
        body: 'Pick the Engagement Blueprints you run. Clients see the problem each one solves, a typical monthly range and a one-click request.',
        cta: '<a class="btn btn-sm" href="#studio.profile">Add offers in Studio</a>' }));
    }
    const rev = repRev(op), hrs = op.avail.hoursCode || '40';
    const m = RN.model.monthlyRange(op.catKey, rev, hrs);
    const cards = bps.map((b) => `<article class="pf-offer">
        <span class="label">${esc([b.engagementType && RN.w.label('engagementType', b.engagementType), b.term && RN.w.label('term', b.term)].filter(Boolean).join(' · '))}</span>
        <h3 class="h4">${esc(b.title)}</h3>
        <p class="pf-offer-blurb">${esc(b.blurb || '')}</p>
        ${(b.when || [])[0] ? `<p class="pf-offer-when"><b>The problem it solves</b>${esc(b.when[0])}</p>` : ''}
        <div class="pf-offer-m"><span>Typical month</span><b class="num">${esc(m.label)}</b></div>
        <div class="pf-offer-f">
          ${v.owner ? '' : `<button type="button" class="btn btn-sm" data-act="${v.preview ? 'pf-preview-cta' : 'pf-offer'}" data-id="${esc(op.id)}" data-bp="${esc(b.id)}">Request this</button>`}
          <a class="act" href="#blueprint.${esc(b.id)}">See the 90-day plan${icon('arrow')}</a>
        </div>
      </article>`).join('');
    return sec(c, 'offers', 'Ways to work', `Ways to work with ${esc(op.first)}`, `<div class="pf-offers">${cards}</div>
      <p class="pf-note">${RN.ui.illus()} Typical months use the Rate Index for ${esc(catLabel(op.catKey))} at ${esc(RN.w.label('hoursPerMonth', hrs))} for a ${esc(RN.w.label('revenueRange', rev))} company. They are operator rates; engagements through Revenue Nomad are billed all-in, including the 25% fee.</p>`,
    { sub: `Packaged engagements ${esc(op.first)} runs, each built on a Revenue Nomad <a class="link" href="#blueprints">Engagement Blueprint</a>.`, edit: 'studio.profile', editLabel: 'Edit offers' });
  }

  /* ---------- Fit: who {first} is right for ---------- */
  function secFit(c) {
    const op = c.op;
    const engRev = {}, engEmp = {};
    c.engs.forEach((e) => { if (e.revenueRange) engRev[e.revenueRange] = (engRev[e.revenueRange] || 0) + 1; if (e.employeeRange) engEmp[e.employeeRange] = (engEmp[e.employeeRange] || 0) + 1; });
    const nEng = c.engs.filter((e) => e.revenueRange || e.employeeRange).length;
    // With engagement history: bar charts of engagements per company size, as in the original explorer.
    // Without it: the operator's stated ranges on a segmented scale. Both use the registry picklists.
    const bars = (key, counts, title, note) => {
      const max = Math.max(1, ...F[key].options.map((o) => counts[o.v] || 0));
      return `<div class="pf-bb-w"><h3 class="h5 pf-h3">${esc(title)}</h3>
        <div class="pf-bb" role="list">${F[key].options.map((o) => { const n = counts[o.v] || 0;
          return `<div class="pf-bb-row" role="listitem" aria-label="${esc(o.l)}: ${n ? plural(n, 'engagement') : 'no engagements'}"><span class="pf-bb-l">${esc(o.l)}</span><span class="pf-bb-track"><span class="pf-bb-fill" style="width:${(n / max) * 100}%"></span></span><span class="pf-bb-n">${n || '–'}</span></div>`; }).join('')}</div>
        <p class="pf-note">${esc(note)}</p></div>`;
    };
    const scale = (key, sel, label) => `<div class="pf-strip-w"><span class="label pf-lab">${esc(label)}</span>
      <div class="pf-strip" role="list">${F[key].options.map((o) => `<span role="listitem" class="pf-cell ${sel.includes(o.v) ? 'on' : ''}" aria-label="${esc(o.l)}${sel.includes(o.v) ? ', selected' : ''}"><span>${esc(o.l)}</span></span>`).join('')}</div></div>`;
    const left = nEng ? `<div class="pf-fit-size">
        ${bars('revenueRange', engRev, 'Company size worked with', `Annual revenue at the start of each of ${plural(nEng, 'engagement')}.`)}
        ${bars('employeeRange', engEmp, 'Employee count', `Company headcount at each of ${plural(nEng, 'engagement')}.`)}
      </div>`
      : (op.revenueRanges.length || op.employeeRanges.length) ? `<div class="pf-fit-size">
        <h3 class="h5 pf-h3">Company size</h3>
        ${op.revenueRanges.length ? scale('revenueRange', op.revenueRanges, 'Annual revenue') : ''}
        ${op.employeeRanges.length ? scale('employeeRange', op.employeeRanges, 'Employee count') : ''}
        <p class="pf-note">Company sizes ${esc(op.first)} works with.</p>
      </div>` : '';
    const inds = op.industries.length ? `<div class="pf-fit-ind"><h3 class="h5 pf-h3">${esc(F.industries.label)} <span class="pf-count">${op.industries.length}</span></h3>
      <div class="pf-chips">${op.industries.map((i) => `<span class="pf-chip">${esc(RN.w.label('industries', i))}</span>`).join('')}</div></div>` : '';
    const keys = F.roleFields[op.catKey] || [];
    const vals = keys.map((k) => ({ k, rv: roleVal(op, k) })).filter((x) => x.rv);
    const bigs = vals.filter((x) => x.rv.kind === 'big');
    const rest = vals.filter((x) => x.rv.kind !== 'big');
    const range = vals.length ? `<div class="pf-range">
        <h3 class="h5 pf-h3">Operating range</h3>
        ${bigs.length ? `<div class="pf-range-bigs">${bigs.map((x) => roleValHtml(x.k, x.rv)).join('')}</div>` : ''}
        ${rest.map((x) => roleValHtml(x.k, x.rv)).join('')}
      </div>` : '';
    if (!left && !inds && !range) return '';
    const facts = c.engs.length ? `<h3 class="h5 pf-h3 pf-facts-h">Engagements</h3><dl class="pf-facts">
        <div class="pf-facts-stack"><dt>Roles held</dt><dd class="pf-chips">${[...new Set(c.engs.map((e) => e.role).filter(Boolean))].slice(0, 4).map((r) => `<span class="pf-chip sm">${esc(r)}</span>`).join('')}</dd></div>
        <div><dt>Engagement length</dt><dd>${esc((() => { const m = c.engs.map((e) => e.months || 0).filter(Boolean); return m.length ? (Math.min(...m) === Math.max(...m) ? plural(m[0], 'month') : `${Math.min(...m)} – ${Math.max(...m)} months`) : '—'; })())}</dd></div>
        <div><dt>Client-verified</dt><dd>${Math.round((c.engs.filter((e) => e.verified).length / c.engs.length) * 100)}%</dd></div>
      </dl>` : '';
    return sec(c, 'fit', `Fit · ${esc(catLabel(op.catKey))}`, `Who ${esc(op.first)} is right for`,
      `<div class="pf-fit">
        <div class="pf-fit-l">${left}${facts}${inds}</div>
        ${range ? `<div class="pf-fit-r">${range}</div>` : ''}
      </div>`, { edit: 'studio.profile' });
  }

  /* ---------- Expertise: GTM Framework (bowtie + radar) and fit tags ---------- */
  function secExpertise(c) {
    const op = c.op;
    if (!c.tags.length) return '';
    return sec(c, 'expertise', 'Expertise · GTM Framework', 'Where the proof is', expertiseBody(c), {
      sub: `${plural(c.verified.length, 'focus area')} verified by clients, ${c.tags.length - c.verified.length} self-claimed. Mapped onto the ${jumpBtnLink('framework', 'GTM Framework')}.`,
      edit: 'studio.profile', editLabel: 'Edit fit tags',
    });
  }
  function expertiseBody(c) {
    return `<div class="pf-bow-wrap">
        <div class="pf-bow pf-bow-h">${bowtie(c, false)}</div>
        <div class="pf-bow pf-bow-v">${bowtie(c, true)}</div>
        <div class="legend pf-legend"><span><i class="pf-lg-ramp"></i>Stronger client-verified proof</span><span><i class="pf-lg-claimed"></i>Self-claimed only</span><span><i class="pf-lg-empty"></i>Nothing tagged</span></div>
      </div>
      <div class="pf-exp-grid">
        <div class="pf-radar">${radar(c)}</div>
        <div class="pf-focus" aria-live="polite">${focusPanel(c)}</div>
      </div>
      <div class="pf-taglist">${tagList(c)}</div>`;
  }
  function shadeFor(a) {
    if (!a) return { fill: 'var(--card)', stroke: 'var(--line)', dash: '4 4', ink: 'var(--mute-2)', t: 0 };
    if (a.claimedOnly) return { fill: 'var(--sunk)', stroke: 'var(--line)', ink: 'var(--mute)', t: 0 };
    const t = Math.min(1, Math.sqrt(a.pct / 100) * 1.15);
    return { fill: `color-mix(in srgb, var(--viz-1) ${Math.round(t * 100)}%, var(--viz-3))`, stroke: 'none', ink: t > 0.5 ? 'var(--accent-ink)' : 'var(--ink)', t };
  }
  function bowtie(c, vertical) {
    const st = c.stages;
    const sel = S.focus && S.focus.kind === 'stage' ? S.focus.key : null;
    const seg = (s, i, pts, lx, ly) => {
      const a = c.stAgg[s.name];
      const sh = shadeFor(a);
      const isSel = sel === s.name;
      const lab = a ? (a.claimedOnly ? 'Claimed' : a.pct + '%') : '—';
      return `<g class="pf-seg ${isSel ? 'sel' : ''}" role="button" tabindex="0" aria-pressed="${isSel}" data-act="pf-focus" data-kind="stage" data-key="${esc(s.name)}" aria-label="${esc(s.name)}: ${a ? (a.claimedOnly ? 'self-claimed only' : a.pct + '% proof strength') : 'no expertise tagged'}">
        <polygon points="${pts}" style="fill:${sh.fill};stroke:${isSel ? 'var(--ink)' : sh.stroke};stroke-width:${isSel ? 2.5 : 1.2}" ${sh.dash && !isSel ? `stroke-dasharray="${sh.dash}"` : ''}/>
        <text x="${lx}" y="${ly}" text-anchor="middle" class="pf-seg-t" style="fill:${sh.ink}">${esc(s.name)}</text>
        <text x="${lx}" y="${ly + 16}" text-anchor="middle" class="pf-seg-p" style="fill:${sh.ink}">${esc(lab)}</text>
      </g>`;
    };
    if (!vertical) {
      const H = [184, 148, 112, 76, 76, 112, 148, 184];
      const w = 76, gap = 4, cy = 128;
      const body = st.map((s, i) => {
        const x = i * (w + gap), h0 = H[i], h1 = H[i + 1];
        const pts = [[x, cy - h0 / 2], [x + w, cy - h1 / 2], [x + w, cy + h1 / 2], [x, cy + h0 / 2]].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
        return seg(s, i, pts, x + w / 2, cy - 2);
      }).join('');
      const kx = 3 * (w + gap) + w / 2;
      return `<svg viewBox="0 0 556 226" role="group" aria-label="Revenue lifecycle: proof strength by stage">
        <text x="0" y="14" class="pf-bow-cap">Before the sale</text><text x="556" y="14" text-anchor="end" class="pf-bow-cap">After the sale</text>
        <text x="${kx}" y="${cy - 48}" text-anchor="middle" class="pf-bow-cap">Signed</text>${body}</svg>`;
    }
    const Wd = [300, 252, 204, 156, 156, 204, 252, 300];
    const h = 44, gap = 4, cx = 160;
    let y = 22;
    const body = st.map((s, i) => {
      if (i === 4) y += 20;
      const w0 = Wd[i], w1 = Wd[i + 1];
      const pts = [[cx - w0 / 2, y], [cx + w0 / 2, y], [cx + w1 / 2, y + h], [cx - w1 / 2, y + h]].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
      const out = seg(s, i, pts, cx, y + 20);
      y += h + gap;
      return out;
    }).join('');
    return `<svg viewBox="0 0 320 ${y + 4}" role="group" aria-label="Revenue lifecycle: proof strength by stage">
      <text x="160" y="12" text-anchor="middle" class="pf-bow-cap">Before the sale</text>
      <text x="160" y="${22 + 4 * (h + gap) + 12}" text-anchor="middle" class="pf-bow-cap">Signed · after the sale</text>${body}</svg>`;
  }
  function radar(c) {
    const op = c.op;
    const size = 420; // larger viewBox so the polygon fills more of the plot (radar keeps a fixed 54-unit label margin)
    const vals = c.axes.map((a) => (c.axAgg[a] ? c.axAgg[a].pct / 100 : 0));
    const peers = RN.model.ops.filter((o) => o.catKey === op.catKey && o.id !== op.id);
    const typical = c.axes.map((a) => {
      const arr = peers.map((o) => { const g = agg(o.tags.filter((t) => t.axis === a)); return g ? g.pct : 0; }).sort((x, y) => x - y);
      return arr.length ? arr[Math.floor(arr.length / 2)] / 100 : 0;
    });
    const sel = S.focus && S.focus.kind === 'axis' ? S.focus.key : null;
    const r = size / 2 - 54;
    const labels = c.axes.map((a, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / c.axes.length;
      const x = size / 2 + Math.cos(ang) * r * 1.2, y = size / 2 + Math.sin(ang) * r * 1.2;
      const side = Math.abs(x - size / 2) < 8 ? (y < size / 2 ? 'top' : 'bot') : x > size / 2 ? 'right' : 'left';
      const g = c.axAgg[a];
      return `<button type="button" class="pf-ax pf-ax-${side} ${sel === a ? 'on' : ''} ${g && g.claimedOnly ? 'claimed' : ''}" style="left:${((x / size) * 100).toFixed(2)}%;top:${((y / size) * 100).toFixed(2)}%" data-act="pf-focus" data-kind="axis" data-key="${esc(a)}" aria-pressed="${sel === a}">${esc(a)}<b>${g ? g.pct + '%' : '—'}</b></button>`;
    }).join('');
    return `<div class="pf-radar-plot">${RN.chart.radar(c.axes, vals, { size, labels: false, compare: typical, label: `${op.first}'s capability map across six areas` })}${labels}</div>
      <div class="legend pf-radar-legend"><span><i style="background:var(--viz-1)"></i>${esc(op.first)}</span><span><i class="pf-lg-line"></i>Typical ${esc(catLabel(op.catKey))} operator on the network</span></div>`;
  }
  function focusPanel(c) {
    const op = c.op;
    const f = S.focus;
    if (!f) {
      return `<h3 class="h5 pf-h3">How these scores work</h3>
        <p class="pf-focus-p">Each stage and area scores its <b>best three focus areas</b>. One client review verifies a focus area at 50 points, each further review adds more (60, 70, 80), and a fifth makes it Expert (85 and up). Self-claimed focus areas count 10. Three focus areas at 100 make 100%.</p>
        <p class="pf-focus-hint">${icon('target')}Select a stage in the bowtie or an area on the map to see what counts.</p>`;
    }
    const isStage = f.kind === 'stage';
    const stage = isStage ? c.stages.find((s) => s.name === f.key) : null;
    const a = isStage ? c.stAgg[f.key] : c.axAgg[f.key];
    const tags = op.tags.filter((t) => (isStage ? t.stage === f.key : t.axis === f.key));
    const slots = [0, 1, 2].map((i) => {
      const x = a && a.top[i];
      return x ? `<li><span>${esc(x.t.t)}</span><em>${x.t.tier === 'claimed' ? 'self-claimed' : x.t.tier}</em><b>+${x.p}</b></li>` : `<li class="empty"><span>No focus area yet</span><em></em><b>—</b></li>`;
    }).join('');
    const groups = {};
    sortTags(tags).forEach((t) => { const k = CONTRIB[t.c] || 'Leads the team'; (groups[k] = groups[k] || []).push(t); });
    return `<div class="pf-focus-hd"><h3 class="h5 pf-h3">${esc(f.key)}</h3>${a ? `<span class="pill ${a.claimedOnly ? '' : 'pill-accent'}">${a.claimedOnly ? 'Self-claimed only' : a.pct + '%'}</span>` : ''}
        <button type="button" class="x-btn pf-x" data-act="pf-focus-clear" aria-label="Clear selection">${icon('x')}</button></div>
      <p class="pf-focus-p">${esc(isStage ? stage.what : AXIS_DEF[f.key] || '')}</p>
      ${a ? `<span class="label pf-lab">What counts toward the score</span>
        <ol class="pf-slots">${slots}</ol>
        <p class="pf-slots-foot"><span>${a.sum} of 300 points</span><b>${a.pct}%</b></p>
        <span class="label pf-lab">How ${esc(op.first)} contributes here</span>
        <div class="pf-contrib">${CONTRIB_ORDER.filter((k) => groups[k]).map((k) => `<div><b>${esc(k)}</b><span>${groups[k].slice(0, 6).map((t) => `<span class="${t.tier === 'claimed' ? 'cl' : 'v'}">${t.tier !== 'claimed' ? icon('check') : ''}${esc(t.t)}</span>`).join('')}</span></div>`).join('')}</div>`
        : `<p class="pf-focus-empty">No focus areas tagged ${isStage ? 'in this stage' : 'in this area'} yet.</p>`}`;
  }
  function tagTip(op, t) {
    const info = RN.model.tagInfo(t.t) || {};
    const cat = catLabel(info.c || t.c);
    const g = info.g || t.g;
    const by = confirmers(op, t);
    return `<span class="pf-tip-k">${esc(cat)}${g && g !== cat ? ' › ' + esc(g) : ''}</span><br><b>${esc(t.t)}</b>${info.d ? '<br>' + esc(info.d) : ''}<br><span style="opacity:.8">${by.length ? 'Verified by ' + esc(by.join(', ')) : 'Self-claimed. Not yet verified by a client.'}</span>`;
  }
  function tagList(c) {
    const op = c.op;
    const f = S.focus;
    let tags = c.tags;
    if (f) tags = tags.filter((t) => (f.kind === 'stage' ? t.stage === f.key : t.axis === f.key));
    const ver = tags.filter((t) => t.tier !== 'claimed');
    const cl = tags.filter((t) => t.tier === 'claimed');
    const LIMIT = 7;
    const showVer = S.tagsAll ? ver : ver.slice(0, LIMIT);
    const showCl = S.tagsAll ? cl : cl.slice(0, Math.max(0, LIMIT - showVer.length));
    const row = (t) => {
      const by = confirmers(op, t);
      return `<li class="pf-tag">
        <div class="pf-tag-top"><button type="button" class="pf-tagname" data-tip="${esc(tagTip(op, t))}">${esc(t.t)}</button>
          <span class="pf-badge ${t.tier}">${t.tier === 'expert' ? 'Expert' : 'Verified'}</span>
          <b class="pf-tag-score">${t.score}</b></div>
        <div class="pf-bar"><i style="width:${t.score}%"></i></div>
        <p class="pf-tag-ev">Confirmed by ${by.map((co) => jumpBtn('pf-review-' + RN.slug(co), esc(co), 'pf-evlink')).join(', ') || 'a client'} · ${esc(plural(t.r || by.length || 1, 'client review'))} · ${esc(CONTRIB[t.c] || '')}</p>
      </li>`;
    };
    const title = f ? `Focus areas in ${esc(f.key)}` : ver.length ? 'Top verified focus areas' : 'Focus areas';
    return `<div class="pf-taglist-hd"><h3 class="h5 pf-h3">${title}</h3>
        ${f ? `<button type="button" class="act" data-act="pf-focus-clear">Show all expertise</button>` : ''}</div>
      ${showVer.length ? `<ul class="pf-tags">${showVer.map(row).join('')}</ul>` : ''}
      ${showCl.length ? `<div class="pf-claimed">${ver.length ? `<p class="pf-claimed-hd"><b>Also claims ${plural(cl.length, 'focus area')}</b> not yet verified by a client</p>` : `<p class="pf-claimed-hd">Self-claimed by ${esc(op.first)}. Each one turns verified when a client confirms it in a review.</p>`}
        <div class="pf-chips">${showCl.map((t) => `<button type="button" class="pf-chip dashed" data-tip="${esc(tagTip(op, t))}">${esc(t.t)}</button>`).join('')}</div></div>` : ''}
      ${!tags.length ? `<p class="pf-focus-empty">No focus areas here yet.</p>` : ''}
      ${tags.length > LIMIT ? `<button type="button" class="pf-showall" data-act="pf-tags-all">${S.tagsAll ? 'Show top 7' : `Show all ${tags.length} focus areas`}${icon(S.tagsAll ? 'chev-up' : 'chev-down')}</button>` : ''}`;
  }

  /* ---------- Tech stack: grouped by the four standard proficiency levels ---------- */
  function secStack(c) {
    const op = c.op, st = c.stack;
    const P = F.stackProficiency.options;
    const meter = (lvl) => `<span class="pf-pm" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= lvl ? 'on' : ''} ${lvl === 4 ? 'dev' : ''}"></i>`).join('')}</span>`;
    const mark = (name) => (TOOL_LOGO[name] ? `<span class="pf-tl-mark img">${RN.ui.logo(TOOL_LOGO[name], { name, h: 20 })}</span>` : `<span class="pf-tl-mark">${esc(name[0])}</span>`);
    const groups = P.slice().reverse().map((o) => ({ l: o.l, d: o.d, lvl: o.level, tools: st.tools.filter((t) => t.lvl === o.level) }))
      .concat([{ l: 'Level not set', d: 'Named by the operator or confirmed by a client, without a proficiency level.', lvl: 0, tools: st.tools.filter((t) => !t.lvl) }])
      .filter((g) => g.tools.length);
    return sec(c, 'stack', 'Tech stack', `Tools ${esc(op.first)} works in`, `
      <label class="pf-search">${icon('search')}<input type="search" placeholder="Search ${st.tools.length} tools, e.g. Salesforce" data-input="pf-stack-q" value="${esc(S.stackQ)}" aria-label="Search ${esc(op.first)}’s tools"></label>
      <p class="pf-stack-res" aria-live="polite" data-pf-stack-res></p>
      <div class="pf-stack-grid">${groups.map((g) => `<div class="pf-stack-cat ${g.lvl >= 3 ? 'core' : ''}" data-cat>
          <div class="pf-stack-cat-hd"><span class="row-nw" style="--gap:8px">${g.lvl ? meter(g.lvl) : ''}<b>${esc(g.l)}</b></span><span class="pf-count">${g.tools.length}</span></div>
          <p class="pf-stack-d">${esc(g.d)}</p>
          <ul>${g.tools.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<li class="pf-tool" data-name="${esc(lc(t.name))}" data-lvl="${t.lvl}" data-by="${esc(t.by)}">
            ${mark(t.name)}<span class="pf-tool-n"><b>${esc(t.name)}</b>${t.by ? `<button type="button" class="pf-tool-v" data-act="pf-jump" data-to="pf-review-${RN.slug(t.by)}">${icon('check-circle')}Confirmed by ${esc(t.by)}</button>` : ''}</span></li>`).join('')}</ul>
        </div>`).join('')}</div>
      <p class="pf-note">${st.illus ? `${RN.ui.illus('Illustrative levels')} ` : ''}Proficiency uses the four standard levels from operator intake. “Confirmed by” means a client named the tool in a review.</p>`, { edit: 'studio.profile' });
  }
  function applyStackFilter(root) {
    const box = root.querySelector('#pf-stack');
    if (!box) return;
    const q = lc(S.stackQ);
    const tools = RN.$$('.pf-tool', box);
    const hits = [];
    tools.forEach((el) => { const ok = !q || el.dataset.name.includes(q); el.hidden = !ok; if (ok) hits.push(el); });
    RN.$$('[data-cat]', box).forEach((cat) => { cat.hidden = !RN.$$('.pf-tool', cat).some((t) => !t.hidden); });
    const res = box.querySelector('[data-pf-stack-res]');
    const P = F.stackProficiency.options;
    const op = S.ctx && S.ctx.op;
    if (!q) { res.innerHTML = ''; return; }
    const exact = hits.find((h) => h.dataset.name === q) || (hits.length === 1 ? hits[0] : null);
    if (exact) {
      const o = P.find((x) => x.level === +exact.dataset.lvl);
      res.innerHTML = `<b>${esc(exact.querySelector('.pf-tool-n b').textContent)}</b> · ${o ? `${esc(o.l)} <span class="muted">· ${esc(o.d)}` : '<span class="muted">Level not set'} · ${exact.dataset.by ? 'confirmed by ' + esc(exact.dataset.by) : 'self-reported'}</span>`;
    } else if (hits.length) res.innerHTML = `${plural(hits.length, 'tool')} match “${esc(S.stackQ)}”`;
    else res.innerHTML = `“${esc(S.stackQ)}” isn’t in ${esc(op ? op.first : 'this operator')}’s stack. <a class="link" href="#talk">Ask us for an operator who uses it</a>`;
  }

  /* ---------- Portfolio: work samples only, with filter chips (L324, D371) ---------- */
  function secPortfolio(c) {
    const op = c.op;
    const counts = {};
    c.samples.forEach((s) => { const g = PF_GROUP[s.type] || 'builds'; counts[g] = (counts[g] || 0) + 1; });
    const items = c.samples.filter((s) => S.pf === 'all' || (PF_GROUP[s.type] || 'builds') === S.pf);
    return sec(c, 'portfolio', 'Portfolio · Work samples', 'Playbooks, frameworks and systems', `
      <div class="pf-pf-filters chipset" role="group" aria-label="Filter work samples">${PF_FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => `<button type="button" class="chip chip-sm" aria-pressed="${S.pf === k}" data-act="pf-pf-filter" data-v="${k}">${esc(l)}<span class="pf-chip-n">${k === 'all' ? c.samples.length : counts[k]}</span></button>`).join('')}</div>
      <div class="pf-samples ${S.pf === 'all' ? 'bento' : ''}">${items.map((s, i) => sampleCard(c, s, S.pf === 'all' && i === 0 && s.feature)).join('')}</div>
      <p class="pf-note">${RN.ui.illus('Illustrative previews')} ${op.isMatt ? `Titles and the engagements they came from are ${esc(op.first)}’s. ` : ''}Page previews are placeholders until the files are uploaded.</p>`,
    { edit: 'studio.profile', editLabel: 'Add a work sample' });
  }
  function downloads(op, s) { const r = RN.rng(op.id + s.id); return 6 + Math.floor(r() * 34); }
  function sampleCard(c, s, feature) {
    const op = c.op;
    const e = c.engs.find((x) => lc(x.company) === lc(s.at));
    return `<article class="pf-sample ${feature ? 'feature' : ''}">
      <button type="button" class="pf-cover tone-${esc(s.tone || 'paper')}" data-act="pf-sample" data-id="${esc(s.id)}" aria-label="Open ${esc(s.title)}">
        <span class="pf-cover-pills"><span>${esc(s.type)}</span>${s.pages ? `<span>${s.pages} pages</span>` : ''}</span>
        ${docPages(s, op)}
      </button>
      <div class="pf-sample-meta">
        <h3>${esc(s.title)}</h3>
        <p>${e && e.logo ? `<span class="pf-mini-logo">${logoHtml(e.logo, e.company, 14)}</span>` : ''}${s.at ? `Used at ${esc(s.at)}` : 'Work sample'}${s.skills.length ? ` · verifies ${esc(s.skills.join(', '))}` : ''}</p>
        ${c.v.owner ? `<p class="pf-dl">${icon('upload')}${downloads(op, s)} downloads this quarter <span class="faint">· visible to you only</span> ${RN.ui.illus()}</p>` : ''}
      </div>
    </article>`;
  }
  function docPages(s, op) {
    const fig = {
      flow: `<span class="pf-fig-flow">${['Open', 'Discover', 'Pain', 'Impact', 'Next'].map((x, i) => `<i class="${i === 2 ? 'hi' : ''}">${x}</i>`).join('')}</span>`,
      pyramid: `<span class="pf-fig-pyr"><i></i><i></i><i></i></span>`,
      gantt: `<span class="pf-fig-gantt">${[[0, 40], [20, 45], [50, 30], [60, 35], [75, 25]].map(([l, w], i) => `<i style="margin-left:${l}%;width:${w}%" class="${i === 2 ? 'hi' : ''}"></i>`).join('')}</span>`,
      stages: `<span class="pf-fig-stages">${['Lead', 'Qualified', 'Discovery', 'Proposal', 'Closed'].map((x, i) => `<i class="${i === 4 ? 'hi' : ''}">${x}</i>`).join('')}</span>`,
      check: `<span class="pf-fig-check">${[1, 1, 1, 1, 0, 0].map((d) => `<i class="${d ? 'd' : ''}"></i>`).join('')}</span>`,
    }[s.fig || 'flow'];
    return `<span class="pf-docs" aria-hidden="true">
      <span class="pf-doc back"><span class="pf-doc-rule"></span><i></i><i class="w6"></i><i></i><i class="w8"></i></span>
      <span class="pf-doc front"><span class="pf-doc-rule"></span><span class="pf-doc-hd"><span>${esc(lc(s.at || op.first).toUpperCase())} · ${esc(s.type.toUpperCase())}</span><span>CONFIDENTIAL</span></span>
        <b>${esc((s.toc && s.toc[0]) || s.title)}</b>${fig}<i></i><i class="w8"></i><i class="w6"></i>
        <span class="pf-doc-ft"><span>Prepared by ${esc(op.name)}</span><span>2</span></span></span>
    </span>`;
  }
  function openSample(id) {
    const c = S.ctx;
    if (!c) return;
    const op = c.op;
    const s = c.samples.find((x) => x.id === id);
    if (!s) return;
    const e = c.engs.find((x) => lc(x.company) === lc(s.at));
    const pages = Math.max(3, Math.min(4, s.pages || 3));
    const toc = s.toc && s.toc.length ? s.toc : [s.title];
    const preview = c.v.preview;
    RN.ui.modal({
      width: 920,
      title: esc(s.title),
      sub: `${esc(s.type)}${s.pages ? ` · ${s.pages} pages` : ''}${s.at ? ` · from ${esc(op.first)}’s engagement at ${esc(s.at)}` : ''}`,
      body: `<div class="pf-lb">${Array.from({ length: pages }, (_, i) => i < pages - 1 ? `<figure class="pf-lb-page"><span class="pf-doc front big"><span class="pf-doc-rule"></span><span class="pf-doc-hd"><span>${esc(lc(s.at || op.first).toUpperCase())} · ${esc(s.type.toUpperCase())}</span><span>CONFIDENTIAL</span></span>
            <b>${esc(toc[i % toc.length])}</b><i></i><i class="w8"></i><i></i><i class="w6"></i><i class="w8"></i><i></i><i class="w6"></i><span class="pf-doc-ft"><span>Prepared by ${esc(op.name)}</span><span>${i + 1}</span></span></span><figcaption>Page ${i + 1}</figcaption></figure>`
          : `<figure class="pf-lb-page locked"><span class="pf-doc front big"><span class="pf-doc-rule"></span><i></i><i class="w8"></i><i></i><i class="w6"></i></span><span class="pf-lb-lock">${icon('lock')}<b>${Math.max(1, (s.pages || pages) - (pages - 1))} more pages</b><span>Shared after an intro</span></span><figcaption>Page ${i + 1}</figcaption></figure>`).join('')}</div>
        <div class="pf-lb-prov">${e && e.verified ? icon('check-circle') : icon('info')}<span>${s.at ? `Used at <b>${esc(s.at)}</b>${e && e.verified ? ', a client-verified engagement' : ''}` : 'Work sample'}${s.skills.length ? ` · confirms ${s.skills.map((k) => `<span class="pf-chip sm">${esc(k)}</span>`).join(' ')}` : ''}</span></div>
        ${c.v.owner ? `<p class="small muted pf-lb-note">${icon('upload')} ${downloads(op, s)} downloads this quarter, 4 by companies in Health Care. Clients see page previews; the full file is shared after an intro. ${RN.ui.illus()}</p>` : ''}
        <p class="tiny faint pf-lb-note">${RN.ui.illus('Illustrative previews')} Page previews are placeholders until the file is uploaded.</p>`,
      foot: c.v.owner ? `<button class="btn btn-line" data-act="modal-close">Close</button><a class="btn" href="#studio.profile" data-act="modal-close">Manage samples in Studio</a>`
        : c.v.proof ? `<button class="btn btn-line" data-act="modal-close">Back</button><button class="btn" data-act="pf-proof-sample" data-id="${esc(c.v.proofId)}" data-s="${esc(s.id)}">Ask ${esc(op.first)} for the full sample</button>`
        : `<button class="btn btn-line" data-act="modal-close">Back to profile</button><button class="btn" data-act="${preview ? 'pf-preview-cta' : 'pf-sample-request'}" data-id="${esc(op.id)}">Request full sample</button>`,
    });
  }

  /* ---------- Engagement history (L461 / L491: timeline, role as headline, industry tag) ---------- */
  function secEngagements(c) {
    const op = c.op;
    const hasReviews = c.reviews.length > 0;
    if (!c.engs.length) {
      if (hasReviews) return '';
      return sec(c, 'engagements', 'Engagements', 'Past engagements', RN.ui.empty({ icon: 'briefcase', title: 'No engagements or client reviews yet', body: c.v.owner ? 'Add engagement history in Studio, then ask each client for a review. Reviews verify your focus areas and lift your Reputation Index.' : `${op.first} has not added engagement history yet. Ask about recent work when you request an intro.`,
        cta: c.v.owner ? '<a class="btn btn-sm" href="#studio.profile">Add engagement history</a>' : `<button class="btn btn-sm" data-act="${c.v.preview ? 'pf-preview-cta' : 'intro-open'}" data-id="${esc(op.id)}">Request intro</button>` }));
    }
    if (S.engOpen == null) S.engOpen = { [c.engs[0].key]: true };
    let lastYear = null;
    const items = c.engs.map((e) => {
      const y = String(e.end || e.start || '').slice(0, 4) || String(RN.now().getFullYear());
      const yr = y !== lastYear ? `<span class="pf-tl-year">${esc(y)}</span>` : '';
      lastYear = y;
      return yr + engItem(c, e, hasReviews);
    }).join('');
    return sec(c, 'engagements', hasReviews ? 'Track record' : 'Engagements · Self-reported', hasReviews ? 'Engagement history' : 'Past engagements',
      `<div class="pf-tl">${items}</div>`, { sub: hasReviews ? `${plural(c.engs.length, 'engagement')}, ${c.engs.filter((e) => e.verified).length} verified by the client.` : 'Self-reported by the operator. Each one turns verified when that client leaves a review.', edit: 'studio.profile' });
  }
  function engItem(c, e, hasReviews) {
    const open = !!(S.engOpen && S.engOpen[e.key]);
    const r = e.review;
    const cr = r ? coreOf(r) : null;
    const tags = r ? (r.tags || []) : [];
    const hasDetail = !!(e.outcome || e.context || r || e.samples.length);
    const meta = [e.revenueRange && `${RN.w.label('revenueRange', e.revenueRange)} revenue`, e.employeeRange && `${RN.w.label('employeeRange', e.employeeRange)} employees`].filter(Boolean);
    return `<article class="pf-eng ${e.verified ? 'ver' : ''} ${open ? 'open' : ''}" data-eng="${esc(e.key)}">
      <span class="pf-tl-dot" aria-hidden="true"></span>
      <${hasDetail ? 'button type="button"' : 'div'} class="pf-eng-hd ${hasDetail ? '' : 'static'}" ${hasDetail ? `data-act="pf-eng" data-k="${esc(e.key)}" aria-expanded="${open}"` : ''}>
        <span class="pf-eng-logo">${e.logo ? logoHtml(e.logo, e.company, 24) : `<b>${esc(e.company[0] || '?')}</b>`}</span>
        <span class="pf-eng-main">
          <b class="pf-eng-role">${esc(e.role || 'Engagement')}</b>
          <span class="pf-eng-co">${esc(e.company)}${meta.length ? ` · ${esc(meta.join(' · '))}` : ''}</span>
          <span class="pf-eng-tags">${e.industry ? `<span class="pf-ind">${esc(RN.w.label('industries', e.industry))}</span>` : ''}${e.verified ? `<span class="pf-verified">${icon('check-circle')}Client verified</span>` : `<span class="pf-self">${hasReviews ? 'Self-reported' : `Awaiting a review from ${esc(e.company)}`}</span>`}</span>
        </span>
        <span class="pf-eng-when"><b>${esc(mon(e.start))} – ${esc(mon(e.end))}</b><span>${esc(plural(e.months || 0, 'mo', 'mo'))}${r ? ` · ${RN.ui.stars(r.overall || 5)}` : ''}</span></span>
        ${hasDetail ? `<span class="pf-eng-chev">${icon('chev-down')}</span>` : ''}
      </${hasDetail ? 'button' : 'div'}>
      ${hasDetail ? `<div class="pf-eng-bd" ${open ? '' : 'hidden'}>
        ${e.outcome ? `<div class="pf-outcome"><span class="label pf-lab">Outcome</span><p>${esc(e.outcome)}</p></div>` : ''}
        ${e.context ? `<div class="pf-eng-ctx"><span class="label pf-lab">What ${esc(c.first)} did</span><p>${esc(e.context)}</p></div>` : ''}
        ${r ? `<blockquote class="pf-eng-q"><p>“${esc(r.quote)}”</p><footer><span><b>${esc(r.reviewer)}</b>${r.role ? `, ${esc(r.role)}` : ''}${e.logo ? '' : ` · ${esc(e.company)}`}</span>${e.logo ? `<span class="pf-mini-logo">${logoHtml(e.logo, e.company, 14)}</span>` : ''}${RN.ui.stars(r.overall || 5)}</footer></blockquote>` : ''}
        ${cr ? `<div class="pf-eng-core"><span class="label pf-lab">CORE ratings</span><div class="pf-core-mini">${F.coreDims.options.map((d, i) => `<span title="${esc(d.l)}${cr.notes && cr.notes[i] ? ': ' + esc(cr.notes[i]) : ''}"><b>${esc(d.v)}</b>${cr.scores[i].toFixed(1)}</span>`).join('')}</div></div>` : ''}
        ${tags.length ? `<div><span class="label pf-lab">Focus areas this engagement verified</span><div class="pf-chips">${tags.map((t) => `<span class="pf-chip line">${icon('check')}${esc(t)}</span>`).join('')}</div></div>` : ''}
        ${e.samples.length ? `<div><span class="label pf-lab">Work samples from this engagement</span><div class="pf-eng-samples">${e.samples.map((s) => `<button type="button" class="pf-eng-sample" data-act="pf-sample" data-id="${esc(s.id)}"><span class="pf-ftype">${esc(s.type)}</span><span>${esc(s.title)}</span>${icon('chev-right')}</button>`).join('')}</div></div>` : ''}
      </div>` : ''}
    </article>`;
  }

  /* ---------- Client reviews ---------- */
  function secReviews(c) {
    const op = c.op;
    if (!c.reviews.length) return '';
    const avg = mean(c.reviews.map((r) => +r.overall || 5));
    return sec(c, 'reviews', 'Client reviews', 'What clients say', `<div class="pf-reviews">${c.reviews.map((r, i) => reviewCard(c, r, i)).join('')}</div>`, {
      sub: `${avg.toFixed(1)} average from ${plural(c.reviews.length, 'verified client')}. Reviews publish as submitted and verify the focus areas each client confirms.`,
      side: c.v.owner ? `<a class="act pf-edit" href="#studio.credibility">${icon('send')}Request a review</a>` : c.v.client && !c.v.preview && reviewIntro(op) ? `<button type="button" class="btn btn-line btn-sm" data-act="bw-review-start" data-id="${esc(reviewIntro(op).id)}">${icon('star')}Leave a review</button>` : '',
    });
  }
  function reviewCard(c, r, i) {
    const e = c.engs.find((x) => lc(x.company) === lc(r.company));
    const logoKey = e && e.logo;
    return `<article class="pf-review" id="pf-review-${esc(RN.slug(r.company || 'client-' + i))}">
      <header><span class="pf-rv-ava">${esc(RN.fmt.initials(r.reviewer))}</span><span class="grow"><b>${esc(r.reviewer)}</b><span>${esc([r.role, r.company].filter(Boolean).join(', '))}</span></span>${logoKey ? `<span class="pf-review-logo">${logoHtml(logoKey, r.company, 20)}</span>` : ''}</header>
      <div class="row-nw" style="--gap:8px">${RN.ui.stars(r.overall || 5)}<span class="small muted">${esc(r.date ? RN.fmt.date(r.date + 'T12:00:00') : '')}</span></div>
      <blockquote class="pf-review-q">“${esc(r.quote || '')}”</blockquote>
      <footer><span class="pf-verified">${icon('check-circle')}Verified client</span>${r.hireAgain !== false ? `<span class="pf-self">Would hire again</span>` : ''}${(r.tags || []).length ? `<span class="pf-self">Confirmed ${plural(r.tags.length, 'focus area')}</span>` : ''}
        <button type="button" class="act pf-readmore" data-act="pf-review" data-i="${i}">Read full review${icon('arrow')}</button></footer>
    </article>`;
  }
  function openReview(i) {
    const c = S.ctx;
    const r = c && c.reviews[i];
    if (!r) return;
    const e = c.engs.find((x) => lc(x.company) === lc(r.company));
    const cr = coreOf(r);
    const det = REVIEW_DETAIL[r.reviewer] || {};
    RN.ui.modal({
      width: 660,
      title: `<span class="serif-up" style="font-weight:400">${esc(r.reviewer)}</span>`,
      sub: `${esc([r.role, r.company].filter(Boolean).join(', '))}${r.date ? ' · ' + esc(RN.fmt.date(r.date + 'T12:00:00')) : ''}`,
      body: `<div class="pf-rvm">
        <div class="row" style="--gap:10px"><b class="num h4">${(+r.overall || 5).toFixed(1)}</b>${RN.ui.stars(r.overall || 5)}<span class="pill pill-good">${icon('check-circle')}Verified client</span>${r.hireAgain !== false ? `<span class="pill pill-accent">${icon('check')}Would hire again</span>` : ''}${e && e.logo ? `<span class="pf-review-logo">${logoHtml(e.logo, e.company, 20)}</span>` : ''}</div>
        <span class="label pf-lab">${esc(F.overallExperience.label)}</span>
        <blockquote class="pf-rvm-q">“${esc(r.quote || '')}”</blockquote>
        <span class="label pf-lab">CORE ratings</span>
        ${cr ? `<div class="pf-rvm-core">${F.coreDims.options.map((d, k) => `<div class="pf-rvm-dim"><span class="pf-core-l">${esc(d.v)}</span><div><div class="row-nw" style="--gap:10px"><b>${esc(d.l)}</b><span class="num accent">${cr.scores[k].toFixed(1)} / 5</span>${pips(cr.scores[k])}</div>
            <p class="pf-rvm-ask">${esc(d.q)}</p>${cr.notes && cr.notes[k] ? `<p class="pf-rvm-note">“${esc(cr.notes[k])}”</p>` : ''}</div></div>`).join('')}</div>
            ${cr.notes && cr.notes.some(Boolean) ? '' : `<p class="small muted">This client scored each dimension without a written note.</p>`}`
        : `<p class="small muted">This client left a star rating and written review without CORE ratings.</p>`}
        ${(r.tags || []).length ? `<span class="label pf-lab">Focus areas this client verified</span><div class="pf-chips">${r.tags.map((t) => `<span class="pf-chip v">${icon('check-circle')}${esc(t)}</span>`).join('')}</div>` : ''}
        ${e ? `<span class="label pf-lab">Engagement</span><dl class="pf-facts">
          <div><dt>Operator title at engagement</dt><dd>${esc(e.role || det.title || '')}</dd></div>
          <div><dt>Engagement dates</dt><dd>${esc(mon(e.start))} – ${esc(mon(e.end))} · ${esc(plural(e.months || 0, 'mo', 'mo'))}</dd></div>
          ${e.revenueRange ? `<div><dt>Company revenue</dt><dd>${esc(RN.w.label('revenueRange', e.revenueRange))}</dd></div>` : ''}
          ${e.industry ? `<div><dt>Industry</dt><dd>${esc(RN.w.label('industries', e.industry))}</dd></div>` : ''}
        </dl>` : ''}
      </div>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Close</button>`,
    });
  }
  const pips = (v) => `<span class="pf-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(v) ? 'on' : ''}"></i>`).join('')}</span>`;

  /* ---------- CORE: how clients rate working with {first} ---------- */
  function coreStats(c) {
    const revs = c.coreRevs;
    const dims = F.coreDims.options.map((d, i) => {
      const vals = revs.map((x) => x.c.scores[i]);
      const avg = mean(vals);
      const b = CORE_BENCH[i];
      const pct = Math.min(99, Math.round(ncdf((avg - b.mean) / b.sd) * 100));
      const quotes = revs.map((x) => ({ q: x.c.notes && x.c.notes[i], r: x.r })).filter((q) => q.q);
      return { d, i, avg, bench: b.mean, delta: avg - b.mean, top: Math.max(1, 100 - pct), quotes, chips: revs.map((x) => ({ r: x.r, s: x.c.scores[i] })) };
    });
    const comp = mean(dims.map((x) => x.avg));
    const bench = mean(CORE_BENCH.map((b) => b.mean));
    return { dims, comp, bench, compPct: Math.min(99, Math.round(ncdf((comp - bench) / 0.38) * 100)), n: revs.length };
  }
  function secCore(c) {
    const op = c.op;
    const st = coreStats(c);
    const X = (v) => (((v - 1) / 4) * 100).toFixed(1) + '%';
    return sec(c, 'core', 'CORE · Client ratings', `How clients rate working with ${esc(op.first)}`, `
      <div class="pf-core">
        <div class="pf-core-panel">
          <span class="eyebrow pf-core-k">CORE score</span>
          <p class="pf-core-big serif-up">${st.comp.toFixed(1)}<small>/5</small></p>
          <p class="pf-core-vs"><b>${st.comp >= st.bench ? '+' : ''}${(st.comp - st.bench).toFixed(1)}</b> vs platform average ${st.bench.toFixed(1)}</p>
          <p class="pf-core-vs">Higher than <b>${st.compPct}%</b> of operators</p>
          <dl class="pf-core-defs">${F.coreDims.options.map((d) => `<div><dt>${esc(d.v)}</dt><dd><b>${esc(d.l)}.</b> ${esc(d.d)}</dd></div>`).join('')}</dl>
          <p class="pf-core-foot">From ${plural(st.n, 'client rating')}. Each client scores four behaviours from 1 to 5 and can add a note to each score.</p>
        </div>
        <div class="pf-core-rows">
          <div class="legend pf-core-legend"><span><i class="pf-lg-you"></i>${esc(op.first)}</span><span><i class="pf-lg-bench"></i>Platform average</span></div>
          ${st.dims.map((x) => {
            const qi = (S.coreIdx[x.i] != null ? S.coreIdx[x.i] : x.i) % Math.max(1, x.quotes.length);
            return `<div class="pf-core-row" data-dim="${x.i}">
              <div class="pf-core-top"><span class="pf-core-l">${esc(x.d.v)}</span><b class="pf-core-name">${esc(x.d.l)}</b><span class="pf-core-avg serif-up">${x.avg.toFixed(1)}</span>
                <span class="pf-delta ${x.delta >= 0 ? 'up' : 'down'}">${x.delta >= 0 ? '+' : ''}${x.delta.toFixed(1)} vs avg</span><span class="pf-core-topn">Top ${x.top}%</span></div>
              <div class="pf-core-track" role="img" aria-label="${esc(x.d.l)}: ${x.avg.toFixed(1)} out of 5, platform average ${x.bench.toFixed(1)}">
                <i class="pf-core-fill" style="width:${X(x.avg)}"></i><i class="pf-core-bench" style="left:${X(x.bench)}"><span>${x.bench.toFixed(1)}</span></i><i class="pf-core-you" style="left:${X(x.avg)}"></i></div>
              <div class="pf-core-scale" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => `<span>${n}</span>`).join('')}</div>
              <div class="pf-core-ev">
                <div class="pf-core-chips">${x.chips.slice(0, 4).map((ch) => { const e = c.engs.find((y) => lc(y.company) === lc(ch.r.company)); return `<span class="pf-core-chip" title="${esc(ch.r.reviewer)}, ${esc(ch.r.company)}">${e && e.logo ? logoHtml(e.logo, ch.r.company, 13) : `<em>${esc(RN.fmt.initials(ch.r.company || ch.r.reviewer))}</em>`}<b>${ch.s.toFixed(1)}</b></span>`; }).join('')}${x.chips.length > 4 ? `<span class="pf-core-chip">+${x.chips.length - 4}</span>` : ''}</div>
                ${x.quotes.length ? `<figure class="pf-core-q" data-pf-q="${x.i}">${coreQuote(x.quotes[qi])}</figure>
                  ${x.quotes.length > 1 ? `<div class="pf-pager"><button type="button" data-act="pf-core-q" data-dim="${x.i}" data-dir="-1" aria-label="Previous quote">${icon('chev-left')}</button><span data-pf-qn="${x.i}">${qi + 1} / ${x.quotes.length}</span><button type="button" data-act="pf-core-q" data-dim="${x.i}" data-dir="1" aria-label="Next quote">${icon('chev-right')}</button></div>` : ''}` : ''}
              </div>
            </div>`;
          }).join('')}
          <p class="pf-note">${RN.ui.illus()} Platform averages and percentiles are invented to show the comparison.</p>
        </div>
      </div>`);
  }
  function coreQuote(q) {
    if (!q) return '';
    return `<blockquote>“${esc(q.q)}”</blockquote><figcaption>${esc(q.r.reviewer)}${q.r.company ? ', ' + esc(q.r.company) : ''}</figcaption>`;
  }
  function stepCore(dim, dir) {
    const c = S.ctx;
    if (!c) return;
    const st = coreStats(c);
    const x = st.dims[dim];
    if (!x || x.quotes.length < 2) return;
    const cur = S.coreIdx[dim] != null ? S.coreIdx[dim] : dim;
    const n = (((cur + dir) % x.quotes.length) + x.quotes.length) % x.quotes.length;
    S.coreIdx[dim] = n;
    const fig = document.querySelector(`[data-pf-q="${dim}"]`);
    const num = document.querySelector(`[data-pf-qn="${dim}"]`);
    if (fig) { fig.innerHTML = coreQuote(x.quotes[n]); fig.classList.remove('pf-fade'); void fig.offsetWidth; fig.classList.add('pf-fade'); }
    if (num) num.textContent = `${n + 1} / ${x.quotes.length}`;
  }

  /* ---------- Right rail ---------- */
  function engageCard(c) {
    const op = c.op, v = c.v, st = RN.store.state;
    const start = nextStart(op);
    const saved = st.shortlist.includes(op.id);
    const inCompare = st.compare.includes(op.id);
    const intro = myIntro(op);
    const rev = !v.preview && reviewIntro(op);
    const types = ordered('engagementTypes', op.engagementTypes);
    const cap = +op.newClientCapacity || 0;
    const rate = !op.rate ? '' : v.rate
      ? `<div><dt>${esc(F.rate.label)}</dt><dd class="num">${esc(RN.fmt.usd(op.rate))} <span class="muted pf-dd-u">/ hr</span></dd></div>
        <div><dt>All-in through Revenue Nomad</dt><dd class="num">${esc(RN.fmt.usd(allIn(op.rate)))} <span class="muted pf-dd-u">/ hr</span></dd></div>`
      : `<div><dt>${esc(F.rate.label)}</dt><dd><button type="button" class="pf-lockpill" data-act="login">${icon('lock')}Log in to see rate</button></dd></div>`;
    return `<section class="pf-card pf-engage" aria-label="Engage ${esc(op.first)}">
      <span class="eyebrow">Engage ${esc(op.first)}</span>
      <p class="pf-engage-st"><i class="dot ${availDot(op)}"></i>${esc(op.avail.label)}</p>
      <dl class="pf-facts">
        <div><dt>${esc(F.startDate.label)}</dt><dd>${esc(mdy(start))}</dd></div>
        ${op.avail.hoursCode ? `<div><dt>${esc(F.hoursPerMonth.label)}</dt><dd>${esc(RN.w.label('hoursPerMonth', op.avail.hoursCode))}</dd></div>` : ''}
        ${types.length ? `<div><dt>${esc(F.engagementTypes.label)}</dt><dd>${esc(RN.w.labels('engagementTypes', types))}</dd></div>` : ''}
        ${cap ? `<div><dt>${esc(F.newClientCapacity.label)}</dt><dd>${esc(plural(cap, 'client'))}</dd></div>` : ''}
        ${op.timezone ? `<div><dt>Time zone</dt><dd>${esc(tzLabel(op.timezone))}</dd></div>` : ''}
        ${op.usHours && F.usHours ? `<div><dt>${esc(F.usHours.label)}</dt><dd>${esc(RN.w.label('usHours', op.usHours))}</dd></div>` : ''}
        ${rate}
      </dl>
      <div class="pf-engage-act">
      ${v.owner ? `<a class="btn btn-block" href="#studio.profile">${icon('edit')}Update availability and rate</a>
          <p class="pf-fine">Clients see this card with a Request intro button. Your rate is hidden from logged-out visitors.</p>`
      : intro ? `<div class="pf-intro-st"><span>Your intro request</span>${RN.ui.statusPill('intro', intro.status)}</div>
          ${rev ? `<button type="button" class="btn btn-block" data-act="bw-review-start" data-id="${esc(intro.id)}">${icon('star')}Leave a review</button>` : `<a class="btn btn-block btn-line" href="#buyer.intros">Track in workspace${icon('arrow')}</a>`}`
      : `<button type="button" class="btn btn-block" data-act="${v.preview ? 'pf-preview-cta' : 'intro-open'}" data-id="${esc(op.id)}">Request intro</button>`}
      ${v.owner ? '' : `<div class="pf-engage-2">
        <button type="button" class="btn btn-line btn-sm ${inCompare ? 'is-on' : ''}" data-act="${v.preview ? 'pf-preview-cta' : 'compare-toggle'}" data-id="${esc(op.id)}" aria-pressed="${inCompare}">${icon(inCompare ? 'check' : 'compare')}${inCompare ? 'Added to compare' : 'Add to compare'}</button>
        <button type="button" class="btn btn-line btn-sm ${saved ? 'is-on' : ''}" data-act="${v.preview ? 'pf-preview-cta' : 'shortlist-toggle'}" data-id="${esc(op.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved ? 'Saved' : 'Save'}</button>
      </div>
      <a class="pf-talklink" href="#talk">Not sure ${esc(op.first)} is the one? <b>Talk to our team</b></a>
      <p class="pf-fine">Scheduling, messaging and contracting run through Revenue Nomad. ${v.rate ? 'All-in rates include the 25% Revenue Nomad fee, shown before anything is signed. ' : ''}Intro requests have a 72-hour response window.</p>`}
      </div>
    </section>`;
  }
  function matchCard(c) {
    const op = c.op, v = c.v;
    if (v.owner) {
      return `<section class="pf-card pf-match"><span class="eyebrow">Match signals</span>
        <p class="pf-match-own">Signed-in clients see how you fit their company on five signals: company revenue, employee range, GTM motion, industry and focus areas. They come from the same fields as your profile.</p>
        <button type="button" class="act" data-act="pf-viewas" data-v="client">${icon('eye')}Preview as a client</button></section>`;
    }
    if (!v.client) {
      return `<section class="pf-card pf-match"><span class="eyebrow">Match signals</span>
        <div class="pf-lock">${icon('lock')}<b>See how ${esc(op.first)} fits your company</b><p>Sign in as a client and we score every profile against your company’s needs.</p>
        ${v.persona === 'operator' ? `<p class="tiny faint">You are signed in as an operator.</p>` : ''}
        <button type="button" class="btn btn-block" data-act="persona" data-p="buyer">Log in as client</button></div></section>`;
    }
    const co = RN.personas.buyer.company;
    // Company firmographics plus the match preferences saved in the client workspace (#buyer.company)
    const base = RN.clientBrief ? RN.clientBrief() : { revenueRange: co.revenueRange, employeeRange: co.employeeRange, industries: [co.industry] };
    const fit = RN.model.fit(op, Object.assign({}, base, { roleCategory: base.roleCategory || op.catKey }));
    const ic = { match: icon('check'), partial: '<span class="pf-half"></span>', low: icon('minus') };
    if (!fit.signals.length) {
      return `<section class="pf-card pf-match"><div class="row between"><span class="eyebrow">Match signals</span>${v.preview ? '' : `<a class="pill pill-line" href="#buyer.company">${icon('edit')}Edit preferences</a>`}</div>
        <p class="pf-match-own">${esc(op.first)} has not added company revenue, employee range, industry or GTM motion yet, so we can’t score the fit for ${esc(co.name)}. Ask about it when you request an intro.</p></section>`;
    }
    return `<section class="pf-card pf-match">
      <div class="row between"><span class="eyebrow">Match signals</span>${v.preview ? '' : `<a class="pill pill-line" href="#buyer.company">${icon('edit')}Edit preferences</a>`}</div>
      <div class="pf-match-hd"><div class="pf-ring sm">${RN.chart.ring(fit.pct, { size: 64, stroke: 6, label: fit.pct + ' match' })}<b>${fit.pct}</b></div>
        <div><b class="pf-match-l">${esc(fit.label)}</b><span>for ${esc(co.name)} · ${fit.count} of ${fit.signals.length} signals</span></div></div>
      <ul class="pf-sigs">${fit.signals.map((s) => `<li class="is-${s.state}"><span class="pf-sig-i">${ic[s.state]}</span><span><b>${esc(s.l)}</b><span>${esc(s.text)}</span></span></li>`).join('')}</ul>
      ${fit.notes.length ? `<p class="pf-fine">${esc(fit.notes.join('. '))}.</p>` : ''}
      <p class="pf-fine">${v.preview ? 'Scored against a sample client company profile.' : 'Scored against your company profile. Your preferences follow you to every profile.'}</p>
    </section>`;
  }
  function risCard(c) {
    const op = c.op;
    const tier = F.risTierFor(op.ris.score);
    const ladder = F.risTier.options.slice().reverse();
    const gold = tier.v === 'elite' || tier.v === 'apex';
    return `<section class="pf-card pf-ris">
      <span class="eyebrow">Reputation Index</span>
      <div class="pf-ris-hd"><span class="pf-ris-seal t-${esc(tier.v)}">${RN.ui.hexSeal(tier.l)}<b>${esc(op.ris.score)}</b></span><div><b class="pf-ris-tier ${gold ? 'gold' : ''}">${esc(tier.l)}</b><span>Reputation Index ${esc(op.ris.score)} of 100</span></div></div>
      <p class="pf-ris-d">${esc(tier.d)}</p>
      <ol class="pf-ladder" aria-label="Reputation Index tiers">${ladder.map((t) => `<li class="${t.v === tier.v ? 'on' : ''}" ${t.v === tier.v ? 'aria-current="true"' : ''} title="${esc(t.l)}: ${esc(t.d)}"><span class="pf-ladder-seal">${RN.ui.hexSeal(t.l)}</span><b>${esc(t.l)}</b><span>${t.v === 'indexing' ? '<50' : `${t.min}–${t.max}`}</span></li>`).join('')}</ol>
      <details class="pf-ris-how"><summary>${icon('chev-right')}How score is calculated</summary><div class="pf-ris-exp">${RN.ui.risExplainer()}</div><a class="act" href="#levels">See every tier and what it unlocks${icon('arrow')}</a></details>
    </section>`;
  }
  function talkCard(c) {
    return `<section class="pf-card pf-talk night">
      <span class="eyebrow pf-talk-k">Revenue Nomad team</span>
      <h3 class="h4">Rather have us find the right operator?</h3>
      <p>Share what you need and we’ll shortlist vetted operators and set up the intros.</p>
      <a class="btn btn-leaf btn-block" href="#talk">Talk to us</a>
      <a class="pf-talk-phone" href="tel:+12032000482">${icon('message')}+1 203-200-0482</a>
    </section>`;
  }
  function similar(c) {
    const op = c.op;
    const sims = RN.model.similar(op, 3);
    if (!sims.length) return '';
    return `<section class="wrap pf-similar" aria-labelledby="pf-sim-h">
      <div class="pf-sec-hd"><div class="grow"><span class="eyebrow">Keep looking</span><h2 class="h2 pf-h2" id="pf-sim-h">Operators like ${esc(op.first)}</h2><p class="pf-sec-sub">Same role category and overlapping focus areas. Add two to compare them side by side.</p></div>
        <a class="btn btn-line btn-sm" href="#browse.${esc(op.catKey)}">Browse ${esc(catLabel(op.catKey))}${icon('arrow')}</a></div>
      <div class="grid g-3">${sims.map((o) => RN.ui.opCard(o, { why: sharedWhy(op, o) })).join('')}</div>
    </section>`;
  }
  function sharedWhy(op, o) {
    const shared = o.tags.filter((t) => op.tags.some((x) => lc(x.t) === lc(t.t)));
    if (shared.length) return `Shares ${plural(shared.length, 'focus area')} with ${op.first}`;
    const ind = o.industries.find((i) => op.industries.includes(i));
    return ind ? `Also works in ${RN.w.label('industries', ind)}` : `Fractional ${o.role}`;
  }
  function notFound(slug) {
    return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'search', title: 'We couldn’t find that operator', body: 'The profile may have moved or been hidden. Browse open profiles or tell us what you need.', cta: '<div class="row pf-center"><a class="btn btn-sm" href="#browse">Browse talent</a><a class="btn btn-line btn-sm" href="#talk">Talk to us</a></div>' })}</section>`;
  }

  /* ---------- Mount: tracking, observers, rotation ---------- */
  function mountProfile(root, p) {
    const op = RN.model.bySlug(p.slug);
    if (!op || !root) return;
    cleanup(false);
    const v = viewer(op);
    if (!S.tracked) {
      S.tracked = true;
      const src = RN.store.state._viewSource || 'direct';
      const q = RN.store.state._viewQ; // the search that led here (set by Browse), so Studio can count views per term
      delete RN.store.state._viewSource;
      delete RN.store.state._viewQ;
      if (!v.own) RN.track('profile_view', Object.assign({ opId: op.id, source: src }, q ? { q } : {}));
    }
    if (!S.unsub) {
      S.unsub = RN.store.on((key) => {
        if (key !== 'intros') return;
        setTimeout(() => { const cur = RN.currentRoute(); if (cur && cur.view.name === 'profile') RN.rerender(); }, 0);
      });
    }
    wireCommon(root);
    // Sticky sub-nav: show the mini CTA once the hero buttons scroll away; highlight the section in view
    const nav = root.querySelector('.pf-subnav');
    const cta = root.querySelector('[data-pf-cta]');
    if (nav && cta) {
      let ticking = false;
      S.scrollFn = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          if (!nav.isConnected) return;
          const r = nav.getBoundingClientRect();
          const stuck = r.top <= (parseFloat(getComputedStyle(nav).top) || 0) + 1;
          nav.classList.toggle('show-cta', stuck && cta.getBoundingClientRect().bottom < r.top);
        });
      };
      S.scrollFn();
    }
    if (nav && cta && 'IntersectionObserver' in window) {
      const links = RN.$$('[data-nav]', nav);
      const o2 = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (!en.isIntersecting) return;
          const k = en.target.dataset.sec;
          links.forEach((l) => { const on = l.dataset.nav === k; l.classList.toggle('on', on); if (on && l.scrollIntoView && nav.scrollWidth > nav.clientWidth) { const box = l.parentElement; box.scrollTo({ left: l.offsetLeft - 16, behavior: 'smooth' }); } });
        });
      }, { rootMargin: '-35% 0px -60% 0px' });
      RN.$$('.pf-sec', root).forEach((s) => o2.observe(s));
      S.obs.push(o2);
    }
    // Phone action bar: hidden while the hero or Engage buttons are on screen
    const bar = root.querySelector('[data-pf-mbar]');
    const targets = [cta, root.querySelector('.pf-engage-act')].filter(Boolean);
    if (bar && targets.length && 'IntersectionObserver' in window) {
      const seen = new Set();
      const o3 = new IntersectionObserver((ents) => {
        ents.forEach((en) => { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
        bar.classList.toggle('is-away', seen.size > 0);
        bar.toggleAttribute('inert', seen.size > 0);
      });
      targets.forEach((t) => o3.observe(t));
      S.obs.push(o3);
    }
    // Intro video: read the real duration
    if (op.video && !DUR[op.video]) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.muted = true;
      vid.onloadedmetadata = () => {
        if (!isFinite(vid.duration)) return;
        const s = Math.round(vid.duration);
        DUR[op.video] = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        const el = document.querySelector('[data-pf-dur] span');
        if (el) el.textContent = DUR[op.video];
        vid.removeAttribute('src');
      };
      vid.src = op.video;
    }
    applyStackFilter(root);
    startCoreRotation(root);
    S.railFit = () => fitRail(root);
    fitRail(root);
    setTimeout(() => fitRail(root), 400);
  }
  /* Sticky rail: sticks under the sub-nav when it fits; when it is taller than the screen it scrolls
     with the page until its last card is in view, then sticks (no inner scrollbar, nothing clipped). */
  function fitRail(root) {
    const rail = root && root.querySelector('.pf-rail');
    if (!rail || !rail.isConnected) return;
    if (getComputedStyle(rail).display === 'contents') { rail.style.top = ''; return; }
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 76;
    const top = navH + 57;
    rail.style.top = Math.min(top, window.innerHeight - rail.offsetHeight - 12) + 'px';
  }
  window.addEventListener('resize', () => { if (S.railFit) S.railFit(); }, { passive: true });
  window.addEventListener('scroll', () => { if (S.scrollFn) S.scrollFn(); }, { passive: true });
  function wireCommon(root) {
    // Keyboard support for SVG buttons (bowtie segments)
    if (!root.dataset.pfKeys) {
      root.dataset.pfKeys = '1';
      root.addEventListener('keydown', (e) => {
        const g = e.target.closest && e.target.closest('g[data-act]');
        if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const fn = RN.actions[g.dataset.act]; if (fn) fn(g, e); }
      });
      root.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.pf-core-rows')) S.coreHover = true; });
      root.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.pf-core-rows') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.pf-core-rows'))) S.coreHover = false; });
    }
  }
  function startCoreRotation(root) {
    clearInterval(S.timer);
    if (!root.querySelector('[data-pf-q]') || reduced()) return;
    S.timer = setInterval(() => {
      if (document.hidden || S.coreHover || document.querySelector('.scrim')) return;
      RN.$$('[data-pf-qn]').forEach((el) => stepCore(+el.dataset.pfQn, 1));
    }, 6500);
  }

  /* ---------- Actions ---------- */
  function refreshSection(key) {
    const c = S.ctx;
    if (!c) return;
    c.v = viewer(c.op);
    const el = document.getElementById('pf-' + key);
    if (!el) return;
    const html = { expertise: secExpertise, portfolio: secPortfolio, stack: secStack }[key](c);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
  }
  RN.actions['pf-jump'] = (el) => {
    const t = document.getElementById(el.dataset.to);
    if (!t) return;
    t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    t.classList.remove('pf-flash'); void t.offsetWidth; t.classList.add('pf-flash');
  };
  RN.actions['pf-focus'] = (el) => {
    const k = { kind: el.dataset.kind, key: el.dataset.key };
    S.focus = S.focus && S.focus.kind === k.kind && S.focus.key === k.key ? null : k;
    refreshSection('expertise');
  };
  RN.actions['pf-focus-clear'] = () => { S.focus = null; refreshSection('expertise'); };
  RN.actions['pf-tags-all'] = () => { S.tagsAll = !S.tagsAll; refreshSection('expertise'); if (!S.tagsAll) { const t = document.querySelector('.pf-taglist'); if (t) t.scrollIntoView({ block: 'nearest' }); } };
  RN.actions['pf-pf-filter'] = (el) => { S.pf = el.dataset.v; refreshSection('portfolio'); };
  RN.inputs['pf-stack-q'] = (el) => { S.stackQ = el.value; applyStackFilter(document.getElementById('main')); };
  RN.actions['pf-eng'] = (el) => {
    const k = el.dataset.k;
    const art = el.closest('.pf-eng');
    const open = !art.classList.contains('open');
    S.engOpen = S.engOpen || {};
    S.engOpen[k] = open;
    art.classList.toggle('open', open);
    el.setAttribute('aria-expanded', open);
    const bd = art.querySelector('.pf-eng-bd');
    if (bd) bd.hidden = !open;
  };
  RN.actions['pf-offer'] = (el) => {
    const b = offersFor(RN.model.byId(el.dataset.id) || {}).find((x) => x.id === el.dataset.bp);
    if (!b) return;
    RN.intro.open(el.dataset.id, { engagementType: b.engagementType || 'fractional', note: `Interested in your ${b.title} engagement.` });
  };
  RN.actions['pf-sample'] = (el) => openSample(el.dataset.id);
  RN.actions['pf-sample-request'] = (el) => { RN.ui.closeModal(); RN.intro.open(el.dataset.id); };
  RN.actions['pf-review'] = (el) => openReview(+el.dataset.i);
  RN.actions['pf-core-q'] = (el) => stepCore(+el.dataset.dim, +el.dataset.dir);
  RN.actions['pf-viewas'] = (el) => {
    S.viewAs = el.dataset.v;
    RN.rerender();
    RN.ui.toast(S.viewAs === 'owner' ? 'Back to your view' : S.viewAs === 'client' ? 'Previewing as a signed-in client' : 'Previewing as a logged-out visitor', { icon: 'eye' });
  };
  RN.actions['pf-preview-cta'] = () => RN.ui.toast('Preview only. Clients use this button on your live profile.', { icon: 'eye' });
  RN.actions['pf-video-play'] = (el) => {
    const c = S.ctx;
    const box = el.closest('[data-pf-video]');
    if (!c || !box) return;
    box.classList.add('playing');
    box.innerHTML = `<video src="${esc(c.op.video)}" controls autoplay playsinline aria-label="Intro video from ${esc(c.op.name)}"></video>`;
  };
  RN.actions['pf-share'] = () => {
    const c = S.ctx;
    if (!c) return;
    const url = `https://www.revenuenomad.com/operators/${(c.op.raw && c.op.raw.slug) || c.op.slug}`;
    copyText(url).then((ok) => RN.ui.toast(ok ? 'Profile link copied' : `Copy this link: ${esc(url)}`, { icon: 'link', ms: ok ? 3200 : 6000 }));
  };
  function copyText(text) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) { return false; }
    };
    try {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    } catch (e) { /* fall through */ }
    return Promise.resolve(fallback());
  }

  RN.view('profile', {
    route: 'op.:slug', nav: 'browse', chrome: 'over',
    samples: { slug: 'matt-lopez', extra: ['op.anne-zavorskas', 'op.mike-hanauer'] },
    title: (p) => { const op = RN.model.bySlug(p.slug); return op ? `${op.name}, Fractional ${op.role}` : 'Operator not found'; },
    render: renderProfile,
    mount: mountProfile,
    unmount: () => { cleanup(true); S = fresh(); },
  });

  /* ================================================================================================
     Proof link (#proof.<id>): a private, focused profile for one named prospect (direct deals)
     ================================================================================================ */
  const proofRec = (id) => (RN.store.state.proofLinks || []).find((x) => x.id === id) || null;
  const isOwnOp = (op) => RN.store.state.persona === 'operator' && !!op && RN.personas.operator.opId === op.id;
  function prospectOf(rec) {
    const [contact, title] = String((rec.prospect || {}).contact || '').split(',').map((x) => x.trim());
    return { contact: contact || '', title: title || '', company: (rec.prospect || {}).company || '' };
  }
  function renderProof(p) {
    const rec = proofRec(p.id);
    const op = rec && RN.model.byId(rec.opId);
    if (!rec || !op) {
      return `<section class="wrap-narrow section pf-expired">
        <div class="pf-expired-card">
          <span class="pf-expired-i">${icon('link')}</span>
          <span class="eyebrow">Private proof link</span>
          <h1 class="h2">This link has expired</h1>
          <p class="lede">Proof links are private and the operator can turn them off at any time. Every profile on Revenue Nomad is also open to browse, with client reviews and verified engagements.</p>
          <div class="row pf-center"><a class="btn" href="#browse">Browse talent</a><a class="btn btn-line" href="#talk">Talk to us</a></div>
        </div>
      </section>`;
    }
    RN.model.applyEdits();
    visit('proof:' + rec.id);
    const c = build(op);
    c.v = Object.assign({}, c.v, { owner: false, preview: false, client: true, rate: true, proof: true, proofId: rec.id });
    S.ctx = c;
    const who = prospectOf(rec);
    const tier = F.risTierFor(op.ris.score);
    const own = isOwnOp(op);
    const shown = [];
    const secs = (rec.sections || []).map((k) => {
      let html = '';
      if (k === 'reviews') html = secReviews(c);
      if (k === 'core') html = c.coreRevs.length ? secCore(c) : '';
      if (k === 'engagements') html = secEngagements(c);
      if (k === 'samples') html = c.samples.length ? secPortfolio(c) : '';
      if (k === 'rate') html = secRate(c);
      if (html) shown.push(k);
      return html;
    }).filter(Boolean);
    return `<div class="pf pf-proofpage">
      <div class="wrap pf-pl-top">
        <div class="pf-pl-banner">
          <span class="pf-pl-k">${icon('shield')}Private proof link</span>
          <p class="h2 serif-up pf-pl-for">Prepared for ${esc(who.contact || 'you')}${who.company ? `, ${esc(who.company)}` : ''}</p>
          <p class="pf-pl-notice">${icon('eye')}<span><b>${esc(op.first)} sees when this page is opened, which sections are read and for how long,</b> and whether someone new at your company opens it. Nothing else is shared, and nothing else you browse is tracked.</span></p>
        </div>
        ${own ? `<p class="note info pf-pl-own">${icon('info')}<span>You are previewing your proof link the way ${esc(who.contact || 'the prospect')} sees it. Your own visits are not counted as views in <a class="link" href="#studio.credibility">Studio, Credibility</a>.</span></p>` : ''}
        <section class="pf-pl-id night">
          <div class="pf-band-bg" aria-hidden="true">${hexLattice()}</div>
          <div class="pf-pl-id-in">
            <div class="pf-photo sm">${op.photo ? `<img src="${esc(op.photo)}" alt="${esc(op.name)}">` : `<span class="pf-initials">${esc(op.initials)}</span>`}<span class="pf-photo-seal">${RN.ui.hexSeal(tier.l)}</span></div>
            <div class="grow">
              <div class="pf-pills"><span class="pf-pill pf-pill-tier"><span class="pf-pill-hex">${RN.ui.hexSeal(tier.l)}</span>${esc(tier.l)} · ${esc(op.ris.score)}</span><span class="pf-pill"><i class="dot ${availDot(op)}"></i>${esc(op.avail.label)}</span></div>
              <h1 class="h1 pf-name serif-up">${esc(op.name)}</h1>
              <p class="pf-role">Fractional ${esc(op.role)}</p>
              ${founderLine(op)}
              ${op.headline ? `<p class="pf-headline hl-m">${esc(smart(op.headline))}</p>` : ''}
            </div>
            <div class="pf-pl-cta" data-pl-slot="top">${proofCtas(rec, op, 'top', true)}</div>
          </div>
          <div class="pf-pl-stats">
            <span><b class="serif-up">${esc(op.ris.score)}</b>Reputation Index</span>
            <span><b class="serif-up">${c.reviews.length}</b>${c.reviews.length === 1 ? 'Client review' : 'Client reviews'}</span>
            <span><b class="serif-up">${c.engs.filter((e) => e.verified).length}</b>Verified engagements</span>
            <span><b class="serif-up">${c.verified.length}</b>Verified focus areas</span>
          </div>
        </section>
        <nav class="pf-pl-toc" aria-label="Sections in this link"><span class="label">In this link</span>${shown.map((k) => `<button type="button" class="chip chip-sm" data-act="pf-jump" data-to="pf-${k === 'samples' ? 'portfolio' : k}">${esc(PROOF_SECTIONS[k])}</button>`).join('')}</nav>
      </div>
      <div class="wrap pf-pl-body">${secs.join('')}
        <section class="pf-pl-end" id="pf-pl-end">
          <div><span class="eyebrow">Next step</span><h2 class="h2 pf-h2">Talk to ${esc(op.first)} this week</h2><p class="pf-sec-sub">A 30-minute call to walk through your goals. ${esc(op.first)} replies by email with times.</p></div>
          <div class="pf-pl-cta" data-pl-slot="end">${proofCtas(rec, op, 'end', false)}</div>
        </section>
        <p class="pf-pl-foot">${icon('shield')}<span>Shared through Revenue Nomad. Reviews and engagements marked verified were confirmed by the client. <a class="link" href="#op.${esc(op.slug)}" data-view-source="proof">View ${esc(op.first)}’s public profile</a> · Hiring for other GTM roles? <a class="link" href="#rates">See typical rates by role</a></span></p>
      </div>
    </div>`;
  }
  /* Book a call / Request a reference: one tap opens a short inline form (work email), then shows what happens next */
  function proofCtas(rec, op, slot, dark) {
    const reqs = rec.requests || [];
    const done = (t) => reqs.find((r) => r.type === t);
    const called = done('call'), refd = done('reference');
    const f = S.plForm;
    if (f && f.slot === slot && !done(f.type)) return proofForm(rec, op, f.type);
    const sentNote = (r) => (r && r.email ? `<p class="pf-pl-sent">${icon('check-circle')}<span>${r.type === 'call' ? `Call requested from <b>${esc(r.email)}</b>. ${esc(op.first)} will email you times.` : `Reference requested from <b>${esc(r.email)}</b>. ${esc(op.first)} will introduce you to a past client.`}</span></p>` : '');
    return `<button type="button" class="btn ${called ? 'btn-line' : dark ? 'btn-leaf' : ''}" data-act="pf-proof-call" data-id="${esc(rec.id)}" data-slot="${slot}" ${called ? 'aria-disabled="true"' : ''}>${icon(called ? 'check' : 'calendar')}${called ? 'Call requested' : `Book a call with ${esc(op.first)}`}</button>
      <button type="button" class="btn btn-line" data-act="pf-proof-ref" data-id="${esc(rec.id)}" data-slot="${slot}" ${refd ? 'aria-disabled="true"' : ''}>${icon(refd ? 'check' : 'users')}${refd ? 'Reference requested' : 'Request a reference'}</button>
      ${slot === 'end' ? sentNote(called) + sentNote(refd) : ''}`;
  }
  function proofForm(rec, op, type) {
    const who = prospectOf(rec);
    const last = (rec.requests || []).find((r) => r.email) || {};
    return `<form class="pf-pl-form" data-submit="pf-proof-send" data-id="${esc(rec.id)}" data-type="${type}" aria-label="${type === 'call' ? 'Book a call' : 'Request a reference'}">
      <b class="h5">${type === 'call' ? `Book a call with ${esc(op.first)}` : `Talk to one of ${esc(op.first)}’s past clients`}</b>
      <p class="small muted">${type === 'call' ? `${esc(op.first)} replies with times.` : `${esc(op.first)} asks a past client to reply to you.`} We use your email for this request only.</p>
      ${RN.w.field('email', last.email || '', { name: 'email', compact: true, id: 'pf-pl-email-' + type })}
      <div class="grid g-2 pf-pl-form-row">
        ${RN.w.field('fullName', last.name || who.contact, { name: 'name', compact: true, label: 'Name', id: 'pf-pl-name-' + type })}
        <div class="field"><label for="pf-pl-co-${type}">Company</label><input class="input" id="pf-pl-co-${type}" name="company" autocomplete="organization" value="${esc(last.company || who.company)}"></div>
      </div>
      <div class="row pf-pl-form-act"><button type="submit" class="btn btn-sm">${type === 'call' ? 'Send request' : 'Request reference'}</button><button type="button" class="btn btn-ghost btn-sm" data-act="pf-proof-cancel">Cancel</button></div>
    </form>`;
  }
  function secRate(c) {
    const op = c.op;
    const idx = RN.data.market.rateIndex.byCat[op.catKey];
    const hrs = RN.model.hoursNum ? RN.model.hoursNum(op.avail.hoursCode) : +op.avail.hoursCode || 0;
    const monthly = op.rate && hrs ? op.rate * hrs : 0;
    const lo = op.rate ? op.rate * 20 : 0, hi = op.rate ? op.rate * 60 : 0;
    return `<section class="pf-sec" id="pf-rate" data-sec="rate" aria-labelledby="pf-rate-h">
      <header class="pf-sec-hd"><div class="grow"><span class="eyebrow">Rate and availability</span><h2 class="h2 pf-h2" id="pf-rate-h">What working with ${esc(op.first)} costs</h2></div></header>
      <div class="pf-rate">
        <div class="pf-rate-main">
          ${op.rate ? `<div class="pf-rate-big"><span class="label pf-lab">${esc(F.rate.label)}</span><b class="serif-up">${esc(RN.fmt.usd(op.rate))}<small>/ hr</small></b></div>
            ${monthly ? `<div class="pf-rate-big"><span class="label pf-lab">At ${esc(RN.w.label('hoursPerMonth', op.avail.hoursCode))}</span><b class="serif-up">${esc(RN.fmt.usd(monthly))}<small>/ mo</small></b></div>` : ''}
            <p class="pf-rate-range">Typical engagement range: <b>${esc(RN.fmt.usd(lo))} - ${esc(RN.fmt.usd(hi))}/mo</b> (20 to 60 hrs / month). These are ${esc(op.first)}’s own rates.</p>`
          : `<p class="pf-rate-range">${esc(op.first)} quotes a rate on the first call.</p>`}
        </div>
        <dl class="pf-facts">
          <div><dt>${esc(F.availability.label)}</dt><dd>${esc(op.avail.label)}</dd></div>
          <div><dt>${esc(F.startDate.label)}</dt><dd>${esc(mdy(nextStart(op)))}</dd></div>
          ${op.avail.hoursCode ? `<div><dt>${esc(F.hoursPerMonth.label)}</dt><dd>${esc(RN.w.label('hoursPerMonth', op.avail.hoursCode))}</dd></div>` : ''}
          ${idx ? `<div><dt>Rate Index, ${esc(catLabel(op.catKey))}</dt><dd>${esc(RN.fmt.usd(idx.p25))}–${esc(RN.fmt.usd(idx.p75))}/hr · median ${esc(RN.fmt.usd(idx.p50))}</dd></div>` : ''}
        </dl>
      </div>
      ${idx ? `<p class="pf-note">${RN.ui.illus()} Rate Index figures are invented to show the benchmark. <a class="link" href="#rates">See the Rate Index</a></p>` : ''}
    </section>`;
  }
  function mountProof(root, p) {
    const rec = proofRec(p.id);
    if (!rec || !root) return;
    cleanup(false);
    wireCommon(root);
    if (!S.tracked) {
      S.tracked = true;
      const op = RN.model.byId(rec.opId);
      // The operator previewing their own link is not a prospect: no view, no event
      if (!isOwnOp(op)) {
        const seconds = 60 + Math.floor(Math.random() * 341);
        RN.store.update((s) => {
          const r = s.proofLinks.find((x) => x.id === rec.id);
          if (r) { r.views = r.views || []; r.views.push({ ts: RN.now().toISOString(), seconds, sections: (r.sections || []).slice() }); }
        }, 'proofLinks');
        RN.track('proof_view', { opId: rec.opId, meta: { proofId: rec.id, company: rec.prospect && rec.prospect.company } });
        RN.track('profile_view', { opId: rec.opId, source: 'proof' });
      }
      delete RN.store.state._viewSource;
    }
    startCoreRotation(root);
  }
  // Re-render one CTA slot in place (keeps the reader's scroll position and focus)
  function redrawSlot(rec, slot, focusSel) {
    const op = RN.model.byId(rec.opId);
    const box = document.querySelector(`[data-pl-slot="${slot}"]`);
    if (!box || !op) { RN.rerender(); return; }
    box.innerHTML = proofCtas(rec, op, slot, slot === 'top');
    const f = focusSel && box.querySelector(focusSel);
    if (f) f.focus();
  }
  function proofOpen(el, type) {
    const rec = proofRec(el.dataset.id);
    if (!rec) return;
    const op = RN.model.byId(rec.opId);
    if (isOwnOp(op)) { RN.ui.toast('Preview only. Your prospect uses this button to reach you.', { icon: 'eye' }); return; }
    const sent = (rec.requests || []).find((r) => r.type === type);
    if (sent) { RN.ui.toast(type === 'call' ? `Already sent. ${esc(op.first)} will email you times.` : `Already requested. ${esc(op.first)} will introduce you to a past client.`, { icon: 'info' }); return; }
    const prev = S.plForm && S.plForm.slot !== el.dataset.slot ? S.plForm.slot : null;
    S.plForm = { type, slot: el.dataset.slot || 'end' };
    if (prev) redrawSlot(rec, prev);
    redrawSlot(rec, S.plForm.slot, 'input[name="email"]');
  }
  RN.actions['pf-proof-call'] = (el) => proofOpen(el, 'call');
  RN.actions['pf-proof-ref'] = (el) => proofOpen(el, 'reference');
  RN.actions['pf-proof-cancel'] = (el) => {
    const form = el.closest('form');
    const rec = form && proofRec(form.dataset.id);
    const slot = S.plForm && S.plForm.slot;
    S.plForm = null;
    if (rec && slot) redrawSlot(rec, slot, '[data-act="pf-proof-call"]');
  };
  /* A proof-link request is a client lead: an intro record (source 'proof') in the operator's Studio inbox,
     an email to the operator and a confirmation to the prospect */
  RN.submits['pf-proof-send'] = (form, data) => {
    const rec = proofRec(form.dataset.id);
    if (!rec) return;
    const op = RN.model.byId(rec.opId);
    const type = form.dataset.type;
    const email = String(data.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      RN.ui.toast('Add your work email so ' + esc(op.first) + ' can reply.', { icon: 'info' });
      const inp = form.querySelector('input[name="email"]');
      if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); }
      return;
    }
    const who = prospectOf(rec);
    const name = String(data.name || who.contact || '').trim() || email;
    const company = String(data.company || who.company || '').trim() || 'Your company';
    const ask = type === 'call' ? 'book a call' : 'speak with a past client';
    const note = `${name}${who.title ? ` (${who.title})` : ''} at ${company} asked to ${ask} from your proof link.`;
    const ts = RN.now().toISOString();
    let lead = RN.store.state.intros.find((i) => i.source === 'proof' && i.proofId === rec.id && i.buyer && String(i.buyer.email).toLowerCase() === email.toLowerCase());
    RN.store.update((s) => {
      const r = s.proofLinks.find((x) => x.id === rec.id);
      r.requests = (r.requests || []).concat({ type, ts, email, name, company });
      const hit = lead && s.intros.find((i) => i.id === lead.id);
      if (hit) { hit.note = `${hit.note || ''} Also asked to ${ask}.`.trim(); hit.thread = (hit.thread || []).concat({ from: name, text: `Asked to ${ask}.`, ts }); return; }
      lead = {
        id: RN.uid('intro'), opId: op.id, status: 'pending', source: 'proof', proofId: rec.id, proofRequest: type, createdAt: ts,
        buyer: { name, title: who.title, email, company: { name: company } },
        need: 'not_sure',
        fields: { need: 'not_sure', engagementType: 'fractional', roleCategory: op.catKey },
        note: `Asked to ${ask} from your proof link.`, thread: [],
      };
      s.intros.unshift(lead);
    }, 'intros');
    RN.store.emit && RN.store.emit('proofLinks');
    RN.track('proof_request', { opId: op.id, source: 'proof', meta: { proofId: rec.id, type, company } });
    const sections = (rec.sections || []).map((k) => PROOF_SECTIONS[k] || k).join(', ');
    const verified = (op.reviews || []).map((r) => `${r.reviewer}${r.role ? ', ' + r.role : ''} at ${r.company}`);
    if (type === 'call') {
      RN.mail(op.name, `${name} wants to book a call`, `${note}\nReply to ${email} with two or three times this week.\nSections shared: ${sections}.\n\nThe lead is in your Studio inbox.`, 'proof');
      RN.mail(email, `${op.first} will email you times`, `Thanks for asking to talk with ${op.name}. ${op.first} will reply to this address with times for a 30-minute call.\n\nRevenue Nomad`, 'proof');
    } else {
      RN.mail(op.name, `${name} asked for a reference`, `${note}\nIntroduce them to a past client by email at ${email} once your client agrees.${verified.length ? `\nVerified clients you could introduce: ${verified.join('; ')}.` : ''}\n\nThe lead is in your Studio inbox.`, 'proof');
      RN.mail(email, `${op.first} will introduce you to a past client`, `Thanks for asking. ${op.first} will ask a past client to reply to you at this address.\n\nRevenue Nomad`, 'proof');
    }
    const slot = (S.plForm && S.plForm.slot) || 'end';
    S.plForm = null;
    const fresh = proofRec(rec.id);
    redrawSlot(fresh, 'top');
    redrawSlot(fresh, 'end');
    RN.ui.toast(type === 'call' ? `Sent. ${esc(op.first)} will email ${esc(email)} with times.` : `Sent. ${esc(op.first)} will introduce you to a past client by email.`, { icon: 'check-circle' });
    const b = document.querySelector(`[data-pl-slot="${slot}"] [data-act="pf-proof-${type === 'call' ? 'call' : 'ref'}"]`);
    if (b) b.focus();
  };
  RN.actions['pf-proof-sample'] = (el) => {
    const rec = proofRec(el.dataset.id);
    const c = S.ctx;
    if (!rec || !c) return;
    if (isOwnOp(c.op)) { RN.ui.closeModal(); RN.ui.toast('Preview only. Your prospect uses this button to ask for the file.', { icon: 'eye' }); return; }
    const s = c.samples.find((x) => x.id === el.dataset.s);
    const who = prospectOf(rec);
    RN.mail(c.op.name, `${who.contact || 'Your prospect'} asked for a full work sample`, `${who.contact || 'A prospect'} at ${who.company} asked for the full version of “${s ? s.title : 'a work sample'}” from your proof link.\n\nSend it by email, or share it after your first call.`, 'proof');
    RN.ui.closeModal();
    RN.ui.toast(`Request sent. ${esc(c.op.first)} will email you the full sample.`);
  };

  RN.view('proof', {
    route: 'proof.:id', nav: '', chrome: 'solid', footer: false,
    samples: { id: 'proof-harbor', extra: ['proof.unknown-link'] },
    title: (p) => { const rec = proofRec(p.id); const op = rec && RN.model.byId(rec.opId); return op ? `${op.name} for ${rec.prospect.company}` : 'Link expired'; },
    render: renderProof,
    mount: mountProof,
    unmount: () => { cleanup(true); S = fresh(); },
  });

  /* ================================================================================================
     Badge verification (#verify.<slug>): where the embeddable badge links. A dated, public confirmation of
     the operator's Reputation Index, for direct deals.
     ================================================================================================ */
  function renderVerify(p) {
    RN.model.applyEdits();
    const op = RN.model.bySlug(p.slug);
    if (!op || op.hidden) {
      return `<section class="wrap-narrow section pf-expired"><div class="pf-expired-card">
          <span class="pf-expired-i">${icon('shield')}</span>
          <span class="eyebrow">Revenue Nomad verification</span>
          <h1 class="h2">We could not verify this badge</h1>
          <p class="lede">No live profile matches this badge. It may be out of date, or the profile may be hidden.</p>
          <div class="row pf-center"><a class="btn" href="#browse">Browse talent</a><a class="btn btn-line" href="#talk">Talk to us</a></div>
        </div></section>`;
    }
    visit('verify:' + op.slug);
    const tier = F.risTierFor(op.ris.score);
    const gold = tier.v === 'elite' || tier.v === 'apex';
    const verifiedTags = op.tags.filter((t) => t.tier !== 'claimed').length;
    const reviews = (op.reviews || []).length;
    const asOf = RN.fmt.date(RN.now());
    return `<div class="pf pf-verify">
      <section class="wrap-narrow pf-vf">
        <article class="pf-vf-card">
          <header class="pf-vf-top night">
            <div class="pf-band-bg" aria-hidden="true">${hexLattice()}</div>
            <span class="eyebrow pf-vf-k">${icon('shield')}Revenue Nomad verification</span>
            <div class="pf-vf-id">
              <span class="pf-vf-seal ${gold ? 'gold' : ''}">${RN.ui.hexSeal(tier.l)}<b>${esc(op.ris.score)}</b></span>
              <div class="grow"><h1 class="h2 serif-up pf-vf-name">${esc(op.name)}</h1><p class="pf-role">Fractional ${esc(op.role)}</p></div>
            </div>
            <p class="pf-vf-status">${icon('check-circle')}<span><b>Confirmed on Revenue Nomad</b> · as of ${esc(asOf)}</span></p>
          </header>
          <dl class="pf-vf-facts">
            <div><dt>Reputation Index tier</dt><dd class="${gold ? 'gold' : ''}">${esc(tier.l)}</dd></div>
            <div><dt>Reputation Index</dt><dd>${esc(op.ris.score)}<small> of 100</small></dd></div>
            <div><dt>Client-verified reviews</dt><dd>${reviews}</dd></div>
            <div><dt>Verified focus areas</dt><dd>${verifiedTags}</dd></div>
          </dl>
          <div class="pf-vf-body">
            <p class="pf-vf-d"><b>${esc(tier.l)}</b> ${esc(tier.d)}</p>
            <p class="small muted">Reviews are submitted by the client on Revenue Nomad and publish as submitted. A focus area is verified when a client confirms it in a review. The score is recalculated whenever a review arrives, so this page always shows the current tier.</p>
            ${founderLine(op)}
            <div class="row pf-vf-act"><a class="btn" href="#op.${esc(op.slug)}" data-view-source="badge">View ${esc(op.first)}’s full profile${icon('arrow')}</a><a class="act" href="#levels">How the Reputation Index works</a></div>
          </div>
        </article>
        <p class="pf-vf-foot">Hiring? <a class="link" href="#browse">Browse operators with client-verified proof</a></p>
      </section>
    </div>`;
  }
  function mountVerify(root, p) {
    const op = RN.model.bySlug(p.slug);
    if (!op || !root) return;
    if (!S.tracked) { S.tracked = true; if (!isOwnOp(op)) RN.track('badge_view', { opId: op.id, source: 'badge' }); }
  }
  RN.view('verify', {
    route: 'verify.:slug', nav: '', chrome: 'solid',
    samples: { slug: 'matt-lopez', extra: ['verify.unknown-operator'] },
    title: (p) => { const op = RN.model.bySlug(p.slug); return op ? `Verify ${op.name}` : 'Badge not found'; },
    render: renderVerify,
    mount: mountVerify,
    unmount: () => { cleanup(true); S = fresh(); },
  });
})();
