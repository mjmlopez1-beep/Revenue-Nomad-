# Homepage D claims: doubt review and dispositions

A fresh-context adversarial reviewer (no conversation history, web access) examined every figure in
`app/home/content/numbers.ts` and the page's prose claims against this contract: third-party statistics match
their publications; first-party figures are flagged unless definitional; no two figures contradict; labels do not
overclaim; no fee language except "companies pay none". Dispositions below were applied on 2026-11-09.

| # | Claim | Finding | Disposition |
|---|-------|---------|-------------|
| 1 | 6sense "~70%" | Source prints 69% ("nearly 70%" in the press release); sample 2,509 correct | Value changed to 69%, label matched to the source wording, `verified: true` |
| 2 | 6sense 81% preferred vendor | Matches the release; sibling lacked the sample size; the 2024 report is superseded by a 2025 edition (94% rank a preferred vendor before contact) | Sample added, `verified: true`. Founder to decide whether to move to the 2025 figures |
| 3 | Gartner 67% rep-free, "March 2026" | Fieldwork Aug to Sep 2025; March 9, 2026 is the publication date | Source rewritten with both dates, `verified: true` |
| 4 | Gartner "6-10 decision makers" | No live primary page; figure is from Gartner's 2019 buying-journey work; Gartner's May 2025 release says 5 to 16 people | Source now cites the 2019 work; stays `verified: false`. Founder to choose 2019 wording or the 2025 range |
| 5 | VP of Sales $4k to $10k for "1 to 2 days a week" vs "20 to 40 hours a month" | Incompatible time bases; only 20 to 40 hours fits the $225 median | Both entries now say 20 to 40 hours a month |
| 6 | "Typical engagement: 1 to 3 days a week" marked verified | Empirical claim, not a terms statement | `verified: false` |
| 7 | Fees "None" source carried a review-provenance claim | Unrelated to fees | Moved to the would-hire-again entry |
| 8 | "$225/hour" and "137 rates as companies pay them" | Repo holds only crawled listing ranges (asked, not paid) | Kept the founder's wording, stays `verified: false`; founder to confirm the Rate Index basis (paid invoices vs listed) |
| 9 | "82% results inside 60 days, n=65" | Label hid that it is operator self-report; n=65 is 38% of the 172 surveyed | Source now says "Operators reporting a first measurable result" |
| 10 | "100% would hire again" with no denominator | Reads as survivorship over an unknown count | Stays `verified: false`; source asks for the review count. Do not ship without "n of n" |
| 11 | "24 hrs" label bundled the fee clause; response source was a second promise | Mixed claims | Label now "to a first conversation"; source "Service commitment" |
| 12 | Report titled 2027, page dated 2026 | Reads as a projection | Source now "(published 2026)"; founder to confirm the title convention |
| 13 | "+51% over 18 months vs the 17 months before"; "+54.8% June, single month" | Asymmetric and single-month comparisons | Unchanged (artboard copy), stay `verified: false`; recorded here for the case-study pages |
| 14 | "21 building blocks" vs "seven pillars" | Undefined relation | Definitional; the assessment page must define 21 blocks across 7 pillars |
| 15 | "$1M and $200M", first term and notice, "No fees for companies" | Positioning and terms | No change |
| 16 | Fee-word allowlist would pass "Fees for companies: 15%" | Check weakness | Regex tightened to reject a number after the phrase |
| 17 | "350+ operators" vs "172 operators" | Network vs survey sample | Label now "operators surveyed" |

Confirmed against primary sources and now `verified: true`: 6sense 69% and 81% (2,509 buyers), Gartner 67% (646 buyers).
Every first-party figure remains flagged until the founder confirms it.

Sources checked by the reviewer: https://6sense.com/science-of-b2b/2024-buyer-experience-report/ ;
https://www.businesswire.com/news/home/20241009142556/en/ ;
https://www.gartner.com/en/newsroom/press-releases/2026-03-09-gartner-sales-survey-finds-67-percent-of-b2b-buyers-prefer-a-rep-free-experience ;
https://www.gartner.com/en/newsroom/press-releases/2025-05-07-gartner-sales-survey-finds-74-percent-of-b2b-buyer-teams-demonstrate-unhealthy-conflict-during-the-decision-process
