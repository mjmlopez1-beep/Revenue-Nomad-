"use client";

/**
 * Shared client pieces for Trading Post: the API client, toasts, company logos,
 * lock and add pills, value formatting and a small icon set.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Action, Cell, Me, PersonRec, View } from "@/lib/tableTypes";
import { fieldDef, type Entity } from "@/lib/tableFields";

export type { Action, Cell, View } from "@/lib/tableTypes";
export type ActResult = { ok: boolean; message: string; id?: string; capped?: boolean };
export type Act = (a: Action, opts?: { quiet?: boolean }) => Promise<ActResult>;

/** One cell an action changed. */
export type CellPatch = { id: string; field: string; cell: Cell; entity?: string };
/** What a POST may return besides its message: the changed cells (a list, or keyed "id.field") and the member's new numbers. */
export type ActPatch = { cells?: CellPatch[] | Record<string, Cell> | null; me?: Partial<Me> | null };

/**
 * Apply an action's changes to the view without a refetch. Only the companies that own a
 * changed cell get new objects (along the path to the cell); every other company keeps its
 * identity, so memoized rows can skip rendering.
 */
export function patchView(v: View, r: ActPatch): View {
  const me = r.me && v.me ? { ...v.me, ...r.me } : v.me;
  const list: CellPatch[] = Array.isArray(r.cells)
    ? r.cells
    : r.cells
      ? Object.entries(r.cells).map(([k, cell]) => {
          const dot = k.lastIndexOf(".");
          return { id: k.slice(0, dot), field: k.slice(dot + 1), cell };
        })
      : [];
  const byId = new Map<string, CellPatch[]>();
  for (const c of list) {
    if (!c || !c.id || !c.field || !c.cell) continue;
    const l = byId.get(c.id);
    if (l) l.push(c);
    else byId.set(c.id, [c]);
  }
  if (!byId.size) return me === v.me ? v : { ...v, me };
  const setCells = (cells: Record<string, Cell>, id: string) => {
    const ch = byId.get(id);
    if (!ch) return cells;
    const next = { ...cells };
    for (const c of ch) next[c.field] = c.cell;
    return next;
  };
  const personHit = (p: PersonRec) => byId.has(p.id);
  const patchPerson = (p: PersonRec) => (personHit(p) ? { ...p, cells: setCells(p.cells, p.id) } : p);
  let changed = false;
  const companies = v.companies.map((c) => {
    const engHit = c.engagements.some((e) => byId.has(e.id) || e.people.some(personHit));
    const pplHit = c.people.some(personHit);
    if (!byId.has(c.id) && !engHit && !pplHit) return c;
    changed = true;
    return {
      ...c,
      cells: setCells(c.cells, c.id),
      people: pplHit ? c.people.map(patchPerson) : c.people,
      engagements: engHit
        ? c.engagements.map((e) =>
            byId.has(e.id) || e.people.some(personHit)
              ? { ...e, cells: setCells(e.cells, e.id), people: e.people.some(personHit) ? e.people.map(patchPerson) : e.people }
              : e,
          )
        : c.engagements,
    };
  });
  return { ...v, me, companies: changed ? companies : v.companies };
}

/* ---------- API ---------- */

export async function getView(): Promise<View> {
  const r = await fetch("/api/table", { cache: "no-store" });
  return r.json();
}

/** POST to /api/table. Returns the JSON body, with `error` set on failure. */
export async function post<T = Record<string, unknown>>(body: unknown): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "Something went wrong. Try again." };
  } catch {
    return { error: "Network problem. Check your connection and try again." } as T & { error: string };
  }
}

/* ---------- toasts ---------- */

type Toast = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 6000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.err ? " toast-err" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- formatting ---------- */

export const initials = (s: string) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const HUES = [152, 200, 265, 25, 330, 175, 45];
export const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/** "2024-03" -> "Mar 2024", "2024" -> "2024", "Ongoing" stays. */
export const fmtMonth = (m: string) => {
  if (/^\d{4}$/.test(m)) return m;
  const [y, mo] = m.split("-").map(Number);
  return y && mo ? new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : m;
};

/** Display text for a visible value. */
export function fmtValue(entity: Entity, key: string, v: string): string {
  const f = fieldDef(entity, key);
  if (!f) return v;
  if (f.kind === "month" || f.kind === "monthOrOngoing") return fmtMonth(v);
  if (key === "hours") return `${v} hrs/wk`;
  return v;
}

