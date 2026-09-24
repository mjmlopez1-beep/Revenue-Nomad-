// Operator Insights: how often buyers find, open and compare this profile, week over
// week, and the search terms behind the profile views.

import { useState } from "react";
import type { Operator } from "../../lib/types";
import { operatorById } from "../../lib/data";
import { useSession, useStore } from "../../lib/store";
import { METRICS, changeLabel, operatorInsights, type Insights, type Metric } from "../../lib/insights";
import { shortDate } from "../../lib/format";
import { Link } from "../../lib/router";

const RANGES = [7, 30, 60, 90] as const;
type Range = (typeof RANGES)[number];

function readRange(): Range {
  try {
    const v = Number(sessionStorage.getItem("rnp:insights-range"));
    return (RANGES as readonly number[]).includes(v) ? (v as Range) : 30;
  } catch {
    return 30;
  }
}

export function LiveInsights() {
  const s = useStore();
  const sess = useSession();
  const op = operatorById(sess.operatorId)!;
  const [range, setRangeState] = useState<Range>(readRange);
  const setRange = (r: Range) => {
    setRangeState(r);
    try {
      sessionStorage.setItem("rnp:insights-range", String(r));
    } catch {
      /* per-viewer convenience only */
    }
  };
  const ins = operatorInsights(s, op, range);
  const rate = ins.totals.impressions ? Math.round((ins.totals.views / ins.totals.impressions) * 100) : 0;
  return (
    <div className="lv-stack">
      <div className="lv-pagehead">
        <div>
          <h1>Insights</h1>
          <p>How often buyers find you in search, open your profile and compare you, and the searches that bring them to you.</p>
        </div>
        <div className="lv-tabs" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} data-testid={`range-${r}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <section className="lv-kpis" data-testid="insight-kpis">
        {METRICS.map((m) => {
          const ch = changeLabel(ins.totals[m.key], ins.prev[m.key]);
          return (
            <div key={m.key} className="lv-kpi" data-testid={`kpi-${m.key}`}>
              <span>{m.label}</span>
              <b className="num">{ins.totals[m.key].toLocaleString("en-US")}</b>
              <small className={ch.up === null ? "" : ch.up ? "lv-ok-t" : "lv-warn-t"}>
                {ch.text} <span className="lv-muted">vs previous {range} days</span>
              </small>
            </div>
          );
        })}
        <div className="lv-kpi">
          <span>View rate</span>
          <b className="num">{rate}%</b>
          <small className="lv-muted">Searches that led to a profile view</small>
        </div>
      </section>

      <section className="lv-card">
        <div className="lv-card-head">
          <div>
            <h2>Week over week</h2>
            <p>The last 13 weeks, newest on the right. Hover or tap a bar for the week.</p>
          </div>
        </div>
        <div className="lv-multiples">
          {METRICS.map((m) => (
            <WeekChart key={m.key} ins={ins} metric={m.key} label={m.label} unit={m.unit} />
          ))}
        </div>
        <details className="lv-tableview">
          <summary>Show as a table</summary>
          <div className="lv-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Week of</th>
                  {METRICS.map((m) => (
                    <th key={m.key}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...ins.weeks].reverse().map((w) => (
                  <tr key={w.start}>
                    <td>{shortDate(w.start)}</td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="num">
                        {w[m.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="lv-card" data-testid="top-terms">
        <div className="lv-card-head">
          <div>
            <h2>Top searches that led to your profile</h2>
            <p>Last {range} days. Appearances are how often you showed up for the search; views are the times a buyer then opened your profile.</p>
          </div>
        </div>
        {!ins.terms.length && <div className="lv-empty">No profile views from search in this period yet.</div>}
        <TermsList terms={ins.terms} />
        {ins.weakTerm && (
          <div className="lv-insight" data-testid="weak-term">
            <span>
              You showed up for <b>“{ins.weakTerm.term}”</b> {ins.weakTerm.impressions} times but got {ins.weakTerm.views} view{ins.weakTerm.views === 1 ? "" : "s"}. Put it in your headline so buyers see why you match.{" "}
              <Link to={`/operators/${op.slug}`} className="lv-link">
                Edit profile
              </Link>
            </span>
          </div>
        )}
      </section>
      <p className="lv-fine">Weeks before {shortDate(ins.sampleUntil)} use sample history for this prototype. Everything after comes from real searches, profile opens and compares in the app.</p>
    </div>
  );
}

export function WeekChart({ ins, metric, label, unit }: { ins: Insights; metric: Metric; label: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 96;
  const pad = { t: 8, b: 18 };
  const vals = ins.weeks.map((w) => w[metric]);
  const max = Math.max(1, ...vals);
  const n = vals.length;
  const slot = W / n;
  const bw = Math.min(14, slot - 6);
  const idx = hover ?? n - 1;
  const cur = vals[n - 1];
  const prev = vals[n - 2] ?? 0;
  const ch = changeLabel(cur, prev);
  const h = (v: number) => ((H - pad.t - pad.b) * v) / max;
  const base = H - pad.b;
  return (
    <figure className="lv-mult" data-testid={`chart-${metric}`}>
      <figcaption>
        <span>{label}</span>
        <small className={ch.up === null ? "lv-muted" : ch.up ? "lv-ok-t" : "lv-warn-t"}>This week {ch.text === "New" ? "is new" : ch.text.startsWith("Same") ? "same as last" : `${ch.text} vs last`}</small>
      </figcaption>
      <p className="lv-readout" aria-live="polite">
        <b className="num">{vals[idx]}</b> {unit}
        {vals[idx] === 1 ? "" : "s"} <span className="lv-muted">week of {shortDate(ins.weeks[idx].start)}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${label} by week: ${vals.join(", ")}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={base} y2={base} className="lv-axis" />
        {vals.map((v, i) => {
          const x = i * slot + (slot - bw) / 2;
          const bh = Math.max(v ? 2 : 0, h(v));
          const r = Math.min(4, bh / 2, bw / 2);
          const on = i === idx;
          return (
            <g key={i}>
              <path
                d={bh ? `M${x},${base} v${-(bh - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${bh - r} z` : ""}
                className={on ? "lv-bar-on" : i === n - 1 ? "lv-bar-now" : "lv-bar"}
              />
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        <text x="0" y={H - 4} className="lv-tick">
          {shortDate(ins.weeks[0].start)}
        </text>
        <text x={W} y={H - 4} className="lv-tick" textAnchor="end">
          This week
        </text>
      </svg>
    </figure>
  );
}

export function TermsList({ terms }: { terms: Insights["terms"] }) {
  return (
        <ol className="lv-terms">
      {terms.map((t, i) => {
        const max = terms[0].views || 1;
        const delta = t.views - t.prevViews;
        return (
          <li key={t.term} data-testid="term-row" data-term={t.term}>
            <span className="lv-term-rank num">{i + 1}</span>
            <span className="lv-term-main">
              <b>“{t.term}”</b>
              <span className="lv-term-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(4, (t.views / max) * 100)}%` }} />
              </span>
            </span>
            <span className="lv-term-n num">
              <span>
                <b>{t.views}</b> view{t.views === 1 ? "" : "s"}
              </span>
              <small>
                {t.impressions} appearances · {t.impressions ? Math.round((t.views / t.impressions) * 100) : 0}% view rate
              </small>
            </span>
            <span className={`lv-term-d num ${delta > 0 ? "lv-ok-t" : delta < 0 ? "lv-warn-t" : "lv-muted"}`}>{!t.prevViews ? "New" : delta === 0 ? "Same" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function useInsightHeadline(op: Operator) {
  const s = useStore();
  const ins = operatorInsights(s, op, 7);
  return { views: ins.totals.views, change: changeLabel(ins.totals.views, ins.prev.views) };
}
