/**
 * Checks of the Claude connector: the discovery documents, client registration, the OAuth flow
 * with PKCE (wrong verifier, reused code, expired token, refresh rotation, revoke), the MCP
 * server (tools/list and every tool), gating (a locked value or a hidden company never shows up
 * in a tool result, an unlock without confirm spends nothing and one with confirm spends 1, as
 * the app does), the seat-holder rule, Connected apps, the limits, and a real MCP client (the
 * SDK's) completing the handshake and the OAuth sign-in.
 *
 *   BASE=http://localhost:4980 node scripts/test-mcp.mjs
 *
 * Run it against a server on a fresh data dir started with RN_MCP_TEST=1 (short token lifetimes
 * for one test app, and Client ID Metadata Documents over http on localhost), RN_SCAN_TEST=1 and
 * RN_CRON_SECRET=qa-cron. scripts/test-all.sh does. Without RN_MCP_TEST the timing checks are
 * skipped. Names, emails and sign-in codes never go to the log.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

const BASE = (process.env.BASE || "http://localhost:4980").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const STARTER = Number(process.env.STARTER ?? 25);
const RUN = Date.now().toString(36);
const MCP = `${BASE}/api/mcp`;
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${(Date.now() >> 2) & 255}`;
let ipN = 0;
const nextIp = () => `${IP_BASE}.${(++ipN % 250) + 1}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passes = 0;
let failures = 0;
let seedFile = null;
try {
  seedFile = JSON.parse(readFileSync(process.env.SEED_FILE ?? "data/intel-seed.json", "utf8"));
} catch {
  /* no seed here */
}
const secretWords = new Set();
/** Words the product says about itself. A company in the seed can share one (a company named Merlin), so they are never a leak. */
const PRODUCT_WORDS = new Set(["Merlin", "Revenue Nomad", "Crystal Ball"]);
/**
 * Which of many words occur in a text, in one pass. The seed's tens of thousands of names and titles checked one by one
 * against a view of many megabytes took most of an hour; this indexes the words by their first 6 characters and looks
 * at each place in the text once. Words shorter than 6 characters are checked the plain way.
 */
function wordFinder(words) {
  const byHead = new Map();
  const short = [];
  for (const w of new Set(words)) {
    if (typeof w !== "string" || !w) continue;
    if (w.length < 6) short.push(w);
    else {
      const k = w.slice(0, 6);
      const l = byHead.get(k);
      if (l) l.push(w);
      else byHead.set(k, [w]);
    }
  }
  return (text) => {
    const found = new Set(short.filter((w) => text.includes(w)));
    for (let i = 0; i + 6 <= text.length; i++) {
      const l = byHead.get(text.slice(i, i + 6));
      if (l) for (const w of l) if (!found.has(w) && text.startsWith(w, i)) found.add(w);
    }
    return found;
  };
}
function redact(text) {
  let out = String(text);
  for (const w of secretWords) if (w && out.includes(w)) out = out.split(w).join("[redacted]");
  return out.replace(/(tp(at|rt|a|s)_)[A-Za-z0-9_-]+/g, "$1[redacted]");
}
const pass = (name) => (passes++, console.log(`PASS ${name}`));
const fail = (name, detail) => (failures++, console.log(`FAIL ${name}${detail === undefined ? "" : `: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}`}`));
const check = (name, ok, detail) => (ok ? pass(name) : fail(name, detail));
const skip = (name, why) => console.log(`SKIP ${name}: ${why}`);

/* ---------- http ---------- */

