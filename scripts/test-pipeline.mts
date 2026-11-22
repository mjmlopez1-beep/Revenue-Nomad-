/**
 * Checks of Your pipeline (lib/pipeline.ts, lib/pipelineActions.ts, lib/pipelineNote.ts): Merlin
 * moves each member's deals by what it sees, and the member moves any deal to any stage by hand.
 *
 *   npx tsx scripts/test-pipeline.mts      exits 1 on any failure
 *
 * No server and no network: lib/table.ts runs in process on a made-up seed in a temporary data
 * folder, removed at the end, with a fake Google API on 127.0.0.1 (RN_GOOGLE_API_TEST, honoured only
 * with RN_SCAN_TEST=1). Every person and company is made up.
 *
 * Covered:
 *   - the rules, pure: business days, stages and what moves them, a note used twice, follow-ups,
 *     Went quiet (after the follow-ups, and after 30 days), corrections, reopen, the proposal hook,
 *     due follow-ups and their words, the month's value, the seat's answers, outcomeStats;
 *   - Mark as sent: the move leaves today's moves, the company is in the pipeline at Sent with a
 *     follow-up in 3 business days, Undo takes both back; from every kind of move (moveSent: the buyer way in, named only once unlocked, a reply to an open role to the buyer, someone they know or its hiring team), today's moves and the record's buyer note alike; Merlin's own messages and invites open
 *     entries, a reply on Merlin moves to Replied;
 *   - detection from fake Google metadata: a new email out to a Crystal Ball company opens an entry
 *     (one outside it doesn't), an email in after Sent is Replied, a meeting booked ahead is Meeting,
 *     a correction sets the signal aside until a newer one; no Gmail: Sent from Merlin, Meeting
 *     from the calendar, and the page says what Gmail would add;
 *   - no subject, message text, meeting title or description is asked for, read into the state,
 *     or shown in a view or the connector;
 *   - follow-ups due on Home, followed, snoozed, Not now and reopened;
 *   - privacy: another member can't read or change an entry, nothing leaks into their view, the
 *     shared table or the export, and the connector never names a person from Google;
 *   - Won: the proposal hook, the terms, Add it as your seat prefilled (credits as usual), the seat
 *     confirmed by the win, and a seat added at an open deal is itself the win;
 *   - intros: asked in a conversation, seen and marked made by the other member, credited on the win;
 *   - the connector: my_pipeline, and update_pipeline (move to a stage, Lost, Not now, reopen, notes);
 *   - the logic probe's scenarios (a past seat added later is no win, Reopen and Not a win on a
 *     Won, an out-of-office reply taken back, a route never sent), Move to by hand on every stage,
 *     and a member without Gmail: never Went quiet by itself, "Did they reply by email?" instead;
 *   - deleting what came from Google: Disconnect and delete everything leaves no name, email or
 *     title from the fake Google anywhere in the state, removes the entry only Gmail opened and
 *     keeps every entry she acted on at its stage and dates; access removed at Google (Gmail's
 *     own, then the whole grant) keeps everything 29 days and deletes it at 30, the clock injected.
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const today = iso(0).slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-pipeline-"));

/* ---------- the made-up seed ---------- */
const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } });
const companies = [
  co("c_lark", "Larkfield Robotics", "lark.example"),
  co("c_corv", "Corvid Health", "corvid.example"),
  co("c_dune", "Dune Analytics", "dune.example"),
  co("c_outr", "Outerbank Tools", "outer.example"),
  co("c_salt", "Saltmarsh Energy", "saltmarsh.example"),
  co("c_tall", "Tallgrass Analytics", "tallgrass.example"),
  co("c_pine", "Pinecrest Logistics", "pinecrest.example"),
  co("c_copp", "Copperleaf Kitchens", "copperleaf.example"),
  co("c_harb", "Harborline Pay", "harborline.example"),
  co("c_bfin", "Bluefin Freight", "bluefin.example"),
];
const monthAgo = (n: number) => {
  const d = new Date(NOW);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const seat = (id: string, companyId: string, fields: Record<string, string>, extra: Record<string, unknown> = {}) => ({ id, companyId, verified: false, fields: { type: "Fractional", status: "Active", end: "Ongoing", start: monthAgo(3), ...fields }, ...extra });
const engagements = [
  seat("e_salt", "c_salt", { source: "Member success story", role: "Fractional CRO", function: "Sales", operator: "Hana Holder" }),
  seat("e_tall", "c_tall", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", operator: "Pella Quist" }, { holderFrom: "public profile" }),
  seat("e_pine", "c_pine", { source: "Member success story", role: "Fractional COO", function: "Operations", operator: "Cy Introducer" }),
  ...["c_lark", "c_corv", "c_dune", "c_outr", "c_copp", "c_harb", "c_bfin"].map((c) => seat(`e_${c.slice(2)}_cro`, c, { source: "Member success story", role: "Fractional CRO", function: "Sales" })),
];
const member = (id: string, name: string, email: string) => ({ id, name, email, title: "Fractional Head of RevOps", token: `tok-${id.slice(4)}-pipe` });
const members = [
  member("mem_ana", "Ana Member", "ana.member@anaco.example"),
  member("mem_bo", "Bo Other", "bo.other@example.org"),
  member("mem_han", "Hana Holder", "hana@holderco.example"),
  member("mem_cy", "Cy Introducer", "cy@introco.example"),
  { id: "mem_ad", name: "Ada Admin", email: "ada.admin@example.com", title: "Admin", token: "tok-ad-pipe" },
];
const seed = { builtAt: iso(-60 * DAY), members, companies, engagements, contacts: [] };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

/** One kept Crystal Ball row (lib/radar/types.ts RadarSentRow). */
const row = (m: string, c: string) => ({ k: `t:${m}:${c}`, c, kind: "adjacent", l: "Hired a fractional CRO 2 months ago · Sales usually comes before RevOps", b: "High", w: "Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months" });
const BALL = ["c_lark", "c_corv", "c_dune", "c_salt", "c_tall", "c_pine", "c_copp", "c_harb"];
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-HOUR)])),
    profiles: Object.fromEntries(members.map((m) => [m.id, { function: "RevOps", onboarded: true, icp: { industries: [], employees: [], revenue: [], countries: [] } }])),
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: { mem_ana: { sent: {}, days: { [today]: BALL.map((c) => row("mem_ana", c)) } }, mem_bo: { sent: {}, days: { [today]: ["c_bfin", "c_lark"].map((c) => row("mem_bo", c)) } } },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

/* ---------- the fake Google ---------- */
const SECRET_TITLE = "Secret board meeting about the merger";
const SECRET_DESC = "Agenda we must never keep";
const SECRET_SUBJECT = "Top secret pricing for next year";
const SECRET_BODY = "The body of an email Merlin never reads";
const ANA_MAIL = "ana.member@anaco.example";
const ev = (ms: number, who: { email: string; displayName?: string }[], self = ANA_MAIL) => ({
  status: "confirmed",
  summary: SECRET_TITLE,
  description: SECRET_DESC,
  location: "A secret room",
  start: { dateTime: iso(ms) },
  attendees: [{ email: self, self: true, responseStatus: "accepted" }, ...who],
});
const msg = (id: string, ms: number, headers: Record<string, string>, labelIds: string[] = ["INBOX"]) => ({
  id,
  internalDate: String(NOW + ms),
  labelIds,
  snippet: SECRET_BODY,
  payload: { headers: Object.entries({ Subject: SECRET_SUBJECT, ...headers }).map(([name, value]) => ({ name, value })), body: { data: Buffer.from(SECRET_BODY).toString("base64url") } },
});
const anaEvents: unknown[] = [ev(-30 * DAY, [{ email: "priya@corvid.example", displayName: "Priya Raman" }])];
const boEvents: unknown[] = [];
const anaMsgs = [
  // An old conversation with Larkfield: both ways, three weeks ago (so a note to them now isn't Gmail's to open).
  msg("m1", -21 * DAY, { From: "Dana Whitfield <dana@lark.example>", To: `Ana Member <${ANA_MAIL}>` }),
  msg("m2", -20 * DAY, { From: `Ana Member <${ANA_MAIL}>`, To: "Dana Whitfield <dana@lark.example>" }, ["SENT"]),
  // A first email out to Dune (in her Crystal Ball) yesterday, and to Outerbank (not in it).
  msg("m3", -1 * DAY, { From: `Ana Member <${ANA_MAIL}>`, To: "Kit Example <kit@dune.example>" }, ["SENT"]),
  msg("m4", -1 * DAY, { From: `Ana Member <${ANA_MAIL}>`, To: "Oli Example <oli@outer.example>" }, ["SENT"]),
  // A newsletter: never a reply.
  msg("m5", -2 * HOUR, { From: "Lark News <news@lark.example>", To: ANA_MAIL, "List-Unsubscribe": "<mailto:u@lark.example>" }),
];

