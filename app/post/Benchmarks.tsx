"use client";

/**
 * Rate benchmarks: what fractionals charge by GTM function and company size, from the rates
 * members added. A group shows numbers only with enough rates in it (View.benchmarks.minN),
 * so no single rate can be traced back; smaller groups say how many more they need.
 */
import { useState } from "react";
import type { BenchmarkRow, RateStat, View } from "@/lib/tableTypes";
import { RN_EMPLOYEES } from "@/lib/tableFields";
import { IconChevron, IconPlus } from "../ui/shared";
import { useUi } from "./ui";

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 || n >= 20000 ? 0 : 1)}k` : `$${n}`);

function Stat({ s, unit, minN }: { s: RateStat; unit: string; minN: number }) {
  if (s.median === undefined)
    return (
      <span className="tp-bm-need">
        <span className="tp-bm-bar" aria-hidden>
          <span style={{ width: `${(s.n / minN) * 100}%` }} />
        </span>
        <span className="muted">
          {s.n ? `${minN - s.n} more rate${minN - s.n > 1 ? "s" : ""} to show` : `Needs ${minN} rates`}
        </span>
      </span>
    );
  return (
    <span className="tp-bm-val">
      <b className="mono">
        {money(s.median)}
        <span className="tp-bm-unit">/{unit}</span>
      </b>
      <span className="tp-small muted mono">
        {money(s.p25!)}–{money(s.p75!)} · {s.n} rates
      </span>
    </span>
  );
}

export function Benchmarks({ view, onBack }: { view: View; onBack: () => void }) {
  const ui = useUi();
  const [size, setSize] = useState("All");
  const b = view.benchmarks;
  if (!b) return null;
  const rows = b.rows.filter((r) => r.size === size);
  const mine = ui.me.function;
  const sorted: BenchmarkRow[] = [...rows].sort((x, y) => (x.function === mine ? -1 : y.function === mine ? 1 : 0));
  return (
    <div className="tp-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Rate benchmarks</h1>
      <p className="tp-bm-lead">
        What fractionals charge, from rates members added. Each group shows its median and middle half once it has {b.minN} rates, so no single rate can
        be traced back. {b.total ? `${b.total} rates on file.` : "No rates on file yet."}
      </p>
      <div className="tp-bm-tools">
        <span className="tp-flabel">Company size</span>
        <div className="tp-fchips">
          {["All", ...RN_EMPLOYEES].map((s) => (
            <button key={s} type="button" aria-pressed={size === s} className={`chip tp-fchip${size === s ? " chip-on" : ""}`} onClick={() => setSize(s)}>
              {s === "All" ? "All sizes" : s}
            </button>
          ))}
        </div>
      </div>
      <div className="tp-bm" role="table" aria-label="Rate benchmarks">
        <div className="tp-bm-row tp-bm-head" role="row">
          <span role="columnheader">Function</span>
          <span role="columnheader">Monthly retainer</span>
          <span role="columnheader">Hourly</span>
        </div>
        {sorted.map((r) => (
          <div key={r.function} className={`tp-bm-row${r.function === mine ? " mine" : ""}`} role="row">
            <span className="tp-bm-fn" role="cell">
              {r.function}
              {r.function === mine && <span className="tp-member-badge">Yours</span>}
            </span>
            <span role="cell">
              <Stat s={r.monthly} unit="mo" minN={b.minN} />
            </span>
            <span role="cell">
              <Stat s={r.hourly} unit="hr" minN={b.minN} />
            </span>
          </div>
        ))}
      </div>
      <div className="tp-bm-cta">
        <p>Know what a seat paid? Add the rate to an engagement. It earns 1 credit and fills in the benchmark for everyone.</p>
        <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ mode: "engagement" })}>
          <IconPlus size={14} /> Add a rate
        </button>
      </div>
    </div>
  );
}
