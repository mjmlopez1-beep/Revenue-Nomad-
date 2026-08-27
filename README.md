# Merlin Capital Website

Marketing website for Merlin Capital, a litigation finance company providing
non-recourse pre-settlement funding. Built to the **Merlin Brand Identity
System v2** (March 2026).

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage: hero, proof bar, how it works, values, case types, attorneys, commitments, FAQ |
| `how-it-works.html` | Detailed four-step process and repayment explanation |
| `attorneys.html` | Attorney partnership: underwriting approach, firm capital products |
| `about.html` | Brand story, values, team overview |
| `apply.html` | Funding application form |

## Stack

Pure static HTML/CSS/JS with no build step, no dependencies. Deployable as-is to
GitHub Pages, Netlify, Vercel, or any static host.

- `css/styles.css`: design system implementing the brand: palette tokens,
  Bricolage Grotesque / Nunito / Newsreader Italic typography, and the three
  signature patterns (teal left-border quotes, teal→gold→coral gradient
  dividers, proof-bar term cards).
- `js/main.js`: mobile nav, scroll-reveal animations, and the
  application form handler.
- `assets/logos/`: production SVG logo package (primary, reversed, one-color,
  mark, wordmark). Favicons and `site.webmanifest` live at the site root.

## Local preview

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Before going live

- **Form backend:** `apply.html`'s form is front-end only. Point the form's
  `action` at your backend or a service (Formspree, Netlify Forms, Basin) and
  remove the demo submit handler in `js/main.js`.
- **Contact details:** matt@merlincapital.us and (718) 809-6964 throughout.
- **Service commitments:** the 24-hour decision and 24-48-hour funding
  commitments, the $1,500-$250,000 advance range, and the team background
  descriptions should be confirmed against what the firm will actually deliver.
- **Testimonials:** the site intentionally has none yet; add real, permissioned
  client quotes to the commitments section once cases have been funded.
- **Legal review:** have counsel review the footer disclosures and all claims
  (pricing language, timelines, state availability) against your actual
  product terms.

## Brand quick reference

| Token | Hex | Role |
| --- | --- | --- |
| Night | `#1A2142` | Foundation |
| Coral | `#E8715A` | Energy / primary CTA |
| Teal | `#45B5A8` | Action |
| Gold | `#F0C55B` | Optimism |
| Cream | `#FAF6EF` | Background |

Display: Bricolage Grotesque · Body: Nunito · Accent: Newsreader Italic
(emotional moments only). The wordmark is always lowercase; never remove the
coral dot.
