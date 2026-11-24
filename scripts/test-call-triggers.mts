/**
 * Checks of "A call ends" (lib/calls, RN_CALL_TRIGGERS): call recorders as one connection type
 * (Granola by its MCP server, Fathom by its API key), the scheduler's tick, the company matched by
 * the participants' domain, the conditions (a sales call; only if we agreed to send ...), the call
 * steps (the proposal with the member's template and Evidence Bank proof, the follow-up email in
 * their voice, an SOW, a deck outline, the Claude route's prompt and pack), the ready email and the
 * bell line, the plan gates, the AI budget, the flag off.
 *
 * In process, on a made-up seed in a temporary data dir, with fetch replaced: a fake Granola (its
 * discovery, registration and MCP tools), a fake Fathom API, a fake Anthropic API and a fake email
 * API. Nothing leaves the machine; no real call, transcript or member.
 *
 *   npx tsx scripts/test-call-triggers.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-calls-"));
const MIN = 60_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const future = iso(t0 + 20 * DAY);
const seen = iso(t0 - 2 * DAY);

const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", token: "tok-jordan-0001" },
    { id: "mem_riley", name: "Riley Moss", email: "riley@moss.example", title: "Fractional CMO", token: "tok-riley-0001" },
    { id: "mem_free", name: "Frankie Free", email: "frankie@free.example", title: "Fractional CFO", token: "tok-free-0001" },
  ],
  companies: [
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX", revenue: "$5M–$20M" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_lark", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "E-Learning Providers", employees: "51-200", hq: "Boston, MA" } },
  ],
  engagements: [],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Jordan opened Cedar and Pine and Northwind; Halcyon Freight stays locked for Jordan. Riley opened Larkspur.
    unlocks: { "c_cedar.identity": ["mem_jordan"], "c_north.identity": ["mem_jordan"], "c_lark.identity": ["mem_riley"] },
    seen: { mem_jordan: seen, mem_riley: seen, mem_free: seen },
    profiles: { mem_jordan: { function: "Sales", onboarded: true, title: "Fractional VP Sales" }, mem_riley: { function: "Marketing", onboarded: true }, mem_free: { function: "Finance", onboarded: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: {} },
    // Plans: Jordan on Close, Riley on Pro, Frankie on Free (no record).
    billing: { members: { mem_jordan: { tier: "close", proUntil: future }, mem_riley: { tier: "pro", proUntil: future } }, events: [], payments: [], ended: [] },
    // Jordan's voice: casual, "Hey", "Cheers".
    voice: { mem_jordan: { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: [], at: seen, by: "you" } },
  }),
);

const GB = "http://127.0.0.1:7061";
const FB = "http://127.0.0.1:7062/external/v1";
const AI_BASE = "http://127.0.0.1:7063/fake-anthropic";
const MAIL = "http://127.0.0.1:7064/fake-email";
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_WORKFLOWS: "1",
  RN_GRANOLA: "1",
  RN_GRANOLA_MCP_URL: `${GB}/mcp`,
  RN_FATHOM: "1",
  RN_FATHOM_API_TEST: FB,
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_madeup_not_a_key",
  STRIPE_WEBHOOK_SECRET: "whsec_madeup",
  STRIPE_PRICE_MONTH: "price_month_madeup",
  STRIPE_PRICE_YEAR: "price_year_madeup",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
  RN_EMAIL_API_URL: MAIL,
});
for (const k of ["RN_CALL_TRIGGERS", "RN_FREE_COMPANY", "RN_DIGEST", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_GOOGLE"]) delete process.env[k];

/* ---------- the made-up calls ---------- */

