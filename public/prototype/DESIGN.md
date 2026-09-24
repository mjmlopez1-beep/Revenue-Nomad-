# Revenue Nomad master prototype: build contract

This folder is one static prototype (no build step) that merges:

- **Site prototype** (homepage, browse, results, about, talk to us)
- **Operator Profile Explorer** (the profile page, the visual source of truth)
- **Projects prototype** (buyer projects, operator responses, admin, outbox)
- **State of Fractional GTM 2027** report mockup
- **This repo's Operator Portal** (fractional job board, predictive prospects)

Open `index.html` directly (file://), through `npm run dev` at `/prototype/index.html`, or as the published artifact.

## The founder's three rules (non-negotiable)

1. **Simplicity.** Minimal clicks in every flow. Prefill what we know. One primary action per screen. No dead ends: every empty state has a next step.
2. **Design-forward and consistent.** One brand across every flow. Fonts are chosen, never defaulted (see Type). No new fonts, no system-ui, no Inter.
3. **Standardization.** Every standard field is defined once in `js/data/fields.js` and rendered with `RN.w.field(key, value)`. Browse filters, project posting, the buyer company profile, operator intake, Studio edits, compare rows and admin tools all use the same keys, labels, option order and stored values. Never hard-code a picklist in a view.

And the product thesis: operators get value **even when no intro happens** (who viewed, impressions and why, positioning, credibility for direct deals, SEO and AEO visibility), the more they invest the more they get, and the platform builds **its own IP** (Reputation Index, CORE reviews, GTM Framework, Fit Tag Library, Rate Index, State of Fractional research, Engagement Blueprints). The homepage is a destination for everything Fractional GTM.

## File ownership

Each surface owns exactly one JS file in `js/views/` and one CSS file in `css/views/`. Do not edit core files (`js/core/*`, `js/data/*`, `css/tokens.css`, `css/base.css`, `css/components.css`, `index.html`) from a view task. If you need a shared helper, write it inside your view file under your own namespace, and list it in your hand-off notes so it can be promoted.

Scope view CSS under the view: `[data-view="studio"] .x {}` or a view prefix class (`.st-*`, `.pf-*`).

## Architecture (classic scripts, global `RN`)

| API | Use |
|---|---|
| `RN.view(name, {route, nav, chrome, footer, requires, title, render, mount, unmount})` | Register a screen. `route` is dot tokens: `'op.:slug'`, `'studio.:tab'`. `chrome: 'over'` = transparent header over a dark hero. `requires: 'buyer'/'operator'/'admin'` shows a sign-in gate. |
| `RN.go('studio.visibility')` / `<a href="#studio.visibility">` | Navigate. Routes use dots, never slashes or query strings. |
| `RN.rerender()` | Re-render the current screen in place after state changes. |
| `RN.h\`...\`` | Template join (arrays joined, null/false dropped). **Does not escape.** |
| `RN.esc(s)` | Escape every piece of data you print. |
| `RN.icon(name)` | Inline SVG icon. Names in `js/core/rn.js` (`RN.iconNames`). Never emoji. |
| `RN.fmt.*` | `int compact usd usdK rate pct plural date dateShort monthYear ago initials first` |
| `RN.now()` / `RN.daysAgo(n)` | Simulated clock (the dock can advance time). Never `new Date()` for "now". |
| `RN.rng(seed)` | Deterministic random for stable demo numbers. |
| `RN.store.state` | Shared state (see below). Mutate with `RN.store.update(s => {...}, 'key')` or `RN.store.set(key, value)`. |
| `RN.track(type, data)` | Log an analytics event. Studio and Admin read these, so every buyer action must track. |
| `RN.mail(to, subject, body, kind)` | Put an email in the Outbox (dock). Every system email must go here. |
| `RN.model` | Operators and analytics (see below). |
| `RN.fields` / `RN.w` | Field registry and widgets (see Standard fields). |
| `RN.ui` | Components: `avatar avail ftag ftags stars ris tip catDot empty delta logo opCard gate modal drawer closeModal toast formData`. |
| `RN.chart` | SVG charts: `spark bars columns line radar bell ring funnel`. |
| `RN.personas`, `RN.me()`, `RN.myOp()` | Prototype personas: visitor, buyer (Jordan Ellis, COO, Northwind Health), operator (Matt Lopez), admin. |

### Events (data attributes, delegated globally)

- `data-act="name"` + `RN.actions.name = (el, ev) => {}` for clicks (buttons, chips).
- `data-input="name"` / `data-change="name"` + `RN.inputs.name = (el, ev) => {}`.
- `<form data-submit="name">` + `RN.submits.name = (form, data, ev) => {}` (data from `RN.ui.formData`, multi-value fields arrive as arrays).
- `data-tip="html"` on a `.tip` button (use `RN.ui.tip(html)`) for the "i" explainer.
- Prefix every action name with your view (`studio-`, `pf-`, `br-`) to avoid collisions. Shared actions already exist: `shortlist-toggle`, `compare-toggle`, `compare-clear`, `login`, `persona`, `go`, `modal-close`, `intro-open` (intro request flow), `w-chip`, `w-tag-add`, `w-tag-remove`.

### Store keys

`persona, theme, clockOffsetDays, browse{q,tags,filters,sort,view}, shortlist[opId], compare[opId], intros[], projects[], events[], reviewRequests[], reviews[], proofLinks[], outbox[], signup, pending[], edits{opId:{...}}, seen{}`

Shapes (keep them; other surfaces read them):

- intro: `{id, opId, buyer:{name,title,email,company:{...firmographics}}, need, fields:{roleCategory,hoursPerMonth,startBy,...}, status: RN.fields.introStatus slug (pending | interested | rn_qualified | introduced | hired | declined), createdAt, thread:[{from,text,ts}], declineReason?, passReason?}`
- project: `{id, status:'draft'|'posted'|'in_progress'|'staffed'|'closed', title, template, fields:{...standard keys}, brief, invited:[opId], responses:[{opId,status:'interested'|'declined',note,rate,ts}], createdAt, postedAt}`
- event: `{id, type, ts, persona, opId?, q?, filters?, source?, buyer?:{name,industry,revenueRange,employeeRange}, meta?}`
  Types: `search, impression, profile_view, shortlist_add, shortlist_remove, compare_add, compare_view, intro_request, project_post, project_invite {projectId, source}, project_select, proof_view, review_request, review_submit, signup_submit, studio_action {action: tag_add|headline_apply|digest_send}, contact_submit {kind: talk|call}, research_cta, research_share, rate_estimate, newsletter_signup`
- Intro sheet with prefill: `RN.intro.open(opId, {need, startBy, hoursPerMonth, engagementType, note, name, email, company, industry, revenueRange, employeeRange})`.
- Tier unlock copy: `RN.fields.risUnlocks[tier]` (one source for Studio, For operators and Levels).
- Reputation Index factor breakdown: always `RN.model.risFactors(op)` (one formula for Studio, Credibility and Levels).
- Projects post through `#project.new` or `#project.new.<blueprintId|draftId>`; shared helpers live on `RN.projects` (respond, stage, allIn, payFor, get, blueprints).
- reviewRequest: `{id, opId, reviewer:{name,email,company,title}, status:'sent'|'completed', sentAt, completedAt}` (operators only ever see Sent and Completed)
- proofLink: `{id, opId, prospect:{company,contact}, sections:[...], createdAt, views:[{ts, seconds, sections:[...]}]}`

## Standard fields

Defined once in `js/data/fields.js`, sourced from live signup and the Product Feedback sheet. Examples of keys: `roleCategory, role, availability, startDate, hoursPerMonth, newClientCapacity, engagementTypes, rate, revenueRange, employeeRange, industries, salesMotions, methodologies, crm, location, timezone, fitTags, stackComplexity, codeCapability, automationScale, stackProficiency, coreDims, risFactors, reviewStatus`.

```js
RN.w.field('revenueRange', ['5m_20m'], { name: 'revenueRange' })   // label + help + control
RN.w.control('availability', 'available_now', { change: 'br-filter' })  // control only
RN.w.label('revenueRange', '50m_plus')  // "$50M+" for display
```

Stored values are slugs (`available_2_plus_weeks`, `50m_plus`). Display with `RN.w.label`. Filters and project briefs store the same slugs as operator profiles, which is what lets `RN.model.search` and `RN.model.fit` match them with no translation.

## Operator model

`RN.model.ops` (approved, visible operators), `RN.model.byId(id)`, `RN.model.bySlug(slug)`, `RN.model.search({q, tags, filters, sort})`, `RN.model.fit(op, brief)`, `RN.model.analytics(opId, {days})`, `RN.model.market()`.

Operator shape: `{id, slug, name, first, initials, role, cat, catKey, headline, bio, photo, location, timezone, rate, avail:{key,label,startDate,hours}, industries[], revenueRanges[], employeeRanges[], crm, methodologies[], motions[], tags:[{t,c,g,tier,axis,stage}], reviews[], ris:{score,label}, engagements[], clients[], completeness, level, isMatt, raw}`

## Design system

**Palette** (tokens in `css/tokens.css`, light and dark): paper `--paper #F5F4EE`, ink `--ink #0E1411`, forest `--forest #095D42`, leaf `--leaf #C2E7B0`, night bands `--night`. Use semantic tokens (`--accent`, `--btn`, `--mute`, `--line`, `--card`) so dark mode works. State colors (`--good --warn --bad --info --gold`) are for status only. Never hard-code a hex in a view.

**Type** (deliberate, from the live brand):

- `Red Hat Display` for headings, nav, buttons, eyebrows and big numbers (`--f-display`).
- `Red Hat Text` for running text and dense UI (`--f-text`, the body default).
- `Newsreader` for the editorial voice: italic accents in headlines (`<span class="serif">`), operator names (`.serif-up`), pull quotes (`--f-serif`).
- `Red Hat Mono` for data only: code, schema snippets, slugs (`.mono`).

Classes: `.h-hero .h1 .h2 .h3 .h4 .h5 .lede .body .small .tiny .muted .eyebrow .label .kicker .serif .serif-up .num .tnum .mono .prose`.

**Buttons**: `.btn` (forest, uppercase Display, the live brand CTA), `.btn-leaf` (primary on dark), `.btn-line`, `.btn-ghost`, sizes `.btn-sm .btn-lg`. Low-emphasis inline actions use `.act` (sentence case). One primary button per screen area.

**Surfaces**: `.card` (white, hairline, 16px radius) only for objects that stand apart. Sections sit on the paper. `.night` for dark bands. Cards in a row share edges and padding.

**Layout**: `.wrap` (1240 max), `.wrap-narrow` (880), `.section`, `.stack`, `.row`, `.grid .g-2 .g-3 .g-4 .g-auto`, `.shell` + `.side` for Studio, Workspace and Admin. Everything must work at 390px wide with no horizontal scroll (tables go inside `.tbl-wrap`).

**Components**: `.chip .pill(-good/-warn/-bad/-info/-accent/-gold) .ftag(.claimed) .opc .ris .field .input .select .textarea .chipset .optcards .tagpick .tabs .tab .seg .stat .stat-v .stat-l .delta .stats-row .meter .tbl .tip .modal .drawer .toast .stepper .phead .crumbs .empty .note .switch`.

**Copy voice**: plain, specific, active voice, written from the reader's side. Buttons say exactly what happens ("Request intro", then toast "Intro requested"). No em-dash asides, no "not X but Y", no hype, no emoji. Labels match the standard field labels exactly.

**Charts**: `RN.chart.*` only; they read theme tokens. Label illustrative data as illustrative.

**Motion**: subtle. `.view-enter` on route change, hover lifts on cards. Respect reduced motion (base.css handles it).

## Quality bar for every surface

- Renders with zero console errors at 1440 and 390 widths, light and dark.
- Every button does something real in the prototype (navigates, changes state, opens a modal, toasts).
- Every buyer action that an operator would care about calls `RN.track` so Studio shows it.
- Uses only standard fields for any structured input.
- Checks: `node tools/check.js` (headless smoke test of every route) once available.
