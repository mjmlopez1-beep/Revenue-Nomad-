# Spec: the Revenue Health Diagnostic and the three "How we engage" pages

Status: BUILT 2026-11-09 from the Design canvas "Revenue Nomad - Option D website" artboards "Desktop - Revenue Health
Diagnostic", "Desktop - Monthly fractional leadership", "Desktop - Interim cover", "Desktop - Fractional to full time"
and their phone twins. Owner's direction: use the homepage's gold occasionally, tied to the seven pillars and the
method; make the Diagnostic the most visual, methodical page on the site, in the spirit of an architectural parti
diagram, so it reads as intellectual property a company can trust.

## Routes

As the canvas's site map proposes: `/revenue-health-diagnostic`, `/how-we-engage/fractional`,
`/how-we-engage/interim`, `/how-we-engage/full-time`. The `/engage/*` placeholders were renamed before any shipped.

## The Diagnostic (`app/revenue-health-diagnostic/`, `app/diagnostic/`)

Every word of the board in order: hero (with "Take the 2-minute check first" added), when to start here, the model,
the two analysis lenses, the five-step timeline on the dark band with gold numbers, four things you keep, the sample
roadmap, the operator-versus-consulting-firm comparison, governance, what happens after the readout, FAQ, closing.

Illustrations, all inline SVG or CSS on the site's tokens, drawn on the same isometric grid as the homepage's cube
solid (`app/diagnostic/iso.tsx`):

- **The method diagram** (`MethodDiagram.tsx`): eight small isometric drawings in two rows with arrows and captions.
  One revenue engine; seven pillars; 21 building blocks; scored on four levels (shaded, gold marker at the level
  reached); what is broken, ranked (the lowest blocks pulled forward, the worst in gold); regrouped into
  workstreams; a bridge from pipeline to the bookings goal (gold slab); an operating rhythm (gold ring with the
  re-scores). Each drawing has a title and the set has one plain-language description for screen readers.
- **The 21 blocks** (`BlocksGrid.tsx`): seven pillar cards with gold numbers, each block as a small cube beside its
  name; the four maturity levels on a gold rail. Names and level copy come from `app/check/content.ts`, so the
  2-minute check and the Diagnostic cannot drift.
- **Scores by pillar** (`ScoresChart.tsx`): the board's illustrative scores on the 1 to 4 scale with a gold
  "Target 3" marker, labeled Illustrative.
- **The sample roadmap** (`Roadmap.tsx`): five workstreams across Month 1 to Q4 with forest bars, score-to-target
  labels, gold milestone diamonds, the "What it unlocks" row; scrolls inside its region on phones.

The board quotes no dataset figure; the 15-month, $400M ARR case stat carries the confirm badge until the case
study is confirmed. "Quick wins split from bigger bets" reads "separated" because "split" is on the fee-language
blocklist.

## The three engagement pages (`app/engage/`, `app/how-we-engage/`)

One block-based template (`EngagePage.tsx`, `app/engage/content/types.ts`): hero plus sections of typed blocks
(lede, p, list, cards, steps with gold numbers, stats, compare and table in scroll regions, callout, quote, faq,
the shared pick method from `app/solutions/PickMethod.tsx`, otherWays). Content modules carry every word of
their board in order; `engagements` in types.ts holds the four engagement cards' copy from the boards.

Figures read from the dataset: the Fractional page's hero and FAQ quote the survey's median engagement month
($6,000, the board said $8,900), its role table reads shares and medians from the index, the interim contract
range comes from the signed seat ($31.2k to $35.8k, 130 to 173 hours), conversion, extension and expansion figures
from the survey and contracts. Literals with no column stay as written and name their source: Lightcast 265%,
Majhi Group search timing, SHRM cost per hire, HBR tenure, the one case narrative. The Fractional board's "74% of
engagements at 40 hours or fewer" has no reproducing column and reads 55% (under 40 hours) from the hours bands.

## Gold

Gold appears as step numbers on the timelines, pillar and method numbers, the maturity rail, the target marker and
milestone diamonds, and one gold callout on the Full-time page. No new colors were added.

## Checks

`check:tokens` covers the four new folders; `check:home` runs the Diagnostic and the Fractional page by default
and passed on all four pages, a role page and the homepage against the production build: zero axe violations,
no horizontal scroll, weight inside the budget, fee language clean. Homepage links that are not menus also stop
prefetching the Diagnostic on load, which kept the homepage under its weight budget.
