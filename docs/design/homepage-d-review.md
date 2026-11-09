# Homepage D design: Goldfish review record

Four fresh-context reviewers (Elephant-Goldfish Model personas: Skeptical Architect / zoom out, Naive Reader /
comprehension, Hostile Design Critic, Pragmatic Tech Lead / implementation readiness) audited the first draft of
`homepage-d-design.md` on 2026-11-09. They saw only the document, the decisions file, the repository and the
artboard; none saw this conversation. Findings below are condensed; the resolution column says what changed in
the revised design (section numbers refer to the revised document).

| # | Reviewer | Severity | Finding | Resolution |
|---|----------|----------|---------|------------|
| 1 | Comprehension | Blocker | Design rests on nine decisions in another file; spec must stand alone | A1 to A9 summarised in 1.1 |
| 2 | Readiness | Blocker | No section copy exists in the repo; implementers would invent text | Content appendix extracted from the artboard into `homepage-d-content.md` |
| 3 | Readiness | Blocker | `numbers.ts` and `links.ts` had no shape, keys or paths | 4.3 defines both; ticket 01 carries the full key list |
| 4 | Readiness, Critic | Blocker | `check-home.mjs` could not import Playwright; no `check:home` script; no fee allowlist | Script written and run (loads Playwright via require, allowlist for "No fees" phrasings); `package.json` scripts added; 8 documents it |
| 5 | Readiness | Blocker | `CONSTRAINTS.md`, spec and tickets referenced but absent | All three now exist |
| 6 | Critic | Blocker | Email forms had no mechanism; GET would leak addresses to logs | 4.6: server actions validate and discard, redirect to `/thanks` |
| 7 | Critic | Blocker | "confirm" badge keyed on `NODE_ENV` is invisible on Vercel previews | Keyed on `NEXT_PUBLIC_SITE_ENV`; `check:home --site-env production` fails on any unverified figure |
| 8 | Zoom out | Major | Goal 4 unmeetable: figures live inside prose in six sections | Goal 4 narrowed to stat blocks, FAQ, footer, hero lede; prose interpolates the same constants |
| 9 | Zoom out | Major | Health-check card and cost check invented stateful controls the artboard draws statically; nothing consumes answers; breaks one-primary-button rule | Band is static with one primary button (4.1 row 10, alternative 5) |
| 10 | Zoom out, Readiness, Critic | Major | `Brand.tsx` reuse unresolved; hard-coded hex would fail `check:tokens` | Retokenised, added to the file boundary (4.2) |
| 11 | Zoom out, Critic, Readiness | Major | Importing `home.css` from the layout and changing `globals.css` fonts alter the portal, contradicting a non-goal | `home.css` imported per route; layout only adds font variables; portal untouched (4.2) |
| 12 | Zoom out | Major | Placeholder policy inconsistent: strip hidden but marquee of grey boxes and placeholder portraits shown | A5 rewritten: no placeholder boxes; logos render only when files exist (six minimum); people are initials |
| 13 | Critic, Zoom out | Major | Stub pages are indexable thin pages; query variants unbounded | Static params from the routes map, `dynamicParams = false`, `noindex`, no query rendering (4.5) |
| 14 | Critic | Major | No head metadata for a page built for role-name searches | 4.7 |
| 15 | Critic | Major | Auto-moving marquee and rotator with hover-only pause fail WCAG 2.2.2 on phones; radio-driven rotator fights its animation | Both get pause buttons; rotator is a client component with `aria-live`; Goal 5 amended |
| 16 | Critic, Comprehension | Major | Lighthouse phase contradiction and no thresholds | Phase 9; LCP 2.5 s, CLS 0.1, weight budgets in `CONSTRAINTS.md` |
| 17 | Critic, Comprehension, Zoom out | Major | Alternatives cited "the founder's comments" without a link; rejected a WebGL hero that is not on this branch | Alternatives cite the canvas note by title and URL; branch facts corrected |
| 18 | Comprehension | Major | Rate Index, handoff, seo-spec, "three design systems", Homepage C's seven blocks, 172/38, glass mark, cube solid, pillars all undefined | 1.1, 4.8; seo-spec reference dropped |
| 19 | Comprehension | Major | Goal 1 promised a two-minute check the non-goals exclude | Goal 1 reworded |
| 20 | Comprehension, Critic | Major | No security section | 6.1 |
| 21 | Readiness | Major | Header behaviour unspecified | 4.4 |
| 22 | Readiness | Major | Tests not enumerated; manual steps as acceptance | 8 enumerates automated checks; manual steps go to the handoff |
| 23 | Readiness | Major | Old landing and new sections would coexist across phases | Phase 1 replaces `page.tsx` wholesale |
| 24 | Zoom out, Readiness, Comprehension | Nit | Weeds (font weights, data shapes, selectors) in a design doc; unnamed scripts; Updated date source; ResearchBar href | Shapes moved to tickets; scripts named; date and href live in the data files |

Open items the review surfaced that are not design changes, carried to `docs/handoff.md`:

- Confirm the four firm numbers, the FAQ price range and the "What it costs" row.
- Permissions: Eric B. (myHR Partner), Trista Kempa (Ferry), Neil Trickett (Practice Promotions), Grow Pro
  Agency, and the thirteen client logos.
- Wire the two server actions to the email tool; add the Open Graph image; add JSON-LD.
- Build the Revenue Health Check (seven questions) and the Rate Index page.
