# Clarus Digital Front Door Index: concept build

This is a gated research landing page plus a benchmark dataset. It exists to present the concept internally, and **the system data is dummy data.**

**To view it, open `dist/dfd-index-concept.html`.** It is a single file that works offline. The editable source is `index.html`, `app.js` and `tokens.css`.

## What's real and what isn't

| Content | Provenance |
|---|---|
| All 1,800 system records (names, scores, metrics) | **Synthetic.** Names are invented. Size, state, type and rurality mix are shaped on our real target lists (the 1,154-system national list plus the OR/PA/ME/AZ Rural Rounds lists). No record maps to a real organisation. |
| Oregon field-test section | **Measured.** These are the statewide aggregates from *Digital Front Door: Oregon Patient Access Benchmark 2026*, from calls placed 2026-09-21. |
| Brand styling | Matched to claruscare.com computed styles (colors, Archivo/Barlow, buttons). Logo cut from the Clarus sales deck. See `BRAND.md`. |

The page shows a persistent demo banner. Every modeled figure carries a "modeled" tag, and the Oregon figures carry "measured".

## Layout

```
data/INVENTORY.md          what source data exists (step 1 of the brief)
data/METRIC_DEFINITIONS.md metrics, capture method, scoring
data/dfd_index.{json,csv}  the dataset
data/dfd_index.js          compact form the page loads
scripts/scoring.py         weights, band thresholds, pillar math (single source)
scripts/build_dataset.py   seeded generator (SEED = 20261022)
scripts/bundle.py          builds dist/dfd-index-concept.html
```

## Rebuild

```
python3 scripts/build_dataset.py <Lookalike-Scored All_Scored_Systems.csv> data
python3 scripts/bundle.py
```

## Replacing dummy data with real data

1. For each measured system, set the raw metric fields and set `provenance` to `measured`, with a real `system_name` and a `measured_at` date. Real names may only appear on measured records.
2. Run `score_record` from `scripts/scoring.py` over every row, then re-rank. `build_dataset.rank()` does this.
3. Write the output with `build_dataset.write()` and re-bundle. Every headline, caption and narrative on the page is computed from the data at render time, so the copy updates itself.
4. Once measured records exist, the page should tag figures by each record's provenance instead of tagging everything as modeled. That is a small change in `app.js`.

## Not done yet (concept scope)

- The logo is a monochrome stand-in for the official two-colour mark (see `BRAND.md`).
- The page is plain JS plus Chart.js, not React or Next.js components. The logic is split by view, so it can be ported.
- The explorer is not code-split behind the gate. The whole bundle is about 780 KB.
- The gate only logs a Salesforce web-to-lead-shaped payload to the console. Nothing is sent.
