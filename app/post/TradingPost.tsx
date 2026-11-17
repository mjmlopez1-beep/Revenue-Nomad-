"use client";

/**
 * Merlin, signed in. The shared record of fractional GTM work: who hired, for which
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
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/tableTypes";
import type { Me } from "@/lib/tableTypes";
import { IconChevron, IconFilter, IconPlus, IconSearch, IconX, calmRefusal, useToast, type Act, type View } from "../ui/shared";
import {
  COMPANY_FILL, EMPTY_FILTERS, RECORD_TYPES, SORTS, TABS, tabOf, sortFor, sortsFor, activeChips, activeCount, applyFilters, cellKey, coverOf, deriveAll, hasRoleDates, isOpenSeat, mySeats, newRolesFor,
  notMineLabel, rowsFor, seatsMissing, shown, sortRows, clearedFilters, icpEmpty, namedFn, splitByFn, rolesThisWeek, isFirm, viewName, criteriaOf, withIcpSpelled, bestFit, icpTest,
  icpApplies, icpMatch, ICP_FREE_TABS,
  type CoInfo, type FactRef, type Filters, type RecordType, type Row, type SortKey, type Tab, type ToggleKey,
} from "./model";
import { atTime, useLayout, useMedia, useStable, useStoredFlag, store, plural } from "./hooks";
import { UiCtx, CellUiCtx, FactEditor, Anchored, Pro, Sheet, cellFlags, useAllFlags, useLayer, type AddOpts, type AppPage, type Ui } from "./ui";
import { Seats } from "./Seats";
import { NextMove, earnRoom, pickMove, useMoveDismissals } from "./NextMove";
import { AvatarMenu, CreditsPopover, TopBar } from "./TopBar";
import { MessagesPage, useUnread } from "./Messages";
import { emailMeLink } from "./Settings";
import { FilterPanel } from "./Filters";
import { DataTable } from "./Tables";
import { CardList } from "./Cards";
import { Drawer } from "./Drawer";
import { AddModal } from "./AddModal";
import { MyCredits, inviteLink, signInLink, useCopy, useShareInvite } from "./Credits";
import { Integrations } from "./Integrations";
import { Benchmarks } from "./Benchmarks";
import { Admin } from "./Admin";
import { FitWhyCtx, IcpPill, IcpSheet, SaveViewSheet, SavedViews, type ProfileEdit } from "./Hunt";
import type { Icp, SavedViewRec } from "@/lib/tableTypes";
import { fmtStamp } from "./RoleDate";
import { Checklist, Strip, sinceText } from "./Guide";
import { REFERRAL_BONUS, standardIndustries, standardList } from "@/lib/tableFields";
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
type Page = "table" | "credits" | "rates" | "seats" | "metrics" | "messages" | "integrations";

/* ---------- the place in the address bar ---------- */

const PAGES: Page[] = ["seats", "credits", "rates", "metrics", "messages", "integrations"];
const PAGE_TITLE: Record<Page, string> = { table: "", seats: "Your seats", credits: "Your credits", rates: "Rate benchmarks", metrics: "Pilot metrics", messages: "Messages", integrations: "Integrations" };
const TYPE_PARAM: Record<RecordType, string> = { companies: "companies", engagements: "seats", people: "people" };
const TYPE_TITLE: Record<RecordType, string> = { companies: "Companies", engagements: "Seats", people: "People" };
/** Each list's noun, one and many ("4 seats match"). */
const TYPE_NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], engagements: ["seat", "seats"], people: ["person", "people"] };

/** Phones: the view chips fade out at whichever edge has more to scroll to, so a chip cut at the edge reads as more, not as a broken label. */
function chipEdges(el: HTMLElement) {
  el.dataset.start = String(el.scrollLeft <= 2);
  el.dataset.end = String(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
}

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
  // A link or saved view from before the 110 industries: old labels take today's ("Software" is every Software industry).
  const x = f as unknown as Filters;
  return { ...x, industry: standardIndustries(x.industry), employees: standardList("employees", x.employees), revenue: standardList("revenue", x.revenue) };
}

/**
 * Filters an onboarding answer turns on ("No Sales seat yet" for a member after adjacent seats,
 * "Seat holder on file" for one after an intro). They narrow the All view only: the other views
 * and their counts ignore them, so Hiring now never reads 0 because of an answer given once.
 */
const PRESET_KEYS: ToggleKey[] = ["notMine", "fractionalNamed"];
/**
 * An onboarding preset the member took off (its chip, its switch, Clear all) stays off on their
 * next visit too: remembered in this browser, per member and goal.
 */
const presetOffKey = (me: Me) => `tp_preset_off_${me.id}_${me.goal ?? ""}`;
const presetsOff = (me: Me) => new Set((store.get(presetOffKey(me)) ?? "").split(",").filter(Boolean));

/** Where a member lands with nothing in the address bar: set by their onboarding answers. */
function defaultsFor(me: Me) {
  const off = presetsOff(me);
  return {
    t: (me.goal === "intro" || me.goal === "roles" ? "engagements" : "companies") as RecordType,
    // The goal key "friendly" is stored on profiles, so it stays. It opens on Repeat hirers now.
    v: (me.goal === "friendly" ? "repeat" : me.goal === "roles" ? "hiring" : "all") as Tab,
    // With an ideal client or a function on file, the best fit for them comes first (seats in their own function lead). Open roles read best newest first.
    s: (!icpEmpty(me.icp) || (namedFn(me.function) && me.goal !== "roles") ? "best" : me.goal === "roles" ? "newest" : "fit") as SortKey,
    // The table opens on their ideal client (the Ideal Fractional Profile pill).
    f: {
      ...EMPTY_FILTERS,
      notMine: me.goal === "adjacent" && !!me.function && !off.has("notMine"),
      fractionalNamed: me.goal === "intro" && !off.has("fractionalNamed"),
      icp: !icpEmpty(me.icp),
    } as Filters,
  };
}
/** The sort a view opens on until the member picks one: Hiring now reads newest first (their function first). */
const sortDefault = (me: Me, v: Tab): SortKey => (v === "hiring" ? "newest" : defaultsFor(me).s);

