# ADR-0001: Rebuild the homepage from the Homepage D mockup as Next.js components on one token set

## Status

Proposed. Becomes Accepted when the founder confirms assumptions A1 to A9 in `docs/design/homepage-d-decisions.md`.

## Date

2026-11-09

## Context

Four homepage mockups (A to D) exist as artboards on the Design canvas "Revenue Nomad - Option D website".
The live homepage in this repository sells the operator job board; the business now sells fractional revenue
leadership to companies with $1M to $200M in revenue. Three visual systems were in play: the canvas (DM Serif
Display and Red Hat Display, forest #285B44), the October static prototype (`public/prototype/DESIGN.md` on
branch `claude/wonderful-darwin-czhsct`: Newsreader, forest #095D42, paper background), and the landing page on
branch `ccr-f2e9ac1f-j1f246` (system fonts, gradient greens, WebGL hero). The Homepage D artboard alone used 55
raw hex values. Nothing in the repository recorded which system wins or why.

## Decision

1. Homepage D is the homepage. Homepage C is treated as history, since D is C plus additive blocks.
2. The page is rebuilt as server-rendered Next.js section components under `app/home/`, not published as the
   artboard's static HTML.
3. The canvas palette and type become the single token set, `app/tokens.css`. Views may use only those
   variables; `scripts/check-tokens.mjs` enforces it. The prototype's product rules (standard fields, money
   copy, voice) continue to apply; its palette does not.
4. Every figure shown comes from `app/home/content/numbers.ts` with a `verified` flag; unverified figures carry
   a visible badge on every deployment except production.
5. Every internal link resolves: destinations not yet built render one static, non-indexed stub.
6. No placeholder imagery ships. Only firm-owned assets (glass mark, report cover) are included; logos appear
   when files exist; people render as initials.
7. Client JavaScript is limited to the header, the marquee pause control and the review rotator. Email forms
   post to server actions that validate and discard.

## Alternatives considered

See `docs/design/homepage-d-design.md` section 5: publishing the artboard HTML, extending the current landing,
building Homepage C first, adopting Tailwind, and making the health-check card interactive now. Each was
rejected for the reasons recorded there.

## Consequences

- One design system, checked mechanically, ends the drift between mockups and code.
- The portal is untouched except that the brand mark reads its two greens from tokens.
- Launch depends on confirming the flagged figures, obtaining permissions for names and logos, wiring the two
  server actions to the email tool, and building the pages behind the stubs. These are listed in `docs/handoff.md`.
- Quality gates (`CONSTRAINTS.md`, `npm run check`) now exist and apply to all future marketing-site work.
