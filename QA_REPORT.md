# Revenue Nomad Projects — QA report

Branch `claude/revenue-nomad-prototype-xv61e4`. Scenarios from `docs/projects-handoff/QA_PLAN.md`, one Playwright test each in `tests/projects/`, run headless against the production build (`npm run test:e2e`, Chromium).

**Result: 82 of 82 pass.** That covers:

- the 49 QA scenarios;
- 5 admin console tests (A-13 to A-17);
- 9 usability tests (U-01 to U-09, see `USABILITY_AUDIT.md`);
- 8 operator dashboard tests (L-01 to L-08);
- 5 jobs, prospects and overview tests (W-01 to W-05);
- 4 tests for the review comments (C-01 to C-04) and 2 more admin tests (A-18, A-19).

The full suite runs in about 1.5 minutes on 4 workers.

## Scenarios

| ID | Result | Test |
|---|---|---|
| B-01 | Pass | Live match shows 12 of 100 at 70+, 8 rated inside $175–$250, 81 with no rate |
| B-02 | Pass | Hours 40–50 lowers the 70+ count and the hours-open count; every top match's hours part is checked against the formula |
| B-03 | Pass | Missing title, budget min above max, and 6 screening questions each block with a message on the field; the project stays a draft |
| B-04 | Pass | "hubspot" filters across all 100; "zzz" shows an empty state |
| B-05 | Pass | Invite only: live, 3 invite emails, 0 alerts, project in all three portals |
| B-06 | Pass | Invites plus open: exactly one alert per non-invited Sales Leadership operator (62); invited operators get none |
| B-07 | Pass | Admin A1 row flags "Wants 3 RN suggestions" |
| B-08 | Pass | Sort by rate: $200, $300, then both "No rate listed" |
| B-09 | Pass | Only the two under-70 responders move to Not a fit; outbox unchanged |
| B-10 | Pass | Undo returns the row to To review |
| B-11 | Pass | Tim shows Intro requested and sees Northwind Health; Matt, who also responded, does not; intro email sent; Intro requests page lists it |
| B-12 | Pass | Staffed; one selected email to Tim, one close email each to Matt and Guillermo, nothing to the invited non-responder; Anne's respond form is blocked |
| B-13 | Pass | Undo after staffing shows "This project is staffed. Decisions are final…" and the decision stays |
| B-14 | Pass | Paused project leaves Open roles; alerted operator sees a blocked, disabled form |
| B-15 | Pass | Buyer answer shows on the operator's project page and in the outbox |
| B-16 | Pass | Profile opens from a response; Ron Ariana (no photo) shows initials; no broken images |
| O-01 | Pass | Invite link signs in as Tim with no password and lands on the project page |
| O-02 | Pass | Guillermo's alert opens the project with "Not in your projects until you respond"; it enters his portal only after responding |
| O-03 | Pass | Draft kept with its values, shows "Draft saved" under Invited, buyer sees 0 responses |
| O-04 | Pass | B4 shows Tim at 90 with $200/hr, 25 hrs, Oct 1, and both answers |
| O-05 | Pass | Tanya Helin (15 hrs on profile) offers 25: warning shown, accepted, hours part 20/20 |
| O-06 | Pass | Question reaches the buyer's Questions tab and the outbox |
| O-07 | Pass | Pass is blocked until a reason is picked; then the project moves to Closed and the buyer has no row |
| O-08 | Pass | Buyer opening the response changes the operator status to Buyer viewed |
| O-09 | Pass | Company and contact revealed; Book a time and Reply each send an outbox message to Jordan |
| O-10 | Pass | One selected email and one close email, with the rule 5 wording |
| O-11 | Pass | No-rate operator must enter a rate; the response keeps 190; the profile still shows "No rate listed" |
| O-12 | Pass | Pulse link confirms availability: "Confirmed Sep 24" and "Not confirmed" is gone |
| O-13 | Pass | Old invite link is blocked when paused, then again when staffed, each with its own message |
| O-14 | Pass | Two tabs: one response row, the second tab shows the submitted status after reload |
| A-01 | Pass | KPIs and the A2 funnel equal store counts (3 invites, 62 alerts) |
| A-02 | Pass | Three suggestions become `rn_suggested` invites, the fourth is refused, B4 labels the row "Suggested by Revenue Nomad" |
| A-03 | Pass | A2 has no intro, not-a-fit, select, undo or bulk-pass controls |
| A-04 | Pass | Nudge goes to Jordan in the outbox and logs a `nudge_sent` event |
| A-05 | Pass | Flag appears after the third simulated day, not after two; the buyer sees the widen-visibility nudge |
| A-06 | Pass | Spread $40/hr, margin 20%, $1,800 a month at 45 hrs; the operator page and email show $160/hr, never $200 or the client name |
| A-07 | Pass | Moving Jose to Selected asks for confirmation, then staffs Harbor; selected and close emails follow rule 5; Matt is marked not_selected |
| A-08 | Pass | Both responders are candidates on Send shortlist; only Jose is ticked. The email and client page list only him, with the admin's one-line "why" and cover note, no operator rate and no admin note. The client's "Request intro call" lands on the admin's Today queue |
| A-09 | Pass | 10 pages of 10 give 100 unique operators; page 3 is identical after a reload |
| A-10 | Pass | All 100 operators are found by "role + first tag" |
| A-11 | Pass | Reached 64, responded 2, response rate, time to first response, intro count and rate, decline reasons and alerts by role all match the event log |
| A-12 | Pass | All six 160-hour operators show "Check hours" (directory and A2); Matt Lopez (40) does not |
| X-01 | Pass | Post → respond → intro → select, checked on buyer, operator and admin screens at each step |
| X-02 | Pass | Re-invite keeps one invite row with a later sentAt, and one portal entry |
| X-03 | Pass | Inviting someone who already responded from an alert sends no invite email; the response is kept and its source shows Invited |
| X-04 | Pass | Reset restores seed state: outbox empty, clock back to Sep 24, both projects drafts |
| X-05 | Pass | At 400px, B4, O3 and the admin Projects list have no horizontal scroll and every action button is on screen |
| X-06 | Pass | Dark theme: sampled text is at least 4.5:1 against its background; the three tier colors differ |
| X-07 | Pass | Post, respond and select done by keyboard only, with a visible focus ring checked on every Tab stop |
| A-13 | Pass | Admin lands on Today; a submitted response appears in Needs you, Review opens the operator drawer, Snooze hides it for the session |
| A-14 | Pass | Wizard end to end: new client project, assistant match, one pick, platform audience and two valid off-platform emails (one invalid ignored). The store has the invite, the alerts and two sign-up emails |
| A-15 | Pass | Invited cards offer Nudge, not Move; the nudge re-sends the invite and logs `operator_nudged`; dragging a responder onto Shortlisted moves them |

