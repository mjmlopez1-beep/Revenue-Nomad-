#!/usr/bin/env node
/**
 * End-to-end journeys in a browser (Playwright, headless Chromium), against a running server on a
 * made-up seed, with every check of what happened read back from the server's own APIs, not only
 * the page. Every company, person, member, email and token is invented (scripts/make-test-seed.mjs).
 *
 *   node scripts/test-journey.mjs --state <seed.json> <state.json>   write the journey's starting state
 *   BASE=http://localhost:4600 SEED_FILE=<seed.json> JOURNEY_MOCK=4650 node scripts/test-journey.mjs
 *
 * scripts/test-all.sh runs it as a serve suite: it writes the state, then starts the server on that
 * state with the new design and its work pages on (RN_UI3=on, RN_WORKFLOWS=1, RN_WORKFLOWS_V2=optin,
 * RN_PROPOSALS2=1, RN_CONTRACTS2=1), billing live against a fake Stripe, email, Gmail and Google
 * against the fake services this script serves on 127.0.0.1:JOURNEY_MOCK. Nothing leaves the machine.
 *
 * Journeys:
 *   A  a saved audience: its filters come back when it is opened again; one new matching open role
 *      sets its alert off (the bell), once
 *   B  a company unlock: the quote, cancel spends nothing, confirm spends exactly the quote, again
 *      costs 0, a double click spends once; Free pays 2, Pro 0
 *   C  an intro from a warm path: nothing sent until Approve; Approve sends once (double submit,
 *      retry); Undo and a removed draft never send
 *   D  pipeline, proposal from the deal (its value), sent for signature, the client signs, the deal
 *      is Won with its value, the agreement is on Contracts; cancel mid-flow, double submit, retry
 *   E  a workflow from a template: Make live, the event, the approval waits, approve once, the
 *      follow-through; the monthly cap makes a run wait for a yes; a test run spends nothing
 *   R  every primary page at 337, 779 and 1363 CSS px: no sideways scroll, the navigation reachable
 *   K  the keyboard: the shell, a filter, a drawer or sheet, a composer (Tab, Shift+Tab, Enter,
 *      Escape; focus visible and returned)
 *   X  axe-core on every primary page (when node_modules/axe-core is there), violations by impact
 *
 * JOURNEY_OUT=<dir>: screenshots, accessibility snapshots and results.json go there (default: a new
 * temporary folder, printed at the end). ONLY=A,B: run those journeys only. Exits 1 on any failure.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ---------- who plays which part (members of the made-up seed, by index) ---------- */
const ROLES = { free: 60, pro: 61, close: 62, trial: 63, free2: 64, wf: 65, fin: 66, mkt: 67 };
const WEBHOOK_SECRET = "whsec_journey_made_up";
const CRON = "qa-cron";

/* =====================================================================================
 * --state: the journey's starting state, for the seed's members
 * ===================================================================================== */
if (process.argv[2] === "--state") {
  const [seedFile, out] = process.argv.slice(3);
  const seed = JSON.parse(readFileSync(seedFile, "utf8"));
  const m = (k) => seed.members[ROLES[k]];
  const t0 = Date.now();
  const ago = (ms) => new Date(t0 - ms).toISOString();
  const ahead = (ms) => new Date(t0 + ms).toISOString();
  const ICP = { industries: [], employees: [], revenue: [], countries: [] };
  const TITLE = { Sales: "Fractional VP Sales", Finance: "Fractional CFO", Marketing: "Fractional CMO" };
  // Three personas with their own function, title and ideal client: Sales (the trial member), Finance, Marketing (a referral partner).
  const onb = (fn, icp = ICP) => ({ function: fn, title: TITLE[fn], onboarded: true, icp, before: fn === "Sales" ? ["Marketing"] : ["Sales"], fractionals: true, partners: true, leads: true });
  const ended = { trialStartedAt: ago(30 * DAY), trialEndsAt: ago(9 * DAY), notices: { trialEndedSeen: ago(8 * DAY) } };
  const paid = (tier, n) => ({ trialStartedAt: ago(60 * DAY), trialEndsAt: ago(39 * DAY), subscriptionId: `sub_journey_${n}`, customerId: `cus_journey_${n}`, proUntil: ahead(20 * DAY), paidSince: ago(39 * DAY), interval: "month", tier, invoiceId: `in_journey_${n}`, periodStart: ago(10 * DAY), cents: tier === "close" ? 7900 : 5900, notices: { proWelcomeSeen: ago(30 * DAY) } });
  const trial = { trialStartedAt: ago(11 * DAY), trialEndsAt: ahead(10 * DAY), notices: { trialStartedSeen: ago(DAY) } };
  const ids = Object.keys(ROLES).map((k) => m(k).id);
  const state = {
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(ids.map((id) => [id, ago(DAY)])),
    profiles: { [m("free").id]: onb("Sales"), [m("pro").id]: onb("Sales"), [m("close").id]: onb("Sales"), [m("trial").id]: onb("Sales", { industries: ["Industrial Manufacturing"], employees: [], revenue: [], countries: [] }), [m("free2").id]: onb("Sales"), [m("wf").id]: onb("Sales"),
      [m("fin").id]: onb("Finance", { industries: ["Fintech"], employees: [], revenue: [], countries: [] }), [m("mkt").id]: onb("Marketing", { industries: ["E-Commerce"], employees: [], revenue: [], countries: [] }) },
    aiDrafts: { [m("close").id]: ago(5 * DAY), [m("wf").id]: ago(5 * DAY), [m("fin").id]: ago(5 * DAY) },
    billing: {
      members: { [m("free").id]: ended, [m("free2").id]: ended, [m("pro").id]: paid("pro", 1), [m("close").id]: paid("close", 2), [m("trial").id]: trial, [m("wf").id]: paid("close", 3), [m("fin").id]: trial, [m("mkt").id]: trial },
      events: [],
      payments: [],
      ended: [],
    },
  };
  writeFileSync(out, JSON.stringify(state));
  console.log(`journey state for ${ids.length} made-up members -> ${out}`);
  process.exit(0);
}

/* =====================================================================================
 * The run
 * ===================================================================================== */
