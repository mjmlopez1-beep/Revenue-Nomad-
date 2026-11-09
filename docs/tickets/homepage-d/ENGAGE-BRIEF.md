# Brief: the "How we engage" pages and the Revenue Health Diagnostic

Four pages from the Design canvas "Revenue Nomad - Option D website" (https://claude.ai/artifact/1CosGB9Ef1wMCrX8rt7uqh).
Routes follow the canvas's site map and are already in `app/home/content/links.ts` (do not edit it):
`/revenue-health-diagnostic`, `/how-we-engage/fractional`, `/how-we-engage/interim`, `/how-we-engage/full-time`.

## Sources on disk

- Artboards (desktop and phone `.dc.html`) in
  `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/artifact-files/01a61064-0393-4bc6-aa5e-b417e5e7a6d8/project/`:
  `AssessmentPage`, `AssessmentMobile` (the Diagnostic), `FractionalPage`, `FractionalMobile`, `InterimPage`,
  `InterimMobile`, `FullTimePage`, `FullTimeMobile`. Text extractions, every word in order with `## H2:` headings
  and `[SVG]`/`[IMG]` markers:
  `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/research/{diagnostic,fractional,interim,fulltime}-text.txt`.
- The owner's reference for the Diagnostic's illustrations: an architectural "parti diagram" at
  `/root/.claude/uploads/829a0397-bf71-53f3-942e-e2b2163cc413/fd77a5cb-image.jpg`: eight small isometric
  diagrams in two rows, each a step of a method (a block, then floors stacked, then a core, then structure...),
  arrows between them, a short caption under each, one accent color on a white ground. The Diagnostic should feel
  like that: visual, methodical, intellectual property a company can trust.
- Homepage pieces to reuse: `app/home/home.css` primitives (`rn-wrap rn-section rn-eyebrow rn-h1 rn-h2 rn-lede
  rn-body rn-small rn-btn rn-btn--ghost rn-btn--leaf rn-btn--outline-light rn-link rn-band--dark rn-band--forest
  rn-band--mist rn-badge`), `SiteHeader`, `SiteFooter`, `ClosingBand`, `Arrow`, `Figure.tsx` (`FlagIf` for
  unsourced claims), `app/home/Assessment.tsx` and `CubeSolid.tsx` (the homepage's seven-pillars section on a
  gold band with the isometric cube solid; its CSS shows how the cubes take token fills), `app/home/HowItWorks.tsx`
  (gold step numbers on a dark band), `app/solutions/content/shared.ts` (the shared "How we pick the leader"
  method with the tier icons), `app/solutions/RolePage.tsx` and `Role.css` (the house pattern for a content-driven
  page: hero, cards, steps, comparison table in a scroll region, FAQ `<details>`).
- The seven pillars and four maturity levels are already defined in `app/check/content.ts` (`pillarLabel`,
  `levels`); the Diagnostic's 21 building blocks are on its artboard. The 2-minute check at `/check` is the
  self-serve version of the Diagnostic; link to it where the board says "see what you get" or similar.
- Dataset figures: `app/guide/content/figures.ts` (`import * as f from "../../guide/content/figures"` from a
  content folder two levels down): `f.rates.median` ($250), `f.rates.n` (113), `f.engagements.medianMonthly`
  ($6,000, the median engagement month), `f.engagements.monthlyByCategory`, `f.category(name).median`,
  `f.survey.byRole` shares (Sales Leadership 42%, Marketing 24%, Revenue Operations 15%, AI GTM 9%),
  `f.survey.aiUse` (97%, 36%), `f.engagements.resultInside60` (82%), `f.engagements.extendedShare` (57%),
  `f.survey.status` (4 of 74 ended early, 1 converted), `f.term("3 to 6 months")`, `f.platform.minThreeMonths`,
  `f.seat(...)` contract ranges, `f.contracts.expandedHours`. The Fractional board's "$8,900/month median
  engagement" becomes `f.engagements.medianMonthly`; its role table's medians become `f.category(...)` and the
  shares `f.role(...)`. Never type a dataset figure as a literal; figures with no column (Lightcast 265%, Built In,
  the one-day-a-week client, case study numbers, "two weeks" to cover a seat) stay as written.

## The gold

The owner wants the homepage's gold (`var(--rn-gold)`, the seven-pillars band and the How it works step numbers)
to appear occasionally on these pages, always tied to the seven pillars and the method: pillar numbers, step
numbers, the maturity scale, a highlighted milestone, one gold band per page at most. Use it as an accent, not a
wash; text on gold is ink. No new colors: tokens only (`node scripts/check-tokens.mjs` fails on a raw color, font
or radius). If a tone is missing, say so in your report rather than adding a hex.

## House rules

Copy voice plain and specific; dashes are " - "; no em dashes, arrows (in text), emoji or hype. Client-facing: say
"no search fee", never "recruiting fee", "margin", "split", "take-home" or Revenue Nomad's own fee; the price is the
operator's rate and "No fees for companies". Every number names its source or is wrapped in `FlagIf`. Sections are
`<section aria-labelledby>`; headings h1, h2, h3 in order; images and inline SVG have alt text or `aria-hidden`;
phones at 390 with no horizontal scroll (wide tables scroll inside `role="region" aria-label tabIndex={0}`; grids
collapse with `minmax(0, 1fr)`). Links: Talk to us `/talk`, the check `/check`, Rate Index `/research/rate-index`,
guide `/fractional-gtm-buyers-guide-2027`, case studies `/case-studies`, browse `/operators/browse`, role pages
`/fractional-vp-of-sales` `/fractional-cmo` `/fractional-revops` `/fractional-ai-gtm`, problem pages `/problems/*`.
Verify with `npx tsc --noEmit`, `node scripts/check-tokens.mjs`, and `node scripts/check-home.mjs --path <your
paths>` (it starts its own dev server; if another dev server is running in the checkout, build and test from an
isolated copy of the tree with node_modules symlinked, as the role-page agent did). Report every figure sourced
from `f`, every literal kept, every link remapped and every deviation from the board.

## The three engagement pages (template plus content modules)

Content shape: `app/engage/content/types.ts` (`EngagePage`: hero plus sections of typed blocks). Template agent
writes `app/engage/EngagePage.tsx`, `app/engage/Engage.css` (prefix `eg-`), `app/engage/content/index.ts`,
`app/engage/makeEngagePage.tsx` and the three routes `app/how-we-engage/{fractional,interim,full-time}/page.tsx`,
plus the Fractional module `app/engage/content/fractional.ts`. Block renderers: `lede`, `p`, `list`, `cards`
(2 to 4 columns), `steps` (numbered, gold numbers, optional `when` label), `stats`, `compare` and `table` (scroll
region), `callout` (gold, leaf or night), `quote` (with optional stat and case link), `faq` (two-column
`<details>` like the role pages), `pick` (render `app/solutions/content/shared.ts` exactly as RolePage does; export
a reusable component from `app/solutions/` if one does not exist yet), `otherWays` (the other three entries of
`engagements` from types.ts as linked cards). Section `band` picks the background. Content agents write
`app/engage/content/interim.ts` and `app/engage/content/full-time.ts` carrying every word of their board in order.

## The Diagnostic (one agent, a dedicated page)

Route `app/revenue-health-diagnostic/page.tsx`; components and styles under `app/diagnostic/` (prefix `dx-`).
Carry every word of the Assessment board in order: hero; "When to start here" (four cards); "Seven pillars, 21
building blocks" with the four maturity levels; "Every question tied to an analysis" (two lenses, five items each,
benchmark ranges note); "A readout at day 30, a plan by day 60" (five steps); "Four things you keep" with the
illustrative scores by pillar; the sample roadmap; the operator-versus-consulting-firm comparison; governance (four
cards); "What happens after the readout" (three options and the 15-month case stat); FAQ; closing band.

