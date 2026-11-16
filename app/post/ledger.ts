/**
 * One line of the credit history as a sentence a person can follow. Used by the credits
 * popover and the Your credits page, so both say the same thing.
 *
 * The server sends each row's field as a label ("Role", "Start month", "Person email",
 * "Private rate", "Hidden company") and its reason as a key (fill, unlock, refund, reversal,
 * referral, confirm), or as words for the rare rows that have no field.
 */
import type { LedgerRow } from "@/lib/tableTypes";
import { ALL_FIELDS, HIDDEN_COMPANY } from "@/lib/tableFields";
import { fieldText } from "./hooks";

/** A field's label to how it reads in a sentence: "the role", "a person's email". */
const SAY = new Map<string, string>();
for (const { entity, f } of ALL_FIELDS) {
  if (!f.say) continue;
  // A person's fields arrive as "Person name", "Person LinkedIn" (see ledgerLabel in lib/table.ts).
  const label = entity === "contact" ? `Person ${fieldText(f.label)}` : f.label;
  if (!SAY.has(label)) SAY.set(label, f.say);
}
const PRIVATE_RATE = "Private rate";
const thing = (label: string) => SAY.get(label) ?? `the ${fieldText(label)}`;

/** `note` explains an amount of 0. */
export function ledgerLine(l: LedgerRow, earnCap: number): { text: string; note?: string } {
  const at = l.company ? ` at ${l.company}` : "";
  const priv = l.field === PRIVATE_RATE;
  switch (l.reason) {
    case "fill":
      return {
        text: priv ? "Shared a rate privately" : `Added ${thing(l.field)}${at}`,
        note: l.delta === 0 ? `No credit. You had already earned that day's ${earnCap}.` : undefined,
      };
    case "unlock":
      return { text: l.field === HIDDEN_COMPANY ? `Unlocked a hidden company${l.company ? `, ${l.company}` : ""}` : `Unlocked ${thing(l.field)}${at}` };
    case "refund":
      return { text: `Refund for ${thing(l.field)}${at}, removed after review` };
    case "reversal":
      return { text: `Credit taken back for ${thing(l.field)}${at}, removed after review` };
    case "Removed":
      return { text: "Removed a rate you shared privately" };
    case "referral":
      return { text: l.company ? `Invite bonus, with ${l.company}` : "Invite bonus" };
    case "confirm":
      return { text: `Two members confirmed ${thing(l.field)}${at}` };
    default:
      // A reason the server already wrote out in words ("Topped up to 0 when starter credits changed").
      return { text: [l.reason, l.field && l.field !== l.reason ? fieldText(l.field) : "", at.trim()].filter(Boolean).join(" ") };
  }
}
