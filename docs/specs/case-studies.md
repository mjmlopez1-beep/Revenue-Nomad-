# Spec: the case studies hub and the seven case pages

Status: BUILT 2026-11-09. The site map's open decision (one page with anchors, or seven pages) is settled as seven pages
plus a hub, because the homepage, the Pipeline page and every role page already say "all seven case studies".

## Routes

`/case-studies` (hub, `app/cases/CasesHub.tsx`) and `/case-studies/<slug>` (`app/cases/CasePage.tsx`), statically
generated from `app/cases/content.ts`. Slugs: `myhr-partner`, `grow-pro-agency`, `practice-promotions`, `ferry`,
`buildinglink`, `clarus-care`, `software-400m-arr`. The role pages' "Read the case study" links deep-link: VP of Sales
to Practice Promotions, RevOps to the software company, CMO to Ferry; AI GTM links the hub.

## Sources

Every engagement is real and documented: the signed agreements and statements of work (myHR Partner May 2024, Grow Pro
Agency October 2025 and its October 2026 addendum, Practice Promotions August 2026), the case-study slides in the Firebolt
and Elevate proposals (BuildingLink, Ferry, April and May 2026), the Clarus Care lead-generation play (2025), the myHR
Partner Sales and CS expansion plan (Q1 2025), the Diagnostic page's $400M ARR narrative, and the three verified reviews on
the homepage. No fee, rate or hours figure from a contract appears on the site. Trialbee, which the proposal deck also
carries, predates Revenue Nomad and is left out.

## Figures and confirmations

Headline figures come from `app/home/content/numbers.ts` and carry the confirm badge until the founder signs them off:
+51% (myHR Partner), +54.8% (Grow Pro), 5 weeks (Practice Promotions), $400K (BuildingLink, new), 833% (Clarus Care),
15 months (the software company, new). Ferry has no number yet and reads "Active". Two Ferry outcome bullets name
prospects from a private proposal and carry `confirm: true` until the client allows them. The hub quotes the
"would hire again" figure, also unconfirmed.

## Template

Case page: text-led hero with the headline figure in a night panel, the at-a-glance row on gold rules, the situation,
"The seat, and the work" (talent deployed, numbered scope) on mist, "What the company has now" on the night band with the
problem's isometric drawing and the basis line, the client's words, the Diagnostic pillars the work touched, keep reading
(the problem page, the role page, the next case), closing band. Hub: hero, seven cards in the homepage Outcomes language
(figure over the cover photo, or over the drawing where there is no photo), the pattern across the seven on a forest band.
Prefix cs-, tokens only (`app/cases/Cases.css`); `check:tokens` and `check:home` cover the folders.
