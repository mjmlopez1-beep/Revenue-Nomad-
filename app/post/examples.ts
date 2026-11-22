/**
 * Example rows for first visits (BUILD_PLAN F6, constraint 6): what a page looks like before the
 * member has data of their own there, where Merlin has none of its own to show either (a deal, a
 * conversation, a proposal, a contract). Made up, from the brief's cast.
 *
 * An example is never the thing itself: it is wrapped (Example<T>), so it cannot be handed to
 * anything that takes a real record (an action, a count, an export, the connector). A page draws
 * `x.value` with its "Example" label; anything that counts, sends or exports takes `realOnly(rows)`
 * first. scripts/test-firstvisit.mts checks that examples are never counted.
 */

/** Said on every example row, and nothing else. */
export const EXAMPLE_LABEL = "Example";

/** An example row: never a record, never counted, never sent, never exported. */
export interface Example<T> {
  readonly kind: "example";
  readonly label: typeof EXAMPLE_LABEL;
  readonly value: T;
}
export const example = <T>(value: T): Example<T> => Object.freeze({ kind: "example" as const, label: EXAMPLE_LABEL, value });
export const isExample = (x: unknown): x is Example<unknown> => !!x && typeof x === "object" && (x as { kind?: unknown }).kind === "example";

/** A page's rows with any example taken out: what counts, sends and exports read. */
export function realOnly<T>(rows: readonly (T | Example<T>)[]): T[] {
  return rows.filter((r): r is T => !isExample(r));
}
/** A list that is examples only (a first visit): a page says so and offers its one next action. */
export const onlyExamples = (rows: readonly unknown[]) => rows.length > 0 && rows.every(isExample);

/* ---------- the examples ---------- */

/** A deal on the pipeline board (Pipeline, first visit). Outside every total. */
export interface ExampleDeal {
  company: string;
  stage: "Target" | "Reached out" | "Talking" | "Proposal" | "Won";
  person: string;
  line: string;
  value?: string;
}
export const EXAMPLE_DEALS: readonly Example<ExampleDeal>[] = [
  example({ company: "Northwind Clinics", stage: "Talking", person: "Dana Whitfield, COO", line: "Met on a call. Asked for a proposal by Friday.", value: "$9,000 a month" }),
  example({ company: "Halcyon Freight", stage: "Reached out", person: "Head of Sales", line: "Note sent. Merlin will tell you when they reply." }),
];

/** A conversation (Messages, first visit). */
export interface ExampleConversation {
  with: string;
  about: string;
  last: string;
}
export const EXAMPLE_CONVERSATIONS: readonly Example<ExampleConversation>[] = [
  example({ with: "A fractional CMO", about: "Cedar and Pine", last: "They need Sales too. Want an intro to their COO?" }),
];

/** A proposal (Proposals, first visit). */
export interface ExampleProposal {
  title: string;
  company: string;
  status: "Draft" | "Opened" | "Signed";
  line: string;
}
export const EXAMPLE_PROPOSALS: readonly Example<ExampleProposal>[] = [
  example({ title: "Fractional VP Sales, 3 days a week", company: "Larkspur Learning", status: "Opened", line: "Opened twice. 6 minutes on Pricing." }),
];

/** A contract out for signature (Contracts, first visit). */
export interface ExampleContract {
  title: string;
  company: string;
  signers: string;
  status: "Out for signature" | "Signed";
}
export const EXAMPLE_CONTRACTS: readonly Example<ExampleContract>[] = [
  example({ title: "Consulting agreement", company: "Northwind Clinics", signers: "Dana Whitfield, then you", status: "Out for signature" }),
];
