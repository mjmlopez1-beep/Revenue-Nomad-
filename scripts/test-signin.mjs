/**
 * Checks of sign-in by email (lib/signin.ts and the sign-in paths in app/api/table/route.ts).
 *
 *   npm run build && SIGNIN_PORT=4970 npx tsx scripts/test-signin.mjs
 *
 * First the rules on their own, in this process with the clock moved forward where a rule is
 * about time (links expire after 20 minutes). Then over HTTP, against servers started here on
 * SIGNIN_PORT: one with email on, pointed at a mail catcher on this machine (RN_EMAIL_API_URL),
 * and one with email off. Nothing leaves the machine and no real email is sent. Made-up members only.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.SIGNIN_PORT ?? process.env.PORT ?? 4970);
const BASE = `http://localhost:${PORT}`;
const scratch = mkdtempSync(path.join(tmpdir(), "rn-signin-"));
const seed = {
  builtAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-0000001" },
    { id: "mem_hana", name: "Hana Holder", email: "hana.holder@example.com", title: "Fractional CRO", token: "tok-hana-000001" },
    { id: "mem_ada", name: "Ada Admin", email: "admin-qa@example.com", title: "Founder", token: "tok-ada-0000001" },
  ],
  companies: [{ id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example" } }],
  engagements: [{ id: "e_acme_hana", companyId: "c_acme", fields: { source: "Published engagement", operator: "Hana Holder", function: "Sales" } }],
  contacts: [],
};
const seedPath = path.join(scratch, "seed.json");
writeFileSync(seedPath, JSON.stringify(seed));
const EMAILS = seed.members.map((m) => m.email);

let passes = 0;
let failures = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* =====================================================================================
 * The rules, in this process.
 * ===================================================================================== */

