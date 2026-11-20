"use client";

/**
 * The record drawer (440px, right) and its phone twin (full-screen sheet with a sticky
 * action bar). Everything about one company: header, actions, about, how they sell, functions,
 * every seat, people, and the company's own details.
 *
 * One primary action. A locked company has "Unlock company, posting and rate" and nothing else to press until
 * it is unlocked. Any other company has Add to this company, with Unlock all beside it as an
 * outline button, once per record. The solid ember "Hiring now" chip lives here, in the header,
 * and nowhere else.
 *
 * Every fact is a row (FieldRow): its label, its value, and where it came from. On a desktop,
 * Confirm and Report (and Edit on the member's own facts) show on the row's hover and focus.
 * On touch screens a tap on the row opens the fact sheet with "This is right" and "This is
 * wrong", so nothing free sits next to a lock that spends a credit.
 *
 * Focus: the record takes focus when it opens (its title), arrow keys scroll it, Esc closes
 * the form open inside it before the record, and focus goes back to the row on close. On a
 * phone it is modal: Tab stays inside and the page behind is inert.
 */
import { MessageButton } from "./Messages";
import { InviteConnect } from "./Invite";
import { VerifyName } from "./Verify";
import { AboutText } from "./About";
import { Fragment, createContext, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { Action, ActionResult, Cell, CompanyRec, EngagementRec, PersonRec, View } from "@/lib/tableTypes";
import { COMPANY_PRICE, COMPANY_PRICE_SAY, FOUND_NOTE, FRACTIONAL_TYPES, RELATIONSHIPS, SOURCE_LABEL, cleanValue, fieldDef, PERSON_BUNDLE, PERSON_DETAILS, SEAT_BUNDLE, type Entity } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconCheck, IconChevron, IconExternal, IconPlus, IconStar, IconX, LockPill, LockedName, fmtMonth, hrefFor, post, timeAgo, val } from "../ui/shared";
import {
  AFTER_COMPANY, AFTER_NAME, COMPANY_FILL, COMPANY_GTM, ENG_FIELDS, OPEN_ROLE_BUNDLE, PERSON_NO_ADD, cellKey, personBothLocked, personUnseen, fitReason, isOpenSeat, namedFn, seatBundled,
  seatMissingCount, shown, waitWords, fnGap, type CoInfo, type FactRef,
} from "./model";
import { Anchored, FactCell, FactValue, Pro, QuietLock, Sheet, YourSeat, ZeroCredits, earnNote, shortLabel, useUi, type Ui } from "./ui";
import { sendSignal } from "./ProOffer";
import { Fit, HiddenCompany, NoSeatYet, OnTheTeam, storyTag, storyTitle } from "./Tables";
import { checkedWords, isFractionalLead, leadItems, ledFullTimeWords, monthYear } from "@/lib/leaders/types";
import { LeaderReport } from "./LeaderReport";
import { RoleDate, fmtStamp, statusText } from "./RoleDate";
import { atTime, plural, useMedia } from "./hooks";
import { UNLOCKS_LEFT_TIP, UNLOCK_FREE, freeCompanyNow, marksConfirmed, postingToOpen, unlocksLeft, unlocksLeftWords } from "./display";
import { WayIn } from "./network/Network"; // [google network]

/**
 * Who leads each function, from the company's own website (lib/leaders): "Sales: full-time CRO
 * since Nov 2024 · Marketing: fractional CMO · from the company's website, checked Nov 18". Roles
 * only, never a person, so it shows wherever the company's basics do, a hidden company too (with
 * no link to its site there).
 */
export function LeadsLine({ c }: { c: CompanyRec }) {
  const leads = c.leads;
  if (!leads?.fns.length) return null;
  const url = c.hidden ? null : leads.fns.map((l) => l.url).find((u): u is string => !!u && /^https?:\/\//i.test(u));
  // Only members' word on file ("Sales: full-time CRO (members say)"): no website to name as the source.
  const site = leads.fns.some((l) => l.how !== "members");
  return (
    <p className="tp-dleads">
      <span className="tp-dleads-h">Who leads each function</span>{" "}
      <span className="tp-dleads-t">{leadItems(leads).join(" · ")}</span>
      {site && <span className="tp-dleads-src">
        {" · from "}
        {url ? (
          <a className="tp-link" href={url} target="_blank" rel="noreferrer nofollow">
            the company&apos;s website
          </a>
        ) : (
          "the company's website"
        )}
        , checked {checkedWords(leads.checkedAt)}
      </span>}
    </p>
  );
}

/** Where members reach Revenue Nomad (View.contact, read from the server at run time). */
export type Contact = NonNullable<View["contact"]>;

/* ---------- what the whole record shares ---------- */

interface DrawerEnv {
  /** Touch screen: facts open the fact sheet instead of showing Confirm and Report on hover. */
  touch: boolean;
  phone: boolean;
  contact: Contact | null;
  company: string;
  hidden: boolean;
  /** Company pick lists earn here without the daily limit of 5 (see pickExempt). */
  exempt: boolean;
}
const EnvCtx = createContext<DrawerEnv>({ touch: false, phone: false, contact: null, company: "", hidden: false, exempt: false });
const useEnv = () => useContext(EnvCtx);

/** An overlay sits above the record (a popover, the fact editor, a sheet or the Add modal): Esc is its to take. */
const overlayAbove = () => !!document.querySelector(".tp-pop, .tp-modal-wrap, .tp-sheet-wrap");

/**
 * Esc for something open inside the record (a form, a confirm step, the fact sheet). It runs
 * before the app's own handler, which would close the whole record. `sheet`: this is a sheet
 * itself, so it takes Esc while it is the top one.
 */
function useEscape(active: boolean, onEsc: () => void, sheet?: { current: HTMLElement | null }) {
  const ref = useRef(onEsc);
  ref.current = onEsc;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) {
        const wraps = document.querySelectorAll(".tp-sheet-wrap");
        const top = wraps[wraps.length - 1];
        if (document.querySelector(".tp-pop, .tp-modal-wrap") || !top || !sheet.current || !top.contains(sheet.current)) return;
      } else if (overlayAbove()) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, sheet]);
}

/* ---------- small pieces ---------- */

/** "a", "a and b", "a, b and c". */
const listOf = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const seatsTitle = (n: number | undefined) => (n ? `${plural(n, "seat")} on file` : undefined);
/** Where a company's seats came from, as it reads after "From" in the record's last line. */
const SOURCE_SAY: Record<string, string> = {
  "Published engagement": "seats members published",
  "Member success story": "member stories",
  "Demand scan": "job postings",
  "Member added": "what members added",
  Clay: "Revenue Nomad research",
  "Seat scan": "Revenue Nomad research",
};
/** A role still open: the scan follows it and it has not closed, or it is marked Open role. */
const openRole = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
/** Company pick lists that share the 5 a day that earn (Me.sellEarnLeft). */
const SELL_PICKS = ["industry", "employees", "revenue", "ownership", ...COMPANY_GTM];
const SELL_NOTE = "Only 5 answers a day for a company's industry, size, revenue or how they sell earn a credit. You can still add them.";
/** The day a role closed, in the viewer's time zone. */
const closedOn = (e: EngagementRec) => (e.closedAt ? fmtStamp(e.closedAt) : e.closed ? fmtStamp(`${e.closed}T12:00:00`) : "");

/** Company pick lists earn without the 5 a day at a company the member created (CompanyRec.added) or holds a seat at. */
const pickExempt = (i: CoInfo) => !!i.c.added || i.engs.some((e) => e.yours);

/** Whether adding this fact earns a credit right now (today's cap, and the 5 a day for company pick lists). */
function earnsNow(ui: Ui, env: { exempt: boolean }, t: FactRef) {
  if (earnNote(ui.me).capped) return false;
  if (t.entity === "company" && SELL_PICKS.includes(t.field) && !env.exempt) return (ui.me.sellEarnLeft ?? 1) > 0;
  return true;
}

/** How many of these empty facts would earn a credit today. */
function earnable(ui: Ui, env: { exempt: boolean }, t: FactRef[]) {
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const picks = t.filter((x) => x.entity === "company" && SELL_PICKS.includes(x.field)).length;
  const sellLeft = env.exempt ? Infinity : ui.me.sellEarnLeft ?? Infinity;
  return Math.min(room, t.length - picks + Math.min(picks, sellLeft));
}

