/**
 * Checks of the proposal builder (lib/proposals, app/api/proposals, app/api/sign, lib/mcp/proposals.ts).
 * No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, billing live
 * with made-up Stripe settings, email "on" with a fake endpoint, and fetch replaced, so nothing
 * leaves the machine and every email is caught.
 *
 *   npx tsx scripts/test-proposals.mts      exits 1 on any failure
 *
 * Covered:
 *   - the library: 5 templates and 24 blocks, a template's blocks in its order, {{fields}} filled
 *     (lists as bullets, blanks kept), the checklist and the risk flags;
 *   - the extractor on a made-up transcript (WebVTT, SRT, plain): goals, pains, numbers, timeline,
 *     who decides, budget signals, the people involved, the buyer's own words; the member's own
 *     questions never as the buyer's facts; the person who signs not on the call;
 *   - create (from a template, blank, a company on Merlin, a locked one, one typed in), edit,
 *     reorder, add and remove blocks, fields from the record, the profile and the call;
 *   - the rate suggestion from the member's own benchmarks, and where their price sits;
 *   - plans: building proposals is Close (the trial is Close): after the trial no new proposal
 *     (blank, Merlin's templates or their own), no edit, no saved template, no kit, the connector's
 *     list_proposal_templates, create_or_update_proposal and get_proposal_kit refuse with the
 *     upgrade link; what they made in the trial stays stored and comes back on Close;
 *   - privacy: another member can't read, change, send or sign it; nothing of it in their table or
 *     the export; the signer's view carries nothing private; only accepted lines are stored;
 *   - send: blanks refused, an email to the signer with a signed link, the pipeline told;
 *   - the pipeline moves (lib/table.ts wires the hook at start-up): sent to Proposal, signed to Won
 *     with the proposal's fee, hours and term and an intro credited, declined to Lost;
 *   - signing: the code by email (wrong tries, expiry), consent, the full name, the hash of the
 *     document shown, the audit trail complete, the signed copy to both sides, frozen after;
 *   - decline, void, a new version on a change after sending, an expired link refused, a tampered link;
 *   - the connector's tools, and that sending asks first;
 *   - drafting with Claude (lib/proposals/draft.ts) against a fake Anthropic endpoint: off without
 *     the switch, Pro's, asks first, one request with the kit (template, patterns, rate band,
 *     company facts, profile, voice) and the model from RN_AI_MODEL, the answer checked and saved
 *     as a draft in the template's structure, the transcript never stored, a broken answer and a
 *     refusal refused; get_proposal_kit through the connector;
 *   - My templates (lib/proposals/templateParse.ts, mine.ts): a .docx, a .pdf, a .md and a .txt
 *     made here read into sections, a proposal started from one, private to its member.
 */
import { createHash } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-proposals-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

/* ---------- the made-up seed ---------- */

const co = (id: string, name: string, site: string, more: Record<string, string> = {}) => ({ id, fields: { name, website: site, industry: "Manufacturing", employees: "51–200", revenue: "$5M–$20M", hq: "Columbus, OH", ...more } });
const rateCos = Array.from({ length: 12 }, (_, i) => co(`c_r${i}`, `Ratefield ${i} Works`, `ratefield${i}.example`));
const companies = [co("c_acme", "Acme Robotics", "acmerobotics.example"), co("c_hid", "Quillmoor Systems", "quillmoor.example", { revenue: "$20M–$50M" }), ...rateCos];
const RATES = [9000, 10000, 10500, 11000, 11500, 12000, 12500, 13000, 13500, 14000, 15000, 16000];
const engagements = [
  ...rateCos.map((c, i) => ({ id: `e_r${i}`, companyId: c.id, verified: false, fields: { source: "Member success story", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: monthAgo(6), status: "Active", end: "Ongoing", rate: `$${RATES[i] / 1000}k/mo` } })),
  { id: "e_acme", companyId: "c_acme", verified: false, fields: { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: monthAgo(20), status: "Ended", end: monthAgo(8) } },
];
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.proposals@example.com`, title, token: `tok-${id.slice(4)}-proposals` });
const members = [member("mem_pat", "Pat Rowan", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO"), member("mem_fre", "Fred Free", "Fractional VP Sales"), { id: "mem_adm", name: "Ada Admin", email: "admin-proposals@example.com", title: "Admin", token: "tok-adm-proposals" }];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: {
      mem_pat: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
      mem_oth: { function: "Marketing", title: "Fractional CMO", onboarded: true },
      mem_fre: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
    },
    billing: { members: { mem_pat: trial, mem_oth: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-proposals",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-proposals@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_proposals",
  STRIPE_WEBHOOK_SECRET: "whsec_test_proposals",
  STRIPE_PRICE_MONTH: "price_month_proposals",
  STRIPE_PRICE_YEAR: "price_year_proposals",
  // Email "on", to a fake endpoint that fetch below catches: nothing is sent.
  RESEND_API_KEY: "test-key-proposals",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO"]) delete process.env[k];

const mails: { to: string; subject: string; text: string; html: string; reply_to?: string }[] = [];
let others = 0;
// The fake Anthropic API (RN_AI_TEST_BASE_URL, read only on a test server): what it was asked, and what it answers next.
const AI_BASE = "http://127.0.0.1:7041/fake-anthropic";
const aiCalls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
let aiAnswer: () => { status?: number; json: unknown } = () => ({ json: {} });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(AI_BASE)) {
    const h: Record<string, string> = {};
    new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => (h[k] = v));
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    aiCalls.push({ url, headers: h, body: JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer)) });
    const a = aiAnswer();
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, reply_to: b.reply_to });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  others++;
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);

const TRANSCRIPT = `WEBVTT

00:00:01.000 --> 00:00:05.000
<v Pat Rowan>Thanks for the time. What made you look at this now? What's the problem you keep hitting?

00:00:06.000 --> 00:00:15.000
<v Dana Whitfield>Honestly, our sales seat has been empty for three weeks and the pipeline is flat. The problem is nobody owns the forecast.

00:00:16.000 --> 00:00:30.000
<v Dana Whitfield>We want to get to $20M by end of next year. We do about $9M today with four reps.

00:00:31.000 --> 00:00:40.000
<v Dana Whitfield>Win rates dropped to 18 percent and the cycle is now 14 weeks.

00:00:41.000 --> 00:00:50.000
<v Dana Whitfield>We tried an agency last year and it didn't work out. Our CRM was set up for another business line, so nobody updates it.

00:00:51.000 --> 00:01:00.000
<v Dana Whitfield>I need to check with our CEO before we sign anything. We were quoted $15k a month by another firm, which felt too expensive.

00:01:01.000 --> 00:01:10.000
<v Dana Whitfield>Ideally someone two days a week, not a manager. We can give you access to the CRM in week one.

00:01:11.000 --> 00:01:20.000
<v Pat Rowan>Great. Let's meet Thursday to walk through the plan.

