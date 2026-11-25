"use client";

/**
 * Pipeline in the new design (RN_UI3; find-design/v5/work.html, Pipeline, round 8). Execution should
 * feel precise: the money first, then today's moves, then the board.
 *
 *   The money          computed here from the member's own deals, as they typed each value a month
 *                      (or a Won deal's terms): Open pipeline is every open stage, To reach out to
 *                      Proposal; Proposals out is the Proposal column, a part of the open pipeline
 *                      and said so; Won is the Won deals' monthly terms. Deals with no value typed
 *                      are counted and said, never guessed. No probabilities anywhere.
 *   Today's moves      the deals whose next move is due today or late (rust: your move).
 *   Board              the five open stages fit at 1280 and 1440; Won and Lost fold into one strip
 *                      one click away. Each card leads with its next move, then the company, the
 *                      seat pitched and its proposal or contract, then the value a month. Drag a
 *                      card to a column, or its "..." to move it; Undo the last move.
 *   Table, Intros      the deals as rows with a bulk Move to; intros asked and asked of you.
 *   Deal               today's deal drawer (stage stepper, how Merlin knows and Not right?, the next
 *                      move and its action, snooze, not now, value and seat, the proposal or
 *                      contract, the way in, notes and log, won, lost, refer, team up, remove).
 *   Add                today's Add a deal and Add from a list; Won asks today's Won sheet.
 *
 * A locked company's card says what it is and opens only after the price is said (ui.unlock).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { MOVE_STAGES, STAGE_WORDS, isMoveStage, type IntroRec, type MoveStage, type PipelineRec } from "@/lib/pipeline";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { useToast } from "../../../../ui/shared";
import { useUi } from "../../../ui";
import { useApp } from "../../../shell/pages";
import { loadPipeline, pipelineAct, usePipeline } from "../../../pipelineStore";
import { usePlans } from "../../../network/useWays";
import { COL_NONE, FILTERS, SORTS, colOf, dropStage, nextOf, passes, sortDeals, toWords, wayOf, closedWords, type ColKey, type FilterKey, type RouteHint, type SortKey } from "../../../pipeline/model";
import { DealDrawer } from "../../../pipeline/DealDrawer";
import { AddDeal, AddFromList } from "../../../pipeline/AddDeal";
import { Band, Chips, CoMark, Failed, MatchCount, More, NoMatch, Skel, St, Tabs, WorkMain, money, type MenuItem, type Tone } from "../parts";
import { kMoney, moneyHead, moneyOf } from "./money";
import { WIc } from "../icons";
import "../../../workbench/workbench.css";
import "../../../pipeline/board.css";
import "./pipeline.css";

const WonSheet = dynamic(() => import("../../../WonSheet").then((m) => m.WonSheet), { ssr: false });

type View = "board" | "table" | "intros";
type Panel = { kind: "deal"; id: string } | { kind: "add" } | { kind: "pick" } | null;
const DEAL_NOUN = ["deal", "deals"] as const;
const OPEN: readonly ColKey[] = ["reach", "sent", "replied", "meeting", "proposal"];
const STAGE_TONE: Record<string, Tone> = { reach: "", sent: "co", replied: "co", meeting: "am", proposal: "gold", won: "forest", lost: "", notnow: "", quiet: "" };
const VIEW_KEY = "rn-ui3-pl-view";
const keep = {
  get: (): View | null => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      return v === "board" || v === "table" || v === "intros" ? v : null;
    } catch {
      return null;
    }
  },
  set: (v: View) => {
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* nothing kept in a private window */
    }
  },
};

