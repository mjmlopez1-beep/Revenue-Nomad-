# 01: Shell, data modules, header, footer, stub route

**What to build:** A visitor can open `/` and every path in the links map and see the same header and footer, with menus and a phone drawer that work by keyboard, and unknown paths return a 404. The old landing is gone.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Fonts load via `next/font/google` (Red Hat Display 400/500/600/700 and italic 500; DM Serif Display 400 and italic) and expose `--font-red-hat` and `--font-dm-serif` on `<html>`; `app/tokens.css` imported from the layout
- [ ] `app/Brand.tsx` uses `var(--rn-forest)` and `var(--rn-leaf-strong)`; `check:tokens` scope includes it
- [ ] `app/home/content/links.ts` exports `routes` (path to title for: /solutions/vp-sales, /solutions/cmo, /solutions/revops, /solutions/ai-gtm, /problems/founder-led-sales, /problems/pipeline, /problems/forecast, /problems/ai, /engage/diagnostic, /engage/fractional, /engage/interim, /engage/full-time, /research/state-of-fractional-gtm-2027, /research/rate-index, /case-studies, /guides, /guides/hiring-a-fractional-vp-of-sales, /guides/where-ai-fits-in-sales, /resources, /check, /about, /operators, /operators/join, /talk, /thanks, /privacy, /terms, /sitemap), `menus` (Solutions: hire a leader and solve a problem groups; Resources: research, rates, case studies, guides), and `footerColumns`
- [ ] `app/home/content/numbers.ts` exports every figure with `{ value, label, source?, verified }` and `updated`; `app/home/content/logos.ts` exports the thirteen client names with optional `file`
- [ ] `SiteHeader` per design 4.4; `SiteFooter` per content appendix section 23; both used by `/` and the stub
- [ ] `app/[...slug]/page.tsx` static stub per design 4.5 with `noindex`; `/thanks` variants
- [ ] `app/page.tsx` renders header, empty `<main>`, footer and imports `app/home/home.css`
- [ ] `scripts/check-home.mjs` additionally fetches every internal href found on `/` and expects 200, expects 404 from `/no-such-page`, accepts `--site-env production` and fails on `data-unverified`, and fails if a `[data-section="validation"]` element exists while its data is placeholder-only
- [ ] `npx tsc --noEmit`, `npm run check:tokens`, `npm run check:home` pass
