/**
 * What the Claude connector keeps in the runtime state (State.connector in lib/table.ts):
 * the apps a member connected (OAuth clients and their grants) and the member's saved searches.
 *
 * Tokens are never stored: only their SHA-256 hashes. A grant is one connected app for one
 * member (connecting the same app again replaces it). Shared by server code only.
 */
import type { SavedSearch } from "./alerts";
import type { AgentLogRow } from "./agentTools";

export interface OAuthClient {
  /** Our random id, or the https URL of a Client ID Metadata Document (never stored, see oauth.ts). */
  id: string;
  name: string;
  redirectUris: string[];
  /** "none" for public clients (Claude, ChatGPT, Claude Code, Cursor). Otherwise a secret is checked at the token endpoint. */
  authMethod: "none" | "client_secret_post" | "client_secret_basic";
  /** SHA-256 of the client secret, when it has one. */
  secretHash?: string;
  uri?: string;
  createdAt: string;
}

export interface Grant {
  id: string;
  memberId: string;
  clientId: string;
  /** The app's name as it registered, shown in Connected apps. */
  clientName: string;
  /** The resource the tokens are for (the MCP address), when the client named one. */
  resource: string | null;
  scope: string;
  createdAt: string;
  /** Last time a token was issued or refreshed (written at most once an hour). */
  lastUsedAt: string;
  /** Live access tokens (newest last, at most a few): hash and expiry (ISO). */
  access: { hash: string; exp: string }[];
  refresh: { hash: string; exp: string };
  /** Refresh tokens already swapped for new ones, with when. Presenting one again ends the grant (after a short grace for retries). */
  spent?: { hash: string; at: string }[];
}

export interface ConnectorState {
  clients: OAuthClient[];
  grants: Grant[];
  /** Saved searches (alerts) by member id. */
  alerts: Record<string, SavedSearch[]>;
  /**
   * Agent access (lib/mcp/log.ts), by member id: the tools they switched off for their agents and
   * the daily spend limit for all their agents together. Settings: kept in the admin export.
   */
  agent?: Record<string, { off: string[]; limit: number | null; at?: string }>;
  /**
   * What each member's agents did (lib/mcp/log.ts), by member id, oldest first, 90 days: the tool,
   * when, credits spent, the outcome and the app. Never an argument or a result. The member's own:
   * never in the admin export; account closure's purge deletes it.
   */
  log?: Record<string, AgentLogRow[]>;
}

export const emptyConnector = (): ConnectorState => ({ clients: [], grants: [], alerts: {} });
