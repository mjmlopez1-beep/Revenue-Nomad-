"use client";

/**
 * Companies as a workbench (Main.dc.html, behind RN_UI2): the toolbar, the ideal-client line, the
 * Ask Merlin row, the bulk bar, the table with its fill rates, the Tools panel, and the bottom tabs
 * with the status line. A phone gets the card list (Cards.tsx), as today.
 *
 * It renders inside the app's Ui and CellUi providers (TradingPost), so every cell's lock spends
 * through the app's own unlock, and bulk runs through its unlockMany after one quote and one
 * confirm (SelectionBar, RunConfig). Its props are what the shell's AppCtx carries (view, infos, me,
 * openCompany, openPage, refresh), taken as an explicit object so the page registry can pass them.
 *
 * First visit (no company opened yet): pre-filtered to the ideal client and saying so, one
 * highlighted lock on the first row ("Open your first company. Free on the trial"), Tools closed,
 * and a one-line strip that moves to the next step (save the list with an alert) once it opens.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COMPANY_PRICE, RN_EMPLOYEES, RN_REVENUE } from "@/lib/tableFields";
import type { Me, View } from "@/lib/tableTypes";
import { bestBuyer, buyerNoteMove, moveSent } from "@/lib/moves";
import { IconLock, IconX, useToast } from "../../ui/shared";
import { openPlans } from "../Billing";
import { CardList } from "../Cards";
import { FilterPanel } from "../Filters";
import { SaveViewSheet } from "../Hunt";
import { NoteSheet } from "../MoveNote";
import { PassSheet } from "../PeerSheets";
import { useLayout, store } from "../hooks";
import {
  EMPTY_FILTERS, TABS, absolutePlace, activeCount, applyFilters, bandRange, criteriaOf, icpEmpty, rowsFor, sortFor, sortRows, withIcpSpelled,
  type CoInfo, type Filters, type RecordType, type Row, type SortKey, type Tab,
} from "../model";
import { useUi, type AppPage } from "../ui";
import { pipelineAct } from "../pipelineStore";
import { colsOf, withCols } from "../place";
import { BottomTabs } from "./BottomTabs";
import { columnOf, defaultCols, fillRate, visibleColumns } from "./columns";
import { SelectionBar } from "./SelectionBar";
import { StatusLine } from "./StatusLine";
import { Toolbar, type ViewOption } from "./Toolbar";
import { ToolsPanel } from "./ToolsPanel";
import type { ToolDo, ToolTab } from "./tools";
import { Workbench } from "./Workbench";
import "./workbench.css";

/**
 * The list's place as the shell keeps it (shell/pages.tsx TableCtx): with it the view, the filters
 * and the sort are the app's own, so the address, a saved list opened from Home or Find, and the
 * header's breadcrumb all follow the workbench. Without it (the tests) the workbench keeps its own.
 */
export interface WorkbenchBind {
  tab: Tab;
  setTab: (t: Tab) => void;
  /** The filters, with `icp` on for the ideal-client view. */
  filters: Filters;
  setFilters: (f: Filters) => void;
  /** The member's own sort, or null for the view's default. */
  sort: SortKey | null;
  setSort: (s: SortKey | null) => void;
  /** The saved list on screen: its name and its columns (empty: the member's own). */
  listName?: string | null;
  listCols?: string[] | null;
}

/** What Ask Merlin's bar puts on the workbench: filters, a sort, columns to show. */
export interface WorkbenchAsk {
  filters?: Filters;
  sort?: SortKey | null;
  cols?: string[];
}

