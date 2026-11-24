/**
 * Checks of Approve, then send (lib/send, RN_SEND): Merlin drafts, the member taps Approve and send,
 * and the note goes from their own Gmail.
 *
 *   npx tsx scripts/test-send.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end, and a fake Google (OAuth and Gmail) on 127.0.0.1 (RN_GOOGLE_API_TEST, honoured only with
 * RN_SCAN_TEST=1). Every person and company in them is made up.
 *
 *  1. Pure: the RFC 2822 message (UTF-8 subject words, no header from a field, In-Reply-To and
 *     References), addresses, "Tuesday 9am", the way back after Google.
 *  2. RN_SEND off: no view, no tap, no tool, the public pages as before, no Health rows.
 *  3. The first Approve and send asks Google for gmail.send only (incremental), and the note waits;
 *     back from Google (the callback route) it goes after 30 seconds, from the member's Gmail.
 *  4. Undo cancels; a double tap (and two at once) sends once.
 *  5. Who a note may go to: locked, California and unseen addresses refused; typed and own ones go.
 *  6. The daily cap of 50.
 *  7. A follow-up: scheduled, in the thread (In-Reply-To), cancelled when they replied, sent when not.
 *  8. Agents: queue_note queues a draft, never sends; no tool approves; the route refuses a bearer.
 *  9. Records, Health counts, the export, Stop sending, account closure; no token or text in a log.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { register } from "node:module";

(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-send-"));

/* ---------- the made-up seed: Jordan Avery (trial), Bo Other, Cedar and Pine Software ---------- */
const seed = {
  builtAt: iso(NOW - 30 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@averyadvisory.example", title: "Fractional CRO", token: "tok-jordan-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo.other@example.org", title: "Fractional CMO", token: "tok-bo-0001" },
  ],
  companies: [
    { id: "c_cedar", fields: { name: "Cedar and Pine Software", website: "https://www.cedarpine.example", industry: "SaaS", employees: "51–200" } },
    { id: "c_locked", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Logistics", employees: "11–50" } },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `c_fill${i}`, fields: { name: `Filler Works ${i}`, website: `fill${i}.example`, industry: "SaaS", employees: "11–50" } })),
  ],
  engagements: [],
  contacts: [
    { id: "p_dana", companyId: "c_cedar", engagementId: null, fields: { name: "Dana Whitfield", title: "CEO", relationship: "Decision maker", email: "dana@cedarpine.example", location: "Austin, TX" } },
    { id: "p_lee", companyId: "c_cedar", engagementId: null, fields: { name: "Lee Marlow", title: "COO", relationship: "Decision maker", email: "lee@cedarpine.example", location: "Denver, CO" } },
    { id: "p_cal", companyId: "c_cedar", engagementId: null, fields: { name: "Cal Rivera", title: "CFO", relationship: "Decision maker", email: "cal@cedarpine.example", location: "Oakland, California" } },
    { id: "p_hal", companyId: "c_locked", engagementId: null, fields: { name: "Hal Byrne", title: "CEO", relationship: "Decision maker", email: "hal@halcyon.example", location: "Austin, TX" } },
  ],
};
const trial = { trialStartedAt: iso(NOW - 3 * DAY), trialEndsAt: iso(NOW + 11 * DAY) };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Jordan opened Cedar and Pine, Dana's name and email, and Cal's (whom the California rule hides anyway). Lee's email and Halcyon stay locked.
    unlocks: {
      "c_cedar.identity": ["mem_jordan"],
      "p_dana.name": ["mem_jordan"],
      "p_dana.title": ["mem_jordan"],
      "p_dana.email": ["mem_jordan"],
      "p_cal.name": ["mem_jordan"],
      "p_cal.title": ["mem_jordan"],
      "p_cal.email": ["mem_jordan"],
      "p_lee.name": ["mem_jordan"],
      "p_lee.title": ["mem_jordan"],
    },
    seen: { mem_jordan: iso(NOW - DAY), mem_bo: iso(NOW - DAY) },
    profiles: { mem_jordan: { onboarded: true, function: "Sales", title: "Fractional CRO" }, mem_bo: { onboarded: true, function: "Marketing", title: "Fractional CMO" } },
    billing: { members: { mem_jordan: trial, mem_bo: trial }, events: [], payments: [], ended: [] },
  }),
);

