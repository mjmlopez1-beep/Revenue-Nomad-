"use client";

/** The new design's small parts, shared by its pages: the title band, a company's logo, the fit ring, chips, the row menu. */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CompanyLogo } from "../../ui/shared";
import type { CoInfo } from "../model";
import { Art, type ArtName } from "./illustrations";
import { Ic, type IconName } from "./icons";
import { fitCls, initialsOf, relCls, tintOf, type RelBand } from "./model";

export const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** The compact title band: eyebrow, the display heading, a line, and a small scene at the right. */
export function Band({ art, eyebrow, ec, title, lede, extra, tight }: { art?: ArtName; eyebrow?: ReactNode; ec?: string; title: ReactNode; lede?: ReactNode; extra?: ReactNode; tight?: boolean }) {
  return (
    <header className={`m-band${tight ? " tight" : ""}`}>
      {art && <Art name={art} className="m-band-art" />}
      {eyebrow && <p className={`m-eyebrow${ec ? ` ${ec}` : ""}`}>{eyebrow}</p>}
      <h1 className="m-display m-h1">{title}</h1>
      {lede && <p className="m-lede">{lede}</p>}
      {extra}
    </header>
  );
}

/** A company's logo at a size: its own (through /api/logo), a lettered tile, or a lock while it is locked. */
export function CoLogo({ i, s = 40 }: { i: CoInfo; s?: number }) {
  return (
    <span className={`m-logo${i.c.hidden ? " locked" : ""}`} style={{ "--s": `${s}px` } as CSSProperties} aria-hidden="true">
      <CompanyLogo name={i.c.hidden ? "Locked company" : i.c.name} domain={i.domain} hidden={i.c.hidden} seed={i.c.id} />
    </span>
  );
}

/** What a fit ring counts: traits matched out of a set (7 for the fit, fewer for a lookalike), each named. */
export interface FitLike {
  n: number;
  of?: number;
  traits: { label: string; on: boolean; value?: string }[];
  band?: string;
}
const fitWords = (f: FitLike) => {
  const of = f.of ?? 7;
  const on = f.traits.filter((t) => t.on).map((t) => t.label);
  const off = f.traits.filter((t) => !t.on).map((t) => t.label);
  const head = `Fit: ${f.n} of ${of} traits match${f.band ? `, ${f.band.toLowerCase()}` : ""}.`;
  const list = [on.length ? `Matched: ${on.join(", ")}.` : "", off.length ? `Not matched: ${off.join(", ")}.` : ""].filter(Boolean).join(" ");
  return { of, head, list };
};

/**
 * Traits matched out of 7 (never a chance of winning): forest at 6 or 7, gold at 4 or 5, quiet
 * below. A small "fit" caption sits under the ring, and hover, focus or a tap shows which traits
 * match and which don't. `inside`: the ring sits in another control (a row that is a button), so it
 * is not a button itself; the row's name carries the whole count and list.
 */
