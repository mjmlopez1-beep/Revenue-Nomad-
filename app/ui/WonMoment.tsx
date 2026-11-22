"use client";

/**
 * The win moment: a deal Merlin saw won. The keep with your trail at its door (Fractions, quiet,
 * 160px), the client's name, what it is worth a month when the member gave the terms, and Add it
 * as your seat. It lives in two places only: Home's "You won" card and the top of the pipeline's
 * Won column (`compact`, with no button there: the card under it has one).
 */
import type { PipelineRec } from "@/lib/pipeline";
import { monthWords } from "@/lib/pipeline";
import { WonArt } from "./fractions/lazy";

export function WonMoment({ rec, onSeat, compact }: { rec: Pick<PipelineRec, "name" | "won" | "seat" | "how">; onSeat?: () => void; compact?: boolean }) {
  const name = rec.name ?? "a new client";
  const value = rec.won?.monthly ? monthWords(rec.won.monthly) : null;
  return (
    <div className={`won${compact ? " won-compact" : ""}`}>
      <WonArt height={compact ? 88 : 160} on={compact ? "white" : "mint"} className="won-art" />
      <div className="won-t">
        <span className="won-k">You won</span>
        <span className="won-h">{name}</span>
        <span className="won-v">{value ? <span className="t-num">{value}</span> : rec.seat ? "Your seat here is confirmed." : compact ? "Add the terms and your seat." : `${rec.how ? `${rec.how}. ` : ""}Add it as your seat and what you add earns credits.`}</span>
        {onSeat && !rec.seat ? (
          <button type="button" className="btn btn-pine won-btn" onClick={onSeat}>
            Add it as your seat
          </button>
        ) : null}
      </div>
    </div>
  );
}
