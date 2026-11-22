# Merlin design system

The rules every Merlin surface keeps: the app, the landing page, the emails, the link preview.
The best surfaces already follow them (the landing page, onboarding, the Crystal Ball email, the
empty states, the 404), and since phase 2 of the studio pass every signed-in page does: each opens
with `PageHead` in `.page-narrow` or `.page-wide`. New work starts here.

Tokens live in `app/globals.css`. Components live in `app/ui/` (`system.tsx`, `Logo.tsx`,
`Problem.tsx`, `WonMoment.tsx`). Pictures come from Fractions (`app/ui/fractions/`). Emails are
built from `lib/emailArt.ts`.

## Brand rules

- **Pine `#073F2F` is primary.** Navigation, the primary button, headings on light, the pine bars.
- **Volt `#2EE59D` is for earning only.** A credit earned, "Add what you know", "+1". Never the
  main button of a view that earns nothing.
- **Ember `#FF5A1F` is heat, at full strength.** An open role, or the one thing that needs you now.
  At most two a screen, never a tint, never a background wash.
- **Violet's rule.** Violet is illustration only, the rarest colour: the flowers and the dusk sky of
  The keep and nowhere else. No violet or pink in any working surface: no buttons, chips,
  monograms, charts or states.
- **No photographs anywhere.** Not in the app, not in emails, not in the link preview. Pictures
  are Fractions.
- **Copy:** plain and short. No em-dash asides, no exclamation marks.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--pine` | `#073F2F` | primary |
| `--pine-hover` | `#0E5640` | pine on hover |
| `--pine-8`, `--pine-14` | pine at 8%, 14% | quiet fills, edges on mint |
| `--volt`, `--volt-hover` | `#2EE59D` | earning |
| `--volt-soft` | `#E8FBF2` | mint tint (callouts, the win) |
| `--volt-ink` | `#0B6B45` | mint as text on white |
| `--ember`, `--ember-ink` | `#FF5A1F`, `#B23A0A` | heat; ember text on white |
| `--sand`, `--saffron-hi` | `#F5ECD9`, `#FFE39A` | illustration and monogram tints |
| `--ink`, `--body-ink`, `--muted`, `--faint` | | headings, words, hints, the quietest text |
| `--ink-6` | ink at 6% | the quietest monogram tint |
| `--bg`, `--surface`, `--surface-2` | `#FAFAF7`, white, `#F3F5F4` | page, card, inset |
| `--line`, `--line-strong`, `--line-input` | | hairlines, outlines, fields |
| `--r-chip`, `--r-btn`, `--r-card` | 6, 8, 10px | corners |
| `--page-narrow` | 760px | a page you read or fill in |
| `--page-wide` | 1160px | a page of lists, boards and cards |

### Layout

Wrap a page in `.page-narrow` (settings, a form, credits, notifications) or `.page-wide` (Home,
the pipeline, the network). Both centre themselves and sit 24px under the top bar (16px on a
phone). The table and a record keep their own full width.

### Type

One scale. Font sizes are 12, 13, 14, 15, 17, 22 and 28 only (24 is the page title on a phone and
the title of a problem page; the landing page keeps its display sizes).

| Class | Size | Use |
| --- | --- | --- |
| `.t-page` | 28/34, 800 (24/30 on phones) | the page title, once a page |
| `.t-title` | 22/28, 800 | an overlay or dialog title, an email headline |
| `.t-section` | 17/24, 700 | a section, a card, an empty state's title |
| `.t-sub` | 15/20, 700 | a group inside a card, a row title |
| `.t-body` | 15/24 | reading text |
| `.t-ui` | 14/20 | interface text |
| `.t-label` | 13/20, 600 | a field's label |
| `.t-hint` | 13/20, muted | a hint, a caption |
| `.t-caption` | 12/16, muted | the smallest print |
| `.t-num` | the figures face | every number, date and amount |

## Buttons

`.btn` plus at most one tone and one size.