export function FitRing({ fit, lg, am, inside, cap = !lg }: { fit: FitLike; lg?: boolean; am?: boolean; inside?: boolean; cap?: boolean }) {
  const { of, head, list } = fitWords(fit);
  const [show, setShow] = useState<"hover" | "pin" | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const descId = useId();
  useEffect(() => {
    if (!show) return setPos(null);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 280;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, vw - w - 12));
    const up = window.innerHeight - r.bottom < 330 && r.top > 330;
    setPos(up ? { bottom: window.innerHeight - r.top + 8, left } : { top: r.bottom + 8, left });
    const key = (e: KeyboardEvent) => e.key === "Escape" && setShow(null);
    const away = () => setShow(null);
    const out = (e: MouseEvent) => !el.contains(e.target as Node) && setShow(null);
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", out);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", out);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [show]);
  const ringCls = `m-fit${lg ? " lg" : ""}${am ? " am" : fitCls(Math.round((fit.n / of) * 7))}`;
  const style = { "--n": (fit.n / Math.max(1, of)) * 7 } as CSSProperties;
  const ring = (
    <span className={ringCls} style={style} aria-hidden="true">
      {lg ? (
        <>
          {fit.n}
          <small>/{of}</small>
        </>
      ) : (
        `${fit.n}/${of}`
      )}
    </span>
  );
  const body = (
    <>
      {ring}
      {cap && <small className="m-fit-cap">fit</small>}
    </>
  );
  const hover = {
    onMouseEnter: () => setShow((x) => x ?? "hover"),
    onMouseLeave: () => setShow((x) => (x === "hover" ? null : x)),
  };
  const root = typeof document !== "undefined" ? (ref.current?.closest(".ui3") ?? document.body) : null;
  const pop =
    show && pos && root
      ? createPortal(
          <div className="m-fitpop" style={pos} aria-hidden="true">
            <p className="m-fitpop-h">
              <b>
                {fit.n} of {of} traits match
              </b>
              {fit.band && <small>{fit.band}</small>}
            </p>
            <ul>
              {fit.traits.map((t) => (
                <li key={t.label} className={t.on ? "on" : undefined}>
                  <Ic n={t.on ? "check" : "x"} />
                  <span>
                    <b>{t.label}</b>
                    {t.value && <small>{t.value}</small>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-fitpop-f">Fit counts traits matched from facts on file. It is not a chance of winning.</p>
          </div>,
          root,
        )
      : null;
  if (inside)
    return (
      <span ref={ref} className={`m-fitw${lg ? " lg" : ""}`} role="img" aria-label={`${head} ${list}`} {...hover}>
        {body}
        {pop}
      </span>
    );
  return (
    <span ref={ref} className={`m-fitw${lg ? " lg" : ""}`} {...hover}>
      <button
        type="button"
        className="m-fitb"
        aria-label={head}
        aria-describedby={descId}
        onFocus={() => setShow((x) => x ?? "hover")}
        onBlur={() => setShow((x) => (x === "hover" ? null : x))}
        onClick={(e) => {
          e.stopPropagation();
          setShow((x) => (x === "pin" ? null : "pin"));
        }}
      >
        {body}
      </button>
      <span id={descId} className="m-sr">
        {list}
      </span>
      {pop}
    </span>
  );
}

/** Seven segments, `n` on. */
export function Traits({ n, of = 7, am }: { n: number; of?: number; am?: boolean }) {
  return (
    <span className={`m-traits${am ? " am" : ""}`} role="img" aria-label={`${n} of ${of} traits`}>
      {Array.from({ length: of }, (_, k) => (
        <i key={k} className={k < n ? "on" : undefined} />
      ))}
    </span>
  );
}

export function Chip({ kind, icon, dot, children, sm, title }: { kind?: "gold" | "am" | "forest" | "cobalt" | "soft"; icon?: IconName; dot?: boolean; children: ReactNode; sm?: boolean; title?: string }) {
  return (
    <span className={`m-chip${kind ? ` ${kind}` : ""}${sm ? " sm" : ""}`} title={title}>
      {dot && <i className="dot" />}
      {icon && <Ic n={icon} />}
      {children}
    </span>
  );
}

/** A relationship band (never a score), with where it came from. */
export function RelChip({ band, from }: { band: RelBand; from: string }) {
  return (
    <span className={`m-rel ${relCls(band)}`} title={from} tabIndex={0} aria-label={`${band} relationship. ${from}`}>
      {band}
    </span>
  );
}

export function Av({ name, s = 40, you, hid }: { name: string; s?: number; you?: boolean; hid?: boolean }) {
  if (hid)
    return (
      <span className="m-av hid" style={{ "--s": `${s}px` } as CSSProperties} aria-hidden="true">
        <Ic n="lock" />
      </span>
    );
  return (
    <span className="m-av" style={{ "--s": `${s}px`, "--t": you ? "#2f7a5f" : tintOf(name), ...(you ? { color: "#fff" } : {}) } as CSSProperties} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/* ---------- the row's "..." menu: a popover on wider screens, a sheet on phones ---------- */

export interface MenuItem {
  icon: IconName;
  label: string;
  sub?: string;
  disabled?: boolean;
  onClick: () => void;
}
export function RowMenu({ label, items, title }: { label: string; items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = btn.current!.getBoundingClientRect();
    const w = 290;
    const left = Math.max(12, Math.min(r.right - w, document.documentElement.clientWidth - w - 12));
    const below = window.innerHeight - r.bottom > 300;
    setPos(below ? { top: r.bottom + 6, left } : { bottom: window.innerHeight - r.top + 6, left });
    box.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), btn.current?.focus());
    const out = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const away = () => setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", out);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", out);
      window.removeEventListener("resize", away);
    };
  }, [open]);
  return (
    <>
      <button type="button" className="m-more" ref={btn} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((x) => !x)}>
        <Ic n="dots" />
      </button>
      {open && (
        <>
          <div className="m-menu-scrim" onClick={() => setOpen(false)} />
          <div className="m-menu" role="menu" ref={box} style={pos ? { position: "fixed", ...pos } : { position: "fixed", visibility: "hidden" }}>
            {title && <p className="u3-menu-t">{title}</p>}
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                <Ic n={it.icon} />
                <span>
                  <b>{it.label}</b>
                  {it.sub && <small>{it.sub}</small>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** A quiet "loading" panel (counted as busy by the screenshot harness). */
export function Wait({ line = "Loading" }: { line?: string }) {
  return (
    <div className="u3-wait" role="status" aria-busy>
      <span className="m-small">{line}</span>
    </div>
  );
}
