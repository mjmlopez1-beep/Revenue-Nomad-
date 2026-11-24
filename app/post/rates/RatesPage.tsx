"use client";

/**
 * Rate benchmarks in the new look (Rates.dc.html), page key "rates". The old look keeps
 * Benchmarks.tsx. Every figure is the server's (View.benchmarks, lib/table.ts rateStat), read
 * through chargeModel.ts: a median once 5 different people are in a group (20 with Rate Index
 * data), the middle half at 10, amounts rounded, the member's own rate left out of what they read,
 * and below a floor only how many people it still needs. Nothing on this page makes up a number.
 *
 *   What the work pays   per month or per hour, a function and a client size; the figure, its
 *                        people, the chart with the member's own rate; "Not enough reports yet
 *                        for X: showing Y instead" when the group is under its floor. On Free the
 *                        client size is Pro (the server sends no client-size rows).
 *   Your rates           the member's own rates against the market, for them alone. A private
 *                        rate is removed here (benchRateRemove, which takes its credit back, said
 *                        first); a rate on a seat is edited on the seat.
 *   What should I charge words or a starting question, read by rules (lib/ask.ts); the benchmark
 *                        above is set to the group, and each step of the working is shown.
 *   The table            By function, By company size, Seats with a rate (the seats on file with a
 *                        rate, on the workbench: each lock spends as anywhere, one credit, asked).
 *   Add a rate you know  the private share (Benchmarks.tsx ShareRate): 1 credit, never shown with
 *                        the member's name or the seat.
 *
 * There is no export or download here: members cannot export data.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BenchmarkRow, Benchmarks, RateStat } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { IconChevron, IconLock, Num } from "../../ui/shared";
import { useUi } from "../ui";
import { ShareRate } from "../Benchmarks";
import { RangeBar } from "../Charge";
import { ProTag, openPlans } from "../Billing";
import { useApp, stripGone } from "../shell/pages";
import { PageStrip } from "../shell/PageStrip";
import { CardList } from "../Cards";
import { Workbench } from "../workbench/Workbench";
import { columnOf, type ColumnDef } from "../workbench/columns";
import { useWorkbenchSort } from "../workbench/useWorkbenchSort";
import { SortHeader, sorterOf, useSortState, type SortCol } from "../../ui/sortable";
import {
  EMPTY_FILTERS,
  applyFilters,
  namedFn,
  rowsFor,
  shown as shownCell,
} from "../model";
import {
  bandWho,
  chargeWorking,
  moneyRange,
  figureOf,
  groupLabel,
  money,
  needWords,
  ownRates,
  per,
  pickGroup,
  readChargeAsk,
  sitsShort,
  type Band,
  type ChargeAsk,
  type Figure,
  type GroupFig,
  type RateKind,
} from "../chargeModel";
import {
  RATE_TABS,
  RATE_TAB_LABEL,
  askChips,
  myRates,
  rateTabOf,
  type MyRate,
  type RateTab,
} from "./ratesModel";
import { takeLanding, takeRatesStart } from "../pageStart";
import "../charge.css";
import "./rates.css";
import { RATE_RANGE_FLOOR, floorWords } from "@/lib/rates";

const KIND_LABEL: Record<RateKind, string> = {
  monthly: "Per month",
  hourly: "Per hour",
};
const bandName = (b: Band) => (b === "All" ? "All sizes" : b);
const people = (n: number) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
const toAdd = () =>
  document
    .getElementById("rt-add")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/** The share of a floor reached, for the progress bar under "Not enough reports yet". */
function Need({ g, label }: { g: GroupFig; label: string }) {
  const f = g.fig;
  const n = f ? f.n : 0;
  const min = f && f.state === "few" ? f.min : 5;
  return (
    <span className="rt-need" role="img" aria-label={label}>
      <span
        style={{
          width: `${Math.min(100, Math.round((n / Math.max(1, min)) * 100))}%`,
        }}
      />
    </span>
  );
}

/** Where an amount sits on a figure's own scale, 2 to 98 percent: for the small bars in Your rates. */
function pos(v: number, f: Figure): number {
  if (f.state === "few") return 50;
  const lo =
    f.state === "range" ? f.p25 - (f.p75 - f.p25) * 0.6 : f.median * 0.5;
  const hi =
    f.state === "range" ? f.p75 + (f.p75 - f.p25) * 0.6 : f.median * 1.5;
  return Math.max(
    2,
    Math.min(98, Math.round(((v - lo) / (hi - lo || 1)) * 1000) / 10),
  );
}

/* ---------- the table's cells ---------- */

function StatCells({
  s,
  b,
  side,
  onPro,
}: {
  s: RateStat;
  b: Benchmarks;
  side: "m" | "h";
  onPro: () => void;
}) {
  const f = figureOf(s, b);
  const cap = side === "m" ? "Per month" : "Per hour";
  if (f.state === "few")
    return (
      <>
        <td colSpan={2} className={`rt-td rt-few rt-${side}`} data-cap={cap}>
          <span
            className="rt-need"
            role="img"
            aria-label={`${f.n} of ${f.min} people have shared a rate`}
          >
            <span
              style={{
                width: `${Math.min(100, Math.round((f.n / f.min) * 100))}%`,
              }}
            />
          </span>
          <span className="rt-few-t">
            {needWords({ fn: "", band: "All", fig: f })}
          </span>
        </td>
        <td className={`rt-td num rt-n rt-${side}`} data-cap="People">
          <span className="rt-muted">
            {f.n} of {f.min}
          </span>
        </td>
      </>
    );
  return (
    <>
      <td className={`rt-td num rt-mid rt-${side}`} data-cap={cap}>
        <Num>{money(f.median)}</Num>
      </td>
      <td className={`rt-td num rt-lh rt-${side}`} data-cap="Low to high">
        {f.state === "range" ? (
          <Num>{moneyRange(f.p25, f.p75)}</Num>
        ) : f.rangeLocked ? (
          <button
            type="button"
            className="rt-lock"
            onClick={onPro}
            aria-label={`${cap}, low to high: Pro. See Pro`}
          >
            <IconLock size={12} /> Pro
          </button>
        ) : (
          <span className="rt-muted">At {f.rangeAt} people</span>
        )}
      </td>
      <td className={`rt-td num rt-n rt-${side}`} data-cap="People">
        {f.n}
      </td>
    </>
  );
}

