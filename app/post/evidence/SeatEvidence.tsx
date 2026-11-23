"use client";

/**
 * Evidence Bank on Your seats (Seats.dc.html, the Evidence case column): for Close members in the
 * new look, each seat says where its case stands and offers "Finish its evidence case", which opens
 * Evidence Bank at that seat's draft (open.ts). A seat added during the visit starts its draft at
 * once (draft on seat add, api.ts draftNewSeats). Without Close the column says it is on the Close
 * plan; with the new look off nothing here draws or runs.
 *
 * Small on purpose: Your seats loads this, never the Evidence Bank page itself.
 */
import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { openEvidence } from "./open";
import { evidenceOpen } from "./evidenceModel";
import type { EvidenceStatus } from "./types";

/** Each seat's case: "ready", "draft", or absent (none yet). Null while it loads, or when Evidence Bank is not the member's. */
export function useSeatCases(seatIds: readonly string[], on: boolean): Map<string, EvidenceStatus> | null {
  const [m, setM] = useState<Map<string, EvidenceStatus> | null>(null);
  const before = useRef<Set<string> | null>(null);
  const load = async () => {
    const r = await api.list();
    if (api.failed(r)) return;
    setM(new Map(r.filter((c) => c.seatId).map((c) => [c.seatId!, c.status])));
  };
  useEffect(() => {
    if (!on) return;
    void load();
  }, [on]);
  // Draft on seat add: seats that arrive after the page opened.
  useEffect(() => {
    if (!on) return;
    if (!before.current) {
      before.current = new Set(seatIds);
      return;
    }
    const prev = before.current;
    before.current = new Set([...prev, ...seatIds]);
    void api.draftNewSeats(prev, seatIds, true).then((fresh) => {
      if (fresh.length) void load();
    });
  }, [on, seatIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return on ? m : null;
}

/** Whether Evidence Bank's seat column applies: the new look on, and the plan's Close. */
export const seatEvidenceOn = (ui2: boolean, plan: { canClose: boolean } | null | undefined) => ui2 && evidenceOpen(plan);

/** The fill line under the column's head. */
export function seatCasesFill(m: Map<string, EvidenceStatus> | null, seatIds: readonly string[], close: boolean): string {
  if (!close) return "On the Close plan";
  if (!m) return "One case per seat";
  const ready = seatIds.filter((id) => m.get(id) === "ready").length;
  return `${ready} of ${seatIds.length} ${seatIds.length === 1 ? "case" : "cases"} ready`;
}

/** The seat's case, in its cell: Case ready (open it), or Finish its evidence case. */
export function SeatCaseCell({ seatId, status, page, openPage, name }: { seatId: string; status: EvidenceStatus | undefined; page: string; openPage: (p: "evidence") => void; name: string }) {
  const go = () => openEvidence({ page, openPage }, seatId);
  if (status === "ready")
    return (
      <span className="sp-two">
        <span className="sp-tag sp-tag-ok">Case ready</span>
        <button type="button" className="sp-mini" aria-label={`Open the evidence case for your seat at ${name}`} onClick={go}>
          Open it
        </button>
      </span>
    );
  return (
    <span className="sp-two">
      <button type="button" className="btn btn-sm btn-pine sp-evcase" aria-label={`Finish its evidence case: your seat at ${name}`} onClick={go}>
        Finish its evidence case
      </button>
      <span className="sp-sub">{status === "draft" ? "Draft started · 3 questions" : "3 questions, about 3 minutes"}</span>
    </span>
  );
}

/** The same on a phone's seat card (Seats.tsx), under the card: one line and the button. */
export function SeatCaseLine({ seatId, status, openPage, name }: { seatId: string; status: EvidenceStatus | undefined; openPage: (p: "evidence") => void; name: string }) {
  const go = () => openEvidence({ page: "seats", openPage }, seatId);
  return (
    <p className="ys-evcase">
      <span>{status === "ready" ? "Its evidence case is ready." : status === "draft" ? "Its evidence case is a draft. Three questions finish it." : "Three questions turn this seat into an evidence case."}</span>
      <button type="button" className="btn btn-sm btn-pine" aria-label={`${status === "ready" ? "Open the evidence case" : "Finish its evidence case"}: your seat at ${name}`} onClick={go}>
        {status === "ready" ? "Open the case" : "Finish its evidence case"}
      </button>
    </p>
  );
}
