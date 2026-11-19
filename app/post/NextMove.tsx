"use client";

/**
 * The next-move card: the single most urgent thing on the page, and the only ember on it.
 * Dark pine, a 6px ember left edge, an ember chip (ink text), white text and one volt button.
 * At most one shows, by priority, and never together with the Get started strip:
 *
 *   seats  they hold seats with something missing and have added fewer than 3 things so far
 *   low    3 credits or fewer, and their seats have something to add (before new roles: a
 *          member who can't afford an unlock should see where to earn first)
 *   roles  new open roles in their function this week
 *
 * Dismissing one hides that kind for 7 days (kept in localStorage, per browser).
 *
 * On phones it is compact (the chip and the title share a line), so the list starts higher.
 * `note` carries a second, calm line that would otherwise be a strip of its own (the daily limit).
 */
import { useCallback, useContext, useState, type ReactNode } from "react";
import type { Me } from "@/lib/tableTypes";
import { IconX } from "../ui/shared";
import { plural, store } from "./hooks";
import { UiCtx } from "./ui";
import "./seats.css";

export type MoveKind = "seats" | "roles" | "low";
const KINDS: MoveKind[] = ["seats", "roles", "low"];
const QUIET_FOR = 7 * 86_400_000;
const offKey = (k: MoveKind) => `tp_move_off_${k}`;

const isOff = (k: MoveKind) => {
  const at = Number(store.get(offKey(k)));
  return at > 0 && Date.now() - at < QUIET_FOR;
};

/** Which kinds the member dismissed in the last 7 days, and how to dismiss one. */
export function useMoveDismissals(): [Set<MoveKind>, (k: MoveKind) => void] {
  const [off, setOff] = useState<Set<MoveKind>>(() => new Set(KINDS.filter(isOff)));
  const dismiss = useCallback((k: MoveKind) => {
    store.set(offKey(k), String(Date.now()));
    setOff((s) => new Set(s).add(k));
  }, []);
  return [off, dismiss];
}

/** Credits the member can still earn today. */
export const earnRoom = (me: Me) => (me.earnResetsAt ? 0 : Math.max(0, me.earnCap - me.earned24h));

/** The one card to show, or null. `newRoles` is View.scan.mine7. */
export function pickMove(me: Me, seats: { n: number; missing: number }, newRoles: number, off: Set<MoveKind>): MoveKind | null {
  // Filling seats is only the next move while it still earns today.
  const canFill = seats.missing > 0 && earnRoom(me) > 0;
  if (canFill && me.added < 3 && !off.has("seats")) return "seats";
  if (canFill && me.credits <= 3 && !off.has("low")) return "low";
  // New roles cost a credit to see. At 0 the card would send the member somewhere they can't pay for: the credit line, with its way to earn, leads instead.
  if (newRoles > 0 && me.function && me.credits > 0 && !off.has("roles")) return "roles";
  return null;
}

export function NextMove({
  kind,
  me,
  seats,
  roles,
  onSeats,
  onRoles,
  onDismiss,
  note,
}: {
  kind: MoveKind;
  me: Me;
  seats: { n: number; missing: number };
  /** New roles in the member's function this week, and how many of their companies are hidden. */
  roles: { n: number; hidden: number };
  onSeats: () => void;
  onRoles: () => void;
  onDismiss: (k: MoveKind) => void;
  /** One more line under the card's own, e.g. the daily limit. */
  note?: ReactNode;
}) {
  const compact = useContext(UiCtx)?.layout === "phone";
  const earn = Math.min(seats.missing, earnRoom(me));
  const things = plural(seats.missing, "thing is", "things are");
  const copy =
    kind === "seats"
      ? {
          chip: `+${plural(earn, "credit")}`,
          title: seats.n === 1 ? "We have a seat under your name." : `We have ${seats.n} seats under your name.`,
          line:
            seats.missing === 1
              ? `1 thing is still missing on ${seats.n === 1 ? "it" : "them"}. Add it and earn a credit.`
              : `${things} still missing on ${seats.n === 1 ? "it" : "them"}. Each one you add earns a credit${seats.missing > earn ? `, up to ${earn} today` : ""}.`,
          button: "Fill in your seats",
          go: onSeats,
        }
      : kind === "roles"
        ? {
            chip: "Live",
            title: `${plural(roles.n, `new ${me.function} role`)} this week`,
            line:
              roles.n === 1
                ? roles.hidden > 0
                  ? "The company is locked. 2 credits show it with its job posting."
                  : "You can already see the company behind it."
                : roles.hidden >= roles.n
                  ? "The companies are locked. 2 credits show one with its job posting."
                  : roles.hidden > 0
                    ? `${roles.hidden === 1 ? "1 of them is" : `${roles.hidden} of them are`} locked. 2 credits show one with its job posting.`
                    : "You can already see the company behind each one.",
            button: "See open roles",
            go: onRoles,
          }
        : {
            chip: me.credits <= 0 ? "0 credits" : `${plural(me.credits, "credit")} left`,
            title: me.credits <= 0 ? "You're out of credits." : `You're down to ${plural(me.credits, "credit")}.`,
            line: `Your ${seats.n === 1 ? "seat still has" : "seats still have"} ${plural(seats.missing, "thing")} to add. Each one earns a credit${seats.missing > earn ? `, up to ${earn} today` : ""}.`,
            button: "Fill in your seats",
            go: onSeats,
          };
  return (
    <section className={`nm-card${compact ? " nm-compact" : ""}`} aria-label="Your next move" data-move={kind}>
      <span className="nm-chip num">{copy.chip}</span>
      <div className="nm-t">
        <h2 className="nm-h">{copy.title}</h2>
        <p className="nm-p">{copy.line}</p>
        {note && <p className="nm-p nm-note">{note}</p>}
      </div>
      <button type="button" className="btn btn-primary nm-go" onClick={copy.go}>
        {copy.button}
      </button>
      <button type="button" className="tp-iconbtn tp-iconbtn-sm nm-x" aria-label="Dismiss" onClick={() => onDismiss(kind)}>
        <IconX size={14} />
      </button>
    </section>
  );
}