/** A place as an address query: the URL's own (read on mount and on Back and Forward), or a saved view's. */
function readPlace(me: Me, from?: string) {
  const d = defaultsFor(me);
  const q = new URLSearchParams(from ?? (typeof window === "undefined" ? "" : window.location.search));
  const t = (Object.keys(TYPE_PARAM) as RecordType[]).find((k) => TYPE_PARAM[k] === q.get("t")) ?? d.t;
  // An old link's v=friendly opens Repeat hirers, the tab that replaced it.
  const v = tabOf(q.get("v")) ?? d.v;
  // Null: the member hasn't picked a sort, so the view's own default applies.
  const s = SORTS.find((x) => x.key === q.get("s"))?.key ?? null;
  const f = q.has("f") ? decodeFilters(q.get("f") === "-" ? "" : q.get("f")!) : d.f;
  // An old "Use it in Claude" link (p=claude) opens Integrations at its Claude section.
  const p = q.get("p") === "claude" ? "integrations" : PAGES.find((x) => x === q.get("p")) ?? null;
  return { t, v, s, f, q: (q.get("q") ?? "").slice(0, 200), c: q.get("c"), p, all: q.get("af") === "1" };
}

/** The address for a place, leaving out what the member's defaults already say. */
function placeUrl(me: Me, x: { t: RecordType; v: Tab; s: SortKey | null; f: Filters; q: string; c: string | null; p: Page; all?: boolean }): string {
  const d = defaultsFor(me);
  const q = new URLSearchParams();
  if (x.v !== d.v) q.set("v", x.v);
  if (x.t !== d.t) q.set("t", TYPE_PARAM[x.t]);
  if (x.s && x.s !== sortDefault(me, x.v)) q.set("s", x.s);
  if (x.q.trim()) q.set("q", x.q.trim());
  const f = encodeFilters(x.f);
  if (f !== encodeFilters(d.f)) q.set("f", f || "-");
  if (x.all && x.v === "hiring") q.set("af", "1");
  if (x.p === "table" && x.c) q.set("c", x.c);
  if (x.p !== "table") q.set("p", x.p);
  const s = q.toString();
  return `${typeof window === "undefined" ? "/" : window.location.pathname}${s ? `?${s}` : ""}`;
}

