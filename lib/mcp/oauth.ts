/**
 * OAuth 2.1 for the Claude connector: Merlin is both the authorization server and the
 * protected resource (/api/mcp). What MCP clients (Claude, ChatGPT, Claude Code, Cursor) expect:
 *
 *  - Clients register themselves (RFC 7591, /api/oauth/register), or name a Client ID Metadata
 *    Document (an https URL as the client_id, fetched and checked here).
 *  - Authorization code with PKCE S256, always. The member signs in with their usual cookie and
 *    says yes on the consent page (app/oauth/consent).
 *  - Opaque random tokens. Only SHA-256 hashes are stored (State.connector.grants), with the
 *    member, the client and the expiry: access tokens last an hour, refresh tokens 30 days, and
 *    each refresh swaps both (rotation). A refresh token used twice ends the grant (after 30
 *    seconds of grace, for a client that retried).
 *  - Authorization codes and pending consent requests live in memory for 10 and 30 minutes
 *    (one server process). A code used twice ends the grant it made.
 *
 * Redirect URIs: https, or http on localhost / 127.0.0.1 / [::1] (any port, RFC 8252), and the
 * few app links in RN_MCP_EXTRA_REDIRECTS (Cursor's by default).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { connectorState, updateConnector } from "../table";
import type { ConnectorState, Grant, OAuthClient } from "./types";
import { SCOPE } from "./http";

export const ACCESS_TTL = 60 * 60 * 1000;
/** An hour. With RN_MCP_TEST=1 an app registered as "Expiry test" gets 2-second tokens, so the tests can see one expire. */
const accessTtl = (g: Grant) => (process.env.RN_MCP_TEST === "1" && g.clientName === "Expiry test" ? 2000 : ACCESS_TTL);
export const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const REQUEST_TTL = 30 * 60 * 1000;
/** A refresh token presented again this soon after it was swapped is a retry, not a theft (2 seconds with RN_MCP_TEST=1, for the tests). */
const REUSE_GRACE = process.env.RN_MCP_TEST === "1" ? 2000 : 30 * 1000;
const CLIENT_MAX = 5000;
const GRANTS_PER_MEMBER = 20;
const TOUCH_EVERY = 60 * 60 * 1000;

const now = () => Date.now();
const isoIn = (ms: number) => new Date(now() + ms).toISOString();
export const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const token = (prefix: string, bytes = 32) => `${prefix}_${randomBytes(bytes).toString("base64url")}`;
const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class OAuthFail extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ---------- redirect URIs ---------- */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const extraRedirects = () =>
  (process.env.RN_MCP_EXTRA_REDIRECTS ?? "cursor://anysphere.cursor-mcp/oauth/callback")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** A redirect URI a client may register: https, loopback http, or one of the allowed app links. No fragment, no user info. */
export function redirectAllowed(raw: string): boolean {
  if (raw.length > 2000) return false;
  if (extraRedirects().includes(raw)) return true;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return !!u.hostname;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname);
  return false;
}

/** The request's redirect URI matches one the client registered. Loopback ones may use any port (RFC 8252 section 7.3). */
function redirectMatches(registered: string[], asked: string): boolean {
  if (registered.includes(asked)) return true;
  let a: URL;
  try {
    a = new URL(asked);
  } catch {
    return false;
  }
  if (a.protocol !== "http:" || !LOOPBACK.has(a.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === a.hostname && u.pathname === a.pathname && u.search === a.search;
    } catch {
      return false;
    }
  });
}

/* ---------- clients ---------- */

const cleanName = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, 60);

export interface RegisterResult {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  client_secret?: string;
  client_secret_expires_at?: number;
}