00:01:21.000 --> 00:01:30.000
<v Dana Whitfield>Between us, the sales director is delicate about this. He reports to the COO.
`;
const SECRET_LINE = "Between us, the sales director is delicate about this.";

async function main() {
  const T = await import("../lib/table");
  const L = await import("../lib/proposals/library");
  const X = await import("../lib/proposals/extract");
  const R = await import("../lib/proposals/rates");
  const S = await import("../lib/proposals/store");
  const H = await import("../lib/proposals/pipelineHook");
  const C = await import("../lib/mcp/proposals");
  const { CONSENT_VERSION } = await import("../lib/proposals/types");
  type ProposalRec = import("../lib/proposals/types").ProposalRec;

  const BASE = "https://post.example.com";
  const PAT = "tok-pat-proposals";
  const OTH = "tok-oth-proposals";
  const FRE = "tok-fre-proposals";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const ACME = pub("c_acme");
  const HID = pub("c_hid");
  const who = { ip: "203.0.113.7", ua: "Mozilla/5.0 (iPhone; made-up test browser)" };
  const P = await import("../lib/pipeline");
  const HL = await import("../lib/health");
  type State = import("../lib/table").State;
  // lib/table.ts wired the pipeline in when it loaded: the real hook, on the change's own state.
  check("at start-up the proposals are wired to the pipeline (lib/table.ts registers proposalToPipeline)", H.pipelineHookNow() === H.proposalToPipeline);
  const pipe: { memberId: string; companyId: string; kind: string; at: string }[] = [];
  // Every event is noted here, then goes on to the real hook, so the member's pipeline moves as it would.
  H.setPipelineHook((s, memberId, companyId, kind, at) => {
    pipe.push({ memberId, companyId, kind, at });
    return H.proposalToPipeline(s, memberId, companyId, kind, at);
  });
  const acmeDeals = async () => ((await T.loadState()).pipeline?.mem_pat?.entries ?? []).filter((e) => e.companyId === "c_acme");
  const tokenOf = (link: string) => link.match(/\/sign\/([^\s"<]+)/)?.[1] ?? "";
  const copyOf = (link: string) => link.match(/\/signed\/([^\s"<]+)/)?.[1] ?? "";
  const lastMail = (to: string) => [...mails].reverse().find((m) => m.to === to);

  /* ================= the library ================= */
  console.log("\nthe library");
  check("5 templates and 24 blocks, as researched", L.TEMPLATES.length === 5 && L.BLOCKS.length === 24, [L.TEMPLATES.length, L.BLOCKS.length]);
  check("every template block is in the library", L.TEMPLATES.every((t) => t.blocks.every((b) => !!L.blockDef(b.blockId))));
  check("every library block has starting text", L.BLOCKS.every((b) => typeof L.STARTER[b.id] === "string" && L.STARTER[b.id].length > 0));
  const tb = L.templateBlocks("fractional-sales-leader");
  check("a template's blocks come in its order", tb.map((b) => b.blockId).join() === L.templateDef("fractional-sales-leader")!.blocks.map((b) => b.blockId).join(), tb.map((b) => b.blockId));
  check("the library has no consulting firm, network or person named", !/linkedin|sales navigator/i.test(JSON.stringify(L.BLOCKS) + JSON.stringify(L.TEMPLATES)));
  const filled = L.fill("Goal: {{goals.target}}\n{{pains}}\nLeft: {{nope}}", { "goals.target": "$20M by next year", pains: "Seat empty three weeks\nForecast nobody owns" });
  check("{{fields}} fill in, a list as one bullet each, a blank stays a blank", filled === "Goal: $20M by next year\n- Seat empty three weeks\n- Forecast nobody owns\nLeft: {{nope}}", filled);
  const inv = L.fill(L.STARTER.investment, { "pricing.overageRate": "$1,200 a day", "pricing.monthlyFee": "$12,000 a month" });
  check("one unit after a price: a value with its own unit never reads \"a day an hour\" or \"a month a month\"", /\$1,200 a day, only/.test(inv) && !/a day an hour/.test(inv) && /\$12,000 a month for/.test(inv) && !/a month a month/.test(inv), inv);
  check("one unit: $250/hr and a plain $250 an hour both read once", L.oneUnit("$250/hr an hour") === "$250/hr" && L.fill("{{r}} an hour", { r: "$250" }) === "$250 an hour" && L.fill("{{h}} a week", { h: "15 hours a week" }) === "15 hours a week" && L.oneUnit("two days a week") === "two days a week");
  const EM = await import("../lib/proposals/emails");
  const pe = EM.proposalEmail({ signer: "Ivy Hollis", member: "Pat Rowan", memberTitle: "Fractional VP Sales", title: "Fractional sales leader for Larkfield Robotics", company: "Larkfield Robotics", link: "https://post.example.com/sign/x", expiresAt: iso(30 * DAY) });
  check("the proposal email names the company once, in its subject, text and page", !/Larkfield Robotics for Larkfield Robotics/.test(pe.subject + pe.text + pe.html) && (pe.text.match(/Larkfield Robotics/g) ?? []).length === 1, pe.text.split("\n")[2]);
  check("and adds it when the title doesn't name it", EM.proposalName("Sales plan", "Larkfield Robotics") === "Sales plan for Larkfield Robotics" && EM.proposalName("Sales plan", "") === "Sales plan");
  check("blanks are counted once", L.blanksOf([{ id: "a", blockId: "custom", title: "x", body: "{{a}} {{b}} {{a}}" }], { b: "1" }).join() === "a");

  /* ================= the extractor ================= */
  console.log("\nthe extractor");
  const ex = X.extract(TRANSCRIPT, "Pat Rowan");
  const keys = (k: string) => ex.suggestions.filter((s) => s.key === k).map((s) => s.text);
  check("WebVTT: speakers and turns read", ex.speakers.join() === "Pat Rowan,Dana Whitfield" && ex.utterances >= 3, ex.speakers);
  check("a goal with its deadline", keys("goals.target").some((t) => /\$20M by end of next year/.test(t)), keys("goals.target"));
  check("pains in their words", keys("pains").some((t) => /nobody owns the forecast/.test(t)) && keys("pains").some((t) => /pipeline is flat/.test(t)), keys("pains"));
  check("numbers: a percentage and a cycle length", keys("metrics").some((t) => /18 percent/.test(t)), keys("metrics"));
  check("what they tried", keys("priorAttempts").some((t) => /agency/.test(t)), keys("priorAttempts"));
  check("systems", keys("currentState.systems").some((t) => /CRM was set up/.test(t)), keys("currentState.systems"));
  check("who decides", keys("decision.process").some((t) => /our CEO/.test(t)), keys("decision.process"));
  check("budget signals: a quote and too expensive", keys("budget.signals").some((t) => /quoted \$15k a month/.test(t)), keys("budget.signals"));
  check("a timeline", keys("timeline").length > 0, keys("timeline"));
  check("the next step the member agreed", keys("nextStep").some((t) => /Let's meet Thursday/.test(t)), keys("nextStep"));
  check("the role they picture and who they want", keys("roleShape").some((t) => /two days a week/.test(t)) && keys("candidate").some((t) => /Ideally/.test(t)));
  check("what they can give", keys("dependencies").some((t) => /give you access/.test(t)), keys("dependencies"));
  check("the people involved", keys("stakeholders").some((t) => /reports to the COO/.test(t)), keys("stakeholders"));
  check("sensitivities found, for the member only", keys("sensitivities").some((t) => /delicate/.test(t)) && L.DISCOVERY_TARGET.sensitivities === null);
  check("the buyer's own phrases", keys("buyerPhrases").length > 0 && ex.suggestions.filter((s) => s.key === "buyerPhrases").every((s) => s.buyer), keys("buyerPhrases"));
  check("the member's own questions are never the buyer's pains", !ex.suggestions.some((s) => s.key === "pains" && /problem you keep hitting/.test(s.text)));
  check("the person who signs wasn't on the call (\"I need to check with\")", ex.signerOnCall === false && /check with our CEO/.test(ex.signerWhy ?? ""), ex);
  check("every suggestion within its length and the per-field limit", ex.suggestions.every((s) => s.text.length <= X.MAX_LINE) && Object.values(ex.suggestions.reduce((a, s) => ((a[s.key] = (a[s.key] ?? 0) + 1), a), {} as Record<string, number>)).every((n) => n <= X.PER_FIELD));
  const srt = X.parseTranscript("1\n00:00:01,000 --> 00:00:04,000\nDana: The problem is the forecast.\n\n2\n00:00:05,000 --> 00:00:08,000\nPat: Got it.\n");
  check("SRT: numbers and timestamps skipped, speakers kept", srt.length === 2 && srt[0].speaker === "Dana" && srt[0].text === "The problem is the forecast." && srt[1].speaker === "Pat", srt);
  const plain = X.extract("[00:02] Dana Whitfield: I can approve this myself. We were quoted 12k per month.\nPat Rowan: Thanks.", "Pat Rowan");
  check("plain text with times: the signer was on the call (\"I can approve\")", plain.signerOnCall === true && plain.suggestions.some((s) => s.key === "budget.signals"), plain);
  check("files it reads", X.transcriptOk("call.vtt") && X.transcriptOk("Call.SRT") && X.transcriptOk("notes.md") && X.transcriptOk("t.txt") && !X.transcriptOk("call.pdf"));

  /* ================= create and edit ================= */
  console.log("\ncreate and edit");
  // Pat unlocks Acme, so its name is hers to see. Quillmoor stays locked.
  await T.perform(PAT, { type: "unlock", entity: "company", id: ACME, field: "identity" } as never, BASE);
  let p: ProposalRec = await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyId: ACME }, BASE);
  check("a new draft from a template, for a company on Merlin", p.status === "draft" && p.version === 1 && p.templateId === "fractional-sales-leader" && p.company.id === ACME && p.company.name === "Acme Robotics", p);
  check("fields from the record: name and revenue band", p.fields["client.companyName"] === "Acme Robotics" && p.fields["company.revenue"] === "$5M–$20M" && p.sources["company.revenue"] === "record", p.fields);
  check("fields from the profile: name and title", p.fields["provider.name"] === "Pat Rowan" && p.fields["provider.title"] === "Fractional VP Sales" && p.sources["provider.name"] === "profile");
  check("the library's defaults: a 3-month term, 30 days' notice", p.fields["term.initialMonths"] === "3" && p.fields["term.noticeDays"] === "30", p.fields);
  check("the template's blocks, with guidance for each", p.blocks.length === tb.length && p.blocks.every((b) => !!L.guidanceFor(b.blockId, p.templateId)?.guidance));
  const hidden = await S.createProposal(PAT, { templateId: null, companyId: HID }, BASE);
  check("a locked company's proposal never carries its name", hidden.company.name === "" && !JSON.stringify(hidden).includes("Quillmoor"), hidden.company);
  const typed = await S.createProposal(PAT, { companyName: "Bramble & Finch Studio" }, BASE);
  check("a company typed in, not on Merlin, from a blank page", typed.company.id === null && typed.company.name === "Bramble & Finch Studio" && typed.templateId === null && typed.blocks.some((b) => b.blockId === "signature"));
  check("no such company", (await refused(S.createProposal(PAT, { companyId: "c_notreal" }, BASE)))?.includes("isn't on Merlin"));
  // DG-09: bidi overrides, isolates and zero-width characters never reach a title, a block or a field.
  const bd = await S.updateProposal(PAT, typed.id, { title: "‮tfard‬ Plan​ for ⁦Bramble⁩﻿", setFields: { "goals.target": "Grow‍ pipeline ‭fast" } }, BASE);
  check("DG-09: a proposal's title and fields drop bidi and zero-width characters", bd.title === "tfard Plan for Bramble" && bd.fields["goals.target"] === "Grow pipeline fast", [bd.title, bd.fields["goals.target"]]);

  // Reorder, add, remove.
  const order = p.blocks.map((b) => b.id);
  const swapped = [p.blocks[1], p.blocks[0], ...p.blocks.slice(2)];
  const custom = { ...L.makeBlock("custom"), title: "Why me", body: "I built this twice before." };
  const withCustom = [...swapped.filter((b) => b.blockId !== "proof"), custom];
  p = await S.updateProposal(PAT, p.id, { blocks: withCustom }, BASE);
  check("reorder: the second block first", p.blocks[0].id === order[1] && p.blocks[1].id === order[0]);
  check("remove: proof is gone; add: a custom block at the end", !p.blocks.some((b) => b.blockId === "proof") && p.blocks[p.blocks.length - 1].title === "Why me" && p.blocks[p.blocks.length - 1].blockId === "custom");
  check("saved: read back the same", JSON.stringify((await S.getProposal(PAT, p.id, BASE)).blocks) === JSON.stringify(p.blocks));
  check("too many blocks refused", (await refused(S.updateProposal(PAT, p.id, { blocks: Array.from({ length: 41 }, () => L.makeBlock("custom")) }, BASE)))?.includes("40 blocks"));
  check("still a draft, still version 1", p.status === "draft" && p.version === 1);

  // Accept lines from the call: into fields and notes. Only these are kept.
  let f = { ...p.fields };
  let notes = [...p.notes];
  for (const s of ex.suggestions.filter((x) => ["goals.target", "pains", "budget.signals", "nextStep"].includes(x.key)).slice(0, 6)) ({ fields: f, notes } = L.acceptInto(f, notes, s.key, s.text, new Date().toISOString()));
  p = await S.updateProposal(PAT, p.id, { fields: f, notes, signerOnCall: ex.signerOnCall }, BASE);
  check("accepted lines fill their fields and are kept as notes", /\$20M/.test(p.fields["goals.target"] ?? "") && /forecast/.test(p.fields.pains ?? "") && p.notes.length >= 3, p.fields);
  const stateFile = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the transcript itself is never stored: a line nobody accepted isn't in the state", stateFile.includes("nobody owns the forecast") && !stateFile.includes(SECRET_LINE) && !stateFile.includes("WEBVTT"));
  check("the risk flags: the person who signs wasn't on the call", L.riskFlags(p).some((r) => r.id === "signer_absent") && !L.riskFlags(p).some((r) => r.id === "no_budget_signal"), L.riskFlags(p));
  check("no budget signal and no next step flagged on a fresh draft", L.riskFlags(typed).some((r) => r.id === "no_budget_signal") && L.riskFlags(typed).some((r) => r.id === "no_next_step") && L.riskFlags(typed).some((r) => r.id === "price_deferred"));

  // The checklist before and after.
  const before = L.checklist({ ...p, fields: L.docFields(p) });
  const miss = (id: string) => before.find((c) => c.id === id);
  check("checklist: no signer yet, no price yet, blanks left", miss("signer")?.ok === false && miss("price")?.ok === false && miss("blanks")?.ok === false && /blanks? left/.test(miss("blanks")?.missing ?? ""), before.filter((c) => !c.ok).map((c) => c.id));
  check("checklist: 30/60/90 decisions and client dependencies come from the template", miss("milestones")?.ok === true && miss("dependencies")?.ok === true && miss("workstreams")?.ok === true, before);
  const blanks = L.blanksOf(p.blocks, L.docFields({ ...p, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" } }));
  const set: Record<string, string> = Object.fromEntries(blanks.map((k) => [k, `Filled ${k}`]));
  Object.assign(set, { "pricing.monthlyFee": "$12,000", "pricing.stepDownFee": "$8,000", "pricing.overageRate": "$200", "pricing.allocation": "two days a week", headline: "Build the sales system first, then hire into it" });
  p = await S.updateProposal(PAT, p.id, { setFields: set, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" }, signerOnCall: true }, BASE);
  const after = L.checklist({ ...p, fields: L.docFields(p) });
  check("checklist: every pattern there once it's filled in", after.filter((c) => !c.soft).every((c) => c.ok), after.filter((c) => !c.ok));

  /* ================= rates ================= */
  console.log("\nrates");
  const view = await T.buildView(PAT);
  const adv = R.adviceFromView(view, p);
  check("a rate suggestion for her function at this revenue band", !!adv.suggestion && adv.suggestion.fn === "Sales" && adv.suggestion.band === "$5M–$20M" && adv.suggestion.scope === "sized" && adv.suggestion.figure.state === "range", adv.suggestion);
  check("the market band in words, and where her price sits", /middle half of 12 people/.test(adv.suggestion?.says ?? "") && /^Your price is/.test(adv.suggestion?.sits ?? ""), adv.suggestion);
  check("pricing shape: a build then a step down, a short term, an out", adv.shape.some((x) => /month 4/.test(x)) && adv.shape.some((x) => /3 to 6 months/.test(x)) && adv.shape.some((x) => /day 90/.test(x)) && !!adv.template);
  check("above the band is flagged", L.riskFlags({ ...p, fields: { ...p.fields, "pricing.monthlyFee": "$40,000" } }, adv.suggestion!.high).some((r) => r.id === "over_band"));
  const freeView = await T.buildView(FRE);
  const fadv = R.adviceFromView(freeView, { company: { id: null }, fields: { "company.revenue": "$5M–$20M", "pricing.monthlyFee": "$12,000" }, templateId: null });
  check("Free: the median for every size only, as the benchmarks show it", fadv.suggestion?.scope === "all" && fadv.suggestion.limited === true && fadv.suggestion.figure.state !== "range", fadv.suggestion);

  /* ================= plans ================= */
  console.log("\nplans");
  // Fred's trial (Close): he builds a proposal and saves a template of his own. Then it ends.
  const MN0 = await import("../lib/proposals/mine");
  const fredWas = structuredClone((await T.loadState()).billing!.members.mem_fre);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_fre = { trialStartedAt: iso(-10 * DAY), trialEndsAt: iso(11 * DAY) }));
  check("in the trial: building is on, every template open", (await S.listProposals(FRE, BASE)).canBuild && (await S.listProposals(FRE, BASE)).templatesOpen.length === 5);
  const fp = await S.createProposal(FRE, { templateId: "sprint-90", companyName: "Wrenfield Dairy" }, BASE);
  const fredMine = await MN0.uploadTemplate(FRE, "fred.md", Buffer.from("# Fred's SOW\n\n## Fees\n$5,000 a month for advice, two calls a week and a written plan."));
  check("in the trial: a proposal and a saved template of his own", fp.status === "draft" && /^mt_/.test(fredMine.id));
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_fre = fredWas));
  const fv = await S.listProposals(FRE, BASE);
  check("after the trial: building is off, no template opens (his own neither), no sending", fv.canBuild === false && fv.templatesOpen.length === 0 && fv.templates.every((t) => !t.open) && fv.canSend === false, fv.templates);
  check("  what he made is kept: the proposal and his saved template are still listed", fv.proposals.some((x) => x.id === fp.id) && fv.templates.some((t) => t.id === fredMine.id && t.mine));
  const blank = await S.createProposal(FRE, { companyName: "Wrenfield Dairy" }, BASE).then(() => null, (e: InstanceType<typeof S.ProposalProblem>) => e);
  check("after the trial: a new blank proposal is Close's, with the price and the upgrade link", !!blank && blank.status === 403 && blank.message === S.CLOSE_BUILD && /Close: \$79 a month/.test(blank.message) && /p=billing/.test(blank.upgrade ?? ""), blank?.message);
  check("  from Merlin's templates too", (await refused(S.createProposal(FRE, { templateId: "sprint-90" }, BASE))) === S.CLOSE_BUILD && (await refused(S.createProposal(FRE, { templateId: L.FREE_TEMPLATE }, BASE))) === S.CLOSE_BUILD);
  check("  and from his own saved template", (await refused(S.createProposal(FRE, { templateId: fredMine.id }, BASE))) === S.CLOSE_BUILD);
  check("  no edit, no copy", (await refused(S.updateProposal(FRE, fp.id, { title: "Changed" }, BASE))) === S.CLOSE_BUILD && (await refused(S.duplicateProposal(FRE, fp.id, BASE))) === S.CLOSE_BUILD);
  const upFail = await MN0.uploadTemplate(FRE, "again.md", Buffer.from("# Again\n\n## Fees\n$5,000 a month.")).then(() => null, (e: InstanceType<typeof MN0.MineProblem>) => e);
  check("  no template saved, with the upgrade link", !!upFail && upFail.status === 403 && upFail.message === S.CLOSE_BUILD && /p=billing/.test(upFail.upgrade ?? ""), upFail?.message);
  check("  the kit refuses too", (await refused(import("../lib/proposals/kit").then((K0) => K0.proposalKit(FRE, { templateId: fredMine.id })))) === S.CLOSE_BUILD);
  check("  his template is not deleted: it is still stored", (await T.loadState()).myTemplates?.mem_fre?.some((t) => t.id === fredMine.id) === true);
  const fsend = await S.sendProposal(FRE, fp.id, { signer: { name: "Rhea Wren", email: "rhea@wrenfield.example" } }, BASE).then(() => null, (e: InstanceType<typeof S.ProposalProblem>) => e);
  check("Free: sending is Close's, said plainly with the price, with the upgrade link", !!fsend && fsend.status === 403 && /Sending for signature is on Close: \$79 a month, or \$790 a year/.test(fsend.message) && /p=billing/.test(fsend.upgrade ?? ""), fsend?.message);
  check("Trial: every template and sending", (await S.listProposals(PAT, BASE)).canSend && (await S.listProposals(PAT, BASE)).templatesOpen.length === 5);

  /* ================= privacy ================= */
  console.log("\nprivacy");
  check("another member can't read it", (await refused(S.getProposal(OTH, p.id, BASE)))?.includes("isn't there"));
  check("nor change it", (await refused(S.updateProposal(OTH, p.id, { title: "Mine now" }, BASE)))?.includes("isn't there"));
  check("nor send it", (await refused(S.sendProposal(OTH, p.id, { signer: { name: "Oona Other", email: "x@y.example" } }, BASE)))?.includes("isn't there"));
  check("nor delete or void it", (await refused(S.deleteProposal(OTH, p.id)))?.includes("isn't there") && (await refused(S.voidProposal(OTH, p.id, BASE)))?.includes("isn't there"));
  const ov = await S.listProposals(OTH, BASE);
  check("their list is their own: empty", ov.proposals.length === 0);
  const othTable = JSON.stringify(await T.buildView(OTH));
  check("nothing of it in another member's table", !othTable.includes(p.title) && !othTable.includes("nobody owns the forecast") && !othTable.includes("pr_"));
  const exported = JSON.stringify(await T.exportState());
  check("nothing of it in the export", !exported.includes("nobody owns the forecast") && !exported.includes('"proposals"'));
  check("signed out: nothing", (await refused(S.listProposals(null, BASE)))?.includes("signed out") && (await refused(S.listProposals("not-a-token", BASE)))?.includes("signed out"));

  /* ================= send ================= */
  console.log("\nsend");
  const t2 = await S.createProposal(PAT, { companyName: "Hollis Fabrication" }, BASE);
  check("blanks refused before sending", (await refused(S.sendProposal(PAT, t2.id, { signer: { name: "Ivy Hollis", email: "ivy@hollis.example" } }, BASE)))?.startsWith("Fill the"));
  check("a signer's email is needed", (await refused(S.sendProposal(PAT, p.id, { signer: { name: "Dana Whitfield", email: "not-an-email" } }, BASE)))?.includes("email"));
  check("not to yourself", (await refused(S.sendProposal(PAT, p.id, { signer: { name: "Pat Rowan", email: "pat.proposals@example.com" } }, BASE)))?.includes("not to yourself"));
  const n0 = mails.length;
  const sent = await S.sendProposal(PAT, p.id, { message: "Here's the plan we talked about." }, BASE);
  p = sent.proposal;
  const toDana = mails.slice(n0).filter((m) => m.to === "dana@acmerobotics.example");
  check("sent: one email to the signer, from the member by name", toDana.length === 1 && toDana[0].subject === "Pat Rowan sent you a proposal to sign" && /Review and sign/.test(toDana[0].html) && /No account needed/.test(toDana[0].text), toDana.map((m) => m.subject));
  check("replies go to the member", toDana[0]?.reply_to === "pat.proposals@example.com", toDana[0]?.reply_to);
  check("the member's note above the link", /Here's the plan we talked about/.test(toDana[0]?.text ?? ""));
  const link = toDana[0]?.text.match(/https:\/\/post\.example\.com\/sign\/\S+/)?.[0] ?? "";
  const tok = tokenOf(link);
  check("a signed link that expires", /^s_[A-Za-z0-9_-]{12}\.[0-9a-z]+\.[A-Za-z0-9_-]{32}$/.test(tok) && !!S.readSignToken(tok) && S.readSignToken(tok)!.expMs === Date.parse(p.send!.expiresAt), tok);
  check("status sent, 30 days", p.status === "sent" && p.send!.status === "sent" && Math.round((Date.parse(p.send!.expiresAt) - Date.parse(p.send!.sentAt)) / DAY) === S.SIGN_DAYS);
  check("pipeline: proposal_sent, for the member and the company on Merlin", pipe.length === 1 && pipe[0].kind === "proposal_sent" && pipe[0].memberId === "mem_pat" && pipe[0].companyId === "c_acme", pipe);
  const afterSend = await acmeDeals();
  check(
    "the member's pipeline moved: a deal at Proposal at the company, opened by the proposal, to the signer",
    afterSend.length === 1 && afterSend[0].stage === "proposal" && afterSend[0].source === "proposal" && afterSend[0].via.proposal === "proposal" && afterSend[0].to.name === "Dana Whitfield" && !!afterSend[0].due,
    afterSend,
  );
  check("sending the same version twice refused", (await refused(S.sendProposal(PAT, p.id, {}, BASE)))?.includes("out for signature already"));

  /* ================= the signer ================= */
  console.log("\nsigning");
  const v0 = await S.signerView(tok, who, BASE);
  check("the signing page: open, the document as sent", v0.status === "open" && v0.doc.title === p.title && v0.doc.from.name === "Pat Rowan" && v0.doc.to.name === "Dana Whitfield" && v0.doc.blocks.length === p.blocks.length);
  const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
  const myHash = createHash("sha256").update(JSON.stringify(canon(v0.doc))).digest("hex");
  check("the hash is the SHA-256 of exactly the content shown", v0.hash === myHash && v0.hash === p.send!.hash && /^[0-9a-f]{64}$/.test(myHash));
  check("no blank left in what the client reads", !JSON.stringify(v0.doc).includes("{{"));
  const viewJson = JSON.stringify(v0);
  const PRIVATE = ["pat.proposals@example.com", "mem_pat", "c_acme", "quoted $15k", "budget.signals", "notes", SECRET_LINE, '"fields"', '"sources"', "pr_"];
  check("the signer's view carries nothing private", PRIVATE.every((w) => !viewJson.includes(w)) && /^da\*+@acmerobotics\.example$/.test(v0.emailHint), PRIVATE.filter((w) => viewJson.includes(w)));
  check(
    "the consent: ESIGN-style, with its version (electronic records, legally binding, authority, paper copy at no cost, withdrawing and what it does, what's needed, contact details, the audit trail)",
    /electronic records and an electronic signature/.test(v0.consent) &&
      /legally binding/.test(v0.consent) &&
      /authorised to sign/.test(v0.consent) &&
      /paper copy at any time, at no cost/.test(v0.consent) &&
      /withdraw this consent/.test(v0.consent) &&
      /does not undo anything already signed/.test(v0.consent) &&
      /web browser/.test(v0.consent) &&
      /email address changes/.test(v0.consent) &&
      /fingerprint of this exact document/.test(v0.consent) &&
      v0.consentVersion === CONSENT_VERSION,
    v0.consent,
  );
  const p1 = await S.getProposal(PAT, p.id, BASE);
  check("viewed: on the audit trail with IP and browser, once", p1.status === "viewed" && p1.send!.events.filter((e) => e.kind === "viewed").length === 1 && p1.send!.events.find((e) => e.kind === "viewed")?.ip === who.ip);
  await S.signerView(tok, who, BASE);
  check("a second open isn't noted again", (await S.getProposal(PAT, p.id, BASE)).send!.events.filter((e) => e.kind === "viewed").length === 1);
  check("signing before the code is refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE)))?.includes("code first"));
  const m0 = mails.length;
  const code1 = await S.requestCode(tok, who);
  const codeMail = mails.slice(m0).find((m) => m.to === "dana@acmerobotics.example");
  const code = codeMail?.text.match(/\b(\d{6})\b/)?.[1] ?? "";
  check("a 6-digit code by email to the signer", code1.sent && /^\d{6}$/.test(code) && /Your code to sign/.test(codeMail?.subject ?? ""), codeMail?.subject);
  check("the code isn't stored as itself", !readFileSync(path.join(dir, "intel.json"), "utf8").includes(`"${code}"`));
  const wrong = code === "000000" ? "111111" : "000000";
  check("a wrong code refused, and counted", (await refused(S.verifyCode(tok, wrong, who, BASE)))?.includes("didn't match") && (await S.getProposal(PAT, p.id, BASE)).send!.events.some((e) => e.kind === "code_failed"));
  check("not 6 digits refused", (await refused(S.verifyCode(tok, "12ab", who, BASE)))?.includes("6 digits"));
  const v1 = await S.verifyCode(tok, code, who, BASE);
  check("the right code confirms the email", v1.codeVerified === true);
  check("the code works once", (await refused(S.verifyCode(tok, code, who, BASE)))?.includes("expired"));
  check("a one-word name refused", (await refused(S.signProposal(tok, { name: "Dana", consent: true, hash: v0.hash }, who, BASE)))?.includes("full name"));
  check("no consent refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: false, hash: v0.hash }, who, BASE)))?.includes("agree"));
  check("a document that isn't the one shown refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: "0".repeat(64) }, who, BASE)))?.includes("out of date"));
  const m1 = mails.length;
  const signedV = await S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE);
  check("signed", signedV.status === "signed" && signedV.signedName === "Dana Whitfield" && !!signedV.copyUrl);
  const copyMails = mails.slice(m1);
  check("the signed copy to both sides", copyMails.some((m) => m.to === "dana@acmerobotics.example" && /^Signed: /.test(m.subject)) && copyMails.some((m) => m.to === "pat.proposals@example.com" && /^Signed: /.test(m.subject)), copyMails.map((m) => [m.to, m.subject]));
  check("each with the link to the copy and the fingerprint", copyMails.every((m) => /\/signed\/s_/.test(m.text) && m.text.includes(v0.hash)));
  check("pipeline: signed (Won)", pipe.map((x) => x.kind).join() === "proposal_sent,signed" && pipe[1].companyId === "c_acme");
  const afterSign = await acmeDeals();
  const wonDeal = afterSign.find((e) => e.id === afterSend[0]?.id);
  const pfields = L.docFields(await S.getProposal(PAT, p.id, BASE));
  const termMonths = Number(pfields["term.initialMonths"]);
  check(
    "the same deal moved to Won, from the signed proposal, at the signing time",
    afterSign.length === 1 && wonDeal?.stage === "won" && wonDeal.via.won === "proposal" && wonDeal.dates.won === signedV.signedAt && wonDeal.due === null,
    afterSign,
  );
  check(
    "the Won terms are the proposal's: $12,000 a month, two days a week as 16 hours, its initial term",
    wonDeal?.won?.pricing === "monthly" && wonDeal.won.rate === 12000 && wonDeal.won.hours === 16 && wonDeal.won.months === (Number.isInteger(termMonths) && termMonths > 0 ? termMonths : null) && P.monthlyValue(wonDeal.won) === 12000,
    wonDeal?.won,
  );
  const ps = await S.getProposal(PAT, p.id, BASE);
  check("the member sees it signed, with the copy's link", ps.status === "signed" && ps.send!.signedName === "Dana Whitfield" && ps.send!.copyUrl === signedV.copyUrl);
  const kinds = ps.send!.events.map((e) => e.kind);
  check("the audit trail: sent, viewed, code sent, code failed, code verified, signed, copy sent, in order", ["sent", "viewed", "code_sent", "code_failed", "code_verified", "signed", "copy_sent"].every((k, i, a) => kinds.indexOf(k as never) >= 0 && (i === 0 || kinds.indexOf(k as never) > kinds.indexOf(a[i - 1] as never))), kinds);
  check("timestamps on every event, IP and browser on each of the signer's steps", ps.send!.events.every((e) => !Number.isNaN(Date.parse(e.at))) && ps.send!.events.filter((e) => ["viewed", "code_verified", "signed"].includes(e.kind)).every((e) => e.ip === who.ip && e.ua === who.ua));
  const copy = await S.signedCopy(copyOf(signedV.copyUrl!));
  check("the signed copy: the document, its hash matching the content, the signature", !!copy && copy.hash === v0.hash && copy.hashNow === copy.hash && copy.signed.name === "Dana Whitfield" && copy.signed.email === "dana@acmerobotics.example" && copy.signed.ip === who.ip && copy.signed.ua === who.ua && copy.signed.consentVersion === CONSENT_VERSION && /electronic/.test(copy.signed.consent) && copy.signed.hash === v0.hash);
  check("a tampered copy link opens nothing", (await S.signedCopy(copyOf(signedV.copyUrl!).replace(/.$/, (c) => (c === "A" ? "B" : "A")))) === null && (await S.signedCopy("s_nope.nope")) === null);
  check("frozen after signing: no change, no void, no delete", (await refused(S.updateProposal(PAT, p.id, { title: "Changed" }, BASE)))?.includes("signed") && (await refused(S.voidProposal(PAT, p.id, BASE)))?.includes("signed") && (await refused(S.deleteProposal(PAT, p.id)))?.includes("record"));
  check("signing twice refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE)))?.includes("signed already"));
  const dup = await S.duplicateProposal(PAT, p.id, BASE);
  check("duplicate a signed one: a new draft, version 1", dup.status === "draft" && dup.version === 1 && dup.id !== p.id && dup.send === null);
  check("a tampered signing link refused", (await refused(S.signerView(tok.replace(/.$/, (c) => (c === "A" ? "B" : "A")), who, BASE)))?.includes("doesn't work") && (await refused(S.signerView("s_aaaaaaaaaaaa.zz.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", who, BASE)))?.includes("doesn't work"));

  /* ================= decline, void, versions, expiry ================= */
  console.log("\ndecline, void, versions, expiry");
  const ready = async (name: string) => {
    let q = await S.createProposal(PAT, { companyName: name }, BASE);
    const b = L.blanksOf(q.blocks, L.docFields({ ...q, signer: { name: "Mara Lind", email: "mara@lind.example" } }));
    q = await S.updateProposal(PAT, q.id, { setFields: Object.fromEntries(b.map((k) => [k, k.startsWith("pricing.") ? "$9,000" : `Filled ${k}`])) }, BASE);
    return q;
  };
  // Decline: on a company on Merlin, so the pipeline hears it.
  let d = await S.createProposal(PAT, { templateId: "advisory", companyId: ACME }, BASE);
  d = await S.updateProposal(PAT, d.id, { setFields: Object.fromEntries(L.blanksOf(d.blocks, L.docFields({ ...d, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example" } })).map((k) => [k, k.startsWith("pricing.") ? "$4,000" : `Filled ${k}`])) }, BASE);
  await S.sendProposal(PAT, d.id, { signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example" } }, BASE);
  const dtok = tokenOf(lastMail("dana@acmerobotics.example")!.text);
  const m2 = mails.length;
  const dv = await S.declineProposal(dtok, { reason: "We're going to wait until next quarter." }, who, BASE);
  check("declined, with the reason", dv.status === "declined" && (await S.getProposal(PAT, d.id, BASE)).send!.declineReason === "We're going to wait until next quarter.");
  check("the member is told by email, with the reason", mails.slice(m2).some((m) => m.to === "pat.proposals@example.com" && /declined/.test(m.subject) && /next quarter/.test(m.text)));
  check("pipeline: declined (Lost)", pipe[pipe.length - 1].kind === "declined" && pipe[pipe.length - 1].companyId === "c_acme");
  const afterDecline = await acmeDeals();
  check(
    "a new proposal after the win opened a new deal, and its decline moved that one to Lost; the Won deal stays Won",
    afterDecline.length === 2 && afterDecline.some((e) => e.id === wonDeal?.id && e.stage === "won" && e.won?.rate === 12000) && afterDecline.some((e) => e.id !== wonDeal?.id && e.stage === "lost" && e.via.lost === "proposal" && !!e.dates.proposal && !e.won),
    afterDecline.map((e) => [e.stage, e.via]),
  );
  const st0 = P.outcomeStats(await T.loadState());
  check("the admin's numbers: one won from a signed proposal", st0.won === 1 && st0.wonFromProposal === 1, st0);
  check("a declined link can't be signed or asked for a code", (await refused(S.requestCode(dtok, who)))?.includes("declined"));

  // Void.
  const vq = await ready("Lind Outfitters");
  await S.sendProposal(PAT, vq.id, { signer: { name: "Mara Lind", email: "mara@lind.example" } }, BASE);
  const vtok = tokenOf(lastMail("mara@lind.example")!.text);
  const pipeN = pipe.length;
  const voided = await S.voidProposal(PAT, vq.id, BASE);
  check("void: the member withdraws a sent proposal", voided.status === "void" && voided.send!.events.some((e) => e.kind === "voided"));
  check("a typed-in company isn't sent to the pipeline (no company on Merlin)", pipe.length === pipeN);
  const vv = await S.signerView(vtok, who, BASE);
  check("a voided link opens as withdrawn, and can't be signed", vv.status === "void" && (await refused(S.requestCode(vtok, who)))?.includes("withdrew"));
  check("voiding twice refused", (await refused(S.voidProposal(PAT, vq.id, BASE)))?.includes("no sent link"));
  const resent = await S.sendProposal(PAT, vq.id, { signer: { name: "Mara Lind", email: "mara@lind.example" } }, BASE);
  check("sending again after a void: a new version and a new link", resent.proposal.version === 2 && resent.proposal.status === "sent" && tokenOf(lastMail("mara@lind.example")!.text) !== vtok);

  // A change after sending: a new version, and the old link stops.
  const cq = await ready("Calder Instruments");
  await S.sendProposal(PAT, cq.id, { signer: { name: "Mara Lind", email: "mara.calder@lind.example" } }, BASE);
  const ctok = tokenOf(lastMail("mara.calder@lind.example")!.text);
  const notesOnly = await S.updateProposal(PAT, cq.id, { notes: [{ key: "pains", text: "A note for me" }] }, BASE);
  check("a note only (nothing the client reads) keeps the version and the link", notesOnly.version === 1 && notesOnly.status === "sent");
  const changed = await S.updateProposal(PAT, cq.id, { title: "Calder Instruments: the new plan" }, BASE);
  check("a change after sending: version 2, back to a draft", changed.version === 2 && changed.status === "draft" && changed.history.length === 1 && changed.history[0].status === "void");
  const cv = await S.signerView(ctok, who, BASE);
  check("the old link says it changed, and can't be signed", cv.status === "changed" && (await refused(S.signProposal(ctok, { name: "Mara Lind", consent: true, hash: cv.hash }, who, BASE)))?.includes("changed"));
  await S.sendProposal(PAT, cq.id, {}, BASE);
  const c2 = tokenOf(lastMail("mara.calder@lind.example")!.text);
  const c2v = await S.signerView(c2, who, BASE);
  check("the new version's link works, with the new title and version", c2v.status === "open" && c2v.doc.title === "Calder Instruments: the new plan" && c2v.doc.version === 2 && (await S.signerView(ctok, who, BASE)).status === "changed");

  // Expired.
  const eq = await ready("Ostrander Marine");
  await S.sendProposal(PAT, eq.id, { signer: { name: "Ola Ostrander", email: "ola@ostrander.example" } }, BASE, Date.now() - 31 * DAY);
  const etok = tokenOf(lastMail("ola@ostrander.example")!.text);
  const ev = await S.signerView(etok, who, BASE);
  check("an expired link opens as expired", ev.status === "expired" && (await S.getProposal(PAT, eq.id, BASE)).status === "expired");
  check("and is refused for a code and a signature", (await refused(S.requestCode(etok, who)))?.includes("expired") && (await refused(S.signProposal(etok, { name: "Ola Ostrander", consent: true, hash: ev.hash }, who, BASE)))?.includes("expired"));
  const er = await S.sendProposal(PAT, eq.id, {}, BASE);
  check("sent again after expiry: a new version", er.proposal.version === 2 && er.proposal.status === "sent");

  // Codes: expiry and the hourly limit.
  const kq = await ready("Kestrel Foods");
  await S.sendProposal(PAT, kq.id, { signer: { name: "Kai Kestrel", email: "kai@kestrel.example" } }, BASE);
  const ktok = tokenOf(lastMail("kai@kestrel.example")!.text);
  await S.requestCode(ktok, who, Date.now() - 20 * 60_000);
  const oldCode = lastMail("kai@kestrel.example")!.text.match(/\b(\d{6})\b/)![1];
  check("a code older than 15 minutes refused", (await refused(S.verifyCode(ktok, oldCode, who, BASE)))?.includes("expired"));
  for (let i = 0; i < 4; i++) await S.requestCode(ktok, who);
  check("at most 5 codes an hour", (await refused(S.requestCode(ktok, who)))?.includes("5 codes in an hour"));

  /* ================= proposals land in the pipeline (QA: a typed company never linked) ================= */
  console.log("\nproposals land in the pipeline");
  const hidDeals = async () => ((await T.loadState()).pipeline?.mem_pat?.entries ?? []).filter((e) => e.companyId === "c_hid");
  const byName = await S.createProposal(PAT, { companyName: "Quillmoor Systems" }, BASE);
  check("a company typed by its exact name links it, a locked one too, under the name she typed", byName.company.id === HID && byName.company.name === "Quillmoor Systems", byName.company);
  check("its free facts fill in from the record", byName.fields["company.revenue"] === "$20M–$50M", byName.fields);
  const bySite = await S.createProposal(PAT, { companyName: "quillmoor.example" }, BASE);
  check("its website links it too", bySite.company.id === HID, bySite.company);
  await S.deleteProposal(PAT, bySite.id);
  const partial = await S.createProposal(PAT, { companyName: "Quillmoor" }, BASE);
  check("a part of a name links nothing: not linked yet", partial.company.id === null && partial.company.name === "Quillmoor" && S.NOT_LINKED === "Not linked to a company yet. Your pipeline won't move when they sign.", partial.company);
  const pUnl = await C.getProposalTool({ member: (await T.memberForToken(PAT))!, origin: BASE }, { proposal_id: partial.id });
  check("the connector says it isn't linked, and how to link it", /Not linked to a company on Merlin yet/.test(String(pUnl.pipeline)) && !("company_id" in pUnl), pUnl.pipeline);
  // Sent and signed while unlinked: the pipeline hears nothing.
  const fillP = Object.fromEntries(L.blanksOf(partial.blocks, L.docFields({ ...partial, signer: { name: "Wes Quill", email: "wes@quillmoor.example" } })).map((k) => [k, k.startsWith("pricing.") ? "$7,000" : `Filled ${k}`]));
  await S.updateProposal(PAT, partial.id, { setFields: fillP }, BASE);
  const pipeU = pipe.length;
  await S.sendProposal(PAT, partial.id, { signer: { name: "Wes Quill", email: "wes@quillmoor.example" } }, BASE);
  const utok = tokenOf(lastMail("wes@quillmoor.example")!.text);
  await S.requestCode(utok, who);
  const ucode = lastMail("wes@quillmoor.example")!.text.match(/\b(\d{6})\b/)![1];
  await S.verifyCode(utok, ucode, who, BASE);
  const uview = await S.signerView(utok, who, BASE);
  await S.signProposal(utok, { name: "Wes Quill", consent: true, hash: uview.hash }, who, BASE);
  check("sent and signed while not linked: the pipeline heard nothing", pipe.length === pipeU && (await hidDeals()).length === 0);
  check("another member can't link it", !!(await refused(S.linkProposal(OTH, partial.id, { name: "Quillmoor Systems" }, BASE))));
  check("a name that finds nothing says so, and links nothing", /didn't find one company/.test((await refused(S.linkProposal(PAT, partial.id, { name: "Quillmoor" }, BASE))) ?? ""));
  const linked = await S.linkProposal(PAT, partial.id, { name: "Quillmoor Systems" }, BASE);
  const hd = await hidDeals();
  check("Pick the company: linked, what the client read unchanged (same version, same name)", linked.company.id === HID && linked.company.name === "Quillmoor" && linked.version === 1 && linked.status === "signed", linked.company);
  check("signed before it was linked: the pipeline catches up, Won from the proposal", hd.length === 1 && hd[0].stage === "won" && hd[0].via.won === "proposal" && pipe.at(-1)?.kind === "signed", hd.map((e) => [e.stage, e.via]));
  const again2 = await S.linkProposal(PAT, partial.id, { name: "Quillmoor Systems" }, BASE);
  check("linking again changes nothing", again2.company.id === HID && (await hidDeals()).length === 1 && pipe.length === pipeU + 1);
  // A typed name that links: sent moves it to Proposal, signed to Won (as a proposal picked from Merlin).
  const fillN = Object.fromEntries(L.blanksOf(byName.blocks, L.docFields({ ...byName, signer: { name: "Wes Quill", email: "wes2@quillmoor.example" } })).map((k) => [k, k.startsWith("pricing.") ? "$7,000" : `Filled ${k}`]));
  await S.updateProposal(PAT, byName.id, { setFields: fillN }, BASE);
  await S.sendProposal(PAT, byName.id, { signer: { name: "Wes Quill", email: "wes2@quillmoor.example" } }, BASE);
  check("a typed name that linked: sent moves the pipeline to Proposal", (await hidDeals()).some((e) => e.stage === "proposal" && e.via.proposal === "proposal"), (await hidDeals()).map((e) => e.stage));
  const ntok = tokenOf(lastMail("wes2@quillmoor.example")!.text);
  await S.requestCode(ntok, who);
  await S.verifyCode(ntok, lastMail("wes2@quillmoor.example")!.text.match(/\b(\d{6})\b/)![1], who, BASE);
  await S.signProposal(ntok, { name: "Wes Quill", consent: true, hash: (await S.signerView(ntok, who, BASE)).hash }, who, BASE);
  check("and signed moves it to Won", (await hidDeals()).filter((e) => e.stage === "won").length === 2, (await hidDeals()).map((e) => e.stage));
  // The editor shows the warning with a way to pick the company.
  const ed = readFileSync(path.join(process.cwd(), "app/post/ProposalLink.tsx"), "utf8") + readFileSync(path.join(process.cwd(), "app/post/Proposals.tsx"), "utf8");
  check("the editor warns when it isn't linked, with Pick the company", ed.includes("Not linked to a company yet. Your pipeline won't move when they sign.") && ed.includes("Pick the company") && /!p\.company\.id && <LinkCompany/.test(ed) && /op: "link"/.test(ed));

  /* ================= the connector ================= */
  console.log("\nthe connector");
  const ctx = { member: (await T.memberForToken(PAT))!, origin: BASE };
  const fctx = { member: (await T.memberForToken(FRE))!, origin: BASE };
  const lib = await C.listProposalTemplates(ctx);
  check("list_proposal_templates: templates, blocks with guidance and fields, what to pull from a call", (lib.templates as unknown[]).length === 5 && (lib.blocks as { fields: unknown[] }[]).every((b) => Array.isArray(b.fields)) && (lib.from_a_call as { cues: string[] }[]).every((x) => x.cues.length > 0) && /person who signs/.test(String(lib.about)));
  const flist = await C.listProposalTemplates(fctx);
  check("list_proposal_templates after the trial: building is Close's, with the link, and his saved template is counted as kept, not opened", flist.can_build === false && String(flist.plan).startsWith(S.CLOSE_BUILD) && /p=billing/.test(String(flist.plan)) && flist.your_templates_kept === 1 && !("templates" in flist) && !JSON.stringify(flist).includes("$5,000"), flist);
  const made = await C.createOrUpdateProposal(ctx, {
    template_id: "sprint-90",
    company_id: ACME,
    fields: { "goals.target": "Double qualified pipeline by Q3", pains: "Forecast nobody owns\nCRM nobody updates" },
    notes: [{ key: "budget.signals", text: "Another firm quoted about 15k a month" }],
    signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" },
    signer_on_call: false,
  });
  const pid = String(made.proposal_id);
  check("create_or_update_proposal: saved with blocks, fields, notes and the signer", made.saved === true && (made.blocks as unknown[]).length === L.templateDef("sprint-90")!.blocks.length && /Double qualified/.test(JSON.stringify(made.fields)) && (made.notes_from_calls as unknown[]).length === 1);
  check("its answer: blanks, checklist and risk flags (the signer wasn't on the call)", (made.blanks as string[]).length > 0 && (made.checklist as unknown[]).length > 5 && (made.risk_flags as string[]).some((r) => /wasn't on the call/.test(r)));
  check("and the rates for this company's size", /middle half/.test(JSON.stringify(made.rates)));
  check("its fields are marked as Claude's", (await S.getProposal(PAT, pid, BASE)).sources["goals.target"] === "claude");
  const upd = await C.createOrUpdateProposal(ctx, { proposal_id: pid, blocks: [{ block_id: "cover" }, { block_id: "what_we_heard", body: "What we heard:\n{{pains}}" }, { block_id: "signature" }] });
  check("update: blocks in Claude's order, its body kept, the library's starter where it sent none", (upd.blocks as { block_id: string; body: string }[]).map((b) => b.block_id).join() === "cover,what_we_heard,signature" && (upd.blocks as { body: string }[])[1].body === "What we heard:\n{{pains}}" && (upd.blocks as { body: string }[])[0].body === L.STARTER.cover);
  const got = await C.getProposalTool(ctx, { proposal_id: pid });
  check("get_proposal: the text as it reads", (got.blocks as { reads: string }[])[1].reads.includes("- Forecast nobody owns"));
  check("get_proposal without an id: the member's own list", ((await C.getProposalTool(ctx, {})).proposals as { proposal_id: string }[]).some((x) => x.proposal_id === pid));
  const othCtx = { member: (await T.memberForToken(OTH))!, origin: BASE };
  check("another member's Claude can't read it", (await refused(C.getProposalTool(othCtx, { proposal_id: pid })))?.includes("isn't there") && ((await C.getProposalTool(othCtx, {})).proposals as unknown[]).length === 0);
  const fillAll = Object.fromEntries(L.blanksOf((await S.getProposal(PAT, pid, BASE)).blocks, L.docFields(await S.getProposal(PAT, pid, BASE))).map((k) => [k, `Filled ${k}`]));
  await C.createOrUpdateProposal(ctx, { proposal_id: pid, fields: fillAll });
  const m3 = mails.length;
  const ask = await C.sendForSignature(ctx, { proposal_id: pid });
  check("send_proposal_for_signature without confirm: nothing sent, it asks", ask.confirmed === false && /Nothing was sent/.test(String(ask.message)) && /confirm: true/.test(String(ask.next)) && mails.length === m3 && (await S.getProposal(PAT, pid, BASE)).status === "draft", ask);
  const yes = await C.sendForSignature(ctx, { proposal_id: pid, confirm: true });
  check("with confirm: sent", yes.confirmed === true && (await S.getProposal(PAT, pid, BASE)).status === "sent" && mails.slice(m3).some((m) => m.to === "dana@acmerobotics.example"), yes);
  check("create_or_update_proposal after the trial: a new one refused with the upgrade link", (await refused(C.createOrUpdateProposal(fctx, { template_id: L.FREE_TEMPLATE, company_name: "Wrenfield Dairy" })))?.startsWith(S.CLOSE_BUILD) === true);
  const fredPid = (await S.listProposals(FRE, BASE)).proposals[0].id;
  check("  an edit to the one from his trial refused too", (await refused(C.createOrUpdateProposal(fctx, { proposal_id: fredPid, title: "New title" })))?.startsWith(S.CLOSE_BUILD) === true);
  check("  from his own template neither", (await refused(C.createOrUpdateProposal(fctx, { template_id: (await S.listProposals(FRE, BASE)).templates.find((t) => t.mine)!.id, company_name: "X" })))?.includes("Close") === true);
  check("Free through Claude: sending is Close's", /Sending for signature is on Close/.test((await refused(C.sendForSignature(fctx, { proposal_id: fredPid, signer_name: "Rhea Wren", signer_email: "rhea@wrenfield.example", confirm: true }))) ?? ""));

  /* ================= the pipeline, on its own ================= */
  console.log("\nthe pipeline hook, on its own");
  check("hours a week from the allocation: hours a week, hours a month, days a week, nothing", H.hoursAWeek("15 hours a week") === 15 && H.hoursAWeek("60 hrs/month") === 13.8 && H.hoursAWeek("two days a week") === 16 && H.hoursAWeek("1.5 days per week") === 12 && H.hoursAWeek("as needed") === null && H.hoursAWeek(undefined) === null);
  check("terms need a monthly fee", H.wonTermsOf({ fields: { "pricing.allocation": "10 hours a week" }, version: 1, signer: null }) === null);
  const mkProposal = (id: string, companyId: string, fields: Record<string, string>, signedAt?: string) =>
    ({ id, memberId: "m_x", companyId, companyPub: null, companyName: "X", templateId: null, title: "Plan", blocks: [], fields, sources: {}, notes: [], signerOnCall: null, signer: { name: "Ivy Hollis", email: "ivy@x.example", title: "CEO" }, version: 1, createdAt: iso(0), updatedAt: signedAt ?? iso(0), sends: signedAt ? [{ id: `s_${id}`, version: 1, sentAt: iso(DAY), expiresAt: iso(30 * DAY), signed: { at: signedAt } }] : [] }) as unknown as import("../lib/proposals/types").StoredProposal;
  const st = { pipeline: { m_x: P.emptyPipeline() }, proposals: [] } as unknown as State;
  const xlog = st.pipeline!.m_x;
  // A deal that came through an intro the member asked for, and that was made.
  const intro = P.addIntro(xlog, { id: "in_x", companyId: "c_x", introducer: { name: "Rob Intro" }, nowMs: t0 }).intro;
  P.markIntro(intro, "made", "asker", t0);
  const opened = P.openEntry(xlog, { id: "pl_intro", companyId: "c_x", channel: "intro", to: { name: "Ivy Hollis" }, source: "intro", via: "you", nowMs: t0, introId: "in_x" }).entry;
  intro.entryId = opened.id;
  st.proposals = [mkProposal("pr_x", "c_x", { "pricing.monthlyFee": "$9,000", "pricing.allocation": "60 hours a month", "term.initialMonths": "6" }, iso(3 * DAY))];
  const sentE = H.proposalToPipeline(st, "m_x", "c_x", "proposal_sent", iso(DAY));
  check("sent: the intro's deal moves to Proposal (no second deal)", sentE.id === "pl_intro" && sentE.stage === "proposal" && xlog.entries.length === 1);
  const wonE = H.proposalToPipeline(st, "m_x", "c_x", "signed", iso(3 * DAY));
  check(
    "signed: Won from the proposal, the intro kept, the terms from the proposal (and through Merlin, as an intro's deal is)",
    wonE.id === "pl_intro" && wonE.stage === "won" && wonE.via.won === "proposal" && wonE.introId === "in_x" && wonE.won?.rate === 9000 && wonE.won.hours === 13.8 && wonE.won.months === 6 && wonE.won.merlin === true,
    wonE,
  );
  // Signed at a company with no deal yet: one opens, from the proposal, and goes to Won.
  st.proposals.push(mkProposal("pr_y", "c_y", { "pricing.monthlyFee": "$15k" }, iso(4 * DAY)));
  const newWon = H.proposalToPipeline(st, "m_x", "c_y", "signed", iso(4 * DAY));
  check("signed with no deal yet: a deal opens from the proposal, straight to Won, with its fee", newWon.source === "proposal" && newWon.stage === "won" && newWon.won?.rate === 15000 && newWon.won.hours === null && newWon.won.merlin === false && newWon.to.name === "Ivy Hollis" && newWon.to.role === "CEO", newWon);
  // A deal the member opened with a note: the proposal sent, then declined.
  P.openEntry(xlog, { id: "pl_z", companyId: "c_z", channel: "email", source: "record", via: "note", nowMs: t0 });
  H.proposalToPipeline(st, "m_x", "c_z", "proposal_sent", iso(DAY));
  const lostE = H.proposalToPipeline(st, "m_x", "c_z", "declined", iso(2 * DAY));
  check("declined: the deal moves to Lost", lostE.id === "pl_z" && lostE.stage === "lost" && lostE.via.lost === "proposal" && !lostE.won);
  const xs = P.outcomeStats(st, t0 + 5 * DAY);
  check("the intro is credited with the win, and both wins count as from a signed proposal", xs.won === 2 && xs.wonFromProposal === 2 && xs.intros.made === 1 && xs.intros.won === 1 && xs.wonThroughMerlin === 1, xs);
  const rows = HL.outcomeRows(xs);
  check("Health's outcomes: Won from a signed proposal, after Won through Merlin", rows.find((r) => r.label === "Won from a signed proposal")?.n === 2 && rows.findIndex((r) => r.label === "Won from a signed proposal") === rows.findIndex((r) => r.label === "Won through Merlin") + 1, rows);


  /* ================= drafting with Claude ================= */
  console.log("\ndrafting with Claude");
  const D = await import("../lib/proposals/draft");
  const K = await import("../lib/proposals/kit");
  const AIC = await import("../lib/proposals/aiConfig");
  const CALL = `Pat Rowan: What would make this a win by spring?
