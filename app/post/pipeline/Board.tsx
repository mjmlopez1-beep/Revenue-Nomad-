"use client";

/**
 * Pipeline in the new look (Pipeline.dc.html, both states): the board right under a one-row
 * toolbar (Board or Table, Filter, Sort, Add from a list, Add a deal), the columns in Merlin's own
 * stages with each one's count and value a month, Lost folded under Won, and a card's drawer on
 * the right (its next move, follow-ups, value, proposal or contract, way in, notes, Mark won).
 *
 *   Board   the cards by stage. Move on a card (buttons, so the keyboard reaches every stage) or
 *           drag a card to a column. Moving by hand is "You marked it", as Move to always was.
 *   Table   the same deals on the Stage 1 workbench (workbench/Workbench.tsx): its fill row,
 *           checkboxes and a bulk Move to. No export: members never export from Merlin.
 *   Intros  the bottom tab: intros asked and asked of the member, marked made or declined.
 *
 * A first visit (no deals of their own) shows the empty columns, two cards labelled Example (never
 * counted, never sent: model.ts EXAMPLE_CARDS), Add a deal and Add from a list. Nothing on this page
 * spends a credit but a locked company's own Open, which asks first (ui.unlock).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { LINE, MOVE_STAGES, STAGE_WORDS, isMoveStage, type MoveStage, type PipelineRec, type PipelineView } from "@/lib/pipeline";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { CompanyLogo, IconChevron, IconPlus, IconX, LockedName, useToast } from "../../ui/shared";
import { useUi } from "../ui";
import { rowsFor, type CoInfo, type Row } from "../model";
import { store } from "../hooks";
import { useApp } from "../shell/pages";
import { PageStrip } from "../shell/PageStrip";
import { loadPipeline, pipelineAct, usePipeline } from "../pipelineStore";
import { usePlans } from "../network/useWays";
import { Workbench } from "../workbench/Workbench";
import { COMPANY_COLUMNS, type ColumnDef } from "../workbench/columns";
import { workbenchSortCols, type ExtraSorts } from "../workbench/useWorkbenchSort";
import { dirWords, sorterOf, useSortState, type SortKind, type SortState, type SortStore } from "../../ui/sortable";
import { Intros } from "../Pipeline";
import type { Example } from "../examples";
import {
  COLS,
  COL_NONE,
  COL_WORDS,
  EXAMPLE_CARDS,
  FILTERS,
  SORTS,
  STACKS,
  closedWords,
  colOf,
  colTotal,
  dropStage,
  money,
  nextOf,
  passes,
  shownMonthly,
  sortDeals,
  summaryWords,
  toWords,
  wayOf,
  type ColKey,
  type ExampleCard,
  type FilterKey,
  type RouteHint,
  type SortKey,
} from "./model";
import { DealDrawer, ExampleDrawer } from "./DealDrawer";
import { AddDeal, AddFromList } from "./AddDeal";
import "../workbench/workbench.css";
import "./board.css";

const WonSheet = dynamic(() => import("../WonSheet").then((m) => m.WonSheet), { ssr: false });

type Panel = { kind: "deal"; id: string } | { kind: "example"; i: number } | { kind: "add" } | { kind: "pick" } | null;
const EX_KEY = "pipeline-examples";
const MODE_KEY = "rn-pl2-mode";

/** One card: a real deal, or an Example. */
type Card = { kind: "deal"; r: PipelineRec } | { kind: "example"; x: Example<ExampleCard>; i: number };