/** An add pill for a missing fact. The "+1" shows only when adding it earns a credit today. */
function AddFact({ t, label }: { t: FactRef; label?: string }) {
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

const REPORT_BLOCKED = "Reporting opens once you've added a fact of your own. Add one, then you can report this.";

/** What the member can do with a visible fact, and the words for it. */
function factInfo(t: FactRef, cell: Cell, ui: Ui, own: boolean, listed: boolean, fixed: boolean) {
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
  const source = !v ? "" : v.from === "records" ? "From Revenue Nomad records" : v.from === "research" ? "Revenue Nomad research" : v.from === "posting" ? "From the job posting" : v.mine ? (v.claimed ? "You claimed this" : "You added this") : "Added by a member";
  const confirmHelp = v && !v.from ? "Two confirmations earn the member who added it a credit." : "It tells other members this still holds.";
  const back = gated && !own ? " You get the credit back if we remove it." : "";
  const reportHelp = own
    ? "It hides for everyone until we review it."
    : listed && v?.from === "posting"
      ? `It hides for you now. Others still see it while the posting is listed.${back}`
      : `It hides for you now and for everyone after a second report.${back}`;
  return { canCheck, canEdit, reportBlocked, admin, source, confirmHelp, reportHelp, tappable: !!v && (canCheck || canEdit || admin) };
}
type FactInfo = ReturnType<typeof factInfo>;
type Step = null | "report" | "blocked" | "remove";

/**
 * At rest: how many members confirmed it, else, for a fact the posting gave, "From the posting".
 * Most facts come from our records, so saying so on every row would be noise: the seat's own
 * source line, the tooltips and the fact sheet carry it. A name nobody verified gets no tick
 * (it would read as verified): its Verify button says how many members confirmed it.
 */
function Provenance({ cell, source }: { cell: Cell; source: string }) {
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
  return null;
}

/** The second step of Report and Remove, and the reason Report is not open yet. Full width under the row. */
function RowAsk({ t, f, step, onDone }: { t: FactRef; f: FactInfo; step: Exclude<Step, null>; onDone: () => void }) {
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
function RowMore({ t, cell, f, label, setStep }: { t: FactRef; cell: Cell; f: FactInfo; label: string; setStep: (s: Step) => void }) {
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
function Meta({ t, cell, f, step, setStep, label }: { t: FactRef; cell: Cell; f: FactInfo; step: Step; setStep: (s: Step) => void; label: string }) {
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
function FactSheet({ t, cell, label, f, display, anchor, onClose }: { t: FactRef; cell: Cell; label: string; f: FactInfo; display: ReactNode; anchor: HTMLElement | null; onClose: () => void }) {
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
function FieldRow({
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
const GROUP_LABEL: Record<string, [string, string]> = {
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
function PairLock({ entity = "engagement", id, hidden, fields, waits }: { entity?: Entity; id: string; hidden: boolean; fields: string[]; waits?: string | null }) {
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
const EMPTY_FIRST = ["role", "reason", "rate", "status"];
const emptyRank = (f: string) => (EMPTY_FIRST.includes(f) ? EMPTY_FIRST.indexOf(f) : EMPTY_FIRST.length);

/**
 * Known and locked fields as rows; the empty ones as a compact row of add pills (three, then
 * "Show N more"). `noAdd`: empty fields that take nothing here (an open role has no start or
 * seat holder yet, a person the member can't see yet takes no contact details). `pair`: fields
 * that unlock together, drawn as one row while two or more are locked. `waits`: why a locked field
 * opens only after another purchase (AFTER_NAME, AFTER_COMPANY), or null when its lock spends.
 */
function FieldList({
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
/* ---------- unlock all ---------- */

/** How Unlock all names what it buys: "2 roles, a seat holder and 3 names". */
const NOUN: Record<string, [string, string]> = {
  "company.identity": ["company name", "company names"],
  "company.website": ["website", "websites"],
  "company.linkedin": ["LinkedIn page", "LinkedIn pages"],
  "company.about": ["About", "About texts"],
  "engagement.role": ["role", "roles"],
  "engagement.operator": ["seat holder", "seat holders"],
  // Who held a seat with the role they held: one purchase (SEAT_BUNDLE).
  "engagement.seat": ["seat holder with their role", "seat holders with their roles"],
  "engagement.end": ["end month", "end months"],
  "engagement.sourced": ["source of hire", "sources of hire"],
  "engagement.rate": ["rate", "rates"],
  "engagement.posting": ["job posting", "job postings"],
  "contact.name": ["name and title", "names and titles"],
  "contact.title": ["title", "titles"],
  "contact.email": ["email", "emails"],
  "contact.phone": ["phone number", "phone numbers"],
  "contact.linkedin": ["LinkedIn profile", "LinkedIn profiles"],
};
interface Plan {
  items: FactRef[];
  /** Locked facts it opens. */
  facts: number;
  /** Credits it costs: each hidden company and each open role (its role, posting and rate) is one purchase. */
  cost: number;
  /** It buys the company (the free company of the day can pay for that part). */
  company: boolean;
  what: string;
}
function planOf(i: CoInfo): Plan {
  const items = i.locked;
  const engs = new Map(i.engs.map((e) => [e.id, e]));
  let cost = 0;
  let company = false;
  const pairs = new Set<string>();
  const counts = new Map<string, number>();
  for (const t of items) {
    const seat = t.entity === "engagement" && t.field === "operator" ? engs.get(t.id) : undefined;
    // The seat holder's lock stands for their role too while both are locked (one purchase, lockedInEngagement).
    const k = seat && seatBundled(seat) && seat.cells.role?.s === "locked" ? "engagement.seat" : `${t.entity}.${t.field}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (t.entity === "company" && ["identity", "website", "linkedin", "about"].includes(t.field) && i.c.hidden) {
      if (!company) cost += COMPANY_PRICE;
      company = true;
      continue;
    }
    const e = t.entity === "engagement" ? engs.get(t.id) : undefined;
    if (e && OPEN_ROLE_BUNDLE.includes(t.field) && openRole(e)) {
      if (i.c.hidden) {
        if (!company) cost += COMPANY_PRICE;
        company = true;
        continue;
      }
      if (pairs.has(e.id)) continue;
      pairs.add(e.id);
      // A member who already sees part of the open role gets the rest at no charge.
      if (!OPEN_ROLE_BUNDLE.some((f) => f !== t.field && e.cells[f]?.s === "value")) cost++;
      continue;
    }
    cost++;
  }
  const parts = [...counts].map(([k, n]) => {
    const [one, many] = NOUN[k] ?? [k.split(".")[1], `${k.split(".")[1]}s`];
    return n === 1 ? `${/^[aeiou]/i.test(one) ? "an" : "a"} ${one}` : `${n} ${many}`;
  });
  const what = parts.length ? `${listOf(parts)}.` : "";
  return { items, facts: items.length, cost, company, what: what.charAt(0).toUpperCase() + what.slice(1) };
}

/**
 * Unlock every locked fact in the record at once: once per record, saying what it buys. From 3
 * credits up it asks first (inline on a desktop, a sheet on touch screens). Off, with the reason,
 * when the balance or today's unlock limit can't cover it.
 */
function UnlockAll({ plan, bar }: { plan: Plan; bar?: boolean }) {
  const ui = useUi();
  const env = useEnv();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inSheet = env.touch;
  // Esc, Cancel and a tap beside the sheet all put focus back on the button that asked.
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btnRef.current?.focus({ preventScroll: true }));
  };
  useEscape(ask && !inSheet, cancel);
  useEscape(ask && inSheet, cancel, sheetRef);
  if (!plan.items.length) return null;
  const { facts } = plan;
  const left = ui.me.unlocksLeft ?? Infinity;
  // The free company of the day pays for the company: those credits aren't needed, though it still counts toward the day's unlocks.
  const cost = plan.cost - (plan.company && freeCompanyNow(ui.me) ? COMPANY_PRICE : 0);
  if (cost > ui.me.credits || plan.cost > left)
    return (
      <span className="tp-unlockall tp-unlock-short tp-small muted">
        {left === 0 && ui.me.credits > 0
          ? "Unlocks again tomorrow"
          : ui.me.credits <= 0
            ? "Earn a credit to unlock"
            : left < ui.me.credits
              ? `Unlock all takes ${plural(cost, "credit")}. You can unlock ${left} more today.`
              : `Unlock all takes ${plural(cost, "credit")}. You have ${ui.me.credits}.`}
      </span>
    );
  const go = async () => {
    setBusy(true);
    await ui.unlockMany(plan.items);
    setBusy(false);
    setAsk(false);
  };
  const price = cost ? plural(cost, "credit") : "no credit";
  const question = `Spend ${price} on ${facts === 1 ? "this fact" : `these ${facts} facts`}?`;
  const after = ui.me.credits - cost;
  const button = (
    <button
      ref={btnRef}
      type="button"
      className={`btn${bar ? " tp-ua-bar" : ""}`}
      disabled={busy}
      aria-busy={busy}
      aria-expanded={cost >= 3 ? ask : undefined}
      aria-label={busy ? "Unlocking" : `Unlock all ${facts} locked facts here for ${price}`}
      onClick={() => (cost >= 3 ? setAsk(true) : go())}
    >
      {busy ? (
        "Unlocking"
      ) : bar ? (
        <span className="tp-ua-two">
          <span>Unlock all {facts}</span>
          <span className="tp-ua-cost num">{price}</span>
        </span>
      ) : (
        <span>
          Unlock all {facts} · <span className="num">{price}</span>
        </span>
      )}
    </button>
  );
  if (ask && inSheet)
    return (
      <span className="tp-unlockall">
        {button}
        <Sheet
          title={`Unlock all ${facts} here?`}
          onClose={cancel}
          footer={
            <div className="tp-sheet-actions">
              <button type="button" className="btn btn-lg" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-pine btn-lg tp-grow" autoFocus disabled={busy} aria-busy={busy} onClick={go}>
                {busy ? "Unlocking" : `Spend ${price}`}
              </button>
            </div>
          }
        >
          <div ref={sheetRef} className="tp-ua-sheet">
            <p className="tp-ua-q">
              {question} You&apos;ll have {plural(after, "credit")} left.
            </p>
            {plan.what && <p className="tp-ua-what">{plan.what}</p>}
          </div>
        </Sheet>
      </span>
    );
  if (ask)
    return (
      <div className="tp-ua-ask" role="group" aria-label="Unlock all">
        <p>
          <b>{question}</b> {plan.what} You&apos;ll have {plural(after, "credit")} left.
        </p>
        <span className="tp-ua-ask-acts">
          <button type="button" className="btn btn-pine" autoFocus disabled={busy} aria-busy={busy} onClick={go}>
            {busy ? "Unlocking" : `Spend ${price}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancel
          </button>
        </span>
      </div>
    );
  return <span className="tp-unlockall">{button}</span>;
}

/* ---------- people ---------- */

const PERSON_FIELDS = ["title", "relationship", "name", "email", "linkedin", "phone"];
/** While a person's name and title are both locked they are one row ("Name and title"), at the top where the title goes. */
const personFields = (p: PersonRec) => (personBothLocked(p.cells) ? ["name", "title", "relationship", "email", "linkedin", "phone"] : PERSON_FIELDS);
const personRender: Record<string, (v: string) => ReactNode> = {
  title: (v) => <span className="tp-person-title">{v}</span>,
  relationship: (v) => <span className="chip tp-fn">{v}</span>,
};

/**
 * A person: the same rows as a seat. A card of its own at the company, flat inside a seat card.
 * At a locked company everything about them opens after the company. Their LinkedIn, email and
 * phone open after their name and title, and until then nothing but a relationship can be added.
 */
function PersonCard({ p, inSeat }: { p: PersonRec; inSeat?: boolean }) {
  const env = useEnv();
  const unseen = personUnseen(p.cells);
  const waits = (f: string) => (p.cells[f]?.s !== "locked" ? null : env.hidden ? AFTER_COMPANY : unseen && PERSON_DETAILS.includes(f) ? AFTER_NAME : null);
  return (
    <div className={`tp-person${inSeat ? "" : " tp-person-box"}`} id={`tp-d-${p.id}`}>
      <FieldList entity="contact" id={p.id} cells={p.cells} fields={personFields(p)} render={personRender} pair={PERSON_BUNDLE} waits={waits} noAdd={unseen ? PERSON_NO_ADD : []} />
    </div>
  );
}

function AddPersonForm({ companyId, engagementId, onDone }: { companyId: string; engagementId: string | null; onDone: () => void }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setDiscard(false));
  const filled = Object.values(v).filter((x) => x.trim()).length;
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  // The question takes focus when it shows (autoFocus does not fire on a re-render inside the form). Keep editing is the default.
  useEffect(() => {
    if (discard) keepRef.current?.focus({ preventScroll: true });
  }, [discard]);
  const keep = () => {
    setDiscard(false);
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  };
  // Esc closes this form before the record. With something typed it asks first, and a second Esc keeps editing.
  useEscape(true, () => {
    if (discard) keep();
    else if (filled > 0) setDiscard(true);
    else onDone();
  });
  const submit = async () => {
    if (!v.name?.trim()) return setErr("Add their name first.");
    for (const [k, x] of Object.entries(v)) {
      if (!x.trim()) continue;
      const { error } = cleanValue(fieldDef("contact", k)!, x);
      if (error) return setErr(error);
    }
    setBusy(true);
    const r = await ui.act({ type: "addPerson", companyId, engagementId, person: v });
    setBusy(false);
    if (r.ok) onDone();
  };
  const fld = (k: string) => fieldDef("contact", k)!;
  return (
    <form
      ref={formRef}
      className="tp-pform"
      aria-label="Add a person"
      // cleanValue checks each field and says what is wrong in the form's own words, not the browser's.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tp-pform-grid">
        <label>
          <span className="tp-lbl">Name</span>
          <input className="input" autoFocus maxLength={200} autoComplete="off" placeholder={fld("name").placeholder} value={v.name ?? ""} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Title</span>
          <input className="input" maxLength={200} autoComplete="off" placeholder={fld("title").placeholder} value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Email</span>
          <input className="input mono" type="email" maxLength={200} autoComplete="off" autoCapitalize="none" placeholder={fld("email").placeholder} value={v.email ?? ""} onChange={(e) => set("email")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">LinkedIn</span>
          <input className="input mono" inputMode="url" maxLength={200} autoComplete="off" autoCapitalize="none" placeholder={fld("linkedin").placeholder} value={v.linkedin ?? ""} onChange={(e) => set("linkedin")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Phone</span>
          <input className="input num" type="tel" inputMode="tel" maxLength={40} autoComplete="off" placeholder={fld("phone").placeholder} value={v.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} />
        </label>
      </div>
      <span className="tp-lbl">Relationship</span>
      <div className="tp-chips">
        {RELATIONSHIPS.map((o) => (
          <button key={o} type="button" aria-pressed={v.relationship === o} className={`chip tp-chipbtn${v.relationship === o ? " chip-on" : ""}`} onClick={() => set("relationship")(v.relationship === o ? "" : o)}>
            {o}
          </button>
        ))}
      </div>
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      {discard ? (
        <div className="tp-pform-foot tp-pform-discard" role="group" aria-label="Discard what you typed?">
          <span className="tp-small">Discard what you typed?</span>
          <button type="button" className="btn btn-sm tp-btn-red" onClick={onDone}>
            Discard
          </button>
          <button ref={keepRef} type="button" className="btn btn-ghost btn-sm" onClick={keep}>
            Keep editing
          </button>
        </div>
      ) : (
        <div className="tp-pform-foot">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy}>
            {busy ? "Adding" : "Add this person"} {!busy && filled > 0 && room > 0 && <span className="num">+{Math.min(filled, room)}</span>}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (filled > 0 ? setDiscard(true) : onDone())}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/* ---------- engagements ---------- */

/** A link that can't be built (a value stored with half a character) is left out, not thrown. */
function safeHref(build: () => string): string | null {
  try {
    return build();
  } catch {
    return null;
  }
}

/**
 * After the seat holder is unlocked: the next step with them. This is the promise of the unlock,
 * and no step of it goes through Revenue Nomad's staff.
 *  - A member who has signed in: "Message Ana", with a first message the member can change.
 *  - Named but not on Merlin yet (a name from public profiles, or a member who never signed in):
 *    "Invite to connect", a note with their seat's claim link (EngagementRec.invite). When they
 *    claim the seat through it, a conversation opens between them, and a new member's invite bonus
 *    goes to both.
 *  - A name the claim link can't bring in: find them on LinkedIn.
 * Then a link to Referral partners, for more fractionals at companies like this one.
 */
function Reach({ e, name, member, emailTo, more = true }: { e: EngagementRec; name: string; member: boolean; emailTo: string | null; more?: boolean }) {
  const ui = useUi();
  const env = useEnv();
  const first = name.trim().split(/\s+/)[0] || name;
  const li = safeHref(() => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`);
  return (
    <div className="tp-reach">
      {member ? (
        <MessageButton engagementId={e.id} name={name} company={env.company} role={shown(e.cells.role)} fn={shown(e.cells.function)} />
      ) : e.invite ? (
        <>
          {/* [ux ws3] One meaning: named, and not a member yet. */}
          <span className="tp-notyet">Not on Merlin yet</span>
          <InviteConnect e={e} name={name} company={env.company} emailTo={emailTo} />
        </>
      ) : (
        li && (
          <a className="btn btn-sm btn-primary" href={li} target="_blank" rel="noreferrer">
            Find them on LinkedIn <IconExternal size={11} />
          </a>
        )
      )}
      {!member && (
        <span className="tp-reach-note">
          {e.invite
            ? e.invite.at
              ? `Once ${first} claims their seat through your link, you're connected on Merlin.`
              : `Invite ${first}, and once they claim their seat you're connected on Merlin.`
            : `${first} isn't on Merlin yet, so you can't message them here.`}
        </span>
      )}
      {more && (
        <button type="button" className="tp-intro tp-reach-more" onClick={() => ui.openPage("partners")}>
          More referral partners at companies like yours
        </button>
      )}
    </div>
  );
}

/** Their email, when a person on file here has the seat holder's name and the member can see that email (Email it on Invite to connect). */
const nameKey = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
function emailOnFile(people: PersonRec[], name: string): string | null {
  const k = nameKey(name);
  for (const p of people) {
    const n = p.cells.name;
    const m = p.cells.email;
    if (n?.s === "value" && nameKey(n.v) === k && m?.s === "value") return m.v;
  }
  return null;
}

/** An open role nobody holds yet: the member who took it says so (the seat then links to them). */
function ClaimRole({ id }: { id: string }) {
  const ui = useUi();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btn.current?.focus({ preventScroll: true }));
  };
  useEscape(ask, cancel);
  const claim = async () => {
    setBusy(true);
    await ui.act({ type: "fill", entity: "engagement", id, field: "operator", value: ui.me.name, memberId: "me" });
    setBusy(false);
    setAsk(false);
  };
  if (ask)
    return (
      <div className="tp-frow-ask tp-claim-ask" role="group" aria-label="I took this role">
        <p>Mark this role as yours? Your name goes on the seat, and it moves to Your seats. You can mark one open role a day.</p>
        <span className="tp-frow-ask-acts">
          <button type="button" className="btn btn-sm btn-primary" autoFocus disabled={busy} aria-busy={busy} onClick={claim}>
            {busy ? "Saving" : "Yes, I took it"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={cancel}>
            Cancel
          </button>
        </span>
      </div>
    );
  return (
    <div className="tp-claim">
      <button ref={btn} type="button" className="btn btn-sm" onClick={() => setAsk(true)}>
        I took this role
      </button>
      <span className="tp-small muted">Nobody holds this seat yet.</span>
    </div>
  );
}

/**
 * A seat Revenue Nomad found that nobody holds on Merlin yet. Its fractional claims it:
 * their name goes on it (behind the usual lock) and it moves to Your seats.
 */
/** "Fractional CMO at Acme, Mar 2025 to now": what an unclaimed seat says, for the member to check before claiming it. */
export function claimLine(c: NonNullable<ActionResult["claim"]>, company: string, fallback: string): string {
  const what = c.role ?? (c.function ? `A ${c.function} seat` : `The ${fallback} seat`);
  const ongoing = !c.end || c.end === "Ongoing";
  const when = c.start
    ? ongoing
      ? c.status === "Ended"
        ? `from ${fmtMonth(c.start)}`
        : `${fmtMonth(c.start)} to now`
      : `${fmtMonth(c.start)} to ${fmtMonth(c.end!)}`
    : !ongoing
      ? `until ${fmtMonth(c.end!)}`
      : "";
  return `${what} at ${company}${c.role && c.function && !c.role.toLowerCase().includes(c.function.toLowerCase()) ? ` (${c.function})` : ""}${when ? `, ${when}` : ""}`;
}

function ClaimSeat({ id, seat, company }: { id: string; seat: string; company: string }) {
  const ui = useUi();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<NonNullable<ActionResult["claim"]> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btn.current?.focus({ preventScroll: true }));
  };
  useEscape(ask, cancel);
  // Before claiming, the seat's title, function and dates, so the member can check it is theirs.
  const check = async () => {
    setAsk(true);
    if (info) return;
    setErr(null);
    const r = await post<ActionResult>({ action: { type: "claimSeat", engagementId: id, preview: true } });
    if (r.error || !r.claim) setErr(r.error || "We couldn't load this seat. Try again.");
    else setInfo(r.claim);
  };
  const claim = async () => {
    setBusy(true);
    await ui.act({ type: "claimSeat", engagementId: id });
    setBusy(false);
    setAsk(false);
  };
  // "Not me" is kept on the server (notMine), so adding a seat later never claims this one for them.
  const notMe = () => {
    cancel();
    void ui.act({ type: "notMine", engagementId: id }, { quiet: true, silentError: true });
  };
  if (ask)
    return (
      <div className="tp-frow-ask tp-claim-ask" role="group" aria-label="Claim this seat">
        {err ? (
          <p role="alert">{err}</p>
        ) : info ? (
          <p>
            <b>Is this you?</b> {claimLine(info, company, seat)}. Claim it? Other members will see your name on it, behind a 1 credit lock.
          </p>
        ) : (
          <p aria-busy="true">Checking the seat</p>
        )}
        <span className="tp-frow-ask-acts">
          <button type="button" className="btn btn-sm btn-primary" autoFocus disabled={busy || !info} aria-busy={busy} onClick={claim}>
            {busy ? "Saving" : "Yes, it's my seat"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={info ? notMe : cancel}>
            {info ? "Not me" : "Cancel"}
          </button>
        </span>
      </div>
    );
  return (
    <div className="tp-claim">
      <button ref={btn} type="button" className="btn btn-sm" onClick={check}>
        Is this your seat? Claim it
      </button>
    </div>
  );
}

const ENG_ROWS = ["function", "type", ...ENG_FIELDS];

/** [ux ws3] Someone held this seat (named, locked, or found with nobody named yet), so the record's "Your way in" lists it. Not an open role, not the member's own. */
const wayInSeat = (e: EngagementRec) => !openRole(e) && !e.yours && (!!e.cells.operator && e.cells.operator.s !== "empty" ? true : !!e.claimable);
/** How many seats "Your way in" lists. */
const WAY_IN_MAX = 3;

/**
 * [ux ws3] Your way in: right under the record's header and its one action, the people who held
 * its seats and the next step with each. Named and on Merlin: Message. Named, not a member: Not
 * on Merlin yet · Invite to connect. Locked: who held it, 1 credit (after the company at a locked
 * one). Nobody named: Know who held it? Add them, +1. Then the seats, people and details.
 */
function YourWayIn({ i, seats, children }: { i: CoInfo; seats: EngagementRec[]; children?: ReactNode }) {
  const ui = useUi();
  const env = useEnv();
  const [adding, setAdding] = useState<string | null>(null);
  const hidden = !!i.c.hidden;
  const mine = ui.me.function;
  if (!seats.length) return <>{children}</>;
  return (
    <section className="tp-dsec tp-wayin" aria-labelledby="tp-wayin-h">
      <h3 className="tp-dsec-h" id="tp-wayin-h">
        Your way in
      </h3>
      {children}
      {seats.map((e, k) => {
        const op = e.cells.operator;
        const name = op?.s === "value" ? op.v : null;
        const role = shown(e.cells.role);
        const fn = shown(e.cells.function);
        const start = shown(e.cells.start);
        const what = [role ?? (fn ? `${fn} seat` : "A fractional seat"), start && fmtMonth(start)].filter(Boolean).join(" · ");
        const member = op?.s === "value" && !!op.member;
        return (
          <div key={e.id} className="tp-wayin-row">
            <span className={`tp-wayin-what${fn && fn === mine ? " mine" : ""}`}>{what}</span>
            {name ? (
              <>
                <span className="tp-wayin-who">{name}</span>
                {!(op?.s === "value" && op.member?.you) && (
                  <Reach e={e} name={name} member={member} emailTo={e.invite ? emailOnFile([...e.people, ...i.c.people], name) : null} more={k === seats.length - 1} />
                )}
              </>
            ) : op?.s === "locked" ? (
              hidden ? (
                <QuietLock words={waitWords(AFTER_COMPANY) ?? "Opens after the company"} tip={AFTER_COMPANY} />
              ) : (
                // The unlock in words ("Unlock who held it · 1 credit"), with the role when that is locked too: one purchase.
                <PairLock id={e.id} hidden={false} fields={SEAT_BUNDLE.filter((f) => e.cells[f]?.s === "locked")} />
              )
            ) : adding === e.id ? (
              <AddPersonForm companyId={i.c.id} engagementId={e.id} onDone={() => setAdding(null)} />
            ) : (
              <span className="tp-wayin-none">
                <span className="tp-notyet">Nobody named yet</span>
                {!hidden && (
                  <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(e.id)}>
                    Know who held it? Add them <span className="plus1">+1</span>
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {env.hidden && seats.length > 0 && <p className="tp-dsec-note">Who held each seat opens after the company, 1 credit each.</p>}
    </section>
  );
}

function EngagementCard({ e, companyId, company, focus, coPeople = [], wayIn = false }: { e: EngagementRec; companyId: string; company: string; focus: boolean; coPeople?: PersonRec[]; wayIn?: boolean }) {
  const ui = useUi();
  const [adding, setAdding] = useState(false);
  const op = shown(e.cells.operator);
  const opCell = e.cells.operator;
  const role = shown(e.cells.role);
  const start = shown(e.cells.start);
  const toFill = e.yours ? seatMissingCount(e, ui.me) : 0;
  const hidden = ui.isHidden(e.id);
  const open = openRole(e);
  // An open role nobody holds has no seat holder, start, end, reason or source yet: nothing to add there.
  const vacant = open && (!opCell || opCell.s === "empty");
  const posting = e.cells.posting;
  const closed = !!e.closed && posting?.s === "value";
  const fnRender = (v: string) => <span className={`chip tp-fn${v === ui.me.function ? " tp-fn-me" : ""}`}>{v}</span>;
  // Nobody reaches out to themselves, and a hidden company's seat holders open after the company. Nobody named: no next step here (the claim below stays).
  // [ux ws3] A seat listed under Your way in has its next step there.
  const reach = !wayIn && op && !e.yours && !(opCell?.s === "value" && opCell.member?.you) && !hidden && (
    <Reach e={e} name={op} member={!!(opCell?.s === "value" && opCell.member)} emailTo={e.invite ? emailOnFile([...e.people, ...coPeople], op) : null} />
  );
  // Anything paid on a seat at a locked company opens after the company (an open role's posting and rate come with it).
  const waits = (f: string) => (hidden && e.cells[f]?.s === "locked" && !(open && OPEN_ROLE_BUNDLE.includes(f)) ? AFTER_COMPANY : null);
  return (
    <article className={`tp-eng${focus ? " focus" : ""}`} id={`tp-d-${e.id}`}>
      <div className="tp-eng-top">
        {e.opened ? <RoleDate e={e} /> : <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>}
        {e.yours && <YourSeat id={e.id} />}
        {e.verified && (
          <span className="tp-verified">
            <IconCheck size={11} /> Confirmed by the client
          </span>
        )}
        {start && <span className="tp-eng-when num">{fmtMonth(start)}</span>}
      </div>
      <FieldList
        entity="engagement"
        id={e.id}
        cells={e.cells}
        fields={ENG_ROWS}
        noAdd={vacant ? ["operator", "start", "end", "endReason", "reason", "whyNow", "sourced"] : shown(e.cells.status) !== "Ended" ? ["endReason"] : []}
        labels={open ? { rate: "Posted rate", hours: "Posted hours" } : {}}
        render={{ function: fnRender, type: (v) => <span className="chip tp-fn">{v}</span>, status: statusText }}
        notes={{
          ...(closed ? { posting: <span className="tp-frow-note">Closed {closedOn(e)}</span> } : {}),
          // A name from public profiles nobody has verified: Verify beside it, and no label. While the member's own claim on it waits, the line under the seat says so instead.
          ...(opCell?.s === "value" && opCell.unverified && !e.claimWaiting ? { operator: <VerifyName engagementId={e.id} confirmed={!!opCell.iv} count={opCell.ver} /> } : {}),
        }}
        after={reach ? { operator: reach } : {}}
        pair={open ? OPEN_ROLE_BUNDLE : seatBundled(e) ? SEAT_BUNDLE : undefined}
        own={e.yours}
        listed={open}
        fixed={open ? ["operator"] : []}
        waits={waits}
        nouns={{ operator: "who held it" }}
      />
      {/* [ux ws3] Nobody named on a past seat: the row says so, a locked company's record too (it used to leave Held by out). */}
      {!open && !e.yours && (!opCell || opCell.s === "empty") && (
        <div className="tp-flist-d">
          <div className="tp-frow">
            <span className="tp-frow-l">Held by</span>
            <span className="tp-frow-v">
              <span className="tp-notyet">Nobody named yet</span>
              {!hidden && !adding && (
                <button type="button" className="tp-tbtn tp-heldby-add" onClick={() => setAdding(true)}>
                  Know who held it? Add them <span className="plus1">+1</span>
                </button>
              )}
            </span>
          </div>
        </div>
      )}
      {/* The member named themselves on this seat and nobody has confirmed it yet (see Your seats). */}
      {!e.yours && opCell?.s === "value" && opCell.member?.you && (
        <p className="tp-claim-wait">{open ? "Claimed by you. Others still see the role as open until your claim is confirmed." : "You're named on this seat. It opens for you once another member confirms it."}</p>
      )}
      {vacant && !hidden && !e.yours && <ClaimRole id={e.id} />}
      {/* "Is this your seat?" while no name shows here. A name the member can see has Verify, whose first choice is the same claim. */}
      {e.claimable && !hidden && !e.yours && !e.claimWaiting && opCell?.s !== "value" && (
        <ClaimSeat id={e.id} seat={role ?? (shown(e.cells.function) ? `${shown(e.cells.function)}` : "fractional")} company={company} />
      )}
      {e.claimWaiting && !e.yours && <p className="tp-claim-wait">You said this seat is yours. An admin is checking it, and your name goes on it once they agree.</p>}
      {toFill > 0 && (
        <button type="button" className="ys-fill-link" onClick={() => ui.openSeats(e.id)}>
          Fill in the {toFill === 1 ? "one thing" : `${toFill} things`} missing on your seat
        </button>
      )}
      {e.people.length > 0 && (
        <div className="tp-eng-people">
          <div className="tp-sublabel">People on this seat</div>
          {e.people.map((p) => (
            <PersonCard key={p.id} p={p} inSeat />
          ))}
        </div>
      )}
      {adding ? (
        <AddPersonForm companyId={companyId} engagementId={e.id} onDone={() => setAdding(false)} />
      ) : (
        !hidden && (
          <div className="tp-eng-foot">
            <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(true)}>
              <IconPlus size={13} /> {op ? "Add a contact on this seat" : "Add someone on this seat"}
            </button>
          </div>
        )
      )}
    </article>
  );
}

/* ---------- missing company facts ---------- */

/** What adding these earns today, in one sentence. */
function earnLine(ui: Ui, env: { exempt: boolean }, t: FactRef[]): string {
  if (earnNote(ui.me).capped) return `You've earned today's ${ui.me.earnCap} credits, so adding these earns nothing. You can earn again ${atTime(ui.me.earnResetsAt)}.`;
  const n = earnable(ui, env, t);
  if (n === 0) return SELL_NOTE;
  if (n === t.length) return n === 1 ? "Add it and you earn a credit." : "Each one you add earns a credit.";
  return `Add these and earn up to ${plural(n, "credit")}.`;
}

/** The company facts still missing, as add pills (the record header, and the Add flow's "facts" step). */
export function MissingFacts({ i, title = true, skip = [] }: { i: CoInfo; title?: boolean; skip?: string[] }) {
  const ui = useUi();
  const env = { exempt: pickExempt(i) };
  const fields = i.c.hidden ? [] : COMPANY_FILL.filter((f) => i.c.cells[f]?.s === "empty" && !skip.includes(f));
  if (!fields.length) return null;
  const refs = fields.map((f) => ({ entity: "company" as const, id: i.c.id, field: f }));
  const pills = (
    <EnvCtx.Provider value={{ touch: false, phone: false, contact: null, company: i.c.hidden ? "this company" : i.c.name, hidden: !!i.c.hidden, exempt: env.exempt }}>
      <div className="tp-missing-row">
        {refs.map((t) => (
          <AddFact key={t.field} t={t} label={fieldDef(t.entity, t.field)!.label} />
        ))}
      </div>
    </EnvCtx.Provider>
  );
  // Without a title it sits in the drawer header, where the summary line would be.
  if (!title) return <div className="tp-dmissing">{pills}</div>;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">Still missing</h3>
      <p className="tp-dsec-note">{earnLine(ui, env, refs)}</p>
      {pills}
    </section>
  );
}

/* ---------- the drawer ---------- */

/**
 * Unlock a locked company for COMPANY_PRICE credits: its name, website and logo, with the job
 * posting (and posted rate) of each open role there. The record's one action until it is unlocked.
 * Pine, because it spends. Short of the price it shows how to earn instead (and counts the wall).
 * The day's companies from the radar (Radar.tsx) put it on each locked row and card too.
 */
export function UnlockCompany({ id, rate, roles, bar }: { id: string; rate: boolean; roles: boolean; bar?: boolean }) {
  const ui = useUi();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  const busy = ui.busy.has(cellKey(id, "identity"));
  // The free company of the day (any plan): no credits needed while it is left and the day's limit has room.
  const free = freeCompanyNow(ui.me);
  const broke = !free && ui.me.credits < COMPANY_PRICE;
  // Today's unlocks are used up (a company counts as COMPANY_PRICE of them, the free one too): the button says when, and spends nothing.
  const later = (ui.me.unlocksLeft ?? Infinity) < COMPANY_PRICE && (ui.me.credits >= COMPANY_PRICE || !!ui.me.freeCompany);
  const label = free ? UNLOCK_FREE : UNLOCK_COMPANY;
  const included = !roles ? "Name, website and logo" : rate ? "Job posting and rate included" : "Job posting included";
  const text = busy ? "Unlocking" : later ? "Unlocks again tomorrow" : broke ? "Earn credits to unlock" : label;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btn btn-pine${bar ? " tp-uc-bar" : ""}`}
        disabled={busy || later}
        aria-busy={busy}
        aria-label={busy || later || broke ? text : `${free ? "Unlock company free, your 1 free company today" : UNLOCK_ROLE_SAY}. ${included}.`}
        onClick={() => {
          if (free || ui.me.credits >= COMPANY_PRICE) return ui.unlock({ entity: "company", id, field: "identity" }, { onWall: () => setZero(true) });
          sendSignal("wall", "identity");
          setZero(true);
        }}
      >
        {bar && !busy && !later && !broke ? (
          // A phone's sticky bar: the price on one line, what comes with it on a small second line.
          <span className="tp-ua-two">
            <span>{free ? UNLOCK_FREE : UNLOCK_ROLE_SHORT}</span>
            <span className="tp-ua-cost">{included}</span>
          </span>
        ) : (
          text
        )}
      </button>
      {zero && ui.me.credits < COMPANY_PRICE && ref.current && <ZeroCredits anchor={ref.current} id={id} need={COMPANY_PRICE} onClose={() => setZero(false)} />}
    </>
  );
}

const COMPANY_ROWS = ["website", "linkedin", "industry", "employees", "revenue", "ownership", "hq"];
const UNLOCK_COMPANY = `Unlock company · ${COMPANY_PRICE_SAY}`;
/**
 * What a seat counts as, by the same rule as the server's friendliness() (the header's "N
 * fractional seats" and the Fit tier): a fractional hire, an open role, or neither (a member
 * story about a full-time hire, or a posting that came down with nobody named).
 */
function seatKind(e: EngagementRec): "hire" | "open" | "story" {
  if (openRole(e)) return "open";
  if (e.source === "Demand scan" && e.cells.operator?.s === "empty") return "story";
  const type = shown(e.cells.type);
  if (!type || FRACTIONAL_TYPES.includes(type)) return "hire";
  return "story";
}
/** "2 fractional seats and 2 from member stories, which aren't counted as fractional hires." */
function seatSplit(engs: EngagementRec[]): string {
  const n = (k: string) => engs.filter((e) => seatKind(e) === k).length;
  const hires = n("hire");
  const open = n("open");
  const story = n("story");
  if (story === engs.length)
    return story === 1
      ? "This seat was a full-time hire or a posting that came down with nobody named. It isn't counted as a fractional hire."
      : "These seats were full-time hires or postings that came down with nobody named. They aren't counted as fractional hires.";
  const parts = [...(hires ? [plural(hires, "fractional seat")] : []), ...(open ? [plural(open, "open role")] : []), `${story} full-time or closed ${story === 1 ? "posting" : "postings"}`];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}. Those aren't counted as fractional hires.`;
}
/** An open role here has a posted rate behind the lock (a locked cell always has a value). The unlock names the rate only then. */
const hasPostedRate = (i: CoInfo) => i.engs.some((e) => openRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value"));
const UNLOCK_ROLE_SHORT = UNLOCK_COMPANY;
const UNLOCK_ROLE_SAY = `Unlock company for ${COMPANY_PRICE_SAY}`;

export function Drawer({
  i,
  focus,
  onClose,
  onStep,
  pos,
  phone,
  contact,
}: {
  i: CoInfo;
  focus: string | null;
  onClose: () => void;
  onStep: (d: 1 | -1) => void;
  pos: { n: number; of: number } | null;
  phone: boolean;
  /** View.contact. Read from the Ui context too, so either way of passing it works. */
  contact?: Contact | null;
}) {
  const ui = useUi();
  const c = i.c;
  const coarse = useMedia("(hover: none) and (pointer: coarse)");
  const touch = phone || coarse;
  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  // On a phone the company name joins the bar once the header has scrolled away.
  const [headGone, setHeadGone] = useState(false);
  const env: DrawerEnv = {
    touch,
    phone,
    contact: contact ?? ui.contact ?? null,
    company: c.hidden ? "this company" : c.name,
    hidden: !!c.hidden,
    exempt: pickExempt(i),
  };

  // A locked company's record opened: counted for Pilot metrics' demand (once a member, company and day; counts only).
  useEffect(() => {
    if (c.hidden && !c.found) void post({ action: { type: "lockedView", companyId: c.id } });
  }, [c.id, c.hidden, c.found]);

  // Where focus goes back to when the record closes: its row, else whatever opened it.
  const last = useRef({ focus, id: c.id, phone });
  last.current = { focus, id: c.id, phone };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const { focus: f, id, phone: p } = last.current;
      setTimeout(() => {
        const a = document.activeElement;
        if (a && a !== document.body && a.isConnected) return;
        const row = (f && document.querySelector<HTMLElement>(`[data-row="${f}"]`)) || document.querySelector<HTMLElement>(`[data-row="${id}"]`);
        const el = row && row.tabIndex >= 0 ? row : opener?.isConnected ? opener : null;
        el?.focus({ preventScroll: p });
      });
    };
  }, []);

  // Opening a record (or stepping to the next): start where it matters, and take focus.
  useEffect(() => {
    setAddingPerson(false);
    const s = scroller.current;
    if (s) {
      // A hidden company opens at its top: the reason it is hidden and its one action come first.
      // A seat or a person opens at its card only when the card starts low on the screen.
      let top = 0;
      const el = focus && !c.hidden ? document.getElementById(`tp-d-${focus}`) : null;
      if (el) {
        const y = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
        if (y > s.clientHeight * 0.6) top = Math.max(0, y - 12);
      }
      s.scrollTo({ top });
    }
    const root = rootRef.current;
    const a = document.activeElement;
    if (root && (!a || a === document.body || !root.contains(a))) {
      const h = root.querySelector<HTMLElement>(".tp-dname") ?? root;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }, [c.id, focus, c.hidden]);

  // A phone record covers the page: what is behind it is out of reach until it closes.
  useEffect(() => {
    if (!phone) return;
    const behind = [...document.querySelectorAll<HTMLElement>(".tp-app > .tp-top, .tp-app > main, .tp-app > .tp-body")];
    behind.forEach((el) => el.setAttribute("inert", ""));
    return () => behind.forEach((el) => el.removeAttribute("inert"));
  }, [phone]);

  useEffect(() => {
    const head = headRef.current;
    const s = scroller.current;
    if (!phone || !head || !s || typeof IntersectionObserver === "undefined") return setHeadGone(false);
    const io = new IntersectionObserver(([en]) => setHeadGone(!en.isIntersecting), { root: s, threshold: 0 });
    io.observe(head);
    return () => io.disconnect();
  }, [phone, c.id, c.hidden]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    // Arrow keys scroll the record (they never step to another company from inside it).
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !t.closest("input, textarea, select, [role='listbox']")) {
      e.stopPropagation();
      return;
    }
    // A phone record is modal: Tab stays inside it.
    if (e.key === "Tab" && phone && rootRef.current) {
      const els = [...rootRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !rootRef.current.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const website = val(c.cells.website);
  const linkedin = val(c.cells.linkedin);
  const emp = val(c.cells.employees);
  const rev = val(c.cells.revenue);
  const line = [val(c.cells.industry), emp && `${emp} employees`, rev && `${rev} revenue`, val(c.cells.hq)].filter(Boolean) as string[];
  // Functions hired fractionally, the member's own first; then the ones with an open role and no hire
  // yet ("Hiring now"); then the ones only member stories (or a posting that came down) mention, muted.
  // Counted the way the header's "N fractional seats" is (the server's friendliness): only fractional hires.
  const fnCounts = new Map<string, number>();
  for (const e of i.engs) {
    const fn = shown(e.cells.function);
    if (fn && seatKind(e) === "hire") fnCounts.set(fn, (fnCounts.get(fn) ?? 0) + 1);
  }
  const notHires = i.engs.filter((e) => seatKind(e) === "story").length;
  const postedRate = hasPostedRate(i);
  /** An open role here: Unlock company comes with its job posting. */
  const hiringHere = i.engs.some(openRole);
  const mine = ui.me.function;
  const hired = [...i.fnState.hired].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : (fnCounts.get(b) ?? 0) - (fnCounts.get(a) ?? 0)));
  const hiringFns = i.fnState.hiring;
  const storyFns = i.fnState.story;
  // Never "Sales" beside "No Sales seat yet": an open role or a member story in it is not a gap to point at.
  // "No fractional Sales yet", or what the company's website says in its place (lib/leaders): a full-time leader, or a fractional one on the team.
  const fg = fnGap(i, mine);
  const gap = fg.gap;
  const teamLeads = i.leads.filter((l) => isFractionalLead(l) && !hired.includes(l.fn));
  const mineNamed = namedFn(mine);
  // Where the seats came from. A role the scan found reads as a job posting, open or closed.
  const sources = [...new Set(i.engs.map((e) => SOURCE_SAY[e.source] ?? (SOURCE_LABEL[e.source] ?? e.source).toLowerCase()))];
  const follow = () => ui.act({ type: "follow", companyId: c.id, on: !c.following });
  const plan = planOf(i);
  // [ux ws3] Your way in: the seats someone held, the member's function first, then a name they can see, then a lock.
  const rankWay = (e: EngagementRec) => (shown(e.cells.function) === ui.me.function ? 0 : 4) + (e.cells.operator?.s === "value" ? 0 : e.cells.operator?.s === "locked" ? 1 : 2);
  const wayInSeats = i.engs.filter(wayInSeat).sort((a, b) => rankWay(a) - rankWay(b)).slice(0, WAY_IN_MAX);
  // The website is stored as its host (a LinkedIn, Google Sites or Notion page keeps its path).
  const site = website?.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  // The company's own facts as rows. Missing ones are added in the header while it has no summary line,
  // and the website and LinkedIn always are, so this section offers only the rest.
  const coNoAdd = line.length ? ["website", "linkedin"] : COMPANY_ROWS;
  const coEmpty = COMPANY_ROWS.filter((f) => c.cells[f]?.s === "empty" && !coNoAdd.includes(f)).map((f) => ({ entity: "company" as const, id: c.id, field: f }));
  const coKnown = COMPANY_ROWS.some((f) => c.cells[f] && c.cells[f].s !== "empty");
  const gtmEmpty = COMPANY_GTM.filter((f) => c.cells[f]?.s === "empty");
  const sellOut = !env.exempt && (ui.me.sellEarnLeft ?? 1) <= 0 && !earnNote(ui.me).capped;

  /*
   * A hiring company the member unlocked: its job posting is what they paid for, so "Open the job
   * posting" is the record's primary button (pine, the same place Unlock company was), and Add steps
   * back to an outline button beside it.
   */
  const posting = postingToOpen(i, focus);
  const postingRole = posting ? shown(posting.e.cells.role) : null;
  const openPosting = (bar?: boolean) =>
    posting && (
      <a
        className={`btn btn-pine${bar ? " tp-rsheet-post" : ""}`}
        href={posting.href}
        target="_blank"
        rel="noreferrer"
        title={postingRole ? `The job posting for ${postingRole}, in a new tab` : "The job posting, in a new tab"}
      >
        Open the job posting <IconExternal size={12} />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  /*
   * The day's unlock limit, on the record's unlock line, while it binds before the balance (an
   * account's first day): "25 unlocks left today", so the wall is never a surprise. Not at 0 (the
   * buttons say "Unlocks again tomorrow"), and not when Unlock all already says how many are left.
   */
  const left = unlocksLeft(ui.me);
  const leftWords = unlocksLeftWords(ui.me);
  const capShown = !!leftWords && !!left && (c.hidden || (plan.items.length > 0 && plan.cost <= left));
  const actions = (
    <div className="tp-dactions">
      {c.hidden ? (
        <UnlockCompany id={c.id} rate={postedRate} roles={hiringHere} />
      ) : (
        <>
          {openPosting()}
          {/* The top bar's "Add what you know" starts from a search. This one adds to the company on screen. */}
          <button type="button" className={`btn${posting ? "" : " btn-primary"}`} onClick={() => ui.openAdd({ companyId: c.id })}>
            <IconPlus size={14} /> Add to this company
          </button>
          <UnlockAll plan={plan} />
        </>
      )}
    </div>
  );
  const capLine = capShown && (
    <p className={phone ? "tp-rsheet-cap" : "tp-capline"} title={UNLOCKS_LEFT_TIP}>
      {leftWords}
    </p>
  );
  const followBtn = (
    <button
      type="button"
      className={`btn btn-sm tp-followbtn${c.following ? " tp-following" : ""}`}
      onClick={follow}
      aria-pressed={c.following}
      aria-label={c.following ? "Following" : "Follow"}
      title={c.following ? "Stop following this company" : "Following is free. New facts here show up in your Following view."}
    >
      <IconStar size={13} filled={c.following} /> <span className="tp-follow-t">{c.following ? "Following" : "Follow"}</span>
    </button>
  );
  const coName = c.hidden ? "Locked company" : c.name;
  const showCo = !phone || headGone;

  return (
    <EnvCtx.Provider value={env}>
      <div
        ref={rootRef}
        className={`${phone ? "tp-rsheet" : "tp-drawer"}${touch ? " tp-touchrows" : ""}`}
        role="dialog"
        aria-modal={phone}
        aria-label={coName}
        onKeyDown={onKeyDown}
      >
        <div className="tp-dbar">
          {phone ? (
            <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Back" onClick={onClose}>
              <IconChevron dir="left" size={18} />
            </button>
          ) : (
            <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Close (Esc)" onClick={onClose}>
              <IconX />
            </button>
          )}
          {pos && (
            <span className="tp-dpos num">
              {pos.n} of {pos.of}
            </span>
          )}
          {/* Which company this is, wherever the record is scrolled (it opens at a seat from the Seats list). */}
          <span className={`tp-dbar-co${showCo ? "" : " off"}`} aria-hidden={!showCo || undefined} title={showCo ? coName : undefined}>
            {showCo && (
              <>
                <span className="tp-dbar-logo">
                  <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain ?? i.domain} hidden={c.hidden} seed={c.id} />
                </span>
                <span className="tp-dbar-name">{c.hidden ? <LockedName seed={c.id} /> : coName}</span>
              </>
            )}
          </span>
          {phone && followBtn}
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Previous in the list" title="Previous in the list (K)" disabled={!!pos && pos.n <= 1} onClick={() => onStep(-1)}>
            <IconChevron dir="up" />
          </button>
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Next in the list" title="Next in the list (J)" disabled={!!pos && pos.n >= pos.of} onClick={() => onStep(1)}>
            <IconChevron dir="down" />
          </button>
        </div>
        <div className="tp-dscroll" ref={scroller}>
          {c.hidden ? (
            <div className="tp-dhead" ref={headRef}>
              <HiddenCompany i={i} big bare />
              {!phone && followBtn}
            </div>
          ) : (
            <div className="tp-dhead" ref={headRef}>
              <CompanyLogo name={c.name} domain={c.iconDomain ?? i.domain} size="lg" />
              <div className="tp-dhead-t">
                <h2 className="tp-dname" title={c.name} tabIndex={-1}>
                  {c.name}
                </h2>
                <div className="tp-dlinks">
                  {website ? (
                    <a className="tp-link mono" href={hrefFor("company", "website", website)!} target="_blank" rel="noreferrer">
                      {site}
                    </a>
                  ) : (
                    <FactCell t={{ entity: "company", id: c.id, field: "website" }} cell={c.cells.website} addLabel="Website" />
                  )}
                  {linkedin ? (
                    <a className="tp-link" href={hrefFor("company", "linkedin", linkedin)!} target="_blank" rel="noreferrer">
                      LinkedIn
                    </a>
                  ) : (
                    <FactCell t={{ entity: "company", id: c.id, field: "linkedin" }} cell={c.cells.linkedin} addLabel="LinkedIn" />
                  )}
                </div>
              </div>
              {!phone && followBtn}
            </div>
          )}
          {line.length ? <div className="tp-dline num">{line.join(" · ")}</div> : <MissingFacts i={i} title={false} skip={["website", "linkedin"]} />}
          <LeadsLine c={c} />
          <div className="tp-dfit">
            <Fit i={i} big hot />
            <span className="tp-dfit-r num">{fitReason(i)}</span>
          </div>
          {c.hidden && (
            <p className="tp-hidden-note">
              {hiringHere
                ? `Unlock to see the company's name, website and job postings${postedRate ? ", with the posted rate" : ""}. Its open roles are free to read. Who held each seat opens after that, 1 credit each.`
                : "Unlock to see the company's name, website and job postings. Who held each seat opens after that, 1 credit each."}
            </p>
          )}
          {c.found && (
            <p className="tp-found-dnote">
              {FOUND_NOTE}. It stays named for you once you add what you know, claim a seat or unlock something here. Otherwise it goes back to locked when you close it.
            </p>
          )}
          {!phone && actions}
          {!phone && capLine}
          {/* A phone's bar leads with the job posting once the company is unlocked: Unlock all moves up here. */}
          {phone && posting && plan.items.length > 0 && (
            <div className="tp-dactions">
              <UnlockAll plan={plan} />
            </div>
          )}
          {c.hidden && (
            <div className="pro-under">
              <Pro where="hidden_company" variant="line" />
            </div>
          )}
          {/* [ux ws3] Your way in: who held the seats here and the next step with each, before About, seats and people. */}
          <YourWayIn i={i} seats={wayInSeats}>
            {/* [google network] who the member knows here (nothing with RN_GOOGLE off). */}
            {!c.hidden && <WayIn companyId={c.id} company={c.name} />}
          </YourWayIn>
          {/* About: a hidden company's About shows too, without its name, web address and links (the server cuts them). */}
          {(!c.hidden || c.cells.about?.s === "value") && (
            <section className="tp-dsec">
              <h3 className="tp-dsec-h">About</h3>
              <AboutText id={c.id} cell={c.cells.about} as={c.hidden ? "locked" : c.found ? "found" : "open"} />
            </section>
          )}
          {(!c.hidden || COMPANY_GTM.some((f) => c.cells[f]?.s !== "empty")) && (
            <section className="tp-dsec">
              <h3 className="tp-dsec-h">How they sell</h3>
              <FieldList entity="company" id={c.id} cells={c.cells} fields={COMPANY_GTM} emptyNote={sellOut && gtmEmpty.length > 0 ? SELL_NOTE : undefined} />
            </section>
          )}
          {(hired.length > 0 || hiringFns.length > 0 || storyFns.length > 0 || teamLeads.length > 0) && (
            <section className="tp-dsec">
              <h3 className="tp-dsec-h">{hired.length ? "Functions hired" : "Functions"}</h3>
              <div className="tp-chips">
                {hired.map((fn) => (
                  <span key={fn} className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}`} title={seatsTitle(fnCounts.get(fn))}>
                    {fn} {(fnCounts.get(fn) ?? 0) > 1 ? <span className="num tp-cnt">{fnCounts.get(fn)}</span> : null}
                    {fn === mine && <span className="sr-only">, your function</span>}
                  </span>
                ))}
                {hiringFns.map((fn) => (
                  <span key={fn} className="chip tp-fn tp-fn-hiring" title={`An open ${fn} role. Nobody is on file in a ${fn} seat yet.`}>
                    {fn}
                    <span className="tp-fn-tag"> · hiring now</span>
                  </span>
                ))}
                {storyFns.map((fn) => (
                  <span key={fn} className="chip tp-fn tp-fn-story" title={storyTitle(i, fn)}>
                    {fn}
                    <span className="tp-fn-tag"> · {storyTag(i, fn)}</span>
                  </span>
                ))}
                {teamLeads.map((l) => (
                  <OnTheTeam key={l.fn} l={l} />
                ))}
                {gap && mine && <NoSeatYet fn={mine} led={fg.led} teamAt={c.leads?.teamAt} />}
              </div>
              {gap &&
                mine &&
                (fg.led ? (
                  <p className="tp-dsec-note tp-mt8">
                    {ledFullTimeWords(mine, fg.led)}
                    {fg.led.how === "members" ? "" : ", from the company's website"}. No fractional {mine} seat is on file.
                  </p>
                ) : (
                  <p className="tp-dsec-note tp-mt8">
                    They hired fractionals in other functions. {mineNamed ? `No fractional ${mineNamed} seat` : "No fractional seat in your function"} is on file yet.{" "}
                    {/* Never "no Sales leader" unless their team page was read (lib/leaders/types.ts noLeaderWords). */}
                    {c.leads?.teamAt ? `Their team page names no ${mine} leader (checked ${monthYear(c.leads.teamAt)}).` : "We haven't checked their team page yet."}
                  </p>
                ))}
              {gap && mine && !c.hidden && !(fg.led && fg.led.how !== "members") && <LeaderReport companyId={c.id} fn={mine} leads={c.leads} from="record" />}
              {storyFns.length > 0 && <p className="tp-dsec-note tp-mt8">Functions marked full-time or posting closed are a full-time hire, or a job posting that came down with nobody named. Their seats are listed below but aren&apos;t counted as fractional hires.</p>}
            </section>
          )}
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">
              Seats <span className="num tp-cnt">{i.engs.length}</span>
            </h3>
            {notHires > 0 && <p className="tp-dsec-note">{seatSplit(i.engs)}</p>}
            {i.engs.length === 0 && <p className="tp-dsec-note">No seats on file here yet. Add one you know and earn a credit for each fact.</p>}
            {i.engs.map((e) => (
              <EngagementCard key={e.id} e={e} companyId={c.id} company={c.hidden ? "this company" : c.name} focus={focus === e.id} coPeople={c.people} wayIn={wayInSeats.includes(e)} />
            ))}
            {/* Nothing can be added to a hidden company until it is unlocked, so nothing offers to. */}
            {!c.hidden && (
              <button type="button" className="btn btn-sm btn-ghost tp-addlink tp-addeng" onClick={() => ui.openAdd({ companyId: c.id, mode: "engagement" })}>
                <IconPlus size={13} /> Add a seat you held
              </button>
            )}
          </section>
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">
              <span className="tp-dsec-ht">People at {c.hidden ? "this company" : c.name}</span> <span className="num tp-cnt">{c.people.length}</span>
            </h3>
            {c.people.length === 0 && !addingPerson && (
              <p className="tp-dsec-note">{c.hidden ? "Nobody is on file here yet." : "Nobody is on file here yet. Add someone you know and earn a credit for each fact."}</p>
            )}
            {c.people.map((p) => (
              <PersonCard key={p.id} p={p} />
            ))}
            {c.hidden ? null : addingPerson ? (
              <AddPersonForm companyId={c.id} engagementId={null} onDone={() => setAddingPerson(false)} />
            ) : (
              <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAddingPerson(true)}>
                <IconPlus size={13} /> Add a person
              </button>
            )}
          </section>
          {!c.hidden && (coKnown || coEmpty.length > 0) && (
            <section className="tp-dsec">
              <h3 className="tp-dsec-h">Company details</h3>
              <FieldList entity="company" id={c.id} cells={c.cells} fields={COMPANY_ROWS} noAdd={coNoAdd} emptyNote={coEmpty.length > 0 ? earnLine(ui, env, coEmpty) : undefined} />
            </section>
          )}
          <footer className="tp-dfoot num">
            {sources.length > 0 && <span>From {listOf(sources)}</span>}
            {c.updatedAt && <span>Updated {timeAgo(c.updatedAt)}</span>}
            <span>
              {plural(c.facts.known + c.facts.locked, "fact")} on file, {c.facts.missing} missing
            </span>
          </footer>
        </div>
        {phone && (
          <div className={`tp-rsheet-bar${capLine ? " has-cap" : ""}`}>
            {capLine}
            {/* The balance stays on screen while the sheet covers the top bar. */}
            <span className={`tp-rsheet-bal${ui.me.credits <= 3 ? " low" : ""}`} aria-label={plural(ui.me.credits, "credit")}>
              <b className="num">{ui.me.credits}</b>
              <span>{ui.me.credits === 1 ? "credit" : "credits"}</span>
            </span>
            {c.hidden ? (
              // One action while the name is hidden, as on desktop. The facts unlock after it.
              <UnlockCompany id={c.id} rate={postedRate} roles={hiringHere} bar />
            ) : posting ? (
              // Unlocked and hiring: the job posting first, Add beside it (Unlock all is in the record, under its header).
              <>
                {openPosting(true)}
                <button type="button" className="btn tp-rsheet-add" aria-label="Add to this company" onClick={() => ui.openAdd({ companyId: c.id })}>
                  <IconPlus size={14} /> Add
                </button>
              </>
            ) : (
              <>
                {plan.items.length > 0 ? <UnlockAll plan={plan} bar /> : <span className="tp-rsheet-none">Nothing locked here</span>}
                <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ companyId: c.id })}>
                  <IconPlus size={14} /> Add
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </EnvCtx.Provider>
  );
}
