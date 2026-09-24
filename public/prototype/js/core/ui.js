/* RN.ui: shared components + global event delegation.
   Views return HTML strings; interactivity is wired by data attributes:
     data-act="name"      click   -> RN.actions[name](el, event)
     data-input="name"    input   -> RN.inputs[name](el, event)
     data-change="name"   change  -> RN.inputs[name](el, event)
     data-submit="name"   submit  -> RN.submits[name](form, data, event)   (preventDefault is automatic)
     data-tip="html"      hover/focus shows the "i" explainer popover
     data-go="route"      click navigates (use on non-links)
*/
(function () {
  'use strict';
  const RN = window.RN;
  const h = RN.h, esc = RN.esc, icon = RN.icon;
  const ui = (RN.ui = {});

  /* ---------- Atoms ---------- */
  ui.avatar = function (op, cls) {
    if (!op) return `<span class="ava ${cls || ''}"></span>`;
    if (op.photo) return `<img class="ava ${cls || ''}" src="${esc(op.photo)}" alt="${esc(op.name)}" loading="lazy">`;
    return `<span class="ava ${cls || ''}" aria-label="${esc(op.name)}">${esc(op.initials || RN.fmt.initials(op.name))}</span>`;
  };

  ui.avail = function (op, o) {
    const a = op.avail || {};
    const cls = a.key === 'available_now' ? 'dot-now' : a.key === 'available_2_weeks' ? 'dot-soon' : 'dot-later';
    const hrs = a.hours ? ` · ${a.hours} hrs/mo` : '';
    return `<span class="row-nw" style="--gap:8px"><i class="dot ${cls}"></i><span>${esc(a.label || 'Availability not set')}${o && o.hours === false ? '' : esc(hrs)}</span></span>`;
  };

  ui.ftag = function (tag, o) {
    const t = typeof tag === 'string' ? { t: tag, tier: 'claimed' } : tag;
    const verified = !!t.tier && t.tier !== 'claimed';
    return `<span class="ftag ${verified ? '' : 'claimed'}" title="${t.tier === 'expert' ? 'Expert: verified by 5 or more client reviews' : verified ? 'Verified by a client review' : 'Claimed by the operator'}">${verified ? icon('check-circle') : ''}${esc(t.t)}</span>`;
  };
  ui.ftags = function (tags, max, o) {
    tags = tags || [];
    const shown = tags.slice(0, max || tags.length);
    const more = tags.length - shown.length;
    return `<div class="opc-tags">${shown.map((t) => ui.ftag(t)).join('')}${more > 0 ? `<span class="ftag more">+${more} more</span>` : ''}</div>`;
  };

  ui.stars = function (n, o) {
    const full = Math.round(n || 0);
    let s = '';
    for (let i = 0; i < 5; i++) s += `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:inline-block"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3Z" fill="${i < full ? 'var(--gold)' : 'var(--line)'}"/></svg>`;
    return `<span class="row-nw" style="--gap:1px" aria-label="${n} out of 5">${s}</span>`;
  };

  /* Reputation Index seal. op.ris = {score, label}; label comes from RN.fields.risLabel */
  ui.ris = function (op, o) {
    const r = op.ris || { score: 0, label: 'New' };
    const tipHtml = ui.risExplainer(o && o.viewer === 'operator');
    return `<span class="ris"><span class="ris-seal t-${esc(r.tier || RN.fields.risTierFor(r.score).v)}">${ui.hexSeal(r.label)}<b>${esc(r.score)}</b></span><span class="ris-txt"><b>${esc(r.label)}</b><span class="row-nw" style="--gap:4px">Reputation Index ${ui.tip(tipHtml)}</span></span></span>`;
  };
  ui.hexSeal = function (label) {
    // Mint for Verified to Trusted, gold for Elite and Apex (explorer badge), grey while Indexing
    const gold = label === 'Elite' || label === 'Apex';
    const mint = label === 'Proven' || label === 'Trusted';
    const fill = gold ? 'var(--gold-bg)' : mint ? 'var(--leaf)' : label === 'Vetted' ? 'var(--tint)' : 'var(--sunk)';
    const stroke = gold ? 'var(--gold)' : mint ? 'var(--forest)' : label === 'Vetted' ? 'var(--tint-line)' : 'var(--line)';
    return `<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M17 1.8 30.2 9.4v15.2L17 32.2 3.8 24.6V9.4L17 1.8Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/></svg>`;
  };
  /* One explainer for operators and clients (scope: reuse the operator "i" tooltip, drop "your",
     rename "improve your score" to "how score is calculated"). */
  ui.risExplainer = function () {
    const f = (RN.fields && RN.fields.risFactors && RN.fields.risFactors.options) || [];
    return `<b>How score is calculated</b><br>The Reputation Index blends five signals into one 0 to 100 score. Every profile starts at a floor of 50.<ul>${f.map((x) => `<li><b>${esc(x.l)}</b>: ${esc(x.d)}</li>`).join('')}</ul>`;
  };

  ui.tip = function (html, label) {
    const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="tip" data-tip="${esc(html)}" aria-label="${esc((label || 'More info') + ': ' + text.slice(0, 220))}">i</button>`;
  };

  /* One "illustrative data" label for the whole system */
  ui.illus = function (text, title) {
    return `<span class="illus" title="${esc(title || 'Figures are illustrative: invented to show shape and value, not to be cited.')}">${icon('info')}${esc(text || 'Illustrative')}</span>`;
  };

  /* One status pill per record type, one colour map (project, intro, review, application) */
  const STATUS = {
    project: { draft: '', posted: 'pill-info', in_progress: 'pill-accent', staffed: 'pill-good', closed: '' },
    intro: { pending: 'pill-warn', interested: 'pill-info', rn_qualified: 'pill-info', introduced: 'pill-good', hired: 'pill-accent', declined: 'pill-bad' },
    review: { sent: 'pill-info', completed: 'pill-good' },
    application: { in_review: 'pill-warn', approved: 'pill-info', live: 'pill-good', changes_requested: 'pill-warn', rejected: 'pill-bad' },
  };
  const STATUS_FIELD = { project: 'projectStatus', intro: 'introStatus', review: 'reviewStatus' };
  ui.statusPill = function (kind, status, label) {
    const f = STATUS_FIELD[kind];
    const l = label || (f && RN.fields[f] ? RN.w.label(f, status) : String(status || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
    return `<span class="pill ${(STATUS[kind] || {})[status] || ''}">${esc(l)}</span>`;
  };

  /* Lifecycle track. steps: [{l, date?, state: 'done'|'cur'|'todo'|'stop'}] */
  ui.track = function (steps, label) {
    return `<ol class="track" aria-label="${esc(label || 'Progress')}">${steps.map((s) => `<li class="${esc(s.state || 'todo')}"${s.state === 'cur' ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><b>${esc(s.l)}</b>${s.date ? `<span>${esc(s.date)}</span>` : ''}</li>`).join('')}</ol>`;
  };
  /* Track for an intro record, following RN.intro.steps */
  ui.introTrack = function (rec) {
    const order = ['pending', 'interested', 'rn_qualified', 'introduced', 'hired'];
    const at = order.indexOf(rec.status);
    const when = (st) => { const t = (rec.thread || []).find((x) => RN.w.label('introStatus', st) === x.text); return t ? RN.fmt.dateShort(t.ts) : st === 'pending' ? RN.fmt.dateShort(rec.createdAt) : ''; };
    if (rec.status === 'declined') return ui.track([{ l: 'Pending', state: 'done', date: RN.fmt.dateShort(rec.createdAt) }, { l: 'Declined', state: 'stop' }], 'Intro progress');
    return ui.track(order.map((st, i) => ({ l: RN.w.label('introStatus', st), state: i < at ? 'done' : i === at ? 'cur' : 'todo', date: i <= at ? when(st) : '' })), 'Intro progress');
  };

  ui.catDot = function (cat) {
    const k = (RN.fields && RN.fields.catColor && RN.fields.catColor(cat)) || 'var(--accent)';
    return `<i class="dot" style="background:${k}"></i>`;
  };

  ui.empty = function (o) {
    return `<div class="empty">${icon(o.icon || 'inbox')}<b>${esc(o.title)}</b>${o.body ? `<p class="small" style="max-width:46ch">${esc(o.body)}</p>` : ''}${o.cta || ''}</div>`;
  };

  ui.delta = function (cur, prev, o) {
    if (!prev) return '';
    const d = (cur - prev) / prev;
    const dir = Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down';
    return `<span class="delta ${dir}">${dir === 'up' ? icon('trend-up') : dir === 'down' ? icon('trend-down') : ''}${dir === 'flat' ? 'Flat' : (d > 0 ? '+' : '') + Math.round(d * 100) + '%'}</span>`;
  };

  ui.logo = function (key, o) {
    const src = RN.data.logos && RN.data.logos[key];
    if (!src) return `<span class="h5">${esc(o && o.name ? o.name : key)}</span>`;
    return `<img src="${src}" alt="${esc(o && o.name ? o.name : key)}" style="height:${(o && o.h) || 28}px;width:auto;object-fit:contain">`;
  };

  /* ---------- Operator card (used everywhere an operator is listed) ----------
     opts: { why: 'reason string', compact, cta: 'profile'|'intro'|'invite', meta: extra html, rank } */
  ui.opCard = function (op, opts) {
    opts = opts || {};
    const st = RN.store.state;
    const saved = st.shortlist.includes(op.id);
    const inCompare = st.compare.includes(op.id);
    const tags = (op.tags || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || (a.tier === 'claimed') - (b.tier === 'claimed'));
    return `<article class="opc" data-op="${esc(op.id)}">
      <button type="button" class="opc-save ${saved ? 'on' : ''}" data-act="shortlist-toggle" data-id="${esc(op.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from shortlist' : 'Save to shortlist'}">${icon('bookmark')}</button>
      <div class="opc-top">
        ${ui.avatar(op, 'ava-md')}
        <div class="grow" style="padding-right:36px">
          <h3 class="opc-name"><a href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${esc(op.name)}</a></h3>
          <div class="opc-role">Fractional ${esc(op.role)}</div>
        </div>
      </div>
      ${op.headline && !opts.compact ? `<p class="opc-head clamp-2 serif-up" style="font-size:16px">${esc(op.headline)}</p>` : ''}
      ${opts.why ? `<div class="opc-why">${icon('target')}<span>${esc(opts.why)}</span></div>` : ''}
      ${ui.ftags(tags, opts.compact ? 2 : 3)}
      <div class="opc-meta">
        <span>${ui.avail(op)}</span>
        ${op.rate ? (RN.store.state.persona === 'visitor' ? `<button type="button" class="act muted" data-act="login" style="position:relative;z-index:2;font-size:inherit">${icon('lock')}Log in to see rate</button>` : `<span>${icon('clock')}${esc(RN.fmt.rate(op.rate))}</span>`) : ''}
        ${op.location ? `<span>${icon('pin')}${esc(op.location)}</span>` : ''}
      </div>
      ${opts.meta || ''}
      <div class="opc-foot">
        ${ui.ris(op)}
        <div class="row" style="--gap:8px">
          <button type="button" class="act ${inCompare ? '' : 'muted'}" data-act="compare-toggle" data-id="${esc(op.id)}">${icon('compare')}${inCompare ? 'In compare' : 'Compare'}</button>
          ${opts.cta === 'invite' ? `<button type="button" class="btn btn-sm" data-act="${esc(opts.ctaAct || 'project-invite')}" data-id="${esc(op.id)}">${esc(opts.ctaLabel || 'Invite')}</button>` : ''}
        </div>
      </div>
    </article>`;
  };

  /* ---------- Gate: a screen that needs a signed-in persona ---------- */
  ui.gate = function (role, view) {
    const who = { buyer: 'a hiring company', operator: 'an operator', admin: 'the Revenue Nomad team', 'any-user': 'a signed-in user' }[role] || role;
    const p = RN.personas && RN.personas[role];
    return `<section class="wrap-narrow section"><div class="card" style="padding:40px;text-align:center">
      <div class="eyebrow">Sign in required</div>
      <h1 class="h2" style="margin-top:10px">This view is for ${esc(who)}.</h1>
      <p class="lede" style="margin:14px auto 0">In the prototype you can switch persona in one click. Your place in the flow is kept.</p>
      <div class="row" style="justify-content:center;margin-top:24px">
        ${p ? `<button class="btn" data-act="persona" data-p="${esc(role)}">Continue as ${esc(p.name)}</button>` : ''}
        <a class="btn btn-line" href="#home">Back to home</a>
      </div></div></section>`;
  };

  /* ---------- Modal / drawer / toast ---------- */
  let modalStack = [];
  ui.modal = function (o) {
    const id = RN.uid('m');
    const el = document.createElement('div');
    el.className = 'scrim' + (o.drawer ? ' drawer-scrim' : '');
    el.dataset.modal = id;
    el.innerHTML = `<div class="${o.drawer ? 'drawer' : 'modal'}" role="dialog" aria-modal="true" aria-labelledby="${id}-t" style="${o.width ? `--mw:${o.width}px` : ''}">
      <div class="modal-hd"><div><h2 id="${id}-t">${o.title || ''}</h2>${o.sub ? `<p class="sub">${o.sub}</p>` : ''}</div>
      <button type="button" class="x-btn" data-act="modal-close" aria-label="Close">${icon('x')}</button></div>
      <div class="modal-bd">${o.body || ''}</div>
      ${o.foot ? `<div class="modal-ft">${o.foot}</div>` : ''}
    </div>`;
    el.addEventListener('mousedown', (e) => { if (e.target === el) ui.closeModal(); });
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-modal');
    modalStack.push({ id, el, onClose: o.onClose, opener: document.activeElement });
    const first = el.querySelector('[autofocus], input, select, textarea, button:not(.x-btn)');
    setTimeout(() => first && first.focus(), 30);
    if (o.mount) o.mount(el);
    ui.afterRender(el);
    return el;
  };
  ui.closeModal = function () {
    const top = modalStack.pop();
    if (!top) return;
    top.el.remove();
    if (top.opener && document.contains(top.opener) && top.opener.focus) { try { top.opener.focus(); } catch (e) { /* ignore */ } }
    if (!modalStack.length) { document.body.style.overflow = ''; document.body.classList.remove('has-modal'); }
    if (top.onClose) top.onClose();
  };
  ui.modalEl = () => (modalStack.length ? modalStack[modalStack.length - 1].el : null);
  ui.drawer = (o) => ui.modal(Object.assign({ drawer: true }, o));

  ui.toast = function (msg, o) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon((o && o.icon) || 'check-circle')}<span>${msg}</span>${o && o.action ? `<button class="act" data-act="${esc(o.action.act)}" ${o.action.attrs || ''}>${esc(o.action.label)}</button>` : ''}`;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, (o && o.ms) || 3200);
  };

  /* ---------- Tooltip popover ---------- */
  let tipEl = null;
  function showTip(btn) {
    hideTip();
    tipEl = document.createElement('div');
    tipEl.className = 'tip-pop';
    tipEl.innerHTML = btn.getAttribute('data-tip');
    document.body.appendChild(tipEl);
    const r = btn.getBoundingClientRect();
    const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    let left = r.left + r.width / 2 - w / 2 + window.scrollX;
    left = Math.max(16 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 16));
    let top = r.top + window.scrollY - hgt - 10;
    if (r.top < hgt + 20) top = r.bottom + window.scrollY + 10;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
  ui.hideTip = hideTip;

  /* ---------- After render hook ---------- */
  ui.afterRender = function (root) { /* reserved for lazy wiring; views use mount() */ };

  /* ---------- Global delegation ---------- */
  document.addEventListener('click', (e) => {
    const tipBtn = e.target.closest('[data-tip]');
    if (tipBtn) { e.preventDefault(); if (tipEl) hideTip(); else showTip(tipBtn); return; }
    hideTip();
    const go = e.target.closest('[data-go]');
    if (go && !e.target.closest('[data-act]')) { e.preventDefault(); RN.go(go.dataset.go); return; }
    const el = e.target.closest('[data-act]');
    if (el) {
      const fn = RN.actions[el.dataset.act];
      if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
      else console.warn('No action registered:', el.dataset.act);
      return;
    }
    // Profile-view attribution: links to profiles may carry data-view-source (home, search, compare...)
    const a = e.target.closest('a[href^="#op."]');
    if (a) RN.store.state._viewSource = a.dataset.viewSource || (a.closest('[data-view-source]') && a.closest('[data-view-source]').dataset.viewSource) || 'card';
  });
  document.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-tip]'); if (t && window.matchMedia('(hover: hover)').matches) showTip(t); });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest('[data-tip]'); if (t && window.matchMedia('(hover: hover)').matches) hideTip(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t); });
  document.addEventListener('focusout', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && RN.inputs[el.dataset.input]) RN.inputs[el.dataset.input](el, e); });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && RN.inputs[el.dataset.change]) RN.inputs[el.dataset.change](el, e); });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-submit]');
    if (!f) return;
    e.preventDefault();
    const fn = RN.submits[f.dataset.submit];
    if (fn) fn(f, ui.formData(f), e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (tipEl) hideTip(); else if (document.querySelector('.menu-sheet') && RN.shell.closeMenu) RN.shell.closeMenu(); else ui.closeModal(); }
    // Keep focus inside the top modal or menu sheet
    if (e.key === 'Tab') {
      const box = document.querySelector('.menu-sheet') || (modalStack.length ? modalStack[modalStack.length - 1].el : null);
      if (!box) return;
      const f = RN.$$('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', box).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });

  /* Collect form values. Multi-value fields (chip sets, checkboxes with same name) become arrays. */
  ui.formData = function (form) {
    const out = {};
    RN.$$('input, select, textarea', form).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') { if (!Array.isArray(out[el.name])) out[el.name] = []; if (el.checked) out[el.name].push(el.value); return; }
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; return; }
      if (el.dataset.multi) { out[el.name] = el.value ? el.value.split('|').filter(Boolean) : []; return; }
      out[el.name] = el.value;
    });
    return out;
  };

  /* ---------- Core actions shared by every surface ---------- */
  RN.actions['modal-close'] = () => ui.closeModal();
  RN.actions['skip'] = () => { const m = document.getElementById('main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } };
  RN.actions['go'] = (el) => { ui.closeModal(); RN.go(el.dataset.to); };
  RN.actions['shortlist-toggle'] = (el) => {
    const id = el.dataset.id;
    const st = RN.store.state;
    const on = st.shortlist.includes(id);
    RN.store.update((s) => { s.shortlist = on ? s.shortlist.filter((x) => x !== id) : [id].concat(s.shortlist); }, 'shortlist');
    RN.track(on ? 'shortlist_remove' : 'shortlist_add', { opId: id });
    const op = RN.model.byId(id);
    ui.toast(on ? `Removed ${esc(op.first)} from your shortlist` : `Saved ${esc(op.first)} to your shortlist`, on ? {} : { action: { label: 'View shortlist', act: 'go', attrs: 'data-to="buyer.shortlist"' } });
    RN.rerender();
  };
  RN.actions['compare-toggle'] = (el) => {
    const id = el.dataset.id;
    const st = RN.store.state;
    const on = st.compare.includes(id);
    if (!on && st.compare.length >= 4) { ui.toast('Compare holds four operators. Remove one to add another.', { icon: 'info' }); return; }
    RN.store.update((s) => { s.compare = on ? s.compare.filter((x) => x !== id) : s.compare.concat(id); }, 'compare');
    if (!on) RN.track('compare_add', { opId: id });
    RN.rerender();
  };
})();
