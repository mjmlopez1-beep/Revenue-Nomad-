"use client";

/**
 * Proposals' home in the new design (RN_UI3, with the one-screen Proposals, RN_PROPOSALS2;
 * find-design/v5/work.html, Proposals). It takes the place of proposalsPage/Home2.tsx inside
 * today's ProposalsPage, which keeps the editor, the send sheet, the addresses and every rule.
 * The same props, the same calls:
 *
 *   The featured draft   the newest draft Merlin made from a call (fromCall): who it is for, the
 *                        monthly retainer and days a week as the document has them, the length and
 *                        the scope from the call's brief. Only what the proposal holds: a part it
 *                        doesn't have is left out. Review the draft, Send for signature, "..." (Deck
 *                        view in the editor, Templates).
 *   New proposal         recent calls (Granola, Fathom; "Draft ready" when drafted already), the
 *                        companies in the pipeline, one search for either; Paste a transcript or
 *                        notes, Start blank, Templates, Make a template from one you've sent. A tap
 *                        is POST op "quick" with the price from ONE calculation (proposalRate).
 *   Your proposals       All, Needs you, Out, Signed; each row's status in the color map, the value a
 *                        month, one next step, and "..." (Open, Duplicate, Void, Delete draft).
 *
 * Writing proposals is Close (and the trial): elsewhere the start is a plan gate, the list stays.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProposalRec } from "@/lib/proposals/types";
import type { HomeCall, HomeCompany, HomeView } from "@/lib/proposals/recent";
import type { QuickResult } from "@/lib/proposals/quick";
import { blanksOf, docFields, moneyOf } from "@/lib/proposals/library";
import { proposalRate } from "@/lib/proposals/rates";
import { errorText, useToast } from "../../../../ui/shared";
import { useApp } from "../../../shell/pages";
import { api } from "../../../ProposalParts";
import { LearnTemplate } from "../../../proposalsPage/LearnTemplate";
import type { Home2Props } from "../../../proposalsPage/Home2";
import { openPlans } from "../../../Billing";
import { Band, Chips, CoMark, Gate, MatchCount, More, NoMatch, Sheet, St, useCoFinder, money, type MenuItem, type Tone } from "../parts";
import { WIc } from "../icons";
import "./proposals.css";

type Filter = "all" | "needs" | "out" | "signed";
const PROPOSAL_NOUN = ["proposal", "proposals"] as const;
const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "All" },
  { k: "needs", label: "Needs you" },
  { k: "out", label: "Out" },
  { k: "signed", label: "Signed" },
];
const inFilter = (p: ProposalRec, f: Filter) =>
  f === "all" || (f === "needs" ? p.status === "draft" || p.status === "client_signed" || p.status === "declined" : f === "out" ? p.status === "sent" || p.status === "viewed" : p.status === "signed" || p.status === "client_signed");

const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const when = (iso: string, nowMs = Date.now()) => {
  const d = new Date(iso);
  const day = Math.floor((new Date(nowMs).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return day <= 0 ? `Today, ${t}` : day === 1 ? `Yesterday, ${t}` : day < 7 ? `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** A row's status in the one color map, and its words. */
const STATUS: Record<ProposalRec["status"], [string, Tone]> = {
  draft: ["Draft", "gold"],
  sent: ["Sent", "co"],
  viewed: ["Viewed", "co"],
  client_signed: ["Client signed · your turn", "hot"],
  signed: ["Signed", "forest"],
  declined: ["Declined", ""],
  void: ["Voided", ""],
  expired: ["Expired", ""],
};

/** The next step on a row: its button, a line beside the status, and whether it is the member's move. */
function nextOf(p: ProposalRec): { t: string; note: string; mine: boolean; tab?: "send" } {
  if (p.status === "draft") {
    const n = blanksOf(p.blocks, docFields(p)).length;
    return { t: "Continue", note: n ? `${n} ${n === 1 ? "thing" : "things"} to fill` : `Ready to send · edited ${dayOf(p.updatedAt)}`, mine: true };
  }
  if (p.status === "client_signed") return { t: "Countersign", note: `Signed ${dayOf(p.send?.signedAt)}`, mine: true, tab: "send" };
  if (p.status === "viewed") return { t: "Follow up", note: `Sent ${dayOf(p.send?.sentAt)}, opened`, mine: false };
  if (p.status === "sent") return { t: "Open", note: `Sent ${dayOf(p.send?.sentAt)}, not opened yet`, mine: false };
  if (p.status === "signed") return { t: "Open", note: `Signed ${dayOf(p.send?.memberSignedAt ?? p.send?.signedAt)}`, mine: false };
  if (p.status === "expired") return { t: "Open", note: p.send?.expiresAt ? `The link ended ${dayOf(p.send.expiresAt)}` : "The link ended", mine: false };
  return { t: "Open", note: dayOf(p.updatedAt), mine: false };
}

