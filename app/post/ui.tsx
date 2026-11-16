"use client";

/**
 * App-wide context for the Trading Post app and the fact cell: one component that renders
 * any fact in its three states (value, locked, empty) plus "Under review", and the inline
 * editor that opens from an empty cell.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Cell, Me } from "@/lib/tableTypes";
import { cleanValue, fieldDef, type FieldDef } from "@/lib/tableFields";
import { AddPill, IconCheck, IconSearch, IconX, LockPill, fmtValue, hrefFor, hue, initials, type Act } from "../ui/shared";
import { cellKey, type FactRef } from "./model";
import { fieldText, fmtTime, plural, thisMonth, type Layout } from "./hooks";
import { ProOffer, sendSignal, type ProWhere } from "./ProOffer";

export type AddMode = "engagement" | "person" | "facts";
export interface AddOpts {
  companyId?: string;
  mode?: AddMode;
  query?: string;
  engagementId?: string;
  /** A seat the member held: the new engagement is linked to them as seat holder. */
  mine?: boolean;
}

export interface Ui {
  me: Me;
  act: Act;
  layout: Layout;
  busy: Set<string>;
  flash: Set<string>;
  pulse: string | null;
  unlock: (t: FactRef) => void;
  unlockMany: (items: FactRef[]) => Promise<boolean>;
  /** Open the fact editor on an element. With `initial`, it edits the member's own value. */
  edit: (el: HTMLElement, t: FactRef, initial?: string) => void;
  /** `memberId` (seat holder only) links the seat to a member picked in SeatHolderInput. */
  fill: (t: FactRef, value: string, memberId?: string | null) => Promise<boolean>;
  openCompany: (id: string, focus?: string) => void;
  openAdd: (o?: AddOpts) => void;
  /** The record belongs to a company hidden until the member unlocks it (no adding there). */
  isHidden: (id: string) => boolean;
  /** Up to 3 empty facts at the company that owns this record (a company, engagement or person id). */
  addable: (id: string) => FactRef[];
  /** The member's own seats: how many, and the facts still missing on them. */
  seats: { n: number; missing: number };
  /** Open the Your seats page, at one seat when given. */
  openSeats: (engagementId?: string) => void;
}

export const UiCtx = createContext<Ui | null>(null);
export function useUi(): Ui {
  const u = useContext(UiCtx);
  if (!u) throw new Error("UiCtx missing");
  return u;
}

/* ---------- values ---------- */

export function FactValue({ t, v }: { t: FactRef; v: string }) {
  const href = hrefFor(t.entity, t.field, v);
  const text = fmtValue(t.entity, t.field, v);
  if (href)
    return (
      <a className="tp-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {text.replace(/^https?:\/\//, "").replace(/^www\./, "")}
      </a>
    );
  return <>{text}</>;
}

/** Numbers, dates, money and addresses are set in mono; words use the UI font. */
const MONO_KINDS = ["number", "month", "monthOrOngoing", "url", "email", "phone"];
const MONO_FIELDS = ["employees", "revenue", "rate"];
export const isMonoField = (t: FactRef) => MONO_KINDS.includes(fieldDef(t.entity, t.field)?.kind ?? "") || MONO_FIELDS.includes(t.field);

