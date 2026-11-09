# Revenue Nomad

Next.js 15 (App Router) + React 19, TypeScript strict, plain CSS. Two surfaces live here:
the **marketing site** (homepage at `app/page.tsx`, built from the "Homepage C" mockup plus the 2-minute check at `app/check/` and Talk to us at `app/talk/`, the Rate Index at `app/research/rate-index/` fed by `data/rate-index.json`, the solution pages at `app/problems/`, the Buyer's Guide at `app/fractional-gtm-buyers-guide-2027/` with its chapters and gate in `app/guide/`) and the
**Operator Portal** (`app/portal`, job board + prospects, backed by `lib/`).

## Commands

- `npm run dev` / `npm run build` / `npm run lint`
- Type check: `npx tsc --noEmit`. Unit tests: `npm test` (scoring for the health check). Everything: `npm run check`.
- Smoke test the homepage at 1440 and 390 with Playwright: `node scripts/check-home.mjs` (after `npm run dev`)

## Read before writing UI

1. `CONSTRAINTS.md`. Do not weaken it to make a change pass.
2. `app/tokens.css` is the only place a color, font or radius is defined. Views use `var(--rn-*)`.
3. `docs/specs/homepage-d.md` is the homepage spec. The visual source is the Design canvas
   "Revenue Nomad - Option D website" (https://claude.ai/artifact/1CosGB9Ef1wMCrX8rt7uqh), artboard
   "Desktop - Homepage D, the lead engine" (`project/HomeEPage.dc.html`) and its phone twin.
4. `docs/adr/` holds decisions. `docs/design/` holds the reviewed design doc.
5. The older static prototype on branch `claude/wonderful-darwin-czhsct` (`public/prototype/DESIGN.md`)
   documents the product rules (standard fields, money copy, voice). Its palette and type are
   superseded by `app/tokens.css`.

## Conventions

- Homepage sections are server components under `app/home/`, one file per section, composed in `app/page.tsx`.
  A section is a `<section>` with an `aria-labelledby` heading. Client components only where there is state
  (menus, the marquee and review controls, the check and Talk to us steppers).
- Fonts load through `next/font/google` in `app/layout.tsx` and are exposed as `--font-dm-serif` and `--font-red-hat`.
- Images live in `public/home/` and render through `next/image` with explicit width and height.
- Copy voice: plain, specific, active, written from the reader's side. Buttons say what happens.
  No em-dash asides, no hype, no emoji. Client-facing pages never mention a fee, margin, split or take-home;
  the price is the operator's rate and "No fees for companies."
- Every number shown to a visitor names its source or is marked as a placeholder to confirm before launch.

## Boundaries

- Never commit `.env*` or secrets. `data/jobs.json` is generated.
- Add a dependency only when the spec needs it; the site has none beyond Next and React.
- Ask before changing `lib/` data shapes or the portal.
