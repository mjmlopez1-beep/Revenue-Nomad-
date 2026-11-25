"use client";

/**
 * Evidence Bank in the new design (RN_UI3; find-design/v5/work.html, Evidence Bank). Close (and the
 * trial); on Free and Pro, today's upgrade screen under the new band. The member's own page, so
 * clients show by name here, and only here. Nothing on it spends a credit, and nothing exports.
 *
 *   Relevant case study   pick a company from the pipeline; Merlin ranks the ready case studies
 *                         against it (POST /api/evidence op "match"): Same, Close or Different,
 *                         with what is the same and what differs. Words only, never a score.
 *                         Use in proposal starts one with that case (proposalWithCases).
 *   Seats to finish       past clients (the member's seats) with no case study yet; one tap starts
 *                         the draft from the seat (op "draftFromSeat").
 *   Case studies          the table: client, the story and its result, tags, status (Ready,
 *                         Draft, From Claude · review), Use in proposal and "..." (Edit, On my
 *                         card, Name the client in proposals, Remove). Tag chips and a search.
 *                         A row opens today's case form in a drawer.
 *   Add a case study      today's four-step wizard (Wizard.tsx), resumable; Build this for me,
 *                         today's panel (the member's own Claude, marked for review).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../../../ui/shared";
import { useApp } from "../../../shell/pages";
import { usePipeline } from "../../../pipelineStore";
import { proposalWithCases } from "../../../WriteProposal";
import { ExportProof } from "../../../network/ExportPanel";
import * as api from "../../../evidence/api";
import { BuildForMePanel, useAgents } from "../../../evidence/BuildForMe";
import { CaseForm } from "../../../evidence/CaseTile";
import { onOpenEvidence, takeEvidenceSeat } from "../../../evidence/open";
import { seatLiteOf } from "../../../evidence/seatLite";
import { EvidenceUpgrade } from "../../../evidence/Upgrade";
import { Wizard } from "../../../evidence/Wizard";
import { companyName, companyRows, evidenceOpen, isFirstVisit, readResume, resultLine, resumeAt, statusOf, titleOf, wizKey, type WizResume } from "../../../evidence/evidenceModel";
import type { Study, TagCatalogue } from "../../../evidence/types";
import type { RankedCase } from "@/lib/evidence/types";
import { Band, Chips, CoMark, Drawer, Failed, More, Skel, St, Switch, WorkMain, useCoFinder, type Tone } from "../parts";
import { WIc } from "../icons";
import "../../../evidence/evidence.css";
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
      /* a private window keeps nothing */
    }
  },
};
const TONE: Record<"ready" | "draft" | "review", Tone> = { ready: "forest", draft: "gold", review: "am" };
const BAND_CLS = { Same: "same", Close: "close", Different: "diff" } as const;