const calls: { path: string; query: URLSearchParams }[] = [];
/** Refresh tokens whose access the member removed at Google. */
const dead = new Set<string>();
const GRANT_MAIN = "openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/contacts.readonly";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString("base64url")}.y`;
const CODES: Record<string, { refresh: string; scope: string; email: string }> = {
  "code-ana": { refresh: "REFRESH-ana-secret", scope: GRANT_MAIN, email: ANA_MAIL },
  "code-ana-gmail": { refresh: "REFRESH-anagm-secret", scope: `${GRANT_MAIN} https://www.googleapis.com/auth/gmail.metadata`, email: ANA_MAIL },
  "code-bo": { refresh: "REFRESH-bo-secret", scope: GRANT_MAIN, email: "bo.other@example.org" },
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
  calls.push({ path: u.pathname, query: u.searchParams });
  const p = u.pathname;
  if (p === "/oauth2/token") {
    if (body.get("grant_type") === "authorization_code") {
      const c = CODES[body.get("code") ?? ""];
      if (!c) return send(res, 400, { error: "invalid_grant" });
      return send(res, 200, { access_token: `ACCESS-${c.refresh}`, expires_in: 3600, refresh_token: c.refresh, scope: c.scope, id_token: idToken(c.email) });
    }
    // Access removed in the member's Google Account: Google answers invalid_grant.
    if (dead.has(body.get("refresh_token") ?? "")) return send(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    return send(res, 200, { access_token: `ACCESS-${body.get("refresh_token")}`, expires_in: 3600 });
  }
  if (p === "/oauth2/revoke") return send(res, 200, {});
  const tok = (req.headers.authorization ?? "").replace(/^Bearer ACCESS-/, "");
  if (dead.has(tok)) return send(res, 401, { error: { status: "UNAUTHENTICATED" } });
  const isBo = tok.includes("-bo-");
  if (p === "/calendar/calendar/v3/users/me/calendarList") return send(res, 200, { items: [] });
  if (p.startsWith("/calendar/calendar/v3/calendars/")) return send(res, 200, { items: isBo ? boEvents : anaEvents });
  if (p === "/people/v1/people/me/connections") return send(res, 200, { connections: [] });
  if (p === "/people/v1/otherContacts") return send(res, 200, { otherContacts: [] });
  if (p === "/gmail/gmail/v1/users/me/profile") return send(res, 200, { emailAddress: ANA_MAIL, historyId: "1" });
  if (p === "/gmail/gmail/v1/users/me/messages") return send(res, 200, { messages: anaMsgs.map((m) => ({ id: m.id })) });
  if (p.startsWith("/gmail/gmail/v1/users/me/messages/")) {
    const m = anaMsgs.find((x) => x.id === p.split("/").pop());
    return m ? send(res, 200, m) : send(res, 404, { error: { status: "NOT_FOUND" } });
  }
  return send(res, 404, { error: "not_found" });
});
await new Promise<void>((r) => google.listen(0, "127.0.0.1", () => r()));
const GBASE = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_GOOGLE_API_TEST: GBASE,
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "client-test.apps.example",
  GOOGLE_CLIENT_SECRET: "secret-test",
  RN_GOOGLE_GMAIL: "1",
  RN_GOOGLE_GMAIL_TESTERS: ANA_MAIL,
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_BILLING", "GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "RN_DIGEST"]) delete process.env[k];

const SECRETS = [SECRET_TITLE, SECRET_DESC, SECRET_SUBJECT, SECRET_BODY, "A secret room", "REFRESH-"];
const has = (x: unknown, words: string[]) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return words.filter((w) => s.includes(w));
};

