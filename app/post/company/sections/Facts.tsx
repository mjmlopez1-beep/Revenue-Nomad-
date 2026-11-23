"use client";

/**
 * One fact as a row (FieldRow) with where it came from and Confirm and Report, a purchase that opens more than one fact (PairLock), and a list of facts with the empty ones as add pills (FieldList).
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Action, Cell } from "@/lib/tableTypes";
import { fieldDef, type Entity } from "@/lib/tableFields";
import { AddPill, IconCheck, IconChevron, LockPill, val } from "../../../ui/shared";
import { cellKey, shown, waitWords, type FactRef } from "../../model";
import { Anchored, FactCell, FactValue, QuietLock, Sheet, ZeroCredits, shortLabel, useUi, type Ui } from "../../ui";
import { sendSignal } from "../../ProOffer";
import { LEADERS_SOURCE_SAY } from "@/lib/leaders/types";
import { OWNSITE_SAY } from "@/lib/ownsites/types";
import { likelyWords } from "@/lib/leaders/likely";
import { plural } from "../../hooks";
import { marksConfirmed } from "../../display";
import { earnsNow, listOf, useEnv, useEscape } from "./env";

/** An add pill for a missing fact. The "+1" shows only when adding it earns a credit today. */
export function AddFact({ t, label }: { t: FactRef; label?: string }) {
  const ui = useUi();
  const env = useEnv();
  const ref = useRef<HTMLSpanElement>(null);
  const k = cellKey(t.id, t.field);
  const f = fieldDef(t.entity, t.field);
  // The member's own rate, shared for the benchmarks only: not missing, and not on the seat either.
  if (t.entity === "engagement" && t.field === "rate" && ui.me.benchRates?.some((b) => b.engagementId === t.id))
    return (
      <span data-cell={k} className="tp-benchonly" title="You shared this rate for the benchmarks only. It is never shown with your name or the seat. Your seats can put it on the seat.">
        Rate in the benchmarks only
      </span>
    );
  return (
    <span ref={ref} data-cell={k} className={ui.pulse === k ? "tp-pulse" : undefined}>
      <AddPill label={label ?? (f ? shortLabel(f) : t.field)} earn={earnsNow(ui, env, t)} onAdd={() => ref.current && ui.edit(ref.current, t)} />
    </span>
  );
}

/* ---------- one fact ---------- */

export const REPORT_BLOCKED = "Reporting opens once you've added a fact of your own. Add one, then you can report this.";

/** What the member can do with a visible fact, and the words for it. */
export function factInfo(t: FactRef, cell: Cell, ui: Ui, own: boolean, listed: boolean, fixed: boolean) {
  const v = cell.s === "value" && !cell.system ? cell : null;
  const gated = !!fieldDef(t.entity, t.field)?.gated;
  // Their own name on their own seat is not theirs to confirm or report ("This isn't me" on Your seats unlinks it).
  // A name from public profiles nobody verified has its own three choices instead (Verify, app/post/Verify.tsx).
  const canCheck = !!v && !v.mine && !v.member?.you && !v.unverified;
  // A free fact can be reported once the member has added one of their own. A fact they paid for, or one on their own seat, always.
  const reportBlocked = canCheck && !gated && !own && ui.me.added === 0;
  const admin = !!v && ui.me.admin && !v.from;
  // The member's own fact can be edited, except a name they put on an open role ("This isn't me" on Your seats undoes that).
  // A seat holder can also fix the function on their own seat, whoever set it (our records included).
  const ownFn = own && t.entity === "engagement" && t.field === "function";
  const canEdit = (!!v?.mine || (!!v && ownFn)) && !fixed;
  const source = !v
    ? ""
    : v.from === "pattern"
      ? `${likelyWords(v.likely ?? 0)}. Not verified`
      : v.from === "ownsite"
        ? OWNSITE_SAY
      : v.from === "website"
        ? LEADERS_SOURCE_SAY
        : v.from === "records"
          ? "From Revenue Nomad records"
          : v.from === "research"
            ? "Revenue Nomad research"
            : v.from === "posting"
              ? "From the job posting"
              : v.mine
                ? v.claimed
                  ? "You claimed this"
                  : "You added this"
                : "Added by a member";
  const confirmHelp = v && !v.from ? "Two confirmations earn the member who added it a credit." : "It tells other members this still holds.";
  const back = gated && !own ? " You get the credit back if we remove it." : "";
  const reportHelp = own
    ? "It hides for everyone until we review it."
    : listed && v?.from === "posting"
      ? `It hides for you now. Others still see it while the posting is listed.${back}`
      : `It hides for you now and for everyone after a second report.${back}`;
  return { canCheck, canEdit, reportBlocked, admin, source, confirmHelp, reportHelp, tappable: !!v && (canCheck || canEdit || admin) };
}
export type FactInfo = ReturnType<typeof factInfo>;
export type Step = null | "report" | "blocked" | "remove";

