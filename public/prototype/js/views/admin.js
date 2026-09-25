/* Admin: the Revenue Nomad team console (#admin, #admin.<tab>).
   Tabs: Overview, Demand, Approvals, Intros, Projects, Directory, Emails.
   It reads the one store and model every surface shares, so a search a client runs in Browse, an
   application from Join or an intro requested on a profile shows up here, and every action taken
   here (approve and score, introduce, suggest operators, edit, hide) lands back on those surfaces.
   Market baselines are illustrative (RN.data.market); live session events are added on top.
   Demand metrics count client and visitor activity only (actor types client + anonymous, AP-19). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const DAY = 864e5, HOUR = 36e5;
  const TEAM = 'hello@revenuenomad.com';
  const st = () => RN.store.state;
  const nowMs = () => RN.now().getTime();
  const ms = (d) => new Date(d).getTime();
  const pct = (x, d) => RN.fmt.pct(isFinite(x) ? x : 0, d || 0);
  const int = (n) => RN.fmt.int(n);
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== '' && x != null) : v === '' || v == null ? [] : String(v).split('|').filter(Boolean));
  const seen = () => { const s = st(); if (!s.seen) s.seen = {}; return s.seen; };
  const catLabel = (c) => RN.fields.catLabel(c);
  const dur = (m) => { const a = Math.abs(m), hrs = a / HOUR; return hrs < 1 ? Math.max(1, Math.round(a / 60000)) + 'm' : hrs < 48 ? Math.round(hrs) + 'h' : Math.round(hrs / 24) + 'd'; };
  const toast = (m, o) => RN.ui.toast(m, o);

  /* View state that should survive a re-render (not persisted) */
  const ui = { days: 30, dirQ: '', dirCat: '', dirSeg: 'all', dirSort: 'ris', dirLimit: 25, termsAll: false, mailSeg: 'all' };
  let charts = {};   // chart builders for this render, drawn at each slot's real width in mount()
  let ctx = {};      // recruit contexts for this render (zero-result rows, categories, focus areas)

  /* =====================================================================================
     Shell
     ===================================================================================== */
  const TABS = [
    { key: 'overview', label: 'Overview', icon: 'home', group: 'Marketplace' },
    { key: 'demand', label: 'Demand', icon: 'target', group: 'Marketplace' },
    { key: 'approvals', label: 'Approvals', icon: 'seal', group: 'Work queue', badge: () => queue().length },
    { key: 'intros', label: 'Intros', icon: 'handshake', group: 'Work queue', badge: () => introsForTeam().length },
    { key: 'projects', label: 'Projects', icon: 'briefcase', group: 'Work queue', badge: () => liveProjects().filter((p) => projInfo(p).flag).length },
    { key: 'directory', label: 'Directory', icon: 'users', group: 'Network' },
    { key: 'emails', label: 'Emails', icon: 'mail', group: 'Network' },
  ];
  const tabDef = (k) => TABS.find((x) => x.key === k);

  function side(cur) {
    const groups = {};
    TABS.forEach((x) => { (groups[x.group] = groups[x.group] || []).push(x); });
    return `<nav class="side" aria-label="Admin">
      <div class="side-id">${RN.ui.avatar({ name: 'Matt Lopez', initials: 'ML' }, 'ava-md')}<div><b>Revenue Nomad team</b><span>Matt Lopez · Admin</span></div></div>
      ${Object.keys(groups).map((g, gi) => `${gi ? '<div class="side-sep"></div>' : ''}<span class="label side-label">${esc(g)}</span>
        ${groups[g].map((x) => { const n = x.badge ? x.badge() : 0; return `<a href="#admin${x.key === 'overview' ? '' : '.' + x.key}" class="${cur === x.key ? 'on' : ''}"${cur === x.key ? ' aria-current="page"' : ''}>${icon(x.icon)}${esc(x.label)}${n ? `<span class="nav-count">${n}</span>` : ''}</a>`; }).join('')}`).join('')}
      <div class="side-sep"></div>
      <a href="#browse">${icon('search')}Browse as clients see it</a>
    </nav>`;
  }

  /* Same page header as Studio and the client Workspace: surface eyebrow, plain Display title (the shared
     .app-head size, no serif accent), one line of context, optional actions on the right. */
  function head(title, sub, actions) {
    return `<header class="app-head adm-head"><div class="grow"><span class="eyebrow">Revenue Nomad team</span><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="adm-head-act">${actions}</div>` : ''}</header>`;
  }
  function cardHead(title, sub, right) {
    return `<div class="card-hd adm-card-hd"><div class="grow"><h2 class="h4">${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right ? `<div class="adm-card-r">${right}</div>` : ''}</div>`;
  }
  const illus = (txt) => RN.ui.illus(txt);
  // One caption for KPI rows that blend an illustrative baseline with live session events
  const blendNote = () => `<p class="tiny muted adm-stats-note">${illus()}<span>Baseline volumes are illustrative. Live searches, views and intro requests from this session are added on top.</span></p>`;

  function render(key) {
    hydrate();
    charts = {}; ctx = {};
    const tab = tabDef(key) ? key : 'overview';
    const body = { overview, demand, approvals, intros: introsTab, projects: projectsTab, directory, emails }[tab]();
    return `<div class="wrap shell adm" data-adm="${esc(tab)}">${side(tab)}<div class="adm-main">${body}</div></div>`;
  }

  /* Charts are drawn after render at the slot's pixel width, so labels stay 12px at 390 and 1440 wide. */
  function chartSlot(name, build, minH) {
    charts[name] = build;
    return `<div class="adm-chart" data-adm-chart="${esc(name)}" style="min-height:${minH || 120}px"></div>`;
  }
  function drawCharts(root) {
    RN.$$('[data-adm-chart]', root || document).forEach((el) => {
      const b = charts[el.dataset.admChart];
      if (!b) return;
      const w = Math.max(240, Math.round(el.clientWidth));
      if (el._w === w) return;
      el._w = w;
      try { el.innerHTML = b(w); } catch (e) { console.error(e); el.innerHTML = ''; }
      el.style.minHeight = '';
    });
  }
  let onResize = null;
  function mount(root) {
    drawCharts(root);
    if (!onResize) {
      let tm;
      onResize = () => { clearTimeout(tm); tm = setTimeout(() => drawCharts(document.getElementById('main')), 120); };
      window.addEventListener('resize', onResize);
    }
  }
  function unmount() { if (onResize) { window.removeEventListener('resize', onResize); onResize = null; } }

  RN.view('admin', {
    route: 'admin', nav: '', requires: 'admin', footer: false,
    title: () => 'Admin',
    render: () => render('overview'),
    mount: (root) => mount(root),
    unmount,
  });
  RN.view('admin-tab', {
    route: 'admin.:tab', nav: '', requires: 'admin', footer: false,
    samples: { tab: 'demand', extra: ['admin.approvals', 'admin.intros', 'admin.projects', 'admin.directory', 'admin.emails'] },
    title: (p) => (tabDef(p.tab) ? tabDef(p.tab).label : 'Overview') + ' · Admin',
    render: (p) => render(p.tab),
    mount: (root) => mount(root),
    unmount,
  });

  /* =====================================================================================
     Shared data helpers
     ===================================================================================== */
  const liveOps = () => RN.model.ops.filter((o) => !o.hidden);

  // Client and visitor events inside the window. Operator and team activity never counts as demand.
  function liveEv(type, days) {
    const since = nowMs() - days * DAY;
    return (st().events || []).filter((e) => e.type === type && ms(e.ts) >= since && (e.persona === 'buyer' || e.persona === 'visitor'));
  }

  // AP-05: one normalized search term per search, so "HubSpot Admin " and "hubspot admin" count once.
  const normQ = (q) => String(q || '').toLowerCase().replace(/[“”"'’]/g, '').replace(/[^a-z0-9&+/\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  function fmtVal(k, v) {
    if (k === 'rateMax') return '$' + v + '/hr';
    if (k === 'tags') return String(v);
    if (RN.fields[k]) return RN.w.label(k, v);
    return String(v);
  }
  function fieldName(k) {
    if (k === 'tags') return RN.fields.fitTags.clientLabel;
    return RN.fields[k] ? RN.fields[k].label : k;
  }
  function filterList(filters, tags) {
    const out = [];
    Object.keys(filters || {}).forEach((k) => arr(filters[k]).forEach((v) => out.push({ k, v, l: fieldName(k), vl: fmtVal(k, v) })));
    arr(tags).forEach((v) => out.push({ k: 'tags', v, l: fieldName('tags'), vl: v }));
    return out;
  }
  const filterChips = (filters, tags) => {
    const l = filterList(filters, tags);
    return l.length ? `<span class="adm-fchips">${l.map((f) => `<span class="adm-fchip"><span>${esc(f.l)}</span>${esc(f.vl)}</span>`).join('')}</span>` : '<span class="tiny muted">No filters</span>';
  };

  /* Supply share (live operators) vs client demand share (hiring intent, State of Fractional GTM) */
  function supplyDemand() {
    const ops = liveOps();
    const total = ops.length || 1;
    const counts = {};
    ops.forEach((o) => { counts[o.catKey] = (counts[o.catKey] || 0) + 1; });
    const intent = RN.data.market.report.intent;
    const dTotal = intent.reduce((a, x) => a + x.v, 0) || 1;
    return RN.fields.roleCategory.options.map((o) => {
      const supply = (counts[o.v] || 0) / total;
      const demand = ((intent.find((x) => x.cat === o.v) || {}).v || 0) / dTotal;
      return { cat: o.v, l: o.l, n: counts[o.v] || 0, supply, demand, ratio: demand ? supply / demand : null };
    });
  }
  function gapPill(x) {
    if (!x.demand) return '<span class="pill">No demand data</span>';
    if (x.ratio > 1.25) return `<span class="pill pill-warn">${x.ratio.toFixed(1)}x oversupplied</span>`;
    if (x.ratio < 0.8) return `<span class="pill pill-info">${(1 / Math.max(0.01, x.ratio)).toFixed(1)}x undersupplied</span>`;
    return '<span class="pill pill-good">Balanced</span>';
  }

  /* Search to intro funnel (AP-21): illustrative baseline for the window + live session events */
  function funnel(days) {
    const vol = RN.data.market.queries.reduce((a, q) => a + q.vol, 0);
    const k = days / 30;
    const base = { s: Math.round(vol * k), i: Math.round(vol * k * 9.4) };
    base.v = Math.round(base.i * 0.041);
    base.r = Math.max(1, Math.round(base.v * 0.017));
    const live = { s: liveEv('search', days).length, i: liveEv('impression', days).length, v: liveEv('profile_view', days).length, r: liveEv('intro_request', days).length };
    const cur = { s: base.s + live.s, i: base.i + live.i, v: base.v + live.v, r: base.r + live.r };
    const prev = { s: Math.round(base.s * 0.91), i: Math.round(base.i * 0.9), v: Math.round(base.v * 0.94), r: Math.max(1, Math.round(base.r * 0.85)) };
    return {
      cur, prev, live, liveN: live.s + live.i + live.v + live.r,
      steps: [{ label: 'Search impressions', value: cur.i }, { label: 'Profile views', value: cur.v }, { label: 'Intro requests', value: cur.r }],
    };
  }
  function funnelChart(steps, w) {
    if (w >= 500) return RN.chart.funnel(steps, { w, label: 'Search to intro funnel' });
    const max = Math.max(...steps.map((s) => s.value), 1);
    return `<ol class="adm-funnel">${steps.map((s, i) => `<li>
      <div class="adm-funnel-l"><span>${esc(s.label)}</span><b class="num">${int(s.value)}${i && steps[i - 1].value ? `<span> · ${pct(s.value / steps[i - 1].value, 1)}</span>` : ''}</b></div>
      <span class="adm-funnel-bar"><i style="width:${Math.max(1.5, (s.value / max) * 100).toFixed(1)}%;opacity:${(1 - i * 0.18).toFixed(2)}"></i></span></li>`).join('')}</ol>`;
  }
  const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
  function barsChart(rows, w, o) {
    o = o || {};
    const labelW = Math.round(Math.min(o.labelW || 200, w * (w < 480 ? 0.44 : 0.36)));
    const max = Math.floor(labelW / 6.6);
    const opts = { w, labelW, rowH: 32, barH: 16, label: o.label || 'Bar chart' };
    if (o.fmt) opts.fmt = o.fmt;
    return RN.chart.bars(rows.map((r) => Object.assign({}, r, { label: trunc(w < 480 && r.short ? r.short : r.label, max) })), opts);
  }

  /* =====================================================================================
     Operator applications: pending -> Approve profile -> Generate score -> live at Vetted 50
     ===================================================================================== */
  const apps = () => st().pending || [];
  const appById = (id) => apps().find((a) => a.id === id);
  const statusOf = (a) => a.status || 'in_review';
  const queue = () => apps().filter((a) => ['in_review', 'approved', 'changes_requested'].includes(statusOf(a)));
  const opIdFor = (a) => 'op-' + a.id;

  // Reads the intake record defensively: seed and Join may name a few keys differently.
  // Intake stores role details under profile.roleFields (registry keys; older records use profile.roleDetails),
  // and crm, methodologies, salesMotions and usHours at the top level of profile.
  const filled = (v) => (Array.isArray(v) ? v.filter((x) => x !== '' && x != null).length > 0 : v !== '' && v != null);
  const first = (...vs) => vs.find(filled);
  const appRoleFields = (p) => Object.assign({}, p.roleDetails, p.roleFields);
  function prof(a) {
    const p = a.profile || a;
    const rd = appRoleFields(p);
    const name = p.name || p.fullName || [p.first, p.last].filter(Boolean).join(' ') || 'New applicant';
    const cat = RN.fields.catKey(p.roleCategory || p.cat || '');
    return {
      name, first: RN.fmt.first(name), email: p.email || '', roleCategory: cat,
      role: p.role || (RN.fields.rolesByCat[cat] || [''])[0], headline: p.headline || '', bio: p.bio || '',
      rate: +p.rate || null, availability: p.availability || p.availKey || 'available_now', hoursPerMonth: String(p.hoursPerMonth || p.hoursCode || ''),
      startDate: p.startDate || '', revenueRange: arr(p.revenueRange || p.revenueRanges), employeeRange: arr(p.employeeRange || p.employeeRanges),
      industries: arr(p.industries), fitTags: arr(p.fitTags || p.tags).map((x) => (typeof x === 'string' ? x : x.t)),
      location: p.location || [p.city, p.region].filter(Boolean).join(', ') || p.country || '', timezone: p.timezone || '', country: p.country || '', usHours: p.usHours || '',
      crm: first(p.crm, rd.crm) || '', salesMotions: arr(first(p.salesMotions, rd.salesMotions)), methodologies: arr(first(p.methodologies, rd.methodologies)), methodologyOther: first(p.methodologyOther, rd.methodologyOther) || '',
      engagementTypes: arr(p.engagementTypes),
      newClientCapacity: p.newClientCapacity || null, photo: p.photo || '', video: p.video || '', linkedin: p.linkedin || '', roleFields: rd,
    };
  }

  /* Role details of an application, read from the intake record (profile.roleFields, then top-level profile keys)
     and printed with the registry's labels. Live operators use RN.roleDetail.text(op, key) instead. */
  function appRoleText(a, key) {
    const p = a.profile || a;
    const rd = appRoleFields(p);
    const d = RN.fields[key];
    if (!d) return '';
    const v = filled(rd[key]) ? rd[key] : p[key];
    if (!filled(v)) return '';
    if (d.type === 'multi' || (d.type === 'optcards' && d.multi)) {
      const other = first(p.methodologyOther, rd.methodologyOther);
      const list = arr(v).map((x) => (x === 'Other' && key === 'methodologies' && other ? other : RN.w.label(key, x)));
      return list.join(', ');
    }
    if (d.type === 'money') return RN.fmt.usdK(+v);
    if (d.type === 'number') { const u = d.unit || ''; return RN.fmt.int(+v) + (u ? (u[0] === '%' ? u : ' ' + u) : ''); }
    return RN.w.label(key, v);
  }
  const roleKeys = (cat) => RN.fields.roleFields[cat] || [];

  // Builds the live-record shape RN.model.norm expects (see js/data/operators.js), then pins the exact standard slugs.
  function buildOp(a) {
    const p = prof(a);
    const cat = catLabel(p.roleCategory);
    const hours = p.hoursPerMonth ? +p.hoursPerMonth : null;
    const tags = p.fitTags.map((x) => { const info = RN.model.tagInfo(x) || {}; return { t: info.v || x, c: info.c ? catLabel(info.c) : cat, g: info.g || '', axis: info.axis || '', stage: info.stage || '', r: 0 }; });
    const std = { revRange: '', empRange: '', crm: p.crm, hours, industries: p.industries };
    // Role details keep their registry keys (op.roleFields, which RN.roleDetail reads first). CRM, methodologies and
    // GTM motion ride along, so the profile's Operating range shows every intake answer.
    const reg = Object.assign({}, p.roleFields,
      p.crm ? { crm: p.crm } : null,
      p.methodologies.length ? { methodologies: p.methodologies } : null,
      p.methodologyOther ? { methodologyOther: p.methodologyOther } : null,
      p.salesMotions.length ? { salesMotions: p.salesMotions } : null);
    const raw = {
      id: opIdFor(a), name: p.name, role: p.role, cat, rate: p.rate, isMatt: false, photo: p.photo, initials: RN.fmt.initials(p.name),
      standard: std, roleDetails: reg,
      profile: {
        name: p.name, title: p.role, desc: p.headline, bio: p.bio, tags, reviews: [], core: null,
        profile: { reputationIndex: 50, reputationLabel: 'Vetted', engagements: 0, wouldHireAgain: null, totalTags: tags.length },
        details: {
          timezone: p.timezone, industries: p.industries, engagements: [], standard: std,
          availability: { status: RN.w.label('availability', p.availability) || 'Available now', startDate: p.startDate || RN.now().toISOString().slice(0, 10), hoursPerMonth: hours },
          snapshot: { motions: p.salesMotions, methodologies: p.methodologies },
        },
      },
    };
    const op = RN.model.norm(raw);
    op.revenueRanges = p.revenueRange.slice();
    op.employeeRanges = p.employeeRange.slice();
    if (p.engagementTypes.length) op.engagementTypes = p.engagementTypes.slice();
    if (p.newClientCapacity) op.newClientCapacity = +p.newClientCapacity;
    op.roleFields = Object.assign({}, op.roleFields, RN.model.registryRoleFields(reg));
    if (p.crm) op.crm = p.crm;
    if (p.methodologies.length) op.methodologies = p.methodologies.filter((x) => x !== 'Other').concat(p.methodologyOther ? [p.methodologyOther] : []);
    if (p.salesMotions.length) op.motions = p.salesMotions.slice();
    op.location = p.location;
    // Non-US applicants answer "Willing to work US time zone hours?" at intake; keep it on the operator
    if (p.usHours) op.usHours = p.usHours;
    if (p.country) op.country = p.country;
    op.video = p.video || null;
    op.admin = { appId: a.id, liveAt: a.liveAt || null };
    op.completeness = RN.model.completeness(op);
    return op;
  }
  function goLive(a, onlyIfMissing) {
    const existing = RN.model.byId(opIdFor(a));
    if (existing && onlyIfMissing) return existing;
    const op = buildOp(a);
    if (existing) { Object.assign(existing, op); existing.hidden = false; return existing; }
    const clash = RN.model.bySlug(op.slug);
    if (clash && clash.id !== op.id) op.slug += '-' + String(a.id).replace(/[^a-z0-9]/gi, '').slice(-4).toLowerCase();
    RN.model.add(op);
    return op;
  }

  // Admin edits that RN.model.applyEdits does not cover (role and role category, L473)
  function applyAdminEdits() {
    const E = st().edits || {};
    Object.keys(E).forEach((id) => {
      const e = E[id], op = RN.model.byId(id);
      if (!op || !e) return;
      if (e.catKey && e.catKey !== op.catKey) { op.catKey = e.catKey; op.cat = catLabel(e.catKey); }
      if (e.role) op.role = e.role;
    });
    RN.model.applyEdits();
  }

  /* Keep the in-memory model in step with the store: approved applications, hidden operators, edits. */
  function hydrate() {
    const list = apps();
    list.forEach((a) => { if (statusOf(a) === 'live') goLive(a, true); });
    const hid = seen().hidden || [];
    RN.model.ops.forEach((o) => {
      if (o.admin) { const a = list.find((x) => x.id === o.admin.appId); o.hidden = !a || statusOf(a) !== 'live' || hid.includes(o.id); }
      else o.hidden = hid.includes(o.id);
    });
    applyAdminEdits();
  }

  function addBiz(d, n) {
    const x = new Date(d);
    let k = 0;
    while (k < n) { x.setDate(x.getDate() + 1); const wd = x.getDay(); if (wd !== 0 && wd !== 6) k++; }
    return x;
  }

  // Automatic checks shown on each application (nothing here blocks approval; the team decides)
  function appFlags(a, op) {
    const p = prof(a);
    const out = [];
    const idx = RN.data.market.rateIndex.byCat[p.roleCategory];
    if (p.rate && idx) {
      if (p.rate > idx.p75) out.push(['warn', `Rate ${RN.fmt.rate(p.rate)} is above the Rate Index p75 for ${catLabel(p.roleCategory)} (${RN.fmt.rate(idx.p75)}).`]);
      else if (p.rate < idx.p25) out.push(['warn', `Rate ${RN.fmt.rate(p.rate)} is below the p25 (${RN.fmt.rate(idx.p25)}). Check it is not a typo.`]);
      else out.push(['good', `Rate sits inside the Rate Index range for ${catLabel(p.roleCategory)} (${RN.fmt.rate(idx.p25)} to ${RN.fmt.rate(idx.p75)}).`]);
    } else if (!p.rate) out.push(['warn', 'No hourly rate. Clients who filter by budget will not see this profile.']);
    const dup = RN.model.ops.find((o) => !o.admin && o.name.toLowerCase() === p.name.toLowerCase());
    out.push(dup ? ['bad', `An operator named ${dup.name} is already on the network. Check for a duplicate.`] : ['good', 'No existing profile with this name.']);
    const dom = (p.email.split('@')[1] || '').toLowerCase();
    if (dom) out.push(/^(gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail)\./.test(dom) ? ['warn', 'Personal email address. Confirm identity on LinkedIn.'] : ['good', `Work email domain: ${dom}`]);
    const custom = p.fitTags.filter((x) => !RN.model.tagInfo(x));
    if (custom.length) out.push(['warn', `${RN.fmt.plural(custom.length, 'new tag')} not in the library yet: ${custom.slice(0, 3).join(', ')}. Review before it is added.`]);
    if (p.fitTags.length < 10) out.push(['warn', `${RN.fmt.plural(p.fitTags.length, 'fit tag')}. Ten or more gives clients more ways to find them.`]);
    const rk = roleKeys(p.roleCategory);
    const answered = rk.filter((k) => appRoleText(a, k)).length;
    if (rk.length && !answered) out.push(['warn', `No role details for ${catLabel(p.roleCategory)}. The Operating range section on the profile will be empty.`]);
    else if (rk.length && answered < rk.length) out.push(['warn', `${answered} of ${rk.length} role details answered.`]);
    if (!p.bio) out.push(['warn', 'No About section yet.']);
    if (!p.photo) out.push(['warn', 'No profile photo.']);
    const sd = supplyDemand().find((x) => x.cat === p.roleCategory);
    if (sd && sd.demand && sd.ratio < 0.8) out.push(['gap', `Fills a gap: ${sd.l} is ${pct(sd.supply)} of supply and ${pct(sd.demand)} of client demand.`]);
    const mk = RN.model.market().tags;
    const best = p.fitTags.map((x) => mk.find((m) => m.t.toLowerCase() === x.toLowerCase())).filter(Boolean).sort((x, y) => y.ratio - x.ratio)[0];
    if (best) out.push(['gap', `“${best.t}” gets about ${int(best.demand)} searches a month and ${RN.fmt.plural(best.verified, 'client-verified operator')}.`]);
    return out;
  }
  const FLAG_ICON = { good: 'check-circle', warn: 'info', bad: 'flag', gap: 'trend-up' };
  const flagList = (flags) => `<ul class="adm-flags">${flags.map(([k, txt]) => `<li class="adm-flag ${k}">${icon(FLAG_ICON[k])}<span>${esc(txt)}</span></li>`).join('')}</ul>`;

  /* =====================================================================================
     Intros: Pending -> Interested -> RN Qualified -> Introduced -> Hired (or Declined)
     ===================================================================================== */
  const intros = () => st().intros || [];
  const lastTs = (i) => { const th = i.thread || []; return th.length ? th[th.length - 1].ts : i.createdAt; };
  // Operators have 72 hours to reply; once interested, the team qualifies within one business day.
  // Countdowns never read above their window: records stamped later than the prototype clock (after the
  // dock moves time back) show the full window, not "240h left".
  function clock(i) {
    const win = i.status === 'pending' ? 72 * HOUR : i.status === 'interested' ? 24 * HOUR : 0;
    if (!win) return null;
    const left = Math.min(win, win - (nowMs() - ms(i.status === 'pending' ? i.createdAt : lastTs(i))));
    return { who: i.status === 'pending' ? 'op' : 'team', left, late: left < 0, frac: RN.clamp(1 - left / win, 0, 1) };
  }
  const introsLate = () => intros().filter((i) => i.status === 'pending' && clock(i).late);
  const introsForTeam = () => intros().filter((i) => i.status === 'interested' || i.status === 'rn_qualified' || (i.status === 'pending' && clock(i).late));

  /* =====================================================================================
     Projects: posted client projects, 72-hour no-response flag, RN suggestions (max 3)
     ===================================================================================== */
  const liveProjects = () => (st().projects || []).filter((p) => p.status === 'posted' || p.status === 'in_progress');
  function projInfo(p) {
    const hrs = Math.max(0, (nowMs() - ms(p.postedAt || p.createdAt)) / HOUR);
    const rs = p.responses || [];
    const interested = rs.filter((r) => r.status === 'interested').length;
    return { hrs, interested, declined: rs.filter((r) => r.status === 'declined').length, invited: (p.invited || []).length, suggested: (p.suggested || []).length, flag: hrs >= 72 && interested === 0 };
  }
  function projClient(p) {
    const b = p.buyer || p.client || p.contact;
    if (b && (b.email || b.name)) return { name: b.name || 'Client', email: b.email || RN.personas.buyer.email, company: (b.company && b.company.name) || b.company || p.companyName || '' };
    const me = RN.personas.buyer;
    return { name: me.name, email: me.email, company: (p.company && p.company.name) || p.companyName || me.company.name };
  }
  const fitPill = (f) => `<span class="pill ${f.pct >= 75 ? 'pill-good' : f.pct >= 50 ? 'pill-info' : ''}">${esc(f.label)} · ${f.pct}</span>`;

  /* =====================================================================================
     OVERVIEW
     ===================================================================================== */
  function overview() {
    const q = queue(), team = introsForTeam(), late = introsLate();
    const pf = liveProjects().filter((p) => projInfo(p).flag);
    const zero = zeroRows(7);
    const oldest = q.slice().sort((a, b) => ms(a.submittedAt) - ms(b.submittedAt))[0];
    const needs = [
      q.length && { ic: 'seal', t: `${RN.fmt.plural(q.length, 'operator application')} to review`, sub: `Oldest submitted ${RN.fmt.ago(oldest.submittedAt)}. Approve the profile, then generate the score to put it live at Vetted 50.`, to: 'admin.approvals', cta: 'Review' },
      team.filter((i) => i.status !== 'pending').length && { ic: 'handshake', t: `${RN.fmt.plural(team.filter((i) => i.status !== 'pending').length, 'intro')} waiting on the team`, sub: 'Operators said yes. Qualify the fit, then introduce both sides by email.', to: 'admin.intros', cta: 'Open pipeline' },
      late.length && { ic: 'clock', late: true, t: `${RN.fmt.plural(late.length, 'intro request')} past the 72-hour reply window`, sub: 'Nudge the operator, or decline for them and suggest two operators with the same fit.', to: 'admin.intros', cta: 'Nudge' },
      pf.length && { ic: 'briefcase', late: true, t: `${RN.fmt.plural(pf.length, 'project')} with no interested operator after 72 hours`, sub: 'Add up to three suggested operators to each one.', to: 'admin.projects', cta: 'Suggest' },
      zero.length && { ic: 'search', t: `${RN.fmt.plural(zero.length, 'search term')} found no operator this week`, sub: `Latest: “${zero[0].q || 'filters only'}”. Each one returns no operator in Browse today. This is the supply gap list.`, to: 'admin.demand', cta: 'Recruit', illus: zero.some((z) => z.base) },
    ].filter(Boolean);

    const f7 = funnel(7);
    const opsLive = liveOps().length;
    const added = RN.model.ops.filter((o) => o.admin && !o.hidden).length;
    const intros30 = intros().filter((i) => nowMs() - ms(i.createdAt) <= 30 * DAY).length;

    const sd = supplyDemand();
    const rows = sd.slice().sort((a, b) => b.demand - a.demand || b.supply - a.supply);
    const top = sd.slice().sort((a, b) => b.supply - a.supply)[0];
    const gap = sd.filter((x) => x.demand > 0).sort((a, b) => a.ratio - b.ratio)[0];
    const maxShare = Math.max(...sd.map((x) => Math.max(x.supply, x.demand)), 0.01);
    ctx['cat:' + gap.cat] = { kind: 'cat', cat: gap.cat, title: `${gap.l} operators` };

    return `${head('Marketplace health', `${esc(RN.fmt.date(RN.now()))} · ${RN.fmt.plural(opsLive, 'operator')} live · ${q.length ? RN.fmt.plural(q.length, 'application') + ' to review' : 'No applications waiting'}`)}

      <section class="card adm-sec" aria-labelledby="adm-needs-h">
        ${cardHead('<span id="adm-needs-h">Needs you</span>', 'Work only the team can do, most urgent first.')}
        ${needs.length ? `<div class="adm-needs">${needs.map((n) => `<div class="adm-need${n.late ? ' is-late' : ''}"><span class="adm-need-ic">${icon(n.ic)}</span><div class="grow"><b>${esc(n.t)}</b>${n.illus ? illus('Volumes illustrative') : ''}<p>${esc(n.sub)}</p></div><a class="btn btn-sm btn-line" href="#${n.to}">${esc(n.cta)}${icon('arrow')}</a></div>`).join('')}</div>`
        : RN.ui.empty({ icon: 'check-circle', title: 'Nothing needs you right now', body: 'New applications, intros waiting on the team and quiet projects show up here.' })}
      </section>

      <div class="stats-row adm-stats" style="--cols:4">
        <div class="stat"><span class="stat-v">${int(opsLive)}</span><span class="stat-l">Operators live${added ? ` · <span class="accent">${added} approved this session</span>` : ''}</span></div>
        <div class="stat"><span class="stat-v">${int(f7.cur.s)}</span><span class="stat-l">Client searches, last 7 days ${RN.ui.delta(f7.cur.s, f7.prev.s)}</span></div>
        <div class="stat"><span class="stat-v">${int(f7.cur.v)}</span><span class="stat-l">Profile views, last 7 days ${RN.ui.delta(f7.cur.v, f7.prev.v)}</span></div>
        <div class="stat"><span class="stat-v">${int(intros30)}</span><span class="stat-l">Intro requests, last 30 days</span></div>
      </div>
      ${blendNote()}

      <div class="adm-cols">
        <section class="card adm-sec">
          ${cardHead('Supply vs client demand', 'Share of live operators by role category against the share of client hiring intent.', illus('Demand illustrative'))}
          <div class="adm-callout">
            <p class="adm-callout-t">${esc(top.l)}: <b>${pct(top.supply)}</b> of supply, <b>${pct(top.demand)}</b> of demand.</p>
            <p class="small muted">${esc(gap.l)} is the widest gap the other way: ${pct(gap.supply)} of operators for ${pct(gap.demand)} of client demand.</p>
            <div><button type="button" class="btn btn-sm" data-act="adm-recruit" data-k="cat:${esc(gap.cat)}">${icon('megaphone')}Recruit ${esc(gap.l)} operators</button></div>
          </div>
          <div class="adm-sd" role="list">
            <div class="adm-sd-legend legend"><span><i style="background:var(--viz-2)"></i>Supply: share of live operators</span><span><i style="background:var(--viz-1)"></i>Demand: share of client hiring intent</span></div>
            ${rows.map((x) => `<div class="adm-sd-row" role="listitem">
              <div class="adm-sd-name"><span class="adm-sd-l">${RN.ui.catDot(x.cat)}<b>${esc(x.l)}</b></span><span class="tiny muted">${RN.fmt.plural(x.n, 'operator')}</span></div>
              <div class="adm-sd-bars">
                <div class="adm-sd-bar"><span>Supply</span><span class="adm-sd-track"><i class="s" style="width:${((x.supply / maxShare) * 100).toFixed(1)}%"></i></span><b>${pct(x.supply)}</b></div>
                <div class="adm-sd-bar"><span>Demand</span><span class="adm-sd-track"><i class="d" style="width:${((x.demand / maxShare) * 100).toFixed(1)}%"></i></span><b>${pct(x.demand)}</b></div>
              </div>
              <div class="adm-sd-gap">${gapPill(x)}</div>
            </div>`).join('')}
          </div>
          <p class="tiny muted adm-foot">Supply counts every live, visible profile. Demand is the hiring-intent split from the State of Fractional GTM survey, cut by the same role categories.</p>
        </section>

        <div class="adm-stack">
        <section class="card adm-sec">
          ${cardHead('This week’s client funnel', `${int(f7.cur.s)} searches, about ${(f7.cur.i / Math.max(1, f7.cur.s)).toFixed(1)} operator cards shown per search.`, illus())}
          ${chartSlot('ov-funnel', (w) => funnelChart(f7.steps, w), 140)}
          <div class="adm-mini-stats">
            <div><span class="label">View rate</span><b class="num">${pct(f7.cur.v / Math.max(1, f7.cur.i), 1)}</b></div>
            <div><span class="label">Intro rate</span><b class="num">${pct(f7.cur.r / Math.max(1, f7.cur.v), 1)}</b></div>
            <div><span class="label">Live events</span><b class="num">${int(f7.liveN)}</b></div>
          </div>
          <p class="tiny muted adm-foot">Illustrative baseline plus ${RN.fmt.plural(f7.liveN, 'live event')} from this session. Client and visitor activity only: operator and team activity never counts.</p>
          <a class="act" href="#admin.demand">See search terms and zero-result searches${icon('arrow')}</a>
        </section>
        <section class="card adm-sec">${activityCard()}</section>
        <section class="card adm-sec">${reviewsCard()}</section>
        </div>
      </div>`;
  }

  function describeEvent(e) {
    const op = e.opId ? RN.model.byId(e.opId) : null;
    const who = op ? op.name : 'an operator';
    switch (e.type) {
      case 'search': return { ic: 'search', t: e.q && String(e.q).trim() ? `Searched “${String(e.q).replace(/\s+/g, ' ').trim()}”` : 'Searched with filters only', sub: `${e.results != null ? RN.fmt.plural(+e.results, 'result') : 'Results not logged'}${filterList(e.filters, e.tags).length ? ' · ' + filterList(e.filters, e.tags).map((f) => f.vl).slice(0, 3).join(', ') : ''}` };
      case 'profile_view': return { ic: 'eye', t: `Viewed ${who}`, sub: e.source ? 'From ' + e.source : '' };
      case 'shortlist_add': return { ic: 'bookmark', t: `Shortlisted ${who}` };
      case 'shortlist_remove': return { ic: 'bookmark', t: `Removed ${who} from a shortlist` };
      case 'compare_add': return { ic: 'compare', t: `Added ${who} to compare` };
      case 'compare_view': return { ic: 'compare', t: `Compared ${who}` };
      case 'intro_request': return { ic: 'handshake', t: `Requested an intro to ${who}` };
      case 'project_post': return { ic: 'briefcase', t: 'Posted a project' };
      case 'project_invite': return { ic: 'send', t: `Invited ${who} to a project` };
      case 'proof_view': return { ic: 'link', t: `Opened ${op ? op.first + '’s' : 'a'} proof link` };
      case 'review_request': return { ic: 'star', t: `${who} asked a client for a review` };
      case 'review_submit': return { ic: 'star', t: `Submitted a review for ${who}` };
      case 'signup_submit': return { ic: 'user', t: 'Sent an operator application' };
      default: return { ic: 'bolt', t: String(e.type).replace(/_/g, ' ') };
    }
  }
  function actor(e) {
    if (e.persona === 'buyer') { const b = e.buyer || {}; return 'Client' + (b.name ? ': ' + b.name : b.industry ? ': ' + RN.w.label('industry', b.industry) : ''); }
    return { visitor: 'Visitor', operator: 'Operator', admin: 'Team' }[e.persona] || 'Visitor';
  }
  function activityCard() {
    const list = (st().events || []).filter((e) => e.type !== 'impression' && e.persona !== 'admin').slice(0, 7);
    return `${cardHead('Live activity', 'What people did in this session, newest first. Impressions are left out.')}
      ${list.length ? `<ol class="adm-feed">${list.map((e) => { const d = describeEvent(e); return `<li><span class="adm-feed-ic">${icon(d.ic)}</span><div class="grow"><b>${esc(d.t)}</b><span class="tiny muted">${esc(actor(e))}${d.sub ? ' · ' + esc(d.sub) : ''}</span></div><span class="tiny muted nowrap">${esc(RN.fmt.ago(e.ts))}</span></li>`; }).join('')}</ol>`
      : RN.ui.empty({ icon: 'bolt', title: 'No activity yet this session', body: 'Search, open profiles or request an intro as a client and each action appears here and in Demand.', cta: `<button type="button" class="btn btn-sm" data-act="persona" data-p="buyer" data-to="browse">Browse as ${esc(RN.personas.buyer.first)} (client)</button>` })}`;
  }
  function recentReviews() {
    const list = [];
    RN.model.ops.forEach((op) => (op.reviews || []).forEach((r) => list.push({ op, r, d: r.date || r.ts || r.submittedAt || r.createdAt })));
    (st().reviews || []).forEach((r) => { const op = RN.model.byId(r.opId); if (op && !list.some((x) => x.r === r || (r.id && x.r.id === r.id))) list.push({ op, r, d: r.ts || r.submittedAt || r.createdAt || r.date }); });
    return list.filter((x) => x.d && !x.op.hidden).sort((a, b) => ms(b.d) - ms(a.d)).slice(0, 5);
  }
  function reviewsCard() {
    const list = recentReviews();
    return `${cardHead('Recent client reviews', 'Reviews publish the moment a client submits. There is no moderation queue.')}
      ${list.length ? `<ul class="adm-reviews">${list.map(({ op, r, d }) => {
        const who = typeof r.reviewer === 'string' ? r.reviewer : (r.reviewer && r.reviewer.name) || r.name || 'Client';
        const co = r.company || (r.reviewer && r.reviewer.company) || '';
        const rating = +(r.overall || r.coreAvg || 0);
        return `<li><div class="grow"><a class="adm-op-n" href="#op.${esc(op.slug)}">${esc(op.name)}</a><span class="tiny muted">${esc(who)}${co ? ', ' + esc(co) : ''} · ${esc(RN.fmt.dateShort(d))}</span></div>${rating ? RN.ui.stars(rating) : ''}${RN.ui.statusPill('review', 'completed', 'Published')}</li>`;
      }).join('')}</ul>` : RN.ui.empty({ icon: 'star', title: 'No reviews yet', body: 'Operators request reviews from Studio. Each one lands here as soon as the client submits.' })}`;
  }

  /* =====================================================================================
     DEMAND
     ===================================================================================== */
  function termRows(days) {
    const k = days / 30;
    const m = new Map();
    RN.data.market.queries.filter((q) => !q.zero).forEach((q) => {
      const key = normQ(q.q);
      const r = RN.rng('adm-term-' + key);
      const s = Math.max(1, Math.round(q.vol * k));
      const imp = Math.round(s * (7 + r() * 4));
      const views = Math.round(imp * (0.03 + r() * 0.03));
      const intr = Math.round(views * (0.008 + r() * 0.03));
      m.set(key, { key, q: q.q, cat: q.cat, tags: q.tags, s, imp, views, intros: intr, variants: new Set([q.q]), live: 0 });
    });
    liveEv('search', days).filter((e) => e.q && e.q.trim()).forEach((e) => {
      const key = normQ(e.q);
      let x = m.get(key);
      if (!x) { x = { key, q: e.q.trim(), cat: '', tags: arr(e.tags), s: 0, imp: 0, views: 0, intros: 0, variants: new Set(), live: 0 }; m.set(key, x); }
      x.s++; x.live++; x.variants.add(e.q.trim());
      if (e.results != null && e.results !== '') x.lastResults = +e.results;
    });
    liveEv('impression', days).filter((e) => e.q).forEach((e) => { const x = m.get(normQ(e.q)); if (x) x.imp++; });
    liveEv('profile_view', days).filter((e) => e.q).forEach((e) => { const x = m.get(normQ(e.q)); if (x) x.views++; });
    const rows = [...m.values()].sort((a, b) => b.s - a.s).slice(0, 25);
    // Results = what Browse returns for the term today (the same RN.model.search clients run, hidden profiles excluded).
    // Verified = results with a client-verified focus area behind the term.
    rows.forEach((x) => {
      const res = RN.model.search({ q: x.q });
      const tl = (x.tags || []).map((t) => t.toLowerCase());
      x.supply = res.length;
      x.verified = tl.length ? res.filter((r) => r.op.tags.some((t) => tl.includes(t.t.toLowerCase()) && t.tier !== 'claimed')).length : null;
    });
    return rows;
  }

  function zeroRows(days) {
    const k = days / 30;
    // Every illustrative search term that Browse answers with no operator today, whether or not the market data
    // flagged it as a zero-result term (RN.model.market only re-checks the flagged ones)
    const base = RN.data.market.queries.filter((q) => RN.model.search({ q: q.q }).length === 0).map((q) => (
      { key: 'z:' + normQ(q.q), q: q.q, n: Math.max(1, Math.round(q.vol * k)), filters: { roleCategories: q.cat ? [q.cat] : [], industries: q.industry ? [q.industry] : [] }, tags: q.tags || [], cat: q.cat, base: true }));
    const since = nowMs() - days * DAY;
    const groups = new Map();
    (st().events || []).filter((e) => e.type === 'search' && +e.results === 0 && e.results !== '' && e.results != null && ms(e.ts) >= since && (e.persona === 'buyer' || e.persona === 'visitor')).forEach((e) => {
      const key = 'e:' + normQ(e.q) + '|' + JSON.stringify(e.filters || {}) + '|' + arr(e.tags).join(',');
      const g = groups.get(key) || { key, q: String(e.q || '').replace(/\s+/g, ' ').trim(), n: 0, filters: e.filters || {}, tags: arr(e.tags), cat: ((e.filters || {}).roleCategories || [])[0] || '', ts: e.ts, signedIn: e.persona === 'buyer', base: false };
      g.n++;
      if (ms(e.ts) >= ms(g.ts)) { g.ts = e.ts; g.signedIn = e.persona === 'buyer'; }
      groups.set(key, g);
    });
    const live = [...groups.values()].sort((a, b) => ms(b.ts) - ms(a.ts));
    live.forEach((g) => { g.now = RN.model.search({ q: g.q, tags: g.tags, filters: g.filters }).length; });
    return live.concat(base);
  }

  function filterUse(days) {
    const f = funnel(days);
    const base = [['roleCategories', 'sales_leadership', 0.31], ['availability', 'available_now', 0.22], ['revenueRange', '5m_20m', 0.17], ['industries', 'Saas', 0.15],
      ['roleCategories', 'revenue_operations', 0.14], ['revenueRange', '20m_50m', 0.11], ['industries', 'Health Care', 0.09], ['risMin', '70', 0.07], ['hoursPerMonth', '40', 0.06], ['engagementTypes', 'fractional', 0.05]];
    const m = new Map();
    base.forEach(([k, v, sh]) => m.set(k + '|' + v, { k, v, n: Math.round((f.cur.s - f.live.s) * sh) }));
    liveEv('search', days).forEach((e) => {
      filterList(e.filters, e.tags).forEach((x) => { const key = x.k + '|' + x.v; const r = m.get(key) || { k: x.k, v: x.v, n: 0 }; r.n++; m.set(key, r); });
    });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((x) => ({ label: `${fieldName(x.k)}: ${fmtVal(x.k, x.v)}`, short: x.k === 'risMin' ? 'Reputation Index ' + fmtVal(x.k, x.v) : fmtVal(x.k, x.v), value: x.n }));
  }

  const FIRMO = {
    revenueRange: { field: 'companyRevenue', share: { pre_revenue: 0.03, under_1m: 0.08, '1m_5m': 0.21, '5m_20m': 0.31, '20m_50m': 0.24, '50m_plus': 0.13 } },
    employeeRange: { field: 'companyEmployees', share: { '1_10': 0.08, '11_50': 0.26, '51_200': 0.34, '201_500': 0.19, '501_1000': 0.08, '1001_plus': 0.05 } },
  };
  function firmo(days, key) {
    const f = funnel(days);
    const cfg = FIRMO[key];
    const ident = Math.round((f.cur.s - f.live.s) * 0.34);
    const live = liveEv('search', days).filter((e) => e.buyer && e.buyer[key]);
    const rows = RN.fields[cfg.field].options.map((o) => ({ label: o.l, value: Math.round(ident * (cfg.share[o.v] || 0)) + live.filter((e) => e.buyer[key] === o.v).length }));
    return { rows, identified: ident + live.length, total: f.cur.s };
  }

  /* Unmet demand by focus area. Demand comes from RN.model.market() (illustrative query volumes plus live
     searches that used the focus area). Supply is what the Browse focus-area filter returns today. */
  function gapRows() {
    return RN.model.market().tags.map((g) => {
      const tl = g.t.toLowerCase();
      const res = RN.model.search({ tags: [g.t] });
      const verified = res.filter((r) => r.op.tags.some((t) => t.t.toLowerCase() === tl && t.tier !== 'claimed')).length;
      return Object.assign({}, g, { supply: res.length, verified, ratio: Math.round((g.demand / Math.max(1, verified)) * 10) / 10 });
    }).sort((a, b) => b.ratio - a.ratio || b.demand - a.demand).slice(0, 10);
  }

  /* Where client visits start: proof links and the verified badge are operators bringing clients to the
     platform. Illustrative baseline for the window plus live profile views and research clicks. */
  const SOURCES = [
    { k: 'browse', l: 'Browse and search', share: 0.46 },
    { k: 'direct', l: 'Direct link', share: 0.16 },
    { k: 'home', l: 'Homepage', share: 0.12 },
    { k: 'guides', l: 'Guides and research', share: 0.1 },
    { k: 'rates', l: 'Rate Index', share: 0.07 },
    { k: 'proof', l: 'Operator proof links', share: 0.06 },
    { k: 'badge', l: 'Verified badge', share: 0.03 },
  ];
  function sourceOf(src) {
    const x = String(src || 'direct').toLowerCase();
    if (x === 'proof') return 'proof';
    if (x === 'badge' || x === 'verify') return 'badge';
    if (x === 'home') return 'home';
    if (/^rates?/.test(x)) return 'rates';
    if (/^(guide|research|framework|library|report|hub|insights)/.test(x)) return 'guides';
    if (x === 'direct') return 'direct';
    return 'browse';
  }
  function sourceRows(days) {
    const f = funnel(days);
    const base = f.cur.v - f.live.v;
    const live = {};
    liveEv('profile_view', days).forEach((e) => { const k = sourceOf(e.source); live[k] = (live[k] || 0) + 1; });
    liveEv('research_cta', days).forEach((e) => { const k = sourceOf(e.source); live[k] = (live[k] || 0) + 1; });
    (st().leads || []).filter((l) => l && nowMs() - ms(l.ts || l.createdAt || 0) <= days * DAY).forEach((l) => { const k = sourceOf(l.source); live[k] = (live[k] || 0) + 1; });
    const n = Object.values(live).reduce((a, x) => a + x, 0);
    return { rows: SOURCES.map((x) => ({ label: x.l, value: Math.round(base * x.share) + (live[x.k] || 0) })), live: n };
  }

  function demand() {
    const days = ui.days;
    const f = funnel(days);
    const terms = termRows(days);
    const zero = zeroRows(days);
    const gaps = gapRows();
    const src = sourceRows(days);
    const rev = firmo(days, 'revenueRange'), emp = firmo(days, 'employeeRange');
    const recruit = seen().admRecruit || {};
    const nudged = seen().admTagNudged || {};
    const zeroN = zero.reduce((a, z) => a + z.n, 0);
    const win = `last ${days} days`;
    const seg = `<div class="seg" role="group" aria-label="Date range">${[7, 30, 90].map((d) => `<button type="button" class="${days === d ? 'on' : ''}" aria-pressed="${days === d}" data-act="adm-days" data-d="${d}">${d} days</button>`).join('')}</div>`;
    const shownTerms = ui.termsAll ? terms : terms.slice(0, 10);

    return `${head('Demand intelligence', 'What clients search for, what they cannot find, and where supply falls short. Every cut uses the same fields as operator profiles.', seg)}

      <div class="stats-row adm-stats" style="--cols:4">
        <div class="stat"><span class="stat-v">${int(f.cur.s)}</span><span class="stat-l">Client searches, ${win} ${RN.ui.delta(f.cur.s, f.prev.s)}</span></div>
        <div class="stat"><span class="stat-v">${pct(zeroN / Math.max(1, f.cur.s), 1)}</span><span class="stat-l">Zero-result rate · ${int(zeroN)} searches</span></div>
        <div class="stat"><span class="stat-v">${pct(f.cur.v / Math.max(1, f.cur.i), 1)}</span><span class="stat-l">View rate (views per impression)</span></div>
        <div class="stat"><span class="stat-v">${pct(f.cur.r / Math.max(1, f.cur.v), 1)}</span><span class="stat-l">Intro rate (intros per view)</span></div>
      </div>
      ${blendNote()}

      <section class="card adm-sec">
        ${cardHead('Searches that found no one', `The exact query and filters, ${win}. Each term is re-run against Browse, so it stays here only while it still finds no operator. Recruit for it, or ask close operators to add the focus area.`, `<span class="pill pill-bad">${RN.fmt.plural(zero.length, 'term')}</span>${zero.some((z) => z.base) ? illus('Volumes illustrative') : ''}`)}
        ${zero.length ? `<div class="tbl-wrap"><table class="tbl adm-tbl adm-zero adm-stacktbl">
          <thead><tr><th>Query</th><th>Filters applied</th><th class="r">Searches</th><th>Last searched</th><th>Status</th><th><span class="sr-only">Action</span></th></tr></thead>
          <tbody>${zero.map((z) => {
            ctx[z.key] = { kind: 'search', q: z.q, n: z.n, filters: z.filters, tags: z.tags, cat: z.cat, title: z.q ? `“${z.q}”` : 'a filter-only search' };
            const rec = recruit[z.key];
            return `<tr>
              <td class="adm-w"><span class="adm-q">${z.q ? '“' + esc(z.q) + '”' : '<span class="muted">No keywords</span>'}</span>${z.base ? '' : `<span class="pill pill-accent adm-live">Live</span>`}</td>
              <td class="adm-w">${filterChips(z.filters, z.base ? [] : z.tags)}</td>
              <td class="r tnum" data-l="Searches">${int(z.n)}</td>
              <td class="small" data-l="Last searched">${z.base ? '<span class="muted">Across the period</span>' : `${esc(RN.fmt.ago(z.ts))}<span class="tiny muted adm-block">${z.signedIn ? 'Signed-in client' : 'Visitor, not signed in'}</span>`}${!z.base && z.now ? `<span class="tiny accent adm-block">${RN.fmt.plural(z.now, 'operator')} match now</span>` : ''}</td>
              <td data-l="Status">${rec ? `<span class="pill pill-good">${icon('check')}Recruiting${rec.nudged ? ' · ' + rec.nudged + ' nudged' : ''}</span>` : !z.base && z.now ? `<span class="pill pill-info">${RN.fmt.plural(z.now, 'match', 'matches')} now</span>` : '<span class="pill pill-bad">No match</span>'}</td>
              <td class="r adm-act-cell"><button type="button" class="btn btn-sm btn-line" data-act="adm-recruit" data-k="${esc(z.key)}" aria-label="${esc((rec ? 'Edit recruiting note for ' : 'Recruit for ') + (z.q ? '“' + z.q + '”' : 'this filter-only search'))}">${rec ? 'Edit note' : 'Recruit'}</button></td>
            </tr>`;
          }).join('')}</tbody></table></div>
          <p class="tiny muted adm-foot">Rows marked Live come from searches in this session. The rest are illustrative search terms with 30-day volumes scaled to the date range; each one returns no operator in Browse today.</p>`
        : RN.ui.empty({ icon: 'search', title: 'Every search found someone', body: 'Zero-result searches from Browse land here with the exact query and filters.' })}
      </section>

      <section class="card adm-sec">
        ${cardHead('Search to intro funnel', `Search performed, operator shown, profile opened, intro requested. ${win[0].toUpperCase() + win.slice(1)}.`, illus())}
        ${chartSlot('dm-funnel', (w) => funnelChart(f.steps, w), 140)}
        <p class="tiny muted adm-foot">${int(f.cur.s)} searches. Illustrative baseline plus ${RN.fmt.plural(f.liveN, 'live event')} from this session. Operator and team activity is excluded.</p>
      </section>

      <section class="card adm-sec">
        ${cardHead('Top search terms', `Normalized to one term per search (AP-05), so spelling and case variants count once. Results is what Browse returns for the term today.`, illus())}
        <div class="tbl-wrap"><table class="tbl adm-tbl adm-terms">
          <thead><tr><th>#</th><th>Search term</th><th class="r">Searches</th><th class="r">Results</th><th class="r adm-hide-m">Impressions</th><th class="r adm-hide-m">Views</th><th class="r">View rate</th><th class="r adm-hide-m">Intros</th><th class="r">Intro rate</th></tr></thead>
          <tbody>${shownTerms.map((x, i) => `<tr>
            <td class="tnum muted">${i + 1}</td>
            <td><span class="adm-term">${esc(x.q)}</span>${x.live ? `<span class="pill pill-accent adm-live">${x.live} live</span>` : ''}${x.variants.size > 1 ? `<span class="tiny muted adm-block">${x.variants.size} spellings merged</span>` : ''}</td>
            <td class="r tnum">${int(x.s)}</td>
            <td class="r tnum${x.supply ? '' : ' adm-bad'}">${int(x.supply)}${x.verified != null ? `<span class="tiny muted adm-block">${int(x.verified)} verified</span>` : ''}</td>
            <td class="r tnum adm-hide-m">${int(x.imp)}</td>
            <td class="r tnum adm-hide-m">${int(x.views)}</td>
            <td class="r tnum">${x.imp ? pct(x.views / x.imp, 1) : 'N/A'}</td>
            <td class="r tnum adm-hide-m">${int(x.intros)}</td>
            <td class="r tnum">${x.views ? pct(x.intros / x.views, 1) : 'N/A'}</td>
          </tr>`).join('')}</tbody></table></div>
        ${terms.length > 10 ? `<button type="button" class="act adm-more" data-act="adm-terms-all">${ui.termsAll ? 'Show top 10' : `Show all ${terms.length}`}${icon(ui.termsAll ? 'chev-up' : 'chev-down')}</button>` : ''}
      </section>

      <section class="card adm-sec">
        ${cardHead('Unmet demand by focus area', 'Monthly searches per client-verified operator. High numbers mean clients look for this and few operators can prove it. Supply is what the Browse focus-area filter returns today.', illus('Searches illustrative'))}
        <div class="tbl-wrap"><table class="tbl adm-tbl adm-gaps adm-stacktbl">
          <thead><tr><th>Focus area</th><th class="r">Searches / mo</th><th class="r">In Browse</th><th class="r">Verified</th><th>Per verified operator</th><th><span class="sr-only">Action</span></th></tr></thead>
          <tbody>${gaps.map((g) => {
            const tl = g.t.toLowerCase();
            const claimers = liveOps().filter((o) => o.tags.some((t) => t.t.toLowerCase() === tl && t.tier === 'claimed'));
            const key = 'tag:' + g.t;
            ctx[key] = { kind: 'tag', tags: [g.t], cat: g.c, n: g.demand, title: `“${g.t}”` };
            const nd = nudged[g.t];
            const mx = gaps[0].ratio || 1;
            return `<tr>
              <td class="adm-w"><b class="adm-term">${esc(g.t)}</b><span class="tiny muted adm-block adm-cat">${g.c ? RN.ui.catDot(g.c) : ''}${esc(g.c ? catLabel(g.c) : 'No role category')}</span></td>
              <td class="r tnum" data-l="Searches / mo">${int(g.demand)}</td>
              <td class="r tnum" data-l="In Browse">${int(g.supply)}</td>
              <td class="r tnum" data-l="Verified">${int(g.verified)}</td>
              <td class="adm-w" data-l="Per verified operator"><div class="adm-ratio"><span class="meter"><i style="width:${Math.max(3, (g.ratio / mx) * 100).toFixed(1)}%"></i></span><b class="tnum">${int(g.ratio)}</b></div></td>
              <td class="r adm-act-cell">${nd ? `<span class="pill pill-good">${icon('check')}${nd.n} nudged</span>`
                : claimers.length ? `<button type="button" class="btn btn-sm btn-line" data-act="adm-nudge-tag" data-t="${esc(g.t)}" title="Email the ${claimers.length} operators who claim it but have no client review confirming it">Ask ${claimers.length} to verify</button>`
                : `<button type="button" class="btn btn-sm btn-line" data-act="adm-recruit" data-k="${esc(key)}">Recruit</button>`}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
        <p class="tiny muted adm-foot">A nudge emails every operator who claims the focus area but has no client review confirming it, and points them to Studio to request one. Studio Positioning uses the same demand figures.</p>
      </section>

      <section class="card adm-sec">
        ${cardHead('Clients by source', `Where client visits to profiles started, ${win}. Proof links and the verified badge are operators bringing clients to the platform.`, illus())}
        ${chartSlot('dm-src', (w) => barsChart(src.rows, w, { labelW: 180, label: 'Client visits by source' }), 240)}
        <p class="tiny muted adm-foot">Illustrative baseline plus ${RN.fmt.plural(src.live, 'live visit')} from this session (profile views by source and clicks from research pages into Browse).</p>
      </section>

      <div class="adm-grid">
        <section class="card adm-sec">
          ${cardHead('Filters clients apply most', `Browse filters by type and value, ${win}.`, illus())}
          ${chartSlot('dm-filters', (w) => barsChart(filterUse(days), w, { label: 'Filters applied' }), 260)}
        </section>
        <section class="card adm-sec">
          ${cardHead('Who is searching', `Company revenue and employee range of signed-in clients, from the same picklists as operator intake (AP-25).`, illus())}
          <span class="label">Revenue range</span>
          ${chartSlot('dm-rev', (w) => barsChart(rev.rows, w, { labelW: 110, label: 'Searches by company revenue' }), 200)}
          <span class="label adm-gap-t">Employee range</span>
          ${chartSlot('dm-emp', (w) => barsChart(emp.rows, w, { labelW: 110, label: 'Searches by employee range' }), 200)}
          <p class="tiny muted adm-foot">Based on the ${pct(rev.identified / Math.max(1, rev.total))} of searches from signed-in clients. Clients give company name and revenue range at sign-up; employee range and industry unlock Match Signals.</p>
        </section>
      </div>`;
  }

  /* =====================================================================================
     APPROVALS
     ===================================================================================== */
  function approvals() {
    const q = queue().slice().sort((a, b) => ms(a.submittedAt) - ms(b.submittedAt));
    const decided = apps().filter((a) => ['live', 'rejected'].includes(statusOf(a))).sort((a, b) => ms(b.liveAt || b.decidedAt || 0) - ms(a.liveAt || a.decidedAt || 0));
    return `${head('Operator approvals', `${q.length ? RN.fmt.plural(q.length, 'application') + ' waiting' : 'No applications waiting'}. We review every application within 2 business days.`)}
      <ol class="adm-flow" aria-label="How approval works">
        <li><span class="adm-flow-n">1</span><div><b>Approve profile</b><span>Identity, work history and fit tags checked by the team.</span></div></li>
        <li><span class="adm-flow-n">2</span><div><b>Generate score</b><span>Reputation Index set to 50. The profile goes live in Browse at Vetted.</span></div></li>
        <li><span class="adm-flow-n">3</span><div><b>Activation emails</b><span>A0 welcome sends now; A1 to A5 follow over 30 days.</span></div></li>
      </ol>
      ${q.length ? q.map(appCard).join('') : RN.ui.empty({ icon: 'seal', title: 'No applications waiting', body: 'New operator applications from the intake flow land here, with an automatic check of rate, duplicates and tags.', cta: '<a class="btn btn-sm btn-line" href="#join.operator">See the operator intake</a>' })}
      ${decided.length ? `<section class="card adm-sec">${cardHead('Recently decided', 'Approved profiles are live in Browse. Rejected applicants were emailed the reason.')}
        <ul class="adm-decided">${decided.map((a) => {
          const p = prof(a);
          const op = statusOf(a) === 'live' ? RN.model.byId(a.opId) : null;
          return `<li>${RN.ui.avatar({ name: p.name, initials: RN.fmt.initials(p.name) }, 'ava-sm')}<div class="grow"><b>${esc(p.name)}</b><span class="tiny muted">${esc(p.role)} · ${esc(catLabel(p.roleCategory))}</span></div>
            ${op ? `${RN.ui.statusPill('application', 'live', `Live at ${op.ris.label} ${op.ris.score}`)}<span class="tiny muted nowrap adm-hide-m">${esc(RN.fmt.ago(a.liveAt))}</span><a class="btn btn-sm btn-line" href="#op.${esc(op.slug)}">View profile</a>`
            : `${RN.ui.statusPill('application', 'rejected')}<span class="tiny muted nowrap adm-hide-m">${esc(RN.fmt.ago(a.decidedAt || a.submittedAt))}</span><button type="button" class="btn btn-sm btn-line" data-act="adm-reopen" data-id="${esc(a.id)}">Reopen</button>`}
          </li>`;
        }).join('')}</ul></section>` : ''}`;
  }

  function appCard(a) {
    const p = prof(a);
    const op = buildOp(a);
    const status = statusOf(a);
    const due = addBiz(a.submittedAt || RN.now(), 2);
    const lateBy = nowMs() - due.getTime();
    const missing = RN.model.checklist(op).filter((x) => !x.done);
    const kv = [
      ['Role category', catLabel(p.roleCategory)],
      ['Role', p.role],
      [RN.fields.availability.label, RN.w.label('availability', p.availability)],
      [RN.fields.hoursPerMonth.label, p.hoursPerMonth ? RN.w.label('hoursPerMonth', p.hoursPerMonth) : 'N/A'],
      [RN.fields.rate.label, p.rate ? RN.fmt.rate(p.rate) : 'N/A'],
      ['Location', p.location || 'N/A'],
      p.timezone && ['Time zone', p.timezone],
      p.usHours && [RN.fields.usHours.label, RN.w.label('usHours', p.usHours)],
      [RN.fields.revenueRange.label, RN.w.labels('revenueRange', p.revenueRange) || 'N/A'],
      [RN.fields.employeeRange.label, RN.w.labels('employeeRange', p.employeeRange) || 'N/A'],
      !roleKeys(p.roleCategory).includes('salesMotions') && [RN.fields.salesMotions.label, RN.w.labels('salesMotions', p.salesMotions) || 'N/A'],
    ].filter(Boolean);
    const rk = roleKeys(p.roleCategory);
    const rdRows = rk.map((k) => ({ l: RN.fields[k].label, v: appRoleText(a, k) }));
    return `<article class="card adm-app" aria-label="Application from ${esc(p.name)}">
      <div class="adm-app-hd">
        ${RN.ui.avatar({ name: p.name, initials: RN.fmt.initials(p.name), photo: p.photo }, 'ava-md')}
        <div class="grow">
          <div class="row" style="--gap:8px"><h2 class="h3 adm-app-name">${esc(p.name)}</h2>
            ${RN.ui.statusPill('application', status, { approved: 'Profile approved', in_review: 'In review', changes_requested: 'Changes requested' }[status])}</div>
          <div class="adm-app-role">Fractional ${esc(p.role)}</div>
          <div class="adm-app-meta"><span>${icon('mail')}${esc(p.email || 'No email')}</span><span>${icon('clock')}Submitted ${esc(RN.fmt.ago(a.submittedAt))}</span>
            <span class="${lateBy > 0 ? 'adm-late' : ''}">${icon('calendar')}${lateBy > 0 ? `Review overdue by ${dur(lateBy)}` : `Review by ${esc(RN.fmt.dateShort(due))}`}</span></div>
        </div>
      </div>
      ${p.headline ? `<div class="adm-hl"><span class="label">${esc(RN.fields.headline.label)}</span><p>${esc(p.headline)}</p></div>` : '<p class="note">No headline yet. Clients read it first in search.</p>'}
      <div class="adm-app-body">
        <div class="stack" style="--gap:18px">
          <dl class="adm-kv">${kv.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
            <div class="full"><dt>${esc(RN.fields.industries.label)}</dt><dd>${esc(RN.w.labels('industries', p.industries) || 'N/A')}</dd></div>
          </dl>
          ${rk.length ? `<div class="adm-rd"><span class="label">Role details · ${esc(catLabel(p.roleCategory))} · ${rdRows.filter((r) => r.v).length} of ${rk.length} answered</span>
            <dl class="adm-kv">${rdRows.map((r) => `<div><dt>${esc(r.l)}</dt><dd>${r.v ? esc(r.v) : '<span class="muted">Not answered</span>'}</dd></div>`).join('')}</dl></div>` : ''}
          <div><span class="label">${esc(RN.fields.fitTags.label)} · ${p.fitTags.length}</span><div class="opc-tags adm-tags">${p.fitTags.map((x) => RN.ui.ftag({ t: x, tier: 'claimed' })).join('') || '<span class="small muted">None yet</span>'}</div></div>
        </div>
        <div class="adm-check">
          <div class="adm-cmp-hd"><span class="label">Profile strength</span><b class="num">${op.completeness}%</b></div>
          <span class="meter"><i style="width:${op.completeness}%"></i></span>
          ${missing.length ? `<p class="tiny muted">Missing: ${esc(missing.slice(0, 4).map((x) => x.l.toLowerCase().replace(/\byour\b/g, 'their')).join(', '))}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}.</p>` : ''}
          <span class="label">Checks</span>
          ${flagList(appFlags(a, op))}
        </div>
      </div>
      <div class="adm-steps">
        <div class="adm-step ${status === 'approved' ? 'done' : ''}">
          <span class="n">Step 1</span>
          ${status === 'approved' ? `<b>${icon('check-circle')}Profile approved</b><span class="tiny muted">${esc(RN.fmt.ago(a.approvedAt || RN.now()))}</span>`
          : `<b>Approve profile</b><span class="tiny muted">Confirms identity and work history.</span><button type="button" class="btn btn-sm" data-act="adm-approve" data-id="${esc(a.id)}">${icon('check')}Approve profile</button>`}
        </div>
        <div class="adm-step ${status === 'approved' ? 'is-next' : 'is-wait'}">
          <span class="n">Step 2</span>
          <b>Generate score</b><span class="tiny muted">Sets the Reputation Index to 50 and puts ${esc(p.first)} live in Browse at Vetted.</span>
          ${status === 'approved' ? `<button type="button" class="btn btn-sm" data-act="adm-score" data-id="${esc(a.id)}">${icon('bolt')}Generate score</button>` : '<span class="tiny muted adm-wait">Available after step 1</span>'}
        </div>
      </div>
      <div class="adm-app-ft">
        <button type="button" class="btn btn-sm btn-line" data-act="adm-preview" data-id="${esc(a.id)}">${icon('eye')}Preview card</button>
        <button type="button" class="btn btn-sm btn-line" data-act="adm-changes" data-id="${esc(a.id)}">${icon('edit')}Request changes</button>
        <span class="grow"></span>
        <button type="button" class="btn btn-sm btn-ghost adm-danger" data-act="adm-reject" data-id="${esc(a.id)}">Reject</button>
      </div>
    </article>`;
  }

  /* =====================================================================================
     INTROS
     ===================================================================================== */
  const NEXT = {
    pending: (op) => ({ label: `Nudge ${op.first}`, short: 'Nudge', act: 'adm-intro-nudge', icon: 'send' }),
    interested: () => ({ label: 'Mark RN Qualified', short: 'Qualify', act: 'adm-intro-next', to: 'rn_qualified', icon: 'check' }),
    rn_qualified: () => ({ label: 'Introduce', short: 'Introduce', act: 'adm-introduce', icon: 'handshake' }),
    introduced: () => ({ label: 'Mark hired', short: 'Mark hired', act: 'adm-intro-next', to: 'hired', icon: 'briefcase' }),
  };
  function clockPill(i) {
    const c = clock(i);
    if (!c) {
      if (i.status === 'rn_qualified') return RN.ui.statusPill('intro', 'rn_qualified', 'Ready to introduce');
      if (i.status === 'introduced') return RN.ui.statusPill('intro', 'introduced', `Introduced ${RN.fmt.ago(lastTs(i))}`);
      if (i.status === 'hired') return RN.ui.statusPill('intro', 'hired', `Hired ${RN.fmt.dateShort(lastTs(i))}`);
      return '';
    }
    if (c.who === 'op') return c.late ? `<span class="pill pill-bad">${icon('clock')}Overdue ${dur(-c.left)}</span>` : `<span class="pill ${c.left < 12 * HOUR ? 'pill-warn' : ''}">${icon('clock')}${dur(c.left)} left to reply</span>`;
    return c.late ? `<span class="pill pill-bad" title="The team qualifies within one business day">${icon('clock')}Overdue ${dur(-c.left)}</span>` : `<span class="pill pill-warn">${icon('clock')}Qualify in ${dur(c.left)}</span>`;
  }
  function introCard(i) {
    const op = RN.model.byId(i.opId);
    if (!op) return '';
    const b = i.buyer || {};
    const co = b.company || {};
    const sum = RN.intro.summary(i, false);
    const c = clock(i);
    const nx = NEXT[i.status] && NEXT[i.status](op);
    const nudged = (seen().admNudged || {})[i.id];
    return `<article class="adm-icard${c && c.late ? ' is-late' : ''}">
      <div class="adm-icard-top">${RN.ui.avatar(op, 'ava-sm')}<div class="grow"><a class="adm-op-n" href="#op.${esc(op.slug)}">${esc(op.name)}</a><span class="tiny muted">${esc(op.role)}</span></div></div>
      <div class="adm-icard-co"><b>${esc(co.name || 'Client')}</b><span class="tiny muted">${esc([RN.w.label('industry', co.industry), co.revenueRange && RN.w.label('companyRevenue', co.revenueRange), co.employeeRange && RN.w.label('companyEmployees', co.employeeRange) + ' employees'].filter(Boolean).join(' · '))}</span></div>
      ${sum.need ? `<p class="small adm-icard-need">${esc(sum.need)}</p>` : ''}
      ${sum.scope ? `<p class="tiny muted">${esc(sum.scope)}</p>` : ''}
      ${c ? `<span class="adm-clock"><i style="width:${(c.frac * 100).toFixed(0)}%"></i></span>` : ''}
      <div class="row between adm-icard-meta">${clockPill(i)}${nudged ? `<span class="tiny muted">Nudged ${esc(RN.fmt.ago(nudged))}</span>` : ''}</div>
      <div class="row adm-icard-act" style="--gap:8px">
        ${nx ? `<button type="button" class="btn btn-sm${i.status === 'pending' && !(c && c.late) ? ' btn-line' : ''}" data-act="${nx.act}" data-id="${esc(i.id)}"${nx.to ? ` data-to="${nx.to}"` : ''} title="${esc(nx.label)}"><span class="adm-lbl-s">${esc(nx.short)}</span><span class="adm-lbl-l">${esc(nx.label)}</span></button>` : ''}
        <button type="button" class="act" data-act="adm-intro-open" data-id="${esc(i.id)}">Details</button>
      </div>
    </article>`;
  }
  function introsTab() {
    const all = intros();
    const open = all.filter((i) => !['hired', 'declined'].includes(i.status));
    const late = all.filter((i) => { const c = clock(i); return c && c.late; });
    const team = all.filter((i) => i.status === 'interested' || i.status === 'rn_qualified');
    const introduced30 = all.filter((i) => ['introduced', 'hired'].includes(i.status) && nowMs() - ms(lastTs(i)) <= 30 * DAY).length;
    const cols = RN.intro.steps;
    const declined = all.filter((i) => i.status === 'declined');
    return `${head('Intro pipeline', 'Every intro request, from the client’s ask to a hire. Operators see requests blind until you introduce them.')}
      <div class="stats-row adm-stats" style="--cols:4">
        <div class="stat"><span class="stat-v">${open.length}</span><span class="stat-l">Open requests</span></div>
        <div class="stat"><span class="stat-v ${late.length ? 'adm-bad' : ''}">${late.length}</span><span class="stat-l">Past their clock</span></div>
        <div class="stat"><span class="stat-v">${team.length}</span><span class="stat-l">Waiting on the team</span></div>
        <div class="stat"><span class="stat-v">${introduced30}</span><span class="stat-l">Introduced, last 30 days</span></div>
      </div>
      ${all.length ? `<div class="adm-board" role="list">${cols.map((s) => {
        const list = all.filter((i) => i.status === s).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
        return `<section class="adm-col" role="listitem" aria-label="${esc(RN.w.label('introStatus', s))}">
          <header class="adm-col-hd">${RN.ui.statusPill('intro', s)}<span class="tnum muted">${list.length}</span></header>
          ${list.length ? list.map(introCard).join('') : `<p class="tiny muted adm-col-empty">${esc({ pending: 'No requests waiting on an operator.', interested: 'Nothing to qualify.', rn_qualified: 'Nothing to introduce.', introduced: 'No open introductions.', hired: 'No hires yet.' }[s])}</p>`}
        </section>`;
      }).join('')}</div>` : RN.ui.empty({ icon: 'handshake', title: 'No intro requests yet', body: 'Clients request intros from profiles, compare and their shortlist.', cta: '<a class="btn btn-sm btn-line" href="#browse">Open Browse</a>' })}
      <p class="tiny muted">The operator has 72 hours to reply. After “Interested”, the team qualifies within one business day, then introduces both sides by email, which reveals names.</p>
      ${declined.length ? `<section class="card adm-sec">${cardHead('Declined', 'The client was emailed two operators with the same fit.')}
        <ul class="adm-decided">${declined.map((i) => { const op = RN.model.byId(i.opId); const th = (i.thread || []).slice(-1)[0]; return `<li>${RN.ui.avatar(op, 'ava-sm')}<div class="grow"><b>${esc(op ? op.name : 'Operator')}</b><span class="tiny muted">${esc(((i.buyer || {}).company || {}).name || 'Client')}${th && th.text && th.text !== 'Declined' ? ' · ' + esc(th.text) : ''}</span></div><span class="tiny muted nowrap">${esc(RN.fmt.ago(lastTs(i)))}</span><button type="button" class="act" data-act="adm-intro-open" data-id="${esc(i.id)}">Details</button></li>`; }).join('')}</ul></section>` : ''}`;
  }

  /* =====================================================================================
     PROJECTS
     ===================================================================================== */
  function projectsTab() {
    const list = liveProjects().slice().sort((a, b) => (projInfo(b).flag - projInfo(a).flag) || ms(a.postedAt || a.createdAt) - ms(b.postedAt || b.createdAt));
    const flagged = list.filter((p) => projInfo(p).flag).length;
    return `${head('Client projects', `${RN.fmt.plural(list.length, 'live project')}${flagged ? ` · ${flagged} with no interested operator after 72 hours` : ''}. Add up to three suggested operators to any project, ranked by Match Signals. The client decides.`)}
      ${list.length ? `<div class="stack" style="--gap:16px">${list.map(projCard).join('')}</div>`
      : RN.ui.empty({ icon: 'briefcase', title: 'No live projects', body: 'Projects clients post from a Blueprint appear here with invites, responses and the 72-hour flag.', cta: '<a class="btn btn-sm btn-line" href="#projects">Open projects</a>' })}`;
  }
  function projCard(p) {
    const info = projInfo(p);
    const f = p.fields || {};
    const c = projClient(p);
    const sug = p.suggested || [];
    const left = Math.max(0, 3 - sug.length);
    const scope = [f.engagementType && RN.w.label('engagementType', f.engagementType), f.hoursPerMonth && RN.w.label('hoursPerMonth', f.hoursPerMonth), f.term && RN.w.label('term', f.term), f.startBy && 'Start ' + RN.w.label('startBy', f.startBy).toLowerCase()].filter(Boolean).join(' · ');
    return `<article class="card adm-proj${info.flag ? ' is-late' : ''}">
      <div class="adm-proj-hd">
        <div class="grow"><div class="row" style="--gap:8px">${f.roleCategory ? `<span class="pill">${RN.ui.catDot(f.roleCategory)}${esc(catLabel(f.roleCategory))}</span>` : ''}${RN.ui.statusPill('project', p.status)}${info.flag ? `<span class="pill pill-bad">${icon('flag')}No interested operator in 72 hrs</span>` : ''}</div>
          <h2 class="h4 adm-proj-t"><a href="#project.${esc(p.id)}">${esc(p.title || 'Untitled project')}</a></h2>
          <p class="small muted">${esc(c.company || c.name)}${scope ? ' · ' + esc(scope) : ''}</p></div>
      </div>
      <div class="adm-proj-stats">
        <div><span class="label">Since posting</span><b class="num ${info.flag ? 'adm-bad' : ''}">${int(Math.round(info.hrs))} hrs</b><span class="tiny muted">${info.hrs >= 48 ? Math.round(info.hrs / 24) + ' days · ' : ''}flag at 72 hrs</span></div>
        <div><span class="label">Invited</span><b class="num">${info.invited}</b><span class="tiny muted">${sug.length ? sug.length + ' by Revenue Nomad' : 'by the client'}</span></div>
        <div><span class="label">Interested</span><b class="num ${info.flag ? 'adm-bad' : ''}">${info.interested}</b><span class="tiny muted">${info.declined ? info.declined + ' passed' : 'responses'}</span></div>
        <div><span class="label">Suggestions left</span><b class="num">${left}</b><span class="tiny muted">of 3</span></div>
      </div>
      ${(p.responses || []).length ? `<ul class="adm-resp">${(p.responses || []).map((r) => { const o = RN.model.byId(r.opId); if (!o) return ''; return `<li>${RN.ui.avatar(o, 'ava-xs')}<a class="adm-op-n" href="#op.${esc(o.slug)}">${esc(o.name)}</a><span class="pill ${r.status === 'interested' ? 'pill-good' : ''}">${esc(r.status === 'interested' ? 'Interested' : 'Passed')}</span>${r.rate ? `<span class="tiny muted">${esc(RN.fmt.rate(r.rate))}</span>` : ''}${(p.suggested || []).includes(o.id) ? '<span class="tiny accent">Suggested by Revenue Nomad</span>' : ''}<span class="tiny muted adm-hide-m">${esc(RN.fmt.ago(r.ts))}</span></li>`; }).join('')}</ul>` : ''}
      <div class="adm-app-ft">
        ${sug.length ? `<span class="ava-stack">${sug.map((id) => RN.ui.avatar(RN.model.byId(id), 'ava-sm')).join('')}</span><span class="tiny muted">${RN.fmt.plural(sug.length, 'operator')} suggested by Revenue Nomad</span>` : ''}
        <span class="grow"></span>
        <a class="btn btn-sm btn-line" href="#project.${esc(p.id)}">View project</a>
        ${left ? `<button type="button" class="btn btn-sm" data-act="adm-suggest" data-id="${esc(p.id)}">${icon('plus')}Add suggested operators</button>` : '<span class="pill pill-good">3 suggested</span>'}
      </div>
    </article>`;
  }

  /* =====================================================================================
     DIRECTORY
     ===================================================================================== */
  const appLive = (id) => { const a = appById(id); return !!a && statusOf(a) === 'live'; };
  const inDir = (o) => !o.admin || appLive(o.admin.appId);
  const editedBy = (o) => { const e = (st().edits || {})[o.id]; return e && e._log && e._log.length ? e._log[e._log.length - 1] : null; };
  const tierPill = (op) => { const l = op.ris.label; return `<span class="pill ${l === 'Apex' || l === 'Elite' ? 'pill-gold' : l === 'Trusted' || l === 'Proven' ? 'pill-good' : l === 'Vetted' ? 'pill-accent' : ''}">${esc(l)}</span>`; };
  function dirRows() {
    const q = ui.dirQ.trim().toLowerCase();
    let ops = RN.model.ops.filter(inDir);
    if (ui.dirSeg === 'hidden') ops = ops.filter((o) => o.hidden);
    else if (ui.dirSeg === 'work') ops = ops.filter((o) => o.completeness < 60);
    else if (ui.dirSeg === 'edited') ops = ops.filter((o) => editedBy(o));
    if (ui.dirCat) ops = ops.filter((o) => o.catKey === ui.dirCat);
    if (q) ops = ops.filter((o) => [o.name, o.role, o.cat, o.location, o.headline, o.tags.map((t) => t.t).join(' ')].join(' ').toLowerCase().includes(q));
    const by = { ris: (a, b) => b.ris.score - a.ris.score || a.name.localeCompare(b.name), complete: (a, b) => a.completeness - b.completeness || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name), recent: (a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || b.ris.score - a.ris.score }[ui.dirSort];
    ops.sort(by);
    if (q) ops.sort((a, b) => (a.name.toLowerCase().includes(q) ? 0 : 1) - (b.name.toLowerCase().includes(q) ? 0 : 1));
    return ops;
  }
  function dirTable() {
    const rows = dirRows();
    const shown = rows.slice(0, ui.dirLimit);
    if (!rows.length) return RN.ui.empty({ icon: 'search', title: 'No operators match', body: 'Try a different name, role or focus area, or clear the role category.', cta: '<button type="button" class="btn btn-sm btn-line" data-act="adm-dir-reset">Clear search and filters</button>' });
    return `<p class="small muted adm-dir-count">${RN.fmt.plural(rows.length, 'operator')}${rows.length > shown.length ? `, showing ${shown.length}` : ''}</p>
      <div class="tbl-wrap"><table class="tbl adm-tbl adm-dir adm-stacktbl">
      <thead><tr><th>Operator</th><th class="r">Reputation</th><th>Profile strength</th><th class="r adm-hide-m">Verified tags</th><th class="adm-hide-m">Availability · rate</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${shown.map((o) => {
        const v = o.tags.filter((t) => t.tier !== 'claimed').length;
        const ed = editedBy(o);
        return `<tr class="${o.hidden ? 'is-hidden' : ''}">
          <td class="adm-w"><div class="adm-op">${RN.ui.avatar(o, 'ava-sm')}<div class="grow"><a class="adm-op-n" href="#op.${esc(o.slug)}">${esc(o.name)}</a><span class="tiny muted">${esc(o.role)} · ${esc(o.cat)}</span>
            <span class="adm-op-pills">${o.hidden ? `<span class="pill pill-bad">${icon('eye-off')}Hidden from search</span>` : ''}${o.admin ? '<span class="pill pill-accent">New</span>' : ''}${ed ? `<span class="pill pill-info" title="${esc(ed.fields.join(', '))}">Edited by team ${esc(RN.fmt.dateShort(ed.ts))}</span>` : ''}</span></div></div></td>
          <td class="r" data-l="Reputation"><span class="adm-ris"><b class="num">${esc(o.ris.score)}</b>${tierPill(o)}</span></td>
          <td data-l="Profile strength"><div class="adm-ratio adm-cmp"><span class="meter"><i style="width:${o.completeness}%"></i></span><b class="tnum">${o.completeness}%</b></div></td>
          <td class="r tnum adm-hide-m">${v}<span class="muted"> / ${o.tags.length}</span></td>
          <td class="small adm-hide-m adm-av">${RN.ui.avail(o, { hours: false })}<span class="tiny muted adm-block">${o.rate ? esc(RN.fmt.rate(o.rate)) : 'No rate listed'}</span></td>
          <td class="r adm-act-cell"><div class="adm-rowact">
            <a class="act" href="#op.${esc(o.slug)}">View</a>
            <button type="button" class="act" data-act="adm-edit" data-id="${esc(o.id)}">Edit</button>
            <button type="button" class="act ${o.hidden ? '' : 'muted'}" data-act="adm-hide" data-id="${esc(o.id)}">${o.hidden ? 'Unhide' : 'Hide'}</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<button type="button" class="btn btn-line btn-sm adm-more" data-act="adm-dir-more">Show ${Math.min(25, rows.length - shown.length)} more</button>` : ''}`;
  }
  function directory() {
    const all = RN.model.ops.filter(inDir);
    const hidden = all.filter((o) => o.hidden).length;
    const segs = [['all', 'All'], ['work', 'Profile under 60%'], ['edited', 'Edited by team'], ['hidden', `Hidden${hidden ? ' (' + hidden + ')' : ''}`]];
    return `${head('Operator directory', `${RN.fmt.plural(all.length - hidden, 'operator')} in search${hidden ? `, ${hidden} hidden` : ''}. Edit a profile on the operator’s behalf, or hide it from search. Hidden profiles stay reachable by direct link.`)}
      <section class="card adm-sec adm-dir-card">
        <div class="adm-dir-ctl">
          <div class="input-wrap adm-dir-q">${icon('search')}<input class="input" type="search" placeholder="Search name, role, location or focus area" value="${esc(ui.dirQ)}" data-input="adm-dir-q" aria-label="Search operators"></div>
          <div class="row" style="--gap:10px">
            <div class="seg adm-seg" role="group" aria-label="Show">${segs.map(([k, l]) => `<button type="button" class="${ui.dirSeg === k ? 'on' : ''}" aria-pressed="${ui.dirSeg === k}" data-act="adm-dir-seg" data-s="${k}">${esc(l)}</button>`).join('')}</div>
            <label class="adm-sort"><span class="sr-only">Sort by</span><select class="select" data-change="adm-dir-sort" aria-label="Sort by">${[['ris', 'Reputation Index'], ['complete', 'Weakest profile first'], ['name', 'Name'], ['recent', 'Newly approved first']].map(([k, l]) => `<option value="${k}" ${ui.dirSort === k ? 'selected' : ''}>Sort: ${esc(l)}</option>`).join('')}</select></label>
          </div>
          <div class="adm-dir-cats" data-deselect>${RN.w.control('roleCategory', ui.dirCat, { name: 'adm-dir-cat', id: 'adm-dir-cat', change: 'adm-dir-cat' })}</div>
        </div>
        <div data-adm-dir>${dirTable()}</div>
      </section>`;
  }
  function refreshDir() { const box = RN.$('[data-adm-dir]'); if (box) box.innerHTML = dirTable(); }

  /* =====================================================================================
     EMAILS: activation drip A0-A5 (L478), team alerts (AP-03, AP-04), outbox
     ===================================================================================== */
  const DRIP = [
    { k: 'A0', day: 0, subj: 'You are live on Revenue Nomad at Vetted 50', purpose: 'Welcome. What the Reputation Index measures and the one action worth the most points next.', skipL: 'Always sends, the moment the score is generated.', skip: null, gain: null },
    { k: 'A1', day: 3, subj: 'Two client reviews move you past Vetted', purpose: 'Ask two past clients for a CORE review. Each review verifies the fit tags the client confirms.', skipL: 'Skips if the operator has 2 or more reviews.', skip: (op) => op.reviews.length >= 2, gain: 'review', per: 'per review' },
    { k: 'A2', day: 8, subj: 'Add your engagements, each with a work sample', purpose: 'Engagement History proves stage and deal-size fit, the top hiring factor for clients.', skipL: 'Skips if 3 or more engagements are logged.', skip: (op) => op.engagements.length >= 3, gain: 'engagement', per: 'per engagement' },
    { k: 'A3', day: 14, subj: 'Record a 60-second intro video', purpose: 'A short video in the operator’s own words helps them stand out and completes the profile factor.', skipL: 'Skips if the profile has a video.', skip: (op) => !!op.video, gain: 'complete', per: 'profile factor' },
    { k: 'A4', day: 24, subj: 'Share your profile where clients already look', purpose: 'Share the profile on LinkedIn or a blog post, and send a tracked proof link to a prospect.', skipL: 'Skips if the operator has created a proof link.', skip: (op) => (st().proofLinks || []).some((x) => x.opId === op.id), gain: 'recent', per: 'engagement recency' },
    { k: 'A5', day: 30, subj: 'Your first 30 days on Revenue Nomad', purpose: 'A personal scorecard: impressions, profile views, the searches that found them, Reputation Index change and the next best action.', skipL: 'Always sends.', skip: null, gain: null },
  ];
  function dripBody(k, op) {
    const f = op.first;
    const miss = RN.model.checklist(op).filter((x) => !x.done).sort((a, b) => b.w - a.w)[0];
    switch (k) {
      case 'A0': return `Hi ${f},\n\nYour profile is live at Vetted 50. Clients can find you in Browse, on your role page and in Google.\n\nThe Reputation Index blends five signals: review volume, fit tag verification, strong ratings, a complete profile and engagement recency. The step worth the most right now: ${miss ? miss.l.toLowerCase() : 'a client review'}. ${miss ? miss.gain + '.' : ''}\n\nOpen Studio to see who views you and why.`;
      case 'A1': return `Hi ${f},\n\nClient reviews are the biggest part of the Reputation Index. Each one adds about ${RN.model.risGain('review')} points and verifies the fit tags your client confirms.\n\nAsk two past clients from Studio > Credibility. It takes them about four minutes.`;
      case 'A2': return `Hi ${f},\n\nClients hire on stage and deal-size fit. Add three engagements to your Engagement History, each with a work sample, and clients can see the companies and outcomes behind your tags.\n\nEach verified engagement adds about ${RN.model.risGain('engagement')} points.`;
      case 'A3': return `Hi ${f},\n\nA 60-second video in your own words helps you stand out in a crowded category, and it completes your profile.\n\nRecord it from Studio > Profile.`;
      case 'A4': return `Hi ${f},\n\nMost of your deals start outside a marketplace. Share your profile on LinkedIn, or send a tracked proof link to a prospect, and see which sections they read.\n\nEvery approved profile can send proof links: ${op.ris.score >= 60 ? 'yours are unlimited' : '5 a month at Vetted, unlimited from Proven'}. Create one from Studio > Credibility.`;
      case 'A5': {
        const an = RN.model.analytics(op.id, { days: 30 });
        const q = an && an.queries[0];
        return `Hi ${f},\n\nYour first 30 days: ${int(an ? an.totals.impressions : 0)} search impressions and ${int(an ? an.totals.views : 0)} profile views.${q ? ` The search that found you most: “${q.q}”.` : ''}\n\nReputation Index: ${op.ris.score} (${op.ris.label}). Next best step: ${miss ? miss.l.toLowerCase() : 'ask for one more review'}.`;
      }
      default: return '';
    }
  }
  function dripQueue() {
    const out = [];
    apps().filter((a) => statusOf(a) === 'live' && a.liveAt).forEach((a) => {
      const op = RN.model.byId(opIdFor(a));
      if (!op) return;
      DRIP.forEach((d) => {
        const at = ms(a.liveAt) + d.day * DAY;
        const sent = a.drip && a.drip[d.k];
        const status = sent ? 'sent' : at > nowMs() ? 'scheduled' : d.skip && d.skip(op) ? 'skipped' : 'due';
        out.push({ a, op, d, at, status, sent });
      });
    });
    return out;
  }
  const AUD = { team: 'Team alerts', operators: 'Operators', clients: 'Clients' };
  function audience(m) {
    if (m.to === TEAM) return 'team';
    if (/^\d+ operators\b/.test(String(m.to))) return 'operators';
    if (RN.model.ops.some((o) => o.name === m.to) || apps().some((a) => { const p = prof(a); return p.email === m.to || p.name === m.to; })) return 'operators';
    return 'clients';
  }
  const ALERTS = [
    { k: 'app', ap: '', t: 'New operator application', d: 'Name, role, rate and email. Review within 2 business days.', pre: 'New operator application' },
    { k: 'intro', ap: 'AP-04', t: 'New intro request', d: 'Operator, client company and scope. The operator has 72 hours to reply.', pre: 'New intro request' },
    { k: 'review', ap: 'AP-03', t: 'New review request', d: 'Operator and reviewer. Reviews publish on submit with no approval step.', pre: 'New review request' },
  ];
  function emails() {
    const qd = dripQueue();
    const due = qd.filter((x) => x.status === 'due');
    const mails = st().outbox || [];
    const shown = ui.mailSeg === 'all' ? mails : mails.filter((m) => audience(m) === ui.mailSeg);
    const pill = { sent: '<span class="pill pill-good">Sent</span>', due: '<span class="pill pill-warn">Due now</span>', scheduled: '<span class="pill">Scheduled</span>', skipped: '<span class="pill pill-line">Skipped, already done</span>' };
    return `${head('Platform emails', 'The activation drip every approved operator gets, the alerts the team receives, and everything the platform has sent in this session.')}
      <section class="card adm-sec">
        ${cardHead('30-day activation drip, A0 to A5', 'Replaces the single profile-approved email. Each email is framed as raising the Reputation Index and skips itself when the operator has already done the step.')}
        <div class="tbl-wrap"><table class="tbl adm-tbl adm-drip adm-stacktbl">
          <thead><tr><th>Email</th><th>Day</th><th>Purpose</th><th class="adm-hide-m">Skips when</th><th class="adm-hide-m">Score lift</th><th><span class="sr-only">Preview</span></th></tr></thead>
          <tbody>${DRIP.map((d) => `<tr>
            <td class="adm-w"><span class="adm-code">${d.k}</span><b class="adm-drip-s">${esc(d.subj)}</b></td>
            <td class="tnum nowrap adm-drip-day">Day ${d.day}</td>
            <td class="small adm-w">${esc(d.purpose)}</td>
            <td class="small muted adm-hide-m">${esc(d.skipL)}</td>
            <td class="small adm-hide-m nowrap">${d.gain ? `+${RN.model.risGain(d.gain)} pts ${esc(d.per)}` : '<span class="muted">N/A</span>'}</td>
            <td class="r adm-drip-pv"><button type="button" class="act" data-act="adm-drip-preview" data-k="${d.k}">Preview</button></td>
          </tr>`).join('')}</tbody></table></div>
        <p class="tiny muted adm-foot">Targets from the activation brief: 2+ reviews, 3 to 5 engagements with a work sample each, an intro video and verified fit tags.</p>
      </section>

      <section class="card adm-sec">
        ${cardHead('Drip queue', 'Operators approved in this session. Advance the prototype clock to see later emails come due.', due.length ? `<button type="button" class="btn btn-sm" data-act="adm-drip-send">${icon('send')}Send ${RN.fmt.plural(due.length, 'due email')}</button>` : '')}
        ${qd.length ? `<div class="tbl-wrap"><table class="tbl adm-tbl"><thead><tr><th>Operator</th><th>Email</th><th>Send date</th><th>Status</th></tr></thead><tbody>
          ${qd.map((x) => `<tr><td><a class="adm-op-n" href="#op.${esc(x.op.slug)}">${esc(x.op.name)}</a></td><td><span class="adm-code">${x.d.k}</span><span class="small">${esc(x.d.subj)}</span></td><td class="small nowrap">${esc(RN.fmt.dateShort(x.sent || x.at))}</td><td>${pill[x.status]}</td></tr>`).join('')}
        </tbody></table></div>`
        : RN.ui.empty({ icon: 'mail', title: 'No operators in the drip yet', body: 'Approve an application and generate its score. A0 sends right away and the rest are scheduled here.', cta: '<a class="btn btn-sm btn-line" href="#admin.approvals">Go to approvals</a>' })}
      </section>

      <section class="card adm-sec">
        ${cardHead('Team alerts', `Plain-text emails to ${TEAM} the moment something needs the team.`)}
        <ul class="adm-alerts">${ALERTS.map((x) => { const n = mails.filter((m) => m.to === TEAM && String(m.subject).startsWith(x.pre)).length; return `<li><span class="adm-need-ic">${icon(x.k === 'app' ? 'user' : x.k === 'intro' ? 'handshake' : 'star')}</span><div class="grow"><b>${esc(x.t)}${x.ap ? ` <span class="adm-code">${x.ap}</span>` : ''}</b><span class="small muted">${esc(x.d)}</span></div><span class="pill ${n ? 'pill-accent' : ''}">${RN.fmt.plural(n, 'alert')} this session</span></li>`; }).join('')}</ul>
      </section>

      <section class="card adm-sec">
        ${cardHead('Outbox', `${RN.fmt.plural(mails.length, 'email')} sent in this session, newest first.`, `<div class="seg" role="group" aria-label="Filter outbox">${[['all', 'All'], ['team', 'Team'], ['operators', 'Operators'], ['clients', 'Clients']].map(([k, l]) => `<button type="button" class="${ui.mailSeg === k ? 'on' : ''}" aria-pressed="${ui.mailSeg === k}" data-act="adm-mail-seg" data-s="${k}">${l}</button>`).join('')}</div>`)}
        ${shown.length ? `<div class="adm-mails">${shown.slice(0, 40).map((m) => `<details class="adm-mail"><summary><span class="adm-mail-to">${esc(AUD[audience(m)])} · To ${esc(m.to)}</span><b>${esc(m.subject)}</b><span class="tiny muted nowrap">${esc(RN.fmt.ago(m.ts))}</span>${icon('chev-down')}</summary><p>${esc(m.body)}</p></details>`).join('')}</div>`
        : RN.ui.empty({ icon: 'inbox', title: 'Nothing here yet', body: 'Emails appear as people request intros, post projects, apply or get approved.' })}
      </section>`;
  }

  /* =====================================================================================
     Actions: navigation state
     ===================================================================================== */
  RN.actions['adm-days'] = (el) => { ui.days = +el.dataset.d || 30; RN.rerender(); };
  RN.actions['adm-terms-all'] = () => { ui.termsAll = !ui.termsAll; RN.rerender(); };
  RN.actions['adm-mail-seg'] = (el) => { ui.mailSeg = el.dataset.s; RN.rerender(); };
  RN.actions['adm-dir-seg'] = (el) => { ui.dirSeg = el.dataset.s; ui.dirLimit = 25; RN.rerender(); };
  RN.actions['adm-dir-more'] = () => { ui.dirLimit += 25; refreshDir(); };
  RN.actions['adm-dir-reset'] = () => { Object.assign(ui, { dirQ: '', dirCat: '', dirSeg: 'all', dirLimit: 25 }); RN.rerender(); };
  RN.inputs['adm-dir-q'] = (el) => { ui.dirQ = el.value; ui.dirLimit = 25; refreshDir(); };
  RN.inputs['adm-dir-cat'] = (el) => { ui.dirCat = el.value; ui.dirLimit = 25; refreshDir(); };
  RN.inputs['adm-dir-sort'] = (el) => { ui.dirSort = el.value; refreshDir(); };

  /* ---------- Approvals ---------- */
  function setApp(id, patch, key) {
    RN.store.update((s) => { const a = (s.pending || []).find((x) => x.id === id); if (a) Object.assign(a, typeof patch === 'function' ? patch(a) : patch); }, key || 'pending');
  }
  RN.actions['adm-approve'] = (el) => {
    const a = appById(el.dataset.id);
    if (!a) return;
    setApp(a.id, { status: 'approved', approvedAt: RN.now().toISOString() });
    toast(`${esc(prof(a).name)}’s profile is approved. Generate the score to put it live.`);
    RN.rerender();
  };
  RN.actions['adm-score'] = (el) => {
    const a = appById(el.dataset.id);
    if (!a) return;
    if (statusOf(a) !== 'approved') { toast('Approve the profile first.', { icon: 'info' }); return; }
    const ts = RN.now().toISOString();
    setApp(a.id, (x) => ({ status: 'live', liveAt: ts, opId: opIdFor(x), drip: Object.assign({}, x.drip, { A0: ts }) }));
    const fresh = appById(a.id);
    const op = goLive(fresh);
    RN.store.update((s) => { if (s.seen && s.seen.hidden) s.seen.hidden = s.seen.hidden.filter((x) => x !== op.id); }, 'seen');
    op.hidden = false;
    RN.mail(op.name, DRIP[0].subj, dripBody('A0', op), 'drip');
    toast(`${esc(op.name)} is live in Browse at Vetted 50.`, { action: { label: 'View profile', act: 'go', attrs: `data-to="op.${esc(op.slug)}"` }, ms: 5200 });
    RN.rerender();
  };
  RN.actions['adm-reopen'] = (el) => { setApp(el.dataset.id, { status: 'in_review', decidedAt: null }); toast('Application moved back to review.'); RN.rerender(); };
  RN.actions['adm-preview'] = (el) => {
    const a = appById(el.dataset.id);
    if (!a) return;
    const op = buildOp(a);
    RN.ui.modal({
      width: 520, title: `${esc(prof(a).first)}’s card in Browse`, sub: 'How clients will see the profile at Vetted 50 once it is live.',
      body: `<div class="adm-preview" inert>${RN.ui.opCard(op, { why: op.tags[0] ? `Matches “${op.tags[0].t}”` : '' })}</div>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Close</button>${statusOf(a) === 'approved' ? `<button type="button" class="btn" data-act="adm-score" data-id="${esc(a.id)}">Generate score</button>` : `<button type="button" class="btn" data-act="adm-approve" data-id="${esc(a.id)}">Approve profile</button>`}`,
    });
  };
  // Close the preview modal before a step runs from inside it
  ['adm-approve', 'adm-score'].forEach((k) => { const fn = RN.actions[k]; RN.actions[k] = (el, ev) => { if (el.closest('.scrim')) RN.ui.closeModal(); fn(el, ev); }; });

  RN.actions['adm-changes'] = (el) => {
    const a = appById(el.dataset.id);
    if (!a) return;
    const p = prof(a);
    const miss = RN.model.checklist(buildOp(a)).filter((x) => !x.done && ['photo', 'headline', 'bio', 'rate', 'ranges', 'industries', 'tags', 'role', 'video'].includes(x.k));
    const note = `Hi ${p.first},\n\nThanks for applying to Revenue Nomad. Before your profile goes live, please add:\n${miss.map((x) => '- ' + x.l).join('\n') || '- (add what you need from them)'}\n\nEach one raises your starting profile strength, which clients see in search. Update your application and we will review it within one business day.\n\nMatt Lopez\nRevenue Nomad`;
    RN.ui.modal({
      width: 600, title: `Request changes from ${esc(p.first)}`, sub: `We email ${esc(p.email || p.name)}. The application stays in your queue.`,
      body: `<form id="adm-changes-form" data-submit="adm-changes-send" data-id="${esc(a.id)}" class="stack"><div class="field"><label for="adm-ch-note">Email to ${esc(p.first)}</label><textarea class="textarea adm-note" id="adm-ch-note" name="note" required>${esc(note)}</textarea><p class="help">Prefilled from what is missing on the application. Edit before sending.</p></div></form>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="adm-changes-form">${icon('send')}Send request</button>`,
    });
  };
  RN.submits['adm-changes-send'] = (form, d) => {
    const a = appById(form.dataset.id);
    if (!a || !String(d.note || '').trim()) { toast('Write a short note first.', { icon: 'info' }); return; }
    const p = prof(a);
    setApp(a.id, { status: 'changes_requested', changesAt: RN.now().toISOString(), changeNote: d.note });
    RN.mail(p.email || p.name, 'A few changes before your profile goes live', d.note, 'admin');
    RN.ui.closeModal();
    toast(`Change request sent to ${esc(p.first)}.`, { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['adm-reject'] = (el) => {
    const a = appById(el.dataset.id);
    if (!a) return;
    const p = prof(a);
    const note = `Hi ${p.first},\n\nThanks for applying to Revenue Nomad. We can't approve your profile yet because we could not confirm your recent fractional work from the details provided.\n\nIf you add your LinkedIn URL and two recent engagements, reply to this email and we will look again.\n\nMatt Lopez\nRevenue Nomad`;
    RN.ui.modal({
      width: 600, title: `Reject ${esc(p.name)}’s application?`, sub: 'The applicant gets this email. You can reopen the application later.',
      body: `<form id="adm-reject-form" data-submit="adm-reject-send" data-id="${esc(a.id)}" class="stack"><div class="field"><label for="adm-rj-note">Reason, in the email to ${esc(p.first)}</label><textarea class="textarea adm-note" id="adm-rj-note" name="note" required>${esc(note)}</textarea></div></form>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Keep in review</button><button class="btn btn-danger" type="submit" form="adm-reject-form">Reject and email</button>`,
    });
  };
  RN.submits['adm-reject-send'] = (form, d) => {
    const a = appById(form.dataset.id);
    if (!a || !String(d.note || '').trim()) { toast('Add the reason first.', { icon: 'info' }); return; }
    const p = prof(a);
    setApp(a.id, { status: 'rejected', decidedAt: RN.now().toISOString(), rejectNote: d.note });
    RN.mail(p.email || p.name, 'About your Revenue Nomad application', d.note, 'admin');
    RN.ui.closeModal();
    toast(`${esc(p.name)} was emailed. The application moved to Recently decided.`, { icon: 'mail' });
    RN.rerender();
  };

  /* ---------- Intros ---------- */
  const introById = (id) => intros().find((i) => i.id === id);
  RN.actions['adm-intro-next'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    const to = el.dataset.to;
    if (el.closest('.scrim')) RN.ui.closeModal();
    RN.intro.setStatus(i.id, to, to === 'rn_qualified' ? 'Fit confirmed by the Revenue Nomad team' : to === 'hired' ? `${i.buyer.company.name} hired ${op.first}` : undefined);
    toast(to === 'rn_qualified' ? `Marked RN Qualified. Introduce ${esc(op.first)} and ${esc(RN.fmt.first(i.buyer.name))} next.` : to === 'hired' ? `Marked hired. We emailed ${esc(op.first)} about the CORE review at the end of the engagement.` : 'Status updated.');
    RN.rerender();
  };
  RN.actions['adm-intro-nudge'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    const sum = RN.intro.summary(i, true);
    const c = clock(i);
    RN.mail(op.name, `Reminder: a client is waiting on your reply`, `${sum.who}\n${sum.scope}\n\n${c && c.late ? `The 72-hour reply window closed ${dur(-c.left)} ago.` : `You have ${dur(c ? c.left : 0)} left to reply.`} Say Interested or Pass from your Studio inbox. If you pass, we suggest other operators to the client.`, 'intro');
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen.admNudged = Object.assign({}, s.seen.admNudged, { [i.id]: RN.now().toISOString() }); }, 'seen');
    toast(`Reminder emailed to ${esc(op.first)}.`, { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['adm-introduce'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    if (el.closest('.scrim')) RN.ui.closeModal();
    RN.ui.modal({
      width: 560, title: `Introduce ${esc(RN.fmt.first(i.buyer.name))} and ${esc(op.first)}?`, sub: 'Both sides see each other’s name, company and email from here on.',
      body: `<div class="stack" style="--gap:12px">
        <div class="adm-mailprev">${icon('mail')}<div><span class="tiny muted">To ${esc(i.buyer.name)}, ${esc(i.buyer.company.name)}</span><b>Meet ${esc(op.name)}</b></div></div>
        <div class="adm-mailprev">${icon('mail')}<div><span class="tiny muted">To ${esc(op.name)}</span><b>Meet ${esc(i.buyer.name)} at ${esc(i.buyer.company.name)}</b></div></div>
        <p class="small muted">Both emails ask them to reply-all to book the first call.</p></div>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Not yet</button><button type="button" class="btn" data-act="adm-introduce-go" data-id="${esc(i.id)}">${icon('send')}Send introductions</button>`,
    });
  };
  RN.actions['adm-introduce-go'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    RN.ui.closeModal();
    RN.intro.setStatus(i.id, 'introduced');
    toast(`Introduced. Emails sent to ${esc(RN.fmt.first(i.buyer.name))} and ${esc(op.first)}.`, { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['adm-intro-decline'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    RN.ui.closeModal();
    RN.ui.modal({
      width: 560, title: `Decline for ${esc(op.first)}?`, sub: `${esc(i.buyer.name)} gets this reason and two operators with the same fit.`,
      body: `<form id="adm-decline-form" data-submit="adm-decline-send" data-id="${esc(i.id)}"><div class="field"><label for="adm-dc-note">Reason for the client</label><textarea class="textarea" id="adm-dc-note" name="note" required style="min-height:110px">${esc(op.first + ' is at capacity this month.')}</textarea></div></form>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn btn-danger" type="submit" form="adm-decline-form">Decline and email</button>`,
    });
  };
  RN.submits['adm-decline-send'] = (form, d) => {
    const i = introById(form.dataset.id);
    if (!i || !String(d.note || '').trim()) { toast('Add a short reason first.', { icon: 'info' }); return; }
    RN.intro.setStatus(i.id, 'declined', d.note.trim());
    RN.ui.closeModal();
    toast(`Declined. ${esc(RN.fmt.first(i.buyer.name))} was emailed with alternatives.`, { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['adm-intro-open'] = (el) => {
    const i = introById(el.dataset.id);
    if (!i) return;
    const op = RN.model.byId(i.opId);
    const b = i.buyer || {};
    const co = b.company || {};
    const f = i.fields || {};
    const nx = NEXT[i.status] && NEXT[i.status](op);
    const kv = [
      [RN.fields.need.label, f.need ? RN.w.label('need', f.need) : 'N/A'],
      [RN.fields.engagementType.label, f.engagementType ? RN.w.label('engagementType', f.engagementType) : 'N/A'],
      f.engagementType === 'project' ? [RN.fields.projectBudget.label, f.projectBudget ? RN.fmt.usd(f.projectBudget) : 'N/A'] : [RN.fields.hoursPerMonth.label, f.hoursPerMonth ? RN.w.label('hoursPerMonth', f.hoursPerMonth) : 'N/A'],
      [RN.fields.startBy.label, f.startBy ? RN.w.label('startBy', f.startBy) : 'N/A'],
      ['Industry', RN.w.label('industry', co.industry) || 'N/A'],
      [RN.fields.companyRevenue.label, co.revenueRange ? RN.w.label('companyRevenue', co.revenueRange) : 'N/A'],
      [RN.fields.companyEmployees.label, co.employeeRange ? RN.w.label('companyEmployees', co.employeeRange) : 'N/A'],
    ];
    RN.ui.drawer({
      title: `${esc(co.name || 'Client')} and ${esc(op.first)}`,
      sub: `Requested ${esc(RN.fmt.date(i.createdAt))} · ${RN.ui.statusPill('intro', i.status)}`,
      body: `<div class="stack adm-drawer" style="--gap:22px">
        ${RN.ui.introTrack(i)}
        ${clock(i) ? `<div>${clockPill(i)}</div>` : ''}
        <div class="adm-parties">
          <div><span class="label">Client</span><b>${esc(b.name || 'Client')}</b><span class="small muted">${esc([b.title, co.name].filter(Boolean).join(', '))}</span><span class="small">${esc(b.email || '')}</span></div>
          <div><span class="label">Operator</span><a class="adm-op-n" href="#op.${esc(op.slug)}" data-act="go" data-to="op.${esc(op.slug)}">${esc(op.name)}</a><span class="small muted">Fractional ${esc(op.role)}</span><span class="small">${esc(op.avail.label)}</span></div>
        </div>
        <dl class="adm-kv">${kv.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${i.note ? `<div><span class="label">Note from the client</span><p class="adm-note-q">${esc(i.note)}</p></div>` : ''}
        <div><span class="label">History</span><ol class="adm-thread"><li><b>Requested</b><span class="tiny muted">${esc(b.name || 'Client')} · ${esc(RN.fmt.date(i.createdAt))}</span></li>${(i.thread || []).map((m) => `<li><b>${esc(m.text)}</b><span class="tiny muted">${esc(m.from)} · ${esc(RN.fmt.date(m.ts))}</span></li>`).join('')}</ol></div>
      </div>`,
      foot: `${!['hired', 'declined'].includes(i.status) ? `<button type="button" class="btn btn-line btn-sm adm-danger" data-act="adm-intro-decline" data-id="${esc(i.id)}">Decline</button>` : ''}<span class="grow"></span>${nx ? `<button type="button" class="btn btn-sm" data-act="${nx.act}" data-id="${esc(i.id)}"${nx.to ? ` data-to="${nx.to}"` : ''}>${icon(nx.icon)}${esc(nx.label)}</button>` : '<button type="button" class="btn btn-line btn-sm" data-act="modal-close">Close</button>'}`,
    });
  };
  // Nudge from inside the drawer closes it first
  { const fn = RN.actions['adm-intro-nudge']; RN.actions['adm-intro-nudge'] = (el, ev) => { if (el.closest('.scrim')) RN.ui.closeModal(); fn(el, ev); }; }

  /* ---------- Projects ---------- */
  function suggestions(p) {
    const inv = p.invited || [];
    const left = Math.max(0, 3 - (p.suggested || []).length);
    return RN.model.rank(p.fields || {}, { limit: 40 }).filter((r) => !inv.includes(r.op.id) && !r.op.hidden).slice(0, left);
  }
  RN.actions['adm-suggest'] = (el) => {
    const p = (st().projects || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    const picks = suggestions(p);
    const c = projClient(p);
    RN.ui.modal({
      width: 600, title: `Suggest operators for ${esc(p.title || 'this project')}`,
      sub: `Ranked by Match Signals against the project brief. ${esc(c.company || c.name)} sees them as “Suggested by Revenue Nomad”.`,
      body: picks.length ? `<ul class="adm-picks">${picks.map((r) => `<li>${RN.ui.avatar(r.op, 'ava-md')}<div class="grow"><a class="adm-op-n" href="#op.${esc(r.op.slug)}" data-act="go" data-to="op.${esc(r.op.slug)}">${esc(r.op.name)}</a><span class="tiny muted">${esc(r.op.role)} · ${esc(r.op.ris.label)} ${esc(r.op.ris.score)} · ${esc(r.op.avail.label)}</span>
          <span class="small adm-pick-why">${esc(r.fit.signals.filter((s) => s.state === 'match').map((s) => s.text).slice(0, 2).join('. ') || 'Closest available fit in the role category')}</span></div>${fitPill(r.fit)}</li>`).join('')}</ul>
          <p class="small muted">Each operator gets an invite in their Studio inbox. The client is emailed.</p>`
        : RN.ui.empty({ icon: 'users', title: 'No more operators to suggest', body: 'Everyone who fits this brief is already invited.' }),
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Cancel</button>${picks.length ? `<button type="button" class="btn" data-act="adm-suggest-go" data-id="${esc(p.id)}" data-ops="${esc(picks.map((r) => r.op.id).join('|'))}">${icon('send')}Invite ${RN.fmt.plural(picks.length, 'operator')}</button>` : ''}`,
    });
  };
  RN.actions['adm-suggest-go'] = (el) => {
    const id = el.dataset.id;
    const ids = arr(el.dataset.ops);
    let p = (st().projects || []).find((x) => x.id === id);
    if (!p || !ids.length) return;
    RN.store.update((s) => {
      const x = s.projects.find((y) => y.id === id);
      x.invited = (x.invited || []).concat(ids.filter((o) => !(x.invited || []).includes(o)));
      x.suggested = (x.suggested || []).concat(ids.filter((o) => !(x.suggested || []).includes(o))).slice(0, 3);
    }, 'projects');
    p = (st().projects || []).find((x) => x.id === id);
    const c = projClient(p);
    const ops = ids.map((o) => RN.model.byId(o)).filter(Boolean);
    const catL = p.fields && p.fields.roleCategory ? catLabel(p.fields.roleCategory) : 'fractional';
    RN.mail(c.email, `Revenue Nomad suggested ${RN.fmt.plural(ops.length, 'operator')}`, `Hi ${RN.fmt.first(c.name)},\n\nWe picked ${ops.length === 1 ? 'an operator' : ops.length + ' operators'} for “${p.title}” based on your brief:\n${ops.map((o) => `- ${o.name}, ${o.role} (${o.ris.label} ${o.ris.score})`).join('\n')}\n\nThey are invited now. Responses land on your project page as they come in.`, 'project');
    ops.forEach((o) => {
      RN.mail(o.name, `Revenue Nomad invited you to a project: ${p.title}`, `Hi ${o.first},\n\nRevenue Nomad suggested you to a ${catL} project from a ${RN.w.label('companyRevenue', (p.fields || {}).revenueRange) || ''} company.\n${[(p.fields || {}).engagementType && RN.w.label('engagementType', p.fields.engagementType), (p.fields || {}).hoursPerMonth && RN.w.label('hoursPerMonth', p.fields.hoursPerMonth)].filter(Boolean).join(' · ')}\n\nIt is in your Studio inbox. Responding takes about two minutes.`, 'project');
      RN.track('project_invite', { opId: o.id, source: 'rn_suggested', meta: { projectId: id } });
    });
    RN.ui.closeModal();
    toast(`${RN.fmt.plural(ops.length, 'operator')} invited. ${esc(RN.fmt.first(c.name))} was emailed.`, { icon: 'mail', action: { label: 'View project', act: 'go', attrs: `data-to="project.${esc(id)}"` } });
    RN.rerender();
  };

  /* ---------- Directory: edit on the operator's behalf, hide from search ---------- */
  RN.actions['adm-hide'] = (el) => {
    const op = RN.model.byId(el.dataset.id);
    if (!op) return;
    const on = !!op.hidden;
    RN.store.update((s) => { s.seen = s.seen || {}; const l = s.seen.hidden || []; s.seen.hidden = on ? l.filter((x) => x !== op.id) : l.concat(op.id); }, 'seen');
    op.hidden = !on;
    toast(on ? `${esc(op.name)} is back in search.` : `${esc(op.name)} is hidden from search. The profile link still works.`, { icon: on ? 'eye' : 'eye-off', action: { label: 'Undo', act: 'adm-hide', attrs: `data-id="${esc(op.id)}"` } });
    RN.rerender();
  };
  /* Edit drawer: the same standard fields and order as intake and Studio > Profile. The role title list follows
     the chosen role category, and the role-detail fields are the category's RN.fields.roleFields keys. */
  const GTM_KEYS = ['salesMotions', 'crm', 'methodologies'];   // asked for every role, shown in their own group
  const detailKeysFor = (cat) => roleKeys(cat).filter((k) => !GTM_KEYS.includes(k));
  // Split a stored list into registry values and legacy free text (kept on save, never shown as a chip)
  function slugsOf(key, list) {
    const out = { v: [], extra: [] };
    arr(list).forEach((x) => { const o = RN.w.opt(key, x); if (o) { if (!out.v.includes(o.v)) out.v.push(o.v); } else if (x !== 'Other') out.extra.push(x); });
    return out;
  }
  // Current registry answer for a role-detail key: op.roleFields first, then the reading of legacy data where it maps to an option
  function detailValue(op, key) {
    const d = RN.fields[key];
    const multi = d.type === 'multi' || (d.type === 'optcards' && d.multi);
    const rf = op.roleFields || {};
    if (filled(rf[key])) return multi ? arr(rf[key]) : rf[key];
    const rv = RN.roleDetail && RN.roleDetail.value(op, key);
    if (rv) {
      if (rv.kind === 'chips') { const v = slugsOf(key, rv.value).v; return multi ? v : v[0] || ''; }
      if (rv.kind === 'scale') return (RN.w.opt(key, rv.value) || {}).v || '';
      if (rv.kind === 'flag') return 'yes';
      if (rv.kind === 'split') return rv.value;
    }
    return multi ? [] : '';
  }
  function detailFields(op, cat) {
    const keys = detailKeysFor(cat);
    if (!keys.length) return '<p class="small muted">This role category has no role-detail fields.</p>';
    return keys.map((k) => {
      const now = cat === op.catKey && RN.roleDetail ? RN.roleDetail.text(op, k) : '';
      return RN.w.field(k, cat === op.catKey ? detailValue(op, k) : RN.fields[k].type === 'multi' ? [] : '', { name: 'rd_' + k, id: 'adm-rd-' + k, help: now ? `On the profile now: ${now}` : 'Not answered yet' });
    }).join('');
  }
  const isoDay = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : '');
  const editSec = (title, inner, attrs) => `<fieldset class="adm-edit-sec"${attrs || ''}><legend class="label">${title}</legend><div class="stack" style="--gap:18px">${inner}</div></fieldset>`;
  RN.actions['adm-edit'] = (el) => {
    const op = RN.model.byId(el.dataset.id);
    if (!op) return;
    const motions = slugsOf('salesMotions', op.motions).v;
    const meth = slugsOf('methodologies', op.methodologies).v;
    RN.ui.drawer({
      title: `Edit ${esc(op.name)}’s profile`, sub: `Changes go live on the profile and are logged with the date. We email ${esc(op.first)} a list of what changed.`,
      body: `<form id="adm-edit-form" data-submit="adm-edit-save" data-id="${esc(op.id)}" class="stack adm-edit" style="--gap:26px" novalidate>
        ${editSec('Role', RN.w.field('roleCategory', op.catKey, { name: 'roleCategory', compact: true, change: 'adm-edit-cat' })
          + `<div data-adm-edit-role>${RN.w.field('role', op.role, { name: 'role', cat: op.catKey, compact: true })}</div>`)}
        ${editSec('Headline and about', RN.w.field('headline', op.headline, { name: 'headline', compact: true }) + RN.w.field('bio', op.bio, { name: 'bio', compact: true }))}
        ${editSec('Availability and rate', RN.w.field('availability', op.avail.key, { name: 'availability', compact: true })
          + `<div class="grid g-2 adm-edit-2" style="--gap:18px">${RN.w.field('startDate', isoDay(op.avail.startDate), { name: 'startDate', compact: true })}${RN.w.field('newClientCapacity', op.newClientCapacity || '', { name: 'newClientCapacity', compact: true })}</div>`
          + RN.w.field('hoursPerMonth', op.avail.hoursCode || '', { name: 'hoursPerMonth', compact: true })
          + RN.w.field('engagementTypes', op.engagementTypes || [], { name: 'engagementTypes', compact: true })
          + RN.w.field('rate', op.rate || '', { name: 'rate', compact: true }))}
        ${editSec('Company fit', RN.w.field('revenueRange', op.revenueRanges, { name: 'revenueRange', compact: true })
          + RN.w.field('employeeRange', op.employeeRanges, { name: 'employeeRange', compact: true })
          + RN.w.field('industries', op.industries, { name: 'industries', compact: true }))}
        ${editSec('GTM experience', RN.w.field('salesMotions', motions, { name: 'salesMotions', compact: true })
          + RN.w.field('crm', slugsOf('crm', [op.crm]).v[0] || '', { name: 'crm', compact: true })
          + RN.w.field('methodologies', meth, { name: 'methodologies', compact: true }))}
        <div data-adm-edit-rd>${editSec(`Role details for ${esc(catLabel(op.catKey))}`, detailFields(op, op.catKey))}</div>
      </form>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="adm-edit-form">Save changes</button>`,
    });
  };
  // Changing the role category re-lists the role titles for that category and swaps in its role-detail fields
  RN.inputs['adm-edit-cat'] = (el) => {
    const form = el.closest('form');
    if (!form) return;
    const op = RN.model.byId(form.dataset.id);
    const cat = el.value || (op && op.catKey);
    if (!op || !cat) return;
    const sel = form.querySelector('select[name="role"]');
    const cur = sel ? sel.value : '';
    const keep = (RN.fields.rolesByCat[cat] || []).includes(cur) ? cur : cat === op.catKey ? op.role : '';
    const rb = form.querySelector('[data-adm-edit-role]');
    if (rb) rb.innerHTML = RN.w.field('role', keep, { name: 'role', cat, compact: true });
    const db = form.querySelector('[data-adm-edit-rd]');
    if (db) db.innerHTML = editSec(`Role details for ${esc(catLabel(cat))}`, detailFields(op, cat));
  };
  RN.submits['adm-edit-save'] = (form, d) => {
    const op = RN.model.byId(form.dataset.id);
    if (!op) return;
    const cat = d.roleCategory || op.catKey;
    // A legacy title outside the registry list stays as it is unless the team picks a new one
    const role = d.role || (cat === op.catKey ? op.role : '');
    if (!role || (d.role && !(RN.fields.rolesByCat[cat] || []).includes(d.role))) {
      toast(`Pick a role title for ${esc(catLabel(cat))}.`, { icon: 'info' });
      const sel = form.querySelector('select[name="role"]'); if (sel) sel.focus();
      return;
    }
    if (d.newClientCapacity && (+d.newClientCapacity < 1 || +d.newClientCapacity > 10)) { toast('New client capacity is 1 to 10 clients.', { icon: 'info' }); return; }
    const same = (x, y) => (Array.isArray(x) || Array.isArray(y) ? arr(x).join('|') === arr(y).join('|') : String(x == null ? '' : x) === String(y == null ? '' : y));
    const e = {}, changed = [];
    const chk = (key, val, cur, label) => { if (!same(val, cur)) { e[key] = val; changed.push(label); } };
    const L = (k) => RN.fields[k].label;
    chk('catKey', cat, op.catKey, L('roleCategory'));
    chk('role', role, op.role, L('role'));
    chk('headline', String(d.headline || '').trim(), op.headline, L('headline'));
    chk('bio', String(d.bio || '').trim(), op.bio, L('bio'));
    if (d.availability) chk('availKey', d.availability, op.avail.key, L('availability'));
    chk('startDate', d.startDate || '', isoDay(op.avail.startDate), L('startDate'));
    chk('newClientCapacity', d.newClientCapacity ? +d.newClientCapacity : null, op.newClientCapacity, L('newClientCapacity'));
    if (d.hoursPerMonth) chk('hoursCode', d.hoursPerMonth, op.avail.hoursCode, L('hoursPerMonth'));
    chk('engagementTypes', arr(d.engagementTypes), op.engagementTypes, L('engagementTypes'));
    chk('rate', d.rate ? +d.rate : null, op.rate, L('rate'));
    chk('revenueRanges', arr(d.revenueRange), op.revenueRanges, L('revenueRange'));
    chk('employeeRanges', arr(d.employeeRange), op.employeeRanges, L('employeeRange'));
    chk('industries', arr(d.industries), op.industries, L('industries'));
    // GTM fields: compare registry values only, and keep any legacy free text the operator already had
    const mo = slugsOf('salesMotions', op.motions), me = slugsOf('methodologies', op.methodologies);
    if (!same(arr(d.salesMotions), mo.v)) { e.motions = arr(d.salesMotions).concat(mo.extra); changed.push(L('salesMotions')); }
    if (!same(d.crm || '', slugsOf('crm', [op.crm]).v[0] || '')) { e.crm = d.crm || ''; changed.push(L('crm')); }
    if (!same(arr(d.methodologies), me.v)) { e.methodologies = arr(d.methodologies).concat(me.extra); changed.push(L('methodologies')); }
    // Role details for the chosen category, stored under their registry keys
    const rf = {};
    detailKeysFor(cat).forEach((k) => {
      const t = RN.fields[k].type;
      const raw = d['rd_' + k];
      const val = t === 'multi' || (t === 'optcards' && RN.fields[k].multi) ? arr(raw) : t === 'number' || t === 'money' ? (raw === '' || raw == null ? '' : +raw) : raw || '';
      const cur = cat === op.catKey ? detailValue(op, k) : (t === 'multi' ? [] : '');
      if (!same(val, cur)) { rf[k] = val; changed.push(L(k)); }
    });
    if (!changed.length) { toast('No changes to save.', { icon: 'info' }); return; }
    const ts = RN.now().toISOString();
    RN.store.update((s) => {
      const prev = s.edits[op.id] || {};
      const next = Object.assign({}, prev, e, { _log: (prev._log || []).concat({ ts, by: 'Revenue Nomad team', fields: changed }) });
      // Store the full registry set, so any surface that reads edits.roleFields sees every answer
      if (Object.keys(rf).length) next.roleFields = Object.assign({}, op.roleFields, prev.roleFields, rf);
      s.edits[op.id] = next;
    }, 'edits');
    applyAdminEdits();
    op.completeness = RN.model.completeness(op);
    RN.mail(op.name, 'The Revenue Nomad team updated your profile', `Hi ${op.first},\n\nWe updated your profile: ${changed.join(', ')}.\n\nReview it any time in Studio > Profile. Reply to this email if anything looks wrong.`, 'admin');
    RN.ui.closeModal();
    toast(`Saved. ${esc(changed.join(', '))} ${changed.length === 1 ? 'is' : 'are'} live on ${esc(op.first)}’s profile.`, { action: { label: 'View profile', act: 'go', attrs: `data-to="op.${esc(op.slug)}"` }, ms: 5200 });
    RN.rerender();
  };

  /* ---------- Demand: recruit for unmet searches, nudge operators to verify ---------- */
  function recruitNote(c) {
    const what = c.kind === 'cat' ? `fractional ${catLabel(c.cat)} leaders` : c.kind === 'tag' ? `operators with client-verified experience in ${c.tags[0]}` : c.q ? `“${c.q}”` : 'operators that match their filters';
    const vol = c.n ? `${c.n === 1 ? 'once' : int(c.n) + ' times'} in the last ${ui.days} days` : 'more often than we can serve';
    const fl = c.kind === 'search' ? filterList(c.filters, []).map((f) => f.vl) : [];
    const line = c.kind === 'cat'
      ? `Client demand for ${catLabel(c.cat)} is growing faster than the network. We are adding a small number of experienced operators this quarter.`
      : c.kind === 'tag' ? `Companies on Revenue Nomad searched for ${c.tags[0]} ${vol}, and few operators can show a client review that confirms it.`
      : `Companies on Revenue Nomad searched for ${what} ${vol}${fl.length ? ` (${fl.join(', ')})` : ''} and found no operator who fits.`;
    return `Subject: Clients are looking for ${c.kind === 'search' ? 'your kind of work' : what}\n\nHi {first name},\n\n${line} If this is work you have done, we would like you on the network.\n\nApplying takes about 10 minutes at revenuenomad.com/join. We review every profile within 2 business days, and approved profiles go live at Vetted 50 with a Studio that shows who viewed you and why.\n\nMatt Lopez\nRevenue Nomad`;
  }
  function closeOps(c) {
    const tags = (c.tags || []).map((x) => x.toLowerCase());
    const inds = arr((c.filters || {}).industries);
    return liveOps().filter((o) => (!c.cat || o.catKey === c.cat) && (!tags.length || !tags.every((tg) => o.tags.some((x) => x.t.toLowerCase() === tg && x.tier !== 'claimed'))))
      .map((o) => ({ o, s: inds.filter((i) => o.industries.includes(i)).length * 10 + tags.filter((tg) => o.tags.some((x) => x.t.toLowerCase() === tg)).length * 6 + o.ris.score / 10 + o.completeness / 20 }))
      .sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.o);
  }
  RN.actions['adm-recruit'] = (el) => {
    const k = el.dataset.k;
    const c = ctx[k];
    if (!c) return;
    const prev = (seen().admRecruit || {})[k];
    const cands = c.kind === 'cat' ? [] : closeOps(c);
    const tagName = (c.tags || [])[0];
    RN.ui.modal({
      width: 640, title: `Recruit for ${esc(c.title)}`,
      sub: c.kind === 'search' ? `${RN.fmt.plural(c.n, 'search', 'searches')} with no match · ${esc(filterList(c.filters, []).map((f) => f.vl).join(', ') || 'no filters')}` : c.kind === 'tag' ? `About ${int(c.n)} searches a month` : 'Share of client demand above share of supply',
      body: `<form id="adm-recruit-form" data-submit="adm-recruit-save" data-k="${esc(k)}" class="stack" style="--gap:20px">
        <div class="field"><label for="adm-rc-note">Outreach note</label><textarea class="textarea adm-note" id="adm-rc-note" name="note">${esc(prev ? prev.note : recruitNote(c))}</textarea><p class="help">Drafted from the search. Copy it into LinkedIn or a referral email, or save it to the team’s recruiting list.</p></div>
        ${cands.length ? `<fieldset class="adm-cands"><legend class="label">Also ask close operators${tagName ? ` to add or verify “${esc(tagName)}”` : ' to add the focus area'}</legend>
          ${cands.map((o) => `<label class="adm-cand"><input type="checkbox" name="ops" value="${esc(o.id)}" checked><span class="adm-cand-box">${icon('check')}</span>${RN.ui.avatar(o, 'ava-sm')}<span class="grow"><b>${esc(o.name)}</b><span class="tiny muted">${esc(o.role)} · ${esc(o.ris.label)} ${esc(o.ris.score)}${o.industries.length ? ' · ' + esc(RN.w.labels('industries', o.industries.slice(0, 2))) : ''}</span></span></label>`).join('')}
        </fieldset>` : ''}
      </form>`,
      foot: `<button type="button" class="btn btn-line" data-act="adm-copy" data-src="adm-rc-note">${icon('copy')}Copy note</button><button class="btn" type="submit" form="adm-recruit-form">${icon('check')}Save to recruiting list</button>`,
    });
  };
  RN.submits['adm-recruit-save'] = (form, d) => {
    const k = form.dataset.k;
    const c = ctx[k];
    if (!c) return;
    const ids = arr(d.ops);
    const tagName = (c.tags || [])[0];
    RN.mail(TEAM, `Recruiting list: ${c.title}`, d.note, 'admin');
    ids.forEach((id) => {
      const o = RN.model.byId(id);
      if (!o) return;
      const has = tagName && o.tags.find((x) => x.t.toLowerCase() === tagName.toLowerCase());
      RN.mail(o.name, c.q ? `Clients searched for “${c.q}” and found no match` : `Clients are searching for ${tagName || catLabel(c.cat)}`,
        `Hi ${o.first},\n\n${c.q ? `Clients searched for “${c.q}” ${c.n > 1 ? int(c.n) + ' times recently ' : ''}and no operator matched.` : `Client demand for ${tagName || catLabel(c.cat)} is ahead of supply.`} ${has ? `You list ${tagName} as a fit tag. Ask a past client to verify it from Studio > Credibility: verified tags rank first in search.` : `If this is work you do, add ${tagName ? '“' + tagName + '”' : 'it'} as a fit tag in Studio > Profile so these clients can find you.`}`, 'admin');
    });
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen.admRecruit = Object.assign({}, s.seen.admRecruit, { [k]: { ts: RN.now().toISOString(), nudged: ids.length, note: d.note } }); }, 'seen');
    RN.ui.closeModal();
    toast(`Saved to the recruiting list${ids.length ? ` and ${RN.fmt.plural(ids.length, 'operator')} nudged` : ''}.`, { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['adm-copy'] = (el) => {
    const ta = document.getElementById(el.dataset.src);
    if (!ta) return;
    const done = () => toast('Note copied.', { icon: 'copy' });
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); }); return; }
    } catch (e) { /* fall through */ }
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    done();
  };
  RN.actions['adm-nudge-tag'] = (el) => {
    const tag = el.dataset.t;
    const tl = tag.toLowerCase();
    const g = RN.model.market().tags.find((x) => x.t.toLowerCase() === tl) || { demand: 0, verified: 0 };
    const claimers = liveOps().filter((o) => o.tags.some((t) => t.t.toLowerCase() === tl && t.tier === 'claimed'));
    if (!claimers.length) return;
    const body = `Hi {first name},\n\nClients searched for ${tag} about ${int(g.demand)} times last month, and only ${RN.fmt.plural(g.verified, 'operator is', 'operators are')} client-verified in it. You list it as a fit tag.\n\nAsk a past client to confirm it from Studio > Credibility. Verified tags rank first in search and add to your Reputation Index.`;
    // One outbox entry per batch; each operator receives it personalized.
    if (claimers.length <= 3) claimers.forEach((o) => RN.mail(o.name, `Clients are searching for “${tag}”`, body.replace('{first name}', o.first), 'admin'));
    else RN.mail(`${claimers.length} operators who claim “${tag}”`, `Clients are searching for “${tag}”`, `${body}\n\nSent individually to ${claimers.slice(0, 6).map((o) => o.name).join(', ')}${claimers.length > 6 ? ` and ${claimers.length - 6} more` : ''}.`, 'admin');
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen.admTagNudged = Object.assign({}, s.seen.admTagNudged, { [tag]: { ts: RN.now().toISOString(), n: claimers.length } }); }, 'seen');
    toast(`Emailed ${RN.fmt.plural(claimers.length, 'operator')} who claim “${esc(tag)}”.`, { icon: 'mail' });
    RN.rerender();
  };

  /* ---------- Emails ---------- */
  RN.actions['adm-drip-preview'] = (el) => {
    const d = DRIP.find((x) => x.k === el.dataset.k);
    const live = apps().filter((a) => statusOf(a) === 'live').map((a) => RN.model.byId(opIdFor(a))).filter(Boolean);
    const op = live[live.length - 1] || RN.model.ops.find((o) => !o.isMatt && o.ris.score === 50 && o.rate) || RN.model.ops[0];
    RN.ui.modal({
      width: 580, title: `${d.k} · Day ${d.day}`, sub: `Preview for ${esc(op.name)}. ${esc(d.skipL)}`,
      body: `<article class="adm-email"><div class="adm-email-hd"><span class="tiny muted">From Revenue Nomad · To ${esc(op.name)}</span><b>${esc(d.subj)}</b></div><p>${esc(dripBody(d.k, op))}</p></article>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Close</button>`,
    });
  };
  RN.actions['adm-drip-send'] = () => {
    const due = dripQueue().filter((x) => x.status === 'due');
    if (!due.length) { toast('Nothing is due yet.', { icon: 'info' }); return; }
    const ts = RN.now().toISOString();
    due.forEach((x) => RN.mail(x.op.name, x.d.subj, dripBody(x.d.k, x.op), 'drip'));
    RN.store.update((s) => { due.forEach((x) => { const a = s.pending.find((y) => y.id === x.a.id); if (a) a.drip = Object.assign({}, a.drip, { [x.d.k]: ts }); }); }, 'pending');
    toast(`${RN.fmt.plural(due.length, 'email')} sent.`, { icon: 'mail' });
    RN.rerender();
  };

  /* =====================================================================================
     Team alerts to hello@revenuenomad.com (AP-03 review requests, AP-04 intro requests,
     new applications). Fires when any surface adds a record; records present at load are skipped.
     ===================================================================================== */
  function initAlerts() {
    const sn = seen();
    if (sn.admAlerted) return;
    const s = st();
    sn.admAlerted = { intros: (s.intros || []).map((i) => i.id), reviews: (s.reviewRequests || []).map((r) => r.id), apps: (s.pending || []).map((a) => a.id) };
    RN.store.save();
  }
  function alreadyAlerted(name) {
    return (st().outbox || []).some((m) => m.to === TEAM && name && String(m.subject).includes(name) && nowMs() - ms(m.ts) < 5 * 60000);
  }
  function sendAlert(kind, x) {
    if (kind === 'intro') {
      const op = RN.model.byId(x.opId);
      const b = x.buyer || {}, co = b.company || {};
      const sum = RN.intro.summary(x, false);
      if (!op || alreadyAlerted(op.name) && alreadyAlerted(co.name)) return;
      RN.mail(TEAM, `New intro request: ${co.name || 'A client'} wants to meet ${op.name}`, `Client: ${[b.name, b.title, co.name].filter(Boolean).join(', ')}${b.email ? ' (' + b.email + ')' : ''}\nCompany: ${[RN.w.label('industry', co.industry), co.revenueRange && RN.w.label('companyRevenue', co.revenueRange) + ' revenue', co.employeeRange && RN.w.label('companyEmployees', co.employeeRange) + ' employees'].filter(Boolean).join(' · ')}\nNeed: ${sum.need || 'Not given'}\nScope: ${sum.scope || 'Not given'}\n\n${op.first} has 72 hours to reply. Track it in Admin > Intros.`, 'alert');
    } else if (kind === 'review') {
      const op = RN.model.byId(x.opId);
      const r = x.reviewer || {};
      RN.mail(TEAM, `New review request: ${op ? op.name : 'An operator'} asked ${r.name || 'a client'}${r.company ? ' at ' + r.company : ''}`, `${op ? op.name : 'An operator'} asked ${[r.name, r.title, r.company].filter(Boolean).join(', ')} for a CORE review${x.engagement ? ' of the ' + x.engagement + ' engagement' : ''}.\n\nReviews publish when the client submits. There is no approval step.`, 'alert');
    } else if (kind === 'app') {
      const p = prof(x);
      if (alreadyAlerted(p.name)) return;
      const rk = roleKeys(p.roleCategory);
      RN.mail(TEAM, `New operator application: ${p.name}, Fractional ${p.role}`, `${p.name} applied as Fractional ${p.role} (${catLabel(p.roleCategory)}).\nEmail: ${p.email || 'Not given'}\n${[p.location || p.country, p.rate ? RN.fmt.rate(p.rate) : 'No rate', RN.w.label('availability', p.availability)].filter(Boolean).join(' · ')}\n${RN.fmt.plural(p.fitTags.length, 'fit tag')}, ${RN.fmt.plural(p.industries.length, 'industry', 'industries')}, ${rk.filter((k) => appRoleText(x, k)).length} of ${rk.length} role details, photo ${p.photo ? 'added' : 'missing'}, video ${p.video ? 'added' : 'missing'}.\n\nReview within 2 business days in Admin > Approvals: Approve profile, then Generate score to publish at Vetted 50.\nReference: ${x.id}`, 'alert');
    }
  }
  function checkAlerts() {
    const s = st();
    const al = s.seen && s.seen.admAlerted;
    if (!al) return;
    const fresh = [];
    (s.intros || []).forEach((i) => { if (!al.intros.includes(i.id)) { al.intros.push(i.id); fresh.push(['intro', i]); } });
    (s.reviewRequests || []).forEach((r) => { if (!al.reviews.includes(r.id)) { al.reviews.push(r.id); fresh.push(['review', r]); } });
    (s.pending || []).forEach((a) => { if (!al.apps.includes(a.id)) { al.apps.push(a.id); fresh.push(['app', a]); } });
    if (!fresh.length) return;
    RN.store.save();
    // Sent after the surface that added the record finishes its own emails, so a team email it already sent
    // (Join sends one for each application) is found by alreadyAlerted and the team gets exactly one.
    setTimeout(() => fresh.forEach(([k, x]) => { try { sendAlert(k, x); } catch (e) { console.error(e); } }), 0);
  }

  /* ---------- Boot: after app.js has loaded the store and seeded the demo ---------- */
  RN.store.on((key) => {
    if (key === '*' && document.readyState !== 'loading') setTimeout(() => { initAlerts(); hydrate(); }, 0);
    checkAlerts();
  });
  // DOMContentLoaded fires after every classic script, including seed.js and app.js, has run.
  // (A bare setTimeout can fire between script loads on file:// and snapshot an unseeded store.)
  function boot() {
    initAlerts();
    const hiddenBefore = RN.model.ops.filter((o) => o.hidden).length;
    const countBefore = RN.model.ops.length;
    const E = st().edits || {};
    const adminEdited = Object.keys(E).some((id) => E[id] && E[id]._log);
    hydrate();
    const changed = RN.model.ops.length !== countBefore || RN.model.ops.filter((o) => o.hidden).length !== hiddenBefore || adminEdited;
    const cur = RN.currentRoute();
    if (changed && cur && !/^admin/.test(cur.view.name)) RN.rerender();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  // Promotable helpers (see hand-off notes)
  RN.admin = { normQuery: normQ, supplyDemand, funnel, hydrate };
})();
