"use client";

/**
 * What Merlin used, beside the document (the one-screen Proposals, RN_PROPOSALS2): a rail on wide
 * screens, a bottom sheet on phones. Four cards, each switchable:
 *
 *   Rate          the fee and its math from ONE calculation with "What should I charge"
 *                 (lib/proposals/rates.ts proposalRate on the app's own view): the lower and higher
 *                 ends of Merlin's ask as one-tap prices, the hours a month and the hourly figure,
 *                 and how Merlin worked it out, step by step.
 *   Case studies  the member's ready Evidence Bank cases, closest first, on or off (two at most).
 *   From the call the call's summary, what was agreed and the buyer's lines kept, and that the
 *                 transcript isn't kept.
 *   Template      switch it; the fields and the two written sections stay.
 *
 * Anything else the editor had on its right (Change it, versions, options and add-ons, once sent
 * its signing status) follows the four as "More".
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { View } from "@/lib/tableTypes";
import type { ProofView, ProposalRec, TemplateChoice } from "@/lib/proposals/types";
import { moneyOf } from "@/lib/proposals/library";
import { proposalRate, rateMath } from "@/lib/proposals/rates";
import { RECORDER_NAMES, type RecorderKey } from "@/lib/calls/types";
import { api } from "../ProposalParts";
import { useAppMaybe } from "../shell/pages";
import "./p2.css";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Discovery keys of the buyer's lines, in words. */

export interface Rail2Props {
  p: ProposalRec;
  view: View;
  templates: TemplateChoice[];
  readOnly: boolean;
  /** Set the monthly fee (and what follows from it). */
  onFee: (fee: number) => void;
  /** Set the days a week (the hours, and the fee from the one calculation unless the member set it). */
  onDays?: (allocation: string) => void;
  onProof: (ids: string[], text: string) => void;
  onTemplate: (templateId: string) => void;
  /** Signing status and activity, once sent. */
  signing?: ReactNode;
  /** The editor's other tools, under the four cards. */
  more?: ReactNode;
}

export function Rail2(x: Rail2Props) {
  const { p } = x;
  return (
    <div className="p2-rail" data-rail>
      {x.signing && <section className="p2-card">{x.signing}</section>}
      <RateCard p={p} view={x.view} readOnly={x.readOnly} onFee={x.onFee} onDays={x.onDays} />
      <CasesCard p={p} readOnly={x.readOnly} onProof={x.onProof} />
      <CallCard p={p} />
      <TemplateCard p={p} templates={x.templates} readOnly={x.readOnly} onTemplate={x.onTemplate} />
      {x.more && (
        <details className="p2-card p2-more">
          <summary>More: change it with Merlin, versions, options</summary>
          {x.more}
        </details>
      )}
    </div>
  );
}

/** The days a week a member picks from when the call didn't say (never assumed full time). */
export const DAY_CHOICES = ["1 day a week", "2 days a week", "2.5 days a week", "3 days a week"];