/**
 * At rest: how many members confirmed it, else, for a fact the posting gave, "From the posting".
 * Most facts come from our records, so saying so on every row would be noise: the seat's own
 * source line, the tooltips and the fact sheet carry it. A name nobody verified gets no tick
 * (it would read as verified): its Verify button says how many members confirmed it.
 */
export function Provenance({ cell, source }: { cell: Cell; source: string }) {
  if (cell.s !== "value" || cell.system) return null;
  if (cell.ver > 0 && marksConfirmed(cell)) {
    const say = `Confirmed by ${plural(cell.ver, "member")}`;
    // The tick and the count are what a sighted member reads; a screen reader hears the sentence.
    return (
      <span className="tp-ver num" title={`${source}. ${say}.`}>
        <IconCheck size={11} /> <span aria-hidden>{cell.ver}</span>
        <span className="sr-only">{say}</span>
      </span>
    );
  }
  if (cell.from === "posting")
    return (
      <span className="tp-from" title="From the job posting">
        From the posting
      </span>
    );
  // An email read from the seat holder's own website says so.
  if (cell.from === "ownsite")
    return (
      <span className="tp-from" title={`${OWNSITE_SAY}: the address they publish on their own firm's website.`}>
        {OWNSITE_SAY}
      </span>
    );
  // A likely email always says so, confirmed or not: it is never shown as verified.
  if (cell.from === "pattern")
    return (
      <span className="tp-from tp-likely" title={`${likelyWords(cell.likely ?? 0)}. Not verified.`}>
        Likely
      </span>
    );
  return null;
}

/** The second step of Report and Remove, and the reason Report is not open yet. Full width under the row. */
export function RowAsk({ t, f, step, onDone }: { t: FactRef; f: FactInfo; step: Exclude<Step, null>; onDone: () => void }) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const run = async (a: Action) => {
    setBusy(true);
    await ui.act(a);
    setBusy(false);
    onDone();
  };
  if (step === "blocked")
    return (
      <div className="tp-frow-ask" role="group" aria-label="Report">
        <p>{REPORT_BLOCKED}</p>
        <span className="tp-frow-ask-acts">
          <button type="button" className="tp-tbtn" autoFocus onClick={onDone}>
            OK
          </button>
        </span>
      </div>
    );
  const remove = step === "remove";
  return (
    <div className="tp-frow-ask" role="group" aria-label={remove ? "Remove this fact" : "Report this fact"}>
      <p>
        {remove
          ? "Remove this fact? The field opens again. The member who added it loses the credit it earned, and anyone who paid to see it gets theirs back."
          : `Report this as wrong? ${f.reportHelp}`}
      </p>
      <span className="tp-frow-ask-acts">
        <button type="button" className="tp-tbtn tp-tbtn-red" autoFocus disabled={busy} aria-busy={busy} onClick={() => run({ type: remove ? "adminRemove" : "report", ...t })}>
          {busy ? (remove ? "Removing" : "Reporting") : remove ? "Remove it" : "Report it"}
        </button>
        <button type="button" className="tp-tbtn" onClick={onDone}>
          Cancel
        </button>
      </span>
    </div>
  );
}

/**
 * [ux ws3] Confirm and Report (and an admin's Remove) in one "⋯" menu at the end of the row: one
 * button a row instead of two or three, a real menu (Up, Down, Esc), and a tap opens it the same.
 */
