# Spec: Homepage D, the lead engine

Status: ready-for-agent. Architecture and decisions: `docs/design/homepage-d-design.md`. Copy: `docs/design/homepage-d-content.md`.

## Problem Statement

A company leader who searches "fractional VP of sales" or "fractional RevOps" and lands on revenuenomad.com sees a
page about a job board for operators. Nothing tells them the firm places the role they searched, for a company
their size, or shows proof that it works. They leave.

## Solution

Replace the homepage with Homepage D: a page written for companies with $1M to $200M in revenue that names the
roles the firm places, sorts the visitor by their situation, shows verified reviews, outcomes and research, and
offers two ways to start (a call, or the two-minute check). The operator pitch moves to one band near the end,
and the portal stays one click away in the footer.

## User Stories

1. As a company leader arriving from a role search, I want the first screen to name my role and company size, so that I know I am in the right place.
2. As a company leader, I want one obvious way to start a conversation, so that I do not have to hunt for a contact page.
3. As a cautious visitor, I want a low-commitment first step (a two-minute check), so that I can learn something before I talk to anyone.
4. As a visitor, I want to recognise my situation (my leader left, I am still selling, I inherited the number), so that I can jump straight to the relevant offer.
5. As a skeptical buyer, I want third-party statistics with sources, so that the "GTM is evolving" argument is credible.
6. As a buyer, I want to see the four problems the firm solves as outcomes, so that I can tell whether mine is one of them.
7. As a buyer, I want to understand the four ways to engage (diagnostic, monthly, interim, to full time) with terms and no hidden costs, so that I can picture the commitment.
8. As a buyer, I want to know the three steps from a first call to a start date and that there is no fee for companies, so that I know what happens next.
9. As a buyer, I want to see what a fractional leader costs, so that I can judge fit before a call.
10. As a buyer, I want to read verified reviews from named companies, so that I trust the claims.
11. As a buyer, I want outcomes with before, after, a number and its source, so that I can see what changed.
12. As a buyer, I want to understand the named method (the Revenue Health Assessment and its seven pillars), so that the firm's approach feels structured.
13. As a buyer, I want the research report available for an email, so that I can take something away.
14. As a buyer, I want guides and the Rate Index listed, so that I can keep reading.
15. As a returning reader, I want a monthly newsletter sign-up with a clear consent line, so that I know what I am agreeing to.
16. As an operator, I want a band that explains the network and links to joining and to the portal, so that the site still serves me.
17. As a buyer with questions, I want the four most common answered on the page, so that I do not have to ask them on a call.
18. As any visitor, I want every link to go somewhere real, so that I never hit a dead end; a page not yet built should say so and offer the call.
19. As a phone user, I want the page to work at 390px with a menu drawer and no horizontal scroll.
20. As a keyboard or screen-reader user, I want menus, the drawer, the accordion and the review rotator to be operable, labelled, and to stop moving when I ask.
21. As a visitor who prefers reduced motion, I want nothing on the page to animate on its own.
22. As the founder reviewing a preview, I want every unconfirmed number visibly flagged, so that nothing unverified reaches production unnoticed.
23. As the founder, I want fee, margin and split language to be impossible on client-facing pages, so that decision D1 holds.
24. As the founder, I want every color and font to come from one token file, so that the three competing visual systems stop drifting.
25. As a privacy-conscious visitor, I want my email never to appear in a URL or be stored without my knowledge.

## Implementation Decisions

- One route composes section components in artboard order; sections are server components except the header,
  the marquee's pause control and the review rotator.
- One token file is the only color and font source for the homepage, the stub pages and the brand mark. Homepage
  CSS is imported per route so the portal is untouched.
- Figures live in one data module with a `verified` flag; prose interpolates the same constants; unverified
  figures carry a visible badge except on the production deployment, controlled by a public site-environment
  variable.
- Navigation and every internal path live in one links module; the header, footer, sections and the stub route
  read from it. The stub route is static, limited to that map, non-indexed, and renders no input.
- The two email forms post to server actions that validate the address shape, discard it, and redirect to a
  thanks page with an enumerated variant. The health-check band is static with one primary button.
- Only firm-owned images ship (glass mark, report cover). Logos render when files exist (six minimum for the
  marquee). People render as initials. The validation strip renders nothing until it has a real entry.
- Both self-moving elements have pause controls and stop under reduced motion.
- The brand mark component is retokenised rather than duplicated.

## Testing Decisions

- A good test observes the rendered page as a visitor or assistive technology would: text, roles, contrast,
  layout width, link resolution, response codes. It does not test component internals.
- The smoke script is the seam: it loads `/` at two viewports in a real browser, runs axe-core, and checks the
  constraints listed in `CONSTRAINTS.md`. It also checks link resolution, the 404, the unverified-badge rule and
  reduced motion. Prior art: none in this repo; the script is new.
- Type checking and the production build are the other two gates.

## Out of Scope

The seven-question check, the Rate Index page, solution and case-study pages, the report reader, About, For
operators and Talk to us as full pages; form back ends; analytics; JSON-LD; the Open Graph image; approved
photos and logos; any portal change.

## Further Notes

Nine assumptions (A1 to A9 in the design) stand in for founder answers. The canvas note on Homepage D lists
launch work the founder already knows about: confirm numbers, build the check, fill or remove the validation
slots, clear logos and quotes.

## Revision 2026-11-09: hero alignment

Owner's gallery comment: "Feels off center." Measured at 1440: the glass mark hung 39px past the content grid's right edge
(the artboard's `right: -39px`) and its middle sat above the copy's middle. The mark now sits inside the grid (`right: 0`)
and is centered vertically on the copy (`app/home/Hero.css`). Phone layout unchanged.

## Revision 2026-11-09 (later): the eight role categories in the hero

Owner's gallery comment: "Maybe switch the right side to an illustration of our 8 role categories." The glass mark is
replaced by `app/home/RoleWheel.tsx`: the eight Rate Index categories as isometric blocks on a dashed gold ring around one
gold slab labeled "Revenue engine", in the Diagnostic's drawing language. Block heights follow each category's share of the
index (Sales Leadership tallest), and the ring is ordered front to back by size so the tall blocks hide nothing. Labels are
display names; the list and order come from `data/rate-index.json`. The glass mark file stays in `public/home/`.
