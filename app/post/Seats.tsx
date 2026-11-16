"use client";

/**
 * "Your seats": the seats on file that are matched to the member (EngagementRec.yours), and
 * what is still missing on each. The main place members give. Every missing fact is answered
 * in place: pick lists are chips where one tap saves, dates and numbers are one input. A rate
 * can go on the record or count in the benchmarks only. After a save the row keeps its place
 * and shows the value, so the page never jumps.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/tableTypes";
import { cleanValue, fieldDef, type FieldDef } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import { CompanyLogo, IconCheck, IconChevron, IconPlus, fmtValue } from "../ui/shared";
import { SEAT_ASK, cellKey, shown, type FactRef, type SeatInfo } from "./model";
import { fmtTime, plural, thisMonth } from "./hooks";
import { earnRoom } from "./NextMove";
import { isMonoField, useUi } from "./ui";
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

/** Save one fact. `busy` is the value on its way. */
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

/** Role, hours, start and end: one input and Save. End also offers Ongoing in one tap. */
function InputAsk({ t, f, onSaved }: { t: FactRef; f: FieldDef; onSaved: OnSaved }) {
  const [v, setV] = useState("");
  const { busy, err, setErr, save } = useFill(t, onSaved);
  const month = f.kind === "month" || f.kind === "monthOrOngoing";
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
          className={`input ys-input${f.kind === "text" ? "" : " mono"}`}
          type={month ? "month" : f.kind === "number" ? "number" : "text"}
          inputMode={f.kind === "number" ? "numeric" : undefined}
          min={f.kind === "number" ? 1 : undefined}
          max={month ? thisMonth() : f.kind === "number" ? 80 : undefined}
          placeholder={month ? "YYYY-MM" : f.placeholder ?? ""}
          aria-label={f.label}
          value={v}
          onChange={(e) => (setV(e.target.value), setErr(null))}
        />
        <button type="submit" className="btn btn-sm ys-save" disabled={!v.trim() || !!busy}>
          {busy && busy !== "Ongoing" ? "Saving" : "Save"}
        </button>
        {f.kind === "monthOrOngoing" && (
          <button type="button" className={`chip tp-chipbtn ys-chip${busy === "Ongoing" ? " chip-on" : ""}`} disabled={!!busy} onClick={() => save("Ongoing")}>
            Ongoing
          </button>
        )}
      </form>
      <Err text={err} />
    </>
  );
}

/** The rate goes on the record (others unlock it) or counts in the benchmarks only (nobody sees it). */
function RateAsk({ t, pricing, onSaved }: { t: FactRef; pricing: string | null; onSaved: OnSaved }) {
  const ui = useUi();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState<"record" | "bench" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const earns = earnRoom(ui.me) > 0;
  const text = v.trim();
  const record = async () => {
    const { value, error } = cleanValue(fieldDef("engagement", "rate")!, text);
    if (error) return setErr(error);
    setErr(null);
    setBusy("record");
    const r = await ui.act({ type: "fill", entity: "engagement", id: t.id, field: "rate", value: value! }, { quiet: true });
    setBusy(null);
    if (r.ok) onSaved(t, { earned: !r.capped });
  };
  const bench = async () => {
    // The medians need a monthly or an hourly figure. With no unit typed, the seat's pricing model decides.
    const read = readRate(text, pricing);
    if (!read) return setErr("Use a monthly or hourly rate, like $8k/mo or $150/hr.");
    setErr(null);
    setBusy("bench");
    const r = await ui.act(
      { type: "benchRate", engagementId: t.id, pricing: read.kind === "hourly" ? "Hourly" : "Monthly retainer", rate: text },
      { quiet: true },
    );
    setBusy(null);
    if (r.ok) onSaved(t, { earned: !r.capped, bench: benchText(read.kind, read.amount) });
  };
  const plus = earns ? <span className="ys-opt-plus mono">+1</span> : null;
  return (
    <div className="ys-rate">
      <input
        className="input mono ys-input ys-rate-input"
        placeholder="$8k/mo or $150/hr"
        aria-label="Rate"
        value={v}
        onChange={(e) => (setV(e.target.value), setErr(null))}
      />
      <div className="ys-rate-opts">
        <button type="button" className="ys-opt" disabled={!text || !!busy} onClick={record}>
          <span className="ys-opt-h">
            {busy === "record" ? "Saving" : "Add to the record"} {plus}
          </span>
          <span className="ys-opt-p">Other members unlock it for 1 credit.</span>
        </button>
        <button type="button" className="ys-opt" disabled={!text || !!busy} onClick={bench}>
          <span className="ys-opt-h">
            {busy === "bench" ? "Saving" : "Benchmark only"} {plus}
          </span>
          <span className="ys-opt-p">Counts in the medians. Never shown to anyone.</span>
        </button>
      </div>
      <Err text={err} />
    </div>
  );
}