- Tones: `.btn-pine` (primary), `.btn-volt` (earning; `.btn-primary` is the same, kept for the
  landing page; the member's app says `.btn-volt`), `.btn-outline` (the default `.btn`), `.btn-ghost`,
  `.btn-danger` (outline, red words).
- Sizes: `.btn-sm` 32, `.btn` or `.btn-md` 40, `.btn-lg` 48. Phones raise every target to 44.
- **One filled button a view.** Pine for the primary action. Volt only where the click earns a
  credit. Everything else is outline or ghost.

## Components (`app/ui/system.tsx`)

```tsx
import { PageHead, Card, Callout, Chip, LikelihoodChip, WarmthChip, StatusChip, Stat, EmptyState } from "@/app/ui/system";
import { Logo } from "@/app/ui/Logo";
import { Problem, PineBar } from "@/app/ui/Problem";
import { WonMoment } from "@/app/ui/WonMoment";
```

| Component | Props | Notes |
| --- | --- | --- |
| `PageHead` | `title`, `lead?`, `back?: {label, onClick? \| href?}`, `art?`, `actions?`, `id?` | The top of every page. `back` only on a nested page. `art` is the page's one `Prop` (72px, 96 at most). `actions` holds one filled button at most. |
| `Card` | `as?`, `className?`, children | White, `--line` hairline, 10px corners, 20 by 24 inside (16 on phones). No shadows. Class: `.card`. |
| `Callout` | `tone?: "mint" \| "sand"`, `role?` | A tint, no edge. Mint for good news and earning, sand for everything else. Class: `.callout`, `.callout-sand`. |
| `Chip` | `tone?: "outline" \| "pine" \| "mint" \| "ember"`, `glyph?`, `title?` | Four tones only. Ember is solid and means an open role, once a screen. |
| `LikelihoodChip` | `band: "High" \| "Medium" \| "Low"`, `long?` | High pine, Medium mint, Low outline. |
| `WarmthChip` | `warmth: "Hot" \| "Warm" \| "Cold"`, or the strength words `"Strong" \| "Good" \| "Fading" \| "Cold"` | One scale with the spark Glyph on each step: Hot pine, Warm mint, Cold outline. The strength words keep those tones: Strong pine, Good mint, Fading and Cold outline. |
| `StatusChip` | `status: "Draft" \| "Sent" \| "Viewed" \| "Signed" \| "Declined" \| "Won" \| "Lost"` | Signed and Won pine, Viewed mint, the rest outline. Never ember. |
| `Stat` | `n`, `label`, `link?` | 32/36 number in the figures face, 13/20 label, an optional link. Never a filled tile. Group them in `.stats`. |
| `EmptyState` | `spot`, `title`, children (the words), `action?`, `framed?` (default true), `on?`, `ember?`, `role?` | A Spot at 128, a 17/24 title, 15/24 words, one pine button. Use it for every empty, error, offline and expired state. |
| `Logo` | `height?` (30), `tone?: "color" \| "white"`, `label?` | The lockup as inline SVG: pine mark and ink wordmark, all white on pine. At least 96px wide on a phone (height 28 or more). |
| `Problem` | `title`, children, `onRetry?`, `retryLabel?`, `reload?` | A page that could not show: the offline Spot at 128, a 24/30 title, one sentence, pine then plain buttons. `PineBar` is the pine bar with the white lockup for pages outside the app. |
| `WonMoment` | `rec` (a pipeline deal), `onSeat?`, `compact?` | The win: the keep (quiet), the client, its value a month, "Add it as your seat". Home's "You won" card and the top of the pipeline's Won column only. |

Scales are exported as maps too (`LIKELIHOOD_TONE`, `WARMTH_TONE`, `STRENGTH_TONE`, `STATUS_TONE`), for a place
that draws its own chip.

### Monograms

A company or a person with no picture gets two letters on a brand tint (`monoTint(name)` in
`app/ui/shared.tsx`): pine 8%, mint soft, sand, saffron light or ink 6%, with pine or ink letters.
Never a hue of its own. A locked company's logo is one neutral tile (`--surface-2`) with the lock,
the same for every locked company.

### Chrome

The member's app: a white 56px top bar with a hairline under it and the sidebar (from 1024px)
with the lockup at its top. The loading shell (`app/Root.tsx`) draws exactly that, so nothing
changes colour when the app lands. Pages outside the app (error, not found, signing, legal) keep a
pine bar with the white lockup.

## Illustration (Fractions)

Two registers. The pieces, the grid and the colours are in `app/ui/fractions/`.

**Loud** (its own pine, mint or sand field, the brand at full strength) lives in a few places only:
the landing page, the onboarding banner, the 404, an email's header (the Crystal Ball hero and the
strips in `public/email/header/`), the link preview (`public/brand/merlin-og-banner.png`), and the
signed-proposal email (the keep at the end of the trail). In the app the win is quiet (`WonMoment`).

**Quiet** (no field, pale tints of the surface it sits on, ember on one small piece) is for the
signed-in app:

- one page-head `Prop` on each top-level page (through `PageHead`'s `art`);
- a `Spot` in every empty, error, offline and expired state (through `EmptyState` or `Problem`);
- `Glyph`s in shortcut cards and chips;
- the win (`WonMoment`).

Never:

- inside a data row, a table or a record's content (keep 24px clear of any data);
- behind text;
- on admin pages;
- in a modal, except a success moment;
- more than one picture a screen;
- photographs, anywhere.

Sizes: a Spot up to 160 (128 in an empty state), a page-head Prop up to 96 (72 usual), the Nomad up
to 72 on its own, a quiet scene up to 240 tall. One Nomad a screen. Ember once a screen: where the
screen already shows ember, art is drawn calm (its ember piece turns saffron).

## Emails (`lib/emailArt.ts`)

Every email is one family, set by the Crystal Ball email:

- **Frame** (`mailShell({ title, preheader, body, footer, link, art })`): on the page colour, 600
  wide; a pine header with the white lockup and the email's Fractions strip (`art`: `door` sign-in
  and codes, `letter` messages and invites, `proposal`, `signed`, `plan` the trial and the plan,
  `week` the weekly email); the white sheet with the words; the footer in 12/18 muted type on the
  page.
- **Type:** a 22/28 headline (`mailH`), 15/24 words (`mailP`), 14/20 small print (`mailSmall`),
  links shown as data in mono (`mailLinkLine`), a code to type (`mailCode`).
- **Buttons** (`mailButton(href, label, style, tone)`): one a mail, pine with white words; `volt`
  only where the click earns a credit; `outline` for a second. In dark mode they turn volt with pine
  words.
- **Parts:** `mailCallout` (mint, sand or page tint), `mailQuote` (what someone wrote), `mailList`,
  `mailFootLink`.
- **Pictures:** PNGs made from Fractions by `scripts/make-email-art.mts`, linked from the site the
  email links to, with width, height, alt text and a solid colour behind them. No photographs.
- **Dark mode:** the `<style>` block only adds dark mode (Apple Mail, Outlook) and a phone's
  gutters; every email reads the same without it.

Make the pictures again after changing the art:

```sh
npx tsx scripts/make-brand-art.mts   # the lockup PNGs and the link preview (public/brand)
npx tsx scripts/make-email-art.mts   # the email pictures (public/email), the lockup from the line above
```
