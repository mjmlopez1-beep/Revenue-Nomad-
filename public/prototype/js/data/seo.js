/* RN.seo: the live site's head for every route (title, description, canonical, robots, Open Graph and JSON-LD).
   The prototype is one page with hash routes (#guide.<slug>), so search and AI engines cannot index its pages one by
   one. This file is the spec the live site builds from: the router (js/core/router.js) applies it on every route
   change, and tools/build-seo.js writes it out as seo-spec/head.json, the sitemaps, robots.txt and llms.txt.

   CANONICAL HOST. https://revenuenomad.com, non-www. OWNER DECISION still open: www or non-www. The live blog is on
   www today, and js/views/profile.js (profile share link), js/views/studio-a.js (Search and AI visibility preview and
   its ProfilePage sample) and research.js's OLD_BLOG (the rebuilt posts' in-page Article and BreadcrumbList) build
   https://www.revenuenomad.com URLs, while RN.share (js/core/contribute.js), the badge snippet, studio-b.js and
   research.js's library and glossary schema use non-www. Whichever wins, the other host 301s to it and every builder
   uses RN.seo.url(). Every path redirect matches on both hosts and sends straight to HOST, so an old www post URL
   takes one hop, not two.

   PATHS. RN.seo.path(route) follows RN.share.url: dots become slashes, underscores become hyphens
   (#rates.revenue_operations -> /rates/revenue-operations). Two first tokens map to another word, both already in
   use in the repo and both OWNER DECISIONS:
   - guide.<slug> -> /post/<slug>. The live blog's URLs are /post/<slug>, and research.js's redirect table and Article
     schema already point the rebuilt guides there, so the 301s from the old posts land without a second hop.
   - op.<slug> -> /operators/<slug>. profile.js's share link and studio-a.js's search preview already show this form
     to operators. RN.share.url still builds /op/<slug> and /guide/<slug>; the live site 301s both to these paths.

   RULES (house rules, Oct 14, 2026)
   - Title <= 60 characters, the brand suffix " · Revenue Nomad" only when it fits; no colons; cost pages carry the
     year and the REAL figure ("Fractional VP of Sales Cost (2026) - $4k - $10k/month").
   - Description <= 155 characters, a complete answer sentence, real figures from RN.costs where they exist. An
     illustrative Rate Index or report figure never appears in a title or description.
   - robots 'index,follow' for public pages; 'noindex' for app and private routes (studio, buyer, admin, standards,
     review, proof, compare, engagement drafts and posts, the application steps, talk questionnaire steps), sample
     operator profiles, placeholder work samples, unknown slugs and the 404.
   - Structured data only from real data: Organization + WebSite (SearchAction) on every page, BreadcrumbList on every
     page, FAQPage where the page shows its FAQ, Article for guides (author Organization "Revenue Nomad Research"),
     ProfilePage + Person for real operator profiles only, Occupation with the hourly and monthly ranges only on the
     two real cost guides (one URL per seat: vp-sales, cmo), named after the seat the figures come from. The
     illustrative Rate Index and report get no Occupation or salary markup; their Dataset says first that the figures
     are illustrative. BreadcrumbList follows the trail the page shows (no list on home, which has none).
   - Sample operators and placeholder work samples are prototype-only (live: false): head.json leaves them out, so
     the live site never serves an invented person at a public URL.
   - A guide with a future publish date is noindex until that date (rerun tools/build-seo.js on the day).
   - The founder is an operator like any other: he has a profile like every operator, is never the Organization's
     founder, author, contact or face, and never leads a list (RN.model.notFirst).

   API
     RN.seo.host                         'https://revenuenomad.com'
     RN.seo.path(route)                  '/rates/revenue-operations' ('/' for home); aliases resolve first (RN.canonical)
     RN.seo.url(route)                   host + path
     RN.seo.head(route, ctx?)            { route, path, canonical, title, description, robots, ogType, schema: [nodes],
                                           sitemap: 'pages'|'guides'|'roles'|'operators'|null, lastmod, label, answer,
                                           publish, illustrative }. ctx.view / ctx.params come from the router.
     RN.seo.jsonld(head)                 the <script type="application/ld+json"> text ('<' escaped)
     RN.seo.routes()                     every concrete canonical route: tools/check.js's enumeration plus every family
     RN.seo.all()                        RN.seo.head() for each of RN.seo.routes()
     RN.seo.redirects()                  [{ from, to, code, why, after?, anyHost }] for the live site: exact paths first,
                                           then wildcards, then the host rule. after = the target guide's publish date.
     RN.seo.org()                        the Organization node */
