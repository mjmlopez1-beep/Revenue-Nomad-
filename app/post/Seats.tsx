"use client";

/**
 * "Your seats": the seats on file that are matched to the member (EngagementRec.yours), and
 * what is still missing on each. The main place members give.
 *
 * Each seat asks one question at a time. A pick list saves on one tap, a text or date answer
 * has one Save, and the next question takes its place. What is still to come sits under the
 * question as quiet chips, so nothing is hidden and any of them can be answered first. A rate
 * goes on the seat (members unlock it) or counts in the benchmarks only (nobody sees it).
 * Answered questions join the "on file" line of the card, so the page never jumps.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/tableTypes";
import { cleanValue, fieldDef, type FieldDef } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { CompanyLogo, IconCheck, IconChevron, IconPlus, fmtValue } from "../ui/shared";
import { COMPANY_GTM, SEAT_ASK, cellKey, shown, type FactRef, type SeatInfo } from "./model";
import { BENCH_RATE_HELP, atTime, plural } from "./hooks";
import { earnRoom } from "./NextMove";
import { MonthYear } from "./MonthYear";
import { shortLabel, useUi } from "./ui";
import "./seats.css";

/** What a save in this visit earned. `bench` is the rate as shared for the benchmarks only. */
interface Saved {
  earned: boolean;
  bench?: string;
}
type OnSaved = (t: FactRef, s: Saved) => void;

/** A seat you held is active or ended. Open and closed roles are postings, not seats. */
const OWN_STATUSES = ["Active", "Ended"];
const optionsFor = (t: FactRef, f: FieldDef) => (t.entity === "engagement" && t.field === "status" ? OWN_STATUSES : f.options ?? []);

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

/* ---------- one question ---------- */

/** Save one answer. `busy` is the value on its way. */
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
    if (r.ok) onSaved(t, { earned: !r.capped });
  };
  return { busy, err, setErr, save };
}

const Err = ({ text }: { text: string | null }) =>
  text ? (
    <p className="ys-err" role="alert">
      {text}
    </p>
  ) : null;

/** A pick list: every option is a chip, and one tap saves. */
function ChoiceAsk({ t, f, onSaved }: { t: FactRef; f: FieldDef; onSaved: OnSaved }) {
  const { busy, err, save } = useFill(t, onSaved);
  return (
    <>
      <div className="ys-chips" role="group" aria-label={f.label}>
        {optionsFor(t, f).map((o) => (
          <button key={o} type="button" className={`chip tp-chipbtn ys-chip${busy === o ? " chip-on" : ""}`} disabled={!!busy} onClick={() => save(o)}>
            {o}
          </button>
        ))}
      </div>
      <Err text={err} />
    </>
  );
}

/** Title and hours: one input and Save. */
function TextAsk({ t, f, onSaved }: { t: FactRef; f: FieldDef; onSaved: OnSaved }) {
  const [v, setV] = useState("");
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
          placeholder={f.placeholder ?? ""}
          aria-label={f.label}
          value={v}
          onChange={(e) => (setV(e.target.value), setErr(null))}
        />
        {hours && <span className="ys-unit">hours a week</span>}
        <button type="submit" className="btn btn-primary ys-save" disabled={!v.trim() || !!busy}>
          {busy ? "Saving" : "Save"}
        </button>
      </form>
      <Err text={err} />
    </>
  );
}

/** Start and end: a month and a year, and Save. The end also takes Ongoing in one tap. */
function MonthAsk({ t, f, onSaved }: { t: FactRef; f: FieldDef; onSaved: OnSaved }) {
  const [v, setV] = useState("");
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
        <MonthYear value={v} label={f.label} onChange={(x) => (setV(x), setErr(null))} disabled={!!busy} />
        <button type="submit" className="btn btn-primary ys-save" disabled={!v || !!busy}>
          {busy && busy !== "Ongoing" ? "Saving" : "Save"}
        </button>
        {f.kind === "monthOrOngoing" && (
          <>
            <span className="ys-or">or</span>
            <button type="button" className={`chip tp-chipbtn ys-chip${busy === "Ongoing" ? " chip-on" : ""}`} disabled={!!busy} onClick={() => save("Ongoing")}>
              Ongoing
            </button>
          </>
        )}
      </form>
      <Err text={err} />
    </>
  );
}

