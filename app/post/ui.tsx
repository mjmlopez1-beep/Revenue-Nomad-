"use client";

/**
 * App-wide context for the Merlin app and the fact cell: one component that renders
 * any fact in its three states (value, locked, empty) plus "Under review", the inline editor
 * that opens from an empty cell, and the overlays they open (popovers, menus, phone sheets).
 *
 * Type: values are set in the text face. Numbers, dates, money and phone numbers get tabular
 * figures (.num). Only links and email addresses are mono.
 *
 * Overlays (Anchored, Sheet): each one takes focus when it opens, keeps Tab inside while it is
 * up (a menu closes on Tab instead), closes on Escape when it is the top one, and gives focus
 * back to the control that opened it. The landing page's sign-in dialog is the pattern.
 */
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Action, Cell, Me } from "@/lib/tableTypes";
import { COMPANY_PRICE, COMPANY_PRICE_SAY, REFERRAL_BONUS, cleanValue, fieldDef, type FieldDef } from "@/lib/tableFields";
import { IconCheck, IconLock, IconSearch, IconX, fmtValue, hrefFor, hue, initials, type Act } from "../ui/shared";
import { cellKey, type FactRef } from "./model";
import { readRate } from "@/lib/rates";
import { BENCH_RATE_HELP, atTime, fieldText, plural, type Layout } from "./hooks";
import { owedLine } from "./ledger";
import { MonthYear } from "./MonthYear";
import { ProOffer, sendSignal, type ProWhere } from "./ProOffer";
import { CreditsWall, UpgradeNote } from "./Billing";
import { InvitePanel } from "./Invite";
import { SEAT_YIELD, tappedWhat, wallBack } from "./earnBack";
import { freeCompanyNow, marksConfirmed } from "./display";

export type AddMode = "engagement" | "person" | "facts";
export interface AddOpts {
  companyId?: string;
  mode?: AddMode;
  query?: string;
  engagementId?: string;
  /** A seat the member held: the new engagement is linked to them as seat holder. */
  mine?: boolean;
}

/** A page that replaces the table. */
export type AppPage = "rates" | "credits" | "seats" | "metrics" | "messages" | "partners";

export interface Ui {
  me: Me;
  act: Act;
  layout: Layout;
  /**
   * Per-cell flags, read at render time from the store below (cellFlags). They are not part of
   * the context's identity: a cell that shows one reads it with useCellFlags, so an unlock
   * re-renders that cell, not every cell on the screen.
   */
  readonly busy: Set<string>;
  readonly flash: Set<string>;
  readonly pulse: string | null;
  /**
   * `onWall` runs instead of an error toast when the server answers that the member is out of
   * credits. `from: "crystal"`: a company opened from Crystal Ball or the Today card (Me.crystal);
   * the server checks it is in their Crystal Ball. Resolves true when it worked.
   */
  unlock: (t: FactRef, opts?: { onWall?: () => void; from?: "crystal" }) => Promise<boolean> | void;
  unlockMany: (items: FactRef[]) => Promise<boolean>;
  /** Open the fact editor on an element. With `initial`, it edits the member's own value. */
  edit: (el: HTMLElement, t: FactRef, initial?: string) => void;
  /** `memberId` (seat holder only) links the seat to a member picked in SeatHolderInput. */
  fill: (t: FactRef, value: string, memberId?: string | null) => Promise<boolean>;
  openCompany: (id: string, focus?: string) => void;
  openAdd: (o?: AddOpts) => void;
  /** The record belongs to a company hidden until the member unlocks it (no adding there). */
  isHidden: (id: string) => boolean;
  /** The member holds this seat (EngagementRec.yours): only its holder adds facts about a seat. */
  holdsSeat: (engagementId: string) => boolean;
  /** Up to 3 empty facts at the company that owns this record (a company, engagement or person id). */
  addable: (id: string) => FactRef[];
  /** The member's own seats: how many, and the facts still missing on them. */
  seats: { n: number; missing: number };
  /** Open the Your seats page, at one seat when given. */
  openSeats: (engagementId?: string) => void;
  /** Open a page in place of the table (Rate benchmarks from a rate, say). Closes the record. */
  openPage: (p: AppPage) => void;
  /** View.contact: where members write for help (support) and for an intro to a seat holder (intro). */
  contact: { support: string | null; intro: string | null } | null;
  /** Share or copy the member's invite link (the zero-credits sheet offers it). */
  invite?: () => void;
}

/** Said on an empty seat fact to anyone but the seat holder. */
export const SEAT_HOLDER_ONLY = "Only the seat holder can add this";

export const UiCtx = createContext<Ui | null>(null);
export function useUi(): Ui {
  const u = useContext(UiCtx);
  if (!u) throw new Error("UiCtx missing");
  return u;
}
/**
 * The Ui for what renders inside every row and cell. Its `me` is the member as of the last change
 * a cell can show (any credits left, unlocks left today, earning open, the pick-list limit): the
 * balance going from 25 to 24 does not re-render the table. Read the balance itself with useUi.
 */
export const CellUiCtx = createContext<Ui | null>(null);
export function useCellUi(): Ui {
  const u = useContext(CellUiCtx);
  if (!u) throw new Error("CellUiCtx missing");
  return u;
}

/* ---------- per-cell flags: unlocking, just unlocked, pointed at ---------- */

type Flags = { busy: Set<string>; flash: Set<string>; pulse: string | null };
let flagsNow: Flags = { busy: new Set(), flash: new Set(), pulse: null };
const flagSubs = new Set<() => void>();
/**
 * Which cells are unlocking (busy), just showed their value (flash) and are pointed at by Get
 * started (pulse). Kept outside React state so the Ui context keeps its identity when they change.
 */
export const cellFlags = {
  get: (): Flags => flagsNow,
  set(change: Partial<Flags> | ((f: Flags) => Partial<Flags>)) {
    flagsNow = { ...flagsNow, ...(typeof change === "function" ? change(flagsNow) : change) };
    flagSubs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    flagSubs.add(f);
    return () => {
      flagSubs.delete(f);
    };
  },
};
/** One cell's flags. Only the cells whose flags changed render again. */
export function useCellFlags(k: string): { busy: boolean; flash: boolean; pulse: boolean } {
  const s = useSyncExternalStore(
    cellFlags.subscribe,
    () => `${flagsNow.busy.has(k) ? 1 : 0}${flagsNow.flash.has(k) ? 1 : 0}${flagsNow.pulse === k ? 1 : 0}`,
    () => "000",
  );
  return { busy: s[0] === "1", flash: s[1] === "1", pulse: s[2] === "1" };
}
/** Every flag, for the app shell: it renders again when any flag changes (so the record does too). */
export function useAllFlags(): Flags {
  return useSyncExternalStore(cellFlags.subscribe, cellFlags.get, cellFlags.get);
}

/* ---------- values ---------- */

