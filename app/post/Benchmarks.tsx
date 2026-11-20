"use client";

/**
 * Rate benchmarks: what fractionals charge by function and client revenue. The medians
 * come from rates on seats, rates members shared for the benchmarks only, and Revenue Nomad's
 * Rate Index. Every figure counts people, not rates: each person counts once however many
 * rates they have in a group. A figure shows a median once 5 different people are in it
 * (RateStat.min, or 20 when it includes Rate Index data) and the range only at
 * Benchmarks.rangeN (10). The server leaves the range out below that, so check for p25, never
 * for n. Amounts arrive rounded, and the viewer's own rates are left out of what they see
 * (RateStat.withoutYours).
 *
 * It is a real table: one row per function, and per month and per hour a median, the middle
 * half and the number of people, right-aligned so they scan down the column. On phones each
 * row stacks into two columns, per month and per hour.
 *
 * "Share a rate privately" adds a rate that counts in the medians and is never shown with the
 * member's name or the seat. The member's own private rates are listed under the form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult, BenchRate, BenchmarkRow, RateStat, View } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { IconChevron, IconLock, IconPlus, Num, post, useToast } from "../ui/shared";
import { earnNote, useUi } from "./ui";
import { ProTag, UpgradeNote, openPlans, planDay } from "./Billing";
import { BENCH_RATE_HELP, atTime } from "./hooks";
import "./pages.css";

/** Whole dollars with separators ("$7,500", "$205"). Amounts arrive rounded to $250 or $5, so nothing is rounded again here. */
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const PRICING = ["Monthly retainer", "Hourly"] as const;
type Pricing = (typeof PRICING)[number];
/** Column captions. A monthly figure also holds hourly rates times the hours, so it is "per month", not "retainer". */
const CAP = { m: "Per month", h: "Per hour" } as const;

/** What a figure below its floor still needs, in people. */
function needText(s: RateStat): string {
  const more = Math.max(1, s.min - s.n);
  if (s.indexed) return `Shows at ${s.min} rates · ${s.n} so far`;
  return s.n === 0 ? `Needs rates from ${s.min} people` : `Needs rates from ${more} more ${more === 1 ? "person" : "people"}`;
}

/**
 * The three cells for one way of charging: median, middle half, people. `side` places them on phones.
 * `locked` (Free, billing live): the middle half is Pro's. The server sends no range on Free, so the
 * cell is a blurred placeholder with a lock that opens the plans, never a real figure.
 */
function Stat({ s, side, rangeN, locked }: { s: RateStat; side: "m" | "h"; rangeN: number; locked?: boolean }) {
  const cap = CAP[side];
  const yours = s.withoutYours ? "Your own rate is left out of this figure." : undefined;
  if (s.median === undefined) {
    const label = `${s.n} of ${s.min} people have shared a rate`;
    return (
      <>
        <td colSpan={2} className={`bm-${side} bm-need`} data-cap={cap}>
          <span className="bm-need-in">
            <span className="tp-bm-bar" role="img" aria-label={label}>
              <span style={{ width: `${Math.min(100, (s.n / s.min) * 100)}%` }} />
            </span>
            <span className="bm-need-t">{needText(s)}</span>
          </span>
        </td>
        <td className={`num bm-${side} bm-n`} title={yours}>
          {s.n}
          <span className="bm-n-of"> of {s.min}</span>
        </td>
      </>
    );
  }
  const range = s.p25 !== undefined && s.p75 !== undefined;
  return (
    <>
      <td className={`bm-${side} bm-med`} data-cap={cap} title={yours}>
        <Num>{money(s.median)}</Num>
      </td>
      <td className={`bm-${side} bm-range${range ? "" : " bm-range-none"}`}>
        {range ? (
          <Num>{`${money(s.p25!)}–${money(s.p75!)}`}</Num>
        ) : locked && s.n >= rangeN ? (
          <button type="button" className="bm-range-lock" onClick={() => openPlans("bench")} aria-label={`${cap}, middle half: Pro. See Pro`} title="The range is Pro. See Pro">
            <span className="bm-range-fake" aria-hidden>
              {side === "m" ? "$0,000–$00,000" : "$000–$000"}
            </span>
            <IconLock size={12} />
          </button>
        ) : (
          <span className="bm-range-later" title={`The range shows once ${rangeN} people have a rate in this group.`}>
            At {rangeN} people
          </span>
        )}
      </td>
      <td className={`num bm-${side} bm-n`} title={yours}>
        {s.n}
      </td>
    </>
  );
}

