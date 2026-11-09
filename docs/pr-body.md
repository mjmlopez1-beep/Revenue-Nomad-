## Summary

Rebuild the homepage from the "Homepage D, the lead engine" mockup as Next.js sections on one token set, with
quality gates, a reviewed design, and every figure flagged until confirmed.

```text
<Home> (app/page.tsx, static)
  <ResearchBar> <SiteHeader client: menus + drawer>
  <main>
    <Hero> <FirmNumbers> <LogoMarquee client: pause control, hidden until 6 logo files>
    <ThreeRoads> <GtmEvolving> <Solutions> <WaysToWork> <HowItWorks>
    <HealthCheckBand static> <InTheirWords client: rotator with pause>
    <Assessment + CubeSolid svg> <Outcomes> <ValidationStrip null until a real entry>
    <FeaturedResearch form -> requestReport> <Resources> <Newsletter form -> subscribe>
    <ForOperators> <Faq details/summary> <ClosingBand>
  <SiteFooter>
app/[...slug]  static noindex stub for every unbuilt destination in links.ts; /thanks for the forms
app/tokens.css the only color/font source (scripts/check-tokens.mjs)   app/home/content/{links,numbers,logos}.ts
scripts/check-home.mjs  Playwright + axe smoke check (CONSTRAINTS.md)   docs/  decisions, design, review, spec, tickets, claims, ADR, handoff
```

Process followed (the installed skills, in order): context-engineering and writing-for-agents (`CLAUDE.md`),
token extraction, grilling (`docs/design/homepage-d-decisions.md`, assumptions A1 to A9), Elephant-Goldfish draft
and four fresh-context reviews (`homepage-d-design.md`, `homepage-d-review.md`), constraint-driven-development
(`CONSTRAINTS.md`), to-spec and to-tickets (`docs/specs`, `docs/tickets/homepage-d`), seven parallel section
builds with frontend-ui-engineering and incremental-implementation, doubt-driven review of every claim
(`homepage-d-claims.md`), performance measurement, two-axis code review, documentation-and-adrs, handoff.

## Evidence

- **Before:** `/` was a four-card landing for the operator job board; `check:home` baseline on it failed with a
  heading skip, serious contrast violations and 8 MB dev transfer.
- **After:** `npm run check` green (tsc, token guard, smoke check at 1440 and 390: 0 console errors, 0 axe
  violations, no horizontal scroll, every link resolves, unknown path 404, no fee language).
  Production build: `/` static, 116 KB first-load JS, 1.28 MB total transfer, 47 KB images.
  Lighthouse mobile: performance 94, accessibility 100, best practices 100, SEO 100, CLS 0, LCP 2.9 s.
  Production gate: with `NEXT_PUBLIC_SITE_ENV=production` the badges disappear and `check:home --site-env production`
  fails with "20 unverified figure(s)" until the founder confirms them, by design.
  Two-axis code review and dispositions: `docs/design/homepage-d-code-review.md`.

## Merge Danger

**Door:** two-way. Reverting restores the old landing; the portal is untouched except that `Brand.tsx` reads its
two greens from tokens.

**Blast Radius:** homepage

Not for production yet: every first-party figure is flagged `verified: false`, names and logos need permission,
the two forms discard email until wired, and every destination except `/` and `/portal` is a stub. The list is in
`docs/handoff.md`. Founder assumptions A1 to A9 await confirmation; the ADR stays Proposed until then.
