"use client";

/**
 * "See it as Dana will": the proposal exactly as the client's page draws it (app/sign/ProposalView.tsx),
 * from what is on screen now, in a sheet. Picking an option works as it will for them, here only:
 * nothing is saved and nothing is sent. Blanks still to fill read as their labels.
 */
import { useMemo, useState } from "react";
import type { Choice, ProposalRec } from "@/lib/proposals/types";
import { ProposalView } from "../../sign/ProposalView";
import { Sheet } from "../ui";
import { firstName, frozenOf } from "./model";
import "../../sign/sign.css";
import "../../sign/clientview.css";

export function ClientPreview({ p, close, me, onClose }: { p: ProposalRec; close: boolean; me?: { name: string; title: string }; onClose: () => void }) {
  const doc = useMemo(() => frozenOf(p, close, undefined, me), [p, close, me]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const who = firstName(doc.to.name) || "the client";
  const pick = (optionId: string) => setChoice((c) => ({ optionId, addOnIds: c?.addOnIds ?? [] }));
  const addOn = (id: string, on: boolean) =>
    setChoice((c) => {
      const base = c ?? { optionId: doc.pricing?.options.find((o) => o.recommended)?.id ?? doc.pricing?.options[0]?.id ?? "", addOnIds: [] };
      return { ...base, addOnIds: on ? [...new Set([...base.addOnIds, id])] : base.addOnIds.filter((x) => x !== id) };
    });
  return (
    <Sheet title={`As ${who} will read it`} onClose={onClose} dialog full className="pz-client">
      <div className="pz-client-body">
        <p className="pz-note">A preview from what is in the editor now. Picking an option here saves nothing and sends nothing.</p>
        <ProposalView
          doc={doc}
          openUntil={p.linkDays === 0 ? "none" : null}
          choice={choice}
          onPick={doc.pricing ? pick : undefined}
          onAddOn={doc.pricing ? addOn : undefined}
          titleAs="h2"
          sign={<p className="pz-note">{who === "the client" ? "The client" : who} signs here from the link: they confirm their email with a code, agree to sign electronically and type their name.</p>}
        />
      </div>
    </Sheet>
  );
}
