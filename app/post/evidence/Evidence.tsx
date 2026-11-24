"use client";

/**
 * Evidence Bank (?p=evidence, the new look's page under Close; Evidence.dc.html): the member's
 * private library of case studies. A table (or cards) of their cases: title, the client (hidden by
 * default, with a reveal for their own eyes), industry and size, motion and who they sold to, the
 * problems solved and the type of work as chips, before and after, who they worked with, how many
 * proposals use it, and the opt-in "On my card". A case opens beside the table with all its fields
 * and "Use in a proposal"; filters by type of work and motion; "Match to a company" ranks the cases
 * for one company and adds a column. No export anywhere.
 *
 * First visit (step 6, no case ready yet): the build panel is open on a seat the member added, with
 * the size, industry and dates filled in, three questions (the problem, what you did, the numbers
 * before and after) and privacy said plainly. Two rows marked Example show a finished case; they are
 * never counted, selected, matched or sent.
 *
 * On Free and Pro the page is the upgrade screen (Upgrade.tsx). The data is Builder A's route
 * (app/api/evidence/route.ts) through api.ts; the rules are evidenceModel.ts.
 */
import { ExportProof } from "../network/ExportPanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevron, IconFilter, IconPlus, IconSearch, IconX, useToast } from "../../ui/shared";
import { shown as cellShown } from "../model";
import { ShellHeader } from "../shell/Header";
import { stripGone, useApp } from "../shell/pages";
import * as api from "./api";
import { Builder, buildHead } from "./Builder";
import { CasePanel, MatchPanel, type CaseTab, type MatchCo } from "./Panels";
import { onOpenEvidence, takeEvidenceSeat } from "./open";
import { proposalWithCases } from "../WriteProposal";
import { refreshEvidence } from "../useClosest";
import { seatLiteOf } from "./seatLite";
import { EvidenceUpgrade } from "./Upgrade";
import { catOf, workCats, type EvidenceCase, type EvidenceMatch } from "./types";
import {
  NO_FILTERS,
  SORT_WORDS,
  canReveal,
  catCount,
  clientWords,
  coverage,
  evidenceOpen,
  factsOf,
  fillLine,
  filterRows,
  isFirstVisit,
  isReady,
  matchCell,
  motionsOf,
  outcomesOf,
  ownRows,
  problemsOf,
  rowsOf,
  sizeWords,
  sortRows,
  statusLine,
  statusWord,
  subOf,
  tagsOf,
  titleOf,
  topOf,
  type EvFilters,
  type EvRow,
  type EvSort,
} from "./evidenceModel";
import "../workbench/workbench.css";
import "./evidence.css";

type Mode = "case" | "build" | "match" | null;
type Own = Exclude<EvRow, { kind: "example" }>;