## Operator dashboard (canvas L1 to L4)

Operators work in `/dashboard`, built in the live revenuenomad.com layout: Red Hat Display, pill navigation, 28px cards and fit rings. The Operator Portal keeps only a Projects button with a badge that links there. Every operator email link and every old `/operator/...` or `/portal?view=projects` URL lands in the dashboard. L-01 to L-08 cover:

- the overview and badge;
- tabs, search and take-home pay;
- case-study attachments;
- editing a response until the client opens it;
- stage panels;
- pass with a reason;
- one-tap availability and legacy links;
- counts on Client viewed.

Operators see a take-home rate: the buyer's budget less the standard 25%, or the operator rate on Revenue Nomad projects. The "why you scored" text never mentions the buyer's budget (L-03 checks this).

## Admin console (canvas A1 to A5)

Admins get their own shell: a white sidebar with Work (Today, Projects, Intro requests), Network (Operators, Clients, Reviews, Engagements), Setup (Catalog) and Insights (Availability pulse, Analytics, Audit log), plus global search.

- **Today (A1)** is the admin home. **Needs you** shows only deal work, oldest first: answered screening questions, shortlists ready to send, operator questions, client call requests, buyers who asked for suggestions, quiet projects and unbooked intros. Profile hygiene stays in a separate card.
- **Projects (A2)** has Open, Drafts, Placed and Closed tabs, six KPIs, a mini pipeline on each row, bill and pay with margin, next step, flags, CSV export and a Recently placed table. Staffed projects move to Placed (X-01 was updated for this).
- **New project (A3)** has four steps: Brief with live economics, Find candidates, Audience, and Review and launch. Candidates come from an assistant match on free text or from search and filters. The audience can be direct invites, an on-platform segment, off-platform emails (each gets a sign-up link), or any mix.
- **Pipeline (A4)** has six stages. Cards can be dragged or moved with buttons, and each shows its fit, how far the listed rate is above the pay rate, and the last activity. Invited cards offer Nudge. Moving someone to Selected asks for confirmation. A drawer shows screening answers, the admin note and Message.
- **Send shortlist (A5)** lists everyone who responded or was shortlisted. The admin ticks who goes, adds a one-line "why" per operator and a cover note, and chooses whether to show the bill rate. A live preview shows what the client sees. The client page has Request intro call and Ask a question buttons, and both feed the admin's Today queue.

Decisions and gaps:

- The canvas's marketplace growth chart is replaced with real totals, because there is no history to chart.
- Catalog is shown disabled.
- Snooze lasts for the browser session.
- The client page no longer shows the bill rate when the admin turns it off.

## Review comments on the published prototype