Dana Whitfield: Honestly the blue whiteboard in the warehouse is our whole forecast, and nobody trusts it.
Dana Whitfield: We want to reach $20M next year from about $9M now, with four reps.
Dana Whitfield: Our board meets in March and I need a plan before then. We were quoted $15k a month by a firm, which felt like a lot.
Pat Rowan: Let's meet Thursday to go through it.`.repeat(3);
  const UNIQUE = "blue whiteboard in the warehouse";
  const aiEnv = { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-ant-test-fake", RN_AI_MODEL: "model-from-the-env", RN_AI_TEST_BASE_URL: AI_BASE };
  const draftJson = {
    title: "Sales system build for Acme Robotics",
    blocks: [
      { block_id: "cover", title: "Cover", body: "A sales system you can trust by March\n\nPrepared for Dana Whitfield, COO, Acme Robotics" },
      { block_id: "what_we_heard", title: "What we heard", body: "- Your forecast lives on one whiteboard, and nobody trusts it.\n- You want $20M next year, from about $9M today, with four reps." },
      { block_id: "milestones", title: "Milestones", body: "- Day 30: a readout. You decide what we fix first.\n- Day 60: the new process is live. You decide what to scale.\n- Day 90: results against plan. You decide to continue, scale up or stop." },
      { block_id: "investment", title: "Timeline and investment", body: "Months 1 to 3: $12,000 a month for two days a week. From month 4: $8,000 a month. Start date: {{start.date}}." },
      { block_id: "not_a_block", title: "A section of their own", body: "Something the template doesn't have." },
    ],
    fields: { monthly_fee: "$12,000", step_down_fee: "$8,000", allocation: "two days a week", initial_months: "3", notice_days: "30", goal: "$20M next year", call_date: "", next_step: "Thursday: walk through the plan" },
    signer: { name: "Dana Whitfield", title: "COO" },
    signer_on_call: "yes",
    notes: [{ key: "budget.signals", text: "Quoted $15k a month elsewhere, felt high" }],
    to_fix: ["Confirm the start date", "Add Dana's email before you send"],
  };
  const reply = (text: string, stop = "end_turn", use = { input_tokens: 10, output_tokens: 10 }) => ({ json: { id: "msg_fake", type: "message", role: "assistant", model: "model-from-the-env", content: [{ type: "text", text }], stop_reason: stop, stop_sequence: null, usage: use } });
  aiAnswer = () => reply(JSON.stringify(draftJson));
  const setEnv = (on: boolean) => {
    for (const [k, v] of Object.entries(aiEnv)) on ? (process.env[k] = v) : delete process.env[k];
  };
  setEnv(false);
  check("switch off: drafting with Claude is off, the page says so", !AIC.aiConfigured() && (await S.listProposals(PAT, BASE)).ai === "off");
  const offErr = await S.createProposal(PAT, { companyId: ACME }, BASE).then(() => D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL, agree: true }, BASE)).then(() => null, (e: Error) => e.message);
  check("switch off: a draft request is refused with what to do instead, and nothing is called", offErr === D.AI_OFF && aiCalls.length === 0, offErr);
  process.env.RN_AI_DRAFTS = "1";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake";
  check("on without a model it stays off: no model is named in the code", !AIC.aiConfigured());
  setEnv(true);
  check("on with the key and RN_AI_MODEL", AIC.aiConfigured() && AIC.aiModel() === "model-from-the-env");
  check("Free: drafting with Claude is Pro's", (await S.listProposals(FRE, BASE)).ai === "plan" && (await refused(D.draftWithClaude(FRE, { companyName: "Wrenfield Dairy", transcript: CALL, agree: true }, BASE))) === D.AI_PLAN);
  const av0 = await S.listProposals(PAT, BASE);
  check("Trial: on, and not agreed yet", av0.ai === "on" && av0.aiAgreed === false);
  const aiAsk = await D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE).then(() => null, (e: InstanceType<typeof S.ProposalProblem>) => e);
  check("it asks first: the transcript goes to Anthropic only after the member agrees", aiAsk?.status === 428 && aiAsk.message.startsWith(D.AI_CONSENT) && !/Claude|Anthropic/.test(aiAsk.message) && aiCalls.length === 0, aiAsk?.message);
  check("a few lines aren't enough to draft from", (await refused(D.draftWithClaude(PAT, { companyId: ACME, transcript: "Hi there.", agree: true }, BASE)))?.includes("isn't enough"));
  // A voice of her own, so the kit carries it.
  await T.tableInternals.mutate((st) => {
    (st.voice ??= {}).mem_pat = { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: ["Happy to dig in"], at: iso(0), by: "you" };
  });
  const nP = (await S.listProposals(PAT, BASE)).proposals.length;
  const dr = await D.draftWithClaude(PAT, { templateId: "fractional-sales-leader", companyId: ACME, transcript: CALL, callDate: "November 18, 2026", callWith: "Dana Whitfield", agree: true }, BASE);
  check("one request to Anthropic's Messages API", aiCalls.length === 1 && aiCalls[0].url === `${AI_BASE}/v1/messages`, aiCalls.map((c) => c.url));
  const req = aiCalls[0]?.body as { model: string; max_tokens: number; system: string; messages: { role: string; content: string }[]; output_config: { format: { type: string; schema: { required: string[] } } } };
  check("the model is RN_AI_MODEL's, the key is the env's", req.model === "model-from-the-env" && (aiCalls[0].headers["x-api-key"] ?? aiCalls[0].headers.authorization?.replace(/^Bearer /, "")) === "sk-ant-test-fake", [req.model, aiCalls[0].headers]);
  check("structured output: JSON in the draft's shape", req.output_config?.format?.type === "json_schema" && ["title", "blocks", "fields", "notes", "to_fix"].every((k) => req.output_config.format.schema.required.includes(k)));
  const msg = req.messages?.[0]?.content ?? "";
  const kitJson = JSON.parse(msg.match(/<kit>\n([\s\S]*?)\n<\/kit>/)?.[1] ?? "{}");
  check("the kit: the template's blocks in order with their guidance", kitJson.template?.id === "fractional-sales-leader" && kitJson.template.sections.map((x: { block_id: string }) => x.block_id).join() === L.templateDef("fractional-sales-leader")!.blocks.map((b) => b.blockId).join() && kitJson.template.sections.every((x: { guidance?: string }) => !!x.guidance));
  check("the kit: the winning patterns, the rate band from the benchmarks, the company's facts", kitJson.winning_patterns?.length >= 10 && /middle half of 12 people/.test(kitJson.rate_band?.market ?? "") && kitJson.company?.name === "Acme Robotics" && kitJson.company.facts?.revenue === "$5M–$20M", [kitJson.rate_band, kitJson.company]);
  check("the kit: her profile and her voice", kitJson.me?.name === "Pat Rowan" && kitJson.me.title === "Fractional VP Sales" && kitJson.voice?.formality === "casual" && kitJson.voice.phrases?.includes("Happy to dig in"));
  check("the kit never carries the private rate file or another member's data", !/rate-index|Oona|oth\.proposals/.test(msg));
  check("the call goes in as data, after the kit", msg.indexOf("<transcript>") > msg.indexOf("</kit>") && msg.includes(UNIQUE) && /not instructions/.test(req.system));
  check("the system prompt asks for the buyer's words, one price and 30/60/90 decisions", /buyer's own words/.test(req.system) && /one price/.test(req.system) && /day 30, 60 and 90/.test(req.system));
  const dp = dr.proposal;
  check("saved as a draft in the template's structure", dp.status === "draft" && dp.templateId === "fractional-sales-leader" && dp.blocks.map((b) => b.blockId).join() === "cover,what_we_heard,milestones,investment,custom" && (await S.listProposals(PAT, BASE)).proposals.length === nP + 1, dp.blocks.map((b) => b.blockId));
  check("an unknown section is kept as a section of its own", dp.blocks[4].title === "A section of their own" && dp.blocks[4].blockId === "custom");
  check("the price stated and the key fields set, from Claude", dp.fields["pricing.monthlyFee"] === "$12,000" && dp.fields["pricing.stepDownFee"] === "$8,000" && dp.fields["client.signerName"] === "Dana Whitfield" && dp.fields["discovery.callDate"] === "November 18, 2026" && dp.sources["pricing.monthlyFee"] === "claude", dp.fields);
  const dchecks = L.checklist({ ...dp, fields: L.docFields(dp) });
  check("the checklist reads the draft: price and 30/60/90 decisions there", dchecks.find((c) => c.id === "price")?.ok === true && dchecks.find((c) => c.id === "milestones")?.ok === true, dchecks.filter((c) => !c.ok).map((c) => c.id));
  check("what it couldn't know is a blank to fill, so it can't be sent yet", L.blanksOf(dp.blocks, L.docFields(dp)).includes("start.date"));
  check("budget signals stay private notes, the things to check come back", dp.notes.some((n) => n.key === "budget.signals" && /15k/.test(n.text)) && !JSON.stringify(dp.blocks).includes("15k") && dr.toFix.length === 2 && dp.notes.some((n) => n.key === "check"));
  check("the person who signs was on the call", dp.signerOnCall === true);
  const st1 = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the transcript is never stored: not in the state, only the draft", !st1.includes(UNIQUE) && !st1.includes("Let's meet Thursday to go through it") && st1.includes("Sales system build for Acme Robotics"));
  check("she agreed once, and it's remembered", (await S.listProposals(PAT, BASE)).aiAgreed === true);
  await D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE);
  check("after agreeing once, the next draft needs no box", aiCalls.length === 2);
  aiAnswer = () => reply("Here is your proposal, in prose rather than JSON.");
  const nBad = (await S.listProposals(PAT, BASE)).proposals.length;
  check("an answer that isn't the draft's JSON is refused, and nothing is saved", (await refused(D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE)))?.includes("form Merlin can read") && (await S.listProposals(PAT, BASE)).proposals.length === nBad);
  aiAnswer = () => reply(JSON.stringify({ ...draftJson, blocks: [] }));
  check("a draft with no sections is refused", (await refused(D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE)))?.includes("form Merlin can read"));
  aiAnswer = () => reply("", "refusal");
  check("a refusal says so and offers the other ways", (await refused(D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE)))?.includes("didn't draft this one"));
  aiAnswer = () => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
  check("a refused key: set up wrong, said plainly", (await refused(D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE)))?.includes("isn't set up right"));
  aiAnswer = () => reply(JSON.stringify(draftJson));
  const st2 = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("failed drafts left no transcript behind either", !st2.includes(UNIQUE));
  // The page's own reader, switch off: what it found is sent, never the transcript (the app's path, as ProposalStart.tsx runs it).
  setEnv(false);
  const exOff = X.extract(TRANSCRIPT, "Pat Rowan");
  let offFields: Record<string, string> = {};
  let offNotes: import("../lib/proposals/types").DiscoveryNote[] = [];
  for (const sg of exOff.suggestions.filter((x) => x.buyer).slice(0, 8)) ({ fields: offFields, notes: offNotes } = L.acceptInto(offFields, offNotes, sg.key, sg.text, iso(0)));
  const offP = await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyId: ACME, fields: offFields, notes: offNotes, signerOnCall: exOff.signerOnCall, source: "discovery" }, BASE);
  check("switch off: Draft fills the template from what the reader found, as a draft", offP.blocks.length === L.templateDef("fractional-sales-leader")!.blocks.length && Object.values(offP.sources).includes("discovery") && offP.notes.length > 0, offP.sources);
  check("switch off: nothing went to Anthropic", aiCalls.length === 6);
  setEnv(true);

  /* ---------- the AI budget (lib/proposals/aiUsage.ts) ---------- */
  console.log("\nthe AI budget");
  const AU = await import("../lib/proposals/aiUsage");
  const usage0 = (await T.loadState()).aiUsage?.mem_pat;
  // 10 tokens in at $4 a million and 10 out at $20 a million: 40 + 200 micro-dollars a call.
  check("metered from the API's usage, in micro-dollars: the 2 drafts saved, 240 each", AU.microsOf(10, 10) === 240 && usage0?.trialMicros === 480 && usage0.log.length === 2 && usage0.log.every((l) => l.inTok === 10 && l.outTok === 10 && l.micros === 240 && Object.keys(l).sort().join() === "at,inTok,micros,outTok"), usage0);
  check("a failure or a refusal costs nothing: the 4 that failed aren't charged or logged", usage0?.log.length === 2 && usage0.usedMicros === 0);
  const b0 = AU.budgetOf(await T.loadState(), "mem_pat");
  check("an active trial has $3 in total", b0.trial && b0.budget === 3_000_000 && AU.TRIAL_BUDGET_MICROS === 3_000_000 && AU.MONTH_BUDGET_MICROS === 10_000_000 && AU.PACK_MICROS === 4_700_000);
  await T.tableInternals.mutate((st) => void (st.aiUsage!.mem_pat.trialMicros = 2_999_999));
  // A long call: 50,000 tokens in and 10,000 out, $0.40.
  const big = { input_tokens: 50_000, output_tokens: 10_000 };
  aiAnswer = () => reply(JSON.stringify(draftJson), "end_turn", big);
  const callsB = aiCalls.length;
  await D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE);
  const u1 = (await T.loadState()).aiUsage!.mem_pat;
  check("allowed just under 100%, and the call may take it past", aiCalls.length === callsB + 1 && u1.trialMicros === 2_999_999 + 400_000, u1.trialMicros);
  const over = await D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE).then(() => null, (e: InstanceType<typeof S.ProposalProblem>) => e);
  check("refused at 100%, with the pack and Build it in Claude, and Claude isn't called", over?.status === 402 && over.message === AU.usedUpWords(Date.now(), true) && /usage pack/.test(over.message) && /build it in your own Claude with the connector, free/.test(over.message) && over.upgrade === AU.AI_PACK_LINK && aiCalls.length === callsB + 1, over?.message);
  check("the month's words name the day it resets", /^You've used this month's AI usage\. Add a \$10 usage pack to keep drafting, or build it in your own Claude with the connector, free\. It resets on December 1\.$/.test(AU.usedUpWords(Date.UTC(2026, 10, 22))));
  const lv = await S.listProposals(PAT, BASE);
  check("the page knows: the words and the pack's button, never a number", lv.aiUsedUp?.words === over?.message && lv.aiUsedUp?.button === "Add a $10 usage pack" && lv.aiUsedUp.pack === AU.AI_PACK_LINK && readFileSync("app/post/ProposalStart.tsx", "utf8").includes(`const PACK_WORDS = "${lv.aiUsedUp?.button}"`));
  // A pack: once per payment, used after the budget, never expiring.
  check("grantAiPack adds a pack", (await AU.grantAiPack("mem_pat", AU.PACK_MICROS, "pi_test_pack_1")).granted === true && (await T.loadState()).aiUsage!.mem_pat.packMicros === 4_700_000);
  check("grantAiPack is idempotent on its payment reference", (await AU.grantAiPack("mem_pat", AU.PACK_MICROS, "pi_test_pack_1")).granted === false && (await T.loadState()).aiUsage!.mem_pat.packMicros === 4_700_000 && (await T.loadState()).aiUsage!.mem_pat.packs!.length === 1);
  check("grantAiPack needs a reference", (await AU.grantAiPack("mem_pat", AU.PACK_MICROS, "").then(() => false, () => true)));
  check("with a pack, drafting opens again", !(await S.listProposals(PAT, BASE)).aiUsedUp);
  await D.draftWithClaude(PAT, { companyId: ACME, transcript: CALL }, BASE);
  const u2 = (await T.loadState()).aiUsage!.mem_pat;
  check("past the budget, the pack pays", u2.packMicros === 4_700_000 - 400_000 && u2.trialMicros === 3_399_999, [u2.packMicros, u2.trialMicros]);
  // What the member sees: a percentage, never dollars or tokens.
  const pv = await T.buildView(PAT);
  const pvJson = JSON.stringify(pv);
  check("Settings, Plan: a percentage only", pv.me?.plan?.ai?.percent === 100 && pv.me.plan.ai.trial === true && pv.me.plan.ai.onPack === true && pv.me.plan.ai.usedUp === false && Object.keys(pv.me.plan.ai).sort().join() === "canAddPack,notice,onPack,percent,resetsOn,trial,usedUp", pv.me?.plan?.ai);
  // A pack's cost ($4.70) never shows; "\b" keeps a timestamp's milliseconds (":54.705Z") from reading as it.
  check("no dollars or tokens in what the member's app reads", !/aiUsage|[Mm]icros|inTok|outTok|input_tokens|"usd"/.test(pvJson) && !/[Mm]icros|inTok|outTok|\b4\.70\b/.test(JSON.stringify(await S.listProposals(PAT, BASE))));
  check("another member sees none of it", !/aiUsage|[Mm]icros/.test(JSON.stringify(await T.buildView(OTH))) && (await T.buildView(OTH)).me?.plan?.ai?.percent === 0);
  check("the export leaves it out", !("aiUsage" in (await T.exportState())));
  // The trial's notices fired as it passed 50, 75 and 90%, once; seen, they're closed.
  check("the trial's notice: the highest passed", pv.me?.plan?.ai?.notice === 90);
  await T.perform(PAT, { type: "noticeSeen", kind: "aiUsage" }, BASE);
  check("closed once seen, and it doesn't come back", (await T.buildView(PAT)).me?.plan?.ai?.notice === null);
  // The admin's Health: the month in counts and dollars.
  const tot = AU.aiUsageTotals(await T.loadState());
  check("Health: the month's calls, tokens, cost, packs and members past 50, 90 and 100%", tot.calls === 4 && tot.inTok === 20 + 100_000 && tot.outTok === 20 + 20_000 && tot.micros === 480 + 800_000 && tot.packsSold === 1 && tot.past50 === 1 && tot.past90 === 1 && tot.past100 === 1, tot);
  // Pure: a month on Pro, its notices and its rollover, on a made-up state.
  const NOV = Date.UTC(2026, 10, 3, 12);
  const DEC = Date.UTC(2026, 11, 2, 12);
  const pst = { aiUsage: {}, billing: { members: { m1: { proUntil: new Date(Date.UTC(2027, 5, 1)).toISOString(), tier: "close" } } } } as unknown as import("../lib/table").State;
  const spend = (micros: number, at = NOV) => AU.chargeIn(pst, "m1", at, { inTok: micros / 4, outTok: 0 });
  const meter = (at = NOV) => AU.aiMeter(pst, "m1", at);
  check("Close: $10 a month, resets on the 1st, the pack offered", AU.budgetOf(pst, "m1", NOV).budget === 10_000_000 && !AU.budgetOf(pst, "m1", NOV).trial && meter().resetsOn === "2026-12-01" && meter().canAddPack === true && meter().percent === 0 && meter().notice === null);
  spend(4_000_000);
  check("under 50%: no notice", meter().percent === 40 && meter().notice === null);
  spend(1_000_000);
  check("at 50%: the notice", meter().percent === 50 && meter().notice === 50);
  AU.noticeSeenIn(pst, "m1");
  spend(1_000_000);
  check("past 50% again: it doesn't fire twice", meter().percent === 60 && meter().notice === null);
  spend(1_600_000);
  check("at 75%", meter().notice === 75);
  AU.noticeSeenIn(pst, "m1");
  spend(1_500_000);
  check("at 90%", meter().percent === 91 && meter().notice === 90);
  AU.noticeSeenIn(pst, "m1");
  spend(500_000);
  const al = (pst.aiUsage!.m1 as import("../lib/proposals/aiUsage").AiUsageRec).alerts!;
  check("each fires once a month", meter().notice === null && al.fired.join() === "50,75,90" && al.seen.join() === "50,75,90");
  check("just under 100%: allowed", AU.budgetOf(pst, "m1", NOV).open && meter().percent === 96);
  spend(1_000_000);
  check("at 100% and no pack: refused", !AU.budgetOf(pst, "m1", NOV).open && meter().usedUp && meter().percent === 100);
  (pst.aiUsage!.m1 as import("../lib/proposals/aiUsage").AiUsageRec).packMicros = 1_000_000;
  check("a pack opens it again", AU.budgetOf(pst, "m1", NOV).open && meter().onPack);
  check("the month rolls over on the 1st: 0% used, the notices start again, the pack kept", AU.budgetOf(pst, "m1", DEC).used === 0 && meter(DEC).percent === 0 && meter(DEC).notice === null && meter(DEC).resetsOn === "2027-01-01" && AU.budgetOf(pst, "m1", DEC).pack === 1_000_000);
  spend(5_000_000, DEC);
  const recD = pst.aiUsage!.m1 as import("../lib/proposals/aiUsage").AiUsageRec;
  check("December's first spend: November's used is gone, December's 50% notice fires", recD.month === "2026-12" && recD.usedMicros === 5_000_000 && recD.packMicros === 1_000_000 && meter(DEC).notice === 50);
  for (let i = 0; i < 230; i++) spend(4, DEC);
  // The one gate is canClose (lib/billing/rules.ts): plain Pro builds and previews, Close drafts with $10 a month.
  const othWas = (await T.loadState()).billing!.members.mem_oth;
  const proUntil = new Date(Date.now() + 30 * DAY).toISOString();
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_oth = { ...othWas, trialEndsAt: new Date(Date.now() - DAY).toISOString(), proUntil, tier: "pro" } as typeof othWas));
  const plainPro = await refused(D.draftWithClaude(OTH, { companyId: ACME, transcript: CALL, agree: true }, BASE));
  const ppView = await T.buildView(OTH);
  check("plain Pro: drafting with Claude is Close's, and no AI usage meter", plainPro === D.AI_PLAN && /Close/.test(D.AI_PLAN) && (await S.listProposals(OTH, BASE)).ai === "plan" && ppView.me?.plan?.name === "pro" && !ppView.me.plan.ai, plainPro);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_oth = { ...st.billing!.members.mem_oth, tier: "close" } as typeof othWas));
  const pcView = await T.buildView(OTH);
  const pcBudget = AU.budgetOf(await T.loadState(), "mem_oth");
  check("Close: $10 of Claude usage a month, the meter and the pack", (await S.listProposals(OTH, BASE)).ai === "on" && !pcBudget.trial && pcBudget.budget === 10_000_000 && pcView.me?.plan?.ai?.canAddPack === true && pcView.me.plan.ai.resetsOn !== null);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_oth = othWas));
  check("the log keeps the last 200, numbers only", recD.log.length === 200 && recD.log.every((l) => typeof l.inTok === "number" && typeof l.micros === "number"));
  aiAnswer = () => reply(JSON.stringify(draftJson));

  // The connector's kit: one call, by template id or by the name the member said.
  const kctx = { member: (await T.memberForToken(PAT))!, origin: BASE };
  const kit = await C.getProposalKit(kctx, { template: "sprint 90", company_id: ACME });
  check("get_proposal_kit: a template by the name the member said, with its sections and guidance", (kit.template as { id: string }).id === "sprint-90" && (kit.template as { sections: unknown[] }).sections.length === L.templateDef("sprint-90")!.blocks.length);
  check("get_proposal_kit: rate band, company, voice, how to write it and the shape to save it in", !!(kit.rate_band as { market?: string }).market && (kit.company as { name: string }).name === "Acme Robotics" && !!kit.voice && Array.isArray(kit.how_to_write_it) && (kit.save_it_with as { tool: string }).tool === "create_or_update_proposal");
  check("get_proposal_kit: a template that isn't there lists the ones that are", /No template called "Moonshot"[\s\S]*sprint-90/.test((await refused(C.getProposalKit(kctx, { template: "Moonshot" }))) ?? ""));
  const fkctx = { member: (await T.memberForToken(FRE))!, origin: BASE };
  check("get_proposal_kit after the trial: refused, Close, with the link", (await refused(C.getProposalKit(fkctx, { template: "sprint-90" })))?.startsWith(S.CLOSE_BUILD) === true);
  check("the kit and the server's draft read the same inputs", JSON.stringify(Object.keys(await K.proposalKit(PAT, { templateId: "sprint-90", companyId: ACME })).sort()) === JSON.stringify(Object.keys(kitJson).sort()));
  // Build it in Claude runs in the member's own Claude: free and unlimited, even with the AI usage all used.
  await T.tableInternals.mutate((st) => void Object.assign(st.aiUsage!.mem_pat, { trialMicros: 9_000_000, packMicros: 0 }));
  check("Build it in Claude isn't metered: with the AI usage all used, the kit still comes", !!(await S.listProposals(PAT, BASE)).aiUsedUp && !!(await C.getProposalKit(kctx, { template: "sprint 90", company_id: ACME })).template);

  /* ================= My templates ================= */
  console.log("\nmy templates");
  const TP = await import("../lib/proposals/templateParse");
  const MN = await import("../lib/proposals/mine");
  // A tiny .docx, made here: a zip with word/document.xml and its styles.
  const zip = (files: Record<string, string>) => {
    const locals: Buffer[] = [];
    const central: Buffer[] = [];
    let off = 0;
    for (const [name, text] of Object.entries(files)) {
      const raw = Buffer.from(text, "utf8");
      const data = deflateRawSync(raw);
      const n = Buffer.from(name);
      const crc = crc32(raw);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0), lh.writeUInt16LE(20, 4), lh.writeUInt16LE(8, 8), lh.writeUInt32LE(crc, 14), lh.writeUInt32LE(data.length, 18), lh.writeUInt32LE(raw.length, 22), lh.writeUInt16LE(n.length, 26);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0), ch.writeUInt16LE(20, 4), ch.writeUInt16LE(20, 6), ch.writeUInt16LE(8, 10), ch.writeUInt32LE(crc, 16), ch.writeUInt32LE(data.length, 20), ch.writeUInt32LE(raw.length, 24), ch.writeUInt16LE(n.length, 28), ch.writeUInt32LE(off, 42);
      locals.push(lh, n, data);
      central.push(ch, n);
      off += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0), end.writeUInt16LE(Object.keys(files).length, 8), end.writeUInt16LE(Object.keys(files).length, 10), end.writeUInt32LE(cd.length, 12), end.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, end]);
  };
  const para = (t: string, style?: string, list = false) => `<w:p>${style || list ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list ? "<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr>" : ""}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const docx = zip({
    "[Content_Types].xml": "<Types/>",
    "word/styles.xml": `<w:styles><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    "word/document.xml": `<w:document><w:body>${[
      para("Northwind Statement of Work", "Title"),
      para("Background", "Heading1"),
      para("Northwind grew fast &amp; its sales process didn't keep up."),
      para("Scope of work", "Titre1"),
      para("Weeks 1 to 2: diagnose the pipeline", undefined, true),
      para("Weeks 3 to 6: rebuild the process", undefined, true),
      para("Fees", "Heading1"),
      para("$11,000 a month, billed in advance."),
      para("Out of scope", "Heading2"),
      para("Hiring a full-time leader."),
    ].join("")}</w:body></w:document>`,
    "docProps/core.xml": "<cp:coreProperties><dc:title>Northwind SOW</dc:title></cp:coreProperties>",
  });
  const pd = await TP.parseTemplateFile("Northwind SOW.docx", docx);
  check(".docx: the document's title, each heading a section, Word's styles (any locale)", pd.title === "Northwind SOW" && pd.sections.map((x) => x.title).join("|") === "Background|Scope of work|Fees|Out of scope", pd.sections.map((x) => x.title));
  check(".docx: text with entities, list paragraphs as bullets", pd.sections[0].body === "Northwind grew fast & its sales process didn't keep up." && pd.sections[1].body === "- Weeks 1 to 2: diagnose the pipeline\n- Weeks 3 to 6: rebuild the process", pd.sections.map((x) => x.body));
  check(".docx: headings read as the library's blocks", pd.sections.map((x) => x.blockId).join() === "what_we_heard,phases_workstreams,investment,out_of_scope", pd.sections.map((x) => x.blockId));
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const tpdf = await PDFDocument.create();
  const hb = await tpdf.embedFont(StandardFonts.HelveticaBold);
  const hr = await tpdf.embedFont(StandardFonts.Helvetica);
  const pg = tpdf.addPage([612, 792]);
  let yy = 740;
  for (const [t, size, font] of [["Proposal for Larkspur", 22, hb], ["Our approach", 15, hb], ["We start with the numbers, then the team, then the process.", 10, hr], ["Investment", 15, hb], ["Nine thousand dollars a month for one day a week.", 10, hr], ["Next steps", 15, hb], ["Sign by Friday and we start Monday.", 10, hr]] as const) {
    pg.drawText(t, { x: 54, y: yy, size, font });
    yy -= size + 14;
  }
  const pp = await TP.parseTemplateFile("larkspur.pdf", Buffer.from(await tpdf.save()));
  check(".pdf: lines set larger than the body text are headings, the rest their text", pp.sections.map((x) => x.title).join("|") === "Our approach|Investment|Next steps" && /numbers, then the team/.test(pp.sections[0].body) && pp.sections.map((x) => x.blockId).join() === "recommendation,investment,next_steps", pp.sections);
  const pmd = await TP.parseTemplateFile("plan.md", Buffer.from("# Plan for Ostrava\n\n## The situation\nSales stalled at $4M.\n\n## Pricing\n* $10,000 a month\n* 3 months\n"));
  check(".md: # headings, * bullets", pmd.title === "Plan for Ostrava" && pmd.sections.map((x) => x.title).join("|") === "The situation|Pricing" && pmd.sections[1].body === "- $10,000 a month\n- 3 months", pmd.sections);
  const ptx = await TP.parseTemplateFile("sow.txt", Buffer.from("BACKGROUND\nThey need a forecast.\n\n1. Scope\nA weekly pipeline review.\n\nFees:\n$9,500 a month.\n"));
  check(".txt: capitals, numbered and colon headings", ptx.sections.map((x) => x.title).join("|") === "BACKGROUND|Scope|Fees" && ptx.sections[2].body === "$9,500 a month.", ptx.sections);
  check("a scan with no text, a wrong type and an old .doc are refused in words", (await refused(TP.parseTemplateFile("x.txt", Buffer.from("  \n "))))?.includes("couldn't find any text") && (await refused(TP.parseTemplateFile("x.rtf", Buffer.from("x"))))?.includes("Upload a .docx") && (await refused(TP.parseTemplateFile("x.doc", Buffer.from("x"))))?.includes(".docx or PDF"));
  const mt = await MN.uploadTemplate(PAT, "Northwind SOW.docx", docx);
  check("uploaded: kept as hers, the file itself not kept", /^mt_/.test(mt.id) && mt.blocks.length === 4 && !readFileSync(path.join(dir, "intel.json"), "utf8").includes("[Content_Types]"));
  const mv = await S.listProposals(PAT, BASE);
  check("her templates come first in the list, then Merlin's", mv.templates[0].id === mt.id && mv.templates[0].mine && mv.templates.filter((x) => !x.mine).length === 5);
  const fromMine = await S.createProposal(PAT, { templateId: mt.id, companyName: "Larkspur Foods" }, BASE);
  check("a proposal from her own template: its sections and her text", fromMine.blocks.map((b) => b.title).join("|") === "Background|Scope of work|Fees|Out of scope" && fromMine.blocks[2].body === "$11,000 a month, billed in advance." && fromMine.title === "Northwind SOW for Larkspur Foods", fromMine.title);
  const mkit = await K.proposalKit(PAT, { templateId: mt.id, companyName: "Larkspur Foods" });
  check("the kit for her template carries her own words, section by section", mkit.template.mine && mkit.template.sections[2].their_text === "$11,000 a month, billed in advance.");
  // Upgrading brings it all back: Fred on Close opens his saved template and builds from it.
  const fredBack = structuredClone((await T.loadState()).billing!.members.mem_fre);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_fre = { ...fredBack, proUntil: new Date(Date.now() + 30 * DAY).toISOString(), paidSince: new Date().toISOString(), tier: "close" } as typeof fredBack));
  const fv2 = await S.listProposals(FRE, BASE);
  const fredT = fv2.templates.find((t) => t.mine)!;
  check("on Close his saved template is back and open, and he builds from it", fv2.canBuild && fredT.open && (await S.createProposal(FRE, { templateId: fredT.id, companyName: "Wrenfield Dairy" }, BASE)).blocks.some((b) => /\$5,000 a month/.test(b.body)));
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_fre = fredBack));
  check("another member can't use or see it", (await refused(S.createProposal(OTH, { templateId: mt.id, companyName: "X" }, BASE)))?.includes("isn't there") && !(await S.listProposals(OTH, BASE)).templates.some((x) => x.mine));
  check("nor delete it", (await refused(MN.deleteTemplate(OTH, mt.id)))?.includes("isn't there"));
  check("not in the export", !JSON.stringify(await T.exportState()).includes("Northwind"));
  await MN.deleteTemplate(PAT, mt.id);
  check("deleted: gone from her list, the proposal made from it stays", !(await S.listProposals(PAT, BASE)).templates.some((x) => x.id === mt.id) && !!(await S.getProposal(PAT, fromMine.id, BASE)));
  setEnv(false);

  /* ================= blanks in words, the signer from the deal, the signing page's errors ================= */
  console.log("\nwords and the signer");
  check("a blank in words: the library's label, never its key", L.fieldLabel("client.signerName") === "Signer name" && L.fieldLabel("discovery.callDate") === "Discovery call date" && L.fieldLabel("start.date") === "Date" && L.fieldLabel("term.optOutDay") !== "term.optOutDay");
  check("blanks in words: the first few by name, then a count", L.blanksInWords(["headline", "client.signerName", "client.signerTitle", "discovery.callDate", "pains", "seats"]) === "Outcome headline, Signer name, Signer title, Discovery call date and 2 more", L.blanksInWords(["headline", "client.signerName", "client.signerTitle", "discovery.callDate", "pains", "seats"]));
  const blankP = await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyName: "Keyless Holdings" }, BASE);
  const blankErr = (await refused(S.sendProposal(PAT, blankP.id, { signer: { name: "Kim Key", email: "kim@keyless.example" } }, BASE))) ?? "";
  check("sending with blanks says what to fill in words, never field keys", /^Fill the \d+ blanks first: /.test(blankErr) && !/[a-z]+\.[a-zA-Z]+/.test(blankErr.replace(/^Fill the \d+ blanks first: /, "")) && /Outcome headline/.test(blankErr), blankErr);
  const ctxW = { member: (await T.memberForToken(PAT))!, origin: BASE };
  const askW = await C.sendForSignature(ctxW, { proposal_id: blankP.id, signer_name: "Kim Key", signer_email: "kim@keyless.example" });
  check("the connector says the blanks in words too (with the keys, for Claude to fill)", typeof askW.blanks_in_words === "string" && !/client\./.test(String(askW.blanks_in_words)) && Array.isArray(askW.blanks));
  // Her own deal at Acme, to someone she typed in: a new proposal there is addressed to them.
  await T.tableInternals.mutate((st) => {
    const log = ((st.pipeline ??= {}).mem_pat ??= P.emptyPipeline());
    const e = log.entries.find((x) => x.companyId === "c_acme");
    if (e) e.to = { name: "Dana Whitfield", role: "COO" }, (e.updatedAt = new Date().toISOString());
    else P.openEntry(log, { id: "pl_acme_to", companyId: "c_acme", channel: "email", to: { name: "Dana Whitfield", role: "COO" }, source: "record", via: "note", nowMs: Date.now() });
  });
  const pre = await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyId: ACME }, BASE);
  check("the signer prefilled from her deal at the company", pre.fields["client.signerName"] === "Dana Whitfield" && pre.fields["client.signerTitle"] === "COO" && pre.sources["client.signerName"] === "pipeline", pre.fields);
  check("so those blanks never appear", !L.blanksOf(pre.blocks, L.docFields(pre)).some((k) => k === "client.signerName" || k === "client.signerTitle"));
  await T.tableInternals.mutate((st) => {
    for (const e of st.pipeline!.mem_pat.entries) if (e.companyId === "c_acme") e.to = { name: "Gina From Google", google: true };
  });
  check("never a name that came from Google", !(await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyId: ACME }, BASE)).fields["client.signerName"]);
  const signSrc = readFileSync(path.join(process.cwd(), "app/sign/Sign.tsx"), "utf8") + readFileSync(path.join(process.cwd(), "app/sign/DocSign.tsx"), "utf8");
  check("the signing pages: every error shows in its own step, announced, never twice", !/\{err && <p/.test(signSrc) && (signSrc.match(/errAt === "code" \|\| errAt === "verify"/g) ?? []).length === 4 && (signSrc.match(/role="alert"/g) ?? []).length === 8 && !signSrc.includes("err && !v.codeVerified"));
  const codeForm = readFileSync(path.join(process.cwd(), "app/sign/Sign.tsx"), "utf8").match(/onSubmit=\{async \(e\) => \{\s*e.preventDefault\(\);\s*const r = await run\("verify"[\s\S]*?<\/form>/)?.[0] ?? "";
  check("a wrong code's error is inside the code form", /errAt === "verify"/.test(codeForm) && /role="alert"/.test(codeForm));

  check("nothing but the fake email and Anthropic endpoints was called", others === 0, others);
  H.setPipelineHook(null);
  console.log(`\n${passes} passed, ${failures} failed`);
  if (!failures) rmSync(dir, { recursive: true, force: true });
  else console.log(`state kept in ${dir}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
