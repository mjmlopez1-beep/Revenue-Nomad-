"use client";

/**
 * Dates on a role the weekly scan follows, in the viewer's own time zone. While the posting is
 * listed: "Open since Oct 2", from the day the job board says it was posted, else from the
 * day our scan first saw it. When the last clean scan of its board did not list it: "Not seen
 * in the last scan". Once it comes down: "Role closed Dec 8 · listed 35 days". Shown wherever
 * that seat is shown (the company record, the tables, phone cards).
 *
 * The dot on an open role is the only ember a row or a card carries.
 */
import type { ReactNode } from "react";
import type { EngagementRec } from "@/lib/tableTypes";
import { plural } from "./hooks";
import { dayOf, listedDays, shown } from "./model";
import "./pages.css";

const short = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

/** "Nov 3" (the year is added when it isn't this year). */
export const fmtDay = (iso: string) => short(dayOf(iso));
/** The same, for a full timestamp, in the viewer's time zone. */
export const fmtStamp = (iso: string) => short(new Date(iso));

/** When the role was first seen and when it came down: the full times when the server sends them, else the UTC days. */
const firstSeen = (e: EngagementRec) => (e.openedAt ? new Date(e.openedAt) : e.opened ? dayOf(e.opened) : null);
const cameDown = (e: EngagementRec) => (e.closedAt ? new Date(e.closedAt) : e.closed ? dayOf(e.closed) : null);

export function RoleDate({ e }: { e: EngagementRec }) {
  const seen = firstSeen(e);
  if (!seen) return null;
  const seenOn = short(seen);
  const down = cameDown(e);
  if (!down) {
    if (e.unseen)
      return (
        <span className="tp-role-date unseen num" title={`First seen on ${seenOn}. The last clean scan of its job board didn't list it, so it may have closed.`}>
          Not seen in the last scan
        </span>
      );
    const posted = e.posted ? short(dayOf(e.posted)) : null;
    return (
      <span className="tp-role-date open num" title={posted ? `Posted ${posted}. First seen on ${seenOn}.` : `First seen on ${seenOn}`}>
        <span className="live-dot" aria-hidden />
        Open since {posted ?? seenOn}
      </span>
    );
  }
  const days = plural(listedDays(e), "day");
  return (
    <span className="tp-role-date closed num" title={`The job posting was listed for ${days}, from ${seenOn}.`}>
      Role closed {short(down)}
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
