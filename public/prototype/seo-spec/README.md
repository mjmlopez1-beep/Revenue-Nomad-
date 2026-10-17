# Revenue Nomad SEO and AI-search spec

For the developers building the live site. Generated 2026-10-17 by `node tools/build-seo.js` from `js/data/seo.js` (RN.seo);
rerun it after any change to routes, guides, operators or RN.costs. Everything here is a proposal for the live build;
nothing in this folder is deployed by the prototype.

| File | What it is |
|---|---|
| `head.json` | Every route: path, canonical, title, description, robots, Open Graph, JSON-LD (`schema`), sitemap, plus the redirect list |
| `sitemap_index.xml` | Points to the four sitemaps below |
| `sitemap-pages.xml` | 15 core pages |
| `sitemap-guides.xml` | 26 published guides and the guides hub |
| `sitemap-roles.xml` | 31 role pages: function pages, cost hub, browse and Rate Index role pages, Blueprints |
| `sitemap-operators.xml` | 294 approved, searchable real operator profiles (sample profiles excluded) |
| `robots.txt` | Crawl rules, Content-Signal line, sitemap location |
| `llms.txt` | A map of the site for AI engines (llmstxt.org proposal) |
| `hash-redirect.js` | Inline script for the live home page: a shared prototype link (`/#guide.x`) goes to its path |

Totals: 436 routes in head.json, 367 indexable and 69 noindex; 56 redirects (16 Candidate, 17 dated); 1978 JSON-LD nodes.
42 prototype-only routes (sample operator profiles and the placeholder work samples credited to them) are left out
of head.json: they are invented, so the live site never serves them at a public URL, not even as noindex.

## 1. URL structure

- One host: `https://revenuenomad.com`, HTTPS, non-www, no trailing slash, lowercase. **Owner decision pending (www or non-www).** The
  other host 301s to the chosen one. **The live blog is on www today**, and so are `profile.js` (share link),
  `studio-a.js` (search preview and its sample schema) and research.js `OLD_BLOG` (every rebuilt post's in-page Article
  and BreadcrumbList). `RN.share`, the badge snippet, `studio-b.js` and research.js's library and glossary schema use
  non-www. Every builder should call `RN.seo.url(route)` once the decision is made.
- Path rule (same as `RN.share.url`): the hash route's dots become slashes and underscores become hyphens. Two first
  tokens are renamed, both already in use in the repo (**owner decisions**): `guide.<slug>` is `/post/<slug>` (the live
  blog's pattern, and where the old-post 301s in research.js already point) and `op.<slug>` is `/operators/<slug>` (what
  operators see in their profile share link and Studio preview). `RN.share.url` still builds `/guide/` and `/op/`; both 301.

| Prototype route | Live path | Robots |
|---|---|---|
| `#home` | `/` | index,follow |
| `#fractional-cost` | `/fractional-cost` | index,follow |
| `#hire-fractional-sales-vp` | `/hire-fractional-sales-vp` | index,follow |
| `#browse.revenue_operations` | `/browse/revenue-operations` | index,follow |
| `#rates.revenue_operations` | `/rates/revenue-operations` | index,follow |
| `#guide.fractional-vp-of-sales-cost` | `/post/fractional-vp-of-sales-cost` | index,follow |
| `#blueprint.vp-sales` | `/blueprint/vp-sales` | index,follow |
| `#op.anne-zavorskas` | `/operators/anne-zavorskas` | index,follow |
| `#report` | `/report` | index,follow |
| `#studio.visibility` | `/studio/visibility` | noindex |
| `#join.operator.3` | `/join/operator/3` | noindex |

### Redirects
- Hash links (`/#guide.x`) never reach the server. Inline `hash-redirect.js` on the home page so shared prototype links
  land. It moves only a hash whose first token is a known route (35 tokens, copied in with the alias
  tables), so in-page anchors such as the skip link `#main` stay put, and it needs nothing else from the prototype. The
  build runs it against every route and alias and fails if it disagrees with `RN.seo.path`. If the live home page gives a
  section an id equal to a route token (for example `how`), rename the id.