async function main() {
  const P = await import("../lib/pipeline");
  const N = await import("../lib/pipelineNote");
  const T = await import("../lib/table");
  const G = await import("../lib/google");
  const PA = await import("../lib/pipelineActions");
  const tools = await import("../lib/mcp/tools");
  const { movesFor } = await import("../lib/movesView");

  const ORIGIN = "https://post.example.com";
  const ANA = "tok-ana-pipe";
  const BO = "tok-bo-pipe";
  const HAN = "tok-han-pipe";
  const CY = "tok-cy-pipe";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const act = (tok: string, a: Record<string, unknown>) => T.perform(tok, a as never, ORIGIN);
  const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
  const view = async (tok: string) => (await PA.pipelineViewFor(tok))!;
  const at = async (tok: string, companyId: string) => (await view(tok)).entries.find((e) => e.company === pub(companyId));
  const ctxOf = async (tok: string) => ({ member: (await T.memberForToken(tok))!, origin: ORIGIN });
  const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
  const sync = async (id: string) => {
    for (let i = 0; i < 200 && G.isSyncing(id); i++) await new Promise((r) => setTimeout(r, 25));
    await G.syncMember(id);
    await PA.detectNow(id);
  };

  /* ================= the rules, pure ================= */
  console.log("\nbusiness days");
  const fri = Date.UTC(2026, 10, 20, 15);
  check("sent on a Friday: due the next Wednesday", P.addBusinessDays(fri, 3) === "2026-11-25", P.addBusinessDays(fri, 3));
  check("sent on a Saturday: due Wednesday too", P.addBusinessDays(fri + DAY, 3) === "2026-11-25");
  check("sent on a Monday: due Thursday", P.addBusinessDays(Date.UTC(2026, 10, 23, 9), 3) === "2026-11-26");

  console.log("\nstages, pure");
  const mon = Date.UTC(2026, 10, 23, 9);
  const L = P.emptyPipeline();
  let n = 0;
  const id = () => `pl_t${n++}`;
  const { entry: e1, created } = P.openEntry(L, { id: id(), companyId: "c1", channel: "email", to: { name: "Dana Whitfield", role: "CEO", google: true }, source: "move", via: "note", nowMs: mon });
  check("a note sent: Sent, from the note, a follow-up in 3 business days", created && e1.stage === "sent" && e1.via.sent === "note" && e1.due === "2026-11-26" && e1.dates.sent === new Date(mon).toISOString(), e1);
  const again = P.openEntry(L, { id: id(), companyId: "c1", channel: "email", source: "move", via: "note", nowMs: mon + 10 * MIN });
  check("the same note used twice in half an hour is one send", !again.created && again.entry === e1 && e1.follow === 0 && L.entries.length === 1);
  P.openEntry(L, { id: id(), companyId: "c1", channel: "email", source: "move", via: "note", nowMs: mon + 2 * DAY });
  check("a note sent again later is a follow-up, and moves the next one on", e1.follow === 1 && e1.due === P.addBusinessDays(mon + 2 * DAY, 3), e1);
  check("an email in before Sent is no reply", !P.detectEntry(e1, { inAt: new Date(mon - HOUR).toISOString() }, mon + 3 * DAY) && e1.stage === "sent");
  check("an email in after Sent: Replied, from Gmail", P.detectEntry(e1, { inAt: new Date(mon + 2.5 * DAY).toISOString() }, mon + 3 * DAY) && e1.stage === "replied" && e1.via.replied === "gmail");
  check("the same signal again moves nothing", !P.detectEntry(e1, { inAt: new Date(mon + 2.5 * DAY).toISOString() }, mon + 3 * DAY));
  check("'That wasn't a reply': back to Sent, the signal set aside", P.correctEntry(e1, { inAt: new Date(mon + 2.5 * DAY).toISOString() }, mon + 3 * DAY) && e1.stage === "sent" && !e1.dates.replied);
  check("the set-aside signal doesn't move it again", !P.detectEntry(e1, { inAt: new Date(mon + 2.5 * DAY).toISOString() }, mon + 3 * DAY) && e1.stage === "sent");
  check("a newer email in does", P.detectEntry(e1, { inAt: new Date(mon + 3.2 * DAY).toISOString() }, mon + 4 * DAY) && e1.stage === "replied");
  check("a past meeting before Sent is not a meeting about this", !P.detectEntry(e1, { metDay: "2026-11-01" }, mon + 4 * DAY) && e1.stage === "replied");
  check("a meeting booked ahead: Meeting, from the calendar", P.detectEntry(e1, { nextDay: "2026-12-02" }, mon + 4 * DAY) && e1.stage === "meeting" && e1.via.meeting === "calendar");
  check("Merlin never moves a deal past Meeting by itself", !P.detectEntry(e1, { inAt: new Date(mon + 5 * DAY).toISOString(), nextDay: "2026-12-09" }, mon + 5 * DAY) && e1.stage === "meeting");
  const prop = P.pipelineEvent({ pipeline: { mem_x: L } }, "mem_x", "c1", "proposal_sent", mon + 6 * DAY, id, mon + 6 * DAY);
  check("the proposal hook: proposal_sent moves it to Proposal", prop === e1 && e1.stage === "proposal" && e1.via.proposal === "proposal");
  P.pipelineEvent({ pipeline: { mem_x: L } }, "mem_x", "c1", "signed", mon + 8 * DAY, id, mon + 8 * DAY);
  check("signed: Won, from the proposal, nothing more to follow up", e1.stage === "won" && e1.via.won === "proposal" && e1.due === null);
  const st2 = { pipeline: { mem_x: L } as Record<string, import("../lib/pipeline").PipelineLog> };
  const fresh = P.pipelineEvent(st2, "mem_x", "c2", "proposal_sent", mon, id, mon);
  check("a proposal at a company with no entry opens one at Proposal", fresh.stage === "proposal" && fresh.source === "proposal" && L.entries.length === 2);
  P.pipelineEvent(st2, "mem_x", "c2", "declined", mon + DAY, id, mon + DAY);
  check("declined: Lost", fresh.stage === "lost" && fresh.via.lost === "proposal");

  console.log("\nsilence, pure");
  const Q = P.emptyPipeline();
  const q1 = P.openEntry(Q, { id: id(), companyId: "q1", channel: "email", source: "record", via: "note", nowMs: mon }).entry;
  P.followedUp(q1, "note", mon + 4 * DAY, mon + 4 * DAY);
  P.followedUp(q1, "note", mon + 8 * DAY, mon + 8 * DAY);
  check("two follow-ups out, the next not due yet: still Sent", !P.detectEntry(q1, undefined, mon + 9 * DAY) && q1.stage === "sent");
  check("past the last follow-up with no reply: Went quiet, by itself", P.detectEntry(q1, undefined, mon + 20 * DAY) && q1.stage === "quiet" && q1.via.quiet === "auto" && q1.due === null);
  check("a reply after it went quiet: Replied", P.detectEntry(q1, { inAt: new Date(mon + 21 * DAY).toISOString() }, mon + 21 * DAY) && q1.stage === "replied");
  const q2 = P.openEntry(Q, { id: id(), companyId: "q2", channel: "email", source: "record", via: "note", nowMs: mon }).entry;
  q2.due = null;
  check("30 days of silence, even with no follow-up due: Went quiet", !P.detectEntry(q2, undefined, mon + 29 * DAY) && P.detectEntry(q2, undefined, mon + 31 * DAY) && q2.stage === "quiet");
  check("reopen: back to Sent", P.reopenEntry(q2, mon + 32 * DAY) && q2.stage === "sent" && !q2.dates.quiet);
  P.closeEntry(q2, "notnow", mon + 33 * DAY);
  check("Not now is the member's, one tap, and silence never moves it", q2.stage === "notnow" && q2.via.notnow === "you" && !P.detectEntry(q2, { inAt: new Date(mon + 40 * DAY).toISOString() }, mon + 40 * DAY));
  check("a seat of theirs, new since Merlin first looked, is the win", (() => {
    const W = P.emptyPipeline();
    const w = P.openEntry(W, { id: id(), companyId: "w1", channel: "email", source: "move", via: "note", nowMs: mon }).entry;
    const first = P.detectEntry(w, { seats: ["e_old"] }, mon + DAY);
    return first && w.stage === "sent" && P.detectEntry(w, { seats: ["e_old", "e_new"] }, mon + 2 * DAY) && w.stage === "won" && w.seatId === "e_new" && w.via.won === "seat";
  })());

  console.log("\nthe logic probe's scenarios, pure (qa/logic/pipeline-probe.mts)");
  {
    const t0 = Date.parse("2026-11-02T12:00:00Z");
    // 1. A past seat added after Sent is no win; a seat that started after Sent is.
    const L1 = P.emptyPipeline();
    const x1 = P.openEntry(L1, { id: id(), companyId: "x1", channel: "email", source: "move", via: "note", nowMs: t0 }).entry;
    P.detectEntry(x1, { seats: [], seatFacts: {} }, t0 + DAY);
    const past = P.detectEntry(x1, { seats: ["e_2019"], seatFacts: { e_2019: { start: "2019-03", addedAt: new Date(t0 + 2 * DAY).toISOString(), type: "Fractional" } } }, t0 + 2 * DAY);
    check("probe 1: a 2019 seat added after Sent (for credits) is no win: still Sent, the seat set aside", past && x1.stage === "sent" && !x1.seatId && x1.seen.seats!.includes("e_2019"), x1);
    check("probe 1: a seat in the table from before (added before Sent) is no win", (() => {
      P.detectEntry(x1, { seats: ["e_2019", "e_old"], seatFacts: { e_2019: { start: "2019-03", addedAt: new Date(t0 + 2 * DAY).toISOString() }, e_old: { start: null, addedAt: new Date(t0 - 90 * DAY).toISOString() } } }, t0 + 3 * DAY);
      return x1.stage === "sent";
    })());
    check("probe 1: a Full-time seat is no win", (() => {
      P.detectEntry(x1, { seats: ["e_2019", "e_old", "e_ft"], seatFacts: { e_ft: { start: "2026-11", addedAt: new Date(t0 + 4 * DAY).toISOString(), type: "Full-time" } } }, t0 + 4 * DAY);
      return x1.stage === "sent";
    })());
    check("probe 1: a seat with no date that came onto Merlin before Sent is no win", P.seatWins(x1, { start: null, addedAt: null }) === false && P.seatWins(x1, { start: "2026", addedAt: new Date(t0 + DAY).toISOString() }) === true && P.seatWins(x1, { start: "2025", addedAt: new Date(t0 + DAY).toISOString() }) === false);
    const won = P.detectEntry(x1, { seats: ["e_2019", "e_old", "e_ft", "e_new"], seatFacts: { e_new: { start: "2026-11", addedAt: new Date(t0 + 5 * DAY).toISOString(), type: "Fractional" } } }, t0 + 5 * DAY);
    check("probe 1: a seat that started this month, added after Sent: Won, from her seats", won && x1.stage === "won" && x1.seatId === "e_new" && x1.via.won === "seat", x1);
    // 2. Reopen and Not a win, on a Won.
    check("probe 2: Not a win: back to Sent, the seat no longer this win's, and it never wins it again", P.correctEntry(x1, undefined, t0 + 6 * DAY) && x1.stage === "sent" && !x1.seatId && !x1.dates.won && !P.detectEntry(x1, { seats: ["e_2019", "e_old", "e_ft", "e_new"] }, t0 + 6 * DAY + MIN) && x1.stage === "sent" && x1.log.at(-1)!.text === "You said that wasn't a win", x1.log.at(-1));
    P.moveEntry(x1, "won", t0 + 7 * DAY);
    check("a Won the member set is theirs: Reopen, never Not a win", !P.correctEntry(x1, undefined, t0 + 7 * DAY) && x1.stage === "won" && x1.via.won === "you");
    check("probe 2: reopenEntry on a Won works: back to where it was", P.reopenEntry(x1, t0 + 8 * DAY) && x1.stage === "sent" && !x1.dates.won && !x1.won, x1.stage);
    // 3. An inbound email a minute after Sent (an out-of-office): Replied, and one tap takes it back.
    const L3 = P.emptyPipeline();
    const x3 = P.openEntry(L3, { id: id(), companyId: "x3", channel: "email", source: "move", via: "note", nowMs: t0 }).entry;
    const ooo = new Date(t0 + MIN).toISOString();
    P.detectEntry(x3, { inAt: ooo }, t0 + 2 * MIN);
    check("probe 3: an email in a minute after Sent reads as Replied, and That wasn't a reply sets it aside for good", x3.stage === "replied" && P.correctEntry(x3, { inAt: ooo }, t0 + 3 * MIN) && x3.stage === "sent" && !P.detectEntry(x3, { inAt: ooo }, t0 + 4 * MIN) && x3.stage === "sent");
    // 4. A route chosen and nothing sent: never quiet, never Replied, Sent only when something goes out.
    const L4 = P.emptyPipeline();
    const x4 = P.routeEntry(L4, { id: id(), companyId: "x4", channel: "email", source: "move", nowMs: t0 }).entry;
    P.detectEntry(x4, { seats: [] }, t0 + DAY);
    check("probe 4: a route chosen, nothing sent for 31 days: still To reach out, not Went quiet", !P.detectEntry(x4, undefined, t0 + 31 * DAY) && x4.stage === "reach" && P.nextStep(x4, t0 + 31 * DAY) === "Take the first step of your route");
    P.detectEntry(x4, { inAt: new Date(t0 + 2 * DAY).toISOString() }, t0 + 32 * DAY);
    check("probe 4: an email in from the company before anything went out isn't a reply", x4.stage === "reach");
  }

  console.log("\nno inbound channel (no Gmail), pure");
  {
    const t0 = Date.parse("2026-11-02T12:00:00Z");
    const N0 = P.emptyPipeline();
    const n1 = P.openEntry(N0, { id: id(), companyId: "n1", channel: "email", source: "record", via: "note", nowMs: t0 }).entry;
    check("without Gmail an email deal never goes quiet by itself, even after 31 days", !P.detectEntry(n1, undefined, t0 + 31 * DAY, { gmail: false }) && n1.stage === "sent");
    check("it asks instead: No reply seen. Did they reply by email?", P.askReply(n1, false, t0 + 31 * DAY) && P.askWords(n1.channel) === "No reply seen. Did they reply by email?" && P.askWords("linkedin") === "No reply seen. Did they reply on LinkedIn?");
    check("not before its follow-up is due", !P.askReply(n1, false, t0 + DAY));
    check("with Gmail the same deal goes quiet, and nothing asks", P.detectEntry(structuredClone(n1), undefined, t0 + 31 * DAY, { gmail: true }) && !P.askReply(n1, true, t0 + 31 * DAY));
    const n2 = P.openEntry(N0, { id: id(), companyId: "n2", channel: "merlin", source: "record", via: "message", nowMs: t0, conversationId: "cv1" }).entry;
    check("a deal on Merlin (replies there are seen) still goes quiet without Gmail", P.detectEntry(n2, undefined, t0 + 31 * DAY, { gmail: false }) && n2.stage === "quiet" && !P.askReply(n2, false, t0 + 31 * DAY));
  }

  console.log("\nMove to, by hand, pure");
  {
    const t0 = Date.parse("2026-11-02T12:00:00Z");
    const M0 = P.emptyPipeline();
    const m1 = P.openEntry(M0, { id: id(), companyId: "m1", channel: "email", source: "record", via: "note", nowMs: t0 }).entry;
    check("every stage but Went quiet can be chosen", P.MOVE_STAGES.join(",") === "reach,sent,replied,meeting,proposal,won,lost,notnow" && !P.isMoveStage("quiet"));
    check("Sent to Replied: via you, logged as the member's", P.moveEntry(m1, "replied", t0 + DAY) && m1.stage === "replied" && m1.via.replied === "you" && m1.log.at(-1)!.text === "You moved it to Replied" && P.viaLine(m1.via.replied, m1.dates.replied)!.startsWith("You marked it on"));
    P.moveEntry(m1, "meeting", t0 + 2 * DAY);
    P.moveEntry(m1, "proposal", t0 + 3 * DAY);
    check("to Won by hand: Add it as your seat next, terms allowed", P.moveEntry(m1, "won", t0 + 4 * DAY) && m1.stage === "won" && m1.via.won === "you" && P.nextStep(m1, t0 + 4 * DAY) === "Add it as your seat" && m1.due === null);
    P.setWonTerms(m1, { pricing: "monthly", rate: 9000, hours: null, start: null, months: null, merlin: false }, t0 + 4 * DAY);
    check("back to Replied: what lies past it goes (Meeting, Proposal, Won and its terms)", P.moveEntry(m1, "replied", t0 + 5 * DAY) && m1.stage === "replied" && !m1.dates.meeting && !m1.dates.proposal && !m1.dates.won && !m1.won && !!m1.dates.sent && !!m1.dates.replied);
    check("Lost keeps the line's dates; out of Lost, the close goes", P.moveEntry(m1, "lost", t0 + 6 * DAY) && !!m1.dates.replied && P.moveEntry(m1, "meeting", t0 + 7 * DAY) && !m1.dates.lost && m1.stage === "meeting" && !!m1.due);
    check("To reach out: no follow-up, nothing sent, silence counts from now", P.moveEntry(m1, "reach", t0 + 8 * DAY) && m1.stage === "reach" && m1.due === null && !m1.dates.sent && m1.lastOut === new Date(t0 + 8 * DAY).toISOString());
    check("the same stage again changes nothing", !P.moveEntry(m1, "reach", t0 + 9 * DAY));
    check("the counts follow what the member says happened", (() => {
      const st = P.outcomeStats({ pipeline: { mem_m: M0 } });
      return st.detected.you >= 1 && st.byStage.reach === 1;
    })());
  }

  console.log("\nfollow-ups due, pure");
  const D = P.emptyPipeline();
  const d1 = P.openEntry(D, { id: id(), companyId: "d1", channel: "email", to: { role: "CEO" }, source: "move", via: "note", nowMs: mon }).entry;
  P.openEntry(D, { id: id(), companyId: "d2", channel: "linkedin", to: { name: "Rae Example", google: true }, source: "move", via: "note", nowMs: mon + DAY });
  const dState = { pipeline: { mem_d: D } };
  check("nothing due before its day", P.dueFollowUps(dState, "mem_d", mon + 2 * DAY).length === 0);
  const due = P.dueFollowUps(dState, "mem_d", Date.UTC(2026, 10, 27, 9));
  check("due on its day, the most overdue first", due.length === 2 && due[0].entryId === d1.id && due[0].days === 4, due);
  const w1 = P.followUpWords(due[0], "Larkfield Robotics");
  check("the words: Follow up with the CEO at Larkfield Robotics, Sent 4 days ago by email", w1.title === "Follow up with the CEO at Larkfield Robotics" && w1.line === "Sent 4 days ago by email.", w1);
  check("a locked company isn't named", P.followUpWords(due[0], null).title === "Follow up with the CEO at a company in your pipeline");
  check("a person from Google: named on the member's own screens, never elsewhere", P.followUpWords(due[1], "X").title === "Follow up with Rae at X" && P.followUpWords(due[1], "X", "merlin").title === "Follow up with the person you know there at X");
  check("no em-dash in the words", !/—/.test(JSON.stringify([w1, P.followUpWords(due[1], "X")])));
  const fu = N.draftFollowUp({ to: "Dana Whitfield", company: "Larkfield Robotics", stage: "sent", channel: "email", days: 4, follow: 0, me: { first: "Ana", name: "Ana Member", fn: "RevOps" } }, null);
  check("the drafted follow-up: short, to Dana, about the company, signed", /^Hi Dana,/.test(fu.body) && fu.body.includes("Larkfield Robotics") && /Ana$/.test(fu.body) && fu.body.split(/[.?!]\s/).length <= 6, fu);
  const formal = N.draftFollowUp({ to: null, company: "Larkfield Robotics", stage: "replied", channel: "email", days: 1, follow: 0, me: { first: "Ana", name: "Ana Member", fn: null } }, { greeting: "Dear {first},", signoff: "Regards,", name: "full", length: "short", formality: "formal", contractions: false, exclamations: "never", emoji: false, opener: "direct", phrases: [] });
  check("in the member's voice: formal, no contractions, their sign-off", /^Hello,/.test(formal.body) && /Regards,\nAna Member$/.test(formal.body) && !/'/.test(formal.body), formal.body);

  console.log("\nthe month's value and the seat's answers");
  check("monthly is the rate; hourly is rate x hours x 52 / 12", P.monthlyValue({ pricing: "monthly", rate: 9000, hours: null }) === 9000 && P.monthlyValue({ pricing: "hourly", rate: 175, hours: 15 }) === 11375);
  const thisMonth = today.slice(0, 7);
  const sf = P.wonSeatFields({ pricing: "hourly", rate: 175, hours: 15, start: thisMonth }, "RevOps", NOW);
  check("Add it as your seat: the form's own answers", sf.function === "RevOps" && sf.status === "Active" && sf.start === thisMonth && sf.pricing === "Hourly" && sf.rate === "$175/hr" && sf.hours === "15" && sf.type === "Fractional", sf);
  check("a start still to come is left for the member", !("start" in P.wonSeatFields({ pricing: "monthly", rate: 9000, hours: null, start: "2099-01" }, "RevOps", NOW)) && P.wonSeatFields({ pricing: "monthly", rate: 9000, hours: null, start: null }, null, NOW).rate === "$9k/mo");
  check("terms are checked", !!P.cleanWon({ pricing: "hourly", rate: 175 }, NOW).error && !!P.cleanWon({ pricing: "weekly", rate: 1 }, NOW).error && !!P.cleanWon({ pricing: "monthly", rate: -5 }, NOW).error && !!P.cleanWon({ pricing: "monthly", rate: 9000 }, NOW).terms);

  /* ================= Google connected (Ana, with Gmail as a tester) ================= */
  console.log("\nconnecting Google (fake)");
  const fin = async (tok: string, code: string, kind: "google" | "gmail" = "google") => {
    const st = await G.startConnect(tok, ORIGIN, kind);
    if (!st.ok) throw new Error(`no start ${code}`);
    return G.finishConnect(tok, { state: st.state, code, error: null }, st.state, ORIGIN);
  };
  check("Ana connects Google", (await fin(ANA, "code-ana")).outcome === "connected");
  check("and adds Gmail (a tester)", (await fin(ANA, "code-ana-gmail", "gmail")).outcome === "gmail");
  check("Bo connects Google (calendar only)", (await fin(BO, "code-bo")).outcome === "connected");
  await sync("mem_ana");
  await sync("mem_bo");

  console.log("\nGmail opens an entry by itself");
  let av = await view(ANA);
  const dune = av.entries.find((e) => e.company === pub("c_dune"));
  check("a first email out to a Crystal Ball company: an entry at Sent, detected from Gmail", !!dune && dune.stage === "sent" && dune.via.sent === "gmail" && dune.source === "gmail" && /^Detected from your Gmail on /.test(dune.how ?? ""), dune);
  check("dated when the email went out, its follow-up 3 business days later", !!dune && dune.dates.sent?.slice(0, 10) === iso(-DAY).slice(0, 10) && dune.due === P.addBusinessDays(NOW - DAY, 3), dune);
  check("who it went to, from the header: named for Ana herself, marked as from Google", dune?.to.name === "Kit Example" && dune.to.google === true);
  check("a company she knows someone at is named for her, as Your network names it", dune?.name === "Dune Analytics");
  check("an email out to a company outside her Crystal Ball opens nothing", !av.entries.some((e) => e.company === pub("c_outr")));
  check("an old conversation (Larkfield) opens nothing by itself", !av.entries.some((e) => e.company === pub("c_lark")));
  check("Merlin sees her notes, messages, calendar and Gmail", av.sees.gmail && av.sees.calendar && av.sees.google);

  console.log("\nMark as sent");
  const before = (await movesFor(ANA))!.moves.map((m) => m.id);
  check("Larkfield is one of today's moves", before.includes(pub("c_lark")), before);
  let r = await act(ANA, { type: "move", id: pub("c_lark"), op: "sent", channel: "email", to: { name: "Dana Whitfield", role: "CEO", google: true } });
  check("Mark as sent says it's in the pipeline", /In your pipeline/.test(r.message), r.message);
  let lark = await at(ANA, "c_lark");
  check("an entry at Sent, from her note, a follow-up in 3 business days (not hidden for 30 days)", lark?.stage === "sent" && lark.via.sent === "note" && lark.due === P.addBusinessDays(Date.now(), 3) && lark.source === "move" && lark.merlinDefault, lark);
  check("the move leaves today's moves", !(await movesFor(ANA))!.moves.some((m) => m.id === pub("c_lark")));
  check("and stays out while it's in the pipeline, past 30 days", !(await movesFor(ANA, { nowMs: Date.now() + 31 * DAY }))!.moves.some((m) => m.id === pub("c_lark")));
  await act(ANA, { type: "move", id: pub("c_lark"), op: "undo" });
  check("Undo takes the move and the entry back", !(await at(ANA, "c_lark")) && (await movesFor(ANA))!.moves.some((m) => m.id === pub("c_lark")));
  await act(ANA, { type: "move", id: pub("c_lark"), op: "sent", channel: "email", to: { name: "Dana Whitfield", role: "CEO", google: true } });
  await act(ANA, { type: "move", id: pub("c_corv"), op: "sent", channel: "email", to: { name: "Priya Raman", role: "Director of Operations", google: true } });
  check("Done is still Done: no entry", (await act(ANA, { type: "move", id: pub("c_copp"), op: "done" }), !(await at(ANA, "c_copp"))));
  await act(ANA, { type: "move", id: pub("c_copp"), op: "undo" });

  // Mark as sent from every kind of move (lib/moves.ts moveSent, what Moves.tsx and the record's buyer note send):
  // the buyer way in (named once unlocked), a reply to an open role (to the buyer, someone they know, or its hiring team).
  const MV = await import("../lib/moves");
  const ctx = { hired: null, gap: false } as never;
  const buyerWay = (name: string | null, title: string | null) => ({ kind: "buyer", personId: "p1", seatId: null, rel: "Decision maker", fn: null, seatRole: null, name, title, email: null, ctx }) as never;
  const words = (o: ReturnType<typeof MV.moveSent>) => {
    const log = P.emptyPipeline();
    const { entry } = P.openEntry(log, { id: "x", companyId: "c_x", channel: o.channel, to: P.cleanTo(o.to), source: "move", via: "note", nowMs: Date.now() });
    return P.followUpWords({ ...entry, days: 3, stageDays: 3 }, "Larkfield Robotics", "merlin").title;
  };
  const sBuyer = MV.moveSent({ do: "buyer", way: buyerWay("Dana Whitfield", "CEO") });
  check("a buyer's drafted note, marked sent: by email, to the buyer by name and title", sBuyer.channel === "email" && sBuyer.to.name === "Dana Whitfield" && sBuyer.to.role === "CEO" && !sBuyer.intro && words(sBuyer) === "Follow up with Dana at Larkfield Robotics", [sBuyer, words(sBuyer)]);
  const sLocked = MV.moveSent({ do: "seeBuyer", way: buyerWay(null, null) });
  check("a buyer still locked is never named or titled", !sLocked.to.name && !sLocked.to.role && words(sLocked) === "Follow up with them at Larkfield Robotics", sLocked);
  const sRole = MV.moveSent({ do: "reply", way: { kind: "role", seatId: "e1", title: "Fractional CRO", fn: "Sales", since: null, posting: "https://jobs.example/x" } });
  check("Reply to the open role with nobody on file: to its hiring team", sRole.channel === "email" && sRole.to.role === MV.HIRING_TEAM && !sRole.to.name && words(sRole) === "Follow up with the hiring team at Larkfield Robotics", [sRole, words(sRole)]);
  const sRoleBuyer = MV.moveSent({ do: "reply", way: buyerWay("Dana Whitfield", "CEO") });
  check("Reply to the open role beside a buyer: to the buyer", sRoleBuyer.to.name === "Dana Whitfield" && words(sRoleBuyer) === "Follow up with Dana at Larkfield Robotics", sRoleBuyer);
  const sRoleKnow = MV.moveSent({ do: "reply", way: { kind: "know", person: { name: "Kit Example", title: "VP Sales", google: true } } as never });
  check("Reply to the open role through someone from her Google account: never named outside her screens", sRoleKnow.to.google === true && words(sRoleKnow) === "Follow up with the person you know there at Larkfield Robotics", words(sRoleKnow));
  // The real action: a buyer's note marked sent from today's moves, then taken back.
  r = await act(ANA, { type: "move", id: pub("c_copp"), op: "sent", ...sBuyer });
  const coppSent = await at(ANA, "c_copp");
  check("the move op puts it in the pipeline to the buyer", /In your pipeline/.test(r.message) && coppSent?.stage === "sent" && coppSent.to.name === "Dana Whitfield" && coppSent.to.role === "CEO" && coppSent.channel === "email", coppSent);
  await act(ANA, { type: "move", id: pub("c_copp"), op: "undo" });
  check("and Undo takes it back", !(await at(ANA, "c_copp")));
  const src = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  check("today's moves and the record's buyer note both send moveSent (Mark as sent, or the note used)", /moveSent\(m\)/.test(src("app/post/Moves.tsx")) && /type: "pipeline\.sent", companyId: i\.c\.id, from: "record", \.\.\.moveSent\(move\)/.test(src("app/post/Drawer.tsx")) && /onUsed=\{\(\) => void pipelineAct/.test(src("app/post/Drawer.tsx")));

  console.log("\nreplies and meetings, from fake Google metadata");
  await sync("mem_ana");
  check("the old emails and a newsletter don't make a reply", (await at(ANA, "c_lark"))?.stage === "sent");
  check("a meeting before the note went out doesn't make a meeting", (await at(ANA, "c_corv"))?.stage === "sent");
  anaMsgs.push(msg("m6", 5 * MIN, { From: "Dana Whitfield <dana@lark.example>", To: `Ana Member <${ANA_MAIL}>` }));
  await sync("mem_ana");
  lark = await at(ANA, "c_lark");
  check("an email in from Larkfield after Sent: Replied, detected from Gmail", lark?.stage === "replied" && lark.via.replied === "gmail" && /^Detected from your Gmail on /.test(lark.how ?? ""), lark);
  check("the next step is Book a meeting, and Not right? offers That wasn't a reply", lark?.next === "Book a meeting" && !!lark?.fix.includes("notReply"));
  r = await PA.performPipeline(ANA, { type: "pipeline.correct", id: lark!.id } as never);
  check("That wasn't a reply: back to Sent", r.pipeline?.entries.find((e) => e.id === lark!.id)?.stage === "sent", r.message);
  await sync("mem_ana");
  check("the same email doesn't move it again", (await at(ANA, "c_lark"))?.stage === "sent");
  anaMsgs.push(msg("m7", 10 * MIN, { From: "Dana Whitfield <dana@lark.example>", To: `Ana Member <${ANA_MAIL}>` }));
  await sync("mem_ana");
  check("a newer one does", (await at(ANA, "c_lark"))?.stage === "replied");
  anaEvents.push(ev(3 * DAY, [{ email: "priya@corvid.example", displayName: "Priya Raman" }]));
  await sync("mem_ana");
  const corv = await at(ANA, "c_corv");
  check("a meeting booked with someone from Corvid: Meeting, from the calendar", corv?.stage === "meeting" && corv.via.meeting === "calendar" && /^From your calendar on /.test(corv.how ?? ""), corv);

  console.log("\nnever a title, a subject or a message's text");
  const evCalls = calls.filter((c) => c.path.startsWith("/calendar/calendar/v3/calendars/"));
  check("calendar events are asked for without a title, description or location", evCalls.length > 0 && evCalls.every((c) => !/summary|description|location/.test(c.query.get("fields") ?? "x") && /attendees/.test(c.query.get("fields") ?? "")), evCalls[0]?.query.get("fields"));
  const gmCalls = calls.filter((c) => c.path.startsWith("/gmail/gmail/v1/users/me/messages/"));
  check("Gmail is read as headers only: no Subject, never a body", gmCalls.length > 0 && gmCalls.every((c) => c.query.get("format") === "metadata" && !c.query.getAll("metadataHeaders").includes("Subject")));
  check("nothing of a title, description, subject or text is in the state", !has(stateFile(), SECRETS).length, has(stateFile(), SECRETS));
  check("nor in her pipeline", !has(await view(ANA), SECRETS).length);
  const myPipe = await tools.myPipeline(await ctxOf(ANA));
  check("nor through the connector", !has(myPipe, SECRETS).length);
  const plState = JSON.parse(stateFile()).pipeline.mem_ana;
  check("what an entry keeps of Google is times and days: no subject, title or text field", !has(plState, ["subject", "summary", "snippet", "body", "title\":\"Secret"]).length);

  console.log("\nMerlin's own messages, invites and replies");
  await act(ANA, { type: "unlock", entity: "company", id: pub("c_salt"), field: "identity" });
  // Who held the seat shows free once the company is open (PEERS_FREE): nothing to unlock.
  const ms = await act(ANA, { type: "message.start", engagementId: pub("e_salt"), text: "Hi Hana, how did the CRO seat come about?" });
  let salt = await at(ANA, "c_salt");
  check("a message on Merlin to the seat holder: Sent, on Merlin, from Merlin messages", salt?.stage === "sent" && salt.channel === "merlin" && salt.via.sent === "message" && salt.to.name === "Hana Holder", salt);
  check("the message text never goes into the pipeline", !JSON.stringify(salt).includes("how did the CRO seat"));
  await act(HAN, { type: "message.send", conversationId: ms.id, text: "Happy to talk, Ana." });
  salt = await at(ANA, "c_salt");
  check("her reply on Merlin: Replied, from Merlin messages", salt?.stage === "replied" && salt.via.replied === "message", salt);
  await act(ANA, { type: "unlock", entity: "company", id: pub("c_tall"), field: "identity" });
  // Who held the seat shows free once the company is open (PEERS_FREE): nothing to unlock.
  await act(ANA, { type: "invite", engagementId: pub("e_tall"), note: "Hi Pella, your seat is on Merlin." });
  const tall = await at(ANA, "c_tall");
  check("an invite to connect went out: Sent, to the seat holder", tall?.stage === "sent" && tall.to.name === "Pella Quist" && tall.via.sent === "note", tall);

  console.log("\nfollow-ups due on Home");
  await T.tableInternals.mutate((s) => {
    const e = s.pipeline!.mem_ana.entries.find((x) => x.companyId === "c_tall")!;
    e.due = P.addDays(today, -1);
  });
  av = await view(ANA);
  const tallDue = av.due.find((f) => f.company === pub("c_tall"));
  check("an overdue follow-up shows, in words", tallDue?.title === "Follow up with Pella at Tallgrass Analytics" && /^Sent today by email\./.test(tallDue.line), tallDue);
  r = await PA.performPipeline(ANA, { type: "pipeline.followed", id: tallDue!.id } as never);
  const tf = r.pipeline!.entries.find((e) => e.id === tallDue!.id)!;
  check("a follow-up note used inside half an hour of the first is one send", tf.follow === 0, tf);
  await T.tableInternals.mutate((s) => {
    const e = s.pipeline!.mem_ana.entries.find((x) => x.companyId === "c_tall")!;
    e.lastOut = new Date(Date.now() - 2 * DAY).toISOString();
    e.due = P.addDays(today, -1);
  });
  r = await PA.performPipeline(ANA, { type: "pipeline.followed", id: tallDue!.id } as never);
  const tf2 = r.pipeline!.entries.find((e) => e.id === tallDue!.id)!;
  check("a follow-up used: counted, the next one 3 business days on, off today's list", tf2.follow === 1 && tf2.due === P.addBusinessDays(Date.now(), 3) && !r.pipeline!.due.some((f) => f.id === tf2.id), tf2);
  r = await PA.performPipeline(ANA, { type: "pipeline.snooze", id: tallDue!.id } as never);
  check("Snooze 3 days", r.pipeline!.entries.find((e) => e.id === tallDue!.id)!.due === P.addDays(tf2.due!, 3), r.message);
  r = await PA.performPipeline(ANA, { type: "pipeline.close", id: tallDue!.id, stage: "notnow" } as never);
  check("Not now: one tap, closed, no follow-up", r.pipeline!.entries.find((e) => e.id === tallDue!.id)!.stage === "notnow" && r.pipeline!.entries.find((e) => e.id === tallDue!.id)!.due === null);
  r = await PA.performPipeline(ANA, { type: "pipeline.reopen", id: tallDue!.id } as never);
  check("reopened: back to Sent", r.pipeline!.entries.find((e) => e.id === tallDue!.id)!.stage === "sent");
  check("close takes only Lost or Not now (Move to is its own action)", !!(await refused(PA.performPipeline(ANA, { type: "pipeline.close", id: tallDue!.id, stage: "won" } as never))));
  r = await PA.performPipeline(ANA, { type: "pipeline.note", id: tallDue!.id, text: "Pella prefers mornings. Private note 7731." } as never);
  check("a private note is kept on the entry", r.pipeline!.entries.find((e) => e.id === tallDue!.id)!.notes.some((x) => x.text.includes("7731")));
  // A proposal out at a company she has never opened: locked for her.
  await PA.recordPipelineEvent("mem_ana", pub("c_bfin"), "proposal_sent");
  check("a deal at a company she's locked out of isn't named", (await at(ANA, "c_bfin"))?.name === null);
  const emailDue = await PA.dueFollowUpsFor("mem_ana", Date.now() + 6 * DAY);
  check("the morning email's list: as of that day, with words, a locked company unnamed", emailDue.some((f) => f.companyPub === pub("c_bfin") && f.company === null && f.title === "Check in on your proposal to a company in your pipeline") && emailDue.some((f) => f.title === "Follow up with Kit at Dune Analytics"), emailDue.map((f) => f.title));
  check("and with names 'merlin' no Google name", (await PA.dueFollowUpsFor("mem_ana", Date.now() + 6 * DAY, "merlin")).every((f) => !/Kit|Dana|Priya/.test(f.title)));

  console.log("\nprivacy");
  const bo = await view(BO);
  check("Bo's pipeline has none of Ana's", bo.entries.length === 0 && bo.intros.length === 0 && bo.due.length === 0, bo.entries);
  check("without Gmail: Merlin sees Bo's notes, messages and calendar, and offers no Gmail", !bo.sees.gmail && bo.sees.calendar && !bo.sees.gmailOffered);
  const anaIds = (await view(ANA)).entries.map((e) => e.id);
  const tries = [
    { type: "pipeline.note", id: anaIds[0], text: "x" },
    { type: "pipeline.close", id: anaIds[0], stage: "lost" },
    { type: "pipeline.correct", id: anaIds[0] },
    { type: "pipeline.remove", id: anaIds[0] },
    { type: "pipeline.followed", id: anaIds[0] },
    { type: "pipeline.won", id: anaIds[0], pricing: "monthly", rate: 1000 },
    { type: "pipeline.seat", id: anaIds[0], engagementId: pub("e_salt") },
  ];
  const outs = await Promise.all(tries.map((a) => refused(PA.performPipeline(BO, a as never))));
  check("Bo can't change any of Ana's entries", outs.every((x) => x === "That isn't in your pipeline anymore."), outs);
  check("signed out: refused", !!(await refused(PA.performPipeline("nope", { type: "pipeline.note", id: anaIds[0], text: "x" } as never))) && (await PA.pipelineViewFor("nope")) === null);
  const boTable = JSON.stringify(await T.buildView(BO));
  const anaTable = JSON.stringify(await T.buildView(ANA));
  check("nothing of Ana's pipeline in Bo's table, nor in her own shared records", !boTable.includes("7731") && !anaTable.includes("7731") && !anaIds.some((x) => boTable.includes(x) || anaTable.includes(x)));
  check("the export leaves every pipeline out", !("pipeline" in (await T.exportState())));
  const boTool = await tools.myPipeline(await ctxOf(BO));
  check("the connector: Bo's my_pipeline has none of Ana's", (boTool.entries as unknown[]).length === 0 && !JSON.stringify(boTool).includes("7731"));
  check("the connector never names someone from Ana's Google account", !has(myPipe, ["Kit Example", "Dana Whitfield", "Priya Raman", "Director of Operations"]).length && JSON.stringify(myPipe).includes("the person you know there"), has(myPipe, ["Kit Example", "Dana Whitfield", "Priya Raman"]));
  const myPipe2 = await tools.myPipeline(await ctxOf(ANA));
  check("the connector names a locked company as a locked company", (myPipe2.entries as { company_id: string; company: string }[]).find((e) => e.company_id === pub("c_bfin"))?.company === "Locked company");
  check("and never names the locked one in its words", !JSON.stringify(myPipe2).includes("Bluefin"));
  const bad = await refused(tools.updatePipeline(await ctxOf(ANA), { entry_id: anaIds[0], action: "won" }));
  check("update_pipeline takes only its actions", !!bad && /action is one of move \(with stage\), lost, not_now, reopen or note/.test(bad), bad);
  const okTool = await tools.updatePipeline(await ctxOf(ANA), { company_id: pub("c_dune"), action: "note", note: "From Claude, note 4410" });
  check("update_pipeline adds a note", okTool.ok === true && (await at(ANA, "c_dune"))!.notes.some((x) => x.text.includes("4410")));
  check("Bo's connector can't touch Ana's entry", !!(await refused(tools.updatePipeline(await ctxOf(BO), { entry_id: anaIds[0], action: "lost" }))));

  console.log("\nWon, and Add it as your seat");
  const harbId = await PA.recordPipelineEvent("mem_ana", pub("c_harb"), "proposal_sent");
  let harb = await at(ANA, "c_harb");
  check("the proposal hook opens Harborline at Proposal", !!harbId && harb?.stage === "proposal" && harb.via.proposal === "proposal", harb);
  check("terms can't be given before it's won", !!(await refused(PA.performPipeline(ANA, { type: "pipeline.won", id: harbId, pricing: "monthly", rate: 9000 } as never))));
  await PA.recordPipelineEvent("mem_ana", "c_harb", "signed");
  harb = await at(ANA, "c_harb");
  check("signed: Won, and the next step is Add it as your seat", harb?.stage === "won" && harb.next === "Add it as your seat", harb);
  r = await PA.performPipeline(ANA, { type: "pipeline.won", id: harbId, pricing: "hourly", rate: "175", hours: "15", start: thisMonth, months: "6", merlin: true } as never);
  harb = r.pipeline!.entries.find((e) => e.id === harbId)!;
  check("the terms: $175/hr, 15 hours, about $11,375 a month, through Merlin", harb.won?.monthly === 11375 && harb.won.merlin && harb.won.months === 6 && r.pipeline!.wonMonthly >= 11375, harb.won);
  const fields = P.wonSeatFields(harb.won!, "RevOps", Date.now());
  const credits = async (tok: string) => (await T.buildView(tok)).me!.credits;
  const c0 = await credits(ANA);
  const added = await act(ANA, { type: "add", company: "Harborline Pay", website: "harborline.example", newEngagement: true, engagementFields: { ...fields, operator: "Ana Member" }, operatorMemberId: "me" });
  const c1 = await credits(ANA);
  check("the add-seat flow takes the prefilled answers and earns credits as usual", !!added.id && c1 > c0, [c0, c1, added.message]);
  check("someone else can't claim the win's seat", !!(await refused(PA.performPipeline(BO, { type: "pipeline.seat", id: harbId, engagementId: added.id } as never))));
  check("a seat of hers at another company isn't this one", !!(await refused(PA.performPipeline(ANA, { type: "pipeline.seat", id: harbId, engagementId: pub("e_salt") } as never))));
  r = await PA.performPipeline(ANA, { type: "pipeline.seat", id: harbId, engagementId: added.id } as never);
  harb = r.pipeline!.entries.find((e) => e.id === harbId)!;
  check("the seat is confirmed by the win, nothing left to do", harb.seat === added.id && harb.next === null && /confirmed by this win/.test(r.message), harb);
  check("a won deal can't be taken out", !!(await refused(PA.performPipeline(ANA, { type: "pipeline.remove", id: harbId } as never))));
  // A seat added at an open deal is the win itself.
  await act(ANA, { type: "unlock", entity: "company", id: pub("c_copp"), field: "identity" });
  await PA.performPipeline(ANA, { type: "pipeline.sent", companyId: pub("c_copp"), channel: "linkedin", to: { name: "Rory Example", role: "COO" }, from: "record" } as never);
  let copp = await at(ANA, "c_copp");
  check("a note used from a record: Sent on LinkedIn, a Crystal Ball company through Merlin", copp?.stage === "sent" && copp.channel === "linkedin" && copp.source === "crystal" && copp.merlinDefault, copp);
  const cs = await act(ANA, { type: "add", company: "Copperleaf Kitchens", website: "copperleaf.example", newEngagement: true, engagementFields: { function: "RevOps", status: "Active", operator: "Ana Member" }, operatorMemberId: "me" });
  copp = await at(ANA, "c_copp");
  check("then her own seat there: Won, from her seats, the seat confirmed", copp?.stage === "won" && copp.via.won === "seat" && copp.seat === cs.id && /^From your seats on /.test(copp.how ?? ""), copp);

  console.log("\nintros");
  await act(ANA, { type: "unlock", entity: "company", id: pub("c_pine"), field: "identity" });
  // Who held the seat shows free once the company is open (PEERS_FREE): nothing to unlock.
  const cv = await act(ANA, { type: "message.start", engagementId: pub("e_pine"), text: "Hi Cy, could you introduce me to the CEO?" });
  r = await PA.performPipeline(ANA, { type: "pipeline.intro", conversationId: cv.id } as never);
  const ask = r.pipeline!.intros.find((i) => i.conversation === cv.id);
  check("Ana logs the ask: an intro, asked, Cy as the introducer", ask?.status === "asked" && ask.who === "Cy Introducer" && ask.member && ask.company === pub("c_pine"), ask);
  const cyv = await view(CY);
  const ofCy = cyv.intros.find((i) => i.id === ask!.id);
  check("Cy sees the ask: who asked and the company, nothing of Ana's pipeline", ofCy?.side === "of-you" && ofCy.who === "Ana Member" && cyv.entries.length === 0 && !JSON.stringify(cyv).includes("7731"), ofCy);
  check("Bo can't mark it", !!(await refused(PA.performPipeline(BO, { type: "pipeline.introMark", id: ask!.id, status: "made" } as never))));
  r = await PA.performPipeline(CY, { type: "pipeline.introMark", id: ask!.id, status: "made" } as never);
  check("Cy marks it made", /Ana sees the intro is made/.test(r.message), r.message);
  let pine = await at(ANA, "c_pine");
  check("Ana's deal at Pinecrest comes through the intro", pine?.intro?.by === "Cy Introducer" && pine.intro.status === "made" && pine.merlinDefault, pine);
  await PA.recordPipelineEvent("mem_ana", "c_pine", "signed");
  pine = await at(ANA, "c_pine");
  check("won: the intro is credited on the win", pine?.stage === "won" && pine.intro?.by === "Cy Introducer");
  check("Cy sees that it led to a win, and no more", (await view(CY)).intros.find((i) => i.id === ask!.id)?.won === true && !JSON.stringify(await view(CY)).includes("monthly"));
  await PA.performPipeline(ANA, { type: "pipeline.sent", companyId: "an-investor-key", intro: true, to: { name: "Ivy Investor", google: true } } as never);
  check("an ask for intros in general (an investor): an intro with no company, no entry", (await view(ANA)).intros.some((i) => i.who === "Ivy Investor" && i.company === null));

  console.log("\nthe admin's numbers");
  const stats = P.outcomeStats(await T.loadState());
  check("entries by stage", stats.byStage.won === 3 && stats.byStage.replied >= 2 && stats.byStage.meeting === 1 && stats.entries === stats.members * 0 + Object.values(stats.byStage).reduce((a, b) => a + b, 0), stats.byStage);
  check("conversion Sent to Replied to Meeting to Won, as shares", stats.reached.sent >= stats.reached.replied && stats.reached.replied >= stats.reached.meeting && stats.conversion.sentToWon !== null && stats.conversion.sentToWon! > 0 && stats.conversion.sentToWon! <= 1, stats.conversion);
  check("Won through Merlin and the month's value", stats.wonThroughMerlin === 3 && stats.monthlyValue === 11375 && stats.wonSeats === 2, stats);
  check("intros: asked, made, and the one that led to a win", stats.intros.made === 1 && stats.intros.won === 1 && stats.intros.asked >= 1, stats.intros);
  check("what it was detected from, counted", stats.detected.gmail >= 2 && stats.detected.calendar >= 1 && stats.detected.message >= 2 && stats.detected.proposal >= 2 && stats.detected.seat === 1, stats.detected);
  check("counts and sums only: no name, company, note or address", !has(stats, ["Ana", "Cy", "Larkfield", "Harborline", "7731", "@", "c_", "mem_"]).length, has(stats, ["Ana", "Larkfield", "c_", "mem_"]));

  /* ================= deleting what came from Google ================= */
  // Everyone the fake Google gave Merlin for Ana (Gmail headers, calendar guests), and a name and title she marked as from her Google account.
  const GOOGLE_PEOPLE = ["Kit Example", "kit@dune.example", "Oli Example", "oli@outer.example", "Dana Whitfield", "dana@lark.example", "Priya Raman", "priya@corvid.example", "Ivy Investor", "Director of Operations"];
  const anaState = () => JSON.stringify({ network: JSON.parse(stateFile()).network?.mem_ana ?? null, pipeline: JSON.parse(stateFile()).pipeline?.mem_ana ?? null });
  const raw = (companyId: string) => (JSON.parse(stateFile()).pipeline.mem_ana.entries as import("../lib/pipeline").PipelineEntry[]).find((e) => e.companyId === companyId);
  const ballAdd = (c: string) =>
    T.tableInternals.mutate((s) => {
      s.radar!.members.mem_ana.days![today].push(row("mem_ana", c) as never);
    });
  // Outerbank joins her Crystal Ball, so the email out to Oli opens an entry by itself: Gmail's alone.
  await ballAdd("c_outr");
  await sync("mem_ana");
  const outr0 = await at(ANA, "c_outr");
  check("set-up: Gmail opens an entry at Outerbank by itself, to Oli, and she does nothing with it", outr0?.source === "gmail" && outr0.to.name === "Oli Example" && outr0.notes.length === 0, outr0);
  check("set-up: every one of those people is in her state before", GOOGLE_PEOPLE.every((w) => stateFile().includes(w)), GOOGLE_PEOPLE.filter((w) => !stateFile().includes(w)));
  const stages0 = Object.fromEntries((await view(ANA)).entries.map((e) => [e.company, { stage: e.stage, dates: e.dates }]));
  const larkRaw0 = raw("c_lark")!;

  console.log("\nDisconnect and delete everything: the pipeline too");
  await G.disconnectAll(ANA);
  const s1 = stateFile();
  check("no name, email or title from Google is left anywhere in the state", !has(s1, GOOGLE_PEOPLE).length, has(s1, GOOGLE_PEOPLE));
  check("her network is gone, Bo's stays", !JSON.parse(s1).network?.mem_ana && !!JSON.parse(s1).network?.mem_bo);
  const av1 = await view(ANA);
  check("the entry only Gmail opened (Outerbank) is gone", !av1.entries.some((e) => e.company === pub("c_outr")));
  const kept = ["c_lark", "c_corv", "c_salt", "c_tall", "c_harb", "c_copp", "c_pine", "c_bfin", "c_dune"];
  check(
    "every entry she acted on stays, at the same stage with the same dates",
    kept.every((c) => {
      const e = av1.entries.find((x) => x.company === pub(c));
      return !!e && e.stage === stages0[pub(c)].stage && JSON.stringify(e.dates) === JSON.stringify(stages0[pub(c)].dates);
    }),
    kept.map((c) => [c, av1.entries.find((x) => x.company === pub(c))?.stage, stages0[pub(c)]?.stage]),
  );
  const lark1 = av1.entries.find((e) => e.company === pub("c_lark"))!;
  const larkRaw1 = raw("c_lark")!;
  check(
    "Larkfield: Replied, sent from her note, without Dana's name and title, Gmail's mark or Gmail's times",
    lark1.stage === "replied" && lark1.via.sent === "note" && !lark1.via.replied && !lark1.to.name && !lark1.to.role && !lark1.to.google && !larkRaw1.seen.in && !larkRaw1.seen.out && larkRaw0.seen.in !== undefined && !larkRaw1.log.some((l) => /Gmail/.test(l.text)) && larkRaw1.follow === larkRaw0.follow && larkRaw1.due === larkRaw0.due,
    { lark1, seen: larkRaw1.seen, log: larkRaw1.log },
  );
  const corv1 = raw("c_corv")!;
  check("Corvid: still Meeting, without the calendar's mark, its meeting days or Priya", corv1.stage === "meeting" && !corv1.via.meeting && !corv1.seen.met && !corv1.seen.next && !corv1.to.name && !corv1.log.some((l) => /calendar/.test(l.text)), corv1);
  const dune1 = raw("c_dune")!;
  check("Dune: Gmail opened it but she added a note, so it stays, with her note, without Kit or Gmail's mark", !!dune1 && dune1.notes.some((n) => n.text.includes("4410")) && !dune1.to.name && !dune1.via.sent && dune1.source !== "gmail" && dune1.stage === stages0[pub("c_dune")].stage, dune1);
  check("what Merlin itself knows stays: the seat holder she messaged, her own notes, the Won terms", raw("c_salt")!.to.name === "Hana Holder" && raw("c_tall")!.to.name === "Pella Quist" && raw("c_tall")!.notes.some((n) => n.text.includes("7731")) && raw("c_harb")!.won?.rate === 175 && raw("c_copp")!.to.name === "Rory Example");
  const intros1 = (await view(ANA)).intros;
  check("intros stay: the one through Cy as it was, the ask of someone from her Google account without their name", intros1.some((i) => i.who === "Cy Introducer" && i.status === "made") && intros1.some((i) => i.company === null && i.who === "Someone you know"), intros1.map((i) => [i.who, i.status]));
  check("Bo's pipeline and network are untouched", (await view(BO)).entries.length === 0 && !!JSON.parse(s1).network.mem_bo.google);

  console.log("\nAccess removed at Google: kept 29 days, deleted at 30");
  check("Ana connects again", (await fin(ANA, "code-ana")).outcome === "connected" && (await fin(ANA, "code-ana-gmail", "gmail")).outcome === "gmail");
  await sync("mem_ana");
  check("set-up: Gmail opens Outerbank again, to Oli", (await at(ANA, "c_outr"))?.to.name === "Oli Example");
  const T0 = Date.now();
  // Gmail's own access ends (test access lasts 7 days), Calendar and Contacts carry on.
  dead.add("REFRESH-anagm-secret");
  await G.syncMember("mem_ana", T0);
  const v0 = (await G.networkView(ANA, T0 + DAY)) as import("../lib/google/types").NetworkView;
  check("Gmail needs reconnecting, with the day it was found and the day it goes", v0.gmail?.status === "reconnect" && v0.gmail.goneAt === new Date(T0).toISOString() && v0.gmail.deleteOn === new Date(T0 + 30 * DAY).toISOString().slice(0, 10) && v0.google?.status === "ok" && v0.google.goneAt === null, v0.gmail);
  check("29 days on: nothing deleted", (await G.expireRevoked(T0 + 29 * DAY)) === 0 && stateFile().includes("oli@outer.example") && !!(await at(ANA, "c_outr")));
  check("30 days on: Gmail and what it found go, Calendar stays", (await G.expireRevoked(T0 + 30 * DAY)) === 1 && !stateFile().includes("oli@outer.example") && !stateFile().includes("Oli Example") && !JSON.parse(stateFile()).network.mem_ana.gm && !JSON.parse(stateFile()).network.mem_ana.gmail && !!JSON.parse(stateFile()).network.mem_ana.cal);
  check("and the entry only Gmail opened goes with it", !(await at(ANA, "c_outr")));
  // Then she removes Merlin in her Google Account.
  dead.add("REFRESH-ana-secret");
  await G.syncMember("mem_ana", T0);
  const v1 = (await G.networkView(ANA, T0 + 2 * DAY)) as import("../lib/google/types").NetworkView;
  check("Google needs reconnecting, removed on the day Merlin found it, deleted 30 days later", v1.google?.status === "reconnect" && v1.google.goneAt === new Date(T0).toISOString() && v1.google.deleteOn === new Date(T0 + 30 * DAY).toISOString().slice(0, 10), v1.google);
  const v29 = (await G.networkView(ANA, T0 + 29 * DAY)) as import("../lib/google/types").NetworkView;
  check("29 days on: her network is still there, and the state still has Priya from her calendar", v29.google?.status === "reconnect" && v29.companies.some((c) => c.name === "Corvid Health") && stateFile().includes("priya@corvid.example") && (await G.expireRevoked(T0 + 29 * DAY)) === 0);
  const stages29 = Object.fromEntries((await view(ANA)).entries.map((e) => [e.company, e.stage]));
  const v30 = (await G.networkView(ANA, T0 + 30 * DAY)) as import("../lib/google/types").NetworkView;
  const s30 = stateFile();
  check("30 days on: deleted before it is shown, nothing of it left anywhere in her state", !v30.google && v30.companies.length === 0 && !JSON.parse(s30).network?.mem_ana && !has(anaState(), GOOGLE_PEOPLE).length && !has(s30, GOOGLE_PEOPLE).length, has(s30, GOOGLE_PEOPLE));
  const av30 = await view(ANA);
  check("her pipeline keeps every deal she acted on, at the same stage", kept.every((c) => av30.entries.find((e) => e.company === pub(c))?.stage === stages29[pub(c)]), kept.map((c) => [c, av30.entries.find((e) => e.company === pub(c))?.stage, stages29[pub(c)]]));
  // Bo removes access too: the automatic jobs' check deletes his after 30 days.
  dead.add("REFRESH-bo-secret");
  await G.syncMember("mem_bo", T0);
  check("Bo: kept 29 days, then deleted by the check the automatic jobs run", (await G.expireRevoked(T0 + 29 * DAY)) === 0 && !!JSON.parse(stateFile()).network?.mem_bo && (await G.expireRevoked(T0 + 30 * DAY)) === 1 && !JSON.parse(stateFile()).network?.mem_bo);
  check("lib/jobs.ts runs that check with every due check", /expireRevoked\(nowMs\)/.test(src("lib/jobs.ts")) && /await expireGoogle\(nowMs\)/.test(src("lib/jobs.ts")));

  /* ================= a member without Gmail moves their own pipeline ================= */
  console.log("\nwithout Gmail: Did they reply by email?, and Move to");
  await act(BO, { type: "unlock", entity: "company", id: pub("c_lark"), field: "identity" });
  r = await PA.performPipeline(BO, { type: "pipeline.sent", companyId: pub("c_lark"), channel: "email", to: { role: "CEO" }, from: "record" } as never);
  let bl = r.pipeline!.entries.find((e) => e.company === pub("c_lark"))!;
  check("set-up: Bo (no Gmail) sends a note to Larkfield: Sent, no question yet", bl.stage === "sent" && !bl.ask && !(await view(BO)).sees.gmail, bl);
  await T.tableInternals.mutate((s) => {
    const e = s.pipeline!.mem_bo.entries.find((x) => x.companyId === "c_lark")!;
    e.lastOut = new Date(Date.now() - 31 * DAY).toISOString();
    e.dates.sent = e.lastOut;
    e.createdAt = e.lastOut;
    e.follow = 2;
    e.due = P.addDays(today, -1);
  });
  bl = (await at(BO, "c_lark"))!;
  check("31 days and two follow-ups on: not Went quiet, since Merlin couldn't see a reply", bl.stage === "sent" && !bl.dates.quiet, bl);
  check("its next step asks: No reply seen. Did they reply by email?", bl.ask === true && bl.next === "No reply seen. Did they reply by email?", bl);
  const boTool1 = await tools.myPipeline(await ctxOf(BO));
  check("the connector reads the same question", (boTool1.entries as { company_id: string; next_step?: string }[]).find((e) => e.company_id === pub("c_lark"))?.next_step === "No reply seen. Did they reply by email?");
  r = await PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: "replied" } as never);
  bl = r.pipeline!.entries.find((e) => e.id === bl.id)!;
  check("one tap, Replied: the member's own, You marked it", bl.stage === "replied" && bl.via.replied === "you" && /^You marked it on /.test(bl.how ?? "") && !bl.ask && r.message === "Moved to Replied." && bl.log.at(-1)!.text === "You moved it to Replied", bl);
  check("another member can't move it", !!(await refused(PA.performPipeline(ANA, { type: "pipeline.move", id: bl.id, stage: "won" } as never))));
  check("Went quiet, or a made-up stage, can't be chosen", !!(await refused(PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: "quiet" } as never))) && !!(await refused(PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: "signed" } as never))));
  for (const st of ["meeting", "proposal", "won"] as const) r = await PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: st } as never);
  bl = r.pipeline!.entries.find((e) => e.id === bl.id)!;
  check("Meeting, Proposal, then Won by hand: Add it as your seat, Reopen but no Not a win", bl.stage === "won" && bl.via.won === "you" && bl.next === "Add it as your seat" && bl.fix.includes("reopen") && !bl.fix.includes("notWon"), bl);
  r = await PA.performPipeline(BO, { type: "pipeline.won", id: bl.id, pricing: "monthly", rate: 8000 } as never);
  check("a Won by hand takes its terms", r.pipeline!.entries.find((e) => e.id === bl.id)!.won?.monthly === 8000, r.message);
  r = await PA.performPipeline(BO, { type: "pipeline.reopen", id: bl.id } as never);
  bl = r.pipeline!.entries.find((e) => e.id === bl.id)!;
  check("Reopen a Won: back to Proposal, the terms gone", bl.stage === "proposal" && !bl.won && !bl.dates.won, bl);
  for (const st of ["lost", "notnow", "reach", "sent"] as const) {
    r = await PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: st } as never);
    check(`Move to ${P.STAGE_WORDS[st]}`, r.pipeline!.entries.find((e) => e.id === bl.id)!.stage === st, r.message);
  }
  const ut = await tools.updatePipeline(await ctxOf(BO), { entry_id: bl.id, action: "move", stage: "Meeting" });
  check("update_pipeline moves it too (stage in words)", ut.ok === true && ut.stage === "Meeting", ut);
  check("update_pipeline refuses Went quiet", /Went quiet is Merlin's alone/.test((await refused(tools.updatePipeline(await ctxOf(BO), { entry_id: bl.id, action: "move", stage: "Went quiet" }))) ?? ""));
  check("update_pipeline reopens", (await tools.updatePipeline(await ctxOf(BO), { entry_id: bl.id, action: "lost" })).stage === "Lost" && (await tools.updatePipeline(await ctxOf(BO), { entry_id: bl.id, action: "reopen" })).stage === "Meeting");

  console.log("\nphantom wins: only a seat of this deal");
  await PA.performPipeline(BO, { type: "pipeline.move", id: bl.id, stage: "sent" } as never);
  await T.tableInternals.mutate((s) => {
    const e = s.pipeline!.mem_bo.entries.find((x) => x.companyId === "c_lark")!;
    e.dates.sent = new Date(Date.now() - 2 * DAY).toISOString();
    e.lastOut = e.dates.sent;
  });
  const pastSeat = await act(BO, { type: "add", company: "Larkfield Robotics", website: "lark.example", newEngagement: true, engagementFields: { function: "RevOps", type: "Fractional", status: "Ended", start: "2019-03", end: "2020-01", operator: "Bo Other" }, operatorMemberId: "me" });
  bl = (await at(BO, "c_lark"))!;
  check("a 2019 seat Bo adds now (for credits) is no win: still Sent", !!pastSeat.id && bl.stage === "sent" && !bl.seat, bl);
  const ftSeat = await act(BO, { type: "add", company: "Larkfield Robotics", website: "lark.example", newEngagement: true, engagementFields: { function: "RevOps", type: "Full-time", status: "Active", start: thisMonth, operator: "Bo Other" }, operatorMemberId: "me" });
  bl = (await at(BO, "c_lark"))!;
  check("a Full-time seat there is no win", !!ftSeat.id && bl.stage === "sent", bl);
  const newSeat = await act(BO, { type: "add", company: "Larkfield Robotics", website: "lark.example", newEngagement: true, engagementFields: { function: "RevOps", type: "Fractional", status: "Active", start: thisMonth, operator: "Bo Other" }, operatorMemberId: "me" });
  bl = (await at(BO, "c_lark"))!;
  check("a fractional seat that started this month, added after Sent: Won, from his seats", bl.stage === "won" && bl.via.won === "seat" && bl.seat === newSeat.id && bl.fix.includes("notWon") && bl.fix.includes("reopen"), bl);
  r = await PA.performPipeline(BO, { type: "pipeline.correct", id: bl.id } as never);
  bl = r.pipeline!.entries.find((e) => e.id === bl.id)!;
  check("Not a win: back to Sent, the seat set aside", bl.stage === "sent" && !bl.seat && !bl.dates.won && /^Back to Sent/.test(r.message), [bl.stage, r.message]);
  check("and the seat doesn't win it again on the next look", (await at(BO, "c_lark"))!.stage === "sent");

  console.log(`\n${passed} passed, ${failed} failed`);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log("FAIL the run threw:", e);
} finally {
  google.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