/** One fact asked for: its control while it is empty, then the value, a volt check and what it earned. */
function Ask({ t, cell, saved, bench, pricing, onSaved }: { t: FactRef; cell: Cell | undefined; saved?: Saved; bench?: string; pricing?: string | null; onSaved: OnSaved }) {
  const f = fieldDef(t.entity, t.field);
  if (!f || !cell) return null;
  const benchOnly = cell.s === "empty" ? saved?.bench ?? bench : undefined;
  const done = cell.s !== "empty" || !!benchOnly;
  return (
    <div className={`ys-ask${done ? " ys-ask-done" : ""}`} data-ask={cellKey(t.id, t.field)}>
      <span className="ys-ask-l">{f.label}</span>
      <div className="ys-ask-c">
        {done ? (
          <span className="ys-donerow">
            <span className={`ys-val${isMonoField(t) ? " mono" : ""}`}>
              {cell.s === "value" ? fmtValue(t.entity, t.field, cell.v) : benchOnly ? benchOnly : "Under review"}
            </span>
            <span className="ys-check" aria-label="Saved">
              <IconCheck size={11} />
            </span>
            {benchOnly && <span className="ys-note">In the benchmarks only. Nobody sees it.</span>}
            {saved && <span className={`ys-earned${saved.earned ? " mono" : " none"}`}>{saved.earned ? "+1" : "Saved. No credit today."}</span>}
          </span>
        ) : t.field === "rate" ? (
          <RateAsk t={t} pricing={pricing ?? null} onSaved={onSaved} />
        ) : f.kind === "choice" ? (
          <ChoiceAsk t={t} f={f} onSaved={onSaved} />
        ) : (
          <InputAsk t={t} f={f} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

function SeatCard({
  s,
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
  /** Facts still to fill on this seat. */
  left: number;
  /** Facts that were missing when the page opened: they keep their row after they are filled. */
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
  const fn = shown(e.cells.function);
  const role = shown(e.cells.role);
  const et = (field: string): FactRef => ({ entity: "engagement", id: e.id, field });
  const ct = (field: string): FactRef => ({ entity: "company", id: i.c.id, field });
  // Facts that were already on file when the page opened, as compact values (function and role are in the header).
  const known = SEAT_ASK.filter((f) => !asks.includes(f) && f !== "function" && f !== "role")
    .map((f) => {
      const c = e.cells[f];
      const def = fieldDef("engagement", f)!;
      // Hours read as a bare number here: the label already says per week.
      const v = c?.s === "value" ? (f === "hours" ? c.v : fmtValue("engagement", f, c.v)) : c?.s === "reported" ? "Under review" : f === "rate" && bench ? bench : null;
      return v ? { f, v, label: f === "hours" ? def.label : def.short ?? def.label, note: c?.s === "empty" ? "benchmarks only" : null } : null;
    })
    .filter((x): x is { f: string; v: string; label: string; note: string | null } => !!x);
  const remove = async () => {
    setBusy(true);
    const r = await ui.act({ type: "notMine", engagementId: e.id });
    setBusy(false);
    if (r.ok) onGone(e.id);
  };
  const name = i.c.hidden ? "Hidden company" : i.c.name;
  return (
    <article className={`ys-seat${focus ? " focus" : ""}${open ? "" : " folded"}`} id={`ys-${e.id}`} aria-label={`Your seat at ${name}`}>
      <header className="ys-seat-head">
        <button type="button" className="ys-co" onClick={() => ui.openCompany(i.c.id, e.id)} title="Open the company record">
          <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} hidden={i.c.hidden} />
          <span className="ys-co-name">{name}</span>
        </button>
        <span className="ys-seat-what">
          {fn && <span className="chip tp-fn">{fn}</span>}
          {role && <span className="ys-role">{role}</span>}
        </span>
        {left > 0 ? (
          <span className="ys-left">
            <span className="mono">{left}</span> to fill
          </span>
        ) : (
          <span className="ys-complete">
            <IconCheck size={12} /> Complete
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
              {known.map(({ f, v, label, note }) => (
                <div key={f} className="ys-kv">
                  <dt>{label}</dt>
                  <dd>
                    <span className={isMonoField(et(f)) ? "mono" : undefined}>{v}</span>
                    {note && <span className="ys-kv-note"> {note}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {asks.length > 0 && (
            <div className="ys-asks">
              {asks.map((f) => (
                <Ask key={f} t={et(f)} cell={e.cells[f]} saved={saved[cellKey(e.id, f)]} bench={f === "rate" ? bench : undefined} pricing={shown(e.cells.pricing)} onSaved={onSaved} />
              ))}
            </div>
          )}
          {coAsks.length > 0 && (
            <div className="ys-asks ys-asks-co">
              <h3 className="ys-sub">How {name} sells</h3>
              {coAsks.map((f) => (
                <Ask key={f} t={ct(f)} cell={i.c.cells[f]} saved={saved[cellKey(i.c.id, f)]} onSaved={onSaved} />
              ))}
            </div>
          )}
          <footer className="ys-seat-foot">
            {confirm ? (
              <>
                <span>Take this seat off your list?</span>
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

/** Cards fold once a member has more seats than this. */
const FOLD_OVER = 3;

export function Seats({ seats, focus, onBack }: { seats: SeatInfo[]; focus: string | null; onBack: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  // What was missing on each seat when it first showed, and the order the seats showed in. Both
  // stay put for the visit, so a saved fact keeps its row and nothing reorders under the member.
  const frozen = useRef(new Map<string, { asks: string[]; co: string[] }>());
  const order = useRef<string[]>([]);
  for (const s of seats) {
    if (frozen.current.has(s.e.id)) continue;
    frozen.current.set(s.e.id, { asks: s.missing, co: s.coMissing });
    order.current.push(s.e.id);
  }
  const byId = useMemo(() => new Map(seats.map((s) => [s.e.id, s])), [seats]);
  const list = order.current.map((id) => byId.get(id)).filter((s): s is SeatInfo => !!s && !gone.has(s.e.id));
  const [open, setOpen] = useState<Set<string>>(() => {
    if (seats.length <= FOLD_OVER) return new Set(seats.map((s) => s.e.id));
    const first = seats.filter((s) => s.missing.length + s.coMissing.length > 0).slice(0, FOLD_OVER);
    return new Set([...first.map((s) => s.e.id), ...(focus ? [focus] : [])]);
  });
  const folding = list.length > FOLD_OVER;

  useEffect(() => {
    if (!focus) return;
    setOpen((o) => (o.has(focus) ? o : new Set(o).add(focus)));
    const t = setTimeout(() => document.getElementById(`ys-${focus}`)?.scrollIntoView({ block: "start" }), 30);
    return () => clearTimeout(t);
  }, [focus]);

  const benchBySeat = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of me.benchRates ?? []) if (b.engagementId) m.set(b.engagementId, benchText(b.kind, b.amount));
    return m;
  }, [me.benchRates]);

  const onSaved: OnSaved = (t, s) => setSaved((o) => ({ ...o, [cellKey(t.id, t.field)]: s }));
  // A rate shared for the benchmarks only is done as soon as it saves (the member's list of them arrives with the next sync).
  const leftOf = (s: SeatInfo) => s.missing.filter((f) => !saved[cellKey(s.e.id, f)]?.bench).length + s.coMissing.length;
  const left = list.reduce((n, s) => n + leftOf(s), 0);
  const total = list.reduce((n, s) => {
    const fz = frozen.current.get(s.e.id);
    return n + (fz ? fz.asks.length + fz.co.length : 0);
  }, 0);
  const room = earnRoom(me);
  const addSeat = () => ui.openAdd({ mine: true });

  return (
    <div className="tp-page ys-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Your seats</h1>
      {list.length === 0 ? (
        <div className="ys-empty">
          <p>No seat on file is matched to your name yet.</p>
          <button type="button" className="btn btn-primary" onClick={addSeat}>
            <IconPlus size={14} /> Add a seat you held
          </button>
        </div>
      ) : (
        <>
          <p className="ys-lead">
            We matched {plural(list.length, "seat")} to you by name. Each missing fact you add earns 1 credit.
          </p>
          <div className="ys-progress">
            <div className="ys-progress-box" role="status">
              <span className="ys-progress-n">
                {left > 0 ? (
                  <>
                    <strong className="mono">{left}</strong> {left === 1 ? "fact" : "facts"} missing
                  </>
                ) : (
                  <>
                    <span className="ys-check" aria-hidden>
                      <IconCheck size={11} />
                    </span>{" "}
                    Every fact on your seats is filled in
                  </>
                )}
              </span>
              <span className={`ys-progress-r${room ? "" : " capped"}`}>
                {room ? (
                  <>
                    You can still earn <span className="mono">{room}</span> today
                  </>
                ) : (
                  `You earned today's ${me.earnCap}. Facts still save. Earning reopens ${fmtTime(me.earnResetsAt)}.`
                )}
              </span>
              <span className="ys-bar" aria-hidden>
                <span style={{ width: `${total ? Math.round(((total - left) / total) * 100) : 100}%` }} />
              </span>
            </div>
          </div>
          {list.map((s) => {
            const fz = frozen.current.get(s.e.id)!;
            return (
              <SeatCard
                key={s.e.id}
                s={s}
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
            <IconPlus size={14} /> Add a seat we don&apos;t have
          </button>
        </>
      )}
    </div>
  );
}
