/* Intro request: one short sheet, reachable from every card, profile, compare and shortlist.
   - Clients who are signed in get everything prefilled; they pick 3 things and send.
   - Visitors give work email and company basics once (progressive profiling, same picklists as operator intake).
   - Operators receive the request blind (scope and value, no company or person name) until introduced (L369).
   Lifecycle (L471): Pending -> Interested -> RN Qualified -> Introduced -> Hired, or Declined. 72-hour response window. */
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
      foot: `<span class="small muted grow">Operators reply within 72 hours.</span><button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="intro-form">Send request</button>`,
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

  /* Status changes from Studio (operator), Admin (team) or the client. Sends the right emails. */
  intro.setStatus = function (id, status, note) {
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
    if (status === 'hired') RN.mail(op.name, `Engagement started with ${rec.buyer.company.name}`, `Congratulations. When the engagement wraps, we will ask ${rec.buyer.name} for a CORE review, which verifies your fit tags.`, 'intro');
  };
})();