async function rules() {
  const dir = path.join(scratch, "inproc");
  mkdirSync(dir);
  Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: seedPath, RN_STARTER_CREDITS: "25", RN_LOGO_LOOKUP: "off", RN_ADMIN_EMAILS: "admin-qa@example.com" });
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_EMAIL_API_URL", "RN_DIGEST", "RN_SCAN", "RN_REQUIRE_SEED"]) delete process.env[k];
  const realNow = Date.now.bind(Date);
  let skew = 0;
  Date.now = () => realNow() + skew;
  const t = await import("../lib/table");
  const si = await import("../lib/signin");
  const onDisk = () => readFileSync(path.join(dir, "intel.json"), "utf8");

  console.log("\nOne-time links and codes");
  const a = await si.createSignIn("mem_sal", "signin");
  check("a one-time token looks like one, a personal token doesn't", si.isOneTimeToken(a.token) && !si.isOneTimeToken("tok-sal-0000001") && /^\d{6}$/.test(a.code), a.code.length);
  check("only hashes are stored", !onDisk().includes(a.token) && !onDisk().includes(`"${a.code}"`));
  const m1 = await si.redeemLink(a.token);
  check("the link signs in its member, with their personal token", m1?.id === "mem_sal" && m1.token === "tok-sal-0000001", m1?.id);
  check("the link works once", (await si.redeemLink(a.token)) === null);
  const b = await si.createSignIn("mem_sal", "signin");
  skew += 21 * 60 * 1000;
  check("the link stops after 20 minutes", (await si.redeemLink(b.token)) === null);
  const c0 = await si.createSignIn("mem_hana", "signin");
  check("expired links are cleaned up", !JSON.parse(onDisk()).signins.some((x) => x.memberId === "mem_sal"), JSON.parse(onDisk()).signins.length);
  check("and the code with it", (await si.redeemCode("sal.starter@example.com", b.code)) === null);

  const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  for (let k = 0; k < 4; k++) await si.redeemCode("hana.holder@example.com", wrong(c0.code));
  const right = await si.redeemCode("HANA.holder@example.com ", c0.code);
  check("4 wrong tries, then the right code still works (case and spaces don't matter)", right?.id === "mem_hana", right?.id);
  check("a code works once", (await si.redeemCode("hana.holder@example.com", c0.code)) === null);
  const c1 = await si.createSignIn("mem_hana", "signin");
  for (let k = 0; k < 5; k++) await si.redeemCode("hana.holder@example.com", wrong(c1.code));
  check("5 wrong tries kill the code", (await si.redeemCode("hana.holder@example.com", c1.code)) === null);
  check("and its link", (await si.redeemLink(c1.token)) === null);
  check("a code for an email nobody has is just a failure", (await si.redeemCode("nobody@example.com", "123456")) === null);
  const four = [];
  for (let k = 0; k < 4; k++) four.push(await si.createSignIn("mem_ada", "signin"));
  check("at most 3 links wait per member: the oldest goes", (await si.redeemLink(four[0].token)) === null && (await si.redeemLink(four[3].token))?.id === "mem_ada");

  console.log("\nJoining and proving the address");
  const j = await t.joinMember("Jo Joiner", "jo.joiner@example.com", undefined, "10.9.9.9");
  check("a new account starts unproven", !JSON.parse(onDisk()).members.find((m) => m.id === j.id)?.proven);
  const jl = await si.createSignIn(j.id, "join");
  const jm = await si.redeemLink(jl.token);
  check("the join link proves the address", jm?.id === j.id && JSON.parse(onDisk()).members.find((m) => m.id === j.id)?.proven === true);

  console.log("\nSign out on other devices");
  const fresh = await si.rotateToken("tok-sal-0000001");
  check("a seed member gets a new personal token", !!fresh && fresh !== "tok-sal-0000001");
  check("the old one stops working", (await t.memberForToken("tok-sal-0000001")) === null);
  check("the new one works, and the view hands it back", (await t.memberForToken(fresh))?.id === "mem_sal" && (await t.buildView(fresh)).me?.token === fresh);
  check("the email lookup gives the new token", (await t.memberByEmail("sal.starter@example.com"))?.token === fresh);
  check("it is stored as a state override", JSON.parse(onDisk()).tokens?.mem_sal === fresh);
  const pending = await si.createSignIn(j.id, "signin");
  const jFresh = await si.rotateToken(jm.token);
  check("a joined member gets a new token too, and the old one stops", !!jFresh && (await t.memberForToken(jm.token)) === null && (await t.memberForToken(jFresh))?.id === j.id);
  check("links waiting in an inbox stop working after a rotation", (await si.redeemLink(pending.token)) === null);
  check("nobody signed in means no rotation", (await si.rotateToken("made-up")) === null && (await si.rotateToken(null)) === null);

  console.log("\nThe email");
  const e = si.oneTimeEmail("Sal Starter", "https://post.example.com/?k=oABC", "042917", "signin");
  check("the sign-in email has the link and the code", e.subject === "Your Trading Post sign-in link" && e.text.includes("https://post.example.com/?k=oABC") && e.html.includes("042917") && e.text.includes("20 minutes"));
  const ej = si.oneTimeEmail("Jo Joiner", "https://post.example.com/?k=oABC", "042917", "join");
  check("the join email is worded for joining", ej.subject === "Finish joining Trading Post" && ej.html.includes("Open Trading Post"));
  check("no em dashes or semicolons in either", ![e.text, ej.text].some((x) => /—|;/.test(x)));
  Date.now = realNow;
}

/* =====================================================================================
 * Over HTTP.
 * ===================================================================================== */

/** The mail catcher: takes what lib/email.ts would send to Resend. */
const outbox = [];
const catcher = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const m = JSON.parse(body);
      outbox.push({ to: m.to?.[0], subject: m.subject, text: m.text, html: m.html, auth: req.headers.authorization, replyTo: m.reply_to });
    } catch {}
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"id":"x"}');
  });
});

function startServer(dataDir, extra) {
  const env = { ...process.env, RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedPath, RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa@example.com", RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1", RN_CRON_SECRET: "qa-cron", ...extra };
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_EMAIL_API_URL", "RN_EMAIL_REPLY_TO", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_INTEL_SEED_KEY", "RN_INTEL_SEED_B64"]) if (!(k in extra)) delete env[k];
  const p = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  return { p, log: () => log };
}
async function up() {
  for (let k = 0; k < 120; k++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status < 500) return true;
    } catch {}
    await wait(500);
  }
  return false;
}
async function stop(srv) {
  srv.p.kill();
  await new Promise((r) => srv.p.once("exit", r));
}

