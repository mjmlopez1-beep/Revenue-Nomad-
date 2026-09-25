/* Client workspace (#buyer, #buyer.<tab>): the signed-in client's home base, and one page family that changes
   with the account. The client is RN.personas.buyer: the demo client (Jordan Ellis) or a visitor who requested an
   intro and became their own client (RN.shell.setClient). Records are matched on that client's email.

   Lifecycle (BW.lifecycle): derived from the client's records, never hard-coded per scenario. It only chooses the
   layout (data-bw-state on .bw) and is never shown.
     S0 New       nothing posted, nothing hired: Start here (plain-English need, Blueprints, get set up)
     S1 Hiring    engagements open or intros in flight, no hires: Now feed + hiring pipeline
     S2 Active    one or more active hires: stats, Now feed, Team strip
     S3 Mixed     active and ended hires
     S4 Alumni    every hire has ended: rehire, reviews owed, a check-in
   Tabs: Overview, Team (hires, time in seat, next dates, spend), Engagements (grouped by status), Talent (shortlist,
   intros, saved searches, recently viewed), History (coverage over time and the account log), Company.
   Old links keep working: #buyer.projects, #buyer.hires, #buyer.shortlist, #buyer.intros (scrolls to the intros).
   Pricing (D1): companies pay no fees. Every figure is the operator's rate or the project budget, labelled estimated.

   The Now feed (BW.now): every item is {kind, tier, sort, tab, icon, pill, ctx, title, body, note, people[], primary,
   secondary[], extra}. Tier 1 waiting on you, 2 due, 3 owed, 4 worth a look. Nav badges count tiers 1 to 3 only.

   Store keys written here (additive, other surfaces may read them):
     seen.notes             {opId: 'private note'}
     seen.company           {name, website, hq, industry, revenueRange, employeeRange}  (mirrored into RN.personas.buyer.company)
     seen.companyPrefs      {roleCategory, salesMotions[], engagementType, need, savedAt}
     seen.savedSearches     read, run and deleted here (created on Browse); lastRunAt and lastRunIds added on run
     seen.engagementsViewed {projectId: iso}  written when the client opens their engagement page (#engagement.<id>)
     seen.checkin           {answer, at, snoozeUntil}  the "What is next" check-in for an alumni client
     hire.endPlanned        the client chose "Let it end"; hire.checkins [{ts, note}]
     intro.withdrawn / intro.closedBy / intro.closeReason / intro.closeNote on client-closed intros
   Helpers exposed for other surfaces: RN.bw.brief(), RN.bw.applyCompany(), RN.bw.reviewableIntro(opId),
   RN.bw.lifecycle(), RN.bw.now(), RN.bw.markViewed(projectId). "Repost as a draft" runs the engagement page's own
   copy (pj-duplicate), which is wrapped here so a copy of a sample engagement stays part of the sample. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const BW = (RN.bw = RN.bw || {});

  const st = () => RN.store.state;
  const me = () => RN.personas.buyer;
  const seen = () => st().seen || {};
  const DAY = 864e5;
  const LIVE = ['posted', 'in_progress'];
  const usd = (n) => RN.fmt.usd(n);
  const NO_FEES = () => (RN.projects && RN.projects.NO_FEES) || 'No fees for companies. You pay the operator’s rate, nothing more.';
  const FEE_NOTE = 'You pay each operator’s rate and no fees.';

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
  // Engagements (stored as projects) carry their client (p.client). Seeded ones without one belong to the demo client.
  const myProjects = () => st().projects.filter((p) => {
    const email = (p.client && p.client.email) || p.owner || (p.buyer && p.buyer.email);
    return email ? isMe(email) : !!me().demo;
  });
  const myReviewRequests = () => st().reviewRequests.filter((r) => r.reviewer && isMe(r.reviewer.email));
  // Hires and their terms (RN.hire, intro.js), matched on the client's email. Cancelled ones included here.
  const myHires = () => (RN.hire ? RN.hire.list({ email: me().email }) : []);
  const activeHires = () => myHires().filter((h) => h.status === 'active');
  const hireForIntro = (i) => (RN.hire ? RN.hire.forSource('intro', i.id, i.opId) : null);
  const shortOps = () => st().shortlist.map(RN.model.byId).filter(Boolean);
  const introFor = (opId) => myIntros().find((i) => i.opId === opId && i.status !== 'declined');
  const statusLabel = (s) => RN.w.label('introStatus', s);
  const opOf = (h) => RN.model.byId(h.opId);
  const catOf = (h) => RN.hire.category(h);
  const projCat = (p) => ((p && p.fields) || {}).roleCategory || '';
  const isLive = (p) => LIVE.includes(p.status);
  const catLabel = (c) => (c ? RN.fields.catLabel(c) : 'Other');
  const catTag = (c) => (c ? `<span class="bw-cat">${RN.ui.catDot(c)}${esc(catLabel(c))}</span>` : '');
  // Interested responses with no decision yet. An operator already on the team is not a decision (hired another way).
  const undecided = (p) => { const hired = new Set(activeHires().map((h) => h.opId)); return (p.responses || []).filter((r) => r.status === 'interested' && !r.decision && !hired.has(r.opId)); };
  const newestFirst = (a, b) => new Date(b.updatedAt || b.postedAt || b.createdAt || 0) - new Date(a.updatedAt || a.postedAt || a.createdAt || 0);

  /* ---------- Dates (the dock clock moves RN.now) ---------- */
  const today = () => RN.hire.today();
  const dayOf = (v) => RN.hire.dayOf(v);
  const dmd = (v) => RN.hire.dateMD(v);                      // "Apr 20" (with the year when not this year)
  const dayDiff = (a, b) => RN.hire.dayDiff(a, b);           // whole days from a to b (days or timestamps)
  const daysSince = (v) => (v ? Math.max(0, Math.floor((RN.now() - new Date(v)) / DAY)) : 0);
  const plural = (n, one, many) => RN.fmt.plural(n, one, many);
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const monthYear = (v) => (v ? RN.fmt.monthYear(new Date(dayOf(v) + 'T12:00:00')) : '');
  const hoursText = (code) => (code ? RN.w.label('hoursPerMonth', code) : '');
  // "$250/hr · 40 hrs / month" or "$18,000 project budget"
  function termsLine(h, sep) {
    const t = h.terms || {};
    if (t.engagementType === 'project') return t.projectBudget ? `${usd(t.projectBudget)} project budget` : 'Project budget not recorded';
    return [t.rate ? RN.fmt.rate(t.rate) : '', hoursText(t.hoursPerMonth)].filter(Boolean).join(sep || ' · ') || 'Terms not recorded';
  }
  // History: "Fractional, $250/hr, 40 hrs / month, starts Apr 20"
  function termsSummary(h) {
    const t = h.terms || {};
    const bits = [t.engagementType ? RN.w.label('engagementType', t.engagementType) : ''];
    if (t.engagementType === 'project') bits.push(t.projectBudget ? `${usd(t.projectBudget)} budget` : '');
    else bits.push(t.rate ? RN.fmt.rate(t.rate) : '', hoursText(t.hoursPerMonth));
    if (t.startDate) bits.push('starts ' + dmd(t.startDate));
    return bits.filter(Boolean).join(', ');
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
  const lastTs = (i) => { const t = (i.thread || [])[(i.thread || []).length - 1]; return t ? t.ts : i.createdAt; };
  // Clamped to the 72-hour window (the dock clock can move back past a request's timestamp)
  function hoursLeft(i) { return Math.min(72, Math.max(0, Math.round(72 - (RN.now() - new Date(i.createdAt)) / 36e5))); }
  const introPill = (i) => (i.withdrawn ? RN.ui.statusPill('intro', 'withdrawn', 'Withdrawn')
    : i.closedBy === 'client' ? RN.ui.statusPill('intro', 'declined', 'Not a fit')
    : RN.ui.statusPill('intro', i.status));
  // A review counts once the client wrote it here, or completed a review request for the operator
  const myReviewOf = (opId) => st().reviews.find((r) => r.opId === opId && (isMe(r.reviewerEmail) || (!r.reviewerEmail && r.reviewer === me().name))) || null;
  const hasMyReview = (opId) => !!myReviewOf(opId) || myReviewRequests().some((r) => r.opId === opId && r.status === 'completed');
  BW.reviewableIntro = (opId) => myIntros().find((i) => i.opId === opId && ['introduced', 'hired'].includes(i.status) && !hasMyReview(opId)) || null;

  /* ---------- Per-render cache (the feed feeds the nav badges, the header and the Overview) ---------- */
  let cache = {};
  const cached = (k, fn) => (k in cache ? cache[k] : (cache[k] = fn()));

  /* ---------- Lifecycle state: derived from the records, it only picks the layout ---------- */
  BW.lifecycle = function () {
    const all = myHires();
    const hires = all.filter((h) => !h.cancelled);
    const active = hires.filter((h) => h.status === 'active');
    const ended = hires.filter((h) => h.status === 'ended');
    const projects = myProjects();
    const live = projects.filter(isLive);
    const introsAny = myIntros().filter((i) => !i.withdrawn);
    let state;
    if (!hires.length) state = !live.length && !introsAny.length && !projects.some((p) => ['staffed', 'closed'].includes(p.status)) ? 'S0' : 'S1';
    else if (active.length) state = ended.length ? 'S3' : 'S2';
    else state = 'S4';
    return { state, all, hires, active, ended, projects, live, introsAny };
  };
  const life = () => cached('life', BW.lifecycle);

  /* ---------- Derived metrics (RN.hire in intro.js holds the formulas) ---------- */
  const latestEnd = (a, b) => (RN.hire.winEnd(b) > RN.hire.winEnd(a) ? 1 : RN.hire.winEnd(b) < RN.hire.winEnd(a) ? -1 : 0);
  function metrics(L) {
    return cached('metrics', () => {
      const started = L.active.filter(RN.hire.started);
      // A term past its end date stops accruing (RN.hire.winEnd), so it is not part of what is paid each month now
      const monthly = started.filter((h) => !RN.hire.overdue(h)).reduce((a, h) => a + RN.hire.monthly(h), 0);
      const spent = L.hires.reduce((a, h) => a + RN.hire.spent(h), 0);
      const firstStart = L.hires.map((h) => h.terms && h.terms.startDate).filter(Boolean).sort()[0] || '';
      const committed = L.active.reduce((a, h) => a + RN.hire.committed(h), 0);
      const lastEnd = L.active.map((h) => h.terms && h.terms.endDate).filter(Boolean).sort().pop() || '';
      const groups = {};
      L.hires.forEach((h) => {
        const c = catOf(h) || '';
        const g = (groups[c] = groups[c] || { cat: c, spent: 0, names: [] });
        g.spent += RN.hire.spent(h);
        const op = opOf(h);
        if (op && !g.names.includes(op.name)) g.names.push(op.name);
      });
      const byCat = Object.values(groups).sort((a, b) => b.spent - a.spent);
      return { started, monthly, spent, firstStart, committed, lastEnd, byCat, anySpend: spent > 0 };
    });
  }
  // The nearest date on the team: an unstarted hire's start, or an active hire's term end. Overdue terms come first.
  function nextDate(L) {
    const first = (h) => (opOf(h) || {}).first || 'Your operator';
    const overdue = L.active.filter(RN.hire.overdue).sort((a, b) => (a.terms.endDate < b.terms.endDate ? -1 : 1))[0];
    if (overdue) return { warn: true, value: 'Term ended ' + dmd(overdue.terms.endDate), label: `${first(overdue)}’s term`, h: overdue };
    const c = [];
    L.active.forEach((h) => {
      const t = h.terms || {};
      if (!RN.hire.started(h) && t.startDate) c.push({ d: t.startDate, h, kind: 'start' });
      else if (t.endDate && t.endDate >= today()) c.push({ d: t.endDate, h, kind: 'end' });
    });
    c.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    if (c[0]) return { value: dmd(c[0].d), label: c[0].kind === 'start' ? `${first(c[0].h)} starts` : `${first(c[0].h)}’s term ends`, h: c[0].h, kind: c[0].kind, d: c[0].d };
    if (!L.active.length && L.ended.length) {
      const last = L.ended.slice().sort(latestEnd)[0];
      return { value: dmd(RN.hire.winEnd(last)), label: `Last engagement ended · ${first(last)}`, h: last, past: true };
    }
    return { value: 'None set', label: 'Open-ended terms' };
  }
  // No check-in in the last 30 days (the start date counts as the first), once the hire has run 30 days
  function lastCheckin(h) { const c = (h.checkins || []).slice().sort((a, b) => (a.ts < b.ts ? 1 : -1))[0]; return c ? c.ts : null; }
  function checkinOwed(h) {
    if (h.status !== 'active' || !RN.hire.started(h)) return false;
    if (dayDiff(h.terms.startDate, today()) < 30) return false;
    const last = lastCheckin(h);
    return last ? daysSince(last) >= 30 : true;
  }
  // The latest ended hire in the same role category, when it ended within 180 days before the engagement was posted
  function replaces(p, L) {
    const cat = projCat(p);
    if (!cat || !p.postedAt) return null;
    const posted = dayOf(p.postedAt);
    const h = L.ended.filter((x) => catOf(x) === cat && x.endedAt && dayOf(x.endedAt) <= posted && dayDiff(x.endedAt, posted) <= 180)
      .sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))[0];
    const op = h && opOf(h);
    return op ? { h, op, text: `Replaces ${op.name}, whose engagement ended ${dmd(h.endedAt)}.` } : null;
  }
  // Ended hires worth rehiring: their role category has no active hire and no live engagement (latest first, one per operator)
  function rehireCands(L) {
    const liveCats = new Set(L.live.map(projCat).filter(Boolean));
    const activeCats = new Set(L.active.map(catOf).filter(Boolean));
    const activeOps = new Set(L.active.map((h) => h.opId));
    const seenOps = new Set();
    return L.ended.slice().sort(latestEnd).filter((h) => {
      const c = catOf(h);
      if (!c || activeCats.has(c) || liveCats.has(c) || activeOps.has(h.opId) || seenOps.has(h.opId) || !opOf(h)) return false;
      seenOps.add(h.opId);
      return true;
    });
  }
  const AVAIL_ORDER = ['available_now', 'available_2_weeks', 'available_2_plus_weeks'];
  // Three operators like a past hire: same role category, closest to the last rate, then soonest available
  function similarTo(op, h) {
    const rate = +(h && h.terms && h.terms.rate) || op.rate || 0;
    return RN.model.similar(op, 12).filter((x) => x.catKey === op.catKey).map((x, i) => ({ x, i }))
      .sort((a, b) => (a.x.rate ? Math.abs(a.x.rate - rate) : 9999) - (b.x.rate ? Math.abs(b.x.rate - rate) : 9999)
        || AVAIL_ORDER.indexOf(a.x.avail.key) - AVAIL_ORDER.indexOf(b.x.avail.key) || a.i - b.i)
      .slice(0, 3).map((r) => r.x);
  }
  const personSub = (op, rate) => [`Fractional ${op.role}`, rate ? RN.fmt.rate(rate) : op.rate ? RN.fmt.rate(op.rate) : 'Rate on request', op.avail.label].join(' · ');
  const clientSince = (L) => {
    const ts = [].concat(
      myIntros().map((i) => i.createdAt), L.projects.map((p) => p.createdAt), L.all.map((h) => h.createdAt),
      L.all.map((h) => h.terms && h.terms.startDate), savedSearches().map((s) => s.createdAt),
    ).filter(Boolean).map((v) => dayOf(v)).sort();
    return ts[0] || '';
  };

  /* ---------- Saved searches (created on Browse, kept in seen.savedSearches) ---------- */
  // Searches saved by this client (a record with an owner email belongs to that client only)
  const savedSearches = () => (Array.isArray(seen().savedSearches) ? seen().savedSearches : []).filter((x) => x && (!x.owner || isMe(x.owner)));
  const ssIds = (ss) => RN.model.search({ q: ss.q || '', tags: ss.tags || [], filters: ss.filters || {} }).map((r) => r.op.id);
  // Operators have no join date: "new" means not in the results the last time the client ran the search
  const ssFresh = (ss) => (Array.isArray(ss.lastRunIds) ? ssIds(ss).filter((id) => !ss.lastRunIds.includes(id)) : []);

  /* =====================================================================
     Now feed: what needs the client's action, derived from every record
     ===================================================================== */
  const waitPill = (days, warnAt) => ({ t: days ? `Waiting ${days}d` : 'New today', tone: days >= (warnAt || 2) ? 'warn' : 'info' });
  const endedAgo = (days) => (days < 1 ? 'Ended today' : days < 7 ? `Ended ${pl(days, 'day')} ago` : `Ended ${pl(Math.round(days / 7), 'week')} ago`);
  function buildNow(L) {
    const out = [];
    const company = me().company.name || 'your company';
    const vw = seen().engagementsViewed || {};
    const add = (it) => { it.sort = it.sort == null ? out.length : it.sort; out.push(it); };
    const byHire = new Set();

    /* Tier 1 · waiting on you */
    // Undecided responses stay here until the client hires, requests an intro or marks them not a fit.
    // Opening the engagement only changes the wording (new since the last look, or waiting for a decision).
    L.live.forEach((p) => {
      const v = vw[p.id];
      const und = undecided(p);
      if (!und.length) return;
      const unseen = und.filter((r) => !v || new Date(r.ts || 0) > new Date(v));
      const list = unseen.length ? unseen : und;
      const oldest = list.map((r) => r.ts).filter(Boolean).sort()[0] || p.postedAt;
      const title = p.title || 'Untitled engagement';
      const rep = replaces(p, L);
      add({
        kind: 'responses', tier: 1, sort: -(RN.now() - new Date(oldest)), tab: 'engagements', icon: 'users', pid: p.id,
        pill: waitPill(daysSince(oldest)), ctx: projCat(p) ? catTag(projCat(p)) : '',
        title: !unseen.length ? `${plural(und.length, 'response')} to “${title}” ${und.length === 1 ? 'needs' : 'need'} your decision`
          : und.length > unseen.length ? `${plural(unseen.length, 'new response')} to “${title}”`
          : `${plural(unseen.length, 'operator')} responded to “${title}”`,
        body: unseen.length ? 'Compare their notes and rates, then request an intro or hire.' : 'Request an intro, hire, or mark not a fit so the operators can move on.',
        note: rep ? rep.text : '',
        people: list.slice(0, 3).map((r) => { const op = RN.model.byId(r.opId); return op && { op, sub: personSub(op, r.rate) }; }).filter(Boolean),
        primary: { label: 'Review responses', href: 'engagement.' + p.id },
      });
    });
    myIntros().forEach((i) => {
      const op = RN.model.byId(i.opId);
      if (!op || hireForIntro(i)) return;
      if (i.status === 'introduced') {
        const ts = stepDate(i, 'introduced') || lastTs(i);
        add({
          kind: 'introduced', tier: 1, sort: -(RN.now() - new Date(ts)), tab: 'talent', icon: 'mail', pill: waitPill(daysSince(ts), 3),
          ctx: catTag(op.catKey), title: `You’re connected with ${op.name}`,
          body: `Reply to the intro email to book the first call. When you hire ${op.first}, record the terms here.`,
          people: [{ op, sub: personSub(op) }],
          primary: { label: 'Mark as hired', act: 'bw-hired', attrs: `data-id="${esc(i.id)}"` },
          secondary: [{ label: 'Not a fit', act: 'bw-notfit', attrs: `data-id="${esc(i.id)}"`, muted: true }],
        });
      } else if (i.status === 'hired') {
        const ts = i.hiredAt || lastTs(i);
        add({
          kind: 'confirm', tier: 1, sort: -(RN.now() - new Date(ts)), tab: 'talent', icon: 'handshake', pill: waitPill(daysSince(ts)),
          ctx: catTag(op.catKey), title: `Confirm the terms with ${op.first}`,
          body: 'Record the rate, available time, start date and term so your team, dates and spend stay right.',
          people: [{ op, sub: personSub(op) }],
          primary: { label: 'Confirm terms', act: 'bw-hired', attrs: `data-id="${esc(i.id)}"` },
        });
      }
    });
    L.active.filter(RN.hire.overdue).forEach((h) => {
      const op = opOf(h);
      if (!op) return;
      const days = dayDiff(h.terms.endDate, today());
      byHire.add(h.id);
      const attrs = `data-id="${esc(h.id)}"`;
      add(h.endPlanned ? {
        kind: 'overdue', tier: 1, sort: -days * DAY, tab: 'team', icon: 'calendar', h, pill: { t: `Waiting ${days}d`, tone: 'warn' }, ctx: catTag(catOf(h)),
        title: `Confirm ${op.first} has finished`,
        body: `You chose to let the term end on ${dmd(h.terms.endDate)}. End the engagement so your team and spend stay right.`,
        primary: { label: 'End engagement', act: 'hire-end', attrs },
      } : {
        kind: 'overdue', tier: 1, sort: -days * DAY, tab: 'team', icon: 'calendar', h, pill: { t: `Waiting ${days}d`, tone: 'warn' }, ctx: catTag(catOf(h)),
        title: `${op.first}’s term ended ${dmd(h.terms.endDate)}`,
        body: 'Extend it, or end the engagement so your team and spend stay right.',
        primary: { label: 'Extend', act: 'hire-extend', attrs },
        secondary: [{ label: 'End engagement', act: 'hire-end', attrs, muted: true }],
      });
    });

    /* Tier 2 · due */
    L.active.forEach((h) => {
      if (RN.hire.overdue(h) || h.endPlanned) return;
      const left = RN.hire.daysLeft(h);
      const op = opOf(h);
      if (left == null || left < 0 || left > 30 || !op) return;
      const attrs = `data-id="${esc(h.id)}"`;
      const project = (h.terms || {}).engagementType === 'project';
      const merged = checkinOwed(h);
      byHire.add(h.id);
      add({
        kind: 'ending', tier: 2, sort: left, tab: 'team', icon: 'calendar', h, opName: op.name, checkinMerged: merged,
        pill: { t: left === 0 ? 'Ends today' : `Ends in ${pl(left, 'day')}`, tone: left <= 7 ? 'warn' : 'info' }, ctx: catTag(catOf(h)),
        title: `${op.name}’s term ends ${dmd(h.terms.endDate)}`,
        body: project ? `Extend on the same terms (${termsLine(h)}), or let it end.` : `Extend on the same rate and available time (${termsLine(h, ', ')}), or let it end.`,
        primary: { label: 'Extend', act: 'hire-extend', attrs },
        secondary: (merged ? [{ label: 'Request a check-in', act: 'bw-checkin', attrs }] : []).concat({ label: 'Let it end', act: 'bw-let-end', attrs, muted: true }),
      });
    });

    /* Tier 3 · owed */
    const covered = new Set();
    L.ended.slice().sort(latestEnd).forEach((h) => {
      const op = opOf(h);
      if (!op || covered.has(op.id) || hasMyReview(op.id) || !h.endedAt) return;
      const days = dayDiff(h.endedAt, today());
      if (days > 180) return;
      covered.add(op.id);
      const sent = myReviewRequests().find((r) => r.opId === op.id && r.status === 'sent');
      const mine = sent && sent.source === 'client';
      add({
        kind: 'review', tier: 3, sort: -days * DAY, tab: 'team', icon: 'star', h, pill: { t: endedAgo(days), tone: '' }, ctx: catTag(catOf(h)),
        title: mine ? `Finish your review of ${op.first}` : sent ? `${op.first} asked for your review` : `Review ${op.name}`,
        body: mine ? 'Your answers are saved as you type. Pick up where you left off.' : `Four CORE ratings and the focus areas you saw, about four minutes. It verifies ${op.first}’s profile for the next company.`,
        primary: sent ? { label: mine ? 'Continue review' : 'Leave a review', href: 'review.' + sent.id } : { label: 'Leave a review', act: 'bw-review-start', attrs: `data-hire="${esc(h.id)}"` },
      });
    });
    myReviewRequests().filter((r) => r.status === 'sent' && !covered.has(r.opId)).forEach((r) => {
      const op = RN.model.byId(r.opId);
      if (!op) return;
      covered.add(op.id);
      const mine = r.source === 'client';
      add({
        kind: 'review', tier: 3, sort: -(RN.now() - new Date(r.sentAt || 0)), tab: 'team', icon: 'star', pill: { t: `Asked ${dmd(r.sentAt)}`, tone: '' }, ctx: catTag(op.catKey),
        title: mine ? `Finish your review of ${op.first}` : `${op.first} asked for your review`,
        body: mine ? 'Your answers are saved as you type. Pick up where you left off.' : 'Four CORE ratings and the focus areas you saw, about four minutes.',
        primary: { label: mine ? 'Continue review' : 'Leave a review', href: 'review.' + r.id },
      });
    });
    L.active.forEach((h) => {
      const op = opOf(h);
      if (!op || byHire.has(h.id) || !checkinOwed(h)) return;
      const last = lastCheckin(h);
      const days = daysSince(last || h.terms.startDate + 'T12:00:00');
      byHire.add(h.id);
      add({
        kind: 'checkin', tier: 3, sort: -days * DAY, tab: 'team', icon: 'message', h, pill: { t: last ? `Last ${days}d ago` : 'No check-in yet', tone: '' }, ctx: catTag(catOf(h)),
        title: `Check in with ${op.first}`,
        body: last ? `Your last check-in was ${dmd(last)}. A short note keeps the plan and next month’s priorities agreed.` : `${op.first} started ${dmd(h.terms.startDate)}. A short note keeps the plan and next month’s priorities agreed.`,
        primary: { label: 'Request a check-in', act: 'bw-checkin', attrs: `data-id="${esc(h.id)}"` },
      });
    });
    L.projects.filter((p) => p.status === 'draft').forEach((p) => {
      const d = daysSince(p.updatedAt || p.createdAt);
      if (d <= 3) return;
      const title = p.title || 'Untitled engagement';
      const old = d > 90;
      add({
        kind: 'draft', tier: 3, sort: -d * DAY, tab: 'engagements', icon: 'edit', pid: p.id, pill: { t: `Saved ${d}d ago`, tone: '' }, ctx: projCat(p) ? catTag(projCat(p)) : '',
        title: old ? `Finish or discard “${title}”` : `Finish “${title}”`,
        body: 'Post it to get ranked matches and responses. It takes about a minute.',
        primary: { label: 'Finish draft', href: 'engagement.' + p.id },
        secondary: old ? [{ label: 'Discard', act: 'bw-draft-discard', attrs: `data-id="${esc(p.id)}"`, muted: true }] : [],
      });
    });

    /* Tier 4 · worth a look (the rehire moves to tier 2 for an alumni client) */
    const cands = rehireCands(L);
    if (cands.length) {
      const c = cands[0];
      const op = opOf(c);
      const tier = L.state === 'S4' ? 2 : 4;
      if (L.state === 'S4' && RN.hire.elapsedDays(c) >= 90) {
        const note = c.endNote ? `“${c.endNote}” ` : '';
        add({
          kind: 'rehire', tier, sort: tier === 2 ? 999 : null, tab: 'team', icon: 'refresh', ctx: catTag(catOf(c)),
          pill: { t: op.avail.label, tone: op.avail.key === 'available_now' ? 'good' : '' },
          title: `Bring back ${op.name}, or find someone like ${op.first}`,
          body: `${op.first} led ${catLabel(catOf(c))} for ${RN.hire.timeInSeat(c, 'long')}, to ${dmd(RN.hire.winEnd(c))}. ${note}${op.first} is ${op.avail.label.toLowerCase()}. We fill in your last terms: ${termsLine(c)}.`,
          people: similarTo(op, c).map((x) => ({ op: x, sub: personSub(x) })), peopleLabel: `Operators like ${op.first}`,
          primary: { label: `Rehire ${op.first}`, act: 'bw-rehire', attrs: `data-hire="${esc(c.id)}"` },
          secondary: [{ label: 'See similar operators', act: 'bw-similar', attrs: `data-hire="${esc(c.id)}"`, line: true }],
        });
      } else {
        add({
          kind: 'rehire', tier, sort: tier === 2 ? 999 : null, tab: 'team', icon: 'refresh', ctx: '',
          title: `Rehire someone who already knows ${company}`,
          body: 'They know your team, your numbers and how you work. We fill in the last terms you agreed.',
          rows: cands.slice(0, 3),
          secondary: [{ label: 'Find someone similar', act: 'bw-similar', attrs: `data-hire="${esc(c.id)}"` }],
        });
      }
    }
    savedSearches().forEach((ss) => {
      const fresh = ssFresh(ss);
      if (!fresh.length) return;
      const name = ss.name || critLine(ss) || 'Saved search';
      add({
        kind: 'search', tier: 4, tab: 'talent', icon: 'search', pill: { t: `${fresh.length} new since ${dmd(ss.lastRunAt || ss.createdAt)}`, tone: 'info' },
        title: `${fresh.length} new ${fresh.length === 1 ? 'operator matches' : 'operators match'} “${name}”`,
        body: 'Run the search to see who is new since you last looked.',
        people: fresh.slice(0, 3).map((id) => { const op = RN.model.byId(id); return op && { op, sub: personSub(op) }; }).filter(Boolean),
        primary: { label: 'Run search', act: 'bw-ss-run', attrs: `data-id="${esc(ss.id)}"` },
      });
    });
    L.active.forEach((h) => {
      const op = opOf(h);
      if (!op || byHire.has(h.id) || !RN.hire.reviewable(h) || hasMyReview(op.id) || myReviewRequests().some((r) => r.opId === op.id && r.status === 'sent')) return;
      byHire.add(h.id);
      add({
        kind: 'howgoing', tier: 4, tab: 'team', icon: 'star', ctx: catTag(catOf(h)),
        title: `How is it going with ${op.first}?`,
        body: `A short CORE review verifies ${op.first}’s focus areas and helps the next company hire well.`,
        primary: { label: 'Leave a review', act: 'bw-review-start', attrs: `data-hire="${esc(h.id)}"` },
      });
    });
    // The alumni check-in comes before setup tasks: it is part of an alumni client's job (tier 4 sorts by insertion)
    const ci = seen().checkin || {};
    const inFlight = myIntros().some((i) => isOpen(i) && !i.withdrawn);
    if (L.state === 'S4' && !L.live.length && !inFlight && !(ci.snoozeUntil && today() < ci.snoozeUntil)) {
      const needs = ((RN.fields.need || {}).options || []).filter((o) => o.v !== 'not_sure');
      add({
        kind: 'next', tier: 4, tab: 'overview', icon: 'compass',
        title: `What is next for ${company}?`,
        body: 'Pick what you need now and we show who fits and what they charge.',
        chips: needs,
        secondary: [{ label: 'Talk to our team', href: 'talk' }, { label: 'Nothing right now. Ask me again in 90 days.', act: 'bw-checkin-snooze', muted: true }],
      });
    }
    if (!BW.prefs() && !L.active.length) {
      add({
        kind: 'prefs', tier: 4, tab: 'company', icon: 'target',
        title: 'Set your match preferences',
        body: `Tell us the role you are hiring for and how you sell. Every profile you open then shows match signals for ${company}.`,
        primary: { label: 'Set preferences', href: 'buyer.company' },
      });
    }
    const nShort = st().shortlist.length;
    if (L.state === 'S1' && nShort >= 2 && !L.introsAny.length) {
      add({
        kind: 'compare', tier: 4, tab: 'talent', icon: 'compare',
        title: `Compare your ${nShort} shortlisted operators`,
        body: 'Pick up to four and see them side by side on the same fields, then request an intro.',
        primary: { label: 'Open shortlist', href: 'buyer.talent' },
      });
    }
    return out.sort((a, b) => a.tier - b.tier || a.sort - b.sort);
  }
  BW.now = () => buildNow(BW.lifecycle());
  const nowItems = (L) => cached('now', () => buildNow(L));

  /* Nav badges: only what needs the client (tiers 1 to 3), never totals */
  function badges(L) {
    return cached('badges', () => {
      const items = nowItems(L).filter((i) => i.tier <= 3);
      const n = (kinds) => items.filter((i) => kinds.includes(i.kind)).length;
      return {
        team: n(['overdue', 'ending', 'review', 'checkin']) + items.filter((i) => i.checkinMerged).length,
        engagements: n(['responses', 'draft']),
        talent: n(['introduced', 'confirm']),
      };
    });
  }

  /* Waiting on others: in motion, nothing for the client to do (not counted anywhere) */
  function waiting(L) {
    return cached('waiting', () => {
      const out = [];
      myIntros().forEach((i) => {
        const op = RN.model.byId(i.opId);
        if (!op || i.withdrawn) return;
        if (i.status === 'pending') {
          const h = hoursLeft(i);
          out.push({ icon: 'hourglass', ts: i.createdAt, html: h > 0 ? `<b>${esc(op.name)}</b> has ${h} hours left to reply to your intro request.` : `<b>${esc(op.first)}</b> has not replied in 72 hours. Our team is following up today.` });
        } else if (i.status === 'interested' || i.status === 'rn_qualified') {
          out.push({ icon: 'handshake', ts: lastTs(i), html: `Our team introduces you to <b>${esc(op.first)}</b> within one business day.` });
        } else if (i.status === 'declined' && i.closedBy !== 'client' && daysSince(lastTs(i)) <= 14) {
          out.push({ icon: 'refresh', ts: lastTs(i), html: `<b>${esc(op.first)}</b> can’t take this one. We picked two operators with the same fit.`, link: { href: 'buyer.intros', label: 'See alternatives' } });
        }
      });
      L.live.forEach((p) => {
        if (undecided(p).length) return;   // on the Now feed instead: a decision waits on the client
        const inv = p.invited || [];
        const quiet = inv.filter((id) => !(p.responses || []).some((r) => r.opId === id)).length;
        if (inv.length && !quiet) return;   // everyone invited has answered: nobody else to wait on
        const close = p.postedAt ? new Date(new Date(p.postedAt).getTime() + 72 * 36e5) : null;
        const open = close && RN.now() < close;
        out.push({
          icon: 'megaphone', ts: p.postedAt,
          html: `<b>“${esc(p.title || 'Untitled engagement')}”</b>: ${inv.length ? `${quiet} of ${inv.length} invited operators have not replied.` : 'No operators invited yet.'} ${close ? (open ? `Responses close ${esc(dmd(close.toISOString()))}.` : `The 72-hour window closed ${esc(dmd(close.toISOString()))}.`) : ''}`,
          link: { href: 'engagement.' + p.id, label: 'Open' },
        });
      });
      L.active.filter((h) => !RN.hire.started(h)).forEach((h) => {
        const op = opOf(h);
        if (op) out.push({ icon: 'calendar', ts: h.createdAt, html: `<b>${esc(op.first)}</b> starts ${esc(dmd(h.terms.startDate))}.` });
      });
      return out;
    });
  }

  /* =====================================================================
     Shell: side nav (badges count what needs the client), routes, header
     ===================================================================== */
  const TABS = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'team', label: 'Team', icon: 'users', badge: 'team' },
    { key: 'engagements', label: 'Engagements', icon: 'briefcase', badge: 'engagements' },
    { key: 'talent', label: 'Talent', icon: 'bookmark', badge: 'talent' },
    { key: 'history', label: 'History', icon: 'clock' },
    { key: 'company', label: 'Company', icon: 'building' },
  ];
  // Old links keep working (D12): engagements were projects, the Team tab was hires, Talent holds shortlist and intros
  const TAB_ALIAS = { projects: 'engagements', hires: 'team', shortlist: 'talent', intros: 'talent' };
  const tabKey = (k) => TAB_ALIAS[k] || k;
  function side(cur, L) {
    const p = me();
    const b = badges(L);
    return `<nav class="side" aria-label="Workspace">
      <div class="side-id">${RN.ui.avatar({ name: p.name, initials: RN.fmt.initials(p.name) }, 'ava-md')}<div><b>${esc(p.name)}</b><span>${esc([p.title, p.company.name].filter(Boolean).join(', '))}</span></div></div>
      <span class="label side-label">Workspace</span>
      ${TABS.map((t) => {
        const n = t.badge ? b[t.badge] : 0;
        return `<a href="#buyer${t.key === 'overview' ? '' : '.' + t.key}" class="${cur === t.key ? 'on' : ''}" ${cur === t.key ? 'aria-current="page"' : ''}>${icon(t.icon)}${esc(t.label)}${n ? `<span class="nav-count"><span class="sr-only">, </span>${n}<span class="sr-only"> ${n === 1 ? 'needs' : 'need'} you</span></span>` : ''}</a>`;
      }).join('')}
      <div class="side-sep"></div>
      <a href="#browse">${icon('search')}Browse talent</a>
      <a href="#engagement.new">${icon('plus')}Post an engagement</a>
    </nav>`;
  }
  function page(cur) {
    BW.applyCompany();
    cache = {};
    const L = life();
    const key = tabKey(cur);
    const t = TABS.find((x) => x.key === key) ? key : 'overview';
    const body = { overview, team, engagements, talent, history, company }[t](L);
    return `<div class="wrap shell bw" data-bw-tab="${esc(t)}" data-bw-state="${esc(L.state)}">${side(t, L)}<div class="bw-main">${sampleBanner(L)}${body}</div></div>`;
  }

  RN.view('buyer', {
    route: 'buyer', nav: '', requires: 'buyer', footer: false,
    title: () => 'Workspace',
    render: () => page('overview'),
    mount: (root, params) => mount(root, params || {}),
  });
  RN.view('buyer-tab', {
    route: 'buyer.:tab', nav: '', requires: 'buyer', footer: false,
    samples: { tab: 'talent', extra: ['buyer.team', 'buyer.engagements', 'buyer.history', 'buyer.company', 'buyer.intros', 'buyer.shortlist', 'buyer.projects', 'buyer.hires'] },
    title: (p) => { const t = TABS.find((x) => x.key === tabKey(p.tab)); return (t ? t.label : 'Overview') + ' · Workspace'; },
    render: (p) => page(p.tab),
    mount: (root, params) => mount(root, params || {}),
  });

  function mount(root, params) {
    // Keep a thread open across re-renders once the client opened it.
    RN.$$('details[data-thread]', root).forEach((d) => d.addEventListener('toggle', () => { if (d.open) openThreads.add(d.dataset.thread); else openThreads.delete(d.dataset.thread); }));
    // A fresh route (not an in-place re-render) carries .view-enter on <main>
    const fresh = root && root.classList && root.classList.contains('view-enter');
    if (fresh && params.tab === 'intros') {
      setTimeout(() => { const el = document.getElementById('bw-intros'); if (el) { el.scrollIntoView({ block: 'start' }); const h = el.querySelector('h2'); if (h) h.focus({ preventScroll: true }); } }, 40);
    }
    // Coverage over time scrolls sideways on phones: bring today into view
    const cov = root && root.querySelector('[data-bw-cov]');
    if (cov && cov.scrollWidth > cov.clientWidth) {
      const now = cov.querySelector('.bw-cov-today');
      if (now) cov.scrollLeft = Math.max(0, now.offsetLeft - cov.clientWidth * 0.65);
    }
    // Saved searches seen for the first time get a baseline, so "new since" means new since the client last looked
    let dirty = false;
    savedSearches().forEach((ss) => { if (!Array.isArray(ss.lastRunIds)) { ss.lastRunIds = ssIds(ss); ss.lastRunAt = ss.lastRunAt || ss.createdAt || RN.now().toISOString(); dirty = true; } });
    if (dirty) RN.store.save();
  }

  /* The client's engagement page marks its responses as seen (projects.js renders it; the view has no mount of its own) */
  BW.markViewed = function (id) {
    if (st().persona !== 'buyer' || !myProjects().some((p) => p.id === id)) return;
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen); s.seen.engagementsViewed = Object.assign({}, s.seen.engagementsViewed, { [id]: RN.now().toISOString() }); }, 'seen');
  };
  (function hookEngagementPage() {
    const v = RN.views.project;
    if (!v || v._bwViewed) return;
    const prev = v.mount;
    v.mount = function (root, params) { if (prev) prev(root, params); try { if (params && params.id) BW.markViewed(params.id); } catch (e) { console.error(e); } };
    v._bwViewed = true;
  })();

  // One header on every tab: the surface eyebrow (company · Client workspace), a title, a line of context.
  function head(o) {
    const eyebrow = `${esc(me().company.name || 'Your company')} · Client workspace`;
    return `<header class="app-head bw-head">
      <div><span class="eyebrow">${eyebrow}</span><h1>${o.title}</h1>${o.sub ? `<p class="sub">${o.sub}</p>` : ''}</div>
      ${o.actions ? `<div class="row bw-head-act">${o.actions}</div>` : ''}
    </header>`;
  }
  function secHead(title, link, sub, id) {
    return `<div class="bw-sec-hd"><div><h2 class="h4"${id ? ` id="${id}"` : ''}>${title}</h2>${sub ? `<p class="small muted">${sub}</p>` : ''}</div>${link || ''}</div>`;
  }
  const arrowLink = (href, label) => `<a class="act" href="#${esc(href)}">${esc(label)}${icon('arrow')}</a>`;

  /* A dock sample scenario is labelled everywhere in the workspace, with a way out */
  function sampleBanner(L) {
    const on = L.all.some((h) => h.sample) || L.projects.some((p) => p.sample) || myIntros().some((i) => i.sample);
    if (!on) return '';
    return `<div class="bw-sample" role="note">${icon('info')}<span><b>Sample scenario.</b> These hires, engagements and intros are illustrative, not real history. Your own records are set aside until you clear it.</span><button type="button" class="act" data-act="sample-clear">Clear the sample</button></div>`;
  }

  /* ---------- Feed item parts ---------- */
  function actBtn(a, cls) {
    if (!a) return '';
    if (a.href) return `<a class="${cls}" href="#${esc(a.href)}">${esc(a.label)}</a>`;
    return `<button type="button" class="${cls}" data-act="${esc(a.act)}" ${a.attrs || ''}>${esc(a.label)}</button>`;
  }
  const pillHtml = (p) => (p && p.t ? `<span class="pill ${p.tone ? 'pill-' + p.tone : ''}">${esc(p.t)}</span>` : '');
  function peopleHtml(list, label) {
    if (!list || !list.length) return '';
    return `<div class="bw-people">${label ? `<span class="label">${esc(label)}</span>` : ''}<ul>${list.map((x) => `<li><a class="bw-person" href="#op.${esc(x.op.slug)}" data-track-view="${esc(x.op.id)}">${RN.ui.avatar(x.op, 'ava-sm', { decorative: true })}<span><b class="serif-up">${esc(x.op.name)}</b><span class="tiny muted">${esc(x.sub)}</span></span></a></li>`).join('')}</ul></div>`;
  }
  function rehireRows(rows, lead) {
    return `<ul class="bw-rh">${rows.map((h, k) => {
      const op = opOf(h);
      return `<li>${RN.ui.avatar(op, 'ava-sm', { decorative: true })}
        <a class="grow" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}"><b class="serif-up">${esc(op.name)}</b>${catTag(catOf(h))}<span class="tiny muted">${esc(op.avail.label)} · Last: ${esc(termsLine(h))}</span></a>
        <button type="button" class="btn ${lead && !k ? '' : 'btn-line'} btn-sm" data-act="bw-rehire" data-hire="${esc(h.id)}" aria-label="Rehire ${esc(op.name)}">Rehire</button></li>`;
    }).join('')}</ul>`;
  }
  const chipsHtml = (opts) => `<div class="chipset bw-need">${opts.map((o) => `<button type="button" class="chip chip-sm" data-act="bw-need" data-need="${esc(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
  function heroHtml(it) {
    const sec = (it.secondary || []).map((a) => actBtn(a, a.line ? 'btn btn-line' : a.muted ? 'act muted' : 'act')).join('');
    return `<article class="card bw-hero" data-kind="${esc(it.kind)}" aria-labelledby="bw-hero-t">
      <div class="bw-hero-top"><span class="eyebrow">Next step</span>${pillHtml(it.pill)}</div>
      ${it.ctx ? `<div class="bw-ctx tiny">${it.ctx}</div>` : ''}
      <h2 class="bw-hero-t" id="bw-hero-t">${esc(it.title)}</h2>
      <p class="bw-hero-b">${esc(it.body)}</p>
      ${it.note ? `<p class="bw-hero-note">${icon('refresh')}<span>${esc(it.note)}</span></p>` : ''}
      ${peopleHtml(it.people, it.peopleLabel)}
      ${it.rows ? rehireRows(it.rows, true) : ''}
      ${it.chips ? chipsHtml(it.chips) : ''}
      ${it.primary || sec ? `<div class="row bw-hero-act">${actBtn(it.primary, 'btn')}${sec}</div>` : ''}
    </article>`;
  }
  function rowHtml(it) {
    const sec = (it.secondary || []).map((a) => actBtn(a, a.line ? 'btn btn-line btn-sm' : a.muted ? 'act muted' : 'act')).join('');
    return `<li class="bw-row" data-kind="${esc(it.kind)}">
      <span class="bw-row-ic" aria-hidden="true">${icon(it.icon || 'dots')}</span>
      <div class="bw-row-main">
        <div class="bw-row-hd"><b>${esc(it.title)}</b>${pillHtml(it.pill)}</div>
        ${it.ctx ? `<div class="bw-ctx tiny">${it.ctx}</div>` : ''}
        <p>${esc(it.body)}</p>
        ${it.note ? `<p class="bw-row-note">${esc(it.note)}</p>` : ''}
        ${it.rows ? rehireRows(it.rows, false) : ''}
        ${it.chips ? chipsHtml(it.chips) : ''}
      </div>
      ${it.primary || sec ? `<div class="bw-row-a">${actBtn(it.primary, 'btn btn-line btn-sm')}${sec}</div>` : ''}
    </li>`;
  }
  function waitingHtml(L) {
    const w = waiting(L);
    const li = (x) => `<li>${icon(x.icon)}<span>${x.html}${x.link ? ` <a class="act" href="#${esc(x.link.href)}">${esc(x.link.label)}</a>` : ''}</span></li>`;
    return `<aside class="bw-wait" aria-labelledby="bw-wait-t">
      <h2 class="label" id="bw-wait-t">Waiting on others${w.length ? ` · ${w.length}` : ''}</h2>
      ${!w.length ? `<p class="small muted">Nothing in motion. Nobody is waiting on an operator or our team for you.</p>`
        : `<ul class="bw-wait-l">${w.slice(0, 2).map(li).join('')}</ul>${w.length > 2 ? `<details class="bw-more"><summary>Show ${w.length - 2} more${icon('chev-down')}</summary><ul class="bw-wait-l">${w.slice(2).map(li).join('')}</ul></details>` : ''}`}
    </aside>`;
  }
  function nowSection(L) {
    const items = nowItems(L);
    const [hero, ...rest] = items;
    const also = rest.slice(0, 3), more = rest.slice(3);
    return `<section class="bw-now" aria-label="What needs you">
      <div class="bw-now-main">
        ${hero ? heroHtml(hero) : `<div class="card bw-calm">${icon('check-circle')}<div><h2 class="h4">Nothing needs you right now.</h2><p class="small muted">New responses, intros, term dates and reviews show up here when they need you.</p></div></div>`}
        ${also.length ? `<div class="bw-also"><h3 class="label">Also needs you</h3><ol class="bw-rows">${also.map(rowHtml).join('')}</ol>
          ${more.length ? `<details class="bw-more"><summary>Show ${more.length} more${icon('chev-down')}</summary><ol class="bw-rows">${more.map(rowHtml).join('')}</ol></details>` : ''}</div>` : ''}
      </div>
      ${waitingHtml(L)}
    </section>`;
  }

  /* ---------- Stats (S2 to S4 on the Overview, and on the Team tab) ---------- */
  function statsRow(L, links) {
    const m = metrics(L);
    const nd = nextDate(L);
    const upcoming = L.active.length - m.started.length;
    const NB = '\u00a0· ';   // a label that wraps never starts a line with its separator
    const tag = (inner, cls) => (links ? `<a class="stat ${cls || ''}" href="#buyer.team">${inner}</a>` : `<div class="stat ${cls || ''}">${inner}</div>`);
    return `<div class="stats-row bw-stats" style="--cols:4">
      ${tag(`<span class="stat-v">${m.started.length}</span><span class="stat-l">In seat now${NB}${L.ended.length} past${upcoming ? `${NB}${upcoming} starting soon` : ''}</span>`)}
      ${tag(`<span class="stat-v">${esc(usd(m.monthly))}</span><span class="stat-l">Monthly now</span>`)}
      ${tag(`<span class="stat-v">${esc(usd(m.spent))}</span><span class="stat-l">Spent to date, estimated${m.firstStart ? (m.firstStart > today() ? `${NB}from ${esc(dmd(m.firstStart))}` : `${NB}since ${esc(monthYear(m.firstStart))}`) : ''}</span>`)}
      ${tag(`<span class="stat-v">${esc(nd.value)}</span><span class="stat-l">${nd.past ? '' : `Next date${NB}`}${esc(nd.label)}</span>`, nd.warn ? 'is-warn' : '')}
    </div>`;
  }

  /* ================= Overview ================= */
  function overview(L) {
    if (L.state === 'S0') return startHere(L);
    const p = me();
    const hour = RN.now().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const title = L.state === 'S4' ? `Welcome back, ${esc(p.first)}` : `${greet}, ${esc(p.first)}`;
    const hiring = L.state === 'S1';
    return `${head({
      title,
      sub: esc(subLine(L)),
      actions: hiring ? `<a class="btn btn-line" href="#browse">${icon('search')}Browse talent</a>` : `<a class="btn btn-line" href="#engagement.new">${icon('plus')}Post an engagement</a>`,
    })}
    ${hiring ? '' : statsRow(L, true)}
    ${nowSection(L)}
    ${hiring ? pipeline(L) : teamStrip(L)}
    ${engagementsSection(L, true)}
    ${teaser(L)}`;
  }
  function subLine(L) {
    const items = nowItems(L);
    const t1 = items.filter((i) => i.tier === 1).length;
    if (t1) {
      const due = items.find((i) => i.kind === 'ending');
      return `${t1} ${t1 === 1 ? 'decision is' : 'decisions are'} waiting on you${due ? `, and ${due.opName}’s term ends ${dmd(due.h.terms.endDate)}` : ''}.`;
    }
    if (L.state === 'S4') {
      const last = L.ended.slice().sort(latestEnd)[0];
      const op = last && opOf(last);
      return `No one is working with you right now. Your last engagement${op ? `, with ${op.name},` : ''} ended ${dmd(RN.hire.winEnd(last))}.`;
    }
    const n = L.active.length, m = L.live.length;
    return `${n ? `${plural(n, 'operator')} working with you` : 'No operators working with you yet'}, ${plural(m, 'engagement')} open. Nothing needs you right now.`;
  }
  function teaser(L) {
    const since = clientSince(L);
    const bits = [
      since ? `Client since ${RN.fmt.date(since + 'T12:00:00')}` : 'New client',
      plural(L.projects.length, 'engagement'), plural(myIntros().length, 'intro request'), plural(L.hires.length, 'hire'),
    ];
    if (L.state === 'S2' || L.state === 'S3') {
      const h = L.active.filter(RN.hire.started).sort((a, b) => (a.terms.startDate < b.terms.startDate ? -1 : 1))[0];
      if (h && catOf(h)) bits.push(`${catLabel(catOf(h))} seat filled since ${dmd(h.terms.startDate)}`);
    }
    return `<div class="bw-quiet bw-teaser">${icon('clock')}<span>${esc(bits.join(' · '))}</span>${arrowLink('buyer.history', 'See history')}</div>`;
  }

  /* ---------- S0: Start here ---------- */
  let askText = '';
  function askRead(text) {
    const t = String(text || '').trim();
    if (t.length < 3) return `<p class="tiny muted bw-ask-hint">${icon('sparkline')}As you type, we read your request and turn it into the fields operators fill in.</p>`;
    const u = RN.model.understand(t);
    if (!u.facts.length) return `<p class="tiny muted bw-ask-hint">${icon('info')}Add the role, your company size or how much time you need, and we match on it.</p>`;
    return `<div class="bw-ask-read"><span class="label">We read this as</span><div class="bw-ask-pills">${u.facts.map((f) => `<span class="pill pill-line">${esc(f.label)}</span>`).join('')}</div><button type="button" class="act" data-act="bw-ask-edit">Edit</button></div>`;
  }
  function askCount(text) {
    const t = String(text || '').trim();
    if (!t) return RN.model.ops.filter((o) => !o.hidden).length;
    const u = RN.model.understandSearch(t, {});
    return u.natural ? RN.model.search({ q: u.applied.q, filters: u.applied.filters }).length : RN.model.search({ q: t }).length;
  }
  const askLabel = (text) => { const n = askCount(text); return String(text || '').trim() ? `See ${n} ${n === 1 ? 'match' : 'matches'}` : `See all ${n} operators`; };
  function setupSteps(L) {
    const c = me().company;
    return [
      { l: 'Company profile', d: 'Industry and size, so every profile shows match signals.', done: !!(seen().company || c.revenueRange), href: 'buyer.company' },
      { l: 'Describe your first need', d: 'In plain English above, or as an engagement.', done: L.projects.some((p) => ['draft', 'posted', 'in_progress'].includes(p.status)), act: 'bw-ask-edit' },
      { l: 'Save a search', d: 'Run it again in one click and see who is new.', done: savedSearches().length > 0, href: 'browse' },
      { l: 'Request an intro or post an engagement', d: 'Operators reply within 72 hours.', done: myIntros().length > 0 || L.projects.some((p) => p.status !== 'draft'), href: 'browse' },
    ];
  }
  function bpFor() {
    const P = RN.projects;
    const all = (P && P.blueprints) || [];
    const prefs = BW.prefs() || {};
    const list = prefs.need && P.forNeed ? P.forNeed(prefs.need, prefs.roleCategory).slice(0, 4) : [];
    all.forEach((b) => { if (list.length < 4 && !list.includes(b) && !list.some((x) => x.cat === b.cat)) list.push(b); });
    return list.slice(0, 4);
  }
  const bpScope = (b) => [RN.w.label('engagementType', b.engagementType), b.engagementType === 'project' ? `About ${b.projectHours} hours` : hoursText(b.hoursPerMonth), RN.w.label('term', b.term)].filter(Boolean).join(' · ');
  function bpCards(list) {
    return `<div class="bw-bps">${list.map((b) => `<a class="card bw-bp" href="#engagement.new.${esc(b.id)}">
      ${catTag(b.cat)}
      <b class="bw-bp-p">${esc(b.problem)}</b>
      <span class="small">${esc(b.title)}</span>
      <span class="tiny muted">${esc(bpScope(b))}</span>
      <span class="act">Use this Blueprint${icon('arrow')}</span>
    </a>`).join('')}</div>`;
  }
  function startHere(L) {
    const p = me();
    const draft = L.projects.filter((x) => x.status === 'draft').sort(newestFirst)[0];
    const steps = setupSteps(L);
    const done = steps.filter((s) => s.done).length;
    return `${head({
      title: `Welcome, ${esc(p.first)}`,
      sub: 'Tell us what you need in plain English. We show you who fits and what they charge.',
      actions: `<a class="btn btn-line" href="#browse">${icon('search')}Browse talent</a>`,
    })}
    ${draft ? `<div class="bw-quiet bw-resume">${icon('edit')}<span>You started an engagement ${esc(RN.fmt.ago(draft.updatedAt || draft.createdAt))}.</span><a class="btn btn-line btn-sm" href="#engagement.${esc(draft.id)}">Finish “${esc(draft.title || 'Untitled engagement')}”</a></div>` : ''}
    <div class="bw-start">
      <section class="card bw-ask" aria-labelledby="bw-ask-l">
        <h2 class="h3" id="bw-ask-l"><label for="bw-ask-t">What do you need help with?</label></h2>
        <p class="small muted">Write it the way you would tell a colleague: the problem, your company, how much time and when.</p>
        <textarea class="textarea" id="bw-ask-t" rows="4" maxlength="600" data-input="bw-ask" placeholder="Our founder still runs every deal. We need someone to build the sales process and hire two reps, about two days a week, starting in two weeks.">${esc(askText)}</textarea>
        <div data-bw-read aria-live="polite">${askRead(askText)}</div>
        <div class="row bw-ask-act">
          <button type="button" class="btn" data-act="bw-ask-see" data-bw-see>${esc(askLabel(askText))}</button>
          <button type="button" class="btn btn-line" data-act="bw-ask-post">Post it as an engagement</button>
        </div>
        <p class="tiny muted bw-ask-ft">Operators reply to an intro request within 72 hours. ${esc(NO_FEES())}</p>
      </section>
      <aside class="card bw-setup" aria-labelledby="bw-setup-t">
        <div class="row between"><h2 class="h4" id="bw-setup-t">Get set up</h2><span class="tiny muted">${done} of ${steps.length} done</span></div>
        <div class="meter" role="meter" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i style="width:${(done / steps.length) * 100}%"></i></div>
        <ol class="bw-steps">${steps.map((s) => `<li class="${s.done ? 'is-done' : ''}">
          <span class="bw-step-ic" aria-hidden="true">${icon(s.done ? 'check' : 'minus')}</span>
          <span class="grow"><b>${esc(s.l)}</b><span class="tiny muted">${s.done ? 'Done' : esc(s.d)}</span></span>
          ${s.done ? '' : s.href ? `<a class="act" href="#${esc(s.href)}" aria-label="${esc(s.l)}">Start${icon('arrow')}</a>` : `<button type="button" class="act" data-act="${esc(s.act)}">Start${icon('arrow')}</button>`}
        </li>`).join('')}</ol>
      </aside>
    </div>
    <section class="bw-sec" aria-labelledby="bw-bp-t">
      ${secHead('<span id="bw-bp-t">Start from the problem you have</span>', arrowLink('blueprints', 'All Blueprints'), 'Engagement Blueprints: the seat that fixes it, typical hours and term, and a 30/60/90-day plan.')}
      ${bpCards(bpFor())}
    </section>
    <section class="bw-sec" aria-labelledby="bw-how-t">
      ${secHead('<span id="bw-how-t">How hiring works here</span>')}
      <ol class="bw-how">
        <li><span class="bw-how-n">1</span><b>Describe or browse</b><p class="small muted">Write what you need, start from a Blueprint, or browse profiles with rates and client reviews.</p></li>
        <li><span class="bw-how-n">2</span><b>Meet</b><p class="small muted">Request an intro. The operator replies within 72 hours and our team introduces you by email.</p></li>
        <li><span class="bw-how-n">3</span><b>Hire</b><p class="small muted">Agree the terms and record them here.</p></li>
      </ol>
    </section>
    <div class="bw-quiet">${icon('layers')}<span>Your team, engagements and history appear here as you go.</span></div>`;
  }
  let askTimer = null;
  RN.inputs['bw-ask'] = (el) => {
    askText = el.value;
    clearTimeout(askTimer);
    askTimer = setTimeout(() => {
      const box = RN.$('[data-bw-read]');
      if (box) box.innerHTML = askRead(askText);
      const b = RN.$('[data-bw-see]');
      if (b) b.textContent = askLabel(askText);
    }, 180);
  };
  RN.actions['bw-ask-edit'] = () => { const t = document.getElementById('bw-ask-t'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } };
  RN.actions['bw-ask-see'] = () => {
    const t = askText.trim();
    if (!t) { RN.go('browse'); return; }
    RN.browse.go({ q: t });
  };
  // "Post it as an engagement": a draft whose brief is the client's own words, filled in from what we read
  RN.actions['bw-ask-post'] = () => {
    const t = askText.trim();
    if (!t) { RN.go('engagement.new'); return; }
    const u = RN.model.understand(t);
    const cat = (u.filters.roleCategories || [])[0] || '';
    const P = RN.projects;
    // A Blueprint in the role category we read (the one that solves the need first), else the need's first Blueprint
    const forNeed = u.need && P.forNeed ? P.forNeed(u.need, cat) : [];
    const bp = (cat ? forNeed.find((x) => x.cat === cat) || (P.blueprints || []).find((x) => x.cat === cat) : forNeed[0]) || null;
    const roles = (RN.fields.rolesByCat && cat && RN.fields.rolesByCat[cat]) || [];
    const role = bp && (!cat || bp.cat === cat) ? bp.role : typeof roles[0] === 'string' ? roles[0] : (roles[0] && (roles[0].l || roles[0].v)) || '';
    const c = me().company;
    const type = (u.filters.engagementTypes || [])[0] || (bp && bp.engagementType) || 'fractional';
    // "Starting in two weeks" reads as now or within two weeks: the draft keeps the loosest (the one the client wrote)
    const startBy = (u.filters.availability || []).slice().sort((a, b) => AVAIL_ORDER.indexOf(a) - AVAIL_ORDER.indexOf(b)).pop() || '';
    const now = RN.now().toISOString();
    const rec = {
      id: RN.uid('proj'), status: 'draft', title: role ? 'Fractional ' + role : 'Untitled engagement', template: bp && (!cat || bp.cat === cat) ? bp.id : null,
      fields: { roleCategory: cat || (bp ? bp.cat : ''), role, engagementType: type, hoursPerMonth: type === 'project' ? '' : (u.filters.hoursPerMonth || [])[0] || (bp && bp.hoursPerMonth) || '', term: (bp && bp.term) || '', startBy: startBy || (bp && bp.startBy) || '',
        revenueRange: c.revenueRange || '', employeeRange: c.employeeRange || '', industries: c.industry ? [c.industry] : [], salesMotions: [], tags: bp ? bp.tags.slice(0, 6) : [], rateMax: u.filters.rateMax || null, projectBudget: null },
      brief: t, client: { name: me().name, title: me().title, email: me().email, company: Object.assign({}, c) },
      visibility: 'open', suggest: true, invited: [], picked: [], inviteMeta: {}, suggested: [], responses: [], createdAt: now, updatedAt: now,
    };
    RN.store.update((s) => { s.projects.unshift(rec); }, 'projects');
    askText = '';
    RN.go('engagement.new.' + rec.id);
  };

  /* ---------- Team strip (Overview, S2 to S4) ---------- */
  // The next thing on a hire's calendar, or what a past hire's seat needs now
  function hireNext(h, L) {
    const t = h.terms || {};
    if (h.status === 'active') {
      if (RN.hire.overdue(h)) return `<span class="bw-warn">Term ended ${esc(dmd(t.endDate))}</span><span class="tiny muted">${h.endPlanned ? 'Confirm it has finished' : 'Extend or end it'}</span>`;
      if (!RN.hire.started(h)) return `<b>Starts ${esc(dmd(t.startDate))}</b><span class="tiny muted">in ${esc(pl(dayDiff(today(), t.startDate), 'day'))}</span>`;
      if (!t.endDate) return '<b>Open-ended</b><span class="tiny muted">No end date recorded</span>';
      const left = RN.hire.daysLeft(h);
      return `<b>Term ends ${esc(dmd(t.endDate))}</b><span class="tiny muted">${left === 0 ? 'today' : 'in ' + esc(pl(left, 'day'))}${h.endPlanned ? ' · letting it end' : ''}</span>`;
    }
    const op = opOf(h);
    if (owesReview(h)) return `<span class="pill pill-warn">Review owed</span><button type="button" class="act" data-act="bw-review-start" data-hire="${esc(h.id)}">Leave a review</button>`;
    const open = L.live.find((p) => projCat(p) === catOf(h));
    if (open) return `<b>Seat open again</b><a class="act" href="#engagement.${esc(open.id)}">${undecided(open).length ? 'Review responses' : 'Open engagement'}</a>`;
    // Already rehired: point to the new terms instead of offering the rehire again
    const again = L.active.find((x) => x.opId === h.opId);
    if (again) return `<b>${RN.hire.started(again) ? 'Rehired' : 'Rehired · starts ' + esc(dmd(again.terms.startDate))}</b><a class="act" href="#buyer.team">See terms</a>`;
    return `<b>${esc(op.avail.label)}</b><button type="button" class="act" data-act="bw-rehire" data-hire="${esc(h.id)}">Rehire</button>`;
  }
  function byCatHtml(m, L) {
    const max = Math.max(1, ...m.byCat.map((g) => g.spent));
    return `<div class="bw-bycat"><span class="label">By role category</span><ul>${m.byCat.map((g) => `<li>
      <span class="bw-bycat-l">${catTag(g.cat)}<span class="tiny muted">${esc(g.names.join(', '))}</span></span>
      <span class="bw-bar" aria-hidden="true"><i style="width:${Math.max(2, (g.spent / max) * 100).toFixed(1)}%"></i></span>
      <b class="num">${esc(usd(g.spent))}</b></li>`).join('')}</ul>
      ${m.committed ? `<p class="small bw-agreed">${esc(usd(m.committed))} more is agreed until ${esc(dmd(m.lastEnd))}.</p>` : ''}
    </div>`;
  }
  function teamStrip(L) {
    const m = metrics(L);
    const rows = L.active.slice().sort((a, b) => ((a.terms.endDate || '9') < (b.terms.endDate || '9') ? -1 : 1)).concat(L.ended.slice().sort(latestEnd));
    const show = rows.slice(0, 5);
    const s4 = L.state === 'S4';
    return `<section class="bw-sec" aria-labelledby="bw-strip-t">
      ${secHead(`<span id="bw-strip-t">${s4 ? 'Past team' : 'Team'}</span>`, arrowLink('buyer.team', 'Open Team'), `${L.active.length} active · ${L.ended.length} past`)}
      <div class="card bw-strip">
        <table class="bw-strip-t">
          <thead><tr><th scope="col">Person</th><th scope="col">Status and time in seat</th><th scope="col">Next</th><th scope="col" class="bw-num">Spend</th></tr></thead>
          <tbody>${show.map((h) => {
            const op = opOf(h);
            if (!op) return '';
            const act = h.status === 'active';
            return `<tr class="${act ? '' : 'is-past'}">
              <td data-l="Person"><a class="bw-who" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${RN.ui.avatar(op, 'ava-md', { decorative: true })}<span><b class="serif-up">${esc(op.name)}</b><span class="tiny muted">Fractional ${esc(op.role)}</span>${catTag(catOf(h))}</span></a></td>
              <td data-l="Status"><span class="bw-cell">${RN.hire.statusPill(h)}<span class="tiny muted">${esc(RN.hire.timeInSeat(h, act ? 'short' : 'past'))}</span></span></td>
              <td data-l="Next"><span class="bw-cell">${hireNext(h, L)}</span></td>
              <td data-l="Spend" class="bw-num"><span class="bw-cell">${act ? `<b class="num">${esc(usd(RN.hire.monthly(h)))}/mo</b><span class="tiny muted">${esc(usd(RN.hire.spent(h)))} to date</span>` : `<b class="num">${esc(usd(RN.hire.spent(h)))}</b><span class="tiny muted">total</span>`}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${rows.length > show.length ? `<p class="bw-strip-more">${arrowLink('buyer.team', `Open Team to see all ${rows.length}`)}</p>` : ''}
        <div class="bw-strip-ft">
          ${m.anySpend ? byCatHtml(m, L) : `<p class="small">Spend shows here from your first hire’s start date.</p>`}
          <p class="tiny muted">Estimated from the terms you recorded. ${esc(FEE_NOTE)}</p>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Hiring pipeline (S1): four derived counts ---------- */
  function pipeline(L) {
    const ops = shortOps();
    const intr = myIntros().filter((i) => !i.withdrawn);
    const pending = intr.filter((i) => ['pending', 'interested', 'rn_qualified'].includes(i.status)).length;
    const introduced = intr.filter((i) => i.status === 'introduced').length;
    const resp = L.live.reduce((a, p) => a + (p.responses || []).filter((r) => r.status === 'interested').length, 0);
    const close = hireCandidates().map((c) => c.op.first).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2);
    return `<section class="bw-sec" aria-labelledby="bw-pipe-t">
      ${secHead('<span id="bw-pipe-t">Hiring pipeline</span>')}
      <div class="card bw-pipe">
        <a class="bw-pipe-c" href="#buyer.talent"><span class="label">Shortlisted</span><b class="num">${ops.length}</b>${ops.length ? `<span class="ava-stack">${ops.slice(0, 4).map((o) => RN.ui.avatar(o, 'ava-xs', { decorative: true })).join('')}</span>` : '<span class="tiny muted">Save operators from Browse</span>'}</a>
        <a class="bw-pipe-c" href="#buyer.intros"><span class="label">Intro requests</span><b class="num">${intr.length}</b><span class="tiny muted">${pending} pending · ${introduced} introduced</span></a>
        <a class="bw-pipe-c" href="#buyer.engagements"><span class="label">Engagement responses</span><b class="num">${resp}</b><span class="tiny muted">across ${plural(L.live.length, 'live engagement')}</span></a>
        <a class="bw-pipe-c" href="#buyer.team"><span class="label">Hired</span><b class="num">0</b><span class="tiny muted">${close.length ? `${esc(close.join(' and '))} ${close.length === 1 ? 'is' : 'are'} closest` : 'No one close yet'}</span></a>
      </div>
      <p class="small muted bw-pipe-ft">When you hire, record the terms. Your team then shows here with time in seat, next dates and spend.</p>
    </section>`;
  }

  /* ---------- Engagements grouped by status (Overview card and tab) ---------- */
  function engMeta(p) {
    const f = RN.projects && RN.projects.fields ? RN.projects.fields(p) : p.fields || {};
    const bits = [
      f.engagementType && RN.w.label('engagementType', f.engagementType),
      f.engagementType === 'project' ? f.projectBudget && `${usd(f.projectBudget)} budget` : f.hoursPerMonth && hoursText(f.hoursPerMonth),
      f.term && RN.w.label('term', f.term),
    ].filter(Boolean).map(esc);
    // A no-break space keeps each separator on the line of the item before it
    return [projCat(p) ? catTag(projCat(p)) : ''].concat(bits).filter(Boolean).join(' · ');
  }
  function engRow(p, L) {
    const vw = seen().engagementsViewed || {};
    const resp = (p.responses || []).filter((r) => r.status === 'interested');
    const fresh = undecided(p).filter((r) => !vw[p.id] || new Date(r.ts || 0) > new Date(vw[p.id])).length;
    const sel = p.selectedOpId && RN.model.byId(p.selectedOpId);
    let stat = '', act = '';
    const href = 'engagement.' + p.id;
    if (isLive(p)) {
      stat = [resp.length ? plural(resp.length, 'response') : 'No responses yet', fresh ? `${fresh} new` : '', `${(p.invited || []).length} invited`, p.postedAt ? `posted ${dmd(p.postedAt)}` : ''].filter(Boolean).join(' · ');
      act = undecided(p).length ? arrowLink(href, 'Review responses') : arrowLink(href, 'Open');
    } else if (p.status === 'draft') {
      stat = `Saved ${dmd(p.updatedAt || p.createdAt)}`;
      act = arrowLink(href, 'Finish draft');
    } else if (p.status === 'staffed') {
      stat = sel ? `Hired ${sel.name} · staffed ${dmd(p.staffedAt || p.updatedAt)}` : `Staffed ${dmd(p.staffedAt || p.updatedAt)}`;
      act = arrowLink(href, 'View');
    } else {
      stat = sel ? `Hired ${sel.name} · closed ${dmd(p.closedAt || p.updatedAt)}` : `Closed without a hire · ${dmd(p.closedAt || p.updatedAt || p.createdAt)}`;
      act = `<button type="button" class="act" data-act="bw-repost" data-id="${esc(p.id)}">Repost as a draft</button>`;
    }
    const rep = isLive(p) ? replaces(p, L) : null;
    return `<li class="bw-eng-i">
      <div class="grow">
        <a class="bw-eng-t" href="#${esc(href)}">${esc(p.title || 'Untitled engagement')}</a>
        <p class="tiny muted bw-eng-meta">${engMeta(p)}</p>
        <p class="small bw-eng-stat">${esc(stat)}</p>
        ${rep ? `<p class="tiny muted bw-eng-rep">${icon('refresh')}${esc(rep.text)}</p>` : ''}
      </div>
      <div class="bw-eng-a">${act}</div>
    </li>`;
  }
  function engGroups(list) {
    const review = list.filter((p) => isLive(p) && undecided(p).length);
    const rest = list.filter((p) => !review.includes(p));
    const groups = [{ key: 'review', label: 'Responses to review', items: review }];
    ['posted', 'in_progress', 'draft', 'staffed', 'closed'].forEach((s) => groups.push({ key: s, label: RN.w.label('projectStatus', s), items: rest.filter((p) => p.status === s) }));
    return groups.filter((g) => g.items.length);
  }
  function engGroupsHtml(L) {
    const list = L.projects.slice().sort(newestFirst);
    return engGroups(list).map((g) => {
      const top = g.key === 'closed' ? g.items.slice(0, 3) : g.items;
      const more = g.key === 'closed' ? g.items.slice(3) : [];
      return `<div class="bw-eng-g" data-group="${esc(g.key)}">
        <h3 class="label">${esc(g.label)} <span class="muted">${g.items.length}</span></h3>
        <ul class="bw-eng-l">${top.map((p) => engRow(p, L)).join('')}</ul>
        ${more.length ? `<details class="bw-more"><summary>Show all ${g.items.length}${icon('chev-down')}</summary><ul class="bw-eng-l">${more.map((p) => engRow(p, L)).join('')}</ul></details>` : ''}
      </div>`;
    }).join('');
  }
  function engagementsSection(L) {
    if (!L.projects.length) return '';
    return `<section class="bw-sec" aria-labelledby="bw-eng-t">
      ${secHead('<span id="bw-eng-t">Engagements</span>', arrowLink('buyer.engagements', 'Open Engagements'), `${L.live.length} open · ${L.projects.length} in all`)}
      <div class="card bw-eng">${engGroupsHtml(L)}</div>
    </section>`;
  }

  /* ================= Engagements tab ================= */
  function engagements(L) {
    const hasDraft = L.projects.some((p) => p.status === 'draft');
    return `${head({
      title: 'Engagements',
      sub: `Post a scoped engagement from a Blueprint. Matches are ranked on the same fields as operator profiles, and responses land here. ${esc(NO_FEES())}`,
      actions: L.projects.length ? `<a class="btn ${hasDraft ? 'btn-line' : ''}" href="#engagement.new">${icon('plus')}Post an engagement</a>` : '',
    })}
    ${L.projects.length ? `<div class="card bw-eng bw-eng-tab">${engGroupsHtml(L)}</div>`
      : `${RN.ui.empty({ icon: 'briefcase', title: 'No engagements yet', body: 'Start from a Blueprint: a scoped engagement with a 30/60/90-day plan, typical hours and rates. Posting takes three steps.', cta: '<a class="btn btn-sm" href="#engagement.new">Post an engagement</a>' })}
        <section class="bw-sec">${secHead('Start from the problem you have', arrowLink('blueprints', 'All Blueprints'))}${bpCards(bpFor())}</section>`}
    <div class="bw-quiet">${icon('layers')}<span>Not sure how to scope it? Blueprints show the outcome plan, hours and typical rate for common fractional engagements.</span>${arrowLink('blueprints', 'Browse Blueprints')}</div>`;
  }

  /* ================= Talent: shortlist, intros, saved searches, recently viewed ================= */
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
  function talent() {
    const ops = shortOps(), list = myIntros(), ss = savedSearches(), viewed = recentlyViewed(6);
    const none = !ops.length && !list.length && !ss.length && !viewed.length;
    // With nothing saved, the empty state's button is the page's one Browse action
    const hd = head({
      title: 'Talent',
      sub: 'Operators you saved, the intros you asked for, your saved searches and the profiles you opened.',
      actions: none ? '' : `<a class="btn btn-line" href="#browse">${icon('search')}Browse talent</a>`,
    });
    if (none) {
      return hd + RN.ui.empty({ icon: 'bookmark', title: 'Nothing saved yet', body: 'Save operators from Browse, or describe what you need on the Overview.', cta: '<a class="btn btn-sm" href="#browse">Browse talent</a>' });
    }
    const chip = (to, l, n) => `<button type="button" class="chip chip-sm" data-act="bw-jump" data-to="${to}">${esc(l)}${n != null ? ` <span class="muted">${n}</span>` : ''}</button>`;
    // Jump chips only for sections with something in them, and only when there is more than one to jump between
    const jumps = [['bw-sl', 'Shortlist', ops.length], ['bw-intros', 'Intros', list.length], ['bw-ss', 'Saved searches', ss.length], ['bw-recent', 'Recently viewed', viewed.length]].filter((j) => j[2] > 0);
    return `${hd}
    ${jumps.length >= 2 ? `<nav class="chipset bw-jumps" aria-label="On this page">${jumps.map((j) => chip(j[0], j[1], j[2])).join('')}</nav>` : ''}
    <section class="bw-sec bw-sec-first" id="bw-sl" aria-labelledby="bw-sl-t">
      ${secHead(`<span id="bw-sl-t" tabindex="-1">Shortlist</span> <span class="muted">${ops.length}</span>`, ops.length ? arrowLink('browse', 'Find more') : '')}
      ${shortlistBody()}
    </section>
    <section class="bw-sec" id="bw-intros" aria-labelledby="bw-intros-t">
      <div class="bw-sec-hd"><div><h2 class="h4" id="bw-intros-t" tabindex="-1">Intro requests <span class="muted">${list.length}</span></h2><p class="small muted">Operators reply within 72 hours, then our team introduces you by email.</p></div></div>
      ${introsBody()}
    </section>
    <div id="bw-ss">${savedSearchesSection()}</div>
    <section class="bw-sec" id="bw-recent" aria-labelledby="bw-recent-t">
      ${secHead('<span id="bw-recent-t" tabindex="-1">Recently viewed</span>')}
      ${viewed.length ? `<div class="bw-mini-list">${viewed.map((v) => miniRow(v.op, `Viewed ${RN.fmt.ago(v.ts)}`)).join('')}</div>`
        : `<div class="bw-quiet">${icon('eye')}<span>Profiles you open show up here so you can get back to them.</span>${arrowLink('browse', 'Browse talent')}</div>`}
    </section>`;
  }
  RN.actions['bw-jump'] = (el) => {
    const t = document.getElementById(el.dataset.to);
    if (!t) return;
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const h = t.querySelector('h2, [tabindex="-1"]');
    if (h) h.focus({ preventScroll: true });
  };

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
      <div class="bw-sec-hd"><h2 class="h4" id="bw-ss-t" tabindex="-1">Saved searches${list.length ? ` <span class="muted">${list.length}</span>` : ''}</h2>${list.length ? arrowLink('browse', 'New search') : ''}</div>
      ${list.length ? `<ul class="bw-ss">${list.map((ss) => {
        const line = critLine(ss);
        const name = ss.name || line || 'Saved search';
        const fresh = ssFresh(ss).length;
        return `<li class="bw-ss-i">
          <span class="bw-ss-ic" aria-hidden="true">${icon('search')}</span>
          <div class="grow"><b>${esc(name)}</b><span class="tiny muted">${esc([line !== name ? line : '', ss.createdAt ? 'Saved ' + RN.fmt.ago(ss.createdAt) : ''].filter(Boolean).join(' · ') || 'All operators')}</span>
            ${fresh ? `<span class="pill pill-info">${fresh} new since ${esc(dmd(ss.lastRunAt || ss.createdAt))}</span>` : ''}</div>
          <div class="bw-ss-a">
            <button type="button" class="btn btn-line btn-sm" data-act="bw-ss-run" data-id="${esc(ss.id)}" aria-label="Run saved search: ${esc(name)}">Run search</button>
            <button type="button" class="x-btn" data-act="bw-ss-del" data-id="${esc(ss.id)}" aria-label="Delete saved search: ${esc(name)}" title="Delete">${icon('x')}</button>
          </div>
        </li>`;
      }).join('')}</ul>`
        : `<div class="bw-quiet">${icon('search')}<span>No saved searches yet. Save a search on Browse and run it again here in one click.</span>${arrowLink('browse', 'Go to Browse')}</div>`}
    </section>`;
  }
  // Running a saved search records what the client saw, so the next "N new" is honest
  RN.actions['bw-ss-run'] = (el) => {
    const ss = savedSearches().find((x) => x.id === el.dataset.id);
    if (!ss) return;
    const ids = ssIds(ss);
    RN.store.update((s) => {
      const x = ((s.seen || {}).savedSearches || []).find((y) => y.id === ss.id);
      if (x) { x.lastRunAt = RN.now().toISOString(); x.lastRunIds = ids; }
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

  function miniRow(op, meta, extra) {
    const f = fitFor(op);
    return `<a class="bw-mini" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">
      ${RN.ui.avatar(op, 'ava-sm')}
      <span class="grow"><b class="serif-up">${esc(op.name)}</b><span class="tiny muted">Fractional ${esc(op.role)}${meta ? ' · ' + esc(meta) : ''}</span></span>
      ${f.signals.length ? `<span class="bw-fit" title="${esc(f.label)}: ${f.count} of ${f.signals.length} match signals">${esc(f.pct)}%<i>match</i></span>` : ''}
      ${extra || icon('chev-right')}
    </a>`;
  }

  /* ================= Shortlist (Talent tab) ================= */
  const sel = new Set();
  let selInit = false;
  function shortlistBody() {
    const ops = shortOps();
    if (!selInit) { st().compare.forEach((id) => { if (st().shortlist.includes(id)) sel.add(id); }); selInit = true; }
    [...sel].forEach((id) => { if (!st().shortlist.includes(id)) sel.delete(id); });
    const notes = seen().notes || {};
    const similar = ops.length ? RN.model.similar(ops[0], 8).filter((o) => !st().shortlist.includes(o.id)).slice(0, 3) : [];
    return `${ops.length ? `<div class="bw-selbar" role="region" aria-label="Compare selection">
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
            ${i ? `<a class="bw-sl-intro" href="#buyer.intros" data-act="bw-jump" data-to="bw-intros">${introPill(i)}<span>View intro</span></a>` : `<button type="button" class="btn btn-line btn-sm" data-act="intro-open" data-id="${esc(op.id)}">Request intro</button>`}
          </div>
        </div>`;
        return `<div class="bw-sl ${on ? 'is-sel' : ''}" data-op="${esc(op.id)}">${RN.ui.opCard(op, { why: matchLine(op), meta })}</div>`;
      }).join('')}</div>
      ${similar.length ? `<section class="bw-sec">${secHead(`Operators like ${esc(ops[0].first)}`, `<a class="act" href="#browse.${esc(ops[0].catKey)}">More in ${esc(RN.fields.catLabel(ops[0].catKey))}${icon('arrow')}</a>`)}
        <div class="grid g-3 bw-grid">${similar.map((op) => RN.ui.opCard(op, { compact: true, why: matchLine(op) })).join('')}</div></section>` : ''}`
      : `<div class="bw-quiet">${icon('bookmark')}<span>Your shortlist is empty. Save operators from Browse or any profile with the bookmark. They land here for side-by-side compare and intro requests.</span><a class="act" href="#browse">Browse talent${icon('arrow')}</a></div>`}`;
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

  /* ================= Intros (Talent tab) ================= */
  const openThreads = new Set();
  function introsBody() {
    const group = (i) => (isOpen(i) ? 0 : i.status === 'hired' ? 1 : 2);
    const list = myIntros().slice().sort((a, b) => group(a) - group(b) || new Date(b.createdAt) - new Date(a.createdAt));
    const open = list.filter(isOpen).length;
    // One primary in the section: the first intro that waits on a hire decision or on its terms
    const lead = list.find((i) => i.status === 'introduced' || (i.status === 'hired' && !hireForIntro(i)));
    return `${list.length ? `<p class="small muted bw-count">${RN.fmt.plural(list.length, 'request')} · ${open} in progress</p>
      <div class="stack bw-intros" style="--gap:18px">${list.map((i) => introCard(i, lead && lead.id === i.id)).join('')}</div>`
      : RN.ui.empty({ icon: 'handshake', title: 'No intro requests yet', body: 'Request an intro from any profile, your shortlist or a compare. Operators reply within 72 hours.', cta: '<a class="btn btn-line btn-sm" href="#browse">Browse talent</a>' })}`;
  }

  // The shared lifecycle track. A request the client closed shows how far it got, then Withdrawn or Not a fit.
  function lifecycle(i) {
    if (i.status !== 'declined' || !(i.withdrawn || i.closedBy === 'client')) return RN.ui.introTrack(i);
    const r = reachedIndex(i);
    const steps = RN.intro.steps.slice(0, r + 1).map((s) => { const d = stepDate(i, s); return { l: statusLabel(s), state: 'done', date: d ? RN.fmt.dateShort(d) : '' }; });
    steps.push({ l: i.withdrawn ? 'Withdrawn' : 'Not a fit', state: 'stop', date: RN.fmt.dateShort(lastTs(i)) });
    return RN.ui.track(steps, 'Intro progress');
  }

  function introCard(i, lead) {
    const op = RN.model.byId(i.opId);
    const solid = lead ? 'btn btn-sm' : 'btn btn-line btn-sm';
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
      next = `<b>You are connected by email.</b> Book the first call with ${esc(op.first)}. When you hire, record the terms here and they move to your Team tab.`;
      actions = `<button type="button" class="${solid}" data-act="bw-hired" data-id="${esc(i.id)}">${icon('handshake')}Mark as hired</button><button type="button" class="btn btn-line btn-sm" data-act="bw-notfit" data-id="${esc(i.id)}">Not a fit</button>`;
    } else if (i.status === 'hired') {
      const reviewed = hasMyReview(op.id);
      const h = hireForIntro(i);
      const terms = h ? ` ${esc(RN.fmt.rate(h.terms.rate))}${h.terms.startDate ? (RN.hire.notStarted(h) ? ', starts ' : ', started ') + esc(RN.hire.date(h.terms.startDate)) : ''}.` : '';
      next = !h ? `<b>You hired ${esc(op.first)}.</b> Confirm the terms you agreed so they show in your Team tab.`
        : h.cancelled ? `<b>You cancelled the engagement with ${esc(op.first)} before it started.</b> The terms stay in your Team tab.`
        : h.status === 'ended' ? `<b>${esc(op.first)} worked with ${esc(me().company.name)} until ${esc(dmd(RN.hire.winEnd(h)))}.</b> ${esc(RN.hire.timeInSeat(h, 'long'))} in seat.${reviewed ? ` Your review is live on ${esc(op.first)}’s profile.` : ` A short CORE review verifies ${esc(op.first)}’s focus areas for the next company.`}`
        : reviewed ? `<b>${esc(op.first)} is working with ${esc(me().company.name)}.</b>${terms} Your review is live on ${esc(op.first)}’s profile.`
        : `<b>${esc(op.first)} is working with ${esc(me().company.name)}.</b>${terms} When you are ready, a short CORE review verifies ${esc(op.first)}’s focus areas.`;
      actions = !h ? `<button type="button" class="${solid}" data-act="bw-hired" data-id="${esc(i.id)}">${icon('handshake')}Confirm the terms</button>`
        : h.cancelled ? `<a class="btn btn-line btn-sm" href="#buyer.team">${icon('users')}See terms in Team</a>`
        : `<a class="btn btn-line btn-sm" href="#buyer.team">${icon('users')}See terms in Team</a>${reviewed ? `<a class="btn btn-line btn-sm" href="#op.${esc(op.slug)}">See the review on ${esc(op.first)}’s profile</a>` : `<button type="button" class="btn btn-line btn-sm" data-act="bw-review-start" data-id="${esc(i.id)}">${icon('star')}Leave a CORE review</button>`}`;
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

  // "Mark as hired" on an introduced intro opens the shared "Confirm the terms" modal (RN.hire, intro.js).
  // Saving records the hire, moves the intro to Hired and emails both sides.
  RN.actions['bw-hired'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    if (!op) return;
    const f = i.fields || {};
    RN.hire.open({ opId: op.id, source: 'intro', sourceId: i.id, prefill: { engagementType: f.engagementType, hoursPerMonth: f.hoursPerMonth, projectBudget: f.projectBudget, startBy: f.startBy, client: { email: i.buyer.email, company: (i.buyer.company || {}).name, name: i.buyer.name } } });
  };

  RN.actions['bw-notfit'] = (el) => {
    const i = findIntro(el.dataset.id);
    const op = i && RN.model.byId(i.opId);
    if (!op) return;
    // One reason list for every client "Not a fit" (intros and engagements), from the registry when it is there
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
    const h = el.dataset.hire && RN.hire ? RN.hire.get(el.dataset.hire) : null;
    const i = h ? (h.source === 'intro' ? findIntro(h.sourceId) : null) : el.dataset.id ? findIntro(el.dataset.id) : BW.reviewableIntro(el.dataset.op);
    const opId = h ? h.opId : i && i.opId;
    const op = opId && RN.model.byId(opId);
    if (!op) { RN.ui.toast('Reviews open once you are introduced to the operator.', { icon: 'info' }); return; }
    let rr = myReviewRequests().find((r) => r.opId === opId && r.status === 'sent');
    if (!rr) {
      const c = me().company;
      const f = (i && i.fields) || {};
      const t = (h && h.terms) || {};
      const ended = h && h.status === 'ended';
      rr = {
        id: RN.uid('rr'), opId, reviewer: { name: me().name, email: me().email, company: c.name, title: me().title || '' }, engagement: c.name,
        // What we already know from the hire terms or the intro, so the review form opens prefilled
        details: { company: c.name, engagementType: t.engagementType || f.engagementType || '', start: t.startDate ? String(t.startDate).slice(0, 7) : i && i.hiredAt ? String(i.hiredAt).slice(0, 7) : '', end: ended ? [String(t.startDate || '').slice(0, 7), String(h.endedAt || t.endDate || '').slice(0, 7)].sort().pop() : '', ongoing: !ended, roleCategory: f.roleCategory || op.catKey, role: op.role, revenueRange: c.revenueRange || '', employeeRange: c.employeeRange || '', projectBudget: t.projectBudget || f.projectBudget || '', monthlySpend: h && t.engagementType !== 'project' ? RN.hire.monthly(h) || '' : '' },
        status: 'sent', sentAt: RN.now().toISOString(), source: 'client', introId: i ? i.id : undefined, hireId: h ? h.id : undefined,
      };
      // A review of sample history is part of the sample: clearing it removes the request and any review it produced
      if ((h && h.sample) || (i && i.sample)) rr.sample = true;
      RN.store.update((s) => { s.reviewRequests.unshift(rr); }, 'reviewRequests');
      RN.track('review_request', { opId, source: 'client' });
    }
    RN.go('review.' + rr.id);
  };

  /* ================= Team: everyone hired, time in seat, next dates, spend (D15) ================= */
  // Who the client can hire right now: introduced intros, hired intros with no terms yet, and interested responders
  function hireCandidates() {
    const out = [];
    myIntros().forEach((i) => {
      const op = RN.model.byId(i.opId);
      if (!op || hireForIntro(i)) return;
      if (i.status === 'introduced') out.push({ op, group: 'Intros', why: `Introduced ${RN.fmt.dateShort(lastTs(i))}. Book the first call, then record the terms.`, attrs: `data-act="bw-hired" data-id="${esc(i.id)}"`, label: 'Mark as hired' });
      else if (i.status === 'hired') out.push({ op, group: 'Intros', why: 'Marked hired. The terms are not recorded yet.', attrs: `data-act="bw-hired" data-id="${esc(i.id)}"`, label: 'Confirm terms' });
    });
    myProjects().filter(isLive).forEach((p) => {
      (p.responses || []).filter((r) => r.status === 'interested' && !['not_a_fit', 'not_selected', 'selected'].includes(r.decision)).forEach((r) => {
        const op = RN.model.byId(r.opId);
        if (!op || out.some((x) => x.op.id === op.id) || activeHires().some((h) => h.opId === op.id)) return;
        out.push({ op, group: `${catLabel(projCat(p))} · ${p.title || 'Untitled engagement'}`, pid: p.id, why: `Interested in “${p.title || 'your engagement'}”${r.rate ? ' at ' + RN.fmt.rate(r.rate) : ''}`, attrs: `data-act="bw-hire-resp" data-pid="${esc(p.id)}" data-id="${esc(op.id)}"`, label: `Hire ${op.first}` });
      });
    });
    return out;
  }
  // With no hires yet, the first candidate's button is the page's one primary action.
  // Grouped under "<Category> · <engagement title>" when responders come from more than one engagement.
  function candidatesSection(list, title, lead) {
    if (!list.length) return '';
    const pids = new Set(list.map((c) => c.pid).filter(Boolean));
    const groups = [];
    list.forEach((c) => { const k = pids.size > 1 ? c.group : ''; let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, items: [] })); g.items.push(c); });
    let k = 0;
    return `<section class="bw-sec" aria-labelledby="bw-cand-t">
      ${secHead(`<span id="bw-cand-t">${esc(title)}</span> <span class="muted">${list.length}</span>`)}
      ${groups.map((g) => `${g.k ? `<h3 class="label bw-cand-g">${esc(g.k)}</h3>` : ''}<div class="bw-mini-list">${g.items.map((c) => `<div class="bw-mini is-static">
        ${RN.ui.avatar(c.op, 'ava-sm')}
        <a class="grow" href="#op.${esc(c.op.slug)}" data-track-view="${esc(c.op.id)}"><b class="serif-up">${esc(c.op.name)}</b><span class="tiny muted">${esc(c.why)}</span></a>
        <span></span>
        <button type="button" class="btn btn-sm${lead && !k++ ? '' : ' btn-line'}" ${c.attrs}>${esc(c.label)}</button>
      </div>`).join('')}</div>`).join('')}
    </section>`;
  }
  const owesReview = (h) => h.status === 'ended' && !h.cancelled && !hasMyReview(h.opId) && h.endedAt && dayDiff(h.endedAt, today()) <= 180;
  function sourceLine(h) {
    const P = RN.projects;
    if (h.source === 'engagement' && P && P.get && P.get(h.sourceId)) return `From <a href="#engagement.${esc(h.sourceId)}">${esc(P.get(h.sourceId).title)}</a>`;
    if (h.source === 'rehire') { const prev = RN.hire.get(h.sourceId); return prev && prev.terms && prev.terms.startDate ? `Rehired after ${esc(RN.hire.timeInSeat(prev, 'past'))}` : 'Rehired'; }
    return 'From an intro request';
  }
  function meterHtml(h) {
    const t = h.terms || {};
    const mt = RN.hire.meter(h);
    if (!mt) return `<div class="bw-meter"><div class="bw-meter-hd"><b>${esc(RN.hire.started(h) ? RN.hire.timeInSeat(h, 'short') : 'Starts ' + dmd(t.startDate))}</b><span class="tiny muted">Open-ended: no end date recorded</span></div></div>`;
    const over = RN.hire.overdue(h);
    const head = !RN.hire.started(h) ? `<b>Starts ${esc(dmd(t.startDate))}</b><span class="tiny muted">${mt.total}-day term, to ${esc(dmd(t.endDate))}</span>`
      : over ? `<b class="bw-warn">Term ended ${esc(dmd(t.endDate))}</b><span class="tiny muted">${esc(pl(dayDiff(t.endDate, today()), 'day'))} ago · extend it or end the engagement</span>`
      : `<b>Month ${mt.month} of ${mt.months}</b><span class="tiny muted">${mt.served} of ${mt.total} days · ${esc(pl(mt.left, 'day'))} left</span>`;
    return `<div class="bw-meter${over ? ' is-over' : ''}">
      <div class="bw-meter-hd">${head}</div>
      <div class="bw-meter-bar" role="img" aria-label="${esc(`${mt.served} of ${mt.total} days served${mt.ext ? '. ' + mt.ext.label : ''}`)}"><i style="width:${mt.pct.toFixed(1)}%"></i>${mt.ext ? `<span class="bw-meter-tick" style="left:${mt.ext.pct.toFixed(1)}%"></span>` : ''}</div>
      <div class="bw-meter-ft tiny muted"><span>${esc(dmd(t.startDate))}</span>${mt.ext ? `<span class="bw-meter-ext">${esc(mt.ext.label)}</span>` : ''}<span>${esc(dmd(t.endDate))}</span></div>
    </div>`;
  }
  function costBox(h) {
    const t = h.terms || {};
    const m = RN.hire.monthly(h);
    const line = t.engagementType === 'project'
      ? `${t.projectBudget ? usd(t.projectBudget) + ' project budget over the term' : 'Project budget not recorded'}.`
      : `${m ? usd(m) + ' a month: ' : ''}${t.rate ? RN.fmt.rate(t.rate) : 'rate not recorded'} × ${RN.hire.hours(t.hoursPerMonth)} hrs.`;
    return `<div class="bw-hire-cost">
      <span class="label">Time in seat</span><b class="bw-cost-tis">${esc(RN.hire.timeInSeat(h, 'long'))}</b>
      <span class="label">Spend to date, estimated</span><b class="num">${esc(usd(RN.hire.spent(h)))}</b>
      <span class="tiny muted">${esc(line)}</span>
    </div>`;
  }
  function activeCard(h, lead) {
    const op = opOf(h);
    if (!op) return '';
    const t = h.terms || {};
    const reviewed = hasMyReview(op.id);
    const reviewOpen = RN.hire.reviewable(h);
    const pendingReview = myReviewRequests().find((r) => r.opId === op.id && r.status === 'sent');
    const last = lastCheckin(h);
    const nCheck = (h.checkins || []).length;
    const left = RN.hire.daysLeft(h);
    const attrs = `data-id="${esc(h.id)}"`;
    const next = [
      ['Term ends', t.endDate ? `${dmd(t.endDate)}${left != null ? (left < 0 ? ` · ${pl(-left, 'day')} ago` : left === 0 ? ' · today' : ` · in ${pl(left, 'day')}`) : ''}` : 'Open-ended'],
      ['Decide on renewal by', t.endDate ? (RN.hire.renewalBy(h) < today() ? `Now · was ${dmd(RN.hire.renewalBy(h))}` : dmd(RN.hire.renewalBy(h))) : 'No end date'],
      ['Last check-in', last ? `${dmd(last)} · ${nCheck} so far` : 'None yet'],
      ['Reviews open', reviewed ? 'Reviewed' : reviewOpen ? 'Open now' : dmd(RN.hire.addDays(t.startDate, 30))],
    ];
    const review = reviewed ? (myReviewOf(op.id) ? `<a class="btn btn-line btn-sm" href="#op.${esc(op.slug)}">See your review</a>` : '<span class="pill pill-good">Reviewed</span>')
      : reviewOpen ? `<button type="button" class="btn btn-line btn-sm" data-act="bw-review-start" data-hire="${esc(h.id)}">${icon('star')}${pendingReview ? 'Continue your review' : 'Leave a review'}</button>` : '';
    return `<article class="card bw-hire" id="hire-${esc(h.id)}">
      <div class="bw-intro-hd">
        <a class="bw-intro-who" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${RN.ui.avatar(op, 'ava-md')}<span><b class="serif-up">${esc(op.name)}</b><span class="small muted">Fractional ${esc(op.role)}</span>${catTag(catOf(h))}</span></a>
        <div class="bw-intro-st">${RN.hire.statusPill(h)}<span class="tiny faint">${sourceLine(h)} · hired ${esc(dmd(h.createdAt))}</span></div>
      </div>
      ${meterHtml(h)}
      ${h.endPlanned ? `<p class="note bw-plan">${icon('calendar')}<span>You chose to let this end on ${esc(dmd(t.endDate))}. We ask you to confirm then.</span></p>` : ''}
      <div class="bw-hire-body">
        <div class="stack" style="--gap:18px">
          <dl class="bw-terms">${RN.hire.facts(h).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          <dl class="bw-terms bw-next-dates">${next.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        </div>
        ${costBox(h)}
      </div>
      ${t.notes ? `<blockquote class="bw-hire-notes"><span class="label">Also agreed</span>${esc(t.notes)}</blockquote>` : ''}
      <div class="row bw-intro-act">
        <button type="button" class="btn ${lead === 'extend:' + h.id ? '' : 'btn-line'} btn-sm" data-act="hire-extend" ${attrs}>${icon('calendar')}Extend</button>
        <button type="button" class="btn btn-line btn-sm" data-act="bw-checkin" ${attrs}>${icon('message')}Request a check-in</button>
        ${review}
        <button type="button" class="act muted bw-hire-end" data-act="hire-end" ${attrs}>${RN.hire.notStarted(h) ? 'Cancel engagement' : 'End engagement'}</button>
      </div>
    </article>`;
  }
  function pastCard(h, lead, L) {
    const op = opOf(h);
    if (!op) return '';
    const t = h.terms || {};
    const owed = owesReview(h);
    const reviewed = hasMyReview(op.id);
    const how = h.cancelled ? 'Cancelled before start. No spend.'
      : t.endDate && dayOf(h.endedAt) < t.endDate ? `Ended early. The term ran to ${dmd(t.endDate)}.` : 'Completed the term.';
    const open = !h.cancelled && L.live.find((p) => projCat(p) === catOf(h));
    const terms = [termsLine(h), t.term ? RN.w.label('term', t.term) : ''].filter(Boolean).join(' · ');
    return `<article class="card bw-hire is-ended" id="hire-${esc(h.id)}">
      <div class="bw-intro-hd">
        <a class="bw-intro-who" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${RN.ui.avatar(op, 'ava-md')}<span><b class="serif-up">${esc(op.name)}</b><span class="small muted">Fractional ${esc(op.role)}</span>${catTag(catOf(h))}</span></a>
        <div class="bw-intro-st"><span class="row-nw" style="--gap:6px">${RN.hire.statusPill(h)}${h.cancelled ? '' : owed ? '<span class="pill pill-warn">Review owed</span>' : reviewed ? '<span class="pill pill-good">Reviewed</span>' : ''}</span><span class="tiny faint">${sourceLine(h)}</span></div>
      </div>
      <dl class="bw-terms bw-past">
        <div><dt>Dates</dt><dd>${esc(h.cancelled ? `Was due to start ${dmd(t.startDate)}` : RN.hire.timeInSeat(h, 'past'))}</dd></div>
        <div><dt>Terms</dt><dd>${esc(terms)}</dd></div>
        <div><dt>Total spend, estimated</dt><dd class="num">${h.cancelled ? 'No spend' : esc(usd(RN.hire.spent(h)))}</dd></div>
      </dl>
      <p class="small bw-how-ended">${esc(how)}</p>
      ${h.endNote ? `<blockquote class="bw-hire-notes"><span class="label">Your note when it ended</span>${esc(h.endNote)}</blockquote>` : ''}
      ${open ? `<div class="note info bw-open">${icon('refresh')}<span>Seat open again: “${esc(open.title || 'Untitled engagement')}” ${undecided(open).length ? `has ${esc(plural(undecided(open).length, 'response'))} to review` : 'is live'}.</span>${arrowLink('engagement.' + open.id, undecided(open).length ? 'Review responses' : 'Open engagement')}</div>` : ''}
      <div class="row bw-intro-act">
        ${owed ? `<button type="button" class="btn ${lead === 'review:' + h.id ? '' : 'btn-line'} btn-sm" data-act="bw-review-start" data-hire="${esc(h.id)}">${icon('star')}Leave a review</button>` : ''}
        ${h.cancelled || L.active.some((x) => x.opId === h.opId) ? '' : `<button type="button" class="btn btn-line btn-sm" data-act="bw-rehire" data-hire="${esc(h.id)}">${icon('refresh')}Rehire ${esc(op.first)}</button>`}
        <button type="button" class="act" data-act="bw-similar" data-hire="${esc(h.id)}">Find someone like ${esc(op.first)}</button>
        ${myReviewOf(op.id) ? `<a class="act" href="#op.${esc(op.slug)}">See your review</a>` : ''}
      </div>
    </article>`;
  }

  /* Team over time: one row per hire, solid for time worked, hatched for the agreed term ahead, grey once ended */
  function windowFor(list, extra) {
    const t0 = today();
    const starts = list.map((h) => h.terms && h.terms.startDate).filter(Boolean).concat(extra && extra.starts || []).sort();
    const ends = list.map((h) => (h.status === 'ended' ? RN.hire.winEnd(h) : (h.terms && h.terms.endDate) || t0)).concat(extra && extra.ends || [], t0).sort();
    let keys = RN.hire.monthKeys(starts[0] || t0, ends[ends.length - 1]);
    const earlier = keys.length > (extra && extra.max || 18);
    if (earlier) keys = keys.slice(-(extra && extra.max || 18));
    const ws = keys[0] + '-01';
    const we = RN.hire.addMonths(keys[keys.length - 1] + '-01', 1);
    const total = Math.max(1, dayDiff(ws, we));
    const pct = (d) => RN.clamp((dayDiff(ws, d) / total) * 100, 0, 100);
    return { keys, ws, we, pct, earlier, t0 };
  }
  const MON = (k) => new Date(k + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' });
  function axisHtml(w, cls) {
    return `<div class="${cls}-axis" aria-hidden="true"><span class="${cls}-name">${w.earlier ? '<span class="tiny muted">Earlier</span>' : ''}</span><div class="${cls}-track">${w.keys.map((k, i) => {
      const jan = k.endsWith('-01') || i === 0;
      return `<span class="bw-mo" style="left:${w.pct(k + '-01').toFixed(2)}%"><b>${esc(MON(k))}${jan ? ` <i class="bw-yr">’${esc(k.slice(2, 4))}</i>` : ''}</b><i class="bw-m1">${esc(MON(k)[0])}</i></span>`;
    }).join('')}</div></div>`;
  }
  function segs(h, w) {
    const t = h.terms || {};
    const out = [];
    if (!t.startDate || h.cancelled) return out;
    const ended = h.status === 'ended';
    if (RN.hire.started(h)) {
      const a = t.startDate, b = RN.hire.winEnd(h);
      if (b >= w.ws && a < w.we) out.push({ cls: ended ? 'is-ended' : 'is-worked', l: w.pct(a), r: w.pct(b), clip: a < w.ws });
    }
    if (!ended && t.endDate && t.endDate > w.t0) {
      const a = t.startDate > w.t0 ? t.startDate : w.t0;
      out.push({ cls: 'is-ahead', l: w.pct(a), r: w.pct(t.endDate), clip: false });
    }
    return out;
  }
  const segHtml = (s) => `<i class="bw-seg ${s.cls}${s.clip ? ' is-clip' : ''}" style="left:${s.l.toFixed(2)}%;width:${Math.max(s.cls === 'is-search' ? 1.2 : 0.6, s.r - s.l).toFixed(2)}%"></i>`;
  const LEGEND = (items) => `<ul class="bw-legend" aria-label="Legend">${items.map(([cls, l]) => `<li><i class="bw-seg ${cls}" aria-hidden="true"></i>${esc(l)}</li>`).join('')}</ul>`;
  function timelineCard(list) {
    const rows = list.filter((h) => !h.cancelled && h.terms && h.terms.startDate && opOf(h));
    if (!rows.length) return '';
    const w = windowFor(rows);
    const nowP = w.pct(w.t0);
    return `<section class="card bw-tl-card" aria-labelledby="bw-tl-t">
      <div class="card-hd"><div><h2 class="h4" id="bw-tl-t">Team over time</h2><p class="sub">Who worked with you and when, with the term still agreed ahead.</p></div></div>
      <div class="bw-tl" style="--p:${(nowP / 100).toFixed(4)}">
        ${axisHtml(w, 'bw-tl')}
        <ul class="bw-tl-rows">${rows.map((h) => {
          const op = opOf(h);
          const t = h.terms;
          const ended = h.status === 'ended';
          const endD = ended ? RN.hire.winEnd(h) : t.endDate || '';
          const endP = endD ? w.pct(endD) : nowP;
          const lab = ended ? dmd(endD) : t.endDate ? `to ${dmd(t.endDate)}` : 'open-ended';
          const sr = `${op.name}: ${dmd(t.startDate)} to ${ended ? dmd(endD) + ', ended' : t.endDate ? dmd(t.endDate) : 'open-ended'}. ${RN.hire.timeInSeat(h, 'long')} in seat.`;
          return `<li class="bw-tl-row${ended ? ' is-past' : ''}">
            <span class="bw-tl-name"><b class="serif-up">${esc(op.name)}</b><span class="tiny muted">${esc(catLabel(catOf(h)))}</span></span>
            <div class="bw-tl-track">${segs(h, w).map(segHtml).join('')}<span class="bw-tl-end${endP < 18 ? ' is-start' : ''}" style="left:${endP.toFixed(2)}%">${esc(lab)}</span></div>
            <span class="sr-only">${esc(sr)}</span>
          </li>`;
        }).join('')}</ul>
        <span class="bw-tl-today" aria-hidden="true"><span>Today</span></span>
      </div>
      ${LEGEND([['is-worked', 'Time worked'], ['is-ahead', 'Agreed term ahead'], ['is-ended', 'Ended']])}
    </section>`;
  }
  function spendCard(L) {
    const m = metrics(L);
    const hd = `<div class="card-hd"><div><h2 class="h4" id="bw-spm-t">Spend by month</h2><p class="sub">Estimated from the terms you recorded. This month is month to date.</p></div></div>`;
    if (!m.anySpend) return `<section class="card bw-spend" aria-labelledby="bw-spm-t">${hd}<p class="small">Spend shows here from your first hire’s start date.</p></section>`;
    const rows = RN.hire.spendByMonth(L.hires, m.firstStart, today());
    const shown = rows.slice(-18);
    const top = Math.max(1, ...shown.map((r) => r.total));
    const mag = Math.pow(10, Math.floor(Math.log10(top)));
    const max = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= top) || top;   // a round top line
    const who = (r) => r.by.filter((b) => b.amount).map((b) => ({ n: (opOf(b.h) || {}).name || 'Operator', a: b.amount }));
    return `<section class="card bw-spend" aria-labelledby="bw-spm-t">${hd}
      <div class="bw-cols" role="list" style="--n:${shown.length}">
        <span class="bw-cols-max tiny muted" aria-hidden="true">${esc(usd(max))}</span>
        ${shown.map((r) => {
          const label = `${r.label}${r.partial ? ', month to date' : ''}: ${usd(r.total)}`;
          const people = who(r);
          return `<div class="bw-col${r.partial ? ' is-partial' : ''}" role="listitem">
            <button type="button" class="bw-col-b" aria-label="${esc(label + (people.length ? '. ' + people.map((p) => `${p.n} ${usd(p.a)}`).join(', ') : ''))}"><i style="height:${Math.max(r.total ? 3 : 0, (r.total / max) * 100).toFixed(1)}%"></i></button>
            <span class="bw-col-tip" aria-hidden="true"><b>${esc(r.label)}${r.partial ? ' · month to date' : ''}</b><span class="num">${esc(usd(r.total))}</span>${people.map((p) => `<span class="bw-col-p"><span>${esc(p.n)}</span><span class="num">${esc(usd(p.a))}</span></span>`).join('')}</span>
            <span class="bw-col-l" aria-hidden="true">${esc(MON(r.key))}</span>
          </div>`;
        }).join('')}
      </div>
      <details class="bw-more bw-tbl"><summary>Show as a table${icon('chev-down')}</summary>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Month</th><th scope="col">Estimated spend</th><th scope="col">By person</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.label)}${r.partial ? ' (month to date)' : ''}</td><td class="num">${esc(usd(r.total))}</td><td class="small">${esc(who(r).map((p) => `${p.n} ${usd(p.a)}`).join(', ') || 'None')}</td></tr>`).join('')}
        <tr class="bw-tbl-total"><td>Total</td><td class="num">${esc(usd(rows.reduce((a, r) => a + r.total, 0)))}</td><td></td></tr></tbody></table></div>
      </details>
    </section>`;
  }
  function catCard(L) {
    const m = metrics(L);
    return `<section class="card bw-catcard" aria-labelledby="bw-cat-t">
      <div class="card-hd"><div><h2 class="h4" id="bw-cat-t">By role category</h2><p class="sub">Spend to date, estimated, and who filled each seat.</p></div></div>
      ${m.anySpend ? byCatHtml(m, L).replace('<span class="label">By role category</span>', '') : '<p class="small">Spend shows here from your first hire’s start date.</p>'}
    </section>`;
  }
  let teamFilter = 'all';
  RN.actions['bw-team-filter'] = (el) => { teamFilter = el.dataset.f || 'all'; RN.rerender(); };
  function team(L) {
    const all = L.all;
    const cands = hireCandidates();
    const hd = head({
      title: 'Team',
      sub: 'Everyone you have hired on Revenue Nomad: the terms, time in seat, next dates and what you have spent. You pay each operator’s rate and no fees.',
      // With no hires and no one to hire, the empty state's button is the page's one action
      actions: all.length || cands.length ? `<a class="btn btn-line" href="#browse">${icon('search')}Find talent</a>` : '',
    });
    if (!all.length) {
      // Someone the client can hire now comes first; the explanation stays a quiet line below it
      if (cands.length) return `${hd}${candidatesSection(cands, 'Ready to hire', true)}<div class="bw-quiet">${icon('users')}<span>When you hire, the terms you agreed show here with time in seat, next dates and spend.</span></div>`;
      const inFlight = myIntros().some((i) => isOpen(i) && !i.withdrawn);
      const cta = inFlight ? '<a class="btn btn-sm" href="#buyer.intros">Go to your intros</a>'
        : L.state === 'S0' ? '<a class="btn btn-sm" href="#buyer">Describe what you need</a>'
        : '<a class="btn btn-sm" href="#browse">Browse talent</a>';
      return `${hd}${RN.ui.empty({ icon: 'users', title: 'No hires yet', body: 'When you hire an operator, the terms you agreed show here: rate, available time, start date, term and end date, with time in seat and spend. Mark an introduced operator as hired, or hire someone who responded to your engagement.', cta })}`;
    }
    const active = all.filter((h) => h.status === 'active').sort((a, b) => ((a.terms.endDate || '9') < (b.terms.endDate || '9') ? -1 : 1));
    const past = all.filter((h) => h.status === 'ended').sort(latestEnd);
    const both = active.length && past.length;
    const f = both ? teamFilter : 'all';
    // One primary on the tab: Extend where a term ends within 30 days (or has ended), else the first review owed
    const ext = active.find((h) => { const d = RN.hire.daysLeft(h); return d != null && d <= 30; });
    const rev = !ext && past.find(owesReview);
    const lead = ext ? 'extend:' + ext.id : rev ? 'review:' + rev.id : '';
    const showA = f === 'past' ? [] : active, showP = f === 'active' ? [] : past;
    const m = metrics(L);
    const ops = new Set(L.hires.map((h) => h.opId));
    const chip = (k, l, n) => `<button type="button" class="chip chip-sm" data-act="bw-team-filter" data-f="${k}" aria-pressed="${f === k}">${esc(l)} <span class="muted">${n}</span></button>`;
    return `${hd}
    ${statsRow(L, false)}
    ${both ? `<div class="chipset bw-filter" role="group" aria-label="Show hires">${chip('all', 'All', all.length)}${chip('active', 'Active', active.length)}${chip('past', 'Past', past.length)}</div>` : ''}
    ${timelineCard(showA.concat(showP))}
    <div class="bw-two">${spendCard(L)}${catCard(L)}</div>
    ${showA.length ? `<section class="bw-sec" aria-labelledby="bw-act-t">${secHead(`<span id="bw-act-t">Active</span> <span class="muted">${showA.length}</span>`)}<div class="stack bw-hires" style="--gap:18px">${showA.map((h) => activeCard(h, lead)).join('')}</div></section>` : ''}
    ${showP.length ? `<section class="bw-sec" aria-labelledby="bw-past-t">${secHead(`<span id="bw-past-t">Past</span> <span class="muted">${showP.length}</span>`)}<div class="stack bw-hires" style="--gap:18px">${showP.map((h) => pastCard(h, lead, L)).join('')}</div></section>` : ''}
    ${candidatesSection(cands, 'Ready to hire')}
    ${L.hires.length ? `<p class="bw-totals">${esc(plural(ops.size, 'operator'))} since ${esc(monthYear(m.firstStart))} · ${esc(usd(m.spent))} spent, estimated</p>` : ''}`;
  }
  // Hire an interested responder straight from the Team tab: the same terms modal the engagement page opens
  RN.actions['bw-hire-resp'] = (el) => {
    const P = RN.projects;
    const p = P && P.get ? P.get(el.dataset.pid) : null;
    const op = RN.model.byId(el.dataset.id);
    if (!p || !op) return;
    const f = P.fields ? P.fields(p) : p.fields || {};
    const r = (p.responses || []).find((x) => x.opId === op.id) || {};
    const project = f.engagementType === 'project';
    const c = P.clientOf ? P.clientOf(p) : { email: me().email, company: me().company, name: me().name };
    RN.hire.open({ opId: op.id, source: 'engagement', sourceId: p.id, prefill: { engagementType: f.engagementType, rate: r.rate || op.rate, hoursPerMonth: project ? '' : f.hoursPerMonth || r.hours || '', projectBudget: project ? f.projectBudget : null, startBy: f.startBy, term: f.term, client: { email: c.email, company: (c.company || {}).name, name: c.name } } });
  };
  // Request a check-in: an email to the operator through Revenue Nomad (no mailto)
  RN.actions['bw-checkin'] = (el) => {
    const h = RN.hire.get(el.dataset.id);
    const op = h && RN.model.byId(h.opId);
    if (!op) return;
    RN.ui.modal({
      width: 520,
      title: `Request a check-in with ${esc(op.first)}`,
      sub: `We email ${esc(op.first)} your note. ${esc(op.first)} replies to you directly.`,
      body: `<form id="bw-checkin-form" data-submit="bw-checkin" data-id="${esc(h.id)}" class="stack" style="--gap:14px">
        <div class="field"><label for="bw-ci-note">Your note</label>
          <textarea class="textarea" id="bw-ci-note" name="note" maxlength="500" style="min-height:110px">Can we find 30 minutes this week to review progress against the plan and agree the next month’s priorities?</textarea></div></form>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="bw-checkin-form">${icon('send')}Send request</button>`,
    });
  };
  RN.submits['bw-checkin'] = (form, d) => {
    const h = RN.hire.get(form.dataset.id);
    const op = h && RN.model.byId(h.opId);
    const note = String(d.note || '').trim();
    if (!op) return;
    if (!note) { RN.ui.toast('Write a short note first.', { icon: 'info' }); return; }
    RN.ui.closeModal();
    RN.mail(op.name, `Check-in request from ${me().name}, ${me().company.name}`, `${note}\n\nReply to ${me().name} at ${me().email}.`, 'hire');
    RN.store.update((s) => { const x = (s.hires || []).find((y) => y.id === h.id); if (x) x.checkins = (x.checkins || []).concat({ ts: RN.now().toISOString(), note }); }, 'hires');
    RN.ui.toast(`Check-in request sent to ${esc(op.first)}.`, { icon: 'mail' });
    // The feed, the badges and the hire card read the check-ins: redraw so the request no longer shows as owed
    if (inWorkspace()) RN.rerender();
  };

  /* ================= History: coverage over time and the account log ================= */
  const toTs = (v) => { const s = String(v || ''); return s.length === 10 ? s + 'T12:00:00' : s; };
  function historyEvents(L) {
    const ev = [];
    const push = (ts, kind, ic, text, sub) => { if (ts) ev.push({ ts: toTs(ts), kind, icon: ic, text, sub: sub || '' }); };
    const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1).trim() + '…' : String(s || ''));
    L.projects.forEach((p) => {
      const t = `“${p.title || 'Untitled engagement'}”`;
      if (p.status === 'draft' || (p.postedAt && new Date(p.postedAt) - new Date(p.createdAt) > 36e5)) push(p.createdAt, 'engagements', 'edit', `Saved a draft: ${t}`);
      if (p.postedAt) push(p.postedAt, 'engagements', 'megaphone', `Posted ${t}`, plural((p.invited || []).length, 'operator') + ' invited');
      (p.responses || []).forEach((r) => {
        const op = RN.model.byId(r.opId);
        if (!op || !r.ts) return;
        if (r.status === 'interested') push(r.ts, 'engagements', 'message', `${op.name} responded to ${t}`, r.rate ? RN.fmt.rate(r.rate) : 'Rate on request');
        else push(r.ts, 'engagements', 'x', `${op.name} passed on ${t}`, r.reason && RN.fields.passReason ? RN.w.label('passReason', r.reason) : '');
      });
      const sel = p.selectedOpId && RN.model.byId(p.selectedOpId);
      if (p.status === 'staffed' && p.staffedAt) push(p.staffedAt, 'engagements', 'handshake', `Staffed ${t}`, sel ? `Hired ${sel.name}` : '');
      if (p.status === 'closed') push(p.closedAt || p.updatedAt || p.createdAt, 'engagements', 'check-circle', sel ? `Closed ${t} with a hire` : `Closed ${t} without a hire`, sel ? `Hired ${sel.name}` : '');
    });
    myIntros().forEach((i) => {
      const op = RN.model.byId(i.opId);
      if (!op) return;
      const need = (i.fields && i.fields.need) || i.need;
      push(i.createdAt, 'intros', 'handshake', `Requested an intro to ${op.name}`, need ? RN.w.label('need', need) : '');
      (i.thread || []).forEach((x, k) => {
        const text = String(x.text || '');
        if (text === statusLabel('introduced')) push(x.ts, 'intros', 'mail', `Introduced to ${op.name}`, 'By our team, by email');
        else if (text === 'Withdrawn by the client') push(x.ts, 'intros', 'x', `You withdrew your request to ${op.name}`);
        else if (/^Not a fit/.test(text) && x.from !== op.name) push(x.ts, 'intros', 'x', `You closed the intro with ${op.name}`, text.replace(/^Not a fit:?\s*/, ''));
        else if (i.status === 'declined' && !i.closedBy && x.from === op.name && k === i.thread.length - 1 && text !== statusLabel('interested')) push(x.ts, 'intros', 'x', `${op.name} passed`, text === statusLabel('declined') ? '' : clip(text, 120));
      });
    });
    L.all.forEach((h) => {
      const op = opOf(h);
      if (!op) return;
      push(h.createdAt, 'team', 'handshake', `${h.source === 'rehire' ? 'Rehired' : 'Hired'} ${op.name}`, termsSummary(h));
      if (RN.hire.started(h) && !h.cancelled) push(h.terms.startDate, 'team', 'play', `${op.name} started`, catLabel(catOf(h)));
      (h.extensions || []).forEach((e) => push(e.at, 'team', 'calendar', `Extended ${op.name}’s term`, `To ${dmd(e.to)}`));
      (h.checkins || []).forEach((c) => push(c.ts, 'team', 'message', `Requested a check-in with ${op.name}`, clip(c.note, 90)));
      if (h.status === 'ended') {
        if (h.cancelled) push(h.endedAt, 'team', 'x', `Cancelled the engagement with ${op.name} before it started`, h.endNote || '');
        else push(h.endedAt, 'team', 'check-circle', `Ended the engagement with ${op.name}`, [RN.hire.timeInSeat(h, 'long') + ' in seat', usd(RN.hire.spent(h)) + ' estimated', h.endNote ? `“${clip(h.endNote, 90)}”` : ''].filter(Boolean).join(' · '));
      }
    });
    const done = new Set();
    st().reviews.filter((r) => isMe(r.reviewerEmail) || (!r.reviewerEmail && r.reviewer === me().name)).forEach((r) => {
      const op = RN.model.byId(r.opId);
      if (!op) return;
      if (r.requestId) done.add(r.requestId);
      push(r.date, 'reviews', 'star', `Reviewed ${op.name}`, r.overall ? `${r.overall} out of 5 overall` : '');
    });
    myReviewRequests().filter((r) => r.status === 'completed' && !done.has(r.id)).forEach((r) => {
      const op = RN.model.byId(r.opId);
      if (op) push(r.completedAt, 'reviews', 'star', `Reviewed ${op.name}`, 'CORE review');
    });
    savedSearches().forEach((ss) => push(ss.createdAt, 'search', 'search', `Saved a search: ${ss.name || critLine(ss) || 'Saved search'}`));
    return ev.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }

  /* Coverage over time: one lane per role category, with who held the seat and when you were searching */
  function coverage(L) {
    const posted = L.projects.filter((p) => p.postedAt && p.status !== 'draft');
    const hires = L.hires.filter((h) => h.terms && h.terms.startDate && opOf(h));
    const first = {};
    hires.forEach((h) => { const c = catOf(h); if (c && (!first[c] || h.terms.startDate < first[c])) first[c] = h.terms.startDate; });
    posted.forEach((p) => { const c = projCat(p); const d = dayOf(p.postedAt); if (c && (!first[c] || d < first[c])) first[c] = d; });
    const cats = Object.keys(first).sort((a, b) => (first[a] < first[b] ? -1 : 1));
    if (!cats.length) return '';
    const searchEnd = (p) => dayOf(p.status === 'staffed' ? p.staffedAt || p.updatedAt : p.status === 'closed' ? p.closedAt || p.updatedAt : '') || today();
    const w = windowFor(hires, { starts: posted.map((p) => dayOf(p.postedAt)), ends: posted.map(searchEnd), max: 24 });
    const lanes = cats.map((c) => {
      const bars = [];
      hires.filter((h) => catOf(h) === c).forEach((h) => {
        const op = opOf(h);
        const t = h.terms;
        const end = h.status === 'ended' ? RN.hire.winEnd(h) : t.endDate || today();
        const sg = segs(h, w);
        if (!sg.length) return;   // nothing to draw yet (an open-ended hire that has not started)
        bars.push({ a: t.startDate, b: end, segs: sg, label: `${op.name} · ${t.engagementType === 'project' ? usd(t.projectBudget || 0) + ' project' : (t.rate ? RN.fmt.rate(t.rate) : 'Rate not recorded')}`, sr: `${op.name}, ${dmd(t.startDate)} to ${dmd(end)}` });
      });
      posted.filter((p) => projCat(p) === c).forEach((p) => {
        const a = dayOf(p.postedAt), b = searchEnd(p);
        bars.push({ a, b, segs: [{ cls: 'is-search', l: w.pct(a), r: w.pct(b), clip: a < w.ws }], label: `Searching · “${p.title || 'Untitled engagement'}”`, sr: `Searching with “${p.title || 'an engagement'}”, ${dmd(a)} to ${dmd(b)}` });
      });
      // Pack bars into rows so none overlap (with room for the label above each)
      bars.sort((x, y) => (x.a < y.a ? -1 : 1));
      const rows = [];
      bars.forEach((bar) => {
        const l = w.pct(bar.a);
        let r = rows.findIndex((endP) => endP + 1 <= l);
        if (r < 0) { rows.push(0); r = rows.length - 1; }
        rows[r] = Math.max(w.pct(bar.b), l + 22);
        bar.row = r;
      });
      return { c, bars, rows: Math.max(1, rows.length) };
    });
    // The legend lists only the marks drawn (a client still hiring sees Searching alone)
    const used = new Set();
    lanes.forEach((ln) => ln.bars.forEach((bar) => bar.segs.forEach((sg) => used.add(sg.cls))));
    return `<section class="card bw-cov-card" aria-labelledby="bw-cov-t">
      <div class="card-hd"><div><h2 class="h4" id="bw-cov-t">Coverage over time</h2><p class="sub">Each role you have hired or searched for: who held the seat, the term agreed ahead, and when you were searching.</p></div></div>
      <div class="bw-cov-scroll" data-bw-cov>
        <div class="bw-cov" style="--p:${(w.pct(w.t0) / 100).toFixed(4)}">
          ${axisHtml(w, 'bw-cov')}
          ${lanes.map((ln) => `<div class="bw-cov-lane">
            <div class="bw-cov-name">${catTag(ln.c)}</div>
            <div class="bw-cov-track" style="--rows:${ln.rows}">${ln.bars.map((bar) => {
              const l = Math.max(0, Math.min(...bar.segs.map((s) => s.l)));
              const r = Math.min(100, Math.max(...bar.segs.map((s) => s.r)));
              // Labels sit above the bar: from its start, or ending at its end when the bar is in the right half
              const pos = l > 50 ? `right:${(100 - r).toFixed(2)}%` : `left:${l.toFixed(2)}%`;
              return `<div class="bw-cov-bar" style="--row:${bar.row}"><span class="bw-cov-lab${l > 50 ? ' is-end' : ''}" style="${pos}">${esc(bar.label)}</span>${bar.segs.map(segHtml).join('')}<span class="sr-only">${esc(bar.sr)}</span></div>`;
            }).join('')}</div>
          </div>`).join('')}
          <span class="bw-cov-today" aria-hidden="true"><span>Today</span></span>
        </div>
      </div>
      ${LEGEND([['is-worked', 'In seat'], ['is-ahead', 'Agreed term ahead'], ['is-ended', 'Ended'], ['is-search', 'Searching']].filter(([cls]) => used.has(cls)))}
    </section>`;
  }
  let histFilter = 'all', histLimit = 50;
  RN.actions['bw-hist-filter'] = (el) => { histFilter = el.dataset.f || 'all'; histLimit = 50; RN.rerender(); };
  RN.actions['bw-hist-more'] = () => { histLimit += 50; RN.rerender(); };
  function history(L) {
    const since = clientSince(L);
    const m = metrics(L);
    const ev = historyEvents(L);
    const hd = head({ title: 'History', sub: 'How your account has changed over time: who covered each role, what you searched for, and every decision along the way.' });
    if (!ev.length) return hd + RN.ui.empty({ icon: 'clock', title: 'No history yet', body: 'Your history starts with your first search, intro or engagement. Every step lands here.', cta: '<a class="btn btn-sm" href="#browse">Browse talent</a>' });
    // Filters only for kinds the log has (a chip that leads nowhere is left out)
    const KINDS = [['all', 'All'], ['engagements', 'Engagements'], ['intros', 'Intros'], ['team', 'Team'], ['reviews', 'Reviews']]
      .filter(([k]) => k === 'all' || ev.some((e) => e.kind === k));
    const hf = KINDS.some(([k]) => k === histFilter) ? histFilter : 'all';
    const list = ev.filter((e) => hf === 'all' || e.kind === hf);
    const shown = list.slice(0, histLimit);
    const months = [];
    shown.forEach((e) => { const k = RN.fmt.monthYear(e.ts); let g = months.find((x) => x.k === k); if (!g) months.push((g = { k, items: [] })); g.items.push(e); });
    const summary = [since ? `Client since ${RN.fmt.date(since + 'T12:00:00')}` : 'New client', plural(L.projects.length, 'engagement'), plural(myIntros().length, 'intro request'), plural(L.hires.length, 'hire'), `${usd(m.spent)} spent, estimated`];
    return `${hd}
    <p class="bw-hist-sum">${esc(summary.join(' · '))}</p>
    ${L.hires.length || L.projects.some((p) => p.postedAt && p.status !== 'draft') ? coverage(L) : ''}
    <section class="bw-sec" aria-labelledby="bw-log-t">
      ${secHead('<span id="bw-log-t">Log</span>', '', 'Newest first. Every search, intro, engagement, hire and review on this account.')}
      ${KINDS.length > 2 ? `<div class="chipset bw-filter" role="group" aria-label="Filter the log">${KINDS.map(([k, l]) => `<button type="button" class="chip chip-sm" data-act="bw-hist-filter" data-f="${k}" aria-pressed="${hf === k}">${esc(l)} <span class="muted">${k === 'all' ? ev.length : ev.filter((e) => e.kind === k).length}</span></button>`).join('')}</div>` : ''}
      ${shown.length ? `<ol class="bw-log">${months.map((g) => `<li class="bw-log-m"><h3 class="label">${esc(g.k)}</h3><ol>${g.items.map((e) => `<li class="bw-log-i" data-kind="${esc(e.kind)}">
          <span class="bw-log-d">${esc(RN.fmt.dateShort(e.ts))}</span>
          <span class="bw-log-ic" aria-hidden="true">${icon(e.icon)}</span>
          <div class="grow"><b>${esc(e.text)}</b>${e.sub ? `<span class="tiny muted">${esc(e.sub)}</span>` : ''}</div>
        </li>`).join('')}</ol></li>`).join('')}</ol>` : '<p class="small muted">Nothing of this kind yet.</p>'}
      ${list.length > shown.length ? `<button type="button" class="btn btn-line btn-sm bw-log-more" data-act="bw-hist-more">Show more <span class="muted">${list.length - shown.length}</span></button>` : ''}
    </section>`;
  }

  /* ================= Lifecycle actions ================= */
  const inWorkspace = () => { const r = RN.currentRoute(); return !!(r && r.view && r.view.name.startsWith('buyer')); };
  // "Let it end": nothing changes today; on the end date the feed asks the client to confirm it finished
  RN.actions['bw-let-end'] = (el) => {
    const h = RN.hire.get(el.dataset.id);
    if (!h) return;
    RN.store.update((s) => { const x = (s.hires || []).find((y) => y.id === h.id); if (x) x.endPlanned = true; }, 'hires');
    RN.ui.toast(`We will ask you to confirm on ${esc(dmd(h.terms.endDate))}.`, { icon: 'calendar' });
    RN.rerender();
  };
  // Rehire an operator on the last terms. RN.hire (not RN.intro.open): the old intro reads "hired", so an intro would refuse.
  RN.actions['bw-rehire'] = (el) => {
    const prev = RN.hire.get(el.dataset.hire);
    const op = prev && RN.model.byId(prev.opId);
    if (!op) return;
    if (activeHires().some((h) => h.opId === op.id)) { RN.ui.toast(`${esc(op.first)} is already working with you.`, { icon: 'info', action: { label: 'Open Team', act: 'go', attrs: 'data-to="buyer.team"' } }); return; }
    const t = prev.terms || {};
    RN.hire.open({ opId: op.id, source: 'rehire', sourceId: prev.id, prefill: { engagementType: t.engagementType, rate: t.rate, hoursPerMonth: t.hoursPerMonth, projectBudget: t.projectBudget, term: t.term, startBy: op.avail.key, client: prev.client } });
  };
  // Someone like a past hire: same role category, led by their two strongest focus areas. The focus areas relax
  // (two, then one, then none) until at least three other operators match, so the list is never just the past hire.
  RN.actions['bw-similar'] = (el) => {
    const h = RN.hire.get(el.dataset.hire);
    const op = h && RN.model.byId(h.opId);
    if (!op) return;
    const cat = catOf(h) || op.catKey;
    const top = (op.tags || []).slice(0, 2).map((t) => t.t);
    const others = (tags) => RN.model.search({ q: '', tags, filters: { roleCategories: [cat] } }).filter((r) => r.op.id !== op.id).length;
    const tags = [top, top.slice(0, 1), []].find((t) => !t.length || others(t) >= 3);
    RN.browse.go({ filters: { roleCategories: [cat] }, tags });
  };
  // "Repost as a draft": the engagement page's own copy (pj-duplicate in projects.js: fields and brief, no invites or
  // responses). A copy of a sample engagement is marked sample, so it leaves with the sample (RN.sample.clear).
  (function markSampleCopies() {
    const dup = RN.actions['pj-duplicate'];
    if (!dup || dup._bwSample) return;
    const wrapped = (el) => {
      const src = RN.projects && RN.projects.get ? RN.projects.get(el.dataset.id) : null;
      const before = new Set(st().projects.map((p) => p.id));
      dup(el);
      if (!src || !src.sample) return;
      if (st().projects.some((p) => !before.has(p.id))) RN.store.update((s) => { s.projects.forEach((p) => { if (!before.has(p.id)) p.sample = true; }); }, 'projects');
    };
    wrapped._bwSample = true;
    RN.actions['pj-duplicate'] = wrapped;
  })();
  RN.actions['bw-repost'] = (el) => { if (RN.actions['pj-duplicate']) RN.actions['pj-duplicate'](el); };
  let lastDraft = null;
  RN.actions['bw-draft-discard'] = (el) => {
    const at = st().projects.findIndex((p) => p.id === el.dataset.id && p.status === 'draft');
    if (at < 0) return;
    lastDraft = { item: st().projects[at], at };
    RN.store.update((s) => { s.projects = s.projects.filter((p) => p.id !== el.dataset.id); }, 'projects');
    RN.ui.toast(`Draft “${esc(lastDraft.item.title || 'Untitled engagement')}” discarded`, { icon: 'check', action: { label: 'Undo', act: 'bw-draft-undo' } });
    if (inWorkspace()) RN.rerender();
  };
  RN.actions['bw-draft-undo'] = () => {
    if (!lastDraft) return;
    const { item, at } = lastDraft;
    lastDraft = null;
    RN.store.update((s) => { const l = s.projects.filter((p) => p.id !== item.id); l.splice(Math.min(at, l.length), 0, item); s.projects = l; }, 'projects');
    RN.ui.toast('Draft restored');
    if (inWorkspace()) RN.rerender();
  };
  // The alumni check-in: a need opens Browse on it; "not now" snoozes the question for 90 days
  RN.actions['bw-checkin-snooze'] = () => {
    const until = RN.hire.addDays(today(), 90);
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { checkin: { answer: 'later', at: RN.now().toISOString(), snoozeUntil: until } }); }, 'seen');
    RN.ui.toast(`Noted. We will ask again on ${esc(dmd(until))}.`, { icon: 'clock' });
    RN.rerender();
  };
  RN.actions['bw-need'] = (el) => {
    const need = el.dataset.need;
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { checkin: { answer: need, at: RN.now().toISOString(), snoozeUntil: RN.hire.addDays(today(), 14) } }); }, 'seen');
    RN.browse.go({ need, filters: { roleCategories: ((RN.fields.needCats || {})[need] || []).slice() } });
  };
  RN.actions['sample-clear'] = () => {
    if (!RN.sample) return;
    // A review written during the sample changed an operator's live profile in memory: the page reloads to undo it
    if (RN.sample.clear() === 'reload') return;
    RN.ui.toast('Sample cleared. Your own records are back.', { icon: 'check-circle' });
    if (inWorkspace()) RN.rerender(); else RN.go('buyer');
  };

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
