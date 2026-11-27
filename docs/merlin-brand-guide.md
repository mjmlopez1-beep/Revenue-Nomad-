# Merlin brand guide

Draft for review. This guide describes the direction the design work settled on: the current Merlin design system, with dark line architecture as the signature illustration, a saffron path, and violet for the person in between. Open decisions are listed at the end.

## 1. The idea

Going fractional is a long road that most people start alone. You work from home, you have no coworkers, and the usual advice is cold outreach. Merlin shows a warmer road: which companies are about to hire, who held the seat before you, and who can walk you in.

The whole identity is one picture of that idea. A traveller, a path, someone in between, and a lit door.

| Element | What it stands for |
|---|---|
| The path | The warm way in |
| The lit door | The company, and the person who decides |
| The waypoint in the middle | The person who connects you: a seat holder, a mutual contact, a fellow fractional |
| The Nomad | You |
| The architecture | The market: many doors, and most of them closed until you know someone |
| The destinations | The practice you are building. None of them started as a monument |

## 2. Name and logo

- The product is "Merlin". The full form is "Merlin by Revenue Nomad".
- Use the existing lockup: the Revenue Nomad mark with MERLIN and REVENUE NOMAD set beside it. Pine mark and ink wordmark on light surfaces, all white on pine.
- Keep the lockup at least 96px wide.
- Do not redraw the lockup, set it in another typeface or place it on volt, ember or saffron.
- Files: `public/brand/adapt/merlin-lockup.svg` and `merlin-lockup-white.svg`.

## 3. Color

Every color has one job. If a use does not fit the job, the color is wrong for it.

| Color | Hex | Job |
|---|---|---|
| Pine | `#073F2F` | Navigation, primary actions, spending credits, and the ground for line art |
| Volt | `#2EE59D` | Earning and adding. The primary button fill, and "You" on a route |
| Ember | `#FF5A1F` | Needs you now: an open role, the one urgent thing. The Nomad's cloak |
| Saffron | `#FFC12E` | The path, a lit door, the crystal ball, who decides |
| Violet | `#A05CE6` | The person in between: mutual contacts, introductions, fellow fractionals |
| Ink | `#0A1A13` | Headings and text |
| Page | `#FAFAF7` | Background |
| Surface | `#FFFFFF`, `#F3F5F4` | Cards and quiet fills |
| Sand | `#F5ECD9`, `#EAD9B6` | Warm panel backgrounds |

Supporting shades:

| Shade | Hex | Use |
|---|---|---|
| Volt soft | `#E8FBF2` | Tinted panels and chips |
| Volt ink | `#0B6B45` | Volt-colored text on light |
| Violet light | `#C08CF5` | Violet on pine |
| Violet soft | `#F3EAFD` | Tinted panels and chips |
| Violet ink | `#6A32B4` | Violet-colored text on light |
| Door glow | `#FFE39A` | The inside of a lit door |

Rules:

- Ember appears at most twice on a screen, at full strength, never as a tint.
- Saffron is never a button or a text color.
- Violet is a change to the current system, where it is illustration only. It now has one working job and no others: no buttons, charts or generic highlights.
- A route always reads volt, then violet, then saffron: you, someone you know, who decides.

Contrast, checked against WCAG 2.x:

| Pair | Ratio | Use for |
|---|---|---|
| White on pine | 11.9:1 | Any text |
| Volt on pine | 7.3:1 | Any text |
| Saffron on pine | 7.3:1 | Any text |
| Violet light on pine | 4.7:1 | Any text |
| Ember on pine | 3.8:1 | Large text and shapes only |
| White on ember | 3.1:1 | Large or bold labels only |
| Violet on white | 4.1:1 | Shapes only. Use violet ink for text |
| Violet ink on white | 7.7:1 | Any text |
| Volt ink on white | 6.6:1 | Any text |

## 4. Type

- Schibsted Grotesk for everything. Weight 800 for headings, 400 to 700 for text.
- Red Hat Mono only for domains, links and emails shown as data.
- Tabular figures for numbers in tables.
- No serif. The serif "merlin." wordmark in the early concept images is not part of this identity.

| Role | Size and weight |
|---|---|
| Landing headline | 60 to 68px, 800, tight tracking |
| Page title | 28/34, 800 |
| Section title | 17/24, 700 |
| Label and cell | 13/20 |
| Interface text | 14/20 |
| Reading text | 15/24 |

