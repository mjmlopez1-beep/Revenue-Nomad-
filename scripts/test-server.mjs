#!/usr/bin/env node
/**
 * End-to-end checks of the Trading Post server against a running server.
 *
 *   BASE=http://localhost:3000 node scripts/test-server.mjs
 *
 * Run it against a throwaway server: it creates about 90 test accounts and adds, unlocks,
 * confirms and reports facts. Start that server on a fresh RN_DATA_DIR with
 * RN_STARTER_CREDITS=50 and RN_ADMIN_EMAILS=admin-qa@example.com.
 *
 * Optional environment:
 *   ADMIN_EMAIL    admin account to join (default admin-qa@example.com)
 *   ADMIN_TOKEN    its sign-in code, when that email already joined
 *   SEED_TOKEN     a seed member's sign-in code (unlock limit and out-of-credits checks)
 *   SEED_EMAIL     a seed member's email (join answer is the same as for a joined email)
 *   STARTER        expected starter credits (default 50)
 *   ONLY           comma-separated sections to run (default all): ssrf ids economy ip unlock
 *                  reports fields stats gzip result join load
 *   LOAD_OUT       write the load test's accounts and expected ledgers to this file
 *   CHECK_LEDGERS  re-check a LOAD_OUT file only (run it after restarting the server, to
 *                  check that what was written to disk survived)
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const STARTER = Number(process.env.STARTER ?? 50);
const ONLY = new Set((process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean));
const RUN = Date.now().toString(36);
/** A distinct client address per test client (the rightmost X-Forwarded-For entry). */
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
const ip = (n) => `${IP_BASE}.${n}`;

let failures = 0;
let passes = 0;
const pass = (name) => (passes++, console.log(`PASS ${name}`));
const fail = (name, detail) => (failures++, console.log(`FAIL ${name}${detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}`}`));
const check = (name, ok, detail) => (ok ? pass(name) : fail(name, detail));
const skip = (name, why) => console.log(`SKIP ${name}: ${why}`);

/* ---------- http ---------- */

async function call(method, path, { token, ipAddr, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.cookie = `rn_table=${token}`;
  if (ipAddr && !h["x-forwarded-for"]) h["x-forwarded-for"] = ipAddr;
  if (body !== undefined) h["content-type"] = "application/json";
  const t0 = performance.now();
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const ms = performance.now() - t0;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers, ms };
}

/** Raw GET (fetch would decompress), for the gzip check. */
function rawGet(path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(u, { method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

class Client {
  constructor(name, ipAddr, token = null) {
    this.name = name;
    this.ip = ipAddr;
    this.token = token;
  }
  get first() {
    return this.name.split(" ")[0];
  }
  async view() {
    const r = await call("GET", "/api/table", { token: this.token, ipAddr: this.ip });
    if (r.status !== 200) throw new Error(`GET as ${this.name}: ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }
  act(action) {
    return call("POST", "/api/table", { token: this.token, ipAddr: this.ip, body: { action } });
  }
}

