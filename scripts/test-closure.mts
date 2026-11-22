/**
 * Closing an account (lib/account.ts, lib/table.ts purgeMember, app/api/account):
 *  - close: at once signed out (the old token and sign-in links stop working), out of Peers, the
 *    Fractionals directory and every list, no email to them (lib/email.ts) but the one with the
 *    restore link, a join with their address refused while closed;
 *  - restore: by the emailed link within 30 days (signed in again, everything as it was), by an
 *    admin, never after the 30 days, a wrong or used key does nothing;
 *  - the scheduled delete after 30 days (lib/jobs.ts runDueJobs, purgeDue): profile, the LinkedIn
 *    import, network, the messages they wrote, proposals and documents, the AI usage log, saved
 *    views, plans for a way in (State.routes; the anonymous routeStats stay) and the rest go;
 *    facts they added to companies stay with no attribution; another member's data untouched;
 *    not before day 30; counts only in the log;
 *  - the Terms, the Privacy Policy, the data page and docs/data-flows.md say the same;
 *  - the home page's note after closing (?closed=1) and for an expired restore link (?restore=gone).
 * In process, on a made-up seed; email to a fake endpoint, fetch replaced.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-closure-"));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

const co = (id: string, name: string) => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } });
const companies = [co("c_acme", "Acme Robotics"), co("c_birch", "Birchway Health")];
const engagements = [
  { id: "e_ana_acme", companyId: "c_acme", verified: false, fields: { source: "Member success story", operator: "Ana Ruiz", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } },
  { id: "e_theo_birch", companyId: "c_birch", verified: false, fields: { source: "Member success story", operator: "Theo Park", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2024-01", status: "Active", end: "Ongoing" } },
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}@example.com`, title, token: `tok-${id}` });
const members = [M("mem_ana", "Ana Ruiz", "Fractional VP Sales"), M("mem_theo", "Theo Park", "Fractional CMO"), M("mem_admin", "Ada Admin", "Admin")];
members[2].email = "admin-closure@example.com";
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: ago(30 * DAY), members, companies, engagements, contacts: [] }));

const ICP = { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] };
const prof = (fn: string, title: string) => ({ onboarded: true, function: fn, title, fractionals: true, icp: ICP });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [{ memberId: "mem_ana", delta: 1, reason: "fill", ref: "c_birch.linkedin", at: ago(2 * DAY) }],
    // Ana added Birchway's LinkedIn: a fact that stays after her data goes.
    values: { "c_birch.linkedin": { value: "https://www.linkedin.com/company/birchway-health", by: "mem_ana", at: ago(2 * DAY), status: "live" } },
    unlocks: { "c_acme.identity": ["mem_ana", "mem_theo"], "c_birch.identity": ["mem_ana", "mem_theo"], "c_birch.linkedin": ["mem_theo"] },
    seen: { mem_ana: ago(HOUR), mem_theo: ago(HOUR), mem_admin: ago(HOUR) },
    profiles: { mem_ana: prof("Sales", "Fractional VP Sales"), mem_theo: prof("Marketing", "Fractional CMO"), mem_admin: { onboarded: true } },
    members: [],
    paths: { mem_ana: { linkedin: { at: ago(DAY), skipped: 0, rows: [{ f: "Theo", l: "Park", e: "mem_theo@example.com" }] } }, mem_theo: { linkedin: { at: ago(DAY), skipped: 0, rows: [{ f: "Ana", l: "Ruiz" }] } } },
    conversations: [
      {
        id: "cv_anatheo", a: "mem_ana", b: "mem_theo", about: { companyId: "", engagementId: "" }, kind: "partners",
        messages: [{ id: "m1", by: "mem_ana", at: ago(3 * DAY), text: "Hi Theo, a secret plan." }, { id: "m2", by: "mem_theo", at: ago(2 * DAY), text: "Hi Ana, sounds good." }],
        readAt: { a: ago(DAY), b: ago(DAY) }, status: "open", createdAt: ago(3 * DAY),
      },
    ],
    proposals: [{ id: "pr_ana", memberId: "mem_ana", companyId: null, companyPub: null, companyName: "Acme Robotics", templateId: null, title: "Ana's proposal", blocks: [], fields: {}, sources: {}, notes: [], signerOnCall: null, signer: null, version: 1, createdAt: ago(DAY), updatedAt: ago(DAY), sends: [] }],
    aiUsage: { mem_ana: { month: "2026-11", usedMicros: 5, packMicros: 0, log: [{ at: ago(DAY), inTok: 1, outTok: 1, micros: 5 }] } },
    aiDrafts: { mem_ana: ago(DAY) },
    connector: { clients: [], grants: [], alerts: { mem_ana: [{ id: "sv1", name: "Sales at SaaS", function: "Sales", createdAt: ago(DAY) }], mem_theo: [{ id: "sv2", name: "CMO seats", function: "Marketing", createdAt: ago(DAY) }] } },
    myTemplates: { mem_ana: [{ id: "mt_aaaaaaaaaaaa", title: "Ana's SOW", fileName: "sow.md", kind: "md", blocks: [], createdAt: ago(DAY) }] },
    pipeline: { mem_ana: { entries: [], intros: [] } },
    network: { mem_ana: { claude: { at: ago(DAY), companies: [] } } },
    // Your way in (lib/paths/plan.ts): a plan each, hop ids only; and the anonymous counts, which no member is in.
    routes: {
      mem_ana: { c_acme: { route: "r00000000000000aa", hops: ["h00000000000000a1"], at: ago(DAY), step: 1, steps: 3, planB: null, est: 40, log: [{ at: ago(DAY), k: "chose", r: "r00000000000000aa" }], outcomes: [] } },
      mem_theo: { c_birch: { route: "r00000000000000bb", hops: ["h00000000000000b1"], at: ago(DAY), step: 1, steps: 3, planB: null, est: 35, log: [{ at: ago(DAY), k: "chose", r: "r00000000000000bb" }], outcomes: [] } },
    },
    routeStats: { "h1|Good|d1|e40": { intro: 2, noreply: 1 } },
  }),
);

const mails: { to: string; subject: string; text: string; html: string }[] = [];
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-closure@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RESEND_API_KEY: "re_test_closure",
  RN_EMAIL_FROM: "Merlin <merlin@example.com>",
  RN_EMAIL_API_URL: "https://mail.example.test/emails",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_FREE_COMPANY", "RN_GOOGLE", "RN_BILLING", "RN_OWNSITES"]) delete process.env[k];
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  if (String(url) === "https://mail.example.test/emails") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to?.[0], subject: b.subject, text: b.text, html: b.html });
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  const t = await import("../lib/table");
  const A = await import("../lib/account");
  const E = await import("../lib/email");
  const S = await import("../lib/signin");
  const peers = await import("../lib/peers");
  const { fractionalsView } = await import("../lib/fractionals");
  const pub = t.tableInternals.pubId;
  const BASE = "https://post.example.com";
  const keyOf = (text: string) => /restore\?k=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
  const refusedMsg = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);

  console.log("\nBefore");
  check("Ana is in Theo's Peers and the directory", JSON.stringify(await peers.peersView("tok-mem_theo")).includes("Ana") && JSON.stringify(await fractionalsView("tok-mem_theo")).includes("Ana Ruiz"));

  console.log("\nClose");
  const r = await A.closeAccount("tok-mem_ana", { origin: BASE });
  const s1 = await t.loadState();
  const c = s1.closures!.mem_ana;
  check("closed now, with its 30 days", !!c && c.by === "member" && Math.round((Date.parse(c.purgeAt) - Date.parse(c.at)) / DAY) === 30 && /closed/.test(r.message), { c, r });
  check("signed out at once: the old token works nowhere", (await t.memberForToken("tok-mem_ana")) === null && (await refusedMsg(t.buildView("tok-mem_ana", { fresh: true }).then((v) => (v.me ? "in" : Promise.reject(new Error("out")))))) !== null);
  check("the closure keeps no address or name, only hashes", !JSON.stringify(c).includes("@") && !JSON.stringify(c).includes("Ana") && /^[0-9a-f]{64}$/.test(c.mail ?? "") && /^[0-9a-f]{64}$/.test(c.restore ?? ""));
  const closeMail = mails.find((m) => m.to === "mem_ana@example.com");
  const key = keyOf(closeMail?.text ?? "");
  check("one email to her, with the restore link and its day", mails.length === 1 && !!closeMail && closeMail.subject === "Your Merlin account is closed" && key.length > 20 && closeMail.text.includes(`${BASE}/api/account/restore?k=`), mails);
  check("out of Theo's Peers and the Fractionals directory", !JSON.stringify(await peers.peersView("tok-mem_theo")).includes("Ana") && !JSON.stringify(await fractionalsView("tok-mem_theo")).includes("Ana Ruiz"));
  check("out of every list: the member index leaves her out", !t.tableInternals.memberIndex(await t.loadSeed(), s1).byId.has("mem_ana"));
  const before = mails.length;
  check("no email goes to her address after it", E.mailBlocked("mem_ana@example.com") && E.mailBlocked("MEM_ANA@example.com") && !E.mailBlocked("mem_theo@example.com") && (await E.sendEmail("mem_ana@example.com", "x", "x", "<p>x</p>")) === false && mails.length === before);
  check("  a sign-in code or link for her opens nothing", (await S.redeemCode("mem_ana@example.com", "123456")) === null);
  check("  joining again with her address is refused while it is closed", (await refusedMsg(t.joinMember("Ana Ruiz", "mem_ana@example.com"))) === t.ACCOUNT_CLOSED_JOIN);
  check("a wrong restore key does nothing", (await A.restoreByLink("x".repeat(32))) === null && !!(await t.loadState()).closures?.mem_ana);

  console.log("\nRestore by the link");
  const back = await A.restoreByLink(key);
  check("the link brings it back and signs her in with a new token", !!back && back.id === "mem_ana" && back.token !== "tok-mem_ana" && (await t.memberForToken(back.token))?.id === "mem_ana" && !(await t.loadState()).closures?.mem_ana);
  check("  and her plans for a way in, kept while it was closed", !!(await t.loadState()).routes?.mem_ana?.c_acme);
  check("everything as it was: profile, proposal, template, saved view, messages", !!(await t.loadState()).profiles.mem_ana && (await t.loadState()).proposals!.some((p) => p.memberId === "mem_ana") && !!(await t.loadState()).myTemplates?.mem_ana?.length && (await t.loadState()).conversations![0].messages.length === 2);
  check("emails reach her again, and she is back in Peers", !E.mailBlocked("mem_ana@example.com") && JSON.stringify(await peers.peersView("tok-mem_theo")).includes("Ana"));
  check("the link works once", (await A.restoreByLink(key)) === null);

  console.log("\nRestore by an admin");
  await A.closeAccount(back!.token, { origin: BASE });
  check("not by a member", (await refusedMsg(A.adminRestore("tok-mem_theo", pub("mem_ana")))) === "Only admins can restore an account.");
  const list = await A.closedAccounts("tok-mem_admin");
  check("Pilot metrics lists it for admins only", list.length === 1 && list[0].name === "Ana Ruiz" && !list[0].purged && (await refusedMsg(A.closedAccounts("tok-mem_theo"))) !== null);
  check("an admin brings it back", /is back/.test((await A.adminRestore("tok-mem_admin", pub("mem_ana"))).message) && !(await t.loadState()).closures?.mem_ana);
  const adminSeen = await A.closeAccount("tok-mem_admin", { origin: BASE, memberId: pub("mem_theo") }).then((x) => x, (e: Error) => e);
  check("an admin can close another member's too", !(adminSeen instanceof Error) && (await t.loadState()).closures?.mem_theo?.by === "admin");
  await A.adminRestore("tok-mem_admin", pub("mem_theo"));
  // Closing changed Theo's token: he signs in again with the new one.
  const theoTok = (await t.memberByEmail("mem_theo@example.com"))!.token;
  check("  restored, he signs in with his new token, the old one stays dead", theoTok !== "tok-mem_theo" && (await t.memberForToken(theoTok))?.id === "mem_theo" && (await t.memberForToken("tok-mem_theo")) === null);

  console.log("\nAfter 30 days");
  const anaTok = (await t.memberByEmail("mem_ana@example.com"))!.token;
  const closed = await A.closeAccount(anaTok, { origin: BASE });
  const closedAt = Date.parse((await t.loadState()).closures!.mem_ana.at);
  const keyLast = keyOf(mails.at(-1)!.text);
  check("not before day 30: nothing is deleted", (await A.purgeDue(closedAt + 29 * DAY)) === 0 && !!(await t.loadState()).profiles.mem_ana);
  const logs: string[] = [];
  const realLog = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  const J = await import("../lib/jobs");
  await J.runDueJobs(BASE, closedAt + 30 * DAY + HOUR);
  console.log = realLog;
  const s2 = await t.loadState();
  check("the job scheduler's tick deletes it after 30 days", !!s2.closures?.mem_ana?.purgedAt, s2.closures);
  check("  its log line has counts only", logs.some((l) => /^Deleted the personal data of 1 account closed 30 days ago\.$/.test(l)) && !logs.some((l) => /Ana|mem_ana|@/.test(l)), logs);
  check("profile, LinkedIn import, network, AI usage log and agreement, saved views, templates, pipeline: gone", !s2.profiles.mem_ana && !(s2 as { paths?: Record<string, unknown> }).paths?.mem_ana && !s2.network?.mem_ana && !s2.aiUsage?.mem_ana && !s2.aiDrafts?.mem_ana && !s2.connector!.alerts.mem_ana && !s2.myTemplates?.mem_ana && !s2.pipeline?.mem_ana);
  check("her plans for a way in (State.routes): gone; Theo's stay, and the anonymous counts are untouched", !s2.routes?.mem_ana && !!s2.routes?.mem_theo?.c_birch && JSON.stringify(s2.routeStats) === JSON.stringify({ "h1|Good|d1|e40": { intro: 2, noreply: 1 } }), { routes: s2.routes, stats: s2.routeStats });
  check("proposals and documents: gone", !s2.proposals!.some((p) => p.memberId === "mem_ana") && !(s2.documents ?? []).some((d) => d.memberId === "mem_ana"));
  check("the messages she wrote: gone; Theo's reply stays", s2.conversations![0].messages.length === 1 && s2.conversations![0].messages[0].by === "mem_theo" && !JSON.stringify(s2).includes("a secret plan"));
  check("her credits history and unlocks: gone", !s2.ledger.some((l) => l.memberId === "mem_ana") && !Object.values(s2.unlocks).some((l) => l.includes("mem_ana")));
  const v = s2.values["c_birch.linkedin"];
  check("the fact she added stays, attributed to nobody", v?.status === "live" && v.value.includes("birchway-health") && v.by === t.FORMER_MEMBER);
  check("  and Theo still sees it", JSON.stringify((await t.buildView(theoTok, { fresh: true })).companies.find((x) => x.name === "Birchway Health")).includes("birchway-health"));
  check("Theo's own data untouched", !!s2.profiles.mem_theo && !!s2.connector!.alerts.mem_theo && !!(s2 as { paths?: Record<string, unknown> }).paths?.mem_theo);
  check("no trace of her address or her name in the state", !JSON.stringify(s2).includes("mem_ana@example.com") && !JSON.stringify(s2.closures).includes("Ana"));
  check("it can't come back after: not by the link, not by an admin", (await A.restoreByLink(keyLast)) === null && /can't come back|isn't closed/.test((await refusedMsg(A.adminRestore("tok-mem_admin", pub("mem_ana")))) ?? ""));
  check("Pilot metrics shows it deleted, with no name", (await A.closedAccounts("tok-mem_admin")).some((x) => x.purged && x.name === ""));
  check("(the close said when)", /until/.test(closed.message));

  console.log("\nThe words");
  const terms = src("app/terms/Terms.tsx");
  const privacy = src("app/privacy/Privacy.tsx");
  const data = src("app/data/DataFlows.tsx");
  const doc = src("docs/data-flows.md");
  check("Terms: Close my account, at once, 30 days to bring it back, then deleted", /Close my account, on Your credits, closes your account at once/.test(terms) && /For 30 days you can bring it back/.test(terms) && /After 30 days Merlin deletes your personal data/.test(terms));
  check("Privacy Policy: what goes after 30 days and that facts stay without your name", /After 30 days Merlin deletes your personal data: your profile/.test(privacy) && /Facts\s+you added to companies stay, with your name taken off/.test(privacy) && !/there is no button for this yet/.test(privacy));
  check("the data page and docs/data-flows.md say the same", /Close my account, on Your credits/.test(data) && /can be brought back for 30 days/.test(data) && /purgeMember/.test(doc) && /After 30 days/.test(doc) && !/there is no in-app button today/.test(doc));
  const ui = src("app/post/Settings.tsx");
  check("the confirmation says what happens now, in 30 days and to a plan, and focuses Keep my account", ui.includes("Your account closes now") && ui.includes("After 30 days Merlin deletes your personal data") && ui.includes("A paid plan stops renewing") && /autoFocus onClick=\{\(\) => setAsking\(false\)\}>\s*Keep my account/.test(ui));

  console.log("\nThe notes on the home page");
  const C = await import("../app/landing/contact");
  check("?closed=1: the account is closed, and the 30 days to restore it", C.accountNoteOf("?closed=1") === "Your account is closed. You can restore it within 30 days from the link we emailed you." && C.accountNoteOf("?p=today&closed=1") === C.ACCOUNT_NOTES.closed);
  check("?restore=gone: the restore link has expired", C.accountNoteOf("?restore=gone") === "That restore link has expired.");
  check("any other address: no note", C.accountNoteOf("") === null && C.accountNoteOf("?closed=0") === null && C.accountNoteOf("?restore=1") === null && C.accountNoteOf("?restored=1") === null);
  check("Close my account opens the home page at ?closed=1", /window\.location\.assign\("\/\?closed=1"\)/.test(ui));
  const { GET: restoreGet } = await import("../app/api/account/restore/route");
  const { NextRequest } = await import("next/server");
  const gone = await restoreGet(new NextRequest(`${BASE}/api/account/restore?k=${"y".repeat(32)}`, { headers: { "x-forwarded-for": "203.0.113.9" } }));
  check("a restore link that no longer works opens the home page at ?restore=gone, signed out", gone.status === 303 && /\/\?restore=gone$/.test(gone.headers.get("location") ?? "") && !gone.cookies.get("rn_table"), [gone.status, gone.headers.get("location")]);
  const landing = src("app/landing/Landing.tsx");
  check("the landing page draws the note in the design system's sand Callout, as a status, above the hero", /accountNoteOf\(window\.location\.search\)/.test(landing) && /<Callout tone="sand" role="status" className="lp-account-note">\s*\{accountNote\}\s*<\/Callout>/.test(landing) && landing.indexOf("lp-account-note") < landing.indexOf("lp-h1") && /\.lp-account-note \{/.test(src("app/landing/landing.css")));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
