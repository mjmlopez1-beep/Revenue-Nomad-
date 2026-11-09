# Spec: the 2-minute Revenue Health Check

Status: DRAFT FOR FOUNDER REVIEW. Nothing below is built until the questions, answers, weights and scoring are
approved. Decisions already taken (2026-11-09, founder, live): Homepage C ships with a "Take the 2-minute check"
hero button that opens `/check`; the check asks revenue range and employee range first; seven questions, one per
pillar; name and email are captured after the seven questions and before results; results render instantly;
leads go to HubSpot; the pillar weights by stage are drafted here for correction.

## Problem Statement

A company leader lands on the homepage unsure whether they need a fractional leader, a diagnostic, or nothing.
Talking to us is a big first step. They need a two-minute way to see where their revenue engine is weak, framed
for a company their size, that ends in a reason to talk.

## Solution

A seven-question self-check at `/check`. Two context questions (revenue range, employee range) set the stage.
Seven questions score one pillar each on the Diagnostic's four maturity levels. After the questions the visitor
gives name and work email, then sees a score per pillar, a total, and the two pillars to fix first, chosen by
lowest score weighted by what creates the most lift at their stage, with one line on how companies like theirs
fixed each. Every result ends in Talk to us. The answers and scores go to HubSpot so the team can follow up.

## The flow

1. `/check` intro: what it is, two minutes, seven questions, no call needed. Start.
2. Step 0, two selects (standard fields from the product rules, single-select variants):
   - Company revenue: Pre-revenue, Under $1M, $1M - $5M, $5M - $20M, $20M - $50M, $50M+
   - Company employees: 1 - 10, 11 - 50, 51 - 200, 201 - 500, 501 - 1,000, 1,000+
3. Steps 1 to 7, one question per screen, four answers, one selected, Next (Back allowed). Progress "Question n of 7".
4. Step 8: first name, last name, work email, company (optional), and the line "We will send these results to
   this address. No spam, one click to leave." Submit = See my results.
5. Results: total score 0 to 100, seven pillar bars on the Diagnostic's 1 to 4 scale, the two "fix first"
   pillars with the stage reason and a how-companies-fixed-it line, then Talk to us (primary) and
   "See the full Revenue Health Diagnostic" (link). Results are also sent by email once HubSpot workflows exist.

The check works without JavaScript as a sequence of server-rendered forms (answers carried in hidden fields),
and with JavaScript as a single-page stepper. Nothing is stored until step 8 is submitted.

## The seven questions (DRAFT, one per pillar, in the Diagnostic's pillar order)

Each answer maps to a maturity level: A = 4 Optimized, B = 3 Performing, C = 2 Foundational, D = 1 Ad Hoc.
Question 1 is the one on the homepage artboard; its answers are kept verbatim.

1. **GTM Design** - Could you name, specifically, what is broken in your revenue function today?
   A. Yes - and we know how to fix it  B. Yes - but not how to fix it  C. We have theories, not evidence  D. Honestly, no
2. **Revenue Technology** - Does your CRM show every deal, stage and next step the way the team actually works?
   A. Yes, and the team lives in it  B. Mostly; a few teams keep their own lists  C. It exists, but it is behind reality  D. The real pipeline is in people's heads and spreadsheets
3. **Revenue Insights** - When the board asks for the forecast, how does the answer hold up?
   A. One number, inspected deal by deal, and it lands  B. One number, but it moves most weeks  C. Several numbers depending on who you ask  D. We do not have a forecast we would defend
4. **Data Foundations** - Could a new hire trust the data in your systems on day one?
   A. Yes; owners, definitions and hygiene are documented and checked  B. Mostly; the basics are documented but nobody inspects  C. Some of it; you have to know who to ask  D. No; we clean it up before every board meeting
5. **Operating Rhythm** - Does the revenue team run the same way every week?
   A. Yes; a fixed cadence of pipeline, forecast and deal reviews, with owners  B. Mostly; meetings happen, follow-through varies  C. Sometimes; it depends on who is driving that month  D. No; we react to whatever is loudest
6. **Team Enablement** - How does a new seller get to full productivity?
   A. A documented playbook, onboarding plan and coaching cadence; ramp time is measured  B. A playbook exists; coaching depends on the manager  C. They shadow whoever is available  D. They figure it out or they leave