- 301s (full list in `head.json` → `redirects`, 56 entries), in this order: exact paths, then wildcards,
  then the host rule last. Every path rule has `anyHost: true`: it matches on both hosts and sends straight to
  `https://revenuenomad.com` + `to`, so an old `https://www.revenuenomad.com/post/<old>` URL takes one hop, not two (the host rule
  first and the path rule second would be a chain). The list: renamed routes (`/projects` → `/engagements`,
  `/state-of-fractional` → `/report`); prototype guide aliases, at both `/post/<old>` and `/guide/<old>`; every old
  blog post folded into a rebuilt guide (posts.js `replaces`); `/op/*` and `/guide/*`; the other host.
- 16 entries marked "Candidate" (posts.js `candidates`) need a yes before launch.
- 17 entries carry `after: <date>`: their guide is not live yet. Apply each on that date, not before.
- posts.js lists 5 replaced page(s) with no URL, so they have no 301 yet: Hiring a Fractional Head of Sales in Dallas: Everything You Need to Know in 2026, Hiring a Fractional Head of Sales in Kansas City: Everything You Need to Know in 2026, Hiring a Fractional Head of Sales in Portland: Everything You Need to Know in 2026, Everything You Need to Know in 2026 to Hire a Fractional VP of Sales in Atlanta, Hiring a Fractional VP of Sales in Denver: Everything You Need to Know in 2025. Find their old URLs in Search Console before launch.

## 2. Per-template head rules

Every route sets: `<title>`, `<meta name="description">`, `<link rel="canonical">` (self, absolute), `<meta name="robots">`,
`og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `twitter:card` (summary), `twitter:title`,
`twitter:description`, and one `<script type="application/ld+json">` with the route's `@graph` (`<` escaped as `\u003c`).
Render all of it server-side (or prerender): engines that do not run JavaScript must see the same head.

Titles are at most 60 characters, with " · Revenue Nomad" only when it fits, and no colons. Descriptions are at most 155 characters and
are the page's answer in one or two whole sentences, with real figures where they exist. Cost pages carry the year and the
real figure in the title ("Fractional VP of Sales Cost (2026), $4k - $10k/month").

| Template | Title | Description | Robots | Schema (besides Organization, WebSite, BreadcrumbList) | Sitemap |
|---|---|---|---|---|---|
| Home, how, talk, about, results, join, operators, levels, framework, library, insights, guides hub, blueprints, engagements | Fixed per page | Fixed answer sentence | index | None | pages / guides |
| Function pages (sales, RevOps, marketing) | The page title | Hours and monthly range from RN.costs | index | FAQPage | roles |
| Cost hub /fractional-cost | Year and the hub monthly range | RN.costs.answer(hub) | index | FAQPage, Dataset (real) | roles |
| Browse role /browse/<role> | Fractional <role> for Hire | What the seat does | index | None | roles |
| Rate Index role, real seat (sales, RevOps, marketing) | Role and year, no figure | The H1, then the real seat by name and its hourly rate | index | Dataset (illustrative) | roles |
| Rate Index hub and other roles | Year, no figure | No figure; says illustrative | index | Dataset (illustrative) | roles |
| Report /report | Preview Edition | Says every figure is illustrative | index | Dataset (illustrative) | pages |
| Guide /post/<slug> | posts.js metaTitle; cost guides use year and figure; older guides a short title | The guide's answer; illustrative guides get a sentence with no figure or finding | index (noindex until its publish date) | Article, FAQPage (+ Occupation on the two real cost guides) | guides |
| Blueprint /blueprint/<id> | <Seat> Blueprint | Problem, then what it scopes | index | None | roles |
| Operator profile /operators/<slug>, real | Name, Fractional <role> | Name, role, focus areas | index | ProfilePage + Person | operators |
| Operator profile, unknown slug | Operator Not Found | Says no live profile matches | noindex | None | none |
| Operator profile, sample | Not in the live build | Not in the live build | Not served | None | none |
| Work gallery /work and its filters | Fixed | What the gallery holds | noindex while every sample is a placeholder | None | none until real |
| Work sample /work/<id> | Sample title (placeholders: not in the live build) | Title and how it was used | index once real | None | none until real |
| Studio, workspace, admin, standards, review, proof, compare, verify, engagement drafts and posts, application steps, talk steps, 404 | Tab or step name | Says private | noindex | None | none |

Description precedence in the prototype matches head.json: RN.seo's description first, then a view's own `description`,
then the site default, so a view's copy (the Rate Index views quote illustrative medians) never reaches the head. The build
renders 178 routes in the prototype and fails if any rendered head differs from RN.seo's.

## 3. Structured data rules

- **Organization and WebSite on every page**, with `@id` `https://revenuenomad.com/#organization` and `/#website`. The WebSite has a
  SearchAction on `/browse?q={search_term_string}`: the live browse page must read `?q=`. The Organization has no founder,
  employee or contact person: Revenue Nomad is presented as a company.
