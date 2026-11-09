# 07: Featured research, resources, newsletter, server actions

**What to build:** The dark research band with the report cover and an email form, four resource cards, the newsletter form with consent line, and the two server actions that validate, discard and redirect to `/thanks`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Report cover via `next/image` from `public/home/report-cover.webp` (1200 by 734)
- [ ] `app/home/actions.ts` with `requestReport` and `subscribe` per design 4.6; forms use `required` and `type="email"`
- [ ] `/thanks?for=report` and `/thanks?for=newsletter` render their variant; any other value renders generic text
- [ ] Consent line "Once a month. One click to leave."; checks pass