/**
 * Function, pricing model, rate and (optionally) client revenue. Sends benchRate and shows what the server says.
 * [ux ws3] `inline`: the same form opened in place under the member's own empty function, its ids
 * prefixed so the full form further down keeps its own. `onDone` after a rate is shared.
 */
function ShareRate({ refresh, inline, onDone }: { refresh: () => Promise<void>; inline?: boolean; onDone?: () => void }) {
  const ui = useUi();
  const toast = useToast();
  const idp = inline ? "tp-bmi" : "tp-bm";
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
    if (!readRate(rate, pricing)) return setErr(BENCH_RATE_HELP);
    setErr(null);
    setBusy(true);
    const r = await post<ActionResult>({ action: { type: "benchRate", function: fn, pricing, rate: rate.trim(), ...(revenue ? { revenue } : {}) } });
    // The server's refusals (5 a day, 3 not tied to a seat, a rate it can't read) are said as they come.
    if (r.error) {
      setBusy(false);
      return setErr(r.error);
    }
    setRate("");
    toast(r.message || "Added to the benchmarks. Your rate is never shown with your name or the seat.");
    await refresh();
    setBusy(false);
    onDone?.();
  };

  return (
    <form
      className="tp-bm-share"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {inline ? (
        <p className="tp-bm-share-lead">Never shown with your name or the seat. It counts once 5 people have shared one in this group.</p>
      ) : (
        <>
      <h2 className="tp-card-h">Share a rate privately</h2>
      <p className="tp-bm-share-lead">
        Add a rate to the benchmarks without putting it on a seat. It counts in the medians and earns 1 credit. It is never shown with your name or the seat. Your rate joins a
        group&apos;s number once 5 people have shared one privately in that group.
      </p>
        </>
      )}
      <div className="tp-bm-fields">
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor={`${idp}-fn`}>
            Function
          </label>
          <select id={`${idp}-fn`} className="select" value={fn} onChange={(e) => (setFn(e.target.value), setErr(null))}>
            {!fn && <option value="">Pick one</option>}
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="tp-form-row">
          <span className="tp-lbl" id={`${idp}-pricing`}>
            Pricing model
          </span>
          <div className="tp-seg" role="radiogroup" aria-labelledby={`${idp}-pricing`}>
            {PRICING.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pricing === p} className={`tp-seg-b${pricing === p ? " on" : ""}`} onClick={() => (setPricing(p), setErr(null))}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor={`${idp}-rate`}>
            Rate
          </label>
          <input
            id={`${idp}-rate`}
            className="input"
            autoComplete="off"
            maxLength={60}
            placeholder={pricing === "Hourly" ? "$150/hr" : "$8k/mo"}
            value={rate}
            aria-invalid={!!err}
            aria-describedby={err ? `${idp}-err` : undefined}
            onChange={(e) => (setRate(e.target.value), setErr(null))}
          />
        </div>
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor={`${idp}-rev`}>
            Client revenue <span className="tp-bm-opt">optional</span>
          </label>
          <select id={`${idp}-rev`} className="select" value={revenue} onChange={(e) => setRevenue(e.target.value)}>
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
        <p className="tp-ed-err" id={`${idp}-err`} role="alert">
          {err}
        </p>
      )}
      <div className="tp-bm-share-foot">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sharing" : "Share privately"}
        </button>
        <span className="tp-bm-earn">
          {capped ? `You've earned ${ui.me.earnCap} today, so this one earns no credit. You can earn again ${atTime(ui.me.earnResetsAt)}.` : "Earns 1 credit."}
          {ui.me.invitePending && " Your invite bonus comes with your first fact on a record."}
        </span>
      </div>
    </form>
  );
}

