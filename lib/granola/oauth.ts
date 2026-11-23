/**
 * Granola's sign-in, the way MCP clients connect to Granola's MCP server (OAuth 2.1 for MCP):
 *
 *  1. Discovery: the MCP server's protected resource metadata (RFC 9728) at
 *     <origin>/.well-known/oauth-protected-resource<path>, then the root one, then the server's own
 *     401 (WWW-Authenticate resource_metadata). It names the authorization server, whose metadata
 *     (RFC 8414, or OpenID's) gives the authorize, token, registration and revocation endpoints.
 *     Kept in memory for 3 hours (10 minutes after a failure, so a fix is picked up soon).
 *  2. Registration (RFC 7591): once per Merlin deployment, for the redirect address
 *     `${RN_PUBLIC_URL}/api/integrations/granola/callback`. The client id and secret are kept in
 *     State.granolaApp, the secret sealed. A client the token endpoint rejects is dropped and
 *     registered again next time.
 *  3. Authorization code with PKCE (S256) and the resource parameter (RFC 8707). The state and the
 *     verifier ride in a sealed, httpOnly cookie bound to the member and their session (lib/granola
 *     startSignIn, finishSignIn), used once.
 *  4. Tokens: the code swapped for an access and a refresh token, kept sealed per member; refreshed
 *     before they run out or on a 401; revoked on Disconnect when Granola advertises a revocation
 *     endpoint (RFC 7009).
 *
 * Nothing here logs a token, a code or a secret: only short codes. No network until a member is
 * signed in and Granola is switched on (RN_GRANOLA=1).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { loadState, tableInternals as T, type State } from "../table";
import { seal, unseal } from "../google/crypto";
import { GranolaError } from "./api";
import { granolaMcpUrl, safeUrl, type GranolaApp } from "./types";

const TIMEOUT_MS = 8_000;
const OK_TTL_MS = 3 * 3_600_000;
const FAIL_TTL_MS = 10 * 60_000;
const STATE_TTL_MS = 10 * 60_000;
export const OAUTH_COOKIE = "rn_granola_oauth";
export const OAUTH_COOKIE_PATH = "/api/integrations/granola";
export const CALLBACK_PATH = "/api/integrations/granola/callback";

export interface Discovery {
  /** Where Merlin sends MCP requests (RN_GRANOLA_MCP_URL). */
  mcpUrl: string;
  /** The resource the tokens are for (RFC 8707), from the protected resource metadata. */
  resource: string;
  issuer: string;
  authorize: string;
  token: string;
  register: string;
  revoke: string | null;
  scopes: string[];
  authMethods: string[];
}
export interface Prepared {
  d: Discovery;
  app: GranolaApp;
}
export interface Tokens {
  access: string;
  refresh: string | null;
  expiresAt: string | null;
}

/* Kept on globalThis: every route bundle shares one cache in a process. */
type Mem = {
  prep: { at: number; url: string; ok: Prepared | null } | null;
  inflight: Promise<Prepared> | null;
  used: Map<string, number>;
  renewing: Map<string, Promise<string>>;
};
const g = globalThis as typeof globalThis & { __rnGranolaOauth?: Mem };
const mem: Mem = (g.__rnGranolaOauth ??= { prep: null, inflight: null, used: new Map(), renewing: new Map() });

/** Tests: forget what was found, so the next look asks Granola again. */
export const _oauth = { reset: () => ((mem.prep = null), (mem.inflight = null), mem.used.clear(), mem.renewing.clear()), mem };

type AState = State & { granolaApp?: GranolaApp };

/** The address Granola sends the member back to. None without RN_PUBLIC_URL: no sign-in then. */
export function redirectUri(): string | null {
  const pub = process.env.RN_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return pub && safeUrl(pub) ? `${pub}${CALLBACK_PATH}` : null;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** RFC 8414 / RFC 9728 well-known addresses: with the path inserted after the well-known part, then at the root. */
function wellKnown(base: string, name: string): string[] {
  const u = new URL(base);
  const p = u.pathname.replace(/\/+$/, "");
  return [...(p ? [`${u.origin}/.well-known/${name}${p}`] : []), `${u.origin}/.well-known/${name}`];
}
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.length < 200) : []);
const sameIssuer = (a: unknown, b: string) => typeof a === "string" && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

