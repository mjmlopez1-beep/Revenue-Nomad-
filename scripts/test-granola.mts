/**
 * Checks of Granola (lib/granola, app/api/integrations/granola, lib/mcp/granola.ts, the picker's
 * words) and the top row of Integrations (app/post/integrationsModel.ts: Slack, Claude, Google,
 * Granola).
 *
 *   npx tsx scripts/test-granola.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end, and a fake Granola API on 127.0.0.1 (RN_GRANOLA_API_TEST, honoured only with RN_SCAN_TEST=1)
 * with made-up notes for "Cedar and Pine Software" (attendees at cedarpine.example). Billing live
 * with made-up Stripe settings, so Close is checked (the trial counts).
 *
 *  1. RN_GRANOLA off: nothing, even with a key on file.
 *  2. Connect: the key's shape, a bad key, a plan without the API, a good key (sealed, last four only).
 *  3. Calls: by the company's domain (subdomains too), by email, any recent call, newest first, the
 *     30-day window, today's call found before Granola's search has it, a locked company refused,
 *     titles only when asked.
 *  4. A picked call's transcript: the lines and who said them, its length, a transcript too large to
 *     come with the note (in pages), no transcript access, Close (a Free member refused).
 *  5. 429: waited and retried (Retry-After), then given up on in plain words.
 *  6. Nothing stored after drafting, the key never in an answer or a log, no title in a log.
 *  7. A key Granola stops accepting, Disconnect, account closure, the 30-day delete, the export.
 *  8. The connector's list_granola_calls; the routes over a NextRequest.
 *  9. The picker's words. The top row's statuses: Claude (none, active, revoked or expired grants),
 *     Google (Calendar, Contacts, Gmail, reconnect, RN_GOOGLE off), Granola, Slack.
 * 10. Connect Granola, against a fake OAuth and MCP server on 127.0.0.1 (RN_GRANOLA_MCP_URL, http
 *     only with RN_SCAN_TEST=1): discovery (RFC 9728, RFC 8414 with a path) cached, Merlin
 *     registered once (RFC 7591), the consent URL (PKCE S256, state, resource, the redirect
 *     address), a wrong state or another member refused, the code swapped, the tokens sealed; the
 *     calls by company, email and any recent call over MCP (search_meetings, get_meetings by event
 *     stream), the picked transcript paged through next_offset and not stored; a 401 refreshes
 *     once, an expiring token is refreshed first, a refused refresh asks to connect again;
 *     Disconnect revokes and deletes; a rejected client registered again; discovery down hides
 *     the button and the key path still works; the routes; closing an account purges and revokes.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { register } from "node:module";

// The picker's words import nothing with CSS, but the model files may: CSS is nothing here.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-granola-"));

/* ---------- the made-up seed: Jordan Avery (trial, so Close), Bo Other (Free), Cedar and Pine Software ---------- */
const seed = {
  builtAt: iso(NOW - 30 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@averyadvisory.example", title: "Fractional CRO", token: "tok-jordan-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo.other@example.org", title: "Fractional CMO", token: "tok-bo-0001" },
    { id: "mem_sam", name: "Sam Tester", email: "sam.tester@example.org", title: "Fractional COO", token: "tok-sam-0001" },
  ],
  companies: [
    { id: "c_cedar", fields: { name: "Cedar and Pine Software", website: "https://www.cedarpine.example", industry: "SaaS", employees: "51–200" } },
    { id: "c_locked", fields: { name: "Hidden Works", website: "hiddenworks.example", industry: "SaaS", employees: "11–50" } },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `c_fill${i}`, fields: { name: `Filler Works ${i}`, website: `fill${i}.example`, industry: "SaaS", employees: "11–50" } })),
  ],
  engagements: [],
  contacts: [],
};
const trial = { trialStartedAt: iso(NOW - 3 * DAY), trialEndsAt: iso(NOW + 11 * DAY) };
const grant = (id: string, memberId: string, name: string, used: number, refreshExp: number) => ({
  id,
  memberId,
  clientId: `cl_${id}`,
  clientName: name,
  resource: null,
  scope: "merlin",
  createdAt: iso(NOW - 20 * DAY),
  lastUsedAt: iso(used),
  access: [],
  refresh: { hash: `h_${id}`, exp: iso(refreshExp) },
});
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Jordan opened Cedar and Pine (its identity): the company is theirs to see. Hidden Works stays locked.
    unlocks: { "c_cedar.identity": ["mem_jordan"] },
    seen: { mem_jordan: iso(NOW - DAY), mem_bo: iso(NOW - DAY), mem_sam: iso(NOW - DAY) },
    profiles: {},
    billing: { members: { mem_jordan: trial, mem_bo: { trialStartedAt: iso(NOW - 40 * DAY), trialEndsAt: iso(NOW - 26 * DAY) }, mem_sam: trial }, events: [], payments: [], ended: [] },
    connector: {
      clients: [],
      grants: [grant("g_live", "mem_jordan", "Claude", NOW - 2 * 3_600_000, NOW + 20 * DAY), grant("g_old", "mem_bo", "ChatGPT", NOW - 40 * DAY, NOW - DAY)],
      alerts: {},
    },
  }),
);

/* ---------- the fake Granola ---------- */
const SECRET_TITLE = "Cedar and Pine pricing SECRETTITLE";
const SECRET_LINE = "our win rate fell to 14 percent SECRETWORDS";
const GOOD = "grn_goodkey_jordan_abcd";
const BO_KEY = "grn_goodkey_bo_wxyz";
const BAD = "grn_badkey_nothing_1234";
const NOPLAN = "grn_noplan_workspace_5678";
const NOTRANS = "grn_notranscripts_9999";
const SLOW = "grn_ratelimit_first_2222";
const ALWAYS429 = "grn_ratelimit_always_3333";
const dead = new Set<string>();
const ownerJ = { name: "Jordan Avery", email: "jordan@averyadvisory.example" };
const today10 = (() => {
  const d = new Date(NOW);
  d.setHours(10, 0, 0, 0);
  return d.getTime() > NOW ? d.getTime() - DAY : d.getTime();
})();
type FakeNote = { id: string; title: string; at: number; minutes: number; attendees: { name: string; email: string }[]; searchable: boolean; big?: boolean; lines: [string, "me" | "them", string][] };
const notes: FakeNote[] = [
  {
    id: "not_cedar000000001",
    title: SECRET_TITLE,
    at: today10,
    minutes: 45,
    attendees: [ownerJ, { name: "Dana Whitfield", email: "dana@cedarpine.example" }],
    // Today's call: Granola's search doesn't have it yet.
    searchable: false,
    lines: [
      ["Jordan Avery", "me", "Thanks for making the time, Dana."],
      ["", "them", `Happy to. The short version is ${SECRET_LINE}, and the team is new.`],
      ["", "them", "We want a fixed-fee assessment first, then maybe two days a week."],
      ["", "me", "That works. I'd scope a 45-day assessment at a fixed fee."],
    ],
  },
  { id: "not_cedar000000002", title: "Lee intro", at: NOW - 5 * DAY, minutes: 30, attendees: [ownerJ, { name: "Lee Park", email: "lee@eu.cedarpine.example" }], searchable: true, lines: [["", "them", "Hello from the EU team. We talked about the pipeline review."]] },
  { id: "not_other000000003", title: "Other client", at: NOW - 2 * DAY, minutes: 25, attendees: [ownerJ, { name: "Sam Else", email: "sam@elsewhere.example" }], searchable: true, lines: [["", "them", "Nothing to do with Cedar and Pine."]] },
  { id: "not_oldce000000004", title: "Old call", at: NOW - 40 * DAY, minutes: 60, attendees: [ownerJ, { name: "Dana Whitfield", email: "dana@cedarpine.example" }], searchable: true, lines: [["", "them", "This was too long ago."]] },
  {
    id: "not_bigtr000000005",
    title: "Long workshop",
    at: NOW - 3 * DAY,
    minutes: 120,
    big: true,
    attendees: [ownerJ, { name: "Dana Whitfield", email: "dana@cedarpine.example" }, { name: "Ola Fin", email: "ola@cedarpine.example" }],
    searchable: true,
    lines: Array.from({ length: 230 }, (_, i) => [i % 2 ? "Dana Whitfield" : "Jordan Avery", i % 2 ? "them" : "me", `Workshop line ${i} about the ramp plan and the hiring of two reps.`] as [string, "me" | "them", string]),
  },
];
const noteJson = (n: FakeNote, withT: boolean, noT: boolean) => ({
  id: n.id,
  object: "note",
  title: n.title,
  owner: ownerJ,
  created_at: iso(n.at),
  updated_at: iso(n.at + 3_600_000),
  deleted_at: null,
  web_url: `https://notes.granola.example/d/${n.id}`,
  calendar_event: { event_title: n.title, invitees: n.attendees.map((a) => ({ email: a.email })), organiser: ownerJ.email, calendar_event_id: `ev_${n.id}`, scheduled_start_time: iso(n.at), scheduled_end_time: iso(n.at + n.minutes * 60_000) },
  attachments: [],
  attendees: n.attendees,
  folder_membership: [],
  summary_text: `Summary SECRETSUMMARY of ${n.title}`,
  summary_markdown: null,
  private_notes_text: "Private SECRETPRIVATE",
  private_notes_markdown: null,
  transcript: withT && !noT ? items(n) : null,
});
// The transcript's own times: 42 minutes for today's call (the calendar says 45).
const items = (n: FakeNote) =>
  n.lines.map(([name, who, text], i) => ({
    speaker: { source: who === "me" ? "microphone" : "speaker", attribution: who, ...(name ? { name } : {}) },
    text,
    start_time: iso(n.at + (i * 42 * 60_000) / Math.max(1, n.lines.length - 1) - (i === n.lines.length - 1 ? 1000 : 0)),
    end_time: iso(n.at + (i === n.lines.length - 1 ? 42 * 60_000 : (i * 42 * 60_000) / Math.max(1, n.lines.length - 1) + 1000)),
  }));
