# Merlin Capital — Website

Marketing website for Merlin Capital, a litigation finance company providing
non-recourse pre-settlement funding. Built to the **Merlin Brand Identity
System v2** (March 2026).

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage — hero, proof bar, how it works, values, case types, attorneys, testimonials, FAQ |
| `how-it-works.html` | Detailed four-step process and repayment explanation |
| `attorneys.html` | Attorney partnership: underwriting approach, firm capital products |
| `about.html` | Brand story, values, team overview |
| `apply.html` | Funding application form |

## Stack

Pure static HTML/CSS/JS — no build step, no dependencies. Deployable as-is to
GitHub Pages, Netlify, Vercel, or any static host.

- `css/styles.css` — design system implementing the brand: palette tokens,
  Bricolage Grotesque / Nunito / Newsreader Italic typography, and the three
  signature patterns (teal left-border quotes, teal→gold→coral gradient
  dividers, proof-bar term cards).
- `js/main.js` — mobile nav, scroll-reveal animations, stat counters, and the
  application form handler.
- `assets/logos/` — production SVG logo package (primary, reversed, one-color,
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
- **Contact details:** the phone number `(888) 555-0142`, email addresses, and
  the stats in the trust strip / about page are placeholders — replace with
  real figures.
- **Testimonials:** the quotes are illustrative placeholder copy; swap in real,
  permissioned client quotes.
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