- **One rate rule.** Operators always enter and see what they are paid. Buyers always see the all-in rate: pay plus Revenue Nomad's standard 25%, rounded to $5 (Tim's $130 shows as $175 all-in). Budget matching compares pay with the budget less the fee, so both sides agree. This moved some seeded numbers, and the tests were updated to match: B-01 now shows 10 profiles at 70+ and 1 listed rate inside the budget, and Tim's $200 profile rate is $265 all-in, over a $250 budget.
- **Operator Insights** (`/dashboard/insights`): profile views, search appearances and compares week over week, with 7, 30, 60 and 90 day ranges and the top five searches behind profile views. Searches, profile opens and compares are recorded as events without moving the clock. Weeks before Sep 24 use deterministic sample history, and the page says so.
- **Buyer company profile** (`/buyer/company`): industry, size, revenue, stage, ACV, sales cycle, GTM motion, segment and CRM on the standard picklists. It drives a company fit chip on responses, the invite list, compare, the directory, profiles and the Live match. Missing operator data never counts against them.
- **Seat form**: a Function picklist for the eight role categories drives matching and alerts, with standard title chips. Templates use the platform's standard titles, including Chief Marketing Officer and GTM AI Architect, and are colored by function. The paste-a-job-description box is removed. Live match waits for a role instead of scoring a guess.
- **Buyer signals**: profile completeness is gone from buyer screens. Hours, rate and location flags replace it. The invite list gets role category, availability, industry, GTM motion, rate, hours and reputation filters.
- **Admin**: Mark hired records a hire a buyer made but didn't mark (logged as an admin action). Each operator has a detail page with visibility, searches, a projects funnel, dashboard usage and an activity log. Analytics adds Search and discovery (platform search terms, most viewed operators, where searches and views happen) and Usage and adoption (active users, feature usage).
- **Also**: initials avatars are colored by function when there is no photo, the rate wording on the response form is plain, and the "Their response" card is cleaner.

## Simplification pass (platform audit)

The platform audit (published as "Revenue Nomad Platform Audit") ranked the changes that cut the most clicks and add the most value. This pass built them.

