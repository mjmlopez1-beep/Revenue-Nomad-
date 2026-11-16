"use client";

/**
 * Dates on a role the weekly scan follows: "Open since Nov 3" while the posting is up, then
 * "Role closed Dec 8" with how long it was listed. Shown wherever that seat is shown (the
 * company record, the Seats table, phone cards).
 *
 * The dot on an open role is the only ember a row or a card carries.
 */
import type { ReactNode } from "react";
import type { EngagementRec } from "@/lib/tableTypes";
import { plural } from "./hooks";
import { dayOf, daysListed, shown } from "./model";
import "./pages.css";

const short = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

/** "Nov 3" (the year is added when it isn't this year). */
export const fmtDay = (iso: string) => short(dayOf(iso));
/** The same, for a full timestamp, in the viewer's time zone. */
export const fmtStamp = (iso: string) => short(new Date(iso));

export function RoleDate({ e }: { e: EngagementRec }) {
  if (!e.opened) return null;
  if (!e.closed)
    return (
      <span className="tp-role-date open num" title={`We first saw this posting on ${fmtDay(e.opened)}. It was still up at the last weekly scan.`}>
        <span className="live-dot" aria-hidden />
        Open since {fmtDay(e.opened)}
      </span>
    );
  const days = plural(daysListed(e.opened, e.closed), "day");
  return (
    <span className="tp-role-date closed num" title={`The posting was up for ${days}, from ${fmtDay(e.opened)}.`}>
      Role closed {fmtDay(e.closed)}
      <span className="tp-role-days"> · listed {days}</span>
    </span>
  );
}

/** A status as plain text. Closed is history, so it is muted. */
export const statusText = (v: string): ReactNode => <span className={`tp-status s-${v.split(" ")[0].toLowerCase()}`}>{v}</span>;

/**
 * Whether the dates say everything the status would: an open role still open, or a closed one
 * marked Closed. A followed seat that was filled keeps its own status (Active, Ended).
 */
export const datesAreStatus = (e: EngagementRec) => {
  if (!e.opened) return false;
  const st = shown(e.cells.status);
  return !st || st === (e.closed ? "Closed" : "Open role");
};
