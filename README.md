# The Nomad Benchmark

Give-to-get market intelligence for fractional GTM operators, built to spec v1.1.
Operators contribute engagement-level actuals, deal outcomes, weekly pipeline
pulses, and buyer signals; in exchange they get the data fractionals actually
crave, at the cadence they crave it. The marquee asset is **realization rate** —
actual billed vs profile list rate — computable only because Revenue Nomad holds
both sides of the number.

## Quick start

```bash
npm install
npm run seed     # regenerate data/seed.json (300 operators, RN roster, Bill.com history)
npm run dev      # http://localhost:3000
```

- **Operator app** — `/` → pick any operator (v1 internal preview; production is
  magic-link email auth). `op_001` (Ava Torres) is staged to show the full first
  session: one RN engagement confirmed+verified, one still pre-filled awaiting a
  one-tap confirm, one self-reported client, this week's pulse unanswered, a live
  4+-week streak (×1.25 multiplier visible on every award).
- **Admin console** — `/admin`, key `dev-admin` (set `NB_ADMIN_KEY` in prod).
- **Tuesday Tape Drop email** — `npm run tape-drop -- --limit 3`. Without
  `RESEND_API_KEY` the emails are written to `data/outbox/*.html`, complete with
  working one-click pulse links you can open locally.

## The cadence architecture (spec §2)

| Cadence | Surface | Gate | Fuel |
|---|---|---|---|
| Daily | Demand Feed (signals, RN intake, live tape) | **Recency** — any contribution in the last 7 days; headlines visible to all | everything |
| Weekly | Tape Drop: Demand Index, anonymized deal tape, question of the week | Current-week index requires **this week's pulse** (you can't read the index without being in it); 12-week trend costs credits | the 10-second pipeline pulse (+5) |
| Monthly | The edition: actual retainers, **realization rate**, win rates, pricing, utilization | **Credits, per edition** — unlocks expire when the edition closes; flagship panel free with any contribution this cycle | per-client census |
| Quarterly | Per-client refresh clocks (staggered), State of Fractional GTM (phase 2) | — | +10 per refresh |

Dual gating is deliberate: recency gates drive the habit on perishable demand
data; credit gates drive depth on durable benchmark data.

## Hard rules (spec §1) and where they're enforced

1. **Credits never affect buyer matching** — nothing in this codebase touches
   matching.
2. **Individual data is never shown** — enforced once, in `lib/aggregate.ts`:
   cells under 5 distinct operators are suppressed, all central tendencies are
   medians (weighted; verified rows ×2), the tape carries no operator or company
   identity, and signal company names surface only in the admin CRM.
3. **Each question pays once** — uniqueness enforced per flow (one pulse per
   operator-week, one actuals entry per client, one answer per question) with
   caps in `lib/credits.ts`; recurring credits come only from recurring reality
   (new clients, weekly pulses, quarterly refreshes, debriefs).

## Verification via Bill.com (spec §6)

- RN-placed engagements arrive **pre-filled** from Bill.com records (seeded via
  `scripts/seed.ts`; in production via the operator/roster import). One-tap
  confirmation pays +10 and marks the row verified immediately. If the operator
  adjusts the billed amount, the row drops to unverified until the next
  reconciliation.
- v1 reconciliation is the admin screen: paste the monthly Bill.com CSV export
  (`client_id,invoice_amount` or `operator_email,client_name,invoice_amount`);
  rows within 5% are marked verified (2× aggregate weight), mismatches flagged.
  The v1.5 API sync replaces the upload and auto-triggers debrief prompts when
  recurring invoices stop — same matching logic, same tables.
- Off-platform actuals are self-reported and labeled as such; the edition shows
  "X% verified against invoices". Plausibility violations (retainers outside
  $1k–$40k, cycles >52 weeks) route to the moderation queue with credits held.

## Architecture

Next.js 15 (App Router) + TypeScript, no CSS framework (visual system carried
from the v2 dashboard: light ground, deep greens, the tape, veils). The store is
a JSON file (`lib/store.ts`, runtime DB at `data/benchmark.json`, bootstrapped
from the committed `data/seed.json`) whose shape mirrors the target Postgres
schema — `clients`, `pulse_responses`, `demand_index_snapshots`,
`billcom_reconciliations` are arrays today and tables in v1.5; every access goes
through `loadDb`/`saveDb`, so the migration replaces one module.

```
lib/
  types.ts       data model (spec §7 schema)
  config.ts      economy defaults + display labels
  store.ts       JSON store (swap for Postgres in v1.5)
  credits.ts     earning, caps, streak multiplier, balances
  gates.ts       recency gate, pulse gate, per-edition unlocks
  aggregate.ts   medians, n≥5 suppression, realization, Demand Index, tape
  sign.ts        HMAC-signed one-click pulse tokens
  email.ts       Tape Drop composer + Resend/outbox sender
app/
  page.tsx                  landing: public teasers + sign-in
  dashboard/                Today / Tape Drop / Edition / Contribute
  pulse/[token]/            one-click email pulse landing (no login)
  admin/                    metrics vs §8 kill criteria, signal CRM,
                            reconciliation, moderation, QoW, economy config
  api/                      state + all contribution/unlock/admin routes
scripts/
  seed.ts        deterministic import: operators, list rates, RN roster,
                 Bill.com history, 12 weeks of pulses/deals/signals
  tape-drop.ts   Tuesday email send (cron: 0 14 * * 2)
```

The entire economy — every earn value, spend price, gate, cap, streak
multiplier, plausibility band — lives in the admin-editable config
(`/admin` → Economy) and retunes **without a deploy**.

## Decisions on the open questions (spec §10)

- **One-click pulse: signed links.** Each button in the Tuesday email carries an
  HMAC token (`operator, week, band`). Tapping records the answer and grants
  credits with no session and no login — literally one click on mobile. Tokens
  are week-scoped (bounded replay) and idempotent (one pulse per operator-week).
  A magic-link session would add a redirect and a cookie prompt for nothing.
- **Segment follows: fixed list** (function × industry × stage), because it
  matches the aggregation dimensions exactly and keeps the 1-alert/day promise
  enforceable. Free-form tags reopen the anonymity problem in reverse.
- **Past-engagement launch bonus: yes** — +5 on top of +15, expiring
  `launchWindowDays` (30) after `launchDate`, both config values. Front-loads
  historical depth in the first 30 days and turns itself off.
- **Trigger-event ingestion: phase 2, build-not-buy deferred.** The Demand Feed
  renders an RN-intake lane from the signal pipeline today; the feed row model
  already accommodates external trigger events when a scraper or data feed
  lands.

## Environment

See `.env.example`: `NB_LINK_SECRET` (signs pulse links), `NB_ADMIN_KEY`,
`NB_BASE_URL` (email links), `RESEND_API_KEY` (optional; outbox preview without
it), `NB_DATA_DIR` (persistent disk in prod). PostHog and the Recharts upgrade
are wired-in-name only in v1 — analytics events and chart library can be added
without structural change (charts are self-contained components).

## Metrics vs kill criteria (spec §8)

The admin console tracks them live: weekly pulse response rate (targets 25% wk2
/ 40% wk6 / 55% wk12, kill <20% by wk8 after two retunes), engagement-actuals
coverage (40% by wk6), verified share (≥25%), signals/month (≥10 by wk4),
signal conversion (≥10%).