async function join(name, ipAddr, { ref, email } = {}) {
  const r = await call("POST", "/api/table", {
    ipAddr,
    body: { join: { name, email: email ?? `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com`, ref } },
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}

async function member(name, ipAddr, opts) {
  const { r, client } = await join(name, ipAddr, opts);
  if (!client) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return client;
}

/* ---------- view helpers ---------- */

function* cellsOf(view) {
  for (const c of view.companies) {
    for (const [field, cell] of Object.entries(c.cells)) yield { entity: "company", id: c.id, field, cell, company: c };
    const people = [...c.people];
    for (const e of c.engagements) {
      for (const [field, cell] of Object.entries(e.cells)) yield { entity: "engagement", id: e.id, field, cell, company: c, eng: e };
      people.push(...e.people);
    }
    for (const p of people) for (const [field, cell] of Object.entries(p.cells)) yield { entity: "contact", id: p.id, field, cell, company: c, person: p };
  }
}
const findCell = (view, entity, id, field) => {
  for (const x of cellsOf(view)) if (x.entity === entity && x.id === id && x.field === field) return x.cell;
  return null;
};

/** A valid value for each field a test fills (role, function and website are left alone). */
const SAMPLE = {
  "company.hq": "Austin, TX",
  "company.linkedin": "linkedin.com/company/qa-test",
  "company.industry": "SaaS",
  "company.employees": "11–50",
  "company.revenue": "$1M–$5M",
  "engagement.type": "Fractional",
  "engagement.status": "Active",
  "engagement.operator": "Qa Operator",
  "engagement.start": "2024-01",
  "engagement.end": "Ongoing",
  "engagement.rate": "$8k/mo",
  "engagement.hours": "15",
  "engagement.posting": "example.com/jobs/qa",
  "engagement.revenue": "$1M–$5M",
  "engagement.employees": "11–50",
  "contact.title": "CEO",
  "contact.relationship": "Decision maker",
  "contact.email": "qa.person@example.com",
  "contact.phone": "+1 555 010 0000",
  "contact.linkedin": "linkedin.com/in/qa-person",
};
const FREE = new Set(["company.hq", "company.linkedin", "company.industry", "company.employees", "company.revenue", "engagement.type", "engagement.start", "engagement.revenue", "engagement.employees", "contact.title", "contact.relationship"]);
const claimed = new Set();
/** n empty cells nobody in this run has picked yet. */
function pickEmpty(view, n, { free = false, entity } = {}) {
  const out = [];
  for (const x of cellsOf(view)) {
    if (out.length >= n) break;
    const col = `${x.entity}.${x.field}`;
    if (x.cell.s !== "empty" || !SAMPLE[col] || (free && !FREE.has(col)) || (entity && x.entity !== entity) || x.company.hidden) continue;
    const k = `${x.id}.${x.field}`;
    if (claimed.has(k)) continue;
    claimed.add(k);
    out.push({ entity: x.entity, id: x.id, field: x.field, value: SAMPLE[col], company: x.company });
  }
  if (out.length < n) throw new Error(`only ${out.length} empty cells left`);
  return out;
}
const pickLocked = (view, n) => {
  const out = [];
  for (const x of cellsOf(view)) {
    if (out.length >= n) break;
    if (x.cell.s === "locked") out.push({ entity: x.entity, id: x.id, field: x.field });
  }
  return out;
};
const fillAct = (t) => ({ type: "fill", entity: t.entity, id: t.id, field: t.field, value: t.value });

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);
const shared = {};

async function admin() {
  if (shared.admin !== undefined) return shared.admin;
  const email = process.env.ADMIN_EMAIL || "admin-qa@example.com";
  if (process.env.ADMIN_TOKEN) return (shared.admin = new Client("Admin Qa", ip(250), process.env.ADMIN_TOKEN));
  const { client } = await join("Admin Qa", ip(250), { email });
  if (client) await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return (shared.admin = client);
}

section("ssrf", async () => {
  const m = await member("Lou Lookup", ip(10));
  for (const url of ["169.254.169.254", "127.0.0.1", "metadata.google.internal", "10.0.0.1", "[::1]", "localhost", "router.lan", "printer.local", "0x7f.1", "http://127.1/", "https://169.254.169.254/latest/meta-data/"]) {
    const r = await call("GET", `/api/table/lookup?url=${encodeURIComponent(url)}`, { token: m.token, ipAddr: m.ip });
    check(`lookup refuses ${url}`, r.status === 400, r.status);
  }
  // A public name that resolves to 127.0.0.1 must not get a connection (checked in the socket's lookup).
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
    let hits = 0;
    const srv = createServer((sock) => (hits++, sock.destroy()));
    const listening = await new Promise((resolve) => {
      srv.once("error", () => resolve(false));
      srv.listen(443, "127.0.0.1", () => resolve(true));
    });
    if (listening) {
      const r = await call("GET", "/api/table/lookup?url=localtest.me", { token: m.token, ipAddr: m.ip });
      await new Promise((res) => setTimeout(res, 300));
      check("localtest.me (resolves to 127.0.0.1) makes no connection", hits === 0 && r.status === 200, { hits, status: r.status });
      srv.close();
    } else skip("localtest.me connection check", "cannot listen on 127.0.0.1:443");
  } else skip("localtest.me connection check", "BASE is not this machine");
  const s = await call("GET", "/api/table/lookup?url=stripe.com", { token: m.token, ipAddr: m.ip });
  check("lookup stripe.com still returns Stripe", s.status === 200 && s.json?.name === "Stripe", s.json);
  const l = await member("Lia Limit", ip(11));
  let last = null;
  for (let i = 0; i < 31; i++) last = await call("GET", "/api/table/lookup?url=x", { token: l.token, ipAddr: l.ip });
  check("lookup is limited to 30 a minute", last.status === 429, last.status);
});

section("ids", async () => {
  const m = await member("Ivy Ids", ip(20));
  const r = await call("GET", "/api/table", { token: m.token, ipAddr: m.ip });
  const leaks = (r.text.match(/jamieklanac|lawrencecoffee|patrickkriske/gi) ?? []).length;
  check("no seat holder or person names in ids", leaks === 0, `${leaks} matches`);
  const v = r.json;
  const engIds = v.companies.flatMap((c) => c.engagements.map((e) => e.id));
  const people = v.companies.flatMap((c) => [...c.people, ...c.engagements.flatMap((e) => e.people)]);
  check("engagement ids are e_ + 12 opaque characters", engIds.length > 0 && engIds.every((id) => /^e_[A-Za-z0-9_-]{12}$/.test(id)), engIds.find((id) => !/^e_[A-Za-z0-9_-]{12}$/.test(id)));
  check("person ids are p_ + 12 opaque characters", people.length > 0 && people.every((p) => /^p_[A-Za-z0-9_-]{12}$/.test(p.id)), people.find((p) => !/^p_[A-Za-z0-9_-]{12}$/.test(p.id))?.id);
  check("person engagement ids are public", people.every((p) => p.engagementId === null || /^e_[A-Za-z0-9_-]{12}$/.test(p.engagementId)));
  const nf1 = await m.act({ type: "unlock", entity: "engagement", id: "e_aventinehillpartners_lawrencecoffee", field: "operator" });
  const nf2 = await m.act({ type: "unlock", entity: "engagement", id: "e_AAAAAAAAAAAA", field: "operator" });
  check("internal and unknown ids get Record not found", nf1.json?.error === "Record not found." && nf2.json?.error === "Record not found.", [nf1.json, nf2.json]);

  // Add an engagement, a person on it, and details into it, all by public id.
  const co = v.companies.find((c) => c.engagements.length > 0 && c.cells.website?.s === "value");
  const add = await m.act({ type: "add", company: co.name, newEngagement: true, engagementFields: { type: "Advisory", start: "2024-03" } });
  check("add engagement returns a public id", add.status === 200 && /^e_[A-Za-z0-9_-]{12}$/.test(add.json?.id ?? ""), add.json);
  const eid = add.json?.id;
  const addP = await m.act({ type: "addPerson", companyId: co.id, engagementId: eid, person: { name: "Quinn Qa", title: "CEO" } });
  check("add person on that engagement", addP.status === 200 && /^p_[A-Za-z0-9_-]{12}$/.test(addP.json?.id ?? ""), addP.json);
  const into = await m.act({ type: "add", company: co.name, engagementId: eid, engagementFields: { hours: "12" } });
  check("add details into the engagement by id", into.status === 200 && into.json?.id === eid, into.json);
  const v2 = await m.view();
  const c2 = v2.companies.find((c) => c.id === co.id);
  const e2 = c2?.engagements.find((e) => e.id === eid);
  check("new engagement shows under its company", !!e2 && e2.cells.type?.v === "Advisory" && e2.cells.hours?.v === "12", e2?.cells);
  check("new person shows on the engagement", !!e2?.people.find((p) => p.id === addP.json?.id && p.engagementId === eid));
  const badEng = await m.act({ type: "addPerson", companyId: co.id, engagementId: "e_AAAAAAAAAAAA", person: { name: "Nope Qa" } });
  check("add person on an unknown engagement is refused", badEng.status === 400, badEng.json);
});