async function call(method, path, { cookie, ipAddr, body, form, headers = {}, redirect = "manual" } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = `rn_table=${cookie}`;
  h["x-forwarded-for"] ??= ipAddr ?? nextIp();
  let payload;
  if (form) {
    h["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const go = () => fetch(path.startsWith("http") ? path : BASE + path, { method, headers: h, body: payload, redirect });
  // A kept-alive connection the server closed while this script was busy fails once; a new one goes through.
  const r = await go().catch(() => go());
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}

async function join(name, { email, headers } = {}) {
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", { ipAddr, headers, body: { join: { name, email: email ?? `qa+mcp-${RUN}-${Math.random().toString(36).slice(2, 8)}@example.com` } } });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  if (!token) throw new Error(`join failed: ${r.status} ${r.text.slice(0, 200)}`);
  secretWords.add(token);
  const m = { name, token, ip: ipAddr };
  m.view = async () => (await call("GET", "/api/table", { cookie: token, ipAddr })).json;
  m.act = (action) => call("POST", "/api/table", { cookie: token, ipAddr, body: { action } });
  await m.act({ type: "profile", function: "Marketing", goal: "friendly" });
  return m;
}

/* ---------- OAuth ---------- */

const b64url = (buf) => buf.toString("base64url");
const pkce = () => {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
};
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

async function register(meta = {}) {
  return call("POST", "/api/oauth/register", { body: { client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", ...meta } });
}

function authorizeUrl(clientId, { challenge, redirect = REDIRECT, state = "st-" + RUN, method = "S256", resource = MCP, extra = {} } = {}) {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, state, ...(challenge ? { code_challenge: challenge, code_challenge_method: method } : {}), ...(resource ? { resource } : {}), ...extra });
  return `/api/oauth/authorize?${q}`;
}

/** Start an authorization and say yes as `member`. Returns the redirect URL the app gets back. */
async function consent(member, url, allow = true) {
  const r = await call("GET", url);
  const loc = r.headers.get("location") ?? "";
  const reqId = new URL(loc, BASE).searchParams.get("r");
  if (!reqId) return { loc, status: r.status };
  const d = await call("POST", "/api/oauth/authorize", { cookie: member?.token, headers: { origin: BASE }, body: { r: reqId, allow } });
  return { loc, reqId, answer: d, back: d.json?.redirect ? new URL(d.json.redirect) : null };
}

const tokenCall = (form, headers) => call("POST", "/api/oauth/token", { form, headers });

/** Register, consent and exchange: a connected app for this member. */
async function connect(member, { name = "Claude", redirect = REDIRECT } = {}) {
  const reg = await register({ client_name: name, redirect_uris: [redirect] });
  const clientId = reg.json.client_id;
  const p = pkce();
  const c = await consent(member, authorizeUrl(clientId, { challenge: p.challenge, redirect }));
  const code = c.back?.searchParams.get("code");
  const t = await tokenCall({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirect, code_verifier: p.verifier, resource: MCP });
  if (!t.json?.access_token) throw new Error(`connect failed: ${t.status} ${t.text.slice(0, 200)}`);
  secretWords.add(t.json.access_token);
  secretWords.add(t.json.refresh_token);
  return { clientId, ...t.json };
}

/* ---------- MCP ---------- */

let rpcId = 0;
async function rpc(access, method, params, { version = "2025-06-18", headers = {} } = {}) {
  return call("POST", "/api/mcp", {
    headers: { authorization: `Bearer ${access}`, accept: "application/json, text/event-stream", "mcp-protocol-version": version, ...headers },
    body: { jsonrpc: "2.0", id: ++rpcId, method, ...(params ? { params } : {}) },
  });
}

/** Everything member A's tools returned, to search for values A must not see. */
const seenByA = [];
/** What A's tool calls sent: a word A typed itself (an alert named "Fractional VP Sales") is no leak when it comes back. */
const sentByA = [];
let aAccess = null;
/**
 * The server allows 60 tool calls a minute per member (lib/mcp/server.ts). The checks run faster than a person, so each
 * run waits once it has made 55 calls in the last minute (the SDK client's own calls fit in the rest). The limits check itself is let through (noPace).
 */
let callTimes = [];
const noPace = new Set();
async function paced(access) {
  if (noPace.has(access)) return;
  // One window for every token: the limit is per member, and one member holds several tokens here (refreshes, the SDK client).
  const now = Date.now();
  callTimes = callTimes.filter((t) => now - t < 60_000);
  if (callTimes.length >= 55) {
    await new Promise((res) => setTimeout(res, 60_500 - (now - callTimes[0])));
    callTimes.shift();
  }
  callTimes.push(Date.now());
}
async function tool(access, name, args = {}) {
  await paced(access);
  const r = await rpc(access, "tools/call", { name, arguments: args });
  const text = r.json?.result?.content?.[0]?.text ?? "";
  if (access === aAccess) seenByA.push(text), sentByA.push(JSON.stringify(args));
  let out = null;
  try {
    out = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, out, text, isError: !!r.json?.result?.isError, raw: r.json };
}

/* ---------- the checks ---------- */

async function main() {
  const health = await call("GET", "/api/health");
  if (health.status !== 200) throw new Error(`server not up at ${BASE}`);

  /* discovery */
  const prm = await call("GET", "/.well-known/oauth-protected-resource/api/mcp");
  const prmRoot = await call("GET", "/.well-known/oauth-protected-resource");
  check("protected resource metadata names the MCP address and this server", prm.status === 200 && prm.json?.resource === MCP && prm.json.authorization_servers?.[0] === BASE, prm.json);
  check("it answers at the root path too", prmRoot.json?.resource === MCP);
  const asm = await call("GET", "/.well-known/oauth-authorization-server");
  const a = asm.json ?? {};
  check(
    "authorization server metadata has the endpoints, S256 and registration",
    a.issuer === BASE && a.authorization_endpoint === `${BASE}/api/oauth/authorize` && a.token_endpoint === `${BASE}/api/oauth/token` && a.registration_endpoint === `${BASE}/api/oauth/register` && a.code_challenge_methods_supported?.join() === "S256" && a.grant_types_supported?.includes("refresh_token") && a.response_types_supported?.join() === "code",
    a,
  );
  check("it says Client ID Metadata Documents are supported", a.client_id_metadata_document_supported === true);
  const asmPath = await call("GET", "/.well-known/oauth-authorization-server/api/mcp");
  check("it answers with a path after it too", asmPath.json?.issuer === BASE);
  const pre = await call("OPTIONS", "/api/mcp", { headers: { origin: "https://claude.ai", "access-control-request-method": "POST" } });
  check("CORS preflight is answered", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*" && /authorization/.test(pre.headers.get("access-control-allow-headers") ?? ""));

  /* 401 */
  const no = await call("POST", "/api/mcp", { headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
  const wa = no.headers.get("www-authenticate") ?? "";
  check("no token: 401 with WWW-Authenticate naming the resource metadata", no.status === 401 && wa.startsWith("Bearer ") && wa.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`), [no.status, wa]);
  const bad = await rpc("tpat_not-a-real-token", "tools/list");
  check("a made-up token: 401 invalid_token", bad.status === 401 && /error="invalid_token"/.test(bad.headers.get("www-authenticate") ?? ""), bad.status);
  const getNo = await call("GET", "/api/mcp");
  check("GET without a token is 401 too", getNo.status === 401);

  /* registration */
  const reg = await register();
  check("dynamic registration answers 201 with a client id and no secret for a public client", reg.status === 201 && /^tpc_/.test(reg.json?.client_id) && !reg.json.client_secret && reg.json.token_endpoint_auth_method === "none", reg.json);
  const badRedirects = await Promise.all(["http://evil.example.com/cb", "javascript:alert(1)", "https://x.example.com/cb#frag", "ftp://x.example.com/cb"].map((u) => register({ redirect_uris: [u] })));
  check("redirect URIs must be https or http on localhost", badRedirects.every((r) => r.status === 400 && r.json?.error === "invalid_redirect_uri"), badRedirects.map((r) => r.status));
  const okRedirects = await Promise.all(["http://localhost:33418/callback", "http://127.0.0.1:6274/oauth/callback", "cursor://anysphere.cursor-mcp/oauth/callback"].map((u) => register({ redirect_uris: [u] })));
  check("loopback http and Cursor's app link are accepted", okRedirects.every((r) => r.status === 201), okRedirects.map((r) => r.status));
  check("registration needs a redirect URI", (await register({ redirect_uris: [] })).status === 400);
  check("registration refuses a grant type it doesn't do", (await register({ grant_types: ["client_credentials"] })).status === 400);
  const secretReg = await register({ token_endpoint_auth_method: "client_secret_post" });
  check("a client that asks for a secret gets one once", secretReg.status === 201 && /^tps_/.test(secretReg.json?.client_secret ?? ""), secretReg.json?.token_endpoint_auth_method);
  if (secretReg.json?.client_secret) secretWords.add(secretReg.json.client_secret);

  /* members */
  const A = await join("Ada Connector");
  const B = await join("Bea Builder");
  const L = await join("Lou Limits");
  for (const m of [A, B, L]) secretWords.add(m.name);

  /* the authorization request */
  const clientId = reg.json.client_id;
  const p = pkce();
  const unknown = await call("GET", authorizeUrl("tpc_nobody", { challenge: p.challenge }));
  check("an unknown client stops on our page", unknown.status === 302 && (unknown.headers.get("location") ?? "").includes("/oauth/consent?e=client"), unknown.headers.get("location"));
  const wrongBack = await call("GET", authorizeUrl(clientId, { challenge: p.challenge, redirect: "https://evil.example.com/cb" }));
  check("a redirect URI the client didn't register stops on our page", (wrongBack.headers.get("location") ?? "").includes("/oauth/consent?e=redirect"), wrongBack.headers.get("location"));
  const noPkce = await call("GET", authorizeUrl(clientId, {}));
  const noPkceLoc = new URL(noPkce.headers.get("location") ?? "http://x");
  check("no PKCE goes back to the app with invalid_request and the state", noPkceLoc.origin + noPkceLoc.pathname === REDIRECT && noPkceLoc.searchParams.get("error") === "invalid_request" && noPkceLoc.searchParams.get("state") === "st-" + RUN, noPkceLoc.toString());
  const plain = new URL((await call("GET", authorizeUrl(clientId, { challenge: p.challenge, method: "plain" }))).headers.get("location") ?? "http://x");
  check("the plain PKCE method is refused", plain.searchParams.get("error") === "invalid_request");
  const wrongRes = new URL((await call("GET", authorizeUrl(clientId, { challenge: p.challenge, resource: "https://other.example.com/mcp" }))).headers.get("location") ?? "http://x");
  check("a resource that isn't this server is refused", wrongRes.searchParams.get("error") === "invalid_target");

  const start = await call("GET", authorizeUrl(clientId, { challenge: p.challenge }));
  const reqId = new URL(start.headers.get("location") ?? "http://x", BASE).searchParams.get("r");
  check("a good request goes to the consent page", start.status === 302 && !!reqId && (start.headers.get("location") ?? "").startsWith(`${BASE}/oauth/consent?r=`), start.headers.get("location"));
  const infoOut = await call("GET", `/api/oauth/authorize?info=1&r=${reqId}`);
  check("signed out, the consent page is told to sign in first", infoOut.json?.ok === true && infoOut.json.signedIn === false && infoOut.json.app === "Claude" && infoOut.json.returnsTo === "claude.ai", infoOut.json);
  const infoIn = await call("GET", `/api/oauth/authorize?info=1&r=${reqId}`, { cookie: A.token });
  check("signed in, it shows the member's first name", infoIn.json?.signedIn === true && infoIn.json.firstName === A.name.split(" ")[0]);
  const page = await call("GET", `/oauth/consent?r=${reqId}`);
  check("the consent page itself loads", page.status === 200 && page.text.includes("Merlin"));
  const cross = await call("POST", "/api/oauth/authorize", { cookie: A.token, headers: { origin: "https://evil.example.com" }, body: { r: reqId, allow: true } });
  check("an answer from another site is refused", cross.status === 403);
  const signedOut = await call("POST", "/api/oauth/authorize", { headers: { origin: BASE }, body: { r: reqId, allow: true } });
  check("allowing needs the member signed in", signedOut.status === 401);
  const yes = await call("POST", "/api/oauth/authorize", { cookie: A.token, headers: { origin: BASE }, body: { r: reqId, allow: true } });
  const back = new URL(yes.json?.redirect ?? "http://x");
  const code = back.searchParams.get("code");
  check("allowing sends the app a code with its state and our issuer", back.origin + back.pathname === REDIRECT && !!code && back.searchParams.get("state") === "st-" + RUN && back.searchParams.get("iss") === BASE, back.origin);
  check("a request is answered once", (await call("POST", "/api/oauth/authorize", { cookie: A.token, headers: { origin: BASE }, body: { r: reqId, allow: true } })).status === 410);

  const wrongV = await tokenCall({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: pkce().verifier });
  check("the wrong code_verifier is refused", wrongV.status === 400 && wrongV.json?.error === "invalid_grant", wrongV.json);
  const otherClient = await register({ client_name: "Other" });
  const wrongC = await tokenCall({ grant_type: "authorization_code", code, client_id: otherClient.json.client_id, redirect_uri: REDIRECT, code_verifier: p.verifier });
  check("another app can't use the code", wrongC.json?.error === "invalid_grant");
  const wrongR = await tokenCall({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: "https://claude.ai/other", code_verifier: p.verifier });
  check("the redirect_uri must match the request's", wrongR.json?.error === "invalid_grant");
  const tok = await tokenCall({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: p.verifier, resource: MCP });
  const t1 = tok.json ?? {};
  check("the right verifier gets an access and a refresh token", tok.status === 200 && /^tpat_/.test(t1.access_token) && /^tprt_/.test(t1.refresh_token) && t1.token_type === "Bearer" && t1.expires_in === 3600 && t1.scope === "table", { status: tok.status, expires: t1.expires_in });
  secretWords.add(t1.access_token);
  secretWords.add(t1.refresh_token);
  check("token answers are not cached", tok.headers.get("cache-control") === "no-store");
  const ok1 = await rpc(t1.access_token, "ping");
  check("the access token works on /api/mcp", ok1.status === 200 && ok1.json?.result !== undefined, ok1.status);
  const reused = await tokenCall({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: p.verifier });
  check("a code used twice is refused", reused.json?.error === "invalid_grant");
  check("and the tokens it made stop working", (await rpc(t1.access_token, "ping")).status === 401);

  const deny = await consent(A, authorizeUrl(clientId, { challenge: pkce().challenge }), false);
  check("Don't allow sends access_denied back to the app", deny.back?.searchParams.get("error") === "access_denied" && deny.back.searchParams.get("state") === "st-" + RUN);

  /* refresh rotation */
  const c2 = await connect(A);
  const r1 = await tokenCall({ grant_type: "refresh_token", refresh_token: c2.refresh_token, client_id: c2.clientId });
  check("a refresh gives new tokens", r1.status === 200 && r1.json.access_token !== c2.access_token && r1.json.refresh_token !== c2.refresh_token, r1.json);
  secretWords.add(r1.json?.access_token);
  secretWords.add(r1.json?.refresh_token);
  check("the new access token works", (await rpc(r1.json.access_token, "ping")).status === 200);
  const again = await tokenCall({ grant_type: "refresh_token", refresh_token: c2.refresh_token, client_id: c2.clientId });
  check("the old refresh token is refused", again.json?.error === "invalid_grant");
  const otherRefresh = await tokenCall({ grant_type: "refresh_token", refresh_token: r1.json.refresh_token, client_id: otherClient.json.client_id });
  check("another app can't use the refresh token", otherRefresh.json?.error === "invalid_grant");
  const r2 = await tokenCall({ grant_type: "refresh_token", refresh_token: r1.json.refresh_token, client_id: c2.clientId });
  check("a retry right after a refresh doesn't end the grant", r2.status === 200, r2.json);
  secretWords.add(r2.json?.access_token);
  secretWords.add(r2.json?.refresh_token);

  const expiry = await connect(A, { name: "Expiry test" });
  const testMode = expiry.expires_in === 2;
  if (!testMode) skip("expiry and reuse timing", "start the server with RN_MCP_TEST=1");
  else {
    await sleep(2600);
    const late = await rpc(expiry.access_token, "ping");
    check("an expired access token gets 401 invalid_token", late.status === 401 && /error="invalid_token"/.test(late.headers.get("www-authenticate") ?? ""), late.status);
    const fresh = await tokenCall({ grant_type: "refresh_token", refresh_token: expiry.refresh_token, client_id: expiry.clientId });
    secretWords.add(fresh.json?.access_token);
    secretWords.add(fresh.json?.refresh_token);
    check("a refresh after it expired works", fresh.status === 200 && (await rpc(fresh.json.access_token, "ping")).status === 200);
    // An old refresh token presented after the grace: the grant ends, so the newest tokens stop too.
    await sleep(2200);
    const stale = await tokenCall({ grant_type: "refresh_token", refresh_token: expiry.refresh_token, client_id: expiry.clientId });
    check("an old refresh token used after the grace is refused", stale.json?.error === "invalid_grant");
    const after = await tokenCall({ grant_type: "refresh_token", refresh_token: fresh.json.refresh_token, client_id: expiry.clientId });
    check("and it ends the grant, so the newest refresh token stops working too", after.json?.error === "invalid_grant");
  }

  /* revoke */
  const c3 = await connect(A, { name: "Revoke test" });
  const rv = await call("POST", "/api/oauth/revoke", { form: { token: c3.refresh_token } });
  check("revoking a refresh token answers 200", rv.status === 200);
  check("and its access token stops working", (await rpc(c3.access_token, "ping")).status === 401);
  check("revoking a token nobody knows still answers 200", (await call("POST", "/api/oauth/revoke", { form: { token: "tprt_nothing" } })).status === 200);

  /* secret clients */
  const sp = pkce();
  const sc = await consent(A, authorizeUrl(secretReg.json.client_id, { challenge: sp.challenge }));
  const scCode = sc.back?.searchParams.get("code");
  const noSecret = await tokenCall({ grant_type: "authorization_code", code: scCode, client_id: secretReg.json.client_id, redirect_uri: REDIRECT, code_verifier: sp.verifier });
  check("a secret client without its secret gets invalid_client", noSecret.status === 401 && noSecret.json?.error === "invalid_client");
  const basic = Buffer.from(`${encodeURIComponent(secretReg.json.client_id)}:${encodeURIComponent(secretReg.json.client_secret)}`).toString("base64");
  const withSecret = await tokenCall({ grant_type: "authorization_code", code: scCode, redirect_uri: REDIRECT, code_verifier: sp.verifier }, { authorization: `Basic ${basic}` });
  check("with its secret (HTTP Basic) it gets tokens", withSecret.status === 200 && !!withSecret.json?.access_token, withSecret.json?.error);
  secretWords.add(withSecret.json?.access_token);
  secretWords.add(withSecret.json?.refresh_token);

  /* Client ID Metadata Document */
  if (testMode) {
    const docServer = http.createServer((req, res) => {
      const port = docServer.address().port;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ client_id: `http://127.0.0.1:${port}/client.json`, client_name: "Doc Client", redirect_uris: ["http://127.0.0.1:9999/callback"], token_endpoint_auth_method: "none" }));
    });
    await new Promise((r) => docServer.listen(0, "127.0.0.1", r));
    const docId = `http://127.0.0.1:${docServer.address().port}/client.json`;
    const dp = pkce();
    const dc = await consent(A, authorizeUrl(docId, { challenge: dp.challenge, redirect: "http://127.0.0.1:9999/callback" }));
    const dt = await tokenCall({ grant_type: "authorization_code", code: dc.back?.searchParams.get("code"), client_id: docId, redirect_uri: "http://127.0.0.1:9999/callback", code_verifier: dp.verifier });
    check("a client named by its metadata document URL connects without registering", dt.status === 200 && !!dt.json?.access_token, dt.json?.error);
    secretWords.add(dt.json?.access_token);
    secretWords.add(dt.json?.refresh_token);
    docServer.close();
  }

  /* MCP: initialize, tools/list */
  const at = r2.json.access_token;
  aAccess = at;
  const init = await rpc(at, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "qa", version: "1" } });
  const ir = init.json?.result ?? {};
  check("initialize answers with the protocol version asked for (2025-06-18)", ir.protocolVersion === "2025-06-18" && ir.serverInfo?.name === "merlin" && !!ir.capabilities?.tools, ir.protocolVersion);
  check("initialize carries instructions on how to use the table", /Never spend a credit without asking/.test(ir.instructions ?? ""));
  const init2 = await rpc(at, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "qa", version: "1" } });
  check("and 2025-11-25 too", init2.json?.result?.protocolVersion === "2025-11-25");
  const note = await call("POST", "/api/mcp", { headers: { authorization: `Bearer ${at}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: { jsonrpc: "2.0", method: "notifications/initialized" } });
  check("a notification gets 202", note.status === 202, note.status);
  const list = await rpc(at, "tools/list");
  const names = (list.json?.result?.tools ?? []).map((t) => t.name).sort();
  const want = ["add_company_fact", "add_my_seat", "add_person", "alerts", "change_proposal", "create_or_update_proposal", "draft_proposal_from_call", "find_company", "follow_company", "get_company", "get_proposal", "get_proposal_kit", "leads_passed_to_me", "list_evidence", "list_open_roles", "list_peers", "list_proposal_templates", "match_evidence", "my_account", "my_pipeline", "my_voice", "pass_lead", "rate_benchmarks", "save_evidence_case", "save_my_voice", "search_companies", "send_document_for_signature", "send_proposal_for_signature", "todays_moves", "unlock", "update_pipeline", "ways_in"];
  check("tools/list has every tool", JSON.stringify(names) === JSON.stringify(want), names);
  const unlockTool = list.json?.result?.tools?.find((t) => t.name === "unlock");
  check("the unlock tool tells the model to ask first", /ASK THE MEMBER FIRST/.test(unlockTool?.description ?? "") && unlockTool.inputSchema?.properties?.confirm?.type === "boolean");
  check("read tools are marked read only", list.json?.result?.tools?.filter((t) => ["search_companies", "get_company", "list_open_roles", "rate_benchmarks", "my_account", "my_voice", "my_pipeline", "todays_moves"].includes(t.name)).every((t) => t.annotations?.readOnlyHint === true));
  // Your writing voice and today's moves (lib/voice.ts, lib/moves.ts): conclusions only, shown first, the member sends.
  const voiceTool = list.json?.result?.tools?.find((t) => t.name === "save_my_voice");
  check("save_my_voice tells the model: conclusions only, never message text, names or addresses, and only after the member agrees", /CONCLUSIONS ONLY/.test(voiceTool?.description ?? "") && /NEVER paste message text, subjects, quotes, names, email addresses/.test(voiceTool.description) && /member_agreed: true/.test(voiceTool.description) && voiceTool.annotations?.readOnlyHint === false);
  check("the instructions say how a voice is learned and that the member sends", /save_my_voice/.test(ir.instructions ?? "") && /Merlin never sends a note for a member/.test(ir.instructions) && /todays_moves/.test(ir.instructions));
  const VOICE = { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "sometimes", emoji: false, opener: "direct", phrases: ["No rush at all"] };
  const noVoice = await tool(at, "my_voice");
  check("my_voice: none saved yet, and how to learn it", noVoice.out?.saved === false && /sent emails/.test(noVoice.out?.note ?? ""), noVoice.out);
  const preview = await tool(at, "save_my_voice", { voice: VOICE });
  check("save_my_voice without the member's yes saves nothing", preview.out?.saved === false && /Show the member/.test(preview.out?.next ?? "") && (await tool(at, "my_voice")).out?.saved === false, preview.out);
  const withText = await tool(at, "save_my_voice", { voice: { ...VOICE, sample_email: "Hi Dana, great to see you on Tuesday. Let's pick this up next week." }, member_agreed: true });
  check("save_my_voice refuses message text in another field", withText.isError && /never message text/.test(withText.text) && !/great to see you/.test(withText.text), withText.text);
  const mailPhrase = await tool(at, "save_my_voice", { voice: { ...VOICE, phrases: ["On Tue Dana Whitfield wrote: sounds good"] }, member_agreed: true });
  const addrPhrase = await tool(at, "save_my_voice", { voice: { ...VOICE, phrases: ["write me at pat@example.com"] }, member_agreed: true });
  const badValue = await tool(at, "save_my_voice", { voice: { ...VOICE, formality: "Sincerely, Pat Example, 512 555 0100" }, member_agreed: true });
  const noObject = await tool(at, "save_my_voice", { voice: "Hi Dana, great to see you on Tuesday.", member_agreed: true });
  check("a voice that isn't the object of conclusions is refused", noObject.isError || !!noObject.raw?.error, noObject.text);
  check("and a phrase that reads like mail, an address, or a value off its list", mailPhrase.isError && addrPhrase.isError && badValue.isError && (await tool(at, "my_voice")).out?.saved === false, [mailPhrase.text, addrPhrase.text, badValue.text]);
  const savedVoice = await tool(at, "save_my_voice", { voice: VOICE, member_agreed: true });
  const readVoice = await tool(at, "my_voice");
  check("with their yes it is saved, and my_voice reads it back", savedVoice.out?.saved === true && readVoice.out?.saved === true && JSON.stringify(readVoice.out.voice) === JSON.stringify(VOICE), readVoice.out);
  const tmoves = await tool(at, "todays_moves");
  check("todays_moves answers with the moves, the voice and how to use them", !tmoves.isError && Array.isArray(tmoves.out?.moves) && tmoves.out.moves.length <= 3 && /member sends each note themselves/.test(tmoves.out.how_to_use ?? "") && !/@/.test(JSON.stringify(tmoves.out.moves)), tmoves.text.slice(0, 300));
  const badOrigin = await rpc(at, "ping", null, { headers: { origin: "https://evil.example.com" } });
  check("a browser origin we don't know is refused", badOrigin.status === 403);
  const unknownTool = await tool(at, "drop_tables");
  check("an unknown tool is an error", unknownTool.isError || !!unknownTool.raw?.error);

  /* data to test against: B adds a company with a person and B's own seat with a rate; a scan posts a hidden-company role */
  const coName = `Qa Mcp Co ${RUN}`;
  const personName = "Pia Hiddenfield";
  const personEmail = `pia-${RUN}@qa-mcp.example.com`;
  // A person's title is locked with their name (one credit opens both), so it must never show before A pays.
  const personTitle = `Chief Qa Officer ${RUN}`;
  const bRate = "$12,345/mo";
  const addB = await B.act({
    type: "add",
    company: coName,
    website: `qa-mcp-${RUN}.example.com`,
    newEngagement: true,
    engagementFields: { operator: B.name, function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Ended", start: "2024-01", end: "2024-09", pricing: "Monthly retainer", rate: bRate },
    operatorMemberId: "me",
    people: [{ name: personName, title: personTitle, relationship: "Hiring for the seat", email: personEmail }],
  });
  check("setup: B adds a company, B's seat and a person", addB.status === 200, addB.json);
  secretWords.add(personName);
  const hiddenName = `Qa Hidden Mcp ${RUN}`;
  const hiddenSite = `qa-hidden-mcp-${RUN}.example.com`;
  const norateName = `Qa Norate Mcp ${RUN}`;
  const norateSite = `qa-norate-mcp-${RUN}.example.com`;
  const scan = await call("POST", "/api/table/scan", {
    headers: { "x-cron-secret": CRON_SECRET },
    body: {
      roles: [
        { key: `qamcp${RUN}:cmo`, company: hiddenName, domain: `https://${hiddenSite}/jobs`, title: "Fractional CMO", function: "Marketing", type: "Fractional", url: `https://jobs.example.com/qamcp/${RUN}`, source: `qa-mcp-board-${RUN}`, postedAt: null, rate: "$9,876/mo", hoursPerWeek: 15 },
        // No rate and no hours on this one, and a posting link with no scheme.
        { key: `qamcp${RUN}:revops`, company: norateName, domain: `${norateSite}`, title: "Fractional Head of RevOps", function: "RevOps", type: "Fractional", url: `jobs.example.com/qamcp-norate/${RUN}`, source: `qa-mcp-board-${RUN}`, postedAt: null },
        // Placeholder names are not companies: the scan files nothing under them.
        ...["Private Company", "Stealth Startup", "Confidential", "A Series B SaaS company"].map((company, n) => ({ key: `qamcp${RUN}:ph${n}`, company, title: "Fractional VP Sales", function: "Sales", type: "Fractional", url: `https://jobs.example.com/qamcp-ph/${RUN}/${n}`, source: `qa-mcp-board-${RUN}`, postedAt: null })),
      ],
      sources: [{ source: `qa-mcp-board-${RUN}`, fetched: 8, matched: 6 }],
    },
  });
  check("setup: a scan posts two open roles at new companies, and none under a placeholder name", scan.status === 200 && scan.json?.result?.opened === 2, scan.json);

  // A unlocked B's company in the app (2 credits): every company is locked for a member until they unlock it or know it.
  const bCoId = (await B.view()).companies.find((c) => c.name === coName)?.id;
  const aCo = await A.act({ type: "unlock", entity: "company", id: bCoId, field: "identity" });
  check("setup: A unlocks B's company for 2 credits", aCo.status === 200 && aCo.json?.me?.credits === STARTER - 2, aCo.json);

  /* A's view in the app: the ground truth of what A may see */
  const av0 = await A.view();
  const aJson0 = JSON.stringify(av0);
  const forbidden = new Set([personName, personTitle, personEmail, bRate, hiddenName, hiddenSite, norateName, norateSite, "$9,876/mo", `jobs.example.com/qamcp/${RUN}`, `qamcp-norate/${RUN}`, A.token, B.token]);
  const seedWords = [];
  if (seedFile) {
    const words = [
      ...seedFile.members.flatMap((m) => [m.token, m.email]),
      ...seedFile.companies.map((c) => c.fields.name),
      ...(seedFile.contacts ?? []).flatMap((p) => [p.fields.name, p.fields.email, p.fields.phone, p.fields.linkedin]),
      // A title that is only a word and a function ("Fractional Marketing", from the seat scan) says nothing, and the tools write such words themselves (an alert's name).
      ...seedFile.engagements.flatMap((e) => [e.fields.operator, e.fields.rate, e.fields.posting, /^(Fractional|Interim)\s+[A-Za-z&/-]+$/i.test(e.fields.role ?? "") ? null : e.fields.role]),
    ]
      // The product's own name is in every tool's words ("Your profile on Merlin"), whatever company shares it.
      .filter((w) => typeof w === "string" && w.length >= 6 && !PRODUCT_WORDS.has(w));
    // Every string the app view shows, to skip the slow substring search for most words (a seed of a few thousand companies).
    const shownStrings = new Set();
    const walk = (x) => {
      if (typeof x === "string") shownStrings.add(x);
      else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y);
    };
    walk(av0);
    const uniq = [...new Set(words)];
    const esc = (w) => JSON.stringify(w).slice(1, -1);
    const inView = wordFinder(uniq.flatMap((w) => [w, esc(w)]))(aJson0);
    for (const w of uniq) {
      secretWords.add(w);
      seedWords.push(w);
      // Anything A's own app view shows is allowed. The rest is locked or hidden for A.
      if (!shownStrings.has(w) && !inView.has(w) && !inView.has(esc(w))) forbidden.add(w);
    }
  }
  check("setup: what B added is locked for A in the app", !aJson0.includes(personName) && !aJson0.includes(bRate) && !aJson0.includes(hiddenName));

  /* the tools, as A */
  const acc = await tool(at, "my_account", {});
  check("my_account: credits, today's earnings and the cap match the app", acc.out?.credits === av0.me.credits && acc.out.earned_today === `${av0.me.earned24h} of ${av0.me.earnCap}` && acc.out.unlocks_left_today === av0.me.unlocksLeft, acc.out);
  check("my_account never carries the sign-in code", !acc.text.includes(A.token) && !/"token"/.test(acc.text));
  check("my_account: alerts explain email isn't set up", /Email isn't set up/.test(acc.out?.weekly_email ?? ""), acc.out?.weekly_email);

  const s1 = await tool(at, "search_companies", { limit: 25 });
  check("search_companies returns companies with ids, fit and locked counts", s1.out?.total > 0 && s1.out.companies.every((c) => c.id && c.fit && typeof c.locked_facts === "number"), s1.out?.total);
  const scores = s1.out?.companies.map((c) => c.fit_score) ?? [];
  check("ranked best fit first, as the table", scores.every((v, i) => i === 0 || scores[i - 1] >= v), scores);
  const TIERS = ["Hiring now", "Repeat hirer", "Recent seat", "Past seat", "Posting closed", "Full-time only", "No seats"];
  check("every company's fit is one of the app's tiers, with a one-line reason", s1.out?.companies?.every((c) => TIERS.includes(c.fit) && typeof c.fit_reason === "string" && c.fit_reason.length > 10), s1.out?.companies?.[0]);
  const s2 = await tool(at, "search_companies", { query: coName, limit: 5 });
  const coRow = s2.out?.companies?.[0];
  check("search finds a company by name", coRow?.name === coName, s2.out);
  const s3 = await tool(at, "search_companies", { hiring_now: true, limit: 25 });
  check("hiring_now finds hidden companies, never by name", s3.out?.companies?.length > 0 && s3.out.companies.some((c) => c.hidden && c.name === "Locked company"), s3.out?.total);
  const s4 = await tool(at, "search_companies", { query: hiddenName });
  check("a hidden company's name finds nothing", s4.out?.total === 0, s4.out?.total);
  const s5 = await tool(at, "search_companies", { no_function_yet: "Marketing", fractional_friendly: true, limit: 25 });
  check("no_function_yet keeps companies that hired other functions and not this one", (s5.out?.companies ?? []).every((c) => c.functions_hired.length > 0 && !c.functions_hired.includes("Marketing")), s5.out?.companies?.slice(0, 3));
  const rh = await tool(at, "search_companies", { repeat_hirer: true, limit: 25 });
  check(
    "repeat_hirer keeps companies with 2 or more fractional hires, or hires in 2 or more functions",
    !rh.isError && rh.out?.companies?.length > 0 && rh.out.companies.every((c) => c.repeat_hirer === true && (c.fractional_hires >= 2 || c.functions_hired.length >= 2)),
    rh.out?.companies?.slice(0, 3).map((c) => [c.fractional_hires, c.functions_hired]) ?? rh.text,
  );
  const ff = await tool(at, "search_companies", { fractional_friendly: true, limit: 25 });
  check("fractional_friendly still works as before", !ff.isError && ff.out?.total > 0, [ff.out?.total, rh.out?.total]);
  const s6 = await tool(at, "search_companies", { function_hired: "Sales", revenue: ["$5m-$20m"], limit: 25 });
  check("function_hired and a revenue band typed loosely work", !s6.isError && (s6.out?.companies ?? []).every((c) => c.functions_hired.includes("Sales") && c.revenue === "$5M–$20M"), s6.out ?? s6.text);
  const s7 = await tool(at, "search_companies", { industry: ["Not an industry"] });
  check("an industry not on the list is an error that names the list", s7.isError && /isn't one of/.test(s7.text));

  const g1 = await tool(at, "get_company", { company: coRow?.id });
  const gSeat = g1.out?.seats?.[0];
  check(
    // Fellow fractionals are free (PEERS_FREE): at a company the member sees, who held the seat and the role show at no charge.
    "get_company shows the seat with free facts and locked ones marked, who held it and the role they held free",
    gSeat?.function === "Sales" &&
      gSeat.type === "Fractional" &&
      gSeat.start === "2024-01" &&
      typeof gSeat.seat_holder === "string" && !/locked|credit/.test(gSeat.seat_holder) &&
      typeof gSeat.role === "string" && !/locked|credit/.test(gSeat.role) &&
      gSeat.rate === "locked, 1 credit to unlock",
    gSeat,
  );
  const gPerson = gSeat?.people?.[0];
  check(
    "the person's relationship shows, their name and title are locked together, their email opens after the name",
    gPerson?.relationship === "Hiring for the seat" && gPerson.name === "locked, 1 credit opens this person's name and title together" && gPerson.title === gPerson.name && /^opens after the name\. Unlock their name and title first/.test(gPerson.email ?? ""),
    gPerson,
  );
  check("warm paths name the seat holder and the exec who hired for the seat", (g1.out?.warm_paths ?? []).some((w) => /held the Sales seat/.test(w.who)) && (g1.out?.warm_paths ?? []).some((w) => /hiring for the seat/.test(w.who)), g1.out?.warm_paths);
  check("it says what unlocking everything costs and what A could add", typeof g1.out?.locked === "object" && g1.out.locked.purchases >= 3 && Array.isArray(g1.out.you_can_add) && g1.out.you_can_add.includes("hq"), g1.out?.locked);
  const gByName = await tool(at, "get_company", { company: coName });
  check("get_company takes a visible company's name too", gByName.out?.id === coRow?.id);
  const hiddenRow = s3.out?.companies?.find((c) => c.hidden);
  const gh = await tool(at, "get_company", { company: hiddenRow?.id });
  check("a hidden company's record keeps its name and website hidden", gh.out?.name === "Locked company" && gh.out.hidden === true && !("website" in gh.out && !/locked until/.test(gh.out.website)), { name: gh.out?.name, site: gh.out?.website });
  // The table carries a company's About without its text (Cell.lazy): get_company reads the text from the server.
  const aboutRow = (await A.view()).companies.find((c) => !c.hidden && c.cells.about?.lazy);
  if (aboutRow) {
    const ga = await tool(at, "get_company", { company: aboutRow.id });
    const direct = (await call("GET", `/api/table?about=${aboutRow.id}`, { cookie: A.token, ipAddr: A.ip })).json?.about?.[aboutRow.id];
    check("get_company gives the About text the table leaves out", typeof ga.out?.about === "string" && ga.out.about.length > 0 && ga.out.about === direct?.v, [ga.out?.about?.length, direct?.s]);
  } else skip("get_company's About", "no company with an About on this seed");

  const lr = await tool(at, "list_open_roles", { since_days: 7, function: "Marketing" });
  // Our role: the newest Marketing role with a posted rate and hours on file (the seed's open roles were listed before this run).
  const ourRole = lr.out?.roles?.find((r) => r.role === "Fractional CMO" && r.company === "Locked company" && /^on file/.test(r.posted_hours ?? ""));
  const LOCKED_CO = "on file, unlocks with the company (2 credits)";
  check("list_open_roles since 7 days lists this week's role at a locked company, its title free", !!ourRole && ourRole.company_hidden && ourRole.function === "Marketing" && ourRole.role === "Fractional CMO" && ourRole.posting === LOCKED_CO && ourRole.unlock?.call?.field === "identity", lr.out?.roles?.slice(0, 2));
  check("before unlocking, the posted hours, rate and posting say only that they are on file", ourRole?.posted_hours === LOCKED_CO && ourRole.posted_rate === LOCKED_CO && ourRole.posting === LOCKED_CO, ourRole);
  check("and the unlock says it opens the posted rate (one is on file)", /posted rate/.test(ourRole?.unlock?.cost ?? "") && !/No rate/.test(ourRole?.unlock?.cost ?? ""), ourRole?.unlock);
  check("every open role carries its fit and a one-line reason", (lr.out?.roles ?? []).length > 0 && lr.out.roles.every((r) => r.company_fit && typeof r.fit_reason === "string" && r.fit_reason.length > 10), lr.out?.roles?.[0]);
  check("an open role at a company with no past hire says why it ranks low", /open role alone ranks low until a past fractional hire is on file/.test(ourRole?.fit_reason ?? ""), ourRole?.fit_reason);
  const lrRev = await tool(at, "list_open_roles", { since_days: 7, function: "RevOps" });
  const noRate = lrRev.out?.roles?.find((r) => r.role === "Fractional Head of RevOps" && r.company === "Locked company");
  check("a role with no rate says No rate posted before paying", noRate?.posted_rate === "No rate posted" && !("posted_hours" in noRate), noRate);
  check("and its unlock never promises a rate", !!noRate && /No rate was posted/.test(noRate.unlock?.cost ?? "") && !/the posted rate/.test(noRate.unlock?.cost ?? ""), noRate?.unlock);
  check("a locked company with nothing on file says so plainly", /not on file yet/.test(noRate?.not_on_file ?? ""), noRate?.not_on_file);
  const nrCo = await tool(at, "get_company", { company: noRate?.company_id });
  check("get_company on it: no rate promised, the seat says No rate posted, what isn't on file is named", /No rate was posted/.test(nrCo.out?.hidden_note ?? "") && nrCo.out?.seats?.[0]?.posted_rate === "No rate posted" && /not on file yet/.test(nrCo.out?.not_on_file ?? ""), { note: nrCo.out?.hidden_note, seat: nrCo.out?.seats?.[0] });
  const nrPrice = await tool(at, "unlock", { entity: "company", id: noRate?.company_id, field: "identity" });
  check("its unlock price check opens the posting and says no rate was posted", nrPrice.out?.would_spend === 2 && /job posting/.test(nrPrice.out.would_open) && /No rate was posted/.test(nrPrice.out.would_open) && !/the posted rate/.test(nrPrice.out.would_open), nrPrice.out);
  const hrsPrice = await tool(at, "unlock", { entity: "seat", id: ourRole?.seat_id, field: "posted_hours" });
  check("asking for a locked role's hours prices the company (one purchase)", hrsPrice.out?.would_spend === 2 && /company and its open roles/.test(hrsPrice.out.would_open ?? ""), hrsPrice.out ?? hrsPrice.text);
  // Placeholder names are not companies: nowhere in search, open roles or the table.
  const phSearch = await Promise.all(["Private Company", "Stealth Startup", "Confidential"].map((q) => tool(at, "search_companies", { query: q, limit: 25 })));
  check("placeholder names find nothing in search", phSearch.every((r) => !r.isError && (r.out?.companies ?? []).every((c) => !/^(private company|stealth startup|confidential)$/i.test(c.name))), phSearch.map((r) => r.out?.total));
  const allNames = JSON.stringify((await A.view()).companies.map((c) => c.name));
  check("and the app's table has no placeholder company", !/"(Private Company|Stealth Startup|Confidential|A Series B SaaS company|Start- Up)"/.test(allNames));
  const lrAll = await tool(at, "list_open_roles", { limit: 40 });
  check("list_open_roles lists open roles newest first", lrAll.out?.total >= 1 && (lrAll.out.roles ?? []).every((r, i, xs) => i === 0 || (xs[i - 1].listed_since ?? "") >= (r.listed_since ?? "")), lrAll.out?.total);

  const rb = await tool(at, "rate_benchmarks", {});
  check("rate_benchmarks answers with groups by function and revenue", Array.isArray(rb.out?.rows) && rb.out.rows.every((r) => r.function && r.client_revenue && r.monthly && r.hourly), rb.out?.rows?.length);
  const rbSales = await tool(at, "rate_benchmarks", { function: "Sales", revenue: "All" });
  check("rate_benchmarks filters by function and band", !rbSales.isError && rbSales.out.rows.every((r) => r.function === "Sales" && r.client_revenue === "All"), rbSales.text.slice(0, 200));

  // Another fresh member reads many records the way a model would (A stays under the minute's limit).
  {
    const C = await join("Cy Reader");
    secretWords.add(C.name);
    const cc = await connect(C, { name: "Reader" });
    const cJson = JSON.stringify(await C.view());
    const banned = new Set([personName, personEmail, bRate, hiddenName, hiddenSite, "$9,876/mo", C.token, A.token, B.token]);
    const escW = (w) => JSON.stringify(w).slice(1, -1);
    const inC = wordFinder(seedWords.flatMap((w) => [w, escW(w)]))(cJson);
    for (const w of seedWords) if (!inC.has(w) && !inC.has(escW(w))) banned.add(w);
    const texts = [];
    // A locked company's About shows too, without its own name, web address, links, emails or people (lib/scan/clean.ts
    // aboutWithout). Its own words may name other companies or a title ("built on Microsoft", "Founder-led"): those
    // are checked apart, for everything but other companies' names and seat titles.
    const abouts = [];
    const read = async (name, args) => {
      const r = await tool(cc.access_token, name, args);
      if (name === "get_company" && typeof r.out?.about === "string") {
        abouts.push(r.out.about);
        texts.push(JSON.stringify({ ...r.out, about: undefined }));
      } else texts.push(r.text);
      return r;
    };
    const ids = [];
    for (const args of [{ limit: 25 }, { limit: 25, offset: 25 }, { hiring_now: true, limit: 25 }, { fractional_friendly: true, sort: "newest", limit: 25 }]) ids.push(...((await read("search_companies", args)).out?.companies ?? []).map((c) => c.id));
    const roles = await read("list_open_roles", { limit: 40 });
    ids.push(...(roles.out?.roles ?? []).map((r) => r.company_id));
    const uniq = [...new Set(ids)].slice(0, 50);
    for (const id of uniq) await read("get_company", { company: id });
    await read("my_account", {});
    await read("rate_benchmarks", {});
    const all = texts.join("\n");
    const aboutAll = abouts.join("\n");
    const naturalWords = new Set([...(seedFile?.companies ?? []).map((c) => c.fields.name), ...(seedFile?.engagements ?? []).map((e) => e.fields.role)]);
    const inAll50 = wordFinder([...banned])(all);
    const inAbout = wordFinder([...banned].filter((w) => !naturalWords.has(w)))(aboutAll);
    const leaks = [...banned].filter((w) => inAll50.has(w) || inAbout.has(w));
    check(`a member reading ${uniq.length} company records and every open role sees no locked value or hidden name (${banned.size} values checked)`, uniq.length >= 20 && leaks.length === 0, leaks.length ? `${leaks.length} leaked` : uniq.length);
  }

  /* an admin's connector answers as a member sees the table (the app's "See it as a member") */
  {
    const AD = await join("Ada Admin", { email: process.env.ADMIN_EMAIL || "admin-qa@example.com", headers: { "x-cron-secret": CRON_SECRET } });
    secretWords.add(AD.name);
    const adView = await AD.view();
    const ac = await connect(AD, { name: "Admin Claude" });
    const adRoles = await tool(ac.access_token, "list_open_roles", { since_days: 7, limit: 40 });
    const adText = adRoles.text;
    const adOur = adRoles.out?.roles?.find((r) => r.role === "Fractional CMO" && r.company === "Locked company" && /^on file/.test(r.posted_hours ?? ""));
    check("setup: the admin sees the hidden company's name in the app (admin view)", adView?.me?.admin === true && JSON.stringify(adView.companies.map((c) => c.name)).includes(hiddenName));
    check("an admin's list_open_roles hides the company, its site, rate, hours and posting until unlocked", !!adOur && ![hiddenName, hiddenSite, norateName, norateSite, "$9,876/mo", `qamcp/${RUN}`].some((w) => adText.includes(w)) && adOur.posted_hours === "on file, unlocks with the company (2 credits)", adOur ?? adRoles.text.slice(0, 300));
    const adSearch = await tool(ac.access_token, "search_companies", { hiring_now: true, limit: 25 });
    const adCo = await tool(ac.access_token, "get_company", { company: adOur?.company_id });
    check("and its search and company record keep it locked too", ![hiddenName, hiddenSite].some((w) => adSearch.text.includes(w) || adCo.text.includes(w)) && adCo.out?.name === "Locked company", adCo.out?.name);
    const adUnlock = await tool(ac.access_token, "unlock", { entity: "company", id: adOur?.company_id, field: "identity", confirm: true });
    check("after the admin unlocks it through the connector, it is named with its hours and link", adUnlock.out?.company?.name === hiddenName && adUnlock.out.company.seats?.[0]?.posted_hours === "15" && adUnlock.out.company.seats[0].posting === `https://jobs.example.com/qamcp/${RUN}`, adUnlock.out?.message ?? adUnlock.text.slice(0, 200));
  }

  /* gating: nothing A's tools returned so far carries a value locked or hidden for A */
  {
    const all = seenByA.join("\n");
    const inAll = wordFinder([...forbidden])(all);
    const leaks = [...forbidden].filter((w) => inAll.has(w));
    check(`no locked value or hidden company appears in any tool result (${forbidden.size} values checked)`, leaks.length === 0, leaks.length ? `${leaks.length} leaked` : undefined);
    check("no placeholder company (Private Company, Stealth Startup, Confidential) appears in any tool result", !/"(Private Company|Stealth Startup|Confidential|Start- Up|A Series B SaaS company)"/.test(all));
    check("every website, LinkedIn and posting link in a tool result starts with https:// or http://", [...all.matchAll(/\\?"(website|linkedin|posting)\\?":\\?"([^"\\]*)/g)].every((m) => /^https?:\/\//.test(m[2]) || /^(on file|locked|opens after|No posting|under review)/.test(m[2])));
  }

  /* unlock: without confirm nothing is spent, with confirm 1 is, the same as the app */
  const before = (await A.view()).me.credits;
  const pv = await tool(at, "unlock", { entity: "person", id: gPerson?.id, field: "name" });
  const mid = (await A.view()).me.credits;
  check("unlock without confirm says the cost and spends nothing", pv.out?.confirmed === false && pv.out.would_spend === 1 && /Ask the member/.test(pv.out.next) && mid === before, { out: pv.out, before, mid });
  check("and it shows no value", !pv.text.includes(personName) && !pv.text.includes(personTitle) && pv.out?.would_open === "the person's name and title");
  const pvT = await tool(at, "unlock", { entity: "person", id: gPerson?.id, field: "title" });
  check("asking for the title prices the same one purchase", pvT.out?.would_spend === 1 && pvT.out.would_open === "the person's name and title" && (await A.view()).me.credits === before, pvT.out);
  const pvP = await tool(at, "unlock", { entity: "person", id: gPerson?.id, field: "everything" });
  check("everything about the person costs 2: the name and title, and the email", pvP.out?.would_spend === 2 && (await A.view()).me.credits === before, pvP.out);
  const pvAll = await tool(at, "unlock", { entity: "company", id: coRow?.id, field: "everything" });
  check("unlock everything without confirm prices every purchase and spends nothing", pvAll.out?.would_spend >= 3 && (await A.view()).me.credits === before, pvAll.out);
  const done = await tool(at, "unlock", { entity: "person", id: gPerson?.id, field: "name", confirm: true });
  const av1 = await A.view();
  const appCell = av1.companies.find((c) => c.id === coRow.id)?.engagements[0]?.people?.find((x) => x.id === gPerson.id)?.cells.name;
  check("unlock with confirm spends 1 credit", done.out?.confirmed === true && av1.me.credits === before - 1 && done.out.credits_left === before - 1, { before, after: av1.me.credits, out: done.out?.message });
  check("and returns the value the app now shows", done.out?.person?.name === personName && appCell?.s === "value" && appCell.v === personName, done.out?.person);
  check("the title came with the name", done.out?.person?.title === personTitle && /name and title for 1 credit/.test(done.out?.message ?? ""), done.out?.message);
  const twiceT = await tool(at, "unlock", { entity: "person", id: gPerson.id, field: "title", confirm: true });
  check("the title is then free: unlocking it spends nothing", twiceT.out?.spent === 0 && (await A.view()).me.credits === before - 1, twiceT.out);
  check("the email stays locked", done.out?.person?.email === "locked, 1 credit to unlock");
  const twice = await tool(at, "unlock", { entity: "person", id: gPerson.id, field: "name", confirm: true });
  check("unlocking what is already visible spends nothing", twice.out?.spent === 0 && (await A.view()).me.credits === before - 1, twice.out);
  /*
   * The order of purchases, as another fresh member (its own minute's limit): a person's contact
   * details open after their name and title, who held a seat comes with the role they held, and at
   * a locked company its people open after the company. Nothing here spends.
   */
  {
    const D = await join("Dee Bundles");
    secretWords.add(D.name);
    const dc = await connect(D, { name: "Order" });
    // D unlocked B's company in the app (every company is locked until a member unlocks it or knows it): what follows is about the seat and the person.
    await D.act({ type: "unlock", entity: "company", id: bCoId, field: "identity" });
    const dStart = (await D.view()).me.credits;
    const early = await tool(dc.access_token, "unlock", { entity: "person", id: gPerson?.id, field: "email", confirm: true });
    check("an email before the name is refused: unlock their name and title first", early.isError && /Unlock their name and title first/.test(early.text), early.text);
    const pvHolder = await tool(dc.access_token, "unlock", { entity: "seat", id: gSeat?.id, field: "seat_holder" });
    const pvRole = await tool(dc.access_token, "unlock", { entity: "seat", id: gSeat?.id, field: "role" });
    check(
      // Fellow fractionals are free (PEERS_FREE): with the company open, who held a seat and the role cost nothing, asked either way.
      "who held a seat and the role they held cost nothing once the company is open, asked either way",
      pvHolder.out?.spent === 0 && /Nothing to unlock: you can already see who held this seat and the role they held/.test(pvHolder.out.message ?? "") && pvRole.out?.spent === 0,
      [pvHolder.out, pvRole.out],
    );
    // B, who types the locked company's name in Add, adds a decision maker there.
    const bossName = "Hal Lockedfield";
    const addBoss = await B.act({ type: "add", company: hiddenName, people: [{ name: bossName, title: `Chief Lock Officer ${RUN}`, relationship: "Decision maker" }] });
    const gLocked = await tool(dc.access_token, "get_company", { company: ourRole.company_id });
    const boss = (gLocked.out?.people ?? [])[0];
    check(
      "a person at a locked company reads 'opens after the company', and the warm path says to unlock the company first",
      addBoss.status === 200 &&
        /^opens after the company/.test(boss?.name ?? "") &&
        boss.title === boss.name &&
        !gLocked.text.includes(bossName) &&
        (gLocked.out?.warm_paths ?? []).some((w) => w.person_id === boss.id && w.unlock_first?.field === "identity" && !w.unlock),
      { add: addBoss.status, boss, paths: gLocked.out?.warm_paths },
    );
    const bossEarly = await tool(dc.access_token, "unlock", { entity: "person", id: boss?.id, field: "name", confirm: true });
    check("unlocking that person first is refused: unlock the company first", bossEarly.isError && /Unlock the company first/.test(bossEarly.text), bossEarly.text);
    check("and none of it spent a credit", (await D.view()).me.credits === dStart, dStart);
  }
  // The hidden company: 2 credits open its name and its open role, as Unlock company does in the app.
  const hp = await tool(at, "unlock", { entity: "company", id: ourRole.company_id, field: "identity" });
  check("unlocking a hidden company costs 2 credits, asked first", hp.out?.would_spend === 2 && /company and its open roles/.test(hp.out.would_open), hp.out);
  const hd = await tool(at, "unlock", { entity: "company", id: ourRole.company_id, field: "identity", confirm: true });
  const av2 = await A.view();
  const appCo = av2.companies.find((c) => c.id === ourRole.company_id);
  check("with confirm the company's name comes back, as the app shows it", hd.out?.company?.name === hiddenName && appCo?.name === hiddenName && !appCo.hidden && av2.me.credits === before - 3, { tool: hd.out?.company?.name === hiddenName, app: appCo?.name === hiddenName, credits: av2.me.credits });
  check("and its open role came with it (role and posted rate visible)", hd.out?.company?.seats?.[0]?.role === "Fractional CMO" && hd.out.company.seats[0].posted_rate === "$9,876/mo", hd.out?.company?.seats?.[0]);
  check("and the posted hours and the posting link, with https://", hd.out?.company?.seats?.[0]?.posted_hours === "15" && hd.out.company.seats[0].posting === `https://jobs.example.com/qamcp/${RUN}`, hd.out?.company?.seats?.[0]);
  check("the company's website comes back as a full https:// link", hd.out?.company?.website === `https://${hiddenSite}`, hd.out?.company?.website);
  const lrAfter = await tool(at, "list_open_roles", { since_days: 7, function: "Marketing" });
  const ourAfter = lrAfter.out?.roles?.find((r) => r.company_id === ourRole.company_id);
  check("list_open_roles now names the company and gives the hours, rate and link", ourAfter?.company === hiddenName && ourAfter.posted_hours === "15" && ourAfter.posted_rate === "$9,876/mo" && ourAfter.posting === `https://jobs.example.com/qamcp/${RUN}` && ourAfter.unlock === "nothing locked", ourAfter);
  const badField = await tool(at, "unlock", { entity: "seat", id: gSeat.id, field: "shoe_size" });
  check("an unknown field is an error that lists the fields", badField.isError && /seat_holder/.test(badField.text));

  /* adding */
  const fact = await tool(at, "add_company_fact", { company: coRow.id, field: "hq", value: "Austin, TX" });
  const av3 = await A.view();
  check("add_company_fact adds a missing fact and earns 1 credit", /Added the HQ/.test(fact.out?.message ?? "") && av3.companies.find((c) => c.id === coRow.id)?.cells.hq?.v === "Austin, TX" && av3.me.credits === before - 2, fact.out ?? fact.text);
  const fact2 = await tool(at, "add_company_fact", { company: coRow.id, field: "employees", value: "11-50" });
  check("a pick-list value typed with a plain dash is read", !fact2.isError && av3 && (await A.view()).companies.find((c) => c.id === coRow.id)?.cells.employees?.v === "11–50", fact2.text);
  const factBad = await tool(at, "add_company_fact", { company: coRow.id, field: "industry", value: "Space lasers" });
  check("a value not on the pick list is refused with the list", factBad.isError && /isn't one of/.test(factBad.text));
  const ap = await tool(at, "add_person", { company: coRow.id, seat_id: gSeat.id, name: "Rae Reporter", title: "VP Sales", relationship: "Worked with" });
  check("add_person adds a person tied to the seat", !ap.isError && !!ap.out?.person_id && (await A.view()).companies.find((c) => c.id === coRow.id)?.engagements[0]?.people?.some((x) => x.id === ap.out.person_id), ap.text);
  const fo = await tool(at, "follow_company", { company: coRow.id });
  const accF = await tool(at, "my_account");
  check("follow_company follows, and my_account lists it", /Following/.test(fo.out?.message ?? "") && accF.out?.following?.some((c) => c.id === coRow.id) && (await A.view()).companies.find((c) => c.id === coRow.id)?.following === true, fo.text);

  /* the seat-holder rule */
  const otherSeat = await tool(at, "add_my_seat", { seat_id: gSeat.id, why_hired: "Scale an existing team" });
  check("add_my_seat refuses facts on a seat someone else held", otherSeat.isError && /Only the person who held this seat can add this/.test(otherSeat.text), otherSeat.text);
  const noVis = await tool(at, "add_my_seat", { company: "Qa Own Seat Co", function: "Marketing", rate: "$9k/mo" });
  check("a rate needs the member to say who may see it", noVis.isError && /rate_visibility/.test(noVis.text));
  const noWhat = await tool(at, "add_my_seat", { company: "Qa Own Seat Co" });
  check("a seat needs a function or a role", noWhat.isError && /function or its role/.test(noWhat.text));
  // The "Things to ask" example, pasted as is: an example name is not a company, and nothing is added or earned.
  const acme = await tool(at, "add_my_seat", { company: "Acme", function: "Marketing", role: "Fractional CMO", start: "2024-03", end: "2024-11" });
  check("add_my_seat refuses an example name like Acme", acme.isError && /example name, not a real company/.test(acme.text) && !(await A.view()).companies.some((c) => c.name === "Acme"), acme.text);
  const own = await tool(at, "add_my_seat", { company: `Qa Own Seat ${RUN}`, function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Ended", start: "2023-02", end: "2023-11", pricing: "Monthly retainer", rate: "$9k/mo", rate_visibility: "benchmarks_only" });
  const av4 = await A.view();
  const ownSeat = av4.companies.flatMap((c) => c.engagements).find((e) => e.id === own.out?.seat_id);
  check("add_my_seat adds the member's own seat, linked to them", !own.isError && ownSeat?.yours === true && ownSeat.cells.operator?.v === A.name && ownSeat.cells.rate?.s === "empty", own.text);
  check("a benchmarks-only rate is shared privately, not put on the seat", av4.me.benchRates.some((r) => r.engagementId === own.out?.seat_id && r.amount === 9000), av4.me.benchRates);
  const ownMore = await tool(at, "add_my_seat", { seat_id: own.out?.seat_id, why_hired: "Build the function from scratch", hours: 20 });
  check("add_my_seat adds facts to the member's own seat", !ownMore.isError && (await A.view()).companies.flatMap((c) => c.engagements).find((e) => e.id === own.out?.seat_id)?.cells.reason?.v === "Build the function from scratch", ownMore.text);
  const accSeats = await tool(at, "my_account");
  check("my_account lists the member's seats with what is missing", accSeats.out?.seats_on_file?.some((s) => s.seat_id === own.out?.seat_id && Array.isArray(s.missing)), accSeats.out?.seats_on_file);

  /* alerts */
  const sv = await tool(at, "alerts", { action: "save", function: "Marketing", industry: ["saas", "fintech"], revenue: ["$5M-$20M"] });
  check("alerts save keeps a saved search with a readable name", !sv.isError && /^Fractional Marketing roles at SaaS or Fintech companies, \$5M–\$20M$/.test(sv.out?.saved_search?.name ?? "") && /Email isn't set up/.test(sv.out.delivery), sv.out ?? sv.text);
  const sv2 = await tool(at, "alerts", { action: "save", name: "CMO roles", function: "Marketing" });
  check("a saved search counts the open roles that match now", sv2.out?.saved_search?.open_now >= 1 && sv2.out.open_now.length >= 1, sv2.out?.saved_search);
  // One list with the app's saved views: the same search twice is one search (lib/hunt.ts sameView).
  const sv2b = await tool(at, "alerts", { action: "save", name: "CMO roles again", function: "marketing" });
  check("the same search again isn't saved twice: the answer names the one saved", !sv2b.isError && sv2b.out?.message === 'You saved this search already, as "CMO roles".' && sv2b.out?.saved_search?.id === sv2.out?.saved_search?.id, sv2b.out ?? sv2b.text);
  const ls = await tool(at, "alerts", { action: "list" });
  check("alerts list shows both", ls.out?.saved_searches?.length === 2 && ls.out.saved_searches.every((x) => typeof x.new_this_week === "number"));
  const badAlert = await tool(at, "alerts", { action: "save", revenue: ["a lot"] });
  check("a revenue band not on the list is refused", badAlert.isError && /isn.t one of/.test(badAlert.text));
  const empty = await tool(at, "alerts", { action: "save" });
  check("a saved search needs something to look for", empty.isError);
  const del = await tool(at, "alerts", { action: "delete", id: sv.out?.saved_search?.id });
  check("alerts delete removes one", /Deleted/.test(del.out?.message ?? "") && (await tool(at, "alerts", { action: "list" })).out?.saved_searches?.length === 1);
  // One list: a view saved in the app is one of the connector's saved searches, and the other way round.
  const appSave = await A.act({ type: "savedView", op: "save", name: "Marketing at Software companies", place: "v=hiring&t=seats&f=fn:Marketing", criteria: { function: "Marketing", industry: ["Software"] }, email: false });
  const both = await tool(at, "alerts", { action: "list" });
  const fromApp = both.out?.saved_searches?.find((x) => x.name === "Marketing at Software companies");
  check(
    "a view saved in the app shows in the connector's saved searches, with its criteria and weekly email",
    appSave.status === 200 && both.out?.saved_searches?.length === 2 && fromApp?.saved_in === "the Merlin app" && fromApp.weekly_email === false && fromApp.criteria?.function === "Marketing" && !("place" in (fromApp.criteria ?? {})),
    both.out ?? both.text,
  );
  const appViews = (await A.view()).me.savedViews ?? [];
  check("a search saved in Claude shows in the app's saved views", appViews.length === 2 && appViews.some((v) => v.name === "CMO roles" && v.place === null && v.email === true), appViews);
  const ba = await connect(B, { name: "B's Claude" });
  const bList = await tool(ba.access_token, "alerts", { action: "list" });
  check("saved searches are each member's own", bList.out?.saved_searches?.length === 0);

  /* Evidence Bank (lib/mcp/evidence.ts): Close only, asks first, the client hidden, each member's own */
  const evList0 = await tool(at, "list_evidence");
  if (evList0.out?.can_use === false) {
    check("list_evidence off the Close plan: the plan's words and the upgrade link, no case", /Evidence Bank is on Close/.test(evList0.out.plan ?? "") && /p=billing/.test(evList0.out.plan) && !("cases" in evList0.out), evList0.out);
    const evSave0 = await tool(at, "save_evidence_case", { problem: "x", confirm: true });
    check("save_evidence_case off the Close plan saves nothing", evSave0.out?.can_use === false, evSave0.out);
  } else {
    const EV = { title: "One sales process", problem: "Four reps at Northwind Clinics sold four different ways.", what_i_did: "Set one sales process and a weekly forecast.", numbers: "Win rate went from 22% to 31%.", client_name: "Northwind Clinics", industry: "Health Care", revenue: "$20M–$50M", ready: true };
    const evPrev = await tool(at, "save_evidence_case", EV);
    check("save_evidence_case without confirm saves nothing and shows how it reads", evPrev.out?.confirmed === false && /Nothing was saved/.test(evPrev.out.message) && (await tool(at, "list_evidence")).out?.cases?.length === evList0.out.cases.length, evPrev.out);
    check("  the preview keeps the client hidden: its label, never its name", evPrev.out?.would_save?.client === "A health care company, $20M to $50M" && !evPrev.text.includes("Northwind"), evPrev.text.slice(0, 300));
    const evSaved = await tool(at, "save_evidence_case", { ...EV, confirm: true });
    check("with confirm it saves the case, the numbers as typed", evSaved.out?.confirmed === true && evSaved.out.case?.numbers?.[0]?.before === "22%" && evSaved.out.case.numbers[0].after === "31%", evSaved.out);
    const evList = await tool(at, "list_evidence");
    check("list_evidence never names a hidden client, and gives no company or seat id", evList.out?.cases?.length === evList0.out.cases.length + 1 && !evList.text.includes("Northwind") && !/"company_id"|"seat_id"|"companyId"|"seatId"/.test(evList.text), evList.text.slice(0, 300));
    const someCo = (await tool(at, "search_companies", { limit: 1 })).out?.companies?.[0]?.id;
    // eb2 (Evidence Bank, 2026-11-24): a case study an agent saved waits for the member's check ("From Claude · review") and stays
    // out of proposals and matching until then; the member's own save on their page is that check.
    const evWait = someCo ? await tool(at, "match_evidence", { company_id: someCo }) : null;
    check("match_evidence leaves out a case study still waiting for the member's review", !!evWait && evWait.out?.ranked?.length === 0 && evWait.out.drafts_skipped >= 1, evWait?.out);
    const evId = evSaved.out?.case?.case_id;
    const checked = await call("POST", "/api/evidence", { cookie: A.token, ipAddr: A.ip, headers: { origin: BASE }, body: { op: "save", id: evId, status: "ready" } });
    check("the member checks it on their page (a save there takes the review mark off)", checked.status === 200 && !(await tool(at, "list_evidence")).out?.cases?.find((c) => c.case_id === evId)?.waiting_for_review, checked.json);
    const evMatch = someCo ? await tool(at, "match_evidence", { company_id: someCo }) : null;
    check("match_evidence: Same, Close or Different in words, no percentage", !!evMatch && evMatch.out?.ranked?.length >= 1 && evMatch.out.ranked.every((r) => ["Same", "Close", "Different"].includes(r.match) && Array.isArray(r.same)) && !/%"|percent/i.test(JSON.stringify(evMatch.out.ranked)), evMatch?.out);
    const bEv = await tool(ba.access_token, "list_evidence");
    check("another member's assistant never sees the case", bEv.out?.can_use === false || (Array.isArray(bEv.out?.cases) && !bEv.text.includes("One sales process")), bEv.text.slice(0, 200));
  }

  /* Connected apps */
  const apps = await call("GET", "/api/oauth/apps", { cookie: A.token });
  check("Connected apps lists the member's apps", apps.status === 200 && apps.json?.apps?.some((x) => x.name === "Claude") && apps.json.apps.every((x) => x.id && x.connectedAt), apps.json?.apps?.length);
  check("Connected apps needs the member signed in", (await call("GET", "/api/oauth/apps")).status === 401);
  const bApps = await call("GET", "/api/oauth/apps", { cookie: B.token });
  const bGrant = bApps.json?.apps?.[0]?.id;
  check("a member can't revoke another member's app", (await call("POST", "/api/oauth/apps", { cookie: A.token, headers: { origin: BASE }, body: { revoke: bGrant } })).status === 404);
  const revB = await call("POST", "/api/oauth/apps", { cookie: B.token, headers: { origin: BASE }, body: { revoke: bGrant } });
  check("Revoke disconnects the app at once", revB.status === 200 && (await rpc(ba.access_token, "ping")).status === 401 && !revB.json.apps.some((x) => x.id === bGrant));

  /* Agent access (lib/mcp/log.ts, /api/agent): switches, the daily spend limit and the log, for a member of its own */
  {
    const G = await join("Gil Agent");
    const ga = await connect(G, { name: "Claude" });
    const agentGet = () => call("GET", "/api/agent", { cookie: G.token, ipAddr: G.ip });
    const agentSet = (body, headers = { origin: BASE }) => call("POST", "/api/agent", { cookie: G.token, ipAddr: G.ip, headers, body });
    const v0 = await agentGet();
    check("Agent access: the page's view needs the member signed in", (await call("GET", "/api/agent")).status === 401 && v0.status === 200);
    check("  every tool in four groups with its switch on, unlock by kind, no limit, nothing in the log", v0.json?.view?.groups?.length === 4 && v0.json.view.tools.every((t) => t.on) && v0.json.view.tools.filter((t) => t.group === "spend").length === 4 && v0.json.view.limit === null && v0.json.view.log.length === 0, v0.json?.view && { tools: v0.json.view.tools.length, log: v0.json.view.log.length });
    check("  and the agent connected, with today's use", v0.json?.view?.apps?.some((x) => x.name === "Claude" && x.requestsToday === 0));
    const WORD = `qaword${RUN}`;
    const read = await tool(ga.access_token, "search_companies", { query: WORD, limit: 2 });
    check("  a read works", !read.isError);
    check("  a switch only from Merlin's own pages, signed in, and only a real tool", (await agentSet({ key: "search_companies", on: false }, { origin: "https://evil.example.com" })).status === 403 && (await call("POST", "/api/agent", { headers: { origin: BASE }, body: { key: "search_companies", on: false } })).status === 401 && (await agentSet({ key: "drop_tables", on: false })).status === 400 && (await agentSet({ limit: 7 })).status === 400);
    const sw = await agentSet({ key: "search_companies", on: false });
    check("  switched off on the page", sw.status === 200 && sw.json?.view?.tools?.find((t) => t.key === "search_companies")?.on === false);
    const refused = await tool(ga.access_token, "search_companies", { query: WORD, limit: 2 });
    check("a switched-off tool refuses in plain words and does nothing", refused.isError && /^"Search companies" is switched off for agents\. The member switched this off on Merlin's Agent access page, so nothing was done\./.test(refused.out?.error ?? "") && !refused.out?.companies, refused.text);
    const still = await rpc(ga.access_token, "tools/list");
    check("  it stays in the tool list, and other tools still work", (still.json?.result?.tools ?? []).some((t) => t.name === "search_companies") && !(await tool(ga.access_token, "my_account")).isError);
    await agentSet({ key: "search_companies", on: true });
    check("  switched back on, it works", !(await tool(ga.access_token, "search_companies", { limit: 2 })).isError);
    // The limit: 5 credits a day; companies open for 2 credits each here (no free company of the day).
    const lim = await agentSet({ limit: 5 });
    check("the daily spend limit is set on the page", lim.status === 200 && lim.json?.view?.limit === 5);
    const locked = ((await tool(ga.access_token, "search_companies", { limit: 10 })).out?.companies ?? []).filter((c) => c.locked !== false).map((c) => c.id);
    const credits0 = (await tool(ga.access_token, "my_account")).out?.credits;
    const u1 = await tool(ga.access_token, "unlock", { entity: "company", id: locked[0], field: "identity", confirm: true });
    const u2 = await tool(ga.access_token, "unlock", { entity: "company", id: locked[1], field: "identity", confirm: true });
    check("  under it, the member's yes spends as before", u1.out?.confirmed === true && u2.out?.confirmed === true && (await tool(ga.access_token, "my_account")).out?.credits === credits0 - 4, [u1.text.slice(0, 120), u2.text.slice(0, 120)]);
    const q3 = await tool(ga.access_token, "unlock", { entity: "company", id: locked[2], field: "identity" });
    check("  a quote past it says so first", q3.out?.confirmed === false && /over the member's daily limit for agents/.test(q3.out?.message ?? ""), q3.out?.message);
    const u3 = await tool(ga.access_token, "unlock", { entity: "company", id: locked[2], field: "identity", confirm: true });
    check("the limit holds: past it a confirm spends nothing, in plain words", u3.isError && /may spend 5 a day \(4 spent today\)\. Nothing was spent\./.test(u3.text) && (await tool(ga.access_token, "my_account")).out?.credits === credits0 - 4, u3.text);
    const gb = await connect(G, { name: "Cursor" });
    const u4 = await tool(gb.access_token, "unlock", { entity: "company", id: locked[3], field: "identity", confirm: true });
    check("  across agents too: another app of the member's is stopped", u4.isError && /may spend 5 a day/.test(u4.text), u4.text);
    const v1 = (await agentGet()).json?.view;
    const logText = JSON.stringify(v1?.log ?? []);
    check("the log keeps no arguments: no search, no company, no field, no answer", !!v1 && v1.log.length >= 10 && !logText.includes(WORD) && !locked.some((id) => logText.includes(id)) && !/identity|query|confirm|"entity"|"id"/.test(logText), logText.slice(0, 300));
    check("  only when, the tool, the outcome, credits and the app", v1.log.every((r) => Object.keys(r).every((k) => ["at", "t", "o", "c", "q", "a"].includes(k))));
    check("  the spends, the stop and the switch-off are in it", v1.log.filter((r) => r.t === "unlock:company" && r.o === "ok" && r.c === 2).length === 2 && v1.log.some((r) => r.o === "limit" && r.q === 2) && v1.log.some((r) => r.o === "off" && r.t === "search_companies") && v1.log.some((r) => r.a === "Cursor"));
    check("  today's spend and each agent's use", v1.spentToday === 4 && v1.apps.find((x) => x.name === "Claude")?.creditsToday === 4, { spent: v1.spentToday, apps: v1.apps });
    check("  and nobody else's view has it", JSON.stringify((await call("GET", "/api/agent", { cookie: A.token })).json?.view?.log ?? []).indexOf('"q":2') === -1);
  }

  /* limits: 60 tool calls a minute */
  const lc = await connect(L, { name: "Limits" });
  noPace.add(lc.access_token);
  let firstLimited = 0;
  for (let i = 1; i <= 61; i++) {
    const r = await tool(lc.access_token, "my_account");
    if (r.isError && /60 requests in a minute/.test(r.text)) {
      firstLimited = i;
      break;
    }
  }
  check("the 61st tool call in a minute is refused, in words", firstLimited === 61, firstLimited);
  check("pings don't count toward it", (await rpc(lc.access_token, "ping")).status === 200);
  check("other members aren't held up by it", !(await tool(at, "my_account")).isError);

  /* a real MCP client: the SDK's, doing discovery, registration, PKCE and the handshake itself */
  try {
    let redirectedTo = null;
    let saved = {};
    const provider = {
      get redirectUrl() {
        return "http://localhost:33418/callback";
      },
      get clientMetadata() {
        return { client_name: "SDK client", redirect_uris: ["http://localhost:33418/callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
      },
      clientInformation: () => saved.client,
      saveClientInformation: (c) => void (saved.client = c),
      tokens: () => saved.tokens,
      saveTokens: (t) => {
        saved.tokens = t;
        secretWords.add(t.access_token);
        secretWords.add(t.refresh_token);
      },
      redirectToAuthorization: (url) => void (redirectedTo = url),
      saveCodeVerifier: (v) => void (saved.verifier = v),
      codeVerifier: () => saved.verifier,
    };
    const first = new StreamableHTTPClientTransport(new URL(MCP), { authProvider: provider });
    const c1 = new McpClient({ name: "qa-sdk", version: "1.0.0" });
    let unauthorized = false;
    try {
      await c1.connect(first);
    } catch (e) {
      unauthorized = e instanceof UnauthorizedError || /Unauthorized/i.test(String(e));
    }
    check("SDK client: the first connect asks for sign-in and registers itself", unauthorized && !!redirectedTo && !!saved.client?.client_id, String(redirectedTo ?? ""));
    const u = new URL(redirectedTo);
    check("SDK client: its authorization URL uses PKCE S256 and names the resource", u.searchParams.get("code_challenge_method") === "S256" && u.searchParams.get("resource")?.replace(/\/$/, "") === MCP, u.search);
    // The member says yes in the browser.
    const yes = await consent(A, u.pathname + u.search);
    const sdkCode = yes.back?.searchParams.get("code");
    await first.finishAuth(sdkCode);
    const c2c = new McpClient({ name: "qa-sdk", version: "1.0.0" });
    await c2c.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: provider }));
    check("SDK client: after sign-in it completes the handshake", !!c2c.getServerVersion()?.name && c2c.getServerVersion().name === "merlin");
    const tl = await c2c.listTools();
    // 25 with RN_GOOGLE off (as this test runs): the base 15, my_pipeline and update_pipeline (Your pipeline), the five proposal tools, and the three peer tools (list_peers, pass_lead, leads_passed_to_me), and the three Evidence Bank tools (list_evidence, match_evidence, save_evidence_case). RN_GOOGLE=1 adds save_my_network and my_network (27).
    check("SDK client: it lists the tools (ways_in with ways in on, RN_PATHS)", tl.tools.length === 32, tl.tools.length);
    const res = await c2c.callTool({ name: "search_companies", arguments: { hiring_now: true, limit: 3 } });
    const parsed = JSON.parse(res.content?.[0]?.text ?? "{}");
    check("SDK client: it calls a tool and reads the answer", Array.isArray(parsed.companies) && parsed.companies.length > 0, res);
    await c2c.close();
  } catch (e) {
    fail("SDK client", String(e?.stack ?? e).slice(0, 300));
  }

  /* one more pass for leaks, over everything A's tools returned */
  {
    const all = seenByA.join("\n");
    // What A's app shows now, after the unlocks: a title many seats share ("Fractional CMO") is A's to see once A paid for one of them.
    const aJsonNow = JSON.stringify(await A.view());
    const inAll = wordFinder([...forbidden])(all);
    const leaks = [...forbidden].filter((w) => w !== personName && w !== hiddenName && w !== hiddenSite && w !== "$9,876/mo" && w !== `jobs.example.com/qamcp/${RUN}` && inAll.has(w) && !aJsonNow.includes(w) && !sentByA.some((x) => x.includes(w)));
    check("still no leak after A's unlocks (only what A paid for shows)", leaks.length === 0, leaks.length ? `${leaks.length} leaked` : undefined);
  }
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${redact(String(e?.stack ?? e)).slice(0, 600)}`);
  })
  .finally(() => {
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
