# 13: The Rate Index at /research/rate-index

**What to build:** A visitor who asks "what does a fractional leader cost" gets rates by role, by month, by company
size and by hours, every one computed from the research data source behind The State of Fractional GTM 2027, with
the publication floors and sources stated on the page.

**Blocked by:** None

**Status:** done

- [x] `scripts/build-rate-index.mjs` turns the three sheet exports into `data/rate-index.json` (aggregates only)
- [x] `app/research/rate-index/page.tsx` and `RateIndex.css`; `/research/rate-index` removed from the stub list
- [x] Homepage footer and FAQ rate figures derived from the same JSON (`numbers.ts`)
- [x] `check:home` covers the page; `check:tokens` covers `app/research`
- [ ] Add public published rates and operator rate conversations to the sheet if they should count (owner)