async function discover(): Promise<Discovery> {
  const mcpUrl = granolaMcpUrl();
  if (!mcpUrl) throw new GranolaError("no_sign_in");
  // 1. The protected resource metadata.
  let prm: Record<string, unknown> | null = null;
  for (const u of wellKnown(mcpUrl, "oauth-protected-resource")) {
    const j = await getJson(u);
    if (j && strings(j.authorization_servers).length) {
      prm = j;
      break;
    }
  }
  if (!prm) {
    // The MCP server's own 401 names it (WWW-Authenticate: Bearer resource_metadata="...").
    try {
      const r = await fetch(mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const at = /resource_metadata="([^"]+)"/i.exec(r.headers.get("www-authenticate") ?? "")?.[1];
      const url = at ? safeUrl(new URL(at, mcpUrl).toString()) : null;
      const j = url ? await getJson(url) : null;
      if (j && strings(j.authorization_servers).length) prm = j;
    } catch {}
  }
  if (!prm) throw new GranolaError("no_sign_in");
  const resource = safeUrl(prm.resource) ?? mcpUrl;
  // The metadata must be for this server: the same origin as the MCP address.
  if (new URL(resource).origin !== new URL(mcpUrl).origin) throw new GranolaError("no_sign_in");
  const issuer = safeUrl(strings(prm.authorization_servers)[0]);
  if (!issuer) throw new GranolaError("no_sign_in");
  // 2. The authorization server's metadata (RFC 8414, then OpenID Connect discovery).
  let as: Record<string, unknown> | null = null;
  const iu = new URL(issuer);
  const ip = iu.pathname.replace(/\/+$/, "");
  const tries = [...wellKnown(issuer, "oauth-authorization-server"), ...(ip ? [`${iu.origin}/.well-known/openid-configuration${ip}`, `${iu.origin}${ip}/.well-known/openid-configuration`] : [`${iu.origin}/.well-known/openid-configuration`])];
  for (const u of tries) {
    const j = await getJson(u);
    if (j && sameIssuer(j.issuer, issuer) && safeUrl(j.authorization_endpoint) && safeUrl(j.token_endpoint)) {
      as = j;
      break;
    }
  }
  if (!as) throw new GranolaError("no_sign_in");
  const register = safeUrl(as.registration_endpoint);
  // No dynamic registration: Merlin has no client there, so no button.
  if (!register) throw new GranolaError("no_sign_in");
  const methods = strings(as.code_challenge_methods_supported);
  if (methods.length && !methods.includes("S256")) throw new GranolaError("no_sign_in");
  const scopes = strings(prm.scopes_supported);
  if (strings(as.scopes_supported).includes("offline_access") && !scopes.includes("offline_access")) scopes.push("offline_access");
  return {
    mcpUrl,
    resource,
    issuer,
    authorize: safeUrl(as.authorization_endpoint)!,
    token: safeUrl(as.token_endpoint)!,
    register,
    revoke: safeUrl(as.revocation_endpoint),
    scopes,
    authMethods: strings(as.token_endpoint_auth_methods_supported),
  };
}

/* ---------- Merlin's client (one per deployment) ---------- */

async function register(d: Discovery, redirect: string): Promise<GranolaApp> {
  const first: GranolaApp["auth"] = d.authMethods.includes("client_secret_basic") || !d.authMethods.length ? "client_secret_basic" : d.authMethods.includes("client_secret_post") ? "client_secret_post" : "none";
  const pub = process.env.RN_PUBLIC_URL?.trim().replace(/\/+$/, "");
  // A server that only takes public clients may refuse a confidential one: asked once more as a public client (PKCE alone).
  for (const wanted of first === "none" ? (["none"] as const) : ([first, "none"] as const)) {
    let r: Response;
    try {
      r = await fetch(d.register, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          client_name: "Merlin",
          redirect_uris: [redirect],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: wanted,
          ...(d.scopes.length ? { scope: d.scopes.join(" ") } : {}),
          ...(pub ? { client_uri: pub } : {}),
        }),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new GranolaError("no_sign_in");
    }
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (r.status === 400 && wanted !== "none") continue;
    if (!r.ok || !j || typeof j.client_id !== "string" || !j.client_id || j.client_id.length > 500) throw new GranolaError("no_sign_in", r.status);
    const secret = typeof j.client_secret === "string" && j.client_secret ? j.client_secret : null;
    const said = j.token_endpoint_auth_method;
    const auth: GranolaApp["auth"] = !secret ? "none" : said === "client_secret_post" || said === "client_secret_basic" ? said : wanted === "none" ? "client_secret_basic" : wanted;
    const exp = typeof j.client_secret_expires_at === "number" && j.client_secret_expires_at > 0 ? new Date(j.client_secret_expires_at * 1000).toISOString() : undefined;
    const app: GranolaApp = { issuer: d.issuer, redirectUri: redirect, clientId: j.client_id, ...(secret ? { secret: seal(secret) } : {}), auth, registeredAt: new Date().toISOString(), ...(exp ? { secretExpiresAt: exp } : {}) };
    await T.mutate((s) => void ((s as AState).granolaApp = app));
    return app;
  }
  throw new GranolaError("no_sign_in");
}

