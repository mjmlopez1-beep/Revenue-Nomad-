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
  /* o.decorative: the name is printed right beside the avatar, so screen readers skip the picture */
  ui.avatar = function (op, cls, o) {
    if (!op) return `<span class="ava ${cls || ''}" aria-hidden="true"></span>`;
    const deco = o && o.decorative;
    if (op.photo) return `<img class="ava ${cls || ''}" src="${esc(op.photo)}" alt="${deco ? '' : esc(op.name)}" loading="lazy">`;
    return `<span class="ava ${cls || ''}" ${deco ? 'aria-hidden="true"' : `role="img" aria-label="${esc(op.name)}"`}>${esc(op.initials || RN.fmt.initials(op.name))}</span>`;
  };

  ui.avail = function (op, o) {
    const a = op.avail || {};
    const cls = a.key === 'available_now' ? 'dot-now' : a.key === 'available_2_weeks' ? 'dot-soon' : 'dot-later';
    // Registry label for the stored chip code ("40 hrs / month"), never a raw number
    const code = a.hoursCode || (a.hours ? RN.fields.hoursCode(a.hours) : '');
    const hrs = code ? ` · ${RN.w.label('hoursPerMonth', code)}` : '';
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
    return `<span class="row-nw" style="--gap:1px" role="img" aria-label="${esc(n)} out of 5 stars">${s}</span>`;
  };

  /* ---------- Reputation Index tier badges (D11, founder decision Sep 25, 2026) ----------
     One component for every tier mark. Never hand-draw a tier hexagon: call these helpers.
     Rarity reads from material, not colour alone, so the order survives grayscale and colour-blind viewing:
     Indexing dashed outline, Emerging single line, Proven solid forest, Trusted forest with an inner ring,
     Elite bevelled brushed gold, Apex black stone set in a gold rim. Tiers come from RN.fields.risTier
     (Apex first). Colours are --tb-* tokens (css/tokens.css), so light, dark and the night band switch by token.
       RN.ui.tierBadge(v, {size = 40, score, label, className})  one inline SVG
       RN.ui.tierPill(v, score)                                   20px badge + tier + score, for running text
       RN.ui.tierLadder(v, {score, showNext, orientation, compact, showRanges, only, notes})  the six tiers */
  const TIER_RANK = { indexing: 0, emerging: 1, proven: 2, trusted: 3, elite: 4, apex: 5 };
  const tierOpts = () => RN.fields.risTier.options;
  const tierOpt = (v) => tierOpts().find((t) => t.v === v) || tierOpts().find((t) => t.v === 'indexing');
  ui.tierRank = (v) => (v in TIER_RANK ? TIER_RANK[v] : 0);
  let tbSeq = 0;
  const HEX_R = 48;
  const f2 = (n) => +(+n).toFixed(2);
  function hexPts(r) { const p = []; for (let i = 0; i < 6; i++) { const a = (-90 + 60 * i) * Math.PI / 180; p.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]); } return p; }
  function hexD(r) { return 'M' + hexPts(r).map((q) => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z'; }
  // Bevelled rim: six facets lit from the upper left
  function bevel(rOut, rIn) {
    const o = hexPts(rOut), n = hexPts(rIn);
    const tone = { 5: 1, 4: 2, 0: 3, 3: 4, 1: 5, 2: 6 };
    let s = '';
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      s += `<path d="M${f2(o[i][0])} ${f2(o[i][1])}L${f2(o[j][0])} ${f2(o[j][1])}L${f2(n[j][0])} ${f2(n[j][1])}L${f2(n[i][0])} ${f2(n[i][1])}Z" style="fill:var(--tb-au-${tone[i]})"/>`;
    }
    return s;
  }
  function spark(cx, cy, r, fill) {
    const k = r * 0.28;
    return `<path d="M${f2(cx)} ${f2(cy - r)}Q${f2(cx + k)} ${f2(cy - k)} ${f2(cx + r)} ${f2(cy)}Q${f2(cx + k)} ${f2(cy + k)} ${f2(cx)} ${f2(cy + r)}Q${f2(cx - k)} ${f2(cy + k)} ${f2(cx - r)} ${f2(cy)}Q${f2(cx - k)} ${f2(cy - k)} ${f2(cx)} ${f2(cy - r)}Z" style="fill:${fill}"/>`;
  }
  ui.tierBadge = function (v, o) {
    o = o || {};
    const t = tierOpt(v);
    v = t.v;
    const size = +o.size || 40;
    const id = 'tb' + (++tbSeq);
    const u = 100 / size; // viewBox units per CSS px
    const px = (p) => f2(p * u);
    const score = o.score == null || o.score === '' ? null : o.score;
    const txt = score == null ? '' : String(score);
    const num = score != null && size >= 32;
    const fs = txt.length > 2 ? 28 : 34; // 13.6px at 40, 24.5px at 72
    const tsz = size < 32 ? 'sm' : size < 56 ? 'md' : 'lg';
    const text = (fill, weight) => (num ? `<text x="50" y="51.5" text-anchor="middle" dominant-baseline="central" style="font-size:${fs}px;font-weight:${weight};fill:${fill}">${esc(txt)}</text>` : '');
    const line = Math.max(1.25, size * 0.03); // outline weight in px
    const R = HEX_R;
    let body = '', defs = '';
    if (v === 'indexing') {
      // Not scored yet: a dashed outline, nearly empty
      const sw = px(line), r = R - sw / 2;
      const n = size < 32 ? 2 : 3, per = r / n, dash = per * 0.55, gap = per - dash;
      body = `<path d="${hexD(r)}" style="fill:var(--tb-idx-fill);stroke:var(--tb-idx-line);stroke-width:${sw};stroke-dasharray:${f2(dash)} ${f2(gap)};stroke-dashoffset:${f2(dash / 2)};stroke-linejoin:round"/>` + text('var(--tb-idx-ink)', 700);
    } else if (v === 'emerging') {
      // One solid line on a pale leaf fill
      const sw = px(line), r = R - sw / 2;
      body = `<path d="${hexD(r)}" style="fill:var(--tb-emg-fill);stroke:var(--tb-emg-line);stroke-width:${sw};stroke-linejoin:round"/>` + text('var(--tb-emg-ink)', 800);
    } else if (v === 'proven') {
      // The first filled tier: solid forest
      const sw = px(1), r = R - sw / 2;
      body = `<path d="${hexD(r)}" style="fill:var(--tb-prv-fill);stroke:var(--tb-prv-edge);stroke-width:${sw};stroke-linejoin:round"/>` + text('var(--tb-prv-ink)', 800);
    } else if (v === 'trusted') {
      // Deeper lit forest plus an inner leaf ring
      const inset = px(Math.max(2.5, size * 0.085)), ring = px(Math.max(1.1, size * 0.024));
      defs = `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tb-tru-1)"/><stop offset="1" style="stop-color:var(--tb-tru-2)"/></linearGradient>`;
      body = `<path d="${hexD(R)}" fill="url(#${id}g)"/>`
        + `<path d="${hexD(R - inset)}" style="fill:none;stroke:var(--tb-tru-ring);stroke-width:${ring};stroke-linejoin:round"/>` + text('var(--tb-tru-ink)', 800);
    } else if (v === 'elite') {
      // Brushed gold with a bevelled rim
      const bw = px(Math.max(2.4, size * 0.1)), ri = R - bw;
      defs = `<linearGradient id="${id}f" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" style="stop-color:var(--tb-eli-face-1)"/><stop offset=".5" style="stop-color:var(--tb-eli-face-2)"/><stop offset="1" style="stop-color:var(--tb-eli-face-3)"/></linearGradient>`
        + `<clipPath id="${id}c"><path d="${hexD(ri)}"/></clipPath><clipPath id="${id}o"><path d="${hexD(R)}"/></clipPath>`;
      let brush = '';
      if (size >= 40) { // hairline brushing, only where it can resolve
        const step = px(1.6);
        for (let y = 4; y < 96; y += step) { const odd = Math.round(y / step) % 2; brush += `<line x1="0" x2="100" y1="${f2(y)}" y2="${f2(y)}" style="stroke:${odd ? '#fff' : '#6B4C08'};stroke-opacity:${odd ? 0.22 : 0.07};stroke-width:${px(0.6)}"/>`; }
      }
      body = bevel(R, ri)
        + `<path d="${hexD(ri)}" fill="url(#${id}f)"/>`
        + (brush ? `<g clip-path="url(#${id}c)">${brush}</g>` : '')
        + `<path d="${hexD(R - px(0.5))}" style="fill:none;stroke:var(--tb-au-edge);stroke-width:${px(1)};stroke-linejoin:round;stroke-opacity:.9"/>`
        + (size >= 32 ? `<g clip-path="url(#${id}o)"><path class="tb-sheen" d="M-30 110L0 -10L22 -10L-8 110Z" style="fill:#fff;fill-opacity:.35"/></g>` : '')
        + text('var(--tb-eli-ink)', 900);
    } else {
      // Apex: black stone set in a bevelled gold rim, warm inner glow, gold numerals
      const bw = px(Math.max(2.6, size * 0.095)), ri = R - bw;
      defs = `<radialGradient id="${id}s" cx=".5" cy=".4" r=".62"><stop offset="0" style="stop-color:var(--tb-apx-1)"/><stop offset="1" style="stop-color:var(--tb-apx-2)"/></radialGradient>`
        + `<radialGradient id="${id}w" cx=".5" cy=".55" r=".5"><stop offset="0" style="stop-color:var(--tb-apx-glow);stop-opacity:.34"/><stop offset=".55" style="stop-color:var(--tb-apx-glow);stop-opacity:.08"/><stop offset="1" style="stop-color:var(--tb-apx-glow);stop-opacity:0"/></radialGradient>`
        + `<clipPath id="${id}o"><path d="${hexD(R)}"/></clipPath>`;
      body = bevel(R, ri)
        + `<path d="${hexD(ri)}" fill="url(#${id}s)"/><path d="${hexD(ri)}" fill="url(#${id}w)"/>`
        + (size >= 32 ? `<path d="${hexD(ri - px(1.6))}" style="fill:none;stroke:var(--tb-au-3);stroke-opacity:.45;stroke-width:${px(0.75)};stroke-linejoin:round"/>` : '')
        + `<path d="${hexD(R - px(0.5))}" style="fill:none;stroke:var(--tb-au-edge);stroke-width:${px(1)};stroke-linejoin:round"/>`
        + (size >= 56 ? spark(50, ri > 40 ? 22.5 : 24, 4.2, 'var(--tb-apx-ink)') : '')
        + (size >= 32 ? `<g clip-path="url(#${id}o)"><path class="tb-sheen" d="M-30 110L0 -10L16 -10L-14 110Z" style="fill:#fff;fill-opacity:.16"/></g>` : '')
        + text('var(--tb-apx-ink)', 900);
    }
    const label = o.label === true ? (score != null ? `${t.l}, Reputation Index ${score}` : `${t.l} tier`) : o.label;
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
    return `<svg class="tb t-${v} tb-${tsz}${o.className ? ' ' + esc(o.className) : ''}" width="${size}" height="${size}" viewBox="0 0 100 100" ${a11y}>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
  };
  /* Inline pill for running text: 20px badge, tier name, score beside it */
  ui.tierPill = function (v, score) {
    const t = tierOpt(v);
    const has = score != null && score !== '';
    return `<span class="tb-pill t-${t.v}" title="${has ? `Reputation Index ${esc(score)}, ${esc(t.l)} tier` : `${esc(t.l)} tier`}">${ui.tierBadge(t.v, { size: 20 })}<span>${esc(t.l)}</span>${has ? `<span class="tb-pill-n">${esc(score)}</span>` : ''}</span>`;
  };
  /* The tier ladder. Column (default): Apex on top, the current row raised, rails solid up to the current tier
     and dashed above it. o.score shows inside the current badge; o.showNext (operator-facing, Studio) adds
     "N points to <next tier>" on the row above. o.orientation 'row' runs lowest to highest, left to right
     (a column again on phones); o.compact keeps badges and names only; o.showRanges false hides the ranges;
     o.only limits the tiers; o.notes {tier: text} replaces a row's description. */
  ui.tierLadder = function (v, o) {
    o = o || {};
    const cur = tierOpt(v).v, at = ui.tierRank(cur);
    const row = o.orientation === 'row', compact = !!o.compact;
    const score = o.score == null || o.score === '' ? null : o.score;
    let list = tierOpts().filter((t) => !o.only || o.only.includes(t.v));
    if (row) list = list.slice().reverse();
    const next = tierOpts().find((t) => ui.tierRank(t.v) === at + 1);
    const showNext = o.showNext && next && score != null;
    const ranges = o.showRanges !== false;
    const range = (t) => (t.v === 'indexing' ? 'Under 50' : `${t.min} to ${t.max}`);
    const first = (d) => String(d || '').split(/(?<=\.)\s/)[0]; // the ladder shows the first sentence; the title has it all
    const items = list.map((t, i) => {
      const on = t.v === cur, above = ui.tierRank(t.v) > at;
      // The rail after this row joins it to the next one; dashed when the higher of the two is not reached yet
      const nxt = list[i + 1], prv = list[i - 1];
      const todo = (x) => x && Math.max(ui.tierRank(t.v), ui.tierRank(x.v)) > at;
      const railTodo = todo(nxt), railInTodo = todo(prv); // a row ladder draws each rail in two halves, one per item
      const note = o.notes && o.notes[t.v];
      const desc = compact ? '' : `<small>${esc(note || (on ? 'Current tier' : first(t.d)))}</small>${showNext && t.v === next.v ? `<small class="tb-l-next">${esc(next.min - score)} points to ${esc(next.l)}</small>` : ''}`;
      const seal = compact
        ? ui.tierBadge(t.v, { size: on ? 28 : 22 })
        : ui.tierBadge(t.v, on ? { size: 40, score, label: score != null ? `Reputation Index ${score}` : '' } : { size: 32 });
      const tip = ` title="${esc(t.l)}, ${esc(range(t))}: ${esc(t.d)}"`;
      return `<li class="t-${t.v}${on ? ' on' : ''}${above ? ' above' : ''}${railTodo ? ' rail-todo' : ''}${row && railInTodo ? ' rail-in-todo' : ''}"${on ? ' aria-current="true"' : ''}${tip}>`
        + `<span class="tb-l-seal">${seal}</span><span class="tb-l-name">${esc(t.l)}${desc}</span>`
        + (ranges && !compact ? `<span class="tb-l-range">${range(t)}</span>` : '')
        + '</li>';
    }).join('');
    return `<ol class="tb-ladder${row ? ' tb-row' : ''}${compact ? ' tb-compact' : ''}" aria-label="${esc(o.label || 'Reputation Index tiers')}">${items}</ol>`;
  };

  /* Reputation Index on cards and rails. op.ris = {score, label, tier} */
  ui.ris = function (op, o) {
    const r = op.ris || { score: 0 };
    const tipHtml = ui.risExplainer(o && o.viewer === 'operator');
    const t = tierOpt(r.tier || RN.fields.risTierFor(r.score).v);
    // Every tier, Emerging included, uses the same seal layout on cards and rails
    return `<span class="ris t-${t.v}">${ui.tierBadge(t.v, { size: 40, score: r.score, label: `${t.l}, Reputation Index ${r.score}` })}<span class="ris-txt"><b>${esc(t.l)}</b><span class="row-nw" style="--gap:4px">Reputation Index ${ui.tip(tipHtml)}</span></span></span>`;
  };
  /* Legacy entry point: a tier label ("Elite") to its badge. Never draws a hexagon itself. */
  ui.hexSeal = function (label, o) {
    o = o || {};
    const t = tierOpts().find((x) => x.l === label) || tierOpt('indexing');
    return ui.tierBadge(t.v, { size: o.size || 20, score: o.score, label: o.label });
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

  /* One status pill per record type, one colour map (engagement ("project" key), intro, review, application, hire) */
  const STATUS = {
    project: { draft: '', posted: 'pill-info', in_progress: 'pill-accent', staffed: 'pill-good', closed: '' },
    hire: { active: 'pill-good', ended: '' },
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
    return `<article class="opc tb-host" data-op="${esc(op.id)}">
      <button type="button" class="opc-save ${saved ? 'on' : ''}" data-act="shortlist-toggle" data-id="${esc(op.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from shortlist' : 'Save to shortlist'}">${icon('bookmark')}</button>
      <div class="opc-top">
        ${ui.avatar(op, 'ava-md', { decorative: true })}
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
        ${role === 'operator' ? '<a class="btn btn-line" href="#join">Apply to join</a>' : '<a class="btn btn-line" href="#home">Back to home</a>'}
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
    modalStack.push({ id, el, onClose: o.onClose, opener: document.activeElement, t: Date.now() });
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
  /* Close modals opened before a navigation (browser Back); keep ones an action opened alongside the route change */
  ui.closeStale = function (ms) {
    const cutoff = Date.now() - (ms || 300);
    while (modalStack.length && modalStack[modalStack.length - 1].t < cutoff) ui.closeModal();
  };
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
  let tipBtn = null;
  function showTip(btn) {
    hideTip();
    tipEl = document.createElement('div');
    tipEl.className = 'tip-pop';
    tipEl.id = 'rn-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipBtn = btn;
    btn.setAttribute('aria-describedby', 'rn-tip');
    btn.setAttribute('aria-expanded', 'true');
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
  function hideTip() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
    if (tipBtn) { tipBtn.removeAttribute('aria-describedby'); tipBtn.setAttribute('aria-expanded', 'false'); tipBtn = null; }
  }
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
    if (e.key === 'Escape') { if (tipEl) hideTip(); else if (document.querySelector('.menu-sheet') && RN.shell.closeMenu) RN.shell.closeMenu(); else if (modalStack.length) ui.closeModal(); else if (document.querySelector('.dock-panel')) RN.actions.dock(); }
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
