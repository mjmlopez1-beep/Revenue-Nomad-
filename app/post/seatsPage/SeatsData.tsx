"use client";

/**
 * The Seats page's first two tabs (Seats.dc.html): All seats, and Seats that ended lately, on the
 * Stage 1 workbench (workbench/*). The list is the table's own (AppCtx TableCtx: its filters, sort
 * and search, so the address and a saved list follow it); "ended lately" is the endedWithin filter
 * (model.ts), the most recent end first unless the member picks a sort.
 *
 * Every cell is the old tables' (workbench/cells.tsx), so a lock spends exactly as there. Three are
 * drawn here: Held by says "Is this you?" on a seat Merlin found with nobody named, Seat adds who
 * hired or managed it where their name shows (each opens the person bubble), and Ended adds how
 * long ago (free) under the month's lock. Verify opens in the side panel (Verify.tsx VerifyHost).
 * Runs (rate, end month, a holder out of the directory, companies) are the workbench's: one quote,
 * one confirm, one button.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AskVocab } from "@/lib/ask";
import { bestBuyer, buyerNoteMove, moveSent } from "@/lib/moves";
import { HIRED_DEFAULT_WINDOW } from "@/lib/hired";
import { useToast } from "../../ui/shared";
import { AskBar } from "../AskBar";
import { FilterPanel } from "../Filters";
import { SaveViewSheet } from "../Hunt";
import { NoteSheet } from "../MoveNote";
import { PassSheet } from "../PeerSheets";
import { store } from "../hooks";
import { absolutePlace, activeCount, criteriaOf, hiredOn, icpEmpty, isOpenRole, namedFn, suggestHiredFn, withIcpSpelled, type CoInfo, type Row, type SortKey, type Tab } from "../model";
import { useUi } from "../ui";
import { pipelineAct } from "../pipelineStore";
import { askGo, useApp } from "../shell/pages";
import { VerifyHost, VerifyPanel, type VerifyTarget } from "../Verify";
import { seatCell } from "../workbench/cells";
import { columnOf, defaultCols, fillRate, visibleColumns } from "../workbench/columns";
import { SelectionBar } from "../workbench/SelectionBar";
import { PersonNameButton } from "../PersonBubble";
import { StatusLine } from "../workbench/StatusLine";
import { Toolbar, type ViewOption } from "../workbench/Toolbar";
import { ToolsPanel } from "../workbench/ToolsPanel";
import type { ToolDo, ToolTab } from "../workbench/tools";
import { Workbench } from "../workbench/Workbench";
import { useWorkbenchSort } from "../workbench/useWorkbenchSort";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { ENDED_MONTHS, endedBand, endedFilters, monthWords, sortEnded, type SeatTab } from "./seatsModel";

const PAGE = 50;
const colsKey = (memberId: string) => `wb_cols_${memberId}_engagements`;
const storedCols = (memberId: string): string[] | null => {
  try {
    const x = JSON.parse(store.get(colsKey(memberId)) ?? "null");
    return Array.isArray(x) && x.every((v) => typeof v === "string") ? x : null;
  } catch {
    return null;
  }
};

/** "Fractional VP Sales at Northwind Clinics, from Feb 2024". */
const seatSub = (r: Row) => {
  const e = r.e!;
  const role = e.cells.role?.s === "value" ? e.cells.role.v : e.cells.function?.s === "value" ? `${e.cells.function.v} seat` : "A fractional seat";
  const start = e.cells.start?.s === "value" ? e.cells.start.v : null;
  return `${role} at ${r.i.c.hidden ? "this company" : r.i.c.name}${start ? `, from ${monthWords(start)}` : isOpenRole(e) ? ", an open role" : ""}`;
};

