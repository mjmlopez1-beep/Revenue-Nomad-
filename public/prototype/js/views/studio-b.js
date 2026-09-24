/* Operator Studio, part B: Inbox, Credibility, Opportunities, Edit profile.
   Registered as Studio tabs (shell in studio.js). Every structured input and filter reads RN.fields
   through RN.w, so values match the live operator signup.
   Prefix: sb- (actions, inputs, submits, CSS classes). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = () => RN.fields;
  const W = () => RN.w;
  const st = () => RN.store.state;

  /* UI state that does not need to persist */
  const S = { jobMore: false, inboxFilter: 'all', passOpen: {}, respOpen: {}, jobCat: '', jobEng: '', jobStatus: 'board', prosStatus: 'review', badgeFmt: 'web' };

  /* ======================================================================
     Shared helpers
     ====================================================================== */
  const seenMap = (k) => (st().seen && st().seen[k]) || {};
  const setSeen = (k, fn) => RN.store.update((s) => { s.seen = s.seen || {}; s.seen[k] = Object.assign({}, s.seen[k] || {}); fn(s.seen[k]); }, 'seen');
  const ym = (s) => (s ? RN.fmt.monthYear(new Date(s + (s.length === 7 ? '-01' : '') + 'T12:00:00')) : '');
  const todayISO = () => { const d = RN.now(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const secs = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);
  const initials = (s) => RN.fmt.initials(String(s || '').replace(/[^\w\s]/g, ' ')) || '?';
  const edits = (op) => st().edits[op.id] || {};
  const pageUrl = () => location.href.split('#')[0];
  // Escape, and keep numeric ranges like "51–200" or "$5M–$20M" from breaking at the dash
  const nb = (str) => esc(str).replace(/(\$?[\d.,]+[KM]?–\$?[\d.,]+[KM]?\+?)/g, '<span class="nowrap">$1</span>');
  const segs = (str) => String(str || '').split(' · ').map((x) => `<span class="nowrap">${esc(x)}</span>`).join(' · ');
  const fitCls = (pct) => (pct >= 75 ? 'strong' : pct >= 50 ? 'good' : 'part');

  function copyText(text) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); return true; }
    } catch (e) { /* fall through */ }
    ok = fallbackCopy(text);
    return ok;
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* Studio edits that RN.model.applyEdits does not cover yet (see hand-off notes) */
  function applyExtras(op) {
    const e = edits(op);
    if (e.newClientCapacity != null) op.newClientCapacity = e.newClientCapacity;
    if (e.roleFields) op.roleFields = e.roleFields;
    if (e.availConfirmedAt) op.avail = Object.assign({}, op.avail, { confirmedAt: e.availConfirmedAt });
    return op;
  }

  /* Fit on the one shared scale (RN.model.fit: Strong 75+, Good 50+) */
  function fitPill(fit, o) {
    if (!fit || !fit.signals.length) return '';
    return `<span class="sb-fit sb-fit-${fitCls(fit.pct)}" title="${esc(fit.signals.map((s) => s.text).join('. '))}">${o && o.you ? '<em>Your fit</em>' : icon('target')}<b>${fit.pct}</b>${esc(fit.label)}</span>`;
  }
  function fitSignals(fit) {
    if (!fit || !fit.signals.length) return '';
    return `<ul class="sb-sigs" aria-label="Match signals">${fit.signals.map((s) => `<li class="sb-sig-${s.state}" title="${esc(s.text)}">${icon(s.state === 'match' ? 'check' : s.state === 'partial' ? 'minus' : 'x')}${esc(s.l)}</li>`).join('')}</ul>`;
  }

  function stepper(labels, cur, o) {
    o = o || {};
    return `<ol class="sb-steps ${o.lost ? 'is-lost' : ''}" aria-label="${esc(o.label || 'Progress')}">${labels.map((l, i) => `<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}"><i aria-hidden="true">${i < cur ? icon('check') : ''}</i><span>${esc(l)}${o.dates && o.dates[i] ? `<em>${esc(o.dates[i])}</em>` : ''}</span></li>`).join('')}</ol>`;
  }

  function head(title, sub, right) {
    return `<header class="app-head sb-head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right ? `<div class="row sb-head-r">${right}</div>` : ''}</header>`;
  }

  RN.actions['sb-scroll'] = (el) => {
    const t = document.getElementById(el.dataset.target);
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = t.querySelector('input, textarea, select, button'); if (f && el.dataset.focus) setTimeout(() => f.focus({ preventScroll: true }), 400); }
  };
  RN.actions['sb-copy'] = (el) => {
    const ok = copyText(el.dataset.text || '');
    RN.ui.toast(ok ? esc(el.dataset.msg || 'Copied') : 'Copy did not work in this browser. Select the text and copy it.', { icon: ok ? 'copy' : 'info' });
  };

  /* ======================================================================
     INBOX: intro requests (blind until introduced) + project invites
     ====================================================================== */
  const WINDOW_H = 72;
  // Pass reasons come from the shared RN.fields.passReason. For intros the client gets a short, polite
  // sentence per reason (keyed on the stored slug); for projects only Revenue Nomad sees the reason.
  const PASS_CLIENT = {
    capacity: (f) => `${f} is at capacity right now.`,
    expertise: (f) => `${f} doesn’t think this is the best use of their expertise.`,
    timing: (f) => `The timing doesn’t work for ${f}.`,
    rate: (f) => `${f}’s rate and this scope are unlikely to line up.`,
    hours: (f) => `${f} can’t give this the hours it needs right now.`,
    industry: (f) => `${f} doesn’t have enough experience in your industry to do it justice.`,
    other: (f) => `${f} can’t take this one.`,
  };
  const passControl = (value) => (RN.fields.passReason
    ? RN.w.control('passReason', value || '', { name: 'reason' })
    : `<div class="chipset">${Object.keys(PASS_CLIENT).map((k) => `<button type="button" class="chip" aria-pressed="${value === k}" data-act="w-chip" data-name="reason" data-v="${k}">${esc(k)}</button>`).join('')}<input type="hidden" name="reason" value="${esc(value || '')}"></div>`);
  const passLabel = (v) => (RN.fields.passReason ? RN.w.label('passReason', v) : v);
  // Projects carry a 25% platform fee. RN.projects (projects.js) owns the money math; fallbacks keep Studio working alone.
  const PJ = () => RN.projects || null;
  const takeHome = (n) => (PJ() && PJ().payFor ? PJ().payFor(n) : Math.floor(n * 0.75));

  function introGroup(i) {
    if (i.status === 'pending') return 'reply';
    if (['interested', 'rn_qualified', 'introduced'].includes(i.status)) return 'progress';
    return 'closed';
  }
  function hoursLeft(i) { return (new Date(i.createdAt).getTime() + WINDOW_H * 36e5 - RN.now().getTime()) / 36e5; }

  function projStage(p, op) {
    if (PJ() && PJ().stage) {
      const k = (PJ().stage(p, op.id) || { k: 'invited' }).k;
      return { under_review: 'review', declined: 'passed' }[k] || k;
    }
    const r = (p.responses || []).find((x) => x.opId === op.id);
    const done = ['staffed', 'closed'].includes(p.status);
    if (p.selected === op.id) return 'selected';
    if (done && p.selected && p.selected !== op.id) return r && r.status === 'declined' ? 'passed' : 'not_selected';
    if (!r) return done ? 'closed' : 'invited';
    if (r.status === 'declined') return 'passed';
    if (r.viewedAt || r.shortlisted || r.decision || p.status === 'in_progress') return 'review';
    return 'responded';
  }
  const STAGE = {
    invited: { l: 'Invited', pill: 'pill-warn', g: 'reply' },
    responded: { l: 'Responded', pill: 'pill-info', g: 'progress' },
    review: { l: 'Under review', pill: 'pill-info', g: 'progress' },
    selected: { l: 'Selected', pill: 'pill-good', g: 'closed' },
    not_selected: { l: 'Not selected', pill: '', g: 'closed' },
    passed: { l: 'You passed', pill: '', g: 'closed' },
    closed: { l: 'Closed', pill: '', g: 'closed' },
  };
  const liveProject = (p) => p.status !== 'draft';
  const inviteTs = (p, op) => ((p.inviteMeta || {})[op.id] || {}).ts || p.postedAt || p.createdAt;
  const pFields = (p) => (PJ() && PJ().fields ? PJ().fields(p) : p.fields || {});
  const pBrief = (p) => (PJ() && PJ().brief ? PJ().brief(p) : p.fields || {});

  function inboxItems(op) {
    const intros = st().intros.filter((i) => i.opId === op.id).map((i) => ({ kind: 'intro', ts: i.createdAt, rec: i, group: introGroup(i) }));
    const projects = st().projects.filter((p) => (p.invited || []).includes(op.id) && liveProject(p)).map((p) => {
      const stage = projStage(p, op);
      return { kind: 'project', ts: inviteTs(p, op), rec: p, stage, group: (STAGE[stage] || STAGE.invited).g };
    });
    return intros.concat(projects).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }
  function inboxBadge(op) {
    return st().intros.filter((i) => i.opId === op.id && i.status === 'pending').length
      + st().projects.filter((p) => (p.invited || []).includes(op.id) && ['posted', 'in_progress'].includes(p.status) && projStage(p, op) === 'invited').length;
  }

  function renderInbox(op) {
    const items = inboxItems(op);
    const f = S.inboxFilter;
    const shown = items.filter((x) => f === 'all' || (f === 'intro' ? x.kind === 'intro' : x.kind === 'project'));
    const nIntro = items.filter((x) => x.kind === 'intro').length, nProj = items.length - nIntro;
    const groups = [
      { k: 'reply', l: 'Needs reply', empty: 'You’re all caught up. New intro requests and project invites land here first.' },
      { k: 'progress', l: 'In progress' },
      { k: 'closed', l: 'Closed' },
    ];
    const needs = items.filter((x) => x.group === 'reply').length;
    return `<div class="sb sb-inbox">
      ${head('Inbox', `Intro requests and project invites. Clients stay anonymous until Revenue Nomad introduces you. Reply within ${WINDOW_H} hours.`)}
      <div class="sb-toolbar">
        <div class="seg" role="group" aria-label="Show">
          ${[['all', 'All', items.length], ['intro', 'Intro requests', nIntro], ['project', 'Project invites', nProj]].map(([k, l, n]) => `<button type="button" aria-pressed="${f === k}" data-act="sb-inbox-filter" data-f="${k}">${l} <span class="sb-n">${n}</span></button>`).join('')}
        </div>
        <span class="small muted">${needs ? `<b class="sb-ink">${needs}</b> waiting on you` : 'Nothing waiting on you'}</span>
      </div>
      ${items.length ? groups.map((g) => {
        const list = shown.filter((x) => x.group === g.k);
        if (!list.length && g.k !== 'reply') return '';
        return `<section class="sb-group" aria-labelledby="sb-g-${g.k}">
          <h2 class="sb-group-h" id="sb-g-${g.k}">${esc(g.l)}<span class="sb-count">${list.length}</span></h2>
          ${list.length ? `<div class="stack" style="--gap:14px">${list.map((x) => (x.kind === 'intro' ? introCard(x.rec, op) : projectCard(x.rec, op, x.stage))).join('')}</div>` : `<p class="sb-caught">${icon('check-circle')}${esc(g.empty)}</p>`}
        </section>`;
      }).join('') : RN.ui.empty({ icon: 'inbox', title: 'No requests yet', body: 'When a client asks to meet you or invites you to a project, it lands here. Proof links and reviews help clients pick you first.', cta: `<div class="row" style="justify-content:center"><a class="btn btn-sm" href="#studio.credibility">Build credibility</a><a class="btn btn-line btn-sm" href="#studio.profile">Edit profile</a></div>` })}
    </div>`;
  }

  function introCard(i, op) {
    const sum = RN.intro.summary(i, true);
    const f = i.fields || {};
    const firm = (i.buyer && i.buyer.company) || {};
    const revealed = ['introduced', 'hired'].includes(i.status);
    const fit = RN.model.fit(op, { revenueRange: firm.revenueRange, employeeRange: firm.employeeRange, industries: firm.industry ? [firm.industry] : [], need: f.need, roleCategory: f.roleCategory || op.catKey });
    const left = hoursLeft(i);
    const pending = i.status === 'pending';
    const stepIdx = RN.intro.steps.indexOf(i.status);
    const stepDates = RN.intro.steps.map((s) => {
      if (s === 'pending') return RN.fmt.dateShort(i.createdAt);
      const t = (i.thread || []).find((x) => x.text === RN.w.label('introStatus', s));
      return t ? RN.fmt.dateShort(t.ts) : '';
    });
    let clock = '';
    if (pending) {
      const pct = RN.clamp(1 - left / WINDOW_H, 0, 1);
      clock = left > 0
        ? `<div class="sb-clock ${left < 24 ? 'is-late' : ''}">${icon('hourglass')}<span><b>${Math.ceil(left)} hours</b> left to reply</span><span class="meter" aria-hidden="true"><i style="width:${(pct * 100).toFixed(0)}%"></i></span></div>`
        : `<div class="sb-clock is-over">${icon('hourglass')}<span>The 72-hour window closed ${esc(RN.fmt.ago(new Date(new Date(i.createdAt).getTime() + WINDOW_H * 36e5)))}. You can still reply.</span></div>`;
    }
    const passOpen = S.passOpen[i.id];
    const declined = i.status === 'declined';
    const lastNote = declined ? ((i.thread || []).slice(-1)[0] || {}).text : '';
    return `<article class="card sb-item ${pending ? 'is-new' : ''}" id="sb-i-${esc(i.id)}">
      <div class="sb-item-top">
        <div class="row" style="--gap:8px"><span class="pill pill-line">${icon('handshake')}Intro request</span>${RN.intro.statusPill(i.status)}</div>
        <span class="tiny muted">Received ${esc(RN.fmt.ago(i.createdAt))}</span>
      </div>
      <h3 class="sb-item-h">${esc(sum.need || 'Fractional ' + op.role)}</h3>
      <p class="sb-who">${icon(revealed ? 'building' : 'eye-off')}<span>${segs(sum.who)}</span>${revealed ? '' : RN.ui.tip('Company and contact names stay hidden until Revenue Nomad introduces you. You see the scope, size and industry now (blind intro, L369).', 'Why the company is hidden')}</p>
      ${sum.scope ? `<p class="sb-scope">${icon('briefcase')}<span>${segs(sum.scope)}</span></p>` : ''}
      ${i.note ? `<blockquote class="sb-quote">${esc(i.note)}</blockquote>` : ''}
      <div class="sb-fitrow">${fitPill(fit, { you: true })}${fitSignals(fit)}</div>
      ${clock}
      ${!pending && !declined ? stepper(['Pending', 'Interested', 'RN Qualified', 'Introduced', 'Hired'], stepIdx, { dates: stepDates, label: 'Intro progress' }) : ''}
      ${revealed ? contactBlock(i) : ''}
      ${i.status === 'interested' ? `<p class="sb-next">${icon('info')}<span>Revenue Nomad is confirming fit with the client. You will see the company and contact once you are introduced.</span></p>` : ''}
      ${i.status === 'rn_qualified' ? `<p class="sb-next">${icon('check-circle')}<span>Fit confirmed. Expect an introduction email within one business day.</span></p>` : ''}
      ${declined ? `<p class="sb-next is-muted">${icon('x')}<span>You passed${i.declineReason ? ': ' + esc(i.declineReason) : ''}. ${lastNote && lastNote !== 'Declined' ? 'The client saw: “' + esc(lastNote) + '”' : ''}</span></p>` : ''}
      ${pending ? (passOpen ? passPanel(i, op) : `<div class="sb-actions">
          <button type="button" class="btn btn-sm" data-act="sb-intro-yes" data-id="${esc(i.id)}">${icon('check')}I’m interested</button>
          <button type="button" class="btn btn-line btn-sm" data-act="sb-intro-pass" data-id="${esc(i.id)}">Pass</button>
          <span class="tiny muted sb-actions-note">Interested shares your reply with Revenue Nomad, who confirm fit before the introduction.</span>
        </div>`) : ''}
    </article>`;
  }

  function contactBlock(i) {
    const b = i.buyer || {};
    const c = b.company || {};
    return `<div class="sb-contact">
      <span class="ava ava-sm" aria-hidden="true">${esc(initials(b.name))}</span>
      <div class="grow"><b>${esc(b.name)}</b><span>${esc([b.title, c.name].filter(Boolean).join(', '))}</span>
        <span class="tiny muted">${esc([RN.w.label('industry', c.industry), c.revenueRange && RN.w.label('companyRevenue', c.revenueRange) + ' revenue', c.employeeRange && RN.w.label('companyEmployees', c.employeeRange) + ' employees'].filter(Boolean).join(' · '))}</span></div>
      <div class="row" style="--gap:8px">
        <a class="btn btn-sm" href="mailto:${esc(b.email)}">${icon('mail')}Email ${esc(RN.fmt.first(b.name))}</a>
        <button type="button" class="btn btn-line btn-sm" data-act="sb-copy" data-text="${esc(b.email)}" data-msg="Email address copied">${icon('copy')}Copy email</button>
      </div>
      <p class="tiny muted sb-contact-note">${i.status === 'hired' ? 'Engagement started. When it wraps, Revenue Nomad asks the client for a CORE review, which verifies your fit tags.' : 'Revenue Nomad introduced you by email. Reply-all to book the first call.'}</p>
    </div>`;
  }

  function passPanel(i, op) {
    return `<form class="sb-pass" data-submit="sb-intro-pass-send" data-id="${esc(i.id)}">
      <div class="field"><span class="field-label">Why are you passing?</span>
        ${passControl('')}
        <p class="help">The client gets a short, polite note and two operators with the same fit.</p>
      </div>
      <div class="field"><label for="sb-pn-${esc(i.id)}">Note to the client <span class="opt">Optional</span></label>
        <textarea class="textarea" id="sb-pn-${esc(i.id)}" name="note" maxlength="300" style="min-height:72px" placeholder="A referral, or when you expect to have room."></textarea></div>
      <div class="sb-actions">
        <button type="submit" class="btn btn-sm">Send pass</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="sb-intro-pass" data-id="${esc(i.id)}">Cancel</button>
        <a class="act sb-actions-note" href="#studio.profile">At capacity? Update your availability</a>
      </div>
    </form>`;
  }

  RN.actions['sb-inbox-filter'] = (el) => { S.inboxFilter = el.dataset.f; RN.rerender(); };
  RN.actions['sb-intro-yes'] = (el) => {
    RN.intro.setStatus(el.dataset.id, 'interested');
    RN.ui.toast('Marked interested. Revenue Nomad confirms fit and introduces you, usually within one business day.');
    RN.shell.renderHeader();
    RN.rerender();
  };
  RN.actions['sb-intro-pass'] = (el) => { S.passOpen[el.dataset.id] = !S.passOpen[el.dataset.id]; RN.rerender(); };
  RN.submits['sb-intro-pass-send'] = (form, data) => {
    const op = RN.myOp();
    if (!data.reason) { RN.ui.toast('Pick a reason so we can send the client better matches.', { icon: 'info' }); return; }
    const msg = (PASS_CLIENT[data.reason] || PASS_CLIENT.other)(op.first) + (data.note ? ' ' + data.note.trim() : '');
    RN.intro.setStatus(form.dataset.id, 'declined', msg);
    RN.store.update((s) => { const x = s.intros.find((y) => y.id === form.dataset.id); if (x) { x.declineReason = passLabel(data.reason); x.passReason = data.reason; } }, 'intros');
    delete S.passOpen[form.dataset.id];
    RN.ui.toast(`Passed. The client gets two operators with the same fit.`, data.reason === 'capacity' ? { action: { label: 'Update availability', act: 'go', attrs: 'data-to="studio.profile"' }, ms: 5000 } : {});
    RN.shell.renderHeader();
    RN.rerender();
  };

  /* ---------- Project invites ---------- */
  function projectFirm(p) {
    if (PJ() && PJ().blind) return PJ().blind(p);
    const f = p.fields || {};
    const ind = (f.industries || [])[0];
    return `A ${ind ? RN.w.label('industries', ind) : 'client'} company${f.revenueRange ? ' · ' + RN.w.label('companyRevenue', f.revenueRange) + ' revenue' : ''}${f.employeeRange ? ' · ' + RN.w.label('companyEmployees', f.employeeRange) + ' employees' : ''}`;
  }
  function projectFacts(p) {
    const f = pFields(p);
    const rows = [
      f.roleCategory && [RN.fields.roleCategory.label, RN.w.label('roleCategory', f.roleCategory)],
      f.engagementType && [RN.fields.engagementType.label, RN.w.label('engagementType', f.engagementType)],
      f.hoursPerMonth && [RN.fields.hoursPerMonth.label + ' needed', RN.w.label('hoursPerMonth', f.hoursPerMonth)],
      f.term && [RN.fields.term.label, RN.w.label('term', f.term)],
      f.startBy && ['Start', RN.w.label('startBy', f.startBy)],
      (f.salesMotions || []).length && [RN.fields.salesMotions.label, RN.w.labels('salesMotions', f.salesMotions)],
    ].filter(Boolean);
    return `<dl class="sb-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }
  function payBlock(p) {
    const f = pFields(p);
    const tip = RN.ui.tip('Projects carry a 25% Revenue Nomad fee. The client’s budget is all-in; your take-home is what lands with you. You name your own rate in your response.', 'How take-home is calculated');
    if (f.engagementType === 'project' && f.projectBudget) {
      return `<div class="sb-pay"><div><span class="label">Client budget, all-in</span><b>${esc(RN.fmt.usd(f.projectBudget))}</b></div><div class="sb-pay-you"><span class="label">Your take-home ${tip}</span><b>${esc(RN.fmt.usd(takeHome(f.projectBudget)))}</b></div></div>`;
    }
    if (f.rateMax) {
      return `<div class="sb-pay"><div><span class="label">Client budget, all-in</span><b>Up to $${esc(f.rateMax)}/hr</b></div><div class="sb-pay-you"><span class="label">Your take-home ${tip}</span><b>Up to $${esc(takeHome(f.rateMax))}/hr</b></div></div>`;
    }
    return '';
  }

  function projectCard(p, op, stage) {
    const f = pFields(p);
    const r = (p.responses || []).find((x) => x.opId === op.id);
    const fit = RN.model.fit(op, pBrief(p));
    const meta = STAGE[stage] || STAGE.invited;
    const src = ((p.inviteMeta || {})[op.id] || {}).source;
    const open = S.respOpen[p.id];
    const live = ['posted', 'in_progress'].includes(p.status);
    const lost = stage === 'not_selected' || stage === 'passed' || stage === 'closed';
    const idx = { invited: 0, responded: 1, review: 2, selected: 3, not_selected: 3 }[stage];
    const tags = (f.tags || []).map((t) => { const mine = op.tags.find((x) => x.t.toLowerCase() === t.toLowerCase()); return RN.ui.ftag(mine ? mine : { t, tier: 'claimed' }); }).join('');
    return `<article class="card sb-item ${stage === 'invited' ? 'is-new' : ''}" id="sb-p-${esc(p.id)}">
      <div class="sb-item-top">
        <div class="row" style="--gap:8px"><span class="pill pill-line">${icon('briefcase')}Project invite</span><span class="pill ${meta.pill}">${esc(meta.l)}</span>${src === 'rn' ? `<span class="pill pill-gold">${icon('seal')}Suggested by Revenue Nomad</span>` : ''}</div>
        <span class="tiny muted">${src === 'rn' ? 'Suggested' : 'Invited'} ${esc(RN.fmt.ago(inviteTs(p, op)))}</span>
      </div>
      <h3 class="sb-item-h">${esc(p.title)}</h3>
      <p class="sb-who">${icon('eye-off')}<span>${segs(projectFirm(p))}</span>${RN.ui.tip('The company name is shared when the client requests an intro.', 'Why the company is hidden')}</p>
      ${p.brief ? `<p class="sb-brief">${esc(p.brief)}</p>` : ''}
      ${projectFacts(p)}
      ${payBlock(p)}
      ${tags ? `<div class="sb-tags"><span class="label">Focus areas</span><div class="opc-tags">${tags}</div></div>` : ''}
      <div class="sb-fitrow">${fitPill(fit, { you: true })}${fitSignals(fit)}</div>
      ${stage !== 'invited' && stage !== 'passed' && stage !== 'closed' ? stepper(['Invited', 'Responded', 'Under review', stage === 'not_selected' ? 'Not selected' : 'Selected'], idx, { lost: stage === 'not_selected', label: 'Project progress' }) : ''}
      ${r && !open ? `<div class="sb-sent">
          <span class="label">What you sent</span>
          <p>${r.status === 'declined' ? `You passed${r.reason ? ': ' + esc(passLabel(r.reason)) : ''}. Only Revenue Nomad sees your reason.` : `<b>Interested</b>${r.rate ? ` · $${esc(r.rate)}/hr take-home` : ''}${r.rate && PJ() && PJ().allIn ? ` · the client sees $${esc(PJ().allIn(r.rate))}/hr all-in` : ''} · ${esc(RN.fmt.dateShort(r.ts))}`}</p>
          ${r.note ? `<blockquote class="sb-quote">${esc(r.note)}</blockquote>` : ''}
        </div>` : ''}
      ${stage === 'responded' ? `<p class="sb-next">${icon('info')}<span>Your response is with the client. Most clients review responses within three business days.</span></p>` : ''}
      ${stage === 'review' ? `<p class="sb-next">${icon('check-circle')}<span>You are on the shortlist. You hear from us the moment the client wants a call.</span></p>` : ''}
      ${stage === 'selected' ? `<p class="sb-next">${icon('check-circle')}<span>You’re selected. Revenue Nomad sends the agreement for signature, then sets up kickoff.</span></p>` : ''}
      ${stage === 'not_selected' ? `<p class="sb-next is-muted">${icon('info')}<span>The client went another direction. Your response stays on file, and Revenue Nomad uses it to put you forward for similar roles.</span></p>` : ''}
      ${open ? respondForm(p, op, r) : live && ['invited', 'responded', 'passed'].includes(stage) ? `<div class="sb-actions">
          <button type="button" class="btn btn-sm ${r ? 'btn-line' : ''}" data-act="sb-proj-open" data-id="${esc(p.id)}">${stage === 'passed' ? 'Change your answer' : r ? 'Edit response' : 'Respond'}${r ? '' : icon('arrow')}</button>
          ${!r ? '<span class="tiny muted sb-actions-note">About two minutes. The client sees it once you send.</span>' : ''}
        </div>` : ''}
      ${lost && stage === 'closed' ? `<p class="sb-next is-muted">${icon('info')}<span>This project is no longer taking responses.</span></p>` : ''}
    </article>`;
  }

  function respondForm(p, op, r) {
    const f = pFields(p);
    const cap = f.engagementType !== 'project' && f.rateMax ? takeHome(f.rateMax) : null;
    const over = (v) => (cap ? (PJ() && PJ().overBudget ? PJ().overBudget(v, f.rateMax) > 0 : +v > cap) : false);
    const declined = r && r.status === 'declined';
    const rate = r && r.rate ? r.rate : op.rate || '';
    return `<form class="sb-respond" data-submit="sb-proj-send" data-id="${esc(p.id)}">
      <div class="seg" role="group" aria-label="Your answer">
        <button type="button" aria-pressed="${!declined}" data-act="sb-resp-mode" data-m="interested">I’m interested</button>
        <button type="button" aria-pressed="${declined}" data-act="sb-resp-mode" data-m="declined">Not for me</button>
      </div>
      <input type="hidden" name="mode" value="${declined ? 'declined' : 'interested'}">
      <div class="stack" style="--gap:16px" data-mode-pane="interested" ${declined ? 'hidden' : ''}>
        <div data-input="sb-rate-chk" data-cap="${cap || ''}">${RN.w.field('rate', rate, { name: 'rate', id: 'sb-rate-' + p.id, label: 'Your hourly rate for this project', help: cap ? `What you want per hour, take-home. This project pays up to $${cap}/hr after the 25% fee.` : 'What you want per hour, take-home.' })}</div>
        ${cap ? `<p class="sb-warn" data-rate-warn ${over(rate) ? '' : 'hidden'}>${icon('info')}<span><span data-rate-txt>$${esc(rate)} is more than this project pays ($${cap}/hr)</span>, so the client sees you as over budget. <button type="button" class="act" data-act="sb-rate-use" data-v="${cap}" data-for="sb-rate-${esc(p.id)}">Use $${cap}</button></span></p>` : ''}
        <div class="field"><label for="sb-rn-${esc(p.id)}">Note to the client <span class="opt">Optional</span></label>
          <textarea class="textarea" id="sb-rn-${esc(p.id)}" name="note" maxlength="600" style="min-height:90px" placeholder="Where you have done this before, and what your first 30 days would cover.">${esc(r && !declined ? r.note || '' : '')}</textarea></div>
      </div>
      <div class="stack" style="--gap:14px" data-mode-pane="declined" ${declined ? '' : 'hidden'}>
        <div class="field"><span class="field-label">What made it a pass?</span>
          ${passControl(declined ? r.reason : '')}
          <p class="help">Only Revenue Nomad sees this. It tunes which projects we send you.</p>
        </div>
        <div class="field"><label for="sb-rd-${esc(p.id)}">Anything else <span class="opt">Optional</span></label>
          <textarea class="textarea" id="sb-rd-${esc(p.id)}" name="passNote" maxlength="300" style="min-height:64px">${esc(declined ? r.note || '' : '')}</textarea></div>
      </div>
      <div class="sb-actions">
        <button type="submit" class="btn btn-sm">${r ? 'Update response' : 'Send response'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="sb-proj-open" data-id="${esc(p.id)}">Cancel</button>
      </div>
    </form>`;
  }

  RN.actions['sb-proj-open'] = (el) => { S.respOpen[el.dataset.id] = !S.respOpen[el.dataset.id]; RN.rerender(); };
  RN.actions['sb-resp-mode'] = (el) => {
    const form = el.closest('form');
    const m = el.dataset.m;
    form.querySelector('input[name=mode]').value = m;
    RN.$$('[data-act="sb-resp-mode"]', form).forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
    RN.$$('[data-mode-pane]', form).forEach((pn) => { pn.hidden = pn.dataset.modePane !== m; });
  };
  RN.actions['sb-rate-use'] = (el) => {
    const input = document.getElementById(el.dataset.for);
    if (input) input.value = el.dataset.v;
    const warn = el.closest('[data-rate-warn]'); if (warn) warn.hidden = true;
  };
  RN.inputs['sb-rate-chk'] = (el, ev) => {
    const cap = +el.dataset.cap; const form = el.closest('form');
    const warn = form && form.querySelector('[data-rate-warn]');
    if (!cap || !warn) return;
    const v = +ev.target.value;
    const p = st().projects.find((x) => x.id === form.dataset.id);
    const max = p ? pFields(p).rateMax : null;
    warn.hidden = !(PJ() && PJ().overBudget && max ? PJ().overBudget(v, max) > 0 : v > cap);
    warn.querySelector('[data-rate-txt]').textContent = `$${v} is more than this project pays ($${cap}/hr)`;
  };
  RN.submits['sb-proj-send'] = (form, data) => {
    const op = RN.myOp();
    const id = form.dataset.id;
    const p = st().projects.find((x) => x.id === id);
    if (!p) return;
    const declined = data.mode === 'declined';
    if (declined && !data.reason) { RN.ui.toast('Pick a reason so we can send better matches.', { icon: 'info' }); return; }
    if (!declined && !(+data.rate > 0)) { RN.ui.toast('Add your hourly rate for this project.', { icon: 'info' }); return; }
    const had = (p.responses || []).some((x) => x.opId === op.id);
    const note = (declined ? data.passNote : data.note || '').trim();
    if (PJ() && PJ().respond) {
      // One shared write path: records the response and emails the client once (projects.js)
      PJ().respond(id, op.id, { status: declined ? 'declined' : 'interested', note, rate: declined ? null : +data.rate, hours: op.avail.hoursCode });
    } else {
      RN.store.update((s) => {
        const pr = s.projects.find((x) => x.id === id);
        pr.responses = (pr.responses || []).filter((x) => x.opId !== op.id).concat({ opId: op.id, status: declined ? 'declined' : 'interested', note, rate: declined ? null : +data.rate, ts: RN.now().toISOString() });
      }, 'projects');
      if (!had && !declined) RN.mail(RN.personas.buyer.email, `${op.name} responded to ${p.title}`, `${op.name} is interested. Rate: $${+data.rate}/hr.`, 'response');
    }
    // The pass reason is private to Revenue Nomad; RN.projects.respond does not store it yet
    RN.store.update((s) => { const pr = s.projects.find((x) => x.id === id); const x = pr && (pr.responses || []).find((y) => y.opId === op.id); if (x) { if (declined) x.reason = data.reason; else delete x.reason; } }, 'projects');
    delete S.respOpen[id];
    RN.ui.toast(declined ? 'Passed. Only Revenue Nomad sees your reason.' : had ? 'Response updated. The client sees the new version.' : 'Response sent. The client can request an intro from here.');
    RN.shell.renderHeader();
    RN.rerender();
  };

  /* ======================================================================
     CREDIBILITY: Reputation Index, tiers, reviews, verified tags, proof links, badge
     ====================================================================== */
  // What each tier unlocks. Nothing on the ladder is paid: tiers move only with client evidence.
  const UNLOCKS = RN.fields.risUnlocks; // one source, shared with For operators and Levels
  const tierRank = (v) => ['indexing', 'vetted', 'proven', 'trusted', 'elite', 'apex'].indexOf(v);
  const badgeUnlocked = (op) => tierRank(RN.fields.risTierFor(op.ris.score).v) >= tierRank('proven');

  function monthsSince(ymStr) {
    if (!ymStr) return null;
    const [y, m] = String(ymStr).split('-').map(Number);
    const n = RN.now();
    return Math.max(0, (n.getFullYear() * 12 + n.getMonth()) - (y * 12 + (m - 1)));
  }
  function factorRows(op) {
    const G = RN.model.risGain;
    const tags = op.tags || [];
    const verified = tags.filter((t) => t.tier !== 'claimed').length;
    const claimed = tags.length - verified;
    const nRev = op.reviews.length;
    const avg = op.core && op.core.overall ? op.core.overall : nRev ? op.reviews.reduce((a, r) => a + (r.overall || r.coreAvg || 0), 0) / nRev : 0;
    const lastEnd = (op.engagements || []).reduce((m, e) => { const end = e.end || null; if (!end) return 0; const k = monthsSince(end); return m == null ? k : Math.min(m, k); }, null);
    const val = {
      volume: { p: Math.min(1, nRev / 5), txt: `${nRev} client ${nRev === 1 ? 'review' : 'reviews'}`, pts: Math.max(0, 5 - nRev) * G('review'), act: nRev < 5 ? `<button type="button" class="act" data-act="sb-rr-open">Request a review${icon('arrow')}</button>` : '' },
      verification: { p: tags.length ? verified / tags.length : 0, txt: `${verified} of ${tags.length} fit tags verified`, pts: Math.min(8, claimed) * G('verifiedTag'), act: claimed ? `<button type="button" class="act" data-act="sb-rr-open" data-verify="1">Ask a client to verify tags${icon('arrow')}</button>` : '' },
      ratings: { p: avg / 5, txt: nRev ? `${avg.toFixed(1)} average across ${nRev} ${nRev === 1 ? 'review' : 'reviews'}` : 'No ratings yet', pts: nRev && avg >= 4.5 ? 0 : 2, act: '' },
      complete: { p: op.completeness / 100, txt: `Profile ${op.completeness}% complete`, pts: op.completeness < 100 ? G('complete') : 0, act: op.completeness < 100 ? `<a class="act" href="#studio.profile">Finish your profile${icon('arrow')}</a>` : '' },
      recency: { p: lastEnd == null ? 0 : RN.clamp(1 - lastEnd / 24, 0, 1), txt: lastEnd == null ? 'No engagement logged' : lastEnd === 0 ? 'Engagement active this month' : `Last engagement ended ${lastEnd} ${lastEnd === 1 ? 'month' : 'months'} ago`, pts: lastEnd == null || lastEnd > 0 ? G('engagement') : 0, act: lastEnd == null || lastEnd > 0 ? `<button type="button" class="act" data-act="sb-rr-open">Confirm a recent engagement${icon('arrow')}</button>` : '' },
    };
    return RN.fields.risFactors.options.map((f) => Object.assign({ f }, val[f.v]));
  }

  function renderCredibility(op) {
    const tier = RN.fields.risTierFor(op.ris.score);
    const tiers = RN.fields.risTier.options;
    const next = tiers.filter((t) => t.min > op.ris.score).sort((a, b) => a.min - b.min)[0];
    const rows = factorRows(op);
    const avail = rows.reduce((a, r) => a + r.pts, 0);
    const gap = next ? next.min - op.ris.score : 0;
    const reviewsToNext = next ? Math.ceil(gap / RN.model.risGain('review')) : 0;
    return `<div class="sb sb-cred">
      ${head('Credibility', 'Proof you can use in any deal, including the ones you find yourself. There is no fee on deals you source with a proof link.')}
      <nav class="sb-jump" aria-label="On this page">
        ${[['sb-c-ri', 'Reputation Index'], ['sb-c-rev', 'Reviews'], ['sb-c-tags', 'Verified tags'], ['sb-c-proof', 'Proof links'], ['sb-c-badge', 'Badge']].map(([id, l]) => `<button type="button" class="chip chip-sm" data-act="sb-scroll" data-target="${id}">${esc(l)}</button>`).join('')}
      </nav>

      <section class="card sb-ri" id="sb-c-ri" aria-labelledby="sb-ri-h">
        <div class="sb-ri-top">
          <div class="sb-ri-score">
            <div class="sb-ring">${RN.chart.ring(op.ris.score, { size: 116, stroke: 9, label: `Reputation Index ${op.ris.score} of 100` })}<b class="num">${esc(op.ris.score)}</b></div>
            <div>
              <span class="eyebrow">Reputation Index</span>
              <h2 class="h3" id="sb-ri-h" style="margin-top:6px">${esc(tier.l)} <span class="muted" style="font-weight:500">· ${tier.min}–${tier.max}</span></h2>
              <p class="small muted" style="margin-top:6px;max-width:54ch">${esc(tier.d)}</p>
              ${next ? `<p class="sb-next-tier">${icon('trend-up')}<span><b>${gap} points to ${esc(next.l)}.</b> About ${reviewsToNext} more client ${reviewsToNext === 1 ? 'review' : 'reviews'} would get you there (estimated).</span></p>` : '<p class="sb-next-tier">You are at the top of the ladder.</p>'}
            </div>
          </div>
          <div class="sb-ri-avail"><span class="stat-v">+${avail}</span><span class="stat-l">estimated points available ${RN.ui.tip('Estimates from the published factor weights. Only client evidence moves the score: reviews, verified tags and recent engagements. Nothing here can be bought.', 'About these estimates')}</span></div>
        </div>
        <div class="sb-factors">
          ${rows.map((r) => `<div class="sb-factor">
            <div class="sb-factor-l"><b>${esc(r.f.l)}</b><span class="tiny muted">${Math.round(r.f.w * 100)}% of the score</span></div>
            <div class="sb-factor-m"><span class="meter" role="img" aria-label="${esc(r.f.l)} ${Math.round(r.p * 100)}%"><i style="width:${Math.round(r.p * 100)}%"></i></span><span class="small">${esc(r.txt)}</span></div>
            <div class="sb-factor-r">${r.pts ? `<span class="pill pill-accent">+${r.pts} pts</span>` : `<span class="pill pill-good">${icon('check')}Strong</span>`}${r.act}</div>
          </div>`).join('')}
        </div>
        <p class="tiny muted">${esc(RN.fields.risFactors.label)}: ${RN.fields.risFactors.options.map((f) => esc(f.l.toLowerCase())).join(', ')}. Every approved profile starts at 50. Points are estimates for planning.</p>
      </section>

      <section class="card sb-ladder" aria-labelledby="sb-lad-h">
        <div class="card-hd"><div><h3 id="sb-lad-h">Tiers and what each one unlocks</h3><p class="sub">Tiers come only from client evidence. Nothing on this ladder can be bought.</p></div><a class="act" href="#levels">How levels work${icon('arrow')}</a></div>
        <ol class="sb-tiers">
          ${tiers.map((t) => {
            const here = t.v === tier.v;
            const got = tierRank(t.v) <= tierRank(tier.v);
            return `<li class="${here ? 'is-here' : got ? 'is-got' : ''}">
              <span class="sb-seal t-${t.v}">${RN.ui.hexSeal(t.l)}<b>${t.v === 'indexing' ? '' : t.min}</b></span>
              <div class="sb-tier-b">
                <div class="row" style="--gap:8px"><b class="sb-tier-n">${esc(t.l)}</b><span class="tiny muted tnum">${t.min}–${t.max}</span>${here ? '<span class="pill pill-accent">You are here</span>' : t.v === 'indexing' ? '<span class="pill">Before approval</span>' : got ? `<span class="pill pill-good">${icon('check')}Included</span>` : `<span class="pill">${icon('lock')}${t.min - op.ris.score} pts away</span>`}</div>
                <ul>${(UNLOCKS[t.v] || []).map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
              </div>
            </li>`;
          }).join('')}
        </ol>
      </section>

      ${reviewsSection(op)}
      ${tagsSection(op)}
      ${proofSection(op)}
      ${badgeSection(op)}
    </div>`;
  }

  function reviewsSection(op) {
    const reqs = st().reviewRequests.filter((r) => r.opId === op.id).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    const nRev = op.reviews.length;
    const sent = reqs.filter((r) => r.status !== 'completed').length;
    let prompt = '';
    if (nRev === 0) prompt = `<b>Request your first 3 reviews.</b> Operators with 3 or more verified reviews are rehired 2.4x as often.`;
    else if (nRev < 3) prompt = `<b>You have ${nRev} client ${nRev === 1 ? 'review' : 'reviews'}. ${3 - nRev} more ${3 - nRev === 1 ? 'gets' : 'get'} you to 3</b>, where operators are rehired 2.4x as often.${sent ? ` ${sent} ${sent === 1 ? 'request is' : 'requests are'} out now.` : ''}`;
    const pill = (s) => `<span class="pill ${s === 'completed' ? 'pill-good' : 'pill-warn'}">${s === 'completed' ? icon('check') : icon('send')}${esc(RN.w.label('reviewStatus', s === 'completed' ? 'completed' : 'sent'))}</span>`;
    return `<section class="card" id="sb-c-rev" aria-labelledby="sb-rev-h">
      <div class="card-hd"><div><h3 id="sb-rev-h">Client reviews</h3><p class="sub">${reqs.length} ${reqs.length === 1 ? 'review' : 'reviews'} requested · ${reqs.filter((r) => r.status === 'completed').length} completed · ${nRev} published on your profile</p></div>
        <button type="button" class="btn btn-sm" data-act="sb-rr-open">${icon('plus')}Request a review</button></div>
      ${prompt ? `<div class="note info sb-prompt">${icon('star')}<div>${prompt}</div></div>` : ''}
      ${reqs.length ? `<ul class="sb-reqs">${reqs.map((r) => `<li>
          <span class="ava ava-sm" aria-hidden="true">${esc(initials(r.reviewer.name))}</span>
          <div class="grow"><b>${esc(r.reviewer.name)}</b><span class="small muted">${esc([r.reviewer.title, r.reviewer.company].filter(Boolean).join(', '))}${r.engagement && r.engagement !== r.reviewer.company ? ' · ' + esc(r.engagement) : ''}</span></div>
          <div class="sb-req-r">${pill(r.status)}<span class="tiny muted">${r.status === 'completed' ? 'Completed ' + esc(RN.fmt.dateShort(r.completedAt || r.sentAt)) : 'Sent ' + esc(RN.fmt.ago(r.sentAt))}</span>
            ${r.status === 'completed' ? `<a class="act" href="#op.${esc(op.slug)}">See on profile</a>` : `<span class="row" style="--gap:12px"><button type="button" class="act" data-act="sb-rr-remind" data-id="${esc(r.id)}">Send reminder</button><a class="act muted" href="#review.${esc(r.id)}" title="Open the page the client sees">Client’s view</a></span>`}
          </div>
        </li>`).join('')}</ul>` : ''}
      <p class="tiny muted" style="margin-top:14px">You see two states: Sent and Completed. Reviews publish as soon as the client submits. Ask every client when an engagement wraps, not only the happiest ones.</p>
    </section>`;
  }

  const vtag = (t) => `<li><span class="ftag">${icon('check-circle')}${esc(t.t)}</span><span class="sb-vt-m"><span class="meter" aria-hidden="true"><i style="width:${t.score}%"></i></span><span class="tiny muted tnum">${t.r} ${t.r === 1 ? 'review' : 'reviews'} · ${t.tier === 'expert' ? 'Expert' : 'Verified'}</span></span></li>`;
  function tagsSection(op) {
    const verified = op.tags.filter((t) => t.tier !== 'claimed').sort((a, b) => b.r - a.r || a.t.localeCompare(b.t));
    const claimed = op.tags.filter((t) => t.tier === 'claimed');
    const key = RN.ui.tip('<b>How tags verify</b><br>A tag turns Verified the first time a client review confirms it (score 50). Each later review rated 4.0 or higher adds to it: 60, 70, 80, then +3 each. Five or more reviews make it Expert.', 'How tags verify');
    return `<section class="card" id="sb-c-tags" aria-labelledby="sb-tags-h">
      <div class="card-hd"><div><h3 id="sb-tags-h" class="row-nw" style="--gap:6px">Verified fit tags ${key}</h3><p class="sub">${verified.length} of ${op.tags.length} verified by client reviews. Verified tags rank first on your card and in search.</p></div></div>
      ${verified.length ? `<ul class="sb-vtags">${verified.slice(0, 9).map(vtag).join('')}</ul>${verified.length > 9 ? `<details class="sb-more-tags"><summary>${icon('chev-down')}Show ${verified.length - 9} more verified tags</summary><ul class="sb-vtags">${verified.slice(9).map(vtag).join('')}</ul></details>` : ''}` : RN.ui.empty({ icon: 'seal', title: 'No verified tags yet', body: 'Your first client review verifies the tags that client confirms.' })}
      ${claimed.length ? `<div class="sb-claimed">
        <div class="row between"><span class="label">Claimed, waiting for a client (${claimed.length})</span><button type="button" class="act" data-act="sb-rr-open" data-verify="1">Ask a client to verify${icon('arrow')}</button></div>
        <div class="opc-tags">${claimed.map((t) => RN.ui.ftag(t)).join('')}</div></div>` : ''}
    </section>`;
  }

  const SECTIONS = [
    { v: 'reviews', l: 'Client reviews' }, { v: 'core', l: 'CORE scores' }, { v: 'engagements', l: 'Engagement History' },
    { v: 'samples', l: 'Portfolio' }, { v: 'rate', l: 'Rate' },
  ];
  const secLabel = (v) => (SECTIONS.find((s) => s.v === v) || { l: v }).l;
  const proofUrl = (id) => pageUrl() + '#proof.' + id;

  function proofSection(op) {
    const links = st().proofLinks.filter((p) => p.opId === op.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const unlocked = badgeUnlocked(op);
    return `<section class="card" id="sb-c-proof" aria-labelledby="sb-proof-h">
      <div class="card-hd"><div><h3 id="sb-proof-h">Proof links</h3><p class="sub">A private page for one prospect with the proof you choose. You see who read what; they see a notice that you can.</p></div>
        ${unlocked ? `<button type="button" class="btn btn-sm" data-act="sb-proof-new">${icon('link')}Create proof link</button>` : `<span class="pill">${icon('lock')}Unlocks at Proven</span>`}</div>
      ${links.length ? `<div class="stack" style="--gap:14px">${links.map((l) => proofCard(l)).join('')}</div>` : RN.ui.empty({ icon: 'link', title: 'No proof links yet', body: unlocked ? 'Send one with your next proposal. You will see when it is opened, which sections were read and whether it was forwarded.' : 'Proof links unlock at Proven (60). Your first client reviews are the fastest way there.', cta: unlocked ? '<button type="button" class="btn btn-sm" data-act="sb-proof-new">Create proof link</button>' : '<button type="button" class="btn btn-sm" data-act="sb-rr-open">Request a review</button>' })}
    </section>`;
  }
  function proofCard(l) {
    const views = (l.views || []).slice().sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const total = views.reduce((a, v) => a + (v.seconds || 0), 0);
    const fwd = views.some((v) => v.forwarded);
    const secs2 = (l.sections || []).map((s) => ({ s, n: views.filter((v) => (v.sections || []).includes(s)).length }));
    return `<article class="sb-proof">
      <div class="sb-proof-top">
        <div class="grow"><b class="sb-proof-co">${esc(l.prospect.company)}</b><span class="small muted">${esc(l.prospect.contact || 'No contact named')} · created ${esc(RN.fmt.dateShort(l.createdAt))}</span></div>
        <div class="row" style="--gap:8px">
          <button type="button" class="btn btn-line btn-sm" data-act="sb-copy" data-text="${esc(proofUrl(l.id))}" data-msg="Proof link copied">${icon('copy')}Copy link</button>
          <a class="btn btn-ghost btn-sm" href="#proof.${esc(l.id)}">${icon('external')}Open</a>
        </div>
      </div>
      <div class="sb-proof-stats">
        <div><span class="stat-v">${views.length}</span><span class="stat-l">${views.length === 1 ? 'Open' : 'Opens'}</span></div>
        <div><span class="stat-v">${esc(secs(total))}</span><span class="stat-l">Time reading</span></div>
        <div><span class="stat-v">${views.length ? esc(RN.fmt.ago(views[0].ts)) : 'Not yet'}</span><span class="stat-l">Last opened</span></div>
        <div><span class="stat-v">${fwd ? 'Yes' : 'No'}</span><span class="stat-l">Forwarded</span></div>
      </div>
      ${views.length ? `<div class="sb-proof-secs"><span class="label">Sections read</span>
        ${secs2.map((x) => `<div class="sb-sec"><span class="small">${esc(secLabel(x.s))}</span><span class="meter" aria-hidden="true"><i style="width:${Math.round((x.n / views.length) * 100)}%"></i></span><span class="tiny muted tnum">${x.n} of ${views.length}</span></div>`).join('')}
      </div>
      <details class="sb-views"><summary>${icon('chev-down')}Every visit (${views.length})</summary>
        <ul>${views.map((v) => `<li><span class="tnum">${esc(RN.fmt.dateShort(v.ts))}, ${esc(new Date(v.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</span><span class="tnum">${esc(secs(v.seconds || 0))}</span><span class="grow small muted">${esc((v.sections || []).map(secLabel).join(', ') || 'Opened, nothing read')}</span>${v.forwarded ? `<span class="pill pill-info">${icon('share')}Forwarded</span>` : ''}</li>`).join('')}</ul>
      </details>` : `<p class="small muted">${icon('clock')} Not opened yet. Sections included: ${esc((l.sections || []).map(secLabel).join(', '))}.</p>`}
    </article>`;
  }

  function badgeSnippet(op, fmt) {
    const base = 'https://www.revenuenomad.com';
    const alt = `${op.name}, ${op.ris.label}, Reputation Index ${op.ris.score}, verified on Revenue Nomad, ${RN.fmt.monthYear(RN.now())}`;
    return fmt === 'email'
      ? `<a href="${base}/verify/${op.slug}"><img src="${base}/badge/${op.slug}.png?style=signature" width="180" height="40" alt="${alt}"></a>`
      : `<a href="${base}/verify/${op.slug}" title="Verify ${op.name} on Revenue Nomad">\n  <img src="${base}/badge/${op.slug}.svg" width="240" height="72"\n       alt="${alt}">\n</a>`;
  }
  function badgeSection(op) {
    const unlocked = badgeUnlocked(op);
    const code = badgeSnippet(op, S.badgeFmt);
    return `<section class="card" id="sb-c-badge" aria-labelledby="sb-badge-h">
      <div class="card-hd"><div><h3 id="sb-badge-h">Embeddable verified badge</h3><p class="sub">For your website, proposals and email signature. It links to a dated verification page and updates itself if your tier changes.</p></div></div>
      <div class="sb-badge-wrap ${unlocked ? '' : 'is-locked'}">
        <div class="sb-badge-stage">
          <a class="sb-badge ${S.badgeFmt === 'email' ? 'is-sig' : ''}" href="#op.${esc(op.slug)}" title="Opens the verification page">
            <span class="sb-seal t-${esc(RN.fields.risTierFor(op.ris.score).v)}">${RN.ui.hexSeal(op.ris.label)}<b>${esc(op.ris.score)}</b></span>
            <span class="sb-badge-t"><b>${esc(op.ris.label)} · Reputation Index</b><span>Verified on Revenue Nomad</span><em>${esc(op.name)} · ${esc(RN.fmt.monthYear(RN.now()))}</em></span>
          </a>
        </div>
        <div class="sb-badge-code">
          <div class="row between"><div class="seg" role="group" aria-label="Format">${[['web', 'Website'], ['email', 'Email signature']].map(([k, l]) => `<button type="button" aria-pressed="${S.badgeFmt === k}" data-act="sb-badge-fmt" data-f="${k}">${l}</button>`).join('')}</div>
            <button type="button" class="btn btn-line btn-sm" data-act="sb-badge-copy" ${unlocked ? '' : 'disabled'}>${icon('code')}Copy code</button></div>
          <pre class="mono sb-code"><code>${esc(code)}</code></pre>
          <p class="tiny muted">The badge is rendered live, so a copied image can’t outlive your tier. A removed badge shows “No longer current”.</p>
        </div>
        ${unlocked ? '' : `<p class="sb-locked">${icon('lock')}The badge unlocks at Proven (60). Client reviews are the fastest way there.</p>`}
      </div>
    </section>`;
  }
  RN.actions['sb-badge-fmt'] = (el) => { S.badgeFmt = el.dataset.f; RN.rerender(); };
  RN.actions['sb-badge-copy'] = () => {
    const op = RN.myOp();
    const ok = copyText(badgeSnippet(op, S.badgeFmt));
    RN.ui.toast(ok ? 'Badge code copied. Paste it into your site or signature.' : 'Copy did not work in this browser. Select the code and copy it.', { icon: ok ? 'code' : 'info' });
  };

  RN.actions['sb-rr-remind'] = (el) => {
    const op = RN.myOp();
    const r = st().reviewRequests.find((x) => x.id === el.dataset.id);
    if (!r) return;
    RN.mail(r.reviewer.email, `Reminder: working with ${op.name}`, `Hi ${RN.fmt.first(r.reviewer.name)},\n\nA quick reminder from ${op.name}. The review takes about 4 minutes.\n\nStart the review: ${pageUrl()}#review.${r.id}`, 'review');
    RN.ui.toast(`Reminder sent to ${esc(r.reviewer.name)}`, { icon: 'mail' });
  };

  /* ---------- Request a review: 3 steps (Engagement → Reviewer and focus areas → Preview) ---------- */
  const RR_STEPS = ['Engagement', 'Reviewer and focus areas', 'Preview'];
  function openReviewRequest(o) {
    o = o || {};
    const op = RN.myOp();
    const engs = op.engagements || [];
    const e0 = engs[0];
    const claimed = op.tags.filter((t) => t.tier === 'claimed').sort((a, b) => (b.c === op.catKey) - (a.c === op.catKey)).map((t) => t.t);
    const pre = o.verify ? claimed.slice(0, 6) : claimed.slice(0, 4);
    const ongoing0 = e0 && !e0.end;
    const body = `<form id="sb-rr-form" class="sb-rr" data-submit="sb-rr-send" data-step="1" novalidate>
      <div class="sb-rr-prog">${stepper(RR_STEPS, 0, { label: 'Steps' })}</div>
      <section data-step-pane="1" class="stack" style="--gap:20px">
        <div class="field"><span class="field-label">Which engagement?</span>
          <div class="optcards sb-engpick" role="group" aria-label="Engagement">
            ${engs.map((e, i) => `<button type="button" class="optcard" aria-pressed="${i === 0}" data-act="w-chip" data-name="eng" data-v="${i}"><b>${esc(e.company)}</b><span>${esc(e.role)} · ${esc(ym(e.start))} to ${e.end ? esc(ym(e.end)) : 'now'}</span></button>`).join('')}
            <button type="button" class="optcard" aria-pressed="${!engs.length}" data-act="w-chip" data-name="eng" data-v="new"><b>Another engagement</b><span>A client not in your Engagement History yet.</span></button>
            <input type="hidden" name="eng" value="${engs.length ? 0 : 'new'}" data-change="sb-rr-eng">
          </div>
        </div>
        <div class="grid g-2" style="--gap:16px">
          <div class="field"><label for="sb-rr-co">Client company</label><input class="input" id="sb-rr-co" name="company" value="${esc(e0 ? e0.company : '')}" placeholder="Company name" required></div>
          ${RN.w.field('engagementType', 'fractional', { name: 'engagementType', compact: true })}
        </div>
        <div class="grid g-2" style="--gap:16px">
          <div class="field"><label for="sb-rr-start">Start</label><input class="input" type="month" id="sb-rr-start" name="start" value="${esc(e0 ? e0.start : '')}"></div>
          <div class="field"><label for="sb-rr-end">End</label><input class="input" type="month" id="sb-rr-end" name="end" value="${esc(e0 && e0.end ? e0.end : '')}" ${ongoing0 ? 'disabled' : ''}>
            <label class="sb-check"><input type="checkbox" name="ongoing" value="1" data-change="sb-rr-ongoing" ${ongoing0 ? 'checked' : ''}><span>Engagement is ongoing</span></label></div>
        </div>
        <div class="field"><span class="field-label">Outcomes you claim <span class="opt">1 to 3</span></span>
          <p class="help" style="margin-top:-2px">The client rates each one: ${esc(RN.w.labels('outcomeRating', RN.fields.outcomeRating.options.map((x) => x.v)))}.</p>
          <div class="stack" style="--gap:8px">
            ${[1, 2, 3].map((n) => `<input class="input" name="o${n}" maxlength="140" aria-label="Outcome ${n}${n === 1 ? ' (required)' : ''}" placeholder="${esc(['Outcome 1 (required): e.g. Cut new AE ramp from 6 to 4 months', 'Outcome 2: e.g. Forecast within 10% for two quarters', 'Outcome 3'][n - 1])}">`).join('')}
          </div>
        </div>
      </section>
      <section data-step-pane="2" class="stack" style="--gap:20px" hidden>
        <div class="grid g-2" style="--gap:16px">
          ${RN.w.field('fullName', '', { name: 'rname', id: 'sb-rr-name', label: 'Reviewer name', help: 'Shown on the published review, so it never reads “Client”.' })}
          ${RN.w.field('email', '', { name: 'remail', id: 'sb-rr-email', label: 'Reviewer work email', help: '' })}
          <div class="field"><label for="sb-rr-title">Their title</label><input class="input" id="sb-rr-title" name="rtitle" placeholder="e.g. CEO"></div>
          <div class="field"><label for="sb-rr-rco">Their company</label><input class="input" id="sb-rr-rco" name="rcompany" value="${esc(e0 ? e0.company : '')}"></div>
        </div>
        ${RN.w.field('fitTags', pre, { name: 'tags', id: 'sb-rr-tags', max: 10, cat: op.catKey, label: 'Focus areas to verify', help: 'Pick what you delivered for this client. Each one they confirm in a review rated 4.0 or higher turns Verified.' })}
        ${RN.w.field('techStack', op.crm && RN.w.opt('techStack', op.crm) ? [op.crm] : [], { name: 'tech', id: 'sb-rr-tech', label: 'Tech stack used on this engagement', compact: true })}
      </section>
      <section data-step-pane="3" hidden><div data-rr-preview></div></section>
    </form>`;
    RN.ui.modal({
      width: 700,
      title: 'Request a review',
      sub: `Ask a past client to confirm your work. It takes them about 4 minutes.`,
      body,
      foot: `<span class="small muted grow" data-rr-label>Step 1 of 3 · ${RR_STEPS[0]}</span>
        <button type="button" class="btn btn-line" data-act="sb-rr-back" hidden>Back</button>
        <button type="button" class="btn" data-act="sb-rr-next">Next${icon('arrow')}</button>
        <button type="submit" class="btn" form="sb-rr-form" data-rr-send hidden>${icon('send')}Send request</button>`,
    });
  }
  function rrData(form) {
    const d = RN.ui.formData(form);
    d.ongoing = [].concat(d.ongoing || []).includes('1');
    d.outcomes = [d.o1, d.o2, d.o3].map((x) => (x || '').trim()).filter(Boolean);
    return d;
  }
  function rrValidate(form, step) {
    const d = rrData(form);
    if (step === 1) {
      if (!d.company.trim()) return 'Add the client company.';
      if (!d.outcomes.length) return 'Add at least one outcome you delivered.';
    }
    if (step === 2) {
      if (!d.rname.trim()) return 'Add the reviewer’s name. It appears on the published review.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.remail.trim())) return 'Add the reviewer’s work email.';
    }
    return '';
  }
  function rrGo(form, step) {
    const modal = form.closest('.modal');
    form.dataset.step = step;
    RN.$$('[data-step-pane]', form).forEach((p) => { p.hidden = +p.dataset.stepPane !== step; });
    form.querySelector('.sb-rr-prog').innerHTML = stepper(RR_STEPS, step - 1, { label: 'Steps' });
    modal.querySelector('[data-rr-label]').textContent = `Step ${step} of 3 · ${RR_STEPS[step - 1]}`;
    modal.querySelector('[data-act="sb-rr-back"]').hidden = step === 1;
    modal.querySelector('[data-act="sb-rr-next"]').hidden = step === 3;
    modal.querySelector('[data-rr-send]').hidden = step !== 3;
    if (step === 3) form.querySelector('[data-rr-preview]').innerHTML = rrPreview(rrData(form));
    modal.scrollTop = 0;
  }
  function rrEmail(op, d, id) {
    const dates = d.start ? `${ym(d.start)} to ${d.ongoing || !d.end ? 'now' : ym(d.end)}` : d.ongoing ? 'ongoing' : '';
    const tags = d.tags || [];
    return {
      subject: `Working with ${op.name}`,
      body: `Hi ${RN.fmt.first(d.rname) || 'there'},\n\n${op.name} asked you to review your work together at ${d.company}. It takes about 4 minutes. Your review is published on ${op.first}’s Revenue Nomad profile under your name and title.\n\nYou’ll be asked to confirm:\n· The engagement: ${RN.w.label('engagementType', d.engagementType) || 'Fractional'}${dates ? ', ' + dates : ''}\n· ${d.outcomes.length} ${d.outcomes.length === 1 ? 'outcome' : 'outcomes'} ${op.first} delivered, each rated ${RN.w.labels('outcomeRating', RN.fields.outcomeRating.options.map((x) => x.v), ', ')}\n· ${tags.length} focus ${tags.length === 1 ? 'area' : 'areas'} to verify${tags.length ? ': ' + tags.join(', ') : ''}\n· Four CORE questions: ${RN.fields.coreDims.options.map((x) => x.l).join(', ')}\n\nStart the review: ${pageUrl()}#review.${id || '…'}\n\nThank you,\nRevenue Nomad, on behalf of ${op.name}`,
    };
  }
  function rrPreview(d) {
    const op = RN.myOp();
    const m = rrEmail(op, d);
    return `<div class="sb-mail">
      <div class="sb-mail-h"><span><b>To</b> ${esc(d.rname)} &lt;${esc(d.remail)}&gt;</span><span><b>Subject</b> ${esc(m.subject)}</span></div>
      <div class="sb-mail-b">${esc(m.body.split('\n\nStart the review:')[0])}</div>
      <div class="sb-mail-cta"><span class="btn btn-sm" aria-hidden="true">Start the review</span></div>
      <div class="sb-mail-f">Sent by Revenue Nomad on behalf of ${esc(op.name)}</div>
    </div>
    <div class="sb-rr-sum">
      <span class="label">The form ${esc(RN.fmt.first(d.rname))} fills in</span>
      <ol>
        <li>Confirm the engagement at ${esc(d.company)}</li>
        <li>Rate your outcomes: ${d.outcomes.map((x) => `“${esc(x)}”`).join(', ')}</li>
        <li>Verify ${(d.tags || []).length} focus areas${(d.tech || []).length ? ` and the stack (${esc(W().labels('techStack', d.tech))})` : ''}</li>
        <li>Answer the four CORE questions and say if they would hire you again</li>
      </ol>
    </div>`;
  }
  RN.actions['sb-rr-open'] = (el) => {
    const cur = RN.currentRoute();
    if (!(cur && cur.params && cur.params.tab === 'credibility')) RN.go('studio.credibility');
    openReviewRequest({ verify: el && el.dataset && !!el.dataset.verify });
  };
  RN.actions['sb-rr-next'] = () => {
    const form = document.getElementById('sb-rr-form');
    const step = +form.dataset.step;
    const err = rrValidate(form, step);
    if (err) { RN.ui.toast(err, { icon: 'info' }); return; }
    rrGo(form, Math.min(3, step + 1));
  };
  RN.actions['sb-rr-back'] = () => { const form = document.getElementById('sb-rr-form'); rrGo(form, Math.max(1, +form.dataset.step - 1)); };
  RN.inputs['sb-rr-eng'] = (el) => {
    const form = el.closest('form');
    const op = RN.myOp();
    const e = op.engagements[+el.value];
    const set = (n, v) => { const x = form.querySelector(`[name="${n}"]`); if (x) x.value = v; };
    set('company', e ? e.company : '');
    set('rcompany', e ? e.company : '');
    set('start', e ? e.start || '' : '');
    set('end', e && e.end ? e.end : '');
    const on = form.querySelector('[name=ongoing]');
    on.checked = !!(e && !e.end);
    form.querySelector('[name=end]').disabled = on.checked;
    if (!e) form.querySelector('[name=company]').focus();
  };
  RN.inputs['sb-rr-ongoing'] = (el) => { const end = el.closest('form').querySelector('[name=end]'); end.disabled = el.checked; if (el.checked) end.value = ''; };
  RN.submits['sb-rr-send'] = (form) => {
    const step = +form.dataset.step;
    if (step < 3) { RN.actions['sb-rr-next'](); return; }
    for (const s of [1, 2]) { const err = rrValidate(form, s); if (err) { rrGo(form, s); RN.ui.toast(err, { icon: 'info' }); return; } }
    const op = RN.myOp();
    const d = rrData(form);
    const id = 'rr-' + RN.slug(d.rname).slice(0, 16) + '-' + Math.random().toString(36).slice(2, 6);
    const rec = {
      id, opId: op.id, status: 'sent', sentAt: RN.now().toISOString(),
      reviewer: { name: d.rname.trim(), email: d.remail.trim(), company: (d.rcompany || d.company).trim(), title: (d.rtitle || '').trim() },
      engagement: d.company.trim(),
      details: { company: d.company.trim(), engagementType: d.engagementType, start: d.start || null, end: d.ongoing ? null : d.end || null, ongoing: d.ongoing, roleCategory: op.catKey, role: op.role },
      tags: d.tags || [], outcomes: d.outcomes, tech: d.tech || [],
    };
    RN.store.update((s) => { s.reviewRequests.unshift(rec); }, 'reviewRequests');
    RN.track('review_request', { opId: op.id, meta: { requestId: id, company: rec.engagement, tags: rec.tags.length } });
    const m = rrEmail(op, d, id);
    RN.mail(rec.reviewer.email, m.subject, m.body, 'review');
    RN.ui.closeModal();
    RN.ui.toast(`Request sent to ${esc(rec.reviewer.name)}. Their link: <a class="mono sb-toast-link" href="#review.${esc(id)}">#review.${esc(id)}</a>`, { icon: 'send', ms: 7000, action: { label: 'Open as client', act: 'go', attrs: `data-to="review.${esc(id)}"` } });
    RN.rerender();
  };

  /* ---------- Proof link: create, copy, open ---------- */
  function openProofModal(o) {
    o = o || {};
    const op = RN.myOp();
    RN.ui.modal({
      width: 600,
      title: 'Create a proof link',
      sub: 'A private page with the proof you pick, for one prospect. No fee on deals you win this way.',
      body: `<form id="sb-proof-form" class="stack" style="--gap:20px" data-submit="sb-proof-create" data-from="${esc(o.from || '')}">
        <div class="grid g-2" style="--gap:16px">
          <div class="field"><label for="sb-pf-co">Prospect company</label><input class="input" id="sb-pf-co" name="company" value="${esc(o.company || '')}" placeholder="e.g. Harbor Property Group" required></div>
          <div class="field"><label for="sb-pf-ct">Contact <span class="opt">Optional</span></label><input class="input" id="sb-pf-ct" name="contact" value="${esc(o.contact || '')}" placeholder="Name, title"></div>
        </div>
        <div class="field"><span class="field-label">Sections to include</span>
          <div class="chipset" role="group" aria-label="Sections">
            ${SECTIONS.map((s) => `<button type="button" class="chip" aria-pressed="${s.v !== 'rate'}" data-act="w-chip" data-name="sections" data-v="${s.v}" data-multi="1">${esc(s.l)}</button>`).join('')}
            <input type="hidden" name="sections" value="reviews|core|engagements|samples" data-multi="1">
          </div>
          <p class="help">Your Reputation Index, headline and availability are always shown.</p>
        </div>
        <div class="field"><label for="sb-pf-note">Personal note <span class="opt">Optional</span></label>
          <textarea class="textarea" id="sb-pf-note" name="note" maxlength="400" style="min-height:80px" placeholder="Why you are sharing this and what to look at first."></textarea></div>
        <div class="note info">${icon('eye')}<div>The prospect sees: “${esc(op.first)} will see that this page was opened and which sections were read.”</div></div>
      </form>`,
      foot: `<button type="button" class="btn btn-line" data-act="modal-close">Cancel</button><button type="submit" class="btn" form="sb-proof-form">${icon('link')}${o.from === 'outreach' ? 'Create and add to email' : 'Create, copy and open'}</button>`,
    });
  }
  RN.actions['sb-proof-new'] = () => openProofModal();
  RN.submits['sb-proof-create'] = (form, data) => {
    const op = RN.myOp();
    const company = (data.company || '').trim();
    if (!company) { RN.ui.toast('Add the prospect’s company.', { icon: 'info' }); return; }
    if (!(data.sections || []).length) { RN.ui.toast('Pick at least one section to share.', { icon: 'info' }); return; }
    const id = 'proof-' + RN.slug(company).slice(0, 18) + '-' + Math.random().toString(36).slice(2, 6);
    const rec = { id, opId: op.id, prospect: { company, contact: (data.contact || '').trim() }, sections: data.sections, note: (data.note || '').trim(), createdAt: RN.now().toISOString(), views: [] };
    RN.store.update((s) => { s.proofLinks.unshift(rec); }, 'proofLinks');
    const url = proofUrl(id);
    const copied = copyText(url);
    RN.ui.closeModal();
    if (form.dataset.from === 'outreach') {
      const ta = document.getElementById('sb-out-body');
      const line = `Proof of my work, prepared for ${company}: ${url}`;
      const re = /\n(My profile, with verified client reviews|Proof of my work, prepared for[^\n:]*): [^\n]+/;
      if (ta) ta.value = re.test(ta.value) ? ta.value.replace(re, '\n' + line) : ta.value.replace(/\s*$/, '') + '\n\n' + line;
      const hint = document.querySelector('[data-act="sb-out-proof"]');
      if (hint && hint.closest('.note')) hint.closest('.note').remove();
      RN.ui.toast(`Proof link added to your email${copied ? ' and copied' : ''}.`, { icon: 'link' });
      return;
    }
    RN.ui.toast(`Proof link for ${esc(company)} ${copied ? 'copied' : 'created'}: <span class="mono sb-toast-link">#proof.${esc(id)}</span>`, { icon: 'link', ms: 6000 });
    RN.go('proof.' + id);
  };

  /* ======================================================================
     OPPORTUNITIES: fractional roles (job board) + predictive prospects
     Illustrative sample data re-expressed from the repo's Operator Portal (repo_samples.json),
     mapped to the standard fields: role category, engagement type, available time, initial term,
     industries, revenue range, employee range.
     ====================================================================== */
  const SOURCES = { fractionaljobs: 'fractionaljobs.io', remotive: 'Remotive', remoteok: 'RemoteOK', weworkremotely: 'We Work Remotely', greenhouse: 'Greenhouse', hackernews: 'Hacker News', reddit: 'Reddit' };
  // hpw = hours per week as posted; converted to the standard "Available time" chip code
  const JOBS = [
    { id: 'j01', title: 'Fractional VP of Sales, inside sales build', co: 'Tollgate Logistics Software', cat: 'sales_leadership', eng: ['fractional'], hpw: 24, commit: '3 days a week', comp: '$175/hr', ind: ['Saas', 'Freight & Trucking'], rev: '5m_20m', emp: '51_200', loc: 'Remote (Americas)', src: 'greenhouse', days: 2, sum: 'Take a logistics SaaS company from founder-led sales to a six-rep inside sales team: hiring plan, comp plan, a qualification framework and weekly pipeline reviews.' },
    { id: 'j02', title: 'Fractional Head of Sales, digital health', co: 'Brightwell Care', cat: 'sales_leadership', eng: ['fractional'], hpw: 15, commit: '15 hrs a week', comp: '$200–$250/hr', term: 6, ind: ['Health Care', 'Saas'], rev: '5m_20m', emp: '51_200', loc: 'Remote (US)', src: 'fractionaljobs', days: 1, sum: 'Digital health company selling to multi-site provider groups. Rebuild the pipeline process, coach three AEs and set up forecasting in HubSpot ahead of a Series B raise.' },
    { id: 'j03', title: 'Fractional CRO, professional services firm', co: 'Halden Advisory Partners', cat: 'sales_leadership', eng: ['fractional'], hpw: 16, commit: '2 days a week', term: 12, ind: ['Professional Services', 'Consulting & Advisory'], rev: '20m_50m', emp: '51_200', loc: 'Remote (US)', src: 'fractionaljobs', days: 3, sum: '$20M firm wants a repeatable new-logo pipeline, account planning for its top clients and a forecast the partners trust. 12-month engagement.' },
    { id: 'j04', title: 'Fractional CRO, B2B SaaS', co: 'Latticework Analytics', cat: 'sales_leadership', eng: ['fractional'], hpw: 16, commit: '2 days a week', comp: '$8K–$12K a month', ind: ['Saas', 'Data & Analytics'], rev: '1m_5m', emp: '11_50', loc: 'Remote (US)', src: 'remotive', days: 6, sum: 'Series A analytics company. Build the outbound motion, hire the first two AEs and own the path from $1M to $3M ARR. HubSpot and a founder-led sales handoff required.' },
    { id: 'j05', kind: 'discussion', title: 'Anyone hired a fractional sales leader for a 12-person SaaS?', co: 'r/SaaS thread', cat: 'sales_leadership', eng: ['fractional'], term: 6, ind: ['Saas'], rev: '1m_5m', emp: '11_50', loc: 'See thread', src: 'reddit', days: 5, sum: '“We’re at $1.5M ARR with founder-led sales and two AEs. Looking for a fractional VP of Sales for about six months to build the pipeline process and coach the reps. What should we expect to pay per hour?”' },
    { id: 'j06', title: 'Interim VP of Sales, enterprise motion', co: 'Ironbridge Industrial AI', cat: 'sales_leadership', eng: ['interim'], comp: '$14K–$18K a month', ind: ['Industrial Automation & Iot', 'Deep Tech / AI'], rev: '20m_50m', emp: '51_200', loc: 'Remote (US)', src: 'weworkremotely', days: 9, sum: 'Between sales leaders. Run the existing six-rep team, keep the Q4 pipeline moving and help scope the permanent hire.' },
    { id: 'j07', title: 'Fractional GTM advisor, product-led motion', co: 'Cinder Cloud', cat: 'sales_leadership', eng: ['advisory', 'fractional'], hpw: 10, commit: '5 to 10 hrs a week', ind: ['Developer Tools', 'Saas'], rev: 'under_1m', emp: '11_50', loc: 'Remote (Americas)', src: 'remoteok', days: 12, sum: 'Seed-stage infrastructure startup. Pressure-test pricing, define the ICP and coach the founders through their first enterprise deals.' },
    { id: 'j08', title: 'Fractional VP of Marketing, demand generation', co: 'Quarry Devtools', cat: 'marketing', eng: ['fractional'], hpw: 15, commit: '15 hrs a week', comp: '$7K–$10K a month', ind: ['Developer Tools'], rev: '1m_5m', emp: '11_50', loc: 'Remote (Global)', src: 'remotive', days: 4, sum: 'Own demand generation across paid, SEO and a product-led content engine. Set the narrative with the founders and stand up attribution before a full-time hire.' },
    { id: 'j09', title: 'Fractional CMO, freight marketplace', co: 'Relay Freight Exchange', cat: 'marketing', eng: ['fractional'], hpw: 16, commit: '2 days a week', comp: '€6K–€9K a month', term: 9, ind: ['Marketplace', 'Freight & Trucking'], rev: '5m_20m', emp: '51_200', loc: 'Remote (EU)', src: 'weworkremotely', days: 8, sum: 'Two-sided logistics marketplace. Own brand and demand on both sides of the market, with an option to convert.' },
    { id: 'j10', title: 'Fractional product marketing lead', co: 'Pantry Supply Software', cat: 'marketing', eng: ['fractional'], hpw: 15, commit: '15 hrs a week', ind: ['Saas', 'Food & Beverage Cpg'], rev: '5m_20m', emp: '51_200', loc: 'Remote (Worldwide)', src: 'remotive', days: 10, sum: 'Launch messaging and positioning, sales collateral and win/loss interviews for a food-supply SaaS platform.' },
    { id: 'j11', kind: 'discussion', title: 'Ask HN: Who is hiring? Fractional head of marketing', co: 'Hacker News thread', cat: 'marketing', eng: ['fractional'], hpw: 16, commit: '2 days a week', ind: ['Fintech'], rev: 'under_1m', emp: '1_10', loc: 'See thread', src: 'hackernews', days: 20, sum: '“Seed-stage fintech, 40 paying customers. Looking for a fractional CMO about two days a week to build demand gen and a content engine before we hire full time.”' },
    { id: 'j12', title: 'Interim Head of Revenue Operations', co: 'Calloway Health', cat: 'revenue_operations', eng: ['interim'], comp: '$110–$140/hr', term: 6, ind: ['Health Care'], rev: '20m_50m', emp: '201_500', loc: 'Remote (US/EU)', src: 'greenhouse', days: 7, sum: 'Salesforce cleanup, pipeline reporting the board can trust, a comp plan redesign and a territory model ahead of the new fiscal year.' },
    { id: 'j13', title: 'Fractional RevOps Manager, HubSpot', co: 'Fernhill Security', cat: 'revenue_operations', eng: ['fractional'], hpw: 18, commit: '15 to 20 hrs a week', comp: '$110/hr', ind: ['Cybersecurity', 'Saas'], rev: '1m_5m', emp: '11_50', loc: 'Remote (US)', src: 'fractionaljobs', days: 4, sum: 'HubSpot admin, lifecycle stages, lead routing and pipeline reporting for a team of 30 on a lean stack.' },
    { id: 'j14', title: 'Fractional Head of Sales Enablement', co: 'Harborview Health Tech', cat: 'sales_enablement', eng: ['fractional'], hpw: 16, commit: '2 days a week', comp: '$140/hr', term: 6, ind: ['Health Care', 'Saas'], rev: '20m_50m', emp: '51_200', loc: 'Remote (US)', src: 'fractionaljobs', days: 3, sum: 'Series B with 14 AEs. Rebuild onboarding, install a MEDDPICC deal-review cadence and cut ramp time for the next cohort.' },
    { id: 'j15', title: 'Sales trainer, discovery and negotiation', co: 'Pinecrest Software', cat: 'sales_enablement', eng: ['project'], hpw: 10, commit: '10 hrs a week', comp: '$120/hr', term: 3, ind: ['Saas'], rev: '5m_20m', emp: '51_200', loc: 'Remote (Americas)', src: 'remotive', days: 6, sum: 'Run Challenger-style discovery and negotiation workshops for a 20-person inside sales team, build call-review scorecards and certify managers to keep coaching.' },
    { id: 'j16', title: 'Fractional VP of Customer Success', co: 'Evergreen Subscriptions', cat: 'customer_success_growth', eng: ['fractional'], hpw: 24, commit: '3 days a week', term: 6, ind: ['Saas'], rev: '5m_20m', emp: '51_200', loc: 'Remote (US)', src: 'fractionaljobs', days: 2, sum: '$8M ARR. Own renewals, design the onboarding playbook and lift net revenue retention before the first big renewal cohort lands.' },
    { id: 'j17', title: 'Interim Head of Customer Success', co: 'Northgate Labs', cat: 'customer_success_growth', eng: ['interim'], term: 9, ind: ['Saas'], rev: '5m_20m', emp: '51_200', loc: 'Remote (US/EU)', src: 'weworkremotely', days: 9, sum: 'Run a five-person CSM team, stand up expansion and account management, and hand a retention dashboard to the permanent hire.' },
    { id: 'j18', title: 'Fractional GTM engineer, AI outbound', co: 'Signalwise Data', cat: 'ai_gtm', eng: ['fractional'], hpw: 15, commit: '15 hrs a week', comp: '$150/hr', ind: ['Data & Analytics'], rev: '1m_5m', emp: '11_50', loc: 'Remote (Worldwide)', src: 'remoteok', days: 1, sum: 'Build Clay and LLM enrichment workflows, automate outbound sequencing and wire research agents into the sales pipeline. Python and API experience required.' },
    { id: 'j19', title: 'Fractional Partnerships Director, channel program', co: 'Bastion Security', cat: 'partnerships', eng: ['fractional'], hpw: 16, commit: '2 days a week', ind: ['Cybersecurity'], rev: '5m_20m', emp: '51_200', loc: 'Remote (US/EU)', src: 'fractionaljobs', days: 6, sum: 'Launch a reseller and MSP channel program: partner tiers, enablement kits and the first 10 signed partners.' },
    { id: 'j20', title: 'Fractional Account Executive, mid-market', co: 'Doorstep Property Tech', cat: 'sellers', eng: ['fractional'], hpw: 24, commit: '3 days a week', comp: '$90/hr plus commission', ind: ['Property Management', 'Saas'], rev: '5m_20m', emp: '11_50', loc: 'Remote (US)', src: 'fractionaljobs', days: 5, sum: 'Carry a mid-market quota for a property management software platform. Warm pipeline from founder-led sales.' },
    { id: 'j21', title: 'Contract SDR, outbound pilot', co: 'Tallyfin Payments', cat: 'sellers', eng: ['project'], hpw: 25, commit: '25 hrs a week', comp: '$65/hr', term: 3, ind: ['Fintech'], rev: '1m_5m', emp: '11_50', loc: 'Remote (US)', src: 'remoteok', days: 11, sum: 'Build lists, run sequences and book qualified meetings with mid-market finance teams for two account executives.' },
  ];
  const termCode = (m) => (!m ? null : m <= 3 ? '1_3' : m <= 6 ? '3_6' : m <= 12 ? '6_12' : '12_plus');
  const jobHours = (j) => (j.hpw ? RN.fields.hoursCode(j.hpw * 4.33) : null);

  // Sales Leadership signal set (repo signalLibrary), wording cleaned up
  const SL_SIGNALS = [
    ['sl_seat_req', 'Are they hiring a full-time sales leader right now (a 4 to 6 month search you can bridge)?'],
    ['sl_reps_no_leader', 'Are they hiring reps with no sales leadership posted to run them?'],
    ['sl_quota_burst', 'Is there a burst of quota-carrying hires that needs a playbook before the reps land?'],
    ['sl_founder_ceiling', 'Is founder-led sales at its ceiling (15 to 60 people, no sales leadership anywhere)?'],
    ['sl_hiring_composition', 'Are they growing headcount with no sales hiring at all?'],
    ['sl_upmarket_move', 'Did a self-serve product just add a sales-led enterprise plan nobody has run before?'],
    ['restructuring', 'Did they just have a layoff, with the targets still in place?'],
    ['departure', 'Did the leader in this seat leave, in the news or on the roster?'],
    ['funding', 'Did they raise in the last 150 days?'],
    ['started-hiring', 'Did they switch to hiring mode this week?'],
    ['headcount-jump', 'Did headcount grow 20% or more?'],
    ['newly-launched', 'Did they just launch publicly?'],
  ];
  const SIG = {
    departure: { l: 'Departure', c: 'bad' }, 'leadership-gap': { l: 'Leadership gap', c: 'accent' }, 'team-without-leader': { l: 'Team without a leader', c: 'info' },
    funding: { l: 'Funding', c: 'gold' }, 'hiring-role': { l: 'Open GTM roles', c: 'info' }, 'function-gap': { l: 'Function gap', c: 'warn' },
    restructuring: { l: 'Restructuring', c: 'gold' }, 'started-hiring': { l: 'Started hiring', c: 'good' }, 'headcount-jump': { l: 'Headcount jump', c: 'good' }, 'newly-launched': { l: 'Just launched', c: 'info' },
  };
  // Operator-facing angles, keyed by the strongest signal. Written with the operator's role label.
  const ANGLE = {
    'leadership-gap': (r) => `They are searching for a full-time sales leader. Offer interim ${r} cover while the search runs, and offer to help hire the permanent leader.`,
    'team-without-leader': (r) => `Reps are being hired with nobody to run them. Offer to onboard the new reps and build the playbook as their fractional ${r}.`,
    'hiring-role': () => 'A cohort of reps is about to land. Lead with a 30-day playbook and ramp plan that is ready before their start dates.',
    'function-gap': (r) => `Nobody owns sales at a size where someone should. Offer a fractional ${r} engagement to build the first repeatable motion.`,
    departure: (r) => `The seat just opened. Offer interim ${r} cover so the pipeline keeps moving, and help scope the permanent hire.`,
    funding: (r) => `The raise comes with a plan that assumes a sales team. Offer to turn the round into pipeline as their fractional ${r} before full-time hires land.`,
    restructuring: (r) => `Headcount is frozen but the targets are not. Position a fractional ${r} as senior output without a full-time salary.`,
    'started-hiring': (r) => `They just opened hiring. Reach out before the reqs go up: a fractional ${r} gets them moving while they recruit.`,
    'headcount-jump': (r) => `Growth is outrunning the sales org. Offer a fractional ${r} to put structure under it.`,
    'newly-launched': (r) => `They just launched. This is the window to pitch a fractional ${r} before they build in-house.`,
  };
  // Illustrative companies for a VP of Sales ICP. Signals use the engine's weights and half-lives.
  const PROS = [
    { id: 'p01', co: 'Cadence Clinical', one: 'Care coordination software for outpatient clinics.', ind: 'Health Care', emp: '51_200', n: 85, rev: '5m_20m', stage: 'Series A',
      sig: [{ q: 'sl_seat_req', t: 'leadership-gap', l: 'Hiring your seat full-time: VP of Sales', d: 'The search runs 4 to 6 months. Fractional cover keeps the pipeline moving now.', days: 9, half: 45, w: 0.8 }, { q: 'funding', t: 'funding', l: 'Raised a Series A ($14M)', d: 'Fresh budget and a board plan that assumes a sales team.', days: 40, half: 120, w: 0.6 }, { q: 'headcount-jump', t: 'headcount-jump', l: 'Team grew from 62 to 85', d: 'Growth is outrunning the sales org.', days: 20, half: 90, w: 0.6 }],
      subj: 'Covering the VP of Sales seat at Cadence Clinical while you hire', hook: 'Congratulations on the Series A. I saw you are hiring a VP of Sales. Those searches usually take four to six months, and this year’s number does not wait for them.' },
    { id: 'p02', co: 'Ridgeline Property Software', one: 'Leasing and maintenance software for mid-size property managers.', ind: 'Property Management', emp: '51_200', n: 70, rev: '5m_20m', stage: 'Series A',
      sig: [{ q: 'departure', t: 'departure', l: 'Past sales leader on the roster, seat now empty', d: 'Nobody has owned the number since the last leader left.', days: null, half: null, w: 0.7 }, { q: 'sl_reps_no_leader', t: 'team-without-leader', l: 'Hiring 3 reps with no sales leadership posted', d: 'Open: Account Executive (2), SDR.', days: 12, half: 60, w: 0.75 }, { q: 'funding', t: 'funding', l: 'Raised a Series A ($9M)', d: 'New budget with a plan that assumes a sales team.', days: 50, half: 120, w: 0.6 }],
      subj: 'Your open AE roles at Ridgeline', hook: 'I saw you have three sales roles open and nobody posted to lead them. New reps without a leader and a playbook usually take two quarters to find their feet.' },
    { id: 'p03', co: 'Northpeak Payroll', one: 'Payroll and benefits for companies with 20 to 200 people.', ind: 'Saas', emp: '11_50', n: 38, rev: '1m_5m', stage: 'Seed',
      sig: [{ q: 'sl_founder_ceiling', t: 'function-gap', l: 'Founder-led sales at the ceiling', d: '38 people with no sales org or sales postings. The founder is still selling.', days: null, half: null, w: 0.65 }, { q: 'started-hiring', t: 'started-hiring', l: 'Switched to hiring mode', d: 'The hiring flag turned on in the company directory this week.', days: 4, half: 30, w: 0.65 }],
      subj: 'Getting sales off the founder’s desk at Northpeak', hook: 'At around 40 people it looks like you are still running every deal yourself, and I noticed you just opened hiring.' },
    { id: 'p04', co: 'Stackwise HR', one: 'HR and performance software for multi-location employers.', ind: 'Saas', emp: '51_200', n: 120, rev: '5m_20m', stage: 'Series B',
      sig: [{ q: 'departure', t: 'departure', l: 'VP of Sales left in August', d: 'Reported in the news; the seat has not been backfilled.', days: 35, half: 75, w: 0.85 }, { q: 'restructuring', t: 'restructuring', l: 'Layoff mention on record', d: 'Headcount is tight, but the targets are still there.', days: 62, half: 90, w: 0.55 }],
      subj: 'Keeping Stackwise’s pipeline moving between sales leaders', hook: 'I understand your VP of Sales moved on in August. After a reset like the one this spring, the targets usually stay where they were while the team gets smaller.' },
    { id: 'p05', co: 'Harborline Supply', one: 'B2B marketplace for commercial kitchen equipment.', ind: 'Marketplace', emp: '11_50', n: 26, rev: '1m_5m', stage: 'Seed',
      sig: [{ q: 'funding', t: 'funding', l: 'Raised a seed round ($4M)', d: 'New capital and pressure to show a sales motion before the next round.', days: 18, half: 120, w: 0.6 }, { q: 'sl_reps_no_leader', t: 'team-without-leader', l: 'Hiring 2 AEs with no sales leadership posted', d: 'Open: Account Executive, Account Executive (restaurant groups).', days: 15, half: 60, w: 0.75 }],
      subj: 'Your first two AEs at Harborline', hook: 'Congratulations on the seed round. I saw you are hiring your first two account executives. The first hires land much faster with a written sales process in place before they start.' },
    { id: 'p06', co: 'Vireo Automation', one: 'Vision sensors and controls for packaging lines.', ind: 'Industrial Automation & Iot', emp: '51_200', n: 140, rev: '20m_50m', stage: 'Series B',
      sig: [{ q: 'sl_quota_burst', t: 'hiring-role', l: '5 quota-carrying roles open at once', d: 'A rep cohort without a leader-built playbook burns two quarters.', days: 6, half: 60, w: 0.7 }, { q: 'headcount-jump', t: 'headcount-jump', l: 'Team grew from 104 to 140', d: 'Growth is outrunning the sales org.', days: 25, half: 90, w: 0.6 }],
      subj: 'Ramping five new reps at Vireo', hook: 'You have five quota-carrying roles open at the same time. A cohort that size ramps much faster when the playbook, territories and targets are ready before day one.' },
    { id: 'p07', co: 'Tessellate Labs', one: 'Sample tracking software for contract research labs.', ind: 'Pharma & Biotech', emp: '51_200', n: 66, rev: '5m_20m', stage: 'Series A',
      sig: [{ q: 'sl_upmarket_move', t: 'function-gap', l: 'Self-serve product adding an enterprise plan', d: 'A free trial plus a contact-sales tier, with no sales leader to run it.', days: 20, half: 90, w: 0.55 }, { q: 'headcount-jump', t: 'headcount-jump', l: 'Team grew from 48 to 66', d: 'Headcount jump this year.', days: 30, half: 90, w: 0.6 }],
      subj: 'The new enterprise plan at Tessellate', hook: 'I noticed you added an enterprise plan next to self-serve. Enterprise deals need a different motion than self-serve signups: discovery, security reviews and multi-threading.' },
    { id: 'p08', co: 'Clearwater Benefits Advisors', one: 'Employee benefits consulting for mid-market employers.', ind: 'Professional Services', emp: '51_200', n: 90, rev: '5m_20m', stage: 'Private',
      sig: [{ q: 'sl_hiring_composition', t: 'function-gap', l: '11 open roles, none in sales', d: 'Growing across the firm with no revenue hires.', days: null, half: null, w: 0.6 }],
      subj: 'New business at Clearwater', hook: 'You are hiring across the firm, eleven roles at last count, but nothing in sales. At your size, new business usually still depends on a few partners.' },
    { id: 'p09', co: 'Lumora Health Analytics', one: 'Population health analytics for regional health plans.', ind: 'Health Care', emp: '11_50', n: 31, rev: '1m_5m', stage: 'Seed',
      sig: [{ q: 'newly-launched', t: 'newly-launched', l: 'Launched publicly', d: 'Added to the company directory this month.', days: 10, half: 60, w: 0.5 }, { q: 'sl_founder_ceiling', t: 'function-gap', l: 'Founder-led sales at the ceiling', d: '31 people with no sales org or postings.', days: null, half: null, w: 0.65 }],
      subj: 'Congratulations on the launch, Lumora', hook: 'Congratulations on the launch. Right after launch is when founder-led sales starts to stretch, and it looks like you are still carrying every deal.' },
    { id: 'p10', co: 'Quorum Legal Operations', one: 'Outsourced legal operations for in-house legal teams.', ind: 'Professional Services', emp: '51_200', n: 75, rev: '5m_20m', stage: 'Private',
      sig: [{ q: 'restructuring', t: 'restructuring', l: 'Layoff mention on record', d: 'Outcomes still owed on a tighter budget.', days: 31, half: 90, w: 0.55 }, { q: 'departure', t: 'departure', l: 'Past sales leader on the roster, seat now empty', d: 'The seat has been open since the reset.', days: null, half: null, w: 0.7 }],
      subj: 'Sales leadership at Quorum after the reset', hook: 'I know the team went through a reset recently and the head of sales seat is open. The targets usually stay where they were even when headcount does not.' },
    { id: 'p11', co: 'Pillar Point Compliance', one: 'Compliance software for community banks and credit unions.', ind: 'Banking & Credit Unions', emp: '51_200', n: 60, rev: '5m_20m', stage: 'Series A',
      sig: [{ q: 'sl_seat_req', t: 'leadership-gap', l: 'Hiring your seat full-time: Head of Sales', d: 'Posted 3 weeks ago. The search runs 4 to 6 months.', days: 21, half: 45, w: 0.8 }],
      subj: 'Covering the Head of Sales seat at Pillar Point', hook: 'I saw you are hiring a Head of Sales. While the search runs, someone still needs to own the forecast and coach the team.' },
    { id: 'p12', co: 'Keel Robotics', one: 'Autonomous inspection robots for warehouses.', ind: 'Industrial Automation & Iot', emp: '201_500', n: 230, rev: '20m_50m', stage: 'Series C',
      sig: [{ q: 'funding', t: 'funding', l: 'Raised a Series C ($60M)', d: 'Growth capital with an aggressive sales plan.', days: 95, half: 120, w: 0.6 }],
      subj: 'Turning the Series C into pipeline at Keel', hook: 'Congratulations on the Series C. Rounds like that usually come with a sales plan that assumes a bigger team than you have today.' },
  ];
  const QUEUE_MIN = 40; // the engine's bar to enter the queue
  const sigDays = (s) => (s.days == null ? null : s.days + (st().clockOffsetDays || 0));
  const sigStrength = (s, extra) => { const d = sigDays(s); return s.w * (d == null || !s.half ? 1 : Math.pow(0.5, (d + (extra || 0)) / s.half)); };
  function scoreProspect(p, op) {
    const brief = { revenueRange: p.rev, employeeRange: p.emp, industries: [p.ind] };
    if ((op.motions || []).length && p.motion) brief.salesMotions = [p.motion];
    const fit = RN.model.fit(op, brief);
    const timing = Math.round(100 * (1 - p.sig.reduce((a, s) => a * (1 - sigStrength(s)), 1)));
    const priority = Math.round(Math.pow(fit.pct / 100, 1.5) * timing);
    const top = p.sig.slice().sort((a, b) => sigStrength(b) - sigStrength(a))[0];
    return { fit, timing, priority, top };
  }

  function renderOpps(op) {
    const tab = (st().seen && st().seen.sbOpp) || 'jobs';
    const jobs = jobList(op);
    const pros = PROS.map((p) => Object.assign({ p }, scoreProspect(p, op))).filter((x) => x.priority >= QUEUE_MIN);
    const psMap = seenMap('prospects');
    const nToReview = pros.filter((x) => !psMap[x.p.id]).length;
    return `<div class="sb sb-opps">
      ${head('Opportunities', 'Fractional roles from across the web, and companies likely to need you before they post a role. Both are matched on your profile fields.')}
      <div class="sb-toolbar">
        <div class="seg" role="group" aria-label="Opportunity type">
          <button type="button" aria-pressed="${tab === 'jobs'}" data-act="sb-opp-tab" data-t="jobs">${icon('briefcase')}Fractional roles <span class="sb-n">${jobs.filter((j) => seenMap('jobs')[j.id] !== 'hidden').length}</span></button>
          <button type="button" aria-pressed="${tab === 'pros'}" data-act="sb-opp-tab" data-t="pros">${icon('target')}Prospects <span class="sb-n">${nToReview}</span></button>
        </div>
      </div>
      ${icpStrip(op, tab)}
      ${tab === 'jobs' ? renderJobs(op, jobs) : renderProspects(op, pros, PROS.length - pros.length)}
    </div>`;
  }
  RN.actions['sb-opp-tab'] = (el) => { RN.store.update((s) => { s.seen = s.seen || {}; s.seen.sbOpp = el.dataset.t; }, 'seen'); RN.rerender(); };

  function icpStrip(op, tab) {
    const inds = op.industries.slice(0, 3).map((i) => RN.w.label('industries', i));
    const more = op.industries.length - inds.length;
    const chips = [
      RN.fields.catLabel(op.catKey) + ' · ' + op.role,
      inds.join(', ') + (more > 0 ? ` +${more}` : ''),
      op.revenueRanges.length && RN.w.labels('revenueRange', op.revenueRanges),
      op.employeeRanges.length && RN.w.labels('employeeRange', op.employeeRanges) + ' employees',
      (op.motions || []).length && RN.w.labels('salesMotions', op.motions),
    ].filter(Boolean);
    return `<div class="sb-icp">
      <div class="sb-icp-l"><span class="label">${tab === 'jobs' ? 'Scored against your profile' : 'Your ICP, from your profile'}</span>
        <div class="sb-icp-chips">${chips.map((c) => `<span class="chip chip-sm sb-chip-static">${esc(c)}</span>`).join('')}</div></div>
      <div class="sb-icp-r"><a class="act" href="#studio.profile">${icon('edit')}Edit these fields</a>
        <span class="tiny muted">${tab === 'jobs' ? 'Sample roles. Illustrative.' : 'Sample companies and signals. Illustrative.'}</span></div>
    </div>`;
  }

  function jobList(op) {
    return JOBS.map((j) => {
      const fit = RN.model.fit(op, { roleCategory: j.cat, industries: j.ind, revenueRange: j.rev, employeeRange: j.emp });
      return Object.assign({}, j, { fit, mine: j.cat === op.catKey });
    }).sort((a, b) => (b.mine - a.mine) || (b.fit.pct - a.fit.pct) || (a.days - b.days));
  }
  function renderJobs(op, all) {
    const sm = seenMap('jobs');
    const stOf = (j) => sm[j.id] || 'new';
    const counts = { board: all.filter((j) => stOf(j) !== 'hidden').length, saved: all.filter((j) => stOf(j) === 'saved').length, applied: all.filter((j) => stOf(j) === 'applied').length, hidden: all.filter((j) => stOf(j) === 'hidden').length };
    let list = all.filter((j) => (S.jobStatus === 'board' ? stOf(j) !== 'hidden' : stOf(j) === S.jobStatus));
    if (S.jobCat) list = list.filter((j) => j.cat === S.jobCat);
    if (S.jobEng) list = list.filter((j) => j.eng.includes(S.jobEng));
    const strong = all.filter((j) => stOf(j) !== 'hidden' && j.fit.pct >= 75).length;
    const mineN = list.filter((j) => j.mine).length;
    const showSplit = !S.jobCat && mineN && mineN < list.length;
    return `<div class="stats-row sb-stats" style="--cols:4">
        <div class="stat"><span class="stat-v">${counts.board}</span><span class="stat-l">Open roles</span></div>
        <div class="stat"><span class="stat-v">${strong}</span><span class="stat-l">Strong matches for you</span></div>
        <div class="stat"><span class="stat-v">${counts.saved}</span><span class="stat-l">Saved</span></div>
        <div class="stat"><span class="stat-v">${counts.applied}</span><span class="stat-l">Applied</span></div>
      </div>
      <p class="small muted sb-explain">Only roles with a real fractional signal make the board: part-time hours, an hourly rate, an interim seat or a fixed term. Full-time roles are filtered out. Sources: ${Object.values(SOURCES).join(', ')}.</p>
      <div class="sb-filters">
        <div class="seg" role="group" aria-label="List">${[['board', 'Board'], ['saved', 'Saved'], ['applied', 'Applied'], ['hidden', 'Hidden']].map(([k, l]) => `<button type="button" aria-pressed="${S.jobStatus === k}" data-act="sb-job-status" data-s="${k}">${l} <span class="sb-n">${counts[k]}</span></button>`).join('')}</div>
        <label class="sb-sel"><span class="sr-only">${esc(RN.fields.roleCategory.label)}</span><select class="select" data-change="sb-job-cat" aria-label="${esc(RN.fields.roleCategory.label)}"><option value="">All role categories</option>${RN.fields.roleCategory.options.map((o) => `<option value="${esc(o.v)}" ${S.jobCat === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
        <label class="sb-sel"><span class="sr-only">${esc(RN.fields.engagementTypes.label)}</span><select class="select" data-change="sb-job-eng" aria-label="${esc(RN.fields.engagementTypes.label)}"><option value="">All engagement types</option>${RN.fields.engagementTypes.options.map((o) => `<option value="${esc(o.v)}" ${S.jobEng === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
      </div>
      ${list.length ? (showSplit
        ? `<h2 class="sb-group-h">In ${esc(RN.fields.catLabel(op.catKey))}<span class="sb-count">${mineN}</span></h2><div class="stack" style="--gap:12px">${list.filter((j) => j.mine).map((j) => jobCard(j, stOf(j))).join('')}</div>
           <h2 class="sb-group-h">Other role categories<span class="sb-count">${list.length - mineN}</span></h2><div class="stack" style="--gap:12px">${list.filter((j) => !j.mine).slice(0, S.jobMore ? 99 : 3).map((j) => jobCard(j, stOf(j))).join('')}</div>
           ${!S.jobMore && list.length - mineN > 3 ? `<button type="button" class="btn btn-line sb-more" data-act="sb-job-more">${icon('chev-down')}Show ${list.length - mineN - 3} more roles in other categories</button>` : ''}`
        : `<div class="stack" style="--gap:12px;margin-top:8px">${list.map((j) => jobCard(j, stOf(j))).join('')}</div>`)
        : RN.ui.empty({ icon: 'briefcase', title: S.jobStatus === 'board' ? 'No roles match these filters' : `Nothing ${S.jobStatus} yet`, body: S.jobStatus === 'board' ? 'Clear a filter to see every open fractional role.' : 'Save roles from the board to keep a shortlist here.', cta: `<button type="button" class="btn btn-line btn-sm" data-act="sb-job-reset">Show the full board</button>` })}`;
  }
  function jobCard(j, status) {
    const hrs = jobHours(j);
    const pills = [
      ...j.eng.map((e) => `<span class="pill ${e === 'fractional' ? 'pill-accent' : ''}">${esc(RN.w.label('engagementTypes', e))}</span>`),
      hrs && `<span class="pill" title="Posted as ${esc(j.commit || '')}">${icon('clock')}${esc(RN.w.label('hoursPerMonth', hrs))}</span>`,
      j.term && `<span class="pill">${icon('calendar')}${esc(RN.w.label('term', termCode(j.term)))}</span>`,
      j.comp && `<span class="pill">${esc(j.comp)}</span>`,
      j.kind === 'discussion' && `<span class="pill pill-info">${icon('message')}Community lead</span>`,
    ].filter(Boolean).join('');
    const why = j.fit.signals.filter((s) => s.state !== 'low').slice(0, 2).map((s) => s.text).join(' · ');
    return `<article class="card sb-job ${status === 'hidden' ? 'is-hidden' : ''}">
      <div class="sb-job-top">
        <span class="ava ava-sm sb-logo" aria-hidden="true">${esc(initials(j.co))}</span>
        <div class="grow">
          <h3 class="sb-job-h">${esc(j.title)}</h3>
          <p class="small muted">${esc(j.co)} · ${esc(j.loc)} · posted ${esc(RN.fmt.ago(RN.daysAgo(j.days)))} · via ${esc(SOURCES[j.src] || j.src)}</p>
        </div>
        ${fitPill(j.fit, { you: true })}
      </div>
      <p class="sb-job-sum">${esc(j.sum)}</p>
      <div class="sb-pills">${pills}</div>
      ${why ? `<p class="sb-why">${icon('target')}<span>${nb(why)}</span></p>` : ''}
      <div class="sb-job-act">
        <button type="button" class="btn btn-sm ${status === 'saved' || status === 'applied' ? '' : 'btn-line'}" data-act="sb-job-set" data-id="${j.id}" data-s="saved" aria-pressed="${status === 'saved' || status === 'applied'}">${icon('bookmark')}${status === 'saved' || status === 'applied' ? 'Saved' : 'Save'}</button>
        <button type="button" class="btn btn-line btn-sm" data-act="sb-job-set" data-id="${j.id}" data-s="applied" aria-pressed="${status === 'applied'}">${icon('check')}${status === 'applied' ? 'Applied' : 'Mark applied'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="sb-job-set" data-id="${j.id}" data-s="hidden">${status === 'hidden' ? icon('refresh') + 'Restore' : icon('eye-off') + 'Hide'}</button>
      </div>
    </article>`;
  }
  RN.actions['sb-job-set'] = (el) => {
    const id = el.dataset.id, s = el.dataset.s;
    const cur = seenMap('jobs')[id];
    const j = JOBS.find((x) => x.id === id);
    let next = s;
    if (s === 'saved' && (cur === 'saved' || cur === 'applied')) next = null;
    else if (s === 'applied' && cur === 'applied') next = 'saved';
    else if (s === 'hidden' && cur === 'hidden') next = null;
    RN.store.update((st2) => { st2.seen = st2.seen || {}; st2.seen.jobs = Object.assign({}, st2.seen.jobs); if (next) st2.seen.jobs[id] = next; else delete st2.seen.jobs[id]; }, 'seen');
    const msg = { saved: 'Saved', applied: 'Marked applied', hidden: 'Hidden' }[next] || (s === 'hidden' ? 'Restored to your board' : 'Removed from saved');
    RN.ui.toast(`${esc(msg)}${j ? ': ' + esc(j.title) : ''}`, next === 'hidden' ? { action: { label: 'Undo', act: 'sb-job-set', attrs: `data-id="${id}" data-s="hidden"` } } : {});
    RN.rerender();
  };
  RN.actions['sb-job-more'] = () => { S.jobMore = true; RN.rerender(); };
  RN.actions['sb-job-status'] = (el) => { S.jobStatus = el.dataset.s; RN.rerender(); };
  RN.actions['sb-job-reset'] = () => { S.jobStatus = 'board'; S.jobCat = ''; S.jobEng = ''; RN.rerender(); };
  RN.inputs['sb-job-cat'] = (el) => { S.jobCat = el.value; RN.rerender(); };
  RN.inputs['sb-job-eng'] = (el) => { S.jobEng = el.value; RN.rerender(); };

  function renderProspects(op, pros, held) {
    const ps = seenMap('prospects');
    const stOf = (x) => ps[x.p.id] || 'review';
    const counts = { review: 0, queued: 0, contacted: 0, dismissed: 0 };
    pros.forEach((x) => { counts[stOf(x)] = (counts[stOf(x)] || 0) + 1; });
    const hot = pros.filter((x) => stOf(x) !== 'dismissed' && x.priority >= 70).length;
    const list = pros.filter((x) => stOf(x) === S.prosStatus).sort((a, b) => b.priority - a.priority);
    return `<div class="stats-row sb-stats" style="--cols:4">
        <div class="stat"><span class="stat-v">${counts.review}</span><span class="stat-l">To review</span></div>
        <div class="stat"><span class="stat-v">${hot}</span><span class="stat-l">Hot (70+)</span></div>
        <div class="stat"><span class="stat-v">${counts.queued}</span><span class="stat-l">Queued</span></div>
        <div class="stat"><span class="stat-v">${counts.contacted}</span><span class="stat-l">Contacted</span></div>
      </div>
      <div class="sb-how">
        <div><span class="sb-how-n">1</span><b>Your profile fields</b><span>Industries, revenue range, employee range and GTM motion, the same fields clients filter on.</span></div>
        <div><span class="sb-how-n">2</span><b>× Company signals</b><span>Leadership gaps, departures, funding and hiring patterns, each fading over time.</span></div>
        <div><span class="sb-how-n">3</span><b>= Priority</b><span class="mono">fit<sup>1.5</sup> × timing</span></div>
      </div>
      <details class="sb-scan"><summary>${icon('radar')}Scanning ${SL_SIGNALS.length} signals for ${esc(RN.fields.catLabel('sales_leadership'))}${icon('chev-down')}</summary>
        <ol>${SL_SIGNALS.map(([, q]) => `<li>${esc(q)}</li>`).join('')}</ol></details>
      <div class="sb-filters"><div class="seg" role="group" aria-label="List">${[['review', 'To review'], ['queued', 'Queued'], ['contacted', 'Contacted'], ['dismissed', 'Dismissed']].map(([k, l]) => `<button type="button" aria-pressed="${S.prosStatus === k}" data-act="sb-pros-status" data-s="${k}">${l} <span class="sb-n">${counts[k] || 0}</span></button>`).join('')}</div></div>
      ${list.length ? `<div class="stack" style="--gap:14px">${list.map((x) => prospectCard(x, op, stOf(x))).join('')}</div>${held && S.prosStatus === 'review' ? `<p class="sb-held">${icon('filter')}<span>${held} more ${held === 1 ? 'company scored' : 'companies scored'} under ${QUEUE_MIN} on your profile and ${held === 1 ? 'is' : 'are'} held back. Their industry or size is outside your ranges. <a class="link" href="#studio.profile">Edit your company fit</a></span></p>` : ''}`
        : S.prosStatus === 'review' && !pros.length && held ? RN.ui.empty({ icon: 'filter', title: `No companies clear ${QUEUE_MIN} on your profile yet`, body: 'Prospects are matched on your industries, revenue range and employee range. Add them and the queue fills in.', cta: '<a class="btn btn-sm" href="#studio.profile">Add company fit</a>' })
        : RN.ui.empty({ icon: 'target', title: S.prosStatus === 'review' ? 'You have reviewed every prospect' : `Nothing ${S.prosStatus} yet`, body: S.prosStatus === 'review' ? 'New companies appear as signals fire. Sharper profile fields give sharper matches.' : 'Queue a prospect to plan outreach, or mark it contacted once you reach out.', cta: `<button type="button" class="btn btn-line btn-sm" data-act="sb-pros-status" data-s="review">Back to To review</button>` })}`;
  }
  function prospectCard(x, op, status) {
    const p = x.p;
    const sigs = p.sig.slice().sort((a, b) => sigStrength(b) - sigStrength(a));
    const fired = new Set(p.sig.map((s) => s.q));
    const unfired = SL_SIGNALS.filter(([id]) => !fired.has(id));
    const isNew = status === 'review' && p.sig.some((s) => s.days != null && s.days <= 7);
    const pri = x.priority;
    return `<article class="card sb-pros" id="sb-pr-${p.id}">
      <div class="sb-pros-top">
        <span class="ava ava-sm sb-logo" aria-hidden="true">${esc(initials(p.co))}</span>
        <div class="grow">
          <div class="row" style="--gap:8px"><h3 class="sb-job-h">${esc(p.co)}</h3>${isNew ? '<span class="pill pill-accent">New</span>' : ''}${status !== 'review' ? `<span class="pill">${esc({ queued: 'Queued', contacted: 'Contacted', dismissed: 'Dismissed' }[status])}</span>` : ''}</div>
          <p class="small muted">${esc(p.one)}</p>
        </div>
        <div class="sb-pri ${pri >= 70 ? 'is-hot' : ''}" title="Priority = ICP fit^1.5 × timing"><b class="num">${pri}</b><span>${pri >= 70 ? 'Hot' : 'Priority'}</span></div>
      </div>
      <div class="sb-pills">
        <span class="pill">${icon('building')}${esc(RN.w.label('industries', p.ind))}</span>
        <span class="pill">${esc(RN.w.label('companyRevenue', p.rev))} revenue</span>
        <span class="pill">${esc(RN.w.label('companyEmployees', p.emp))} employees (~${p.n})</span>
        <span class="pill pill-line">${esc(p.stage)}</span>
      </div>
      <div class="sb-meters">
        <div><div class="row between"><span class="label">ICP fit ${RN.ui.tip('Your profile fields scored against the company on the shared match scale: revenue range, employee range, industry and, if you list it, GTM motion.', 'About ICP fit')}</span><span class="small"><b>${x.fit.pct}</b> · ${esc(x.fit.label)}</span></div><span class="meter"><i style="width:${x.fit.pct}%"></i></span>${fitSignals(x.fit)}</div>
        <div><div class="row between"><span class="label">Timing ${RN.ui.tip('Combined strength of the signals below, faded to today by each signal’s half-life.', 'About timing')}</span><span class="small"><b>${x.timing}</b> today</span></div><span class="meter sb-meter-t"><i style="width:${x.timing}%"></i></span></div>
      </div>
      <div class="sb-whynow">
        <div class="row between sb-whynow-h"><span class="label">Why now · ${p.sig.length} of ${SL_SIGNALS.length} signals fired</span><span class="label hide-s">Strength today</span></div>
        <ul>${sigs.map((s) => {
          const str = sigStrength(s);
          const d = sigDays(s);
          const proj = []; for (let k = 0; k <= 90; k += 10) proj.push(sigStrength(s, k) * 100);
          const meta = SIG[s.t] || { l: s.t, c: 'info' };
          return `<li>
            <div class="sb-sig-main"><span class="sb-sigchip"><i class="sb-dot c-${meta.c}"></i>${esc(meta.l)}</span>
              <b>${esc(s.l)}</b><span class="small muted">${esc(s.d)}</span>
              <span class="tiny muted">${d == null ? 'Standing condition · does not fade' : `Detected ${d === 0 ? 'today' : d + ' days ago'} · ${s.half}-day half-life`}</span></div>
            <div class="sb-sig-str"><span class="small tnum"><b>${Math.round(str * 100)}%</b></span><span class="meter"><i style="width:${Math.round(str * 100)}%"></i></span>
              <span class="sb-spark" title="${d == null ? 'Holds until the state changes' : 'Projected strength over the next 90 days'}">${RN.chart.spark(proj, { w: 72, h: 20, dot: false, label: 'Strength over the next 90 days' })}<em>next 90d</em></span></div>
          </li>`;
        }).join('')}</ul>
        <details class="sb-nofire"><summary>${unfired.length} more signals checked, no trigger</summary><ul>${unfired.map(([, q]) => `<li>${esc(q)}</li>`).join('')}</ul></details>
      </div>
      <div class="sb-angle"><span class="label">Suggested angle</span><p>${esc((ANGLE[x.top.t] || ANGLE['function-gap'])(op.role))}</p></div>
      <div class="sb-job-act">
        <button type="button" class="btn btn-sm" data-act="sb-pros-draft" data-id="${p.id}">${icon('mail')}Draft outreach</button>
        ${status === 'dismissed'
          ? `<button type="button" class="btn btn-line btn-sm" data-act="sb-pros-set" data-id="${p.id}" data-s="review">${icon('refresh')}Restore</button>`
          : `<button type="button" class="btn btn-line btn-sm" data-act="sb-pros-set" data-id="${p.id}" data-s="queued" aria-pressed="${status === 'queued'}">${status === 'queued' ? 'Queued' : 'Queue'}</button>
             <button type="button" class="btn btn-line btn-sm" data-act="sb-pros-set" data-id="${p.id}" data-s="contacted" aria-pressed="${status === 'contacted'}">${icon('check')}${status === 'contacted' ? 'Contacted' : 'Mark contacted'}</button>
             <button type="button" class="btn btn-ghost btn-sm" data-act="sb-pros-set" data-id="${p.id}" data-s="dismissed">Dismiss</button>`}
      </div>
    </article>`;
  }
  RN.actions['sb-pros-status'] = (el) => { S.prosStatus = el.dataset.s; RN.rerender(); };
  RN.actions['sb-pros-set'] = (el) => {
    const id = el.dataset.id, s = el.dataset.s;
    const cur = seenMap('prospects')[id];
    const next = s === 'review' || cur === s ? null : s;
    const p = PROS.find((x) => x.id === id);
    RN.store.update((st2) => { st2.seen = st2.seen || {}; st2.seen.prospects = Object.assign({}, st2.seen.prospects); if (next) st2.seen.prospects[id] = next; else delete st2.seen.prospects[id]; }, 'seen');
    const msg = { queued: `${p.co} queued for outreach`, contacted: `${p.co} marked contacted`, dismissed: `${p.co} dismissed` }[next] || `${p.co} moved back to To review`;
    RN.ui.toast(esc(msg), next === 'dismissed' ? { action: { label: 'Undo', act: 'sb-pros-set', attrs: `data-id="${id}" data-s="review"` } } : {});
    RN.rerender();
  };

  function outreach(p, op) {
    const link = st().proofLinks.find((l) => l.opId === op.id && l.prospect.company.toLowerCase() === p.co.toLowerCase());
    const engs = (op.engagements || []).slice(0, 2);
    const proof = engs.length
      ? `Most recently I led sales as a fractional ${engs[0].role.replace(/^Fractional\s+/i, '')} at ${engs[0].company} for ${engs[0].months} months${engs[1] ? `, and at ${engs[1].company} for ${engs[1].months} months before that` : ''}.`
      : '';
    const nWord = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][op.reviews.length] || String(op.reviews.length);
    const reviews = op.reviews.length >= 2 ? ` ${nWord} of my clients have reviewed that work on Revenue Nomad.` : '';
    const ind = op.industries.includes(p.ind) ? RN.w.label('industries', p.ind) : RN.w.label('industries', op.industries[0] || 'Saas');
    const hrs = op.avail && op.avail.hoursCode ? RN.w.label('hoursPerMonth', op.avail.hoursCode).replace(' / month', ' a month') : 'a few days a month';
    const linkLine = link ? `Proof of my work, prepared for ${p.co}: ${proofUrl(link.id)}` : `My profile, with verified client reviews: revenuenomad.com/operators/${op.slug}`;
    return {
      subject: p.subj,
      body: `Hi [first name],\n\n${p.hook}\n\nI’m ${op.name}, a fractional ${op.role}. I help ${ind} companies your size build a sales motion the team can run without the founder in every deal. ${proof}${reviews}\n\nI usually work around ${hrs}, so you get senior sales leadership now without waiting on a full-time hire.\n\nWould a 20-minute call next week be useful? I can walk you through the first 90 days I would run at ${p.co}.\n\n${op.first}\n${linkLine}`,
      hasLink: !!link,
    };
  }
  RN.actions['sb-pros-draft'] = (el) => {
    const op = RN.myOp();
    const p = PROS.find((x) => x.id === el.dataset.id);
    const m = outreach(p, op);
    RN.ui.modal({
      width: 660,
      title: `Outreach to ${esc(p.co)}`,
      sub: 'Written to the prospect from their strongest signal and your profile. Edit before you send.',
      body: `<div class="stack" style="--gap:16px">
        <div class="field"><label for="sb-out-subj">Subject</label><input class="input" id="sb-out-subj" value="${esc(m.subject)}"></div>
        <div class="field"><label for="sb-out-body">Email</label><textarea class="textarea sb-out" id="sb-out-body" style="min-height:320px">${esc(m.body)}</textarea></div>
        ${m.hasLink ? '' : `<div class="note info">${icon('link')}<div><b>Add a proof link.</b> A private page with your reviews and engagements for ${esc(p.co)}. You see which sections they read. <button type="button" class="act" data-act="sb-out-proof" data-co="${esc(p.co)}">Create one for this email</button></div></div>`}
      </div>`,
      foot: `<button type="button" class="btn btn-line sb-ft-btn" data-act="sb-out-copy" data-id="${p.id}" data-mark="1">Copy and mark contacted</button><button type="button" class="btn sb-ft-btn" data-act="sb-out-copy" data-id="${p.id}">${icon('copy')}Copy email</button>`,
    });
  };
  RN.actions['sb-out-proof'] = (el) => openProofModal({ company: el.dataset.co, from: 'outreach' });
  RN.actions['sb-out-copy'] = (el) => {
    const subj = (document.getElementById('sb-out-subj') || {}).value || '';
    const body = (document.getElementById('sb-out-body') || {}).value || '';
    const ok = copyText(`Subject: ${subj}\n\n${body}`);
    const p = PROS.find((x) => x.id === el.dataset.id);
    if (el.dataset.mark) {
      RN.store.update((s) => { s.seen = s.seen || {}; s.seen.prospects = Object.assign({}, s.seen.prospects, { [p.id]: 'contacted' }); }, 'seen');
      RN.ui.closeModal();
      RN.ui.toast(`${ok ? 'Email copied. ' : ''}${esc(p.co)} marked contacted.`, { icon: 'copy' });
      RN.rerender();
      return;
    }
    RN.ui.toast(ok ? 'Email copied. Paste it into your email client.' : 'Copy did not work in this browser. Select the text and copy it.', { icon: ok ? 'copy' : 'info' });
  };

  /* ======================================================================
     EDIT PROFILE: the same standard fields as intake, saved to RN.store.state.edits
     ====================================================================== */
  const SHOWN_ELSEWHERE = ['salesMotions', 'methodologies', 'crm'];
  function roleValue(op, k) {
    const ed = edits(op).roleFields || {};
    if (ed[k] !== undefined) return ed[k];
    const rd = op.roleDetails || {};
    const d = RN.fields[k];
    switch (k) {
      case 'largestTeamManaged': { const n = +(rd.largest_team_managed || rd.salespeople_managed || 0); return !n ? '' : n < 5 ? '<5' : n <= 10 ? '5-10' : n <= 25 ? '10-25' : n <= 50 ? '25-50' : '50+'; }
      case 'largestTeamQuota': { const q = +(rd.largest_team_quota_managed || rd.largest_team_quota_usd || 0) / 1e6; return !q ? '' : q < 5 ? '1_5m' : q < 10 ? '5_10m' : q < 25 ? '10_25m' : q < 50 ? '25_50m' : q < 100 ? '50_100m' : '100m_plus'; }
      case 'salesCycle': { const x = +(rd.avg_sales_cycle_days || 0); return !x ? [] : [x < 5 ? '<5 days' : x <= 30 ? '5 - 30 days' : x <= 90 ? '30 - 90 days' : x <= 180 ? '3 - 6 months' : x <= 365 ? '6 - 12 months' : '12+ months']; }
      default: {
        const snake = k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
        const v = rd[k] != null ? rd[k] : rd[snake];
        if (v == null) return d.type === 'multi' ? [] : '';
        return d.type === 'multi' ? [].concat(v) : v;
      }
    }
  }
  function alerts() { return Object.assign({ projects: 'instant', weekly: true }, seenMap('alerts')); }

  function renderProfile(op) {
    applyExtras(op);
    const e = edits(op);
    const roleKeys = (RN.fields.roleFields[op.catKey] || []).filter((k) => !SHOWN_ELSEWHERE.includes(k));
    const claimedCount = op.tags.filter((t) => t.tier === 'claimed' && !(e.addTags || []).includes(t.t)).length;
    const room = Math.max(0, RN.fields.fitTags.max - claimedCount);
    const sec = (id, title, sub, inner) => `<section class="card sb-sec-card" id="${id}" aria-labelledby="${id}-h"><div class="card-hd"><div><h3 id="${id}-h">${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div><div class="stack" style="--gap:22px">${inner}</div></section>`;
    return `<div class="sb sb-profile">
      ${head('Edit profile', 'The same fields as sign-up, so clients filter and match on exactly what you enter here.', `<a class="btn btn-line btn-sm" href="#op.${esc(op.slug)}">${icon('eye')}Preview as client</a><button type="submit" class="btn btn-sm" form="sb-prof-form">Save changes</button>`)}
      <div class="sb-prof">
        <form id="sb-prof-form" class="sb-prof-main stack" style="--gap:18px" data-submit="sb-prof-save" data-input="sb-prof-dirty" data-change="sb-prof-dirty" novalidate>
          ${sec('sb-f-about', 'Headline and about', 'The first two things a client reads about you.',
            RN.w.field('headline', op.headline, { name: 'headline' }) + RN.w.field('bio', op.bio, { name: 'bio' }))}
          ${sec('sb-f-avail', 'Availability and rate', 'Clients filter on these first. Keep them current.',
            RN.w.field('availability', op.avail.key, { name: 'availability' })
            + `<div class="grid g-2" style="--gap:18px">${RN.w.field('startDate', op.avail.startDate || '', { name: 'startDate' })}${RN.w.field('newClientCapacity', op.newClientCapacity || '', { name: 'newClientCapacity' })}</div>`
            + RN.w.field('hoursPerMonth', op.avail.hoursCode || '', { name: 'hoursPerMonth' })
            + RN.w.field('engagementTypes', op.engagementTypes || [], { name: 'engagementTypes' })
            + `<div class="sb-rate">${RN.w.field('rate', op.rate || '', { name: 'rate' })}${rateContext(op)}</div>`)}
          ${sec('sb-f-fit', 'Company fit', 'Used for Match Signals on every client visit, and for your prospects.',
            RN.w.field('revenueRange', op.revenueRanges, { name: 'revenueRange' })
            + RN.w.field('employeeRange', op.employeeRanges, { name: 'employeeRange' })
            + RN.w.field('industries', op.industries, { name: 'industries' }))}
          ${sec('sb-f-sell', 'How you sell', '',
            RN.w.field('salesMotions', op.motions || [], { name: 'salesMotions' })
            + RN.w.field('crm', op.crm || '', { name: 'crm' })
            + RN.w.field('methodologies', op.methodologies || [], { name: 'methodologies' }))}
          ${roleKeys.length ? sec('sb-f-role', `Role details: ${esc(RN.fields.catLabel(op.catKey))}`, 'Shown in the Operating range section of your profile.',
            roleKeys.map((k) => RN.w.field(k, roleValue(op, k), { name: 'rf_' + k, id: 'sb-rf-' + k })).join('')) : ''}
          ${sec('sb-f-tags', 'Fit tags', `${op.tags.length} on your profile. Up to ${RN.fields.fitTags.max} self-claimed tags; verified tags don’t count toward the limit.`,
            `<div class="sb-curtags"><span class="label">On your profile</span><div class="opc-tags">${op.tags.slice().sort((a, b) => (a.tier === 'claimed') - (b.tier === 'claimed')).map((t) => RN.ui.ftag(t)).join('')}</div></div>`
            + RN.w.field('fitTags', e.addTags || [], { name: 'addTags', id: 'sb-addtags', max: room || 1, cat: op.catKey, label: 'Add fit tags', help: room ? `Room for ${room} more. Each new tag starts as claimed and turns Verified when a client review confirms it.` : 'You are at the limit. Ask clients to verify tags to free up room.' }))}
          <div class="sb-savebar"><span class="small muted" data-dirty>Changes go live on your profile when you save.</span><a class="btn btn-line btn-sm" href="#op.${esc(op.slug)}">Preview as client</a><button type="submit" class="btn btn-sm">Save changes</button></div>
        </form>
        <aside class="sb-rail" id="sb-rail" aria-label="Profile strength and availability">${railHtml(op)}</aside>
      </div>
    </div>`;
  }

  function rateContext(op) {
    const idx = RN.data.market.rateIndex.byCat[op.catKey];
    if (!idx) return '';
    const r = op.rate;
    const pos = r ? RN.clamp(((r - idx.p25) / (idx.p75 - idx.p25)) * 50 + 25, 2, 98) : null;
    return `<div class="sb-rateidx"><span class="label">Rate Index · ${esc(RN.fields.catLabel(op.catKey))}</span>
      <div class="sb-rateidx-bar" aria-hidden="true"><i class="sb-iqr"></i>${pos != null ? `<b style="left:${pos}%"></b>` : ''}</div>
      <div class="sb-rateidx-l tiny muted tnum"><span>p25 $${idx.p25}</span><span>Median $${idx.p50}</span><span>p75 $${idx.p75}</span></div>
      <p class="tiny muted">${r ? `$${r}/hr sits ${r > idx.p75 ? 'above the 75th percentile' : r > idx.p50 ? 'between the median and 75th percentile' : r >= idx.p25 ? 'between the 25th percentile and the median' : 'below the 25th percentile'} for ${esc(RN.fields.catLabel(op.catKey))} (n=${idx.n}, illustrative).` : 'No rate listed. Clients who filter by budget won’t see you.'} <a class="link" href="#rates">Rate Index</a></p></div>`;
  }

  function railHtml(op) {
    const list = RN.model.checklist(op);
    const done = list.filter((x) => x.done), todo = list.filter((x) => !x.done);
    const target = { headline: 'sb-f-about', bio: 'sb-f-about', rate: 'sb-f-avail', avail: 'sb-f-avail', ranges: 'sb-f-fit', industries: 'sb-f-fit', role: 'sb-f-role', tags: 'sb-f-tags' };
    const cred = { verified: 1, reviews: 1, engagements: 1 };
    const a = alerts();
    const e = edits(op);
    const conf = e.availConfirmedAt;
    const availOk = (list.find((x) => x.k === 'avail') || {}).done;
    return `<section class="card sb-strength" aria-labelledby="sb-str-h">
        <div class="sb-strength-top">
          <div class="sb-ring sb-ring-sm">${RN.chart.ring(op.completeness, { size: 72, stroke: 7, label: `Profile ${op.completeness}% complete` })}<b class="num">${op.completeness}%</b></div>
          <div><h3 id="sb-str-h" class="h5">Profile strength</h3><p class="small muted">${done.length} of ${list.length} done. Complete profiles rank higher and get invited first.</p></div>
        </div>
        ${todo.length ? `<ul class="sb-check-list">${todo.map((x) => `<li>
            ${target[x.k] ? `<button type="button" class="sb-check-item" data-act="sb-scroll" data-target="${target[x.k]}" data-focus="1">` : cred[x.k] ? `<a class="sb-check-item" href="#studio.credibility">` : '<div class="sb-check-item is-static">'}
              <i class="sb-box" aria-hidden="true"></i><span><b>${esc(x.l)}</b><em>${esc(x.gain)}</em></span>${target[x.k] || cred[x.k] ? icon('chev-right') : ''}
            ${target[x.k] ? '</button>' : cred[x.k] ? '</a>' : '</div>'}</li>`).join('')}</ul>` : `<p class="sb-caught">${icon('check-circle')}Everything on the list is done.</p>`}
        ${done.length ? `<details class="sb-done"><summary>${done.length} done${icon('chev-down')}</summary><ul>${done.map((x) => `<li>${icon('check')}${esc(x.l)}</li>`).join('')}</ul></details>` : ''}
      </section>
      <section class="card sb-alerts" aria-labelledby="sb-al-h">
        <h3 id="sb-al-h" class="h5">Availability and alerts</h3>
        <div class="sb-now">
          <span class="row-nw" style="--gap:8px">${RN.ui.avail(op, { hours: false })}</span>
          <span class="small muted">${op.avail.startDate ? 'Next start ' + esc(RN.fmt.dateShort(op.avail.startDate + 'T12:00:00')) + ' · ' : ''}${op.avail.hoursCode ? esc(RN.w.label('hoursPerMonth', op.avail.hoursCode)) : ''}</span>
          <span class="small sb-conf ${conf ? '' : availOk ? 'is-quiet' : 'is-stale'}" data-confirmed>${conf ? `${icon('check-circle')}Confirmed ${(RN.now() - new Date(conf)) < 864e5 ? 'today' : esc(RN.fmt.dateShort(conf))}` : availOk ? `${icon('info')}Start date is current. Confirm to show clients.` : `${icon('info')}Not confirmed in the last 30 days`}</span>
        </div>
        <button type="button" class="btn btn-line btn-sm btn-block" data-act="sb-avail-confirm">${icon('check')}I’m still available</button>
        <p class="tiny muted">Clients see when you last confirmed. One tap keeps it current.</p>
        <div class="sb-alert-row"><span class="field-label">New matching projects</span>
          <div class="seg" role="group" aria-label="New matching projects">${[['instant', 'Instant'], ['daily', 'Daily digest'], ['off', 'Off']].map(([k, l]) => `<button type="button" aria-pressed="${a.projects === k}" data-act="sb-alert" data-k="projects" data-v="${k}">${l}</button>`).join('')}</div></div>
        <label class="switch sb-alert-row"><input type="checkbox" data-change="sb-alert-weekly" ${a.weekly ? 'checked' : ''}><i></i><span>Weekly visibility digest<br><span class="tiny muted">Searches you appeared in and who viewed you.</span></span></label>
      </section>`;
  }
  function refreshRail() { const el = document.getElementById('sb-rail'); const op = RN.myOp(); if (el && op) el.innerHTML = railHtml(applyExtras(op)); }

  RN.inputs['sb-prof-dirty'] = (el) => {
    const bar = el.closest('.sb-profile') && el.closest('.sb-profile').querySelector('[data-dirty]');
    if (bar) { bar.textContent = 'Unsaved changes'; bar.classList.add('is-dirty'); }
  };
  RN.actions['sb-avail-confirm'] = () => {
    const op = RN.myOp();
    const today = todayISO();
    const cur = op.avail.startDate;
    const start = cur && cur >= today ? cur : today;
    RN.store.update((s) => { s.edits[op.id] = Object.assign({}, s.edits[op.id], { startDate: start, availConfirmedAt: RN.now().toISOString() }); }, 'edits');
    RN.model.applyEdits();
    const input = document.querySelector('#sb-prof-form [name="startDate"]');
    if (input && input.value < today) input.value = start;
    refreshRail();
    RN.ui.toast('Availability confirmed. Clients see it was updated today.');
  };
  RN.actions['sb-alert'] = (el) => {
    setSeen('alerts', (a) => { a[el.dataset.k] = el.dataset.v; });
    RN.$$(`[data-act="sb-alert"][data-k="${el.dataset.k}"]`).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === el.dataset.v));
    RN.ui.toast({ instant: 'You get an email the moment a matching project is posted.', daily: 'Matching projects arrive in one daily digest.', off: 'Project alerts are off. Invites still reach your Inbox.' }[el.dataset.v], { icon: 'mail' });
  };
  RN.inputs['sb-alert-weekly'] = (el) => {
    setSeen('alerts', (a) => { a.weekly = el.checked; });
    RN.ui.toast(el.checked ? 'Weekly visibility digest on.' : 'Weekly visibility digest off.', { icon: 'mail' });
  };

  RN.submits['sb-prof-save'] = (form, d) => {
    const op = RN.myOp();
    const prev = edits(op);
    const num = (v) => (v === '' || v == null ? null : +v);
    if (d.rate && +d.rate < RN.fields.rate.min) { RN.ui.toast(`Hourly rate starts at $${RN.fields.rate.min}.`, { icon: 'info' }); return; }
    if (d.newClientCapacity && (+d.newClientCapacity < 1 || +d.newClientCapacity > 10)) { RN.ui.toast('New client capacity is 1 to 10 clients.', { icon: 'info' }); return; }
    const roleFields = {};
    (RN.fields.roleFields[op.catKey] || []).filter((k) => !SHOWN_ELSEWHERE.includes(k)).forEach((k) => {
      const t = RN.fields[k].type;
      const v = d['rf_' + k];
      roleFields[k] = t === 'number' || t === 'money' ? num(v) : t === 'multi' ? v || [] : v || '';
    });
    const next = {
      headline: (d.headline || '').trim(), bio: (d.bio || '').trim(), rate: num(d.rate),
      availKey: d.availability || op.avail.key, startDate: d.startDate || null, hoursCode: d.hoursPerMonth || null,
      newClientCapacity: num(d.newClientCapacity), engagementTypes: d.engagementTypes || [],
      revenueRanges: d.revenueRange || [], employeeRanges: d.employeeRange || [], industries: d.industries || [],
      motions: d.salesMotions || [], crm: d.crm || '', methodologies: d.methodologies || [],
      addTags: d.addTags || [], roleFields,
    };
    // Tags removed from the "Add fit tags" picker come off the profile (only never-verified ones)
    const dropped = (prev.addTags || []).filter((t) => !next.addTags.includes(t));
    if (dropped.length) op.tags = op.tags.filter((t) => !(dropped.includes(t.t) && t.tier === 'claimed' && !t.r));
    RN.store.update((s) => { s.edits[op.id] = Object.assign({}, s.edits[op.id], next); }, 'edits');
    RN.model.applyEdits();
    applyExtras(op);
    RN.ui.toast('Profile saved. Clients see the changes now.', { action: { label: 'Preview as client', act: 'go', attrs: `data-to="op.${esc(op.slug)}"` }, ms: 5000 });
    RN.rerender();
  };

  /* ======================================================================
     Register tabs
     ====================================================================== */
  RN.studio.tab('inbox', { label: 'Inbox', icon: 'inbox', group: 'Work', order: 5, badge: (op) => inboxBadge(op), render: (op) => renderInbox(op) });
  RN.studio.tab('credibility', { label: 'Credibility', icon: 'shield', group: 'Grow', order: 6, render: (op) => renderCredibility(op) });
  RN.studio.tab('opportunities', { label: 'Opportunities', icon: 'target', group: 'Work', order: 7, badge: () => 0, render: (op) => renderOpps(op) });
  RN.studio.tab('profile', { label: 'Edit profile', icon: 'edit', group: 'Grow', order: 8, render: (op) => renderProfile(op) });

  // Hand-off helpers other surfaces can reuse
  RN.studioB = { openReviewRequest, openProofModal, inboxBadge, projStage };
})();
