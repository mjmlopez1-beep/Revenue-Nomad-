/**
 * Checks of getting contracts out with no manual work: a contract dropped in with its fields
 * placed (lib/documents/detect.ts, smart.ts), changing a proposal by talking with its versions
 * (lib/proposals/change.ts, numbers.ts, changeIdeas.ts), starting from the call (startCall.ts),
 * the connector's draft_proposal_from_call, change_proposal and send_document_for_signature, and
 * the Close gates and plan rows.
 *
 * No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, billing live
 * with made-up Stripe settings, email to a fake endpoint, a fake Anthropic API, fetch replaced:
 * nothing leaves the machine. The PDFs are made here with pdf-lib (lib/documents/samples.ts), the
 * .docx with a zip written here. Everyone in them is made up.
 *
 *   npx tsx scripts/test-contracts.mts      exits 1 on any failure
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

const dir = mkdtempSync(path.join(tmpdir(), "rn-contracts-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.contracts@example.com`, title, token: `tok-${id.slice(4)}-contracts` });
const members = [member("mem_jor", "Jordan Avery", "Fractional CRO"), member("mem_fre", "Fred Free", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO")];
writeFileSync(
  path.join(dir, "intel-seed.json"),
  JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [{ id: "c_cedar", fields: { name: "Cedar and Pine Software", website: "cedarpine.example", industry: "Software", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } }], engagements: [], contacts: [] }),
);
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Principal", onboarded: true }, mem_fre: { function: "Sales", onboarded: true }, mem_oth: { function: "Marketing", onboarded: true } },
    billing: { members: { mem_jor: trial, mem_oth: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-contracts",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_contracts",
  STRIPE_WEBHOOK_SECRET: "whsec_test_contracts",
  STRIPE_PRICE_MONTH: "price_month_contracts",
  STRIPE_PRICE_YEAR: "price_year_contracts",
  RESEND_API_KEY: "test-key-contracts",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_AI_TEST_BASE_URL"]) delete process.env[k];

const mails: { to: string; subject: string; text: string }[] = [];
const AI_BASE = "http://127.0.0.1:7051/fake-anthropic";
const aiCalls: { body: { model: string; system: string; messages: { content: string }[] } }[] = [];
let aiAnswer: () => unknown = () => ({});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(AI_BASE)) {
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    aiCalls.push({ body: JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer)) });
    return new Response(JSON.stringify(aiAnswer()), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text });
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

/** A .docx made here: a stored zip with one word/document.xml. */
function docx(paragraphs: string[]): Uint8Array {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const data = deflateRawSync(Buffer.from(xml));
  const name = Buffer.from("word/document.xml");
  const crc = crc32(Buffer.from(xml)) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0), local.writeUInt16LE(20, 4), local.writeUInt16LE(8, 8), local.writeUInt32LE(crc, 14), local.writeUInt32LE(data.length, 18), local.writeUInt32LE(xml.length, 22), local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0), central.writeUInt16LE(20, 4), central.writeUInt16LE(20, 6), central.writeUInt16LE(8, 10), central.writeUInt32LE(crc, 16), central.writeUInt32LE(data.length, 20), central.writeUInt32LE(xml.length, 24), central.writeUInt16LE(name.length, 28), central.writeUInt32LE(0, 42);
  const cdStart = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0), end.writeUInt16LE(1, 8), end.writeUInt16LE(1, 10), end.writeUInt32LE(central.length + name.length, 12), end.writeUInt32LE(cdStart, 16);
  return new Uint8Array(Buffer.concat([local, name, data, central, name, end]));
}

