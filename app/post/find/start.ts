/**
 * What Find opens on when another page sends the member there (Home's Ask Merlin, a quick start):
 * an Ask plan to set, or a company to look up. Set just before opening Find, taken once by it.
 * While Find is already on screen ("/" pressed on Find), it hears it at once instead (listenFindStart).
 */
import type { AskPlan } from "@/lib/ask";
import type { FindKind } from "./findModel";

export type FindStart = { plan: AskPlan; text: string } | { lookup: string } | { step: "save" | "filter" } | { kind: FindKind };
let next: FindStart | null = null;
let live: ((x: FindStart) => void) | null = null;
export const setFindStart = (x: FindStart | null) => {
  if (x && live) {
    next = null;
    return live(x);
  }
  next = x;
};
export const takeFindStart = (): FindStart | null => {
  const x = next;
  next = null;
  return x;
};
/** Find on screen: what another part of the app asks of it arrives here. Returns the way to stop listening. */
export const listenFindStart = (f: (x: FindStart) => void) => {
  live = f;
  return () => {
    if (live === f) live = null;
  };
};
