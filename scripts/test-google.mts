/**
 * Checks of Your network (lib/google): the Google connector (Calendar and Contacts, Gmail headers
 * for test members) and what a member's own Claude saves (save_my_network, my_network).
 *
 *   npx tsx scripts/test-google.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end, and a fake Google API server on 127.0.0.1 (RN_GOOGLE_API_TEST, honoured only with
 * RN_SCAN_TEST=1). Every person and company in them is made up.
 *
 *  1. Pure: warmth, decision makers, the domain rules, calendar and contacts aggregation, Gmail
 *     header parsing and the bulk-sender skip, matching (domain, subdomain, exact non-generic name).
 *  2. Token sealing.
 *  3. RN_GOOGLE off: no view, no Connect, no tools, nothing named, even with data on file.
 *  4. The OAuth start and callback: scopes, offline access, the one-time state, the cookie, the member.
 *  5. The sync against fixture companies, what is kept (never a title, a subject or a raw token).
 *  6. Named free, privacy (another member, an admin, the export, the connector), Pilot metrics' counts.
 *  7. Gmail via Claude: text refused, merge and warmth, the daily cap and the rate limit, deletion.
 *  8. Direct Gmail: the tester gate, headers only, invalid_grant -> Needs reconnecting, drop Gmail.
 *  9. Disconnect and delete everything.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-google-"));

/* ---------- the made-up seed ---------- */
const fillers = Array.from({ length: 30 }, (_, i) => ({ id: `c_fill${i}`, fields: { name: `Filler Works ${i}`, website: `fill${i}.example`, industry: "SaaS", employees: "11–50" } }));
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_ana", name: "Ana Member", email: "ana.member@anaco.example", title: "Fractional CRO", token: "tok-ana-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo.other@example.org", title: "Fractional CMO", token: "tok-bo-0001" },
    { id: "mem_ad", name: "Ada Admin", email: "ada.admin@example.com", title: "Fractional CTO", token: "tok-ad-0001" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "https://www.acme.example/about", industry: "SaaS", employees: "51–200" } },
    { id: "c_bright", fields: { name: "Brightline Labs", website: "brightline.example", industry: "SaaS", employees: "11–50" } },
    { id: "c_cedar", fields: { name: "Cedar Health", website: "cedar.example", industry: "Healthcare", employees: "51–200" } },
    { id: "c_dune", fields: { name: "Dune Analytics Co", website: "dune.example", industry: "SaaS", employees: "11–50" } },
    { id: "c_own", fields: { name: "Anaco Advisory", website: "anaco.example", industry: "SaaS", employees: "1–10" } },
    { id: "c_big", fields: { name: "Bigroom Events", website: "bigroom.example", industry: "SaaS", employees: "51–200" } },
    ...fillers,
  ],
  engagements: [
    { id: "e_acme_cfo", companyId: "c_acme", fields: { source: "Published engagement", function: "Finance", role: "Fractional CFO", operator: "Pat Sample", start: "2026-01", status: "Active", type: "Fractional" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])), profiles: {} }));

/* ---------- the fake Google ---------- */
const SECRET_TITLE = "Secret board meeting about the merger";
const SECRET_SUBJECT = "Top secret pricing for next year";
const evAt = (d: number) => ({ dateTime: new Date(NOW + d * DAY).toISOString() });
const ana = { email: "ana.member@anaco.example", self: true, responseStatus: "accepted" };
const dana = { email: "dana@acme.example", displayName: "Dana Example" };
const primaryEvents = [
  ...[-5, -20, -40, -70, -100, -130, -160, -200].map((d) => ({ status: "confirmed", summary: SECRET_TITLE, description: "Notes we must never keep", start: evAt(d), attendees: [ana, dana] })),
  // Two people from Acme in one meeting: one meeting for the company.
  { status: "confirmed", summary: SECRET_TITLE, start: evAt(-6), attendees: [ana, dana, { email: "lee@eu.acme.example", displayName: "Lee Example" }] },
  { status: "confirmed", start: evAt(10), attendees: [ana, dana] },
  { status: "confirmed", start: evAt(-400), attendees: [ana, { email: "pat@cedar.example", displayName: "Pat Example" }] },
  // Not counted: cancelled, declined by the member, a room, a big meeting, a colleague, free mail.
  { status: "cancelled", start: evAt(-3), attendees: [ana, { email: "x@dune.example" }] },
  { status: "confirmed", start: evAt(-3), attendees: [{ ...ana, responseStatus: "declined" }, { email: "y@dune.example" }] },
  { status: "confirmed", start: evAt(-2), attendees: [ana, { email: "room-4@resource.calendar.google.com", resource: true }] },
  { status: "confirmed", start: evAt(-2), attendees: [ana, ...Array.from({ length: 30 }, (_, i) => ({ email: `p${i}@bigroom.example` }))] },
  { status: "confirmed", start: evAt(-2), attendees: [ana, { email: "colleague@anaco.example" }] },
  { status: "confirmed", start: evAt(-2), attendees: [ana, { email: "friend@gmail.com", displayName: "A Friend" }] },
  { status: "confirmed", eventType: "outOfOffice", start: evAt(-1), attendees: [ana, { email: "z@dune.example" }] },
];
const teamEvents = [{ status: "confirmed", start: evAt(-300), attendees: [ana, dana] }];
const connections = [
  { names: [{ displayName: "Dana Example" }], emailAddresses: [{ value: "dana@acme.example" }], organizations: [{ name: "Acme Robotics", title: "CEO" }] },
  { names: [{ displayName: "Rae Example" }], emailAddresses: [{ value: "rae.personal@gmail.com" }], organizations: [{ name: "Brightline Labs", title: "VP Sales" }] },
  { names: [{ displayName: "Sol Example" }], emailAddresses: [{ value: "sol@gmail.com" }], organizations: [{ name: "Consulting", title: "Partner" }] },
];
const otherContacts = [{ names: [{ displayName: "Kit Example" }], emailAddresses: [{ value: "kit@dune.example" }] }];
const msg = (id: string, d: number, headers: Record<string, string>, labelIds: string[] = ["INBOX"]) => ({ id, internalDate: String(NOW - d * DAY), labelIds, payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) } });
const messages = [
  msg("m1", 2, { From: "Dana Example <dana@acme.example>", To: "Ana Member <ana.member@anaco.example>", Subject: SECRET_SUBJECT, Date: "x" }),
  msg("m2", 3, { From: "Ana Member <ana.member@anaco.example>", To: "\"Dana Example\" <dana@acme.example>, lee@eu.acme.example", Subject: SECRET_SUBJECT }, ["SENT"]),
  msg("m3", 4, { From: "Cedar News <news@cedar.example>", To: "ana.member@anaco.example", "List-Unsubscribe": "<mailto:u@cedar.example>" }),
  msg("m4", 4, { From: "noreply@cedar.example", To: "ana.member@anaco.example" }),
  msg("m5", 5, { From: "Pat Example <pat@cedar.example>", To: "ana.member@anaco.example" }, ["CATEGORY_PROMOTIONS"]),
  msg("m6", 6, { From: "Pat Example <pat@cedar.example>", To: "ana.member@anaco.example", Subject: SECRET_SUBJECT }),
  msg("m7", 9, { From: "Kit Example <kit@dune.example>", To: "ana.member@anaco.example", "Auto-Submitted": "auto-replied" }),
  msg("m8", 900, { From: "Old Friend <old@dune.example>", To: "ana.member@anaco.example" }),
];

