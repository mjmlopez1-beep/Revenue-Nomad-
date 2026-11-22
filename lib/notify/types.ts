import type { RadarItem } from "../radar/types";

/**
 * Alerts in Slack (and any tool that takes a webhook): what the runtime state keeps, and the
 * shapes the API sends to the app. Pure types and constants, no Node imports, so lib/table.ts,
 * the API route and the page can all use this file.
 *
 * A destination's URL is a secret. It is kept on the server only: the app gets a masked form
 * ("hooks.slack.com/…/abcd"), and the admin export leaves it out.
 */

/**
 * The three alerts a member can turn on or off on the Integrations page, and the next-client radar
 * (lib/radar), which goes out the same way and in the same batches. The radar's switch is in Your
 * profile (Profile.radarOff), not here, so its entry here stays on.
 */
export type AlertKind = "roles" | "message" | "seat" | "radar";
export const ALERT_KINDS: AlertKind[] = ["roles", "message", "seat", "radar"];

/** Every alert is on once a member connects. */
export const DEFAULT_ALERTS: Record<AlertKind, boolean> = { roles: true, message: true, seat: true, radar: true };

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
  /** Connected with "Add to Slack": the channel ("#alerts") and workspace names Slack gave, for the page. */
  channel?: string;
  team?: string;
  viaApp?: boolean;
}

/** One event waiting for its batch, kept until the window opens again. */
export type AlertItem =
  /** The next-client radar: a member's cards, already cut to their plan (lib/radar/types.ts). */
  | RadarItem
  /**
   * `about` partners: a conversation from Referral partners, about no seat. invite: not a message they
   * got, but `from` (a fractional the member invited to connect) claimed their seat at `company`
   * through the member's invite, which opened a conversation with the member's note in it. joined:
   * `from` joined Merlin from the member's invite (the invite loop, lib/notify/joined.ts): no
   * conversation, no company, and `bonus` is the credits they both get when `from` adds a first
   * fact (left out when the member is past REFERRAL_LIMIT).
   */
  | { kind: "message"; at: string; conversationId: string; from: string; company: string; holder: boolean; snippet: string; about?: "partners" | "invite" | "joined"; bonus?: number }
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
      /**
       * Up to 3. `about`: the same free facts as the label, each by name, for Slack's fields. `name` is
       * null while the company is locked for the member. Left out on items queued before it was added.
       */
      roles: {
        companyId: string;
        label: string;
        about?: { name: string | null; function: string | null; industry: string | null; employees: string | null; revenue: string | null; place: string | null };
      }[];
      alerts: { name: string; n: number }[];
      /**
       * Saved views that follow hires ("Recently hired"): the companies that newly match each one
       * since the last such post (a week at most), in free facts only. A scan with no new roles can
       * still carry these. Left out when there are none.
       */
      hires?: HireNews[];
    };

/** One saved view that follows hires, and what newly matches it, as an alert carries it. */
export interface HireNews {
  name: string;
  /** Companies that newly match. */
  n: number;
  /** The functions the view follows (empty: any function). */
  functions: string[];
  /** The view narrows to the member's Ideal Fractional Profile. */
  inProfile: boolean;
  /** The view's place in the app (an address query), or null. */
  place: string | null;
  /**
   * Up to 3: the company's public id and "Acme Robotics, Finance, Mar 2026" (a locked company is never
   * named), and the same in parts for Slack (`company` null while locked; all three left out on items
   * queued before they were added).
   */
  rows: { companyId: string; label: string; company?: string | null; function?: string | null; start?: string | null }[];
}

export interface MemberIntegrations {
  slack?: StoredDest;
  webhook?: StoredDest;
  alerts: Record<AlertKind, boolean>;
  /** When the last post of each kind went out. */
  lastSent: Partial<Record<AlertKind, string>>;
  /** Events waiting for the window to open again. */
  pending: Partial<Record<AlertKind, AlertItem[]>>;
  /**
   * The last scan whose post told this member about new hires for their saved views (ISO). The
   * next one counts seats added after it, so a second scan in a week never repeats a hire.
   */
  hiresAt?: string;
}

export interface IntegrationsState {
  members: Record<string, MemberIntegrations>;
  /** Counts only, for the pilot metrics. */
  /** `proposal`: Close's proposal alerts (lib/close), which keep their own switches. */
  stats: { sent: Partial<Record<AlertKind | "test" | "proposal", number>>; failed: number; connects: number; removes: number };
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
  /** "#alerts" and the workspace, when connected with "Add to Slack". */
  channel: string | null;
  team: string | null;
  viaApp: boolean;
}

/** GET /api/integrations. */
export interface IntegrationsView {
  /** False once integrations are limited to a paid plan and this member isn't on it. */
  allowed: boolean;
  /** "Add to Slack" is set up on this server (SLACK_CLIENT_ID and SLACK_CLIENT_SECRET). */
  slackApp: boolean;
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
  const out: IntegrationStats = { slackConnected: 0, webhookConnected: 0, broken: 0, sent: { roles: 0, message: 0, seat: 0, radar: 0, test: 0 }, failed: st?.stats.failed ?? 0 };
  for (const m of Object.values(st?.members ?? {})) {
    if (m.slack) out.slackConnected++;
    if (m.webhook) out.webhookConnected++;
    if (m.slack?.broken || m.webhook?.broken) out.broken++;
  }
  for (const k of Object.keys(out.sent) as (keyof IntegrationStats["sent"])[]) out.sent[k] = st?.stats.sent[k] ?? 0;
  return out;
}
