# Spec: the Rate Index (/research/rate-index)

Status: BUILT 2026-11-09 from the artboards "Desktop - Rate Index" and "Phone - Rate Index", on the research data source.

## Continuity rule

Every figure on the page, and every rate figure on the homepage footer and FAQ, is computed from the same system
of record that The State of Fractional GTM 2027 is built on: the Google Sheet **2027 State of Fractional Report**
(`1Orv3aj0XwlcrurIz242PAraeTitJOqGmbpFqvRSd19k`), tabs "The State of Fractional GTM 2027 Survey", "Platform
Signups 2026" and "Engagements". Nothing on the page is typed in by hand.

Pipeline:

1. Export the three tabs with the Google Sheets connector as JSON (`{range, values}`), ranges `A2:BP`, `A2:AL`,
   `A2:Y`. The exports hold names, emails and operator pay: keep them out of the repository.
2. `node scripts/build-rate-index.mjs <survey.json> <platform.json> <engagements.json> <as-of>` writes
   `data/rate-index.json`: aggregates only (medians, quartiles, counts, ranges by seat), with provenance.
3. `app/research/rate-index/page.tsx` renders from that file. `app/home/content/numbers.ts` derives the footer's
   median rate, the rate count, the VP of Sales range and the FAQ price range from the same file, so the homepage
   and the index cannot disagree.

Refresh: re-export, rerun the script with the new as-of date, commit `data/rate-index.json`.

## What the page shows (artboard order)

1. Hero with three figures: median hourly rate with its middle half and n; median month at a $5M to $20M company;
   share of operators who raised their rate.
2. **How much does a fractional leader cost per month?** A table of what companies paid, by seat, from Revenue
   Nomad direct contracts only: hourly range, contracted hours, monthly range, number of contracts. The Skaled
   subcontracting book records operator pay, which is confidential and not a price a company paid, so it is excluded.
3. **Hourly rate by role category.** Middle half and median per category on a shared $80 to $400 scale; categories
   under the publication floor of 10 are shown with their n and no tag (owner, 2026-11-09: readers draw their own conclusions).
4. **What a month costs, by role.** Median monthly spend and hours per category from engagements described in the
   survey (first and second client), categories with five or more engagements.
5. **How the number changes with company size.** Median monthly spend and share of engagements by client revenue
   band, with two reads computed from the data.
6. **How hours change the rate.** Median rate, middle half and typical month by hours band, plus the contract
   median and the extension and time-to-result shares.
7. **How rates are moving.** Median year-over-year change, raised/held/cut, plans, demand.
8. **Common questions.** Four answers filled from the same data.
9. Closing band and footer (shared components).

## Differences from the artboard, and why

- The artboard quoted 137 rates and a $225 median from "five sources" including public published rates and rate
  conversations. Those two sources are not in the data source, so the index is the 113 rates it holds (74 survey
  answers, 39 platform listings), median $250. The Operator Insights Summary tab in the sheet reports the same
  $250 median. Add the other sources to the sheet and the page follows.
- The artboard had hourly medians per hours band that softened toward 60+ hours; the data shows the same shape.
- "Sales Director or VP of Sales" and the other seats are classified from contract titles and role categories by
  the build script (`seatOf`), not hand-typed.

## Publication floors

Hourly rates by category: 10. Monthly spend by category: 5 engagements. Hourly rates by company size: not
published (cuts fall under the floor). These match the sheet's README rule ("answers reported only in groups of
10 or more") and the summary tab's caveat about cuts under 20 (the site prints the n instead of a label).
