# Known gaps against Revenue Nomad today

Found by pulling every public operator record from revenuenomad.com/operators on Sep 24, 2026 (264 unique records returned out of 286 listed) and running the flows on the design canvas. Each gap says how the prototype must handle it and what the live platform needs.

## Data and setup

| ID | Gap | Evidence | In the prototype | For the live platform |
|---|---|---|---|---|
| G1 | Operator listing skips and repeats people across pages | Six pages of 50 sorted by reputation returned 264 unique of 286. Page 1 and 2 shared 11 records. Most reputation scores tie at 50 | Sort every list by score, then id, so order is stable. Test paging in QA A-09 | Add a tie-breaker to the operators query sort. Buyers browsing today can miss 22 operators |
| G2 | The listing ignores limit above 50 | The site's own category links ask for limit 100 and get 50 | Page size 50 max | Honor the limit or stop generating links with 100 |
| G3 | 88% of operators have no hourly rate | 31 of 264 have a rate. In the 100 seeded, 19 | Budget part scores 8 of 15 and shows "No rate listed". Never filter out a missing rate. Buyer budget panel shows how many have no rate | Ask for a rate range in the pulse email and on profile edit. Add it to the invite response form so it gets captured per project |
| G4 | Availability is a default, not an answer | 258 of 264 show available now. Only 28 have an available-from date | Seed `lastConfirmedAt` as null and show "Not confirmed" beside availability everywhere. Fit uses hours only | Ship the availability pulse first, as the phase one spec already says |
| G5 | Hours per month look mis-entered | 7 profiles say 160 hours a month, which is full time, and some say 5 or 19 | Show hours as entered, flag 120 plus as "Check hours" on admin views | Validate hours on entry and ask weekly or monthly explicitly |
| G6 | Photos missing or on a dead host | 82 of 264 have no photo. 5 point to api.acrform.ai, which fails. 5 of the 100 seeded fall back to initials | Initials avatar fallback everywhere a photo shows | Migrate the acrform photos to current storage and add a photo prompt to the pulse |
| G7 | Profiles are thin, so fit scores run low | 76 of the 100 seeded have exactly 6 skill tags, 847 of 875 tags are self claimed, 10 of 264 have engagements, 3 have reviews. Only 12 of 100 score 70 plus on the sample VP of Sales brief | Show a "Profile completeness" chip next to every score so a low score on a thin profile reads differently from a poor fit | Weight verified tags more, add a completeness nudge to the operator portal, run a profile completion campaign before buyers rely on scores |
| G8 | Time zone missing for most | 227 of 264 null | Show "Not provided". Do not use time zone in matching | Capture on onboarding |
| G9 | Name casing | "christian grandy", "Dylan bovet-morinon" | Display with title case, store raw | Normalize on save |
| G10 | Category label mismatch | Site uses "Customer Success Growth", the profile prototype uses "Customer Success & Growth" | Map both to one enum | Pick one label |
| G11 | Post-migration filter defect | Phase one spec prerequisite, filters drop migrated profiles | Prototype matching runs on the seed, so it cannot reproduce this. QA A-10 checks every seeded operator is findable by their own role and a tag | Fix before any filtered send ships |
| G12 | Most operators have never logged in | Phase one spec, about 290 migrated operators were never told their profile exists | Every outbox link is a magic link that signs the operator in. No password step anywhere in the operator flow | Invite and alert emails must carry signed one-tap links, same mechanism as the pulse |

## Product and rules

| ID | Gap | In the prototype | For the live platform |
|---|---|---|---|
| G13 | Buyers have no role or permissions in the phase one spec | Add buyer role, can read and write only their own projects and responses to them | Spec and permission change |
| G14 | Intro requests today show Pending and Approved on the buyer page, which implies admin approval | Auto-approve intro requests from a project, log them for admin, keep the existing Intro Requests page listing them | Decide if self-serve intros still need approval. If yes, the buyer flow needs a pending state |
| G15 | Alert volume | Only alert operators whose alert preferences match the project category and who are not unavailable. Cap at one alert per operator per day, extra alerts roll into a digest entry in the outbox | Alert preferences and a daily digest |
| G16 | Rejection timing | Not a fit is silent until staffed or closed | Same |
| G17 | Budget privacy | Operators never see budget, only their own rate | Same |
| G18 | "No charge until you select" has no billing behind it | Keep the line, add a selection confirmation screen that states the fee as a placeholder | Billing and agreement flow |
| G19 | Deep links into claude.ai artifacts only pass a plain #token | Use path routes inside the prototype. Profile links from the canvas use #slug | None |
| G20 | Buyer projects that get zero responses | After 72 simulated hours with no responses, flag on admin A1 and show the buyer a nudge to widen visibility or turn on suggestions | Same |

## Gaps in the design canvas itself

| ID | Gap | Fix in the build |
|---|---|---|
| C1 | Each canvas screen keeps its own state, so an invite on B3 does not appear on B4, O2 or A2 | One shared store |
| C2 | Responses on B4 are simulated for the 8 real operators | Responses come only from operator actions or a "simulate response" admin tool that is clearly labeled |
| C3 | Several numbers are hard coded, for example Alerted 212, Viewed 41, KPIs on A1, profile strength 80% | Compute every number from the store and events |
| C4 | Screening answers are shown as scored in some copy | Answers are not scored in this build. Copy says so |
| C5 | Selecting an operator has no screen | Add B6 confirmation and staffed state |
| C6 | Questions from operators have no buyer inbox | Add a questions tab on the buyer project page |
| C7 | Pause, Close to new responses, Nudge buyer, Send shortlist to client are buttons with no effect | Wire all of them |
| C8 | Operator decline reason is collected but not shown anywhere | Show decline reasons on admin A2 and in reports |
| C9 | Revenue Nomad project fit scores used a buyer budget range ($150 to $185) instead of the fixed $160 operator rate, so operators under $160 lost budget points they should not have | Fixed in seed/fit-score.js and the canvas. For Revenue Nomad projects anyone at or under the operator rate is inside budget |
