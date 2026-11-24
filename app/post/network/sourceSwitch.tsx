"use client";

/**
 * A source of who you know, on a switch (Warm paths' sources, the set-up's Who you know): off asks
 * first (model.ts OFF_ASK), then runs that source's own remove, the very calls Settings /
 * Connections' switch makes (settings/model.ts REMOVE, settings/calls.ts runRemove). Turning it on
 * is the caller's: Google's OAuth, or the file picker of the connections file, the export or a CSV.
 */
import { useState } from "react";
import { OffAsk } from "../../ui/ConnToggle";
import { runRemove } from "../settings/calls";
import type { RemoveCall } from "../settings/model";

export function useOffSwitch({ name, ask, removes, onSaid }: { name: string; ask: string; /** In order; each is idempotent. */ removes: RemoveCall[]; onSaid: (words: string, bad?: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const off = async () => {
    setBusy(true);
    for (const call of removes) {
      const r = await runRemove(call);
      if (!r.ok) {
        setBusy(false);
        setAsking(false);
        return onSaid(r.error, true);
      }
    }
    setBusy(false);
    setAsking(false);
    onSaid(`${name} is off. What it gave Merlin is deleted.`);
  };
  return {
    busy,
    asking,
    /** The switch was flipped while on: ask (or stop asking). */
    ask: () => setAsking((a) => !a),
    el: asking ? <OffAsk ask={ask} yes="Turn off and delete" busy={busy} onYes={() => void off()} onNo={() => setAsking(false)} /> : null,
  };
}