const fresh = (a: GranolaApp | undefined, d: Discovery, redirect: string): a is GranolaApp =>
  !!a && a.issuer === d.issuer && a.redirectUri === redirect && (!a.secretExpiresAt || Date.parse(a.secretExpiresAt) > Date.now() + 60_000) && (!a.secret || !!unseal(a.secret));

async function prepare(): Promise<Prepared> {
  const redirect = redirectUri();
  if (!redirect) throw new GranolaError("no_sign_in");
  const d = await discover();
  const have = ((await loadState()) as AState).granolaApp;
  const app = fresh(have, d, redirect) ? have : await register(d, redirect);
  return { d, app };
}

/**
 * Discovery and Merlin's client, cached: 3 hours when found, 10 minutes after a failure. Throws
 * no_sign_in when Granola's sign-in can't be used (the key form is the way in then).
 */
export async function prepared(force = false): Promise<Prepared> {
  const url = granolaMcpUrl() ?? "";
  const c = mem.prep;
  if (!force && c && c.url === url && Date.now() - c.at < (c.ok ? OK_TTL_MS : FAIL_TTL_MS)) {
    if (c.ok) return c.ok;
    throw new GranolaError("no_sign_in");
  }
  if (mem.inflight) return mem.inflight;
  const p = prepare()
    .then((ok) => ((mem.prep = { at: Date.now(), url, ok }), ok))
    .catch((e) => {
      mem.prep = { at: Date.now(), url, ok: null };
      console.error(`Granola sign-in: not available (${e instanceof GranolaError ? e.code : "error"})`);
      throw new GranolaError("no_sign_in");
    })
    .finally(() => (mem.inflight = null));
  mem.inflight = p;
  return p;
}

/** Whether "Connect Granola" can be offered now. Never throws. */
export async function signInReady(): Promise<boolean> {
  try {
    await prepared();
    return true;
  } catch {
    return false;
  }
}

/** Granola no longer knows this client: forget it, so the next start registers again. */
export async function dropApp(clientId: string): Promise<void> {
  await T.mutate((s) => {
    if ((s as AState).granolaApp?.clientId === clientId) delete (s as AState).granolaApp;
  });
  mem.prep = null;
}

/* ---------- PKCE, the state cookie ---------- */

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl(p: Prepared, state: string, challenge: string): string {
  const u = new URL(p.d.authorize);
  const q = u.searchParams;
  q.set("response_type", "code");
  q.set("client_id", p.app.clientId);
  q.set("redirect_uri", p.app.redirectUri);
  q.set("state", state);
  q.set("code_challenge", challenge);
  q.set("code_challenge_method", "S256");
  q.set("resource", p.d.resource);
  if (p.d.scopes.length) q.set("scope", p.d.scopes.join(" "));
  return u.toString();
}

const sessionTag = (token: string) => createHash("sha256").update(`rn-granola-session:${token}`).digest("hex").slice(0, 32);
const stateKey = (state: string) => createHash("sha256").update(`rn-granola-state:${state}`).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface Pending {
  verifier: string;
  back: string;
  clientId: string;
  issuer: string;
}

/** The sealed cookie a start sets: the state, the verifier, who and which session, where to go back to. 10 minutes. */
export function packState(o: { state: string; verifier: string; memberId: string; token: string; back: string; clientId: string; issuer: string }, nowMs = Date.now()): string {
  return seal(JSON.stringify({ s: o.state, v: o.verifier, m: o.memberId, t: sessionTag(o.token), b: o.back, c: o.clientId, i: o.issuer, x: nowMs + STATE_TTL_MS }));
}

/** The back address alone, from a cookie whose state can't be trusted yet (to return the member to where they were). */
export function backOf(cookie: string | null | undefined): string | null {
  try {
    const j = JSON.parse(unseal(cookie) ?? "null") as { b?: unknown } | null;
    return typeof j?.b === "string" ? j.b : null;
  } catch {
    return null;
  }
}

