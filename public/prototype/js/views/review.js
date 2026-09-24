/* Client CORE review (#review.<requestId>). Reviewers arrive from an email link, so no login is needed.
   Three short steps: 1 The engagement, 2 CORE ratings, 3 Focus areas and outcomes. Progress is saved per request.
   Submit pushes to RN.store.state.reviews (the profile shape: reviewer, role, company, date, overall, core, hireAgain,
   tags, quote, plus outcomes and engagement details), marks the request Completed, verifies confirmed focus areas
   through RN.model.applyEdits (4.0+ CORE average) and emails the operator and the reviewer.
   Draft storage: RN.store.state.seen.reviewDrafts[requestId]. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;

  const st = () => RN.store.state;
  const findRR = (id) => st().reviewRequests.find((r) => r.id === id);
  const DIMS = () => RN.fields.coreDims.options;
  const STAR_WORDS = ['Poor', 'Below expectations', 'Solid', 'Very good', 'Exceptional'];
  const STEPS = [
    { n: 1, l: 'The engagement' },
    { n: 2, l: 'CORE ratings' },
    { n: 3, l: 'Focus areas and outcomes' },
  ];
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3Z"/></svg>';

  const drafts = {};   // requestId -> {step, d}
  const results = {};  // requestId -> what the submission changed (for the thank-you state)

  /* ---------- Draft ---------- */
  function engagementFor(rr, op) {
    const co = String((rr.reviewer && rr.reviewer.company) || rr.engagement || '').toLowerCase();
    return (op.engagements || []).find((e) => String(e.company).toLowerCase() === co) || null;
  }
  function getDraft(rr, op) {
    if (drafts[rr.id]) return drafts[rr.id];
    const saved = (st().seen.reviewDrafts || {})[rr.id];
    if (saved) return (drafts[rr.id] = JSON.parse(JSON.stringify(saved)));
    const eng = engagementFor(rr, op);
    const buyer = RN.personas.buyer;
    const isBuyer = rr.reviewer && buyer && rr.reviewer.email === buyer.email;
    const intro = rr.introId ? st().intros.find((i) => i.id === rr.introId) : null;
    const d = {
      name: rr.reviewer.name || '', title: rr.reviewer.title || '', company: rr.reviewer.company || rr.engagement || '',
      roleCategory: op.catKey, opTitle: op.role, opTitleOther: '',
      start: eng ? eng.start : intro && intro.hiredAt ? String(intro.hiredAt).slice(0, 7) : '',
      end: eng ? eng.end : '', ongoing: !eng && !!intro,
      engagementType: intro && intro.fields && intro.fields.engagementType ? intro.fields.engagementType : eng && /interim/i.test(eng.role) ? 'interim' : 'fractional',
      monthlySpend: '', investment: intro && intro.fields && intro.fields.projectBudget ? intro.fields.projectBudget : '',
      employeeRange: isBuyer ? buyer.company.employeeRange : '', revenueRange: isBuyer ? buyer.company.revenueRange : '',
      overall: '', hireAgain: '', tags: [], addTags: [], techStack: [],
      o1: '', o1r: '', o2: '', o2r: '', o3: '', o3r: '',
    };
    DIMS().forEach((x) => { d['core_' + x.v] = ''; d['note_' + x.v] = ''; });
    return (drafts[rr.id] = { step: 1, d });
  }
  function persist(rr, dr) {
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen); s.seen.reviewDrafts = Object.assign({}, s.seen.reviewDrafts, { [rr.id]: dr }); }, 'seen');
  }
  // Merge a step's form values into the draft (checkbox arrays become booleans).
  function merge(dr, form) {
    const data = RN.ui.formData(form);
    if (form.dataset.step === '1') data.ongoing = Array.isArray(data.ongoing) && data.ongoing.length > 0;
    Object.assign(dr.d, data);
  }
  const coreVals = (d) => DIMS().map((x) => +d['core_' + x.v] || 0);
  const coreAvg = (d) => { const v = coreVals(d).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const monthLabel = (ym) => { if (!ym) return ''; const [y, m] = String(ym).split('-'); return new Date(+y, (+m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

  /* ---------- View ---------- */
  RN.view('review', {
    route: 'review.:id', chrome: 'solid', footer: false, nav: '',
    samples: { id: 'rr-seed-3' },
    title: (p) => { const rr = findRR(p.id); const op = rr && RN.model.byId(rr.opId); return op ? `Review ${op.name}` : 'Client review'; },
    render: (p) => {
      const rr = findRR(p.id);
      const op = rr && RN.model.byId(rr.opId);
      if (!rr || !op) return expired();
      if (rr.status === 'completed') return done(rr, op);
      return form(rr, op);
    },
    mount: (root, p) => {
      // Enter in a single-line field never submits a step early. In the focus-area search it adds the top match.
      root.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || ['checkbox', 'radio'].includes(e.target.type)) return;
        if (!e.target.closest('.rv-form')) return;
        e.preventDefault();
        if (e.target.closest('.tagpick-search')) {
          const box = e.target.closest('.tagpick');
          const first = box.querySelector('.tagpick-group [data-act="w-tag-add"]') || box.querySelector('.tagpick-list [data-act="w-tag-add"]');
          if (first) first.click();
        }
      });
      const f = root.querySelector('.rv-form');
      if (f) { updateLive(f); }
    },
  });

  /* ---------- Expired / unknown link ---------- */
  function expired() {
    return `<div class="rv wrap-narrow">
      <div class="rv-expired card">
        <span class="rv-seal is-muted">${icon('link')}</span>
        <span class="eyebrow">Client review</span>
        <h1 class="h2">This review link is no longer active</h1>
        <p class="lede">Review links work once and expire after 30 days. Ask the operator who sent it for a new link, or tell our team and we will send one.</p>
        <div class="row rv-cta"><a class="btn" href="#talk">Talk to us</a><a class="btn btn-line" href="#browse">Browse operators</a></div>
        <p class="small muted">Questions about reviews? Call +1 203-200-0482.</p>
      </div>
    </div>`;
  }

  /* ---------- Header + stepper ---------- */
  function header(rr, op, step) {
    const eng = engagementFor(rr, op);
    const first = RN.fmt.first(rr.reviewer.name) || 'there';
    const co = rr.reviewer.company || rr.engagement || 'your company';
    return `<header class="rv-hd">
      <div class="rv-who">${RN.ui.avatar(op, 'ava-md')}<div><b class="serif-up">${esc(op.name)}</b><span class="small muted">Fractional ${esc(op.role)}${eng ? ` at ${esc(eng.company)} · ${esc(monthLabel(eng.start))} to ${esc(monthLabel(eng.end))}` : ''}</span></div></div>
      <span class="eyebrow">CORE client review</span>
      <h1 class="h1">How was working with <span class="serif">${esc(op.first)}</span>?</h1>
      <p class="lede">${rr.source === 'client' ? `${esc(first)}, your review of ${esc(op.first)}’s work at ${esc(co)} helps the next company hire well.` : `${esc(first)}, ${esc(op.first)} asked for your review of the ${esc(co)} engagement.`} Three short steps, about four minutes. It publishes on ${esc(op.first)}’s profile with your name, title and company.</p>
    </header>
    <ol class="rv-steps" aria-label="Review progress">${STEPS.map((s) => {
      const cls = s.n < step ? 'done' : s.n === step ? 'cur' : '';
      return `<li class="${cls}" ${s.n === step ? 'aria-current="step"' : ''}>
        <button type="button" data-act="rv-goto" data-id="${esc(rr.id)}" data-step="${s.n}" ${s.n < step ? '' : 'disabled'}>
          <i>${s.n < step ? icon('check') : s.n}</i><span><small>Step ${s.n} of 3</small>${esc(s.l)}</span>
        </button></li>`;
    }).join('')}</ol>`;
  }

  /* ---------- The form (one step at a time) ---------- */
  function form(rr, op) {
    const dr = getDraft(rr, op);
    const step = dr.step;
    const body = step === 1 ? step1(rr, op, dr.d) : step === 2 ? step2(rr, op, dr.d) : step3(rr, op, dr.d);
    return `<div class="rv wrap-narrow">
      ${header(rr, op, step)}
      <form class="card rv-form" data-submit="rv-next" data-id="${esc(rr.id)}" data-step="${step}" data-change="rv-live" data-input="rv-typing" novalidate>
        ${body}
        <div class="rv-foot">
          ${step > 1 ? `<button type="button" class="btn btn-line" data-act="rv-back" data-id="${esc(rr.id)}">${icon('arrow-left')}Back</button>` : `<span class="small muted rv-save-note">${icon('check-circle')}Progress saves at each step</span>`}
          <button type="submit" class="btn ${step === 3 ? 'btn-lg' : ''}">${step === 3 ? 'Submit review' : 'Continue'}${step === 3 ? '' : icon('arrow')}</button>
        </div>
      </form>
      <p class="rv-fine small muted">${icon('shield')}<span>Reviews publish right away and Revenue Nomad never edits them. ${esc(op.first)} sees your review, not your spend. Spend is used anonymously in the Rate Index.</span></p>
    </div>`;
  }

  function sec(title, sub, inner) {
    return `<section class="rv-sec"><div class="rv-sec-hd"><h2 class="h4">${title}</h2>${sub ? `<p class="small muted">${sub}</p>` : ''}</div>${inner}</section>`;
  }

  function titleControl(cat, v, other) {
    const list = (RN.fields.rolesByCat[cat] || []);
    const isOther = v === '__other' || (v && !list.includes(v));
    return `<select class="select" id="rv-title" name="opTitle">
        ${list.map((t) => `<option value="${esc(t)}" ${t === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        <option value="__other" ${isOther ? 'selected' : ''}>Other</option>
      </select>
      <input class="input" name="opTitleOther" id="rv-title-other" maxlength="80" placeholder="Title at the time" value="${esc(isOther ? (other || (v !== '__other' ? v : '')) : '')}" ${isOther ? '' : 'hidden'} aria-label="Other title">`;
  }

  function step1(rr, op, d) {
    const project = d.engagementType === 'project';
    const now = RN.now();
    const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const co = esc(d.company || 'your company');
    return `${sec('You', 'Shown on the review as your name, title and company.', `
      <div class="grid g-3 rv-g">
        <div class="field" data-rv-f="name"><label for="rv-name">Your name</label><input class="input" id="rv-name" name="name" value="${esc(d.name)}" autocomplete="name" maxlength="80"></div>
        <div class="field" data-rv-f="title"><label for="rv-rtitle">Your title</label><input class="input" id="rv-rtitle" name="title" value="${esc(d.title)}" autocomplete="organization-title" maxlength="80"></div>
        <div class="field" data-rv-f="company"><label for="rv-co">Company</label><input class="input" id="rv-co" name="company" value="${esc(d.company)}" autocomplete="organization" maxlength="80"></div>
      </div>`)}
    ${sec('The engagement', `What ${esc(op.first)} did for ${co}. ${rr.source === 'client' ? 'We prefilled what we know from your intro request.' : `We prefilled what ${esc(op.first)} listed.`} Correct anything that is off.`, `
      <div class="stack" style="--gap:24px">
        <div data-rv-f="roleCategory">${RN.w.field('roleCategory', d.roleCategory, { name: 'roleCategory', label: 'Functional role delivered', help: '' })}</div>
        <div class="field" data-rv-f="opTitle"><label for="rv-title">${esc(op.first)}’s title at the time</label>${titleControl(d.roleCategory, d.opTitle, d.opTitleOther)}</div>
        <div class="rv-dates">
          <div class="grid g-2 rv-g">
            <div class="field" data-rv-f="start"><label for="rv-start">Start</label><input class="input" type="month" id="rv-start" name="start" value="${esc(d.start)}" max="${maxMonth}"></div>
            <div class="field" data-rv-f="end"><label for="rv-end">End</label><input class="input" type="month" id="rv-end" name="end" value="${esc(d.ongoing ? '' : d.end)}" max="${maxMonth}" ${d.ongoing ? 'disabled' : ''}></div>
          </div>
          <label class="switch rv-ongoing"><input type="checkbox" name="ongoing" value="1" ${d.ongoing ? 'checked' : ''}><i></i>Engagement is ongoing</label>
        </div>
        <div data-rv-f="engagementType">${RN.w.field('engagementType', d.engagementType, { name: 'engagementType', help: '' })}</div>
        <div class="field" data-rv-spend="retainer" ${project ? 'hidden' : ''}><label for="rv-spend">Average monthly spend <span class="opt">Optional</span></label>${RN.w.control('projectBudget', d.monthlySpend, { name: 'monthlySpend', id: 'rv-spend', placeholder: 'e.g. 12000' })}<p class="help">What ${co} paid per month, in USD.</p></div>
        <div class="field" data-rv-spend="project" ${project ? '' : 'hidden'}><label for="rv-inv">Project investment <span class="opt">Optional</span></label>${RN.w.control('projectBudget', d.investment, { name: 'investment', id: 'rv-inv', placeholder: 'e.g. 24000' })}<p class="help">Total fixed fee for the project, in USD.</p></div>
        <div data-rv-f="employeeRange">${RN.w.field('companyEmployees', d.employeeRange, { name: 'employeeRange', help: `${d.company ? esc(d.company) + '’s' : 'Your company’s'} headcount during the engagement. The same ranges operators use, so this proves company-size fit.` })}</div>
        <div data-rv-f="revenueRange">${RN.w.field('companyRevenue', d.revenueRange, { name: 'revenueRange', help: 'Annual revenue during the engagement. It verifies the revenue stages this operator has worked at.' })}</div>
      </div>`)}`;
  }

  function stars(k, label, v) {
    return `<fieldset class="rv-stars" data-v="${esc(v || '')}" data-rv-f="core_${esc(k)}">
      <legend class="sr-only">${esc(label)} rating, 1 to 5 stars</legend>
      ${[1, 2, 3, 4, 5].map((n) => `<label class="rv-star" title="${n} of 5: ${STAR_WORDS[n - 1]}"><input type="radio" class="sr-only" name="core_${esc(k)}" value="${n}" ${+v === n ? 'checked' : ''} data-change="rv-star"><span class="sr-only">${n} star${n > 1 ? 's' : ''}, ${STAR_WORDS[n - 1]}</span>${STAR}</label>`).join('')}
      <span class="rv-star-l" aria-hidden="true">${v ? `<b>${v} of 5</b> ${STAR_WORDS[v - 1]}` : 'Tap a star'}</span>
    </fieldset>`;
  }

  function step2(rr, op, d) {
    return `${sec('CORE ratings', `CORE is how Revenue Nomad measures operators: four behaviours, rated 1 to 5 by the clients who worked with them. Say why if you can. Your reasons are the most useful part for the next company.`, `
      <div class="rv-core-list">${DIMS().map((x) => `<div class="rv-core">
        <span class="rv-letter" aria-hidden="true">${esc(x.v)}</span>
        <div class="rv-core-b">
          <div class="rv-core-hd"><h3 class="h5">${esc(x.l)}</h3><span class="tiny muted">${esc(x.d)}</span></div>
          <p class="rv-q">${esc(x.q)}</p>
          ${stars(x.v, x.l, d['core_' + x.v])}
          <div class="field rv-reason"><label class="sr-only" for="rv-note-${esc(x.v)}">Why this score for ${esc(x.l)}</label>
            <textarea class="textarea" id="rv-note-${esc(x.v)}" name="note_${esc(x.v)}" maxlength="600" rows="2" placeholder="Why this score? Optional. An example helps most.">${esc(d['note_' + x.v] || '')}</textarea></div>
        </div>
      </div>`).join('')}</div>
      <div class="rv-avg" data-rv-avg>${avgHtml(d)}</div>`)}
    ${sec('Overall', '', `<div class="stack" style="--gap:24px">
      <div data-rv-f="overall">${RN.w.field('overallExperience', d.overall, { name: 'overall', id: 'rv-overall', help: `Shown as your quote on ${esc(op.first)}’s profile. Specifics help: the problem, what changed, how it felt to work together.` })}<span class="tiny faint rv-count" data-rv-count>${(d.overall || '').length} / 1,200</span></div>
      <div data-rv-f="hireAgain">${RN.w.field('hireAgain', d.hireAgain, { name: 'hireAgain', label: `Would you hire ${op.first} again?` })}</div>
    </div>`)}`;
  }
  function avgHtml(d) {
    const vals = coreVals(d);
    const n = vals.filter(Boolean).length;
    const avg = coreAvg(d);
    return `<span class="label">CORE average</span><b class="num">${n ? fmt1(avg) : '–'}</b><span class="small muted">${n === 4 ? (avg >= 4 ? 'At 4.0 or higher, each focus area you confirm next becomes verified.' : 'Focus areas you confirm are recorded. They verify on reviews averaging 4.0 or higher.') : `${4 - n} of 4 still to rate`}</span>`;
  }

  function step3(rr, op, d) {
    const tags = op.tags.slice().sort((a, b) => a.t.localeCompare(b.t));
    const outs = [1, 2, 3];
    const shown = (n) => n === 1 || d['o' + n] || d['o' + n + 'r'];
    const avg = coreAvg(d);
    return `${sec('Focus areas', `Which of these did you see ${esc(op.first)} deliver at ${esc(d.company || 'your company')}? Pick only what you saw first-hand.`, `
      <div class="chipset rv-tags" role="group" aria-label="${esc(op.first)}’s focus areas" data-rv-f="tags">
        ${tags.map((t) => `<button type="button" class="chip" aria-pressed="${(d.tags || []).includes(t.t)}" data-act="w-chip" data-name="tags" data-v="${esc(t.t)}" data-multi="1">${icon('check')}${esc(t.t)}</button>`).join('')}
        <input type="hidden" name="tags" value="${esc((d.tags || []).join('|'))}" data-multi="1">
      </div>
      <p class="rv-tagnote small" data-rv-tagnote>${tagNote(d, op, avg)}</p>
      <details class="rv-more" ${(d.addTags || []).length ? 'open' : ''}>
        <summary>${icon('plus')}Add a focus area ${esc(op.first)} delivered that is not listed${icon('chev-down')}</summary>
        <div class="rv-more-b">${RN.w.tagPicker('addTags', d.addTags || [], { client: true, max: 5, cat: op.catKey, emptyText: 'None added. Search the library below.' })}</div>
      </details>`)}
    ${sec('Outcomes', `One to three results ${esc(op.first)} was responsible for, and how each landed.`, `
      <div class="stack rv-outs" style="--gap:14px" data-rv-f="outcomes">${outs.map((n) => `<div class="rv-out" data-out="${n}" ${shown(n) ? '' : 'hidden'}>
        <div class="rv-out-hd">
          <span class="rv-out-n" aria-hidden="true">${n}</span>
          <label class="sr-only" for="rv-o${n}">Outcome ${n}</label>
          <input class="input" id="rv-o${n}" name="o${n}" maxlength="140" value="${esc(d['o' + n] || '')}" placeholder="${esc(['e.g. Hired and ramped two AEs in 90 days', 'e.g. Rebuilt the forecast the board now uses', 'e.g. Cut sales cycle from 90 to 60 days'][n - 1])}">
          ${n > 1 ? `<button type="button" class="x-btn rv-out-x" data-act="rv-out-remove" data-n="${n}" aria-label="Remove outcome ${n}">${icon('x')}</button>` : ''}
        </div>
        <div class="rv-out-r"><span class="label">Result</span>${RN.w.control('outcomeRating', d['o' + n + 'r'], { name: 'o' + n + 'r', id: 'rv-o' + n + 'r' })}</div>
      </div>`).join('')}</div>
      <button type="button" class="act rv-out-add" data-act="rv-out-add" ${outs.every(shown) ? 'hidden' : ''}>${icon('plus')}Add another outcome</button>`)}
    <details class="rv-more rv-stack" ${(d.techStack || []).length ? 'open' : ''}>
      <summary>${icon('layers')}Tools ${esc(op.first)} used <span class="opt">Optional</span>${icon('chev-down')}</summary>
      <div class="rv-more-b">${RN.w.field('techStack', d.techStack || [], { name: 'techStack', label: 'Tech stack', help: 'Leave empty if you are not sure.' })}</div>
    </details>
    <section class="rv-preview" aria-label="Preview" data-rv-preview>${previewHtml(rr, op, d)}</section>`;
  }
  function tagNote(d, op, avg) {
    const n = (d.tags || []).length + (d.addTags || []).length;
    const verb = avg >= 4 ? 'verified' : 'recorded';
    return n ? `${icon('seal')}<span><b>${n} focus area${n === 1 ? '' : 's'}</b> will be ${verb} on ${esc(op.first)}’s profile${avg >= 4 ? ', with your company as the source' : '. They verify on reviews averaging 4.0 or higher'}.</span>`
      : avg >= 4 ? `${icon('info')}<span>None picked yet. Each one you confirm turns a claimed focus area into a verified one.</span>`
      : `${icon('info')}<span>None picked yet. Focus areas you confirm are recorded on the review. They verify on reviews averaging 4.0 or higher.</span>`;
  }
  function previewHtml(rr, op, d) {
    const avg = coreAvg(d);
    const n = (d.tags || []).length + (d.addTags || []).length;
    const q = (d.overall || '').trim();
    return `<span class="label">How your review will appear</span>
      <div class="rv-pv">
        <div class="rv-pv-hd"><div><b class="serif-up">${esc(d.name || 'Your name')}</b><span class="small muted">${esc([d.title, d.company].filter(Boolean).join(', '))} · ${esc(RN.fmt.date(RN.now()))}</span></div>
          <div class="rv-pv-score"><b class="num">${avg ? fmt1(avg) : '–'}</b>${RN.ui.stars(Math.round(avg * 10) / 10)}</div></div>
        ${q ? `<p class="rv-pv-q">“${esc(q.length > 220 ? q.slice(0, 217) + '…' : q)}”</p>` : ''}
        <div class="row" style="--gap:8px">
          <span class="pill pill-good">${icon('check-circle')}Verified client</span>
          ${d.hireAgain === 'yes' ? `<span class="pill pill-accent">${icon('check')}Would hire again</span>` : d.hireAgain === 'no' ? '<span class="pill">Would not hire again</span>' : ''}
          ${n ? `<span class="pill pill-line">${n} focus area${n === 1 ? '' : 's'} confirmed</span>` : ''}
        </div>
      </div>`;
  }

  /* ---------- Live updates inside the form ---------- */
  function updateLive(form) {
    const rr = findRR(form.dataset.id);
    const op = rr && RN.model.byId(rr.opId);
    if (!op) return;
    const dr = getDraft(rr, op);
    const d = Object.assign({}, dr.d, RN.ui.formData(form));
    const step = form.dataset.step;
    if (step === '2') { const a = form.querySelector('[data-rv-avg]'); if (a) a.innerHTML = avgHtml(d); }
    if (step === '3') {
      const avg = coreAvg(dr.d);
      const tn = form.querySelector('[data-rv-tagnote]'); if (tn) tn.innerHTML = tagNote(d, op, avg);
      const pv = form.querySelector('[data-rv-preview]'); if (pv) pv.innerHTML = previewHtml(rr, op, Object.assign({}, d, { overall: dr.d.overall, hireAgain: dr.d.hireAgain, name: dr.d.name, title: dr.d.title, company: dr.d.company }));
    }
  }
  RN.inputs['rv-live'] = (form, ev) => {
    const t = ev && ev.target;
    const name = t && t.name;
    if (name === 'roleCategory') {
      const box = form.querySelector('[data-rv-f="opTitle"]');
      const list = RN.fields.rolesByCat[t.value] || [];
      const rr = findRR(form.dataset.id);
      const op = rr && RN.model.byId(rr.opId);
      box.innerHTML = `<label for="rv-title">${esc(op ? op.first + '’s' : 'Operator')} title at the time</label>${titleControl(t.value, list[0] || '__other', '')}`;
    }
    if (name === 'opTitle') {
      const o = form.querySelector('#rv-title-other');
      o.hidden = t.value !== '__other';
      if (!o.hidden) o.focus();
    }
    if (name === 'ongoing') {
      const end = form.querySelector('#rv-end');
      end.disabled = t.checked;
      if (t.checked) end.value = '';
    }
    if (name === 'engagementType') {
      const project = t.value === 'project';
      form.querySelector('[data-rv-spend="retainer"]').hidden = project;
      form.querySelector('[data-rv-spend="project"]').hidden = !project;
    }
    if (t && t.closest && t.closest('[data-rv-f]')) clearErr(t.closest('[data-rv-f]'));
    updateLive(form);
  };
  RN.inputs['rv-typing'] = (form, ev) => {
    const t = ev && ev.target;
    if (t && t.name === 'overall') { const c = form.querySelector('[data-rv-count]'); if (c) c.textContent = `${RN.fmt.int(t.value.length)} / 1,200`; }
    if (t && t.closest && t.closest('[data-rv-f]')) clearErr(t.closest('[data-rv-f]'));
    if (form.dataset.step === '3' && t && /^o\d$/.test(t.name)) clearErr(form.querySelector('[data-rv-f="outcomes"]'));
  };
  RN.inputs['rv-star'] = (el) => {
    const fs = el.closest('.rv-stars');
    const v = +el.value;
    fs.dataset.v = v;
    fs.querySelector('.rv-star-l').innerHTML = `<b>${v} of 5</b> ${STAR_WORDS[v - 1]}`;
    clearErr(fs);
    const form = el.closest('form');
    if (form) updateLive(form);
  };

  RN.actions['rv-out-add'] = (el) => {
    const form = el.closest('form');
    const next = RN.$$('.rv-out', form).find((r) => r.hidden);
    if (next) { next.hidden = false; next.querySelector('input.input').focus(); }
    el.hidden = !RN.$$('.rv-out', form).some((r) => r.hidden);
  };
  RN.actions['rv-out-remove'] = (el) => {
    const row = el.closest('.rv-out');
    const form = el.closest('form');
    row.querySelector('input.input').value = '';
    const hid = row.querySelector('input[type=hidden]');
    hid.value = '';
    RN.$$('[data-act="w-chip"]', row).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    row.hidden = true;
    form.querySelector('.rv-out-add').hidden = false;
    updateLive(form);
  };

  /* ---------- Validation ---------- */
  function clearErr(box) { if (!box) return; box.classList.remove('is-err'); RN.$$('.rv-err', box).forEach((e) => e.remove()); }
  function showErrs(form, errs) {
    RN.$$('[data-rv-f]', form).forEach(clearErr);
    errs.forEach((e) => {
      const box = form.querySelector(`[data-rv-f="${e.f}"]`);
      if (!box) return;
      box.classList.add('is-err');
      box.insertAdjacentHTML('beforeend', `<p class="rv-err" role="alert">${icon('info')}${esc(e.m)}</p>`);
    });
    const first = form.querySelector('.is-err');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const f = first.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button');
      if (f) setTimeout(() => f.focus({ preventScroll: true }), 250);
    }
    RN.ui.toast(errs.length === 1 ? errs[0].m : `${errs.length} answers still needed`, { icon: 'info' });
  }
  function validate(step, d, op) {
    const e = [];
    if (step === 1) {
      if (!(d.name || '').trim()) e.push({ f: 'name', m: 'Add your name.' });
      if (!(d.title || '').trim()) e.push({ f: 'title', m: 'Add your title.' });
      if (!(d.company || '').trim()) e.push({ f: 'company', m: 'Confirm the company.' });
      if (!d.roleCategory) e.push({ f: 'roleCategory', m: 'Pick the role delivered.' });
      if (d.opTitle === '__other' && !(d.opTitleOther || '').trim()) e.push({ f: 'opTitle', m: `Add ${op.first}’s title.` });
      if (!d.start) e.push({ f: 'start', m: 'Add the start month.' });
      if (!d.ongoing && !d.end) e.push({ f: 'end', m: 'Add the end month, or mark it ongoing.' });
      if (d.start && !d.ongoing && d.end && d.end < d.start) e.push({ f: 'end', m: 'The end month is before the start.' });
      if (!d.engagementType) e.push({ f: 'engagementType', m: 'Pick the engagement type.' });
      if (!d.employeeRange) e.push({ f: 'employeeRange', m: 'Pick the employee range.' });
      if (!d.revenueRange) e.push({ f: 'revenueRange', m: 'Pick the revenue range.' });
    }
    if (step === 2) {
      DIMS().forEach((x) => { if (!+d['core_' + x.v]) e.push({ f: 'core_' + x.v, m: `Rate ${x.l} from 1 to 5.` }); });
      if (!(d.overall || '').trim()) e.push({ f: 'overall', m: 'Describe the overall experience in a sentence or two.' });
      if (!d.hireAgain) e.push({ f: 'hireAgain', m: `Tell us if you would hire ${op.first} again.` });
    }
    if (step === 3) {
      const outs = [1, 2, 3].map((n) => ({ t: (d['o' + n] || '').trim(), r: d['o' + n + 'r'] }));
      if (outs.some((o) => (o.t && !o.r) || (!o.t && o.r))) e.push({ f: 'outcomes', m: 'Each outcome needs a short description and a result.' });
      else if (!outs.some((o) => o.t && o.r)) e.push({ f: 'outcomes', m: 'Add at least one outcome and how it landed.' });
    }
    return e;
  }

  /* ---------- Navigation between steps ---------- */
  function ctx(el) {
    const rr = findRR(el.dataset.id);
    const op = rr && RN.model.byId(rr.opId);
    return rr && op ? { rr, op, dr: getDraft(rr, op) } : null;
  }
  RN.actions['rv-back'] = (el) => {
    const c = ctx(el); if (!c) return;
    merge(c.dr, el.closest('form'));
    c.dr.step = Math.max(1, c.dr.step - 1);
    persist(c.rr, c.dr);
    RN.render();
  };
  RN.actions['rv-goto'] = (el) => {
    const c = ctx(el); if (!c) return;
    const to = +el.dataset.step;
    if (to >= c.dr.step) return;
    const f = RN.$('.rv-form');
    if (f) merge(c.dr, f);
    c.dr.step = to;
    persist(c.rr, c.dr);
    RN.render();
  };
  RN.submits['rv-next'] = (form) => {
    const c = ctx(form); if (!c) return;
    merge(c.dr, form);
    const errs = validate(c.dr.step, c.dr.d, c.op);
    if (errs.length) { showErrs(form, errs); return; }
    if (c.dr.step < 3) { c.dr.step += 1; persist(c.rr, c.dr); RN.render(); return; }
    submit(c.rr, c.op, c.dr.d);
  };

  /* ---------- Submit ---------- */
  function submit(rr, op, d) {
    const dims = DIMS();
    const core = coreVals(d);
    const avg = coreAvg(d);
    const seenT = new Set();
    const tags = [].concat(d.tags || [], d.addTags || []).map((t) => String(t).trim()).filter((t) => { const k = t.toLowerCase(); if (!t || seenT.has(k)) return false; seenT.add(k); return true; });
    const outcomes = [1, 2, 3].map((n) => ({ text: (d['o' + n] || '').trim(), rating: d['o' + n + 'r'] })).filter((o) => o.text && o.rating);
    const before = { score: op.ris.score, label: op.ris.label, verified: new Set(op.tags.filter((t) => t.tier !== 'claimed').map((t) => t.t.toLowerCase())), reviews: op.reviews.length };
    const nowIso = RN.now().toISOString();
    const review = {
      id: RN.uid('rev'), opId: op.id, requestId: rr.id,
      reviewer: d.name.trim(), reviewerEmail: rr.reviewer.email, role: d.title.trim(), company: d.company.trim(),
      date: nowIso.slice(0, 10),
      overall: Math.round(avg * 10) / 10, coreAvg: Math.round(avg * 100) / 100, core,
      notes: dims.map((x) => (d['note_' + x.v] || '').trim()),
      quote: d.overall.trim(), hireAgain: d.hireAgain === 'yes',
      tags, outcomes,
      techStack: d.techStack || [],
      engagement: {
        roleCategory: d.roleCategory, title: d.opTitle === '__other' ? (d.opTitleOther || '').trim() : d.opTitle,
        start: d.start, end: d.ongoing ? '' : d.end, ongoing: !!d.ongoing, engagementType: d.engagementType,
        monthlySpend: d.engagementType === 'project' ? null : +d.monthlySpend || null,
        investment: d.engagementType === 'project' ? +d.investment || null : null,
        employeeRange: d.employeeRange, revenueRange: d.revenueRange,
      },
      verifiedClient: true,
    };
    RN.store.update((s) => {
      s.reviews.unshift(review);
      const r = s.reviewRequests.find((x) => x.id === rr.id);
      r.status = 'completed'; r.completedAt = nowIso; r.reviewId = review.id;
      if (s.seen.reviewDrafts) { s.seen = Object.assign({}, s.seen); s.seen.reviewDrafts = Object.assign({}, s.seen.reviewDrafts); delete s.seen.reviewDrafts[rr.id]; }
    }, 'reviews');
    delete drafts[rr.id];
    RN.model.applyEdits();
    // Workaround (core model): a tag first added by a review under 4.0 gets no tier/score. Keep it "claimed".
    op.tags.forEach((t) => { if (!t.tier) { t.tier = RN.model.tagTier(t.r || 0); t.score = RN.model.tagScore(t.r || 0); } });
    const good = avg >= 4;
    const newlyVerified = good ? tags.filter((t) => !before.verified.has(t.toLowerCase())) : [];
    results[rr.id] = { before, after: { score: op.ris.score, label: op.ris.label }, newlyVerified, tags, avg, core, good };
    RN.track('review_submit', { opId: op.id, meta: { requestId: rr.id, coreAvg: review.coreAvg, tags: tags.length } });
    const coreLine = dims.map((x, i) => `${x.l} ${core[i]}`).join(' · ');
    RN.mail(op.name, `${review.reviewer} completed your review`,
      `${review.reviewer}, ${review.role} at ${review.company}, rated you ${fmt1(avg)} on CORE (${coreLine}) and ${review.hireAgain ? 'would hire you again' : 'would not hire you again'}.\n` +
      `${good && tags.length ? `Verified focus areas: ${tags.join(', ')}.\n` : tags.length ? `Confirmed focus areas: ${tags.join(', ')}.\n` : ''}` +
      `It is live on your profile now. Reputation Index: ${before.score} to ${op.ris.score}.`, 'review');
    RN.mail(rr.reviewer.email, `Thank you for reviewing ${op.first}`,
      `Your review of ${op.name} is live on ${op.first}’s profile. ${good && tags.length ? `It verified ${tags.length} focus area${tags.length === 1 ? '' : 's'} and adds` : 'It adds'} to ${op.first}’s CORE score, which helps the next company hire with confidence.\n\nHiring again? Every profile on Revenue Nomad is open, with verified reviews like yours.`, 'review');
    RN.render();
  }

  /* ---------- Thank-you / already completed ---------- */
  function done(rr, op) {
    const res = results[rr.id];
    const rv = st().reviews.find((r) => r.id === rr.reviewId) || null;
    const first = RN.fmt.first(rr.reviewer.name);
    const similar = RN.model.similar(op, 3);
    const isBuyer = st().persona === 'buyer';
    const dims = DIMS();
    if (!res) {
      return `<div class="rv wrap-narrow rv-done">
        <div class="rv-done-hd"><span class="rv-seal">${icon('check-circle')}</span>
          <span class="eyebrow">Review completed</span>
          <h1 class="h2">You already reviewed <span class="serif">${esc(op.first)}</span>. Thank you.</h1>
          <p class="lede">${rv ? `Submitted ${esc(RN.fmt.date(rr.completedAt))}. It is live on ${esc(op.first)}’s profile.` : `This review was submitted${rr.completedAt ? ' on ' + esc(RN.fmt.date(rr.completedAt)) : ''}. Review links work once.`}</p>
          <div class="row rv-cta"><a class="btn" href="#op.${esc(op.slug)}">See ${esc(op.first)}’s profile</a>${isBuyer ? '<a class="btn btn-line" href="#buyer">Back to your workspace</a>' : '<a class="btn btn-line" href="#browse">Browse operators</a>'}</div>
        </div>
        ${similarHtml(op, similar)}
      </div>`;
    }
    const delta = res.after.score - res.before.score;
    const shownTags = res.tags;
    const fresh = res.newlyVerified.length;
    return `<div class="rv wrap-narrow rv-done">
      <div class="rv-done-hd"><span class="rv-seal">${icon('check-circle')}</span>
        <span class="eyebrow">Review published</span>
        <h1 class="h1">Thank you, <span class="serif">${esc(first || 'there')}</span>.</h1>
        <p class="lede">Your review is live on ${esc(op.first)}’s profile. Here is what it changed.</p>
      </div>
      <div class="rv-impact">
        <section class="card rv-imp">
          <span class="rv-imp-ic">${icon('seal')}</span>
          <b class="num">${res.tags.length}</b>
          <span class="rv-imp-l">${res.good ? `focus area${res.tags.length === 1 ? '' : 's'} verified by you` : `focus area${res.tags.length === 1 ? '' : 's'} recorded`}</span>
          ${shownTags.length ? `<div class="opc-tags">${shownTags.slice(0, 8).map((t) => RN.ui.ftag({ t, tier: res.good ? 'verified' : 'claimed' })).join('')}${shownTags.length > 8 ? `<span class="ftag more">+${shownTags.length - 8} more</span>` : ''}</div>` : ''}
          <p class="small muted">${!res.tags.length ? 'No focus areas confirmed. Your ratings and quote still count toward CORE.' : res.good ? `${fresh ? `${fresh} ${fresh === 1 ? 'was' : 'were'} only claimed until now. ` : ''}Each one now carries one more client verification, and verified focus areas rank first in search.` : 'Focus areas verify on reviews with a CORE average of 4.0 or higher.'}</p>
        </section>
        <section class="card rv-imp">
          <span class="rv-imp-ic">${icon('radar')}</span>
          <b class="num">${fmt1(res.avg)}</b>
          <span class="rv-imp-l">added to ${esc(op.first)}’s CORE score</span>
          <div class="rv-bars">${dims.map((x, i) => `<div class="rv-bar"><span class="rv-bar-k">${esc(x.v)}</span><span class="rv-bar-l">${esc(x.l)}</span><span class="meter"><i style="width:${((res.core[i] - 1) / 4) * 100}%"></i></span><b>${res.core[i]}</b></div>`).join('')}</div>
        </section>
        <section class="card rv-imp">
          <span class="rv-imp-ic">${icon('trend-up')}</span>
          <b class="num">${res.after.score}</b>
          <span class="rv-imp-l">Reputation Index, ${esc(res.after.label)}</span>
          ${gainMeter(res)}
          <p class="small muted">${delta > 0 ? `Up ${delta} from ${res.before.score}. Review volume and strong ratings are two of the five factors.` : 'Review volume and strong ratings are two of the five factors in the score.'}</p>
        </section>
      </div>
      <div class="row rv-cta"><a class="btn" href="#op.${esc(op.slug)}">See ${esc(op.first)}’s profile${icon('arrow')}</a>${isBuyer ? '<a class="btn btn-line" href="#buyer">Back to your workspace</a>' : '<a class="btn btn-line" href="#browse">Browse operators</a>'}</div>
      ${similarHtml(op, similar)}
    </div>`;
  }
  // Reputation Index on its 50 to 100 range: the earlier score, this review's gain, and the next tier.
  function gainMeter(res) {
    const pos = (v) => RN.clamp((v - 50) / 50, 0, 1) * 100;
    const b = pos(res.before.score), a = pos(res.after.score);
    const next = RN.fields.risTier.options.slice().reverse().find((t) => t.min > res.after.score);
    return `<div class="rv-gain" aria-hidden="true"><span class="rv-gain-bar"><i style="width:${b.toFixed(1)}%"></i><i class="is-gain" style="left:${b.toFixed(1)}%;width:${Math.max(0, a - b).toFixed(1)}%"></i></span>
      <span class="rv-gain-l"><span>50</span><span>${next ? `${next.min - res.after.score} to ${esc(next.l)}` : 'Top tier'}</span><span>100</span></span></div>`;
  }
  function similarHtml(op, list) {
    if (!list.length) return '';
    return `<section class="rv-similar">
      <div class="rv-similar-hd"><div><span class="eyebrow">Hiring again?</span><h2 class="h3">Operators like ${esc(op.first)}</h2></div><a class="act" href="#browse.${esc(op.catKey)}">More in ${esc(RN.fields.catLabel(op.catKey))}${icon('arrow')}</a></div>
      <div class="grid g-3">${list.map((o) => RN.ui.opCard(o, { compact: true })).join('')}</div>
    </section>`;
  }
})();
