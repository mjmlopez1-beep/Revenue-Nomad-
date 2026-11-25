"use client";

/**
 * The work pages' shared parts (RN_UI3), in find-design/v5/work.html's classes:
 *
 *   WorkMain      the page's <main> (.w3 scopes work.css), and its breadcrumb in the top bar
 *   Band          the compact title band with the module's scene at the right
 *   Chips         filter chips with counts, one on at a time (forest when on)
 *   Tabs          tabs with counts
 *   RowActs       one visible primary action and the "..." menu
 *   Menu          the "..." menu itself (Esc and a click outside close it)
 *   Sheet, Drawer a dialog in the middle, a panel from the right (a full sheet on phones)
 *   Switch, St    an on/off switch; a status pill in the one color map (COLOR-MAP.md)
 *   CoMark, Av    a company's logo (its own, a lettered tile, or a lock), a person's initials
 *
 * Nothing here holds data: each page reads and acts through the app's own APIs.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CompanyLogo } from "../../../ui/shared";
import type { CoInfo } from "../../model";
import type { Crumb } from "../../shell/Header";
import { useApp } from "../../shell/pages";
import { useUi3Head } from "../head";
import { initialsOf, tintOf } from "../model";
import { WArt, type WorkArt } from "./art";
import { WIc, type WIconName } from "./icons";
import "./work.css";
import "./w3.css";

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The page's <main>, and its crumbs (Work or Community, then the page) in the new top bar. */
export function WorkMain({ group, title, crumbs, cls, children }: { group: "Work" | "Community"; title: string; crumbs?: Crumb[]; cls?: string; children: ReactNode }) {
  const c = useApp();
  useUi3Head([{ label: group }, ...(crumbs ?? [])], title);
  return (
    <main className={`tp-main tp-main-page u3 u3p w3${cls ? ` ${cls}` : ""}${c.phone ? " w3-phone" : ""}`} id="tp-page">
      {children}
    </main>
  );
}

/**
 * The compact title band: the display heading, one line, and the module's scene at the density the
 * owner set (round 9: the deeper into productive work, the less decoration). "minimal" is a small
 * scene (Pipeline, Proposals); "none" is no scene at all (Contracts, the workflow builder).
 */
export function Band({ art, density = "moderate", title, sub, eyebrow, extra, cls }: { art?: WorkArt; density?: "moderate" | "minimal" | "none"; title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; extra?: ReactNode; cls?: string }) {
  return (
    <section className={`m-band tight ${cls ?? "ex-band"} w3-band-${density}`}>
      {art && density !== "none" && <WArt name={art} className="m-band-art" />}
      {eyebrow}
      <h1 className="m-display m-h1">{title}</h1>
      {sub && <p className="m-sub">{sub}</p>}
      {extra}
    </section>
  );
}

export interface ChipDef<K extends string> {
  k: K;
  label: string;
  n?: number;
}
/** Filter chips with counts: one on at a time. */
export function Chips<K extends string>({ items, on, set, label = "Show", cls }: { items: ChipDef<K>[]; on: K; set: (k: K) => void; label?: string; cls?: string }) {
  return (
    <div className={`m-fchips w-chiprow${cls ? ` ${cls}` : ""}`} role="group" aria-label={label}>
      {items.map((x) => (
        <button key={x.k} type="button" className="m-fchip" aria-pressed={on === x.k} onClick={() => set(x.k)}>
          {x.label}
          {x.n != null ? ` (${x.n})` : ""}
        </button>
      ))}
    </div>
  );
}

/** Tabs with counts. */
export function Tabs<K extends string>({ items, on, set, label }: { items: ChipDef<K>[]; on: K; set: (k: K) => void; label: string }) {
  return (
    <div className="m-tabs w-tabs" role="tablist" aria-label={label}>
      {items.map((x) => (
        <button key={x.k} type="button" role="tab" className="m-tab" aria-selected={on === x.k} onClick={() => set(x.k)}>
          {x.label}
          {x.n != null && <span className="m-tc">{x.n}</span>}
        </button>
      ))}
    </div>
  );
}

export type MenuItem = { t: string; icon?: WIconName; go: () => void; danger?: boolean; sub?: string } | "-";

/** The "..." menu: opens under its button, Esc or a click outside closes it. */
export function Menu({ anchor, items, onClose }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = 248;
    const hgt = ref.current?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    const below = r.bottom + 6 + hgt < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - hgt - 6), left });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose(), anchor.focus());
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);
  return (
    <>
    <div className="m-menu-scrim" onClick={onClose} />
    <div ref={ref} className="m-menu w-menu" role="menu" style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {items.map((x, i) =>
        x === "-" ? (
          <hr key={i} />
        ) : (
          <button key={i} type="button" role="menuitem" className={x.danger ? "w-btn-danger" : undefined} onClick={() => (onClose(), x.go())}>
            {x.icon && <WIc n={x.icon} />}
            <span>
              {x.t}
              {x.sub && <small>{x.sub}</small>}
            </span>
          </button>
        ),
      )}
    </div>
    </>
  );
}

/** A "..." button and its menu. */
export function More({ items, label }: { items: MenuItem[] | (() => MenuItem[]); label: string }) {
  const [at, setAt] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" className="m-more" aria-label={label} aria-haspopup="menu" aria-expanded={!!at} onClick={(e) => (e.stopPropagation(), setAt((a) => (a ? null : e.currentTarget)))}>
        <WIc n="more" />
      </button>
      {at && <Menu anchor={at} items={typeof items === "function" ? items() : items} onClose={() => setAt(null)} />}
    </>
  );
}