/** One of the member's private rates, with a confirm before it goes (it takes its credit with it). */
function MyRate({ r, co, onRemove }: { r: BenchRate; co: string | null; onRemove: (id: string) => void }) {
  const [asking, setAsking] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    // Into the question when it opens, back to Remove when it closes.
    if (asking) keepRef.current?.focus();
    else if (wasAsking.current) removeRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const per = r.kind === "hourly" ? "an hour" : "a month";
  const amount = `${money(r.amount)} ${per}`;
  return (
    <li className={`tp-bm-mine-row${asking ? " asking" : ""}`}>
      <span className="tp-bm-mine-amt">
        <Num>{money(r.amount)}</Num> {per}
      </span>
      <span className="tp-bm-mine-what">
        {r.function}
        {co && <span className="muted">, your seat at {co}</span>}
      </span>
      {asking ? (
        <span
          className="tp-bm-mine-ask"
          role="group"
          aria-label={`Remove your ${r.function} rate of ${amount}?`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAsking(false);
            }
          }}
        >
          <span className="tp-bm-mine-q">Removing this rate takes back the 1 credit it earned.</span>
          <span className="tp-bm-mine-acts">
            <button type="button" className="btn btn-sm tp-btn-red" onClick={() => onRemove(r.id)}>
              Remove it
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </span>
        </span>
      ) : (
        <button ref={removeRef} type="button" className="btn btn-sm btn-ghost tp-btn-red" onClick={() => setAsking(true)} aria-label={`Remove your ${r.function} rate of ${amount}`}>
          Remove
        </button>
      )}
    </li>
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
      <p className="tp-bm-mine-p">Only you can see this list. A rate you remove leaves the medians.</p>
      <ul className="tp-bm-mine-list">
        {list.map((r) => (
          <MyRate key={r.id} r={r} co={r.engagementId ? seatAt.get(r.engagementId) ?? null : null} onRemove={(id) => void remove(id)} />
        ))}
      </ul>
    </div>
  );
}