const calls: { method: string; path: string; query: URLSearchParams; body: URLSearchParams; auth: string | null }[] = [];
const dead = new Set<string>();
const revoked: string[] = [];
const GRANT_MAIN = "openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString("base64url")}.y`;
const CODES: Record<string, { refresh: string; scope: string; email: string }> = {
  "code-ana": { refresh: "REFRESH-ana-very-secret", scope: GRANT_MAIN, email: "ana.member@anaco.example" },
  "code-bo": { refresh: "REFRESH-bo-very-secret", scope: GRANT_MAIN, email: "bo.other@example.org" },
  "code-none": { refresh: "REFRESH-none", scope: "openid email", email: "ana.member@anaco.example" },
  "code-gmail": { refresh: "REFRESH-gmail-secret", scope: `${GRANT_MAIN} https://www.googleapis.com/auth/gmail.metadata`, email: "ana.member@anaco.example" },
};
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const google = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  const body = new URLSearchParams(raw);
  const auth = req.headers.authorization ?? null;
  calls.push({ method: req.method ?? "GET", path: u.pathname, query: u.searchParams, body, auth });
  const p = u.pathname;
  if (p === "/oauth2/token") {
    if (body.get("grant_type") === "authorization_code") {
      const c = CODES[body.get("code") ?? ""];
      if (!c || body.get("client_secret") !== "secret-test") return send(res, 400, { error: "invalid_grant" });
      return send(res, 200, { access_token: `ACCESS-${c.refresh}`, expires_in: 3600, refresh_token: c.refresh, scope: c.scope, id_token: idToken(c.email) });
    }
    const r = body.get("refresh_token") ?? "";
    if (dead.has(r) || !Object.values(CODES).some((c) => c.refresh === r)) return send(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    return send(res, 200, { access_token: `ACCESS-${r}`, expires_in: 3600 });
  }
  if (p === "/oauth2/revoke") {
    revoked.push(body.get("token") ?? "");
    return send(res, 200, {});
  }
  const tok = auth?.replace(/^Bearer ACCESS-/, "") ?? "";
  if (!auth || dead.has(tok) || !Object.values(CODES).some((c) => c.refresh === tok)) return send(res, 401, { error: { status: "UNAUTHENTICATED" } });
  const isBo = tok.includes("-bo-");
  if (p === "/calendar/calendar/v3/users/me/calendarList")
    return send(res, 200, { items: [{ id: "ana.member@anaco.example", primary: true, accessRole: "owner" }, { id: "team-cal@group.example", accessRole: "owner" }, { id: "holidays@group.example", accessRole: "reader" }] });
  if (p.startsWith("/calendar/calendar/v3/calendars/")) {
    const cal = decodeURIComponent(p.split("/")[5]);
    if (isBo) return send(res, 200, { items: [] });
    return send(res, 200, { items: cal === "primary" ? primaryEvents : cal === "team-cal@group.example" ? teamEvents : [] });
  }
  if (p === "/people/v1/people/me/connections") return send(res, 200, { connections: isBo ? [] : connections });
  if (p === "/people/v1/otherContacts") return send(res, 200, { otherContacts: isBo ? [] : otherContacts });
  if (p === "/gmail/gmail/v1/users/me/profile") return send(res, 200, { emailAddress: "ana.member@anaco.example", historyId: "123" });
  if (p === "/gmail/gmail/v1/users/me/messages") return send(res, 200, { messages: messages.map((m) => ({ id: m.id })) });
  if (p.startsWith("/gmail/gmail/v1/users/me/messages/")) {
    const m = messages.find((x) => x.id === p.split("/").pop());
    return m ? send(res, 200, m) : send(res, 404, { error: { status: "NOT_FOUND" } });
  }
  return send(res, 404, { error: "not_found" });
});
await new Promise<void>((r) => google.listen(0, "127.0.0.1", () => r()));
const BASE = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_SCAN_TEST: "1",
  RN_GOOGLE_API_TEST: BASE,
  RN_ID_SECRET: "test-id-secret-not-real",
});
for (const k of ["RN_GOOGLE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE_GMAIL", "RN_GOOGLE_GMAIL_TESTERS", "GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];

/* Every log line is kept: no token, code or secret may ever be in one. */
const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    logged.push(a.map(String).join(" "));
    if (k !== "log" || !String(a[0]).match(/^(PASS|FAIL|\n)/)) {
      /* quiet */
    }
    if (k === "log") orig(...a);
  };
}

