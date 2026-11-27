"use client";

/**
 * A few quick picks about a company the member just made their client (a won deal, a claimed
 * seat): who it sells to, how big its customers are, its business model, sales motion, deal size
 * and sales cycle. Only the ones still empty are asked, five at most, each one optional. They are
 * normal facts (the fill action): they earn by the usual rules, and any member can confirm or
 * report them. The member's ideal client learns from them (lib/idealClient.ts).
 */
import { useState } from "react";
import { fieldDef, picksJoin, type FieldDef } from "@/lib/tableFields";
import { PickChips, useUi } from "./ui";

/** What is asked about a client, in order. */
export const CLIENT_PICKS = ["sellsTo", "customerSize", "businessModel", "motion", "dealSize", "salesCycle"] as const;
export const CLIENT_PICKS_MAX = 5;
const ASK: Record<string, string> = {
  sellsTo: "Which industries are their customers in?",
  customerSize: "How big are their customers?",
  businessModel: "Do they sell to businesses or to consumers?",
  motion: "How do they sell?",
  dealSize: "How big is a typical deal?",
  salesCycle: "How long does a deal take to close?",
};

/** The picks to ask at a company: the empty ones, five at most. */
export const picksToAsk = (empty: readonly string[]) => CLIENT_PICKS.filter((f) => empty.includes(f)).slice(0, CLIENT_PICKS_MAX);

export function ClientPicks({ companyId, name }: { companyId: string; name: string | null }) {
  const ui = useUi();
  // Asked once, as the sheet opens: a pick saved here is no longer empty, and its row stays to show what was saved.
  const [fields] = useState(() => picksToAsk(ui.emptyAt?.(companyId, CLIENT_PICKS) ?? []));
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!fields.length) return null;
  const save = async (f: FieldDef, value: string) => {
    setBusy(f.key);
    const ok = await ui.fill({ entity: "company", id: companyId, field: f.key }, value);
    setBusy(null);
    if (ok) setSaved((x) => ({ ...x, [f.key]: value }));
  };
  return (
    <fieldset className="pl-won-row cp-picks">
      <legend className="mn-k">A few quick picks about {name ?? "this client"}</legend>
      <p className="cp-note">Optional. Each one is a fact on the company, and your ideal client learns from it.</p>
      {fields.map((key) => {
        const f = fieldDef("company", key);
        if (!f?.options) return null;
        const done = saved[key];
        return (
          <div key={key} className="cp-q">
            <span className="cp-ql">{ASK[key]}</span>
            {done ? (
              <span className="cp-done">Saved: {done.replace(/; /g, ", ")}</span>
            ) : f.multi ? (
              <>
                <PickChips f={f} picked={multi} onChange={setMulti} cls="chip tp-chipbtn" wrap="tp-chips" disabled={busy === key} />
                <button type="button" className="btn btn-sm" disabled={!multi.length || busy === key} onClick={() => void save(f, picksJoin(f, multi))}>
                  {busy === key ? "Saving" : "Save"}
                </button>
              </>
            ) : (
              <div className="tp-chips" role="group" aria-label={ASK[key]}>
                {f.options.map((o) => (
                  <button key={o} type="button" className="chip tp-chipbtn" disabled={busy === key} onClick={() => void save(f, o)}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
