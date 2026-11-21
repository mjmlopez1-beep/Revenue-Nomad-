/**
 * Checks of messages between members (lib/messages.ts), without a server or a mailbox.
 *
 *   npx tsx scripts/test-messages.mjs
 *
 * It runs on a made-up seed in a temporary data dir, moves the clock forward where a rule is
 * about time (the daily limits, the hourly email), and replaces fetch so every email that would
 * go to the mail provider is caught instead. Nothing leaves the machine.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-messages-"));
const HOLDERS = 34;
const letters = (i) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const holderName = (i) => `Pat Holder${letters(i)}`;
const seed = {
  builtAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-0001" },
    { id: "mem_hana", name: "Hana Holder", email: "hana.holder@example.com", title: "Fractional CRO", token: "tok-hana-0001" },
    { id: "mem_nora", name: "Nora Neversigned", email: "nora@example.com", title: "Fractional CMO", token: "tok-nora-0001" },
    { id: "mem_ada", name: "Ada Admin", email: "ada.admin@example.com", title: "Founder", token: "tok-ada-0001" },
    ...Array.from({ length: HOLDERS }, (_, i) => ({ id: `mem_h${i}`, name: holderName(i), email: `holder${i}@example.com`, title: "Fractional VP Sales", token: `tok-h${i}-0001` })),
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example" } },
    { id: "c_many", fields: { name: "Many Company", website: "many.example" } },
  ],
  engagements: [
    { id: "e_acme_hana", companyId: "c_acme", fields: { source: "Published engagement", operator: "Hana Holder", role: "Fractional VP Sales", function: "Sales", start: "2023-01", end: "2024-06", status: "Ended" } },
    { id: "e_beta_hana", companyId: "c_beta", fields: { source: "Published engagement", operator: "Hana Holder", function: "Marketing", start: "2022-02", status: "Active" } },
    { id: "e_acme_nora", companyId: "c_acme", fields: { source: "Published engagement", operator: "Nora Neversigned", function: "Marketing" } },
    { id: "e_acme_sal", companyId: "c_acme", fields: { source: "Published engagement", operator: "Sal Starter", function: "Sales" } },
    { id: "e_acme_zed", companyId: "c_acme", fields: { source: "Published engagement", operator: "Zed Unknownperson", function: "RevOps" } },
    ...Array.from({ length: HOLDERS }, (_, i) => ({ id: `e_many_${i}`, companyId: "c_many", fields: { source: "Published engagement", operator: holderName(i), function: "Sales", start: "2024-01" } })),
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
// Sal already unlocked who held each of the many seats, and everyone but Nora has signed in.
const at0 = new Date().toISOString();
const unlocks = {};
for (let i = 0; i < HOLDERS; i++) unlocks[`e_many_${i}.operator`] = ["mem_sal"];
// And Beta Labs, before (every company is locked for a member until they unlock it or know it; who held a seat opens after it).
unlocks["c_beta.identity"] = ["mem_sal"];
const seen = { mem_sal: at0, mem_hana: at0, mem_ada: at0 };
for (let i = 0; i < HOLDERS; i++) seen[`mem_h${i}`] = at0;
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks, seen }));

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RESEND_API_KEY: "test-key",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_REPLY_TO: "hello@example.org",
});
for (const k of ["RN_EMAIL_API_URL", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];

/** Every email that would have gone out. */
const outbox = [];
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://api.resend.com/emails") return new Response("{}", { status: 404 });
  const mail = JSON.parse(String(init?.body ?? "{}"));
  outbox.push({ to: mail.to[0], subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.reply_to });
  return new Response("{}", { status: 200 });
};
/** The clock, moved forward by `skew` for the rules that count a day or an hour. */
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passes = 0;
let failures = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
};
const settle = () => new Promise((r) => setTimeout(r, 30));
const EMAILS = seed.members.map((m) => m.email);
const INTERNAL_IDS = ["mem_sal", "mem_hana", "mem_ada", "e_acme_hana", "c_acme", "tok-"];
const noSecrets = (x) => {
  const s = JSON.stringify(x);
  return !EMAILS.some((e) => s.includes(e)) && !INTERNAL_IDS.some((id) => s.includes(id));
};

