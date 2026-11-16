"use client";

/**
 * Trading Post, signed in. The shared record of fractional GTM work: who hired, for which
 * seat, who held it, at what rate.
 *
 *   top bar     search, credits, earn meter, "Add what you know", account menu
 *   sidebar     filters with counts (overlay under 1280px, bottom sheet on phones)
 *   content     the next-move card or Get started, record type, views, active filter chips, the table (cards on phones)
 *   pages       Your seats, My credits, Rate benchmarks (each replaces the table)
 *   overlays    record drawer, add modal, inline fact editor, credits popover
 *
 * One primary action per view: the volt "Add what you know" in the top bar. Ember shows up
 * twice at most: the count on Hiring now, and the dot on an open role.
 *
 * Keyboard: "/" search, "f" filters, "a" add, Esc closes, J/K steps through records.
 * Phones and tablets: the back gesture closes the top overlay before it leaves the page.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/tableTypes";
import type { Me } from "@/lib/tableTypes";
import { IconChevron, IconFilter, IconPlus, IconX, useToast, type Act, type View } from "../ui/shared";
import {
  COMPANY_FILL, EMPTY_FILTERS, RECORD_TYPES, SORTS, TABS, activeChips, activeCount, applyFilters, cellKey, deriveAll, hasRoleDates, mySeats, newRolesFor, rowsFor,
  seatsMissing, shown, sortRows,
  type CoInfo, type FactRef, type Filters, type RecordType, type Row, type SortKey, type Tab,
} from "./model";
import { fmtTime, useLayout, useStoredFlag, store, plural } from "./hooks";
import { UiCtx, FactEditor, Anchored, Pro, Sheet, type AddOpts, type Ui } from "./ui";
import { Seats } from "./Seats";
import { NextMove, earnRoom, pickMove, useMoveDismissals } from "./NextMove";
import { AvatarMenu, CreditsPopover, TopBar } from "./TopBar";
import { FilterPanel } from "./Filters";
import { DataTable } from "./Tables";
import { CardList } from "./Cards";
import { Drawer } from "./Drawer";
import { AddModal } from "./AddModal";
import { MyCredits, inviteLink, signInLink, useCopy } from "./Credits";
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

type DrawerState = { id: string; rowKey: string; focus: string | null };
type EditorState = { el: HTMLElement; t: FactRef; initial?: string };

export default function TradingPost({ view, act, refresh, signOut }: TradingPostProps) {
  const me = view.me!;
  const layout = useLayout();
  const phone = layout === "phone";
  const toast = useToast();
  const copy = useCopy();

  /* ----- personalised defaults from onboarding ----- */
  const [recordType, setRecordType] = useState<RecordType>(() => (me.goal === "intro" ? "engagements" : "companies"));
  const [tab, setTab] = useState<Tab>(() => (me.goal === "friendly" ? "friendly" : "all"));
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    notMine: me.goal === "adjacent" && !!me.function,
    fractionalNamed: me.goal === "intro",
  }));
  const [sort, setSort] = useState<SortKey>("fit");
  const [query, setQuery] = useState("");
  // The input stays instant; the list behind it renders when the main thread is free.
  const q = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE);
  const [page, setPage] = useState<"table" | "credits" | "rates" | "seats" | "metrics">("table");
  const [seatFocus, setSeatFocus] = useState<string | null>(null);
  const [moveOff, dismissMove] = useMoveDismissals();

  /* ----- overlays ----- */
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [addOpts, setAddOpts] = useState<AddOpts | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pop, setPop] = useState<"credits" | "menu" | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sideDocked, setSideDocked] = useState(true);
  const [sideOverlay, setSideOverlay] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const [pulse, setPulse] = useState<string | null>(null);
  const [introOff, hideIntro] = useStoredFlag("tp_intro_off");
  const [checkOff, hideCheck] = useStoredFlag("tp_check_off");
  const [sinceOff, setSinceOff] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const creditsRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

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
  const seatStats = useMemo(() => ({ n: seats.length, missing: seatsMissing(seats) }), [seats]);
  const allRows = useMemo(() => rowsFor(recordType, infos), [recordType, infos]);
  const { rows: filtered, facets } = useMemo(() => applyFilters(allRows, filters, tab, q, me), [allRows, filters, tab, q, me]);
  const sorted = useMemo(() => sortRows(filtered, sort, tab === "needs"), [filtered, sort, tab]);
  const visible = useMemo(() => sorted.slice(0, limit), [sorted, limit]);
  // Counts and sheets update on the next frame; the long list behind them follows when it can.
  // The record type travels with its rows, so a deferred list never renders rows of another type.
  const listData = useMemo(() => ({ type: recordType, rows: visible }), [recordType, visible]);
  const list = useDeferredValue(listData);
  const nFilters = activeCount(filters);
  const chips = activeChips(filters);
  // The sidebar names the member's function ("No Sales seat yet"), so the chip does too.
  const chipLabel = (c: { id: string; label: string }) => (c.id === "notMine" && me.function ? `No ${me.function} seat yet` : c.label);

  useEffect(() => {
    setLimit(PAGE);
    frameRef.current?.scrollTo({ top: 0, left: 0 });
  }, [recordType, tab, filters, q, sort]);

  // Followed companies with news since the last visit (frozen at load).
  const [since] = useState(() => {
    const prev = previousVisit();
    if (!prev) return { at: null as string | null, n: 0 };
    return { at: prev, n: view.companies.filter((c) => c.following && c.updatedAt && c.updatedAt > prev).length };
  });

  /* ----- actions ----- */
  const firstUnlock = me.unlocked === 0;
  const unlock = useCallback(
    async (t: FactRef) => {
      const k = cellKey(t.id, t.field);
      setBusy((s) => new Set(s).add(k));
      const r = await act({ type: "unlock", entity: t.entity, id: t.id, field: t.field }, { quiet: true });
      setBusy((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
      if (r.ok) {
        if (t.field === "identity") toast(r.message);
        else if (firstUnlock) toast("Unlocked. It stays visible to you from now on. Add a fact you know and you earn the credit back.");
        setPulse((p) => (p === k ? null : p));
        setFlash((s) => new Set(s).add(k));
        setTimeout(() => setFlash((s) => {
          const n = new Set(s);
          n.delete(k);
          return n;
        }), 2200);
      }
    },
    [act, firstUnlock, toast],
  );
  const unlockMany = useCallback(
    async (items: FactRef[]) => {
      const keys = items.map((t) => cellKey(t.id, t.field));
      setBusy((s) => new Set([...s, ...keys]));
      const r = await act({ type: "unlockMany", items: items.map(({ entity, id, field }) => ({ entity, id, field })) });
      setBusy((s) => new Set([...s].filter((k) => !keys.includes(k))));
      if (r.ok) {
        setFlash((s) => new Set([...s, ...keys]));
        setTimeout(() => setFlash((s) => new Set([...s].filter((k) => !keys.includes(k)))), 2200);
      }
      return r.ok;
    },
    [act],
  );
  const fill = useCallback(
    async (t: FactRef, value: string, memberId?: string | null) =>
      (await act({ type: "fill", entity: t.entity, id: t.id, field: t.field, value, ...(memberId ? { memberId } : {}) })).ok,
    [act],
  );
  const edit = useCallback((el: HTMLElement, t: FactRef, initial?: string) => {
    setPop(null);
    setEditor({ el, t, initial });
  }, []);
  /** Empty facts that earn a credit at the company owning a record: company facts first, then free engagement facts. */
  const addable = useCallback(
    (id: string): FactRef[] => {
      const i = ownerOf.get(id);
      if (!i || i.c.hidden) return [];
      const out: FactRef[] = [];
      for (const f of COMPANY_FILL) if (i.c.cells[f]?.s === "empty") out.push({ entity: "company", id: i.c.id, field: f });
      for (const e of i.engs) for (const f of ["function", "type", "start"]) if (e.cells[f]?.s === "empty") out.push({ entity: "engagement", id: e.id, field: f });
      return out.slice(0, 3);
    },
    [ownerOf],
  );
  const sortedRef = useRef(sorted);
  sortedRef.current = sorted;
  const openCompany = useCallback((id: string, focus?: string) => {
    const rows = sortedRef.current;
    const row = rows.find((r) => r.i.c.id === id && (!focus || r.key === focus)) ?? rows.find((r) => r.i.c.id === id);
    setDrawer({ id, rowKey: row?.key ?? id, focus: focus ?? null });
    setPage("table");
  }, []);
  const openSeats = useCallback((engagementId?: string) => {
    setEditor(null);
    setPop(null);
    setDrawer(null);
    setSeatFocus(engagementId ?? null);
    setPage("seats");
  }, []);
  /** A record at a company whose name is hidden until the member unlocks it. */
  const isHidden = useCallback((id: string) => !!ownerOf.get(id)?.c.hidden, [ownerOf]);
  const openAdd = useCallback(
    (o?: AddOpts) => {
      setEditor(null);
      setPop(null);
      if (o?.companyId && isHidden(o.companyId)) {
        toast("Unlock this company first. Then you can add what you know about it.");
        return;
      }
      setAddOpts(o ?? {});
    },
    [isHidden, toast],
  );
  const openRow = useCallback((r: Row) => {
    setEditor(null);
    setDrawer({ id: r.i.c.id, rowKey: r.key, focus: r.p ? r.p.id : r.e ? r.e.id : null });
  }, []);
  const step = useCallback(
    (d: 1 | -1) => {
      if (!drawer || !sorted.length) return;
      const idx = sorted.findIndex((r) => r.key === drawer.rowKey);
      const next = sorted[Math.max(0, Math.min(sorted.length - 1, idx < 0 ? 0 : idx + d))];
      if (!next) return;
      const nIdx = sorted.indexOf(next);
      if (nIdx >= limit) setLimit((l) => Math.max(l, nIdx + 1));
      openRow(next);
      setTimeout(() => document.querySelector(`[data-row="${next.key}"]`)?.scrollIntoView({ block: "nearest" }));
    },
    [drawer, sorted, limit, openRow],
  );
  const invite = useCallback(() => {
    copy(inviteLink(me.inviteCode), `Invite link copied. You both get ${REFERRAL_BONUS} credits when they add their first fact.`);
  }, [copy, me.inviteCode]);

  /**
   * The fact the guided steps point at. Adding: free company facts only (industry, size, HQ,
   * revenue), never a guess at a role, rate or who held a seat. Unlocking: the seat holder
   * first for intro seekers, else the role. Followed companies first, then seats in the
   * member's own function, then the current sort.
   */
  const firstFact = useCallback(
    (want: Cell["s"]): { t: FactRef; row: Row; idx: number } | null => {
      const fnOf = (r: Row) => shown((r.e ?? r.i.latest)?.cells.function);
      const mineFn = (r: Row) => (me.function && fnOf(r) === me.function ? 1 : 0);
      const order = sorted
        .map((r, idx) => ({ r, idx }))
        .sort((a, b) => Number(b.r.i.c.following) - Number(a.r.i.c.following) || mineFn(b.r) - mineFn(a.r) || a.idx - b.idx);
      const lockedFields = me.goal === "intro" ? ["operator", "role", "rate"] : ["role", "operator", "rate"];
      for (const { r, idx } of order) {
        const cands: [FactRef, Cell | undefined][] = [];
        if (want === "empty") {
          for (const f of ["industry", "employees", "hq", "revenue"]) cands.push([{ entity: "company", id: r.i.c.id, field: f }, r.i.c.cells[f]]);
        } else if (r.p) {
          for (const f of ["name", "email", "linkedin", "phone"]) cands.push([{ entity: "contact", id: r.p.id, field: f }, r.p.cells[f]]);
        } else {
          const e = r.e ?? r.i.latest;
          // A phone company card shows the role, then the rate (or who held the seat when no rate is on file).
          const onCard = (f: string) => !phone || r.e || f === "role" || (f === "rate" ? e?.cells.rate?.s !== "empty" || e?.cells.operator?.s === "empty" : e?.cells.rate?.s === "empty" && e?.cells.operator?.s !== "empty");
          if (e) for (const f of lockedFields) if (onCard(f)) cands.push([{ entity: "engagement", id: e.id, field: f }, e.cells[f]]);
        }
        const hit = cands.find(([, c]) => c?.s === want);
        if (hit) return { t: hit[0], row: r, idx };
      }
      return null;
    },
    [sorted, me.function, me.goal, phone],
  );
  const showFact = useCallback(
    (want: "locked" | "empty") => {
      setPage("table");
      setDrawer(null);
      const hit = firstFact(want);
      if (!hit) {
        toast(want === "locked" ? "Nothing is locked in this view. Clear your filters to see more." : "Nothing is missing in this view. Clear your filters to see more.");
        return;
      }
      if (hit.idx >= limit) setLimit(hit.idx + 1);
      const k = cellKey(hit.t.id, hit.t.field);
      setTimeout(() => {
        // Company cells are not on screen in the Engagements and People views (or on phone cards): use the row.
        const el = document.querySelector<HTMLElement>(`[data-cell="${k}"]`) ?? document.querySelector<HTMLElement>(`[data-row="${hit.row.key}"]`);
        el?.scrollIntoView({ block: "center", inline: "nearest" });
        if (want === "locked") {
          setPulse(k);
          setTimeout(() => setPulse((p) => (p === k ? null : p)), 6000);
        } else if (el || phone) setTimeout(() => setEditor({ el: el ?? document.body, t: hit.t }), 250); // phones edit in a sheet
      }, 60);
    },
    [firstFact, limit, toast, phone],
  );

  /* ----- closing overlays: Esc, the back gesture ----- */
  const toggleFilters = useCallback(() => {
    if (layout === "desktop") setSideDocked((x) => !x);
    else setSideOverlay((x) => !x);
  }, [layout]);
  /** Close the overlay on top. */
  const closeTop = useCallback(() => {
    if (editor) setEditor(null);
    else if (pop) setPop(null);
    else if (sortOpen) setSortOpen(false);
    else if (addOpts) setAddOpts(null);
    else if (drawer) setDrawer(null);
    else if (sideOverlay) setSideOverlay(false);
    else if (page !== "table") setPage("table");
  }, [editor, pop, sortOpen, addOpts, drawer, sideOverlay, page]);
  const closeTopRef = useRef(closeTop);
  closeTopRef.current = closeTop;
  // Phones and tablets: one history entry while anything is open, so back closes it instead of leaving.
  const skipPop = useRef(false);
  useEffect(() => {
    if (layout === "desktop") return;
    const open = !!(editor || pop || sortOpen || addOpts || drawer || sideOverlay || page !== "table");
    const ours = window.history.state?.tp === 1;
    if (open && !ours) window.history.pushState({ tp: 1 }, "");
    else if (!open && ours) {
      skipPop.current = true;
      window.history.back();
    }
  }, [editor, pop, sortOpen, addOpts, drawer, sideOverlay, page, layout]);
  useEffect(() => {
    const onPop = () => {
      if (skipPop.current) {
        skipPop.current = false;
        return;
      }
      closeTopRef.current(); // if another overlay is still open, the effect above pushes a new entry
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ----- keyboard ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape") {
        if (el === searchRef.current) return;
        closeTop();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (addOpts || editor) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "f" && page === "table") {
        e.preventDefault();
        toggleFilters();
      } else if (e.key === "a") {
        e.preventDefault();
        openAdd();
      } else if (drawer && (e.key === "j" || e.key === "ArrowDown")) {
        e.preventDefault();
        step(1);
      } else if (drawer && (e.key === "k" || e.key === "ArrowUp")) {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTop, addOpts, editor, drawer, page, toggleFilters, openAdd, step]);

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

  const ui: Ui = useMemo(
    () => ({ me, act, layout, busy, flash, pulse, unlock, unlockMany, edit, fill, openCompany, openAdd, addable, isHidden, seats: seatStats, openSeats }),
    [me, act, layout, busy, flash, pulse, unlock, unlockMany, edit, fill, openCompany, openAdd, addable, isHidden, seatStats, openSeats],
  );

  const drawerInfo = drawer ? byId.get(drawer.id) ?? null : null;
  const drawerPos = drawer ? sorted.findIndex((r) => r.key === drawer.rowKey) : -1;
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const noun = recordType === "companies" ? ["company", "companies"] : recordType === "engagements" ? ["engagement", "engagements"] : ["person", "people"];
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
      onSeats={() => openSeats()}
    />
  );

  // The guidance slot holds one thing: credits running out, then a waiting invite bonus, then Get started, then the first-visit strip.
  const guide: "credits" | "invite" | "check" | "intro" | null =
    me.credits <= 3 || capped ? "credits" : me.invitePending && me.added === 0 ? "invite" : !checkOff ? "check" : !introOff && me.added + me.unlocked === 0 ? "intro" : null;
  // The next-move card: the single most urgent thing. Never together with Get started, whose second step points at the seats instead.
  // The roles card has done its job once the member is looking at Hiring now.
  const picked = guide === "check" ? null : pickMove(me, seatStats, view.scan?.mine7 ?? 0, moveOff);
  const move = picked === "roles" && tab === "hiring" ? null : picked;
  const newRoles = move === "roles" ? newRolesFor(infos, me.function) : { roles: 0, hidden: 0 };
  const seeOpenRoles = () => {
    setPage("table");
    setDrawer(null);
    setQuery("");
    setRecordType("engagements");
    setTab("hiring");
    setSort("newest");
    setFilters({ ...EMPTY_FILTERS, fn: me.function ? [me.function] : [] });
  };

  const banners = (
    <div className="tp-banners">
      {move && (
        <NextMove
          kind={move}
          me={me}
          seats={seatStats}
          roles={{ n: view.scan?.mine7 ?? 0, hidden: newRoles.hidden }}
          onSeats={() => openSeats()}
          onRoles={seeOpenRoles}
          onDismiss={dismissMove}
        />
      )}
      {guide === "credits" ? (
        // When the card already says to fill in the seats, the strip would say it twice.
        move === "roles" || !move ? <CreditLine me={me} onShowAdd={() => showFact("empty")} /> : null
      ) : guide === "invite" ? (
        <Strip
          actions={
            <button type="button" className="btn btn-sm" onClick={() => showFact("empty")}>
              Show me one to add
            </button>
          }
        >
          Your {REFERRAL_BONUS} invite credits arrive when you add your first fact.
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
          Welcome back. {sinceText(since.n)}
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
    <div className="tp-rtype" role="tablist" aria-label="What to list">
      {RECORD_TYPES.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={recordType === t.key} className={`tp-rtype-b${recordType === t.key ? " on" : ""}`} onClick={() => setRecordType(t.key)}>
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
          {/* The count on Hiring now is the screen's one solid ember: open roles you can win today. */}
          <span className={`num tp-cnt${t.key === "hiring" && facets.tabs.hiring > 0 ? " tp-cnt-live" : ""}`}>{facets.tabs[t.key]}</span>
        </button>
      ))}
    </nav>
  );

  const empty = sorted.length === 0 && (
    <Empty
      q={q.trim()}
      tab={tab}
      noun={noun[1]}
      filtered={nFilters > 0}
      onClearFilters={() => setFilters(EMPTY_FILTERS)}
      onSearchAll={searchAll}
      onBrowse={clearAll}
      onAdd={() => openAdd({ query: q.trim() || undefined })}
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
    <FilterPanel f={filters} setF={setFilters} facets={facets} me={me} head={head} hasIndustry={hasIndustry} hasRoles={hasRoles} />
  );
  // Hiring now: say how fresh the open roles are.
  const scanLine = tab === "hiring" && view.scan && (
    <p className="tp-scanline">
      We check job boards for open fractional roles every week. {view.scan.lastRunAt ? `Last checked ${fmtStamp(view.scan.lastRunAt)}.` : "The first check runs this week."}
    </p>
  );
  const qt = q.trim();

  /* ----- layout ----- */
  return (
    <UiCtx.Provider value={ui}>
      <div className={`tp-app tp-${layout}`}>
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
            <Seats seats={seats} focus={seatFocus} onBack={() => setPage("table")} />
          </main>
        ) : phone ? (
          <main className="tp-main tp-main-phone">
            {banners}
            {recordSwitch}
            <div className="tp-pchips">
              <button type="button" className={`chip tp-pchip tp-pfilter${nFilters ? " chip-on" : ""}`} onClick={() => setSideOverlay(true)}>
                <IconFilter size={13} /> Filters{nFilters ? ` (${nFilters})` : ""}
              </button>
              {tabs}
            </div>
            <div className="tp-pcount">
              <span>
                {qt && tab !== "all" ? (
                  <>
                    <b className="num">{sorted.length}</b> of <span className="num">{facets.tabs.all}</span> matching <span className="tp-q">{qt}</span>{" "}
                    <button type="button" className="tp-flink" onClick={() => setTab("all")}>
                      Show all
                    </button>
                  </>
                ) : (
                  <>
                    <b className="num">{sorted.length}</b> {sorted.length === 1 ? noun[0] : noun[1]}
                    {qt && (
                      <>
                        {" "}
                        matching <span className="tp-q">{qt}</span>
                      </>
                    )}
                  </>
                )}
              </span>
              {sortMenu}
            </div>
            {scanLine}
            {empty || <CardList type={list.type} rows={list.rows} me={me} onOpen={openRow} />}
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
              {banners}
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
                <span className="tp-count">
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
                    <button key={c.id} type="button" className="chip tp-achip" onClick={() => setFilters(c.clear(filters))} aria-label={`Remove the filter ${chipLabel(c)}`} title="Remove this filter">
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
                <div className="tp-frame" ref={frameRef}>
                  {empty || (
                    <>
                      <DataTable type={list.type} rows={list.rows} me={me} selected={drawer?.rowKey ?? null} onOpen={openRow} newSince={since.at} />
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
          <div className="tp-side-wrap" onMouseDown={(e) => e.target === e.currentTarget && setSideOverlay(false)}>
            <aside className="tp-side tp-side-overlay" aria-label="Filters">
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
            </aside>
          </div>
        )}
        {sideOverlay && phone && (
          <Sheet
            title={
              <span>
                Filters {nFilters > 0 && <span className="num tp-cnt">{nFilters}</span>}
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
            {filterPanel(null)}
          </Sheet>
        )}

        {drawer && drawerInfo && page === "table" && (
          <Drawer
            i={drawerInfo}
            focus={drawer.focus}
            onClose={() => setDrawer(null)}
            onStep={step}
            pos={drawerPos >= 0 ? { n: drawerPos + 1, of: sorted.length } : null}
            phone={phone}
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
            items={[
              ...(phone ? [{ label: "Add what you know", onClick: () => openAdd() }] : []),
              { label: "Your seats", hint: seatStats.missing ? `${seatStats.missing} missing` : undefined, onClick: () => openSeats() },
              { label: "My credits", onClick: () => (setDrawer(null), setPage("credits")) },
              { label: "Rate benchmarks", onClick: () => (setDrawer(null), setPage("rates")) },
              ...(me.admin && view.admin ? [{ label: "Pilot metrics", onClick: () => (setDrawer(null), setPage("metrics")) }] : []),
              { label: "Invite a fractional", hint: `+${REFERRAL_BONUS} credits each`, onClick: invite },
              { label: "Copy my sign-in link", onClick: () => copy(signInLink(me.token), "Sign-in link copied. It signs in as you, so keep it to yourself.") },
              { label: "Sign out", onClick: () => void signOut() },
            ]}
          />
        )}
      </div>
    </UiCtx.Provider>
  );
}

/* ---------- the credit line and the empty states ---------- */

/**
 * Running low, out, or at today's cap: one calm line with one action. No ember here. The
 * balance in the top bar already carries it.
 */
function CreditLine({ me, onShowAdd }: { me: Me; onShowAdd: () => void }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  if (capped)
    return (
      <Strip>
        {me.credits <= 0 ? `You're out of credits, and you've earned today's ${me.earnCap}.` : `You've earned today's ${me.earnCap} credits.`} Earning reopens {fmtTime(me.earnResetsAt)}.
      </Strip>
    );
  if (me.credits > 3) return null;
  return (
    <Strip
      actions={
        <button type="button" className="btn btn-sm" onClick={onShowAdd}>
          Show me one to add
        </button>
      }
    >
      {me.credits <= 0 ? "You're out of credits." : `You have ${plural(me.credits, "credit")} left.`} Add a fact you know and you earn one{me.credits <= 0 ? " back" : ""}.
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
  onSearchAll,
  onBrowse,
}: {
  q: string;
  tab: Tab;
  noun: string;
  filtered: boolean;
  onAdd: () => void;
  onClearFilters: () => void;
  onSearchAll: () => void;
  onBrowse: () => void;
}) {
  const narrowed = filtered || tab !== "all";
  let h: string;
  let p: string;
  let action: { label: string; go: () => void; primary?: boolean };
  if (q && narrowed) {
    h = `Nothing in this view matches ${q}`;
    p = `Your ${filtered ? "filters" : "view"} may be hiding it. Search all ${noun} instead.`;
    action = { label: `Search all ${noun}`, go: onSearchAll };
  } else if (q) {
    h = `We have nothing on ${q} yet`;
    p = "If you know them, add them. You earn a credit for each fact.";
    action = { label: q.length > 24 ? "Add it" : `Add ${q}`, go: onAdd, primary: true };
  } else if (filtered) {
    h = `No ${noun} match these filters`;
    p = "Take one off, or clear them all.";
    action = { label: "Clear filters", go: onClearFilters };
  } else {
    const all = { label: "See all companies", go: onBrowse };
    if (tab === "following") {
      h = "You're not following any companies yet";
      p = "Open a company and choose Follow. When someone adds a fact there, you'll see it here. Following is free.";
      action = all;
    } else if (tab === "unlocked") {
      h = "You haven't unlocked anything yet";
      p = "What you unlock stays visible to you, and its company is listed here.";
      action = all;
    } else if (tab === "hiring") {
      h = "No open fractional roles right now";
      p = "We check job boards every week. New roles are listed here as we find them.";
      action = all;
    } else if (tab === "needs") {
      h = "Nothing is missing here";
      p = "Every company has its website, industry, size, revenue, HQ and LinkedIn on file.";
      action = all;
    } else if (tab === "friendly") {
      h = `No fractional-friendly ${noun} yet`;
      p = "A company is listed here once it has an open fractional role or a fit score of 30 or more.";
      action = all;
    } else {
      h = `No ${noun} on file yet`;
      p = "Add a company you know. You earn a credit for each fact.";
      action = { label: "Add what you know", go: onAdd, primary: true };
    }
  }
  return (
    <div className="tp-noresults">
      <h3>{h}</h3>
      <p>{p}</p>
      <div className="tp-noresults-acts">
        <button type="button" className={`btn${action.primary ? " btn-primary" : ""}`} onClick={action.go}>
          {action.primary && <IconPlus size={14} />} {action.label}
        </button>
      </div>
    </div>
  );
}