- **Operators have one home.** Job Board and Prospects moved from the Operator Portal into the dashboard as Jobs and Prospects; `/portal` redirects there. Every mark (save, applied, dismiss, sent, replied, meeting) belongs to the operator who made it. The old portal stored them once for everyone.
- **Jobs** are scored with the same fit model as projects, against the operator's own profile, and shown as compact rows. "I applied" sets a follow-up five days out that surfaces on the overview. The operator-facing Run crawl button is gone; the scheduled crawl keeps the board fresh.
- **Prospects** show one line on why now, who to reach (the role, with a LinkedIn search, never an invented name) and a draft email. "Copy and mark sent" moves the company into In conversation with a follow-up. Replies are tracked, and signals that got replies rank first. The engine internals (formula, decay lines, signals that didn't fire) are removed.
- **Overview** leads with Next up (invites, intros to book, due follow-ups, stale availability). "Raise your fit" re-scores today's open roles and jobs with one profile change at a time and shows how many roles each change moves. "Your rank" and "How it works" are removed.
- **The response form warns** when the operator's rate is above the client's take-home range, and "Use $190" fixes it in one tap.
- **Buyers** get compact response rows with trust signals, "Answers and score" for detail, a side-by-side Compare for two or three picks, and a bench of operators they liked on earlier projects, invitable in one click.
- **Admin Today** shows this week against last week in place of the static totals. Profile nudges now ask first, send a real profile email and skip anyone nudged in the last 30 days.
- **Analytics** adds a funnel, where responses, intros and hires come from, median first response, median time to fill, and placed spread. **Operators** is a filterable table. **Intro requests** lists unbooked intros first. Empty end stages on the pipeline stay narrow.
- **Home page** has a door for companies and one for operators, with live counts.

## Changes after the usability audit

`USABILITY_AUDIT.md` cut the buyer's core job from about 20 clicks and 290 keystrokes to 6 clicks and none. Changes that touch QA scenarios:

- **B-10, B-13:** "Not a fit" is now a one-click **Pass** with Undo. The reason is optional and set afterwards in the Not a fit view.
- **B-08:** sort is a single dropdown.
- **O-09:** intros now offer the buyer's three times, and each is a one-tap booking link in the email. The booked call shows on the buyer's response row and Intro requests page.
- New projects default to Revenue Nomad suggestions on.

## Bugs found and fixed

1. **Site CSS leaked into the prototype.** The site's existing `globals.css` styles `.btn`, `.field`, `.pill`, `.stat`, `.notice`, `.tabs` and `.avatar`, which made buttons and labels uppercase with gradient fills. Fixed with scoped overrides under `.rnp` in `projects/styles.css`.
2. **No focus ring on the date input** (found by X-07). Chrome puts focus on the inner date segments, so `:focus-visible` never matched the input. Fields now get a ring on `:focus`.
3. **Dark-mode primary buttons failed contrast** (found by X-06). The profile prototype's dark tokens `--btn #2b8a60` and `--btn-hover #33a070` give white text 4.3:1 and 3.3:1. I darkened them to `#1f7a52` and `#186a47` (5.3:1 and higher). **This is the one change to the profile prototype's tokens.**
4. **Fit-score bars overlapped in narrow sidebars.** The four-column grid collided at 340px. It now wraps to two columns.
5. **Response form spacing.** The Interested / Not for me toggle sat on top of the rate field. The card now uses the form layout.

Test-harness mistakes fixed along the way, not product bugs: a JSON import in B-06, X-05 using an operator who had already responded, and X-06 measuring colors mid-transition and ignoring translucent backgrounds.

## Known gaps (KNOWN_GAPS.md)

| ID | Status in the prototype |
|---|---|
| G1 | Every operator list sorts by score then id. Checked by A-09 |
| G2 | Admin pages at 10; the buyer invite list pages at 10 ("Show 10 more") |
| G3 | Missing rate scores budget 8/15 and shows "No rate listed". The live match shows the no-rate count and the median of listed rates. Nobody is filtered out |
| G4 | `lastConfirmedAt` seeds as null; "Not confirmed" shows beside availability until a pulse or availability update. Fit uses hours only |
| G5 | Hours shown as entered; 120+ shows "Check hours" on admin views and response rows |
| G6 | Initials avatar wherever a photo is missing or fails to load |
| G7 | "Profile N% complete" chip beside scores (photo, rate, more than 6 skills, engagement, review, time zone, verified skill) |
| G8 | Profile shows "Time zone Not provided"; time zone is not used in matching |
| G9 | Names displayed in title case, stored raw |
| G10 | One category enum; "Customer Success Growth" maps to "Customer Success & Growth" |
| G11 | Can't be reproduced on seed data. A-10 confirms every operator is findable |
| G12 | Every outbox link is a magic link (`?as=role:id`) that signs in with no password |
| G13 | Buyer role only opens its own projects; any other project shows "This project is not in your account" |
| G14 | **Decision: intro requests from a project are auto-approved** and logged on admin Intro requests, plus the buyer's Intro requests page |
| G15 | Alerts only go to operators whose alert settings match the seat category and who are not unavailable. After one alert a day, further alerts roll into a digest entry. Implemented, but no QA scenario covers the digest, so it has no test |
| G16 | Not a fit stays silent until staffed or closed (B-09, B-12) |
| G17 | Operators never see budget. Revenue Nomad projects show only the rate to operator (A-06) |
| G18 | Selection confirmation screen (B6) states the fee as a placeholder |
| G19 | Path routes in the Next.js site; the artifact uses hash routes. Profile links carry the slug |
| G20 | Flag on A1 after 72 simulated hours; the buyer sees buttons to open to all or turn on suggestions |
| C1 | One shared store (`projects/lib/store.ts`) behind repository functions |
| C2 | Responses come only from operator actions or the admin "Simulate a response" tool, marked "Simulated" everywhere |
| C3 | Every number is computed from the store or the event log |
| C4 | Copy says answers are not scored; `answersScore()` is the hook and returns 0 |
| C5 | B6 confirmation plus a staffed state |
| C6 | Questions tab on the buyer project page; admin answers questions on Revenue Nomad projects |
| C7 | Pause, close to new responses, nudge buyer and send shortlist all work |
| C8 | Decline reasons show on admin A2 and in Reports |
| C9 | `projects/lib/fit.ts` ports the corrected reference; all 200 seeded sample scores reproduce exactly |

## Left open

- **Data is per browser.** As the brief asked, state lives in localStorage. In the Next.js site and in the artifact, each viewer gets their own copy, and switching roles happens in one browser. A shared backend or the artifact database would let several people play different roles at once.
- **Simulated time.** Every action moves the clock forward one minute so events stay ordered, and the Clock control adds whole days. So "time to first response" reads in minutes unless the clock is advanced.
- **Operator Profile Explorer.** It is linked, not ported. B5 is a native profile page with the prototype's hero band and design. "Open full profile explorer" opens the original explorer: hosted at `/rnp/explorer.html` in the site, and its existing artifact from the published prototype.
- **Fonts in test screenshots.** The sandbox blocks Google Fonts, so screenshots here use fallback fonts. Real browsers load Newsreader, IBM Plex Sans, Red Hat Display and Source Serif 4.
- **Design fidelity.** Tokens, type, hero band, chips, buttons and tier colors follow the profile prototype, and the screens follow the canvas layouts and copy. The canvas's hard-coded demo numbers are replaced with live counts (C3), so screens are not pixel-identical to the canvas.
