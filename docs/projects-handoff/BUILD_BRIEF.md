# Revenue Nomad Projects, working prototype build brief

Owner Matt Lopez. Written for the Claude Code session working in the Revenue-Nomad- repo.

## 1. What to build

One working web prototype where three kinds of user share the same live data.

- **Buyer** writes an engagement, posts it, invites operators, reviews responses ranked by fit, requests intros, marks people not a fit, and selects one.
- **Operator** gets an invite or a new role alert, opens the project, responds with interest, rate, hours, start date and screening answers, asks a question or passes, and follows status to selection.
- **Admin** (Revenue Nomad) watches every project, adds up to three suggested operators to a buyer project when the buyer asks, nudges and pauses, and separately originates Revenue Nomad projects for its own clients with bill rate, operator rate and an internal pipeline.

Every action by one role must show up for the other two without a reload beyond a normal navigation. That connection is the point of this prototype. The design canvas it replaces had each screen holding its own state, so nothing carried between screens.

The self-serve rule is firm. Revenue Nomad never screens or approves a buyer's project or responses. The buyer posts and it is live. Admin only sees, suggests when asked, nudges and pauses.

## 2. Sources to read first

| Source | Link | Use it for |
|---|---|---|
| Flow design canvas, 12 screens | https://claude.ai/artifact/PpBMkwMVoLedcVmJbHXPrk | Screen layouts and copy for buyer B1 to B4, operator O1 to O4, admin A1 to A4 |
| Operator Profile Explorer | https://claude.ai/artifact/B6nRHucUmPXg3x6R1tNjuP | The operator profile page, loaded with the same 100 operators. Link profiles here or port it |
| Operator profile prototype | https://claude.ai/artifact/ByYRo2RMhXPjALXBZE26ot | Design tokens, type, hero band, chips, buttons. The visual source of truth |
| Phase one spec | https://claude.ai/artifact/EukHnmBuFDN8rTUyRjWSoY | Data model and events. Parts are superseded, see section 9 |
| This handoff | seed files, QA_PLAN.md, KNOWN_GAPS.md in this package | Seed data, test cases, gaps to handle |

Read canvas files with the Artifact tool, action read, path `project/<Screen>.dc.html`. Screen files are Main, Post, Review, Project (buyer), OpEmails, OpPortal, OpProject, OpStatus (operator), AdminProjects, AdminBuyerProject, AdminNew, AdminPipeline (admin).

## 3. Stack and shape

Use whatever the repo already uses for the operator profile prototype. If there is no app framework yet, build a single-page app with Vite plus React plus TypeScript and a tiny router. No real backend. Put all state in one store module with a repository interface (`getProjects`, `createInvite`, and so on) backed by localStorage, so a real API can replace it later without touching screens.

Must have
- A role switcher always visible in a thin prototype bar at the top. Buyer (Jordan Ellis at Northwind Health), Operator (pick any of the 100 from a searchable list, default Tim Evans), Admin (Matt Lopez). Switching role keeps all data.
- A "Reset demo data" button in the same bar that reseeds from the seed files.
- An **Outbox** panel reachable from the bar that lists every email and alert the system "sent", with recipient, subject, body and the link it carries. Clicking the link logs in as that recipient and opens the target. This is how invites, alerts, answers, intro requests and staffed notices get tested without an email service.
- A **Clock** control in the bar that moves simulated time forward by one day or seven days, so deadlines, "no responses in 72 hours" flags and nudges can be tested.
- Deep links by path, for example `/buyer/projects/:id`, `/operator/projects/:id`, `/admin/projects/:id`, `/operators/:slug`.

Visual
- Match the operator profile prototype exactly. Tokens are `--canvas #f4f6f4`, `--surface #ffffff`, `--ink #0f1a14`, `--ink-2 #3a4740`, `--muted #65716a`, `--line #e1e6e2`, `--brand #0b4d38`, `--brand-text #0b5a41`, `--brand-2 #16755a`, `--tint #eaf4ee`, `--tint-line #cbe1d4`, `--gold #ad7c1f`. Newsreader for headings and big numbers, IBM Plex Sans for everything else. The dark green hero band on page headers. Fit tiers strong green, possible gold, weak rust as on the canvas.
- Include the dark theme tokens the profile prototype already defines.
- Must work at 400px wide.

## 4. Data model

Extend the phase one spec. Field names below are the ones to use.

**Operator** comes from `seed/operators.json` (100 real profiles). Keep every field in the file. Add `lastConfirmedAt` (null for all seeded operators, see gap G4), `alertPrefs` (roles and categories they want alerts for, default their own category), `portalProjects` (derived, not stored).

**Buyer** `{ id, company, companyDescriptor, contactName, contactTitle, email }`. Seed two in `seed/buyers.json`.

**Project**
| Field | Notes |
|---|---|
| id, title, successIn90Days, hoursPerMonthMin, hoursPerMonthMax, term, startTarget, location | The brief |
| budgetMin, budgetMax | Buyer facing. Never shown to operators |
| mustHaves | Array of tag labels, used by fit score |
| screeningQuestions | 0 to 5 strings |
| companyDescriptor, hideCompanyUntilIntro | Confidentiality |
| visibility | `invite_only` or `invites_plus_open` |
| wantsRnSuggestions | Boolean, buyer toggle |
| origin | `buyer` or `revenue_nomad` |
| ownerBuyerId or ownerAdminId | One of them |
| clientName, billRate, operatorRate | Revenue Nomad projects only. Operators see operatorRate, client sees billRate |
| status | `draft`, `live`, `paused`, `closed_to_responses`, `staffed`, `closed_unfilled` |
| postedAt, staffedAt, closedAt | Timestamps |