/* ---------- click a header to sort ---------- */

/** The seats with a rate: their columns, which sort from their headers. */
const SEAT_RATE_COLS: ColumnDef[] = ["company", "role", "function", "hours", "rate", "end"]
  .map((id) => columnOf("engagements", id))
  .filter((x): x is ColumnDef => !!x);

type StatRow = { key: string; name: ReactNode; row: BenchmarkRow | null };
/**
 * The figures table's columns: what each cell shows, so a group below its floor, a Pro lock or a
 * range not shown yet sorts last (never by a figure the page doesn't print).
 */
function statCols(b: Benchmarks, head: string, benchRates: Parameters<typeof ownRates>[1], seats: Parameters<typeof ownRates>[2], kind: RateKind): SortCol<StatRow>[] {
  const fig = (x: StatRow, side: "m" | "h") => (x.row ? figureOf(side === "m" ? x.row.monthly : x.row.hourly, b) : null);
  const mid = (side: "m" | "h") => (x: StatRow) => {
    const f = fig(x, side);
    return f && f.state !== "few" ? f.median : null;
  };
  const low = (side: "m" | "h") => (x: StatRow) => {
    const f = fig(x, side);
    return f && f.state === "range" ? f.p25 : null;
  };
  const people = (side: "m" | "h") => (x: StatRow) => fig(x, side)?.n ?? null;
  return [
    // A function by its name; a client size in its own order, smallest first.
    head === "Function" ? { key: "name", label: head, get: (x) => (typeof x.name === "string" ? x.name : x.key) } : { key: "name", label: "Company size", kind: "number", get: (x) => (x.key === "All" ? -1 : RN_REVENUE.indexOf(x.key)) },
    { key: "mMid", label: "Middle per month", kind: "number", get: mid("m") },
    { key: "mLow", label: "Low per month", kind: "number", get: low("m") },
    { key: "mN", label: "People per month", kind: "number", get: people("m") },
    { key: "hMid", label: "Middle per hour", kind: "number", get: mid("h") },
    { key: "hLow", label: "Low per hour", kind: "number", get: low("h") },
    { key: "hN", label: "People per hour", kind: "number", get: people("h") },
    { key: "yours", label: "Your rate", kind: "number", get: (x) => (x.row ? ownRates(x.row.function, benchRates, seats)[kind]?.amount ?? null : null) },
  ];
}

/* ---------- the page ---------- */