/** RFC 7591 registration. Public clients by default; a client that asks for a secret gets one (shown once). */
export async function registerClient(meta: Record<string, unknown>): Promise<RegisterResult> {
  const uris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.map(String).slice(0, 10) : [];
  if (!uris.length) throw new OAuthFail("invalid_redirect_uri", "Send at least one redirect_uri.");
  for (const u of uris) if (!redirectAllowed(u)) throw new OAuthFail("invalid_redirect_uri", `This redirect_uri isn't allowed: ${u.slice(0, 200)}. Use https, or http on localhost.`);
  const method = String(meta.token_endpoint_auth_method ?? "none");
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method))
    throw new OAuthFail("invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.");
  const grants = Array.isArray(meta.grant_types) ? meta.grant_types.map(String) : ["authorization_code", "refresh_token"];
  if (!grants.includes("authorization_code") || grants.some((g) => g !== "authorization_code" && g !== "refresh_token"))
    throw new OAuthFail("invalid_client_metadata", "grant_types may be authorization_code and refresh_token.");
  const types = Array.isArray(meta.response_types) ? meta.response_types.map(String) : ["code"];
  if (types.some((t) => t !== "code")) throw new OAuthFail("invalid_client_metadata", "response_types may only be code.");
  const secret = method === "none" ? undefined : token("tps", 32);
  const client: OAuthClient = {
    id: token("tpc", 16),
    name: cleanName(meta.client_name) || "An app",
    redirectUris: uris,
    authMethod: method as OAuthClient["authMethod"],
    ...(secret ? { secretHash: hashOf(secret) } : {}),
    ...(typeof meta.client_uri === "string" && /^https:\/\//.test(meta.client_uri) ? { uri: meta.client_uri.slice(0, 300) } : {}),
    createdAt: new Date().toISOString(),
  };
  await updateConnector((c) => {
    prune(c);
    c.clients.push(client);
    if (c.clients.length > CLIENT_MAX) {
      const used = new Set(c.grants.map((g) => g.clientId));
      const drop = c.clients.findIndex((x) => !used.has(x.id));
      c.clients.splice(drop >= 0 ? drop : 0, 1);
    }
  });
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
    client_name: client.name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
    scope: SCOPE,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

/** Drop what has run out: grants past their refresh expiry, and registered clients nobody ever connected after a day. */
function prune(c: ConnectorState) {
  const t = now();
  c.grants = c.grants.filter((g) => Date.parse(g.refresh.exp) > t);
  const used = new Set(c.grants.map((g) => g.clientId));
  c.clients = c.clients.filter((x) => used.has(x.id) || t - Date.parse(x.createdAt) < 24 * 60 * 60 * 1000);
}

/* Client ID Metadata Documents: an https URL as the client id. Fetched once an hour at most. */
const cimdCache = new Map<string, { client: OAuthClient | null; at: number }>();
const isCimd = (id: string) => /^https:\/\//.test(id) || (process.env.RN_MCP_TEST === "1" && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(id));

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

async function fetchCimd(url: string): Promise<OAuthClient | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hash || u.username || u.password || u.pathname === "/") return null;
  if (process.env.RN_MCP_TEST !== "1") {
    if (u.protocol !== "https:") return null;
    try {
      const addrs = await lookup(u.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 10_000) return null;
    const doc = JSON.parse(text);
    if (!doc || doc.client_id !== url) return null;
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String).slice(0, 10) : [];
    if (!uris.length || !uris.every(redirectAllowed)) return null;
    const method = String(doc.token_endpoint_auth_method ?? "none");
    if (method !== "none") return null; // a document can't carry a shared secret; key-based client auth isn't offered
    return { id: url, name: cleanName(doc.client_name) || u.hostname, redirectUris: uris, authMethod: "none", createdAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function findClient(id: string): Promise<OAuthClient | null> {
  if (!id || id.length > 500) return null;
  if (isCimd(id)) {
    const hit = cimdCache.get(id);
    if (hit && now() - hit.at < 60 * 60 * 1000) return hit.client;
    const client = await fetchCimd(id);
    cimdCache.set(id, { client, at: now() });
    if (cimdCache.size > 500) cimdCache.delete(cimdCache.keys().next().value!);
    return client;
  }
  return (await connectorState()).clients.find((c) => c.id === id) ?? null;
}

/* ---------- the authorization request ---------- */

export interface AuthRequest {
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scope: string;
  resource: string | null;
  at: number;
}
const requests = new Map<string, AuthRequest>();
const sweep = <T extends { at: number }>(m: Map<string, T>, ttl: number) => {
  const t = now();
  for (const [k, v] of m) if (t - v.at > ttl) m.delete(k);
};

/** Where to send the browser with an error, once the redirect URI is known to be the client's. */
export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null, issuer: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

const sameResource = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
/** A resource indicator (RFC 8707) names this server: the MCP address, or the site itself. */
export const resourceOk = (resource: string, mcp: string, origin: string) => sameResource(resource, mcp) || sameResource(resource, origin);

/**
 * Check an authorization request. A bad client or redirect URI is shown on the page (`page`); any
 * other problem goes back to the client (`redirect`). On success the request waits for the member.
 */
export async function startAuthorization(
  q: URLSearchParams,
  mcp: string,
  origin: string,
): Promise<{ ok: AuthRequest } | { page: string } | { redirect: string }> {
  const clientId = q.get("client_id") ?? "";
  const client = await findClient(clientId);
  if (!client) return { page: "We don't know the app that sent you here. Go back to it and connect Merlin again." };
  const redirectUri = q.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri))
    return { page: "The app sent a return address it didn't register, so we stopped here. Go back to the app and connect again." };
  const state = q.get("state");
  const back = (error: string, description: string) => ({ redirect: errorRedirect(redirectUri, error, description, state, origin) });
  if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = q.get("code_challenge") ?? "";
  if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  const resource = q.get("resource");
  if (resource && !resourceOk(resource, mcp, origin)) return back("invalid_target", "The resource must be this server's MCP address.");
  // One scope, the table. Whatever else was asked for is left out.
  const req: AuthRequest = { id: token("tpr", 18), clientId, clientName: client.name, redirectUri, state, challenge, scope: SCOPE, resource: resource || null, at: now() };
  sweep(requests, REQUEST_TTL);
  requests.set(req.id, req);
  return { ok: req };
}

