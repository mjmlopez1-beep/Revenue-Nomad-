/* Client workspace (#buyer, #buyer.<tab>): the signed-in client's home base.
   The client is RN.personas.buyer: the demo client (Jordan Ellis) or a visitor who requested an intro and became
   their own client (RN.shell.setClient). Records are matched on that client's email, so each client sees only theirs.
   Tabs: Overview (next steps, shortlist, saved searches, recently viewed), Shortlist (compare, request intros,
   private notes), Intros (lifecycle per request via RN.ui.introTrack), Projects (RN.projects.card, the same card as
   #projects), Company (company profile + match preferences on the standard fields).

   Store keys written here (additive, other surfaces may read them):
     seen.notes          {opId: 'private note'}
     seen.company        {name, website, hq, industry, revenueRange, employeeRange}  (mirrored into RN.personas.buyer.company)
     seen.companyPrefs   {roleCategory, salesMotions[], engagementType, need, savedAt}
     seen.savedSearches  read and deleted here (created on Browse): [{id, name, q, tags, filters, createdAt}]
     intro.withdrawn / intro.closedBy / intro.closeReason (RN.fields.notFitReason slug) / intro.closeNote
       on client-closed intros (status stays 'declined')
   Helpers exposed for other surfaces: RN.bw.brief() (match brief for RN.model.fit), RN.bw.applyCompany(),
   RN.bw.reviewableIntro(opId) (the client's introduced or hired intro with this operator and no review yet,
   for a "Leave a review" button: data-act="bw-review-start" data-id="<introId>", or data-op="<opId>"). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const BW = (RN.bw = RN.bw || {});

  const st = () => RN.store.state;
  const me = () => RN.personas.buyer;
  const seen = () => st().seen || {};
  const DAY = 864e5;

  /* ---------- Company + preferences (shared with profile / compare match signals) ---------- */
  BW.applyCompany = function () {
    const c = seen().company;
    const b = RN.personas && RN.personas.buyer;
    if (!b) return;
    if (c) Object.assign(b.company, c);
    // Keep the one-line identity in step with the company name (header, dock, sign-in toast)
    b.sub = [b.title, b.company.name].filter(Boolean).join(', ') || 'Client';
  };
  // The store loads after view scripts run; apply saved company details once boot finishes.
  setTimeout(() => { try { BW.applyCompany(); } catch (e) { /* ignore */ } }, 0);

  BW.prefs = () => seen().companyPrefs || null;
  BW.brief = function (over) {
    const c = me().company;
    const p = Object.assign({}, BW.prefs() || {}, over || {});
    const co = over && over.company ? over.company : c;
    return {
      revenueRange: co.revenueRange || '',
      employeeRange: co.employeeRange || '',
      industries: co.industry ? [co.industry] : [],
      salesMotions: p.salesMotions || [],
      roleCategory: p.roleCategory || '',
      need: p.need && p.need !== 'not_sure' ? p.need : '',
      engagementType: p.engagementType || '',
    };
  };
  const fitFor = (op, brief) => RN.model.fit(op, brief || BW.brief());
  // Short, honest match line for cards: strong signals first, partial ones only when nothing is strong.
  function matchLine(op) {
    const f = fitFor(op);
    const n = f.signals.length;
    if (!n) return '';
    const partial = f.signals.filter((s) => s.state === 'partial').length;
    if (f.count) return `${f.label} · ${f.count} of ${n} signals match`;
    if (partial) return `${f.label} · ${partial} of ${n} signals partly match`;
    return `Few signals match ${me().company.name}`;
  }
  // The most telling matched signal (expertise and industry say more than company size).
  const ORDER = ['expertise', 'industry', 'motion', 'revenue', 'employees'];
  function bestSignal(f, op) {
    const hits = f.signals.filter((s) => s.state === 'match').sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    return (hits[0] || f.signals.find((s) => s.state === 'partial') || { text: 'Fractional ' + op.role }).text;
  }

  /* ---------- Records that belong to this client (matched on the client's email) ---------- */
  const lc = (x) => String(x == null ? '' : x).toLowerCase().trim();
  const isMe = (email) => !!email && lc(email) === lc(me().email);
  const myIntros = () => st().intros.filter((i) => i.buyer && isMe(i.buyer.email));
  const isOpen = (i) => !['declined', 'hired'].includes(i.status);
  // Projects carry their client (p.client). Seeded projects without one belong to the demo client.
  const myProjects = () => st().projects.filter((p) => {
    const email = (p.client && p.client.email) || p.owner || (p.buyer && p.buyer.email);
    return email ? isMe(email) : !!me().demo;
  });
  const myReviewRequests = () => st().reviewRequests.filter((r) => r.reviewer && isMe(r.reviewer.email));
  const shortOps = () => st().shortlist.map(RN.model.byId).filter(Boolean);
  const introFor = (opId) => myIntros().find((i) => i.opId === opId && i.status !== 'declined');
  const statusLabel = (s) => RN.w.label('introStatus', s);

  function recentlyViewed(n) {
    const out = [];
    const seenIds = new Set();
    const co = lc(me().company.name);
    st().events.forEach((e) => {
      if (e.type !== 'profile_view' || e.persona !== 'buyer' || !e.opId || seenIds.has(e.opId)) return;
      if (e.buyer && e.buyer.name && lc(e.buyer.name) !== co) return;   // another client's views
      const op = RN.model.byId(e.opId);
      if (!op) return;
      seenIds.add(e.opId);
      out.push({ op, ts: e.ts });
    });
    return out.slice(0, n || 6);
  }

  /* ---------- Intro timeline helpers ---------- */
  function reachedIndex(i) {
    const steps = RN.intro.steps;
    if (i.status !== 'declined') return Math.max(0, steps.indexOf(i.status));
    let r = 0;
    (i.thread || []).forEach((t) => { const k = steps.findIndex((s) => statusLabel(s) === t.text); if (k > r) r = k; });
    return r;
  }
  function stepDate(i, s) {
    if (s === 'pending') return i.createdAt;
    const t = (i.thread || []).find((x) => x.text === statusLabel(s));
    return t ? t.ts : null;
  }
  const lastTs = (i) => { const t = (i.thread || [])[i.thread.length - 1]; return t ? t.ts : i.createdAt; };
  // Clamped to the 72-hour window (the dock clock can move back past a request's timestamp)
  function hoursLeft(i) { return Math.min(72, Math.max(0, Math.round(72 - (RN.now() - new Date(i.createdAt)) / 36e5))); }
  const introPill = (i) => (i.withdrawn ? RN.ui.statusPill('intro', 'withdrawn', 'Withdrawn')
    : i.closedBy === 'client' ? RN.ui.statusPill('intro', 'declined', 'Not a fit')
    : RN.ui.statusPill('intro', i.status));
  const hasMyReview = (opId) => st().reviews.some((r) => r.opId === opId && (isMe(r.reviewerEmail) || (!r.reviewerEmail && r.reviewer === me().name)));
  BW.reviewableIntro = (opId) => myIntros().find((i) => i.opId === opId && ['introduced', 'hired'].includes(i.status) && !hasMyReview(opId)) || null;

  /* ---------- Next steps (Overview) ---------- */
  function nextSteps() {
    const out = [];
    const intros = myIntros();
    const rank = { interested: 1, introduced: 2, rn_qualified: 3, hired: 4, pending: 5, declined: 6 };
    intros.slice().sort((a, b) => (rank[a.status] || 9) - (rank[b.status] || 9)).forEach((i) => {
      const op = RN.model.byId(i.opId);
      if (!op) return;
      const go = `<a class="btn btn-line btn-sm" href="#buyer.intros">View intro</a>`;
      if (i.status === 'interested') out.push({ icon: 'handshake', tone: 'good', t: `${op.name} is interested`, b: 'Our team will introduce you within one business day.', ts: lastTs(i), a: go });
      else if (i.status === 'rn_qualified') out.push({ icon: 'shield', tone: 'good', t: `Our team confirmed the fit with ${op.first}`, b: 'Your intro email goes out within one business day.', ts: lastTs(i), a: go });
      else if (i.status === 'introduced') out.push({ icon: 'mail', tone: 'good', t: `You are connected with ${op.first}`, b: `Reply to the intro email to book the first call. Tell us when you decide.`, ts: lastTs(i), a: `<button class="btn btn-sm" data-act="bw-hired" data-id="${esc(i.id)}">We hired ${esc(op.first)}</button>` });
      else if (i.status === 'hired' && !hasMyReview(op.id) && !myReviewRequests().some((r) => r.opId === op.id && r.status === 'sent')) out.push({ icon: 'star', tone: 'accent', t: `How is it going with ${op.first}?`, b: `A short CORE review verifies ${op.first}’s focus areas and helps the next company hire well.`, ts: lastTs(i), a: `<button class="btn btn-line btn-sm" data-act="bw-review-start" data-id="${esc(i.id)}">Leave a review</button>` });
      else if (i.status === 'pending') {
        const h = hoursLeft(i);
        out.push({ icon: 'hourglass', tone: 'warn', t: `Waiting on ${op.first}`, b: h > 0 ? `${op.first} has ${h} hours left to reply. If ${op.first} passes, we suggest two operators with the same fit.` : `${op.first} has not replied in 72 hours. Our team is following up today.`, ts: i.createdAt, a: go });
      } else if (i.status === 'declined' && !i.withdrawn && i.closedBy !== 'client') out.push({ icon: 'refresh', tone: 'bad', t: `${op.first} can’t take this one`, b: 'We picked two operators with the same fit.', ts: lastTs(i), a: `<a class="btn btn-line btn-sm" href="#buyer.intros">See alternatives</a>` });
    });
    myReviewRequests().filter((r) => r.status === 'sent').forEach((r) => {
      const op = RN.model.byId(r.opId);
      if (!op) return;
      const mine = r.source === 'client';
      out.push({ icon: 'star', tone: 'accent', t: mine ? `Finish your review of ${op.first}` : `${op.first} asked for your review`, b: mine ? 'Your answers are saved as you type. Pick up where you left off.' : 'Four quick CORE ratings and the focus areas you saw. About four minutes.', ts: r.sentAt, a: `<a class="btn btn-line btn-sm" href="#review.${esc(r.id)}">${mine ? 'Continue review' : 'Leave a review'}</a>` });
    });
    myProjects().forEach((p) => {
      const interested = (p.responses || []).filter((r) => r.status === 'interested');
      const title = p.title || 'Untitled project';
      if (p.status === 'draft') out.push({ icon: 'edit', tone: '', t: `Finish and post “${title}”`, b: 'Post it to get ranked matches and responses. It takes about a minute.', ts: p.createdAt, a: `<a class="btn btn-line btn-sm" href="#project.${esc(p.id)}">Finish draft</a>` });
      else if (p.status === 'posted' && interested.length) out.push({ icon: 'users', tone: 'good', t: `${RN.fmt.plural(interested.length, 'operator')} responded to “${title}”`, b: `${RN.fmt.int(interested.length)} ${interested.length === 1 ? 'is' : 'are'} interested. Compare their notes and rates, then request intros.`, ts: interested[interested.length - 1].ts || p.postedAt, a: `<a class="btn btn-line btn-sm" href="#project.${esc(p.id)}">Review responses</a>` });
      else if (p.status === 'posted') out.push({ icon: 'megaphone', tone: '', t: `“${title}” is live`, b: 'Invited operators have 72 hours to respond. Matching operators got a role alert.', ts: p.postedAt, a: `<a class="btn btn-line btn-sm" href="#project.${esc(p.id)}">Open project</a>` });
    });
    if (!BW.prefs()) out.push({ icon: 'target', tone: 'accent', t: 'Set your match preferences', b: `Tell us the role you are hiring for and how you sell. Every profile you open then shows match signals for ${me().company.name}.`, a: `<a class="btn btn-line btn-sm" href="#buyer.company">Set preferences</a>` });
    const n = st().shortlist.length;
    if (n >= 2) out.push({ icon: 'compare', tone: '', t: `Compare your ${n} shortlisted operators`, b: 'Pick up to four and see them side by side on the same fields.', a: `<a class="btn btn-line btn-sm" href="#buyer.shortlist">Open shortlist</a>` });
    else if (!n) out.push({ icon: 'bookmark', tone: '', t: 'Save operators you like', b: 'Tap the bookmark on any card or profile. Saved operators land here for compare and intros.', a: `<a class="btn btn-line btn-sm" href="#browse">Browse talent</a>` });
    return out;
  }

  /* ---------- Shell ---------- */
  const TABS = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'shortlist', label: 'Shortlist', icon: 'bookmark', count: () => st().shortlist.length },
    { key: 'intros', label: 'Intros', icon: 'handshake', count: () => myIntros().length },
    { key: 'projects', label: 'Projects', icon: 'briefcase' },
    { key: 'company', label: 'Company', icon: 'building' },
  ];
  function side(cur) {
    const p = me();
    return `<nav class="side" aria-label="Workspace">
      <div class="side-id">${RN.ui.avatar({ name: p.name, initials: RN.fmt.initials(p.name) }, 'ava-md')}<div><b>${esc(p.name)}</b><span>${esc([p.title, p.company.name].filter(Boolean).join(", "))}</span></div></div>
      <span class="label side-label">Workspace</span>
      ${TABS.map((t) => { const n = t.count ? t.count() : 0; return `<a href="#buyer${t.key === 'overview' ? '' : '.' + t.key}" class="${cur === t.key ? 'on' : ''}" ${cur === t.key ? 'aria-current="page"' : ''}>${icon(t.icon)}${esc(t.label)}${n ? `<span class="nav-count">${n}</span>` : ''}</a>`; }).join('')}
      <div class="side-sep"></div>
      <a href="#browse">${icon('search')}Browse talent</a>
      <a href="#project.new">${icon('plus')}Post a project</a>
    </nav>`;
  }
  function page(cur) {
    BW.applyCompany();
    const t = TABS.find((x) => x.key === cur) ? cur : 'overview';
    const body = { overview, shortlist, intros, projects, company }[t]();
    return `<div class="wrap shell bw" data-bw-tab="${esc(t)}">${side(t)}<div class="bw-main">${body}</div></div>`;
  }

  RN.view('buyer', {
    route: 'buyer', nav: '', requires: 'buyer', footer: false,
    title: () => 'Workspace',
    render: () => page('overview'),
    mount: (root) => mount(root),
  });
  RN.view('buyer-tab', {
    route: 'buyer.:tab', nav: '', requires: 'buyer', footer: false,
    samples: { tab: 'shortlist', extra: ['buyer.intros', 'buyer.company', 'buyer.projects'] },
    title: (p) => { const t = TABS.find((x) => x.key === p.tab); return (t ? t.label : 'Overview') + ' · Workspace'; },
    render: (p) => page(p.tab),
    mount: (root) => mount(root),
  });

  function mount(root) {
    // Keep a thread open across re-renders once the client opened it.
    RN.$$('details[data-thread]', root).forEach((d) => d.addEventListener('toggle', () => { if (d.open) openThreads.add(d.dataset.thread); else openThreads.delete(d.dataset.thread); }));
  }

  // One header on every tab: the surface eyebrow (company · Client workspace), a title, a line of context.
  // (Candidate for a shared RN.ui.appHead; see the hand-off notes.)
  function head(o) {
    const eyebrow = `${esc(me().company.name || 'Your company')} · Client workspace`;
    return `<header class="app-head bw-head">
      <div><span class="eyebrow">${eyebrow}</span><h1>${o.title}</h1>${o.sub ? `<p class="sub">${o.sub}</p>` : ''}</div>
      ${o.actions ? `<div class="row bw-head-act">${o.actions}</div>` : ''}
    </header>`;
  }
  function secHead(title, link) {
    return `<div class="bw-sec-hd"><h2 class="h4">${title}</h2>${link || ''}</div>`;
  }

  /* ================= Overview ================= */
  function overview() {
    const p = me();
    const intros = myIntros();
    const live = myProjects().filter((x) => ['posted', 'in_progress'].includes(x.status));
    const responses = myProjects().reduce((a, x) => a + (x.responses || []).filter((r) => r.status === 'interested').length, 0);
    const steps = nextSteps().slice(0, 6);
    const ops = shortOps();
    const viewed = recentlyViewed(5);
    const hour = RN.now().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const prefs = BW.prefs();
    return `${head({
      title: `${greet}, ${esc(p.first)}`,
      sub: 'Everything you are hiring for, in one place.',
      actions: `<a class="btn btn-line" href="#browse">${icon('search')}Browse talent</a>`,
    })}
    <div class="stats-row bw-stats" style="--cols:4">
      <a class="stat" href="#buyer.shortlist"><span class="stat-v">${ops.length}</span><span class="stat-l">Shortlisted</span></a>
      <a class="stat" href="#buyer.intros"><span class="stat-v">${intros.filter(isOpen).length}</span><span class="stat-l">Intros in progress</span></a>
      <a class="stat" href="#buyer.projects"><span class="stat-v">${live.length}</span><span class="stat-l">Live projects</span></a>
      <a class="stat" href="#buyer.projects"><span class="stat-v">${responses}</span><span class="stat-l">Operator responses</span></a>
    </div>
    <div class="bw-ov">
      <section class="card bw-next-card" aria-labelledby="bw-next-t">
        <div class="card-hd"><div><h3 id="bw-next-t">Next steps</h3><p class="sub">Across your intros, reviews and projects.</p></div></div>
        ${steps.length ? `<ol class="bw-next">${steps.map((s) => `<li class="bw-next-i">
          <span class="bw-next-ic ${s.tone ? 'is-' + s.tone : ''}">${icon(s.icon)}</span>
          <div class="grow"><b>${esc(s.t)}</b><p>${esc(s.b)}</p>${s.ts ? `<span class="tiny faint">${esc(RN.fmt.ago(s.ts))}</span>` : ''}</div>
          <div class="bw-next-a">${s.a}</div></li>`).join('')}</ol>` : RN.ui.empty({ icon: 'check-circle', title: 'You are all caught up', body: 'New replies from operators and project responses show up here.' })}
      </section>
      <aside class="stack bw-ov-side" style="--gap:16px">
        <section class="panel-night night bw-post">
          <span class="eyebrow">Engagement Blueprints</span>
          <h3 class="h3">Post a project in three steps</h3>
          <p class="small">Start from a scoped Blueprint with a 30/60/90-day plan and typical rates. Ranked matches appear as you type.</p>
          <div class="row"><a class="btn btn-leaf btn-sm" href="#project.new">Post a project</a><a class="btn btn-ghost btn-sm" href="#blueprints">See Blueprints</a></div>
        </section>
        <section class="card bw-prefs-mini">
          <div class="card-hd"><div><h3>Match preferences</h3><p class="sub">${prefs ? 'Every profile you open is scored against these.' : 'Not set yet. Profiles score on company basics only.'}</p></div><a class="act" href="#buyer.company">${prefs ? 'Edit' : 'Set up'}</a></div>
          <div class="bw-prefs-chips">${prefChips(prefs)}</div>
        </section>
      </aside>
    </div>

    <section class="bw-sec">
      ${secHead(`Your shortlist <span class="muted">${ops.length}</span>`, ops.length ? `<a class="act" href="#buyer.shortlist">Open shortlist${icon('arrow')}</a>` : '')}
      ${ops.length ? `<div class="grid g-3 bw-grid">${ops.slice(0, 3).map((op) => RN.ui.opCard(op, { compact: true, why: matchLine(op) })).join('')}</div>`
        : RN.ui.empty({ icon: 'bookmark', title: 'No one saved yet', body: 'Save operators from Browse or any profile. They land here for side-by-side compare and intro requests.', cta: '<a class="btn btn-sm" href="#browse">Browse talent</a>' })}
    </section>

    ${savedSearchesSection()}

    <section class="bw-sec">
      ${secHead('Recently viewed')}
      ${viewed.length ? `<div class="bw-mini-list">${viewed.map((v) => miniRow(v.op, `Viewed ${RN.fmt.ago(v.ts)}`)).join('')}</div>`
        : `<div class="bw-quiet">${icon('eye')}<span>Profiles you open show up here so you can get back to them.</span><a class="act" href="#browse">Browse talent${icon('arrow')}</a></div>`}
    </section>`;
  }

  /* ---------- Saved searches (created on Browse, kept in seen.savedSearches) ---------- */
  // Searches saved by this client (a record with an owner email belongs to that client only)
  const savedSearches = () => (Array.isArray(seen().savedSearches) ? seen().savedSearches : []).filter((x) => x && (!x.owner || isMe(x.owner)));
  function critText(k, v) {
    switch (k) {
      case 'roleCategories': case 'roleCategory': return RN.fields.catLabel(v);
      case 'hoursPerMonth': return v === '19' ? 'Any available time' : 'At least ' + RN.w.label('hoursPerMonth', v);
      case 'revenueRange': return RN.w.label('revenueRange', v) + ' revenue';
      case 'employeeRange': return RN.w.label('employeeRange', v) + ' employees';
      case 'rateMax': return +v >= RN.fields.rateMax.max ? '' : 'Up to $' + Math.round(+v) + ' / hr';
      case 'risMin': return 'Reputation Index ' + RN.w.label('risMin', v);
      default: return RN.fields[k] ? RN.w.label(k, v) : String(v);
    }
  }
  function critLine(ss) {
    const out = [];
    if (ss.q) out.push(`“${ss.q}”`);
    (ss.tags || []).forEach((t) => out.push(t));
    const f = ss.filters || {};
    Object.keys(f).forEach((k) => [].concat(f[k]).forEach((v) => { if (v !== '' && v != null) out.push(critText(k, v)); }));
    const parts = out.filter(Boolean);
    return parts.length > 5 ? parts.slice(0, 5).join(' · ') + ` · ${parts.length - 5} more` : parts.join(' · ');
  }
  function savedSearchesSection() {
    const list = savedSearches().slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return `<section class="bw-sec" aria-labelledby="bw-ss-t">
      <div class="bw-sec-hd"><h2 class="h4" id="bw-ss-t" tabindex="-1">Saved searches${list.length ? ` <span class="muted">${list.length}</span>` : ''}</h2>${list.length ? `<a class="act" href="#browse">New search${icon('arrow')}</a>` : ''}</div>
      ${list.length ? `<ul class="bw-ss">${list.map((ss) => {
        const line = critLine(ss);
        const name = ss.name || line || 'Saved search';
        return `<li class="bw-ss-i">
          <span class="bw-ss-ic" aria-hidden="true">${icon('search')}</span>
          <div class="grow"><b>${esc(name)}</b><span class="tiny muted">${esc([line !== name ? line : '', ss.createdAt ? 'Saved ' + RN.fmt.ago(ss.createdAt) : ''].filter(Boolean).join(' · ') || 'All operators')}</span></div>
          <div class="bw-ss-a">
            <button type="button" class="btn btn-line btn-sm" data-act="bw-ss-run" data-id="${esc(ss.id)}" aria-label="Run saved search: ${esc(name)}">Run search</button>
            <button type="button" class="x-btn" data-act="bw-ss-del" data-id="${esc(ss.id)}" aria-label="Delete saved search: ${esc(name)}" title="Delete">${icon('x')}</button>
          </div>
        </li>`;
      }).join('')}</ul>`
        : `<div class="bw-quiet">${icon('search')}<span>No saved searches yet. Save a search on Browse and run it again here in one click.</span><a class="act" href="#browse">Go to Browse${icon('arrow')}</a></div>`}
    </section>`;
  }
  RN.actions['bw-ss-run'] = (el) => {
    const ss = savedSearches().find((x) => x.id === el.dataset.id);
    if (!ss) return;
    RN.store.update((s) => {
      s.browse = { q: ss.q || '', tags: (ss.tags || []).slice(), filters: JSON.parse(JSON.stringify(ss.filters || {})), sort: 'best', view: (s.browse && s.browse.view) || 'grid' };
    }, 'browse');
    RN.go('browse');
  };
  let lastDeleted = null;
  RN.actions['bw-ss-del'] = (el) => {
    const list = savedSearches();
    const at = list.findIndex((x) => x.id === el.dataset.id);
    if (at < 0) return;
    lastDeleted = { item: list[at], at };
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { savedSearches: (s.seen.savedSearches || []).filter((x) => x.id !== el.dataset.id) }); }, 'seen');
    RN.rerender();
    const hd = document.getElementById('bw-ss-t');
    if (hd) hd.focus({ preventScroll: true });
    RN.ui.toast(`Saved search deleted`, { icon: 'check', action: { label: 'Undo', act: 'bw-ss-undo' } });
  };
  RN.actions['bw-ss-undo'] = () => {
    if (!lastDeleted) return;
    const { item, at } = lastDeleted;
    lastDeleted = null;
    RN.store.update((s) => { const l = (s.seen.savedSearches || []).filter((x) => x.id !== item.id); l.splice(Math.min(at, l.length), 0, item); s.seen = Object.assign({}, s.seen, { savedSearches: l }); }, 'seen');
    if (RN.currentRoute() && RN.currentRoute().view.name.startsWith('buyer')) RN.rerender();
    RN.ui.toast('Saved search restored');
  };

  function prefChips(prefs) {
    const c = me().company;
    const chips = [
      c.industry && RN.w.label('industry', c.industry),
      c.revenueRange && RN.w.label('companyRevenue', c.revenueRange) + ' revenue',
      c.employeeRange && RN.w.label('companyEmployees', c.employeeRange) + ' employees',
    ];
    if (prefs) {
      chips.push(prefs.roleCategory && RN.fields.catLabel(prefs.roleCategory));
      (prefs.salesMotions || []).forEach((m) => chips.push(RN.w.label('salesMotions', m)));
      chips.push(prefs.engagementType && RN.w.label('engagementType', prefs.engagementType));
      chips.push(prefs.need && prefs.need !== 'not_sure' && RN.w.label('need', prefs.need));
    }
    return chips.filter(Boolean).map((x) => `<span class="pill pill-line">${esc(x)}</span>`).join('');
  }

  function miniRow(op, meta, extra) {
    const f = fitFor(op);
    return `<a class="bw-mini" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">
      ${RN.ui.avatar(op, 'ava-sm')}
      <span class="grow"><b class="serif-up">${esc(op.name)}</b><span class="tiny muted">Fractional ${esc(op.role)}${meta ? ' · ' + esc(meta) : ''}</span></span>
      ${f.signals.length ? `<span class="bw-fit" title="${esc(f.label)}: ${f.count} of ${f.signals.length} match signals">${esc(f.pct)}%<i>match</i></span>` : ''}
      ${extra || icon('chev-right')}
    </a>`;
  }

  /* ================= Shortlist ================= */
  const sel = new Set();
  let selInit = false;
  function shortlist() {
    const ops = shortOps();
    if (!selInit) { st().compare.forEach((id) => { if (st().shortlist.includes(id)) sel.add(id); }); selInit = true; }
    [...sel].forEach((id) => { if (!st().shortlist.includes(id)) sel.delete(id); });
    const notes = seen().notes || {};
    const similar = ops.length ? RN.model.similar(ops[0], 8).filter((o) => !st().shortlist.includes(o.id)).slice(0, 3) : [];
    return `${head({
      title: 'Shortlist',
      sub: 'Operators you saved. Select up to four to compare, request intros, and keep private notes.',
      actions: `<a class="btn btn-line" href="#browse">${icon('search')}Find more</a>`,
    })}
    ${ops.length ? `<div class="bw-selbar" role="region" aria-label="Compare selection">
        <span class="bw-selbar-l" data-bw-selcount>${selText()}</span>
        <button type="button" class="act muted" data-act="bw-sel-clear" ${sel.size ? '' : 'hidden'}>Clear</button>
        <button type="button" class="btn btn-sm" data-act="bw-compare" ${sel.size >= 2 ? '' : 'disabled'}>${icon('compare')}Compare selected</button>
      </div>
      <div class="grid g-auto bw-sl-grid">${ops.map((op) => {
        const i = introFor(op.id);
        const on = sel.has(op.id);
        const meta = `<div class="bw-sl-x">
          <div class="bw-note"><label class="tiny" for="bw-note-${esc(op.id)}">Your note</label>
            <textarea id="bw-note-${esc(op.id)}" class="textarea" rows="2" maxlength="600" data-input="bw-note" data-id="${esc(op.id)}" placeholder="Why ${esc(op.first)} stands out, questions for the first call">${esc(notes[op.id] || '')}</textarea>
            <span class="tiny faint" data-saved>${notes[op.id] ? 'Saved. Only you see this.' : 'Only you see this.'}</span></div>
          <div class="bw-sl-row">
            <label class="bw-check"><input type="checkbox" value="${esc(op.id)}" data-change="bw-sel" ${on ? 'checked' : ''}><span>Select to compare</span></label>
            ${i ? `<a class="bw-sl-intro" href="#buyer.intros">${introPill(i)}<span>View intro</span></a>` : `<button type="button" class="btn btn-sm" data-act="intro-open" data-id="${esc(op.id)}">Request intro</button>`}
          </div>
        </div>`;
        return `<div class="bw-sl ${on ? 'is-sel' : ''}" data-op="${esc(op.id)}">${RN.ui.opCard(op, { why: matchLine(op), meta })}</div>`;
      }).join('')}</div>
      ${similar.length ? `<section class="bw-sec">${secHead(`Operators like ${esc(ops[0].first)}`, `<a class="act" href="#browse.${esc(ops[0].catKey)}">More in ${esc(RN.fields.catLabel(ops[0].catKey))}${icon('arrow')}</a>`)}
        <div class="grid g-3 bw-grid">${similar.map((op) => RN.ui.opCard(op, { compact: true, why: matchLine(op) })).join('')}</div></section>` : ''}`
      : RN.ui.empty({ icon: 'bookmark', title: 'Your shortlist is empty', body: 'Save operators from Browse or any profile with the bookmark. They land here for side-by-side compare and intro requests.', cta: '<a class="btn btn-sm" href="#browse">Browse talent</a>' })}`;
  }
  function selText() {
    return sel.size ? `<b>${sel.size} of 4</b> selected to compare` : 'Select two to four operators to compare side by side';
  }
  function syncSelBar() {
    const bar = RN.$('.bw-selbar');
    if (!bar) return;
    bar.querySelector('[data-bw-selcount]').innerHTML = selText();
    bar.querySelector('[data-act="bw-compare"]').disabled = sel.size < 2;
    bar.querySelector('[data-act="bw-sel-clear"]').hidden = !sel.size;
  }
  RN.inputs['bw-sel'] = (el) => {
    const id = el.value;
    if (el.checked) {
      if (sel.size >= 4) { el.checked = false; RN.ui.toast('Compare holds four operators. Unselect one to add another.', { icon: 'info' }); return; }
      sel.add(id);
    } else sel.delete(id);
    const card = el.closest('.bw-sl');
    if (card) card.classList.toggle('is-sel', el.checked);
    syncSelBar();
  };
  RN.actions['bw-sel-clear'] = () => {
    sel.clear();
    RN.$$('.bw-sl').forEach((c) => { c.classList.remove('is-sel'); const b = c.querySelector('input[data-change="bw-sel"]'); if (b) b.checked = false; });
    syncSelBar();
  };
  RN.actions['bw-compare'] = () => {
    const ids = [...sel].filter((id) => st().shortlist.includes(id)).slice(0, 4);
    if (ids.length < 2) { RN.ui.toast('Select at least two operators to compare.', { icon: 'info' }); return; }
    const prev = st().compare.slice();
    RN.store.update((s) => { s.compare = ids; }, 'compare');
    ids.filter((id) => !prev.includes(id)).forEach((id) => RN.track('compare_add', { opId: id, source: 'shortlist' }));
    RN.go('compare');
  };

  const noteTimers = {};
  RN.inputs['bw-note'] = (el) => {
    const id = el.dataset.id;
    const v = el.value;
    const flag = el.parentElement.querySelector('[data-saved]');
    if (flag) flag.textContent = 'Saving…';
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(() => {
      RN.store.update((s) => { s.seen = Object.assign({}, s.seen); s.seen.notes = Object.assign({}, s.seen.notes, { [id]: v }); }, 'seen');
      if (flag) flag.textContent = v.trim() ? 'Saved. Only you see this.' : 'Only you see this.';
    }, 450);
  };

  /* ================= Intros ================= */
  const openThreads = new Set();
  function intros() {
    const group = (i) => (isOpen(i) ? 0 : i.status === 'hired' ? 1 : 2);
    const list = myIntros().slice().sort((a, b) => group(a) - group(b) || new Date(b.createdAt) - new Date(a.createdAt));
    const open = list.filter(isOpen).length;
    return `${head({
      title: 'Intro requests',
      sub: 'Where each request stands and what happens next. Operators reply within 72 hours, then our team introduces you by email.',
    })}
    ${list.length ? `<p class="small muted bw-count">${RN.fmt.plural(list.length, 'request')} · ${open} in progress</p>
      <div class="stack bw-intros" style="--gap:18px">${list.map(introCard).join('')}</div>`
      : RN.ui.empty({ icon: 'handshake', title: 'No intro requests yet', body: 'Request an intro from any profile, your shortlist or a compare. Operators reply within 72 hours.', cta: '<a class="btn btn-sm" href="#buyer.shortlist">Go to shortlist</a>' })}`;
  }

  // The shared lifecycle track. A request the client closed shows how far it got, then Withdrawn or Not a fit.
  function lifecycle(i) {
    if (i.status !== 'declined' || !(i.withdrawn || i.closedBy === 'client')) return RN.ui.introTrack(i);
    const r = reachedIndex(i);
    const steps = RN.intro.steps.slice(0, r + 1).map((s) => { const d = stepDate(i, s); return { l: statusLabel(s), state: 'done', date: d ? RN.fmt.dateShort(d) : '' }; });
    steps.push({ l: i.withdrawn ? 'Withdrawn' : 'Not a fit', state: 'stop', date: RN.fmt.dateShort(lastTs(i)) });
    return RN.ui.track(steps, 'Intro progress');
  }

  function introCard(i) {
    const op = RN.model.byId(i.opId);
    if (!op) return '';
    const sum = RN.intro.summary(i, false);
    const closed = i.status === 'declined';

    let next = '';
    let actions = '';
    const sim = { pending: ['interested', `${op.first} replies Interested`], interested: ['rn_qualified', 'Our team qualifies the fit'], rn_qualified: ['introduced', 'Our team sends the intro'] }[i.status];
    const simBtn = sim ? `<button type="button" class="bw-sim" data-act="bw-sim" data-id="${esc(i.id)}" data-to="${sim[0]}" title="Prototype control: moves the request as the operator or our team would">${icon('bolt')}Prototype: ${esc(sim[1])}</button>` : '';
    if (i.status === 'pending') {
      const h = hoursLeft(i);
      const f1 = esc(op.first);
      next = h > 0 ? `${f1} has <b>${h} hours</b> left to reply. ${f1} sees your scope and company size, not your name. If ${f1} passes, we suggest two operators with the same fit.` : `${f1} has not replied in 72 hours. Our team is following up and will suggest two operators with the same fit today.`;
      actions = `<button type="button" class="btn btn-line btn-sm" data-act="bw-withdraw" data-id="${esc(i.id)}">Withdraw request</button>${simBtn}`;
    } else if (i.status === 'interested') {
      next = `<b>${esc(op.name)} is interested.</b> Our team will introduce you within one business day.`;
      actions = `<button type="button" class="btn btn-line btn-sm" data-act="bw-withdraw" data-id="${esc(i.id)}">Withdraw request</button>${simBtn}`;
    } else if (i.status === 'rn_qualified') {
      next = `<b>Our team confirmed the fit.</b> Your intro email to ${esc(op.first)} goes out within one business day.`;
      actions = `<button type="button" class="btn btn-line btn-sm" data-act="bw-withdraw" data-id="${esc(i.id)}">Withdraw request</button>${simBtn}`;
    } else if (i.status === 'introduced') {
      next = `<b>You are connected by email.</b> Book the first call with ${esc(op.first)}, then tell us how it went.`;
      actions = `<button type="button" class="btn btn-sm" data-act="bw-hired" data-id="${esc(i.id)}">${icon('handshake')}We hired ${esc(op.first)}</button><button type="button" class="btn btn-line btn-sm" data-act="bw-notfit" data-id="${esc(i.id)}">Not a fit</button>`;
    } else if (i.status === 'hired') {
      const reviewed = hasMyReview(op.id);
      next = reviewed ? `<b>${esc(op.first)} is working with ${esc(me().company.name)}.</b> Your review is live on ${esc(op.first)}’s profile.` : `<b>${esc(op.first)} is working with ${esc(me().company.name)}.</b> When you are ready, a short CORE review verifies ${esc(op.first)}’s focus areas.`;
      actions = reviewed ? `<a class="btn btn-line btn-sm" href="#op.${esc(op.slug)}">See the review on ${esc(op.first)}’s profile</a>` : `<button type="button" class="btn btn-sm" data-act="bw-review-start" data-id="${esc(i.id)}">${icon('star')}Leave a CORE review</button>`;
    } else if (closed) {
      const alts = RN.model.similar(op, 12).filter((o) => !myIntros().some((x) => x.opId === o.id && x.status !== 'declined'))
        .map((o) => ({ o, pct: fitFor(o).pct })).sort((a, b) => b.pct - a.pct || b.o.ris.score - a.o.ris.score).slice(0, 2).map((x) => x.o);
      next = i.withdrawn ? `You withdrew this request. You can ask ${esc(op.first)} again any time.` : i.closedBy === 'client' ? `You marked ${esc(op.first)} as not a fit. Here are two operators with a similar fit.` : `<b>${esc(op.first)} can’t take this one.</b> Here are two operators with the same fit.`;
      actions = alts.length && !i.withdrawn ? `<div class="bw-alts">${alts.map((o) => miniRowStatic(o)).join('')}</div>` : '';
    }

    const thread = [{ from: 'You', text: 'Requested an intro' + (sum.need ? ': ' + sum.need : ''), ts: i.createdAt, note: i.note }].concat((i.thread || []).map((t) => ({ from: t.from === me().name ? 'You' : t.from, text: t.text, ts: t.ts })));
    const toTeam = !['introduced', 'hired'].includes(i.status);
    return `<article class="card bw-intro ${closed ? 'is-closed' : ''}" id="intro-${esc(i.id)}">
      <div class="bw-intro-hd">
        <a class="bw-intro-who" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${RN.ui.avatar(op, 'ava-md')}<span><b class="serif-up">${esc(op.name)}</b><span class="small muted">Fractional ${esc(op.role)} · ${esc(op.avail.label)}</span></span></a>
        <div class="bw-intro-st">${introPill(i)}<span class="tiny faint">Requested ${esc(RN.fmt.date(i.createdAt))}</span></div>
      </div>
      <div class="bw-intro-scope">
        ${sum.need ? `<span><span class="label">Need</span>${esc(sum.need)}</span>` : ''}
        ${sum.scope ? `<span><span class="label">Scope</span>${esc(sum.scope)}</span>` : ''}
      </div>
      <div class="bw-track">${lifecycle(i)}</div>
      ${next ? `<p class="bw-intro-next">${next}</p>` : ''}
      ${actions ? `<div class="row bw-intro-act">${actions}</div>` : ''}
      <details class="bw-thread" data-thread="${esc(i.id)}" ${openThreads.has(i.id) ? 'open' : ''}>
        <summary>${icon('message')}Thread <span class="muted">· ${RN.fmt.plural(thread.length, 'update')}</span>${icon('chev-down')}</summary>
        <ol class="bw-thread-l">${thread.map((t) => `<li><div class="row between"><b>${esc(t.from)}</b><span class="tiny faint">${esc(RN.fmt.ago(t.ts))}</span></div><p>${esc(t.text)}</p>${t.note ? `<blockquote>${esc(t.note)}</blockquote>` : ''}</li>`).join('')}</ol>
        ${closed ? '' : `<form class="bw-msg" data-submit="bw-msg" data-id="${esc(i.id)}">
          <label class="sr-only" for="bw-msg-${esc(i.id)}">Message</label>
          <input class="input" id="bw-msg-${esc(i.id)}" name="text" maxlength="400" autocomplete="off" placeholder="${toTeam ? 'Add context for our team' : 'Message ' + esc(op.first)}">
          <button class="btn btn-line btn-sm" type="submit">${icon('send')}Send</button>
        </form>`}
      </details>
    </article>`;
  }

  function miniRowStatic(op) {
    const f = fitFor(op);
    return `<div class="bw-mini is-static">
      ${RN.ui.avatar(op, 'ava-sm')}
      <a class="grow" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}"><b class="serif-up">${esc(op.name)}</b><span class="tiny muted">Fractional ${esc(op.role)} · ${esc(op.avail.label)}</span></a>
      ${f.signals.length ? `<span class="bw-fit">${esc(f.pct)}%<i>match</i></span>` : ''}
      <button type="button" class="btn btn-line btn-sm" data-act="intro-open" data-id="${esc(op.id)}">Request intro</button>
    </div>`;
  }

  const findIntro = (id) => st().intros.find((x) => x.id === id);

  RN.actions['bw-sim'] = (el) => {
    const i = findIntro(el.dataset.id);
    if (!i) return;
    RN.intro.setStatus(i.id, el.dataset.to);
    RN.ui.toast(`Status: ${esc(statusLabel(el.dataset.to))}. The client email is in the Outbox.`, { icon: 'bolt' });
    RN.rerender();
  };

  RN.actions['bw-withdraw'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    if (!op) return;
    RN.ui.modal({
      width: 480,
      title: `Withdraw your request to ${esc(op.first)}?`,
      sub: `${esc(op.first)} and our team get a short note. You can ask again any time.`,
      foot: `<button class="btn btn-line" data-act="modal-close">Keep request</button><button class="btn btn-danger" data-act="bw-withdraw-ok" data-id="${esc(i.id)}">Withdraw</button>`,
    });
  };
  RN.actions['bw-withdraw-ok'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    RN.ui.closeModal();
    if (!op) return;
    RN.store.update((s) => {
      const r = s.intros.find((x) => x.id === i.id);
      r.status = 'declined'; r.withdrawn = true; r.closedBy = 'client';
      r.thread.push({ from: me().name, text: 'Withdrawn by the client', ts: RN.now().toISOString() });
    }, 'intros');
    RN.mail(op.name, 'An intro request was withdrawn', `The ${RN.w.label('industry', i.buyer.company.industry) || 'client'} company that asked to meet you withdrew its request. No action needed.`, 'intro');
    RN.ui.toast(`Request to ${esc(op.first)} withdrawn`);
    RN.rerender();
  };

  RN.actions['bw-hired'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    if (!op) return;
    RN.intro.setStatus(i.id, 'hired');
    RN.store.update((s) => { const r = s.intros.find((x) => x.id === i.id); r.hiredAt = RN.now().toISOString(); }, 'intros');
    RN.ui.toast(`Marked ${esc(op.first)} as hired. Congratulations.`, { icon: 'handshake', action: { label: 'Leave a review', act: 'bw-review-start', attrs: `data-id="${esc(i.id)}"` } });
    RN.rerender();
  };

  RN.actions['bw-notfit'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    if (!op) return;
    // One reason list for every client "Not a fit" (intros and projects), from the registry when it is there
    const reasons = RN.fields.notFitReason ? RN.w.field('notFitReason', '', { name: 'reason', compact: true, label: 'What didn’t fit?', help: 'Only our team sees this.' }) : '';
    RN.ui.modal({
      width: 520,
      title: `Not moving forward with ${esc(op.first)}?`,
      sub: 'We close the request and suggest two operators with a similar fit.',
      body: `<form id="bw-notfit-form" data-submit="bw-notfit" data-id="${esc(i.id)}" class="stack" style="--gap:16px">
        ${reasons}
        <div class="field"><label for="bw-notfit-r">${reasons ? 'Anything to add?' : 'What didn’t fit?'} <span class="opt">Optional, only our team sees this</span></label>
        <textarea class="textarea" id="bw-notfit-r" name="note" maxlength="400" style="min-height:96px" placeholder="${reasons ? 'What would a better match look like?' : 'Rate, timing, experience, chemistry on the first call'}"></textarea></div>
      </form>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="bw-notfit-form">Close request</button>`,
    });
  };
  RN.submits['bw-notfit'] = (form, d) => {
    const i = findIntro(form.dataset.id);
    const op = i && RN.model.byId(i.opId);
    RN.ui.closeModal();
    if (!op) return;
    const code = RN.fields.notFitReason ? String([].concat(d.reason || [])[0] || '') : '';
    const note = (d.note || '').trim();
    const reason = [code && RN.w.label('notFitReason', code), note].filter(Boolean).join('. ');
    RN.store.update((s) => {
      const r = s.intros.find((x) => x.id === i.id);
      r.status = 'declined'; r.closedBy = 'client'; r.closeReason = code; r.closeNote = note;
      r.thread.push({ from: me().name, text: 'Not a fit' + (reason ? ': ' + reason : ''), ts: RN.now().toISOString() });
    }, 'intros');
    RN.mail(op.name, `Update from ${me().company.name}`, `${me().name} decided not to move forward after your intro. Thank you for making time.\n\nClients who pass after a first call most often cite timing. Your profile and availability stay live.`, 'intro');
    RN.mail('Revenue Nomad team', `Client closed an intro: ${op.name}`, `${me().name} (${me().company.name}) marked ${op.name} as not a fit.${reason ? '\nReason: ' + reason : ''}\nSuggest two similar operators.`, 'intro');
    RN.ui.toast('Request closed. We picked two operators with a similar fit.');
    RN.rerender();
  };

  RN.submits['bw-msg'] = (form, d) => {
    const i = findIntro(form.dataset.id);
    const op = i && RN.model.byId(i.opId);
    const text = (d.text || '').trim();
    if (!op) return;
    if (!text) { RN.ui.toast('Write a message first.', { icon: 'info' }); return; }
    const toOp = ['introduced', 'hired'].includes(i.status);
    RN.store.update((s) => { s.intros.find((x) => x.id === i.id).thread.push({ from: me().name, text, ts: RN.now().toISOString() }); }, 'intros');
    if (toOp) RN.mail(op.name, `Message from ${me().name}`, text, 'intro');
    else RN.mail('Revenue Nomad team', `Note on intro request to ${op.name}`, `${me().name}, ${me().company.name}:\n${text}`, 'intro');
    openThreads.add(i.id);
    RN.ui.toast(toOp ? `Message sent to ${esc(op.first)}` : 'Sent to our team');
    RN.rerender();
  };

  // Hired intro -> CORE review. Reuses an open review request for this operator or creates one for the client.
  // Works from anywhere: data-id="<introId>", or data-op="<opId>" (the client's introduced or hired intro).
  RN.actions['bw-review-start'] = (el) => {
    RN.ui.closeModal();
    const i = el.dataset.id ? findIntro(el.dataset.id) : BW.reviewableIntro(el.dataset.op);
    const op = i && RN.model.byId(i.opId);
    if (!op) { RN.ui.toast('Reviews open once you are introduced to the operator.', { icon: 'info' }); return; }
    let rr = myReviewRequests().find((r) => r.opId === i.opId && r.status === 'sent');
    if (!rr) {
      const c = me().company;
      const f = i.fields || {};
      rr = {
        id: RN.uid('rr'), opId: i.opId, reviewer: { name: me().name, email: me().email, company: c.name, title: me().title || '' }, engagement: c.name,
        // What we already know from the intro, so the review form opens prefilled
        details: { company: c.name, engagementType: f.engagementType || '', start: i.hiredAt ? String(i.hiredAt).slice(0, 7) : '', end: '', ongoing: true, roleCategory: f.roleCategory || op.catKey, role: op.role, revenueRange: c.revenueRange || '', employeeRange: c.employeeRange || '' },
        status: 'sent', sentAt: RN.now().toISOString(), source: 'client', introId: i.id,
      };
      RN.store.update((s) => { s.reviewRequests.unshift(rr); }, 'reviewRequests');
      RN.track('review_request', { opId: i.opId, source: 'client' });
    }
    RN.go('review.' + rr.id);
  };

  /* ================= Projects ================= */
  // One project card everywhere: projects.js owns it (RN.projects.card). The local card is only a fallback.
  const projectCard = (p) => (RN.projects && typeof RN.projects.card === 'function' ? RN.projects.card(p, { from: 'workspace' }) : localProjectCard(p));
  function localProjectCard(p) {
    const f = p.fields || {};
    const resp = (p.responses || []).filter((r) => r.status === 'interested');
    const bits = [
      f.roleCategory && RN.fields.catLabel(f.roleCategory),
      f.engagementType && RN.w.label('engagementType', f.engagementType),
      f.engagementType === 'project' && f.projectBudget ? RN.fmt.usd(f.projectBudget) + ' budget' : f.hoursPerMonth && RN.w.label('hoursPerMonth', f.hoursPerMonth),
      f.term && RN.w.label('term', f.term),
    ].filter(Boolean);
    const when = p.status === 'draft' ? `Draft saved ${RN.fmt.ago(p.createdAt)}` : `Posted ${RN.fmt.date(p.postedAt || p.createdAt)}`;
    return `<article class="card bw-proj">
      <div class="bw-proj-main">
        <div class="row" style="--gap:10px">${RN.ui.statusPill('project', p.status)}<span class="tiny faint">${esc(when)}</span></div>
        <h3 class="h4"><a href="#project.${esc(p.id)}">${esc(p.title || 'Untitled project')}</a></h3>
        <p class="small muted">${esc(bits.join(' · '))}</p>
      </div>
      <div class="bw-proj-side">
        ${p.status === 'draft' ? '' : `<div class="bw-proj-stats"><span><b class="num">${(p.invited || []).length}</b>Invited</span><span><b class="num">${resp.length}</b>Interested</span></div>`}
        <a class="btn btn-sm ${p.status === 'draft' || resp.length ? '' : 'btn-line'}" href="#project.${esc(p.id)}">${p.status === 'draft' ? 'Finish and post' : resp.length ? 'Review responses' : 'Open project'}</a>
      </div>
    </article>`;
  }
  function projects() {
    const list = myProjects().slice().sort((a, b) => new Date(b.updatedAt || b.postedAt || b.createdAt) - new Date(a.updatedAt || a.postedAt || a.createdAt));
    // A draft's "Finish and post" is the primary action; the header button steps back when there is one
    const hasDraft = list.some((p) => p.status === 'draft');
    return `${head({
      title: 'Projects',
      sub: 'Post a scoped project from a Blueprint. Matches are ranked on the same fields as operator profiles, and responses land here.',
      actions: list.length ? `<a class="btn ${hasDraft ? 'btn-line' : ''}" href="#project.new">${icon('plus')}Post a project</a>` : '',
    })}
    ${list.length ? `<div class="stack bw-projs" style="--gap:14px">${list.map(projectCard).join('')}</div>`
      : RN.ui.empty({ icon: 'briefcase', title: 'No projects yet', body: 'Start from a Blueprint: a scoped project with a 30/60/90-day plan, typical hours and rates. Posting takes three steps.', cta: '<a class="btn btn-sm" href="#project.new">Post a project</a>' })}
    <div class="bw-quiet">${icon('layers')}<span>Not sure how to scope it? Blueprints show the outcome plan, hours and typical rate for common fractional projects.</span><a class="act" href="#blueprints">Browse Blueprints${icon('arrow')}</a></div>`;
  }

  /* ================= Company + match preferences ================= */
  function company() {
    const c = me().company;
    const p = BW.prefs() || {};
    const filled = [c.name, c.website, c.hq, c.industry, c.revenueRange, c.employeeRange, p.roleCategory, (p.salesMotions || []).length, p.engagementType, p.need].filter(Boolean).length;
    return `${head({
      title: 'Company profile',
      sub: 'Tell us about your company once. Every operator profile you open is scored against it.',
    })}
    <div class="bw-co">
      <form class="stack bw-co-form" style="--gap:18px" data-submit="bw-company" data-change="bw-co-live" data-input="bw-co-dirty" novalidate>
        <section class="card">
          <div class="card-hd"><div><h3>Your company</h3><p class="sub">Shared with operators as firmographics only (industry and size) until you are introduced.</p></div><span class="tiny muted bw-co-pct">${filled} of 10 filled</span></div>
          <div class="stack" style="--gap:22px">
            <div class="grid g-2" style="--gap:16px">
              <div class="field"><label for="bw-co-name">Company name</label><input class="input" id="bw-co-name" name="name" value="${esc(c.name || '')}" autocomplete="organization" required></div>
              <div class="field"><label for="bw-co-web">Website</label><input class="input" id="bw-co-web" name="website" value="${esc(c.website || '')}" placeholder="yourcompany.com" autocomplete="url"></div>
            </div>
            <div class="grid g-2" style="--gap:16px">
              <div class="field"><label for="bw-co-hq">Headquarters</label><input class="input" id="bw-co-hq" name="hq" value="${esc(c.hq || '')}" placeholder="City, State"></div>
              ${RN.w.field('industry', c.industry, { name: 'industry', id: 'bw-co-ind', help: '' })}
            </div>
            ${RN.w.field('companyRevenue', c.revenueRange, { name: 'revenueRange' })}
            ${RN.w.field('companyEmployees', c.employeeRange, { name: 'employeeRange' })}
          </div>
        </section>
        <section class="card">
          <div class="card-hd"><div><h3>Match preferences</h3><p class="sub">Saved to your account. Every operator profile you open is scored against these.</p></div>${p.savedAt ? `<span class="tiny muted">Saved ${esc(RN.fmt.ago(p.savedAt))}</span>` : ''}</div>
          <div class="stack" style="--gap:22px">
            ${RN.w.field('roleCategory', p.roleCategory || '', { name: 'roleCategory', help: 'The role you are hiring for.' })}
            ${RN.w.field('salesMotions', p.salesMotions || [], { name: 'salesMotions', label: 'GTM motion', help: 'How you sell today. Operators who have run the same motion score higher.' })}
            ${RN.w.field('engagementType', p.engagementType || '', { name: 'engagementType', help: 'Pick the shape of help you expect. You can change it per request.' })}
            ${RN.w.field('need', p.need || '', { name: 'need', help: 'We match this to operators with client-verified skills in the areas that solve it.' })}
          </div>
        </section>
        <div class="bw-co-save">
          <p class="small muted grow" data-bw-dirty>These use the same fields operators fill in at signup, so a match signal compares like with like.</p>
          <button class="btn" type="submit">Save preferences</button>
        </div>
      </form>
      <aside class="bw-co-side" aria-live="polite" data-bw-preview>${preview(BW.brief(), c.name)}</aside>
    </div>`;
  }

  function preview(brief, name) {
    const rows = RN.model.ops.filter((o) => !o.hidden).map((op) => ({ op, fit: RN.model.fit(op, brief) }));
    const good = rows.filter((r) => r.fit.pct >= 50).length;
    const top = rows.slice().sort((a, b) => b.fit.pct - a.fit.pct || b.op.ris.score - a.op.ris.score).slice(0, 4);
    const checks = [
      { l: 'Company revenue', on: !!brief.revenueRange },
      { l: 'Employee range', on: !!brief.employeeRange },
      { l: 'GTM motion', on: brief.salesMotions.length > 0 },
      { l: 'Industry', on: brief.industries.length > 0 },
      { l: 'Expertise', on: !!(brief.roleCategory || brief.need) },
    ];
    return `<section class="card bw-prev">
      <span class="label">What this changes</span>
      <div class="bw-prev-n"><span class="num">${RN.fmt.int(good)}</span><span>operators are a good or strong match for ${esc(name || 'your company')}</span></div>
      <p class="small muted">Match signals compare your answers with each operator’s own profile, field by field. The more you set, the fewer and closer the matches.</p>
      <ul class="bw-checks">${checks.map((c) => `<li class="${c.on ? 'on' : ''}">${icon(c.on ? 'check-circle' : 'minus')}${esc(c.l)}</li>`).join('')}</ul>
      <div class="bw-prev-top">
        <span class="label">Top matches right now</span>
        ${top.map((r) => `<a class="bw-prev-op" href="#op.${esc(r.op.slug)}" data-track-view="${esc(r.op.id)}">
          ${RN.ui.avatar(r.op, 'ava-sm')}
          <span class="grow"><b class="serif-up">${esc(r.op.name)}</b><span class="tiny muted">${esc(bestSignal(r.fit, r.op))}</span></span>
          <span class="bw-ring">${RN.chart.ring(r.fit.pct, { size: 42, stroke: 4, label: r.fit.pct + '% match' })}<b>${esc(r.fit.pct)}</b></span>
        </a>`).join('')}
      </div>
      ${brief.roleCategory ? `<a class="act" href="#browse.${esc(brief.roleCategory)}">Browse ${esc(RN.fields.catLabel(brief.roleCategory))} operators${icon('arrow')}</a>` : `<a class="act" href="#browse">Browse talent${icon('arrow')}</a>`}
    </section>`;
  }

  function briefFromForm(form) {
    const d = RN.ui.formData(form);
    const company = { revenueRange: d.revenueRange, employeeRange: d.employeeRange, industry: d.industry };
    return { brief: BW.brief({ company, roleCategory: d.roleCategory, salesMotions: d.salesMotions || [], need: d.need, engagementType: d.engagementType }), name: d.name };
  }
  RN.inputs['bw-co-live'] = (form) => {
    const box = RN.$('[data-bw-preview]');
    const { brief, name } = briefFromForm(form);
    if (box) box.innerHTML = preview(brief, name);
    markDirty(form);
  };
  RN.inputs['bw-co-dirty'] = (form) => markDirty(form);
  function markDirty(form) {
    const n = form.querySelector('[data-bw-dirty]');
    if (n) { n.textContent = 'Unsaved changes. Save to apply them to every profile you open.'; n.classList.add('is-dirty'); }
  }

  RN.submits['bw-company'] = (form, d) => {
    const name = (d.name || '').trim();
    if (!name) { RN.ui.toast('Add your company name.', { icon: 'info' }); form.querySelector('#bw-co-name').focus(); return; }
    const company = { name, website: (d.website || '').trim(), hq: (d.hq || '').trim(), industry: d.industry || '', revenueRange: d.revenueRange || '', employeeRange: d.employeeRange || '' };
    const prefs = { roleCategory: d.roleCategory || '', salesMotions: d.salesMotions || [], engagementType: d.engagementType || '', need: d.need || '', savedAt: RN.now().toISOString() };
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { company, companyPrefs: prefs }); }, 'seen');
    BW.applyCompany();
    RN.shell.renderHeader();
    RN.ui.toast('Company profile and preferences saved');
    RN.rerender();
  };
})();
