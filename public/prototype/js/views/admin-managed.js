/* Admin › Managed engagements (#admin.managed): the team opens an engagement on a company's behalf when the company
   comes to us directly (website form, an email, a referral, outbound, a returning company or a partner firm's brief),
   then runs it the way the founder does by hand today:
     Scoping call → Plan sent → Sourcing → Shortlist sent → Interviews → Contracting → Live → Closed.
   One brief feeds every email the process needs (operator pitch, shortlist with why and gaps, "X, meet Y" intro,
   plan summary), so nothing is rewritten four times. Each candidate carries a status and a decline reason, so the
   pipeline is not tracked in email threads. Pasting the first email fills the brief.
   Store: state.managed [{id, sample?, source, partner, company{}, contact{}, role{}, stage, stageAt{}, candidates[],
   contracts{}, checkins{}, notes[], createdAt, updatedAt}]. Admin only; companies never see this or any fee. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const AM = (RN.admManaged = {});
  const DAY = 864e5;
  const st = () => RN.store.state;
  const nowIso = () => RN.now().toISOString();
  const days = (iso) => Math.max(0, Math.round((RN.now().getTime() - new Date(iso).getTime()) / DAY));
  const lab = (k, v) => (v ? RN.w.label(k, v) || v : '');
  const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';

  const SOURCES = [['inbound', 'Website or form'], ['email', 'Emailed us'], ['referral', 'Referral'], ['outbound', 'Outbound'], ['returning', 'Returning company'], ['partner', 'Partner firm']];
  const STAGES = [
    { k: 'scoping', l: 'Scoping call', next: 'Book a 30-minute call with the decision maker: team, revenue, what is broken, who they want.', due: 2 },
    { k: 'plan', l: 'Plan sent', next: 'Send the plan (scope, hours, monthly price) and pre-book the call to review it.', due: 2 },
    { k: 'sourcing', l: 'Sourcing', next: 'Pitch the seat to matching operators. Aim for three interested who fit on hours, rate and travel.', due: 5 },
    { k: 'shortlist', l: 'Shortlist sent', next: 'Send two or three profiles, each with why you picked them and the honest gaps.', due: 3 },
    { k: 'interviews', l: 'Interviews', next: 'Introduce each pick, book the interviews and chase whichever side goes quiet.', due: 7 },
    { k: 'contracting', l: 'Contracting', next: 'Company agreement plus a matching operator agreement, same hours, term and start date.', due: 2 },
    { k: 'live', l: 'Live', next: 'Check in with the decision maker at week 1 and week 2. Ask the operator to finish their profile.', due: 14 },
    { k: 'closed', l: 'Closed', next: '', due: 0 },
  ];
  const stageIx = (k) => Math.max(0, STAGES.findIndex((s) => s.k === k));
  const CAND = [['contacted', 'Contacted'], ['interested', 'Interested'], ['declined', 'Declined'], ['sent', 'Sent to company'], ['interviewing', 'Interviewing'], ['selected', 'Selected'], ['not_selected', 'Not selected']];
  const DECLINE = [['rate', 'Rate'], ['availability', 'Availability'], ['full_time', 'Took a full-time role'], ['travel', 'Travel or onsite'], ['fit', 'Not the right fit'], ['no_reply', 'No reply']];
  const candLabel = (k) => (CAND.find((x) => x[0] === k) || [k, k])[1];
  const usd = (n) => (n ? '$' + RN.fmt.int(Math.round(n)) : '');

  let openId = null, docTab = 'pitch', introPick = '';
  const list = () => (st().managed || []);
  const get = (id) => list().find((x) => x.id === id);
  const update = (id, fn) => RN.store.update((s) => { const x = (s.managed || []).find((y) => y.id === id); if (x) { fn(x); x.updatedAt = nowIso(); } }, 'managed');
  AM.dueCount = () => list().filter((m) => m.stage !== 'closed' && overdue(m)).length;
  function overdue(m) { const s = STAGES[stageIx(m.stage)]; return s.due && days((m.stageAt || {})[m.stage] || m.createdAt) > s.due; }

  /* ---------- Sample engagements: fictional companies, shaped like the founder's real direct, returning and partner deals ---------- */
  function seed() {
    if (Array.isArray(st().managed)) return;
    const ago = (d) => new Date(RN.now().getTime() - d * DAY).toISOString();
    // Fictional sample operators first, then the rest of the category, so every sample has a full bench
    const pool = RN.model.ops.filter((o) => !o.hidden && !o.isMatt).sort((a, b) => (b.sample ? 1 : 0) - (a.sample ? 1 : 0));
    const pick = (cat, n, skip) => pool.filter((o) => o.catKey === cat).slice(skip || 0, (skip || 0) + n).map((o) => o.id);
    const sl = pick('sales_leadership', 4), ro = pick('revenue_operations', 3), en = pick('sales_enablement', 1).concat(pick('sales_leadership', 1, 4));
    const c = (opId, status, d, extra) => Object.assign({ opId, status, ts: ago(d) }, extra || {});
    const recs = [
      { id: 'mg-sample-1', sample: true, source: 'referral', partner: '', createdAt: ago(16),
        company: { name: 'Harborline PT Marketing', website: 'harborlinept.example', industry: 'Marketing Agency', revenueRange: '5m_20m', employeeRange: '51_200', ownership: 'founder' },
        contact: { name: 'Dana Whitlock', title: 'CEO', email: 'dana@harborlinept.example' },
        role: { roleCategory: 'sales_leadership', title: 'Fractional VP of Sales', problem: 'Founder still closes most deals. Growing from about $9M toward $15M in three years needs a repeatable sales process and a coached team.', mustHave: 'Agency or services sales, has managed 5+ sellers', notFit: 'Pure enterprise SaaS background', engagementType: 'fractional', hoursPerMonth: '40', term: '3_6', startBy: 'available_2_weeks', onsite: 'Remote, one onsite day a quarter', budget: 7500 },
        stage: 'interviews', stageAt: { scoping: ago(16), plan: ago(14), sourcing: ago(14), shortlist: ago(11), interviews: ago(9) },
        candidates: sl.slice(0, 3).map((id, i) => c(id, i === 0 ? 'interviewing' : i === 1 ? 'interviewing' : 'sent', 9 - i)).concat(sl.slice(3, 4).map((id) => c(id, 'declined', 12, { reason: 'full_time' }))),
        contracts: {}, checkins: {}, notes: [{ ts: ago(16), text: 'Referred by their website agency. Scoping call booked same day.' }] },
      { id: 'mg-sample-2', sample: true, source: 'returning', partner: '', createdAt: ago(5),
        company: { name: 'Ridgeway Freight', website: 'ridgewayfreight.example', industry: 'Freight & Trucking', revenueRange: '20m_50m', employeeRange: '51_200', ownership: 'founder' },
        contact: { name: 'Luis Ortega', title: 'CEO', email: 'luis@ridgewayfreight.example' },
        role: { roleCategory: 'sales_enablement', title: 'Fractional sales coach', problem: 'One new rep needs weekly coaching on the sales process we built last year.', mustHave: 'Has coached transportation or logistics sellers', notFit: '', engagementType: 'fractional', hoursPerMonth: '19', term: '1_3', startBy: 'available_now', onsite: '', budget: 1500 },
        stage: 'shortlist', stageAt: { scoping: ago(5), plan: ago(4), sourcing: ago(4), shortlist: ago(1) },
        candidates: en.slice(0, 1).map((id) => c(id, 'sent', 1)), contracts: {}, checkins: {}, notes: [{ ts: ago(5), text: 'Came back after a check-in lunch. Same team, new rep.' }] },
      { id: 'mg-sample-3', sample: true, source: 'partner', partner: 'Summit GTM Partners', createdAt: ago(8),
        company: { name: 'Clearwell Dental Software', website: 'clearwelldental.example', industry: 'Health Care', revenueRange: '20m_50m', employeeRange: '201_500', ownership: 'pe' },
        contact: { name: 'Priya Natarajan', title: 'Operations lead, Summit GTM Partners', email: 'priya@summitgtm.example' },
        role: { roleCategory: 'revenue_operations', title: 'Fractional Director of RevOps', problem: '60-day assessment of the revenue engine before the next board meeting.', mustHave: 'Salesforce, PE-backed software', notFit: 'Needs full-time', engagementType: 'project', hoursPerMonth: '20', term: '1_3', startBy: 'available_2_weeks', onsite: 'Onsite every other week', budget: 9000 },
        stage: 'sourcing', stageAt: { scoping: ago(8), plan: ago(8), sourcing: ago(7) },
        candidates: ro.map((id, i) => c(id, ['interested', 'declined', 'contacted'][i], 6 - i, i === 1 ? { reason: 'travel' } : {})),
        contracts: {}, checkins: {}, notes: [{ ts: ago(8), text: 'Brief from the partner firm with a fixed budget. Travel added later.' }] },
    ];
    recs.forEach((r) => { r.updatedAt = r.createdAt; });
    st().managed = recs;
    RN.store.save();
  }

  /* ---------- Paste an email: fill what it says, list what to still ask ---------- */
  AM.parse = function (text) {
    const t = String(text || '');
    const out = { company: {}, contact: {}, role: {} };
    const u = RN.model.understand ? RN.model.understand(t) : null;
    if (u) u.facts.forEach((f) => {
      const v = [].concat(f.v)[0];
      if (f.k === 'roleCategories') out.role.roleCategory = v;
      if (f.k === 'revenueRange') out.company.revenueRange = v;
      if (f.k === 'employeeRange') out.company.employeeRange = v;
      if (f.k === 'industries') out.company.industry = v;
    });
    let m;
    if ((m = t.match(/(\d{1,3})\s*(?:hrs?|hours)\s*(?:\/|per|a|each)?\s*(?:mo|month)/i))) { const h = +m[1]; out.role.hoursPerMonth = h < 20 ? '19' : String([20, 40, 60, 80, 100, 160].reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a))); }
    if ((m = t.match(/\$\s?([\d,.]+)\s*(k)?\s*(?:\/|per|a)\s*(?:mo|month)/i))) out.role.budget = Math.round(parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
    if ((m = t.match(/(\d{1,2})[-\s]?(?:month|mo)\b/i)) && !/per|\/|a month/i.test(t.slice(Math.max(0, m.index - 6), m.index))) { const n = +m[1]; out.role.term = n <= 3 ? '1_3' : n <= 6 ? '3_6' : n <= 12 ? '6_12' : '12_plus'; }
    if (/\b(asap|immediately|right away|this week|next week)\b/i.test(t)) out.role.startBy = 'available_now';
    else if (/\bin (two|2) weeks\b/i.test(t)) out.role.startBy = 'available_2_weeks';
    if ((m = t.match(/[^.\n]*\b(on-?site|in person|travel)\b[^.\n]*/i))) out.role.onsite = m[0].trim().slice(0, 120);
    if (/\b(interim)\b/i.test(t)) out.role.engagementType = 'interim';
    else if (/\b(project|assessment|audit)\b/i.test(t)) out.role.engagementType = 'project';
    else if (/\bfractional\b/i.test(t)) out.role.engagementType = 'fractional';
    if ((m = t.match(/\b(fractional|interim)\s+((?:head|vp|director|cro|cmo|coo|chief|sales|revops|marketing|of|\s)+?)(?=[,.\n]|\s(?:to|for|who|that|with)\b)/i))) out.role.title = (m[1] + ' ' + m[2]).replace(/\s+/g, ' ').replace(/\b(vp|cro|cmo|coo)\b/gi, (x) => (x.toLowerCase() === 'vp' ? 'VP' : x.toUpperCase())).replace(/^./, (x) => x.toUpperCase()).trim();
    if ((m = t.match(/[\w.+-]+@([\w-]+)\.[\w.]+/))) {
      out.contact.email = m[0];
      if (!/^(gmail|yahoo|outlook|hotmail|icloud|aol)$/i.test(m[1])) { out.company.website = m[0].split('@')[1]; out.company.name = m[1].replace(/[-_]/g, ' ').replace(/\b\w+/g, (w) => (w.length <= 3 && /^(hr|ai|io|rx|pt|gtm|crm|it|hq)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))); }
    }
    if ((m = t.match(/^(?:From:\s*)?([A-Z][a-z]+ [A-Z][a-z]+)\s*(?:<|,\s*(CEO|Founder|COO|President|CRO|Owner))/m))) { out.contact.name = m[1]; if (m[2]) out.contact.title = m[2]; }
    if ((m = t.match(/\b(CEO|Founder|COO|President|Owner)\b/))) out.contact.title = out.contact.title || m[1];
    if (/\bprivate equity|PE[- ]backed|portfolio company\b/i.test(t)) out.company.ownership = 'pe';
    else if (/\bfounder[- ]led|our founder|I founded\b/i.test(t)) out.company.ownership = 'founder';
    if (/\breferr(ed|al)\b/i.test(t)) out.source = 'referral';
    const sentences = t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/).filter((x) => /\b(need|help|struggl|broken|not working|looking for|want|grow|close|pipeline|churn|process)\b/i.test(x));
    if (sentences.length) out.role.problem = sentences.slice(0, 3).join(' ').slice(0, 420);
    return out;
  };
  const MISSING = [['role.hoursPerMonth', 'Hours a month'], ['role.budget', 'Monthly budget'], ['role.startBy', 'Start date'], ['role.onsite', 'Onsite or travel'], ['company.revenueRange', 'Revenue'], ['contact.email', 'Decision maker email'], ['role.mustHave', 'Must-haves']];
  const pathGet = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
  const missing = (m) => MISSING.filter(([p]) => !pathGet(m, p)).map((x) => x[1]);

  /* ---------- Open / edit form ---------- */
  function formHtml(m) {
    m = m || { source: 'email', company: {}, contact: {}, role: { engagementType: 'fractional' } };
    const c = m.company || {}, k = m.contact || {}, r = m.role || {};
    const inp = (name, label, val, ph, type) => `<div class="field"><label for="mg-${name}">${esc(label)}</label><input class="input" id="mg-${name}" name="${name}" type="${type || 'text'}" value="${esc(val || '')}" placeholder="${esc(ph || '')}"></div>`;
    const area = (name, label, val, ph) => `<div class="field"><label for="mg-${name}">${esc(label)}</label><textarea class="textarea" id="mg-${name}" name="${name}" rows="3" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea></div>`;
    const chips = (name, opts, val) => `<div class="mg-chips" role="radiogroup">${opts.map(([v, l]) => `<label class="mg-chip"><input type="radio" name="${name}" value="${v}" ${val === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
    return `<form id="mg-form" class="mg-form" data-submit="mg-save" data-id="${esc(m.id || '')}">
      ${m.id ? '' : `<div class="mg-paste">
        <label class="mg-paste-l" for="mg-paste">${icon('message')}<b>Paste the email or your call notes</b><span>We fill in what it says and list what to still ask.</span></label>
        <textarea class="textarea" id="mg-paste" rows="4" placeholder="Hi Matt, we're a $9M PT marketing agency and I still close most deals. Looking for a fractional VP of Sales, about 30 hours a month, $7,500 a month, start in two weeks..."></textarea>
        <div class="row" style="--gap:10px"><button type="button" class="btn btn-sm" data-act="mg-fill">${icon('check')}Fill the brief</button><span class="tiny muted" data-mg-filled></span></div>
      </div>`}
      <fieldset class="mg-fs"><legend>Where it came from</legend>
        ${chips('source', SOURCES, m.source)}
        <div data-mg-partner ${m.source === 'partner' ? '' : 'hidden'}>${inp('partner', 'Partner firm', m.partner, 'The firm that sent the brief')}</div>
      </fieldset>
      <fieldset class="mg-fs"><legend>Company</legend>
        <div class="grid g-2" style="--gap:14px">${inp('co_name', 'Company name', c.name, 'Company')}${inp('co_web', 'Website', c.website, 'company.com')}</div>
        <div class="grid g-2" style="--gap:14px">${RN.w.field('industry', c.industry, { name: 'co_industry', compact: true })}<div class="field"><label>Ownership</label>${chips('co_owner', [['founder', 'Founder-led'], ['pe', 'PE-backed'], ['public', 'Public']], c.ownership)}</div></div>
        ${RN.w.field('companyRevenue', c.revenueRange, { name: 'co_rev', compact: true })}
        ${RN.w.field('companyEmployees', c.employeeRange, { name: 'co_emp', compact: true })}
      </fieldset>
      <fieldset class="mg-fs"><legend>Decision maker</legend>
        <div class="grid g-3" style="--gap:14px">${inp('ct_name', 'Name', k.name)}${inp('ct_title', 'Title', k.title, 'CEO')}${inp('ct_email', 'Email', k.email, 'name@company.com', 'email')}</div>
      </fieldset>
      <fieldset class="mg-fs"><legend>The seat</legend>
        ${RN.w.field('roleCategory', r.roleCategory, { name: 'rl_cat', compact: true })}
        ${inp('rl_title', 'Role title', r.title, 'Fractional VP of Sales')}
        ${area('rl_problem', 'What is broken', r.problem, 'In their words: the problem, the number, the deadline.')}
        <div class="grid g-2" style="--gap:14px">${area('rl_must', 'Must-haves', r.mustHave, 'Industry, team size, tools')}${area('rl_not', 'Not a fit', r.notFit, 'Who to skip')}</div>
        ${RN.w.field('engagementType', r.engagementType || 'fractional', { name: 'rl_type', compact: true })}
        ${RN.w.field('hoursPerMonth', r.hoursPerMonth, { name: 'rl_hours', compact: true, label: 'Hours a month' })}
        <div class="grid g-2" style="--gap:14px">${RN.w.field('term', r.term, { name: 'rl_term', compact: true })}${RN.w.field('startBy', r.startBy, { name: 'rl_start', compact: true })}</div>
        <div class="grid g-2" style="--gap:14px">${inp('rl_onsite', 'Onsite or travel', r.onsite, 'Remote, or onsite every other week')}${inp('rl_budget', 'Monthly budget ($)', r.budget, '7500', 'number')}</div>
      </fieldset>
    </form>`;
  }
  function openForm(m) {
    RN.ui.modal({
      width: 760,
      title: m ? `Edit the brief: ${esc(m.company.name || 'engagement')}` : 'Open an engagement',
      sub: m ? 'Changes flow into every email this engagement writes.' : 'For a company that came to us directly. Only the team sees this.',
      body: formHtml(m),
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="mg-form">${m ? 'Save brief' : `${icon('plus')}Open engagement`}</button>`,
    });
  }
  RN.actions['mg-open'] = () => openForm(null);
  RN.actions['mg-edit'] = (el) => openForm(get(el.dataset.id));
  document.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'source' && e.target.closest('#mg-form')) { const p = document.querySelector('[data-mg-partner]'); if (p) p.hidden = e.target.value !== 'partner'; }
  });
  // Set a value in the open form, whatever control the field uses (text, select, radio chips, widget chips)
  function setVal(form, name, v) {
    if (v == null || v === '') return;
    const els = form.querySelectorAll(`[name="${name}"]`);
    if (!els.length) return;
    const e0 = els[0];
    if (e0.type === 'radio' || e0.type === 'checkbox') { els.forEach((x) => { x.checked = x.value === String(v); x.dispatchEvent(new Event('change', { bubbles: true })); }); return; }
    if (e0.tagName === 'SELECT' || e0.type !== 'hidden') { e0.value = v; e0.dispatchEvent(new Event('input', { bubbles: true })); e0.dispatchEvent(new Event('change', { bubbles: true })); return; }
    e0.value = v;
    // widget chip groups keep a hidden input; press the matching chip so it shows
    const grp = e0.closest('.field');
    if (grp) grp.querySelectorAll('[data-v],[data-value]').forEach((b) => { const on = (b.dataset.v || b.dataset.value) === String(v); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); });
  }
  RN.actions['mg-fill'] = () => {
    const form = document.getElementById('mg-form');
    const text = (document.getElementById('mg-paste') || {}).value || '';
    if (!form || !text.trim()) { RN.ui.toast('Paste the email or your notes first.', { icon: 'info' }); return; }
    const p = AM.parse(text);
    const map = { source: p.source, co_name: p.company.name, co_web: p.company.website, co_industry: p.company.industry, co_owner: p.company.ownership, co_rev: p.company.revenueRange, co_emp: p.company.employeeRange,
      ct_name: p.contact.name, ct_title: p.contact.title, ct_email: p.contact.email, rl_cat: p.role.roleCategory, rl_title: p.role.title, rl_problem: p.role.problem, rl_type: p.role.engagementType,
      rl_hours: p.role.hoursPerMonth, rl_term: p.role.term, rl_start: p.role.startBy, rl_onsite: p.role.onsite, rl_budget: p.role.budget };
    let n = 0;
    Object.keys(map).forEach((k) => { if (map[k] != null && map[k] !== '') { setVal(form, k, map[k]); n++; } });
    const note = form.querySelector('[data-mg-filled]');
    const ask = missing(p).filter((x) => x !== 'Must-haves');
    if (note) note.textContent = `Filled ${n} ${n === 1 ? 'field' : 'fields'}.${ask.length ? ' Still to ask: ' + ask.join(', ') + '.' : ''}`;
  };
  RN.submits['mg-save'] = (form, d) => {
    if (!String(d.co_name || '').trim()) { RN.ui.toast('Add the company name.', { icon: 'info' }); return; }
    const rec = {
      source: d.source || 'email', partner: d.source === 'partner' ? (d.partner || '').trim() : '',
      company: { name: d.co_name.trim(), website: (d.co_web || '').trim(), industry: d.co_industry || '', revenueRange: d.co_rev || '', employeeRange: d.co_emp || '', ownership: d.co_owner || '' },
      contact: { name: (d.ct_name || '').trim(), title: (d.ct_title || '').trim(), email: (d.ct_email || '').trim() },
      role: { roleCategory: d.rl_cat || '', title: (d.rl_title || '').trim() || (d.rl_cat ? 'Fractional ' + RN.fields.catLabel(d.rl_cat) : 'Fractional operator'), problem: (d.rl_problem || '').trim(), mustHave: (d.rl_must || '').trim(), notFit: (d.rl_not || '').trim(),
        engagementType: d.rl_type || 'fractional', hoursPerMonth: d.rl_hours || '', term: d.rl_term || '', startBy: d.rl_start || '', onsite: (d.rl_onsite || '').trim(), budget: +d.rl_budget || null },
    };
    const id = form.dataset.id;
    if (id) { update(id, (x) => { Object.assign(x, rec); }); RN.ui.closeModal(); RN.ui.toast('Brief saved'); RN.rerender(); return; }
    const now = nowIso();
    const m = Object.assign({ id: RN.uid('mg'), stage: 'scoping', stageAt: { scoping: now }, candidates: [], contracts: {}, checkins: {}, notes: [], createdAt: now, updatedAt: now }, rec);
    RN.store.update((s) => { s.managed = [m].concat(s.managed || []); }, 'managed');
    RN.track('managed_open', { meta: { source: m.source, roleCategory: m.role.roleCategory } });
    RN.ui.closeModal();
    openId = m.id;
    if (location.hash === '#admin.managed') RN.rerender(); else RN.go('admin.managed');
    RN.ui.toast(`Engagement opened for ${esc(m.company.name)}. Next: book the scoping call.`, { icon: 'check-circle' });
  };

  /* ---------- Matching, and the four emails written from one brief ---------- */
  const brief = (m) => ({ roleCategory: m.role.roleCategory, revenueRange: m.company.revenueRange, employeeRange: m.company.employeeRange, industries: m.company.industry ? [m.company.industry] : [], engagementType: m.role.engagementType });
  function matches(m, n) {
    const have = new Set(m.candidates.map((c) => c.opId));
    return RN.model.rank(brief(m), { limit: 60 }).filter((r) => !r.op.hidden && !have.has(r.op.id)).slice(0, n || 8);
  }
  const fitOf = (m, op) => RN.model.fit(op, brief(m));
  const scope = (m) => [lab('engagementType', m.role.engagementType), m.role.hoursPerMonth && lab('hoursPerMonth', m.role.hoursPerMonth), m.role.term && lab('term', m.role.term), m.role.startBy && 'start ' + lab('startBy', m.role.startBy).toLowerCase(), m.role.onsite].filter(Boolean).join(' · ');
  const blindCo = (m) => [lab('industry', m.company.industry), m.company.revenueRange && lab('companyRevenue', m.company.revenueRange) + ' revenue', m.company.ownership === 'pe' ? 'PE-backed' : m.company.ownership === 'founder' ? 'founder-led' : ''].filter(Boolean).join(', ');
  function docs(m) {
    const r = m.role, co = m.company, k = m.contact;
    const shown = m.candidates.filter((c) => ['interested', 'sent', 'interviewing', 'selected'].includes(c.status)).map((c) => RN.model.byId(c.opId)).filter(Boolean).slice(0, 3);
    const pickOp = RN.model.byId(introPick) || RN.model.byId((m.candidates.find((c) => c.status === 'selected') || m.candidates.find((c) => c.status === 'interviewing') || m.candidates.find((c) => c.status === 'sent') || {}).opId);
    const why = (op) => { const f = fitOf(m, op); const yes = f.signals.filter((s) => s.state === 'match').map((s) => s.text); const gap = f.signals.filter((s) => s.state !== 'match').map((s) => s.text); return { yes, gap }; };
    const pitch = `Subject: ${r.title} seat, ${blindCo(m) || 'B2B company'}\n\nHi {first name},\n\nI have a ${r.title.replace(/^(Fractional|Interim)\b/, (x) => x.toLowerCase())} seat that just opened up and you came to mind.\n\nThe company: ${blindCo(m) || 'a B2B company'}${co.employeeRange ? ', ' + lab('companyEmployees', co.employeeRange) + ' employees' : ''}.\nWhat is broken: ${r.problem || 'to confirm on our call'}\nScope: ${scope(m) || 'to confirm'}${r.budget ? `\nBudget: about ${usd(r.budget)} a month` : ''}\n${r.mustHave ? `Must-haves: ${r.mustHave}\n` : ''}\nBefore I put you forward, can you confirm:\n1. You have the hours each month and could start on time\n2. Your rate works inside that budget\n3. ${r.onsite ? 'The travel works for you' : 'You are not in a full-time role'}\n\nIf it's a fit I'll send your profile to the CEO today.\n\nMatt`;
    const shortlist = `Subject: ${shown.length ? RN.fmt.plural(shown.length, 'profile') : 'Profiles'} for the ${r.title} seat\n\nHi ${first(k.name)},\n\nAs promised, I only sent people I think would be a great fit for ${co.name}. Here ${shown.length === 1 ? 'is' : 'are'} ${shown.length || 'the'} ${shown.length === 1 ? 'profile' : 'profiles'}:\n\n${shown.length ? shown.map((op, i) => { const w = why(op); return `${i + 1}. ${op.name}, ${op.role} (${op.ris.label} ${op.ris.score})\n   Why I picked ${op.first}: ${w.yes.slice(0, 3).join('. ') || 'closest fit on the network for this seat'}.\n   Gaps to know: ${w.gap.slice(0, 2).join('. ') || 'none I see'}.\n   Availability: ${op.avail.label}.\n   Profile: revenuenomad.com/op/${op.slug}`; }).join('\n\n') : '(Mark candidates Interested or Sent to company to list them here.)'}\n\nWhich would you like to meet? I'll book the times.\n\nMatt`;
    const intro = pickOp ? `Subject: ${first(k.name)}, meet ${pickOp.first}\n\n${first(k.name)}, meet ${pickOp.first}. ${pickOp.first}, meet ${first(k.name)}.\n\n${first(k.name)} is ${k.title ? k.title + ' of ' : 'with '}${co.name}${r.problem ? ' and is looking for someone to help with this: ' + r.problem.charAt(0).toLowerCase() + r.problem.slice(1) : ''}\n\nWhy ${pickOp.first}:\n${why(pickOp).yes.slice(0, 5).map((x) => '- ' + x).join('\n') || '- ' + pickOp.role + ', ' + pickOp.ris.label + ' on Revenue Nomad'}\n\n${pickOp.first} has reviewed the scope, hours and rate. I'll let you two take it from here.\n\nMatt` : 'Pick an operator to introduce.';
    const plan = `${co.name}: plan for partnership\n\nThe seat: ${r.title}\nWhat we heard: ${r.problem || 'to confirm'}\nScope: ${scope(m) || 'to confirm'}${r.budget ? `\nInvestment: ${usd(r.budget)} a month` : ''}\n\nFirst 90 days\n1. Diagnose: pipeline, process and team\n2. Build the plan and the operating rhythm\n3. Fix the biggest gap first\n4. Coach the team against the new standard\n5. Hand over a machine that runs\n\nNext: I'll send two or three profiles, only people I think are a great fit.`;
    return { pitch, shortlist, intro, plan, shown, pickOp };
  }

  /* ---------- List ---------- */
  function stepper(m, small) {
    const at = stageIx(m.stage);
    return `<ol class="mg-steps${small ? ' is-sm' : ''}" aria-label="Stage: ${esc(STAGES[at].l)}">${STAGES.slice(0, 7).map((s, i) => `<li class="${i < at || m.stage === 'closed' ? 'done' : i === at ? 'cur' : ''}"${small ? '' : ` data-act="mg-stage" data-id="${esc(m.id)}" data-s="${s.k}" role="button" tabindex="0"`}><i></i><span>${esc(s.l)}</span></li>`).join('')}</ol>`;
  }
  const srcPill = (m) => `<span class="pill">${esc((SOURCES.find((s) => s[0] === m.source) || ['', 'Direct'])[1])}${m.partner ? ' · ' + esc(m.partner) : ''}</span>`;
  function counts(m) { const n = {}; m.candidates.forEach((c) => { n[c.status] = (n[c.status] || 0) + 1; }); return n; }
  function row(m) {
    const s = STAGES[stageIx(m.stage)];
    const n = counts(m);
    const late = m.stage !== 'closed' && overdue(m);
    return `<li><button type="button" class="mg-row${late ? ' is-late' : ''}" data-act="mg-view" data-id="${esc(m.id)}">
      <span class="mg-row-co"><b>${esc(m.company.name)}</b><span>${esc(m.role.title)}</span><span class="mg-row-src">${srcPill(m)}${m.sample ? '<span class="pill">Sample</span>' : ''}</span></span>
      ${stepper(m, true)}
      <span class="mg-row-n"><b class="num">${m.candidates.length}</b><span>${n.interested || 0} interested · ${(n.sent || 0) + (n.interviewing || 0) + (n.selected || 0)} with company</span></span>
      <span class="mg-row-due">${late ? `<span class="pill pill-bad">${icon('clock')}${days((m.stageAt || {})[m.stage] || m.createdAt)}d in ${esc(s.l.toLowerCase())}</span>` : `<span class="tiny muted">${esc(s.l)} · ${days((m.stageAt || {})[m.stage] || m.createdAt)}d</span>`}</span>
    </button></li>`;
  }
  AM.tab = function () {
    seed();
    if (openId && get(openId)) return detail(get(openId));
    openId = null;
    const all = list();
    const open = all.filter((m) => m.stage !== 'closed');
    const live = all.filter((m) => m.stage === 'live').length;
    const inInt = all.filter((m) => m.stage === 'interviews').length;
    const late = open.filter(overdue).length;
    return `<header class="app-head adm-head"><div class="grow"><span class="eyebrow">Revenue Nomad team</span><h1>Managed engagements</h1><p class="sub">Companies that came to us directly: a form, an email, a referral, outbound, a returning company or a partner firm. Only the team sees this.</p></div><div class="adm-head-act"><button type="button" class="btn" data-act="mg-open">${icon('plus')}Open an engagement</button></div></header>
      <div class="mg-kpis">
        <div><b class="num">${open.length}</b><span>Open</span></div>
        <div><b class="num">${inInt}</b><span>In interviews</span></div>
        <div><b class="num">${live}</b><span>Live</span></div>
        <div class="${late ? 'is-bad' : ''}"><b class="num">${late}</b><span>Past their next step</span></div>
      </div>
      ${all.length ? `<ul class="mg-list">${all.slice().sort((a, b) => (a.stage === 'closed') - (b.stage === 'closed') || overdue(b) - overdue(a) || new Date(b.updatedAt) - new Date(a.updatedAt)).map(row).join('')}</ul>`
        : RN.ui.empty({ icon: 'briefcase', title: 'No managed engagements yet', body: 'Open one when a company emails you, signs up on the site, comes back, or a partner firm sends a brief.', cta: `<button type="button" class="btn btn-sm" data-act="mg-open">${icon('plus')}Open an engagement</button>` })}`;
  };

  /* ---------- Detail ---------- */
  function briefCard(m) {
    const c = m.company, r = m.role, k = m.contact;
    const item = (l, v) => (v ? `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>` : '');
    const miss = missing(m);
    return `<section class="card mg-card"><div class="mg-card-hd"><h2 class="h5">Brief</h2><button type="button" class="act" data-act="mg-edit" data-id="${esc(m.id)}">${icon('edit')}Edit</button></div>
      ${r.problem ? `<p class="mg-problem">“${esc(r.problem)}”</p>` : ''}
      <dl class="mg-dl">
        ${item('Company', [c.name, lab('industry', c.industry), c.ownership === 'pe' ? 'PE-backed' : c.ownership === 'founder' ? 'Founder-led' : c.ownership === 'public' ? 'Public' : ''].filter(Boolean).join(' · '))}
        ${item('Size', [c.revenueRange && lab('companyRevenue', c.revenueRange) + ' revenue', c.employeeRange && lab('companyEmployees', c.employeeRange) + ' employees'].filter(Boolean).join(' · '))}
        ${item('Decision maker', [k.name, k.title].filter(Boolean).join(', '))}
        ${item('Seat', [r.title, r.roleCategory && RN.fields.catLabel(r.roleCategory)].filter(Boolean).join(' · '))}
        ${item('Scope', scope(m))}
        ${item('Budget', r.budget ? usd(r.budget) + ' a month' : '')}
        ${item('Must-haves', r.mustHave)}
        ${item('Not a fit', r.notFit)}
      </dl>
      ${miss.length ? `<div class="mg-miss"><span class="label">Still to ask</span>${miss.map((x) => `<span class="pill pill-warn">${esc(x)}</span>`).join('')}</div>` : ''}
    </section>`;
  }
  function candCard(m) {
    const n = counts(m);
    const funnel = [['contacted', 'Contacted'], ['interested', 'Interested'], ['sent', 'With company'], ['interviewing', 'Interviewing'], ['selected', 'Selected']];
    const total = Math.max(1, m.candidates.length);
    const reach = (k) => { const order = ['contacted', 'interested', 'sent', 'interviewing', 'selected']; const ix = order.indexOf(k); return m.candidates.filter((c) => order.indexOf(c.status) >= ix || (k === 'contacted')).length; };
    return `<section class="card mg-card"><div class="mg-card-hd"><h2 class="h5">Candidates</h2><button type="button" class="btn btn-sm" data-act="mg-add" data-id="${esc(m.id)}">${icon('plus')}Add operators</button></div>
      <div class="mg-funnel" aria-label="Candidate funnel">${funnel.map(([k, l]) => { const v = reach(k); return `<div><span class="mg-funnel-b"><i style="--h:${Math.round((v / total) * 100)}%"></i></span><b class="num">${v}</b><span>${l}</span></div>`; }).join('')}${n.declined ? `<div class="is-x"><span class="mg-funnel-b"><i style="--h:${Math.round((n.declined / total) * 100)}%"></i></span><b class="num">${n.declined}</b><span>Declined</span></div>` : ''}</div>
      ${m.candidates.length ? `<ul class="mg-cands">${m.candidates.map((c) => { const op = RN.model.byId(c.opId); if (!op) return ''; const f = fitOf(m, op); return `<li class="mg-cand is-${c.status}">
          ${RN.ui.avatar(op, 'ava-sm')}
          <span class="mg-cand-n"><a href="#op.${esc(op.slug)}">${esc(op.name)}</a><span>${esc(op.role)} · ${esc(op.avail.label)}${op.rate ? ' · ' + esc(RN.fmt.rate(op.rate)) : ''}</span></span>
          <span class="pill ${f.pct >= 75 ? 'pill-good' : f.pct >= 50 ? 'pill-info' : ''}">${esc(f.label)}</span>
          <span class="mg-cand-s"><label class="mg-sel"><span class="sr-only">Status for ${esc(op.name)}</span><select class="select select-sm" data-change="mg-cand" data-id="${esc(m.id)}" data-op="${esc(op.id)}">${CAND.map(([v, l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          ${c.status === 'declined' ? `<label class="mg-sel"><span class="sr-only">Why ${esc(op.first)} declined</span><select class="select select-sm" data-change="mg-reason" data-id="${esc(m.id)}" data-op="${esc(op.id)}"><option value="">Why?</option>${DECLINE.map(([v, l]) => `<option value="${v}" ${c.reason === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}</span>
        </li>`; }).join('')}</ul>` : '<p class="small muted">No one yet. Add operators ranked against this brief.</p>'}
    </section>`;
  }
  function docsCard(m) {
    const d = docs(m);
    const TABS = [['pitch', 'Operator pitch'], ['shortlist', 'Shortlist email'], ['intro', 'Intro email'], ['plan', 'Plan summary']];
    const text = d[docTab];
    const pickable = m.candidates.filter((c) => ['sent', 'interviewing', 'selected', 'interested'].includes(c.status)).map((c) => RN.model.byId(c.opId)).filter(Boolean);
    const nContacted = m.candidates.filter((c) => c.status === 'contacted').length;
    const send = docTab === 'pitch' ? `<button type="button" class="btn btn-sm" data-act="mg-send" data-id="${esc(m.id)}" data-k="pitch" ${nContacted ? '' : 'disabled'}>${icon('send')}${nContacted ? `Send to ${RN.fmt.plural(nContacted, 'contacted operator')}` : 'No one waiting for the pitch'}</button>`
      : docTab === 'shortlist' ? `<button type="button" class="btn btn-sm" data-act="mg-send" data-id="${esc(m.id)}" data-k="shortlist" ${d.shown.length ? '' : 'disabled'}>${icon('send')}Send to ${esc(first(m.contact.name))}</button>`
      : docTab === 'intro' ? `<button type="button" class="btn btn-sm" data-act="mg-send" data-id="${esc(m.id)}" data-k="intro" ${d.pickOp ? '' : 'disabled'}>${icon('send')}Send intro</button>` : '';
    return `<section class="card mg-card"><div class="mg-card-hd"><h2 class="h5">Write it once</h2><span class="tiny muted">Every email reads from the brief and the candidates</span></div>
      <div class="seg mg-doc-seg" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${docTab === k}" aria-pressed="${docTab === k}" data-act="mg-doc" data-k="${k}">${esc(l)}</button>`).join('')}</div>
      ${docTab === 'intro' && pickable.length ? `<label class="mg-intro-pick"><span>Introduce</span><select class="select select-sm" data-change="mg-intro-pick">${pickable.map((op) => `<option value="${esc(op.id)}" ${d.pickOp && d.pickOp.id === op.id ? 'selected' : ''}>${esc(op.name)}</option>`).join('')}</select></label>` : ''}
      <textarea class="textarea mg-doc" readonly rows="14" aria-label="${esc(TABS.find((t) => t[0] === docTab)[1])}">${esc(text)}</textarea>
      <div class="row" style="--gap:10px"><button type="button" class="btn btn-line btn-sm" data-act="mg-copy">${icon('copy')}Copy</button>${send}</div>
    </section>`;
  }
  function wrapCard(m) {
    const at = stageIx(m.stage);
    const blocks = [];
    if (at >= stageIx('contracting')) {
      blocks.push(`<div class="mg-checks"><span class="label">Agreements</span>
        <label class="mg-check"><input type="checkbox" data-change="mg-contract" data-id="${esc(m.id)}" data-k="company" ${m.contracts.company ? 'checked' : ''}><span>Company agreement signed</span></label>
        <label class="mg-check"><input type="checkbox" data-change="mg-contract" data-id="${esc(m.id)}" data-k="operator" ${m.contracts.operator ? 'checked' : ''}><span>Operator agreement signed, same hours, term and start</span></label></div>`);
    }
    if (at >= stageIx('live')) {
      const since = (m.stageAt || {}).live || m.updatedAt;
      blocks.push(`<div class="mg-checks"><span class="label">Check-ins</span>${[['w1', 'Week 1 check-in with ' + first(m.contact.name), 7], ['w2', 'Week 2 check-in', 14], ['profile', 'Operator finished their profile and asked for a review', 21]].map(([k, l, d]) => `<label class="mg-check"><input type="checkbox" data-change="mg-checkin" data-id="${esc(m.id)}" data-k="${k}" ${m.checkins[k] ? 'checked' : ''}><span>${esc(l)}</span>${!m.checkins[k] && days(since) >= d ? '<span class="pill pill-warn">Due</span>' : ''}</label>`).join('')}</div>`);
    }
    const notes = (m.notes || []).slice().reverse();
    return `<section class="card mg-card"><div class="mg-card-hd"><h2 class="h5">Notes</h2></div>
      ${blocks.join('')}
      <form class="mg-note" data-submit="mg-note" data-id="${esc(m.id)}"><label class="sr-only" for="mg-note-in">Add a note</label><input class="input" id="mg-note-in" name="text" placeholder="Call notes, a change in scope, who said what"><button class="btn btn-line btn-sm" type="submit">Add</button></form>
      ${notes.length ? `<ol class="mg-notes">${notes.map((n) => `<li><span class="tiny muted">${esc(RN.fmt.ago(n.ts))}</span><p>${esc(n.text)}</p></li>`).join('')}</ol>` : ''}
    </section>`;
  }
  function detail(m) {
    const s = STAGES[stageIx(m.stage)];
    const nextS = STAGES[stageIx(m.stage) + 1];
    const late = overdue(m);
    return `<div class="mg-detail">
      <button type="button" class="act mg-back" data-act="mg-back">${icon('arrow')}All managed engagements</button>
      <header class="mg-hd">
        <div class="grow"><div class="row" style="--gap:8px">${srcPill(m)}${m.sample ? '<span class="pill">Sample</span>' : ''}${m.role.roleCategory ? `<span class="pill">${RN.ui.catDot(m.role.roleCategory)}${esc(RN.fields.catLabel(m.role.roleCategory))}</span>` : ''}</div>
          <h1 class="mg-h">${esc(m.company.name)}</h1><p class="mg-sub">${esc(m.role.title)}${m.contact.name ? ' · ' + esc(m.contact.name) + (m.contact.title ? ', ' + esc(m.contact.title) : '') : ''}</p></div>
      </header>
      ${stepper(m)}
      ${m.stage !== 'closed' ? `<div class="mg-next${late ? ' is-late' : ''}">
        <span class="mg-next-k">${icon(late ? 'clock' : 'target')}${late ? `Next step · ${days((m.stageAt || {})[m.stage] || m.createdAt)} days in` : 'Next step'}</span>
        <p>${esc(s.next)}</p>
        <div class="row" style="--gap:8px">${nextS ? `<button type="button" class="btn btn-sm" data-act="mg-stage" data-id="${esc(m.id)}" data-s="${nextS.k}">${icon('check')}Done: move to ${esc(nextS.l.toLowerCase())}</button>` : ''}${m.stage === 'live' || m.stage === 'interviews' || m.stage === 'contracting' ? '' : ''}<button type="button" class="act muted" data-act="mg-stage" data-id="${esc(m.id)}" data-s="closed">Close without a hire</button></div>
      </div>` : `<div class="mg-next"><span class="mg-next-k">${icon('check')}Closed</span><button type="button" class="act" data-act="mg-stage" data-id="${esc(m.id)}" data-s="scoping">Reopen</button></div>`}
      <div class="mg-grid">
        <div class="mg-col">${candCard(m)}${docsCard(m)}</div>
        <div class="mg-col">${briefCard(m)}${wrapCard(m)}</div>
      </div>
    </div>`;
  }

  /* ---------- Actions ---------- */
  RN.actions['mg-view'] = (el) => { openId = el.dataset.id; docTab = 'pitch'; introPick = ''; RN.rerender(); window.scrollTo(0, 0); };
  RN.actions['mg-back'] = () => { openId = null; RN.rerender(); };
  RN.actions['mg-stage'] = (el) => {
    const id = el.dataset.id, k = el.dataset.s;
    update(id, (x) => { x.stage = k; x.stageAt = Object.assign({}, x.stageAt, { [k]: nowIso() }); });
    RN.ui.toast(k === 'closed' ? 'Engagement closed' : `Moved to ${STAGES[stageIx(k)].l.toLowerCase()}`);
    RN.rerender();
  };
  RN.actions['mg-doc'] = (el) => { docTab = el.dataset.k; RN.rerender(); };
  RN.inputs['mg-intro-pick'] = (el) => { introPick = el.value; RN.rerender(); };
  RN.actions['mg-copy'] = () => {
    const ta = document.querySelector('.mg-doc');
    if (!ta) return;
    const done = () => RN.ui.toast('Copied', { icon: 'copy' });
    try { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); }); } catch (e) { ta.select(); try { document.execCommand('copy'); } catch (x) { /* selected for manual copy */ } done(); }
  };
  const setCand = (id, opId, patch) => update(id, (x) => { const c = x.candidates.find((y) => y.opId === opId); if (c) Object.assign(c, patch, { ts: nowIso() }); });
  RN.inputs['mg-cand'] = (el) => { setCand(el.dataset.id, el.dataset.op, { status: el.value }); RN.rerender(); };
  RN.inputs['mg-reason'] = (el) => { setCand(el.dataset.id, el.dataset.op, { reason: el.value }); };
  RN.inputs['mg-contract'] = (el) => { update(el.dataset.id, (x) => { x.contracts = Object.assign({}, x.contracts, { [el.dataset.k]: el.checked }); }); const m = get(el.dataset.id); if (m.contracts.company && m.contracts.operator && m.stage === 'contracting') RN.ui.toast('Both agreements signed. Move it to Live when the kickoff is booked.', { icon: 'check-circle' }); };
  RN.inputs['mg-checkin'] = (el) => { update(el.dataset.id, (x) => { x.checkins = Object.assign({}, x.checkins, { [el.dataset.k]: el.checked ? nowIso() : null }); }); RN.rerender(); };
  RN.submits['mg-note'] = (form, d) => { const t = String(d.text || '').trim(); if (!t) return; update(form.dataset.id, (x) => { x.notes = (x.notes || []).concat({ ts: nowIso(), text: t }); }); RN.rerender(); };
  RN.actions['mg-add'] = (el) => {
    const m = get(el.dataset.id);
    const picks = matches(m, 8);
    RN.ui.modal({
      width: 620, title: `Operators for ${esc(m.role.title)}`, sub: `Ranked by Match Signals against the brief for ${esc(m.company.name)}. Added as Contacted.`,
      body: picks.length ? `<form id="mg-add-form" data-submit="mg-add-go" data-id="${esc(m.id)}"><ul class="mg-picks">${picks.map((r, i) => `<li><label><input type="checkbox" name="ops" value="${esc(r.op.id)}" ${i < 3 ? 'checked' : ''}>${RN.ui.avatar(r.op, 'ava-sm')}<span class="mg-cand-n"><b>${esc(r.op.name)}</b><span>${esc(r.op.role)} · ${esc(r.op.ris.label)} ${esc(r.op.ris.score)} · ${esc(r.op.avail.label)}${r.op.rate ? ' · ' + esc(RN.fmt.rate(r.op.rate)) : ''}</span><span class="tiny muted">${esc(r.fit.signals.filter((s) => s.state === 'match').map((s) => s.text).slice(0, 2).join('. '))}</span></span><span class="pill ${r.fit.pct >= 75 ? 'pill-good' : 'pill-info'}">${esc(r.fit.label)}</span></label></li>`).join('')}</ul></form>`
        : RN.ui.empty({ icon: 'users', title: 'No more matches', body: 'Everyone who fits this brief is already on the list. Widen the role category in the brief.' }),
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button>${picks.length ? `<button class="btn" type="submit" form="mg-add-form">${icon('plus')}Add selected</button>` : ''}`,
    });
  };
  RN.submits['mg-add-go'] = (form) => {
    const ids = RN.$$('input[name="ops"]:checked', form).map((x) => x.value);
    if (!ids.length) { RN.ui.toast('Pick at least one operator.', { icon: 'info' }); return; }
    update(form.dataset.id, (x) => { ids.forEach((id) => { if (!x.candidates.some((c) => c.opId === id)) x.candidates.push({ opId: id, status: 'contacted', ts: nowIso() }); }); if (x.stage === 'scoping' || x.stage === 'plan') { x.stage = 'sourcing'; x.stageAt = Object.assign({}, x.stageAt, { sourcing: nowIso() }); } });
    RN.ui.closeModal();
    docTab = 'pitch';
    RN.ui.toast(`${RN.fmt.plural(ids.length, 'operator')} added. The pitch is ready to send.`, { icon: 'check-circle' });
    RN.rerender();
  };
  RN.actions['mg-send'] = (el) => {
    const m = get(el.dataset.id), k = el.dataset.k, d = docs(m);
    if (k === 'pitch') {
      const to = m.candidates.filter((c) => c.status === 'contacted').map((c) => RN.model.byId(c.opId)).filter(Boolean);
      if (!to.length) { RN.ui.toast('No one is waiting for the pitch. Add operators first.', { icon: 'info' }); return; }
      to.forEach((op) => RN.mail(op.name, `${m.role.title} seat`, d.pitch.replace(/^Subject:.*\n\n/, '').replace('{first name}', op.first), 'managed'));
      RN.ui.toast(`Pitch sent to ${RN.fmt.plural(to.length, 'operator')}. Mark each one Interested or Declined as they reply.`, { icon: 'mail' });
    } else if (k === 'shortlist') {
      RN.mail(m.contact.email || m.contact.name || m.company.name, `Profiles for the ${m.role.title} seat`, d.shortlist.replace(/^Subject:.*\n\n/, ''), 'managed');
      update(m.id, (x) => { x.candidates.forEach((c) => { if (c.status === 'interested') c.status = 'sent'; }); if (stageIx(x.stage) < stageIx('shortlist')) { x.stage = 'shortlist'; x.stageAt = Object.assign({}, x.stageAt, { shortlist: nowIso() }); } });
      RN.ui.toast(`Shortlist sent to ${esc(first(m.contact.name))}.`, { icon: 'mail' });
    } else if (k === 'intro' && d.pickOp) {
      RN.mail(`${m.contact.name || m.company.name} and ${d.pickOp.name}`, `${first(m.contact.name)}, meet ${d.pickOp.first}`, d.intro.replace(/^Subject:.*\n\n/, ''), 'managed');
      update(m.id, (x) => { const c = x.candidates.find((y) => y.opId === d.pickOp.id); if (c && c.status !== 'selected') c.status = 'interviewing'; if (stageIx(x.stage) < stageIx('interviews')) { x.stage = 'interviews'; x.stageAt = Object.assign({}, x.stageAt, { interviews: nowIso() }); } });
      RN.ui.toast(`Intro sent. ${esc(d.pickOp.first)} is Interviewing.`, { icon: 'mail' });
    }
    RN.rerender();
  };
  RN.store.on((key) => { if (key === '*' && !Array.isArray(st().managed)) openId = null; });
})();
