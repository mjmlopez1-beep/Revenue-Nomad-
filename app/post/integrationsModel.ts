/**
 * The status chips on the top row of Integrations (Slack, Claude, Google, Granola), worked out
 * from what each part's own endpoint answers. Pure, so the words and the states are checked in
 * scripts/test-granola.mts without a browser. A card that is switched off on the server is null:
 * no card at all.
 */
import type { IntegrationsView } from "@/lib/notify/types";
import type { NetworkAnswer } from "@/lib/google/types";
import type { GranolaStatus } from "@/lib/granola/types";

export type PickTone = "mint" | "outline";
export interface PickStatus {
  chip: string;
  tone: PickTone;
  /** A short line under the card's description: what is connected and when it was last used. */
  line?: string;
}
/** A connected assistant, as GET /api/oauth/apps answers (lib/mcp/oauth.ts connectedApps: an unexpired grant, never a revoked one). */
export interface AppGrant {
  id: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string;
}

const LOADING: PickStatus = { chip: "…", tone: "outline" };
const NOT_SET: PickStatus = { chip: "Not set up", tone: "outline" };

/** "used today", "used yesterday", "used 3 days ago", "used Nov 2" (local days). */
export function usedWords(iso: string, nowMs = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.round((day(nowMs) - day(t)) / 86_400_000);
  if (days <= 0) return "used today";
  if (days === 1) return "used yesterday";
  if (days < 7) return `used ${days} days ago`;
  const d = new Date(t);
  return `used ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(nowMs).getFullYear() ? { year: "numeric" } : {}) })}`;
}

export function slackPick(view: IntegrationsView | null): PickStatus {
  if (!view) return LOADING;
  const s = view.slack;
  if (!s) return NOT_SET;
  return s.broken ? { chip: "Stopped", tone: "outline" } : { chip: "Connected", tone: "mint", ...(s.channel ? { line: `Posting to ${s.channel}` } : {}) };
}

/** Claude and other assistants: Connected while any grant is active, with each app and when it was last used. */
export function claudePick(apps: AppGrant[] | null, nowMs = Date.now()): PickStatus {
  if (!apps) return LOADING;
  if (!apps.length) return NOT_SET;
  const named = new Map<string, string>();
  // One line per app name: the most recently used grant of each.
  for (const a of [...apps].sort((x, y) => y.lastUsedAt.localeCompare(x.lastUsedAt))) if (!named.has(a.name)) named.set(a.name, usedWords(a.lastUsedAt, nowMs));
  return { chip: "Connected", tone: "mint", line: [...named].map(([n, u]) => (u ? `${n} · ${u}` : n)).join(", ") };
}

const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Google: which of Calendar, Contacts and Gmail are connected. Null with Google off (RN_GOOGLE): no card. */
export function googlePick(answer: NetworkAnswer | null, failed = false): PickStatus | null {
  if (!answer) return failed ? null : LOADING;
  if (!answer.on) return null;
  const g = answer.google;
  if (!g) return NOT_SET;
  const parts = [g.calendar ? "Calendar" : "", g.contacts ? "Contacts" : "", answer.gmail && answer.gmail.status === "ok" ? "Gmail" : ""].filter(Boolean);
  if (g.status === "reconnect") return { chip: "Needs reconnecting", tone: "outline", line: parts.length ? `${listWords(parts)} stopped` : undefined };
  return { chip: "Connected", tone: "mint", line: parts.length ? listWords(parts) : undefined };
}

/** Granola: connected with the member's Granola account, or with a key (its last four characters). Null with Granola off (RN_GRANOLA): no card. */
export function granolaPick(st: GranolaStatus | null, failed = false): PickStatus | null {
  if (!st) return failed ? null : LOADING;
  if (!st.on) return null;
  if (!st.connected) return NOT_SET;
  if (st.via === "oauth") return st.broken ? { chip: "Needs connecting again", tone: "outline", line: "Your Granola account" } : { chip: "Connected", tone: "mint", line: "Your Granola account" };
  const line = st.last4 ? `Key ending ••••${st.last4}` : undefined;
  return st.broken ? { chip: "Key stopped working", tone: "outline", line } : { chip: "Connected", tone: "mint", line };
}