const BASE = (process.env.BASE || "http://localhost:4600").replace(/\/$/, "");
const MOCK_PORT = Number(process.env.JOURNEY_MOCK || 4650);
const MOCKB = `http://127.0.0.1:${MOCK_PORT}`;
const SEED_FILE = process.env.SEED_FILE;
const ONLY = (process.env.ONLY || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
const OUT = path.resolve(process.env.JOURNEY_OUT || mkdtempSync(path.join(tmpdir(), "rn-journey-")));
mkdirSync(OUT, { recursive: true });

if (!SEED_FILE || !existsSync(SEED_FILE)) {
  console.log("SKIP: no made-up seed (SEED_FILE). scripts/test-all.sh makes one; this never runs on the real seed.");
  console.log("journeys skipped");
  process.exit(0);
}
const SEED = JSON.parse(readFileSync(SEED_FILE, "utf8"));
// Made-up members only: every member of the seed this runs on has an @example.com address and a "qa" name.
if (!SEED.members.every((x) => /@example\.com$/.test(x.email) && /qa\b/i.test(x.name))) {
  console.error("FAIL refusing to run: the seed is not the made-up one");
  process.exit(1);
}
const WHO = Object.fromEntries(Object.entries(ROLES).map(([k, i]) => [k, SEED.members[i]]));

/* ---------- checks ---------- */
const results = [];
let current = "setup";
let fails = 0;
function check(name, ok, detail) {
  results.push({ journey: current, name, ok: !!ok, ...(ok ? {} : { detail: detail === undefined ? null : detail }) });
  if (ok) console.log(`ok   ${current} ${name}`);
  else {
    fails++;
    console.log(`FAIL ${current} ${name}${detail === undefined ? "" : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
  return !!ok;
}
const note = (name, detail) => results.push({ journey: current, name, note: true, detail });
/** A check this run could not make, and why: listed as unverified, neither passed nor failed. */
const unverified = (name, why) => {
  results.push({ journey: current, name, unverified: true, note: true, detail: why });
  console.log(`skip ${current} ${name} -- ${why}`);
};

/* =====================================================================================
 * The fake services: email (Resend's shape), Stripe, Google (OAuth and Gmail)
 * ===================================================================================== */
const mails = [];
const gmailSent = [];
const googleCodes = new Map();
const stripeCalls = [];
function decodeMail(rawB64) {
  const text = Buffer.from(String(rawB64 || ""), "base64url").toString("utf8");
  const [head, ...rest] = text.split("\r\n\r\n");
  const headers = {};
  for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  const word = (v) => String(v || "").replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_, b) => Buffer.from(b, "base64").toString("utf8"));
  const body = Buffer.from(rest.join("\r\n\r\n").replace(/\s+/g, ""), "base64").toString("utf8");
  return { headers, subject: word(headers.subject), to: word(headers.to), body };
}
const idTok = (email) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString("base64url")}.y`;
const mock = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const u = new URL(req.url, MOCKB);
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      if (u.pathname.startsWith("/fake-email")) {
        try {
          mails.push({ at: Date.now(), ...JSON.parse(raw) });
        } catch {}
        return send(200, { id: `em_journey_${mails.length}` });
      }
      if (u.pathname.startsWith("/stripe/")) {
        stripeCalls.push({ path: u.pathname, raw });
        return send(200, { id: `obj_journey_${stripeCalls.length}`, object: "unknown", url: `${MOCKB}/pay` });
      }
      if (u.pathname.startsWith("/google/")) {
        const p = u.pathname.slice("/google".length);
        if (p === "/accounts/o/oauth2/v2/auth") {
          const q = u.searchParams;
          const code = `journey-code-${googleCodes.size + 1}`;
          googleCodes.set(code, { email: q.get("login_hint") || "member@example.com", scope: q.get("scope") || "" });
          const r = new URL(q.get("redirect_uri"));
          r.searchParams.set("code", code);
          r.searchParams.set("state", q.get("state"));
          r.searchParams.set("scope", q.get("scope") || "");
          res.writeHead(302, { location: r.toString() });
          return res.end();
        }
        const form = new URLSearchParams(raw);
        if (p === "/oauth2/token") {
          if (form.get("grant_type") === "authorization_code") {
            const c = googleCodes.get(form.get("code"));
            if (!c) return send(400, { error: "invalid_grant" });
            googleCodes.delete(form.get("code"));
            const scope = [...new Set(["openid", "email", ...c.scope.split(" ").filter(Boolean)])].join(" ");
            return send(200, { access_token: `journey-access-${Date.now()}`, expires_in: 3600, refresh_token: `journey-refresh-${Date.now()}`, scope, id_token: idTok(c.email) });
          }
          if (form.get("grant_type") === "refresh_token") return send(200, { access_token: `journey-access-${Date.now()}`, expires_in: 3600 });
          return send(400, { error: "unsupported_grant_type" });
        }
        if (p === "/oauth2/revoke") return send(200, {});
        if (!String(req.headers.authorization || "").startsWith("Bearer journey-access-")) return send(401, { error: { status: "UNAUTHENTICATED" } });
        if (p === "/gmail/gmail/v1/users/me/messages/send" && req.method === "POST") {
          const b = JSON.parse(raw || "{}");
          const id = `journeymsg${gmailSent.length + 1}`;
          const m = decodeMail(b.raw);
          gmailSent.push({ id, threadId: b.threadId || `journeythr${gmailSent.length + 1}`, at: Date.now(), to: m.to, subject: m.subject, messageId: m.headers["message-id"], body: m.body });
          return send(200, { id, threadId: gmailSent[gmailSent.length - 1].threadId, labelIds: ["SENT"] });
        }
        const mm = p.match(/^\/gmail\/gmail\/v1\/users\/me\/messages\/([\w-]+)$/);
        if (mm) {
          const m = gmailSent.find((x) => x.id === mm[1]);
          return m ? send(200, { payload: { headers: [{ name: "Message-ID", value: m.messageId }] } }) : send(404, { error: { status: "NOT_FOUND" } });
        }
        const tm = p.match(/^\/gmail\/gmail\/v1\/users\/me\/threads\/([\w-]+)$/);
        if (tm) return send(200, { messages: gmailSent.filter((x) => x.threadId === tm[1]).map((x) => ({ internalDate: String(x.at), labelIds: ["SENT"], payload: { headers: [{ name: "From", value: "me" }] } })) });
        return send(404, { error: "not a fake Google endpoint" });
      }
      send(404, { error: "not a journey mock endpoint" });
    } catch (e) {
      send(500, { error: String(e?.message ?? e) });
    }
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));

/* =====================================================================================
 * Talking to the server
 * ===================================================================================== */
let ipN = 0;
const freshIp = () => `10.77.${Math.floor(++ipN / 250) % 250}.${(ipN % 250) + 1}`;
const IPS = {};
const ipOf = (who) => (IPS[who] ??= freshIp());
async function req(method, p, { as, body, headers = {} } = {}) {
  const h = { "x-forwarded-for": as ? ipOf(as) : freshIp(), ...headers };
  if (as) h.cookie = `rn_table=${WHO[as].token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}
const act = (as, action) => req("POST", "/api/table", { as, body: { action } });
const cron = (p, body) => req("POST", p, { body, headers: { "x-cron-secret": CRON } });
/** The app's own taps (POST /api/send and friends want Merlin's origin and header). */
const tap = (as, p, body) => req("POST", p, { as, body, headers: { origin: BASE, "x-rn-tap": "1" } });
const view = async (as) => (await req("GET", "/api/table", { as })).json;
const today = async (as) => (await req("GET", "/api/table?today=1", { as })).json;
const balanceOf = async (as) => (await today(as))?.me?.credits;
const ledgerOf = async (as) => (await view(as))?.ledger ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15_000, step = 250) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return v;
}

/* =====================================================================================
 * The browser
 * ===================================================================================== */
const { chromium } = require("playwright");
const browser = await chromium.launch();
async function contextFor(as, { width = 1363, height = 900, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, extraHTTPHeaders: { "x-forwarded-for": as ? ipOf(as) : freshIp() } });
  if (as) await ctx.addCookies([{ name: "rn_table", value: WHO[as].token, url: BASE }]);
  return ctx;
}
const WAITERS = ".sk, .tp-allwait, .mv-skel, .td-card-skel, .hm-card-wait";
async function settle(page, ms = 8000) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForFunction((sel) => !document.querySelector(sel), WAITERS, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(300);
}
/** Click until what it should open shows (a click before the page is ready can do nothing). */
async function clickFor(page, target, expect, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await target.click().catch(() => {});
    if (await expect.first().waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false)) return true;
  }
  return false;
}
let shotN = 0;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
/** A screenshot and the page's accessibility snapshot (ARIA, as Playwright reads it), saved under OUT. */
async function evidence(page, name) {
  const base = `${String(++shotN).padStart(3, "0")}-${current}-${slug(name)}`;
  await page.screenshot({ path: path.join(OUT, `${base}.png`), fullPage: false }).catch(() => {});
  const aria = await page.locator("body").ariaSnapshot().catch((e) => `(no snapshot: ${e.message})`);
  writeFileSync(path.join(OUT, `${base}.aria.yml`), aria);
  return `${base}.png`;
}

/* ---------- the seed's companies by their number (Qaco<k>), as their public ids ---------- */
let CO = new Map();
async function loadCompanies() {
  // Pro sees every company named; the public ids are the same for everyone.
  const v = await view("pro");
  CO = new Map((v?.companies ?? []).map((c) => [Number(/Qaco(\d+)$/.exec(c.name)?.[1]), c]));
  return CO.size;
}
const co = (k) => CO.get(k);
const seedCo = (k) => SEED.companies[k];
const ceoOf = (k) => SEED.contacts.find((x) => x.id === `p_qa${k}`)?.fields;

/** Run one journey: its own label, a screenshot on a crash, never stops the others. */
async function journey(key, title, fn) {
  if (ONLY.length && !ONLY.includes(key)) return;
  current = key;
  console.log(`\n== ${key}: ${title}`);
  const t = Date.now();
  try {
    await fn();
  } catch (e) {
    const shots = [];
    for (const c of browser.contexts()) for (const pg of c.pages()) shots.push(await evidence(pg, "at the error").catch(() => null));
    check("ran to the end without an error", false, { error: String(e?.stack ?? e).slice(0, 600), shots });
    for (const c of browser.contexts()) await c.close().catch(() => {});
  }
  note("seconds", Math.round((Date.now() - t) / 1000));
}

/* =====================================================================================
 * B. A company unlock: quote, cancel, confirm, again, double click; Free and Pro
 * ===================================================================================== */
const unlockItem = (k) => ({ entity: "company", id: co(k).id, field: "identity" });
const quoteOf = async (as, k) => (await act(as, { type: "unlockMany", items: [unlockItem(k)], quote: true })).json?.quote ?? null;
const spentLines = (ledger) => (ledger ?? []).filter((l) => l.delta < 0);

async function journeyB() {
  // Free: the quote, as the server works it out, and as the app shows it.
  const K = 4; // a company the Free member hasn't opened
  const q = await quoteOf("free", K);
  check("Free: the quote for a company is 2 credits, nothing spent by quoting", q?.cost === 2 && q.credits === 25 && (await balanceOf("free")) === 25, q);
  const qPro = await quoteOf("pro", K);
  check("Pro: the same company's quote is 0 credits", qPro?.cost === 0, qPro);
  const qTrial = await quoteOf("trial", K);
  check("Trial: the same company's quote is 0 credits (within the day's 40)", qTrial?.cost === 0, qTrial);

  const ctx = await contextFor("free");
  const page = await ctx.newPage();
  const posts = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/table") && posts.push(r.postData() ?? ""));
  await page.goto(`${BASE}/?c=${co(K).id}`);
  await settle(page);
  const unlockBtn = page.getByRole("button", { name: /^(Unlock|Open) company for 2 credits/ }).filter({ visible: true }).first();
  await page.waitForTimeout(1500);
  await clickFor(page, page.getByRole("button", { name: "See what opens it" }), unlockBtn);
  check("the record names the price on its button before anything is spent", /2 credits/.test(await unlockBtn.innerText()));
  await unlockBtn.click();
  const dlg = page.getByRole("dialog").filter({ hasText: /Spend 2 credits/ });
  await dlg.waitFor({ timeout: 5000 });
  const dlgText = (await dlg.innerText()).replace(/\s+/g, " ");
  check("the confirm shows the quote: 2 credits of 25, 23 left", /Spend 2 credits of your 25/.test(dlgText) && /23 credits left/.test(dlgText), dlgText);
  await evidence(page, "unlock confirm (quote)");
  // Cancel: nothing spent.
  await dlg.getByRole("button", { name: "Not now" }).click();
  await page.waitForTimeout(800);
  check("Not now closes the confirm", (await page.getByRole("dialog").filter({ hasText: /Spend 2 credits/ }).count()) === 0);
  check("cancel spends nothing: balance 25, no ledger line, no unlock sent", (await balanceOf("free")) === 25 && spentLines(await ledgerOf("free")).length === 0 && !posts.some((p) => /"type":"unlock/.test(p)), posts);
  // Confirm, with a double click on the confirm button: one unlock, 2 credits.
  await unlockBtn.click();
  await dlg.waitFor({ timeout: 5000 });
  const confirm = dlg.getByRole("button", { name: /(Unlock|Open) · 2 credits/ });
  await confirm.dblclick().catch(() => {});
  await page.waitForTimeout(2500);
  await evidence(page, "unlocked");
  const after = await balanceOf("free");
  const spent = spentLines(await ledgerOf("free"));
  check("confirm (double-clicked) debits exactly the quote, once: 25 -> 23", after === 23, { after, spent });
  check("one ledger line of -2 for that company", spent.length === 1 && spent[0].delta === -2, spent);
  const sentUnlocks = posts.filter((p) => /"type":"unlock/.test(p)).length;
  note("unlock requests the double click sent", sentUnlocks);
  check("the company's name shows after the unlock", (await page.getByText(seedCo(K).fields.name).count()) > 0);
  // Again: 0.
  const q2 = await quoteOf("free", K);
  check("a repeated unlock of the same company quotes 0", q2?.cost === 0, q2);
  const r2 = await act("free", { type: "unlock", ...unlockItem(K) });
  check("…and costs 0: balance stays 23", (await balanceOf("free")) === 23, r2.json);
  // Two unlocks of another company at the same moment (two tabs): charged once.
  const K2 = 8;
  const [a, b] = await Promise.all([act("free", { type: "unlock", ...unlockItem(K2) }), act("free", { type: "unlock", ...unlockItem(K2) })]);
  check("two unlocks at once (a double submit) spend 2 credits once", (await balanceOf("free")) === 21 && spentLines(await ledgerOf("free")).length === 2, { a: a.json?.message ?? a.json?.error, b: b.json?.message ?? b.json?.error });
  // Retry after the answer is lost: the same unlock again is 0.
  await act("free", { type: "unlock", ...unlockItem(K2) });
  check("a retry of a done unlock spends nothing", (await balanceOf("free")) === 21);
  // Pro: the record has no price, and an unlock changes no balance.
  const pb = await balanceOf("pro");
  await act("pro", { type: "unlock", ...unlockItem(K) });
  check("Pro: opening the company spends nothing", (await balanceOf("pro")) === pb, { pb });
  const pctx = await contextFor("pro");
  const pp = await pctx.newPage();
  await pp.goto(`${BASE}/?c=${co(K + 1).id}`);
  await settle(pp);
  check("Pro: the record shows the company by name with no unlock price", (await pp.getByText(seedCo(K + 1).fields.name).count()) > 0 && (await pp.getByRole("button", { name: /^(Unlock|Open) company for \d+ credits?/ }).count()) === 0);
  await evidence(pp, "pro record no price");
  await pctx.close();
  await ctx.close();
}

/* =====================================================================================
 * A. A saved audience: filters back on return, one alert for one new matching role
 * ===================================================================================== */
const scanRole = (n, k, fn, title, extra = {}) => ({ key: `journey:${n}`, company: seedCo(k).fields.name, domain: `qaco${k}.example`, title, function: fn, type: "Fractional", url: `https://jobs.example/journey/${n}`, source: "journey-board", postedAt: null, rate: "$150/hr", hoursPerWeek: 10, ...extra });
const scan = (roles) => cron("/api/table/scan", { roles, sources: [{ source: "journey-board", fetched: roles.length, matched: roles.length }] });
const inboxOf = async (as) => (await req("GET", "/api/table?inbox=1", { as })).json;

async function journeyA() {
  const who = "free2";
  const ctx = await contextFor(who);
  const page = await ctx.newPage();
  const saves = [];
  page.on("request", (r) => r.method() === "POST" && /"savedView"/.test(r.postData() ?? "") && saves.push(r.postData()));
  await page.goto(`${BASE}/?t=seats&v=hiring&f=industry:SaaS`);
  await settle(page);
  await evidence(page, "hiring now filtered to SaaS");
  await page.getByRole("button", { name: "Save view with an alert" }).first().click();
  const panel = page.getByRole("complementary", { name: "Saved view and alert" });
  await panel.waitFor({ timeout: 5000 });
  const keeps = (await panel.innerText()).replace(/\s+/g, " ");
  check("the save panel says what it keeps: the function and the industry filter", /Function: Sales/.test(keeps) && /SaaS/.test(keeps), keeps.slice(0, 300));
  await evidence(page, "save view with an alert");
  const saveBtn = panel.getByRole("button", { name: /Save view and alert/ });
  await saveBtn.dblclick();
  await page.waitForTimeout(2000);
  const me = (await today(who)).me;
  const saved = me.savedViews ?? [];
  check("a double click on Save keeps one saved view", saved.length === 1, saved.map((v) => v.name));
  const v = saved[0];
  check("the saved view keeps the industry filter and its alert is on", !!v && /industry%3ASaaS|industry:SaaS/.test(v.place ?? "") && v.alert?.on === true, v);
  note("save requests sent by the double click", saves.length);

  // Away and back: the filters come back.
  await page.goto(`${BASE}/`);
  await settle(page);
  const href = `${BASE}/?${v.place}`;
  await page.goto(href);
  await settle(page);
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("opened again, the view's filters are back (Industry: SaaS) and its alert reads on", /SaaS/.test(body) && /Alert on/.test(body), body.slice(0, 400));
  check("…and it lists only SaaS roles", (await page.locator("main tbody tr").count()) > 0 && !/Fintech|Health Care/.test(await page.locator("main tbody").innerText().catch(() => "")));
  await evidence(page, "saved view opened again");
  await page.reload();
  await settle(page);
  check("a reload keeps the same view", /SaaS/.test(await page.locator("main").innerText()) && page.url().includes("industry"));

  // One new matching role sets it off; one that doesn't match, and the same role again, don't.
  const before = (await inboxOf(who))?.items?.length ?? 0;
  const K = 24; // SaaS; a title it doesn't have open yet
  const r1 = await scan([scanRole("a1", K, "Sales", "Fractional Chief Revenue Officer"), scanRole("a2", 30, "Finance", "Fractional Controller")]);
  check("the scan stored the new roles", r1.status === 200 && r1.json?.result?.opened >= 1, r1.json);
  const box = await until(async () => {
    const b = await inboxOf(who);
    return (b?.items?.length ?? 0) > before ? b : null;
  }, 10_000);
  const lines = (box?.items ?? []).filter((x) => x.alert === `list:${v.id}`);
  check("the alert fires once, in the bell, for the one new matching role", lines.length === 1 && /1 new open role/.test(lines[0].line), box?.items);
  check("…naming the company that posted it", lines[0]?.href === `/?c=${co(K).id}`, lines[0]?.href);
  await scan([scanRole("a1", K, "Sales", "Fractional Chief Revenue Officer"), scanRole("a2", 30, "Finance", "Fractional Controller")]);
  await sleep(2000);
  const again = ((await inboxOf(who))?.items ?? []).filter((x) => x.alert === `list:${v.id}`);
  check("the same roles in the next scan don't fire it again", again.length === 1, again);
  await scan([scanRole("a3", 31, "Finance", "Fractional Head of Finance")]);
  await sleep(2000);
  check("a new role that doesn't match (Finance, not SaaS) doesn't fire it", ((await inboxOf(who))?.items ?? []).filter((x) => x.alert === `list:${v.id}`).length === 1);
  await page.goto(`${BASE}/`);
  await settle(page);
  const bell = page.getByRole("button", { name: /notification|alert|bell/i }).first();
  if (await bell.count()) {
    await bell.click();
    await page.waitForTimeout(800);
    check("the bell lists the alert", /1 new open role/.test(await page.locator("body").innerText()));
    await evidence(page, "bell with the alert");
    await page.keyboard.press("Escape");
  } else check("the bell is on the page", false);
  await ctx.close();
}

/* =====================================================================================
 * Warm paths for the Sales persona (the trial member): their own LinkedIn file. Made-up people:
 * the CEO of Qaco3 directly (no one in between), and Tatum, who holds the seat at Qaco15 (one
 * person in between to its CEO; Qaco15 has an open role).
 * ===================================================================================== */
const DIRECT_K = 3;
const INTRO_K = 15;
const TATUM = { first: "Tatum", last: "Jessupqa", email: "tatum.jessupqa@example.com" };
let pathsReady = false;
async function warmPaths() {
  if (pathsReady) return;
  const ceo = ceoOf(DIRECT_K);
  const [f, l] = ceo.name.split(" ");
  const csv = [
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    `${f},${l},https://www.linkedin.com/in/qa-ceo-${DIRECT_K},${ceo.email},${seedCo(DIRECT_K).fields.name},CEO,01 Mar 2024`,
    `${TATUM.first},${TATUM.last},https://www.linkedin.com/in/qa-tatum,${TATUM.email},${seedCo(INTRO_K).fields.name},Fractional RevOps Lead,02 Mar 2025`,
  ].join("\n");
  const r = await req("POST", "/api/paths", { as: "trial", body: { op: "import", csv }, headers: { origin: BASE } });
  check("the Sales persona's LinkedIn file (2 made-up connections) is read", r.status === 200 && r.json?.view?.linkedin?.rows === 2, r.json);
  for (const k of [DIRECT_K, INTRO_K]) await act("trial", { type: "unlock", ...unlockItem(k) });
  pathsReady = true;
}
const wayOf = async (as, k) => (await req("GET", `/api/paths?way=${co(k).id}`, { as })).json?.way;
const outbox = async (as) => (await req("GET", "/api/send", { as })).json?.view;

/* =====================================================================================
 * C. An intro from a warm path: nothing sent until Approve, Approve once, Undo never sends
 * ===================================================================================== */
async function journeyC() {
  await warmPaths();
  const way = await wayOf("trial", INTRO_K);
  const route = (way?.routes ?? []).find((r) => r.between === 1);
  check("the warm path to Qaco15's CEO goes through Tatum (one person in between)", !!route && /Tatum/.test(route.chain), way?.routes?.map((r) => r.chain));
  const step = route?.steps?.find((s) => s.note);
  const n = step?.note;
  check("the intro is drafted to Tatum, the introducer, at Tatum's own address (not the CEO)", n?.email === TATUM.email && /Tatum/.test(n?.to ?? ""), n);
  check("the draft names the company it is about", new RegExp(seedCo(INTRO_K).fields.name).test(`${n?.subject} ${n?.body}`), n);
  const ctx = await contextFor("trial");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?p=warm`);
  await settle(page);
  await evidence(page, "warm paths");
  check("nothing has gone to Gmail before Approve", gmailSent.length === 0 && ((await outbox("trial"))?.items ?? []).length === 0, gmailSent);

  const draft = { key: `journey:intro:${co(INTRO_K).id}`, to: n.email, toName: `${TATUM.first} ${TATUM.last}`, subject: n.subject, body: n.body, kind: "intro", company: co(INTRO_K).id, effect: { type: "pipeline.sent", companyId: co(INTRO_K).id, channel: "intro", to: { name: `${TATUM.first} ${TATUM.last}`, role: "introducer" }, from: "network", intro: true } };
  // Double submit: two taps at once on the same draft.
  const [t1, t2] = await Promise.all([tap("trial", "/api/send", { op: "approve", draft }), tap("trial", "/api/send", { op: "approve", draft })]);
  const items = (await outbox("trial"))?.items ?? [];
  check("two Approve taps at once make one note", items.length === 1 && t1.status === 200 && t2.status === 200, { items, t1: t1.json, t2: t2.json });
  const first = t1.json?.item ?? t2.json?.item;
  const grant = t1.json?.grant ?? t2.json?.grant;
  check("the first Approve asks Google once for permission to send, and the note waits", first?.status === "grant" && !!grant, first);
  // Google's consent (the fake one says yes), then back to Merlin.
  await page.goto(BASE + grant);
  await page.waitForLoadState("domcontentloaded");
  await settle(page);
  const it1 = await until(async () => ((await outbox("trial"))?.items ?? []).find((x) => x.id === first.id && x.status === "queued"), 8000);
  check("back from Google, the note is queued for its 30 seconds (Undo still possible), not sent", !!it1 && gmailSent.length === 0, it1 ?? (await outbox("trial")));
  // A second note, approved then undone.
  const draft2 = { ...draft, key: `journey:intro2:${co(INTRO_K).id}`, subject: `${n.subject} (2)` };
  const a2 = await tap("trial", "/api/send", { op: "approve", draft: draft2 });
  const u2 = await tap("trial", "/api/send", { op: "cancel", id: a2.json?.item?.id });
  check("Undo inside the 30 seconds cancels it", u2.status === 200 && ((await outbox("trial"))?.items ?? []).find((x) => x.id === a2.json?.item?.id)?.status === "cancelled", { a2: a2.json?.item?.status, u2: u2.json });
  const re2 = await tap("trial", "/api/send", { op: "approve", draft: { ...draft2, id: a2.json?.item?.id } });
  check("the undone note can't be approved again by its id", re2.status === 400, re2.json);
  // A retry of the first, while it waits: the same note.
  const retry = await tap("trial", "/api/send", { op: "approve", draft });
  check("a retry of the same draft is the same note (again), not a second one", retry.json?.again === true && retry.json?.item?.id === first.id, retry.json);
  // Wait out the 30 seconds.
  const sent = await until(async () => gmailSent.filter((m) => m.to.includes(TATUM.email)).length >= 1, 50_000, 1000);
  await sleep(4000);
  const toTatum = gmailSent.filter((m) => m.to.includes(TATUM.email));
  check("after 30 seconds it went from the member's Gmail exactly once", !!sent && toTatum.length === 1 && toTatum[0].subject === n.subject, gmailSent.map((m) => [m.to, m.subject]));
  check("the undone note never went", !gmailSent.some((m) => m.subject === draft2.subject));
  const after = await tap("trial", "/api/send", { op: "approve", draft });
  check("Approve on the sent draft again sends nothing more", after.json?.again === true && gmailSent.filter((m) => m.to.includes(TATUM.email)).length === 1, after.json);
  const c3 = await tap("trial", "/api/send", { op: "cancel", id: first.id });
  check("a sent note can't be cancelled (it says it went)", c3.status === 400 && /went already/.test(c3.json?.error ?? ""), c3.json);
  const noTap = await req("POST", "/api/send", { as: "trial", body: { op: "approve", draft: { ...draft, key: "journey:notap" } } });
  check("an approve without the app's tap (another site, a script) is refused", noTap.status === 403, noTap.status);
  // The pipeline follows the sent intro.
  const pl = (await req("GET", "/api/table?pipeline=1", { as: "trial" })).json;
  const deal = (pl?.entries ?? []).find((e) => e.company === co(INTRO_K).id);
  check("the sent intro puts the company in the pipeline, once", (pl?.entries ?? []).filter((e) => e.company === co(INTRO_K).id).length === 1 && deal?.stage === "sent", pl?.entries?.map((e) => [e.name, e.stage]));
  check("…recorded as sent to Tatum, the person chosen", /Tatum/.test(JSON.stringify(deal?.to ?? {})), deal?.to);
  await page.goto(`${BASE}/?p=pipeline`);
  await settle(page);
  await evidence(page, "pipeline after the intro");
  await ctx.close();
}

/* =====================================================================================
 * D. Pipeline, a proposal from the deal, signature, Won, Contracts
 * ===================================================================================== */
const P = (as, b) => req("POST", "/api/proposals", { as, body: b, headers: { origin: BASE } });
const pipelineOf = async (as) => (await req("GET", "/api/table?pipeline=1", { as })).json;
const dealAt = async (as, k) => ((await pipelineOf(as))?.entries ?? []).filter((e) => e.company === co(k).id);
const FILL = {
  "client.signerName": "Sawyer Callowayqa",
  "client.signerTitle": "CEO",
  "pricing.monthlyFee": "$9,000",
  "pricing.allocation": "two days a week",
  "start.date": "January 5, 2027",
  "terms.governingLaw": "the State of Connecticut",
  pains: "The forecast is a guess every month.",
  seats: "Fractional VP Sales",
  "goals.target": "A steadier pipeline",
  "discovery.callDate": "November 20, 2026",
};
async function fillBlanks(as, id) {
  let last = null;
  for (let i = 0; i < 4; i++) {
    const cur = (await req("GET", `/api/proposals?id=${id}`, { as })).json;
    const p = cur?.proposal ?? cur;
    const fields = { ...FILL };
    for (const k of Object.keys(p?.fields ?? {})) delete fields[k];
    const u = await P(as, { op: "update", id, setFields: fields, rev: p?.rev });
    last = u;
    const blanks = /Fill the .*?first: (.*)\.$/.exec(u.json?.error ?? "")?.[1];
    if (!blanks) break;
  }
  return last;
}
async function signAs(token, signer) {
  const S = (body) => req("POST", "/api/sign", { body: { token, ...body } });
  const v = await S({ op: "view" });
  const before = mails.length;
  await S({ op: "code" });
  const m = await until(async () => mails.slice(before).reverse().find((x) => JSON.stringify(x.to).includes(signer.email) && /\b\d{6}\b/.test(x.text ?? "")), 8000);
  const code = /\b(\d{6})\b/.exec(m?.text ?? "")?.[1];
  const ver = await S({ op: "verify", code });
  const sign = () => S({ op: "sign", name: signer.name, consent: true, hash: v.json?.hash });
  return { v, code, ver, sign };
}

async function journeyD() {
  const who = "close";
  const K = 9;
  const ctx = await contextFor(who);
  const page = await ctx.newPage();
  // Add to pipeline from the record, double-clicked: one deal.
  await page.goto(`${BASE}/?c=${co(K).id}`);
  await settle(page);
  const add = page.getByRole("button", { name: /Add to pipeline/ }).first();
  await add.waitFor({ timeout: 8000 });
  await add.dblclick();
  await page.waitForTimeout(2000);
  await evidence(page, "added to pipeline");
  let deals = await dealAt(who, K);
  check("Add to pipeline, double-clicked, makes one deal", deals.length === 1, deals.map((d) => d.stage));
  const v = await act(who, { type: "pipeline.value", id: deals[0]?.id, value: "9000", pitch: "Fractional VP Sales" });
  deals = await dealAt(who, K);
  check("the deal is worth $9,000 a month", deals[0]?.value === 9000 && deals[0]?.monthly === 9000, { v: v.json?.message ?? v.json?.error, d: deals[0] });

  // A proposal from the deal, as the app starts it: the deal's Start a proposal, then the company on Proposals.
  const before = ((await req("GET", "/api/proposals", { as: who })).json?.proposals ?? []).length;
  let prId = null;
  await page.goto(`${BASE}/?p=pipeline`);
  await settle(page);
  await page.waitForTimeout(1500);
  const start = page.getByRole("button", { name: /Start a proposal/ }).filter({ visible: true }).first();
  if (await clickFor(page, page.getByText(seedCo(K).fields.name).first(), start)) {
    await evidence(page, "deal drawer");
    const tapCo = page.locator("main").getByRole("button", { name: new RegExp(seedCo(K).fields.name) }).first();
    if (await clickFor(page, start, tapCo)) {
      const quick = page.waitForRequest((r) => r.method() === "POST" && /"op":"quick"/.test(r.postData() ?? ""), { timeout: 10_000 }).catch(() => null);
      await tapCo.click();
      const q = await quick;
      note("the app's start from the deal sent", q?.postData() ?? null);
      await page.waitForURL(/pr=/, { timeout: 10_000 }).catch(() => {});
      await settle(page);
    }
  }
  let list = (await req("GET", "/api/proposals", { as: who })).json?.proposals ?? [];
  if (list.length > before) prId = list[0].id;
  check("Start a proposal from the deal makes the proposal in the app", !!prId, list.map((p) => p.title));
  if (!prId) prId = (await P(who, { op: "quick", companyId: co(K).id })).json?.proposal?.id;
  await evidence(page, "proposal from the deal");
  let pr = (await req("GET", `/api/proposals?id=${prId}`, { as: who })).json;
  pr = pr?.proposal ?? pr;
  check("the proposal is for the deal's company", pr?.company?.id === co(K).id, pr?.company);
  check("the deal's value is carried into the proposal ($9,000 a month)", /9,000/.test(pr?.fields?.["pricing.monthlyFee"] ?? ""), { monthlyFee: pr?.fields?.["pricing.monthlyFee"] ?? null, deal: 9000 });

  // Cancel mid-flow: a second draft, deleted.
  const cr = await P(who, { op: "create", companyId: co(K).id });
  const extra = cr.json?.proposal?.id ?? cr.json?.id;
  note("a second draft for the cancel", cr.json?.error ?? extra);
  const del = await P(who, { op: "delete", id: extra });
  list = (await req("GET", "/api/proposals", { as: who })).json?.proposals ?? [];
  check("a draft deleted mid-flow is gone and sends nothing", del.status === 200 && !list.some((p) => p.id === extra), del.json);

  // Fill what is left and send for signature, twice at once.
  const filled = await fillBlanks(who, prId);
  const signer = { name: "Sawyer Callowayqa", email: "signer.qaco9@example.com", title: "CEO" };
  const mailsBefore = mails.length;
  const [s1, s2] = await Promise.all([P(who, { op: "send", id: prId, signer, memberSign: "none", linkDays: 30 }), P(who, { op: "send", id: prId, signer, memberSign: "none", linkDays: 30 })]);
  const okSends = [s1, s2].filter((x) => x.status === 200).length;
  const toSigner = await until(async () => mails.slice(mailsBefore).filter((m) => JSON.stringify(m.to).includes(signer.email)), 8000);
  check("sent for signature: two sends at once give one send and one email to the signer", okSends === 1 && toSigner.length === 1, { s1: s1.json?.error ?? "ok", s2: s2.json?.error ?? "ok", mails: toSigner.length, filled: filled?.json?.error ?? "filled" });
  const token = /\/sign\/(s_[A-Za-z0-9_.-]+)/.exec(`${toSigner?.[0]?.text ?? ""} ${toSigner?.[0]?.html ?? ""}`)?.[1];
  check("the signer's email carries their signing link", !!token);
  const retrySend = await P(who, { op: "send", id: prId, signer, memberSign: "none", linkDays: 30 });
  check("a retry of the send is refused while it is out (no second email)", retrySend.status !== 200 && mails.filter((m) => JSON.stringify(m.to).includes(signer.email)).length === 1, retrySend.json);
  deals = await dealAt(who, K);
  check("the deal moved to Proposal", deals[0]?.stage === "proposal", deals[0]?.stage);

  // The client signs, on the signing page in a browser of their own.
  const sctx = await browser.newContext({ viewport: { width: 779, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": freshIp() } });
  const sp = await sctx.newPage();
  await sp.goto(`${BASE}/sign/${token}`);
  await settle(sp);
  await evidence(sp, "signing page");
  const s = await signAs(token, signer);
  check("the signer verifies with the emailed code", !!s.code && s.ver.status === 200, s.ver.json);
  const [g1, g2] = await Promise.all([s.sign(), s.sign()]);
  check("two signs at once: signed once", [g1, g2].filter((x) => x.status === 200).length >= 1, { g1: g1.json?.error ?? "ok", g2: g2.json?.error ?? "ok" });
  const again = await s.sign();
  check("signing again after it is signed changes nothing", again.status !== 200 || /signed/i.test(JSON.stringify(again.json)), again.json);
  await sp.reload();
  await settle(sp);
  await evidence(sp, "signed");
  await sctx.close();
  pr = (await req("GET", `/api/proposals?id=${prId}`, { as: who })).json;
  pr = pr?.proposal ?? pr;
  check("the proposal reads signed", /signed/i.test(pr?.status ?? ""), pr?.status);
  deals = await until(async () => {
    const d = await dealAt(who, K);
    return d[0]?.stage === "won" ? d : null;
  }, 8000) ?? (await dealAt(who, K));
  check("the deal is Won, once, with its $9,000 a month", deals.length === 1 && deals[0]?.stage === "won" && deals[0]?.monthly === 9000, deals.map((d) => ({ stage: d.stage, monthly: d.monthly, log: d.log?.map((l) => l.text) })));
  const wonLines = (deals[0]?.log ?? []).filter((l) => /won/i.test(l.text));
  check("…with one Won line in the deal's log", wonLines.length === 1, deals[0]?.log);
  const pl = await pipelineOf(who);
  check("the pipeline's won total is $9,000", pl?.wonMonthly === 9000, { wonMonthly: pl?.wonMonthly });
  const ct = (await req("GET", "/api/contracts", { as: who })).json;
  const row = JSON.stringify(ct ?? {}).includes(prId) || JSON.stringify(ct ?? {}).includes(seedCo(K).fields.name);
  check("the signed agreement is listed on Contracts", ct?.on === true && row, JSON.stringify(ct).slice(0, 400));
  await page.goto(`${BASE}/?p=contracts`);
  await settle(page);
  check("Contracts shows it in the app", (await page.getByText(seedCo(K).fields.name).count()) > 0);
  await evidence(page, "contracts with the agreement");
  await page.goto(`${BASE}/?p=pipeline`);
  await settle(page);
  await evidence(page, "pipeline won");
  await ctx.close();
}

/* =====================================================================================
 * E. A workflow from a template: Make live, the event, the approval waits, approve once
 * ===================================================================================== */
const W2 = (as, b) => req("POST", "/api/workflows2", { as, body: b, headers: { origin: BASE } });
const wfList = async (as) => (await req("GET", "/api/workflows2", { as })).json;
const wfRuns = async (as, id) => (await req("GET", `/api/workflows2?id=${id}&runs=1`, { as })).json?.runs ?? [];

async function journeyE() {
  const who = "wf";
  const ctx = await contextFor(who);
  const page = await ctx.newPage();
  const posts = [];
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/workflows2") && posts.push(r.postData() ?? ""));
  await page.goto(`${BASE}/?p=alerts`);
  await settle(page);
  await evidence(page, "workflow templates");
  // The template's own Use template button: the first one whose card names it.
  const idx = await page.$$eval("button", (bs) => bs.filter((b) => b.innerText.trim() === "Use template").findIndex((b) => { let p = b.parentElement; for (let i = 0; i < 6 && p; i++, p = p.parentElement) if (/Who's hiring for my expertise/.test(p.innerText) && !/Be first in the door/.test(p.innerText)) return true; return false; }));
  const use = page.getByRole("button", { name: "Use template" }).nth(Math.max(0, idx));
  await use.dblclick();
  await page.waitForTimeout(2500);
  let lst = await wfList(who);
  const mine = (lst?.workflows ?? []);
  check("Use template, double-clicked, makes one workflow, a draft and off", mine.length === 1 && !mine[0].on, mine.map((w) => ({ name: w.name, on: w.on, live: w.live })));
  const wf = mine[0];
  check("it is the template's workflow, with a monthly limit", /hiring for my expertise/i.test(wf?.name ?? "") && Number.isFinite(wf?.cap), wf);
  await evidence(page, "workflow from the template");
  // Test workflow: nothing spent, nothing sent.
  const bal0 = await balanceOf(who);
  const sent0 = gmailSent.length;
  const testBtn = page.getByRole("button", { name: "Test workflow" });
  if (await testBtn.count()) {
    await testBtn.click();
    await page.waitForTimeout(3000);
    await evidence(page, "test run");
    const dlg = page.getByRole("dialog").filter({ hasText: "Test run" });
    check("the test run says nothing was spent or sent", /Nothing was spent or sent/.test(await dlg.innerText().catch(() => "")));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (await dlg.count()) await dlg.getByRole("button", { name: /close/i }).first().click().catch(() => {});
    check("Escape closes the test run", (await dlg.count()) === 0);
  }
  let tr = (await wfRuns(who, wf.id)).find((r) => r.test);
  if (!tr) tr = (await W2(who, { op: "test", id: wf.id, sample: { company: co(24).id } })).json?.run;
  check("a test run spends nothing and sends nothing", !!tr && tr.spent === 0 && (await balanceOf(who)) === bal0 && gmailSent.length === sent0, tr ? { spent: tr.spent, status: tr.status } : posts.slice(-2));
  // Make live.
  const live = page.getByRole("button", { name: "Make live" }).first();
  const confirmLive = page.getByRole("dialog").filter({ hasText: "Make it live" });
  await clickFor(page, live, confirmLive);
  const cl = (await confirmLive.innerText().catch(() => "")).replace(/\s+/g, " ");
  // What it may spend: the most a run costs and the limit, or, when no step costs anything on the plan, that it costs nothing.
  check("Make live first says what it may spend and the monthly limit", (/credits a run/.test(cl) && /Stops at \d+ credits this month/.test(cl)) || /Nothing it does costs credits on (Close|Pro|your plan)/.test(cl), cl.slice(0, 300));
  await evidence(page, "make it live confirm");
  await confirmLive.getByRole("button", { name: "Not yet" }).click();
  await page.waitForTimeout(800);
  check("Not yet (cancel mid-flow) leaves it a draft, off", ((await wfList(who))?.workflows ?? []).find((w) => w.id === wf.id)?.on === false);
  await clickFor(page, live, confirmLive);
  await confirmLive.getByRole("button", { name: "Make live" }).dblclick();
  await page.waitForTimeout(2500);
  await evidence(page, "made live");
  lst = await wfList(who);
  const on = (lst?.workflows ?? []).find((w) => w.id === wf.id);
  check("Make live turns it on", on?.on === true, on);
  // The monthly limit, made reachable: the same template with Find their email on (1 credit on every plan, Close included)
  // and a limit of 1 credit, live before the event, so the first of two events spends the 1 and the second meets the limit.
  const saved0 = JSON.parse(posts.find((x) => /"op":"save"/.test(x)) ?? "null");
  let capWf = null;
  if (saved0?.version?.nodes) {
    const v = structuredClone(saved0.version);
    // On companies the member follows (two of them, followed here), so its two events are its own.
    const trig = v.nodes.find((n) => n.id === "s_trigger");
    if (trig) trig.settings = { ...trig.settings, scope: { kind: "follows" } };
    for (const k of [70, 71]) await act(who, { type: "follow", companyId: co(k).id, on: true });
    if (!v.nodes.some((n) => n.type === "find.email")) {
      v.nodes.push({ id: "s_email", type: "find.email", name: "Find their email", on: true, settings: {}, pos: { x: 0, y: 350 } });
      v.edges = v.edges.filter((e) => !(e.from === "s_dm" && e.to === "s_way"));
      v.edges.push({ id: "e_s_dm_main_s_email", from: "s_dm", out: "main", to: "s_email" }, { id: "e_s_email_main_s_way", from: "s_email", out: "main", to: "s_way" });
    }
    const sv = await W2(who, { ...saved0, name: "Monthly limit check", cap: 1, version: v });
    note("the limit check: the template with Find their email, a limit of 1", sv.json?.error ?? sv.json?.id);
    if (sv.status === 200) {
      const lv = await W2(who, { op: "live", id: sv.json.id });
      const onv = await W2(who, { op: "on", id: sv.json.id, on: true });
      note("the limit check made live", lv.json?.error ?? onv.json?.error ?? "live");
      capWf = sv.json.id;
    }
  }
  // The event: a new role in the member's function at a company in their Crystal Ball (two of them, for the limit check).
  const runs0 = (await wfRuns(who, wf.id)).filter((r) => !r.test).length;
  await scan([scanRole("e1", 48, "Sales", "Fractional Head of Sales"), scanRole("e1c", 70, "Sales", "Fractional VP Sales"), scanRole("e1d", 71, "Sales", "Fractional Sales Leader")]);
  for (let i = 0; i < 4; i++) {
    await req("GET", "/api/table", { as: who });
    await sleep(1500);
  }
  let run = await until(async () => (await wfRuns(who, wf.id)).filter((r) => !r.test)[runs0] ?? null, 15_000, 1000);
  if (run) note("the run as it first stood", (await req("GET", `/api/workflows2?id=${wf.id}&run=${run.id}`, { as: who })).json?.run?.nodes?.map((n) => ({ node: n.node, status: n.status, note: n.note ?? null, error: n.error ?? null })));
  check("the event (a new role in the member's function) starts a run by itself", !!run, (await wfRuns(who, wf.id)).length);
  if (!run) {
    const rn = await W2(who, { op: "run", id: wf.id });
    note("no run from the event: Run now used to go on", rn.json?.error ?? "run now");
    run = await until(async () => (await wfRuns(who, wf.id)).filter((r) => !r.test)[runs0] ?? null, 10_000, 1000);
  }
  check("the run waits at the approval, nothing sent", run?.status === "waiting" && gmailSent.length === sent0, run && { status: run.status, wait: run.wait });
  const ib = await inboxOf(who);
  // The approval is asked in the bell: a yes/no question carries the run (ask.run); a note to approve says so and opens the outbox.
  check("the approval is asked in the bell", (ib?.items ?? []).some((x) => x.ask?.run === run?.id || /^A note waits for (your tap|you)/.test(x.line ?? "")), ib?.items?.map((x) => x.line));
  const waitOn = (await req("GET", `/api/workflows2?id=${wf.id}&run=${run?.id}`, { as: who })).json?.run?.wait?.outbox ?? null;
  const note0 = ((await outbox(who))?.items ?? []).find((x) => x.status === "draft" && x.kind === "workflow" && (!waitOn || x.id === waitOn));
  let y1, y2;
  if (note0 && !note0.to) {
    // Who decides there has no email open on this plan (a paid detail): the note waits with an empty To (journey E1, fixed).
    check("with no address open, the note waits in the outbox for the member to add who it is to (never failed, never sent to nobody)", note0.to === "" && run?.status === "waiting", note0);
    const noAddr = await W2(who, { op: "answer", run: run?.id, yes: true });
    check("a yes from the run before the address is added is refused, and nothing is sent", noAddr.status !== 200 && /Add who it is to first/.test(noAddr.json?.error ?? "") && gmailSent.length === sent0, noAddr.json);
    // The member types the address in the outbox, then Approve and send: twice at once.
    const draft = { key: note0.key, id: note0.id, kind: "workflow", to: `buyer@${seedCo(48).fields.website}`, toName: note0.toName, subject: note0.subject, body: note0.body, company: note0.company };
    [y1, y2] = await Promise.all([tap(who, "/api/send", { op: "approve", draft }), tap(who, "/api/send", { op: "approve", draft })]);
    for (let i = 0; i < 3; i++) (await req("GET", "/api/table", { as: who }), await sleep(1200));
  } else {
    // Approve once, twice at once.
    [y1, y2] = await Promise.all([W2(who, { op: "answer", run: run?.id, yes: true }), W2(who, { op: "answer", run: run?.id, yes: true })]);
  }
  const notes = ((await outbox(who))?.items ?? []).filter((x) => x.kind === "workflow" && x.status !== "draft");
  await sleep(2500);
  const done = (await wfRuns(who, wf.id)).find((r) => r.id === run?.id);
  check("approve twice at once: one answer taken, the run goes on", [y1, y2].filter((x) => x.status === 200).length >= 1 && done?.status !== "waiting" && notes.length <= 1, { y1: y1.json?.error ?? "ok", y2: y2.json?.error ?? "ok", status: done?.status, notes: notes.length });
  const r3 = await W2(who, { op: "answer", run: run?.id, yes: true });
  check("a retry of the answer is refused (already answered)", r3.status !== 200, r3.json);
  const detail = (await req("GET", `/api/workflows2?id=${wf.id}&run=${run?.id}`, { as: who })).json;
  note("run nodes after approve", (detail?.run?.nodes ?? []).map((n) => ({ node: n.node, status: n.status, note: n.note ?? null, error: n.error ?? null, output: n.output ?? null })));
  const pipe = (await pipelineOf(who))?.entries ?? [];
  check("follow-through: the company is in the pipeline", pipe.length >= 1, pipe.map((e) => e.name));
  check("the run spent within its quote and the monthly limit", (done?.spent ?? 0) <= (wf.cap ?? Infinity), done?.spent);
  // The monthly limit: what a run would spend on this plan.
  const prices = (await wfList(who))?.prices;
  note("this plan's prices (a company, a person)", prices);
  // The limit on a plan where a run spends: the same template saved for the Free member with a limit of 1.
  const graph = JSON.parse(posts.find((x) => /"op":"save"/.test(x)) ?? "null");
  if (capWf) {
    // The limit check's runs: the first spends Find their email's 1 credit, the next meets the limit of 1 and waits for a yes.
    const capRuns = await until(async () => {
      const rs = (await wfRuns(who, capWf)).filter((r) => !r.test);
      return rs.length >= 2 ? rs : null;
    }, 20_000, 1500);
    const rs = capRuns ?? (await wfRuns(who, capWf)).filter((r) => !r.test);
    note("the limit check's runs", rs.map((r) => ({ status: r.status, waiting: r.waiting, spent: r.spent, quote: r.quote })));
    const spent = rs.reduce((n, r) => n + (r.spent ?? 0), 0);
    check("the limit check: a run spends Find their email's 1 credit, quoted before", rs.some((r) => r.spent === 1) && rs.every((r) => (r.spent ?? 0) <= (r.quote ?? Infinity)), rs.map((r) => [r.spent, r.quote]));
    check("cap reached makes a run wait for a yes, and the month never spends past the limit", rs.some((r) => r.status === "waiting" && r.waiting === "cap") && spent <= 1, rs.map((r) => [r.status, r.waiting, r.spent]));
    await W2(who, { op: "on", id: capWf, on: false });
  } else if (prices?.company > 0) check("cap reached makes a run wait for a yes", false, "not reached on this plan");
  else if (graph) {
    const fr = await W2("free", { ...graph, cap: 1 });
    note("the template saved on Free with a limit of 1", fr.json?.error ?? fr.json?.id);
    if (fr.status === 200) {
      const lv = await W2("free", { op: "live", id: fr.json.id });
      note("Make live on Free", lv.json?.error ?? "live");
      unverified("cap reached makes a run wait for a yes", `On Close and Pro every company opens for 0 credits, so a template run never spends and its limit is never reached; on Free: ${lv.json?.error ?? "made live, but no event reached it in this run"}.`);
    } else unverified("cap reached makes a run wait for a yes", `On Close and Pro a template run spends 0 credits (prices ${JSON.stringify(prices)}), so the limit is never reached; on Free the template is refused: ${fr.json?.error}`);
  } else unverified("cap reached makes a run wait for a yes", "the template's graph was not captured");
  await page.goto(`${BASE}/?p=alerts`);
  await settle(page);
  await evidence(page, "workflows after the run");
  await ctx.close();
}

/* =====================================================================================
 * P. The reviewer's fixture: Sales, Finance and Marketing personas; routes and their labels;
 *    a high-signal company with no vacancy, an opening through an introducer, a CEO known
 *    directly, an unmatched prospect, a priced and an unpriced deal, a referral partner, a
 *    call and an evidence record.
 * ===================================================================================== */
const HIGH_NO_VACANCY = 2; // a fractional CMO hired a month ago, no open role
const UNMATCHED = 5; // nothing on file but its name and site
async function journeyP() {
  await warmPaths();
  const personas = { trial: "Sales", fin: "Finance", mkt: "Marketing" };
  // Personalization by function.
  const heads = {};
  for (const [who, fn] of Object.entries(personas)) {
    const me = (await today(who))?.me;
    check(`${fn} persona: their own function and title`, me?.function === fn && new RegExp(fn === "Sales" ? "Sales" : fn === "Finance" ? "CFO" : "CMO").test(me?.title ?? ""), { fn: me?.function, title: me?.title });
    const ctx = await contextFor(who);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?t=seats&v=hiring`);
    await settle(page);
    heads[fn] = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 600);
    check(`${fn} persona: Hiring now opens on ${fn} roles for them`, new RegExp(`${fn} roles for me`).test(heads[fn]), heads[fn].slice(0, 200));
    await evidence(page, `hiring now ${fn}`);
    await page.goto(`${BASE}/`);
    await settle(page);
    await evidence(page, `home ${fn}`);
    await ctx.close();
  }
  // The same company's direct note, written for each persona's own function.
  for (const who of ["trial", "fin", "mkt"]) await act(who, { type: "unlock", ...unlockItem(6) });
  const notes = {};
  for (const [who, fn] of Object.entries(personas)) {
    const w = await wayOf(who, 6);
    const n = (w?.routes ?? [])[0]?.steps?.find((s) => s.note)?.note;
    notes[fn] = `${n?.subject ?? ""} ${n?.body ?? ""}`;
  }
  check("the note to the same company differs by persona and names each one's function", notes.Sales !== notes.Finance && notes.Finance !== notes.Marketing && /Sales/.test(notes.Sales) && /Finance|CFO/.test(notes.Finance) && /Marketing|CMO/.test(notes.Marketing), notes);
  const bodyFn = /I'm a fractional ([^.]+)\./.exec(notes.Sales)?.[1] ?? null;
  check("the Sales persona's note says what they do consistently (subject and body agree on the function)", !bodyFn || /Sales|Revenue|CRO/i.test(bodyFn), { body: bodyFn, note: notes.Sales.slice(0, 200) });

  // Routes and their labels: zero people in between is not a warm intro; one person is.
  const direct = await wayOf("trial", DIRECT_K);
  const dr = (direct?.routes ?? []).find((r) => r.src === "linkedin") ?? direct?.routes?.[0];
  check("the CEO known directly: the route has no one in between (graph: you and them)", dr?.between === 0 && dr?.nodes?.length === 2, dr && { between: dr.between, nodes: dr.nodes?.length });
  // The label every surface shows is the route's type (lib/paths routeTypeOf); its warmth band (way) only orders and places.
  check("a route with no one in between is not labelled Warm intro (direct connection)", dr && /^Direct (connection|outreach)$/.test(dr.type ?? "") && !/warm intro/i.test(`${dr.kind} ${dr.title} ${dr.short}`), dr && { type: dr.type, way: dr.way, kind: dr.kind, title: dr.title, between: dr.between });
  check("…and its steps don't promise a reply or a meeting (they are possible next steps)", dr && !(dr.how ?? []).some((h) => /^\S+ replies$|^You meet /.test(h)) && (dr.how ?? []).some((h) => /may reply|^If .+ replies/.test(h)), dr?.how);
  const intro = await wayOf("trial", INTRO_K);
  const ir = (intro?.routes ?? []).find((r) => r.between === 1);
  check("the opening reached through Tatum: one person in between, labelled Warm intro", (ir?.type ?? ir?.way) === "Warm intro" && ir?.nodes?.length === 3 && !!intro?.openRole, ir && { type: ir.type, way: ir.way, nodes: ir.nodes?.length, openRole: intro?.openRole });
  const warm = (await req("GET", "/api/paths?warm=1", { as: "trial" })).json?.warm;
  for (const [k, r] of [[DIRECT_K, dr], [INTRO_K, ir]]) {
    const row = (warm?.rows ?? []).find((x) => x.id === co(k).id);
    if (!row) {
      unverified(`Warm paths summary agrees with the route for Qaco${k}`, "the company is not on the member's Warm paths map (it doesn't fit their ideal client)");
      continue;
    }
    check(`Warm paths summary agrees with the route for Qaco${k} (same label, same kind)`, (row.wayType ?? row.way) === (r?.type ?? r?.way) && (r?.between === 0 ? row.src === "direct" || !/intro/i.test(row.via ?? "") : true), { row: { wayType: row.wayType, way: row.way, src: row.src, via: row.via }, route: { type: r?.type, way: r?.way, between: r?.between } });
  }
  {
    const ctx = await contextFor("trial");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?p=table`);
    await settle(page);
    const warmTab = page.getByRole("button", { name: /Warm (intros|ways in)/ }).first();
    const all = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const inTargets = new RegExp(seedCo(DIRECT_K).fields.name).test(all);
    if ((await warmTab.count()) && (await warmTab.isEnabled())) {
      await warmTab.click();
      await page.waitForTimeout(800);
      const txt = await page.locator("main").innerText();
      // The chip is Warm ways in (people the member knows, directly or through someone): the direct one is there as a note to write yourself, never an intro.
      const direct3 = new RegExp(seedCo(DIRECT_K).fields.name).test(txt);
      check("the Targets warm filter never calls the CEO known directly an intro", !direct3 || /yourself|Direct connection/.test(txt), txt.slice(0, 300));
      check("…and does count the opening reached through Tatum", new RegExp(seedCo(INTRO_K).fields.name).test(txt) || !new RegExp(seedCo(INTRO_K).fields.name).test(all), txt.slice(0, 300));
    } else if (inTargets) check("the Targets badge for the CEO known directly reads as a direct note", /Direct note|direct/i.test(all), all.slice(0, 300));
    else unverified("the Targets badge for the direct route", "Qaco3 is not among this member's prioritized opportunities, so its badge isn't drawn");
    await evidence(page, "targets warm intros");
    await page.goto(`${BASE}/?p=warm`);
    await settle(page);
    await evidence(page, "warm paths sales persona");
    await ctx.close();
  }

  // A high-signal company with no vacancy, and an unmatched prospect.
  await act("trial", { type: "unlock", ...unlockItem(HIGH_NO_VACANCY) });
  const hi = await wayOf("trial", HIGH_NO_VACANCY);
  check("a high-signal company with no vacancy says no open role (never a posting it doesn't have)", hi && !hi.openRole && /Hired/.test(hi.hired ?? ""), hi && { openRole: hi.openRole, hired: hi.hired });
  const un = await wayOf("trial", UNMATCHED);
  check("an unmatched prospect has no warm route", un && !(un.routes ?? []).some((r) => (r.type ?? r.way) === "Warm intro"), un?.routes?.map((r) => r.type ?? r.way));

  // Identity from search to outreach: the company found by name is the one in the note and the pipeline.
  const f = await act("fin", { type: "find", text: seedCo(INTRO_K).fields.name });
  const foundId = (f.json?.companies ?? []).find((c) => c.name === seedCo(INTRO_K).fields.name)?.id;
  check("search finds the company by its full name", f.status === 200 && foundId === co(INTRO_K).id, { msg: f.json?.message, foundId });
  const opened = await act("fin", { type: "unlock", ...unlockItem(INTRO_K) });
  note("the Finance persona opens it (trial)", opened.json?.message ?? opened.json?.error);
  const fw = await wayOf("fin", INTRO_K);
  const fNote = fw?.routes?.[0]?.steps?.find((s) => s.note)?.note;
  check("…its way in is the same company, by id and name", fw?.id === co(INTRO_K).id && fw?.name === seedCo(INTRO_K).fields.name, { id: fw?.id, name: fw?.name });
  const go = await req("POST", "/api/paths", { as: "fin", body: { op: "way", company: co(INTRO_K).id, do: "go", route: fw?.routes?.[0]?.id }, headers: { origin: BASE } });
  const fd = await dealAt("fin", INTRO_K);
  check("…and Go puts that same company in the pipeline, once", go.status === 200 && fd.length === 1 && fd[0].name === seedCo(INTRO_K).fields.name, { go: go.json?.error ?? "ok", deals: fd.map((d) => d.name) });
  const go2 = await req("POST", "/api/paths", { as: "fin", body: { op: "way", company: co(INTRO_K).id, do: "go", route: fw?.routes?.[0]?.id }, headers: { origin: BASE } });
  check("…Go again (a duplicate) doesn't add a second deal", (await dealAt("fin", INTRO_K)).length === 1, go2.json?.error ?? "ok");
  note("the Finance persona's note for it", fNote);

  // A priced and an unpriced deal (Finance): totals leave the unknown out and say so.
  for (const k of [10, 11]) await act("fin", { type: "unlock", ...unlockItem(k) });
  await act("fin", { type: "pipeline.deal", companyId: co(10).id, value: "6000", pitch: "Fractional CFO" });
  await act("fin", { type: "pipeline.deal", companyId: co(11).id });
  const pl = await pipelineOf("fin");
  check("open pipeline totals the priced deal only ($6,000) and counts 1 valued", pl?.openMonthly === 6000 && pl?.valued === 1 && (pl?.entries ?? []).filter((e) => e.stage !== "won").length === 3, { open: pl?.openMonthly, valued: pl?.valued, n: pl?.entries?.length });
  {
    const ctx = await contextFor("fin");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?p=pipeline`);
    await settle(page);
    const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    check("the pipeline says some deals have no value (unpriced deals disclosed next to the total)", /unpriced|no value|value unknown|without a value|not priced/i.test(txt), txt.slice(0, 500));
    await evidence(page, "pipeline priced and unpriced");
    // Save and reload: a value changed on the card stays.
    const d11 = (await dealAt("fin", 11))[0];
    await act("fin", { type: "pipeline.value", id: d11?.id, value: "4500" });
    await page.reload();
    await settle(page);
    check("a deal's value saved, then the page reloaded: it stays ($4,500)", (await dealAt("fin", 11))[0]?.monthly === 4500 && /4,500/.test(await page.locator("main").innerText()));
    await ctx.close();
  }

  // A consented referral partner: a lead passed to the Marketing persona reaches them only, once.
  const peers = (await req("GET", "/api/table?peers=1", { as: "trial" })).json;
  const partner = (peers?.serve ?? []).find((x) => x.name === WHO.mkt.name);
  check("the Marketing persona is offered as a referral partner to the Sales persona", !!partner, (peers?.serve ?? []).map((x) => x.name));
  const passA = { type: "peer.pass", companyId: co(INTRO_K).id, memberId: partner?.memberId, note: "A marketing brief, better for you." };
  const [pa, pb] = await Promise.all([act("trial", passA), act("trial", passA)]);
  const mk = (await req("GET", "/api/table?peers=1", { as: "mkt" })).json;
  const fi = (await req("GET", "/api/table?peers=1", { as: "fin" })).json;
  check("the lead reaches the partner chosen, once (a double submit is one pass)", (mk?.inbox ?? []).length === 1, { a: pa.json?.message ?? pa.json?.error, b: pb.json?.message ?? pb.json?.error, inbox: mk?.inbox?.length });
  check("…and nobody else", (fi?.inbox ?? []).length === 0, fi?.inbox);

  // A call and an evidence record: the proposal from the call uses the case (Close member).
  const ev = await req("POST", "/api/evidence", { as: "close", body: { op: "save", title: "Rebuilt the forecast for a freight company", clientNamed: false, clientLabel: "A logistics company, $5M to $20M", role: "Fractional VP Sales", fn: "Sales", start: "2025-01", end: "2025-09", industry: "Logistics", size: "51–200", revenue: "$5M–$20M", motion: "Sales-led", problems: ["Forecast accuracy"], answers: { problem: "The forecast was a guess.", did: "Weekly pipeline reviews.", numbers: "Forecast within 5% in two quarters." }, status: "ready" }, headers: { origin: BASE } });
  check("an evidence record is saved", ev.status === 200, ev.json?.error ?? ev.json?.case?.status);
  const transcript = "Cleo: Thanks for the time.\nSawyer Callowayqa: Our forecast is a guess every month and deals stall after the first call.\nSawyer Callowayqa: Two days a week could work. I sign this myself.\nCleo: I'd scope it at $9,000 a month.";
  const qc = await P("close", { op: "quick", companyId: co(7).id, transcript });
  const qp = qc.json?.proposal;
  check("a proposal from a pasted call opens for the right company", qc.status === 200 && qp?.company?.id === co(7).id, qc.json?.error ?? qp?.company);
  check("…with the evidence record as its proof", /Rebuilt the forecast|forecast within 5%/i.test(JSON.stringify(qp ?? {})), Object.keys(qp?.fields ?? {}).filter((k) => /case|proof/i.test(k)));
  check("…and the fee said on the call ($9,000)", /9,000/.test(qp?.fields?.["pricing.monthlyFee"] ?? ""), qp?.fields?.["pricing.monthlyFee"] ?? null);
}

