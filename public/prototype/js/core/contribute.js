/* RN.contrib and RN.share: contributions that feed the research datasets, and sharing that makes the work travel.
   One shared core (Oct 12, 2026). Pages place the pieces; every flow runs in the shared modal (RN.ui.modal) and is
   wired through RN.actions (data-act), like the rest of the site.

   RN.contrib
     datasets                      the four datasets and their windows (Rate Index quarterly, 2028 report annual,
                                   Quarterly Pulse, Field notes). One config.
     targets                       internal response targets: a PROPOSAL for the founder to confirm. Admin only.
     period()                      the open quarterly window {key: '2026-Q4', label: 'Q4 2026', short: 'Q4', start, end,
                                   closes: 'Dec 31', publishes: 'January 2027'}
     open(kind, ctx)               opens a flow: 'rate' | 'paid' | 'rates' (asks which side) | 'pulse' | 'survey' | 'insight'
     cta(kind, {variant, ctx})     inline invitation: variant 'band' | 'card' | 'line'. '' when it does not apply.
     pulse(qid, ctx)               one-tap question for the end of an article (question bank: RN.contrib.questions)
     count(dataset, filter)        finished contributions in this browser for a dataset
     published(dataset, filter)    the real published sample behind a dataset (2027 report, Rate Index n)
     mine()                        the viewer's own contributions, newest first, with what each fed
     done(kind, ctx)               the viewer's finished contribution for this window (truthy), else null
     draft()                       the viewer's saved, unfinished 2028 survey, else null
   Storage: RN.store.state.contributions = [{id, kind, dataset, period, persona, side, answers, createdAt, email?, status}].
   Field notes reuse RN.store.state.answers (the shape research.js writes); they are never duplicated here.
   Trust: published only in aggregate, never individually (one-tap and Pulse answers without an email are anonymous);
   a figure publishes only from 5 responses in its group; email only to send the benchmark, early access, and the Pulse
   when someone subscribes; nothing here changes anyone's Reputation Index.

   RN.share
     url(route)                    canonical public URL: https://revenuenomad.com/<route with dots as slashes, _ as ->
     open({title, url|route, quote, kind, mode})   share sheet; operators also get "Share with your take"
     quote(text, ctx)              pull quote or key number with a click-to-share affordance
     row(o)                        compact share row (Copy link, LinkedIn, X, and Share with your take for operators)
     button(o, label, cls)         one button that opens the share sheet */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const C = (RN.contrib = {});
  const S = (RN.share = {});
  const REP = () => RN.data.market.report;
  const RI = () => RN.data.market.rateIndex;
  const st = () => RN.store.state;
  const persona = () => st().persona;
  const MIN_N = 5;       // a figure publishes only when its group has at least this many responses
  const MIN_CELL = 20;   // Rate Index cells under this are read as directional (same rule as the Rate Index pages)
  const SITE = 'https://revenuenomad.com';
  const jsonAttr = (o) => esc(JSON.stringify(o || {}));
  const parse = (s) => { try { return JSON.parse(s || '{}') || {}; } catch (e) { return {}; } };
  const r5 = (n) => Math.round(n / 5) * 5;
  const catLabel = (c) => RN.fields.catLabel(c);
  // House style is hyphens only: the registry's revenue labels carry en dashes, so normalise them here for UI and share text
  const revLabel = (v) => String(RN.w.label('companyRevenue', v) || '').replace(/\s*[\u2013\u2014]\s*/g, ' - ');
  C.revLabel = revLabel;
  const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayMonth = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const longDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

  /* ---------- Windows ----------
     The open Rate Index and Pulse window is the quarter after the last published index (market.rateIndex.trend),
     or the clock's own quarter once the clock passes it. Q3 2026 is published, so Q4 2026 is open: it closes Dec 31,
     and the index publishes in the first two weeks of January. */
  const qOf = (d) => ({ y: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 });
  const nextQ = (p) => (p.q === 4 ? { y: p.y + 1, q: 1 } : { y: p.y, q: p.q + 1 });
  const prevQ = (p) => (p.q === 1 ? { y: p.y - 1, q: 4 } : { y: p.y, q: p.q - 1 });
  const cmpQ = (a, b) => a.y - b.y || a.q - b.q;
  function lastPublished() {
    const t = RI().trend || [];
    const m = t.length ? /Q(\d)\s*'?(\d{2,4})/.exec(t[t.length - 1].l) : null;
    return m ? { q: +m[1], y: m[2].length === 2 ? 2000 + +m[2] : +m[2] } : prevQ(qOf(RN.now()));
  }
  function periodOf(p) {
    const start = new Date(p.y, (p.q - 1) * 3, 1), end = new Date(p.y, p.q * 3, 0), pub = new Date(p.y, p.q * 3, 1);
    return { key: `${p.y}-Q${p.q}`, y: p.y, q: p.q, label: `Q${p.q} ${p.y}`, short: `Q${p.q}`, start, end, closes: dayMonth(end), publishes: monthName(pub), publishDate: pub };
  }
  C.period = function () { const a = nextQ(lastPublished()), b = qOf(RN.now()); return periodOf(cmpQ(a, b) >= 0 ? a : b); };
  C.prevPeriod = function () { const p = C.period(); return periodOf(prevQ(p)); };
  // The published index the instant result compares against ("Q3 2026 index")
  C.indexLabel = function () { const p = lastPublished(); return `Q${p.q} ${p.y} index`; };

  /* ---------- Datasets (one config) ---------- */
  C.datasets = {
    rateIndex: {
      id: 'rateIndex', name: 'Rate Index', cadence: 'Quarterly', kinds: ['rate', 'paid'], time: '60 seconds', route: 'rates', icon: 'chart', tone: 'forest',
      get: 'See where your number sits against the index right away',
      feeds: 'The quarterly Rate Index by role category',
      window: () => { const p = C.period(); return { label: p.label, opens: p.start, closes: p.end, closesLabel: p.closes, publishes: `First two weeks of ${p.publishes}` }; },
    },
    report2028: {
      id: 'report2028', name: 'State of Fractional GTM 2028', short: '2028 report', edition: 2028, cadence: 'Annual', kinds: ['survey'], time: 'About 6 minutes', route: 'report', icon: 'book', tone: 'enable',
      get: 'The 2028 report a week before it publishes, plus the full breakdown for your role',
      feeds: 'The State of Fractional GTM 2028',
      // Fieldwork is open now through Aug 31, 2027; the report publishes October 2027 (opening date: proposal to confirm)
      window: () => ({ label: '2028 edition', opens: new Date(2026, 9, 1), closes: new Date(2027, 7, 31), closesLabel: 'Aug 31, 2027', publishes: 'October 2027' }),
    },
    pulse: {
      id: 'pulse', name: 'Quarterly Pulse', cadence: 'Quarterly', kinds: ['pulse'], time: 'About 60 seconds', route: 'insights', icon: 'wave', tone: 'info',
      get: 'How companies and operators answered, in the next Pulse',
      feeds: 'The Pulse newsletter and the Demand Index',
      window: () => { const p = C.period(); return { label: p.label, opens: p.start, closes: p.end, closesLabel: p.closes, publishes: `The ${p.publishes} Pulse` }; },
    },
    fieldNotes: {
      id: 'fieldNotes', name: 'Field notes', cadence: 'Ongoing', kinds: ['insight'], time: 'About 5 minutes', route: 'guides', icon: 'edit', tone: 'sales',
      get: 'Your byline on the guide once the team approves it',
      feeds: 'Guides and answer posts',
      window: () => ({ label: 'Always open', opens: null, closes: null, closesLabel: '', publishes: 'When approved' }),
    },
  };
  C.kinds = {
    rate: { dataset: 'rateIndex', side: 'operator' },
    paid: { dataset: 'rateIndex', side: 'company' },
    pulse: { dataset: 'pulse' },
    topic: { dataset: '' },          // one-tap topic questions; the dataset comes from the question
    survey: { dataset: 'report2028' },
    insight: { dataset: 'fieldNotes', side: 'operator' },
  };

  /* Internal targets. PROPOSAL for the founder to confirm: shown in Admin only, never on public pages. */
  C.targets = {
    proposal: true,
    note: 'Proposed targets, for the founder to confirm. Internal only.',
    report2028: { total: 400, operators: 250, companies: 150, by: '2027-08-31', label: 'Hundreds of responses by the Aug 31, 2027 close, for an October 2027 report' },
    rateIndex: { perQuarter: 120, perCategory: MIN_CELL, label: 'At least 20 rates per role category each quarter, so no cell reads as directional' },
    pulse: { perQuarter: 100, perSide: 40, label: 'About 100 Pulse responses a quarter, at least 40 from each side' },
    fieldNotes: { perMonth: 10, label: 'About 10 approved field notes a month' },
  };

  /* The 2027 report's six chapters (mirrors the report's chapter list in js/views/insights.js; market.report holds the
     figures, not the titles). The survey for 2028 follows the same chapters. */
  C.chapters = [
    { n: 1, id: 'ins-ch1', t: 'Who is hiring' },
    { n: 2, id: 'ins-ch2', t: 'What it costs', ask: 'What do you charge, or what did you pay, per month?' },
    { n: 3, id: 'ins-ch3', t: 'How it is scoped', ask: 'How many hours a month, and for how long?' },
    { n: 4, id: 'ins-ch4', t: 'Roles in demand' },
    { n: 5, id: 'ins-ch5', t: 'Who gets rehired' },
    { n: 6, id: 'ins-ch6', t: 'The operator side' },
  ];

  /* ---------- Who is answering ---------- */
  // 'operator' | 'company' | null (signed out and not asked yet)
  C.side = function () {
    const p = persona();
    if (p === 'operator') return 'operator';
    if (p === 'buyer') return 'company';
    const s = (st().seen || {}).contribSide;
    return s === 'operator' || s === 'company' ? s : null;
  };
  C.setSide = function (side) { RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { contribSide: side }); }, 'seen'); };
  const needsEmail = () => persona() === 'visitor';
  const meEmail = () => { const m = RN.me && RN.me(); return m && m.email ? m.email : ''; };

  /* ---------- Store ---------- */
  const all = () => (Array.isArray(st().contributions) ? st().contributions : []);
  function save(rec) {
    RN.store.update((s) => {
      s.contributions = (Array.isArray(s.contributions) ? s.contributions : []).filter((x) => x.id !== rec.id).concat(rec);
    }, 'contributions');
    return rec;
  }
  const finished = (c) => c && c.status !== 'draft';
  const mineOnly = (c) => c.persona === persona();
  const myAnswers = () => { const op = RN.myOp && RN.myOp(); return op ? (st().answers || []).filter((a) => a.opId === op.id) : []; };

  C.count = function (dataset, filter) {
    filter = filter || {};
    if (dataset === 'fieldNotes') return (st().answers || []).filter((a) => !filter.status || a.status === filter.status).length;
    return all().filter((c) => finished(c) && (!dataset || c.dataset === dataset) && Object.keys(filter).every((k) => {
      const v = filter[k];
      if (k === 'cat') return (c.answers || {}).cat === v;
      return c[k] === v;
    })).length;
  };

  /* The real published sample behind a dataset. Rate Index: n per role category. Report: the 2027 sample. */
  C.published = function (dataset, filter) {
    filter = filter || {};
    const R = REP();
    if (dataset === 'rateIndex') {
      const by = RI().byCat;
      const n = filter.cat ? ((by[filter.cat] || {}).n || 0) : Object.keys(by).reduce((s, k) => s + (by[k].n || 0), 0);
      return { n, label: `${RN.fmt.plural(n, 'rate')} in the ${C.indexLabel()}${filter.cat ? ` for ${catLabel(filter.cat)}` : ''}`, directional: !!filter.cat && n < MIN_CELL, source: 'Rate Index' };
    }
    if (dataset === 'report2028' || dataset === 'report2027' || dataset === 'pulse') {
      const s = R.sample || {};
      const n = filter.side === 'operator' ? s.operators : filter.side === 'company' ? s.companies : (s.operators || 0) + (s.companies || 0);
      return { n, operators: s.operators, companies: s.companies, label: `The ${R.year} edition heard from ${RN.fmt.int(s.operators)} operators and ${RN.fmt.int(s.companies)} companies`, source: `State of Fractional GTM ${R.year}` };
    }
    return { n: 0, label: '', source: '' };
  };

  const pulseIds = (side) => ['pulse-outlook', 'pulse-hiring', 'pulse-problem'].filter((id) => C.questions[id] && C.questions[id].text(side));
  function pulseComplete(c) {
    if (!c || c.kind !== 'pulse') return false;
    const a = c.answers || {};
    return pulseIds(c.side || 'company').every((id) => a[id]);
  }
  function current(kind) {
    const p = C.period().key;
    return all().filter((c) => mineOnly(c) && c.kind === kind && c.period === p).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  C.done = function (kind, ctx) {
    ctx = ctx || {};
    if (kind === 'rates') return C.done('rate') || C.done('paid');
    if (kind === 'rate' || kind === 'paid') return current(kind).find(finished) || null;
    if (kind === 'pulse') return current('pulse').find((c) => finished(c) && pulseComplete(c)) || null;
    if (kind === 'survey') return all().find((c) => mineOnly(c) && c.kind === 'survey' && c.status === 'done') || null;
    if (kind === 'insight') {
      const list = myAnswers().filter((a) => a.status !== 'declined');
      return (ctx.guideId ? list.find((a) => a.guideId === ctx.guideId || guideOf(a.guideId) === guideOf(ctx.guideId)) : list[0]) || null;
    }
    if (kind === 'topic') return all().find((c) => mineOnly(c) && c.kind === 'topic' && (c.answers || {})[ctx.qid] && c.period === C.period().key) || null;
    return null;
  };
  C.draft = function () { return all().find((c) => mineOnly(c) && c.kind === 'survey' && c.status === 'draft') || null; };

  const guideOf = (id) => { const g = RN.research && RN.research.guideFor ? RN.research.guideFor(id) : null; return g ? g.id : id; };
  C.describe = function (c) {
    const a = c.answers || {};
    if (c.kind === 'rate') return `${catLabel(a.cat)}${a.role ? ', ' + a.role : ''}: ${a.basis === 'monthly' ? RN.fmt.usd(a.retainer) + '/month for ' + RN.w.label('hoursPerMonth', a.hours) : RN.fmt.usd(a.rate) + '/hr'}`;
    if (c.kind === 'paid') return `${catLabel(a.cat)}${a.role ? ', ' + a.role : ''}: ${RN.fmt.usd(a.monthly)}/month for ${RN.w.label('hoursPerMonth', a.hours)}`;
    if (c.kind === 'pulse') return `${RN.fmt.plural(Object.keys(a).filter((k) => /^pulse-/.test(k) && a[k]).length, 'answer')} to the ${c.periodLabel || ''} Pulse`.replace('  ', ' ');
    if (c.kind === 'topic') { const id = Object.keys(a)[0]; const q = C.questions[id]; return q ? `${q.topic}: ${optLabel(q, c.side, a[id])}` : 'One answer'; }
    if (c.kind === 'survey') { const pr = C.surveyProgress(c); return c.status === 'done' ? `${RN.fmt.plural(pr.answers, 'answer')} across ${pr.chapters.length} of 6 chapters` : `Saved, ${pr.chapters.length} of 6 chapters answered`; }
    return '';
  };

  C.mine = function (o) {
    o = o || {};
    const rows = all().filter((c) => mineOnly(c) && (o.drafts || finished(c))).map((c) => ({
      id: c.id, kind: c.kind, dataset: c.dataset, period: c.period, periodLabel: c.periodLabel, createdAt: c.createdAt, status: c.status || 'done',
      summary: C.describe(c), fed: c.kind === 'topic' ? (c.dataset === 'rateIndex' ? 'A one-tap answer, bucketed (not in the index)' : 'A one-tap answer for the 2028 report questions') : (C.datasets[c.dataset] || {}).feeds || '', name: (C.datasets[c.dataset] || {}).name || '', rec: c,
    }));
    myAnswers().forEach((a) => {
      const g = RN.research && RN.research.guideFor ? RN.research.guideFor(a.guideId) : null;
      rows.push({ id: a.id, kind: 'insight', dataset: 'fieldNotes', period: '', createdAt: a.createdAt, status: a.status, summary: `Field note on ${g ? g.title : 'a guide'}`, fed: C.datasets.fieldNotes.feeds, name: 'Field notes', guideId: a.guideId, rec: a });
    });
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  };

  function track(kind, ctx, extra) {
    RN.track('contribution', Object.assign({ source: (ctx && ctx.source) || kind, meta: Object.assign({ kind, dataset: (C.kinds[kind] || {}).dataset || '', period: C.period().key }, extra || {}) }));
  }

  /* ---------- Small shared pieces ---------- */
  // One promise about email, used in the flows, the explainer and the report methodology
  const EMAIL_USE = 'We use your email only to send your benchmark, early access, and the Pulse if you ask for it.';
  C.emailUse = EMAIL_USE;
  // One line on trust, with the rest in an explainer
  C.trust = function (o) {
    o = o || {};
    const more = `<b>How contributions are used</b><br>Published only in aggregate, never individually. One-tap and Pulse answers are anonymous. A figure publishes only when its group has at least ${MIN_N} responses. ${EMAIL_USE} Nothing here changes anyone's Reputation Index.`;
    const lead = o.anon ? 'Anonymous and aggregated, never shown individually.' : 'Confidential. Published only in aggregate, never individually.';
    return `<p class="cx-trust${o.cls ? ' ' + o.cls : ''}">${icon('lock')}<span>${lead} Published only from ${MIN_N} responses per group. Never changes anyone's Reputation Index.</span>${RN.ui.tip(more, 'How contributions are used')}</p>`;
  };
  // A chip set with the same markup and behaviour as RN.w.control (w-chip action, hidden input)
  function chips(name, options, value, o) {
    o = o || {};
    const multi = !!o.multi;
    const vals = multi ? (value || []) : value ? [value] : [];
    return `<div class="chipset" role="group" ${o.labelId ? `aria-labelledby="${esc(o.labelId)}"` : `aria-label="${esc(o.label || name)}"`} ${o.id ? `id="${esc(o.id)}"` : ''}>
      ${options.map((x) => `<button type="button" class="chip" aria-pressed="${vals.includes(x.v)}" data-act="w-chip" data-name="${esc(name)}" data-v="${esc(x.v)}" data-multi="${multi ? 1 : ''}" data-max="${esc(o.max || '')}">${esc(x.l)}</button>`).join('')}
      <input type="hidden" name="${esc(name)}" value="${esc(vals.join('|'))}" ${multi ? 'data-multi="1"' : ''} ${o.change ? `data-change="${esc(o.change)}"` : ''}>
    </div>`;
  }
  function chipField(name, label, options, value, o) {
    o = o || {};
    const id = 'cx-' + name.replace(/[^\w-]/g, '');
    return `<div class="field" data-cx-f="${esc(name)}"><span class="field-label" id="${id}-l">${esc(label)}${o.opt ? ' <span class="opt">Optional</span>' : ''}</span>${chips(name, options, value, Object.assign({ labelId: id + '-l', id }, o))}${o.help ? `<p class="help">${esc(o.help)}</p>` : ''}</div>`;
  }
  function moneyField(name, label, value, unit, o) {
    o = o || {};
    const id = 'cx-' + name;
    return `<div class="field" data-cx-f="${esc(name)}"><label for="${id}">${esc(label)}</label>
      <div class="input-affix"><span class="affix">$</span><input class="input" id="${id}" name="${esc(name)}" type="number" inputmode="numeric" min="0" step="${o.step || 5}" value="${esc(value == null ? '' : value)}" placeholder="${esc(o.placeholder || '')}"><span class="affix">${esc(unit)}</span></div>
      ${o.help ? `<p class="help">${esc(o.help)}</p>` : ''}</div>`;
  }
  function emailField(o) {
    o = o || {};
    return `<div class="field" data-cx-f="email"><label for="cx-email">${esc(o.label || 'Work email')}${o.optional ? ' <span class="opt">Optional</span>' : ''}</label>
      <input class="input" id="cx-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" value="${esc(o.value || '')}">
      <p class="help">${esc(o.help || 'Only to send your benchmark and early access. We verify by domain and never show it.')}</p></div>`;
  }
  const opts = (key) => RN.fields[key].options.map((o) => ({ v: o.v, l: o.l }));
  const slugOpts = (rows) => rows.map((r) => ({ v: RN.slug(r.l), l: r.l }));
  function errAt(form, name, msg) {
    RN.$$('.cx-err', form).forEach((e) => e.remove());
    RN.$$('.field.is-err', form).forEach((e) => e.classList.remove('is-err'));
    const input = form.querySelector(`[name="${name}"]`);
    const f = input && input.closest('.field');
    if (f) {
      f.classList.add('is-err');
      f.insertAdjacentHTML('beforeend', `<p class="err cx-err" role="alert">${esc(msg)}</p>`);
      const focusable = f.querySelector('input:not([type=hidden]), select, textarea, button');
      if (focusable) focusable.focus();
      f.scrollIntoView({ block: 'center', behavior: 'auto' });
    } else RN.ui.toast(esc(msg), { icon: 'info' });
    return false;
  }

  /* ---------- Question bank ----------
     Each question: {id, kind: 'pulse' | 'topic', dataset, topic, text(side), options(side) -> [{v, l}],
     result(side, ctx, answer) -> {rows, label, source} (real published figures) | {html} | null (publishes later)}.
     side is 'company' or 'operator'. Wording differs by side. */
  const intentRows = () => REP().intent.map((r) => ({ v: r.cat, l: catLabel(r.cat), pct: r.v }));
  const sampleLine = (side) => { const s = REP().sample; return side === 'operator' ? `${RN.fmt.int(s.operators)} operators` : side === 'company' ? `${RN.fmt.int(s.companies)} companies` : `${RN.fmt.int(s.operators)} operators and ${RN.fmt.int(s.companies)} companies`; };
  const repSource = (who, what) => `${what ? what + '. ' : ''}State of Fractional GTM ${REP().year}, ${sampleLine(who)}.`;
  const TERM = ['1_3', '3_6', '6_12', '12_plus'];
  const COST_BUCKETS = [
    { v: 'u5', l: 'Under $5k/month', lo: 0, hi: 5000 }, { v: '5_10', l: RN.fmt.moRange(5000, 10000), lo: 5000, hi: 10000 }, { v: '10_15', l: RN.fmt.moRange(10000, 15000), lo: 10000, hi: 15000 },
    { v: '15_20', l: RN.fmt.moRange(15000, 20000), lo: 15000, hi: 20000 }, { v: '20p', l: '$20k/month or more', lo: 20000, hi: Infinity },
  ];
  C.costBuckets = COST_BUCKETS;
  C.questions = {
    'pulse-outlook': {
      id: 'pulse-outlook', kind: 'pulse', dataset: 'pulse', topic: 'Demand outlook',
      text: (side) => (side === 'operator' ? 'Next quarter, do you expect more, the same or less demand for your work?' : 'Next quarter, will you spend more, the same or less on outside GTM leadership?'),
      options: () => [{ v: 'more', l: 'More' }, { v: 'same', l: 'About the same' }, { v: 'less', l: 'Less' }, { v: 'unsure', l: 'Not sure yet' }],
      result: () => null,
    },
    'pulse-hiring': {
      id: 'pulse-hiring', kind: 'pulse', dataset: 'pulse', topic: 'Hiring plans',
      text: (side) => (side === 'operator' ? 'How many companies do you plan to work with next quarter?' : 'Which GTM seat are you most likely to fill in the next 12 months?'),
      options: (side) => (side === 'operator' ? REP().concurrent.map((r) => ({ v: RN.slug(r.l), l: r.l })) : intentRows().map((r) => ({ v: r.v, l: r.l })).concat({ v: 'none', l: 'None planned' })),
      result: (side) => (side === 'operator'
        ? { rows: REP().concurrent.map((r) => ({ v: RN.slug(r.l), l: r.l, pct: r.v })), label: 'Companies operators work with at once', source: repSource('operator', 'Operators, concurrent companies') }
        : { rows: intentRows(), label: 'Hiring intent by role, next 12 months', source: repSource('company', 'Companies planning to hire each seat') }),
    },
    'pulse-problem': {
      id: 'pulse-problem', kind: 'pulse', dataset: 'pulse', topic: 'Main GTM problem',
      text: (side) => (side === 'operator' ? 'What do companies most often bring you in to fix right now?' : 'What is the main reason you would bring in GTM help this quarter?'),
      options: () => slugOpts(REP().triggers).concat({ v: 'other', l: 'Something else' }),
      result: () => ({ rows: REP().triggers.map((r) => ({ v: RN.slug(r.l), l: r.l, pct: r.v })), label: 'Why companies hired a fractional leader', source: repSource('company', 'Primary trigger, as companies told us') }),
    },
    'topic-cost': {
      id: 'topic-cost', kind: 'topic', dataset: 'rateIndex', topic: 'Cost of a seat', flow: true,
      text: (side, ctx) => { const seat = ctx && ctx.seat ? ctx.seat : 'this seat'; return side === 'operator' ? `What do you charge a month for ${seat}?` : `What did you pay per month for ${seat}?`; },
      options: () => COST_BUCKETS.map((b) => ({ v: b.v, l: b.l })),
      result: (side, ctx, answer) => {
        const cat = (ctx && ctx.cat) || 'sales_leadership';
        const m40 = RN.model.monthlyRange(cat, '', '40'), m20 = RN.model.monthlyRange(cat, '', '20');
        const pub = C.published('rateIndex', { cat });
        const b = COST_BUCKETS.find((x) => x.v === answer);
        let place = '';
        if (b) {
          const where = b.hi <= m20.lo ? 'is below the 20-hour range for this seat'
            : b.lo >= m40.hi ? 'is above the 40-hour range for this seat'
            : b.hi <= m40.lo ? 'sits in or near the 20-hour range, under the 40-hour range'
            : b.lo >= m20.hi ? 'sits in or near the 40-hour range, over the 20-hour range'
            : 'overlaps the 20 and 40-hour ranges for this seat';
          place = `<p class="cx-res-line">Your answer, <b class="nowrap">${esc(b.l)}</b>, ${esc(where)}.</p>`;
        }
        return { html: `<p class="cx-res-line">The ${esc(C.indexLabel())} puts ${esc(catLabel(cat))} at <b class="nowrap">${esc(m20.label)}</b> for 20 hours and <b class="nowrap">${esc(m40.label)}</b> for 40 hours.</p>${place}<p class="cx-src">Rate Index, ${esc(RN.fmt.plural(pub.n, 'rate'))} in this category${pub.directional ? '. Read it as directional' : ''}. Your answer is bucketed and does not go into the index; add the details to count.</p>` };
      },
    },
    'topic-hours': {
      id: 'topic-hours', kind: 'topic', dataset: 'report2028', topic: 'Hours per month',
      text: (side) => (side === 'operator' ? 'How many hours a month does your typical engagement run?' : 'How many hours a month does your engagement run?'),
      options: () => opts('hoursPerMonth'),
      result: () => ({ rows: REP().hours.map((r) => ({ v: r.h, l: RN.w.label('hoursPerMonth', r.h), pct: r.v })), label: 'Share of engagements by hours a month', source: repSource('both') }),
    },
    'topic-length': {
      id: 'topic-length', kind: 'topic', dataset: 'report2028', topic: 'Engagement length',
      text: (side) => (side === 'operator' ? 'How long do your engagements usually run at first?' : 'How long was the first term you agreed?'),
      options: () => opts('term'),
      result: () => ({ rows: REP().term.map((r, i) => ({ v: TERM[i], l: RN.w.label('term', TERM[i]) || r.l, pct: r.v })), label: 'Share of engagements by initial term', source: repSource('both') }),
    },
    'topic-first-seat': {
      id: 'topic-first-seat', kind: 'topic', dataset: 'report2028', topic: 'Which seat first',
      text: (side) => (side === 'operator' ? 'In your experience, which seat do companies fill first?' : 'Which GTM seat did you fill first with a fractional leader?'),
      options: () => opts('roleCategory'),
      // No published figure answers this question yet: the honest line, not a chart of a different measure
      result: () => null,
    },
  };
  function optLabel(q, side, v) { const o = q.options(side || 'company').find((x) => x.v === v); return o ? o.l : v; }

  /* ---------- Result pieces ---------- */
  function bars(res, chosen) {
    const max = Math.max.apply(null, res.rows.map((r) => r.pct).concat(1));
    return `<figure class="cx-bars-fig"><figcaption class="label">${esc(res.label)}</figcaption>
      <ul class="cx-bars">${res.rows.map((r) => `<li class="${r.v === chosen ? 'on' : ''}"><span class="cx-bar-l">${esc(r.l)}${r.v === chosen ? '<em>Your answer</em>' : ''}</span><span class="cx-bar-t" aria-hidden="true"><i style="width:${Math.max(2, (r.pct / max) * 100).toFixed(1)}%"></i></span><b class="cx-bar-v">${esc(r.pct)}%</b></li>`).join('')}</ul>
      <p class="cx-src">${esc(res.source)}</p>${RN.ui.illus()}</figure>`;
  }
  const honest = (q) => (q && q.dataset === 'report2028'
    ? `<p class="cx-honest">${icon('clock')}<span>Results publish in the State of Fractional GTM 2028, in October 2027, once each group has at least ${MIN_N} answers.</span></p>`
    : `<p class="cx-honest">${icon('clock')}<span>Results publish in the ${esc(C.period().publishes)} Pulse, once each group has at least ${MIN_N} answers.</span></p>`);
  function questionResult(q, side, ctx, chosen) {
    const r = q.result(side, ctx || {}, chosen);
    if (!r) return honest(q);
    if (r.html) return r.html;
    return bars(r, chosen);
  }

  /* Where a rate sits against the Rate Index for the role (RN.model.rateFor, adjusted by company revenue) */
  C.position = function (hourly, cat, rev) {
    const r = RN.model.rateFor(cat, rev);
    const p25 = r5(r.p25), p50 = r5(r.p50), p75 = r5(r.p75);
    hourly = Math.round(hourly);
    const band = hourly < p25 ? 'below' : hourly < p50 ? 'lower' : hourly === p50 ? 'median' : hourly <= p75 ? 'upper' : 'above';
    return { hourly: Math.round(hourly), p25, p50, p75, n: r.n, m: r.m, band, directional: r.n < MIN_CELL };
  };
  const BAND = {
    below: 'below the typical range', lower: 'in the typical range, under the median', median: 'right at the median',
    upper: 'in the typical range, over the median', above: 'above the typical range',
  };
  C.bandText = (b) => BAND[b] || '';
  function scale(pos, youLabel) {
    const lo = Math.min(pos.p25 * 0.7, pos.hourly * 0.9), hi = Math.max(pos.p75 * 1.3, pos.hourly * 1.1);
    const pct = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
    const you = pct(pos.hourly);
    const aria = `${youLabel} ${RN.fmt.usd(pos.hourly)} an hour. Typical range ${RN.fmt.hrRange(pos.p25, pos.p75)}, median ${RN.fmt.usd(pos.p50)} an hour.`;
    return `<div class="cx-scale" role="img" aria-label="${esc(aria)}">
      <div class="cx-scale-you" style="--x:${RN.clamp(you, 9, 91).toFixed(1)}%"><span>${esc(youLabel)} ${esc(RN.fmt.usd(pos.hourly))}/hr</span></div>
      <div class="cx-scale-track"><i class="cx-scale-iqr" style="left:${pct(pos.p25).toFixed(1)}%;width:${(pct(pos.p75) - pct(pos.p25)).toFixed(1)}%"></i><i class="cx-scale-med" style="left:${pct(pos.p50).toFixed(1)}%"></i><i class="cx-scale-pin" style="left:${you.toFixed(1)}%"></i></div>
      <dl class="cx-scale-ax"><div><dt>25th percentile</dt><dd>${esc(RN.fmt.usd(pos.p25))}</dd></div><div><dt>Median</dt><dd>${esc(RN.fmt.usd(pos.p50))}</dd></div><div><dt>75th percentile</dt><dd>${esc(RN.fmt.usd(pos.p75))}</dd></div></dl>
    </div>`;
  }

  /* ---------- Flow modal ---------- */
  let F = null; // the open flow: {kind, ctx, side, el, data}
  const flowOpen = () => F && F.el && document.contains(F.el);
  function modal(o) {
    F.el = RN.ui.modal({ width: o.width || 600, title: o.title, sub: o.sub, body: `<div class="cx-flow" data-cx-flow="${esc(F.kind)}">${o.body}</div>`, foot: o.foot, onClose: () => { F = null; } });
    F.el.querySelector('.modal').classList.add('cx-modal');
    return F.el;
  }
  function paint(o) {
    if (!flowOpen()) return modal(o);
    const m = F.el;
    if (o.title != null) m.querySelector('.modal-hd h2').innerHTML = o.title;
    let sub = m.querySelector('.modal-hd .sub');
    if (o.sub) { if (!sub) { sub = document.createElement('p'); sub.className = 'sub'; m.querySelector('.modal-hd h2').after(sub); } sub.innerHTML = o.sub; } else if (sub) sub.remove();
    m.querySelector('.modal-bd').innerHTML = `<div class="cx-flow" data-cx-flow="${esc(F.kind)}">${o.body}</div>`;
    let ft = m.querySelector('.modal-ft');
    if (o.foot) { if (!ft) { ft = document.createElement('div'); ft.className = 'modal-ft'; m.querySelector('.modal').appendChild(ft); } ft.innerHTML = o.foot; } else if (ft) ft.remove();
    m.querySelector('.modal').scrollTop = 0;
    const f = m.querySelector('[data-cx-focus]') || m.querySelector('.modal-bd input:not([type=hidden]), .modal-bd button:not(.tip), .modal-bd select, .modal-bd textarea');
    setTimeout(() => { if (f) f.focus({ preventScroll: true }); }, 30);
    return m;
  }
  const show = (o) => (flowOpen() ? paint(o) : modal(o));

  // Side picker: "Are you hiring or an operator?"
  function sidePicker(next, intro) {
    return {
      title: 'Are you hiring or an operator?',
      sub: esc(intro || 'The questions differ a little for each side.'),
      body: `<div class="cx-sides" role="group" aria-label="Which side are you on">
        <button type="button" class="optcard cx-side" data-act="cx-side" data-side="company" data-next="${esc(next)}">${RN.ui.icoTile('building', { size: 'sm', tone: 'info' })}<b>I hire</b><span>A company that hired, or plans to hire, a fractional GTM leader</span></button>
        <button type="button" class="optcard cx-side" data-act="cx-side" data-side="operator" data-next="${esc(next)}">${RN.ui.icoTile('user', { size: 'sm', tone: 'forest' })}<b>I'm an operator</b><span>A fractional GTM leader or seller who works with companies</span></button>
      </div>${C.trust()}`,
    };
  }

  /* ---------- Open a flow ---------- */
  C.open = function (kind, ctx) {
    ctx = Object.assign({}, ctx || {});
    if (flowOpen() && F.kind !== kind) { F.kind = kind; F.ctx = ctx; }
    else if (!flowOpen()) F = { kind, ctx, el: null, data: {} };
    else F.ctx = ctx;
    F.data = {};
    if (kind === 'rates') {
      const side = C.side();
      if (side) return C.open(side === 'operator' ? 'rate' : 'paid', ctx);
      return show(sidePicker('rates', 'Operators add a rate they charge. Companies add what they paid.'));
    }
    if (kind === 'rate' || kind === 'paid') return show(rateForm(kind, ctx));
    if (kind === 'pulse') { const side = C.side(); return show(side ? pulseForm(side, ctx) : sidePicker('pulse')); }
    if (kind === 'survey') return openSurvey(ctx);
    if (kind === 'insight') return show(insightForm(ctx));
    console.warn('Unknown contribution kind:', kind);
    return null;
  };

  RN.actions['cx-open'] = (el) => {
    const ctx = parse(el.dataset.ctx);
    // A topic answer from a one-tap question carries over into the flow
    C.open(el.dataset.kind, ctx);
  };
  RN.actions['cx-side'] = (el) => {
    const side = el.dataset.side;
    if (persona() === 'visitor' || persona() === 'admin') C.setSide(side);
    if (F) F.side = side;
    const next = el.dataset.next;
    const ctx = (F && F.ctx) || {};
    if (next === 'rates') { F.kind = side === 'operator' ? 'rate' : 'paid'; return show(rateForm(F.kind, ctx, true)); }
    if (next === 'pulse') return show(pulseForm(side, ctx));
    if (next === 'survey') { F.side = side; return surveyStep(); }
    return null;
  };

  /* ---------- Rate and paid ---------- */
  function prefillRate(kind, ctx) {
    const d = { cat: ctx.cat || '', role: ctx.role || '', hours: ctx.hours || '', rev: ctx.rev || '', type: ctx.type || '', basis: ctx.basis || 'hourly', rate: ctx.rate || '', retainer: ctx.retainer || '', monthly: ctx.monthly || '', again: ctx.again || '', quarter: C.period().key };
    const op = RN.myOp && RN.myOp();
    if (kind === 'rate' && op) {
      d.cat = d.cat || op.catKey || '';
      // The profile's rate, hours and seat belong to the operator's own category: never file them under another one
      if (d.cat === op.catKey) {
        if (!d.role && (RN.fields.rolesByCat[d.cat] || []).includes(op.role)) d.role = op.role;
        if (!d.rate && op.rate) { d.rate = op.rate; d.fromProfile = true; }
        if (!d.hours && op.avail && op.avail.hoursCode) d.hours = op.avail.hoursCode;
      }
    }
    if (kind === 'paid' && persona() === 'buyer') {
      const co = RN.personas.buyer.company || {};
      d.rev = d.rev || co.revenueRange || '';
      const h = ctx.hireId && (st().hires || []).find((x) => x.id === ctx.hireId);
      if (h && RN.hire) {
        const t = h.terms || {};
        const hop = RN.model.byId(h.opId);
        d.cat = d.cat || (RN.hire.category ? RN.hire.category(h) : '') || (hop ? hop.catKey : '');
        if (!d.role && hop && (RN.fields.rolesByCat[d.cat] || []).includes(hop.role)) d.role = hop.role;
        d.hours = d.hours || t.hoursPerMonth || '';
        d.type = d.type || t.engagementType || '';
        d.monthly = d.monthly || (RN.hire.monthly ? RN.hire.monthly(h) : '') || '';
        d.fromHire = true;
      }
    }
    return d;
  }
  function roleField(cat, value) {
    if (!cat || !RN.fields.rolesByCat[cat]) return `<div class="field"><label for="cx-role">Seat</label><select class="select" id="cx-role" name="role" disabled><option value="">Pick a role category first</option></select></div>`;
    return RN.w.field('role', value, { name: 'role', id: 'cx-role', cat, label: 'Seat', help: '', placeholder: 'Select the seat' });
  }
  RN.inputs['cx-cat'] = (el) => {
    const form = el.closest('form');
    const box = form && form.querySelector('[data-cx-role]');
    if (box) box.innerHTML = roleField(el.value, '');
  };
  RN.actions['cx-basis'] = (el) => {
    const form = el.closest('form');
    const v = el.dataset.v;
    form.querySelector('input[name=basis]').value = v;
    RN.$$('[data-act="cx-basis"]', form).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    RN.$$('[data-cx-basis]', form).forEach((p) => { p.hidden = p.dataset.cxBasis !== v; });
    const inp = form.querySelector(`[data-cx-basis="${v}"] input`);
    if (inp) inp.focus();
  };

  function rateForm(kind, ctx, picked) {
    const d = prefillRate(kind, ctx);
    const P = C.period();
    const op = kind === 'rate';
    const ws = RN.w;
    const priceOp = `<div class="field cx-price" data-cx-f="price"><span class="field-label" id="cx-price-l">What you charge</span>
        <div class="seg" role="group" aria-labelledby="cx-price-l"><button type="button" data-act="cx-basis" data-v="hourly" aria-pressed="${d.basis !== 'monthly'}">Hourly rate</button><button type="button" data-act="cx-basis" data-v="monthly" aria-pressed="${d.basis === 'monthly'}">Monthly retainer</button></div>
        <input type="hidden" name="basis" value="${esc(d.basis)}">
        <div data-cx-basis="hourly" ${d.basis === 'monthly' ? 'hidden' : ''}><label class="sr-only" for="cx-rate">Hourly rate</label>${ws.control('rate', d.rate, { name: 'rate', id: 'cx-rate' })}</div>
        <div data-cx-basis="monthly" ${d.basis === 'monthly' ? '' : 'hidden'}><label class="sr-only" for="cx-retainer">Monthly retainer</label><div class="input-affix"><span class="affix">$</span><input class="input" id="cx-retainer" name="retainer" type="number" inputmode="numeric" min="0" step="100" value="${esc(d.retainer)}"><span class="affix">/ month</span></div></div>
        ${d.fromProfile ? '<p class="help">From your profile. Change it if this engagement is priced differently.</p>' : ''}
      </div>`;
    const pricePaid = moneyField('monthly', 'What you paid per month', d.monthly, '/ month', { step: 100, help: d.fromHire ? 'From the terms you confirmed. Change it if the invoice was different.' : 'The operator\'s fee, before any tools or expenses.' });
    const body = `<form class="cx-form" id="cx-form" data-submit="cx-submit" data-kind="${kind}" novalidate>
      ${C.trust()}
      ${ws.field('roleCategory', d.cat, { name: 'cat', id: 'cx-cat', help: '', change: 'cx-cat', label: 'Role category' })}
      <div data-cx-role>${roleField(d.cat, d.role)}</div>
      ${op ? priceOp : pricePaid}
      ${ws.field('hoursPerMonth', d.hours, { name: 'hours', id: 'cx-hours', label: 'Hours a month', help: '' })}
      ${ws.field('companyRevenue', d.rev, { name: 'rev', id: 'cx-rev', label: op ? 'The company\'s revenue' : 'Your company\'s revenue', help: '' })}
      ${ws.field('engagementType', d.type, { name: 'type', id: 'cx-type', label: 'Engagement type', help: '' })}
      ${op ? '' : chipField('again', 'Would you hire a fractional leader for this seat again?', opts('hireAgain').concat({ v: 'unsure', l: 'Not sure' }), d.again, { opt: true })}
      ${needsEmail() ? emailField() : ''}
    </form>`;
    return {
      title: op ? `Add your rate to the ${P.short} Rate Index` : `Add what you paid to the ${P.short} Rate Index`,
      sub: `${esc(C.datasets.rateIndex.time)}. Published only in aggregate, never individually. You'll see where it sits right away. The ${esc(P.label)} window closes ${esc(P.closes)}.`,
      body,
      foot: `${picked || (C.side() === null && persona() === 'visitor') ? `<button type="button" class="act muted cx-ft-l" data-act="cx-switch" data-to="${op ? 'paid' : 'rate'}">${op ? 'I paid for a seat instead' : 'I charge a rate instead'}</button>` : ''}<button class="btn" type="submit" form="cx-form">${op ? 'See where my rate sits' : 'See how it compares'}${icon('arrow')}</button>`,
    };
  }
  RN.actions['cx-switch'] = (el) => { const to = el.dataset.to; if (persona() === 'visitor' || persona() === 'admin') C.setSide(to === 'rate' ? 'operator' : 'company'); if (F) F.kind = to; show(rateForm(to, (F && F.ctx) || {}, true)); };

  function submitRate(form, data) {
    const kind = form.dataset.kind, op = kind === 'rate';
    if (!data.cat) return errAt(form, 'cat', 'Pick the role category.');
    let hourly = 0;
    const hrs = RN.model.hoursNum(data.hours);
    if (op) {
      if (data.basis === 'monthly') {
        const m = +data.retainer;
        if (!m) return errAt(form, 'retainer', 'Add the monthly retainer.');
        if (!data.hours) return errAt(form, 'hours', 'Pick the hours a month, so we can compare it with hourly rates.');
        if (m < 300 || m > 100000) return errAt(form, 'retainer', 'That looks off. Enter the monthly retainer in dollars.');
        hourly = m / hrs;
      } else {
        hourly = +data.rate;
        if (!hourly) return errAt(form, 'rate', 'Add your hourly rate.');
        if (hourly < 25 || hourly > 2000) return errAt(form, 'rate', 'That looks off. Enter your hourly rate in dollars.');
        if (!data.hours) return errAt(form, 'hours', 'Pick the hours a month.');
      }
    } else {
      const m = +data.monthly;
      if (!m) return errAt(form, 'monthly', 'Add what you paid per month.');
      if (m < 300 || m > 100000) return errAt(form, 'monthly', 'That looks off. Enter the monthly amount in dollars.');
      if (!data.hours) return errAt(form, 'hours', 'Pick the hours a month, so we can compare it with hourly rates.');
      hourly = m / hrs;
    }
    let email = meEmail();
    if (needsEmail()) {
      email = String(data.email || '').trim();
      if (!validEmail(email)) return errAt(form, 'email', 'Add a work email. We use it only to verify and send your benchmark.');
    }
    const P = C.period();
    const quarter = P.key; // only the open window can be fed
    const answers = op
      ? { cat: data.cat, role: data.role || '', basis: data.basis === 'monthly' ? 'monthly' : 'hourly', rate: data.basis === 'monthly' ? null : +data.rate, retainer: data.basis === 'monthly' ? +data.retainer : null, hours: data.hours, rev: data.rev || '', type: data.type || '', quarter, hourly: Math.round(hourly) }
      : { cat: data.cat, role: data.role || '', monthly: +data.monthly, hours: data.hours, rev: data.rev || '', type: data.type || '', again: data.again || '', hourly: Math.round(hourly), hireId: (F && F.ctx && F.ctx.hireId) || null };
    const rec = save({ id: RN.uid('ctb'), kind, dataset: 'rateIndex', period: P.key, periodLabel: P.label, persona: persona(), side: op ? 'operator' : 'company', answers, createdAt: RN.now().toISOString(), email: email || undefined, status: 'done', source: (F && F.ctx && F.ctx.source) || '' });
    if (persona() === 'visitor') C.setSide(op ? 'operator' : 'company');
    const pos = C.position(hourly, data.cat, data.rev);
    track(kind, F && F.ctx, { cat: data.cat });
    if (email) RN.mail(email, `Your ${P.short} Rate Index benchmark`, `${op ? 'Your rate' : 'What you paid'} for ${catLabel(data.cat)} works out to ${RN.fmt.usd(pos.hourly)}/hr. That is ${BAND[pos.band]} in the ${C.indexLabel()}: ${RN.fmt.hrRange(pos.p25, pos.p75)}, median ${RN.fmt.usd(pos.p50)}/hr${data.rev ? ` for ${revLabel(data.rev)} companies` : ''}.\n\nIt goes into the ${P.label} Rate Index, published in the first two weeks of ${P.publishes}. Published only in aggregate, never individually.`, 'research');
    C.refresh();
    show(rateResult(rec));
  }

  function rateResult(rec) {
    const a = rec.answers || {}, op = rec.kind === 'rate';
    const P = C.period();
    const pos = C.position(a.hourly, a.cat, a.rev);
    const pub = C.published('rateIndex', { cat: a.cat });
    const who = op ? 'Your rate' : 'What you paid';
    const mr = RN.model.monthlyRange(a.cat, a.rev, a.hours);
    const conv = op && a.basis === 'monthly' ? `<p class="cx-res-line">Your ${esc(RN.fmt.usd(a.retainer))} retainer for ${esc(RN.w.label('hoursPerMonth', a.hours))} works out to ${esc(RN.fmt.usd(a.hourly))}/hr.</p>`
      : !op ? `<p class="cx-res-line">${esc(RN.fmt.usd(a.monthly))} for ${esc(RN.w.label('hoursPerMonth', a.hours))} works out to ${esc(RN.fmt.usd(a.hourly))}/hr. At those hours the index puts this seat at <b class="nowrap">${esc(mr.label)}</b>.</p>` : '';
    // Share the published category median and its n (the result above is revenue-adjusted; the share is not)
    const bc = (RI().byCat || {})[a.cat];
    const idxQ = C.indexLabel().replace(/ index$/, '');
    const shareO = bc
      ? { title: `${catLabel(a.cat)} rates, Revenue Nomad Rate Index`, route: 'rates.' + a.cat, kind: 'rateIndex', quote: `The median fractional ${catLabel(a.cat)} rate is ${RN.fmt.usd(Math.round(bc.p50))}/hr, from ${RN.fmt.plural(bc.n, 'rate')}. Revenue Nomad Rate Index, ${idxQ}.` }
      : { title: 'The Revenue Nomad Rate Index', route: 'rates', kind: 'rateIndex', quote: `Median hourly rates for fractional GTM leaders by role category. Revenue Nomad Rate Index, ${idxQ}.` };
    return {
      title: op ? 'Where your rate sits' : 'How it compares',
      sub: `${esc(catLabel(a.cat))}${a.role ? ', ' + esc(a.role) : ''}${a.rev ? ` at ${esc(revLabel(a.rev))} companies` : ''}`,
      body: `<div class="cx-res">
        <p class="cx-res-kicker">${icon('check-circle')}<span>Added to the ${esc(P.label)} Rate Index</span></p>
        <h3 class="h3 cx-res-h" tabindex="-1" data-cx-focus>${esc(who)} is ${esc(BAND[pos.band])}<span class="vm">.</span></h3>
        ${scale(pos, op ? 'You' : 'You paid')}
        ${conv}
        <p class="cx-src">${esc(C.indexLabel().replace(/^./, (c) => c.toUpperCase()))} for ${esc(catLabel(a.cat))}${a.rev ? `, adjusted for ${esc(revLabel(a.rev))} companies` : ', all company sizes'}. ${esc(RN.fmt.plural(pub.n, 'rate'))} in this category${pub.directional ? `, under our minimum of ${MIN_CELL}, so read it as directional` : ''}.</p>
        ${RN.ui.illus()}
        <p class="cx-res-next">Your ${op ? 'rate' : 'number'} goes into the ${esc(P.label)} index, published in the first two weeks of ${esc(P.publishes)}. Published only in aggregate, never individually.</p>
        ${shareLine(op ? 'Know an operator who should add theirs?' : 'Know a company that should compare theirs?', shareO, 'Share the Rate Index')}
      </div>`,
      foot: `<button type="button" class="act muted cx-ft-l" data-act="cx-open" data-kind="${rec.kind}" data-ctx="${jsonAttr({ cat: a.cat, source: 'again' })}">${op ? 'Add another rate' : 'Add another seat'}</button><button type="button" class="btn" data-act="modal-close">Done</button>`,
    };
  }
  function shareLine(lead, o, label) {
    return `<div class="cx-share-line"><span>${esc(lead)}</span><div class="row cx-share-acts">${S.button(o, label || 'Share', 'btn btn-line btn-sm')}${persona() === 'operator' ? S.button(Object.assign({}, o, { mode: 'take' }), 'Share with your take', 'btn btn-ghost btn-sm') : ''}</div></div>`;
  }

  /* ---------- Pulse ---------- */
  function pulseRec(side) {
    const P = C.period();
    return current('pulse')[0] || { id: RN.uid('ctb'), kind: 'pulse', dataset: 'pulse', period: P.key, periodLabel: P.label, persona: persona(), side, answers: {}, createdAt: RN.now().toISOString(), status: 'partial' };
  }
  function pulseForm(side, ctx) {
    F.side = side;
    const P = C.period();
    const prev = (current('pulse')[0] || {}).answers || {};
    const pre = Object.assign({}, prev, ctx && ctx.answers);
    const qs = pulseIds(side).map((id) => C.questions[id]);
    return {
      title: `The ${P.short} Pulse`,
      sub: `Three questions, about 60 seconds. ${side === 'operator' ? 'Operator' : 'Company'} questions. <button type="button" class="act" data-act="cx-pulse-swap" data-side="${side === 'operator' ? 'company' : 'operator'}">${side === 'operator' ? 'I hire instead' : 'I\'m an operator instead'}</button>`,
      body: `<form class="cx-form" id="cx-form" data-submit="cx-submit" data-kind="pulse" data-side="${side}" novalidate>
        ${C.trust({ anon: true })}
        ${qs.map((q, i) => chipField(q.id, `${i + 1}. ${q.text(side)}`, q.options(side), pre[q.id])).join('')}
        ${needsEmail() && !C.subscribed() ? emailField({ label: 'Subscribe to the quarterly Pulse', optional: true, help: 'A newsletter subscription: the results publish in the Pulse. One email a quarter, unsubscribe in one click. Leave it empty to stay anonymous.' }) : ''}
      </form>`,
      foot: `<button class="btn" type="submit" form="cx-form">Send my answers${icon('arrow')}</button>`,
    };
  }
  RN.actions['cx-pulse-swap'] = (el) => { if (persona() === 'visitor' || persona() === 'admin') C.setSide(el.dataset.side); show(pulseForm(el.dataset.side, (F && F.ctx) || {})); };
  C.subscribed = () => !!(st().seen && st().seen['ins-pulse']);
  function subscribe(email, src) {
    if (!validEmail(email) || C.subscribed()) return;
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen); s.seen['ins-pulse'] = { email, ts: RN.now().toISOString(), source: src }; }, 'seen');
    RN.track('newsletter_signup', { source: src, meta: { list: 'pulse' } });
    RN.mail(email, 'You are subscribed to the Fractional GTM Pulse', `Once a quarter: the Rate Index by role category, the Demand Index, new research and the Pulse results.\n\nYour ${C.period().label} answers publish in the ${C.period().publishes} Pulse.\nOne email a quarter. Unsubscribe from any issue in one click.`, 'newsletter');
  }
  function submitPulse(form, data) {
    const side = form.dataset.side;
    const ids = pulseIds(side);
    const missing = ids.find((id) => !data[id]);
    if (missing) return errAt(form, missing, 'Pick one answer.');
    const email = String(data.email || '').trim();
    if (email && !validEmail(email)) return errAt(form, 'email', 'Check the email, or leave it empty.');
    const rec = pulseRec(side);
    rec.side = side;
    ids.forEach((id) => { rec.answers[id] = data[id]; });
    rec.status = 'done';
    rec.createdAt = RN.now().toISOString();
    if (email) rec.email = email;
    save(rec);
    if (email) subscribe(email, 'pulse');
    track('pulse', F && F.ctx, { side });
    C.refresh();
    show(pulseResult(rec));
  }
  function pulseResult(rec) {
    const P = C.period(), side = rec.side || 'company';
    const qs = pulseIds(side).map((id) => C.questions[id]);
    return {
      title: 'How others answered',
      sub: `Your ${esc(P.label)} Pulse answers are in.`,
      body: `<div class="cx-res">
        <p class="cx-res-kicker" tabindex="-1" data-cx-focus>${icon('check-circle')}<span>Thanks. Your answers go into the ${esc(P.publishes)} Pulse and the Demand Index.</span></p>
        ${qs.map((q) => `<section class="cx-res-q"><h3 class="h5">${esc(q.text(side))}</h3><p class="cx-res-mine">Your answer <b>${esc(optLabel(q, side, rec.answers[q.id]))}</b></p>${questionResult(q, side, {}, rec.answers[q.id])}</section>`).join('')}
        ${shareLine('Know someone who should answer too?', { title: 'The Fractional GTM Pulse', route: 'insights', kind: 'pulse', quote: 'Three questions a quarter on fractional GTM demand, hiring plans and the problems companies bring operators in to fix.' }, 'Share the Pulse')}
      </div>`,
      foot: '<button type="button" class="btn" data-act="modal-close">Done</button>',
    };
  }

  /* ---------- One-tap question (end of an article) ---------- */
  C.pulse = function (qid, ctx) {
    ctx = ctx || {};
    const q = C.questions[qid];
    if (!q) return '';
    return `<section class="cx-pulse" data-cx-pulse="${esc(qid)}" data-ctx="${jsonAttr(ctx)}">${pulseInner(q, ctx)}</section>`;
  };
  function tapRec(q) {
    if (q.kind === 'pulse') return current('pulse')[0] || null;
    return all().find((c) => mineOnly(c) && c.kind === 'topic' && c.period === C.period().key && (c.answers || {})[q.id]) || null;
  }
  function pulseInner(q, ctx) {
    const known = C.side();
    const side = known || 'company';
    const rec = tapRec(q);
    const chosen = rec && rec.answers && rec.answers[q.id];
    const uid = 'cxp-' + q.id + '-' + RN.hash(JSON.stringify(ctx)).toString(36);
    // A one-tap topic answer is a question about a dataset, not a contribution to it (admin counts it separately)
    const eyebrow = q.kind === 'pulse' ? `${C.period().short} Pulse` : q.dataset === 'rateIndex' ? 'Rate Index question' : '2028 report question';
    const sidePick = !known ? `<div class="seg cx-pulse-side" role="group" aria-label="Answer as"><button type="button" data-act="cx-tap-side" data-side="company" aria-pressed="true">I hire</button><button type="button" data-act="cx-tap-side" data-side="operator" aria-pressed="false">I'm an operator</button></div>` : '';
    const head = `<div class="cx-pulse-hd"><span class="cx-pulse-eb">${icon(q.kind === 'pulse' ? 'wave' : q.dataset === 'rateIndex' ? 'chart' : 'book')}<span>${esc(eyebrow)}</span><span class="cx-pulse-dot" aria-hidden="true"></span><span>One tap, anonymous</span></span>${chosen ? '' : sidePick}</div>`;
    if (!chosen) {
      return `${head}<h3 class="cx-pulse-q" id="${uid}">${esc(q.text(side, ctx))}</h3>
        <div class="cx-opts" role="group" aria-labelledby="${uid}">${q.options(side).map((o) => `<button type="button" class="chip" data-act="cx-tap" data-q="${esc(q.id)}" data-v="${esc(o.v)}" data-side="${side}">${esc(o.l)}</button>`).join('')}</div>`;
    }
    const s = (rec && rec.side) || side;
    const follow = q.flow
      ? `<button type="button" class="btn btn-sm" data-act="cx-open" data-kind="${s === 'operator' ? 'rate' : 'paid'}" data-ctx="${jsonAttr({ cat: ctx.cat || '', source: 'pulse-' + q.id })}">${s === 'operator' ? 'Add your rate, see where you sit' : 'Add the details, see how it compares'}${icon('arrow')}</button>`
      : q.kind === 'pulse' && !C.done('pulse') ? `<button type="button" class="act" data-act="cx-open" data-kind="pulse" data-ctx="${jsonAttr({ source: 'pulse-' + q.id })}">Answer the other two Pulse questions${icon('arrow')}</button>` : '';
    return `${head}<h3 class="cx-pulse-q" id="${uid}">${esc(q.text(s, ctx))}</h3>
      <p class="cx-res-mine" role="status">${icon('check')}Your answer <b>${esc(optLabel(q, s, chosen))}</b><button type="button" class="act muted" data-act="cx-tap-undo" data-q="${esc(q.id)}">Change</button></p>
      <div class="cx-pulse-res">${questionResult(q, s, ctx, chosen)}</div>
      ${follow ? `<div class="cx-pulse-ft">${follow}</div>` : ''}`;
  }
  function repaintPulse(box) {
    const q = C.questions[box.dataset.cxPulse];
    if (q) box.innerHTML = pulseInner(q, parse(box.dataset.ctx));
  }
  RN.actions['cx-tap'] = (el) => {
    const box = el.closest('[data-cx-pulse]');
    const q = C.questions[el.dataset.q];
    if (!q) return;
    const side = el.dataset.side || C.side() || 'company';
    if (!C.side() && (persona() === 'visitor' || persona() === 'admin')) C.setSide(side);
    const P = C.period();
    let rec = tapRec(q);
    if (q.kind === 'pulse') rec = rec || pulseRec(side);
    else rec = rec || { id: RN.uid('ctb'), kind: 'topic', dataset: q.dataset, period: P.key, periodLabel: P.label, persona: persona(), side, answers: {}, createdAt: RN.now().toISOString(), status: 'done', source: 'tap' };
    rec.side = rec.side || side;
    rec.answers = Object.assign({}, rec.answers, { [q.id]: el.dataset.v });
    if (q.kind === 'pulse') rec.status = pulseComplete(rec) ? 'done' : 'partial';
    save(rec);
    track(q.kind === 'pulse' ? 'pulse' : 'topic', { source: 'tap-' + q.id }, { qid: q.id });
    if (box) { repaintPulse(box); const f = box.querySelector('[role=status]'); if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); } }
    C.refresh(document, box);
  };
  RN.actions['cx-tap-side'] = (el) => {
    const box = el.closest('[data-cx-pulse]');
    const side = el.dataset.side;
    const q = box && C.questions[box.dataset.cxPulse];
    if (!q) return;
    const ctx = parse(box.dataset.ctx);
    RN.$$('[data-act="cx-tap-side"]', box).forEach((b) => b.setAttribute('aria-pressed', b.dataset.side === side));
    box.querySelector('.cx-pulse-q').textContent = q.text(side, ctx);
    box.querySelector('.cx-opts').innerHTML = q.options(side).map((o) => `<button type="button" class="chip" data-act="cx-tap" data-q="${esc(q.id)}" data-v="${esc(o.v)}" data-side="${side}">${esc(o.l)}</button>`).join('');
  };
  RN.actions['cx-tap-undo'] = (el) => {
    const box = el.closest('[data-cx-pulse]');
    const q = C.questions[el.dataset.q];
    const rec = q && tapRec(q);
    if (rec) {
      const a = Object.assign({}, rec.answers); delete a[q.id];
      if (q.kind === 'topic' && !Object.keys(a).length) RN.store.update((s) => { s.contributions = (s.contributions || []).filter((x) => x.id !== rec.id); }, 'contributions');
      else { rec.answers = a; if (q.kind === 'pulse') rec.status = pulseComplete(rec) ? 'done' : 'partial'; save(rec); }
    }
    if (box) { repaintPulse(box); const b = box.querySelector('[data-act="cx-tap"]'); if (b) b.focus({ preventScroll: true }); }
    C.refresh(document, box);
  };

  /* ---------- The 2028 survey ---------- */
  // The viewer's latest Rate Index contribution prefills the matching survey answers (never someone else's)
  const lastRate = (kind) => current(kind).find(finished);
  const fromRate = (key) => () => {
    const r = lastRate('rate'), p = lastRate('paid'), a = (r || p || {}).answers || {};
    const op = RN.myOp && RN.myOp();
    if (key === 'cat') return a.cat || (op ? op.catKey : '');
    if (key === 'rate') return (r && r.answers.hourly) || (op && op.rate) || '';
    if (key === 'paid') return (p && p.answers.monthly) || '';
    if (key === 'hours') return a.hours || '';
    if (key === 'type') return a.type || '';
    if (key === 'rev') return a.rev || (persona() === 'buyer' ? RN.personas.buyer.company.revenueRange : '');
    return '';
  };
  const triggerOpts = () => slugOpts(REP().triggers).concat({ v: 'other', l: 'Something else' });
  const SURVEY = [
    // 1 Who is hiring
    { id: 's1-trigger', ch: 1, side: 'company', label: 'What made you bring in a fractional leader?', choice: triggerOpts },
    { id: 's1-rev', ch: 1, side: 'company', label: 'Your company\'s revenue', field: 'companyRevenue', pre: fromRate('rev') },
    { id: 's1-trigger', ch: 1, side: 'operator', label: 'What triggered your most recent new engagement?', choice: triggerOpts },
    { id: 's1-rev', ch: 1, side: 'operator', label: 'That company\'s revenue', field: 'companyRevenue', pre: fromRate('rev') },
    // 2 What it costs
    { id: 's2-cat', ch: 2, side: 'company', label: 'Which seat did you fill?', field: 'roleCategory', pre: fromRate('cat') },
    { id: 's2-paid', ch: 2, side: 'company', label: 'What did you pay per month?', money: '/ month', pre: fromRate('paid') },
    { id: 's2-cat', ch: 2, side: 'operator', label: 'Your role category', field: 'roleCategory', pre: fromRate('cat') },
    { id: 's2-rate', ch: 2, side: 'operator', label: 'Your hourly rate', money: '/ hr', pre: fromRate('rate') },
    // 3 How it is scoped
    { id: 's3-hours', ch: 3, side: 'both', label: 'Hours a month', field: 'hoursPerMonth', pre: fromRate('hours') },
    { id: 's3-term', ch: 3, side: 'both', label: 'Initial term', field: 'term' },
    { id: 's3-type', ch: 3, side: 'both', label: 'Engagement type', field: 'engagementType', pre: fromRate('type') },
    // 4 Roles in demand
    { id: 's4-next', ch: 4, side: 'company', label: 'Which seat are you most likely to fill in the next 12 months?', choice: () => opts('roleCategory').concat({ v: 'none', l: 'None planned' }) },
    { id: 's4-asked', ch: 4, side: 'operator', label: 'Which seats are companies asking you about most? Pick up to 2.', choice: () => opts('roleCategory'), multi: true, max: 2 },
    // 5 Who gets rehired
    { id: 's5-hindsight', ch: 5, side: 'company', label: 'Looking back, what mattered most in choosing your operator?', choice: () => REP().hindsight.map((r) => ({ v: RN.slug(r[0]), l: r[0] })) },
    { id: 's5-again', ch: 5, side: 'company', label: 'Would you hire a fractional leader again?', choice: () => opts('hireAgain').concat({ v: 'unsure', l: 'Not sure' }) },
    { id: 's5-extended', ch: 5, side: 'operator', label: 'Was your last engagement extended past its original term?', choice: () => [{ v: 'extended', l: 'Yes, extended' }, { v: 'on_term', l: 'Ended on term' }, { v: 'early', l: 'Ended early' }, { v: 'running', l: 'Still running' }] },
    // 6 The operator side
    { id: 's6-source', ch: 6, side: 'company', label: 'How did you find your operator?', choice: () => slugOpts(REP().sources) },
    { id: 's6-concurrent', ch: 6, side: 'operator', label: 'How many companies do you work with right now?', choice: () => REP().concurrent.map((r) => ({ v: RN.slug(r.l), l: r.l })) },
    { id: 's6-source', ch: 6, side: 'operator', label: 'Where did your last engagement come from?', choice: () => slugOpts(REP().sources) },
  ];
  C.surveyQuestions = (side) => SURVEY.filter((q) => q.side === 'both' || q.side === side);
  const chapterOf = (v) => { if (!v) return 0; const n = typeof v === 'number' ? v : C.chapters.findIndex((c) => c.id === v || String(c.n) === String(v)) + 1; return RN.clamp(+n || 0, 0, 6); };

  function openSurvey(ctx) {
    const d = C.draft();
    const done = C.done('survey');
    const rec = d || done || null;
    F.rec = rec ? JSON.parse(JSON.stringify(rec)) : null;
    F.side = (rec && rec.side) || C.side();
    const at = chapterOf(ctx.chapter);
    // A chapter line opens just that chapter (Save, or Continue with the rest); "full" walks every chapter
    F.single = at && !ctx.full ? at : 0;
    F.pre = {};
    if (done && !d && !at) return show(surveyResult(done));
    F.chapter = at || (rec && rec.chapter) || 1;
    if (!F.side) return show(sidePicker('survey', 'The 2028 survey asks each side its own questions.'));
    return surveyStep();
  }
  function surveyRec() {
    if (!F.rec) F.rec = { id: RN.uid('ctb'), kind: 'survey', dataset: 'report2028', edition: 2028, period: '2028', periodLabel: '2028 edition', persona: persona(), side: F.side, answers: {}, createdAt: RN.now().toISOString(), status: 'draft', chapter: 1 };
    F.rec.side = F.side;
    return F.rec;
  }
  // A value filled in from the profile or a Rate Index answer; remembered so it never counts as an answer on its own
  function preOf(q, val) {
    if (val != null && val !== '') return val;
    const v = q.pre ? q.pre() : '';
    if (v != null && v !== '') { F.pre = F.pre || {}; F.pre[q.id] = String(v); }
    return v;
  }
  function surveyQ(q, val) {
    const name = q.id;
    if (q.field) return RN.w.field(q.field, preOf(q, val), { name, id: 'cx-' + name, label: q.label, help: '' });
    if (q.money) return moneyField(name, q.label, preOf(q, val), q.money, { step: q.money === '/ hr' ? 5 : 100 });
    return chipField(name, q.label, q.choice(), val, { multi: q.multi, max: q.max });
  }
  function surveyStep() {
    const rec = surveyRec();
    const n = F.chapter;
    if (n > 6) return show(surveyFinish());
    const ch = C.chapters[n - 1];
    const qs = C.surveyQuestions(F.side).filter((q) => q.ch === n);
    const pct = Math.round(((n - 1) / 6) * 100);
    return show({
      title: 'Shape the 2028 report',
      sub: `State of Fractional GTM 2028. ${F.side === 'operator' ? 'Operator' : 'Company'} questions.`,
      body: `<div class="cx-prog-hd"><span class="step-count">Chapter ${n} of 6</span><span class="cx-prog-t">${esc(ch.t)}</span></div>
        <div class="cx-prog" role="progressbar" aria-label="Survey progress" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${n - 1}" aria-valuetext="Chapter ${n} of 6, ${esc(ch.t)}"><i style="width:${pct}%"></i></div>
        <form class="cx-form" id="cx-form" data-submit="cx-submit" data-kind="survey" novalidate>
          ${qs.map((q) => surveyQ(q, rec.answers[q.id])).join('')}
          <p class="cx-fine">Every question is optional. Skip any you would rather not answer.</p>
        </form>
        ${n === 1 ? C.trust() : ''}`,
      foot: F.single
        ? `<button type="button" class="act muted cx-ft-l" data-act="cx-survey-more">Continue with the rest${icon('arrow')}</button>
        <button class="btn" type="submit" form="cx-form">${icon('bookmark')}Save my answer</button>`
        : `<button type="button" class="act muted cx-ft-l" data-act="cx-save">${icon('bookmark')}Save and finish later</button>
        ${n > 1 ? '<button type="button" class="btn btn-line" data-act="cx-back">Back</button>' : ''}
        <button class="btn" type="submit" form="cx-form">${n === 6 ? 'Finish' : 'Next'}${icon('arrow')}</button>`,
    });
  }
  function collectSurvey() {
    const form = F.el && F.el.querySelector('#cx-form[data-kind="survey"]');
    if (!form) return;
    const data = RN.ui.formData(form);
    const rec = surveyRec();
    const pf = (rec.prefilled = Object.assign({}, rec.prefilled));
    const pre = F.pre || {};
    Object.keys(data).forEach((k) => {
      let v = data[k];
      if (/^s2-(paid|rate)$/.test(k)) v = v === '' ? '' : +v;
      const was = rec.answers[k];
      if (pre[k] !== undefined) { if (String(v) === pre[k]) pf[k] = true; else delete pf[k]; }
      else if (String(v == null ? '' : v) !== String(was == null ? '' : was)) delete pf[k];
      rec.answers[k] = v;
    });
  }
  /* What the viewer actually answered (prefills they never touched do not count), and in which chapters */
  const MIN_CHAPTERS = 4; // a survey counts as finished once most of the six chapters have an answer
  const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
  function given(rec) { const a = rec.answers || {}, pf = rec.prefilled || {}; return Object.keys(a).filter((k) => filled(a[k]) && !pf[k]); }
  function chaptersAnswered(rec) {
    const ch = {};
    given(rec).forEach((k) => { const q = SURVEY.find((x) => x.id === k); if (q) ch[q.ch] = true; });
    return Object.keys(ch).map(Number).sort();
  }
  const firstOpen = (rec) => { const got = chaptersAnswered(rec); return (C.chapters.find((c) => !got.includes(c.n)) || { n: 6 }).n; };
  C.surveyProgress = (rec) => ({ answers: given(rec).length, chapters: chaptersAnswered(rec), min: MIN_CHAPTERS });
  function persistDraft() {
    const rec = surveyRec();
    if (rec.status !== 'done') { rec.status = 'draft'; rec.chapter = F.single || F.chapter > 6 ? firstOpen(rec) : F.chapter; }
    rec.updatedAt = RN.now().toISOString();
    save(JSON.parse(JSON.stringify(rec)));
  }
  RN.actions['cx-back'] = () => { collectSurvey(); F.chapter = Math.max(1, F.chapter - 1); persistDraft(); surveyStep(); };
  RN.actions['cx-save'] = () => {
    collectSurvey(); persistDraft();
    const n = F.chapter;
    RN.ui.closeModal();
    RN.ui.toast(`Saved at chapter ${Math.min(n, 6)} of 6. Pick up where you left off from any "Shape the 2028 report" link.`, { ms: 5200 });
    C.refresh();
  };
  RN.actions['cx-survey-more'] = () => {
    collectSurvey();
    F.single = 0;
    const rec = surveyRec();
    F.chapter = chaptersAnswered(rec).length >= 6 ? 7 : firstOpen(rec);
    persistDraft();
    if (F.chapter > 6) return show(surveyFinish());
    return surveyStep();
  };
  RN.actions['cx-survey-goto'] = (el) => { F.single = 0; F.chapter = RN.clamp(+el.dataset.ch || 1, 1, 6); surveyStep(); };
  function submitSurveyChapter() {
    if (F.single) {
      collectSurvey(); persistDraft();
      const rec = surveyRec(), n = F.single, got = chaptersAnswered(rec).length;
      RN.ui.closeModal();
      RN.ui.toast(rec.status === 'done' ? `Saved your chapter ${n} answer.` : got ? `Saved for the 2028 report, ${got} of 6 chapters answered. Pick up the rest from any "Shape the 2028 report" link.` : 'Nothing answered yet, so nothing was added. Your place is kept.', { ms: 5200 });
      C.refresh();
      return null;
    }
    collectSurvey();
    F.chapter += 1;
    persistDraft();
    if (F.chapter > 6) return show(surveyFinish());
    return surveyStep();
  }
  function surveyFinish() {
    const rec = surveyRec();
    const email = needsEmail() ? '' : meEmail();
    const got = chaptersAnswered(rec);
    if (got.length < MIN_CHAPTERS && rec.status !== 'done') {
      const next = firstOpen(rec);
      return {
        title: 'A few more chapters to go',
        sub: `A response counts in the 2028 report once at least ${MIN_CHAPTERS} of the 6 chapters have an answer. Your answers so far are saved.`,
        body: `<div class="cx-prog" role="progressbar" aria-label="Chapters answered" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${got.length}" aria-valuetext="${got.length} of 6 chapters answered"><i style="width:${Math.round((got.length / 6) * 100)}%"></i></div>
          <ul class="cx-chaps" tabindex="-1" data-cx-focus>${C.chapters.map((c) => `<li class="${got.includes(c.n) ? 'on' : ''}">${icon(got.includes(c.n) ? 'check-circle' : 'clock')}<span>Chapter ${c.n}. ${esc(c.t)}</span>${got.includes(c.n) ? '' : `<button type="button" class="act" data-act="cx-survey-goto" data-ch="${c.n}">Answer</button>`}</li>`).join('')}</ul>`,
        foot: `<button type="button" class="act muted cx-ft-l" data-act="cx-save">${icon('bookmark')}Save and finish later</button><button type="button" class="btn" data-act="cx-survey-goto" data-ch="${next}">Pick up at chapter ${next}${icon('arrow')}</button>`,
      };
    }
    return {
      title: 'Where should we send the 2028 report?',
      sub: 'You get it a week before it publishes in October 2027, with the full breakdown for your role.',
      body: `<form class="cx-form" id="cx-form" data-submit="cx-submit" data-kind="survey-finish" novalidate>
        <div class="cx-prog" role="progressbar" aria-label="Survey progress" aria-valuemin="0" aria-valuemax="6" aria-valuenow="6" aria-valuetext="All six chapters answered"><i style="width:100%"></i></div>
        ${needsEmail() ? emailField({ value: rec.email || '', help: 'Only to send the report early and your role breakdown. We verify by domain and never show it.' }) : `<p class="cx-res-line">${icon('mail')}We'll send it to <b>${esc(email)}</b>.</p>`}
        ${C.trust()}
      </form>`,
      foot: `<button type="button" class="btn btn-line" data-act="cx-back">Back</button><button class="btn" type="submit" form="cx-form">Send my answers${icon('arrow')}</button>`,
    };
  }
  function submitSurveyFinish(form, data) {
    let email = meEmail();
    if (needsEmail()) {
      email = String(data.email || '').trim();
      if (!validEmail(email)) return errAt(form, 'email', 'Add a work email so we can send you the report early.');
    }
    const rec = surveyRec();
    if (chaptersAnswered(rec).length < MIN_CHAPTERS && rec.status !== 'done') return show(surveyFinish());
    rec.status = 'done'; rec.email = email || undefined; rec.chapter = 6; rec.createdAt = rec.createdAt || RN.now().toISOString(); rec.finishedAt = RN.now().toISOString();
    save(JSON.parse(JSON.stringify(rec)));
    if (email) RN.mail(email, 'You are in the State of Fractional GTM 2028', 'Thanks for shaping the 2028 edition. You will get the report a week before it publishes in October 2027, with the full breakdown for your role.\n\nYour answers are published only in aggregate, never individually.', 'research');
    track('survey', F && F.ctx, { side: rec.side });
    C.refresh();
    show(surveyResult(rec));
  }
  function surveyResult(rec) {
    const pub = C.published('report2028');
    return {
      title: 'You\'re in the 2028 report',
      sub: 'State of Fractional GTM 2028',
      body: `<div class="cx-res">
        <p class="cx-res-kicker">${icon('check-circle')}<span>${esc(C.describe(rec))}</span></p>
        <h3 class="h3 cx-res-h" tabindex="-1" data-cx-focus>You'll get the 2028 report a week before it publishes, plus the full breakdown for your role<span class="vm">.</span></h3>
        <p class="cx-res-line">${esc(pub.label)}. The 2028 edition publishes in October 2027. Fieldwork closes Aug 31, 2027.</p>
        ${shareLine('Know someone who should be in it?', { title: 'Shape the State of Fractional GTM 2028', route: 'report', kind: 'report2028', quote: 'The State of Fractional GTM 2028 survey is open. Six short chapters, and you get the report a week early.' }, 'Share the survey')}
      </div>`,
      foot: `<button type="button" class="act muted cx-ft-l" data-act="cx-open" data-kind="survey" data-ctx="${jsonAttr({ chapter: 1, full: true })}">Review my answers</button><button type="button" class="btn" data-act="modal-close">Done</button>`,
    };
  }

  /* ---------- Field note (operators, reuses state.answers) ---------- */
  const NOTE_MAX = 600;
  const engKey = (e) => e.id || `${e.company}|${e.start || ''}`;
  function insightForm(ctx) {
    const me = RN.myOp && RN.myOp();
    const g = ctx.guideId && RN.research && RN.research.guideFor ? RN.research.guideFor(ctx.guideId) : null;
    if (!me) {
      return {
        title: 'Field notes are written by operators',
        sub: 'Operators on Revenue Nomad answer a guide\'s question from their own engagements.',
        body: `<div class="cx-res"><p class="cx-res-line">Approved notes carry the operator's byline and a link to their profile.</p></div>`,
        foot: '<button type="button" class="btn btn-line" data-act="login">Log in</button><a class="btn" href="#join" data-act="go" data-to="join">Apply to join</a>',
      };
    }
    if (!g) return { title: 'Add a field note', body: '<p class="cx-res-line">Open a guide to add a field note to it.</p>', foot: '<button type="button" class="btn" data-act="modal-close">Close</button>' };
    const have = C.done('insight', { guideId: g.id });
    if (have) return insightResult(have, g);
    const engs = me.engagements || [];
    return {
      title: 'Add a field note',
      sub: esc(g.title),
      body: `<form class="cx-form" id="cx-form" data-submit="cx-submit" data-kind="insight" data-g="${esc(g.id)}" novalidate>
        <div class="field" data-cx-f="text"><label for="cx-note">Your answer, from your own work</label>
          <textarea class="textarea" id="cx-note" name="text" maxlength="${NOTE_MAX}" rows="6" data-input="cx-note-count" placeholder="What you did, at what stage, and what changed."></textarea>
          <p class="help"><span data-cx-count>0</span> of ${NOTE_MAX} characters. The team reviews every note before it appears.</p></div>
        ${engs.length ? `<div class="field"><label for="cx-eng">Engagement as proof</label>
          <select class="select" id="cx-eng" name="engagement">${engs.map((e) => `<option value="${esc(engKey(e))}">${esc(e.company)}${e.role ? ' · ' + esc(e.role) : ''}${e.clientVerified ? ' (company-verified)' : ''}</option>`).join('')}</select></div>` : ''}
        <p class="cx-trust">${icon('seal')}<span>Approved notes carry your byline and link to your profile. They never change your Reputation Index.</span></p>
      </form>`,
      foot: `<button class="btn" type="submit" form="cx-form">Send for review${icon('arrow')}</button>`,
    };
  }
  RN.inputs['cx-note-count'] = (el) => { const c = el.closest('.field').querySelector('[data-cx-count]'); if (c) c.textContent = el.value.length; };
  function submitInsight(form, data) {
    const me = RN.myOp && RN.myOp();
    const g = RN.research && RN.research.guideFor ? RN.research.guideFor(form.dataset.g) : null;
    if (!me || !g) return;
    const text = String(data.text || '').trim();
    if (text.length < 40) return errAt(form, 'text', 'Write at least a couple of sentences, from your own work.');
    const eng = (me.engagements || []).find((e) => engKey(e) === data.engagement);
    // Same record research.js writes, so the guide, Admin approvals and Studio read one list
    const rec = { id: RN.uid('ans'), guideId: g.id, opId: me.id, text: text.slice(0, NOTE_MAX), engagementId: eng ? engKey(eng) : null, engagement: eng ? { company: eng.company, role: eng.role || '' } : null, status: 'in_review', createdAt: RN.now().toISOString() };
    RN.store.update((s) => { s.answers = (s.answers || []).filter((a) => !(a.guideId === g.id && a.opId === me.id)).concat(rec); }, 'answers');
    RN.track('guide_answer', { opId: me.id, source: (F && F.ctx && F.ctx.source) || 'contribute', meta: { guideId: g.id } });
    RN.mail('team@revenuenomad.com', `Guide answer to review: ${g.title}`, `${me.name} answered "${g.title}".\n\n${rec.text}`, 'admin');
    C.refresh();
    show(insightResult(rec, g));
  }
  // A guide's short answer is a function on every guide; share its plain text
  function answerText(g) {
    let t = typeof g.answer === 'function' ? [].concat(g.answer()).join(' ') : g.answer || '';
    t = String(t).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return t.length > 280 ? t.slice(0, 277).replace(/\s+\S*$/, '') + '…' : t;
  }
  function insightResult(a, g) {
    const live = a.status === 'approved';
    return {
      title: live ? 'Your field note is live' : 'Your field note is in review',
      sub: esc(g.title),
      body: `<div class="cx-res">
        <p class="cx-res-kicker">${icon(live ? 'check-circle' : 'clock')}<span>${live ? 'Live on the guide with your byline' : 'With the Revenue Nomad team'}</span></p>
        <blockquote class="cx-note-q" tabindex="-1" data-cx-focus><p>${esc(a.text)}</p></blockquote>
        <p class="cx-res-line">${live ? 'It links to your profile. It earns placement on the guide, never Reputation Index points.' : 'Once approved it appears on the guide with your byline and a link to your profile. It never changes your Reputation Index.'}</p>
        ${shareLine('Share the guide with your own take while it is in review.', { title: g.title, route: 'guide.' + g.id, kind: 'guide', quote: answerText(g), mode: 'take' }, 'Share the guide')}
      </div>`,
      foot: '<button type="button" class="btn" data-act="modal-close">Done</button>',
    };
  }

  /* ---------- One submit for every flow ---------- */
  RN.submits['cx-submit'] = (form, data) => {
    const k = form.dataset.kind;
    if (k === 'rate' || k === 'paid') return submitRate(form, data);
    if (k === 'pulse') return submitPulse(form, data);
    if (k === 'survey') return submitSurveyChapter();
    if (k === 'survey-finish') return submitSurveyFinish(form, data);
    if (k === 'insight') return submitInsight(form, data);
    return null;
  };
  // Reopen the result for a stored contribution (CTA thanks state, Studio history)
  C.result = function (id) {
    const c = all().find((x) => x.id === id);
    if (!c) return null;
    F = { kind: c.kind, ctx: {}, el: null, data: {}, side: c.side, rec: c };
    if (c.kind === 'rate' || c.kind === 'paid') return show(rateResult(c));
    if (c.kind === 'pulse') return pulseComplete(c) ? show(pulseResult(c)) : C.open('pulse');
    if (c.kind === 'survey') return c.status === 'done' ? show(surveyResult(c)) : C.open('survey');
    return null;
  };
  RN.actions['cx-result'] = (el) => C.result(el.dataset.id);

  /* ---------- Inline invitation (CTA) ---------- */
  // The chapter's question in the viewer's words (its first question for their side), for the report's chapter lines
  function chapterAsk(n) {
    const side = C.side() || 'company';
    const ch = C.chapters[n - 1] || {};
    const q = C.surveyQuestions(side).find((x) => x.ch === n && /\?$/.test(x.label));
    return q ? q.label.replace(/ Pick up to \d\.$/, '') : ch.ask || `${ch.t}.`;
  }
  function ctaCopy(k, ctx) {
    const P = C.period();
    const ds = C.datasets;
    const pub = C.published('report2028');
    const chap = chapterOf(ctx.chapter);
    const C2 = {
      rate: { icon: 'chart', tone: 'forest', eb: `Rate Index · ${ds.rateIndex.cadence}`, t: `Add your rate to the ${P.short} Rate Index`, b: `${ds.rateIndex.time}, published only in aggregate. See where you sit right away.`, meta: [`${P.label} window closes ${P.closes}`, ctx.cat ? C.published('rateIndex', { cat: ctx.cat }).label : ''], btn: 'Add your rate', line: `Charge for one of these seats? Add your rate to the ${P.short} Rate Index.`, lineBtn: 'Add your rate' },
      paid: { icon: 'chart', tone: 'forest', eb: `Rate Index · ${ds.rateIndex.cadence}`, t: `Add what you paid to the ${P.short} Rate Index`, b: `${ds.rateIndex.time}, published only in aggregate. See how it compares right away.`, meta: [`${P.label} window closes ${P.closes}`, ctx.cat ? C.published('rateIndex', { cat: ctx.cat }).label : ''], btn: 'Add what you paid', line: `Paid for one of these seats? Add it to the ${P.short} Rate Index.`, lineBtn: 'Add what you paid' },
      rates: { icon: 'chart', tone: 'forest', eb: `Rate Index · ${ds.rateIndex.cadence}`, t: `Add to the ${P.short} Rate Index`, b: `Operators add a rate they charge, companies add what they paid. ${ds.rateIndex.time}, published only in aggregate, with your result right away.`, meta: [`${P.label} window closes ${P.closes}`, ctx.cat ? C.published('rateIndex', { cat: ctx.cat }).label : ''], btn: 'Add what you paid', btn2: 'Add your rate', line: `Paid for one of these seats, or charge for one? Add it to the ${P.short} Rate Index.`, lineBtn: 'Add yours' },
      pulse: { icon: 'wave', tone: 'info', eb: `Quarterly Pulse · ${P.label}`, t: `Answer the ${P.short} Pulse`, b: `Three questions, about 60 seconds. Results publish in the ${P.publishes} Pulse.`, meta: ['Feeds the Demand Index', `Open until ${P.closes}`], btn: 'Answer the Pulse', line: `Three questions on demand and hiring plans, about 60 seconds. Answer the ${P.short} Pulse.`, lineBtn: 'Answer the Pulse' },
      survey: { icon: 'book', tone: 'enable', eb: 'State of Fractional GTM 2028 · Annual', t: chap ? `Add your answer to chapter ${chap}` : 'Shape the 2028 State of Fractional GTM', b: chap ? `${C.chapters[chap - 1].t}. One to three questions for the 2028 edition, published only in aggregate.` : `Six short chapters, ${ds.report2028.time.toLowerCase()}. Save and finish later. Get the report a week before it publishes.`, meta: [pub.label, `Open until ${ds.report2028.window().closesLabel}`], btn: chap ? 'Add your answer' : 'Start the survey', line: chap ? `For the 2028 edition, ${chapterAsk(chap).replace(/^./, (c) => c.toLowerCase())}` : 'Add your data to the next State of Fractional GTM. Six short chapters, and you get the report a week early.', lineBtn: chap ? 'Add your answer' : 'Take the survey' },
      insight: { icon: 'edit', tone: 'sales', eb: 'Field notes', t: 'Add a field note to this guide', b: 'Answer from your own engagements. Approved notes carry your byline and never change your Reputation Index.', meta: [], btn: 'Add a field note', line: 'Done this work? Add a field note to this guide with your byline.', lineBtn: 'Add a field note' },
    };
    return C2[k];
  }
  function doneCopy(k, rec, ctx) {
    const P = C.period();
    if (k === 'rate' || k === 'paid') return { t: `Thanks, you're in the ${P.label} Rate Index.`, b: `It publishes in the first two weeks of ${P.publishes}.`, acts: [{ act: 'cx-result', id: rec.id, l: 'See your result' }, { act: 'cx-open', kind: k, ctx: Object.assign({}, ctx, { source: 'again' }), l: k === 'rate' ? 'Add another rate' : 'Add another seat' }] };
    if (k === 'pulse') return { t: `Thanks, your ${P.short} Pulse answers are in.`, b: `Results publish in the ${P.publishes} Pulse.`, acts: [{ act: 'cx-result', id: rec.id, l: 'See how others answered' }] };
    if (k === 'survey') return { t: 'Thanks, you\'re in the 2028 report.', b: 'We\'ll send it a week before it publishes in October 2027.', acts: [{ act: 'cx-result', id: rec.id, l: 'See your answers' }] };
    if (k === 'insight') return { t: rec.status === 'approved' ? 'Your field note is live on this guide.' : 'Your field note is in review.', b: rec.status === 'approved' ? 'It carries your byline and links to your profile.' : 'It appears with your byline once the team approves it.', acts: [] };
    return null;
  }
  const actBtn = (a, cls) => (a.act === 'cx-result'
    ? `<button type="button" class="${cls}" data-act="cx-result" data-id="${esc(a.id)}">${esc(a.l)}</button>`
    : `<button type="button" class="${cls}" data-act="cx-open" data-kind="${esc(a.kind)}" data-ctx="${jsonAttr(a.ctx)}">${esc(a.l)}</button>`);

  C.cta = function (kind, o) {
    o = o || {};
    const variant = ['band', 'card', 'line'].includes(o.variant) ? o.variant : 'card';
    const ctx = o.ctx || {};
    let k = kind;
    if (k === 'rates') { const s = C.side(); k = s === 'operator' ? 'rate' : s === 'company' ? 'paid' : 'rates'; }
    if (k === 'insight' && persona() !== 'operator') return '';
    const copy = ctaCopy(k, ctx);
    if (!copy) return '';
    const wrapAttrs = `data-cx-cta="${esc(kind)}" data-variant="${variant}" data-ctx="${jsonAttr(ctx)}"${o.h ? ` data-h="${esc(o.h)}"` : ''}`;
    const rec = k === 'rates' ? null : C.done(k, ctx);
    const draft = k === 'survey' && !rec ? C.draft() : null;
    const H = /^h[2-6]$/.test(o.h || '') ? o.h : 'h3';
    const tile = (sz) => RN.ui.icoTile(rec ? 'check' : copy.icon, { size: sz, tone: copy.tone, cls: 'cx-ico' });
    const go = (label, kk, cls) => `<button type="button" class="${cls}" data-act="cx-open" data-kind="${esc(kk)}" data-ctx="${jsonAttr(ctx)}">${esc(label)}${cls.includes('act') ? icon('arrow') : ''}</button>`;

    if (rec) {
      const d = doneCopy(k, rec, ctx);
      const acts = d.acts.map((a, i) => actBtn(a, variant === 'line' || i > 0 ? 'act' : 'btn btn-line btn-sm')).join('');
      if (variant === 'line') return `<p class="cx-cta cx-line is-done" ${wrapAttrs}>${icon('check-circle')}<span>${esc(d.t)} ${esc(d.b)}${d.acts[0] ? ' ' + actBtn(d.acts[0], 'act') : ''}</span></p>`;
      if (variant === 'band') return `<aside class="cx-cta cx-band is-done" ${wrapAttrs} aria-label="${esc(copy.eb)}">${tile('sm')}<div class="cx-txt"><b class="cx-t">${esc(d.t)}</b><span class="cx-b">${esc(d.b)}</span></div>${acts ? `<div class="cx-acts">${acts}</div>` : ''}</aside>`;
      return `<article class="cx-cta cx-card is-done" ${wrapAttrs}><div class="cx-card-hd">${tile('md')}<span class="cx-eb">${esc(copy.eb)}</span></div><${H} class="h4 cx-t">${esc(d.t)}</${H}><p class="cx-b">${esc(d.b)}</p>${acts ? `<div class="cx-acts">${acts}</div>` : ''}</article>`;
    }
    let btn = copy.btn, lineBtn = copy.lineBtn, t = copy.t;
    // A chapter line keeps its own chapter's copy (and opens that chapter) even while a draft exists
    const useDraft = draft && !chapterOf(ctx.chapter);
    if (useDraft) { btn = `Pick up at chapter ${draft.chapter || 1}`; lineBtn = btn; t = 'Finish shaping the 2028 report'; }
    const b = useDraft ? `Saved at chapter ${draft.chapter || 1} of 6. ${copy.b.split('. ').slice(-1)[0]}` : copy.b;
    const meta = copy.meta.filter(Boolean);
    const primaryKind = k === 'rates' ? 'paid' : k;
    if (variant === 'line') {
      return `<p class="cx-cta cx-line" ${wrapAttrs}>${icon(copy.icon)}<span>${esc(useDraft ? `${t}. Saved at chapter ${draft.chapter || 1} of 6.` : copy.line)} ${go(lineBtn, k === 'rates' ? 'rates' : k, 'act')}</span></p>`;
    }
    const buttons = k === 'rates'
      ? `${go(copy.btn2, 'rate', 'btn btn-line btn-sm')}${go(copy.btn, 'paid', 'btn btn-sm')}`
      : go(btn, primaryKind, 'btn btn-sm');
    if (variant === 'band') {
      return `<aside class="cx-cta cx-band" ${wrapAttrs} aria-label="${esc(copy.eb)}">${tile('sm')}<div class="cx-txt"><b class="cx-t">${esc(t)}</b><span class="cx-b">${esc(b)}</span></div><div class="cx-acts">${buttons}</div></aside>`;
    }
    return `<article class="cx-cta cx-card" ${wrapAttrs}>
      <div class="cx-card-hd">${tile('md')}<span class="cx-eb">${esc(copy.eb)}</span></div>
      <${H} class="h4 cx-t">${esc(t)}</${H}>
      <p class="cx-b">${esc(b)}</p>
      ${meta.length ? `<ul class="cx-meta">${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      <div class="cx-acts">${buttons}</div>
    </article>`;
  };

  /* Re-render every CTA and one-tap question in place after a contribution (no page re-render, no scroll jump) */
  /* Page-owned pieces that change after a contribution: <div data-cx-r="name" data-ctx="{...}"> re-renders with
     C.renderers[name](ctx) on refresh (e.g. the Rate Index's operator band). */
  C.renderers = {};
  // Keep focus and each modal's return target on the re-rendered element
  function swapKeepFocus(el, apply) {
    const hits = RN.ui.openersIn ? RN.ui.openersIn(el) : [];
    const had = el.contains(document.activeElement) ? document.activeElement : null;
    const hadAct = had && had.dataset ? had.dataset.act : '';
    const next = apply();
    if (!next) return;
    if (hits.length && RN.ui.retarget) RN.ui.retarget(hits, next);
    if (had) { const f = (hadAct && next.querySelector(`[data-act="${hadAct}"]`)) || next.querySelector('button, a[href]'); if (f) f.focus({ preventScroll: true }); }
  }
  C.refresh = function (root, skip) {
    RN.$$('[data-cx-cta]', root || document).forEach((el) => {
      if (el.closest('.modal')) return;
      const html = C.cta(el.dataset.cxCta, { variant: el.dataset.variant, ctx: parse(el.dataset.ctx), h: el.dataset.h });
      if (!html) { el.remove(); return; }
      swapKeepFocus(el, () => { const t = document.createElement('div'); t.innerHTML = html.trim(); const n = t.firstElementChild; el.replaceWith(n); return n; });
    });
    RN.$$('[data-cx-r]', root || document).forEach((el) => {
      const fn = C.renderers[el.dataset.cxR];
      if (fn && !el.closest('.modal')) swapKeepFocus(el, () => { el.innerHTML = fn(parse(el.dataset.ctx)); return el; });
    });
    RN.$$('[data-cx-pulse]', root || document).forEach((el) => { if (el !== skip && !el.contains(document.activeElement)) repaintPulse(el); });
  };

  /* =====================================================================
     RN.share
     ===================================================================== */
  S.url = function (route) {
    let r = String(route == null ? (location.hash || '').slice(1) : route).replace(/^#/, '').trim();
    if (/^https?:\/\//.test(r)) return r;
    r = RN.canonical ? RN.canonical(r) : r;
    if (!r || r === 'home') return SITE + '/';
    // Public paths use hyphens (rates.revenue_operations -> /rates/revenue-operations)
    return SITE + '/' + r.split('.').filter(Boolean).map((x) => encodeURIComponent(x.replace(/_/g, '-'))).join('/');
  };
  const links = (o) => {
    const u = encodeURIComponent(o.url);
    const text = o.quote ? `${o.title}. ${o.quote}` : o.title;
    return {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text.length > 220 ? text.slice(0, 217) + '…' : text)}&url=${u}`,
      email: `mailto:?subject=${encodeURIComponent(o.title)}&body=${encodeURIComponent((o.quote ? o.quote + '\n\n' : '') + o.url)}`,
    };
  };
  function norm(o) {
    o = Object.assign({}, o || {});
    o.url = o.url || S.url(o.route);
    o.title = o.title || document.title || 'Revenue Nomad';
    o.quote = String(o.quote || '').trim();
    o.kind = o.kind || 'page';
    return o;
  }
  const trackShare = (o, channel) => RN.track('research_share', { source: o.kind || 'page', meta: { kind: channel, url: o.url } });

  /* Clipboard: writeText inside the click handler; refused or missing, select the visible field (or a hidden one) */
  S.copy = function (text, field, okMsg) {
    const ok = () => RN.ui.toast(esc(okMsg || 'Link copied'));
    const fallback = () => {
      let copied = false;
      if (field) {
        try { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); } catch (e) { /* ignore */ }
        try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
        if (copied) ok(); else RN.ui.toast('Selected. Press Ctrl+C, or ⌘C on a Mac, to copy it.', { icon: 'info', ms: 5200 });
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
      ta.remove();
      if (copied) ok(); else RN.ui.toast(`Copy this: ${esc(text.length > 120 ? text.slice(0, 117) + '…' : text)}`, { icon: 'info', ms: 6400 });
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
      else fallback();
    } catch (e) { fallback(); }
  };

  let SH = null; // the open share sheet's data
  function previewCard(o, take) {
    const me = take && RN.myOp && RN.myOp();
    const host = o.url.replace(/^https?:\/\//, '').split('/')[0];
    const tier = me ? (RN.fields.risTierFor && RN.fields.risTierFor(me.ris && me.ris.score)) : null;
    const tierMark = me && tier && RN.ui.tierShown(tier.v) ? RN.ui.tierPill(tier.v, me.ris.score) : '';
    return `<div class="shr-card">
      ${take && me ? `<div class="shr-card-by">${RN.ui.avatar(me, 'ava-sm', { decorative: true })}<span class="shr-card-who"><b>${esc(me.name)}</b><span class="tiny muted">Fractional ${esc(me.role)}</span></span>${tierMark}</div><p class="shr-card-take" data-shr-preview></p>` : ''}
      <div class="shr-card-link">
        <span class="shr-card-host">${esc(host)}</span>
        <b class="shr-card-t">${esc(o.title)}</b>
        ${o.quote && !take ? `<span class="shr-card-q">${esc(o.quote)}</span>` : ''}
      </div>
    </div>`;
  }
  S.open = function (o) {
    o = norm(o);
    SH = o;
    const op = persona() === 'operator' && RN.myOp && RN.myOp();
    const take = op && o.mode === 'take';
    const L = links(o);
    const linkPane = `<div class="shr-pane" data-shr-pane="link" ${take ? 'hidden' : ''}>
        ${previewCard(o, false)}
        <div class="shr-url"><label class="sr-only" for="shr-url">Link to share</label><input class="input" id="shr-url" readonly value="${esc(o.url)}"><button type="button" class="btn btn-sm" data-act="shr-copy">${icon('copy')}Copy link</button></div>
        <div class="shr-to" role="group" aria-label="Share to">
          <a class="btn btn-line btn-sm" href="${esc(L.linkedin)}" target="_blank" rel="noopener" data-shr-ch="linkedin">LinkedIn${icon('external')}</a>
          <a class="btn btn-line btn-sm" href="${esc(L.x)}" target="_blank" rel="noopener" data-shr-ch="x">X${icon('external')}</a>
          <a class="btn btn-line btn-sm" href="${esc(L.email)}" data-shr-ch="email">${icon('mail')}Email</a>
        </div>
        <p class="tiny muted">LinkedIn, X and Email open in a new window. Nothing is posted until you post it.</p>
      </div>`;
    const startText = o.quote ? `“${o.quote.replace(/^[“"]|[”"]$/g, '')}”\n\n` : '';
    const takePane = op ? `<div class="shr-pane" data-shr-pane="take" ${take ? '' : 'hidden'}>
        <div class="field"><label for="shr-take">Your post</label>
          <textarea class="textarea shr-take" id="shr-take" rows="5" maxlength="1200" data-input="shr-take" placeholder="Add one sentence with your take.">${esc(startText)}</textarea>
          <p class="help">${o.quote ? 'The quote is filled in. Add one sentence with your take below it.' : 'Add one sentence with your take.'} The link goes at the end.</p></div>
        <span class="label">Preview</span>
        ${previewCard(o, true)}
        <div class="shr-to">
          <button type="button" class="btn btn-sm" data-act="shr-copy-post">${icon('copy')}Copy post</button>
          <a class="btn btn-line btn-sm" href="${esc(L.linkedin)}" target="_blank" rel="noopener" data-shr-ch="linkedin-take">Copy and open LinkedIn${icon('external')}</a>
        </div>
        <p class="tiny muted">LinkedIn takes the link only, so the post is copied for you to paste.</p>
      </div>` : '';
    const el = RN.ui.modal({
      width: 520,
      title: take ? 'Share with your take' : 'Share',
      sub: esc(o.title),
      body: `<div class="shr" data-shr>
        ${op ? `<div class="seg shr-mode" role="group" aria-label="How to share"><button type="button" data-act="shr-mode" data-v="link" aria-pressed="${!take}">Share link</button><button type="button" data-act="shr-mode" data-v="take" aria-pressed="${!!take}">Share with your take</button></div>` : ''}
        ${linkPane}${takePane}
      </div>`,
      onClose: () => { SH = null; },
    });
    el.querySelector('.modal').classList.add('shr-modal');
    // Links: count the share; "Copy and open LinkedIn" copies the post first (same click, so the clipboard allows it)
    RN.$$('a[data-shr-ch]', el).forEach((a) => a.addEventListener('click', () => {
      const ch = a.dataset.shrCh;
      if (ch === 'linkedin-take') { S.copy(postText(), el.querySelector('#shr-take'), 'Post copied. Paste it into LinkedIn.'); trackShare(o, 'take_linkedin'); } else trackShare(o, ch);
    }));
    syncPreview(el);
    if (take) setTimeout(() => focusTake(el), 40);
    trackShare(o, 'open');
    return el;
  };
  function postText() {
    const el = RN.ui.modalEl();
    const ta = el && el.querySelector('#shr-take');
    const body = ta ? ta.value.trim() : '';
    const url = SH ? SH.url : '';
    return body ? `${body}\n\n${url}` : url;
  }
  function syncPreview(el) {
    const ta = el.querySelector('#shr-take');
    const p = el.querySelector('[data-shr-preview]');
    if (!ta || !p) return;
    const t = ta.value.trim();
    p.innerHTML = t ? esc(t).replace(/\n/g, '<br>') : '<span class="muted">Your take appears here.</span>';
  }
  function focusTake(el) { const ta = el.querySelector('#shr-take'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  RN.inputs['shr-take'] = (el) => syncPreview(el.closest('.modal'));
  RN.actions['shr-mode'] = (el) => {
    const box = el.closest('.modal');
    const v = el.dataset.v;
    RN.$$('[data-act="shr-mode"]', box).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    RN.$$('[data-shr-pane]', box).forEach((p) => { p.hidden = p.dataset.shrPane !== v; });
    box.querySelector('.modal-hd h2').textContent = v === 'take' ? 'Share with your take' : 'Share';
    if (v === 'take') focusTake(box);
  };
  RN.actions['shr-copy'] = (el) => {
    const box = el.closest('.modal');
    const f = box && box.querySelector('#shr-url');
    const url = el.dataset.url || (f ? f.value : SH ? SH.url : S.url());
    S.copy(url, el.dataset.url ? null : f, 'Link copied');
    trackShare(SH || { kind: el.dataset.kind || 'page', url }, 'copy');
  };
  RN.actions['shr-copy-post'] = (el) => {
    const box = el.closest('.modal');
    S.copy(postText(), box.querySelector('#shr-take'), 'Post copied');
    trackShare(SH || {}, 'take_copy');
  };
  RN.actions['shr-open'] = (el) => S.open(parse(el.dataset.share));

  /* A button that opens the share sheet */
  S.button = function (o, label, cls) {
    return `<button type="button" class="${esc(cls || 'btn btn-line btn-sm')}" data-act="shr-open" data-share="${jsonAttr(o)}">${icon('share')}${esc(label || 'Share')}</button>`;
  };
  /* Compact share row for a closing block: Copy link, LinkedIn, X, and for operators Share with your take.
     o: {title, route|url, quote, kind, label}. Copy works in place; the sheet opens only for "your take". */
  S.row = function (o) {
    o = norm(o);
    const L = links(o);
    const op = persona() === 'operator';
    return `<div class="shr-row" role="group" aria-label="${esc(o.label || 'Share this')}">
      <span class="shr-row-l">${icon('share')}${esc(o.label || 'Share this')}</span>
      <button type="button" class="chip chip-sm" data-act="shr-copy" data-url="${esc(o.url)}" data-kind="${esc(o.kind)}">${icon('link')}Copy link</button>
      <a class="chip chip-sm" href="${esc(L.linkedin)}" target="_blank" rel="noopener" data-act-share="linkedin">LinkedIn</a>
      <a class="chip chip-sm" href="${esc(L.x)}" target="_blank" rel="noopener" data-act-share="x">X</a>
      ${op ? `<button type="button" class="chip chip-sm shr-row-take" data-act="shr-open" data-share="${jsonAttr(Object.assign({}, o, { mode: 'take' }))}">${icon('edit')}Share with your take</button>` : ''}
    </div>`;
  };
  // Count clicks on the row's network links (plain links, no data-act, so they open normally)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-act-share]');
    if (a) RN.track('research_share', { source: 'row', meta: { kind: a.dataset.actShare } });
  });

  /* Pull quote or key number with click-to-share.
     ctx: {v: '$240' (a key number shown large), source: 'State of Fractional GTM 2027', route, title, kind,
           inline: true (a span for running text)} */
  S.quote = function (text, ctx) {
    ctx = ctx || {};
    const shareText = ctx.v ? `${ctx.v} ${String(text).replace(/^./, (c) => c.toLowerCase())}` : String(text);
    const o = { title: ctx.title || (ctx.source || 'Revenue Nomad Research'), route: ctx.route, url: ctx.url, quote: shareText, kind: ctx.kind || 'quote' };
    const btn = `<button type="button" class="shr-q-btn" data-act="shr-open" data-share="${jsonAttr(o)}" aria-label="Share: ${esc(shareText.slice(0, 140))}">${icon('share')}<span>Share</span></button>`;
    if (ctx.inline) return `<span class="shr-qi">${esc(text)}${btn}</span>`;
    return `<figure class="shr-q${ctx.v ? ' shr-q-num' : ''}">
      ${ctx.v ? `<span class="shr-q-v">${esc(ctx.v)}</span>` : ''}
      <blockquote class="shr-q-t"><p>${esc(text)}</p></blockquote>
      <figcaption class="shr-q-ft"><span class="shr-q-src">${esc(ctx.source || 'Revenue Nomad Research')}</span>${btn}</figcaption>
    </figure>`;
  };
})();
