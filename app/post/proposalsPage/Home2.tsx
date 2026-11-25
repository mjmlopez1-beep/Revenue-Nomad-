"use client";

/**
 * Proposals on one screen (RN_PROPOSALS2, the owner's "10 times more simple"):
 *
 *   New proposal   one card: the member's recent calls (from Granola or Fathom, kept and refreshed in
 *                  the background on the server; "Draft ready" when one was drafted from that call
 *                  already) and the companies in their pipeline, each a one-tap start, and one search
 *                  box for either. Two quiet links under it: paste notes, start blank.
 *   Your proposals a short list with status, value and the next step, four filter chips.
 *
 * A tap opens the document at once (POST /api/proposals op "quick": no model, no call recorder on
 * that path), with the price worked out here by ONE calculation with "What should I charge"
 * (lib/proposals/rates.ts proposalRate on this member's own view). The editor then has Merlin write
 * only "What we heard" and "What I recommend".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { View } from "@/lib/tableTypes";
import type { MyTemplate, ProposalRec, ProposalsView } from "@/lib/proposals/types";
import type { HomeCall, HomeCompany, HomeView } from "@/lib/proposals/recent";
import type { QuickResult } from "@/lib/proposals/quick";
import { blanksOf, docFields, moneyOf } from "@/lib/proposals/library";
import { proposalRate } from "@/lib/proposals/rates";
import type { CoInfo } from "../model";
import { errorText } from "../../ui/shared";
import { useAppMaybe } from "../shell/pages";
import { Sheet } from "../ui";
import { StatusPill } from "./ProposalsHome";
import { api } from "../ProposalParts";
import { LearnTemplate } from "./LearnTemplate";
import "./proposalsPage.css";
import "./p2.css";

/** What the editor is told as a tapped proposal opens: when the tap was, and what Merlin's AI does next. */
export interface Launch {
  at: number;
  ai: QuickResult["ai"];
  prepared: boolean;
}

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "and")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
const when = (iso: string, nowMs = Date.now()) => {
  const d = new Date(iso);
  const day = Math.floor((new Date(nowMs).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return day <= 0 ? `Today, ${t}` : day === 1 ? `Yesterday, ${t}` : day < 7 ? `${d.toLocaleDateString("en-US", { weekday: "long" })}, ${t}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

type Filter = "all" | "needs" | "out" | "signed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs you" },
  { key: "out", label: "Out" },
  { key: "signed", label: "Signed" },
];
const inFilter = (p: ProposalRec, f: Filter) =>
  f === "all" || (f === "needs" ? p.status === "draft" || p.status === "client_signed" || p.status === "declined" : f === "out" ? p.status === "sent" || p.status === "viewed" : p.status === "signed" || p.status === "client_signed");

/** The next step on a row, in a few words. */
function nextOf(p: ProposalRec): { t: string; s: string; go: boolean } {
  if (p.status === "draft") {
    const n = blanksOf(p.blocks, docFields(p)).length;
    return { t: n ? `${n} ${n === 1 ? "thing" : "things"} to fill` : "Ready to send", s: `Edited ${dayOf(p.updatedAt)}`, go: true };
  }
  if (p.status === "client_signed") return { t: "Countersign", s: `Signed ${dayOf(p.send?.signedAt)}`, go: true };
  if (p.status === "viewed") return { t: "Follow up", s: `Sent ${dayOf(p.send?.sentAt)}`, go: true };
  if (p.status === "sent") return { t: "Waiting for them", s: `Sent ${dayOf(p.send?.sentAt)}`, go: false };
  if (p.status === "signed") return { t: "Signed", s: dayOf(p.send?.memberSignedAt ?? p.send?.signedAt), go: false };
  return { t: p.status === "declined" ? "They said no" : "Closed", s: dayOf(p.updatedAt), go: false };
}

export function Home2({
  data,
  view,
  infos,
  onOpen,
  onPut,
  onContracts,
  onTemplates,
  onLearned,
  closePrompt,
}: {
  data: ProposalsView;
  view: View;
  infos: CoInfo[];
  onOpen: (id: string, launch?: Launch) => void;
  onPut: (p: ProposalRec) => void;
  onContracts: () => void;
  onTemplates: () => void;
  /** Templates the member saved from a proposal they'd sent (LearnTemplate). */
  onLearned?: (t: MyTemplate[]) => void;
  closePrompt: React.ReactNode;
}) {
  const c = useAppMaybe();
  const [home, setHome] = useState<HomeView | null>(null);
  const [homeErr, setHomeErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState(false);
  const [paste, setPaste] = useState(false);
  const [learn, setLearn] = useState(false);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

  // The starts: what the server kept at once, then (a first open) the calls when the recorders answer.
  const loadHome = useCallback(async (wait: boolean) => {
    try {
      const r = await fetch(`/api/proposals?home=1${wait ? "&wait=1" : ""}`, { headers: { accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!live.current) return null;
      if (!r.ok) return setHomeErr(errorText(r.status, j.error, "Your calls didn't load.")), null;
      setHomeErr(null);
      setHome(j as HomeView);
      return j as HomeView;
    } catch {
      if (live.current) setHomeErr("We couldn't reach Merlin. Check your connection.");
      return null;
    }
  }, []);
  useEffect(() => {
    if (!data.canBuild) return;
    void (async () => {
      let h = await loadHome(false);
      for (let i = 0; i < 3 && h?.loading && live.current; i++) h = await loadHome(true);
      // Once the list is in, once more a moment later: the newest calls' readings ("Draft ready" and the terms) land in the background.
      if (h && !h.loading && h.calls.some((x) => !x.ready) && live.current) {
        await new Promise((r) => setTimeout(r, 2500));
        if (live.current) await loadHome(false);
      }
    })();
  }, [data.canBuild, loadHome]);

  /**
   * The price for a start: ONE calculation with What should I charge, on this member's own view. The
   * days a week only as the call said them: never carried over from an earlier proposal (a "40 hours a
   * week" from another deal priced a 2.5-day plan as full time). Unsaid, the document asks.
   */
  const rateFor = (companyId: string | null, terms?: HomeCall["terms"]) => {
    const allocation = terms?.allocation ?? "";
    const r = proposalRate(view, { company: { id: companyId }, fields: allocation ? { "pricing.allocation": allocation } : {}, callFee: terms?.fee ?? null });
    return { fee: r.fee, allocation: allocation || undefined };
  };

  const start = async (key: string, body: Record<string, unknown>) => {
    if (busy) return;
    const at = performance.now();
    setBusy(key);
    setErr(null);
    const r = await api<QuickResult>({ op: "quick", ...body });
    if (!live.current) return;
    setBusy(null);
    if (r.error) return setErr(r.error);
    onPut(r.proposal);
    onOpen(r.proposal.id, { at, ai: r.ai, prepared: r.prepared });
  };
  const tapCall = (x: HomeCall) =>
    x.draftId ? onOpen(x.draftId) : void start(x.key, { call: { recorder: x.recorder, id: x.id, companyId: x.company.id, who: x.who, when: x.when }, rate: rateFor(x.company.id, x.terms) });
  const tapCompany = (x: { id: string; draftId?: string | null }) => {
    if (x.draftId) return onOpen(x.draftId);
    // A recent call with this company: the start from that call (it has what they said).
    const call = home?.calls.find((k) => k.company.id === x.id && !k.draftId);
    if (call) return tapCall(call);
    void start(`co:${x.id}`, { companyId: x.id, rate: rateFor(x.id) });
  };

  const needle = q.trim().toLowerCase();
  const match = (...xs: (string | null | undefined)[]) => !needle || xs.some((t) => String(t ?? "").toLowerCase().includes(needle));
  const calls = (home?.calls ?? []).filter((x) => match(x.who?.name, x.who?.email, x.company.label));
  const companies = (home?.companies ?? []).filter((x) => match(x.label, x.to));
  // Searching: other companies the member can see, by name.
  const others: HomeCompany[] =
    needle.length >= 2
      ? infos
          .filter((i) => !i.c.hidden && i.c.name.toLowerCase().includes(needle) && !companies.some((k) => k.id === i.c.id))
          .slice(0, 4)
          .map((i) => ({ id: i.c.id, name: i.c.name, label: i.c.name, stage: "", to: null, draftId: null }))
      : [];
  const rows = data.proposals.filter((p) => inFilter(p, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, data.proposals.filter((p) => inFilter(p, f.key)).length])) as Record<Filter, number>;
  const shown = all ? rows : rows.slice(0, 6);
  const rec = home?.recorders ?? [];

  return (
    <div className="p2" data-p2>
      <div className="p2-head">
        <h1>Proposals</h1>
        <button type="button" className="tp-flink" onClick={onContracts}>
          Send a contract
        </button>
      </div>
      {!data.canBuild ? (
        closePrompt
      ) : (
        <section className="p2-new" aria-labelledby="p2-new-h">
          <div className="p2-new-h">
            <h2 id="p2-new-h">New proposal</h2>
            <span className="p2-pill">Ready in seconds</span>
          </div>
          <p className="p2-muted">Tap a call or a company. Merlin fills in your template, your rate and your case studies. You edit it, then send it.</p>
          <input className="input p2-search" type="search" placeholder="Find a call or a company" aria-label="Find a call or a company" value={q} onChange={(e) => setQ(e.target.value)} />
          {err && (
            <p className="pp-err" role="alert">
              {err}
            </p>
          )}
          <div className="p2-cols">
            <div>
              <h3 className="p2-k">{rec.length ? `Recent calls${rec.length === 1 ? ` from ${rec[0]}` : ""}` : "Recent calls"}</h3>
              {!home ? (
                <p className="p2-muted p2-wait">Looking at your calls.</p>
              ) : !rec.length ? (
                <p className="p2-muted">
                  Connect Granola or Fathom and your calls show here.{" "}
                  <a href={c?.hrefOf("integrations") ?? "/?p=integrations"} onClick={(e) => c && (e.preventDefault(), c.openPage("integrations"))}>
                    Connect
                  </a>
                </p>
              ) : home.loading ? (
                <p className="p2-muted p2-wait">{homeErr ?? `Looking at your calls in ${rec.join(" and ")}.`}</p>
              ) : !calls.length ? (
                <p className="p2-muted">{needle ? "No call matches." : `No calls in the last 14 days.`}</p>
              ) : (
                <ul className="p2-list" aria-label="Recent calls">
                  {calls.map((x) => (
                    <li key={x.key}>
                      <button type="button" className="p2-row" data-call={x.key} aria-busy={busy === x.key} disabled={!!busy} onClick={() => tapCall(x)}>
                        <span className="p2-ini" aria-hidden>
                          {initials(x.company.name ?? x.who?.name ?? x.company.label)}
                        </span>
                        <span className="p2-row-m">
                          <strong>{[x.who?.name || x.who?.email, x.company.name ?? x.company.label].filter(Boolean).join(" · ")}</strong>
                          <span className="p2-muted">
                            {when(x.when)}
                            {x.minutes ? ` · ${x.minutes} min` : ""}
                          </span>
                        </span>
                        {x.draftId ? <span className="p2-pill">Draft ready</span> : <span className="p2-go">{busy === x.key ? "Opening" : "Draft"}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="p2-k">Companies in your pipeline</h3>
              {!home ? (
                <p className="p2-muted p2-wait">Looking at your pipeline.</p>
              ) : !companies.length && !others.length ? (
                <p className="p2-muted">{needle ? "No company matches." : "No open deals yet. Search for a company above."}</p>
              ) : (
                <ul className="p2-list" aria-label="Companies">
                  {[...companies, ...others].map((x) => (
                    <li key={x.id}>
                      <button type="button" className="p2-row" data-company={x.id} aria-busy={busy === `co:${x.id}`} disabled={!!busy} onClick={() => tapCompany(x)}>
                        <span className="p2-ini" aria-hidden>
                          {initials(x.label)}
                        </span>
                        <span className="p2-row-m">
                          <strong>{x.label}</strong>
                          <span className="p2-muted">{[x.stage || "On Merlin", x.to].filter(Boolean).join(" · ")}</span>
                        </span>
                        {x.draftId ? <span className="p2-pill">Draft</span> : <span className="p2-go">{busy === `co:${x.id}` ? "Opening" : "Draft"}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="p2-links">
            <button type="button" className="tp-flink" onClick={() => setPaste(true)}>
              Paste notes
            </button>
            <button type="button" className="tp-flink" disabled={!!busy} onClick={() => void start("blank", { blank: true, rate: rateFor(null) })}>
              Start blank
            </button>
            <button type="button" className="tp-flink" onClick={onTemplates}>
              Templates
            </button>
            <button type="button" className="tp-flink" data-learn onClick={() => setLearn(true)}>
              Make a template from one you&#39;ve sent
            </button>
          </p>
        </section>
      )}

      <section className="p2-mine" aria-labelledby="p2-mine-h">
        <div className="p2-mine-h">
          <h2 id="p2-mine-h">Your proposals</h2>
          {data.proposals.length > 0 && (
            <div className="p2-filters" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className="p2-filter" aria-pressed={filter === f.key} onClick={() => (setFilter(f.key), setAll(false))}>
                  {f.label} {counts[f.key]}
                </button>
              ))}
            </div>
          )}
        </div>
        {!data.proposals.length ? (
          <p className="p2-muted">None yet. Your first one starts from a call above.</p>
        ) : (
          <ul className="p2-props">
            {shown.map((p) => {
              const n = nextOf(p);
              const fee = moneyOf(p.fields["pricing.monthlyFee"]);
              return (
                <li key={p.id}>
                  <button type="button" className="p2-prop" data-proposal={p.id} onClick={() => onOpen(p.id)}>
                    <span className="p2-ini" aria-hidden>
                      {initials(p.company.name || p.title)}
                    </span>
                    <span className="p2-row-m">
                      <strong>{p.company.name || "No company yet"}</strong>
                      <span className="p2-muted">{p.title}</span>
                    </span>
                    <StatusPill status={p.status} />
                    <span className="p2-val">{fee ? `$${fee.toLocaleString("en-US")}` : "Not set"}</span>
                    <span className="p2-next">
                      <strong data-go={n.go || undefined}>{n.t}</strong>
                      <span className="p2-muted">{n.s}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > shown.length && (
          <button type="button" className="tp-flink" onClick={() => setAll(true)}>
            Show all {rows.length}
          </button>
        )}
      </section>
      {learn && <LearnTemplate onClose={() => setLearn(false)} onSaved={(t) => (setLearn(false), onLearned?.(t))} />}
      {paste && <PasteSheet infos={infos} busy={busy === "paste"} onClose={() => setPaste(false)} onStart={(body) => void start("paste", { ...body, rate: rateFor(typeof body.companyId === "string" ? body.companyId : null) })} />}
    </div>
  );
}

/** Home2's props, for a home drawn in its place (the new design's, ui3/work/proposals). */
export type Home2Props = Parameters<typeof Home2>[0];

/** Paste notes or a transcript: read by Merlin's rules on the server, never kept. */
function PasteSheet({ infos, busy, onClose, onStart }: { infos: CoInfo[]; busy: boolean; onClose: () => void; onStart: (b: Record<string, unknown>) => void }) {
  const [text, setText] = useState("");
  const [co, setCo] = useState("");
  const pick = infos.find((i) => !i.c.hidden && i.c.name.toLowerCase() === co.trim().toLowerCase()) ?? null;
  const hits = co.trim().length >= 2 && !pick ? infos.filter((i) => !i.c.hidden && i.c.name.toLowerCase().includes(co.trim().toLowerCase())).slice(0, 4) : [];
  return (
    <Sheet
      title="Paste notes"
      onClose={onClose}
      dialog
      className="p2-paste"
      footer={
        <button type="button" className="btn btn-pine btn-lg" aria-busy={busy} disabled={busy || text.trim().length < 40} onClick={() => onStart({ transcript: text, ...(pick ? { companyId: pick.c.id } : { companyName: co.trim() }) })}>
          {busy ? "Opening" : "Make the proposal"}
        </button>
      }
    >
      <label className="p2-note">
        <span>Who it is for</span>
        <input className="input" value={co} placeholder="Company name" onChange={(e) => setCo(e.target.value)} />
      </label>
      {hits.length > 0 && (
        <div className="p2-hits">
          {hits.map((h) => (
            <button key={h.c.id} type="button" className="tp-flink" onClick={() => setCo(h.c.name)}>
              {h.c.name}
            </button>
          ))}
        </div>
      )}
      <label className="p2-note">
        <span>Your notes or the transcript</span>
        <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="p2-muted">Merlin reads it once to write the proposal: who&#39;s who, what you heard, the plan. The transcript isn&#39;t kept.</p>
    </Sheet>
  );
}
