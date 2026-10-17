/* Writes the SEO and AI-search spec for the live site to seo-spec/ from RN.seo (js/data/seo.js), then validates it.
   usage: node tools/build-seo.js            (exits 1 if a validation fails)
   Output: llms.txt, robots.txt, sitemap_index.xml, sitemap-pages.xml, sitemap-guides.xml, sitemap-roles.xml,
           sitemap-operators.xml, head.json, hash-redirect.js, README.md.
   The prototype is loaded in headless Chromium (Playwright, as tools/check.js does) so every title, description and
   schema node comes from the same code the router applies on each route change. */
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'seo-spec');
const TODAY = new Date().toISOString().slice(0, 10);
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#home');
  await page.waitForTimeout(800);
  // A real visitor: reviewer mode off, so sample profiles stay out of every list
  await page.evaluate(() => { RN.store.set('persona', 'visitor'); RN.store.set('notes', false); RN.shell.applyTheme(); });

  const data = await page.evaluate(() => {
    const heads = RN.seo.all();
    // tools/check.js's own enumeration, to prove every route the router knows has a head
    const checkRoutes = [];
    for (const v of Object.values(RN.views)) {
      const t = v.tokens.map((tok) => { if (!tok.startsWith(':')) return tok; const k = tok.slice(1); return (v.samples && v.samples[k]) || { slug: RN.model.ops[0].slug, id: 'demo', tab: 'overview', token: 'demo' }[k] || 'demo'; });
      checkRoutes.push(t.join('.'));
      if (v.samples && v.samples.extra) checkRoutes.push(...v.samples.extra);
    }
    // Every figure the illustrative Rate Index produces, so the validator can prove none of them is in a salary node
    const riFigures = [];
    RN.costs.keys().filter((k) => k.startsWith('ri.')).forEach((k) => { const r = RN.costs.get(k); if (!r) return; ['hourly', 'monthly'].forEach((f) => { if (r[f]) riFigures.push(r[f].lo, r[f].hi, r[f].mid); }); });
    const rep = RN.data.market.report || {};
    (rep.rateByCat || []).forEach((x) => riFigures.push(x.v));
    const realFigures = {};
    RN.costs.keys().filter((k) => !k.startsWith('ri.')).forEach((k) => { const r = RN.costs.get(k); if (r && r.status === 'real') realFigures[k] = { hourly: r.hourly, monthly: r.monthly }; });
    const ops = RN.model.allOps.map((o) => ({ slug: o.slug, sample: !!o.sample, hidden: !!o.hidden, isMatt: !!o.isMatt, name: o.name }));
    // Every real figure as text (no-break hyphens plain), so a figure in a title or description can be traced to RN.costs
    const realText = RN.costs.keys().filter((k) => !k.startsWith('ri.')).map((k) => { const r = RN.costs.get(k); return r && r.status === 'real' ? RN.seo.clean(Object.values(r.text || {}).join(' ') + ' ' + RN.costs.answer(k)) : ''; }).join(' ');
    return {
      host: RN.seo.host, heads, checkRoutes: checkRoutes.map((r) => RN.canonical(r)), redirects: RN.seo.redirects(),
      jsonld: heads.map((h) => RN.seo.jsonld(h)), riFigures: riFigures.filter((x) => typeof x === 'number'), realFigures, ops,
      realCats: RN.seo.realCats, hubAnswer: RN.seo.clean(RN.costs.answer('hub')), costsAsOf: RN.costs.asOf, marketAsOf: RN.data.market.asOf,
      reportYear: rep.year, network: RN.data.market.network, realText, unmapped: RN.seo.unmapped(),
      hashMap: { tokens: [...new Set(heads.map((h) => h.route.split('.')[0]))].sort(), aliases: RN.routeAliases, exact: RN.routeExact || {}, paths: RN.pathAliases || {}, base: RN.seo.base },
    };
  });

  /* ---------- Routes, sitemaps ---------- */
  // Sample operators and placeholder work samples (live: false) are prototype-only: validated, never in head.json
  const allHeads = data.heads;
  const heads = allHeads.filter((h) => h.live !== false);
  const protoOnly = allHeads.filter((h) => h.live === false);
  const byRoute = Object.fromEntries(allHeads.map((h) => [h.route, h]));
  const live = (h) => !h.publish || h.publish <= TODAY; // a scheduled guide joins its sitemap on its publish date
  const groups = { pages: [], guides: [], roles: [], operators: [] };
  heads.forEach((h) => { if (h.sitemap && h.robots === 'index,follow' && live(h)) groups[h.sitemap].push(h); });
  const scheduled = heads.filter((h) => h.sitemap && !live(h));
  const sitemap = (list) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map((h) => `  <url><loc>${xmlEsc(h.canonical)}</loc>${h.lastmod ? `<lastmod>${xmlEsc(h.lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  const files = {};
  const maxMod = (list) => list.map((h) => h.lastmod).filter(Boolean).sort().pop();
  Object.keys(groups).forEach((g) => { files[`sitemap-${g}.xml`] = sitemap(groups[g]); });
  files['sitemap_index.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(groups).map((g) => `  <sitemap><loc>${xmlEsc(data.host)}/sitemap-${g}.xml</loc>${maxMod(groups[g]) ? `<lastmod>${maxMod(groups[g])}</lastmod>` : ''}</sitemap>`).join('\n')}\n</sitemapindex>\n`;

  /* ---------- robots.txt ---------- */
  const DISALLOW = ['/studio', '/buyer', '/admin', '/standards', '/review/', '/proof/', '/compare', '/engagement/', '/join/operator', '/join/done', '/talk/'];
  files['robots.txt'] = `# robots.txt for ${data.host} (generated by tools/build-seo.js from js/data/seo.js)
# Public pages are open to every crawler. App and private routes are disallowed below. Public URLs that must stay
# out of the index (sample operator profiles, placeholder work samples, badge verification pages) are NOT listed
# here: they carry <meta name="robots" content="noindex">, which a crawler can only read if it may fetch the page.

User-agent: *
# Content signals (https://contentsignals.org): search = build a search index and show links and snippets;
# ai-input = use pages as input to an AI answer (retrieval, grounding); ai-train = train or fine-tune AI models.
# OWNER DECISION: ai-train=yes lets AI companies train models on this site's content. Change it to ai-train=no to
# opt out; search and ai-input stay yes so search engines and AI answer engines can still cite the site.
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /
${DISALLOW.map((d) => 'Disallow: ' + d).join('\n')}

Sitemap: ${data.host}/sitemap_index.xml
`;

  /* ---------- llms.txt (llmstxt.org proposal) ---------- */
  const H = (r) => byRoute[r];
  const link = (h, note) => (h && h.robots === 'index,follow' && live(h) ? `- [${h.label || h.title}](${h.canonical})${note ? ': ' + note : ''}` : null);
  const lines = (arr) => arr.filter(Boolean).join('\n');
  const guideHeads = heads.filter((h) => h.route.startsWith('guide.') && h.robots === 'index,follow');
  // The two real cost guides are listed under "What it costs", so each URL appears once in llms.txt
  const costGuides = ['guide.fractional-vp-of-sales-cost', 'guide.fractional-cmo-cost'];
  const companyGuides = guideHeads.filter((h) => !costGuides.includes(h.route) && !/^guide\.(how-much-should-a-fractional-operator-charge|how-fractional-operators-win-direct-deals|what-is-the-reputation-index|what-is-core)$/.test(h.route));
  const operatorGuides = guideHeads.filter((h) => !companyGuides.includes(h) && !costGuides.includes(h.route));
  const catHeads = heads.filter((h) => /^browse\.[a-z_]+$/.test(h.route) && h.robots === 'index,follow');
  const ratesReal = heads.filter((h) => /^rates\./.test(h.route) && Object.keys(data.realCats).includes(h.route.slice(6)));
  const ratesIllus = heads.filter((h) => /^rates\./.test(h.route) && !Object.keys(data.realCats).includes(h.route.slice(6)));
  files['llms.txt'] = `# Revenue Nomad

> Revenue Nomad is a marketplace of fractional go-to-market operators: sales, marketing, RevOps, enablement, customer success, partnerships and AI GTM leaders that companies hire part time. Companies browse open profiles without a login and pay no fees; reviews come only from companies that hired the operator. The main way to start is Talk to us: four quick questions about the seat and the problem, then we show three operators right away and a person replies within one business day.

Figures on this site come in two kinds. Real figures are what companies paid (sales and RevOps) or were quoted (marketing) in our 2026 engagements and searches. ${data.hubAnswer} The Rate Index and The State of Fractional GTM ${data.reportYear} are preview editions with illustrative figures, not measured data, until the first survey closes. Please do not cite their numbers as market data. Content is published by Revenue Nomad Research.

## Start here
${lines([
    link(H('how'), 'how matching, company reviews and intros work for companies and operators'),
    link(H('talk'), 'the main way companies start a fractional hire, four quick questions about the seat and the problem'),
    link(H('browse'), 'open operator profiles; use Request intro on a profile when you want to meet one specific operator'),
    link(H('about'), 'what Revenue Nomad is and how it vets operators'),
    link(H('results'), 'company reviews of operators, published as submitted'),
  ])}

## Hire by function
${lines([
    link(H('hire-fractional-sales-vp'), H('hire-fractional-sales-vp').description),
    link(H('fractional-revops'), H('fractional-revops').description),
    link(H('fractional-marketing-leadership'), H('fractional-marketing-leadership').description),
    link(H('blueprints'), 'scoping templates for the ten engagements companies ask for most'),
  ].concat(catHeads.map((h) => link(h, h.description))))}

## What it costs, real 2026 figures
${lines([
    link(H('fractional-cost'), data.hubAnswer),
  ].concat(costGuides.map((r) => link(H(r), H(r).description)), ratesReal.map((h) => link(h, h.description))))}

## Guides for companies
${lines(companyGuides.map((h) => link(h, h.answer || h.description)))}

## Research previews, illustrative figures
${lines([
    link(H('rates'), 'the real 2026 engagement rates, plus an illustrative preview of the Rate Index by role and company size; do not cite the index figures as market data'),
  ].concat(ratesIllus.map((h) => link(h, 'illustrative Rate Index preview, not measured data')), [
    link(H('report'), 'preview edition; every figure is illustrative until the first survey closes'),
    link(H('insights'), 'the research hub, with real engagement rates and the illustrative previews'),
  ]))}

## For operators
${lines([
    link(H('operators'), H('operators').description),
    link(H('join'), 'apply as an operator, or start as a company'),
    link(H('levels'), H('levels').description),
    link(H('framework'), H('framework').description),
    link(H('library'), H('library').description),
  ].concat(operatorGuides.map((h) => link(h, h.answer || h.description))))}

## Optional
${lines([
    link(H('guides'), 'every guide, with its one-question answer first'),
    link(H('engagements'), 'post an engagement brief and get ranked operators, free for companies'),
  ])}
`;

  /* ---------- head.json ---------- */
  const headJson = {
    generated: TODAY,
    source: 'js/data/seo.js (RN.seo), written by tools/build-seo.js',
    host: data.host,
    rules: { titleMax: 60, descriptionMax: 155, robots: ['index,follow', 'noindex'] },
    prototypeOnly: { count: protoOnly.length, why: 'Sample operator profiles and placeholder work samples credited to them are invented, so they are left out of the live build. They exist only in the prototype.' },
    routes: heads.map((h) => ({
      route: h.route, path: h.path, canonical: h.canonical, title: h.title, description: h.description, robots: h.robots,
      og: { type: h.ogType, title: h.title, description: h.description, url: h.canonical },
      sitemap: h.robots === 'index,follow' ? h.sitemap : null, lastmod: h.lastmod || undefined, publish: h.publish || undefined,
      illustrative: h.illustrative || undefined, scheduled: h.scheduled || undefined,
      schema: JSON.parse(data.jsonld[allHeads.indexOf(h)]),
    })),
    redirects: data.redirects,
  };
  files['head.json'] = JSON.stringify(headJson, null, 1) + '\n';

  /* ---------- hash-redirect.js: the live home page sends a shared prototype link (/#guide.x) to its path ---------- */
  const hm = data.hashMap;
  files['hash-redirect.js'] = `/* Generated by tools/build-seo.js. Inline on the live home page (before other scripts). A prototype link such as
   https://revenuenomad.com/#guide.fractional-cmo-cost or /#rates.revenue_operations goes to its live path. Only a hash
   whose first token is a known route (T) moves: an in-page anchor such as #main (the skip link) stays where it is.
   Self-contained: the alias tables (router.js ALIASES and EXACT, research.js path aliases) are copied in, so the live
   site does not need RN.canonical or RN.seo. */
(function () {
  var T = ${JSON.stringify(hm.tokens)};
  var A = ${JSON.stringify(hm.aliases)};
  var E = ${JSON.stringify(hm.exact)};
  var P = ${JSON.stringify(hm.paths)};
  var B = ${JSON.stringify(hm.base)};
  var h = location.hash.replace(/^#/, '');
  try { h = decodeURIComponent(h); } catch (e) { return; }
  if (!/^[a-z][\\w.-]*$/.test(h)) return;
  var parts;
  if (Object.prototype.hasOwnProperty.call(P, h)) parts = P[h].split('.');
  else if (Object.prototype.hasOwnProperty.call(E, h)) parts = E[h].split('.');
  else { parts = h.split('.'); if (Object.prototype.hasOwnProperty.call(A, parts[0])) parts[0] = A[parts[0]]; }
  if (T.indexOf(parts[0]) < 0) return;
  if (parts[0] === 'home' && parts.length === 1) { history.replaceState(null, '', '/'); return; }
  if (Object.prototype.hasOwnProperty.call(B, parts[0]) && parts.length > 1) parts[0] = B[parts[0]];
  location.replace('/' + parts.map(function (x) { return encodeURIComponent(x.replace(/_/g, '-')); }).join('/'));
})();
`;

  /* ---------- Validation ---------- */
  const problems = [];
  const warn = [];
  const P = (m) => problems.push(m);
  const DASH = /[–—]/, BANNED = /\b(best|top|unlock|leverage|world-class)\b/i;
  const seenT = {}, seenD = {}, seenC = {};
  const MONEY = /\$[\d.,]*\dk?(?![\dMB])/g; // money, not a company size such as $30M
  allHeads.forEach((h) => {
    if (!h.title) P(`${h.route}: no title`);
    if (h.title.length > 60) P(`${h.route}: title ${h.title.length} > 60`);
    if (!h.description) P(`${h.route}: no description`);
    if (h.description.length > 155) P(`${h.route}: description ${h.description.length} > 155`);
    if (h.description.length < 50) warn.push(`${h.route}: description only ${h.description.length} characters`);
    if (/:/.test(h.title)) P(`${h.route}: colon in title`);
    if (DASH.test(h.title + h.description)) P(`${h.route}: en or em dash`);
    if (BANNED.test(h.title + ' ' + h.description)) P(`${h.route}: banned word in "${h.title}" / "${h.description}"`);
    if (/\bprototype\b/i.test(h.title + ' ' + h.description)) P(`${h.route}: says prototype`);
    if (seenT[h.title]) P(`duplicate title "${h.title}": ${seenT[h.title]} and ${h.route}`); else seenT[h.title] = h.route;
    if (seenD[h.description]) P(`duplicate description: ${seenD[h.description]} and ${h.route}`); else seenD[h.description] = h.route;
    if (seenC[h.canonical]) P(`duplicate canonical ${h.canonical}: ${seenC[h.canonical]} and ${h.route}`); else seenC[h.canonical] = h.route;
    if (!['index,follow', 'noindex'].includes(h.robots)) P(`${h.route}: robots "${h.robots}"`);
    // Every figure in a title or description is a real RN.costs figure (an illustrative one never reaches the head)
    ((h.title + ' ' + h.description).match(MONEY) || []).forEach((m) => { if (!data.realText.includes(m.replace(/[.,]$/, ''))) P(`${h.route}: "${m}" in the title or description is not a real RN.costs figure`); });
    if (h.illustrative && !/^rates\.\w+$/.test(h.route) && /\$|\d%/.test(h.title + h.description)) P(`${h.route}: figure in the head of an illustrative page`);
    // A guide not live yet is noindex
    if (h.publish && h.publish > TODAY && h.robots !== 'noindex') P(`${h.route}: publishes ${h.publish} but is indexable`);
  });
  // Every route tools/check.js visits has a head
  const missing = [...new Set(data.checkRoutes)].filter((r) => !byRoute[r]);
  if (missing.length) P('routes without a head: ' + missing.join(', '));
  // JSON-LD parses, every node is typed, ids are unique inside a page, the founder is never the Organization's face
  let ldNodes = 0, liveNodes = 0;
  const typeCount = {};
  const occAt = {};
  data.jsonld.forEach((txt, i) => {
    const h = allHeads[i];
    let j;
    try { j = JSON.parse(txt); } catch (e) { P(`${h.route}: JSON-LD does not parse`); return; }
    if (/<\//.test(txt) || /</.test(txt)) P(`${h.route}: unescaped < in JSON-LD`);
    const ids = new Set();
    (j['@graph'] || []).forEach((n) => {
      ldNodes++;
      if (!n['@type']) P(`${h.route}: node without @type`);
      if (h.live !== false) { liveNodes++; typeCount[n['@type']] = (typeCount[n['@type']] || 0) + 1; }
      if (n['@id']) { if (ids.has(n['@id'])) P(`${h.route}: duplicate @id ${n['@id']}`); ids.add(n['@id']); }
      if (n['@type'] === 'Organization' && /matt|lopez|founder/i.test(JSON.stringify(n))) P(`${h.route}: founder in Organization`);
      if (n['@type'] === 'Person') {
        const s = JSON.stringify(n);
        if (/email|telephone|linkedin|sameAs/i.test(s)) P(`${h.route}: contact detail in Person`);
        const op = data.ops.find((o) => 'op.' + o.slug === h.route);
        if (!op || op.sample || op.hidden) P(`${h.route}: Person for a sample or hidden operator`);
        if (n.image && !n.image.startsWith(data.host + '/')) P(`${h.route}: Person image not local`);
      }
      if (n['@type'] === 'Article' && (!n.author || n.author.name !== 'Revenue Nomad Research' || !n.datePublished || !n.dateModified)) P(`${h.route}: Article author or dates`);
      if (n['@type'] === 'Article' && n.dateModified < n.datePublished) P(`${h.route}: Article dateModified ${n.dateModified} before datePublished ${n.datePublished}`);
      if (n['@type'] === 'BreadcrumbList' && (n.itemListElement || []).length < 2) P(`${h.route}: BreadcrumbList with fewer than 2 items`);
      if (n['@type'] === 'Organization' && n.logo && (n.logo.width < 112 || n.logo.height < 112)) P(`${h.route}: Organization logo under 112 x 112`);
      if (n['@type'] === 'Dataset' && h.illustrative && !/^Illustrative figures, not measured data/.test(n.description)) P(`${h.route}: illustrative Dataset does not say so first`);
      if (n['@type'] === 'Occupation') {
        if (h.illustrative && !Object.keys(data.realCats).some((c) => h.route === 'rates.' + c)) P(`${h.route}: Occupation on an illustrative page`);
        const key = (n['@id'] || '').split('#occupation-')[1];
        const real = data.realFigures[key];
        if (!real) P(`${h.route}: Occupation ${key} is not a real RN.costs seat`);
        if (occAt[key] && occAt[key] !== h.route) P(`Occupation ${key} on two URLs: ${occAt[key]} and ${h.route}`); else occAt[key] = h.route;
        (n.estimatedSalary || []).forEach((m) => {
          const v = m.value || {};
          const want = v.unitText === 'HOUR' ? real && real.hourly : real && real.monthly;
          if (!want || v.minValue !== want.lo || v.maxValue !== want.hi) P(`${h.route}: ${key} ${v.unitText} ${v.minValue}-${v.maxValue} does not match RN.costs`);
          if (data.riFigures.includes(v.minValue) && data.riFigures.includes(v.maxValue)) P(`${h.route}: ${key} salary figures match illustrative Rate Index figures`);
        });
      }
    });
  });
  // No salary markup anywhere on the illustrative report or the illustrative Rate Index roles
  heads.filter((h) => h.route === 'report' || h.route === 'rates' || (/^rates\./.test(h.route) && !Object.keys(data.realCats).includes(h.route.slice(6))) || (h.illustrative && h.route.startsWith('guide.')))
    .forEach((h) => { if (/Occupation|estimatedSalary|MonetaryAmount/.test(JSON.stringify(h.schema))) P(`${h.route}: salary schema on an illustrative page`); });
  // Sitemaps: only indexable, real, published URLs; the founder never first; robots.txt blocks none of them
  Object.entries(groups).forEach(([g, list]) => list.forEach((h) => {
    if (h.robots !== 'index,follow') P(`sitemap-${g}: noindex URL ${h.route}`);
    if (DISALLOW.some((d) => h.path.startsWith(d))) P(`robots.txt blocks sitemap URL ${h.path}`);
  }));
  groups.operators.forEach((h) => { const op = data.ops.find((o) => 'op.' + o.slug === h.route); if (!op || op.sample || op.hidden) P(`sitemap-operators: ${h.route} is not a real, listed operator`); });
  if (groups.operators[0] && data.ops.find((o) => 'op.' + o.slug === groups.operators[0].route).isMatt) P('sitemap-operators: the founder is first');
  // llms.txt and robots copy rules
  if (DASH.test(files['llms.txt'])) P('llms.txt: en or em dash');
  if (BANNED.test(files['llms.txt'])) P('llms.txt: banned word: ' + files['llms.txt'].match(BANNED)[0]);
  if (/Matt|Lopez/.test(files['llms.txt'])) P('llms.txt names the founder');
  files['llms.txt'].split('\n').filter((l) => /^#/.test(l)).forEach((l) => { if (/:/.test(l)) P('llms.txt: colon in heading ' + l); });
  if (/\[null\]|undefined/.test(files['llms.txt'])) P('llms.txt: empty link');
  { const urls = (files['llms.txt'].match(/\]\((https?:[^)]+)\)/g) || []); const dup = urls.filter((u, i) => urls.indexOf(u) !== i); if (dup.length) P('llms.txt: link listed twice ' + [...new Set(dup)].join(', ')); }
  const llmsProse = files['llms.txt'].split('\n').filter((l) => !/^- \[/.test(l)).join('\n'); // the summary, not the pages' own answers
  if (/\bclients?\b/i.test(llmsProse)) P('llms.txt says clients, not companies');
  if (/: [A-Z]/.test(llmsProse)) P('llms.txt: capital after a colon');
  // head.json carries no invented person
  if (heads.some((h) => h.live === false)) P('head.json: a prototype-only route is in the live list');
  const liveOps = new Set(data.ops.filter((o) => !o.sample).map((o) => 'op.' + o.slug));
  heads.forEach((h) => { if (/^op\./.test(h.route) && data.ops.some((o) => 'op.' + o.slug === h.route) && !liveOps.has(h.route)) P(`head.json: sample operator ${h.route}`); });
  // Redirects: no empty source, no loop, no chain, specific rules before the wildcards and the host rule last
  const R = data.redirects;
  R.forEach((x, i) => {
    if (!x.from || !x.to) P(`redirect ${i}: empty from or to`);
    if (x.from === x.to) P(`redirect ${x.from}: points at itself`);
    if (R.some((y) => y.from === x.to)) P(`redirect chain: ${x.from} -> ${x.to} -> ${R.find((y) => y.from === x.to).to}`);
    if (!/\*$/.test(x.to) && !/^https?:/.test(x.to) && !heads.some((h) => h.path === x.to)) P(`redirect ${x.from}: target ${x.to} is not a route`);
    const tgt = heads.find((h) => h.path === x.to);
    if (tgt && tgt.publish && tgt.publish > TODAY && x.after !== tgt.publish) P(`redirect ${x.from}: target publishes ${tgt.publish} but the rule has no after date`);
  });
  const firstWild = R.findIndex((x) => /\*$/.test(x.from));
  if (firstWild >= 0 && R.slice(firstWild).some((x) => !/\*$/.test(x.from))) P('redirects: an exact rule after a wildcard');
  if (!/^https:\/\/www\./.test(R[R.length - 1].from)) P('redirects: the host rule is not last');
  Object.keys(data.hashMap.paths).forEach((k) => { if (!R.some((x) => x.to === byRoute[data.hashMap.paths[k]].path && x.why.startsWith('Prototype guide merged'))) P(`redirects: no rule for the merged prototype guide ${k}`); });
  if (data.unmapped.length) warn.push(`posts.js lists ${data.unmapped.length} replaced page(s) without a URL, so they have no redirect: ${data.unmapped.map((x) => x.title || x.guide).join(', ')}`);
  // hash-redirect.js sends every route (and every alias) to the same path as RN.seo.path, and leaves #main alone
  {
    const run = (hash) => { let to = null; const loc = { hash, replace: (u) => { to = u; } }; const hist = { replaceState: (a, b, u) => { to = u; } }; new Function('location', 'history', files['hash-redirect.js'])(loc, hist); return to; };
    allHeads.forEach((h) => { const got = run('#' + h.route); if (got !== h.path) P(`hash-redirect.js: #${h.route} goes to ${got}, not ${h.path}`); });
    Object.keys(data.hashMap.paths).forEach((k) => { const got = run('#' + k); if (got !== byRoute[data.hashMap.paths[k]].path) P(`hash-redirect.js: alias #${k} goes to ${got}`); });
    ['#main', '#faq', '#top', ''].forEach((x) => { if (run(x) !== null) P(`hash-redirect.js moves the in-page anchor "${x}"`); });
  }
  // XML well-formed (the browser's own parser)
  const xmlNames = Object.keys(files).filter((f) => f.endsWith('.xml'));
  const xmlOk = await page.evaluate((docs) => docs.map((x) => new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror').length === 0), xmlNames.map((f) => files[f]));
  xmlNames.forEach((f, i) => { if (!xmlOk[i]) P(`${f} is not well-formed XML`); });
  try { JSON.parse(files['head.json']); } catch (e) { P('head.json does not parse'); }

  // The router applies the same head in the prototype. Sweep every route but the operator profiles (three of those):
  // the rendered title, description, canonical, robots and graph must be RN.seo's for the URL in the address bar
  // (a view may move its own URL during mount), the page carries no other JSON-LD, and the BreadcrumbList follows the
  // trail the page shows (indexable pages)
  const sweep = allHeads.filter((h) => !/^op\./.test(h.route)).map((h) => h.route).concat(groups.operators.slice(0, 3).map((h) => h.route), allHeads.filter((h) => /^op\./.test(h.route) && h.live === false).slice(0, 1).map((h) => h.route));
  let swept = 0;
  for (const r of sweep) {
    await page.evaluate((r) => { location.hash = '#' + r; }, r);
    await page.waitForTimeout(120);
    const got = await page.evaluate(() => {
      const q = (s, a) => { const el = document.head.querySelector(s); return el ? el.getAttribute(a) : null; };
      const ld = document.getElementById('rn-ld');
      let graph = null; try { graph = JSON.parse(ld.textContent)['@graph']; } catch (e) { graph = null; }
      const want = RN.seo.head(RN.path());
      const nav = document.querySelector('main nav.crumbs');
      const trail = nav ? Array.from(nav.querySelectorAll('a, span')).filter((x) => !x.querySelector('a, span')).map((x) => x.textContent.trim()).filter(Boolean) : null;
      const bc = graph && graph.find((n) => n['@type'] === 'BreadcrumbList');
      return {
        path: RN.path(), title: document.title, canonical: q('link[rel="canonical"]', 'href'), robots: q('meta[name="robots"]', 'content'),
        desc: q('meta[name="description"]', 'content'), og: q('meta[property="og:url"]', 'content'), ogd: q('meta[property="og:description"]', 'content'), twd: q('meta[name="twitter:description"]', 'content'),
        graphOk: !!(graph && graph.length) && JSON.stringify(graph) === JSON.stringify(want.schema), lds: document.querySelectorAll('script#rn-ld').length,
        other: document.querySelectorAll('script[type="application/ld+json"]:not(#rn-ld)').length,
        want: { title: want.title, description: want.description, canonical: want.canonical, robots: want.robots },
        trail, bc: bc ? bc.itemListElement.map((x) => x.name) : null,
      };
    });
    swept++;
    const w = got.want;
    const at = got.path === r ? `#${r}` : `#${r} (now #${got.path})`;
    if (got.title !== w.title) P(`prototype ${at}: document.title "${got.title}" is not RN.seo's "${w.title}"`);
    if (got.desc !== w.description || got.ogd !== w.description || got.twd !== w.description) P(`prototype ${at}: meta, og or twitter description is not RN.seo's ("${got.desc}")`);
    if (got.canonical !== w.canonical || got.og !== w.canonical) P(`prototype ${at}: canonical or og:url`);
    if (got.robots !== w.robots) P(`prototype ${at}: robots`);
    if (!got.graphOk || got.lds !== 1) P(`prototype ${at}: #rn-ld missing, duplicated or not RN.seo's graph`);
    if (got.other) P(`prototype ${at}: ${got.other} other JSON-LD block(s) in the page`);
    if (got.trail && got.bc && w.robots === 'index,follow') { const ok = got.trail.every((t, i) => got.bc[i] === t) && got.bc.length - got.trail.length <= 1; if (!ok) P(`prototype ${at}: BreadcrumbList ${got.bc.join(' > ')} does not follow the page trail ${got.trail.join(' > ')}`); }
    if (got.path === r && byRoute[r] && (byRoute[r].title !== w.title || byRoute[r].canonical !== w.canonical)) P(`prototype ${at}: head differs from head.json`);
  }
  if (pageErrors.length) P('page errors: ' + pageErrors.join(' | '));
  await browser.close();

  /* ---------- README ---------- */
  const count = Object.fromEntries(Object.entries(groups).map(([g, l]) => [g, l.length]));
  const idx = heads.filter((h) => h.robots === 'index,follow').length;
  const results = { routes: heads.length, indexable: idx, noindex: heads.length - idx, protoOnly: protoOnly.length, sitemaps: count, scheduled: scheduled.map((h) => `${h.path} (${h.publish})`), redirects: data.redirects.length, candidates: data.redirects.filter((x) => /^Candidate/.test(x.why)).length, after: data.redirects.filter((x) => x.after).length, ldNodes: liveNodes, typeCount, problems: problems.length, warnings: warn.length, swept };
  files['README.md'] = readme(data, heads, groups, scheduled, results, DISALLOW, warn);

  fs.mkdirSync(OUT, { recursive: true });
  Object.entries(files).forEach(([f, c]) => fs.writeFileSync(path.join(OUT, f), c));
  console.log(`Wrote ${Object.keys(files).length} files to ${path.relative(process.cwd(), OUT) || OUT}`);
  console.log(`Routes ${results.routes} in head.json (${results.indexable} index, ${results.noindex} noindex; ${results.protoOnly} prototype-only left out); sitemaps ${JSON.stringify(count)}; scheduled guides held back ${scheduled.length}; redirects ${results.redirects} (${results.candidates} Candidate, ${results.after} dated); JSON-LD nodes ${liveNodes} ${JSON.stringify(typeCount)}; prototype heads swept ${swept}`);
  warn.forEach((w) => console.log('note  ' + w));
  problems.forEach((p) => console.log('FAIL  ' + p));
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll SEO checks pass');
  process.exit(problems.length ? 1 : 0);
})();

function readme(data, heads, groups, scheduled, results, DISALLOW, warn) {
  const H = Object.fromEntries(heads.map((h) => [h.route, h]));
  const ex = (r) => (H[r] ? `| \`#${r}\` | \`${H[r].path}\` | ${H[r].robots} |` : '');
  const row = (cells) => '| ' + cells.join(' | ') + ' |';
  const opsSample = groups.operators.length;
  const tc = results.typeCount;
  return `# Revenue Nomad SEO and AI-search spec

For the developers building the live site. Generated ${TODAY} by \`node tools/build-seo.js\` from \`js/data/seo.js\` (RN.seo);
rerun it after any change to routes, guides, operators or RN.costs. Everything here is a proposal for the live build;
nothing in this folder is deployed by the prototype.

| File | What it is |
|---|---|
| \`head.json\` | Every route: path, canonical, title, description, robots, Open Graph, JSON-LD (\`schema\`), sitemap, plus the redirect list |
| \`sitemap_index.xml\` | Points to the four sitemaps below |
| \`sitemap-pages.xml\` | ${groups.pages.length} core pages |
| \`sitemap-guides.xml\` | ${groups.guides.length - 1} published guides and the guides hub |
| \`sitemap-roles.xml\` | ${groups.roles.length} role pages: function pages, cost hub, browse and Rate Index role pages, Blueprints |
| \`sitemap-operators.xml\` | ${opsSample} approved, searchable real operator profiles (sample profiles excluded) |
| \`robots.txt\` | Crawl rules, Content-Signal line, sitemap location |
| \`llms.txt\` | A map of the site for AI engines (llmstxt.org proposal) |
| \`hash-redirect.js\` | Inline script for the live home page: a shared prototype link (\`/#guide.x\`) goes to its path |

Totals: ${results.routes} routes in head.json, ${results.indexable} indexable and ${results.noindex} noindex; ${results.redirects} redirects (${results.candidates} Candidate, ${results.after} dated); ${results.ldNodes} JSON-LD nodes.
${results.protoOnly} prototype-only routes (sample operator profiles and the placeholder work samples credited to them) are left out
of head.json: they are invented, so the live site never serves them at a public URL, not even as noindex.

## 1. URL structure

- One host: \`${data.host}\`, HTTPS, non-www, no trailing slash, lowercase. **Owner decision pending (www or non-www).** The
  other host 301s to the chosen one. **The live blog is on www today**, and so are \`profile.js\` (share link),
  \`studio-a.js\` (search preview and its sample schema) and research.js \`OLD_BLOG\` (every rebuilt post's in-page Article
  and BreadcrumbList). \`RN.share\`, the badge snippet, \`studio-b.js\` and research.js's library and glossary schema use
  non-www. Every builder should call \`RN.seo.url(route)\` once the decision is made.
- Path rule (same as \`RN.share.url\`): the hash route's dots become slashes and underscores become hyphens. Two first
  tokens are renamed, both already in use in the repo (**owner decisions**): \`guide.<slug>\` is \`/post/<slug>\` (the live
  blog's pattern, and where the old-post 301s in research.js already point) and \`op.<slug>\` is \`/operators/<slug>\` (what
  operators see in their profile share link and Studio preview). \`RN.share.url\` still builds \`/guide/\` and \`/op/\`; both 301.

| Prototype route | Live path | Robots |
|---|---|---|
${[ex('home'), ex('fractional-cost'), ex('hire-fractional-sales-vp'), ex('browse.revenue_operations'), ex('rates.revenue_operations'), ex('guide.fractional-vp-of-sales-cost'), ex('blueprint.vp-sales'), groups.operators[0] ? ex(groups.operators[0].route) : '', ex('report'), ex('studio.visibility'), ex('join.operator.3')].filter(Boolean).join('\n')}

### Redirects
- Hash links (\`/#guide.x\`) never reach the server. Inline \`hash-redirect.js\` on the home page so shared prototype links
  land. It moves only a hash whose first token is a known route (${data.hashMap.tokens.length} tokens, copied in with the alias
  tables), so in-page anchors such as the skip link \`#main\` stay put, and it needs nothing else from the prototype. The
  build runs it against every route and alias and fails if it disagrees with \`RN.seo.path\`. If the live home page gives a
  section an id equal to a route token (for example \`how\`), rename the id.
- 301s (full list in \`head.json\` → \`redirects\`, ${results.redirects} entries), in this order: exact paths, then wildcards,
  then the host rule last. Every path rule has \`anyHost: true\`: it matches on both hosts and sends straight to
  \`${data.host}\` + \`to\`, so an old \`https://www.revenuenomad.com/post/<old>\` URL takes one hop, not two (the host rule
  first and the path rule second would be a chain). The list: renamed routes (\`/projects\` → \`/engagements\`,
  \`/state-of-fractional\` → \`/report\`); prototype guide aliases, at both \`/post/<old>\` and \`/guide/<old>\`; every old
  blog post folded into a rebuilt guide (posts.js \`replaces\`); \`/op/*\` and \`/guide/*\`; the other host.
- ${results.candidates} entries marked "Candidate" (posts.js \`candidates\`) need a yes before launch.
- ${results.after} entries carry \`after: <date>\`: their guide is not live yet. Apply each on that date, not before.${data.unmapped.length ? `
- posts.js lists ${data.unmapped.length} replaced page(s) with no URL, so they have no 301 yet: ${data.unmapped.map((x) => x.title || x.guide).join(', ')}. Find their old URLs in Search Console before launch.` : ''}

## 2. Per-template head rules

Every route sets: \`<title>\`, \`<meta name="description">\`, \`<link rel="canonical">\` (self, absolute), \`<meta name="robots">\`,
\`og:site_name\`, \`og:type\`, \`og:title\`, \`og:description\`, \`og:url\`, \`twitter:card\` (summary), \`twitter:title\`,
\`twitter:description\`, and one \`<script type="application/ld+json">\` with the route's \`@graph\` (\`<\` escaped as \`\\u003c\`).
Render all of it server-side (or prerender): engines that do not run JavaScript must see the same head.

Titles are at most 60 characters, with " · Revenue Nomad" only when it fits, and no colons. Descriptions are at most 155 characters and
are the page's answer in one or two whole sentences, with real figures where they exist. Cost pages carry the year and the
real figure in the title ("${H['guide.fractional-vp-of-sales-cost'] ? H['guide.fractional-vp-of-sales-cost'].title : ''}").

| Template | Title | Description | Robots | Schema (besides Organization, WebSite, BreadcrumbList) | Sitemap |
|---|---|---|---|---|---|
${[
    ['Home, how, talk, about, results, join, operators, levels, framework, library, insights, guides hub, blueprints, engagements', 'Fixed per page', 'Fixed answer sentence', 'index', 'None', 'pages / guides'],
    ['Function pages (sales, RevOps, marketing)', 'The page title', 'Hours and monthly range from RN.costs', 'index', 'FAQPage', 'roles'],
    ['Cost hub /fractional-cost', 'Year and the hub monthly range', 'RN.costs.answer(hub)', 'index', 'FAQPage, Dataset (real)', 'roles'],
    ['Browse role /browse/<role>', 'Fractional <role> for Hire', 'What the seat does', 'index', 'None', 'roles'],
    ['Rate Index role, real seat (sales, RevOps, marketing)', 'Role and year, no figure', 'The H1, then the real seat by name and its hourly rate', 'index', 'Dataset (illustrative)', 'roles'],
    ['Rate Index hub and other roles', 'Year, no figure', 'No figure; says illustrative', 'index', 'Dataset (illustrative)', 'roles'],
    ['Report /report', 'Preview Edition', 'Says every figure is illustrative', 'index', 'Dataset (illustrative)', 'pages'],
    ['Guide /post/<slug>', 'posts.js metaTitle; cost guides use year and figure; older guides a short title', 'The guide\'s answer; illustrative guides get a sentence with no figure or finding', 'index (noindex until its publish date)', 'Article, FAQPage (+ Occupation on the two real cost guides)', 'guides'],
    ['Blueprint /blueprint/<id>', '<Seat> Blueprint', 'Problem, then what it scopes', 'index', 'None', 'roles'],
    ['Operator profile /operators/<slug>, real', 'Name, Fractional <role>', 'Name, role, focus areas', 'index', 'ProfilePage + Person', 'operators'],
    ['Operator profile, unknown slug', 'Operator Not Found', 'Says no live profile matches', 'noindex', 'None', 'none'],
    ['Operator profile, sample', 'Not in the live build', 'Not in the live build', 'Not served', 'None', 'none'],
    ['Work gallery /work and its filters', 'Fixed', 'What the gallery holds', 'noindex while every sample is a placeholder', 'None', 'none until real'],
    ['Work sample /work/<id>', 'Sample title (placeholders: not in the live build)', 'Title and how it was used', 'index once real', 'None', 'none until real'],
    ['Studio, workspace, admin, standards, review, proof, compare, verify, engagement drafts and posts, application steps, talk steps, 404', 'Tab or step name', 'Says private', 'noindex', 'None', 'none'],
  ].map(row).join('\n')}

Description precedence in the prototype matches head.json: RN.seo's description first, then a view's own \`description\`,
then the site default, so a view's copy (the Rate Index views quote illustrative medians) never reaches the head. The build
renders ${results.swept} routes in the prototype and fails if any rendered head differs from RN.seo's.

## 3. Structured data rules

- **Organization and WebSite on every page**, with \`@id\` \`${data.host}/#organization\` and \`/#website\`. The WebSite has a
  SearchAction on \`/browse?q={search_term_string}\`: the live browse page must read \`?q=\`. The Organization has no founder,
  employee or contact person: Revenue Nomad is presented as a company.
- **BreadcrumbList on every page but home** (a one-item list says nothing). Where the page shows a breadcrumb, the list
  follows it word for word, then names the page (guides: Insights, Guides, the guide's group, the guide; Rate Index:
  Insights, Rate Index, the role; browse: Browse talent, the role; Blueprints: Post an engagement, Blueprints, the seat).
  Elsewhere it is Home, then the page. The build checks every rendered page.
- **FAQPage** only where the page shows its FAQ: function pages, the cost hub and guides (the guide's question and short
  answer first, then its FAQ). Not on For operators: its FAQ quotes a proposed fee that is not decided. Google limits FAQ
  rich results to a few site types, so the value here is for AI answers.
- **Article** for each guide: author \`Organization "Revenue Nomad Research"\` (part of Revenue Nomad), publisher the
  Organization, \`datePublished\` = posts.js \`publish\` (or \`updated\` for a rebuilt live post), \`dateModified\` = \`updated\`.
  Add \`image\` once each guide has one hosted on the site, and \`reviewedBy\` once a reviewing operator signs off.
- **ProfilePage + Person** for approved, searchable real operators only: name, jobTitle, url, description (their headline)
  and image only when the photo is hosted on the site. No email, phone, LinkedIn or sameAs. Never for sample operators.
- **Occupation** only on the two real cost guides, one URL per seat: \`/post/fractional-vp-of-sales-cost\` (vp-sales,
  "Fractional Director or VP of Sales") and \`/post/fractional-cmo-cost\` (cmo, quoted). Each is named after the seat its
  figures come from, never after the whole role: an RN.costs seat record is one seat (vp-sales is a director or VP for teams
  under 5 to 8 reps; the CRO and the RevOps director and architect cost more), so the Rate Index role pages and the cost hub
  carry no Occupation, and RevOps has none until a real leader seat has hourly and monthly figures. \`estimatedSalary\` holds
  two MonetaryAmount ranges (hourly, monthly) with min and max, and the basis line in the name and description. Not MonetaryAmountDistribution: that type only has percentile and median fields, and our
  figures are ranges from engagements, not a distribution, so filling it would invent percentiles. Google retired its
  estimated-salary rich result in 2025, so this markup is for meaning, not a search feature.
- **Dataset**: the cost hub's real 2026 engagement rates (no count, because no engagement count is published). The Rate
  Index and the report get a Dataset whose description starts "Illustrative figures, not measured data".
- **Why illustrative data gets no salary or Occupation markup**: market.js figures are invented to show shape until the
  first survey closes. Structured data is read by machines without the visible "Illustrative" tag, so an invented median in
  an Occupation node would travel as a fact. The build fails if any salary figure is not a real RN.costs seat or matches a
  Rate Index figure.
- The live site emits only the head.json graph, so a page never carries two Article or Dataset nodes. In the prototype the
  router removes the in-page \`<script type="application/ld+json">\` previews (research.js, insights.js) from the DOM and puts
  RN.seo's graph at the end of \`<main>\` instead, so a crawler that runs JavaScript never reads their illustrative FAQ
  answers, their "Revenue Nomad" author or their www and \`/library/<slug>\` URLs. The collapsible preview text stays for the team.

## 4. The answer-first content pattern

Every page that answers a question (guides, cost and role pages, function pages) opens with the answer in one to three
plain sentences directly under the H1, before any table, chart or form, and that answer is the meta description. Then the
numbers behind it with their basis line ("From our 2026 engagements, as of Oct 2026"), then the detail, then the FAQ, then one
Talk to us. Real figures read in the house format ("$4k - $10k/month", "$200 - $250/hr"). An illustrative figure is never in
the opening answer, the title, the description or the schema; where it is shown it carries the visible Illustrative tag.

## 5. Internal linking rules

- Each function page links to its browse role page, its Rate Index role page, its Blueprint and its two or three guides; each
  guide links back to its function page and cost page, with descriptive anchor text (the page's label, not "click here").
- Talk to us is the primary call to action on function pages, the cost hub, cost guides and research pages (larger companies
  prefer it). Request intro appears only where the visitor has picked a specific operator: operator cards, profiles, work
  samples, compare and shortlist.
- Links from public pages to private ones (Studio, workspace, compare, drafts) are plain links; robots.txt keeps crawlers out.
- Operator lists never put the founder first (RN.model.notFirst); the operator sitemap follows the same order.
- Every indexable page is reachable in three clicks from home, and every URL in a sitemap is linked from at least one page.

## 6. Sitemaps and robots

- \`sitemap_index.xml\` lists four sitemaps; each lists only indexable, live URLs with \`lastmod\` where known (guides:
  posts.js \`updated\`; cost pages: RN.costs \`asOf\` ${data.costsAsOf}; Rate Index and report: market.js \`asOf\` ${data.marketAsOf}).
  Operators have no reliable modified date in the export, so they carry none until the live database provides one.
- Scheduled guides join \`sitemap-guides.xml\` on their publish date (rerun the build): ${scheduled.length ? scheduled.map((h) => `\`${h.path}\` (${h.publish})`).join(', ') : 'none'}.
- The work gallery and its samples stay noindex and out of the sitemaps while every sample is a placeholder (work.js
  \`placeholder: true\`); RN.seo indexes them automatically once real portfolio items replace them.
- robots.txt allows everything except app and private paths (${DISALLOW.map((d) => '`' + d + '`').join(', ')}). Pages that
  should stay out of the index but may be linked publicly (sample profiles, placeholder work, verify pages) use the noindex
  meta, not Disallow, so crawlers can see it.
- \`Content-Signal: search=yes, ai-input=yes, ai-train=yes\`. **ai-train is an owner decision**, marked in the file.

## 7. llms.txt

\`llms.txt\` follows the llmstxt.org proposal: H1, a one-paragraph summary, then sections of links (how it works, Talk to us,
browse, function pages, the cost hub, every guide with its one-line answer, the Rate Index and report clearly marked as
illustrative previews, For operators). It is a proposal, not a standard: no major search engine has committed to reading
it, and some AI crawlers do. Serve it at \`/llms.txt\` as text/plain; it costs nothing and never replaces the sitemaps or
the on-page head. Regenerate it with the build so its answers match the pages.

## 8. Launch checklist

- [ ] Owner: www or non-www; set \`HOST\` in js/data/seo.js and 301 the other host.
- [ ] Owner: \`/post/\` for guides and \`/operators/\` for profiles (or the plain RN.share paths); align RN.share.url, profile.js and studio-a.js.
- [ ] Owner: ai-train yes or no in robots.txt.
- [ ] Owner: keep the illustrative report and Rate Index indexable with their Dataset, or noindex them until the survey closes.
- [ ] Server-render or prerender every head in head.json; check with JavaScript off.
- [ ] One canonical per URL, self-referencing; no canonical on a noindex page pointing elsewhere.
- [ ] 301 map live in head.json's order (exact paths, wildcards, host rule last), path rules on both hosts, each \`after\` rule on its date; no redirect chains.
- [ ] Inline \`hash-redirect.js\` on the home page for shared prototype links.
- [ ] Scheduled guides: serve each from its publish date and rerun the build that day, so it flips to index and joins the sitemap.
- [ ] \`/browse?q=\` works for the SearchAction.
- [ ] Export a square logo of at least 112 x 112 px (512 x 512 recommended) and host it at \`/assets/brand/logo-512.png\`, the
  Organization logo in the schema (\`assets/brand/mark.png\` is 45 x 48, under Google's minimum). Host operator photos under \`/assets/photos/\`.
- [ ] Make an Open Graph image (1200 x 630) per template and add \`og:image\` and \`twitter:card=summary_large_image\`.
- [ ] Submit \`sitemap_index.xml\` in Google Search Console and Bing Webmaster Tools; verify both hosts.
- [ ] Validate a sample of each template in the Rich Results Test and the Schema Markup Validator.
- [ ] Serve \`robots.txt\`, \`llms.txt\` and the sitemaps at the site root with correct content types.
- [ ] 404 page returns a real 404 status and \`noindex\`.
- [ ] Rerun \`node tools/build-seo.js\` before launch and on every content release; it must end "All SEO checks pass".

## 9. Validation (this build)

${results.problems ? `${results.problems} problem(s), see the build output.` : 'All SEO checks pass.'} Checked: every route tools/check.js visits has a head; titles at most 60 and
descriptions at most 155 characters, all unique; canonicals unique; no colon in a title; no en or em dash, banned word or
"prototype" in any title, description or llms.txt; every dollar figure in a title or description is a real RN.costs figure,
and illustrative pages carry none; a guide not live yet is noindex; every JSON-LD graph parses, every node is typed and
\`@id\`s are unique per page; Article dateModified is never before datePublished; every BreadcrumbList has at least two
items; the Organization logo is at least 112 x 112; no contact details in Person and no Person for a sample; each seat's
Occupation is on one URL and its figures equal a real RN.costs seat and match no Rate Index figure; no salary markup on an
illustrative page; illustrative Datasets say so first; head.json holds no sample operator or placeholder work; every
redirect has a source and a live route as its target, none points at another rule's source, exact rules come before the
wildcards and the host rule is last, rules to guides not live yet carry their date, and every merged prototype guide has a
rule; hash-redirect.js agrees with RN.seo.path on every route and alias and leaves in-page anchors alone; llms.txt lists
each URL once and says companies; every sitemap URL is indexable, live and not blocked by robots.txt; the founder is not
first in the operator sitemap; all XML is well-formed; and ${results.swept} routes rendered in the prototype carry exactly
RN.seo's title, description (meta, Open Graph, Twitter), canonical, robots and graph for the URL in the address bar, no
other JSON-LD, and a BreadcrumbList that follows the visible trail.

Schema nodes by type: ${Object.entries(tc).map(([k, v]) => `${k} ${v}`).join(', ')}.
`;
}