- **BreadcrumbList on every page but home** (a one-item list says nothing). Where the page shows a breadcrumb, the list
  follows it word for word, then names the page (guides: Insights, Guides, the guide's group, the guide; Rate Index:
  Insights, Rate Index, the role; browse: Browse talent, the role; Blueprints: Post an engagement, Blueprints, the seat).
  Elsewhere it is Home, then the page. The build checks every rendered page.
- **FAQPage** only where the page shows its FAQ: function pages, the cost hub and guides (the guide's question and short
  answer first, then its FAQ). Not on For operators: its FAQ quotes a proposed fee that is not decided. Google limits FAQ
  rich results to a few site types, so the value here is for AI answers.
- **Article** for each guide: author `Organization "Revenue Nomad Research"` (part of Revenue Nomad), publisher the
  Organization, `datePublished` = posts.js `publish` (or `updated` for a rebuilt live post), `dateModified` = `updated`.
  Add `image` once each guide has one hosted on the site, and `reviewedBy` once a reviewing operator signs off.
- **ProfilePage + Person** for approved, searchable real operators only: name, jobTitle, url, description (their headline)
  and image only when the photo is hosted on the site. No email, phone, LinkedIn or sameAs. Never for sample operators.
- **Occupation** only on the two real cost guides, one URL per seat: `/post/fractional-vp-of-sales-cost` (vp-sales,
  "Fractional Director or VP of Sales") and `/post/fractional-cmo-cost` (cmo, quoted). Each is named after the seat its
  figures come from, never after the whole role: an RN.costs seat record is one seat (vp-sales is a director or VP for teams
  under 5 to 8 reps; the CRO and the RevOps director and architect cost more), so the Rate Index role pages and the cost hub
  carry no Occupation, and RevOps has none until a real leader seat has hourly and monthly figures. `estimatedSalary` holds
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
  router removes the in-page `<script type="application/ld+json">` previews (research.js, insights.js) from the DOM and puts
  RN.seo's graph at the end of `<main>` instead, so a crawler that runs JavaScript never reads their illustrative FAQ
  answers, their "Revenue Nomad" author or their www and `/library/<slug>` URLs. The collapsible preview text stays for the team.

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

- `sitemap_index.xml` lists four sitemaps; each lists only indexable, live URLs with `lastmod` where known (guides:
  posts.js `updated`; cost pages: RN.costs `asOf` 2026-10-11; Rate Index and report: market.js `asOf` 2026-09-24).
  Operators have no reliable modified date in the export, so they carry none until the live database provides one.
- Scheduled guides join `sitemap-guides.xml` on their publish date (rerun the build): `/post/how-to-stop-running-sales-as-a-founder` (2026-11-16), `/post/sales-meetings-not-converting` (2026-11-02), `/post/fractional-cro-vs-full-time-cro` (2026-11-30), `/post/fractional-revops-consultant` (2026-11-23), `/post/how-to-fix-sales-forecast-accuracy` (2026-12-14), `/post/how-to-hire-a-fractional-cmo` (2026-11-09), `/post/fractional-cmo-vs-agency` (2026-12-21).
- The work gallery and its samples stay noindex and out of the sitemaps while every sample is a placeholder (work.js
  `placeholder: true`); RN.seo indexes them automatically once real portfolio items replace them.
- robots.txt allows everything except app and private paths (`/studio`, `/buyer`, `/admin`, `/standards`, `/review/`, `/proof/`, `/compare`, `/engagement/`, `/join/operator`, `/join/done`, `/talk/`). Pages that
  should stay out of the index but may be linked publicly (sample profiles, placeholder work, verify pages) use the noindex
  meta, not Disallow, so crawlers can see it.
