"use client";

/**
 * People (People.dc.html, Data / People in the new look): the people at companies that hire
 * fractionals, on the Stage 1 workbench (workbench/Workbench.tsx, ToolsPanel, SelectionBar,
 * RunConfig), with four views: Decision makers, Hired a fractional, People I know, All.
 *
 *   Columns    Name and title (one purchase), Company, Relationship (free), How you know them,
 *              Email, Phone and Public profile (1 credit each, after the name), Last touch, In
 *              pipeline. The locks are the table's own cells (Tables.tsx), so a click spends as
 *              there: one purchase, the question first where the app asks. A bulk run is one
 *              quote, one confirm, one button (SelectionBar, RunConfig).
 *   Names      a click on a name opens the person bubble (PersonBubble.tsx).
 *   Sources    each independent (the owner's decision): Google, the LinkedIn connections file, a
 *              contacts CSV (network/ConnectPanel.tsx). "People I know" is everyone the member
 *              brought in at a company on Merlin (lib/paths knownView), merged with Merlin's own
 *              record of them where one matches precisely; their own words for those Merlin holds
 *              no record of.
 *   First visit  Merlin's people are here, locked; People I know shows the connect step inline
 *              with four rows labelled Example (never counted, never sent, nothing to press).
 *
 * No export anywhere: members cannot export data from Merlin. A phone gets the card list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnownPersonView } from "@/lib/paths/types";
import { STAGE_WORDS } from "@/lib/pipeline";
import { buyerNoteMove, moveSent } from "@/lib/moves";
import { IconSearch, IconX, useToast } from "../../ui/shared";
import { CardList } from "../Cards";
import { SaveViewSheet } from "../Hunt";
import { NoteSheet } from "../MoveNote";
import { PassSheet } from "../PeerSheets";
import { useLayout } from "../hooks";
import { CompanyName, NameAndTitle, None } from "../Tables";
import { absolutePlace, applyFilters, criteriaOf, EMPTY_FILTERS, icpEmpty, rowsFor, withIcpSpelled, type CoInfo, type Filters, type Row } from "../model";
import { useUi } from "../ui";
import { pipelineAct, usePipeline } from "../pipelineStore";
import { firstOf, ownOf } from "../firstVisit";
import { PersonBubble, dayWords, shownPerson, srcLine, useKnownByRecord } from "../PersonBubble";
import { ConnectPanel, warmWord, type SourceKey } from "../network/ConnectPanel";
import { useKnown, usePaths } from "../network/usePaths";
import { openWay } from "../network/useWays";
import { stripGone, useApp } from "../shell/pages";
import { Workbench } from "../workbench/Workbench";
import { ToolsPanel } from "../workbench/ToolsPanel";
import { SelectionBar } from "../workbench/SelectionBar";
import { StatusLine } from "../workbench/StatusLine";
import { profileLink } from "../workbench/cells";
import { fillRate, visibleColumns, type ColumnDef } from "../workbench/columns";
import type { ToolDo, ToolTab } from "../workbench/tools";
import {
  CHIPS, EXAMPLE_PEOPLE, PEOPLE_SORTS, PEOPLE_VIEWS, hayOf, inView, knows, nameOf, ownFill, ownRows, passesChips, sortPeople, titleOf, withKnown,
  type Chip, type PeopleRow, type PeopleView,
} from "./peopleModel";
import { takePeopleStart } from "./start";
import "../workbench/workbench.css";
import "./people.css";

const PAGE = 50;
/** The columns People shows before the member picks, in the mockup's order (the name leads). */
const COLS_ALL = ["name", "company", "relationship", "know", "email", "phone", "linkedin", "last", "pipe"];
const COLS_KNOWN = ["name", "company", "know", "last", "pipe", "relationship", "email", "phone", "linkedin"];
const SLIM_OUT = new Set(["phone", "linkedin", "last"]);
type Scope = "all" | "ideal" | "pipe";
type Side = "tools" | "step" | "none";
const n = (x: number) => x.toLocaleString("en-US");

/** The member's own people as the Merlin rows they matched, else their own rows. */
function usePeopleRows(infos: CoInfo[], known: KnownPersonView[] | undefined) {
  const byRecord = useKnownByRecord();
  return useMemo(() => {
    const base = rowsFor("people", infos);
    const rows = withKnown(base, byRecord);
    const records = new Set(base.map((r) => r.p!.id));
    const byId = new Map(infos.map((i) => [i.c.id, i]));
    return { rows, own: ownRows(known ?? [], byId, records) };
  }, [infos, known, byRecord]);
}

