# Brief: move the Buyer's Guide onto the live dataset

The owner decided that the guide quotes the most recent dataset, the same `data/rate-index.json` the Rate Index
page reads (rebuilt 2026-11-09 from the research Google Sheet). The guide was written against an October snapshot
(137 rates, $225 median). Your job is to rewire one or more chapter modules in `app/guide/content/` so that every
figure that comes from the dataset is read from `app/guide/content/figures.ts` instead of being typed in, and so
that the prose says what the live numbers say.

## Rules

1. **Read `app/guide/content/figures.ts` and `data/rate-index.json` first.** `figures.ts` exports formatted strings
   (`rates.median` is "$250", `rates.middleHalf` is "$180 - $305", `rates.n` is 113, `headline.contracts` is "39",
   `marketSpend.central` is "$1.9B", `engagements.medianMonthly` is "$6,000") and helpers (`category(name)`,
   `role(name)`, `ttr(band)`, `wish(key)`, `firstClientRevenue(band)`, `firstClientMonthly(band)`, `seat(name)`,
   `extendedByResult(band)`, `extendedByHours(band)`, `plansByAi(use)`, `term(label)`, `of(x, y)`, `pct(n)`,
   `rate(n)`, `monthly(n)`, `k(n)`). Add an export to `figures.ts` only if a figure you need is in the JSON but not
   exposed; never type a dataset figure as a literal.
2. In the chapter module, `import * as f from "./figures";` and turn each string that carries a dataset figure into a
   template literal: `` html: `The median is ${f.rates.median} an hour.` ``. Stats tiles, table rows, notes, deks,
   callouts, steps and the header `stats` all count. Tables that list categories or bands should be built from the
   arrays (`f.byCategory`, `f.engagements.byHours`, `f.survey.firstClientRevenue`, `f.survey.byRole`) with `.map`,
   so a rebuilt dataset changes the rows. Keep `(highest)` and `(lowest)` tags but compute them.
3. **Figures with no column in the dataset stay as written**: Lightcast, Built In and SPMB figures, the 77 inbound
   requests and every "of 20" / "of 53" / "of 56" inbound cut, the 67-operator waitlist, the 172 unique operators
   (`f.headline.operators`), the contract anecdotes (the $465 CRO, the $10,000 success bonus, the 15% overage cap,
   the hire-away fee), the 16 situations, the scorecard weights.
4. **Where a live number changes what a sentence claims, rewrite the sentence minimally so it is true**, keep the
   author's voice, and list it in your report. Known flips: Marketing is now the lowest-priced role ($220) and AI GTM
   sits at the market center ($250), so "AI GTM prices lowest" is false; Revenue Operations now equals Sales
   Leadership at $250 and Sales Enablement is the highest at $290 but on 8 records (under the index's publication
   floor of 10, so say "directional"); the senior tier is $400 to $1,000 on 16 rates; the median monthly engagement
   is $6,000, so the market estimate becomes about $135,000 a year per operator and $1.9 billion (range $1.5 to
   $2.4 billion); the contract book is 11 direct clients (15 documents) plus 28 partner-channel engagements, 39 in
   all, 43 documents; platform profiles are 51 usable, 10 also in the survey, 39 unique listings in the index;
   the index has two inputs (survey answers and platform listings), not five.
5. **Do not change** figures that already match the live data (most survey percentages do: 62%, 57%, 49%, 46%,
   97%, 36/61/3, 47/39/31/30/4, 59/38/27, 66%, 80/68/25/42, 35/50/15, 61/32/7, 18 of 31, 13 of 18, 4 of 11, 4 of
   74, 1 in 74) except to read them from `f` so they stay in sync. Note: the survey's "industry" wish is 30%, not
   31%; rate movement is 31 raised, 27 held, 3 cut of 61; 61 operators answered the buyer-mistake question;
   platform operators available now are 86%; 34 of 49 platform profiles set a three-month minimum, 15 of 49 one
   month; 8 of 20 ran quotas of $50M+ and 11 of 22 managed teams of 50+; 82% of platform profiles list SaaS or
   enterprise software; 34% of survey engagements are SaaS or enterprise software.
6. Dates: the dataset is as of `f.asOf.long` (November 9, 2026). Replace "October 11, 2026", "October 26, 2026" and
   "as of October 2026" with `${f.asOf.long}` where they describe the data. The survey window stays "September to
   November 2026".
7. Keep every paragraph, every block, the slug, number, title and ids. Dashes are " - ". No arrows, no em dashes.
   "this guide", never "this report". Do not touch other chapters or shared files. Run `npx tsc --noEmit` before
   you report.

## Report back

For each chapter: every figure you changed (old -> new), every sentence whose claim you rewrote (quote before and
after), and anything in the chapter that you believe comes from the dataset but could not find in the JSON.
