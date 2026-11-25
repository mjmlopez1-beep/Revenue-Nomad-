/**
 * The new design's Work and Community pages (RN_UI3, wave 2): which of today's page keys each one
 * takes the place of while the new design is on. Data only (no styles, no components), so the shell
 * can import it without loading anything of the new design.
 *
 *   proposals            Proposals (the home, the featured draft, Your proposals; the editor inside)
 *   contracts            Contracts (one list, one action a row; Send for signature, the detail)
 *   evidence             Evidence Bank (Close)
 *   fractionals          Community: Fractionals, Peers, Referral partners (the fractionals, peers and partners keys)
 *   messages             Community: Messages
 *   pipeline             Pipeline (board, table, intros; the money summary)
 *   workflows            Workflows (Simple by default, Advanced, Runs, Templates, Your workflows), page key "alerts"
 */
export type Ui3WorkKey = "w:proposals" | "w:contracts" | "w:evidence" | "w:fractionals" | "w:messages" | "w:pipeline" | "w:workflows";

/** Today's page key on screen to the new page that takes its place. */
export const UI3_WORK: Readonly<Record<string, Ui3WorkKey>> = {
  proposals: "w:proposals",
  contracts: "w:contracts",
  evidence: "w:evidence",
  fractionals: "w:fractionals",
  peers: "w:fractionals",
  partners: "w:fractionals",
  messages: "w:messages",
  pipeline: "w:pipeline",
  alerts: "w:workflows",
};

/** The ones built so far (the rest draw today's page inside the new shell). */
export const UI3_WORK_BUILT: readonly Ui3WorkKey[] = ["w:proposals", "w:contracts", "w:evidence", "w:fractionals", "w:messages", "w:pipeline", "w:workflows"];

/** The new page for today's page on screen, or null. */
export const ui3WorkKey = (page: string): Ui3WorkKey | null => {
  const k = UI3_WORK[page];
  return k && UI3_WORK_BUILT.includes(k) ? k : null;
};
export const isUi3WorkKey = (k: string): k is Ui3WorkKey => k.startsWith("w:");
