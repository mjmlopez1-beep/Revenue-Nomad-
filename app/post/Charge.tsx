"use client";

/**
 * "What to charge them", on a company's record: what fractionals in the member's function were
 * paid at companies this size, from the Rate benchmarks (View.benchmarks), with the member's own
 * rate placed in it, for them alone.
 *
 * It follows the Rate benchmarks page exactly (chargeModel.ts says how): a median once a figure's
 * floor is met, the middle half only when the server sent one, the client-size figure off Free
 * only, and below a floor the count of people it still needs and "Share yours privately", never an
 * amount. The words say what others were paid. They never tell the member what to charge.
 */
import { useMemo, useState } from "react";
import type { Benchmarks } from "@/lib/tableTypes";
import { IconLock, Num, fmtValue } from "../ui/shared";
import { isOpenSeat, shown, type CoInfo, type SeatInfo } from "./model";
import { useUi } from "./ui";
import { earnRoom } from "./NextMove";
import { UpgradeNote } from "./Billing";
import { ShareRate } from "./Benchmarks";
import { axisOf, chargeView, fewWords, money, ownRates, per, shortMoney, sitsWords, type Figure, type OwnRate, type RateKind } from "./chargeModel";
import "./charge.css";
import { floorWords } from "@/lib/rates";

/** "at companies with $5M–$20M revenue", "at pre-revenue companies". */
const bandWords = (band: string) => (band === "Pre-revenue" ? "at pre-revenue companies" : `at companies with ${band === "Under $1M" ? "under $1M" : band} revenue`);
const BandWords = ({ band }: { band: string }) =>
  band === "Pre-revenue" ? (
    <>
      at <b>pre-revenue</b> companies
    </>
  ) : (
    <>
      at companies with <b>{band === "Under $1M" ? "under $1M" : band}</b> revenue
    </>
  );

/**
 * The middle half on an axis, the median as a tick, and the member's own rate as a dot. A picture of
 * the numbers beside it, nothing more. `ask` (Rate benchmarks, "What should I charge"): the range
 * Merlin's working suggests, drawn over the middle half.
 */
