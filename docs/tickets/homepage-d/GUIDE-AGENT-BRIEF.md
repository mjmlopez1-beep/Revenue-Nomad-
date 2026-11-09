# Brief: convert one or more guide artboards into chapter content modules

You are converting artboards of the "Report Redesign" canvas (the latest design of the report, now retitled
**The Fractional GTM Buyer's Guide 2027**) into typed content for the Next.js site at /home/user/Revenue-Nomad-.

## Read first

- `app/guide/content/types.ts` (the block schema; the only shapes you may emit)
- `app/guide/content/guide.ts` (chapter slugs, numbers, titles, deks)
- Source artboards: `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/artifact-files/e7535fe9-7c93-4f3c-bb46-2e2539c62cd8/project/<Name>.dc.html`
  (Foreword, Answers, Chapter01 ... Chapter10, Methodology). They are large inline-styled HTML; read them in
  slices with sed or python, never all at once if over 60 KB.

## What you write

One file per chapter: `app/guide/content/<slug>.ts` exporting `const chapter: Chapter` as default, where `<slug>`
is the chapter's slug from guide.ts (for example `01-why-now.ts`, `start-here.ts` for the Foreword, `answers.ts`,
`methodology.ts`). Nothing else: do not edit shared files, other chapters, components or styles.

```ts
import type { Chapter } from "./types";
const chapter: Chapter = { slug: "01-why-now", number: "01", title: "...", dek: "...", stats: [...], blocks: [...] };
export default chapter;
```

## Conversion rules

- Carry **every word of body copy** from the artboard, in order. Do not summarize, shorten or "improve" prose.
  Fix only obvious typos (for example "Nearly nearly").
- Map the artboard's structures to blocks: chapter header tiles -> `stats`; eyebrow + heading -> `h2` with
  `eyebrow` and an `id` (kebab-case of the heading, used by the in-page "Jump to" nav); sub-headings -> `h3`;
  paragraphs -> `p` (inline `<strong>`, `<em>`, `<a href>` only); the opening italic paragraph -> `lede`;
  rows of big numbers -> `stats`; numbered method or math steps (for example "1 The base ... Running total
  34,000") -> `steps` with the running total or side figure in `aside`; tables -> `table` (first row as `head`;
  set `firstColHeader: true` when the first column is a row label; keep a `note` for the n= line under it);
  pull quotes -> `quote`; boxed asides and "what this means for buyers" boxes -> `callout` (tone `leaf` for
  advice, `night` for the editor's or author's voice, `gold` for warnings); source lines and n= lines -> `note`;
  the Answers page's fourteen question cards -> one `qa` block.
- External source links in the artboard (Lightcast, Observer, Gartner, 6sense, BLS, Built In and so on): keep
  them as `<a href="...">Source</a>` inside the paragraph's `html` with the real URL from the artboard. Internal
  "See Chapter N" links: write them as `see: "Chapter 3"` on `qa` items, or as plain text in `p` ("see Chapter 3").
- The report's title has changed. Wherever the text says "The State of Fractional GTM 2027" or "this report",
  write "The Fractional GTM Buyer's Guide 2027" or "this guide". Keep "Revenue Nomad Rate Index" as the name of
  the pricing dataset. Keep every figure exactly as the artboard states it (this is the October 2026 edition).
- Punctuation: use " - " (space hyphen space) where the artboard uses an em dash or en dash in running text;
  ranges keep "to" or " - ". Straight quotes are fine. No emoji.
- Skip: the artboard's own page header/nav, "Jump to" link rows (the renderer builds them from `h2` ids), the
  closing "Talk to us" CTA section, decorative SVG, and any "Back to contents" links.
- Stats tiles: `v` is the big figure exactly as printed (for example "$225", "~14,000", "1 of 74"), `l` the
  label, `s` the source or n line if present, `tone: "coral"` where the artboard colors the figure red.

## Verify and report

Run `npx tsc --noEmit` from /home/user/Revenue-Nomad- until your file type-checks. Then count the paragraphs in
the artboard body (`grep -o "<p" file | wc -l`, minus header/nav/CTA paragraphs) and compare with the `p` and
`lede` blocks you emitted; report both numbers and explain any gap. Report the file path(s) written, the block
counts by type, any artboard structure you could not map, and any figure that looked inconsistent. Under 250
words. Do not commit.