function RateCard({ p, view, readOnly, onFee, onDays }: { p: ProposalRec; view: View; readOnly: boolean; onFee: (n: number) => void; onDays?: (allocation: string) => void }) {
  const r = useMemo(() => proposalRate(view, { company: p.company, fields: p.fields }), [view, p.company, p.fields]);
  const [how, setHow] = useState(false);
  const fee = moneyOf(p.fields["pricing.monthlyFee"]) ?? null;
  const m = rateMath(fee, p.fields["pricing.allocation"]);
  const said = p.sources["pricing.monthlyFee"];
  const chips = useMemo(() => {
    const out: { n: number; w: string }[] = [];
    const add = (n: number | null | undefined, w: string) => n && !out.some((o) => o.n === n) && out.push({ n, w });
    // The fee the call agreed reads "from the call" (its terms are in the call's notes).
    const fromCall = !!fee && said === "quick" && p.notes.some((n) => n.key === "call.agreed" && n.text.includes(money(fee)));
    if (fee) add(fee, fromCall ? "from the call" : "in it now");
    if (r.source === "yours") add(r.fee, "your rate");
    if (r.ask) (add(r.ask.from, "Merlin's floor"), add(r.ask.to, "Merlin's ask"));
    if (fee && r.ask && fee <= r.ask.to) add(Math.round((r.ask.to * 1.15) / 250) * 250, "higher");
    return out.sort((a, b) => a.n - b.n);
  }, [fee, r, said, p.notes]);
  return (
    <section className="p2-card" data-card="rate" aria-labelledby="p2-rate-h">
      <div className="p2-card-h">
        <h3 id="p2-rate-h">Rate</h3>
        <span className="p2-pill" title="The same working as What should I charge">
          One calculation
        </span>
      </div>
      <p className="p2-big" data-fee={fee ?? ""}>
        {fee ? money(fee) : "No fee yet"} <span className="p2-muted">a month</span>
      </p>
      {chips.length > 0 && !readOnly && (
        <div className="p2-chips" role="group" aria-label="Pick a monthly fee">
          {chips.map((c) => (
            <button key={c.n} type="button" className="p2-fee" aria-pressed={c.n === fee} onClick={() => onFee(c.n)}>
              <strong>{money(c.n)}</strong>
              <span>{c.w}</span>
            </button>
          ))}
        </div>
      )}
      <p className="p2-math" data-math>
        {m.math}
      </p>
      {!m.hoursWeek && onDays && !readOnly && (
        <div className="p2-days" data-ask="days">
          <p className="p2-muted">How many days a week? The call didn&#39;t say, so Merlin won&#39;t assume.</p>
          <div className="p2-chips" role="group" aria-label="Days a week">
            {DAY_CHOICES.map((d) => (
              <button key={d} type="button" className="p2-fee" onClick={() => onDays(d)}>
                <strong>{d.replace(" a week", "")}</strong>
                <span>a week</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {r.big && (
        <p className="p2-muted">
          What should I charge says: {r.big.replace(/^Ask /, "ask ").replace(/^Start at /, "start at ")} for {r.fn}
          {r.band !== "All" ? ` at ${r.band} companies` : ""}.
        </p>
      )}
      {r.steps.length > 0 && (
        <>
          <button type="button" className="tp-flink" aria-expanded={how} onClick={() => setHow((h) => !h)}>
            {how ? "Hide the working" : "How Merlin worked it out"}
          </button>
          {how && (
            <ol className="p2-steps">
              {r.steps.map((s) => (
                <li key={s.t}>
                  <strong>{s.t}.</strong> {s.s}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function CasesCard({ p, readOnly, onProof }: { p: ProposalRec; readOnly: boolean; onProof: (ids: string[], text: string) => void }) {
  const c = useAppMaybe();
  const [v, setV] = useState<ProofView | null>(null);
  useEffect(() => {
    let live = true;
    void api<ProofView>({ op: "proof", id: p.id }).then((r) => live && !r.error && setV(r));
    return () => void (live = false);
  }, [p.id, p.company.id]);
  if (v && !v.on) return null;
  const chosen = p.proofCases ?? [];
  const byId = new Map((v?.cases ?? []).map((x) => [x.id, x]));
  const toggle = (id: string) => {
    const ids = chosen.includes(id) ? chosen.filter((y) => y !== id) : [...chosen, id].slice(-2);
    onProof(ids, ids.map((y) => byId.get(y)?.text ?? "").filter(Boolean).join("\n"));
  };
  return (
    <section className="p2-card" data-card="cases" aria-labelledby="p2-cases-h">
      <div className="p2-card-h">
        <h3 id="p2-cases-h">Case studies</h3>
        <span className="p2-muted">{chosen.length} in</span>
      </div>
      {!v ? (
        <p className="p2-muted">Looking in your Evidence Bank.</p>
      ) : !v.cases.length ? (
        <p className="p2-muted">
          No finished case yet. Merlin never writes one for you.{" "}
          <a href={c?.hrefOf("evidence") ?? "/?p=evidence"} onClick={(e) => c && (e.preventDefault(), c.openPage("evidence"))}>
            Open Evidence Bank
          </a>
        </p>
      ) : (
        <ul className="p2-cases">
          {v.cases.slice(0, 4).map((k) => (
            <li key={k.id}>
              <span>
                <strong>{k.title}</strong>
                <span className="p2-muted">{k.label === "Same" ? "Same kind of client" : k.label === "Close" ? "Close to this client" : k.label ? "A different kind of client" : "Not matched"}</span>
              </span>
              <button type="button" role="switch" className="p2-switch" aria-checked={chosen.includes(k.id)} aria-label={`Use ${k.title}`} disabled={readOnly} onClick={() => toggle(k.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SIDE_WORDS: Record<string, string> = { client: "Client", member: "You", operator: "Operator", intermediary: "Introduced by", other: "Also" };

/** From the call: Merlin's brief (who's who, what you heard with the quote behind it, the alternatives and your answer, next steps). Yours alone. */
function CallCard({ p }: { p: ProposalRec }) {
  const b = p.brief;
  const summary = p.notes.find((n) => n.key === "call.summary")?.text ?? null;
  const agreed = p.notes.filter((n) => n.key === "call.agreed").map((n) => n.text);
  const rec = p.fromCall ? RECORDER_NAMES[p.fromCall.recorder as RecorderKey] ?? "your call recorder" : null;
  if (!b && !summary && !agreed.length && !rec) return null;
  const role = b?.memberRole === "firm" ? "You're the firm placing the operator." : b?.memberRole === "operator" ? "You'd do the work yourself." : null;
  return (
    <section className="p2-card" data-card="call" aria-labelledby="p2-call-h">
      <div className="p2-card-h">
        <h3 id="p2-call-h">From the call</h3>
        {b && <span className="p2-pill">{b.by === "ai" ? "Read by Merlin" : "Only what's certain"}</span>}
      </div>
      {(b?.summary || summary) && <p>{b?.summary || summary}</p>}
      {b && b.people.length > 0 && (
        <ul className="p2-people" aria-label="Who's who">
          {b.people.slice(0, 8).map((x) => (
            <li key={x.name}>
              <strong>{x.name}</strong> <span className="p2-muted">{[SIDE_WORDS[x.side], x.role, x.decides ? "decides" : ""].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      {role && <p className="p2-muted">{role}</p>}
      {b && b.insights.length > 0 && (
        <details className="p2-brief">
          <summary>What you heard, with what they said</summary>
          <ul>
            {b.insights.map((x) => (
              <li key={x.title}>
                <strong>{x.title}.</strong> {x.body}
                {x.evidence && <span className="p2-quote">&ldquo;{x.evidence}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {b && b.alternatives.length > 0 && (
        <details className="p2-brief">
          <summary>What they&#39;re weighing instead</summary>
          <ul>
            {b.alternatives.map((x) => (
              <li key={x.option}>
                <strong>{x.option}.</strong> {x.answer && <>Your answer: {x.answer}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {b && b.risks.length > 0 && (
        <details className="p2-brief">
          <summary>Risks</summary>
          <ul>
            {b.risks.map((x) => (
              <li key={x.risk}>
                {x.risk} {x.answer && <span className="p2-muted">{x.answer}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!b && agreed.length > 0 && (
        <ul className="p2-agreed">
          {agreed.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="p2-muted">{rec ? `Read from ${rec}. The transcript isn't kept, and the quotes are for you alone.` : "From the call you pasted. It isn't kept, and the quotes are for you alone."}</p>
    </section>
  );
}

function TemplateCard({ p, templates, readOnly, onTemplate }: { p: ProposalRec; templates: TemplateChoice[]; readOnly: boolean; onTemplate: (id: string) => void }) {
  const open = templates.filter((t) => t.open);
  return (
    <section className="p2-card" data-card="template" aria-labelledby="p2-tpl-h">
      <div className="p2-card-h">
        <h3 id="p2-tpl-h">Template</h3>
      </div>
      <select className="input" aria-label="Template" value={p.templateId ?? "blank"} disabled={readOnly || p.status !== "draft"} onChange={(e) => onTemplate(e.target.value)}>
        {open.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
            {t.mine ? " (yours)" : ""}
          </option>
        ))}
        <option value="blank">A blank page</option>
      </select>
      <p className="p2-muted">Switching keeps what you filled in and what Merlin wrote from the call.</p>
    </section>
  );
}