/** One visible primary action and the "..." menu. */
export function RowActs({ primary, kind = "secondary", onPrimary, busy, items, label }: { primary?: string | null; kind?: "primary" | "secondary"; onPrimary?: () => void; busy?: boolean; items?: MenuItem[] | (() => MenuItem[]); label: string }) {
  return (
    <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
      {primary && (
        <button type="button" className={`m-btn m-btn-sm ${kind === "primary" ? "m-btn-primary" : "m-btn-secondary"}`} aria-busy={busy || undefined} disabled={busy} onClick={onPrimary}>
          {primary}
        </button>
      )}
      {items && <More items={items} label={`More for ${label}`} />}
    </div>
  );
}

/** Esc closes, focus moves in and back. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", key);
      was?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/** A dialog in the middle. */
export function Sheet({ title, onClose, children, foot, lg, label }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; lg?: boolean; label?: string }) {
  const ref = useDialog(onClose);
  return (
    <div className="m-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`m-sheet${lg ? " w-lg" : ""}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : "Dialog")}>
        <div className="w-sh-h">
          <h2 className="m-h3">{title}</h2>
          <button type="button" className="m-iconbtn sm plain" aria-label="Close" onClick={onClose}>
            <WIc n="x" />
          </button>
        </div>
        <div className="w-stack">{children}</div>
        {foot && <div className="m-acts">{foot}</div>}
      </div>
    </div>
  );
}

/** A panel from the right (a full sheet on phones). */
export function Drawer({ head, onClose, children, foot, wide, label }: { head: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean; label: string }) {
  const ref = useDialog(onClose);
  return (
    <>
      <div className="w-drawer-scrim" onClick={onClose} />
      <div ref={ref} className={`w-drawer${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="w-dh">
          <div style={{ flex: 1, minWidth: 0 }}>{head}</div>
          <button type="button" className="m-iconbtn sm plain" aria-label="Close" onClick={onClose}>
            <WIc n="x" />
          </button>
        </div>
        <div className="w-db">{children}</div>
        {foot && <div className="w-df">{foot}</div>}
      </div>
    </>
  );
}

export function Switch({ on, set, label, sm, disabled }: { on: boolean; set: (v: boolean) => void; label: string; sm?: boolean; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`w-switch${sm ? " sm" : ""}`} onClick={(e) => (e.stopPropagation(), set(!on))} />;
}

/** The one color map (COLOR-MAP.md): hot = your move now, forest = done or live, co = out with someone, am = Merlin made it, gold = new or not sent, plain = off or ended. */
export type Tone = "hot" | "forest" | "co" | "am" | "gold" | "";
export function St({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`w-st${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

/** A company's logo: its own (through /api/logo), a lettered tile, or a lock while it is locked. */
export function CoMark({ i, name, s = 40 }: { i?: CoInfo | null; name?: string; s?: number }) {
  const hidden = !!i?.c.hidden;
  const nm = hidden ? "Locked company" : i?.c.name ?? name ?? "";
  return (
    <span className={`m-logo${hidden ? " locked" : ""}`} style={{ "--s": `${s}px` } as CSSProperties} aria-hidden="true">
      <CompanyLogo name={nm || "?"} domain={i?.domain ?? null} hidden={hidden} seed={i?.c.id ?? nm} />
    </span>
  );
}

/** A person's initials on a soft tint (a photo only where the person or the member added one). */
export function Av({ name, s = 40, photo }: { name: string; s?: number; photo?: string | null }) {
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="m-av" src={photo} alt="" style={{ "--s": `${s}px`, objectFit: "cover" } as CSSProperties} />;
  return (
    <span className="m-av" style={{ "--s": `${s}px`, "--t": tintOf(name || "?") } as CSSProperties} aria-hidden="true">
      {initialsOf(name || "?")}
    </span>
  );
}

/** A company the member can see, by id or by exact name (for a logo next to a row that only has a name). */
export function useCoFinder() {
  const c = useApp();
  return (id?: string | null, name?: string | null): CoInfo | null => {
    if (id) {
      const i = c.byId.get(id);
      if (i) return i;
    }
    const nm = name?.trim().toLowerCase();
    return nm ? c.infos.find((i) => !i.c.hidden && i.c.name.toLowerCase() === nm) ?? null : null;
  };
}

/** An empty state: the module's scene, a heading, a line and one action. */
export function Empty({ art, title, children, act }: { art?: WorkArt; title: string; children?: ReactNode; act?: ReactNode }) {
  return (
    <div className={`w-empty${art ? "" : " w3-noart"}`}>
      {art && <WArt name={art} className="w-art" />}
      <div className="w-stack" style={{ gap: 8 }}>
        <b className="w-h4">{title}</b>
        {children && <p className="w-help">{children}</p>}
        {act && <div>{act}</div>}
      </div>
    </div>
  );
}

/** A page that didn't load: said plainly, with Try again. */
export function Failed({ what, error, retry }: { what: string; error: string; retry: () => void }) {
  return (
    <div className="w-empty w3-failed" role="alert">
      <div className="w-stack" style={{ gap: 8, gridColumn: "1 / -1" }}>
        <b className="w-h4">{what} didn&apos;t load</b>
        <p className="w-help">{error}</p>
        <div>
          <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={retry}>
            <WIc n="refresh" /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/** A plan gate: the feature is named, never hidden, with the way to get it. */
export function Gate({ title, children, onPlans, cta = "See plans" }: { title: string; children: ReactNode; onPlans: () => void; cta?: string }) {
  return (
    <div className="w3-gate" role="note">
      <span className="w3-gate-i" aria-hidden="true">
        <WIc n="lock" />
      </span>
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
      <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={onPlans}>
        {cta}
      </button>
    </div>
  );
}

export const Skel = ({ rows = 4 }: { rows?: number }) => (
  <div className="w3-skel" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <i key={i} />
    ))}
  </div>
);
