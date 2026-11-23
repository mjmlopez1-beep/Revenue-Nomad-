/**
 * The calls Settings makes, each one the call its home makes today (model.ts REMOVE, chipCall), so
 * Settings stores nothing of its own: Remove on a Connections row runs that source's own delete,
 * and a Notifications switch runs the same change Alerts and workflows runs.
 */
import type { IntegrationsView } from "@/lib/notify/types";
import type { CloseInboxView } from "@/lib/close/types";
import { errorText } from "../../ui/shared";
import { netAct } from "../network/useNetwork";
import { pathsAct } from "../network/usePaths";
import { disconnectKey } from "../granolaClient";
import type { RemoveCall } from "./model";

export type Answer<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** A JSON POST (or GET without a body), with the app's plain words for a failure. */
export async function send<T>(url: string, body?: unknown): Promise<Answer<T>> {
  try {
    const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
    return r.ok ? { ok: true, message: j.message, data: j } : { ok: false, error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { ok: false, error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/** Run a source's Remove. `apps`: the agents to disconnect (each its own revoke, as Agent access does). */
export async function runRemove(call: RemoveCall, apps: { id: string }[] = []): Promise<Answer<{ view?: IntegrationsView }>> {
  switch (call.via) {
    case "google": {
      const r = await netAct(call.op);
      return r.error ? { ok: false, error: r.error } : { ok: true, message: r.message ?? "Google is disconnected. What it gave Merlin is deleted." };
    }
    case "paths": {
      const r = await pathsAct(call.op);
      return r.error ? { ok: false, error: r.error } : { ok: true, message: r.message ?? "Deleted." };
    }
    case "integrations":
      return send<{ view?: IntegrationsView }>("/api/integrations", call.body);
    case "granola": {
      const r = await disconnectKey();
      return r.error !== undefined ? { ok: false, error: r.error } : { ok: true, message: r.message };
    }
    case "oauth": {
      for (const a of apps) {
        const r = await send("/api/oauth/apps", { revoke: a.id });
        if (!r.ok) return r;
      }
      return { ok: true, message: apps.length === 1 ? "Disconnected. Its access stopped." : "Disconnected. Their access stopped." };
    }
  }
}

/** Close's switch for one alert on one channel (the same call as Alerts and workflows' closePref). */
export const closePref = (kind: string, channel: "email" | "slack" | "app", on: boolean) => send<CloseInboxView["prefs"]>("/api/activity", { op: "pref", kind, channel, on });
