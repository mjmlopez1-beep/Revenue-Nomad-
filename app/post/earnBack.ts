/**
 * Earning your way back to a locked fact. At 0 credits the wall (ZeroCredits in ./ui.tsx) sends
 * the member to Your seats to earn. It leaves the fact they tapped here, and Your seats takes it
 * when it opens, so once they have a credit one tap brings them back to that record with the
 * lock pointed at. Pure, no React.
 */

import { REFERRAL_BONUS } from "@/lib/tableFields";
import { fieldText } from "./hooks";
import { namedFn } from "./model";

/** What one seat is worth, said the same way everywhere a member is asked to find one. */
export const SEAT_YIELD = "up to ~12 credits a seat";

/** The member's invite link (the same one Your credits shows). */
export const inviteUrl = (code: string) => `${typeof window === "undefined" ? "" : window.location.origin}/?ref=${code}`;

/** What the invite says: what a fractional in their function gets out of Merlin, then the link. */
export function inviteMessage(fn: string | null, link: string): string {
  const named = namedFn(fn);
  const who = named ? `fractional ${fieldText(named)} leaders` : "fractional leaders";
  return `I'm using Merlin from Revenue Nomad to see which companies hire ${who}, who held each seat and which roles are open now. It's free. Join with my link and we both get ${REFERRAL_BONUS} extra credits.\n\n${link}`;
}

/** A mail with the invite filled in, to whoever the member picks. */
export const inviteMailto = (text: string) => `mailto:?subject=${encodeURIComponent("Join me on Merlin")}&body=${encodeURIComponent(text)}`;

/** The record the wall was opened on (a company, seat or person id), the lock's cell key, and whether Your seats opens on its search. */
export interface WallBack {
  id: string;
  key: string | null;
  search: boolean;
}

let pending: WallBack | null = null;
export const wallBack = {
  set(v: WallBack) {
    pending = v;
  },
  /** What the wall left, once: Your seats takes it as it opens. */
  take(): WallBack | null {
    const v = pending;
    pending = null;
    return v;
  },
};

/** A locked fact inside "To see ...", by its cell key ("e123.rate"). The wall's own button for a locked company has no cell: the company. */
const WHAT: Record<string, string> = {
  operator: "who held this seat",
  role: "the role",
  rate: "the rate",
  end: "the end month",
  sourced: "how the seat was sourced",
  posting: "the job posting",
  hours: "the posted hours",
  identity: "this company",
  website: "this company",
  about: "this company",
  name: "this person's name and title",
  title: "this person's name and title",
  email: "their email",
  phone: "their phone number",
  linkedin: "their LinkedIn",
};
export function tappedWhat(key: string | null): string {
  if (!key) return WHAT.identity;
  const field = key.slice(key.lastIndexOf(".") + 1);
  return WHAT[field] ?? "this";
}