let ipN = 0;
const ip = () => `10.77.${Math.floor(++ipN / 250)}.${ipN % 250}`;
async function call(body, { token, ipAddr = ip(), method = "POST", q = "" } = {}) {
  const h = { "x-forwarded-for": ipAddr };
  if (token) h.cookie = `rn_table=${token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(`${BASE}/api/table${q}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { status: r.status, json, text, cookie };
}
const view = async (token) => (await call(undefined, { token, method: "GET" })).json;
const mailFor = async (to, n = 1) => {
  for (let k = 0; k < 40; k++) {
    const got = outbox.filter((m) => m.to === to);
    if (got.length >= n) return got[n - 1];
    await wait(50);
  }
  return null;
};
const linkIn = (m) => m?.text.match(/\/\?k=(o[A-Za-z0-9_-]{32})/)?.[1] ?? null;
const codeIn = (m) => m?.text.match(/\n(\d{6})\n/)?.[1] ?? null;

async function emailOn() {
  await new Promise((r) => catcher.listen(0, "127.0.0.1", r));
  const mailUrl = `http://127.0.0.1:${catcher.address().port}/emails`;
  const dataDir = path.join(scratch, "on");
  mkdirSync(dataDir);
  const srv = startServer(dataDir, { RESEND_API_KEY: "test-key", RN_EMAIL_FROM: "Trading Post <post@example.com>", RN_EMAIL_API_URL: mailUrl, RN_PUBLIC_URL: BASE, RN_EMAIL_REPLY_TO: "hello@example.org" });
  try {
    if (!(await up())) return check("the email-on server starts", false, srv.log().slice(-600));
    console.log("\nEmail me a sign-in link (email on)");
    const v0 = await view(null);
    check("the view says email is on", v0?.email === true);
    const member = await call({ emailLink: "sal.starter@example.com" });
    const nobody = await call({ emailLink: "not-a-member@example.com" });
    check("the answer is the same for a member and for an address nobody has", member.status === 200 && member.text === nobody.text && member.json?.message === "If that email is on Trading Post, a link is on its way.", [member.text, nobody.text]);
    const mail = await mailFor("sal.starter@example.com");
    await wait(200);
    check("only the member gets an email", !!mail && !outbox.some((m) => m.to === "not-a-member@example.com"));
    check("it went through the mail API with the key", mail?.auth === "Bearer test-key");
    check("replies go to RN_EMAIL_REPLY_TO", mail?.replyTo === "hello@example.org", mail?.replyTo);
    const tok = linkIn(mail);
    const code = codeIn(mail);
    check("it holds a one-time link and a 6-digit code", !!tok && !!code, mail?.text.slice(0, 200));
    check("it names no other member's email", !!mail && !EMAILS.filter((e) => e !== mail.to).some((e) => (mail.text + mail.html).includes(e)));
    const used = await call({ signIn: tok });
    check("the link signs in and sets the personal token as the cookie", used.status === 200 && used.cookie === "tok-sal-0000001");
    const v1 = await view(used.cookie);
    check("signed in as the member", v1?.me?.name === "Sal Starter");
    const again = await call({ signIn: `${BASE}/?k=${tok}` });
    check("the link works once, and says so", again.status === 401 && /expired or was already used/.test(again.json?.error ?? ""), again.json);
    const codeNow = await call({ signInCode: { email: "sal.starter@example.com", code } });
    check("its code was used up with the link", codeNow.status === 401);

    console.log("\nThe code (email on)");
    await call({ emailLink: "Sal.Starter@example.com" });
    const mail2 = await mailFor("sal.starter@example.com", 2);
    const code2 = codeIn(mail2);
    const bad = String((Number(code2) + 1) % 1_000_000).padStart(6, "0");
    const tries = [];
    for (let k = 0; k < 5; k++) tries.push(await call({ signInCode: { email: "sal.starter@example.com", code: bad } }));
    check("wrong codes are refused", tries.every((r) => r.status === 401 && /stops after 5 wrong tries/.test(r.json?.error ?? "")), tries.map((r) => r.status));
    const late = await call({ signInCode: { email: "sal.starter@example.com", code: code2 } });
    check("after 5 wrong tries the right code no longer works", late.status === 401 && late.text === tries[0].text);
    const ghost = await call({ signInCode: { email: "not-a-member@example.com", code: "123456" } });
    check("an address nobody has gets the same answer as a wrong code", ghost.status === 401 && ghost.text === tries[0].text);
    const shape = await call({ signInCode: { email: "sal.starter@example.com", code: "12ab" } });
    check("a code that isn't 6 digits says so", shape.status === 400 && shape.json?.error === "Type the 6 digits from the email.");
    await call({ emailLink: "sal.starter@example.com" });
    const mail3 = await mailFor("sal.starter@example.com", 3);
    const ok3 = await call({ signInCode: { email: " sal.starter@example.com", code: codeIn(mail3) } });
    check("the code from a new email signs in", ok3.status === 200 && ok3.cookie === "tok-sal-0000001");
    check("and works once", (await call({ signInCode: { email: "sal.starter@example.com", code: codeIn(mail3) } })).status === 401);

    console.log("\nLimits (email on)");
    const fourth = await call({ emailLink: "sal.starter@example.com" });
    check("a 4th link for the same email in 20 minutes is refused", fourth.status === 429 && /3 links/.test(fourth.json?.error ?? ""), fourth.json);
    for (let k = 0; k < 2; k++) await call({ emailLink: "not-a-member@example.com" });
    const fourthNobody = await call({ emailLink: "not-a-member@example.com" });
    check("an address nobody has hits the same limit the same way", fourthNobody.status === 429 && fourthNobody.text === fourth.text);
    const oneIp = ip();
    const perIp = [];
    for (let k = 0; k < 6; k++) perIp.push(await call({ emailLink: `stranger${k}@example.com` }, { ipAddr: oneIp }));
    check("one network gets 5 a hour", perIp.slice(0, 5).every((r) => r.status === 200) && perIp[5].status === 429, perIp.map((r) => r.status));
    const codeIp = ip();
    const codeTries = [];
    for (let k = 0; k < 21; k++) codeTries.push((await call({ signInCode: { email: `x${k}@example.com`, code: "000000" } }, { ipAddr: codeIp })).status);
    check("code tries are limited per network", codeTries.slice(0, 20).every((s) => s === 401) && codeTries[20] === 429, codeTries.slice(-3));
    const codeMail = [];
    for (let k = 0; k < 11; k++) codeMail.push((await call({ signInCode: { email: "hana.holder@example.com", code: "000000" } })).status);
    check("and per email", codeMail.slice(0, 10).every((s) => s === 401) && codeMail[10] === 429, codeMail.slice(-3));

    console.log("\nJoin with email (email on)");
    const join = await call({ join: { name: "Jo Joiner", email: "jo.joiner@example.com" } });
    check("joining sends a link and signs nobody in yet", join.status === 200 && join.json?.sent === true && !join.cookie, join.json);
    const existing = await call({ join: { name: "Someone Else", email: "hana.holder@example.com" } });
    check("joining with a member's email answers the same", existing.status === 200 && existing.text === join.text && !existing.cookie, existing.json);
    const jmail = await mailFor("jo.joiner@example.com");
    const hmail = await mailFor("hana.holder@example.com");
    check("the new member gets a link to finish joining", jmail?.subject === "Finish joining Trading Post" && !!linkIn(jmail));
    check("the member gets a sign-in link instead", hmail?.subject === "Your Trading Post sign-in link" && !!linkIn(hmail));
    const state = () => JSON.parse(readFileSync(path.join(dataDir, "intel.json"), "utf8"));
    check("the new account is not proven before the link is used", state().members.find((m) => m.email === "jo.joiner@example.com")?.proven !== true);
    check("the state keeps no raw link token", !readFileSync(path.join(dataDir, "intel.json"), "utf8").includes(linkIn(hmail)));
    const joined = await call({ signIn: linkIn(jmail) });
    check("the link finishes joining", joined.status === 200 && !!joined.cookie && (await view(joined.cookie))?.me?.name === "Jo Joiner");
    check("and proves the address", state().members.find((m) => m.email === "jo.joiner@example.com")?.proven === true);

    console.log("\nSign out on other devices, and a new link by email");
    const jo1 = joined.cookie;
    const rot = await call({ rotateLink: true }, { token: jo1 });
    check("rotating gives this device the new token", rot.status === 200 && !!rot.cookie && rot.cookie !== jo1 && rot.json?.token === rot.cookie, rot.json);
    check("the old link signs nobody in now", (await view(jo1))?.me === null && (await call({ signIn: jo1 })).status === 401);
    check("the new one does", (await view(rot.cookie))?.me?.name === "Jo Joiner");
    const salRot = await call({ rotateLink: true }, { token: "tok-sal-0000001" });
    check("a seed member can rotate too", salRot.status === 200 && (await view("tok-sal-0000001"))?.me === null && (await view(salRot.cookie))?.me?.name === "Sal Starter");
    check("signed out, there is nothing to rotate", (await call({ rotateLink: true })).status === 401);
    const me = await call({ emailMe: true }, { token: rot.cookie });
    const meMail = await mailFor("jo.joiner@example.com", 2);
    check("Send me a new sign-in link emails the member", me.status === 200 && me.json?.sent === true && meMail?.subject === "Your Trading Post sign-in link", me.json);
    check("signed out, nothing is sent", (await call({ emailMe: true })).status === 401);

    console.log("\nMessages over HTTP");
    check("signed out, there are no messages", (await call(undefined, { method: "GET", q: "?messages=1" })).status === 401 && (await call(undefined, { method: "GET", q: "?unread=1" })).status === 401);
    const ml = await call(undefined, { method: "GET", q: "?messages=1", token: rot.cookie });
    check("signed in, the list comes back", ml.status === 200 && Array.isArray(ml.json?.conversations) && ml.json.unread === 0, ml.json);
    const ur = await call(undefined, { method: "GET", q: "?unread=1", token: rot.cookie });
    check("and the unread count", ur.status === 200 && ur.json?.unread === 0);
    // Jo unlocks who held Hana's seat and writes to her. Hana signs in first, so she can get it.
    await call({ signIn: "tok-hana-000001" });
    const jv = await view(rot.cookie);
    const seat = jv.companies.flatMap((c) => c.engagements).find((e) => e.cells.function?.v === "Sales");
    await call({ action: { type: "unlock", entity: "engagement", id: seat.id, field: "operator" } }, { token: rot.cookie });
    const start = await call({ action: { type: "message.start", engagementId: seat.id, text: "Hi Hana, how did the Acme seat go?" } }, { token: rot.cookie });
    check("a member messages a seat holder they unlocked", start.status === 200 && start.json?.conversation?.messages?.length === 1, start.json);
    check("no email address in the answer", !/@example\.com/.test(start.text));
    const note = await mailFor("hana.holder@example.com", 2);
    check("the message email replies to the support address, not the sender", note?.replyTo === "hello@example.org");
    check("the seat holder gets one email about it", note?.subject === "Jo sent you a message on Trading Post about your seat at Acme Robotics" && !/@example\.com/.test(note.text + note.html), note?.subject);
    const hl = await call(undefined, { method: "GET", q: "?messages=1", token: "tok-hana-000001" });
    check("and sees it in her list, with no email address in it", hl.json?.conversations?.length === 1 && hl.json.unread === 1 && !/@example\.com/.test(hl.text));
  } finally {
    await stop(srv);
    catcher.close();
  }
}