/** An add pill that opens the fact editor on itself. `onPick` runs first (e.g. to close the popover it sits in). */
export function EditPill({ fact, label, onPick }: { fact: FactRef; label?: string; onPick?: () => void }) {
  const ui = useUi();
  const ref = useRef<HTMLSpanElement>(null);
  const f = fieldDef(fact.entity, fact.field);
  return (
    <span ref={ref} data-cell={cellKey(fact.id, fact.field)} className={ui.pulse === cellKey(fact.id, fact.field) ? "tp-pulse" : undefined}>
      <AddPill
        label={label ?? (f ? shortLabel(f) : fact.field)}
        earn={!earnNote(ui.me).capped}
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
  const ui = useUi();
  return (
    <button type="button" className="chip ys-yours" title="Fill in what is missing on your seat" onClick={(e) => (e.stopPropagation(), ui.openSeats(id))}>
      Your seat
    </button>
  );
}

/** The Pro waitlist offer, wired to the signed-in member. */
export function Pro({ where, variant }: { where: ProWhere; variant?: "card" | "line" }) {
  const ui = useUi();
  return (
    <ProOffer
      where={where}
      variant={variant}
      listed={!!ui.me.proInterest}
      onAsk={async (w) => (await ui.act({ type: "signal", name: "pro_interest", where: w }, { quiet: true })).ok}
    />
  );
}

/** Shown instead of spending at 0 credits: facts the member can add (their own seats first) to earn one. */
export function ZeroCredits({ anchor, id, onClose }: { anchor: HTMLElement; id: string; onClose: () => void }) {
  const ui = useUi();
  const earn = earnNote(ui.me);
  const facts = earn.capped ? [] : ui.addable(id);
  const pills = (
    <div className="tp-zero-pills">
      {facts.map((x) => (
        // Phones edit in a bottom sheet, which sits under this popover: close it first.
        <EditPill key={cellKey(x.id, x.field)} fact={x} onPick={ui.layout === "phone" ? onClose : undefined} />
      ))}
    </div>
  );
  return (
    <Anchored anchor={anchor} onClose={onClose} width={300} className="tp-zero">
      {earn.capped ? (
        <p className="tp-zero-t">You have 0 credits, and today&apos;s earning is used up. It reopens {fmtTime(ui.me.earnResetsAt)}.</p>
      ) : ui.seats.missing > 0 ? (
        <>
          <p className="tp-zero-t">
            You have 0 credits. Your {ui.seats.n === 1 ? "seat has" : "seats have"} {plural(ui.seats.missing, "fact")} to add, 1 credit each.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (onClose(), ui.openSeats())}>
            Fill in your seats
          </button>
          {facts.length > 0 && (
            <>
              <p className="tp-small muted">Or add one of these.</p>
              {pills}
            </>
          )}
        </>
      ) : facts.length ? (
        <>
          <p className="tp-zero-t">You have 0 credits. Add one of these to earn 1.</p>
          {pills}
        </>
      ) : (
        <>
          <p className="tp-zero-t">You have 0 credits. Add what you know about a company to earn more.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (onClose(), ui.openAdd())}>
            Add what you know
          </button>
        </>
      )}
      <Pro where="zero_credits" variant="line" />
    </Anchored>
  );
}

/**
 * A fact in one of its states. value: plain text (mono for numbers, dates, links). locked:
 * "Unlock 1", one click. empty: "+ Add +1", opens the inline editor. reported: "Under review".
 */
export function FactCell({ t, cell, render, addLabel = "Add" }: { t: FactRef; cell: Cell | undefined; render?: (v: string) => ReactNode; addLabel?: string }) {
  const ui = useUi();
  const ref = useRef<HTMLSpanElement>(null);
  const [zero, setZero] = useState(false);
  const credits = ui.me.credits;
  useEffect(() => {
    if (zero && credits > 0) setZero(false);
  }, [zero, credits]);
  if (!cell) return null;
  const k = cellKey(t.id, t.field);
  const cls = `tp-cell${ui.pulse === k ? " tp-pulse" : ""}`;
  switch (cell.s) {
    case "value":
      return (
        <span
          className={`${cls} tp-val${isMonoField(t) ? " mono" : ""}${ui.flash.has(k) ? " tp-flash" : ""}${cell.system ? " tp-sys" : ""}`}
          data-cell={k}
          title={fmtValue(t.entity, t.field, cell.v)}
        >
          <span className="tp-val-t">{render ? render(cell.v) : <FactValue t={t} v={cell.v} />}</span>
          {cell.member && <MemberBadge m={cell.member} />}
          {ui.flash.has(k) && (
            <span className="tp-flash-check" aria-label="Unlocked">
              <IconCheck size={12} />
            </span>
          )}
        </span>
      );
    case "locked":
      return (
        <span className={cls} data-cell={k} ref={ref}>
          <LockPill
            onUnlock={() => {
              if (ui.me.credits > 0) return ui.unlock(t);
              // The wall: out of credits at a locked fact. Counted for the pilot, by field.
              sendSignal("wall", t.field);
              setZero(true);
            }}
            ver={cell.ver}
            busy={ui.busy.has(k)}
          />
          {zero && credits <= 0 && ref.current && <ZeroCredits anchor={ref.current} id={t.id} onClose={() => setZero(false)} />}
        </span>
      );
    case "empty":
      if (ui.isHidden(t.id))
        return (
          <span className={`${cls} tp-faint`} data-cell={k} title="Unlock the company to add facts here">
            —
          </span>
        );
      return (
        <span className={cls} data-cell={k} ref={ref}>
          <AddPill label={addLabel} earn={!earnNote(ui.me).capped} onAdd={() => ref.current && ui.edit(ref.current, t)} />
        </span>
      );
    case "reported":
      return (
        <span className="tp-review" data-cell={k} title={cell.mine ? "A member reported your fact. An admin will review it." : "Reported. Hidden until an admin reviews it."}>
          Under review
        </span>
      );
  }
}

/* ---------- overlays ---------- */

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
 * A popover fixed to an anchor element; follows it on scroll, flips above when there is no room.
 * A transparent scrim under it takes the outside tap that closes it, so that tap never also
 * unlocks a fact or opens a record underneath (it covers the anchor too: tapping it just closes).
 */
