/**
 * What Find opens on when another page sends the member there (Home's Ask Merlin, a quick start):
 * an Ask plan to set, or a company to look up. Set just before opening Find, taken once by it.
 */
import type { AskPlan } from "@/lib/ask";

export type FindStart = { plan: AskPlan; text: string } | { lookup: string } | { step: "save" | "filter" };
let next: FindStart | null = null;
export const setFindStart = (x: FindStart | null) => {
  next = x;
};
export const takeFindStart = (): FindStart | null => {
  const x = next;
  next = null;
  return x;
};