const requests: { key: string; method: string; path: string; body: string }[] = [];
const slowSeen = new Map<string, number>();
const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const err = (res: ServerResponse, status: number, code: string, headers: Record<string, string> = {}) => send(res, status, { code, message: code, requestId: "req_test", timestamp: iso(NOW) }, headers);
const granola = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  requests.push({ key, method: req.method ?? "GET", path: u.pathname + u.search, body: raw });
  if (!key) return err(res, 401, "MISSING_API_KEY");
  if (![GOOD, BO_KEY, NOPLAN, NOTRANS, SLOW, ALWAYS429].includes(key) || dead.has(key)) return err(res, 401, "INVALID_API_KEY");
  if (key === NOPLAN) return err(res, 403, "SUBSCRIPTION_INACTIVE");
  if (key === ALWAYS429) return err(res, 429, "RATE_LIMITED", { "retry-after": "0" });
  if (key === SLOW) {
    const n = (slowSeen.get(key) ?? 0) + 1;
    slowSeen.set(key, n);
    if (n <= 2) return err(res, 429, "RATE_LIMITED", { "retry-after": "0" });
  }
  const p = u.pathname;
  const mine = key === BO_KEY ? [] : notes;
  const noT = key === NOTRANS;
  if (p === "/v1/notes" && req.method === "GET") {
    const after = Date.parse(u.searchParams.get("created_after") ?? "") || 0;
    const size = Number(u.searchParams.get("page_size") ?? 10);
    const list = mine.filter((n) => n.at > after).sort((a, b) => b.at - a.at);
    return send(res, 200, { notes: list.slice(0, size).map((n) => ({ id: n.id, object: "note", title: n.title, owner: ownerJ, created_at: iso(n.at), updated_at: iso(n.at), deleted_at: null })), hasMore: list.length > size, cursor: list.length > size ? "c_more" : null });
  }
  if (p === "/v1/notes/search" && req.method === "POST") {
    const b = JSON.parse(raw || "{}") as { participant?: string; from_date?: string };
    const part = String(b.participant ?? "").toLowerCase();
    const from = Date.parse(b.from_date ?? "") || 0;
    const hit = mine.filter((n) => n.searchable && n.at >= from && n.attendees.some((a) => a.email === part || a.email.endsWith(`@${part}`) || a.email.endsWith(`.${part}`)));
    return send(res, 200, { notes: hit.map((n) => ({ id: n.id, object: "note", title: n.title, owner: ownerJ, created_at: iso(n.at), updated_at: iso(n.at), deleted_at: null, meeting_at: iso(n.at) })), hasMore: false, cursor: null, completion_status: "exhausted" });
  }
  const m = p.match(/^\/v1\/notes\/(not_[A-Za-z0-9]{14})(\/transcript)?$/);
  if (m) {
    const n = mine.find((x) => x.id === m[1]);
    if (!n) return err(res, 404, "NOTE_NOT_FOUND");
    if (m[2]) {
      if (noT) return err(res, 403, "FORBIDDEN");
      const all = items(n);
      const size = Number(u.searchParams.get("page_size") ?? 50);
      const at = Number(u.searchParams.get("cursor") ?? 0);
      const page = all.slice(at, at + size);
      return send(res, 200, { transcript: page, hasMore: at + size < all.length, cursor: at + size < all.length ? String(at + size) : null });
    }
    const withT = u.searchParams.get("include") === "transcript";
    if (withT && n.big && !noT) return err(res, 413, "TRANSCRIPT_TOO_LARGE");
    return send(res, 200, noteJson(n, withT, noT));
  }
  return err(res, 404, "NOT_FOUND");
});
await new Promise<void>((r) => granola.listen(0, "127.0.0.1", () => r()));
const BASE = `http://127.0.0.1:${(granola.address() as AddressInfo).port}`;


/* ---------- the fake Granola sign-in and MCP server (made-up meetings: the notes above, and one with a UUID id) ---------- */
const UUID_MEET = "5f0c2d4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const meetings: FakeNote[] = [
  ...notes,
  { id: UUID_MEET, title: "Halcyon check-in", at: NOW - 6 * DAY, minutes: 20, attendees: [ownerJ, { name: "Kim Lowe", email: "kim@halcyonfreight.example" }], searchable: true, lines: [] },
];
const oa = {
  down: false,
  json: false,
  registered: [] as Record<string, unknown>[],
  clients: new Map<string, string>(),
  rejected: new Set<string>(),
  codes: new Map<string, { challenge: string; client: string; redirect: string; resource: string; used: boolean }>(),
  access: new Map<string, string>(),
  refresh: new Map<string, string>(),
  expired: new Set<string>(),
  deadRefresh: false,
  n: 0,
  pkceOk: [] as boolean[],
  token: [] as Record<string, string>[],
  revoked: [] as string[],
  wellKnown: [] as string[],
  mcp: [] as { method: string; tool?: string; args?: Record<string, unknown>; session: string }[],
  issued: [] as string[],
};
const hhmmss = (ms: number) => new Date(ms).toISOString().slice(11, 19);
const mcpTranscript = (n: FakeNote) =>
  n.lines.map(([name, who, text], i) => `[${hhmmss(n.at + (i === n.lines.length - 1 ? 42 * 60_000 : (i * 42 * 60_000) / Math.max(1, n.lines.length - 1)))}] ${name || (who === "me" ? "Microphone" : "System audio")}: ${text}`).join("\n");
