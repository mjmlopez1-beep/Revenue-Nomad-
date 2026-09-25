# Revenue Nomad master prototype

One cohesive, clickable system that merges:

| Source | Now lives at |
|---|---|
| Site prototype (homepage, browse, about, talk to us) | `#home`, `#browse`, `#about`, `#talk` |
| Operator Profile Explorer (visual source of truth) | `#op.<slug>`, plus `#proof.<id>` for direct deals |
| Revenue Nomad Projects (client postings, now called engagements; operator responses, admin) | `#engagements`, `#engagement.<id>`, `#blueprints`, Studio inbox, Admin (old `#projects` and `#project.*` links redirect) |
| State of Fractional GTM 2027 report mockup | `#report`, `#rates`, `#insights` |
| This repo's Operator Portal (fractional job board, predictive prospects) | `#studio.opportunities` |

New surfaces that turn the directory into a system: Operator **Studio** (who viewed you and why, positioning, search and AI visibility, credibility and proof links, active engagements), client **Workspace** (shortlist, intros, engagements, and a Team tab with every hire and its terms), **Admin** console, **GTM Framework** explorer, **Fit Tag Library**, **Guides**, **Engagement Blueprints**, **Levels**, and **Field standards** (`#standards`).

## Run it

- Double-click `index.html` (works from `file://`), or
- `npm run dev` in the repo root and open `http://localhost:3000/prototype/index.html`.

Use the **Prototype** button (bottom left) to switch persona (Visitor, Client Jordan Ellis at Northwind Health, Operator Matt Lopez, Admin), walk a guided journey, move the clock forward, open the Outbox, switch theme, or reset demo data. State is saved in your browser.

## How it stays one system

- **One field registry** (`js/data/fields.js`). Every picklist renders from it through `RN.w.field`. Operator intake is the source of truth; filters, engagements, intros, hires, reviews, Studio and research reuse the same stored values.
- **One data model** (`js/data/model.js`). 100 operators from the live-data export, normalized once; search, match signals, analytics and market intelligence all read it.
- **One event log** (`RN.track`). A client's search, profile view, shortlist or intro request shows up in the operator's Studio and the Admin demand view.
- **One pricing rule.** Companies pay no fees; a client pays the operator's listed rate. Revenue Nomad charges operators a percentage of their billed earnings each month (proposed: 25%), which only operator-facing and Admin screens mention (`SPEC.md` §1, `DESIGN.md` Money and pricing copy).
- **One design system** (`css/tokens.css`, `css/components.css`): the live brand palette, Red Hat Display and Red Hat Text for UI and reading, Newsreader for the editorial voice, Red Hat Mono for data.

See `DESIGN.md` (build contract), `SPEC.md` (routes, loops, surface briefs, decisions) and `#standards` in the running prototype.

## Data

- Operators, photos, client logos, fit tags and the GTM Framework copy come from the live-data export behind the Operator Profile Explorer (`tools/build-data.js`, `tools/build-taxonomy.js`).
- Analytics history, market figures, companies in "who viewed" segments, jobs and prospects are **illustrative**, labelled as such in the UI.

## Tools

- `node tools/check.js [--routes a,b] [--personas visitor,buyer] [--width 390] [--theme dark] [--shots dir] [--full]`: headless smoke test of every route.
- `node tools/build-artifact.js`: bundles everything into `dist/artifact.html` for sharing as a single page. Published (private) at https://claude.ai/artifact/7dB7TB1ApErfENfBtrndnS.
