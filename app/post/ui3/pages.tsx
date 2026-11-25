"use client";

/** The new design's own pages, by key (head.ts UI3_BUILT lists the ones built). */
import type { Ui3PageKey } from "./head";
export type { Ui3PageKey };

export function Ui3Page({ k }: { k: Ui3PageKey }) {
  void k;
  return null;
}