/**
 * The callback's check: the cookie opens, is unexpired, carries this state, this member and this
 * session, and was not used before. Used once either way.
 */
export function openState(cookie: string | null | undefined, state: string | null | undefined, token: string, memberId: string, nowMs = Date.now()): Pending | null {
  const raw = String(state ?? "");
  if (!raw || raw.length > 200) return null;
  let j: { s?: string; v?: string; m?: string; t?: string; b?: string; c?: string; i?: string; x?: number } | null = null;
  try {
    j = JSON.parse(unseal(cookie) ?? "null");
  } catch {
    return null;
  }
  if (!j || typeof j.s !== "string" || typeof j.v !== "string" || typeof j.x !== "number") return null;
  for (const [k, exp] of mem.used) if (exp <= nowMs) mem.used.delete(k);
  const k = stateKey(raw);
  if (mem.used.has(k)) return null;
  if (!same(j.s, raw)) return null;
  mem.used.set(k, nowMs + STATE_TTL_MS);
  if (j.x <= nowMs || j.m !== memberId || j.t !== sessionTag(token)) return null;
  return { verifier: j.v, back: String(j.b ?? ""), clientId: String(j.c ?? ""), issuer: String(j.i ?? "") };
}

/* ---------- the token endpoint ---------- */

function clientAuth(app: GranolaApp, body: URLSearchParams, headers: Record<string, string>) {
  const secret = app.secret ? unseal(app.secret) : null;
  if (app.auth === "client_secret_basic" && secret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(app.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
  else {
    body.set("client_id", app.clientId);
    if (app.auth === "client_secret_post" && secret) body.set("client_secret", secret);
  }
}

async function tokenCall(p: Prepared, fields: Record<string, string>): Promise<Tokens> {
  const body = new URLSearchParams(fields);
  body.set("resource", p.d.resource);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  clientAuth(p.app, body, headers);
  let r: Response;
  try {
    r = await fetch(p.d.token, { method: "POST", headers, body: body.toString(), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new GranolaError((e as { name?: string })?.name === "TimeoutError" ? "timeout" : "unreachable");
  }
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (!r.ok) {
    const err = typeof j?.error === "string" ? j.error : "";
    if (err === "invalid_client" || err === "unauthorized_client") throw new GranolaError("bad_client", r.status);
    if (err === "invalid_grant" || r.status === 401) throw new GranolaError("bad_key", r.status);
    if (r.status === 429) throw new GranolaError("busy", 429);
    throw new GranolaError(r.status >= 500 ? "server" : "bad_answer", r.status);
  }
  const access = j?.access_token;
  if (typeof access !== "string" || !access || access.length > 8000) throw new GranolaError("bad_answer", r.status);
  if (typeof j?.token_type === "string" && j.token_type.toLowerCase() !== "bearer") throw new GranolaError("bad_answer", r.status);
  const ttl = typeof j?.expires_in === "number" && j.expires_in > 0 ? j.expires_in : null;
  const refresh = typeof j?.refresh_token === "string" && j.refresh_token && j.refresh_token.length <= 8000 ? j.refresh_token : null;
  return { access, refresh, expiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null };
}

export const exchangeCode = (p: Prepared, code: string, verifier: string) => tokenCall(p, { grant_type: "authorization_code", code, redirect_uri: p.app.redirectUri, code_verifier: verifier });
export const refreshGrant = (p: Prepared, refresh: string) => tokenCall(p, { grant_type: "refresh_token", refresh_token: refresh });

/** RFC 7009: ask Granola to end a token. False when no revocation endpoint is advertised or it didn't answer. Never throws. */
export async function revokeToken(p: Prepared, token: string, hint: "refresh_token" | "access_token"): Promise<boolean> {
  if (!p.d.revoke) return false;
  const body = new URLSearchParams({ token, token_type_hint: hint });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  clientAuth(p.app, body, headers);
  try {
    const r = await fetch(p.d.revoke, { method: "POST", headers, body: body.toString(), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return r.ok;
  } catch {
    return false;
  }
}

/** One renewal at a time per member: a refresh token Granola rotates must not be spent twice. */
export function renewOnce(memberId: string, work: () => Promise<string>): Promise<string> {
  const have = mem.renewing.get(memberId);
  if (have) return have;
  const p = work().finally(() => mem.renewing.delete(memberId));
  mem.renewing.set(memberId, p);
  return p;
}