const xmlEsc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fakeOauth = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  const p = u.pathname;
  const json = (status: number, body: unknown, h: Record<string, string> = {}) => (res.writeHead(status, { "content-type": "application/json", ...h }), res.end(JSON.stringify(body)));
  if (p.startsWith("/.well-known/")) {
    oa.wellKnown.push(p);
    if (oa.down) return json(404, { error: "not_found" });
    if (p === "/.well-known/oauth-protected-resource/mcp") return json(200, { resource: `${OBASE}/mcp`, authorization_servers: [`${OBASE}/auth`], scopes_supported: ["meetings:read"], bearer_methods_supported: ["header"] });
    if (p === "/.well-known/oauth-authorization-server/auth")
      return json(200, {
        issuer: `${OBASE}/auth`,
        authorization_endpoint: `${OBASE}/auth/authorize`,
        token_endpoint: `${OBASE}/auth/token`,
        registration_endpoint: `${OBASE}/auth/register`,
        revocation_endpoint: `${OBASE}/auth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        scopes_supported: ["meetings:read", "offline_access"],
      });
    return json(404, { error: "not_found" });
  }
  if (p === "/auth/register" && req.method === "POST") {
    const b = JSON.parse(raw || "{}") as Record<string, unknown>;
    oa.registered.push(b);
    const id = `cl_${oa.registered.length}`;
    oa.clients.set(id, `sec_reg_${oa.registered.length}_CLIENTSECRET`);
    return json(201, { client_id: id, client_secret: oa.clients.get(id), client_id_issued_at: Math.floor(NOW / 1000), client_secret_expires_at: 0, token_endpoint_auth_method: "client_secret_post", redirect_uris: b.redirect_uris, grant_types: b.grant_types });
  }
  if (p === "/auth/authorize") {
    // The consent page, simulated: the member says yes, and Granola sends them back with a code and the state.
    const q = u.searchParams;
    if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || !oa.clients.has(q.get("client_id") ?? "")) return json(400, { error: "invalid_request" });
    const code = `code_${++oa.n}_AUTHCODE`;
    oa.codes.set(code, { challenge: q.get("code_challenge")!, client: q.get("client_id")!, redirect: q.get("redirect_uri") ?? "", resource: q.get("resource") ?? "", used: false });
    res.writeHead(302, { location: `${q.get("redirect_uri")}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get("state") ?? "")}` });
    return res.end();
  }
  if (p === "/auth/token" && req.method === "POST") {
    const f = Object.fromEntries(new URLSearchParams(raw));
    oa.token.push(f);
    if (!oa.clients.has(f.client_id) || oa.clients.get(f.client_id) !== f.client_secret || oa.rejected.has(f.client_id)) return json(401, { error: "invalid_client" });
    const issue = () => {
      const at = `at_${++oa.n}_ACCESSTOKEN`;
      const rt = `rt_${oa.n}_REFRESHTOKEN`;
      oa.access.set(at, f.client_id);
      oa.refresh.set(rt, f.client_id);
      oa.issued.push(at, rt);
      return json(200, { access_token: at, token_type: "Bearer", expires_in: 3600, refresh_token: rt, scope: "meetings:read offline_access" });
    };
    if (f.grant_type === "authorization_code") {
      const c = oa.codes.get(f.code);
      if (!c || c.used || c.client !== f.client_id || c.redirect !== f.redirect_uri) return json(400, { error: "invalid_grant" });
      c.used = true;
      const ok = createHash("sha256").update(f.code_verifier ?? "").digest("base64url") === c.challenge;
      oa.pkceOk.push(ok);
      if (!ok || f.resource !== `${OBASE}/mcp`) return json(400, { error: "invalid_grant" });
      return issue();
    }
    if (f.grant_type === "refresh_token") {
      if (oa.deadRefresh || oa.refresh.get(f.refresh_token) !== f.client_id) return json(400, { error: "invalid_grant" });
      oa.refresh.delete(f.refresh_token);
      return issue();
    }
    return json(400, { error: "unsupported_grant_type" });
  }
  if (p === "/auth/revoke" && req.method === "POST") {
    const f = Object.fromEntries(new URLSearchParams(raw));
    oa.revoked.push(f.token);
    oa.access.delete(f.token);
    oa.refresh.delete(f.token);
    res.writeHead(200);
    return res.end();
  }
  if (p === "/mcp" && req.method === "POST") {
    const tok = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!oa.access.has(tok) || oa.expired.has(tok)) return json(401, { error: "invalid_token" }, { "www-authenticate": `Bearer resource_metadata="${OBASE}/.well-known/oauth-protected-resource/mcp"` });
    const m = JSON.parse(raw || "{}") as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    const session = String(req.headers["mcp-session-id"] ?? "");
    oa.mcp.push({ method: m.method, tool: m.params?.name, args: m.params?.arguments, session });
    if (m.method === "initialize") return json(200, { jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "granola-fake", version: "1" } } }, { "mcp-session-id": "sess_fake_1" });
    if (m.method === "notifications/initialized") return (res.writeHead(202), res.end());
    if (session !== "sess_fake_1") return json(400, { jsonrpc: "2.0", id: m.id, error: { code: -32600, message: "no session" } });
    if (m.method !== "tools/call") return json(200, { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "unknown" } });
    const a = m.params?.arguments ?? {};
    const out = (text: string, isError = false) => json(200, { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text }], isError } });
    const people = (n: FakeNote, emails = true) =>
      n.attendees.map((x) => (x.email === ownerJ.email ? `<participant name="${xmlEsc(x.name)}" email="${x.email}" role="creator"/>` : emails ? `${xmlEsc(x.name)} &lt;${x.email}&gt;` : xmlEsc(x.name))).join("\n");
    if (m.params?.name === "search_meetings") {
      const from = Date.parse(String(a.from_date ?? "")) || 0;
      const to = Date.parse(String(a.to_date ?? "")) || Infinity;
      const part = String(a.participant ?? "").toLowerCase();
      const hit = meetings
        .filter((n) => n.at >= from && n.at <= to && (!part || n.attendees.some((x) => x.email === part || x.email.endsWith(`@${part}`) || x.email.endsWith(`.${part}`))))
        .sort((x, y) => y.at - x.at)
        .slice(0, Number(a.limit ?? 30));
      if (oa.json)
        return out(JSON.stringify({ meetings: hit.map((n) => ({ id: n.id, title: n.title, meeting_at: iso(n.at), end: iso(n.at + n.minutes * 60_000), participants: n.attendees })), next_cursor: null }));
      // Today's call has no emails yet in the search (names only): Merlin reads it with get_meetings.
      return out(
        `<upcoming_meetings><meeting id="evt_future0001" title="Next week" meeting_at="${iso(NOW + 2 * DAY)}"><known_participants>Dana Whitfield &lt;dana@cedarpine.example&gt;</known_participants></meeting></upcoming_meetings>\n<meetings count="${hit.length}">\n${hit
          .map((n) => `<meeting id="${n.id}" title="${xmlEsc(n.title)}" meeting_at="${iso(n.at)}" meeting_end="${iso(n.at + n.minutes * 60_000)}">\n<known_participants total="${n.attendees.length}">\n${people(n, n.id !== "not_cedar000000001")}\n</known_participants>\n<excerpt>Summary SECRETSUMMARY</excerpt>\n</meeting>`)
          .join("\n")}\n</meetings>`,
      );
    }
    if (m.params?.name === "get_meetings") {
      const ids = (a.meeting_ids as string[]) ?? [];
      const hit = meetings.filter((n) => ids.includes(n.id));
      if (!hit.length) return out("Meeting not found.", true);
      const body = hit.map((n) => `<meeting id="${n.id}" title="${xmlEsc(n.title)}" meeting_at="${iso(n.at)}" meeting_end="${iso(n.at + n.minutes * 60_000)}">\n<known_participants>\n${people(n)}\n</known_participants>\n<summary>Summary SECRETSUMMARY</summary>\n<private_notes>Private SECRETPRIVATE</private_notes>\n</meeting>`).join("\n");
      // An event stream this time, as Streamable HTTP allows.
      res.writeHead(200, { "content-type": "text/event-stream" });
      return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `<meetings>\n${body}\n</meetings>` }] } })}\n\n`);
    }
    if (m.params?.name === "get_meeting_transcript") {
      const n = meetings.find((x) => x.id === a.meeting_id);
      if (!n) return out("Meeting not found.", true);
      if (n.id === UUID_MEET) return out(JSON.stringify({ meeting_id: n.id, transcript: null, transcript_unavailable: { reason: "transcript_pending" } }));
      const all = mcpTranscript(n);
      const at = Number(a.offset ?? 0);
      const size = Math.min(Number(a.max_chars ?? 40000), 5000);
      const page = all.slice(at, at + size);
      const more = at + size < all.length;
      return out(JSON.stringify({ meeting_id: n.id, transcript: page, total_chars: all.length, truncated: more, next_offset: more ? at + size : null }));
    }
    if (m.params?.name === "search_transcripts") return out("<results></results>");
    return json(200, { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "unknown tool" } });
  }
  return json(404, { error: "not_found" });
});
await new Promise<void>((r) => fakeOauth.listen(0, "127.0.0.1", () => r()));
const OBASE = `http://127.0.0.1:${(fakeOauth.address() as AddressInfo).port}`;

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_GRANOLA_API_TEST: BASE,
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_granola",
  STRIPE_WEBHOOK_SECRET: "whsec_test_granola",
  STRIPE_PRICE_MONTH: "price_month_granola",
  STRIPE_PRICE_YEAR: "price_year_granola",
});
for (const k of ["RN_GRANOLA", "RN_GOOGLE", "RESEND_API_KEY", "RN_SCAN", "RN_BACKUP_S3_ENDPOINT", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY"]) delete process.env[k];

/* Every log line is kept: no key, title, summary or transcript may ever be in one. */
const logged: string[] = [];
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    logged.push(a.map(String).join(" "));
    if (k === "log") orig(...a);
  };
}

const JORDAN = "tok-jordan-0001";
const BO = "tok-bo-0001";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
const SECRETS = [GOOD, BO_KEY, "goodkey_jordan", SECRET_TITLE, "SECRETTITLE", "SECRETWORDS", "SECRETSUMMARY", "SECRETPRIVATE"];
const leaks = (text: string, list = SECRETS) => list.filter((x) => text.includes(x));
async function problem(p: Promise<unknown>): Promise<{ message: string; status: number; code: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const x = e as { message?: string; status?: number; code?: string };
    return { message: String(x.message ?? ""), status: x.status ?? 0, code: x.code ?? "" };
  }
}