**Invite** one row per operator per project, unique on (projectId, operatorId). `source` is `buyer`, `rn_suggested` or `admin` (Revenue Nomad projects). An invite puts the project in the operator's portal immediately.

**Alert** one row per operator per open project for operators who were not invited. It does not put the project in the portal.

**Response** one row per operator per project. `interest` (`interested` or `declined`), `declineReason`, `rate`, `hoursPerMonth`, `canStart`, `answers[]`, `note`, `submittedAt`, `draft` boolean. A response from an alerted or browsing operator creates their portal entry.

**Buyer decision on a response** `none`, `intro_requested`, `not_a_fit`, `selected`, plus `notAFitReason`.

**RN pipeline stage** Revenue Nomad projects only. `invited`, `responded`, `shortlisted`, `with_client`, `selected`, `not_selected`.

**Question** from operator on a project, with answer. The buyer answers on buyer projects, admin on Revenue Nomad projects.

**IntroRequest** reuse the platform's existing intro request concept. Creating one from a project links it to the response. Decide and document whether it needs admin approval (gap G14). Default for the prototype is auto-approved, with an admin-visible log.

**Event** append-only, every state change, with actor, role, project, operator, timestamp and metadata. The admin activity log and reports read from this.

## 5. Status rules

1. Posting sets status `live`, sends invites to invited operators and, when visibility is `invites_plus_open`, alerts to every non-invited operator whose `alertPrefs` match the project role category and whose status is not `unavailable`. No approval step.
2. An invited operator sees the project in their portal under "Invited, waiting on you". An alerted operator sees it under "Open roles for you", not in their portal, until they respond.
3. Responding with interest moves the operator to "Responded" with operator-facing status `Responded`. When the buyer opens that response, status becomes `Buyer viewed`. On intro request it becomes `Intro requested` and the company name and buyer contact are revealed to that operator only.
4. "Not a fit" is private until the project is staffed or closed. Then every non-selected responder gets one polite close email. Operators who never responded get nothing.
5. Selecting one responder sets the project `staffed`, stamps `staffedAt`, sends the selected email to them, sends the close email to the others, and locks further responses.
6. Buyer can undo intro requested and not a fit until the project is staffed. Undo after staffing is not allowed.
7. Pause hides the project from Open roles and stops new responses. Existing responders keep their status.
8. "Close to new responses" keeps the project live for the buyer but blocks new responses.
9. A Revenue Nomad project uses the pipeline stages. Moving someone to `selected` follows rule 5. The client never sees operators until admin sends a shortlist.

## 6. Fit score

Use `seed/fit-score.js` exactly. It is the scoring the canvas and explorer used, so numbers match.

- Out of 100. Skills and role 35, experience 30, budget 15, hours 20.
- Screening answers are not scored yet. Leave a hook for an answers component and show the four parts only.
- Missing rate scores the budget part at 8 of 15 and shows "No rate listed". It must never drop the operator from results.
- Tiers are Strong 85 and up, Possible 70 to 84, Weak under 70.
- Every score shows its parts, one line on why they fit and one on the main gap, as on canvas screen B4.

## 7. Screens

Build every screen on the canvas, with these connections.

Buyer
- B1 Projects dashboard. Cards read live counts from the store.
- B2 Post a project, the seat. Live match panel computes from the 100 operators as the buyer types.
- B3 Invite operators and visibility. Search all 100, invite and uninvite, suggestions toggle, previews of both the invite email and the alert. Post project creates invites, alerts and outbox entries.
- B4 Responses by fit. Tier tiles, sort by fit, rate, start, newest, views for to review, intro requested, not a fit. Bulk "Pass on all weak fits". Each row links to the operator profile.
- B5 Operator profile from a response (port the explorer or link to it).
- B6 Select an operator confirmation, then staffed state.

Operator
- O1 Outbox emails are the invite and the alert.
- O2 Portal with Invited, Responded, Closed, plus Open roles for you.
- O3 Project page and response form, with save draft, submit, ask a question, not for me with reason.
- O4 Status timeline, intro requested with company revealed, selected, closed.
- O5 Availability update (reuse the pulse one-tap links from the phase one spec as outbox links).

Admin
- A1 All projects with KPIs from events and Needs attention flags.
- A2 Buyer project, read only, with suggestions panel, nudge buyer, pause, activity log.
- A3 New Revenue Nomad project with client, economics and invite list.
- A4 Revenue Nomad pipeline board with drag or move buttons and send shortlist to client.
- A5 Reports from events. Response rate per project, time to first response, intro rate, decline reasons, alerts sent per role.

## 8. Definition of done

- Every scenario in QA_PLAN.md is covered by a Playwright test that runs headless against the dev build and passes.
- Every gap in KNOWN_GAPS.md is handled the way its "In the prototype" column says, or noted as open in the report.
- A short `QA_REPORT.md` at the end listing each scenario ID, pass or fail, bugs found, what was fixed, and anything left open with the reason.
- The prototype is published as a claude.ai artifact so Matt can click through it, plus the source on a branch.

## 9. Where this departs from the phase one spec

- Buyers now create, own and run projects. The spec had buyers with no access. Add the buyer role and its permissions.
- No Revenue Nomad review before a buyer project goes out. Screening stages `screened` and `on_slate` exist only on Revenue Nomad projects.
- Two notification types. Invite (lands in portal) and alert (does not). The spec had only invites.
- Budget lives on the project for buyer projects. `rate_to_operator` stays for Revenue Nomad projects, now paired with `billRate`.
- Reveal happens at intro request, not at a stage.