async function matchFor(companyId: string): Promise<{ cases: RankedCase[]; skipped: number } | { error: string }> {
  try {
    const r = await fetch("/api/evidence", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ op: "match", companyId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || "Merlin couldn't match your case studies. Try again." };
    return { cases: Array.isArray(j.cases) ? j.cases : [], skipped: Number(j.skipped) || 0 };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

export function Ui3Evidence() {
  const c = useApp();
  const open = evidenceOpen(c.me.plan);
  if (!open)
    return (
      <WorkMain group="Work" title="Evidence Bank" cls="w3-ev">
        <Band art="evidence" title="Evidence Bank." sub="Your proof, private to you: every client you did great work for, what you did and what changed." />
        <div className="w3-host w3-ev-up">
          <EvidenceUpgrade tier={c.me.plan?.tier ?? "free"} />
        </div>
      </WorkMain>
    );
  return (
    <WorkMain group="Work" title="Evidence Bank" cls="w3-ev">
      <Bank />
    </WorkMain>
  );
}

function Bank() {
  const c = useApp();
  const toast = useToast();
  const find = useCoFinder();
  const seats = useMemo(() => c.shell.seats.map(seatLiteOf), [c.shell.seats]);
  const memberKey = wizKey(c.me.id);
  const [cases, setCases] = useState<Study[] | null>(null);
  const [catalogue, setCatalogue] = useState<TagCatalogue>({ categories: [], tags: [] });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Study | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>("all");
  const [wiz, setWiz] = useState<{ start: WizResume | null } | null>(null);
  const [resume, setResume] = useState<WizResume | null>(null);
  const [bfm, setBfm] = useState(false);
  const { agents, checking, check } = useAgents();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const r = await api.bank();
    if (api.failed(r)) return setLoadErr(r.error), null;
    setLoadErr(null);
    setCases(r.cases);
    setCatalogue(r.tags);
    return r.cases;
  }, []);
  const openSeat = useCallback(
    async (seatId: string, list: Study[]) => {
      const had = list.find((x) => x.seatId === seatId);
      const r = had ?? (await api.draftFromSeat(seatId));
      if (api.failed(r)) return toast(r.error, true);
      if (!had) setCases((cs) => [r, ...(cs ?? []).filter((x) => x.id !== r.id)]);
      setWiz(null);
      setEditing(r);
    },
    [toast],
  );
  // Landing: a seat asked for from Your seats, else the wizard on a first visit (where it was left).
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => onOpenEvidence((id) => id && cases && void openSeat(id, cases)), [cases, openSeat]);
  // Back from Claude (Build this for me): read the bank again.
  useEffect(() => {
    let last = 0;
    const back = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      void load();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => (document.removeEventListener("visibilitychange", back), window.removeEventListener("focus", back));
  }, [load]);

  const put = (x: Study) => {
    const wasReady = (cases ?? []).some((y) => y.status === "ready");
    setCases((cs) => [x, ...(cs ?? []).filter((y) => y.id !== x.id)]);
    if (!wasReady && x.status === "ready") void c.refresh();
  };
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
    setTimeout(() => document.querySelector(".ev-wiz")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };
  const openBfm = () => (setBfm(true), void check());
  const setCard = async (x: Study, on: boolean) => {
    const r = await api.card(x.id, on);
    if (api.failed(r)) return toast(r.error, true);
    put({ ...x, showOnCard: on });
    toast(on ? "It shows on your Fractionals card." : "Taken off your Fractionals card.");
  };
  const setNamed = async (x: Study, on: boolean) => {
    const r = await api.save({ id: x.id, clientNamed: on });
    if (api.failed(r)) return toast(r.error, true);
    put(r);
    toast(on ? "Proposals name the client." : "Proposals describe the client by its industry and size.");
  };
  const remove = async (x: Study) => {
    if (!window.confirm("Remove this case study? Proposals already sent keep what they said.")) return;
    const r = await api.remove(x.id);
    if (api.failed(r)) return toast(r.error, true);
    setCases((cs) => (cs ?? []).filter((y) => y.id !== x.id));
    toast("The case study is removed.");
  };

  const bfmPanel = bfm && <BuildForMePanel agents={agents} origin={origin} onRecheck={() => void check()} checking={checking} onClose={() => setBfm(false)} onAgentAccess={() => c.openPage("agent")} agentHref={c.hrefOf("agent")} />;

  if (!cases)
    return (
      <>
        <Band art="evidence" title="Evidence Bank." sub="Your proof, private to you." />
        {loadErr ? <Failed what="Your case studies" error={loadErr} retry={() => void load()} /> : <Skel rows={4} />}
      </>
    );

  const ready = cases.filter((x) => statusOf(x).tone === "ready").length;
  const toFinish = cases.length - ready;
  const rows = companyRows(cases, seats);
  const unfinished = rows.filter((r) => r.seat && !r.cases.length);
  // Tag chips: the tags on file, most used first.
  const tagCount = new Map<string, number>();
  for (const x of cases) for (const t of x.workType) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  const needle = q.trim().toLowerCase();
  const shown = cases.filter((x) => (tag === "all" || x.workType.includes(tag)) && (!needle || `${x.client.name ?? ""} ${x.client.label} ${x.title} ${x.role} ${x.answers.problem} ${x.answers.numbers} ${x.workType.join(" ")}`.toLowerCase().includes(needle)));
  const resumeCase = resume ? cases.find((x) => x.id === resume.caseId) : null;
  const sub = cases.length ? `Your proof, private to you. ${plural(ready, "case study", "case studies")} ready for proposals${toFinish ? `, ${toFinish} to finish` : ""}.` : "Your proof, private to you. Merlin puts the closest case study into your proposals.";

  return (
    <>
      <Band art="evidence" title="Evidence Bank." sub={sub} />
      {ready > 0 && <Matcher cases={cases} />}
      {unfinished.length > 0 && !wiz && (
        <div className="ev-seats" role="note">
          <WIc n="flag" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{plural(unfinished.length, "past client")}</b> {unfinished.length === 1 ? "has" : "have"} no case study yet: {unfinished.slice(0, 2).map((r) => companyName(r)).join(" and ")}
            {unfinished.length > 2 ? ` and ${unfinished.length - 2} more` : ""}.
          </span>
          <button type="button" className="w-link ev3-gold" onClick={() => void openSeat(unfinished[0].seat!.id, cases)}>
            Finish {unfinished.length === 1 ? "its case study" : "their case studies"}
          </button>
        </div>
      )}
      {resume && resumeCase && !wiz && (
        <div className="ev-seats ev3-resume" role="note">
          <WIc n="clock" />
          <span style={{ flex: 1 }}>
            <b>Pick up where you left off.</b> {resumeCase.client.name || "A client"}, step {resume.step + 1} of 4.
          </span>
          <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => openWiz(resume)}>
            Continue
          </button>
          <button type="button" className="w-link" onClick={() => (setResume(null), store.set(memberKey, null))}>
            Not now
          </button>
        </div>
      )}
      {wiz && (
        <div className="w3-host ev3-wiz">
          <Wizard
            key={wiz.start?.caseId ?? "new"}
            seats={seats}
            cases={cases}
            catalogue={catalogue}
            start={wiz.start}
            onCase={put}
            onStep={(at) => store.set(memberKey, at ? JSON.stringify(at) : null)}
            onClose={closeWiz}
            first={isFirstVisit(cases)}
            buildForMe={
              <>
                <span className="ev-wiz-alt-t">Rather not type it all? Claude can look through your email and fill these in, leaving blanks for you.</span>
                <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={openBfm}>
                  <WIc n="spark" /> Build this for me
                </button>
                {bfmPanel}
              </>
            }
          />
        </div>
      )}
      <div className="w-row ev3-head">
        <h2 className="m-h2" style={{ fontSize: 26 }}>
          Case studies
        </h2>
        <span className="w-sp" />
        {cases.length > 0 && (
          <label className="w-search">
            <WIc n="search" />
            <input type="search" value={q} maxLength={120} placeholder="Search case studies" aria-label="Search case studies" onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={openBfm}>
          <WIc n="spark" /> Build this for me
        </button>
        {!wiz && (
          <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => openWiz()}>
            <WIc n="plus" /> Add a case study
          </button>
        )}
      </div>
      {!wiz && bfmPanel && <div className="w3-host ev3-bfm">{bfmPanel}</div>}
      {tags.length > 0 && <Chips items={[{ k: "all", label: "All", n: cases.length }, ...tags.map(([t, n]) => ({ k: t, label: t, n }))]} on={tag} set={setTag} label="Tags" />}
      {!cases.length ? (
        <div className="pr3-empty ev3-empty">
          <b className="w-h4">No case study yet</b>
          <p className="w-help">Add your first one in four short steps, or let your own Claude build them from your email, marked for you to review. Building a case study never costs credits.</p>
        </div>
      ) : (
        <div className="m-table ev-table" role="table" aria-label="Your case studies">
          <div className="m-thead" role="row">
            <span role="columnheader">Client</span>
            <span role="columnheader">The story</span>
            <span role="columnheader">Tags</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">
              <span className="w-sr">Actions</span>
            </span>
          </div>
          {shown.map((x) => {
            const st = statusOf(x);
            const nm = x.client.name || x.client.label || "Client company";
            const res = resultLine(x);
            return (
              <div key={x.id} className="m-tr" role="row" tabIndex={0} data-case={x.id} onClick={() => (setWiz(null), setEditing(x))} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setEditing(x)}>
                <div className="m-co" role="cell">
                  <CoMark i={find(x.companyId, x.client.name)} name={nm} s={42} />
                  <div style={{ minWidth: 0 }}>
                    <div className="m-name">
                      <span>{nm}</span>
                    </div>
                    <small>{[x.role, x.dates].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>
                <div role="cell" style={{ minWidth: 0 }}>
                  <div className="ev-title">{titleOf(x)}</div>
                  {res && <div className="ev-result">{res}</div>}
                </div>
                <div className="ev-tags m-ph-hide" role="cell">
                  {x.workType.slice(0, 2).map((t) => (
                    <span key={t} className="m-chip soft">
                      {t}
                    </span>
                  ))}
                  {x.workType.length > 2 && <span className="m-small">+{x.workType.length - 2}</span>}
                </div>
                <span role="cell" className="ev3-st">
                  <St tone={TONE[st.tone]}>{st.word}</St>
                </span>
                <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="m-btn m-btn-sm m-btn-secondary" disabled={st.tone !== "ready"} title={st.tone !== "ready" ? "Finish it first: a proposal uses ready case studies" : undefined} onClick={() => proposalWithCases(c, [x.id], null)}>
                    Use in proposal
                  </button>
                  <More
                    label={`More for ${nm}`}
                    items={() => [
                      { t: "Edit", icon: "pen", go: () => setEditing(x) },
                      { t: x.showOnCard ? "Take it off my card" : "Show on my Fractionals card", icon: "user", sub: "The client stays hidden unless you name it", go: () => void setCard(x, !x.showOnCard) },
                      { t: x.client.named ? "Stop naming the client in proposals" : "Name the client in proposals", icon: "eye", sub: x.client.named ? "Proposals will say its industry and size" : "Off: proposals say its industry and size", go: () => void setNamed(x, !x.client.named) },
                      "-",
                      { t: "Remove", icon: "trash", danger: true, go: () => void remove(x) },
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {!shown.length && (
            <p className="m-small" style={{ padding: 18 }}>
              Nothing matches.{" "}
              <button type="button" className="w-link" onClick={() => (setQ(""), setTag("all"))}>
                Show all
              </button>
            </p>
          )}
        </div>
      )}
      <p className="w-help ev3-foot">Private to you. Building a case study never costs credits. In a proposal the client reads as its industry and size unless you switch its name on.</p>
      <div className="w3-host ev3-proof">
        <ExportProof />
      </div>
      {editing && (
        <Drawer
          wide
          label={titleOf(editing)}
          onClose={() => setEditing(null)}
          head={
            <div className="w-row" style={{ gap: 14 }}>
              <CoMark i={find(editing.companyId, editing.client.name)} name={editing.client.name || editing.client.label} s={48} />
              <div style={{ minWidth: 0 }}>
                <h2 className="m-h3">{editing.client.name || editing.client.label || "Client company"}</h2>
                <p className="m-small">{[editing.role, editing.dates].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          }
        >
          <div className="w-row ev3-switches">
            <span style={{ flex: 1 }}>Name the client in proposals</span>
            <Switch sm on={editing.client.named} label="Name the client in proposals" set={(v) => void setNamed(editing, v).then(() => setEditing((e) => (e ? { ...e, client: { ...e.client, named: v } } : e)))} />
          </div>
          <div className="w-row ev3-switches">
            <span style={{ flex: 1 }}>Show on my Fractionals card</span>
            <Switch sm on={editing.showOnCard} label="Show on my Fractionals card" disabled={statusOf(editing).tone !== "ready"} set={(v) => void setCard(editing, v).then(() => setEditing((e) => (e ? { ...e, showOnCard: v } : e)))} />
          </div>
          <ul className="ev-tiles w3-host ev3-form">
            <CaseForm
              key={editing.id}
              c={editing}
              catalogue={catalogue}
              onCancel={() => setEditing(null)}
              onSaved={(y) => (put(y), setEditing(null), toast("Saved."))}
              onRemoved={(id) => (setCases((cs) => (cs ?? []).filter((y) => y.id !== id)), setEditing(null), toast("The case study is removed. Proposals already sent keep what they said."))}
              onUse={(id) => proposalWithCases(c, [id], null)}
            />
          </ul>
        </Drawer>
      )}
    </>
  );
}

/** Relevant case study: a company from the pipeline, and the ready case studies against it, in words. */
function Matcher({ cases }: { cases: Study[] }) {
  const c = useApp();
  const find = useCoFinder();
  const pipe = usePipeline(true).view;
  const options = useMemo(() => (pipe?.entries ?? []).filter((e) => e.name && !["lost", "notnow", "quiet", "won"].includes(e.stage)).map((e) => ({ id: e.company, name: e.name! })), [pipe]);
  const [co, setCo] = useState<string | null>(null);
  const pick = co ?? options[0]?.id ?? null;
  const [res, setRes] = useState<{ id: string; cases: RankedCase[]; skipped: number } | { id: string; error: string } | null>(null);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    void matchFor(pick).then((r) => live && setRes({ id: pick, ...r }));
    return () => {
      live = false;
    };
  }, [pick, cases.length]);
  const byId = new Map(cases.map((x) => [x.id, x]));
  const got = res && res.id === pick ? res : null;
  return (
    <section className="m-panel ev-match" aria-label="Relevant case study">
      <div className="ev-match-l">
        <span className="m-eyebrow am">
          <WIc n="spark" /> Relevant case study
        </span>
        <h2 className="m-h3 ev3-q">Which of your stories fits this client?</h2>
        {options.length ? (
          <label className="w-field">
            <span>For</span>
            <select className="w-sel" value={pick ?? ""} onChange={(e) => setCo(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="m-small">Matched on industry, stage, size and the problem. In words, never a score.</p>
      </div>
      <div className="ev-match-r">
        {!options.length ? (
          <div className="ev3-mnone">
            <p className="w-help">Add a company to your pipeline and Merlin shows which of your stories fits it, and why.</p>
            <button type="button" className="w-link" onClick={() => c.openPage("pipeline")}>
              Open your pipeline <WIc n="arrow" />
            </button>
          </div>
        ) : !got ? (
          <Skel rows={2} />
        ) : "error" in got ? (
          <p className="w-help">{got.error}</p>
        ) : !got.cases.length ? (
          <p className="w-help">No ready case study to match yet{got.skipped ? `: ${plural(got.skipped, "draft")} still to finish` : ""}.</p>
        ) : (
          got.cases.slice(0, 3).map((m) => {
            const x = byId.get(m.caseId);
            const nm = x?.client.name || x?.client.label || "Client company";
            return (
              <div key={m.caseId} className="ev-mrow">
                <CoMark i={x ? find(x.companyId, x.client.name) : null} name={nm} />
                <div style={{ minWidth: 0 }}>
                  <b>{nm}</b> <span className="m-small">· {m.title}</span>
                  <p className="ev-why">
                    {m.same.length ? `Same: ${m.same.join(", ")}.` : ""}
                    {m.diff.length ? <em> Different: {m.diff.join(", ")}.</em> : null}
                  </p>
                </div>
                <span className={`ev-band ${BAND_CLS[m.label]}`}>{m.label}</span>
                <button type="button" className={`m-btn m-btn-sm ${m.closest ? "m-btn-primary" : "m-btn-secondary"}`} onClick={() => proposalWithCases(c, [m.caseId], pick)}>
                  Use in proposal
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
