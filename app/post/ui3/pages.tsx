"use client";

/** The new design's own pages, by key (head.ts UI3_BUILT lists the ones built). */
import type { Ui3PageKey } from "./head";
import { isUi3WorkKey } from "./work/pages";
import { WorkPage } from "./work/WorkPage";
export type { Ui3PageKey };

export function Ui3Page({ k }: { k: Ui3PageKey }) {
  if (isUi3WorkKey(k)) return <WorkPage k={k} />;
  return null;
}