export function FactValue({ t, v }: { t: FactRef; v: string }) {
  const href = hrefFor(t.entity, t.field, v);
  const text = fmtValue(t.entity, t.field, v);
  if (href) {
    const shown = text.replace(/^https?:\/\//, "").replace(/^www\./, "");
    // A web address stays on one line and ends in an ellipsis; the whole of it is in the tooltip.
    const url = fieldDef(t.entity, t.field)?.kind === "url";
    return (
      <a
        className={`tp-link${url ? " tp-link-1" : ""}`}
        href={href}
        title={url ? shown : undefined}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {shown}
      </a>
    );
  }
  // The column header or the row label already says "a week".
  if (t.entity === "engagement" && t.field === "hours") return <>{v}</>;
  return <>{text}</>;
}

/** Links and email addresses are data you copy: mono. Nothing else is. */
const MONO_KINDS = ["url", "email"];
export const isMonoField = (t: FactRef) => MONO_KINDS.includes(fieldDef(t.entity, t.field)?.kind ?? "");
/** Numbers, dates, money and phone numbers: the text face with tabular figures (class `num`). */
const NUM_KINDS = ["number", "month", "monthOrOngoing", "phone"];
const NUM_FIELDS = ["employees", "revenue", "rate", "hours"];
export const isNumField = (t: FactRef) => NUM_KINDS.includes(fieldDef(t.entity, t.field)?.kind ?? "") || NUM_FIELDS.includes(t.field);

/** A field inside a sentence, the way the server's messages name it: "the role", "a person's email". */
export const sayField = (f: FieldDef) => f.say ?? `the ${fieldText(f.label)}`;

/** What a fact is, for a button's name and tooltip: "the role", "this company". */
const factWhat = (t: FactRef) => {
  if (t.field === "identity") return "this company";
  const f = fieldDef(t.entity, t.field);
  return f ? sayField(f) : "this";
};

/** Where a fact nobody added by hand came from (Cell.from), when no member has confirmed it yet. */
export const FROM_SAY: Record<string, string> = { records: "From Revenue Nomad records", posting: "From the job posting", website: "From the company website" };

/**
 * Company pick lists that earn a credit for only 5 answers a day (Me.sellEarnLeft): industry,
 * size, revenue and the four under How they sell.
 */
const PICK_LIMITED = ["industry", "employees", "revenue", "businessModel", "motion", "dealSize", "salesCycle", "ownership"];
const pickLimited = (t: FactRef) => t.entity === "company" && PICK_LIMITED.includes(t.field);

/** Whether adding this fact earns a credit right now, as far as the screen can tell. */
export function earnsNow(me: Me, t: FactRef): boolean {
  if (earnNote(me).capped) return false;
  return !(pickLimited(t) && me.sellEarnLeft === 0);
}

/** The "+ Add" button on an empty fact. Its name says what it adds and that it earns. */
function AddBtn({ label, what, earn, onAdd }: { label: string; what: string; earn: boolean; onAdd: () => void }) {
  return (
    <button type="button" className="add" aria-label={`Add ${what}${earn ? ", earns 1 credit" : ""}`} onClick={(e) => (e.stopPropagation(), onAdd())}>
      + {label}
      {earn && (
        <span className="plus1" aria-hidden>
          +1
        </span>
      )}
    </button>
  );
}

/** An add pill that opens the fact editor on itself. `onPick` runs first (e.g. to close the popover it sits in). */
export function EditPill({ fact, label, onPick }: { fact: FactRef; label?: string; onPick?: () => void }) {
  const ui = useCellUi();
  const ref = useRef<HTMLSpanElement>(null);
  const f = fieldDef(fact.entity, fact.field);
  const { pulse } = useCellFlags(cellKey(fact.id, fact.field));
  return (
    <span ref={ref} data-cell={cellKey(fact.id, fact.field)} className={pulse ? "tp-pulse" : undefined}>
      <AddBtn
        label={label ?? (f ? shortLabel(f) : fact.field)}
        what={factWhat(fact)}
        earn={earnsNow(ui.me, fact)}
        onAdd={() => {
          if (!ref.current) return;
          onPick?.();
          ui.edit(ref.current, fact);
        }}
      />
    </span>
  );
}

/** "Your seat": the member is the linked seat holder. Opens that seat on the Your seats page. */
export function YourSeat({ id }: { id: string }) {
  const ui = useCellUi();
  return (
    <button type="button" className="chip ys-yours" title="This seat is yours. Open it to fill in what's missing." onClick={(e) => (e.stopPropagation(), ui.openSeats(id))}>
      Your seat
    </button>
  );
}

/** Whether the Pro waitlist offer shows anywhere in the app. Off: the owner decided not to call out Pro yet. */
const PRO_SHOWN = false;

/**
 * The Pro waitlist offer, wired to the signed-in member. While billing is live (Me.plan) the places
 * that had it show billing instead: out of credits, the top-up and Pro; Your credits, the top-up on
 * Free and Pro's monthly credits on the trial. The waitlist never shows then.
 */
export function Pro({ where, variant }: { where: ProWhere; variant?: "card" | "line" }) {
  const ui = useUi();
  const plan = ui.me.plan;
  if (plan) {
    if (where === "zero_credits") return <CreditsWall plan={plan} />;
    // The trial has no monthly credits: those come with each paid month of Pro, so its tag is plain "Pro".
    if (where === "my_credits" && plan.name === "trial")
      return <UpgradeNote from="credits" inTrial={false} trial={`Pro adds ${plan.prices.proCredits} credits each paid month, on top of what you earn. They start with your first paid month.`} />;
    if (where === "my_credits" && plan.topup)
      return (
        <UpgradeNote from="credits">
          {plan.prices.topupCredits} more credits are ${plan.prices.topup}, once, on any plan.
        </UpgradeNote>
      );
    return null;
  }
  // The owner asked not to call out Pro in the product for now. Flip PRO_SHOWN to bring it back.
  if (!PRO_SHOWN) return null;
  return (
    <ProOffer
      where={where}
      variant={variant}
      listed={!!ui.me.proInterest}
      onAsk={async (w) => (await ui.act({ type: "signal", name: "pro_interest", where: w }, { quiet: true })).ok}
    />
  );
}

/** "You owe 2 credits. …" when a removed fact left the balance below zero (Me.owed). The same words as Your credits (ledger.ts owedLine). */
export const owedText = (owed: number) => owedLine(owed) ?? "";

/**
 * Shown instead of spending at 0 credits (the server's "You're out of credits" refusal, never
 * the first-day unlock limit). It names the fact the member tapped and the quickest way to earn
 * a credit for it: their own seats when something is missing there, else finding a seat they
 * held (the search on Your seats, up to ~12 credits a seat), then an invite with its message
 * ready to send, then facts on this company if they know it. Your seats offers the way back to
 * this fact once they have a credit (wallBack). A popover on desktop, a sheet on phones.
 */
/** `need`: what the lock costs (a company is COMPANY_PRICE), so 1 credit short of a company reads as such, not as out of credits. */
export function ZeroCredits({ anchor, id, onClose, need = 1 }: { anchor: HTMLElement; id: string; onClose: () => void; need?: number }) {
  const ui = useUi();
  const earn = earnNote(ui.me);
  const facts = earn.capped ? [] : ui.addable(id);
  const one = ui.seats.n === 1;
  const owed = ui.me.owed ?? 0;
  const phone = ui.layout === "phone";
  const short = Math.max(1, need - Math.max(0, ui.me.credits));
  const title = ui.me.credits > 0 && need > ui.me.credits ? `This needs ${need} credits` : "You're out of credits";
  const aCredit = short === 1 ? (ui.me.credits > 0 ? "one more credit" : "a credit") : `${short} credits`;
  const [inviting, setInviting] = useState(false);
  // The lock that was tapped is its cell (a record's "Unlock company" button has none: the company).
  const [key] = useState(() => anchor.closest("[data-cell]")?.getAttribute("data-cell") ?? null);
  const what = tappedWhat(key);
  const toSeats = (search: boolean) => () => {
    wallBack.set({ id, key, search });
    onClose();
    ui.openSeats();
  };
  /*
   * The ways to earn, in order: the member's own seats (fill in what is missing), else the search
   * for a seat they held, then an invite. Pro comes last. Today's earning cap leaves only the
   * invite, whose bonus waits until tomorrow if it has to.
   */
  const ways: { label: string; go: () => void }[] = [];
  if (!earn.capped)
    ways.push(
      ui.seats.missing > 0
        ? { label: `Fill in your ${one ? "seat" : "seats"}`, go: toSeats(false) }
        : { label: ui.seats.n > 0 ? "Find another seat you held" : "Find a seat you held", go: toSeats(true) },
    );
  ways.push({ label: `Invite a fractional (+${REFERRAL_BONUS} each)`, go: () => setInviting(true) });
  const lead = earn.capped
    ? `To see ${what}, you need ${aCredit}. You've earned today's ${ui.me.earnCap}, and you can earn again ${atTime(ui.me.earnResetsAt)}.`
    : ui.seats.missing > 0
      ? `To see ${what}, earn ${aCredit} first. ${plural(ui.seats.missing, "thing is", "things are")} still missing on your ${one ? "seat" : "seats"}, and each one you add earns a credit.`
      : `To see ${what}, earn ${aCredit} first. Find ${ui.seats.n > 0 ? "another seat" : "a seat"} you held and claim it. Each answer you add there earns a credit, ${SEAT_YIELD}.`;
  const pills = facts.length > 0 && !inviting && (
    <>
      <p className="tp-small muted">If you know this company, add one of these.</p>
      <div className="tp-zero-pills">
        {facts.map((x) => (
          // Phones edit in a bottom sheet, which would sit under this one: close it first.
          <EditPill key={cellKey(x.id, x.field)} fact={x} onPick={phone ? onClose : undefined} />
        ))}
      </div>
    </>
  );
  const body = (
    <>
      <p className="tp-zero-t">{lead}</p>
      {owed > 0 && <p className="tp-small">{owedText(owed)}</p>}
      {inviting ? (
        <>
          <InvitePanel fn={ui.me.function} code={ui.me.inviteCode} />
          <button type="button" className="tp-flink tp-zero-back" onClick={() => setInviting(false)}>
            Other ways to earn
          </button>
        </>
      ) : (
        <div className="tp-zero-ways">
          {ways.map((w, k) => (
            <button key={w.label} type="button" className={`btn${k === 0 ? " btn-primary" : ""}${phone ? " btn-lg" : " btn-sm"}`} onClick={w.go}>
              {w.label}
            </button>
          ))}
        </div>
      )}
      {pills}
      <Pro where="zero_credits" variant="line" />
    </>
  );
  if (phone)
    return (
      <Sheet title={title} onClose={onClose} className="tp-zero-sheet">
        <div className="tp-zero">{body}</div>
      </Sheet>
    );
  return (
    <Anchored anchor={anchor} onClose={onClose} width={inviting ? 360 : 320} className="tp-zero" label={title}>
      <p className="tp-zero-h">{title}</p>
      {body}
    </Anchored>
  );
}

/**
 * A locked fact. It never shows the value. At rest: a small lock and a masked bar. On hover
 * and focus (always, on touch screens): "Unlock · 1 credit". One click or tap spends the credit.
 * `what` names the fact for the tooltip and screen readers ("the role", "this company"). `noun`
 * is added to the label where one lock stands for more ("Unlock company"). At the day's unlock
 * limit (Me.unlocksLeft 0, credits left) it reads "Unlocks again tomorrow".
 */
/** What a lock costs: a company is COMPANY_PRICE, any other fact 1 credit. */
export const lockCost = (t: { field: string }) => (t.field === "identity" ? COMPANY_PRICE : 1);
/** A lock's price: "1 credit", "2 credits", and the free company of the day "free · 1 left today". */
const creditsSay = (n: number) => (n === 0 ? "free · 1 left today" : n === 1 ? "1 credit" : `${n} credits`);

function Lock({
  onUnlock,
  ver,
  from,
  what,
  noun,
  busy,
  later,
  broke,
  cost = 1,
}: {
  onUnlock: () => void;
  ver: number;
  from?: string;
  what: string;
  noun?: string;
  busy?: boolean;
  later?: boolean;
  broke?: boolean;
  cost?: number;
}) {
  const earn = cost > 1 ? "Earn credits to unlock" : "Earn a credit to unlock";
  const say = later ? "You've used today's unlocks. Unlocks again tomorrow" : broke ? `${earn} ${what}` : cost === 0 ? `Unlock ${what} free. It's your 1 free company today` : `Unlock ${what} for ${creditsSay(cost)}`;
  const more = ver > 0 ? ` Confirmed by ${plural(ver, "member")}.` : from && FROM_SAY[from] ? ` ${FROM_SAY[from]}.` : "";
  return (
    <button type="button" className={`lock${busy ? " busy" : ""}${later ? " later" : ""}${broke ? " broke" : ""}`} title={`${say}.${more}`} aria-label={busy ? "Unlocking" : say} disabled={busy} onClick={(e) => (e.stopPropagation(), onUnlock())}>
      <span className="lock-rest" aria-hidden>
        <IconLock />
        <span className="lock-mask" />
      </span>
      <span className="lock-cta" aria-hidden>
        <IconLock />
        {later ? (
          <span>Unlocks again tomorrow</span>
        ) : broke && !busy ? (
          <span>{earn}</span>
        ) : (
          <>
            <span>
              <span className="lock-word">{busy ? "Unlocking" : "Unlock"}</span>
              {!busy && noun && <span className="lock-noun"> {noun}</span>}
            </span>
            {!busy && (
              <span className="lock-cost">
                <span className="lock-dot">· </span>
                {creditsSay(cost)}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

/**
 * A lock that waits for another purchase: "Opens after the name" (a person's LinkedIn, email and
 * phone) or "Opens after the company" (the people and seat holders of a locked company). Quiet,
 * never a button: nothing here spends a credit. `tip` says what to unlock first.
 */
export function QuietLock({ words, tip }: { words: string; tip: string }) {
  return (
    <span className="tp-cell tp-lockwait tp-waits" title={tip}>
      <IconLock />
      <span className="tp-lockwait-t">{words}</span>
      <span className="sr-only">{tip.slice(words.length)}</span>
    </span>
  );
}

/**
 * The fact just saved from the editor, so its cell takes focus when it turns into the value (the
 * add button that had focus is gone by then). `box` is the record it was saved in, if any, so a
 * cell for the same fact in the table behind the record does not take it.
 */
let focusNext: { k: string; box: Element | null; until: number } | null = null;

/**
 * A fact in one of its states. value: plain text (tabular figures for numbers and dates, mono
 * for links). locked: quiet at rest, "Unlock · 1 credit" on hover, one click. empty: "+ Add +1",
 * opens the inline editor. reported: "Under review".
 * After an unlock or a save, keyboard focus lands on the value it revealed (tabIndex -1).
 */
/**
 * `at`: the company's name, for the lock's and the add button's names where the row does not say it (phone cards).
 * `noun`: where one lock opens more than this fact, what it opens ("name and title", see personNoun;
 * "who held it", see seatNoun). `what`: the lock's tooltip and screen-reader name for what it opens,
 * where that is more than this fact ("who held this seat and their role", see seatWhat).
 */
export function FactCell({
  t,
  cell,
  render,
  addLabel = "Add",
  at,
  noun,
  what: whatOverride,
}: {
  t: FactRef;
  cell: Cell | undefined;
  render?: (v: string) => ReactNode;
  addLabel?: string;
  at?: string;
  noun?: string;
  what?: string;
}) {
  const ui = useCellUi();
  const ref = useRef<HTMLSpanElement>(null);
  const refocus = useRef(false);
  const [zero, setZero] = useState(false);
  const credits = ui.me.credits;
  // A credit earned while the zero-credits popover is up (from one of its pills) closes it. The
  // balance on screen can be behind the server's (the popover also opens on the server's refusal).
  const lastCredits = useRef(credits);
  useEffect(() => {
    if (zero && credits > lastCredits.current) setZero(false);
    lastCredits.current = credits;
  }, [zero, credits]);
  const state = cell?.s;
  const k0 = cellKey(t.id, t.field);
  const flags = useCellFlags(k0);
  useEffect(() => {
    if (state !== "value") return;
    const saved = focusNext && focusNext.k === k0 && Date.now() < focusNext.until && (!focusNext.box || focusNext.box.contains(ref.current));
    if (!refocus.current && !saved) return;
    refocus.current = false;
    if (saved) focusNext = null;
    ref.current?.focus({ preventScroll: true });
  }, [state, k0]);
  if (!cell) return null;
  const k = k0;
  const cls = `tp-cell${flags.pulse ? " tp-pulse" : ""}`;
  switch (cell.s) {
    case "value":
      return (
        <span
          ref={ref}
          tabIndex={-1}
          className={`${cls} tp-val${isMonoField(t) ? " mono" : isNumField(t) ? " num" : ""}${flags.flash ? " tp-flash" : ""}${cell.system ? " tp-sys" : ""}`}
          data-cell={k}
          title={fmtValue(t.entity, t.field, cell.v)}
        >
          <span className="tp-val-t">{render ? render(cell.v) : <FactValue t={t} v={cell.v} />}</span>
          {cell.member && <MemberBadge m={cell.member} />}
          {/* Just unlocked: a check, except beside a name nobody verified (a tick there reads as "verified"). The flash says it. */}
          {flags.flash &&
            (marksConfirmed(cell) ? (
              <span className="tp-flash-check" aria-label="Unlocked">
                <IconCheck size={11} />
              </span>
            ) : (
              <span className="sr-only">Unlocked</span>
            ))}
        </span>
      );
    case "locked": {
      // A company costs COMPANY_PRICE: with fewer credits than that it is the wall, as at 0 for any fact.
      // The free company of the day costs nothing (it still counts toward the day's unlocks).
      const free = t.field === "identity" && freeCompanyNow(ui.me);
      const cost = free ? 0 : lockCost(t);
      const later = (ui.me.unlocksLeft ?? Infinity) < lockCost(t) && (credits >= lockCost(t) || (t.field === "identity" && !!ui.me.freeCompany));
      return (
        <span className={cls} data-cell={k} ref={ref}>
          <Lock
            onUnlock={() => {
              refocus.current = !!ref.current?.contains(document.activeElement);
              // The server can still answer "You're out of credits" (another tab spent them): then the popover opens, not a toast. The server counts that wall itself.
              if (free || credits >= cost) return ui.unlock(t, { onWall: () => setZero(true) });
              // The wall: out of credits at a locked fact. Counted for the pilot, by field.
              sendSignal("wall", t.field);
              setZero(true);
            }}
            ver={cell.ver}
            from={cell.from}
            what={(() => {
              const w = whatOverride ?? (noun === "name and title" ? "this person's name and title" : factWhat(t));
              return at ? `${w} at ${at}` : w;
            })()}
            noun={t.field === "identity" ? "company" : noun}
            busy={flags.busy}
            later={later}
            broke={!free && credits < cost}
            cost={cost}
          />
          {zero && ref.current && <ZeroCredits anchor={ref.current} id={t.id} need={cost} onClose={() => setZero(false)} />}
        </span>
      );
    }
    case "empty":
      if (ui.isHidden(t.id))
        return (
          <span className={`${cls} tp-none`} data-cell={k} title={`This company is locked. Unlock it for ${COMPANY_PRICE_SAY}, then you can add this.`}>
            –
          </span>
        );
      // Only the seat holder adds facts about a seat: anyone else sees a quiet dash.
      if (t.entity === "engagement" && !ui.holdsSeat(t.id))
        return (
          <span className={`${cls} tp-none`} data-cell={k} title={SEAT_HOLDER_ONLY}>
            –<span className="sr-only">{SEAT_HOLDER_ONLY}</span>
          </span>
        );
      // The member's own rate, shared for the benchmarks only: not on the seat, and not missing either.
      if (t.entity === "engagement" && t.field === "rate" && ui.me.benchRates?.some((b) => b.engagementId === t.id))
        return (
          <span className={`${cls} tp-none tp-benchonly`} data-cell={k} title="You shared this rate for the benchmarks only. It is never shown with your name or the seat. Your seats can put it on the seat.">
            Benchmarks only
          </span>
        );
      return (
        <span className={cls} data-cell={k} ref={ref}>
          <AddBtn label={addLabel} what={at ? `${factWhat(t)} at ${at}` : factWhat(t)} earn={earnsNow(ui.me, t)} onAdd={() => ref.current && ui.edit(ref.current, t)} />
        </span>
      );
    case "reported":
      return (
        <span
          className="chip tp-review"
          data-cell={k}
          title={
            cell.mine
              ? "Another member reported this one of yours. An admin will take a look."
              : // The reporter's own report (the server marks it byMe). Otherwise the line reads true for anyone.
                cell.byMe
                ? "You reported this. We'll review it."
                : "This was reported as wrong. Members can't see it until an admin reviews it."
          }
        >
          Under review
        </span>
      );
  }
}

/* ---------- overlays ---------- */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
/** What Tab can reach inside an overlay, in order. A folded group (a closed details) offers only its title. */
const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest("details:not([open]) > :not(summary)"));

/** Open overlays, newest last. Only the newest answers Escape and Tab. */
const layers: number[] = [];
let layerSeq = 0;

/**
 * Focus for one overlay: take it on open (an `autoFocus` inside wins, then `first`, then the
 * first control), keep Tab inside (or close on Tab, for a menu), close on Escape when this is
 * the top overlay, and give focus back on close to whatever had it before (or to `restore()`
 * when that control is gone, e.g. an add button that became the value it added).
 */
export function useLayer(
  ref: React.RefObject<HTMLElement | null>,
  opts: { onEscape: () => void; tab?: "trap" | "close"; first?: (root: HTMLElement) => HTMLElement | null; restore?: () => HTMLElement | null },
) {
  const [prev] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    const id = ++layerSeq;
    layers.push(id);
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      const el = o.current.first?.(root) ?? focusables(root)[0] ?? root;
      el.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      const root = ref.current;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        o.current.onEscape();
      } else if (e.key === "Tab" && root) {
        if (o.current.tab === "close") {
          e.preventDefault();
          e.stopPropagation();
          o.current.onEscape();
          return;
        }
        const els = focusables(root);
        if (!els.length) return e.preventDefault();
        const first = els[0];
        const last = els[els.length - 1];
        const at = document.activeElement as HTMLElement | null;
        if (!at || !root.contains(at)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && at === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      const at = layers.indexOf(id);
      if (at >= 0) layers.splice(at, 1);
      // Give focus back once the overlay has left the page, unless something else took it.
      const back = (tries: number) => {
        const a = document.activeElement;
        if (a && a !== document.body && a.isConnected) return;
        const target = prev && prev.isConnected && prev !== document.body ? prev : o.current.restore?.();
        if (target) target.focus({ preventScroll: true });
        else if (tries > 0) setTimeout(() => back(tries - 1), 150);
      };
      // A saved value can arrive with the background refresh, so `restore` gets a second and a half.
      setTimeout(() => back(10), 0);
    };
    // Mounted once per overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Up, Down, Home and End move between a menu's items. */
function menuKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter((el) => !(el as HTMLButtonElement).disabled);
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next].focus();
}

/**
 * Swallow the click that ends the tap on a scrim, so it never lands on what is underneath.
 * Only that gesture's click: the next pointerdown (a new tap) or a moment after pointerup ends it.
 */
function swallowNextClick() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", done, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", done, true);
    if (timer) clearTimeout(timer);
  };
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    done();
  };
  const up = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(done, 350);
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("pointerdown", done, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", done, true);
  timer = setTimeout(done, 1500);
}

/**
 * A popover fixed to an anchor element; follows it on scroll, flips above when there is no room,
 * and never runs off the bottom of the screen (it scrolls inside instead). A transparent scrim
 * under it takes the outside tap that closes it, so that tap never also unlocks a fact or opens
 * a record underneath (it covers the anchor too: tapping it just closes).
 *
 * A `.tp-menu` is a menu (items are menuitem, arrow keys move, Tab closes); anything else is a
 * dialog that keeps Tab inside. `label` or `labelledBy` names it for screen readers.
 */
export function Anchored({
  anchor,
  width = 300,
  onClose,
  children,
  className = "",
  align = "start",
  role,
  label,
  labelledBy,
  restore,
}: {
  anchor: HTMLElement;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  role?: "menu" | "dialog";
  label?: string;
  labelledBy?: string;
  /** Where focus goes on close when the control that opened it is gone. */
  restore?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const kind = role ?? (className.split(" ").includes("tp-menu") ? "menu" : "dialog");
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);
  useLayer(ref, {
    onEscape: () => closeRef.current(),
    tab: kind === "menu" ? "close" : "trap",
    first: kind === "menu" ? (root) => root.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])') : undefined,
    restore,
  });
  // The control that opened it says so (a button only; a cell's wrapper is not a control).
  useEffect(() => {
    if (anchor.tagName !== "BUTTON") return;
    anchor.setAttribute("aria-expanded", "true");
    return () => anchor.setAttribute("aria-expanded", "false");
  }, [anchor]);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) return closeRef.current();
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Phones: the popover spans the page's 16px gutters, like the cards under it. Wider screens keep its own width, 8px from the edge at most.
      const narrow = vw < 600;
      const g = narrow ? 16 : 8;
      const w = narrow ? vw - 2 * g : Math.min(width, vw - 2 * g);
      const h = ref.current?.scrollHeight ?? 200;
      let left = align === "end" ? r.right - w : r.left;
      left = Math.max(g, Math.min(left, vw - w - g));
      let top = r.bottom + 6;
      if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
      // Still too tall for either side: keep it on screen and let it scroll.
      top = Math.max(8, Math.min(top, vh - Math.min(h, vh - 16) - 8));
      setPos({ top, left, maxHeight: vh - 16, width: w });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, width, align]);
  return createPortal(
    <>
      <div
        className="tp-pop-scrim"
        aria-hidden
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          swallowNextClick();
          closeRef.current();
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div
        ref={ref}
        role={kind}
        aria-modal={kind === "dialog" ? true : undefined}
        aria-label={labelledBy ? undefined : label ?? anchor.getAttribute("aria-label") ?? (anchor.textContent?.trim() || undefined)}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`tp-pop ${className}`}
        style={{
          width: pos?.width ?? Math.min(width, typeof window === "undefined" ? width : window.innerWidth - 16),
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          maxHeight: pos?.maxHeight,
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={kind === "menu" ? menuKeys : undefined}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/**
 * A bottom sheet on phones. With `dialog`, the same content is a centered dialog on wider
 * screens. `onClose` runs for the X, a tap on the dimmed page and Escape.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  full,
  dialog,
  className = "",
  restore,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  /** A centered dialog above 767px (phones keep the sheet). */
  dialog?: boolean;
  className?: string;
  restore?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tid = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // The sheet itself takes focus (unless a field inside asked for it), so a screen reader starts at its title.
  useLayer(ref, { onEscape: () => closeRef.current(), tab: "trap", restore, first: (root) => root });
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  /*
   * The grabber works: drag the top of the sheet (the grabber or the title row) down past 80px
   * and it closes, the same as the X (so a form with something typed still asks first). A
   * shorter drag springs back. Buttons in the title row stay buttons.
   */
  const drag = useRef<{ y: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  const dragOn = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
      if (dialog && window.matchMedia("(min-width: 768px)").matches) return; // a centered dialog has no grabber
      drag.current = { y: e.clientY, id: e.pointerId };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.id === e.pointerId) setDy(Math.max(0, e.clientY - drag.current.y));
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.id !== e.pointerId) return;
      const moved = e.clientY - drag.current.y;
      drag.current = null;
      setDy(0);
      if (moved > 80) closeRef.current();
    },
    onPointerCancel: () => {
      drag.current = null;
      setDy(0);
    },
  };
  return createPortal(
    <div className={`tp-sheet-wrap${dialog ? " tp-sheet-dialog" : ""}`} onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className={`tp-sheet${full ? " tp-sheet-full" : ""}${dy ? " dragging" : ""}${className ? ` ${className}` : ""}`}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="tp-sheet-grab" aria-hidden {...dragOn} />
        <div className="tp-sheet-head" {...dragOn}>
          <div className="tp-sheet-title" id={tid}>
            {title}
          </div>
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="tp-sheet-body">{children}</div>
        {footer && <div className="tp-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- a toast with Undo ---------- */

type UndoToast = { id: number; text: string; run: () => Promise<unknown> };
let undoNow: UndoToast | null = null;
const undoSubs = new Set<() => void>();
const undoSet = (u: UndoToast | null) => {
  undoNow = u;
  undoSubs.forEach((f) => f());
};
/** How long a fact a member just added can be taken back from its toast. */
export const UNDO_MS = 10_000;

/** Show "Added the HQ. You earned 1 credit." with Undo for 10 seconds. A newer one replaces it. */
export function showUndo(text: string, run: () => Promise<unknown>) {
  const id = Date.now() + Math.random();
  undoSet({ id, text, run });
  setTimeout(() => undoNow?.id === id && undoSet(null), UNDO_MS);
}

/**
 * Renders the Undo toast inside the app's toast region (role=status, so it is announced), next
 * to the other toasts. Mount it once (the top bar does).
 */
export function UndoHost() {
  const u = useSyncExternalStore(
    (f) => (undoSubs.add(f), () => undoSubs.delete(f)),
    () => undoNow,
    () => null,
  );
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector(".toasts")), [u]);
  const undo = useCallback(async () => {
    if (!u) return;
    setBusy(true);
    await u.run();
    setBusy(false);
    if (undoNow?.id === u.id) undoSet(null);
  }, [u]);
  if (!u || !host) return null;
  return createPortal(
    <div className="toast toast-act" key={u.id}>
      <span className="toast-t">{u.text}</span>
      <button type="button" className="toast-btn" disabled={busy} onClick={undo}>
        {busy ? "Undoing" : "Undo"}
      </button>
    </div>,
    host,
  );
}