async function emailOff() {
  const dataDir = path.join(scratch, "off");
  mkdirSync(dataDir);
  const srv = startServer(dataDir, {});
  try {
    if (!(await up())) return check("the email-off server starts", false, srv.log().slice(-600));
    console.log("\nEmail off: everything stays as it was");
    check("the view says email is off", (await view(null))?.email === false);
    const link = await call({ emailLink: "sal.starter@example.com" });
    check("no email sign-in", link.status === 400 && /isn't on yet/.test(link.json?.error ?? ""));
    check("no codes", (await call({ signInCode: { email: "sal.starter@example.com", code: "123456" } })).status === 400);
    const join = await call({ join: { name: "Oli Offline", email: "oli.offline@example.com" } });
    check("joining signs in at once", join.status === 200 && !!join.cookie && (await view(join.cookie))?.me?.name === "Oli Offline");
    const pasted = await call({ signIn: "tok-hana-000001" });
    check("the personal link still signs in", pasted.status === 200 && pasted.cookie === "tok-hana-000001");
    const rot = await call({ rotateLink: true }, { token: join.cookie });
    check("Sign out on other devices works without email", rot.status === 200 && (await view(join.cookie))?.me === null && (await view(rot.cookie))?.me?.name === "Oli Offline");
    check("Send me a new sign-in link needs email", (await call({ emailMe: true }, { token: rot.cookie })).status === 400);
  } finally {
    await stop(srv);
  }
}

(async () => {
  try {
    await rules();
    await emailOn();
    await emailOff();
  } catch (e) {
    failures++;
    console.log(`FAIL the run stopped: ${String(e?.stack ?? e).slice(0, 800)}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  }
})();