section("economy", async () => {
  const A = await member("Ada Tester", ip(30));
  const vA = await A.view();
  const meA = vA.me;
  // First fact: a free one, for the confirmation check below. Then up to the cap.
  const [factX] = pickEmpty(vA, 1, { free: true, entity: "company" });
  const fills = [factX, ...pickEmpty(vA, 25)];
  let lastMsg = "";
  for (let i = 0; i < 25; i++) {
    const r = await A.act(fillAct(fills[i]));
    if (r.status !== 200) return fail(`A fill ${i}`, r.json);
    lastMsg = r.json.message;
  }
  let a = (await A.view()).me;
  check("A earned 25 of 25 after 25 fills", a.earned24h === 25 && a.credits === STARTER + 25, a);
  const capped = await A.act(fillAct(fills[25]));
  check("a fill at the cap says so, without Saved.", capped.status === 200 && /You've hit today's max of 25 earned credits/.test(capped.json?.message) && !/Saved\./.test(capped.json?.message), capped.json?.message);
  check("toast after a normal fill uses a period", /^Added [^:]+\. \+1 credit\.$/.test(lastMsg), lastMsg);

  // Invite: the landing can name the inviter.
  const ref = await call("GET", `/api/table?ref=${encodeURIComponent(meA.inviteCode)}`, { ipAddr: ip(31) });
  check("GET ?ref= names the inviter", ref.json?.inviter === "Ada", ref.json);
  const badRef = await call("GET", "/api/table?ref=nope1234", { ipAddr: ip(31) });
  check("GET ?ref= unknown code gives null", badRef.status === 200 && badRef.json?.inviter === null, badRef.json);

  const B = await member("Ben Tester", ip(32), { ref: meA.inviteCode });
  a = (await A.view()).me;
  let b = (await B.view()).me;
  check("after B joins: A invited 1, invitesPaid 0", a.invited === 1 && a.invitesPaid === 0, a);
  check("after B joins: B invitePending", b.invitePending === true, b);
  const vB = await B.view();
  const bFills = pickEmpty(vB, 5);
  const first = await B.act(fillAct(bFills[0]));
  check("B's first fact pays the invite bonus", /Invite bonus \+10\./.test(first.json?.message ?? ""), first.json);
  for (const t of bFills.slice(1)) await B.act(fillAct(t));
  const vA2 = await A.view();
  a = vA2.me;
  const vB2 = await B.view();
  b = vB2.me;
  // The cap covers every credit earned: capped A's invite bonus is held, not paid or lost.
  check("capped A's invite bonus is held, not paid", a.credits === STARTER + 25 && a.held === 10, { credits: a.credits, held: a.held });
  check("A stays at 25 of 25 earned", a.earned24h === 25, a.earned24h);
  check("A invitesPaid 1", a.invitesPaid === 1, a.invitesPaid);
  check("B invitePending false after the first fact", b.invitePending === false, b);
  check("after 5 fills plus an invite, B's meter reads 15 of 25", b.earned24h === 15 && b.credits === STARTER + 5 + 10 && b.held === 0, b);
  const bRef = vB2.ledger.find((l) => l.reason === "referral");
  check("A's ledger has no referral row while it is held", !vA2.ledger.some((l) => l.reason === "referral"), vA2.ledger.slice(0, 3));
  check("B's ledger names A", bRef?.company === "Ada" && bRef?.delta === 10, bRef);

  // Same network: no invite bonus.
  const B2 = await member("Bea Tester", ip(30), { ref: meA.inviteCode });
  const b2v = await B2.view();
  check("an invite from the same network sets no invite", b2v.me.invitePending === false);
  const b2f = await B2.act(fillAct(pickEmpty(b2v, 1)[0]));
  const a3 = (await A.view()).me;
  const b2 = (await B2.view()).me;
  check("same-network invite pays no bonus to either", !/Invite bonus/.test(b2f.json?.message ?? "") && a3.credits === a.credits && a3.held === a.held && b2.credits === STARTER + 1, { msg: b2f.json?.message, a: a3.credits, b2: b2.credits });
  check("A's invited count ignores the same-network join", a3.invited === 1, a3.invited);

  // A confirmation bonus for a capped member is held too.
  const C = await member("Cal Tester", ip(33));
  const D = await member("Dee Tester", ip(34));
  shared.C = C;
  shared.D = D;
  const before = (await A.view()).me.credits;
  const c1 = await C.act({ type: "verify", entity: factX.entity, id: factX.id, field: factX.field });
  const d1 = await D.act({ type: "verify", entity: factX.entity, id: factX.id, field: factX.field });
  const a4 = (await A.view()).me;
  check("two confirmations hold +1 for a capped member", c1.status === 200 && d1.status === 200 && a4.credits === before && a4.held === 11 && a4.earned24h === 25, { c1: c1.json?.message, d1: d1.json?.message, before, after: a4.credits, held: a4.held, earned: a4.earned24h });
  check("confirm result has the new ver and iv", d1.json?.cells?.[0]?.cell?.iv === true && d1.json?.cells?.[0]?.cell?.ver === 2, d1.json?.cells);
  shared.A = A;
  shared.B = B;
});