export function pendingRequest(id: string): AuthRequest | null {
  const r = requests.get(id);
  if (!r || now() - r.at > REQUEST_TTL) return null;
  return r;
}

/* ---------- codes and tokens ---------- */

interface CodeEntry {
  req: AuthRequest;
  memberId: string;
  at: number;
  /** The grant this code was exchanged for. A second use ends it. */
  used?: string;
}
const codes = new Map<string, CodeEntry>();

/** The member said yes or no. Returns where to send the browser. */
export function decide(reqId: string, memberId: string | null, allow: boolean, issuer: string): string | null {
  const req = pendingRequest(reqId);
  if (!req) return null;
  requests.delete(reqId);
  if (!allow || !memberId) return errorRedirect(req.redirectUri, "access_denied", "The member said no.", req.state, issuer);
  const code = token("tpa", 32);
  sweep(codes, CODE_TTL);
  codes.set(hashOf(code), { req, memberId, at: now() });
  const u = new URL(req.redirectUri);
  u.searchParams.set("code", code);
  if (req.state) u.searchParams.set("state", req.state);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

export interface TokenAnswer {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The client authenticates (secret clients) or names itself (public clients). */
async function clientFor(fields: Record<string, string>, authHeader: string | null): Promise<OAuthClient> {
  let id = fields.client_id ?? "";
  let secret = fields.client_secret ?? "";
  const basic = authHeader?.match(/^Basic\s+(.+)$/i);
  if (basic) {
    const raw = Buffer.from(basic[1], "base64").toString("utf8");
    const at = raw.indexOf(":");
    if (at > 0) {
      id = decodeURIComponent(raw.slice(0, at));
      secret = decodeURIComponent(raw.slice(at + 1));
    }
  }
  const client = await findClient(id);
  if (!client) throw new OAuthFail("invalid_client", "Unknown client.", 401);
  if (client.authMethod !== "none") {
    if (!secret || !client.secretHash || !sameText(hashOf(secret), client.secretHash)) throw new OAuthFail("invalid_client", "The client secret didn't match.", 401);
  }
  return client;
}

function issue(g: Grant): { access: string; refresh: string; ttl: number } {
  const access = token("tpat", 32);
  const refresh = token("tprt", 32);
  const t = now();
  g.access = [...g.access.filter((a) => Date.parse(a.exp) > t), { hash: hashOf(access), exp: isoIn(accessTtl(g)) }].slice(-5);
  g.refresh = { hash: hashOf(refresh), exp: isoIn(REFRESH_TTL) };
  g.lastUsedAt = new Date(t).toISOString();
  return { access, refresh, ttl: accessTtl(g) };
}
const answer = (t: { access: string; refresh: string; ttl: number }, scope: string): TokenAnswer => ({
  access_token: t.access,
  token_type: "Bearer",
  expires_in: Math.round(t.ttl / 1000),
  refresh_token: t.refresh,
  scope,
});

/** POST /api/oauth/token. */
export async function tokenRequest(fields: Record<string, string>, authHeader: string | null, mcp: string, origin: string): Promise<TokenAnswer> {
  const grantType = fields.grant_type;
  if (grantType !== "authorization_code" && grantType !== "refresh_token") throw new OAuthFail("unsupported_grant_type", "Use authorization_code or refresh_token.");
  const client = await clientFor(fields, authHeader);
  if (fields.resource && !resourceOk(fields.resource, mcp, origin)) throw new OAuthFail("invalid_target", "The resource must be this server's MCP address.");

  if (grantType === "authorization_code") {
    const code = fields.code ?? "";
    const key = hashOf(code);
    const entry = codes.get(key);
    if (!entry || now() - entry.at > CODE_TTL) throw new OAuthFail("invalid_grant", "That code has expired or was never issued.");
    if (entry.used) {
      // A code used twice: whoever has it now may not be the app. End what it made.
      const grantId = entry.used;
      codes.delete(key);
      await updateConnector((c) => {
        c.grants = c.grants.filter((g) => g.id !== grantId);
      });
      throw new OAuthFail("invalid_grant", "That code was already used.");
    }
    if (entry.req.clientId !== client.id) throw new OAuthFail("invalid_grant", "That code was issued to another app.");
    if ((fields.redirect_uri ?? entry.req.redirectUri) !== entry.req.redirectUri) throw new OAuthFail("invalid_grant", "redirect_uri doesn't match the one in the request.");
    const verifier = fields.code_verifier ?? "";
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !sameText(s256(verifier), entry.req.challenge)) throw new OAuthFail("invalid_grant", "The code_verifier doesn't match.");
    const grantId = token("tpg", 12);
    entry.used = grantId;
    const tokens = await updateConnector((c) => {
      prune(c);
      // Connecting the same app again replaces its grant.
      c.grants = c.grants.filter((g) => !(g.memberId === entry.memberId && g.clientId === client.id));
      const g: Grant = {
        id: grantId,
        memberId: entry.memberId,
        clientId: client.id,
        clientName: client.name,
        resource: fields.resource || entry.req.resource,
        scope: entry.req.scope,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        access: [],
        refresh: { hash: "", exp: isoIn(REFRESH_TTL) },
      };
      const t = issue(g);
      c.grants.push(g);
      const mine = c.grants.filter((x) => x.memberId === entry.memberId);
      if (mine.length > GRANTS_PER_MEMBER) c.grants = c.grants.filter((x) => x !== mine[0]);
      return t;
    });
    return answer(tokens, entry.req.scope);
  }

  const presented = hashOf(fields.refresh_token ?? "");
  const out = await updateConnector((c): { t?: ReturnType<typeof issue>; scope?: string; fail?: string } => {
    const t = now();
    const g = c.grants.find((x) => x.refresh.hash === presented);
    if (g) {
      if (g.clientId !== client.id) return { fail: "That refresh token belongs to another app." };
      if (Date.parse(g.refresh.exp) <= t) return { fail: "That refresh token has expired. Connect Merlin again." };
      g.spent = [...(g.spent ?? []).filter((x) => t - Date.parse(x.at) < REFRESH_TTL), { hash: g.refresh.hash, at: new Date(t).toISOString() }].slice(-20);
      return { t: issue(g), scope: g.scope };
    }
    const reused = c.grants.find((x) => x.spent?.some((s) => s.hash === presented));
    if (reused) {
      const when = Date.parse(reused.spent!.find((s) => s.hash === presented)!.at);
      // A retry right after a refresh is a client's race, not a stolen token.
      if (t - when > REUSE_GRACE) c.grants = c.grants.filter((x) => x !== reused);
      return { fail: "That refresh token was already used." };
    }
    return { fail: "That refresh token isn't valid. Connect Merlin again." };
  });
  if (out.fail) throw new OAuthFail("invalid_grant", out.fail);
  return answer(out.t!, out.scope!);
}

/** POST /api/oauth/revoke (RFC 7009): an access or a refresh token ends its whole grant. Always "ok". */
export async function revokeToken(tok: string): Promise<void> {
  const h = hashOf(tok);
  await updateConnector((c) => {
    c.grants = c.grants.filter((g) => g.refresh.hash !== h && !g.access.some((a) => a.hash === h));
  });
}

/* ---------- checking an access token ---------- */

const indexes = new WeakMap<ConnectorState, Map<string, { grant: Grant; exp: number }>>();
function indexOf(c: ConnectorState) {
  let idx = indexes.get(c);
  if (!idx) {
    idx = new Map();
    for (const g of c.grants) for (const a of g.access) idx.set(a.hash, { grant: g, exp: Date.parse(a.exp) });
    indexes.set(c, idx);
  }
  return idx;
}

/** The grant behind a bearer token, or why there is none. */
export async function checkAccess(bearer: string | null, mcp: string, origin: string): Promise<{ grant: Grant } | { error: "missing" | "invalid" | "expired" }> {
  if (!bearer) return { error: "missing" };
  const hit = indexOf(await connectorState()).get(hashOf(bearer));
  if (!hit) return { error: "invalid" };
  if (hit.exp <= now()) return { error: "expired" };
  if (hit.grant.resource && !resourceOk(hit.grant.resource, mcp, origin)) return { error: "invalid" };
  const g = hit.grant;
  if (now() - Date.parse(g.lastUsedAt) > TOUCH_EVERY) {
    const id = g.id;
    void updateConnector((c) => {
      const x = c.grants.find((y) => y.id === id);
      if (x) x.lastUsedAt = new Date().toISOString();
    }).catch(() => {});
  }
  return { grant: g };
}

/* ---------- Connected apps (Your credits) ---------- */

export interface ConnectedApp {
  id: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string;
}

export async function connectedApps(memberId: string): Promise<ConnectedApp[]> {
  const t = now();
  return (await connectorState()).grants
    .filter((g) => g.memberId === memberId && Date.parse(g.refresh.exp) > t)
    .map((g) => ({ id: g.id, name: g.clientName, connectedAt: g.createdAt, lastUsedAt: g.lastUsedAt }))
    .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt));
}

/** Revoke one connected app. False when it isn't this member's. */
export async function disconnectApp(memberId: string, grantId: string): Promise<boolean> {
  return updateConnector((c) => {
    const before = c.grants.length;
    c.grants = c.grants.filter((g) => !(g.id === grantId && g.memberId === memberId));
    return c.grants.length < before;
  });
}

/** For tests: forget the codes and requests held in memory. */
export const _memory = { codes, requests };
