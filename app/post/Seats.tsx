"use client";

/**
 * "Your seats": the seats on file that are matched to the member (EngagementRec.yours), and
 * what is still missing on each. The main place members give.
 *
 * Each seat asks one question at a time. A pick list saves on one tap, a text or date answer
 * has one Save, and the next question takes its place. What is still to come sits under the
 * question as quiet chips, so nothing is hidden and any of them can be answered first. A rate
 * goes on the seat (members unlock it) or counts in the benchmarks only, where it is never
 * shown with the member's name or the seat.
 * Answered questions join the "on file" line of the card, so the page never jumps. Tapping an
 * answer the member gave asks its question again; tapping one somebody else gave offers to
 * report it (the seat holder's report hides it for everyone until an admin looks).
 * A seat the member named themselves on, which nobody has confirmed yet, waits in its own list.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Cell, EngagementRec } from "@/lib/tableTypes";
import { cleanValue, fieldDef, type FieldDef } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { CompanyLogo, IconCheck, LockedName, IconChevron, IconPencil, IconPlus, fmtValue } from "../ui/shared";
import { COMPANY_GTM, SEAT_ASK, cellKey, shown, type CoInfo, type FactRef, type SeatInfo } from "./model";
import { BENCH_RATE_HELP, atTime, plural, store } from "./hooks";
import { earnRoom } from "./NextMove";
import { MonthYear } from "./MonthYear";
import { RateWho, shortLabel, useUi, type RateChoice } from "./ui";
import "./seats.css";

/** What a save in this visit earned. `bench` is the rate as shared for the benchmarks only. */
interface Saved {
  earned: boolean;
  bench?: string;
}
type OnSaved = (t: FactRef, s: Saved) => void;

/** A seat you held is active or ended. Open and closed roles are postings, not seats. */
const OWN_STATUSES = ["Active", "Ended"];

/* ---------- shared with the Add form ---------- */

/** Who sees a rate the member charged. It lives in ui.tsx, so the table's and the record's rate editor ask the same question. */
export { RATE_WHO, RateWho, type RateChoice } from "./ui";

/** Reasons that only fit a sales seat go last on other seats, and the ones that fit any seat go first. */
const SALES_SIDE = ["Sales", "RevOps", "Executive", "AI GTM"];
const SALES_ONLY = ["Move off founder-led sales", "Build the first sales motion"];
const ANY_SEAT = ["Build the function from scratch", "Cover while hiring full-time"];
export function reasonsFor(fn: string | null | undefined, list: string[]): string[] {
  if (!fn || SALES_SIDE.includes(fn)) return list;
  return [...list.filter((r) => ANY_SEAT.includes(r)), ...list.filter((r) => !ANY_SEAT.includes(r) && !SALES_ONLY.includes(r)), ...list.filter((r) => SALES_ONLY.includes(r))];
}

const optionsFor = (t: FactRef, f: FieldDef, fn: string | null) =>
  t.entity === "engagement" && t.field === "status" ? OWN_STATUSES : t.entity === "engagement" && t.field === "reason" ? reasonsFor(fn, f.options ?? []) : f.options ?? [];

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const benchText = (kind: "monthly" | "hourly", amount: number) => `${money(amount)} ${kind === "hourly" ? "an hour" : "a month"}`;

/** How each missing thing is asked, the way one fractional would ask another. */
const SEAT_Q: Record<string, { q: string; hint?: string }> = {
  function: { q: "Which function was the seat in?" },
  role: { q: "What was your title?" },
  type: { q: "What kind of seat was it?" },
  status: { q: "Is the seat active, or has it ended?" },
  start: { q: "When did you start?", hint: "The year is enough if you don't remember the month." },
  end: { q: "When did it end?", hint: "Pick Ongoing if you're still in the seat." },
  reason: { q: "Why did they bring in a fractional?" },
  sourced: { q: "How did they find you?" },
  pricing: { q: "How were you paid?" },
  rate: { q: "What did you charge?" },
  hours: { q: "About how many hours a week?" },
  revenue: { q: "What was their revenue when you started?" },
  employees: { q: "How many people worked there then?" },
};
const companyQ = (name: string): Record<string, { q: string; hint?: string }> => ({
  businessModel: { q: `Who does ${name} sell to?` },
  motion: { q: `How does ${name} sell?` },
  dealSize: { q: `How big is a typical deal at ${name}?` },
  salesCycle: { q: `How long does a deal take to close at ${name}?` },
});

/** An active seat has no end yet, so its End is not asked (or counted as missing). */
const isActive = (e: EngagementRec) => shown(e.cells.status) === "Active";

/* ---------- one question ---------- */