export function Ui3Pipeline() {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const { view, failed } = usePipeline();
  const plans = usePlans();
  const routes = useMemo(() => new Map<string, RouteHint>((plans ?? []).filter((p) => !p.done).map((p) => [p.company, { via: p.via }])), [plans]);
  const [mode, setMode] = useState<View>(() => keep.get() ?? "board");
  useEffect(() => keep.set(mode), [mode]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [panel, setPanel] = useState<Panel>(null);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [phStage, setPhStage] = useState<ColKey>("reach");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ id: string; from: MoveStage; to: MoveStage; name: string } | null>(null);
  const [winning, setWinning] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<ColKey | null>(null);
  const pendingOpen = useRef<string | null>(null);

  const today = view?.today ?? new Date().toISOString().slice(0, 10);
  const deals = useMemo(() => view?.entries ?? [], [view]);
  const shown = useMemo(() => sortDeals(deals.filter((r) => passes(filter, r, today, routes.get(r.company))), sort), [deals, filter, sort, today, routes]);
  const cur = panel?.kind === "deal" ? deals.find((r) => r.id === panel.id) ?? null : null;
  useEffect(() => {
    if (panel?.kind === "deal" && view && !cur) setPanel(null);
  }, [panel, view, cur]);
  useEffect(() => {
    if (!pendingOpen.current || !view || panel?.kind === "add" || panel?.kind === "pick") return;
    const r = view.entries.find((x) => x.company === pendingOpen.current);
    if (r) (pendingOpen.current = null), setPanel({ kind: "deal", id: r.id });
  }, [view, panel]);
  // The phone's stage chips start on the first stage that has a deal.
  useEffect(() => {
    if (!view) return;
    const firstCol = OPEN.find((k) => view.entries.some((r) => colOf(r.stage) === k));
    if (firstCol) setPhStage(firstCol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!view]);

  const nameOf = (r: PipelineRec) => r.name ?? "the locked company";
  const move = async (r: PipelineRec, to: MoveStage) => {
    if (busy || r.stage === to) return;
    setBusy(true);
    const from = r.stage;
    const res = await pipelineAct({ type: "pipeline.move", id: r.id, stage: to });
    setBusy(false);
    if (!res.ok) return toast(res.message, true);
    setLast(isMoveStage(from) ? { id: r.id, from, to, name: nameOf(r) } : null);
    toast(`${r.name ?? "It"} moved to ${STAGE_WORDS[to]}.`);
    if (to === "won") setWinning(r.id);
  };
  const undo = async () => {
    if (!last || busy) return;
    setBusy(true);
    const res = await pipelineAct({ type: "pipeline.move", id: last.id, stage: last.from });
    setBusy(false);
    setLast(null);
    toast(res.ok ? `Back to ${STAGE_WORDS[last.from]}.` : res.message, !res.ok);
  };
  const openLocked = async (r: PipelineRec) => {
    const ok = await ui.unlock({ entity: "company", id: r.company, field: "identity" });
    if (ok) void loadPipeline(true);
  };
  const bulk = async (to: MoveStage) => {
    const list = deals.filter((r) => sel.has(r.id) && r.stage !== to);
    setBusy(true);
    let done = 0;
    for (const r of list) {
      const res = await pipelineAct({ type: "pipeline.move", id: r.id, stage: to });
      if (!res.ok) {
        toast(res.message, true);
        break;
      }
      done++;
    }
    setBusy(false);
    setSel(new Set());
    if (done) toast(`Moved ${done} to ${STAGE_WORDS[to]}.`);
  };
  const moveItems = (r: PipelineRec): MenuItem[] => [
    { t: "Open the deal", icon: "eye", go: () => setPanel({ kind: "deal", id: r.id }) },
    "-",
    ...MOVE_STAGES.filter((s) => s !== r.stage && s !== "lost" && s !== "notnow").map((s) => ({ t: `Move to ${STAGE_WORDS[s]}`, icon: (s === "won" ? "star" : "arrow") as "star" | "arrow", go: () => void move(r, s) })),
    "-",
    { t: "Not now", icon: "clock", go: () => void move(r, "notnow") },
    { t: "Lost", icon: "x", danger: true, go: () => void move(r, "lost") },
  ];

  if (!view)
    return (
      <WorkMain group="Work" title="Pipeline" cls="w3-pl">
        <Band art="pipeline" density="minimal" title="Your pipeline." cls="pl-band" />
        {failed ? <Failed what="Your pipeline" error="Reload the page to try again." retry={() => void loadPipeline(true)} /> : <Skel rows={3} />}
      </WorkMain>
    );

  const m = moneyOf(deals);
  const openHead = moneyHead(m.open, m.openN, m.openNoValue);
  const propsHead = moneyHead(m.props, m.propsN, m.propsNoValue);
  const hot = deals.filter((r) => (OPEN as readonly string[]).includes(r.stage) && nextOf(r, today).hot);
  const nFilter = (k: FilterKey) => deals.filter((r) => passes(k, r, today, routes.get(r.company))).length;
  const openCount = deals.filter((r) => (OPEN as readonly string[]).includes(r.stage)).length;
  const sub = !deals.length ? "Every company you are trying to win, from the first note to signed." : hot.length ? `${hot.length} next ${hot.length === 1 ? "move is" : "moves are"} due today.` : "Nothing is due today. Every next move is on its way.";
  const first = deals.length === 0;
  // A filter that matches none of the member's deals (owner review L1): said by name, with Show all, in place of an empty board or table.
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All deals";
  const noMatch = mode !== "intros" && !first && filter !== "all" && !shown.length;

  const card = (r: PipelineRec) => {
    const n = nextOf(r, today);
    const lock = r.name === null;
    const i = c.byId.get(r.company);
    const closed = closedWords(r.stage);
    const tone = closed ? "quiet" : n.hot ? "hot" : r.stage === "reach" ? "quiet" : "";
    const paper = r.paper ? `${r.paper.kind === "contract" ? "Contract" : "Proposal"} ${r.paper.state.charAt(0).toLowerCase()}${r.paper.state.slice(1)}` : null;
    const paperCls = r.paper ? (r.paper.tone === "you" ? "hot" : r.paper.tone === "done" ? "forest" : r.paper.tone === "draft" ? "am" : "co") : "";
    const way = wayOf(r, routes.get(r.company)) ?? toWords(r);
    return (
      <article
        key={r.id}
        className={`pl-card${cur?.id === r.id ? " sel" : ""}`}
        draggable={!c.phone}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/x-rn-deal", r.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        data-deal={r.id}
        tabIndex={0}
        aria-label={`Open the deal with ${nameOf(r)}`}
        title={r.name ?? undefined}
        onClick={() => setPanel({ kind: "deal", id: r.id })}
        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setPanel({ kind: "deal", id: r.id })}
      >
        <div className={`pl-next ${tone}`}>
          <span className="d" />
          <span>
            <b>{closed ?? n.title}</b>
            {n.due && !closed && <small>{n.due}</small>}
          </span>
        </div>
        <div className="pl-cohead">
          <CoMark i={i ?? null} name={r.name ?? "Locked company"} s={20} />
          <b className="pl-coname" title={r.name ?? undefined}>
            {r.name ?? "Locked company"}
          </b>
        </div>
        <div className="pl-role">
          {lock ? i?.teaser || "Opens with the company" : r.pitch ?? "Seat not set yet"}
          {paper && (
            <>
              {" · "}
              <span className={`pl-paper ${paperCls}`}>{paper}</span>
            </>
          )}
        </div>
        {way && <div className="pl3-way">{way}</div>}
        <div className="pl-cfoot" onClick={(e) => e.stopPropagation()}>
          {lock ? (
            <button type="button" className="m-btn m-btn-sm m-btn-secondary pl3-open" onClick={() => void openLocked(r)}>
              Open · {c.me.proOpens && c.me.proOpens.left > 0 ? "free" : `${COMPANY_PRICE} credits`}
            </button>
          ) : (
            <span className="pl-val">{r.monthly ? <>{money(r.monthly)}<small>/mo</small></> : <small>{r.stage === "won" ? "No terms yet" : "No value yet"}</small>}</span>
          )}
          <More label={`Move ${nameOf(r)} to another stage`} items={() => moveItems(r)} />
        </div>
      </article>
    );
  };
  const onDrop = (k: ColKey) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/x-rn-deal");
    const r = deals.find((x) => x.id === id);
    if (r) void move(r, dropStage(k) as MoveStage);
  };
  const colProps = (k: ColKey) => ({
    onDragOver: (e: DragEvent) => (e.preventDefault(), over !== k && setOver(k)),
    onDragLeave: () => setOver((o) => (o === k ? null : o)),
    onDrop: onDrop(k),
  });
  // A Won deal counts its terms, else the value typed (PipelineRec.monthly, the server's dealMonthly), as the summary does.
  const colTot = (k: ColKey) => shown.filter((r) => colOf(r.stage) === k).reduce((s, r) => s + r.monthly, 0);

  const wonCards = shown.filter((r) => r.stage === "won");
  const lostCards = shown.filter((r) => colOf(r.stage) === "closed");
  const board = (
    <>
      <div className="pl-ph-stages" role="group" aria-label="Stage">
        {[...OPEN, "won" as ColKey].map((k) => (
          <button key={k} type="button" aria-pressed={phStage === k} onClick={() => setPhStage(k)}>
            {STAGE_WORDS[k as keyof typeof STAGE_WORDS]}
            <span className="n">{shown.filter((r) => (k === "won" ? r.stage === "won" || colOf(r.stage) === "closed" : colOf(r.stage) === k)).length}</span>
          </button>
        ))}
      </div>
      <div className={`pl-board${wonOpen ? " won-open" : ""}`}>
        {OPEN.map((k) => {
          const cards = shown.filter((r) => colOf(r.stage) === k);
          const tot = colTot(k);
          return (
            <section key={k} className={`pl-col${phStage === k ? " ph-on" : ""}${over === k ? " drop" : ""}`} data-col={k} aria-label={STAGE_WORDS[k as keyof typeof STAGE_WORDS]} {...colProps(k)}>
              <header className="pl-ch">
                <b>{STAGE_WORDS[k as keyof typeof STAGE_WORDS]}</b>
                <span className="n">{cards.length}</span>
                <span className="v">{tot ? `${money(tot)}/mo` : ""}</span>
              </header>
              {cards.map(card)}
              {!cards.length && <p className="pl-empty">{filter === "all" ? COL_NONE[k] : "None with this filter."}</p>}
              {k === "reach" && (
                <button type="button" className="m-btn m-btn-ghost m-btn-sm pl3-pick" onClick={() => setPanel({ kind: "pick" })}>
                  <WIc n="plus" /> Add from a list
                </button>
              )}
            </section>
          );
        })}
        {!wonOpen && !c.phone ? (
          <section className={`pl-col pl-fold${over === "won" ? " drop" : ""}`} data-col="won" aria-label="Won and lost, folded" {...colProps("won")}>
            <button type="button" className="pl-foldbtn" aria-expanded={false} title="Show Won and Lost" onClick={() => setWonOpen(true)}>
              <WIc n="star" className="w-ic" />
              <b>Won</b>
              <span className="n">{wonCards.length}</span>
              <span className="pl-foldsep" />
              <b>Lost</b>
              <span className="n">{lostCards.length}</span>
              <span className="pl-foldgo">
                <WIc n="chev" />
              </span>
            </button>
          </section>
        ) : (
          <section className={`pl-col${phStage === "won" ? " ph-on" : ""}${over === "won" ? " drop" : ""}`} data-col="won" aria-label="Won" {...colProps("won")}>
            <header className="pl-ch">
              <b>Won</b>
              <span className="n">{wonCards.length}</span>
              <span className="v">{colTot("won") ? `${money(colTot("won"))}/mo` : ""}</span>
              {!c.phone && (
                <button type="button" className="m-iconbtn sm plain pl3-fold" aria-expanded={true} aria-label="Fold Won and Lost" onClick={() => setWonOpen(false)}>
                  <WIc n="x" />
                </button>
              )}
            </header>
            {wonCards.map(card)}
            {!wonCards.length && <p className="pl-empty">{COL_NONE.won}</p>}
            <div className="pl-lost" data-col="lost" {...colProps("closed")}>
              <button type="button" aria-expanded={lostOpen} onClick={() => setLostOpen(!lostOpen)}>
                <WIc n="chev" /> Lost, not now and went quiet <span className="w-muted">{lostCards.length}</span>
              </button>
              {lostOpen && lostCards.map(card)}
            </div>
          </section>
        )}
      </div>
    </>
  );

  const table = (
    <>
      {sel.size > 0 && (
        <div className="pl-selbar" role="toolbar" aria-label="Selected deals">
          {sel.size} selected
          <span className="w-sp" />
          <label className="w-row">
            Move to{" "}
            <select value="" disabled={busy} onChange={(e) => e.target.value && void bulk(e.target.value as MoveStage)}>
              <option value="">Pick a stage</option>
              {MOVE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_WORDS[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="m-table pl-table" role="table" aria-label="Your deals">
        <div className="m-thead" role="row">
          <span role="columnheader">
            <input type="checkbox" className="pl-cb" aria-label="Select all" checked={!!shown.length && shown.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
          </span>
          <span role="columnheader">Company</span>
          <span role="columnheader">Stage</span>
          <span role="columnheader">Next move</span>
          <span role="columnheader">Way in</span>
          <span role="columnheader">
            <span className="w-sr">Actions</span>
          </span>
        </div>
        {shown.map((r) => {
          const n = nextOf(r, today);
          return (
            <div key={r.id} className="m-tr" role="row" onClick={() => setPanel({ kind: "deal", id: r.id })}>
              <span role="cell" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="pl-cb"
                  aria-label={`Select ${nameOf(r)}`}
                  checked={sel.has(r.id)}
                  onChange={() =>
                    setSel((s) => {
                      const x = new Set(s);
                      if (x.has(r.id)) x.delete(r.id);
                      else x.add(r.id);
                      return x;
                    })
                  }
                />
              </span>
              <div className="m-co" role="cell">
                <CoMark i={c.byId.get(r.company) ?? null} name={r.name ?? "Locked company"} s={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="m-name">
                    <span title={r.name ?? undefined}>{r.name ?? "Locked company"}</span>
                  </div>
                  <small>{[r.pitch, r.monthly ? `${money(r.monthly)}/mo` : null].filter(Boolean).join(" · ") || "No value yet"}</small>
                </div>
              </div>
              <span className="m-ph-hide" role="cell">
                <St tone={STAGE_TONE[r.stage]}>{STAGE_WORDS[r.stage]}</St>
              </span>
              <div className="m-opp" role="cell">
                <div>
                  <b className={n.hot ? "w-hot" : undefined}>{closedWords(r.stage) ?? n.title}</b>
                  <small>{n.due}</small>
                </div>
              </div>
              <span className="m-small m-ph-hide" role="cell">
                {wayOf(r, routes.get(r.company)) ?? toWords(r) ?? "None chosen yet"}
              </span>
              <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={`m-btn m-btn-sm ${n.hot ? "m-btn-primary" : "m-btn-secondary"}`} onClick={() => setPanel({ kind: "deal", id: r.id })}>
                  Open
                </button>
                <More label={`More for ${nameOf(r)}`} items={() => moveItems(r)} />
              </div>
            </div>
          );
        })}
        {!shown.length && first && <p className="m-small" style={{ padding: 18 }}>No deals here yet.</p>}
      </div>
    </>
  );

  const intros = (
    <div className="m-table">
      {view.intros.length ? (
        <ul className="pl-intros">
          {view.intros.map((x) => (
            <IntroRow key={x.id} x={x} />
          ))}
        </ul>
      ) : (
        <p className="w-help" style={{ padding: 18 }}>
          No intros yet. Ask for one from a company page or from{" "}
          <button type="button" className="w-link" onClick={() => c.openPage("warm")}>
            Warm Paths
          </button>
          , where Merlin shows who can introduce you. Asking costs nothing.
        </p>
      )}
    </div>
  );

  const side =
    panel?.kind === "deal" && cur ? (
      <DealDrawer
        r={cur}
        i={c.byId.get(cur.company)}
        today={today}
        route={routes.get(cur.company) ?? null}
        sees={view.sees}
        due={view.due.find((f) => f.id === cur.id) ?? null}
        onClose={() => setPanel(null)}
        onMove={(s) => void move(cur, s)}
        onWin={() => (cur.stage === "won" ? setWinning(cur.id) : void move(cur, "won"))}
        onUnlock={() => void openLocked(cur)}
      />
    ) : panel?.kind === "add" ? (
      <AddDeal
        stageAt={new Map(deals.filter((r) => colOf(r.stage) !== "closed").map((r) => [r.company, STAGE_WORDS[r.stage]]))}
        onClose={() => setPanel(null)}
        onAdded={(companyId) => {
          pendingOpen.current = companyId;
          setPanel(null);
        }}
      />
    ) : panel?.kind === "pick" ? (
      <AddFromList first={first} inPipeline={new Set(deals.filter((r) => colOf(r.stage) !== "closed").map((r) => r.company))} onClose={() => setPanel(null)} onAdded={() => {}} />
    ) : null;

  return (
    <WorkMain group="Work" title="Pipeline" cls="w3-pl w3-plpage">
      <Band art="pipeline" density="minimal" title="Your pipeline." sub={sub} cls="pl-band" />
      <div className="pl-metrics" aria-label="Money in your pipeline">
        <div className="pl-metric">
          <span className="w-kicker">Open pipeline</span>
          <b data-unknown={openHead.unknown || undefined}>{openHead.big}</b>
          <small>
            {openHead.unknown ? openHead.left : `Potential monthly revenue · ${m.openN} active ${m.openN === 1 ? "opportunity" : "opportunities"}`}
          </small>
          {!openHead.unknown && openHead.left && <em>{openHead.left}</em>}
        </div>
        <div className="pl-metric sub">
          <span className="w-kicker">Proposals out</span>
          <b data-unknown={propsHead.unknown || undefined}>{propsHead.big}</b>
          <small>
            {propsHead.unknown ? propsHead.left : `Monthly revenue proposed · ${m.propsN} ${m.propsN === 1 ? "opportunity" : "opportunities"}`}
          </small>
          <em>Part of the open pipeline</em>
        </div>
        <div className="pl-metric won">
          <span className="w-kicker">Won</span>
          <b>{kMoney(m.won)}</b>
          <small>
            Monthly revenue won · {m.wonN} {m.wonN === 1 ? "engagement" : "engagements"}
          </small>
          {m.wonNoTerms > 0 && (
            <button type="button" className="w-link pl3-terms" onClick={() => setWinning(deals.find((r) => r.stage === "won" && !r.won)?.id ?? null)}>
              {m.wonNoTerms === 1 ? "Add the terms of your win" : `Add the terms of ${m.wonNoTerms} wins`}
            </button>
          )}
        </div>
      </div>
      {hot.length > 0 && (
        <div className="pl-today" role="group" aria-label="Your next moves">
          {hot.slice(0, 3).map((r) => {
            const n = nextOf(r, today);
            return (
              <button key={r.id} type="button" className="pl-tmove" title={`${n.title}: ${r.name ?? "Locked company"}`} aria-label={`${n.title}: ${r.name ?? "the locked company"}${n.due ? `, ${n.due}` : ""}`} onClick={() => setPanel({ kind: "deal", id: r.id })}>
                <CoMark i={c.byId.get(r.company) ?? null} name={r.name ?? "Locked company"} s={34} />
                <span style={{ minWidth: 0 }}>
                  <b>{n.title}</b>
                  <small>
                    {r.name ?? "Locked company"} · {n.due}
                  </small>
                </span>
                <WIc n="arrow" className="w-ic" />
              </button>
            );
          })}
        </div>
      )}
      <div className="w-toolbar">
        <Tabs
          label="View"
          on={mode}
          set={(v) => (setMode(v), setSel(new Set()))}
          items={[
            { k: "board", label: "Board", n: openCount },
            { k: "table", label: "Table", n: deals.length },
            { k: "intros", label: "Intros", n: view.intros.length },
          ]}
        />
        {mode !== "intros" && (
          <button type="button" className="m-btn m-btn-sm m-btn-ghost" onClick={() => setSort(SORTS[(SORTS.findIndex((s) => s.key === sort) + 1) % SORTS.length].key)}>
            <WIc n="sort" /> {SORTS.find((s) => s.key === sort)!.label}
          </button>
        )}
        {last && (
          <button type="button" className="m-btn m-btn-sm m-btn-ghost" disabled={busy} onClick={() => void undo()}>
            <WIc n="undo" /> Undo
          </button>
        )}
        <span className="w-sp" />
        <button type="button" className="m-btn m-btn-sm m-btn-secondary w-hide-ph" onClick={() => setPanel({ kind: "pick" })}>
          <WIc n="list" /> Add from a list
        </button>
        <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => setPanel({ kind: "add" })}>
          <WIc n="plus" /> Add a deal
        </button>
      </div>
      {mode !== "intros" && <Chips items={FILTERS.map((f) => ({ k: f.key, label: f.label, n: nFilter(f.key) }))} on={filter} set={setFilter} label="Filter deals" cls="pl3-chips" />}
      {mode !== "intros" && !first && <MatchCount shown={shown.length} total={deals.length} noun={DEAL_NOUN} filter={filter === "all" ? null : filterLabel} />}
      {first && mode !== "intros" && (
        <div className="pr3-empty pl3-first">
          <b className="w-h4">No deals yet</b>
          <p className="w-help">Add a company you want to win, or pick from your lists. Merlin moves the card when it sees your note go out, a reply or a meeting, and the money above adds up from the values you type.</p>
        </div>
      )}
      <div id="pl-body">{noMatch ? <NoMatch noun={DEAL_NOUN} filter={filterLabel} total={deals.length} onShowAll={() => setFilter("all")} /> : mode === "board" ? board : mode === "table" ? table : intros}</div>
      <p className="w-help pl3-sees">
        {view.sees.gmail || view.sees.calendar ? `Merlin reads ${[view.sees.gmail && "who wrote back in Gmail", view.sees.calendar && "meetings on your calendar"].filter(Boolean).join(" and ")} (never the words) to move your cards.` : "Connect Google and Merlin moves your cards when someone writes back or a meeting is booked."}{" "}
        <button type="button" className="w-link" onClick={() => c.openPage("settings")}>
          Settings
        </button>
      </p>
      {side && (
        <>
          <div className="w-drawer-scrim" onClick={() => setPanel(null)} />
          <div className="w-drawer wide w3-host pl3-side" role="dialog" aria-modal="true" aria-label={panel?.kind === "deal" ? `Deal with ${cur ? nameOf(cur) : ""}` : panel?.kind === "add" ? "Add a deal" : "Add from a list"}>
            {side}
          </div>
        </>
      )}
      {winning && deals.find((r) => r.id === winning) && <WonSheet rec={deals.find((r) => r.id === winning)!} onClose={() => setWinning(null)} />}
    </WorkMain>
  );
}

function IntroRow({ x }: { x: IntroRec }) {
  const c = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mark = async (status: "made" | "declined") => {
    setBusy(true);
    const r = await pipelineAct({ type: "pipeline.introMark", id: x.id, status });
    setBusy(false);
    toast(r.message, !r.ok);
  };
  const where = x.company ? x.name ?? "a locked company" : "the companies they know";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <li>
      <div className="w-row" style={{ minWidth: 0 }}>
        <CoMark i={x.company ? c.byId.get(x.company) ?? null : null} name={x.name ?? "?"} s={36} />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>{x.side === "asked" ? `You asked ${x.who} for an intro at ${where}` : `${x.who} asked you for an intro at ${where}`}</b>
          <div className="m-small">
            {x.status === "made" ? `Made ${day(x.madeAt ?? x.askedAt)}` : x.status === "declined" ? "Declined" : `Asked ${day(x.askedAt)}`}
            {x.won ? " · Led to a win" : ""}
          </div>
        </div>
      </div>
      <div className="w-row">
        {x.status === "made" ? (
          <St tone="forest">Made</St>
        ) : x.status === "declined" ? (
          <St tone="">Declined</St>
        ) : (
          <>
            {x.side === "asked" && <St tone="co">Waiting</St>}
            <button type="button" className={`m-btn m-btn-sm ${x.side === "asked" ? "m-btn-secondary" : "m-btn-primary"}`} disabled={busy} onClick={() => void mark("made")}>
              {x.side === "asked" ? "Mark made" : "Made the intro"}
            </button>
            <button type="button" className="m-btn m-btn-sm m-btn-ghost" disabled={busy} onClick={() => void mark("declined")}>
              {x.side === "asked" ? "Declined" : "Decline"}
            </button>
          </>
        )}
        {x.company && (
          <button type="button" className="w-link" onClick={() => c.openCompany(x.company!)}>
            Open the company
          </button>
        )}
      </div>
    </li>
  );
}