/* =====================================================================================
 * R. Every primary page at 337, 779 and 1363 CSS px: no sideways scroll, navigation reachable
 * ===================================================================================== */
const WIDTHS = [337, 779, 1363];
let PAGES = null;
async function primaryPages() {
  if (PAGES) return PAGES;
  const ctx = await contextFor("close");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  PAGES = await page.$$eval("a[data-nav]", (as) => as.map((a) => ({ key: a.dataset.nav, href: a.getAttribute("href"), label: a.innerText.trim().split("\n")[0] })));
  await ctx.close();
  return PAGES;
}
async function overflowOf(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const wide = [];
    if (sw > w + 1)
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > w + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
          let p = el.parentElement, clipped = false;
          while (p) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") { clipped = true; break; }
            p = p.parentElement;
          }
          if (!clipped) wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} right=${Math.round(r.right)}`);
          if (wide.length > 4) break;
        }
      }
    return { w, sw, wide };
  });
}
async function navReachable(page, keys) {
  // A nav link counts when it is drawn (not hidden, some size), on screen or by scrolling the navigation.
  const hrefKey = new Map((PAGES ?? []).map((p) => [p.href, p.key]));
  const drawn = async () => (await page.$$eval("a[href]", (as) => as.filter((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.left >= -1 && r.right <= innerWidth + 1; }).map((a) => a.getAttribute("href")))).map((h) => hrefKey.get(h)).filter(Boolean);
  let seen = new Set(await drawn());
  let how = "navigation";
  if (keys.some((k) => !seen.has(k))) {
    const more = page.getByRole("button", { name: /^More\b/ }).filter({ visible: true }).last();
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(600);
      for (const k of await drawn()) seen.add(k);
      how = "tab bar and More";
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
  return { how, missing: keys.filter((k) => !seen.has(k)) };
}
/** Open a page with its own client address (the per-address limits are for people, not a test). Waits out a 429 page once. */
const ROTATE = ["close", "wf", "pro", "fin", "mkt", "trial"];
let rot = 0;
async function openPage(page, url, rotate = false) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  // The per-member read limits are for a person: a run through every page signs in as the next persona each time.
  if (rotate) await page.context().addCookies([{ name: "rn_table", value: WHO[ROTATE[rot++ % ROTATE.length]].token, url: BASE }]);
  await page.goto(url);
  await settle(page);
  if (await page.getByText("Too many requests at once").count()) {
    note("a page met the request limit; waited and loaded it again", url);
    await sleep(30_000);
    await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
    await page.goto(url);
    await settle(page);
  }
}
async function journeyR() {
  const pages = await primaryPages();
  const keys = pages.map((p) => p.key);
  check("the navigation lists the primary pages", pages.length >= 10, keys);
  const asWho = { 337: "pro", 779: "close", 1363: "wf" };
  for (const width of WIDTHS) {
    const ctx = await contextFor(asWho[width], { width, height: 860, touch: width < 1024 });
    const page = await ctx.newPage();
    let navOk = 0;
    for (const p of pages) {
      await openPage(page, BASE + p.href, true);
      const o = await overflowOf(page);
      check(`${p.label} at ${width}px: no sideways scroll`, o.sw <= o.w + 1, o);
      await evidence(page, `${p.key} ${width}`);
      const n = await navReachable(page, keys);
      if (!n.missing.length) navOk++;
      else check(`${p.label} at ${width}px: every primary page reachable from the navigation`, false, n);
    }
    check(`at ${width}px the navigation reaches every primary page from every primary page`, navOk === pages.length, `${navOk} of ${pages.length} pages`);
    await ctx.close();
  }
}

/* =====================================================================================
 * K. The keyboard: the shell, a filter, a drawer or sheet, a composer
 * ===================================================================================== */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body" };
    const r = el.getBoundingClientRect();
    const box = el.closest('[role=dialog],[role=alertdialog],[aria-modal=true],dialog,[role=menu],aside[aria-label]');
    const layer = box && !box.querySelector("nav") ? box.getAttribute("aria-label") || box.getAttribute("role") || box.tagName.toLowerCase() : null;
    return { tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 60), onScreen: r.width > 0 && r.height > 0, inDialog: !!layer, layer };
  });
/** Does focus show? The focused element and its two parents, drawn focused and then not: any change in outline, shadow, border or background counts. */
const ringNow = (page) =>
  page.evaluate(async () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const sig = () => [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean).map((x) => { const s = getComputedStyle(x); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join("|"); }).join("/");
    const on = sig();
    el.blur();
    const off = sig();
    el.focus();
    return on !== off;
  });
async function journeyK() {
  const ctx = await contextFor("close");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?p=pipeline`);
  await settle(page);
  await page.waitForTimeout(800);
  // The shell: Tab from the top of a fresh page.
  await page.keyboard.press("Tab");
  const first = await focusInfo(page);
  check("the first Tab lands on the skip link", /skip/i.test(first.name), first);
  const stops = [first];
  const noRing = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const f = await focusInfo(page);
    stops.push(f);
    if (f.tag !== "body" && !(await ringNow(page))) noRing.push(f);
  }
  check("every stop in the shell shows where focus is (a visible focus style)", noRing.length === 0, noRing.slice(0, 8));
  check("Tab moves through the navigation (links reached in order)", stops.filter((s) => s.tag === "a").length >= 8, stops.map((s) => s.name).slice(0, 20));
  const here = await focusInfo(page);
  await page.keyboard.press("Shift+Tab");
  const back = await focusInfo(page);
  await page.keyboard.press("Tab");
  const fwd = await focusInfo(page);
  check("Shift+Tab goes back one stop and Tab returns to it", back.name !== here.name && fwd.name === here.name, { here, back, fwd });
  await evidence(page, "keyboard shell");
  // The skip link: Enter moves focus into the page.
  await page.reload();
  await settle(page);
  await page.waitForTimeout(800);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.keyboard.press("Tab");
  const after = await page.evaluate(() => ({ inMain: !!document.activeElement?.closest("main, #main, [role=main]"), name: (document.activeElement?.innerText || document.activeElement?.getAttribute("aria-label") || "").trim().slice(0, 40) }));
  check("Enter on the skip link takes the next Tab into the page's content", after.inMain, after);

  // A filter: Hiring now's Filter, by keyboard.
  await page.goto(`${BASE}/?t=seats&v=hiring`);
  await settle(page);
  await page.waitForTimeout(800);
  const filter = page.getByRole("button", { name: /^Filter/ }).first();
  await filter.focus();
  check("the Filter button shows focus", await ringNow(page), await focusInfo(page));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  const inFilter = await focusInfo(page);
  await evidence(page, "keyboard filter open");
  check("Enter opens the filters and focus moves into them", inFilter.inDialog || !/^Filter/.test(inFilter.name), inFilter);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const ret = await focusInfo(page);
  check("Escape closes the filters and focus returns to Filter", /^Filter/.test(ret.name), ret);

  // A sheet: Add what you know.
  await page.goto(`${BASE}/?p=pipeline`);
  await settle(page);
  await page.waitForTimeout(800);
  const addBtn = page.getByRole("button", { name: /Add what you know/ }).first();
  await addBtn.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const inSheet = await focusInfo(page);
  check("Enter opens the Add what you know sheet with focus moved into it", inSheet.inDialog, inSheet);
  await evidence(page, "keyboard add what you know");
  await page.keyboard.press("Tab");
  const t1 = await focusInfo(page);
  await page.keyboard.press("Shift+Tab");
  const t0 = await focusInfo(page);
  check("Tab and Shift+Tab then stay inside the open sheet", t1.inDialog && t0.inDialog, { t1, t0 });
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  check("focus stays in the sheet after 40 Tabs (it doesn't escape to the page behind)", (await focusInfo(page)).inDialog, await focusInfo(page));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const ret2 = await focusInfo(page);
  check("Escape closes the sheet and focus returns to Add what you know", /Add what you know/.test(ret2.name), ret2);

  // A drawer and a composer: a deal on the pipeline, its value typed and saved by keyboard.
  await act("close", { type: "pipeline.deal", companyId: co(13).id });
  await page.reload();
  await settle(page);
  await page.waitForTimeout(800);
  const dealBtn = page.locator("main").getByRole("button", { name: new RegExp(seedCo(13).fields.name) }).first();
  check("a deal card on the pipeline is reachable as a button", (await dealBtn.count()) > 0);
  await dealBtn.focus();
  const opener = await focusInfo(page);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  let inDr = await focusInfo(page);
  if (inDr.layer === "menu" || /Open the deal/.test(inDr.name)) {
    note("Enter on the card opens its menu; Enter on Open the deal opens the drawer", inDr);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    inDr = await focusInfo(page);
  }
  const drawer = page.locator("aside.pl2-drawer");
  check("the deal's drawer opens by keyboard with focus inside it", (await drawer.count()) > 0 && inDr.inDialog, inDr);
  await evidence(page, "keyboard deal drawer");
  const editV = drawer.getByRole("button", { name: /Add the value and the seat|Change the value/ }).first();
  if (await editV.count()) {
    await editV.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    const inInput = await focusInfo(page);
    check("Enter on Add the value puts focus in the value field", inInput.tag === "input", inInput);
    if (inInput.tag !== "input") await drawer.locator("input").first().focus();
    await page.keyboard.type("7500");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Fractional VP Sales");
    await evidence(page, "keyboard composer typed");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const d = (await dealAt("close", 13))[0];
    check("Enter saves what was typed, once: $7,500 a month", d?.monthly === 7500 && (d?.log ?? []).filter((l) => /Value/.test(l.text)).length === 1, d && { monthly: d.monthly, log: d.log?.map((l) => l.text) });
  } else check("the drawer offers Add the value and the seat", false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const ret3 = await focusInfo(page);
  check("Escape closes the drawer", (await drawer.count()) === 0);
  check("…and focus returns to the deal it was opened from", ret3.name === opener.name || new RegExp(seedCo(13).fields.name).test(ret3.name), { ret3, opener });

  // The unlock confirm by keyboard (Free): Escape is Not now.
  const fctx = await contextFor("free");
  const fp = await fctx.newPage();
  await fp.goto(`${BASE}/?c=${co(20).id}`);
  await settle(fp);
  const ub = fp.getByRole("button", { name: /^(Unlock|Open) company for 2 credits/ }).filter({ visible: true }).first();
  await fp.waitForTimeout(1500);
  await clickFor(fp, fp.getByRole("button", { name: "See what opens it" }), ub);
  if (await ub.count()) {
    const bal = await balanceOf("free");
    await ub.focus();
    await fp.keyboard.press("Enter");
    await fp.waitForTimeout(700);
    const inC = await focusInfo(fp);
    check("Enter opens the spend confirm with focus in it", inC.inDialog, inC);
    await evidence(fp, "keyboard spend confirm");
    await fp.keyboard.press("Escape");
    await fp.waitForTimeout(500);
    const r4 = await focusInfo(fp);
    check("Escape is Not now: nothing spent, focus back on the unlock button", (await balanceOf("free")) === bal && /(Unlock|Open) company/.test(r4.name), r4);
  } else check("the unlock button is reachable", false);
  await fctx.close();
  await ctx.close();
}

