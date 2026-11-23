"use client";

/**
 * Proof from Evidence Bank in the editor (ProposalEditor.dc.html, the Proof block): the one or two
 * of the member's own ready cases that look most like this client, each with Swap case (the other
 * cases, closest first), Add a case when Proof holds none or one, and Send without Proof. With no
 * ready case: Merlin left Proof empty (it never writes a case), the drafts waiting, and the way to
 * Evidence Bank. Evidence Bank is a Close feature: the editor shows this only on Close.
 *
 * Picking a case changes the proposal like any edit (Proposals.tsx Editor's save, with its revision
 * check, retries and leave guards): {{caseStudies}} takes the cases' lines and `proofCases` their
 * ids, and the server works the words out again from its own copy of the cases.
 */
import { useEffect, useState } from "react";
import type { ProofCase, ProofView, ProposalRec } from "@/lib/proposals/types";
import { api } from "../ProposalParts";
import { useAppMaybe } from "../shell/pages";

const whyOf = (c: Pick<ProofCase, "label" | "same">) => (c.label ? [c.label === "Same" ? "Same kind of client" : c.label === "Close" ? "Close to this client" : "A different kind of client", ...c.same.slice(0, 2)].join(" · ") : "Not matched to this client");

export function ProofPanel({
  p,
  readOnly,
  onPick,
  onLeaveOut,
}: {
  p: ProposalRec;
  /** Sent, signed, a change shown, or no Close: the cases show without the controls. */
  readOnly: boolean;
  /** Proof holds these cases now (their lines, one each, in order). */
  onPick: (ids: string[], text: string) => void;
  onLeaveOut: () => void;
}) {
  const c = useAppMaybe();
  const [view, setView] = useState<ProofView | null>(null);
  const [failed, setFailed] = useState(false);
  const [swap, setSwap] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let live = true;
    void api<ProofView>({ op: "proof", id: p.id }).then((r) => {
      if (!live) return;
      if (r.error) return setFailed(true);
      setFailed(false);
      setView(r);
    });
    return () => void (live = false);
  }, [p.id, p.company.id]);
  const evidenceHref = c?.hrefOf("evidence") ?? "/?p=evidence";
  const toEvidence = (e: React.MouseEvent) => c && (e.preventDefault(), c.openPage("evidence"));
  const who = p.company.name || "this client";

  if (failed) return <p className="pz-note pz-proof-wait">Your Evidence Bank cases didn&#39;t load. Open the proposal again to see them.</p>;
  if (!view) return <p className="pz-note pz-proof-wait">Looking in your Evidence Bank for cases like {who}.</p>;
  if (!view.on) return null;
  const byId = new Map(view.cases.map((x) => [x.id, x]));
  const chosen = (p.proofCases ?? []).filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const others = view.cases.filter((x) => !chosen.some((y) => y.id === x.id));
  const pick = (ids: string[]) => {
    setSwap(null);
    setAdding(false);
    onPick(ids, ids.map((id) => byId.get(id)?.text ?? "").filter(Boolean).join("\n"));
  };
  const alts = (onChoose: (id: string) => void) => (
    <div className="pz-proof-alts" role="group" aria-label="Pick a case from your Evidence Bank">
      <span className="pz-proof-k">{others.length ? "Your other cases, closest first" : "No other ready case"}</span>
      {others.map((x) => (
        <button key={x.id} type="button" className="pz-proof-alt" onClick={() => onChoose(x.id)}>
          <strong>{x.title}</strong>
          <span className="pz-note">{whyOf(x)}</span>
        </button>
      ))}
      <a href={evidenceHref} onClick={toEvidence} className="pz-proof-link">
        None fit. Write a new case in Evidence Bank
      </a>
    </div>
  );

  // No ready case: Proof stays empty. Merlin never writes one.
  if (!view.cases.length)
    return (
      <div className="pz-proof" role="note" data-kind="empty">
        <Star />
        <span>
          Merlin left Proof empty. You have no finished case yet, and Merlin never writes one for you.
          {view.drafts.length ? ` ${view.drafts.length === 1 ? "1 draft waits" : `${view.drafts.length} drafts wait`} in Evidence Bank.` : ""}{" "}
          <a href={evidenceHref} onClick={toEvidence}>
            Open Evidence Bank
          </a>
        </span>
        {view.drafts.slice(0, 3).map((d, k) => (
          <span key={k} className="pz-proof-draft">
            <strong>{d.title}</strong>
            <span className="pz-tag">Draft · not usable yet</span>
          </span>
        ))}
        {!readOnly && (
          <span className="pz-proof-acts">
            <a href={evidenceHref} onClick={toEvidence} className="btn btn-pine btn-sm">
              {view.drafts.length ? "Finish your first case" : "Write your first case"}
            </a>
            <button type="button" className="btn btn-sm" onClick={onLeaveOut}>
              Send without Proof
            </button>
            <span className="pz-note">Step 6 of 6. It then fills Proof in every proposal you write.</span>
          </span>
        )}
      </div>
    );

  const n = view.cases.length;
  const ours = chosen.length && chosen.every((x) => view.picked.includes(x.id)) && chosen.length === Math.min(view.picked.length, 2);
  const note = chosen.length
    ? ours
      ? `Pulled from your Evidence Bank: the ${chosen.length === 1 ? "case" : `${chosen.length} of your ${n} cases`} that look${chosen.length === 1 ? "s" : ""} most like ${who}. Merlin never writes a case for you.${readOnly ? "" : ` Swap ${chosen.length === 1 ? "it" : "either one"}.`}`
      : `From your Evidence Bank, as you picked. The client's name stays hidden unless you showed it.`
    : view.picked.length
      ? `Proof holds no case. ${view.picked.length === 1 ? "1 of your cases looks" : `${view.picked.length} of your cases look`} like ${who}.`
      : `None of your ${n === 1 ? "case looks" : `${n} cases look`} much like ${who}. Add one anyway, or write a new case.`;
  return (
    <div className="pz-proof-wrap">
      <div className="pz-proof" role="note">
        <Star />
        <span>
          {note}{" "}
          <a href={evidenceHref} onClick={toEvidence}>
            Open Evidence Bank
          </a>
        </span>
        {!readOnly && !chosen.length && (
          <span className="pz-proof-acts">
            {view.picked.length > 0 && (
              <button type="button" className="btn btn-pine btn-sm" onClick={() => pick(view.picked.slice(0, 2))}>
                Use {view.picked.length === 1 ? "it" : "them"}
              </button>
            )}
            <button type="button" className="btn btn-sm" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
              Add a case
            </button>
            <button type="button" className="btn btn-sm" onClick={onLeaveOut}>
              Send without Proof
            </button>
          </span>
        )}
        {!readOnly && !chosen.length && adding && alts((id) => pick([id]))}
      </div>
      {chosen.length > 0 && (
        <div className="pz-proof-cases">
          {chosen.map((x, slot) => (
            <div key={x.id} className="pz-proof-case">
              <span className="pz-proof-top">
                <span className="pz-tag pz-tag-ex">From Evidence Bank</span>
                <span className="pz-note">{whyOf(x)}</span>
              </span>
              <strong className="pz-proof-t">{x.title}</strong>
              {/* The case's words already read in the section above (its line fills {{caseStudies}}): the card keeps to the title and the numbers then. */}
              {x.story && !(x.text && (p.fields?.caseStudies ?? "").includes(x.text)) && <span className="pz-proof-story">{x.story}</span>}
              {x.outs.map((o, k) => (
                <span key={k} className="pz-proof-out">
                  <span className="pz-note">{o.k}</span>
                  <span>{o.was}</span>
                  <span aria-label="became">→</span>
                  <strong>{o.now}</strong>
                </span>
              ))}
              <span className="pz-proof-foot">
                <span className="pz-note">{x.src}</span>
                {!readOnly && (
                  <>
                    <button type="button" className="btn btn-sm" aria-expanded={swap === slot} aria-label={`Swap case ${slot + 1} for another from your Evidence Bank`} onClick={() => setSwap(swap === slot ? null : slot)}>
                      Swap case
                    </button>
                    <button type="button" className="tp-flink" onClick={() => pick(chosen.filter((y) => y.id !== x.id).map((y) => y.id))}>
                      Take it out
                    </button>
                  </>
                )}
              </span>
              {!readOnly &&
                swap === slot &&
                alts((id) => {
                  const ids = chosen.map((y) => y.id);
                  ids[slot] = id;
                  pick(ids);
                })}
            </div>
          ))}
          {!readOnly && chosen.length < 2 && others.length > 0 && (
            <div className="pz-proof-case pz-proof-add">
              <button type="button" className="btn btn-sm" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
                Add a case
              </button>
              {adding && alts((id) => pick([...chosen.map((y) => y.id), id]))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Star() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
    </svg>
  );
}