export function PipelineBoard() {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const { view, failed } = usePipeline();
  const plans = usePlans();
  const routes = useMemo(() => new Map<string, RouteHint>((plans ?? []).filter((p) => !p.done).map((p) => [p.company, { via: p.via }])), [plans]);
  const [mode, setMode] = useState<"board" | "table">(() => (store.get(MODE_KEY) === "table" ? "table" : "board"));
  const [tab, setTab] = useState<"deals" | "intros">("deals");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [fOpen, setFOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("due");
  // The table's header sort (DealTable), kept here so the Sort button says it and clears it.
  const tableSort = useSortState("pipeline");
  const [panel, setPanel] = useState<Panel>(null);
  const [showLost, setShowLost] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [last, setLast] = useState<{ id: string; from: MoveStage; to: MoveStage; name: string } | null>(null);
  const [winning, setWinning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exGone, setExGone] = useState(false);
  // The first deal added on a first visit: the strip's next step names it.
  const [firstAdded, setFirstAdded] = useState<string | null>(null);
  const [stripDone, setStripDone] = useState(false);
  const pendingOpen = useRef<string | null>(null);
  useEffect(() => store.set(MODE_KEY, mode), [mode]);
  // Escape closes the drawer and stays on the page (a sheet open over it closes first, by its own Escape).
  useEffect(() => {
    if (!panel && !moving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".tp-sheet-wrap")) return;
      // Handled here: the shell's Esc (back to Home) leaves it alone.
      e.preventDefault();
      setPanel(null);
      setMoving(null);
    };
    // Capture: before the shell's own Esc.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel, moving]);

  const today = view?.today ?? new Date().toISOString().slice(0, 10);
  const deals = view?.entries ?? [];
  const first = !!view && deals.length === 0;
  const showEx = first && !exGone && !c.start.stripOff(EX_KEY) && !(c.me.stripsOff ?? []).includes(EX_KEY);
  const byCo = c.byId;
  const shown = useMemo(() => sortDeals(deals.filter((r) => passes(filter, r, today, routes.get(r.company))), sort), [deals, filter, sort, today, routes]);
  const cards: Card[] = useMemo(() => [...shown.map((r) => ({ kind: "deal" as const, r })), ...(showEx && filter === "all" ? EXAMPLE_CARDS.map((x, i) => ({ kind: "example" as const, x, i })) : [])], [shown, showEx, filter]);
  // Ember for the first two cards whose move is due (the screen's budget), the rest say it in words.
  const hotIds = useMemo(() => new Set(shown.filter((r) => colOf(r.stage) !== "closed" && nextOf(r, today).hot).slice(0, 2).map((r) => r.id)), [shown, today]);
  const cur = panel?.kind === "deal" ? deals.find((r) => r.id === panel.id) ?? null : null;
  useEffect(() => {
    if (panel?.kind === "deal" && view && !cur) setPanel(null);
  }, [panel, view, cur]);

  const nameOf = (r: PipelineRec) => r.name ?? "the locked company";
  const move = async (r: PipelineRec, to: MoveStage) => {
    setMoving(null);
    if (busy || r.stage === to) return;
    setBusy(true);
    const from = r.stage;
    const res = await pipelineAct({ type: "pipeline.move", id: r.id, stage: to });
    setBusy(false);
    if (!res.ok) return toast(res.message, true);
    setLast(isMoveStage(from) ? { id: r.id, from, to, name: nameOf(r) } : null);
    if (to === "won") setWinning(r.id);
    else refocus(r.id);
  };
  // The card moved to another column: keyboard focus follows it to its Move button (it was on the menu that went away).
  const refocus = (id: string) =>
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      document.querySelector<HTMLElement>(`.pl2-card[data-deal="${id}"] .pl2-move`)?.focus();
    }, 60);
  const undo = async () => {
    if (!last || busy) return;
    setBusy(true);
    const res = await pipelineAct({ type: "pipeline.move", id: last.id, stage: last.from });
    setBusy(false);
    setLast(null);
    toast(res.ok ? `Back to ${STAGE_WORDS[last.from]}.` : res.message, !res.ok);
    if (res.ok) refocus(last.id);
  };
  const openLocked = async (r: PipelineRec) => {
    const ok = await ui.unlock({ entity: "company", id: r.company, field: "identity" });
    if (ok) void loadPipeline(true);
  };
  const removeExamples = () => {
    setExGone(true);
    setPanel(null);
    c.start.dismissStrip(EX_KEY);
  };
  // A deal just added (its company): the first on a first visit names the strip's next step.
  const added = (companyId: string) => {
    if (first && !firstAdded) setFirstAdded(companyId);
  };
  // After Add a deal, its drawer opens once the view has the deal (the action's answer brings it).
  useEffect(() => {
    if (panel?.kind === "add" || panel?.kind === "pick" || !pendingOpen.current || !view) return;
    const r = view.entries.find((x) => x.company === pendingOpen.current);
    if (r) {
      pendingOpen.current = null;
      setPanel({ kind: "deal", id: r.id });
    }
  }, [view, panel]);

  if (!view) {
    return (
      <div className="pl2">
        <p className="pl2-wait" role={failed ? "alert" : "status"}>
          {failed ? "Your pipeline didn't load. Reload the page to try again." : "Loading your pipeline"}
        </p>
      </div>
    );
  }

  const firstDeal = firstAdded ? deals.find((r) => r.company === firstAdded) ?? null : null;
  const drawerOpen = !!panel && tab === "deals";
  const real = deals.length;
  const nFilter = (k: FilterKey) => deals.filter((r) => passes(k, r, today, routes.get(r.company))).length;

  const toolbar = (
    <div className="wb-toolbar pl2-toolbar" role="toolbar" aria-label="Your deals">
      <div className="pl2-seg" role="tablist" aria-label="View">
        {(["board", "table"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={tab === "deals" && mode === m} className={tab === "deals" && mode === m ? "on" : ""} onClick={() => (setMode(m), setTab("deals"), setMoving(null))}>
            {m === "board" ? "Board" : "Table"}
          </button>
        ))}
      </div>
      <button type="button" className={`wb-tb${filter !== "all" ? " on" : ""}`} aria-expanded={fOpen || filter !== "all"} onClick={() => (setFOpen(!fOpen), fOpen && setFilter("all"))}>
        {filter === "all" ? "Filter" : `Filter · ${FILTERS.find((f) => f.key === filter)!.label}`}
      </button>
      <button type="button" className="wb-tb" onClick={() => (mode === "table" && tableSort.state ? tableSort.set(null) : setSort(SORTS[(SORTS.findIndex((s) => s.key === sort) + 1) % SORTS.length].key))}>
        {(mode === "table" && pipeSortWords(tableSort.state)) || SORTS.find((s) => s.key === sort)!.label}
      </button>
      <span className="pl2-sum" role="status">
        <span>{last ? `Moved ${last.name} to ${STAGE_WORDS[last.to]}. You marked it.` : summaryWords(view, routes)}</span>
        {last && (
          <button type="button" className="pl2-undo" onClick={() => void undo()} disabled={busy}>
            Undo
          </button>
        )}
      </span>
      <button type="button" className={`pl2-big pl2-line${panel?.kind === "pick" ? " on" : ""}`} aria-pressed={panel?.kind === "pick"} onClick={() => (setTab("deals"), setPanel(panel?.kind === "pick" ? null : { kind: "pick" }))}>
        Add from a list
      </button>
      <button type="button" className={`pl2-big ${first ? "pl2-line" : "pl2-pine"}${panel?.kind === "add" ? " on" : ""}`} aria-pressed={panel?.kind === "add"} onClick={() => (setTab("deals"), setPanel(panel?.kind === "add" ? null : { kind: "add" }))}>
        <IconPlus size={14} /> Add a deal
      </button>
    </div>
  );

  const filters = (fOpen || filter !== "all") && (
    <div className="pl2-filters" role="group" aria-label="Filter deals">
      {FILTERS.map((f) => (
        <button key={f.key} type="button" className={`pl2-chip${filter === f.key ? " on" : ""}`} aria-pressed={filter === f.key} onClick={() => (setFilter(f.key), setFOpen(true))}>
          {f.label} · {nFilter(f.key)}
        </button>
      ))}
    </div>
  );

  const strip = firstDeal && !stripDone ? (
    <section className="wb-strip wb-strip-done" aria-label="About this page">
      <span className="wb-strip-t">
        <strong>{firstDeal.name ?? "Your first deal"} is in {STAGE_WORDS[firstDeal.stage]}.</strong> Next, write your note to them. Merlin drafts it and you send it.
      </span>
      <button type="button" className="btn btn-pine" onClick={() => c.openCompany(firstDeal.company)}>
        Write your note
      </button>
      <button type="button" className="wb-iconbtn pl2-x" aria-label="Dismiss" onClick={() => setStripDone(true)}>
        <IconX size={16} />
      </button>
    </section>
  ) : (
    <PageStrip page="pipeline" own={real}>
      Every company you are trying to win, from target to won. Add a deal, do its next move, and Merlin moves the card when it sees your note go out, a reply or a meeting.
    </PageStrip>
  );

  const body =
    tab === "intros" ? (
      <section className="pl2-intros" aria-label="Intros">
        <p className="pl2-lead">Intros you asked a fractional for, and intros a fractional asked of you. Mark one made and Merlin ties it to the deal it led to.</p>
        {view.intros.length ? (
          <Intros list={view.intros} onOpen={(id) => c.openCompany(id)} />
        ) : (
          <p className="pl2-none">
            No intros yet. Ask for one from a company page or from{" "}
            <button type="button" className="mv-link" onClick={() => c.openPage("warm")}>
              Warm paths
            </button>
            , where Merlin shows who can introduce you. It costs nothing to ask.
          </p>
        )}
      </section>
    ) : mode === "table" ? (
      <DealTable sortStore={tableSort} deals={shown} infos={c.infos} waiting={c.waiting} today={today} routes={routes} first={first} cur={cur?.id ?? null} onOpen={(r) => setPanel({ kind: "deal", id: r.id })} busy={busy} />
    ) : (
      <div className="pl2-board">
        {STACKS.map((stack) => (
          <div key={stack.join()} className="pl2-stack">
            {stack.map((k) => (
              <Column
                key={k}
                k={k}
                cards={cards.filter((x) => (x.kind === "deal" ? colOf(x.r.stage) : colOf(x.x.value.stage)) === k)}
                total={colTotal(k, deals.filter((r) => passes(filter, r, today, routes.get(r.company))))}
                filtered={filter !== "all"}
                folded={k === "closed" && !showLost}
                onFold={() => setShowLost(!showLost)}
                onDrop={(id) => {
                  const r = deals.find((x) => x.id === id);
                  if (r) void move(r, dropStage(k));
                }}
                draw={(x) =>
                  x.kind === "deal" ? (
                    <DealCard
                      key={x.r.id}
                      r={x.r}
                      i={byCo.get(x.r.company)}
                      today={today}
                      route={routes.get(x.r.company) ?? null}
                      on={cur?.id === x.r.id}
                      ember={hotIds.has(x.r.id)}
                      moving={moving === x.r.id}
                      busy={busy}
                      drag={!c.phone}
                      onOpen={() => setPanel({ kind: "deal", id: x.r.id })}
                      onToggleMove={() => setMoving(moving === x.r.id ? null : x.r.id)}
                      onMove={(s) => void move(x.r, s)}
                      onUnlock={() => void openLocked(x.r)}
                      freeOpen={!!c.me.proOpens && c.me.proOpens.left > 0}
                    />
                  ) : (
                    <ExampleDeal key={`ex${x.i}`} x={x.x} on={panel?.kind === "example" && panel.i === x.i} onOpen={() => setPanel({ kind: "example", i: x.i })} />
                  )
                }
                extra={
                  k === "reach" && first && filter === "all" ? (
                    <button type="button" className="pl2-addcol" onClick={() => setPanel({ kind: "pick" })}>
                      Pick companies from your lists
                    </button>
                  ) : null
                }
              />
            ))}
          </div>
        ))}
      </div>
    );

  const drawer = !drawerOpen ? null : panel.kind === "deal" && cur ? (
    <DealDrawer
      r={cur}
      i={byCo.get(cur.company)}
      today={today}
      route={routes.get(cur.company) ?? null}
      sees={view.sees}
      due={view.due.find((f) => f.id === cur.id) ?? null}
      onClose={() => setPanel(null)}
      onMove={(s) => void move(cur, s)}
      onWin={() => (cur.stage === "won" ? setWinning(cur.id) : void move(cur, "won"))}
      onUnlock={() => void openLocked(cur)}
    />
  ) : panel.kind === "example" ? (
    <ExampleDrawer x={EXAMPLE_CARDS[panel.i]} onClose={() => setPanel(null)} onRemove={removeExamples} onAdd={() => setPanel({ kind: "add" })} />
  ) : panel.kind === "add" ? (
    <AddDeal
      stageAt={new Map(deals.filter((r) => colOf(r.stage) !== "closed").map((r) => [r.company, STAGE_WORDS[r.stage]]))}
      onClose={() => setPanel(null)}
      onAdded={(companyId) => {
        added(companyId);
        pendingOpen.current = companyId;
        setPanel(null);
      }}
    />
  ) : panel.kind === "pick" ? (
    <AddFromList first={first} inPipeline={new Set(deals.filter((r) => colOf(r.stage) !== "closed").map((r) => r.company))} onClose={() => setPanel(null)} onAdded={added} />
  ) : null;

  return (
    <div className={`pl2${drawerOpen ? " pl2-has-drawer" : ""}`}>
      {/* The page's one heading: the header shows the title as its breadcrumb. */}
      <h1 className="sr-only">{tab === "intros" ? "Pipeline: intros" : "Pipeline"}</h1>
      {strip}
      {toolbar}
      {filters}
      <div className="pl2-body">
        <section className="pl2-main" aria-label="Your deals">
          {body}
        </section>
        {drawer && (c.phone ? <div className="pl2-sheet">{drawer}</div> : drawer)}
      </div>
      <div className="pl2-foot">
        <div className="pl2-btabs" role="tablist" aria-label="Deals or intros">
          <button type="button" role="tab" aria-selected={tab === "deals"} className={tab === "deals" ? "on" : ""} onClick={() => setTab("deals")}>
            Deals · {real}
          </button>
          <button type="button" role="tab" aria-selected={tab === "intros"} className={tab === "intros" ? "on" : ""} onClick={() => (setTab("intros"), panel?.kind === "deal" && setPanel(null))}>
            Intros · {view.intros.length}
          </button>
        </div>
        <Sees v={view} go={() => c.openPage("settings")} />
        <button type="button" className="pl2-agent" onClick={() => c.openPage("agent")}>
          Use it from your agent
        </button>
      </div>
      {winning && deals.find((r) => r.id === winning) && <WonSheet rec={deals.find((r) => r.id === winning)!} onClose={() => setWinning(null)} />}
    </div>
  );
}