/** The scope lines a call brief gives (its phases, else what success looks like), three at most. */
const scopeOf = (p: ProposalRec): string[] => {
  const b = p.brief;
  if (!b) return [];
  const xs = (b.shape.phases.length ? b.shape.phases : b.success).map((x) => x.trim()).filter(Boolean);
  return xs.slice(0, 3);
};

export function Ui3ProposalsHome({ data, view, infos, onOpen, onOpenTab, onGone, onPut, onContracts, onTemplates, onLearned }: Home2Props & { onOpenTab?: (id: string, tab: "send") => void; onGone?: (id: string) => void }) {
  const c = useApp();
  const toast = useToast();
  const find = useCoFinder();
  const [home, setHome] = useState<HomeView | null>(null);
  const [homeErr, setHomeErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState(false);
  const [paste, setPaste] = useState(false);
  const [learn, setLearn] = useState(false);
  const [hideFeat, setHideFeat] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

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
      if (h && !h.loading && h.calls.some((x) => !x.ready) && live.current) {
        await new Promise((r) => setTimeout(r, 2500));
        if (live.current) await loadHome(false);
      }
    })();
  }, [data.canBuild, loadHome]);

  /** The price for a start: ONE calculation with What should I charge (as Home2 does). */
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
    const call = home?.calls.find((k) => k.company.id === x.id && !k.draftId);
    if (call) return tapCall(call);
    void start(`co:${x.id}`, { companyId: x.id, rate: rateFor(x.id) });
  };

  const needle = q.trim().toLowerCase();
  const match = (...xs: (string | null | undefined)[]) => !needle || xs.some((t) => String(t ?? "").toLowerCase().includes(needle));
  const calls = (home?.calls ?? []).filter((x) => match(x.who?.name, x.who?.email, x.company.label));
  const companies = (home?.companies ?? []).filter((x) => match(x.label, x.to));
  const others: HomeCompany[] =
    needle.length >= 2
      ? infos
          .filter((i) => !i.c.hidden && i.c.name.toLowerCase().includes(needle) && !companies.some((k) => k.id === i.c.id))
          .slice(0, 4)
          .map((i) => ({ id: i.c.id, name: i.c.name, label: i.c.name, stage: "", to: null, draftId: null }))
      : [];
  const rec = home?.recorders ?? [];
  const rows = data.proposals.filter((p) => inFilter(p, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.k, data.proposals.filter((p) => inFilter(p, f.k)).length])) as Record<Filter, number>;
  const shown = all ? rows : rows.slice(0, 8);

  /* The featured draft: the newest draft Merlin made from a call. */
  const feat = data.canBuild ? [...data.proposals].filter((p) => p.status === "draft" && p.fromCall && p.id !== hideFeat).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null : null;
  const featCall = feat ? home?.calls.find((k) => k.draftId === feat.id) ?? null : null;

  const menu = (p: ProposalRec): MenuItem[] => ([
    { t: "Open", icon: "doc", go: () => onOpen(p.id) },
    {
      t: "Duplicate",
      icon: "copy",
      go: async () => {
        const r = await api<ProposalRec>({ op: "duplicate", id: p.id });
        if (r.error) return toast(r.error, true);
        onPut(r);
        toast("Duplicated as a draft.");
      },
    },
    ...(p.status === "client_signed" ? [{ t: "Countersign", icon: "sig" as const, go: () => (onOpenTab ? onOpenTab(p.id, "send") : onOpen(p.id)) }] : []),
    "-",
    p.status === "draft"
      ? {
          t: "Delete draft",
          icon: "trash" as const,
          danger: true,
          go: async () => {
            if (!window.confirm("Delete this draft? It can't be undone.")) return;
            const r = await api<{ ok: boolean }>({ op: "delete", id: p.id });
            if (r.error) return toast(r.error, true);
            onGone?.(p.id);
            toast("Draft deleted.");
          },
        }
      : p.status === "sent" || p.status === "viewed"
        ? {
            t: "Void",
            icon: "x" as const,
            danger: true,
            go: async () => {
              if (!window.confirm("Void it? The link stops working for the client.")) return;
              const r = await api<ProposalRec>({ op: "void", id: p.id });
              if (r.error) return toast(r.error, true);
              onPut(r);
              toast("Voided. The link stops working.");
            },
          }
        : "-",
  ] as MenuItem[]).filter((x, i, a) => !(x === "-" && (i === a.length - 1 || a[i + 1] === "-")));

  const sub = data.canBuild ? "Tap a call and Merlin drafts the whole proposal from it. You edit, then send it for signature." : "Your proposals, and where each one is.";
  return (
    <div className="pr3">
      <Band art="proposals" density="minimal" title="Proposals." sub={sub} />
      {feat && (
        <section className="m-panel pr-feat" aria-label="Draft ready">
          <div className="pr-feat-l">
            <span className="m-eyebrow am">
              <WIc n="spark" /> Draft ready{featCall ? ` · from your call ${when(featCall.when).replace(/^Today/, "today").replace(/^Yesterday/, "yesterday")}` : " · from your call"}
            </span>
            <div className="w-row" style={{ gap: 14 }}>
              <CoMark i={find(feat.company.id, feat.company.name)} name={feat.company.name || feat.title} s={48} />
              <div style={{ minWidth: 0 }}>
                <h2 className="m-h2 pr-feat-name">{feat.company.name || feat.title}</h2>
                <p className="m-small">{[feat.signer ? `For ${feat.signer.name}${feat.signer.title ? `, ${feat.signer.title}` : ""}` : null, feat.company.name && feat.title.includes(feat.company.name) ? null : feat.title].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="w-row" style={{ flexWrap: "wrap", marginTop: 4 }}>
              <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => onOpen(feat.id)}>
                Review the draft
              </button>
              {data.canSend && (
                <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => (onOpenTab ? onOpenTab(feat.id, "send") : onOpen(feat.id))}>
                  <WIc n="send" /> Send for signature
                </button>
              )}
              <More
                label={`More for ${feat.company.name || feat.title}`}
                items={[
                  { t: "Change the template", icon: "fields", go: onTemplates },
                  { t: "Not now", icon: "clock", sub: "Kept in Your proposals", go: () => setHideFeat(feat.id) },
                ]}
              />
            </div>
          </div>
          <FeatFacts p={feat} />
        </section>
      )}
      <div className="pr-grid">
        {data.canBuild ? (
          <section className="m-panel pr-new" aria-labelledby="pr3-new-h">
            <div className="m-panel-h">
              <div>
                <h2 className="m-h2" id="pr3-new-h" style={{ fontSize: 26 }}>
                  New proposal
                </h2>
                <p className="m-sub" style={{ marginTop: 4 }}>
                  From your recent calls and your pipeline.
                </p>
              </div>
            </div>
            <div className="m-panel-b">
              <label className="w-search" style={{ marginBottom: 10 }}>
                <WIc n="search" />
                <input type="search" value={q} placeholder="Find a call or a company" aria-label="Find a call or a company" onChange={(e) => setQ(e.target.value)} />
              </label>
              {err && (
                <p className="w3-err" role="alert">
                  {err}
                </p>
              )}
              <div className="w-kicker" style={{ margin: "14px 0 4px" }}>
                {rec.length === 1 ? `Recent calls from ${rec[0]}` : "Recent calls"}
              </div>
              {!home ? (
                <p className="m-small pr3-wait">{homeErr ?? "Looking at your calls."}</p>
              ) : !rec.length ? (
                <p className="m-small pr3-none">
                  Connect Granola or Fathom and your calls show here, each one a tap from a draft.{" "}
                  <a className="w-link" href={c.hrefOf("integrations")} onClick={(e) => (e.preventDefault(), c.openPage("integrations"))}>
                    Connect a recorder
                  </a>
                </p>
              ) : home.loading ? (
                <p className="m-small pr3-wait">{homeErr ?? `Looking at your calls in ${rec.join(" and ")}.`}</p>
              ) : !calls.length ? (
                <p className="m-small pr3-none">{needle ? "No call matches." : "No calls in the last 14 days."}</p>
              ) : (
                <div>
                  {calls.map((x) => (
                    <button key={x.key} type="button" className="pr-call" data-call={x.key} aria-busy={busy === x.key || undefined} disabled={!!busy} onClick={() => tapCall(x)}>
                      <CoMark i={find(x.company.id, x.company.name)} name={x.company.name ?? x.company.label} />
                      <span>
                        <b className="pr3-cname">{x.company.name ?? x.company.label}</b>
                        <span className="src">
                          <span className="pr-src" style={{ background: /fathom/i.test(x.recorderName) ? "#3d6cc7" : "#2f7a5f" }} aria-label={x.recorderName}>
                            {x.recorderName[0]}
                          </span>
                          {[x.who?.name || x.who?.email, when(x.when), x.minutes ? `${x.minutes} min` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {x.draftId ? (
                        <span className="m-chip am sm">
                          <WIc n="spark" /> Draft ready
                        </span>
                      ) : (
                        <span className="m-btn m-btn-sm m-btn-secondary">{busy === x.key ? "Opening" : "Draft it"}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="w-kicker" style={{ margin: "16px 0 4px" }}>
                In your pipeline
              </div>
              {!home ? (
                <p className="m-small pr3-wait">Looking at your pipeline.</p>
              ) : !companies.length && !others.length ? (
                <p className="m-small pr3-none">{needle ? "No company matches." : "No open deals yet. Search for a company above."}</p>
              ) : (
                <div>
                  {[...companies, ...others].map((x) => (
                    <button key={x.id} type="button" className="pr-call" data-company={x.id} aria-busy={busy === `co:${x.id}` || undefined} disabled={!!busy} onClick={() => tapCompany(x)}>
                      <CoMark i={find(x.id, x.name)} name={x.label} />
                      <span>
                        <b className="pr3-cname">{x.label}</b>
                        <span className="src">{[x.stage || "On Merlin", x.to].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="m-btn m-btn-sm m-btn-ghost">{x.draftId ? "Open the draft" : busy === `co:${x.id}` ? "Opening" : "Start"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="pr-links">
              <button type="button" className="w-link" onClick={() => setPaste(true)}>
                <WIc n="doc" /> Paste a transcript or notes
              </button>
              <button type="button" className="w-link" disabled={!!busy} onClick={() => void start("blank", { blank: true, rate: rateFor(null) })}>
                <WIc n="plus" /> Start blank
              </button>
              <button type="button" className="w-link" onClick={onTemplates}>
                <WIc n="fields" /> Templates
              </button>
              <button type="button" className="w-link" data-learn onClick={() => setLearn(true)}>
                <WIc n="upload" /> Make a template from one you&apos;ve sent
              </button>
              <button type="button" className="w-link" onClick={onContracts}>
                <WIc n="sig" /> Send a contract
              </button>
            </div>
          </section>
        ) : (
          <section aria-label="New proposal">
            <Gate title="Writing proposals is on Close" onPlans={() => openPlans("proposals")}>
              Tap a call and Merlin drafts the whole proposal from it, priced from your rate, with your case studies. Your proposals stay here on every plan.
            </Gate>
          </section>
        )}
        <section aria-labelledby="pr3-mine-h">
          <div className="w-row" style={{ margin: "4px 0 12px", flexWrap: "wrap" }}>
            <h2 className="m-h2" id="pr3-mine-h" style={{ fontSize: 26 }}>
              Your proposals
            </h2>
          </div>
          {!data.proposals.length ? (
            <div className="pr3-empty">
              <b className="w-h4">None yet</b>
              <p className="w-help">{data.canBuild ? "Your first one starts from a call. Proposals sent within two days of the call are easier to win while it's fresh." : "Proposals you write on Close show here with where each one is."}</p>
            </div>
          ) : (
            <>
              <Chips items={FILTERS.map((f) => ({ ...f, n: counts[f.k] }))} on={filter} set={(k) => (setFilter(k), setAll(false))} cls="pr3-chips" />
              <MatchCount shown={rows.length} total={data.proposals.length} noun={PROPOSAL_NOUN} filter={filter === "all" ? null : FILTERS.find((f) => f.k === filter)!.label} />
              {!shown.length && <NoMatch noun={PROPOSAL_NOUN} filter={FILTERS.find((f) => f.k === filter)!.label} total={data.proposals.length} onShowAll={() => (setFilter("all"), setAll(false))} />}
              <div className="m-table pr3-list" hidden={!shown.length}>
                {shown.map((p) => {
                  const n = nextOf(p);
                  const fee = moneyOf(p.fields["pricing.monthlyFee"]);
                  const [words, tone] = STATUS[p.status];
                  const name = p.company.name || "No company yet";
                  return (
                    <div key={p.id} className="m-tr" data-proposal={p.id} tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(p.id)}>
                      <div className="m-co">
                        <CoMark i={find(p.company.id, p.company.name)} name={name} s={44} />
                        <div style={{ minWidth: 0 }}>
                          <div className="m-name">
                            <span>{name}</span>
                          </div>
                          <small>{[p.signer ? `For ${p.signer.name}` : null, fee ? `${money(fee)}/mo` : "Not priced yet"].filter(Boolean).join(" · ")}</small>
                          <div className="w-row pr3-stline">
                            <St tone={tone}>{words}</St>
                            <span className="m-small">{n.note}</span>
                          </div>
                        </div>
                      </div>
                      <div className="m-rowact m-ph-z" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className={`m-btn m-btn-sm ${n.mine ? "m-btn-primary" : "m-btn-secondary"}`} onClick={() => (n.tab && onOpenTab ? onOpenTab(p.id, n.tab) : onOpen(p.id))}>
                          {n.t}
                        </button>
                        <More label={`More for ${name}`} items={() => menu(p)} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {rows.length > shown.length && (
                <button type="button" className="w-link" style={{ marginTop: 12 }} onClick={() => setAll(true)}>
                  Show all {rows.length}
                </button>
              )}
            </>
          )}
        </section>
      </div>
      {learn && <LearnTemplate onClose={() => setLearn(false)} onSaved={(t) => (setLearn(false), onLearned?.(t))} />}
      {paste && <PasteSheet busy={busy === "paste"} onClose={() => setPaste(false)} onStart={(body) => void start("paste", { ...body, rate: rateFor(typeof body.companyId === "string" ? body.companyId : null) })} />}
    </div>
  );
}

/** The featured draft's facts: the retainer and days a week, the length, the scope. Only what it holds. */
function FeatFacts({ p }: { p: ProposalRec }) {
  const fee = moneyOf(p.fields["pricing.monthlyFee"]);
  const alloc = (p.fields["pricing.allocation"] ?? "").trim();
  const dur = p.brief?.shape.duration?.trim() ?? "";
  const scope = scopeOf(p);
  const blanks = blanksOf(p.blocks, docFields(p)).length;
  return (
    <dl className="pr-feat-r">
      <div>
        <dt>Monthly retainer</dt>
        <dd className="pr-feat-big">{fee ? money(fee) : "Not set yet"}</dd>
        <dd className="m-small">{alloc ? `${alloc[0].toUpperCase()}${alloc.slice(1)}, from your rate` : fee ? "From your rate" : "The document asks for it"}</dd>
      </div>
      {dur ? (
        <div>
          <dt>Engagement</dt>
          <dd className="pr-feat-big">{dur[0].toUpperCase() + dur.slice(1)}</dd>
          <dd className="m-small">As the call said it</dd>
        </div>
      ) : (
        <div>
          <dt>Before you send</dt>
          <dd className="pr-feat-big">{blanks ? `${blanks} to fill` : "Ready"}</dd>
          <dd className="m-small">{blanks ? (blanks === 1 ? "One blank left in the document" : "Blanks left in the document") : "Nothing left to fill"}</dd>
        </div>
      )}
      {scope.length > 0 && (
        <div className="pr-feat-scope">
          <dt>Scope</dt>
          <dd>
            <ul className="pr-heard">
              {scope.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Paste notes or a transcript: read by Merlin's rules on the server, never kept. */
function PasteSheet({ busy, onClose, onStart }: { busy: boolean; onClose: () => void; onStart: (b: Record<string, unknown>) => void }) {
  const c = useApp();
  const [text, setText] = useState("");
  const [co, setCo] = useState("");
  const pick = c.infos.find((i) => !i.c.hidden && i.c.name.toLowerCase() === co.trim().toLowerCase()) ?? null;
  const hits = co.trim().length >= 2 && !pick ? c.infos.filter((i) => !i.c.hidden && i.c.name.toLowerCase().includes(co.trim().toLowerCase())).slice(0, 4) : [];
  return (
    <Sheet
      title="Paste a transcript or notes"
      onClose={onClose}
      lg
      foot={
        <>
          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="m-btn m-btn-primary m-btn-sm" aria-busy={busy || undefined} disabled={busy || text.trim().length < 40} onClick={() => onStart({ transcript: text, ...(pick ? { companyId: pick.c.id } : { companyName: co.trim() }) })}>
            {busy ? "Opening" : "Draft the proposal"}
          </button>
        </>
      }
    >
      <label className="w-field">
        <span>Company</span>
        <input className="w-in" value={co} placeholder="Company name" onChange={(e) => setCo(e.target.value)} />
      </label>
      {hits.length > 0 && (
        <div className="w-opts">
          {hits.map((h) => (
            <button key={h.c.id} type="button" className="w-opt" onClick={() => setCo(h.c.name)}>
              {h.c.name}
            </button>
          ))}
        </div>
      )}
      <textarea value={text} aria-label="Your notes or the transcript" placeholder="Paste what was said, or your notes. Merlin reads it once and doesn't keep it." onChange={(e) => setText(e.target.value)} />
    </Sheet>
  );
}