async function main() {
  const T = await import("../lib/table.ts");
  const G = await import("../lib/granola/index.ts");
  const A = await import("../lib/granola/api.ts");
  const W = (await import("../lib/granola/types.ts")).GRANOLA_WORDS;
  A._pace.backoffMs = 5;
  const cedar = T.tableInternals.pubId("c_cedar");
  const locked = T.tableInternals.pubId("c_locked");
  const flush = async () => {
    await T.tableInternals.mutate(() => {});
    await new Promise((r) => setTimeout(r, 30));
  };

  /* ---------- 1. off ---------- */
  console.log("\nRN_GRANOLA off");
  const st0 = await G.granolaStatus(JORDAN);
  check("the status says off, with nothing connected", !!st0 && st0.on === false && st0.connected === false, st0);
  check("connect is refused without a call to Granola", (await problem(G.connectGranola(JORDAN, GOOD)))?.code === "off" && requests.length === 0);
  check("the calls are refused", (await problem(G.granolaCalls(JORDAN, { companyId: cedar })))?.code === "off");
  check("a transcript is refused", (await problem(G.granolaTranscript("mem_jordan", "not_cedar000000001")))?.code === "off");
  const MG = await import("../lib/mcp/granola.ts");
  const ctxJ = { member: seed.members[0] as never, origin: "https://post.example.com" };
  check("the connector's tool says it isn't on", /isn't switched on/.test((await problem(MG.listGranolaCalls(ctxJ, { company_id: cedar })))?.message ?? ""));
  check("the connector only registers the tool with RN_GRANOLA on", /if \(granolaOn\(\)\) registerGranolaTools/.test(readFileSync(new URL("../lib/mcp/server.ts", import.meta.url), "utf8")));
  check("signed out, no status", (await G.granolaStatus("nobody")) === null);

  process.env.RN_GRANOLA = "1";

  /* ---------- 2. connect ---------- */
  console.log("\nConnect");
  const st1 = await G.granolaStatus(JORDAN);
  check("on, not connected, Close in the trial", st1?.on === true && st1.connected === false && st1.canDraft === true, st1);
  check("Free: not connected, no drafting (Close)", (await G.granolaStatus(BO))?.canDraft === false);
  check("a key that isn't one is refused before any call", (await problem(G.connectGranola(JORDAN, "my granola password")))?.message === W.shape && requests.length === 0);
  const bad = await problem(G.connectGranola(JORDAN, BAD));
  check("a bad key: Granola's 401 in plain words, nothing kept", bad?.message === W.badKey && bad.status === 400 && !(await G.granolaStatus(JORDAN))?.connected, bad);
  const np = await problem(G.connectGranola(JORDAN, NOPLAN));
  check("a plan without the API: says Business or Enterprise", np?.message === W.noPlan && /Business or Enterprise/.test(np.message), np);
  const before = requests.length;
  const ok = await G.connectGranola(JORDAN, GOOD);
  check("a good key: checked with one cheap call", requests.length === before + 1 && /\/v1\/notes\?page_size=1$/.test(requests[requests.length - 1].path), requests.slice(before));
  check("connected, key ending abcd", ok.status.connected && ok.status.last4 === "abcd" && /connected/i.test(ok.message), ok);
  check("the answer has no key", leaks(JSON.stringify(ok)).length === 0);
  await flush();
  const sf = stateFile();
  const stored = (JSON.parse(sf) as { granola?: Record<string, { key: string; last4: string }> }).granola?.mem_jordan;
  check("stored sealed (g1.), never in plain text", !!stored && stored.key.startsWith("g1.") && !sf.includes(GOOD) && !sf.includes("goodkey_jordan") && stored.last4 === "abcd", stored);
  const { unseal } = await import("../lib/google/crypto.ts");
  check("it opens on the server to the same key", unseal(stored?.key) === GOOD);

  /* ---------- 3. calls ---------- */
  console.log("\nCalls");
  const byCo = await G.granolaCalls(JORDAN, { companyId: cedar }, NOW);
  const ids = byCo.calls.map((c) => c.noteId);
  check("by company: today's, the workshop and the EU subdomain, newest first", JSON.stringify(ids) === JSON.stringify(["not_cedar000000001", "not_bigtr000000005", "not_cedar000000002"]), ids);
  check("matched by the company's domain", byCo.by.kind === "company" && byCo.by.domain === "cedarpine.example", byCo.by);
  check("today's call is found though Granola's search doesn't have it yet", ids[0] === "not_cedar000000001");
  check("another client's call and one 40 days ago are left out", !ids.includes("not_other000000003") && !ids.includes("not_oldce000000004"));
  const c1 = byCo.calls[0];
  check("each call: when, length from the calendar, who else (not the member or the owner), the note id", c1.when === iso(today10) && c1.minutes === 45 && c1.with.length === 1 && c1.with[0].email === "dana@cedarpine.example" && c1.with[0].name === "Dana Whitfield", c1);
  check("no titles unless asked", byCo.calls.every((c) => !("title" in c)) && leaks(JSON.stringify(byCo)).length === 0);
  check("no transcript was read to list calls", !requests.some((r) => /include=transcript|\/transcript/.test(r.path)));
  const withTitles = await G.granolaCalls(JORDAN, { companyId: cedar, titles: "1" }, NOW);
  check("titles=1: the member's own note titles", withTitles.calls[0].title === SECRET_TITLE);
  const byMail = await G.granolaCalls(JORDAN, { email: "LEE@eu.cedarpine.example" }, NOW);
  check("by email: only that person's calls", byMail.calls.map((c) => c.noteId).join() === "not_cedar000000002" && byMail.by.kind === "email", byMail.calls);
  const searchBody = requests.filter((r) => r.path === "/v1/notes/search").map((r) => JSON.parse(r.body));
  check("Granola's search is asked for the domain or the email, from 30 days back", searchBody.some((b) => b.participant === "cedarpine.example") && searchBody.some((b) => b.participant === "lee@eu.cedarpine.example") && searchBody.every((b) => Math.abs(Date.parse(b.from_date) - (NOW - 30 * DAY)) < 60_000), searchBody);
  const recent = await G.granolaCalls(JORDAN, { recent: "1" }, NOW);
  check("any recent call: every call of the last 30 days", recent.calls.length === 4 && recent.calls.some((c) => c.noteId === "not_other000000003"), recent.calls.map((c) => c.noteId));
  const lk = await problem(G.granolaCalls(JORDAN, { companyId: locked }, NOW));
  check("a company locked for the member is refused (its domain would name it)", lk?.code === "locked" && lk.message === W.locked, lk);
  check("an email that isn't one is refused", (await problem(G.granolaCalls(JORDAN, { email: "dana" })))?.code === "email");
  check("Bo has not connected: told to connect first", (await problem(G.granolaCalls(BO, { recent: "1" })))?.code === "not_connected");

  /* ---------- 4. a picked call's transcript ---------- */
  console.log("\nA picked call");
  const t1 = await G.transcriptForPicker(JORDAN, "not_cedar000000001");
  check("the lines, each with who said it", t1.text.startsWith("Jordan Avery: Thanks for making the time, Dana.") && t1.text.includes(`\nDana Whitfield: Happy to. The short version is ${SECRET_LINE}`) && t1.text.split("\n").length === 3, t1.text);
  check("the length from the transcript's own times: 42 minutes", t1.minutes === 42, t1.minutes);
  check("who was on it, the member left out", t1.attendees.length === 1 && t1.attendees[0].email === "dana@cedarpine.example");
  check("no title unless asked; with titles it comes", !("title" in t1) && (await G.transcriptForPicker(JORDAN, "not_cedar000000001", { titles: "1" })).title === SECRET_TITLE);
  check("the reader in Proposals reads it (speakers, the member's own lines)", (await import("../lib/proposals/extract.ts")).parseTranscript(t1.text).map((u) => u.speaker).join() === "Jordan Avery,Dana Whitfield,Jordan Avery");
  const big = await G.granolaTranscript("mem_jordan", "not_bigtr000000005");
  check("too large to come with the note: read in pages, all of it", big.text.split("\n").length === 230 && big.text.includes("Workshop line 229") && requests.filter((r) => r.path.includes("not_bigtr000000005/transcript")).length === 3, big.text.split("\n").length);
  check("a note id that isn't one is refused without a call", (await problem(G.granolaTranscript("mem_jordan", "../../v1/notes")))?.code === "not_found");
  check("a note Granola doesn't have: plain words", (await problem(G.granolaTranscript("mem_jordan", "not_zzzzz000000009")))?.message === W.notFound);
  const fr = await problem(G.transcriptForPicker(BO, "not_cedar000000001"));
  check("Free: drafting from a call is Close", fr?.code === "close" && fr.status === 403 && fr.message === W.close, fr);
  // Transcripts turned off for the workspace (Enterprise admins can).
  await G.connectGranola(BO, NOTRANS);
  await T.tableInternals.mutate((s) => void (s.billing!.members.mem_bo = { ...trial }));
  const listed = await G.granolaCalls(BO, { email: "dana@cedarpine.example" }, NOW).catch((e) => e);
  check("transcripts off: the calls still list", Array.isArray(listed?.calls) && listed.calls.length === 2, listed);
  const nt = await problem(G.transcriptForPicker(BO, "not_cedar000000001"));
  check("transcripts off: a plain message, and the paste fallback named", nt?.code === "no_transcripts" && /paste the transcript/.test(nt.message) && nt.status === 403, nt);
  check("the plan's words say Business or Enterprise and Personal notes", /Business or Enterprise/.test(readFileSync(new URL("../app/post/GranolaSection.tsx", import.meta.url), "utf8")) && /Personal notes/.test(readFileSync(new URL("../app/post/GranolaSection.tsx", import.meta.url), "utf8")));

  /* ---------- 5. 429 ---------- */
  console.log("\n429 and backoff");
  A._pace.reset();
  const r0 = requests.length;
  const slowOk = await G.connectGranola(BO, SLOW);
  const slowReqs = requests.slice(r0).filter((r) => r.key === SLOW);
  check("two 429s, waited, then through", slowOk.status.connected && slowReqs.length === 3, slowReqs.length);
  const r1 = requests.length;
  const gaveUp = await problem(G.connectGranola(BO, ALWAYS429));
  check("still 429 after 3 retries: Granola is busy, in plain words", gaveUp?.message === W.busy && requests.slice(r1).length === 4, { gaveUp, n: requests.slice(r1).length });
  // The bucket: a burst of 30 notes read for one key never goes past 10 at once.
  const pace0 = Date.now();
  A._pace.reset();
  await Promise.all(Array.from({ length: 14 }, () => A.getNote(GOOD, "not_cedar000000002")));
  check("a burst is paced: 14 requests take over half a second (10, then 4 a second)", Date.now() - pace0 >= 500, Date.now() - pace0);

  /* ---------- 6. nothing kept, nothing logged ---------- */
  console.log("\nNothing kept");
  await flush();
  const after = stateFile();
  check("nothing from a note in the state after listing and drafting: no title, words, summary or names", leaks(after, [SECRET_TITLE, "SECRETWORDS", "SECRETSUMMARY", "Workshop line", "Dana Whitfield", "dana@cedarpine.example", "not_cedar000000001"]).length === 0, leaks(after, [SECRET_TITLE, "SECRETWORDS", "Dana Whitfield", "not_cedar000000001"]));
  check("the granola record is only the sealed key, last four and dates", Object.values((JSON.parse(after) as { granola: Record<string, object> }).granola).every((l) => Object.keys(l).every((k) => ["key", "last4", "connectedAt", "okAt", "badAt"].includes(k))));
  check("no key, title, summary or transcript in any log line", leaks(logged.join("\n"), [...SECRETS, BAD, NOPLAN, NOTRANS, "Workshop line"]).length === 0, leaks(logged.join("\n"), [...SECRETS, BAD, NOPLAN]));
  check("the failures were logged with a code only", logged.some((l) => /Granola connect: the key check failed \(bad_key\)/.test(l)));

  /* ---------- 7. revoked, disconnect, closure, purge, export ---------- */
  console.log("\nA revoked key, Disconnect, closing an account");
  dead.add(GOOD);
  const rv = await problem(G.granolaCalls(JORDAN, { companyId: cedar }, NOW));
  check("a key Granola stopped accepting: says connect a new one", rv?.message === W.revoked && rv.code === "bad_key", rv);
  await flush();
  check("the card says the key stopped working", (await G.granolaStatus(JORDAN))?.broken === true);
  dead.delete(GOOD);
  await G.granolaCalls(JORDAN, { email: "dana@cedarpine.example" }, NOW);
  await flush();
  check("working again: the mark goes", !(await G.granolaStatus(JORDAN))?.broken);
  const exp = JSON.stringify(await T.exportState());
  check("the admin export has no Granola key", !exp.includes('"granola"') && !exp.includes((JSON.parse(stateFile()) as { granola: Record<string, { key: string }> }).granola.mem_jordan.key));
  const dc = await G.disconnectGranola(JORDAN);
  await flush();
  check("Disconnect deletes the key, and says to revoke it in Granola too", !dc.status.connected && !(JSON.parse(stateFile()) as { granola?: Record<string, unknown> }).granola?.mem_jordan && /revoke it under Settings, Connectors, API keys/.test(dc.message), dc);
  check("disconnected: calls ask to connect first", (await problem(G.granolaCalls(JORDAN, { recent: "1" })))?.code === "not_connected");
  // Bo is connected (SLOW). Closing the account deletes the key at once.
  check("Bo is connected before closing", !!(await G.granolaStatus(BO))?.connected);
  const ACC = await import("../lib/account.ts");
  await ACC.closeAccount(BO, { nowMs: NOW });
  await flush();
  check("closing an account deletes the Granola key at once", !(JSON.parse(stateFile()) as { granola?: Record<string, unknown> }).granola?.mem_bo);
  // The 30-day delete deletes it too (a key put back by hand, as if from an old backup).
  await T.tableInternals.mutate((s) => void (((s as unknown as { granola: Record<string, unknown> }).granola ??= {}).mem_bo = { key: "g1.x", last4: "wxyz", connectedAt: iso(NOW) }));
  await ACC.purgeDue(NOW + 31 * DAY);
  await flush();
  check("the 30-day delete deletes it as well", !(JSON.parse(stateFile()) as { granola?: Record<string, unknown> }).granola?.mem_bo);

  /* ---------- 8. the connector and the routes ---------- */
  console.log("\nThe connector and the routes");
  check("the connector: not connected says how", (await MG.listGranolaCalls(ctxJ, { company_id: cedar })).connected === false);
  await G.connectGranola(JORDAN, GOOD);
  const tool = await MG.listGranolaCalls(ctxJ, { company_id: cedar });
  const tj = JSON.stringify(tool);
  check("list_granola_calls: when, minutes, who, the note id, newest first", (tool.calls as { granola_note_id: string }[]).map((c) => c.granola_note_id)[0] === "not_cedar000000001" && tj.includes("Dana Whitfield <dana@cedarpine.example>") && tj.includes('"minutes":45'), tool);
  check("list_granola_calls never gives a title, summary or transcript", leaks(tj).length === 0 && !tj.includes("SECRETWORDS"));
  check("by email too", ((await MG.listGranolaCalls(ctxJ, { email: "lee@eu.cedarpine.example" })).calls as unknown[]).length === 1);
  check("neither: asks for one", /company_id .* or the person's email/.test((await problem(MG.listGranolaCalls(ctxJ, {})))?.message ?? ""));

  const { NextRequest } = await import("next/server");
  const R = await import("../app/api/integrations/granola/[op]/route.ts");
  const at = (op: string, q = "", init: { method?: string; body?: string; token?: string | null } = {}) =>
    new NextRequest(`https://post.example.com/api/integrations/granola/${op}${q}`, {
      method: init.method ?? "GET",
      headers: { ...(init.token === null ? {} : { cookie: `rn_table=${init.token ?? JORDAN}` }), ...(init.body ? { "content-type": "application/json", origin: "https://post.example.com" } : {}) },
      ...(init.body ? { body: init.body } : {}),
    });
  const call = async (op: string, q = "", init: { method?: string; body?: string; token?: string | null } = {}) => {
    const req = at(op, q, init);
    const res = await (init.method === "POST" ? R.POST : R.GET)(req as never, { params: Promise.resolve({ op }) });
    return { status: res.status, cache: res.headers.get("cache-control"), j: (await res.json()) as Record<string, unknown>, raw: "" };
  };
  const rs = await call("status");
  check("GET status: connected, key ending abcd, no-store, no key", rs.status === 200 && (rs.j.status as { last4: string }).last4 === "abcd" && rs.cache === "no-store" && leaks(JSON.stringify(rs.j)).length === 0, rs);
  check("GET status signed out: 401", (await call("status", "", { token: null })).status === 401);
  const rc = await call("calls", `?company=${encodeURIComponent(cedar)}`);
  check("GET calls?company=: the calls, no titles", rc.status === 200 && (rc.j.calls as unknown[]).length === 3 && leaks(JSON.stringify(rc.j)).length === 0, rc.status);
  const rcl = await call("calls", `?company=${encodeURIComponent(locked)}`);
  check("GET calls on a locked company: 403 with words", rcl.status === 403 && rcl.j.code === "locked");
  const rt = await call("transcript", "?note=not_cedar000000001");
  check("GET transcript: the text and attendees, no-store", rt.status === 200 && String(rt.j.text).includes("Dana Whitfield:") && rt.cache === "no-store");
  const rbad = await call("connect", "", { method: "POST", body: JSON.stringify({ key: BAD }) });
  check("POST connect with a bad key: 400 in words, never the key back", rbad.status === 400 && rbad.j.error === W.badKey && !JSON.stringify(rbad.j).includes(BAD));
  const rok = await call("connect", "", { method: "POST", body: JSON.stringify({ key: GOOD }) });
  check("POST connect: the status, never the key", rok.status === 200 && leaks(JSON.stringify(rok.j)).length === 0 && (rok.j.status as { connected: boolean }).connected);
  const foreign = await (R.POST as (r: unknown, c: unknown) => Promise<Response>)(
    new NextRequest("https://post.example.com/api/integrations/granola/disconnect", { method: "POST", headers: { cookie: `rn_table=${JORDAN}`, origin: "https://evil.example" }, body: "{}" }),
    { params: Promise.resolve({ op: "disconnect" }) },
  );
  check("POST from another site: refused", foreign.status === 403 && !!(await G.granolaStatus(JORDAN))?.connected);
  process.env.RN_GRANOLA = "0";
  const roff = await call("calls", "?recent=1");
  check("RN_GRANOLA off: the routes answer 404 and the status says off", roff.status === 404 && ((await call("status")).j.status as { on: boolean }).on === false);
  process.env.RN_GRANOLA = "1";

  /* ---------- 9. the picker's words, the top row ---------- */
  console.log("\nThe picker's words");
  const Wd = await import("../app/post/granolaWords.ts");
  // The words read against a fixed afternoon clock (today at 3:00 PM, a call at 10:00 AM), so they hold at any hour the suite runs.
  const W_NOW = (() => { const d = new Date(NOW); d.setHours(15, 0, 0, 0); return d.getTime(); })();
  const w10 = (() => { const d = new Date(NOW); d.setHours(10, 0, 0, 0); return d.getTime(); })();
  const call0 = { noteId: "not_cedar000000001", when: iso(w10), minutes: 42, with: [{ name: "Dana Whitfield", email: "dana@cedarpine.example" }], more: 0 };
  const hhmm = new Date(w10).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  check("Today's call with Dana, 10:00 AM (the app's clock, not 24 hours)", Wd.callTitle(call0, W_NOW) === `Today\u2019s call with Dana, ${hhmm}` && hhmm === "10:00 AM", Wd.callTitle(call0, W_NOW));
  check("Granola has a 42-minute call from today with dana@cedarpine.example.", Wd.callLine(call0, W_NOW) === "Granola has a 42-minute call from today with dana@cedarpine.example.", Wd.callLine(call0, W_NOW));
  check("an 8-minute call; yesterday; more people", Wd.callLine({ ...call0, minutes: 8 }, W_NOW).startsWith("Granola has an 8-minute") && Wd.callTitle({ ...call0, when: iso(w10 - DAY) }, W_NOW).startsWith("Yesterday\u2019s call with Dana") && Wd.whoOf({ ...call0, more: 2 }) === "Dana and 2 others");
  check("an older call names the day; nobody named reads plainly", /^Call with Dana on [A-Z][a-z]{2} \d+, \d{1,2}:\d\d [AP]M$/.test(Wd.callTitle({ ...call0, when: iso(w10 - 12 * DAY) }, W_NOW)) && Wd.callTitle({ ...call0, with: [] }, W_NOW).startsWith("Today\u2019s call, "));
  const jsxText = (f: string) => [...readFileSync(new URL(f, import.meta.url), "utf8").matchAll(/>\s*([A-Z][^<>{}=&?()]*)</g)].map((m) => m[1]).join(" ");
  const words = [...Object.values(W), Wd.callTitle(call0, W_NOW), Wd.callLine(call0, W_NOW), jsxText("../app/post/GranolaCallPicker.tsx"), jsxText("../app/post/GranolaSection.tsx")].join(" ");
  check("no exclamation marks or em dashes in the words", !/[!—]/.test(words), (words.match(/.{0,30}[!—].{0,10}/) ?? [])[0]);

  console.log("\nThe top row of Integrations");
  const M = await import("../app/post/integrationsModel.ts");
  const O = await import("../lib/mcp/oauth.ts");
  const jApps = await O.connectedApps("mem_jordan");
  check("an active grant counts", jApps.length === 1 && jApps[0].name === "Claude");
  check("a grant past its refresh expiry doesn't (Bo's ChatGPT)", (await O.connectedApps("mem_bo")).length === 0);
  check("Claude, connected: mint chip, the app and when it was used", JSON.stringify(M.claudePick(jApps, NOW)) === JSON.stringify({ chip: "Connected", tone: "mint", line: "Claude · used today" }), M.claudePick(jApps, NOW));
  check("Claude, none: Not set up", M.claudePick([], NOW).chip === "Not set up" && M.claudePick([], NOW).tone === "outline" && M.claudePick(null).chip === "…");
  check("two apps: each named once, the latest use", M.claudePick([...jApps, { id: "x", name: "Claude", connectedAt: iso(NOW - 9 * DAY), lastUsedAt: iso(NOW - 9 * DAY) }, { id: "y", name: "Cursor", connectedAt: iso(NOW - 3 * DAY), lastUsedAt: iso(NOW - DAY - 3_600_000) }], NOW).line === "Claude · used today, Cursor · used yesterday");
  await O.disconnectApp("mem_jordan", "g_live");
  check("revoked: the grant is gone, Not set up", (await O.connectedApps("mem_jordan")).length === 0 && M.claudePick(await O.connectedApps("mem_jordan"), NOW).chip === "Not set up");
  const link = (o: Partial<{ calendar: boolean; contacts: boolean; status: "ok" | "reconnect" }> = {}) => ({ email: "jordan@averyadvisory.example", status: "ok" as const, goneAt: null, deleteOn: null, syncedAt: iso(NOW), connectedAt: iso(NOW), calendar: true, contacts: true, error: null, ...o });
  const net = (g: ReturnType<typeof link> | null, gm: ReturnType<typeof link> | null = null) => ({ on: true, google: g, gmail: gm }) as never;
  check("Google off (RN_GOOGLE): no card", M.googlePick({ on: false }) === null);
  check("Google not connected: Not set up", M.googlePick(net(null))?.chip === "Not set up");
  check("Google: Calendar and Contacts", JSON.stringify(M.googlePick(net(link()))) === JSON.stringify({ chip: "Connected", tone: "mint", line: "Calendar and Contacts" }));
  check("Google: Calendar, Contacts and Gmail", M.googlePick(net(link(), link()))?.line === "Calendar, Contacts and Gmail");
  check("Google: Calendar only", M.googlePick(net(link({ contacts: false })))?.line === "Calendar");
  check("Google: access removed says Needs reconnecting", M.googlePick(net(link({ status: "reconnect" })))?.chip === "Needs reconnecting" && M.googlePick(net(link({ status: "reconnect" })))?.tone === "outline");
  check("Google loading, and failed (no card)", M.googlePick(null)?.chip === "…" && M.googlePick(null, true) === null);
  check("Granola off: no card", M.granolaPick({ on: false, connected: false, canDraft: true }) === null);
  check("Granola: Not set up; Connected with the key's end; a key that stopped", M.granolaPick({ on: true, connected: false, canDraft: true })?.chip === "Not set up" && M.granolaPick({ on: true, connected: true, last4: "abcd", canDraft: true })?.line === "Key ending ••••abcd" && M.granolaPick({ on: true, connected: true, last4: "abcd", broken: true, canDraft: true })?.chip === "Key stopped working");
  check("Slack: Not set up, Connected with its channel, Stopped", M.slackPick({ slack: null } as never).chip === "Not set up" && M.slackPick({ slack: { channel: "#deals", broken: false } } as never).line === "Posting to #deals" && M.slackPick({ slack: { broken: true } } as never).chip === "Stopped");
  const page = readFileSync(new URL("../app/post/Integrations.tsx", import.meta.url), "utf8");
  check("the page's row: Slack, Claude, Google and Granola from these, Granola and Google only when on", /name="Slack"[\s\S]*name="Claude"[\s\S]*googleSt && <PickCard[\s\S]*granolaSt && <PickCard/.test(page) && !/<Chip>Connector<\/Chip>/.test(page));
  check("the Claude section lists the connected apps with Disconnect", page.includes("<ConnectedApps onApps={setApps} />") && readFileSync(new URL("../app/post/ConnectedApps.tsx", import.meta.url), "utf8").includes("Disconnect {a.name}?"));

  console.log("\nThe data page and the doc");
  const df = readFileSync(new URL("../app/data/DataFlows.tsx", import.meta.url), "utf8");
  const md = readFileSync(new URL("../docs/data-flows.md", import.meta.url), "utf8");
  check("the data page names Granola, reading on demand, nothing kept, how to disconnect", /who: "Granola"/.test(df) && /Only when the member picks a call does Merlin read its transcript/.test(df) && /no note, title, summary or transcript/.test(df) && /Granola: Integrations, Disconnect/.test(df) && /Granola: off unless turned on/.test(df));
  check("the doc has the host, the switch and what is kept", md.includes("public-api.granola.ai") && md.includes("`RN_GRANOLA=1`") && md.includes("`State.granola[memberId]`") && /Granola webhooks are not used/.test(md));

  /* ---------- 10. Connect Granola: the sign-in and Granola's MCP server ---------- */
  console.log("\nConnect Granola: discovery and registration");
  const OA = await import("../lib/granola/oauth.ts");
  const RD = await import("../lib/granola/meetings.ts");
  const SAM = "tok-sam-0001";
  const sealedOf = (id: string) => (JSON.parse(stateFile()) as { granola?: Record<string, Record<string, string>> }).granola?.[id];
  const appOf = () => (JSON.parse(stateFile()) as { granolaApp?: Record<string, string> }).granolaApp;
  // Jordan is on a key from section 8: off it, to connect the main way.
  await G.disconnectGranola(JORDAN);
  process.env.RN_GRANOLA_MCP_URL = `${OBASE}/mcp`;
  OA._oauth.reset();
  const s10 = await G.granolaStatus(JORDAN);
  check("not connected: Connect Granola is offered (Granola's sign-in found, Merlin registered)", s10?.on === true && s10.connected === false && s10.oauth === true, s10);
  check("discovery: the protected resource metadata with the MCP path, then the authorization server's with its path (RFC 9728, RFC 8414)", oa.wellKnown.join() === "/.well-known/oauth-protected-resource/mcp,/.well-known/oauth-authorization-server/auth", oa.wellKnown);
  const reg = oa.registered[0] ?? {};
  check("registered once, as Merlin, for the callback address on RN_PUBLIC_URL, code and refresh grants", oa.registered.length === 1 && reg.client_name === "Merlin" && JSON.stringify(reg.redirect_uris) === JSON.stringify(["https://post.example.com/api/integrations/granola/callback"]) && JSON.stringify(reg.grant_types) === JSON.stringify(["authorization_code", "refresh_token"]), reg);
  await flush();
  const app1 = appOf();
  check("Merlin's client kept in State.granolaApp, the secret sealed, never in plain text", app1?.clientId === "cl_1" && String(app1?.secret).startsWith("g1.") && !stateFile().includes("CLIENTSECRET"), app1);
  const wk0 = oa.wellKnown.length;
  await G.granolaStatus(JORDAN);
  await G.granolaStatus(SAM);
  check("cached: no second discovery, no second registration", oa.wellKnown.length === wk0 && oa.registered.length === 1);
  check("Close members and Free alike see the button (connecting works on every plan)", (await G.granolaStatus(SAM))?.oauth === true);

  console.log("\nConnect Granola: consent, state, tokens");
  const sa1 = await G.startSignIn(JORDAN, "/?p=proposals&new=1");
  if (!sa1.ok) throw new Error("start failed");
  const au = new URL(sa1.url);
  const aq = au.searchParams;
  check(
    "the consent URL: Granola's authorize endpoint, Merlin's client, the redirect address, S256 challenge, state, resource, scopes",
    au.origin + au.pathname === `${OBASE}/auth/authorize` && aq.get("response_type") === "code" && aq.get("client_id") === "cl_1" && aq.get("redirect_uri") === "https://post.example.com/api/integrations/granola/callback" && aq.get("code_challenge_method") === "S256" && /^[A-Za-z0-9_-]{43}$/.test(aq.get("code_challenge") ?? "") && (aq.get("state") ?? "").length >= 40 && aq.get("resource") === `${OBASE}/mcp` && aq.get("scope") === "meetings:read offline_access",
    sa1.url,
  );
  check("the state cookie is sealed: no state or verifier readable in it", sa1.cookie.startsWith("g1.") && !sa1.cookie.includes(aq.get("state")!));
  const consent = async (url: string) => {
    const r = await fetch(url, { redirect: "manual" });
    const back = new URL(r.headers.get("location") ?? "");
    return { code: back.searchParams.get("code"), state: back.searchParams.get("state") };
  };
  const ca1 = await consent(sa1.url);
  const tk0 = oa.token.length;
  const wrong = await G.finishSignIn(JORDAN, { state: "not-the-state", code: ca1.code, error: null }, sa1.cookie);
  check("a wrong state is refused, with no call to Granola's token endpoint", wrong.outcome === "failed" && oa.token.length === tk0 && !(await G.granolaStatus(JORDAN))?.connected, wrong);
  check("another member's session can't use Jordan's state", (await G.finishSignIn(SAM, { state: ca1.state, code: ca1.code, error: null }, sa1.cookie)).outcome === "failed" && oa.token.length === tk0);
  // That try used the state up (once, either way): a fresh start for Jordan.
  const st2 = await G.startSignIn(JORDAN, "/?p=proposals&new=1");
  if (!st2.ok) throw new Error("start failed");
  const c2 = await consent(st2.url);
  check("no cookie: refused", (await G.finishSignIn(JORDAN, { state: c2.state, code: c2.code, error: null }, null)).outcome === "failed");
  const st3 = await G.startSignIn(JORDAN, "/?p=proposals&new=1");
  if (!st3.ok) throw new Error("start failed");
  const c3 = await consent(st3.url);
  const fin = await G.finishSignIn(JORDAN, { state: c3.state, code: c3.code, error: null }, st3.cookie);
  check("the right state: the code swapped, back to the same place (the proposal start)", fin.outcome === "connected" && fin.back === "/?p=proposals&new=1", fin);
  const tq = oa.token[oa.token.length - 1];
  check("the token request: the code, the PKCE verifier (Granola checked it against the challenge), the redirect address, the resource, Merlin's client", tq.grant_type === "authorization_code" && oa.pkceOk[oa.pkceOk.length - 1] === true && tq.redirect_uri === "https://post.example.com/api/integrations/granola/callback" && tq.resource === `${OBASE}/mcp` && tq.client_id === "cl_1", tq);
  check("a used state can't be used again", (await G.finishSignIn(JORDAN, { state: c3.state, code: c3.code, error: null }, st3.cookie)).outcome === "failed");
  check("Granola's no (access_denied): nothing connected, said plainly", await (async () => {
    const st = await G.startSignIn(SAM, "/?p=settings&sec=conn&open=granola");
    if (!st.ok) return false;
    const q = new URL(st.url).searchParams;
    const r = await G.finishSignIn(SAM, { state: q.get("state"), code: null, error: "access_denied" }, st.cookie);
    return r.outcome === "denied" && !(await G.granolaStatus(SAM))?.connected;
  })());
  await flush();
  const lj = sealedOf("mem_jordan");
  check("the access and refresh tokens kept sealed, never in plain text; no key on a sign-in link", !!lj && lj.via === "oauth" && lj.access.startsWith("g1.") && lj.refresh.startsWith("g1.") && !!lj.expiresAt && lj.client === "cl_1" && !("key" in lj) && !("last4" in lj) && !oa.issued.some((t) => stateFile().includes(t)), lj && Object.keys(lj));
  const sj = await G.granolaStatus(JORDAN);
  check("one status: connected with the Granola account, no key end shown, no token", sj?.connected === true && sj.via === "oauth" && !sj.last4 && !oa.issued.some((t) => JSON.stringify(sj).includes(t)), sj);
  check("the top row: Connected, your Granola account", JSON.stringify(M.granolaPick(sj)) === JSON.stringify({ chip: "Connected", tone: "mint", line: "Your Granola account" }));

  console.log("\nConnect Granola: calls over MCP");
  const m0 = oa.mcp.length;
  const oc = await G.granolaCalls(JORDAN, { companyId: cedar }, NOW);
  const mc = oa.mcp.slice(m0);
  const oids = oc.calls.map((c) => c.noteId);
  check("by company: today's, the workshop and the EU subdomain, newest first", JSON.stringify(oids) === JSON.stringify(["not_cedar000000001", "not_bigtr000000005", "not_cedar000000002"]), oids);
  const sm = mc.find((x) => x.tool === "search_meetings");
  check("MCP: initialize, initialized, then search_meetings with participant = the company's domain, the member's own meetings, the last 30 days", mc[0]?.method === "initialize" && mc[1]?.method === "notifications/initialized" && sm?.args?.participant === "cedarpine.example" && sm.args.attended_only === true && Math.abs(Date.parse(String(sm.args.from_date)) - (NOW - 30 * DAY)) < 60_000 && !!sm.session, mc.map((x) => x.tool ?? x.method));
  check("a meeting the search listed without emails is read with get_meetings (an event-stream answer) for who was on it", mc.some((x) => x.tool === "get_meetings" && JSON.stringify(x.args?.meeting_ids) === JSON.stringify(["not_cedar000000001"])) && oc.calls[0].with.map((p) => p.email).join() === "dana@cedarpine.example" && oc.calls[0].with[0].name === "Dana Whitfield", oc.calls[0]);
  check("each call: when, length from the meeting's end, who else (not the member, not the note's creator)", oc.calls[0].when === iso(today10) && oc.calls[0].minutes === 45 && oc.calls.every((c) => !c.with.some((p) => p.email === ownerJ.email)), oc.calls[0]);
  check("no transcript read to list calls, no titles unless asked, no summary or private notes anywhere", !mc.some((x) => x.tool === "get_meeting_transcript") && oc.calls.every((c) => !("title" in c)) && leaks(JSON.stringify(oc)).length === 0);
  check("titles=1: the member's own titles", (await G.granolaCalls(JORDAN, { companyId: cedar, titles: "1" }, NOW)).calls[0].title === SECRET_TITLE);
  const om = await G.granolaCalls(JORDAN, { email: "lee@eu.cedarpine.example" }, NOW);
  check("by email: participant = that address, only that person's calls", om.calls.map((c) => c.noteId).join() === "not_cedar000000002" && oa.mcp.some((x) => x.tool === "search_meetings" && x.args?.participant === "lee@eu.cedarpine.example"), om.calls);
  const orc = await G.granolaCalls(JORDAN, { recent: "1" }, NOW);
  check("any recent call: no participant, every past call of the last 30 days (a UUID id too), never an upcoming one", orc.calls.length === 5 && orc.calls.some((c) => c.noteId === UUID_MEET) && !orc.calls.some((c) => c.noteId.startsWith("evt_")) && !("participant" in (oa.mcp.filter((x) => x.tool === "search_meetings").pop()?.args ?? {})), orc.calls.map((c) => c.noteId));
  const m1 = oa.mcp.length;
  check("a locked company: refused, and nothing asked of Granola", (await problem(G.granolaCalls(JORDAN, { companyId: locked }, NOW)))?.code === "locked" && oa.mcp.length === m1);
  oa.json = true;
  const ojs = await G.granolaCalls(JORDAN, { companyId: cedar }, NOW);
  oa.json = false;
  check("a JSON answer from search_meetings reads the same", JSON.stringify(ojs.calls.map((c) => c.noteId)) === JSON.stringify(oids) && ojs.calls[0].with[0]?.email === "dana@cedarpine.example", ojs.calls);

  console.log("\nConnect Granola: one transcript");
  const m2 = oa.mcp.length;
  const ot = await G.transcriptForPicker(JORDAN, "not_cedar000000001");
  check("the lines and who said them (Microphone is the member, System audio the one other person named)", ot.text === `Jordan Avery: Thanks for making the time, Dana.\nDana Whitfield: Happy to. The short version is ${SECRET_LINE}, and the team is new. We want a fixed-fee assessment first, then maybe two days a week.\nJordan Avery: That works. I'd scope a 45-day assessment at a fixed fee.`, ot.text);
  check("the length from the transcript's own times: 42 minutes; who was on it from get_meetings", ot.minutes === 42 && ot.attendees.map((p) => p.email).join() === "dana@cedarpine.example", { m: ot.minutes, a: ot.attendees });
  check("the reader in Proposals reads it", (await import("../lib/proposals/extract.ts")).parseTranscript(ot.text).map((u) => u.speaker).join() === "Jordan Avery,Dana Whitfield,Jordan Avery");
  check("get_meeting_transcript asked for that meeting only", oa.mcp.slice(m2).filter((x) => x.tool === "get_meeting_transcript").every((x) => x.args?.meeting_id === "not_cedar000000001"));
  const m3 = oa.mcp.length;
  const obig = await G.granolaTranscript("mem_jordan", "not_bigtr000000005");
  const offs = oa.mcp.slice(m3).filter((x) => x.tool === "get_meeting_transcript").map((x) => Number(x.args?.offset ?? 0));
  check("a long transcript paged through next_offset, all of it", obig.text.split("\n").length === 230 && obig.text.includes("Workshop line 229") && offs.length >= 3 && offs[0] === 0 && offs.every((o, i) => i === 0 || o > offs[i - 1]), { lines: obig.text.split("\n").length, offs });
  check("Merlin's size cap holds (a page past it isn't read)", RD.transcriptLines(Array.from({ length: 50 }, (_, i) => `[10:00:${String(i).padStart(2, "0")}] Dana Whitfield: line ${i} ${"x".repeat(40)}`).join("\n"), "Jordan Avery", "Them", 300).text.length <= 300);
  const pend = await problem(G.transcriptForPicker(JORDAN, UUID_MEET));
  check("a UUID meeting id is taken; a transcript Granola is still writing says so plainly", pend?.code === "pending" && pend.message === W.pending, pend);
  check("a meeting Granola doesn't have: plain words", (await problem(G.granolaTranscript("mem_jordan", "not_zzzzz000000009")))?.message === W.notFound);
  await flush();
  check("nothing of the calls or the transcript kept in the state", leaks(stateFile(), [SECRET_TITLE, "SECRETWORDS", "SECRETSUMMARY", "SECRETPRIVATE", "Workshop line", "Dana Whitfield", "dana@cedarpine.example", "not_cedar000000001", UUID_MEET]).length === 0);
  const tool10 = await MG.listGranolaCalls(ctxJ, { company_id: cedar });
  check("the connector's list_granola_calls works over the sign-in too, never a title or summary", (tool10.calls as { granola_note_id: string }[])[0]?.granola_note_id === "not_cedar000000001" && leaks(JSON.stringify(tool10)).length === 0, tool10);

  console.log("\nConnect Granola: refresh");
  const t0 = oa.token.filter((x) => x.grant_type === "refresh_token").length;
  const accessNow = unseal(sealedOf("mem_jordan")!.access)!;
  oa.expired.add(accessNow);
  const afterRefresh = await G.granolaCalls(JORDAN, { email: "lee@eu.cedarpine.example" }, NOW);
  await flush();
  const refreshes = oa.token.filter((x) => x.grant_type === "refresh_token");
  check("a 401 from the MCP server: one refresh, then the call goes through", afterRefresh.calls.length === 1 && refreshes.length === t0 + 1 && refreshes[refreshes.length - 1].client_id === "cl_1", refreshes.length - t0);
  const lr = sealedOf("mem_jordan")!;
  check("the new access token and the rotated refresh token kept sealed", unseal(lr.access) !== accessNow && /^at_/.test(unseal(lr.access) ?? "") && /^rt_/.test(unseal(lr.refresh) ?? "") && oa.refresh.has(unseal(lr.refresh)!));
  await T.tableInternals.mutate((s) => void (((s as unknown as { granola: Record<string, { expiresAt: string }> }).granola.mem_jordan.expiresAt = iso(Date.now() + 10_000))));
  const n401 = oa.mcp.length;
  await G.granolaCalls(JORDAN, { email: "lee@eu.cedarpine.example" }, NOW);
  check("a token running out within a minute is refreshed before the call (no 401 needed)", oa.token.filter((x) => x.grant_type === "refresh_token").length === t0 + 2 && oa.mcp.length > n401);
  await Promise.all([G.granolaCalls(JORDAN, { recent: "1" }, NOW), G.granolaCalls(JORDAN, { recent: "1" }, NOW)]);
  check("two calls at once with a good token: no refresh at all", oa.token.filter((x) => x.grant_type === "refresh_token").length === t0 + 2);

  console.log("\nConnect Granola: Disconnect revokes and deletes");
  const lb = sealedOf("mem_jordan")!;
  const [ra, rr] = [unseal(lb.access)!, unseal(lb.refresh)!];
  const rv0 = oa.revoked.length;
  const dc10 = await G.disconnectGranola(JORDAN);
  await flush();
  check("Disconnect: the refresh and access tokens revoked at Granola (RFC 7009)", oa.revoked.slice(rv0).includes(ra) && oa.revoked.slice(rv0).includes(rr), oa.revoked.length - rv0);
  check("and deleted here; the status offers Connect Granola again", !sealedOf("mem_jordan") && !dc10.status.connected && dc10.status.oauth === true && /ended its access at Granola/.test(dc10.message), dc10);
  check("disconnected: the calls ask to connect first, and nothing goes to Granola", (await problem(G.granolaCalls(JORDAN, { recent: "1" })))?.code === "not_connected");

  console.log("\nConnect Granola: a refused refresh, a rejected client");
  const connectOver = async (tok: string, back = "/?p=settings&sec=conn&open=granola") => {
    const st = await G.startSignIn(tok, back);
    if (!st.ok) return { outcome: `start:${st.why}` };
    const c = await consent(st.url);
    return G.finishSignIn(tok, { state: c.state, code: c.code, error: null }, st.cookie);
  };
  check("connected again", (await connectOver(JORDAN)).outcome === "connected");
  oa.deadRefresh = true;
  oa.expired.add(unseal(sealedOf("mem_jordan")!.access)!);
  const refusedR = await problem(G.granolaCalls(JORDAN, { recent: "1" }, NOW));
  await flush();
  check("Granola refuses the refresh: plain words to connect again, and the status says so", refusedR?.code === "bad_key" && refusedR.message === W.signInRevoked && (await G.granolaStatus(JORDAN))?.broken === true && M.granolaPick((await G.granolaStatus(JORDAN))!)?.chip === "Needs connecting again", refusedR);
  oa.deadRefresh = false;
  // Granola forgets Merlin's client: the code exchange is refused, the client dropped, and the next start registers Merlin again.
  oa.rejected.add("cl_1");
  const rej = await connectOver(JORDAN);
  await flush();
  check("a client Granola rejects: that connect fails and Merlin forgets the client", rej.outcome === "failed" && !appOf(), rej);
  check("the next look registers Merlin again, once", (await G.granolaStatus(SAM))?.oauth === true && oa.registered.length === 2, oa.registered.length);
  const again = await connectOver(JORDAN);
  await flush();
  check("then Connect Granola works on the new client", again.outcome === "connected" && sealedOf("mem_jordan")?.client === "cl_2" && (await G.granolaStatus(JORDAN))?.broken !== true, again);

  console.log("\nConnect Granola: a key replaces a sign-in; discovery down");
  const lkey = sealedOf("mem_jordan")!;
  const rk0 = oa.revoked.length;
  await G.connectGranola(JORDAN, GOOD);
  await new Promise((r) => setTimeout(r, 50));
  const sk = await G.granolaStatus(JORDAN);
  check("a pasted key replaces the sign-in (one connection, one status), and the sign-in's tokens are revoked", sk?.via === "key" && sk.last4 === "abcd" && oa.revoked.slice(rk0).includes(unseal(lkey.refresh)!), sk);
  await G.disconnectGranola(JORDAN);
  oa.down = true;
  OA._oauth.reset();
  const sd = await G.granolaStatus(JORDAN);
  check("discovery fails: the button is hidden (oauth false), the key form is the way in", sd?.on === true && sd.connected === false && sd.oauth === false, sd);
  const ds = await G.startSignIn(JORDAN, "/?p=proposals&new=1");
  check("a start anyway goes back to the same place, unavailable", !ds.ok && ds.why === "unavailable" && ds.back === "/?p=proposals&new=1");
  const apiBefore = requests.length;
  const kc = await G.connectGranola(JORDAN, GOOD);
  const kcalls = await G.granolaCalls(JORDAN, { companyId: cedar }, NOW);
  check("the key path still works: connected with the key, calls from Granola's API", kc.status.via === "key" && kcalls.calls.length === 3 && requests.length > apiBefore, kcalls.calls.length);
  const secSrc = readFileSync(new URL("../app/post/GranolaSection.tsx", import.meta.url), "utf8");
  const conSrc = readFileSync(new URL("../app/post/settings/Connections.tsx", import.meta.url), "utf8");
  const pkSrc = readFileSync(new URL("../app/post/GranolaCallPicker.tsx", import.meta.url), "utf8");
  check("the cards: Connect Granola while oauth, the key form behind Or paste a Granola API key, the key form alone without it", [secSrc, conSrc].every((x) => /status\.oauth \?/.test(x) && x.includes("startGranola()") && x.includes("<summary>Or paste a Granola API key</summary>")) && /status\.oauth \? \(\s*<button[^>]*onClick=\{\(\) => \(setGoing\(true\), startGranola\(\)\)\}/.test(pkSrc), "");
  check("the words say what Merlin reads and never does, with no LinkedIn", /reads only the calls you pick/.test(secSrc) && /never stores a transcript, and never reads a call you didn.t pick/.test(secSrc) && ![secSrc, conSrc, pkSrc].some((x) => /linkedin/i.test(x.slice(x.indexOf("function GranolaDetail") >= 0 ? x.indexOf("function GranolaDetail") : 0))));
  await G.disconnectGranola(JORDAN);
  oa.down = false;
  OA._oauth.reset();

  console.log("\nConnect Granola: the routes");
  const routeAt = (op: string, q = "", cookie = `rn_table=${JORDAN}`) => new NextRequest(`https://post.example.com/api/integrations/granola/${op}${q}`, { headers: { cookie } });
  const rget = (op: string, q = "", cookie?: string) => R.GET(routeAt(op, q, cookie) as never, { params: Promise.resolve({ op }) });
  const rst = await rget("status");
  const rstj = (await rst.json()) as { status: { oauth?: boolean } };
  check("GET status: oauth true, no-store, nothing secret", rst.status === 200 && rstj.status.oauth === true && rst.headers.get("cache-control") === "no-store" && !/CLIENTSECRET|ACCESSTOKEN|REFRESHTOKEN/.test(JSON.stringify(rstj)));
  const rs1 = await rget("start", `?back=${encodeURIComponent("/?p=settings&sec=conn&open=granola")}`);
  const setc = rs1.headers.get("set-cookie") ?? "";
  const ck = /rn_granola_oauth=([^;]+)/.exec(setc)?.[1] ?? "";
  check("GET start: to Granola's consent page, with the sealed state cookie (httpOnly, on Granola's routes only, 10 minutes)", rs1.status === 302 && (rs1.headers.get("location") ?? "").startsWith(`${OBASE}/auth/authorize?`) && !!ck && /HttpOnly/i.test(setc) && /Path=\/api\/integrations\/granola/i.test(setc) && /Max-Age=600/i.test(setc) && /SameSite=lax/i.test(setc), setc);
  const rc1 = await consent(rs1.headers.get("location")!);
  const rcb = await rget("callback", `?code=${encodeURIComponent(rc1.code!)}&state=${encodeURIComponent(rc1.state!)}`, `rn_table=${JORDAN}; rn_granola_oauth=${ck}`);
  check("GET callback: connected, back to Settings at the Granola row with granola=connected, the cookie cleared, no referrer", rcb.status === 303 && rcb.headers.get("location") === "https://post.example.com/?p=settings&sec=conn&open=granola&granola=connected" && /rn_granola_oauth=;/.test(rcb.headers.get("set-cookie") ?? "") && rcb.headers.get("referrer-policy") === "no-referrer", rcb.headers.get("location"));
  const rbad2 = await rget("callback", `?code=x&state=nope`, `rn_table=${JORDAN}; rn_granola_oauth=${ck}`);
  check("GET callback with a wrong state: failed, still back to where the member was", rbad2.status === 303 && rbad2.headers.get("location") === "https://post.example.com/?p=settings&sec=conn&open=granola&granola=failed", rbad2.headers.get("location"));
  check("GET start signed out: to the front page", (await rget("start", "", "")).headers.get("location") === "https://post.example.com/");
  check("back paths stay in the app: another site, a protocol-relative one or an API path go to Settings", ["https://evil.example/x", "//evil.example", "/\\evil.example", "/api/integrations/granola/start", "javascript:alert(1)"].every((b) => G.backPath(b) === "/?p=settings&sec=conn&open=granola") && G.backPath("/?p=proposals&new=1&granola=failed") === "/?p=proposals&new=1");

  console.log("\nConnect Granola: closing an account");
  check("Sam connects with Granola's sign-in", (await connectOver(SAM)).outcome === "connected");
  await flush();
  const ls = sealedOf("mem_sam")!;
  const rs0 = oa.revoked.length;
  await ACC.closeAccount(SAM, { nowMs: NOW });
  await flush();
  await new Promise((r) => setTimeout(r, 100));
  check("closing an account deletes the sign-in at once and revokes its tokens at Granola", !sealedOf("mem_sam") && oa.revoked.slice(rs0).includes(unseal(ls.refresh)!), oa.revoked.length - rs0);
  const exp10 = JSON.stringify(await T.exportState());
  check("the admin export has no Granola tokens and no client secret", !exp10.includes('"granolaApp"') && !exp10.includes('"granola"') && !exp10.includes(appOf()?.secret ?? "none"));
  check("no token, code, client secret or verifier in any log line", leaks(logged.join("\n"), [...oa.issued, "AUTHCODE", "CLIENTSECRET", "ACCESSTOKEN", "REFRESHTOKEN"]).length === 0, leaks(logged.join("\n"), ["AUTHCODE", "CLIENTSECRET", "ACCESSTOKEN"]));
  check("the doc and the data page describe the sign-in and the sealed tokens", md.includes("mcp.granola.ai") && md.includes("`State.granolaApp`") && /RFC 7591/.test(md) && /access and refresh tokens/.test(md) && /Connect Granola/.test(df) && /access and refresh tokens, or the key, encrypted/.test(df));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log("FAIL the run threw", e instanceof Error ? e.stack : e);
}
granola.close();
fakeOauth.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