section("ip", async () => {
  // Proxy-style headers: the client-supplied first entry rotates, the proxy's last entry doesn't.
  const proxy = `${IP_BASE}.200`;
  const codes = [];
  for (let i = 1; i <= 12; i++) {
    const rr = await call("POST", "/api/table", {
      headers: { "x-forwarded-for": `198.51.100.${i}, ${proxy}` },
      body: { join: { name: `Xff Person ${i}`, email: `qa+${RUN}-xff${i}@example.com` } },
    });
    codes.push(rr.status);
  }
  check("10 joins per IP per hour, forged first X-Forwarded-For entries ignored", codes.slice(0, 10).every((c) => c === 200) && codes[10] === 429 && codes[11] === 429, codes.join(" "));
});

section("unlock", async () => {
  const N = await member("Neo Tester", ip(40));
  const v = await N.view();
  const locked = pickLocked(v, 25);
  const r18 = await N.act({ type: "unlockMany", items: locked.slice(0, 18) });
  check("a new account unlocks 18", r18.status === 200 && r18.json?.me?.credits === STARTER - 18, r18.json);
  const r5 = await N.act({ type: "unlockMany", items: locked.slice(18, 23) });
  check("new account: 18 + 5 says 'You can unlock 2 more today.'", r5.json?.error === "You can unlock 2 more today.", r5.json);
  const r2 = await N.act({ type: "unlockMany", items: locked.slice(18, 20) });
  check("new account unlocks 2 more (20)", r2.status === 200, r2.json);
  const r21 = await N.act({ type: "unlock", ...locked[20] });
  check("new account is refused its 21st unlock", r21.json?.error === "You hit today's unlock limit. It resets within 24 hours.", r21.json);

  if (!process.env.SEED_TOKEN) return skip("seed member unlock checks", "SEED_TOKEN not set");
  const S = new Client("Seed Member", ip(41), process.env.SEED_TOKEN);
  const sv = await S.view();
  const credits = sv.me.credits;
  const sl = pickLocked(sv, Math.min(60, credits + 1));
  if (credits < 22 || credits > 59 || sl.length < credits + 1) return skip("seed member unlock checks", `needs 22 to 59 credits (has ${credits})`);
  const s21 = await S.act({ type: "unlockMany", items: sl.slice(0, 21) });
  check("a seed member can unlock more than 20 a day", s21.status === 200, s21.json);
  const rest = await S.act({ type: "unlockMany", items: sl.slice(21, credits) });
  check("seed member spends every credit", rest.status === 200 && rest.json?.me?.credits === 0, rest.json?.me ?? rest.json);
  const zero = await S.act({ type: "unlockMany", items: sl.slice(credits, credits + 1) });
  check("0 credits gives the credits message, not the daily limit", zero.json?.error === "You're out of credits. Add a missing fact to earn one.", zero.json);
});

section("reports", async () => {
  const C = shared.C ?? (await member("Cal Tester", ip(33)));
  const D = shared.D ?? (await member("Dee Tester", ip(34)));
  const E = await member("Eve Tester", ip(50));
  const Fresh = await member("Fay Fresh", ip(51));
  const adm = await admin();
  const cv = await C.view();
  // Reporters need a paid fill.
  await C.act(fillAct(pickEmpty(cv, 1)[0]));
  await D.act(fillAct(pickEmpty(cv, 1)[0]));
  const targets = [];
  // Seed facts (confirmed by our own records, ver >= 1) that no test in this run touched.
  for (const x of cellsOf(cv)) {
    if (x.entity !== "company" || !["hq", "industry", "employees", "revenue"].includes(x.field) || claimed.has(`${x.id}.${x.field}`)) continue;
    if (x.cell.s === "value" && !x.cell.mine && !x.cell.system && x.cell.ver >= 1 && !x.company.mine) targets.push(x);
    if (targets.length >= 12) break;
  }
  const t = targets[0];
  const ref = { entity: t.entity, id: t.id, field: t.field };
  const nofill = await Fresh.act({ type: "report", ...ref });
  check("a new account with no fills can't report", nofill.json?.error === "Add a fact before you report one.", nofill.json);
  const r1 = await C.act({ type: "report", ...ref });
  check("report answers 'Reported. An admin will review it.'", r1.json?.message === "Reported. An admin will review it." && r1.json?.cells?.[0]?.cell?.s === "reported", r1.json);
  const again = await C.act({ type: "report", ...ref });
  check("reporting twice says 'You already reported this.'", again.json?.message === "You already reported this.", again.json);
  check("the reporter sees it under review", findCell(await C.view(), ref.entity, ref.id, ref.field)?.s === "reported");
  check("another member still sees the value", findCell(await D.view(), ref.entity, ref.id, ref.field)?.s === "value");
  if (adm) {
    const row = (await adm.view()).reported.find((r) => r.id === ref.id && r.field === ref.field);
    check(
      "admin sees the row with names, date and company",
      !!row && row.reporters.join() === "Cal Tester" && row.addedBy === "Seed data" && !!row.reportedAt && row.companyId === t.company.id,
      row,
    );
  } else skip("admin report row", "no admin account (set ADMIN_TOKEN)");
  await D.act({ type: "report", ...ref });
  check("after a second report it is hidden for everyone", findCell(await E.view(), ref.entity, ref.id, ref.field)?.s === "reported");
  if (adm) {
    const keep = await adm.act({ type: "review", ...ref, decision: "keep" });
    check("admin keep", keep.json?.message === "Kept.", keep.json);
    check("kept fact is visible again to its reporter", findCell(await C.view(), ref.entity, ref.id, ref.field)?.s === "value");
    check("kept fact leaves the review list", !(await adm.view()).reported.some((r) => r.id === ref.id && r.field === ref.field));
  }
  // Daily report limit: 10 in 24 hours (the first one above counts).
  let r = null;
  for (const x of targets.slice(1, 11)) r = await C.act({ type: "report", entity: x.entity, id: x.id, field: x.field });
  check("the 11th report in a day is refused", r?.json?.error === "You can report 10 facts a day.", r?.json);
  if (adm) {
    const x = targets[1];
    const rm = await adm.act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "remove" });
    check("admin remove", rm.json?.message === "Removed. The field is open to fill again.", rm.json);
    check("removed fact reopens", findCell(await D.view(), x.entity, x.id, x.field)?.s === "empty");
  }
});

