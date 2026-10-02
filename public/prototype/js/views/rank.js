/* Ranked search (RN.rank): the Browse view for a free-text search. Every operator is force-ranked by
   RN.vsearch and shown as one row: a match ring, one dot per need (filled = a client proved it, half = they
   say they can, dashed = close, hollow = missing) and a tick or cross per fact. Pictures first, few words.
   Browse renders RN.rank.html(text, pool) into #br-results and calls RN.rank.mount() after; mount animates
   the rows and asks Claude to refine the needs, then re-ranks in place with the rows gliding to new spots. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const RK = (RN.rank = RN.rank || {});
  const FIRST = 12;
  const COLORS = ['var(--cat-sales)', 'var(--cat-revops)', 'var(--cat-mkt)', 'var(--cat-enable)', 'var(--cat-ai)'];
  const FACT_IC = { roleCategories: 'user', revenueRange: 'building', employeeRange: 'users', industries: 'briefcase', availability: 'calendar', hoursPerMonth: 'clock', rateMax: 'chart', engagementTypes: 'handshake', locations: 'pin', timeZones: 'clock', usHours: 'pin' };
  const WORD = { proven: 'A client proved it', claimed: 'Says they can', close: 'Close', missing: 'Not yet' };
  const MEANS = { proven: 'A client confirmed they have done this.', claimed: 'On their profile, not yet confirmed by a client.', close: 'Related experience, not an exact match.', missing: 'Nothing on their profile for this yet.' };
  const showAll = new Set();

  const needsFor = (text) => (RN.vsearch.refined(text) || RN.vsearch.localNeeds(text));

  function ring(pct, big) {
    const r = big ? 26 : 21, c = 2 * Math.PI * r, s = big ? 64 : 52;
    return `<span class="rk-ring${big ? ' is-big' : ''}" style="--c:${c.toFixed(1)};--p:${(c * (1 - pct / 100)).toFixed(1)}" role="img" aria-label="${pct}% match">
      <svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true"><circle class="rk-ring-bg" cx="${s / 2}" cy="${s / 2}" r="${r}"/><circle class="rk-ring-fg" cx="${s / 2}" cy="${s / 2}" r="${r}" transform="rotate(-90 ${s / 2} ${s / 2})"/></svg>
      <b>${pct}<small>%</small></b></span>`;
  }
  function dot(m, i) {
    const tip = `${m.need.label}: ${WORD[m.status]}${m.status !== 'missing' && m.via ? ` (${m.via})` : ''}`;
    const pop = `<b>${esc(m.need.label)}</b><br>${esc(WORD[m.status])}. ${esc(MEANS[m.status])}${m.status !== 'missing' && m.via ? `<br><span class="muted">From: ${esc(m.via)}</span>` : ''}`;
    return `<span class="rk-dot" data-s="${m.status}" style="--k:${COLORS[i % COLORS.length]};--d:${i}" data-tip="${esc(pop)}"><span class="sr-only">${esc(tip)}</span>${m.status === 'proven' ? icon('check') : m.status === 'missing' ? '' : ''}</span>`;
  }
  function fact(c) {
    return `<span class="rk-fact${c.ok ? ' is-ok' : ''}" data-tip="${esc(`<b>${esc(c.label)}</b><br>${c.ok ? 'Yes, this matches.' : 'No, this doesn’t match.'}`)}">${icon(FACT_IC[c.k] || 'check')}<i aria-hidden="true">${c.ok ? '✓' : '✕'}</i><span class="sr-only">${esc(c.label)}: ${c.ok ? 'yes' : 'no'}</span></span>`;
  }
  // Worked with companies like yours: one segment per profile fact (industry, revenue, size)
  function like(r) {
    if (!r.like || !r.like.length) return '';
    const n = r.like.filter((c) => c.ok).length, all = n === r.like.length;
    const tip = 'Worked with companies like yours: ' + r.like.map((c) => `${c.label} ${c.ok ? '✓' : '✕'}`).join(', ');
    const pop = `<b>Worked with companies like yours</b><br>${r.like.map((c) => `${c.ok ? '✓' : '✕'} ${esc(c.label)}`).join('<br>')}`;
    return `<span class="rk-like${all ? ' is-ok' : n ? ' is-part' : ''}" data-tip="${esc(pop)}">${icon('building')}<span class="rk-like-m" aria-hidden="true">${r.like.map((c) => `<i class="${c.ok ? 'on' : ''}"></i>`).join('')}</span><span class="sr-only">${esc(tip)}</span></span>`;
  }
  function side(op) {
    const client = RN.store.state.persona === 'buyer';
    const rate = !op.rate ? '' : client ? `<span class="rk-rate">${esc(RN.fmt.rate(op.rate))}</span>`
      : RN.store.state.persona === 'visitor' ? `<button type="button" class="rk-rate is-locked" data-act="fm-rates">${icon('lock')}Rate</button>` : '';
    return `<span class="rk-ris">${RN.ui.tierPill(op.ris.tier, op.ris.score)}${rate}</span>`;
  }
  function acts(op) {
    const saved = RN.store.state.shortlist.includes(op.id);
    const client = RN.store.state.persona === 'buyer';
    return `<span class="rk-acts">
      <button type="button" class="rk-act${saved ? ' on' : ''}" data-act="rk-save" data-id="${esc(op.id)}" aria-pressed="${saved}" title="${saved ? 'Saved to shortlist' : 'Save to shortlist'}">${icon('bookmark')}<span class="sr-only">${saved ? 'Saved' : 'Save'} ${esc(op.name)}</span></button>
      ${client ? `<button type="button" class="rk-act is-meet" data-act="rk-meet" data-id="${esc(op.id)}" title="Ask to meet ${esc(op.first)}">${icon('handshake')}<span>Meet</span></button>` : ''}
    </span>`;
  }
  function row(r, i) {
    const op = r.op, h = r.hist;
    return `<li class="rk-row${i === 0 ? ' is-first' : ''}${h && h.k === 'declined' ? ' is-dim' : ''}" data-id="${esc(op.id)}" style="--i:${Math.min(i, 14)}">
      <a class="rk-link" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}" aria-label="${esc(op.name)}, ${r.match}% match${h ? ', ' + esc(h.l) : ''}"></a>
      <span class="rk-n" aria-hidden="true">${i + 1}</span>
      <span class="rk-who">${RN.ui.avatar(op, 'ava-md')}<span class="rk-name"><b>${esc(op.name)}</b><span>${h ? `<em class="rk-hist" data-h="${h.k}">${esc(h.l)}</em>` : ''}${esc(RN.fields.catLabel(op.catKey))}</span></span></span>
      <span class="rk-needs">${r.meets.map(dot).join('') || `<span class="rk-none">${icon('search')}</span>`}</span>
      <span class="rk-facts">${like(r)}${r.checks.map(fact).join('')}</span>
      ${side(op)}
      ${ring(r.match, i === 0)}
      ${acts(op)}
    </li>`;
  }

  function head(res, text, refined) {
    const n = res.rows.length;
    const pills = res.needs.map((nd, i) => {
      const proven = res.rows.filter((r) => r.meets[i] && (r.meets[i].status === 'proven' || r.meets[i].status === 'claimed')).length;
      return `<li class="rk-need" style="--k:${COLORS[i % COLORS.length]};--w:${n ? Math.round((proven / n) * 100) : 0}%" title="${esc(nd.tag)}">
        <span class="rk-need-l"><i aria-hidden="true"></i>${esc(nd.label)}</span>
        <span class="rk-need-bar" aria-hidden="true"><span></span></span>
        <span class="rk-need-n">${proven} can do it</span>
      </li>`;
    }).join('');
    const facts = res.facts.map((f) => `<span class="rk-fchip">${icon(FACT_IC[f.k] || 'check')}${esc(f.label)}</span>`).join('');
    return `<div class="rk-head">
      ${RN.fitme ? RN.fitme.headHtml(res, text) : ''}
      <div class="rk-head-top"><span class="label">What you need</span></div>
      ${pills ? `<ol class="rk-needs-key">${pills}</ol>` : `<p class="rk-empty-needs">Ranked by how closely each profile matches your words.</p>`}
      ${facts ? `<div class="rk-fchips"><span class="label">Also checking</span>${facts}</div>` : ''}
      <div class="rk-legend" aria-hidden="true">
        <span><span class="rk-dot" data-s="proven" style="--k:var(--mute)">${icon('check')}</span>Proved</span>
        <span><span class="rk-dot" data-s="claimed" style="--k:var(--mute)"></span>Says so</span>
        <span><span class="rk-dot" data-s="close" style="--k:var(--mute)"></span>Close</span>
        <span><span class="rk-dot" data-s="missing" style="--k:var(--mute)"></span>Missing</span>
        ${res.like && res.like.length ? `<span><span class="rk-like is-ok">${icon('building')}<span class="rk-like-m"><i class="on"></i><i class="on"></i><i class="on"></i></span></span>Worked with companies like yours</span>` : ''}
      </div>
    </div>`;
  }

  let lastText = '';
  // One ranking for both views: the ranked rows and the Cards grid show the same people in the same order
  function compute(text, pool) {
    const FM = RN.fitme;
    const opts = { pool, profile: FM && FM.profile(), profileWins: FM && FM.profileWins(text) };
    let needs = needsFor(text);
    let res = RN.vsearch.rank(text, needs, opts);
    // A need nobody on the network has can't change the order; drop it so every pill tells something
    const has = (i) => res.rows.some((r) => r.meets[i] && (r.meets[i].status === 'proven' || r.meets[i].status === 'claimed'));
    const keep = needs.filter((n, i) => has(i));
    if (keep.length && keep.length < needs.length) { needs = keep; res = RN.vsearch.rank(text, needs, opts); }
    // A signed-in client's history nudges the order (hired before first, declined last); the ring keeps the match
    if (FM) { res.rows.forEach((r) => { r.hist = FM.history(r.op.id); }); res.rows.sort((a, b) => (b.score + (b.hist ? b.hist.bonus : 0)) - (a.score + (a.hist ? a.hist.bonus : 0))); }
    return res;
  }
  RK.rows = (text, pool) => compute(text, pool).rows;
  // The one-line reason on a card: the needs this person can do, else how close they are to the words
  RK.why = function (r) {
    const can = r.meets.filter((m) => m.status === 'proven' || m.status === 'claimed').map((m) => m.need.label);
    return `${r.match}% match · ` + (can.length ? can.slice(0, 2).join(', ') : 'closest to your words');
  };
  RK.html = function (text, pool) {
    const refined = !!RN.vsearch.refined(text);
    const FM = RN.fitme;
    const res = compute(text, pool);
    const all = showAll.has(text);
    const rows = all ? res.rows : res.rows.slice(0, FIRST);
    const items = rows.map(row);
    if (FM && FM.showCard(text)) items.splice(Math.min(3, items.length), 0, FM.cardHtml(text));
    const again = lastText === text;
    lastText = text;
    return `<div class="rk${again ? ' is-settled' : ''}" data-rk-text="${esc(text)}">
      ${head(res, text, refined)}
      <ol class="rk-list" aria-label="Operators ranked for your search">${items.join('')}</ol>
      ${!all && res.rows.length > FIRST ? `<div class="rk-more"><button type="button" class="btn btn-line" data-act="rk-all">Show all ${res.rows.length} ranked</button></div>` : ''}
    </div>`;
  };

  // Re-render in place; rows that stay on screen glide from their old spot to the new one (FLIP)
  function rerender(box, pool) {
    const before = new Map(RN.$$('.rk-row', box).map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
    const rankOf = new Map(RN.$$('.rk-row', box).map((el, i) => [el.dataset.id, i]));
    box.outerHTML = RK.html(box.dataset.rkText, pool);
    const fresh = document.querySelector('.rk');
    if (!fresh) return;
    fresh.classList.add('is-settled');
    RN.$$('.rk-row', fresh).forEach((el) => {
      const was = before.get(el.dataset.id);
      if (was == null) return;
      const up = rankOf.get(el.dataset.id) - RN.$$('.rk-row', fresh).indexOf(el);
      if (up > 0) { const n = el.querySelector('.rk-n'); if (n) { n.insertAdjacentHTML('beforeend', `<span class="rk-up">▲${up}</span>`); setTimeout(() => { const u = n.querySelector('.rk-up'); if (u) u.remove(); }, 2600); } }
      const dy = was - el.getBoundingClientRect().top;
      if (!dy) return;
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'none';
      requestAnimationFrame(() => { el.style.transition = 'transform .6s var(--ease)'; el.style.transform = ''; });
    });
  }

  let pending = null, poolFn = null, io = null;
  RK.rerender = function () { const box = document.querySelector('.rk'); if (box && poolFn) { rerender(box, poolFn()); watchScroll(); } };
  // Scrolling past row 6 counts as a first real action: the question card slides in at row 4 without moving the page
  function watchScroll() {
    if (io) { io.disconnect(); io = null; }
    const FM = RN.fitme;
    if (!FM || RN.store.state.persona !== 'visitor' || !('IntersectionObserver' in window)) return;
    const target = RN.$$('.rk-row')[5];
    if (!target) return;
    io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect(); io = null;
      const box = document.querySelector('.rk');
      if (!box || !FM.engage('scroll')) return;
      const text = box.dataset.rkText;
      const at = RN.$$('.rk-row', box)[3];
      if (at && !box.querySelector('.rk-ask') && FM.showCard(text)) at.insertAdjacentHTML('beforebegin', FM.cardHtml(text));
    });
    io.observe(target);
  }
  RK.mount = function (getPool) {
    const box = document.querySelector('.rk');
    if (!box) return;
    poolFn = getPool;
    const text = box.dataset.rkText;
    if (RN.fitme) {
      const engagedBefore = RN.fitme.showCard(text);
      RN.fitme.noteSearch(text);
      if (!engagedBefore && RN.fitme.showCard(text) && !box.querySelector('.rk-ask')) { const at = RN.$$('.rk-row', box)[3]; if (at) at.insertAdjacentHTML('beforebegin', RN.fitme.cardHtml(text)); }
    }
    watchScroll();
    if (RN.vsearch.refined(text)) return;
    if (pending && pending.text === text) return;
    if (pending) pending.ctl.abort();
    const ctl = new AbortController();
    pending = { text, ctl };
    RN.vsearch.refineNeeds(text, ctl.signal).then((needs) => {
      if (!pending || pending.text !== text) return;
      pending = null;
      const cur = document.querySelector('.rk');
      if (!cur || cur.dataset.rkText !== text) return;
      if (needs) rerender(cur, getPool());
    });
  };
  RK.reset = () => { if (pending) { pending.ctl.abort(); pending = null; } if (io) { io.disconnect(); io = null; } lastText = ''; };

  RN.actions['rk-save'] = (el) => {
    const added = !RN.store.state.shortlist.includes(el.dataset.id);
    RN.actions['shortlist-toggle'](el);
    if (RN.fitme) RN.fitme.afterShortlist(added);
  };
  // Ask to meet carries the search into the intro: the needs read from it, how this operator meets each, and the
  // closest "What do you need?" option (by the framework area of each need, first need counting most)
  const AXIS_NEED = { 'Generate demand': 'pipeline', 'Win deals': 'sales_motion', 'Lead & plan': 'sales_motion', 'Build the team': 'team', 'Retain & expand': 'retention', 'Systems & data': 'systems' };
  const CAT_NEED = { ai_gtm: 'ai', partnerships: 'partners' };
  RK.meetContext = function (opId) {
    const box = document.querySelector('.rk');
    if (!box || !poolFn) return null;
    const text = box.dataset.rkText;
    const res = compute(text, poolFn());
    const r = res.rows.find((x) => x.op.id === opId);
    const votes = {};
    res.needs.forEach((n, i) => {
      const info = RN.model.tagInfo(n.tag) || {};
      const k = CAT_NEED[info.c] || AXIS_NEED[info.axis];
      if (k) votes[k] = (votes[k] || 0) + (res.needs.length - i);
    });
    const need = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || '';
    return { text, need, match: r ? r.match : null, needs: res.needs.map((n, i) => ({ label: n.label, status: r && r.meets[i] ? r.meets[i].status : 'missing', color: COLORS[i % COLORS.length] })) };
  };
  RK.dotMini = (n) => `<span class="rk-dot" data-s="${n.status}" style="--k:${n.color};animation:none">${n.status === 'proven' ? icon('check') : ''}</span>`;
  RN.actions['rk-meet'] = (el) => {
    const ctx = RK.meetContext(el.dataset.id);
    if (!ctx) { RN.intro.open(el.dataset.id); return; }
    const note = `${ctx.text}${ctx.needs.length ? `\n\nWhat we need: ${ctx.needs.map((n) => n.label).join(', ')}.` : ''}`;
    RN.intro.open(el.dataset.id, Object.assign({ note, search: ctx }, ctx.need ? { need: ctx.need } : {}));
  };

  RN.actions['rk-all'] = () => {
    const box = document.querySelector('.rk');
    if (!box) return;
    showAll.add(box.dataset.rkText);
    if (RN.browse && RN.browse.refresh) RN.browse.refresh();
  };
})();
