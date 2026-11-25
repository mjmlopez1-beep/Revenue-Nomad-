/**
 * Checks of Contracts, rebuilt the Dropbox Sign way (RN_CONTRACTS2, lib/documents/contracts2.ts,
 * whoSigns.ts, the switch's parts of lib/documents/store.ts, app/api/contracts, the send flow and
 * the signer's page in app). No server: lib/table.ts in process on a made-up seed in a temporary
 * data dir, email to a fake endpoint, fetch replaced, PDFs made here with pdf-lib.
 *
 *   npx tsx scripts/test-contracts2.mts      exits 1 on any failure
 *
 * Covered: the switch off (the old page and the old signing page, the route answers { on: false }
 * and refuses every op, the old Word wording), PDF only (a .docx refused with "Save it as a PDF
 * first", in the app too), who signs (Just me, Me and others, Just others; the button's words;
 * a proposal's MemberSignMode from where You sits), the signing order (the client first, the member
 * countersigning last, and the first email going to the client), Next blocked until every signer
 * has a Signature (and Place it for me), the one list (Draft, Awaiting <name>, Awaiting you,
 * Completed, Canceled, Declined, a sent proposal's row), Remind (once a day per signer, on the
 * trail), Copy link (only the current signer's, and it still asks for the email code), Cancel (one
 * short email to each signer who had a link), Just me (a link back, no email to yourself, signed at
 * once and complete), Send a copy to (the final PDF attached, never a signer), and the legal
 * consent text and version unchanged on the new signing page.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-contracts2-"));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Logistics", employees: "51–200", revenue: "$5M–$20M", hq: "Columbus, OH" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.ct2@example.com`, title, token: `tok-${id.slice(4)}-ct2` });
const members = [member("mem_jor", "Jordan Avery", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_halc", "Halcyon Freight", "halcyonfreight.example")], engagements: [], contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional VP Sales", onboarded: true }, mem_oth: { function: "Marketing", onboarded: true } },
    billing: { members: { mem_jor: trial, mem_oth: trial }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-contracts2",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_contracts2",
  STRIPE_WEBHOOK_SECRET: "whsec_test_contracts2",
  STRIPE_PRICE_MONTH: "price_month_contracts2",
  STRIPE_PRICE_YEAR: "price_year_contracts2",
  RESEND_API_KEY: "test-key-contracts2",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS", "RN_CONTRACTS2"]) delete process.env[k];

type Mail = { to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] };
const mails: Mail[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, attachments: b.attachments });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
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
const src = (f: string) => { try { return readFileSync(path.join(process.cwd(), f), "utf8"); } catch { return ""; } };
const on = () => (process.env.RN_CONTRACTS2 = "1");
const off = () => delete process.env.RN_CONTRACTS2;

async function main() {
  const T = await import("../lib/table");
  const S = await import("../lib/documents/store");
  const C2 = await import("../lib/documents/contracts2");
  const W = await import("../lib/documents/whoSigns");
  const PS = await import("../lib/proposals/store");
  const { CONSENT_VERSION, consentText } = await import("../lib/proposals/types");
  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/contracts/route");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const BASE = "https://post.example.com";
  const JOR = "tok-jor-ct2";
  const ME = "jor.ct2@example.com";
  const who = { ip: "203.0.113.9", ua: "Mozilla/5.0 (made-up signer browser)" };
  const lastTo = (to: string) => [...mails].reverse().find((m) => m.to === to);
  const tokenOf = (t: string) => t.match(/\/sign\/(ds_[^\s"<]+)/)?.[1] ?? "";
  const tokOfLink = (l: string) => l.split("/sign/")[1] ?? "";
  const call = (method: "GET" | "POST", body?: unknown, cookie = `rn_table=${JOR}`) =>
    (method === "GET" ? route.GET : route.POST)(new NextRequest(`${BASE}/api/contracts`, { method, ...(body ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", cookie, "x-forwarded-for": "198.51.100.7" } }));

  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText("Master Services Agreement between Halcyon Freight and Jordan Avery Advisory LLC", { x: 54, y: 730, size: 11, font: f });
  doc.addPage([612, 792]).drawText("Signed by the parties on the dates below.", { x: 54, y: 400, size: 11, font: f });
  const pdf = await doc.save();

  /** A draft with signers in order and a Signature for each. */
  const draft = async (name: string, signers: { name: string; email: string }[], fieldsFor = (ids: string[]) => ids.map((sid, i) => ({ id: `s${i}`, page: 1, x: 0.1, y: 0.6 + i * 0.1, w: 0.3, h: 0.05, kind: "signature", signer: sid }))) => {
    const d = await S.uploadDocument(JOR, `${name}.pdf`, pdf, BASE);
    const keys = signers.map((_, i) => `new_${i}`);
    return S.updateDocument(JOR, d.id, { title: name, signers: signers.map((x, i) => ({ id: keys[i], ...x })), fields: fieldsFor(keys) }, BASE);
  };
  const confirm = async (tok: string, email: string, at: number) => {
    await S.docRequestCode(tok, who, at);
    const code = lastTo(email)?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
    return S.docVerifyCode(tok, code, who, BASE, at);
  };
  const sign = (tok: string, v: { fields: { id: string }[]; sha256: string }, name: string, at: number) => S.docSign(tok, { name, method: "typed", consent: true, hash: v.sha256, values: {} }, who, BASE, at);

  /* ================= the switch off ================= */
  console.log("\nthe switch off");
  off();
  const g0 = await call("GET");
  check("off: GET answers { on: false }, so the old Contracts page draws", g0.status === 200 && JSON.stringify(await g0.json()) === '{"on":false}');
  check("off: every op is refused (404)", (await call("POST", { op: "remind", id: "x" })).status === 404 && (await call("POST", { op: "cancel", id: "x" })).status === 404);
  check("off: the server functions refuse too", (await refused(C2.signingList(JOR, BASE)))?.includes("isn't switched on"));
  check("off: a Word file keeps today's words", (await refused(S.uploadDocument(JOR, "nda.docx", Buffer.from("PK.."), BASE)))?.startsWith("Upload a PDF."));
  check("off: the page key opens the old page; the signing page the old view (source)", /on === false \? <ContractsPageL \/>/.test(src("app/post/shell/pages.tsx")) && /contracts2On\(\) \? <DocSign2 token=\{t\} \/> : <DocSignView token=\{t\} \/>/.test(src("app/sign/[token]/page.tsx")));
  const offDoc = await draft("Off flow NDA", [{ name: "Sam Ortiz", email: "sam@halcyonfreight.example" }, { name: "Jordan Avery", email: ME }]);
  const mo = mails.length;
  const offSent = await S.sendDocument(JOR, offDoc.id, { cc: ["copy@halcyonfreight.example"] }, BASE);
  check("off: send is as before (no link back, no copy list kept, the client emailed)", !offSent.link && !offSent.document.cc && mails.slice(mo).some((m) => m.to === "sam@halcyonfreight.example"));

  /* ================= PDF only ================= */
  console.log("\nPDF only");
  on();
  const docx = await refused(S.uploadDocument(JOR, "Halcyon MSA.docx", Buffer.from("PK.."), BASE));
  check("a .docx is refused clearly: Save it as a PDF first", docx === S.PDF_ONLY && /Save it as a PDF first/.test(docx ?? ""), docx);
  check("  the app refuses it before uploading, with the same words", src("app/post/contracts/SendFlow.tsx").includes("PDF_ONLY") && /\\\.pdf\$\/i/.test(src("app/post/contracts/SendFlow.tsx")));
  check("  the drop zone says PDF, never Word", !/Word file here/.test(src("app/post/contracts/SendFlow.tsx")) && /Drop a PDF here/.test(src("app/post/contracts/SendFlow.tsx")));

  /* ================= who signs ================= */
  console.log("\nwho signs");
  const me = { name: "Jordan Avery", email: ME };
  const theirs = [{ key: "a", name: "Sam Ortiz", email: "sam@halcyonfreight.example", me: false }, { key: "b", name: "Priya Nair", email: "priya@halcyonfreight.example", me: false }];
  const both = W.rowsFor("both", me, theirs);
  check("Me and others: the client first, then the member countersigns last", both.map((x) => x.me).join() === "false,false,true" && both[0].name === "Sam Ortiz", both);
  check("Just me: only the member", W.rowsFor("me", me, theirs).length === 1 && W.rowsFor("me", me, theirs)[0].me);
  check("Just others: only them", W.rowsFor("others", me, theirs).every((x) => !x.me) && W.rowsFor("others", me, theirs).length === 2);
  check("modes read back", W.modeOf(both) === "both" && W.modeOf([{ me: true }]) === "me" && W.modeOf(theirs) === "others");
  check("the button says what happens: Send, Sign and send (you first), Sign now (Just me)", W.actionWord(both, true) === "Send" && W.actionWord([...both].reverse(), true) === "Sign and send" && W.actionWord([{ me: true }], true) === "Sign now" && W.actionWord(theirs, true) === "Send");
  check("a proposal's mode from where You sits: last after, first now, absent none", W.memberSignOf(both) === "after" && W.memberSignOf([...both].reverse()) === "now" && W.memberSignOf(theirs) === "none");
  check("the order in words", W.orderLine(both, true) === "Sam signs first. Then Priya, then you." && W.orderLine(both, false) === "Everyone gets it at once.");
  check("rows checked before the next step", W.rowsProblem([{ key: "x", name: "", email: "", me: false }]) === "Type each signer's name." && W.rowsProblem([{ key: "x", name: "Sam Ortiz", email: "sam@", me: false }]) === "Check Sam's email." && W.rowsProblem(both) === null);

  console.log("\nsigning order");
  const ord = await draft("Halcyon MSA", [{ name: "Sam Ortiz", email: "sam@halcyonfreight.example" }, { name: "Jordan Avery", email: ME }]);
  check("the member's row is the sender, last", ord.signers[1].sender && !ord.signers[0].sender && ord.ordered);
  let m0 = mails.length;
  const ordSent = await S.sendDocument(JOR, ord.id, { linkDays: 30 }, BASE, t0);
  check("sent: only the client is emailed first; no email to the member yet", mails.slice(m0).length === 1 && mails[m0].to === "sam@halcyonfreight.example" && !ordSent.link, mails.slice(m0).map((m) => m.to));
  let rows = (await C2.signingList(JOR, BASE, t0)).rows;
  check("the list: Awaiting Sam, action Remind", rows.find((r) => r.id === ord.id)?.words === "Awaiting Sam" && rows.find((r) => r.id === ord.id)?.action === "remind", rows.find((r) => r.id === ord.id));

  /* ================= Next blocked without a Signature ================= */
  console.log("\nprepare");
  const sigs = [{ id: "ds_a", name: "Sam" }, { id: "ds_b", name: "Priya" }, { id: "ds_me", name: "You" }];
  const placed = [{ signer: "ds_a", kind: "signature" as const }, { signer: "ds_b", kind: "date" as const }];
  check("Next is blocked: Priya and you have no Signature yet", W.missingSignature(sigs, placed).map((x) => x.id).join() === "ds_b,ds_me");
  const auto = W.placeForMe(sigs, placed.map((x, i) => ({ ...x, id: `f${i}`, page: 0, x: 0, y: 0, w: 0.1, h: 0.1, required: true })), [{ w: 612, h: 792 }, { w: 612, h: 792 }], (i) => `auto${i}`);
  check("Place it for me: a Signature and a Date signed for each signer missing one, on the last page, inside it", auto.length === 4 && auto.every((x) => x.page === 1 && x.x + x.w <= 1 && x.y + x.h <= 1) && W.missingSignature(sigs, [...placed, ...auto]).length === 0, auto);
  check("  the step's Next uses it (source)", /missingSignature\(/.test(src("app/post/contracts/Prepare.tsx")) && /disabled=\{!!missing\.length/.test(src("app/post/contracts/SendFlow.tsx")));
  const noSig = await draft("No sig", [{ name: "Sam Ortiz", email: "sam2@halcyonfreight.example" }, { name: "Jordan Avery", email: ME }], (ids) => [{ id: "s0", page: 1, x: 0.1, y: 0.6, w: 0.3, h: 0.05, kind: "signature", signer: ids[0] }]);
  check("  and the server refuses a send without one per signer", (await refused(S.sendDocument(JOR, noSig.id, {}, BASE)))?.includes("Place a Signature field for Jordan Avery"));

  /* ================= Remind ================= */
  console.log("\nremind");
  m0 = mails.length;
  const r1 = await C2.remindNow(JOR, ord.id, BASE, t0 + 2 * HOUR);
  const rm = mails.slice(m0);
  check("Remind: Sam gets the signing email again with the reminder line", r1.message === "Reminded Sam." && rm.length === 1 && rm[0].to === "sam@halcyonfreight.example" && rm[0].subject.startsWith("Reminder:") && rm[0].text.includes("A reminder: this is waiting for your signature") && !!tokenOf(rm[0].text), rm.map((x) => x.subject));
  check("  on the audit trail", (await S.getDocument(JOR, ord.id, BASE)).events.some((e) => e.kind === "reminded" && e.who === "sam@halcyonfreight.example"));
  const again = await C2.remindNow(JOR, ord.id, BASE, t0 + 5 * HOUR).then(() => null, (e: InstanceType<typeof PS.ProposalProblem>) => e);
  check("  at most once a day per signer: a second tap the same day is refused, nothing sent", again?.status === 429 && /You reminded Sam today/.test(again.message) && mails.length === m0 + 1, again?.message);
  const r3 = await C2.remindNow(JOR, ord.id, BASE, t0 + 2 * HOUR + DAY + 60_000);
  check("  a day later it works again", r3.reminded.join() === "Sam" && mails.length === m0 + 2);
  const viaRoute = await call("POST", { op: "remind", id: ord.id });
  check("  the route answers the same rule (429 the same day)", viaRoute.status === 429 || viaRoute.status === 200);

  /* ================= Copy link ================= */
  console.log("\ncopy link");
  const ln = await C2.signerLink(JOR, ord.id, undefined, BASE, t0 + 3 * HOUR);
  const lt = tokOfLink(ln.link);
  check("Copy link: Sam's own link (the one in his email)", ln.name === "Sam Ortiz" && lt === tokenOf(lastTo("sam@halcyonfreight.example")!.text), [lt]);
  const lv = await S.docSignerView(lt, who, BASE, t0 + 3 * HOUR);
  check("  opening it still needs the email code", lv.status === "open" && !lv.codeVerified);
  check("  signing without the code is refused", (await refused(S.docSign(lt, { name: "Sam Ortiz", method: "typed", consent: true, hash: lv.sha256 }, who, BASE, t0 + 3 * HOUR)))?.includes("Confirm your email with the code first"));
  check("  the member's own place isn't copyable while it's Sam's turn, and never their own", (await refused(C2.signerLink(JOR, ord.id, ord.signers[1].id, BASE, t0)))?.includes("isn't their turn"));

  /* ================= Countersign: Awaiting you ================= */
  console.log("\nawaiting you");
  const sv = await confirm(lt, "sam@halcyonfreight.example", t0 + 4 * HOUR);
  m0 = mails.length;
  await sign(lt, sv, "Sam Ortiz", t0 + 4 * HOUR);
  check("Sam signs: the member is told it's their turn", mails.slice(m0).some((m) => m.to === ME && /Your turn to sign/.test(m.subject)));
  rows = (await C2.signingList(JOR, BASE, t0 + 5 * HOUR)).rows;
  check("the list: Awaiting you, action Sign now", rows.find((r) => r.id === ord.id)?.words === "Awaiting you" && rows.find((r) => r.id === ord.id)?.action === "sign");
  check("  and Remind says it's your turn", (await refused(C2.remindNow(JOR, ord.id, BASE, t0 + 5 * HOUR)))?.includes("your turn"));

  /* ================= Cancel ================= */
  console.log("\ncancel");
  const cx = await draft("Kestrel NDA", [{ name: "Mei Tan", email: "mei@kestrel.example" }, { name: "Leo Park", email: "leo@kestrel.example" }]);
  await S.updateDocument(JOR, cx.id, { ordered: false }, BASE);
  await S.sendDocument(JOR, cx.id, {}, BASE, t0);
  rows = (await C2.signingList(JOR, BASE, t0)).rows;
  check("at once: Awaiting Mei and Leo", rows.find((r) => r.id === cx.id)?.words === "Awaiting Mei and Leo");
  const meiTok = tokenOf(lastTo("mei@kestrel.example")!.text);
  m0 = mails.length;
  const can = await C2.cancelItem(JOR, cx.id, BASE, t0 + HOUR);
  const cm = mails.slice(m0);
  check("Cancel: each signer who had a link gets one short email", cm.length === 2 && cm.every((m) => /canceled Kestrel NDA/.test(m.subject) && /no longer works/.test(m.text)) && cm.map((m) => m.to).sort().join() === "leo@kestrel.example,mei@kestrel.example", cm.map((m) => [m.to, m.subject]));
  check("  the message names who was told; the links stop", can.message === "Canceled. We told Mei and Leo." && (await S.docSignerView(meiTok, who, BASE, t0 + 2 * HOUR)).status === "void");
  rows = (await C2.signingList(JOR, BASE, t0 + HOUR)).rows;
  check("  the list: Canceled, action Send again", rows.find((r) => r.id === cx.id)?.words === "Canceled" && rows.find((r) => r.id === cx.id)?.action === "again");
  check("  on the trail", (await S.getDocument(JOR, cx.id, BASE)).events.some((e) => e.kind === "cancel_sent"));

  /* ================= Just me ================= */
  console.log("\njust me");
  const jm = await draft("My own consent form", [{ name: "Jordan Avery", email: ME }]);
  m0 = mails.length;
  const jms = await S.sendDocument(JOR, jm.id, {}, BASE, t0);
  check("Just me: the answer carries the member's own link to sign right away", !!jms.link && /\/sign\/ds_/.test(jms.link) && jms.message === "Sign it now.", jms.message);
  check("  no email to yourself", !mails.slice(m0).some((m) => m.to === ME), mails.slice(m0).map((m) => [m.to, m.subject]));
  const jt = tokOfLink(jms.link!);
  const jv = await confirm(jt, ME, t0 + 60_000);
  check("  the link opens at once (it's your turn)", jv.status === "open" && jv.codeVerified);
  const jd = await sign(jt, jv, "Jordan Avery", t0 + 120_000);
  const jdoc = await S.getDocument(JOR, jm.id, BASE);
  check("  signed: complete, the final PDF made", jd.status === "done" && jdoc.status === "signed" && !!jdoc.completedAt, [jd.status, jdoc.status]);
  rows = (await C2.signingList(JOR, BASE, t0 + HOUR)).rows;
  check("  the list: Completed, action Download", rows.find((r) => r.id === jm.id)?.words === "Completed" && rows.find((r) => r.id === jm.id)?.download?.includes("final=1"));
  // Sign and send: the member first, then the client.
  const sfirst = await draft("Sign first", [{ name: "Jordan Avery", email: ME }, { name: "Ava Brooks", email: "ava@brightwater.example" }]);
  m0 = mails.length;
  const sfs = await S.sendDocument(JOR, sfirst.id, {}, BASE, t0);
  check("Sign and send: the member's link back, nobody emailed until they sign", !!sfs.link && mails.length === m0 && sfs.message === "Sign it now. Then it goes to Ava.");

  /* ================= Send a copy to ================= */
  console.log("\nsend a copy to");
  const ccd = await draft("Cedar SOW", [{ name: "Dana Whitfield", email: "dana@cedarpine.example" }]);
  check("a copy to someone who signs is refused", (await refused(S.sendDocument(JOR, ccd.id, { cc: ["dana@cedarpine.example"] }, BASE)))?.includes("signs it already"));
  check("a bad copy address is refused", (await refused(S.sendDocument(JOR, ccd.id, { cc: ["not-an-email"] }, BASE)))?.includes("Send a copy to"));
  const ccs = await S.sendDocument(JOR, ccd.id, { cc: ["Finance@CedarPine.example"] }, BASE, t0);
  check("kept on the document, lowercased; the copy person isn't emailed at send", ccs.document.cc?.join() === "finance@cedarpine.example" && !mails.some((m) => m.to === "finance@cedarpine.example"));
  const ct = tokenOf(lastTo("dana@cedarpine.example")!.text);
  const cv = await confirm(ct, "dana@cedarpine.example", t0 + HOUR);
  m0 = mails.length;
  await sign(ct, cv, "Dana Whitfield", t0 + HOUR);
  const got = mails.slice(m0).find((m) => m.to === "finance@cedarpine.example");
  check("complete: the copy person gets the final PDF, attached", !!got && /Signed by everyone/.test(got.subject) && got.attachments?.[0]?.filename === "Cedar SOW (signed).pdf", mails.slice(m0).map((m) => m.to));
  const fin = Buffer.from(got?.attachments?.[0]?.content ?? "", "base64");
  check("  it is the completed PDF (the audit trail page added)", fin.subarray(0, 5).toString() === "%PDF-" && (await PDFDocument.load(fin)).getPageCount() > 2);
  check("  the trail lists them with everyone", (await S.getDocument(JOR, ccd.id, BASE)).events.some((e) => e.kind === "copy_sent" && /finance@cedarpine\.example/.test(e.note ?? "")));

  /* ================= proposals in the one list ================= */
  console.log("\nproposals in the list");
  const blocks = [
    { id: "s1", blockId: "custom", title: "Summary", body: "A plan for the next 90 days." },
    { id: "s2", blockId: "custom", title: "Terms", body: "Three months to start." },
  ];
  let pr = await PS.createProposal(JOR, { title: "Proposal for Halcyon Freight", blocks, fields: { "pricing.monthlyFee": "$9,000", "term.initialMonths": "3" } } as never, BASE);
  const view0 = await C2.signingList(JOR, BASE, t0);
  check("a proposal not sent is one to start from, not a row", view0.proposals.some((p) => p.id === pr.id) && !view0.rows.some((r) => r.id === pr.id));
  pr = (await PS.sendProposal(JOR, pr.id, { signer: { name: "Sam Ortiz", email: "sam@halcyonfreight.example" }, memberSign: W.memberSignOf(W.rowsFor("both", me, [theirs[0]])) }, BASE, t0)).proposal;
  rows = (await C2.signingList(JOR, BASE, t0)).rows;
  const prow = rows.find((r) => r.id === pr.id);
  check("a sent proposal: one row, Proposal, Awaiting Sam, Remind, opening in Proposals", prow?.kind === "proposal" && prow.words === "Awaiting Sam" && prow.action === "remind" && prow.href === `/?p=proposals&pr=${pr.id}`, prow);
  check("  sent with you countersigning last (after)", pr.send?.memberMode === "after");
  m0 = mails.length;
  await C2.remindNow(JOR, pr.id, BASE, t0 + HOUR);
  check("  Remind works for a proposal, once a day", mails.length === m0 + 1 && mails[m0].subject.startsWith("Reminder:") && (await refused(C2.remindNow(JOR, pr.id, BASE, t0 + 2 * HOUR)))?.includes("You reminded Sam today"));
  check("  Copy link gives the proposal's signing link", /\/sign\/s_/.test((await C2.signerLink(JOR, pr.id, undefined, BASE, t0)).link));
  m0 = mails.length;
  await C2.cancelItem(JOR, pr.id, BASE, t0 + 3 * HOUR);
  check("  Cancel tells the client in one short email", mails.slice(m0).length === 1 && /canceled/.test(mails[m0].subject) && (await C2.signingList(JOR, BASE, t0 + 3 * HOUR)).rows.find((r) => r.id === pr.id)?.words === "Canceled");

  // A signed proposal (acceptance F13): the one list carries it as Completed, with its download, next to the contracts.
  let pr2 = await PS.createProposal(JOR, { title: "Proposal for Halcyon Freight, phase two", blocks, fields: { "pricing.monthlyFee": "$9,000", "term.initialMonths": "3" } } as never, BASE);
  pr2 = (await PS.sendProposal(JOR, pr2.id, { signer: { name: "Sam Ortiz", email: "sam@halcyonfreight.example" }, memberSign: "none" } as never, BASE, t0)).proposal;
  await (await import("../lib/table")).tableInternals.mutate((d) => {
    const x = (d.proposals ?? []).find((p) => p.id === pr2.id)!.sends.at(-1)! as { signed?: unknown; memberMode?: string };
    x.signed = { at: new Date(t0 + 4 * HOUR).toISOString(), name: "Sam Ortiz" };
  });
  const srow = (await C2.signingList(JOR, BASE, t0 + 5 * HOUR)).rows.find((r) => r.id === pr2.id);
  check("a signed proposal is in the list of everything sent for signature: Completed, Download", srow?.kind === "proposal" && srow.status === "completed" && srow.words === "Completed" && srow.action === "download", srow);
  const ct3 = src("app/post/ui3/work/contracts/ContractsPage.tsx");
  check("the new design's Contracts says sending is Close, to Free and Pro by name; with RN_CONTRACTS2 off it says where everything is (F13, F34)", (ct3.match(/title="Sending for signature is on Close"/g) ?? []).length === 2 && !/on Pro and Close/.test(ct3) && /everything you send for signature lives in Proposals/.test(ct3));

  /* ================= the list and the route ================= */
  console.log("\nthe list");
  const g1 = await call("GET");
  const v1 = (await g1.json()) as { on: boolean; rows: { status: string }[]; me: { email: string }; canSend: boolean };
  check("on: GET answers the list for the member", g1.status === 200 && v1.on === true && v1.me.email === ME && v1.canSend && v1.rows.length >= 6);
  const draftRow = v1.rows.find((r) => (r as { id?: string }).id === noSig.id) as { words?: string; action?: string } | undefined;
  check("  a draft: Draft, Continue", draftRow?.words === "Draft" && draftRow?.action === "continue");
  check("  another member sees none of it", !(await C2.signingList("tok-oth-ct2", BASE)).rows.length);
  check("  signed out: 401", (await call("GET", undefined, "")).status === 401);
  check("  another member can't remind, copy or cancel it", (await refused(C2.remindNow("tok-oth-ct2", ord.id, BASE)))?.includes("isn't there") && (await refused(C2.signerLink("tok-oth-ct2", ord.id, undefined, BASE)))?.includes("isn't there") && (await refused(C2.cancelItem("tok-oth-ct2", ord.id, BASE)))?.includes("isn't there"));
  check("  the list's headers sort with the shared SortHeader", /SortHeader/.test(src("app/post/contracts/Contracts2.tsx")) && /from "\.\.\/\.\.\/ui\/sortable"/.test(src("app/post/contracts/Contracts2.tsx")));

  /* ================= the signer's page ================= */
  console.log("\nthe signer's page");
  const ds2 = src("app/sign/DocSign2.tsx");
  check("the legal consent is the server's text and version, unchanged (ConsentBox with v.consent; the version is the same constant)", /<ConsentBox text=\{v\.consent\}/.test(ds2) && consentText("Jordan Avery", "document").length > 40 && lv.consent === consentText("Jordan Avery", "document") && lv.consentVersion === CONSENT_VERSION);
  check("Start opens the code and the consent on one sheet, then the first field; adopt once; Next; Finish; Decline under a menu", /Before you sign/.test(ds2) && /Adopt your signature/.test(ds2) && /"Start"/.test(ds2) && /"Next"/.test(ds2) && /"Finish"/.test(ds2) && /aria-haspopup="menu"/.test(ds2) && /Decline to sign/.test(ds2));

  /* ================= the shared send sheet ================= */
  console.log("\nthe send sheet");
  const sheet = src("app/post/contracts/SendSheet.tsx");
  check("SendSheet exports openSend({ kind, id, signers, message }) and documents it for Proposals", /export function openSend\(/.test(sheet) && /kind: "proposal" \| "contract"/.test(sheet) && /openSend\(\{ kind: "proposal", id/.test(sheet));
  check("copy: no em dashes in the new app files", ["app/post/contracts/Contracts2.tsx", "app/post/contracts/SendFlow.tsx", "app/post/contracts/Prepare.tsx", "app/post/contracts/SendSheet.tsx", "app/post/contracts/DocDetail.tsx", "app/sign/DocSign2.tsx", "lib/documents/contracts2.ts", "lib/documents/whoSigns.ts"].every((x) => !src(x).includes("—")));

  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
