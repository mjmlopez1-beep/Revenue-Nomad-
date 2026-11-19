/**
 * Checks of the invite loop: the inviter hears when a friend joins from their invite, once, and
 * the invitee's onboarding says who invited them (lib/table.ts announceJoin, lib/notify/joined.ts).
 *
 *   npx tsx scripts/test-invites.mts
 *
 * No private data and no network: a made-up seed, state and seed key in a temporary folder,
 * removed at the end, and fetch replaced, so every Slack post and email that would go out is
 * caught here. Every person in them is made up. The clock moves forward past the short wait
 * after a friend's first visit (JOIN_SETTLE_MS).
 *
 *  1. The words: the inviter's line, the invitee's line, the alert, the email.
 *  2. A friend joins through ?ref=: told after their first visit and the wait, never before, in the
 *     app, in Slack, and by email when email is on and their message emails are on. Once per
 *     invitee. No email address of the invitee in any of it. Closing the line keeps it closed.
 *  3. REFERRAL_LIMIT: past it, nobody promises the inviter a bonus.
 *  4. A friend who claims their seat through the inviter's claim link: Invite to connect tells the
 *     inviter, so the join notice doesn't go a second time.
 *  5. The invitee's onboarding mention (Me.invitedBy), gone once their bonus is paid.
 */
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const TEST_KEY = Buffer.alloc(32, 9).toString("base64");
const claimTok = (id: string) => createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`claim:${id}`).digest("base64url").slice(0, 22);
const dir = mkdtempSync(path.join(tmpdir(), "rn-invites-"));
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_ivy", name: "Ivy Inviter", email: "ivy.inviter@example.com", title: "Fractional VP Sales", token: "tok-ivy-0001" },
    { id: "mem_lim", name: "Lim Limitreached", email: "lim.limit@example.com", title: "Fractional CMO", token: "tok-lim-0001" },
  ],
  companies: [
    { id: "c_inv", fields: { name: "Invitewell Labs", website: "invitewell.example", industry: "SaaS", employees: "51–200" } },
    { id: "c_claim", fields: { name: "Claimpoint Systems", website: "claimpoint.example", industry: "SaaS" } },
  ],
  engagements: [
    { id: "e_inv_cfo", companyId: "c_inv", fields: { source: "Published engagement", function: "Finance", role: "Fractional CFO", start: "2025-03", status: "Active", type: "Fractional" } },
    {
      id: "e_claim_cora",
      companyId: "c_claim",
      fields: { source: "Seat scan", function: "Marketing", role: "Fractional CMO", start: "2025-01", status: "Active", end: "Ongoing", type: "Fractional", operator: "Cora Claimer" },
      holderFrom: "public profile",
      verified: false,
    },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const at0 = ago(DAY);
// Lim was paid for 5 invitees in the last 30 days: REFERRAL_LIMIT is reached. Ivy sent Cora's seat its claim link (Invite to connect).
const limPaid = Array.from({ length: 5 }, (_, i) => ({ memberId: "mem_lim", delta: 10, reason: "referral", ref: `j_old${i}.referral`, at: ago((i + 1) * DAY) }));
const SLACK = "https://hooks.slack.com/services/" + "T0009TEST/B0009TEST/ivyivyivyivyivyivyivyIVY";
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: limPaid,
    values: {},
    // Ivy unlocked Claimpoint Systems before (every company is locked for a member until they unlock it or know it), where she invited Cora to connect.
    unlocks: { "c_claim.identity": ["mem_ivy"] },
    seen: { mem_ivy: at0, mem_lim: at0 },
    profiles: { mem_ivy: { function: "Sales", onboarded: true }, mem_lim: { function: "Marketing", onboarded: true } },
    seatInvites: [{ by: "mem_ivy", engagementId: "e_claim_cora", at: at0 }],
    integrations: {
      members: { mem_ivy: { slack: { kind: "slack", url: SLACK, addedAt: at0 }, alerts: { roles: true, message: true, seat: true }, lastSent: {}, pending: {} } },
      stats: { sent: {}, failed: 0, connects: 1, removes: 0 },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_EMAIL_API_URL", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_UNVERIFIED_NAMES_UNTIL"]) delete process.env[k];

