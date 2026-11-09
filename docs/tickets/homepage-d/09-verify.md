# 09: Verification

**What to build:** Evidence that the page meets the spec and constraints: an adversarial review of every claim, performance numbers, a two-axis code review, and the fixes they produce.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08

**Status:** ready-for-agent

- [ ] Doubt review (fresh-context reviewer, artifact and contract only) of every figure and claim; findings and dispositions in `docs/design/homepage-d-claims.md`
- [ ] `npm run build` then `check:home --url` against `next start` records weight; Lighthouse mobile numbers recorded in `CONSTRAINTS.md`
- [ ] Two-axis code review (standards, spec) against `main`; findings fixed or recorded
- [ ] All checks green