/* =====================================================================================
 * X. axe-core on every primary page, by impact
 * ===================================================================================== */
const A11Y = { ran: false, pages: [], byImpact: {}, rules: {} };
async function journeyX() {
  let src = null;
  try {
    src = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    unverified("axe-core", "axe-core is not installed (npm i -D axe-core)");
    return;
  }
  A11Y.ran = true;
  const pages = await primaryPages();
  for (const width of [1363, 337]) {
    const ctx = await contextFor("close", { width, height: 860, touch: width < 1024 });
    const page = await ctx.newPage();
    for (const p of pages) {
      await openPage(page, BASE + p.href, true);
      await page.addScriptTag({ content: src });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ["violations"] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
      });
      A11Y.pages.push({ page: p.key, width, violations: res });
      for (const v of res) {
        A11Y.byImpact[v.impact] = (A11Y.byImpact[v.impact] ?? 0) + v.nodes;
        const r = (A11Y.rules[v.id] ??= { impact: v.impact, help: v.help, nodes: 0, pages: [] });
        r.nodes += v.nodes;
        r.pages.push(`${p.key}@${width}`);
        r.example ??= v.targets[0];
      }
    }
    await ctx.close();
  }
  for (const impact of ["critical", "serious"]) {
    const rules = Object.entries(A11Y.rules).filter(([, r]) => r.impact === impact);
    check(`axe: no ${impact} violations on the primary pages`, rules.length === 0, rules.map(([id, r]) => `${id} (${r.nodes} nodes on ${r.pages.length} page sizes)`));
  }
  note("axe violations by impact (nodes)", A11Y.byImpact);
}