export function EvidencePage() {
  const c = useApp();
  const open = evidenceOpen(c.me.plan);
  const header = (
    <ShellHeader
      crumbs={[
        { label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") },
        { label: "Evidence Bank", href: c.hrefOf("evidence"), go: () => c.openPage("evidence") },
      ]}
      title={open ? "Your case library" : "What it does"}
      phone={c.phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );
  if (!open)
    return (
      <>
        {header}
        <EvidenceUpgrade tier={c.me.plan?.tier ?? "free"} />
      </>
    );
  return (
    <>
      {header}
      <Bank />
      {/* The recommendations the member kept as proof from their own LinkedIn export (lib/linkedin, opt-in, Close). */}
      <div className="lx-proof-wrap">
        <ExportProof />
      </div>
    </>
  );
}

function Bank() {
  const c = useApp();
  const toast = useToast();
  const phone = c.phone;
  const seats = useMemo(() => c.shell.seats.map(seatLiteOf), [c.shell.seats]);

  const [cases, setCases] = useState<EvidenceCase[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [first, setFirst] = useState<boolean | null>(null);
  const [built, setBuilt] = useState(false);
  const [stripOff, setStripOff] = useState(-1);
  const [proposals, setProposals] = useState<api.ProposalLine[] | null>(null);

  const [view, setView] = useState<"table" | "cards">("table");
  const [names, setNames] = useState<Set<string>>(() => new Set());
  const [allNames, setAllNames] = useState(false);
  const [filters, setFilters] = useState<EvFilters>(NO_FILTERS);
  // Phones keep the filters folded: the cases come first there.
  const [filtOpen, setFiltOpen] = useState(!c.phone);
  const [sortPick, setSortPick] = useState<EvSort | null>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set());

  const [mode, setMode] = useState<Mode>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tab, setTab] = useState<CaseTab>("case");
  const [fresh, setFresh] = useState<string | null>(null);
  const [buildAt, setBuildAt] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);

  const [pick, setPick] = useState<MatchCo | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "ready" | "sel">("all");
  const [matching, setMatching] = useState<{ co: MatchCo; m: Map<string, EvidenceMatch> } | null>(null);
  const [running, setRunning] = useState(false);
  const [matchErr, setMatchErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.list();
    if (api.failed(r)) return setLoadErr(r.error);
    setLoadErr(null);
    setCases(r);
    setFirst((f) => (f === null ? isFirstVisit(r) : f));
  }, []);
  useEffect(() => {
    void reload();
    void api.proposals().then((p) => setProposals(api.failed(p) ? [] : p));
  }, [reload]);

  const rows = useMemo(() => (cases ? rowsOf(cases, seats, !!first) : []), [cases, seats, first]);
  const own = useMemo(() => ownRows(rows), [rows]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // Where the panel opens: a seat asked for (Your seats' Finish its evidence case), else the first draft on a first visit, else the first ready case.
  const landAt = useCallback(
    (seatId: string | null) => {
      if (!cases) return;
      const at = seatId ? own.find((r) => r.seat?.id === seatId) : null;
      const firstDraft = own.find((r) => !isReady(r));
      const target = at ?? (first ? firstDraft : own.find(isReady) ?? firstDraft) ?? null;
      setOpenKey(target?.key ?? null);
      // A phone opens on its list (a ready case opens when tapped); the first visit and a seat asked for open the builder.
      setMode(target ? (isReady(target) ? (c.phone && !at ? null : "case") : "build") : first ? "build" : null);
      setTab("case");
      setBuildAt(0);
    },
    [cases, own, first, c.phone],
  );
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!cases || landed) return;
    setLanded(true);
    landAt(takeEvidenceSeat());
  }, [cases, landed, landAt]);
  useEffect(() => onOpenEvidence((id) => landAt(id)), [landAt]);

  /* ----- companies to match ----- */
  const seatCos = useMemo(() => new Set(seats.map((s) => s.companyId)), [seats]);
  const coOf = useCallback((i: (typeof c.infos)[number]): MatchCo => {
    const ind = cellShown(i.c.cells.industry) ?? "";
    const facts = [ind, sizeWords({ size: cellShown(i.c.cells.employees) ?? "", revenue: cellShown(i.c.cells.revenue) ?? "" }), cellShown(i.c.cells.motion) ?? ""].filter(Boolean).join(" · ");
    return { id: i.c.id, name: i.c.hidden ? "Locked company" : i.c.name, sub: i.c.hidden ? `Locked · ${facts || "facts on file"}` : facts, locked: !!i.c.hidden };
  }, []);
  const cos = useMemo(() => {
    const pool = c.infos.filter((i) => !seatCos.has(i.c.id) && cellShown(i.c.cells.industry));
    const seen = [...pool.filter((i) => !i.c.hidden), ...pool.filter((i) => i.c.hidden)].slice(0, 3);
    return seen.map(coOf);
  }, [c.infos, seatCos, coOf]);
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return c.infos.filter((i) => !i.c.hidden && i.c.name.toLowerCase().includes(q)).slice(0, 5).map(coOf);
  }, [search, c.infos, coOf]);

  /* ----- the rows on screen ----- */
  const sort: EvSort = matching ? "match" : sortPick ?? (first ? "drafts" : "used");
  const vis = useMemo(() => sortRows(filterRows(rows, filters), sort, matching?.m), [rows, filters, sort, matching]);
  const top = matching ? topOf(matching.m) : null;
  const readyN = own.filter(isReady).length;
  const draftN = own.length - readyN;
  const selCases = own.filter((r): r is Extract<EvRow, { kind: "case" }> => r.kind === "case" && sel.has(r.c.id));
  const rankN = own.filter((r) => isReady(r) && (scope !== "sel" || (r.kind === "case" && sel.has(r.c.id)))).length;
  const nFilt = (filters.cat ? 1 : 0) + (filters.motion ? 1 : 0);
  const heads = fillLine(rows, matching ? (matching.co.locked ? "a locked company" : matching.co.name) : null, matching ? matching.m.size : 0);
  const cards = phone || view === "cards";
  const isShown = (r: EvRow) => canReveal(r) && (allNames || names.has(r.key));
  const won = (r: EvRow) => (r.kind === "case" ? r.c.usedIn.filter((id) => proposals?.find((p) => p.id === id)?.status === "signed").length : 0);

  const opened = openKey ? (byKey.get(openKey) as Own | undefined) ?? null : null;
  const draftSeats = own.filter((r) => r.kind === "seat").map((r) => r.seat!);
  const hero = !!first && !built && mode === "build";

  // A case saved here changes the closest cases other pages show (Companies, a company, Hiring now, Proof): they ask again.
  const put = (x: EvidenceCase) => (setCases((cs) => (cs ? (cs.some((y) => y.id === x.id) ? cs.map((y) => (y.id === x.id ? x : y)) : [x, ...cs]) : [x])), refreshEvidence());
  // On a phone the panel sits above the list: bring it into view when it opens.
  const toPanel = () => phone && setTimeout(() => document.querySelector(".ev-aside")?.scrollIntoView({ block: "start" }), 60);
  const openRow = (r: EvRow) => {
    if (r.kind === "example") return;
    toPanel();
    setOpenKey(r.key);
    setMode(isReady(r) ? "case" : "build");
    setTab("case");
    setBuildAt(0);
    setFresh(null);
    setRemoving(null);
  };
  const newCase = () => {
    const s = own.find((r) => r.kind === "seat") ?? own.find((r) => !isReady(r));
    setOpenKey(s?.key ?? null);
    setMode("build");
    setBuildAt(0);
    setFresh(null);
    toPanel();
  };
  const flipName = (r: EvRow) =>
    setNames((s) => {
      const n = new Set(s);
      if (allNames) {
        // From "all shown", hiding one hides the rest too: names stay a per-row choice.
        setAllNames(false);
        for (const x of own) if (canReveal(x) && x.key !== r.key) n.add(x.key);
        n.delete(r.key);
        return n;
      }
      if (n.has(r.key)) n.delete(r.key);
      else n.add(r.key);
      return n;
    });
  const flipCard = async (r: EvRow) => {
    if (r.kind !== "case") return;
    if (r.c.status !== "ready") return toast("Finish the case first. A draft never shows on your card.");
    const x = await api.card(r.c.id, !r.c.showOnCard);
    if (api.failed(x)) return toast(x.error, true);
    put({ ...r.c, showOnCard: !r.c.showOnCard });
  };
  const cardSel = async () => {
    const ready = selCases.filter((r) => r.c.status === "ready" && !r.c.showOnCard);
    for (const r of ready) {
      const x = await api.card(r.c.id, true);
      if (api.failed(x)) return toast(x.error, true);
      put({ ...r.c, showOnCard: true });
    }
    toast(ready.length ? `${ready.length} ${ready.length === 1 ? "case shows" : "cases show"} on your card now.` : "The selected cases are drafts or already on your card.");
  };
  const doRemove = async (r: Extract<EvRow, { kind: "case" }>) => {
    const x = await api.remove(r.c.id);
    if (api.failed(x)) return toast(x.error, true);
    setCases((cs) => (cs ?? []).filter((y) => y.id !== r.c.id));
    refreshEvidence();
    setRemoving(null);
    setMode(null);
    setOpenKey(null);
    toast("The case is removed. Proposals already sent keep what they said.");
  };
  const onSaved = (x: EvidenceCase, ready: boolean) => {
    put(x);
    const key = x.id;
    setOpenKey(key);
    if (ready) {
      setMode("case");
      setTab("case");
      setFresh(x.id);
      if (first && !built) (setBuilt(true), void c.refresh());
    } else toast("Saved as a draft. Its three questions wait for you here.");
  };

  /* ----- the strip (first visit) ----- */
  const stepN = c.start.six.steps.findIndex((s) => s.key === "evidence") + 1;
  const stage = built ? 1 : 0;
  const stripKey = stage ? "evidence-done" : "evidence";
  const showStrip = !!first && stripOff !== stage && !stripGone(c, stripKey);
  const s0 = own.find((r) => r.seat)?.seat;
  // The client stays hidden here too: the seat is named by its industry and dates.
  const s0Name = s0 ? `${s0.industry ? `${s0.industry} seat` : "first seat"}${s0.dates ? `, ${s0.dates.replace(/^Since /, "since ")},` : ""}` : null;
  const strip = showStrip && (
    <section aria-label="About this page" className={`wb-strip${stage ? " wb-strip-done" : ""}`}>
      {stage === 0 ? (
        <span className="wb-strip-t">
          <strong>What this page is for.</strong> Your private library of case studies. Write a case once, match it to any company, and Merlin puts the closest one in the Proof part of every proposal.{" "}
          {s0Name ? `Start in the outlined panel: your ${s0Name} is already half a case.` : "Add a seat you held in Seats and it starts a draft here, or write one from scratch."}
        </span>
      ) : (
        <>
          <span className="wb-strip-t">
            <strong>{stepN ? `Step ${stepN} done. ` : ""}Your first case is ready.</strong> It now fills the Proof part of your proposals. Next, see which companies it is closest to.
          </span>
          <button type="button" className="btn btn-pine" onClick={() => setMode("match")}>
            Match to a company
          </button>
          <a className="wb-strip-link" href={c.hrefOf("today")} onClick={(e) => (e.preventDefault(), c.openPage("today"))}>
            Back to Home
          </a>
        </>
      )}
      <button type="button" className="wb-iconbtn" aria-label="Dismiss" onClick={() => (setStripOff(stage), c.start.dismissStrip(stripKey))}>
        ×
      </button>
    </section>
  );

  /* ----- the panel ----- */
  const caseOpen = mode === "case" && opened?.kind === "case" ? opened : null;
  const head =
    mode === "match"
      ? { kicker: "Match · new column", title: "Match to a company", sub: "Merlin ranks your cases by how much each one looks like a company, and says why. The result is a column in this table." }
      : mode === "build"
        ? buildHead(opened, !!first && !built && readyN === 0)
        : caseOpen
          ? { kicker: `Case · ${caseOpen.c.status === "ready" ? "ready" : "draft"} · private`, title: caseOpen.c.title, sub: subOf(caseOpen) }
          : null;
  const panel = mode && head && (
    <aside key={`${mode}:${openKey ?? ""}`} className={`ev-aside${hero ? " ev-hero" : ""}`} aria-label={head.title}>
      <div className="ev-aside-head">
        <span className="ev-aside-t">
          <span className="ev-kicker">{head.kicker}</span>
          <strong>{head.title}</strong>
          <span className="ev-sub">{head.sub}</span>
        </span>
        <button type="button" className="wb-iconbtn" aria-label="Close this panel" onClick={() => (setMode(null), setRemoving(null))}>
          <IconX size={16} />
        </button>
      </div>
      {removing && caseOpen && removing === caseOpen.key && (
        <div className="ev-confirm" role="alertdialog" aria-label="Remove this case">
          <span>Remove this case from your library? Proposals already sent keep what they said. This can't be undone.</span>
          <button type="button" className="btn btn-sm btn-pine" onClick={() => void doRemove(caseOpen)}>
            Remove it
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRemoving(null)}>
            Keep it
          </button>
        </div>
      )}
      {mode === "build" && (
        <Builder
          key={`${opened?.key ?? "new"}:${buildAt}`}
          row={opened}
          others={draftSeats.filter((s) => s.id !== opened?.seat?.id)}
          onPick={(k) => setOpenKey(k)}
          onSaved={onSaved}
          onSeats={() => c.openSeats()}
          seatsHref={c.hrefOf("seats")}
          firstCase={!!first && readyN === 0}
          startAt={buildAt}
        />
      )}
      {caseOpen && (
        <CasePanel
          row={caseOpen}
          clientName={caseOpen.seat && !caseOpen.seat.hidden ? caseOpen.seat.company : caseOpen.c.clientName ?? null}
          shown={isShown(caseOpen)}
          onEye={canReveal(caseOpen) ? () => flipName(caseOpen) : null}
          tab={tab}
          setTab={setTab}
          fresh={fresh === caseOpen.c.id}
          proposals={proposals}
          cos={cos}
          onChange={put}
          onEdit={(at) => (setBuildAt(at ?? 0), setMode("build"), setFresh(null))}
          onMatch={() => setMode("match")}
          onRemove={() => setRemoving(caseOpen.key)}
          proposalHref={(id) => `/?p=proposals&pr=${encodeURIComponent(id)}`}
          openProposals={() => (caseOpen.c.status === "ready" ? proposalWithCases(c, [caseOpen.c.id], matching?.co.id) : c.openPage("proposals"))}
          fractionalsHref={c.hrefOf("fractionals")}
          openFractionals={() => c.openPage("fractionals")}
        />
      )}
      {mode === "match" && (
        <MatchPanel
          cos={cos}
          pick={pick ?? cos[0] ?? null}
          setPick={setPick}
          search={search}
          setSearch={setSearch}
          found={found}
          scope={scope}
          setScope={setScope}
          counts={{ all: own.length, ready: readyN, sel: selCases.length, rank: rankN }}
          onRun={() => runMatchWith(pick ?? cos[0] ?? null)}
          running={running}
          matching={!!matching}
          onRemove={() => (setMatching(null), setMode(null))}
          err={matchErr}
          companiesHref={c.hrefOf("table")}
          openCompanies={() => c.openPage("table")}
        />
      )}
    </aside>
  );
  // Run with the company on screen (the first suggestion when none was picked yet).
  function runMatchWith(co: MatchCo | null) {
    if (!co) return;
    if (!pick || pick.id !== co.id) setPick(co);
    void (async () => {
      setRunning(true);
      setMatchErr(null);
      const ids = own.filter((r): r is Extract<EvRow, { kind: "case" }> => r.kind === "case" && r.c.status === "ready" && (scope !== "sel" || sel.has(r.c.id))).map((r) => r.c.id);
      const r = await api.match(co.id, ids);
      setRunning(false);
      if (api.failed(r)) return setMatchErr(r.error);
      const m = new Map(r.filter((x) => ids.includes(x.caseId)).map((x) => [x.caseId, x]));
      setMatching({ co, m });
      setFilters((f) => ({ ...f, tab: "all" }));
      const best = own.find((x) => x.kind === "case" && x.c.id === topOf(m));
      if (best) (setOpenKey(best.key), setMode("case"), setTab("case"));
      else setMode(null);
    })();
  }

  /* ----- loading and errors ----- */
  if (!cases)
    return (
      <div className="wb ev">
        {loadErr ? (
          <div className="ev-loaderr">
            <p className="ev-err" role="alert">
              {loadErr}
            </p>
            <button type="button" className="btn" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="ev-loading" role="status" aria-busy>
            Loading your cases
          </div>
        )}
      </div>
    );

  /* ----- one row's cells ----- */
  const chips = (xs: string[], empty: string, hl?: string) =>
    xs.length ? (
      <span className="ev-chiprow">
        {xs.map((t) => (
          <span key={t} className={`ev-chip${hl && catOf(t) === hl ? " hl" : ""}`}>
            {t}
          </span>
        ))}
      </span>
    ) : (
      <span className="ev-muted">{empty}</span>
    );
  const clientCell = (r: EvRow) => {
    const [a, b] = clientWords(r, isShown(r));
    return (
      <span className="ev-clientcell">
        <span className="ev-two">
          <span className={isShown(r) ? "ev-ink" : undefined}>{a}</span>
          <span className="ev-sub">{b}</span>
        </span>
        {canReveal(r) && !allNames && (
          <button type="button" className="ev-eye" aria-label={`${isShown(r) ? "Hide" : "Show"} the client of ${titleOf(r)}`} onClick={(e) => (e.stopPropagation(), flipName(r))}>
            {isShown(r) ? "Hide" : "Show"}
          </button>
        )}
      </span>
    );
  };
  const usedCell = (r: EvRow) => {
    if (r.kind === "example") return <span className="ev-muted">Example</span>;
    const n = r.kind === "case" ? r.c.usedIn.length : 0;
    const w = won(r);
    return (
      <span className="ev-two">
        {n ? (
          <a href={c.hrefOf("proposals")} onClick={(e) => (e.preventDefault(), e.stopPropagation(), c.openPage("proposals"))}>
            {n} {n === 1 ? "proposal" : "proposals"}
          </a>
        ) : (
          <span className="ev-muted">Not used yet</span>
        )}
        {w > 0 && <span className="ev-sub">{w} won</span>}
      </span>
    );
  };
  const cardCell = (r: EvRow) =>
    r.kind === "case" ? (
      <button type="button" role="switch" aria-checked={r.c.showOnCard} aria-label={`Show on my card: ${titleOf(r)}`} className="ev-switch" onClick={(e) => (e.stopPropagation(), void flipCard(r))}>
        <span className="ev-track" aria-hidden>
          <span />
        </span>
        {r.c.showOnCard ? "Shown" : "Off"}
      </button>
    ) : null;
  const pill = (r: EvRow) => <span className={`ev-pill ev-pill-${statusWord(r).toLowerCase()}`}>{statusWord(r)}</span>;
  const outsCell = (r: EvRow, max: number) => {
    const o = outcomesOf(r);
    if (!o.length) return <span className="ev-muted">{isReady(r) || r.kind === "example" ? "No numbers" : "No numbers yet"}</span>;
    return (
      <span className="ev-outs-cell">
        {o.slice(0, max).map((x) => (
          <span key={x.k}>
            {x.k}: {x.before || "?"} to <strong>{x.after || "?"}</strong>
          </span>
        ))}
        {o.length > max && <span className="ev-sub">+ {o.length - max} more</span>}
      </span>
    );
  };
  const withOf = (r: EvRow): [string, string] => {
    if (r.kind === "example") return [r.x.value.workedWith, ""];
    if (r.kind === "case" && r.c.workedWith.length) return [r.c.workedWith[0].title, r.c.workedWith.length > 1 ? `and ${r.c.workedWith.length - 1} more` : ""];
    return [isReady(r) ? "Not on file" : "Not written yet", ""];
  };
  const check = (r: EvRow) =>
    r.kind === "case" ? (
      <button
        type="button"
        role="checkbox"
        aria-checked={sel.has(r.c.id)}
        aria-label={`Select ${titleOf(r)}`}
        className={`wb-check ev-check${sel.has(r.c.id) ? " on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setSel((s) => {
            const n = new Set(s);
            if (n.has(r.c.id)) n.delete(r.c.id);
            else n.add(r.c.id);
            return n;
          });
        }}
      >
        {sel.has(r.c.id) ? "✓" : ""}
      </button>
    ) : null;
  const titleBtn = (r: EvRow) =>
    r.kind === "example" ? (
      <strong className="ev-title-t">{titleOf(r)}</strong>
    ) : (
      <button type="button" className="ev-title-t ev-title-b" onClick={(e) => (e.stopPropagation(), openRow(r))}>
        {titleOf(r)}
      </button>
    );

  const table = (
    <div className="wb-scroll ev-scroll">
      <table className="wb-table ev-table">
        <thead>
          <tr className="wb-head">
            <th scope="col" className="wb-th-check">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="wb-th-n">
              #
            </th>
            {heads.map((h) => (
              <th key={h.key} scope="col" className={h.key === "match" ? "wb-th-fresh" : h.key === "client" ? "ev-td-client" : undefined}>
                {h.name}
              </th>
            ))}
          </tr>
          <tr className="wb-fill">
            <td />
            <td />
            {heads.map((h) => (
              <td key={h.key} className="wb-fill-td">
                {h.fill}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {first && rows.some((r) => r.kind === "example") && (
            <tr className="ev-exnote">
              <td colSpan={heads.length + 2}>
                {draftN ? `The ${draftN === 1 ? "draft row came from the seat" : `${draftN} draft rows came from the seats`} you added. ` : ""}The two rows marked Example show a finished case. They are not yours and never go in a proposal.
              </td>
            </tr>
          )}
          {vis.map((r, n) => {
            const f = factsOf(r);
            const m = matching && r.kind === "case" ? matching.m.get(r.c.id) : undefined;
            const mc = matchCell(r, m, r.kind === "case" && top === r.c.id);
            const on = r.key === openKey && mode !== "match" && mode !== null;
            return (
              <tr key={r.key} className={`${r.kind === "example" ? "ev-ex" : ""}${on ? " wb-on ev-open" : ""}${r.kind === "case" && sel.has(r.c.id) ? " wb-on" : ""}`} onClick={() => openRow(r)} data-kind={r.kind}>
                <td className="wb-td-check">{check(r)}</td>
                <td className="wb-td-n num">{n + 1}</td>
                <td className="ev-td-case">
                  {titleBtn(r)}
                  <span className="ev-sub">
                    {pill(r)} {subOf(r)}
                  </span>
                </td>
                {matching && (
                  <td>
                    <span className="ev-two">
                      <span className={mc.strong ? "ev-mword strong" : "ev-muted"}>{mc.word}</span>
                      {mc.why && <span className="ev-sub">{mc.why}</span>}
                    </span>
                  </td>
                )}
                <td className="ev-td-client">{clientCell(r)}</td>
                <td>
                  <span className="ev-two">
                    <span>{f.industry || "Not on file"}</span>
                    <span className="ev-sub">{sizeWords(f) || "Size not on file"}</span>
                  </span>
                </td>
                <td>
                  <span className="ev-two">
                    <span>{f.motion || "Not on file"}</span>
                    <span className="ev-sub">{f.soldTo ? `Sells to ${f.soldTo.toLowerCase()}` : ""}</span>
                  </span>
                </td>
                <td>{chips(problemsOf(r), isReady(r) || r.kind === "example" ? "None written" : "Not written yet")}</td>
                <td>{chips(tagsOf(r), isReady(r) || r.kind === "example" ? "Not tagged" : "Not tagged yet", filters.cat)}</td>
                <td>{outsCell(r, 2)}</td>
                <td>
                  <span className="ev-two">
                    <span>{withOf(r)[0]}</span>
                    {withOf(r)[1] && <span className="ev-sub">{withOf(r)[1]}</span>}
                  </span>
                </td>
                <td>{usedCell(r)}</td>
                <td>{cardCell(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const cardList = (
    <div className="ev-cards">
      {first && rows.some((r) => r.kind === "example") && <p className="ev-exnote-p">The two cases marked Example show a finished case. They are not yours and never go in a proposal.</p>}
      {vis.map((r) => {
        const f = factsOf(r);
        const [a, b] = clientWords(r, isShown(r));
        const m = matching && r.kind === "case" ? matching.m.get(r.c.id) : undefined;
        const mc = matchCell(r, m, r.kind === "case" && top === r.c.id);
        return (
          <article key={r.key} className={`ev-card${r.key === openKey && mode && mode !== "match" ? " on" : ""}${r.kind === "example" ? " ev-ex" : ""}`} data-kind={r.kind}>
            <div className="ev-card-top">
              {pill(r)}
              <span className="ev-sub">{subOf(r)}</span>
              <span className="wb-tb-sp" />
              {check(r)}
            </div>
            {titleBtn(r)}
            {matching && (
              <span className="ev-two">
                <span className={mc.strong ? "ev-mword strong" : "ev-muted"}>{mc.word}</span>
                {mc.why && <span className="ev-sub">{mc.why}</span>}
              </span>
            )}
            <div className="ev-card-client">
              <span>
                <strong>{a}</strong> · {b}
              </span>
              {canReveal(r) && !allNames && (
                <button type="button" className="ev-eye" aria-label={`${isShown(r) ? "Hide" : "Show"} the client of ${titleOf(r)}`} onClick={() => flipName(r)}>
                  {isShown(r) ? "Hide" : "Show"}
                </button>
              )}
            </div>
            {chips([f.industry, sizeWords(f), f.motion, f.soldTo ? `Sells to ${f.soldTo.toLowerCase()}` : ""].filter(Boolean), "Facts not on file")}
            <span className="ev-card-probs">{problemsOf(r).length ? `${problemsOf(r).join(". ")}.` : "Not written yet. Three questions, about 3 minutes."}</span>
            {outsCell(r, 3)}
            {chips(tagsOf(r), "Not tagged yet", filters.cat)}
            <div className="ev-card-foot">
              <span className="ev-sub">
                {withOf(r)[0]} · {r.kind === "case" ? (r.c.usedIn.length ? `${r.c.usedIn.length} ${r.c.usedIn.length === 1 ? "proposal" : "proposals"}` : "Not used yet") : r.kind === "example" ? "Example" : "Not used yet"}
              </span>
              {r.kind === "case" && (
                <button type="button" role="switch" aria-checked={r.c.showOnCard} aria-label={`Show on my card: ${titleOf(r)}`} className="ev-switch" onClick={() => void flipCard(r)}>
                  <span className="ev-track" aria-hidden>
                    <span />
                  </span>
                  On my card
                </button>
              )}
              {r.kind === "seat" && (
                <button type="button" className="btn btn-sm btn-pine" onClick={() => openRow(r)}>
                  Finish this case
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  const cov = coverage(rows);
  const usedAll = new Set(own.flatMap((r) => (r.kind === "case" ? r.c.usedIn : []))).size;
  const wonAll = own.reduce((n, r) => n + won(r), 0);
  const cover = [
    { k: "Type of work you can prove", big: `${cov.n} of ${cov.of} categories`, sub: cov.line, link: "See your card in Fractionals", go: () => c.openPage("fractionals"), href: c.hrefOf("fractionals") },
    matching
      ? { k: "Close to this company", big: `${[...matching.m.values()].filter((m) => m.label !== "Different").length} of ${matching.m.size} ${matching.m.size === 1 ? "case" : "cases"}`, sub: `Your cases matched to ${matching.co.locked ? "a locked company, by its facts" : matching.co.name}. Matching never costs a credit.`, link: "See Companies", go: () => c.openPage("table"), href: c.hrefOf("table") }
      : { k: "Companies with a close case", big: "Match a company", sub: "Pick any company, open or locked. Merlin says which of your cases is closest and why.", link: "See Companies", go: () => c.openPage("table"), href: c.hrefOf("table") },
    usedAll
      ? { k: "In your proposals", big: `${usedAll} ${usedAll === 1 ? "proposal" : "proposals"}${wonAll ? `, ${wonAll} won` : ""}`, sub: "Each proposal's Proof part carries the closest of your cases.", link: "See Proposals", go: () => c.openPage("proposals"), href: c.hrefOf("proposals") }
      : { k: "In your proposals", big: (proposals ?? []).length ? "Not in one yet" : "No proposal yet", sub: "When you draft one, Merlin puts your closest case in its Proof part.", link: "See Proposals", go: () => c.openPage("proposals"), href: c.hrefOf("proposals") },
  ];

  return (
    <div className={`wb ev${phone ? " ev-phone" : ""}`}>
      <h1 className="sr-only">Evidence Bank: your case library</h1>
      {strip}
      <div className="wb-toolbar" role="toolbar" aria-label="Your cases">
        <span className="wb-tb wb-tb-quiet ev-static num">
          {vis.length} of {rows.length} rows{first && rows.some((r) => r.kind === "example") ? " · 2 are examples" : ""}
        </span>
        <button type="button" className={`wb-tb${filtOpen ? " on" : ""}`} aria-expanded={filtOpen} onClick={() => setFiltOpen(!filtOpen)}>
          <IconFilter size={14} /> Filter · {nFilt}
        </button>
        <button type="button" className="wb-tb" onClick={() => (setMatching(null), setSortPick(sort === "new" ? (first ? "drafts" : "used") : "new"))}>
          {SORT_WORDS[sort]} <IconChevron size={12} dir="down" />
        </button>
        {!phone && (
          <span role="group" aria-label="Layout" className="ev-seg">
            {(["table", "cards"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} className={view === v ? "on" : undefined} onClick={() => setView(v)}>
                {v === "table" ? "Table" : "Cards"}
              </button>
            ))}
          </span>
        )}
        <button type="button" className={`wb-tb${allNames ? " on" : ""}`} aria-pressed={allNames} onClick={() => (setAllNames(!allNames), setNames(new Set()))}>
          {allNames ? "Client names: shown" : "Client names: hidden"}
        </button>
        <span className="wb-tb-sp" />
        <button type="button" className="wb-tb wb-tools-btn" onClick={() => setMode("match")}>
          Match to a company
        </button>
        <button type="button" className={`btn ${hero ? "btn-ghost ev-new-quiet" : "btn-pine"} ev-new`} onClick={newCase}>
          New case
        </button>
      </div>
      {filtOpen && (
        <div className="ev-filters" role="group" aria-label="Filter your cases">
          <span className="ev-k">Type of work</span>
          <button type="button" className={`ev-fchip${!filters.cat ? " on" : ""}`} aria-pressed={!filters.cat} onClick={() => setFilters({ ...filters, cat: "" })}>
            All
          </button>
          {workCats().map((k) => (
            <button key={k} type="button" className={`ev-fchip${filters.cat === k ? " on" : ""}`} aria-pressed={filters.cat === k} onClick={() => setFilters({ ...filters, cat: filters.cat === k ? "" : k })}>
              {k} <span className="ev-fn num">{catCount(rows, k)}</span>
            </button>
          ))}
          {motionsOf(rows).length > 0 && <span className="ev-k">Motion</span>}
          {motionsOf(rows).map((m) => (
            <button key={m} type="button" className={`ev-fchip${filters.motion === m ? " on" : ""}`} aria-pressed={filters.motion === m} onClick={() => setFilters({ ...filters, motion: filters.motion === m ? "" : m })}>
              {m}
            </button>
          ))}
          {nFilt > 0 && (
            <button type="button" className="ev-link" onClick={() => setFilters({ ...NO_FILTERS, q: filters.q })}>
              Clear
            </button>
          )}
        </div>
      )}
      <div className="wb-ask ev-ask">
        <label className="ev-askbox">
          <IconSearch size={16} />
          <span className="sr-only">Search your cases</span>
          <input type="search" placeholder="Search your cases: a problem, a type of work, an industry, a number" value={filters.q} maxLength={120} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        {cos[0] && readyN > 0 && !phone && (
          <button type="button" className="wb-askchip" onClick={() => runMatchWith(cos[0])}>
            Closest case for {cos[0].locked ? "a locked company" : cos[0].name}
          </button>
        )}
        <button type="button" className="wb-askchip" onClick={newCase}>
          Build a case from a seat
        </button>
      </div>
      {selCases.length > 0 && (
        <div className="wb-selbar" role="toolbar" aria-label="Actions for selected cases">
          <strong className="wb-sel-n">{selCases.length} selected</strong>
          <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => proposalWithCases(c, selCases.filter((r) => r.c.status === "ready").map((r) => r.c.id), matching?.co.id)}>
            Use in a new proposal
          </button>
          <button type="button" className="wb-sel-btn" onClick={() => (setScope("sel"), setMode("match"))}>
            Match to a company
          </button>
          <button type="button" className="wb-sel-btn" onClick={() => void cardSel()}>
            Show on my card
          </button>
          <button type="button" className="wb-sel-clear" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="wb-body ev-body">
        <section aria-label="Your cases" className="wb-main ev-mainsec">
          {vis.length ? (
            cards ? cardList : table
          ) : (
            <div className="wb-empty-list">
              <strong>{rows.length ? "No case fits these filters yet." : "No case yet."}</strong>
              <span>{rows.length ? "A draft counts once its three questions are answered." : "Add a seat you held in Seats and its draft starts here, or start one with New case."}</span>
              {rows.length > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => setFilters(NO_FILTERS)}>
                  Clear the filters
                </button>
              )}
            </div>
          )}
          <div role="group" aria-label="What your library covers" className="ev-cover">
            {cover.map((v) => (
              <div key={v.k} className="ev-cover-card">
                <span className="ev-k">{v.k}</span>
                <strong>{v.big}</strong>
                <span className="ev-sub">{v.sub}</span>
                <a href={v.href} onClick={(e) => (e.preventDefault(), v.go())}>
                  {v.link}
                </a>
              </div>
            ))}
          </div>
        </section>
        {panel}
      </div>
      <div className="wb-bottom">
        <div role="tablist" aria-label="Cases by status" className="wb-bottom-tabs">
          {(
            [
              ["all", `All cases · ${rows.length}`],
              ["ready", `Ready · ${readyN}`],
              ["draft", `${first ? "Drafts from your seats" : "Drafts"} · ${draftN}`],
            ] as [EvFilters["tab"], string][]
          ).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={filters.tab === k} className={`wb-btab${filters.tab === k ? " on" : ""}`} onClick={() => setFilters({ ...filters, tab: k })}>
              {t}
            </button>
          ))}
        </div>
        <button type="button" className="wb-btab wb-btab-add" onClick={newCase}>
          <IconPlus size={13} /> New case
        </button>
        <span className="wb-status" role="status" aria-live="polite">
          {statusLine(rows, !!first, matching ? (matching.co.locked ? "a locked company" : matching.co.name) : null, matching ? matching.m.size : 0)}
        </span>
      </div>
    </div>
  );
}
