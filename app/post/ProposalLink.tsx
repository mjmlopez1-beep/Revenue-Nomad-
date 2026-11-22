"use client";

/**
 * "Not linked to a company yet. Your pipeline won't move when they sign.": a proposal whose
 * company Merlin couldn't find when it was typed (lib/proposals/store.ts NOT_LINKED). The member
 * types the company's full name or its website, and Merlin finds it as find_company does (locked
 * companies too, with find's daily limits) and links it (op "link"). A proposal already out, or
 * signed, moves the pipeline then: Proposal, or Won. What the client reads doesn't change.
 *
 * Not on Merlin at all (a small agency, say): "Add <Name> to Merlin" adds it from its website
 * (AddCompany.tsx) and links it, right there, as does a search that finds nothing.
 */
import { useState } from "react";
import type { ProposalRec } from "@/lib/proposals/types";
import { useToast } from "../ui/shared";
import { api } from "./ProposalParts";
import { AddCompany } from "./AddCompany";

export const NOT_LINKED_WORDS = "Not linked to a company yet. Your pipeline won't move when they sign.";

export function LinkCompany({ p, onLinked, site, lead }: { p: ProposalRec; onLinked: (r: ProposalRec) => void; site?: string | null; lead?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState(p.company.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (p.company.id) return null;
  const link = async () => {
    if (busy || q.trim().length < 3) return setErr(q.trim().length < 3 ? "Type the company's full name or its website." : null);
    setBusy(true);
    setErr(null);
    const r = await api<ProposalRec>({ op: "link", id: p.id, name: q.trim() });
    setBusy(false);
    // Nobody by that name or website: add it to Merlin from here.
    if (r.error) return setErr(r.error), /didn't find|isn't on Merlin/.test(r.error) && setAdding(true);
    toast(p.status === "signed" ? "Linked. Your pipeline has it as Won." : "Linked. Your pipeline moves when they sign.");
    onLinked(r);
  };
  return (
    <div className="pp-banner pp-banner-link" role="status" data-unlinked>
      <p>{lead ?? NOT_LINKED_WORDS}</p>
      {adding ? (
        <AddCompany
          proposalId={p.id}
          name={open ? q : p.company.name}
          website={site}
          onCancel={() => setAdding(false)}
          onAdded={(r) => {
            if (!r.proposal) return;
            toast(r.added ? `Added ${r.name} to Merlin and linked it.` : `${r.name} was on Merlin already. Linked.`);
            onLinked(r.proposal);
          }}
        />
      ) : !open ? (
        <span className="pp-btns">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Pick the company
          </button>
          {p.company.name && (
            <button type="button" className="btn btn-sm btn-wrap" onClick={() => setAdding(true)}>
              Add {p.company.name} to Merlin
            </button>
          )}
        </span>
      ) : (
        <form
          className="pp-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            void link();
          }}
        >
          <label className="pp-field-l" htmlFor={`pp-link-${p.id}`}>
            Its full name or website
          </label>
          <span className="pp-link-row">
            <input id={`pp-link-${p.id}`} className="input" autoComplete="off" value={q} placeholder="Like Quill Analytics or quill.example" onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn btn-sm btn-pine" aria-busy={busy} disabled={busy}>
              {busy ? "Finding it" : "Link it"}
            </button>
          </span>
          {err && <span className="pp-link-err">{err}</span>}
        </form>
      )}
    </div>
  );
}