section("fields", async () => {
  const m = await member("Fin Fields", ip(60));
  const v = await m.view();
  const eng = v.companies.flatMap((c) => c.engagements).find((e) => e.cells.rate?.s === "empty" && e.cells.hours?.s === "empty" && !claimed.has(`${e.id}.rate`) && !claimed.has(`${e.id}.hours`));
  if (!eng) return fail("an engagement with empty rate and hours");
  claimed.add(`${eng.id}.rate`);
  claimed.add(`${eng.id}.hours`);
  for (const bad of ["Test value", "Austin, TX", "123"]) {
    const r = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "rate", value: bad });
    check(`rate refuses '${bad}'`, r.json?.error === "Rate. Use a rate like $8k/mo or $150/hr.", r.json);
  }
  const ok = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "rate", value: "€6,000 per month" });
  check("rate accepts '€6,000 per month'", ok.status === 200, ok.json);
  const hrs = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "hours", value: "99" });
  check("hours 99 says 'Hours per week. Use hours per week between 1 and 80.'", hrs.json?.error === "Hours per week. Use hours per week between 1 and 80.", hrs.json);
  const raw = `Uni \u0000‮EVIL‬ Co ${RUN}`;
  const add = await m.act({ type: "add", company: raw });
  const v2 = await m.view();
  check("control and bidi characters are stripped from names", add.status === 200 && v2.companies.some((c) => c.name === `Uni EVIL Co ${RUN}`), add.json);
});

section("stats", async () => {
  const anon = ip(70);
  const s1 = await call("GET", "/api/table", { ipAddr: anon });
  const s2 = await call("GET", "/api/table", { ipAddr: anon });
  check("signed-out GET gives the same stats twice", JSON.stringify(s1.json.stats) === JSON.stringify(s2.json.stats) && s1.json.companies.length === 0);
  check(`stats.starter is ${STARTER}`, s1.json.stats.starter === STARTER, s1.json.stats);
  const m = await member("Sam Stats", ip(71));
  const v = await m.view();
  check("a fresh join gets the starter credits the landing shows", v.me.credits === s1.json.stats.starter, [v.me.credits, s1.json.stats.starter]);
  const fills = pickEmpty(v, 1);
  await m.act(fillAct(fills[0]));
  const s3 = await call("GET", "/api/table", { ipAddr: anon });
  check("stats change after a member action", s3.json.stats.facts === s2.json.stats.facts + 1, [s2.json.stats.facts, s3.json.stats.facts]);
  const open = v.companies.filter((c) => c.friendly.open > 0);
  check("hiring companies score Medium or better", open.length > 0 && open.every((c) => c.friendly.score >= 30 && ["Medium", "High"].includes(c.friendly.tier)), open.map((c) => [c.name, c.friendly.score]));
  check("every company's friendly has recent", v.companies.every((c) => typeof c.friendly.recent === "number"));
  check("stats.fractionalFriendly counts Medium and High", v.stats.fractionalFriendly === v.companies.filter((c) => ["Medium", "High"].includes(c.friendly.tier)).length);
  const names = v.companies.map((c) => c.name);
  const bad = names.filter((n) => /301 W Osborn|Triangle, Grand Avenue|Greensburg, Kansas/i.test(n));
  check("addresses and projects are not companies", bad.length === 0, bad);
  // GET rate limit.
  const lim = ip(72);
  const codes = await Promise.all(Array.from({ length: 121 }, () => call("GET", "/api/table", { ipAddr: lim }).then((r) => r.status)));
  check("the 121st GET in a minute from one IP gets 429", codes.filter((c) => c === 200).length === 120 && codes.filter((c) => c === 429).length === 1, codes.filter((c) => c !== 200).length);
});

section("gzip", async () => {
  const m = await member("Gus Gzip", ip(80));
  const z = await rawGet("/api/table", { "accept-encoding": "gzip, deflate, br", cookie: `rn_table=${m.token}`, "x-forwarded-for": m.ip });
  let parsed = null;
  try {
    parsed = JSON.parse(gunzipSync(z.body).toString("utf8"));
  } catch {
    /* not gzip */
  }
  check("GET is gzipped when accepted", z.headers["content-encoding"] === "gzip" && !!parsed?.companies?.length, z.headers["content-encoding"]);
  console.log(`  gzipped view: ${(z.body.length / 1024).toFixed(0)} KB`);
  check("gzipped view is under 200 KB", z.body.length < 200 * 1024, z.body.length);
  check("vary: Accept-Encoding", /accept-encoding/i.test(String(z.headers.vary ?? "")));
  const plain = await rawGet("/api/table", { cookie: `rn_table=${m.token}`, "x-forwarded-for": m.ip });
  check("not gzipped when not accepted", !plain.headers["content-encoding"] && !!JSON.parse(plain.body.toString("utf8")).companies);
});

