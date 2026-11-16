"use client";

/**
 * Trading Post, signed in. The shared record of fractional GTM work: who hired, for which
 * seat, who held it, at what rate.
 *
 *   top bar     search, credits, earn meter, "Add what you know", account menu
 *   sidebar     filters with counts (overlay under 1280px, bottom sheet on phones)
 *   content     the next-move card or Get started, record type, views, active filter chips, the table (cards on phones)
 *   pages       Your seats, Your credits, Rate benchmarks (each replaces the table)
 *   overlays    record drawer, add modal, inline fact editor, credits popover
 *
 * One primary action per view: the volt "Add what you know" in the top bar. Ember shows up
 * twice at most (see `emberTaken` below): by default the count on Hiring now and the dot on an
 * open role.
 *
 * The address bar holds the place (see `placeUrl`): v view, t record type, s sort, q search,
 * f filters, c the open company, p the page. A record or a page is a history entry of its own
 * (Back closes it, on every layout); the rest replaces the entry. On phones and tablets the
 * overlay on top (sheet, editor, popover, Add) is one more entry, so Back closes it first.
 * A reload restores all of it. On a phone a new list starts at its top, and coming back to the
 * table returns to where the member was.
 *
 * Keyboard: "/" search, "f" filters, "a" add, J/K steps through records, Esc closes. Arrow
 * keys are left to the browser (they scroll an open record). The single-letter shortcuts can
 * be turned off from the account menu (WCAG 2.1.4), for speech input and for anyone who
 * types into the page by accident.
 */
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/tableTypes";
import type { Me } from "@/lib/tableTypes";
import { IconChevron, IconFilter, IconPlus, IconX, useToast, type Act, type View } from "../ui/shared";
import {
  COMPANY_FILL, EMPTY_FILTERS, RECORD_TYPES, SORTS, TABS, activeChips, activeCount, applyFilters, cellKey, coverOf, deriveAll, hasRoleDates, isOpenSeat, mySeats, newRolesFor,
  notMineLabel, rowsFor, seatsMissing, shown, sortRows,
  type CoInfo, type FactRef, type Filters, type RecordType, type Row, type SortKey, type Tab, type ToggleKey,
} from "./model";
import { atTime, useLayout, useMedia, useStable, useStoredFlag, store, plural } from "./hooks";
import { UiCtx, FactEditor, Anchored, Pro, Sheet, cellFlags, useAllFlags, useLayer, type AddOpts, type AppPage, type Ui } from "./ui";
import { Seats } from "./Seats";
import { NextMove, earnRoom, pickMove, useMoveDismissals } from "./NextMove";
import { AvatarMenu, CreditsPopover, TopBar } from "./TopBar";
import { FilterPanel } from "./Filters";
import { DataTable } from "./Tables";
import { CardList } from "./Cards";
import { Drawer } from "./Drawer";
import { AddModal } from "./AddModal";
import { MyCredits, inviteLink, signInLink, useCopy, useShareInvite } from "./Credits";
import { Benchmarks } from "./Benchmarks";
import { Admin } from "./Admin";
import { fmtStamp } from "./RoleDate";
import { Checklist, Strip, sinceText } from "./Guide";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import "./post.css";

export interface TradingPostProps {
  view: View;
  act: Act;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Where the app opens, read once on mount. "seats" straight after onboarding, when a seat on file carries the member's name. */
  start?: "seats";
}

const PAGE = 50;

/** The previous visit time, read once per page load (then this visit is stored). */
let lastVisit: string | null | undefined;
function previousVisit(): string | null {
  if (lastVisit === undefined) {
    lastVisit = store.get("tp_last_visit");
    store.set("tp_last_visit", new Date().toISOString());
  }
  return lastVisit;
}

/** `returnTo`: the page the record was opened from (the review queue in Your credits, say). Closing the record goes back there. */
type DrawerState = { id: string; rowKey: string; focus: string | null; returnTo?: Page };
type EditorState = { el: HTMLElement; t: FactRef; initial?: string };
type Page = "table" | "credits" | "rates" | "seats" | "metrics";

/* ---------- the place in the address bar ---------- */

const PAGES: Page[] = ["seats", "credits", "rates", "metrics"];
const PAGE_TITLE: Record<Page, string> = { table: "", seats: "Your seats", credits: "Your credits", rates: "Rate benchmarks", metrics: "Pilot metrics" };
const TYPE_PARAM: Record<RecordType, string> = { companies: "companies", engagements: "seats", people: "people" };
const TYPE_TITLE: Record<RecordType, string> = { companies: "Companies", engagements: "Seats", people: "People" };

/**
 * Filters as one short query value: only what differs from no filters, "~" between them. A
 * switch is its key ("rateKnown"), a list is "key:a|b", a number is "key:40". The keys come from
 * EMPTY_FILTERS, so a filter added there round-trips with no change here.
 */
function encodeFilters(f: Filters): string {
  const parts: string[] = [];
  for (const k of Object.keys(EMPTY_FILTERS) as (keyof Filters)[]) {
    const v = f[k];
    if (typeof v === "boolean") {
      if (v) parts.push(k);
    } else if (typeof v === "number") {
      if (v) parts.push(`${k}:${v}`);
    } else if (Array.isArray(v) && v.length) parts.push(`${k}:${v.join("|")}`);
  }
  return parts.join("~");
}
function decodeFilters(s: string): Filters {
  const f = { ...EMPTY_FILTERS } as Record<string, unknown>;
  for (const part of s.split("~")) {
    const at = part.indexOf(":");
    const k = at < 0 ? part : part.slice(0, at);
    const rest = at < 0 ? "" : part.slice(at + 1);
    if (!k || !Object.prototype.hasOwnProperty.call(EMPTY_FILTERS, k)) continue;
    const d = (EMPTY_FILTERS as unknown as Record<string, unknown>)[k];
    if (typeof d === "boolean") f[k] = true;
    else if (typeof d === "number") {
      const n = Number(rest);
      if (Number.isFinite(n)) f[k] = n;
    } else if (Array.isArray(d)) f[k] = rest.split("|").filter(Boolean).slice(0, 50);
  }
  return f as unknown as Filters;
}

/**
 * Filters an onboarding answer turns on ("No Sales seat yet" for a member after adjacent seats,
 * "Seat holder on file" for one after an intro). They narrow the All view only: the other views
 * and their counts ignore them, so Hiring now never reads 0 because of an answer given once.
 */
const PRESET_KEYS: ToggleKey[] = ["notMine", "fractionalNamed"];

/** Where a member lands with nothing in the address bar: set by their onboarding answers. */
function defaultsFor(me: Me) {
  return {
    t: (me.goal === "intro" || me.goal === "roles" ? "engagements" : "companies") as RecordType,
    v: (me.goal === "friendly" ? "friendly" : me.goal === "roles" ? "hiring" : "all") as Tab,
    // Open roles read best newest first.
    s: (me.goal === "roles" ? "newest" : "fit") as SortKey,
    f: { ...EMPTY_FILTERS, notMine: me.goal === "adjacent" && !!me.function, fractionalNamed: me.goal === "intro" } as Filters,
  };
}

/** The place in the address bar now (read on mount and on Back and Forward). */
function readPlace(me: Me) {
  const d = defaultsFor(me);
  const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const t = (Object.keys(TYPE_PARAM) as RecordType[]).find((k) => TYPE_PARAM[k] === q.get("t")) ?? d.t;
  const v = TABS.find((x) => x.key === q.get("v"))?.key ?? d.v;
  const s = SORTS.find((x) => x.key === q.get("s"))?.key ?? d.s;
  const f = q.has("f") ? decodeFilters(q.get("f") === "-" ? "" : q.get("f")!) : d.f;
  const p = PAGES.find((x) => x === q.get("p")) ?? null;
  return { t, v, s, f, q: (q.get("q") ?? "").slice(0, 200), c: q.get("c"), p };
}

