# Build brief for Homepage D section tickets (02 to 08)

Read in this order: this file, your ticket, `docs/design/homepage-d-design.md` (sections 4.1, 4.2, 4.3),
`docs/design/homepage-d-content.md` (your sections), `CONSTRAINTS.md` (Design table), `CLAUDE.md`.

## Where things are

- Shared primitives already exist: `app/home/home.css` (`.rn-wrap`, `.rn-section`, `.rn-eyebrow`, `.rn-h2`,
  `.rn-lede`, `.rn-body`, `.rn-small`, `.rn-btn` and variants `--ghost --leaf --outline-light --sm`, `.rn-link`,
  `.rn-link--light`, bands `.rn-band--dark --forest --mist`, `.rn-badge`, `.rn-avatar`, `.rn-sr-only`),
  `app/home/Arrow.tsx`, `app/home/Avatar.tsx`, `app/home/Figure.tsx` (`FigureValue`, `FigureLabel`,
  `FigureSource` keyed by `numbers.ts`), `app/home/SiteHeader.tsx`, `app/home/SiteFooter.tsx`.
- Data: `app/home/content/links.ts` (`routes`, `hrefs`, menus), `numbers.ts` (`numbers`, `facts`), `logos.ts`.
- Tokens: `app/tokens.css`. Every color, font and radius you write is `var(--rn-*)`. No hex, no rgb(), no
  literal font names. `npm run check:tokens` enforces this.
- The artboard's raw HTML for each section is split into files under
  `/tmp/claude-0/-home-user-Revenue-Nomad-/829a0397-bf71-53f3-942e-e2b2163cc413/scratchpad/artifact-files/01a61064-0393-4bc6-aa5e-b417e5e7a6d8/project/sections/`
  (`00-research-bar.html` ... `23-footer.html`). Use them for exact copy, spacing, sizes and SVG paths. They are
  reference material: copy text and geometry, map every color to a token, drop every `/_blob/` image unless the
  ticket names a shipped file.
- Phone layout reference: `.../project/HomeEMobile.dc.html` (390 wide). Grep it for your section's heading.

## What you build

- One file per section, `app/home/<SectionName>.tsx`, named exactly as in design 4.1, exporting the component as
  default. A section is `<section className="<prefix>" aria-labelledby="<prefix>-h">` with an `h2` carrying that
  id (the hero uses `h1`). Server component unless the design marks it client.
- One CSS file per section, `app/home/<SectionName>.css`, imported at the top of the component
  (`import "./<SectionName>.css";`). Prefix every class with the section's short prefix (hero-, roads-, ...).
  Do not edit `home.css`, `tokens.css`, `page.tsx`, `links.ts`, `numbers.ts`, `logos.ts`, header or footer.
  Other agents are editing the same tree at the same time; touching shared files will clobber their work.
- Figures: use `FigureValue`/`FigureLabel`/`FigureSource` with an existing key from `numbers.ts`. Prose quotes a
  figure through `facts.*`. If a figure you need has no key, define it in a local `const` in your component with
  a `// TODO(numbers): move to numbers.ts` comment and list it in your report.
- Links: `href` values must be keys of `routes` in `links.ts` (use `hrefs.*` where one exists) or an in-page
  anchor like `#health-check`. Never `#` alone.
- Images: only `public/home/glass-mark.webp` (980 by 984) and `public/home/report-cover.webp` (1200 by 734)
  exist, via `next/image` with width and height. Everything else: omit decorative images; people are `Avatar`.
- Motion: anything that moves on its own needs a pause/play `<button>` and must stop under
  `prefers-reduced-motion: reduce`. Hover transitions also stop under reduced motion.
- Copy: exact artboard text. Plain, no em-dash asides (use " - " as the artboard does), no emoji. Client-facing
  copy never says fee, margin, split, take rate, all-in or take-home except the allowed "No fees for companies"
  phrasings.
- Responsive: works at 390 wide with no horizontal scroll. Breakpoints 900px and 480px.
- Accessibility: real buttons and links, labelled controls, 4.5:1 contrast (gold `--rn-gold` text only on dark
  or forest surfaces; on white use it for marks, not text), one primary `.rn-btn` per section.

## How you verify

1. Create a temporary preview route `app/dev/<NN>/page.tsx` (NN = your ticket number) that renders
   `SiteHeader`, your sections inside `<main>`, and `SiteFooter`, and imports `../../home/home.css`. If none of
   your sections has an `h1`, add `<h1 className="rn-sr-only">Preview</h1>` inside main so the one-h1 check passes.
2. Run `npx tsc --noEmit`, `npm run check:tokens`, then `node scripts/check-home.mjs --path /dev/<NN>`.
   The smoke check starts its own dev server on a random port and takes about a minute. Fix every failure.
3. Take one screenshot at 1440 and one at 390 with Playwright (`require("playwright")`, `chromium.launch()`,
   `deviceScaleFactor: 1`) and look at them: compare against the artboard section for hierarchy, spacing and
   color. Fix what is off.
4. Delete `app/dev/<NN>/` before you finish. Do not commit; the orchestrator commits.
5. Report: files created, any `TODO(numbers)` figures, any artboard detail you could not reproduce and why,
   and the final check output. Under 300 words.
