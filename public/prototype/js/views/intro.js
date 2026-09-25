/* Intro request: one short sheet, reachable from every card, profile, compare and shortlist.
   - Clients who are signed in get everything prefilled; they pick 3 things and send.
   - Visitors give work email and company basics once (progressive profiling, same picklists as operator intake).
   - Operators receive the request blind (scope and value, no company or person name) until introduced (L369).
   Lifecycle (L471): Pending -> Interested -> RN Qualified -> Introduced -> Hired, or Declined. 72-hour response window.
   Also home to RN.hire (D15): the one "Confirm the terms" flow every hire goes through (workspace, engagements, Admin). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon, w = () => RN.w;

  const intro = (RN.intro = {});

  intro.statusPill = function (status) {
    const map = { pending: 'pill-warn', interested: 'pill-info', rn_qualified: 'pill-info', introduced: 'pill-good', hired: 'pill-accent', declined: 'pill-bad' };
    return `<span class="pill ${map[status] || ''}">${esc(RN.w.label('introStatus', status))}</span>`;
  };
  intro.steps = ['pending', 'interested', 'rn_qualified', 'introduced', 'hired'];
  /* The signed-in client's open intro with an operator (matched on the client's email) */
  intro.mine = function (opId) {
    const email = (RN.personas.buyer.email || '').toLowerCase();
    return RN.store.state.intros.find((i) => i.opId === opId && i.status !== 'declined' && !i.withdrawn && (i.buyer && (i.buyer.email || '').toLowerCase()) === email) || null;
  };

  intro.summary = function (i, forOperator) {
    const f = i.fields || {};
    const firm = i.buyer && i.buyer.company ? i.buyer.company : {};
    const who = forOperator && !['introduced', 'hired'].includes(i.status)
      ? `A ${RN.w.label('industry', firm.industry) || 'client'} company · ${RN.w.label('companyRevenue', firm.revenueRange)} revenue · ${RN.w.label('companyEmployees', firm.employeeRange)} employees`
      : `${firm.name || 'Client'} · ${RN.w.label('industry', firm.industry)}`;
    const scope = [
      f.engagementType && RN.w.label('engagementType', f.engagementType),
      f.engagementType === 'project' ? (f.projectBudget ? RN.fmt.usd(f.projectBudget) + ' budget' : '') : f.hoursPerMonth && RN.w.label('hoursPerMonth', f.hoursPerMonth),
      f.startBy && 'Start ' + RN.w.label('startBy', f.startBy).toLowerCase(),
    ].filter(Boolean).join(' · ');
    return { who, scope, need: f.need ? RN.w.label('need', f.need) : '' };
  };

  /* A fictional client used by "Fill sample details" (distinct from the demo client, so the request is new) */
  const SAMPLE = { name: 'Sam Rivera', email: 'sam@harborlinesoftware.com', company: 'Harborline Software', industry: 'SMB Software', revenueRange: '5m_20m', employeeRange: '51_200' };
  const openFor = (opId, email) => RN.store.state.intros.find((i) => i.opId === opId && i.status !== 'declined' && !i.withdrawn && i.buyer && (i.buyer.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;

  /* ---------- Open the sheet ---------- */
  RN.actions['intro-open'] = (el) => intro.open(el.dataset.id);
  RN.actions['intro-sample'] = (el) => {
    const form = document.getElementById('intro-form');
    const keep = form ? RN.ui.formData(form) : {};
    RN.ui.closeModal();
    intro.open(el.dataset.id, Object.assign({}, keep, SAMPLE));
  };
  /* prefill (optional): {need, engagementType, startBy, hoursPerMonth, note, name, email, company, industry, revenueRange, employeeRange} */
  intro.open = function (opId, prefill) {
    prefill = prefill || {};
    const op = RN.model.byId(opId);
    if (!op) return;
    const st = RN.store.state;
    if (st.persona === 'operator' || st.persona === 'admin') {
      RN.ui.toast('Intro requests come from client accounts.', { icon: 'info', action: { label: 'View as client', act: 'persona', attrs: 'data-p="buyer"' } });
      return;
    }
    // Only this client's own open request counts (other companies may have asked the same operator)
    const existing = st.persona === 'buyer' ? intro.mine(opId) : null;
    if (existing) {
      RN.ui.toast(`You already asked to meet ${esc(op.first)}. Status: ${esc(RN.w.label('introStatus', existing.status))}.`, { icon: 'info', action: { label: 'Open workspace', act: 'go', attrs: 'data-to="buyer.intros"' } });
      return;
    }
    const signedIn = st.persona === 'buyer';
    const me = RN.personas.buyer;
    // Same brief as profile and compare scores: company firmographics plus saved match preferences
    const brief = signedIn ? Object.assign({}, RN.clientBrief(), { roleCategory: op.catKey }) : null;
    const fit = brief ? RN.model.fit(op, brief) : null;
    // What the client already told us wins: saved preferences, then the need picked on Home or Browse, then the category
    const NC = RN.fields.needCats || {};
    const fits = (n) => n && (NC[n] || []).includes(op.catKey);
    const said = [brief && brief.need, st.browse && st.browse.need].find(fits);
    const defaults = Object.assign({ need: said || Object.keys(NC).find((k) => (NC[k] || []).includes(op.catKey)) || 'not_sure', engagementType: (brief && brief.engagementType) || 'fractional', startBy: op.avail.key === 'available_now' ? 'available_now' : op.avail.key, hoursPerMonth: op.avail.hoursCode || '20' }, prefill);
    // Visitors start blank (their own details), with Browse filters as a head start; signed-in clients never see these fields
    const bf = (st.browse && st.browse.filters) || {};
    const first = (v) => [].concat(v || [])[0] || '';
    const who = Object.assign({ name: '', email: '', company: '', industry: first(bf.industries), revenueRange: first(bf.revenueRange), employeeRange: first(bf.employeeRange) }, prefill);
    RN.ui.modal({
      width: 620,
      title: `Request an intro to ${esc(op.first)}`,
      sub: `${esc(op.name)} · Fractional ${esc(op.role)} · ${esc(op.avail.label)}`,
      body: `<form id="intro-form" data-submit="intro-send" data-op="${esc(op.id)}" class="stack" style="--gap:22px">
        ${fit ? (() => { const hits = fit.signals.filter((s) => s.state === 'match').map((s) => esc(s.text)).slice(0, 2); return `<div class="note info">${icon('target')}<div><b>${esc(fit.label)} for ${esc(me.company.name)}</b> · ${fit.count} of ${fit.signals.length} signals.${hits.length ? ' ' + hits.join('. ') + '.' : ''}</div></div>`; })() : ''}
        ${RN.w.field('need', defaults.need, { name: 'need', compact: true })}
        ${RN.w.field('engagementType', defaults.engagementType, { name: 'engagementType', compact: true, change: 'intro-type' })}
        <div class="grid g-2" style="--gap:18px">
          <div data-intro-hours>${RN.w.field('hoursPerMonth', defaults.hoursPerMonth, { name: 'hoursPerMonth', label: 'Available time needed', compact: true })}</div>
          <div data-intro-budget hidden>${RN.w.field('projectBudget', '', { name: 'projectBudget', compact: true })}</div>
          ${RN.w.field('startBy', defaults.startBy, { name: 'startBy', compact: true })}
        </div>
        <div class="field"><label for="intro-note">Anything ${esc(op.first)} should know? <span class="opt">Optional</span></label>
          <textarea class="textarea" id="intro-note" name="note" maxlength="500" placeholder="The problem, the timeline, what good looks like in 90 days." style="min-height:90px">${esc(defaults.note || '')}</textarea></div>
        ${signedIn ? '' : `<fieldset class="card-flat stack" style="--gap:16px;border:1px solid var(--line-2)">
          <legend class="label" style="padding:0 6px">About you</legend>
          <div class="row between" style="--gap:12px;align-items:flex-start"><p class="small muted grow" style="max-width:44ch">Asked once. Operators see your company’s industry and size, not your name, until you are introduced.</p>
            <button type="button" class="act" data-act="intro-sample" data-id="${esc(op.id)}">${icon('edit')}Fill sample details</button></div>
          <div class="grid g-2" style="--gap:14px">
            ${RN.w.field('fullName', who.name, { name: 'name', compact: true })}
            ${RN.w.field('email', who.email, { name: 'email', compact: true })}
          </div>
          <div class="field"><label for="intro-co">Company</label><input class="input" id="intro-co" name="company" autocomplete="organization" placeholder="Company name" value="${esc(who.company)}"></div>
          ${RN.w.field('industry', who.industry, { name: 'industry', compact: true })}
          ${RN.w.field('companyRevenue', who.revenueRange, { name: 'revenueRange', compact: true })}
          ${RN.w.field('companyEmployees', who.employeeRange, { name: 'employeeRange', compact: true })}
        </fieldset>`}
      </form>`,
      foot: `<span class="small muted grow">No fees for companies. Operators reply within 72 hours.</span><button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="intro-form">Send request</button>`,
    });
  };

  RN.inputs['intro-type'] = (el) => {
    const form = el.closest('form');
    const project = el.value === 'project';
    form.querySelector('[data-intro-hours]').hidden = project;
    form.querySelector('[data-intro-budget]').hidden = !project;
  };

  RN.submits['intro-send'] = (form, data) => {
    const op = RN.model.byId(form.dataset.op);
    const st = RN.store.state;
    const me = RN.personas.buyer;
    const signedIn = st.persona === 'buyer';
    const company = signedIn ? me.company : { name: data.company || 'Your company', industry: data.industry, revenueRange: data.revenueRange, employeeRange: data.employeeRange };
    if (!signedIn && (!data.name || !data.email || !data.company || !data.revenueRange || !data.employeeRange)) { RN.ui.toast('Add your name, work email, company, revenue range and employee range so we can match you.', { icon: 'info' }); return; }
    // One open request per client and operator, checked on the email actually submitted
    const dup = openFor(op.id, signedIn ? me.email : data.email);
    if (dup) { RN.ui.toast(`${esc(signedIn ? 'You' : data.email)} already asked to meet ${esc(op.first)}. Status: ${esc(RN.w.label('introStatus', dup.status))}.`, { icon: 'info' }); return; }
    const rec = {
      id: RN.uid('intro'), opId: op.id, status: 'pending', createdAt: RN.now().toISOString(),
      buyer: { name: signedIn ? me.name : data.name, title: signedIn ? me.title : '', email: signedIn ? me.email : data.email, company },
      need: data.need,
      fields: { need: data.need, engagementType: data.engagementType, hoursPerMonth: data.engagementType === 'project' ? '' : data.hoursPerMonth, projectBudget: data.engagementType === 'project' ? +data.projectBudget || null : null, startBy: data.startBy, roleCategory: op.catKey },
      note: data.note || '',
      thread: [],
    };
    RN.store.update((s) => { s.intros.unshift(rec); }, 'intros');
    // A visitor who asks for an intro becomes their own client (not the demo client) and is signed in
    if (!signedIn) { RN.shell.setClient({ name: data.name, email: data.email, title: '', company }); RN.store.set('persona', 'buyer'); }
    RN.track('intro_request', { opId: op.id, buyer: { name: company.name, industry: company.industry, revenueRange: company.revenueRange, employeeRange: company.employeeRange } });
    const sum = intro.summary(rec, true);
    RN.mail(op.name, `New intro request: ${sum.need || 'Fractional ' + op.role}`, `${sum.who}\n${sum.scope}\n\nReply within 72 hours from your Studio. You will see the company and contact once you are introduced.`, 'intro');
    RN.mail(rec.buyer.email, `We sent your request to ${op.first}`, `${op.name} has 72 hours to reply. We will email you when ${op.first} responds, and our team will set up the call.\n\nTrack it in your workspace.`, 'intro');
    RN.ui.closeModal();
    RN.shell.renderHeader();
    RN.ui.modal({
      width: 560,
      title: `Request sent to ${esc(op.first)}`,
      sub: 'Here is what happens next.',
      body: `<ol class="stack" style="--gap:14px;padding-left:20px;margin:0">
          <li><b>${esc(op.first)} replies within 72 hours.</b> <span class="muted">They see your scope and company size, not your name.</span></li>
          <li><b>Our team qualifies the fit.</b> <span class="muted">If ${esc(op.first)} passes, we suggest two operators with the same fit.</span></li>
          <li><b>You are introduced by email</b> <span class="muted">and book the first call directly.</span></li>
        </ol>
        ${!signedIn ? `<p class="note info" style="margin-top:18px">${icon('check-circle')}<span>We created a client workspace for ${esc(company.name)}. Your shortlist, compares and requests are saved there.</span></p>` : ''}`,
      foot: `<button class="btn btn-line" data-act="modal-close">Done</button><button class="btn" data-act="go" data-to="buyer.intros">Track in workspace</button>`,
    });
    if (RN.currentRoute() && RN.currentRoute().view.name !== 'profile') RN.rerender();
  };

  /* Status changes from Studio (operator), Admin (team) or the client. Sends the right emails.
     opts.quiet skips the status email (RN.hire sends its own terms emails when an intro becomes a hire). */
  intro.setStatus = function (id, status, note, opts) {
    const st = RN.store.state;
    const rec = st.intros.find((i) => i.id === id);
    if (!rec) return;
    const op = RN.model.byId(rec.opId);
    RN.store.update((s) => {
      const r = s.intros.find((i) => i.id === id);
      r.status = status;
      r.thread.push({ from: status === 'rn_qualified' || status === 'introduced' ? 'Revenue Nomad' : status === 'hired' ? r.buyer.name : op.name, text: note || RN.w.label('introStatus', status), ts: RN.now().toISOString() });
    }, 'intros');
    if (status === 'interested') RN.mail(rec.buyer.email, `${op.first} is interested`, `${op.name} wants to talk. Our team is confirming fit and will introduce you within one business day.`, 'intro');
    if (status === 'declined') RN.mail(rec.buyer.email, `${op.first} can’t take this one`, `${note || op.first + ' is at capacity.'}\n\nWe picked two operators with the same fit for you. See them in your workspace.`, 'intro');
    if (status === 'introduced') {
      RN.mail(rec.buyer.email, `Meet ${op.name}`, `You and ${op.first} are now connected. Reply-all to book your first call.`, 'intro');
      RN.mail(op.name, `Meet ${rec.buyer.name} at ${rec.buyer.company.name}`, `You are now connected with ${rec.buyer.name}, ${rec.buyer.title || 'client'} at ${rec.buyer.company.name}. Reply-all to book the first call.`, 'intro');
    }
    if (status === 'hired' && !(opts && opts.quiet)) RN.mail(op.name, `Engagement started with ${rec.buyer.company.name}`, `Congratulations. When the engagement wraps, we will ask ${rec.buyer.name} for a CORE review, which verifies your fit tags.`, 'intro');
  };
  /* =====================================================================================
     Hires (D15, founder decision Sep 25, 2026): once a client hires an operator, the agreed terms live in
     RN.store.state.hires = [{id, opId, client: {email, company, name}, source: 'intro'|'engagement', sourceId,
       terms: {engagementType, rate, hoursPerMonth, startDate, term, endDate, projectBudget, notes},
       status: 'active'|'ended', createdAt, endedAt, extensions: [{term, from, to, at}]}]
     RN.hire.open({opId, source, sourceId, prefill}) opens "Confirm the terms", built from registry fields
     (engagementType, rate, hoursPerMonth or projectBudget, a start date, term). Saving creates the hire (or updates
     the one already recorded for that source) and marks the source hired: the intro becomes 'hired'; an engagement's
     response is selected and the engagement staffed (RN.projects.select, also run by projects.js on the 'hires'
     store key). It emails the client and the operator and toasts a link to the workspace Team tab (#buyer.team).
     Clients pay the operator's listed rate and no fees (D1), so every client figure is the rate itself. Only the
     operator's email states their take-home (operator-facing). Also: RN.hire.list(filter), get(id), forSource(),
     end(id), extend(id, newTerm), monthly(h), facts(h), statusPill(h), reviewable(h), takeHome(rate), notStarted(h).
     Ending a hire before its start date cancels it: status 'ended' with cancelled: true, labelled "Cancelled before
     start", and no review is asked for.
     ===================================================================================== */
  const hire = (RN.hire = {});
  const TERM_MONTHS = { '1_3': 3, '3_6': 6, '6_12': 12, '12_plus': 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const asDate = (v) => new Date(String(v || '').length === 10 ? v + 'T12:00:00' : v);
  const lc = (x) => String(x == null ? '' : x).toLowerCase().trim();
  const today = () => isoDay(RN.now());
  function addDays(v, n) { const d = asDate(v); d.setDate(d.getDate() + n); return isoDay(d); }
  function addMonths(v, n) { const d = asDate(v); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return isoDay(d); }
  const START_DAYS = { available_now: 7, available_2_weeks: 14, available_2_plus_weeks: 28 };
  hire.startFrom = (startBy) => addDays(today(), START_DAYS[startBy] || 7);
  hire.endFor = (startDate, term) => (startDate && TERM_MONTHS[term] ? addMonths(startDate, TERM_MONTHS[term]) : '');
  hire.months = (term) => TERM_MONTHS[term] || 0;
  hire.date = (v) => (v ? RN.fmt.date(asDate(v)) : '');
  // Hours per month from the stored chip code ("<20" counts as 15, as on the intake rate hint)
  hire.hours = (code) => { const n = +code || 0; return n === 19 ? 15 : n; };
  // Operator-facing only: what the operator keeps after Revenue Nomad's share (proposed 25% of billed earnings)
  hire.takeHome = (rate) => (!rate ? 0 : RN.model.takeHome(rate));
  hire.FEE_LINE = RN.model.feeLine();

  hire.all = () => (RN.store.state.hires || []);
  hire.get = (id) => hire.all().find((h) => h.id === id) || null;
  hire.forSource = (source, sourceId, opId) => hire.all().find((h) => h.source === source && h.sourceId === sourceId && (!opId || h.opId === opId)) || null;
  /* filter: a function, or {opId, email (the client's), status, source, sourceId} */
  hire.list = function (f) {
    const all = hire.all().slice();
    if (!f) return all;
    if (typeof f === 'function') return all.filter(f);
    return all.filter((h) => (!f.opId || h.opId === f.opId) && (!f.email || lc(h.client && h.client.email) === lc(f.email))
      && (!f.status || h.status === f.status) && (!f.source || h.source === f.source) && (!f.sourceId || h.sourceId === f.sourceId));
  };
  const isProject = (h) => (h.terms || {}).engagementType === 'project';
  // What the client pays a month: the rate times the hours (no fees), or a project budget spread over its term
  hire.monthly = function (h) {
    const t = (h && h.terms) || {};
    if (isProject(h)) {
      const span = t.startDate && t.endDate ? Math.max(1, Math.round((asDate(t.endDate) - asDate(t.startDate)) / (30.44 * 864e5))) : TERM_MONTHS[t.term] || 1;
      return t.projectBudget ? Math.round(+t.projectBudget / span) : 0;
    }
    return Math.round((+t.rate || 0) * hire.hours(t.hoursPerMonth));
  };
  hire.monthlyNote = function (h) {
    const t = h.terms || {};
    if (isProject(h)) return t.projectBudget ? `${RN.fmt.usd(t.projectBudget)} project budget over the term` : 'Project budget not recorded';
    return t.rate && t.hoursPerMonth ? `${RN.fmt.rate(t.rate)} × ${hire.hours(t.hoursPerMonth)} hrs${+t.hoursPerMonth === 19 ? ' (under 20)' : ''}` : 'Rate or available time not recorded';
  };
  hire.overdue = (h) => h.status === 'active' && h.terms && h.terms.endDate && h.terms.endDate < today();
  // An active hire whose start date is still ahead: ending it cancels it (h.cancelled), with no end date before the start
  hire.notStarted = (h) => !!(h && h.status === 'active' && h.terms && h.terms.startDate && h.terms.startDate > today());
  hire.statusPill = (h) => (h.cancelled ? '<span class="pill">Cancelled before start</span>' : h.status === 'ended' ? '<span class="pill">Ended</span>' : hire.overdue(h) ? '<span class="pill pill-warn">Term ended</span>' : '<span class="pill pill-good">Active</span>');
  // Reviews open once the engagement ends, or any time 30 days after it starts. Never for one cancelled before it started.
  hire.reviewable = (h) => !h.cancelled && (h.status === 'ended' || !!(h.terms && h.terms.startDate && RN.now() - asDate(h.terms.startDate) >= 30 * 864e5));
  /* The agreed terms as [label, value] rows, registry labels throughout */
  hire.facts = function (h) {
    const t = h.terms || {};
    const ext = (h.extensions || []).length;
    return [
      [RN.fields.engagementType.label, t.engagementType ? RN.w.label('engagementType', t.engagementType) : 'Not recorded'],
      ['Rate', t.rate ? RN.fmt.rate(t.rate) : isProject(h) ? 'Fixed project budget' : 'Not recorded'],
      isProject(h) ? [RN.fields.projectBudget.label, t.projectBudget ? RN.fmt.usd(t.projectBudget) : 'Not recorded'] : [RN.fields.hoursPerMonth.label, t.hoursPerMonth ? RN.w.label('hoursPerMonth', t.hoursPerMonth) : 'Not recorded'],
      ['Start date', t.startDate ? hire.date(t.startDate) : 'Not recorded'],
      [RN.fields.term.label, t.term ? RN.w.label('term', t.term) : 'Not recorded'],
      h.cancelled ? ['Cancelled', `${hire.date(h.endedAt)}, before the start date`]
        : [h.status === 'ended' ? 'Ended' : 'End date', h.status === 'ended' ? hire.date(h.endedAt || t.endDate) : t.endDate ? hire.date(t.endDate) + (ext ? ` · extended ${ext === 1 ? 'once' : ext + ' times'}` : '') : 'Open-ended'],
    ];
  };
  function clientFor(o, intr) {
    const pre = (o.prefill && o.prefill.client) || null;
    if (pre && pre.email) return { email: pre.email, company: typeof pre.company === 'object' ? pre.company.name : pre.company || '', name: pre.name || '' };
    if (intr && intr.buyer) return { email: intr.buyer.email, company: (intr.buyer.company || {}).name || '', name: intr.buyer.name || '' };
    if (o.source === 'engagement' && RN.projects && RN.projects.get && RN.projects.clientOf) {
      const p = RN.projects.get(o.sourceId);
      if (p) { const c = RN.projects.clientOf(p); return { email: c.email, company: (c.company || {}).name || '', name: c.name || '' }; }
    }
    const me = RN.personas.buyer;
    return { email: me.email, company: me.company.name, name: me.name };
  }

  /* ---------- Confirm the terms ---------- */
  hire.open = function (o) {
    o = o || {};
    const op = RN.model.byId(o.opId);
    if (!op) return;
    const st = RN.store.state;
    if (st.persona === 'operator' || st.persona === 'visitor') { RN.ui.toast('The client or the Revenue Nomad team confirms a hire.', { icon: 'info' }); return; }
    const source = o.source === 'engagement' ? 'engagement' : 'intro';
    const intr = source === 'intro' ? st.intros.find((i) => i.id === o.sourceId) : null;
    const existing = hire.forSource(source, o.sourceId, op.id);
    const pre = o.prefill || {};
    const f = (intr && intr.fields) || {};
    const t = existing ? existing.terms : {};
    const v = {
      engagementType: t.engagementType || pre.engagementType || f.engagementType || 'fractional',
      rate: t.rate || pre.rate || op.rate || '',
      hoursPerMonth: t.hoursPerMonth || pre.hoursPerMonth || f.hoursPerMonth || op.avail.hoursCode || '20',
      projectBudget: t.projectBudget || pre.projectBudget || f.projectBudget || '',
      startDate: t.startDate || pre.startDate || hire.startFrom(pre.startBy || f.startBy),
      term: t.term || pre.term || f.term || '3_6',
      // The engagement title is already the hire's source, so it is not repeated as a note
      notes: t.notes || (pre.notes && !(source === 'engagement' && RN.projects && RN.projects.get && (RN.projects.get(o.sourceId) || {}).title === pre.notes) ? pre.notes : ''),
    };
    const client = clientFor(o, intr);
    const admin = st.persona === 'admin';
    const project = v.engagementType === 'project';
    RN.ui.modal({
      width: 640,
      title: existing ? `Terms with ${esc(op.first)}` : admin ? `Record the hire: ${esc(client.company || 'Client')} and ${esc(op.first)}` : `Confirm the terms with ${esc(op.first)}`,
      sub: `${esc(op.name)} · Fractional ${esc(op.role)}${client.company ? ' · ' + esc(client.company) : ''}`,
      body: `<form id="hire-form" class="stack hire-form" style="--gap:22px" data-submit="hire-save" data-input="hire-calc" data-change="hire-calc" data-op="${esc(op.id)}" data-source="${esc(source)}" data-source-id="${esc(o.sourceId || '')}" data-client="${esc(JSON.stringify(client))}" novalidate>
        <p class="small muted">${admin ? `Record what ${esc(client.company || 'the client')} and ${esc(op.first)} agreed. Both get the terms by email, and they show in the client’s Team tab and ${esc(op.first)}’s Studio.` : `Record what you agreed with ${esc(op.first)}. The terms show in your Team tab with the dates, and ${esc(op.first)} sees the same terms.`}</p>
        ${RN.w.field('engagementType', v.engagementType, { name: 'engagementType', id: 'hire-type', compact: true })}
        <div class="grid g-2" style="--gap:18px">
          <div data-hire-rate>${RN.w.field('rate', v.rate, { name: 'rate', id: 'hire-rate', label: 'Rate', help: op.rate ? `${op.first}’s listed rate is ${RN.fmt.rate(op.rate)}.` : '' })}</div>
          <div class="field"><label for="hire-start">Start date</label><input class="input" type="date" id="hire-start" name="startDate" value="${esc(v.startDate)}" required></div>
        </div>
        <div data-hire-hours ${project ? 'hidden' : ''}>${RN.w.field('hoursPerMonth', v.hoursPerMonth, { name: 'hoursPerMonth', id: 'hire-hours', compact: true })}</div>
        <div data-hire-budget ${project ? '' : 'hidden'}>${RN.w.field('projectBudget', v.projectBudget, { name: 'projectBudget', id: 'hire-budget', compact: true })}</div>
        ${RN.w.field('term', v.term, { name: 'term', id: 'hire-term', compact: true })}
        <div class="field"><label for="hire-notes">Anything else you agreed <span class="opt">Optional</span></label>
          <textarea class="textarea" id="hire-notes" name="notes" maxlength="400" style="min-height:72px" placeholder="Scope, check-in rhythm, who ${esc(op.first)} reports to.">${esc(v.notes)}</textarea></div>
        <div class="hire-sum" data-hire-sum aria-live="polite">${sumHtml(v)}</div>
      </form>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="hire-form">${existing ? 'Save terms' : admin ? 'Record hire' : `Confirm hire`}</button>`,
    });
  };
  function sumHtml(v) {
    const project = v.engagementType === 'project';
    const end = hire.endFor(v.startDate, v.term);
    const fake = { terms: { engagementType: v.engagementType, rate: +v.rate || 0, hoursPerMonth: v.hoursPerMonth, projectBudget: +v.projectBudget || 0, startDate: v.startDate, endDate: end, term: v.term } };
    const m = hire.monthly(fake);
    return `<div class="hire-sum-n"><span class="label">Estimated monthly cost</span><b class="num">${m ? RN.fmt.usd(m) : 'Add the terms'}</b><span class="tiny muted">${esc(project ? (v.projectBudget ? `${RN.fmt.usd(v.projectBudget)} spread over the term` : 'Add the project budget') : hire.monthlyNote(fake))}</span></div>
      <div class="hire-sum-n"><span class="label">End date</span><b>${end ? esc(hire.date(end)) : 'Pick a start date and term'}</b><span class="tiny muted">${v.term ? esc(RN.w.label('term', v.term)) + ' from the start date' : ''}</span></div>
      <p class="small hire-sum-note">No fees for companies. You pay the operator’s rate, nothing more.</p>`;
  }
  RN.inputs['hire-calc'] = (form) => {
    if (!form || !form.matches || !form.matches('form')) form = form && form.closest ? form.closest('form') : null;
    if (!form) return;
    const d = RN.ui.formData(form);
    const project = d.engagementType === 'project';
    form.querySelector('[data-hire-hours]').hidden = project;
    form.querySelector('[data-hire-budget]').hidden = !project;
    const box = form.querySelector('[data-hire-sum]');
    if (box) box.innerHTML = sumHtml(d);
  };
  RN.submits['hire-save'] = (form, d) => {
    const project = d.engagementType === 'project';
    const need = (msg, sel) => { RN.ui.toast(msg, { icon: 'info' }); const el = sel && form.querySelector(sel); if (el && el.focus) el.focus(); };
    if (!d.engagementType) return need('Pick the engagement type.');
    if (!project && !(+d.rate > 0)) return need('Add the hourly rate you agreed.', '#hire-rate');
    if (!project && !d.hoursPerMonth) return need('Pick the available time you agreed.');
    if (project && !(+d.projectBudget > 0)) return need('Add the project budget you agreed.', '#hire-budget');
    if (!d.startDate) return need('Add the start date.', '#hire-start');
    if (!d.term) return need('Pick the initial term.');
    let client = {};
    try { client = JSON.parse(form.dataset.client || '{}'); } catch (e) { client = {}; }
    RN.ui.closeModal();
    hire.save({ opId: form.dataset.op, source: form.dataset.source, sourceId: form.dataset.sourceId, client, terms: d });
  };

  /* Create (or update) a hire from known terms, mark its source hired, email both sides and point to the terms.
     Admin can call this directly when the terms are already known. Returns the hire. */
  hire.save = function (o) {
    const op = RN.model.byId(o.opId);
    if (!op) return null;
    const st = RN.store.state;
    const source = o.source === 'engagement' ? 'engagement' : 'intro';
    const d = o.terms || {};
    const project = d.engagementType === 'project';
    const terms = {
      engagementType: d.engagementType || 'fractional', rate: +d.rate || null, hoursPerMonth: project ? '' : String(d.hoursPerMonth || ''),
      startDate: d.startDate || hire.startFrom(''), term: d.term || '', endDate: '', projectBudget: project ? +d.projectBudget || null : null, notes: String(d.notes || '').trim(),
    };
    terms.endDate = hire.endFor(terms.startDate, terms.term);
    const prev = hire.forSource(source, o.sourceId, op.id);
    const intr = source === 'intro' ? st.intros.find((i) => i.id === o.sourceId) : null;
    const client = o.client && o.client.email ? o.client : clientFor({ source, sourceId: o.sourceId }, intr);
    const now = RN.now().toISOString();
    let rec;
    RN.store.update((s) => {
      s.hires = s.hires || [];
      const cur = prev && s.hires.find((h) => h.id === prev.id);
      if (cur) { cur.terms = Object.assign({}, cur.terms, terms); cur.updatedAt = now; rec = cur; }
      else { rec = { id: RN.uid('hire'), opId: op.id, client: { email: client.email, company: client.company || '', name: client.name || '' }, source, sourceId: o.sourceId || '', terms, status: 'active', createdAt: now, endedAt: null, extensions: [] }; s.hires.unshift(rec); }
      if (intr) { const r = s.intros.find((i) => i.id === intr.id); if (r) { r.hiredAt = r.hiredAt || now; r.hireId = rec.id; } }
    }, 'hires');
    if (intr && intr.status !== 'hired') RN.intro.setStatus(intr.id, 'hired', `${client.company || 'The client'} hired ${op.first}`, { quiet: true });
    // Staff the engagement with this operator (idempotent), unless it is already staffed with someone else
    if (source === 'engagement' && RN.projects && typeof RN.projects.select === 'function') {
      const pj = RN.projects.get ? RN.projects.get(o.sourceId) : null;
      if (pj && !(pj.status === 'staffed' && pj.selectedOpId && pj.selectedOpId !== op.id)) RN.projects.select(o.sourceId, op.id, { quiet: true });
    }
    const lines = hire.facts(rec).map(([k, v]) => `${k}: ${v}`).join('\n');
    const co = client.company || 'the client';
    if (prev) {
      RN.mail(client.email, `Terms updated: ${op.name}`, `${lines}\n\nSee them in your workspace: #buyer.team`, 'hire');
      RN.mail(op.name, `Terms updated with ${co}`, `${lines}\n\nSee them in Studio: #studio.engagements`, 'hire');
    } else {
      RN.mail(client.email, `You hired ${op.name}`, `${op.first} starts ${hire.date(terms.startDate)}. The terms you recorded:\n${lines}\n\nNo fees for companies: you pay ${op.first}’s rate, nothing more. Your Team tab keeps these terms, the end date and a check-in button: #buyer.team`, 'hire');
      RN.mail(op.name, `Engagement confirmed with ${co}`, `Congratulations. ${co} confirmed the terms:\n${lines}${terms.rate ? `\n\nYour take-home at ${RN.fmt.rate(terms.rate)} is ${RN.fmt.rate(hire.takeHome(terms.rate))}. ${hire.FEE_LINE}` : `\n\n${hire.FEE_LINE}`}\n\nWhen the engagement wraps, we ask the client for a CORE review, which verifies your fit tags. See it in Studio: #studio.engagements`, 'hire');
      RN.track('hire', { opId: op.id, source, sourceId: o.sourceId || '' });
    }
    const admin = st.persona === 'admin';
    RN.ui.toast(prev ? `Terms saved for ${esc(op.first)}.` : admin ? `Hire recorded. ${esc(co)} and ${esc(op.first)} were emailed the terms.` : `You hired ${esc(op.first)}. The terms are in your Team tab.`,
      { icon: 'handshake', ms: 5200, action: admin ? { label: 'See hires', act: 'go', attrs: 'data-to="admin.hires"' } : { label: 'Open Team', act: 'go', attrs: 'data-to="buyer.team"' } });
    if (RN.shell && RN.shell.renderHeader) RN.shell.renderHeader();
    RN.rerender();
    return rec;
  };

  /* ---------- End and extend ---------- */
  hire.end = function (id, note) {
    const h = hire.get(id);
    if (!h || h.status === 'ended') return h;
    const op = RN.model.byId(h.opId);
    const now = RN.now().toISOString();
    // Before the start date this is a cancellation, not an end: no end date earlier than the start, no review
    const cancel = hire.notStarted(h);
    RN.store.update((s) => { const x = s.hires.find((y) => y.id === id); x.status = 'ended'; x.endedAt = now; if (cancel) x.cancelled = true; if (note) x.endNote = String(note).trim(); }, 'hires');
    if (op && cancel) {
      RN.mail(op.name, `Engagement cancelled: ${h.client.company || 'client'}`, `${h.client.company || 'The client'} cancelled the engagement before its start date (${hire.date(h.terms.startDate)}).${note ? '\nNote: ' + note : ''}`, 'hire');
      RN.mail(h.client.email, `Engagement with ${op.name} cancelled`, `You cancelled the engagement with ${op.first} before it started. The terms stay in your Team tab as cancelled: #buyer.team`, 'hire');
    } else if (op) {
      RN.mail(op.name, `Engagement ended: ${h.client.company || 'client'}`, `${h.client.company || 'The client'} ended the engagement on ${hire.date(now)}.${note ? '\nNote: ' + note : ''}\n\nWe asked them for a CORE review. Verified reviews move your Reputation Index.`, 'hire');
      RN.mail(h.client.email, `Engagement with ${op.name} ended`, `Thank you for working with ${op.first}. A short CORE review helps the next company hire well, and verifies ${op.first}’s focus areas: #buyer.team`, 'hire');
    }
    RN.track('hire_end', { opId: h.opId });
    return hire.get(id);
  };
  hire.extend = function (id, newTerm) {
    const h = hire.get(id);
    if (!h || !TERM_MONTHS[newTerm]) return h;
    const op = RN.model.byId(h.opId);
    const from = h.terms.endDate && h.terms.endDate > today() ? h.terms.endDate : today();
    const to = addMonths(from, TERM_MONTHS[newTerm]);
    RN.store.update((s) => {
      const x = s.hires.find((y) => y.id === id);
      x.terms = Object.assign({}, x.terms, { endDate: to });
      x.extensions = (x.extensions || []).concat({ term: newTerm, from, to, at: RN.now().toISOString() });
      x.status = 'active'; x.endedAt = null; x.cancelled = false;
    }, 'hires');
    if (op) {
      RN.mail(op.name, `Engagement extended: ${h.client.company || 'client'}`, `${h.client.company || 'The client'} extended your engagement by ${RN.w.label('term', newTerm).toLowerCase()}. New end date: ${hire.date(to)}.`, 'hire');
      RN.mail(h.client.email, `Engagement with ${op.name} extended`, `New end date: ${hire.date(to)}. Same rate and available time. See it in your Team tab: #buyer.team`, 'hire');
    }
    RN.track('hire_extend', { opId: h.opId });
    return hire.get(id);
  };

  /* Shared modals (workspace Team tab and Admin): data-act="hire-edit|hire-extend|hire-end" data-id="<hireId>" */
  RN.actions['hire-edit'] = (el) => { const h = hire.get(el.dataset.id); if (h) { RN.ui.closeModal(); hire.open({ opId: h.opId, source: h.source, sourceId: h.sourceId, prefill: { client: h.client } }); } };
  RN.actions['hire-extend'] = (el) => {
    const h = hire.get(el.dataset.id);
    const op = h && RN.model.byId(h.opId);
    if (!op) return;
    RN.ui.modal({
      width: 520,
      title: `Extend the engagement with ${esc(op.first)}?`,
      sub: `Currently ends ${esc(hire.date(h.terms.endDate) || 'open-ended')}. Same rate and available time.`,
      body: `<form id="hire-extend-form" data-submit="hire-extend" data-id="${esc(h.id)}" class="stack" style="--gap:14px">
        ${RN.w.field('term', h.terms.term || '3_6', { name: 'term', id: 'hire-ext-term', label: 'Extend by', compact: true })}
        <p class="small muted">We email ${esc(op.first)} the new end date.</p></form>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="hire-extend-form">Extend</button>`,
    });
  };
  RN.submits['hire-extend'] = (form, d) => {
    if (!d.term) { RN.ui.toast('Pick how long to extend by.', { icon: 'info' }); return; }
    RN.ui.closeModal();
    const h = hire.extend(form.dataset.id, d.term);
    const op = h && RN.model.byId(h.opId);
    if (op) RN.ui.toast(`Extended. ${esc(op.first)}’s engagement now ends ${esc(hire.date(h.terms.endDate))}.`, { icon: 'calendar' });
    RN.rerender();
  };
  RN.actions['hire-end'] = (el) => {
    const h = hire.get(el.dataset.id);
    const op = h && RN.model.byId(h.opId);
    if (!op) return;
    const cancel = hire.notStarted(h);
    const admin = RN.store.state.persona === 'admin';
    RN.ui.modal({
      width: 520,
      title: cancel ? `Cancel the engagement with ${esc(op.first)} before it starts?` : `End the engagement with ${esc(op.first)}?`,
      sub: cancel
        ? `It was due to start ${esc(hire.date(h.terms.startDate))}. The terms stay ${admin ? 'on record' : 'in your Team tab'} as Cancelled before start, and we email ${admin ? 'both sides' : esc(op.first)}.`
        : admin ? `The terms stay on record as Ended. We email both sides and ask ${esc(h.client.name || 'the client')} for a short CORE review.` : `The terms stay in your Team tab as Ended. We email ${esc(op.first)} and ask you for a short CORE review.`,
      body: `<form id="hire-end-form" data-submit="hire-end" data-id="${esc(h.id)}" class="stack" style="--gap:14px">
        <div class="field"><label for="hire-end-note">Note for ${esc(op.first)} <span class="opt">Optional</span></label>
          <textarea class="textarea" id="hire-end-note" name="note" maxlength="300" style="min-height:72px" placeholder="What wrapped up, or what changed."></textarea></div></form>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Keep it active</button><button class="btn btn-danger" type="submit" form="hire-end-form">${cancel ? 'Cancel engagement' : 'End engagement'}</button>`,
    });
  };
  RN.submits['hire-end'] = (form, d) => {
    RN.ui.closeModal();
    const h = hire.end(form.dataset.id, d.note);
    const op = h && RN.model.byId(h.opId);
    if (!op) return;
    const persona = RN.store.state.persona;
    if (h.cancelled) { RN.ui.toast(`Engagement with ${esc(op.first)} cancelled before it started.`, { icon: 'check-circle' }); RN.rerender(); return; }
    RN.ui.toast(`Engagement with ${esc(op.first)} ended.`, persona === 'buyer' ? { icon: 'check-circle', ms: 5200, action: { label: 'Leave a review', act: 'bw-review-start', attrs: `data-hire="${esc(h.id)}"` } } : { icon: 'check-circle' });
    RN.rerender();
  };
})();