/** A place written out in full (a saved view): it must open the same whatever the member's defaults are later. */
function absolutePlace(x: { t: RecordType; v: Tab; s: SortKey | null; f: Filters; q: string; all?: boolean }): string {
  const q = new URLSearchParams();
  q.set("v", x.v);
  q.set("t", TYPE_PARAM[x.t]);
  if (x.s) q.set("s", x.s);
  if (x.q.trim()) q.set("q", x.q.trim());
  q.set("f", encodeFilters(x.f) || "-");
  if (x.all && x.v === "hiring") q.set("af", "1");
  return q.toString();
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
  /** Opened from an old "Use it in Claude" link: Integrations opens at the Claude section. */
  const [claudeLink] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("p") === "claude");
  const [recordType, setRecordType] = useState<RecordType>(place0.t);
  const [tabPicked, setTabPicked] = useState<Tab>(place0.v);
  const [filters, setFilters] = useState<Filters>(place0.f);
  const [sortPicked, setSort] = useState<SortKey | null>(place0.s);
  /** Hiring now: every function's open roles, not only the member's. */
  const [allFns, setAllFns] = useState(place0.all);
  const sortList = sortsFor(recordType).filter((s) => s.key !== "best" || !!me.function || !icpEmpty(me.icp));
  const [query, setQuery] = useState(place0.q);
  // The input stays instant; the list behind it renders when the main thread is free.
  const q = useDeferredValue(query);
  /*
   * A search covers the whole table: while one is typed the view is All, whatever view was
   * remembered, so a company the member knows never shows 0 because of the view. Picking a view
   * while searching narrows the search to it. Clearing the search brings the remembered view back.
   */
  const searching = !!query.trim();
  const [searchTab, setSearchTab] = useState<Tab | null>(null);
  /**
   * "Show them" under a search: this search reads the whole table, the Ideal Fractional Profile and
   * the filters lifted (they stay as they were, and come back when the search is cleared).
   */
  const [searchWide, setSearchWide] = useState(false);
  useEffect(() => {
    if (!searching) {
      setSearchTab(null);
      setSearchWide(false);
    }
  }, [searching]);
  const tab: Tab = searching ? searchTab ?? "all" : tabPicked;
  const setTab = useCallback((t: Tab) => (searching ? setSearchTab(t) : setTabPicked(t)), [searching]);
  // The sort in use: the member's pick, else the view's default. One this list can't use (Most seats, carried over to People) reads as Most fractional-friendly.
  const sort = sortFor(recordType, sortPicked ?? sortDefault(me, tab));
  /** Hiring now leads with the member's function (theirs only, until "Show all functions"). */
  const hireFn = tab === "hiring" ? namedFn(me.function) : null;
  const [limit, setLimit] = useState(PAGE);
  const [page, setPage] = useState<Page>(() => (start === "seats" ? "seats" : place0.p === "metrics" && !view.admin ? "table" : place0.p ?? "table"));
  const [seatFocus, setSeatFocus] = useState<string | null>(null);
  const [moveOff, dismissMove] = useMoveDismissals();
  /** Conversations with something unread (Messages), for the badges on the avatar and in the menu. */
  const unread = useUnread(view.me?.unread);

  /* ----- overlays ----- */
  // A link or a reload with ?c= opens that company's record at once (its row is found on mount).
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    place0.c && !place0.p && start !== "seats" && view.companies.some((c) => c.id === place0.c) ? { id: place0.c, rowKey: place0.c, focus: null } : null,
  );
  const [addOpts, setAddOpts] = useState<AddOpts | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pop, setPop] = useState<"credits" | "menu" | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  /** Phones: the "Companies" chip's menu (what to list), in the sticky row. */
  const [typeOpen, setTypeOpen] = useState(false);
  const [sideDocked, setSideDocked] = useState(true);
  const [sideOverlay, setSideOverlay] = useState(false);
  // Unlocking, just unlocked and pointed-at cells live in a store (cellFlags), so the Ui context keeps its identity and only those cells render again.
  // The shell subscribes too: the record reads them through ui.busy and ui.pulse.
  useAllFlags();
  const [introOff, hideIntro] = useStoredFlag("tp_intro_off");
  const [checkOff, hideCheck] = useStoredFlag("tp_check_off");
  const [sinceOff, setSinceOff] = useState(false);
  const [keysOff, setKeysOff] = useState(() => store.get("tp_keys_off") === "1");
  /** The "Your profile" sheet (with the Ideal Fractional Profile) and the "Save this view" sheet. */
  const [icpOpen, setIcpOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const creditsRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  /** Just above the list's controls: where a new list starts when the window scrolls. */
  const listTopRef = useRef<HTMLDivElement>(null);

  /*
   * Rows and cells read `me` for a few yes-or-no facts only (any credits, unlocks left today,
   * earning open, the pick-list limit, a fact of their own yet). They get a Ui whose `me` changes
   * when one of those changes, so an unlock that takes 25 credits to 24 re-renders the one cell
   * it opened, not every row on screen (PERF-2). Everything else reads the full Ui.
   */
  const earnShut = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const cellKeyOfMe = [
    me.credits > 0,
    me.unlocksLeft === 0,
    earnShut,
    me.earnResetsAt ?? "",
    me.sellEarnLeft === 0,
    me.added === 0,
    me.function ?? "",
    !!me.admin,
    !!me.proInterest,
    me.owed ?? 0,
    (me.benchRates ?? []).map((b) => b.engagementId ?? "").join(","),
    JSON.stringify(me.icp ?? null),
  ].join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cellMe = useMemo(() => me, [cellKeyOfMe]);
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
  /** A rate typed on a seat the member held: the editor asks who can see it (decision 18). */
  const ownRateOf = (t: FactRef) => {
    if (t.entity !== "engagement" || t.field !== "rate") return undefined;
    const e = ownerOf.get(t.id)?.engs.find((x) => x.id === t.id);
    return e?.yours ? { pricing: shown(e.cells.pricing) ?? null } : undefined;
  };
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
  /** The member's own filters, as they set them: a preset they take off here stays off on their next visit (presetsOff). */
  const setMine = (nf: Filters) => {
    const dropped = presetOn.filter((k) => !nf[k]);
    if (dropped.length) store.set(presetOffKey(me), [...new Set([...presetsOff(me), ...dropped])].join(","));
    setFilters(nf);
  };
  const wide = searching && searchWide;
  /** The filters that apply to this view. A search widened with "Show them" reads everything. */
  // The onboarding preset narrows All, but not the open roles: with Open now picked, All lists what Hiring now lists.
  const presetHere = tab === "all" && !filters.roleState.includes("Open now");
  const eff = useMemo(() => (wide ? EMPTY_FILTERS : presetHere ? filters : unpreset), [wide, presetHere, filters, unpreset]);
  // Filters read only the member's function from `me` (cellMe changes with it): a new balance doesn't recount the table.
  const { rows: filtered, facets: facets0 } = useMemo(() => applyFilters(allRows, eff, tab, q, cellMe), [allRows, eff, tab, q, cellMe]);
  // With the preset on, All counts with it and every other view without it.
  const otherFacets = useMemo(
    () => (presetOn.length && !wide ? applyFilters(allRows, tab === "all" ? unpreset : filters, tab, q, cellMe).facets : null),
    [presetOn, wide, allRows, tab, unpreset, filters, q, cellMe],
  );
  const facets = useMemo(() => {
    if (!otherFacets) return facets0;
    const o = otherFacets.tabs;
    return tab === "all"
      ? {
          ...facets0,
          tabs: { ...o, all: facets0.tabs.all },
          hiringMine: otherFacets.hiringMine,
          // Open now counts what picking it lists (the preset steps aside for it), the Hiring now count.
          lists: { ...facets0.lists, roleState: { ...facets0.lists.roleState, "Open now": otherFacets.lists.roleState["Open now"] } },
        }
      : { ...facets0, tabs: { ...facets0.tabs, all: o.all } };
  }, [facets0, otherFacets, tab]);
  /** Filters changed from a view the preset doesn't narrow: the preset stays for All, unless the member set that filter here themselves. */
  const setEff = (nf: Filters) => {
    if (wide) {
      // A filter picked during a widened search narrows it again: the member's own filters come back, with this one.
      setSearchWide(false);
      const merged = { ...filters } as Record<string, unknown>;
      for (const k of Object.keys(EMPTY_FILTERS) as (keyof Filters)[]) {
        const v = nf[k];
        if (Array.isArray(v) ? v.length > 0 : !!v) merged[k] = v;
      }
      return setFilters(merged as unknown as Filters);
    }
    if (presetHere || !presetOn.length) return setMine(nf);
    const took = presetOn.filter((k) => nf[k]);
    if (took.length) setPreset((p) => p.filter((k) => !took.includes(k)));
    setFilters({ ...nf, ...Object.fromEntries(presetOn.filter((k) => !took.includes(k)).map((k) => [k, true])) } as Filters);
  };
  /** Clear all: no filters (the profile pill stays as it is). */
  const clearFilters = () => {
    setSearchWide(false);
    setMine(clearedFilters(filters));
  };
  /**
   * How many of each list (companies, seats, people) this view holds, with the same filters, the
   * profile and the search: the list switch and the phone's list menu show these, so they always
   * agree with the All count. While searching, one tap moves to the list that has matches.
   * Search reads only what the member can see, never a locked value (applyFilters).
   */
  const typeCounts = useMemo(() => {
    const out = {} as Record<RecordType, number>;
    for (const t of RECORD_TYPES) out[t.key] = t.key === recordType ? filtered.length : applyFilters(rowsFor(t.key, infos), eff, tab, q, cellMe, true).rows.length;
    return out;
  }, [recordType, filtered, infos, eff, tab, q, cellMe]);
  const searchCounts = q.trim() ? typeCounts : null;
  /** While a search is narrowed by the profile or filters: the matches they keep out ("3 more outside your filters · Show them"). */
  const narrowedBy = !wide && q.trim() ? { icp: icpApplies(eff, tab, me), filters: activeCount(eff) > 0 } : null;
  const outside = useMemo(() => {
    if (!narrowedBy || !(narrowedBy.icp || narrowedBy.filters)) return 0;
    return Math.max(0, applyFilters(allRows, EMPTY_FILTERS, tab, q, cellMe, true).rows.length - filtered.length);
  }, [narrowedBy?.icp, narrowedBy?.filters, allRows, tab, q, cellMe, filtered]); // eslint-disable-line react-hooks/exhaustive-deps
  // Name matches come first while searching (decision 13).
  // Hiring now: the member's function first. Until "Show all functions", only theirs (when they have any open).
  const fnSplit = useMemo(() => (hireFn ? splitByFn(filtered, hireFn) : null), [filtered, hireFn]);
  const fnOnly = !!fnSplit && !allFns && fnSplit.mine.length > 0 && !q.trim();
  const sortedLive = useMemo(
    () => sortRows(fnOnly ? fnSplit!.mine : filtered, sort, tab === "needs", q, { me: cellMe, fnFirst: hireFn }),
    [filtered, fnOnly, fnSplit, sort, tab, q, cellMe, hireFn],
  );
  /*
   * While a record is open, the rows keep the order they had when it opened: unlocking a hidden
   * company renames it, and "1 of 7" must not turn into "3 of 7" under the member. A new sort,
   * view, search or filter takes a fresh order. Closing the record lets the rows settle.
   */
  const fKey = encodeFilters(filters);
  const listKey = `${recordType}|${tab}|${sort}|${q}|${fKey}|${fnOnly}`;
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
    else if (a.left < b.left) row.scrollLeft -= b.left - a.left + 24;
    chipEdges(row);
  }, [tab, phone, page]);

  /* ----- a page opens at its top; the table comes back where it was ----- */
  // Where the table was scrolled to, while this load has seen it. Null after a reload on a page: then the table's own history entry says (tpY).
  const tableY = useRef<number | null>(page === "table" ? 0 : null);
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
    const saved = typeof window.history.state?.tpY === "number" ? (window.history.state.tpY as number) : 0;
    window.scrollTo(0, page === "table" ? tableY.current ?? saved : 0);
    // Say where we are: the page's own heading takes focus, and the tab title follows.
    const h = document.querySelector<HTMLElement>(page === "table" ? "#tp-h1" : ".tp-main-page h1");
    if (h) {
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }, [page]);

  // Followed companies with news since the last visit (frozen at load).
  // Bonuses paid since then (an invite, two confirmations): nothing else says they came (WORD-9).
  const [since] = useState(() => {
    const prev = previousVisit();
    if (!prev) return { at: null as string | null, n: 0, invite: 0, confirm: 0 };
    const paid = (r: string) => view.ledger.filter((l) => l.reason === r && l.delta > 0 && l.at > prev);
    return {
      at: prev,
      n: view.companies.filter((c) => c.following && c.updatedAt && c.updatedAt > prev).length,
      invite: paid("referral").reduce((n, l) => n + l.delta, 0),
      confirm: paid("confirm").length,
    };
  });
  const [bonusOff, setBonusOff] = useState(false);
  // A visit ends when the member leaves the page, so "since your last visit" means while they were away (not what they saw happen here).
  useEffect(() => {
    const left = (e: Event) => {
      if (e.type === "pagehide" || document.visibilityState === "hidden") store.set("tp_last_visit", new Date().toISOString());
    };
    document.addEventListener("visibilitychange", left);
    window.addEventListener("pagehide", left);
    return () => {
      document.removeEventListener("visibilitychange", left);
      window.removeEventListener("pagehide", left);
    };
  }, []);

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
      else toast(r.message, !calmRefusal(r.message));
      return;
    }
    // A plain unlock speaks through the cell. One that bought more (the company, the role, the posting and the rate) or cost nothing says so.
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
    // A seat's facts are its holder's to add: only the member's own seats here.
    for (const e of i.engs) if (e.yours) for (const f of ["function", "type", "start"]) if (e.cells[f]?.s === "empty") out.push({ entity: "engagement", id: e.id, field: f });
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
  /** The member holds this seat: only the seat holder adds facts about a seat. */
  const holdsSeat = useStable((id: string) => !!ownerOf.get(id)?.engs.some((e) => e.id === id && e.yours));
  const openAdd = useStable((o?: AddOpts) => {
    setEditor(null);
    setPop(null);
    if (o?.companyId && isHidden(o.companyId)) {
      toast("This company is locked. Unlock it for 1 credit, then add what you know.");
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
    else copy(inviteLink(me.inviteCode), `Invite link copied. You both get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat.`);
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
        // Looking for roles: the hidden company's lock opens it with its open role, the posting and the rate, for 1 credit.
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
  const url = placeUrl(me, { t: recordType, v: tabPicked, s: sortPicked, f: filters, q: query, c: recordOpen ? drawer!.id : null, p: page, all: allFns });
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
        // Leaving the table: its entry keeps where it was scrolled, so Back finds the place even after a reload on the page or record.
        if (cur === 0 && tableY.current !== null) window.history.replaceState({ ...window.history.state, tpY: tableY.current }, "");
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
        window.history.replaceState({ ...window.history.state, tpd: 0 }, "", placeUrl(me, { t: recordType, v: tabPicked, s: sortPicked, f: filters, q: query, c: null, p: "table", all: allFns }));
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

  /** Put the cursor in the search, on the table (a page or a phone's full-screen record closes first). */
  const focusSearch = useStable(() => {
    const go = () => {
      const el = searchRef.current;
      if (!el) return;
      el.focus();
      el.select();
    };
    if (page !== "table" || (phone && drawer)) {
      setDrawer(null);
      setPage("table");
      setTimeout(go, 60);
    } else go();
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
      // Cmd+K or Ctrl+K: the search, from anywhere (a modifier shortcut, so it stays on with the single-letter ones off).
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && !e.defaultPrevented) {
        if (s.addOpts || s.editor) return;
        e.preventDefault();
        focusSearch();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (s.addOpts || s.editor || s.keysOff) return;
      if (e.key === "/") {
        e.preventDefault();
        focusSearch();
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
  const mkUi = (m: Me): Ui => ({
      me: m,
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
      holdsSeat,
      seats: seatStats,
      openSeats,
      openPage,
      contact,
      invite,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ui: Ui = useMemo(() => mkUi(me), [me, act, layout, unlock, unlockMany, edit, fill, openCompany, openAdd, addable, isHidden, holdsSeat, seatStats, openSeats, openPage, contact]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cellUi: Ui = useMemo(() => mkUi(cellMe), [cellMe, act, layout, unlock, unlockMany, edit, fill, openCompany, openAdd, addable, isHidden, holdsSeat, seatStats, openSeats, openPage, contact]);

  const drawerInfo = drawer ? byId.get(drawer.id) ?? null : null;
  const drawerPos = drawer ? sorted.findIndex((r) => r.key === drawer.rowKey) : -1;
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const noun = recordType === "companies" ? ["company", "companies"] : recordType === "engagements" ? ["seat", "seats"] : ["person", "people"];

  // The tab's title says where the member is.
  const docTitle = page !== "table" ? PAGE_TITLE[page] : recordOpen && drawerInfo ? (drawerInfo.c.hidden ? "Locked company" : drawerInfo.c.name) : TYPE_TITLE[recordType];
  useEffect(() => {
    document.title = `${docTitle} · Merlin`;
  }, [docTitle]);

  /** An admin's "See it as a member": a cookie the server reads (only for admins), then the table again. */
  const seeAsMember = (on: boolean) => {
    try {
      document.cookie = on ? "rn_as_member=1; path=/; max-age=86400; samesite=lax" : "rn_as_member=; path=/; max-age=0; samesite=lax";
    } catch {}
    setDrawer(null);
    if (on && page === "metrics") setPage("table");
    void refresh();
  };
  const goHome = () => {
    setPage("table");
    setDrawer(null);
    setQuery("");
  };
  const clearAll = () => {
    clearFilters();
    setTab("all");
    setQuery("");
  };
  /** Keep the search, and read the whole table for it: the view, the profile and the filters lifted for this search only. */
  const searchAll = () => {
    setTab("all");
    setSearchWide(true);
  };

  /* ----- pieces ----- */
  const checklist = (
    <Checklist
      me={me}
      vertical={phone}
      onUnlock={() => showFact("locked")}
      onAdd={() => openAdd({ mode: "engagement", mine: true })}
      onInvite={invite}
      onDismiss={hideCheck}
      seats={Math.min(seatStats.missing, earnRoom(me))}
      seatsHeld={seatStats.n}
      seatsLeft={seatStats.missing}
      onSeats={() => openSeats()}
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
  // New roles in the member's function this week, counted the way "See open roles" lists them: inside
  // the Ideal Fractional Profile while its pill is on, never a fractional firm. The card's number and
  // the Hiring now list it opens are one count (C25).
  const rolesKeep = useMemo(() => {
    const fit = filters.icp && !icpEmpty(me.icp) ? icpTest(me.icp!) : null;
    return (i: CoInfo) => !isFirm(i.c) && (!fit || fit(i.c));
  }, [filters.icp, me.icp]);
  const newRoles = useMemo(() => newRolesFor(infos, namedFn(me.function), rolesKeep), [infos, me.function, rolesKeep]);
  const picked = guide === "check" ? null : pickMove(slotMe, seatStats, newRoles.roles, moveOff);
  const move = picked === "roles" && tab === "hiring" ? null : picked;
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
    setSort(null);
    setAllFns(false);
    // Hiring now leads with the member's function on its own (no Function filter left behind for All),
    // and the profile pill stays as it was, so the list matches the card's count.
    setFilters({ ...EMPTY_FILTERS, icp: filters.icp });
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
            roles={{ n: newRoles.roles, hidden: newRoles.hidden }}
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
      {(since.invite > 0 || since.confirm > 0) && !bonusOff && <Strip onClose={() => setBonusOff(true)}>{bonusText(since.invite, since.confirm)}</Strip>}
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
          {sortList.map((s) => (
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

  // Each list's count is what it holds in this view (the same number as its All count). While searching, its matches, so one tap moves to the list that has them.
  const typeTitle = (t: RecordType) =>
    searchCounts
      ? `${plural(searchCounts[t], TYPE_NOUN[t][0], TYPE_NOUN[t][1])} match ${q.trim()}`
      : typeCounts[t] === totals[t]
        ? `${plural(totals[t], TYPE_NOUN[t][0], TYPE_NOUN[t][1])} on file`
        : `${typeCounts[t]} in this view, of ${totals[t]} on file`;
  const recordSwitch = (
    <div className={`tp-rtype${searchCounts ? " searching" : ""}`} role="group" aria-label={searchCounts ? "Matches in each list" : "What to list"}>
      {RECORD_TYPES.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={recordType === t.key}
          className={`tp-rtype-b${recordType === t.key ? " on" : ""}${searchCounts && !searchCounts[t.key] ? " none" : ""}`}
          onClick={() => setRecordType(t.key)}
          title={typeTitle(t.key)}
        >
          {t.label} <span className="num tp-cnt">{typeCounts[t.key]}</span>
        </button>
      ))}
    </div>
  );
  /** Phones, while searching: the matches in each list, one tap to switch. */
  const searchTypes = searchCounts && (
    <div className="tp-qtypes" role="group" aria-label="Matches in each list">
      {RECORD_TYPES.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={recordType === t.key}
          className={`chip tp-pchip${recordType === t.key ? " chip-on" : ""}${!searchCounts[t.key] ? " none" : ""}`}
          onClick={() => setRecordType(t.key)}
        >
          {t.label} <span className="num tp-cnt">{searchCounts[t.key]}</span>
        </button>
      ))}
    </div>
  );
  /** The search as a field at the top of the list on phones. */
  const listSearch = phone && page === "table" && (
    <label className="tp-search tp-search-list">
      <IconSearch size={16} />
      <input
        ref={searchRef}
        className="tp-bare"
        type="search"
        placeholder="Search companies, seats and people"
        aria-label="Search companies, seats and people"
        value={query}
        enterKeyHint="search"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            e.currentTarget.blur();
          }
        }}
      />
      {query && (
        <button type="button" className="tp-search-x" aria-label="Clear search" onClick={() => (setQuery(""), searchRef.current?.focus())}>
          <IconX size={14} />
        </button>
      )}
    </label>
  );

  /** What a view lists. Hiring now lists the member's own function alone (until "Show all functions"), so it counts that. */
  const tabCount = (t: Tab) => (t === "hiring" && namedFn(me.function) && !allFns && !searching && facets.hiringMine > 0 ? facets.hiringMine : facets.tabs[t]);
  const viewButtons = TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={phone ? `chip tp-pchip${tab === t.key ? " chip-on" : ""}` : `tp-tab${tab === t.key ? " on" : ""}`}
          aria-pressed={tab === t.key}
          title={t.hint}
          onClick={() => setTab(t.key)}
        >
          {t.label}
          {/* Every view shows what it lists, All too, so the count agrees with the list switch above it. The count on Hiring now is solid ember (open roles you can win today). When something more urgent has the ember, it steps back to an ember outline. */}{" "}
          <span className={`num tp-cnt${t.key === "hiring" && facets.tabs.hiring > 0 ? (emberTaken === 0 ? " tp-cnt-live" : " tp-cnt-quiet") : ""}`}>{tabCount(t.key)}</span>
        </button>
      ));
  // Phones: what to list (Companies, Seats or People, a short menu) is the list's title in the top bar, so it needs no row of its own (decision 16).
  const typeSwitch =
    phone && page === "table" ? (
      <button
        ref={typeRef}
        type="button"
        className="tp-ptype"
        onClick={() => setTypeOpen((x) => !x)}
        aria-haspopup="menu"
        aria-expanded={typeOpen}
        aria-label={`Listing ${TYPE_TITLE[recordType].toLowerCase()}. Change what to list`}
      >
        <span>{TYPE_TITLE[recordType]}</span> <IconChevron size={12} />
      </button>
    ) : null;
  const tabs = phone ? (
    <nav className="tp-pchips-scroll" aria-label="Views" onScroll={(e) => chipEdges(e.currentTarget)}>
      {viewButtons}
    </nav>
  ) : (
    <nav className="tp-tabs" aria-label="Views">
      {viewButtons}
    </nav>
  );

  const qt = q.trim();
  const empty = sorted.length === 0 && (
    <Empty
      q={qt}
      tab={tab}
      noun={noun[1]}
      filtered={nFilters > 0}
      onClearFilters={clearFilters}
      onClearSearch={() => {
        setQuery("");
        searchRef.current?.focus();
      }}
      onSearchAll={searchAll}
      onBrowse={clearAll}
      onAdd={() => openAdd()}
      elsewhere={
        searchCounts
          ? RECORD_TYPES.filter((t) => t.key !== recordType && searchCounts[t.key] > 0).map((t) => ({
              n: searchCounts[t.key],
              noun: TYPE_NOUN[t.key],
              go: () => setRecordType(t.key),
            }))
          : []
      }
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

  const filterPanel = (head?: React.ReactNode, top: React.ReactNode = savedViews) => (
    <FilterPanel f={eff} setF={setEff} facets={facets} me={me} head={head} hasIndustry={hasIndustry} hasRoles={hasRoles} top={top} />
  );
  // Hiring now: say how fresh the open roles are. "Last scan" is the last one that read the boards cleanly.
  const scan = view.scan;
  // Hiring now leads with the member's function: how many came in this week there and elsewhere, and one tap for every function.
  // Counted inside the Ideal Fractional Profile pill while it is on, so the line agrees with the list under it.
  const weekFit = icpApplies(eff, tab, me) ? icpTest(me.icp!) : null;
  const week = hireFn ? rolesThisWeek(infos, hireFn, (i) => !isFirm(i.c) && (!weekFit || weekFit(i.c))) : null;
  // None in their function here: say so, rather than list other functions as if they were theirs.
  const noneMine = !!hireFn && !!fnSplit && !qt && fnSplit.mine.length === 0 && filtered.length > 0 && !allFns && (
    <p className="tp-scanline hunt-fnline">
      <span>
        No open {hireFn} roles {weekFit ? "in your Ideal Fractional Profile " : ""}right now. These are in other functions.
      </span>
      {weekFit && (
        <button type="button" className="tp-flink" onClick={() => setEff({ ...eff, icp: false })}>
          Show everyone
        </button>
      )}
    </p>
  );
  const fnLine = hireFn && fnSplit && !qt && (fnSplit.mine.length > 0 || allFns) && (
    <p className="tp-scanline hunt-fnline">
      <span>
        <b className="num">{plural(week!.mine, `${hireFn} role`)}</b> this week · <span className="num">{week!.others}</span> in other functions
      </span>
      {fnOnly ? (
        <button type="button" className="tp-flink" onClick={() => setAllFns(true)}>
          Show all functions
        </button>
      ) : (
        <button type="button" className="tp-flink" onClick={() => setAllFns(false)}>
          Only {hireFn}
        </button>
      )}
    </p>
  );
  const scanLine = tab === "hiring" && scan && (
    <>
      {fnLine}
      {noneMine}
      <p className="tp-scanline">
        We check job boards for open fractional roles every week.
        {/* "The first check runs this week" only while nothing is listed yet: roles members added show before any scan. */}
        {scan.lastOkAt ? ` Last scan ${fmtStamp(scan.lastOkAt)}.` : scan.lastRunAt ? " The last scan could not read the job boards." : facets.tabs.hiring === 0 ? " The first check runs this week." : ""}
      </p>
    </>
  );
  /* ----- who the member hunts: the Ideal Fractional Profile pill and saved views ----- */
  const icpOn = icpApplies(eff, tab, me);
  // Confirmed matches and maybes (a part the profile asks for isn't on file), so the count says what it mixes (C17).
  const icpSplit = useMemo(() => {
    if (!icpOn) return null;
    let match = 0;
    for (const r of filtered) if (icpMatch(me.icp, r.i.c) === "match") match++;
    return { match, maybe: filtered.length - match };
  }, [icpOn, filtered, me.icp]);
  /*
   * The pill stays up while it narrows the list, a search included. It goes only where the profile
   * doesn't apply: a search widened to everything, and the member's own lists (Following, Unlocked).
   */
  const pill = page === "table" && !wide && !ICP_FREE_TABS.includes(tab) && (
    <IcpPill
      icp={me.icp}
      on={icpOn}
      everyone={facets.everyone}
      shownN={sorted.length}
      split={icpSplit}
      noun={noun as [string, string]}
      onEdit={() => setIcpOpen(true)}
      onToggle={() => setEff({ ...eff, icp: !eff.icp })}
    />
  );
  /** Under a search: what the profile and filters keep out, one tap to see it; or, widened, the way back. */
  const narrowWords = narrowedBy ? (narrowedBy.icp && narrowedBy.filters ? "your profile and filters" : narrowedBy.icp ? "your Ideal Fractional Profile" : "your filters") : "";
  const searchLine = qt && page === "table" && (wide || outside > 0) && (
    <p className="tp-scanline tp-searchline" role="status">
      {wide ? (
        <>
          <span>Searching everything. Your profile and filters are off for this search.</span>
          <button type="button" className="tp-flink" onClick={() => setSearchWide(false)}>
            Use them again
          </button>
        </>
      ) : (
        <>
          <span>
            <b className="num">{outside}</b> more {outside === 1 ? "match" : "matches"} outside {narrowWords}.
          </span>
          <button type="button" className="tp-flink" onClick={() => setSearchWide(true)}>
            Show {outside === 1 ? "it" : "them"}
          </button>
        </>
      )}
    </p>
  );
  const saveIcp = async ({ title, fn, icp: v }: ProfileEdit) => {
    const r = await act({ type: "profile", icp: v, title, function: fn ?? "" }, { quiet: true });
    if (!r.ok) return false;
    setFilters((f) => ({ ...f, icp: !icpEmpty(v) }));
    if (!icpEmpty(v) && !sortPicked) setSort(null);
    toast("Profile saved. The table now follows it.");
    return true;
  };
  const views = me.savedViews ?? [];
  /*
   * The view on screen, the way a saved view keeps it: the filters as they are, with the Ideal
   * Fractional Profile pill as a pill (icp), so reopening it matches the same companies the table
   * showed (a profile written out as hard Industry, Employees and Country filters dropped every
   * company whose country or size isn't on file: 34 became 0, C40). `spelled` names the view and
   * gives the weekly email what to look for.
   */
  const spelled = withIcpSpelled(eff, me.icp);
  const herePlace = absolutePlace({ t: recordType, v: tab, s: sortPicked, f: wide ? filters : eff, q, all: allFns });
  const currentView = views.find((v) => v.place === herePlace)?.id ?? null;
  const openView = (v: SavedViewRec) => {
    const c = v.criteria;
    // A search saved in Claude has no place: open its open roles from what it looks for.
    const x = v.place
      ? readPlace(me, v.place)
      : {
          t: "engagements" as RecordType,
          v: "hiring" as Tab,
          s: null,
          q: "",
          all: true,
          f: {
            ...EMPTY_FILTERS,
            fn: c.functions ?? (c.function ? [c.function] : []),
            industry: c.industry ?? [],
            employees: c.employees ?? [],
            revenue: c.revenue ?? [],
            country: c.country ?? [],
            hq: c.hq ? [c.hq] : [],
          } as Filters,
        };
    setPage("table");
    setDrawer(null);
    setPop(null);
    setSideOverlay(false);
    setRecordType(x.t);
    setSearchTab(null);
    setTabPicked(x.v);
    setSort(x.s);
    setFilters(x.f);
    setSearchWide(false);
    setQuery(x.q);
    setAllFns(x.all);
  };
  const saveView = async (name: string, email: boolean) => {
    const r = await act({ type: "savedView", op: "save", name, email, place: herePlace, criteria: criteriaOf(spelled, fnOnly ? hireFn : null) });
    return r.ok;
  };
  // "Best fit for you": the one line on why, worked out once per company while that sort is on.
  const fitWhy = useMemo(() => {
    if (sort !== "best") return null;
    const memo = new WeakMap<CoInfo, string>();
    return (i: CoInfo) => {
      let w = memo.get(i);
      if (w === undefined) memo.set(i, (w = bestFit(i, cellMe).reason));
      return w;
    };
  }, [sort, cellMe]);
  const savedViews = (
    <SavedViews
      views={views}
      current={currentView}
      onOpen={openView}
      onSave={() => setSaveOpen(true)}
      onEmail={(v, on) => void act({ type: "savedView", op: "email", id: v.id, on })}
      onRemove={(v) => void act({ type: "savedView", op: "delete", id: v.id })}
    />
  );
  /*
   * Every filter on, as a chip that takes it off, on phones too: an onboarding answer's filter
   * ("No fractional Sales yet") is never only a number on the Filters button (C47).
   */
  const chipRow = chips.length > 0 && (
    <div className="tp-chiprow" aria-label="Active filters">
      {chips.map((c) => {
        const fromGoal = presetOn.includes(c.id as ToggleKey);
        return (
          <button
            key={c.id}
            type="button"
            className="chip tp-achip"
            onClick={() => setEff(c.clear(eff))}
            aria-label={`Remove the filter ${chipLabel(c)}`}
            title={fromGoal ? "From your answer when you joined. Remove it and it stays off." : "Remove this filter"}
          >
            {chipLabel(c)} <IconX size={11} />
          </button>
        );
      })}
      <button type="button" className="tp-flink" onClick={clearFilters}>
        Clear all
      </button>
    </div>
  );
  // Following counts companies. On the seats or people list, say how many rows that is ("5 seats at 1 company").
  const followCos = tab === "following" && recordType !== "companies" ? new Set(sorted.map((r) => r.i.c.id)).size : 0;
  const followLine = followCos > 0 && (
    <p className="tp-scanline">
      {plural(sorted.length, noun[0], noun[1])} at {plural(followCos, "company", "companies")}
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
      <CellUiCtx.Provider value={cellUi}>
      <FitWhyCtx.Provider value={fitWhy}>
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
          listSwitch={typeSwitch}
          searchInList={phone && page === "table"}
          unread={unread}
          onMessages={() => (setEditor(null), setDrawer(null), setPage("messages"))}
          onMessagesPage={page === "messages"}
        />
        {me.asMember && (
          <div className="tp-asmember" role="status">
            <span>You&apos;re seeing what members see.</span>
            <button type="button" onClick={() => seeAsMember(false)}>
              Switch back
            </button>
          </div>
        )}

        {page === "credits" ? (
          <main className="tp-main tp-main-page">
            <MyCredits view={view} onBack={() => setPage("table")} refresh={refresh} onUseInClaude={() => setPage("integrations")} />
          </main>
        ) : page === "integrations" ? (
          <main className="tp-main tp-main-page">
            <Integrations onBack={() => setPage("table")} onCredits={() => setPage("credits")} section={claudeLink ? "claude" : undefined} />
          </main>
        ) : page === "rates" ? (
          <main className="tp-main tp-main-page">
            <Benchmarks view={view} refresh={refresh} onBack={() => setPage("table")} />
          </main>
        ) : page === "metrics" && view.admin ? (
          <main className="tp-main tp-main-page">
            <Admin view={view} refresh={refresh} onBack={() => setPage("table")} />
          </main>
        ) : page === "messages" ? (
          <main className="tp-main tp-main-page">
            <MessagesPage onBack={() => setPage("table")} openCompany={(id) => openCompany(id)} />
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
            {/* The search is a real field at the top of the list. While searching, the results come straight under it (DSGNP-5). */}
            {listSearch}
            {searchTypes}
            {qt ? null : banners}
            <div ref={listTopRef} className="tp-listtop" aria-hidden />
            {/*
              One sticky row: what to list (Companies, Seats or People, a menu), Filters (sort lives in its sheet) and the views,
              each with its count. The record type sits here, not in a row of its own, so the first card starts higher (decision 16).
            */}
            {pill}
            <div className="tp-pchips">
              <button type="button" className={`chip tp-pchip tp-pfilter${nFilters ? " chip-on" : ""}`} onClick={() => setSideOverlay(true)} aria-label={`Sort and filter${nFilters ? `, ${plural(nFilters, "filter")} on` : ""}`}>
                <IconFilter size={13} /> Filters{nFilters ? ` (${nFilters})` : ""}
              </button>
              {tabs}
            </div>
            {chipRow}
            {typeOpen && typeRef.current && (
              <Anchored anchor={typeRef.current} onClose={() => setTypeOpen(false)} width={240} className="tp-menu" label="What to list">
                {RECORD_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={recordType === t.key}
                    className={`tp-menu-item${recordType === t.key ? " on" : ""}`}
                    onClick={() => (setRecordType(t.key), setTypeOpen(false))}
                  >
                    <span>{t.label}</span>
                    <span className="tp-menu-hint num" title={typeTitle(t.key)}>
                      {typeCounts[t.key]}
                    </span>
                  </button>
                ))}
              </Anchored>
            )}
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
            {searchLine}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {countText}
            </p>
            {scanLine}
            {followLine}
            <div id="tp-results" tabIndex={-1} className="tp-presults">
              {empty || <CardList type={list.type} rows={list.rows} me={cellMe} onOpen={openRow} tab={tab} />}
            </div>
            {more}
            {proFoot}
            {/* The main action, labeled and in thumb reach (DSGNP-8). Not while searching: the keyboard has that space. */}
            {!recordOpen && !qt && (
              <button type="button" className="btn btn-primary tp-fab" onClick={() => openAdd()}>
                <IconPlus size={18} /> Add what you know
              </button>
            )}
          </main>
        ) : (
          <div className="tp-body">
            {layout === "desktop" && sideDocked && (
              <aside className="tp-side" aria-label="Filters">
                {filterPanel(
                  <div className="tp-filters-head">
                    <span className="tp-filters-title">Filters</span>
                    {nFilters > 0 && (
                      <button type="button" className="tp-flink" onClick={clearFilters}>
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
              {pill}
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
                <button type="button" className="tp-sortbtn tp-savebtn" onClick={() => setSaveOpen(true)} aria-pressed={!!currentView}>
                  {currentView ? "Saved view" : "Save this view"}
                </button>
                {sortMenu}
              </div>
              {chipRow}
              {searchLine}
              {scanLine}
              {followLine}
              <div className="tp-frame-box" ref={frameBoxRef}>
                <div className="tp-frame" ref={frameRef} id="tp-results" tabIndex={-1}>
                  {empty || (
                    <>
                      <DataTable
                        type={list.type}
                        rows={list.rows}
                        me={cellMe}
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
                    <button type="button" className="tp-flink" onClick={clearFilters}>
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
                  <button type="button" className="btn" onClick={clearFilters}>
                    Clear all
                  </button>
                )}
                <button type="button" className="btn btn-pine btn-lg tp-grow" onClick={() => setSideOverlay(false)}>
                  Show {plural(sorted.length, noun[0], noun[1])}
                </button>
              </div>
            }
          >
            {/* Saved views first: one tap opens one. */}
            {savedViews}
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
                {sortList.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} className={`chip tp-psort-o${sort === s.key ? " chip-on" : ""}`} onClick={() => setSort(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
            {filterPanel(null, null)}
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
        {icpOpen && <IcpSheet icp={me.icp} title={me.title} fn={me.function} companies={view.companies} onSave={saveIcp} onClose={() => setIcpOpen(false)} />}
        {saveOpen && (
          <SaveViewSheet key={herePlace} defaultName={viewName(spelled, tab, recordType, fnOnly ? hireFn : null, me.function)} emailOn={view.email} onSave={saveView} onClose={() => setSaveOpen(false)} />
        )}
        {editor && (
          <FactEditor
            key={`${editor.t.id}.${editor.t.field}`}
            anchor={editor.el}
            t={editor.t}
            initial={editor.initial}
            company={ownerOf.get(editor.t.id)?.c.hidden ? "this company" : ownerOf.get(editor.t.id)?.c.name ?? ""}
            ownRate={ownRateOf(editor.t)}
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
              // The way back to the table from any page. Marked while the member is on it.
              { label: "The table", current: page === "table", onClick: () => (setEditor(null), setDrawer(null), setPage("table")) },
              ...(phone ? [{ label: "Add what you know", onClick: () => openAdd() }] : []),
              // Saved views, newest first: one tap opens each (the filters list them all and manage them).
              ...[...views].reverse().slice(0, 5).map((v) => ({ label: v.name, hint: v.email ? "Weekly email" : undefined, current: page === "table" && currentView === v.id, onClick: () => openView(v) })),
              { label: "Your seats", hint: seatStats.missing ? `${seatStats.missing} missing` : undefined, onClick: () => openSeats() },
              { label: "Messages", badge: unread, current: page === "messages", onClick: () => (setEditor(null), setDrawer(null), setPage("messages")) },
              { label: "Your credits", onClick: () => (setDrawer(null), setPage("credits")) },
              { label: "Rate benchmarks", onClick: () => (setDrawer(null), setPage("rates")) },
              { label: "Integrations", hint: "Slack, Claude", current: page === "integrations", onClick: () => (setDrawer(null), setPage("integrations")) },
              ...(me.admin && view.admin ? [{ label: "Pilot metrics", onClick: () => (setDrawer(null), setPage("metrics")) }] : []),
              { label: "Your profile", hint: me.function ?? undefined, onClick: () => setIcpOpen(true) },
              { label: "Invite a fractional", hint: `+${REFERRAL_BONUS} credits each`, onClick: invite },
              { label: "Copy my sign-in link", onClick: () => copy(signInLink(me.token), "Sign-in link copied. It signs in as you, so keep it to yourself.") },
              // With email on: a one-time link by email, to open Merlin on another device.
              ...(view.email ? [{ label: "Send me a new sign-in link", onClick: () => void emailMeLink(toast) }] : []),
              // Admins only: the server builds the table as a member's (hidden companies hidden, no admin pages).
              ...(me.admin || me.asMember ? [{ label: "See it as a member", checked: !!me.asMember, onClick: () => seeAsMember(!me.asMember) }] : []),
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
      </FitWhyCtx.Provider>
      </CellUiCtx.Provider>
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
/** "Since your last visit you earned 10 credits from an invite and 2 from confirmations." */
function bonusText(invite: number, confirm: number) {
  const parts = [
    invite > 0 ? `${plural(invite, "credit")} from an invite` : "",
    confirm > 0 ? `${invite > 0 ? confirm : plural(confirm, "credit")} from ${confirm === 1 ? "a confirmation" : "confirmations"}` : "",
  ].filter(Boolean);
  return `Since your last visit you earned ${parts.join(" and ")}.`;
}

function CreditLine({ me, onShowAdd, label, inCard }: { me: Me; onShowAdd: () => void; label: string; inCard?: boolean }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  let text: string;
  let action = true;
  if (capped) {
    // A bonus that came in while the member was at the limit waits: say so, or it arrives without a word.
    const held = me.held > 0 ? ` ${plural(me.held, "bonus credit is", "bonus credits are")} waiting for then.` : "";
    text = `${me.credits <= 0 ? `You're out of credits, and you've earned today's ${me.earnCap}.` : `You've earned today's ${me.earnCap} credits.`} You can earn again ${atTime(me.earnResetsAt)}.${held}`;
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
  elsewhere = [],
}: {
  /** While searching: the other lists that have matches (one tap moves there). */
  elsewhere?: { n: number; noun: [string, string]; go: () => void }[];
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
  const say = (x: { n: number; noun: [string, string] }) => plural(x.n, x.noun[0], x.noun[1]);
  if (q && elsewhere.length) {
    // Universal search: nothing in this list, but another list has it.
    h = `No ${noun} match ${q}`;
    const list = elsewhere.map(say);
    p = `${list.length > 1 ? `${list[0]} and ${list[1]}` : list[0]} ${elsewhere.length === 1 && elsewhere[0].n === 1 ? "does" : "do"}.`;
    actions = elsewhere.map((x, k) => ({ label: `See ${say(x)}`, go: x.go, ...(k === 0 ? { kind: "pine" as const } : {}) }));
  } else if (q && narrowed) {
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
    } else if (tab === "repeat") {
      h = `No repeat hirers in these ${noun} yet`;
      p = "A company is listed here once it has 2 or more fractional hires on file, or hires in 2 or more functions. Open roles don't count as hires.";
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
