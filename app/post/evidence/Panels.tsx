"use client";

/**
 * The side panel's two other modes (Evidence.dc.html): a case, with its three tabs (The case,
 * Where it is used, Companies it fits) and "Use in a proposal"; and Match to a company, which ranks
 * the member's cases for one company and adds the match column to the table.
 *
 * Matching is free and words only ("Very close", what is the same, what is different), from the
 * company's free facts, so a locked company matches too and is described by its facts, never named.
 */
import { useEffect, useState } from "react";
import { IconLock } from "../../ui/shared";
import * as api from "./api";
import { catOf, tagGroups, type EvidenceCase, type EvidenceMatch } from "./types";
import { labelOf, matchWord, readsAs, type EvRow } from "./evidenceModel";

/** A company to match against: its name when the member can see it, else its facts. */
export interface MatchCo {
  id: string;
  name: string;
  sub: string;
  locked: boolean;
}

const Switch = ({ on, label, onFlip, busy }: { on: boolean; label: string; onFlip: () => void; busy?: boolean }) => (
  <button type="button" role="switch" aria-checked={on} className="ev-switch" disabled={busy} aria-busy={busy} onClick={onFlip}>
    <span className="ev-track" aria-hidden>
      <span />
    </span>
    {label}
  </button>
);

export type CaseTab = "case" | "use" | "fits";