export function RowMore({ t, cell, f, label, setStep }: { t: FactRef; cell: Cell; f: FactInfo; label: string; setStep: (s: Step) => void }) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  // The menu hands focus back to ⋯ as it closes; the step it opened takes it after that.
  const pick = (go: () => void) => {
    setOpen(false);
    setTimeout(go);
  };
  const what = `${label}: confirm or report`;
  const confirmed = cell.s === "value" && !!cell.iv;
  return (
    <>
      <button ref={btn} type="button" className="tp-tbtn tp-rowmore" aria-haspopup="menu" aria-expanded={false} aria-label={what} title="Confirm or report" onClick={() => setOpen((x) => !x)}>
        <span aria-hidden>⋯</span>
      </button>
      {open && btn.current && (
        <Anchored anchor={btn.current} onClose={() => setOpen(false)} width={260} className="tp-menu tp-rowmore-menu" align="end" label={what}>
          {f.canCheck &&
            (confirmed ? (
              <div className="tp-menu-group" role="presentation">
                You confirmed this
              </div>
            ) : (
              <button type="button" role="menuitem" className="tp-menu-item" title={f.confirmHelp} onClick={() => pick(() => void ui.act({ type: "verify", ...t }))}>
                <span>Confirm</span>
                <span className="tp-menu-hint">It&apos;s right</span>
              </button>
            ))}
          {f.canCheck && (
            <button
              type="button"
              role="menuitem"
              className="tp-menu-item"
              aria-disabled={f.reportBlocked || undefined}
              title={f.reportBlocked ? REPORT_BLOCKED : undefined}
              onClick={() => pick(() => setStep(f.reportBlocked ? "blocked" : "report"))}
            >
              <span>Report</span>
              <span className="tp-menu-hint">It&apos;s wrong</span>
            </button>
          )}
          {f.admin && (
            <button type="button" role="menuitem" className="tp-menu-item tp-menu-red" onClick={() => pick(() => setStep("remove"))}>
              <span>Remove</span>
              <span className="tp-menu-hint">Admins</span>
            </button>
          )}
        </Anchored>
      )}
    </>
  );
}

/** Desktop: "You added this · Edit", and the row's "⋯" (Confirm and Report) on its hover and focus. */
export function Meta({ t, cell, f, step, setStep, label }: { t: FactRef; cell: Cell; f: FactInfo; step: Step; setStep: (s: Step) => void; label: string }) {
  const ui = useUi();
  if (cell.s !== "value" || cell.system) return null;
  // Where the fact came from and Confirm and Report share one place at the end of the row: in the
  // 440px record the buttons show over that note on hover, so they never squeeze or cover the value.
  return (
    <span className="tp-meta">
      <span className="tp-meta-info">
        <Provenance cell={cell} source={f.source} />
        {cell.mine && <span className="tp-yours">{cell.claimed ? "You claimed this" : "You added this"}</span>}
      </span>
      {f.canEdit && (
        <button type="button" className="tp-tbtn" onClick={(e) => ui.edit(e.currentTarget, t, cell.v)}>
          Edit
        </button>
      )}
      {(f.canCheck || f.admin) && (
        <span className={`tp-meta-acts${step ? " off" : ""}`}>
          <RowMore t={t} cell={cell} f={f} label={label} setStep={setStep} />
        </span>
      )}
    </span>
  );
}