Make it the most visual page on the site, in the parti-diagram spirit:

1. **The method diagram** at the top of the model section: an inline SVG component (`MethodDiagram.tsx`) of eight
   small isometric drawings in two rows of four with arrows between them and a caption under each, in the style of
   the reference: a single block (the revenue engine as one envelope), the block cut into seven slabs (the pillars),
   the slabs split into 21 blocks, the blocks shaded by score on the four levels (gold for the level reached), the
   lowest blocks lifted out (what is broken, ranked), the blocks regrouped into workstreams, a bridge from the
   pipeline block to the bookings block, and the finished solid with the operating rhythm around it. Draw with the
   same isometric grid as `CubeSolid.tsx` (half width 24.25, rise 14, depth 28), forest and leaf faces, night
   outlines, gold for the highlighted element, dashed outlines for what is yet to build. Each drawing is a `<g>`
   with a `<title>`; the SVG has `role="img"` and an `aria-label`. Make it responsive: four across on desktop, two
   across on phones (render as eight separate small SVGs in a CSS grid rather than one wide SVG).
2. **The 21 blocks**: the seven pillars as seven columns, each a stack of its building blocks drawn as small
   isometric cubes (3 or 4 per pillar) with the block names beside them and the pillar number in gold; the four
   maturity levels as a horizontal scale under it, Ad Hoc to Optimized, with the level names and summaries.
3. **The scores illustration** in "Four things you keep": an SVG or CSS bar chart of the seven illustrative pillar
   scores on the 1 to 4 scale with the scale ticks and a gold marker at the target, labeled "Illustrative" exactly
   as the board does.
4. **The sample roadmap**: a grid (CSS) of five workstreams across Month 1, 2, 3, Q2, Q3, Q4 with forest bars, the
   score to target in each row label, the gold milestone markers, and the "What it unlocks" column, in a scroll
   region on phones. Label "Illustrative", with the board's note.
5. The five-step timeline on a dark band with gold step numbers like the homepage's How it works.

Reuse `pillarLabel` and `levels` from `app/check/content.ts` for the names and level copy so the check and the
Diagnostic cannot drift. Link "See what you get" to the scores section and offer the 2-minute check at `/check` in
the hero or near it ("Take the 2-minute check first"). The "15 months" case stat links to `/case-studies`.