export function CasePanel({
  row,
  clientName,
  shown,
  onEye,
  tab,
  setTab,
  fresh,
  proposals,
  cos,
  onChange,
  onEdit,
  onMatch,
  onRemove,
  proposalHref,
  openProposals,
  fractionalsHref,
  openFractionals,
}: {
  row: Extract<EvRow, { kind: "case" }>;
  clientName: string | null;
  shown: boolean;
  onEye: (() => void) | null;
  tab: CaseTab;
  setTab: (t: CaseTab) => void;
  fresh: boolean;
  proposals: api.ProposalLine[] | null;
  cos: MatchCo[];
  onChange: (c: EvidenceCase) => void;
  onEdit: (at?: number) => void;
  onMatch: () => void;
  onRemove: () => void;
  proposalHref: (id: string) => string;
  openProposals: () => void;
  fractionalsHref: string;
  openFractionals: () => void;
}) {
  const c = row.c;
  const s = row.seat;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fits, setFits] = useState<{ co: MatchCo; m: EvidenceMatch | null }[] | null>(null);

  useEffect(() => {
    if (tab !== "fits" || c.status !== "ready") return;
    let gone = false;
    setFits(null);
    void Promise.all(cos.slice(0, 3).map(async (co) => {
      const r = await api.match(co.id, [c.id]);
      return { co, m: api.failed(r) ? null : r.find((m) => m.caseId === c.id) ?? null };
    })).then((xs) => !gone && setFits(xs.sort((a, b) => rank(b.m) - rank(a.m))));
    return () => {
      gone = true;
    };
  }, [tab, c.id, c.status, cos]);

  const flipNamed = async () => {
    setBusy("named");
    setErr(null);
    const r = await api.save({ id: c.id, clientNamed: !c.clientNamed });
    setBusy(null);
    if (api.failed(r)) return setErr(r.error);
    onChange(r);
  };
  const flipCard = async () => {
    setBusy("card");
    setErr(null);
    const r = await api.card(c.id, !c.showOnCard);
    setBusy(null);
    if (api.failed(r)) return setErr(r.error);
    onChange({ ...c, showOnCard: !c.showOnCard });
  };
  const addTo = async (p: api.ProposalLine) => {
    setBusy(p.id);
    setErr(null);
    const r = await api.toProof(c.id, p.id);
    setBusy(null);
    if (api.failed(r)) return setErr(r.error);
    onChange(c.usedIn.includes(p.id) ? c : { ...c, usedIn: [...c.usedIn, p.id] });
  };

  const used = (proposals ?? []).filter((p) => c.usedIn.includes(p.id));
  const drafts = (proposals ?? []).filter((p) => p.status === "draft" && !c.usedIn.includes(p.id));
  const groups = tagGroups().map((g) => ({ cat: g.cat, tags: c.workType.filter((t) => catOf(t) === g.cat) })).filter((g) => g.tags.length);
  const own = c.workType.filter((t) => !catOf(t));
  if (own.length) groups.push({ cat: "Your own tags", tags: own });

  return (
    <>
      {fresh && (
        <div className="ev-fresh" role="status">
          <strong>Your case is ready.</strong> Merlin joined your answers into it. Check the numbers, and change anything with Edit.
        </div>
      )}
      <div role="tablist" aria-label="Case" className="ev-tabs">
        {(
          [
            ["case", "The case"],
            ["use", "Where it is used"],
            ["fits", "Companies it fits"],
          ] as [CaseTab, string][]
        ).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ev-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>
      {err && (
        <p className="ev-err" role="alert">
          {err}
        </p>
      )}
      {tab === "case" && (
        <div className="ev-tabbody">
          <div className="ev-client">
            <IconLock size={16} />
            <span className="ev-client-t">
              <span className="ev-k">Client · only you see this</span>
              <strong>{shown && clientName ? clientName : "Client hidden"}</strong>
              <span className="ev-sub">{c.clientNamed ? "Named in proposals" : `Reads as ${labelOf(c).charAt(0).toLowerCase()}${labelOf(c).slice(1)}`}</span>
            </span>
            {onEye && (
              <button type="button" className="ev-eye" aria-label={`${shown ? "Hide" : "Show"} the client of ${c.title}`} onClick={onEye}>
                {shown ? "Hide" : "Show"}
              </button>
            )}
          </div>
          <div className="ev-facts">
            {[
              ["Industry", c.industry],
              ["Company size", c.size ? `${c.size.replace(/–/g, " to ")} people` : ""],
              ["Revenue", c.revenue.replace(/–/g, " to ")],
              ["Go-to-market motion", c.motion],
              ["Sold to", c.soldTo],
              ["Hours", s?.hours ?? ""],
              ["Who you worked with", c.workedWith.map((w) => w.title).join(", ")],
            ].map(([k, v], n) => (
              <span key={k} className={`ev-fact${n === 6 ? " wide" : ""}`}>
                <span className="ev-k">{k}</span>
                <span>{v || "Not on file"}</span>
              </span>
            ))}
          </div>
          <div className="ev-sec">
            <span className="ev-k">Problems solved</span>
            {c.problems.length ? (
              <ul className="ev-probs">
                {c.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <span className="ev-sub">Not written yet</span>
            )}
            {c.text && <p className="ev-did">What you did: {c.text}</p>}
          </div>
          <div className="ev-sec">
            <span className="ev-k">Type of work</span>
            {groups.length ? (
              groups.map((g) => (
                <span key={g.cat} className="ev-group">
                  <span className="ev-group-t">{g.cat}</span>
                  {g.tags.map((t) => (
                    <span key={t} className="ev-tag on">
                      {t}
                    </span>
                  ))}
                </span>
              ))
            ) : (
              <span className="ev-sub">Not tagged yet</span>
            )}
            <button type="button" className="ev-link" onClick={() => onEdit(1)}>
              Add a tag
            </button>
          </div>
          <div className="ev-sec">
            <span className="ev-k">Before and after</span>
            {c.outcomes.length ? (
              <div className="ev-outgrid">
                {c.outcomes.map((o) => (
                  <span key={o.k} className="ev-outcard">
                    <span className="ev-k">{o.k}</span>
                    <span>Before {o.before || "not measured"}</span>
                    <strong>After {o.after || "not measured"}{o.unit ? ` ${o.unit}` : ""}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <span className="ev-sub">No numbers yet. Only numbers you type go in.</span>
            )}
          </div>
          <span className="ev-sub">Written by you. Merlin joins your answers with a template, and never adds a number.</span>
        </div>
      )}
      {tab === "use" && (
        <div className="ev-tabbody">
          <div className="ev-sec ev-reads">
            <span className="ev-k">How it reads in the Proof part</span>
            <p>{c.reads || readsAs(c, clientName)}</p>
            <Switch on={c.clientNamed} busy={busy === "named"} label={c.clientNamed ? "The client is named in proposals" : "The client name is kept out"} onFlip={() => void flipNamed()} />
            <span className="ev-sub">Off by default. Turn it on only when the client has said yes.</span>
          </div>
          <span className="ev-sub">Merlin puts 1 or 2 cases in a Proof part, the closest by problem. You can change them in the proposal.</span>
          <div className="ev-sec">
            <span className="ev-k">{c.usedIn.length ? `Used in ${c.usedIn.length} ${c.usedIn.length === 1 ? "proposal" : "proposals"}` : "Not used in a proposal yet"}</span>
            {proposals === null && <span className="ev-sub">Loading your proposals</span>}
            {used.map((p) => (
              <a key={p.id} className="ev-prop" href={proposalHref(p.id)}>
                <strong>{p.title || p.company || "A proposal"}</strong>
                <span className="ev-sub">{STATUS[p.status] ?? p.status}</span>
              </a>
            ))}
            {drafts.slice(0, 4).map((p) => (
              <div key={p.id} className="ev-prop">
                <span>
                  <strong>{p.title || p.company || "A draft proposal"}</strong>
                  <span className="ev-sub">Draft</span>
                </span>
                <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === p.id} onClick={() => void addTo(p)}>
                  Add to Proof
                </button>
              </div>
            ))}
            {proposals && !used.length && !drafts.length && <span className="ev-sub">No draft proposal is open. Start a new one and Merlin offers this case for its Proof part.</span>}
          </div>
          <div className="ev-sec">
            <Switch on={c.showOnCard} busy={busy === "card"} label={c.showOnCard ? "Shown on my card" : "Show on my card"} onFlip={() => void flipCard()} />
            <span className="ev-sub">
              Your choice, off until you turn it on. On your card in{" "}
              <a href={fractionalsHref} onClick={(e) => (e.preventDefault(), openFractionals())}>
                Fractionals
              </a>
              , members see the title, the type of work and the numbers. The client stays hidden unless you named it.
            </span>
          </div>
        </div>
      )}
      {tab === "fits" && (
        <div className="ev-tabbody">
          <span className="ev-k">How close it is to companies you might pitch. Locked companies show by their facts</span>
          {c.status !== "ready" && <span className="ev-sub">Finish the case to match it.</span>}
          {c.status === "ready" && fits === null && <span className="ev-sub">Matching</span>}
          {fits?.map(({ co, m }) => (
            <div key={co.id} className="ev-fit">
              <span className="ev-fit-h">
                <strong>{co.locked ? <span className="ev-locked">Locked company</span> : co.name}</strong>
                <span className={`ev-mword${m && m.label !== "Different" ? " strong" : ""}`}>{matchWord(m ?? undefined, false)}</span>
              </span>
              <span className="ev-sub">{co.sub}</span>
              {m && m.same.length > 0 && (
                <span>
                  <strong>Same:</strong> {m.same.join(", ")}
                </span>
              )}
              {m && m.diff.length > 0 && (
                <span>
                  <strong>Different:</strong> {m.diff.join(", ")}
                </span>
              )}
              {!m && <span className="ev-sub">Not matched. Try again in a moment.</span>}
            </div>
          ))}
          {c.status === "ready" && fits && !fits.length && <span className="ev-sub">Open a company in Companies and it shows here.</span>}
          <button type="button" className="btn btn-sm" onClick={onMatch}>
            Rank all your cases for one company
          </button>
        </div>
      )}
      <div className="ev-panel-foot">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit()}>
          Edit
        </button>
        <button type="button" className="btn btn-ghost ev-remove" onClick={onRemove}>
          Remove
        </button>
        <span className="wb-tb-sp" />
        {tab === "use" ? (
          <button type="button" className="btn btn-pine" onClick={openProposals}>
            Start a new proposal
          </button>
        ) : (
          <button type="button" className="btn btn-pine" onClick={() => setTab("use")}>
            Use in a proposal
          </button>
        )}
      </div>
    </>
  );
}

const STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", viewed: "Opened", client_signed: "Signed by the client", signed: "Signed · won", declined: "Declined", void: "Voided", expired: "Link ended" };
const rank = (m: EvidenceMatch | null) => (m ? (m.label === "Same" ? 3 : m.label === "Close" ? 2 : 1) * 10 + m.same.length : 0);

export function MatchPanel({
  cos,
  pick,
  setPick,
  search,
  setSearch,
  found,
  scope,
  setScope,
  counts,
  onRun,
  running,
  matching,
  onRemove,
  err,
  companiesHref,
  openCompanies,
}: {
  cos: MatchCo[];
  pick: MatchCo | null;
  setPick: (co: MatchCo) => void;
  search: string;
  setSearch: (s: string) => void;
  found: MatchCo[];
  scope: "all" | "ready" | "sel";
  setScope: (s: "all" | "ready" | "sel") => void;
  counts: { all: number; ready: number; sel: number; rank: number };
  onRun: () => void;
  running: boolean;
  matching: boolean;
  onRemove: () => void;
  err: string | null;
  companiesHref: string;
  openCompanies: () => void;
}) {
  const radio = (on: boolean, name: string, sub: string, go: () => void, key: string, locked = false) => (
    <button key={key} type="button" role="radio" aria-checked={on} className={`ev-radio${on ? " on" : ""}`} onClick={go}>
      <span className="ev-dot" aria-hidden />
      <span className="ev-radio-t">
        <strong>{locked ? <span className="ev-locked">Locked company</span> : name}</strong>
        {sub && <span className="ev-sub">{sub}</span>}
      </span>
    </button>
  );
  const list = [...cos, ...found.filter((f) => !cos.some((x) => x.id === f.id))];
  return (
    <div className="ev-match">
      <div role="radiogroup" aria-label="Company to match" className="ev-sec">
        <span className="ev-k">Which company</span>
        {list.map((co) => radio(pick?.id === co.id, co.name, co.sub, () => setPick(co), co.id, co.locked))}
        {pick && !list.some((x) => x.id === pick.id) && radio(true, pick.name, pick.sub, () => {}, pick.id, pick.locked)}
        <label className="ev-search">
          <span className="sr-only">Find a company you can see by name</span>
          <input className="input" placeholder="Find another company by name" value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <a className="ev-link" href={companiesHref} onClick={(e) => (e.preventDefault(), openCompanies())}>
          Pick another company in Companies
        </a>
      </div>
      <div role="radiogroup" aria-label="Cases to rank" className="ev-sec">
        <span className="ev-k">Run it on</span>
        {(
          [
            ["all", counts.all === 1 ? "The 1 case" : `All ${counts.all} cases`],
            ["ready", `Ready cases only (${counts.ready})`],
            ["sel", `Selected cases (${counts.sel})`],
          ] as ["all" | "ready" | "sel", string][]
        ).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={scope === k} className={`ev-radio${scope === k ? " on" : ""}`} onClick={() => setScope(k)}>
            <span className="ev-dot" aria-hidden />
            <span className="ev-radio-t">{t}</span>
            <span className="ev-free">Free</span>
          </button>
        ))}
      </div>
      <div className="ev-sec ev-total">
        <strong>
          {counts.rank} {counts.rank === 1 ? "case" : "cases"} to rank · free
        </strong>
        <span className="ev-sub">
          {counts.rank === 0
            ? scope === "sel"
              ? "No finished case is selected. Tick cases in the table, or run it on all."
              : "Your cases are still drafts. Finish one and the ranking fills in. Matching works on a locked company too, from its industry, size and how it sells."
            : "Matching never costs a credit. Drafts are skipped until their three questions are answered."}
        </span>
      </div>
      {err && (
        <p className="ev-err" role="alert">
          {err}
        </p>
      )}
      <div className="ev-panel-foot">
        {matching && (
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            Remove the column
          </button>
        )}
        <span className="ev-sub">Adds one column</span>
        <span className="wb-tb-sp" />
        <button type="button" className="btn btn-pine" disabled={!pick || counts.rank === 0 || running} aria-busy={running} onClick={onRun}>
          {running ? "Ranking" : "Run"}
        </button>
      </div>
    </div>
  );
}

