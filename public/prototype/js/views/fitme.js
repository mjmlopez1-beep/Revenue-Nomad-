/* RN.fitme: who a ranked search is for, and how a first-time searcher becomes a client without leaving the search.
   Three cases, one rule: search is never gated, and every answer moves the list.
   - Signed-in client: the company profile (industry, revenue, size) is checked against the companies each operator has
     worked with, and the rows carry the client's history (hired before, met, asked, declined), rates and Ask to meet.
   - First-time visitor: after a first real action (a second search, coming back from a profile, scrolling past row 6)
     one question card appears at row 4. It confirms what the search words already said, then asks what is missing,
     one tap at a time; each answer re-ranks the rows. Saving anything (shortlist, rates, the search, the card's last
     step) asks for one field, a work email, and creates the client account with everything answered so far.
   - Returning client, signed out: the device remembers them (seen.lastClient), but nothing of theirs is applied until
     they open a sign-in link. An email entered at any save step that matches an account goes the same way, and the
     visitor's answers merge into the account, asking once if they differ from the stored company profile.
   Store keys: seen.searchMe {industry, revenueRange, employeeRange} (visitor answers), seen.lastClient (the last
   client signed out on this device). Session-only state lives in S (dismissals, engagement, links sent). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const FM = (RN.fitme = {});
  const KEYS = ['industry', 'revenueRange', 'employeeRange'];
  const PK = { industry: 'industries', revenueRange: 'revenueRange', employeeRange: 'employeeRange' };   // profile key -> search fact key
  const FIELD = { industry: 'industry', revenueRange: 'companyRevenue', employeeRange: 'companyEmployees' };
  const ASK = { industry: 'What industry are you in?', revenueRange: 'How much revenue does your company make a year?', employeeRange: 'How many people work there?' };
  const GENERIC = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|msn)\./i;
  const S = { engaged: false, dismissed: false, texts: new Set(), fromProfile: false, rejected: {}, skipped: {}, saveSkipped: false, edit: [], notMe: false, linkSent: '', shortlistAsked: false, profileWins: '' };

  const st = () => RN.store.state;
  const seen = () => st().seen || {};
  const me = () => seen().searchMe || {};
  const lab = (k, v) => RN.w.label(FIELD[k], v) || v;
  const isVisitor = () => st().persona === 'visitor';
  const isClient = () => st().persona === 'buyer';
  const setSeen = (patch) => RN.store.update((s) => { s.seen = Object.assign({}, s.seen, patch); }, 'seen');

  /* ---------- The profile a search ranks for ---------- */
  function mk(c, o) { const p = Object.assign({}, o); KEYS.forEach((k) => { if (c[k]) p[PK[k]] = [c[k]]; }); return p; }
  FM.profile = function () {
    if (isClient()) { const c = RN.personas.buyer.company || {}; return KEYS.some((k) => c[k]) ? mk(c, { who: 'client', name: c.name || '' }) : null; }
    if (!isVisitor()) return null;
    const m = me();
    return KEYS.some((k) => m[k]) ? mk(m, { who: 'visitor', name: '' }) : null;
  };
  FM.profileWins = (text) => S.profileWins && S.profileWins === text;
  // What the search words say about the searcher's own company ("our $5M SaaS company"), one value per key
  function guess(text) {
    const u = text && RN.model.understand ? RN.model.understand(text) : null;
    const out = {};
    if (u) u.facts.forEach((f) => { const k = KEYS.find((x) => PK[x] === f.k); if (k) out[k] = [].concat(f.v)[0]; });
    return out;
  }

  /* ---------- Signed-in history on each row ---------- */
  FM.history = function (opId) {
    if (!isClient()) return null;
    const email = (RN.personas.buyer.email || '').toLowerCase();
    const mine = (x) => (x || '').toLowerCase() === email;
    if ((st().hires || []).some((h) => h.opId === opId && mine(h.client && h.client.email))) return { k: 'hired', l: 'Hired before', bonus: 0.12 };
    const it = (st().intros || []).filter((i) => i.opId === opId && mine(i.buyer && i.buyer.email) && !i.withdrawn);
    if (it.some((i) => i.status === 'introduced' || i.status === 'hired')) return { k: 'met', l: 'You’ve met', bonus: 0.04 };
    if (it.some((i) => ['pending', 'interested', 'rn_qualified'].includes(i.status))) return { k: 'asked', l: 'Asked to meet', bonus: 0 };
    if (it.some((i) => i.status === 'declined')) return { k: 'declined', l: 'Declined', bonus: -0.15 };
    return null;
  };

  /* ---------- Head: who we are matching for, the returning-client hello ---------- */
  FM.headHtml = function (res, text) {
    return hello() + forLine(res, text);
  };
  function forLine(res, text) {
    const p = FM.profile();
    if (!p) return '';
    const vals = KEYS.filter((k) => p[PK[k]]).map((k) => `<span>${esc(lab(k, p[PK[k]][0]))}</span>`).join('');
    const name = p.who === 'client' ? esc(p.name || 'your company') : 'your company';
    const conflict = p.who === 'client' && res.conflict && res.conflict.length;
    const wins = FM.profileWins(text);
    const swap = conflict && !wins ? `<span class="fm-swap">${icon('info')}Your search describes a different company. <button type="button" class="act" data-act="fm-use-profile">Use ${name} instead</button></span>`
      : wins ? `<span class="fm-swap">${icon('check')}Using ${name}. <button type="button" class="act" data-act="fm-use-words">Use my search words</button></span>` : '';
    return `<div class="fm-for">
      <span class="fm-for-l">${icon('building')}<span>Matching for <b>${name}</b></span></span>
      <span class="fm-for-v">${vals}</span>
      <button type="button" class="act" data-act="fm-edit">${icon('edit')}Edit</button>
      ${swap}
    </div>`;
  }
  function hello() {
    const lc = seen().lastClient;
    if (!isVisitor() || !lc || S.notMe) return '';
    const co = esc((lc.company && lc.company.name) || 'your company');
    if (S.linkSent) {
      return `<div class="fm-hello is-sent">${icon('message')}<p>We sent a sign-in link to <b>${esc(S.linkSent)}</b>. Your matches will use ${co}’s profile once you open it.</p>
        <button type="button" class="btn btn-sm" data-act="fm-open-link" data-email="${esc(S.linkSent)}">Open the link <span class="fm-proto">prototype</span></button></div>`;
    }
    return `<div class="fm-hello">${RN.ui.avatar({ name: lc.name, initials: initials(lc.name) }, 'ava-sm', { decorative: true })}
      <p><b>Welcome back, ${esc(String(lc.name || '').split(' ')[0] || 'there')}.</b> Continue as ${co}?</p>
      <button type="button" class="btn btn-sm" data-act="fm-send-link" data-email="${esc(lc.email)}">Email me a sign-in link</button>
      <button type="button" class="act muted" data-act="fm-not-me">Not me</button></div>`;
  }
  const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0] || '').join('').slice(0, 2).toUpperCase();

  /* ---------- The one-question card (visitors) ---------- */
  function nextStep(text) {
    if (S.edit.length) return { kind: 'ask', k: S.edit[0], edit: true };
    const m = me(), g = guess(text);
    const unsure = KEYS.filter((k) => g[k] && !m[k] && !S.rejected[k]);
    if (unsure.length) return { kind: 'confirm', keys: unsure, g };
    const k = KEYS.find((x) => !m[x] && !S.skipped[x]);
    if (k) return { kind: 'ask', k };
    if (!S.saveSkipped) return { kind: 'save' };
    return null;
  }
  FM.showCard = function (text) {
    if (!isVisitor() || S.dismissed || (seen().lastClient && !S.notMe)) return false;
    if (!S.engaged && !S.edit.length) return false;
    return !!nextStep(text);
  };
  FM.engage = function (why) { if (S.engaged) return false; S.engaged = true; RN.track('search_profile_prompt', { meta: { trigger: why } }); return true; };
  FM.noteSearch = function (text) {
    S.texts.add(String(text).trim().toLowerCase());
    if (S.texts.size >= 2) FM.engage('second_search');
    if (S.fromProfile) { S.fromProfile = false; FM.engage('back_from_profile'); }
  };
  window.addEventListener('hashchange', () => { if (/^#op\./.test(location.hash)) S.fromProfile = true; });

  function bar() {
    const m = me();
    return `<span class="fm-bar" aria-hidden="true">${KEYS.map((k) => `<i class="${m[k] ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  function chips(k) {
    const cur = me()[k];
    let opts = RN.fields[FIELD[k]].options;
    let other = '';
    if (k === 'industry') {
      // The industries most operators have worked in, then everything else in a menu
      const n = {};
      RN.model.ops.forEach((op) => (op.industries || []).forEach((v) => { n[v] = (n[v] || 0) + 1; }));
      const top = opts.slice().sort((a, b) => (n[b.v] || 0) - (n[a.v] || 0)).slice(0, 7);
      if (cur && !top.some((o) => o.v === cur)) top.push(opts.find((o) => o.v === cur));
      other = `<label class="fm-other"><span class="sr-only">Other industry</span><select class="select select-sm" data-change="fm-pick-sel" data-k="industry"><option value="">Other…</option>${opts.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}</select></label>`;
      opts = top.filter(Boolean);
    }
    return `<div class="fm-chips" role="group" aria-label="${esc(ASK[k])}">${opts.map((o) => `<button type="button" class="fm-chip" data-act="fm-pick" data-k="${k}" data-v="${esc(o.v)}" aria-pressed="${cur === o.v}">${esc(o.l)}</button>`).join('')}${other}</div>`;
  }
  FM.cardHtml = function (text) {
    const s = nextStep(text);
    if (!s) return '';
    let body = '';
    if (s.kind === 'confirm') {
      const said = s.keys.map((k) => esc(lab(k, s.g[k]))).join(' · ');
      body = `<p class="fm-q">From your search, your company looks like <span class="fm-hl">${said}</span>. Is that right?</p>
        <div class="fm-row"><button type="button" class="btn btn-sm" data-act="fm-confirm" data-keys="${s.keys.join(',')}">${icon('check')}Yes, that’s us</button>
        <button type="button" class="btn btn-line btn-sm" data-act="fm-reject" data-keys="${s.keys.join(',')}">No, different</button></div>`;
    } else if (s.kind === 'ask') {
      body = `<p class="fm-q">${esc(ASK[s.k])}</p>${chips(s.k)}
        <div class="fm-row"><button type="button" class="act muted" data-act="fm-skip" data-k="${s.k}">${s.edit ? 'Keep as is' : 'Skip'}</button></div>`;
    } else {
      body = `<p class="fm-q"><b>Save these matches.</b> We’ll email you when someone new fits.</p>
        ${emailForm('matches')}
        <div class="fm-row"><button type="button" class="act muted" data-act="fm-save-skip">No thanks</button></div>`;
    }
    return `<li class="rk-ask" data-step="${s.kind}">
      <div class="fm-card">
        ${bar()}
        <div class="fm-top"><span class="fm-k">${icon('target')}Sharpen your matches</span><span class="fm-step">${KEYS.filter((k) => me()[k]).length} of 3</span><span class="fm-why">${icon('chart')}Each answer re-ranks the list</span>
          <button type="button" class="fm-x" data-act="fm-dismiss" aria-label="Hide this for now">${icon('x')}</button></div>
        ${body}
      </div></li>`;
  };
  function emailForm(reason) {
    return `<form class="fm-email" data-submit="fm-email" data-reason="${reason}" novalidate>
      <label class="sr-only" for="fm-email-${reason}">Work email</label>
      <input class="input" id="fm-email-${reason}" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@company.com" required>
      <button class="btn" type="submit">Save</button>
      <p class="fm-err small" hidden></p>
      <p class="fm-priv small muted">${icon('lock')}No password. Operators don’t see your company until you ask to meet.</p>
    </form>`;
  }

  const rerank = () => { if (RN.rank && RN.rank.rerender) RN.rank.rerender(); };
  const saveMe = (patch) => setSeen({ searchMe: Object.assign({}, me(), patch) });
  const curText = () => { const b = document.querySelector('.rk'); return b ? b.dataset.rkText : ''; };

  RN.actions['fm-pick'] = (el) => {
    const k = el.dataset.k;
    saveMe({ [k]: el.dataset.v });
    if (S.edit[0] === k) S.edit.shift();
    RN.track('search_profile_answer', { meta: { k, v: el.dataset.v } });
    rerank();
  };
  RN.inputs['fm-pick-sel'] = (el) => { if (el.value) RN.actions['fm-pick']({ dataset: { k: el.dataset.k, v: el.value } }); };
  RN.actions['fm-confirm'] = (el) => {
    const g = guess(curText()), patch = {};
    el.dataset.keys.split(',').forEach((k) => { patch[k] = g[k]; });
    saveMe(patch);
    rerank();
  };
  RN.actions['fm-reject'] = (el) => { el.dataset.keys.split(',').forEach((k) => { S.rejected[k] = true; }); rerank(); };
  RN.actions['fm-skip'] = (el) => { const k = el.dataset.k; if (S.edit[0] === k) S.edit.shift(); else S.skipped[k] = true; rerank(); };
  RN.actions['fm-save-skip'] = () => { S.saveSkipped = true; rerank(); };
  RN.actions['fm-dismiss'] = () => { S.dismissed = true; S.edit = []; rerank(); };
  RN.actions['fm-edit'] = () => {
    if (isClient()) { RN.go('buyer.company'); return; }
    S.dismissed = false; S.edit = KEYS.slice();
    rerank();
    setTimeout(() => { const c = document.querySelector('.rk-ask'); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
  };
  RN.actions['fm-use-profile'] = () => { S.profileWins = curText(); rerank(); };
  RN.actions['fm-use-words'] = () => { S.profileWins = ''; rerank(); };

  /* ---------- Save: one field, a work email ---------- */
  const TITLES = {
    shortlist: ['Keep your shortlist', 'Add your work email and your shortlist is saved to your own client account.'],
    rates: ['See operator rates', 'Rates are shown to clients. Add your work email to see them on every profile.'],
    search: ['Save this search', 'We’ll email you when a new operator matches it.'],
    matches: ['Save these matches', 'We’ll email you when someone new fits.'],
  };
  FM.ask = function (reason, o) {
    o = o || {};
    const t = TITLES[reason] || TITLES.matches;
    const m = me();
    const known = KEYS.filter((k) => m[k]).map((k) => esc(lab(k, m[k])));
    RN.ui.modal({
      width: 460,
      title: t[0],
      sub: t[1],
      body: `${emailForm(reason)}${known.length ? `<p class="small muted fm-carry">${icon('check')}Your answers come with you: ${known.join(' · ')}</p>` : ''}`,
      foot: `<button class="btn btn-line" data-act="modal-close">Not now</button>`,
      onClose: o.onCancel,
    });
    setTimeout(() => { const i = document.querySelector('.modal .fm-email input'); if (i) i.focus(); }, 60);
  };

  function accounts() {
    const list = [];
    const add = (b) => { if (b && b.email && !list.some((x) => x.email.toLowerCase() === b.email.toLowerCase())) list.push({ name: b.name || '', title: b.title || '', email: b.email, company: Object.assign({}, b.company) }); };
    add(RN.shell.demoClient());
    add(seen().client); add(seen().lastClient);
    (st().intros || []).forEach((i) => add(i.buyer));
    return list;
  }
  const findAccount = (email) => accounts().find((a) => a.email.toLowerCase() === email.toLowerCase()) || null;

  RN.submits['fm-email'] = (form, d) => {
    const email = String(d.email || '').trim();
    const err = form.querySelector('.fm-err');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; form.querySelector('input').focus(); };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Add an email like you@company.com.');
    if (GENERIC.test(email.split('@')[1])) return fail('Use your work email, so operators see the right company.');
    const reason = form.dataset.reason;
    const acct = findAccount(email);
    if (acct) { sendLink(acct.email, reason); return; }
    RN.ui.closeModal();
    create(email, reason);
  };

  function sendLink(email, reason) {
    S.linkSent = email; S.pendingReason = reason;
    RN.mail(email, 'Your Revenue Nomad sign-in link', 'Open this link to sign in. It works once and expires in 15 minutes.', 'system');
    RN.ui.closeModal();
    RN.ui.modal({
      width: 460,
      title: 'You already have an account',
      sub: `We sent a sign-in link to ${esc(email)}.`,
      body: `<p class="muted">Open it on this device and you’re back in, with everything from this search: your answers, shortlist and saved matches.</p>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Close</button><button class="btn" data-act="fm-open-link" data-email="${esc(email)}">Open the link <span class="fm-proto">prototype</span></button>`,
    });
    RN.track('signin_link_sent', { meta: { reason } });
    rerank();
  }
  RN.actions['fm-send-link'] = (el) => sendLink(el.dataset.email, 'returning');
  RN.actions['fm-not-me'] = () => { S.notMe = true; RN.store.update((s) => { s.seen = Object.assign({}, s.seen); delete s.seen.lastClient; }, 'seen'); rerank(); };
  RN.actions['fm-open-link'] = (el) => { RN.ui.closeModal(); signIn(findAccount(el.dataset.email)); };

  function asClient(who) {
    const demo = who && who.email.toLowerCase() === RN.shell.demoClient().email.toLowerCase();
    RN.shell.setClient(demo ? null : who);
    if (demo && RN.bw && RN.bw.applyCompany) RN.bw.applyCompany();
    RN.store.set('persona', 'buyer');
    if (demo) RN.shell.enterDemoClient();
    RN.shell.renderHeader(); RN.shell.renderDock();
  }
  function afterSave(reason) {
    if ((reason === 'matches' || reason === 'search') && RN.actions['br-save'] && document.querySelector('.br-page')) setTimeout(() => RN.actions['br-save'](), 60);
  }
  function signIn(acct) {
    if (!acct) return;
    const answers = me(), reason = S.pendingReason;
    S.linkSent = ''; S.pendingReason = '';
    asClient(acct);
    setSeen({ searchMe: null });
    const c = RN.personas.buyer.company || {};
    const diff = KEYS.filter((k) => answers[k] && answers[k] !== c[k]);
    RN.ui.toast(`Signed in as ${esc(RN.personas.buyer.name)} (${esc(c.name || '')})`);
    RN.track('signin', { meta: { via: 'search_link', reason } });
    afterSave(reason);
    rerank();
    if (diff.length) {
      RN.ui.modal({
        width: 480,
        title: 'Update your company profile?',
        sub: 'What you told us in this search is different from your saved profile.',
        body: `<ul class="fm-diff">${diff.map((k) => `<li><span class="label">${esc(RN.fields[FIELD[k]].label || k)}</span><s>${esc(lab(k, c[k]) || 'Not set')}</s>${icon('arrow')}<b>${esc(lab(k, answers[k]))}</b></li>`).join('')}</ul>`,
        foot: `<button class="btn btn-line" data-act="modal-close">Keep my profile</button><button class="btn" data-act="fm-update-profile" data-v='${esc(JSON.stringify(diff.reduce((o, k) => Object.assign(o, { [k]: answers[k] }), {})))}'>Update profile</button>`,
      });
    }
  }
  RN.actions['fm-update-profile'] = (el) => {
    const patch = JSON.parse(el.dataset.v);
    setSeen({ company: Object.assign({}, RN.personas.buyer.company, patch) });
    if (RN.bw && RN.bw.applyCompany) RN.bw.applyCompany(); else Object.assign(RN.personas.buyer.company, patch);
    RN.ui.closeModal();
    RN.ui.toast('Company profile updated');
    rerank();
  };

  function create(email, reason) {
    const [local, domain] = email.split('@');
    const title = (x) => x.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    const parts = local.split(/[._-]+/).filter(Boolean);
    const name = parts.length >= 2 ? title(parts.slice(0, 2).join(' ')) : '';
    const coName = title(domain.split('.').slice(-2)[0]);
    const m = me();
    asClient({ name: name || coName, title: '', email, company: { name: coName, industry: m.industry || '', revenueRange: m.revenueRange || '', employeeRange: m.employeeRange || '' } });
    setSeen({ searchMe: null });
    RN.track('signup_submit', { meta: { kind: 'client', via: 'search', reason } });
    RN.mail(email, 'Welcome to Revenue Nomad', `Your client account for ${coName} is ready. Use the sign-in link in this email next time; there is no password.\n\nYour shortlist and searches are saved in your workspace.`, 'system');
    RN.ui.toast(`Saved. Your client account for ${esc(coName)} is ready, and we emailed you a sign-in link for next time.`, { icon: 'check-circle', ms: 5200 });
    afterSave(reason);
    rerank();
  }

  /* ---------- Save triggers from the ranked rows ---------- */
  RN.actions['fm-rates'] = () => FM.ask('rates');
  FM.afterShortlist = function (added) {
    if (!added || !isVisitor() || S.shortlistAsked) return;
    S.shortlistAsked = true;
    setTimeout(() => FM.ask('shortlist'), 350);
  };

  /* ---------- Remember the client who signs out on this device ---------- */
  let prevPersona = null;
  RN.store.on((key) => {
    if (key !== 'persona' && key !== '*') return;
    const p = st().persona;
    if (prevPersona === 'buyer' && p === 'visitor') {
      const b = RN.personas.buyer;
      setSeen({ lastClient: { name: b.name, title: b.title || '', email: b.email, company: Object.assign({}, b.company) } });
      S.notMe = false;
    }
    prevPersona = p;
  });
  setTimeout(() => { prevPersona = st().persona; }, 0);

  /* ---------- Dock journeys ---------- */
  FM.journey = function (j) {
    Object.assign(S, { engaged: false, dismissed: false, texts: new Set(), fromProfile: false, rejected: {}, skipped: {}, saveSkipped: false, edit: [], notMe: false, linkSent: '', shortlistAsked: false, profileWins: '' });
    if (RN.personas.buyer && !RN.personas.buyer.demo) RN.shell.setClient(null);
    const lc = j.returning ? (accounts().find((a) => /clearpath/i.test(a.email)) || null) : null;
    RN.store.update((s) => {
      s.seen = Object.assign({}, s.seen, { searchMe: null });
      if (lc) s.seen.lastClient = lc; else delete s.seen.lastClient;
    }, 'seen');
    prevPersona = 'visitor';
  };
})();