/** What Merlin sees for this member, in the foot's one line, and what connecting would add. */
function Sees({ v, go }: { v: PipelineView; go: () => void }) {
  const s = v.sees;
  const link = (t: string) => (
    <button type="button" className="mv-link" onClick={go}>
      {t}
    </button>
  );
  if (!s.google) return <span className="pl2-sees">Merlin moves a card when your note goes out or they reply on Merlin.</span>;
  if (s.gmail) return <span className="pl2-sees">Merlin moves a card when your note goes out, they reply, or you meet. It reads From, To and Date only, never what an email says.</span>;
  if (s.calendar)
    return s.gmailOffered ? (
      <span className="pl2-sees">Merlin moves a card when your note goes out, they reply on Merlin, or you meet. {link("Add Gmail")} for email replies: From, To and Date only.</span>
    ) : (
      <span className="pl2-sees">Merlin moves a card when your note goes out, they reply on Merlin, or you meet. Email replies show once you can add Gmail.</span>
    );
  return (
    <span className="pl2-sees">
      Merlin moves a card when your note goes out or they reply on Merlin. {link("Connect Google")} and a meeting moves it too. Merlin reads who and when, never what an email or a meeting says.
    </span>
  );
}

/* ---------- a column ---------- */

function Column({ k, cards, total, filtered, folded, onFold, onDrop, draw, extra }: { k: ColKey; cards: Card[]; total: ReturnType<typeof colTotal>; filtered: boolean; folded: boolean; onFold: () => void; onDrop: (id: string) => void; draw: (c: Card) => ReactNode; extra?: ReactNode }) {
  const [over, setOver] = useState(false);
  const accept = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("text/x-rn-deal")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!over) setOver(true);
  };
  return (
    <section
      className={`pl2-col${over ? " pl2-over" : ""}${k === "closed" ? " pl2-col-closed" : ""}`}
      aria-labelledby={`pl2-h-${k}`}
      onDragOver={accept}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData("text/x-rn-deal");
        if (id) (e.preventDefault(), onDrop(id));
      }}
    >
      <div className="pl2-col-head">
        <h2 id={`pl2-h-${k}`}>{COL_WORDS[k]}</h2>
        <span className="pl2-n num" aria-label={`${total.n} ${total.n === 1 ? "deal" : "deals"}`}>
          {total.n}
        </span>
        {k === "closed" && total.n > 0 && (
          <button type="button" className="pl2-fold" aria-expanded={!folded} onClick={onFold}>
            {folded ? "Show" : "Hide"}
          </button>
        )}
        {total.words && <span className="pl2-val num">{total.words}</span>}
      </div>
      {!folded && cards.map(draw)}
      {!folded && !cards.length && k !== "closed" && <p className="pl2-empty">{filtered ? "No deal here matches the filter." : COL_NONE[k]}</p>}
      {!folded && !cards.length && k === "closed" && <p className="pl2-empty">{COL_NONE.closed}</p>}
      {extra}
    </section>
  );
}

