/* RN.costs: the canonical cost record (design pass, Oct 14, 2026; credibility and clarity audits).
   One record per seat, per function and per role category, so the guide, guides, fractional-cost, the function
   pages, rates, insights, home, the report and about all say the same number for the same thing. Every figure
   below already exists in the repo with its source; nothing here is new data.

   Two kinds of figure, never mixed in one sentence:
   - REAL: what clients paid (or, for marketing, were quoted) in Revenue Nomad's 2026 engagements, from
     js/views/function.js (SALES.cost, REVOPS.cost, MARKETING.cost, COST.rates, COST.total) and the cost guides in
     js/data/posts.js (fractional-vp-of-sales-cost, fractional-cmo-cost, keys and answer). Full-time comparisons come
     from the outside sources those pages already cite.
   - ILLUSTRATIVE: the Rate Index (js/data/market.js rateIndex), read live so it always matches #rates and the
     estimator. Shown only with RN.ui.illusTag until the first survey closes. Keys start with "ri.".

   API
     RN.costs.get(key)            the record (below), with .text holding the house-format strings; null if unknown
     RN.costs.answer(key)         one plain answer sentence naming the figures, house money format (a money range is
                                  held together by RN.fmt.keepRange, so "$200 - $250/hr" never wraps; escape as usual)
     RN.costs.basis(key, o?)      "From our 2026 engagements, as of Oct 2026" | "Quoted in our 2026 marketing searches,
                                  as of Oct 2026" | "From one 2026 engagement, a ~$55M company, as of Oct 2026" |
                                  "Illustrative". o.long: the long form for illustrative records ("Illustrative Rate
                                  Index figures, as of Sep 24, 2026, until the first survey closes"). o.html: an
                                  illustrative record returns RN.ui.illusTag() instead of text.
     RN.costs.forCat(cat)         the record a role category page should lead with: the real seat where we have one
                                  (sales_leadership -> vp-sales, revenue_operations -> revops-retainer,
                                  marketing -> cmo), otherwise its Rate Index record
     RN.costs.seats(fn)           seat records for 'sales' | 'revops' | 'marketing', in table order
     RN.costs.keys()              every key
     Keys: seats sales-coach, vp-sales, sales-assessment, cro, revops-assessment, revops-retainer, revops-project,
           revops-director, revops-architect, cmo, marketing-launch; functions sales, revops, marketing; hub (all
           three); illustrative categories ri.sales_leadership, ri.marketing, ri.revenue_operations,
           ri.sales_enablement, ri.customer_success_growth, ri.ai_gtm, ri.partnerships, ri.sellers
     RN.costs.fullTime            the sourced full-time VP of Sales figures (same object as get('vp-sales').fullTime)

   Record
     { key, kind: 'seat' | 'function' | 'hub' | 'category', status: 'real' | 'illustrative', paid: 'paid' | 'quoted',
       fn, cat, label, shortLabel, noun, scope,
       shortLabel: the seat's name in a compact list or chart row ("Director or VP of Sales"; label when unset)
       hourly: {lo, hi, approx} | null,        $ an hour
       hours: {lo, hi, approx, upTo, per: 'month'} | null, cadence: '2 days a week' | '' (when hours are not stated)
       monthly: {lo, hi, approx, flat} | null, $ a month (retainers)
       fixed: {lo, hi, approx, term} | null,   $ for an assessment or project, with its term
       yearly: {lo, hi} | null,                 12 x monthly
       fullTime: {comp, compUpTo, monthly, label, tenureMonths, replace, src, url, asOf} | null
       pct: {lo, hi, note} | null,              fractional as % of the full-time comparison
       outside: [{l, lo, hi, src, url}],        outside references the guides cite
       basis: {n, text, asOf},                  n = number of engagements behind it (null: not published)
       src: {l, url, where},
       text: {hourly, hours, monthly, fixed, yearly, fullTime, fullTimeMonthly, pct, price} }
     Money reads "$200 - $250/hr", "$4k - $10k/month", "$7.5k/month", "$27.5k fixed" (RN.fmt.k / moRange / hrRange).

   RECONCILIATION (Oct 14, 2026). The conflicts the credibility and clarity audits list, settled from the sources:
   1. VP of Sales monthly cost. The site showed $4k - $10k/month (guide, hire, cost hub), $9k - $13.5k/month (rates,
      insights, home) and $11k (report). The first is what clients paid in our 2026 engagements for a director or VP
      with a team under 5 to 8 reps ($200 - $250/hr x 20 to 40 hours). The second is the illustrative Rate Index
      middle half for all Sales Leadership rates x 40 hours ($220 - $340/hr). The third is the illustrative Rate Index
      median x 40 hours ($275 x 40, market.js report.fracVsFull). Canonical: 'vp-sales' = $200 - $250/hr, 20 to 40
      hours, $4k - $10k/month, REAL. Openers, hero answers and the about page use it. The Rate Index figures stay as
      'ri.sales_leadership', a different measure (every Sales Leadership rate, not the VP seat), always tagged
      Illustrative. The report's "$11,000" row is that illustrative median.
   2. Full-time VP of Sales. The site showed $334K a year (guide, cost hub), "$26,924+/month" (home), "$27,000+"
      (report) and $41.5k/month (rates calculator). $334K is the only sourced figure (Glassdoor 2026 via Stealth
      Agents, a secondary source). $26,924 is not a figure: it is home's count-up caught on its way to the report's
      illustrative "$27,000+". $41.5k/month is the rates calculator at its default inputs ($220K base, 25% benefits,
      60% variable, a 25% recruiting fee spread over year one), a scenario the visitor edits, not a benchmark.
      Canonical: $334K a year in total comp, $27.8k/month equivalent ($334,000 / 12), tenure about 19 months,
      replacement up to 1.5x salary with 3+ months of ramp (Skaled). Home's full-time tile and the report's full-time
      row read fullTime.monthly. The calculator keeps editable inputs labelled as its own assumptions; to start from
      the canonical pay, seed base + variable from fullTime.comp.
   3. Fractional as a share of full-time. The site showed about 41% (about: illustrative $11,000 / $27,000), 27%
      (rates calculator default) and 29% (RevOps calculator default). Canonical: 'vp-sales'.pct = 14% to 36%
      ($4k and $10k a month against $27.8k), from real engagement figures and the sourced full-time pay. The
      calculator's share stays live because it answers "at these inputs"; published copy uses 14% to 36%.
   4. Hours. The site said 20 to 40 (guide, cost hub, posts) and 20 to 50 (hire page sub and stat). Both are true
      of different things: 20 to 40 is the director or VP seat; 20 to 50 spans the sales function, from a 20-hour
      director retainer to the 50-hour embedded CRO. Canonical: 'vp-sales'.hours = 20 to 40, 'sales'.hours = 20 to
      50. A sentence about the VP of Sales seat uses 20 to 40.
   5. Sample basis. No count of 2026 engagements exists anywhere in the repo, so basis.n stays null and the line
      reads "From our 2026 engagements", never an invented count. Where the source describes one client (the ~$55M
      CRO and assessment, the ~$10M sales coach, the enterprise revenue architect), n = 1 and the basis says so.
      Marketing figures are rates quoted in 2026 searches, not paid, and say "quoted".
   6. As-of dates. Engagement figures: Oct 11, 2026 (the cost guides' updated date and posts.js asOf; the site pages
      copy they come from is dated Oct 10). Rate Index: market.js asOf (Sep 24, 2026), with the Illustrative tag.
   7. Outside references. Kept: Stealth Agents' "$8,000 to $20,000 a month commonly cited" for a fractional VP of
      Sales (the guide's full-time table uses it). Left out: the GoFractional average rate (owner: never name or link
      GoFractional). */
