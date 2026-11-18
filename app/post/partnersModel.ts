/**
 * Referral partners, "Partners at your kind of clients": who held seats in other functions at
 * companies that fit the member's Ideal Fractional Profile, from the member's own view of the
 * table. It reads only the cells the member was sent, so every lock holds as it does in the table:
 * a holder the member hasn't unlocked is a locked cell here too (its name never reached the page),
 * and a locked company stays locked. Seats with nobody named are only counted. Pure, no React.
 *
 * The cards read people first: the seat's title leads, from the role the member can see or else
 * the title the page's server half sent for it (PartnersView.titles, never the name), and
 * "Fractional <function> leader" when neither is on file.
 */
import type { EngagementRec, Me } from "@/lib/tableTypes";
import { icpEmpty, icpTest, isOpenRole, namedFn, shown, type CoInfo } from "./model";

export interface PartnerSeat {
  i: CoInfo;
  e: EngagementRec;
}
export interface PartnerGroup {
  fn: string;
  /** Seats whose holder is on file (locked, or a name the member can see): members first, then seats with a title, then the most recent start. */
  seats: PartnerSeat[];
  /** Seats in this function at these companies with nobody named yet. */
  unnamed: number;
}

/** The seat holder is a member on Merlin, as far as the member can see (only after the unlock). */
export const holderIsMember = (e: EngagementRec) => e.cells.operator?.s === "value" && !!e.cells.operator.member && !e.cells.operator.member.you;

/** The title a partner card leads with: the role the member can see, else the one the page was sent (PartnersView.titles), else null. */
export const seatTitle = (e: EngagementRec, titles?: Record<string, string> | null): string | null => shown(e.cells.role) ?? titles?.[e.id] ?? null;
/** The card's lead line: the title, or "Fractional Marketing leader" when none is on file. */
export const seatLead = (e: EngagementRec, titles?: Record<string, string> | null): string => {
  const fn = shown(e.cells.function);
  return seatTitle(e, titles) ?? (fn ? `Fractional ${fn} leader` : "Fractional leader");
};

/** A hire to count: a past or current seat (not an open role), not a full-time job. */
const isHireSeat = (e: EngagementRec) => !isOpenRole(e) && shown(e.cells.type) !== "Full-time";

/**
 * The groups, by function, the biggest first, at companies the member's Ideal Fractional Profile
 * lets through (the table's own test, icpTest). Never the member's own function, their own seats,
 * or a fact under review. `fits`: companies that fit. Empty without a profile. `titles`: the
 * page's PartnersView.titles, so seats with a title sort ahead of those without.
 */
export function partnerGroups(infos: CoInfo[], me: Pick<Me, "icp" | "function">, titles?: Record<string, string> | null): { groups: PartnerGroup[]; fits: number } {
  if (icpEmpty(me.icp)) return { groups: [], fits: 0 };
  const fits = icpTest(me.icp!);
  const mine = namedFn(me.function);
  const by = new Map<string, PartnerGroup>();
  let n = 0;
  for (const i of infos) {
    if (!fits(i.c)) continue;
    n++;
    for (const e of i.engs) {
      if (e.yours || !isHireSeat(e)) continue;
      const fn = shown(e.cells.function);
      if (!fn || fn === "Other" || fn === mine) continue;
      const op = e.cells.operator;
      if (op?.s === "reported") continue;
      const g = by.get(fn) ?? { fn, seats: [], unnamed: 0 };
      by.set(fn, g);
      if (!op || op.s === "empty") g.unnamed++;
      else if (!(op.s === "value" && op.member?.you)) g.seats.push({ i, e });
    }
  }
  const start = (e: EngagementRec) => shown(e.cells.start) ?? "";
  const titled = (e: EngagementRec) => Number(!!seatTitle(e, titles));
  for (const g of by.values())
    g.seats.sort((a, b) => Number(holderIsMember(b.e)) - Number(holderIsMember(a.e)) || titled(b.e) - titled(a.e) || start(b.e).localeCompare(start(a.e)));
  const groups = [...by.values()].filter((g) => g.seats.length || g.unnamed).sort((a, b) => b.seats.length - a.seats.length || b.unnamed - a.unnamed || a.fn.localeCompare(b.fn));
  return { groups, fits: n };
}