/* ---------- a card ---------- */

/** The proposal or contract's pill, or the closed kind, the peer, the reply question and the seat to add. */
function pills(r: PipelineRec): { t: string; cls: string }[] {
  const out: { t: string; cls: string }[] = [];
  const closed = closedWords(r.stage);
  if (closed) out.push({ t: closed, cls: "plain" });
  if (r.paper) out.push({ t: `${r.paper.kind === "contract" ? "Contract" : "Proposal"}: ${r.paper.state}`, cls: closed || r.paper.tone === "closed" ? "plain" : r.paper.tone === "you" ? "pine" : "mint" });
  if (r.lead) out.push({ t: `Referred by ${r.lead.by.split(" ")[0]}`, cls: "plain" });
  if (r.team) out.push({ t: `Teamed with ${r.team.with}`, cls: "plain" });
  if (r.ask) out.push({ t: "No reply seen", cls: "plain" });
  if (r.stage === "won" && !r.seat) out.push({ t: "Add it as your seat. Earns credits", cls: "volt" });
  return out;
}

function DealCard({
  r,
  i,
  today,
  route,
  on,
  ember,
  moving,
  busy,
  drag,
  onOpen,
  onToggleMove,
  onMove,
  onUnlock,
  freeOpen,
}: {
  r: PipelineRec;
  i: CoInfo | undefined;
  today: string;
  route: RouteHint | null;
  on: boolean;
  ember: boolean;
  moving: boolean;
  busy: boolean;
  drag: boolean;
  onOpen: () => void;
  onToggleMove: () => void;
  onMove: (s: MoveStage) => void;
  onUnlock: () => void;
  freeOpen: boolean;
}) {
  const n = nextOf(r, today);
  const lock = r.name === null;
  const label = r.name ?? "the locked company";
  const way = wayOf(r, route);
  return (
    <article
      className={`pl2-card${on ? " on" : ""}`}
      draggable={drag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-rn-deal", r.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      data-deal={r.id}
    >
      <button type="button" className="pl2-card-open" onClick={onOpen} aria-label={`Open the deal with ${label}`}>
        <span className="pl2-co">
          <CompanyLogo name={r.name ?? ""} domain={r.name ? i?.c.iconDomain ?? i?.domain ?? null : null} hidden={lock} seed={r.company} />
          <span className="pl2-co-t">
            {lock ? <LockedName seed={r.company} className="pl2-co-n" /> : <strong className="pl2-co-n">{r.name}</strong>}
            <span className="pl2-co-s">{lock ? i?.teaser || "Locked company" : r.pitch ?? "Seat not set yet"}</span>
          </span>
        </span>
        <span className="pl2-money">{shownMonthly(r) ? <><strong className="num">{money(r.monthly)}</strong> a month</> : <span className="pl2-muted">{r.stage === "won" ? "No terms yet" : "No value yet"}</span>}</span>
        <span className="pl2-way">{way ?? toWords(r) ?? "No way in chosen yet"}</span>
        <span className="pl2-next">
          <span aria-hidden className={`pl2-dot${n.hot ? (ember ? " hot" : " due") : ""}`} />
          <span className="pl2-next-t">
            <strong>{n.title}</strong>
            {n.due && <span className={n.hot ? "pl2-due-hot" : "pl2-due"}>{n.due}</span>}
          </span>
        </span>
      </button>
      <div className="pl2-card-foot">
        {pills(r).map((p) => (
          <span key={p.t} className={`pl2-pill ${p.cls}`}>
            {p.t}
          </span>
        ))}
        {lock && (
          <button type="button" className="pl2-open" onClick={onUnlock}>
            Open · {freeOpen ? "free" : `${COMPANY_PRICE} credits`}
          </button>
        )}
        <button type="button" className="pl2-move" aria-expanded={moving} aria-label={`Move ${label} to another stage`} onClick={onToggleMove}>
          Move <IconChevron size={12} />
        </button>
      </div>
      {moving && (
        <div className="pl2-moves" role="group" aria-label={`Move ${label} to`}>
          {MOVE_STAGES.filter((s) => s !== r.stage).map((s) => (
            <button key={s} type="button" disabled={busy} data-move={s} onClick={() => onMove(s)}>
              {STAGE_WORDS[s]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function ExampleDeal({ x, on, onOpen }: { x: Example<ExampleCard>; on: boolean; onOpen: () => void }) {
  const v = x.value;
  return (
    <article className={`pl2-card pl2-ex${on ? " on" : ""}`} data-example>
      <button type="button" className="pl2-card-open" onClick={onOpen} aria-label={`Open the example deal with ${v.company}`}>
        <span className="pl2-exlabel">{x.label}</span>
        <span className="pl2-co">
          <CompanyLogo name={v.company} domain={null} seed={v.company} />
          <span className="pl2-co-t">
            <strong className="pl2-co-n">{v.company}</strong>
            <span className="pl2-co-s">{v.pitch}</span>
          </span>
        </span>
        <span className="pl2-money">
          <strong className="num">{money(v.monthly)}</strong> a month
        </span>
        <span className="pl2-way">{v.way}</span>
        <span className="pl2-next">
          <span aria-hidden className="pl2-dot" />
          <span className="pl2-next-t">
            <strong>{v.next}</strong>
            <span className="pl2-due">{v.due}</span>
          </span>
        </span>
      </button>
      {v.paper && (
        <div className="pl2-card-foot">
          <span className="pl2-pill mint">Proposal: {v.paper}</span>
        </div>
      )}
    </article>
  );
}

/* ---------- the table ---------- */

/** The deals table's columns as its header sort reads them: label and kind. */
const PIPE_SORT: Record<string, [string, SortKind]> = {
  company: ["Company", "text"],
  plStage: ["Stage", "number"],
  plValue: ["Value a month", "money"],
  plWay: ["Your way in", "text"],
  plNext: ["Next move", "date"],
  plPaper: ["Proposal or contract", "text"],
  plHow: ["How Merlin knows", "text"],
};
const pipeSortWords = (s: SortState | null) => (s && PIPE_SORT[s.key] ? `${PIPE_SORT[s.key][0]}, ${dirWords(PIPE_SORT[s.key][1], s.dir).toLowerCase()}` : null);

function DealTable({
  sortStore,
  deals,
  infos,
  waiting,
  today,
  routes,
  first,
  cur,
  onOpen,
  busy,
}: {
  sortStore: SortStore;
  deals: PipelineRec[];
  infos: CoInfo[];
  waiting: boolean;
  today: string;
  routes: Map<string, RouteHint>;
  first: boolean;
  cur: string | null;
  onOpen: (r: PipelineRec) => void;
  busy: boolean;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const coRows = useMemo(() => new Map(rowsFor("companies", infos).map((r) => [r.i.c.id, r])), [infos]);
  // One row per deal (a company can have a closed deal and an open one): the company's row, keyed by the deal.
  const rows: Row[] = useMemo(() => deals.flatMap((d) => (coRows.get(d.company) ? [{ ...coRows.get(d.company)!, key: d.id }] : [])), [deals, coRows]);
  const byKey = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const dl = (r: Row) => byKey.get(r.key);
  const col = (id: string, label: string, width: string, words: (ds: PipelineRec[]) => string, filled: (d: PipelineRec) => boolean): ColumnDef => ({
    id,
    type: "companies",
    label,
    cost: "free",
    word: "set",
    width,
    fill: (r) => (dl(r) && filled(dl(r)!) ? "value" : "empty"),
    words: (rs) => words(rs.map(dl).filter((x): x is PipelineRec => !!x)),
  });
  const pct = (n: number, of: number) => (of ? `${Math.round((n * 100) / of)}%` : "0%");
  const cols: ColumnDef[] = [
    { ...COMPANY_COLUMNS[0], words: (rs) => `${rs.length} ${rs.length === 1 ? "deal" : "deals"}` },
    col("plStage", "Stage", "minmax(112px, 0.6fr)", (ds) => `${ds.filter((d) => LINE.includes(d.stage) && d.stage !== "won").length} open`, () => true),
    col("plValue", "Value a month", "minmax(112px, 0.6fr)", (ds) => openValueLine(ds.filter((d) => d.stage !== "won" && colOf(d.stage) !== "closed")), (d) => shownMonthly(d) > 0),
    col("plWay", "Your way in", "minmax(180px, 1.2fr)", (ds) => `${pct(ds.filter((d) => !!wayOf(d, routes.get(d.company))).length, ds.length)} have one`, (d) => !!wayOf(d, routes.get(d.company))),
    col("plNext", "Next move", "minmax(190px, 1.2fr)", (ds) => `${ds.filter((d) => passes("due", d, today)).length} due`, () => true),
    col("plPaper", "Proposal or contract", "minmax(170px, 1.1fr)", (ds) => `${ds.filter((d) => !!d.paper).length} of ${ds.length}`, (d) => !!d.paper),
    col("plHow", "How Merlin knows", "minmax(160px, 1fr)", (ds) => `${pct(ds.filter((d) => d.how && !d.how.startsWith("You")).length, ds.length)} seen by Merlin`, (d) => !!d.how),
  ];
  const cell = (id: string, r: Row): ReactNode | undefined => {
    const d = dl(r);
    if (!d) return undefined;
    const two = (a: ReactNode, b?: ReactNode, cls = "") => (
      <span className="pl2-td2">
        <span className={`pl2-ell ${cls}`}>{a}</span>
        {b ? <span className="pl2-ell pl2-sub">{b}</span> : null}
      </span>
    );
    switch (id) {
      case "plStage":
        return <span className={`pl2-pill ${d.stage === "won" ? "pine" : colOf(d.stage) === "closed" ? "plain" : d.stage === "sent" || d.stage === "reach" ? "plain" : "mint"}`}>{STAGE_WORDS[d.stage]}</span>;
      case "plValue":
        return shownMonthly(d) ? two(<strong className="num">{money(d.monthly)}</strong>, "a month") : two(<span className="pl2-muted">{d.stage === "won" ? "No terms yet" : "Not set"}</span>);
      case "plWay":
        return two(wayOf(d, routes.get(d.company)) ?? <span className="pl2-muted">None chosen yet</span>, toWords(d));
      case "plNext": {
        const n = nextOf(d, today);
        return two(n.title, n.due, n.hot ? "pl2-strong" : "");
      }
      case "plPaper":
        return d.paper ? two(d.paper.state, d.paper.kind === "contract" ? "Contract" : "Proposal") : two(<span className="pl2-muted">None yet</span>);
      case "plHow":
        return two(d.how ?? "", d.follow ? `${d.follow} ${d.follow === 1 ? "follow-up" : "follow-ups"} sent` : null);
    }
    return undefined;
  };
  // Every column sorts from its header, by what it shows; the toolbar's Sort button clears it.
  const pipeSorts: ExtraSorts = {
    plStage: { kind: "number", get: (r) => (dl(r) ? LINE.indexOf(dl(r)!.stage) : null) },
    plValue: { kind: "money", get: (r) => (dl(r) && shownMonthly(dl(r)!) > 0 ? dl(r)!.monthly : null) },
    plWay: { get: (r) => (dl(r) ? wayOf(dl(r)!, routes.get(dl(r)!.company)) ?? null : null) },
    plNext: { kind: "date", get: (r) => dl(r)?.due ?? null },
    plPaper: { get: (r) => dl(r)?.paper?.state ?? null },
    plHow: { get: (r) => dl(r)?.how ?? null },
  };
  const sorter = sorterOf(rows, workbenchSortCols(cols, pipeSorts), sortStore);
  const sel = deals.filter((d) => picked.has(d.id));
  if (first)
    return (
      <div className="pl2-tablenote" role="note">
        No deals yet. The 2 cards marked Example on the board show how one works. Add a deal, or pick companies from your lists.
      </div>
    );
  if (waiting && !rows.length) return <p className="pl2-wait">Loading your companies</p>;
  return (
    <div className="pl2-table">
      {sel.length > 0 && (
        <div className="wb-selbar" role="toolbar" aria-label="Actions for selected deals">
          <strong className="wb-sel-n">{sel.length} selected</strong>
          <span>Move to</span>
          {MOVE_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className="wb-sel-btn"
              disabled={busy || bulkBusy}
              onClick={async () => {
                // One move each, as Move to on a card ("You marked it"); no Won sheet for a batch: each won card asks on its own.
                setBulkBusy(true);
                let n = 0;
                let err: string | null = null;
                for (const d of sel) {
                  if (d.stage === s) continue;
                  const r = await pipelineAct({ type: "pipeline.move", id: d.id, stage: s });
                  if (r.ok) n++;
                  else err = r.message;
                }
                setBulkBusy(false);
                setPicked(new Set());
                toast(err ?? `Moved ${n === 1 ? "1 deal" : `${n} deals`} to ${STAGE_WORDS[s]}.`, !!err);
              }}
            >
              {STAGE_WORDS[s]}
            </button>
          ))}
          <button type="button" className="wb-sel-clear" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}
      <Workbench
        type="companies"
        rows={sorter.rows}
        cols={cols}
        mine={null}
        selected={picked}
        onPick={(key, on) =>
          setPicked((s) => {
            const x = new Set(s);
            if (on) x.add(key);
            else x.delete(key);
            return x;
          })
        }
        onPickAll={(on) => setPicked(on ? new Set(rows.map((r) => r.key)) : new Set())}
        onOpen={(r) => {
          const d = dl(r);
          if (d) onOpen(d);
        }}
        sort="name"
        sorter={sorter}
        onAddColumn={() => toast("Pipeline keeps these columns. Add more on Companies.")}
        cell={cell}
        rowClass={(r) => (cur === r.key ? "pl2-tr-cur" : "")}
      />
      {rows.length < deals.length && <p className="pl2-wait">{deals.length - rows.length} more show once all your companies load.</p>}
    </div>
  );
}

/** The open deals' value a month for the column's head: unpriced deals are left out and said, never read as $0 (owner review, simulated operators 3). */
function openValueLine(open: readonly { value: number | null; monthly: number; won?: unknown }[]): string {
  const unpriced = open.filter((d) => !d.won && d.value === null).length;
  if (open.length && unpriced === open.length) return `Value unknown · ${unpriced} unpriced`;
  const sum = open.filter((d) => d.won || d.value !== null).reduce((n, d) => n + d.monthly, 0);
  return `${money(sum)} open${unpriced ? ` · ${unpriced} unpriced` : ""}`;
}
