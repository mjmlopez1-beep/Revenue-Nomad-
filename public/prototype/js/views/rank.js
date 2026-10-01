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
    return `<span class="rk-dot" data-s="${m.status}" style="--k:${COLORS[i % COLORS.length]};--d:${i}" title="${esc(tip)}"><span class="sr-only">${esc(tip)}</span>${m.status === 'proven' ? icon('check') : m.status === 'missing' ? '' : ''}</span>`;
  }
  function fact(c) {
    return `<span class="rk-fact${c.ok ? ' is-ok' : ''}" title="${esc(c.label)}: ${c.ok ? 'yes' : 'no'}">${icon(FACT_IC[c.k] || 'check')}<i aria-hidden="true">${c.ok ? '✓' : '✕'}</i><span class="sr-only">${esc(c.label)}: ${c.ok ? 'yes' : 'no'}</span></span>`;
  }
  function row(r, i) {
    const op = r.op;
    return `<li class="rk-row${i === 0 ? ' is-first' : ''}" data-id="${esc(op.id)}" style="--i:${Math.min(i, 14)}">
      <a class="rk-link" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}" aria-label="${esc(op.name)}, ${r.match}% match"></a>
      <span class="rk-n" aria-hidden="true">${i + 1}</span>
      <span class="rk-who">${RN.ui.avatar(op, 'ava-md')}<span class="rk-name"><b>${esc(op.name)}</b><span>${esc(RN.fields.catLabel(op.catKey))}</span></span></span>
      <span class="rk-needs">${r.meets.map(dot).join('') || `<span class="rk-none">${icon('search')}</span>`}</span>
      <span class="rk-facts">${r.checks.map(fact).join('')}</span>
      <span class="rk-ris">${RN.ui.tierPill(op.ris.tier, op.ris.score)}</span>
      ${ring(r.match, i === 0)}
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
    const src = refined
      ? `<span class="rk-src is-ai">${icon('ai')}Read by Claude</span>`
      : `<span class="rk-src" data-rk-src>${icon('hourglass')}Quick read<span class="rk-src-more"> · Claude is refining</span></span>`;
    return `<div class="rk-head">
      <div class="rk-head-top"><span class="label">What you need</span>${src}</div>
      ${pills ? `<ol class="rk-needs-key">${pills}</ol>` : `<p class="rk-empty-needs">Ranked by how closely each profile matches your words.</p>`}
      ${facts ? `<div class="rk-fchips"><span class="label">Also checking</span>${facts}</div>` : ''}
      <div class="rk-legend" aria-hidden="true">
        <span><span class="rk-dot" data-s="proven" style="--k:var(--mute)">${icon('check')}</span>Proved</span>
        <span><span class="rk-dot" data-s="claimed" style="--k:var(--mute)"></span>Says so</span>
        <span><span class="rk-dot" data-s="close" style="--k:var(--mute)"></span>Close</span>
        <span><span class="rk-dot" data-s="missing" style="--k:var(--mute)"></span>Missing</span>
      </div>
    </div>`;
  }

  RK.html = function (text, pool) {
    const refined = !!RN.vsearch.refined(text);
    let needs = needsFor(text);
    let res = RN.vsearch.rank(text, needs, { pool });
    // A need nobody on the network has can't change the order; drop it so every pill tells something
    const has = (i) => res.rows.some((r) => r.meets[i] && (r.meets[i].status === 'proven' || r.meets[i].status === 'claimed'));
    const keep = needs.filter((n, i) => has(i));
    if (keep.length && keep.length < needs.length) { needs = keep; res = RN.vsearch.rank(text, needs, { pool }); }
    const all = showAll.has(text);
    const rows = all ? res.rows : res.rows.slice(0, FIRST);
    return `<div class="rk" data-rk-text="${esc(text)}">
      ${head(res, text, refined)}
      <ol class="rk-list" aria-label="Operators ranked for your search">${rows.map(row).join('')}</ol>
      ${!all && res.rows.length > FIRST ? `<div class="rk-more"><button type="button" class="btn btn-line" data-act="rk-all">Show all ${res.rows.length} ranked</button></div>` : ''}
    </div>`;
  };

  // Re-render in place; rows that stay on screen glide from their old spot to the new one (FLIP)
  function rerender(box, pool) {
    const before = new Map(RN.$$('.rk-row', box).map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
    box.outerHTML = RK.html(box.dataset.rkText, pool);
    const fresh = document.querySelector('.rk');
    if (!fresh) return;
    fresh.classList.add('is-settled');
    RN.$$('.rk-row', fresh).forEach((el) => {
      const was = before.get(el.dataset.id);
      if (was == null) return;
      const dy = was - el.getBoundingClientRect().top;
      if (!dy) return;
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'none';
      requestAnimationFrame(() => { el.style.transition = 'transform .6s var(--ease)'; el.style.transform = ''; });
    });
  }

  let pending = null;
  RK.mount = function (getPool) {
    const box = document.querySelector('.rk');
    if (!box) return;
    const text = box.dataset.rkText;
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
      else { const s = cur.querySelector('[data-rk-src]'); if (s) s.classList.add('is-done'); }
    });
  };
  RK.reset = () => { if (pending) { pending.ctl.abort(); pending = null; } };

  RN.actions['rk-all'] = () => {
    const box = document.querySelector('.rk');
    if (!box) return;
    showAll.add(box.dataset.rkText);
    if (RN.browse && RN.browse.refresh) RN.browse.refresh();
  };
})();
