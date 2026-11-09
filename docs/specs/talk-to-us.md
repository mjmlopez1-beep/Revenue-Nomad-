# Spec: Talk to us (/talk)

Status: BUILT 2026-11-09 from the artboards "Desktop - Talk to us flow" and "Phone - Talk to us flow".

## What it does

Four questions, then a person replies within 24 hours:

1. Where is revenue stuck right now? Eight options (the sales motion, pipeline and forecast, the team, systems and
   data, AI GTM, retention and growth, partners and channels, other). Choosing one advances.
2. How big is the company? Annual revenue band and people band (the standard fields shared with the check).
3. When does the leader need to start? Within 30 days, this quarter, next quarter, exploring.
4. Where should we reach you? Name, work email, company (optional), title (optional), what you are looking for
   (optional). Send request.

Number keys 1 to 9 pick options on steps 1 to 3 (the artboard's "Press 1 to 8"). Answers so far show as chips
above the question and the Back control returns to them. Focus moves to each step's heading.

Sent state: "Got it, {first name}. A person is on it.", the email we will use, a Book a call card (Calendly,
`https://calendly.com/revenuenomad`, overridable with `NEXT_PUBLIC_BOOK_CALL_URL`), and the request summary.
"Start a new request" resets.

## Deliberately not built

- **The three "Operators we would start with" cards.** The artboard shows sample operators with illustrative fit
  scores and rates. No matching exists yet, and showing invented operators to a real lead would mislead. Add when
  the operator directory is live and matching is real.
- **"Call us" with a phone number.** The artboard says "Company line added before launch"; the card is omitted until
  a number exists (no placeholders, decision A5).

## Lead capture

`app/talk/actions.ts` validates every answer against the enumerated options and the email shape, then
`app/leads/record.ts` posts to the HubSpot form named by `HUBSPOT_TALK_FORM_ID` (Forms API, no secret) or appends
to `<RN_DATA_DIR>/talk-requests.json`. The same helper serves the check.

HubSpot setup for this form (owner): contact properties `rn_talk_need` (dropdown: the eight option values),
`rn_talk_revenue_range` and `rn_talk_employee_range` (same option sets as the check), `rn_talk_start` (dropdown:
`within_30_days`, `this_quarter`, `next_quarter`, `exploring`); the note goes to the standard `message` property
and the title to `jobtitle`. Create a form "Talk to us" with Email, First name, Last name, Company name, Job title,
Message and the four `rn_talk_*` fields, then set `HUBSPOT_TALK_FORM_ID`.
