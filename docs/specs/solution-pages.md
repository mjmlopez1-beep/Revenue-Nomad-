# Spec: the four "Solve a problem" pages (/problems/*)

Status: BUILT 2026-11-09 from the artboards "Scaling beyond founder-led sales", "Pipeline beyond your network",
"A forecast the board believes" and "AI that pays for itself" (desktop and phone).

## One template, four content modules

`app/problems/SolutionPage.tsx` renders every page in artboard order: hero with the "Is this you? / Sound familiar?"
checklist, optional "What the data says", "Why it happens" (statement plus three reasons), "The fix we place"
(the usual answer and an alternative, each with a price line and a link), optional extras (the Pipeline page's
five-step method, the now-versus-then comparison table and three engagement results), common questions, the
closing band. Copy lives in `app/problems/content.ts`; the route is `app/problems/[slug]/page.tsx` with static
params for the four slugs.

## Figures

- Price lines come from the Rate Index data (`data/rate-index.json`): the VP of Sales range from Revenue Nomad
  direct contracts, and category medians with n for Marketing, Revenue Operations and AI GTM, with the median
  month where five or more engagements exist. The artboards' "$8k - $20k" (CMO) and "$6k - $14k" (RevOps) had no
  contracts behind them in the data source, so the pages quote the index instead.
- "97% of operators use AI in delivery" and the AI GTM demand trend (3.6 of 5, n=7) are computed from the survey.
- The founder-handoff share is computed by a keyword match on the reason operators gave for being brought in
  (founder, CEO, owner): 9% of 74. The artboard said "1 in 4"; the data source does not support that figure, so the
  page shows the computed one with its method in the source line.
- "3 of 11 contracts", "7 of 20" and "6 of 20 inbound requests" and the Clarus Care 833% figure are founder claims
  not derivable from the exported tabs (the inbound requests live in the Demand Scan sheet), so they carry
  `verified: false` and the confirm badge until confirmed.

## Left out

- The "Why this happens, in two minutes" video slots: no video assets exist.
- Hero and card imagery: none shipped (decision A5).

## Visual treatment (2026-11-09 redesign)

The owner's review of the first build: "Template is so boring. It's all grey. Create sections. Use the gold
color. Add illustrations." The template now reads as banded sections, in the same order, with the copy modules
untouched. Tokens only; gold is an accent tied to the method, never a wash.

| Section | Band | Treatment |
|---------|------|-----------|
| Hero | white | Copy left, the problem's card art right (`public/home/cards/solution-*.webp`, the homepage cover for the same problem, `next/image`, decorative `alt=""`) in a rounded frame with a short gold rule at its foot |
| Sound familiar / Is this you? | white | One card with a 4px gold header rule, the signs in two columns, the note in forest |
| What the data says | mist | Three display-font figures, 60px, underlined in gold, hairlines between |
| Why it happens | night (`rn-band--dark`) | Gold eyebrow, white statement, the problem's isometric motif beside it (340px, `role="img"` with a label), three numbered cards with gold display numbers |
| The fix we place | white | Two cards carrying the role pages' art strip (`Role.css .rp-read-art`: dark band, brand line, kicker); the primary card's strip ends in a gold rule. Under them "Pillars this touches": the Revenue Health Diagnostic pillars the fix touches as gold-numbered chips (the pillar's number among the seven, `pillarLabel` from `app/check/content.ts`) linking to `/revenue-health-diagnostic`, with "The Diagnostic scores these first." |
| The method (pipeline only) | forest (`rn-band--forest`) | Heading and note at the left, the five steps as a timeline with gold discs and a gold hairline, results in leaf-pale pills |
| The comparison | mist | The table in its scroll region on white, the "now" column's header carrying a gold top rule |
| Results | white | Same display-font stats, underlined in gold |
| Common questions | mist | Two columns of white cards |
| Closing band | unchanged | |

Motifs (`app/problems/ProblemMotif.tsx`, the Diagnostic's grid and face kinds from `app/diagnostic/iso.tsx`,
fills under `.solp-motif` in `Solution.css`): founder-led sales, a row of five leaf blocks standing on its own
with one gold block stepped out in front; pipeline, scattered ghost blocks funnelling into a tight leaf row that
ends in a gold block; forecast, a wall five wide and three high shaded l1 to l3 by level with a thin gold slab
floating above it; AI, a four by four leaf grid with four gold blocks set inside it.

Content fields added to `Solution` (all optional): `art` (file, width, height, position), `motif`
(`founder | pipeline | forecast | ai`) and `pillars` (founder-led sales: GTM Design, Team Enablement, Operating
Rhythm; pipeline: GTM Design, Operating Rhythm, Revenue Insights; forecast: Revenue Insights, Data Foundations,
Operating Rhythm; AI: AI, Revenue Technology, Team Enablement). Decision A5 (no hero imagery) is superseded for
these pages by the owner's request. Phone: everything stacks, the art drops to 220px, the motif to 280px, the
table keeps its scroll region; the badge on a 60px figure is fixed at 11px so the figure does not wrap.

## Revision 2026-11-09: a drawing in the hero

Owner's gallery comment on the forecast page: "Feels out of place. Maybe design a custom illustration for these header
heros." The stock card photos (the homepage's covers) are gone from the problem pages. Each hero now carries a drawing in
the Diagnostic's isometric language (`ProblemMotif.tsx`, `variant="hero"`), on a mist panel with a faint isometric grid,
captioned "The problem, drawn" plus one line: founder-led, a slab of revenue balanced on one gold block ("Everything rests
on one person"); pipeline, a tight cluster with a row that fades to outlines before the gold block ("The network ends. The
pipeline has to keep going."); forecast, five columns like a bar chart under one gold slab ("One number the board can
hold"); AI, a platform with one gold block set into it and two dashed blocks floating beside it ("Plugged into the engine,
not bought beside it"). The smaller motifs in the "Why it happens" band stay. The card photos still serve the homepage.

## Revision 2026-11-09 (later): text-led hero

Owner's gallery comment on the founder-led page: "An image on header here feels out of place. What would Skaled or SBI or
McKinsey have here." The hero is now text only: eyebrow, a 64px headline, the lede, the two buttons and the fine print, with
the signs card below as before. The drawings made for the hero moved to the "Why it happens" band, replacing the smaller
motifs, with their captions in gold on the night band.
