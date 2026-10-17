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

  // The operator's own Studio shows the full tier and score at every tier; no score yet reads RN.fields.risNone
  function sideTier(op) {
    const t = RN.fields.risTierFor(op.ris && op.ris.score);
    return t ? `${esc(t.l)} · Reputation Index ${esc(op.ris.score)}` : `Reputation Index · ${esc(RN.fields.risNone.l)}`;
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
  // Phone tab strip (<=980px): bring the current tab into view; the strip otherwise opens scrolled to its first tab
  function centerSideTab(root) {
    const s = root && root.querySelector('.shell > .side'); const a = s && s.querySelector('a.on');
    if (!a || s.scrollWidth <= s.clientWidth + 1) return;
    const sr = s.getBoundingClientRect(), ar = a.getBoundingClientRect();
    s.scrollLeft = Math.max(0, s.scrollLeft + (ar.left - sr.left) - (sr.width - ar.width) / 2);
  }
  function mountTab(root, key) {
    centerSideTab(root);
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

/* ---------- Studio research contributions (RN.studio.cx) ----------
   Built on the shared core (RN.contrib, RN.share in js/core/contribute.js). Three pieces:
   - checkin(op): the quarterly check-in card on Overview. Step 1 is the Rate Index ('rate', rate and hours), step 2 is
     the operator Pulse ('pulse', pipeline outlook). After step 1 the result shows the rate against the index at once,
     and the result modal offers step 2 in the same modal. Both done: a quiet thanks state with the rate position.
   - insight(op): "Share an insight", the latest State of Fractional GTM findings for the operator's role category,
     opened in the share sheet with "Share with your take".
   - history(op): the contributions history on Credibility (what each fed, when), with the one line that
     contributions never change the Reputation Index.
   Each piece carries data-st-cx and repaints in place when contributions or field notes change. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon, fmt = RN.fmt;
  const C = () => RN.contrib, S = () => RN.share;
  const cx = (RN.studio.cx = {});
  const SRC = 'studio-checkin';
  const jsonAttr = (o) => esc(JSON.stringify(o || {}));
  const ready = () => !!(RN.contrib && RN.share);

  /* ---------- Findings for the operator's role (State of Fractional GTM, real figures only) ---------- */
  cx.findings = function (op) {
    const R = RN.data.market.report;
    const cat = op && op.catKey;
    const cl = cat ? RN.fields.catLabel(cat) : '';
    const out = [];
    const src = `State of Fractional GTM ${R.year}`;
    const base = { title: `The State of Fractional GTM ${R.year}`, route: 'report', kind: 'report' };
    const it = cat && (R.intent || []).find((x) => x.cat === cat);
    if (it) out.push(Object.assign({ k: 'intent', v: `${it.v}%`, l: `of companies plan to fill a fractional ${cl} seat in the next 12 months`, q: `${it.v}% of companies plan to fill a fractional ${cl} seat in the next 12 months`, src: `${src}, ${fmt.int(R.sample.companies)} companies` }, base));
    const rt = cat && (R.rateByCat || []).find((x) => x.cat === cat);
    if (rt) out.push(Object.assign({ k: 'rate', v: `${fmt.usd(rt.v)}/hr`, l: `median hourly rate for a fractional ${cl} leader`, q: `The median hourly rate for a fractional ${cl} leader is ${fmt.usd(rt.v)}/hr`, src: `${src}, ${fmt.int(R.sample.operators)} operators` }, base));
    const rh = (R.summary || []).find((x) => /^Rehire/.test(x.l));
    if (rh) out.push(Object.assign({ k: 'rehire', v: rh.v, l: `rehire rate for operators with three or more verified company reviews, compared with none`, q: `Operators with three or more verified company reviews are rehired ${rh.v} as often as those with none`, src }, base));
    out.forEach((f) => { f.quote = `${f.q} (${src}).`; });
    return out;
  };
  let pick = 0;
  const shareO = (f, mode) => ({ title: f.title, route: f.route, kind: f.kind, quote: f.quote, mode });

  /* ---------- Quarterly check-in (Overview) ---------- */
  cx.checkin = function (op) {
    if (!ready() || !op) return '';
    const P = C().period();
    const rate = C().done('rate');
    const pulse = C().done('pulse');
    const both = rate && pulse;
    const ctxRate = { cat: op.catKey, source: SRC };
    const step = (n, done, t, b, kind, ctx) => `<li class="${done ? 'is-done' : ''}">
        <span class="st-cx-n" aria-hidden="true">${done ? icon('check') : n}</span>
        <div class="grow"><b>${esc(t)}</b><span>${esc(b)}</span></div>
        ${done ? `<button type="button" class="act" data-act="cx-result" data-id="${esc(done.id)}">${kind === 'rate' ? 'Result' : 'Answers'}</button>` : `<span class="sr-only">Not done yet</span>`}
      </li>`;
    let pos = '';
    if (rate) {
      const a = rate.answers || {};
      const p = C().position(a.hourly, a.cat, a.rev);
      const lo = Math.min(p.p25 * 0.7, p.hourly * 0.9), hi = Math.max(p.p75 * 1.3, p.hourly * 1.1);
      const x = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100).toFixed(1);
      pos = `<div class="st-cx-pos">
          <p class="small"><b>${esc(fmt.usd(p.hourly))}/hr</b> is ${esc(C().bandText(p.band))} for ${esc(RN.fields.catLabel(a.cat))}${a.rev ? ` at ${esc(C().revLabel(a.rev))} companies` : ''}.</p>
          <div class="st-cx-track" role="img" aria-label="${esc(`Your rate ${fmt.usd(p.hourly)} an hour. Typical range ${fmt.hrRange(p.p25, p.p75)}, median ${fmt.usd(p.p50)} an hour.`)}"><i class="st-cx-iqr" style="left:${x(p.p25)}%;width:${(x(p.p75) - x(p.p25)).toFixed(1)}%"></i><i class="st-cx-med" style="left:${x(p.p50)}%"></i><i class="st-cx-pin" style="left:${x(p.hourly)}%"></i></div>
          <span class="tiny muted">Typical ${esc(fmt.hrRange(p.p25, p.p75))}, median ${esc(fmt.usd(p.p50))}/hr. ${esc(C().indexLabel().replace(/^./, (c) => c.toUpperCase()))}.</span>
        </div>`;
    }
    const next = !rate ? `<button type="button" class="btn btn-sm" data-act="cx-open" data-kind="rate" data-ctx="${jsonAttr(ctxRate)}">Start the ${esc(P.short)} check-in${icon('arrow')}</button>`
      : !pulse ? `<button type="button" class="btn btn-sm" data-act="cx-open" data-kind="pulse" data-ctx="${jsonAttr({ source: SRC })}">Next, your pipeline${icon('arrow')}</button>` : '';
    return `<section class="card sa-card st-cx st-cx-check${both ? ' is-done' : ''}" data-st-cx="checkin" aria-labelledby="st-cx-check-h">
      <div class="st-cx-hd">${RN.ui.icoTile(both ? 'check' : 'chart', { size: 'sm', tone: 'forest' })}<span class="eyebrow">${esc(P.short)} check-in · ${both ? `publishes ${esc(P.publishes)}` : `closes ${esc(P.closes)}`}</span></div>
      <h2 class="h4" id="st-cx-check-h">${both ? `You're in the ${esc(P.label)} index` : 'Your rate, hours and pipeline'}</h2>
      <p class="small st-cx-lede">${both ? `Your rate goes into the ${esc(P.label)} Rate Index and your answers into the ${esc(P.publishes)} Pulse. Next check-in opens with ${esc(nextQ(P))}.` : rate ? 'Your rate is in. One more step, about 30 seconds.' : `90 seconds, anonymous. You'll see your rate against the index right away.`}</p>
      ${pos}
      <ol class="st-cx-steps">
        ${step(1, rate, 'Rate and hours', 'Feeds the quarterly Rate Index', 'rate')}
        ${step(2, pulse, 'Pipeline outlook', 'Three taps. Feeds the Pulse and the Demand Index', 'pulse')}
      </ol>
      <div class="st-cx-ft">${next}<a class="act" href="#studio.credibility" data-act="st-cx-history">${both ? 'Your contributions' : 'Past contributions'}${icon('arrow')}</a></div>
    </section>`;
  };
  const nextQ = (P) => (P.q === 4 ? `Q1 ${P.y + 1}` : `Q${P.q + 1} ${P.y}`);

  /* ---------- Share an insight (Overview) ---------- */
  cx.insight = function (op) {
    if (!ready() || !op) return '';
    const list = cx.findings(op);
    if (!list.length) return '';
    if (pick >= list.length) pick = 0;
    const f = list[pick];
    return `<section class="card sa-card st-cx st-cx-share" data-st-cx="insight" aria-labelledby="st-cx-share-h">
      <div class="st-cx-hd">${RN.ui.icoTile('share', { size: 'sm', tone: 'enable' })}<span class="eyebrow">Revenue Nomad Research<span class="st-cx-hd-x"> · Share</span></span></div>
      <h2 class="h4" id="st-cx-share-h">Share an insight</h2>
      <p class="small st-cx-lede">Findings for ${esc(RN.fields.catLabel(op.catKey))} from the latest State of Fractional GTM, ready to post with your take.</p>
      ${list.length > 1 ? `<div class="seg st-cx-pick" role="group" aria-label="Pick a finding">${list.map((x, i) => `<button type="button" data-act="st-cx-pick" data-i="${i}" aria-pressed="${i === pick}">${esc(x.k === 'intent' ? 'Demand' : x.k === 'rate' ? 'Rates' : 'Rehire')}</button>`).join('')}</div>` : ''}
      <figure class="st-cx-fig">
        <span class="st-cx-v">${esc(f.v)}</span>
        <blockquote><p>${esc(f.l.replace(/^./, (c) => c.toUpperCase()))}.</p></blockquote>
        <figcaption class="tiny muted">${esc(f.src)}. ${RN.ui.illus()}</figcaption>
      </figure>
      <div class="st-cx-ft">${S().button(shareO(f, 'take'), 'Share with your take', 'btn btn-sm')}${S().button(shareO(f), 'Share link', 'btn btn-line btn-sm')}</div>
    </section>`;
  };
  RN.actions['st-cx-pick'] = (el) => { pick = +el.dataset.i || 0; repaint('insight'); const b = document.querySelector(`[data-st-cx="insight"] [data-act="st-cx-pick"][data-i="${pick}"]`); if (b) b.focus(); };

  /* ---------- Contributions history (Credibility) ---------- */
  const STATUS = { done: ['Added', 'pill-good'], partial: ['Started', ''], draft: ['Saved draft', ''], in_review: ['In review', 'pill-warn'], approved: ['Live', 'pill-good'], declined: ['Not published', ''] };
  const DS_ICON = { rateIndex: ['chart', 'forest'], report2028: ['book', 'enable'], pulse: ['wave', 'info'], fieldNotes: ['edit', 'sales'] };
  function rowAct(r) {
    if (r.kind === 'insight') { const g = RN.research && RN.research.guideFor ? RN.research.guideFor(r.guideId) : null; return g ? `<a class="act" href="#guide.${esc(g.slug || g.id)}">Open guide</a>` : ''; }
    if (r.kind === 'survey' && r.status === 'draft') return `<button type="button" class="act" data-act="cx-open" data-kind="survey" data-ctx="${jsonAttr({ source: 'studio-history' })}">Continue</button>`;
    if (['rate', 'paid', 'pulse', 'survey'].includes(r.kind)) return `<button type="button" class="act" data-act="cx-result" data-id="${esc(r.id)}">${r.kind === 'rate' || r.kind === 'paid' ? 'See result' : 'See answers'}</button>`;
    return '';
  }
  cx.history = function (op) {
    if (!ready() || !op) return '';
    const rows = C().mine({ drafts: true });
    const P = C().period();
    const open = [];
    if (!C().done('rate') || !C().done('pulse')) open.push(`<p class="st-cx-open-l">${icon('chart')}<span>The ${esc(P.short)} check-in is open until ${esc(P.closes)}. <a class="act" href="#studio" data-act="st-cx-go-check">Do it on Overview${icon('arrow')}</a></span></p>`);
    open.push(C().cta('survey', { variant: 'line', ctx: { source: 'studio-history' } }));
    const f = cx.findings(op)[0];
    return `<section class="card st-cx st-cx-hist" id="sb-c-research" data-st-cx="history" aria-labelledby="st-cx-hist-h">
      <div class="card-hd"><div class="grow"><h3 id="st-cx-hist-h">Your research contributions</h3><p class="sub">What you added to Revenue Nomad Research and what each one fed. Rates, Pulse and survey answers are published only in aggregate. Field notes carry your byline once approved. Nothing here changes your Reputation Index.</p></div>
        ${f ? S().button(shareO(f, 'take'), 'Share an insight', 'btn btn-line btn-sm') : ''}</div>
      ${rows.length ? `<ol class="st-cx-list">${rows.map((r) => {
        const di = DS_ICON[r.dataset] || ['chart', 'forest'];
        const s = STATUS[r.status] || STATUS.done;
        return `<li>
          ${RN.ui.icoTile(di[0], { size: 'sm', tone: di[1], soft: true })}
          <div class="grow"><b>${esc(r.summary)}</b><span class="tiny muted">Fed ${esc(r.fed.replace(/^The /, 'the '))}${r.periodLabel ? ` · ${esc(r.periodLabel)}` : ''} · ${esc(fmt.date(r.createdAt))}</span></div>
          <span class="pill ${s[1]}">${esc(s[0])}</span>
          <span class="st-cx-act">${rowAct(r)}</span>
        </li>`;
      }).join('')}</ol>` : `<div class="st-cx-empty">${icon('chart')}<div><b>Nothing added yet</b><span class="small muted">Your rates, Pulse answers, survey answers and field notes show here, with what each one fed.</span></div></div>`}
      <div class="st-cx-open"><span class="label">Open now</span>${open.join('')}</div>
    </section>`;
  };

  /* ---------- Navigation ---------- */
  RN.actions['st-cx-history'] = (el, e) => {
    if (e && e.preventDefault) e.preventDefault();
    const go = () => { const t = document.getElementById('sb-c-research'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); const h = t.querySelector('h3'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } } };
    if (location.hash === '#studio.credibility') go(); else { location.hash = 'studio.credibility'; setTimeout(go, 350); }
  };
  RN.actions['st-cx-go-check'] = (el, e) => {
    if (e && e.preventDefault) e.preventDefault();
    const go = () => { const t = document.querySelector('[data-st-cx="checkin"]'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); const b = t.querySelector('.btn'); if (b) b.focus({ preventScroll: true }); } };
    if (location.hash === '#studio' || location.hash === '#studio.overview') go(); else { location.hash = 'studio'; setTimeout(go, 350); }
  };

  /* ---------- Repaint in place ---------- */
  function repaint(which) {
    const op = RN.myOp && RN.myOp();
    if (!op) return;
    RN.$$('[data-st-cx]').forEach((el) => {
      const k = el.dataset.stCx;
      if (which && k !== which) return;
      if (el.contains(document.activeElement) && !which) return;
      const html = (cx[k === 'checkin' ? 'checkin' : k === 'insight' ? 'insight' : 'history'])(op);
      const t = document.createElement('div'); t.innerHTML = html.trim();
      if (t.firstElementChild) el.replaceWith(t.firstElementChild); else el.remove();
    });
  }
  /* The check-in chains its two steps: when the rate result opens from the check-in and the Pulse is not done yet,
     the result's footer offers the Pulse in the same modal (the core has no "next" hook; see the stage 2 notes). */
  function offerNext() {
    const m = document.querySelector('.cx-modal');
    if (!m || !m.querySelector('[data-cx-flow="rate"] .cx-res') || C().done('pulse')) return;
    const rec = C().done('rate');
    if (!rec || rec.source !== SRC) return;
    const ft = m.querySelector('.modal-ft');
    if (!ft || ft.querySelector('[data-st-cx-next]')) return;
    const done = ft.querySelector('[data-act="modal-close"]');
    const b = document.createElement('span');
    b.innerHTML = `<button type="button" class="btn" data-st-cx-next data-act="cx-open" data-kind="pulse" data-ctx="${jsonAttr({ source: SRC })}">Next, your pipeline${icon('arrow')}</button>`;
    if (done) { done.className = 'btn btn-ghost'; done.textContent = 'Later'; done.after(b.firstElementChild); } else ft.appendChild(b.firstElementChild);
  }
  RN.store.on((key) => {
    if (key !== 'contributions' && key !== 'answers' && key !== '*') return;
    setTimeout(() => { if (document.querySelector('[data-st-cx]')) repaint(); offerNext(); }, 0);
  });
})();