(function () {
  'use strict';
  const RN = (window.RN = window.RN || {});

  const HOST = 'https://revenuenomad.com'; // non-www; owner decision pending (see the header)
  const BRAND = 'Revenue Nomad';
  const SUFFIX = ' · ' + BRAND;
  const MAX_T = 60, MAX_D = 155;
  const BASE = { guide: 'post', op: 'operators' }; // first-token renames (owner decisions, see the header)
  const ORG_ID = HOST + '/#organization', SITE_ID = HOST + '/#website';
  const RESEARCH = 'Revenue Nomad Research';
  // Google asks for a logo of at least 112 x 112 px; assets/brand/mark.png is 45 x 48, so the live site hosts a
  // square export here (launch checklist in seo-spec/README.md)
  const LOGO = HOST + '/assets/brand/logo-512.png';
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- Text ---------- */
  // Plain, house-style text: no tags, no no-break or zero-width characters, hyphens only, single spaces
  const clean = (t) => String(t == null ? '' : t).replace(/<[^>]+>/g, '')
    .replace(/[  ]/g, ' ').replace(/[⁠​]/g, '').replace(/‑/g, '-')
    .replace(/\s*[–—]\s*/g, ' - ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const noColon = (t) => clean(t).replace(/\s*:\s*/g, ', ');
  const brand = (t) => { t = noColon(t); return !/Revenue Nomad/.test(t) && (t + SUFFIX).length <= MAX_T ? t + SUFFIX : t; };
  // Sentences end at . ! ? before a capital letter or the end, so "$23.2k" and "30/60/90-day" stay whole
  const sentences = (t) => clean(t).match(/[\s\S]+?[.!?](?=\s+[A-Z"'(\[]|\s*$)/g) || [clean(t)];
  // As many whole sentences as fit in max characters (at least the first, if it fits)
  function fit(parts, max) {
    max = max || MAX_D;
    let out = '';
    for (const p of [].concat(parts).flatMap((x) => sentences(x)).map((x) => x.trim()).filter(Boolean)) {
      const next = out ? out + ' ' + p : p;
      if (next.length > max) break;
      out = next;
    }
    return out;
  }
  // Function-page and post tokens to plain text: a pending chip drops out, a link keeps its label, a cost token resolves
  function plain(t) {
    return clean(String(t == null ? '' : t)
      .replace(/\[\[cost:([\w.-]+?)\.(\w+)((?:\|\w+)*)\]\]/g, (m, k, f) => { const r = RN.costs && RN.costs.get(k); return f === 'answer' ? RN.costs.answer(k) : (r && r.text && r.text[f]) || ''; })
      .replace(/\s*\[\[gap:[^\]]*\]\]/g, '')
      .replace(/\[\[(?:link|url):[^\]|]+\|([^\]]+)\]\]/g, '$1')
      .replace(/\[\[net\]\]/g, String((RN.data && RN.data.market && RN.data.market.network && RN.data.market.network.operators) || '350+'))
      .replace(/\*\*/g, ''))
      .replace(/\s+([.,;?!])/g, '$1').replace(/\(\s*\)/g, '');
  }
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  /* ---------- Paths ---------- */
  const canon = (route) => {
    const r = String(route == null ? '' : route).replace(/^#/, '').trim();
    return (RN.canonical ? RN.canonical(r) : r) || 'home';
  };
  function path(route) {
    const r = canon(route);
    if (r === 'home') return '/';
    const parts = r.split('.').filter(Boolean);
    if (BASE[parts[0]] && parts.length > 1) parts[0] = BASE[parts[0]];
    return '/' + parts.map((x) => encodeURIComponent(x.replace(/_/g, '-'))).join('/');
  }
  const url = (route) => HOST + (path(route) === '/' ? '/' : path(route));

  /* ---------- Data access (all read at call time: views register after this file loads) ---------- */
  const F = () => RN.fields || {};
  const cats = () => ((F().roleCategory && F().roleCategory.options) || []).map((o) => o.v);
  const catLabel = (c) => (F().catLabel ? F().catLabel(c) : c);
  const needs = () => ((F().need && F().need.options) || []).map((o) => o.v);
  const needLabel = (n) => { const o = ((F().need && F().need.options) || []).find((x) => x.v === n); return o ? o.l : n; };
  const guides = () => (RN.research && RN.research.guides) || [];
  const guideBy = (slug) => guides().find((g) => g.slug === slug);
  const bps = () => (RN.projects && RN.projects.blueprints) || [];
  const bpBy = (id) => bps().find((b) => b.id === id);
  const works = () => (RN.work && RN.work.all ? RN.work.all() : []);
  const workBy = (id) => works().find((w) => w.id === id);
  const allOps = () => (RN.model && RN.model.allOps) || [];
  const opBy = (slug) => (RN.model && RN.model.bySlug ? RN.model.bySlug(slug) : allOps().find((o) => o.slug === slug));
  const realOp = (op) => !!op && !op.sample && !op.hidden;
  const C = (k) => (RN.costs ? RN.costs.get(k) : null);
  const answer = (k) => (RN.costs ? clean(RN.costs.answer(k)) : '');
  const mk = () => (RN.data && RN.data.market) || {};
  const illus = () => mk().illustrative !== false;
  const fnPage = (k) => (RN.fn && RN.fn.pages && RN.fn.pages[k]) || null;
  const FN_KEY = { 'hire-fractional-sales-vp': 'sales', 'fractional-revops': 'revops', 'fractional-marketing-leadership': 'marketing', 'fractional-cost': 'cost' };
  const year = () => { const a = RN.costs && RN.costs.asOf; return a ? +a.slice(0, 4) : 2026; };

  /* ---------- Role cost pages backed by REAL figures (RN.costs seats) ---------- */
  // The only categories with a real seat record (RN.costs.forCat); every other category is the illustrative Rate Index.
  // Each record is ONE seat, not the whole role: its figures are named after that seat (SEAT_P, the page's own words)
  const REAL_CAT = { sales_leadership: 'vp-sales', revenue_operations: 'revops-retainer', marketing: 'cmo' };
  const SEAT_P = { 'vp-sales': 'A director or VP of Sales for a team under 5 to 8 reps', 'revops-retainer': 'Follow-on RevOps execution', cmo: 'A fractional CMO for a PE-backed platform' };
  // Plain seat names, the same as the Rate Index role pages (insights.js ROLE_T)
  const ROLE_T = { sales_leadership: 'Sales Leader', marketing: 'Marketing Leader', revenue_operations: 'RevOps Leader', sales_enablement: 'Sales Enablement Leader', customer_success_growth: 'Customer Success Leader', ai_gtm: 'AI GTM Leader', partnerships: 'Partnerships Leader', sellers: 'Seller' };
  const OCC_NAME = { 'vp-sales': 'Fractional Director or VP of Sales', cmo: 'Fractional Chief Marketing Officer' };
  // Real cost guides: the guide whose answer is the seat's RN.costs answer. The seat's Occupation lives only here, so
  // one URL carries each seat's salary markup (the Rate Index role pages and the cost hub do not repeat it)
  const COST_GUIDE = { 'fractional-vp-of-sales-cost': 'vp-sales', 'fractional-cmo-cost': 'cmo' };

  /* ---------- Schema nodes ---------- */
  function org() {
    return {
      '@type': 'Organization', '@id': ORG_ID, name: BRAND, url: HOST + '/',
      logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 },
      description: 'Revenue Nomad is a marketplace of fractional go-to-market operators: sales, marketing, RevOps and AI GTM leaders companies hire part time, with reviews only from companies that hired them.',
    };
  }
  function website() {
    return {
      '@type': 'WebSite', '@id': SITE_ID, name: BRAND, url: HOST + '/', publisher: { '@id': ORG_ID }, inLanguage: 'en-US',
      // The live browse page must accept ?q= (the prototype keeps the query in local state)
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: HOST + '/browse?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
    };
  }
  const research = () => ({ '@type': 'Organization', name: RESEARCH, url: HOST + '/insights', parentOrganization: { '@id': ORG_ID } });
  // The trail the page shows (nav.crumbs), plus the page itself when the trail stops at its section
  function crumbs(list) {
    if (list.length < 2) return null;
    return { '@type': 'BreadcrumbList', itemListElement: list.map(([name, route], i) => ({ '@type': 'ListItem', position: i + 1, name: clean(name), item: url(route) })) };
  }
  function faqNode(items, route) {
    const qs = items.filter((x) => x && x.q && x.a);
    if (!qs.length) return null;
    return { '@type': 'FAQPage', '@id': url(route) + '#faq', mainEntity: qs.map((x) => ({ '@type': 'Question', name: clean(x.q), acceptedAnswer: { '@type': 'Answer', text: clean(x.a) } })) };
  }
  // A real seat as an Occupation. The figures are ranges clients paid (or, for marketing, were quoted) in our 2026
  // engagements, not percentiles of a market distribution, so each is a MonetaryAmount with minValue and maxValue
  // (schema.org's MonetaryAmountDistribution only has percentile and median fields, which would invent a distribution).
  function occupation(key, route) {
    const r = C(key);
    if (!r || r.status !== 'real' || !r.hourly || !r.monthly) return null;
    const basis = RN.costs.basis(key);
    const hrs = r.hours ? r.text.hours : '';
    return {
      '@type': 'Occupation', '@id': url(route) + '#occupation-' + key,
      name: OCC_NAME[key] || ('Fractional ' + r.shortLabel),
      description: `${clean(RN.costs.answer(key))} Basis: ${basis}. Fractional, part-time engagements with Revenue Nomad operators, not full-time salaries.`,
      occupationalCategory: catLabel(r.cat),
      estimatedSalary: [
        { '@type': 'MonetaryAmount', name: 'Hourly rate, ' + lowerFirst(basis), currency: 'USD', value: { '@type': 'QuantitativeValue', minValue: r.hourly.lo, maxValue: r.hourly.hi, unitText: 'HOUR' } },
        { '@type': 'MonetaryAmount', name: `Monthly retainer for ${lowerFirst(hrs)}, ${lowerFirst(basis)}`, currency: 'USD', value: { '@type': 'QuantitativeValue', minValue: r.monthly.lo, maxValue: r.monthly.hi, unitText: 'MONTH' } },
      ],
      mainEntityOfPage: url(route),
    };
  }
  // The illustrative Rate Index and report: a Dataset whose description says first that the figures are illustrative
  function illusDataset(route, name, what) {
    return {
      '@type': 'Dataset', '@id': url(route) + '#dataset', name: name + (illus() ? ' (illustrative preview)' : ''),
      description: (illus() ? 'Illustrative figures, not measured data. This preview shows the shape of the research until the first State of Fractional GTM survey closes and real results replace it. ' : '') + what,
      url: url(route), creator: research(), publisher: { '@id': ORG_ID }, isAccessibleForFree: true,
      dateModified: mk().asOf || undefined, keywords: illus() ? ['illustrative', 'preview', 'fractional GTM'] : ['fractional GTM'],
    };
  }
  // The cost hub's REAL figures: what clients paid (sales, RevOps) and were quoted (marketing) in 2026 engagements
  function realDataset(route) {
    return {
      '@type': 'Dataset', '@id': url(route) + '#dataset', name: 'Fractional GTM leadership rates from Revenue Nomad 2026 engagements',
      description: `Hourly and monthly rates for fractional sales, RevOps and marketing leadership seats. Sales and RevOps figures are what companies paid in our 2026 engagements; marketing figures are rates quoted in our 2026 searches. ${clean(RN.costs.answer('hub'))} As of ${RN.fmt && RN.fmt.monthYear ? RN.fmt.monthYear(RN.costs.asOf + 'T12:00:00') : RN.costs.asOf}.`,
      url: url(route), creator: research(), publisher: { '@id': ORG_ID }, isAccessibleForFree: true, dateModified: RN.costs.asOf,
      variableMeasured: ['Hourly rate (USD)', 'Monthly retainer (USD)', 'Hours a month'],
    };
  }
  function article(g, route, desc) {
    const p = g.post;
    const pub = (p && p.publish) || g.updated;
    // A post written before its publish date is first published on that date: dateModified never precedes it
    const mod = g.updated && g.updated > pub ? g.updated : pub;
    return {
      '@type': 'Article', '@id': url(route) + '#article', headline: clean(g.q).slice(0, 110), description: desc,
      datePublished: pub, dateModified: mod, inLanguage: 'en-US',
      author: research(), publisher: { '@id': ORG_ID }, mainEntityOfPage: url(route), isPartOf: { '@id': SITE_ID },
    };
  }
  // Operator title and description: name and role, then focus areas (third person, like the rest of the sentence), or the
  // operator's own headline in quotes when there are no focus areas
  const jobTitle = (op) => (/^fractional\b/i.test(op.role || '') ? clean(op.role) : 'Fractional ' + clean(op.role || 'GTM operator'));
  function opDesc(op) {
    const base = `${clean(op.name)} is a ${lowerFirst(jobTitle(op))} on Revenue Nomad.`;
    // Focus areas in house copy: a tag name with a word the house style avoids ("Commit/best case framework") is skipped
    const tags = (op.tags || []).map((t) => clean(t.t || t)).filter((t) => t && !/\b(best|top|unlock|leverage|world-class)\b/i.test(t));
    for (let n = Math.min(3, tags.length); n > 0; n--) {
      const list = tags.slice(0, n);
      const s = `${base} Focus areas include ${list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]}.`;
      if (s.length <= MAX_D) return s;
    }
    const h = clean(op.headline || '').replace(/["\u201c\u201d]/g, "'").replace(/[.!?]+$/, '');
    if (h && (`${base} In their words, "${h}."`).length <= MAX_D) return `${base} In their words, "${h}."`;
    return base;
  }
  function person(op, route) {
    const local = op.photo && !/^(https?:)?\/\//.test(op.photo) && !/^data:/.test(op.photo);
    const node = { '@type': 'Person', '@id': url(route) + '#person', name: clean(op.name), jobTitle: jobTitle(op), url: url(route) };
    if (op.headline) node.description = clean(op.headline);
    if (local) node.image = HOST + '/' + String(op.photo).replace(/^\.?\//, '');
    return node;
  }

  /* ---------- Static copy (titles and answer-first descriptions) ---------- */
  const T = {
    home: { t: 'Revenue Nomad · Fractional GTM Leaders, Rates and Research', d: () => 'Revenue Nomad is a network of fractional sales, marketing, RevOps and AI GTM leaders, reviewed only by companies that hired them. No fees for companies.' },
    how: { c: 'How it works', t: 'How Revenue Nomad Works for Companies and Operators', d: () => 'Companies find proven fractional GTM leaders without a retained search, and operators get found and build proof. How matching, reviews and intros work.' },
    talk: { c: 'Talk to us', t: 'Talk to Us About a Fractional GTM Hire', d: () => 'Four quick questions about the seat and the problem. We show you three operators right away, and a person replies within one business day.' },
    about: { c: 'About', t: 'About Revenue Nomad, the Fractional GTM Network', d: () => 'Revenue Nomad is the open network for fractional go-to-market leaders, matched on fit and backed by proof a company confirmed.' },
    results: { c: 'Results', t: 'Company Reviews of Fractional GTM Operators', d: () => 'Company reviews of fractional GTM operators on Revenue Nomad, written by the company that hired them and published as submitted.' },
    operators: { c: 'For operators', t: 'Get Found by Companies Hiring Fractional GTM Leaders', d: () => 'Fractional GTM operators apply once and get a profile companies can trust, plus a Studio that shows who viewed them and why. Joining is free.' },
    levels: { c: 'Levels', t: 'Levels and the Reputation Index', d: () => 'The Reputation Index is a 0 to 100 score built from company evidence. How the tiers from Emerging to Apex work and what moves a score.' },
    join: { c: 'Join', t: 'Join Revenue Nomad as a Company or Operator', d: () => 'Companies browse and post engagements without an account and pay no fees. Fractional operators apply once and get a profile companies can trust.' },
    browse: { t: 'Browse Fractional GTM Operators', d: () => 'Browse open profiles of fractional GTM operators. Reviews and focus areas a company confirmed are marked Verified, and no login is needed to browse.' },
    compare: { t: 'Compare Operators', d: () => 'Compare fractional operators side by side on the same standard fields, up to four at a time.', noindex: true },
    engagements: { t: 'Post a Fractional GTM Engagement', d: () => 'Describe the seat once and get ranked fractional operators. We score every operator in the role against your brief, and posting is free for companies.' },
    blueprints: { t: 'Fractional GTM Engagement Blueprints', d: () => `The ${bps().length || 10} engagements companies ask for most, each written as the problem it fixes and the fractional seat that fixes it.`.replace(/^The 10 /, 'The ten ') },
    work: { t: 'The Work Behind Fractional GTM Operators', d: () => 'Playbooks, comp plans, dashboards and 30/60/90 plans fractional operators have built. Start from the deliverable you need, then meet who built it.' },
    insights: { t: 'Fractional GTM Insights, Rates and Research', d: () => 'Rates, demand and research on fractional go-to-market leadership, with real 2026 engagement rates and illustrative previews of the Rate Index and report.' },
    report: { t: () => `The State of Fractional GTM ${(mk().report && mk().report.year) || 2027}, Preview Edition`, d: () => `A preview edition of The State of Fractional GTM ${(mk().report && mk().report.year) || 2027}. Every figure in it is illustrative until the first survey closes and real results replace it.` },
    framework: { c: 'GTM Framework', t: 'GTM Framework for Fractional Revenue Work', d: () => 'The GTM Framework places all go-to-market work on two lenses, the area of work and the stage of the customer journey it changes.' },
    library: { c: 'Fit Tag Library', t: 'Fit Tag Library for Fractional GTM Work', d: () => 'Focus areas (fit tags) name the specific work a fractional operator does. One shared list for profiles, company filters and verified reviews.' },
    guides: { t: 'Fractional GTM Guides for Companies Hiring', d: () => 'Straight answers on hiring fractional sales, RevOps and marketing leaders. Each guide answers one question in its first lines, then shows the numbers.' },
    notfound: { t: 'Page Not Found', d: () => 'We could not find that page. The link may be old or the page moved. Search the network or start from the home page.', noindex: true },
    studio: { t: 'Studio', d: () => 'The operator Studio, private to signed-in operators on Revenue Nomad.', noindex: true },
    buyer: { t: 'Company Workspace', d: () => 'The company workspace, private to signed-in companies on Revenue Nomad.', noindex: true },
    admin: { t: 'Admin', d: () => 'The Revenue Nomad team admin, private to the team.', noindex: true },
    standards: { t: 'Standards', d: () => 'Design and content standards for the Revenue Nomad team, private to the team.', noindex: true },
    'join.operator': { t: 'Operator Application', d: () => 'Apply to Revenue Nomad as a fractional operator. Step 1 of the application, what you lead and the highest title you have held.', noindex: true },
    'join.done': { t: 'Application Received', d: () => 'Your Revenue Nomad operator application is in. The team reviews every application within 2 business days.', noindex: true },
    'engagement.new': { t: 'Post an Engagement, New Brief', d: () => 'Start a new engagement brief for a fractional GTM seat. Private to the company writing it.', noindex: true },
  };
  // Function pages: the page's own title, real figures from RN.costs (read live)
  const FN_T = {
    sales: { t: 'Hire a Fractional VP of Sales or CRO', d: () => { const r = C('vp-sales').text; return `A fractional VP of Sales who has built sales at your stage, ${lowerFirst(r.hours)} for ${r.monthly} in our 2026 engagements. Talk to us for vetted operators.`; } },
    revops: { t: 'Fractional RevOps Leaders for B2B SaaS', d: () => { const r = C('revops-retainer').text; return `A fractional revenue architect who turns your bookings goal into pipeline math, ${lowerFirst(r.hours)} for ${r.monthly} in our 2026 engagements.`; } },
    marketing: { t: 'Fractional CMO and Marketing Leaders', d: () => { const r = C('cmo').text; return `A demand gen operator or fractional CMO who holds your agencies to a number, ${lowerFirst(r.hours)}, quoted at ${r.monthly} in our 2026 searches.`; } },
    cost: { t: () => `What Fractional GTM Leaders Cost (${year()}), ${C('hub').text.monthly}`, d: () => answer('hub') },
  };
  // Role category pages (browse.<cat>): what the seat does, in one sentence (from browse.js's category copy)
  const CAT_D = {
    sales_leadership: 'A fractional sales leader owns the number part time, fixing the sales process, hiring and coaching reps and running the forecast. Browse open profiles.',
    marketing: 'A fractional marketing leader sets positioning, picks the channels that fit the budget and builds a demand engine sales trusts. Browse open profiles.',
    revenue_operations: 'A fractional RevOps leader makes the revenue system work, from CRM cleanup and lead routing to forecasting and dashboards. Browse open profiles.',
    sales_enablement: 'A fractional enablement leader gets reps productive faster with onboarding, playbooks, a sales methodology and call coaching. Browse open profiles.',
    customer_success_growth: 'A fractional customer success leader protects and grows existing revenue with onboarding, renewals, health scoring and expansion. Browse open profiles.',
    ai_gtm: 'A fractional AI GTM specialist automates the work around selling, from enrichment and lead scoring to outbound and account research. Browse open profiles.',
    partnerships: 'A fractional partnerships leader builds revenue through integrations, resellers, agencies and cloud marketplaces. Browse open profiles.',
    sellers: 'A fractional seller works deals part time or on a project, as an account executive, SDR or account manager. Browse open profiles.',
  };
  // Prototype-era guides (research.js GUIDES, not in posts.js): titles under 60 characters without a colon, and an
  // answer sentence without the illustrative Rate Index figures their bodies quote
  const GUIDE_T = {
    'how-to-scope-a-fractional-sales-engagement': 'How to Scope a Fractional Sales Engagement',
    'fractional-revops-first-90-days': 'Fractional RevOps First 90 Days, What to Expect',
    'evaluate-fractional-operator-track-record': 'How to Evaluate a Fractional Operator Track Record',
    'how-much-should-a-fractional-operator-charge': 'How Much Should a Fractional Operator Charge?',
    'how-fractional-operators-win-direct-deals': 'How Fractional Operators Win Direct Deals',
    'what-is-the-reputation-index': 'What Is the Revenue Nomad Reputation Index?',
    'what-is-core': 'What Is CORE, the Company Review for Operators?',
    'fractional-revops-cost': 'Fractional RevOps Leader Cost Guide (2026)',
    'fractional-sales-enablement-cost': 'Fractional Sales Enablement Cost Guide (2026)',
    'fractional-customer-success-cost': 'Fractional VP of Customer Success Cost Guide (2026)',
    'fractional-ai-gtm-cost': 'Fractional AI GTM Architect Cost Guide (2026)',
    'fractional-partnerships-cost': 'Fractional VP of Partnerships Cost Guide (2026)',
    'fractional-account-executive-cost': 'Fractional Account Executive Cost Guide (2026)',
    // Posts whose meta title is replaced: cost pages carry the year and the real figure
    // (a comma before the figure: " - " also sits inside the money range, so a dash separator reads ambiguously)
    'fractional-vp-of-sales-cost': () => `Fractional VP of Sales Cost (${year()}), ${C('vp-sales').text.monthly}`,
    'fractional-cmo-cost': () => `Fractional CMO Cost (${year()}), ${C('cmo').text.monthly}`,
  };
  // Answers too short for a description on their own (under 70 characters once the first sentence is cut to fit)
  const GUIDE_D = {};
  // Guides whose answer rests on the illustrative Rate Index or report (a median, a share, "most", "usually"): a
  // hand-written description that states no illustrative figure or finding
  const ILLUS_GUIDE_D = {
    'how-to-scope-a-fractional-sales-engagement': 'Scope it around one measurable outcome, a fixed number of hours a month and an initial term, then agree the 90-day deliverables before day one.',
    'how-fractional-operators-win-direct-deals': 'Operators win direct deals faster with proof a prospect can check: company-verified focus areas, CORE reviews and a private proof link from Studio.',
    'how-much-should-a-fractional-operator-charge': 'Price from the rate for your role and the size of the companies you serve, then adjust for verified proof and scope. How to set and raise a fractional rate.',
    'fractional-revops-cost': 'How hours, company size and scope move the cost of a fractional RevOps leader, shown on the illustrative Rate Index preview, not measured data.',
    'fractional-sales-enablement-cost': 'How hours, company size and scope move the cost of a fractional sales enablement leader, shown on the illustrative Rate Index preview.',
    'fractional-customer-success-cost': 'How hours, company size and scope move the cost of a fractional VP of Customer Success, shown on the illustrative Rate Index preview.',
    'fractional-ai-gtm-cost': 'How hours, company size and scope move the cost of a fractional AI GTM architect, shown on the illustrative Rate Index preview.',
    'fractional-partnerships-cost': 'How hours, company size and scope move the cost of a fractional VP of Partnerships, shown on the illustrative Rate Index preview.',
    'fractional-account-executive-cost': 'How hours, company size and scope move the cost of a fractional account executive, shown on the illustrative Rate Index preview.',
  };
  // A guide whose body leans on the illustrative Rate Index or report: no figure from it in the description, the
  // llms.txt answer or the FAQPage markup
  const illusGuide = (g) => !g.post && (g.group === 'costs' || Object.prototype.hasOwnProperty.call(ILLUS_GUIDE_D, g.slug));
  // An FAQ answer on such a guide that quotes a figure or a share-like finding stays out of the markup
  const ILLUS_TEXT = /\$|%|\d+x\b|\bmedian\b|\bmost\b|\busually\b|\btypical(ly)?\b|\bmajority\b|\bRate Index\b|\bsurvey\b/i;
  // The guide groups as the page's breadcrumb names them (research.js GROUPS), anchored on the Guides page
  const GROUP_L = { sales: 'Sales leadership', revops: 'RevOps', marketing: 'Marketing', costs: 'What each role costs', operators: 'For operators', methods: 'About our methods' };

  /* ---------- Heads ---------- */
  const head0 = (route) => ({ route, path: path(route), canonical: url(route), title: '', description: '', robots: 'index,follow', ogType: 'website', schema: [], sitemap: 'pages', lastmod: null, label: '', answer: '', publish: null, illustrative: false, live: true });
  const base = () => [org(), website()];
  const HOME = ['Home', 'home'];
  const viewTitle = (ctx, route) => {
    try { const v = ctx && ctx.view; if (v && v.title) return clean(v.title((ctx && ctx.params) || {})).replace(/ · /g, ' - '); } catch (e) { /* fall through */ }
    return route.split('.')[0].replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
  };
  function priv(h, title, desc, trail) {
    h.title = brand(title); h.description = fit(desc); h.robots = 'noindex'; h.sitemap = null;
    h.schema = base().concat([crumbs([HOME].concat(trail || [[title, h.route]]))].filter(Boolean));
    return h;
  }

  function head(route, ctx) {
    const r = canon(route);
    const h = head0(r);
    const parts = r.split('.');
    const [a, b, c] = parts;
    const n = parts.length;
    // trail: the page's breadcrumb. vis = the page shows that trail itself (nav.crumbs), so no Home is put in front
    const S = (t, d, trail, extra, vis) => { h.title = brand(typeof t === 'function' ? t() : t); h.description = fit(d); h.label = h.label || noColon(typeof t === 'function' ? t() : t); h.schema = base().concat([crumbs((vis ? [] : [HOME]).concat(trail || [[h.label, r]]))], extra || []).filter(Boolean); return h; };
    const INS = ['Insights', 'insights'], RI = ['Rate Index', 'rates'], ENG = ['Post an engagement', 'engagements'], BROWSE = ['Browse talent', 'browse'];

    // Home (no breadcrumb: a one-item list says nothing)
    if (r === 'home') { h.title = T.home.t; h.description = fit(T.home.d()); h.label = BRAND; h.schema = base(); return h; }

    // Single-token public pages
    if (n === 1 && T[a] && !T[a].noindex && !['browse', 'work', 'report', 'insights', 'guides', 'blueprints', 'engagements', 'framework', 'library'].includes(a)) return S(T[a].t, T[a].d(), [[T[a].c || noColon(T[a].t), r]]);
    if (n === 1 && T[a] && T[a].noindex) return priv(h, T[a].t, T[a].d(), [[T[a].t, r]]);
    if (T[r] && T[r].noindex) return priv(h, T[r].t, T[r].d(), [[T[r].t, r]]);

    // Function pages and the cost hub (real figures)
    if (n === 1 && FN_KEY[a]) {
      const k = FN_KEY[a], d = FN_T[k], pg = fnPage(k);
      const faq = pg && pg.faq ? faqNode(pg.faq.map((x) => (Array.isArray(x) ? { q: plain(x[0]), a: plain(x[1]) } : { q: plain(x.q), a: plain(x.a) })), r) : null;
      h.sitemap = 'roles';
      if (k === 'cost') {
        h.lastmod = RN.costs.asOf;
        return S(d.t, d.d(), [['Cost of fractional GTM leaders', r]], [faq, realDataset(r)]);
      }
      return S(d.t, d.d(), null, [faq]);
    }

    // Browse
    if (a === 'browse') {
      if (n === 1) return S(T.browse.t, T.browse.d(), [['Browse talent', r]]);
      if (n === 2 && cats().includes(b)) { h.sitemap = 'roles'; return S(`Fractional ${catLabel(b)} for Hire`, CAT_D[b] || `Browse fractional ${catLabel(b)} operators on Revenue Nomad. Open profiles, verified company reviews and no fees for companies.`, [BROWSE, [catLabel(b), r]], null, true); }
    }

    // Operator profiles: real ones are indexed with ProfilePage + Person; samples and unknown slugs are not
    if (a === 'op' && n === 2) {
      const op = opBy(b);
      if (!realOp(op)) {
        priv(h, op ? `${clean(op.name)}, Sample Profile` : 'Operator Not Found', op ? `${clean(op.name)} is a sample profile that shows how the network looks. It is not a real operator.` : 'No live profile matches this link. It may be out of date, or the profile may be hidden.', [BROWSE, [op ? clean(op.name) : 'Operator', r]]);
        if (op && op.sample) h.live = false; // an invented person: prototype only, never a live URL
        return h;
      }
      h.sitemap = 'operators'; h.ogType = 'profile'; h.label = clean(op.name);
      const title = (() => { const full = `${clean(op.name)}, ${jobTitle(op)}`; return (full + SUFFIX).length <= MAX_T ? full + SUFFIX : full.length <= MAX_T ? full : clean(op.name) + SUFFIX; })();
      h.title = noColon(title); h.description = opDesc(op);
      h.schema = base().concat(crumbs([HOME, BROWSE, [clean(op.name), r]]), [
        { '@type': 'ProfilePage', '@id': url(r) + '#page', url: url(r), name: noColon(`${clean(op.name)}, ${jobTitle(op)}`), mainEntity: { '@id': url(r) + '#person' }, isPartOf: { '@id': SITE_ID } },
        person(op, r),
      ]);
      return h;
    }

    // Insights, the illustrative report, the Rate Index and the real role cost pages
    if (r === 'insights') return S(T.insights.t, T.insights.d(), [['Insights', r]]);
    if (r === 'report') {
      h.illustrative = true; h.lastmod = mk().asOf || null;
      return S(T.report.t, T.report.d(), [INS, ['The State of Fractional GTM, preview', r]], [illusDataset(r, `The State of Fractional GTM ${(mk().report && mk().report.year) || 2027}`, 'What companies pay, how they scope fractional GTM work, which roles they hire first and what separates the operators who get rehired. Preview edition.')]);
    }
    if (a === 'rates' && (n === 1 || (n === 2 && cats().includes(b)))) {
      h.sitemap = 'roles'; h.illustrative = true; h.lastmod = mk().asOf || null;
      const ds = illusDataset(r, 'Revenue Nomad Rate Index' + (b ? ' - ' + catLabel(b) : ''), 'Median and p25 to p75 hourly rates for fractional go-to-market leaders' + (b ? ` in ${catLabel(b)}` : '') + ', by role category and company revenue range.');
      // The hub's title and description quote no figure: the page leads with monthly ranges by function, and an
      // hourly span from two single seats would read as the whole market
      if (n === 1) return S(`Fractional GTM Leader Rates (${year()})`, 'What fractional GTM leaders charge by the hour. Real 2026 rates for sales, RevOps and marketing, and the illustrative Rate Index by role and company size.', [INS, RI], [ds], true);
      const key = REAL_CAT[b];
      const role = ROLE_T[b] || catLabel(b) + ' Leader';
      const who = role.toLowerCase().replace('revops', 'RevOps') + 's';
      if (key) {
        // The page's H1, then its real seat named as that seat (not as the whole role); no salary markup here, the
        // seat's Occupation lives on its cost guide
        const rec = C(key), t = rec.text, quoted = rec.paid === 'quoted';
        h.lastmod = RN.costs.asOf;
        return S(`Fractional ${role} Cost (${year()})`,
          [`What fractional ${who} charge by the hour.`, `${SEAT_P[key]} ${quoted ? 'was quoted' : 'ran'} ${t.hourly} in our 2026 ${quoted ? 'marketing searches' : 'engagements'}.`, 'See the illustrative Rate Index by company size.'],
          [INS, RI, [catLabel(b), r]], [ds], true);
      }
      return S(`Fractional ${role} Cost (${year()})`, `How company size and hours move the cost of a fractional ${role.toLowerCase().replace('ai gtm', 'AI GTM')}, on the illustrative Rate Index preview. Preview figures, not measured data.`, [INS, RI, [catLabel(b), r]], [ds], true);
    }
    if (r === 'framework' || r === 'library') return S(T[r].t, T[r].d(), [INS, [T[r].c, r]], null, true);

    // Guides
    if (r === 'guides') { h.sitemap = 'guides'; return S(T.guides.t, T.guides.d(), [INS, ['Guides', r]], null, true); }
    if (a === 'guide' && n === 2) {
      const g = guideBy(b);
      if (!g) return priv(h, 'Guide Not Found', 'No guide matches this link. It may be out of date. See every guide on Revenue Nomad.', [['Guides', 'guides'], ['Guide', r]]);
      const p = g.post;
      const ill = illusGuide(g);
      const tt = GUIDE_T[g.slug];
      const title = typeof tt === 'function' ? tt() : tt || (p ? p.metaTitle : g.q);
      const ans = clean((g.answer ? g.answer() : []).join(' '));
      let desc;
      if (COST_GUIDE[g.slug]) desc = answer(COST_GUIDE[g.slug]);
      else if (ILLUS_GUIDE_D[g.slug]) desc = ILLUS_GUIDE_D[g.slug];
      else if (GUIDE_D[g.slug]) desc = GUIDE_D[g.slug];
      else desc = fit(ans);
      if (!desc || desc.length < 70) desc = fit(p ? plain(p.metaDescription) : ans);
      const qa = (/\?$/.test(g.q) && !ill ? [{ q: g.q, a: ans }] : []).concat((g.faq ? g.faq() : []).map((f) => ({ q: plain(f.q), a: plain(f.a) })));
      const faqItems = ill ? qa.filter((x) => !ILLUS_TEXT.test(x.a)) : qa;
      h.sitemap = 'guides'; h.ogType = 'article'; h.lastmod = g.updated || null; h.publish = (p && p.publish) || null;
      // Not live before its publish date: noindex until then (the sitemap and llms.txt also hold it back)
      if (h.publish && h.publish > today()) { h.robots = 'noindex'; h.scheduled = true; }
      h.illustrative = ill;
      h.answer = ill ? desc : fit(ans, 240);
      // The page's trail (Insights > Guides > group), then the guide itself
      const gk = p ? p.fn : g.group;
      const crumbs2 = [INS, ['Guides', 'guides']].concat(GROUP_L[gk] ? [[GROUP_L[gk], 'guides#rs-g-' + gk]] : [], [[clean(g.q), r]]); // the page's H1
      S(title, desc, crumbs2, [article(g, r, fit(desc)), faqNode(faqItems, r), COST_GUIDE[g.slug] ? occupation(COST_GUIDE[g.slug], r) : null], true);
      h.label = noColon(title).replace(/ · Revenue Nomad$/, '');
      return h;
    }

    // Blueprints
    if (r === 'blueprints') return S(T.blueprints.t, T.blueprints.d(), [ENG, ['Engagement Blueprints', r]], null, true);
    if (a === 'blueprint' && n === 2) {
      const bp = bpBy(b);
      if (!bp) return priv(h, 'Blueprint Not Found', 'No Engagement Blueprint matches this link. See every Blueprint on Revenue Nomad.', [['Blueprints', 'blueprints'], ['Blueprint', r]]);
      h.sitemap = 'roles';
      return S(`${bp.title} Blueprint`, `${clean(bp.problem).replace(/[.!?]$/, '')}. The ${bp.title} Blueprint scopes the seat that fixes it. ${clean(bp.blurb)}`, [ENG, ['Blueprints', 'blueprints'], [bp.role || bp.title, r]], null, true);
    }

    // Engagements: the public page is the "post an engagement" landing; drafts and posted engagements are private
    if (r === 'engagements') return S(T.engagements.t, T.engagements.d(), [['Post an engagement', r]]);
    if (a === 'engagement') {
      if (b === 'new') {
        const bp = c ? bpBy(c) : null;
        const step = parts[3];
        const what = bp ? `the ${bp.title} Blueprint` : c ? `engagement ${c}` : '';
        return priv(h, `Post an Engagement${bp ? ', ' + bp.title : c ? ', ' + c : ''}${step ? ', Step ' + step : ''}`, `Draft an engagement brief${what ? ' from ' + what : ''}${step ? ', step ' + step : ''}. Private to the company writing it.`, [['Post an engagement', 'engagements'], ['New brief', r]]);
      }
      return priv(h, `Engagement ${b}`, `Engagement ${b}, private to the company that posted it and the operators it invited.`, [['Post an engagement', 'engagements'], [`Engagement ${b}`, r]]);
    }

    // The work: indexed once real portfolio items replace the placeholders (work.js, placeholder: true)
    if (a === 'work') {
      const real = works().filter((w) => !w.placeholder && realOp((RN.model.byId && RN.model.byId(w.opId)) || null));
      if (n === 1) {
        S(T.work.t, T.work.d(), [['The work', r]]);
        if (!real.length) { h.robots = 'noindex'; h.sitemap = null; }
        return h;
      }
      if (n === 2 && needs().includes(b)) return priv(h, `The Work for ${needLabel(b)}`, `Work samples from fractional operators for companies that need to ${lowerFirst(needLabel(b))}. A filtered view of the work gallery.`, [['The work', 'work'], [needLabel(b), r]]);
      if (n === 2) {
        const w = workBy(b);
        if (!w) return priv(h, 'Work Sample Not Found', 'This work sample is not available. It may have been unpublished by the operator.', [['The work', 'work'], ['Work sample', r]]);
        S(w.title, `${clean(w.title)}. ${clean(w.outcome)}${/[.!?]$/.test(w.outcome || '') ? '' : '.'} A work sample from a fractional operator on Revenue Nomad.`, [['The work', 'work'], [w.title, r]]);
        if (w.placeholder || !real.includes(w)) { h.robots = 'noindex'; h.sitemap = null; }
        // A placeholder, credited to a sample operator: prototype only, never a live URL
        if (w.placeholder || !realOp((RN.model.byId && RN.model.byId(w.opId)) || null)) h.live = false;
        return h;
      }
    }

    // Talk to us questionnaire steps
    if (a === 'talk' && n === 2) return priv(h, `Talk to Us, ${needs().includes(b) ? needLabel(b) : b}`, `Talk to us about a fractional GTM hire${needs().includes(b) ? ' to ' + lowerFirst(needLabel(b)) : ''}. The next questions about your company and the seat.`, [['Talk to us', 'talk'], [needs().includes(b) ? needLabel(b) : b, r]]);

    // Operator application steps
    if (a === 'join' && b === 'operator' && n === 3) return priv(h, `Operator Application, ${c === 'review' ? 'Review' : 'Step ' + c}`, `Apply to Revenue Nomad as a fractional operator. ${c === 'review' ? 'Review your application before you send it.' : 'Step ' + c + ' of the application.'}`, [['Join', 'join'], ['Operator application', 'join.operator'], [c === 'review' ? 'Review' : 'Step ' + c, r]]);

    // Private, per-tab and per-token routes
    const vt = viewTitle(ctx || { view: findView(r).view, params: findView(r).params }, r);
    if (a === 'studio' && n === 2) return priv(h, `${vt}`.replace(/ - Studio$/, '') + ' - Studio', `The ${vt.replace(/ - Studio$/, '')} tab of the operator Studio, private to signed-in operators.`, [['Studio', 'studio'], [vt, r]]);
    if (a === 'buyer' && n === 2) return priv(h, `${b.charAt(0).toUpperCase() + b.slice(1)} - Company Workspace`, `The ${b} tab of the company workspace, private to signed-in companies.`, [['Company workspace', 'buyer'], [b, r]]);
    if (a === 'admin' && n === 2) return priv(h, `${b.charAt(0).toUpperCase() + b.slice(1)} - Admin`, `The ${b} tab of the Revenue Nomad team admin, private to the team.`, [['Admin', 'admin'], [b, r]]);
    if (a === 'review') return priv(h, `Company Review ${b}${c ? ', Step ' + c : ''}`, `A private CORE review request ${b}${c ? ', step ' + c : ''}, sent by an operator to a company they worked with.`, [['Company review', r]]);
    if (a === 'proof') return priv(h, `Private Proof Link ${b}`, `A private proof link ${b} an operator shared with one company. Proof links are private and the operator can turn them off.`, [['Proof link', r]]);
    if (a === 'verify') {
      const op = opBy(b);
      return priv(h, realOp(op) ? `Verify ${clean(op.name)}` : `Verify Badge ${b}`, realOp(op) ? `Check that ${clean(op.name)}'s Revenue Nomad badge is current, with the tier and Reputation Index as of today.` : `No live profile matches badge ${b}. It may be out of date, or the profile may be hidden.`, [['Verify a badge', r]]);
    }

    // Anything else the router knows but this file has no template for: private by default, so nothing leaks
    return priv(h, vt, `${vt} on Revenue Nomad.`, [[vt, r]]);
  }

  /* ---------- Route enumeration ---------- */
  // The same view matching as the router, for a view title on routes without a template
  function findView(route) {
    const parts = String(route).split('.');
    let best = null, score = -1;
    for (const v of Object.values(RN.views || {})) {
      if (!v.tokens || v.tokens.length !== parts.length) continue;
      const params = {}; let ok = true, s = 0;
      v.tokens.forEach((t, i) => { if (!ok) return; if (t.charAt(0) === ':') params[t.slice(1)] = parts[i]; else if (t === parts[i]) s += 2; else ok = false; });
      if (ok && s > score) { best = { view: v, params }; score = s; }
    }
    return best || { view: null, params: {} };
  }
  // tools/check.js's list: each view's route with its sample params, plus its extra samples
  function checkRoutes() {
    const out = [];
    const ops = allOps();
    for (const v of Object.values(RN.views || {})) {
      const t = (v.tokens || []).map((tok) => {
        if (tok.charAt(0) !== ':') return tok;
        const k = tok.slice(1);
        return (v.samples && v.samples[k]) || { slug: ops[0] && ops[0].slug, id: 'demo', tab: 'overview', token: 'demo' }[k] || 'demo';
      });
      out.push(t.join('.'));
      if (v.samples && v.samples.extra) out.push(...v.samples.extra);
    }
    return out;
  }
  function routes() {
    const ops = RN.model && RN.model.notFirst ? RN.model.notFirst(allOps().slice()) : allOps();
    const list = ['home', 'how', 'talk', 'about', 'results', 'operators', 'levels', 'join', 'browse', 'compare', 'engagements', 'blueprints', 'work', 'insights', 'report', 'rates', 'framework', 'library', 'guides', 'fractional-cost', 'hire-fractional-sales-vp', 'fractional-revops', 'fractional-marketing-leadership']
      .concat(cats().map((x) => 'browse.' + x), cats().map((x) => 'rates.' + x))
      .concat(guides().map((g) => 'guide.' + g.slug), bps().map((x) => 'blueprint.' + x.id), works().map((w) => 'work.' + w.id))
      .concat(ops.map((o) => 'op.' + o.slug))
      .concat(checkRoutes());
    const seen = new Set();
    return list.map(canon).filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
  }
  const all = () => routes().map((r) => head(r));

  /* ---------- Redirects for the live site ---------- */
  // Order matters: exact paths first, then wildcards, then the host rule. Every path rule matches on both hosts
  // (anyHost) and sends straight to HOST + to, so https://www.revenuenomad.com/post/<old> is one hop, not two.
  // A rule whose target guide is not live yet carries after: <publish date>; apply it on that date, not before.
  function redirects() {
    const exact = [], wild = [];
    const pubOf = (route) => { const m = /^guide\.(.+)$/.exec(canon(route)); const g = m && guideBy(m[1]); return (g && g.post && g.post.publish) || null; };
    const add = (list, from, to, why, target) => {
      if (!from || !to || from === to) return; // posts.js has replaced pages with no URL (url: null): nothing to redirect
      const x = { from, to, code: 301, why, anyHost: true };
      const pub = target ? pubOf(target) : null;
      if (pub && pub > today()) { x.after = pub; x.why += `; apply on ${pub}, when the guide goes live`; }
      list.push(x);
    };
    // The prototype route as it was typed, without RN.canonical: an alias's own path (path() would resolve it first)
    const rawPath = (route) => { const parts = String(route).split('.').filter(Boolean); if (BASE[parts[0]] && parts.length > 1) parts[0] = BASE[parts[0]]; return '/' + parts.map((x) => encodeURIComponent(x.replace(/_/g, '-'))).join('/'); };
    Object.keys(RN.routeAliases || {}).forEach((k) => {
      add(exact, '/' + k, path(k), 'Renamed route (router.js ALIASES)');
      if (Object.values(RN.views || {}).some((v) => v.tokens && v.tokens[0] === RN.routeAliases[k] && v.tokens.length > 1)) add(wild, '/' + k + '/*', '/' + RN.routeAliases[k] + '/*', 'Renamed route (router.js ALIASES)');
    });
    Object.keys(RN.pathAliases || {}).forEach((k) => {
      const to = path(RN.pathAliases[k]);
      add(exact, rawPath(k), to, 'Prototype guide merged into a rebuilt post (research.js)', RN.pathAliases[k]);
      // RN.share.url builds /guide/<old>: straight to the post, not via /guide/* and then a second hop
      if (/^guide\./.test(k)) add(exact, '/guide/' + encodeURIComponent(k.slice(6)), to, 'RN.share.url link to a prototype guide merged into a rebuilt post', RN.pathAliases[k]);
    });
    add(wild, '/op/*', '/' + BASE.op + '/*', 'RN.share.url builds /op/<slug> today');
    add(wild, '/guide/*', '/' + BASE.guide + '/*', 'RN.share.url builds /guide/<slug> today');
    const posts = (RN.data && RN.data.posts) || {};
    (posts.list || []).forEach((p) => (p.replaces || []).forEach((x) => add(exact, x.url, path('guide.' + p.slug), `Old blog post ${x.action === 'city' ? '(city page) ' : ''}folded into the rebuilt guide`, 'guide.' + p.slug)));
    (posts.candidates || []).forEach((x) => add(exact, x.url, path('guide.' + x.to), 'Candidate: old blog post that would fold into this guide (confirm before launch)', 'guide.' + x.to));
    const host = { from: 'https://www.revenuenomad.com/*', to: HOST + '/*', code: 301, why: 'One host (owner decision pending: www or non-www); applied after the path rules above' };
    const seen = new Set();
    return exact.concat(wild, [host]).filter((x) => (seen.has(x.from) ? false : (seen.add(x.from), true)));
  }
  // Replaced pages posts.js lists without a URL (nothing to 301 until the URL is found)
  const unmapped = () => (((RN.data && RN.data.posts) || {}).list || []).flatMap((p) => (p.replaces || []).filter((x) => !x.url).map((x) => ({ guide: p.slug, title: x.title || '' })));

  const jsonld = (h) => JSON.stringify({ '@context': 'https://schema.org', '@graph': (h && h.schema) || [] }).replace(/</g, '\\u003c');

  RN.seo = { host: HOST, brand: BRAND, maxTitle: MAX_T, maxDesc: MAX_D, path, url, head, jsonld, routes, all, redirects, unmapped, org, clean, findView, realCats: REAL_CAT, base: BASE };
})();