/** Link target for a visible URL/email/phone value, else null. */
export function hrefFor(entity: Entity, key: string, v: string): string | null {
  const f = fieldDef(entity, key);
  if (!f) return null;
  if (f.kind === "url") return /^https?:\/\//.test(v) ? v : `https://${v}`;
  if (f.kind === "email") return `mailto:${v}`;
  if (f.kind === "phone") return `tel:${v.replace(/[^\d+]/g, "")}`;
  return null;
}

/** The visible value of a cell, or null. */
export const val = (c: Cell | undefined) => (c && c.s === "value" ? c.v : null);

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ---------- company logo ---------- */

export function CompanyLogo({ name, domain, size = "md" }: { name: string; domain: string | null; size?: "md" | "lg" }) {
  const sources = useMemo(
    () =>
      domain
        ? [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`]
        : [],
    [domain],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [domain]);
  const cls = `logo${size === "lg" ? " logo-lg" : ""}`;
  if (idx >= sources.length)
    return (
      <span className={cls} aria-hidden style={{ background: `hsl(${hue(name)} 55% 93%)`, color: `hsl(${hue(name)} 45% 28%)`, borderColor: "transparent" }}>
        {initials(name)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      src={sources[idx]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(e) => idx === 0 && e.currentTarget.naturalWidth <= 16 && setIdx(1)}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

/* ---------- pills ---------- */

/** A locked fact. Never shows the value; one click unlocks it for 1 credit. */
export function LockPill({ onUnlock, ver, label = "Unlock", busy }: { onUnlock?: () => void; ver?: number; label?: string; busy?: boolean }) {
  const title = `1 credit${ver ? `. Confirmed by ${ver}.` : ""}`;
  if (!onUnlock)
    return (
      <span className="lock" title={title}>
        <IconLock /> <span className="lock-cost">1</span>
      </span>
    );
  return (
    <button type="button" className="lock" title={title} disabled={busy} onClick={(e) => (e.stopPropagation(), onUnlock())}>
      <IconLock /> {label} <span className="lock-cost">1</span>
    </button>
  );
}

/** A missing fact. Adding it earns 1 credit (no badge once today's earning cap is reached). */
export function AddPill({ onAdd, label = "Add", earn = true }: { onAdd: () => void; label?: string; earn?: boolean }) {
  return (
    <button type="button" className="add" onClick={(e) => (e.stopPropagation(), onAdd())}>
      + {label}
      {earn && <span className="plus1">+1</span>}
    </button>
  );
}

/* ---------- brand ---------- */

export function Brand({ dark }: { dark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dark ? "/brand/logo-on-dark.png" : "/brand/logo.png"} alt="Revenue Nomad" width={170} height={19} style={{ height: 19, width: "auto", display: "block" }} />
  );
}

/* ---------- icons (16px, stroke = currentColor) ---------- */

const svg = (d: ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const IconLock = ({ size = 12 }: { size?: number }) => svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, size);
export const IconSearch = ({ size = 16 }: { size?: number }) => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, size);
export const IconX = ({ size = 16 }: { size?: number }) => svg(<path d="M18 6 6 18M6 6l12 12" />, size);
export const IconCheck = ({ size = 14 }: { size?: number }) => svg(<path d="m5 12 5 5L20 7" />, size);
export const IconPlus = ({ size = 14 }: { size?: number }) => svg(<path d="M12 5v14M5 12h14" />, size);
export const IconFilter = ({ size = 16 }: { size?: number }) => svg(<path d="M3 5h18l-7 8v6l-4 2v-8z" />, size);
export const IconChevron = ({ size = 14, dir = "down" }: { size?: number; dir?: "down" | "right" | "left" | "up" }) =>
  svg(<path d={{ down: "m6 9 6 6 6-6", right: "m9 6 6 6-6 6", left: "m15 6-6 6 6 6", up: "m6 15 6-6 6 6" }[dir]} />, size);
export const IconStar = ({ size = 16, filled }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
  </svg>
);
export const IconLink = ({ size = 14 }: { size?: number }) => svg(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>, size);
export const IconUsers = ({ size = 14 }: { size?: number }) => svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>, size);
export const IconBriefcase = ({ size = 14 }: { size?: number }) => svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>, size);
export const IconCoin = ({ size = 14 }: { size?: number }) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 2-3 1-3 2 1.3 1.8 3 1.8 3-.8 3-1.8" /></>, size);
export const IconMenu = ({ size = 18 }: { size?: number }) => svg(<path d="M4 7h16M4 12h16M4 17h16" />, size);
export const IconExternal = ({ size = 12 }: { size?: number }) => svg(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>, size);
