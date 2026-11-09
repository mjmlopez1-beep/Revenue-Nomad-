# Brief: the four role pages ("Hire a fractional leader")

Build the pages the Solutions menu's first column links to, from the Design canvas "Revenue Nomad - Option D
website" (https://claude.ai/artifact/1CosGB9Ef1wMCrX8rt7uqh). Routes are flat, as the canvas's site map proposes:
`/fractional-vp-of-sales`, `/fractional-cmo`, `/fractional-revops`, `/fractional-ai-gtm` (already in
`app/home/content/links.ts`; do not edit that file).

## Sources, already on disk

- Artboards (full `.dc.html`, desktop and phone) in
  `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/artifact-files/01a61064-0393-4bc6-aa5e-b417e5e7a6d8/project/`:
  `VPSalesPage.dc.html`, `VPSalesMobile.dc.html`, `CMOPage.dc.html`, `CMOMobile.dc.html`, `RevOpsPage.dc.html`,
  `RevOpsMobile.dc.html`. Text-only extractions (every word, in order, with `[IMG]` markers and `## H2:` headings):
  `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/research/{vpsales,cmo,revops}-text.txt`.
  There is no AI GTM artboard; that page follows the same template with content drawn from the Buyer's Guide
  (`app/guide/content/06-role-guide.ts` AI GTM section, `10-ai-and-what-comes-next.ts`), the AI problem page
  (`app/problems/content.ts`, slug `ai`) and the Rate Index AI GTM category.
- Content shape: `app/solutions/content/types.ts` (`RolePage`). Every page is one module
  `app/solutions/content/<slug>.ts` exporting `const page: RolePage` as default. Section order per page comes
  from the artboard and goes in `order`.
- Dataset figures: `app/guide/content/figures.ts` (import as `import * as f from "../../guide/content/figures"`).
  Rates: `f.category("Sales Leadership").median` ($250), `f.category("Marketing").median` ($220),
  `f.category("Revenue Operations").median` ($250), `f.category("AI GTM").median` ($250, 8 rates, directional).
  Monthly ranges from signed contracts: `f.seat("Sales Director or VP of Sales")?.monthly` ($3,900 to $12,000;
  write it as `${f.k(min)} - ${f.k(max)}/month`, "from our 2026 contracts"), `f.seat("CRO and revenue
  transformation")`. Where no contract seat exists (CMO, RevOps, AI GTM) use the survey's median month for the
  category: `f.engagements.monthlyByCategory` (Marketing $4,500 at 20 hours, Revenue Operations $9,000 at 30
  hours, AI GTM $6,800 at 18 hours) and say "median month, operator survey". Survey shares per role:
  `f.role("Sales Leadership")` etc. (`resultUnder30`, `extended`, `medianHours`, `demandMean`), all-role shares:
  `f.engagements.resultInside60` (82%), `f.engagements.extendedShare` (57%), `f.survey.status.endedEarly` (4 of
  74), `f.survey.status.converted` (1), `f.survey.aiUse` (97%, 36% most), `f.wish("stage")` 47%, `f.wish("logos")`
  4%, `f.rates.n` (113), `f.rates.median`. Never type a dataset figure as a literal; template-string it. Figures
  with no column (Built In $350K, inbound "6 of 20", the one-day-a-week client, case study numbers, CORE and tier
  copy) stay as written.
- Homepage primitives to reuse: `app/home/home.css` (`.rn-wrap .rn-section .rn-eyebrow .rn-h1 .rn-h2 .rn-lede
  .rn-body .rn-small .rn-btn .rn-btn--ghost .rn-btn--leaf .rn-btn--outline-light .rn-link .rn-band--dark
  .rn-band--forest .rn-band--mist .rn-badge .rn-avatar`), `SiteHeader`, `SiteFooter`, `ClosingBand`, `Arrow`,
  `Avatar`, `Figure.tsx`. Tokens only from `app/tokens.css` (`var(--rn-*)`); `node scripts/check-tokens.mjs` fails
  on any raw color, font or radius. Solution pages (`app/problems/SolutionPage.tsx`, `Solution.css`) show the house
  pattern for a content-module-driven page.

## Template (one agent)

- `app/solutions/RolePage.tsx` (server component) renders a `RolePage` in `order`: hero (eyebrow, h1 with the
  italic `em` and the coral full stop via the existing headline pattern, lede, two pill buttons, the price pill),
  `triggers` (six cards), `does` (list), `cost` (price, note, Rate Index link, "No fees for companies" line),
  `owns` (six numbered items; render as `<details>` accordions open by default on desktop is NOT required: render
  them as open blocks, each with title, sub, body, a "By day 90" line and two Q and A pairs), `compare`
  (three-column table in a scroll region with `role="region" aria-label tabIndex={0}`), `engagements` (three
  cards plus two stats and a source), `ninety` (five steps), `practice` (quote, case link, stat), `pick` (shared:
  three checks, the CORE letters, the five Reputation Index tiers with the icons in `public/home/tiers/`
  emerging, proven, trusted, elite, apex at 195 by 195), `leaders` (three sample profiles with `Avatar` initials,
  a "Sample profile" badge, tags, days, price, location, tier icon and score, then the browse button and the
  note), `faq` (two-column `<details>` list like the homepage FAQ), `keepReading` (three cards), then
  `ClosingBand` and `SiteFooter`. Styles in `app/solutions/Role.css`, prefix `rp-`, phone-first at 390 with no
  horizontal scroll (wide tables scroll inside their region; grids collapse with `minmax(0, 1fr)`).
- `app/solutions/content/shared.ts`: the `pick` section content and the tier list, identical on every page.
- `app/solutions/content/index.ts`: `pages` map slug to module, `rolePaths`.
- `app/solutions/makeRolePage.tsx`: `export function makeRolePage(slug)` returning `{ metadata, Page }`, and four
  route files `app/fractional-vp-of-sales/page.tsx`, `app/fractional-cmo/page.tsx`, `app/fractional-revops/page.tsx`,
  `app/fractional-ai-gtm/page.tsx`, each three lines. Metadata: title "Fractional VP of Sales | Revenue Nomad",
  description from `meta`, canonical `https://revenuenomad.com/<slug>`.
- Also write `app/solutions/content/fractional-vp-of-sales.ts` from the VP of Sales artboard, every word carried.

## Content modules (one agent each: CMO, RevOps, AI GTM)

Carry every word of the artboard into the module in artboard order; keep the author's voice. Dashes are " - ",
no em dashes, no arrows, no emoji. The site's words: say "no search fee" (never "recruiting fee"); never
"margin", "split", "take-home" or Revenue Nomad's own fee. Links: Talk to us `/talk`, the check `/check`, Rate
Index `/research/rate-index`, the guide `/fractional-gtm-buyers-guide-2027`, case studies `/case-studies`,
browse `/operators/browse`, engagement pages `/engage/fractional`, `/engage/interim`, `/engage/full-time`,
`/engage/diagnostic`, guides `/guides/hiring-a-fractional-vp-of-sales` and `/guides/where-ai-fits-in-sales`
(other guide slugs on the boards map to those two or to `/guides`). Sample leader photos on the boards are stock;
leave `items` with names and text only, the template draws initials. Run `npx tsc --noEmit` before reporting;
report every figure you could not source from the dataset and every link you remapped.
