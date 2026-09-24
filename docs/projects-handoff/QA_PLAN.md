# QA plan

Write one Playwright test per scenario. Start every test from "Reset demo data". Use the role switcher and the Outbox to move between users. Record results in QA_REPORT.md with the scenario ID.

Seed facts the tests can rely on
- 100 operators in `seed/operators.json`. Tim Evans and Matt Lopez score 90 on the Northwind VP of Sales brief. 12 operators score 70 or more on it. 19 have a rate. 5 have no photo.
- Buyer Northwind Health (Jordan Ellis) has one draft project, Fractional VP of Sales, from `seed/projects.json`, not yet posted.
- Admin has one Revenue Nomad project draft, Harbor Logistics, Fractional VP of Revenue Operations, bill rate 200, operator rate 160.

## Buyer

| ID | Scenario | Expected |
|---|---|---|
| B-01 | Open the Northwind draft, check the live match panel | Shows 12 of 100 at 70 plus, 8 with a rate inside $175 to $250, 81 with no rate |
| B-02 | Change hours to 40 to 50 | Live match numbers drop, hours part of every score recalculates |
| B-03 | Try to post with no title, or budget min above max, or 6 screening questions | Blocked with a clear message on the field |
| B-04 | On invites, search "hubspot", then "zzz" | Results filter across all 100. "zzz" shows an empty state, not a blank list |
| B-05 | Invite Tim Evans, Matt Lopez and Anne Zavorskas, choose invite only, post | Status live. Outbox has 3 invite emails and no alerts. Each invited operator has the project in their portal |
| B-06 | Same as B-05 but choose invites plus open | Outbox also has alerts for non-invited operators whose alert preferences match Sales Leadership, one per operator. Invited operators get no alert |
| B-07 | Turn on Revenue Nomad suggestions and post | Project appears on admin A1 with a "Wants 3 RN suggestions" flag |
| B-08 | After responses exist, sort by rate | Operators with no rate sort last, not first |
| B-09 | Pass on all weak fits | Only responders under 70 move to Not a fit. No email goes out yet |
| B-10 | Undo a not a fit | Row returns to To review |
| B-11 | Request intro on Tim | Tim's status becomes Intro requested, company name revealed to Tim only, outbox has the intro email, Intro Requests page lists it |
| B-12 | Select Tim | Project staffed, Tim gets the selected email, every other responder gets one close email, non-responders get nothing, new responses blocked |
| B-13 | Try to undo after staffing | Not allowed, message explains why |
| B-14 | Pause, then check as an alerted operator | Project gone from Open roles, respond button disabled for anyone who has not responded |
| B-15 | Answer an operator question | Answer shows on the operator project page and in the outbox |
| B-16 | View a profile from a response, including one of the 5 with no photo | Profile opens, initials avatar shows, no broken image |

## Operator

| ID | Scenario | Expected |
|---|---|---|
| O-01 | Open Tim's invite from the outbox | Signed in as Tim with no password, lands on the project page |
| O-02 | Open Guillermo Mairena's alert (not invited) | Project shows, not in his portal until he responds |
| O-03 | Save a draft response and leave | Draft kept, buyer does not see it, project stays in Invited |
| O-04 | Submit with rate, hours, start and both answers | Buyer B4 shows the response with the right score. Operator status Responded |
| O-05 | Submit with hours above their profile hours | Accepted, hours part of the score uses the response hours, warning shown |
| O-06 | Ask a question | Buyer sees it, outbox logs it |
| O-07 | Not for me without a reason | Blocked until a reason is picked. With a reason, project moves to Closed, buyer never sees a response row |
| O-08 | Buyer opens the response | Operator status changes to Buyer viewed |
| O-09 | Intro requested | Company name and contact visible, Book a time and Reply work |
| O-10 | Selected and not selected emails | Match rule 5, one each, correct wording |
| O-11 | Operator with no rate responds | Rate field required on the response, profile rate stays empty |
| O-12 | Confirm availability from a pulse link | Availability shows confirmed with today's date and the "Not confirmed" label goes away |
| O-13 | Respond to a paused or staffed project from an old link | Blocked with a clear message |
| O-14 | Two tabs, respond in one, reload the other | No duplicate response row |

## Admin

| ID | Scenario | Expected |
|---|---|---|
| A-01 | Open A1 after B-06 | KPIs and funnel numbers equal counts in the store, no hard-coded values |
| A-02 | Add three suggestions to the Northwind project | Invites with source rn_suggested, labeled Suggested by Revenue Nomad on B4, 4th suggestion blocked |
| A-03 | Try to change a buyer decision | Not possible, admin view is read only |
| A-04 | Nudge buyer | Outbox entry to Jordan, event logged |
| A-05 | Advance clock 3 days on a project with no responses | Needs attention flag "No responses in 72 hrs" |
| A-06 | Create the Harbor Logistics project | Spread 40, margin 20%, monthly figure matches hours, operators see $160 only |
| A-07 | Move a Harbor operator through the pipeline to selected | Rule 5 applies, project staffed |
| A-08 | Send shortlist to client | Only shortlisted operators appear, no operator rate or admin notes |
| A-09 | Page through all operators at 10 per page | 100 unique operators, no repeats, stable order after reload |
| A-10 | Search each seeded operator by their own role and first tag | Every one is found |
| A-11 | Reports | Response rate, time to first response, intro rate and decline reasons match events |
| A-12 | Operators with 120 plus hours | Show "Check hours" flag |

## Cross role

| ID | Scenario | Expected |
|---|---|---|
| X-01 | Full happy path from post to staffed, switching roles each step | Every screen agrees at each step |
| X-02 | Invite the same operator twice | One invite row, sentAt updates, one portal entry |
| X-03 | Operator is invited after already responding from an alert | No second invite email, response kept, source shows invited |
| X-04 | Reset demo data | Everything returns to seed, outbox empty |
| X-05 | 400px wide on B4, O3 and A1 | No horizontal scroll, all actions reachable |
| X-06 | Dark theme | All text readable, fit tiers still distinguishable |
| X-07 | Keyboard only through post, respond and select | Every control reachable with visible focus |