export function Benchmarks({ view, refresh, onBack }: { view: View; refresh: () => Promise<void>; onBack: () => void }) {
  const ui = useUi();
  const [band, setBand] = useState("All");
  const [sharing, setSharing] = useState(false);
  const b = view.benchmarks;
  if (!b) return null;
  const rangeN = b.rangeN ?? 10;
  const mine = ui.me.function;
  // Every function the server sends, the member's own first.
  const all: BenchmarkRow[] = b.rows.filter((r) => r.revenue === band).sort((x, y) => (x.function === mine ? -1 : y.function === mine ? 1 : 0));
  // A function with no figure either way is one name in a line under the table, not two rows of
  // empty bars (17 of them ran about 2,000px on a phone). The member's own function keeps its row.
  const figure = (r: BenchmarkRow) => r.monthly.median !== undefined || r.hourly.median !== undefined;
  const rows = all.filter((r) => figure(r) || r.function === mine);
  const later = all.filter((r) => !rows.includes(r));
  const stats = rows.flatMap((r) => [r.monthly, r.hourly]);
  const toShare = () => document.getElementById("tp-bm-share")?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Notes that apply to what is on screen.
  const indexShown = stats.some((s) => s.indexed && s.median !== undefined);
  const withoutYours = stats.some((s) => s.withoutYours);
  return (
    <div className="tp-page bm-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Rate benchmarks</h1>
      <p className="tp-bm-lead">
        What fractionals charge, by function and by the client&apos;s revenue.{" "}
        {b.total
          ? `${b.total.toLocaleString("en-US")} ${b.total === 1 ? "rate" : "rates"} on file so far, from seats, rates members shared privately and Revenue Nomad's Rate Index. Each person counts once in a figure, however many rates they shared.`
          : "No rates yet. Yours can be the first."}
      </p>
      {b.limited ? (
        // Free while billing is live: the median by function. The range and the client-size rows are Pro's:
        // the sizes stay in place, locked, and open the plans. The server sends no client-size rows on Free.
        <>
          <UpgradeNote from="bench">Free shows the median for each function. Pro adds the range, by function and by client size.</UpgradeNote>
          <div className="tp-bm-tools bm-tools-locked">
            <span className="tp-flabel" id="tp-bm-band">
              Client revenue <ProTag plan={ui.me.plan} />
            </span>
            <div className="tp-fchips" role="group" aria-labelledby="tp-bm-band">
              <button type="button" aria-pressed className="chip tp-fchip chip-on">
                All revenue
              </button>
              {RN_REVENUE.map((s) => (
                <button key={s} type="button" aria-pressed={false} className="chip tp-fchip bm-chip-locked" onClick={() => openPlans("bench")} aria-label={`${s}: Pro. See Pro`}>
                  <IconLock size={11} /> {s}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
        {ui.me.plan?.name === "trial" && (
          <UpgradeNote from="bench" trial={`The ranges and the rows by client size are Pro, yours in the trial until ${planDay(ui.me.plan.trialEndsAt)}. On Free you see the median for each function.`} />
        )}
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
        </>
      )}
      {rows.length > 0 && (
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
                <span className="bm-span">{CAP.m}</span>
              </th>
              <th scope="colgroup" colSpan={3} className="bm-h">
                <span className="bm-span">{CAP.h}</span>
              </th>
            </tr>
            <tr className="bm-cols">
              {(["m", "h"] as const).map((side) => [
                <th key={`${side}1`} scope="col" className={`bm-${side}`}>
                  Median
                </th>,
                <th key={`${side}2`} scope="col" className={`bm-${side}`} title="The middle half of people in the group charge within this range">
                  Middle half
                </th>,
                <th key={`${side}3`} scope="col" className={`bm-${side}`} title="Different people with a rate in this figure">
                  People
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
                    <span className="chip bm-chip" title="Includes Revenue Nomad's Rate Index, our survey and contract data. Figures with it show at 20 people.">
                      Rate Index
                    </span>
                  )}
                </th>
                {r.function === mine && !figure(r) ? (
                  // [ux ws3] The member's own function with no figure yet: how far it is, and their own rate one tap away, in place.
                  <td colSpan={6} className="bm-ownempty">
                    <span className="num">
                      {Math.max(r.monthly.n, r.hourly.n)} of {Math.min(r.monthly.min, r.hourly.min)} so far
                    </span>{" "}
                    ·{" "}
                    <button type="button" className="tp-flink bm-ownempty-go" aria-expanded={sharing} aria-controls="tp-bmi-form" onClick={() => setSharing((x) => !x)}>
                      Share yours privately <span className="plus1">+1 credit</span>
                    </button>
                  </td>
                ) : (
                  <>
                    <Stat s={r.monthly} side="m" rangeN={rangeN} locked={b.limited} />
                    <Stat s={r.hourly} side="h" rangeN={rangeN} locked={b.limited} />
                  </>
                )}
              </tr>
            ))}
            {sharing && (
              <tr className="bm-inline-share">
                <td colSpan={7} id="tp-bmi-form">
                  <ShareRate refresh={refresh} inline onDone={() => setSharing(false)} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      {later.length > 0 && (
        <p className="tp-bm-later">
          <span className="tp-bm-later-h">{rows.length ? "No figure yet:" : "No figures yet at this revenue:"}</span>{" "}
          {later
            .map((r) => {
              const n = Math.max(r.monthly.n, r.hourly.n);
              const min = Math.min(r.monthly.min, r.hourly.min);
              return n ? `${r.function} (${n} of ${min})` : r.function;
            })
            .join(", ")}
          .{" "}
          <button type="button" className="tp-bm-later-go" onClick={toShare}>
            Share a rate to start one
          </button>
        </p>
      )}
      <details className="tp-bm-note">
        <summary>How these figures work</summary>
        <p>
          A group shows a median once {b.minN} different people have a rate in it, and the range at {rangeN}. The middle half is where the middle half of them fall. Amounts are rounded to the
          nearest $250 a month or $5 an hour, and to the nearest $1,000 or $25 while fewer than {rangeN} people are in a figure.
        </p>
        {indexShown && <p>Figures marked Rate Index include our survey and contract data. They show once 20 people are in them.</p>}
        <p>Where we know the hours, an hourly rate also counts in the monthly figures (the rate times the hours a month), and a monthly retainer counts in the hourly ones.</p>
        {withoutYours && <p>Your rate is left out of what you see here, so nothing you share can move a number you read. Other members see it in the figure.</p>}
      </details>

      <section className="tp-card tp-bm-sharecard" id="tp-bm-share">
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
