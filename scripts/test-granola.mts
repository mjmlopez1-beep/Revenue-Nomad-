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
 */
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
    seen: { mem_jordan: iso(NOW - DAY), mem_bo: iso(NOW - DAY) },
    profiles: {},
    billing: { members: { mem_jordan: trial, mem_bo: { trialStartedAt: iso(NOW - 40 * DAY), trialEndsAt: iso(NOW - 26 * DAY) } }, events: [], payments: [], ended: [] },
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
}

try {
  await main();
} catch (e) {
  failed++;
  console.log("FAIL the run threw", e instanceof Error ? e.stack : e);
}
granola.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
