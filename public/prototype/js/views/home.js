/* Home (#home): the destination for companies hiring fractional GTM leaders.
   One bold moment (the photo hero with search), then seven calm sections that each open a deeper surface
   (design pass, Oct 14, 2026; owner decisions on the GoFractional audit):
     1. Hero          the H1, the search, client logos and three outcome figures (final values on the first frame)
     2. Start here    the problems (to Browse), the seats (the function pages) and the Not ready to hire yet panel
     3. The work      the showcase of work samples (RN.work.showcase), on the one sanctioned wide container
     4. Operators     a static row of three featured operators; carousel controls only when more than three
     5. Reviews       two company reviews, published as written
     6. Research      the 2027 report, the Rate Index by role (Illustrative), what a VP of Sales costs (real figures,
                      RN.costs) and the quarterly Pulse sign-up
     7. Talk to us    the closing band with the three steps
   The network activity ticker, the "Or browse by role" chips, the Focus areas picker and the GTM Framework section
   left home in this pass (the framework stays on #framework and #insights).
   Home is for clients (founder decision, Sep 25, 2026): operator messaging lives on #operators in pages.js.
   Pricing copy is client-side (D1): rates are shown as the price, companies pay no fees, and the operator fee is never
   mentioned here.

   Figures
   - Real cost figures read RN.costs and say their basis (RN.costs.basis). The full-time VP of Sales tile reads
     RN.costs.fullTime, never market.js report.fracVsFull.
   - Every market.js figure (the Rate Index, the 2027 report findings and sample sizes) carries a visible
     RN.ui.illusTag, so it never reads as measured data.
   - No headline count under 10: counts below 10 read "See operators" with no number.

   The founder (op.isMatt) stays eligible in every ranking but is never in the first slot of the operators row, and his
   reviews never feature here (owner decision, Oct 14, 2026; RN.model.notFirst, RN.model.isFounder).

   Motion (motion policy, BRIEF.md; owner feedback Oct 17, 2026: "feels too restrained, bring a little more back so it
   feels alive"). Every number is final on the first frame (no count-ups, no parallax), and all of it is off under
   prefers-reduced-motion and calm mode (RN.motion.calm), where the page is still.
   - Entrance (heroEntrance): the first time home renders in a browser session, the eyebrow, the three headline lines,
     the lede, the search, the three figures and the logos rise 14px in one short cascade (780ms end to end, 340ms each,
     ease-out; phones run the eyebrow, headline and lede only, since there the hero text fills most of the screen).
     The class is added by script before the first paint, so without JS nothing is ever hidden; it never replays on a
     return to home or a re-render.
   - Scroll reveals (rise): section heads (eyebrow, H2, lede in turn) and their cards rise 16px over 450ms as they come
     in, up to six in a stagger 70ms apart. Same rules as RN.motion.reveal (once per visit, armed by the first scroll,
     only blocks still below the screen, never a block taller than 40% of the screen, never replayed by a re-render);
     the shared helper caps at 12px and 300ms, so home runs its own copy with the richer settings.
   - Ambient, two in all: the search placeholder types real example requests one at a time with a natural cadence
     (holds each whole for 2.6s, pauses on hover, focus, a hidden tab or an off-screen hero), and the hero photo drifts
     once, very slowly, as it settles (photoDrift: 5% over 22s, then rests; it does not loop).
   - Explanation: the steps line fills with scroll (stepsLink) and each step's icon rings once when the line first
     reaches it; the Rate Index chart, the Not ready graphics and each review's rating arc draw once (RN.motion.draw);
     the work showcase settles when its filter changes (work.js).
   - Feedback: hover lift and shadow on cards, a slow zoom on work covers and operator photos, the report cover turning
     toward the reader; on touch screens a short press-in instead (home.css).

   Loops wired here:
   - Hero search and problem cards write RN.store.state.browse ({q, tags, filters:{roleCategories}}) with standard slugs,
     then route to #browse or #browse.<slug>. The search logs RN.track('search', {q, tags, filters, results, source}).
   - Operator cards log one 'impression' each per visit as they come into view (source 'home') and mark the next
     profile_view source as 'home' (RN.store.state._viewSource).
   - The Fractional GTM Pulse (the one quarterly newsletter, shared with Insights) stores seen['ins-pulse'], tracks
     'newsletter_signup' {source:'home', meta:{list:'pulse'}} and mails a confirmation to the Outbox. The next
     issue is the first day of the next calendar quarter (Jan 1, Apr 1, Jul 1, Oct 1).
   Type: .h-hero for the H1, .h2 for section heads, .h1 for the closing band. Vermilion full stops: the H1 and two H2s
   (three on the page). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;

  /* ---------- Module state (kept across re-renders of the same visit) ---------- */
  const S = { q: '', timers: [], offs: [] };
  const PH = 'Describe what you need, or search a role or focus area';
  /* Real example requests, shown one at a time in the search placeholder. Clients search their problem first and the
     category second (inbound plan, Oct 9, 2026), so phrases in the clients' own words alternate with role words. Each
     phrase was run through RN.model.search and RN.model.understand (Oct 10, 2026) and kept only if it returns three or
     more operators or reads as a role category. */
  const EXAMPLES = ['founder still running sales', 'VP of Sales', 'why is my forecast wrong', 'RevOps', 'how to vet a fractional CMO', 'Demand Generation', 'reps with no process', 'HubSpot', 'what does a fractional VP of Sales cost'];
  /* Phones (mobile audit, Oct 17, 2026): the field is about 270 to 300px wide, so the standard placeholder is the short
     one and the cycle skips examples longer than 30 characters (a cut-off example reads as broken) */
  const PH_PHONE = 'Describe what you need';
  const phone = () => !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  const ph = () => (phone() ? PH_PHONE : PH);
  const examples = () => (phone() ? EXAMPLES.filter((x) => x.length <= 30) : EXAMPLES);
  const EX_HOLD = 2600; // each finished example stays whole this long (policy: at least 2.5s readable)
    const FEAT_MIN = 60;  // Reputation Index floor for the featured row (Proven and above)
  const ROW = 3;        // the featured row shows three cards; controls appear only when there are more
  const MIN_COUNT = 10; // no count under 10 in a headline spot
  const BRIEF_KEY = 'ins-pulse'; // same list and key as the Insights sign-up

  // Icons for the problem picklist (RN.fields.need)
  const NEED_IC = { sales_motion: 'target', pipeline: 'trend-up', team: 'users', systems: 'layers', ai: 'ai', retention: 'refresh', partners: 'handshake', not_sure: 'message' };

  /* ---------- Helpers ---------- */
  const calm = () => (RN.motion && RN.motion.calm ? RN.motion.calm() : true);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); S.timers.push(t); return t; };
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); S.offs.push(() => target.removeEventListener(type, fn, opts)); };
  const onHome = on;
  function teardown() {
    S.timers.forEach(clearTimeout); S.timers = [];
    S.offs.forEach((off) => off()); S.offs = [];
  }
  const liveOps = () => RN.model.ops.filter((o) => !o.hidden);
  const opsIn = (cats) => liveOps().filter((o) => cats.includes(o.catKey)).length;
  const catLabel = (c) => RN.fields.catLabel(c);
  const seeOps = (n) => (n >= MIN_COUNT ? `See ${RN.fmt.plural(n, 'operator')}` : 'See operators');
  const more = (label, attrs) => `<a class="hm-more" ${attrs}>${esc(label)}${icon('arrow')}</a>`;
  /* Section head: eyebrow, H2 and description 16px apart, 32px to the content (.sec-head), with an optional link on the right */
  const head = (o) => `<div class="hm-head">
      <header class="sec-head">${o.eyebrow ? `<span class="eyebrow">${esc(o.eyebrow)}</span>` : ''}<h2 class="h2 hm-h2"${o.id ? ` id="${o.id}"` : ''}>${o.title}</h2>${o.sub ? `<p class="lede">${o.sub}</p>` : ''}${o.extra || ''}</header>
      ${o.right ? `<div class="hm-head-r">${o.right}</div>` : ''}
    </div>`;
  // Display typesetting. keep: a hyphenated compound never breaks across lines ("30/60/90-day", "company-confirmed").
  const unit = (v) => esc(v).replace(/^([$€£]?[\d.,]+)\s*(x|×|%|[a-z]+)$/i, (m, n, u) => /^[x×]$/i.test(u) ? `${n}<span class="u u-x">×</span>` : `${n}<span class="u${u === '%' ? ' u-sym' : ''}">${u}</span>`);
  const keep = (s) => esc(s).replace(/[^\s<>]+-[^\s<>]+/g, (w) => `<span class="nowrap">${w}</span>`);

  /* Write the Browse state with standard slugs, then route. From home every entry starts fresh. */
  function toBrowse(patch, route) {
    // A request written as a sentence ("We're a $12M SaaS company...") arrives on Browse as standard filters
    if (patch && patch.q && !(patch.filters && Object.keys(patch.filters).length) && RN.browse && RN.browse.fromText) {
      const p = RN.browse.fromText(patch.q, {});
      if (p) patch = Object.assign({}, patch, p);
    }
    RN.store.update((s) => {
      const prev = s.browse || {};
      s.browse = Object.assign({ q: '', tags: [], filters: {}, sort: 'best', view: patch && patch.q ? 'grid' : (prev.view || 'grid'), said: '', saidKeys: [], saidDropped: [] }, patch);
    }, 'browse');
    RN.go(route || 'browse');
  }

  // Founder's curation order (L466): Reputation Index, photo, video, reviews, engagements, completeness. Every operator
  // is ranked by the same rules; RN.model.notFirst then keeps the founder out of slot 1.
  const curate = (a, b) => RN.fields.risRank(b) - RN.fields.risRank(a) || (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || (b.video ? 1 : 0) - (a.video ? 1 : 0) || b.reviews.length - a.reviews.length || b.engagements.length - a.engagements.length || b.completeness - a.completeness;
  /* Featured operators: Proven (60) and above. When fewer than three qualify, the row is filled with the next best
     ranked operators, so it is always a full row of three. */
  function featured() {
    const ops = liveOps().slice().sort(curate);
    const top = ops.filter((o) => o.ris.score >= FEAT_MIN);
    const list = top.length >= ROW ? top : top.concat(ops.filter((o) => !top.includes(o)).slice(0, ROW - top.length));
    return RN.model.notFirst(list);
  }

  /* ---------- 1. Hero ---------- */
  // Founder figure (Oct 2, 2026): share of companies who would hire again, across past engagements.
  const HIRE_AGAIN = 97;
  // Company logos directly under the search box. [key, name, height]: heights set by eye so a thin wide wordmark and a
  // bold mark read the same size. Cleared client logos only (Ferry, Skaled, BuildingLink have artwork).
  const LOGO_LINE = [['ferryWordmark', 'Ferry', 19], ['skaled', 'Skaled', 15], ['buildinglink', 'BuildingLink', 19]];
  function logoLine() {
    return `<div class="hm-logos"><span class="label">Trusted by teams at</span><ul>${LOGO_LINE.map(([k, name, h]) => `<li>${(RN.data.logos || {})[k] ? RN.ui.logo(k, { h, name }) : `<span class="hm-wm">${esc(name)}</span>`}</li>`).join('')}</ul></div>`;
  }

  /* How it works, above the fold (Oct 19, 2026: "how it works above the fold"): the three steps of the closing band in
     one quiet line under the search, each a few words, with the full walk-through on #how. No motion of its own; it
     joins the first-visit entrance between the search and the logos. */
  const HERO_HOW = [
    ['Tell us what you need', 'Search, or talk to our team'],
    ['Meet matched operators', 'Replies within 72 hours'],
    ['Start on clear terms', 'Scope, hours and rate up front'],
  ];
  const heroHow = () => `<div class="hm-hiw">
      <a class="label hm-hiw-l" href="#how">How it works${icon('arrow')}</a>
      <ol class="hm-hiw-steps">${HERO_HOW.map((x, i) => `<li><span class="hm-hiw-n" aria-hidden="true">${i + 1}</span><span class="hm-hiw-t"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></span></li>`).join('')}</ol>
    </div>`;

  function hero() {
    const meetDays = +((RN.data.market && RN.data.market.network && RN.data.market.network.introToMeetingDays) || 2); // founder figure, Oct 2, 2026
    return `<section class="hm-hero night" aria-labelledby="hm-h1">
      <img class="hm-hero-img" src="assets/brand/hero-highfive.webp" alt="" fetchpriority="high">
      <div class="hm-hero-shade" aria-hidden="true"></div>
      <div class="wrap hm-hero-grid">
        <div class="hm-hero-main">
          <p class="eyebrow hm-kicker">Scale with proven experts</p>
          <h1 class="h-hero hm-h1" id="hm-h1">
            <span class="hm-ln"><span>Meet the operators</span></span>
            <span class="hm-ln"><span>who already solved</span></span>
            <span class="hm-ln"><span class="serif">your revenue problem<span class="vm">.</span></span></span>
          </h1>
          <p class="hm-sub">${keep('Fractional sales, marketing, RevOps and AI GTM leaders. Reviews come only from companies that hired them. Open profiles, no login to browse and no fees for companies.')}</p>
          <form class="hm-search" data-submit="hm-search" role="search" aria-label="Search operators">
            <label class="hm-search-f">${icon('search')}<span class="sr-only">Search operators</span>
              <input id="hm-q" name="q" type="search" autocomplete="off" enterkeyhint="search" value="${esc(S.q)}" placeholder="${esc(ph())}" data-input="hm-q"></label>
            <button type="submit" class="btn btn-lg hm-go-btn">Show my matches</button>
          </form>
          ${heroHow()}
          ${logoLine()}
        </div>
        <dl class="hm-stats">
          <div><dt>From intro to first meeting<small>Typical, from the first reply to a booked call</small></dt><dd class="num">${meetDays}<span class="u">${meetDays === 1 ? 'day' : 'days'}</span></dd></div>
          <div><dt>Would hire again<small>Companies across past engagements</small></dt><dd class="num">${HIRE_AGAIN}<span class="u u-sym">%</span></dd></div>
          <div><dt>Typical first reply to an intro request<small>Every request answered within 72 hours</small></dt><dd class="num"><span class="u-lt">&lt;</span>2<span class="u">hrs</span></dd></div>
        </dl>
      </div>
    </section>`;
  }

  /* ---------- 2. Start here: problems, seats and the Not ready to hire yet panel ---------- */
  /* The three function homes (site-pages copy, Oct 10, 2026): each card carries the page's hero line and the live
     operator count in that category. Plain links, since the pages render in function.js. */
  const SEATS = [
    { cat: 'sales_leadership', to: 'hire-fractional-sales-vp', h: 'Fractional sales leadership for founders who are still the sales team' },
    { cat: 'revenue_operations', to: 'fractional-revops', h: 'Fractional RevOps for $25M to $100M SaaS teams that cannot explain their own pipeline' },
    { cat: 'marketing', to: 'fractional-marketing-leadership', h: 'Fractional marketing leaders who bring lead costs down and hold your agencies to a number' },
  ];
  /* Not ready to hire yet: a dark panel of four tiles, each with a small graphic of where it leads, under a source line
     so it reads as research (founder comment, Oct 12, 2026). It keeps its amber accents (owner decision, Oct 14, 2026).
     The graphics draw once when the panel scrolls into view (RN.motion.draw: data-draw on the moving parts). */
  const PREP_ART = [
    // Rate spread: a smooth distribution, the middle half shaded, the median marked and labeled
    `<svg viewBox="0 0 200 88"><defs><linearGradient id="hpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/></linearGradient><clipPath id="hpC"><rect x="66" y="0" width="68" height="88"/></clipPath></defs>
      ${[18, 46, 74].map((y) => `<line class="grid" x1="10" y1="${y}" x2="190" y2="${y}"/>`).join('')}
      <path class="dist-fill" d="M10 70 C 45 70, 62 22, 100 18 C 138 22, 155 70, 190 70 Z" fill="url(#hpA)" data-draw="fade"/>
      <path class="dist-band" d="M10 70 C 45 70, 62 22, 100 18 C 138 22, 155 70, 190 70 Z" clip-path="url(#hpC)" data-draw="fade"/>
      <path class="dist-line" d="M10 70 C 45 70, 62 22, 100 18 C 138 22, 155 70, 190 70" data-draw="line"/>
      <line class="axis" x1="10" y1="70" x2="190" y2="70"/>
      <line class="med" x1="100" y1="18" x2="100" y2="70"/><circle class="med-dot" cx="100" cy="18" r="4"/>
      <g class="tag"><rect x="108" y="6" width="58" height="18" rx="9"/><text x="137" y="18.5">$240/hr</text></g>
      <text class="tick" x="10" y="84">$150</text><text class="tick" x="100" y="84" text-anchor="middle">median</text><text class="tick" x="190" y="84" text-anchor="end">$350</text></svg>`,
    // Five questions: a track that fills, checks on the answered ones, the gap found on the fourth
    `<svg viewBox="0 0 200 88">
      <line class="track" x1="22" y1="40" x2="178" y2="40"/><line class="track-on" x1="22" y1="40" x2="139" y2="40" data-draw="line"/>
      ${[22, 61, 100, 139, 178].map((x, i) => i < 3 ? `<g class="q-on"><circle cx="${x}" cy="40" r="9"/><path d="M${x - 4} 40 l3 3 l5 -6"/></g>` : i === 3 ? `<circle class="gap-ring" cx="${x}" cy="40" r="13"/><circle class="gap" cx="${x}" cy="40" r="9"/><text class="gap-n" x="${x}" y="43.5">4</text>` : `<circle class="q" cx="${x}" cy="40" r="9"/><text class="q-n" x="${x}" y="43.5">5</text>`).join('')}
      <g class="tag tag-gap"><rect x="104" y="60" width="70" height="18" rx="9"/><text x="139" y="72.5">Gap: pipeline</text></g></svg>`,
    // 30/60/90: a small Gantt, each phase starting where the last one hands off, with a milestone at the end
    `<svg viewBox="0 0 200 88">${[46, 90, 134].map((x) => `<line class="grid" x1="${x}" y1="6" x2="${x}" y2="70"/>`).join('')}
      ${[['Diagnose', 8, 70, 14], ['Build', 46, 74, 34], ['Hand over', 90, 82, 54]].map(([l, x, w, y]) => `<rect class="gantt-bg" x="${x}" y="${y}" width="${w}" height="12" rx="6"/><rect class="gantt" x="${x}" y="${y}" width="${w}" height="12" rx="6" data-draw="x"/><text class="gantt-l" x="${x + 7}" y="${y + 8.6}">${l}</text>`).join('')}
      <path class="mile" d="M176 60 l6 6 l-6 6 l-6 -6 Z"/>
      <text class="tick" x="46" y="84" text-anchor="middle">Day 30</text><text class="tick" x="90" y="84" text-anchor="middle">Day 60</text><text class="tick" x="134" y="84" text-anchor="middle">Day 90</text></svg>`,
    // A question and its straight answer: two message cards, the answer marked with a check
    `<svg viewBox="0 0 200 88"><g class="msg-q"><rect x="8" y="8" width="118" height="30" rx="10"/><circle cx="22" cy="23" r="6"/><rect class="ln" x="34" y="17" width="72" height="5" rx="2.5"/><rect class="ln" x="34" y="26" width="48" height="5" rx="2.5"/></g>
      <g class="msg-a" data-draw="fade"><rect x="58" y="46" width="134" height="34" rx="10"/><rect class="bar-a" x="58" y="46" width="4" height="34" rx="2"/><rect class="ln-a" x="72" y="55" width="94" height="5" rx="2.5"/><rect class="ln-a" x="72" y="65" width="66" height="5" rx="2.5"/><circle class="ok" cx="176" cy="63" r="7"/><path class="ok-t" d="M172.5 63 l2.5 2.5 l4.5 -5"/></g></svg>`,
  ];
  const PREP = [
    ['chart', 'Price a role', 'Rate Index medians and a monthly budget estimate', 'href="#rates"'],
    ['target', 'Find your gap in 5 questions', 'The GTM Framework diagnostic', 'href="#framework" data-act="hm-diag"'],
    ['layers', 'Scope it from a Blueprint', 'Role templates with a 30/60/90-day plan', 'href="#blueprints"'],
    ['book', 'Straight answers', 'Guides on cost, scope and hiring', 'href="#guides"'],
  ];
  // The source line: what the research is built from. The Rate Index rates and survey respondents are illustrative
  // until the first survey closes, so the line carries the visible tag.
  function prepSource() {
    const M = RN.data.market || {}, RI = M.rateIndex || {}, R = M.report || {}, smp = R.sample || {};
    const rates = Object.values(RI.byCat || {}).reduce((n, b) => n + (+b.n || 0), 0);
    const resp = (+smp.operators || 0) + (+smp.companies || 0);
    const areas = ((RN.fields || {}).fitTags || {}).options ? RN.fields.fitTags.options.length : 0;
    const bits = [rates && `${RN.fmt.int(rates)} rates in the Rate Index`, resp && `${RN.fmt.int(resp)} survey respondents`, areas && `${RN.fmt.int(areas)} focus areas mapped`].filter(Boolean);
    return bits.length ? `<p class="hm-prep-src">${icon('shield')}<span>Built from ${bits.join(' · ')}</span>${rates || resp ? RN.ui.illusTag() : ''}</p>` : '';
  }
  function seats() {
    return `<nav class="hm-seats" aria-labelledby="hm-seats-t">
      <h3 class="hm-seats-h" id="hm-seats-t">Or start from the seat</h3>
      <div class="hm-ruled hm-seat-row">${SEATS.map((s) => `<a class="hm-seat" href="#${s.to}">
          <span class="hm-seat-cat">${esc(catLabel(s.cat))}</span>
          <span class="hm-seat-t">${keep(s.h)}</span>
          <span class="hm-seat-n"><span>${esc(seeOps(opsIn([s.cat])))}</span><span class="hm-go" aria-hidden="true">${icon('arrow')}</span></span>
        </a>`).join('')}</div>
    </nav>
    <nav class="hm-prep panel-night" aria-labelledby="hm-prep-t">
      <div class="hm-prep-hd"><div><span class="hm-prep-k">Revenue Nomad Research</span><h3 id="hm-prep-t">Not ready to hire yet?</h3></div><p>Start with the numbers, the gap and the plan.</p></div>
      <ul class="hm-prep-list" data-hm-prep>${PREP.map((p, i) => `<li><a class="hm-prep-a" ${p[3]}><span class="hm-prep-art" aria-hidden="true">${PREP_ART[i]}</span><span class="hm-prep-t"><span class="hm-prep-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><b>${keep(p[1])}</b></span><span class="hm-prep-d">${keep(p[2])}</span><span class="hm-prep-go" aria-hidden="true">${icon('arrow')}</span></a></li>`).join('')}</ul>
      ${prepSource()}
    </nav>`;
  }

  // "See 180 operators" with the words in their own spans, so the narrowest phones can show "180" alone (home.css)
  const needCount = (n) => {
    if (n < MIN_COUNT) return esc(seeOps(n));
    const w = RN.fmt.plural(n, 'operator'), num = w.split(' ')[0];
    return `<span class="hm-need-c"><span class="hm-need-nw">See </span><b class="hm-need-num">${esc(num)}</b><span class="hm-need-nw hm-need-unit">${esc(w.slice(num.length))}</span></span>`;
  };
  function problems() {
    const needs = RN.fields.need.options;
    const cells = needs.map((o) => {
      const cats = RN.fields.needCats[o.v] || [];
      const ic = RN.ui.icoTile(NEED_IC[o.v] || 'target', { cls: 'hm-ic' });
      // "Not sure yet": a paper card with a forest rule on top, leading to a person
      if (!cats.length) {
        return `<button type="button" class="hm-need hm-need-talk" data-act="hm-need" data-need="${esc(o.v)}">
          ${ic}
          <span class="hm-need-body"><span class="hm-need-t">${esc(o.l)}</span><span class="hm-need-cats">Talk it through with a person first</span></span>
          <span class="hm-need-n">Talk to us${icon('arrow')}</span>
        </button>`;
      }
      return `<button type="button" class="hm-need" data-act="hm-need" data-need="${esc(o.v)}">
        ${ic}
        <span class="hm-need-body"><span class="hm-need-t">${esc(o.l)}</span>
          <span class="hm-need-cats">${esc(cats.map(catLabel).join(' · '))}</span></span>
        <span class="hm-need-n">${needCount(opsIn(cats))}${icon('arrow')}</span>
      </button>`;
    }).join('');
    return `<section class="sec hm-sec hm-after-band" aria-labelledby="hm-prob-t">
      <div class="wrap">
        ${head({ eyebrow: 'Start here', id: 'hm-prob-t', title: 'Start from the problem you have<span class="vm">.</span>' })}
        <div class="hm-needs">${cells}</div>
        ${seats()}
      </div>
    </section>`;
  }

  /* ---------- 3. The work (founder, Oct 13, 2026: "featured and highly visual, think Behance homepage") ----------
     The heading sits on the page's left edge (--wrap); the showcase grid keeps the one sanctioned wide container
     (--wrap-wide), and its filter chips line up with the heading again (home.css). */
  function workSec() {
    if (!RN.work || !RN.work.showcase) return '';
    return `<section class="sec hm-sec hm-work" aria-labelledby="hm-work-t">
      <div class="wrap">
        ${head({ eyebrow: 'The work', id: 'hm-work-t', title: 'Start from the work you need<span class="vm">.</span>', sub: 'Playbooks, comp plans, dashboards and 30/60/90 plans operators built for companies like yours. Find one, then meet who built it.' })}
      </div>
      <div class="hm-work-in">${RN.work.showcase({ source: 'home', limit: 8, phone: 6 })}</div>
    </section>`;
  }

  /* ---------- 4. Operators: a static row of three, a carousel only when there are more ----------
     Native horizontal scroll with snap points; prev/next and the dots appear only when the cards overflow the row (more
     than three on desktop, a swipe row with a peek on phones). Nothing advances on its own. */
  function opsRow(ops, trust) {
    const n = ops.length;
    return `<div class="hm-car hm-ops" data-hm-car role="region" aria-roledescription="carousel" aria-labelledby="hm-car-t">
      <div class="hm-row-hd hm-car-hd">
        <h3 class="label" id="hm-car-t">Featured operators</h3>${trust}
        <div class="hm-car-ctl">
          <button type="button" class="hm-car-btn" data-car="prev" aria-controls="hm-car-view">${icon('chev-left')}<span class="sr-only">Previous operator</span></button>
          <button type="button" class="hm-car-btn" data-car="next" aria-controls="hm-car-view">${icon('chev-right')}<span class="sr-only">Next operator</span></button>
        </div>
      </div>
      <div class="hm-car-view" id="hm-car-view" data-hm-car-view tabindex="0" aria-live="polite" aria-label="Featured operators, use the arrow keys to move">
        <ul class="hm-car-track">${ops.map((op, i) => `<li class="hm-car-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}: ${esc(op.name)}">${RN.ui.opCard(op)}</li>`).join('')}</ul>
      </div>
      <div class="hm-car-foot">
        <div class="hm-car-dots" role="group" aria-label="Choose a slide">${ops.map((op, i) => `<button type="button" class="hm-car-dot" data-car="go" data-i="${i}" aria-label="Show ${esc(op.name)}, ${i + 1} of ${n}" ${i ? '' : 'aria-current="true"'}><i></i></button>`).join('')}</div>
      </div>
    </div>`;
  }

  function carouselRun(root) {
    const car = root.querySelector('[data-hm-car]');
    if (!car) return;
    const view = car.querySelector('[data-hm-car-view]');
    const slides = [...car.querySelectorAll('.hm-car-slide')];
    const dots = [...car.querySelectorAll('.hm-car-dot')];
    if (!view || !slides.length) return;
    const C = { i: 0, per: 1, max: 0, lock: -1, lockT: 0 };
    const step = () => (slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : view.clientWidth) || 1;
    const measure = () => {
      const w = slides[0].getBoundingClientRect().width || 1;
      const gap = step() - w;
      C.per = Math.max(1, Math.min(slides.length, Math.round((view.clientWidth - 2 * (parseFloat(getComputedStyle(view).paddingLeft) || 0) + gap) / (w + gap))));
      C.max = Math.max(0, slides.length - C.per);
      dots.forEach((d, k) => { d.hidden = k > C.max; });
      // Everything fits: a static row with no controls
      car.classList.toggle('is-static', C.max === 0);
    };
    const seen = S.carSeen || (S.carSeen = new Set());
    const impress = () => slides.slice(C.i, C.i + C.per).forEach((s, k) => {
      const id = s.querySelector('.opc') && s.querySelector('.opc').dataset.op;
      if (id && !seen.has(id)) { seen.add(id); RN.track('impression', { opId: id, position: C.i + k + 1, source: 'home', surface: 'homepage_featured' }); }
    });
    const sync = () => {
      dots.forEach((d, k) => { if (k === C.i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      impress();
    };
    const go = (i) => {
      if (i > C.max) i = 0;
      if (i < 0) i = C.max;
      C.i = i;
      C.lock = i; clearTimeout(C.lockT); C.lockT = setTimeout(() => { C.lock = -1; }, 900);
      view.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: calm() ? 'auto' : 'smooth' });
      sync();
    };
    // Swipes and trackpad scrolls move the position too
    let sr = 0;
    on(view, 'scroll', () => {
      if (sr) return;
      sr = requestAnimationFrame(() => {
        sr = 0;
        const i = Math.max(0, Math.min(C.max, Math.round(view.scrollLeft / step())));
        if (C.lock >= 0) { if (i === C.lock) { C.lock = -1; clearTimeout(C.lockT); } return; }
        if (i !== C.i) { C.i = i; sync(); }
      });
    }, { passive: true });
    on(car, 'click', (e) => {
      const b = e.target.closest('[data-car]');
      if (!b || !car.contains(b)) return;
      const a = b.dataset.car;
      if (a === 'prev') go(C.i - 1);
      else if (a === 'next') go(C.i + 1);
      else if (a === 'go') go(+b.dataset.i);
    });
    on(car, 'keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!(e.target === view || (e.target.closest && e.target.closest('.hm-car-ctl, .hm-car-dots')))) return;
      if (C.max === 0) return;
      e.preventDefault();
      go(C.i + (e.key === 'ArrowRight' ? 1 : -1));
      if (e.target.classList && e.target.classList.contains('hm-car-dot') && dots[C.i]) dots[C.i].focus();
    });
    let rz = 0;
    on(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); if (C.i > C.max) C.i = C.max; view.scrollTo({ left: slides[C.i].offsetLeft - slides[0].offsetLeft }); sync(); }, 150); });
    S.offs.push(() => { clearTimeout(C.lockT); clearTimeout(rz); if (sr) cancelAnimationFrame(sr); });
    measure();
    view.scrollLeft = 0;
    // Impressions are logged once the row is on screen, not at render
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); sync(); } }, { threshold: 0.3 });
      io.observe(view);
      S.offs.push(() => io.disconnect());
    } else sync();
    // Test and debugging hook: the live state of the row on this page
    car._hmCar = C;
  }

  function featuredSec() {
    const feat = featured();
    const n = liveOps().length;
    // One short, client-facing trust line. How featuring works for operators lives on #operators.
    const trust = `<p class="small muted hm-trust">${icon('seal')}<span>Chosen by Reputation Index ${RN.ui.tip(RN.ui.risExplainer(), 'How the Reputation Index is calculated')} and company reviews.</span></p>`;
    return `<section class="sec hm-sec" aria-labelledby="hm-ops-t">
      <div class="wrap">
        ${head({ eyebrow: 'Operators', id: 'hm-ops-t', title: 'See exactly who you would work with, before you talk to anyone.', right: more(`All ${n} profiles`, 'href="#browse" data-act="hm-all"') })}
        ${feat.length ? opsRow(feat, trust) : ''}
      </div>
    </section>`;
  }

  /* ---------- 5. Company reviews ----------
     One neutral rule for every operator's reviews (RN.model.topReviews: highest score, then most recent). The founder's
     reviews never feature (owner decision, Oct 14, 2026), and the two features come from two different operators and
     companies. Quotes are published as written (RN.model.pullQuote only shortens at a sentence end). */
  function reviewFeatures() {
    const pool = RN.model.topReviews().filter((x) => !RN.model.isFounder(x));
    const first = pool[0];
    if (!first) return [];
    const second = pool.find((x) => x.op.id !== first.op.id && x.r.company !== first.r.company);
    return [first, second].filter(Boolean);
  }
  /* The rating arc: a gauge along the top of the arch, filled to the review's score out of 5. It draws once when the
     arch scrolls in (RN.motion.draw, data-draw="line"); the figure under it is final from the first frame. The arch
     top is a semicircle as wide as the arch, so the viewBox is pinned to the top and scales with its width; the arc
     runs 9 units outside the tint (overflow visible), so it never crosses the score. */
  function rateArc(score) {
    const f = Math.max(0, Math.min(1, score / 5)), R = 159, C = 150, a = Math.PI * f; // just outside the tint, clear of the figure
    const ex = (C - R * Math.cos(a)).toFixed(1), ey = (C - R * Math.sin(a)).toFixed(1);
    return `<svg class="hm-rate-arc" viewBox="0 0 300 269" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">
        <path class="trk" d="M ${C - R} ${C} A ${R} ${R} 0 0 1 ${C + R} ${C}"/>${f > 0 ? `<path class="val" d="M ${C - R} ${C} A ${R} ${R} 0 0 1 ${ex} ${ey}" data-draw="line"/>` : ''}
      </svg>`;
  }
  function quotesSec() {
    const feats = reviewFeatures();
    if (!feats.length) return '';
    const by = (r) => [r.role, r.company].filter(Boolean).join(', ');
    const feature = (x, flip) => {
      const photo = (RN.data.reviewerPhotos || {})[x.r.reviewer] || '';
      const logo = RN.ui.logo(RN.model.reviewLogo(x.op, x.r), { h: 30, name: x.r.company || 'Company' });
      // With no headshot, the arch carries the review's own rating: the overall score, stars, would hire again and how
      // many focus areas it verified, signed with the company name or logo
      const score = typeof x.r.overall === 'number' ? x.r.overall : null;
      const nTags = (x.r.tags || []).length;
      const rating = `<div class="hm-arch-rate">
          ${score != null ? rateArc(score) : ''}
          ${score != null ? `<span class="hm-rate-n num">${esc(score.toFixed(1))}</span><span class="hm-rate-stars">${RN.ui.stars(score)}</span><span class="hm-rate-k">Overall rating</span>` : ''}
          <ul class="hm-rate-facts">${x.r.hireAgain ? `<li>${icon('check-circle')}Would hire again</li>` : ''}${nTags ? `<li>${icon('seal')}${esc(RN.fmt.plural(nTags, 'focus area'))} verified</li>` : ''}</ul>
          <span class="hm-rate-logo">${logo}</span>
        </div>`;
      return `<div class="hm-q-feature${flip ? ' is-flip' : ''}">
          ${photo ? `<div class="hm-arch hm-arch-photo${/-cut\.(webp|png)$/.test(photo) ? ' hm-arch-cut' : ''}" data-hm-arch><img src="${esc(photo)}" alt="${esc(x.r.reviewer || 'Company')}" onerror="this.closest('.hm-q-feature').classList.add('hm-q-nophoto')"></div>` : ''}
          <div class="hm-arch hm-arch-logo" data-hm-arch>${rating}</div>
          <figure class="hm-q">
            <span class="hm-q-mark" aria-hidden="true">“</span>
            <blockquote class="hm-q-text">${esc(RN.fmt.smart(RN.model.pullQuote(x.r.quote || x.r.text, 180)))}</blockquote>
            <figcaption class="hm-q-by"><i aria-hidden="true"></i><b>${esc(x.r.reviewer || 'Company')}</b><span>${esc(by(x.r))}</span></figcaption>
            ${photo ? `<div class="hm-q-co">${logo}</div>` : ''}
            <div class="row hm-q-links"><span class="pill pill-good">${icon('check-circle')}Company review</span><a class="act" href="#op.${esc(x.op.slug)}" data-track-view="${esc(x.op.id)}">Read the full review on ${esc(x.op.first)}’s profile${icon('arrow')}</a></div>
          </figure>
        </div>`;
    };
    return `<section class="sec hm-sec hm-before-band" aria-labelledby="hm-q-t">
      <div class="wrap">
        ${head({ eyebrow: 'Results, in their words', id: 'hm-q-t', title: 'Company reviews, published as written.' })}
        <div class="hm-q-pair" data-hm-qpair>
          ${feats.length > 1 ? '<svg class="hm-qlink" aria-hidden="true" focusable="false"><path class="hm-qlink-track" d=""/><path class="hm-qlink-line" d=""/></svg>' : ''}
          ${feats.map((x, i) => feature(x, i % 2 === 0 && feats.length > 1)).join('')}
        </div>
      </div>
    </section>`;
  }

  /* The line between the two featured reviews: from the bottom of the first arch, a rounded switchback through the gap,
     into the top of the second arch. Static (drawn in full); it is laid out again on resize and when images load. */
  function quoteLink(root) {
    const box = root.querySelector('[data-hm-qpair]');
    const svg = box && box.querySelector('.hm-qlink');
    if (!svg) return;
    const paths = [...svg.querySelectorAll('path')];
    function layout() {
      const r = box.getBoundingClientRect();
      const W = Math.round(box.clientWidth), H = Math.round(box.clientHeight);
      const feats = [...box.querySelectorAll('.hm-q-feature')];
      const arch = (f) => [...f.querySelectorAll('[data-hm-arch]')].find((x) => x.offsetParent !== null && getComputedStyle(x).display !== 'none');
      const A = arch(feats[0]), B = arch(feats[1]);
      if (!W || !H || !A || !B) return;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
      const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      const a = { x: ra.left + ra.width / 2 - r.left, y: ra.bottom - r.top };
      const b = { x: rb.left + rb.width / 2 - r.left, y: rb.top + rb.height * 0.16 - r.top };
      const f = (n) => n.toFixed(1);
      const g = (a.y + b.y) / 2, dx = b.x - a.x, sx = Math.sign(dx) || 1;
      const rad = Math.max(0, Math.min(56, Math.abs(dx) / 2, (b.y - a.y) / 2));
      const d = Math.abs(dx) < 2 ? `M ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)}`
        : `M ${f(a.x)} ${f(a.y)} L ${f(a.x)} ${f(g - rad)} Q ${f(a.x)} ${f(g)} ${f(a.x + sx * rad)} ${f(g)} L ${f(b.x - sx * rad)} ${f(g)} Q ${f(b.x)} ${f(g)} ${f(b.x)} ${f(g + rad)} L ${f(b.x)} ${f(b.y)}`;
      paths.forEach((p) => p.setAttribute('d', d));
    }
    layout();
    let rz = 0;
    on(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(layout, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (document.body.contains(box)) layout(); });
    RN.$$('img', box).forEach((im) => { if (!im.complete) im.addEventListener('load', layout, { once: true }); });
    S.offs.push(() => clearTimeout(rz));
  }

  /* ---------- 6. Research: the 2027 report, the Rate Index by role, what a VP of Sales costs, the Pulse ----------
     The report findings, its sample and the Rate Index are illustrative market.js figures: each block carries the
     visible tag. The cost card is real (RN.costs 'vp-sales' and RN.costs.fullTime) and says its basis. */
  function rateCard() {
    const RI = RN.data.market.rateIndex;
    const trend = RI.trend;
    const cur = trend[trend.length - 1], first = trend[0];
    const nRates = Object.values(RI.byCat || {}).reduce((n, b) => n + (+b.n || 0), 0);
    const asOf = RN.data.market.asOf ? RN.fmt.date(RN.data.market.asOf) : '';
    return `<article class="card card-lg card-col hm-card hm-rate c-7">
      <div class="hm-card-hd">
        <div><h3 class="h4 hm-card-t">Median hourly rate by role ${RN.ui.illusTag()}</h3><p class="small muted">Rate Index, ${esc(cur.l.replace(' ', ' 20'))}. Select a role to browse its operators.</p></div>
        <div class="hm-kpi"><span class="num">${esc(RN.fmt.usd(cur.v))}</span><span class="small muted">all roles, ${RN.ui.delta(cur.v, first.v)} vs ${esc(first.l.replace(' ', ' 20'))}</span></div>
      </div>
      <div class="hm-bars" data-hm-chart="rates"></div>
      <div class="hm-card-ft card-foot">${RN.ui.figNote([asOf && `As of ${asOf}`, nRates && `n=${RN.fmt.int(nRates)} rates`])}${more('Open the Rate Index', 'href="#rates"')}</div>
    </article>`;
  }
  function costCard() {
    const C = RN.costs && RN.costs.get('vp-sales');
    if (!C) return '';
    const T = C.text, ft = RN.costs.fullTime || C.fullTime || {};
    return `<article class="card card-lg card-col hm-card hm-cost c-5">
      <div class="hm-card-hd"><div><h3 class="h4">What a VP of Sales costs</h3></div></div>
      <dl class="hm-typ">
        <div><dt>Fractional VP of Sales</dt><dd class="num">${esc(T.monthly)}</dd><dd class="hm-typ-sub">${esc(T.hourly)}, ${esc(T.hours)}. ${esc(RN.costs.basis('vp-sales'))}.</dd></div>
        <div><dt>Full-time VP of Sales</dt><dd class="num">${esc(T.fullTimeMonthly)}</dd><dd class="hm-typ-sub">${esc(T.fullTime)} in total pay, ${esc(ft.src || '')}.</dd></div>
      </dl>
      <p class="hm-cost-pct">Fractional runs ${esc(T.pct)} of full-time pay.</p>
      <div class="hm-card-ft card-foot">${more('What fractional leaders cost', 'href="#fractional-cost"')}</div>
    </article>`;
  }
  function researchSec() {
    const r = RN.data.market.report;
    const figs = [r.summary[0], r.summary[2], r.summary[3]].filter(Boolean);
    return `<section class="sec-band hm-research" aria-labelledby="hm-rep-t">
      <div class="wrap">
        <div class="hm-rep">
          <a class="hm-book" href="#report" aria-label="Read ${esc(r.title)} ${esc(r.year)}">
            <span class="hm-book-sheet" aria-hidden="true"></span>
            <span class="hm-book-cover">
              <span class="hm-book-k">Revenue Nomad Research</span>
              <span class="hm-book-y">${esc(r.year)}</span>
              <span class="hm-book-t">${esc(r.title)}</span>
            </span>
          </a>
          <div class="hm-rep-txt">
            <header class="sec-head">
              <span class="eyebrow">New research · Free to read</span>
              <h2 class="h2 hm-h2" id="hm-rep-t">${esc(r.title)} ${esc(r.year)}. Where GTM leadership is going.</h2>
              <p class="lede">${esc(String(r.lede).split('. ')[0].replace(/\.$/, ''))}.</p>
            </header>
            <div class="hm-rep-figs">
              <dl class="hm-rep-stats">${figs.map((s) => `<div><dt class="num">${unit(s.v)}</dt><dd>${esc(s.l)}</dd></div>`).join('')}</dl>
              ${RN.ui.illusNote()}
            </div>
            <div class="row hm-ctas"><a class="btn" href="#report">Read the report${icon('arrow')}</a><span class="small muted">Open to read, no email needed.</span></div>
          </div>
        </div>
        <div class="g12 hm-mkt">${rateCard()}${costCard()}</div>
        ${briefSec()}
      </div>
    </section>`;
  }

  /* The Fractional GTM Pulse (quarterly newsletter, same list as Insights) */
  // Next issue: the first day of the next calendar quarter (Jan 1, Apr 1, Jul 1, Oct 1). Month 12 rolls to Jan 1.
  const nextIssue = () => { const n = RN.now(); return new Date(n.getFullYear(), (Math.floor(n.getMonth() / 3) + 1) * 3, 1); };
  const briefSub = () => (RN.store.state.seen || {})[BRIEF_KEY] || null;
  function briefInner() {
    const sub = briefSub();
    if (sub) {
      return `<div class="hm-brief-done" tabindex="-1" data-hm-brief-done>
        <p>${icon('check-circle')}<span>Subscribed as <b>${esc(sub.email)}</b>. The next Pulse lands ${esc(RN.fmt.date(nextIssue()))}.</span></p>
        <button type="button" class="act" data-act="hm-brief-unsub">Unsubscribe</button>
      </div>`;
    }
    const me = RN.me && RN.me();
    const input = RN.w.control('email', (me && me.email) || '', { name: 'email', id: 'hm-brief-email' }).replace('<input ', '<input autocomplete="email" ');
    return `<form class="hm-brief-form" data-submit="hm-brief" novalidate>
        <label class="sr-only" for="hm-brief-email">${esc(RN.fields.email.label)}</label>
        ${input}
        <button type="submit" class="btn btn-line">Get the quarterly Pulse</button>
      </form>
      <p class="tiny muted">One email a quarter. Unsubscribe in one click.</p>`;
  }
  function briefSec() {
    return `<div class="hm-brief" role="group" aria-labelledby="hm-brief-t">
        <h3 class="hm-brief-h" id="hm-brief-t">The Fractional GTM Pulse<span>Once a quarter: the Rate Index by role, the Demand Index and new research. Free.</span></h3>
        <div class="hm-brief-slot" data-hm-brief>${briefInner()}</div>
      </div>`;
  }
  function refreshBrief(focusDone) {
    const slot = document.querySelector('main[data-view="home"] [data-hm-brief]');
    if (!slot) return;
    slot.innerHTML = briefInner();
    const t = focusDone ? slot.querySelector('[data-hm-brief-done]') : slot.querySelector('input[name=email]');
    if (t) t.focus({ preventScroll: true });
  }

  /* ---------- 7. Talk to us, with how it works ----------
     The primary inbound path (owner decision, Oct 14, 2026): one filled Talk to us button in the closing band. Three steps
     in one row under it; the line that joins them fills as the band scrolls up (stepsLink). The winding path that
     draws itself lives on #how (RN.homePath). */
  const STEPS = [
    ['search', 'Search the network', 'Search by role, focus area or the problem you have. Every profile is open, no login needed.'],
    ['message', 'Request an intro or post an engagement', 'Meet one operator, or post an engagement for ranked matches. Replies within 72 hours.'],
    ['handshake', 'Start on clear terms', 'Agree scope, hours and rate up front.'],
  ];
  const stepsRow = () => `<div class="hm-how">
      <div class="hm-how-hd"><h3 class="label hm-how-l"><span>How it works</span><span class="hm-how-dot" aria-hidden="true"> · </span><span class="hm-how-sub">Three steps, no retained search</span></h3><a class="hm-more" href="#how">Every step, in detail${icon('arrow')}</a></div>
      <ol class="hm-steps" data-hm-steps><li class="hm-steps-track" aria-hidden="true"><i class="hm-steps-fill"></i></li>${STEPS.map((s, i) => `<li class="hm-step">
        ${RN.ui.icoTile(s[0], { cls: 'hm-ic', night: true })}
        <span class="hm-step-k">Step ${i + 1}</span><h4 class="hm-step-t">${esc(s[1])}</h4><p>${esc(s[2])}</p>
      </li>`).join('')}</ol>
    </div>`;

  /* The three steps are joined by a line that fills as the band scrolls up the viewport (founder comment, Oct 12, 2026):
     each step lights when the line reaches its icon. Horizontal when the steps sit in a row, vertical when they stack.
     Reduced motion (or calm mode): the line is full and every step is lit. */
  function stepsLink(root, quiet) {
    const ol = root.querySelector('[data-hm-steps]');
    if (!ol) return;
    const track = ol.querySelector('.hm-steps-track'), fill = track.querySelector('.hm-steps-fill');
    const steps = [...ol.querySelectorAll('.hm-step')];
    let pts = [], vertical = false, raf = 0, armed = false;
    // Each step's icon rings once, the first time the line reaches it after the visitor scrolls (not at load)
    const pinged = S.pinged || (S.pinged = new Set());
    function layout() {
      const o = ol.getBoundingClientRect();
      pts = steps.map((li) => { const r = (li.querySelector('.ico') || li).getBoundingClientRect(); return { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top }; });
      if (pts.length < 2) return;
      vertical = Math.abs(pts[1].y - pts[0].y) > Math.abs(pts[1].x - pts[0].x);
      const a = pts[0], z = pts[pts.length - 1];
      track.classList.toggle('is-v', vertical);
      Object.assign(track.style, vertical
        ? { left: a.x + 'px', top: a.y + 'px', width: '', height: (z.y - a.y) + 'px' }
        : { left: a.x + 'px', top: a.y + 'px', height: '', width: (z.x - a.x) + 'px' });
    }
    function paint(p) {
      p = Math.max(0, Math.min(1, p));
      fill.style.transform = vertical ? `scaleY(${p})` : `scaleX(${p})`;
      const n = steps.length - 1;
      steps.forEach((li, i) => {
        const on = p >= (n ? i / n : 0) - 0.001;
        li.classList.toggle('on', on);
        if (on && armed && !pinged.has(i)) { pinged.add(i); li.classList.add('is-ping'); later(() => li.classList.remove('is-ping'), 1000); }
      });
    }
    function progress() {
      const r = ol.getBoundingClientRect(), vh = window.innerHeight || 800;
      // 0 when the steps' top reaches 85% of the viewport, 1 when their bottom passes 70% (so the last step lights
      // well before the page ends, footer or not)
      return (vh * 0.85 - r.top) / Math.max(1, r.height + vh * 0.15);
    }
    layout();
    if (quiet) { ol.classList.add('is-done'); paint(1); return; }
    ol.classList.add('is-live');
    steps.forEach((li, i) => { if (progress() >= (steps.length > 1 ? i / (steps.length - 1) : 0) - 0.001) pinged.add(i); });
    const tick = () => { raf = 0; paint(progress()); };
    const ask = () => { armed = true; if (!raf) raf = requestAnimationFrame(tick); };
    onHome(window, 'scroll', ask, { passive: true });
    onHome(window, 'resize', () => { layout(); ask(); });
    S.offs.push(() => { if (raf) cancelAnimationFrame(raf); raf = 0; });
    tick();
  }

  /* The path under How it works (#how, pages.js): measured from the node positions, drawn with stroke-dashoffset as the
     section scrolls through the lower part of the viewport. Steps light up as the line reaches them. Everything is drawn
     and lit until .is-live is added, which only happens after the visitor scrolls while the path is below the fold. */
  function stepsPath(root, quiet, bag) {
    // bag: another page's cleanup list (How it works reuses this path); listeners then go there instead of Home's
    const on = bag ? (t, ty, fn, o) => { t.addEventListener(ty, fn, o); bag.push(() => t.removeEventListener(ty, fn, o)); } : onHome;
    const offs = bag || S.offs;
    const box = root.querySelector('[data-hm-path]');
    if (!box) return;
    const svg = box.querySelector('.hm-path-svg');
    const paths = [...svg.querySelectorAll('path')];
    const line = svg.querySelector('.hm-path-line'), glow = svg.querySelector('.hm-path-glow'), tip = svg.querySelector('.hm-path-tip');
    const steps = [...box.querySelectorAll('.hm-pstep')];
    const SAMPLES = 240;
    let len = 0, table = [], keys = [], nodes = [], live = false, raf = 0;
    function layout() {
      const r = box.getBoundingClientRect();
      const W = Math.round(box.clientWidth), H = Math.round(box.clientHeight);
      if (!W || !H) return;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      nodes = steps.map((s) => { const b = s.querySelector('.hm-pnode').getBoundingClientRect(); return { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top }; });
      // A winding road: down from each node, a rounded switchback through the gap between two cards, then down
      // into the next node. The nodes zig-zag and the cards sit on the outer side, so the line never runs behind
      // a card. On a phone every node shares one x, so it is a straight line down the left.
      const cards = steps.map((s) => { const b = s.querySelector('.hm-pcard').getBoundingClientRect(); return { top: b.top - r.top, bottom: b.bottom - r.top }; });
      const f = (n) => n.toFixed(1);
      let d = `M ${f(nodes[0].x)} 0 L ${f(nodes[0].x)} ${f(nodes[0].y)}`;
      for (let k = 1; k < nodes.length; k++) {
        const a = nodes[k - 1], b = nodes[k], dx = b.x - a.x;
        const g = Math.max(a.y + 8, Math.min(b.y - 8, (cards[k - 1].bottom + cards[k].top) / 2));
        const rad = Math.min(52, Math.abs(dx) / 2, g - a.y, b.y - g);
        if (Math.abs(dx) < 1 || rad < 2) { d += ` L ${f(b.x)} ${f(b.y)}`; continue; }
        const sx = Math.sign(dx);
        d += ` L ${f(a.x)} ${f(g - rad)} Q ${f(a.x)} ${f(g)} ${f(a.x + sx * rad)} ${f(g)} L ${f(b.x - sx * rad)} ${f(g)} Q ${f(b.x)} ${f(g)} ${f(b.x)} ${f(g + rad)} L ${f(b.x)} ${f(b.y)}`;
      }
      d += ` L ${f(nodes[nodes.length - 1].x)} ${H}`;
      paths.forEach((p) => p.setAttribute('d', d));
      len = line.getTotalLength();
      table = [];
      for (let k = 0; k <= SAMPLES; k++) table.push(line.getPointAtLength((len * k) / SAMPLES));
      // Path length at each node, so scroll maps to length piecewise (the flat switchbacks draw smoothly too)
      keys = [{ y: 0, l: 0 }].concat(nodes.map((n) => {
        let best = 0, bd = Infinity;
        table.forEach((pt, k) => { const dd = Math.hypot(pt.x - n.x, pt.y - n.y); if (dd < bd) { bd = dd; best = k; } });
        return { y: n.y, l: (len * best) / SAMPLES };
      }), [{ y: H, l: len }]);
      if (live) { [line, glow].forEach((p) => { p.style.strokeDasharray = `${len} ${len}`; }); draw(); }
    }
    // Path length for a height inside the box, interpolated between the nodes
    const lenAt = (y) => {
      if (!keys.length || y <= 0) return 0;
      for (let k = 1; k < keys.length; k++) if (y <= keys[k].y) { const a = keys[k - 1], b = keys[k]; return a.l + (b.l - a.l) * ((y - a.y) / Math.max(1, b.y - a.y)); }
      return len;
    };
    function draw() {
      raf = 0;
      if (!live || !len || !document.body.contains(box)) return;
      const r = box.getBoundingClientRect();
      const y = window.innerHeight * 0.78 - r.top; // the drawing edge sits a little above the bottom of the screen
      const L = Math.min(len, lenAt(y));
      [line, glow].forEach((p) => { p.style.strokeDashoffset = (len - L).toFixed(1); });
      const pt = L > 0 && L < len ? line.getPointAtLength(L) : null;
      tip.style.opacity = pt ? '1' : '0';
      if (pt) { tip.setAttribute('cx', pt.x.toFixed(1)); tip.setAttribute('cy', pt.y.toFixed(1)); }
      steps.forEach((s, i) => s.classList.toggle('is-on', y >= nodes[i].y - 6));
    }
    const req = () => { if (!raf) raf = requestAnimationFrame(draw); };
    layout();
    let rz = 0;
    on(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(layout, 150); });
    // Web fonts can change card heights after mount
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (document.body.contains(box)) layout(); });
    offs.push(() => { clearTimeout(rz); if (raf) cancelAnimationFrame(raf); raf = 0; });
    if (quiet) return;
    const arm = () => {
      if (live || !document.body.contains(box)) return;
      if (box.getBoundingClientRect().top <= window.innerHeight) return; // already on screen: leave it drawn
      live = true;
      box.classList.add('is-live');
      layout();
      on(window, 'scroll', req, { passive: true });
    };
    ['scroll', 'wheel', 'touchmove', 'keydown'].forEach((t) => on(window, t, arm, { passive: true }));
  }

  function talkSec() {
    return `<section class="sec-band hm-talk night" aria-labelledby="hm-talk-t">
      <div class="wrap">
        <div class="hm-talk-in">
          <h2 class="h1 hm-talk-h" id="hm-talk-t">Rather talk it through with a person?</h2>
          <div class="hm-talk-r">
            <p>Four quick questions, then a reply from a person within one business day. Or call <a href="tel:+12032000482">+1 203-200-0482</a>.</p>
            <div class="row hm-ctas"><a class="btn btn-leaf btn-lg" href="#talk">Talk to us${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#browse" data-act="hm-all">Browse operators</a></div>
          </div>
        </div>
        ${stepsRow()}
      </div>
    </section>`;
  }

  /* ---------- Charts: drawn at the real rendered width so chart text stays at 12px ---------- */
  function fillCharts(root) {
    const rates = root.querySelector('[data-hm-chart="rates"]');
    if (!rates) return;
    const w = Math.max(260, Math.round(rates.clientWidth));
    const byCat = RN.data.market.rateIndex.byCat;
    const rows = RN.fields.roleCategory.options.filter((o) => byCat[o.v])
      .map((o) => ({ cat: o.v, label: o.l, value: byCat[o.v].p50, p25: byCat[o.v].p25, p75: byCat[o.v].p75 }))
      .sort((a, b) => b.value - a.value);
    rows[0].hi = true;
    const rowH = w > 560 ? 34 : 32;
    rates.innerHTML = RN.chart.bars(rows, { w, labelW: Math.round(Math.min(196, Math.max(166, w * 0.46))), rowH, barH: w > 560 ? 14 : 12, fmt: (n) => '$' + n, label: 'Median hourly rate by role category, Rate Index (illustrative)' })
      + rows.map((r, i) => `<a class="hm-bars-hit" href="#browse.${esc(r.cat)}" data-act="hm-cat" data-cat="${esc(r.cat)}" style="top:${i * rowH}px;height:${rowH}px" aria-label="Browse ${esc(r.label)} operators. Illustrative median $${r.value}/hr, ${esc(RN.fmt.hrRange(r.p25, r.p75))} typical."></a>`).join('');
  }

  /* ---------- The one ambient element: example requests typed into the search placeholder ----------
     Each example is typed one character at a time with a human cadence (owner comment, Oct 14, 2026: "make this look
     like natural typing"): 45-95ms a key, a longer beat after spaces and commas, the odd short hesitation, a steady caret
     while typing that blinks while the finished request is held for EX_HOLD, then a quicker backspace and a short breath
     before the next one. It holds while the visitor hovers the search, and focus or a typed value shows the standard
     placeholder; it pauses when the tab is hidden or the hero is scrolled away. Off under reduced motion and calm mode
     (RN.motion.calm), where the standard placeholder shows. */
  function cycleExamples(root) {
    const input = root.querySelector('#hm-q');
    const form = input && input.closest('form');
    if (!input || calm()) return;
    const CARET = '|';
    let i = -1, hover = false, inView = true, timer = 0;
    on(form, 'mouseenter', () => { hover = true; });
    on(form, 'mouseleave', () => { hover = false; });
    const hero = root.querySelector('.hm-hero');
    if (hero && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { inView = es.some((x) => x.isIntersecting); }, { threshold: 0.25 });
      io.observe(hero);
      S.offs.push(() => io.disconnect());
    }
    const wait = (fn, ms) => { timer = later(fn, ms); };
    const paused = () => hover || document.hidden || !inView;
    const busy = () => document.activeElement === input || !!input.value;
    const show = (t) => { input.placeholder = t; };
    // Keystroke rhythm: quick inside a word, a beat after a space or comma, now and then a short hesitation
    const keyDelay = (ch) => {
      let d = 45 + Math.random() * 50;
      if (ch === ' ') d += 40 + Math.random() * 70;
      if (ch === ',' || ch === '?') d += 120 + Math.random() * 120;
      if (Math.random() < 0.06) d += 140 + Math.random() * 180;
      return d;
    };
    // Waits out a pause or the visitor using the search, then resumes where it left off
    const guard = (next) => {
      if (!input.isConnected) return true;
      if (busy()) { if (input.placeholder !== ph()) show(ph()); wait(() => restart(), 700); return true; }
      if (paused()) { wait(next, 500); return true; }
      return false;
    };
    const restart = () => { if (!input.isConnected) return; if (busy() || paused()) { wait(restart, 700); return; } show(''); wait(nextExample, 300); };
    const type = (text, n) => {
      if (guard(() => type(text, n))) return;
      show(text.slice(0, n) + CARET);
      if (n >= text.length) { hold(text, 0); return; }
      wait(() => type(text, n + 1), keyDelay(text[n]));
    };
    // Hold the finished request; the caret blinks at the usual 530ms
    const hold = (text, t) => {
      if (guard(() => hold(text, t))) return;
      show(text + (Math.floor(t / 530) % 2 ? '' : CARET));
      if (t >= EX_HOLD) { erase(text, text.length); return; }
      wait(() => hold(text, t + 265), 265);
    };
    const erase = (text, n) => {
      if (guard(() => erase(text, n))) return;
      show(text.slice(0, n) + CARET);
      if (n <= 0) { show(''); wait(nextExample, 380 + Math.random() * 220); return; }
      wait(() => erase(text, n - 1), 22 + Math.random() * 18);
    };
    const nextExample = () => {
      if (guard(nextExample)) return;
      const list = examples();
      i = (i + 1) % list.length;
      type(list[i], 1);
    };
    S.offs.push(() => clearTimeout(timer));
    wait(() => { if (!busy()) show(''); nextExample(); }, 1200);
  }

  /* ---------- Entrance: the hero's first-visit cascade (home.css .hm-enter) ----------
     Once per browser session (sessionStorage, or this page's memory when storage is blocked), only on a fresh render of
     home, never in calm mode. The class goes on before the first paint and comes off when the cascade has ended. */
  const INTRO_KEY = 'rn-hm-intro';
  function heroEntrance(root, fresh) {
    const hero = root.querySelector('.hm-hero');
    if (!hero || !fresh || calm() || S.introPlayed) return;
    S.introPlayed = true;
    try { if (sessionStorage.getItem(INTRO_KEY)) return; sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* storage blocked: page memory only */ }
    hero.classList.add('hm-enter');
    later(() => hero.classList.remove('hm-enter'), 1000);
  }

  /* ---------- Ambient 2 of 2: the hero photo settles with one very slow drift (home.css .hm-drift) ----------
     It plays once per page load and then rests (no loop, so nothing keeps moving). A re-render during the drift
     picks it up where it was (a negative delay), so the photo never jumps. */
  const DRIFT_MS = 22000;
  function photoDrift(root, fresh) {
    const img = root.querySelector('.hm-hero-img');
    if (!img || calm()) return;
    // Once per page load: a return to home picks up the clock it started on, so the drift never replays
    if (fresh && !S.driftT0) S.driftT0 = Date.now();
    const t = S.driftT0 ? Date.now() - S.driftT0 : DRIFT_MS;
    if (t >= DRIFT_MS) return;
    img.style.animationDelay = `-${t}ms`;
    img.classList.add('hm-drift');
  }

  /* ---------- Scroll reveals (home's richer copy of RN.motion.reveal) ----------
     Section heads (eyebrow, H2, lede in turn) and their cards rise 16px over 450ms as they arrive, up to six in a
     stagger 70ms apart. The rules are the shared helper's: armed by the visitor's first wheel, touch, key or scroll;
     only blocks still below the screen are parked (.hm-rv), never one taller than 40% of the screen; each block plays
     once per visit (S.rv, keyed by group and index) and a re-render never replays it. Blocks moving together never
     cover more than a third of the screen (RV.budget); past that a block simply appears. */
  const RV = { y: 16, dur: 450, step: 70, cap: 6, maxH: 0.4, budget: 0.33 };
  const RV_GROUPS = [
    ['head', '.hm-head .sec-head > *, .hm-head-r'],
    ['need', '.hm-needs > .hm-need'],
    ['seat', '.hm-seats-h, .hm-seat'],
    ['prep', '.hm-prep-hd, .hm-prep-list > li, .hm-prep-src'],
    ['work', '.hm-work .wk-show-tabs, .hm-work .wk-show-grid > .wk-tile, .hm-work .wk-show-foot'],
    ['ops', '.hm-ops .hm-car-hd, .hm-ops .hm-car-slide'],
    ['rev', '.hm-q-feature > [data-hm-arch], .hm-q-feature > .hm-q'],
    ['rep', '.hm-book, .hm-rep-txt .sec-head > *, .hm-rep-figs, .hm-rep-txt .hm-ctas, .hm-brief'],
    ['talk', '.hm-talk-h, .hm-talk-r, .hm-how-hd'],
  ];
  function rise(root, fresh) {
    if (fresh || !S.rv) S.rv = new Set();
    if (calm() || !('IntersectionObserver' in window)) return;
    const done = S.rv;
    const items = [];
    RV_GROUPS.forEach(([g, sel]) => root.querySelectorAll(sel).forEach((el, i) => { const k = g + ':' + i; if (!done.has(k)) items.push({ el, k }); }));
    if (!items.length) return;
    let io = null;
    // Area budget: blocks in motion together never cover more than about a third of the screen. A block that would
    // go over it (a fast scroll bringing in many at once) is simply shown, with no motion.
    let moving = 0;
    const show = (el, delay) => {
      const r = el.getBoundingClientRect(), vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      const a = (Math.min(r.width, vw) * Math.min(r.height, vh)) / (vw * vh);
      if (moving + a > RV.budget) { el.style.transition = 'none'; el.classList.remove('hm-rv'); void el.offsetWidth; el.style.transition = ''; return; }
      moving += a;
      el.style.setProperty('--rv-d', delay + 'ms');
      el.classList.add('hm-rv-in');
      later(() => { moving = Math.max(0, moving - a); el.classList.remove('hm-rv', 'hm-rv-in'); el.style.removeProperty('--rv-d'); }, RV.dur + delay + 80);
    };
    const arm = () => {
      if (io || !root.isConnected) return;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      io = new IntersectionObserver((ents) => {
        ents.filter((e) => e.isIntersecting).map((e) => e.target)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          .forEach((el, i) => { io.unobserve(el); done.add(el.__hmRv); show(el, Math.min(i, RV.cap - 1) * RV.step); });
      }, { rootMargin: '0px 0px 10% 0px', threshold: 0 });
      S.offs.push(() => { io.disconnect(); root.querySelectorAll('.hm-rv').forEach((el) => el.classList.remove('hm-rv', 'hm-rv-in')); });
      items.forEach(({ el, k }) => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        // On screen, above it, hidden or too tall to move: never parked
        if (r.top < vh || r.height === 0 || r.height > vh * RV.maxH || r.left >= (window.innerWidth || 0) - 1) { done.add(k); return; }
        el.__hmRv = k;
        el.classList.add('hm-rv');
        io.observe(el);
      });
    };
    // The router's own scrollTo right after mount is not a visitor scroll: scroll events in the first 150ms are ignored
    const t0 = Date.now();
    const go = (e) => { if (e && e.type === 'scroll' && Date.now() - t0 < 150) return; off(); arm(); };
    const evs = ['wheel', 'touchmove', 'keydown', 'scroll'];
    const off = () => evs.forEach((t) => window.removeEventListener(t, go, { passive: true }));
    evs.forEach((t) => window.addEventListener(t, go, { passive: true }));
    S.offs.push(off);
  }

  function runSearch(source) {
    const inp = document.getElementById('hm-q');
    if (inp) S.q = inp.value.trim();
    const q = S.q;
    if (q) RN.track('search', { q, tags: [], filters: {}, results: RN.model.search({ q }).length, source });
    // The search is handed to Browse; the hero starts clean on the next visit
    S.q = '';
    toBrowse({ q, tags: [] });
  }

  /* ---------- Actions ---------- */
  RN.submits['hm-search'] = () => runSearch('home');
  RN.inputs['hm-q'] = (el) => { S.q = el.value; };
  RN.actions['hm-cat'] = (el) => { const c = el.dataset.cat; toBrowse({ filters: { roleCategories: [c] } }, 'browse.' + c); };
  RN.actions['hm-all'] = () => toBrowse({});
  RN.actions['hm-need'] = (el) => {
    const need = el.dataset.need;
    const cats = RN.fields.needCats[need] || [];
    if (!cats.length) { RN.go('talk'); return; }
    toBrowse({ need, filters: { roleCategories: cats.slice() } }, cats.length === 1 ? 'browse.' + cats[0] : 'browse');
  };
  // Open the GTM Framework on its 5-question diagnostic (#rs-diag, rendered by research.js)
  RN.actions['hm-diag'] = () => {
    RN.track('research_cta', { source: 'home_diagnostic' });
    RN.go('framework');
    let tries = 0;
    const seek = () => {
      const t = document.getElementById('rs-diag');
      if (t) { t.scrollIntoView({ block: 'start' }); const f = t.querySelector('button, [href], input'); if (f) f.focus({ preventScroll: true }); return; }
      if (++tries < 40) setTimeout(seek, 50);
    };
    setTimeout(seek, 50);
  };
  // The Fractional GTM Pulse: one email field, one button
  RN.submits['hm-brief'] = (form, data) => {
    const email = String(data.email || '').trim();
    const inp = form.querySelector('input[name=email]');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); }
      RN.ui.toast('Enter a work email to get the Pulse.', { icon: 'info' });
      return;
    }
    RN.store.update((s) => { s.seen = s.seen || {}; s.seen[BRIEF_KEY] = { email, ts: RN.now().toISOString(), source: 'home' }; }, 'seen');
    RN.track('newsletter_signup', { source: 'home', meta: { list: 'pulse' } });
    const first = RN.fmt.date(nextIssue());
    RN.mail(email, 'You are subscribed to the Fractional GTM Pulse', `Once a quarter: the Rate Index by role category, the Demand Index and new research.\n\nFirst issue: ${first}.\nOne email a quarter. Unsubscribe from any issue in one click.`, 'newsletter');
    RN.ui.toast(`Subscribed. The next Pulse lands ${esc(RN.fmt.dateShort(nextIssue()))}.`, { icon: 'mail', action: { label: 'Open outbox', act: 'outbox' } });
    refreshBrief(true);
  };
  RN.actions['hm-brief-unsub'] = () => {
    const sub = briefSub();
    RN.store.update((s) => { if (s.seen) delete s.seen[BRIEF_KEY]; }, 'seen');
    if (sub) RN.mail(sub.email, 'You are unsubscribed from the Fractional GTM Pulse', 'You will not get the quarterly email anymore. Rates and research stay open at Revenue Nomad Insights.', 'newsletter');
    RN.ui.toast('Unsubscribed. No more quarterly emails.');
    refreshBrief(false);
  };

  /* The winding How it works path, shared with #how (pages.js). bag collects that page's cleanup functions. */
  RN.homePath = (root, bag) => stepsPath(root, calm(), bag);

  /* ---------- View ---------- */
  RN.view('home', {
    route: 'home',
    nav: '',
    chrome: 'over',
    title: () => 'Revenue Nomad · Fractional GTM leaders, research and rates',
    render: () => [hero(), problems(), workSec(), featuredSec(), quotesSec(), researchSec(), talkSec()].join(''),
    mount: (root) => {
      teardown();
      // A fresh route render (not RN.rerender) starts a new visit: the router marks it .view-enter
      const fresh = root.classList.contains('view-enter');
      if (fresh) S.pinged = null;
      heroEntrance(root, fresh);
      photoDrift(root, fresh);
      fillCharts(root);
      let rz = 0;
      on(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { const m = document.querySelector('main[data-view="home"]'); if (m) fillCharts(m); }, 150); });
      carouselRun(root);
      quoteLink(root);
      stepsLink(root, calm());
      cycleExamples(root);
      // Explanation motion, played once per visit and only below the fold (RN.motion; no-ops under reduced motion)
      rise(root, fresh);
      if (RN.motion) {
        RN.motion.draw(root.querySelector('[data-hm-chart="rates"]'), { key: 'hm-rates' });
        RN.motion.draw(root.querySelector('[data-hm-prep]'), { key: 'hm-prep' });
        root.querySelectorAll('.hm-arch-logo').forEach((a, i) => RN.motion.draw(a, { key: 'hm-arc-' + i, threshold: 0.5 }));
      }
      // Profile views that start on a home card are attributed to 'home'. Window listeners run after
      // the global document handler (which sets 'card'), so this wins for clicks inside home.
      on(window, 'click', (e) => {
        const a = e.target && e.target.closest && e.target.closest('main[data-view="home"] a[data-track-view]');
        if (a) RN.store.state._viewSource = 'home';
      });
    },
    unmount: () => { teardown(); S.carSeen = null; S.rv = null; S.pinged = null; },
  });
})();
