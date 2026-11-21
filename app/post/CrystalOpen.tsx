"use client";

/**
 * Opening a company from Crystal Ball (its rows and cards, Home's moves and card, and the record
 * opened from either), by plan (Me.crystal, lib/table.ts crystalOf; todayModel.ts crystalButton):
 *
 *   "all"   Trial and Pro: "Open". Every company in their Crystal Ball opens free and is theirs, as a
 *           paid company unlock would make it. Its people and seat holders cost what they cost.
 *   "one"   Free (trial over): "Open free · 1 left today". One company a UTC day opens with
 *           everything on it, contact details and who held its seats included.
 *   "used"  Free, today's is used: the company's ordinary unlock, "Unlock · 2 credits" (its cost on
 *           the button, the zero-credit wall when the balance is short, "Unlocks again tomorrow" when
 *           the day's limit binds), and "Pro opens all of these free" beside it, to the plans.
 *
 * The server checks the company is in the member's Crystal Ball (the unlock's from "crystal"), so
 * a company anywhere else costs what it costs. Nothing here while billing is off (Me.crystal left out).
 */
import { useCallback, useRef, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import { useUi, ZeroCredits } from "./ui";
import { cellKey } from "./model";
import { openPlans } from "./Billing";
import { CRYSTAL_PRO_LINK, crystalButton, rowOpensFree } from "./todayModel";
import { COMPANY_PRICE } from "@/lib/tableFields";

/** How a Crystal Ball company opens for this member, or null (the 2-credit unlock, as anywhere). */
export const crystalMode = (me: Pick<Me, "crystal">) => me.crystal ?? null;

export function CrystalOpen({
  id,
  name,
  onOpened,
  className = "",
  bar,
  noPro,
}: {
  id: string;
  name?: string | null;
  onOpened?: () => void;
  className?: string;
  bar?: boolean;
  /** Leave out "Pro opens all of these free" (a place that says it once for all its rows). */
  noPro?: boolean;
}) {
  const ui = useUi();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  const b = crystalButton(ui.me);
  const busy = ui.busy.has(cellKey(id, "identity"));
  if (!b) return null;
  const cls = `btn btn-pine${bar ? " tp-uc-bar" : ""} ${className}`.trim();
  if (b.kind !== "crystal") {
    const unlock = async () => {
      if (b.kind === "wall") return setZero(true);
      const ok = await ui.unlock({ entity: "company", id, field: "identity" }, { onWall: () => setZero(true) });
      if (ok) onOpened?.();
    };
    return (
      <>
        <button ref={ref} type="button" className={cls} disabled={busy || b.kind === "later"} aria-busy={busy} onClick={() => void unlock()}>
          {busy ? "Unlocking" : b.label}
        </button>
        {!noPro && !bar && (
          <button type="button" className="cb-pro" onClick={() => openPlans("crystal")}>
            {CRYSTAL_PRO_LINK}
          </button>
        )}
        {zero && ui.me.credits < COMPANY_PRICE && ref.current && <ZeroCredits anchor={ref.current} id={id} need={COMPANY_PRICE} onClose={() => setZero(false)} />}
      </>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      disabled={busy}
      aria-busy={busy}
      aria-label={busy ? "Opening" : ui.me.crystal === "all" ? `Open${name ? ` ${name}` : " this company"}, free from your Crystal Ball` : "Open this company free, with everything on it. 1 left today"}
      onClick={async () => {
        const ok = await ui.unlock({ entity: "company", id, field: "identity" }, { from: "crystal" });
        if (ok) onOpened?.();
      }}
    >
      {busy ? "Opening" : b.label}
    </button>
  );
}

/**
 * A click anywhere on a locked Crystal Ball company (its row, its card, a move's name): it opens the
 * way its Open button does where that is free (Trial and Pro, Free's one a day), then the record.
 * Otherwise only the record opens, and its own unlock states the cost. Never spends a credit.
 */
export function useCrystalClick() {
  const ui = useUi();
  // One identity for the page's rows (they are memoized); it reads the member and the busy cells as they are when clicked.
  const now = useRef(ui);
  now.current = ui;
  return useCallback(async (id: string, hidden: boolean, open: () => void) => {
    const u = now.current;
    if (hidden && rowOpensFree(u.me) && !u.busy.has(cellKey(id, "identity"))) await u.unlock({ entity: "company", id, field: "identity" }, { from: "crystal" });
    open();
  }, []);
}
