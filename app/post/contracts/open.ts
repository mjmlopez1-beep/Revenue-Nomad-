/**
 * Opening Contracts (the new look's own page, ContractsPage.tsx) from elsewhere: Proposals' "Send a
 * contract to sign", a contract a Proposals address or the bell named (?p=proposals&dc=<id>), a
 * deal's contract on Pipeline. With a contract's id it opens in the field placer (?p=contracts&dc=<id>).
 *
 * Small on purpose: the pages that link here don't load the Contracts page to do it.
 */

let want: string | null = null;
const OPEN_EVENT = "rn-open-contract";

/** Open Contracts, at this contract when `id` is given (Contracts already open hears it through useOpenContract). */
export function openContract(ui: { page: string; openPage: (p: "contracts") => void }, id?: string | null) {
  want = id ?? null;
  if (ui.page === "contracts") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    return;
  }
  ui.openPage("contracts");
}

/** The contract openContract asked for, once. */
export function takeContract(): string | null {
  const v = want;
  want = null;
  return v;
}

/** Contracts, already open: hear a contract asked for. */
export function onOpenContract(open: (id: string | null) => void): () => void {
  const on = () => open(takeContract());
  window.addEventListener(OPEN_EVENT, on);
  return () => window.removeEventListener(OPEN_EVENT, on);
}