Highlight one phrase in a headline with color, not with italics: "the way in" in saffron on pine, or in volt ink on light.

## 5. Shape

- Corners: 6px chips, 8px buttons, 10px cards. Large marketing panels may use 20 to 28px.
- No shadows except on overlays and on a product card floating over an illustration.
- Chips: a fill is a state, an outline is an attribute, a dashed outline means missing.
- Motion is 150ms. The path may draw itself once on page load, and doors may light in sequence.

## 6. Illustration

### The line architecture

This is the signature of the identity.

- White lines of one weight, about 2px, on pine. No shading and no gradients.
- Classical forms in isometric view: arches, arcades, stairs, terraces, towers, domes.
- Volt on the inner edge of arches and on trees.
- One filled path in saffron, and one lit door in door glow.
- Waypoints are rings: volt for you, violet for the person in between, saffron at the door.
- Always on a dark ground. On a light page, put it in a pine band, tile or window. Do not draw it in dark lines on a light background.

### The Nomad and props

The current cast stays, drawn in the same line world.

- The Nomad is always ember, and it is the only ember shape in a picture.
- The crystal ball is the only filled circle, in saffron.
- Tent, door, seat, steps and trail are white line.
- A dotted line means a trail not yet walked, or a door that is not there.

### Destinations

Pyramids, a columned temple, a stepped tower and a rotunda stand for what people build. Use them for closing sections and milestones. Pair one with the first-stone scene when the point is that nothing starts finished.

### Where each piece goes

| Piece | Use |
|---|---|
| Terraced climb | Homepage hero |
| Wall of doors | Companies and lists: many accounts, one lit |
| Bridge | Introductions and fellow fractionals |
| Signalling tower | Crystal Ball, alerts and workflows |
| Stepped tower | Pipeline and progress |
| Rotunda | Closing call to action |
| Doorway | Sign in, unlock, getting started |

### How much

- Marketing pages: one dark hero, at most one dark panel mid-page, and one closing band.
- Product pages: about a tenth to a third of the screen. One dark element per page, and it should carry information where it can, such as the route to a specific door.
- The app shell stays light.

## 7. Voice

- Plain words, short sentences, no jargon.
- Say what the thing is and what it costs: "Unlock · 1 credit", "2 credits when locked".
- Speak to one person: "Your way in", "Your next move".
- Missing information is stated, not hidden: "Nobody named yet", "Not named yet".
- No pressure. No countdowns, and no price before it is relevant.
- Product names: Crystal Ball, Hiring now, Warm paths, Pipeline, Evidence Bank, Rate benchmarks.

Lines in use:

- "Find your next fractional client and the way in"
- "See which companies hire fractionals, what they pay and who held the seat before you."
- "A familiar way in." (campaign line from the concept images)

## 8. Do and don't

Do:

- Keep the path saffron and continuous from "You" to the door.
- Use violet wherever a person connects two others.
- Let one door be lit.
- Keep line art on pine.

Don't:

- Use violet, saffron or ember as decoration.
- Mix the line architecture with a second illustration style on the same page.
- Put text inside an illustration, other than waypoint labels.
- Fill buildings with color.
- Turn the app shell dark.

## 9. Assets

Generated by `npm run brand:build` from `scripts/brand`.

| Folder | Contents |
|---|---|
| `public/brand/adapt` | Line art in the product's colors, the lockups, and the redrawn homepage pictures (`fx-*`) |
| `public/brand/dark`, `light` | The first line-art library on near-black green and on cream |
| `public/brand/blend` | The hooded guide in the line world |
| `public/brand/landscape`, `color` | Explorations in the wider palette, not part of this identity |
| `public/brand/fonts` | Schibsted Grotesk, under the SIL Open Font License |

Mockups are under `/brand/mockups` in the app: the homepage, Companies and My Network.

## 10. Open decisions

- Violet's job needs sign-off, because it changes a written rule in the current system.
- The Nomad in the mockups is a new hooded figure. Decide whether to keep it or trace the existing Nomad into the line style.
- The line art uses pine `#073F2F`. The concept images use a darker green. Pick one ground.
- The concept images use lime and gold. This guide maps them to volt and saffron so no new colors are added.
- Illustrations in the mockups are code-drawn and fairly small. A final set may want an illustrator's pass.
- Phone layouts have not been designed.