(function () {
  'use strict';
  const RN = window.RN;

  const AS_OF = '2026-10-11';
  const SRC_RN = { l: 'Revenue Nomad 2026 engagements', url: '', where: 'js/views/function.js (SALES, REVOPS, MARKETING, COST) and js/data/posts.js cost guides' };
  const SRC_MKT = { l: 'Revenue Nomad 2026 marketing searches, quoted rates', url: '', where: 'js/views/function.js MARKETING.cost and COST.rates; js/data/posts.js fractional-cmo-cost' };
  const STEALTH = 'https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026';
  const SKALED = 'https://skaled.com/services/fractional-vp-of-sales/';

  const FULL_TIME_VP = {
    comp: 334000, compUpTo: false, monthly: Math.round(334000 / 12),
    label: 'Average total full-time VP of Sales compensation',
    tenureMonths: 19,
    replace: { mult: 1.5, rampMonths: 3, src: 'Skaled', url: SKALED, l: 'Replacing a sales leader can cost up to 1.5x salary, with 3+ months of ramp' },
    src: 'Glassdoor 2026 via Stealth Agents, a secondary source', url: STEALTH, asOf: '2026',
  };

  const range = (lo, hi, extra) => Object.assign({ lo, hi: hi == null ? lo : hi, approx: false }, extra || {});
  const basis = (n, text) => ({ n, text, asOf: AS_OF });

  /* ---------- Seats (REAL) ---------- */
  const SEATS = [
    { key: 'sales-coach', shortLabel: 'Sales coach', fn: 'sales', cat: 'sales_leadership', label: 'Sales coach, ~$10M company', noun: 'a sales coach at a ~$10M company',
      hourly: range(150, 150, { approx: true }), hours: range(40, 40, { approx: true, per: 'month' }), monthly: range(6000, 6000, { approx: true }),
      basis: basis(1, 'From one 2026 engagement, a ~$10M company') },
    { key: 'vp-sales', shortLabel: 'Director or VP of Sales', fn: 'sales', cat: 'sales_leadership', label: 'Director or VP of Sales, teams under 5 to 8 reps', noun: 'a fractional director or VP of Sales for a team under 5 to 8 reps',
      short: 'a fractional VP of Sales', scope: 'Teams under 5 to 8 reps',
      hourly: range(200, 250), hours: range(20, 40, { per: 'month' }), monthly: range(4000, 10000),
      fullTime: FULL_TIME_VP,
      outside: [{ l: 'Fractional VP of Sales arrangements commonly cited', lo: 8000, hi: 20000, unit: 'month', src: 'Stealth Agents, a secondary source', url: STEALTH }],
      basis: basis(null, 'From our 2026 engagements') },
    { key: 'sales-assessment', shortLabel: '45-day assessment', fn: 'sales', cat: 'sales_leadership', label: 'Revenue maturity assessment, ~$55M company', noun: 'a 45-day revenue maturity assessment at a ~$55M company',
      fixed: range(27500, 27500, { term: '45 days' }), basis: basis(1, 'From one 2026 engagement, a ~$55M company') },
    { key: 'cro', shortLabel: 'Embedded CRO, ~$55M company', fn: 'sales', cat: 'sales_leadership', label: 'Embedded fractional CRO, ~$55M company', noun: 'an embedded fractional CRO at a ~$55M company',
      hourly: range(464, 464, { approx: true }), hours: range(50, 50, { per: 'month' }), monthly: range(23200, 23200),
      fullTime: { comp: 800000, compUpTo: true, monthly: Math.round(800000 / 12), label: 'The client benchmarked a full-time CRO at up to about $800K all in', tenureMonths: null, replace: null, src: 'The client’s own benchmark, 2026 engagement', url: '', asOf: '2026' },
      // First year: the $27,500 assessment plus 12 months at $23,200 = $305,900 (function.js COST.total: "about $306,000")
      firstYear: 27500 + 12 * 23200,
      basis: basis(1, 'From one 2026 engagement, a ~$55M company') },
    { key: 'revops-assessment', shortLabel: 'Assessment', fn: 'revops', cat: 'revenue_operations', label: 'RevOps assessment with scorecard, specs and roadmap', noun: 'a RevOps assessment with a scorecard, specs and roadmap',
      fixed: range(6000, 7500, { term: 'about 40 hours over 60 days' }), basis: basis(null, 'From our 2026 engagements') },
    { key: 'revops-retainer', shortLabel: 'Follow-on execution', fn: 'revops', cat: 'revenue_operations', label: 'Follow-on RevOps execution', noun: 'follow-on RevOps execution',
      hourly: range(150, 175), hours: range(40, 80, { per: 'month' }), monthly: range(6000, 14000), basis: basis(null, 'From our 2026 engagements') },
    { key: 'revops-project', shortLabel: '30-day project', fn: 'revops', cat: 'revenue_operations', label: 'Fixed 30-day RevOps project', noun: 'a fixed 30-day RevOps project',
      fixed: range(7000, 8000, { approx: true, term: '30 days' }), basis: basis(null, 'From our 2026 engagements') },
    { key: 'revops-director', shortLabel: 'Hands-on director', fn: 'revops', cat: 'revenue_operations', label: 'Hands-on RevOps director', noun: 'a hands-on RevOps director',
      cadence: 'about 2 days a week', monthly: range(12000, 15000), basis: basis(null, 'From our 2026 engagements') },
    { key: 'revops-architect', shortLabel: 'Senior revenue architect', fn: 'revops', cat: 'revenue_operations', label: 'Senior revenue architect, enterprise SaaS', noun: 'a senior revenue architect at an enterprise SaaS company',
      hourly: range(315, 315, { approx: true }), hours: range(85, 85, { upTo: true, per: 'month' }), monthly: range(27000, 27000, { flat: true }),
      compare: { l: 'A large consultancy quoted about $230K for a 6-week assessment', v: 230000, term: '6 weeks', src: 'Client quote, 2026 engagement' },
      basis: basis(1, 'From one 2026 engagement, an enterprise SaaS company') },
    { key: 'cmo', shortLabel: 'Fractional CMO', fn: 'marketing', cat: 'marketing', paid: 'quoted', label: 'Fractional CMO, PE-backed platform', noun: 'a fractional CMO for a PE-backed platform',
      short: 'a fractional CMO',
      hourly: range(200, 250), hours: range(40, 80, { per: 'month' }), monthly: range(8000, 20000),
      fullTime: null, fullTimeNote: 'No sourced full-time CMO pay figure yet, so none is shown (fractional-cmo-cost guide).',
      basis: basis(null, 'Quoted in our 2026 marketing searches'), src: SRC_MKT },
    { key: 'marketing-launch', shortLabel: 'Brand and product launch lead', fn: 'marketing', cat: 'marketing', paid: 'quoted', label: 'Brand and product marketing leader, launch scope', noun: 'a brand and product marketing leader for a launch',
      hourly: range(220, 400), hours: range(60, 80, { per: 'month' }), monthly: range(13200, 32000),
      basis: basis(null, 'Quoted in our 2026 marketing searches'), src: SRC_MKT },
  ];

  /* ---------- Functions (REAL): the span of the seats above ---------- */
  const FUNCS = [
    { key: 'sales', fn: 'sales', cat: 'sales_leadership', label: 'Sales leadership', noun: 'fractional sales leaders',
      hourly: range(150, 464), hours: range(20, 50, { per: 'month' }), monthly: range(4000, 23200), fixed: range(27500, 27500, { term: '45 days' }),
      span: 'from a director for a small team to an embedded CRO', basis: basis(null, 'From our 2026 engagements') },
    { key: 'revops', fn: 'revops', cat: 'revenue_operations', label: 'RevOps', noun: 'RevOps retainers',
      hourly: range(150, 315), hours: range(40, 85, { per: 'month' }), monthly: range(6000, 27000), fixed: range(6000, 8000, { term: 'assessments and 30-day projects' }),
      span: 'from follow-on execution to a senior revenue architect', basis: basis(null, 'From our 2026 engagements') },
    { key: 'marketing', fn: 'marketing', cat: 'marketing', paid: 'quoted', label: 'Marketing leadership', noun: 'fractional marketing leaders',
      hourly: range(200, 400), hours: range(40, 80, { per: 'month' }), monthly: range(8000, 32000),
      span: 'from a fractional CMO to a launch-scope brand and product marketing leader', basis: basis(null, 'Quoted in our 2026 marketing searches'), src: SRC_MKT },
  ];

  /* ---------- Role categories (ILLUSTRATIVE): the Rate Index, read live ---------- */
  const CAT_HOURS = { sellers: '60' }; // the cost guides price sellers at 60 hours, every other category at 40
  function catRecord(cat) {
    const ri = RN.data && RN.data.market && RN.data.market.rateIndex;
    const b = ri && ri.byCat[cat];
    if (!b) return null;
    const code = CAT_HOURS[cat] || '40';
    const m = RN.model && RN.model.monthlyRange ? RN.model.monthlyRange(cat, '5m_20m', code) : null;
    const h = +code;
    const r500 = (n) => Math.round(n / 500) * 500;
    const trend = ri.trend || [];
    return {
      key: 'ri.' + cat, kind: 'category', status: 'illustrative', paid: 'index', cat, fn: '',
      label: (RN.fields && RN.fields.catLabel ? RN.fields.catLabel(cat) : cat), shortLabel: (RN.fields && RN.fields.catLabel ? RN.fields.catLabel(cat) : cat), noun: (RN.fields && RN.fields.catLabel ? RN.fields.catLabel(cat) : cat) + ' operators',
      hourly: { lo: b.p25, hi: b.p75, mid: b.p50, approx: false },
      hours: range(h, h, { per: 'month' }),
      monthly: m ? { lo: m.lo, hi: m.hi, mid: m.mid, approx: false } : { lo: r500(b.p25 * h), hi: r500(b.p75 * h), mid: r500(b.p50 * h), approx: false },
      rev: '5m_20m', fixed: null, fullTime: null, pct: null, outside: [],
      basis: { n: b.n, text: 'Illustrative', asOf: (RN.data.market && RN.data.market.asOf) || '', quarter: trend.length ? trend[trend.length - 1].l : '' },
      src: { l: 'Rate Index (illustrative until the first survey closes)', url: '#rates', where: 'js/data/market.js rateIndex' },
    };
  }
  const CATS = ['sales_leadership', 'marketing', 'revenue_operations', 'sales_enablement', 'customer_success_growth', 'ai_gtm', 'partnerships', 'sellers'];

  /* ---------- Formatting (house style, founder Oct 12, 2026) ---------- */
  const k = (n) => RN.fmt.k(n);
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const about = (r) => (r && r.approx ? 'About ' : '');
  function hrText(r) {
    if (!r) return '';
    if (r.lo === r.hi) return about(r) + '$' + Math.round(r.lo) + '/hr';
    return RN.fmt.hrRange(r.lo, r.hi);
  }
  function moText(r) {
    if (!r) return '';
    if (r.lo === r.hi) return about(r) + k(r.lo) + '/month' + (r.flat ? ' flat' : '');
    return (r.approx ? 'About ' : '') + k(r.lo) + ' - ' + k(r.hi) + '/month';
  }
  function fixedText(r) {
    if (!r) return '';
    return about(r) + (r.lo === r.hi ? k(r.lo) : k(r.lo) + ' - ' + k(r.hi)) + ' fixed';
  }
  function hoursText(r, cadence) {
    if (!r) return cadence || '';
    const per = r.per === 'month' ? ' hours a month' : ' hours';
    if (r.upTo) return 'Up to ' + r.hi + per;
    if (r.lo === r.hi) return about(r) + r.lo + per;
    return r.lo + ' to ' + r.hi + per;
  }
  const lower = (s) => String(s || '').replace(/^About /, 'about ').replace(/^Up to /, 'up to ');
  function pctOf(rec) {
    const ft = rec.fullTime;
    if (!ft) return null;
    if (rec.firstYear && ft.compUpTo) {
      const v = Math.round((rec.firstYear / ft.comp) * 100);
      return { lo: v, hi: v, note: `First year with the assessment (${k(rec.firstYear)}) against the client’s full-time benchmark of up to ${RN.fmt.usdK(ft.comp)}` };
    }
    if (!rec.monthly) return null;
    return { lo: Math.round((rec.monthly.lo / ft.monthly) * 100), hi: Math.round((rec.monthly.hi / ft.monthly) * 100), note: `${moText(rec.monthly)} against ${k(ft.monthly)}/month, the monthly equivalent of ${RN.fmt.usdK(ft.comp)} a year` };
  }
  function finish(rec, kind) {
    const r = Object.assign({ kind, status: 'real', paid: 'paid', fn: '', cat: '', scope: '', cadence: '', hourly: null, hours: null, monthly: null, fixed: null, fullTime: null, outside: [], src: SRC_RN }, rec);
    r.shortLabel = r.shortLabel || r.label;
    r.yearly = r.monthly ? { lo: r.monthly.lo * 12, hi: r.monthly.hi * 12 } : null;
    r.pct = r.pct || pctOf(r);
    r.text = {
      hourly: hrText(r.hourly),
      hours: hoursText(r.hours, r.cadence),
      monthly: moText(r.monthly),
      fixed: fixedText(r.fixed),
      yearly: r.yearly ? (r.yearly.lo === r.yearly.hi ? k(r.yearly.lo) : k(r.yearly.lo) + ' - ' + k(r.yearly.hi)) + '/year' : '',
      fullTime: r.fullTime ? (r.fullTime.compUpTo ? 'Up to about ' : 'About ') + RN.fmt.usdK(r.fullTime.comp) + ' a year' : '',
      fullTimeMonthly: r.fullTime ? (r.fullTime.compUpTo ? 'Up to ' : '') + k(r.fullTime.monthly) + '/month' : '',
      pct: r.pct ? (r.pct.lo === r.pct.hi ? 'About ' + r.pct.lo + '%' : r.pct.lo + '% to ' + r.pct.hi + '%') : '',
      price: r.monthly ? moText(r.monthly) : fixedText(r.fixed),
    };
    return r;
  }

  const REC = {};
  SEATS.forEach((s) => { REC[s.key] = finish(s, 'seat'); });
  FUNCS.forEach((s) => { REC[s.key] = finish(s, 'function'); });
  // The cost hub: the three functions together (monthly is the span across them; marketing is quoted)
  REC.hub = finish({ key: 'hub', label: 'Sales, RevOps and marketing leadership', noun: 'fractional GTM leaders',
    hourly: range(150, 464), hours: range(20, 85, { per: 'month' }), monthly: range(4000, 32000),
    parts: ['sales', 'revops', 'marketing'], basis: basis(null, 'From our 2026 engagements and marketing searches') }, 'hub');
  const catCache = {};
  function get(key) {
    key = String(key || '');
    if (REC[key]) return REC[key];
    const cat = key.startsWith('ri.') ? key.slice(3) : null;
    if (cat && CATS.includes(cat)) {
      if (!catCache[cat]) { const c = catRecord(cat); if (c) { c.text = { hourly: RN.fmt.hrRange(c.hourly.lo, c.hourly.hi), median: '$' + c.hourly.mid + '/hr', hours: hoursText(c.hours), monthly: RN.fmt.moRange(c.monthly.lo, c.monthly.hi), monthlyMid: k(c.monthly.mid) + '/month', fixed: '', yearly: '', fullTime: '', fullTimeMonthly: '', pct: '', price: RN.fmt.moRange(c.monthly.lo, c.monthly.hi) }; catCache[cat] = c; } }
      return catCache[cat] || null;
    }
    return null;
  }

  /* ---------- Answer sentences ---------- */
  function answer(key) {
    const r = get(key);
    if (!r) return '';
    const t = r.text;
    if (r.kind === 'category') {
      return `On the illustrative Rate Index, ${r.label} operators charge a median of ${t.median}, with the middle half at ${t.hourly}, or ${t.monthly} at ${r.hours.lo} hours for a company with $5M to $20M in revenue.`;
    }
    const one = r.basis && r.basis.n === 1;
    const where = r.paid === 'quoted' ? 'in our 2026 marketing searches' : one ? 'in one of our 2026 engagements' : 'in our 2026 engagements';
    const verb = r.paid === 'quoted' ? (r.kind === 'function' ? 'were quoted' : 'was quoted') : 'ran';
    if (r.kind === 'function') {
      const lead = r.paid === 'quoted' ? `In our 2026 marketing searches, ${r.noun} ${verb}` : `In our 2026 engagements, ${r.noun} ran`;
      const fixed = r.key === 'revops' ? `, and assessments started at ${k(r.fixed.lo)} as a fixed fee` : '';
      return `${lead} ${t.monthly} for ${r.hours.lo} to ${r.hours.hi} hours a month, ${r.span}${fixed}.`;
    }
    if (r.fixed && !r.monthly) {
      // The term is said once: "a 45-day assessment" needs no "for 45 days" after it
      const termSaid = r.fixed.term && r.noun.includes(r.fixed.term.replace(/ days?$/, '-day'));
      const fee = /\bfixed\b/.test(r.noun) ? '' : ' as a fixed fee';
      return `${cap(r.noun)} ${verb} ${lower(fixedText(r.fixed)).replace(/ fixed$/, '')}${fee} ${where}${r.fixed.term && !termSaid ? `, for ${r.fixed.term}` : ''}.`;
    }
    if (!r.hourly) return `${cap(r.noun)} ${verb} ${lower(t.monthly)} ${where}${r.cadence ? `, for ${r.cadence}` : ''}.`;
    if (r.monthly && r.monthly.flat) return `${cap(r.noun)} ${verb} ${lower(t.monthly)} ${where}, ${lower(t.hourly)} for ${lower(t.hours)}.`;
    return `${cap(r.noun)} ${verb} ${lower(t.hourly)} ${where}, or ${lower(t.monthly)} for ${lower(t.hours).replace(/ a month$/, '')}.`;
  }

  function basisText(key, o) {
    o = o || {};
    const r = get(key);
    if (!r) return '';
    if (r.status === 'illustrative') {
      if (o.html && RN.ui && RN.ui.illusTag) return RN.ui.illusTag();
      if (!o.long) return 'Illustrative';
      const d = r.basis.asOf ? RN.fmt.date(r.basis.asOf + 'T12:00:00') : '';
      return `Illustrative Rate Index figures${d ? ', as of ' + d : ''}, until the first survey closes`;
    }
    return `${r.basis.text}, as of ${RN.fmt.monthYear(r.basis.asOf + 'T12:00:00')}`;
  }

  // The cost hub answer: the three functions in one sentence
  function hubAnswer() {
    const s = REC.sales.text.monthly, o = REC.revops.text.monthly, m = REC.marketing.text.monthly;
    return `In our 2026 engagements, sales leaders ran ${s} and RevOps leaders ${o}, and marketing leaders were quoted ${m}.`;
  }

  const FOR_CAT = { sales_leadership: 'vp-sales', revenue_operations: 'revops-retainer', marketing: 'cmo' };

  RN.costs = {
    asOf: AS_OF,
    fullTime: FULL_TIME_VP,
    get,
    // Money ranges inside a sentence never break across lines ("$200 - $250/hr" stays together: RN.fmt.keepRange)
    answer: (key) => RN.fmt.keepRange(key === 'hub' ? hubAnswer() : answer(key)),
    basis: basisText,
    forCat: (cat) => get(FOR_CAT[cat] || 'ri.' + cat),
    seats: (fn) => SEATS.filter((s) => !fn || s.fn === fn).map((s) => REC[s.key]),
    keys: () => Object.keys(REC).concat(CATS.map((c) => 'ri.' + c)),
  };
})();
