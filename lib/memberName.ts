/**
 * How a member's name shows to other members, in one place. Pure, relative imports only, so the
 * server (lib/table.ts and everything that names a member to someone else), the app and the tests
 * share it.
 *
 * The member's own choice (Settings, Privacy):
 *  - "Show me in the Fractionals directory" on (Profile.fractionals true): their full name.
 *  - "Hide my name on my seats" (Profile.nameHidden): their seats read NAME_HIDDEN (lib/table.ts
 *    cellOf does that, the seat rule); anywhere else they are named to someone (a conversation,
 *    a lead, a pipeline line), by first name and last initial.
 *  - anything else (not chosen yet, or out of the directory): first name and last initial
 *    ("Jordan A."). That is the default until they choose.
 * The member themself always sees their full name.
 *
 * Also here: the rules for a display name a member types in Settings (displayNameProblem), and how
 * often they may change it (NAME_CHANGES_MAX in NAME_CHANGE_DAYS: an anti-impersonation guard, every
 * change is logged on the profile).
 */
import { shortName } from "./fractionalsCore";
import { NAME_HIDDEN } from "./tableFields";

/** What a member chose about their name, as the profile keeps it. */
export interface NamePrefs {
  fractionals?: boolean | null;
  partnersOff?: boolean;
  nameHidden?: boolean;
}
export type NameShow = "full" | "short" | "hidden";

/** How this member's name shows to others: full only when they said so, hidden when they hide it, else first name and last initial. */
export function nameShowOf(p: NamePrefs | null | undefined): NameShow {
  if (p?.nameHidden) return "hidden";
  if (p?.fractionals === true && !p.partnersOff) return "full";
  return "short";
}

/**
 * A member's name as other members see it: in full only when they chose the directory, else first
 * name and last initial. A seat of a member who hides their name reads NAME_HIDDEN instead, by the
 * seat rule (lib/table.ts holderNameHidden), never by this.
 */
export function nameForOthers(full: string, p: NamePrefs | null | undefined): string {
  const n = String(full ?? "").replace(/\s+/g, " ").trim();
  return nameShowOf(p) === "full" ? n : shortName(n);
}

/** A member's name as `viewerId` sees it: their own in full, anyone else's by their choice. */
export function nameAsSeenBy(full: string, memberId: string, viewerId: string | null | undefined, p: NamePrefs | null | undefined): string {
  return viewerId && viewerId === memberId ? String(full ?? "").trim() : nameForOthers(full, p);
}

/** "Other members see Jordan A." with one full stop, whether the name ends with one or not. */
export const seeLine = (shown: string) => `Other members see ${shown}${shown.endsWith(".") ? "" : "."}`;

/** The words for each choice, said where the member picks (Settings, Privacy). */
export function nameShowWords(show: NameShow): string {
  if (show === "full") return "Other members see your full name.";
  if (show === "hidden") return `Your seats read "${NAME_HIDDEN}". Anywhere else, other members see your first name and last initial.`;
  return "Other members see your first name and last initial.";
}

/* ---------- the display name a member types ---------- */

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
/** At most this many changes of a display name in NAME_CHANGE_DAYS. */
export const NAME_CHANGES_MAX = 3;
export const NAME_CHANGE_DAYS = 30;
/** Said once the member used them. */
export const NAME_CHANGES_USED = `You can change your name ${NAME_CHANGES_MAX} times in ${NAME_CHANGE_DAYS} days. Try again later, or write to us.`;

/** A display name as it is kept: one space between words, no spaces at the ends. */
export const tidyDisplayName = (raw: unknown) => String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Why a display name can't be used, in words for the member, or null when it can: letters, spaces,
 * hyphens and apostrophes, 2 to 60 characters, a first and a last name, never an email or a link.
 */
export function displayNameProblem(raw: unknown): string | null {
  const v = tidyDisplayName(raw);
  if (!v) return "Type your name.";
  if (/@/.test(v)) return "Leave out email addresses. Use the name you go by.";
  if (/https?:|www\.|\.(com|net|org|io|co|ai|me)\b|\//i.test(v)) return "Leave out links. Use the name you go by.";
  if ([...v].length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters.`;
  if ([...v].length > DISPLAY_NAME_MAX) return `Keep it to ${DISPLAY_NAME_MAX} characters.`;
  if (!/^[\p{L}\p{M}' ’-]+$/u.test(v)) return "Use letters, spaces, hyphens and apostrophes only.";
  const words = v.split(" ").filter((w) => /\p{L}/u.test(w));
  if (words.length < 2) return "Use your first and last name, like Jordan Avery.";
  if (!/^\p{L}/u.test(v)) return "Start with a letter.";
  return null;
}

/** One change of a display name, as the profile logs it. */
export interface NameChange {
  from: string;
  to: string;
  at: string;
}

/** Changes in the last NAME_CHANGE_DAYS, from the log. */
export const recentNameChanges = (log: readonly NameChange[] | null | undefined, nowMs: number) =>
  (log ?? []).filter((c) => nowMs - Date.parse(c.at) < NAME_CHANGE_DAYS * 86_400_000).length;
