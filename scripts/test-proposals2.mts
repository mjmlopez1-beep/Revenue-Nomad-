/**
 * Checks of the one-screen Proposals (RN_PROPOSALS2, lib/proposals/flag.ts, recent.ts, quick.ts and
 * app/post/proposalsPage Home2, Rail2, SendSheet):
 *
 *   npx tsx scripts/test-proposals2.mts
 *
 * In process on a made-up seed (Jordan Avery on Close; Cedar and Pine, signer Dana Whitfield;
 * Halcyon Freight), a fake Granola API on 127.0.0.1 that counts every request, a fake AI API and a
 * fake email API (fetch replaced). Nothing leaves the machine; no real call, transcript or member.
 *
 *  1. Flag off: the old page. No v2 on ProposalsView or Me, the routes refuse the new ops, the page
 *     draws Home2 only with ProposalsView.v2.
 *  2. Flag on: the home's recent calls (kept, the company matched by the attendee's domain), read in
 *     the background into a reading by Merlin's rules (never the transcript).
 *  3. Tap a call: the document at once, with NO Granola request on that path: the company, who signs
 *     with their email, the call's own fee, matched Evidence Bank cases, the member's profile, few blanks.
 *  4. Tap a company (no call): the price from ONE calculation with What should I charge (proposalRate is
 *     chargeWorking's ask), the shown math, a template start with a handful of blanks, not thirty-six.
 *  5. Only "What we heard" and "What I recommend" go to Merlin's AI, from the reading, not the transcript;
 *     put in only where the member hasn't changed a word; consent and the Close gate as before.
 *  6. A second tap on the call opens its draft ("Draft ready"); the template switch keeps the fields.
 *  7. Send: one sheet, client first and the member countersigns last by default, through the existing send path.
 *  8. No "Add what you know" or "Add <Name> to Merlin" in the flow; copy without em dashes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { register } from "node:module";

// The pages import CSS: nothing here.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-proposals2-"));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const root = path.join(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");

const co = (id: string, name: string, site: string, more: Record<string, string> = {}) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO", ...more } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.p2@example.com`, title, token: `tok-${id.slice(4)}-p2` });
const members = [member("mem_jor", "Jordan Avery", "Fractional CRO"), member("mem_fre", "Fred Free", "Fractional VP Sales")];
writeFileSync(
  path.join(dir, "intel-seed.json"),
  JSON.stringify({
    builtAt: iso(-60 * DAY),
    members,
    companies: [co("c_cedar", "Cedar and Pine", "cedarpine.example"), co("c_halcyon", "Halcyon Freight", "halcyonfreight.example", { industry: "Freight & Trucking", revenue: "$5M–$20M" }), co("c_lark", "Larkspur Learning", "larkspur.example", { industry: "EdTech" })],
    engagements: [],
    contacts: [],
  }),
);
const kase = (id: string, more: Record<string, unknown>) => ({
  id, status: "ready", clientNamed: false, clientLabel: "A past client", title: "", role: "Fractional CRO", fn: "Sales", start: "2024-02", end: "2024-12", hours: "12",
  size: "", revenue: "", motion: "", industry: "", soldTo: "", problems: [], workType: [], outcomes: [], workedWith: [], answers: { problem: "", did: "", numbers: "" },
  text: "", textBy: "member", showOnCard: false, usedIn: [], createdAt: iso(-20 * DAY), updatedAt: iso(-2 * DAY), ...more,
});
const cases = [
  kase("ev_lark", { companyId: "c_lark", clientNamed: true, clientName: "Larkspur Learning", clientLabel: "A SaaS company, $5M to $20M", title: "Forecast within 5% for three quarters", industry: "SaaS", size: "51–200", revenue: "$5M–$20M", motion: "Sales-led", text: "Weekly pipeline review and one dashboard.", outcomes: [{ k: "Forecast miss", before: "25%", after: "5%" }] }),
  kase("ev_nw", { clientLabel: "A SaaS company, $5M to $20M", title: "Win rate from 18% to 29% in two quarters", industry: "SaaS", size: "51–200", revenue: "$5M–$20M", motion: "Sales-led", text: "Rebuilt the stages and coached four reps.", outcomes: [{ k: "Win rate", before: "18%", after: "29%" }] }),
];
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: Object.fromEntries(["c_cedar", "c_halcyon", "c_lark"].map((c) => [`${c}.identity`, ["mem_jor"]])),
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional CRO", onboarded: true }, mem_fre: { function: "Sales", onboarded: true } },
    billing: { members: { mem_jor: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(400 * DAY) }, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
    evidence: { mem_jor: cases },
    aiDrafts: { mem_jor: iso(-5 * DAY) },
    voice: { mem_jor: { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: [], at: iso(-DAY), by: "you" } },
  }),
);

/* ---------- the fake Granola: today's call with Dana at Cedar and Pine, and an internal one ---------- */
const GKEY = "grn_goodkey_jordan_p2ab";
const NOTE = "not_cedar0000000p2";
const NOTE_IN = "not_internal0000p2";
const owner = { name: "Jordan Avery", email: "jor.p2@example.com" };
const callAt = t0 - 3 * HOUR;
const FILLER = "FILLERLINE the weather in Denver was lovely this week";
const lines: [string, "me" | "them", string][] = [
  ["Jordan Avery", "me", `Thanks for making the time, Dana. ${FILLER}.`],
  ["Dana Whitfield", "them", "Our win rate fell from 31% to 22% and the forecast is a guess every month."],
  ["Dana Whitfield", "them", "We want to get to $8M next year. Two days a week sounds right, at $11,000 a month for six months."],
  ["Jordan Avery", "me", "That works. I'll send the proposal to you at dana@cedarpine.example."],
];
const items = () => lines.map(([name, who, text], i) => ({ speaker: { source: who === "me" ? "microphone" : "speaker", attribution: who, name }, text, start_time: new Date(callAt + i * 600_000).toISOString(), end_time: new Date(callAt + i * 600_000 + 60_000).toISOString() }));
const head = (id: string, at: number) => ({ id, object: "note", title: "x", owner, created_at: new Date(at).toISOString(), updated_at: new Date(at).toISOString(), deleted_at: null });
const note = (id: string, at: number, people: { name: string; email: string }[], withT: boolean) => ({
  ...head(id, at),
  title: "Cedar and Pine pricing",
  calendar_event: { event_title: "x", invitees: people.map((p) => ({ email: p.email })), organiser: owner.email, calendar_event_id: `ev_${id}`, scheduled_start_time: new Date(at).toISOString(), scheduled_end_time: new Date(at + 42 * 60_000).toISOString() },
  attachments: [],
  attendees: people,
  folder_membership: [],
  summary_text: "x",
  summary_markdown: null,
  private_notes_text: null,
  private_notes_markdown: null,
  transcript: withT ? items() : null,
});
const granolaAsked: string[] = [];
const granola = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  for await (const _ of req) void _;
  granolaAsked.push(`${req.method} ${u.pathname}`);
  const send = (status: number, body: unknown) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  if ((req.headers.authorization ?? "") !== `Bearer ${GKEY}`) return send(401, { code: "INVALID_API_KEY", message: "x" });
  if (u.pathname === "/v1/notes" && req.method === "GET") return send(200, { notes: [head(NOTE, callAt), head(NOTE_IN, callAt - DAY)], hasMore: false, cursor: null });
  if (u.pathname === `/v1/notes/${NOTE}`) return send(200, note(NOTE, callAt, [owner, { name: "Dana Whitfield", email: "dana@cedarpine.example" }], u.searchParams.get("include") === "transcript"));
  if (u.pathname === `/v1/notes/${NOTE_IN}`) return send(200, note(NOTE_IN, callAt - DAY, [owner, { name: "Pat Partner", email: "pat@example.com" }], false));
  if (u.pathname === `/v1/notes/${NOTE}/transcript`) return send(200, { transcript: items(), hasMore: false, cursor: null });
  return send(404, { code: "NOT_FOUND", message: "x" });
});
await new Promise<void>((r) => granola.listen(0, "127.0.0.1", () => r()));
const GRANOLA = `http://127.0.0.1:${(granola.address() as AddressInfo).port}`;
const AI_BASE = "http://127.0.0.1:7059/fake-anthropic";

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-proposals2",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_p2",
  STRIPE_WEBHOOK_SECRET: "whsec_test_p2",
  STRIPE_PRICE_MONTH: "price_month_p2",
  STRIPE_PRICE_YEAR: "price_year_p2",
  RESEND_API_KEY: "test-key-p2",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
  RN_GRANOLA: "1",
  RN_GRANOLA_API_TEST: GRANOLA,
  RN_AI_DRAFTS: "1",
  ANTHROPIC_API_KEY: "sk-ant-test-fake",
  RN_AI_MODEL: "model-from-the-env",
  RN_AI_TEST_BASE_URL: AI_BASE,
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_SEAL_KEY", "RN_PROPOSALS2", "RN_UI2"]) delete process.env[k];

