"use client";

/**
 * Rate benchmarks: what fractionals charge by GTM function and client revenue. The medians
 * come from rates on records, rates members shared for the benchmarks only, and Revenue
 * Nomad's Rate Index. A group shows numbers only with enough rates in it (RateStat.min: 5, or
 * 20 when the group includes Rate Index data), so no single rate can be traced back.
 *
 * "Share a rate privately" adds a rate that counts in the medians and is never shown on a
 * record or to another member. The member's own private rates are listed under the form.
 */
import { useMemo, useState } from "react";
import type { ActionResult, BenchRate, BenchmarkRow, RateStat, View } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { IconChevron, IconPlus, post, useToast } from "../ui/shared";
import { earnNote, useUi } from "./ui";
import { plural } from "./hooks";
import "./pages.css";

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 || n >= 20000 ? 0 : 1)}k` : `$${n}`);
const RATE_HELP = "Use a rate like $8k/mo or $150/hr.";
const PRICING = ["Monthly retainer", "Hourly"] as const;
type Pricing = (typeof PRICING)[number];

function Stat({ s, unit, floor }: { s: RateStat; unit: string; floor: number }) {
  const min = s.min ?? floor;
  if (s.median === undefined) {
    const need = Math.max(1, min - s.n);
    return (
      <span className="tp-bm-need">
        <span className="tp-bm-bar" role="img" aria-label={`${s.n} of ${min} rates on file`}>
          <span style={{ width: `${Math.min(100, (s.n / min) * 100)}%` }} />
        </span>
        <span className="muted">{plural(need, "more rate")} to show</span>
      </span>
    );
  }
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

/** Function, pricing model, rate and (optionally) client revenue. Sends benchRate and shows what the server says. */
function ShareRate({ refresh }: { refresh: () => Promise<void> }) {
  const ui = useUi();
  const toast = useToast();
  const [fn, setFn] = useState(ui.me.function && FUNCTIONS.includes(ui.me.function) ? ui.me.function : "");
  const [pricing, setPricing] = useState<Pricing>("Monthly retainer");
  const [rate, setRate] = useState("");
  const [revenue, setRevenue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const capped = earnNote(ui.me).capped;

  const submit = async () => {
    if (busy) return;
    if (!fn) return setErr("Pick the function the rate is for.");
    if (!rate.trim()) return setErr("Add the rate.");
    if (!readRate(rate, pricing)) return setErr(RATE_HELP);
    setErr(null);
    setBusy(true);
    const r = await post<ActionResult>({ action: { type: "benchRate", function: fn, pricing, rate: rate.trim(), ...(revenue ? { revenue } : {}) } });
    if (r.error) {
      setBusy(false);
      return setErr(r.error);
    }
    setRate("");
    toast(r.message || "Added to the benchmarks. Nobody sees your rate.");
    await refresh();
    setBusy(false);
  };

  return (
    <form
      className="tp-bm-share"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="tp-card-h">Share a rate privately</h2>
      <p className="tp-bm-share-lead">It counts in the medians and earns 1 credit. It is never shown on a record or to another member.</p>
      <div className="tp-bm-fields">
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-bm-fn">
            Function
          </label>
          <select id="tp-bm-fn" className="select" value={fn} onChange={(e) => (setFn(e.target.value), setErr(null))}>
            {!fn && <option value="">Pick one</option>}
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="tp-form-row">
          <span className="tp-lbl" id="tp-bm-pricing">
            Pricing model
          </span>
          <div className="tp-seg" role="radiogroup" aria-labelledby="tp-bm-pricing">
            {PRICING.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pricing === p} className={`tp-seg-b${pricing === p ? " on" : ""}`} onClick={() => (setPricing(p), setErr(null))}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-bm-rate">
            Rate
          </label>
          <input
            id="tp-bm-rate"
            className="input mono"
            autoComplete="off"
            placeholder={pricing === "Hourly" ? "$150/hr" : "$8k/mo"}
            value={rate}
            aria-invalid={!!err}
            aria-describedby={err ? "tp-bm-err" : undefined}
            onChange={(e) => (setRate(e.target.value), setErr(null))}
          />
        </div>
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-bm-rev">
            Client revenue <span className="tp-bm-opt">optional</span>
          </label>
          <select id="tp-bm-rev" className="select" value={revenue} onChange={(e) => setRevenue(e.target.value)}>
            <option value="">Not sure</option>
            {RN_REVENUE.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && (
        <p className="tp-ed-err" id="tp-bm-err" role="alert">
          {err}
        </p>
      )}
      <div className="tp-bm-share-foot">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sharing" : "Share privately"} {!capped && !busy && <span className="mono">+1</span>}
        </button>
        {capped && <span className="tp-small muted">{earnNote(ui.me).text}. It still counts in the medians.</span>}
      </div>
    </form>
  );
}

/** The member's own benchmark-only rates. Nobody else is sent these. */
function MyRates({ rates, view }: { rates: BenchRate[]; view: View }) {
  const ui = useUi();
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  // The company behind a rate shared from one of the member's own seats.
  const seatAt = useMemo(() => {
    const m = new Map<string, string>();
    if (rates.some((r) => r.engagementId)) for (const c of view.companies) for (const e of c.engagements) m.set(e.id, c.name);
    return m;
  }, [rates, view.companies]);
  const list = rates.filter((r) => !removing.has(r.id));
  if (!list.length) return null;
  const remove = async (id: string) => {
    setRemoving((s) => new Set(s).add(id));
    const r = await ui.act({ type: "benchRateRemove", id });
    if (!r.ok)
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
  };
  return (
    <div className="tp-bm-mine">
      <h3 className="tp-bm-mine-h">
        Rates you shared privately <span className="mono tp-cnt">{list.length}</span>
      </h3>
      <p className="tp-small muted">Only you see these. Removing one takes back the credit it earned.</p>
      <ul className="tp-bm-mine-list">
        {list.map((r) => {
          const co = r.engagementId ? seatAt.get(r.engagementId) : null;
          const amount = `${money(r.amount)}/${r.kind === "hourly" ? "hr" : "mo"}`;
          return (
            <li key={r.id} className="tp-bm-mine-row">
              <span className="mono tp-bm-mine-amt">{amount}</span>
              <span className="tp-bm-mine-what">
                {r.function}
                {co && <span className="muted"> · your seat at {co}</span>}
              </span>
              <button type="button" className="btn btn-sm btn-ghost tp-btn-red" onClick={() => void remove(r.id)} aria-label={`Remove your ${r.function} rate of ${amount}`}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Benchmarks({ view, refresh, onBack }: { view: View; refresh: () => Promise<void>; onBack: () => void }) {
  const ui = useUi();
  const [band, setBand] = useState("All");
  const b = view.benchmarks;
  if (!b) return null;
  const mine = ui.me.function;
  // Every function the server sends, the member's own first.
  const rows: BenchmarkRow[] = b.rows.filter((r) => (r.revenue ?? r.size) === band).sort((x, y) => (x.function === mine ? -1 : y.function === mine ? 1 : 0));
  const anyIndexed = rows.some((r) => r.indexed);
  return (
    <div className="tp-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Rate benchmarks</h1>
      <p className="tp-bm-lead">
        What fractionals charge, by function and client revenue. You see the median of a group and the range the middle half falls in, and only once the
        group has enough rates. No single rate can be traced back to a person or a company. {b.total ? `${plural(b.total, "rate")} on file.` : "No rates on file yet."}
      </p>
      <div className="tp-bm-tools">
        <span className="tp-flabel" id="tp-bm-band">
          Client revenue
        </span>
        <div className="tp-fchips" role="group" aria-labelledby="tp-bm-band">
          {["All", ...RN_REVENUE].map((s) => (
            <button key={s} type="button" aria-pressed={band === s} className={`chip tp-fchip${band === s ? " chip-on" : ""}`} onClick={() => setBand(s)}>
              {s === "All" ? "All revenue" : s}
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
        {rows.map((r) => (
          <div key={r.function} className={`tp-bm-row${r.function === mine ? " mine" : ""}`} role="row">
            <span className="tp-bm-fn" role="cell">
              {r.function}
              {r.function === mine && <span className="tp-member-badge">Yours</span>}
              {r.indexed && (
                <span className="tp-bm-index" title="Includes Revenue Nomad's Rate Index">
                  Rate Index
                </span>
              )}
            </span>
            <span role="cell">
              <Stat s={r.monthly} unit="mo" floor={b.minN} />
            </span>
            <span role="cell">
              <Stat s={r.hourly} unit="hr" floor={b.minN} />
            </span>
          </div>
        ))}
      </div>
      <p className="tp-bm-note">
        A group shows numbers at {b.minN} rates.
        {anyIndexed && " Groups marked Rate Index include Revenue Nomad's Rate Index, our survey and contract data. The survey promised groups of 20 or more, so those show numbers at 20 rates."}
      </p>

      <section className="tp-card tp-bm-sharecard">
        <ShareRate refresh={refresh} />
        <MyRates rates={ui.me.benchRates ?? []} view={view} />
      </section>

      <div className="tp-bm-cta">
        <p>Want it on the record instead? Add the rate to an engagement. It earns 1 credit, and members unlock it for 1.</p>
        <button type="button" className="btn" onClick={() => ui.openAdd({ mode: "engagement" })}>
          <IconPlus size={14} /> Add a rate
        </button>
      </div>
    </div>
  );
}