/** The address for a place, leaving out what the member's defaults already say. */
function placeUrl(me: Me, x: { t: RecordType; v: Tab; s: SortKey; f: Filters; q: string; c: string | null; p: Page }): string {
  const d = defaultsFor(me);
  const q = new URLSearchParams();
  if (x.v !== d.v) q.set("v", x.v);
  if (x.t !== d.t) q.set("t", TYPE_PARAM[x.t]);
  if (x.s !== d.s) q.set("s", x.s);
  if (x.q.trim()) q.set("q", x.q.trim());
  const f = encodeFilters(x.f);
  if (f !== encodeFilters(d.f)) q.set("f", f || "-");
  if (x.p === "table" && x.c) q.set("c", x.c);
  if (x.p !== "table") q.set("p", x.p);
  const s = q.toString();
  return `${typeof window === "undefined" ? "/" : window.location.pathname}${s ? `?${s}` : ""}`;
}

/** How deep in this app's own history entries we are (0 is the table). */
const entryDepth = () => {
  const d = (typeof window !== "undefined" && window.history.state?.tpd) as unknown;
  return typeof d === "number" ? d : 0;
};
const here = () => window.location.pathname + window.location.search;


export default function TradingPost({ view, act, refresh, signOut, start }: TradingPostProps) {
  const me = view.me!;
  const layout = useLayout();
  const phone = layout === "phone";
  const touch = useMedia("(hover: none) and (pointer: coarse)");
  const toast = useToast();
  const copy = useCopy();

  /* ----- the place: from the address bar, else the member's onboarding answers ----- */
  const [place0] = useState(() => readPlace(me));
  const [recordType, setRecordType] = useState<RecordType>(place0.t);
  const [tab, setTab] = useState<Tab>(place0.v);
  const [filters, setFilters] = useState<Filters>(place0.f);
  const [sort, setSort] = useState<SortKey>(place0.s);
  const [query, setQuery] = useState(place0.q);
  // The input stays instant; the list behind it renders when the main thread is free.
  const q = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE);
  const [page, setPage] = useState<Page>(() => (start === "seats" ? "seats" : place0.p === "metrics" && !view.admin ? "table" : place0.p ?? "table"));
  const [seatFocus, setSeatFocus] = useState<string | null>(null);
  const [moveOff, dismissMove] = useMoveDismissals();

  /* ----- overlays ----- */
  // A link or a reload with ?c= opens that company's record at once (its row is found on mount).
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    place0.c && !place0.p && start !== "seats" && view.companies.some((c) => c.id === place0.c) ? { id: place0.c, rowKey: place0.c, focus: null } : null,
  );
  const [addOpts, setAddOpts] = useState<AddOpts | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pop, setPop] = useState<"credits" | "menu" | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sideDocked, setSideDocked] = useState(true);
  const [sideOverlay, setSideOverlay] = useState(false);
  // Unlocking, just unlocked and pointed-at cells live in a store (cellFlags), so the Ui context keeps its identity and only those cells render again.
  // The shell subscribes too: the record reads them through ui.busy and ui.pulse.
  useAllFlags();
  const [introOff, hideIntro] = useStoredFlag("tp_intro_off");
  const [checkOff, hideCheck] = useStoredFlag("tp_check_off");
  const [sinceOff, setSinceOff] = useState(false);
  const [keysOff, setKeysOff] = useState(() => store.get("tp_keys_off") === "1");

  const searchRef = useRef<HTMLInputElement>(null);
  const creditsRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  /** Just above the list's controls: where a new list starts when the window scrolls. */
  const listTopRef = useRef<HTMLDivElement>(null);

  /* ----- data ----- */
  const infos = useMemo(() => deriveAll(view.companies), [view.companies]);
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  /** Any record id (company, engagement, person) to the company that owns it. */
  const ownerOf = useMemo(() => {
    const m = new Map<string, CoInfo>();
    for (const i of infos) {
      m.set(i.c.id, i);
      for (const e of i.engs) m.set(e.id, i);
      for (const { p } of i.people) m.set(p.id, i);
    }
    return m;
  }, [infos]);
  const hasIndustry = useMemo(() => infos.some((i) => i.c.cells.industry?.s === "value"), [infos]);
  const hasRoles = useMemo(() => infos.some(hasRoleDates), [infos]);
  const totals = useMemo(
    () => ({ companies: infos.length, engagements: infos.reduce((n, i) => n + i.engs.length, 0), people: infos.reduce((n, i) => n + i.people.length, 0) }),
    [infos],
  );
  // The member's own seats (they are the linked seat holder) and what is missing on them.
  const seats = useMemo(() => mySeats(infos, me), [infos, me]);
  const seatN = seats.length;
  const seatMissing = useMemo(() => seatsMissing(seats), [seats]);
  const seatStats = useMemo(() => ({ n: seatN, missing: seatMissing }), [seatN, seatMissing]);
  const allRows = useMemo(() => rowsFor(recordType, infos), [recordType, infos]);
  /* The onboarding preset (PRESET_KEYS) narrows the All view only. */
  const [preset, setPreset] = useState<ToggleKey[]>(() => {
    const d = defaultsFor(me).f;
    return PRESET_KEYS.filter((k) => d[k] && place0.f[k]);
  });
  const presetOn = useMemo(() => preset.filter((k) => filters[k]), [preset, filters]);
  // Turned off once, it is gone: turned on again, it is the member's own filter.
  useEffect(() => {
    if (preset.some((k) => !filters[k])) setPreset((p) => p.filter((k) => filters[k]));
  }, [preset, filters]);
  const unpreset = useMemo(
    () => (presetOn.length ? ({ ...filters, ...Object.fromEntries(presetOn.map((k) => [k, false])) } as Filters) : filters),
    [filters, presetOn],
  );
  /** The filters that apply to this view. */
  const eff = tab === "all" ? filters : unpreset;
  const { rows: filtered, facets: facets0 } = useMemo(() => applyFilters(allRows, eff, tab, q, me), [allRows, eff, tab, q, me]);
  // With the preset on, All counts with it and every other view without it.
  const otherTabs = useMemo(
    () => (presetOn.length ? applyFilters(allRows, tab === "all" ? unpreset : filters, tab, q, me).facets.tabs : null),
    [presetOn, allRows, tab, unpreset, filters, q, me],
  );
  const facets = useMemo(
    () => (otherTabs ? { ...facets0, tabs: tab === "all" ? { ...otherTabs, all: facets0.tabs.all } : { ...facets0.tabs, all: otherTabs.all } } : facets0),
    [facets0, otherTabs, tab],
  );
  /** Filters changed from a view the preset doesn't narrow: the preset stays for All, unless the member set that filter here themselves. */
  const setEff = (nf: Filters) => {
    if (tab === "all" || !presetOn.length) return setFilters(nf);
    const took = presetOn.filter((k) => nf[k]);
    if (took.length) setPreset((p) => p.filter((k) => !took.includes(k)));
    setFilters({ ...nf, ...Object.fromEntries(presetOn.filter((k) => !took.includes(k)).map((k) => [k, true])) } as Filters);
  };
  // Name matches come first while searching (decision 13).
  const sortedLive = useMemo(() => sortRows(filtered, sort, tab === "needs", q), [filtered, sort, tab, q]);
  /*
   * While a record is open, the rows keep the order they had when it opened: unlocking a hidden
   * company renames it, and "1 of 7" must not turn into "3 of 7" under the member. A new sort,
   * view, search or filter takes a fresh order. Closing the record lets the rows settle.
   */
  const fKey = encodeFilters(filters);
  const listKey = `${recordType}|${tab}|${sort}|${q}|${fKey}`;
  const frozen = useRef<{ key: string; at: Map<string, number> } | null>(null);
  if (!drawer) frozen.current = null;
  else if (!frozen.current || frozen.current.key !== listKey) frozen.current = { key: listKey, at: new Map(sortedLive.map((r, k) => [r.key, k])) };
  const frozenAt = frozen.current?.at ?? null;
  const sorted = useMemo(() => {
    if (!frozenAt) return sortedLive;
    const pos = (r: Row, k: number) => frozenAt.get(r.key) ?? 1e9 + k;
    return sortedLive
      .map((r, k) => ({ r, at: pos(r, k) }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.r);
  }, [sortedLive, frozenAt]);
  const visible = useMemo(() => sorted.slice(0, limit), [sorted, limit]);
  // Counts and sheets update on the next frame; the long list behind them follows when it can.
  // The record type travels with its rows, so a deferred list never renders rows of another type.
  const listData = useMemo(() => ({ type: recordType, rows: visible }), [recordType, visible]);
  const list = useDeferredValue(listData);
  const nFilters = activeCount(eff);
  const chips = activeChips(eff);
  // The sidebar names the member's function ("No Sales seat yet"), so the chip does too.
  const chipLabel = (c: { id: string; label: string }) => (c.id === "notMine" && me.function ? notMineLabel(me.function) : c.label);

  /* ----- a new list starts at its top ----- */
  const listChanged = useRef(false);
  useEffect(() => {
    setLimit(PAGE);
    frameRef.current?.scrollTo({ top: 0, left: 0 });
    // The first run is the page load: leave the scroll where it is.
    if (!listChanged.current) {
      listChanged.current = true;
      return;
    }
    // Where the window scrolls (phones, and tablets with a long page), go back up to the list's controls if the member was below them.
    const a = listTopRef.current;
    if (!a) return;
    const top = Math.max(0, a.getBoundingClientRect().top + window.scrollY - 56);
    if (window.scrollY > top + 1) window.scrollTo({ top });
  }, [recordType, tab, fKey, q, sort]);

  /* ----- phones: the view in use is always fully on screen in its scrolling row ----- */
  useEffect(() => {
    if (!phone) return;
    const row = document.querySelector<HTMLElement>(".tp-pchips-scroll");
    const on = row?.querySelector<HTMLElement>(".chip-on");
    if (!row || !on) return;
    const a = on.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    // Clear of the faded right edge (24px), and never under the Filters button on the left.
    if (a.right > b.right - 24) row.scrollLeft += a.right - b.right + 24;
    else if (a.left < b.left) row.scrollLeft -= b.left - a.left + 8;
  }, [tab, phone, page]);

  /* ----- a page opens at its top; the table comes back where it was ----- */
  const tableY = useRef(0);
  const pageNow = useRef(page);
  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {}
    const onScroll = () => {
      if (pageNow.current === "table") tableY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (pageNow.current === page) return;
    pageNow.current = page;
    window.scrollTo(0, page === "table" ? tableY.current : 0);
    // Say where we are: the page's own heading takes focus, and the tab title follows.
    const h = document.querySelector<HTMLElement>(page === "table" ? "#tp-h1" : ".tp-main-page h1");
    if (h) {
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }, [page]);

  // Followed companies with news since the last visit (frozen at load).
  const [since] = useState(() => {
    const prev = previousVisit();
    if (!prev) return { at: null as string | null, n: 0 };
    return { at: prev, n: view.companies.filter((c) => c.following && c.updatedAt && c.updatedAt > prev).length };
  });

  /*
   * ----- actions -----
   * Each keeps one identity (useStable) and reads the newest view when it runs, so rows and the
   * Ui context never re-render for a new callback, and no callback holds an old table.
   */
  const firstUnlock = me.unlocked === 0;
  const flagOn = (which: "busy" | "flash", keys: string[]) => cellFlags.set((f) => ({ [which]: new Set([...f[which], ...keys]) }));
  const flagOff = (which: "busy" | "flash", keys: string[]) => cellFlags.set((f) => ({ [which]: new Set([...f[which]].filter((k) => !keys.includes(k))) }));
  const unlock = useStable(async (t: FactRef, opts?: { onWall?: () => void }) => {
    const k = cellKey(t.id, t.field);
    flagOn("busy", [k]);
    const r = await act({ type: "unlock", entity: t.entity, id: t.id, field: t.field }, { quiet: true, silentError: true });
    flagOff("busy", [k]);
    if (!r.ok) {
      // Out of credits on the server (the balance here was behind another tab): the zero-credits popover says what to add, not a red toast.
      if (opts?.onWall && /^You're out of credits/.test(r.message)) opts.onWall();
      else toast(r.message, true);
      return;
    }
    // A plain unlock speaks through the cell. One that bought more (the company, the role and the posting) or cost nothing says so.
    const plain = /^Unlocked [^,]+ for 1 credit\.$/.test(r.message) && !/ and /.test(r.message);
    if (t.field === "identity" || (/^Unlocked/.test(r.message) && !plain)) toast(r.message);
    else if (firstUnlock) toast("Unlocked, and it stays unlocked for you. Add a fact you know and you earn the credit back.");
    cellFlags.set((f) => (f.pulse === k ? { pulse: null } : {}));
    flagOn("flash", [k]);
    setTimeout(() => flagOff("flash", [k]), 2200);
  });
  const unlockMany = useStable(async (items: FactRef[]) => {
    const keys = items.map((t) => cellKey(t.id, t.field));
    flagOn("busy", keys);
    const r = await act({ type: "unlockMany", items: items.map(({ entity, id, field }) => ({ entity, id, field })) });
    flagOff("busy", keys);
    if (r.ok) {
      flagOn("flash", keys);
      setTimeout(() => flagOff("flash", keys), 2200);
    }
    return r.ok;
  });
  const fill = useStable(
    async (t: FactRef, value: string, memberId?: string | null) =>
      (await act({ type: "fill", entity: t.entity, id: t.id, field: t.field, value, ...(memberId ? { memberId } : {}) })).ok,
  );
  const edit = useStable((el: HTMLElement, t: FactRef, initial?: string) => {
    setPop(null);
    setEditor({ el, t, initial });
  });
  /** Empty facts that earn a credit at the company owning a record: company facts first, then free engagement facts. */
  const addable = useStable((id: string): FactRef[] => {
    const i = ownerOf.get(id);
    if (!i || i.c.hidden) return [];
    const out: FactRef[] = [];
    for (const f of COMPANY_FILL) if (i.c.cells[f]?.s === "empty") out.push({ entity: "company", id: i.c.id, field: f });
    for (const e of i.engs) for (const f of ["function", "type", "start"]) if (e.cells[f]?.s === "empty") out.push({ entity: "engagement", id: e.id, field: f });
    return out.slice(0, 3);
  });
  const openCompany = useStable((id: string, focus?: string) => {
    const row = sorted.find((r) => r.i.c.id === id && (!focus || r.key === focus)) ?? sorted.find((r) => r.i.c.id === id);
    // Opened from a page (the review queue, Your seats): closing the record goes back to it.
    setDrawer({ id, rowKey: row?.key ?? id, focus: focus ?? null, returnTo: page !== "table" ? page : drawer?.returnTo });
    setPage("table");
  });
  /** Close the record, back to the page it was opened from, if any. */
  const closeDrawer = useStable(() => {
    const back = drawer?.returnTo;
    setDrawer(null);
    if (back) setPage(back);
  });
  const openPage = useStable((p: AppPage) => {
    setEditor(null);
    setPop(null);
    setDrawer(null);
    setPage(p === "metrics" && !view.admin ? "table" : p);
  });
  const openSeats = useStable((engagementId?: string) => {
    setEditor(null);
    setPop(null);
    setDrawer(null);
    setSeatFocus(engagementId ?? null);
    setPage("seats");
  });
  /** A record at a company whose name is hidden until the member unlocks it. */
  const isHidden = useStable((id: string) => !!ownerOf.get(id)?.c.hidden);
  const openAdd = useStable((o?: AddOpts) => {
    setEditor(null);
    setPop(null);
    if (o?.companyId && isHidden(o.companyId)) {
      toast("This company is hidden. Unlock it for 1 credit, then add what you know.");
      return;
    }
    setAddOpts(o ?? {});
  });
  const openRow = useStable((r: Row) => {
    setEditor(null);
    // J and K keep the page the record came from.
    setDrawer((d) => ({ id: r.i.c.id, rowKey: r.key, focus: r.p ? r.p.id : r.e ? r.e.id : null, returnTo: d?.returnTo }));
  });
  /** A record stepped to with J/K: its row scrolls into view once the list has drawn it. */
  const scrollToRow = useRef<string | null>(null);
  const step = useStable((d: 1 | -1) => {
    if (!drawer || !sorted.length) return;
    const idx = sorted.findIndex((r) => r.key === drawer.rowKey);
    const next = sorted[Math.max(0, Math.min(sorted.length - 1, idx < 0 ? 0 : idx + d))];
    if (!next) return;
    const nIdx = sorted.indexOf(next);
    if (nIdx >= limit) setLimit((l) => Math.max(l, nIdx + 1));
    scrollToRow.current = next.key;
    openRow(next);
  });
  useEffect(() => {
    const key = scrollToRow.current;
    if (!key) return;
    const el = document.querySelector(`[data-row="${CSS.escape(key)}"]`);
    if (!el) return; // the deferred list has not drawn it yet: this runs again when it has
    scrollToRow.current = null;
    el.scrollIntoView({ block: "nearest" });
  }, [list, drawer?.rowKey]);
  const shareInvite = useShareInvite();
  // Phones and tablets open the share sheet (Messages, WhatsApp, LinkedIn). It copies the link where there is none.
  const invite = useStable(() => {
    if (phone || touch) void shareInvite(inviteLink(me.inviteCode));
    else copy(inviteLink(me.inviteCode), `Invite link copied. You each get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat.`);
  });

  /**
   * The fact the guided steps point at. Adding: free company facts only (industry, size, HQ,
   * revenue), never a guess at a role, rate or who held a seat. Unlocking: who held the seat
   * first (the fact a credit is most worth), then the rate, then the role. A member looking for
   * roles is pointed at an open role in their function (at a hidden company, its one lock opens
   * the company, the role and the posting). Followed companies first, then seats in the
   * member's own function, then the current sort. `only` limits the rows looked at. A lock that
   * another control buys is skipped, and so is a hidden company where its row has no lock
   * (phones and touch tablets).
   */
  const firstFact = useStable((want: Cell["s"], only?: (r: Row) => boolean): { t: FactRef; row: Row; idx: number } | null => {
    const fnOf = (r: Row) => shown((r.e ?? r.i.latest)?.cells.function);
    const mineFn = (r: Row) => (me.function && fnOf(r) === me.function ? 1 : 0);
    const roles = me.goal === "roles" && want === "locked";
    const openMine = (r: Row) => (roles && (r.e ? [r.e] : r.i.engs).some((e) => isOpenSeat(e) && shown(e.cells.function) === me.function) ? 1 : 0);
    const lockless = phone || touch;
    const order = sorted
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => (!only || only(r)) && !(want === "locked" && r.i.c.hidden && (lockless || !roles || me.unlocksLeft === 0)))
      .sort((a, b) => openMine(b.r) - openMine(a.r) || Number(b.r.i.c.following) - Number(a.r.i.c.following) || mineFn(b.r) - mineFn(a.r) || a.idx - b.idx);
    const lockedFields = roles ? ["role", "operator", "rate"] : ["operator", "rate", "role"];
    for (const { r, idx } of order) {
      const cands: [FactRef, Cell | undefined][] = [];
      if (want === "empty") {
        for (const f of ["industry", "employees", "hq", "revenue"]) cands.push([{ entity: "company", id: r.i.c.id, field: f }, r.i.c.cells[f]]);
      } else if (r.p) {
        for (const f of ["name", "email", "linkedin", "phone"]) cands.push([{ entity: "contact", id: r.p.id, field: f }, r.p.cells[f]]);
      } else if (r.i.c.hidden) {
        // Looking for roles: the hidden company's lock opens it with its open role and the posting, for 1 credit.
        cands.push([{ entity: "company", id: r.i.c.id, field: "identity" }, { s: "locked", ver: 0 }]);
      } else {
        // An open role in the member's function, else the latest seat. (A phone card shows its role only: pointAt opens the record for the rest.)
        const e = (openMine(r) ? (r.e ? r.e : r.i.engs.find((x) => isOpenSeat(x) && shown(x.cells.function) === me.function)) : null) ?? r.e ?? r.i.latest;
        if (e) for (const f of lockedFields) if (!coverOf(r.i, e, f)) cands.push([{ entity: "engagement", id: e.id, field: f }, e.cells[f]]);
      }
      const hit = cands.find(([, c]) => c?.s === want);
      if (hit) return { t: hit[0], row: r, idx };
    }
    return null;
  });
  /** Point at a fact in the list: pulse a lock, or open the editor on an empty fact. */
  const pointAt = useStable((want: "locked" | "empty", hit: { t: FactRef; row: Row; idx: number }) => {
    if (hit.idx >= limit) setLimit(hit.idx + 1);
    const k = cellKey(hit.t.id, hit.t.field);
    const pulseIt = () => {
      cellFlags.set({ pulse: k });
      setTimeout(() => cellFlags.set((f) => (f.pulse === k ? { pulse: null } : {})), 6000);
    };
    setTimeout(() => {
      const cell = document.querySelector<HTMLElement>(`[data-cell="${k}"]`);
      // A phone card shows a seat's role only. Who held it and the rate are in the record: open it at that seat and point there.
      if (!cell && want === "locked" && phone && hit.t.entity === "engagement") {
        setDrawer({ id: hit.row.i.c.id, rowKey: hit.row.key, focus: hit.t.id });
        setTimeout(pulseIt, 350);
        return;
      }
      // Company cells are not on screen in the Seats and People views (or on phone cards): use the row.
      const el = cell ?? document.querySelector<HTMLElement>(`[data-row="${CSS.escape(hit.row.key)}"]`);
      // Centered across too, so a lock's label in the last columns opens inside the frame.
      el?.scrollIntoView({ block: "center", inline: "center" });
      if (want === "locked") pulseIt();
      else if (el || phone) setTimeout(() => setEditor({ el: el ?? document.body, t: hit.t }), 250); // phones edit in a sheet
    }, 60);
  });
  /*
   * Where "add a fact" sends the member (Get started, the low and zero credit lines, a waiting
   * invite bonus): something they know. Their own seats first, then a company they follow or
   * unlocked with a free fact missing, else the form for a seat they held. Never a stranger's
   * company picked by the sort.
   */
  const knownCo = (i: CoInfo) => !i.c.hidden && (i.c.following || i.unlockedByMe);
  const knownGap = (i: CoInfo) => knownCo(i) && ["industry", "employees", "hq", "revenue"].some((f) => i.c.cells[f]?.s === "empty");
  const addTarget: "seats" | "known" | "seat" = seatStats.missing > 0 ? "seats" : infos.some(knownGap) ? "known" : "seat";
  const addLabel = addTarget === "seats" ? "Fill in your seats" : addTarget === "known" ? "Show me one to add" : "Add a seat you held";
  const showAdd = useStable(() => {
    if (addTarget === "seats") return openSeats();
    if (addTarget === "seat") return openAdd({ mode: "engagement", mine: true });
    setPage("table");
    const hit = firstFact("empty", (r) => knownGap(r.i));
    if (hit) {
      setDrawer(null);
      return pointAt("empty", hit);
    }
    // Not in this view: open the company's record, where its missing facts are listed.
    const i = infos.find(knownGap);
    if (i) openCompany(i.c.id);
  });
  const showFact = useStable((want: "locked" | "empty") => {
    if (want === "empty") return showAdd();
    setPage("table");
    setDrawer(null);
    const hit = firstFact(want);
    if (!hit) {
      toast("Nothing is locked in this view. Clear your filters to see more.");
      return;
    }
    pointAt(want, hit);
  });

  /* ----- closing overlays: Esc, the back gesture ----- */
  const toggleFilters = useStable(() => {
    if (layout === "desktop") setSideDocked((x) => !x);
    else setSideOverlay((x) => !x);
  });
  /** Close the overlay on top. */
  const closeTop = useStable(() => {
    if (editor) setEditor(null);
    else if (pop) setPop(null);
    else if (sortOpen) setSortOpen(false);
    else if (addOpts) setAddOpts(null);
    else if (drawer) closeDrawer();
    else if (sideOverlay) setSideOverlay(false);
    else if (page !== "table") setPage("table");
  });

  /*
   * ----- history: the address bar holds the place -----
   * Depth 1 is a record or a page, depth 2 an overlay over it (phones and tablets only). Each
   * level is one history entry, so Back closes the top one and never leaves the app from inside.
   */
  const recordOpen = !!drawer && page === "table";
  const navOpen = page !== "table" || !!drawer;
  const overlayOpen = layout !== "desktop" && !!(editor || pop || sortOpen || addOpts || sideOverlay);
  const depth = (navOpen ? 1 : 0) + (overlayOpen ? 1 : 0);
  const url = placeUrl(me, { t: recordType, v: tab, s: sort, f: filters, q: query, c: recordOpen ? drawer!.id : null, p: page });
  const urlRef = useRef(url);
  urlRef.current = url;
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const goingBack = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaceSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeHistory = useStable(() => {
    if (goingBack.current) return; // our own Back is on its way; the popstate runs this again
    const want = depthRef.current;
    const cur = entryDepth();
    try {
      if (want !== cur && replaceSoon.current) {
        clearTimeout(replaceSoon.current);
        replaceSoon.current = null;
      }
      if (want > cur) {
        for (let d = cur + 1; d <= want; d++) window.history.pushState({ tpd: d }, "", urlRef.current);
      } else if (want < cur) {
        // Closed from the page (X, Esc, a tap outside): take our entries off the stack.
        // If the browser never answers with a popstate, stop waiting and mark this entry as where we are.
        goingBack.current = setTimeout(() => {
          goingBack.current = null;
          try {
            window.history.replaceState({ ...window.history.state, tpd: depthRef.current }, "", urlRef.current);
          } catch {}
        }, 800);
        window.history.go(want - cur);
      } else if (here() !== urlRef.current && !replaceSoon.current) {
        // Typing in search changes the place on every key: write it once the typing pauses.
        replaceSoon.current = setTimeout(() => {
          replaceSoon.current = null;
          if (goingBack.current || here() === urlRef.current) return;
          try {
            window.history.replaceState({ ...window.history.state, tpd: entryDepth() }, "", urlRef.current);
          } catch {}
        }, 250);
      }
    } catch {}
  });
  // Opened from a link or a reload with ?c= or ?p=: the entry under it becomes the table, so Back closes the record or page.
  const [linked] = useState(() => (typeof window !== "undefined" && typeof window.history.state?.tpd !== "number" ? place0.c ?? (place0.p ? "page" : null) : null));
  useEffect(() => {
    if (linked) {
      try {
        window.history.replaceState({ ...window.history.state, tpd: 0 }, "", placeUrl(me, { t: recordType, v: tab, s: sort, f: filters, q: query, c: null, p: "table" }));
      } catch {}
    }
    // A link to a company opens its record (the landing page showed for anyone signed out). Find its row for "3 of 72".
    if (place0.c && !place0.p && start !== "seats") {
      if (drawer) openCompany(place0.c);
      else toast("That company link didn't open anything we have on file. Here is the table instead.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeHistory();
  }, [url, depth, writeHistory]);
  useEffect(() => {
    const onPop = () => {
      if (goingBack.current) {
        clearTimeout(goingBack.current);
        goingBack.current = null;
        writeHistory();
        return;
      }
      afterPop();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Back or Forward by the member: close what is above the entry, or open what it names. */
  const afterPop = useStable(() => {
    const d = entryDepth();
    let close = depth - d;
    if (close > 0 && overlayOpen) {
      // A form can keep its work: it cancels this event and asks first (the entry comes back).
      const ev = new Event("tp-back", { cancelable: true });
      window.dispatchEvent(ev);
      if (ev.defaultPrevented) {
        try {
          window.history.pushState({ tpd: depth }, "", urlRef.current);
        } catch {}
        return;
      }
      setEditor(null);
      setPop(null);
      setSortOpen(false);
      setAddOpts(null);
      setSideOverlay(false);
      close--;
    }
    if (close > 0 && navOpen) {
      // Back from a record opened from a page goes back to that page.
      const back = page === "table" ? drawer?.returnTo : undefined;
      setDrawer(null);
      setPage(back ?? "table");
    } else if (d > depth) {
      // Forward onto a record or a page.
      const x = readPlace(me);
      if (x.p && (x.p !== "metrics" || view.admin)) {
        setDrawer(null);
        setPage(x.p);
      } else if (x.c && byId.has(x.c)) openCompany(x.c);
    }
  });

  /* ----- keyboard ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable='true']");
      const s = live.current;
      if (e.key === "Escape") {
        // A part of the page that handled Esc itself (a form asking before it throws work away) says so.
        if (e.defaultPrevented || el === searchRef.current) return;
        // In the Add form, the first Esc leaves a filled-in field; it never throws the form away.
        if (s.addOpts && typing && el?.closest(".tp-modal") && (el as HTMLInputElement).value) {
          el.blur();
          return;
        }
        closeTop();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (s.addOpts || s.editor || s.keysOff) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "f" && s.page === "table") {
        e.preventDefault();
        toggleFilters();
      } else if (e.key === "a") {
        e.preventDefault();
        // With a record open, Add starts on its company (a hidden company has nothing to add yet).
        openAdd(s.drawer && !isHidden(s.drawer.id) ? { companyId: s.drawer.id } : undefined);
      } else if (s.drawer && e.key === "j") {
        e.preventDefault();
        step(1);
      } else if (s.drawer && e.key === "k") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The state the window listeners read when they run. */
  const live = useRef({ addOpts, editor, drawer, page, keysOff });
  live.current = { addOpts, editor, drawer, page, keysOff };

  // Pilot metrics are for admins: without the admin block there is nothing to show.
  useEffect(() => {
    if (page === "metrics" && !view.admin) setPage("table");
  }, [page, view.admin]);

  // Closing overlays that no longer fit the layout.
  useEffect(() => {
    if (layout === "desktop") setSideOverlay(false);
  }, [layout]);

  // A fade on the table's right edge while columns remain to the right.
  const showTable = page === "table" && !phone;
  const noRows = sorted.length === 0;
  useEffect(() => {
    const el = frameRef.current;
    const box = frameBoxRef.current;
    if (!showTable || !el || !box) return;
    const check = () => {
      box.classList.toggle("more-right", el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      const fade = fadeRef.current;
      if (fade) {
        // Keep the fade inside the borders and clear of scrollbars.
        fade.style.right = `${Math.max(1, el.offsetWidth - el.clientWidth - 1)}px`;
        fade.style.bottom = `${Math.max(1, el.offsetHeight - el.clientHeight - 1)}px`;
      }
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [showTable, list, noRows]);

  // One object for as long as the addresses are the same (every refresh brings a new View.contact).
  const support = view.contact?.support ?? null;
  const intro = view.contact?.intro ?? null;
  const contact = useMemo(() => ({ support, intro }), [support, intro]);
  const ui: Ui = useMemo(
    () => ({
      me,
      act,
      layout,
      // Read when a component renders. A change re-renders the cells it concerns (useCellFlags) and this shell, never the whole table.
      get busy() {
        return cellFlags.get().busy;
      },
      get flash() {
        return cellFlags.get().flash;
      },
      get pulse() {
        return cellFlags.get().pulse;
      },
      unlock,
      unlockMany,
      edit,
      fill,
      openCompany,
      openAdd,
      addable,
      isHidden,
      seats: seatStats,
      openSeats,
      openPage,
      contact,
    }),
    [me, act, layout, unlock, unlockMany, edit, fill, openCompany, openAdd, addable, isHidden, seatStats, openSeats, openPage, contact],
  );

  const drawerInfo = drawer ? byId.get(drawer.id) ?? null : null;
  const drawerPos = drawer ? sorted.findIndex((r) => r.key === drawer.rowKey) : -1;
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const noun = recordType === "companies" ? ["company", "companies"] : recordType === "engagements" ? ["seat", "seats"] : ["person", "people"];

  // The tab's title says where the member is.
  const docTitle = page !== "table" ? PAGE_TITLE[page] : recordOpen && drawerInfo ? drawerInfo.c.name : TYPE_TITLE[recordType];
  useEffect(() => {
    document.title = `${docTitle} · Trading Post`;
  }, [docTitle]);

  const goHome = () => {
    setPage("table");
    setDrawer(null);
    setQuery("");
  };
  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setTab("all");
    setQuery("");
  };
  /** Keep the search, drop the view and the filters that narrow it. */
  const searchAll = () => {
    setFilters(EMPTY_FILTERS);
    setTab("all");
  };

  /* ----- pieces ----- */
  const checklist = (
    <Checklist
      me={me}
      vertical={phone}
      onUnlock={() => showFact("locked")}
      onAdd={() => showFact("empty")}
      onInvite={invite}
      onDismiss={hideCheck}
      seats={Math.min(seatStats.missing, earnRoom(me))}
      seatsHeld={seatStats.n}
      seatsLeft={seatStats.missing}
      onSeats={() => openSeats()}
      addLabel={addTarget === "seat" ? "Add a seat you held" : "Add a fact"}
    />
  );

  /*
   * The slot above the list (Get started, the next-move card, the credit line) is chosen from
   * the balance as it was when this list or page opened. An unlock that takes the balance to 3
   * never pushes the rows down under the pointer: the slot catches up on the next page, view,
   * sort, search or filter change, or a reload. Dismissing something still hides it at once.
   */
  const slotKey = `${page}|${listKey}`;
  const slotSnap = useRef<{ key: string; me: Me } | null>(null);
  if (!slotSnap.current || slotSnap.current.key !== slotKey) slotSnap.current = { key: slotKey, me };
  const slotMe = slotSnap.current.me;
  const slotCapped = !!slotMe.earnResetsAt || slotMe.earned24h >= slotMe.earnCap;
  // The guidance slot holds one thing: credits running out, then a waiting invite bonus, then Get started, then the first-visit strip.
  const guide: "credits" | "invite" | "check" | "intro" | null =
    slotMe.credits <= 3 || slotCapped
      ? "credits"
      : slotMe.invitePending && slotMe.added === 0
        ? "invite"
        : !checkOff
          ? "check"
          : !introOff && slotMe.added + slotMe.unlocked === 0
            ? "intro"
            : null;
  // The next-move card: the single most urgent thing. Never together with Get started, whose second step points at the seats instead.
  // The roles card has done its job once the member is looking at Hiring now.
  const picked = guide === "check" ? null : pickMove(slotMe, seatStats, view.scan?.mine7 ?? 0, moveOff);
  const move = picked === "roles" && tab === "hiring" ? null : picked;
  const newRoles = move === "roles" ? newRolesFor(infos, me.function) : { roles: 0, hidden: 0 };
  /*
   * Ember: at most two kinds on a screen. Who keeps it, in order: the next-move card, the solid
   * Hiring chip in an open record, a low balance, the dot on an open role, the count on Hiring
   * now. `emberTaken` counts the first three that are on screen. At 1 the tab count goes quiet,
   * at 2 the dots do too (tp-ember-full). The card and a low balance say the same thing, so
   * the balance stays quiet while a card is up.
   */
  const recordHot = recordOpen && !!drawerInfo && drawerInfo.c.friendly.open > 0;
  // A phone record covers the page: only its own chip and its own balance are on screen.
  const cardShown = !!move && page === "table" && !(phone && recordOpen);
  const lowShown = me.credits <= 3 && !cardShown;
  const emberTaken = (cardShown ? 1 : 0) + (recordHot ? 1 : 0) + (lowShown ? 1 : 0);
  const seeOpenRoles = () => {
    setPage("table");
    setDrawer(null);
    setQuery("");
    setRecordType("engagements");
    setTab("hiring");
    setSort("newest");
    setFilters({ ...EMPTY_FILTERS, fn: me.function ? [me.function] : [] });
  };

  // Credits running low or out. With the roles card up, it is a line inside the card, not a second banner.
  const creditLine = guide === "credits" && (move === "roles" || !move);
  // CreditLine draws nothing once the balance is back above 3 (and earning is open): the card then has no last line.
  const noteNow = creditLine && (capped || me.credits <= 3);
  const banners = (
    <div className="tp-banners">
      {move && (
        <div className={`tp-move${noteNow ? " has-note" : ""}`}>
          <NextMove
            kind={move}
            me={me}
            seats={seatStats}
            roles={{ n: view.scan?.mine7 ?? 0, hidden: newRoles.hidden }}
            onSeats={() => openSeats()}
            onRoles={seeOpenRoles}
            onDismiss={dismissMove}
          />
          {creditLine && <CreditLine me={me} onShowAdd={() => showFact("empty")} label={addLabel} inCard />}
        </div>
      )}
      {creditLine && !move ? (
        <CreditLine me={me} onShowAdd={() => showFact("empty")} label={addLabel} />
      ) : guide === "invite" ? (
        <Strip
          actions={
            <button type="button" className="btn btn-sm" onClick={() => showFact("empty")}>
              {addLabel}
            </button>
          }
        >
          Your {REFERRAL_BONUS} invite credits arrive when you add your first fact to a company or a seat.
        </Strip>
      ) : guide === "check" ? (
        checklist
      ) : (
        guide === "intro" &&
        !move && (
          <Strip onClose={hideIntro}>
            You have {plural(me.credits, "credit")}. Spend one to see a fact someone else added. Add a fact you know and you earn one, up to {me.earnCap} a day.
          </Strip>
        )
      )}
      {since.n > 0 && !sinceOff && (
        <Strip
          onClose={() => setSinceOff(true)}
          actions={
            <button type="button" className="btn btn-sm" onClick={() => (setTab("following"), setRecordType("companies"), setSinceOff(true))}>
              Show them
            </button>
          }
        >
          {sinceText(since.n)}
        </Strip>
      )}
    </div>
  );

  const sortMenu = (
    <>
      <button ref={sortRef} type="button" className="tp-sortbtn" onClick={() => setSortOpen((x) => !x)} aria-haspopup="menu" aria-expanded={sortOpen}>
        <span className="tp-sortbtn-l">Sort</span> {SORTS.find((s) => s.key === sort)!.label} <IconChevron size={12} />
      </button>
      {sortOpen && sortRef.current && (
        <Anchored anchor={sortRef.current} onClose={() => setSortOpen(false)} width={200} className="tp-menu" align="end">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="menuitemradio"
              aria-checked={sort === s.key}
              className={`tp-menu-item${sort === s.key ? " on" : ""}`}
              onClick={() => (setSort(s.key), setSortOpen(false))}
            >
              {s.label}
            </button>
          ))}
        </Anchored>
      )}
    </>
  );

  const recordSwitch = (
    <div className="tp-rtype" role="group" aria-label="What to list">
      {RECORD_TYPES.map((t) => (
        <button key={t.key} type="button" aria-pressed={recordType === t.key} className={`tp-rtype-b${recordType === t.key ? " on" : ""}`} onClick={() => setRecordType(t.key)}>
          {t.label} <span className="num tp-cnt">{totals[t.key]}</span>
        </button>
      ))}
    </div>
  );

  const tabs = (
    <nav className={phone ? "tp-pchips-scroll" : "tp-tabs"} aria-label="Views">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={phone ? `chip tp-pchip${tab === t.key ? " chip-on" : ""}` : `tp-tab${tab === t.key ? " on" : ""}`}
          aria-pressed={tab === t.key}
          onClick={() => setTab(t.key)}
        >
          {t.label}{" "}
          {/* The count on Hiring now is solid ember (open roles you can win today). When something more urgent has the ember, it steps back to an ember outline. */}
          <span className={`num tp-cnt${t.key === "hiring" && facets.tabs.hiring > 0 ? (emberTaken === 0 ? " tp-cnt-live" : " tp-cnt-quiet") : ""}`}>{facets.tabs[t.key]}</span>
        </button>
      ))}
    </nav>
  );

  const qt = q.trim();
  const empty = sorted.length === 0 && (
    <Empty
      q={qt}
      tab={tab}
      noun={noun[1]}
      filtered={nFilters > 0}
      onClearFilters={() => setFilters(EMPTY_FILTERS)}
      onClearSearch={() => {
        setQuery("");
        searchRef.current?.focus();
      }}
      onSearchAll={searchAll}
      onBrowse={clearAll}
      onAdd={() => openAdd()}
    />
  );
  const more = sorted.length > limit && (
    <button type="button" className="tp-more-btn" onClick={() => setLimit((l) => l + PAGE)}>
      Show {Math.min(PAGE, sorted.length - limit)} more{" "}
      <span className="num tp-more-of">
        {limit} of {sorted.length} shown
      </span>
    </button>
  );

  // Hiring now lists a company the member can't see yet: the place to ask who wants more.
  const proFoot = tab === "hiring" && sorted.some((r) => r.i.c.hidden) && (
    <div className="pro-foot">
      <Pro where="hiring_tab" />
    </div>
  );

  const filterPanel = (head?: React.ReactNode) => (
    <FilterPanel f={eff} setF={setEff} facets={facets} me={me} head={head} hasIndustry={hasIndustry} hasRoles={hasRoles} />
  );
  // Hiring now: say how fresh the open roles are. "Last scan" is the last one that read the boards cleanly.
  const scan = view.scan;
  const scanLine = tab === "hiring" && scan && (
    <p className="tp-scanline">
      We check job boards for open fractional roles every week.{" "}
      {scan.lastOkAt ? `Last scan ${fmtStamp(scan.lastOkAt)}.` : scan.lastRunAt ? "The last scan could not read the job boards." : "The first check runs this week."}
    </p>
  );
  /** "72 companies", said again to screen readers when it changes. */
  const countText = `${plural(sorted.length, noun[0], noun[1])}${qt ? ` matching ${qt}` : ""}`;
  const skip = (e: React.MouseEvent) => {
    // Move focus without a hash in the address bar (it would be a history entry of its own).
    e.preventDefault();
    document.getElementById("tp-results")?.focus();
  };

  /* ----- layout ----- */
  return (
    <UiCtx.Provider value={ui}>
      <div className={`tp-app tp-${layout}${emberTaken >= 2 ? " tp-ember-full" : ""}`}>
        {page === "table" && (
          <a href="#tp-results" className="tp-skip" onClick={skip}>
            Skip to the {phone ? "list" : "table"}
          </a>
        )}
        <TopBar
          me={me}
          query={query}
          setQuery={(v) => {
            setQuery(v);
            if (page !== "table") setPage("table");
          }}
          searchRef={searchRef}
          phone={phone}
          onCredits={() => setPop((p) => (p === "credits" ? null : "credits"))}
          creditsRef={creditsRef}
          onAdd={() => openAdd()}
          onMenu={() => setPop((p) => (p === "menu" ? null : "menu"))}
          menuRef={menuRef}
          onHome={goHome}
          quietCredits={!!move && page === "table"}
          contact={contact}
          emailOn={view.email}
          starter={view.stats?.starter}
        />

        {page === "credits" ? (
          <main className="tp-main tp-main-page">
            <MyCredits view={view} onBack={() => setPage("table")} />
          </main>
        ) : page === "rates" ? (
          <main className="tp-main tp-main-page">
            <Benchmarks view={view} refresh={refresh} onBack={() => setPage("table")} />
          </main>
        ) : page === "metrics" && view.admin ? (
          <main className="tp-main tp-main-page">
            <Admin view={view} refresh={refresh} onBack={() => setPage("table")} />
          </main>
        ) : page === "seats" ? (
          <main className="tp-main tp-main-page ys-main">
            <Seats seats={seats} infos={infos} focus={seatFocus} onBack={() => setPage("table")} />
          </main>
        ) : phone ? (
          <main className="tp-main tp-main-phone">
            <h1 id="tp-h1" className="sr-only">
              {TYPE_TITLE[recordType]}
            </h1>
            {banners}
            {recordSwitch}
            <div ref={listTopRef} className="tp-listtop" aria-hidden />
            {/* One sticky row: Filters (sort and record type live in its sheet) and the views, each with its count. */}
            <div className="tp-pchips">
              <button type="button" className={`chip tp-pchip tp-pfilter${nFilters ? " chip-on" : ""}`} onClick={() => setSideOverlay(true)} aria-label={`Sort and filter${nFilters ? `, ${plural(nFilters, "filter")} on` : ""}`}>
                <IconFilter size={13} /> Filters{nFilters ? ` (${nFilters})` : ""}
              </button>
              {tabs}
            </div>
            {qt && (
              <div className="tp-pcount">
                <span>
                  <b className="num">{sorted.length}</b>
                  {tab !== "all" ? (
                    <>
                      {" "}
                      of <span className="num">{facets.tabs.all}</span>
                    </>
                  ) : null}{" "}
                  matching <span className="tp-q">{qt}</span>
                </span>
                {tab !== "all" && (
                  <button type="button" className="tp-flink" onClick={() => setTab("all")}>
                    Show all
                  </button>
                )}
              </div>
            )}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {countText}
            </p>
            {scanLine}
            <div id="tp-results" tabIndex={-1} className="tp-presults">
              {empty || <CardList type={list.type} rows={list.rows} me={me} onOpen={openRow} tab={tab} />}
            </div>
            {more}
            {proFoot}
          </main>
        ) : (
          <div className="tp-body">
            {layout === "desktop" && sideDocked && (
              <aside className="tp-side" aria-label="Filters">
                {filterPanel(
                  <div className="tp-filters-head">
                    <span className="tp-filters-title">Filters</span>
                    {nFilters > 0 && (
                      <button type="button" className="tp-flink" onClick={() => setFilters(EMPTY_FILTERS)}>
                        Clear all
                      </button>
                    )}
                    <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-label="Hide filters" title="Hide filters (F)" onClick={() => setSideDocked(false)}>
                      <IconChevron dir="left" />
                    </button>
                  </div>,
                )}
              </aside>
            )}
            <main className="tp-main">
              <h1 id="tp-h1" className="sr-only">
                {TYPE_TITLE[recordType]}
              </h1>
              {banners}
              <div ref={listTopRef} className="tp-listtop" aria-hidden />
              <div className="tp-head">
                {!(layout === "desktop" && sideDocked) && (
                  <button type="button" className={`btn tp-filterbtn${nFilters ? " on" : ""}`} onClick={toggleFilters} title="Show filters (F)">
                    <IconFilter size={14} /> Filters{nFilters ? <span className="num tp-filterbtn-n">{nFilters}</span> : null}
                  </button>
                )}
                {recordSwitch}
              </div>
              <div className="tp-toolbar">
                {tabs}
                <span className="tp-toolbar-sp" />
                <span className="tp-count" aria-live="polite" aria-atomic="true">
                  <b className="num">{sorted.length}</b> {sorted.length === 1 ? noun[0] : noun[1]}
                  {qt && (
                    <>
                      {" "}
                      matching <span className="tp-q">{qt}</span>
                    </>
                  )}
                </span>
                {sortMenu}
              </div>
              {chips.length > 0 && (
                <div className="tp-chiprow" aria-label="Active filters">
                  {chips.map((c) => (
                    <button key={c.id} type="button" className="chip tp-achip" onClick={() => setEff(c.clear(eff))} aria-label={`Remove the filter ${chipLabel(c)}`} title="Remove this filter">
                      {chipLabel(c)} <IconX size={11} />
                    </button>
                  ))}
                  <button type="button" className="tp-flink" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear all
                  </button>
                </div>
              )}
              {scanLine}
              <div className="tp-frame-box" ref={frameBoxRef}>
                <div className="tp-frame" ref={frameRef} id="tp-results" tabIndex={-1}>
                  {empty || (
                    <>
                      <DataTable
                        type={list.type}
                        rows={list.rows}
                        me={me}
                        selected={drawer?.rowKey ?? null}
                        onOpen={openRow}
                        newSince={since.at}
                        tab={tab}
                        notMine={eff.notMine}
                        sort={sort}
                        onSort={setSort}
                      />
                      {more}
                      {proFoot}
                    </>
                  )}
                </div>
                <div className="tp-frame-fade" ref={fadeRef} aria-hidden />
              </div>
            </main>
          </div>
        )}

        {/* filters as an overlay (tablet) or bottom sheet (phone) */}
        {sideOverlay && page === "table" && !phone && (
          <SidePanel onClose={() => setSideOverlay(false)}>
            {filterPanel(
                <div className="tp-filters-head">
                  <span className="tp-filters-title">Filters</span>
                  {nFilters > 0 && (
                    <button type="button" className="tp-flink" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear all
                    </button>
                  )}
                  <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-label="Close filters" onClick={() => setSideOverlay(false)}>
                    <IconX size={14} />
                  </button>
                </div>,
              )}
          </SidePanel>
        )}
        {sideOverlay && phone && (
          <Sheet
            title={
              <span>
                Sort and filter {nFilters > 0 && <span className="num tp-cnt">{nFilters}</span>}
              </span>
            }
            onClose={() => setSideOverlay(false)}
            footer={
              <div className="tp-sheet-actions">
                {nFilters > 0 && (
                  <button type="button" className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear all
                  </button>
                )}
                <button type="button" className="btn btn-pine btn-lg tp-grow" onClick={() => setSideOverlay(false)}>
                  Show {plural(sorted.length, noun[0], noun[1])}
                </button>
              </div>
            }
          >
            {/* Sort and what to list sit here on phones, reachable from the sticky row at any scroll. */}
            <section className="tp-fgroup tp-psort">
              <h3 className="tp-fgroup-h">List</h3>
              {recordSwitch}
            </section>
            <section className="tp-fgroup tp-psort">
              <h3 className="tp-fgroup-h" id="tp-psort-h">
                Sort
              </h3>
              <div className="tp-psort-opts" role="radiogroup" aria-labelledby="tp-psort-h">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} className={`chip tp-psort-o${sort === s.key ? " chip-on" : ""}`} onClick={() => setSort(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
            {filterPanel(null)}
          </Sheet>
        )}

        {drawer && drawerInfo && page === "table" && (
          <Drawer
            i={drawerInfo}
            focus={drawer.focus}
            onClose={closeDrawer}
            onStep={step}
            pos={drawerPos >= 0 ? { n: drawerPos + 1, of: sorted.length } : null}
            phone={phone}
            contact={contact}
          />
        )}
        {addOpts && <AddModal infos={infos} opts={addOpts} onClose={() => setAddOpts(null)} />}
        {editor && (
          <FactEditor
            key={`${editor.t.id}.${editor.t.field}`}
            anchor={editor.el}
            t={editor.t}
            initial={editor.initial}
            company={ownerOf.get(editor.t.id)?.c.name ?? ""}
            onClose={() => setEditor(null)}
          />
        )}
        {pop === "credits" && creditsRef.current && (
          <CreditsPopover
            me={me}
            ledger={view.ledger}
            anchor={creditsRef.current}
            onClose={() => setPop(null)}
            onSeeAll={() => (setPop(null), setDrawer(null), setPage("credits"))}
          />
        )}
        {pop === "menu" && menuRef.current && (
          <AvatarMenu
            me={me}
            anchor={menuRef.current}
            onClose={() => setPop(null)}
            // Sign out asks first while email sign-in is off: the link is then the only way back.
            onSignOut={signOut}
            emailOn={view.email}
            contact={contact}
            items={[
              ...(phone ? [{ label: "Add what you know", onClick: () => openAdd() }] : []),
              { label: "Your seats", hint: seatStats.missing ? `${seatStats.missing} missing` : undefined, onClick: () => openSeats() },
              { label: "Your credits", onClick: () => (setDrawer(null), setPage("credits")) },
              { label: "Rate benchmarks", onClick: () => (setDrawer(null), setPage("rates")) },
              ...(me.admin && view.admin ? [{ label: "Pilot metrics", onClick: () => (setDrawer(null), setPage("metrics")) }] : []),
              { label: "Invite a fractional", hint: `+${REFERRAL_BONUS} credits each`, onClick: invite },
              { label: "Copy my sign-in link", onClick: () => copy(signInLink(me.token), "Sign-in link copied. It signs in as you, so keep it to yourself.") },
              // Single-letter shortcuts can be switched off (speech input, stray keys). Not offered on touch screens, which have none.
              ...(!touch
                ? [
                    {
                      label: keysOff ? "Turn on keyboard shortcuts" : "Turn off keyboard shortcuts",
                      hint: "/ F A J K",
                      onClick: () => {
                        const off = !keysOff;
                        store.set("tp_keys_off", off ? "1" : "0");
                        setKeysOff(off);
                        toast(off ? "Keyboard shortcuts are off. Turn them on again from this menu." : "Keyboard shortcuts are on. Press / to search, F for filters, A to add, J and K to step through records.");
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
    </UiCtx.Provider>
  );
}

/* ---------- the filters over the table (tablets) ---------- */

/**
 * Under 1280px the filters open over the table. A dialog like every other overlay: focus moves
 * to its close button, Tab stays inside, Esc and a tap beside it close it, and focus goes back
 * to the Filters button.
 */
function SidePanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayer(ref, {
    onEscape: onClose,
    tab: "trap",
    first: (root) => root.querySelector<HTMLElement>('[aria-label="Close filters"]'),
    restore: () => document.querySelector<HTMLElement>(".tp-filterbtn"),
  });
  return (
    <div className="tp-side-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className="tp-side tp-side-overlay" role="dialog" aria-modal="true" aria-label="Filters" tabIndex={-1}>
        {children}
      </aside>
    </div>
  );
}

/* ---------- the credit line and the empty states ---------- */

/**
 * Running low, out, or at today's cap: one calm line with one action. No ember here. The
 * balance in the top bar already carries it. `label` names where the action goes (the
 * member's seats, a company they know, or the form for a seat they held). `inCard` draws it
 * as the last line of the next-move card.
 */
function CreditLine({ me, onShowAdd, label, inCard }: { me: Me; onShowAdd: () => void; label: string; inCard?: boolean }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  let text: string;
  let action = true;
  if (capped) {
    text = `${me.credits <= 0 ? `You're out of credits, and you've earned today's ${me.earnCap}.` : `You've earned today's ${me.earnCap} credits.`} You can earn again ${atTime(me.earnResetsAt)}.`;
    action = false;
  } else if (me.credits > 3) return null;
  else text = `${me.credits <= 0 ? "You're out of credits." : `You have ${plural(me.credits, "credit")} left.`} Add a fact you know and you earn one${me.credits <= 0 ? " back" : ""}.`;
  if (inCard)
    return (
      <p className="tp-move-note" role="status">
        {text}{" "}
        {action && (
          <button type="button" className="tp-move-link" onClick={onShowAdd}>
            {label}
          </button>
        )}
      </p>
    );
  return (
    <Strip
      actions={
        action ? (
          <button type="button" className="btn btn-sm" onClick={onShowAdd}>
            {label}
          </button>
        ) : undefined
      }
    >
      {text}
    </Strip>
  );
}

/** Nothing to list. Each one says what is true and gives one thing to do next. */
function Empty({
  q,
  tab,
  noun,
  filtered,
  onAdd,
  onClearFilters,
  onClearSearch,
  onSearchAll,
  onBrowse,
}: {
  q: string;
  tab: Tab;
  noun: string;
  filtered: boolean;
  onAdd: () => void;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onSearchAll: () => void;
  onBrowse: () => void;
}) {
  const narrowed = filtered || tab !== "all";
  let h: string;
  let p: string;
  let actions: { label: string; go: () => void; kind?: "pine" | "add" }[];
  if (q && narrowed) {
    h = `Nothing in this view matches ${q}`;
    p = `Your ${filtered ? "filters" : "view"} may be hiding it. Search all ${noun} instead.`;
    actions = [
      { label: `Search all ${noun}`, go: onSearchAll, kind: "pine" },
      { label: "Clear search", go: onClearSearch },
    ];
  } else if (q) {
    // Search reads what the member can see. Say so, rather than claim we have nothing.
    h = `No company, function or industry matches ${q}`;
    p = "Names, roles and rates stay locked until you unlock them, so search can't read them.";
    actions = [
      { label: "Clear search", go: onClearSearch, kind: "pine" },
      { label: "Add a company", go: onAdd, kind: "add" },
    ];
  } else if (filtered) {
    h = `No ${noun} match these filters`;
    p = "Take one off, or clear them all.";
    actions = [{ label: "Clear filters", go: onClearFilters }];
  } else {
    const all = { label: "See all companies", go: onBrowse };
    if (tab === "following") {
      h = "You're not following any companies yet";
      p = "Open a company and choose Follow. When someone adds a fact there, you'll see it here. Following is free.";
      actions = [all];
    } else if (tab === "unlocked") {
      h = "You haven't unlocked anything yet";
      p = "What you unlock stays visible to you, and its company is listed here.";
      actions = [all];
    } else if (tab === "hiring") {
      h = "No open fractional roles right now";
      p = "We check job boards every week. New roles are listed here as we find them.";
      actions = [all];
    } else if (tab === "needs") {
      h = "Nothing is missing here";
      p = "Every company has its website, industry, size, revenue, HQ and LinkedIn on file.";
      actions = [all];
    } else if (tab === "friendly") {
      h = `No fractional-friendly ${noun} yet`;
      p = "A company is listed here once it has an open fractional role or a fit score of 30 or more.";
      actions = [all];
    } else {
      h = `No ${noun} on file yet`;
      p = "Add a company you know. You earn a credit for each fact.";
      actions = [{ label: "Add what you know", go: onAdd, kind: "add" }];
    }
  }
  return (
    <div className="tp-noresults">
      <h3>{h}</h3>
      <p>{p}</p>
      <div className="tp-noresults-acts">
        {actions.map((a) => (
          <button key={a.label} type="button" className={`btn${a.kind === "pine" ? " btn-pine" : ""}`} onClick={a.go}>
            {a.kind === "add" && <IconPlus size={14} />} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