/** The rate, and who can see it: members who unlock it on the seat, or nobody (it counts in the benchmarks only). */
function RateAsk({ t, pricing, onSaved }: { t: FactRef; pricing: string | null; onSaved: OnSaved }) {
  const ui = useUi();
  const name = useId();
  const [v, setV] = useState("");
  const [who, setWho] = useState<"record" | "bench" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const earns = earnRoom(ui.me) > 0;
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
      if (r.ok) onSaved(t, { earned: !r.capped });
      return;
    }
    // The medians need a monthly or an hourly figure. With no unit typed, the seat's pricing model decides.
    const read = readRate(text, pricing);
    if (!read) return setErr(BENCH_RATE_HELP);
    setErr(null);
    setBusy(true);
    const r = await ui.act({ type: "benchRate", engagementId: t.id, pricing: read.kind === "hourly" ? "Hourly" : "Monthly retainer", rate: text }, { quiet: true });
    setBusy(false);
    if (r.ok) onSaved(t, { earned: !r.capped, bench: benchText(read.kind, read.amount) });
  };
  const option = (k: "record" | "bench", title: string, line: string) => (
    <label className={`ys-who-o${who === k ? " on" : ""}`}>
      <input type="radio" name={name} checked={who === k} disabled={busy} onChange={() => (setWho(k), setErr(null))} />
      <span className="ys-who-t">
        <b>{title}</b>
        <span>{line}</span>
      </span>
    </label>
  );
  return (
    <form
      className="ys-rate"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input className="input ys-input ys-rate-input" placeholder="$8k/mo or $150/hr" aria-label="Rate" autoComplete="off" value={v} onChange={(e) => (setV(e.target.value), setErr(null))} />
      <div className="ys-who" role="radiogroup" aria-labelledby={`${name}l`}>
        <span className="ys-who-l" id={`${name}l`}>
          Who can see it?
        </span>
        {option("record", "Members who unlock it", "It goes on this seat. A member spends 1 credit to see it.")}
        {option("bench", "Nobody", "It only counts toward the medians on Rate benchmarks. It never shows on this seat or to another member.")}
      </div>
      <Err text={err} />
      <button type="submit" className="btn btn-primary ys-save" disabled={!text || !who || busy}>
        {busy ? "Saving" : who === "bench" ? "Share privately" : who === "record" ? "Add to the seat" : "Save rate"}
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
  onGone: (id: string) => void;
}) {
  const ui = useUi();
  const { i, e } = s;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  // Phones keep the list of other questions folded until asked for: it is six rows of chips there.
  const [listed, setListed] = useState(false);
  const showList = listed || ui.layout !== "phone";
  const qRef = useRef<HTMLDivElement>(null);
  const fn = shown(e.cells.function);
  const role = shown(e.cells.role);
  const name = i.c.hidden ? "Hidden company" : i.c.name;
  const benchOf = (f: string) => (f === "rate" ? saved[cellKey(e.id, f)]?.bench ?? bench : undefined);

  // The questions for this seat, in order: the seat first, then how the company sells.
  const coQ = companyQ(name);
  const ask = (entity: "engagement" | "company", id: string, field: string, cell: Cell | undefined, qs: Record<string, { q: string; hint?: string }>): Item[] => {
    const f = fieldDef(entity, field);
    return f && cell ? [{ key: `${entity[0]}.${field}`, t: { entity, id, field }, f, cell, q: qs[field]?.q ?? f.label, hint: qs[field]?.hint }] : [];
  };
  const items = [...asks.flatMap((f) => ask("engagement", e.id, f, e.cells[f], SEAT_Q)), ...coAsks.flatMap((f) => ask("company", i.c.id, f, i.c.cells[f], coQ))];
  const todo = items.filter((x) => x.cell.s === "empty" && !(x.t.entity === "engagement" && benchOf(x.t.field)));
  const queue = [...todo.filter((x) => !skipped.includes(x.key)), ...todo.filter((x) => skipped.includes(x.key))];
  const active = queue.find((x) => x.key === picked) ?? queue[0] ?? null;
  const later = queue.filter((x) => x !== active);

  // After an answer, a keyboard lands on the next question (the control it used is gone). Touch screens stay put, so no keyboard pops up.
  const activeKey = active?.key ?? null;
  const lastKey = useRef(activeKey);
  useEffect(() => {
    if (lastKey.current === activeKey) return;
    const had = lastKey.current;
    lastKey.current = activeKey;
    if (!had || !qRef.current || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (document.activeElement && document.activeElement !== document.body && !qRef.current.closest(".ys-seat")?.contains(document.activeElement)) return;
    qRef.current.querySelector<HTMLElement>("input:not([type=radio]), select, button.ys-chip")?.focus({ preventScroll: true });
  }, [activeKey]);

  // What is on file, as compact values. Function and title are in the header unless they were just added.
  const just = (id: string, f: string): Saved | undefined => saved[cellKey(id, f)];
  const known: Known[] = [
    ...SEAT_ASK.filter((f) => (f !== "function" && f !== "role") || just(e.id, f)).flatMap((f): Known[] => {
      const c = e.cells[f];
      const def = fieldDef("engagement", f)!;
      const b = c?.s === "empty" ? benchOf(f) : undefined;
      // Hours read as a bare number here: the label already says per week.
      const v = c?.s === "value" ? (f === "hours" ? c.v : fmtValue("engagement", f, c.v)) : c?.s === "reported" ? "Under review" : b ?? null;
      return v ? [{ k: `e.${f}`, v, label: shortLabel(def), note: b ? "private" : null, s: just(e.id, f) }] : [];
    }),
    ...coAsks.flatMap((f): Known[] => {
      const c = i.c.cells[f];
      const def = fieldDef("company", f)!;
      const v = c?.s === "value" ? fmtValue("company", f, c.v) : c?.s === "reported" ? "Under review" : null;
      return v ? [{ k: `c.${f}`, v, label: shortLabel(def), note: null, s: just(i.c.id, f) }] : [];
    }),
  ];

  const remove = async () => {
    setBusy(true);
    const r = await ui.act({ type: "notMine", engagementId: e.id });
    setBusy(false);
    if (r.ok) onGone(e.id);
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
          <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} hidden={i.c.hidden} />
          <span className="ys-co-name">{name}</span>
        </button>
        <span className="ys-seat-what">
          {fn && <span className="chip tp-fn">{fn}</span>}
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
            <dl className="ys-known">
              {known.map(({ k, v, label, note, s: sv }) => (
                <div key={k} className={`ys-kv${sv ? " new" : ""}`}>
                  <dt>{label}</dt>
                  <dd>
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
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {active ? (
            <div className="ys-q" key={active.key} ref={qRef} data-ask={cellKey(active.t.id, active.t.field)}>
              <div className="ys-q-top">
                <h3 className="ys-q-h">{active.q}</h3>
                <span className={`ys-q-earn num${earns ? "" : " none"}`}>{earns ? "+1 credit" : "No credit today"}</span>
              </div>
              {active.hint && <p className="ys-q-hint">{active.hint}</p>}
              <div className="ys-q-c">
                {active.t.field === "rate" && active.t.entity === "engagement" ? (
                  <RateAsk t={active.t} pricing={shown(e.cells.pricing)} onSaved={onSaved} />
                ) : active.f.kind === "choice" ? (
                  <ChoiceAsk t={active.t} f={active.f} onSaved={onSaved} />
                ) : active.f.kind === "month" || active.f.kind === "monthOrOngoing" ? (
                  <MonthAsk t={active.t} f={active.f} onSaved={onSaved} />
                ) : (
                  <TextAsk t={active.t} f={active.f} onSaved={onSaved} />
                )}
              </div>
              {later.length > 0 && (
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
              )}
            </div>
          ) : (
            <p className="ys-allin">That is everything for this seat. Thank you.</p>
          )}
          <footer className="ys-seat-foot">
            {confirm ? (
              <>
                <span>Take this seat off your list? We matched it by name, so it may be someone else&apos;s.</span>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={remove}>
                  {busy ? "Removing" : "Remove this seat"}
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

export function Seats({ seats, focus, onBack }: { seats: SeatInfo[]; focus: string | null; onBack: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const [gone, setGone] = useState<Set<string>>(() => new Set());
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
  const leftOf = (s: SeatInfo) => s.missing.filter((f) => !saved[cellKey(s.e.id, f)]?.bench).length + s.coMissing.length;
  // Everything a seat can hold: its own facts, and how the company sells (asked once per company, on the first seat there).
  const totalOf = (s: SeatInfo) => {
    const firstThere = seats.find((x) => x.i.c.id === s.i.c.id) === s;
    const co = firstThere && !s.i.c.hidden ? COMPANY_GTM.filter((f) => s.i.c.cells[f]).length : 0;
    return SEAT_ASK.filter((f) => s.e.cells[f]).length + co;
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

  return (
    <div className="tp-page ys-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Your seats</h1>
      {list.length === 0 ? (
        <div className="ys-empty">
          <h2 className="ys-empty-h">We don&apos;t have a seat under your name yet</h2>
          <p>Add one you held and it shows up here. Each answer you add to it earns 1 credit.</p>
          <button type="button" className="btn btn-primary" onClick={addSeat}>
            <IconPlus size={14} /> Add a seat you held
          </button>
        </div>
      ) : (
        <>
          <p className="ys-lead">
            We have {plural(list.length, "seat")} under your name. Each answer earns 1 credit and goes on the seat for other members. Your rate is the one thing you can keep private.
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
                    ? `You can earn ${Math.min(room, left)} more ${Math.min(room, left) === 1 ? "credit" : "credits"} today`
                    : `You've earned today's ${me.earnCap} credits. Answers still save, and you can earn again ${atTime(me.earnResetsAt)}.`}
              </span>
              <span className="ys-bar" aria-hidden>
                <span style={{ width: `${total ? Math.round((filled / total) * 100) : 100}%` }} />
              </span>
            </div>
          </div>
          {list.map((s) => {
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
                onGone={(id) => setGone((g) => new Set(g).add(id))}
              />
            );
          })}
          <button type="button" className="btn ys-addseat" onClick={addSeat}>
            <IconPlus size={14} /> Add a seat that isn&apos;t here
          </button>
        </>
      )}
    </div>
  );
}