const UNIQUE = "purple forecast spreadsheet";
const UNIQUE2 = "seventeen warehouse whiteboards";
const UNIQUE3 = "lavender pipeline audit";
const turn = (at: number, who: string, text: string) => `[${new Date(at).toISOString().slice(11, 19)}] ${who}: ${text}`;
interface FakeMeeting {
  id: string;
  title: string;
  start: number;
  minutes: number;
  people: { name: string; email: string }[];
  lines: [string, string][];
}
const sales = (start: number): [string, string][] => [
  ["Jordan Avery", "Good to meet you. What made you look at a fractional sales leader now?"],
  ["Dana Whitfield", `Our pipeline lives in a ${UNIQUE} and nobody trusts the forecast. We want to double revenue next year.`],
  ["Dana Whitfield", "We have budget for this. Ideally someone two days a week, starting in January."],
  ["Jordan Avery", "That fits. The retainer would be $12,000 a month for two days a week, with a first term of 3 months."],
  ["Dana Whitfield", "That works for us. What's the next step on your side?"],
  ["Jordan Avery", "I'll put together a proposal and send it over, with a short recap email of what we agreed today."],
  ["Dana Whitfield", "Perfect. Let's meet Thursday to review it together and decide."],
  ["Jordan Avery", `Great. I'll bring the timeline. ${start ? "" : ""}`],
];
const meetings: FakeMeeting[] = [
  // A discovery call with Cedar and Pine (open to Jordan): a proposal and a recap agreed.
  { id: "not_cedarcall00001", title: "Cedar and Pine x Jordan: discovery", start: t0 - 45 * MIN, minutes: 35, people: [{ name: "Jordan Avery", email: "jordan@avery.example" }, { name: "Dana Whitfield", email: "dana@cedarpine.example" }], lines: sales(1) },
  // An internal standup: nobody from outside Jordan's company. Left alone.
  { id: "not_standup0000001", title: "Weekly standup", start: t0 - 40 * MIN, minutes: 15, people: [{ name: "Jordan Avery", email: "jordan@avery.example" }, { name: "Sam Lee", email: "sam@avery.example" }], lines: [["Sam Lee", "Quick update on the website copy and the newsletter. Nothing else from me today, thanks."]] },
  // A sales call with Halcyon Freight (locked for Jordan): nothing agreed.
  {
    id: "not_halcyon0000001",
    title: "Intro call",
    start: t0 - 50 * MIN,
    minutes: 30,
    people: [{ name: "Jordan Avery", email: "jordan@avery.example" }, { name: "Quinn Rivers", email: "quinn@halcyon.example" }],
    lines: [
      ["Jordan Avery", "Thanks for making the time. Tell me about the sales team and the budget you set aside for it."],
      ["Quinn Rivers", `We run ${UNIQUE2} for the forecast. The pricing of our freight contracts is our real issue this year.`],
      ["Quinn Rivers", "We aren't ready to hire anyone yet. Let's stay in touch and talk again in the spring."],
      ["Jordan Avery", "Understood. I'm happy to stay in touch."],
    ],
  },
];
const gMeeting = (n: FakeMeeting) => `<meeting id="${n.id}" title="${n.title}" meeting_at="${iso(n.start)}" meeting_end="${iso(n.start + n.minutes * MIN)}">\n<known_participants total="${n.people.length}">\n${n.people.map((p) => `${p.name} &lt;${p.email}&gt;`).join("\n")}\n</known_participants>\n<excerpt>Summary SECRETSUMMARY</excerpt>\n</meeting>`;
const gTranscript = (n: FakeMeeting) => n.lines.map(([who, text], i) => turn(n.start + i * MIN, who, text)).join("\n");

// Fathom: Riley's call with Larkspur Learning (open to Riley), a recap agreed.
const fathomMeetings = [
  {
    recording_id: "rec_lark_0001",
    title: "Larkspur Learning: marketing discovery",
    created_at: iso(t0 - 40 * MIN),
    scheduled_start_time: iso(t0 - 40 * MIN),
    scheduled_end_time: iso(t0 - 10 * MIN),
    recording_start_time: iso(t0 - 40 * MIN),
    recording_end_time: iso(t0 - 12 * MIN),
    recorded_by: { name: "Riley Moss", email: "riley@moss.example" },
    calendar_invitees: [
      { name: "Riley Moss", email: "riley@moss.example", email_domain: "moss.example", is_external: false },
      { name: "Avery Stone", email: "avery@larkspur.example", email_domain: "larkspur.example", is_external: true },
    ],
  },
];
const fathomTranscript = {
  transcript: [
    { speaker: { display_name: "Riley Moss", matched_calendar_invitee_email: "riley@moss.example" }, text: "Thanks for the time. Tell me about your marketing budget and the engagement you have in mind.", timestamp: "00:00:05" },
    { speaker: { display_name: "Avery Stone", matched_calendar_invitee_email: "avery@larkspur.example" }, text: `Our ${UNIQUE3} showed we need a fractional CMO, with a start date in February and a clear fee.`, timestamp: "00:01:10" },
    { speaker: { display_name: "Riley Moss", matched_calendar_invitee_email: "riley@moss.example" }, text: "I'll send you a recap email with the next steps tomorrow.", timestamp: "00:02:00" },
    { speaker: { display_name: "Avery Stone", matched_calendar_invitee_email: "avery@larkspur.example" }, text: "Great, let's talk again next week.", timestamp: "00:02:30" },
  ],
};

/* ---------- fetch, replaced ---------- */