const ANA = "tok-ana-0001";
const BO = "tok-bo-0001";
const AD = "tok-ad-0001";
const ORIGIN = "https://post.example.com";
const waitIdle = async (G: typeof import("../lib/google/index.ts"), id: string) => {
  for (let i = 0; i < 200 && G.isSyncing(id); i++) await new Promise((r) => setTimeout(r, 25));
};
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

async function main() {
  const types = await import("../lib/google/types.ts");
  const C = await import("../lib/google/compute.ts");
  const crypto = await import("../lib/google/crypto.ts");

  /* ---------- 1. pure ---------- */
  console.log("\nWarmth");
  const s1 = types.warmthScore({ meetings: 5, last: ago(9).slice(0, 10) }, NOW);
  const s2 = types.warmthScore({ meetings: 3, last: ago(60).slice(0, 10) }, NOW);
  const s3 = types.warmthScore({ emails: 41, last: ago(425).slice(0, 10) }, NOW);
  const s4 = types.warmthScore({ meetings: 1, last: ago(1000).slice(0, 10) }, NOW);
  check("recent and often: Hot", types.warmthOf(s1) === "Hot", s1);
  check("3 meetings, 2 months ago: Warm", types.warmthOf(s2) === "Warm", s2);
  check("lots of email 14 months ago: Fading", types.warmthOf(s3) === "Fading", s3);
  check("one meeting years ago: Cold", types.warmthOf(s4) === "Cold", s4);
  check("a meeting coming up warms it", types.warmthScore({ meetings: 1, upcoming: 1, last: ago(300).slice(0, 10) }, NOW) > types.warmthScore({ meetings: 1, last: ago(300).slice(0, 10) }, NOW));
  check("nothing at all is 0", types.warmthScore({}, NOW) === 0);
  check("decision makers: CEO, Founder, CRO, VP Sales, Head of Growth; not an assistant", ["CEO", "Co-founder", "CRO", "VP Sales", "Head of Growth", "Chief Financial Officer"].every(types.isDecisionMaker) && !types.isDecisionMaker("Executive Assistant to the CEO") && !types.isDecisionMaker("Account Executive"));

  console.log("\nDomains and matching");
  const own = new Set(["anaco.example"]);
  check("free mail, rooms and the member's own domain are no company", types.workDomain("a@gmail.com", own) === null && types.workDomain("r@resource.calendar.google.com", own) === null && types.workDomain("c@anaco.example", own) === null && types.workDomain("c@eu.anaco.example", own) === null && types.workDomain("d@acme.example", own) === "acme.example");
  const dir0 = C.makeDirectory([
    { id: "c1", website: "https://www.acme.example/about", name: "Acme Robotics" },
    { id: "c2", website: "brightline.example", name: "Brightline Labs" },
    { id: "c3", website: "linktr.ee/someone", name: "Twin Name" },
    { id: "c4", website: null, name: "Twin Name" },
  ]);
  check("a domain matches the website host, a subdomain its parent", C.matchDomain(dir0, "acme.example") === "c1" && C.matchDomain(dir0, "eu.acme.example") === "c1" && C.matchDomain(dir0, "notacme.example") === null);
  check("an organisation matches only by exact name, never a generic one or one two companies share", C.matchOrg(dir0, "Brightline Labs, Inc.") === "c2" && C.matchOrg(dir0, "Brightline") === null && C.matchOrg(dir0, "Consulting") === null && C.matchOrg(dir0, "Twin Name") === null);

  console.log("\nGmail headers");
  const ad = C.addresses('"Dana Example" <dana@acme.example>, lee@eu.acme.example, Bad <not-an-email>');
  check("addresses and display names from a header", ad.length === 2 && ad[0].name === "Dana Example" && ad[0].email === "dana@acme.example" && ad[1].email === "lee@eu.acme.example" && !ad[1].name, ad);
  check("bulk mail is skipped: List-Unsubscribe, noreply, auto-replies, Promotions, marketing platforms", [
    { headers: { from: "n@x.example", "list-unsubscribe": "<mailto:u@x>" } },
    { headers: { from: "noreply@x.example" } },
    { headers: { from: "do-not-reply@x.example" } },
    { headers: { from: "k@x.example", "auto-submitted": "auto-replied" } },
    { headers: { from: "p@x.example" }, labelIds: ["CATEGORY_PROMOTIONS"] },
    { headers: { from: "team@mail.mailchimpapp.com" } },
    { headers: { from: "a@x.example", precedence: "bulk" } },
  ].every((m) => C.isBulk(m)) && !C.isBulk({ headers: { from: "Pat <pat@cedar.example>" }, labelIds: ["INBOX"] }));
  check("Claude dates: a day or a month, never the future", C.cleanDate("2026-03", NOW) === "2026-03-15" && C.cleanDate("2099-01-01", NOW) === undefined && C.cleanDate("last week", NOW) === undefined);

  /* ---------- 2. tokens at rest ---------- */
  console.log("\nTokens at rest");
  const sealed = crypto.seal("REFRESH-plain-value");
  check("a sealed token opens again", crypto.unseal(sealed) === "REFRESH-plain-value");
  check("sealed, it doesn't read as the token", sealed.startsWith("g1.") && !sealed.includes("REFRESH") && crypto.seal("REFRESH-plain-value") !== sealed);
  const tampered = sealed.slice(0, -3) + (sealed.endsWith("A") ? "BBB" : "AAA");
  check("a changed one doesn't open", crypto.unseal(tampered) === null && crypto.unseal("plain") === null);
  process.env.RN_GOOGLE_TOKEN_KEY = "another-key";
  check("another key doesn't open it", crypto.unseal(sealed) === null);
  delete process.env.RN_GOOGLE_TOKEN_KEY;

  const t = await import("../lib/table.ts");
  const G = await import("../lib/google/index.ts");
  const mcp = await import("../lib/mcp/server.ts");
  const tools = await import("../lib/mcp/tools.ts");
  const member = async (id: string) => (await t.memberById(id))!;
  const toolNames = async (id: string) => Object.keys((mcp.makeServer({ member: await member(id), origin: ORIGIN }) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
  const anaView = async () => (await G.networkView(ANA)) as import("../lib/google/types.ts").NetworkView;

  /* ---------- 3. off ---------- */
  console.log("\nRN_GOOGLE off");
  check("the view says off, and nothing else", JSON.stringify(await G.networkView(ANA)) === JSON.stringify({ on: false }));
  check("Connect goes nowhere", (await G.startConnect(ANA, ORIGIN)).ok === false);
  const off = await toolNames("mem_ana");
  check("no network tools on the connector", !off.includes("save_my_network") && !off.includes("my_network") && off.includes("my_account"), off);
  check("my_account has no network line", !("your_network" in (await tools.myAccount({ member: await member("mem_ana"), origin: ORIGIN }))));

  /* ---------- 4. connect ---------- */
  console.log("\nConnect (the OAuth start and callback)");
  process.env.RN_GOOGLE = "1";
  check("on but without a client: not set up", (await G.startConnect(ANA, ORIGIN)).ok === false && (await anaView()).configured === false);
  process.env.GOOGLE_CLIENT_ID = "client-test.apps.example";
  process.env.GOOGLE_CLIENT_SECRET = "secret-test";
  check("signed out: no start", (await G.startConnect(null, ORIGIN)).ok === false);
  const st = await G.startConnect(ANA, ORIGIN);
  if (!st.ok) throw new Error("no start");
  const au = new URL(st.url);
  const scopes = (au.searchParams.get("scope") ?? "").split(" ");
  check("the consent page: Calendar and Contacts read-only, offline, include_granted_scopes, our redirect", au.origin + au.pathname === `${BASE}/accounts/o/oauth2/v2/auth` && au.searchParams.get("access_type") === "offline" && au.searchParams.get("include_granted_scopes") === "true" && au.searchParams.get("redirect_uri") === "https://post.example.com/api/integrations/google/callback" && au.searchParams.get("state") === st.state, st.url);
  check("the scopes: openid email, calendar.events.readonly, the calendar list, contacts and other contacts. No Gmail", ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/contacts.readonly", "https://www.googleapis.com/auth/contacts.other.readonly"].every((x) => scopes.includes(x)) && !scopes.some((x) => /gmail|mail\.google/.test(x)), scopes);
  const fin = (token: string | null, state: string, code: string, cookie: string | null = state, error: string | null = null) => G.finishConnect(token, { state, code, error }, cookie, ORIGIN);
  check("another browser (no cookie): refused", (await fin(ANA, st.state, "code-ana", null)).outcome === "failed");
  const st2 = await G.startConnect(ANA, ORIGIN);
  if (!st2.ok) throw new Error("no start");
  check("the state is used once", (await fin(ANA, st.state, "code-ana")).outcome === "failed");
  check("another member signed in: refused", (await fin(BO, st2.state, "code-ana")).outcome === "failed" && !(await t.loadState()).network?.mem_bo);
  const st3 = await G.startConnect(ANA, ORIGIN);
  if (!st3.ok) throw new Error("no start");
  check("Cancel at Google: denied, nothing kept", (await fin(ANA, st3.state, "", st3.state, "access_denied")).outcome === "denied" && !(await t.loadState()).network?.mem_ana);
  const st4 = await G.startConnect(ANA, ORIGIN);
  if (!st4.ok) throw new Error("no start");
  check("neither Calendar nor Contacts ticked: nothing kept, the token revoked", (await fin(ANA, st4.state, "code-none")).outcome === "scopes" && !(await t.loadState()).network?.mem_ana);
  const st5 = await G.startConnect(ANA, ORIGIN);
  if (!st5.ok) throw new Error("no start");
  const done = await fin(ANA, st5.state, "code-ana");
  check("the callback connects", done.outcome === "connected", done);
  await waitIdle(G, "mem_ana");
  const s5 = await t.loadState();
  const link = s5.network?.mem_ana?.google;
  check("the refresh token is kept sealed, with the Google email and the scopes granted", !!link && link.token.startsWith("g1.") && link.email === "ana.member@anaco.example" && link.scopes.length === 4, link);
  check("the raw token is nowhere in the state file", !stateFile().includes("REFRESH-ana") && !stateFile().includes("ACCESS-"));
  check("Calendar was asked without titles or descriptions", calls.filter((c) => c.path.includes("/events")).every((c) => !/summary|description|location|attachments/.test(c.query.get("fields") ?? "x") && /attendees\(email/.test(c.query.get("fields") ?? "")));
  check("only calendars the member owns were read, with the time window and single events", (() => {
    const cals = calls.filter((c) => c.path.includes("/events")).map((c) => decodeURIComponent(c.path.split("/")[5]));
    const q = calls.find((c) => c.path.includes("/events"))!.query;
    const from = Date.parse(q.get("timeMin")!);
    const to = Date.parse(q.get("timeMax")!);
    return cals.includes("primary") && cals.includes("team-cal@group.example") && !cals.includes("holidays@group.example") && Math.abs(NOW - from - 24 * 30.44 * DAY) < 2 * DAY && Math.abs(to - NOW - 30 * DAY) < DAY && q.get("singleEvents") === "true";
  })());

  /* ---------- 5. what the sync found ---------- */
  console.log("\nSync and matching against the fixture companies");
  const v = await anaView();
  const byName = (n: string) => v.companies.find((c) => c.name === n);
  const acme = byName("Acme Robotics");
  check("Acme by domain and subdomain, Brightline by its exact name in Contacts, Dune from other contacts, Cedar from an old meeting", !!acme && !!byName("Brightline Labs") && !!byName("Dune Analytics Co") && !!byName("Cedar Health"), v.companies.map((c) => c.name));
  check("never the member's own company, a big meeting's, a declined or cancelled one's", !byName("Anaco Advisory") && !byName("Bigroom Events") && v.companies.length === 4, v.companies.map((c) => c.name));
  check("Acme: 10 past meetings (two Acme people in one count once), 1 upcoming", acme?.meetings === 10 && acme.upcoming === 1, acme);
  const danaV = acme?.people.find((p) => p.email === "dana@acme.example");
  check("Dana: her title from Contacts (CEO), a decision maker, 10 meetings, Hot", danaV?.title === "CEO" && danaV.dm && danaV.meetings === 10 && danaV.warmth === "Hot" && acme?.warmth === "Hot" && danaV.src.includes("calendar") && danaV.src.includes("contacts"), danaV);
  check("Lee too, with his display name", acme?.people.some((p) => p.name === "Lee Example" && p.meetings === 1));
  check("Cedar, one meeting 13 months ago: Cold or Fading", ["Cold", "Fading"].includes(byName("Cedar Health")!.warmth), byName("Cedar Health"));
  check("warmest first", v.companies[0].name === "Acme Robotics");
  check("Acme over many months: a seat you might have held, nothing added", !!acme?.seat && acme.seat.from < acme.seat.to && (await t.loadState()).engagements.length === 0, acme?.seat);
  check("counts only for what matched nothing (a friend on free mail, a colleague)", v.stats.unmatched >= 1 && v.stats.real >= 1, v.stats);
  const file = stateFile();
  check("no event title, description or guest list is kept", !file.includes(SECRET_TITLE) && !file.includes("Notes we must never keep") && !file.includes("friend@gmail.com") && !file.includes("colleague@anaco.example") && !file.includes("p3@bigroom.example"));

  /* ---------- 6. named free, and private ---------- */
  console.log("\nNamed free, and only for this member");
  const acmeId = acme!.id;
  const anaTable = await t.buildView(ANA);
  const boTable = await t.buildView(BO);
  const co = (vw: typeof anaTable) => vw.companies.find((c) => c.id === acmeId)!;
  check("Acme is named for Ana free (she knows someone there)", !co(anaTable).hidden && co(anaTable).name === "Acme Robotics");
  check("still locked for Bo", co(boTable).hidden === true && !JSON.stringify(co(boTable)).includes("Acme"));
  check("Ana's credits didn't move", anaTable.me!.credits === 25);
  const seat = co(anaTable).engagements[0];
  check("its seat holder still costs the usual unlock", seat?.cells.operator?.s === "locked" && !JSON.stringify(co(anaTable)).includes("Pat Sample"), seat?.cells.operator);
  check("Bo's view has nothing of Ana's network", !JSON.stringify(boTable).includes("Dana") && !JSON.stringify(boTable).includes("dana@acme"));
  const boNet = (await G.networkView(BO)) as import("../lib/google/types.ts").NetworkView;
  check("Bo's own network is empty", boNet.on && boNet.companies.length === 0 && !boNet.google);
  const adTable = await t.buildView(AD);
  check("an admin's view and Pilot metrics carry no names or emails from it", !JSON.stringify(adTable).includes("dana@acme") && !JSON.stringify(adTable).includes("Dana Example"));
  const counts = await G.networkCounts(AD);
  check("Pilot metrics: counts only", !!counts && counts.connected === 1 && counts.matched === 4 && Object.values(counts).every((x) => typeof x === "number"), counts);
  check("members can't see Pilot metrics' counts", (await G.networkCounts(ANA)) === null);
  const exp = JSON.stringify(await t.exportState());
  check("the admin export leaves every member's network out", !exp.includes("dana@acme") && !exp.includes('"network"'));
  const on = await toolNames("mem_ana");
  check("the connector has save_my_network and my_network", on.includes("save_my_network") && on.includes("my_network"), on);
  const acc = await tools.myAccount({ member: await member("mem_ana"), origin: ORIGIN });
  check("my_account: Google connected, with the count and no people", acc.your_network === "Google connected: 4 companies you know people at" && !JSON.stringify(acc).includes("Dana"), acc.your_network);
  const accBo = await tools.myAccount({ member: await member("mem_bo"), origin: ORIGIN });
  check("Bo's my_account has no line", !("your_network" in accBo));
  const mine = await tools.myNetwork({ member: await member("mem_ana"), origin: ORIGIN });
  check("my_network: Ana's own companies with warmth, never names or emails", (mine.companies as { company: string; warmth: string }[])[0].company === "Acme Robotics" && !JSON.stringify(mine).includes("Dana") && !JSON.stringify(mine).includes("@acme"), mine);
  check("Bo's my_network is empty", (await tools.myNetwork({ member: await member("mem_bo"), origin: ORIGIN })).companies_you_know_people_at === 0);
  const radar = await import("../lib/radar/match.ts");
  const w = types.networkWarmth(await t.loadState(), "mem_ana", NOW);
  check("Crystal Ball's multiplier: warmer ranks higher, nobody known is 1", w("c_acme") === "Hot" && radar.warmthMultiplier(w("c_acme")) > radar.warmthMultiplier(w("c_cedar")) && radar.warmthMultiplier(w("c_cedar")) > 1 && radar.warmthMultiplier(w("c_fill1")) === 1 && types.networkWarmth(await t.loadState(), "mem_bo")("c_acme") === null);

  /* ---------- 7. Gmail via Claude ---------- */
  console.log("\nGmail via Claude (save_my_network)");
  const anaM = await member("mem_ana");
  const boM = await member("mem_bo");
  const save = async (m: typeof anaM, entries: unknown) => {
    try {
      return { ok: true as const, out: await tools.saveMyNetwork({ member: m, origin: ORIGIN }, { entries }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };
  const before = stateFile();
  const r1 = await save(anaM, [{ company: "cedar.example", person_name: "Pat Example", emails: 12, last_contact: ago(3).slice(0, 10), both_ways: true, subject: SECRET_SUBJECT }]);
  check("a subject refuses the whole call, and nothing is saved", !r1.ok && /never email text/.test(r1.error) && /subject/.test(r1.error) && stateFile() === before, r1);
  const r2 = await save(anaM, [{ company: "cedar.example", person_name: "Pat Example", body: "Hi Ana, here's the deck" }]);
  const r3 = await save(anaM, [{ company: "cedar.example", person_title: "Hi Ana,\nhere is what we discussed about pricing" }]);
  const r4 = await save(anaM, [{ company: "cedar.example", snippet: "quoted text" }]);
  check("a body, a snippet or text in a field: refused too", !r2.ok && !r3.ok && !r4.ok && stateFile() === before, [r2, r3, r4]);
  // A reply or forward prefix is a line of mail, however it is spelled; the same letters inside a word are not.
  const { looksLikeText } = await import("../lib/google/compute");
  const mailLines = ["Re: next steps", "RE:pricing", "re: your note", "Fwd: intro to Dana", "FW: the deck", "Fw: hello", "Fw : hello", "Pat Example Re: Q3 plan", "(fwd: see below)", "On Tuesday Pat wrote", "Subject line here", "click to unsubscribe"];
  check("a reply or forward prefix reads like email text", mailLines.every((v) => looksLikeText(v, 200)), mailLines.filter((v) => !looksLikeText(v, 200)));
  const fine = [
    "cedar.example", "https://brightline.example", "Cedar Health", "Acme Robotics, Inc.", "Pat Example", "Rae O'Example-Smith", "COO", "VP, Infrastructure: Cloud", "Head of Core: Platform", "Director of Reporting",
    "Chief Revenue Officer", "Refresh Labs", "Pre: Seed Ventures", "Software: Research and Development", "Forward Networks", "Fwd Logistics", "Rewrote Labs", "Foreword Books", "VP Sales (West)", "re-insurance lead",
  ];
  check("names, titles and domains still pass", fine.every((v) => !looksLikeText(v, 200)), fine.filter((v) => looksLikeText(v, 200)));
  const mail1 = await save(anaM, [{ company: "cedar.example", person_name: "Re: pricing follow-up" }]);
  const mail2 = await save(anaM, [{ company: "cedar.example", person_name: "Pat Example", person_title: "Fwd: intro" }]);
  const mail3 = await save(anaM, [{ company: "FW: Cedar Health renewal" }]);
  check("so save_my_network refuses one in a name, a title or a company, and nothing is saved", !mail1.ok && /reads like email text/.test(mail1.error) && !mail2.ok && !mail3.ok && stateFile() === before, [mail1, mail2, mail3]);
  check("more than 200 entries: refused", !(await save(anaM, Array.from({ length: 201 }, () => ({ company: "cedar.example" })))).ok);
  check("those refusals didn't use up a save", (await anaView()).claudeLeft === 5);
  const ok1 = await save(anaM, [
    { company: "cedar.example", person_name: "Pat Example", person_title: "COO", emails: 40, last_contact: ago(4).slice(0, 10), first_contact: "2025-01", both_ways: true, relationship: "client" },
    { company: "https://brightline.example", person_name: "Rae Example", emails: 6, last_contact: ago(30).slice(0, 10) },
    { company: "notonmerlin.example", person_name: "Nobody Here", emails: 3 },
    { company: "someone@gmail.com", emails: 3 },
    { company: "anaco.example", emails: 50 },
  ]);
  const o1 = ok1.ok ? (ok1.out as { matched: number; not_on_merlin: number; skipped: Record<string, number>; top_warm_matches: { company: string; warmth: string }[] }) : null;
  check("counts back: 2 matched, 1 not on Merlin, 2 skipped (personal and own email)", !!o1 && o1.matched === 2 && o1.not_on_merlin === 1 && o1.skipped.your_own_or_personal_email === 2, ok1);
  check("the top warm matches come back to tell the member", !!o1 && o1.top_warm_matches.length >= 4 && o1.top_warm_matches.every((x) => !!x.warmth));
  const v7 = await anaView();
  const cedar = v7.companies.find((c) => c.name === "Cedar Health")!;
  check("Cedar merges the old meeting with Claude's emails: warmer now, with both sources", cedar.src.includes("calendar") && cedar.src.includes("claude") && ["Hot", "Warm"].includes(cedar.warmth), cedar);
  check("Pat is one person: the meeting and the emails, the COO title, replies both ways", cedar.people.length === 1 && cedar.people[0].meetings === 1 && cedar.people[0].emails === 40 && cedar.people[0].both && cedar.people[0].title === "COO" && cedar.people[0].rel === "client", cedar.people);
  check("no credits either way", (await t.buildView(ANA)).me!.credits === 25);
  check("Bo never sees it", (((await G.networkView(BO)) as import("../lib/google/types.ts").NetworkView).companies.length === 0) && !JSON.stringify(await t.buildView(BO)).includes("Pat Example"));
  // The daily cap on companies named only by what Claude saved.
  const many = fillers.map((f) => ({ company: f.fields.website, person_name: "Filler Person", emails: 2 }));
  const ok2 = await save(anaM, many);
  const o2 = ok2.ok ? (ok2.out as { matched: number; skipped: Record<string, number> }) : null;
  check("at most 25 new companies a day from Claude", !!o2 && o2.matched === 25 && o2.skipped.over_todays_limit === 5, o2);
  const ok3 = await save(anaM, [{ company: "acme.example", person_name: "Dana Example", emails: 30, last_contact: ago(1).slice(0, 10), both_ways: true }]);
  check("a company already known isn't held back by the cap", ok3.ok && (ok3.out as { matched: number }).matched === 1, ok3);
  await save(anaM, [{ company: "cedar.example", emails: 1 }]);
  await save(anaM, [{ company: "cedar.example", emails: 1 }]);
  const r6 = await save(anaM, [{ company: "cedar.example", emails: 1 }]);
  check("5 saves a day, then refused", !r6.ok && /5 saves today/.test(r6.error) && (await anaView()).claudeLeft === 0, r6);
  const boSave = await save(boM, [{ company: "dune.example", person_name: "Kit Example", emails: 9, both_ways: true }]);
  check("Bo's own save is his alone", boSave.ok && !(await anaView()).companies.some((c) => c.src.includes("claude") && c.name === "Dune Analytics Co"));
  const fc = (await G.forgetClaude(ANA)) as import("../lib/google/types.ts").NetworkView;
  check("Delete what Claude saved: Claude's entries go, Calendar and Contacts stay", !fc.claude && fc.companies.length === 4 && fc.companies.every((c) => !c.src.includes("claude")) && !!fc.google && !stateFile().includes("Filler Person"), fc.companies.map((c) => [c.name, c.src]));

  /* ---------- 8. direct Gmail for test members ---------- */
  console.log("\nGmail for test members (gmail.metadata)");
  check("not offered without RN_GOOGLE_GMAIL", !(await anaView()).gmailOffered && (await G.startConnect(ANA, ORIGIN, "gmail")).ok === false);
  process.env.RN_GOOGLE_GMAIL = "1";
  process.env.RN_GOOGLE_GMAIL_TESTERS = "someone@example.net, ANA.member@anaco.example";
  const sg = await G.startConnect(ANA, ORIGIN, "gmail");
  const gq = sg.ok ? new URL(sg.url).searchParams : null;
  check("offered to a tester: gmail.metadata only, added to the same grant", (await anaView()).gmailOffered && !!gq && gq.get("scope") === "https://www.googleapis.com/auth/gmail.metadata" && gq.get("include_granted_scopes") === "true", sg);
  check("never to anyone else, even signed in and connected", (await G.startConnect(BO, ORIGIN, "gmail")).ok === false && !((await G.networkView(BO)) as { gmailOffered?: boolean }).gmailOffered);
  if (!sg.ok) throw new Error("no gmail start");
  check("the Gmail callback adds it", (await fin(ANA, sg.state, "code-gmail")).outcome === "gmail");
  await waitIdle(G, "mem_ana");
  const vg = await anaView();
  check("Gmail is connected, the main connection kept", vg.gmail?.status === "ok" && vg.google?.status === "ok", vg.gmail);
  const gmCalls = calls.filter((c) => c.path.startsWith("/gmail/gmail/v1/users/me/messages/"));
  check("headers only: format=metadata with From, To, Cc, Date and the bulk markers, never a body or a subject", gmCalls.length > 0 && gmCalls.every((c) => c.query.get("format") === "metadata" && !c.query.getAll("metadataHeaders").includes("Subject") && c.query.getAll("metadataHeaders").includes("From")));
  const st8 = await t.loadState();
  const gm = st8.network!.mem_ana.gm!;
  const gAcme = gm.companies.c_acme;
  const gDana = gAcme?.people.find((p) => p.email === "dana@acme.example");
  check("Dana: one each way, both ways, her name from the header", gDana?.sent === 1 && gDana.received === 1 && gDana.both === true && gDana.name === "Dana Example", gDana);
  check("Lee got one from Ana (a subdomain of Acme)", gAcme?.people.some((p) => p.email === "lee@eu.acme.example" && p.sent === 1 && !p.both));
  const gCedar = gm.companies.c_cedar;
  check("bulk skipped: the newsletter, noreply and Promotions; Pat's own message counts once", gCedar?.people.length === 1 && gCedar.people[0].received === 1 && gCedar.emails === 1, gCedar);
  check("an auto-reply and mail older than 24 months: skipped", !gm.companies.c_dune);
  check("no subject is kept anywhere", !stateFile().includes(SECRET_SUBJECT) && !stateFile().includes("REFRESH-gmail"));
  const vg2 = await anaView();
  check("the page shows Gmail as a source", vg2.companies.find((c) => c.name === "Acme Robotics")!.src.includes("gmail"));
  // The weekly expiry of test access.
  dead.add("REFRESH-gmail-secret");
  await G.syncMember("mem_ana");
  const vr = await anaView();
  check("invalid_grant: Gmail needs reconnecting, what it found stays", vr.gmail?.status === "reconnect" && vr.google?.status === "ok" && vr.companies.find((c) => c.name === "Acme Robotics")!.src.includes("gmail"), vr.gmail);
  const callsBefore = calls.length;
  await G.syncMember("mem_ana");
  check("it isn't asked again until reconnected", !calls.slice(callsBefore).some((c) => c.path.startsWith("/gmail")));
  check("no email is sent about it (no mail service is set up, and nothing tried)", !logged.some((l) => !/^(PASS|FAIL)/.test(l) && /email|resend/i.test(l) && /gmail/i.test(l)));
  const revokedBefore = revoked.length;
  const dg = (await G.dropGmail(ANA)) as import("../lib/google/types.ts").NetworkView;
  check("Drop Gmail: its data goes, Calendar and Contacts stay", !dg.gmail && !dg.companies.some((c) => c.src.includes("gmail")) && dg.companies.length === 4 && !(await t.loadState()).network!.mem_ana.gm);
  check("on the main client dropping Gmail doesn't revoke the shared grant", revoked.length === revokedBefore);
  check("a tester removed from the list isn't offered it", (() => {
    process.env.RN_GOOGLE_GMAIL_TESTERS = "someone@example.net";
    return true;
  })() && !(await anaView()).gmailOffered);

  /* ---------- 9. disconnect ---------- */
  console.log("\nDisconnect and delete everything");
  // Bo connects too, so deleting Ana's leaves his alone.
  const sb = await G.startConnect(BO, ORIGIN);
  if (sb.ok) await fin(BO, sb.state, "code-bo");
  await waitIdle(G, "mem_bo");
  await save(anaM, [{ company: "cedar.example", person_name: "Pat Example", emails: 2 }]).catch(() => null);
  const dc = (await G.disconnectAll(ANA)) as import("../lib/google/types.ts").NetworkView;
  const s9 = await t.loadState();
  check("revoked at Google", revoked.includes("REFRESH-ana-very-secret"), revoked);
  check("everything erased: the section is gone", !s9.network?.mem_ana && !dc.google && !dc.claude && dc.companies.length === 0);
  check("Bo's stays", !!s9.network?.mem_bo?.google);
  check("Acme is locked for Ana again", (await t.buildView(ANA)).companies.find((c) => c.id === acmeId)!.hidden === true);
  check("my_account's line is gone", !("your_network" in (await tools.myAccount({ member: await member("mem_ana"), origin: ORIGIN }))));
  check("nothing of Ana's network in the state file", !stateFile().includes("dana@acme") && !stateFile().includes("Dana Example"));

  /* ---------- off again ---------- */
  console.log("\nRN_GOOGLE off again, with data on file");
  delete process.env.RN_GOOGLE;
  await G.forgetClaude(BO).catch(() => null); // a write, so the table builds afresh
  check("nothing shows: no view, nothing named, no tools", JSON.stringify(await G.networkView(BO)) === JSON.stringify({ on: false }) && types.networkKnown(await t.loadState(), "mem_bo").size === 0 && !(await toolNames("mem_bo")).includes("my_network"));
  check("save_my_network refuses", !(await save(boM, [{ company: "dune.example" }])).ok);

  console.log("\nLogs");
  check("no token, code or secret was ever logged", !logged.some((l) => /REFRESH-|ACCESS-|secret-test|code-ana|code-gmail/.test(l)));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  google.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