export function Anchored({
  anchor,
  width = 300,
  onClose,
  children,
  className = "",
  align = "start",
}: {
  anchor: HTMLElement;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) return closeRef.current();
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      const h = ref.current?.offsetHeight ?? 200;
      let left = align === "end" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      let top = r.bottom + 6;
      if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
      setPos({ top, left });
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
        className={`tp-pop ${className}`}
        style={{ width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/** Bottom sheet on phones. */
export function Sheet({ title, onClose, children, footer, full }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; full?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <div className="tp-sheet-wrap" onClick={onClose}>
      <div className={`tp-sheet${full ? " tp-sheet-full" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="tp-sheet-head">
          <div className="tp-sheet-title">{title}</div>
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

/* ---------- inline editor ---------- */

export function earnNote(me: Me): { text: string; capped: boolean } {
  if (me.earnResetsAt || me.earned24h >= me.earnCap)
    return { text: `No credit today. Earning reopens ${fmtTime(me.earnResetsAt)}`, capped: true };
  return { text: "+1 credit", capped: false };
}

export const labelFor = (f: FieldDef) => f.label;
/** Short label for field lists ("Held by", "Revenue then", "Hours/wk"). */
export const shortLabel = (f: FieldDef) => (f.key === "operator" ? "Held by" : f.key === "hours" ? "Hours/wk" : f.short ?? f.label);

/** The input for one field kind. Calls onSave with the raw value (choice and Ongoing save at once). */
export function FieldInput({
  f,
  value,
  onChange,
  onSave,
  autoFocus,
  big,
  id,
}: {
  f: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  autoFocus?: boolean;
  big?: boolean;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(value);
    }
  };
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
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && opts[0]) {
                  e.preventDefault();
                  onSave(opts[0]);
                }
              }}
            />
          </label>
          <div className="tp-choice-list" role="listbox">
            {opts.map((o) => (
              <button key={o} type="button" role="option" aria-selected={value === o} className={`tp-choice-opt${value === o ? " on" : ""}`} onClick={() => onSave(o)}>
                {o}
              </button>
            ))}
            {!opts.length && <div className="tp-empty-small">No match</div>}
          </div>
        </div>
      );
    }
    return (
      <div className="tp-chips" role="listbox" aria-label={f.label}>
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
      <div className="tp-month">
        <input
          id={id}
          className={`input mono${big ? " tp-input-big" : ""}`}
          type="month"
          max={thisMonth()}
          autoFocus={autoFocus}
          value={value === "Ongoing" ? "" : value}
          placeholder="YYYY-MM"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={key}
        />
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
      className={`input${f.kind === "text" ? "" : " mono"}${big ? " tp-input-big" : ""}`}
      type={f.kind === "number" ? "number" : f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"}
      inputMode={f.kind === "number" ? "numeric" : f.kind === "url" ? "url" : undefined}
      min={f.kind === "number" ? 1 : undefined}
      max={f.kind === "number" ? 80 : undefined}
      autoFocus={autoFocus}
      placeholder={f.placeholder ?? ""}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={key}
    />
  );
}

/** "Member" next to a seat holder who is on Trading Post (or "You"). */
export function MemberBadge({ m }: { m: { title: string; you?: boolean } }) {
  return (
    <span className="tp-member-badge" title={m.you ? "This is you" : `Trading Post member${m.title ? ` · ${m.title}` : ""}`}>
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

/** Members whose name matches, as you type (debounced). */
function useMemberSearch(q: string, off: boolean): { hits: MemberHit[]; done: boolean } {
  const [state, setState] = useState<{ q: string; hits: MemberHit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (off || query.replace(/\s/g, "").length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/table?people=${encodeURIComponent(query)}`, { signal: ctl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((j: { members?: MemberHit[] }) => setState({ q: query, hits: j.members ?? [] }))
        .catch(() => {});
    }, 160);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, off]);
  if (off || query.replace(/\s/g, "").length < 2) return { hits: [], done: false };
  return { hits: state.q === query ? state.hits : [], done: state.q === query };
}

/**
 * Who held the seat: a first and last name, matched against Trading Post members as you type.
 * Picking a member links the seat to that person (`memberId`); typing again unlinks it.
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
}) {
  const [hi, setHi] = useState(-1);
  const [picked, setPicked] = useState<MemberHit | null>(null);
  const linked = memberId && picked?.id === memberId ? picked : null;
  const { hits, done } = useMemberSearch(value, !!linked);
  const pick = (m: MemberHit) => {
    setPicked(m);
    setHi(-1);
    onChange(m.name, m.id);
    onPick?.(m);
  };
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="tp-seat">
      <input
        id={id}
        className={`input${big ? " tp-input-big" : ""}`}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="First and last name"
        aria-autocomplete="list"
        aria-expanded={hits.length > 0}
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
        <div className="tp-seat-linked">
          <span className="tp-seat-av" style={{ background: `hsl(${hue(linked.name)} 45% 90%)`, color: `hsl(${hue(linked.name)} 45% 28%)` }}>
            {initials(linked.name)}
          </span>
          <span className="tp-seat-who">
            <b>{linked.you ? "You" : linked.name}</b>
            <span>Trading Post member{linked.title ? ` · ${linked.title}` : ""}</span>
          </span>
          <button type="button" className="tp-seat-x" aria-label="Unlink member" onClick={() => onChange(value, null)}>
            <IconX size={14} />
          </button>
        </div>
      ) : hits.length > 0 ? (
        <div className="tp-seat-list" role="listbox" aria-label="Members on Trading Post">
          <div className="tp-seat-cap">Members on Trading Post</div>
          {hits.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === hi}
              className={`tp-seat-opt${i === hi ? " on" : ""}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(m)}
            >
              <span className="tp-seat-av" style={{ background: `hsl(${hue(m.name)} 45% 90%)`, color: `hsl(${hue(m.name)} 45% 28%)` }}>
                {initials(m.name)}
              </span>
              <span className="tp-seat-who">
                <b>{m.name}</b>
                <span>{m.you ? "You" : m.title || "Member"}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        done &&
        words >= 2 && <p className="tp-seat-none">No member by that name. You can still add them.</p>
      )}
    </div>
  );
}

/** The small editor anchored to an empty cell (a bottom sheet on phones). With `initial`, it edits the member's own value. */
export function FactEditor({ anchor, t, company, initial, onClose }: { anchor: HTMLElement; t: FactRef; company: string; initial?: string; onClose: () => void }) {
  const ui = useUi();
  const f = fieldDef(t.entity, t.field);
  const [value, setValue] = useState(initial ?? "");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!f) return null;
  const editing = initial !== undefined;
  const earn = editing ? { text: "Edits earn no credit", capped: false } : earnNote(ui.me);
  const seat = t.entity === "engagement" && t.field === "operator";
  const save = async (raw: string, member: string | null = memberId) => {
    const { error, value: clean } = cleanValue(f, raw);
    if (error) return setErr(error);
    setErr(null);
    setSaving(true);
    const ok = await ui.fill(t, clean!, seat ? member : undefined);
    setSaving(false);
    if (ok) onClose();
  };
  const simple = f.kind !== "choice";
  const body = (
    <>
      {seat ? (
        <SeatHolderInput
          value={value}
          memberId={memberId}
          onChange={(v, m) => (setValue(v), setMemberId(m), setErr(null))}
          onPick={(m) => save(m.name, m.id)}
          onEnter={() => save(value)}
          autoFocus
          big={ui.layout === "phone"}
        />
      ) : (
        <FieldInput f={f} value={value} onChange={(v) => (setValue(v), setErr(null))} onSave={(v) => save(v)} autoFocus big={ui.layout === "phone"} />
      )}
      {f.hint && f.hint !== f.placeholder && <p className="tp-ed-hint">{f.hint}</p>}
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
    </>
  );
  const title = (
    <span>
      {editing ? "Edit" : "Add"} {fieldText(labelFor(f))} <span className="tp-ed-co">{company}</span>
    </span>
  );
  if (ui.layout === "phone")
    return (
      <Sheet
        title={title}
        onClose={onClose}
        footer={
          <div className="tp-ed-foot">
            <span className={`tp-earn-note${earn.capped ? " capped" : ""}${editing ? " muted" : ""}`}>{earn.text}</span>
            {simple && (
              <button type="button" className="btn btn-primary btn-lg" disabled={saving || !value} onClick={() => save(value)}>
                Save
              </button>
            )}
          </div>
        }
      >
        {body}
      </Sheet>
    );
  return (
    <Anchored anchor={anchor} onClose={onClose} width={f.kind === "choice" || seat ? 320 : 300} className="tp-editor">
      <div className="tp-ed-head">{title}</div>
      {body}
      <div className="tp-ed-foot">
        <span className="tp-ed-keys">{simple ? "Enter to save, Esc to cancel" : "Pick one, Esc to cancel"}</span>
        <span className="tp-ed-foot-r">
          <span className={`tp-earn-note${earn.capped ? " capped" : ""}${editing ? " muted" : ""}`}>{saving ? "Saving" : earn.text}</span>
          {simple && (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !value} onClick={() => save(value)}>
              Save
            </button>
          )}
        </span>
      </div>
    </Anchored>
  );
}
