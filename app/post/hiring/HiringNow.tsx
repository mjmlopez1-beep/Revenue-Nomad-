"use client";

/**
 * Hiring now (HiringNow.dc.html, Signals / Hiring now in the new look): every open fractional role
 * Merlin finds on job boards, on the Stage 1 workbench (workbench/Workbench.tsx, SelectionBar), in
 * place of the table while it lists open roles (shell/slots.ts hiring2), so every old Hiring now
 * address lands here and the address, the rail and a saved view follow it.
 *
 *   Views     your function (the default, as Hiring now always led with it), every function (the
 *             table's allFns, the address's af=1), the roles you pitched, and at the foot the roles
 *             that closed in the last 30 days. Companies hiring and People at these companies are
 *             the same filters on the other lists.
 *   Columns   Role, Function, Company (a locked one by its free facts), Listed, Rate ("No rate
 *             posted", or its lock: the posting, rate and hours are one purchase), Hours, Fit to
 *             you, Your way in, Status (New, Seen, Pitched); and Closest evidence (Evidence Bank,
 *             Close only, the member's case most like each company), Size and HQ, Past fractional hires.
 *   Drawer    a row opens the role on the right (RoleDrawer.tsx): the posting, who is hiring, the
 *             way in, and open the company, draft a note, add to pipeline, pass it on.
 *   Alert     "Save view with an alert" saves the view as a list of open roles with its alert on
 *             (AlertPanel.tsx, F5): the weekly email, and Slack when roles open. Free.
 *   First     pre-filtered to the member's function, one strip, the alert offer as the one
 *             highlighted spot (Getting started step 5).
 *
 * Everything Hiring now had in the table stays: the function first with every function a tap away,
 * the ideal client on or off (and every role of the function when none fit it), new this week, the
 * last scan, the filters, the sorts, Ask Merlin, the other lists with the same filters, the record
 * on a row (open the company page), and on phones the card list. No export anywhere.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AskVocab } from "@/lib/ask";
import { buildMove, moveSent } from "@/lib/moves";
import type { SavedViewRec } from "@/lib/tableTypes";
import { IconFilter, IconPlus, useToast } from "../../ui/shared";
import { AskBar } from "../AskBar";
import { CardList } from "../Cards";
import { FilterPanel } from "../Filters";
import { NoteSheet } from "../MoveNote";
import { PassSheet } from "../PeerSheets";
import { CompanyName, engCell } from "../Tables";
import { openPlans } from "../Billing";
import { fmtStamp } from "../RoleDate";
import { filtersFromAsk } from "../find/findModel";
import { firstOf, ownOf } from "../firstVisit";
import { store } from "../hooks";
import { activeCount, applyFilters, bundleLead, hireCounts, icpEmpty, icpLabel, isOpenRole, namedFn, newThisWeek, rowsFor, shown, type Row } from "../model";
import { openWay, useGetIn } from "../network/useWays";
import { pipelineAct, usePipeline } from "../pipelineStore";
import { Anchored, useUi } from "../ui";
import { ShellHeader } from "../shell/Header";
import { PageStrip } from "../shell/PageStrip";
import { askGo, useApp } from "../shell/pages";
import { SelectionBar } from "../workbench/SelectionBar";
import { Workbench } from "../workbench/Workbench";
import { closestOf, labelWords } from "../workbench/closest";
import { useClosest } from "../useClosest";
import { AlertPanel } from "./AlertPanel";
import { RoleDrawer, roleTitle } from "./RoleDrawer";
import {
  CHIP_LABEL, FIT_LABEL, HIRE_SORTS, HIRING_DEFAULT_COLS, alertKeeps, alertName, alertSaveBody, alertTitle, alertWhat, chipTest, closedLately, fitOf, fnOf, footWords, hireSortOf, hirePlace,
  hiringColumns, hoursOf, inView, listedOf, pastHires, pitchedAt, rateOf, roleLists, rolesWords, sizeHq, sortRoles, statusOf, wayOf,
  type HireChip, type HireSort, type HireView, type PipeMap, type WayMap,
} from "./hiringModel";
import "../workbench/workbench.css";
import "./hiring.css";

const PAGE = 50;
const n = (x: number) => x.toLocaleString("en-US");
const STRIP =
  "Every open fractional role Merlin finds on job boards, newest first. Pick a role to read its posting and see who is hiring, check your way in, then pitch it or pass it to a fractional who fits better.";

/* ----- the member's own conveniences, in their browser: roles opened here, extra columns ----- */
const seenKey = (id: string) => `hn_seen_${id}`;
const colsKey = (id: string) => `hn_cols_${id}`;
const readList = (k: string): string[] => {
  try {
    const x = JSON.parse(store.get(k) ?? "[]");
    return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const VIEW_TITLE = (v: HireView, fn: string | null) => (v === "mine" && fn ? `${fn} roles for me` : v === "pitched" ? "Roles I pitched" : v === "closed" ? "Closed in the last 30 days" : "All open roles");

export function HiringNow() {
  const c = useApp();
  const t = c.table;
  const ui = useUi();
  const toast = useToast();
  const me = c.me;
  const live = ui.me;
  const myFn = namedFn(me.function);
  const hasIcp = !icpEmpty(me.icp);
  const close = live.plan?.canClose ?? true;
  // Read once, when the page opens: opening a company here moves the page on, it doesn't end the first visit under the member.
  const [first] = useState(() => firstOf("hiring", ownOf("hiring", me)).first);
  const [mode, setMode] = useState<"pitched" | "closed" | null>(null);
  const view: HireView = mode ?? (t.allFns || !myFn ? "all" : "mine");
  const [chips, setChips] = useState<Set<HireChip>>(new Set());
  const [sort, setSortRaw] = useState<HireSort>(() => hireSortOf(t.sortPicked));
  const [panel, setPanel] = useState<"cols" | "sort" | "filter" | null>(null);
  const [extras, setExtras] = useState<string[]>(() => readList(colsKey(me.id)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [aside, setAside] = useState<"role" | "alert" | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(readList(seenKey(me.id))));
  const [limit, setLimit] = useState(PAGE);
  const [fitOnly, setFitOnly] = useState(false);
  const [alertDone, setAlertDone] = useState(false);
  const [notes, setNotes] = useState<Row[]>([]);
  const [passes, setPasses] = useState<Row[]>([]);
  const [line, setLine] = useState<{ key: string; text: string; go?: { label: string; do: () => void } } | null>(null);
  const filterRef = useRef<HTMLButtonElement>(null);

  const setView = (v: HireView) => {
    setLimit(PAGE);
    setSelected(new Set());
    if (v === "pitched" || v === "closed") return setMode(v);
    setMode(null);
    t.setAllFns?.(v === "all");
  };
  const setSort = (s: HireSort) => {
    setSortRaw(s);
    // The table's own sorts go in the address too (a saved view keeps them).
    if (t.sorts.some((x) => x.key === s)) t.setSort(s);
  };
  const markSeen = (ids: string[]) =>
    setSeen((s) => {
      const nx = new Set(s);
      ids.forEach((id) => nx.add(id));
      store.set(seenKey(me.id), JSON.stringify([...nx].slice(-500)));
      return nx;
    });

  /* ----- the member's pipeline and ways in ----- */
  const { view: pipeline } = usePipeline();
  const pipe: PipeMap = useMemo(() => new Map((pipeline?.entries ?? []).filter((e) => e.stage !== "lost" && e.stage !== "notnow").map((e) => [e.company, { stage: e.stage, sent: e.dates.sent ?? null }])), [pipeline]);
  const getIn = useGetIn();
  const ways: WayMap | null = useMemo(() => (getIn.data ? new Map(getIn.data.rows.map((r) => [r.id, { via: r.via, best: r.best, locked: r.locked }])) : null), [getIn.data]);
  const statusCtx = useMemo(() => ({ since: t.since, seen, pipe }), [t.since, seen, pipe]);

  /* ----- the rows ----- */
  const all = useMemo(() => rowsFor("engagements", c.infos), [c.infos]);
  // Every count on this page comes from one place (model.ts hireCounts), the one the sidebar and the table read.
  const hc = useMemo(() => hireCounts(all, t.filters, me), [all, t.filters, me]);
  const open = hc.all;
  const mineN = hc.mine.length;
  // None of the member's function fits the ideal client: every role of the function, with a line that says so (as the table does).
  const lift = view === "mine" && hc.lifted && !fitOnly ? hc.everyone.mine : null;
  /** What the member's function's view lists: its roles, or all of them with the ideal client lifted. */
  const listedMine = lift ? lift.length : mineN;
  const words = (k: number, v: HireView = view) => rolesWords(k, { view: v, myFn, icpOn: hc.icpOn && !(v === "mine" && lift), lifted: v === "mine" && !!lift });
  const closed = useMemo(() => applyFilters(closedLately(all), { ...t.filters, roleState: [] }, "all", "", me, true).rows, [all, t.filters, me]);
  const pitched = (r: Row) => !!pitchedAt(r, pipe);
  const base = view === "closed" ? closed : lift ?? inView(open, view, myFn, pitched);
  const chipCtx = { ways, me };
  const rows = useMemo(() => sortRoles(base.filter((r) => [...chips].every((k) => chipTest(k, r, chipCtx))), sort, me), [base, chips, sort, me, ways]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownRows = rows.slice(0, limit);
  const pitchedN = useMemo(() => open.filter(pitched).length, [open, pipe]); // eslint-disable-line react-hooks/exhaustive-deps
  const freshMine = useMemo(() => (lift ?? (myFn ? hc.mine : open)).filter((r) => r.e && newThisWeek(r.e)).length, [lift, hc, myFn, open]);
  useEffect(() => setSelected(new Set()), [t.filters, view]);

  /* ----- the drawer ----- */
  const cur = sel ? rows.find((r) => r.key === sel) ?? all.find((r) => r.key === sel) ?? null : null;
  const openRow = (r: Row) => {
    setSel(r.key);
    setAside("role");
    setLine(null);
    if (r.e) markSeen([r.e.id]);
  };
  const closeAside = () => (setAside(null), setSel(null));
  useEffect(() => {
    if (!aside) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]") && closeAside();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [aside]);

  /* ----- actions ----- */
  const companies = (rs: Row[]) => {
    const seenCo = new Set<string>();
    return rs.map((r) => r.i).filter((i) => !seenCo.has(i.c.id) && (seenCo.add(i.c.id), true));
  };
  const toPipeline = async (rs: Row[]) => {
    const cos = companies(rs);
    if (!cos.some((i) => !i.c.hidden)) return toast("Open a company first. Then it can go in your pipeline.", true);
    const r = await pipelineAct({ type: "pipeline.add", companyIds: cos.filter((i) => !i.c.hidden).map((i) => i.c.id) });
    toast(r.message || "Added.", !r.ok);
    if (r.ok && rs.length === 1) setLine({ key: rs[0].key, text: "In your pipeline as a target.", go: { label: "Open pipeline", do: () => c.openPage("pipeline") } });
  };
  const draft = (rs: Row[]) => {
    const ok = rs.filter((r) => !r.i.c.hidden);
    if (!ok.length) return toast("Open the company first, so Merlin knows who the note is for. It is free on your trial.", true);
    setNotes(ok);
  };
  /** The note for one role: Merlin's open-role move, about this role (the company's other open roles left out of it). */
  const moveFor = (r: Row) => {
    const e = r.e!;
    const co = { ...r.i.c, engagements: r.i.c.engagements.filter((x) => !isOpenRole(x) || x.id === e.id) };
    return buildMove(co, { id: r.i.c.id, kinds: ["role"], lines: [] }, undefined, live);
  };

  /* ----- the alert (F5) ----- */
  const current = t.views.find((v) => v.id === t.currentView) ?? null;
  const here = hirePlace(view, t.filters, sort);
  const savedHere: SavedViewRec | null = current ?? (me.savedViews ?? []).find((v) => v.place === here) ?? null;
  const alertOn = !!savedHere && (savedHere.alert ? savedHere.alert.on : savedHere.email);
  const anyAlert = alertDone || (me.savedViews ?? []).some((v) => (v.kind === "roles" || /(^|&)v=hiring(&|$)/.test(v.place ?? "")) && (v.alert ? v.alert.on : v.email));
  const canAlert = view === "mine" || view === "all";
  const saveAlert = async (name: string, slack: boolean) => {
    if (savedHere) {
      const r = await ui.act({ type: "savedView", op: "alert", id: savedHere.id, list: { alert: { on: true, email: true, slack } } }, { quiet: true });
      if (!r.ok) return false;
      if (name !== savedHere.name) await ui.act({ type: "savedView", op: "rename", id: savedHere.id, name }, { quiet: true });
      toast(r.message || "Saved.");
    } else {
      const r = await ui.act(alertSaveBody({ view, myFn, f: t.filters, icp: me.icp, sort, name, slack }), { quiet: true });
      if (!r.ok) return false;
      toast(r.message || "Saved. Merlin tells you when a role like these is posted.");
    }
    setAlertDone(true);
    void c.refresh();
    return true;
  };
  const alertOff = async () => {
    if (!savedHere) return true;
    const r = await ui.act({ type: "savedView", op: "alert", id: savedHere.id, list: { alert: { on: false } } }, { quiet: true });
    if (!r.ok) return false;
    toast(r.message || "Alert off.");
    setAlertDone(false);
    void c.refresh();
    return true;
  };
  const otherAlert = async (v: SavedViewRec, on: boolean) => {
    const r = await ui.act({ type: "savedView", op: "alert", id: v.id, list: { alert: { on } } }, { quiet: true });
    toast(r.message || (on ? "Alert on." : "Alert off."), !r.ok);
    if (r.ok) void c.refresh();
  };
  const openAlert = () => (setSel(null), setAside("alert"), setPanel(null));

  /* ----- columns ----- */
  const colCtx = { me, ways, status: statusCtx, first };
  const allCols = hiringColumns(colCtx);
  const cols = allCols.filter((x) => HIRING_DEFAULT_COLS.includes(x.id) || extras.includes(x.id));
  // Closest evidence (Evidence Bank, Close): asked for the companies on screen while its column shows.
  const { summary: evSummary } = useClosest(close && extras.includes("evidence") ? [...new Set(shownRows.map((r) => r.i.c.id))] : [], close && extras.includes("evidence"));
  const toggleCol = (id: string) => {
    if (id === "evidence" && !close) return openPlans("proposals");
    const next = extras.includes(id) ? extras.filter((x) => x !== id) : [...extras, id];
    setExtras(next);
    store.set(colsKey(me.id), JSON.stringify(next));
  };
  const cell = (id: string, r: Row): ReactNode => {
    const e = r.e!;
    const i = r.i;
    switch (id) {
      case "role": {
        const st = statusOf(r, statusCtx);
        return (
          <span className="hn-two">
            <span className={`hn-role${st.k === "new" ? " hn-b" : ""}`}>{e.cells.role?.s === "locked" ? engCell(i, e, "role") : roleTitle(r)}</span>
            <span className="hn-sub">{shown(e.cells.type) ?? "Type not on file"}</span>
          </span>
        );
      }
      case "fn": {
        const fn = fnOf(e);
        return fn ? <span className={`chip tp-fn${fn === myFn ? " tp-fn-me" : ""}`}>{fn}</span> : <span className="hn-muted">Not on file</span>;
      }
      case "company": {
        const more = i.engs.filter(isOpenRole).length - 1;
        return (
          <span className="hn-two">
            <CompanyName i={i} following={i.c.following} tagged={false} />
            {!i.c.hidden && <span className="hn-sub">{[shown(i.c.cells.industry), shown(i.c.cells.revenue), more > 0 ? `${more + 1} open roles` : null].filter(Boolean).join(" · ")}</span>}
            {i.c.hidden && more > 0 && <span className="hn-sub">{more + 1} open roles</span>}
          </span>
        );
      }
      case "listed": {
        const l = listedOf(e);
        return (
          <span className="hn-two">
            <span className="hn-listed num">
              {l.fresh && <span className="live-dot" role="img" aria-label="New this week" />}
              {l.day}
            </span>
            <span className="hn-sub">{l.ago}</span>
          </span>
        );
      }
      case "rate": {
        const st = rateOf(r);
        if (st === "none") return <span className="hn-muted">No rate posted</span>;
        if (st === "with")
          return (
            <span className="hn-two">
              <span>On file</span>
              <span className="hn-sub">With the company</span>
            </span>
          );
        if (st === "buy") return engCell(i, e, bundleLead(e) ?? "rate");
        return engCell(i, e, "rate");
      }
      case "hours": {
        const h = hoursOf(r);
        if (e.cells.hours?.s === "value") return <span className="hn-two"><span className="num">{h.text}</span><span className="hn-sub">a week</span></span>;
        return <span className={`hn-nw${h.known ? "" : " hn-muted"}`}>{h.text}</span>;
      }
      case "fit": {
        const f = fitOf(r, me);
        return (
          <span className="hn-two">
            <span className={`hn-fit hn-fit-${f.tier}`}>{FIT_LABEL[f.tier]}</span>
            <span className="hn-sub hn-clip" title={f.why}>{f.tier ? f.why : "Pass it on"}</span>
          </span>
        );
      }
      case "way": {
        const w = wayOf(r, ways, first);
        return (
          <span className="hn-two">
            <span className={`hn-clip${w.has ? "" : " hn-muted"}`} title={w.text}>{w.text}</span>
            <span className="hn-sub hn-clip">{w.sub}</span>
          </span>
        );
      }
      case "status": {
        const st = statusOf(r, statusCtx);
        return (
          <span className="hn-two">
            <span className={`hn-st hn-st-${st.k}`}>{st.label}</span>
            {st.sub && <span className="hn-sub">{st.sub}</span>}
          </span>
        );
      }
      case "evidence": {
        if (!close) return <span className="wb-pill-gate">Close</span>;
        const ev = closestOf(i.c.id);
        return ev ? (
          <span className="hn-two">
            <span>{ev.title || "Your case"}</span>
            <span className="hn-sub">
              {labelWords(ev.label)}
              {ev.same[0] ? ` · ${ev.same[0]}` : ""}
            </span>
          </span>
        ) : (
          <span className="hn-two">
            <span className="hn-muted">No close case</span>
            <span className="hn-sub">{evSummary && !evSummary.ready ? "No case ready yet" : "Evidence Bank"}</span>
          </span>
        );
      }
      case "sizeHq": {
        const s = sizeHq(i);
        return (
          <span className="hn-two">
            <span>{s.size}</span>
            <span className="hn-sub">{s.hq}</span>
          </span>
        );
      }
      case "past":
        return <span>{pastHires(i)}</span>;
      default:
        return null;
    }
  };

  /* ----- the lists linked by the same filters, and the foot ----- */
  const vocab: AskVocab = useMemo(() => ({ myFn: me.function ?? null, hasIcp }), [me.function, hasIcp]);
  const ask = (
    <AskBar
      variant="line"
      rows={1}
      label="Ask Merlin to filter these roles"
      placeholder="Ask Merlin: SaaS roles where I have a way in"
      vocab={vocab}
      where={(plan) => (plan.page === "hiring" ? "these roles, with these filters" : plan.where)}
      onGo={(plan, text) => {
        if (plan.page !== "hiring") return askGo(c, plan, text);
        t.setFilters(filtersFromAsk(plan.filters, !!plan.filters.icp));
      }}
    />
  );
  const filterN = activeCount(t.filters);
  const foot = footWords({ view, shown: rows.length, total: open.length, mine: mineN, myFn, filtered: filterN > 0 || chips.size > 0, pitched: pitchedN, icpOn: hc.icpOn });
  const footGo = (to: HireView | "clear") => (to === "clear" ? (t.clearFilters(), setChips(new Set())) : setView(to));
  const scan = c.view.scan;
  const scanWords = scan?.lastOkAt ? `last scan ${fmtStamp(scan.lastOkAt)}` : scan?.lastRunAt ? "the last scan could not read the job boards" : "the first scan runs this week";
  const opens = live.proOpens;
  const status = first && opens
    ? `${live.plan?.name === "trial" ? "Trial: " : ""}${opens.of - opens.left} of ${opens.of} free opens used today, then 2 credits each · ${scanWords}`
    : `${n(rows.length)} of ${words(base.length)} · ${n(rows.filter((r) => r.e && newThisWeek(r.e)).length)} new this week · ${scanWords}`;
  const bottom = (
    <div className="wb-bottom">
      <div role="tablist" aria-label="Lists with these filters" className="wb-bottom-tabs">
        <button type="button" role="tab" aria-selected={view !== "closed"} className={`wb-btab${view !== "closed" ? " on" : ""}`} onClick={() => view === "closed" && setView(myFn ? "mine" : "all")}>
          Open roles · <span className="num">{n(view === "mine" ? listedMine : open.length)}</span>
        </button>
        <button type="button" role="tab" aria-selected={false} className="wb-btab" onClick={() => t.setRecordType("companies")}>
          Companies hiring · <span className="num">{n(t.typeCounts.companies)}</span>
        </button>
        <button type="button" role="tab" aria-selected={false} className="wb-btab" onClick={() => t.setRecordType("people")}>
          People at these companies · <span className="num">{n(t.typeCounts.people)}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === "closed"} className={`wb-btab${view === "closed" ? " on" : ""}`} onClick={() => setView("closed")}>
          Closed in the last 30 days · <span className="num">{n(closed.length)}</span>
        </button>
      </div>
      <span className="wb-status" aria-live="polite">
        {status}
      </span>
    </div>
  );

  /* ----- the header, the strip, the first visit's offer ----- */
  const title = current?.name ?? VIEW_TITLE(view, myFn);
  const header = (
    <ShellHeader
      crumbs={[
        { label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") },
        { label: "Hiring now", go: () => (setMode(null), closeAside()) },
      ]}
      title={title}
      phone={c.phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );
  const strip = (
    <PageStrip page="hiring">
      {STRIP}
    </PageStrip>
  );
  const what = alertWhat(view === "all" && !first ? "all" : "mine", myFn, t.filters);
  const band = first && (
    <section className={`hn-band${anyAlert ? "" : " hn-band-ring"}`} aria-label="Alert for this view">
      {anyAlert ? (
        <>
          <span className="hn-band-t">
            <strong>Step 5 done. Merlin is watching for you.</strong> New roles come to your email each week, and to Slack once it is connected. Next, open a company to read its posting.{opens && opens.left > 0 ? ` It is free${live.plan?.name === "trial" ? " on your trial" : " today"}.` : ""}
          </span>
          {rows[0] && (
            <button type="button" className="btn btn-pine hn-band-btn" onClick={() => (c.phone ? c.openCompany(rows[0].i.c.id, rows[0].key) : openRow(rows[0]))}>
              Look at the newest role
            </button>
          )}
        </>
      ) : (
        <>
          <span className="hn-band-t">
            <strong>Tell me when {what}.</strong> Merlin checks job boards every week. Save this view with an alert and the new roles come to your email, so you do not have to look. It is free and spends no credits. This is step 5 of getting started.
          </span>
          {aside !== "alert" && (
            <button type="button" className="btn btn-pine hn-band-btn" onClick={() => (myFn && view !== "mine" && setView("mine"), openAlert())}>
              Set up the alert
            </button>
          )}
        </>
      )}
    </section>
  );

  /* ----- phones: the card list, as today ----- */
  if (c.phone)
    return (
      <main className="tp-main tp-main-page wb-host hn-host">
        {header}
        <div className="hn-phone">
          {strip}
          {band}
          <div className="hn-phone-views" role="tablist" aria-label="Views">
            {(myFn ? (["mine", "all"] as HireView[]) : (["all"] as HireView[])).concat(pitchedN ? ["pitched"] : [], ["closed"]).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={`hn-vtab${view === v ? " on" : ""}`} onClick={() => setView(v)}>
                {v === "mine" ? `${myFn} for me` : v === "all" ? "All" : v === "pitched" ? "Pitched" : "Closed lately"}
              </button>
            ))}
          </div>
          <p className="wb-icp-line">{foot.text}</p>
          <CardList type="engagements" rows={shownRows} me={me} onOpen={(r) => c.openCompany(r.i.c.id, r.key)} tab={view === "closed" ? "all" : "hiring"} />
          {rows.length > limit && (
            <button type="button" className="btn wb-more" onClick={() => setLimit((x) => x + PAGE)}>
              Show {Math.min(PAGE, rows.length - limit)} more
            </button>
          )}
          {canAlert && (
            <button type="button" className="btn hn-phone-alert" onClick={() => openAlert()}>
              {alertOn ? "Alert on for this view" : "Save view with an alert"}
            </button>
          )}
          {aside === "alert" && (
            <div className="hn-phone-sheet">
              <AlertPanel
                title={alertTitle(view, myFn, t.filters)}
                defaultName={alertName(view, myFn, t.filters)}
                keeps={alertKeeps(view, myFn, t.filters)}
                existing={savedHere}
                others={roleLists(me.savedViews ?? [], savedHere?.place ?? here)}
                first={first}
                free={live.plan?.tier === "free"}
                onSave={saveAlert}
                onOff={alertOff}
                onOther={(v, on) => void otherAlert(v, on)}
                onClose={() => setAside(null)}
                onSlack={() => c.openPage("integrations")}
                onAlerts={() => c.openPage("alerts")}
              />
            </div>
          )}
        </div>
        {aside !== "alert" && (
          <button type="button" className="btn btn-volt tp-fab" onClick={() => c.openAdd()}>
            <IconPlus size={18} /> Add what you know
          </button>
        )}
      </main>
    );

  /* ----- wider screens: the workbench ----- */
  const views: HireView[] = [...(myFn ? (["mine"] as HireView[]) : []), "all", ...(pitchedN || view === "pitched" ? (["pitched"] as HireView[]) : [])];
  const viewN = (v: HireView) => (v === "mine" ? listedMine : v === "all" ? open.length : pitchedN);
  const viewLabel = (v: HireView) => (v === "mine" ? `${myFn} for me` : v === "all" ? "All functions" : "Pitched");
  const pill = (on: boolean) => `hn-pill${on ? " on" : ""}`;
  const icpParts = hasIcp ? icpLabel(me.icp).split(" · ") : [];
  // The ideal client's line: how many of every open role fit it, the same count whether its filter is on or off.
  const fitN = hasIcp ? hc.fit.all.length : 0;
  const everyN = hc.everyone.all.length;
  const picked = shownRows.filter((r) => selected.has(r.key));
  const drawer =
    aside === "alert" ? (
      <AlertPanel
        key={here}
        title={alertTitle(view, myFn, t.filters)}
        defaultName={alertName(view, myFn, t.filters)}
        keeps={alertKeeps(view, myFn, t.filters)}
        existing={savedHere}
        others={roleLists(me.savedViews ?? [], savedHere?.place ?? here)}
        first={first}
        free={live.plan?.tier === "free"}
        onSave={saveAlert}
        onOff={alertOff}
        onOther={(v, on) => void otherAlert(v, on)}
        onClose={() => setAside(null)}
        onSlack={() => c.openPage("integrations")}
        onAlerts={() => c.openPage("alerts")}
      />
    ) : aside === "role" && cur ? (
      <RoleDrawer
        key={cur.key}
        r={cur}
        me={live}
        status={statusOf(cur, statusCtx)}
        way={wayOf(cur, ways, first)}
        inPipe={pipe.has(cur.i.c.id)}
        close={close}
        onClose={closeAside}
        onOpenRecord={() => c.openCompany(cur.i.c.id, cur.key)}
        onNote={() => draft([cur])}
        onPipeline={() => (pipe.has(cur.i.c.id) ? c.openPage("pipeline") : void toPipeline([cur]))}
        onPass={() => setPasses([cur])}
        onAddPerson={() => c.openAdd({ companyId: cur.i.c.id, mode: "person" })}
        onWay={() => (!cur.i.c.hidden && wayOf(cur, ways).has && ways?.get(cur.i.c.id)?.via ? openWay(cur.i.c.id) : c.openPage("warm"))}
        onRates={() => c.openPage("rates")}
        line={line && line.key === cur.key ? line : null}
      />
    ) : null;

  return (
    <main className="tp-main tp-main-page wb-host hn-host">
      {header}
      <div className="wb hn">
        <h1 className="sr-only">Hiring now: {title}</h1>
        {strip}
        <div className="wb-toolbar hn-toolbar" role="toolbar" aria-label="Table">
          <div role="tablist" aria-label="Views" className="hn-views">
            {views.map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={`hn-vtab${view === v ? " on" : ""}`} onClick={() => setView(v)}>
                {viewLabel(v)} · <span className="num">{n(viewN(v))}</span>
              </button>
            ))}
          </div>
          <button type="button" className="wb-tb" aria-expanded={panel === "cols"} onClick={() => setPanel(panel === "cols" ? null : "cols")}>
            {cols.length} of {allCols.length} columns
          </button>
          <span className="wb-tb-quiet num">
            {n(rows.length)} of {words(base.length)}
          </span>
          <button ref={filterRef} type="button" className={`wb-tb${filterN ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={panel === "filter"} onClick={() => setPanel(panel === "filter" ? null : "filter")}>
            <IconFilter size={14} /> Filter{filterN ? ` · ${filterN}` : ""}
          </button>
          <button type="button" className="wb-tb" aria-expanded={panel === "sort"} onClick={() => setPanel(panel === "sort" ? null : "sort")}>
            <span>
              Sort<span className="wb-tb-sub">: {HIRE_SORTS.find((s) => s.key === sort)?.label.toLowerCase().replace("hq", "HQ").replace("a to z", "A to Z")}</span>
            </span>
          </button>
          <span className="wb-tb-sp" />
          {canAlert && (
            <button type="button" className={`wb-tb hn-alert-btn${alertOn ? " on" : ""}`} aria-expanded={aside === "alert"} onClick={openAlert}>
              {alertOn ? `Alert on · ${savedHere?.alert?.slack ? "email and Slack" : "weekly email"}` : "Save view with an alert"}
            </button>
          )}
        </div>
        {panel === "filter" && filterRef.current && (
          <Anchored anchor={filterRef.current} width={340} onClose={() => setPanel(null)} className="wb-pop wb-filterpop" label="Filters">
            <FilterPanel f={t.filters} setF={(f) => t.setFilters(f)} facets={t.facets} me={me} />
          </Anchored>
        )}
        {panel === "cols" && (
          <section className="hn-panel" aria-label="Columns">
            <strong>Add a column</strong>
            {allCols
              .filter((x) => !HIRING_DEFAULT_COLS.includes(x.id))
              .map((x) => (
                <button key={x.id} type="button" aria-pressed={extras.includes(x.id)} className={pill(extras.includes(x.id))} onClick={() => toggleCol(x.id)}>
                  {x.label} · {x.id === "evidence" ? (close ? "Close" : "Close plan") : "free"}
                </button>
              ))}
            <span className="hn-panel-t">
              Who is hiring costs 1 credit a row. Show it one role at a time in the drawer, or run it on a whole list in{" "}
              <button type="button" className="tp-flink" onClick={() => t.setRecordType("companies")}>
                Companies
              </button>
              . What a rate should be is in{" "}
              <button type="button" className="tp-flink" onClick={() => c.openPage("rates")}>
                Rate benchmarks
              </button>
              .
            </span>
          </section>
        )}
        {panel === "sort" && (
          <section className="hn-panel" aria-label="Sort" role="radiogroup">
            <strong>Sort by</strong>
            {HIRE_SORTS.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} className={pill(sort === s.key)} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
            <span className="hn-panel-t">Best fit puts your function, industries and company size first, and says why under each chip.</span>
          </section>
        )}
        {!first && hasIcp && view !== "closed" && !lift && (
          <div className="hn-icp" role="group" aria-label="Your ideal client">
            <span>{t.filters.icp ? "Showing only your ideal client:" : "Showing everyone. Your ideal client:"}</span>
            {icpParts.map((p) => (
              <span key={p} className="hn-keep">
                {p}
              </span>
            ))}
            <span>
              {n(fitN)} of {n(everyN)} open roles fit it{myFn && view === "all" && t.filters.icp && !hc.mine.length && hc.everyone.mine.length ? `, none of them in ${myFn}` : ""}.
            </span>
            <button type="button" className="hn-mini" aria-pressed={t.filters.icp} onClick={() => t.setFilters({ ...t.filters, icp: !t.filters.icp })}>
              {t.filters.icp ? "Show everyone" : "Show only these"}
            </button>
            <button type="button" className="tp-flink" onClick={c.openProfile}>
              Edit ideal client
            </button>
          </div>
        )}
        {first && (
          <div className="hn-icp">
            <span>{view === "mine" ? "Already filtered to your function, from what you said when you signed up:" : "You are looking past your function:"}</span>
            <span className="hn-keep">{view === "mine" && myFn ? `Function: ${myFn}` : "Every function"}</span>
            <span>
              {myFn
                ? `${words(listedMine, "mine")}, ${n(freshMine)} new this week. ${n(open.length - mineN)} more in other functions${hc.icpOn ? " in your ideal client" : ""}.`
                : `${words(open.length, "all")}, ${n(freshMine)} new this week.`}
            </span>
            <button type="button" className="tp-flink" onClick={c.openProfile}>
              Change your ideal client
            </button>
          </div>
        )}
        {band}
        {lift && (
          <div className="hn-icp">
            <span>
              None of the {n(lift.length)} open {myFn} roles fit your ideal client right now. Here they all are.
              {open.length ? ` ${n(open.length)} ${open.length === 1 ? "role" : "roles"} in other functions fit it, under All functions.` : ""}
            </span>
            <button type="button" className="tp-flink" onClick={() => setFitOnly(true)}>
              Only my ideal client
            </button>
          </div>
        )}
        <div className="wb-ask">
          {ask}
          {(["fresh", "rate", "path", ...(first && hasIcp ? (["icp"] as HireChip[]) : [])] as HireChip[]).map((k) => (
            <button
              key={k}
              type="button"
              className="wb-askchip"
              aria-pressed={chips.has(k)}
              onClick={() =>
                setChips((s) => {
                  const nx = new Set(s);
                  if (nx.has(k)) nx.delete(k);
                  else nx.add(k);
                  return nx;
                })
              }
            >
              {CHIP_LABEL[k]}
            </button>
          ))}
          <button type="button" className="tp-flink hn-find" onClick={() => c.openPage("find")}>
            Search every company in Find
          </button>
        </div>
        {picked.length > 0 && (
          <SelectionBar
            type="engagements"
            rows={picked}
            onClear={() => setSelected(new Set())}
            onPipeline={() => void toPipeline(picked)}
            onNotes={() => draft(picked)}
            onPass={() => setPasses(picked)}
            extra={
              <button type="button" className="wb-sel-btn" onClick={() => (markSeen(picked.map((r) => r.e!.id)), setSelected(new Set()))}>
                Mark as seen
              </button>
            }
          />
        )}
        <div className="wb-body">
          <section aria-label="Open roles" className="wb-main">
            {t.listWaits ? (
              <div className="wb-empty-list" role="status">
                <strong>Loading every open role</strong>
              </div>
            ) : rows.length ? (
              <Workbench
                type="engagements"
                rows={shownRows}
                cols={cols}
                mine={myFn}
                selected={selected}
                onPick={(key, on) =>
                  setSelected((s) => {
                    const nx = new Set(s);
                    if (on) nx.add(key);
                    else nx.delete(key);
                    return nx;
                  })
                }
                onPickAll={(on) => setSelected(on ? new Set(shownRows.map((r) => r.key)) : new Set())}
                onOpen={openRow}
                sort={sort === "best" ? "best" : sort === "fn" ? "fn" : sort === "employees" ? "employees" : "newest"}
                onSort={(s) => setSort(hireSortOf(s))}
                onAddColumn={() => setPanel(panel === "cols" ? null : "cols")}
                cell={cell}
                rowClass={(r) => (r.key === sel && aside === "role" ? "hn-cur" : "")}
              />
            ) : (
              <div className="wb-empty-list">
                <strong>{view === "closed" ? "No role came down in the last 30 days with these filters." : view === "pitched" ? "Nothing pitched yet." : myFn && view === "mine" ? `No open ${myFn} roles match right now.` : "No open roles match right now."}</strong>
                {canAlert && !alertOn && (
                  <button type="button" className="tp-flink" onClick={openAlert}>
                    Get an alert when {alertWhat(view, myFn, t.filters)}
                  </button>
                )}
              </div>
            )}
            {rows.length > limit && (
              <button type="button" className="btn wb-more" onClick={() => setLimit((x) => x + PAGE)}>
                Show {Math.min(PAGE, rows.length - limit)} more
              </button>
            )}
            <div className="hn-foot">
              <span>{foot.text}</span>
              {foot.go && (
                <button type="button" className="hn-mini" onClick={() => footGo(foot.go!.to)}>
                  {foot.go.label}
                </button>
              )}
              <span className="wb-tb-sp" />
              <button type="button" className="hn-earn" onClick={() => c.openAdd({ mode: "engagement" })}>
                Know of a role that is not here? Add it, earn 1 credit
              </button>
            </div>
          </section>
          {drawer}
        </div>
        {bottom}
      </div>
      {notes[0] &&
        (() => {
          const r = notes[0];
          const m = moveFor(r);
          const next = () => setNotes((x) => x.slice(1));
          const sent = () => void pipelineAct({ type: "pipeline.sent", companyId: r.i.c.id, from: "record", ...moveSent(m) });
          return (
            <NoteSheet
              key={r.key}
              m={m}
              row={{ id: r.i.c.id, kinds: ["role"], lines: [] }}
              me={live}
              onClose={next}
              onUsed={sent}
              onSent={() => (sent(), setLine({ key: r.key, text: "Pitched today. It is in your pipeline as Sent.", go: { label: "Open pipeline", do: () => c.openPage("pipeline") } }), next())}
              onClaude={next}
              sentLabel={notes.length > 1 ? `Mark as pitched, next of ${notes.length}` : "Mark as pitched"}
            />
          );
        })()}
      {passes[0] && <PassSheet key={passes[0].key} company={passes[0].i.c.id} role={passes[0].e?.id ?? null} from="role" infos={c.infos} onClose={() => setPasses((p) => p.slice(1))} />}
    </main>
  );
}