- `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. **ai-train is an owner decision**, marked in the file.

## 7. llms.txt

`llms.txt` follows the llmstxt.org proposal: H1, a one-paragraph summary, then sections of links (how it works, Talk to us,
browse, function pages, the cost hub, every guide with its one-line answer, the Rate Index and report clearly marked as
illustrative previews, For operators). It is a proposal, not a standard: no major search engine has committed to reading
it, and some AI crawlers do. Serve it at `/llms.txt` as text/plain; it costs nothing and never replaces the sitemaps or
the on-page head. Regenerate it with the build so its answers match the pages.

## 8. Launch checklist

- [ ] Owner: www or non-www; set `HOST` in js/data/seo.js and 301 the other host.
- [ ] Owner: `/post/` for guides and `/operators/` for profiles (or the plain RN.share paths); align RN.share.url, profile.js and studio-a.js.
- [ ] Owner: ai-train yes or no in robots.txt.
- [ ] Owner: keep the illustrative report and Rate Index indexable with their Dataset, or noindex them until the survey closes.
- [ ] Server-render or prerender every head in head.json; check with JavaScript off.
- [ ] One canonical per URL, self-referencing; no canonical on a noindex page pointing elsewhere.
- [ ] 301 map live in head.json's order (exact paths, wildcards, host rule last), path rules on both hosts, each `after` rule on its date; no redirect chains.
- [ ] Inline `hash-redirect.js` on the home page for shared prototype links.
- [ ] Scheduled guides: serve each from its publish date and rerun the build that day, so it flips to index and joins the sitemap.
- [ ] `/browse?q=` works for the SearchAction.
- [ ] Export a square logo of at least 112 x 112 px (512 x 512 recommended) and host it at `/assets/brand/logo-512.png`, the
  Organization logo in the schema (`assets/brand/mark.png` is 45 x 48, under Google's minimum). Host operator photos under `/assets/photos/`.
- [ ] Make an Open Graph image (1200 x 630) per template and add `og:image` and `twitter:card=summary_large_image`.
- [ ] Submit `sitemap_index.xml` in Google Search Console and Bing Webmaster Tools; verify both hosts.
- [ ] Validate a sample of each template in the Rich Results Test and the Schema Markup Validator.
- [ ] Serve `robots.txt`, `llms.txt` and the sitemaps at the site root with correct content types.
- [ ] 404 page returns a real 404 status and `noindex`.
- [ ] Rerun `node tools/build-seo.js` before launch and on every content release; it must end "All SEO checks pass".

## 9. Validation (this build)

All SEO checks pass. Checked: every route tools/check.js visits has a head; titles at most 60 and
descriptions at most 155 characters, all unique; canonicals unique; no colon in a title; no en or em dash, banned word or
"prototype" in any title, description or llms.txt; every dollar figure in a title or description is a real RN.costs figure,
and illustrative pages carry none; a guide not live yet is noindex; every JSON-LD graph parses, every node is typed and
`@id`s are unique per page; Article dateModified is never before datePublished; every BreadcrumbList has at least two
items; the Organization logo is at least 112 x 112; no contact details in Person and no Person for a sample; each seat's
Occupation is on one URL and its figures equal a real RN.costs seat and match no Rate Index figure; no salary markup on an
illustrative page; illustrative Datasets say so first; head.json holds no sample operator or placeholder work; every
redirect has a source and a live route as its target, none points at another rule's source, exact rules come before the
wildcards and the host rule is last, rules to guides not live yet carry their date, and every merged prototype guide has a
rule; hash-redirect.js agrees with RN.seo.path on every route and alias and leaves in-page anchors alone; llms.txt lists
each URL once and says companies; every sitemap URL is indexable, live and not blocked by robots.txt; the founder is not
first in the operator sitemap; all XML is well-formed; and 178 routes rendered in the prototype carry exactly
RN.seo's title, description (meta, Open Graph, Twitter), canonical, robots and graph for the URL in the address bar, no
other JSON-LD, and a BreadcrumbList that follows the visible trail.

Schema nodes by type: Organization 436, WebSite 436, BreadcrumbList 435, Dataset 11, FAQPage 37, Article 33, Occupation 2, ProfilePage 294, Person 294.