section("result", async () => {
  const m = await member("Ria Result", ip(90));
  const v = await m.view();
  const [t] = pickLocked(v, 1);
  const r = await m.act({ type: "unlock", ...t });
  const c = r.json?.cells?.[0];
  const later = findCell(await m.view(), t.entity, t.id, t.field);
  check("unlock returns the cell a later GET shows", c?.id === t.id && c?.cell?.s === "value" && JSON.stringify(c.cell) === JSON.stringify(later), [c, later]);
  check("unlock returns credits one lower", r.json?.me?.credits === v.me.credits - 1 && r.json?.me?.unlocked === 1, r.json?.me);
  const [f] = pickEmpty(v, 1);
  const fr = await m.act(fillAct(f));
  const fc = fr.json?.cells?.[0];
  const flater = findCell(await m.view(), f.entity, f.id, f.field);
  check("fill returns the new cell", fc?.cell?.s === "value" && fc.cell.mine === true && fc.cell.v === f.value && JSON.stringify(fc.cell) === JSON.stringify(flater), [fc, flater]);
  check("fill returns me", fr.json?.me?.added === 1 && fr.json?.me?.credits === v.me.credits - 1 + 1 && fr.json?.me?.earned24h === 1, fr.json?.me);
  // A role fill on an engagement with no function returns the function cell too.
  const eng = v.companies.flatMap((x) => x.engagements).find((e) => e.cells.role?.s === "empty" && e.cells.function?.s === "empty" && !claimed.has(`${e.id}.role`));
  if (eng) {
    claimed.add(`${eng.id}.role`);
    const rr = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "role", value: "Fractional CMO" });
    const fn = rr.json?.cells?.find((x) => x.field === "function");
    check("role fill returns the function it filled", fn?.cell?.v === "Marketing", rr.json?.cells);
  } else skip("role fill function cell", "no engagement with empty role and function");
});

section("join", async () => {
  const email = `qa+${RUN}-dup@example.com`;
  await join("Dup Tester", ip(100), { email });
  const { r: dup } = await join("Dup Tester", ip(100), { email });
  check("joined email: 'That email is already in use. Sign in with your link.'", dup.json?.error === "That email is already in use. Sign in with your link.", dup.json);
  if (process.env.SEED_EMAIL) {
    const { r: seed } = await join("Seed Tester", ip(100), { email: process.env.SEED_EMAIL });
    check("seed member email gives the same answer", seed.json?.error === dup.json?.error, seed.json);
  } else skip("seed email join", "SEED_EMAIL not set");
  const m = await member("Sid Signin", ip(101));
  const k = m.token;
  for (const raw of [`${BASE}/?k=${k}`, k, `  ${k}  `, `${BASE}/?k=${k}.`, `<${BASE}/?k=${k}>`, `/table?k=${k}`]) {
    const r = await call("POST", "/api/table", { ipAddr: ip(102), body: { signIn: raw } });
    check(`sign in with ${JSON.stringify(raw.replace(k, "CODE").replace(BASE, "…"))}`, r.status === 200, r.json);
  }
  const wrong = await call("POST", "/api/table", { ipAddr: ip(102), body: { signIn: "notarealcode123" } });
  check("a wrong code gets 401", wrong.status === 401, wrong.status);
});

section("seat", async () => {
  const S = await member("Sana Seatholder", ip(70));
  const T = await member("Theo Tester", ip(71));
  const anon = await call("GET", "/api/table?people=sana", { ipAddr: ip(72) });
  check("signed-out member search returns nothing", anon.status === 200 && Array.isArray(anon.json?.members) && anon.json.members.length === 0, anon.json);
  const found = await call("GET", "/api/table?people=" + encodeURIComponent("sana sea"), { token: T.token, ipAddr: T.ip });
  const hit = found.json?.members?.find((m) => m.name === "Sana Seatholder");
  check("member search finds a member by first-name and last-name prefixes", !!hit && !("email" in hit) && !/sana/i.test(hit.id), found.json);
  const short = await call("GET", "/api/table?people=s", { token: T.token, ipAddr: T.ip });
  check("a one-letter search returns nothing", short.json?.members?.length === 0, short.json);

  // Fresh engagements to fill (the few empty seat holders on file are open roles).
  const v0 = await T.view();
  const hosts = v0.companies.filter((c) => !c.hidden).slice(-3);
  const seats = [];
  for (const c of hosts) {
    const r = await T.act({ type: "add", company: c.name, newEngagement: true, engagementFields: { function: "Marketing", type: "Advisory", start: "2024-06" } });
    if (r.status !== 200 || !r.json?.id) return fail("seat: add engagement", r.json);
    seats.push({ id: r.json.id });
  }
  const one = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "Jane" });
  check("a one-word seat holder is refused with a first-and-last-name message", one.status === 400 && /first and last name/.test(one.json?.error ?? ""), one.json);
  const mail = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "jane@acme.com" });
  check("an email as seat holder is refused", mail.status === 400, mail.json);
  const bogus = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "Sana Seatholder", memberId: "m_notamember1" });
  check("an unknown member id is refused", bogus.status === 400 && /isn't on Trading Post/.test(bogus.json?.error ?? ""), bogus.json);
  const linked = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "whatever typed", memberId: hit?.id });
  const c0 = linked.json?.cells?.[0]?.cell;
  check("picking a member saves their name and links the seat", linked.status === 200 && c0?.v === "Sana Seatholder" && c0?.member && c0.member.you === false, linked.json);
  const typed = await T.act({ type: "fill", entity: "engagement", id: seats[1].id, field: "operator", value: "sana  seatholder" });
  const c1 = typed.json?.cells?.[0]?.cell;
  check("typing a member's exact name links it too", typed.status === 200 && !!c1?.member, typed.json);
  const other = await T.act({ type: "fill", entity: "engagement", id: seats[2].id, field: "operator", value: "Jean-Luc O'Neill" });
  const c2 = other.json?.cells?.[0]?.cell;
  check("a non-member full name saves without a member link", other.status === 200 && c2?.s === "value" && !c2.member, other.json);
  // The linked member sees "You" once they unlock it.
  const un = await S.act({ type: "unlock", entity: "engagement", id: seats[0].id, field: "operator" });
  const vS = await S.view();
  let mine = null;
  for (const x of cellsOf(vS)) if (x.id === seats[0].id && x.field === "operator") mine = x.cell;
  check("the linked member sees the seat as theirs after unlocking", un.status === 200 && mine?.member?.you === true, { un: un.json, mine });
  // Locked cells never carry the member link.
  const vT2 = await (await member("Uma Viewer", ip(73))).view();
  let locked = null;
  for (const x of cellsOf(vT2)) if (x.id === seats[0].id && x.field === "operator") locked = x.cell;
  check("a locked seat holder carries no member hint", locked?.s === "locked" && !("member" in locked), locked);
});

