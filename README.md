# Revenue Nomad Scorecard

A single-file scorecard app for tracking Revenue Nomad's Sep 2026 – Aug 2027 plan: six core metrics, monthly pace vs goal, a deal book, and automatic gap diagnosis.

## Tabs

- **Trend** — GMV and RN profit per month, actual vs goal, plus a full month-by-month table. Actuals are computed from deals marked Closed won only.
- **Pace** — Supply, Demand, and Lagging metrics for the selected month with on-pace / behind / off-track status and a funnel diagnosis of where the gap is.
- **Inputs** — end-of-month actuals for the leading indicators (reviews, signups, intros, calls, plus diagnostics).
- **Deals** — the deal book. One row per billing phase; only Closed won rows count toward actuals.
- **Plan** — the full monthly plan and the assumptions behind it.

## Running it

`index.html` is fully self-contained — open it in any browser. Data is kept in `localStorage`.

When published as a Claude artifact (with the `artifact` capability declared), the app also saves its data back into the artifact as `data/state.json`, so the same numbers appear on every device where the artifact is opened. On load, the newer of the published state and the local backup wins.
