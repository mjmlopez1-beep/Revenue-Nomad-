# Design: Homepage D, the lead engine, as the revenuenomad.com homepage

Status: revised after Goldfish review (`docs/design/homepage-d-review.md`). Requirements: `docs/specs/homepage-d.md`.
Tickets: `docs/tickets/homepage-d/`. Copy source: `docs/design/homepage-d-content.md`.
Visual source: the Design canvas "Revenue Nomad - Option D website",
https://claude.ai/artifact/1CosGB9Ef1wMCrX8rt7uqh, artboards "Desktop - Homepage D, the lead engine"
(`project/HomeEPage.dc.html`, 1440 wide) and "Phone - Homepage D, the lead engine" (`project/HomeEMobile.dc.html`,
390 wide), and the canvas note titled "Homepage D - the lead engine".

## 1. Problem

Revenue Nomad's live homepage (`app/page.tsx` on this branch: a plain CSS landing with four feature cards) sells a
job board to operators. The company now sells fractional revenue leadership to companies with $1M to $200M in
revenue, and buyers arrive from role-based searches ("fractional VP of sales", "CMO as a service", "fractional
RevOps"). The current page does not speak to them, gives them nothing to do except open the portal, and carries
none of the firm's proof (reviews, outcomes, research). Four homepage mockups were produced on the design canvas;
the most recent direction is Homepage D. It exists only as a static artboard, which cannot be deployed, maintained
or wired to forms.

### 1.1 Decisions this design rests on

Recorded in `docs/design/homepage-d-decisions.md` as assumptions for the founder to confirm:

- **A1** Homepage D is the page. Homepage C is D without seven blocks (research bar, firm numbers, "Which one is
  you?", ways to work, the health-check band, the validation strip, the newsletter) and without the "$1M to $200M"
  line in the hero; D is a superset, so C is history, not an alternative.
- **A2** Rebuild as Next.js components; do not publish the artboard HTML.
- **A3** The canvas palette and type win. Three visual systems exist: the canvas (DM Serif Display and Red Hat
  Display, forest #285B44 and night #0E2433 on white), the October static prototype's `DESIGN.md` (Newsreader and
  Red Hat Text, forest #095D42 on paper #F5F4EE) and the landing page on the sibling branch
  `ccr-f2e9ac1f-j1f246` (system fonts, gradient greens, a WebGL glass hero). The canvas becomes `app/tokens.css`.
  The prototype's product rules (standard fields, money copy, voice) still apply.
- **A4** The operator pitch moves to the "For operators" band; the portal stays at `/portal`, linked as
  "Operator login" in the footer.
- **A5** No placeholder boxes. Real assets ship only where the firm owns them (the glass mark, the report cover).
  Logos appear when their files exist; people render as initials until approved photos exist.
- **A6** Every link resolves. Pages that do not exist yet render one shared stub.
- **A7** Client JavaScript only where there is state: the header, the logo marquee's pause control, the review
  rotator. Everything else is server-rendered HTML and CSS.
- **A8** Every figure a visitor sees comes from one data file and carries a `verified` flag.
- **A9** The "As seen in / Rated on" strip renders nothing while every slot is a placeholder.

## 2. Goals

1. A visitor who searched a role name sees, above the fold, that this firm places that role for companies like
   theirs, and has two ways to start: Talk to us, or "Take the 2-minute check", which scrolls to the health-check
   band (as on the artboard); the band's button opens the check page, which until the check is built explains
   what it will be and offers the call.
2. Every section of Homepage D ships in the Next.js app, on one token set, at 1440 and 390 wide, with no
   horizontal scroll and no console errors.
3. Every link on the page resolves to a real route. Missing destinations render a shared, non-indexed stub that
   names the page.
4. Every figure in a stat block, the FAQ, the footer "At a glance" and the hero lede comes from `numbers.ts`,
   and either names its source or carries `verified: false`. Prose sentences that quote a figure interpolate the
   same constant. The flag shows as a visible badge everywhere except the production deployment.
5. Client JavaScript is limited to the header (menus and drawer), the marquee pause control and the review rotator.

## 3. Non-goals

- The seven-question Revenue Health Check, the Rate Index page, solution pages, case studies, the report reader,
  About, For operators and Talk to us as full pages. The canvas's site map artboard lists them.
- Storing form input. The two email forms validate the address on the server and discard it (see 4.6).
- Analytics, structured data (JSON-LD), and an Open Graph image. Listed in the handoff.
- Replacing initials and hidden logos with approved assets. Listed in the handoff with the permissions needed.
- Any change to the Operator Portal's behaviour or styling. The portal keeps its own CSS in `globals.css`.

## 4. Proposed design

### 4.1 Page structure

One route, `/`, rendered by `app/page.tsx`, composed of section components under `app/home/`, in artboard order.
Each is a server component unless marked client. Section file names are the names below plus `.tsx`.

| # | Section | Content (see the content appendix for exact copy) | Notes |
|---|---------|------------------|-------|
| 0 | ResearchBar | One-line bar above the header: "New research", the report title, "Read the findings" link | Link from `links.ts` |
| 1 | SiteHeader (client) | Wordmark (`app/Brand.tsx`), Solutions and Resources menus, About, For operators, Talk to us button. Below 900px: wordmark, Talk to us, a Menu button that opens a drawer | Behaviour in 4.4 |
| 2 | Hero | Eyebrow, serif headline with italic forest phrase and coral full stop, lede naming $1M to $200M, two actions (Talk to us primary, Take the 2-minute check secondary), glass mark on a soft glow at right; mark below the copy on phones | `public/home/glass-mark.webp`, 980 by 984 |
| 3 | FirmNumbers | Four figures: operators in the network, would hire again, operators and contracts behind the research, hours to a first conversation | All `verified: false` today |
| 4 | LogoMarquee (client control) | "Hired by teams at", one continuous row of client logos, one loop in about 40 seconds, a pause/play button, static row under reduced motion | Renders only when at least six logos have files (A5, A9) |
| 5 | ThreeRoads | "Which one is you?", three cards (leader left, founder still selling, inherited the number), each with one link, and a "Just exploring what it costs? Open the Rate Index" line | |
| 6 | GtmEvolving | Dark band: four third-party statistics with sources, then "How we work" three numbered points | Sources in `numbers.ts` |
| 7 | Solutions | "Our solutions", four outcome cards (sales leadership, pipeline, RevOps, AI), each one link, plus a "Browse operator profiles" pill | Card images are decorative; omitted until assets exist |
| 8 | WaysToWork | Forest band: four engagement models (diagnostic, monthly fractional, interim cover, fractional to full time) with term, "Best when" and "How it works" link. No prices | |
| 9 | HowItWorks | Three steps with gold numbers, "No fees for companies", Talk to us | |
| 10 | HealthCheckBand | Mist band, static: the pitch, a card showing "Question 1 of 7" with its four answers as a plain list, one primary button "Start the check" to the check page; beside it "What it costs" with one example row (role, hours a month, monthly range, source) and the "Open the Rate Index" link | No form, no selects: the artboard's controls are drawn, not functional, and nothing would consume the answers (zoom-out finding 2) |
| 11 | InTheirWords (client) | Three verified reviews; one visible at a time, advancing every 9 seconds; previous, next and pause buttons; `aria-live="polite"`; all three stacked statically under reduced motion | Reviewer avatars are initials (A5) |
| 12 | Assessment | Gold band: "Building the GTM foundation", the cube solid in three layers (inline SVG copied from the artboard), the seven pillars beneath, one link | Terms in 4.8 |
| 13 | Outcomes | "What changed": three case-study cards (metric, before, after, quote, source, link) and "Read all seven case studies" | |
| 14 | ValidationStrip | "As seen in / Rated on", five slots | Returns null while every slot is a placeholder (A9) |
| 15 | FeaturedResearch | Dark band: report cover, title, one email field, "Read it" button, "One email opens the full report and sends the PDF." | Form in 4.6; cover 1200 by 734 |
| 16 | Resources | Four resource cards (Rate Index, case studies, two guides) and "Explore all resources" | |
| 17 | Newsletter | One email field, "Subscribe", the consent line | Form in 4.6 |
| 18 | ForOperators | Forest band: pitch, operator count, "Join as an operator", three sample operator cards with initials avatars, the "Sample profiles" note | |
| 19 | Faq | "What companies ask first": four `details`/`summary` items in two columns | |
| 20 | ClosingBand | Dark band: "Tell us where revenue is stuck", "The first call gets you" three lines, Talk to us | |
| 21 | SiteFooter | Entity paragraph, four link columns, "At a glance" six facts, cite line with the Updated date, Company links, Operator login, Privacy, Terms, Sitemap | Identical on every page |

### 4.2 Styling

- `app/tokens.css` defines every color, font family, type size, radius and spacing as `--rn-*` variables. It is
  imported once from `app/layout.tsx` so the portal's `Brand` can use the two mark colors.
- Homepage CSS lives in `app/home/home.css`, imported from `app/page.tsx` and from the stub page, not from the
  layout, so the portal downloads none of it. Class names carry a section prefix (`.hero-`, `.roads-`).
- Fonts load through `next/font/google` in `app/layout.tsx`: Red Hat Display and DM Serif Display, `display: swap`,
  exposed as `--font-red-hat` and `--font-dm-serif` on `<html>`. `globals.css` keeps the portal on system fonts.
- Breakpoints: 900px (multi-column grids collapse, menus become the drawer) and 480px (type steps down to the
  phone artboard's sizes). Content width 1120px, 20px gutters below it.
- Motion: three animations exist (marquee, review rotation, button hover). All stop under
  `prefers-reduced-motion: reduce`, and the two that move on their own have a visible pause control (WCAG 2.2.2).
- `app/Brand.tsx` is retokenised: its two hard-coded greens become `var(--rn-forest)` and `var(--rn-leaf-strong)`.
  The portal's mark shifts one shade of green; nothing else in the portal changes.

### 4.3 Data

- `app/home/content/numbers.ts`: every figure shown, keyed by name, each with value, label, optional source
  and `verified`. Includes the Updated date for the footer. Unverified figures render a small "confirm" badge
  and a `data-unverified` attribute unless `NEXT_PUBLIC_SITE_ENV` is `production` (set only on the production
  deployment; previews keep the badge, which is where the founder reviews the page).
- `app/home/content/links.ts`: the navigation tree (menu groups, footer columns) and a `routes` map of every
  internal path to its page title. The header, footer, sections and the stub route all read from it.
- `app/home/content/logos.ts`: the client logo list with an optional `file`. Only entries with a file render.
- Copy stays in the section that renders it; a section imports the figures it interpolates from `numbers.ts`.

### 4.4 Header behaviour

- Solutions and Resources are `<button aria-expanded aria-controls>` elements that open a panel on click (not
  hover). Escape, a click outside, or a route change closes them and returns focus to the button.
- Below 900px, the Menu button opens a full-height drawer (`role="dialog"`, `aria-modal="true"`, labelled). Opening
  moves focus to the first link, locks body scroll, and traps Tab inside; Escape or the Close button closes it
  and restores focus. The drawer lists both menu groups expanded, About, For operators, Talk to us.
- The header is the same component on `/` and on stub pages.

### 4.5 Routes

- `/` the homepage. `/portal` unchanged.
- `app/[...slug]/page.tsx`: a static stub for every path in `links.ts` except `/` and `/portal`.
  `generateStaticParams` from the routes map, `dynamicParams = false`, so any other path is the Next.js 404.
  Metadata sets `robots: { index: false, follow: true }`. The page renders the header, the destination's title
  from the map, one line ("This page is being built. Talk to us in the meantime."), a Talk to us button and the
  footer. It never reads or renders query parameters.
- `/thanks` is its own route (`app/thanks/page.tsx`) because it reads one query parameter, which the static
  catch-all never does: `for` is matched against `report` or `newsletter`; any other value renders the generic text.

### 4.6 Forms

- The two email forms are plain `<form method="post">` elements bound to server actions in `app/home/actions.ts`:
  `requestReport` and `subscribe`. Each reads `email` from the form data, checks it against a simple address
  pattern, and redirects to `/thanks?for=report` or `/thanks?for=newsletter`. Invalid input redirects back to
  `/#research` or `/#newsletter` with no message beyond the browser's `required` and `type="email"` validation.
  The address is not stored, logged or sent anywhere; the handoff lists wiring it to the email tool as launch work.
- The newsletter form carries the consent line: "Once a month. One click to leave."
- The health-check band has no form (4.1 row 10). "Start the check" and "Open the Rate Index" are links.

### 4.7 Metadata

`app/page.tsx` exports metadata: title "Fractional revenue leadership for $1M to $200M companies | Revenue Nomad",
description from the footer's entity paragraph (first two sentences), canonical `https://revenuenomad.com/`. The root
layout keeps the site name. The Open Graph image is deferred (non-goal) and listed in the handoff.

### 4.8 Terms

- **Glass mark**: the Revenue Nomad favicon shape rebuilt as a glass object, green into blue, used as the hero visual.
- **Cube solid**: the assessment's isometric illustration, 7 cubes long, 3 deep, 3 high, built in three layers
  (what it runs on, how it runs, what you see). One 3 by 3 slab per pillar.
- **Seven pillars**: the assessment's dimensions: Data Foundations, Revenue Technology, GTM Design, Operating
  Rhythm, Team Enablement, Revenue Insights, AI. One health-check question per pillar.
- **172 operators and 38 signed contracts**: the sample behind "The State of Fractional GTM 2027", the firm's
  research report.
- **Rate Index**: the firm's published table of what fractional leaders charge by role and days per week.
- **Doubt review**: an adversarial, fresh-context review of each claim on the page (`doubt-driven-development` skill).
- **Two-axis code review**: a review of the diff against the repo's standards and against this spec, run as two
  independent subagents (`code-review` skill).

## 5. Alternatives considered

1. **Serve the artboard HTML as a static page.** Fastest to ship, no fidelity loss. Rejected: 180 KB of inline
   styles with 55 raw hex values cannot be maintained, has no responsive behaviour between the two fixed widths,
   cannot host server-action forms, and would ship a second header beside the portal's.
2. **Keep the current landing and add Homepage D's sections below it.** Preserves existing work. Rejected: the
   current hero and feature cards address operators, so the page would open with the wrong audience; on the
   sibling branch the same page carries a WebGL shader hero, the heaviest asset a role-name searcher would download.
3. **Build Homepage C first, add D's seven blocks later.** Smaller first slice. Rejected: D is C plus additive
   blocks (listed in A1), so two rounds are the same work with an extra review cycle, and the canvas note on D
   is the most recent direction on the canvas.
4. **Adopt Tailwind for the rebuild.** Faster class authoring. Rejected: the app has no dependencies beyond Next and
   React, CLAUDE.md asks that dependencies follow spec needs, and the token set is small enough that plain CSS with
   variables is shorter than a framework config.
5. **Make the health-check card interactive now.** Closer to the final product. Rejected: nothing consumes the
   answer yet, it adds a client component and a second primary button, and the artboard's controls are drawn, not
   functional.

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Unverified firm numbers go live (350+, 100%, 172/38, 24 hrs) | `numbers.ts` flags; badge visible on every deployment except production; `check:home --site-env production` fails if any unverified figure renders; launch blocker in the handoff |
| Reviewer and client names and logos shown without permission | No photos or logos ship; reviews keep the names the canvas marks verified; the handoff lists each confirmation needed |
| Page weight and layout shift on phones | Two images total (157 KB), fonts subset by `next/font` with swap, CSS-only marquee, inline SVG solid; `check:home` enforces 1.5 MB total and 400 KB images; Lighthouse mobile measured in Phase 9 with targets LCP 2.5 s and CLS 0.1 |
| Stub pages become a soft-404 farm for the role-name searches the page exists for | Stubs are static, `noindex`, limited to the routes map, and never echo input |
| Email addresses leak through URLs or logs | Forms post to server actions; addresses are validated and discarded; nothing is put in a query string |
| Three design systems keep drifting | `tokens.css` is the only color source for `app/home/**`, `app/page.tsx`, the stub and `Brand.tsx`; `check:tokens` fails on any raw color or font-family there. The portal keeps its own variables in `globals.css`, by design |
| Fee language drifts onto client-facing pages | `check:home` scans rendered text for fee, margin, take rate, split, all-in, take-home and "you pay only when", allowing only phrasings that state companies pay no fee ("No fees for companies", "no fee on top", "no login, no fee") and rejecting any number after them |
| Moving content without a stop control fails WCAG 2.2.2 | Marquee and rotator each have a pause button and stop under reduced motion; `check:home` asserts no infinite animation runs with reduced motion on |
| The health-check button promises a product that does not exist | The band is static and honest about "Start the check" leading to a page that says the check is being built; the hero button stays because the canvas note puts it there; handoff flags it |

### 6.1 Security

The page takes input in two places (email forms) and both go to server actions that validate and discard. No
input is rendered back. The stub route renders only titles from a compile-time map and ignores query strings
except the enumerated `for` value. No cookies, storage or third-party scripts are added. Content Security Policy
is unchanged and out of scope.

## 7. Implementation plan

Tickets in `docs/tickets/homepage-d/` map to these phases. Each ticket ends with `npx tsc --noEmit`,
`npm run check:tokens` and `npm run check:home` passing. File boundary for the whole plan: `app/layout.tsx`,
`app/page.tsx`, `app/globals.css` (remove the dead landing rules only), `app/tokens.css`, `app/Brand.tsx`,
`app/home/**`, `app/[...slug]/page.tsx`, `app/thanks/page.tsx`, `public/home/**`, `scripts/check-home.mjs`, `scripts/check-tokens.mjs`,
`package.json` (scripts and the `axe-core` devDependency), `CONSTRAINTS.md`, `CLAUDE.md`, `docs/**`.

1. Shell: fonts, tokens import, `Brand` retokenised, `links.ts`, `numbers.ts`, `logos.ts`, SiteHeader,
   SiteFooter, stub route, `page.tsx` replaced wholesale (header, an empty main, footer), `check:home` gains the
   link-resolution and 404 checks. The old landing is gone at the end of this phase.
2. ResearchBar, Hero, FirmNumbers, LogoMarquee.
3. ThreeRoads, GtmEvolving.
4. Solutions, WaysToWork, HowItWorks.
5. HealthCheckBand, InTheirWords.
6. Assessment, Outcomes, ValidationStrip.
7. FeaturedResearch, Resources, Newsletter, server actions, `/thanks`.
8. ForOperators, Faq, ClosingBand, metadata, dead CSS removed from `globals.css`.
9. Verification: doubt review of every claim, Lighthouse, two-axis code review, fixes.
10. Records: ADR, handoff, PR body.

Phases 2 to 8 depend only on phase 1 and may run in parallel.

## 8. Test plan

Automated, in `scripts/check-home.mjs` (Playwright loaded from the machine-wide install; the script exits with a
clear message if Playwright is missing; `axe-core` is a devDependency so the accessibility opinion is external):

- At 1440 by 900 and 390 by 844: zero console errors or warnings; `scrollWidth` equals `innerWidth`; every image
  has `alt`; exactly one `h1`; no heading level skipped; no link with empty or `#` href; no fee language outside
  the allowed phrasings; zero critical or serious axe violations; total transfer under 1.5 MB and images under
  400 KB when run against a production build (`--url`).
- Every internal `href` on `/` returns 200; `/no-such-page` returns 404.
- Unverified figures always carry `data-unverified`. With `--site-env production` the check fails if any renders;
  without it, the number of badges must equal the number of flagged figures. The production check therefore
  fails until every first-party figure is confirmed, which is the intended launch gate.
- Under `prefers-reduced-motion: reduce`, no infinite animation is running.
- The validation strip is absent from the DOM while its data has no real entries.

Manual, recorded in the handoff: keyboard through the header menus and drawer (Escape closes, focus returns),
the rotator's pause button, the FAQ accordion, and both forms reaching `/thanks`.