export function RatesPage() {
  const c = useApp();
  const ui = useUi();
  const me = ui.me;
  const b = c.view.benchmarks;
  const myFn =
    namedFn(me.function) && FUNCTIONS.includes(me.function!)
      ? me.function!
      : null;
  const fns = useMemo(
    () =>
      b
        ? FUNCTIONS.filter((f) =>
            b.rows.some((r) => r.function === f && r.revenue === "All"),
          )
        : [],
    [b],
  );
  const [fn, setFn] = useState<string>(() =>
    myFn && fns.includes(myFn) ? myFn : (fns[0] ?? "Sales"),
  );
  const [band, setBand] = useState<Band>("All");
  const [kind, setKind] = useState<RateKind>("monthly");
  const [pick, setPick] = useState<"fn" | "band" | null>(null);
  const [tab, setTab] = useState<RateTab>(() =>
    typeof window === "undefined"
      ? "fn"
      : rateTabOf(takeLanding("rates") || window.location.search),
  );
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<{
    id: string;
    title: string;
    a: ChargeAsk & { fn: string };
    unknown: string[];
  } | null>(null);
  const [yoursCol, setYoursCol] = useState(false);
  const [askingRm, setAskingRm] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [onlyFn, setOnlyFn] = useState(true);
  const [limit, setLimit] = useState(50);
  const benchRef = useRef<HTMLElement>(null);

  // The member's own seats as the model reads them (their own rates, their companies' revenue).
  const seatsIn = useMemo(
    () =>
      c.shell.seats.map((s) => ({
        company: s.i.c.hidden ? "one of your seats" : s.i.c.name,
        engagementId: s.e.id,
        fn: shownCell(s.e.cells.function),
        rate:
          s.e.cells.rate?.s === "value" && s.e.cells.rate.mine
            ? s.e.cells.rate.v
            : null,
        pricing: shownCell(s.e.cells.pricing),
        revenue: s.i.c.hidden ? null : shownCell(s.i.c.cells.revenue),
      })),
    [c.shell.seats],
  );
  const mine = useMemo(
    () => myRates(b, me.benchRates, seatsIn).filter((r) => !gone.has(r.id)),
    [b, me.benchRates, seatsIn, gone],
  );
  const own = useMemo(
    () =>
      ownRates(
        fn,
        me.benchRates.filter((r) => !gone.has(r.id)),
        seatsIn,
      ),
    [fn, me.benchRates, seatsIn, gone],
  );
  const companies = useMemo(
    () =>
      c.infos
        .filter((i) => !i.c.hidden && i.c.name)
        .map((i) => ({
          name: i.c.name,
          revenue: shownCell(i.c.cells.revenue),
        })),
    [c.infos],
  );
  const seatCos = useMemo(
    () =>
      seatsIn
        .filter((s) => s.company !== "one of your seats")
        .map((s) => ({ name: s.company, revenue: s.revenue })),
    [seatsIn],
  );
  const chips = askChips(myFn, me.icp, seatCos);

  // Seats with a rate: the seats on file with a rate (shown or locked), the picked function's first unless All functions.
  const seatRows = useMemo(() => {
    if (tab !== "seats") return [];
    const all = applyFilters(
      rowsFor("engagements", c.infos),
      { ...EMPTY_FILTERS, rateKnown: true },
      "all",
      "",
      me,
      true,
    ).rows.filter(
      (r) =>
        !!r.e &&
        r.e.cells.rate &&
        (r.e.cells.rate.s === "value" || r.e.cells.rate.s === "locked"),
    );
    return onlyFn
      ? all.filter((r) => shownCell(r.e!.cells.function) === fn)
      : all;
  }, [tab, c.infos, me, onlyFn, fn]);
  /** Ask: the words set the benchmark above to their group, and the working shows under the box. */
  const runAsk = (text: string, id: string, title?: string) => {
    const r = readChargeAsk(text, { myFn: fn ?? myFn, companies });
    const a = { ...r, fn: r.fn ?? fn };
    setAsked({
      id,
      title: title ?? (text.trim() || groupLabel(a.fn, a.band)),
      a,
      unknown: r.unknown,
    });
    setFn(a.fn);
    setBand(a.band);
    setKind(a.kind);
    setPick(null);
  };
  useEffect(() => {
    const t = takeRatesStart();
    if (t) runAsk(t, "now", t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** A group picked above while a working shows: the working follows it. */
  const setGroup = (o: { fn?: string; band?: Band; kind?: RateKind }) => {
    if (o.fn) setFn(o.fn);
    if (o.band) setBand(o.band);
    if (o.kind) setKind(o.kind);
    setPick(null);
    if (asked)
      setAsked({
        ...asked,
        id: "now",
        title: "the group above",
        a: {
          ...asked.a,
          fn: o.fn ?? asked.a.fn,
          band: o.band ?? asked.a.band,
          kind: o.kind ?? asked.a.kind,
          company: null,
        },
      });
  };

  // Click a header to sort: the seats with a rate (every row, before the page is cut), and the figures.
  const seatSort = useWorkbenchSort(seatRows, SEAT_RATE_COLS, "rates.seats");
  const statStore = useSortState("rates.stats");

  if (!b)
    return (
      <div className="rt-page">
        <p className="rt-lead">No rates yet. Yours can be the first.</p>
        <section className="rt-card rt-pad" id="rt-add">
          <ShareRate refresh={c.refresh} inline idp="rt-add" />
        </section>
      </div>
    );

  const g = pickGroup(b, fn, band, kind);
  const other: RateKind = kind === "monthly" ? "hourly" : "monthly";
  const og = pickGroup(b, fn, g.shown?.band ?? "All", other).shown;
  const ownNow = own[kind] ?? null;
  const w = asked
    ? chargeWorking(
        b,
        asked.a,
        ownRates(
          asked.a.fn,
          me.benchRates.filter((r) => !gone.has(r.id)),
          seatsIn,
        ),
      )
    : null;
  const f = g.shown?.fig ?? null;
  const askBand =
    w && w.band && asked && asked.a.fn === fn && asked.a.kind === kind
      ? w.band
      : null;
  const anyIndexed = b.rows.some((r) => r.indexed);
  const withoutYours = !!g.shown?.fig?.stat.withoutYours;
  const onPro = () => openPlans("bench");
  const first = mine.length === 0;

  /* ----- the group pickers ----- */
  const nOf = (row: BenchmarkRow | undefined) => (row ? row[kind].n : 0);
  const rowAt = (f0: string, bd: Band) =>
    b.rows.find((r) => r.function === f0 && r.revenue === bd);
  const opts: {
    t: string;
    n: number | null;
    on: boolean;
    go: () => void;
    locked?: boolean;
  }[] =
    pick === "fn"
      ? fns.map((x) => ({
          t: x,
          n: nOf(rowAt(x, "All")),
          on: x === fn,
          go: () => setGroup({ fn: x }),
        }))
      : pick === "band"
        ? ["All", ...RN_REVENUE].map((x) => ({
            t: bandName(x),
            n: b.limited && x !== "All" ? null : nOf(rowAt(fn, x)),
            on: x === band,
            locked: !!b.limited && x !== "All",
            go: () =>
              b.limited && x !== "All" ? onPro() : setGroup({ band: x }),
          }))
        : [];

  const who = g.shown
    ? `Fractional ${g.shown.fn} leaders ${bandWho(g.shown.band)}`
    : "";
  const figure = (
    <section
      className="rt-card rt-bench"
      id="rt-bench"
      ref={benchRef}
      aria-labelledby="rt-bh"
    >
      <div className="rt-head">
        <h2 id="rt-bh">What the work pays</h2>
        <span className="rt-sp" />
        <div
          className="rt-kinds"
          role="tablist"
          aria-label="How the work is priced"
        >
          {(["monthly", "hourly"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "on" : undefined}
              onClick={() => setGroup({ kind: k })}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="rt-picks" role="group" aria-label="Pick the group">
        <button
          type="button"
          className="rt-pick"
          aria-expanded={pick === "fn"}
          onClick={() => setPick(pick === "fn" ? null : "fn")}
        >
          <span className="rt-pick-k">Function</span>
          <span className="rt-pick-v">
            {fn} <IconChevron size={14} dir="down" />
          </span>
        </button>
        <button
          type="button"
          className="rt-pick"
          aria-expanded={pick === "band"}
          onClick={() => setPick(pick === "band" ? null : "band")}
        >
          <span className="rt-pick-k">
            Company size <ProTag plan={me.plan} />
          </span>
          <span className="rt-pick-v">
            {bandName(band)} <IconChevron size={14} dir="down" />
          </span>
        </button>
      </div>
      {pick && (
        <div
          className="rt-opts"
          role="group"
          aria-label={pick === "fn" ? "Function" : "Company size"}
        >
          <span className="rt-opts-t">
            {pick === "fn" ? "Function" : "Company size"}. The number is how
            many people are in the group if you pick it.
          </span>
          {opts.map((o) => (
            <button
              key={o.t}
              type="button"
              aria-pressed={o.on}
              className={`rt-opt${o.on ? " on" : ""}`}
              onClick={o.go}
            >
              {o.locked && <IconLock size={11} />} {o.t}
              <span className="rt-opt-n">{o.n === null ? "Pro" : o.n}</span>
            </button>
          ))}
        </div>
      )}
      {g.sizeLocked && (
        <div className="rt-status" role="status">
          <span>
            <strong>Client size is Pro.</strong> Free shows the median for each
            function across every size. Showing {groupLabel(fn, "All")} instead.
          </span>
          <button type="button" className="btn btn-sm" onClick={onPro}>
            See Pro
          </button>
        </div>
      )}
      {g.widened && !g.sizeLocked && g.shown && (
        <div className="rt-status" role="status" data-widened>
          <span>
            <strong>
              Not enough reports yet for {groupLabel(g.asked.fn, g.asked.band)}:
            </strong>{" "}
            {needWords(g.asked)}. Showing {groupLabel(g.shown.fn, g.shown.band)}{" "}
            instead.
          </span>
          <Need g={g.asked} label={needWords(g.asked)} />
          <button type="button" className="tp-flink" onClick={toAdd}>
            Share yours privately · +1 credit
          </button>
        </div>
      )}
      {f && f.state !== "few" ? (
        <>
          <div className="rt-fig">
            <div className="rt-fig-main">
              <span className="rt-who">
                {who} were paid{f.state === "median" ? " a median of" : ""}
              </span>
              <strong className="rt-big">
                <Num>
                  {f.state === "range"
                    ? moneyRange(f.p25, f.p75)
                    : money(f.median)}
                </Num>
              </strong>
              <span className="rt-per">{per(kind)}</span>
              <span className="rt-sub">
                {f.state === "range"
                  ? `The middle half of ${people(f.n)}.`
                  : `From ${people(f.n)}. ${f.rangeLocked ? "The middle half is Pro." : `The middle half shows at ${f.rangeAt} people.`}`}
              </span>
            </div>
            <div className="rt-tile">
              <span className="rt-tile-k">Middle</span>
              <strong>
                <Num>{money(f.median)}</Num>
              </strong>
              <span className="rt-tile-s">the median, {per(kind)}</span>
            </div>
            <div className="rt-tile">
              <span className="rt-tile-k">{KIND_LABEL[other]}</span>
              <strong>
                {og?.fig && og.fig.state !== "few" ? (
                  <Num>{money(og.fig.median)}</Num>
                ) : (
                  "No figure"
                )}
              </strong>
              <span className="rt-tile-s">
                {og?.fig && og.fig.state !== "few"
                  ? `the median, from ${people(og.fig.n)}`
                  : og
                    ? "not enough reports yet"
                    : "not enough reports yet"}
              </span>
            </div>
          </div>
          {f.state === "range" ? (
            <RangeBar
              f={f}
              own={ownNow?.amount ?? null}
              kind={kind}
              ask={askBand}
            />
          ) : (
            <div
              className="rt-medline"
              role="img"
              aria-label={`The median is ${money(f.median)} ${per(kind)}${ownNow ? `, and your rate is ${money(ownNow.amount)}` : ""}.`}
            >
              <span className="rt-medline-track" />
              <span className="rt-medline-med" style={{ left: "50%" }} />
              {ownNow && (
                <span
                  className="rt-medline-you"
                  style={{ left: `${pos(ownNow.amount, f)}%` }}
                />
              )}
            </div>
          )}
          <ul className="ch-key rt-key">
            {f.state === "range" && (
              <li>
                <span className="ch-keymark ch-keymark-mid" aria-hidden />
                Middle half of what they were paid
              </li>
            )}
            {askBand && (
              <li>
                <span className="ch-keymark rt-keymark-ask" aria-hidden />
                Merlin&apos;s range, from What should I charge
              </li>
            )}
            {ownNow && (
              <li>
                <span className="ch-keymark ch-keymark-you" aria-hidden />
                <span>
                  Your rate, <b>{money(ownNow.amount)}</b>
                  {ownNow.at ? ` at ${ownNow.at}` : ""}.{" "}
                  {sitsShort(ownNow.amount, f)
                    ? `${sitsShort(ownNow.amount, f)!.replace(/^./, (x) => x.toUpperCase())}`
                    : ""}{" "}
                  <span className="ch-muted">Only you see it.</span>
                </span>
              </li>
            )}
          </ul>
          {!ownNow && (
            <p className="rt-noown">
              You are not on this chart yet.{" "}
              <button type="button" className="tp-flink" onClick={toAdd}>
                Add a rate you know
              </button>{" "}
              and Merlin places it for you alone.
            </p>
          )}
        </>
      ) : (
        <div className="rt-status rt-none" role="status" data-nofig>
          <strong>
            No figure yet for{" "}
            {groupLabel(g.asked.fn, g.sizeLocked ? "All" : g.asked.band)}
          </strong>
          <span>
            Not enough people have reported what they were paid here to show a
            figure:{" "}
            {needWords(
              g.sizeLocked ? pickGroup(b, fn, "All", kind).asked : g.asked,
            ) || "no reports yet"}
            . Merlin never shows an amount below that.
          </span>
          <Need g={g.asked} label={needWords(g.asked) || "No reports yet"} />
          <button type="button" className="tp-flink" onClick={toAdd}>
            Share yours privately · +1 credit
          </button>
        </div>
      )}
      <details className="rt-how">
        <summary>How these figures work, and what is never shown</summary>
        <p>
          {floorWords()} Low and high are the middle half: 1 in 4 people
          are paid less than low, and 1 in 4 more than high.{" "}
          {anyIndexed
            ? "Rate Index is Revenue Nomad's own survey and contract data."
            : ""}
        </p>
        <p>
          Each person counts once, however many rates they shared. Amounts are
          rounded to the nearest $250 a month or $5 an hour, and to the nearest
          $1,000 or $25 while fewer than {b.rangeN ?? RATE_RANGE_FLOOR} people are in a
          figure. Where we know the hours, an hourly rate also counts in the
          monthly figures, and a monthly retainer in the hourly ones.
          {withoutYours
            ? " Your own rate is left out of what you read, so nothing you share can move a number you see."
            : ""}
        </p>
      </details>
    </section>
  );

  /* ----- your rates ----- */
  const remove = async (r: MyRate) => {
    setAskingRm(null);
    setGone((s) => new Set(s).add(r.id));
    const res = await ui.act({ type: "benchRateRemove", id: r.id });
    if (!res.ok)
      setGone((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
  };
  const noRate = c.shell.seats.filter((s) => s.missing.includes("rate")).length;
  const yours = (
    <section className="rt-card" aria-labelledby="rt-mine">
      <div className="rt-head">
        <h2 id="rt-mine">Your rates against the market</h2>
        <span className="rt-subh">Only you can see this list.</span>
      </div>
      <ul className="rt-mine">
        {(first
          ? [{ ex: true as const }]
          : mine.map((r) => ({ ex: false as const, r }))
        ).map((x) => {
          if (x.ex)
            return (
              <li key="ex" className="rt-mrow rt-ex">
                <span className="rt-mrow-t">
                  <strong className="rt-ex-t">No rate of yours yet</strong>
                </span>
                <span className="rt-mrow-w">
                  Your own rate shows here once you add one, placed against what
                  others in your function were paid. Only you see it.
                </span>
              </li>
            );
          const r = x.r;
          const fig = r.group?.fig ?? null;
          const words = sitsShort(r.amount, fig);
          const label = `Remove your ${r.fn} rate of ${money(r.amount)} ${per(r.kind)}`;
          return (
            <li key={r.id} className="rt-mrow" data-source={r.source}>
              <span className="rt-mrow-t">
                <strong>
                  <Num>{money(r.amount)}</Num>
                </strong>
                <span className="rt-muted">{per(r.kind)}</span>
                <span className="rt-sp" />
                {r.source === "private" && askingRm !== r.id && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost tp-btn-red"
                    aria-label={label}
                    onClick={() => setAskingRm(r.id)}
                  >
                    Remove
                  </button>
                )}
                {r.source === "seat" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => c.openSeats(r.engagementId ?? undefined)}
                  >
                    Edit on the seat
                  </button>
                )}
              </span>
              <span className="rt-mrow-w">
                {r.fn} · {r.at ? `your seat at ${r.at}` : "not tied to a seat"}{" "}
                · {r.source === "private" ? "shared privately" : "on the seat"}
              </span>
              {fig && fig.state !== "few" && (
                <span
                  className="rt-mbar"
                  role="img"
                  aria-label={
                    words ? `Your rate is ${words}` : "No figure to compare yet"
                  }
                >
                  {fig.state === "range" && (
                    <span
                      className="rt-mbar-mid"
                      style={{
                        left: `${pos(fig.p25, fig)}%`,
                        width: `${pos(fig.p75, fig) - pos(fig.p25, fig)}%`,
                      }}
                    />
                  )}
                  <span
                    className="rt-mbar-med"
                    style={{ left: `${pos(fig.median, fig)}%` }}
                  />
                  <span
                    className="rt-mbar-you"
                    style={{ left: `${pos(r.amount, fig)}%` }}
                  />
                </span>
              )}
              <span className="rt-mrow-s">
                <strong>
                  {words
                    ? words.replace(/^./, (y) => y.toUpperCase())
                    : "No figure to compare yet."}
                </strong>{" "}
                {words && r.group
                  ? `Against ${groupLabel(r.group.fn, r.group.band)}: ${people(fig!.n)}.`
                  : r.group?.fig
                    ? needWords(r.group)
                    : ""}
              </span>
              {askingRm === r.id && (
                <span
                  className="rt-ask"
                  role="group"
                  aria-label={label}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setAskingRm(null);
                    }
                  }}
                >
                  <span>
                    Removing this rate takes back the 1 credit it earned.
                  </span>
                  <span className="rt-ask-b">
                    <button
                      type="button"
                      className="btn btn-sm tp-btn-red"
                      onClick={() => void remove(r)}
                    >
                      Remove it
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      autoFocus
                      onClick={() => setAskingRm(null)}
                    >
                      Keep it
                    </button>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="rt-mfoot">
        {noRate > 0 ? (
          <>
            {noRate === 1
              ? "1 of your seats has no rate yet."
              : `${noRate} of your seats have no rate yet.`}{" "}
            <button
              type="button"
              className="tp-flink"
              onClick={() => c.openSeats()}
            >
              Add {noRate === 1 ? "it" : "them"} · +{noRate}{" "}
              {noRate === 1 ? "credit" : "credits"}
            </button>
          </>
        ) : (
          <>
            A rate you share privately counts in the figures and is never shown
            with your name.{" "}
            <button type="button" className="tp-flink" onClick={toAdd}>
              Add a rate you know
            </button>
          </>
        )}
      </div>
    </section>
  );
  const more = first ? (
    <section className="rt-card" aria-labelledby="rt-more">
      <div className="rt-head">
        <h2 id="rt-more">What unlocks more</h2>
      </div>
      <ul className="rt-more">
        <li>
          <button type="button" onClick={toAdd}>
            <span>
              <strong>Add a rate you know</strong>
              <span>Private. It places you on the chart.</span>
            </span>
            <span className="rt-pill rt-pill-earn">+1 credit</span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => c.openSeats()}>
            <span>
              <strong>Add the seats you have held</strong>
              <span>Each answer on a seat earns 1, the rate included.</span>
            </span>
            <span className="rt-pill rt-pill-earn">+1 an answer</span>
          </button>
        </li>
        {b.limited ? (
          <li>
            <button type="button" onClick={onPro}>
              <span>
                <strong>The middle half, by client size</strong>
                <span>Free shows the median for each function.</span>
              </span>
              <span className="rt-pill">Pro</span>
            </button>
          </li>
        ) : (
          <li>
            <button type="button" onClick={() => setTab("seats")}>
              <span>
                <strong>What a seat paid</strong>
                <span>
                  The rate on a seat you can see, once its company is open.
                </span>
              </span>
              <span className="rt-pill">1 credit</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  ) : null;

  /* ----- What should I charge ----- */
  const askSection = (
    <section className="rt-card rt-askc" aria-labelledby="rt-askh">
      <div className="rt-ask-top">
        <h2 id="rt-askh">What should I charge</h2>
        <form
          className="rt-ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) runAsk(q, "now", q.trim());
          }}
        >
          <input
            className="input rt-ask-in"
            type="text"
            value={q}
            maxLength={200}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Ask Merlin what to charge"
            placeholder="Ask Merlin. Say the client and the hours"
          />
          <button type="submit" className="btn btn-pine">
            Ask
          </button>
        </form>
        <div className="rt-ask-chips" role="group" aria-label="Start from">
          {chips.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={asked?.id === x.id}
              className={`rt-chip${asked?.id === x.id ? " on" : ""}`}
              onClick={() => runAsk(x.text, x.id, x.label)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {!w || !asked ? (
        <p className="rt-ask-none">
          Pick one, or ask in your own words. Merlin sets the benchmark above to
          the right group, then shows each step of its working so you can check
          it. It answers only from the figures on this page and never sees
          another member&apos;s rate.
        </p>
      ) : (
        <div className="rt-work" role="status">
          <div className="rt-work-steps">
            <span className="rt-work-q">
              You asked: <strong>{asked.title}</strong>. Merlin&apos;s working:
            </span>
            <ol>
              {w.steps.map((s, k) => (
                <li key={k}>
                  <span className="rt-step-n" aria-hidden>
                    {k + 1}
                  </span>
                  <span>
                    <strong>{s.t}.</strong> {s.s}
                  </span>
                </li>
              ))}
            </ol>
            {asked.unknown.length > 0 && (
              <span className="rt-work-unk">
                Words Merlin did not use: {asked.unknown.join(", ")}.
              </span>
            )}
            <span className="rt-work-l">
              <strong>Where this lands:</strong> {w.lands}{" "}
              <button
                type="button"
                className="tp-flink"
                onClick={() =>
                  benchRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                See it
              </button>
            </span>
          </div>
          <div className="rt-work-res">
            <strong className="rt-work-big">{w.big}</strong>
            <span className="rt-work-sub">{w.sub}</span>
            <span className="rt-work-acts">
              {w.answered && me.plan?.canClose !== false && (
                <button
                  type="button"
                  className="btn btn-sm btn-pine"
                  onClick={() => c.openPage("proposals")}
                >
                  Use in a proposal
                </button>
              )}
              {!w.answered && (
                <button
                  type="button"
                  className="btn btn-sm btn-volt"
                  onClick={toAdd}
                >
                  Share yours · +1 credit
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setAsked(null)}
              >
                Clear
              </button>
            </span>
          </div>
        </div>
      )}
      <p className="rt-ask-foot">
        Asking spends no credits and no allowance: Merlin works it out by rules
        from the figures above. The same figures are free in your own agent,
        through the Merlin connector.{" "}
        <button
          type="button"
          className="tp-flink"
          onClick={() => c.openPage("agent")}
        >
          Agent access
        </button>
      </p>
    </section>
  );

  /* ----- the table ----- */
  const rows = b.rows;
  const fnRows = FUNCTIONS.map((x) =>
    rows.find(
      (r) => r.function === x && r.revenue === (b.limited ? "All" : band),
    ),
  ).filter((r): r is BenchmarkRow => !!r);
  const hasFig = (r: BenchmarkRow) =>
    r.monthly.median !== undefined || r.hourly.median !== undefined;
  const fnShown = fnRows.filter((r) => hasFig(r) || r.function === myFn);
  const fnLater = fnRows.filter((r) => !fnShown.includes(r));
  const yoursCell = (r: BenchmarkRow): ReactNode => {
    const o = ownRates(
      r.function,
      me.benchRates.filter((x) => !gone.has(x.id)),
      seatsIn,
    )[kind];
    if (!o)
      return (
        <button type="button" className="tp-flink" onClick={toAdd}>
          Add yours · +1 credit
        </button>
      );
    const s = sitsShort(o.amount, figureOf(r[kind], b));
    return (
      <span className="rt-yc">
        <strong>
          {money(o.amount)} {per(kind)}
        </strong>
        <span className="rt-muted">
          {s
            ? s.replace(/^./, (y) => y.toUpperCase())
            : "No figure to compare yet"}
        </span>
      </span>
    );
  };
  const statTable = (
    list: {
      key: string;
      name: ReactNode;
      row: BenchmarkRow | null;
      on: boolean;
      go: () => void;
      mine?: boolean;
    }[],
    head: string,
  ) => {
    const ss = sorterOf(list, statCols(b, head, me.benchRates.filter((x) => !gone.has(x.id)), seatsIn, kind), statStore);
    return (
    <div className="rt-scroll">
      <table
        className="rt-table"
        aria-label={`Rate benchmarks, ${head.toLowerCase()}`}
      >
        <thead>
          <tr className="rt-groups">
            <SortHeader s={ss} k="name" rowSpan={2} className="rt-th-name">
              {head}
            </SortHeader>
            <th scope="colgroup" colSpan={3} className="rt-m">
              Per month
            </th>
            <th scope="colgroup" colSpan={3} className="rt-h">
              Per hour
            </th>
            {yoursCol && (
              <SortHeader s={ss} k="yours" rowSpan={2} className="rt-th-yours" extra={<span className="rt-muted">Only you see it</span>}>
                Your rate
              </SortHeader>
            )}
          </tr>
          <tr className="rt-cols">
            {(["m", "h"] as const).map((sd) => [
              <SortHeader key={`${sd}1`} s={ss} k={`${sd}Mid`} className={`num rt-${sd}`}>
                Middle
              </SortHeader>,
              <SortHeader
                key={`${sd}2`}
                s={ss}
                k={`${sd}Low`}
                className={`num rt-${sd}`}
                title="The middle half: 1 in 4 people are paid less than low, and 1 in 4 more than high"
              >
                Low to high
              </SortHeader>,
              <SortHeader
                key={`${sd}3`}
                s={ss}
                k={`${sd}N`}
                className={`num rt-${sd}`}
                title="Different people with a rate in this figure"
              >
                People
              </SortHeader>,
            ])}
          </tr>
        </thead>
        <tbody>
          {ss.rows.map((x) => (
            <tr key={x.key} className={x.on ? "on" : undefined}>
              <th scope="row" className="rt-name">
                <button
                  type="button"
                  className="rt-name-b"
                  aria-pressed={x.on}
                  onClick={x.go}
                >
                  {x.name}
                </button>
                {x.mine && (
                  <span className="rt-tag rt-tag-mine">Your function</span>
                )}
                {x.row?.indexed && <span className="rt-tag">Rate Index</span>}
              </th>
              {!x.row ? (
                <td colSpan={6} className="rt-td rt-locked">
                  <button type="button" className="rt-lock" onClick={onPro}>
                    <IconLock size={12} /> Client size is Pro. See Pro
                  </button>
                </td>
              ) : x.mine && !hasFig(x.row) ? (
                <td colSpan={6} className="rt-td rt-ownempty">
                  <span className="num">
                    {Math.max(x.row.monthly.n, x.row.hourly.n)} of{" "}
                    {Math.min(x.row.monthly.min, x.row.hourly.min)} so far.
                  </span>{" "}
                  <button type="button" className="tp-flink" onClick={toAdd}>
                    Share yours privately · +1 credit
                  </button>
                </td>
              ) : (
                <>
                  <StatCells s={x.row.monthly} b={b} side="m" onPro={onPro} />
                  <StatCells s={x.row.hourly} b={b} side="h" onPro={onPro} />
                </>
              )}
              {yoursCol && (
                <td className="rt-td rt-yours" data-cap="Your rate">
                  {x.row ? yoursCell(x.row) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
  };

  const seatCols = SEAT_RATE_COLS;
  const seatsShown = seatSort.rows.slice(0, limit);
  const seatOpen = seatRows.filter((r) => !r.i.c.hidden).length;
  const seatRate = seatRows.filter(
    (r) => r.e?.cells.rate?.s === "value",
  ).length;

  let tableBody: ReactNode;
  let rowsText = "";
  let status: ReactNode = null;
  if (tab === "fn") {
    tableBody = statTable(
      fnShown.map((r) => ({
        key: r.function,
        name: r.function,
        row: r,
        on: r.function === fn,
        go: () => setGroup({ fn: r.function }),
        mine: r.function === myFn,
      })),
      "Function",
    );
    rowsText = `${fnShown.length} of ${fnRows.length} functions${b.limited || band === "All" ? ", every company size" : `, at ${band}`}`;
    status = fnLater.length ? (
      <span className="rt-later">
        <strong>
          No figure yet{b.limited || band === "All" ? "" : " at this size"}:
        </strong>{" "}
        {fnLater
          .map((r) => {
            const n = Math.max(r.monthly.n, r.hourly.n);
            return n
              ? `${r.function} (${n} of ${Math.min(r.monthly.min, r.hourly.min)})`
              : r.function;
          })
          .join(", ")}
        . {floorWords()}{" "}
        <button type="button" className="tp-flink" onClick={toAdd}>
          Share a rate to start one
        </button>
      </span>
    ) : null;
  } else if (tab === "size") {
    tableBody = statTable(
      ["All", ...RN_REVENUE].map((bd) => ({
        key: bd,
        name: bandName(bd),
        row: rowAt(fn, bd) ?? null,
        on: bd === band,
        go: () =>
          b.limited && bd !== "All" ? onPro() : setGroup({ band: bd }),
      })),
      `Company size, ${fn}`,
    );
    rowsText = `${fn} at ${RN_REVENUE.length + 1} company sizes`;
  } else {
    tableBody = c.waiting ? (
      <div className="rt-empty" role="status">
        <strong>Loading every seat</strong>
      </div>
    ) : seatRows.length ? (
      <>
        {c.phone ? (
          <CardList
            type="engagements"
            rows={seatsShown}
            me={c.me}
            onOpen={(r) => c.openCompany(r.i.c.id, r.key)}
            tab="all"
          />
        ) : (
          <div className="rt-seats">
            <Workbench
              type="engagements"
              rows={seatsShown}
              cols={seatCols}
              mine={myFn}
              selected={new Set()}
              onPick={() => {}}
              onPickAll={() => {}}
              canPick={() => false}
              onOpen={(r) => c.openCompany(r.i.c.id, r.key)}
              sort="newest"
              sorter={seatSort}
              onAddColumn={() => {}}
            />
          </div>
        )}
        {seatRows.length > limit && (
          <button
            type="button"
            className="btn wb-more"
            onClick={() => setLimit((n) => n + 50)}
          >
            Show {Math.min(50, seatRows.length - limit)} more
          </button>
        )}
      </>
    ) : (
      <div className="rt-empty">
        <strong>
          {onlyFn
            ? `No ${fn} seat on file has a rate yet.`
            : "No seat on file has a rate yet."}
        </strong>
        {onlyFn && (
          <button
            type="button"
            className="tp-flink"
            onClick={() => setOnlyFn(false)}
          >
            Show every function
          </button>
        )}
      </div>
    );
    rowsText = `${seatRows.length.toLocaleString("en-US")} ${seatRows.length === 1 ? "seat" : "seats"} with a rate${onlyFn ? ` in ${fn}` : ""}`;
    status = (
      <span className="rt-later">
        {seatOpen} of {seatRows.length} at companies you can see. {seatRate}{" "}
        {seatRate === 1 ? "rate shows" : "rates show"}. A posted rate comes with
        its company. A rate shared by a member is 1 credit once its company is
        open, asked first.
      </span>
    );
  }
  const table = (
    <section
      className="rt-card rt-tablec"
      id="rt-table"
      aria-label="Rate table"
    >
      <div className="rt-tools">
        <span className="rt-rows">{rowsText}</span>
        <span className="rt-sp" />
        {tab !== "seats" ? (
          <button
            type="button"
            className="rt-tool"
            aria-pressed={yoursCol}
            onClick={() => setYoursCol((x) => !x)}
          >
            {yoursCol ? "Hide your rate" : "+ Your rate beside each row"}
          </button>
        ) : (
          <button
            type="button"
            className="rt-tool"
            aria-pressed={!onlyFn}
            onClick={() => (setOnlyFn((x) => !x), setLimit(50))}
          >
            {onlyFn ? "Every function" : `Only ${fn}`}
          </button>
        )}
      </div>
      {tableBody}
      <div className="wb-bottom rt-bottom">
        <div role="tablist" aria-label="Tables" className="wb-bottom-tabs">
          {RATE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              className={`wb-btab${t === tab ? " on" : ""}`}
              onClick={() => (setTab(t), setLimit(50))}
            >
              {RATE_TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {status}
      </div>
    </section>
  );

  /* ----- add a rate ----- */
  const add = (
    <section
      className="rt-card rt-pad rt-addc"
      id="rt-add"
      aria-labelledby="rt-addh"
    >
      <div className="rt-head rt-head-flat">
        <h2 id="rt-addh">Add a rate you know</h2>
        <span className="rt-pill rt-pill-earn">Earns 1 credit</span>
      </div>
      <ShareRate refresh={c.refresh} inline idp="rt-share" />
      <div className="rt-seatcta">
        <span>
          Happy for members to see a rate? Put it on the seat instead. You earn
          1 credit, and a member spends 1 to see it.
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => ui.openAdd({ mode: "engagement" })}
        >
          Add a rate to a seat
        </button>
      </div>
    </section>
  );

  return (
    <div className="rt-page">
      <p className="rt-lead">
        What fractional work pays
        {b.total
          ? `, from ${b.total.toLocaleString("en-US")} ${b.total === 1 ? "rate" : "rates"} on file`
          : ""}
        . Each person counts once, however many rates they shared.
      </p>
      {!stripGone(c, "rates") && (
        <PageStrip
          page="rates"
          own={mine.length}
          actions={
            <button
              type="button"
              className="btn btn-sm btn-pine"
              onClick={toAdd}
            >
              Add your rate
            </button>
          }
        >
          See what fractionals in your function were paid, ask Merlin what to
          charge a client, and add a rate you know.{" "}
          {myFn ? "Your function is already picked. " : ""}Adding a rate earns 1
          credit and places you on the chart.
        </PageStrip>
      )}
      <div className="rt-top">
        {figure}
        <div className="rt-side">
          {yours}
          {more}
        </div>
      </div>
      {askSection}
      {table}
      {add}
    </div>
  );
}