/* ---------- the fake Google ---------- */
const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";
const SCOPE_META = "https://www.googleapis.com/auth/gmail.metadata";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString("base64url")}.y`;
const CODES: Record<string, { refresh: string; scope: string; email: string }> = {
  // Jordan already gave Gmail headers: include_granted_scopes brings them back with gmail.send.
  "code-send": { refresh: "REFRESH-send-very-secret", scope: `openid email ${SCOPE_SEND} ${SCOPE_META}`, email: "jordan@averyadvisory.example" },
  // Unticked on the consent page: no gmail.send.
  "code-nosend": { refresh: "REFRESH-nosend", scope: "openid email", email: "jordan@averyadvisory.example" },
  "code-bo": { refresh: "REFRESH-bo-send", scope: `openid email ${SCOPE_SEND}`, email: "bo.other@example.org" },
};
type Sent = { id: string; threadId: string; raw: string; text: string; at: number };
const sentMail: Sent[] = [];
const replies: { threadId: string; from: string; at: number }[] = [];
const calls: { method: string; path: string; query: string }[] = [];
const revoked: string[] = [];
const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const google = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  calls.push({ method: req.method ?? "GET", path: u.pathname, query: u.search });
  const p = u.pathname;
  if (p === "/oauth2/token") {
    const f = new URLSearchParams(raw);
    if (f.get("grant_type") === "authorization_code") {
      const c = CODES[f.get("code") ?? ""];
      if (!c || f.get("client_secret") !== "secret-test") return reply(res, 400, { error: "invalid_grant" });
      return reply(res, 200, { access_token: `ACCESS-${c.refresh}`, expires_in: 3600, refresh_token: c.refresh, scope: c.scope, id_token: idToken(c.email) });
    }
    const r = f.get("refresh_token") ?? "";
    if (!Object.values(CODES).some((c) => c.refresh === r)) return reply(res, 400, { error: "invalid_grant" });
    return reply(res, 200, { access_token: `ACCESS-${r}`, expires_in: 3600 });
  }
  if (p === "/oauth2/revoke") {
    revoked.push(new URLSearchParams(raw).get("token") ?? "");
    return reply(res, 200, {});
  }
  const auth = String(req.headers.authorization ?? "");
  if (!auth.startsWith("Bearer ACCESS-")) return reply(res, 401, { error: { status: "UNAUTHENTICATED" } });
  if (p === "/gmail/gmail/v1/users/me/messages/send" && req.method === "POST") {
    const b = JSON.parse(raw) as { raw: string; threadId?: string };
    const id = `msg${sentMail.length + 1}`;
    const threadId = b.threadId ?? `thr${sentMail.length + 1}`;
    sentMail.push({ id, threadId, raw: b.raw, text: Buffer.from(b.raw, "base64url").toString("utf8"), at: Date.now() });
    return reply(res, 200, { id, threadId, labelIds: ["SENT"] });
  }
  const mm = /^\/gmail\/gmail\/v1\/users\/me\/messages\/([\w-]+)$/.exec(p);
  if (mm) {
    const m = sentMail.find((x) => x.id === mm[1]);
    const mid = m ? /\r\nMessage-ID: (<[^>]+>)/.exec(m.text)?.[1] : null;
    return m ? reply(res, 200, { payload: { headers: [{ name: "Message-ID", value: mid }] } }) : reply(res, 404, { error: { status: "NOT_FOUND" } });
  }
  const tm = /^\/gmail\/gmail\/v1\/users\/me\/threads\/([\w-]+)$/.exec(p);
  if (tm) {
    const mine = sentMail.filter((x) => x.threadId === tm[1]).map((x) => ({ internalDate: String(x.at), labelIds: ["SENT"], payload: { headers: [{ name: "From", value: "Jordan Avery <jordan@averyadvisory.example>" }] } }));
    const theirs = replies.filter((x) => x.threadId === tm[1]).map((x) => ({ internalDate: String(x.at), labelIds: ["INBOX"], payload: { headers: [{ name: "From", value: x.from }] } }));
    return reply(res, 200, { messages: [...mine, ...theirs] });
  }
  return reply(res, 404, { error: "not_found" });
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
  RN_FREE_COMPANY: "off",
});
for (const k of ["RN_SEND", "RN_GOOGLE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE_GMAIL", "GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_WORKFLOWS"]) delete process.env[k];

/* Every log line is kept: no token, code or note text may ever be in one. */
const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    logged.push(a.map(String).join(" "));
    if (k === "log") orig(...a);
  };
}

const JORDAN = "tok-jordan-0001";
const BO = "tok-bo-0001";
const ORIGIN = "https://post.example.com";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
const BODY = "Hi Dana,\n\nI saw Cedar and Pine is growing the sales team. Would 20 minutes next week help?\n\nJordan";
const SUBJECT = "Cedar and Pine: a quick idea — ünïcode subject";

async function main() {
  const types = await import("../lib/send/types.ts");
  const mime = await import("../lib/send/mime.ts");
  const S = await import("../lib/send/index.ts");
  const t = await import("../lib/table.ts");
  const mcp = await import("../lib/mcp/server.ts");
  const { NextRequest } = await import("next/server");
  const R = await import("../app/api/send/route.ts");
  const RC = await import("../app/api/send/connect/route.ts");
  const CB = await import("../app/api/integrations/google/callback/route.ts");
  const H = await import("../lib/health.ts");
  const React = (await import("react")).default;
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const DF = await import("../app/data/DataFlows.tsx");
  const PV = await import("../app/privacy/Privacy.tsx");
  const FAQ = await import("../app/landing/faq.ts");
  const T = t.tableInternals;
  const cedar = T.pubId("c_cedar");
  const locked = T.pubId("c_locked");
  const member = async (id: string) => (await t.memberById(id))!;
  const toolNames = async (id: string) => Object.keys((mcp.makeServer({ member: await member(id), origin: ORIGIN }) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
  const toolsOf = async (id: string) => (mcp.makeServer({ member: await member(id), origin: ORIGIN }) as unknown as { _registeredTools: Record<string, { description?: string; handler?: (a: unknown, x: unknown) => Promise<{ content: { text: string }[] }> }> })._registeredTools;
  const problem = async (p: Promise<unknown>) => p.then(() => null).catch((e: Error) => e);
  const route = async (method: "GET" | "POST", body?: unknown, h: Record<string, string> = {}, token: string | null = JORDAN) => {
    const req = new NextRequest(`${ORIGIN}/api/send`, {
      method,
      headers: { ...(token ? { cookie: `rn_table=${token}` } : {}), ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN, "x-rn-tap": "1" } : {}), "x-forwarded-for": "198.51.100.7", ...h },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const draft = (over: Partial<import("../lib/send/types.ts").ApproveInput> = {}) => ({
    key: `test:${Math.random().toString(36).slice(2)}`,
    to: "dana@cedarpine.example",
    toName: "Dana Whitfield",
    subject: SUBJECT,
    body: BODY,
    kind: "record" as const,
    company: cedar,
    effect: { type: "pipeline.sent" as const, companyId: cedar, from: "record" as const, channel: "email" as const, to: { name: "Dana Whitfield", role: "CEO" } },
    ...over,
  });
  const box = () => (JSON.parse(stateFile()) as { outbox?: Record<string, { grant?: { token: string; scopes: string[] }; items: { id: string; status: string; to: string; sentAt: string | null; body: string | null; subject: string | null; gmailId?: string | null; threadId?: string | null; messageId?: string | null; inReplyTo?: string | null; key: string }[]; sent: string[] }> }).outbox?.mem_jordan;

  /* ---------- 1. pure ---------- */
  console.log("\nThe message (RFC 2822)");
  const m1 = mime.rfc2822({ to: "dana@cedarpine.example", toName: "Dana Whitfield", from: "jordan@averyadvisory.example", fromName: "Jordan Avery", subject: SUBJECT, body: "Line one\nLine two ünï", messageId: "<rn.a@merlin.example>", inReplyTo: "<prev@x.example>", references: ["<first@x.example>", "<prev@x.example>"] });
  const [head, tail] = m1.split("\r\n\r\n");
  check("UTF-8 subject as RFC 2047 encoded words that decode back", /^Subject: =\?UTF-8\?B\?/m.test(head) && head.split(/\r\n(?! )/).find((l) => l.startsWith("Subject:"))!.replace(/^Subject: /, "").split(/\r\n /).map((w) => Buffer.from(/=\?UTF-8\?B\?([^?]+)\?=/.exec(w)![1], "base64").toString("utf8")).join("") === SUBJECT, head);
  check("To and From with the names, plain text UTF-8 in base64", /^To: "Dana Whitfield" <dana@cedarpine\.example>$/m.test(head) && /^From: "Jordan Avery" <jordan@averyadvisory\.example>$/m.test(head) && /Content-Type: text\/plain; charset="UTF-8"/.test(head) && Buffer.from(tail.replace(/\s+/g, ""), "base64").toString("utf8") === "Line one\r\nLine two ünï");
  check("In-Reply-To and References for a note in a thread Merlin started", /^In-Reply-To: <prev@x\.example>$/m.test(head) && /^References: <first@x\.example> <prev@x\.example>$/m.test(head) && /^Message-ID: <rn\.a@merlin\.example>$/m.test(head));
  const inj = mime.rfc2822({ to: "dana@cedarpine.example\r\nBcc: spy@evil.example", toName: "Dana\r\nBcc: spy@evil.example", subject: "Hello\r\nBcc: spy@evil.example", body: "x", messageId: "<a@b>" });
  check("no field adds a header (line breaks are flattened)", !/^Bcc:/m.test(inj.split("\r\n\r\n")[0]), inj.split("\r\n\r\n")[0]);
  check("addresses: one @, a dotted domain, no spaces", types.cleanAddress(" Dana@CedarPine.example ") === "dana@cedarpine.example" && !types.cleanAddress("dana@cedarpine") && !types.cleanAddress("da na@x.example") && !types.cleanAddress("a@b..example") && !types.cleanAddress(""));
  const fri = new Date(2026, 10, 27, 15, 0); // a Friday
  check("Two working days from a Friday is Tuesday 9am", types.whenWords(types.workMorning(fri.getTime(), 2)) === "Tuesday 9am", types.whenWords(types.workMorning(fri.getTime(), 2)));
  check("the way back after Google is a page of this site only", S.cleanBack("/?p=messages") === "/?p=messages" && S.cleanBack("//evil.example") === "/?p=messages" && S.cleanBack("https://evil.example") === "/?p=messages" && S.cleanBack("/api/send") === "/?p=messages" && S.cleanBack("/?p=today#x") === "/?p=today");

  /* ---------- 2. off ---------- */
  console.log("\nRN_SEND off");
  process.env.RN_GOOGLE = "1";
  process.env.GOOGLE_CLIENT_ID = "client-test.apps.example";
  process.env.GOOGLE_CLIENT_SECRET = "secret-test";
  check("off: sendOn says no", S.sendOn() === false);
  const offGet = await route("GET");
  check("off: GET /api/send answers an empty view (no 404 for a page to log)", offGet.status === 200 && offGet.j.view === null, offGet);
  check("off: every POST is 404", (await route("POST", { op: "approve", draft: draft() })).status === 404 && (await route("POST", { op: "revoke" })).status === 404);
  check("off: approve refuses on the server too", !!(await problem(S.approve(JORDAN, draft()))));
  check("off: the connector has no queue_note", !(await toolNames("mem_jordan")).includes("queue_note"));
  check("off: the connector still says Merlin never sends", /Merlin never sends a note for a member/.test(String((mcp.makeServer({ member: await member("mem_jordan"), origin: ORIGIN }) as unknown as { server: { _instructions?: string } }).server._instructions ?? mcp.INSTRUCTIONS)));
  check("off: /data and /privacy name no send permission", !renderToStaticMarkup(React.createElement(DF.DataFlows)).includes("gmail.send") && !renderToStaticMarkup(React.createElement(PV.PrivacyView, { support: null })).includes("Approve and send"));
  check("off: no FAQ about sending", !FAQ.faqItems(25, false, undefined, { google: true }).some(([q]) => /send email for me/.test(q)));
  check("off: no Health rows", H.sendRows(await t.loadState(), NOW).length === 0);
  check("off: the scheduler's tick does nothing", (await S.sendTick()) === 0);

  /* ---------- 3. on: the first tap asks Google, then it sends ---------- */
  console.log("\nThe first Approve and send");
  process.env.RN_SEND = "1";
  check("on: sendOn", S.sendOn());
  const v0 = await S.sendView(JORDAN);
  check("on: the view, not granted yet, 0 of 50 today", v0.on && !v0.granted && v0.today === 0 && v0.cap === 50 && v0.items.length === 0);
  check("on: the connector has queue_note and the line that Merlin sends only what the member approves", (await toolNames("mem_jordan")).includes("queue_note"));
  check("on: /data and /privacy list gmail.send and what it is for", renderToStaticMarkup(React.createElement(DF.DataFlows, { send: true })).includes("gmail.send") && /Merlin sends only what you approve, from your own Gmail/.test(renderToStaticMarkup(React.createElement(PV.PrivacyView, { support: null, send: true }))));
  check("on: the FAQ says Merlin sends only what you approve", FAQ.faqItems(25, false, undefined, { google: true, send: true }).some(([q, a]) => /send email for me/.test(q) && a.startsWith("Merlin sends only what you approve, from your own Gmail.") && !a.includes("—")));
  const d1 = draft({ key: "move:cedar:1" });
  const a1 = await S.approve(JORDAN, d1);
  check("the first tap: the note waits on Google's permission, with the address to ask it", a1.item.status === "grant" && a1.grant === `/api/send/connect?d=${encodeURIComponent(a1.item.id)}` && !a1.again, a1);
  check("nothing went to Gmail yet", sentMail.length === 0);
  const g1 = await S.startGrant(JORDAN, a1.item.id, "/?p=today", ORIGIN);
  const gu = new URL(g1.url);
  const scopes = (gu.searchParams.get("scope") ?? "").split(" ");
  check("the consent page asks for gmail.send only (and sign-in), incremental, offline", gu.origin + gu.pathname === `${BASE}/accounts/o/oauth2/v2/auth` && scopes.length === 3 && scopes.includes(SCOPE_SEND) && scopes.includes("openid") && scopes.includes("email") && gu.searchParams.get("include_granted_scopes") === "true" && gu.searchParams.get("access_type") === "offline" && gu.searchParams.get("redirect_uri") === `${ORIGIN}/api/integrations/google/callback` && gu.searchParams.get("login_hint") === "jordan@averyadvisory.example", g1.url);
  check("never a read scope for message text", !scopes.some((x) => /gmail\.(readonly|modify|compose)|mail\.google\.com/.test(x)));
  // The connect route: a cookie with the state, then Google.
  const rcRes = await (RC.GET as (r: unknown) => Promise<Response>)(new NextRequest(`${ORIGIN}/api/send/connect?d=${a1.item.id}&back=${encodeURIComponent("/?p=today")}`, { headers: { cookie: `rn_table=${JORDAN}`, "x-forwarded-for": "198.51.100.7" } }));
  const setCookie = rcRes.headers.get("set-cookie") ?? "";
  const st2 = /rn_send_state=([^;]+)/.exec(setCookie)?.[1] ?? "";
  check("GET /api/send/connect: to Google, with a one-time state in an httpOnly cookie", rcRes.status === 302 && (rcRes.headers.get("location") ?? "").startsWith(`${BASE}/accounts/`) && !!st2 && /HttpOnly/i.test(setCookie), { status: rcRes.status, setCookie });
  const cb = (q: string, cookie: string) => (CB.GET as (r: unknown) => Promise<Response>)(new NextRequest(`${ORIGIN}/api/integrations/google/callback?${q}`, { headers: { cookie, "x-forwarded-for": "198.51.100.7" } }));
  const wrong = await cb(`state=${encodeURIComponent(g1.state)}&code=code-send`, `rn_table=${JORDAN}; rn_send_state=not-this-one`);
  check("back from Google with another browser's state: nothing kept", (wrong.headers.get("location") ?? "").includes("#rn-send=sendfailed") && !box()?.grant);
  const back = await cb(`state=${encodeURIComponent(st2)}&code=code-send&scope=${encodeURIComponent(SCOPE_SEND)}`, `rn_table=${JORDAN}; rn_send_state=${st2}`);
  const loc = back.headers.get("location") ?? "";
  check("back from Google: to the page it was approved on, and it sends", back.status === 303 && loc === `${ORIGIN}/?p=today#rn-send=send.${a1.item.id}`, loc);
  const b1 = box()!;
  const it1 = b1.items.find((x) => x.id === a1.item.id)!;
  check("the permission is kept sealed: never the refresh token in the state", !!b1.grant && b1.grant.scopes.includes(SCOPE_SEND) && b1.grant.token.startsWith("g1.") && !stateFile().includes("REFRESH-send-very-secret"));
  check("the note now has its 30 seconds to undo", it1.status === "queued");
  check("before the 30 seconds: nothing sent", (await S.sendDue(Date.now() + 5_000, "mem_jordan")) === 0 && sentMail.length === 0);
  const n1 = await S.sendDue(Date.now() + 31_000, "mem_jordan");
  check("after the 30 seconds: sent from Jordan's Gmail, once", n1 === 1 && sentMail.length === 1, { n1, sent: sentMail.length });
  const m0 = sentMail[0]?.text ?? "";
  check("what Gmail got: To, From, the UTF-8 subject, the note as approved", /\r\nTo: "Dana Whitfield" <dana@cedarpine\.example>\r\n/.test(m0) && /^From: "Jordan Avery" <jordan@averyadvisory\.example>/m.test(m0) && /\r\nSubject: =\?UTF-8\?B\?/.test(m0) && Buffer.from(m0.split("\r\n\r\n")[1].replace(/\s+/g, ""), "base64").toString("utf8") === BODY.replace(/\n/g, "\r\n"));
  const s1 = box()!.items.find((x) => x.id === a1.item.id)!;
  check("recorded: sent, Gmail's message id, the text gone", s1.status === "sent" && s1.gmailId === "msg1" && s1.body === null && !!s1.threadId);
  const v1 = await S.sendView(JORDAN);
  check("the member's view: granted, 1 of 50 today, shown as sent", v1.granted && v1.today === 1 && v1.items[0].status === "sent" && v1.items[0].companyName === "Cedar and Pine Software" && v1.from === "jordan@averyadvisory.example");
  const pipe = (await t.loadState()).pipeline?.mem_jordan?.entries.find((e) => e.companyId === "c_cedar");
  check("and it did what Mark as sent does: Cedar and Pine in the pipeline at Sent", pipe?.stage === "sent", pipe);
  check("Gmail was asked for the Message-ID header only (metadata), never a message's text", calls.filter((c) => c.path.includes("/messages/msg")).every((c) => /format=metadata/.test(c.query) && /metadataHeaders=Message-ID/.test(c.query)) && !calls.some((c) => /format=(full|raw)/.test(c.query)));

  /* ---------- 4. undo, double tap ---------- */
  console.log("\nUndo and the double tap");
  const a2 = await S.approve(JORDAN, draft({ key: "undo:1" }));
  check("granted now: the next tap goes straight to its 30 seconds", a2.item.status === "queued" && a2.grant === null);
  const c2 = await S.cancel(JORDAN, a2.item.id);
  check("Undo: cancelled, the words say nothing was sent", c2.message === types.WORDS.undone && box()!.items.find((x) => x.id === a2.item.id)!.status === "cancelled");
  check("after Undo nothing goes, and the text is gone", (await S.sendDue(Date.now() + 40_000, "mem_jordan")) === 0 && sentMail.length === 1 && box()!.items.find((x) => x.id === a2.item.id)!.body === null);
  check("Undo once Gmail has it: refused in words", /went already/.test(String((await problem(S.cancel(JORDAN, a1.item.id)))?.message)));
  const before = sentMail.length;
  const dd = draft({ key: "double:1" });
  const [x1, x2] = await Promise.all([S.approve(JORDAN, dd), S.approve(JORDAN, dd)]);
  const x3 = await S.approve(JORDAN, dd);
  check("a double tap (two at once, then a third): one note", x1.item.id === x2.item.id && x2.item.id === x3.item.id && (x1.again || x2.again) && x3.again && box()!.items.filter((x) => x.key === "double:1").length === 1);
  await Promise.all([S.sendDue(Date.now() + 31_000, "mem_jordan"), S.sendDue(Date.now() + 31_000, "mem_jordan"), S.sendDue(Date.now() + 31_000)]);
  check("and it goes once, whatever sends at the same moment", sentMail.length === before + 1, sentMail.length - before);
  const again = await S.approve(JORDAN, dd);
  check("tapping the sent note again sends nothing", again.again && again.item.status === "sent" && (await S.sendDue(Date.now() + 31_000, "mem_jordan")) === 0);

  /* ---------- 5. who it may go to ---------- */
  console.log("\nWho a note may go to");
  const why = async (to: string) => (await problem(S.approve(JORDAN, draft({ to }))))?.message ?? null;
  check("a person whose email is still locked for the member: refused", (await why("lee@cedarpine.example")) === types.WORDS.locked);
  check("a person at a company still locked: refused", (await why("hal@halcyon.example")) === types.WORDS.locked);
  check("a person the California rule hides, even unlocked: refused", (await why("cal@cedarpine.example")) === types.WORDS.hidden);
  check("an address that doesn't look right, or none: refused in words", (await why("dana@cedarpine")) === types.WORDS.badAddress && (await why("")) === types.WORDS.noAddress);
  check("an address the member typed that is on no record: it goes", (await why("pat@friendly.example")) === null);
  check("the address they unlocked: it goes", (await why("DANA@cedarpine.example")) === null);
  await T.mutate((d) => {
    (d.network ??= {})["mem_jordan"] = { con: { companies: {}, loose: [{ email: "lee@cedarpine.example", name: "Lee Marlow" }] } } as never;
  });
  check("an address from the member's own contacts: it goes, even where Merlin's copy is locked", (await why("lee@cedarpine.example")) === null);
  check("Bo never sees or cancels Jordan's notes", (await S.sendView(BO)).items.length === 0 && /isn't in your outbox/.test(String((await problem(S.cancel(BO, a1.item.id)))?.message)));
  // Clear the queue left by the checks above (they were approved): Undo each.
  for (const x of box()!.items.filter((y) => y.status === "queued" || y.status === "grant")) await S.cancel(JORDAN, x.id);

  /* ---------- 6. the daily cap ---------- */
  console.log("\nThe daily cap");
  await T.mutate((d) => {
    const b = (d as unknown as { outbox: Record<string, { sent: string[] }> }).outbox.mem_jordan;
    b.sent = Array.from({ length: 49 }, () => iso(Date.now() - 3_600_000));
  });
  const last = await S.approve(JORDAN, draft({ key: "cap:50" }));
  check("the 50th in 24 hours is taken", last.item.status === "queued");
  check("the 51st is refused in words (the 50th waiting counts)", (await problem(S.approve(JORDAN, draft({ key: "cap:51" }))))?.message === types.WORDS.cap);
  await S.sendDue(Date.now() + 31_000, "mem_jordan");
  check("at 50 a note already queued is held, never sent", (await (async () => {
    await T.mutate((d) => {
      const b = (d as unknown as { outbox: Record<string, { items: { status: string; sendAt: string | null; key: string }[] }> }).outbox.mem_jordan;
      b.items.push({ ...b.items.find((x) => x.key === "cap:50")!, id: "sdcapheld", key: "cap:held", status: "queued", sendAt: iso(Date.now()) } as never);
    });
    const n = sentMail.length;
    await S.sendDue(Date.now() + 1000, "mem_jordan");
    return sentMail.length === n && box()!.items.find((x) => x.id === "sdcapheld")!.status === "held";
  })()));
  await T.mutate((d) => {
    const b = (d as unknown as { outbox: Record<string, { sent: string[]; items: { id: string }[] }> }).outbox.mem_jordan;
    b.sent = [];
    b.items = b.items.filter((x) => x.id !== "sdcapheld");
  });

  /* ---------- 7. follow-ups ---------- */
  console.log("\nFollow-ups");
  // The note a follow-up joins: the latest one Merlin sent to Dana with that subject.
  const first = box()!.items.filter((x) => x.status === "sent" && x.to === "dana@cedarpine.example").sort((x, y) => Date.parse(y.sentAt ?? "") - Date.parse(x.sentAt ?? ""))[0];
  const pipeId = (await t.loadState()).pipeline!.mem_jordan.entries.find((e) => e.companyId === "c_cedar")!.id;
  const at = iso(Date.now() + 2 * DAY);
  const fu = await S.approve(JORDAN, { key: "fu:1", to: "dana@cedarpine.example", toName: "Dana Whitfield", subject: `Re: ${SUBJECT}`, body: "Hi Dana, just bringing this back up. Jordan", kind: "followup", company: cedar, pipelineId: pipeId, effect: { type: "pipeline.followed", id: pipeId }, at });
  check("approved when created, scheduled for its time, in the thread of the first note", fu.item.status === "scheduled" && fu.item.sendAt === at && fu.item.threaded);
  check("not before its time", (await S.sendDue(Date.now() + DAY, "mem_jordan")) === 0);
  replies.push({ threadId: first.threadId!, from: "Dana Whitfield <dana@cedarpine.example>", at: Date.now() + DAY });
  const sentBefore = sentMail.length;
  await S.sendDue(Date.parse(at) + 1000, "mem_jordan");
  const fuRec = box()!.items.find((x) => x.id === fu.item.id)!;
  check("Dana replied in the thread: the follow-up is cancelled, not sent", fuRec.status === "replied" && sentMail.length === sentBefore && fuRec.body === null, fuRec);
  const inbox = JSON.stringify((await t.loadState() as unknown as { inbox?: Record<string, unknown> }).inbox?.mem_jordan ?? "");
  check("and the member is told", inbox.includes("Dana replied, so Merlin didn't send your follow-up."));
  check("the reply check read the From line and time only", calls.some((c) => c.path.includes("/threads/") && /format=metadata/.test(c.query) && /metadataHeaders=From/.test(c.query)) && !calls.some((c) => c.path.includes("/threads/") && !/format=metadata/.test(c.query)));
  replies.length = 0;
  const at2 = iso(Date.now() + 3 * DAY);
  const fu2 = await S.approve(JORDAN, { key: "fu:2", to: "dana@cedarpine.example", toName: "Dana Whitfield", subject: `Re: ${SUBJECT}`, body: "Hi Dana, one more nudge. Jordan", kind: "followup", company: cedar, pipelineId: pipeId, effect: { type: "pipeline.followed", id: pipeId }, at: at2 });
  await S.sendDue(Date.parse(at2) + 1000, "mem_jordan");
  const sent2 = sentMail[sentMail.length - 1];
  check("no reply: it goes at its time, in the same Gmail thread with In-Reply-To and References", box()!.items.find((x) => x.id === fu2.item.id)!.status === "sent" && sent2.threadId === first.threadId && sent2.text.includes(`\r\nIn-Reply-To: ${first.messageId}\r\n`) && new RegExp(`\\r\\nReferences: [^\\r]*${first.messageId!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r\\n`).test(sent2.text), { thread: sent2?.threadId, mid: first.messageId });
  check("a follow-up time outside the next 30 days is refused", !!(await problem(S.approve(JORDAN, draft({ key: "fu:far", at: iso(Date.now() + 40 * DAY) })))));

  /* ---------- 8. agents ---------- */
  console.log("\nAgents queue, never send");
  const tools = await toolsOf("mem_jordan");
  const names = Object.keys(tools);
  check("no tool approves, schedules or sends a note", !names.some((n) => /approve|send_note|send_email|send_message|undo/.test(n)), names.filter((n) => /send|approve/.test(n)));
  check("queue_note's description says it never sends and only the member's tap does", /It never sends/.test(tools.queue_note.description ?? "") && /No tool can approve, schedule or send a note/.test(tools.queue_note.description ?? ""));
  const instr = String((mcp.makeServer({ member: await member("mem_jordan"), origin: ORIGIN }) as unknown as { server: { _instructions?: string } }).server._instructions ?? "");
  check("the connector's instructions say Merlin sends only on the member's tap", /Merlin sends a note only when the member taps Approve and send in the Merlin app/.test(instr) && !/Merlin never sends a note for a member/.test(instr));
  const q = await tools.queue_note.handler!({ to: "dana@cedarpine.example", to_name: "Dana Whitfield", subject: "From my assistant", body: "Hi Dana, a note my assistant drafted.", company_id: cedar }, {});
  const qj = JSON.parse(q.content[0].text) as { queued?: boolean; sent?: boolean; note_id?: string };
  const queued = box()!.items.find((x) => x.id === qj.note_id);
  check("queue_note: a draft waiting for the member, sent false", qj.queued === true && qj.sent === false && queued?.status === "draft");
  const n8 = sentMail.length;
  await S.sendDue(Date.now() + 10 * DAY);
  check("a queued draft never goes on its own", sentMail.length === n8 && box()!.items.find((x) => x.id === qj.note_id)!.status === "draft");
  const qlock = await tools.queue_note.handler!({ to: "hal@halcyon.example", subject: "x", body: "y" }, {});
  check("queue_note to a locked address: refused", /haven't opened/.test(qlock.content[0].text));
  check("the route refuses a bearer token (an agent), GET and POST", (await route("POST", { op: "approve", draft: { ...draft(), id: qj.note_id } }, { authorization: "Bearer mcp-token" })).status === 403 && (await route("GET", undefined, { authorization: "Bearer mcp-token" })).status === 403);
  check("a POST from another site, or without the app's header, is refused", (await route("POST", { op: "approve", draft: draft() }, { origin: "https://evil.example" })).status === 403 && (await route("POST", { op: "approve", draft: draft() }, { "x-rn-tap": "0" })).status === 403);
  check("signed out: 401", (await route("GET", undefined, {}, null)).status === 401);
  const ap = await route("POST", { op: "approve", draft: { ...draft({ key: queued!.key, subject: "From my assistant", body: "Hi Dana, a note my assistant drafted, as I edited it." }), id: qj.note_id } });
  check("the member approves the agent's note in the app: it goes after their tap", ap.status === 200 && (ap.j.item as { status: string }).status === "queued");
  await route("POST", { op: "cancel", id: qj.note_id });
  check("and the member can Undo it over the route too", box()!.items.find((x) => x.id === qj.note_id)!.status === "cancelled");

  /* ---------- 9. records, Health, export, stop, closure ---------- */
  console.log("\nRecords and privacy");
  const rows = H.sendRows(await t.loadState(), Date.now());
  const rowsJ = JSON.stringify(rows);
  check("Health: counts only (sent, members, undone, replied)", rows.find((r) => /sent from members' Gmail, 30 days/.test(r.label))?.n === 4 && rows.find((r) => /gave Merlin permission/.test(r.label))?.n === 1 && rows.find((r) => /held back on a reply/.test(r.label))?.n === 1 && !/dana|cedar|jordan|@/i.test(rowsJ), rows);
  const ex = JSON.stringify(await t.exportState());
  check("the export never carries an outbox", !ex.includes("outbox") && !ex.includes("dana@cedarpine.example"));
  check("no token, code or note text in any log line", !logged.some((l) => /REFRESH-|ACCESS-|code-send|Would 20 minutes|one more nudge/.test(l)), logged.filter((l) => /REFRESH-|ACCESS-|code-send|Would 20 minutes|one more nudge/.test(l)));
  const sv = JSON.stringify(await S.sendView(JORDAN));
  check("a sent note's text is not kept (only while it waits)", !sv.includes("Would 20 minutes") && !stateFile().includes("Would 20 minutes"));
  const stop = await route("POST", { op: "revoke" });
  check("Stop sending from my Gmail: the permission goes, here and at Google", stop.status === 200 && !box()!.grant && revoked.includes("REFRESH-send-very-secret") && (stop.j.view as { granted: boolean }).granted === false);
  const after = await S.approve(JORDAN, draft({ key: "after-stop" }));
  check("after Stop, the next tap asks Google again", after.item.status === "grant" && !!after.grant);
  const no = await S.startGrant(JORDAN, after.item.id, "/?p=messages", ORIGIN);
  const cookie = no.state;
  const unticked = await S.finishGrant(JORDAN, { state: no.state, code: "code-nosend", error: null }, cookie, ORIGIN);
  check("Google gave no gmail.send (unticked): nothing kept, the member is told", unticked.outcome === "senddenied" && !box()!.grant);
  const denied = await S.startGrant(JORDAN, after.item.id, "/?p=messages", ORIGIN);
  check("the member said no at Google: senddenied, nothing kept", (await S.finishGrant(JORDAN, { state: denied.state, code: null, error: "access_denied" }, denied.state, ORIGIN)).outcome === "senddenied" && !box()!.grant);
  const edited = await S.approve(JORDAN, draft({ key: "after-stop", body: "Hi Dana, the note as I changed it after saying no at Google." }));
  check("tapping again after saying no at Google: the same note, as it reads now, asks again", edited.item.id === after.item.id && edited.item.status === "grant" && !!edited.grant && box()!.items.find((x) => x.id === after.item.id)!.body === "Hi Dana, the note as I changed it after saying no at Google.");
  const bo = await S.startGrant(JORDAN, after.item.id, "/?p=messages", ORIGIN);
  check("another member coming back with Jordan's state: refused", (await S.finishGrant(BO, { state: bo.state, code: "code-bo", error: null }, bo.state, ORIGIN)).outcome === "sendfailed");
  await T.mutate((d, sd) => T.purgeMember(d, sd, "mem_jordan", iso(Date.now())));
  check("closing the account deletes the outbox", !box());

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => {
    failed++;
    process.stderr.write(`FAIL the run stopped: ${e instanceof Error ? e.stack : String(e)}\n`);
  })
  .finally(() => {
    google.close();
    rmSync(dir, { recursive: true, force: true });
    if (failed) process.stdout.write(`${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  });
