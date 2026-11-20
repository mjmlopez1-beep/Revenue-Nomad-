"use client";

/**
 * Opening a company from Crystal Ball (its rows and cards, the Today card that shows its top row,
 * and the record opened from either), by plan (Me.crystal, lib/table.ts crystalOf):
 *
 *   "all"   Trial and Pro: "Open". Every company in their Crystal Ball opens free and is theirs, as a
 *           paid company unlock would make it. Its people and seat holders cost what they cost.
 *   "one"   Free (trial over): "Open free · 1 left today". One company a UTC day opens with
 *           everything on it, contact details and who held its seats included.
 *   "used"  Free, today's is used: "Upgrade to open more", to the plans.
 *
 * The server checks the company is in the member's Crystal Ball (the unlock's from "crystal"), so
 * a company anywhere else costs what it costs. Nothing here while billing is off (Me.crystal left out).
 */
import { CRYSTAL_OPEN_ONE, CRYSTAL_UPGRADE } from "@/lib/radar/types";
import type { Me } from "@/lib/tableTypes";
import { useUi } from "./ui";
import { cellKey } from "./model";
import { openPlans } from "./Billing";

/** How a Crystal Ball company opens for this member, or null (the 2-credit unlock, as anywhere). */
export const crystalMode = (me: Pick<Me, "crystal">) => me.crystal ?? null;

export function CrystalOpen({ id, name, onOpened, className = "", bar }: { id: string; name?: string | null; onOpened?: () => void; className?: string; bar?: boolean }) {
  const ui = useUi();
  const mode = ui.me.crystal;
  const busy = ui.busy.has(cellKey(id, "identity"));
  if (!mode) return null;
  if (mode === "used")
    return (
      <button type="button" className={`btn${bar ? " tp-uc-bar" : ""} ${className}`.trim()} onClick={() => openPlans("crystal")}>
        {CRYSTAL_UPGRADE}
      </button>
    );
  const label = mode === "all" ? "Open" : CRYSTAL_OPEN_ONE;
  return (
    <button
      type="button"
      className={`btn btn-pine${bar ? " tp-uc-bar" : ""} ${className}`.trim()}
      disabled={busy}
      aria-busy={busy}
      aria-label={busy ? "Opening" : mode === "all" ? `Open${name ? ` ${name}` : " this company"}, free from your Crystal Ball` : "Open this company free, with everything on it. 1 left today"}
      onClick={async () => {
        const ok = await ui.unlock({ entity: "company", id, field: "identity" }, { from: "crystal" });
        if (ok) onOpened?.();
      }}
    >
      {busy ? "Opening" : label}
    </button>
  );
}