const mails: { to: string; subject: string }[] = [];
const aiCalls: { max_tokens: number; messages: { content: string }[]; system: string; output_config?: { format?: { schema?: unknown } } }[] = [];
let aiAnswer: (prompt: string) => unknown = () => ({});
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(GRANOLA)) return realFetch(input, init);
  if (url.startsWith(AI_BASE)) {
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    const body = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer));
    aiCalls.push(body);
    return new Response(JSON.stringify(aiAnswer(body.messages?.[0]?.content ?? "")), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 900)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { status?: number }) => `${e.status ?? ""} ${e.message}`.trim());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const S = await import("../lib/proposals/store.ts");
const Q = await import("../lib/proposals/quick.ts");
const R = await import("../lib/proposals/recent.ts");
const Rates = await import("../lib/proposals/rates.ts");
const CM = await import("../app/post/chargeModel.ts");
const G = await import("../lib/granola/index.ts");
const L = await import("../lib/proposals/library.ts");
const P = await import("../app/post/proposalsPage/progress.ts");
const SS = await import("../app/post/proposalsPage/SendSheet.tsx");
const { buildView } = await import("../lib/table.ts");
const { RN_REVENUE } = await import("../lib/tableFields.ts");
const JOR = members[0].token;
const FRE = members[1].token;