export interface CompaniesWorkbenchProps {
  view: View;
  infos: CoInfo[];
  me: Me;
  openCompany: (id: string, focus?: string) => void;
  openPage: (p: AppPage) => void;
  refresh: () => void;
  /** Ask Merlin's bar (F4), handed what it may set here. Without it the row keeps its quick chips. */
  askBar?: ReactNode | ((apply: (x: WorkbenchAsk) => void) => ReactNode);
  /** First visit, from the shell's firstVisit.ts. Without it: no company opened yet. */
  first?: boolean;
  /** The shell's place for the list (see WorkbenchBind). */
  bind?: WorkbenchBind;
  /** The strips dismissed (Profile.stripsOff, by key), and dismissing one. Without them a dismissal lasts this visit. */
  stripOff?: (key: string) => boolean;
  onStripOff?: (key: string) => void;
  /** Your network is on (RN_GOOGLE): the member's contacts are a source. */
  network?: boolean;
  /** Open the ideal-client sheet ("Change your ideal client"). */
  onEditIcp?: () => void;
  /** Open the plans for a gated item (the Close pill, a Pro signal). */
  onUpgrade?: (from: "evidence" | "signals" | "proposal") => void;
}

type ViewKey = "icp" | Tab;
const PAGE = 50;
const TYPE_TITLE: Record<RecordType, string> = { companies: "Companies", people: "People at these companies", engagements: "Seats at these companies" };
const colsKey = (memberId: string, t: RecordType) => `wb_cols_${memberId}_${t}`;
/** The columns in this browser for a list type (the fallback when the address and the list say none). */
const storedCols = (memberId: string, t: RecordType): string[] | null => {
  try {
    const x = JSON.parse(store.get(colsKey(memberId, t)) ?? "null");
    return Array.isArray(x) && x.every((v) => typeof v === "string") ? x : null;
  } catch {
    return null;
  }
};
/**
 * The columns a list opens with: for companies, the address's `cols=` (place.ts colsOf, so a reload or
 * a shared link keeps them), then the saved list's own; then this browser's; then the defaults.
 */
