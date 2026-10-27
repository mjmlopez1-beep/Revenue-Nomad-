# Brand tokens: sources and gaps

All values live in `tokens.css`.

## Sources

1. **claruscare.com computed styles**, captured 2026-10-22 in a separate browsing session. That session's brief was read from the live site's computed CSS:
   - **Colors:** navy `#071D49`, bright blue `#417DE9`, orange `#FF9F13`, muted navy `#435E93` and `#334870`, panel `#E1E4ED`.
   - **Type:** Archivo for headlines and body. The H1 is 64/700 with line-height 1.02 and about −0.03em tracking. Body text is 18/28. Barlow is used for nav, eyebrows and labels.
   - **Buttons:** navy at 88%, white text, 14px radius, Archivo 13/700 uppercase with about 1px tracking, padding 12×28, a trailing arrow and a soft shadow.
   - **Patterns:** one or two headline words highlighted in blue (orange on dark), a light-panel stat band, dark navy feature cards, a light grey final CTA panel, and a navy footer with a white logo.
2. **`Clarus_Sales_Deck_v19.pptx` (Drive):** the logo artwork. `assets/clarus-logo-white.png` is cut from the deck's white-on-navy logo, and `assets/clarus-logo-navy.png` is a recolor of it.

## Deliberate deviations

- **Link and active-tab blue is `#2F6AD6`, not `#417DE9`.** Small text needs 4.5:1 contrast on white. `#417DE9` is still used for large headline highlights and charts.
- **Light only.** The site has no dark mode, so the report always renders on white in the Clarus palette, whatever the viewer's system setting.

## Still to verify

- **The logo is a monochrome stand-in.** The live site uses a navy wordmark with a blue/orange mark. Swap in the official `clarus-logo.png` from the brand-brief session.
- **The nav labels and footer columns are placeholders.** They need to be matched to the live site's real ones.
- **Photography is not used yet.** The site's hero uses a blurred clinic photo.