/** Save one answer. `busy` is the value on its way. An answer to a question asked again is an edit (no credit). */
function useFill(t: FactRef, onSaved: OnSaved) {
  const ui = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async (raw: string) => {
    const { value, error } = cleanValue(fieldDef(t.entity, t.field)!, raw);
    if (error) return setErr(error);
    setErr(null);
    setBusy(value!);
    const r = await ui.act({ type: "fill", entity: t.entity, id: t.id, field: t.field, value: value! }, { quiet: true });
    setBusy(null);
    if (r.ok) onSaved(t, { earned: !r.capped && !/^Updated/.test(r.message) });
    else setErr(r.message);
  };
  return { busy, err, setErr, save };
}

const Err = ({ text }: { text: string | null }) =>
  text ? (
    <p className="ys-err" role="alert">
      {text}
    </p>
  ) : null;

/** A pick list: every option is a chip, and one tap saves. Asked again, the current answer is marked and tapping it keeps it. */
function ChoiceAsk({ t, f, fn, initial, onSaved, onKeep }: { t: FactRef; f: FieldDef; fn: string | null; initial?: string; onSaved: OnSaved; onKeep?: () => void }) {
  const { busy, err, save } = useFill(t, onSaved);
  return (
    <>
      <div className="ys-chips" role="group" aria-label={f.label}>
        {optionsFor(t, f, fn).map((o) => {
          const on = busy === o || (!busy && initial === o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={initial !== undefined ? initial === o : undefined}
              className={`chip tp-chipbtn ys-chip${on ? " chip-on" : ""}`}
              disabled={!!busy}
              onClick={() => (initial === o && onKeep ? onKeep() : save(o))}
            >
              {o}
            </button>
          );
        })}
      </div>
      <Err text={err} />
    </>
  );
}

/** Title and hours: one input and Save. */
function TextAsk({ t, f, initial, onSaved }: { t: FactRef; f: FieldDef; initial?: string; onSaved: OnSaved }) {
  const [v, setV] = useState(initial ?? "");
  const { busy, err, setErr, save } = useFill(t, onSaved);
  const hours = f.kind === "number";
  return (
    <>
      <form
        className={`ys-inputrow ys-kind-${f.kind}`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) save(v);
        }}
      >
        <input
          className="input ys-input"
          type={hours ? "number" : "text"}
          inputMode={hours ? "numeric" : undefined}
          min={hours ? 1 : undefined}
          max={hours ? 80 : undefined}
          maxLength={hours ? undefined : 200}
          enterKeyHint="done"
          autoComplete="off"
          placeholder={f.placeholder ?? ""}
          aria-label={f.label}
          aria-invalid={err ? true : undefined}
          value={v}
          onChange={(e) => (setV(e.target.value), setErr(null))}
        />
        {hours && <span className="ys-unit">hours a week</span>}
        <button type="submit" className="btn btn-primary ys-save" disabled={!v.trim() || !!busy || (initial !== undefined && v.trim() === initial)}>
          {busy ? "Saving" : "Save"}
        </button>
      </form>
      <Err text={err} />
    </>
  );
}

/** Start and end: a month and a year, and Save. The end also takes Ongoing in one tap. */
function MonthAsk({ t, f, initial, onSaved }: { t: FactRef; f: FieldDef; initial?: string; onSaved: OnSaved }) {
  const [v, setV] = useState(initial && initial !== "Ongoing" ? initial : "");
  const { busy, err, setErr, save } = useFill(t, onSaved);
  return (
    <>
      <form
        className="ys-inputrow ys-kind-month"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (v) save(v);
        }}
      >
        <MonthYear value={v} label={f.label} onChange={(x) => (setV(x), setErr(null))} disabled={!!busy} invalid={!!err} />
        <button type="submit" className="btn btn-primary ys-save" disabled={!v || !!busy || v === initial}>
          {busy && busy !== "Ongoing" ? "Saving" : "Save"}
        </button>
        {f.kind === "monthOrOngoing" && (
          <>
            <span className="ys-or">or</span>
            <button
              type="button"
              aria-pressed={initial !== undefined ? initial === "Ongoing" : undefined}
              className={`chip tp-chipbtn ys-chip${busy === "Ongoing" || (!busy && initial === "Ongoing") ? " chip-on" : ""}`}
              disabled={!!busy || initial === "Ongoing"}
              onClick={() => save("Ongoing")}
            >
              Ongoing
            </button>
          </>
        )}
      </form>
      <Err text={err} />
    </>
  );
}

/**
 * The rate, and who can see it: members who unlock it on the seat, or the benchmarks only.
 * `initial`: the member's rate on the seat, asked again to change it (it stays on the seat).
 */