const calls: { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
const mails: { to: string; subject: string; text: string; html: string }[] = [];
const aiCalls: { system: string; content: string }[] = [];
let others = 0;
let granolaDown = false;
let aiReading: () => unknown = () => ({});
const DRAFT_JSON = {
  title: "A sales system for Cedar and Pine",
  blocks: [
    { block_id: "cover", title: "Cover", body: "A forecast you can trust\n\nPrepared for Dana Whitfield, Cedar and Pine" },
    { block_id: "what_we_heard", title: "What we heard", body: "- Nobody trusts the forecast.\n- You want to double revenue next year." },
    { block_id: "investment", title: "Investment", body: "$12,000 a month for two days a week. Start date: {{start.date}}." },
  ],
  fields: { monthly_fee: "$12,000", step_down_fee: "", allocation: "two days a week", initial_months: "3", notice_days: "", goal: "Double revenue next year", call_date: "", next_step: "Thursday: review it together" },
  signer: { name: "Dana Whitfield", title: "" },
  signer_on_call: "yes",
  notes: [],
  to_fix: ["Confirm the start date"],
};
const reply = (json: unknown, use = { input_tokens: 1000, output_tokens: 500 }) => ({ id: "msg_fake", type: "message", role: "assistant", model: "model-from-the-env", content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null, usage: use });
const J = (status: number, body: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...h } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => (headers[k] = v));
  const raw = init?.body ?? (input instanceof Request ? await input.text() : "");
  const text = typeof raw === "string" ? raw : raw ? new TextDecoder().decode(raw as ArrayBuffer) : "";
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = Object.fromEntries(new URLSearchParams(text));
  }
  calls.push({ url, method, headers, body });
  if (url.startsWith(MAIL)) {
    mails.push({ to: (body.to as string[])[0], subject: String(body.subject), text: String(body.text), html: String(body.html) });
    return J(200, { id: "fake" });
  }
  if (url.startsWith(AI_BASE)) {
    const system = String(body.system ?? "");
    const content = String((body.messages as { content: string }[])?.[0]?.content ?? "");
    aiCalls.push({ system, content });
    return J(200, reply(/You read a sales call/.test(system) ? aiReading() : DRAFT_JSON), { "request-id": "req_fake" });
  }
  if (url.startsWith(GB)) {
    if (granolaDown) return J(503, { error: "down" });
    const p = new URL(url).pathname;
    if (p === "/.well-known/oauth-protected-resource/mcp") return J(200, { resource: `${GB}/mcp`, authorization_servers: [`${GB}/auth`], scopes_supported: ["meetings:read"] });
    if (p === "/.well-known/oauth-authorization-server/auth")
      return J(200, { issuer: `${GB}/auth`, authorization_endpoint: `${GB}/auth/authorize`, token_endpoint: `${GB}/auth/token`, registration_endpoint: `${GB}/auth/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    if (p === "/auth/register") return J(201, { client_id: "cl_fake", token_endpoint_auth_method: "none", redirect_uris: body.redirect_uris });
    if (p === "/mcp") {
      if (headers.authorization !== "Bearer at_FAKE_ACCESS") return J(401, { error: "invalid_token" });
      const m = body as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (m.method === "initialize") return J(200, { jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "granola-fake", version: "1" } } }, { "mcp-session-id": "sess_1" });
      if (m.method === "notifications/initialized") return new Response(null, { status: 202 });
      const a = m.params?.arguments ?? {};
      const out = (t: string, isError = false) => J(200, { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: t }], isError } });
      if (m.params?.name === "search_meetings") {
        const from = Date.parse(String(a.from_date ?? "")) || 0;
        const to = Date.parse(String(a.to_date ?? "")) || Infinity;
        const hit = meetings.filter((n) => n.start >= from && n.start <= to).sort((x, y) => y.start - x.start);
        return out(`<meetings count="${hit.length}">\n${hit.map(gMeeting).join("\n")}\n</meetings>`);
      }
      if (m.params?.name === "get_meetings") {
        const hit = meetings.filter((n) => ((a.meeting_ids as string[]) ?? []).includes(n.id));
        return out(`<meetings>\n${hit.map(gMeeting).join("\n")}\n</meetings>`);
      }
      if (m.params?.name === "get_meeting_transcript") {
        const n = meetings.find((x) => x.id === a.meeting_id);
        if (!n) return out("Meeting not found.", true);
        return out(JSON.stringify({ meeting_id: n.id, transcript: gTranscript(n), total_chars: gTranscript(n).length, truncated: false, next_offset: null }));
      }
      return J(200, { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "unknown tool" } });
    }
    return J(404, { error: "not_found" });
  }
  if (url.startsWith(FB)) {
    if (headers["x-api-key"] !== "fathom_key_FAKE_0123456789") return J(401, { error: "unauthorized" });
    const u = new URL(url);
    if (u.pathname.endsWith("/meetings")) {
      const after = Date.parse(u.searchParams.get("created_after") ?? "") || 0;
      return J(200, { items: u.searchParams.get("limit") === "1" ? fathomMeetings.slice(0, 1) : fathomMeetings.filter((x) => Date.parse(x.created_at) >= after), next_cursor: null, limit: 10 });
    }
    if (/\/recordings\/rec_lark_\d{4}\/transcript$/.test(u.pathname)) return J(200, fathomTranscript);
    return J(404, { error: "not_found" });
  }
  others++;
  return J(200, {});
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 900)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => "", (e: Error) => e?.message ?? String(e));
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

async function main() {
  const t = await import("../lib/table");
  const W = await import("../lib/workflows");
  const WT = await import("../lib/workflows/types");
  const C = await import("../lib/calls");
  const CT = await import("../lib/calls/types");
  const F = await import("../lib/calls/fathom");
  const S = await import("../lib/proposals/store");
  const E = await import("../lib/evidence/store");
  const { seal } = await import("../lib/google/crypto");
  const { getCallPack } = await import("../lib/mcp/calls");
  const { AGENT_TOOLS } = await import("../lib/mcp/agentTools");
  const n = await import("../lib/notify");
  const T = t.tableInternals;
  const act = (tok: string, a: Record<string, unknown>) => t.perform(tok, a as never) as Promise<{ message: string; workflows?: import("../lib/workflows/types").WorkflowsView }>;
  const JT = "tok-jordan-0001";
  const RT = "tok-riley-0001";
  const FT = "tok-free-0001";
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await n.settled();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const runsOf = async (memberId: string) => (await t.loadState()).workflows?.[memberId]?.runs ?? [];

  /* ---------- the pure rules ---------- */
  console.log("\nThe rules");
  check("a call with nobody from outside is internal", CT.kindByRules({ title: "Discovery", external: 0 }) === "internal");
  check("a standup is not a sales call, a discovery call is", CT.kindByRules({ title: "Weekly standup", external: 1 }) === "other" && CT.kindByRules({ title: "Cedar and Pine x Jordan: discovery", external: 1 }) === "sales");
  check("the pipeline's open stage makes it a sales call; Won makes it a client's", CT.kindByRules({ title: "Catch up", external: 1, stage: "meeting" }) === "sales" && CT.kindByRules({ title: "Catch up", external: 1, stage: "won" }) === "client");
  check("an unknown title waits for the transcript", CT.kindByRules({ title: "Catch up", external: 1 }) === "unknown");
  const rr = CT.readByRules(sales(1).map(([w, x]) => `${w}: ${x}`).join("\n"));
  check("the rules read what was agreed: a proposal and a recap email", rr.agreed.join() === "proposal,followup", rr);
  check("the rules read the next day and the terms, never a quote", rr.nextDay === "thursday" && rr.terms["pricing.monthlyFee"] === "$12,000", rr);
  check("nothing agreed reads as nothing", CT.readByRules(meetings[2].lines.map(([w, x]) => `${w}: ${x}`).join("\n")).agreed.length === 0);
  const longPrompt = CT.claudePrompt({ pack: "cp_abc123", deliverable: "proposal", company: "Cedar and Pine", transcript: false });
  const link = CT.claudeLink(longPrompt + " ".repeat(10) + "x".repeat(3000) + ". More words.");
  check("the Open in Claude link stays under the address limit", link.startsWith("https://claude.ai/new?q=") && link.length <= CT.CLAUDE_URL_MAX, link.length);
  check("a locked company is never named in the prompt", /the company on the call/.test(CT.claudePrompt({ pack: "cp_x", deliverable: "deck", company: null, transcript: true })));
  check("the three recipes are there, each its own words", ["call-proposal", "call-followup", "call-claude"].every((k) => WT.RECIPES.some((r) => r.key === k && r.title?.startsWith("After a sales call"))));
  check("call steps fit only A call ends, and cost no credits", WT.CALL_STEPS.every((k) => WT.STEPS[k].fits.join() === "call" && !WT.STEPS[k].paid));
  check("the plan gates: the proposal is Close, the follow-up email Pro and Close", WT.planHolds({ trigger: "call", steps: [{ key: "proposal" }, { key: "followup" }] }, { paid: true, proposals: false, evidence: false }).steps.proposal === "Part of Close" && !WT.planHolds({ trigger: "call", steps: [{ key: "followup" }] }, { paid: true, proposals: false, evidence: false }).steps.followup && WT.planHolds({ trigger: "call", steps: [{ key: "followup" }] }, { paid: false, proposals: false, evidence: false }).steps.followup === "Part of Pro");
  check("Get_call_pack sits behind Agent access's switches, offered only with the call triggers", AGENT_TOOLS.some((x) => x.key === "get_call_pack" && x.needs === "calls" && x.cost === "close"));

  /* ---------- connections ---------- */
  console.log("\nConnecting the recorders");
  // Jordan connected Granola with its sign-in (made up, sealed as Connect Granola keeps it).
  await T.mutate((d) => {
    (d as unknown as { granola: Record<string, unknown> }).granola = { mem_jordan: { via: "oauth", access: seal("at_FAKE_ACCESS"), connectedAt: seen, client: "cl_fake" } };
  });
  check("Fathom: a key that doesn't look like one is refused", /doesn't look like/.test(await refused(F.connectFathom(RT, "x"))));
  check("Fathom: a key Fathom refuses isn't kept", /didn't accept/.test(await refused(F.connectFathom(RT, "fathom_key_WRONG_0123456789"))) && !F.fathomLinkOf(await t.loadState(), "mem_riley"));
  const fc = await F.connectFathom(RT, "fathom_key_FAKE_0123456789");
  const fcall = calls.filter((x) => x.url.startsWith(FB)).pop()!;
  check("Fathom: checked with one call, the key in X-Api-Key, at the external API", fc.status.connected && fc.status.last4 === "6789" && fcall.headers["x-api-key"] === "fathom_key_FAKE_0123456789" && /\/external\/v1\/meetings\?limit=1$/.test(fcall.url), fcall);
  check("Fathom: the key is sealed at rest, never in the state as typed", !stateFile().includes("fathom_key_FAKE_0123456789") && stateFile().includes('"fathom"'));

  /* ---------- the flag off ---------- */
  console.log("\nRN_CALL_TRIGGERS off");
  const before = calls.length;
  check("off: the tick does nothing and asks no recorder", (await C.callTick(t0)) === 0 && calls.length === before);
  check("off: the builder offers no call trigger", !(((await W.workflowsFor(JT)) as { calls?: unknown }).calls));
  check("off: a call workflow doesn't save", /switched on/.test(await refused(act(JT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "proposal" }], call: { sales: true, agreed: ["proposal"] } }))));
  process.env.RN_CALL_TRIGGERS = "1";

  /* ---------- plan gates ---------- */
  console.log("\nPlan gates");
  check("Free: the follow-up email is part of Pro", /part of pro/i.test(await refused(act(FT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "followup" }], call: {} }))));
  check("Pro: drafting the proposal is part of Close", /part of close/i.test(await refused(act(RT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "proposal" }], call: {} }))));
  check("Pro: preparing it for Claude is part of Close", /part of close/i.test(await refused(act(RT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "claude" }], call: {} }))));
  const rv = await act(RT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "followup" }], call: { sales: true } });
  check("Pro: After a sales call, draft the follow-up email saves, named as the recipe", rv.workflows?.flows[0]?.name === "After a sales call, draft the follow-up email" && rv.workflows.flows[0].call?.sales === true, rv.workflows?.flows);
  const jv0 = (await W.workflowsFor(JT)) as import("../lib/workflows/types").WorkflowsView;
  check("on: the builder knows the recorders, the templates and whether Merlin's AI reads the call", !!jv0.calls && jv0.calls.recorders.map((r) => `${r.key}:${r.connected}`).join() === "granola:true,fathom:false" && jv0.calls.templates.some((x) => x.id === "sprint-90") && jv0.calls.ai === false, jv0.calls);

  // Jordan's ready case in Evidence Bank, close to Cedar and Pine.
  const ev = await E.saveCase(JT, { title: "A sales system for a software company", industry: "Software Development", size: "11–50", revenue: "$5M–$20M", motion: "Sales-led", fn: "Sales", problems: ["Build a repeatable sales process"], answers: { problem: "The forecast was a guess.", did: "Built the pipeline review and hired two reps." }, status: "ready" });

  const jp = await act(JT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "proposal" }], call: { sales: true, agreed: ["proposal"], template: "sprint-90" } });
  await act(JT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "followup" }], call: { sales: true, agreed: [] } });
  await act(JT, { type: "workflow.save", trigger: "call", scope: { kind: "calls" }, steps: [{ key: "claude" }], call: { sales: true, agreed: [], transcript: false } });
  const jflows = (await t.loadState()).workflows!.mem_jordan.flows;
  check("Close: the three recipes save, each with its conditions", jflows.length === 3 && jflows[0].call?.agreed.join() === "proposal" && jflows[0].call.template === "sprint-90" && jp.workflows!.flows[0].say.includes("we agreed to send a proposal"), jflows.map((f) => f.call));

  /* ---------- the first tick ---------- */
  console.log("\nA call ends");
  const nowA = t0;
  const made = await C.callTick(nowA);
  await settle();
  const st1 = await t.loadState();
  const jr = st1.workflows!.mem_jordan.runs;
  const [wfP, wfF, wfC] = jflows.map((f) => f.id);
  const cedarRuns = jr.filter((r) => /Cedar and Pine/.test(r.line));
  check("the tick ran the workflows the calls set off", made >= 4, made);
  check("the standup set off nothing: no run for it", !jr.some((r) => /avery\.example|standup/i.test(r.line)) && !calls.some((x) => x.url.startsWith(GB) && (x.body.params as { arguments?: { meeting_id?: string } })?.arguments?.meeting_id === "not_standup0000001"));
  check("each call workflow ran once for the Cedar and Pine call", [wfP, wfF, wfC].every((id) => cedarRuns.filter((r) => r.wf === id).length === 1), cedarRuns.map((r) => r.wf));
  const pRun = cedarRuns.find((r) => r.wf === wfP)!;
  check("the run says the company, matched by the participant's domain", /^Your call with Cedar and Pine ended/.test(pRun.line) && pRun.company === T.pubId("c_cedar"), pRun);
  const prop = (await S.getProposal(JT, pRun.built!.proposal!, "https://post.example.com"));
  check("the proposal is a draft, in the chosen template, linked to the company", prop.status === "draft" && prop.templateId === "sprint-90" && prop.company.id === T.pubId("c_cedar"), { status: prop.status, t: prop.templateId, c: prop.company });
  check("the proposal carries the closest Evidence Bank case as proof", (prop.proofCases ?? []).includes(ev.id) || (prop.fields.caseStudies ?? "").length > 0, { proof: prop.proofCases, cs: prop.fields.caseStudies });
  check("what the call settled fills it: the fee", prop.fields["pricing.monthlyFee"] === "$12,000", prop.fields);
  check("nothing was sent: the proposal has no send", !prop.sends?.length);
  const drafts = st1.workflows!.mem_jordan.drafts;
  const fu = drafts.find((d) => d.kind === "followup" && d.companyName === "Cedar and Pine");
  check("the follow-up email is a draft in the member's voice: their greeting and sign-off", !!fu && fu.body.startsWith("Hey Dana,") && /Cheers,\nJordan$/.test(fu.body) && /proposal/.test(fu.body) && /Thursday/.test(fu.body), fu);
  check("the follow-up email recaps without quoting the transcript", !!fu && !fu.body.includes(UNIQUE) && !fu.body.includes("Perfect."));
  const cRun = cedarRuns.find((r) => r.wf === wfC)!;
  const pack = st1.workflows!.mem_jordan.packs?.find((p) => p.id === cRun.built?.pack);
  check("the Claude route: an Open in Claude link with a prompt under the limit", !!cRun.built?.claude && cRun.built.claude.startsWith("https://claude.ai/new?q=") && cRun.built.claude.length <= CT.CLAUDE_URL_MAX && decodeURIComponent(cRun.built.claude).includes(`get_call_pack with pack_id ${cRun.built.pack}`), cRun.built);
  check("the pack keeps the summary and what was agreed, never the transcript", !!pack && /Cedar and Pine/.test(pack.summary) && pack.agreed.length > 0 && !JSON.stringify(pack).includes(UNIQUE) && pack.transcript === false, pack);
  const gp = (await getCallPack({ member: T.memberIndex(await t.loadSeed(), await t.loadState()).byId.get("mem_jordan")!, origin: "https://post.example.com" }, { pack_id: pack!.id })) as Record<string, unknown>;
  check("get_call_pack: the kit (template, voice), the closest cases, and no transcript unless ticked", gp.transcript === null && (gp.kit as { template?: { id: string } })?.template?.id === pack!.template && !!(gp.kit as { voice?: unknown }).voice && JSON.stringify(gp.case_studies).includes("software company"), { t: gp.transcript, k: (gp.kit as { template?: unknown })?.template, c: gp.case_studies });
  check("get_call_pack refuses a pack id that isn't one", /cp_/.test(await refused(getCallPack({ member: T.memberIndex(await t.loadSeed(), await t.loadState()).byId.get("mem_jordan")!, origin: "" }, { pack_id: "../x" }))));

  // Halcyon Freight: locked for Jordan; nothing agreed.
  const hRuns = jr.filter((r) => /locked/.test(r.line));
  const hP = hRuns.find((r) => r.wf === wfP);
  check("nothing agreed: the proposal run records it, and nothing is built", !!hP && /Nothing agreed, nothing built/.test(hP.line) && hP.steps.every((x) => x.status === "skipped") && !hP.built?.proposal, hP);
  check("a locked company is described, never named, in runs, the bell and the email", hRuns.length >= 2 && !JSON.stringify(jr).includes("Halcyon") && !JSON.stringify(st1.inbox?.mem_jordan ?? []).includes("Halcyon") && !mails.some((m) => /Halcyon/.test(m.subject + m.text + m.html)), hRuns.map((r) => r.line));

  // Delivery: one email and one bell line per run that built something.
  const bell = (st1.inbox?.mem_jordan ?? []).find((x) => x.id === `wf-call:${pRun.id}`);
  check("the bell: Your proposal draft for Cedar and Pine is ready, into Proposals", bell?.line === "Your proposal draft for Cedar and Pine is ready" && bell.href === `/?p=proposals&pr=${encodeURIComponent(pRun.built!.proposal!)}`, bell);
  const mail = mails.find((m) => m.subject === "Your proposal draft for Cedar and Pine is ready");
  check("the ready email goes to the member alone, with the link into Merlin", !!mail && mail.to === "jordan@avery.example" && /\/api\/go\?/.test(mail.text) && /Nothing was sent/.test(mail.text), mail?.subject);
  const fuMail = mails.find((m) => m.subject === "Your follow-up email for Cedar and Pine is ready");
  check("the follow-up email's text is in the ready email", !!fuMail && fuMail.text.includes("Hey Dana,"));
  const cMail = mails.find((m) => m.subject === "Your call with Cedar and Pine is ready for Claude");
  check("the Claude route's email carries the Open in Claude link", !!cMail && cMail.text.includes("https://claude.ai/new?q="));
  check("no email went to anyone but the member, nor to a client", mails.every((m) => m.to === "jordan@avery.example" || m.to === "riley@moss.example"));
  check("no person is named in a run line or a bell line", !/Dana|Quinn|Whitfield/.test(JSON.stringify(jr.map((r) => r.line)) + JSON.stringify((st1.inbox?.mem_jordan ?? []).map((x) => x.line))));
  check("ready within the tick: the run's time is the tick's", pRun.at === iso(nowA));

  // Fathom, for Riley.
  const rr1 = st1.workflows!.mem_riley.runs;
  const rd = st1.workflows!.mem_riley.drafts.find((d) => d.kind === "followup");
  check("Fathom: Riley's call with Larkspur Learning ran the follow-up workflow", rr1.length === 1 && /Larkspur Learning/.test(rr1[0].line) && rr1[0].steps[0].status === "done", rr1);
  check("Fathom: the meetings list and the transcript were read with the key", calls.some((x) => /\/external\/v1\/meetings\?created_after=/.test(x.url)) && calls.some((x) => /\/recordings\/rec_lark_0001\/transcript$/.test(x.url) && x.headers["x-api-key"] === "fathom_key_FAKE_0123456789"));
  check("Fathom: the recap draft, neutral voice, next week", !!rd && rd.body.startsWith("Hi Avery,") && /next week/.test(rd.body), rd);

  // The transcript never in state, and the title neither.
  const sf = stateFile();
  // The proposal draft keeps the buyer's own lines it was filled with (the draft-from-call path, by design); nothing else of a call is kept.
  const noDrafts = (raw: string) => JSON.stringify({ ...JSON.parse(raw), proposals: undefined });
  check("the transcripts are never kept whole: the member's own lines are nowhere in the state", !["I'll put together a proposal and send it over", "Good to meet you. What made you look", "Great. I'll bring the timeline", "SECRETSUMMARY"].some((x) => sf.includes(x)));
  check("outside the proposal drafts no line of a call is kept: runs, packs, drafts, the bell", ![UNIQUE, UNIQUE2, UNIQUE3].some((x) => noDrafts(sf).includes(x)));
  check("a call that built nothing keeps nothing of itself", !sf.includes(UNIQUE2) && !sf.includes(UNIQUE3));
  check("a call's title is never kept", !sf.includes("Cedar and Pine x Jordan") && !sf.includes("marketing discovery"));

  /* ---------- once, not twice ---------- */
  console.log("\nOnce per call");
  const nRuns = (await runsOf("mem_jordan")).length;
  const nMails = mails.length;
  await C.callTick(t0 + 5 * MIN);
  await settle();
  check("the next tick sees the same calls and runs nothing again", (await runsOf("mem_jordan")).length === nRuns && mails.length === nMails, (await runsOf("mem_jordan")).length - nRuns);
  const cur = (await t.loadState()).workflows!.mem_jordan.calls?.granola;
  check("the cursor moved, and remembers the calls it handled", cur?.at === iso(t0 + 5 * MIN) && ["not_cedarcall00001", "not_standup0000001", "not_halcyon0000001"].every((x) => cur.seen.includes(x)), cur);
  granolaDown = true;
  await C.callTick(t0 + 7 * MIN);
  granolaDown = false;
  check("a recorder that doesn't answer leaves the cursor where it was", (await t.loadState()).workflows!.mem_jordan.calls?.granola?.at === iso(t0 + 5 * MIN));

  /* ---------- the transcript ticked for Claude ---------- */
  console.log("\nThe transcript, ticked");
  const fl = (await t.loadState()).workflows!.mem_jordan.flows.find((f) => f.id === wfC)!;
  await act(JT, { type: "workflow.save", id: wfC, trigger: "call", scope: { kind: "calls" }, steps: fl.steps, call: { ...fl.call, transcript: true } });
  meetings.push({ id: "not_cedarcall00002", title: "Cedar and Pine: proposal review", start: t0 + 2 * MIN, minutes: 10, people: meetings[0].people, lines: sales(2) });
  await C.callTick(t0 + 15 * MIN);
  await settle();
  const st2 = await t.loadState();
  const c2 = st2.workflows!.mem_jordan.runs.find((r) => r.wf === wfC && r.at === iso(t0 + 15 * MIN));
  const pack2 = st2.workflows!.mem_jordan.packs?.find((p) => p.id === c2?.built?.pack);
  check("ticked: the pack points at the call, the transcript still not kept", !!pack2 && pack2.transcript === true && pack2.call === "not_cedarcall00002" && !JSON.stringify(pack2).includes(UNIQUE) && !noDrafts(stateFile()).includes(UNIQUE), pack2);
  const gp2 = (await getCallPack({ member: T.memberIndex(await t.loadSeed(), await t.loadState()).byId.get("mem_jordan")!, origin: "" }, { pack_id: pack2!.id })) as { transcript: string | null };
  check("ticked: get_call_pack reads the transcript from the recorder when Claude asks, and keeps none", !!gp2.transcript && gp2.transcript.includes(UNIQUE) && gp2.transcript.includes("I'll put together a proposal") && !stateFile().includes("I'll put together a proposal") && !noDrafts(stateFile()).includes(UNIQUE));
  check("ticked: the prompt says the transcript is there", decodeURIComponent(c2!.built!.claude!).includes("what the transcript says"));

  /* ---------- Merlin's AI, metered ---------- */
  console.log("\nMerlin's AI and the AI budget");
  Object.assign(process.env, { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-ant-test-fake", RN_AI_MODEL: "model-from-the-env", RN_AI_TEST_BASE_URL: AI_BASE });
  check("not agreed yet: Merlin's rules read the call, no request to Anthropic", (((await W.workflowsFor(JT)) as import("../lib/workflows/types").WorkflowsView).calls?.ai ?? true) === false);
  await T.mutate((d) => void ((d.aiDrafts ??= {}).mem_jordan = iso(t0)));
  check("agreed, on Close, AI usage left: Merlin's AI reads the call", ((await W.workflowsFor(JT)) as import("../lib/workflows/types").WorkflowsView).calls?.ai === true);
  aiReading = () => ({
    call_type: "sales",
    agreed: { proposal: true, sow: false, follow_up: true, deck: false },
    summary: "Cedar and Pine wants a forecast it can trust and agreed to a proposal for two days a week.",
    agreed_items: ["Send a proposal for two days a week at $12,000 a month"],
    next_steps: ["Review the proposal together on Thursday"],
    follow_up: { subject: "Thanks, and next steps", body: "Hey Dana,\n\nThanks for today. I'll send the proposal for two days a week, and we review it Thursday.\n\nCheers,\nJordan" },
    deck: [],
  });
  const used0 = (await t.loadState()).aiUsage?.mem_jordan?.usedMicros ?? 0;
  const ai0 = aiCalls.length;
  meetings.push({ id: "not_cedarcall00003", title: "Catch up", start: t0 + 10 * MIN, minutes: 20, people: meetings[0].people, lines: sales(3) });
  await C.callTick(t0 + 33 * MIN);
  await settle();
  const st3 = await t.loadState();
  const readReqs = aiCalls.slice(ai0).filter((x) => /You read a sales call/.test(x.system));
  check("one reading request for the call, the transcript as data", readReqs.length === 1 && readReqs[0].content.includes("<transcript>") && readReqs[0].content.includes(UNIQUE), aiCalls.slice(ai0).map((x) => x.system.slice(0, 30)));
  check("the proposal drafted by Merlin's AI from the same call", aiCalls.slice(ai0).some((x) => /You write client proposals/.test(x.system)));
  const used1 = st3.aiUsage?.mem_jordan?.usedMicros ?? 0;
  check("the AI usage is metered: both requests charged to the member's budget", used1 > used0 && (st3.aiUsage?.mem_jordan?.log?.length ?? 0) >= 2, { used0, used1 });
  const aiRun = st3.workflows!.mem_jordan.runs.find((r) => r.wf === wfF && r.at === iso(t0 + 33 * MIN));
  const aiDraft = st3.workflows!.mem_jordan.drafts.find((d) => d.id === aiRun?.built?.followup);
  check("Merlin's AI wrote the follow-up email; the run says so", /Merlin's AI read the call/.test(aiRun?.line ?? "") && aiDraft?.subject === "Thanks, and next steps", { line: aiRun?.line, s: aiDraft?.subject });
  check("still: no transcript in the state after the AI's reading", !noDrafts(stateFile()).includes(UNIQUE) && !stateFile().includes("I'll put together a proposal"));
  // AI usage used up: Merlin's rules read the next call, and Anthropic is asked nothing.
  await T.mutate((d) => {
    const r = d.aiUsage!.mem_jordan;
    r.usedMicros = 50_000_000;
    r.packMicros = 0;
  });
  const ai1 = aiCalls.length;
  meetings.push({ id: "not_cedarcall00004", title: "Cedar and Pine: discovery two", start: t0 + 25 * MIN, minutes: 10, people: meetings[0].people, lines: sales(4) });
  await C.callTick(t0 + 40 * MIN);
  await settle();
  const st4 = await t.loadState();
  check("AI usage used up: no request to Anthropic, Merlin's rules built it", aiCalls.length === ai1 && st4.workflows!.mem_jordan.runs.some((r) => r.at === iso(t0 + 40 * MIN) && /Merlin's rules read the call/.test(r.line) && r.built?.proposal), aiCalls.length - ai1);
  const { aiMeter } = await import("../lib/proposals/aiUsage");
  check("the member's AI usage meter says used up, as the app shows it", aiMeter(st4, "mem_jordan", t0).usedUp === true && ((await W.workflowsFor(JT)) as import("../lib/workflows/types").WorkflowsView).calls?.ai === false);
  for (const k of ["RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_AI_TEST_BASE_URL"]) delete process.env[k];

  /* ---------- a plan that changed ---------- */
  console.log("\nA plan that changed");
  // A Close workflow left on Riley's Pro plan (made up: as if they moved down): the step is held, not run.
  await T.mutate((d) => {
    d.workflows!.mem_riley.flows.push({ id: "wf_held_close1", name: "Held", on: true, trigger: "call", scope: { kind: "calls" }, steps: [{ key: "proposal" }], cap: null, warn: null, call: { sales: true, agreed: [], template: null, transcript: false }, createdAt: seen, updatedAt: seen });
  });
  fathomMeetings.push({ ...fathomMeetings[0], recording_id: "rec_lark_0001", created_at: iso(t0 + 20 * MIN), recording_start_time: iso(t0 + 20 * MIN), recording_end_time: iso(t0 + 30 * MIN), scheduled_start_time: iso(t0 + 20 * MIN), scheduled_end_time: iso(t0 + 30 * MIN) });
  fathomMeetings[1].recording_id = "rec_lark_0002";
  await C.callTick(t0 + 45 * MIN);
  await settle();
  const held = (await t.loadState()).workflows!.mem_riley.runs.find((r) => r.wf === "wf_held_close1");
  check("Pro: a proposal step is held as part of Close, and no proposal is made", !!held && held.steps[0].status === "skipped" && /Part of Close/.test(held.steps[0].note) && !(await t.loadState()).proposals?.some((p) => p.memberId === "mem_riley"), held);

  /* ---------- off again ---------- */
  console.log("\nOff again");
  delete process.env.RN_CALL_TRIGGERS;
  meetings.push({ id: "not_cedarcall00005", title: "Cedar and Pine: discovery three", start: t0 + 40 * MIN, minutes: 5, people: meetings[0].people, lines: sales(5) });
  const nOff = calls.length;
  check("off: a new call runs nothing, and no recorder is asked", (await C.callTick(t0 + 50 * MIN)) === 0 && calls.length === nOff);
  check("off: get_call_pack refuses", /switched on/.test(await refused(C.callPack(T.memberIndex(await t.loadSeed(), await t.loadState()).byId.get("mem_jordan")!, pack!.id))));
  process.env.RN_CALL_TRIGGERS = "1";

  /* ---------- purge and the export ---------- */
  console.log("\nPurge and the export");
  const exp = JSON.stringify(await t.exportState());
  check("the admin export: no Fathom key, no packs, no call cursor", !exp.includes('"fathom"') && !exp.includes('"packs"') && !exp.includes("not_cedarcall00001"));
  check("the doc and the data page say it", /RN_CALL_TRIGGERS/.test(readFileSync("docs/data-flows.md", "utf8")) && /call workflow/.test(readFileSync("app/data/DataFlows.tsx", "utf8")) && !/LinkedIn/.test(readFileSync("app/data/DataFlows.tsx", "utf8")));
  check("nothing went anywhere else", others === 0, others);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL the run threw", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
