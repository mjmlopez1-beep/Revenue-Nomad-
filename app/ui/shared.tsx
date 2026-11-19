"use client";

/**
 * Shared client pieces for Merlin: the API client, toasts, company logos,
 * the locked cell and the add pill, value formatting and a small icon set.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Action, Cell, CompanyRec, LedgerRow, Me, PersonRec, View } from "@/lib/tableTypes";
import { fieldDef, type Entity } from "@/lib/tableFields";
import { webLink } from "@/lib/links";
import { unpackView } from "@/lib/viewWire";

export type { Action, Cell, View } from "@/lib/tableTypes";
export type ActResult = { ok: boolean; message: string; id?: string; capped?: boolean };
/**
 * Run an action. `quiet`: no toast for the success message (the caller says it). `silentError`:
 * no toast for a refusal either, for a caller that shows the error in place (a form under its
 * button). The result carries the message either way.
 */
export type ActOpts = { quiet?: boolean; silentError?: boolean };
export type Act = (a: Action, opts?: ActOpts) => Promise<ActResult>;

/** One cell an action changed. */
export type CellPatch = { id: string; field: string; cell: Cell; entity?: string };
/**
 * What a POST may return besides its message: the changed cells (a list, or keyed "id.field"),
 * the member's new numbers (the whole Me on a current server), and the records the action
 * touched as the member now sees them, with the credit history rows it wrote (ActionResult in
 * lib/tableTypes.ts). `version` and `partial` say whether the page should load the table again.
 */
export type ActPatch = {
  cells?: CellPatch[] | Record<string, Cell> | null;
  me?: Partial<Me> | null;
  companies?: CompanyRec[] | null;
  ledgerNew?: LedgerRow[] | null;
  benchmarks?: View["benchmarks"];
  scan?: View["scan"];
  reported?: View["reported"];
  version?: string;
  partial?: boolean;
};

/** The order the server sends companies in: best fit first, then by name. */
const before = (a: CompanyRec, b: CompanyRec) => b.friendly.score - a.friendly.score || a.name.localeCompare(b.name);

/**
 * Apply an action's changes to the view without a refetch. Only the companies that own a
 * changed cell get new objects (along the path to the cell), and a company the answer sent
 * whole takes the place of the one on screen (a new one goes where the server would list it);
 * every other company keeps its identity, so memoized rows can skip rendering.
 */
export function patchView(v: View, r: ActPatch): View {
  const next = patchCells(v, r);
  // A company named for one search only (CompanyRec.found) never goes into the tables.
  const recs = r.companies?.filter((c) => c && c.id && !c.found) ?? [];
  if (!recs.length && !r.ledgerNew?.length && !r.benchmarks && !r.scan && !r.reported) return next;
  let companies = next.companies;
  if (recs.length) {
    const sent = new Map(recs.map((c) => [c.id, c]));
    const placed = new Set<string>();
    companies = companies.map((c) => {
      const n = sent.get(c.id);
      if (!n) return c;
      placed.add(c.id);
      return n;
    });
    for (const c of recs) {
      if (placed.has(c.id)) continue;
      const at = companies.findIndex((x) => before(c, x) < 0);
      companies = at < 0 ? [...companies, c] : [...companies.slice(0, at), c, ...companies.slice(at)];
    }
  }
  return {
    ...next,
    companies,
    ...(r.ledgerNew?.length ? { ledger: [...r.ledgerNew, ...next.ledger] } : {}),
    ...(r.benchmarks ? { benchmarks: r.benchmarks } : {}),
    ...(r.scan ? { scan: r.scan } : {}),
    ...(r.reported ? { reported: r.reported } : {}),
  };
}