async function main() {
  const T = await import("../lib/table");
  const D = await import("../lib/documents/detect");
  const SM = await import("../lib/documents/smart");
  const SA = await import("../lib/documents/samples");
  const DS = await import("../lib/documents/store");
  const PS = await import("../lib/proposals/store");
  const CH = await import("../lib/proposals/change");
  const NU = await import("../lib/proposals/numbers");
  const ID = await import("../lib/proposals/changeIdeas");
  const SC = await import("../lib/proposals/startCall");
  const C = await import("../lib/mcp/proposals");
  const CP = await import("../lib/billing/compare");
  const BASE = "https://post.example.com";
  const JOR = "tok-jor-contracts";
  const FRE = "tok-fre-contracts";
  const OTH = "tok-oth-contracts";
  const me = { name: "Jordan Avery", email: "jor.contracts@example.com", title: "Principal" };

  /* ---------- 1. field detection on made-up PDFs ---------- */
  const read = async (l: Parameters<typeof SA.makeSamplePdf>[0]) => {
    const pages = await D.readPdfText(await SA.makeSamplePdf(l));
    return { pages, parties: D.findParties(pages) };
  };
  const two = await read("two-column");
  check("two-column: two parties side by side, named by their headings", two.parties.length === 2 && two.parties[0].org === "Cedar and Pine Software" && two.parties[1].org === "Jordan Avery Advisory LLC" && two.parties[0].rows[0].x < 0.5 && two.parties[1].rows[0].x > 0.5, two.parties.map((p) => p.org));
  check("  each with By, Name, Title and Date on page 2", two.parties.every((p) => p.rows.map((r) => r.kind).join() === "signature,name,title,date" && p.rows.every((r) => r.page === 1)), two.parties.map((p) => p.rows.map((r) => r.kind)));
  const r0 = two.parties[0].rows;
  check("  fields sit on their lines, in order down the page, inside the page", r0.every((r, i) => r.x >= 0 && r.x + r.w <= 1 && r.y >= 0 && r.y + r.h <= 1 && (i === 0 || r.y > r0[i - 1].y)) && r0[0].h > r0[1].h, r0);
  check("  side by side, the left block's fields stop before the right block starts", r0.every((r) => r.x + r.w <= two.parties[1].rows[0].x), [r0.map((r) => r.x + r.w), two.parties[1].rows[0].x]);
  const stacked = await read("stacked");
  check("stacked: one block above the other, by a label coming round again", stacked.parties.length === 2 && stacked.parties[0].rows[0].y < stacked.parties[1].rows[0].y && stacked.parties[0].rows[0].x === stacked.parties[1].rows[0].x, stacked.parties.map((p) => [p.org, p.rows[0].y]));
  check("  a heading in capitals reads as a name; Signature, Print name, Its and Date are found", stacked.parties[0].org === "Cedar and Pine Software" && stacked.parties[1].rows.map((r) => r.label).join() === "Signature,Print name,Its,Date", stacked.parties.map((p) => [p.org, p.rows.map((r) => r.label)]));
  check("  a name printed after its label is who signs, and gets no field", stacked.parties[0].name === "Dana Whitfield" && stacked.parties[0].rows.find((r) => r.kind === "name")?.value === "Dana Whitfield");
  const roles = await read("roles");
  check('roles: "Client" and "Consultant" named from the contract\'s own definitions', roles.parties.length === 2 && roles.parties[0].role === "Client" && roles.parties[0].org === "Cedar and Pine Software, Inc." && roles.parties[1].role === "Consultant" && roles.parties[1].org === "Jordan Avery Advisory LLC", roles.parties.map((p) => [p.role, p.org]));
  check("  a label under its rule: the field goes on the rule above it", roles.parties[0].rows.every((r) => r.w >= 0.2) && roles.parties[0].rows[1].y - roles.parties[0].rows[0].y > 0.04, roles.parties[0].rows);
  const none = await read("none");
  check("no signature block: nothing found", none.parties.length === 0);
  check("labels: a sentence that starts with Date or By isn't a line to sign on", D.labelOf("Date of this Agreement is the date the last party signs it, as set out in section 4.") === null && D.labelOf("By and between the parties") === null && D.labelOf("By: ________")?.kind === "signature" && D.labelOf("Its:")?.kind === "title" && D.labelOf("Print name: Dana Whitfield")?.label === "Print name");

  /* ---------- 2. who signs, in order ---------- */
  const ctx = (company: Parameters<typeof SM.planFrom>[2]["company"] = null, fileName = SA.SAMPLE_NAME["two-column"]) => ({ me, voice: null, fileName, company, sizes: [] });
  const withRecord = SM.planFrom(two.parties, two.pages, ctx({ id: "co_x", name: "Cedar and Pine Software", maker: { name: "Dana Whitfield", title: "CEO", email: "dana@cedarpine.example" } }));
  check("the other party signs first, the member countersigns last", withRecord.signers.length === 2 && !withRecord.signers[0].me && withRecord.signers[1].me && withRecord.signers[1].name === "Jordan Avery" && withRecord.signers[1].found === "Countersign after Dana", withRecord.signers);
  check("  the member's own party is the block with their name in it", withRecord.signers[1].party === "Jordan Avery Advisory");
  check("  the other signer from the contract's notices and the Merlin record, with their title and email", withRecord.signers[0].name === "Dana Whitfield" && withRecord.signers[0].title === "CEO" && withRecord.signers[0].email === "dana@cedarpine.example" && withRecord.signers[0].found === "Found on page 2 and in your Merlin record", withRecord.signers[0]);
  check('  8 fields placed, a title prefilled for each to check, with its one line', withRecord.count === 8 && withRecord.fields.filter((f) => f.kind === "text" && f.label === "Title").map((f) => f.prefill).join() === "CEO,Principal" && withRecord.summary === 'A signature, name, title and date for each of you, next to "By", "Name", "Title" and "Date" on page 2. Names and titles are filled in for Dana to check.', [withRecord.count, withRecord.summary]);
  check("  the title from the file name and the parties", withRecord.title === "Cedar and Pine · Statement of Work", withRecord.title);
  check("  the message is short, in plain words, to the signer", withRecord.message === "Hi Dana, here's the statement of work we discussed. Happy to walk through anything before you sign.", withRecord.message);
  const voiced = SM.contractMessage({ greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: false, exclamations: "never", emoji: false, opener: "direct", phrases: [] }, "Dana Whitfield", "consulting agreement", "Jordan Avery");
  check("  in the member's saved voice when there is one", voiced === "Hey Dana, here is the consulting agreement we discussed. Happy to walk through anything before you sign. Cheers, Jordan", voiced);
  check("  no exclamation marks or stock AI phrases", !/[!]|delve|I hope this (email|message) finds you/i.test(withRecord.message + voiced));
  const fromRecordOnly = SM.planFrom(roles.parties, roles.pages, ctx({ id: "co_x", name: "Cedar and Pine Software, Inc.", maker: { name: "Dana Whitfield", title: "CEO", email: "dana@cedarpine.example" } }, SA.SAMPLE_NAME.roles));
  check("roles layout: the Consultant side is the member's; the client's signer is the company's decision maker on Merlin", fromRecordOnly.signers[0].name === "Dana Whitfield" && fromRecordOnly.signers[1].me && /in your Merlin record/.test(fromRecordOnly.signers[0].found) && fromRecordOnly.title === "Cedar and Pine · Master Services Agreement", fromRecordOnly.signers);
  const st = SM.planFrom(stacked.parties, stacked.pages, ctx(null, SA.SAMPLE_NAME.stacked));
  check("stacked: the printed name is the signer, found on its page; their email left for the member to type", st.signers[0].name === "Dana Whitfield" && st.signers[0].email === "" && st.signers[0].found === "Found on page 2" && st.count === 7, st.signers[0]);
  const nobody = SM.planFrom(roles.parties, roles.pages, ctx(null, SA.SAMPLE_NAME.roles));
  check("nobody named anywhere: blank for the member, said plainly", nobody.signers[0].name === "" && /Type who signs for Cedar and Pine Software/.test(nobody.signers[0].found), nobody.signers[0]);
  check("no signature block: found is false (the app opens the field placer with its line)", !SM.planFrom(none.parties, none.pages, ctx()).found && SM.NOTHING_FOUND.startsWith("Merlin couldn't find signature lines"));

  /* ---------- 3. the server: read, save what was kept, send ---------- */
  const up = await DS.uploadDocument(JOR, SA.SAMPLE_NAME["two-column"], await SA.makeSamplePdf("two-column"), BASE);
  const got = await SM.readContract(JOR, up.id, BASE);
  check("readContract: found, signers in order, nothing saved yet", got.reading.found && got.reading.signers.length === 2 && (await DS.getDocument(JOR, up.id, BASE)).fields.length === 0, got.reading.signers);
  const saved = await DS.updateDocument(
    JOR,
    up.id,
    { title: got.reading.title, message: got.reading.message, ordered: true, signers: got.reading.signers.map((x) => ({ id: x.key, name: x.name, email: x.email || "dana@cedarpine.example", title: x.title || "CEO" })), fields: got.reading.fields.map((f) => (f.prefill === undefined && f.label === "Title" ? { ...f, prefill: "CEO" } : f)) },
    BASE,
  );
  check("the kept plan saves through the ordinary update: every field keeps its signer", saved.fields.length === 8 && saved.signers.length === 2 && saved.fields.every((f) => saved.signers.some((x) => x.id === f.signer)) && saved.signers[1].sender, saved.fields.length);
  check("  a title field keeps what it was filled in with", saved.fields.filter((f) => f.label === "Title").every((f) => !!f.prefill), saved.fields.filter((f) => f.label === "Title"));
  const sent = await DS.sendDocument(JOR, up.id, { message: got.reading.message }, BASE);
  check("sent: only the first signer's link goes out, with the note", sent.document.status === "sent" && mails.filter((m) => m.to === "dana@cedarpine.example").length === 1 && !mails.some((m) => m.to === me.email), mails.map((m) => m.to));
  const link = mails.find((m) => m.to === "dana@cedarpine.example")?.text.match(/\/sign\/(ds_[^\s"<]+)/)?.[1] ?? "";
  const sv = await DS.docSignerView(link, { ip: "203.0.113.9", ua: "Mozilla/5.0 (made-up signer browser)" }, BASE);
  check("  the signer's own fields come with their title filled in to check", sv.fields.length === 4 && sv.fields.some((f) => f.kind === "text" && f.prefill), sv.fields);
  check("read: the plan gate (Free and Pro see the upgrade)", /403 Merlin placing the fields for you is on Close/.test((await refused(SM.readContract(FRE, (await DS.uploadDocument(FRE, "x.pdf", await SA.makeSamplePdf("stacked"), BASE)).id, BASE))) ?? ""));
  check("read: another member's document isn't theirs", /404/.test((await refused(SM.readContract(OTH, up.id, BASE))) ?? ""));
  const blank = await DS.uploadDocument(JOR, SA.SAMPLE_NAME.none, await SA.makeSamplePdf("none"), BASE);
  check("read: a contract with no signature lines says so, nothing placed", !(await SM.readContract(JOR, blank.id, BASE)).reading.found);

  /* ---------- 4. numbers ---------- */
  const okCheck = NU.checkNumbers([
    { title: "Investment", text: "Phase 1, Assessment: 45 days, $24,000 fixed.\nPhase 2, Fractional CRO (optional): 6 months at $11,000 a month." },
    { title: "Term and billing", text: "Phase 2 starts only if they opt in by day 45. The Phase 2 term is 6 months." },
    { title: "Next steps", text: "We decide together at day 45 whether to continue." },
  ]);
  check("numbers: the total worked out, the term and the opt-in day agree", okCheck.ok && okCheck.line.startsWith("Checked: $24,000 + 6 months × $11,000 = $90,000.") && /match in all/.test(okCheck.line), okCheck);
  const bad = NU.checkNumbers([
    { title: "Investment", text: "$11,000 a month for 6 months, $70,000 in total." },
    { title: "Term", text: "Opt in by day 45." },
    { title: "Next steps", text: "Decide at day 40." },
  ]);
  check("numbers: a total that doesn't add up and two opt-in days are caught", !bad.ok && bad.problems.some((p) => /\$70,000 in total, but 6 months × \$11,000 = \$66,000/.test(p)) && bad.problems.some((p) => /day 45 and day 40/.test(p)), bad);

  /* ---------- 5. change it: no key, then a fake key ---------- */
  const pr = await PS.createProposal(JOR, { templateId: "fractional-sales-leader", companyName: "Cedar and Pine Software", fields: { "pricing.monthlyFee": "$12,500", "term.initialMonths": "6" }, notes: [{ key: "timeline", text: "We want someone in by December.", at: iso(0) }] }, BASE);
  check("without the key: the view says off, and asking is refused in plain words (409), nothing changes", (await PS.listProposals(JOR, BASE)).ai === "off" && (await refused(CH.proposeChange(JOR, pr.id, { instruction: "Make it two phases" }, BASE))) === `409 ${CH.CHANGE_OFF}` && (await PS.getProposal(JOR, pr.id, BASE)).version === 1);
  const noKeyTool = await C.changeProposalTool({ member: (await T.memberForToken(JOR))!, origin: BASE }, { proposal_id: pr.id, instruction: "Make it two phases" });
  check("  the connector says so too, and hands back the sections to rewrite (not an error)", noKeyTool.changed === false && Array.isArray(noKeyTool.sections) && String(noKeyTool.message).startsWith(CH.CHANGE_OFF), noKeyTool);
  const ideas = ID.changeIdeas(pr, ID.usualTerms([{ fields: { "term.noticeDays": "30", "payment.terms": "half on signing, half at the end of the assessment, then monthly net 15" }, updatedAt: iso(-DAY) }]));
  check("ideas: up to three, from the proposal, the call and the member's usual terms", ideas.length === 3 && ideas.some((x) => x.label === "Use the start date from the call" && x.instruction.includes("December")) && ideas.some((x) => x.label === "Match my usual payment terms" && x.instruction.includes("half on signing")), ideas.map((x) => x.label));
  check("  an assessment idea where the proposal has none", ID.changeIdeas({ blocks: [{ id: "b1", blockId: "custom", title: "Scope", body: "Run the revenue team." }], fields: { "pricing.monthlyFee": "$12,500" }, notes: [] }).some((x) => x.label === "Add a 30-day assessment up front"));

  Object.assign(process.env, { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-ant-test-fake", RN_AI_MODEL: "model-from-the-env", RN_AI_TEST_BASE_URL: AI_BASE });
  const scope = pr.blocks.find((b) => b.blockId === "recommendation") ?? pr.blocks[2];
  const inv = pr.blocks.find((b) => b.blockId === "investment") ?? pr.blocks[3];
  const answer = {
    changes: [
      { section_id: scope.id, title: "Scope in two phases", body: "Phase 1, Assessment (45 days): pipeline and forecast review, and a 90-day plan.\nPhase 2, Fractional CRO (opt in at day 45): run the revenue team two days a week.", summary: "is now two phases: a 45-day assessment, then the CRO role." },
      { section_id: inv.id, title: "Investment", body: "Phase 1: $24,000 fixed.\nPhase 2 (optional): 6 months at {{pricing.monthlyFee}} a month, if they opt in by day 45.", summary: "shows $24,000 fixed for Phase 1 and $11,000 a month for Phase 2." },
    ],
    fields: [{ key: "pricing.monthlyFee", value: "$11,000" }],
    unclear: "",
  };
  aiAnswer = () => ({ id: "msg_fake", type: "message", role: "assistant", model: "model-from-the-env", content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 500 } });
  check("with the key: the member agrees first (428 with the words)", (await refused(CH.proposeChange(JOR, pr.id, { instruction: "Make it two phases" }, BASE))) === `428 ${CH.CHANGE_CONSENT}` && aiCalls.length === 0);
  const usedBefore = (await T.loadState()).aiUsage?.mem_jor?.trialMicros ?? 0;
  const ch = await CH.proposeChange(JOR, pr.id, { instruction: "Make it two phases. Phase 1 a 45-day assessment at $24k fixed, Phase 2 the fractional CRO at $11k a month, only if they opt in.", agree: true }, BASE);
  check("one request: the model from the env, the proposal's sections and the instruction, no transcript", aiCalls.length === 1 && aiCalls[0].body.model === "model-from-the-env" && aiCalls[0].body.messages[0].content.includes(scope.id) && aiCalls[0].body.messages[0].content.includes("<instruction>") && !/transcript/i.test(aiCalls[0].body.messages[0].content), aiCalls[0]?.body.model);
  check("  only the sections that change, a line each, the numbers checked", ch.changes.length === 2 && ch.changes[0].summary.startsWith("is now two phases") && ch.check.ok && ch.check.line.startsWith("Checked: $24,000 + 6 months × $11,000 = $90,000."), ch);
  check("  nothing saved until it's accepted; the use counted against the AI allowance", (await PS.getProposal(JOR, pr.id, BASE)).version === 1 && ((await T.loadState()).aiUsage?.mem_jor?.trialMicros ?? 0) > usedBefore);
  const acc = await CH.acceptChange(JOR, pr.id, { changes: ch.changes, fields: ch.fields, instruction: ch.instruction }, BASE);
  check("accept: a new version, the one before kept", acc.saved.version === 2 && acc.saved.previous === 1 && acc.proposal.version === 2 && acc.proposal.versions?.[0]?.version === 1 && acc.proposal.fields["pricing.monthlyFee"] === "$11,000" && acc.proposal.blocks.some((b) => b.title === "Scope in two phases"), acc.saved);
  const vs = await CH.versionsOf(JOR, pr.id, BASE);
  check("  version 1's text is kept to compare, with what the next one changed", vs.versions[0].blocks.some((b) => b.id === scope.id && b.body === scope.body) && vs.versions[0].fields["pricing.monthlyFee"] === "$12,500" && /Scope in two phases is now two phases/.test(vs.versions[0].note), vs.versions[0].note);
  const back = await CH.restoreVersion(JOR, pr.id, 1, BASE);
  check("restore: version 1's text comes back as version 3, and version 2 is kept too", back.version === 3 && back.blocks.find((b) => b.id === scope.id)?.body === scope.body && back.fields["pricing.monthlyFee"] === "$12,500" && back.versions?.map((v) => v.version).join() === "2,1", [back.version, back.versions]);
  check("  a version that isn't kept is refused", /404/.test((await refused(CH.restoreVersion(JOR, pr.id, 9, BASE))) ?? ""));
  check("  another member can't see or change it", /404/.test((await refused(CH.versionsOf(OTH, pr.id, BASE))) ?? "") && /404/.test((await refused(CH.acceptChange(OTH, pr.id, { changes: ch.changes }, BASE))) ?? ""));
  check("change it: the plan gate", (await refused(CH.proposeChange(FRE, pr.id, { instruction: "Two phases" }, BASE)))?.startsWith("403 Changing a proposal by asking is on Close") === true);
  aiAnswer = () => ({ id: "msg_fake", type: "message", role: "assistant", model: "m", content: [{ type: "text", text: JSON.stringify({ changes: [], fields: [], unclear: "There's no Phase 3 in this proposal to remove." }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 5, output_tokens: 5 } });
  const unclear = await CH.proposeChange(JOR, pr.id, { instruction: "Remove phase 3" }, BASE);
  check("an instruction that can't be done: no changes, the reason in a sentence", unclear.changes.length === 0 && unclear.unclear === "There's no Phase 3 in this proposal to remove.");

  /* ---------- 6. the connector ---------- */
  const jctx = { member: (await T.memberForToken(JOR))!, origin: BASE };
  const fctx = { member: (await T.memberForToken(FRE))!, origin: BASE };
  const own = await C.changeProposalTool(jctx, { proposal_id: pr.id, sections: [{ section_id: inv.id, title: "Investment", body: "Phase 1: $24,000 fixed.\nPhase 2: 6 months at $11,000 a month, $90,000 in total.", summary: "is two phases." }] });
  check("change_proposal with sections the client wrote: checked, not saved without apply", own.changed === true && own.applied === false && own.numbers_ok === true && (await PS.getProposal(JOR, pr.id, BASE)).version === 3, own);
  const ownApplied = await C.changeProposalTool(jctx, { proposal_id: pr.id, sections: [{ section_id: inv.id, title: "Investment", body: "Phase 1: $24,000 fixed.\nPhase 2: 6 months at $11,000 a month, $90,000 in total.", summary: "is two phases." }], apply: true });
  check("  with apply: true, saved as a new version, the one before kept", ownApplied.applied === true && ownApplied.version === 4 && ownApplied.previous_version_kept === 3, ownApplied);
  const wrong = await C.changeProposalTool(jctx, { proposal_id: pr.id, sections: [{ section_id: inv.id, body: "6 months at $11,000 a month, $50,000 in total." }] });
  check("  numbers that don't agree are said, before anything is saved", wrong.numbers_ok === false && /\$50,000 in total/.test(String(wrong.numbers_checked)), wrong);
  check("  the plan gate", /Close/.test((await refused(C.changeProposalTool(fctx, { proposal_id: pr.id, sections: [{ body: "x" }] }))) ?? ""));

  const transcript = [
    "Dana Whitfield: Thanks for making time. I'm the CEO here at Cedar and Pine.",
    "Jordan Avery: Happy to. Tell me where the team is.",
    "Dana Whitfield: Our win rates fell from 31% to 22% over four quarters while the team doubled. Honestly the forecast is a guess every month.",
    "Dana Whitfield: We want to get back to 30% win rates by the end of next year.",
    "Jordan Avery: What I'd suggest is a 45-day assessment at $24k fixed, then the fractional CRO role at $11k a month if you opt in.",
    "Dana Whitfield: That works. Around two days a week sounds right. I can approve this myself.",
  ].join("\n");
  const fromCall = await C.draftFromCall(jctx, { transcript, template: "fractional sales leader", company_name: "Cedar and Pine Software", signer: { name: "Dana Whitfield", email: "dana@cedarpine.example", title: "CEO" } });
  check("draft_proposal_from_call: a draft saved from the transcript, in the template named", fromCall.saved === true && typeof fromCall.proposal_id === "string" && fromCall.template_id === "fractional-sales-leader", fromCall.template_id);
  const fc = await PS.getProposal(JOR, String(fromCall.proposal_id), BASE);
  check("  what was agreed fills the fields; the signer is set", fc.fields["pricing.monthlyFee"] === "$11,000" && fc.fields["pricing.fixedFee"] === "$24,000" && fc.fields["pricing.allocation"] === "2 days a week" && fc.signer?.email === "dana@cedarpine.example", [fc.fields["pricing.monthlyFee"], fc.fields["pricing.fixedFee"], fc.fields["pricing.allocation"]]);
  check("  the loose words are a thing to check, the blanks labelled, the sources said", (fromCall.things_to_check as string[]).some((x) => /around two days a week/.test(x)) && (fromCall.blanks_to_settle as { label: string }[]).every((b) => !!b.label) && (fromCall.sources as { the_call: unknown[] }).the_call.length > 0, fromCall.things_to_check);
  check("  the transcript is never kept: not in the state, only the lines found", fromCall.transcript_kept === false && !JSON.stringify(await T.loadState()).includes("Thanks for making time"));
  check("  a Granola note id without the Granola connection is refused in words", /pass its text as transcript/.test((await refused(C.draftFromCall(jctx, { granola_note_id: "not_123" }))) ?? ""));
  C.setGranolaTranscript(async (memberId, noteId) => (memberId === "mem_jor" && noteId === "not_123" ? { transcript, attendees: [{ name: "Dana Whitfield", email: "dana@cedarpine.example" }] } : null));
  const viaGranola = await C.draftFromCall(jctx, { granola_note_id: "not_123", company_name: "Cedar and Pine Software" });
  check("  with the Granola connection set, the note id is read through it, its attendee the signer", viaGranola.saved === true && (await PS.getProposal(JOR, String(viaGranola.proposal_id), BASE)).signer?.email === "dana@cedarpine.example");
  C.setGranolaTranscript(null);
  check("  the plan gate", /Close/.test((await refused(C.draftFromCall(fctx, { transcript }))) ?? ""));

  const up2 = await DS.uploadDocument(JOR, SA.SAMPLE_NAME.stacked, await SA.makeSamplePdf("stacked"), BASE);
  const r2 = (await SM.readContract(JOR, up2.id, BASE)).reading;
  await DS.updateDocument(JOR, up2.id, { ordered: true, signers: r2.signers.map((x) => ({ id: x.key, name: x.name, email: x.email || "dana@cedarpine.example" })), fields: r2.fields }, BASE);
  const mailsBefore = mails.length;
  const ask = await C.sendDocumentTool(jctx, { document_id: up2.id });
  check("send_document_for_signature without confirm: nothing sent, who signs in order", ask.confirmed === false && mails.length === mailsBefore && (ask.would_send as { signers_in_order: { name: string }[] }).signers_in_order.map((x) => x.name).join() === "Dana Whitfield,Jordan Avery" && (await DS.getDocument(JOR, up2.id, BASE)).status === "draft", ask);
  const list = await C.sendDocumentTool(jctx, {});
  check("  without an id: the member's contracts", (list.documents as { document_id: string }[]).some((d) => d.document_id === up2.id));
  const yes = await C.sendDocumentTool(jctx, { document_id: up2.id, confirm: true });
  check("  with confirm: true, sent", yes.confirmed === true && (await DS.getDocument(JOR, up2.id, BASE)).status === "sent" && mails.length === mailsBefore + 1, yes);
  check("  the plan gate", /Close/.test((await refused(C.sendDocumentTool(fctx, { document_id: (await DS.uploadDocument(FRE, "y.pdf", await SA.makeSamplePdf("two-column"), BASE)).id, confirm: true }))) ?? ""));

  /* ---------- 7. start from the call ---------- */
  const terms = SC.readTerms("We agreed on $11k a month for a 6-month term with 30 days notice. Around two days a week. We start on December 1.");
  check("readTerms: the fee, term, notice, days a week and start date; a hedge to check", terms.fields["pricing.monthlyFee"] === "$11,000" && terms.fields["term.initialMonths"] === "6" && terms.fields["term.noticeDays"] === "30" && terms.fields["pricing.allocation"] === "2 days a week" && terms.fields["start.date"] === "December 1" && terms.checks.length === 1, terms);
  check("  nothing guessed from a call that settled nothing", Object.keys(SC.readTerms("We talked about the team and the forecast.").fields).length === 0);
  const tpls = [
    { id: "mt_x", title: "Assessment, then opt-in", about: "assessment.docx", mine: true, open: true, sections: 6 },
    { id: "ongoing-retainer", title: "Ongoing retainer", about: "A monthly retainer", mine: false, open: true, sections: 7 },
  ];
  check("bestTemplate: an assessment asked for fits the assessment template", SC.bestTemplate(tpls, "Let's do an assessment first, then you opt in.").id === "mt_x" && SC.bestTemplate(tpls, "A monthly retainer, two days a week.").id === "ongoing-retainer");
  const dx = await SC.docxText(docx(["Dana Whitfield: We want a 45-day assessment.", "Jordan Avery: Sounds good & clear."]), async (b) => new Uint8Array(inflateRawSync(b)));
  check("docxText: a .docx transcript's paragraphs, read without the server", dx === "Dana Whitfield: We want a 45-day assessment.\nJordan Avery: Sounds good & clear.", dx);

  /* ---------- 8. plan rows ---------- */
  const rowsOf = (w: string) => CP.PLAN_ROWS.find((r) => r[0] === w);
  check("plan rows: the three Close features, trial only on Free and Pro", ["Drop in a contract, fields placed for you", "Change it by talking", "Start from the call"].every((w) => rowsOf(w)?.[1] === "In your trial only" && rowsOf(w)?.[2] === "In your trial only" && !!rowsOf(w)?.[3] && !rowsOf(w)![3].endsWith(".")) && CP.CLOSE_ADDS.some(([w]) => w === "Change it by talking"));
  check("  the landing page keeps its six rows", CP.LANDING_ROWS.length === 6 && !CP.LANDING_ROWS.some((r) => r[0] === "Start from the call") && CP.LANDING_ROWS.some((r) => r[0] === "Open roles"));

  /* ---------- 9. Merlin's own AI features never name Claude or Anthropic; the Privacy page does ---------- */
  const { readFileSync } = await import("node:fs");
  const DR = await import("../lib/proposals/draft");
  const R = await import("../lib/billing/rules");
  const AIW = /Claude|Anthropic/;
  const strings = [DR.AI_OFF, DR.AI_PLAN, DR.AI_CONSENT, DR.AI_BUSY, CH.CHANGE_OFF, CH.CHANGE_PLAN, CH.CHANGE_CONSENT, CH.CHANGE_BUSY, SM.SMART_PLAN, SM.NOTHING_FOUND, R.CLOSE_AI_LINE, ...CP.PRO_LEAVES_OUT];
  check("Merlin's AI wording names neither Claude nor Anthropic", strings.every((x) => !AIW.test(x)), strings.filter((x) => AIW.test(x)));
  const aiRows = CP.PLAN_ROWS.filter((r) => /drafting|contract|talking|from the call/i.test(r[0]));
  check("  nor do the plan rows (and so the Terms) for Merlin's AI features", aiRows.length >= 4 && aiRows.every((r) => !r.some((c) => AIW.test(c))), aiRows);
  // The member's own Claude, through the connector, is the one place a proposal screen names it.
  const ownClaude = /Prefer your own Claude\?|Paste it into Claude, with Merlin connected|buildInClaude|BuildInClaude|in Claude\b(?=[^"]*")/g;
  const ui = ["app/post/ContractUpload.tsx", "app/post/ChangeIt.tsx", "app/post/ProposalStart.tsx"].map((f) => {
    const src = readFileSync(path.join(import.meta.dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    return [f, src.replace(ownClaude, "").replace(/const prompt = claudePrompt[^\n]*/g, "").replace(/export function claudePrompt[\s\S]*?\n}\n/, "").replace(/CLAUDE_NEW[^\n]*/g, "")] as const;
  });
  check("  nor do the screens for them (contracts, Change it, start from the call)", ui.every(([, src]) => !AIW.test(src)), ui.filter(([, src]) => AIW.test(src)).map(([f, src]) => [f, src.match(new RegExp(`.{0,60}(Claude|Anthropic).{0,60}`))?.[0]]));
  const privacy = readFileSync(path.join(import.meta.dirname, "..", "app/privacy/Privacy.tsx"), "utf8");
  check("the Privacy page names Anthropic as the AI service behind Merlin's drafts, not training on it", privacy.includes("Anthropic (the AI service that writes Merlin's drafts)") && privacy.includes("don't let it train its models"));

  console.log(`\n${passes} passed, ${failures} failed`);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL crashed:", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
  });
