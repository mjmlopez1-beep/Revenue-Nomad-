"use client";

/** Small parts Your network's pages share (Network.tsx, Found.tsx, SeatGuesses.tsx). */
import { STRENGTH_WORDS, type Warmth } from "@/lib/google/types";
import { WarmthChip as SystemWarmthChip, type Strength } from "../../ui/system";

/**
 * Hot, Warm, Fading or Cold: the word, with the colour as a second cue (the system's WarmthChip:
 * Hot pine, Warm mint, Fading and Cold outline). `strength`: the same grade as how strong the
 * relationship is (Strong, Good, Fading, Cold: STRENGTH_WORDS), in the same tones, where a card
 * says how strong a relationship is (a warm path's person, an introducer).
 */
export function WarmthChip({ w, strength }: { w: Warmth; strength?: boolean }) {
  return <SystemWarmthChip warmth={strength ? (STRENGTH_WORDS[w] as Strength) : w} />;
}

/** A strength line beside its chip: "47 meetings since Dec 2024, last Oct 23 · Strong" without the " · Strong" the chip already says. */
export function besideChip(line: string, w: Warmth): string {
  const end = ` · ${STRENGTH_WORDS[w]}`;
  return line.endsWith(end) ? line.slice(0, -end.length) : line;
}
