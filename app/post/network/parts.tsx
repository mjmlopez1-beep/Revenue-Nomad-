"use client";

/** Small parts Your network's pages share (Network.tsx, Found.tsx, SeatGuesses.tsx). */
import type { Warmth } from "@/lib/google/types";

/** Hot, Warm, Fading or Cold: the word, with the colour as a second cue. */
export function WarmthChip({ w }: { w: Warmth }) {
  return <span className={`nw-warm nw-l-${w.toLowerCase()}`}>{w}</span>;
}
