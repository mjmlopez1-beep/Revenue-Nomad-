# Merlin illustration library

Line-art illustrations for the Merlin rebrand: classical architecture drawn in thin strokes on a near-black green, with one gold path showing the route from you to a new client.

The SVGs in `public/brand` are generated. Edit the sources here and run `npm run brand:build`.

## What is in the library

| Set | Count | Size | Files |
|---|---|---|---|
| Scenes | 7 | 1200 x 900 | `scene-<name>.svg`, `scene-<name>-labeled.svg` |
| Spots | 8 | 640 x 640 | `spot-<name>.svg` |
| Pattern | 1 | 120 x 150 tile | `pattern-arcade.svg` |
| Divider | 1 | 1200 x 96 | `divider-path.svg` |
| App icon | 1 | 64 x 64 | `mark.svg` |

Everything except the app icon comes in two themes, `public/brand/dark` and `public/brand/light`. Browse them all at `/brand` in the running app.

## When to use which scene

- terraces: the primary hero. A path climbs from you, through a mutual contact, to an introduction.
- arcade: sign-in and landing pages. It is full-bleed and crops well.
- bridge: mutual contacts and referrals.
- doors: matching and ICP. Many accounts, one with a warm way in.
- summit: pipeline stages from prospect to engagement.
- rotunda: destination pages such as about or pricing.
- beacon: timing signals and the Why Now panel.

Spots cover the smaller moments: `door` (sign in), `stairs` (onboarding), `bridge` (referral), `beacon` (alerts), `garden` (empty states), `dead-end` (404), `match` (a completed introduction) and `pin` (profile and ICP).

## Style rules

- Gold (`#F2B632`) is only ever the path. Do not use it for buttons, text or decoration.
- Lime (`#C9F03D`) is for calls to action, the "You" waypoint, trees and the inner edge of arches.
- Line work is a single 2px stroke in cream with no shading. Surfaces are flat fills.
- The destination is always a lit doorway.
- Keep illustrations on their own background color. They are opaque by design, so place them on `#0A1F1A` (dark) or `#F4F1E8` (light).

## Using them in the app

```tsx
import Illustration from "@/app/brand/Illustration";

<Illustration name="scene-terraces" labeled />
<Illustration name="spot-garden" theme="light" alt="" />
```

Labels are set in Inter with a Helvetica and Arial fallback. An SVG loaded through an `img` tag cannot use web fonts, so the labeled files render in whichever of those the viewer has installed.

## Adding or changing an illustration

- `engine.mjs` is a small isometric renderer with boxes, arches, stairs, cylinders, domes, trees, the path ribbon and waypoint labels.
- `scenes.mjs` holds one function per illustration. Shapes are listed back to front, and later shapes cover earlier ones.
- `build.mjs` writes every theme and variant, plus `lib/brand/manifest.ts`.

To add one, write a draw function in `scenes.mjs`, register it in `SCENES` or `SPOTS` with a title and a use note, then rebuild. Framing is automatic: each illustration is measured and scaled to fit its canvas.