async function main() {
  const t = await import("../lib/table");
  const msg = await import("../lib/messages");
  const pub = t.tableInternals.pubId;
  const SAL = "tok-sal-0001";
  const HANA = "tok-hana-0001";
  const ADA = "tok-ada-0001";
  const H = (i) => `tok-h${i}-0001`;
  const act = async (token, a) => {
    try {
      return { ok: true, ...(await t.perform(token, a, "https://post.example.com")) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };
  const list = async (token) => (await msg.listConversations(token)).conversations;

  /* ---------- who can write to whom ---------- */
  console.log("\nWho can write to whom");
  const hanaSeat = pub("e_acme_hana");
  const before = await act(SAL, { type: "message.start", engagementId: hanaSeat, text: "Hi Hana" });
  check("a seat holder who is still locked can't be messaged", !before.ok && /Unlock who held this seat first/.test(before.error), before);
  const own = await act(SAL, { type: "message.start", engagementId: pub("e_acme_sal"), text: "Hi me" });
  check("nobody messages themselves", !own.ok && /your own seat/.test(own.error), own);
  const un = await act(SAL, { type: "unlock", entity: "engagement", id: pub("e_acme_nora"), field: "operator" });
  const nora = await act(SAL, { type: "message.start", engagementId: pub("e_acme_nora"), text: "Hi Nora" });
  check("a seat holder who never signed in can't be messaged", un.ok && !nora.ok && /hasn't signed in/.test(nora.error), nora);
  await act(SAL, { type: "unlock", entity: "engagement", id: pub("e_acme_zed"), field: "operator" });
  const zed = await act(SAL, { type: "message.start", engagementId: pub("e_acme_zed"), text: "Hi Zed" });
  check("a seat holder who is not a member can't be messaged", !zed.ok && /Nobody on Merlin is linked/.test(zed.error), zed);
  const gone = await act(SAL, { type: "message.start", engagementId: "nope", text: "Hi" });
  check("a seat that isn't there is refused", !gone.ok, gone);

  const unlocked = await act(SAL, { type: "unlock", entity: "engagement", id: hanaSeat, field: "operator" });
  check("Sal unlocks who held the Acme seat", unlocked.ok, unlocked);
  const empty = await act(SAL, { type: "message.start", engagementId: hanaSeat, text: "   " });
  check("an empty message is refused", !empty.ok && empty.error === "Write a message first.", empty);
  const long = await act(SAL, { type: "message.start", engagementId: hanaSeat, text: "x".repeat(2001) });
  check("a message over 2,000 characters is refused", !long.ok && /2,000 characters/.test(long.error), long);
  const opener = "Hi Hana, I saw you held the Sales seat at Acme Robotics. I'm talking with them now and would love to hear how it went. ".repeat(3);
  const start = await act(SAL, { type: "message.start", engagementId: hanaSeat, text: opener });
  check("after unlocking, Sal starts a conversation", start.ok && start.conversation?.messages.length === 1 && start.conversation.started === true, start);
  check("the answer carries no email address and no internal id", noSecrets(start), JSON.stringify(start).slice(0, 300));
  const convId = start.conversation?.id;
  const salSees = start.conversation;
  // Who held a seat and their role are one purchase (SEAT_BUNDLE): unlocking the holder opened the role too.
  check("Sal sees the seat as far as he unlocked it (the role that came with who held it, start year)", salSees?.about.company === "Acme Robotics" && salSees.about.seat === "Fractional VP Sales" && salSees.about.years === "2023", salSees?.about);
  check("Sal sees Hana by name, never her email", salSees?.with.name === "Hana Holder" && salSees.with.first === "Hana" && !JSON.stringify(salSees).includes("hana.holder@"), salSees?.with);
  const exactly = await act(SAL, { type: "message.send", conversationId: convId, text: "y".repeat(2000) });
  check("2,000 characters is fine", exactly.ok, exactly);

  /* ---------- the seat holder's side ---------- */
  console.log("\nThe seat holder's side");
  await settle();
  const hv = await t.buildView(HANA);
  check("Hana's view counts one unread conversation", hv.me.unread === 1, hv.me.unread);
  const hl = await list(HANA);
  const hc = hl[0];
  check("Hana sees the conversation with the seat in full (her own seat)", hl.length === 1 && hc.started === false && hc.about.seat === "Fractional VP Sales" && hc.about.years === "2023 to 2024", hc?.about);
  check("Hana sees who wrote, by first name, and 2 unread", hc?.with.first === "Sal" && hc.unread === 2 && hc.messages.every((m) => !m.mine), { w: hc?.with, u: hc?.unread });
  check("the list carries no email address and no internal id", noSecrets(hl), JSON.stringify(hl).slice(0, 300));
  const other = await act(H(0), { type: "message.send", conversationId: convId, text: "Butting in" });
  check("a third member can't write into someone else's conversation", !other.ok && /isn't there anymore/.test(other.error), other);
  const otherRead = await act(H(0), { type: "message.report", conversationId: convId, messageId: hc.messages[0].id });
  check("or report in it", !otherRead.ok, otherRead);
  check("or see it in their list", (await list(H(0))).length === 0);
  const read = await act(HANA, { type: "message.read", conversationId: convId });
  check("reading it clears the unread count", read.ok && read.unread === 0 && (await t.buildView(HANA)).me.unread === 0, read);
  const reply = await act(HANA, { type: "message.send", conversationId: convId, text: "Happy to talk. It went well." });
  check("Hana replies", reply.ok && reply.conversation.messages.length === 3, reply);
  check("Sal now has one unread", (await t.buildView(SAL)).me.unread === 1);

  /* ---------- the email ---------- */
  console.log("\nThe email to the other side");
  await settle();
  const toHana = outbox.filter((m) => m.to === "hana.holder@example.com");
  check("Hana got one email for Sal's two messages in the same hour", toHana.length === 1, toHana.map((m) => m.subject));
  const m0 = toHana[0];
  check("its subject names the sender and the seat", m0?.subject === "Sal sent you a message on Merlin about your seat at Acme Robotics", m0?.subject);
  check("it quotes the first 200 characters", !!m0 && m0.text.includes(opener.slice(0, 120)) && !m0.text.includes(opener.slice(0, 260)) && m0.text.includes("…"), m0?.text.slice(0, 300));
  // The button carries a one-time sign-in link that opens the conversation.
  const once = m0?.text.match(/https:\/\/post\.example\.com\/\?k=(o[A-Za-z0-9_-]{32})&p=messages&m=([^\s]+)/);
  check("it links to the conversation with a one-time sign-in link", !!once && once[2] === encodeURIComponent(convId) && m0.html.includes("Read and reply") && m0.html.includes(`?k=${once[1]}&amp;p=messages`), m0?.text.slice(-500));
  check("the footer says replies to the email don't reach them", !!m0 && m0.text.includes("Replies to this email don't reach them. Reply on Merlin.") && m0.html.includes("Replies to this email don&#39;t reach them") || m0?.html.includes("Replies to this email don't reach them"));
  check("the text version says link, not button", !!m0 && /link/.test(m0.text) && !/button/i.test(m0.text), m0?.text);
  // Changed: the footer used to say "Turn them off in Your credits". The switch is on Notifications now, linked, signed in.
  check(
    "the footer turns them off in Notifications, with a signed link there",
    !!m0 && m0.text.includes("Turn them off in Notifications on Merlin.") && !/Your credits/.test(m0.text + m0.html) && /\nNotifications\nhttps:\/\/post\.example\.com\/api\/go\?m=[^\s]+&to=%2F%3Fp%3Dnotifications\n/.test(m0.text) && />Notifications<\/a>/.test(m0.html),
    m0?.text.slice(-500),
  );
  {
    const si = await import("../lib/signin");
    const rec = (await t.loadState()).signins?.find((x) => x.purpose === "message");
    const days = rec ? (Date.parse(rec.exp) - Date.now()) / DAY : 0;
    check("the link lasts 7 days", days > 6.9 && days <= 7.01, days);
    const who = once ? await si.redeemLink(once[1]) : null;
    check("the link signs in the member it went to", who?.token === HANA, who?.id);
    const twice = once ? await si.redeemLink(once[1]) : null;
    check("and works only once", twice === null);
    const code = await si.redeemCode("hana.holder@example.com", "000000");
    check("a typed code never opens a message link", code === null);
  }
  check("replies go to the support address, never a member's", !!m0 && m0.replyTo === "hello@example.org" && outbox.every((m) => m.replyTo === "hello@example.org"), m0?.replyTo);
  check("it never shows an email address", !!m0 && !EMAILS.some((e) => (m0.subject + m0.text + m0.html).includes(e)));
  const toSal = outbox.filter((m) => m.to === "sal.starter@example.com");
  check("Sal got one for Hana's reply, about the seat", toSal.length === 1 && toSal[0].subject === "Hana sent you a message on Merlin about the seat at Acme Robotics", toSal.map((m) => m.subject));
  skew += 61 * 60 * 1000;
  await act(SAL, { type: "message.send", conversationId: convId, text: "An hour later" });
  await settle();
  check("an hour later the next message emails again", outbox.filter((m) => m.to === "hana.holder@example.com").length === 2);
  const off = await act(HANA, { type: "settings", messageEmail: false });
  check("Hana turns message emails off", off.ok && (await t.buildView(HANA)).me.messageEmail === false, off);
  skew += 61 * 60 * 1000;
  await act(SAL, { type: "message.send", conversationId: convId, text: "Another hour later" });
  await settle();
  check("with message emails off, no email goes out", outbox.filter((m) => m.to === "hana.holder@example.com").length === 2);
  await act(HANA, { type: "settings", messageEmail: true });

  /* ---------- Not now, block, report ---------- */
  console.log("\nNot now, block and report");
  const again = await act(SAL, { type: "message.start", engagementId: hanaSeat, text: "Writing from the record again" });
  check("starting again about the same seat goes into the same conversation", again.ok && again.conversation?.id === convId, again.conversation?.id);
  const close = await act(HANA, { type: "message.close", conversationId: convId });
  check("Hana says Not now", close.ok && close.conversation.status === "closed" && close.conversation.closedBy === "you", close);
  const salClosed = (await list(SAL)).find((c) => c.id === convId);
  check("Sal sees it closed by them, with no way to write", salClosed?.status === "closed" && salClosed.closedBy === "them" && salClosed.canSend === false, salClosed);
  const salTries = await act(SAL, { type: "message.send", conversationId: convId, text: "Please?" });
  check("Sal's next message is refused politely", !salTries.ok && salTries.error === "They're not taking intros right now.", salTries);
  const reopen = await act(HANA, { type: "message.send", conversationId: convId, text: "Actually, let's talk next week." });
  check("the side that said Not now can write again, which reopens it", reopen.ok && reopen.conversation.status === "open", reopen.conversation?.status);

  const salMsg = (await list(HANA)).find((c) => c.id === convId).messages.find((m) => !m.mine);
  const ownMsg = (await list(HANA)).find((c) => c.id === convId).messages.find((m) => m.mine);
  const selfReport = await act(HANA, { type: "message.report", conversationId: convId, messageId: ownMsg.id });
  check("a member can't report their own message", !selfReport.ok, selfReport);
  const rep = await act(HANA, { type: "message.report", conversationId: convId, messageId: salMsg.id });
  check("Hana reports one of Sal's messages", rep.ok && rep.conversation.messages.find((m) => m.id === salMsg.id)?.reported === true, rep);
  const rep2 = await act(HANA, { type: "message.report", conversationId: convId, messageId: salMsg.id });
  check("reporting it twice counts once", rep2.ok && /already reported/.test(rep2.message));
  const av = await t.buildView(ADA);
  check("the admin sees exactly the reported message", av.reportedMessages?.length === 1 && av.reportedMessages[0].text === salMsg.text && av.reportedMessages[0].from === "Sal Starter", av.reportedMessages);
  const avText = JSON.stringify(av);
  check("and no other message from the conversation", !avText.includes("Happy to talk") && !avText.includes("An hour later") && !avText.includes("let's talk next week"));
  const notAdmin = await act(SAL, { type: "message.review", reportId: av.reportedMessages?.[0]?.id, decision: "remove" });
  check("only admins review reported messages", !notAdmin.ok, notAdmin);
  const removed = await act(ADA, { type: "message.review", reportId: av.reportedMessages?.[0]?.id, decision: "remove" });
  const afterRemove = (await list(SAL)).find((c) => c.id === convId).messages.find((m) => m.id === salMsg.id);
  check("an admin removes it: both sides see it gone", removed.ok && afterRemove?.removed === true && afterRemove.text === "", afterRemove);
  check("the review list is empty again", ((await t.buildView(ADA)).reportedMessages ?? []).length === 0);
  const adminList = await msg.listConversations(ADA);
  check("admins have no conversations to read but their own", adminList.conversations.length === 0);

  const block = await act(HANA, { type: "message.block", conversationId: convId });
  check("Hana blocks Sal", block.ok && block.conversation.blocked === true && block.conversation.status === "closed", block.conversation);
  const salBlocked = await act(SAL, { type: "message.send", conversationId: convId, text: "Hello?" });
  check("Sal can't write in it", !salBlocked.ok && salBlocked.error === "They're not taking intros right now.", salBlocked);
  await act(SAL, { type: "unlock", entity: "engagement", id: pub("e_beta_hana"), field: "operator" });
  const newAfterBlock = await act(SAL, { type: "message.start", engagementId: pub("e_beta_hana"), text: "About Beta" });
  check("and can't start a new one with her", !newAfterBlock.ok && newAfterBlock.error === "They're not taking intros right now.", newAfterBlock);
  const hanaBlocked = await act(HANA, { type: "message.send", conversationId: convId, text: "x" });
  check("the blocker can't write while the block stands", !hanaBlocked.ok && /Unblock/.test(hanaBlocked.error), hanaBlocked);
  const unblock = await act(HANA, { type: "message.block", conversationId: convId, on: false });
  const afterUnblock = await act(SAL, { type: "message.start", engagementId: pub("e_beta_hana"), text: "About Beta" });
  check("after an unblock, Sal can start one again", unblock.ok && afterUnblock.ok && afterUnblock.conversation.id !== convId, afterUnblock);

  /* ---------- limits ---------- */
  console.log("\nLimits");
  // Sal started 2 in the last 24 hours (Acme 2 hours ago is still inside it, Beta now).
  const started = [];
  for (let i = 0; i < 3; i++) started.push(await act(SAL, { type: "message.start", engagementId: pub(`e_many_${i}`), text: `Hi ${i}` }));
  check("3 more starts are fine (5 in 24 hours)", started.every((r) => r.ok), started.map((r) => r.error));
  const sixth = await act(SAL, { type: "message.start", engagementId: pub("e_many_3"), text: "Hi 3" });
  check("the 6th new conversation in 24 hours is refused", !sixth.ok && /5 conversations a day/.test(sixth.error), sixth);
  const replyOk = await act(SAL, { type: "message.send", conversationId: started[0].conversation.id, text: "A reply still goes" });
  check("replies are not limited by it", replyOk.ok, replyOk);
  // Open conversations: up to 30 at once. Sal has 5 open now (Acme reopened... closed by block, Beta, and 3).
  let n = 3;
  let refusedAt = null;
  for (let day = 0; day < 8 && refusedAt === null; day++) {
    skew += DAY + HOUR;
    for (let k = 0; k < 5 && n < HOLDERS; k++, n++) {
      const r = await act(SAL, { type: "message.start", engagementId: pub(`e_many_${n}`), text: `Hi ${n}` });
      if (!r.ok) {
        refusedAt = { n, error: r.error };
        break;
      }
    }
  }
  const openNow = (await list(SAL)).filter((c) => c.status === "open").length;
  check("the 31st open conversation is refused", refusedAt !== null && /30 open conversations/.test(refusedAt.error) && openNow === 30, { refusedAt, openNow });
  const firstOpen = (await list(SAL)).find((c) => c.status === "open");
  await act(SAL, { type: "message.close", conversationId: firstOpen.id });
  const afterClose = await act(SAL, { type: "message.start", engagementId: pub(`e_many_${refusedAt?.n ?? 30}`), text: "Now there is room" });
  check("closing one makes room", afterClose.ok, afterClose);

  skew += DAY + HOUR;
  const target = afterClose.conversation?.id;
  let sent = 0;
  let stop = null;
  for (let k = 0; k < 61; k++) {
    const r = await act(SAL, { type: "message.send", conversationId: target, text: `m${k}` });
    if (r.ok) sent++;
    else {
      stop = r.error;
      break;
    }
  }
  check("60 messages a day, then a refusal", sent === 60 && /60 messages today/.test(stop ?? ""), { sent, stop });
  skew += DAY + HOUR;
  check("the next day there is room again", (await act(SAL, { type: "message.send", conversationId: target, text: "next day" })).ok);

  /* ---------- pilot metrics and the export ---------- */
  console.log("\nPilot metrics and the export");
  const stats = (await t.buildView(ADA)).admin?.messages;
  check("pilot metrics count conversations, replies, closes, blocks and reports", !!stats && stats.started >= 30 && stats.replied3d === 1 && stats.closed >= 1 && stats.blocked === 1 && stats.reported === 1, stats);
  const exp = await t.exportState();
  const expText = JSON.stringify(exp.conversations);
  check("the admin export carries no message text", !!exp.conversations?.length && !expText.includes("Happy to talk") && !expText.includes(opener.slice(0, 40)));
  check("signed out, there is no list", (await msg.listConversations(null)) === null && (await msg.listConversations("made-up")) === null);
  const disk = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the state on disk keeps the conversations", disk.includes("Happy to talk"));
  const signedOut = await act(null, { type: "message.send", conversationId: convId, text: "x" });
  check("a signed-out send is refused", !signedOut.ok);
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL the run stopped: ${String(e?.stack ?? e).slice(0, 800)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