/* ---------- 1. flag off: the old page ---------- */
console.log("Flag off");
{
  const v = await S.listProposals(JOR);
  check("ProposalsView has no v2 while RN_PROPOSALS2 is off", !("v2" in v));
  const view = await buildView(JOR, { asMember: true });
  check("Me has no proposals2 while it is off", !!view.me && !("proposals2" in view.me));
  const route = src("app/api/proposals/route.ts");
  const liveRoute = src("app/api/proposals/live/route.ts");
  check("the quick, retemplate and home routes refuse while it is off", /case "quick":\s*\n\s*if \(!proposals2On\(\)\)/.test(route) && /case "retemplate":\s*\n\s*if \(!proposals2On\(\)\)/.test(route) && /home"\) === "1"\) \{\s*\n\s*if \(!proposals2On\(\)\) return err/.test(route));
  check("the sections pass runs only with it on", /b\?\.op === "sections" && proposals2On\(\)/.test(liveRoute));
  const page = src("app/post/Proposals.tsx");
  check("the page draws Home2 only with the new look and ProposalsView.v2 (else ProposalsHome, as today)", /const v2 = ui2 && !!data\?\.v2;/.test(page) && /if \(v2 && data\)\s*\n\s*return \(\s*\n\s*<>\s*\n\s*<(Home2|HomeNow)/.test(page) && /if \(ui2 && data\)\s*\n\s*return \(\s*\n\s*<ProposalsHome/.test(page));
  check("the editor's v2 parts are all behind the flag (rail, progress, send sheet)", /v2=\{\s*\n\s*v2\s*\n?\s*\?/.test(page) && /\{v2 && <SendSheetHost /.test(page) && /!p\.company\.id && !v2 && <LinkCompany/.test(page));
}

/* ---------- 2. flag on: the home's calls ---------- */
process.env.RN_PROPOSALS2 = "1";
process.env.RN_UI2 = "on";
console.log("\nFlag on: the home");
await G.connectGranola(JOR, GKEY);
{
  const v = await S.listProposals(JOR);
  check("ProposalsView says v2", v.v2 === true);
  const view = await buildView(JOR, { asMember: true });
  check("Me says proposals2 (the header hides Add what you know on Proposals)", view.me?.proposals2 === true && /hideAdd=\{!!me\.proposals2 && page === "proposals"\}/.test(src("app/post/TradingPost.tsx")));
  const h0 = await R.homeFor(JOR);
  check("a first open answers at once while the calls load in the background", h0.loading === true && h0.calls.length === 0 && h0.recorders.join() === "Granola");
  const h = await R.homeFor(JOR, { wait: true });
  check("then the recent calls: today's call with Dana, the internal one left out", !h.loading && h.calls.length === 1 && h.calls[0].id === NOTE && h.calls[0].who?.name === "Dana Whitfield" && h.calls[0].who?.email === "dana@cedarpine.example", h.calls);
  check("the company matched from the attendee's domain, named (the member can see it)", h.calls[0]?.company.name === "Cedar and Pine" && !!h.calls[0].company.id);
  check("no title of a call reaches the app", !JSON.stringify(h).includes("Cedar and Pine pricing"));
  for (let i = 0; i < 40 && !R.prepFor("mem_jor", "granola", NOTE); i++) await sleep(25);
  const prep = R.prepFor("mem_jor", "granola", NOTE);
  check("the newest call is read in the background into a reading (summary, terms, who signs)", !!prep && prep.terms["pricing.monthlyFee"] === "$11,000" && /two days a week|2 days a week/i.test(prep.terms["pricing.allocation"] ?? "") && prep.signer.email === "dana@cedarpine.example", prep);
  check("the reading keeps the buyer's lines, not the transcript (no filler, no member small talk)", !!prep && !JSON.stringify(prep).includes("FILLERLINE") && prep.lines.some((l) => /win rate|\$8M/.test(l.text)) && prep.lines.length >= 2, prep?.lines);
  const kept = JSON.stringify([...R._recentKept.lists.values()]);
  check("nothing kept in the list holds the transcript", !kept.includes("FILLERLINE") && !kept.includes("win rate fell"));
  const h2 = await R.homeFor(JOR);
  check("the home marks the call read, with its terms for the rate", h2.calls[0]?.ready === true && h2.calls[0].terms?.fee === 11000);
  const disk = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("nothing of the call is written to the state", !disk.includes("win rate fell") && !disk.includes("FILLERLINE"));
}

/* ---------- 3. tap a call: the document at once, no Granola on that path ---------- */
console.log("\nTap a call");
let callProposalId = "";
{
  const h = await R.homeFor(JOR);
  const c = h.calls[0];
  const before = granolaAsked.length;
  const t = performance.now();
  const r = await Q.quickProposal(JOR, { call: { recorder: c.recorder, id: c.id, companyId: c.company.id, who: c.who, when: c.when }, rate: { fee: 9000, allocation: "two days a week" } });
  const ms = performance.now() - t;
  callProposalId = r.proposal.id;
  const p = r.proposal;
  check("no Granola request on the path that opens the document", granolaAsked.length === before, granolaAsked.slice(before));
  check(`the document comes back in well under a second (${Math.round(ms)} ms here)`, ms < 1000);
  check("linked to the company from the call", p.company.id === c.company.id && p.company.name === "Cedar and Pine");
  check("who signs from the call: name and email, as the signer", p.signer?.name === "Dana Whitfield" && p.signer?.email === "dana@cedarpine.example" && p.fields["client.signerName"] === "Dana Whitfield");
  check("the call's own fee wins over the app's suggestion, with what follows from it", p.fields["pricing.monthlyFee"] === "$11,000" && p.fields["pricing.stepDownFee"] === "$7,250" && !!p.fields["pricing.overageRate"], p.fields);
  check("Evidence Bank's closest cases fill Proof", (p.proofCases ?? []).length >= 1 && !!p.fields.caseStudies);
  check("the member's profile and the company's facts are in", p.fields["provider.name"] === "Jordan Avery" && p.fields["provider.title"] === "Fractional CRO" && p.fields["company.revenue"] === "$5M–$20M");
  check("the call it came from is kept (never the transcript)", p.fromCall?.recorder === "granola" && p.fromCall.id === NOTE && !JSON.stringify(p).includes("FILLERLINE"));
  check("From the call: the summary and what was agreed, as private notes", p.notes.some((n) => n.key === "call.summary") && p.notes.some((n) => n.key === "call.agreed"));
  const blanks = L.blanksOf(p.blocks, L.docFields(p));
  check(`a handful of things to fill, not thirty-six (${blanks.length}: ${blanks.join(", ")})`, blanks.length <= 3, blanks);
  check("the progress chips point at the section each blank is in", P.blanksWithPlaceOf(p).every((x) => !!x.block && p.blocks.some((b) => b.id === x.block)));
  const ai = p.blocks.filter((b) => r.ai.blocks.includes(b.id)).map((b) => b.blockId).sort();
  check("a call opens the Senior operator family; What I heard waits for Merlin's reading of the call", p.templateId === "senior-operator" && ai.includes("what_we_heard") && r.ai.state === "ready", { t: p.templateId, ai, r: r.ai });
  check("those two open with Merlin's rules' words, not empty", p.blocks.filter((b) => r.ai.blocks.includes(b.id)).every((b) => b.body.trim().length > 20));
  check("no AI call on the way to the document", aiCalls.length === 0);
  const h2 = await R.homeFor(JOR);
  check("the home now marks the call Draft ready", h2.calls[0]?.draftId === p.id);
  const again = await Q.quickProposal(JOR, { call: { recorder: c.recorder, id: c.id, companyId: c.company.id } });
  check("a second tap opens that draft, not a copy", again.opened && again.proposal.id === p.id && (await S.listProposals(JOR)).proposals.length === 1);
}

/* ---------- 4. tap a company: the rate from ONE calculation with What should I charge ---------- */
console.log("\nTap a company: one calculation");
{
  const view = await buildView(JOR, { asMember: true });
  const row = (fn: string, revenue: string, m: [number, number, number, number], h: [number, number, number, number]) => ({ function: fn, revenue, indexed: false, monthly: { n: m[0], min: 5, p25: m[1], median: m[2], p75: m[3] }, hourly: { n: h[0], min: 5, p25: h[1], median: h[2], p75: h[3] } });
  const few = { n: 0, min: 5 };
  const bench = {
    minN: 5,
    rangeN: 10,
    total: 100,
    rows: [row("Sales", "All", [40, 8500, 11500, 15000], [30, 150, 190, 240]), row("Sales", "$5M–$20M", [14, 9000, 12000, 15500], [12, 160, 200, 250]), ...RN_REVENUE.filter((r) => r !== "$5M–$20M").map((r) => ({ function: "Sales", revenue: r, indexed: false, monthly: few, hourly: few }))],
  };
  const v = { ...view, benchmarks: bench } as typeof view;
  const halcyon = view.companies.find((x) => x.name === "Halcyon Freight")!;
  const r0 = Rates.proposalRate(v, { company: { id: halcyon.id }, fields: {} });
  const w = CM.chargeWorking(bench as never, { fn: "Sales", band: "$5M–$20M", kind: "monthly", hours: null, company: null, industry: false }, {});
  check("without hours: the fee is What should I charge's own ask (the top, open high)", r0.fee === w.ask!.to && r0.ask?.from === w.ask!.from && r0.big === w.big && r0.source === "merlin", { r0: r0.fee, w: w.ask });
  const r1 = Rates.proposalRate(v, { company: { id: halcyon.id }, fields: { "pricing.allocation": "2 days a week" } });
  const w1 = CM.chargeWorking(bench as never, { fn: "Sales", band: "$5M–$20M", kind: "monthly", hours: 16, company: null, industry: false }, {});
  check("with hours: the same sum as What should I charge's By your hours", r1.fee === w1.ask!.to && r1.hoursMonth === CM.hoursMonth(16) && JSON.stringify(r1.steps) === JSON.stringify(w1.steps), { r1: r1.fee, w1: w1.ask });
  check("the shown math is that one sum: hours a month and the hourly figure from the fee", r1.math === `2 days a week is about ${CM.hoursMonth(16)} hours a month, so $${r1.fee!.toLocaleString("en-US")} is about $${Math.round(r1.fee! / CM.hoursMonth(16)).toLocaleString("en-US")} an hour.`, r1.math);
  const own = Rates.proposalRate({ ...v, me: { ...v.me!, benchRates: [{ id: "br1", engagementId: null, function: "Sales", kind: "monthly", amount: 13250 }] } } as typeof v, { company: { id: halcyon.id }, fields: {} });
  check("the member's own monthly rate comes before Merlin's ask", own.fee === 13250 && own.source === "yours");
  const r = await Q.quickProposal(JOR, { companyId: halcyon.id, rate: { fee: r1.fee, allocation: "2 days a week" } });
  const p = r.proposal;
  check("the document carries that fee and its days", p.fields["pricing.monthlyFee"] === `$${r1.fee!.toLocaleString("en-US")}` && p.fields["pricing.allocation"] === "2 days a week");
  check("the rail's math reads the same from the document", Rates.rateMath(L.moneyOf(p.fields["pricing.monthlyFee"]), p.fields["pricing.allocation"]).math === r1.math);
  check("no call for this company: nothing for Merlin's AI to write", r.ai.state === "none");
  const blanks = L.blanksOf(p.blocks, L.docFields(p));
  check(`a company start has a handful of blanks, not thirty-six (${blanks.length}: ${blanks.join(", ")})`, blanks.length <= 4, blanks);
  // The deal's own value (acceptance F12): a proposal started at a company in the pipeline takes the value the member gave it.
  const { perform } = await import("../lib/table.ts");
  const cedar = view.companies.find((x) => x.name === "Cedar and Pine")!;
  await perform(JOR, { type: "pipeline.deal", companyId: cedar.id, stage: "meeting", value: 9000 } as never);
  const fromDeal = await Q.quickProposal(JOR, { companyId: cedar.id, rate: { fee: r1.fee, allocation: "2 days a week" } });
  check("a proposal at a company in the pipeline takes the deal's value as its monthly fee, before Merlin's suggestion", fromDeal.proposal.fields["pricing.monthlyFee"] === "$9,000", fromDeal.proposal.fields["pricing.monthlyFee"]);
  const fromDealNull = await Q.quickProposal(JOR, { companyId: cedar.id, rate: { fee: null } });
  check("journey D1: started from the deal with no rate sent (the journey's request), the fee is still the deal's value", fromDealNull.proposal.fields["pricing.monthlyFee"] === "$9,000", fromDealNull.proposal.fields["pricing.monthlyFee"]);
  const hv = await (await import("../lib/proposals/recent.ts")).homeFor(JOR);
  check("journey D1: Proposals' list of pipeline companies carries the deal's value for the page's quote", hv.companies.find((k) => k.id === cedar.id)?.value === 9000, hv.companies);
  const rd = Rates.proposalRate(view, { company: { id: cedar.id }, fields: {}, dealFee: 9000 });
  check("journey D1: the page's one calculation quotes the deal's value (source deal), the call's fee still first", rd.fee === 9000 && rd.source === "deal" && Rates.proposalRate(view, { company: { id: cedar.id }, fields: {}, dealFee: 9000, callFee: 7000 }).fee === 7000, [rd.fee, rd.source]);
  const tpl = await Q.quickProposal(JOR, { companyId: halcyon.id, templateId: "sprint-90", rate: { fee: r1.fee, allocation: "2 days a week" } });
  const tb = L.blanksOf(tpl.proposal.blocks, L.docFields(tpl.proposal));
  check(`a template start fills what Merlin knows too (${tb.length} blanks)`, tb.length <= 4 && tpl.proposal.templateId === "sprint-90", tb);
  const blank = await Q.quickProposal(JOR, { blank: true, rate: { fee: r1.fee, allocation: "2 days a week" } });
  const bb = L.blanksOf(blank.proposal.blocks, L.docFields(blank.proposal));
  check(`a blank start too (${bb.length} blanks)`, bb.length <= 5 && blank.proposal.templateId === null, bb);
  check("the template used last is the default next time", (await Q.quickProposal(JOR, { companyName: "Larkspur Learning" })).proposal.templateId === "sprint-90");
  check("Free can't start one (the Close gate)", /403/.test((await refused(Q.quickProposal(FRE, { blank: true }))) ?? ""));
}

/* ---------- 5. Merlin reads the call into its brief, and writes the proposal from it ---------- */
console.log("\nMerlin reads the call and writes the proposal");
{
  const brief = {
    client_company: "Cedar and Pine",
    people: [{ name: "Dana Whitfield", side: "client", role: "CEO", decides: true, on_call: true }],
    member_role: "operator",
    operator: "",
    summary: "Cedar and Pine wants to reach $8M next year; win rate fell from 31% to 22%.",
    insights: [
      { title: "Win rate fell", body: "Win rate fell from 31% to 22%.", evidence: "Our win rate fell from 31% to 22%" },
      { title: "The forecast is a guess", body: "The forecast is a guess every month.", evidence: "the forecast is a guess every month" },
      { title: "A clear goal", body: "They want to get to $8M next year.", evidence: "We want to get to $8M next year" },
      { title: "Two days a week fits", body: "Two days a week sounds right.", evidence: "Two days a week sounds right" },
    ],
    constraint: { title: "", body: "", evidence: "" },
    alternatives: [],
    shape: { days_per_week: "2", hours_per_week: "", duration: "six months", phases: [], start: "", reports_to: "" },
    success: [],
    risks: [],
    next_steps: [{ step: "We send the proposal", owner: "", when: "" }],
    questions: [],
    write: { headline: "A senior sales leader inside the business", subtitle: "", thesis: { line: "A steady forecast needs one owner.", supports: [] }, pitfalls: [], glance: [], plan: { assess: { items: [], deliverable: "" }, decision: "", design: { items: [], deliverable: "" }, deploy: { items: [], deliverable: "" } }, day30: [], priorities: [], math: [], focus: [], commitments: [], out_of_scope: [] },
  };
  aiAnswer = () => ({ id: "msg_fake", type: "message", role: "assistant", model: "model-from-the-env", content: [{ type: "text", text: JSON.stringify(brief) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 900, output_tokens: 300 } });
  const before = granolaAsked.length;
  const out = await Q.writeSections(JOR, callProposalId, {});
  const call = aiCalls.at(-1)!;
  const prompt = call.messages[0].content;
  check("one AI request for the brief", aiCalls.length === 1 && /three parties/.test(call.system));
  check("the call goes in this request alone: read again from the recorder, never kept", granolaAsked.length > before && !readFileSync(path.join(dir, "intel.json"), "utf8").includes("FILLERLINE"), granolaAsked.slice(before));
  check("the member's voice goes with it", /"writer_voice":"/.test(prompt));
  check("the brief is read: who signs, what they said", out.ai.ran && out.brief.insights.length === 4 && out.fields["client.signerName"] === undefined);
  check("sections written from it, What I heard among them", out.sections.some((x) => x.blockId === "what_we_heard" && /Win rate fell/.test(x.body)));
  const p0 = await S.getProposal(JOR, callProposalId);
  const heard = p0.blocks.find((b) => b.blockId === "what_we_heard")!;
  // The member edits What I heard while Merlin reads: it stays theirs.
  await S.updateProposal(JOR, callProposalId, { blocks: p0.blocks.map((b) => (b.id === heard.id ? { ...b, body: "My own words about the call." } : b)) });
  const n = await Q.applyIfUntouched(JOR, callProposalId, out.sections, out.before);
  const p1 = await S.getProposal(JOR, callProposalId);
  check("put in only where the member hasn't changed a word", n >= 1 && p1.blocks.find((b) => b.id === heard.id)!.body === "My own words about the call." && p1.blocks.some((b) => b.blockId === "thesis"));
  check("and only once", (await Q.applyIfUntouched(JOR, callProposalId, out.sections, out.before)) === 0);
  check("Free: refused (the Close gate)", /403/.test((await refused(Q.writeSections(FRE, callProposalId, {}))) ?? ""));
  const s = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  check("metered against the AI budget like a draft", JSON.stringify(s.aiUsage ?? {}).includes("mem_jor"));
}

/* ---------- 6. template switch ---------- */
console.log("\nTemplate switch");
{
  const p0 = await S.getProposal(JOR, callProposalId);
  const r = await Q.retemplate(JOR, callProposalId, { templateId: "advisory", rev: p0.rev });
  check("the template switches, the fields and Merlin's two sections stay", r.templateId === "advisory" && r.fields["pricing.monthlyFee"] === p0.fields["pricing.monthlyFee"] && r.blocks.find((b) => b.blockId === "what_we_heard")?.body === p0.blocks.find((b) => b.blockId === "what_we_heard")?.body);
  check("a stale tab can't switch it", /409/.test((await refused(Q.retemplate(JOR, callProposalId, { templateId: "sprint-90", rev: p0.rev }))) ?? ""));
}

/* ---------- 7. send: client first, the member countersigns last ---------- */
console.log("\nSend for signature");
{
  const sheet = src("app/post/proposalsPage/SendSheet.tsx");
  const page = src("app/post/Proposals.tsx");
  const order = SS.signersOf({ signer: null }, { "client.signerName": "Dana Whitfield", "client.signerEmail": "dana@cedarpine.example" }, { name: "Jordan Avery", email: "jor.p2@example.com" });
  check("the editor sends client first, the member's row last", order[0].name === "Dana Whitfield" && !order[0].me && order[1].me === true && /signersOf\(p, fields, \{ name: data\.me\.name, email: data\.me\.email \}\)/.test(page));
  check("the member's row last means they countersign after (memberSign after); first, now; none, none", SS.modeOfSigners(order) === "after" && SS.modeOfSigners([...order].reverse()) === "now" && SS.modeOfSigners([order[0]]) === "none" && /useState<MemberSignMode>\(modeOfSigners\(x\.signers\)\)/.test(sheet) && /data-signer="client"[\s\S]*data-signer="member"/.test(sheet));
  check("it sends through the existing path (reminders, then op send)", /saveReminders\(x\.id, rem\)/.test(sheet) && /op: "send", id: x\.id/.test(sheet));
  check("called as the shared sheet is: openSend({ kind, id, signers, message, title, linkDays, canClose })", /await openSend\(\{ kind: "proposal", id: p\.id, signers, message: /.test(page) && /export function openSend\(a: SendArgs\): Promise<SendResult \| null>/.test(sheet));
  check("the note is in the member's voice, one paragraph", SS.noteInVoice("Dana", { greeting: "Hey {first},", contractions: true }).startsWith("Hey Dana, here is the proposal") && !SS.noteInVoice("Dana", null).includes("\n"));
  const p0 = await S.getProposal(JOR, callProposalId);
  const blanks = L.blanksOf(p0.blocks, L.docFields(p0));
  await S.updateProposal(JOR, callProposalId, { setFields: Object.fromEntries(blanks.map((k) => [k, "Colorado"])) });
  const r = await S.sendProposal(JOR, callProposalId, { signer: { name: "Dana Whitfield", email: "dana@cedarpine.example" }, message: SS.noteInVoice("Dana", null), memberSign: "after", linkDays: 30 });
  check("sent to the client, who signs first; the member countersigns after", r.proposal.status === "sent" && r.proposal.send?.memberMode === "after" && mails.some((m) => m.to === "dana@cedarpine.example"), r.proposal.send);
}

/* ---------- 8. no detours, plain words ---------- */
console.log("\nNo detours, plain words");
{
  const files = ["app/post/proposalsPage/Home2.tsx", "app/post/proposalsPage/Rail2.tsx", "app/post/proposalsPage/SendSheet.tsx", "app/post/proposalsPage/progress.ts", "lib/proposals/quick.ts", "lib/proposals/recent.ts"];
  const all = files.map(src).join("\n");
  check("no Add what you know in the new screens", !/Add what you know/.test(all));
  check("no Add <Name> to Merlin detour (AddCompany, ProposalLink) in the new screens", !/AddCompany|LinkCompany|to Merlin<|Add .* to Merlin/.test(files.slice(0, 4).map(src).join("\n")));
  check("no em dashes in what the member reads", !/—/.test(files.slice(0, 4).map(src).join("\n")));
  check("Merlin, never Claude or Anthropic, in the new screens", !/Claude|Anthropic/.test(files.slice(0, 4).map(src).join("\n")));
  check("no template maker or four start cards on the new home", !/TemplateMaker|StartSheet|From a template/.test(src("app/post/proposalsPage/Home2.tsx")));
  check("one brief request reads the call; other templates get only the sections they have", /AI_BLOCKS = \["what_we_heard", "recommendation"\]/.test(src("lib/proposals/quick.ts")) && /present\.has\(k\)/.test(src("lib/proposals/quick.ts")) && /max_tokens: 8000/.test(src("lib/proposals/brief.ts")));
  check("no per-keystroke server call: the home's search filters what it has", !/onChange=\{\(e\) => \{?[^}]*fetch/.test(src("app/post/proposalsPage/Home2.tsx")));
}

granola.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