export function SeatsData({ tab, bottom }: { tab: Exclude<SeatTab, "mine">; bottom: (status: ReactNode) => ReactNode }) {
  const c = useApp();
  const t = c.table;
  const ui = useUi();
  const toast = useToast();
  const me = c.me;
  const live = ui.me;
  const ended = tab === "ended";
  const [picked, setPicked] = useState<string[]>(() => storedCols(me.id) ?? defaultCols("engagements"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [pageSize, setPageSize] = useState(PAGE);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<ToolTab>("enrich");
  const [run, setRun] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [lastRun, setLastRun] = useState<{ col: string; scope: string[]; spent: number } | null>(null);
  const [verify, setVerify] = useState<{ t: VerifyTarget; r: Row } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notes, setNotes] = useState<CoInfo[]>([]);
  const [passes, setPasses] = useState<CoInfo[]>([]);
  const [alerted, setAlerted] = useState(false);

  // The list is the table's: ended lately reads newest end first unless the member picked a sort.
  const sorted = useMemo(() => (ended && !t.sortPicked ? sortEnded(t.rows) : t.rows), [ended, t.sortPicked, t.rows]);
  const cols = visibleColumns("engagements", picked);
  // A header click sorts every seat by that column, both ways; the Sort menu's pick clears it.
  const colSort = useWorkbenchSort(sorted, cols, "seats");
  const inView = colSort.rows.slice(0, limit);
  useEffect(() => {
    setLimit(pageSize);
    setSelected(new Set());
    setVerify(null);
  }, [tab, t.filters, pageSize]);
  const pickedRows = inView.filter((r) => selected.has(r.key));
  const saveCols = (next: string[]) => {
    setPicked(next);
    store.set(colsKey(me.id), JSON.stringify(next));
  };
  const showCol = (id: string) => {
    if (!picked.includes(id) && columnOf("engagements", id)) saveCols([...picked, id]);
  };
  const pick = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  /* ----- views and filters ----- */
  const hasIcp = !icpEmpty(me.icp);
  const tabView = (k: string) => {
    if (k === "ended" || k === "all") {
      t.setTab("all");
      return t.setFilters(endedFilters(t.filters, k));
    }
    t.setTab(k as Tab);
    t.setFilters(endedFilters(t.filters, "all"));
  };
  const views: ViewOption[] = [
    { key: "all", label: "All seats", n: ended ? undefined : t.facets.tabs?.all },
    { key: "ended", label: "Ended in the last 90 days", hint: "A company whose fractional just left often hires again", n: t.facets.ended?.[ENDED_MONTHS] },
    { key: "repeat", label: "Repeat hirers", n: ended ? undefined : t.facets.tabs?.repeat },
    { key: "unlocked", label: "You opened", n: ended ? undefined : t.facets.tabs?.unlocked },
    { key: "following", label: "You follow", n: ended ? undefined : t.facets.tabs?.following },
  ];
  const viewKey = ended ? "ended" : t.tab === "all" ? "all" : t.tab;
  const filterN = activeCount(t.filters) + (t.filters.icp ? 1 : 0) - (ended ? 1 : 0);
  const filterPanel = () => <FilterPanel f={t.filters} setF={(f) => t.setFilters(f)} facets={t.facets} me={me} />;
  const hired = hiredOn(t.filters);
  const toggleHired = () => {
    if (hired) return t.setFilters({ ...t.filters, hiredFn: [], hiredWithin: 0 });
    const fn = suggestHiredFn(c.infos, me.function);
    t.setFilters({ ...endedFilters(t.filters, "all"), hiredFn: [fn], hiredWithin: HIRED_DEFAULT_WINDOW });
  };

  /* ----- saving the list with an alert ----- */
  const herePlace = absolutePlace({ t: "engagements", v: t.tab, s: t.sortPicked, f: t.filters, q: "" });
  const savedHere = (me.savedViews ?? []).find((v) => v.place === herePlace) ?? null;
  const listName = ended ? "Seats that ended lately" : "All seats";
  const saveList = async (name: string, email: boolean) => {
    const r = await ui.act(
      { type: "savedView", op: "save", name, email, place: herePlace, criteria: criteriaOf(withIcpSpelled(t.filters, me.icp), null), list: { kind: "seats", alert: { on: email, email, slack: email } } },
      { quiet: true },
    );
    if (!r.ok) return false;
    toast(r.message || "Saved.");
    setAlerted(true);
    return true;
  };

  /* ----- actions on picked rows ----- */
  const companiesOf = (rows: Row[]) => {
    const seen = new Set<string>();
    return rows.map((r) => r.i).filter((i) => !seen.has(i.c.id) && (seen.add(i.c.id), true));
  };
  const toPipeline = async () => {
    const all = companiesOf(pickedRows);
    if (!all.some((i) => !i.c.hidden)) return toast("Open a company first. Then it can go in your pipeline.", true);
    const r = await pipelineAct({ type: "pipeline.add", companyIds: all.map((i) => i.c.id) });
    toast(r.message || "Added.", !r.ok);
  };
  const draftNotes = () => {
    const open = companiesOf(pickedRows).filter((i) => !i.c.hidden);
    const withBuyer = open.filter((i) => bestBuyer(i.c, me.function));
    if (!withBuyer.length) return toast(open.length ? "Nobody who decides is on file at these yet." : "Open a company first. Then Merlin drafts the note.", true);
    setNotes(withBuyer);
  };
  const needRows = (go: () => void) => () => (pickedRows.length ? go() : toast("Pick rows first: tick the box at the start of each one."));
  const onDo = (d: ToolDo) => {
    setVerify(null);
    if (d.kind === "run") return setToolsOpen(true), setRun(d.col);
    if (d.kind === "column") {
      showCol(d.col);
      setFresh(new Set([d.col]));
      return toast(`${columnOf("engagements", d.col)?.label ?? "The column"} shows now. It's free.`);
    }
    if (d.kind === "type") {
      t.setRecordType(d.type);
      return;
    }
    if (d.kind === "page") return c.openPage(d.page);
    if (d.kind === "alert") {
      if ((d.trigger === "leader" || d.trigger === "funding") && live.plan?.tier === "free") return void import("../Billing").then((m) => m.openPlans("billing"));
      return setSaveOpen(true);
    }
    if (d.kind === "evidence") return toast("Evidence Bank is coming. Your seats will each start a draft case there.");
    if (d.kind !== "action") return;
    if (d.action === "pipeline") return needRows(() => void toPipeline())();
    if (d.action === "notes") return needRows(draftNotes)();
    if (d.action === "pass") return needRows(() => setPasses(companiesOf(pickedRows)))();
  };
  const runDone = (x: { col: string; scope: Row[]; done: number; spent: number }) => {
    if (x.col !== "company") showCol(x.col);
    setFresh(new Set([x.col]));
    setLastRun({ col: x.col, scope: x.scope.map((r) => r.key), spent: x.spent });
    setRun(null);
  };
  const runStatus = (() => {
    if (!lastRun) return null;
    const def = columnOf("engagements", lastRun.col);
    const scope = sorted.filter((r) => lastRun.scope.includes(r.key));
    if (!def || !scope.length) return null;
    const f = fillRate({ ...def, counts: "value" }, scope);
    return { label: def.label, filled: f.filled, of: f.of, spent: lastRun.spent };
  })();

  /* ----- the two cells drawn here ----- */
  const cell = (id: string, r: Row): ReactNode | undefined => {
    const e = r.e;
    if (!e) return undefined;
    if (id === "operator" && e.claimable && (!e.cells.operator || e.cells.operator.s === "empty") && !r.i.c.hidden)
      return (
        <span className="sp-held">
          <span className="tp-notyet">Nobody named yet</span>
          <button
            type="button"
            className="vf-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              setRun(null);
              setVerify({ t: { engagementId: e.id, named: false }, r });
            }}
          >
            Is this you?
          </button>
        </span>
      );
    if (id === "role") {
      // Who hired or managed the seat, where their name shows: each opens the person bubble.
      const named = r.i.c.hidden ? [] : e.people.filter((p) => p.cells.name?.s === "value");
      if (!named.length) return undefined;
      return (
        <span className="sp-two">
          {seatCell(id, r, me.function)}
          <span className="sp-sub sp-with">
            With{" "}
            {named.slice(0, 2).map((p) => (
              <PersonNameButton key={p.id} i={r.i} p={p} e={e} className="sp-who" />
            ))}
          </span>
        </span>
      );
    }
    if (id === "end") {
      const band = endedBand(e);
      if (!band) return undefined;
      return (
        <span className="sp-two">
          {seatCell(id, r, me.function)}
          <span className="sp-sub">{band}</span>
        </span>
      );
    }
    return undefined;
  };
  const host = (vt: VerifyTarget) => {
    const r = inView.find((x) => x.e?.id === vt.engagementId);
    if (!r) return;
    setRun(null);
    setVerify({ t: vt, r });
  };
  const verifyFrom = (r: Row) => {
    const op = r.e?.cells.operator;
    return op?.s === "value" && op.from === "records" ? "Revenue Nomad's records" : r.e ? (SOURCE_LABEL[r.e.source] ?? r.e.source).toLowerCase() : null;
  };
  const vocab: AskVocab = useMemo(() => ({ myFn: me.function ?? null, hasIcp }), [me.function, hasIcp]);
  const toolCtx = { me: live, network: c.network, close: live.plan?.canClose ?? true };
  const aside = verify ? (
    <aside className="wb-tools" aria-label="Verify">
      <VerifyPanel
        t={verify.t}
        title={verify.t.named && verify.r.e?.cells.operator?.s === "value" ? verify.r.e.cells.operator.v : "Nobody named yet"}
        sub={seatSub(verify.r)}
        from={verifyFrom(verify.r)}
        onBack={() => setVerify(null)}
        onMine={() => c.openSeats(verify.t.engagementId)}
        onAdd={() => c.openCompany(verify.r.i.c.id, verify.r.key)}
      />
    </aside>
  ) : toolsOpen ? (
    <ToolsPanel type="engagements" ctx={toolCtx} tab={toolsTab} onTab={setToolsTab} run={run} onRun={setRun} rows={inView} picked={pickedRows} onDo={onDo} onRunDone={runDone} onClose={() => setToolsOpen(false)} />
  ) : null;

  return (
    <VerifyHost open={host}>
      <Toolbar
        type="engagements"
        views={views}
        view={viewKey}
        onView={tabView}
        picked={picked}
        shownCols={cols.length}
        onCols={saveCols}
        onColsReset={() => saveCols(defaultCols("engagements"))}
        inView={inView.length}
        total={sorted.length}
        pageSize={pageSize}
        onPageSize={setPageSize}
        filterN={Math.max(0, filterN)}
        filterPanel={filterPanel}
        sort={t.sort}
        sortWords={colSort.words}
        onSort={(s: SortKey) => (colSort.clear(), t.setSort(s))}
        alertText={savedHere?.email || alerted ? (ended ? "Alert on · a seat ends" : "Alert on") : "Save as alert"}
        onAlert={() => setSaveOpen(true)}
        toolsOpen={toolsOpen && !verify}
        onTools={() => (setVerify(null), setToolsOpen(!toolsOpen || !!verify))}
        toolsText="Tools"
      />
      {ended && (
        <div className="sp-note">
          <span>
            <strong>Why this list.</strong> A company whose fractional just left often hires again. How long ago a seat ended is free. The exact month costs 1 credit.
          </span>
        </div>
      )}
      {!ended && t.filters.icp && hasIcp && !hired && (
        <div className="sp-note">
          <span>
            Already filtered to your ideal client, from what you said when you signed up.
          </span>
          <button type="button" className="tp-flink" onClick={c.openProfile}>
            Change your ideal client
          </button>
        </div>
      )}
      {hired && t.pill && <div className="sp-hired">{t.pill}</div>}
      <div className="wb-ask">
        <AskBar
          variant="line"
          rows={1}
          label="Ask Merlin to change this table"
          placeholder="Ask Merlin: sales seats that ended this quarter at software companies, with what they paid"
          vocab={vocab}
          onGo={(plan, text) => askGo(c, plan, text)}
        />
        {!ended && (
          <button type="button" className="wb-askchip" aria-pressed={hired} onClick={toggleHired}>
            Recently hired
          </button>
        )}
        <button type="button" className="wb-askchip" onClick={() => onDo({ kind: "run", col: "rate" })}>
          See what they paid
        </button>
        <button type="button" className="wb-askchip" onClick={() => onDo({ kind: "run", col: "end" })}>
          See when they ended
        </button>
      </div>
      {pickedRows.length > 0 && <SelectionBar type="engagements" rows={pickedRows} onClear={() => setSelected(new Set())} onPipeline={() => void toPipeline()} onNotes={draftNotes} onPass={() => setPasses(companiesOf(pickedRows))} />}
      <div className="wb-body">
        <section aria-label={listName} className="wb-main">
          {t.listWaits ? (
            <div className="wb-empty-list" role="status">
              <strong>Loading every seat</strong>
            </div>
          ) : sorted.length ? (
            <Workbench
              type="engagements"
              rows={inView}
              cols={cols}
              mine={namedFn(me.function)}
              selected={selected}
              onPick={pick}
              onPickAll={(on) => setSelected(on ? new Set(inView.map((r) => r.key)) : new Set())}
              onOpen={(r) => c.openCompany(r.i.c.id, r.key)}
              sort={t.sort}
              onSort={(s) => (colSort.clear(), t.setSort(s))}
              sorter={colSort}
              onAddColumn={() => (setVerify(null), setToolsOpen(true), setRun(null), setToolsTab("enrich"))}
              fresh={fresh}
              cell={cell}
            />
          ) : (
            <div className="wb-empty-list">
              <strong>{ended ? "No seat on file ended in the last 90 days with these filters." : "Nothing matches these filters."}</strong>
              <button type="button" className="tp-flink" onClick={t.clearFilters}>
                Clear the filters
              </button>
            </div>
          )}
          {sorted.length > limit && (
            <button type="button" className="btn wb-more" onClick={() => setLimit((n) => n + pageSize)}>
              Show {Math.min(pageSize, sorted.length - limit)} more
            </button>
          )}
        </section>
        {aside}
      </div>
      {bottom(<StatusLine me={live} run={runStatus} />)}
      {saveOpen && <SaveViewSheet defaultName={listName} emailOn={c.view.email} existing={savedHere} onSave={saveList} onClose={() => setSaveOpen(false)} />}
      {notes[0] &&
        (() => {
          const i = notes[0];
          const b = bestBuyer(i.c, me.function)!;
          const move = buyerNoteMove(i.c, b, live);
          const next = () => setNotes((n) => n.slice(1));
          const sent = () => void pipelineAct({ type: "pipeline.sent", companyId: i.c.id, from: "record", ...moveSent(move) });
          return <NoteSheet key={i.c.id} m={move} row={{ id: i.c.id, kinds: [], lines: [] }} me={live} onClose={next} onUsed={sent} onSent={() => (sent(), next())} onClaude={next} sentLabel={notes.length > 1 ? `Mark as sent, next of ${notes.length}` : "Mark as sent"} />;
        })()}
      {passes[0] && <PassSheet key={passes[0].c.id} company={passes[0].c.id} from="record" infos={c.infos} onClose={() => setPasses((p) => p.slice(1))} />}
    </VerifyHost>
  );
}
