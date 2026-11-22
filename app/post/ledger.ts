/**
 * One line of the credit history as a sentence a person can follow. Used by the credits
 * popover and the Your credits page, so both say the same thing.
 *
 * The server sends each row's field as a label ("Role", "Start month", "Person email",
 * "Private rate", HIDDEN_COMPANY for a company unlock, "Person name and title" or "Seat holder and
 * role" for an unlock that opened both) and its reason as a key (fill, unlock, refund, reversal,
 * referral, confirm, retract), or as words for the rows that have no field ("Refund for a role
 * that had closed", with the company after it, or "Gave back 1 credit: an ongoing seat's end month
 * is free now.", with nothing after it).
 */
import type { LedgerRow, Me } from "@/lib/tableTypes";
import { ALL_FIELDS, HIDDEN_COMPANY } from "@/lib/tableFields";
import { fieldText } from "./hooks";
import { FEATURE_NAME } from "@/lib/radar/types";

/** A field's label to how it reads in a sentence: "the role", "a person's email". */
const SAY = new Map<string, string>();
for (const { entity, f } of ALL_FIELDS) {
  if (!f.say) continue;
  // A person's fields arrive as "Person name", "Person LinkedIn" (see ledgerLabel in lib/table.ts).
  const label = entity === "contact" ? `Person ${fieldText(f.label)}` : f.label;
  if (!SAY.has(label)) SAY.set(label, f.say);
}
// One purchase that opens two facts: the server names an unlock of either half (and its refund) by the pair (boughtLabel in lib/table.ts).
SAY.set("Person name and title", "a person's name and title");
SAY.set("Seat holder and role", "the seat holder and their role");
/** A company's pick-list answers: only 5 of these earn a credit each day (Me.sellEarnLeft). */
const PICK_KEYS = new Set(["industry", "employees", "revenue", "businessModel", "motion", "dealSize", "salesCycle", "ownership"]);
const PICK_LABELS = new Set(ALL_FIELDS.filter(({ entity, f }) => entity === "company" && PICK_KEYS.has(f.key)).map(({ f }) => f.label));
const PRIVATE_RATE = "Private rate";
/** The free company of the day's row (lib/table.ts FREE_COMPANY_LINE). */
const FREE_COMPANY = "Free company of the day";
/** Trial, Pro and Close: a company opened free, up to 15 a day, named by the plan it opened on (lib/table.ts openedFreeLine). They don't count toward the day's unlocks. */
const PRO_OPEN = /^Opened free (on|in your) /;
/** A company opened free from Crystal Ball on Trial or Pro, and Free's one a day (lib/table.ts CRYSTAL_LINE, CRYSTAL_FULL_LINE). */
const CRYSTAL = `Opened free from ${FEATURE_NAME}`;
const CRYSTAL_FULL = `Free ${FEATURE_NAME} company of the day`;
const thing = (label: string) => SAY.get(label) ?? `the ${fieldText(label)}`;

/** `note` explains an amount of 0. */
export function ledgerLine(l: LedgerRow, earnCap: number): { text: string; note?: string } {
  // A company still locked for the member arrives as HIDDEN_COMPANY. Never name it, and never say "hidden".
  const locked = l.company === HIDDEN_COMPANY;
  const at = locked ? " at a locked company" : l.company ? ` at ${l.company}` : "";
  const priv = l.field === PRIVATE_RATE;
  if (PRO_OPEN.test(l.reason)) return { text: `${l.reason}${l.company && !locked ? `: ${l.company}` : ""}` };
  switch (l.reason) {
    case FREE_COMPANY:
    case CRYSTAL:
    case CRYSTAL_FULL:
      // The free company of the day, or one opened free from Crystal Ball: no credits, and the company is theirs like a paid one.
      return { text: `${l.reason}${l.company && !locked ? `: ${l.company}` : ""}` };
    case "fill":
      return {
        text: priv ? "Shared a rate privately" : `Added ${thing(l.field)}${at}`,
        note:
          l.delta !== 0
            ? undefined
            : l.pending
              ? "+1 when your seat there is confirmed."
              : PICK_LABELS.has(l.field)
              ? `No credit. Only 5 answers like this earn each day, and ${earnCap} credits in all.`
              : `No credit. You had already earned ${earnCap} today.`,
      };
    case "unlock":
      // Unlock company: one purchase with the posting and rate of its open roles.
      return { text: l.field === HIDDEN_COMPANY ? `Unlocked a company${l.company && !locked ? `: ${l.company}` : ""}` : `Unlocked ${thing(l.field)}${at}` };
    case "refund":
      return { text: `Refund for ${thing(l.field)}${at}, removed after review` };
    case "reversal":
      return { text: `Credit taken back for ${thing(l.field)}${at}, removed after review` };
    case "retract":
      return { text: `Took back ${thing(l.field)}${at}` };
    case "Removed":
      return { text: "Removed a rate you shared privately" };
    case "referral":
      return { text: l.company && !locked ? `Invite bonus, with ${l.company}` : "Invite bonus" };
    case "confirm":
      return { text: `Two members confirmed ${thing(l.field)}${at}` };
    default:
      // A reason the server already wrote out in words ("Refund for a role that had closed at Acme").
      return { text: [l.reason, l.field && l.field !== l.reason && l.field !== HIDDEN_COMPANY ? fieldText(l.field) : "", at.trim()].filter(Boolean).join(" ") };
  }
}

/** Unlocks a new account can make in its first 24 hours, and after that in any 24 hours (lib/table.ts unlockRoom). */
const FIRST_DAY_UNLOCKS = 25;

/**
 * The unlock limit, when it binds before the balance: "You can unlock 3 more facts today." On
 * an account's first day it adds "New accounts can unlock 25 facts on day one." Null when the
 * balance runs out first (or there is no limit in play).
 *
 * The first day is worked out from the ledger: the server counts the unlock rows of the last
 * 24 hours against a limit of 25 on day one and 100 after, so left plus used tells them apart.
 */
export function unlockLimitLine(me: Pick<Me, "credits" | "unlocksLeft">, ledger: LedgerRow[], nowMs = Date.now()): string | null {
  const left = me.unlocksLeft;
  if (left === null || left === undefined || left >= me.credits) return null;
  // Counted in credits, as the server counts it: a company (2 credits) is 2 of the day's unlocks.
  const used = ledger.filter((l) => l.reason === "unlock" && nowMs - Date.parse(l.at) < 86_400_000).reduce((n, l) => n + Math.max(1, -l.delta), 0) + ledger.filter((l) => l.reason === FREE_COMPANY && nowMs - Date.parse(l.at) < 86_400_000).length * 2;
  const firstDay = left + used <= FIRST_DAY_UNLOCKS;
  const now = left === 0 ? "You've used today's unlocks. Your credits are here tomorrow." : `You can unlock ${left} more ${left === 1 ? "fact" : "facts"} today.`;
  return firstDay ? `${now} New accounts can unlock ${FIRST_DAY_UNLOCKS} facts on day one.` : now;
}

/** "You owe 2 credits. ..." when a fact the member added was removed after they spent what it earned. */
export function owedLine(owed: number | undefined): string | null {
  if (!owed || owed <= 0) return null;
  return `You owe ${owed} ${owed === 1 ? "credit" : "credits"}. A fact you added was removed after you spent what it earned. ${
    owed === 1 ? "The next fact you add clears it." : `The next ${owed} facts you add clear it.`
  }`;
}