/* ---------- the network, replaced: Slack posts and emails are caught ---------- */
type Post = { url: string; body: Record<string, unknown> };
const posts: Post[] = [];
const mails: { to: string; subject: string; text: string; html: string }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url === "https://api.resend.com/emails") mails.push({ to: body.to[0], subject: body.subject, text: body.text, html: body.html });
  else posts.push({ url, body });
  return new Response(url.includes("slack.com") ? "ok" : "{}", { status: 200 });
}) as typeof fetch;
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** No join post or email is lost to the 15-minute batch window: each step starts in a new one. */
const nextWindow = () => (skew += 16 * 60 * 1000);

async function main() {
  const t = await import("../lib/table.ts");
  const n = await import("../lib/notify/index.ts");
  const fmt = await import("../lib/notify/format.ts");
  const joinedMod = await import("../lib/notify/joined.ts");
  const { REFERRAL_BONUS } = await import("../lib/tableFields.ts");
  const pub = t.tableInternals.pubId;
  const IVY = "tok-ivy-0001";
  const LIM = "tok-lim-0001";
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await wait(20);
      await n.settled();
    }
  };
  const joinsIn = async () => (await t.loadState()).inviteJoins ?? [];
  const pastWait = () => (skew += t.JOIN_SETTLE_MS + 1000);
  const slackText = (p: Post) => JSON.stringify(p.body);
  const toIvy = () => posts.filter((p) => p.url === SLACK);

  /* ---------- 1. the words ---------- */
  console.log("\nThe words");
  check("one friend, with the bonus", fmt.joinedLine([{ first: "Sam", both: true }], 10) === "Sam joined Merlin from your invite. You both get 10 credits when Sam adds a first fact.");
  check("past the limit, no bonus is promised", fmt.joinedLine([{ first: "Sam", both: false }], 10) === "Sam joined Merlin from your invite.");
  check("two friends", fmt.joinedLine([{ first: "Sam", both: true }, { first: "Ana", both: true }], 10) === "Sam and Ana joined Merlin from your invite. Each time one of them adds a first fact, you both get 10 credits.");
  check("five friends, three named", fmt.joinedLine(["Sam", "Ana", "Raj", "Lou", "Kim"].map((first) => ({ first, both: false })), 10) === "Sam, Ana, Raj and 2 others joined Merlin from your invite.");
  check("the invitee's line", fmt.invitedLine("Ivy", true, 10) === "Ivy invited you. You both get 10 credits when you add your first fact." && fmt.invitedLine("Lim", false, 10) === "Lim invited you. You get 10 credits when you add your first fact.");
  check("its first sentence is apart, for bold", JSON.stringify(fmt.invitedParts("Ivy", true, 10)) === JSON.stringify(["Ivy invited you.", "You both get 10 credits when you add your first fact."]));
  const one = fmt.alertFor([{ kind: "message", at: ago(0), conversationId: "", from: "Sam", company: "", holder: false, snippet: "", about: "joined", bonus: 10 }], "https://post.example.com");
  check("the alert: who joined, the bonus, and a link to Merlin (no conversation)", one?.headline === "Sam joined Merlin from your invite" && one.lines.join() === "You both get 10 credits when Sam adds a first fact." && one.url === "https://post.example.com/", one);
  const mixed = fmt.alertFor(
    [
      { kind: "message", at: ago(0), conversationId: "cv1", from: "Hana", company: "Acme", holder: true, snippet: "Hi there", about: undefined },
      { kind: "message", at: ago(0), conversationId: "", from: "Sam", company: "", holder: false, snippet: "", about: "joined", bonus: 10 },
      { kind: "message", at: ago(0), conversationId: "", from: "Ana", company: "", holder: false, snippet: "", about: "joined", bonus: 10 },
    ],
    "https://post.example.com",
  );
  check("in a batch with a message, the message leads and the friends who joined take one last line", mixed?.headline === "1 new message on Merlin" && mixed.lines.length === 2 && mixed.lines[1] === "Sam and Ana joined Merlin from your invite. Each time one of them adds a first fact, you both get 10 credits." && mixed.count === 3, mixed);
  const twoJoins = fmt.alertFor(
    [
      { kind: "message", at: ago(0), conversationId: "", from: "Sam", company: "", holder: false, snippet: "", about: "joined" },
      { kind: "message", at: ago(0), conversationId: "", from: "Ana", company: "", holder: false, snippet: "", about: "joined" },
    ],
    "https://post.example.com",
  );
  check("two friends in one batch", twoJoins?.headline === "2 fractionals joined Merlin from your invite" && twoJoins.lines.join() === "Sam and Ana joined Merlin from your invite.", twoJoins);
  const mail = joinedMod.joinedEmail({ first: "Sam", both: true, bonus: 10, link: "https://post.example.com/?k=oX" });
  check("the email: subject, the bonus and the one-time link", mail.subject === "Sam joined Merlin from your invite" && mail.text.includes("You both get 10 credits when Sam adds a first fact.") && mail.text.includes("https://post.example.com/?k=oX") && mail.html.includes("Open Merlin"));
  check("the words follow the voice: no colons or em dashes in running copy", ![fmt.joinedLine([{ first: "Sam", both: true }], 10), fmt.invitedLine("Ivy", true, 10), mail.subject].some((x) => /—|[a-z]: /i.test(x)));

  /* ---------- 2. a friend joins through ?ref= ---------- */
  console.log("\nA friend joins from the invite");
  const ivyCode = t.inviteCode("mem_ivy");
  // Ivy's own network: a join from it is most likely Ivy with a second email, so it is no invite.
  await t.touch(IVY, "10.40.0.1");
  const self = await t.joinMember("Ivy Twotimes", "ivy.second@example.com", ivyCode, "10.40.0.1");
  check("a join from the inviter's own network makes no invite to tell about", !(await joinsIn()).some((j) => j.invitee === self.id));
  const sam = await t.joinMember("Sam Seller", "sam.seller@example.com", ivyCode, "10.40.1.1");
  const samJoin = (await joinsIn()).find((j) => j.invitee === sam.id);
  check("a join through the invite code is kept, once, for the inviter", !!samJoin && samJoin.by === "mem_ivy" && !samJoin.in && !samJoin.told && (await joinsIn()).filter((j) => j.invitee === sam.id).length === 1, samJoin);
  check("nothing is told before the friend has been in", (await t.announceJoin(sam.id)) === null && !(await t.buildView(IVY)).me?.joined);
  await t.touch(sam.token, "10.40.1.1");
  const samIn = (await joinsIn()).find((j) => j.invitee === sam.id);
  check("their first visit signed in starts the wait", !!samIn?.in && !samIn.told, samIn);
  check("nothing goes in the short wait after it (a claim through the inviter's link may follow)", (await t.announceJoin(sam.id)) === null && toIvy().length === 0);
  pastWait();
  nextWindow();
  const news = await t.announceJoin(sam.id);
  await settle();
  check("after it the inviter is told: who, and that they both get the bonus", news?.inviterId === "mem_ivy" && news.first === "Sam" && news.both === true, news);
  const samPosts = toIvy();
  check("Slack gets one post: Sam joined Merlin from your invite, with the bonus line", samPosts.length === 1 && slackText(samPosts[0]).includes("Sam joined Merlin from your invite") && slackText(samPosts[0]).includes(`You both get ${REFERRAL_BONUS} credits when Sam adds a first fact.`), samPosts.map(slackText));
  check("with email off, no email", mails.length === 0);
  const ivyView = await t.buildView(IVY);
  check("the app shows the inviter the line: first name only", ivyView.me?.joined?.length === 1 && ivyView.me.joined[0].first === "Sam" && ivyView.me.joined[0].id === pub(sam.id) && ivyView.me.joined[0].both === true, ivyView.me?.joined);
  check("no email address of the invitee in the view, the post or the notice", !JSON.stringify(ivyView).includes("sam.seller@example.com") && !samPosts.some((p) => slackText(p).includes("sam.seller")) && !JSON.stringify(news).includes("sam.seller"));
  check("and never the invitee's last name", !JSON.stringify(ivyView.me?.joined).includes("Seller") && !samPosts.some((p) => slackText(p).includes("Seller")));

  console.log("\nOnce per invitee");
  check("a second turn tells nobody again", (await t.announceJoin(sam.id)) === null);
  nextWindow();
  await t.touch(sam.token, "10.40.1.2");
  await t.touch(IVY, "10.40.0.2");
  await wait(500);
  await settle();
  check("nor do more visits, by either of them", toIvy().length === 1 && mails.length === 0, toIvy().length);
  const other = await t.perform(LIM, { type: "joinedSeen", ids: [pub(sam.id)] }, "https://post.example.com");
  check("another member can't close Ivy's line", other.message === "" && (await t.buildView(IVY)).me?.joined?.length === 1);
  await t.perform(IVY, { type: "joinedSeen", ids: [pub(sam.id)] }, "https://post.example.com");
  check("closing it takes it off, for good", !(await t.buildView(IVY)).me?.joined && (await joinsIn()).find((j) => j.invitee === sam.id)?.seen !== undefined);
  await t.touch(IVY, "10.40.0.3");
  check("a later visit doesn't bring it back", !(await t.buildView(IVY)).me?.joined);

  console.log("\nThe wait runs on its own");
  const ana = await t.joinMember("Ana Afterwait", "ana.afterwait@example.com", ivyCode, "10.40.2.1");
  await t.touch(ana.token, "10.40.2.1");
  pastWait();
  nextWindow();
  // A visit after the wait (here the inviter's) gives the join its turn at once; the friend's own first visit set the timer for later.
  await t.touch(IVY, "10.40.0.4");
  await wait(700);
  await settle();
  check("once the wait is over the next visit tells the inviter, without anyone asking", (await joinsIn()).find((j) => j.invitee === ana.id)?.told !== undefined && toIvy().some((p) => slackText(p).includes("Ana joined Merlin from your invite")), toIvy().map(slackText));

  console.log("\nWith email on");
  Object.assign(process.env, { RESEND_API_KEY: "test-key", RN_EMAIL_FROM: "Merlin <post@example.com>" });
  const eve = await t.joinMember("Eve Emailer", "eve.emailer@example.com", ivyCode, "10.40.3.1");
  await t.touch(eve.token, "10.40.3.1");
  pastWait();
  nextWindow();
  await t.announceJoin(eve.id);
  await settle();
  const eveMail = mails.filter((m) => m.subject === "Eve joined Merlin from your invite");
  check("the inviter gets one email", eveMail.length === 1 && eveMail[0].to === "ivy.inviter@example.com", mails.map((m) => m.subject));
  check("with the bonus line and a link that signs them in once", eveMail[0]?.text.includes(`You both get ${REFERRAL_BONUS} credits when Eve adds a first fact.`) && /https:\/\/post\.example\.com\/\?k=o[A-Za-z0-9_-]{32}/.test(eveMail[0]?.text ?? ""), eveMail[0]?.text);
  check("never the invitee's email address", !eveMail.some((m) => (m.text + m.html).includes("eve.emailer")));
  check("Slack gets it too", toIvy().some((p) => slackText(p).includes("Eve joined Merlin from your invite")));
  await t.perform(IVY, { type: "settings", messageEmail: false }, "https://post.example.com");
  const fay = await t.joinMember("Fay Quietmail", "fay.quiet@example.com", ivyCode, "10.40.4.1");
  await t.touch(fay.token, "10.40.4.1");
  pastWait();
  nextWindow();
  await t.announceJoin(fay.id);
  await settle();
  check("with message emails off, no email, and Slack still gets it", !mails.some((m) => m.subject.startsWith("Fay")) && toIvy().some((p) => slackText(p).includes("Fay joined Merlin from your invite")));
  await t.perform(IVY, { type: "settings", messageEmail: true }, "https://post.example.com");
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM"]) delete process.env[k];

  /* ---------- 3. REFERRAL_LIMIT ---------- */
  console.log("\nPast REFERRAL_LIMIT");
  const rae = await t.joinMember("Rae Reached", "rae.reached@example.com", t.inviteCode("mem_lim"), "10.40.5.1");
  const raeView = await t.buildView(rae.token);
  check("the invitee is told only their own bonus", raeView.me?.invitedBy?.first === "Lim" && raeView.me.invitedBy.both === false, raeView.me?.invitedBy);
  await t.touch(rae.token, "10.40.5.1");
  pastWait();
  const raeNews = await t.announceJoin(rae.id);
  const limView = await t.buildView(LIM);
  check("and the inviter is promised no bonus", raeNews?.both === false && limView.me?.joined?.[0]?.both === false && fmt.joinedLine(limView.me!.joined!, REFERRAL_BONUS) === "Rae joined Merlin from your invite.", limView.me?.joined);

  /* ---------- 4. a claim through the inviter's claim link ---------- */
  console.log("\nA claim through the inviter's claim link");
  nextWindow();
  const before = toIvy().length;
  const cora = await t.joinMember("Cora Claimer", "cora.claimer@example.com", ivyCode, "10.40.6.1");
  const claimed = await t.claimByToken(cora.token, claimTok("e_claim_cora"), "https://post.example.com", ivyCode);
  await settle();
  const afterClaim = toIvy().slice(before);
  check("the claim connects them, and Invite to connect tells the inviter", !claimed.waiting && afterClaim.length === 1 && slackText(afterClaim[0]).includes("Cora claimed their seat at Claimpoint Systems through your invite"), afterClaim.map(slackText));
  await t.touch(cora.token, "10.40.6.1");
  pastWait();
  nextWindow();
  check("so the join notice doesn't go a second time", (await t.announceJoin(cora.id)) === null && (await joinsIn()).find((j) => j.invitee === cora.id)?.skip === "connect");
  await settle();
  check("no second post, and no line in the app", toIvy().slice(before).length === 1 && !(await t.buildView(IVY)).me?.joined?.some((j) => j.first === "Cora"));

  /* ---------- 5. the invitee's onboarding mention ---------- */
  console.log("\nThe invitee's onboarding");
  const dee = await t.joinMember("Dee Newcomer", "dee.newcomer@example.com", ivyCode, "10.40.7.1");
  const deeView = await t.buildView(dee.token);
  check("a new invitee is told who invited them, and that they both get the bonus", deeView.me?.invitedBy?.first === "Ivy" && deeView.me.invitedBy.both === true && deeView.me.onboarded === false, deeView.me?.invitedBy);
  check("onboarding's line reads", fmt.invitedLine(deeView.me!.invitedBy!.first, deeView.me!.invitedBy!.both, REFERRAL_BONUS) === "Ivy invited you. You both get 10 credits when you add your first fact.");
  check("it names the inviter by first name, never their email", !JSON.stringify(deeView.me?.invitedBy).includes("ivy.inviter") && !JSON.stringify(deeView.me?.invitedBy).includes("Inviter"));
  // Her first fact: a client of hers she adds (every company on file is locked for her until she unlocks it or knows it).
  const fill = await t.perform(dee.token, { type: "add", company: "Deeclient Works", companyFields: { hq: "Austin, TX" } }, "https://post.example.com");
  const deeAfter = await t.buildView(dee.token);
  check("once their first fact pays the bonus, the mention is gone", /invite bonus/.test(fill.message) && !deeAfter.me?.invitedBy && deeAfter.me?.invitePending === false, fill.message);
  const ivyHad = await t.buildView(IVY);
  check("a member who joined on their own is told nothing", !(await t.buildView(self.token)).me?.invitedBy && !ivyHad.me?.joined?.some((j) => j.first === "Ivy"));
  const ivyLine = (await t.buildView(IVY)).me?.joined ?? [];
  check("the inviter's open lines never name anyone twice", new Set(ivyLine.map((j) => j.id)).size === ivyLine.length);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
