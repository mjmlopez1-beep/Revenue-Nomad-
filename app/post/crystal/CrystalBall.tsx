"use client";

/**
 * Crystal Ball in the new look (CrystalBall.dc.html), page "radar" (?p=radar, ?p=radar&range=7d, and
 * an email's or Slack's day link ?sig=<day> all land here): Merlin's forecast of who hires a
 * fractional like the member next, ranked, with High, Medium or Low (never a number, BUILD_PLAN part
 * 8), the two or three signals behind each (their real kinds, lib/radar), when a hire is likely, the
 * suggested move and the member's way in. A right panel explains the picked company signal by
 * signal, with a timeline, its fit, who leads the member's function there, and "Not for me" (Why
 * not, lib/radar/out.ts). Its Tune tab leans the ball toward the signals the member cares about
 * (lib/radar/tune.ts, Profile.radarTune), in plain words, and says how it reaches them.
 *
 * Everything the old page (Radar.tsx) did stays: the three ranges with their counts (hidden when all
 * three count the same), a day's link as a removable pill, [google network] "Where you know
 * someone" (moving to a wider range with nobody known in this one), Free's "today's free company
 * is used" line, an expired day's note, the start questions with no function yet, the empty states,
 * the cards on phones, opening a locked company by plan (CrystalOpen: free on Trial and Pro and not
 * counted toward the 15 a day, one a day on Free, 2 credits with billing off), "They have a full-time
 * leader" (a fact, 1 credit), Refer it to a peer, the delivery card with Slack as it happens on Pro,
 * and the signals radar_opened and radar_clicked.
 *
 * Its table is the Stage 1 workbench (workbench/Workbench.tsx): picking rows gives Open N (one quote,
 * one confirm, from Crystal Ball so its plan rules apply), Add to pipeline, Follow, Draft notes, Not
 * now and Clear. "+" adds any Companies column.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FUNCTIONS, RN_EMPLOYEES, RN_INDUSTRIES, COMPANY_PRICE_SAY } from "@/lib/tableFields";
import type { Icp, UnlockQuote } from "@/lib/tableTypes";
import { FEATURE_NAME, YOUR_FEATURE, rangeLabel, yourFeature, type RadarRange, type RadarRow, type RadarSigView, type RadarView } from "@/lib/radar/types";
import { OUT_WORDS, type OutReason, type RadarOutRow } from "@/lib/radar/out";
import { TUNE_GROUPS, TUNE_WORDS, tuneFromWords, tunedCount, type RadarTune, type TuneGroup } from "@/lib/radar/tune";
import { IconX, post, useToast } from "../../ui/shared";
import { LikelihoodChip } from "../../ui/system";
import { countryOf, isOpenRole, type CoInfo, type Row } from "../model";
import { useUi } from "../ui";
import { useApp, stripGone } from "../shell/pages";
import { CompanyName } from "../Tables";
import { CardList } from "../Cards";
import { Workbench } from "../workbench/Workbench";
import { useWorkbenchSort, type ExtraSorts } from "../workbench/useWorkbenchSort";
import { ColumnPicker } from "../workbench/ColumnPicker";
import { COMPANY_COLUMNS, type ColumnDef } from "../workbench/columns";
import { creditWords, quoteWords } from "../workbench/quote";
import { CrystalOpen, useCrystalClick } from "../CrystalOpen";
import { UnlockCompany } from "../Drawer";
import { CRYSTAL_PRO_LINK, rangesWorthShowing } from "../todayModel";
import { LeaderReport } from "../LeaderReport";
import { PassButton } from "../PeerSheets";
import { NoteSheet } from "../MoveNote";
import { bestBuyer, buyerNoteMove, moveSent } from "@/lib/moves";
import { pipelineAct, usePipeline } from "../pipelineStore";
import { ProRow, openPlans } from "../Billing";
import { radarDelivery } from "../PartnersSwitch";
import { useNetwork } from "../network/useNetwork"; // [google network]
import { usePaths } from "../network/usePaths"; // [smart ways in]
import { firstOf, ownOf } from "../firstVisit";
import { plural } from "../hooks";
import { dateWords, fitWords, groupCounts, kindLabel, moveOf, movedCount, newSince, sinceWords, sourcesLine, timeline, whenLong, whenWords, withStep, type WayFacts } from "./crystalModel";
import "../workbench/workbench.css";
import "./crystal.css";

let openedSent = false;
const signal = (name: "radar_opened" | "radar_clicked", where: string) => void post({ action: { type: "signal", name, where } });

/** "Nov 19". */
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The free facts a row shows under the name: the locked teaser, or industry and size. */
const factsOf = (i: CoInfo) => {
  if (i.c.hidden) return i.teaser || "Industry and size not on file yet";
  const v = (k: string) => (i.c.cells[k]?.s === "value" ? String(i.c.cells[k]!.v) : null);
  return [v("industry"), v("revenue") ?? v("employees")].filter(Boolean).join(" · ") || "Industry and size not on file yet";
};
/** The company as the member may read it: its name, the name the ball gives Trial and Pro, or "This company". */
const nameOf = (i: CoInfo) => (!i.c.hidden ? i.c.name : i.c.shownName || "This company");
const factOf = (i: CoInfo, k: string) => (i.c.cells[k]?.s === "value" ? String(i.c.cells[k]!.v) : null);

const BAND_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** The ball's own columns (the workbench's ColumnDef), before any Companies column the member adds. */
const CB_COLUMNS = (): ColumnDef[] => [
  { ...COMPANY_COLUMNS.find((c) => c.id === "company")!, width: "minmax(180px, 1.2fr)" },
  { id: "cb-band", type: "companies", label: "Likely", cost: "free", word: "rated", fill: () => "value", width: "minmax(84px, 84px)", tip: "High, Medium or Low: how likely they hire a fractional like you next. Never a percentage." },
  { id: "cb-why", type: "companies", label: "Why now", cost: "free", word: "with a signal", fill: () => "value", width: "minmax(200px, 2fr)", tip: "The signals behind it, strongest first." },
  { id: "cb-when", type: "companies", label: "When", cost: "free", word: "dated", fill: () => "value", width: "minmax(92px, 92px)", tip: "When a hire is likely, from the signal's usual window." },
  { id: "cb-move", type: "companies", label: "Your move and way in", cost: "free", word: "with a way in", fill: () => "empty", width: "minmax(150px, 1fr)", tip: "What to do next, and who can get you in." },
];