/* ---------- the fact sheet (phones) ---------- */

/**
 * Phones: a tap on a fact the member can see opens this sheet, with the value and two 44px rows,
 * "This is right" and "This is wrong", so Confirm and Report never sit on the row next to a lock.
 * The member's own fact gets "Edit" instead. Desktop keeps them inline in the record.
 */
export function FactSheet({ t, cell, label, company, onClose }: { t: FactRef; cell: Cell; label: string; company?: string; onClose: () => void }) {
  const ui = useUi();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (cell.s !== "value") return null;
  const canCheck = !cell.mine && !cell.member?.you && !cell.system;
  const source = cell.ver > 0 ? `Confirmed by ${plural(cell.ver, "member")}` : cell.from && FROM_SAY[cell.from] ? FROM_SAY[cell.from] : cell.mine ? (cell.claimed ? "You claimed this" : "You added this") : null;
  const run = async (a: Action) => {
    setBusy(true);
    const r = await ui.act(a);
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Sheet
      title={
        <span>
          {label}
          {company && <span className="tp-ed-co">{company}</span>}
        </span>
      }
      onClose={onClose}
      className="tp-fsheet"
    >
      <div className={`tp-fsheet-v${isMonoField(t) ? " mono" : isNumField(t) ? " num" : ""}`}>
        <FactValue t={t} v={cell.v} />
        {cell.member && <MemberBadge m={cell.member} />}
      </div>
      {source && <p className="tp-small muted">{source}</p>}
      <div className="tp-fsheet-rows">
        {cell.mine && (
          <button type="button" className="tp-fsheet-row" onClick={() => (onClose(), ui.edit(document.body, t, cell.v))}>
            Edit
          </button>
        )}
        {canCheck && !asking && (
          <>
            {cell.iv ? (
              <p className="tp-fsheet-row tp-fsheet-done">
                <IconCheck size={14} /> You confirmed this
              </p>
            ) : (
              <button type="button" className="tp-fsheet-row" disabled={busy} onClick={() => run({ type: "verify", ...t })}>
                <span>This is right</span>
                <span className="tp-fsheet-hint">Two confirmations earn the member who added it a credit</span>
              </button>
            )}
            <button type="button" className="tp-fsheet-row" disabled={busy} onClick={() => setAsking(true)}>
              <span>This is wrong</span>
              <span className="tp-fsheet-hint">Report it for review</span>
            </button>
          </>
        )}
        {asking && (
          <div className="tp-fsheet-ask" role="group" aria-label="Report this fact">
            <p>Report this as wrong? It hides for you now and for everyone after a second report. You get the credit back if we remove it.</p>
            <div className="tp-sheet-actions">
              <button type="button" className="btn" onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-pine tp-grow" disabled={busy} aria-busy={busy} onClick={() => run({ type: "report", ...t })}>
                Report it
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- inline editor ---------- */

export function earnNote(me: Me): { text: string; capped: boolean } {
  if (me.earnResetsAt || me.earned24h >= me.earnCap)
    return { text: `This earns no credit today. You can earn again ${atTime(me.earnResetsAt)}`, capped: true }; // no closing period: callers add their own
  return { text: "+1 credit", capped: false };
}

export const labelFor = (f: FieldDef) => f.label;
/** Short label for field lists and headers ("Held by", "Revenue then"). */
export const shortLabel = (f: FieldDef) => (f.key === "operator" ? "Held by" : f.short ?? f.label);

/** A multi-pick value ("Fundraise, PE deal") as its picks. */
export const splitPicks = (v: string | null | undefined) => (v ?? "").split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);

/** ARIA for the field inside an editor: its name (the editor's title), and the error when there is one. */
export type FieldAria = { "aria-labelledby"?: string; "aria-invalid"?: boolean; "aria-describedby"?: string };

/** The input for one field kind. Calls onSave with the raw value (choice and Ongoing save at once). */
export function FieldInput({
  f,
  value,
  onChange,
  onSave,
  autoFocus,
  big,
  id,
  aria,
}: {
  f: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  autoFocus?: boolean;
  big?: boolean;
  id?: string;
  aria?: FieldAria;
}) {
  const [q, setQ] = useState("");
  const key = (e: React.KeyboardEvent) => {
    // Enter on the Ongoing chip presses the chip. Anywhere else in the field it saves what is typed or picked.
    if (e.key === "Enter" && !(e.target as HTMLElement).closest("button")) {
      e.preventDefault();
      onSave(value);
    }
  };
  if (f.kind === "choice" && f.options && f.multi) {
    // Several picks: each chip toggles, and Save keeps them (stored in the list's order).
    const picked = splitPicks(value);
    const flip = (o: string) => onChange(f.options!.filter((x) => (x === o ? !picked.includes(o) : picked.includes(x))).join(", "));
    return (
      <div className="tp-chips" role="group" aria-label={aria?.["aria-labelledby"] ? undefined : f.label} aria-labelledby={aria?.["aria-labelledby"]}>
        {f.options.map((o, idx) => (
          <button
            key={o}
            type="button"
            aria-pressed={picked.includes(o)}
            autoFocus={autoFocus && idx === 0}
            className={`chip tp-chipbtn${big ? " tp-chip-big" : ""}${picked.includes(o) ? " chip-on" : ""}`}
            onClick={() => flip(o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (f.kind === "choice" && f.options) {
    if (f.options.length > 10) {
      const opts = f.options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
      return (
        <div className="tp-choice-search">
          <label className="tp-inline-search">
            <IconSearch size={14} />
            <input
              id={id}
              className="tp-bare"
              autoFocus={autoFocus}
              placeholder={`Search ${f.label.toLowerCase()}`}
              value={q}
              {...aria}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && opts[0]) {
                  e.preventDefault();
                  onSave(opts[0]);
                }
              }}
            />
          </label>
          <div className="tp-choice-list" role="listbox" aria-labelledby={aria?.["aria-labelledby"]}>
            {opts.map((o) => (
              <button key={o} type="button" role="option" aria-selected={value === o} className={`tp-choice-opt${value === o ? " on" : ""}`} onClick={() => onSave(o)}>
                {o}
              </button>
            ))}
            {!opts.length && <div className="tp-empty-small">Nothing on the list matches {q.trim()}.</div>}
          </div>
        </div>
      );
    }
    return (
      <div className="tp-chips" role="listbox" aria-label={aria?.["aria-labelledby"] ? undefined : f.label} aria-labelledby={aria?.["aria-labelledby"]}>
        {f.options.map((o, idx) => (
          <button
            key={o}
            type="button"
            role="option"
            aria-selected={value === o}
            autoFocus={autoFocus && idx === 0}
            className={`chip tp-chipbtn${big ? " tp-chip-big" : ""}${value === o ? " chip-on" : ""}`}
            onClick={() => onSave(o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (f.kind === "month" || f.kind === "monthOrOngoing")
    return (
      // The same month and year control as Your seats and the Add flow. Enter on either select saves.
      <div className="tp-month" onKeyDown={key} role="group" aria-labelledby={aria?.["aria-labelledby"]}>
        <MonthYear id={id} label={f.label} value={value === "Ongoing" ? "" : value} onChange={onChange} autoFocus={autoFocus} big={big} />
        {f.kind === "monthOrOngoing" && (
          <button type="button" className={`chip tp-chipbtn${value === "Ongoing" ? " chip-on" : ""}${big ? " tp-chip-big" : ""}`} onClick={() => onSave("Ongoing")}>
            Ongoing
          </button>
        )}
      </div>
    );
  return (
    <input
      id={id}
      className={`input${f.kind === "url" || f.kind === "email" ? " mono" : f.kind === "text" ? "" : " num"}${big ? " tp-input-big" : ""}`}
      type={f.kind === "number" ? "number" : f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"}
      inputMode={f.kind === "number" ? "numeric" : f.kind === "url" ? "url" : undefined}
      autoCapitalize={f.kind === "url" || f.kind === "email" ? "none" : undefined}
      min={f.kind === "number" ? 1 : undefined}
      max={f.kind === "number" ? 80 : undefined}
      maxLength={200}
      autoFocus={autoFocus}
      placeholder={f.placeholder ?? ""}
      value={value}
      {...aria}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={key}
    />
  );
}

/** "Member" after a seat holder who is on Merlin (or "You"). Quiet text, not a chip. */
export function MemberBadge({ m }: { m: { title: string; you?: boolean } }) {
  return (
    <span className="tp-member-badge" title={m.you ? "This is you" : `On Merlin${m.title ? ` · ${m.title}` : ""}`}>
      {m.you ? "You" : "Member"}
    </span>
  );
}

export interface MemberHit {
  id: string;
  name: string;
  title: string;
  you: boolean;
}

/**
 * Members whose name matches, as you type. Waits 350ms after the last key: the server allows
 * 30 searches a minute, and answers 429 past that, in which case the last list stays up.
 */
function useMemberSearch(q: string, off: boolean): { hits: MemberHit[]; done: boolean } {
  const [state, setState] = useState<{ q: string; hits: MemberHit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (off || query.replace(/\s/g, "").length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/table?people=${encodeURIComponent(query)}`, { signal: ctl.signal, cache: "no-store" })
        .then(async (r) => {
          if (r.status === 429) return setState((s) => ({ q: query, hits: s.hits }));
          const j: { members?: MemberHit[] } = r.ok ? await r.json() : { members: [] };
          setState({ q: query, hits: j.members ?? [] });
        })
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, off]);
  if (off || query.replace(/\s/g, "").length < 2) return { hits: [], done: false };
  return { hits: state.q === query ? state.hits : [], done: state.q === query };
}

/**
 * Who held the seat: a first and last name, matched against Merlin members as you type.
 * Picking a member links the seat to that person (`memberId`); typing again unlinks it.
 * A combobox: the arrow keys move through the list and the highlighted name is read out.
 */
export function SeatHolderInput({
  value,
  memberId,
  onChange,
  onPick,
  onEnter,
  autoFocus,
  big,
  id,
  aria,
  invalid,
  describedBy,
}: {
  value: string;
  memberId: string | null;
  onChange: (value: string, memberId: string | null) => void;
  /** A member was picked from the list. */
  onPick?: (m: MemberHit) => void;
  /** Enter with nothing highlighted (save what was typed). */
  onEnter?: () => void;
  autoFocus?: boolean;
  big?: boolean;
  id?: string;
  aria?: FieldAria;
  /** The form found a problem with this field (aria-invalid). */
  invalid?: boolean;
  /** The id of the line that says what is wrong (aria-describedby). */
  describedBy?: string;
}) {
  const [hi, setHi] = useState(-1);
  const [picked, setPicked] = useState<MemberHit | null>(null);
  const lid = useId();
  const linked = memberId && picked?.id === memberId ? picked : null;
  const { hits, done } = useMemberSearch(value, !!linked);
  const pick = (m: MemberHit) => {
    setPicked(m);
    setHi(-1);
    onChange(m.name, m.id);
    onPick?.(m);
  };
  const open = hits.length > 0 && !linked;
  return (
    <div className="tp-seat">
      <input
        id={id}
        className={`input${big ? " tp-input-big" : ""}`}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={200}
        placeholder="First and last name"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? lid : undefined}
        aria-activedescendant={open && hi >= 0 ? `${lid}-${hi}` : undefined}
        {...aria}
        {...(invalid ? { "aria-invalid": true } : {})}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        value={value}
        onChange={(e) => {
          setHi(-1);
          onChange(e.target.value, null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && hits.length) {
            e.preventDefault();
            setHi((h) => Math.min(hits.length - 1, h + 1));
          } else if (e.key === "ArrowUp" && hits.length) {
            e.preventDefault();
            setHi((h) => Math.max(-1, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (hi >= 0 && hits[hi]) pick(hits[hi]);
            else onEnter?.();
          }
        }}
      />
      {linked ? (
        <div className="tp-seat-linked" role="status">
          <span className="tp-seat-av" style={{ background: `hsl(${hue(linked.name)} 45% 90%)`, color: `hsl(${hue(linked.name)} 45% 28%)` }}>
            {initials(linked.name)}
          </span>
          <span className="tp-seat-who">
            <b>{linked.you ? "You" : linked.name}</b>
            <span>On Merlin{linked.title ? ` · ${linked.title}` : ""}</span>
          </span>
          <button type="button" className="tp-seat-x" aria-label="Unlink this member" title="Unlink this member" onClick={() => onChange(value, null)}>
            <IconX size={14} />
          </button>
        </div>
      ) : open ? (
        <div className="tp-seat-list">
          <div className="tp-seat-cap" aria-hidden>
            Members on Merlin
          </div>
          <div id={lid} role="listbox" aria-label="Members on Merlin">
            {hits.map((m, i) => (
              <button
                key={m.id}
                id={`${lid}-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={i === hi}
                className={`tp-seat-opt${i === hi ? " on" : ""}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(m)}
              >
                <span className="tp-seat-av" aria-hidden style={{ background: `hsl(${hue(m.name)} 45% 90%)`, color: `hsl(${hue(m.name)} 45% 28%)` }}>
                  {initials(m.name)}
                </span>
                <span className="tp-seat-who">
                  <b>{m.name}</b>
                  <span>{m.you ? "You" : m.title || "Member"}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        done && (
          <p className="tp-seat-none" role="status">
            Not on the list? Type their first and last name. If they are a member, the seat links to them when you save.
          </p>
        )
      )}
    </div>
  );
}

/** Who sees a rate the member charged: members who unlock it on the seat, or the benchmarks only. */
export type RateChoice = "record" | "bench";
export const RATE_WHO: Record<RateChoice, { title: string; line: string }> = {
  record: { title: "Members who unlock it", line: "It goes on this seat. A member spends 1 credit to see it, and 1 more to see your name." },
  bench: { title: "Only the benchmarks", line: "It counts in the medians on Rate benchmarks and is never shown with your name or the seat. You can remove it there any time." },
};

/** The two choices for a rate on a seat the member held: Your seats, "Add a seat you held", and the rate editor below on the member's own seat. */
export function RateWho({ value, onChange, disabled }: { value: RateChoice | null; onChange: (w: RateChoice) => void; disabled?: boolean }) {
  const ui = useUi();
  const name = useId();
  const option = (k: RateChoice) => (
    <label className={`ys-who-o${value === k ? " on" : ""}`}>
      <input type="radio" name={name} checked={value === k} disabled={disabled} onChange={() => onChange(k)} />
      <span className="ys-who-t">
        <b>{RATE_WHO[k].title}</b>
        <span>{RATE_WHO[k].line}</span>
      </span>
    </label>
  );
  return (
    <div className="ys-who" role="radiogroup" aria-labelledby={`${name}l`}>
      <span className="ys-who-l" id={`${name}l`}>
        Who can see it?
      </span>
      {option("record")}
      {option("bench")}
      {value === "bench" && ui.me.invitePending && <p className="ys-who-note">Your invite bonus comes with your first fact on a record, so it isn&apos;t paid for this one.</p>}
    </div>
  );
}

/**
 * The small editor anchored to an empty cell (a bottom sheet on phones). With `initial`, it
 * edits the member's own value. A new fact can be taken back for 10 seconds from its toast.
 * Escape or a tap outside with something typed asks before it throws it away.
 */
export function FactEditor({
  anchor,
  t,
  company,
  initial,
  ownRate,
  onClose,
}: {
  anchor: HTMLElement;
  t: FactRef;
  company: string;
  initial?: string;
  /** The rate on a seat the member held: they pick who can see it, as on Your seats. `pricing` reads a rate typed without a unit. */
  ownRate?: { pricing: string | null };
  onClose: () => void;
}) {
  const ui = useUi();
  const f = fieldDef(t.entity, t.field);
  const [value, setValue] = useState(initial ?? "");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState<RateChoice | null>(null);
  const hid = useId();
  const eid = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);
  if (!f) return null;
  const editing = initial !== undefined;
  const choose = !!ownRate && !editing;
  const earns = !editing && earnsNow(ui.me, t);
  const capped = !editing && earnNote(ui.me).capped;
  const note = editing
    ? "Edits earn no credit"
    : capped
      ? "No credit today"
      : earns
        ? "+1 credit"
        : "No credit for this one today";
  const seat = t.entity === "engagement" && t.field === "operator";
  const dirty = !saving && value.trim() !== "" && value.trim() !== (initial ?? "").trim();
  // Back to the field from "Throw away what you typed?".
  const keep = () => {
    setAsking(false);
    requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true }));
  };
  // Esc and a click outside: with the question up they mean Keep editing (the top layer closes first), else ask before throwing text away.
  const tryClose = () => (asking ? keep() : dirty ? setAsking(true) : onClose());
  // After a save the add button is gone: the cell takes focus once it shows the value (see focusNext).
  const focusValue = () => (focusNext = { k: cellKey(t.id, t.field), box: anchor.closest(".tp-drawer, .tp-rsheet"), until: Date.now() + 4000 });
  const save = async (raw: string, member: string | null = memberId) => {
    const { error, value: clean } = cleanValue(f, raw);
    if (error) return setErr(error);
    if (choose && !who) return setErr("Pick who can see your rate.");
    if (choose && who === "bench") {
      // The medians need a monthly or an hourly figure. With no unit typed, the seat's pricing model decides.
      const read = readRate(raw.trim(), ownRate?.pricing ?? null);
      if (!read) return setErr(BENCH_RATE_HELP);
      setErr(null);
      setSaving(true);
      // Not quiet: the answer says when the rate starts to count, and about an invite bonus.
      const r = await ui.act({ type: "benchRate", engagementId: t.id, pricing: read.kind === "hourly" ? "Hourly" : "Monthly retainer", rate: raw.trim() });
      setSaving(false);
      if (r.ok) onClose();
      return;
    }
    setErr(null);
    setSaving(true);
    if (editing) {
      const ok = await ui.fill(t, clean!, seat ? member : undefined);
      setSaving(false);
      if (ok) onClose();
      return;
    }
    focusValue();
    const wasCapped = earnNote(ui.me).capped;
    const resets = ui.me.earnResetsAt;
    const r = await ui.act({ type: "fill", entity: t.entity, id: t.id, field: t.field, value: clean!, ...(seat && member ? { memberId: member } : {}) }, { quiet: true });
    setSaving(false);
    if (!r.ok) return;
    const said = wasCapped
      ? `Added ${sayField(f)}. No credit this time, because you've earned today's ${ui.me.earnCap}. You can earn again ${atTime(resets)}.`
      : r.message || `Added ${sayField(f)}.`;
    // "retract" takes the member's own new fact back, with its credit, if nobody unlocked or confirmed it yet.
    showUndo(said, () => ui.act({ type: "retract", entity: t.entity, id: t.id, field: t.field }));
    onClose();
  };
  // A choice saves on one tap; several picks (Why now) save with the button, like text.
  const simple = f.kind !== "choice" || !!f.multi;
  const aria: FieldAria = { "aria-labelledby": hid, "aria-invalid": err ? true : undefined, "aria-describedby": err ? eid : undefined };
  const body = (
    <div ref={bodyRef} className="tp-ed-body">
      {seat ? (
        <SeatHolderInput
          value={value}
          memberId={memberId}
          onChange={(v, m) => (setValue(v), setMemberId(m), setErr(null))}
          onPick={(m) => save(m.name, m.id)}
          onEnter={() => save(value)}
          autoFocus
          big={ui.layout === "phone"}
          aria={aria}
        />
      ) : (
        <FieldInput f={f} value={value} onChange={(v) => (setValue(v), setErr(null))} onSave={(v) => save(v)} autoFocus big={ui.layout === "phone"} aria={aria} />
      )}
      {choose ? <RateWho value={who} onChange={(w) => (setWho(w), setErr(null))} disabled={saving} /> : f.hint && f.hint !== f.placeholder && <p className="tp-ed-hint">{f.hint}</p>}
      {capped && <p className="tp-ed-hint">{earnNote(ui.me).text}.</p>}
      {!capped && !editing && !earns && <p className="tp-ed-hint">Only 5 answers for a company&apos;s industry, size, revenue or how they sell earn a credit each day. This one still saves.</p>}
      {err && (
        <p className="tp-ed-err" role="alert" id={eid}>
          {err}
        </p>
      )}
    </div>
  );
  const ask = asking && (
    <div className="tp-ed-ask" role="group" aria-label="Throw away what you typed?">
      <span>Throw away what you typed?</span>
      <span className="tp-ed-foot-r">
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Throw it away
        </button>
        <button ref={keepRef} type="button" className="btn btn-sm btn-pine" onClick={keep}>
          Keep editing
        </button>
      </span>
    </div>
  );
  const title = (
    <span id={hid}>
      {editing ? "Edit" : "Add"} {sayField(f)}
      {company && <span className="sr-only"> at </span>}
      {company && (
        <span className="tp-ed-co" title={company}>
          {company}
        </span>
      )}
    </span>
  );
  const saveLabel = choose && who === "bench" ? "Share for the benchmarks" : "Save";
  const noteCls = `tp-earn-note num${capped || (!editing && !earns) ? " capped" : ""}${editing ? " muted" : ""}`;
  if (ui.layout === "phone")
    return (
      <Sheet
        title={title}
        onClose={tryClose}
        footer={
          ask || (
            <div className="tp-ed-foot">
              <span className={noteCls}>{note}</span>
              {simple && (
                <button type="button" className="btn btn-primary btn-lg" disabled={saving || !value} aria-busy={saving} onClick={() => save(value)}>
                  {saving ? "Saving" : saveLabel}
                </button>
              )}
            </div>
          )
        }
      >
        {body}
      </Sheet>
    );
  return (
    <Anchored anchor={anchor} onClose={tryClose} width={choose ? 360 : f.kind === "choice" || seat ? 320 : 300} className="tp-editor" labelledBy={hid}>
      <div className="tp-ed-head">{title}</div>
      {body}
      {ask || (
        <div className="tp-ed-foot">
          <span className="tp-ed-keys">{simple ? "Enter saves, Esc cancels" : "Pick one, or Esc to cancel"}</span>
          <span className="tp-ed-foot-r">
            <span className={noteCls}>{saving && !simple ? "Saving" : note}</span>
            {simple && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving || !value} aria-busy={saving} onClick={() => save(value)}>
                {saving ? "Saving" : saveLabel}
              </button>
            )}
          </span>
        </div>
      )}
    </Anchored>
  );
}