section("hidden", async () => {
  // A company with an active open role hides its identity until unlocked (1 credit).
  const H = await member("Hana Hidden", ip(80));
  const v = await H.view();
  const hid = v.companies.filter((c) => c.hidden);
  check("companies with an open role come back hidden", hid.length > 0 && hid.every((c) => c.friendly.open > 0), hid.length);
  const c = hid[0];
  if (!c) return fail("hidden: no hidden company to test");
  check("a hidden company has no name, logo, website, LinkedIn or About", c.name === "Hidden company" && c.iconDomain === null && ["website", "linkedin", "about"].every((k) => c.cells[k]?.s !== "value"), { name: c.name, icon: c.iconDomain, w: c.cells.website, l: c.cells.linkedin });
  const hq = c.cells.hq;
  check("a hidden company's HQ is cut to its region", !hq || hq.s !== "value" || !hq.v.includes(","), hq);
  check("company ids are opaque", v.companies.every((x) => /^c_[A-Za-z0-9_-]{12}$/.test(x.id)), v.companies.slice(0, 3).map((x) => x.id));
  check("open companies still show their name", v.companies.some((x) => !x.hidden && x.name !== "Hidden company"));
  const empty = Object.entries(c.cells).find(([, cell]) => cell.s === "empty");
  if (empty) {
    const f = await H.act({ type: "fill", entity: "company", id: c.id, field: empty[0], value: SAMPLE[`company.${empty[0]}`] ?? "Somewhere, TX" });
    check("adding a fact at a hidden company by its id is refused", f.status === 400 && /Unlock this company first/.test(f.json?.error ?? ""), f.json);
  }
  const fo = await H.act({ type: "follow", companyId: c.id, on: true });
  check("following a hidden company doesn't say its name", fo.status === 200 && /this company/.test(fo.json?.message ?? ""), fo.json);
  const before = (await H.view()).me.credits;
  const un = await H.act({ type: "unlock", entity: "company", id: c.id, field: "identity" });
  const v2 = await H.view();
  const c2 = v2.companies.find((x) => x.id === c.id);
  check("unlocking a company costs 1 credit and reveals it", un.status === 200 && v2.me.credits === before - 1 && c2 && !c2.hidden && c2.name !== "Hidden company", { msg: un.json, credits: [before, v2.me.credits], name: c2?.name });
  const again = await H.act({ type: "unlockMany", items: [{ entity: "company", id: c.id, field: "identity" }, { entity: "company", id: c.id, field: "website" }] });
  check("unlocking it again costs nothing", again.status === 200 && (await H.view()).me.credits === before - 1, again.json);
  // Someone who already knows the name can add to it by typing it, and then sees it.
  const K = await member("Kai Knows", ip(81));
  const kv = await K.view();
  check("the company is still hidden for another member", kv.companies.find((x) => x.id === c.id)?.hidden === true);
  const add = await K.act({ type: "add", company: c2.name, newEngagement: true, engagementFields: { function: "Sales", type: "Fractional", start: "2025-01" } });
  const kc = (await K.view()).companies.find((x) => x.id === c.id);
  check("adding by typing the real name works and reveals it to that member", add.status === 200 && kc && !kc.hidden, { add: add.json, hidden: kc?.hidden });
  const fake = await K.act({ type: "add", company: "Hidden company", newEngagement: true, engagementFields: { function: "Sales" } });
  check("the placeholder name can't be added as a company", fake.status === 400, fake.json);
  // The ledger never names a hidden company.
  const L = await member("Lea Ledger", ip(82));
  const lv = await L.view();
  const h2 = lv.companies.find((x) => x.hidden && x.engagements.some((e) => e.cells.role?.s === "locked"));
  if (h2) {
    const e = h2.engagements.find((x) => x.cells.role?.s === "locked");
    await L.act({ type: "unlock", entity: "engagement", id: e.id, field: "role" });
    const lv2 = await L.view();
    check("the ledger says Hidden company for an unlock there", lv2.ledger[0]?.company === "Hidden company", lv2.ledger[0]);
  }
});

