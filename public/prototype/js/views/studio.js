/* Operator Studio shell. Tabs are registered by studio-*.js files:
     RN.studio.tab('visibility', { label, icon, group, order, badge: (op) => n, render: (op) => html, mount: (root, op) => {} })
   Route: #studio (overview) and #studio.<tab>. The signed-in operator is RN.myOp(). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const studio = (RN.studio = RN.studio || { tabs: {} });
  studio.tab = function (key, def) { def.key = key; studio.tabs[key] = def; return def; };
  studio.list = () => Object.values(studio.tabs).sort((a, b) => (a.order || 99) - (b.order || 99));

  // The operator's own Studio shows the full tier and score at every tier; before approval there is no tier
  function sideTier(op) {
    const t = RN.fields.risTierFor(op.ris && op.ris.score);
    return t ? `${esc(t.l)} · Reputation Index ${esc(op.ris.score)}` : 'Reputation Index not scored yet';
  }
  function side(op, cur) {
    const groups = {};
    studio.list().forEach((t) => { (groups[t.group || 'Studio'] = groups[t.group || 'Studio'] || []).push(t); });
    return `<nav class="side" aria-label="Studio">
      <div class="side-id">${RN.ui.avatar(op, 'ava-md')}<div><b>${esc(op.name)}</b><span>${sideTier(op)}</span></div></div>
      ${Object.keys(groups).map((g, gi) => `${gi ? '<div class="side-sep"></div>' : ''}<span class="label side-label">${esc(g)}</span>
        ${groups[g].map((t) => { const n = t.badge ? t.badge(op) : 0; return `<a href="#studio${t.key === 'overview' ? '' : '.' + t.key}" class="${cur === t.key ? 'on' : ''}">${icon(t.icon || 'chart')}${esc(t.label)}${n ? `<span class="nav-count">${n}</span>` : ''}</a>`; }).join('')}`).join('')}
      <div class="side-sep"></div>
      <a href="#op.${esc(op.slug)}">${icon('eye')}View public profile</a>
    </nav>`;
  }

  RN.view('studio', {
    route: 'studio', nav: '', requires: 'operator', footer: false,
    title: () => 'Studio',
    render: () => render('overview'),
    mount: (root) => mountTab(root, 'overview'),
  });
  RN.view('studio-tab', {
    route: 'studio.:tab', nav: '', requires: 'operator', footer: false,
    samples: { tab: 'visibility', extra: [] },
    title: (p) => (studio.tabs[p.tab] ? studio.tabs[p.tab].label : 'Studio') + ' · Studio',
    render: (p) => render(p.tab),
    mount: (root, p) => mountTab(root, p.tab),
  });
  // every registered tab gets a smoke-test route
  setTimeout(() => { RN.views['studio-tab'].samples.extra = Object.keys(studio.tabs).filter((k) => k !== 'overview').map((k) => 'studio.' + k); }, 0);

  function render(key) {
    RN.model.applyEdits();
    const op = RN.myOp();
    const t = studio.tabs[key];
    const body = t ? t.render(op) : `<div class="empty">${icon('info')}<b>This part of Studio is being built</b></div>`;
    return `<div class="wrap shell" data-studio="${esc(key)}">${side(op, key)}<div class="studio-main" style="min-width:0">${body}</div></div>`;
  }
  function mountTab(root, key) {
    const t = studio.tabs[key];
    const op = RN.myOp();
    if (t && t.mount) t.mount(root, op);
    if (pendingLadder && key === 'credibility') { pendingLadder = false; scrollToLadder(root); }
    tierUpCheck(op);
  }

  /* ---------- Tier-up moment ----------
     When the Reputation Index crosses into a higher tier (a company review lands, a recent engagement is confirmed),
     Studio shows a short reveal once: the new badge scales in (Elite and Apex with their sheen, the others with a soft
     pulse), the score and the two things the tier unlocks. The last tier seen per operator lives in RN.store
     (seen.tierSeen), so each crossing shows once. A drop or the first visit is recorded quietly.
     Reviewer mode: "Preview tier-up" on Credibility (data-proto) opens it without changing data.
     prefers-reduced-motion: the same content, no animation (css/views/studio.css). */
  const TIER_KEY = 'tierSeen';
  let pendingLadder = false;
  const tierFor = (op) => RN.fields.risTierFor(op && op.ris ? op.ris.score : null);
  function seenTier(op) { const m = (RN.store.state.seen || {})[TIER_KEY] || {}; return Object.prototype.hasOwnProperty.call(m, op.id) ? m[op.id] : undefined; }
  function setSeenTier(op, v) {
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen[TIER_KEY] = Object.assign({}, s.seen[TIER_KEY] || {}, { [op.id]: v }); }, 'seen');
  }
  function tierUpCheck(op) {
    if (!op) return;
    const t = tierFor(op);
    const cur = t ? t.v : null;
    const was = seenTier(op);
    if (was === cur) return;
    setSeenTier(op, cur);
    // Only a climb from one tier to a higher one is a tier-up (approval into Emerging has its own email)
    if (was && cur && RN.ui.tierRank(cur) > RN.ui.tierRank(was) && !document.querySelector('.st-tu')) setTimeout(() => showTierUp(op, t), 250);
  }
  function showTierUp(op, t, o) {
    o = o || {};
    if (!op || !t) return;
    const score = o.score != null ? o.score : op.ris.score;
    const unlocks = (RN.fields.risUnlocks[t.v] || []).slice(0, 2);
    const gold = t.v === 'elite' || t.v === 'apex';
    const others = RN.fields.risTier.options.filter((x) => RN.ui.tierRank(x.v) >= 1).slice().reverse();
    RN.ui.modal({
      title: `You reached ${esc(t.l)}`,
      width: 460,
      body: `<div class="st-tu-body">
          ${o.preview ? '<span class="pill st-tu-prev" data-proto>Preview, no data changed</span>' : ''}
          <div class="st-tu-stage ${gold ? 'is-gold' : 'is-pulse'} t-${esc(t.v)}" aria-hidden="true">
            <span class="st-tu-ring"></span>
            <span class="st-tu-badge">${RN.ui.tierBadge(t.v, { size: 112, score, label: `${t.l}, Reputation Index ${score}` })}</span>
          </div>
          <p class="st-tu-score">Reputation Index <b class="num">${esc(score)}</b><span>${esc(t.l)} runs ${t.min} to ${t.max}</span></p>
          ${unlocks.length ? `<div class="st-tu-unlocks"><span class="label">Now unlocked</span><ul>${unlocks.map((u) => `<li>${RN.icon('check-circle')}<span>${esc(u)}</span></li>`).join('')}</ul></div>` : ''}
          ${o.preview ? `<div class="st-tu-try" data-proto><span class="tiny muted">Preview another tier</span><div class="row" style="--gap:6px">${others.map((x) => `<button type="button" class="chip chip-sm" data-act="st-tierup-preview" data-v="${esc(x.v)}" aria-pressed="${x.v === t.v}">${esc(x.l)}</button>`).join('')}</div></div>` : ''}
        </div>`,
      foot: `<button type="button" class="btn btn-ghost btn-sm" data-act="modal-close">Close</button><button type="button" class="btn btn-sm" data-act="st-tierup-next">See what's next${RN.icon('arrow')}</button>`,
      mount: (el) => { const m = el.querySelector('.modal'); if (m) m.classList.add('st-tu'); const b = el.querySelector('[data-act="st-tierup-next"]'); if (b) setTimeout(() => b.focus(), 40); },
    });
  }
  function scrollToLadder(root) {
    const el = (root || document).querySelector('.sb-ladder');
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const h = el.querySelector('h3');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  studio.showTierUp = showTierUp;
  RN.actions['st-tierup-next'] = () => {
    RN.ui.closeModal();
    if (location.hash === '#studio.credibility') scrollToLadder(document);
    else { pendingLadder = true; location.hash = 'studio.credibility'; }
  };
  RN.actions['st-tierup-preview'] = (el) => {
    const op = RN.myOp();
    const cur = tierFor(op);
    const t = el.dataset.v ? RN.fields.risTier.options.find((x) => x.v === el.dataset.v) : cur;
    if (!op || !t) return;
    if (document.querySelector('.st-tu')) RN.ui.closeModal();
    // A previewed tier other than the operator's own shows that tier's entry score
    showTierUp(op, t, { preview: true, score: cur && cur.v === t.v ? op.ris.score : t.min });
  };
})();
