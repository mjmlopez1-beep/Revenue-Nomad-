"use client";

/**
 * Rate benchmarks: what fractionals charge by GTM function and client revenue. The medians
 * come from rates on seats, rates members shared for the benchmarks only, and Revenue
 * Nomad's Rate Index. A group shows numbers only with enough rates in it (RateStat.min: 5, or
 * 20 when the group includes Rate Index data), so no single rate can be picked out.
 *
 * It is a real table: one row per function, and for each way of charging a median, the
 * middle half and the number of rates, right-aligned so they scan down the column. On phones
 * each row stacks into two columns, monthly and hourly.
 *
 * "Share a rate privately" adds a rate that counts in the medians and is never shown on a
 * seat or to another member. The member's own private rates are listed under the form.
 */
import { useMemo, useState } from "react";
import type { ActionResult, BenchRate, BenchmarkRow, RateStat, View } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { IconChevron, IconPlus, post, useToast } from "../ui/shared";
import { earnNote, useUi } from "./ui";
import { fmtTime } from "./hooks";
import "./pages.css";

/**
 * A number set in tabular figures. This face's tabular period, comma and colon are a full
 * digit wide ("$7 . 5k"), so they are set proportional: the digits still line up in a column.
 * Use it for a figure on its own, never for a sentence.
 */
