# Spec: the four role pages (Hire a fractional leader)

Status: BUILT 2026-11-09 from the Design canvas "Revenue Nomad - Option D website" artboards "Desktop - Fractional
VP of Sales", "Desktop - Fractional CMO", "Desktop - Fractional RevOps leader" and their phone twins. There is no
AI GTM artboard; that page follows the same template with content from the Buyer's Guide (Chapter 6 AI GTM,
Chapter 10), the AI problem page and the Rate Index AI GTM category.

## Routes

Flat, as the canvas's site map proposes and as buyers search: `/fractional-vp-of-sales`, `/fractional-cmo`,
`/fractional-revops`, `/fractional-ai-gtm`. The earlier `/solutions/*` placeholders in `links.ts` were renamed before
any of them shipped, so no redirects are needed. `app/home/content/links.ts` lists them as real pages.

## One template, four content modules

`app/solutions/RolePage.tsx` renders a `RolePage` (`app/solutions/content/types.ts`) in the section order the
artboard draws (`order`): hero with the price pill, "When companies hire one" (six triggers), what the role does,
what one costs, "Six things the leader owns" (each with a by-day-90 line and two buyer questions), the
fractional-versus-full-time-versus-firm comparison, engagements shaped to the problem, the first 90 days, what it
looks like in practice, how we pick the leader (shared: three checks, CORE, the five Reputation Index tiers with
their icons from `public/home/tiers/`), sample leader profiles (initials avatars with a "Sample profile" label; the
boards' photos are stock), common questions, keep reading, the closing band. Content modules live in
`app/solutions/content/<slug>.ts`; `makeRolePage.tsx` produces each route's metadata and page.

## Figures

Dataset figures read from `app/guide/content/figures.ts`, so the role pages move with `data/rate-index.json`
alongside the guide, the Rate Index page and the homepage: category medians (`f.category`), per-role survey shares
(`f.role`), the signed-contract seat ranges (`f.seat`, the VP of Sales pill is the Sales Director or VP seat's
monthly range) and the survey's median month per category where no contract seat exists (CMO, RevOps, AI GTM).
Figures with no column stay as written and are labeled by source: Built In compensation, the inbound request
cuts, case study numbers, the one-day-a-week client.

## Images

The owner's canvas now carries real imagery, so the homepage uses it (superseding decision A5's "no imagery"):
thirteen monochrome client logos in the marquee and color variants on the case cards, reviewer portraits in
In their words, abstract card art on the Solutions, Outcomes and Resources cards, the canvas's illustrative
sample-operator photos on the For operators band (labeled sample profiles), and the glass knot as the faint
decorative background of the How it works band, where the artboard places it. Files live under `public/home/{logos,people,cards,tiers}` and `hero-knot.webp`.
Before launch the owner confirms reviewers and clients are happy to be shown, as the canvas note says.

## Deviations from the boards

- Prices: the VP of Sales pill reads the signed-contract seat range ($3.9k to $12k a month) where the board said
  "$4k - $10k"; CMO, RevOps and AI GTM quote the survey's median month ($4.5k, $9,000, $6,800) where the boards
  said "$8k - $20k" and "$6k - $14k" with no contracts behind them.
- "no recruiting fee" reads "no search fee"; results inside 60 days read 82% (boards said 78%); the index is 113
  rates (boards said 137); the boards' hero spec-sheet grid (RevOps) and "At a glance" strip (CMO) fold into the
  cost section; the "Six things" items render open rather than as accordions; the stock leader photos and the
  keep-reading illustrations are not shipped.
- The AI GTM page has no board: its "in practice" section quotes the Buyer's Guide, not a client, until a real AI
  engagement quote exists.
- Header and footer menu links no longer prefetch every route on load; the homepage's transferred weight fell from
  1.9 MB to 1.4 MB.

## Checks

`check:tokens` covers `app/solutions` and the four route folders; `check:home` runs the VP of Sales and RevOps
pages by default and passed on all four role pages and the homepage against the production build (zero axe
violations, no horizontal scroll, page weight inside the budget, fee language clean).

## Revision 2026-11-09: patterns from the best hire pages

Owner's direction: "Look at Go Fractional for inspiration on role pages." Studied gofractional.com (homepage, /hire/fractional-cmo,
/explore/marketing, /how-it-works). What was borrowed, adapted to our voice and data (template-level in `RolePage.tsx`, so every
seat gets it):

- **Seat switcher** at the top of the hero ("Which leader do you need?": VP of Sales, CMO, RevOps, AI GTM, current page marked)
  and a **related-seats strip** before the closing band. The list lives in `content/shared.ts` (`roles`).
- **Trust line** under the hero buttons: no fees for companies, the platform's available-now share, the first-term and notice terms.
- **Proof band** under the hero: the seat's median rate and record count, rates in the index, engagements under contract, "$0 fees
  for companies", all from `data/rate-index.json` through figures.ts, with the as-of date and a link to the Rate Index.
- **People first**: the "Leaders ready for this seat" band now follows the hero on every page (the boards had it near the end). The
  sample profiles carry the canvas's illustrative portraits (`public/home/people/sample-*.webp`) and a "Request an intro" button.
- **Pricing-style engagement cards**: each card can carry a `price` ("Starting at" figure with its source) and a `badge` ("Most
  common"). Prices read the signed-seat ranges (VP of Sales, interim head of sales) or the survey's median month; cards with no
  figure state their terms instead. A **rate line** under the cards quotes the seat's median hourly rate and record count.

Not borrowed: the "our members have led marketing at" logo wall (we only show logos of companies that hired through us), the
"98% match success" style claims (no dataset column), and the industry sub-pages (no content yet).

## Revision 2026-11-09 (later): "Six things" as cards

Owner's gallery comment: "too much text and not bite-sized enough where someone will quickly glance at and appreciate what
it means and what they will do and what they'll get out of them." The six owned scopes now render as cards in a three-column
grid: gold number and title, the one-line meaning, a "They do" row (the board's body sentence), a leaf "You get by day 90"
row, and the two buyer questions folded behind a disclosure. Content modules are unchanged.
