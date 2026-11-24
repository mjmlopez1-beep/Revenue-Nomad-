"use client";

/**
 * Evidence Bank (?p=evidence, Close): the member's case studies, private to them. A two-column
 * table: column A the client company with its real name and logo (this page is the member's own,
 * so nothing is hidden here), column B that company's case studies as tiles (title, the result,
 * the role and dates). Click a tile and it opens into its form right where it is: change it, Save
 * or Cancel. "Add a case study" per company and at the top; a search box over the table.
 *
 * First visit (no case study ready): the wizard (Wizard.tsx), a step at a time, picking up where
 * it was left. "Build this for me" (BuildForMe.tsx) at the top and in the wizard: the member's own
 * Claude finds past engagements in their email and memory and saves them here, blanks marked,
 * each one "From Claude · review" until the member checks it.
 *
 * Whether the client's name goes into proposals and onto the Fractionals card is each case
 * study's own switch, off by default. On Free and Pro the page is the upgrade screen (Upgrade.tsx).
 * No export anywhere.
 */
import { ExportProof } from "../network/ExportPanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CompanyLogo, IconPlus, IconSearch, useToast } from "../../ui/shared";
import { ShellHeader } from "../shell/Header";
import { useApp } from "../shell/pages";
import { proposalWithCases } from "../WriteProposal";
import * as api from "./api";
import { BuildForMeButton, BuildForMePanel, useAgents } from "./BuildForMe";
import { CaseForm, CaseTile, blankStudy } from "./CaseTile";
import { onOpenEvidence, takeEvidenceSeat } from "./open";
import { seatLiteOf } from "./seatLite";
import { EvidenceUpgrade } from "./Upgrade";
import { Wizard } from "./Wizard";
import { companyName, companyRows, coverageOf, evidenceOpen, isFirstVisit, readResume, resumeAt, searchRows, wizKey, type CompanyRow, type WizResume } from "./evidenceModel";
import type { Study, TagCatalogue } from "./types";
import "./evidence.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const store = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* a private window keeps nothing: the wizard starts from the case study's answers instead */
    }
  },
};

