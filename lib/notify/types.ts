/**
 * Alerts in Slack (and any tool that takes a webhook): what the runtime state keeps, and the
 * shapes the API sends to the app. Pure types and constants, no Node imports, so lib/table.ts,
 * the API route and the page can all use this file.
 *
 * A destination's URL is a secret. It is kept on the server only: the app gets a masked form
 * ("hooks.slack.com/…/abcd"), and the admin export leaves it out.
 */

/** The three alerts a member can turn on or off. */
export type AlertKind = "roles" | "message" | "seat";
export const ALERT_KINDS: AlertKind[] = ["roles", "message", "seat"];

/** Every alert is on once a member connects. */
export const DEFAULT_ALERTS: Record<AlertKind, boolean> = { roles: true, message: true, seat: true };

/** At most one post of each kind per member in this window. More events in it go out together. */
export const BATCH_WINDOW_MS = 15 * 60 * 1000;

/** Where alerts go. slack: an incoming webhook (Block Kit). workflow: a Slack Workflow Builder webhook (flat fields). webhook: anything else (Zapier, Make). */
export type DestKind = "slack" | "workflow" | "webhook";

export interface StoredDest {
  kind: DestKind;
  /** The full URL. Never leaves the server. */
  url: string;
  addedAt: string;
  lastOkAt?: string;
  /** Failures in a row (a success clears it). */
  failures?: number;
  lastError?: string;
  lastErrorAt?: string;
  /** The service said the URL is gone (Slack's no_service, a 404 or 410), or it failed 5 times in a row. Nothing more is sent to it. */
  broken?: boolean;
}

/** One event waiting for its batch, kept until the window opens again. */
export type AlertItem =
  | { kind: "message"; at: string; conversationId: string; from: string; company: string; holder: boolean; snippet: string }
  | {
      kind: "seat";
      at: string;
      companyId: string;
      company: string;
      /** holder: unlocked who held the seat. facts: unlocked other facts on it. message: wrote to the seat holder about it. */
      what: "holder" | "facts" | "message";
      /** The other member, by function and title only. Their first name only when they wrote. */
      actor: { function: string | null; title: string | null; first?: string };
      /** The facts unlocked, as words ("the rate"). */
      facts?: string[];
      conversationId?: string;
    }
  | {
      kind: "roles";
      at: string;
      /** The member's function, when roles matched on it. */
      function: string | null;
      /** New roles in the member's function or matching a saved view (each role counted once). */
      total: number;
      /** In the member's function. */
      mine: number;
      roles: { companyId: string; label: string }[];
      alerts: { name: string; n: number }[];
    };

export interface MemberIntegrations {
  slack?: StoredDest;
  webhook?: StoredDest;
  alerts: Record<AlertKind, boolean>;
  /** When the last post of each kind went out. */
  lastSent: Partial<Record<AlertKind, string>>;
  /** Events waiting for the window to open again. */
  pending: Partial<Record<AlertKind, AlertItem[]>>;
}

export interface IntegrationsState {
  members: Record<string, MemberIntegrations>;
  /** Counts only, for the pilot metrics. */
  stats: { sent: Partial<Record<AlertKind | "test", number>>; failed: number; connects: number; removes: number };
  /** The app's address as last seen, for the links in alerts when RN_PUBLIC_URL isn't set. */
  origin?: string;
}

export const emptyIntegrations = (): IntegrationsState => ({ members: {}, stats: { sent: {}, failed: 0, connects: 0, removes: 0 } });

/** One destination as the app sees it. */
export interface DestView {
  kind: DestKind;
  /** "hooks.slack.com/…/abcd". */
  masked: string;
  addedAt: string;
  lastOkAt: string | null;
  /** Plain words for what went wrong last, when the last try failed. */
  problem: string | null;
  broken: boolean;
}

/** GET /api/integrations. */
export interface IntegrationsView {
  /** False once integrations are limited to a paid plan and this member isn't on it. */
  allowed: boolean;
  /** The member's function, for "New open roles in Marketing". */
  function: string | null;
  /** Saved views and alerts the member has (lib/mcp/alerts.ts). */
  savedViews: number;
  slack: DestView | null;
  webhook: DestView | null;
  alerts: Record<AlertKind, boolean>;
}

/** Pilot metrics: counts only. */
export interface IntegrationStats {
  slackConnected: number;
  webhookConnected: number;
  broken: number;
  sent: Record<AlertKind | "test", number>;
  failed: number;
}

/** Counts for the pilot metrics, from the state. Pure. */
export function integrationStats(st: IntegrationsState | undefined): IntegrationStats {
  const out: IntegrationStats = { slackConnected: 0, webhookConnected: 0, broken: 0, sent: { roles: 0, message: 0, seat: 0, test: 0 }, failed: st?.stats.failed ?? 0 };
  for (const m of Object.values(st?.members ?? {})) {
    if (m.slack) out.slackConnected++;
    if (m.webhook) out.webhookConnected++;
    if (m.slack?.broken || m.webhook?.broken) out.broken++;
  }
  for (const k of Object.keys(out.sent) as (keyof IntegrationStats["sent"])[]) out.sent[k] = st?.stats.sent[k] ?? 0;
  return out;
}