export function CrystalBallPage() {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const s = c.shell;
  const view = s.radar.data;
  const me = c.me;
  const phone = c.phone;
  const fn = view?.function ?? me.function ?? null;
  // [google network] and [smart ways in]: who the member knows, at which companies.
  const net = useNetwork().view;
  const paths = usePaths().view;
  const pipe = usePipeline().view;
  const inPipe = useMemo(() => new Set((pipe?.entries ?? []).map((e) => e.company)), [pipe]);
  const knownIds = useMemo(() => new Set([...(net?.companies ?? []).filter((x) => !x.set).map((x) => x.id), ...Object.keys(paths?.counts ?? {})]), [net, paths]);

  // First visit: read once when the page opens, so opening a company here moves the strip to its next step instead of hiding it.
  const [first] = useState(() => firstOf("radar", ownOf("radar", me)).first);
  const [openedHere, setOpenedHere] = useState<string | null>(null);

  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"why" | "tune">("why");
  const [mode, setMode] = useState<"rank" | "out">("rank");
  const [warmFirst, setWarmFirst] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editIcp, setEditIcp] = useState(false);
  const [asking, setAsking] = useState(false);
  const [lastOut, setLastOut] = useState<{ id: string; label: string; r: OutReason } | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [pickCols, setPickCols] = useState<HTMLElement | null>(null);
  const [notes, setNotes] = useState<CoInfo[]>([]);

  useEffect(() => {
    if (!openedSent) (openedSent = true), signal("radar_opened", "app");
  }, []);

  const byRow = useMemo(() => new Map((view?.rows ?? []).map((r) => [r.id, r])), [view]);
  const knowOn = s.radarKnow && (!!net || !!paths);
  const dayRows = s.radar.rows;
  const knownN = useMemo(() => dayRows.filter((r) => knownIds.has(r.i.c.id)).length, [dayRows, knownIds]);
  const since = c.table.since;
  const today = view?.today ?? new Date().toISOString().slice(0, 10);
  const newN = useMemo(() => newSince(view?.rows ?? [], since), [view, since]);

  const wayOf = useCallback(
    (i: CoInfo): WayFacts => {
      const holderEng = i.engs.find((e) => !isOpenRole(e) && (e.cells.operator?.s === "value" || e.cells.operator?.s === "locked"));
      const holder = holderEng?.cells.operator?.s === "value" ? String(holderEng.cells.operator.v) : null;
      return { paths: paths?.counts[i.c.id]?.n ?? 0, knows: !!net?.companies.some((x) => x.id === i.c.id && !x.set), holder, held: !!holderEng, open: !i.c.hidden };
    },
    [paths, net],
  );

  // The rows on screen: the range (or day), cut to where the member knows someone, to what's new since the last visit, then sorted.
  const rows = useMemo(() => {
    let xs = knowOn ? dayRows.filter((r) => knownIds.has(r.i.c.id)) : dayRows;
    if (onlyNew && since) xs = xs.filter((r) => (byRow.get(r.i.c.id)?.day ?? "") > since.slice(0, 10));
    if (warmFirst) xs = [...xs.filter((r) => moveOf(byRow.get(r.i.c.id) ?? { kinds: [] }, wayOf(r.i)).hasWay), ...xs.filter((r) => !moveOf(byRow.get(r.i.c.id) ?? { kinds: [] }, wayOf(r.i)).hasWay)];
    return xs;
  }, [knowOn, dayRows, knownIds, onlyNew, since, byRow, warmFirst, wayOf]);

  // [google network] Turned on with nobody known in this range: the next wider range with companies, once each time it is turned on.
  const widened = useRef<string | null>(null);
  useEffect(() => {
    if (!knowOn) {
      widened.current = null;
      return;
    }
    if (!view?.ready || !view.range || knownN > 0 || widened.current === "done") return;
    const order: RadarRange[] = ["today", "7d", "30d"];
    const at = order.indexOf(view.range);
    const next = (view.ranges ?? []).find((r) => order.indexOf(r.range) > at && r.companies > 0);
    if (next && widened.current !== next.range) {
      widened.current = next.range;
      s.setRadarRange(next.range);
    } else widened.current = "done";
  }, [knowOn, view, knownN, s]);

  // Every column sorts from its header, both ways; the Sort button's order clears it.
  const cbCols = useMemo(() => [...CB_COLUMNS().map((col) => (col.id === "cb-move" ? { ...col, fill: (r: Row) => (moveOf(byRow.get(r.i.c.id) ?? { kinds: [] }, wayOf(r.i)).hasWay ? ("value" as const) : ("empty" as const)) } : col)), ...extra.map((id) => COMPANY_COLUMNS.find((x) => x.id === id)!).filter(Boolean)], [byRow, wayOf, extra]);
  const cbSorts: ExtraSorts = useMemo(
    () => ({
      "cb-band": { kind: "number", get: (r) => BAND_RANK[byRow.get(r.i.c.id)?.band ?? ""] ?? null },
      "cb-why": { kind: "text", get: (r) => byRow.get(r.i.c.id)?.lines[0] ?? null },
      // Soonest first on the first click: months from now, the other way round.
      "cb-when": { kind: "number", get: (r) => (byRow.get(r.i.c.id)?.h ? -byRow.get(r.i.c.id)!.h![0] : null) },
      "cb-move": { kind: "number", get: (r) => (moveOf(byRow.get(r.i.c.id) ?? { kinds: [] }, wayOf(r.i)).hasWay ? 1 : 0) },
    }),
    [byRow, wayOf],
  );
  const colSort = useWorkbenchSort(rows, cbCols, "crystal", cbSorts);
  const curId = sel && rows.some((r) => r.i.c.id === sel) ? sel : rows[0]?.i.c.id ?? null;
  const cur = curId ? rows.find((r) => r.i.c.id === curId) ?? null : null;

  const open = useCallback(
    (id: string) => {
      signal("radar_clicked", "app");
      c.openCompany(id);
    },
    [c],
  );
  const crystalClick = useCrystalClick();
  const openRow = useCallback((r: Row) => void crystalClick(r.i.c.id, !!r.i.c.hidden, () => open(r.i.c.id)), [crystalClick, open]);

  /* ----- tuning ----- */
  const [tune, setTune] = useState<RadarTune>(view?.tune ?? {});
  const tuneSeen = useRef(false);
  useEffect(() => {
    if (view && !tuneSeen.current) (tuneSeen.current = true), setTune(view.tune ?? {});
  }, [view]);
  const [moved, setMoved] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);
  const [askQ, setAskQ] = useState("");
  const orderBefore = useRef<string[] | null>(null);
  useEffect(() => {
    if (!orderBefore.current || !view) return;
    setMoved(movedCount(orderBefore.current, view.rows.map((r) => r.id)));
    orderBefore.current = null;
  }, [view]);
  const saveTune = async (next: RadarTune) => {
    setTune(next);
    setMiss(false);
    orderBefore.current = (view?.rows ?? []).map((r) => r.id);
    const r = await ui.act({ type: "radarTune", tune: next as Record<string, number> }, { quiet: true });
    if (r.ok) s.radar.reload();
    else (orderBefore.current = null), toast(r.message || "That didn't go through. Try again.", true);
  };
  const askTune = () => {
    const hits = tuneFromWords(askQ);
    if (!hits.length) return setMiss(true);
    let next = tune;
    for (const h of hits) next = withStep(next, h.group, h.step);
    setAskQ("");
    void saveTune(next);
  };

  /* ----- why not ----- */
  const outAct = async (id: string, op: "out" | "back" | "anyway", reason?: OutReason, label?: string) => {
    const r = await ui.act({ type: "radarOut", companyId: id, op, ...(reason ? { reason } : {}) }, { quiet: true });
    if (!r.ok) return toast(r.message || "That didn't go through. Try again.", true);
    if (op === "out" && reason) setLastOut({ id, label: label ?? "This company", r: reason });
    else if (op === "back") setLastOut(null), toast(r.message);
    else toast(r.message);
    setAsking(false);
    setPicked((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    s.radar.reload();
  };

  /* ----- picking rows ----- */
  const pickedRows = rows.filter((r) => picked.has(r.key));
  const lockedPicked = pickedRows.filter((r) => r.i.c.hidden);
  const [quote, setQuote] = useState<UnlockQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const askOpen = async () => {
    setBusy(true);
    const items = lockedPicked.map((r) => ({ entity: "company" as const, id: r.i.c.id, field: "identity" }));
    const q = await post<{ quote?: UnlockQuote }>({ action: { type: "unlockMany", items, from: "crystal", quote: true } });
    setBusy(false);
    if (q.error || !q.quote) return toast(q.error || "That didn't go through. Try again.", true);
    setQuote(q.quote);
  };
  const runOpen = async () => {
    if (!quote) return;
    setBusy(true);
    const items = lockedPicked.map((r) => ({ entity: "company" as const, id: r.i.c.id, field: "identity" }));
    const r = await ui.act({ type: "unlockMany", items, from: "crystal" });
    setBusy(false);
    setQuote(null);
    if (r.ok) {
      if (!openedHere && items[0]) setOpenedHere(items[0].id);
      await c.refresh();
    }
  };
  useEffect(() => setQuote(null), [picked]);
  const toPipeline = async (ids: string[]) => {
    const r = await pipelineAct({ type: "pipeline.add", companyIds: ids });
    toast(r.message || "Added to your pipeline.", !r.ok);
  };
  const follow = async (ids: string[]) => {
    for (const id of ids) await ui.act({ type: "follow", companyId: id, on: true }, { quiet: ids.length > 1 });
    if (ids.length > 1) toast(`Following ${plural(ids.length, "company", "companies")}. Merlin tells you when something changes there.`);
  };
  const draftNotes = (cos: CoInfo[]) => {
    const open_ = cos.filter((i) => !i.c.hidden);
    const withBuyer = open_.filter((i) => bestBuyer(i.c, me.function));
    if (!withBuyer.length) return toast(open_.length ? "Nobody who decides is on file at these yet. Open one and add who decides." : "Open a company first. Then Merlin drafts the note.", true);
    if (withBuyer.length < open_.length) toast(`${plural(open_.length - withBuyer.length, "company has", "companies have")} nobody who decides on file, so left out.`);
    setNotes(withBuyer);
  };

  const opened = (id: string) => {
    if (!openedHere) setOpenedHere(id);
  };

  /* ----- the page ----- */
  if (s.radar.failed && !view)
    return (
      <div className="cb cb-msg">
        <p role="alert">
          {s.radar.failed}{" "}
          <button type="button" className="cb-link" onClick={() => s.radar.reload()}>
            Try again
          </button>
        </p>
      </div>
    );
  if (!view)
    return (
      <div className="cb cb-msg">
        <p role="status">Looking at what moved</p>
      </div>
    );

  const anyCo = !!view.anyCompany || !view.ready;
  const editing = editIcp || anyCo;
  const out = view.out ?? [];
  const range = view.range ?? null;
  const dayLink = !range && view.day ? view.day : null;
  const counts = { High: 0, Medium: 0, Low: 0 };
  for (const r of view.rows) if (r.band) counts[r.band]++;
  const nTuned = tunedCount(tune);
  const crystal = me.crystal ?? null;
  const fnWord = fn && fn !== "Other" ? fn.toLowerCase() : null;
  const stripOn = first && !stripGone(c, "radar");

  const strip = stripOn ? (
    openedHere ? (
      <section className="wb-strip wb-strip-done" aria-label="About this page">
        <span className="wb-strip-t">
          <strong>Step 4 done. {c.byId.get(openedHere)?.c.name ?? "Your first company"} is open.</strong> Its website, its people and who held each seat now show, and it stays yours.
          Next, bring in who you know, so Merlin can find a way in to the companies that say No path yet.
        </span>
        <button type="button" className="btn btn-pine" onClick={() => c.start.run("network")}>
          Bring in who you know
        </button>
        <button type="button" className="btn btn-outline" onClick={() => open(openedHere)}>
          See the company
        </button>
        <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip("radar")}>
          <IconX size={16} />
        </button>
      </section>
    ) : (
      <section className="wb-strip" aria-label="About this page">
        <span className="wb-strip-t">
          <strong>What this page is for.</strong> Merlin&apos;s forecast of who hires a fractional {fnWord ? `${fnWord} leader` : "like you"} next. Each company reads High, Medium or Low, with
          the two or three signals behind it: a seat that just ended, a new leader, a repeat hirer, a role just posted.{" "}
          {crystal === "all"
            ? "Every company here opens free, and it does not count toward your 15 a day."
            : crystal === "one" || crystal === "used"
              ? "One company here opens free each day, with everything on it."
              : `Each one opens for ${COMPANY_PRICE_SAY}.`}
        </span>
        {!anyCo && cur && cur.i.c.hidden && (crystal === "all" || crystal === "one") && <CrystalOpen id={cur.i.c.id} name={cur.i.c.shownName} onOpened={() => opened(cur.i.c.id)} noPro />}
        <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip("radar")}>
          <IconX size={16} />
        </button>
      </section>
    )
  ) : null;

  return (
    <div className={`cb${phone ? " cb-phone" : ""}`}>
      {strip}
      <div className="cb-head">
        <div className="cb-head-t">
          <h1>{YOUR_FEATURE}</h1>
          <span className="cb-lead">
            {anyCo
              ? "Any company for now. Say who your ideal client is and Merlin narrows the list."
              : `${plural(view.rows.length, "company", "companies")} likely to hire a fractional ${fnWord ?? ""}${fnWord ? " " : ""}leader next.`}
          </span>
        </div>
        <div className="cb-bands" aria-label="How many in each band">
          {(["High", "Medium", "Low"] as const).map((b) => (
            <span key={b} className="cb-band">
              <LikelihoodChip band={b} />
              <strong className="num">{counts[b]}</strong>
            </span>
          ))}
          <span className="cb-band-note">{anyCo ? "Nothing goes by email until your ideal client is set." : "High and Medium come by email. Low shows only here."}</span>
        </div>
      </div>

      {/* The toolbar: sort, ranges with their counts, where you know someone, rows, Tune. */}
      {view.ready && (
        <div className="cb-bar" role="toolbar" aria-label="Crystal Ball">
          <button type="button" className="cb-btn" onClick={() => (colSort.key ? colSort.clear() : setWarmFirst((x) => !x))}>
            Sort: {colSort.words ?? (warmFirst ? "With a way in first" : "Most likely first")}
          </button>
          {dayLink && (
            <span className="chip chip-on cb-pill">
              <span>
                From {yourFeature} · {shortDay(dayLink)} · {plural(view.rows.length, "company", "companies")}
              </span>
              <button type="button" className="rd-pill-x" onClick={c.toBase} aria-label="Remove this filter and show all companies" title="Show all companies">
                <IconX size={13} />
              </button>
            </span>
          )}
          {rangesWorthShowing(view.ranges) && (
            <div className="cb-ranges" role="group" aria-label="Pick a range">
              {(view.ranges ?? []).map((r) => (
                <button key={r.range} type="button" className={`cb-btn${r.range === range ? " on" : ""}`} aria-pressed={r.range === range} onClick={() => s.setRadarRange(r.range)}>
                  {rangeLabel(r.range)}
                  <strong className="num" aria-label={`, ${plural(r.companies, "company", "companies")}`}>
                    {r.companies}
                  </strong>
                </button>
              ))}
            </div>
          )}
          {(net || paths) && (knowOn || knownN > 0 || (!!range && !!net?.companies.some((x) => !x.set))) && (
            <button type="button" className={`cb-btn${knowOn ? " on" : ""}`} aria-pressed={knowOn} onClick={() => s.setRadarKnow(!knowOn)}>
              Where you know someone
              <strong className="num" aria-label={`, ${plural(knownN, "company", "companies")}`}>
                {knownN}
              </strong>
            </button>
          )}
          <span className="cb-rows">
            {rows.length} of {view.rows.length} shown{nTuned ? " · re-ranked by your weights" : ""}
          </span>
          <button
            type="button"
            className={`cb-tune${tab === "tune" ? " on" : ""}`}
            aria-pressed={tab === "tune"}
            onClick={() => {
              setTab(tab === "tune" ? "why" : "tune");
              // On a phone the panel sits under the list: bring it into view.
              if (phone && tab !== "tune") setTimeout(() => document.querySelector(".cb-side")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
            }}
          >
            Tune{nTuned ? ` · ${nTuned}` : ""}
          </button>
        </div>
      )}

      {/* Since the last visit: what is new in the ball, and what Merlin kept off the email. */}
      {view.ready && !first && since && range && (newN > 0 || out.some((o) => o.by === "merlin")) && (
        <nav className="cb-since" aria-label="Since your last visit">
          <span className="cb-since-t">Since {sinceWords(since, today)}</span>
          {newN > 0 && (
            <button type="button" className={`cb-since-b${onlyNew ? " on" : ""}`} aria-pressed={onlyNew} onClick={() => setOnlyNew((x) => !x)}>
              <strong className="num">{newN}</strong> new to your ball
            </button>
          )}
          {out.some((o) => o.by === "merlin" && (o.r === "limit" || o.r === "held" || o.r === "quiet")) && (
            <button type="button" className="cb-since-b" onClick={() => setMode("out")}>
              <strong className="num">{out.filter((o) => o.by === "merlin" && (o.r === "limit" || o.r === "held" || o.r === "quiet")).length}</strong> kept off your email
            </button>
          )}
        </nav>
      )}

      {/* Free, after today's free company: the rest unlock as anywhere, or Pro opens them free. */}
      {me.crystal === "used" && (
        <p className="cb-note" role="status">
          Your free {FEATURE_NAME} company for today is used. The rest unlock for {COMPANY_PRICE_SAY} each.{" "}
          <button type="button" className="cb-link" onClick={() => openPlans("crystal")}>
            {CRYSTAL_PRO_LINK}
          </button>
        </p>
      )}
      {view.expired && (
        <p className="cb-note" role="status">
          That day is older than we keep. Here is what moved {range ? `in the ${rangeLabel(range).toLowerCase()}` : "lately"} instead.
        </p>
      )}

      {/* The ideal client: tuned to it already (first visit), or the step inline when it is missing. */}
      {first && !editing && !icpEmptyOf(me.icp) && (
        <div className="cb-tuned">
          <span>Already tuned to your ideal client, from what you said when you signed up:</span>
          {icpChips(me.icp, fn).map((t) => (
            <span key={t} className="cb-chip">
              {t}
            </span>
          ))}
          <button type="button" className="cb-link" onClick={() => setEditIcp(true)}>
            Change it
          </button>
        </div>
      )}
      {editing && <IcpEditor needFn={!view.ready} missing={anyCo} onDone={() => (setEditIcp(false), s.radar.reload())} onCancel={anyCo ? null : () => setEditIcp(false)} />}

      {lastOut && (
        <div className="cb-left" role="status">
          <span>
            <strong>{lastOut.label} left your ball.</strong> {OUT_WORDS[lastOut.r].did}
          </span>
          <button type="button" className="cb-btn" onClick={() => void outAct(lastOut.id, "back")}>
            Undo
          </button>
          <button type="button" className="cb-btn" onClick={() => (setMode("out"), setLastOut(null))}>
            See what is not in your ball
          </button>
        </div>
      )}

      {pickedRows.length > 0 && mode === "rank" && (
        <div className="wb-selbar cb-selbar" role="toolbar" aria-label="Actions for the rows you picked">
          <strong className="wb-sel-n">{pickedRows.length} selected</strong>
          {quote ? (
            (() => {
              const w = quoteWords(quote, ["company", "companies"], null);
              return (
                <span className="wb-sel-quote" role="status">
                  <span className="wb-sel-total">{w.total}</span>
                  <span className="wb-sel-after">{w.after}</span>
                  {w.stop && <span className="wb-sel-stop">{w.stop}</span>}
                  <button type="button" className="wb-sel-btn" onClick={() => setQuote(null)} disabled={busy}>
                    Not now
                  </button>
                  {quote.fits > 0 && (
                    <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void runOpen()} disabled={busy} aria-busy={busy} autoFocus>
                      {busy ? "Opening" : `Open ${quote.fits} · ${creditWords(quote.cost)}`}
                    </button>
                  )}
                </span>
              );
            })()
          ) : (
            <>
              {lockedPicked.length > 0 && (
                <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void askOpen()} disabled={busy} aria-busy={busy}>
                  Open {lockedPicked.length} · see the cost
                </button>
              )}
              <button type="button" className="wb-sel-btn" onClick={() => void toPipeline(pickedRows.map((r) => r.i.c.id))}>
                Add to pipeline
              </button>
              <button type="button" className="wb-sel-btn" onClick={() => void follow(pickedRows.filter((r) => !r.i.c.hidden).map((r) => r.i.c.id))} disabled={pickedRows.every((r) => r.i.c.hidden)}>
                Follow
              </button>
              <button type="button" className="wb-sel-btn" onClick={() => draftNotes(pickedRows.map((r) => r.i))}>
                Draft notes
              </button>
              <button type="button" className="wb-sel-btn" onClick={() => void Promise.all(pickedRows.map((r) => outAct(r.i.c.id, "out", "notnow", nameOf(r.i))))}>
                Not now
              </button>
              <button type="button" className="wb-sel-btn" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      <div className="cb-body">
        <section className="cb-main" aria-label={mode === "out" ? "Not in your ball" : YOUR_FEATURE}>
          {mode === "out" ? (
            <OutTable rows={out} byId={c.byId} openCompany={open} onAct={outAct} onIcp={() => (setEditIcp(true), setMode("rank"))} />
          ) : !view.ready ? null : !rows.length && knowOn ? (
            <div className="cb-empty">
              <p>
                Nobody you know is at a company in {yourFeature} {range ? `in the ${rangeLabel(range).toLowerCase()}` : ""}. Your warm paths are every company you know that fits your ideal
                client or is likely to hire you.
              </p>
              <div className="cb-empty-acts">
                <button type="button" className="btn btn-pine" onClick={() => c.openPage("warm")}>
                  See your warm paths
                </button>
                {dayRows.length > 0 && (
                  <button type="button" className="btn btn-outline" onClick={() => s.setRadarKnow(false)}>
                    Show all {dayRows.length} here
                  </button>
                )}
              </div>
            </div>
          ) : !rows.length ? (
            <div className="cb-empty">
              <p>{onlyNew ? "Nothing new since your last visit in this range." : `Nothing moved at companies in your ideal client ${range ? `in the ${rangeLabel(range).toLowerCase()}` : dayLink ? `on ${shortDay(dayLink)}` : ""}. Merlin never sends a day with nothing in it.`}</p>
              {(onlyNew || range !== "30d") && (
                <button type="button" className="btn btn-outline" onClick={() => (setOnlyNew(false), s.setRadarRange("30d"))}>
                  Show the last 30 days
                </button>
              )}
            </div>
          ) : phone ? (
            <div className="cb-cards">
              <CardList
                type="companies"
                rows={rows}
                me={s.cellMe}
                onOpen={openRow}
                signals={{
                  lines: new Map((view.rows ?? []).map((x) => [x.id, x.lines])),
                  notes: new Map((view.rows ?? []).flatMap((x) => (x.notes ? [[x.id, x.notes] as const] : []))),
                  action: (i) =>
                    i.c.hidden && crystal ? (
                      <CrystalOpen id={i.c.id} name={i.c.shownName} onOpened={() => (opened(i.c.id), open(i.c.id))} noPro />
                    ) : (
                      <button type="button" className="btn btn-outline" onClick={() => open(i.c.id)}>
                        Open<span className="sr-only"> {i.c.hidden ? "this company" : i.c.name}</span>
                      </button>
                    ),
                }}
              />
            </div>
          ) : (
            <>
              {anyCo && (
                <p className="cb-any">
                  <strong>Any company.</strong> These are Merlin&apos;s strongest signals anywhere, with no fit yet. Answer the step above to narrow them to your kind of client.
                </p>
              )}
              <Workbench
                type="companies"
                rows={colSort.rows}
                cols={cbCols}
                mine={fn}
                selected={picked}
                onPick={(k, on) =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (on) n.add(k);
                    else n.delete(k);
                    return n;
                  })
                }
                onPickAll={(on) => setPicked(on ? new Set(rows.map((r) => r.key)) : new Set())}
                onOpen={(r) => (setSel(r.i.c.id), setTab("why"), setAsking(false))}
                sort="best"
                sorter={colSort}
                onAddColumn={() => setPickCols(document.querySelector<HTMLElement>(".cb .wb-add"))}
                rowClass={(r) => (r.i.c.id === curId ? "cb-cur" : "")}
                cell={(id, r) => {
                  const rr = byRow.get(r.i.c.id);
                  if (!rr) return undefined;
                  if (id === "company")
                    return (
                      <span className="cb-co">
                        <button type="button" className="cb-co-name" onClick={(e) => (e.stopPropagation(), openRow(r))}>
                          <CompanyName i={r.i} tagged={false} quiet />
                        </button>
                        {!r.i.c.hidden && <span className="cb-co-facts">{factsOf(r.i)}</span>}
                        {r.i.c.hidden && crystal === "all" && <span className="cb-co-free">Opens free</span>}
                      </span>
                    );
                  if (id === "cb-band") return rr.band ? <LikelihoodChip band={rr.band} /> : null;
                  if (id === "cb-why") return <WhyCell row={rr} fn={fn} today={today} />;
                  if (id === "cb-when") return <span className="cb-when">{whenWords(rr.h) ?? "Not on file"}</span>;
                  if (id === "cb-move") {
                    const m = moveOf(rr, wayOf(r.i));
                    return (
                      <span className="cb-move">
                        <span className="cb-move-t">{inPipe.has(r.i.c.id) ? "In your pipeline" : m.move}</span>
                        <span className={`cb-way${m.hasWay ? " on" : ""}`}>{m.way}</span>
                      </span>
                    );
                  }
                  return undefined;
                }}
              />
            </>
          )}
        </section>

        {view.ready && (
          <aside className="cb-side" aria-label="Why it is here, and tuning">
            <div className="cb-tabs" role="tablist" aria-label="Side panel">
              <button type="button" role="tab" aria-selected={tab === "why"} className={tab === "why" ? "on" : ""} onClick={() => setTab("why")}>
                Why it is here
              </button>
              <button type="button" role="tab" aria-selected={tab === "tune"} className={tab === "tune" ? "on" : ""} onClick={() => setTab("tune")}>
                Tune{nTuned ? ` · ${nTuned}` : ""}
              </button>
            </div>
            {tab === "why" ? (
              cur && byRow.get(cur.i.c.id) ? (
                <WhyPanel
                  r={cur}
                  row={byRow.get(cur.i.c.id)!}
                  view={view}
                  fn={fn}
                  way={wayOf(cur.i)}
                  inPipe={inPipe.has(cur.i.c.id)}
                  asking={asking}
                  setAsking={setAsking}
                  onOpen={() => open(cur.i.c.id)}
                  onOpened={() => opened(cur.i.c.id)}
                  onPipe={() => void toPipeline([cur.i.c.id])}
                  onFollow={() => void follow([cur.i.c.id])}
                  onWarm={() => c.openPage("warm")}
                  onOut={(reason) => void outAct(cur.i.c.id, "out", reason, nameOf(cur.i))}
                  onNote={() => draftNotes([cur.i])}
                />
              ) : (
                <p className="cb-side-empty">Pick a company to see why it is in your ball.</p>
              )
            ) : (
              <TunePanel
                tune={tune}
                rows={view.rows}
                fn={fn}
                anyCo={anyCo}
                moved={moved}
                miss={miss}
                askQ={askQ}
                setAskQ={(v) => (setAskQ(v), setMiss(false))}
                onAsk={askTune}
                onSet={(g, step) => void saveTune(withStep(tune, g, step))}
                onReset={() => void saveTune({})}
                onIcp={() => setEditIcp(true)}
                view={view}
              />
            )}
          </aside>
        )}
      </div>

      <div className="cb-foot">
        <div className="cb-views" role="group" aria-label="What the list shows">
          <button type="button" className={mode === "rank" ? "on" : ""} aria-pressed={mode === "rank"} onClick={() => setMode("rank")}>
            Ranked · {view.rows.length}
          </button>
          <button type="button" className={mode === "out" ? "on" : ""} aria-pressed={mode === "out"} onClick={() => setMode("out")}>
            Not in your ball · {out.length}
          </button>
        </div>
        <span className="cb-status">
          {anyCo
            ? "Any company for now."
            : crystal === "all"
              ? `Companies here open free and don't count toward your 15 a day. ${view.on ? "Comes by email on mornings when something moved." : ""}`
              : view.on
                ? "Comes by email on mornings when something moved."
                : `${YOUR_FEATURE} is off by email and in Slack. This page still lists what moved.`}
        </span>
        <button type="button" className="cb-link" onClick={() => c.openPage("notifications")}>
          Email and Slack settings
        </button>
      </div>

      {pickCols && (
        <ColumnPicker
          anchor={pickCols}
          type="companies"
          picked={["company", ...extra]}
          onChange={(next) => setExtra(next.filter((id) => id !== "company"))}
          onReset={() => setExtra([])}
          onClose={() => setPickCols(null)}
        />
      )}
      {notes[0] &&
        (() => {
          const i = notes[0];
          const b = bestBuyer(i.c, me.function)!;
          const move = buyerNoteMove(i.c, b, me);
          const next = () => setNotes((n) => n.slice(1));
          const sent = () => void pipelineAct({ type: "pipeline.sent", companyId: i.c.id, from: "record", ...moveSent(move) });
          const rr = byRow.get(i.c.id);
          return (
            <NoteSheet
              key={i.c.id}
              m={move}
              row={rr ? { id: rr.id, kinds: rr.kinds, lines: rr.lines } : { id: i.c.id, kinds: [], lines: [] }}
              me={me}
              onClose={next}
              onUsed={sent}
              onSent={() => (sent(), next())}
              onClaude={next}
              sentLabel={notes.length > 1 ? `Mark as sent, next of ${notes.length}` : "Mark as sent"}
            />
          );
        })()}
    </div>
  );
}

