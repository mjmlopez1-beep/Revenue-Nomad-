/**
 * The QA fixes on the signing, proposals, activity and alerts side (scripts/test-qa6.mts). No
 * server: lib/table.ts runs in process on a made-up seed in a temporary data dir, email and Slack
 * to fakes, fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-qa6.mts      exits 1 on any failure
 *
 * Covered: asking, passing on and declining need the email code (the sign route and the store);
 * the hand-off count along the chain; each sign-route field's type; one email to the member per
 * event (countersign, hand-off, question) and every email switch respected; client_signed as its
 * own status until the countersignature; the countersignature on the Activity timeline at once;
 * /check naming every signer; the reading beacon taking only the proposal's own sections and
 * options; a deleted proposal's notifications gone; a drawn signature too big in its own words;
 * a CJK name never printed as "?" in the sealed PDF; a typed company not linked to the call's;
 * signed-out POSTs to the table and billing as 401; a blank the draft made up read as words;
 * a stale write refused (409) from a tab and from the connector; restoring a version brings its
 * options back; the hand-off's activity told per signer; and the client page's copy line.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import Module, { register } from "node:module";

(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-qa6-"));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const root = path.join(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Software", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.qa6@example.com`, title, token: `tok-${id.slice(4)}-qa6` });
const members = [member("mem_jor", "Jordan Avery", "Fractional CRO")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_cedar", "Cedar and Pine Software", "cedarpine.example"), co("c_larch", "Larchfield Robotics", "larchfield.example")], engagements: [], contacts: [] }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: Object.fromEntries(["c_cedar"].map((c) => [`${c}.identity`, ["mem_jor"]])),
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional CRO", onboarded: true } },
    billing: { members: { mem_jor: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(400 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-qa6",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_qa6",
  STRIPE_WEBHOOK_SECRET: "whsec_test_qa6",
  STRIPE_PRICE_MONTH: "price_month_qa6",
  STRIPE_PRICE_YEAR: "price_year_qa6",
  RESEND_API_KEY: "test-key-qa6",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_GRANOLA", "RN_SEAL_KEY"]) delete process.env[k];

type Mail = { to: string; subject: string; text: string };
const mails: Mail[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
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

function png(w: number, h: number): string {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0), ihdr.writeUInt32BE(h, 4), (ihdr[8] = 8), (ihdr[9] = 6);
  const rows = Buffer.concat(Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, (_, x) => Buffer.from((x + y * 3) % 7 === 0 ? [10, 26, 19, 255] : [0, 0, 0, 0])))])));
  const b = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${b.toString("base64")}`;
}

async function main() {
  const T = await import("../lib/table");
  const PS = await import("../lib/proposals/store");
  const C = await import("../lib/close/server");
  const L = await import("../lib/proposals/library");
  const MS = await import("../lib/proposals/memberSig");
  const CH = await import("../lib/proposals/change");
  const MP = await import("../lib/mcp/proposals");
  const SEAL = await import("../lib/seal");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { NextRequest } = await import("next/server");

  const BASE = "https://post.example.com";
  const JOR = "tok-jor-qa6";
  const ME = "jor.qa6@example.com";
  const who = { ip: "203.0.113.9", ua: "Mozilla/5.0 (test)" };
  const pub = (id: string) => T.tableInternals.pubId(id);
  const CEDAR = pub("c_cedar");
  const settle = () => C.closeSettled();
  const lastTo = (to: string) => [...mails].reverse().find((m) => m.to === to);
  const signTok = (t: string) => t.match(/\/sign\/(s_[^\s"<]+)/)?.[1] ?? "";
  const toMe = (from: number) => mails.slice(from).filter((m) => m.to === ME);
  const blocks = [
    { id: "s1", blockId: "custom", title: "Summary", body: "A plan for the next 90 days." },
    { id: "s2", blockId: "custom", title: "Scope", body: "Weekly pipeline review." },
    { id: "s3", blockId: "custom", title: "Terms", body: "Three months to start." },
  ];
  const confirmed = async (tok: string, email: string, at = Date.now()) => {
    await PS.requestCode(tok, who, at);
    return PS.verifyCode(tok, lastTo(email)?.text.match(/\b(\d{6})\b/)?.[1] ?? "", who, BASE, at);
  };
  const sendOne = async (title: string, signer: { name: string; email: string; title?: string }, memberSign: "none" | "after" = "none") => {
    const p = await PS.createProposal(JOR, { companyId: CEDAR, title, blocks, fields: { "pricing.monthlyFee": "$9,000" } }, BASE);
    await PS.sendProposal(JOR, p.id, { signer, memberSign }, BASE);
    return { id: p.id, tok: signTok(lastTo(signer.email)?.text ?? "") };
  };
  const dana = { name: "Dana Whitfield", email: "dana@cedarpine.example", title: "COO" };

  /* ---------- 1. the email code before asking, passing on, declining ---------- */
  console.log("\nthe code first");
  const a = await sendOne("Pipeline plan", dana);
  const m0 = mails.length;
  check("ask before the code: 401, nothing emailed", (await refused(PS.askQuestion(a.tok, "Can we start in May?", who, BASE))) === "401 Confirm your email with the code first." && mails.length === m0);
  check("hand-off before the code: 401, the link still the named signer's", (await refused(PS.handOff(a.tok, { signer: { name: "Sam Stranger", email: "sam@elsewhere.example" } }, who, BASE))) === "401 Confirm your email with the code first." && (await PS.signerView(a.tok, who, BASE)).status === "open" && mails.length === m0);
  check("decline before the code: 401, still open", (await refused(PS.declineProposal(a.tok, { reason: "no" }, who, BASE))) === "401 Confirm your email with the code first." && (await PS.signerView(a.tok, who, BASE)).status === "open");
  const route = await import("../app/api/sign/route");
  const sign = async (body: unknown) => {
    const r = await route.POST(new NextRequest("https://post.example.com/api/sign", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" }, body: JSON.stringify(body) }), {} as never);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  const viaRoute = await Promise.all([sign({ token: a.tok, op: "ask", question: "Hi?" }), sign({ token: a.tok, op: "handoff", signer: { name: "Sam Lee", email: "sam@cedarpine.example" } }), sign({ token: a.tok, op: "decline" })]);
  check("…the same through POST /api/sign: 401 for all three", viaRoute.every((r) => r.status === 401 && r.json.error === "Confirm your email with the code first."), viaRoute);
  const objQ = await sign({ token: a.tok, op: "ask", question: { text: "hi" } });
  check("a question sent as an object: 400 in words, never [object Object]", objQ.status === 400 && objQ.json.error === "Type your question as text." && !mails.some((m) => m.text.includes("[object Object]")), objQ);
  check("…a reason, a signer, a code and consent of the wrong type: 400", (await sign({ token: a.tok, op: "decline", reason: 5 })).status === 400 && (await sign({ token: a.tok, op: "handoff", signer: ["x"] })).status === 400 && (await sign({ token: a.tok, op: "verify", code: 123456 })).status === 400 && (await sign({ token: a.tok, op: "sign", consent: "true" })).status === 400);
  await confirmed(a.tok, dana.email);
  const mq = mails.length;
  check("after the code: the question goes, one email to the member", (await PS.askQuestion(a.tok, "Can we start in May?", who, BASE)).sent && toMe(mq).length === 1, toMe(mq).map((m) => m.subject));
  await settle();
  check("…and the alert sends no second one", toMe(mq).length === 1, toMe(mq).map((m) => m.subject));
  const mh = mails.length;
  const passed = await PS.handOff(a.tok, { signer: { name: "Sam Lee", email: "sam@cedarpine.example", title: "CEO" } }, who, BASE);
  await settle();
  check("hand-off after the code: the member gets one email about it", toMe(mh).length === 1 && /passed .* to Sam Lee, CEO to sign/.test(toMe(mh)[0].subject), toMe(mh).map((m) => m.subject));
  const samTok = signTok(lastTo("sam@cedarpine.example")?.text ?? "");
  /* ---------- 2. the hand-off's activity, per signer ---------- */
  const av = await C.activityView(JOR, a.id, BASE);
  check("activity after a hand-off: Sam has no opens of Dana's, the line and the advice agree", av.stats.opens === 0 && av.statusWords === "Sent · not opened" && (av.suggestion?.key ?? "wait") !== "new_reader", { opens: av.stats.opens, w: av.statusWords, s: av.suggestion?.key });
  check("…the timeline: You sent it, then Dana passed it to Sam Lee", av.timeline.some((x) => x.text === "You sent it") && av.timeline.some((x) => x.strong === "Dana" && x.text === " passed it to Sam Lee"), av.timeline);

  check("hand-offs left along the chain: the passed link 0, the new one 2", passed.handoffsLeft === 0 && (await PS.signerView(a.tok, who, BASE)).handoffsLeft === 0 && (await PS.signerView(samTok, who, BASE)).handoffsLeft === 2);
  check("…the new signer still confirms their own email: no hand-off before it", (await refused(PS.handOff(samTok, { signer: { name: "Lee Third", email: "lee@cedarpine.example" } }, who, BASE)))?.startsWith("401"));

  /* ---------- 3. countersign: one email, its own status, the timeline at once ---------- */
  console.log("\ncountersign");
  const b = await sendOne("Countersign plan", dana, "after");
  await confirmed(b.tok, dana.email);
  const mc = mails.length;
  const bv = await PS.signerView(b.tok, who, BASE);
  await PS.signProposal(b.tok, { name: "Dana Whitfield", consent: true, hash: bv.hash }, who, BASE);
  await C.afterSignerStep(b.tok, BASE);
  await settle();
  check("the client signs, the member countersigns: one email to the member, not two", toMe(mc).length === 1 && /^Dana signed\. Countersign to finish/.test(toMe(mc)[0].subject), toMe(mc).map((m) => m.subject));
  const br = await PS.getProposal(JOR, b.id, BASE);
  check("its status is client_signed, never Signed, until the member countersigns", br.status === "client_signed" && br.send?.status === "client_signed" && br.send.waiting === "member");
  const { STATUS } = await import("../app/post/ProposalParts");
  check("…the chip reads: Client signed · your turn to countersign", STATUS.client_signed === "Client signed · your turn to countersign" && STATUS.signed === "Signed");
  const mcp = await MP.getProposalTool({ member: (await T.memberForToken(JOR))!, origin: BASE }, { proposal_id: b.id });
  check("…the connector says client_signed too", JSON.stringify(mcp).includes('"status":"client_signed"'));
  const done = await PS.countersignProposal(JOR, b.id, { method: "typed", typed: "Jordan Avery", consent: true }, BASE);
  const dv = await C.activityView(JOR, b.id, BASE);
  check("countersigned: Signed at once, and the timeline has the countersignature", done.status === "signed" && dv.statusWords === "Signed" && dv.timeline.some((x) => x.text === "You countersigned it"), { s: done.status, w: dv.statusWords, tl: dv.timeline.map((x) => x.text) });
  check("…the Activity panel reloads with the proposal's revision, not only its version", /version=\{`\$\{p\.version\}:\$\{p\.rev\}/.test(src("app/post/Proposals.tsx")));
  const st = await T.loadState();
  const bx = st.proposals!.find((p) => p.id === b.id)!.sends.at(-1)!;
  const found = SEAL.sealedIn(st)({ sha256: bx.seal?.sha256 });
  check("/check names every signer: the client and the member", found?.signers.map((x) => x.name).join() === "Dana Whitfield,Jordan Avery", found?.signers);

  /* ---------- 4. every email switch respected ---------- */
  console.log("\nthe switches");
  for (const k of ["countersign", "passed", "question"] as const) await C.setPref(JOR, k, "email", false);
  const c = await sendOne("Switches off", { name: "Dana Whitfield", email: "dana2@cedarpine.example" }, "after");
  await confirmed(c.tok, "dana2@cedarpine.example");
  const ms0 = mails.length;
  await PS.askQuestion(c.tok, "One question?", who, BASE);
  await PS.handOff(c.tok, { signer: { name: "Sam Lee", email: "sam2@cedarpine.example" } }, who, BASE);
  const c2 = signTok(lastTo("sam2@cedarpine.example")?.text ?? "");
  await confirmed(c2, "sam2@cedarpine.example");
  await PS.signProposal(c2, { name: "Sam Lee", consent: true, hash: (await PS.signerView(c2, who, BASE)).hash }, who, BASE);
  await settle();
  check("question, passed on and countersign switched off: no email to the member for any of them", toMe(ms0).length === 0, toMe(ms0).map((m) => m.subject));
  check("…still in Merlin", (await C.inboxView(JOR)).items.filter((x) => x.item === c.id).map((x) => x.kind).sort().join() === "countersign,passed,question");
  for (const k of ["countersign", "passed", "question"] as const) await C.setPref(JOR, k, "email", true);

  /* ---------- 5. the beacon takes only the proposal's own ids ---------- */
  console.log("\nthe beacon");
  const d = await sendOne("Beacon plan", { name: "Dana Whitfield", email: "dana3@cedarpine.example" });
  const bc = await C.recordBeacon({ token: d.tok, events: [{ t: "open" }, { t: "sec", id: "evil", label: "Call 555-0100 now: evil.example", ms: 4000 }, { t: "sec", id: "custom", label: "Anything", ms: 4000 }, { t: "opt", id: "o_fake", label: "Fake", ms: 4000 }], cookie: "Q".repeat(22), ua: "test", memberToken: null });
  const it = (await T.loadState()).close?.items?.[d.id];
  check("a made-up section is dropped; a real one is named from the document, whatever the page said", bc.status === 200 && !it?.sections.evil && it?.sections.custom?.label === "Summary" && !Object.keys(it?.options ?? {}).length, it?.sections);

  /* ---------- 6. deleting a proposal takes its notifications ---------- */
  const del = await sendOne("To delete", { name: "Dana Whitfield", email: "dana4@cedarpine.example" });
  await C.recordBeacon({ token: del.tok, events: [{ t: "open" }], cookie: "R".repeat(22), ua: "test", memberToken: null });
  await settle();
  const before = (await C.inboxView(JOR)).items.filter((x) => x.item === del.id).length;
  await PS.voidProposal(JOR, del.id, BASE);
  await PS.deleteProposal(JOR, del.id);
  const after = await C.inboxView(JOR);
  check("deleted: its notifications leave the bell and the inbox", before > 0 && !after.items.some((x) => x.item === del.id) && !((await T.loadState()).close?.inbox?.mem_jor ?? []).some((x) => x.item === del.id), { before });

  /* ---------- 7. a drawing too big has its own words ---------- */
  console.log("\nwords");
  const big = png(500, 120);
  check("a drawn signature over the limit: its own words, with the limit", (await refused(MS.pngFromDataUrl(big))) === `413 ${MS.DRAWING_TOO_BIG}` && /200 KB/.test(MS.DRAWING_TOO_BIG), big.length);
  const pr = await import("../app/api/proposals/route");
  const ppost = async (body: string) => {
    const r = await pr.POST(new NextRequest("https://post.example.com/api/proposals", { method: "POST", headers: { cookie: `rn_table=${JOR}`, "content-type": "application/json" }, body }), {} as never);
    return { status: r.status, json: (await r.json()) as { error?: string } };
  };
  const huge = await ppost(JSON.stringify({ op: "signature_set", method: "drawn", png: `data:image/png;base64,${"A".repeat(1_000_000)}`, consent: true }));
  check("…a body too big for the route: the drawing's words, not the call transcript's", huge.status === 413 && huge.json.error === MS.DRAWING_TOO_BIG, huge);
  check("a blank the draft made up reads as words: start.date is Start date", L.fieldLabel("start.date") === "Start date" && L.blockFields({ id: "x", blockId: "custom", title: "T", body: "From {{start.date}}." })[0].label === "Start date");
  check("…Compare versions shows blanks by label, never {{key}}", /DocText text=\{r\.was\.text\} blanks label=\{fieldLabel\}/.test(src("app/post/ChangeIt.tsx")));
  check("the client page: in countersign mode the copy comes once both have signed", /once you and \$\{d\.from\.name\} have both signed|once you both have signed|both signed/.test(src("app/sign/Sign.tsx")));

  /* ---------- 8. the sealed PDF never prints ? for a name ---------- */
  console.log("\nthe PDF");
  const e = await sendOne("Unicode plan", { name: "Wang Li", email: "wang@cedarpine.example" });
  await confirmed(e.tok, "wang@cedarpine.example");
  await PS.signProposal(e.tok, { name: "王小明 李", consent: true, hash: (await PS.signerView(e.tok, who, BASE)).hash }, who, BASE);
  const ex = (await T.loadState()).proposals!.find((p) => p.id === e.id)!.sends.at(-1)!;
  const pdf = await PS.sealedPdf(PS.copyToken(ex.id), BASE);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf!.bytes), verbosity: 0 }).promise;
  let all = "";
  for (let i = 1; i <= doc.numPages; i++) all += ((await (await doc.getPage(i)).getTextContent()).items as { str: string }[]).map((x) => x.str).join(" ") + "\n";
  all = all.replace(/\s+/g, " ");
  check("a CJK name: never ?, printed by its code points, kept exact in the record", !/\?\?\?/.test(all) && all.includes("U+738B U+5C0F U+660E U+0020 U+674E") && ex.signed?.name === "王小明 李", all.slice(0, 600));

  /* ---------- 9. a typed company isn't linked to the call's ---------- */
  console.log("\ncompanies");
  const typed = await PS.createProposal(JOR, { companyName: "Typed Name Co", companySite: "cedarpine.example", title: "From a call" }, BASE);
  check("a typed company not on Merlin: not linked to the call's company, the typed name kept", typed.company.id === null && typed.company.name === "Typed Name Co", typed.company);
  const exact = await PS.createProposal(JOR, { companyName: "Cedar and Pine Software", companySite: "larchfield.example", title: "Exact" }, BASE);
  check("…an exact name links that company", exact.company.id === CEDAR, exact.company);

  /* ---------- 10. signed out is 401 ---------- */
  const table = await import("../app/api/table/route");
  const tr = await table.POST(new NextRequest("https://post.example.com/api/table", { method: "POST", headers: { cookie: "rn_table=made-up", "content-type": "application/json" }, body: JSON.stringify({ action: "follow", companyId: CEDAR }) }), {} as never);
  const billing = await import("../app/api/billing/route");
  const br2 = await billing.POST(new NextRequest("https://post.example.com/api/billing", { method: "POST", headers: { cookie: "rn_table=made-up", "content-type": "application/json" }, body: JSON.stringify({ op: "checkout", interval: "month" }) }), {} as never);
  check("signed-out POSTs to /api/table actions and /api/billing with a made-up cookie: 401", tr.status === 401 && br2.status === 401, [tr.status, br2.status]);

  /* ---------- 11. two tabs: a stale write is refused ---------- */
  console.log("\ntwo tabs");
  const f = await PS.createProposal(JOR, { companyId: CEDAR, title: "Two tabs", blocks, fields: {} }, BASE);
  const tabA = await PS.updateProposal(JOR, f.id, { rev: f.rev, blocks: f.blocks.map((x) => (x.id === "s2" ? { ...x, body: "Tab A changed the scope." } : x)) }, BASE);
  const stale = await refused(PS.updateProposal(JOR, f.id, { rev: f.rev, blocks: f.blocks.map((x) => (x.id === "s3" ? { ...x, body: "Tab B changed the terms." } : x)) }, BASE));
  const now = await PS.getProposal(JOR, f.id, BASE);
  check("tab B's stale save: 409 in words, tab A's edit kept", stale === `409 ${PS.STALE}` && now.blocks.find((x) => x.id === "s2")?.body === "Tab A changed the scope." && now.blocks.find((x) => x.id === "s3")?.body === "Three months to start.", stale);
  check("…a save on the latest revision goes through, and moves it on", tabA.rev === f.rev + 1 && (await PS.updateProposal(JOR, f.id, { rev: tabA.rev, title: "Two tabs, saved" }, BASE)).rev === tabA.rev + 1);
  const jctx = { member: (await T.memberForToken(JOR))!, origin: BASE };
  check("the connector: a save on an old revision is refused, asking it to read again", /changed this proposal on Merlin since you read it/.test((await refused(MP.createOrUpdateProposal(jctx, { proposal_id: f.id, revision: f.rev, title: "Old" }))) ?? "") && (await PS.getProposal(JOR, f.id, BASE)).title === "Two tabs, saved");
  check("…get_proposal gives the revision to send back", (JSON.parse(JSON.stringify(await MP.getProposalTool(jctx, { proposal_id: f.id }))) as { revision?: number }).revision === (await PS.getProposal(JOR, f.id, BASE)).rev);
  check("…Change it and restore check it too", (await refused(CH.restoreVersion(JOR, f.id, 1, BASE, Date.now(), 0)))?.startsWith("409") ?? false);
  check("the editor keeps unsaved edits until the server has them, retries, and warns before leaving", /beforeunload/.test(src("app/post/Proposals.tsx")) && /Not saved, retrying/.test(src("app/post/Proposals.tsx")) && /This proposal changed in another tab or window/.test(src("lib/proposals/store.ts")));

  /* ---------- 12. a restored version brings its options back ---------- */
  const g = await PS.createProposal(JOR, { companyId: CEDAR, title: "Options", blocks, fields: {} }, BASE);
  await PS.updateProposal(JOR, g.id, { pricing: { options: [{ id: "o_a", name: "Advisor", price: 6000 }, { id: "o_b", name: "Operator", price: 12000 }] } }, BASE);
  const stP = await T.tableInternals.mutate((s) => {
    const p = s.proposals!.find((x) => x.id === g.id)!;
    p.versions = [{ version: p.version, at: new Date().toISOString(), title: p.title, blocks: structuredClone(p.blocks), fields: { ...p.fields }, pricing: structuredClone(p.pricing!), note: "Kept" }];
    p.version++;
    return p.version;
  });
  await PS.updateProposal(JOR, g.id, { pricing: null }, BASE);
  const back = await CH.restoreVersion(JOR, g.id, stP - 1, BASE);
  check("restoring a version brings its options back", back.pricing?.options.map((o) => o.name).join() === "Advisor,Operator", back.pricing);

  console.log(`\n${passes} passed, ${failures} failed`);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => process.exit(failures ? 1 : 0));
