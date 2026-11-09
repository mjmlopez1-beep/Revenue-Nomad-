# Homepage D: two-axis code review record

Diff reviewed: `8b2c307...HEAD` on 2026-11-09, by two fresh-context subagents (Standards: repo standards plus
the Fowler smell baseline; Spec: `docs/specs/homepage-d.md` and the design). Dispositions applied in the same
session unless marked follow-up.

## Standards axis

| Finding | Disposition |
|---------|-------------|
| Floor: empty `catch {}` in `scripts/check-home.mjs` | Fixed: every catch records or counts what it swallowed |
| Production gate vacuous: `data-unverified` was stripped with the badge, so `--site-env production` could never fail | Fixed: the attribute is always present on unverified figures; only the badge depends on the environment. The production check now fails (20 figures) until they are confirmed, which is the gate's purpose |
| Figures bypassing the flag through `facts.*` and prose (research bar, footer cite line, "every company would hire again") | Fixed with `FlagIf`, which wraps prose in the same attribute and badge; `numbers.ts` now derives shared values from `facts` so they cannot drift; the FAQ interpolates `facts.responseHours` and `facts.daysPerWeek` |
| Literal radii in five stylesheets | Fixed: tokens only; the token guard now rejects literal `border-radius` px values |
| "no login, no fee" and "No fee on top" pass the fee scan | Accepted: both state that companies pay no fee, which is the allowed class under decision D1; `CONSTRAINTS.md` and the design now say so; the allowlist rejects any number after the phrase |
| Duplicated large-h2 rule in 8 section stylesheets; eyebrow, link and card shells re-rolled per section; email form duplicated; section padding handled two ways | Follow-up (`docs/handoff.md`): hoist `.rn-h2--lg`, `.rn-card`, `.rn-email-form` into `home.css` and delete the copies, with screenshots before and after. Not done now to avoid an unreviewed visual change across 13 files at the end of the session |
| Speculative generality: `LogoMarquee` `logos` prop, `ValidationStrip` exported type, `CUBE_LAYER_LABELS` export | Follow-up; harmless today |
| `aria-live="polite"` on an auto-rotating stage | Fixed: live only while paused or held |
| Raw `<a>` in `ValidationStrip` | Fixed: `next/link` |
| Invalid email redirects without a message; `/thanks` promises delivery before sending is wired | Follow-up with the form wiring (handoff launch blocker 4) |
| Playwright resolved through NODE_PATH, not `package.json` | Accepted and documented: `check:home` is a task-end gate on machines with Playwright; it exits with an install message when missing; CI runs `tsc` and the build |

## Spec axis

| Finding | Disposition |
|---------|-------------|
| Script should exit with a clear message without Playwright | Fixed |
| Preview badges never asserted | Fixed: outside production, badge count must equal flagged-figure count |
| FAQ hard-coded figures | Fixed (above) |
| Unbadged figures in prose | Fixed (above) |
| Outside click did not return focus to the menu button | Fixed |
| Third review has no "Verified review" line | Matches the artboard (ticket 05 confirmed); no change |
| `/thanks` as its own route; third Solutions menu group and `/operators/browse` route; marquee as a whole client component | Accepted and documented in the design (4.5, 4.3) and ticket notes; the artboard footer has the third group and the "Browse operator profiles" pill needs a destination |
| Research bar carries the report's figures | Matches the artboard; now flagged through `FlagIf` |
| Fee allowlist wider than "No fees for companies" | Accepted (above), design and constraints reworded |
| `devNoise` filter masked a `next/image` warning | Fixed: filter removed; the production check shows zero console warnings |
| Metadata description is two sentences | Accepted; design 4.7 updated |
| Hero secondary action scrolls to the band instead of opening `/check` | Accepted: the artboard links `#health-check`; Goal 1 reworded |
| "What it costs" row says hours a month | Accepted; design row 10 updated to match the claims reconciliation |
| Placeholder boxes rendered when the validation data was mixed | Fixed: only real entries ever render |

Result after fixes: `tsc` clean; `check:tokens` ok; dev `check:home` ok (20 flagged figures, 20 badges);
production build `check:home --url` ok (1,278 KB desktop, 1,251 KB phone, 47 KB / 20 KB images, 0 axe
violations, 0 console warnings); `--site-env production` fails as designed with "20 unverified figure(s)".