export function EvidencePage() {
  const c = useApp();
  const open = evidenceOpen(c.me.plan);
  const header = (
    <ShellHeader
      crumbs={[
        { label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") },
        { label: "Evidence Bank", href: c.hrefOf("evidence"), go: () => c.openPage("evidence") },
      ]}
      title={open ? "Case studies" : "What it does"}
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

type Editing = { id: string } | { row: string; draft: Study } | null;

function Bank() {
  const c = useApp();
  const toast = useToast();
  const seats = useMemo(() => c.shell.seats.map(seatLiteOf), [c.shell.seats]);
  const memberKey = wizKey(c.me.id);

  const [cases, setCases] = useState<Study[] | null>(null);
  const [catalogue, setCatalogue] = useState<TagCatalogue>({ categories: [], tags: [] });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [q, setQ] = useState("");
  const [wiz, setWiz] = useState<{ start: WizResume | null } | null>(null);
  const [resume, setResume] = useState<WizResume | null>(null);
  const [bfm, setBfm] = useState(false);
  const { agents, checking, check } = useAgents();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const r = await api.bank();
    if (api.failed(r)) return setLoadErr(r.error);
    setLoadErr(null);
    setCases(r.cases);
    setCatalogue(r.tags);
    return r.cases;
  }, []);

  /* ----- landing: the wizard on a first visit (where it was left), a seat asked for from Your seats ----- */
  const [landed, setLanded] = useState(false);
  const openSeat = useCallback(
    async (seatId: string, list: Study[]) => {
      const had = list.find((x) => x.seatId === seatId);
      const r = had ?? (await api.draftFromSeat(seatId));
      if (api.failed(r)) return toast(r.error, true);
      if (!had) setCases((cs) => [r, ...(cs ?? []).filter((x) => x.id !== r.id)]);
      setWiz(null);
      setEditing({ id: r.id });
      setTimeout(() => document.querySelector(`[data-case="${r.id}"]`)?.scrollIntoView({ block: "center" }), 80);
    },
    [toast],
  );
  useEffect(() => {
    if (landed) return;
    setLanded(true);
    void (async () => {
      const list = await load();
      if (!list) return;
      const seat = takeEvidenceSeat();
      if (seat) return void openSeat(seat, list);
      const kept = readResume(store.get(memberKey));
      const first = isFirstVisit(list);
      const at = resumeAt(kept, list, first);
      if (first && store.get(`${memberKey}:skip`) !== "1") setWiz({ start: at });
      else if (at) setResume(at);
    })();
  }, [landed, load, memberKey, openSeat]);
  useEffect(() => onOpenEvidence((id) => id && cases && void openSeat(id, cases)), [cases, openSeat]);
  // Case studies the member's agent saved (Build this for me, save_evidence_case) arrive while they
  // were in Claude: coming back to this tab reads the bank again, so the table and the count move.
  useEffect(() => {
    const back = () => document.visibilityState === "visible" && !editing && !wiz && void load();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => (document.removeEventListener("visibilitychange", back), window.removeEventListener("focus", back));
  }, [load, editing, wiz]);

  const put = (x: Study) => {
    const wasReady = (cases ?? []).some((y) => y.status === "ready");
    setCases((cs) => [x, ...(cs ?? []).filter((y) => y.id !== x.id)]);
    // The first ready case study finishes Getting started's step 6.
    if (!wasReady && x.status === "ready") void c.refresh();
  };
  const onWizStep = (at: WizResume | null) => store.set(memberKey, at ? JSON.stringify(at) : null);
  const closeWiz = () => {
    setWiz(null);
    const kept = readResume(store.get(memberKey));
    setResume(cases ? resumeAt(kept, cases, false) : null);
    if (cases && isFirstVisit(cases)) store.set(`${memberKey}:skip`, "1");
  };
  const openWiz = (start: WizResume | null = null) => {
    setEditing(null);
    setResume(null);
    setWiz({ start });
    setTimeout(() => document.querySelector(".ev-wiz")?.scrollIntoView({ block: "start" }), 60);
  };
  const openBfm = () => {
    setBfm(true);
    void check();
  };
  const addAt = async (r: CompanyRow) => {
    setWiz(null);
    if (r.seat && !r.cases.length) return openSeat(r.seat.id, cases ?? []);
    const f = r.cases[0];
    setEditing({ row: r.key, draft: blankStudy({ name: r.name, companyId: r.logoId, industry: f?.industry ?? r.seat?.industry, size: f?.size ?? r.seat?.size, revenue: f?.revenue ?? r.seat?.revenue, role: f?.role ?? r.seat?.role }) });
  };

  if (!cases)
    return (
      <div className="ev">
        {loadErr ? (
          <div className="ev-loaderr">
            <p className="ev-err" role="alert">
              {loadErr}
            </p>
            <button type="button" className="btn" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="ev-loading" role="status" aria-busy>
            Loading your case studies
          </div>
        )}
      </div>
    );

  const rows = companyRows(cases, seats);
  const shown = searchRows(rows, q);
  const review = cases.filter((x) => x.review).length;
  const blanks = cases.filter((x) => !x.review && x.blanks.length).length;
  const withCases = rows.filter((r) => r.cases.length).length;
  const cover = coverageOf(cases, catalogue);
  const resumeCase = resume ? cases.find((x) => x.id === resume.caseId) : null;
  const bfmPanel = bfm && (
    <BuildForMePanel agents={agents} origin={origin} onRecheck={() => void check()} checking={checking} onClose={() => setBfm(false)} onAgentAccess={() => c.openPage("agent")} agentHref={c.hrefOf("agent")} />
  );
  const done = (x: Study, msg: string) => {
    put(x);
    setEditing(null);
    toast(msg);
  };

  return (
    <div className={`ev${c.phone ? " ev-phone" : ""}`}>
      <h1 className="sr-only">Evidence Bank: your case studies</h1>
      <div className="ev-top">
        <p className="ev-lead">
          Every client you did great work for, what you did and what changed. Private to you. Merlin puts the closest case study into the Proof part of your proposals.
        </p>
        <div className="ev-top-actions">
          <BuildForMeButton onOpen={openBfm} quiet={!!wiz} />
          {!wiz && (
            <button type="button" className="btn ev-add-top" onClick={() => openWiz()}>
              <IconPlus size={14} /> Add a case study
            </button>
          )}
        </div>
      </div>
      {!wiz && bfmPanel}
      {(review > 0 || blanks > 0) && !wiz && (
        <p className="ev-note" role="status">
          {review > 0 && `${plural(review, "case study", "case studies")} from ${cases.find((x) => x.review)?.from || "your agent"} to review. `}
          {blanks > 0 && `${plural(blanks, "case study", "case studies")} with blanks to fill. `}
          Open one to check it. They go into proposals once you save them.
        </p>
      )}
      {resume && resumeCase && !wiz && (
        <div className="ev-resume" role="note">
          <span>
            <strong>Pick up where you left off.</strong> {resumeCase.client.name || "A client"}, step {resume.step + 1} of 4.
          </span>
          <button type="button" className="btn btn-sm btn-pine" onClick={() => openWiz(resume)}>
            Continue
          </button>
          <button type="button" className="ev-link" onClick={() => (setResume(null), store.set(memberKey, null))}>
            Not now
          </button>
        </div>
      )}
      {wiz && (
        <Wizard
          key={wiz.start?.caseId ?? "new"}
          seats={seats}
          cases={cases}
          catalogue={catalogue}
          start={wiz.start}
          onCase={put}
          onStep={onWizStep}
          onClose={closeWiz}
          first={isFirstVisit(cases)}
          buildForMe={
            <>
              <span className="ev-wiz-alt-t">Rather not type it all? Claude can look through your email and fill these in, leaving blanks for you.</span>
              <BuildForMeButton onOpen={openBfm} quiet />
              {bfmPanel}
            </>
          }
        />
      )}
      {(!wiz || cases.length > 0) && (
        <>
          <div className="ev-bar">
            <label className="ev-search">
              <IconSearch size={15} />
              <span className="sr-only">Search your case studies</span>
              <input type="search" value={q} maxLength={120} placeholder="Search by client, problem, result or tag" onChange={(e) => setQ(e.target.value)} />
            </label>
            <span className="ev-count num">
              {plural(withCases, "client")} · {plural(cases.length, "case study", "case studies")}
            </span>
            {cover.of > 0 && (
              <span className="ev-count num" data-coverage title={cover.covered.join(", ")}>
                · Covers {cover.n} of {cover.of} categories
              </span>
            )}
          </div>
          <div className="ev-table" role="table" aria-label="Your case studies by client">
            <div className="ev-thead" role="row">
              <span role="columnheader">Company</span>
              <span role="columnheader">Case studies</span>
            </div>
            {shown.map((r) => {
              const newHere = editing && "row" in editing && editing.row === r.key ? editing.draft : null;
              return (
                <div key={r.key} className="ev-row" role="row" data-company={r.key}>
                  <div className="ev-co" role="cell">
                    <CompanyLogo name={companyName(r)} domain={null} seed={r.logoId ?? undefined} hidden={!r.name} size="lg" />
                    <span className="ev-co-t">
                      <strong className="ev-co-name">{companyName(r)}</strong>
                      {r.facts && <span className="ev-co-sub">{r.facts}</span>}
                      <span className="ev-co-sub">{r.cases.length ? plural(r.cases.length, "case study", "case studies") : r.seat ? `Your seat: ${r.seat.role}` : "No case study yet"}</span>
                    </span>
                    <button type="button" className="ev-link ev-co-add" onClick={() => void addAt(r)} aria-label={`Add a case study at ${companyName(r)}`}>
                      <IconPlus size={13} /> Add a case study
                    </button>
                  </div>
                  <div className="ev-cases" role="cell">
                    <ul className="ev-tiles" aria-label={`Case studies at ${companyName(r)}`}>
                      {newHere && <CaseForm c={newHere} catalogue={catalogue} onCancel={() => setEditing(null)} onSaved={(x) => done(x, "Case study saved.")} onRemoved={() => setEditing(null)} onUse={null} />}
                      {r.cases.map((x) =>
                        editing && "id" in editing && editing.id === x.id ? (
                          <CaseForm
                            key={x.id}
                            c={x}
                            catalogue={catalogue}
                            onCancel={() => setEditing(null)}
                            onSaved={(y) => done(y, "Saved.")}
                            onRemoved={(id) => (setCases((cs) => (cs ?? []).filter((y) => y.id !== id)), setEditing(null), toast("The case study is removed. Proposals already sent keep what they said."))}
                            onUse={(id) => proposalWithCases(c, [id], null)}
                          />
                        ) : (
                          <CaseTile key={x.id} c={x} onOpen={() => (setWiz(null), setEditing({ id: x.id }))} />
                        ),
                      )}
                      {!r.cases.length && !newHere && (
                        <li className="ev-tile ev-tile-add">
                          <button type="button" className="ev-tile-btn" onClick={() => void addAt(r)}>
                            <strong className="ev-tile-title">Add a case study</strong>
                            <span className="ev-tile-meta">The company, your seat and the dates are filled in from your seat.</span>
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
            {!shown.length && (
              <div className="ev-empty" role="row">
                <span role="cell">{rows.length ? "Nothing matches that search." : "No case study yet. Add your first one, or let Claude build them for you."}</span>
                {rows.length ? (
                  <button type="button" className="btn btn-sm" onClick={() => setQ("")}>
                    Clear the search
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-pine" onClick={() => openWiz()}>
                    Add a case study
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="ev-foot">Private to you. Building a case study never costs credits. In a proposal the client reads as its industry and size unless you switch its name on.</p>
        </>
      )}
    </div>
  );
}
