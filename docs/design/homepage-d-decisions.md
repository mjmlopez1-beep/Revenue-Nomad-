# Homepage D: the grill

Run of the `grilling` skill against the plan "ship Homepage D, the lead engine, as the new revenuenomad.com
homepage, rebuilt in this repo's Next.js app". The session was autonomous, so each question carries the
recommended answer and that answer stands as an **assumption** until the founder confirms or overrides it.
Overrides change the spec (`docs/specs/homepage-d.md`), not the build order.

## Round 1: the root

❓ **Q1 - Is Homepage D the page, or the latest draft?** Four homepage variants exist on the canvas (A current,
B knot and feather, C middle ground, D lead engine). D is C plus the lead-generation layer (health check,
three roads, firm numbers, newsletter, validation strip). Build D as the homepage and keep C reachable only as
history?

➡️ Yes. D is a superset of C; nothing in C is lost. The canvas note on D is the founder's most recent direction
(Nov 2 comments are folded in).

---

❓ **Q2 - Rebuild in React, or publish the artboard HTML?** The artboard is a 180 KB file with 818 inline styles.
Rebuild it as Next.js components on tokens, or serve it as a static page?

➡️ Rebuild. The static file cannot be maintained, has no shared tokens, and the "2-minute check", newsletter and
Talk to us need real form handling later. Rebuilding is the only path to one design system.

---

❓ **Q3 - Which design system wins?** Three exist: the canvas (DM Serif Display + Red Hat Display, forest #285B44,
night #0E2433), the October prototype's `DESIGN.md` (Newsreader, forest #095D42, paper #F5F4EE), and today's
WebGL hero page (system-ui, gradient greens). Pick the canvas, since it is the latest founder-reviewed visual?

➡️ Yes. The canvas palette becomes `app/tokens.css`. The prototype's *product rules* (standard fields, money copy,
voice) still apply; only its palette and type are superseded. The WebGL hero is retired from the homepage.

## Round 2: unblocked by Round 1

❓ **Q4 - What happens to the current landing copy and the portal link?** Today's `app/page.tsx` sells the job
board to operators. Homepage D is written for companies hiring. Move the operator pitch to the "For operators"
band and keep the portal at `/portal`, linked from that band and the footer as "Operator login"?

➡️ Yes. The canvas's Option D note already says login moves to the footer as Operator login.

---

❓ **Q5 - Real images or placeholders?** The artboard references 39 uploaded images: client logos, reviewer
photos, three sample operator photos, the glass mark, the report cover. The canvas note says to clear client
logos and quotes before launch. Build with labelled placeholders and a single drop-in folder (`public/home/`)?

➡️ Yes, with one exception: the brand mark is already in the repo as inline SVG and is used as is. Every other
image slot renders a neutral placeholder with the intended alt text until the founder drops approved assets in.
This also keeps launch-blocking permissions (reviewers, clients) visible instead of baked in.

---

❓ **Q6 - Which links need pages that do not exist yet?** D links to: four solution pages, four ways-to-work
pages, the Rate Index, case studies, the report, the assessment, guides, For operators, About, Talk to us, and
the 2-minute check. None exist in this app. Ship them as routes that render a short "coming soon" page with the
same header and footer, so nothing on the homepage dead-ends?

➡️ Yes. Each link gets a real `href`; the targets are one shared stub page with the destination's title. The
site map artboard on the canvas lists the final pages; building them is out of scope here.

---

❓ **Q7 - Interactive pieces: how far?** D has four live elements: the solutions and resources mega menus, the
mobile menu drawer, the review rotator ("In their words"), and the health-check question card. Build the menus
and drawer fully, the rotator as CSS-only with reduced-motion fallback, and the health-check card as a working
single question that posts to the stub check page?

➡️ Yes. That keeps client JavaScript to two small components (menu, health-check question). The 7-question
check itself is a separate build.

## Round 3: numbers and claims

❓ **Q8 - Firm numbers.** The hero band claims 350+ operators, 100% would hire again, 172 operators and 38 signed
contracts behind the research, 24 hours to a first conversation. The canvas itself says "confirm every firm
number before launch". Render them from one data file with a `verified: false` flag that shows a visible
"confirm before launch" marker in development, and hides the marker only when flipped to true?

➡️ Yes. Same for the three third-party stats (6sense, Gartner) and the Rate Index figures.

---

❓ **Q9 - The "As seen in / Rated on" strip.** All five slots are placeholders. Keep the section in the code but
render nothing until at least one slot has a real entry?

➡️ Yes. An empty validation strip is worse than none.

## Frontier now empty. Decisions above are assumptions A1 to A9 for the founder to confirm.

## Founder answers (2026-11-09, live session)

- **A1 overridden: ship Homepage C**, with one addition from D: the hero's secondary button "Take the 2-minute
  check" links straight to `/check`. D's seven extra blocks (research bar, firm numbers, three roads, ways to work,
  health-check band, validation strip, newsletter) and the "$1M to $200M" lede line are removed from the page.
  The components stay in git history.
- **A3 confirmed**: the canvas palette and type are the design system.
- **Hero check button goes straight to `/check`**, not to an in-page band.
- **Build the 2-minute check now**: ask revenue range and employee range first; seven questions, one per pillar;
  capture name and email after the questions and before results; results instantly; leads to HubSpot; the
  pillar-by-stage weights are drafted for correction. Spec: `docs/specs/revenue-health-check.md`.
- A2, A4 to A9 stand as assumptions.