export function PeoplePage() {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const layout = useLayout();
  const live = ui.me;
  const me = c.me;
  const t = c.table;
  const hasIcp = !icpEmpty(me.icp);
  const known = useKnown();
  const { view: paths } = usePaths();
  const { view: pipeline } = usePipeline();
  const startAt = useRef(takePeopleStart());
  // Read once, when the page opens: bringing someone in here moves the strip on, it doesn't end the first visit.
  const [first] = useState(() => firstOf("people", ownOf("people", me)).first);
  const [view, setView] = useState<PeopleView>(startAt.current?.view ?? "dm");
  const [scope, setScope] = useState<Scope>(first && hasIcp ? "ideal" : "all");
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [fOpen, setFOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(0);
  const [slim, setSlim] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sources = known.known?.sources ?? null;
  const hasSources = !!me.started?.network || !!(sources && (sources.google || sources.linkedin !== null || sources.csv !== null));
  const [side, setSide] = useState<Side>(startAt.current?.step || (first && !hasSources) ? "step" : "tools");
  const [src, setSrc] = useState<SourceKey>("google");
  const [toolsTab, setToolsTab] = useState<ToolTab>("enrich");
  const [run, setRun] = useState<string | null>(null);
  const [who, setWho] = useState<{ key: string; el: HTMLElement } | null>(null);
  const [notes, setNotes] = useState<PeopleRow[]>([]);
  const [passes, setPasses] = useState<CoInfo[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [stripOff, setStripOff] = useState(-1);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ label: string; filled: number; of: number; spent: number } | null>(null);

  // Brought in on this page: the member's view says so (Getting started's step 3, the rail's card).
  const hadSources = useRef(hasSources);
  useEffect(() => {
    if (hasSources && !hadSources.current) void c.refresh();
    hadSources.current = hasSources;
  }, [hasSources, c]);

  /* ----- the rows ----- */
  const { rows: merlin, own } = usePeopleRows(c.infos, known.known?.people);
  const pipeIds = useMemo(() => new Set((pipeline?.entries ?? []).filter((e) => e.stage !== "lost" && e.stage !== "notnow").map((e) => e.company)), [pipeline]);
  const stageOf = useMemo(() => new Map((pipeline?.entries ?? []).map((e) => [e.company, STAGE_WORDS[e.stage]])), [pipeline]);
  const ways = (id: string) => paths?.counts[id]?.n ?? 0;
  const eff: Filters = useMemo(() => ({ ...(t.filters ?? EMPTY_FILTERS), icp: scope === "ideal" && hasIcp }), [t.filters, scope, hasIcp]);
  const scoped = useMemo(() => {
    const keep = new Set(applyFilters(merlin, eff, t.tab, "", me).rows.map((r) => r.key));
    const m = merlin.filter((r) => keep.has(r.key) && (scope !== "pipe" || pipeIds.has(r.i.c.id)));
    const cos = new Set(m.map((r) => r.i.c.id));
    // The member's own people go where their company is in this list.
    const o = own.filter((r) => (scope === "all" ? true : scope === "pipe" ? pipeIds.has(r.i.c.id) : cos.has(r.i.c.id) || applyFilters(rowsFor("companies", [r.i]), eff, "all", "", me).rows.length > 0));
    return [...m, ...o];
  }, [merlin, own, eff, t.tab, me, scope, pipeIds]);
  const aside = chips.has("aside");
  const words = q.trim().toLowerCase();
  const counts = useMemo(() => {
    const out = { dm: 0, hired: 0, known: 0, all: 0 } as Record<PeopleView, number>;
    for (const r of scoped) for (const v of PEOPLE_VIEWS) if (inView(r, v.key, false)) out[v.key]++;
    return out;
  }, [scoped]);
  const listed = useMemo(
    () => sortPeople(scoped.filter((r) => inView(r, view, aside) && passesChips(r, chips, { pipe: pipeIds }) && (!words || hayOf(r).includes(words))), sort, ways),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, view, aside, chips, pipeIds, words, sort, paths],
  );
  const shown = listed.slice(0, limit);
  useEffect(() => {
    setLimit(PAGE);
    setSelected(new Set());
    setWho(null);
  }, [view, scope, chips, words, sort]);
  const examples = first && !hasSources && view === "known" && !aside;
  const pickedRows = shown.filter((r) => selected.has(r.key));

  /* ----- the columns ----- */
  const order = view === "known" ? COLS_KNOWN : COLS_ALL;
  const reg = visibleColumns("people", order);
  const cols: ColumnDef[] = order
    .filter((id) => !(slim && SLIM_OUT.has(id)))
    .map((id) => reg.find((x) => x.id === id))
    .filter((x): x is ColumnDef => !!x)
    .map((col) =>
      col.id === "know" || col.id === "last" || col.id === "pipe"
        ? { ...col, fill: (r: Row) => (ownFill(col.id as "know", [r as PeopleRow], pipeIds).filled ? "value" : "empty") }
        : col.id === "name"
          ? { ...col, fill: (r: Row) => ((r as PeopleRow).own ? "value" : col.fill(r)) }
          : col.id === "company"
          ? { ...col, label: "Company" }
          : col,
    );

  /* ----- the bubble ----- */
  const rowByKey = useMemo(() => new Map(listed.map((r) => [r.key, r])), [listed]);
  const openWho = (r: Row, el?: HTMLElement | null) => {
    const anchor = el ?? (document.querySelector(`tr[data-row="${CSS.escape(r.key)}"] .ppl-name`) as HTMLElement | null) ?? (document.querySelector(`tr[data-row="${CSS.escape(r.key)}"]`) as HTMLElement | null);
    if (!anchor) return;
    setWho((w) => (w?.key === r.key ? null : { key: r.key, el: anchor }));
  };
  const whoRow = who ? rowByKey.get(who.key) ?? null : null;

  /* ----- actions ----- */
  const say = (m: string, err = false) => (setMsg(m), toast(m, err));
  const companiesOf = (rows: PeopleRow[]) => {
    const seen = new Set<string>();
    return rows.map((r) => r.i).filter((i) => !seen.has(i.c.id) && (seen.add(i.c.id), true));
  };
  const toPipeline = async (rows: PeopleRow[]) => {
    if (!rows.length) return say("Tick some rows first, then add them to your pipeline.");
    const cos = companiesOf(rows);
    const open = cos.filter((i) => !i.c.hidden && !pipeIds.has(i.c.id));
    if (!open.length) return say(cos.some((i) => i.c.hidden) ? "Open the company first. Then it can go in your pipeline." : "Those companies are already in your pipeline.");
    const r = await pipelineAct({ type: "pipeline.add", companyIds: open.map((i) => i.c.id) });
    say(r.message || `${n(open.length)} ${open.length === 1 ? "company" : "companies"} added to your pipeline as targets.`, !r.ok);
  };
  const draft = (rows: PeopleRow[]) => {
    if (!rows.length) return say("Tick some rows first, then draft notes to them.");
    const named = rows.filter((r) => !r.own && r.p && shownPerson(r.p) && !r.i.c.hidden);
    if (!named.length) return say("Open a name first. Merlin drafts notes only to people you can see.", true);
    if (named.length < rows.length) toast(`${n(rows.length - named.length)} left out: their name isn't open, or Merlin holds no record of them.`);
    setNotes(named);
  };
  const pass = (rows: PeopleRow[]) => {
    const cos = companiesOf(rows);
    if (!cos.length) return say("Tick some rows first.");
    setPasses(cos);
  };
  const herePlace = absolutePlace({ t: "people", v: t.tab, s: null, f: eff, q: "" });
  const savedHere = (me.savedViews ?? []).find((v) => v.place === herePlace) ?? null;
  const listName = scope === "ideal" ? "People at your ideal client" : PEOPLE_VIEWS.find((v) => v.key === view)!.label;
  const saveList = async (name: string, email: boolean) => {
    const r = await ui.act(
      { type: "savedView", op: "save", name, email, place: herePlace, criteria: criteriaOf(withIcpSpelled(eff, me.icp), null), list: { kind: "people", alert: { on: email, email, slack: email } } },
      { quiet: true },
    );
    if (!r.ok) return false;
    toast(r.message || "Saved.");
    setAlerted(true);
    return true;
  };
  const openStep = (s?: SourceKey) => {
    if (s) setSrc(s);
    setSide("step");
    setRun(null);
  };
  const onDo = (d: ToolDo) => {
    if (d.kind === "run") return setRun(d.col);
    if (d.kind === "connect") return openStep(d.source);
    if (d.kind === "scope") return setScope(d.scope);
    if (d.kind === "agent") return c.openPage("agent");
    if (d.kind === "type") return t.setRecordType(d.type);
    if (d.kind === "alert") {
      if (d.trigger === "leader" && live.plan?.tier === "free") return say("Watching for a new decider is on Pro. Save the list now and its weekly email still comes.");
      return setSaveOpen(true);
    }
    if (d.kind !== "action") return;
    if (d.action === "pipeline") return void toPipeline(pickedRows);
    if (d.action === "notes") return draft(pickedRows);
    if (d.action === "pass") return pass(pickedRows);
  };
  const runDone = (x: { col: string; scope: Row[]; done: number; spent: number }) => {
    const def = cols.find((k) => k.id === x.col) ?? reg.find((k) => k.id === x.col);
    if (def) {
      const f = fillRate({ ...def, counts: "value" }, x.scope);
      setLastRun({ label: def.label, filled: f.filled, of: f.of, spent: x.spent });
    }
    setRun(null);
  };

  /* ----- the cells People draws itself ----- */
  const knowCell = (r: PeopleRow) => {
    if (r.k?.away)
      return (
        <span className="tp-stack">
          <span className="ppl-muted">Set aside</span>
          <span className="tp-stack-sub">Not a relationship</span>
        </span>
      );
    if (knows(r))
      return (
        <span className="tp-stack">
          <span className={`ppl-warm ppl-warm-${warmWord(r.k!.warmth).toLowerCase()}`}>{warmWord(r.k!.warmth)}</span>
          <span className="tp-stack-sub" title={srcLine(r.k!.src)}>
            {r.k!.why}
          </span>
        </span>
      );
    if (!hasSources) return <span className="ppl-muted">Not brought in yet</span>;
    const w = ways(r.i.c.id);
    if (w && !r.i.c.hidden)
      return (
        <button type="button" className="ppl-link" onClick={(e) => (e.stopPropagation(), openWay(r.i.c.id))}>
          <span>{w === 1 ? "1 way in" : `${n(w)} ways in`}</span>
          <span className="tp-stack-sub">Through people you know</span>
        </button>
      );
    return (
      <span className="tp-stack">
        <span className="ppl-muted">No one you know yet</span>
      </span>
    );
  };
  const nameCell = (r: PeopleRow) => {
    const nm = nameOf(r);
    if (nm)
      return (
        <button type="button" className="ppl-name" aria-haspopup="dialog" aria-expanded={who?.key === r.key} onClick={(e) => (e.stopPropagation(), openWho(r, e.currentTarget))}>
          <span className="ppl-name-t">{nm}</span>
          <span className="ppl-name-s">
            {titleOf(r) ?? ""}
            {r.own && <span className="ppl-yours">Yours</span>}
          </span>
        </button>
      );
    if (r.i.c.hidden)
      return (
        <span className="tp-stack ppl-wait">
          <span className="ppl-muted">Opens after the company</span>
          <span className="tp-stack-sub">Name and title: 1 credit</span>
        </span>
      );
    return (
      <span className="tp-stack ppl-locked">
        <NameAndTitle i={r.i} e={r.e} p={r.p!} />
        <span className="tp-stack-sub">Name and title, one unlock</span>
      </span>
    );
  };
  const cell = (id: string, row: Row) => {
    const r = row as PeopleRow;
    if (id === "name") return nameCell(r);
    if (id === "know") return knowCell(r);
    if (id === "last")
      return knows(r) && r.k!.last ? (
        <span className="tp-stack">
          <span>{dayWords(r.k!.last)}</span>
          {r.k!.lastKind && <span className="tp-stack-sub">{r.k!.lastKind}</span>}
        </span>
      ) : (
        <span className="ppl-muted">None yet</span>
      );
    if (id === "pipe") {
      const st = stageOf.get(r.i.c.id);
      if (st)
        return (
          <button type="button" className="ppl-stage" onClick={(e) => (e.stopPropagation(), c.openPage("pipeline"))}>
            {st}
          </button>
        );
      if (r.i.c.hidden) return <None title="Open the company first. Then it can go in your pipeline." />;
      return (
        <button type="button" className="ppl-add" aria-label={`Add ${r.i.c.name} to your pipeline as a target`} onClick={(e) => (e.stopPropagation(), void toPipeline([r]))}>
          Add
        </button>
      );
    }
    if (!r.own) return undefined;
    // The member's own people: their own words, nothing to unlock.
    if (id === "company") return <CompanyName i={r.i} following={r.i.c.following} />;
    if (id === "email") return r.k?.email ? <span className="ppl-own" title="From what you brought in">{r.k.email}</span> : <None title="Not on file" />;
    if (id === "linkedin") return r.k?.profile ? profileLink(r.k.profile) : <None title="Not on file" />;
    return <None title="Merlin holds no record of them yet" />;
  };

  /* ----- the first visit ----- */
  const stage = hasSources ? 1 : 0;
  const stripKey = ["people", "people-known"][stage];
  const showStrip = first && stripOff !== stage && !stripGone(c, stripKey);
  const knownN = (known.known?.people ?? []).filter((p) => !p.away && p.company).length;
  const opensUsed = live.proOpens ? live.proOpens.of - live.proOpens.left : null;
  const status =
    msg ??
    (first && opensUsed !== null ? `Trial: ${opensUsed} of ${live.proOpens!.of} free company opens used today. A name and title cost 1 credit.` : null);

  const bubble =
    whoRow && who ? (
      <PersonBubble
        anchor={who.el}
        i={whoRow.i}
        p={whoRow.own ? null : whoRow.p ?? null}
        e={whoRow.e ?? null}
        known={whoRow.k}
        onClose={() => setWho(null)}
        stage={stageOf.get(whoRow.i.c.id) ?? null}
        onAddPipeline={() => void toPipeline([whoRow])}
        onPipeline={() => c.openPage("pipeline")}
        onDraft={!whoRow.own && whoRow.p && shownPerson(whoRow.p) ? () => (setWho(null), setNotes([whoRow])) : undefined}
        onConnect={!hasSources ? () => (setWho(null), openStep()) : undefined}
        onAdd={() => (setWho(null), c.openAdd({ companyId: whoRow.i.c.id, mode: "person" }))}
      />
    ) : null;

  /* ----- the phone: the card list ----- */
  if (layout === "phone")
    return (
      <main className="tp-main tp-main-page wb-host">
        <div className="wb wb-phone pp ppl-phone">
          <h1 className="sr-only">People: {listName}</h1>
          <div className="wb-phone-bar">
            <label className="wb-phone-view">
              <span>View</span>
              <select value={view} onChange={(e) => setView(e.target.value as PeopleView)}>
                {PEOPLE_VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label} · {n(counts[v.key])}
                  </option>
                ))}
              </select>
            </label>
            <span className="wb-phone-n num">{n(listed.length)} people</span>
          </div>
          {view === "known" && !hasSources ? (
            <ConnectPanel variant="inline" start={src} step={first ? { n: 3, of: c.start.six.of } : null} onSeeKnown={() => setView("known")} onNext={() => t.setRecordType("companies")} />
          ) : (
            <>
              <CardList type="people" rows={shown.filter((r) => !r.own)} me={me} onOpen={(r) => openWho(r, document.activeElement as HTMLElement | null)} />
              {shown.some((r) => r.own) && (
                <ul className="ppl-cards" aria-label="People you know">
                  {shown
                    .filter((r) => r.own)
                    .map((r) => (
                      <li key={r.key} className="ppl-card">
                        <button type="button" className="ppl-name" onClick={(e) => openWho(r, e.currentTarget)}>
                          <span className="ppl-name-t">{nameOf(r)}</span>
                          <span className="ppl-name-s">
                            {titleOf(r) ?? ""}
                            <span className="ppl-yours">Yours</span>
                          </span>
                        </button>
                        <CompanyName i={r.i} following={r.i.c.following} />
                        {knowCell(r)}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          {listed.length > limit && (
            <button type="button" className="btn wb-more" onClick={() => setLimit((x) => x + PAGE)}>
              Show {Math.min(PAGE, listed.length - limit)} more
            </button>
          )}
          {bubble}
        </div>
      </main>
    );

  return (
    <main className="tp-main tp-main-page wb-host">
      <div className="wb pp">
        <h1 className="sr-only">People: {aside ? "Set aside" : listName}</h1>
        {showStrip && (
          <section aria-label="About this page" className={`wb-strip${stage ? " wb-strip-done" : ""}`}>
            {stage === 0 ? (
              <>
                <span className="wb-strip-t">
                  <strong>What this page is for.</strong> The people at companies that hire fractionals: who decides, who hired the seat and who you already know. Open a name for 1 credit, add columns, and tick rows to send them to your pipeline. Merlin&apos;s {n(merlin.length)} people are here now, locked.
                </span>
                {side !== "step" && (
                  <button type="button" className="btn btn-pine" onClick={() => openStep()}>
                    Bring in who you know
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="wb-strip-t">
                  <strong>Step 3 done. {knownN ? `Merlin found ${n(knownN)} ${knownN === 1 ? "person" : "people"} you know.` : "Your contacts are in."}</strong> Each one is now a warm path. Next, open your first company.
                  {live.plan?.name === "trial" ? " It is free on the trial." : ""}
                </span>
                <button type="button" className="btn btn-pine" onClick={() => t.setRecordType("companies")}>
                  Open your first company
                </button>
                <button type="button" className="tp-flink wb-strip-link" onClick={() => c.openPage("warm")}>
                  See your warm paths
                </button>
              </>
            )}
            <button type="button" className="wb-iconbtn" aria-label="Dismiss" onClick={() => (setStripOff(stage), c.start.dismissStrip(stripKey))}>
              <IconX size={16} />
            </button>
          </section>
        )}

        <div className="ppl-bar">
          <div role="tablist" aria-label="Views" className="ppl-views">
            {PEOPLE_VIEWS.map((v) => {
              const on = view === v.key && !aside;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`ppl-view${on ? " on" : ""}`}
                  onClick={() => {
                    setView(v.key);
                    if (aside) setChips((s) => (s.delete("aside"), new Set(s)));
                  }}
                >
                  {v.label}
                  <span className="ppl-view-n num">{n(counts[v.key])}</span>
                </button>
              );
            })}
          </div>
          <span className="wb-tb-sp" />
          <button type="button" className="wb-tb" aria-pressed={!!savedHere?.email || alerted} onClick={() => setSaveOpen(true)}>
            {savedHere?.email || alerted ? "Alert on · new deciders" : "Save as alert"}
          </button>
          <button type="button" className={`wb-tb wb-tools-btn${side === "tools" ? " on" : ""}`} aria-pressed={side === "tools"} onClick={() => (setSide(side === "tools" ? "none" : "tools"), setRun(null))}>
            Tools
          </button>
        </div>

        <div className="ppl-bar ppl-bar2">
          <button type="button" className="wb-tb" aria-pressed={slim} onClick={() => setSlim(!slim)}>
            {cols.length} of {order.length} columns · {slim ? "show more" : "show fewer"}
          </button>
          <button type="button" className={`wb-tb${chips.size ? " on" : ""}`} aria-expanded={fOpen} onClick={() => setFOpen(!fOpen)}>
            Filter{chips.size ? ` · ${chips.size}` : ""}
          </button>
          <button type="button" className="wb-tb" onClick={() => setSort((x) => (x + 1) % 3)}>
            <span>
              Sort<span className="wb-tb-sub">: {PEOPLE_SORTS[sort]}</span>
            </span>
          </button>
          <button type="button" className="ppl-earn" onClick={() => c.openAdd({ mode: "person" })}>
            + Add a person · earn 1 credit
          </button>
          <span className="ppl-rows num" role="status">
            {aside ? `${n(listed.length)} set aside` : examples ? "4 example rows" : `${n(shown.length)} of ${n(listed.length)} rows`}
          </span>
          {scope === "ideal" && hasIcp && (
            <span className="ppl-ideal">
              <span>{first ? "Already filtered to your ideal client, from sign-up." : "People at your ideal client."}</span>
              <button type="button" className="tp-flink" onClick={c.openProfile}>
                Change your ideal client
              </button>
            </span>
          )}
          {fOpen && (
            <span role="group" aria-label="Filters" className="ppl-chips">
              {CHIPS.map((x) => {
                const on = chips.has(x.key);
                return (
                  <button
                    key={x.key}
                    type="button"
                    aria-pressed={on}
                    className={`ppl-chip${on ? " on" : ""}`}
                    onClick={() =>
                      setChips((s) => {
                        const next = new Set(s);
                        if (on) next.delete(x.key);
                        else next.add(x.key);
                        return next;
                      })
                    }
                  >
                    {x.label}
                  </button>
                );
              })}
              <button type="button" className="tp-flink" onClick={() => (setChips(new Set()), setQ(""))}>
                Clear
              </button>
            </span>
          )}
        </div>

        <div className="ppl-ask">
          <label className="ppl-search">
            <IconSearch size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people by name, company or title" placeholder="Search a name, company or title" />
          </label>
          <button
            type="button"
            className="wb-askchip"
            onClick={() => {
              if (!hasSources) {
                openStep();
                return say("Merlin needs who you know to answer that. Step 3 is open beside the table.");
              }
              setView("dm");
              setChips(new Set(["warm"]));
              setFOpen(true);
              setMsg("The view is Decision makers, with 1 filter: strong or good. Change either above the table.");
            }}
          >
            Try: deciders I already know
          </button>
          <button type="button" className="wb-askchip" onClick={() => (setSide("tools"), setRun("name"))}>
            Find the decider
          </button>
          <button type="button" className="wb-askchip" onClick={() => (setSide("tools"), setRun("email"))}>
            Find an email
          </button>
          <button type="button" className="wb-askchip" onClick={() => openStep()}>
            Match to my contacts
          </button>
        </div>

        {pickedRows.length > 0 && (
          <SelectionBar type="people" rows={pickedRows} onClear={() => setSelected(new Set())} onPipeline={() => void toPipeline(pickedRows)} onNotes={() => draft(pickedRows)} onPass={() => pass(pickedRows)} />
        )}

        <div className="wb-body">
          <section aria-label="People" className="wb-main">
            {examples ? (
              <div className="ppl-first">
                {side !== "step" && <ConnectPanel variant="inline" start={src} step={first ? { n: 3, of: c.start.six.of } : null} onSeeKnown={() => setView("known")} onNext={() => t.setRecordType("companies")} />}
                <div className="ppl-ex-head">
                  <span>
                    <strong>These 4 rows are examples.</strong> This view fills with your own people once you bring in who you know: how you know them, when you last spoke and which of them decide. Only you see it.
                  </span>
                  {side !== "step" ? null : (
                    <span className="ppl-muted">Step 3 is open beside the table.</span>
                  )}
                </div>
                <ExampleTable />
              </div>
            ) : listed.length ? (
              <Workbench
                type="people"
                rows={shown}
                cols={cols}
                mine={me.function}
                selected={selected}
                onPick={(key, on) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (on) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
                onPickAll={(on) => setSelected(on ? new Set(shown.map((r) => r.key)) : new Set())}
                onOpen={(r) => openWho(r)}
                sort="title"
                onAddColumn={() => (setSide("tools"), setRun(null), setToolsTab("enrich"))}
                cell={cell}
                rowClass={(r) => ((r as PeopleRow).own ? "ppl-own-row" : "")}
              />
            ) : (
              <div className="wb-empty-list">
                <strong>{aside ? "Nothing is set aside." : "No one matches."}</strong>{" "}
                {aside
                  ? "People you mark as not a relationship wait here, with an undo."
                  : words
                    ? "No name, company or title matches that."
                    : view === "known"
                      ? hasSources
                        ? "Nobody you know is at a company in this list yet. Try All people below."
                        : "Bring in who you know, and the people you know show here."
                      : "Clear the filters, or pick another list below."}
                <button type="button" className="tp-flink" onClick={() => (setChips(new Set()), setQ(""), setScope("all"))}>
                  Show everyone again
                </button>
              </div>
            )}
            {!examples && listed.length > limit && (
              <button type="button" className="btn wb-more" onClick={() => setLimit((x) => x + PAGE)}>
                Show {Math.min(PAGE, listed.length - limit)} more
              </button>
            )}
          </section>
          {side === "tools" && (
            <ToolsPanel
              type="people"
              ctx={{ me: live, network: c.network, close: live.plan?.canClose ?? true, sources: { google: !!sources?.google, googleOn: !!paths?.googleOn, linkedin: sources?.linkedin ?? null, csv: sources?.csv ?? null }, icp: hasIcp }}
              tab={toolsTab}
              onTab={setToolsTab}
              run={run}
              onRun={setRun}
              rows={shown.filter((r) => !r.own)}
              picked={pickedRows.filter((r) => !r.own)}
              onDo={onDo}
              onRunDone={runDone}
              onClose={() => setSide("none")}
            />
          )}
          {side === "step" && (
            <aside className="wb-tools ppl-side" aria-label="Bring in who you know">
              <ConnectPanel
                key={src}
                start={src}
                step={first && !hasSources ? { n: 3, of: c.start.six.of, onClose: () => setSide(first ? "none" : "tools") } : { n: 3, of: c.start.six.of, onClose: () => setSide("tools") }}
                onSeeKnown={() => (setView("known"), setChips(new Set()))}
                onNext={() => t.setRecordType("companies")}
              />
            </aside>
          )}
        </div>

        <div className="wb-bottom">
          <div role="tablist" aria-label="Lists" className="wb-bottom-tabs">
            {(
              [
                ["all", `All people · ${n(merlin.length)}`],
                ...(hasIcp ? [["ideal", "Your ideal client"] as [Scope, string]] : []),
                ["pipe", "In my pipeline"],
              ] as [Scope, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={scope === k} className={`wb-btab${scope === k ? " on" : ""}`} onClick={() => setScope(k)}>
                {label}
              </button>
            ))}
            <button type="button" className="wb-btab wb-btab-add" onClick={() => c.openPage("find")}>
              + New list
            </button>
          </div>
          {status ? (
            <span className="wb-status" aria-live="polite">
              {status}
            </span>
          ) : (
            <StatusLine me={live} run={lastRun} />
          )}
        </div>

        {bubble}
        {saveOpen && <SaveViewSheet defaultName={listName} emailOn={c.view.email} existing={savedHere} onSave={saveList} onClose={() => setSaveOpen(false)} />}
        {notes[0] &&
          (() => {
            const r = notes[0];
            const rel = r.p!.cells.relationship;
            const move = buyerNoteMove(r.i.c, { p: r.p!, e: r.e ?? null, rel: rel?.s === "value" ? rel.v : null }, live);
            const next = () => setNotes((x) => x.slice(1));
            const sent = () => void pipelineAct({ type: "pipeline.sent", companyId: r.i.c.id, from: "record", ...moveSent(move) });
            return <NoteSheet key={r.key} m={move} row={{ id: r.i.c.id, kinds: [], lines: [] }} me={live} onClose={next} onUsed={sent} onSent={() => (sent(), next())} onClaude={next} sentLabel={notes.length > 1 ? `Mark as sent, next of ${notes.length}` : "Mark as sent"} />;
          })()}
        {passes[0] && <PassSheet key={passes[0].c.id} company={passes[0].c.id} from="record" infos={c.infos} onClose={() => setPasses((p) => p.slice(1))} />}
      </div>
    </main>
  );
}

/** The four example rows of a first visit: labelled, outside every count, with nothing to press. */
function ExampleTable() {
  return (
    <div className="wb-scroll">
      <table className="wb-table ppl-ex" aria-label="Example rows">
        <thead>
          <tr className="wb-head">
            <th scope="col" className="wb-th">Name and title</th>
            <th scope="col" className="wb-th">Company</th>
            <th scope="col" className="wb-th">How you know them</th>
            <th scope="col" className="wb-th">Last touch</th>
            <th scope="col" className="wb-th">Relationship</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_PEOPLE.map((x) => (
            <tr key={x.value.name} className="ppl-ex-row">
              <td className="wb-td">
                <span className="tp-stack">
                  <span>
                    {x.value.name} <span className="ppl-ex-tag">{x.label}</span>
                  </span>
                  <span className="tp-stack-sub">{x.value.title}</span>
                </span>
              </td>
              <td className="wb-td">
                <span className="tp-stack">
                  <span>A company on Merlin</span>
                  <span className="tp-stack-sub">{x.value.seat}</span>
                </span>
              </td>
              <td className="wb-td">
                <span className="tp-stack">
                  <span className={`ppl-warm ppl-warm-${x.value.warm.toLowerCase()}`}>{x.value.warm}</span>
                  <span className="tp-stack-sub">{x.value.why}</span>
                </span>
              </td>
              <td className="wb-td">
                <span className="tp-stack">
                  <span>{x.value.last}</span>
                  {x.value.lastKind && <span className="tp-stack-sub">{x.value.lastKind}</span>}
                </span>
              </td>
              <td className="wb-td">{x.value.rel ? <span className="ppl-rel">{x.value.rel}</span> : <span className="ppl-muted">Not on file</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