export function RangeBar({ f, own, kind, ask }: { f: Extract<Figure, { state: "range" }>; own: number | null; kind: RateKind; ask?: { from: number; to: number } | null }) {
  const W = 520;
  const { min, max, ticks } = axisOf(f, own, kind, ask);
  const x = (v: number) => Math.round(((v - min) / (max - min || 1)) * W * 10) / 10;
  const label = `The middle half runs from ${money(f.p25)} to ${money(f.p75)} ${per(kind)}, the median is ${money(f.median)}${own !== null ? `, and your rate is ${money(own)}` : ""}${ask ? `. Merlin's range is ${money(ask.from)} to ${money(ask.to)}` : ""}.`;
  // The first and last ticks sit inside the frame.
  const anchor = (k: number) => (k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle");
  return (
    <svg className="ch-range" viewBox={`0 -22 ${W} 62`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <rect className="ch-range-track" x={0} y={6} width={W} height={8} rx={4} />
      <rect className="ch-range-mid" x={x(f.p25)} y={2} width={Math.max(4, x(f.p75) - x(f.p25))} height={16} rx={4} />
      {ask && <rect className="ch-range-ask" x={x(ask.from)} y={0} width={Math.max(4, x(ask.to) - x(ask.from))} height={20} rx={4} />}
      <rect className="ch-range-med" x={x(f.median) - 1.5} y={-3} width={3} height={26} rx={1.5} />
      <text className="ch-range-lbl" x={Math.min(W - 24, Math.max(24, x(f.median)))} y={-9} textAnchor="middle">
        Median
      </text>
      {own !== null && <circle className="ch-range-you" cx={Math.min(W - 8, Math.max(8, x(own)))} cy={10} r={7} />}
      {ticks.map((t, k) => (
        <text key={t} className="ch-range-tick" x={x(t)} y={38} textAnchor={anchor(k)}>
          {shortMoney(t)}
        </text>
      ))}
    </svg>
  );
}

/** The other way of charging, in one row. */
function OtherRow({ f, kind, rangeAt, limited }: { f: Figure; kind: RateKind; rangeAt: number; /** Free: the range is Pro's whatever the count, and the note under the figure says so. */ limited: boolean }) {
  return (
    <div className="ch-row" data-kind={kind}>
      <span>{kind === "hourly" ? "By the hour" : "By the month"}</span>
      <span className="ch-sp" />
      {f.state === "range" ? (
        <span>
          <Num>{`${money(f.p25)} – ${money(f.p75)}`}</Num> <span className="ch-muted">· median</span> <Num>{money(f.median)}</Num>
        </span>
      ) : f.state === "median" ? (
        <span>
          <span className="ch-muted">Median</span> <Num>{money(f.median)}</Num>
          {!limited && <span className="ch-muted"> · the range shows at {rangeAt} people</span>}
        </span>
      ) : (
        <span className="ch-muted">No figure yet: {fewWords(f)}</span>
      )}
    </div>
  );
}

export function Charge({ i, benchmarks, seats = [] }: { i: CoInfo; benchmarks?: Benchmarks; /** The member's own seats (their own rates on them). */ seats?: SeatInfo[] }) {
  const ui = useUi();
  const [sharing, setSharing] = useState(false);
  const fn = ui.me.function;
  const v = useMemo(() => chargeView(benchmarks, fn, shown(i.c.cells.revenue)), [benchmarks, fn, i.c.cells.revenue]);
  const mine = useMemo(
    () =>
      v
        ? ownRates(
            v.fn,
            ui.me.benchRates,
            seats.map((s) => ({ company: s.i.c.hidden ? "one of your seats" : s.i.c.name, engagementId: s.e.id, fn: shown(s.e.cells.function), rate: s.e.cells.rate?.s === "value" && s.e.cells.rate.mine ? s.e.cells.rate.v : null, pricing: shown(s.e.cells.pricing) })),
          )
        : {},
    [v, ui.me.benchRates, seats],
  );
  if (!v) return null;
  const lead = v.lead === "sized" ? v.sized! : v.all;
  const kind: RateKind = lead.monthly.state !== "few" ? "monthly" : lead.hourly.state !== "few" ? "hourly" : "monthly";
  const other: RateKind = kind === "monthly" ? "hourly" : "monthly";
  const f = lead[kind];
  const own: OwnRate | null = mine[kind] ?? null;
  const who = (
    <>
      Fractional <b>{v.fn}</b> leaders {v.lead === "sized" ? <BandWords band={v.band!} /> : "at companies of every size"}
    </>
  );
  // The figure for this company's size isn't there (Pro and trial; Free never gets one).
  const sizedFew = v.lead === "all" && v.sized ? (v.sized.monthly.state === "few" ? v.sized.monthly : null) : null;
  const noFigure = f.state === "few";
  // Not enough reports for this group: say so, and offer the existing private share.
  const offerShare = noFigure || !!sizedFew;
  const sits = own && !noFigure ? sitsWords(own.amount, f) : null;
  const withoutYours = [lead.monthly, lead.hourly].some((x) => x.stat.withoutYours);
  const indexed = !noFigure && !!f.stat.indexed;
  // What this company paid stays on its seat, behind its own credit: the row only points at it.
  const paid = i.c.hidden ? null : i.engs.filter((e) => !isOpenSeat(e) && !e.yours && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value")).sort((a, b) => Number(shown(b.cells.function) === v.fn) - Number(shown(a.cells.function) === v.fn))[0] ?? null;
  const paidFn = paid ? shown(paid.cells.function) : null;
  const room = earnRoom(ui.me) > 0;
  const shareLabel = own || mine[other] ? "Share another rate privately" : "Share yours privately";

  return (
    <section className="tp-dsec ch" aria-labelledby="ch-h" data-charge={noFigure ? "few" : f.state}>
      <h3 className="tp-dsec-h" id="ch-h">
        What to charge them {!noFigure && <span className="ch-unit">{kind === "hourly" ? "by the hour" : "a month"}</span>}
      </h3>
      {sizedFew && !noFigure && (
        <p className="ch-none" data-few="sized">
          Not enough reports yet for {v.fn} {bandWords(v.band!)}: <Num>{fewWords(sizedFew)}</Num>. Here is every company size together.
        </p>
      )}
      {noFigure ? (
        <p className="ch-none" data-few="all">
          Not enough people have reported what they were paid as fractional {v.fn} leaders to show a figure: <Num>{fewWords(f)}</Num>
          {sizedFew ? (
            <>
              {" "}
              across every company size, and <Num>{sizedFew.n}</Num> {bandWords(v.band!)}
            </>
          ) : null}
          .
        </p>
      ) : (
        <>
          <p className="ch-for">
            {who} were paid{f.state === "median" ? " a median of" : ""}
          </p>
          <p className="ch-big">
            <Num>{f.state === "range" ? `${money(f.p25)} – ${money(f.p75)}` : money(f.median)}</Num> <span className="ch-per">{per(kind)}</span>
          </p>
          {f.state === "range" ? (
            <p className="ch-sub">
              The middle half of <Num>{f.n}</Num> people. The median is{" "}
              <b>
                <Num>{money(f.median)}</Num>
              </b>
              .
            </p>
          ) : (
            <p className="ch-sub">
              From <Num>{f.n}</Num> people.{v.limited ? "" : ` The range shows once ${f.rangeAt} people have reported.`}
            </p>
          )}
          {f.state === "range" && <RangeBar f={f} own={own?.amount ?? null} kind={kind} />}
          {(f.state === "range" || own) && (
            <ul className="ch-key">
              {f.state === "range" && (
                <li>
                  <span className="ch-keymark ch-keymark-mid" aria-hidden />
                  Middle half of what they were paid
                </li>
              )}
              {own && (
                <li data-own={kind}>
                  <span className="ch-keymark ch-keymark-you" aria-hidden />
                  <span>
                    Your rate,{" "}
                    <b>
                      <Num>{money(own.amount)}</Num>
                    </b>
                    {own.at ? ` at ${own.at}` : ""}. <span className="ch-muted">Only you see it.</span>
                  </span>
                </li>
              )}
            </ul>
          )}
          {sits && <p className="ch-say">{sits}</p>}
        </>
      )}
      {v.limited && <UpgradeNote from="bench">Free shows the median for each function. Pro adds the range, by function and by client size.</UpgradeNote>}
      {paid && (
        <div className="ch-row">
          <span>
            What {i.c.name} paid its fractional {paidFn ?? "leader"}
          </span>
          <span className="ch-sp" />
          {paid.cells.rate.s === "value" ? (
            <Num>{fmtValue("engagement", "rate", paid.cells.rate.v)}</Num>
          ) : (
            <button type="button" className="ch-lock" onClick={() => ui.openCompany(i.c.id, paid.id)} title="On its seat below, behind its own credit">
              <IconLock size={12} /> On its seat · 1 credit
            </button>
          )}
        </div>
      )}
      {!noFigure && <OtherRow f={lead[other]} kind={other} rangeAt={v.rangeN} limited={v.limited} />}
      {(offerShare || !own) && (
        <div className="ch-share">
          {offerShare && !sharing && <span className="ch-muted">Yours would count toward it.</span>}
          <button type="button" className="tp-flink ch-share-go" aria-expanded={sharing} aria-controls="ch-share-form" onClick={() => setSharing((x) => !x)}>
            {shareLabel} {room && <span className="plus1">· +1 credit</span>}
          </button>
        </div>
      )}
      {sharing && (
        <div id="ch-share-form" className="ch-share-form">
          <ShareRate inline idp="tp-bmc" revenue={v.band ?? undefined} onDone={() => setSharing(false)} />
        </div>
      )}
      <p className="ch-fine">
        {floorWords()} Amounts are rounded.
        {indexed ? " This one includes Revenue Nomad's Rate Index." : ""}
        {withoutYours ? " Your own rate is left out of what you see here; nobody else is shown it." : ""}{" "}
        <button type="button" className="ch-link" onClick={() => ui.openPage("rates")}>
          Rate benchmarks
        </button>
      </p>
    </section>
  );
}
