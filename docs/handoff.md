# Handoff: Homepage D build

For the next session (human or agent) picking up the marketing site. Written 2026-11-09 on branch
`ccr-f94c4801-enfu3y`. Read `CLAUDE.md` first, then this file.

## Where the work stands

- The homepage at `/` is Homepage D rebuilt as Next.js sections under `app/home/` (see `docs/design/homepage-d-design.md`
  section 4.1 for the section list, `docs/tickets/homepage-d/` for what each slice delivered).
- Quality gates: `npm run check` runs `tsc`, the token guard and the Playwright + axe smoke check. Results of the
  last run are in the "Verification" section below.
- Everything the founder has not confirmed is flagged `verified: false` in `app/home/content/numbers.ts` and shows a
  gold "confirm" badge on every deployment except production (`NEXT_PUBLIC_SITE_ENV=production`).

## Decisions awaiting the founder (A1 to A9)

`docs/design/homepage-d-decisions.md`. Each stands as an assumption. An override changes `docs/specs/homepage-d.md`
first, then the code. The ADR (`docs/adr/0001-homepage-d-rebuild.md`) moves from Proposed to Accepted once confirmed.

## Launch blockers (not done in this build, by design)

1. **Confirm the figures.** Every `verified: false` entry in `numbers.ts`. Flip the flag once confirmed; the badge disappears.
   The claims review (`docs/design/homepage-d-claims.md`) lists which third-party figures matched their sources.
2. **Permissions.** Reviews name Eric B. (myHR Partner), Trista Kempa (Ferry), Neil Trickett (Practice Promotions);
   the outcomes name Grow Pro Agency. The logo list names thirteen clients. Get written OK before adding photos or
   logo files.
3. **Logos.** Drop approved files into `public/home/logos/` and set `file`, `width`, `height` on each entry in
   `app/home/content/logos.ts`. The marquee appears once six have files.
4. **Forms.** `app/home/actions.ts` validates and discards the email. Wire `requestReport` and `subscribe` to the email
   tool (send the PDF, add to the list) and keep the redirect to `/thanks`.
5. **Pages behind the stubs.** Every path in `app/home/content/links.ts` except `/` and `/portal` is a stub. Build them
   in the order the site map artboard suggests: Talk to us, the 2-minute check, Rate Index, the four solution pages.
6. **SEO extras.** Open Graph image (1200 by 630), JSON-LD (Organization, ProfessionalService, FAQPage), sitemap page.
7. **Validation strip.** Fill at least one real "As seen in / Rated on" entry or delete the section data.
8. **Production flag.** Set `NEXT_PUBLIC_SITE_ENV=production` only on the production deployment.

## Manual checks still to do by a person

- Keyboard through the header menus and the phone drawer: Escape closes, focus returns to the button.
- Pause buttons on the logo marquee and the review rotator; everything still with OS reduced motion on.
- The FAQ accordion, both email forms reaching `/thanks`.
- Compare `/` against the artboard at 1440 and 390 side by side.

## Suggested skills for the next session

- `/code-review` (Matt Pocock) against `main` before merging.
- `/frontend-ui-engineering` and `/incremental-implementation` for the pages behind the stubs.
- `/to-spec` then `/to-tickets` for the Revenue Health Check (seven questions, one per pillar).
- `/security-audit` once the forms send real email.
- `/performance-optimization` with the Lighthouse numbers recorded in `CONSTRAINTS.md`.

## Verification (2026-11-09, this build)

- `npx tsc --noEmit`: clean. `npm run check:tokens`: ok (56 files).
- `npm run check:home` (dev server, 1440 and 390): 0 console errors, 0 axe violations of any impact, no horizontal
  scroll, one h1, no heading skips, every internal link 200, unknown path 404, no fee language, 16 unverified
  figures rendered with badges.
- `npm run build`: `/` static, 116 KB first-load JS, 35 static pages (28 stubs).
- `node scripts/check-home.mjs --url` against `next start`: 1,265 KB desktop / 1,238 KB phone total transfer,
  47 KB / 20 KB images, passes the 1.5 MB and 400 KB budgets.
- Production flag: a build with `NEXT_PUBLIC_SITE_ENV=production` renders 0 badges and passes
  `check-home --site-env production`.
- Lighthouse 12.6.1 mobile against the production build: performance 94, accessibility 100, best practices 100,
  SEO 100, CLS 0, TBT 150 ms, LCP 2.9 s (target 2.5 s). The LCP element is the hero h1; 84% of its time is
  render delay from render-blocking CSS and the display font. Follow-up: inline the above-the-fold CSS or
  split the section stylesheets so the hero's CSS loads first, and re-measure on the Vercel preview.
- Doubt review of every figure: `docs/design/homepage-d-claims.md` (three third-party figures confirmed against
  primary sources; every first-party figure still flagged).
- Two-axis code review (standards, spec): see the PR body for findings and dispositions.
