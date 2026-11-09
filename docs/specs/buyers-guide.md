# Spec: The Fractional GTM Buyer's Guide 2027 (/fractional-gtm-buyers-guide-2027)

Status: BUILT 2026-11-09 from the Design canvas "Report Redesign" (https://claude.ai/artifact/VZmwAqpCXHHQ1FnnHJEJRm):
artboards "Cover, findings & contents", "Foreword", "The answers CEOs ask for first", Chapters 01 to 10, "Methodology"
and "Gated download modal". The rebrand follows the title recommended in session
https://claude.ai/code/session_012MpoHWHC86TFqXttDSBxq2: "The State of Fractional GTM 2027" becomes
**The Fractional GTM Buyer's Guide 2027**.

## What it is

The research report, published as a web guide: a landing page (cover, six findings, contents) and fourteen chapter
pages. "Start here" (the foreword), "The answers CEOs ask for first" and Chapter 1 are open to everyone. Chapters 2
to 10 and the Methodology sit behind one gate: name, work email, optional company. Passing the gate sets a one-year
cookie (`rn_guide`, httpOnly, a flag only) that opens every chapter on that device and returns the reader to the
chapter they asked for. There is no PDF; the gate promises the full guide online, not a download.

## Where it lives

- Routes: `app/fractional-gtm-buyers-guide-2027/page.tsx` (landing) and `[chapter]/page.tsx` (static params for
  the fourteen slugs, `dynamicParams = false`). Locked chapters carry `robots: noindex, follow`; open ones index.
- Content: one module per chapter in `app/guide/content/<slug>.ts`, typed by `app/guide/content/types.ts` (blocks:
  h2, h3, p, lede, stats, list, steps, table, quote, callout, note, qa). Order, titles, deks and the open flag in
  `app/guide/content/guide.ts`; `loadChapter(slug)` in `index.ts` imports a chapter on demand.
- Rendering: `app/guide/GuideBlocks.tsx` (every block type, `StatRow`, heading ids for the jump nav),
  `GuideNav.tsx` (contents with lock marks), `Gate.tsx`, `GuideCover.tsx` (the rendered cover used on the homepage),
  styles in `app/guide/guide.css` and `GuideCover.css` (prefixes `gd-`, `gcov-`).
- Gate: `app/guide/actions.ts` (`unlockGuide`) validates and redirects; `app/guide/unlock.ts` (`openGuide`) records the
  lead through `app/leads/record.ts` (HubSpot form `HUBSPOT_GUIDE_FORM_ID`, else `<RN_DATA_DIR>/guide-requests.json`)
  and sets the cookie. The homepage Featured research form (`app/home/actions.ts`) uses the same helper with email only
  and lands on the guide.
- Rename: `links.ts` route and labels, footer cite line, Rate Index page, solution-page sources, `numbers.ts` sources.
  `next.config.ts` redirects `/research/state-of-fractional-gtm-2027(/*)` to the new path permanently.

## Conversion rules (docs/tickets/homepage-d/GUIDE-AGENT-BRIEF.md)

Every paragraph of the artboards is carried; bar charts become tables, badges become bracketed words in cells,
decision trees and situation cards become steps. "This report" reads "this guide". Dashes are " - ". Two edits for the house rules: the foreword's "Real fees" reads "Real rates" (the price is the
operator's rate), and arrow glyphs in ranges and decision branches read "to" or a colon. A readable coral
(`--rn-coral-text`) was added to the tokens for coral figures; the headline full stop keeps the bright coral. Site tokens,
not the redesign's paper palette (decision A3: the canvas palette is the design system).

## Figures and the open question

The guide text is the October 2026 edition: $225 median, 137 rates, 74 survey, 51 platform profiles, 38 contracts,
77 inbound requests, 172 operators. The live Rate Index (`data/rate-index.json`, rebuilt 2026-11-09 from the same
sheet) computes 113 rates and a $250 median. The owner decides whether the guide quotes the live index (then every
chapter figure is recomputed) or keeps the edition snapshot with its date, which is what ships now. The agents'
conversion reports also flagged: Answers item 07 says "$230 vs $245+" against the $225 center; Chapter 2 says
eleven direct clients and lists ten; Chapter 3 says hours "130 to 173" in prose and "130 - 175" in figures;
Chapter 4 rounds year one to $500,000 to $575,000 against the table's $507,500 to $577,500; Figure 6.1's n sums
to 118 rates while the extension rates come from the survey; the Methodology dates the evidence to November 2026
while the edition says October. All are carried as written, for the final edit.

## Checks

`check:tokens` covers `app/guide` and the route folder. `check:home` runs the landing, "start-here" (open) and
"03-what-it-costs" (locked, shows the gate) by default. The gate was exercised end to end with Playwright
(`scratchpad/research/gate-test.cjs`): invalid input returns to the gate with the error, valid input sets the cookie,
redirects back and stores the lead; the homepage form unlocks with email only; the old URL returns 308.

## Launch work

- Create the HubSpot form "Fractional GTM Buyer's Guide 2027" (email, firstname, lastname, company) and set
  `HUBSPOT_GUIDE_FORM_ID`.
- Decide the figure question above; the deck's "trademark the title" note from the naming session still stands.
- Optional: a PDF export once the edition is final, then the gate copy can promise the download.
