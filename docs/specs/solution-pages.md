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
