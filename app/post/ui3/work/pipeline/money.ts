/**
 * Pipeline's money summary (the new design, RN_UI3), from the member's own deals only: the values
 * they typed a month, or a Won deal's terms (a Won deal without terms counts the value typed, as the
 * server's dealMonthly does). Proposals out is a part of the open pipeline, never added to it. No
 * probabilities, no guesses: a deal with no value counts as none.
 * Pure: the page and scripts/test-ui3-work.mts read it.
 */
import type { PipelineRec } from "@/lib/pipeline";

type Deal = Pick<PipelineRec, "stage" | "won" | "monthly"> & { value?: number | null };
/** The open stages, To reach out to Proposal. */
export const OPEN_STAGES = ["reach", "sent", "replied", "meeting", "proposal"] as const;
/** What a deal counts a month: a Won deal's terms, else the value typed (the server's dealMonthly, in PipelineRec.monthly). */
const monthly = (r: Deal) => r.monthly;

/**
 * A deal with a value: Won terms, or a value the member typed (an explicit 0 included). No value
 * (null) is unknown: left out of every total, and counted apart so the page can say how many.
 */
const priced = (r: Deal) => !!r.won || (r.value !== undefined ? r.value !== null : r.monthly > 0);

export function moneyOf(deals: readonly Deal[]) {
  const open = deals.filter((r) => (OPEN_STAGES as readonly string[]).includes(r.stage));
  const props = open.filter((r) => r.stage === "proposal");
  const won = deals.filter((r) => r.stage === "won");
  const sum = (xs: readonly Deal[]) => xs.filter(priced).reduce((s, r) => s + monthly(r), 0);
  // Won deals without terms: the page asks for them (the value typed counts meanwhile; none typed counts nothing).
  return {
    open: sum(open),
    openN: open.length,
    openNoValue: open.filter((r) => !priced(r)).length,
    props: sum(props),
    propsN: props.length,
    propsNoValue: props.filter((r) => !priced(r)).length,
    won: sum(won),
    wonN: won.length,
    wonNoTerms: won.filter((r) => !r.won).length,
  };
}

const deals = (n: number) => `${n} unpriced ${n === 1 ? "deal" : "deals"}`;
/**
 * What a money card leads with (owner review, simulated operators 3): with every deal unpriced,
 * "Value unknown" and how many, never $0; with some unpriced, the total of the priced ones and how
 * many are left out of it; with all priced (an explicit $0 included), the total.
 */
export function moneyHead(total: number, n: number, unpriced: number): { big: string; unknown: boolean; left: string | null } {
  if (n > 0 && unpriced >= n) return { big: "Value unknown", unknown: true, left: `${deals(unpriced)}, not counted` };
  return { big: kMoney(total), unknown: false, left: unpriced > 0 ? `Not counted: ${deals(unpriced)}` : null };
}

/** "$96.5k": one decimal under a hundred thousand, none above; dollars under a thousand. */
export const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 100_000 || n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n).toLocaleString("en-US")}`);
