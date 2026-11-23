/**
 * Opening Evidence Bank from elsewhere (Your seats' "Finish its evidence case"): at a seat's case,
 * which the page finds or starts as a draft (api.ts draftFromSeat). Small on purpose: the pages that
 * link here don't load Evidence Bank to do it.
 */

let want: string | null = null;
const OPEN_EVENT = "rn-open-evidence";

/** Open Evidence Bank at this seat's case (Evidence Bank already open hears it through onOpenEvidence). */
export function openEvidence(ui: { page: string; openPage: (p: "evidence") => void }, seatId?: string | null) {
  want = seatId ?? null;
  if (ui.page === "evidence") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    return;
  }
  ui.openPage("evidence");
}

/** The seat openEvidence asked for, once. */
export function takeEvidenceSeat(): string | null {
  const v = want;
  want = null;
  return v;
}

/** Evidence Bank, already open: hear a seat asked for. */
export function onOpenEvidence(open: (seatId: string | null) => void): () => void {
  const on = () => open(takeEvidenceSeat());
  window.addEventListener(OPEN_EVENT, on);
  return () => window.removeEventListener(OPEN_EVENT, on);
}
