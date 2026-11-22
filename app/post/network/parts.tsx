"use client";

/** Small parts Your network's pages share (Network.tsx, Found.tsx, SeatGuesses.tsx). */
import { STRENGTH_WORDS, type Warmth } from "@/lib/google/types";

/**
 * Hot, Warm, Fading or Cold: the word, with the colour as a second cue. `strength`: the same grade
 * as how strong the relationship is (Strong, Good, Fading, Cold: STRENGTH_WORDS), in the same
 * colours, where a card says how strong a relationship is (a warm path's person, an introducer).
 */
export function WarmthChip({ w, strength }: { w: Warmth; strength?: boolean }) {
  return (
    <span className={`nw-warm nw-l-${w.toLowerCase()}`} data-warmth={w}>
      {strength ? STRENGTH_WORDS[w] : w}
    </span>
  );
}

/** A strength line beside its chip: "47 meetings since Dec 2024, last Oct 23 · Strong" without the " · Strong" the chip already says. */
export function besideChip(line: string, w: Warmth): string {
  const end = ` · ${STRENGTH_WORDS[w]}`;
  return line.endsWith(end) ? line.slice(0, -end.length) : line;
}