export function Num({ children }: { children: string | number }) {
  const parts = String(children).split(/([.,:])/);
  return (
    <span className="num">
      {parts.map((x, k) =>
        k % 2 ? (
          <span key={k} className="np">
            {x}
          </span>
        ) : (
          x
        ),
      )}
    </span>
  );
}

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 || n >= 20000 ? 0 : 1)}k` : `$${n}`);
const RATE_HELP = "Write it like $8k/mo or $150/hr.";
const PRICING = ["Monthly retainer", "Hourly"] as const;
type Pricing = (typeof PRICING)[number];

/** The three cells for one way of charging: median, middle half, number of rates. `side` places them on phones. */
function Stat({ s, side, cap }: { s: RateStat; side: "m" | "h"; cap: string }) {
  if (s.median === undefined) {
    const need = Math.max(1, s.min - s.n);
    return (
      <>
        <td colSpan={2} className={`bm-${side} bm-need`} data-cap={cap}>
          <span className="bm-need-in">
            <span className="tp-bm-bar" aria-hidden>
              <span style={{ width: `${Math.min(100, (s.n / s.min) * 100)}%` }} />
            </span>
            <span className="num">{s.n === 0 ? `Needs ${s.min} rates` : `Needs ${need} more`}</span>
          </span>
        </td>
        <td className={`num bm-${side} bm-n`}>
          {s.n}
          <span className="bm-n-of"> of {s.min}</span>
        </td>
      </>
    );
  }
  return (
    <>
      <td className={`bm-${side} bm-med`} data-cap={cap}>
        <Num>{money(s.median)}</Num>
      </td>
      <td className={`bm-${side} bm-range`}>
        <Num>{`${money(s.p25!)}–${money(s.p75!)}`}</Num>
      </td>
      <td className={`num bm-${side} bm-n`}>{s.n}</td>
    </>
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
    toast(r.message || "Added to the benchmarks. Only you can see it, in the list below.");
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
      <p className="tp-bm-share-lead">
        Add a rate to the benchmarks without putting it on a seat. It counts in the medians and earns you 1 credit. No member sees it, and it is never shown with your name or a company.
      </p>
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
            className="input"
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
          {busy ? "Sharing" : "Share privately"}
        </button>
        <span className="tp-bm-earn">
          {capped
            ? `You've earned today's ${ui.me.earnCap} credits, so this one earns nothing${ui.me.earnResetsAt ? ` until ${fmtTime(ui.me.earnResetsAt)}` : ""}. It still counts in the medians.`
            : "Earns 1 credit."}
        </span>
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
      <h3 className="tp-bm-mine-h">Rates you shared privately</h3>
      <p className="tp-bm-mine-p">Only you can see this list. Remove a rate and it leaves the medians, and the credit it earned comes off your balance.</p>
      <ul className="tp-bm-mine-list">
        {list.map((r) => {
          const co = r.engagementId ? seatAt.get(r.engagementId) : null;
          const per = r.kind === "hourly" ? "an hour" : "a month";
          const amount = `${money(r.amount)} ${per}`;
          return (
            <li key={r.id} className="tp-bm-mine-row">
              <span className="tp-bm-mine-amt">
                <Num>{money(r.amount)}</Num> {per}
              </span>
              <span className="tp-bm-mine-what">
                {r.function}
                {co && <span className="muted">, your seat at {co}</span>}
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
  const rows: BenchmarkRow[] = b.rows.filter((r) => r.revenue === band).sort((x, y) => (x.function === mine ? -1 : y.function === mine ? 1 : 0));
  // The higher floor, for groups that include Rate Index data.
  const indexMin = Math.max(0, ...rows.filter((r) => r.indexed).flatMap((r) => [r.monthly.min, r.hourly.min]));
  return (
    <div className="tp-page bm-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Rate benchmarks</h1>
      <p className="tp-bm-lead">
        What fractionals charge, by function and by the client&apos;s revenue.{" "}
        {b.total ? `${b.total.toLocaleString("en-US")} ${b.total === 1 ? "rate" : "rates"} so far, from seats, private shares and Revenue Nomad's Rate Index.` : "No rates yet. Yours can be the first."}
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
      <div className="tp-bm">
        <table className="bm-table" aria-label={`Rate benchmarks, ${band === "All" ? "all client revenue" : `client revenue ${band}`}`}>
          <colgroup>
            <col className="bm-c-fn" />
            <col className="bm-c-med" />
            <col className="bm-c-range" />
            <col className="bm-c-n" />
            <col className="bm-c-med" />
            <col className="bm-c-range" />
            <col className="bm-c-n" />
          </colgroup>
          <thead>
            <tr className="bm-groups">
              <th scope="col" rowSpan={2} className="bm-th-fn">
                Function
              </th>
              <th scope="colgroup" colSpan={3} className="bm-m">
                <span className="bm-span">Monthly retainer</span>
              </th>
              <th scope="colgroup" colSpan={3} className="bm-h">
                <span className="bm-span">Hourly</span>
              </th>
            </tr>
            <tr className="bm-cols">
              {(["m", "h"] as const).map((side) => [
                <th key={`${side}1`} scope="col" className={`bm-${side}`}>
                  Median
                </th>,
                <th key={`${side}2`} scope="col" className={`bm-${side}`} title="Half of the rates in the group fall in this range">
                  Middle half
                </th>,
                <th key={`${side}3`} scope="col" className={`bm-${side}`}>
                  Rates
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.function} className={r.function === mine ? "mine" : undefined}>
                <th scope="row" className="tp-bm-fn">
                  <span className="bm-fn-name">{r.function}</span>
                  {r.function === mine && <span className="chip bm-chip bm-chip-mine">Your function</span>}
                  {r.indexed && (
                    <span className="chip bm-chip" title="Includes Revenue Nomad's Rate Index, our survey and contract data">
                      Rate Index
                    </span>
                  )}
                </th>
                <Stat s={r.monthly} side="m" cap="Monthly retainer" />
                <Stat s={r.hourly} side="h" cap="Hourly" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tp-bm-note">
        A group shows its numbers once it has {b.minN} rates{indexMin > b.minN ? `, or ${indexMin} if it includes Revenue Nomad's Rate Index survey` : ""}, so no single rate can be picked out. The middle half is
        the range that half of the rates fall in.
      </p>

      <section className="tp-card tp-bm-sharecard">
        <ShareRate refresh={refresh} />
        <MyRates rates={ui.me.benchRates} view={view} />
      </section>

      <div className="tp-bm-cta">
        <p>Happy for members to see a rate? Put it on the seat instead. You earn 1 credit, and a member spends 1 to see it.</p>
        <button type="button" className="btn" onClick={() => ui.openAdd({ mode: "engagement" })}>
          <IconPlus size={14} /> Add a rate to a seat
        </button>
      </div>
    </div>
  );
}
