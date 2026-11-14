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
import { AddPill, IconCheck, IconSearch, IconX, LockPill, fmtValue, hrefFor, type Act } from "../ui/shared";
import { cellKey, type FactRef } from "./model";
import { fmtTime, thisMonth, type Layout } from "./hooks";

export type AddMode = "engagement" | "person" | "facts";
export interface AddOpts {
  companyId?: string;
  mode?: AddMode;
  query?: string;
  engagementId?: string;
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
  edit: (el: HTMLElement, t: FactRef) => void;
  fill: (t: FactRef, value: string) => Promise<boolean>;
  openCompany: (id: string, focus?: string) => void;
  openAdd: (o?: AddOpts) => void;
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

/**
 * A fact in one of its states. value: plain mono text (links for urls). locked: "Unlock 1",
 * one click. empty: "+ Add +1", opens the inline editor. reported: "Under review".
 */
export function FactCell({ t, cell, render, addLabel = "Add" }: { t: FactRef; cell: Cell | undefined; render?: (v: string) => ReactNode; addLabel?: string }) {
  const ui = useUi();
  const ref = useRef<HTMLSpanElement>(null);
  if (!cell) return null;
  const k = cellKey(t.id, t.field);
  const cls = `tp-cell${ui.pulse === k ? " tp-pulse" : ""}`;
  switch (cell.s) {
    case "value":
      return (
        <span className={`${cls} tp-val${ui.flash.has(k) ? " tp-flash" : ""}${cell.system ? " tp-sys" : ""}`} data-cell={k} title={fmtValue(t.entity, t.field, cell.v)}>
          <span className="tp-val-t">{render ? render(cell.v) : <FactValue t={t} v={cell.v} />}</span>
          {ui.flash.has(k) && (
            <span className="tp-flash-check" aria-label="Unlocked">
              <IconCheck size={12} />
            </span>
          )}
        </span>
      );
    case "locked":
      return (
        <span className={cls} data-cell={k}>
          <LockPill onUnlock={() => ui.unlock(t)} ver={cell.ver} busy={ui.busy.has(k)} />
        </span>
      );
    case "empty":
      return (
        <span className={cls} data-cell={k} ref={ref}>
          <AddPill label={addLabel} onAdd={() => ref.current && ui.edit(ref.current, t)} />
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

/** A popover fixed to an anchor element; follows it on scroll, flips above when there is no room. */
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
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      closeRef.current();
    };
    const id = setTimeout(() => document.addEventListener("mousedown", h));
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", h);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      className={`tp-pop ${className}`}
      style={{ width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
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

export const labelFor = (f: FieldDef) => (f.key === "operator" ? "Fractional" : f.label);
/** Short label for field lists ("Revenue then", "Hours/wk"). */
export const shortLabel = (f: FieldDef) => (f.key === "operator" ? "Fractional" : f.key === "hours" ? "Hours/wk" : f.short ?? f.label);

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

/** The small editor anchored to an empty cell (a bottom sheet on phones). */
export function FactEditor({ anchor, t, company, onClose }: { anchor: HTMLElement; t: FactRef; company: string; onClose: () => void }) {
  const ui = useUi();
  const f = fieldDef(t.entity, t.field);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!f) return null;
  const earn = earnNote(ui.me);
  const save = async (raw: string) => {
    const { error, value: clean } = cleanValue(f, raw);
    if (error) return setErr(error);
    setErr(null);
    setSaving(true);
    const ok = await ui.fill(t, clean!);
    setSaving(false);
    if (ok) onClose();
  };
  const simple = f.kind !== "choice";
  const body = (
    <>
      <FieldInput f={f} value={value} onChange={(v) => (setValue(v), setErr(null))} onSave={save} autoFocus big={ui.layout === "phone"} />
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
      Add {labelFor(f).toLowerCase()} <span className="tp-ed-co">{company}</span>
    </span>
  );
  if (ui.layout === "phone")
    return (
      <Sheet
        title={title}
        onClose={onClose}
        footer={
          <div className="tp-ed-foot">
            <span className={`tp-earn-note${earn.capped ? " capped" : ""}`}>{earn.text}</span>
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
    <Anchored anchor={anchor} onClose={onClose} width={f.kind === "choice" ? 320 : 300} className="tp-editor">
      <div className="tp-ed-head">{title}</div>
      {body}
      <div className="tp-ed-foot">
        <span className="tp-ed-keys">{simple ? "Enter to save, Esc to cancel" : "Pick one, Esc to cancel"}</span>
        <span className={`tp-earn-note${earn.capped ? " capped" : ""}`}>{saving ? "Saving" : earn.text}</span>
      </div>
    </Anchored>
  );
}