/* ---------- a row's Why now ---------- */

function WhyCell({ row, fn, today }: { row: RadarRow; fn: string | null; today: string }) {
  const sigs: RadarSigView[] = row.sigs?.length ? row.sigs : row.kinds.map((k, n) => ({ kind: k, line: row.lines[n] ?? row.lines[0] ?? "" }));
  const labels = [...new Set(sigs.map((x) => kindLabel(x.kind, fn)))];
  const lead = sigs[0];
  const when = dateWords(lead?.at ?? row.day, today);
  return (
    <span className="cb-why">
      <span className="cb-why-chips">
        {labels.slice(0, 2).map((t, k) => (
          <span key={t} className={`cb-sig${k ? "" : " lead"}`}>
            {t}
          </span>
        ))}
        {labels.length > 2 && <span className="cb-sig more">+{labels.length - 2}</span>}
      </span>
      <span className="cb-why-line">
        {when && <strong>{when} · </strong>}
        {(lead?.whyNow || lead?.line || "").split(" · ")[0]}
      </span>
    </span>
  );
}

/* ---------- the side panel: one company, signal by signal ---------- */

function WhyPanel({
  r,
  row,
  view,
  fn,
  way,
  inPipe,
  asking,
  setAsking,
  onOpen,
  onOpened,
  onPipe,
  onFollow,
  onWarm,
  onOut,
  onNote,
}: {
  r: Row;
  row: RadarRow;
  view: RadarView;
  fn: string | null;
  way: WayFacts;
  inPipe: boolean;
  asking: boolean;
  setAsking: (on: boolean) => void;
  onOpen: () => void;
  onOpened: () => void;
  onPipe: () => void;
  onFollow: () => void;
  onWarm: () => void;
  onOut: (r: OutReason) => void;
  onNote: () => void;
}) {
  const ui = useUi();
  const i = r.i;
  const sigs: RadarSigView[] = row.sigs?.length ? row.sigs : row.kinds.map((k, n) => ({ kind: k, line: row.lines[n] ?? "" }));
  const m = moveOf(row, way);
  const tl = timeline(sigs, row.h, view.today);
  const lead = fn ? i.leads.find((l) => l.fn === fn) : null;
  const teamAt = i.c.leads?.teamAt;
  const leadWords = !fn
    ? null
    : lead && lead.kind === "full-time"
      ? `${lead.how === "members" ? "Members say" : "Their team page shows"} a full-time ${lead.role ?? `${fn} leader`}${lead.since ? ` since ${lead.since}` : ""}. Held under Medium.`
      : teamAt
        ? `No full-time ${fn} leader on their team page, read ${dateWords(teamAt.slice(0, 10), view.today)}.`
        : `Team page not read yet, so a gap alone cannot make this High.`;
  const go = () => {
    if (m.go === "warm") return onWarm();
    if (m.go === "follow") return onFollow();
    if (m.go === "record" && way.open && (way.holder || way.paths || way.knows) && bestBuyer(i.c, ui.me.function)) return onNote();
    onOpen();
  };
  return (
    <div className="cb-why-p">
      <div className="cb-p-head">
        <button type="button" className="cb-co-name" onClick={onOpen}>
          <CompanyName i={i} tagged={false} quiet />
        </button>
        {!i.c.hidden && <span className="cb-p-facts">{factsOf(i)}</span>}
      </div>
      <div className="cb-p-band">
        {row.band && <LikelihoodChip band={row.band} long />}
        <span>{whenLong(row.h)}</span>
      </div>
      {i.c.hidden && (
        <div className="cb-p-open">
          {ui.me.crystal ? (
            <CrystalOpen id={i.c.id} name={i.c.shownName} onOpened={() => (onOpened(), onOpen())} />
          ) : (
            // Billing off: the record's own unlock, with its price, the zero-credit wall and the day's limit.
            <UnlockCompany id={i.c.id} rate={i.engs.some((e) => isOpenRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value"))} roles={i.engs.some(isOpenRole)} />
          )}
        </div>
      )}

      <section className="cb-p-sec" aria-label="What put it in your ball">
        <h3>What put it here</h3>
        <ol className="cb-p-sigs">
          {sigs.map((x, k) => (
            <li key={k}>
              <span className="cb-dot" aria-hidden>
                {k + 1}
              </span>
              <span>
                <span className="cb-p-sig-h">
                  <strong>{kindLabel(x.kind, fn)}</strong>
                  {x.at && <span className="cb-muted">{dateWords(x.at, view.today)}</span>}
                  {x.weight && <span className={`cb-weight w-${x.weight.toLowerCase()}`}>{x.weight}</span>}
                </span>
                <span className="cb-p-sig-l">{x.whyNow || x.line}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="cb-muted">{sourcesLine(sigs)}</p>
        <p className="cb-p-fit">
          <strong>Fit.</strong> {fitWords(ui.me.icp, { industry: factOf(i, "industry"), employees: factOf(i, "employees"), revenue: factOf(i, "revenue"), country: countryOf(i.c) })}
        </p>
        {leadWords && (
          <p className="cb-p-fit">
            <strong>Who leads {fn} there.</strong> {leadWords}
          </p>
        )}
      </section>

      <section className="cb-p-sec" aria-label="Signals over time">
        <h3>
          Timeline <span className="cb-muted cb-legend"><span className="cb-key sig" aria-hidden /> Signal <span className="cb-key win" aria-hidden /> May hire</span>
        </h3>
        <div className="cb-tl" role="img" aria-label={`${plural(sigs.length, "signal")} in the last 12 months. ${whenLong(row.h)}.`}>
          <div className="cb-tl-box" style={{ height: sigs.length * 20 + 14 }}>
            {sigs.map((_, k) => (
              <span key={`l${k}`} className="cb-tl-lane" style={{ top: k * 20 + 8 }} />
            ))}
            {tl.dots.map((x, k) =>
              x === null ? null : (
                <span key={`d${k}`} className="cb-tl-dot" style={{ top: k * 20, left: `calc(${(x * 100).toFixed(1)}% - 9px)` }}>
                  {k + 1}
                </span>
              ),
            )}
            <span className="cb-tl-now" style={{ left: "50%" }} />
            {tl.win && <span className="cb-tl-win" style={{ top: sigs.length * 20 + 2, left: `${(tl.win[0] * 100).toFixed(1)}%`, width: `${((tl.win[1] - tl.win[0]) * 100).toFixed(1)}%` }} />}
          </div>
          <div className="cb-tl-axis">
            <span>12 months ago</span>
            <strong>Today</strong>
            <span>12 months ahead</span>
          </div>
        </div>
      </section>

      <section className="cb-p-sec" aria-label="Your move">
        <strong className="cb-p-move">{m.long}</strong>
        <p>
          <strong>Your way in.</strong> {m.wayLong}
        </p>
        <div className="cb-p-acts">
          <button type="button" className={`btn ${way.open ? "btn-pine" : "btn-outline"}`} onClick={go}>
            {m.goText}
          </button>
          {inPipe ? (
            <span className="cb-chip">In your pipeline</span>
          ) : (
            <button type="button" className="btn btn-outline" onClick={onPipe}>
              Add to pipeline
            </button>
          )}
        </div>
      </section>

      <section className="cb-p-sec" aria-label="Not for you">
        {!asking ? (
          <div className="cb-p-acts">
            <button type="button" className="btn btn-outline" onClick={() => setAsking(true)}>
              Not for me
            </button>
            <PassButton company={i.c.id} role={i.engs.find(isOpenRole)?.id ?? null} from="crystal" className="btn btn-outline" />
          </div>
        ) : (
          <div className="cb-reasons">
            <strong>Why not {i.c.hidden && !i.c.shownName ? "this company" : nameOf(i)}?</strong>
            <span className="cb-muted">Your reason takes it out of your ball. Nothing is deleted: it is still in Companies.</span>
            {!i.c.hidden && fn && (
              <div className="cb-reason cb-reason-ft">
                <span className="cb-muted">{OUT_WORDS.fulltime.did}</span>
                <LeaderReport companyId={i.c.id} fn={fn} leads={i.c.leads} from="radar" onDone={() => onOut("fulltime")} />
              </div>
            )}
            {(["size", "kind", "known", "notnow"] as const).map((k) => (
              <button key={k} type="button" className="cb-reason" onClick={() => onOut(k)}>
                <strong>{OUT_WORDS[k].t}</strong>
                <span>{OUT_WORDS[k].did}</span>
              </button>
            ))}
            <button type="button" className="cb-link" onClick={() => setAsking(false)}>
              Keep it in my ball
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- the Tune tab ---------- */

function TunePanel({
  tune,
  rows,
  fn,
  anyCo,
  moved,
  miss,
  askQ,
  setAskQ,
  onAsk,
  onSet,
  onReset,
  onIcp,
  view,
}: {
  tune: RadarTune;
  rows: RadarRow[];
  fn: string | null;
  anyCo: boolean;
  moved: number | null;
  miss: boolean;
  askQ: string;
  setAskQ: (v: string) => void;
  onAsk: () => void;
  onSet: (g: TuneGroup, step: 0 | 1 | 2) => void;
  onReset: () => void;
  onIcp: () => void;
  view: RadarView;
}) {
  const ui = useUi();
  const me = ui.me;
  const n = tunedCount(tune);
  const behind = groupCounts(rows);
  return (
    <div className="cb-tune-p">
      <section className="cb-p-sec" aria-label="Your ideal client">
        <h3>
          Your ideal client{" "}
          <button type="button" className="cb-link" onClick={onIcp}>
            Change
          </button>
        </h3>
        <div className="cb-chips">
          {(anyCo ? ["Not set yet"] : icpChips(me.icp, fn)).map((t) => (
            <span key={t} className="cb-chip">
              {t}
            </span>
          ))}
        </div>
        <p className="cb-muted">
          {anyCo
            ? "Until it is set, every company counts the same and nothing comes by email."
            : `Companies that match more of it rank higher.${view.beforeFromMember && view.before.length ? ` You said ${view.before.join(" and ")} usually come before ${fn ?? "you"}, so a fractional hire there counts for more.` : ""}`}
        </p>
      </section>

      <section className="cb-p-sec" aria-label="What counts most">
        <h3>What counts most</h3>
        <p className="cb-muted">Three steps for each kind of signal. The list re-ranks when you change one. Bands can move; no company is added or dropped.</p>
        <form
          className="cb-ask"
          onSubmit={(e) => {
            e.preventDefault();
            onAsk();
          }}
        >
          <input type="text" className="input" aria-label="Tell Merlin what counts more or less" placeholder="Roles matter more" value={askQ} onChange={(e) => setAskQ(e.target.value)} />
          <button type="submit" className="btn btn-outline">
            Set
          </button>
        </form>
        <div className="cb-quick">
          <button type="button" className="cb-btn" onClick={() => onSet("seat", 2)}>
            Count ended seats more
          </button>
          <button type="button" className="cb-btn" onClick={() => onSet("grow", 0)}>
            Growth matters less
          </button>
        </div>
        {TUNE_GROUPS.map((g) => {
          const v = tune[g.key] ?? 1;
          return (
            <div key={g.key} className="cb-w">
              <span className="cb-w-t">
                <strong>{g.key === "gap" && fn ? `No ${fn.toLowerCase()} leader on their team page` : g.label}</strong>
                <span className="cb-muted">
                  Behind {behind[g.key]} of {rows.length} companies{v === 2 ? " · counts 1.5 times" : v === 0 ? " · counts half" : ""}
                </span>
              </span>
              <span className="cb-seg" role="radiogroup" aria-label={g.label}>
                {([0, 1, 2] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? "on" : ""} onClick={() => onSet(g.key, k)}>
                    {TUNE_WORDS[k]}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
        <div className="cb-tune-sum" role="status">
          <span>
            {miss
              ? "Merlin found no signal in that. Name one, such as roles, ended seats or growth, and say more or less."
              : n
                ? `${plural(n, "weight")} changed.${moved !== null ? ` ${moved} of ${rows.length} companies moved place.` : ""}`
                : "All weights are Normal. This is the order Merlin gives everyone with your ideal client."}
          </span>
          {n > 0 && (
            <button type="button" className="cb-link" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
      </section>

      <section className="cb-p-sec" aria-label="How it reaches you">
        <h3>By email and Slack</h3>
        <p className="cb-muted">
          {anyCo
            ? `Nothing is sent until your ideal client is set. Then High and Medium companies come by email on mornings when something moved.`
            : !view.email && !view.slack
              ? `Connect Slack to get ${yourFeature} every morning. Until then it is here.`
              : !view.on
                ? `${YOUR_FEATURE} is off by email and in Slack. This page still lists what moved.`
                : `${view.email ? radarDelivery(me, view.slack) : me.radarSlack !== false ? `${YOUR_FEATURE} comes in Slack, on mornings when something moved.` : `${YOUR_FEATURE} is off in Slack.`} High and Medium only. Merlin never sends a day with nothing in it.`}
        </p>
        <div className="cb-p-acts">
          <button type="button" className="btn btn-outline" onClick={() => ui.openPage("notifications")}>
            Change how often
          </button>
        </div>
        <ProRow
          from="radar"
          title="In Slack as it happens"
          free="Pro posts each signal to Slack the moment it shows. On Free they come each morning."
          desc={`Each signal posts to Slack the moment it shows${me.plan?.trialEndsAt ? ", in your trial" : ""}.${view.slack ? "" : " Connect Slack under Integrations to get them."}`}
        />
      </section>
    </div>
  );
}

/* ---------- Why not: the companies not in the ball ---------- */

const MERLIN_WHY: Record<string, { why: string; did: string; act: string | null }> = {
  limit: { why: "Kept off your email: that morning already had its companies.", did: "It is still on this page. It can come by email on a morning with room in the next 7 days.", act: "Show it anyway" },
  held: { why: "Kept off that morning's email.", did: "It is still on this page. It can come by email on a morning in the next 7 days.", act: "Show it anyway" },
  quiet: { why: "Shown to you in the last 30 days, and nothing new has happened there since.", did: "It comes back by email when something new happens there.", act: "Show it anyway" },
  icp: { why: "A strong signal outside your ideal client.", did: "Left out of your ball and your email while your ideal client says no to it.", act: "Change ideal client" },
  anyway: { why: "You asked to see it.", did: "It comes first in tomorrow's Crystal Ball, by email too.", act: null },
};

function OutTable({
  rows,
  byId,
  openCompany,
  onAct,
  onIcp,
}: {
  rows: RadarOutRow[];
  byId: Map<string, CoInfo>;
  openCompany: (id: string) => void;
  onAct: (id: string, op: "out" | "back" | "anyway", reason?: OutReason, label?: string) => Promise<void> | void;
  onIcp: () => void;
}) {
  const label = (o: RadarOutRow) => {
    const i = byId.get(o.id);
    if (i && !i.c.hidden) return { name: i.c.name, facts: factsOf(i), open: true };
    return { name: o.name ?? "A locked company", facts: i ? factsOf(i) : "Industry and size not on file yet", open: false };
  };
  return (
    <div className="cb-out">
      <p className="cb-out-intro">
        <strong>Why not.</strong> Companies you took out, and ones Merlin kept off your email or outside your ideal client, each with the reason. Nothing here is deleted: every one is still in
        Companies.
      </p>
      {!rows.length ? (
        <p className="cb-muted">Nothing here. Use Not for me on a company in your ball to take it out, with a reason.</p>
      ) : (
        <div className="cb-out-table" role="table" aria-label="Companies not in your ball, and why">
          <div role="row" className="cb-out-row cb-out-head">
            <span role="columnheader">Company</span>
            <span role="columnheader">Left out by</span>
            <span role="columnheader">Why not</span>
            <span role="columnheader">What Merlin does with it</span>
            <span role="columnheader">Change it</span>
          </div>
          {rows.map((o) => {
            const l = label(o);
            const you = o.by === "you";
            const w = you ? { why: OUT_WORDS[o.r as OutReason]?.t ?? "", did: OUT_WORDS[o.r as OutReason]?.did ?? "", act: "Bring it back" } : MERLIN_WHY[o.r] ?? MERLIN_WHY.limit;
            const why = o.r === "icp" && o.line ? `${w.why} ${o.line}.` : (o.r === "limit" || o.r === "held") && o.line ? `${o.band ?? ""} · ${o.line.split(" · ")[0]}. ${w.why}` : w.why;
            return (
              <div role="row" key={`${o.by}-${o.id}`} className="cb-out-row">
                <span role="cell">
                  {l.open ? (
                    <button type="button" className="cb-link" onClick={() => openCompany(o.id)}>
                      {l.name}
                    </button>
                  ) : (
                    <strong>{l.name}</strong>
                  )}
                  <span className="cb-muted">{l.facts}</span>
                </span>
                <span role="cell">
                  <strong>{you ? "You" : "Merlin"}</strong>
                  <span className="cb-muted">{dateWords(o.at.slice(0, 10), new Date().toISOString().slice(0, 10))}</span>
                </span>
                <span role="cell">{why}</span>
                <span role="cell">{w.did}</span>
                <span role="cell">
                  {w.act === "Bring it back" ? (
                    <button type="button" className="cb-btn" onClick={() => void onAct(o.id, "back")}>
                      Bring it back
                    </button>
                  ) : w.act === "Show it anyway" ? (
                    <button type="button" className="cb-btn" onClick={() => void onAct(o.id, "anyway")}>
                      Show it anyway
                    </button>
                  ) : w.act === "Change ideal client" ? (
                    <button type="button" className="cb-btn" onClick={onIcp}>
                      Change ideal client
                    </button>
                  ) : (
                    <span className="cb-muted">Back from tomorrow</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- the ideal client, inline ---------- */

const icpEmptyOf = (icp: Icp | null | undefined) => !icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);

/** "Function: Sales", "Industries: SaaS, Fintech", "Size: 11–50 to 201–500 people". */
function icpChips(icp: Icp | null | undefined, fn: string | null): string[] {
  const out: string[] = [];
  if (fn) out.push(`Function: ${fn}`);
  if (!icp) return out;
  out.push(icp.industries.length ? `Industries: ${icp.industries.join(", ")}` : "Any industry");
  out.push(icp.employees.length ? `Size: ${icp.employees.length === 1 ? icp.employees[0] : `${icp.employees[0]} to ${icp.employees[icp.employees.length - 1]}`} people` : "Any size");
  if (icp.countries.length) out.push(`Where: ${icp.countries.join(", ")}`);
  return out;
}

const START_FNS = FUNCTIONS.filter((f) => f !== "Other");
const START_INDUSTRIES = RN_INDUSTRIES.slice(0, 9);

/**
 * The ideal client, inline: what you do (one, only when it is missing), the industries you want and
 * the company sizes (both optional: none is any). Saving re-ranks the ball. With no ideal client yet
 * this is Getting started's step 1, open by default.
 */
function IcpEditor({ needFn, missing, onDone, onCancel }: { needFn: boolean; missing: boolean; onDone: () => void; onCancel: (() => void) | null }) {
  const ui = useUi();
  const me = ui.me;
  const [fn, setFn] = useState<string | null>(me.function && me.function !== "Other" ? me.function : null);
  const [ind, setInd] = useState<string[]>(me.icp?.industries ?? []);
  const [size, setSize] = useState<string[]>(me.icp?.employees ?? []);
  const [busy, setBusy] = useState(false);
  const industries = [...new Set([...START_INDUSTRIES, ...ind])];
  const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const save = async () => {
    if (!fn) return;
    setBusy(true);
    const icp: Icp = { industries: ind, employees: RN_EMPLOYEES.filter((x) => size.includes(x)), revenue: me.icp?.revenue ?? [], countries: me.icp?.countries ?? [] };
    const r = await ui.act({ type: "profile", function: fn, icp }, { quiet: true });
    setBusy(false);
    if (r.ok) onDone();
  };
  const chips = (label: string, note: string, all: string[], on: (x: string) => boolean, pick: (x: string) => void, one = false) => (
    <div className="cb-icp-g">
      <span className="cb-icp-l">
        <strong>{label}</strong> <span className="cb-muted">{note}</span>
      </span>
      <span className="cb-chips" role={one ? "radiogroup" : "group"} aria-label={label}>
        {all.map((x) =>
          one ? (
            <button key={x} type="button" role="radio" aria-checked={on(x)} className={`cb-pick${on(x) ? " on" : ""}`} onClick={() => pick(x)}>
              {x}
            </button>
          ) : (
            <button key={x} type="button" aria-pressed={on(x)} className={`cb-pick${on(x) ? " on" : ""}`} onClick={() => pick(x)}>
              {x}
            </button>
          ),
        )}
      </span>
    </div>
  );
  return (
    <section className="cb-icp" aria-labelledby="cb-icp-h">
      <div className="cb-icp-head">
        <h2 id="cb-icp-h">{missing ? "Step 1. Say who your ideal client is" : "Your ideal client"}</h2>
        <span className="cb-muted">
          {missing ? "About 2 minutes. It tunes Crystal Ball, Find and every list, and turns on the morning email. Until then the list below is any company." : "Change it and the list re-ranks. It also tunes Find and every list."}
        </span>
      </div>
      {(needFn || missing) && chips("What do you do?", "Pick one", START_FNS, (x) => fn === x, (x) => setFn(x), true)}
      {chips("Industries you want", "Optional. None is any.", industries, (x) => ind.includes(x), (x) => setInd(toggle(ind, x)))}
      {chips("Company size, in people", "Optional", RN_EMPLOYEES, (x) => size.includes(x), (x) => setSize(toggle(size, x)))}
      <div className="cb-icp-acts">
        <button type="button" className="btn btn-pine" disabled={!fn || busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? "Saving" : missing ? "Show my Crystal Ball" : "Save and re-rank"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="cb-muted">{fn ? `Function: ${fn} · ${ind.length ? plural(ind.length, "industry", "industries") : "any industry"} · ${size.length ? plural(size.length, "size") : "any size"}` : "Pick what you do first. The rest is optional."}</span>
      </div>
    </section>
  );
}