/** The changed cells and the member's numbers, applied in place of the old ones. */
function patchCells(v: View, r: ActPatch): View {
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

/** The raw answer of GET /api/table. It can be an error body ({ error }): prefer fetchView. */
export async function getView(): Promise<View> {
  const r = await fetch("/api/table?compact=1", { cache: "no-store" });
  const j = await r.json();
  return j && Array.isArray(j.companies) ? unpackView(j) : j;
}

/**
 * GET /api/table, read safely. Any answer without a table in it (a 503 while the server is
 * busy or paused, a 429, a page from a proxy) comes back as `error`, never as a view, with the
 * seconds the server asked us to wait (Retry-After) when it sent them. Throws only when the
 * network is down.
 */
export type ViewResult = { view: View; error?: undefined } | { view: null; error: string; status: number; retryAfter: number | null };
export async function fetchView(): Promise<ViewResult> {
  // Without its empty cells on the wire (lib/viewWire.ts), put back here.
  const r = await fetch("/api/table?compact=1", { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as (View & { error?: string }) | null;
  if (r.ok && j && j.stats) return { view: Array.isArray(j.companies) ? unpackView(j) : j };
  const wait = Number(r.headers.get("Retry-After"));
  return {
    view: null,
    error: (j && typeof j.error === "string" && j.error) || "Merlin did not load. Check your connection and try again.",
    status: r.status,
    retryAfter: Number.isFinite(wait) && wait > 0 ? wait : null,
  };
}

/** POST to /api/table. Returns the JSON body, with `error` set on failure. */
export async function post<T = Record<string, unknown>>(body: unknown): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." } as T & { error: string };
  }
}

/* ---------- toasts ---------- */

/**
 * A toast can carry one action ("Undo") and its own time on screen. The action closes the
 * toast when tapped. Without opts a toast is text only, as before.
 */
export type ToastOpts = { action?: { label: string; onClick: () => void }; ms?: number };
type Toast = { id: number; text: string; err?: boolean; action?: ToastOpts["action"] };
export type ToastFn = (text: string, err?: boolean, opts?: ToastOpts) => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

/**
 * How long a toast stays up. Toasts are whole sentences now, so the time grows with the words:
 * 4.2 seconds at least (6 for an error), about a quarter of a second more per word, 10 at most.
 */
export const toastMs = (text: string, err?: boolean) =>
  Math.min(10_000, Math.max(err ? 6000 : 4200, 2400 + text.trim().split(/\s+/).length * 230 + (err ? 1200 : 0)));

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const drop = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<ToastFn>(
    (text, err, opts) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-1), { id, text, err, action: opts?.action }]);
      setTimeout(() => drop(id), opts?.ms ?? toastMs(text, err));
    },
    [drop],
  );
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          // A toast with an action has the same look as the Undo toast (globals.css .toast-act, .toast-btn).
          <div key={t.id} className={`toast${t.err ? " toast-err" : ""}${t.action ? " toast-act" : ""}`}>
            {t.action ? <span className="toast-t">{t.text}</span> : t.text}
            {t.action && (
              <button
                type="button"
                className="toast-btn"
                onClick={() => {
                  drop(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- formatting ---------- */

/**
 * A figure in the number face: the text face with digits that line up in a column (.num in
 * globals.css). Commas, periods and colons keep their own width, so "$7.5k" and "1,024" read
 * as they should.
 */
export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

export const initials = (s: string) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
/** Tints for a company with no logo. None is near ember (hue 16): orange means an open role here. */
const HUES = [152, 200, 265, 230, 330, 175, 48];
export const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/** "2024-03" -> "Mar 2024", "2024" -> "2024", "Ongoing" stays. */
/** "2025-03" as "Mar 2025". Kept once worked out: a table of a few thousand seats asks for the same months over and over. */
const monthText = new Map<string, string>();
export const fmtMonth = (m: string) => {
  if (/^\d{4}$/.test(m)) return m;
  let out = monthText.get(m);
  if (out === undefined) {
    const [y, mo] = m.split("-").map(Number);
    out = y && mo ? new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : m;
    if (monthText.size < 5000) monthText.set(m, out);
  }
  return out;
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
  // https:// added to a stored "acme.com/jobs/1"; javascript:, data: and anything else that is not a web address is no link.
  if (f.kind === "url") return webLink(v);
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

/* ---------- a locked company ---------- */

/*
 * A company the member has not unlocked (every company is locked until they know it). The server
 * never sends its name, site or logo, only HIDDEN_COMPANY and an opaque public id. What the member sees is made up
 * here from that id alone: letters of a plausible length, blurred, so the row reads as a real
 * company they can't see yet. Each id gets its own shape, so a page of them doesn't repeat.
 */
const ONSET = ["b", "br", "c", "cl", "d", "dr", "f", "fl", "g", "gr", "h", "j", "k", "l", "m", "n", "p", "pr", "r", "s", "st", "t", "tr", "v", "w", "z"];
const VOWEL = ["a", "e", "i", "o", "u", "a", "e", "o", "ai", "ea", "io", "y"];
const CODA = ["", "", "", "n", "r", "l", "s", "x", "m", "nd", "st", "k"];

/** A small seeded random source (FNV-1a over the seed, then a 32-bit mix). */
function seeded(seed: string) {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

type LockedLook = { name: string; site: string; hue: number; mark: string };
const lockedCache = new Map<string, LockedLook>();
/** A made-up name, site, tile color and two letters for a locked company, from its public id. */
export function lockedLook(seed: string): LockedLook {
  const hit = lockedCache.get(seed);
  if (hit) return hit;
  const r = seeded(seed || "locked");
  const pick = (xs: string[]) => xs[Math.floor(r() * xs.length)];
  const word = (min: number, max: number) => {
    const want = min + Math.floor(r() * (max - min + 1));
    let w = "";
    while (w.length < want - 1) w += pick(ONSET) + pick(VOWEL);
    w = (w + pick(CODA)).slice(0, max);
    return w[0].toUpperCase() + w.slice(1);
  };
  const first = word(4, 10);
  const name = r() < 0.3 ? `${first} ${word(3, 6)}` : first;
  const look = { name, site: `${first.toLowerCase()}${pick([".com", ".com", ".com", ".io", ".co"])}`, hue: Math.floor(r() * 360), mark: initials(name) };
  lockedCache.set(seed, look);
  return look;
}

/** What a screen reader hears in place of a locked company's name. */
export const LOCKED_SAY = "Company locked, 2 credits to unlock";

/**
 * A locked company's name: made-up letters, blurred, that nobody can select or read aloud,
 * and a visually hidden label for screen readers. `seed` is the company's public id.
 */
export function LockedName({ seed, className }: { seed: string; className?: string }) {
  return (
    <span className={`locked-name${className ? ` ${className}` : ""}`}>
      <span className="locked-blur" aria-hidden>
        {lockedLook(seed).name}
      </span>
      <span className="sr-only">{LOCKED_SAY}</span>
    </span>
  );
}

/** A locked company's website line: a made-up domain, blurred. Silent for screen readers (the name already says it). */
export function LockedSite({ seed, className }: { seed: string; className?: string }) {
  return (
    <span className={`locked-site mono${className ? ` ${className}` : ""}`} aria-hidden>
      <span className="locked-blur">{lockedLook(seed).site}</span>
    </span>
  );
}

/* ---------- company logo ---------- */

/** A company's public id (lib/table.ts pubId), the only thing GET /api/logo/<id> takes. */
const COMPANY_ID = /^c_[\w-]{6,40}$/;

/**
 * `hidden`: a locked company's logo. The page never has its domain, so the image comes from our
 * own GET /api/logo/<id> (lib/logo.ts), which fetches the icon on the server and sends only its
 * bytes. `seed` is the company's public id. With no logo (a 404, or a blank 16px icon) it is a
 * plain soft tile in a color from the id, with a quiet building in it: never letters, which would
 * read as a real mark. `noLogo`: the tile only (the landing page's rows have no company id).
 * A company the member can name keeps the icon services' addresses with its domain, as before.
 */
export function CompanyLogo({
  name,
  domain,
  size = "md",
  hidden,
  seed,
  noLogo,
}: {
  name: string;
  domain: string | null;
  size?: "md" | "lg";
  hidden?: boolean;
  seed?: string;
  noLogo?: boolean;
}) {
  const sources = useMemo(
    () =>
      hidden
        ? seed && !noLogo && COMPANY_ID.test(seed)
          ? [`/api/logo/${encodeURIComponent(seed)}`]
          : []
        : domain
          ? [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`]
          : [],
    [domain, hidden, seed, noLogo],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [domain, hidden, seed]);
  const cls = `logo${size === "lg" ? " logo-lg" : ""}`;
  if (hidden) {
    if (idx < sources.length)
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={cls}
          src={sources[idx]}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          // A blank or tiny icon is no logo: the tile instead.
          onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setIdx(sources.length)}
          onError={() => setIdx(sources.length)}
        />
      );
    return (
      <span className={`${cls} logo-locked`} aria-hidden style={{ ["--lk" as string]: lockedLook(seed ?? name).hue }}>
        <span className="logo-locked-in">
          <IconBuilding size={size === "lg" ? 20 : 14} />
        </span>
      </span>
    );
  }
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

/**
 * A locked fact. It never shows the value. At rest: a small lock and a masked bar. On hover
 * and focus (always, on touch screens): "Unlock · 1 credit". One click or tap spends the credit.
 * `what` names the fact for the tooltip and screen readers ("the role", "this company").
 * `noun` is added to the label where one lock stands for more ("Unlock company"). A tight
 * spot can hide it (.lock-noun). `later`: today's unlocks are used up (credits left), so it reads
 * "Unlocks again tomorrow" and a click does nothing. `broke`: 0 credits, so it reads "Earn a credit
 * to unlock" (the click still runs, to show how to earn one). The same states as the app's Lock.
 */
export function LockPill({
  onUnlock,
  ver,
  what,
  noun,
  busy,
  from,
  later,
  broke,
}: {
  onUnlock: () => void;
  ver?: number;
  what?: string;
  noun?: string;
  busy?: boolean;
  /** Where a fact with no member confirmations came from (Cell.from). */
  from?: "records" | "posting";
  later?: boolean;
  broke?: boolean;
}) {
  const say = later ? "You've used today's unlocks. Unlocks again tomorrow" : broke ? `Earn a credit to unlock ${what ?? "this"}` : `Unlock ${what ?? "this"} for 1 credit`;
  const source = from === "records" ? "From Revenue Nomad records." : from === "posting" ? "From the job posting." : "";
  return (
    <button
      type="button"
      className={`lock${busy ? " busy" : ""}${later ? " later" : ""}${broke ? " broke" : ""}`}
      title={ver ? `${say}. Confirmed by ${ver} ${ver === 1 ? "member" : "members"}.` : source ? `${say}. ${source}` : say}
      aria-label={busy ? "Unlocking" : say}
      aria-disabled={later || undefined}
      disabled={busy}
      onClick={(e) => (e.stopPropagation(), !later && onUnlock())}
    >
      <span className="lock-rest" aria-hidden>
        <IconLock />
        <span className="lock-mask" />
      </span>
      <span className="lock-cta" aria-hidden>
        <IconLock />
        {later ? (
          <span>Unlocks again tomorrow</span>
        ) : broke && !busy ? (
          <span>Earn a credit to unlock</span>
        ) : (
          <>
            <span>
              {busy ? "Unlocking" : "Unlock"}
              {!busy && noun && <span className="lock-noun"> {noun}</span>}
            </span>
            {!busy && <span className="lock-cost">· 1 credit</span>}
          </>
        )}
      </span>
    </button>
  );
}

/**
 * A missing fact. Adding it earns 1 credit (no badge once today's earning cap is reached).
 * `what` names the fact for screen readers ("the HQ"): "Add the HQ. Earns 1 credit."
 */
export function AddPill({ onAdd, label = "Add", earn = true, what }: { onAdd: () => void; label?: string; earn?: boolean; what?: string }) {
  return (
    <button type="button" className="add" aria-label={what ? `Add ${what}.${earn ? " Earns 1 credit." : ""}` : undefined} onClick={(e) => (e.stopPropagation(), onAdd())}>
      + {label}
      {earn && <span className="plus1">+1</span>}
    </button>
  );
}

/* ---------- brand ---------- */

/**
 * The Merlin logo: the Revenue Nomad mark, MERLIN, and REVENUE NOMAD set under it. "wordmark" and
 * "lockup" are the same logo (kept as two names for the places that use them), "mark" is the square
 * icon (the tightest phone bar). `dark` is the all-white version for pine. `size` is the CSS height.
 */
const BRAND_RATIO = { wordmark: 811 / 240, lockup: 811 / 240, mark: 1 } as const;
export function Brand({ dark, size = 28, kind = "wordmark", className }: { dark?: boolean; size?: number; kind?: keyof typeof BRAND_RATIO; className?: string }) {
  const src = kind === "mark" ? "/brand/merlin-icon-512.png" : `/brand/merlin-${kind}${dark ? "-on-dark" : ""}.png`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt="Merlin by Revenue Nomad"
      width={Math.round(size * BRAND_RATIO[kind])}
      height={size}
      style={{ height: size, width: "auto", display: "block" }}
    />
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
export const IconBuilding = ({ size = 14 }: { size?: number }) =>
  svg(<><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" /><path d="M15 10h3a1 1 0 0 1 1 1v10" /><path d="M3 21h18" /><path d="M9 8h2M9 12h2M9 16h2" /></>, size);
export const IconCoin =({ size = 14 }: { size?: number }) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 2-3 1-3 2 1.3 1.8 3 1.8 3-.8 3-1.8" /></>, size);
export const IconMenu = ({ size = 18 }: { size?: number }) => svg(<path d="M4 7h16M4 12h16M4 17h16" />, size);
export const IconExternal = ({ size = 12 }: { size?: number }) => svg(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>, size);
export const IconPencil = ({ size = 12 }: { size?: number }) => svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>, size);

/** A refusal that is a limit, not a mistake (today's unlocks are used up): a calm notice, never a red toast. */
export const calmRefusal = (msg: string) => /^You've unlocked \d+ facts today|^You've reached today's unlock limit|^You can unlock \d+ more today/.test(msg);
