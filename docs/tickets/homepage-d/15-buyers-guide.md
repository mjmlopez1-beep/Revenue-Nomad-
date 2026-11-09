# 15: The Fractional GTM Buyer's Guide 2027

**What to build:** The State of Fractional report, rebranded as the Buyer's Guide and published as a web guide: a
landing page and fourteen chapters from the "Report Redesign" canvas, with Start here, the Answers and Chapter 1
open and the rest behind a name-and-email gate that opens everything on the device for a year.

**Blocked by:** None

**Status:** done

- [x] Routes `app/fractional-gtm-buyers-guide-2027/` (landing, `[chapter]`), content modules in `app/guide/content/`,
      renderer, nav, gate, rendered cover (`app/guide/`), spec `docs/specs/buyers-guide.md`
- [x] Gate records readers through `app/leads/record.ts` (`HUBSPOT_GUIDE_FORM_ID`, else `guide-requests.json`); the
      homepage Featured research form uses the same path with email only
- [x] Rename across the site (menus, footer cite, Rate Index, solution pages, figure sources); permanent redirect from
      `/research/state-of-fractional-gtm-2027`; the old cover image retired
- [x] `check:tokens` covers the guide; `check:home` runs the landing, an open and a locked chapter; gate tested end to end
- [x] Guide figures read from the live dataset through `app/guide/content/figures.ts` (owner decision 2026-11-09)
- [ ] Owner: final edit of the wording slips carried from the source (eleven vs ten direct clients named, the
      130 to 173 vs 130 to 175 hours, the Chapter 4 rounding)
- [ ] Owner: create the HubSpot form and set `HUBSPOT_GUIDE_FORM_ID`; trademark check on the title