7. **AI** - Where is AI taking work off your sellers today?
   A. In the workflow, measured, and scaling (research, follow-up, notes, forecasting)  B. A few pilots with early time savings  C. Individuals use tools on their own; nothing shared  D. Nowhere yet

## Scoring (DRAFT)

- Each pillar scores its maturity level 1 to 4 (shown on the Diagnostic's scale: Ad Hoc, Foundational,
  Performing, Optimized).
- Total score = average level, rescaled to 0 to 100: `(mean - 1) / 3 * 100`, rounded.
- **Fix-first priority** per pillar = `(4 - level) * stageWeight`. The two highest priorities are "fix first";
  ties break by the Diagnostic's pillar order. Stage weight comes from the revenue range (employee range is
  shown as context and sent to HubSpot; it does not change the math in v1, so the model stays explainable).

### Stage weights (DRAFT, for correction)

Rationale: before $5M the question is whether a repeatable motion exists at all, so structure and rhythm
dominate; from $5M to $20M the engine must become inspectable and the team scalable; above $20M the board, a raise
or diligence demand trustworthy data and a defensible forecast, and AI becomes an efficiency lever on a team that
already works.

| Pillar | Pre-revenue / Under $1M | $1M - $5M | $5M - $20M | $20M - $50M | $50M+ |
|--------|------|------|------|------|------|
| GTM Design | 1.5 | 1.5 | 1.2 | 1.0 | 0.9 |
| Revenue Technology | 0.8 | 1.0 | 1.2 | 1.1 | 1.0 |
| Revenue Insights | 0.7 | 0.9 | 1.2 | 1.5 | 1.5 |
| Data Foundations | 0.7 | 0.9 | 1.3 | 1.5 | 1.5 |
| Operating Rhythm | 1.3 | 1.4 | 1.2 | 1.0 | 0.9 |
| Team Enablement | 0.8 | 1.1 | 1.3 | 1.2 | 1.0 |
| AI | 0.6 | 0.7 | 0.9 | 1.1 | 1.3 |

### Fix-first lines (DRAFT, one per pillar; shown under the two chosen pillars)

- GTM Design: "Companies at your stage usually fix this by defining the motion first: roles, stages and a comp
  plan the whole team can see. The Diagnostic's GTM Design workstream does this in the first month."
- Revenue Technology: "The fix is rarely a new tool. It is making the CRM match how the team sells, then
  retiring the side lists."
- Revenue Insights: "One forecast, inspected deal by deal on a weekly call, replaces the number that moves."
- Data Foundations: "Stage definitions, field owners and a hygiene check turn the CRM into something a board or a
  diligence team can read."
- Operating Rhythm: "A fixed weekly cadence with owners is the cheapest fix on this list and the one the others
  depend on."
- Team Enablement: "A playbook and a coaching cadence make ramp time something you measure, not guess."
- AI: "Two use cases in the seller workflow, measured, then scaled. Time back per seller is the number to watch."

## Lead capture

- Server action `submitCheck` validates the payload (enumerated answers, email shape), computes the scores on the
  server, and sends one HubSpot Forms API submission (no secret needed: portal ID and form GUID are configuration)
  with fields: email, firstname, lastname, company, `rn_check_revenue_range`, `rn_check_employee_range`,
  `rn_check_total`, one `rn_check_<pillar>` level per pillar, `rn_check_fix_first`. If the HubSpot configuration
  is missing, the action writes the same record to `data/checks.json` under `RN_DATA_DIR` and logs a warning, so a
  misconfigured deploy still keeps the lead.
- Needs from HubSpot: the portal ID (looked up), a form named "Revenue health check" with those fields, and the
  custom contact properties created. Listed as setup steps in the handoff.
- The results page is rendered from the server action's computed result (no personal data in the URL).

## Out of scope for v1

Emailing the results (HubSpot workflow once the form exists), saving progress, comparing against benchmarks,
industry questions, and the 21-building-block depth (that is the paid Diagnostic).

## Open for the founder

1. Approve, edit or replace each question and answer set above.
2. Correct the stage weights, or tell me the logic in your words.
3. Confirm the four answers always map A to D onto Optimized to Ad Hoc, or supply per-question mappings.
4. Confirm the HubSpot form fields, or let me create the custom properties through the connected HubSpot account.