function RateAsk({ t, pricing, initial, onSaved }: { t: FactRef; pricing: string | null; initial?: string; onSaved: OnSaved }) {
  const ui = useUi();
  const [v, setV] = useState(initial ?? "");
  const [who, setWho] = useState<RateChoice | null>(initial !== undefined ? "record" : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const earns = earnRoom(ui.me) > 0 && initial === undefined;
  const text = v.trim();
  const save = async () => {
    if (!text || !who || busy) return;
    if (who === "record") {
      const { value, error } = cleanValue(fieldDef("engagement", "rate")!, text);
      if (error) return setErr(error);
      setErr(null);
      setBusy(true);
      const r = await ui.act({ type: "fill", entity: "engagement", id: t.id, field: "rate", value: value! }, { quiet: true });
      setBusy(false);
      if (r.ok) onSaved(t, { earned: !r.capped && initial === undefined });
      else setErr(r.message);
      return;
    }
    // The medians need a monthly or an hourly figure. With no unit typed, the seat's pricing model decides.
    const read = readRate(text, pricing);
    if (!read) return setErr(BENCH_RATE_HELP);
    setErr(null);
    setBusy(true);
    // Not quiet: the answer says when the rate starts to count, and about an invite bonus.
    const r = await ui.act({ type: "benchRate", engagementId: t.id, pricing: read.kind === "hourly" ? "Hourly" : "Monthly retainer", rate: text });
    setBusy(false);
    if (r.ok) onSaved(t, { earned: !r.capped, bench: benchText(read.kind, read.amount) });
    else setErr(r.message);
  };
  return (
    <form
      className="ys-rate"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        className="input ys-input ys-rate-input"
        placeholder="$8k/mo or $150/hr"
        aria-label="Rate"
        autoComplete="off"
        maxLength={60}
        enterKeyHint="done"
        aria-invalid={err ? true : undefined}
        value={v}
        onChange={(e) => (setV(e.target.value), setErr(null))}
      />
      {initial === undefined && <RateWho value={who} onChange={(w) => (setWho(w), setErr(null))} disabled={busy} />}
      <Err text={err} />
      <button type="submit" className="btn btn-primary ys-save" disabled={!text || !who || busy || text === initial}>
        {busy ? "Saving" : initial !== undefined ? "Save" : who === "bench" ? "Share for the benchmarks" : who === "record" ? "Add to the seat" : "Save rate"}
        {earns && !busy && <span className="ys-plus num">+1</span>}
      </button>
    </form>
  );
}

/* ---------- one seat ---------- */

/** A fact on file, as the card lists it. `s` is set when it was saved in this visit. */
interface Known {
  k: string;
  v: string;
  label: string;
  note: string | null;
  s?: Saved;
  /** Tapping it: ask the question again (the member's own answer), or report it (somebody else's). */
  act: "change" | "report" | null;
  t: FactRef;
  cell?: Cell;
}

interface Item {
  key: string;
  t: FactRef;
  f: FieldDef;
  cell: Cell;
  q: string;
  hint?: string;
}

function SeatCard({
  s,
  total,
  left,
  asks,
  coAsks,
  saved,
  bench,
  onSaved,
  open,
  onToggle,
  focus,
  onGone,
}: {
  s: SeatInfo;
  /** Everything this seat can hold, and how much of it is still empty. */
  total: number;
  left: number;
  /** What was missing when the page opened. */
  asks: string[];
  coAsks: string[];
  saved: Record<string, Saved>;
  /** The member's benchmark-only rate for this seat, when they shared one. */
  bench?: string;
  onSaved: OnSaved;
  open: boolean;
  /** Set when the list is long enough that cards fold. */
  onToggle?: () => void;
  focus: boolean;
  onGone: (id: string, message: string) => void;
}) {
  const ui = useUi();
  const { i, e } = s;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  /** An answer the member gave, asked again. */
  const [reask, setReask] = useState<string | null>(null);
  /** A fact somebody else gave, with the report question open under the list. */
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  // Phones keep the list of other questions folded until asked for: it is six rows of chips there.
  const [listed, setListed] = useState(false);
  const showList = listed || ui.layout !== "phone";
  const qRef = useRef<HTMLDivElement>(null);
  const fn = shown(e.cells.function);
  const role = shown(e.cells.role);
  const name = i.c.hidden ? "this company" : i.c.name;
  // A function from our records may be wrong (it decides which benchmarks the seat counts in), so it is asked about once.
  const fnFromRecords = e.cells.function?.s === "value" && e.cells.function.from === "records";
  const fnKey = `tp_fn_ok_${e.id}`;
  const [fnOk, setFnOk] = useState(() => store.get(fnKey) === "1");
  const fnAsked = () => {
    store.set(fnKey, "1");
    setFnOk(true);
  };
  const benchOf = (f: string) => (f === "rate" ? saved[cellKey(e.id, f)]?.bench ?? bench : undefined);
  const active_ = isActive(e);

  // The questions for this seat, in order: the seat first, then how the company sells.
  const coQ = companyQ(name);
  const ask = (entity: "engagement" | "company", id: string, field: string, cell: Cell | undefined, qs: Record<string, { q: string; hint?: string }>): Item[] => {
    const f = fieldDef(entity, field);
    return f && cell ? [{ key: `${entity[0]}.${field}`, t: { entity, id, field }, f, cell, q: qs[field]?.q ?? f.label, hint: qs[field]?.hint }] : [];
  };
  const items = [...asks.flatMap((f) => ask("engagement", e.id, f, e.cells[f], SEAT_Q)), ...coAsks.flatMap((f) => ask("company", i.c.id, f, i.c.cells[f], coQ))];
  const todo = items.filter((x) => x.cell.s === "empty" && !(x.t.entity === "engagement" && benchOf(x.t.field)) && !(active_ && x.key === "e.end"));
  const queue = [...todo.filter((x) => !skipped.includes(x.key)), ...todo.filter((x) => skipped.includes(x.key))];
  const again = reask
    ? reask.startsWith("e.")
      ? ask("engagement", e.id, reask.slice(2), e.cells[reask.slice(2)], SEAT_Q)[0]
      : ask("company", i.c.id, reask.slice(2), i.c.cells[reask.slice(2)], coQ)[0]
    : undefined;
  const againValue = again && again.cell.s === "value" ? again.cell.v : undefined;
  const active = (again && againValue !== undefined ? again : null) ?? queue.find((x) => x.key === picked) ?? queue[0] ?? null;
  const editing = !!active && active === again;
  const later = editing ? [] : queue.filter((x) => x !== active);

  // After an answer, a keyboard lands on the next question (the control it used is gone). Touch screens stay put, so no keyboard pops up.
  const activeKey = active ? `${editing ? "again:" : ""}${active.key}` : null;
  const lastKey = useRef(activeKey);
  useEffect(() => {
    if (lastKey.current === activeKey) return;
    const had = lastKey.current;
    lastKey.current = activeKey;
    if (!qRef.current || (!had && !activeKey?.startsWith("again:"))) return;
    if (activeKey?.startsWith("again:")) qRef.current.scrollIntoView({ block: "nearest" });
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (document.activeElement && document.activeElement !== document.body && !qRef.current.closest(".ys-seat")?.contains(document.activeElement)) return;
    qRef.current.querySelector<HTMLElement>("input:not([type=radio]), select, button.ys-chip")?.focus({ preventScroll: true });
  }, [activeKey]);

  const onAnswered: OnSaved = (t, sv) => {
    onSaved(t, sv);
    setReask(null);
  };

  // What is on file, as compact values. Function and title are in the header unless they were just added.
  const just = (id: string, f: string): Saved | undefined => saved[cellKey(id, f)];
  const known: Known[] = [
    ...SEAT_ASK.filter((f) => (f !== "function" && f !== "role") || just(e.id, f)).flatMap((f): Known[] => {
      const c = e.cells[f];
      const def = fieldDef("engagement", f)!;
      const b = c?.s === "empty" ? benchOf(f) : undefined;
      // Hours read as a bare number here: the label already says per week.
      const v = c?.s === "value" ? (f === "hours" ? c.v : fmtValue("engagement", f, c.v)) : c?.s === "reported" ? "Under review" : b ?? null;
      if (!v) return [];
      const act = c?.s === "value" ? (c.mine || just(e.id, f) ? "change" : c.system ? null : "report") : null;
      return [{ k: `e.${f}`, v, label: shortLabel(def), note: b ? "Shared for benchmarks only" : null, s: just(e.id, f), act, t: { entity: "engagement", id: e.id, field: f }, cell: c }];
    }),
    ...coAsks.flatMap((f): Known[] => {
      const c = i.c.cells[f];
      const def = fieldDef("company", f)!;
      const v = c?.s === "value" ? fmtValue("company", f, c.v) : c?.s === "reported" ? "Under review" : null;
      if (!v) return [];
      const act = c?.s === "value" && (c.mine || just(i.c.id, f)) ? "change" : null;
      return [{ k: `c.${f}`, v, label: shortLabel(def), note: null, s: just(i.c.id, f), act, t: { entity: "company", id: i.c.id, field: f }, cell: c }];
    }),
  ];
  const tappable = known.some((x) => x.act);
  const rep = reporting ? known.find((x) => x.k === reporting) : undefined;
  // A fact the job posting gave on a role that is still listed stays up for others while it is listed.
  const listedPosting = rep?.cell?.s === "value" && rep.cell.from === "posting" && !!e.opened && !e.closed;

  // A name from our own records: saying "this isn't me" takes it off the seat for everyone while we check.
  const fromRecords = e.cells.operator?.s === "value" && e.cells.operator.from === "records";
  const remove = async () => {
    setBusy(true);
    const r = await ui.act({ type: "notMine", engagementId: e.id }, { quiet: !fromRecords });
    setBusy(false);
    if (r.ok) onGone(e.id, r.message);
  };
  const report = async () => {
    if (!rep) return;
    setReportBusy(true);
    // Not quiet: the answer says who it is hidden for.
    const r = await ui.act({ type: "report", entity: rep.t.entity, id: rep.t.id, field: rep.t.field });
    setReportBusy(false);
    if (r.ok) setReporting(null);
  };
  const skip = () => {
    if (!active) return;
    setSkipped((x) => [...x.filter((k) => k !== active.key), active.key]);
    setPicked(null);
  };
  const earns = earnRoom(ui.me) > 0;
  const filled = total - left;
  return (
    <article className={`ys-seat${focus ? " focus" : ""}${open ? "" : " folded"}`} id={`ys-${e.id}`} aria-label={`Your seat at ${name}`}>
      <header
        className={`ys-seat-head${onToggle ? " can-fold" : ""}`}
        onClick={(ev) => {
          // The whole header folds the card. The chevron does the same for a keyboard.
          if (onToggle && !(ev.target as HTMLElement).closest("button")) onToggle();
        }}
      >
        <button type="button" className="ys-co" onClick={() => ui.openCompany(i.c.id, e.id)} title="Open the company">
          <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} hidden={i.c.hidden} seed={i.c.id} />
          <span className="ys-co-name">{i.c.hidden ? <LockedName seed={i.c.id} /> : name}</span>
        </button>
        <span className="ys-seat-what">
          {fn && (
            <button
              type="button"
              className={`chip tp-fn ys-fn-b${reask === "e.function" ? " chip-on" : ""}`}
              aria-pressed={reask === "e.function"}
              aria-label={`Function, ${fn}. Change it`}
              title="Change the function"
              onClick={() => {
                setReporting(null);
                setReask(reask === "e.function" ? null : "e.function");
                fnAsked();
              }}
            >
              {fn}
              <IconPencil size={11} />
            </button>
          )}
          {role && (
            <span className="ys-role" title={role}>
              {role}
            </span>
          )}
        </span>
        {left > 0 ? (
          <span className="ys-count num">
            <b>{filled}</b> of {total}
            <span className="sr-only"> filled in</span>
          </span>
        ) : (
          <span className="ys-complete">
            <span className="ys-check" aria-hidden>
              <IconCheck size={11} />
            </span>
            Complete
          </span>
        )}
        {onToggle && (
          <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-expanded={open} aria-label={open ? `Fold the seat at ${name}` : `Show the seat at ${name}`} onClick={onToggle}>
            <IconChevron dir={open ? "up" : "down"} />
          </button>
        )}
      </header>
      {open && (
        <>
          {known.length > 0 && (
            <div className="ys-known-box">
              <dl className="ys-known">
                {known.map(({ k, v, label, note, s: sv, act }) => {
                  const inner = (
                    <>
                      <span className="num">{v}</span>
                      {note && <span className="ys-kv-note"> {note}</span>}
                      {sv && (
                        <span className="ys-kv-new">
                          <span className="ys-check" role="img" aria-label="Saved">
                            <IconCheck size={10} />
                          </span>
                          {sv.earned && <span className="ys-plus num">+1</span>}
                        </span>
                      )}
                    </>
                  );
                  const on = (act === "change" && reask === k) || (act === "report" && reporting === k);
                  return (
                    <div key={k} className={`ys-kv${sv ? " new" : ""}${act ? " can-act" : ""}${on ? " on" : ""}`}>
                      <dt>{label}</dt>
                      <dd>
                        {act ? (
                          <button
                            type="button"
                            className="ys-kv-b"
                            aria-pressed={on}
                            aria-label={act === "change" ? `${label}, ${v}. Change your answer` : `${label}, ${v}. Report it as wrong`}
                            title={act === "change" ? "Change your answer" : "Report this as wrong"}
                            onClick={() => {
                              if (act === "change") {
                                setReporting(null);
                                setReask(reask === k ? null : k);
                              } else {
                                setReask(null);
                                setReporting(reporting === k ? null : k);
                              }
                            }}
                          >
                            {inner}
                          </button>
                        ) : (
                          inner
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {rep ? (
                <div className="ys-report" role="group" aria-label={`Report ${rep.label}`}>
                  <p>
                    {listedPosting
                      ? `Report "${rep.v}" as wrong? An admin will review it. Others still see it while the posting is listed.`
                      : `Report "${rep.v}" as wrong? It hides for everyone until we review it.`}
                  </p>
                  <div className="ys-report-acts">
                    <button type="button" className="btn btn-sm" disabled={reportBusy} onClick={report}>
                      {reportBusy ? "Reporting" : "Report it"}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={reportBusy} onClick={() => setReporting(null)}>
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                tappable && (
                  <p className="ys-known-hint">
                    {known.some((x) => x.act === "change") && known.some((x) => x.act === "report")
                      ? "Select an answer to change it, or one somebody else gave to report it."
                      : known.some((x) => x.act === "change")
                        ? "Select an answer to change it."
                        : "Tap anything here that's wrong to report it."}
                  </p>
                )
              )}
            </div>
          )}
          {fn && fnFromRecords && !fnOk && reask !== "e.function" && (
            <div className="ys-fncheck" role="group" aria-label="Check the function">
              <p>Is {fn} right for this seat?</p>
              <div className="ys-fncheck-acts">
                <button type="button" className="chip tp-chipbtn ys-chip" onClick={fnAsked}>
                  Yes
                </button>
                <button
                  type="button"
                  className="chip tp-chipbtn ys-chip"
                  onClick={() => {
                    setReporting(null);
                    setReask("e.function");
                    fnAsked();
                  }}
                >
                  Change it
                </button>
              </div>
            </div>
          )}
          {active ? (
            <div className={`ys-q${editing ? " again" : ""}`} key={`${editing ? "again:" : ""}${active.key}`} ref={qRef} data-ask={cellKey(active.t.id, active.t.field)}>
              <div className="ys-q-top">
                <h2 className="ys-q-h">{active.q}</h2>
                <span className={`ys-q-earn num${earns && !editing ? "" : " none"}`}>{editing ? "Changes earn no credit" : earns ? "+1 credit" : "No credit today"}</span>
              </div>
              {active.hint && !editing && <p className="ys-q-hint">{active.hint}</p>}
              <div className="ys-q-c">
                {active.t.field === "rate" && active.t.entity === "engagement" ? (
                  <RateAsk t={active.t} pricing={shown(e.cells.pricing)} initial={editing ? againValue : undefined} onSaved={onAnswered} />
                ) : active.f.kind === "choice" ? (
                  <ChoiceAsk t={active.t} f={active.f} fn={fn} initial={editing ? againValue : undefined} onSaved={onAnswered} onKeep={() => setReask(null)} />
                ) : active.f.kind === "month" || active.f.kind === "monthOrOngoing" ? (
                  <MonthAsk t={active.t} f={active.f} initial={editing ? againValue : undefined} onSaved={onAnswered} />
                ) : (
                  <TextAsk t={active.t} f={active.f} initial={editing ? againValue : undefined} onSaved={onAnswered} />
                )}
              </div>
              {editing ? (
                <div className="ys-later">
                  <button type="button" className="ys-skip" onClick={() => setReask(null)}>
                    Keep it as it is
                  </button>
                </div>
              ) : (
                later.length > 0 && (
                  <div className="ys-later">
                    <button type="button" className="ys-skip" onClick={skip}>
                      Skip
                    </button>
                    {showList ? (
                      <>
                        <span className="ys-later-l">or answer another first</span>
                        <div className="ys-later-list">
                          {later.map((x) => (
                            <button key={x.key} type="button" className="add ys-later-b" onClick={() => setPicked(x.key)}>
                              {shortLabel(x.f)}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <button type="button" className="ys-more" aria-expanded={false} onClick={() => setListed(true)}>
                        or pick from {later.length} more <IconChevron size={12} />
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="ys-allin">That is everything for this seat. Thank you.</p>
          )}
          <footer className="ys-seat-foot">
            {confirm ? (
              <>
                <span>
                  {fromRecords
                    ? "Take your name off this seat? We matched it by name, so it may be someone else's. Nobody will see your name on it."
                    : "Take this seat off your list? We matched it by name, so it may be someone else's."}
                </span>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={remove}>
                  {busy ? "Removing" : fromRecords ? "Take my name off" : "Remove this seat"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className="ys-notme" onClick={() => setConfirm(true)}>
                This isn&apos;t me
              </button>
            )}
          </footer>
        </>
      )}
    </article>
  );
}

/** Seats the member named themselves on that nobody has confirmed yet: their name is on it, but it is not theirs to fill in. */
export function waitingSeats(infos: CoInfo[]): { i: CoInfo; e: EngagementRec }[] {
  const out: { i: CoInfo; e: EngagementRec }[] = [];
  for (const i of infos)
    for (const e of i.engs) {
      const op = e.cells.operator;
      if (!e.yours && op?.s === "value" && op.member?.you) out.push({ i, e });
    }
  return out;
}

export function Seats({ seats, focus, onBack, infos }: { seats: SeatInfo[]; focus: string | null; onBack: () => void; infos?: CoInfo[] }) {
  const ui = useUi();
  const me = ui.me;
  /** Seats taken off the list in this visit ("This isn't me"), with what the server said. */
  const [gone, setGone] = useState<Map<string, string>>(() => new Map());
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  // What was missing on each seat when it first showed, and the order the seats showed in. Both
  // stay put for the visit, so nothing reorders under the member.
  const frozen = useRef(new Map<string, { asks: string[]; co: string[] }>());
  const order = useRef<string[]>([]);
  for (const s of seats) {
    if (frozen.current.has(s.e.id)) continue;
    frozen.current.set(s.e.id, { asks: s.missing, co: s.coMissing });
    order.current.push(s.e.id);
  }
  const byId = useMemo(() => new Map(seats.map((s) => [s.e.id, s])), [seats]);
  const list = order.current.map((id) => byId.get(id)).filter((s): s is SeatInfo => !!s && !gone.has(s.e.id));
  // Where seats under their name came from (FIRST-1): ours were matched by name to work they published with us.
  const matched = list.filter((s) => s.e.source === "Published engagement" || s.e.source === "Member success story").length;
  const matchedLine = matched
    ? ` We matched ${matched === list.length ? (matched === 1 ? "it" : "them") : `${matched} of them`} by name to the fractional work you published on Revenue Nomad.`
    : "";
  const waiting = useMemo(() => (infos ? waitingSeats(infos) : []), [infos]);
  // One seat is open to start, so one question is on screen: the seat the member came for, else the first with something missing.
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = seats.find((s) => s.missing.length + s.coMissing.length > 0) ?? seats[0];
    return new Set(focus ? [focus] : first ? [first.e.id] : []);
  });
  const folding = list.length > 1;

  useEffect(() => {
    if (!focus) return;
    setOpen((o) => (o.has(focus) ? o : new Set(o).add(focus)));
    const t = setTimeout(() => document.getElementById(`ys-${focus}`)?.scrollIntoView({ block: "start" }), 30);
    return () => clearTimeout(t);
  }, [focus]);
  // A seat added during the visit ("Add a seat you held") arrives open.
  const seen = useRef(new Set(seats.map((s) => s.e.id)));
  useEffect(() => {
    const fresh = seats.filter((s) => !seen.current.has(s.e.id)).map((s) => s.e.id);
    if (!fresh.length) return;
    for (const id of fresh) seen.current.add(id);
    setOpen((o) => new Set([...o, ...fresh]));
  }, [seats]);

  const benchBySeat = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of me.benchRates) if (b.engagementId) m.set(b.engagementId, benchText(b.kind, b.amount));
    return m;
  }, [me.benchRates]);

  const onSaved: OnSaved = (t, s) => setSaved((o) => ({ ...o, [cellKey(t.id, t.field)]: s }));
  // A rate shared for the benchmarks only is done as soon as it saves (the member's list of them arrives with the next sync).
  // An active seat has no end month to ask for.
  const leftOf = (s: SeatInfo) => s.missing.filter((f) => !saved[cellKey(s.e.id, f)]?.bench && !(f === "end" && isActive(s.e))).length + s.coMissing.length;
  // Everything a seat can hold: its own facts, and how the company sells (asked once per company, on the first seat there).
  const totalOf = (s: SeatInfo) => {
    const firstThere = seats.find((x) => x.i.c.id === s.i.c.id) === s;
    const co = firstThere && !s.i.c.hidden ? COMPANY_GTM.filter((f) => s.i.c.cells[f]).length : 0;
    return SEAT_ASK.filter((f) => s.e.cells[f] && !(f === "end" && isActive(s.e) && s.e.cells.end.s === "empty")).length + co;
  };
  const left = list.reduce((n, s) => n + leftOf(s), 0);
  const total = list.reduce((n, s) => n + totalOf(s), 0);
  const filled = Math.max(0, total - left);
  const room = earnRoom(me);
  const addSeat = () => ui.openAdd({ mine: true });

  // When an answer finishes the seat being worked on, the next seat with something missing opens.
  const openTodo = list.some((s) => (!folding || open.has(s.e.id)) && leftOf(s) > 0);
  const nextTodo = list.find((s) => leftOf(s) > 0)?.e.id ?? null;
  const lastLeft = useRef(left);
  useEffect(() => {
    const answered = left < lastLeft.current;
    lastLeft.current = left;
    if (answered && !openTodo && nextTodo) setOpen((o) => new Set(o).add(nextTodo));
  }, [left, openTodo, nextTodo]);

  const waitingList = waiting.length > 0 && (
    <section className="ys-wait" aria-labelledby="ys-wait-h">
      <h2 className="ys-wait-h" id="ys-wait-h">
        Waiting for another member to confirm
      </h2>
      <p className="ys-wait-p">
        You named yourself as the seat holder {waiting.length === 1 ? "on this seat" : "on these seats"}. Once another member confirms it, the seat moves up here and its locked facts open for you.
      </p>
      <ul className="ys-wait-list">
        {waiting.map(({ i, e }) => {
          const wfn = shown(e.cells.function);
          const wrole = shown(e.cells.role);
          return (
            <li key={e.id} className="ys-wait-row">
              <button type="button" className="ys-co" onClick={() => ui.openCompany(i.c.id, e.id)} title="Open the company">
                <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} hidden={i.c.hidden} seed={i.c.id} />
                <span className="ys-co-name">{i.c.hidden ? <LockedName seed={i.c.id} /> : i.c.name}</span>
              </button>
              <span className="ys-seat-what">
                {wfn && <span className="chip tp-fn">{wfn}</span>}
                {wrole && (
                  <span className="ys-role" title={wrole}>
                    {wrole}
                  </span>
                )}
              </span>
              <span className="ys-wait-tag">Waiting</span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="tp-page ys-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Your seats</h1>
      {list.length === 0 && gone.size === 0 ? (
        <>
          <div className="ys-empty">
            <h2 className="ys-empty-h">{waiting.length ? "No seat is confirmed as yours yet" : "We don't have a seat under your name yet"}</h2>
            <p>Add one you held and it shows up here. Each answer you add to it earns 1 credit.</p>
            <button type="button" className="btn btn-primary" onClick={addSeat}>
              <IconPlus size={14} /> Add a seat you held
            </button>
          </div>
          {waitingList}
        </>
      ) : (
        <>
          <p className="ys-lead">
            We have {plural(list.length, "seat")} under your name.{matchedLine} Each answer earns 1 credit and goes on the seat for other members. Your rate is the one thing you can
            keep private.
          </p>
          <p className="ys-lead-sub">
            Members spend 1 credit to see your name on a seat, and its title comes with it. The month a seat ended, how you were found and the rate are 1 credit each. Everything else here is free for every member to see.
          </p>
          <div className="ys-progress">
            <div className="ys-progress-box" role="status">
              <span className="ys-progress-n">
                {left > 0 ? (
                  <>
                    <strong className="num">
                      {filled} of {total}
                    </strong>{" "}
                    filled in
                  </>
                ) : (
                  <>
                    <span className="ys-check" aria-hidden>
                      <IconCheck size={11} />
                    </span>{" "}
                    All {total} filled in. Thank you.
                  </>
                )}
              </span>
              <span className="ys-progress-r">
                {left === 0
                  ? ""
                  : room
                    ? `${plural(left, "answer")} left · up to ${plural(Math.min(room, left), "credit")} today`
                    : `You've earned today's ${me.earnCap} credits. Answers still save, and you can earn again ${atTime(me.earnResetsAt)}.`}
              </span>
              <span className="ys-bar" aria-hidden>
                <span style={{ width: `${total ? Math.round((filled / total) * 100) : 100}%` }} />
              </span>
            </div>
          </div>
          {order.current.map((id) => {
            const note = gone.get(id);
            if (note !== undefined)
              return (
                <p key={id} className="ys-gone" role="status">
                  <span className="ys-check" aria-hidden>
                    <IconCheck size={11} />
                  </span>
                  <span>{note || "Got it. That seat is no longer linked to you."}</span>
                </p>
              );
            const s = byId.get(id);
            if (!s) return null;
            const fz = frozen.current.get(s.e.id)!;
            return (
              <SeatCard
                key={s.e.id}
                s={s}
                total={totalOf(s)}
                left={leftOf(s)}
                asks={fz.asks}
                coAsks={fz.co}
                saved={saved}
                bench={benchBySeat.get(s.e.id)}
                onSaved={onSaved}
                open={!folding || open.has(s.e.id)}
                onToggle={
                  folding
                    ? () =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (!n.delete(s.e.id)) n.add(s.e.id);
                          return n;
                        })
                    : undefined
                }
                focus={focus === s.e.id}
                onGone={(gid, message) => setGone((g) => new Map(g).set(gid, message))}
              />
            );
          })}
          {waitingList}
          <button type="button" className="btn ys-addseat" onClick={addSeat}>
            <IconPlus size={14} /> Add a seat that isn&apos;t here
          </button>
        </>
      )}
    </div>
  );
}