section("gtm", async () => {
  const G = await member("Gia Gtm", ip(90));
  const v = await G.view();
  const co = v.companies.find((c) => !c.hidden && ["businessModel", "motion", "dealSize", "salesCycle"].every((k) => c.cells[k]?.s === "empty"));
  if (!co) return fail("gtm: no company with empty GTM fields");
  check("companies carry the new GTM fields, empty and free", ["businessModel", "motion", "dealSize", "salesCycle"].every((k) => co.cells[k]?.s === "empty"));
  const ok = [];
  for (const [k, val] of [["businessModel", "B2B"], ["motion", "PLG to sales"], ["dealSize", "$15K–$50K"], ["salesCycle", "30–90 days"]]) ok.push((await G.act({ type: "fill", entity: "company", id: co.id, field: k, value: val })).status);
  check("business model, sales motion, deal size and sales cycle save from Revenue Nomad's lists", ok.every((x) => x === 200), ok);
  const bad = await G.act({ type: "fill", entity: "company", id: v.companies.find((c) => !c.hidden && c.cells.dealSize?.s === "empty" && c.id !== co.id).id, field: "dealSize", value: "$20K" });
  check("a deal size outside the list is refused", bad.status === 400, bad.json);
  check("revenue uses the standard 'Under $1M' label", !JSON.stringify(v.companies.map((c) => c.cells.revenue)).includes("< $1M"));
  const host = v.companies.filter((c) => !c.hidden && c.id !== co.id)[3];
  const add = await G.act({ type: "add", company: host.name, newEngagement: true, engagementFields: { function: "Sales", reason: "Build the first sales motion", sourced: "Investor intro", pricing: "Monthly retainer" } });
  const e = (await G.view()).companies.find((c) => c.id === host.id).engagements.find((x) => x.id === add.json?.id);
  check("an engagement takes why they hired, how it was sourced and pricing model", add.status === 200 && e?.cells.reason?.v === "Build the first sales motion" && e?.cells.sourced?.v === "Investor intro" && e?.cells.pricing?.v === "Monthly retainer", e?.cells);
  const other = await (await member("Oli Other", ip(91))).view();
  const oe = other.companies.find((c) => c.id === host.id).engagements.find((x) => x.id === add.json?.id);
  check("how it was sourced is locked for others; why hired and pricing are free", oe?.cells.sourced?.s === "locked" && oe?.cells.reason?.s === "value" && oe?.cells.pricing?.s === "value", oe?.cells);
});

section("benchmarks", async () => {
  const R = await member("Rae Rates", ip(92));
  const v = await R.view();
  check("signed-in views carry benchmarks", !!v.benchmarks && v.benchmarks.minN === 5 && Array.isArray(v.benchmarks.rows));
  const anon = await call("GET", "/api/table", { ipAddr: ip(93) });
  check("signed-out views carry no benchmarks", !anon.json?.benchmarks);
  const rowOf = (view) => view.benchmarks.rows.find((r) => r.function === "Enablement" && r.size === "All");
  const base = rowOf(v).monthly.n;
  const hosts = v.companies.filter((c) => !c.hidden).slice(10, 10 + Math.max(0, 5 - base));
  const rates = ["$6k/mo", "$8k/mo", "$9k per month", "$10k/mo", "$12,000 monthly"];
  let i = 0;
  for (const c of hosts) {
    if (i === hosts.length - 1) {
      const pre = rowOf(await R.view()).monthly;
      check("a group with fewer than 5 rates shows no numbers", pre.median === undefined && pre.n === 4, pre);
    }
    await R.act({ type: "add", company: c.name, newEngagement: true, engagementFields: { function: "Enablement", pricing: "Monthly retainer", rate: rates[i++] } });
  }
  const m = rowOf(await R.view()).monthly;
  check("5 rates show a median and middle half", m.n >= 5 && typeof m.median === "number" && m.p25 <= m.median && m.median <= m.p75, m);
});

section("load", async () => {
  const accounts = [];
  for (let i = 0; i < 50; i++) accounts.push(await member(`Load Tester${i}`, ip(150 + Math.floor(i / 10))));
  const v = await accounts[0].view();
  const empties = pickEmpty(v, 50);
  const locked = pickLocked(v, 50);
  const jobs = accounts.flatMap((a, i) => [
    { a, action: fillAct(empties[i]), kind: "fill" },
    { a, action: { type: "unlock", ...locked[i] }, kind: "unlock" },
  ]);
  const t0 = performance.now();
  const results = await Promise.all(jobs.map(async (j) => ({ ...j, r: await j.a.act(j.action) })));
  const wall = performance.now() - t0;
  const ms = results.map((x) => x.r.ms).sort((x, y) => x - y);
  const ok = results.filter((x) => x.r.status === 200);
  console.log(`  100 concurrent actions: ${ok.length} ok, median ${ms[49].toFixed(0)} ms, p90 ${ms[89].toFixed(0)} ms, wall ${wall.toFixed(0)} ms`);
  check("every concurrent action succeeded", ok.length === 100, results.filter((x) => x.r.status !== 200).map((x) => x.r.json));
  const expect = accounts.map((a) => ({
    token: a.token,
    ip: a.ip,
    fills: results.filter((x) => x.a === a && x.kind === "fill" && x.r.status === 200).length,
    unlocks: results.filter((x) => x.a === a && x.kind === "unlock" && x.r.status === 200).length,
  }));
  await checkLedgers(expect);
  if (process.env.LOAD_OUT) {
    writeFileSync(process.env.LOAD_OUT, JSON.stringify(expect));
    console.log(`  wrote ${expect.length} accounts to ${process.env.LOAD_OUT}; restart the server and run with CHECK_LEDGERS=${process.env.LOAD_OUT}`);
  }
});

/** Every success has its ledger row, and every balance is the starter credits plus the ledger. */
async function checkLedgers(expect) {
  let bad = 0;
  for (const e of expect) {
    const v = await new Client("Load", e.ip, e.token).view();
    const sum = v.ledger.reduce((n, l) => n + l.delta, 0);
    const fills = v.ledger.filter((l) => l.reason === "fill").length;
    const unlocks = v.ledger.filter((l) => l.reason === "unlock").length;
    if (v.me.credits !== STARTER + sum || fills !== e.fills || unlocks !== e.unlocks) bad++;
  }
  check(`${expect.length} accounts: ledger rows match successes and balances match ledgers`, bad === 0, `${bad} accounts off`);
}

/* ---------- run ---------- */

if (process.env.CHECK_LEDGERS) {
  await checkLedgers(JSON.parse(readFileSync(process.env.CHECK_LEDGERS, "utf8")));
} else {
  for (const [name, fn] of Object.entries(sections)) {
    if (ONLY.size && !ONLY.has(name)) continue;
    console.log(`\n# ${name}`);
    try {
      await fn();
    } catch (e) {
      fail(`${name} (threw)`, String(e?.stack ?? e));
    }
  }
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
