# Constraints

Last reviewed: 2026-11-09 by Claude (autonomous session). Owner to confirm: Matt Lopez.
The founder was not live when this was written, so the Floor is enforced and the dimensions below carry the
skill's defaults. Questions left for a human are at the end.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error` without a reason, `eslint-disable`.
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` standing in for code.
- No skipped or deleted tests without a reason in the commit message.
- No secrets in source. `.env*` stays ignored.
- This file does not get weakened to make a change pass.

## Design (the marketing site)

These are the rules the homepage mockups kept breaking across three visual systems. They are checked by
`npm run check:tokens` and `npm run check:home`.

| Rule | Reason | Checked by |
|------|--------|-----------|
| No raw color in `app/home/**` or `app/page.tsx`: every color is `var(--rn-*)` from `app/tokens.css` | The Homepage D artboard used 55 hex values for an 8-color palette | `check:tokens` |
| Two type families only: Red Hat Display (UI, body) and DM Serif Display (headlines), loaded via `next/font` | Fonts are chosen, never defaulted (prototype DESIGN.md rule 2) | `check:tokens` (no `font-family:` outside tokens) |
| Works at 390px wide with no horizontal scroll | Phone artboard is 390 wide; horizontal scroll is the first thing a buyer notices | `check:home` |
| One primary button per section | Prototype DESIGN.md: one primary action per screen | review |
| Text contrast 4.5:1 (3:1 at 24px and above) | WCAG AA; the mockup's grey labels on mist were close | axe in `check:home` |
| Every image has alt text; decorative images use `alt=""` | Accessibility and the canvas's "live text, never an image" footer rule | `check:home` |
| Every moving element stops under `prefers-reduced-motion: reduce` | Canvas spec for the marquee and review rotator | `check:home` (emulates the media query, asserts no running animations) |
| Client-facing pages never say fee, margin, take rate, split, all-in, take-home, or "you pay only when" | Founder decision D1: companies pay no fees, the rate is the price | `check:home` text scan |
| Every number shown names a source or carries `verified: false` and a visible dev badge | Canvas note: "confirm every firm number before launch" | `check:home` (fails in production build if any unverified number renders without `data-unverified`) |
| No link with `href="#"` or empty href | Every link resolves; the stub route exists for missing pages | `check:home` |
| Heading levels do not skip | Screen-reader outline | `check:home` |

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors | `npx tsc --noEmit` | every edit, CI |
| Build | `next build` succeeds | `npm run build` | task end, CI |
| Console | Zero console errors or warnings on `/` at 1440 and 390 | `npm run check:home` | task end |
| Accessibility | Zero critical or serious axe-core violations on `/` | `npm run check:home` (axe-core injected via Playwright) | task end |
| Page weight | Total transfer for `/` on first load ≤ 1.5 MB, images ≤ 400 KB | `npm run check:home` | task end |

Every row names the command that produces the verdict. A rule with no command in this column is a review item,
not a constraint.

## Measured, not yet enforced

Measured 2026-11-09 with Lighthouse 12.6.1 (mobile preset, simulated throttling) against `next start` of the
production build, on the build machine. Re-measure on the Vercel preview and update.

| Metric | Today | Direction |
|--------|-------|-----------|
| Lighthouse performance (mobile, `/`) | 94 | must not fall |
| Lighthouse accessibility / best practices / SEO | 100 / 100 / 100 | must not fall |
| LCP (mobile) | 2.9 s (target ≤ 2.5 s; the LCP element is the hero h1, 84% render delay from render-blocking CSS and the display font; follow-up in docs/handoff.md) | must not rise |
| CLS | 0 | must not rise |
| Total blocking time | 150 ms | must not rise |
| Total transfer, `/` first load (production) | 1,265 KB desktop, 1,238 KB phone | must not grow |
| Image transfer, `/` | 47 KB desktop, 20 KB phone | must not grow |
| First-load JS for `/` | 116 KB (`next build`) | must not grow |

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
| none | | | | | |

## Open questions for the owner

1. Block or warn when `check:home` fails mid-task? Default here: block at task end, warn mid-task.
2. Should coverage apply? The site has no tests today and no logic worth unit-testing yet; not enforced.
3. Lighthouse needs a running URL. Run it against the Vercel preview and record the numbers above.