const readCols = (memberId: string, t: RecordType, listCols?: string[] | null): string[] => {
  const fromAddress = t === "companies" && typeof window !== "undefined" ? colsOf(window.location.search) : null;
  return fromAddress ?? (t === "companies" && listCols?.length ? listCols : null) ?? storedCols(memberId, t) ?? defaultCols(t);
};
/** The companies' columns in the address (`cols=`), none while they are the defaults. */
const writeColsAddress = (cols: string[]) => {
  try {
    const def = defaultCols("companies");
    const same = cols.length === def.length && cols.every((c, k) => c === def[k]);
    const next = `${window.location.pathname}${withCols(window.location.search, same ? null : cols)}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  } catch {
    /* the address stays as it is */
  }
};

/** The ideal client in chips: "Function: Sales", "Industries: SaaS, Fintech", "Size: 11 to 500 people". */
function icpChips(me: Me): string[] {
  const icp = me.icp;
  const out: string[] = [];
  if (me.function) out.push(`Function: ${me.function}`);
  if (!icp) return out;
  if (icp.industries.length) out.push(`Industries: ${icp.industries.join(", ")}`);
  if (icp.employees.length) out.push(`Size: ${bandRange(RN_EMPLOYEES, icp.employees)} people`);
  if (icp.revenue.length) out.push(`Revenue: ${bandRange(RN_REVENUE, icp.revenue)}`);
  if (icp.countries.length) out.push(`Where: ${icp.countries.join(", ")}`);
  return out;
}

export function CompaniesWorkbench({ view, infos, me, openCompany, openPage, askBar, first: firstProp, bind, stripOff: stripGone, onStripOff, network = false, onEditIcp, onUpgrade }: CompaniesWorkbenchProps) {
  const ui = useUi();
  const toast = useToast();
  const layout = useLayout();
  const live = ui.me;
  const hasIcp = !icpEmpty(me.icp);
  // Read once, when the page opens: opening the first company here moves the strip on to the next step, it doesn't end the first visit.
  const [first] = useState(() => firstProp ?? !(me.companiesUnlocked ?? 0));
  // A gated item opens the plans (Billing.tsx's host), unless the shell passes its own.
  const upgrade = onUpgrade ?? ((from: "evidence" | "signals" | "proposal") => openPlans(from === "signals" ? "billing" : "proposals"));

  const [type, setType] = useState<RecordType>("companies");
  // The view, the filters and the sort: the shell's (bind), else the workbench's own.
  const [viewKeyOwn, setViewKeyOwn] = useState<ViewKey>(hasIcp ? "icp" : "all");
  const [filtersOwn, setFiltersOwn] = useState<Filters>(EMPTY_FILTERS);
  const [sortOwn, setSortOwn] = useState<SortKey | null>(null);
  const viewKey: ViewKey = bind ? (bind.tab === "all" && bind.filters.icp && hasIcp ? "icp" : bind.tab) : viewKeyOwn;
  const bound = bind?.filters;
  const filters: Filters = useMemo(() => (bound ? { ...bound, icp: false } : filtersOwn), [bound, filtersOwn]);
  const setFilters = (f: Filters) => (bind ? bind.setFilters({ ...f, icp: viewKey === "icp" && hasIcp }) : setFiltersOwn(f));
  const setViewKey = (k: ViewKey) => {
    if (!bind) return setViewKeyOwn(k);
    bind.setTab(k === "icp" ? "all" : k);
    bind.setFilters({ ...filters, icp: k === "icp" });
  };
  const sortPicked = bind ? bind.sort : sortOwn;
  const setSort = bind ? bind.setSort : setSortOwn;
  const [pageSize, setPageSize] = useState(PAGE);
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<string[]>(() => readCols(me.id, "companies", bind?.listCols));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toolsOpen, setToolsOpen] = useState<boolean | null>(null);
  const [toolsTab, setToolsTab] = useState<ToolTab>("enrich");
  const [run, setRun] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [lastRun, setLastRun] = useState<{ col: string; scope: string[]; spent: number } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [alerted, setAlerted] = useState(false);
  const [stripOff, setStripOff] = useState<number>(-1);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notes, setNotes] = useState<CoInfo[]>([]);
  const [passes, setPasses] = useState<CoInfo[]>([]);
  const [heroBusy, setHeroBusy] = useState(false);

  // Another list type, or another saved list with its own columns: its columns.
  const listColsKey = (bind?.listCols ?? []).join(",");
  const firstCols = useRef(true);
  useEffect(() => {
    if (firstCols.current) return void (firstCols.current = false);
    setPicked(type === "companies" && listColsKey ? listColsKey.split(",") : storedCols(me.id, type) ?? defaultCols(type));
  }, [me.id, type, listColsKey]);
  const saveCols = (next: string[]) => {
    setPicked(next);
    store.set(colsKey(me.id, type), JSON.stringify(next));
    if (type === "companies") writeColsAddress(next);
  };
  const showCols = (ids: string[]) => {
    const add = ids.filter((id) => !picked.includes(id) && columnOf(type, id));
    if (add.length) saveCols([...picked, ...add]);
  };
  const showCol = (id: string) => showCols([id]);
  /** What Ask Merlin set: its filters (the ideal-client view when it kept the ideal client), its sort, its columns. */
  const applyAsk = (x: WorkbenchAsk) => {
    if (x.filters) {
      const k: ViewKey = x.filters.icp && hasIcp ? "icp" : "all";
      if (bind) {
        bind.setTab("all");
        bind.setFilters({ ...x.filters, icp: k === "icp" });
      } else {
        setViewKeyOwn(k);
        setFiltersOwn({ ...x.filters, icp: false });
      }
    }
    if (x.sort !== undefined) setSort(x.sort);
    if (x.cols?.length) {
      showCols(x.cols);
      setFresh(new Set(x.cols));
    }
  };

  const tab: Tab = viewKey === "icp" ? "all" : viewKey;
  const eff: Filters = useMemo(() => ({ ...filters, icp: viewKey === "icp" && hasIcp }), [filters, viewKey, hasIcp]);
  const sort = sortFor(type, sortPicked ?? ((me.function || hasIcp) ? "best" : "fit"));
  const all = useMemo(() => rowsFor(type, infos), [type, infos]);
  const { rows: filtered, facets } = useMemo(() => applyFilters(all, eff, tab, "", me), [all, eff, tab, me]);
  const sorted = useMemo(() => sortRows(filtered, sort, false, "", { me }), [filtered, sort, me]);
  const inView = sorted.slice(0, limit);
  useEffect(() => {
    setLimit(pageSize);
    setSelected(new Set());
  }, [type, viewKey, filters, pageSize]);
  const counts = useMemo(() => {
    const n = (t: RecordType) => applyFilters(rowsFor(t, infos), eff, tab, "", me, true).rows.length;
    return { companies: n("companies"), people: n("people"), engagements: n("engagements") };
  }, [infos, eff, tab, me]);
  const views: ViewOption[] = useMemo(() => {
    const n = (t: Tab, icp: boolean) => applyFilters(all, { ...filters, icp }, t, "", me, true).rows.length;
    const out: ViewOption[] = [];
    if (hasIcp) out.push({ key: "icp", label: "Your ideal client", hint: "From what you said when you signed up", n: n("all", true) });
    out.push({ key: "all", label: type === "companies" ? "All companies" : "All", n: n("all", false) });
    for (const t of TABS) if (t.key !== "all") out.push({ key: t.key, label: t.key === "following" ? "You follow" : t.key === "unlocked" ? "You opened" : t.label, hint: t.hint, n: n(t.key, false) });
    return out;
  }, [all, filters, me, hasIcp, type]);

  const cols = visibleColumns(type, picked);
  const pickedRows = inView.filter((r) => selected.has(r.key));
  const pick = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  const pickAll = (on: boolean) => setSelected(on ? new Set(inView.map((r) => r.key)) : new Set());
  const toolsShown = toolsOpen ?? !first;

  /* ----- first visit ----- */
  const heroRow = first && type === "companies" && !opened ? inView.find((r) => r.i.c.hidden) ?? null : null;
  const freeOpen = !!live.proOpens && live.proOpens.left > 0;
  const openHero = async (r: Row) => {
    setHeroBusy(true);
    const ok = await ui.unlock({ entity: "company", id: r.i.c.id, field: "identity" });
    setHeroBusy(false);
    if (ok) setOpened(r.i.c.id);
  };
  const hero = heroRow
    ? {
        key: heroRow.key,
        node: (
          <span className="wb-hero-cell">
            <button type="button" className="btn btn-pine wb-hero-btn" onClick={() => void openHero(heroRow)} disabled={heroBusy} aria-busy={heroBusy}>
              <IconLock size={14} /> Open your first company
            </button>
            <span className="wb-hero-note">
              <strong>{freeOpen ? "Free on the trial." : `${COMPANY_PRICE} credits.`}</strong> You see its name, its website and who held the seat.
            </span>
            <span className="wb-hero-facts">{heroRow.i.teaser}</span>
          </span>
        ),
      }
    : null;
  const stage = opened ? (alerted ? 2 : 1) : 0;
  const openedName = opened ? infos.find((i) => i.c.id === opened)?.c.name ?? "The company" : "";
  // Each stage's strip has its own key, so dismissing the first doesn't hide "Step 4 done".
  const stripKey = ["companies", "companies-open", "companies-alert"][stage];
  const showStrip = first && stripOff !== stage && !stripGone?.(stripKey);

  /* ----- saving the list with an alert ----- */
  const spelled = withIcpSpelled(eff, me.icp);
  const herePlace = absolutePlace({ t: type, v: tab, s: sortPicked, f: eff, q: "" });
  const savedHere = (me.savedViews ?? []).find((v) => v.place === herePlace) ?? null;
  const listName = bind?.listName || (viewKey === "icp" ? "Your ideal client" : views.find((v) => v.key === viewKey)?.label ?? "Companies");
  const saveList = async (name: string, email: boolean) => {
    // The list keeps its kind and, on companies, the columns on screen (the connector and Home read them).
    const list = type === "companies" ? { kind: "companies" as const, cols: picked, alert: { on: email, email, slack: email } } : { kind: type === "people" ? ("people" as const) : ("seats" as const), alert: { on: email, email, slack: email } };
    const r = await ui.act({ type: "savedView", op: "save", name, email, place: herePlace, criteria: criteriaOf(spelled, null), list }, { quiet: true });
    if (!r.ok) return false;
    toast(r.message || "Saved.");
    setAlerted(true);
    return true;
  };

  /* ----- actions on the picked rows ----- */
  const companiesOf = (rows: Row[]) => {
    const seen = new Set<string>();
    return rows.map((r) => r.i).filter((i) => !seen.has(i.c.id) && (seen.add(i.c.id), true));
  };
  const toPipeline = async () => {
    const open = companiesOf(pickedRows).filter((i) => !i.c.hidden);
    const locked = companiesOf(pickedRows).length - open.length;
    if (!open.length) return toast("Open a company first. Then it can go in your pipeline.", true);
    const r = await pipelineAct({ type: "pipeline.add", companyIds: [...open.map((i) => i.c.id), ...companiesOf(pickedRows).filter((i) => i.c.hidden).map((i) => i.c.id)] });
    toast(r.message || (locked ? `${locked} still locked.` : "Added."), !r.ok);
  };
  const draftNotes = () => {
    const open = companiesOf(pickedRows).filter((i) => !i.c.hidden);
    const withBuyer = open.filter((i) => bestBuyer(i.c, me.function));
    const none = open.length - withBuyer.length;
    if (!withBuyer.length) return toast(open.length ? "Nobody who decides is on file at these yet. Add who decides from Tools first." : "Open a company first. Then Merlin drafts the note.", true);
    if (none) toast(`${none === 1 ? "1 company has" : `${none} companies have`} nobody who decides on file, so ${none === 1 ? "it is" : "they are"} left out.`);
    setNotes(withBuyer);
  };
  const passLeads = () => {
    const cos = companiesOf(pickedRows);
    if (!cos.length) return;
    setPasses(cos);
  };
  const needRows = (go: () => void) => () => (pickedRows.length ? go() : toast("Pick rows first: tick the box at the start of each one."));
  const onDo = (d: ToolDo) => {
    if (d.kind === "run") {
      setToolsOpen(true);
      setRun(d.col);
      return;
    }
    if (d.kind === "column") {
      showCol(d.col);
      setFresh(new Set([d.col]));
      return toast(`${columnOf(type, d.col)?.label ?? "The column"} shows now. It's free.`);
    }
    if (d.kind === "type") return setType(d.type);
    if (d.kind === "page") {
      if (d.page === "proposals" && !(live.plan?.canClose ?? true)) return upgrade("proposal");
      return openPage(d.page);
    }
    if (d.kind === "alert") {
      const gated = (d.trigger === "leader" || d.trigger === "funding") && live.plan?.tier === "free";
      if (gated) return upgrade("signals");
      return setSaveOpen(true);
    }
    if (d.kind === "evidence") {
      if (!(live.plan?.canClose ?? true)) return upgrade("evidence");
      return toast("Evidence Bank is coming. Once your first case is ready, this column fills in, free.");
    }
    if (d.kind !== "action") return;
    if (d.action === "pipeline") return needRows(() => void toPipeline())();
    if (d.action === "notes") return needRows(draftNotes)();
    if (d.action === "pass") return needRows(passLeads)();
  };
  const runDone = (x: { col: string; scope: Row[]; done: number; spent: number }) => {
    if (x.col !== "company") showCol(x.col);
    setFresh(new Set([x.col]));
    setLastRun({ col: x.col, scope: x.scope.map((r) => r.key), spent: x.spent });
    setRun(null);
    if (x.col === "company" && x.done && first && !opened) setOpened(x.scope.find((r) => r.i.c.hidden)?.i.c.id ?? null);
  };
  // A column a run just filled comes into view.
  useEffect(() => {
    if (!fresh.size) return;
    const t = setTimeout(() => document.querySelector(".wb-th-fresh")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, [fresh]);
  const runStatus = (() => {
    if (!lastRun) return null;
    const def = columnOf(type, lastRun.col);
    const scope = sorted.filter((r) => lastRun.scope.includes(r.key));
    if (!def || !scope.length) return null;
    const f = fillRate({ ...def, counts: "value" }, scope);
    return { label: def.label, filled: f.filled, of: f.of, spent: lastRun.spent };
  })();

  const filterPanel = () => <FilterPanel f={eff} setF={(f) => setFilters({ ...f, icp: false })} facets={facets} me={me} />;
  const filterN = activeCount(filters) + (eff.icp ? 1 : 0);
  const openRow = (r: Row) => openCompany(r.i.c.id, r.key);
  const evidenceGated = !(live.plan?.canClose ?? true);
  const toolCtx = { me: live, network, close: live.plan?.canClose ?? true };

  /* ----- the phone: the card list, with the view and the filters ----- */
  if (layout === "phone")
    return (
      <div className="wb wb-phone">
        <h1 className="sr-only">{TYPE_TITLE[type]}</h1>
        <div className="wb-phone-bar">
          <label className="wb-phone-view">
            <span>View</span>
            <select value={viewKey} onChange={(e) => setViewKey(e.target.value as ViewKey)}>
              {views.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                  {v.n !== undefined ? ` · ${v.n}` : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="wb-phone-n num">{sorted.length.toLocaleString("en-US")} {sorted.length === 1 ? "row" : "rows"}</span>
        </div>
        {first && viewKey === "icp" && hasIcp && <p className="wb-icp-line">Filtered to your ideal client, from what you said when you signed up.</p>}
        <CardList type={type} rows={inView} me={me} onOpen={openRow} tab={tab} />
        {sorted.length > limit && (
          <button type="button" className="btn wb-more" onClick={() => setLimit((n) => n + pageSize)}>
            Show {Math.min(pageSize, sorted.length - limit)} more
          </button>
        )}
      </div>
    );

  return (
    <div className="wb">
      <h1 className="sr-only">
        {TYPE_TITLE[type]}: {listName}
      </h1>
      {showStrip && (
        <section aria-label="About this page" className={`wb-strip${stage ? " wb-strip-done" : ""}`}>
          {stage === 0 && (
            <span className="wb-strip-t">
              <strong>What this page is for.</strong> Your table of companies that hire fractionals. Open one to see its name, add columns such as who decides, and save the list so Merlin watches it.
            </span>
          )}
          {stage === 1 && (
            <>
              <span className="wb-strip-t">
                <strong>Step 4 done. {openedName} is open.</strong> Its name, its website and who held the seat now show, and it stays open for you. Next, save this list with an alert so Merlin watches it.
              </span>
              <button type="button" className="btn btn-pine" onClick={() => setSaveOpen(true)}>
                Save with an alert
              </button>
              {opened && (
                <button type="button" className="tp-flink wb-strip-link" onClick={() => openCompany(opened)}>
                  See the company
                </button>
              )}
            </>
          )}
          {stage === 2 && (
            <span className="wb-strip-t">
              <strong>Step 5 done. Merlin is watching this list.</strong> You get an email when a company on it starts hiring.
            </span>
          )}
          <button type="button" className="wb-iconbtn" aria-label="Dismiss" onClick={() => (setStripOff(stage), onStripOff?.(stripKey))}>
            <IconX size={16} />
          </button>
        </section>
      )}

      <Toolbar
        type={type}
        views={views}
        view={viewKey}
        onView={(k) => setViewKey(k as ViewKey)}
        picked={picked}
        shownCols={cols.length}
        onCols={saveCols}
        onColsReset={() => saveCols(defaultCols(type))}
        inView={inView.length}
        total={sorted.length}
        pageSize={pageSize}
        onPageSize={setPageSize}
        filterN={filterN}
        filterPanel={filterPanel}
        sort={sort}
        onSort={setSort}
        alertText={savedHere?.email || alerted ? "Alert on · new roles" : "Save as alert"}
        onAlert={() => setSaveOpen(true)}
        toolsOpen={toolsShown}
        onTools={() => setToolsOpen(!toolsShown)}
        toolsText={first && !toolsShown ? "Tools: add columns" : "Tools"}
      />

      {viewKey === "icp" && hasIcp && (
        <div className="wb-icp">
          <span>{first ? "Already filtered to your ideal client, from what you said when you signed up:" : "Your ideal client:"}</span>
          {icpChips(me).map((c) => (
            <span key={c} className="wb-chip">
              {c}
            </span>
          ))}
          {onEditIcp && (
            <button type="button" className="tp-flink" onClick={onEditIcp}>
              Change your ideal client
            </button>
          )}
        </div>
      )}

      {type === "companies" && (
        <div className="wb-ask">
          {typeof askBar === "function" ? askBar(applyAsk) : askBar}
          <button type="button" className="wb-askchip" onClick={() => onDo({ kind: "run", col: "decider" })}>
            Add who decides
          </button>
          <button type="button" className="wb-askchip" onClick={() => onDo({ kind: "evidence" })}>
            Match my evidence{evidenceGated && <span className="wb-pill-gate">Close</span>}
          </button>
        </div>
      )}

      {pickedRows.length > 0 && (
        <SelectionBar
          type={type}
          rows={pickedRows}
          onClear={() => setSelected(new Set())}
          onPipeline={() => void toPipeline()}
          onNotes={draftNotes}
          onPass={passLeads}
          onDone={(x) => (x.done && first && !opened && type === "companies" ? setOpened(pickedRows.find((r) => r.i.c.hidden)?.i.c.id ?? null) : undefined)}
        />
      )}

      <div className="wb-body">
        <section aria-label={TYPE_TITLE[type]} className="wb-main">
          {sorted.length ? (
            <Workbench
              type={type}
              rows={inView}
              cols={cols}
              mine={me.function}
              selected={selected}
              onPick={pick}
              onPickAll={pickAll}
              onOpen={openRow}
              sort={sort}
              onSort={setSort}
              onAddColumn={() => {
                setToolsOpen(true);
                setRun(null);
                setToolsTab("enrich");
              }}
              hero={hero}
              fillNote={first}
              fresh={fresh}
            />
          ) : (
            <div className="wb-empty-list">
              <strong>Nothing matches these filters.</strong>
              <button type="button" className="tp-flink" onClick={() => (setFilters(EMPTY_FILTERS), setViewKey("all"))}>
                Show every company
              </button>
            </div>
          )}
          {sorted.length > limit && (
            <button type="button" className="btn wb-more" onClick={() => setLimit((n) => n + pageSize)}>
              Show {Math.min(pageSize, sorted.length - limit)} more
            </button>
          )}
        </section>
        {toolsShown && (
          <ToolsPanel type={type} ctx={toolCtx} tab={toolsTab} onTab={setToolsTab} run={run} onRun={setRun} rows={inView} picked={pickedRows} onDo={onDo} onRunDone={runDone} onClose={() => setToolsOpen(false)} />
        )}
      </div>

      <BottomTabs type={type} counts={counts} onType={setType} status={<StatusLine me={live} run={runStatus} />} />

      {saveOpen && <SaveViewSheet defaultName={listName} emailOn={view.email} existing={savedHere} onSave={saveList} onClose={() => setSaveOpen(false)} />}
      {notes[0] &&
        (() => {
          const i = notes[0];
          const b = bestBuyer(i.c, me.function)!;
          const move = buyerNoteMove(i.c, b, live);
          const next = () => setNotes((n) => n.slice(1));
          const sent = () => void pipelineAct({ type: "pipeline.sent", companyId: i.c.id, from: "record", ...moveSent(move) });
          return <NoteSheet key={i.c.id} m={move} row={{ id: i.c.id, kinds: [], lines: [] }} me={live} onClose={next} onUsed={sent} onSent={() => (sent(), next())} onClaude={next} sentLabel={notes.length > 1 ? `Mark as sent, next of ${notes.length}` : "Mark as sent"} />;
        })()}
      {passes[0] && <PassSheet key={passes[0].c.id} company={passes[0].c.id} from="record" infos={infos} onClose={() => setPasses((p) => p.slice(1))} />}
    </div>
  );
}
