# 11: The 2-minute Revenue Health Check at /check

**What to build:** A visitor opens /check from the hero, picks revenue and employee range, answers seven questions
(one per pillar), leaves name and work email, and sees a total score, seven pillar levels and the two pillars to
fix first for their stage. The lead reaches HubSpot (or the local store when HubSpot is not configured).

**Blocked by:** None (spec approved live 2026-11-09)

**Status:** done

- [x] `app/check/content.ts` holds pillars, questions, answers, ranges, stage weights and fix-first lines
- [x] `app/check/scoring.ts` is pure and unit-tested (`npm test`, 5 tests)
- [x] `app/check/actions.ts` validates enumerated input, scores on the server, posts to the HubSpot Forms API when
      `HUBSPOT_PORTAL_ID` and `HUBSPOT_CHECK_FORM_ID` are set, else appends to `<RN_DATA_DIR>/checks.json`
- [x] `app/check/Check.tsx` stepper: focus moves to each step heading, radios with visible chosen state, Back,
      validation messages in a live alert, pending state on submit, results with labelled bars
- [x] `/check` removed from the stub list; `check:home` covers `/` and `/check`; `check:tokens` covers `app/check`
- [x] Browser run: intake -> 7 answers -> lead form -> results (total 33, fix-first Data Foundations and Revenue
      Technology at $5M to $20M), local record written, no page errors
- [ ] HubSpot: create the contact properties and the form, set `HUBSPOT_CHECK_FORM_ID` (owner; see the spec)