/** Touch screens: the fact, where it came from, and what the member can do about it, in 44px rows. */
export function FactSheet({ t, cell, label, f, display, anchor, onClose }: { t: FactRef; cell: Cell; label: string; f: FactInfo; display: ReactNode; anchor: HTMLElement | null; onClose: () => void }) {
  const ui = useUi();
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(true, () => (step ? setStep(null) : onClose()), ref);
  // Focus moves into the sheet, and back to the row when it closes.
  useEffect(() => {
    (ref.current?.querySelector<HTMLElement>("button.tp-fs-row") ?? ref.current?.closest(".tp-sheet")?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    return () => {
      if (anchor?.isConnected && (document.activeElement === document.body || !document.activeElement)) anchor.querySelector<HTMLElement>(".tp-frow-btn")?.focus({ preventScroll: true });
    };
  }, [anchor]);
  if (cell.s !== "value") return null;
  const run = async (a: Action) => {
    setBusy(true);
    const r = await ui.act(a);
    setBusy(false);
    if (r.ok) onClose();
  };
  const remove = step === "remove";
  return (
    <Sheet title={label} onClose={onClose}>
      <div ref={ref} className="tp-fs">
        <div className="tp-fs-val">{display}</div>
        <p className="tp-fs-src">
          {f.source}
          {cell.ver > 0 ? `. Confirmed by ${plural(cell.ver, "member")}.` : "."}
        </p>
        <div className="tp-fs-rows">
          {f.canEdit && (
            <button
              type="button"
              className="tp-fs-row"
              onClick={() => {
                onClose();
                if (anchor) ui.edit(anchor, t, cell.v);
              }}
            >
              <b>Edit</b>
              <span>Fix it or bring it up to date. Edits earn no credit.</span>
            </button>
          )}
          {f.canCheck &&
            (cell.iv ? (
              <div className="tp-fs-row is-done">
                <b>
                  <IconCheck size={13} /> You confirmed this
                </b>
              </div>
            ) : (
              <button type="button" className="tp-fs-row" disabled={busy} aria-busy={busy} onClick={() => run({ type: "verify", ...t })}>
                <b>This is right</b>
                <span>{f.confirmHelp}</span>
              </button>
            ))}
          {f.canCheck &&
            (f.reportBlocked ? (
              <div className="tp-fs-row is-off" aria-disabled="true">
                <b>This is wrong</b>
                <span>{REPORT_BLOCKED}</span>
              </div>
            ) : step === "report" ? null : (
              <button type="button" className="tp-fs-row" onClick={() => setStep("report")}>
                <b>This is wrong</b>
                <span>{f.reportHelp}</span>
              </button>
            ))}
          {f.admin && step !== "remove" && step !== "report" && (
            <button type="button" className="tp-fs-row tp-fs-red" onClick={() => setStep("remove")}>
              <b>Remove this fact</b>
              <span>Admins only. The field opens again and the credits it moved go back.</span>
            </button>
          )}
          {(step === "report" || remove) && (
            <div className="tp-fs-ask" role="group">
              <p>{remove ? "Remove this fact? The member who added it loses the credit it earned, and anyone who paid to see it gets theirs back." : `Report this as wrong? ${f.reportHelp}`}</p>
              <div className="tp-fs-ask-acts">
                <button type="button" className="btn btn-lg" onClick={() => setStep(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-lg tp-btn-red" autoFocus disabled={busy} aria-busy={busy} onClick={() => run({ type: remove ? "adminRemove" : "report", ...t })}>
                  {busy ? (remove ? "Removing" : "Reporting") : remove ? "Remove it" : "Report it"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * One fact: its label, its value, and what the member can do with it. `own`: a fact on the
 * member's own seat. `listed`: the seat is an open role whose posting is still up.
 */
export function FieldRow({
  t,
  cell,
  label,
  own = false,
  listed = false,
  fixed = false,
  render,
  note,
  waits,
  noun,
}: {
  t: FactRef;
  cell: Cell;
  label: string;
  own?: boolean;
  listed?: boolean;
  /** The member's own value here can't be edited. */
  fixed?: boolean;
  render?: (v: string) => ReactNode;
  note?: ReactNode;
  /** A locked fact that opens only after another purchase (AFTER_NAME, AFTER_COMPANY): a quiet lock, nothing to spend. */
  waits?: string | null;
  /** What the lock opens, where its label says more than "Unlock" ("who held it"). */
  noun?: string;
}) {
  const ui = useUi();
  const env = useEnv();
  const [step, setStep] = useState<Step>(null);
  const [sheet, setSheet] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const f = factInfo(t, cell, ui, own, listed, fixed);
  useEscape(step !== null, () => setStep(null));
  // Back from a step: focus returns to the control that opened it.
  const opener = useRef<HTMLElement | null>(null);
  const open = (s: Step) => {
    opener.current = document.activeElement as HTMLElement | null;
    setStep(s);
  };
  const done = () => {
    setStep(null);
    setTimeout(() => opener.current?.isConnected && opener.current.focus({ preventScroll: true }));
  };
  const words = cell.s === "locked" ? waitWords(waits) : null;
  const value = words && waits ? <QuietLock words={words} tip={waits} /> : <FactCell t={t} cell={cell} render={render} noun={noun} />;
  if (env.touch) {
    const tap = f.tappable;
    const text = cell.s === "value" ? cell.v : "";
    // The confirmations tick, never beside a name nobody verified (Verify says how many confirmed it).
    const ticked = cell.s === "value" && cell.ver > 0 && marksConfirmed(cell);
    return (
      <div className={`tp-frow${tap ? " tp-frow-tap" : ""}`} ref={rowRef}>
        <span className="tp-frow-l">{label}</span>
        <span className="tp-frow-v">
          {value}
          {note}
          {cell.s === "value" && cell.mine && <span className="tp-frow-cap">{cell.claimed ? "You claimed this" : "You added this"}</span>}
        </span>
        {(tap || ticked) && (
          <span className="tp-meta" aria-hidden>
            {ticked && cell.s === "value" && (
              <span className="tp-ver num">
                <IconCheck size={11} /> {cell.ver}
              </span>
            )}
            {tap && <IconChevron dir="right" size={14} />}
          </span>
        )}
        {tap && (
          <button
            type="button"
            className="tp-frow-btn"
            aria-haspopup="dialog"
            aria-label={`${label}, ${text}. ${f.canEdit ? (cell.s === "value" && cell.mine ? "You added this. Open to edit it." : "Open to edit it.") : f.canCheck ? "Open to confirm or report it." : "Open it."}`}
            onClick={() => setSheet(true)}
          />
        )}
        {sheet && (
          <FactSheet
            t={t}
            cell={cell}
            label={label}
            f={f}
            display={cell.s === "value" ? (render ? render(cell.v) : <FactValue t={t} v={cell.v} />) : null}
            anchor={rowRef.current}
            onClose={() => setSheet(false)}
          />
        )}
      </div>
    );
  }
  return (
    <div className={`tp-frow${step ? " tp-frow-asking" : ""}`} ref={rowRef}>
      <span className="tp-frow-l">{label}</span>
      <span className="tp-frow-v">
        {value}
        {note}
      </span>
      <Meta t={t} cell={cell} f={f} step={step} setStep={open} label={label} />
      {step && <RowAsk t={t} f={f} step={step} onDone={done} />}
    </div>
  );
}

/** How the one row for an open role's locked role, posting and rate names its parts. */
export const GROUP_LABEL: Record<string, [string, string]> = {
  role: ["Role", "the role"],
  posting: ["posting", "the job posting"],
  rate: ["rate", "the posted rate"],
  name: ["name", "the name"],
  title: ["title", "the title"],
};

/**
 * One purchase that opens more than one fact: one row, one lock, one price. An open role's
 * posting and rate (and the company with them while it is hidden). A person's name and title
 * ("Unlock name and title · 1 credit"). Who held a seat and their role ("Unlock who held it · 1
 * credit"). `fields` are the ones still locked, in order. `waits`: the purchase opens only after
 * another one (a locked company's people and seat holders), so the row is a quiet lock.
 */
export function PairLock({ entity = "engagement", id, hidden, fields, waits }: { entity?: Entity; id: string; hidden: boolean; fields: string[]; waits?: string | null }) {
  const ui = useUi();
  const lead = fields[0];
  const t = { entity, id, field: lead };
  const person = entity === "contact";
  const seat = entity === "engagement" && fields.includes("operator");
  const ref = useRef<HTMLSpanElement>(null);
  const [zero, setZero] = useState(false);
  const busy = fields.some((f) => ui.busy.has(cellKey(id, f)));
  const names = fields.map((f) => GROUP_LABEL[f]?.[1] ?? f);
  const label = seat
    ? "Held by and role"
    : listOf(fields.map((f, k) => (k === 0 ? (GROUP_LABEL[f]?.[0] ?? f).replace(/^./, (x) => x.toUpperCase()) : GROUP_LABEL[f]?.[0] ?? f)));
  const words = waitWords(waits);
  if (words && waits)
    return (
      <div className="tp-frow">
        <span className="tp-frow-l">{label}</span>
        <span className="tp-frow-v" data-cell={cellKey(id, lead)}>
          <QuietLock words={words} tip={waits} />
        </span>
      </div>
    );
  const broke = ui.me.credits <= 0;
  // Today's unlocks are used up and credits are left: it says when, and spends nothing.
  const later = !broke && ui.me.unlocksLeft === 0;
  return (
    <div className="tp-frow">
      <span className="tp-frow-l">{label}</span>
      <span className="tp-frow-v">
        <span className="tp-cell" data-cell={cellKey(id, lead)} ref={ref}>
          <LockPill
            what={person ? "this person's name and title" : seat ? "who held this seat and their role" : listOf(hidden ? ["the company", ...names] : names)}
            noun={person ? "name and title" : seat ? "who held it" : undefined}
            busy={busy}
            later={later}
            broke={broke}
            onUnlock={() => {
              if (ui.me.credits > 0) return ui.unlock(t);
              sendSignal("wall", person || seat ? lead : "role");
              setZero(true);
            }}
          />
          {zero && ui.me.credits <= 0 && ref.current && <ZeroCredits anchor={ref.current} id={id} onClose={() => setZero(false)} />}
        </span>
      </span>
    </div>
  );
}

/** Empty fields people add most often come first. */
export const EMPTY_FIRST = ["role", "reason", "rate", "status"];
export const emptyRank = (f: string) => (EMPTY_FIRST.includes(f) ? EMPTY_FIRST.indexOf(f) : EMPTY_FIRST.length);

/**
 * Known and locked fields as rows; the empty ones as a compact row of add pills (three, then
 * "Show N more"). `noAdd`: empty fields that take nothing here (an open role has no start or
 * seat holder yet, a person the member can't see yet takes no contact details). `pair`: fields
 * that unlock together, drawn as one row while two or more are locked. `waits`: why a locked field
 * opens only after another purchase (AFTER_NAME, AFTER_COMPANY), or null when its lock spends.
 */
export function FieldList({
  entity,
  id,
  cells,
  fields,
  noAdd = [],
  labels = {},
  render = {},
  notes = {},
  after = {},
  pair,
  own,
  listed,
  emptyNote,
  fixed = [],
  waits,
  nouns,
}: {
  entity: Entity;
  id: string;
  cells: Record<string, Cell>;
  fields: string[];
  noAdd?: string[];
  labels?: Record<string, string>;
  render?: Record<string, (v: string) => ReactNode>;
  notes?: Record<string, ReactNode>;
  after?: Record<string, ReactNode>;
  /** Fields that unlock together (an open role's posting and rate, a person's name and title, who held a seat and their role): one row while two or more are locked. */
  pair?: string[];
  own?: boolean;
  listed?: boolean;
  /** A line over the add pills: what adding them earns today. */
  emptyNote?: ReactNode;
  /** Fields whose value the member added but can't edit here. */
  fixed?: string[];
  waits?: (field: string) => string | null;
  /** What a field's lock opens, where its label says more than "Unlock" (a seat holder's: "who held it"). */
  nouns?: Record<string, string>;
}) {
  const ui = useUi();
  const group = (pair ?? []).filter((f) => cells[f]?.s === "locked");
  const paired = group.length >= 2;
  const present = fields.filter((f) => cells[f] && cells[f].s !== "empty" && !(paired && group.includes(f) && f !== group[0]));
  // A seat's facts are added by its holder alone.
  const othersSeat = entity === "engagement" && !ui.holdsSeat(id);
  const empty = fields
    .filter((f) => cells[f]?.s === "empty" && !noAdd.includes(f) && !ui.isHidden(id) && !othersSeat)
    .sort((a, b) => emptyRank(a) - emptyRank(b));
  const pulseHidden = empty.slice(3).some((f) => ui.pulse === cellKey(id, f));
  const [more, setMore] = useState(pulseHidden);
  const all = more || pulseHidden;
  return (
    <>
      {present.length > 0 && (
        <div className="tp-flist-d">
          {present.map((f) => (
            <Fragment key={f}>
              {paired && f === group[0] ? (
                <PairLock entity={entity} id={id} hidden={ui.isHidden(id)} fields={group} waits={waits?.(f)} />
              ) : (
                <FieldRow
                  t={{ entity, id, field: f }}
                  cell={cells[f]}
                  label={labels[f] ?? shortLabel(fieldDef(entity, f)!)}
                  render={render[f]}
                  note={notes[f]}
                  own={own}
                  listed={listed}
                  fixed={fixed.includes(f)}
                  waits={waits?.(f)}
                  noun={nouns?.[f]}
                />
              )}
              {after[f]}
            </Fragment>
          ))}
        </div>
      )}
      {empty.length > 0 && emptyNote && <p className="tp-dsec-note tp-pills-note">{emptyNote}</p>}
      {empty.length > 0 && (
        <div className="tp-missing-row">
          {(all ? empty : empty.slice(0, 3)).map((f) => (
            <AddFact key={f} t={{ entity, id, field: f }} label={labels[f]} />
          ))}
          {empty.length > 3 && !all && (
            <button type="button" className="tp-tbtn" onClick={() => setMore(true)}>
              Show {empty.length - 3} more
            </button>
          )}
        </div>
      )}
    </>
  );
}
