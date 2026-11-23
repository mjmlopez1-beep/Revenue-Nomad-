/**
 * Free, Pro and Close, row by row: the plans sheet and Plan and billing (app/post/Billing.tsx
 * CompareTable), the Pro welcome, and the landing page's pricing (app/landing/Pricing.tsx) read
 * these rows, so they never say different things. Pure (no I/O), shared by server and client.
 *
 * Pro is sold as winning clients: opening the company and the person who held the seat. Close
 * adds the proposal they sign. Flat prices only: no fee on what a member wins, anywhere. The Terms
 * of Service (app/terms/Terms.tsx) draw Pro and Close from these too.
 */
import { FEATURE_NAME } from "../radar/types";
import { COMPANY_PRICE, PRO_OPENS_DAILY } from "../tableFields";
import { FREE_MCP_PER_DAY, FREE_SAVED_VIEWS, PRICES, PRO_CREDITS, TIER_NAME, WORKFLOW_PLAN } from "./rules";

/** The three plans in order, with what each costs and one line on what you get. */
export const PLANS = [
  { key: "free", name: "Free", month: 0, year: 0, line: `Credits to start, 1 for each fact you add, one ${FEATURE_NAME} company a day.` },
  { key: "pro", name: TIER_NAME.pro, month: PRICES.month, year: PRICES.year, line: `Any company opens free, up to ${PRO_OPENS_DAILY} a day, every alert, ${PRO_CREDITS} credits a month.` },
  { key: "close", name: TIER_NAME.close, month: PRICES.closeMonth, year: PRICES.closeYear, line: "Everything in Pro, plus proposals drafted from your call, sent and signed." },
] as const;

/** [what, Free, Pro, Close]. */
export const PLAN_ROWS: [string, string, string, string][] = [
  // The same rule as OPENS_RULE, cell-sized.
  ["Opening companies", `1 a day from ${FEATURE_NAME}, others ${COMPANY_PRICE} credits`, `Free, up to ${PRO_OPENS_DAILY} a day, ${FEATURE_NAME} not counted`, `Free, up to ${PRO_OPENS_DAILY} a day, ${FEATURE_NAME} not counted`],
  ["Fellow fractionals", "Free", "Free", "Free"],
  ["Proposals and e-signature", "In your trial only", "In your trial only", "Every template, send and get signed, unlimited"],
  ["Merlin drafting and your own contracts", "In your trial only", "In your trial only", "Drafted from your call, your own templates and contracts with signature fields"],
  ["Pipeline after a signature", "You move it", "You move it", "Moves to Won when they sign"],
  ["Drop in a contract, fields placed for you", "In your trial only", "In your trial only", "Merlin finds where everyone signs, places the fields and drafts the note"],
  ["Change it by talking", "In your trial only", "In your trial only", "Say or type a change: Merlin rewrites the sections, checks the numbers and keeps each version"],
  ["Start from the call", "In your trial only", "In your trial only", "Paste the transcript or say what was agreed: a draft in your template, the blanks labelled"],
  ["Open roles", "Alerts: weekly email", "Alerts as they open", "Alerts as they open"],
  // After it goes out (lib/close). Below the landing page's six rows, so the landing page leads as before.
  ["Know when they open it and what they read", "In your trial only", "In your trial only", "Opens, new readers and time on each section and price, with when to follow up"],
  ["Reminders until they sign", "In your trial only", "In your trial only", "Sent for you on day 2 and day 7, and before the link closes"],
  ["Renewal reminders", "In your trial only", "In your trial only", "30 days before the term ends, with the renewal drafted"],
  ["Give them options to pick from", "In your trial only", "In your trial only", "Up to 3 options and add-ons: they pick one, see the total and sign it"],
  ["Sealed PDF anyone can check", "In your trial only", "In your trial only", "Every signed proposal and document, sealed and emailed to both sides"],
  ["Saved views", "1, with the weekly email", "As many as you want, with alerts", "As many as you want, with alerts"],
  [FEATURE_NAME, "Every signal each morning, one company a day fully open", "Every company in it open free, signals in Slack as they happen", "Every company in it open free, signals in Slack as they happen"],
  ["Rate benchmarks", "Medians by function", "Ranges by function and client size", "Ranges by function and client size"],
  ["Slack", "The weekly roles post", "Every alert", "Every alert"],
  ["Claude", `${FREE_MCP_PER_DAY} requests a day`, "No daily cap", "No daily cap"],
  ["Credits", "1 for each fact you add", `Plus ${PRO_CREDITS} each paid month`, `Plus ${PRO_CREDITS} each paid month`],
  ["Messages, Recently hired", "Included", "Included", "Included"],
];

/** Close's ways of getting a contract out, in the plans sheet and the Terms; the landing page keeps its six. */
const CLOSE_DETAIL = new Set(["Drop in a contract, fields placed for you", "Change it by talking", "Start from the call"]);
/** The rows the landing page leads with: the ones that win a client, first. */
export const LANDING_ROWS = PLAN_ROWS.filter((r) => !CLOSE_DETAIL.has(r[0])).slice(0, 6);

/** The rows where Close does more than Pro: [what, Pro, Close]. The Terms of Service list them under Close. */
export const CLOSE_ADDS: [string, string, string][] = PLAN_ROWS.filter((r) => r[2] !== r[3]).map(([what, , pro, close]) => [what, pro, close]);

/**
 * What Pro doesn't include that Close does, in a few words each: the Pro card on the trial's plans
 * sheet and the Terms of Service. Each is one of CLOSE_ADDS (scripts/test-prices.mts checks it).
 */
export const PRO_LEAVES_OUT = ["Sending for signature", "Your own templates", "Merlin drafting", "The pipeline moving to Won when they sign"] as const;

/**
 * The landing page's rows after LANDING_ROWS: what came with alerts, workflows, Evidence Bank and
 * Agent access, read from the same rules the app gates them with (lib/billing/rules.ts
 * FREE_SAVED_VIEWS, FREE_ALERT_EVERY and alertOnPlan, WORKFLOW_PLAN, FREE_MCP_PER_DAY; Evidence Bank
 * is Close's, like proposals), and the app's own Rate benchmarks row. Workflows are Beta, behind
 * RN_WORKFLOWS: the row shows only when the server says they are on. Not part of PLAN_ROWS, so the
 * plans sheet and the Terms read as before.
 */
export function landingMoreRows(workflows: boolean): [string, string, string, string][] {
  const [f, p, c] = [WORKFLOW_PLAN.free, WORKFLOW_PLAN.pro, WORKFLOW_PLAN.close];
  const rates = PLAN_ROWS.find((r) => r[0] === "Rate benchmarks");
  return [
    ["Alerts on your lists", `${FREE_SAVED_VIEWS} list, by email and the bell, each morning or weekly`, "Every list, as it happens, in Slack too", "Every list, as it happens, in Slack too"],
    ...(workflows
      ? ([
          [
            "Workflows (Beta)",
            `${f.flows} workflow, free steps only`,
            `Up to ${p.flows}, with the steps that cost credits`,
            `Up to ${c.flows}, plus proposal triggers and the Evidence Bank step`,
          ],
        ] as [string, string, string, string][])
      : []),
    ["Evidence Bank", "In your trial only", "In your trial only", "Your past results, matched to a proposal"],
    ["Your AI assistant (Agent access)", `${FREE_MCP_PER_DAY} requests a day`, "No daily cap", "No daily cap"],
    ...(rates ? [rates] : []),
  ];
}
