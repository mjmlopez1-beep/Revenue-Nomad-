/**
 * Free, Pro and Pro + Close, row by row: the plans sheet and Plan and billing (app/post/Billing.tsx
 * CompareTable), the Pro welcome, and the landing page's pricing (app/landing/Pricing.tsx) read
 * these rows, so they never say different things. Pure (no I/O), shared by server and client.
 *
 * Pro is sold as winning clients: opening the company and the person who held the seat. Pro +
 * Close adds the proposal they sign. Flat prices only: no fee on what a member wins, anywhere.
 */
import { FEATURE_NAME } from "../radar/types";
import { COMPANY_PRICE, PRO_OPENS_DAILY } from "../tableFields";
import { FREE_MCP_PER_DAY, PRICES, PRO_CREDITS, TIER_NAME } from "./rules";

/** The three plans in order, with what each costs and one line on what you get. */
export const PLANS = [
  { key: "free", name: "Free", month: 0, year: 0, line: `Credits to start, 1 for each fact you add, one ${FEATURE_NAME} company a day.` },
  { key: "pro", name: TIER_NAME.pro, month: PRICES.month, year: PRICES.year, line: `Companies open free (${PRO_OPENS_DAILY} a day), every alert, rate ranges, ${PRO_CREDITS} credits a month.` },
  { key: "close", name: TIER_NAME.close, month: PRICES.closeMonth, year: PRICES.closeYear, line: "Everything in Pro, plus proposals drafted from your call, sent and signed." },
] as const;

/** [what, Free, Pro, Pro + Close]. */
export const PLAN_ROWS: [string, string, string, string][] = [
  ["Opening companies", `1 a day from ${FEATURE_NAME}, others ${COMPANY_PRICE} credits`, `Free, up to ${PRO_OPENS_DAILY} a day plus all of ${FEATURE_NAME}`, `Free, up to ${PRO_OPENS_DAILY} a day plus all of ${FEATURE_NAME}`],
  ["Fellow fractionals", "Free", "Free", "Free"],
  ["Proposals and e-signature", "In your trial only", "In your trial only", "Every template, send and get signed, unlimited"],
  ["Claude drafting and your own contracts", "In your trial only", "In your trial only", "Drafted from your call, your own templates and contracts with signature fields"],
  ["Pipeline on a signature", "You move it", "You move it", "Moves itself when they sign"],
  ["Open roles", "Alerts: weekly email", "Alerts as they open", "Alerts as they open"],
  ["Saved views", "1, with the weekly email", "As many as you want, with alerts", "As many as you want, with alerts"],
  [FEATURE_NAME, "Every signal each morning, one company a day fully open", "Every company in it open free, signals in Slack as they happen", "Every company in it open free, signals in Slack as they happen"],
  ["Rate benchmarks", "Medians by function", "Ranges by function and client size", "Ranges by function and client size"],
  ["Slack", "The weekly roles post", "Every alert", "Every alert"],
  ["Claude", `${FREE_MCP_PER_DAY} requests a day`, "No daily cap", "No daily cap"],
  ["Credits", "1 for each fact you add", `Plus ${PRO_CREDITS} each paid month`, `Plus ${PRO_CREDITS} each paid month`],
  ["Messages, Recently hired", "Included", "Included", "Included"],
];

/** The rows the landing page leads with: the ones that win a client, first. */
export const LANDING_ROWS = PLAN_ROWS.slice(0, 6);
