# Handoff: Homepage D build

For the next session (human or agent) picking up the marketing site. Written 2026-11-09 on branch
`ccr-f94c4801-enfu3y`. Read `CLAUDE.md` first, then this file.

## Where the work stands

- The homepage at `/` is **Homepage C** (founder decision 2026-11-09) with a hero button to the 2-minute check, built
  from the Next.js sections under `app/home/` (`docs/design/homepage-d-design.md` 4.1; D's seven extra sections were
  built, then removed from the page and remain in git history).
- The 2-minute Revenue Health Check lives at `/check` (`app/check/`, spec `docs/specs/revenue-health-check.md`, ticket 11).
- Talk to us lives at `/talk` (`app/talk/`, spec `docs/specs/talk-to-us.md`, ticket 12).
- The Fractional GTM Buyer's Guide 2027 (the State of Fractional report, rebranded) lives at
  `/fractional-gtm-buyers-guide-2027` (`app/fractional-gtm-buyers-guide-2027/`, `app/guide/`, spec `docs/specs/buyers-guide.md`,
  ticket 15). Three chapters are open; the rest open with a name and email, recorded through `app/leads/record.ts`
  (`HUBSPOT_GUIDE_FORM_ID`). The old report URL redirects. Every dataset figure in the guide reads from `data/rate-index.json`
  through `app/guide/content/figures.ts`, so the guide, the Rate Index page and the homepage move together on a rebuild.
- The four "Solve a problem" pages live at `/problems/*` (`app/problems/`, spec `docs/specs/solution-pages.md`, ticket 14), one
  template with four content modules; prices read from the Rate Index data.
- The Rate Index lives at `/research/rate-index` (`app/research/rate-index/`, spec `docs/specs/rate-index.md`, ticket 13).
  Every figure, and the homepage's rate figures, derive from `data/rate-index.json`, built by
  `scripts/build-rate-index.mjs` from exports of the research Google Sheet. Refresh procedure in the spec. Both forms record leads through
  `app/leads/record.ts`: HubSpot form when configured, else a JSON file under `RN_DATA_DIR`.
- Quality gates: `npm run check` runs `tsc`, the token guard and the Playwright + axe smoke check. Results of the
  last run are in the "Verification" section below.
- Everything the founder has not confirmed is flagged `verified: false` in `app/home/content/numbers.ts` and shows a
  gold "confirm" badge on every deployment except production (`NEXT_PUBLIC_SITE_ENV=production`).

## Decisions: A1 overridden (ship C), A3 confirmed; A2 and A4 to A9 awaiting the founder

`docs/design/homepage-d-decisions.md`. Each stands as an assumption. An override changes `docs/specs/homepage-d.md`
first, then the code. The ADR (`docs/adr/0001-homepage-d-rebuild.md`) moves from Proposed to Accepted once confirmed.

## Launch blockers (not done in this build, by design)

1. **Confirm the figures.** Every `verified: false` entry in `numbers.ts`. Flip the flag once confirmed; the badge disappears.
   Rate figures (median rate, rate count, VP of Sales range, FAQ price range, results inside 60 days) are now computed
   from the research data source and marked verified by construction.
   The claims review (`docs/design/homepage-d-claims.md`) lists which third-party figures matched their sources.
2. **Permissions.** Reviews name Eric B. (myHR Partner), Trista Kempa (Ferry), Neil Trickett (Practice Promotions);
   the outcomes name Grow Pro Agency. The logo list names thirteen clients. Get written OK before adding photos or
   logo files.
3. **Logos.** Drop approved files into `public/home/logos/` and set `file`, `width`, `height` on each entry in
   `app/home/content/logos.ts`. The marquee appears once six have files.
4. **Forms.** `app/home/actions.ts` validates and discards the report email; wire `requestReport` to the email tool and
   keep the redirect to `/thanks`. The Revenue Health Check (`app/check/actions.ts`) posts to HubSpot once
   `HUBSPOT_CHECK_FORM_ID` is set, and Talk to us (`app/talk/actions.ts`) once `HUBSPOT_TALK_FORM_ID` is set; the
   setup checklists are in `docs/specs/revenue-health-check.md` and `docs/specs/talk-to-us.md`.
5. **Pages behind the stubs.** Every path in `app/home/content/links.ts` except `/`, `/portal`, `/thanks`, `/check` and
   `/talk`, `/research/rate-index`, `/problems/*` and the Buyer's Guide is a stub. Next in the site map's order: the four role pages (VP of Sales, CMO,
   RevOps, AI GTM leader), the Diagnostic and the three other engagement pages, case studies, the report page.
6. **SEO extras.** Open Graph image (1200 by 630), JSON-LD (Organization, ProfessionalService, FAQPage), sitemap page.
7. **Validation strip.** Fill at least one real "As seen in / Rated on" entry or delete the section data.
8. **Production flag.** Set `NEXT_PUBLIC_SITE_ENV=production` only on the production deployment.

## Preview deployments on Vercel

The repository already carries `vercel.json` (the daily crawl cron) and a CI build on every push. A Vercel preview
needs no token in the repo: import the GitHub repository at vercel.com/new (framework Next.js, defaults are
right), and Vercel deploys every branch, including `ccr-f94c4801-enfu3y`, at its own preview URL. Set these in
the project's Environment Variables when ready: `HUBSPOT_PORTAL_ID` (48733774), `HUBSPOT_CHECK_FORM_ID`,
`HUBSPOT_TALK_FORM_ID`, `HUBSPOT_GUIDE_FORM_ID` (leads fall back to the ephemeral `/tmp` store until set),
`CRON_SECRET`, and `NEXT_PUBLIC_SITE_ENV=production` only on the production deployment, since it hides the
confirm badges and makes `check:home --site-env production` fail while unverified figures remain. Node 22.

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
  scroll, one h1, no heading skips, every internal link 200, unknown path 404, no fee language, 20 unverified
  figures rendered, each with its badge.
- `npm run build`: `/` static, 116 KB first-load JS, 35 static pages (28 stubs).
- `node scripts/check-home.mjs --url` against `next start`: 1,278 KB desktop / 1,251 KB phone total transfer,
  47 KB / 20 KB images, passes the 1.5 MB and 400 KB budgets.
- Production gate: a build with `NEXT_PUBLIC_SITE_ENV=production` renders 0 badges, and
  `check-home --site-env production` fails with "20 unverified figure(s)" until they are confirmed in `numbers.ts`.
  That failure is the launch gate working; do not weaken it.
- Lighthouse 12.6.1 mobile against the production build: performance 94, accessibility 100, best practices 100,
  SEO 100, CLS 0, TBT 150 ms, LCP 2.9 s (target 2.5 s). The LCP element is the hero h1; 84% of its time is
  render delay from render-blocking CSS and the display font. Follow-up: inline the above-the-fold CSS or
  split the section stylesheets so the hero's CSS loads first, and re-measure on the Vercel preview.
- Doubt review of every figure: `docs/design/homepage-d-claims.md` (three third-party figures confirmed against
  primary sources; every first-party figure still flagged).
- Two-axis code review (standards, spec): `docs/design/homepage-d-code-review.md`. Follow-ups it left: hoist the
  duplicated section CSS (`.rn-h2--lg`, card shell, email form) into `home.css`; add an inline error message for an
  invalid email once the forms are wired; the LCP follow-up above.