/* =====================================================================================
 * Run them
 * ===================================================================================== */
{
  const h = await req("GET", "/api/health");
  check("the server is up", h.status === 200, h.status);
  const me = await today("free");
  check("the made-up seed is the one loaded (a seed member opens with their token)", me?.me?.name === WHO.free.name, me?.me?.name);
  if (me?.me?.name !== WHO.free.name) {
    console.log("FAIL stopping: this is not the journey's server");
    process.exit(1);
  }
  check("the starting plans: Free, Pro, Close, Close trial", me.me.plan?.name === "free" && (await today("pro"))?.me?.plan?.tier === "pro" && (await today("close"))?.me?.plan?.tier === "close" && (await today("trial"))?.me?.plan?.name === "trial");
  check("every seed company is known by its number", (await loadCompanies()) >= 90, CO.size);
}
// E first: the alerts watch that turns events into workflow runs looks at most every 15 minutes, and starts its clock once anyone watches (A's alert, C's contacts).
await journey("E", "workflow from a template", journeyE);
await journey("A", "saved audience, filters back, one alert", journeyA);
await journey("B", "company unlock: quote, cancel, confirm, again, double click", journeyB);
await journey("C", "intro from a warm path: approve, once", journeyC);
await journey("D", "pipeline, proposal, signature, Won, Contracts", journeyD);
await journey("P", "personas, routes and the reviewer's fixture", journeyP);
await journey("R", "responsive: 337, 779, 1363", journeyR);
await journey("K", "keyboard", journeyK);
await journey("X", "axe-core", journeyX);

await browser.close();
mock.close();
const passed = results.filter((r) => !r.note && r.ok).length;
writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed, failed: fails, results, a11y: A11Y }, null, 1));
console.log(`\nevidence in ${OUT}`);
console.log(fails ? `${fails} of ${passed + fails} journey checks failed` : `all ${passed} journey checks passed`);
process.exit(fails ? 1 : 0);
