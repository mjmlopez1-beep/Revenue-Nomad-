/* Operator Studio, part A: Overview, Who viewed you, Positioning, Search and AI visibility.
   The "value even when no intro happens" layer: what clients searched, who looked (by firmographic
   segment only), where the operator stands against the market, and how findable the profile is on
   Google and in AI answers.

   Data: RN.model.analytics (illustrative baseline + this session's events), RN.model.positioning,
   RN.model.market, RN.data.market, RN.store. Charts are drawn after mount at their real pixel width
   (see slot()), so chart text keeps its size from 390px phones to wide desktops.
   Everything is namespaced "sa-" (actions, CSS classes). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon, fmt = RN.fmt;
  const DAY = 864e5;
  const SA = (RN.studioA = {});

  /* ---------- Small helpers ---------- */
  const seen = () => RN.store.state.seen || {};
  const days = () => { const d = +seen().studioDays; return [7, 30, 90].includes(d) ? d : 30; };
  const setSeen = (k, v) => RN.store.update((s) => { s.seen = s.seen || {}; s.seen[k] = v; }, 'seen');
  const t = (d) => new Date(d).getTime();
  const nowMs = () => RN.now().getTime();
  const inWin = (d, lo, hi) => { const x = nowMs() - t(d); return x >= lo * DAY && x < hi * DAY; };
  const lab = (key, v) => RN.w.label(key, v);
  const ind = (v) => lab('industries', v);
  const an = (word) => (/^[aeiou]/i.test(String(word || '')) ? 'an' : 'a');
  const pct = (n, dp) => (isFinite(n) ? (n * 100).toFixed(dp || 0) + '%' : 'N/A');
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const plural = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many || one + 's'}`;
  const median = (arr) => { const s = arr.filter((x) => isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const periodLabel = (d) => (d === 7 ? 'this week' : `the last ${d} days`);
  const prevLabel = (d) => (d === 7 ? 'vs last week' : `vs previous ${d} days`);
  const quote = (s) => `“${esc(s)}”`;
  const tabHref = (k) => '#studio' + (k === 'overview' ? '' : '.' + k);

  function firmo(b) {
    b = b || {};
    const i = b.industry ? ind(b.industry) : '';
    const rev = b.revenueRange ? lab('revenueRange', b.revenueRange) : '';
    const emp = b.employeeRange ? lab('employeeRange', b.employeeRange) : '';
    return { ind: i, rev, emp, who: i ? `${an(i)} ${i} company` : 'a client company', detail: [rev && rev + ' revenue', emp && emp + ' employees'].filter(Boolean).join(', ') };
  }

  /* ---------- Chart slots: drawn after mount at the rendered width ---------- */
  let slots = {}, slotSeq = 0;
  function resetSlots() { slots = {}; slotSeq = 0; }
  function slot(fn, cls, minH) {
    const id = 'sa' + (++slotSeq);
    slots[id] = fn;
    return `<div class="sa-slot ${cls || ''}" data-sa-chart="${id}"${minH ? ` style="min-height:${minH}px"` : ''}></div>`;
  }
  function draw(root) {
    RN.$$('[data-sa-chart]', root || document).forEach((el) => {
      const fn = slots[el.dataset.saChart];
      if (!fn) return;
      const w = Math.floor(el.clientWidth);
      if (!w || el._w === w) return;
      el._w = w;
      try { el.innerHTML = fn(w); } catch (e) { console.error(e); }
    });
  }
  SA.draw = draw;
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const r = document.querySelector('[data-studio] .sa'); if (r) draw(r); }, 120); });

  /* ---------- Analytics (cached per period and store state) ---------- */
  let cache = {};
  function stamp() {
    const s = RN.store.state;
    return [s.events.length, s.events[0] && s.events[0].id, s.intros.length, s.projects.length, s.clockOffsetDays, s.proofLinks.reduce((a, p) => a + p.views.length, 0), s.reviews.length, JSON.stringify(s.edits || {}).length].join('|');
  }
  function memo(key, fn) {
    const k = key + '|' + stamp();
    if (!(k in cache)) { if (Object.keys(cache).length > 40) cache = {}; cache[k] = fn(); }
    return cache[k];
  }
  const A = (op, d) => memo('an|' + op.id + '|' + d, () => RN.model.analytics(op.id, { days: d }));

  /* Live events that are about this operator, from clients or visitors (never self, staff or other operators) */
  function liveEvents(op, maxDays) {
    return RN.store.state.events.filter((e) => e.opId === op.id && (e.persona === 'buyer' || e.persona === 'visitor') && nowMs() - t(e.ts) < (maxDays || 90) * DAY);
  }

  /* Project match appearances: the client's project ranked you in its top matches, or invited you (L42 "shortlist appearances") */
  function matchApps(op, lo, hi) {
    return RN.store.state.projects.filter((p) => {
      const when = p.postedAt || p.createdAt;
      if (!when || !['posted', 'in_progress', 'staffed'].includes(p.status) || !inWin(when, lo, hi)) return false;
      if ((p.invited || []).includes(op.id)) return true;
      try { return RN.model.rank(p.fields || {}, { limit: 12 }).some((r) => r.op.id === op.id); } catch (e) { return false; }
    }).length;
  }

  /* The four headline numbers, with previous period and a bucketed series for sparklines */
  function metrics(op, d) {
    return memo('m|' + op.id + '|' + d, () => {
      const a = A(op, d);
      const st = RN.store.state;
      const introsIn = (lo, hi) => st.intros.filter((i) => i.opId === op.id && inWin(i.createdAt, lo, hi)).length;
      const base = op.isMatt ? Math.round((2 * d) / 30) : Math.round(a.totals.views * 0.015);
      const cur = {
        imp: a.totals.impressions, views: a.totals.views,
        sl: a.totals.shortlists + matchApps(op, 0, d),
        intros: introsIn(0, d) + base,
      };
      const prev = { imp: a.prev.impressions, views: a.prev.views, sl: a.prev.shortlists + matchApps(op, d, 2 * d), intros: introsIn(d, 2 * d) + base };
      const bucket = d <= 7 ? 1 : d <= 30 ? 3 : 7;
      const group = (arr) => { const out = []; for (let end = arr.length; end > 0; end -= bucket) out.unshift(arr.slice(Math.max(0, end - bucket), end).reduce((x, y) => x + y, 0)); return out; };
      const imp = group(a.series.impressions), views = group(a.series.views);
      const vt = views.reduce((x, y) => x + y, 0) || 1;
      const shape = (total) => views.map((v) => Math.round(((v / vt) * total) * 10) / 10);
      return { a, cur, prev, series: { imp, views, sl: shape(cur.sl), intros: shape(cur.intros) } };
    });
  }
  SA.metrics = metrics;

  /* ---------- Reputation Index breakdown (the five published factors) ----------
     Mirrors the factor model on the Credibility tab (studio-b.js factorRows) so both tabs show the same
     progress and points available. Candidate for promotion to RN.model (see hand-off notes). */
  function monthsSince(ym) {
    if (!ym) return null;
    const [y, mo] = String(ym).split('-').map(Number);
    const n = RN.now();
    return Math.max(0, (n.getFullYear() * 12 + n.getMonth()) - (y * 12 + ((mo || 1) - 1)));
  }
  function risBreakdown(op) {
    const G = RN.model.risGain;
    const tags = op.tags || [];
    const verified = tags.filter((x) => x.tier !== 'claimed').length;
    const claimed = tags.length - verified;
    const nRev = (op.reviews || []).length;
    const avg = op.core && op.core.overall ? op.core.overall : nRev ? op.reviews.reduce((s, r) => s + (r.overall || r.coreAvg || 0), 0) / nRev : 0;
    const lastEnd = (op.engagements || []).reduce((m, e) => { if (!e.end) return 0; const k = monthsSince(e.end); return m == null ? k : Math.min(m, k); }, null);
    const val = {
      volume: { p: Math.min(1, nRev / 5), txt: `${plural(nRev, 'client review')}`, pts: Math.max(0, 5 - nRev) * G('review'), action: { l: 'Request a review', to: 'studio.credibility' } },
      verification: { p: tags.length ? verified / tags.length : 0, txt: `${verified} of ${tags.length} fit tags verified`, pts: Math.min(8, claimed) * G('verifiedTag'), action: { l: 'Ask a client to verify tags', to: 'studio.credibility' } },
      ratings: { p: avg / 5, txt: nRev ? `${avg.toFixed(1)} average across ${plural(nRev, 'review')}` : 'No ratings yet', pts: nRev && avg >= 4.5 ? 0 : 2, action: { l: 'Request a review', to: 'studio.credibility' } },
      complete: { p: (op.completeness || 0) / 100, txt: `Profile ${op.completeness}% complete`, pts: op.completeness < 100 ? G('complete') : 0, action: { l: 'Finish your profile', to: 'studio.profile' } },
      recency: { p: lastEnd == null ? 0 : RN.clamp(1 - lastEnd / 24, 0, 1), txt: lastEnd == null ? 'No engagement logged' : lastEnd === 0 ? 'Engagement active this month' : `Last engagement ended ${plural(lastEnd, 'month')} ago`, pts: lastEnd == null || lastEnd > 0 ? G('engagement') : 0, action: { l: 'Get a recent engagement confirmed', to: 'studio.credibility' } },
    };
    const rows = RN.fields.risFactors.options.map((f) => Object.assign({ k: f.v, l: f.l, d: f.d, w: f.w }, val[f.v]));
    const tier = RN.fields.risTierFor(op.ris.score);
    const next = RN.fields.risTier.options.filter((x) => x.min > op.ris.score).sort((x, y) => x.min - y.min)[0];
    return { rows, score: op.ris.score, tier, next, toNext: next ? next.min - op.ris.score : 0, avail: rows.reduce((s, r) => s + r.pts, 0), weakest: rows.slice().sort((x, y) => y.pts - x.pts)[0] };
  }
  SA.risBreakdown = risBreakdown;

  /* ---------- Checklist -> Studio tab mapping (next best action) ---------- */
  const CHECK = {
    photo: ['studio.profile', 'Add a photo'], headline: ['studio.profile', 'Write your headline'], bio: ['studio.profile', 'Expand your About section'],
    rate: ['studio.profile', 'Add your hourly rate'], avail: ['studio.profile', 'Confirm availability'], ranges: ['studio.profile', 'Add company ranges'],
    industries: ['studio.profile', 'Add industries'], role: ['studio.profile', 'Add role details'], tags: ['studio.profile', 'Add fit tags'],
    verified: ['studio.credibility', 'Ask a client to verify tags'], reviews: ['studio.credibility', 'Request a review'],
    engagements: ['studio.profile', 'Add an engagement'], video: ['studio.profile', 'Record an intro video'], samples: ['studio.profile', 'Add a work sample'],
  };
  const HEADING = {
    photo: 'Add a profile photo', headline: 'Write a headline in your own words', bio: 'Expand your About section to 400+ characters',
    rate: 'Add your hourly rate', avail: 'Confirm your availability', ranges: 'Add your revenue and employee ranges', industries: 'List 3 or more industries',
    role: 'Fill in the role details for your category', tags: 'Get to 10 fit tags', verified: 'Get 3 fit tags verified by clients',
    reviews: 'Get to 3 client reviews', engagements: 'Add 2 engagements to your history', video: 'Record an intro video', samples: 'Add a work sample to your portfolio',
  };
  function progressOf(op, k) {
    const verified = op.tags.filter((x) => x.tier !== 'claimed').length;
    return { reviews: [op.reviews.length, 3], verified: [verified, 3], tags: [op.tags.length, 10], industries: [op.industries.length, 3], engagements: [op.engagements.length, 2] }[k] || null;
  }
  function nextAction(op) {
    const list = RN.model.checklist(op);
    const todo = list.filter((x) => !x.done).sort((x, y) => y.w - x.w);
    return { list, item: todo[0] || null, done: list.filter((x) => x.done).length };
  }

  /* ---------- Recent activity (notification center) ---------- */
  const SECTION = { reviews: 'client reviews', core: 'CORE ratings', engagements: 'engagement history', samples: 'portfolio', rate: 'rate', about: 'about', expertise: 'expertise', fit: 'fit' };
  const SRC = { card: 'from a search result', search: 'from search', compare: 'from a comparison', proof: 'from your proof link', home: 'from the homepage', direct: 'from a direct link' };
  function activity(op) {
    const st = RN.store.state;
    const items = [];
    // Live events from this session
    const live = liveEvents(op, 90);
    const searchSeen = {};
    live.forEach((e) => {
      const f = firmo(e.buyer);
      const who = e.buyer ? cap(f.who) : 'A visitor who is not signed in';
      const detail = e.buyer ? f.detail : '';
      if (e.type === 'profile_view') items.push({ ts: e.ts, ic: 'eye', live: true, text: `${esc(who)} viewed your profile`, meta: [detail, SRC[e.source] || ''].filter(Boolean).join(' · '), to: 'studio.visibility' });
      else if (e.type === 'shortlist_add') items.push({ ts: e.ts, ic: 'bookmark', live: true, text: `${esc(who)} saved you to a shortlist`, meta: detail, to: 'studio.visibility' });
      else if (e.type === 'compare_add' || e.type === 'compare_view') {
        const k = 'cmp' + (e.buyer ? e.buyer.industry : '') + e.ts.slice(0, 15);
        if (searchSeen[k]) return; searchSeen[k] = 1;
        items.push({ ts: e.ts, ic: 'compare', live: true, text: `${esc(who)} compared you with other operators`, meta: detail, to: 'studio.visibility' });
      } else if (e.type === 'impression') {
        const k = (e.q || '') + '|' + (e.source || '') + '|' + e.ts.slice(0, 16);
        if (searchSeen[k]) return; searchSeen[k] = 1;
        const where = e.surface === 'homepage_carousel' || e.source === 'home' ? 'You were featured on the homepage'
          : e.source === 'talk' ? `You were suggested to a client${e.q ? ' who needs to ' + e.q.toLowerCase() : ''}`
          : e.surface === 'related_operators' ? 'You were suggested as a similar operator'
          : e.q ? `You appeared in a client search for ${quote(e.q)}` : (e.tags || []).length ? `You appeared in a client search for ${e.tags.map(quote).join(' + ')}` : e.source === 'category' ? 'You appeared on a category page' : 'You appeared in client search results';
        items.push({ ts: e.ts, ic: e.source === 'home' ? 'home' : 'search', live: true, text: where, meta: [e.buyer ? cap(f.who) : 'A visitor', e.position ? 'position ' + e.position : ''].filter(Boolean).join(' · '), to: 'studio.visibility' });
      }
    });
    // Intro requests (blind until introduced)
    st.intros.filter((i) => i.opId === op.id).forEach((i) => {
      const s = RN.intro ? RN.intro.summary(i, true) : { who: '', need: '' };
      items.push({ ts: i.createdAt, ic: 'handshake', text: `Intro request${s.need ? ': ' + esc(s.need) : ''}`, meta: s.who, pill: RN.intro ? RN.intro.statusPill(i.status) : '', to: 'studio.inbox', key: 'intro' });
    });
    // Project invites
    st.projects.filter((p) => (p.invited || []).includes(op.id)).forEach((p) => {
      const r = (p.responses || []).find((x) => x.opId === op.id);
      items.push({ ts: p.postedAt || p.createdAt, ic: 'briefcase', text: `You were invited to a project: ${esc(p.title)}`, meta: r ? `You replied: ${r.status === 'interested' ? 'Interested' : 'Passed'}` : 'Waiting for your reply', to: 'studio.inbox' });
    });
    // Proof link opens (the prospect was told viewing is shared)
    st.proofLinks.filter((p) => p.opId === op.id).forEach((p) => {
      (p.views || []).forEach((v) => {
        const secs = (v.sections || []).map((x) => SECTION[x] || x);
        const dur = v.seconds ? `${Math.floor(v.seconds / 60)}\u00a0min ${v.seconds % 60}\u00a0s` : '';
        items.push({ ts: v.ts, ic: 'link', text: `${esc(p.prospect.company)} opened your proof link${v.forwarded ? ' and forwarded it' : ''}`, meta: [secs.length ? 'Read ' + secs.join(', ') : '', dur].filter(Boolean).join(' · '), to: 'studio.credibility' });
      });
    });
    // Reviews
    // Reviews: a review submitted this session carries the score, so it replaces its "completed" request line
    const sessionReviews = st.reviews.filter((r) => r.opId === op.id);
    st.reviewRequests.filter((r) => r.opId === op.id).forEach((r) => {
      const rv = sessionReviews.find((x) => x.requestId === r.id || x.id === r.reviewId);
      if (r.status === 'completed' && r.completedAt && !rv) items.push({ ts: r.completedAt, ic: 'star', text: `${esc(r.reviewer.name)} completed your review`, meta: [r.reviewer.title, r.reviewer.company].filter(Boolean).join(', '), to: 'studio.credibility' });
      if (r.sentAt) items.push({ ts: r.sentAt, ic: 'send', text: `Review request sent to ${esc(r.reviewer.name)}`, meta: r.reviewer.company || '', to: 'studio.credibility', quiet: true });
    });
    sessionReviews.forEach((r) => {
      const score = r.coreAvg || r.overall;
      const name = (r.reviewer && (r.reviewer.name || r.reviewer)) || r.name || 'A client';
      const req = st.reviewRequests.find((x) => x.id === r.requestId);
      const good = (score || 5) >= 4;
      items.push({ ts: (req && req.completedAt) || r.ts || r.submittedAt || r.date || RN.now().toISOString(), ic: 'star', live: true, text: `New review from ${esc(name)}${score ? `: ${(+score).toFixed(2)} / 5` : ''}`, meta: [r.company, (r.tags || []).length ? (good ? `Verified ${plural(r.tags.length, 'fit tag')}` : `${plural(r.tags.length, 'fit tag')} reviewed`) : ''].filter(Boolean).join(' · '), to: 'studio.credibility' });
    });
    // Illustrative daily roll-ups (never company names)
    const a = A(op, 7);
    const imp = a.series.impressions, views = a.series.views;
    const topQ = a.queries[0] ? a.queries[0].q : '';
    for (let i = 1; i <= 3; i++) {
      const di = imp.length - 1 - i;
      if (di < 0) break;
      const ts = new Date(nowMs() - i * DAY + 3 * 36e5).toISOString();
      if (imp[di]) items.push({ ts, ic: 'search', text: `You appeared in ${plural(imp[di], 'search', 'searches')}`, meta: i === 1 && topQ ? `Top term: “${topQ}”` : '', to: 'studio.visibility', illus: true });
      if (views[di]) items.push({ ts: new Date(t(ts) - 2 * 36e5).toISOString(), ic: 'eye', text: `${plural(views[di], 'company', 'companies')} viewed your profile`, meta: 'Segments are shown in Who viewed you', to: 'studio.visibility', illus: true });
    }
    return items.filter((x) => x.ts && t(x.ts) <= nowMs() + 6e4).sort((x, y) => t(y.ts) - t(x.ts));
  }
  const lastSeen = () => seen().saActivitySeen || new Date(nowMs() - DAY).toISOString();
  const unread = (op) => activity(op).filter((x) => !x.quiet && t(x.ts) > t(lastSeen())).length;

  /* ---------- Demand signal feed (anonymized, replaces "How it works", L48) ---------- */
  function budget(cat, rev, hoursCode) {
    const idx = RN.data.market.rateIndex;
    const p50 = (idx.byCat[cat] || idx.byCat.sales_leadership).p50 * (idx.byRevenue[rev] || 1);
    const hrs = +hoursCode || 40;
    const lo = Math.round((p50 * hrs * 0.85) / 1000) * 1000, hi = Math.round((p50 * hrs * 1.2) / 1000) * 1000;
    return `${fmt.usdK(lo)}–${fmt.usdK(hi)}/mo`;
  }
  function demand(op) {
    return memo('demand|' + op.id, () => {
      const mk = RN.model.market();
      const vOf = (tag) => { const x = mk.tags.find((y) => y.t.toLowerCase() === tag.toLowerCase()); return x ? x.verified : 0; };
      const mine = new Map(op.tags.map((x) => [x.t.toLowerCase(), x]));
      const week = Math.floor(nowMs() / (7 * DAY));
      const rand = RN.rng('demand-' + op.id + '-' + week);
      const C = RN.data.market.companies;
      const items = [];
      const st = RN.store.state;
      const fitOf = (b) => { try { return RN.model.fit(op, b); } catch (e) { return null; } };
      // 1. Live client searches this session
      const searches = st.events.filter((e) => e.type === 'search' && (e.persona === 'buyer' || e.persona === 'visitor') && nowMs() - t(e.ts) < 7 * DAY).slice(0, 4);
      searches.forEach((e) => {
        const f = firmo(e.buyer);
        const appeared = st.events.some((x) => x.type === 'impression' && x.opId === op.id && x.q === e.q && Math.abs(t(x.ts) - t(e.ts)) < 6e4);
        const label = e.q ? quote(e.q) : (e.tags || []).length ? e.tags.map(quote).join(' + ') : 'operators with filters';
        items.push({ ts: e.ts, live: true, ic: 'search', rev: e.buyer && e.buyer.revenueRange,
          text: `${cap(e.buyer ? esc(f.who) : 'a visitor')} searched ${label}`,
          meta: [e.results != null ? plural(e.results, 'operator') + ' matched' : '', appeared ? 'You were in the results' : 'You were not in the results'].filter(Boolean).join(' · '),
          act: appeared ? { l: 'See why', to: 'studio.visibility' } : { l: 'Check positioning', to: 'studio.positioning' } });
      });
      // 2. Posted projects (scope and firmographics only)
      st.projects.filter((p) => ['posted', 'in_progress'].includes(p.status)).forEach((p) => {
        const fl = p.fields || {};
        const b = { industry: (fl.industries || [])[0], revenueRange: fl.revenueRange, employeeRange: fl.employeeRange };
        const f = firmo(b);
        const fit = fitOf({ revenueRange: fl.revenueRange, employeeRange: fl.employeeRange, industries: fl.industries, tags: fl.tags, roleCategory: fl.roleCategory, salesMotions: fl.salesMotions });
        const invited = (p.invited || []).includes(op.id);
        items.push({ ts: p.postedAt || p.createdAt, ic: 'briefcase', rev: fl.revenueRange,
          text: `${cap(esc(f.who))} posted a ${esc(p.title)} project`,
          meta: [f.rev, fl.engagementType && lab('engagementType', fl.engagementType), fl.hoursPerMonth && lab('hoursPerMonth', fl.hoursPerMonth), fl.term && lab('term', fl.term)].filter(Boolean).join(' · '),
          fit, act: invited ? { l: 'You are invited', to: 'studio.inbox' } : { l: 'See opportunities', to: 'studio.opportunities' } });
      });
      // 3. Intro requests to other operators (anonymized scope only)
      st.intros.filter((i) => i.opId !== op.id && inWin(i.createdAt, 0, 14)).slice(0, 2).forEach((i) => {
        const c = (i.buyer && i.buyer.company) || {};
        const f = firmo(c);
        const fl = i.fields || {};
        items.push({ ts: i.createdAt, ic: 'handshake', rev: c.revenueRange,
          text: `${cap(esc(f.who))} asked to meet a ${esc(RN.fields.catLabel(fl.roleCategory || ''))} operator`,
          meta: [fl.need && lab('need', fl.need), fl.engagementType && lab('engagementType', fl.engagementType), fl.hoursPerMonth ? lab('hoursPerMonth', fl.hoursPerMonth) : '', fl.hoursPerMonth ? 'budget ' + budget(fl.roleCategory, c.revenueRange, fl.hoursPerMonth) : ''].filter(Boolean).join(' · '),
          fit: fl.roleCategory === op.catKey ? fitOf({ revenueRange: c.revenueRange, employeeRange: c.employeeRange, industries: [c.industry], roleCategory: fl.roleCategory, need: fl.need }) : null });
      });
      // 4. Weekly search demand in your category and tags (illustrative volumes)
      const opTags = new Set(op.tags.map((x) => x.t.toLowerCase()));
      RN.data.market.queries.filter((q) => !q.zero && (q.cat === op.catKey || q.tags.some((x) => opTags.has(x.toLowerCase())))).slice(0, 7).forEach((q) => {
        const pool = C.filter((c) => (q.industry ? c.industry === q.industry : true));
        const c = RN.pick(rand, pool.length ? pool : C);
        const n = Math.max(2, Math.round((q.vol / 70) * (0.7 + rand() * 0.6)));
        const tag = q.tags[0];
        const my = mine.get(tag.toLowerCase());
        const hours = rand() < 0.55 ? '40' : '20';
        const fit = fitOf({ revenueRange: c.revenueRange, employeeRange: c.employeeRange, industries: [c.industry], tags: q.tags, roleCategory: q.cat });
        const ver = vOf(tag);
        items.push({ ts: new Date(nowMs() - rand() * 6 * DAY).toISOString(), ic: 'search', rev: c.revenueRange,
          text: `${n} ${esc(ind(c.industry))} companies searched ${quote(q.q)}`,
          meta: `${my && my.tier !== 'claimed' ? (ver <= 1 ? `You are the only operator with ${tag} verified` : `You are one of ${ver} operators with ${tag} verified`) : ver ? `${plural(ver, 'operator has', 'operators have')} ${tag} verified` : `No operator has ${tag} verified yet`} · ${lab('hoursPerMonth', hours)} · typical budget ${budget(q.cat, c.revenueRange, hours)}`,
          fit, you: my ? (my.tier === 'claimed' ? 'claimed' : '') : 'none', tag,
          act: !my ? { l: 'Add tag', act: 'sa-tag-add', t: tag } : my.tier === 'claimed' ? { l: 'Get it verified', to: 'studio.credibility' } : null });
      });
      // 5. Zero-result searches: demand nobody serves yet
      mk.zero.slice(0, 3).forEach((z, i) => {
        items.push({ ts: z.ts || new Date(nowMs() - (1.5 + i * 1.7) * DAY).toISOString(), live: !!z.live, ic: 'flag',
          text: `Clients searched ${quote(z.q)} and no operator matched`,
          meta: [z.cat ? RN.fields.catLabel(z.cat) : '', z.vol > 1 ? plural(z.vol, 'search', 'searches') + ' this month' : 'Just now'].filter(Boolean).join(' · '),
          act: { l: 'See unmet searches', to: 'studio.positioning' } });
      });
      const catWeek = Math.round(RN.data.market.queries.filter((q) => q.cat === op.catKey).reduce((s, q) => s + q.vol, 0) / 4.3);
      return { items: items.sort((x, y) => t(y.ts) - t(x.ts)), catWeek, supply: mk.catSupply[op.catKey] || 0 };
    });
  }

  /* ---------- Shared bits of UI ---------- */
  function seg() {
    const d = days();
    return `<div class="seg sa-seg" role="group" aria-label="Time period">${[7, 30, 90].map((n) => `<button type="button" class="${n === d ? 'on' : ''}" aria-pressed="${n === d}" data-act="sa-days" data-d="${n}">${n} days</button>`).join('')}</div>`;
  }
  function head(title, sub, right) {
    return `<header class="app-head sa-head"><div class="grow"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right || ''}</header>`;
  }
  function cardHd(title, sub, right) {
    return `<div class="card-hd"><div class="grow"><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right || ''}</div>`;
  }
  const illus = (txt) => `<span class="pill sa-illus" title="${esc(txt || 'Illustrative figures for the prototype')}">Illustrative</span>`;
  function meterRow(label, value, share, o) {
    o = o || {};
    return `<li class="sa-mrow${o.muted ? ' is-muted' : ''}"><div class="sa-mrow-t"><span class="sa-mrow-l">${label}</span><span class="sa-mrow-v">${value}</span></div><div class="meter"><i style="width:${Math.max(1.5, Math.min(100, share * 100)).toFixed(1)}%"></i></div>${o.note ? `<span class="sa-mrow-n">${o.note}</span>` : ''}</li>`;
  }
  function youPill(tier) {
    if (tier === 'verified' || tier === 'expert') return `<span class="pill pill-good">${icon('check-circle')}${tier === 'expert' ? 'Expert' : 'Verified'}</span>`;
    if (tier === 'claimed') return `<span class="pill pill-line">Claimed</span>`;
    return `<span class="pill sa-pill-none">Not on profile</span>`;
  }
  function fitPill(fit) {
    if (!fit) return '';
    const cls = fit.pct >= 75 ? 'pill-good' : fit.pct >= 50 ? 'pill-info' : '';
    return `<span class="pill ${cls}" title="${esc(fit.signals.map((s) => s.text).join('. '))}">${esc(fit.label)} for you</span>`;
  }
  function actBtn(a, cls) {
    if (!a) return '';
    const ic = cls === 'act' ? icon(a.act ? 'plus' : 'arrow') : '';
    if (a.act) return `<button type="button" class="${cls || 'btn btn-line btn-sm'}" data-act="${esc(a.act)}" data-t="${esc(a.t || '')}">${cls === 'act' ? ic : ''}${esc(a.l)}</button>`;
    return `<a class="${cls || 'btn btn-line btn-sm'}" href="#${esc(a.to)}">${esc(a.l)}${ic}</a>`;
  }

  /* =====================================================================
     OVERVIEW
     ===================================================================== */
  const showAll = { demand: false, activity: false };

  function renderOverview(op) {
    resetSlots();
    const d = days();
    const m = metrics(op, d);
    const a = m.a;
    const hr = RN.now().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const act = activity(op);
    const since = lastSeen();
    const fresh = act.filter((x) => !x.quiet && t(x.ts) > t(since));
    const liveNow = liveEvents(op, 1).filter((e) => nowMs() - t(e.ts) < 2 * 36e5 && ['profile_view', 'shortlist_add', 'compare_add'].includes(e.type))[0];
    return `<div class="sa sa-overview">
      ${head(`${greet}, <span class="serif">${esc(op.first)}</span>.`, `${esc(op.ris.label)} · Reputation Index ${esc(op.ris.score)} · Profile ${esc(op.completeness)}% complete${fresh.length ? ` · <b>${plural(fresh.length, 'new update')}</b> since your last visit` : ''}`, seg())}
      ${liveNow ? liveStrip(liveNow) : ''}
      ${kpiRow(op, m, d)}
      <div class="sa-grid sa-grid-a">
        ${whyFound(op, a, d)}
        ${nbaCard(op)}
      </div>
      <div class="sa-grid sa-grid-b">
        ${demandCard(op)}
        ${activityCard(op, act, since)}
      </div>
      <div class="sa-grid sa-grid-c">
        ${risCard(op)}
        ${digestCard(op)}
      </div>
      <p class="tiny muted sa-foot">${icon('info')}Numbers combine illustrative history with live activity from this prototype session. Company names are never shown in Studio.</p>
    </div>`;
  }

  function liveStrip(e) {
    const f = firmo(e.buyer);
    const verb = e.type === 'profile_view' ? 'viewed your profile' : e.type === 'shortlist_add' ? 'saved you to a shortlist' : 'compared you with other operators';
    const who = e.buyer ? `${cap(f.who)}${f.rev ? `, ${f.rev}` : ''}` : 'A visitor who is not signed in';
    return `<a class="sa-live" href="#studio.visibility"><span class="sa-live-dot" aria-hidden="true"></span><span><b>${esc(cap(fmt.ago(e.ts)))}:</b> ${esc(who)}, ${verb}.</span><span class="sa-live-go">See who viewed you${icon('arrow')}</span></a>`;
  }

  function kpiRow(op, m, d) {
    const k = [
      { k: 'imp', l: 'Search impressions', tip: 'Times your card showed in client search results, at least half visible for one second. Counted once per client session. Bots, staff and your own visits are excluded.', to: 'studio.visibility' },
      { k: 'views', l: 'Profile views', tip: 'Times a client or visitor opened your profile. Repeat opens by the same person within 30 minutes count once.', to: 'studio.visibility' },
      { k: 'sl', l: 'Shortlist appearances', tip: 'Times a client saved you to a shortlist or a client project ranked you in its top matches.', to: 'studio.visibility' },
      { k: 'intros', l: 'Intro requests', tip: 'Clients who asked to meet you. You see scope and company size until you are introduced.', to: 'studio.inbox' },
    ];
    return `<section class="card sa-kpis" aria-label="Your numbers for ${esc(periodLabel(d))}">
      ${k.map((x) => `<div class="sa-kpi">
        <div class="sa-kpi-l"><a href="#${x.to}">${esc(x.l)}</a>${RN.ui.tip(x.tip)}</div>
        <div class="sa-kpi-v">${fmt.int(m.cur[x.k])}</div>
        <div class="sa-kpi-d">${m.prev[x.k] ? RN.ui.delta(m.cur[x.k], m.prev[x.k]) : m.cur[x.k] ? '<span class="delta up">New</span>' : '<span class="delta flat">None yet</span>'}<span>${esc(prevLabel(d))}</span></div>
        ${slot((w) => RN.chart.spark(m.series[x.k], { w, h: 34, label: x.l + ' trend' }), 'sa-kpi-spark', 34)}
      </div>`).join('')}
    </section>`;
  }

  function whyFound(op, a, d) {
    const qs = a.queries.slice(0, 3);
    const total = a.queries.reduce((s, q) => s + q.n, 0) || 1;
    const top = a.filters.find((f) => !/^Role category/.test(f.l)) || a.filters[0];
    const body = qs.length ? `<ol class="sa-why">${qs.map((q, i) => `<li>
        <span class="sa-rank num">${i + 1}</span>
        <div class="grow">
          <div class="sa-why-t"><b>${quote(q.q)}</b><span class="num">${fmt.int(q.n)}</span></div>
          <div class="meter"><i style="width:${Math.max(3, (q.n / qs[0].n) * 100).toFixed(1)}%"></i></div>
          <p class="tiny muted">${pct(q.n / total)} of search impressions${q.tags.length ? ` · matched ${q.tags.map(esc).join(', ')}` : ' · not matched by your tags'}${q.live ? ' · <b>live</b>' : ''}</p>
        </div></li>`).join('')}</ol>` : RN.ui.empty({ icon: 'search', title: 'No searches yet', body: 'Add fit tags that match what clients search for and you will start appearing.', cta: `<a class="btn btn-sm" href="#studio.positioning">See what clients search</a>` });
    return `<section class="card sa-card">
      ${cardHd('Why clients found you', `Search terms that showed your card, ${esc(periodLabel(d))}`, `<a class="act" href="#studio.visibility">All terms${icon('arrow')}</a>`)}
      ${body}
      ${top ? `<div class="sa-why-f">${icon('filter')}<div><span class="tiny muted">Most used filter when you appeared${/^Role category/.test(top.l) ? '' : ', after role category'}</span><b>${esc(top.l)}</b></div><span class="num">${fmt.int(top.n)}</span></div>` : ''}
    </section>`;
  }

  function nbaCard(op) {
    const n = nextAction(op);
    const it = n.item;
    const map = it ? CHECK[it.k] || ['studio.profile', 'Open profile'] : null;
    const prog = it ? progressOf(op, it.k) : null;
    const gainRI = it && ['reviews', 'verified', 'engagements'].includes(it.k) ? RN.model.risGain(it.k === 'reviews' ? 'review' : it.k === 'verified' ? 'verifiedTag' : 'engagement') : 0;
    return `<section class="card sa-card sa-nba">
      <div class="sa-strength">
        ${RN.chart.ring(op.completeness, { size: 64, stroke: 7, label: 'Profile strength ' + op.completeness + '%' })}
        <div><span class="label">Profile strength</span><b class="num">${esc(op.completeness)}%</b><span class="small muted">${n.done} of ${n.list.length} items done</span></div>
      </div>
      ${it ? `<div class="sa-nba-body">
        <span class="eyebrow">Next best action</span>
        <h3 class="h4">${esc(HEADING[it.k] || it.l)}</h3>
        <p class="small">${esc(it.gain)}.</p>
        ${prog ? `<div class="sa-nba-prog"><div class="meter"><i style="width:${Math.min(100, (prog[0] / prog[1]) * 100)}%"></i></div><span class="tiny muted">${fmt.int(prog[0])} of ${fmt.int(prog[1])}</span></div>` : ''}
        <div class="row" style="--gap:12px"><a class="btn btn-sm" href="#${map[0]}">${esc(map[1])}${icon('arrow')}</a>${gainRI ? `<span class="tiny muted">About +${gainRI} Reputation Index points each</span>` : ''}</div>
      </div>` : `<div class="sa-nba-body"><span class="eyebrow">Next best action</span><h3 class="h4">Your profile is complete</h3><p class="small">Send a proof link to your next prospect. Every open shows here, and each shared link brings a client to your verified record.</p><a class="btn btn-sm" href="#studio.credibility">Create a proof link${icon('arrow')}</a></div>`}
    </section>`;
  }

  function risCard(op) {
    const b = risBreakdown(op);
    const tiers = RN.fields.risTier.options.slice().reverse().filter((x) => x.min >= 50);
    return `<section class="card sa-card sa-ris">
      ${cardHd('Reputation Index', 'The five published factors and the points still available', `<a class="act" href="#studio.credibility">Credibility${icon('arrow')}</a>`)}
      <div class="sa-ris-top">
        <span class="sa-ris-seal">${RN.ui.hexSeal(b.tier.l)}<b>${esc(b.score)}</b></span>
        <div class="grow">
          <div class="sa-ris-tier"><b>${esc(b.tier.l)}</b><span class="small muted">${b.next ? `${plural(b.toNext, 'point')} to ${esc(b.next.l)}` : 'Top tier'}</span></div>
          <div class="sa-ladder" aria-label="Tier ladder">${tiers.map((x) => `<i class="${x.v === b.tier.v ? 'on' : b.score > x.max ? 'past' : ''}" title="${esc(x.l)} ${x.min} to ${x.max}"><span>${esc(x.l)}</span></i>`).join('')}</div>
        </div>
      </div>
      <ul class="sa-factors">${b.rows.map((r) => `<li>
          <div class="sa-mrow-t"><span class="sa-mrow-l">${esc(r.l)} ${RN.ui.tip(esc(r.d) + ' Weight ' + Math.round(r.w * 100) + '%.')}</span><span class="sa-mrow-v">${r.pts ? `<b>+${r.pts}</b> pts available` : 'Maxed'}</span></div>
          <div class="meter"><i style="width:${(RN.clamp(r.p, 0, 1) * 100).toFixed(1)}%"></i></div>
          <span class="sa-mrow-n">${esc(r.txt)}${r.pts && r === b.weakest ? ` · <a class="link" href="#${r.action.to}">${esc(r.action.l)}</a>` : ''}</span>
        </li>`).join('')}</ul>
      <p class="tiny muted">Every approved profile starts at 50. Up to ${b.avail} points are within reach from the actions above. Points are estimates for planning.</p>
    </section>`;
  }

  function demandCard(op) {
    const dm = demand(op);
    const rev = seen().saDemandRev || '';
    let list = dm.items.filter((x) => !rev || x.rev === rev);
    const total = list.length;
    if (!showAll.demand) list = list.slice(0, 5);
    return `<section class="card sa-card sa-demand">
      ${cardHd('What clients are looking for', `Anonymized demand in ${esc(RN.fields.catLabel(op.catKey))} and your focus areas, this week`, `<span class="pill pill-accent">${fmt.int(dm.catWeek)} searches · ${fmt.int(dm.supply)} operators</span>`)}
      <div class="sa-demand-seg" data-deselect>
        <span class="label">Company revenue</span>
        ${RN.w.control('companyRevenue', rev, { name: 'saDemandRev', id: 'sa-demand-rev', change: 'sa-demand-rev' })}
      </div>
      ${list.length ? `<ul class="sa-feed">${list.map((x) => `<li class="${x.live ? 'is-live' : ''}">
          <span class="sa-feed-ic">${icon(x.ic)}</span>
          <div class="grow">
            <p class="sa-feed-t">${x.live ? '<span class="pill pill-good sa-pill-live">Live</span>' : ''}${x.text}</p>
            <p class="sa-feed-m">${esc(x.meta || '')}</p>
            <div class="sa-feed-f">${fitPill(x.fit)}${x.you ? youPill(x.you === 'none' ? null : x.you) : ''}<span class="tiny muted">${esc(fmt.ago(x.ts))}</span>${x.act ? `<span class="sa-feed-a">${actBtn(x.act, 'act')}</span>` : ''}</div>
          </div>
        </li>`).join('')}</ul>` : RN.ui.empty({ icon: 'search', title: 'No demand in this range yet', body: 'Try another company revenue range, or clear the filter to see everything.', cta: `<button type="button" class="btn btn-line btn-sm" data-act="sa-demand-clear">Clear filter</button>` })}
      ${total > 5 ? `<button type="button" class="act sa-more" data-act="sa-more" data-k="demand">${showAll.demand ? 'Show fewer' : `Show all ${total}`}${icon(showAll.demand ? 'chev-up' : 'chev-down')}</button>` : ''}
    </section>`;
  }

  function activityCard(op, items, since) {
    const fresh = items.filter((x) => !x.quiet && t(x.ts) > t(since)).length;
    const list = showAll.activity ? items.slice(0, 30) : items.slice(0, 8);
    return `<section class="card sa-card sa-activity">
      ${cardHd('Recent activity', fresh ? `${plural(fresh, 'new update')} since you last checked` : 'You are all caught up', fresh ? `<button type="button" class="act" data-act="sa-read">${icon('check')}Mark all read</button>` : '')}
      ${list.length ? `<ol class="sa-tl">${list.map((x) => `<li class="${t(x.ts) > t(since) && !x.quiet ? 'is-new' : ''}">
          <span class="sa-tl-ic">${icon(x.ic)}</span>
          <a class="sa-tl-b" href="#${esc(x.to)}">
            <span class="sa-tl-t">${x.text}${x.pill ? ' ' + x.pill : ''}</span>
            ${x.meta ? `<span class="sa-tl-m">${esc(x.meta)}</span>` : ''}
          </a>
          <time class="sa-tl-when" datetime="${esc(x.ts)}">${x.live && nowMs() - t(x.ts) < 6e4 ? 'Just now' : esc(fmt.ago(x.ts))}</time>
        </li>`).join('')}</ol>` : RN.ui.empty({ icon: 'bolt', title: 'Nothing yet', body: 'Views, searches, intro requests and proof link opens show up here as they happen.' })}
      ${items.length > 8 ? `<button type="button" class="act sa-more" data-act="sa-more" data-k="activity">${showAll.activity ? 'Show fewer' : `Show all ${Math.min(30, items.length)}`}${icon(showAll.activity ? 'chev-up' : 'chev-down')}</button>` : ''}
    </section>`;
  }

  /* Weekly digest: the same numbers as the Monday email. Skip rule: no personal activity sends the
     market pulse only; nothing new sends nothing. */
  function digest(op) {
    const a = A(op, 7);
    const searches = a.queries.reduce((s, q) => s + q.n, 0);
    const top = a.queries.slice(0, 3).map((q) => q.q);
    const topInd = a.mix.industry[0];
    const n = nextAction(op).item;
    const idx = RN.data.market.rateIndex.byCat[op.catKey];
    const hot = RN.model.positioning(op.id).opps[0];
    const hotMine = hot && hot.have && hot.tier !== 'claimed';
    const personal = a.totals.impressions + a.totals.views > 0;
    const subject = personal ? `You appeared in ${plural(searches, 'search', 'searches')} this week` : `This week in ${RN.fields.catLabel(op.catKey)}`;
    const lines = [];
    if (personal) {
      lines.push(`Search impressions: ${fmt.int(a.totals.impressions)} (${a.prev.impressions ? (a.totals.impressions >= a.prev.impressions ? '+' : '') + Math.round(((a.totals.impressions - a.prev.impressions) / a.prev.impressions) * 100) + '%' : 'new'} vs last week)`);
      lines.push(`Profile views: ${fmt.int(a.totals.views)}. Similar operators: ${fmt.int(a.benchmark.median)}`);
      if (top.length) lines.push(`Top terms: ${top.map((x) => '“' + x + '”').join(', ')}`);
      if (topInd) lines.push(`${topInd.l} companies viewed you most`);
    }
    const pulse = [idx ? `Rate Index median for ${RN.fields.catLabel(op.catKey)}: ${fmt.usd(idx.p50)}/hr` : '', hot ? `Most underserved focus area: ${hot.t}, ${fmt.int(hot.demand)} searches a month${hotMine && hot.verified <= 1 ? '. You are the only operator with it verified' : `, ${plural(hot.verified, 'verified operator')}`}` : ''].filter(Boolean);
    return { personal, subject, lines, top, action: n, pulse, empty: !personal && !pulse.length };
  }

  function digestCard(op) {
    const g = digest(op);
    const off = !!seen().saDigestOff;
    const next = new Date(RN.now()); next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0);
    return `<section class="card sa-card sa-digest">
      ${cardHd('Your weekly digest', off ? 'Paused. Turn it back on any time.' : `Next email ${esc(RN.fmt.dateShort(next))}, 8am your time`, `<label class="switch"><input type="checkbox" data-change="sa-digest-toggle" ${off ? '' : 'checked'}><i></i><span class="sr-only">Email me every Monday</span></label>`)}
      ${g.empty ? RN.ui.empty({ icon: 'mail', title: 'Nothing new this week', body: 'We skip the email when nothing changed. You will hear from us when something does.' }) : `<article class="sa-mail${off ? ' is-off' : ''}" aria-label="Email preview">
        <div class="sa-mail-hd"><span class="sa-mail-from"><img src="assets/brand/mark.png" alt="">Revenue Nomad</span><span class="tiny muted">to ${esc(RN.personas.operator.email)}</span></div>
        <h4 class="sa-mail-s">${esc(g.subject)}</h4>
        ${g.personal ? `<ul class="sa-mail-l">${g.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="small muted">No personal activity this week, so this email carries the market pulse only.</p>'}
        ${g.action ? `<div class="sa-mail-a"><span class="label">One thing to do</span><p class="small"><b>${esc(HEADING[g.action.k] || g.action.l)}.</b> ${esc(g.action.gain)}.</p></div>` : ''}
        <div class="sa-mail-p"><span class="label">Market pulse</span>${g.pulse.map((p) => `<p class="small">${esc(p)}</p>`).join('')}</div>
      </article>`}
      <div class="row" style="--gap:12px;margin-top:16px">
        <button type="button" class="btn btn-line btn-sm" data-act="sa-digest-send" ${g.empty ? 'disabled' : ''}>${icon('send')}Send me this now</button>
        <span class="tiny muted">One email a week. We skip it when nothing is new.</span>
      </div>
    </section>`;
  }

  /* =====================================================================
     VISIBILITY ("Who viewed you")
     ===================================================================== */
  function peers(op, d) {
    return memo('peers|' + op.id + '|' + d, () => {
      const list = RN.model.ops.filter((x) => x.id !== op.id && x.catKey === op.catKey).slice(0, 30);
      const rows = list.map((x) => { const a = RN.model.analytics(x.id, { days: d }); return { imp: a.totals.impressions, views: a.totals.views, sl: a.totals.shortlists, intros: Math.round(a.totals.views * 0.015) + RN.store.state.intros.filter((i) => i.opId === x.id && inWin(i.createdAt, 0, d)).length }; });
      return {
        n: rows.length,
        imp: median(rows.map((r) => r.imp)), views: median(rows.map((r) => r.views)), sl: median(rows.map((r) => r.sl)), intros: median(rows.map((r) => r.intros)),
        vr: median(rows.map((r) => (r.imp ? r.views / r.imp : NaN))), sr: median(rows.map((r) => (r.views ? r.sl / r.views : NaN))),
      };
    });
  }

  function renderVisibility(op) {
    resetSlots();
    const d = days();
    const m = metrics(op, d);
    const a = m.a;
    return `<div class="sa sa-vis">
      ${head('Who viewed you', `Where you showed up, who looked and what they did next, ${esc(periodLabel(d))}. Company names are never shown.`, seg())}
      ${funnelCard(op, m, d)}
      ${trendCard(op, a, d)}
      ${termsCard(op, a, d)}
      <div class="sa-grid sa-grid-2">
        <section class="card sa-card">${cardHd('Filters clients used', 'Active filters when your card appeared')}
          <ul class="sa-bars">${a.filters.map((f) => meterRow(esc(f.l), fmt.int(f.n), f.n / (a.filters[0].n || 1))).join('')}</ul></section>
        <section class="card sa-card">${cardHd('Where your views came from', 'The page or channel a client opened your profile from')}
          <ul class="sa-bars">${a.sources.slice().sort((x, y) => y.n - x.n).map((s) => meterRow(esc(s.l), fmt.int(s.n), s.n / (Math.max(...a.sources.map((z) => z.n)) || 1))).join('')}</ul></section>
      </div>
      ${viewersCard(op, a, d)}
      ${mixCard(op, a)}
      ${lostCard(op, a)}
      ${howCard()}
    </div>`;
  }

  function funnelCard(op, m, d) {
    const p = peers(op, d);
    const steps = [
      { label: 'Search impressions', value: m.cur.imp },
      { label: 'Profile views', value: m.cur.views },
      { label: 'Shortlist appearances', value: m.cur.sl },
      { label: 'Intro requests', value: m.cur.intros },
    ];
    const vr = m.cur.imp ? m.cur.views / m.cur.imp : 0;
    const sr = m.cur.views ? m.cur.sl / m.cur.views : 0;
    const rows = [
      { l: 'View rate', you: pct(vr, 1), peer: pct(p.vr, 1), up: vr >= p.vr, tip: 'Profile views divided by search impressions. Your headline, photo and top fit tags drive it.' },
      { l: 'Shortlist rate', you: pct(sr, 1), peer: pct(p.sr, 1), up: sr >= p.sr, tip: 'Shortlist appearances divided by profile views. Verified proof drives it.' },
      { l: 'Profile views', you: fmt.int(m.cur.views), peer: fmt.int(p.views), up: m.cur.views >= p.views },
      { l: 'Intro requests', you: fmt.int(m.cur.intros), peer: fmt.int(p.intros), up: m.cur.intros >= p.intros },
    ];
    return `<section class="card sa-card sa-funnel">
      ${cardHd('Your funnel', `From search to intro, compared with the median of ${plural(p.n, 'similar operator')} in ${esc(RN.fields.catLabel(op.catKey))}`)}
      <div class="sa-funnel-g">
        ${slot((w) => (w >= 460 ? RN.chart.funnel(steps, { w, rowH: 46, label: 'Visibility funnel' }) : htmlFunnel(steps)), 'sa-funnel-c', 184)}
        <table class="tbl sa-peer"><thead><tr><th></th><th class="r">You</th><th class="r">Median</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${esc(r.l)}${r.tip ? ' ' + RN.ui.tip(r.tip) : ''}</td><td class="r"><b>${r.you}</b> <span class="sa-arrow ${r.up ? 'up' : 'down'}">${icon(r.up ? 'trend-up' : 'trend-down')}</span></td><td class="r muted">${r.peer}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </section>`;
  }
  function htmlFunnel(steps) {
    const max = Math.max(...steps.map((s) => s.value), 1);
    return `<ol class="sa-hfunnel">${steps.map((s, i) => `<li><div class="sa-mrow-t"><span class="sa-mrow-l">${esc(s.label)}</span><span class="sa-mrow-v"><b>${fmt.int(s.value)}</b>${i && steps[i - 1].value ? ` · ${Math.round((s.value / steps[i - 1].value) * 100)}%` : ''}</span></div><div class="sa-hfunnel-b"><i style="width:${Math.max(2, (s.value / max) * 100).toFixed(1)}%;opacity:${(1 - i * 0.16).toFixed(2)}"></i></div></li>`).join('')}</ol>`;
  }

  /* RN.chart.line prints every ceil(n/6)th label plus the last; blank the ones that would collide at this width */
  function thinLabels(labels, w) {
    const n = labels.length;
    const core = Math.ceil(n / 6);
    const fit = Math.max(3, Math.floor(w / 72));
    const step = core * Math.max(1, Math.ceil(Math.ceil(n / core) / fit));
    return labels.map((l, i) => (i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.6) ? l : ''));
  }
  function trendCard(op, a, d) {
    const lbl = a.series.labels;
    const ticksFor = (vals) => { const nm = RN.chart.niceMax(Math.max(...vals, 1)); const k = nm / Math.pow(10, Math.floor(Math.log10(nm))); return k === 2 || k === 1 ? 4 : 5; };
    const mk = (vals, name) => (w) => RN.chart.line([{ name, values: vals }], thinLabels(lbl, w), { w, h: w < 420 ? 150 : 170, ticks: ticksFor(vals), label: name + ' per day' });
    return `<section class="card sa-card">
      ${cardHd('Trend', `Per day, ${esc(periodLabel(d))}. Two charts because the scales differ.`)}
      <div class="sa-grid sa-grid-2 sa-trend">
        <figure><figcaption><b>Search impressions</b><span class="num">${fmt.int(a.totals.impressions)}</span></figcaption>${slot(mk(a.series.impressions, 'Search impressions'), '', 150)}</figure>
        <figure><figcaption><b>Profile views</b><span class="num">${fmt.int(a.totals.views)}</span></figcaption>${slot(mk(a.series.views, 'Profile views'), '', 150)}</figure>
      </div>
    </section>`;
  }

  /* The model returns the top 10 terms, so a term searched once in this session can fall off; add those back as live rows */
  function termsWithLive(op, a, d) {
    const rows = a.queries.slice();
    const liveQ = {};
    liveEvents(op, d).filter((e) => e.type === 'impression' && e.q).forEach((e) => {
      const k = e.q.trim().toLowerCase();
      liveQ[k] = liveQ[k] || { q: e.q.trim(), n: 0, clicks: 0, tags: [], live: true };
      liveQ[k].n += 1;
    });
    Object.keys(liveQ).forEach((k) => {
      const hit = rows.find((r) => r.q.toLowerCase() === k);
      if (hit) hit.live = true;
      else {
        const opTags = op.tags.map((x) => x.t.toLowerCase());
        const STOP = ['sales', 'fractional', 'leader', 'leadership', 'operator', 'consultant', 'expert', 'with', 'for', 'and'];
        liveQ[k].tags = op.tags.filter((x) => k.split(/\s+/).some((w) => w.length > 3 && !STOP.includes(w) && x.t.toLowerCase().includes(w))).map((x) => x.t).filter((x, i, arr) => arr.indexOf(x) === i && opTags.includes(x.toLowerCase())).slice(0, 2);
        rows.unshift(liveQ[k]);
      }
    });
    return rows;
  }
  function termsCard(op, a, d) {
    a = Object.assign({}, a, { queries: termsWithLive(op, a, d) });
    const total = a.queries.reduce((s, q) => s + q.n, 0) || 1;
    const words = ((op.headline || '') + ' ' + op.tags.map((x) => x.t).join(' ')).toLowerCase();
    const mq = (q) => RN.data.market.queries.find((x) => x.q.toLowerCase() === q.toLowerCase());
    return `<section class="card sa-card">
      ${cardHd('Search terms that surfaced you', `What clients typed when your card appeared, ${esc(periodLabel(d))}`)}
      ${a.queries.length ? `<div class="tbl-wrap"><table class="tbl sa-terms sa-stack"><thead><tr><th>Search term</th><th class="r">Impressions</th><th class="sa-hide-s">Share</th><th class="r">Profile views</th><th class="r sa-hide-s">View rate</th><th>On your profile</th></tr></thead><tbody>
        ${a.queries.map((q) => {
          const inProfile = q.tags.length > 0 || words.includes(q.q.toLowerCase());
          const m = mq(q.q);
          const addTag = !inProfile && m && m.tags[0];
          return `<tr>
            <td><b>${quote(q.q)}</b>${q.live ? ' <span class="pill pill-good sa-pill-live">Live</span>' : ''}${q.tags.length ? `<span class="sa-terms-m">Matched ${q.tags.map(esc).join(', ')}</span>` : ''}</td>
            <td class="r" data-u="${q.n === 1 ? 'impression' : 'impressions'}">${fmt.int(q.n)}</td>
            <td class="sa-hide-s"><div class="sa-share"><div class="meter"><i style="width:${((q.n / total) * 100).toFixed(1)}%"></i></div><span class="tiny muted">${pct(q.n / total)}</span></div></td>
            <td class="r" data-u="${q.clicks === 1 ? 'profile view' : 'profile views'}">${fmt.int(q.clicks)}</td>
            <td class="r sa-hide-s">${pct(q.n ? q.clicks / q.n : 0, 1)}</td>
            <td>${inProfile ? `<span class="pill pill-good">${icon('check')}In your ${q.tags.length ? 'tags' : 'headline'}</span>` : addTag ? `<button type="button" class="act" data-act="sa-tag-add" data-t="${esc(addTag)}">${icon('plus')}Add ${esc(addTag)}</button>` : '<span class="pill sa-pill-none">Not in your tags</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>` : RN.ui.empty({ icon: 'search', title: 'No search terms yet', body: 'Terms appear once clients search and your card shows in the results.' })}
    </section>`;
  }

  function viewersCard(op, a, d) {
    const v = a.viewers.slice(0, 8);
    const hidden = a.viewers.length - v.length;
    const other = a.otherViewers + a.viewers.slice(8).reduce((s, x) => s + x.views + x.shortlists + x.compares, 0);
    const inRange = (x) => op.revenueRanges.includes(x.revenueRange) && op.employeeRanges.includes(x.employeeRange);
    return `<section class="card sa-card sa-viewers">
      ${cardHd('Who viewed you', 'Companies by industry, revenue and size. Groups with fewer than 5 visits are combined.')}
      ${v.length ? `<ul class="sa-segs">${v.map((x) => {
        const f = firmo(x);
        const isLive = liveEvents(op, d).some((e) => e.buyer && e.buyer.industry === x.industry && e.buyer.revenueRange === x.revenueRange);
        return `<li>
          <span class="sa-segs-ic">${icon('building')}</span>
          <div class="grow"><b>${esc(f.ind || 'Industry not given')}</b>${isLive ? ' <span class="pill pill-good sa-pill-live">Live</span>' : ''}<span class="sa-segs-m">${esc(f.rev || 'Revenue not given')} revenue · ${esc(f.emp || 'size not given')} employees</span></div>
          <div class="sa-segs-n"><span><b class="num">${x.views}</b> ${x.views === 1 ? 'view' : 'views'}</span>${x.shortlists ? `<span><b class="num">${x.shortlists}</b> ${x.shortlists === 1 ? 'shortlist' : 'shortlists'}</span>` : ''}${x.compares ? `<span><b class="num">${x.compares}</b> ${x.compares === 1 ? 'compare' : 'compares'}</span>` : ''}</div>
          <div class="sa-segs-r">${inRange(x) ? '<span class="pill pill-accent">In your ranges</span>' : '<span class="pill pill-line">Outside your ranges</span>'}<span class="tiny muted">${esc(fmt.ago(x.last))}</span></div>
        </li>`;
      }).join('')}</ul>` : `<div class="note info">${icon('lock')}<span>Every segment ${esc(periodLabel(d))} had fewer than 5 visits, so they are combined below. Switch to 30 or 90 days for more detail.</span></div>`}
      ${other ? `<div class="sa-segs-other">${icon('users')}<div class="grow"><b>Other companies</b><span class="sa-segs-m">${plural(other, 'visit')} from smaller segments${hidden ? ` and ${plural(hidden, 'more segment')}` : ''}, combined to protect client privacy</span></div></div>` : ''}
      <p class="sa-privacy">${icon('lock')}<span>Company and person names are never shown to operators. A client is named only after you are introduced, or when they open a proof link you sent them.</span></p>
    </section>`;
  }

  function mixCard(op, a) {
    const block = (title, rows, field, mine) => {
      const tot = rows.reduce((s, r) => s + r.n, 0) || 1;
      let list = rows;
      if (field === 'industries') { const top = rows.slice(0, 5); const rest = rows.slice(5).reduce((s, r) => s + r.n, 0); list = rest ? top.concat({ l: 'Other industries', n: rest, other: true }) : top; }
      else { const order = RN.fields[field].options.map((o) => o.v); list = rows.slice().sort((x, y) => order.indexOf(x.v) - order.indexOf(y.v)); }
      return `<div class="sa-mix"><h4 class="label">${esc(title)}</h4><ul class="sa-bars">${list.map((r) => meterRow(`${esc(r.l)}${!r.other && mine && mine.includes(r.v) ? ' <span class="sa-fit-you" title="You list this on your profile">You</span>' : ''}`, pct(r.n / tot), r.n / tot, { muted: r.other })).join('')}</ul></div>`;
    };
    return `<section class="card sa-card">
      ${cardHd('Audience mix', 'Share of views, shortlists and compares by company profile. “You” marks what your profile lists.')}
      <div class="sa-grid sa-grid-3">
        ${block('Industry', a.mix.industry, 'industries', op.industries)}
        ${block('Company revenue', a.mix.revenue, 'revenueRange', op.revenueRanges)}
        ${block('Employee range', a.mix.employees, 'employeeRange', op.employeeRanges)}
      </div>
    </section>`;
  }

  const EDGE_ACT = (edge) => {
    if (/available now/.test(edge)) return { l: 'Update availability', to: 'studio.profile' };
    if (/review/.test(edge)) return { l: 'Request a review', to: 'studio.credibility' };
    if (/verified fit tags/.test(edge)) return { l: 'Get tags verified', to: 'studio.credibility' };
    if (/rate/.test(edge)) return { l: 'See your rate position', to: 'studio.positioning' };
    if (/video/.test(edge)) return { l: 'Add an intro video', to: 'studio.profile' };
    if (/experience in/.test(edge)) return { l: 'Review your industries', to: 'studio.profile' };
    return { l: 'See positioning', to: 'studio.positioning' };
  };
  function lostCard(op, a) {
    const lost = a.lost;
    return `<section class="card sa-card">
      ${cardHd('Compared, not chosen', 'Operators a client picked after comparing them with you, and what they had that you do not. Batched, delayed 7 days, never with company names.')}
      ${lost.length ? `<div class="sa-lost">${lost.map((l) => {
        const actn = EDGE_ACT(l.edge[0]);
        const rateEdge = l.edge.some((x) => /rate/.test(x));
        return `<article class="sa-lost-c">
          <div class="row-nw" style="--gap:12px">${RN.ui.avatar(l.op, 'ava-sm')}<div class="grow"><a class="sa-lost-n" href="#op.${esc(l.op.slug)}">${esc(l.op.name)}</a><span class="tiny muted">Fractional ${esc(l.op.role)} · ${esc(l.op.ris.label)} ${esc(l.op.ris.score)}</span></div></div>
          <p class="small">${l.picked === 'shortlisted' ? `A client shortlisted ${esc(l.op.first)} over you` : `A client asked to meet ${esc(l.op.first)} instead of you`}${l.n > 1 ? `, ${l.n} times` : ''}.</p>
          <div class="sa-lost-e"><span class="label">What they had</span><div class="row" style="--gap:6px">${l.edge.map((e) => `<span class="pill pill-line">${esc(cap(e))}</span>`).join('')}</div></div>
          ${rateEdge ? '<p class="tiny muted">Rate is rarely the only reason. Check where you sit on the Rate Index before changing anything.</p>' : ''}
          <a class="btn btn-line btn-sm" href="#${actn.to}">${esc(actn.l)}${icon('arrow')}</a>
        </article>`;
      }).join('')}</div>` : RN.ui.empty({ icon: 'compare', title: 'No comparisons to learn from yet', body: 'When a client compares you with other operators and picks one of them, the difference shows here.' })}
    </section>`;
  }

  function howCard() {
    return `<details class="card sa-card sa-how">
      <summary><span class="h5">How we count</span>${icon('chev-down')}</summary>
      <dl>
        <div><dt>Search impression</dt><dd>Your card was at least half visible in a client's results for one second. Counted once per operator, per result list, per session.</dd></div>
        <div><dt>Profile view</dt><dd>Someone opened your profile. Repeat opens by the same person within 30 minutes count once.</dd></div>
        <div><dt>Shortlist appearance</dt><dd>A client saved you to a shortlist, or a client project ranked you in its top matches.</dd></div>
        <div><dt>What is excluded</dt><dd>Bots, the Revenue Nomad team, other operators and your own visits.</dd></div>
        <div><dt>Privacy</dt><dd>Viewers are shown by industry, company revenue and employee range, using the same picklists as your profile. Groups under 5 visits are combined. Company names are never shown.</dd></div>
      </dl>
    </details>`;
  }

  /* =====================================================================
     POSITIONING
     ===================================================================== */
  function renderPositioning(op) {
    resetSlots();
    const d = days();
    const pos = RN.model.positioning(op.id);
    const a = A(op, d);
    return `<div class="sa sa-pos">
      ${head('Positioning', 'Where you stand against the market, and one action for each gap.', seg())}
      ${rateCard(op, pos)}
      ${oppsCard(op, pos)}
      <div class="sa-grid sa-grid-2">
        ${unmetCard(op)}
        ${fitCard(op, a, d)}
      </div>
      ${headlineCard(op, a)}
    </div>`;
  }

  function rateCard(op, pos) {
    const idx = pos.idx;
    const cat = RN.fields.catLabel(op.catKey);
    if (!pos.rate) {
      return `<section class="card sa-card">${cardHd('Your rate vs the Rate Index', `${esc(cat)} · ${fmt.int(idx.n)} operators`)}
        ${RN.ui.empty({ icon: 'clock', title: 'Add your hourly rate to see where you stand', body: `The ${cat} median is ${fmt.usd(idx.p50)}/hr, with the middle half between ${fmt.usd(idx.p25)} and ${fmt.usd(idx.p75)}. Clients filter by budget, so profiles without a rate drop out of those searches.`, cta: `<a class="btn btn-sm" href="#studio.profile">Add your rate</a>` })}</section>`;
    }
    const rate = pos.rate;
    const lo = Math.floor(Math.min(idx.p25 * 0.72, rate * 0.9) / 10) * 10;
    const hi = Math.ceil(Math.max(idx.p75 * 1.22, rate * 1.1) / 10) * 10;
    const x = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
    const where = rate < idx.p25 ? 'below the middle half' : rate > idx.p75 ? 'above the middle half' : 'inside the middle half';
    const mult = RN.data.market.rateIndex.byRevenue;
    const revRows = (op.revenueRanges.length ? op.revenueRanges : ['5m_20m']).map((r) => ({ r, l: lab('revenueRange', r), v: Math.round((idx.p50 * (mult[r] || 1)) / 5) * 5 }));
    // Win rate by rate band (illustrative): intro-to-engagement, flat through the middle bands
    const step = 50;
    const start = Math.floor(idx.p25 / step) * step;
    const bands = [{ lo: 0, hi: start, l: `<${fmt.usd(start)}` }];
    for (let b = start; b < start + step * 3; b += step) bands.push({ lo: b, hi: b + step, l: `${fmt.usd(b)}–${b + step - 1}` });
    bands.push({ lo: start + step * 3, hi: Infinity, l: `${fmt.usd(start + step * 3)}+` });
    const rnd = RN.rng('winrate-' + op.catKey);
    bands.forEach((b) => { const mid = b.hi === Infinity ? b.lo + 25 : b.lo === 0 ? b.hi - 25 : (b.lo + b.hi) / 2; b.v = Math.round(26 - (Math.abs(mid - idx.p50) / 50) * 2.2 + (rnd() - 0.5) * 2); b.mine = rate >= b.lo && rate < b.hi; });
    const myBand = bands.find((b) => b.mine);
    const best = Math.max(...bands.map((b) => b.v));
    return `<section class="card sa-card sa-rate">
      ${cardHd('Your rate vs the Rate Index', `${esc(cat)} · ${fmt.int(idx.n)} operators · hourly`, `<a class="act" href="#rates">Rate Index${icon('arrow')}</a>`)}
      <div class="sa-rate-g">
        <div>
          <div class="sa-rate-big"><span class="num">${fmt.usd(rate)}</span><span class="muted">/hr</span></div>
          <p class="small">Higher than about <b>${pos.pctile}%</b> of ${esc(cat)} operators, ${esc(where)}.</p>
          <div class="sa-range" role="img" aria-label="Your rate ${fmt.usd(rate)} against 25th ${fmt.usd(idx.p25)}, median ${fmt.usd(idx.p50)} and 75th percentile ${fmt.usd(idx.p75)}">
            <div class="sa-range-track">
              <i class="sa-range-band" style="left:${x(idx.p25)}%;width:${x(idx.p75) - x(idx.p25)}%"></i>
              <i class="sa-range-mid" style="left:${x(idx.p50)}%"></i>
              <b class="sa-range-you" style="left:${x(rate)}%"><span style="--shift:${x(rate) < 12 ? '0%' : x(rate) > 88 ? '-100%' : '-50%'}">You</span></b>
            </div>
            <div class="sa-range-ticks">
              <span style="left:${x(idx.p25)}%"><b>${fmt.usd(idx.p25)}</b>25th</span>
              <span style="left:${x(idx.p50)}%"><b>${fmt.usd(idx.p50)}</b>Median</span>
              <span style="left:${x(idx.p75)}%"><b>${fmt.usd(idx.p75)}</b>75th</span>
            </div>
          </div>
          <div class="sa-rate-rev"><span class="label">Median by client revenue, in your ranges</span>
            <ul>${revRows.map((r) => `<li><span>${esc(r.l)}</span><b class="num">${fmt.usd(r.v)}/hr</b></li>`).join('')}</ul>
          </div>
        </div>
        <div>
          <div class="sa-sub-h"><b>Intro-to-engagement rate by rate band</b>${illus()}</div>
          ${slot((w) => RN.chart.columns(bands.map((b) => ({ label: b.l, value: b.v, hi: b.mine })), { w, h: 200, fmt: (n) => n + '%', max: 35, label: 'Intro to engagement rate by rate band' }), '', 200)}
          <p class="small sa-rate-take">${icon('info')}<span>${myBand ? `In your band, ${myBand.v}% of intros became engagements${myBand.v >= best - 2 ? ', level with the best band' : ''}.` : ''} Rate is not what separates operators here: verified reviews are. Operators with 3+ verified reviews are rehired 2.4x as often.</span></p>
        </div>
      </div>
    </section>`;
  }

  function oppsCard(op, pos) {
    const opps = pos.opps;
    return `<section class="card sa-card">
      ${cardHd('Focus-area opportunities', `Client demand vs operators with the focus area verified, in ${esc(RN.fields.catLabel(op.catKey))} and your tags`)}
      <div class="tbl-wrap"><table class="tbl sa-opps sa-stack"><thead><tr><th>Focus area</th><th class="r">Searches / mo</th><th class="r sa-hide-s">Verified operators</th><th>You</th><th></th></tr></thead><tbody>
        ${opps.map((o) => {
          const act = !o.have ? `<button type="button" class="btn btn-line btn-sm" data-act="sa-tag-add" data-t="${esc(o.t)}">${icon('plus')}Add tag</button>`
            : o.tier === 'claimed' ? `<a class="btn btn-line btn-sm" href="#studio.credibility">Get it verified</a>`
            : `<button type="button" class="act" data-act="sa-scroll" data-to="sa-headlines">Use in headline${icon('arrow')}</button>`;
          const note = o.have && o.tier !== 'claimed' && o.verified <= 1 ? 'Only you have it verified' : !o.verified && o.supply >= 3 ? `${fmt.int(o.supply)} claim it, none verified` : !o.verified ? 'No verified operators yet' : '';
          return `<tr>
            <td><b>${esc(o.t)}</b><span class="sa-terms-m">${esc(RN.fields.catLabel(o.c) || '')}${note ? ` · <span class="sa-hot">${esc(note)}</span>` : ''}${note ? '' : `<span class="sa-show-s"> · ${plural(o.verified, 'verified operator')}</span>`}</span></td>
            <td class="r" data-u="searches / mo">${fmt.int(o.demand)}</td>
            <td class="r sa-hide-s">${fmt.int(o.verified)}<span class="tiny muted"> of ${fmt.int(o.supply)}</span></td>
            <td>${youPill(o.have ? o.tier : null)}</td>
            <td class="r">${act}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="tiny muted" style="margin-top:12px">Added tags show as Claimed until a client review verifies them. Searches are illustrative monthly volumes.</p>
    </section>`;
  }

  function unmetCard(op) {
    const mk = RN.model.market();
    const zero = mk.zero.slice().sort((x, y) => (y.cat === op.catKey) - (x.cat === op.catKey));
    return `<section class="card sa-card">
      ${cardHd('Unmet searches', 'Clients searched and no operator matched. Demand you could serve.')}
      ${zero.length ? `<ul class="sa-unmet">${zero.map((z) => {
        const mineInd = z.industry && op.industries.includes(z.industry);
        const inCat = z.cat === op.catKey;
        const hint = inCat && mineInd ? `You list ${ind(z.industry)}. Name it in your headline so this search finds you.` : inCat ? 'In your category. If you have done this work, add the matching tag.' : `Outside ${RN.fields.catLabel(op.catKey)}. Shown so you can see where demand is going.`;
        return `<li class="${inCat ? '' : 'is-muted'}">
          <span class="sa-feed-ic">${icon('flag')}</span>
          <div class="grow"><b>${quote(z.q)}</b>${z.live ? ' <span class="pill pill-good sa-pill-live">Live</span>' : ''}
            <span class="sa-terms-m">${z.cat ? esc(RN.fields.catLabel(z.cat)) + ' · ' : ''}${z.live ? 'Searched just now' : plural(z.vol, 'search', 'searches') + ' this month'}</span>
            <p class="small">${esc(hint)}</p></div>
          ${inCat && mineInd ? `<button type="button" class="btn btn-line btn-sm" data-act="sa-scroll" data-to="sa-headlines">Headline ideas</button>` : inCat ? `<a class="btn btn-line btn-sm" href="#studio.profile">Edit tags</a>` : ''}
        </li>`;
      }).join('')}</ul>` : RN.ui.empty({ icon: 'check-circle', title: 'Every search found someone', body: 'When a client search returns no operators, it shows here.' })}
    </section>`;
  }

  function fitCard(op, a, d) {
    const block = (field, mix, mine, noun) => {
      const tot = mix.reduce((s, r) => s + r.n, 0) || 1;
      const opts = RN.fields[field].options.filter((o) => mix.some((r) => r.v === o.v) || mine.includes(o.v));
      const rows = opts.map((o) => ({ v: o.v, l: o.l, n: (mix.find((r) => r.v === o.v) || { n: 0 }).n, mine: mine.includes(o.v) }));
      const outside = rows.filter((r) => !r.mine).reduce((s, r) => s + r.n, 0) / tot;
      const biggestOut = rows.filter((r) => !r.mine).sort((x, y) => y.n - x.n)[0];
      return { html: `<div class="sa-fit"><h4 class="label">${esc(RN.fields[field].label)}</h4><ul class="sa-bars">${rows.map((r) => meterRow(`${esc(r.l)}${r.mine ? ' <span class="sa-fit-you">You</span>' : ''}`, pct(r.n / tot), r.n / tot, { muted: !r.mine })).join('')}</ul></div>`, outside, biggestOut, noun };
    };
    const rev = block('revenueRange', a.mix.revenue, op.revenueRanges, 'revenue');
    const emp = block('employeeRange', a.mix.employees, op.employeeRanges, 'employees');
    const worst = [rev, emp].sort((x, y) => y.outside - x.outside)[0];
    const insight = worst.outside >= 0.2 && worst.biggestOut
      ? `${pct(worst.outside)} of the companies that looked at you ${esc(periodLabel(d))} sit outside your listed ${worst.noun === 'revenue' ? 'revenue' : 'employee'} ranges, most often ${esc(worst.biggestOut.l)}${worst.noun === 'employees' ? ' employees' : ''}. If you have done that work, list it.`
      : 'The companies that look at you match the ranges you list.';
    return `<section class="card sa-card">
      ${cardHd('Your fit vs who views you', 'Ranges you list (You) vs the companies that viewed, shortlisted or compared you')}
      <div class="sa-grid sa-grid-2 sa-fit-g">${rev.html}${emp.html}</div>
      <div class="note info sa-fit-note">${icon('target')}<div><span>${insight}</span> ${worst.outside >= 0.2 ? '<a class="link" href="#studio.profile">Update your ranges</a>' : ''}</div></div>
    </section>`;
  }

  /* Headline suggestions grounded in the terms that surface the operator (max 110 characters, the field limit).
     Each template tries its longest variant first and drops items until it fits. */
  function headlines(op, a) {
    const max = (RN.fields.headline && RN.fields.headline.maxlength) || 110;
    const role = `Fractional ${op.role}`;
    const roleL = op.role.toLowerCase();
    const terms = a.queries.filter((q) => !/^fractional /i.test(q.q) && !q.q.toLowerCase().includes(roleL)).map((q) => q.q);
    const verified = op.tags.filter((x) => x.tier !== 'claimed').map((x) => x.t);
    const hot = RN.model.positioning(op.id).opps.filter((o) => o.have && o.tier !== 'claimed').map((o) => o.t);
    const lead = hot.concat(verified.filter((x) => !hot.includes(x)));
    const revs = op.revenueRanges.map((r) => lab('revenueRange', r));
    let span = '';
    if (revs.length === 1) span = revs[0];
    else if (revs.length > 1 && revs[0].includes('–')) {
      const last = revs[revs.length - 1];
      span = last.includes('–') ? `${revs[0].split('–')[0]}–${last.split('–')[1]}` : `${revs[0].split('–')[0]}+`;
    }
    const inds = op.industries.slice(0, 2).map(ind);
    const list = (arr) => (arr.length > 1 ? arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1] : arr[0] || '');
    const fits = (build, n) => { for (let k = n; k >= 1; k--) { const h = build(k).replace(/\s+/g, ' ').trim(); if (h.length <= max) return h; } return ''; };
    const founder = terms.find((x) => /founder/i.test(x));
    const cands = [
      terms.length && { h: fits((k) => `${role} for ${span || list(inds)} companies: ${list(terms.slice(0, Math.min(k, 2)))}`, 2), why: terms.slice(0, 2) },
      founder && lead.length && { h: fits((k) => `I take ${inds[0] || 'B2B'} teams from founder-led sales to a repeatable motion: ${list(lead.slice(0, k))}`, 3), why: [founder, lead[0]] },
      lead.length && { h: fits((k) => `${role} · ${lead.slice(0, k).join(' · ')} · Client-verified`, 3), why: [a.queries[0] && a.queries[0].q].filter(Boolean).concat(lead.slice(0, 1)) },
      lead.length > 1 && { h: fits((k) => `${role}. ${list(lead.slice(0, k))} for ${span || 'growing'} companies`, 2), why: lead.slice(0, 2) },
    ].filter((c) => c && c.h && c.h.length > 30 && c.h !== op.headline);
    const seenH = new Set();
    return cands.filter((c) => (seenH.has(c.h) ? false : seenH.add(c.h))).slice(0, 3).map((c) => ({
      h: c.h,
      why: c.why.filter(Boolean).map((w) => { const q = a.queries.find((x) => x.q === w); return q ? `${quote(q.q)} (${fmt.int(q.n)} searches)` : `${esc(w)} (verified)`; }),
    }));
  }
  function headlineCard(op, a) {
    const list = headlines(op, a);
    const orig = (seen().saHeadlineOrig || {})[op.id];
    return `<section class="card sa-card sa-heads" id="sa-headlines">
      ${cardHd('Headline suggestions', 'Your headline is the first line clients read in search. These use the words clients actually typed.', '<span class="pill pill-info">Suggestions</span>')}
      <div class="sa-heads-cur"><span class="label">Your headline now</span><p class="serif-up">${op.headline ? esc(op.headline) : '<span class="muted">No headline yet</span>'}</p>${orig != null && orig !== op.headline ? `<button type="button" class="act" data-act="sa-headline-undo">${icon('refresh')}Restore previous</button>` : ''}</div>
      ${list.length ? `<ol class="sa-heads-l">${list.map((c, i) => `<li>
          <span class="sa-rank num">${String.fromCharCode(65 + i)}</span>
          <div class="grow"><p class="sa-heads-h">${esc(c.h)}</p><p class="tiny muted">${c.h.length} of 110 characters${c.why.length ? ' · uses ' + c.why.join(', ') : ''}</p></div>
          <div class="sa-heads-a"><button type="button" class="btn btn-line btn-sm" data-act="sa-headline" data-h="${esc(c.h)}">Use this</button><button type="button" class="btn btn-ghost btn-sm btn-icon" data-act="sa-copy" data-copy="${esc(c.h)}" aria-label="Copy headline">${icon('copy')}</button></div>
        </li>`).join('')}</ol>` : RN.ui.empty({ icon: 'edit', title: 'No suggestions yet', body: 'Suggestions appear once clients search terms that match your tags.' })}
      <p class="tiny muted" style="margin-top:12px">Suggestions are drafts. Edit the wording in your profile so it sounds like you.</p>
    </section>`;
  }

  /* =====================================================================
     SEARCH AND AI VISIBILITY
     ===================================================================== */
  const profileUrl = (op) => `https://www.revenuenomad.com/operators/${op.slug}`;
  function indexing(op) {
    const fresh = op.avail.startDate && (nowMs() - t(op.avail.startDate)) / DAY < 30;
    const checks = [
      { l: 'About section of 300+ characters', ok: (op.bio || '').length >= 300 },
      { l: '3 or more fit tags', ok: op.tags.length >= 3 },
      { l: 'Availability confirmed in the last 30 days', ok: !!fresh },
    ];
    return { checks, ok: checks.every((c) => c.ok) };
  }
  function googleQueries(op) {
    const rand = RN.rng('gsc-' + op.id);
    const role = op.role.toLowerCase();
    const state = (op.location || '').split(',').pop().trim().toLowerCase();
    const inds = op.industries.slice(0, 2).map((i) => ind(i).toLowerCase());
    const verified = op.tags.filter((x) => x.tier !== 'claimed').map((x) => x.t.toLowerCase());
    const rows = [
      [op.name.toLowerCase(), 1.1, 150, 0.34],
      [`${op.name.toLowerCase()} ${role}`, 1.3, 55, 0.4],
      state && [`fractional ${role} ${state}`, 4.6, 130, 0.07],
      inds[0] && [`fractional ${role} ${inds[0]}`, 7.9, 260, 0.03],
      inds[1] && [`fractional sales leader ${inds[1]}`, 9.4, 180, 0.022],
      verified[0] && [`${verified[0]} consultant`, 11.2, 210, 0.014],
      [`${(A(op, 30).queries[1] || A(op, 30).queries[0] || { q: 'fractional ' + role }).q.toLowerCase()}`, 14.8, 320, 0.009],
    ].filter(Boolean);
    return rows.map(([q, p, imp, ctr]) => { const i = Math.round(imp * (0.75 + rand() * 0.5)); return { q, pos: +(p * (0.9 + rand() * 0.2)).toFixed(1), imp: i, clicks: Math.max(0, Math.round(i * ctr * (0.8 + rand() * 0.4))) }; });
  }
  function aeo(op) {
    return memo('aeo|' + op.id, () => {
      const engines = RN.data.market.aiEngines, prompts = RN.data.market.aiPrompts;
      const strength = 0.05 + (op.ris.score - 50) / 150 + op.completeness / 800 + Math.min(0.08, op.reviews.length * 0.03);
      const bias = [1, 1.15, 0.8, 0.95, 0.75];
      const rows = prompts.map((p, i) => {
        const adjacent = op.tags.some((x) => x.c === p.cat && x.tier !== 'claimed');
        const rel = (p.cat === op.catKey ? 1 : adjacent ? 0.3 : 0) * (p.industry ? (op.industries.includes(p.industry) ? 1.3 : 0.4) : 1);
        const cells = engines.map((e, j) => {
          const gen = RN.rng(`aeo|${op.id}|${i}|${j}`); gen(); const r = gen();
          const pm = RN.clamp(strength * rel * bias[j], 0, 0.9);
          return r < pm * 0.45 ? 'cited' : r < pm ? 'mentioned' : 'none';
        });
        const now = cells.filter((c) => c !== 'none').length;
        const tr = RN.rng(`aeo-tr|${op.id}|${i}`);
        const trend = [3, 2, 1].map((k) => RN.clamp(Math.round(now - k * 0.35 + (tr() - 0.5) * 1.6), 0, engines.length)).concat(now);
        return { p, cells, trend, now };
      });
      const runs = rows.length * engines.length;
      const mentioned = rows.reduce((s, r) => s + r.cells.filter((c) => c !== 'none').length, 0);
      const cited = rows.reduce((s, r) => s + r.cells.filter((c) => c === 'cited').length, 0);
      const byEngine = engines.map((e, j) => ({ e, n: rows.filter((r) => r.cells[j] !== 'none').length }));
      return { engines, rows, runs, mentioned, cited, byEngine };
    });
  }
  function jsonLd(op) {
    const url = profileUrl(op);
    const [city, region] = (op.location || '').split(',').map((s) => s.trim());
    const verified = op.tags.filter((x) => x.tier !== 'claimed').map((x) => x.t);
    const claimed = op.tags.filter((x) => x.tier === 'claimed').map((x) => x.t);
    const avg = op.reviews.length ? op.reviews.reduce((s, r) => s + (+r.overall || 0), 0) / op.reviews.length : null;
    const graph = [
      { '@type': 'ProfilePage', '@id': url + '#page', url, name: `${op.name}, Fractional ${op.role}`, mainEntity: { '@id': url + '#person' }, isPartOf: { '@type': 'WebSite', name: 'Revenue Nomad', url: 'https://www.revenuenomad.com' } },
      Object.assign({ '@type': 'Person', '@id': url + '#person', name: op.name, jobTitle: `Fractional ${op.role}`, description: op.headline || undefined, image: op.photo ? `https://www.revenuenomad.com/${op.photo}` : undefined },
        city ? { address: { '@type': 'PostalAddress', addressLocality: city, addressRegion: region || undefined, addressCountry: 'US' } } : {},
        { knowsAbout: verified.concat(claimed).slice(0, 12), memberOf: { '@type': 'Organization', name: 'Revenue Nomad', url: 'https://www.revenuenomad.com' } }),
      Object.assign({ '@type': 'ProfessionalService', '@id': url + '#service', name: `${op.name}, Fractional ${op.role}`, url, provider: { '@id': url + '#person' }, serviceType: `Fractional ${RN.fields.catLabel(op.catKey)}`, areaServed: 'US' },
        op.rate ? { priceRange: `$${op.rate}/hr` } : {},
        avg ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: +avg.toFixed(2), reviewCount: op.reviews.length, bestRating: 5 } } : {}),
    ];
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  }
  const GLYPH = { cited: ['seal', 'Cited', 'Your profile page is a cited source'], mentioned: ['check-circle', 'Mentioned', 'You are named in the answer'], none: ['minus', 'Not yet', 'Not in the answer yet'] };

  function renderSeo(op) {
    resetSlots();
    const url = profileUrl(op);
    const ix = indexing(op);
    const g = googleQueries(op);
    const gi = g.reduce((s, r) => s + r.imp, 0), gc = g.reduce((s, r) => s + r.clicks, 0);
    const ai = aeo(op);
    const inds = op.industries.slice(0, 2).map(ind);
    const title = `${op.name}: Fractional ${op.role}${inds.length ? ' for ' + inds.join(' and ') : ''} | Revenue Nomad`;
    const verifiedN = op.tags.filter((x) => x.tier !== 'claimed').length;
    const desc = `${op.headline ? op.headline + ' ' : ''}${verifiedN} client-verified focus areas. Reputation Index ${op.ris.score}. ${op.avail.label}.`;
    const weekly = (() => { const r = RN.rng('gsc-w-' + op.id); return Array.from({ length: 12 }, (_, i) => Math.round((gc / 4) * (0.7 + i * 0.03 + r() * 0.3))); })();
    return `<div class="sa sa-seo">
      ${head('Search and AI visibility', 'How findable your profile is on Google and in AI answers, and what raises it.')}
      <section class="card sa-card sa-url">
        <div class="sa-url-g">
          <div class="grow">
            <span class="label">Your public profile</span>
            <div class="sa-url-row"><code class="mono sa-url-v">${esc(url.replace('https://www.', ''))}</code>
              <button type="button" class="btn btn-line btn-sm" data-act="sa-copy" data-copy="${esc(url)}">${icon('copy')}Copy</button>
              <a class="btn btn-ghost btn-sm" href="#op.${esc(op.slug)}">${icon('eye')}Open</a></div>
            <div class="row" style="--gap:8px;margin-top:12px">
              ${ix.ok ? `<span class="pill pill-good">${icon('check-circle')}Indexable</span>` : `<span class="pill pill-warn">${icon('info')}Not indexed yet</span>`}
              <span class="pill pill-good">${icon('check')}In sitemap</span>
              <span class="pill pill-good">${icon('check')}Open to search and answer crawlers</span>
            </div>
            ${ix.ok ? '' : `<p class="small" style="margin-top:10px">Profiles are indexed once they pass the quality bar: ${ix.checks.filter((c) => !c.ok).map((c) => esc(c.l)).join(', ')}.</p>`}
          </div>
          <div class="sa-serp" aria-label="How your profile can look in Google results">
            <span class="tiny muted">Search result preview</span>
            <span class="sa-serp-u">revenuenomad.com › operators › ${esc(op.slug)}</span>
            <span class="sa-serp-t">${esc(title.length > 64 ? title.slice(0, 61) + '...' : title)}</span>
            <span class="sa-serp-d">${esc(desc.length > 158 ? desc.slice(0, 155) + '...' : desc)}</span>
          </div>
        </div>
      </section>

      <div class="sa-grid sa-grid-seo">
        <section class="card sa-card">
          ${cardHd('Google searches that showed your profile', 'Last 28 days, from Search Console for your profile URL', illus())}
          <div class="sa-gsc-k">
            <div><span class="label">Impressions</span><b class="num">${fmt.int(gi)}</b></div>
            <div><span class="label">Clicks</span><b class="num">${fmt.int(gc)}</b></div>
            <div class="grow"><span class="label">Clicks, 12 weeks</span>${slot((w) => RN.chart.spark(weekly, { w, h: 32, label: 'Weekly clicks from Google' }), '', 32)}</div>
          </div>
          <div class="tbl-wrap"><table class="tbl sa-gsc"><thead><tr><th>Query</th><th class="r">Impressions</th><th class="r">Clicks</th><th class="r sa-hide-s">Avg. position</th></tr></thead><tbody>
            ${g.map((r) => `<tr><td>${esc(r.q)}</td><td class="r">${fmt.int(r.imp)}</td><td class="r">${fmt.int(r.clicks)}</td><td class="r sa-hide-s">${r.pos}</td></tr>`).join('')}
          </tbody></table></div>
        </section>
        <section class="card sa-card">
          ${cardHd('What raises it', 'Evidence answer engines and Google can quote')}
          ${raiseList(op)}
        </section>
      </div>

      <section class="card sa-card sa-aeo">
        ${cardHd('AI answer engines', `The questions clients ask AI, run weekly on ${ai.engines.length} engines. 4-week view.`, illus())}
        <div class="sa-aeo-k">
          <div><b class="num">${ai.mentioned}</b><span>of ${ai.runs} answers name you</span></div>
          <div><b class="num">${ai.cited}</b><span>cite your profile as a source</span></div>
          <div class="sa-aeo-eng">${ai.byEngine.map((x) => `<span><b>${esc(x.e)}</b> ${x.n} of ${ai.rows.length}</span>`).join('')}</div>
        </div>
        <div class="sa-matrix" role="table" aria-label="AI answers by prompt and engine">
          <div class="sa-mx-row sa-mx-hd" role="row"><span role="columnheader">Prompt</span>${ai.engines.map((e) => `<span role="columnheader" title="${esc(e)}">${esc(e.replace('Google AI Overviews', 'AI Overviews'))}</span>`).join('')}<span role="columnheader">4 weeks</span></div>
          ${ai.rows.map((r) => `<div class="sa-mx-row" role="row">
            <span class="sa-mx-p" role="cell">${esc(r.p.p)}${r.p.cat !== op.catKey ? '<em>Outside your category</em>' : ''}</span>
            ${r.cells.map((c, j) => `<span class="sa-mx-c is-${c}" role="cell" title="${esc(ai.engines[j])}: ${GLYPH[c][2]}"><span class="sa-mx-e">${esc(ai.engines[j].replace('Google AI Overviews', 'Google AI'))}</span>${icon(GLYPH[c][0])}<span class="sa-mx-l">${GLYPH[c][1]}</span></span>`).join('')}
            <span class="sa-mx-t" role="cell">${slot((w) => RN.chart.spark(r.trend, { w: Math.min(w, 88), h: 24, label: '4-week trend', dot: true }), '', 24)}<span class="tiny muted">${r.now} of ${ai.engines.length}</span></span>
          </div>`).join('')}
        </div>
        <div class="sa-legend">${['cited', 'mentioned', 'none'].map((k) => `<span class="is-${k}">${icon(GLYPH[k][0])}${GLYPH[k][1]}: ${GLYPH[k][2].toLowerCase()}</span>`).join('')}</div>
        <p class="tiny muted" style="margin-top:12px">Answers change from run to run, so we show 4-week results. Nobody can promise a placement in an AI answer; specific, verified evidence is what gets quoted.</p>
      </section>

      <div class="sa-grid sa-grid-2">
        <section class="card sa-card">
          ${cardHd('Structured data', 'What search and answer engines read from your profile page')}
          <ul class="sa-schema">
            <li>${icon('check-circle')}<span><b>Person</b> with job title, location and ${plural(Math.min(12, op.tags.length), 'focus area')}</span></li>
            <li>${icon('check-circle')}<span><b>ProfessionalService</b> with ${op.rate ? 'rate' : 'no rate'}${op.reviews.length ? ` and a rating from ${plural(op.reviews.length, 'review')}` : ''}</span></li>
            <li class="is-warn">${icon('info')}<span><b>LinkedIn link (sameAs)</b> missing. It tells engines this profile and your LinkedIn are the same person. <a class="link" href="#studio.profile">Add it</a></span></li>
            <li class="is-mute">${icon('info')}<span>Google does not show review stars for a person. The rating still helps AI answers.</span></li>
          </ul>
          <div class="sa-pre-hd"><span class="label">JSON-LD on your profile page</span><button type="button" class="act" data-act="sa-copy" data-copy-from="#sa-jsonld">${icon('copy')}Copy</button></div>
          <pre class="sa-pre mono" id="sa-jsonld" tabindex="0">${esc(jsonLd(op))}</pre>
        </section>
        ${topicsCard(op)}
      </div>
    </div>`;
  }

  function raiseList(op) {
    const a = A(op, 30);
    const top = a.queries[0];
    const head = (op.headline || '').toLowerCase();
    const headHits = a.queries.slice(0, 5).some((q) => q.q.toLowerCase().split(' ').filter((w) => w.length > 4 && w !== 'fractional').some((w) => head.includes(w)));
    const verifiedEng = op.engagements.some((e) => e.clientVerified);
    const items = [
      { l: 'A client-verified engagement with an outcome number', ok: verifiedEng, to: 'studio.credibility', cta: 'Ask a client to confirm', why: 'Pages with specific, verified outcomes are the ones AI answers quote.' },
      { l: '3 or more client reviews with quotes', ok: op.reviews.length >= 3, to: 'studio.credibility', cta: 'Request a review', why: `You have ${op.reviews.length}. Review text is indexed on your profile.` },
      { l: 'Headline uses the words clients search', ok: headHits, to: 'studio.positioning', cta: 'See headline ideas', why: top ? `Your top term is ${quote(top.q)}.` : '' },
      { l: 'About section names the stage and the problem', ok: (op.bio || '').length >= 400, to: 'studio.profile', cta: 'Edit About', why: 'Long-form text feeds Google and AI answer engines.' },
      { l: 'LinkedIn profile linked', ok: false, to: 'studio.profile', cta: 'Add LinkedIn', why: 'Connects your profile to the same person elsewhere on the web.' },
      { l: 'A bylined answer in Guides', ok: false, to: 'guides', cta: 'Browse questions', why: 'Answers link back to your profile and get cited on their own.' },
    ];
    const done = items.filter((x) => x.ok).length;
    return `<div class="sa-raise-k"><div class="meter"><i style="width:${(done / items.length) * 100}%"></i></div><span class="small"><b>${done} of ${items.length}</b> in place</span></div>
      <ul class="sa-raise">${items.map((x) => `<li class="${x.ok ? 'is-ok' : ''}">
        <span class="sa-raise-ic">${icon(x.ok ? 'check-circle' : 'plus')}</span>
        <div class="grow"><b>${esc(x.l)}</b>${x.why ? `<span class="tiny muted">${x.why}</span>` : ''}</div>
        ${x.ok ? '<span class="pill pill-good">Done</span>' : `<a class="act" href="#${esc(x.to)}">${esc(x.cta)}${icon('arrow')}</a>`}
      </li>`).join('')}</ul>`;
  }

  /* Guides from the research registry (RN.research.guides) in the operator's category, with placeholders if it is not loaded */
  function guideLinks(op) {
    const list = ((RN.research && RN.research.guides) || []).filter((g) => g && g.slug && g.q && g.cat === op.catKey).slice(0, 2);
    if (list.length) return list.map((g, i) => ({ to: 'guide.' + g.slug, ic: 'book', t: g.q, m: i ? 'Guide, featured operators module' : 'Guide, cites the Rate Index' }));
    const role = op.role.toLowerCase().replace(/\s+/g, '-');
    return [{ to: `guide.fractional-${role}-cost`, ic: 'book', t: `How much does a fractional ${op.role} cost?`, m: 'Guide, cites the Rate Index' }];
  }
  function topicsCard(op) {
    const rand = RN.rng('topics-' + op.id);
    const cat = RN.fields.catLabel(op.catKey);
    const verified = op.tags.filter((x) => x.tier !== 'claimed');
    const pages = [
      { to: `browse.${op.catKey}`, ic: 'grid', t: `Fractional ${cat} operators`, m: 'Category page, ranked by match and Reputation Index' },
      ...guideLinks(op),
      verified[0] && { to: 'library', ic: 'layers', t: `Fit Tag Library: ${verified[0].t}`, m: 'Listed as client-verified' },
      { to: 'framework', ic: 'radar', t: 'GTM Framework: Build the team, Win deals', m: 'Operators strong in these areas' },
      { to: 'rates', ic: 'chart', t: `Rate Index: ${cat}`, m: 'Your rate is part of the benchmark' },
    ].filter(Boolean).map((p) => Object.assign(p, { n: Math.round(40 + rand() * 260) }));
    return `<section class="card sa-card">
      ${cardHd('Topic pages you appear on', 'Pages on Revenue Nomad that feature or link to your profile, last 30 days', illus())}
      <ul class="sa-topics">${pages.map((p) => `<li><a href="#${esc(p.to)}"><span class="sa-feed-ic">${icon(p.ic)}</span><span class="grow"><b>${esc(p.t)}</b><span class="tiny muted">${esc(p.m)}</span></span><span class="sa-topics-n"><b class="num">${fmt.int(p.n)}</b><span class="tiny muted">impressions</span></span></a></li>`).join('')}</ul>
      <p class="tiny muted" style="margin-top:12px">Featured spots rotate among operators who meet published evidence rules. They cannot be bought.</p>
    </section>`;
  }

  /* =====================================================================
     Actions (all prefixed sa-)
     ===================================================================== */
  RN.actions['sa-days'] = (el) => { setSeen('studioDays', +el.dataset.d); RN.rerender(); };
  RN.actions['sa-more'] = (el) => { const k = el.dataset.k; showAll[k] = !showAll[k]; RN.rerender(); };
  RN.actions['sa-read'] = () => { setSeen('saActivitySeen', RN.now().toISOString()); RN.rerender(); RN.ui.toast('All caught up'); };
  RN.inputs['sa-demand-rev'] = (el) => { setSeen('saDemandRev', el.value || ''); showAll.demand = false; RN.rerender(); };
  RN.actions['sa-demand-clear'] = () => { setSeen('saDemandRev', ''); RN.rerender(); };
  RN.inputs['sa-digest-toggle'] = (el) => {
    setSeen('saDigestOff', !el.checked);
    RN.ui.toast(el.checked ? 'Weekly digest on. Next one arrives Monday at 8am.' : 'Weekly digest paused', { icon: 'mail' });
    RN.rerender();
  };
  RN.actions['sa-digest-send'] = () => {
    const op = RN.myOp();
    const g = digest(op);
    const body = [].concat(g.lines, g.action ? ['', `One thing to do: ${HEADING[g.action.k] || g.action.l}. ${g.action.gain}.`] : [], ['', 'Market pulse:'], g.pulse, ['', 'Open Studio to see who viewed you and why.']).join('\n');
    RN.mail(op.name, g.subject, body, 'digest');
    RN.track('studio_action', { opId: op.id, action: 'digest_send' });
    RN.ui.toast('Digest sent to your outbox', { icon: 'mail', action: { label: 'Open outbox', act: 'outbox' } });
  };
  RN.actions['sa-scroll'] = (el) => {
    const target = document.getElementById(el.dataset.to);
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); target.classList.add('sa-flash'); setTimeout(() => target.classList.remove('sa-flash'), 1400); }
    else RN.go('studio.positioning');
  };

  /* One-click tag add: writes the same edits record the Profile tab uses (RN.store.state.edits[opId].addTags) */
  RN.actions['sa-tag-add'] = (el) => {
    const op = RN.myOp();
    const tag = el.dataset.t;
    if (!tag) return;
    if (op.tags.some((x) => x.t.toLowerCase() === tag.toLowerCase())) { RN.ui.toast(`${esc(tag)} is already on your profile`, { icon: 'info' }); return; }
    if (op.tags.filter((x) => x.tier === 'claimed').length >= RN.fields.fitTags.max) { RN.ui.toast(`You have ${RN.fields.fitTags.max} self-claimed fit tags, the limit. Get some verified or remove one to add another.`, { icon: 'info', action: { label: 'Edit profile', act: 'go', attrs: 'data-to="studio.profile"' } }); return; }
    RN.store.update((s) => { const e = (s.edits[op.id] = s.edits[op.id] || {}); e.addTags = (e.addTags || []).concat(tag); }, 'edits');
    RN.model.applyEdits();
    RN.track('studio_action', { opId: op.id, action: 'tag_add', tag });
    RN.ui.toast(`Added ${esc(tag)}. It shows as Claimed until a client review verifies it.`, { action: { label: 'Undo', act: 'sa-tag-undo', attrs: `data-t="${esc(tag)}"` }, ms: 5000 });
    RN.rerender();
  };
  RN.actions['sa-tag-undo'] = (el) => {
    const op = RN.myOp();
    const tag = el.dataset.t;
    RN.store.update((s) => { const e = s.edits[op.id]; if (e && e.addTags) e.addTags = e.addTags.filter((x) => x !== tag); }, 'edits');
    const m = RN.model.byId(op.id);
    m.tags = m.tags.filter((x) => !(x.t === tag && x.tier === 'claimed' && !x.r));
    m.completeness = RN.model.completeness(m);
    RN.ui.toast(`Removed ${esc(tag)}`, { icon: 'refresh' });
    RN.rerender();
  };

  /* Headline: writes RN.store.state.edits[opId].headline, keeps the original so it can be restored */
  RN.actions['sa-headline'] = (el) => {
    const op = RN.myOp();
    const h = el.dataset.h;
    const orig = Object.assign({}, seen().saHeadlineOrig || {});
    if (orig[op.id] == null) orig[op.id] = op.headline || '';
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen.saHeadlineOrig = orig; const e = (s.edits[op.id] = s.edits[op.id] || {}); e.headline = h; }, 'edits');
    RN.model.applyEdits();
    RN.track('studio_action', { opId: op.id, action: 'headline_apply' });
    RN.ui.toast('Headline updated on your profile', { action: { label: 'View profile', act: 'go', attrs: `data-to="op.${esc(op.slug)}"` }, ms: 5000 });
    RN.rerender();
  };
  RN.actions['sa-headline-undo'] = () => {
    const op = RN.myOp();
    const orig = (seen().saHeadlineOrig || {})[op.id];
    if (orig == null) return;
    RN.store.update((s) => { const e = (s.edits[op.id] = s.edits[op.id] || {}); e.headline = orig; }, 'edits');
    RN.model.applyEdits();
    RN.ui.toast('Previous headline restored', { icon: 'refresh' });
    RN.rerender();
  };

  RN.actions['sa-copy'] = (el) => {
    const text = el.dataset.copyFrom ? (document.querySelector(el.dataset.copyFrom) || {}).textContent || '' : el.dataset.copy || '';
    const done = () => RN.ui.toast('Copied to clipboard', { icon: 'copy' });
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { RN.ui.toast('Select the text and copy it', { icon: 'info' }); }
      ta.remove();
    };
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback(); } catch (e) { fallback(); }
  };

  /* =====================================================================
     Tab registration
     ===================================================================== */
  const mount = (root) => draw(root);
  RN.studio.tab('overview', { label: 'Overview', icon: 'home', group: 'Studio', order: 1, badge: (op) => unread(op), render: renderOverview, mount });
  RN.studio.tab('visibility', { label: 'Who viewed you', icon: 'eye', group: 'Insights', order: 2, render: renderVisibility, mount });
  RN.studio.tab('positioning', { label: 'Positioning', icon: 'target', group: 'Insights', order: 3, render: renderPositioning, mount });
  RN.studio.tab('seo', { label: 'Search and AI visibility', icon: 'globe', group: 'Insights', order: 4, render: renderSeo, mount });
})();
