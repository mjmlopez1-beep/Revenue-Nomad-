/**
 * What a page opens on, for the new look's pages that load on their own (shell/pages.tsx imports
 * this at once, so it is read before they load).
 *
 *   takeLanding(page)   the address the app was opened at, once, when it named this page: the app
 *                       rewrites the address from its place before a lazy page has loaded, so a
 *                       tab in it (?p=credits&tab=ledger, ?p=rates&tab=seats) would be gone by then.
 *   setRatesStart       a question for Rate benchmarks' "What should I charge" from another page
 *                       (Home's Ask Merlin), set just before opening it and taken once by it.
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

let next: string | null = null;
export const setRatesStart = (text: string | null) => {
  next = text;
};
export const takeRatesStart = (): string | null => {
  const x = next;
  next = null;
  return x;
};
