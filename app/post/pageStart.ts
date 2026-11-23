/**
 * What a page opens on, for the new look's pages that load on their own (shell/pages.tsx imports
 * this at once, so it is read before they load).
 *
 *   takeLanding(page)   the address the app was opened at, once, when it named this page: the app
 *                       rewrites the address from its place before a lazy page has loaded, so a
 *                       tab in it (?p=credits&tab=ledger, ?p=rates&tab=seats) would be gone by then.
 *   setRatesStart       a question for Rate benchmarks' "What should I charge" from another page
 *                       (Home's Ask Merlin), set just before opening it and taken once by it.
 *   setCreditsStart     the tab Credits and usage opens on, from another page.
 */
const first = typeof window === "undefined" ? "" : window.location.search;
let landed = false;
export function takeLanding(page: string): string {
  if (landed) return "";
  const q = new URLSearchParams(first);
  if (q.get("p") !== page) return "";
  landed = true;
  return first;
}

/**
 * The tab Credits and usage opens on when another place sends the member to one (What's new's
 * Invite line opens Ways to earn): set just before opening the page and taken once by it, or, with
 * the page already open, handed to it at once (the event it listens for).
 */
let creditsTab: string | null = null;
export const CREDITS_TAB_EVENT = "rn-credits-tab";
export const setCreditsStart = (tab: string) => {
  creditsTab = tab;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CREDITS_TAB_EVENT, { detail: tab }));
};
export const takeCreditsStart = (): string | null => {
  const x = creditsTab;
  creditsTab = null;
  return x;
};

let next: string | null = null;
export const setRatesStart = (text: string | null) => {
  next = text;
};
export const takeRatesStart = (): string | null => {
  const x = next;
  next = null;
  return x;
};
