#!/usr/bin/env node
/**
 * A load check: many members using Merlin at once, the way the page does.
 *
 *   npm run build && node scripts/test-load.mjs        (starts its own server on a fresh data dir)
 *
 * Each member joins, loads the table (all of them at once: the arrival a blast brings), then
 * acts every few seconds (unlock a fact, add a company's HQ, follow a company) while one
 * signed-out visitor loads the landing page every 2 seconds. It prints p50, p90 and the slowest
 * time of the first table, of later table downloads (refreshes), of the actions and of the
 * signed-out page, with how many tables were downloaded and how much.
 *
 *   LOAD_MEMBERS=25      members acting at once
 *   LOAD_SECONDS=60      how long they act
 *   LOAD_EVERY=3000      milliseconds between one member's actions (each wait is 80% to 120% of it)
 *   LOAD_CLIENT=new      new: what the page does now. An action's answer carries what changed,
 *                        so the table is downloaded again only when the answer says other members
 *                        changed it too, and then at most once a minute.
 *                        old: the page before that, which downloaded the whole table after every action.
 *   LOAD_DRAIN=1         after the last action, wait for the downloads the new page still has due
 *                        (a minute or so after each member's last one), so they are measured too
 *   LOAD_PORT=4598       the port of the server it starts
 *   BASE=http://...      use a server that is already running instead (fresh data dir, RN_SCAN_TEST=1)
 *   LOAD_ROLES=<file>    open roles to post to the weekly scan first ({ roles, sources }, as scan tests send)
 *   LOAD_BUDGET=1        exit 1 when a check fails: no server errors, every action answer carries the
 *                        member's numbers and the table version, and (new client) at most one download
 *                        a minute per member after the first, with actions answered in under 3 s at p90.
 *
 * The private seed (data/intel-seed.json) is used when it is there, else a made-up seed of the
 * same size. Nothing from either is printed.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MEMBERS = Number(process.env.LOAD_MEMBERS ?? 25);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);
const EVERY = Number(process.env.LOAD_EVERY ?? 3000);
const CLIENT = process.env.LOAD_CLIENT === "old" ? "old" : "new";
const PORT = Number(process.env.LOAD_PORT ?? 4598);
const BUDGET = process.env.LOAD_BUDGET === "1";
const REFRESH_EVERY = 60_000;
const REFRESH_SPREAD = 30_000;
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const RUN = Date.now().toString(36);

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail).slice(0, 400)}`}`);
};

/* ---------- the server ---------- */

const scratch = mkdtempSync(path.join(tmpdir(), "rn-load-"));
let server = null;
let base = process.env.BASE?.replace(/\/$/, "") ?? "";

/** A made-up seed about the size of the real one (5,000 companies, a seat each, some people). */
function madeUpSeed() {
  const DAY = 86_400_000;
  const n = 4900;
  const fns = ["Sales", "Marketing", "RevOps", "Customer Success", "Finance", "Technology"];
  return {
    builtAt: new Date(Date.now() - 20 * DAY).toISOString(),
    members: Array.from({ length: 300 }, (_, i) => ({ id: `lm${i}`, name: `Load Member${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}`, email: `lm${i}@example.com`, title: "Fractional VP Sales", token: `loadtok-${i}` })),
    companies: Array.from({ length: n }, (_, i) => ({
      id: `c_load${i}`,
      fields: { name: `Loadco ${i}`, website: `loadco${i}.example.com`, industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", ...(i % 3 ? {} : { hq: "Austin, TX" }) },
    })),
    engagements: Array.from({ length: n }, (_, i) => ({
      id: `e_load${i}`,
      companyId: `c_load${i}`,
      fields: {
        source: "Published engagement", function: fns[i % fns.length], type: "Fractional", role: `Fractional VP ${fns[i % fns.length]}`, status: i % 2 ? "Active" : "Ended",
        start: "2025-03", ...(i % 2 ? { end: "Ongoing" } : { end: "2025-11" }), rate: "$8k/mo", hours: "15", operator: `Load Member${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}`,
      },
    })),
    contacts: Array.from({ length: 400 }, (_, i) => ({ id: `p_load${i}`, companyId: `c_load${i * 7}`, engagementId: null, source: "Demand scan", fields: { name: `Pat Person${i}`, title: "CEO", relationship: "Decision maker" } })),
  };
}

async function startServer() {
  const dataDir = path.join(scratch, "data");
  const env = { ...process.env, RN_DATA_DIR: dataDir, RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa@example.com", RN_SCAN_TEST: "1", RN_CRON_SECRET: CRON_SECRET, RN_LOGO_LOOKUP: "off" };
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_SCAN", "RN_DIGEST", "RN_DIGEST_ALL", "RN_REQUIRE_SEED"]) delete env[k];
  if (!existsSync(path.join(ROOT, "data", "intel-seed.json")) && !env.RN_INTEL_SEED_KEY) {
    const seedPath = path.join(scratch, "seed.json");
    writeFileSync(seedPath, JSON.stringify(madeUpSeed()));
    env.RN_INTEL_SEED = seedPath;
  }
  let log = "";
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (b) => (log += b));
  server.stderr.on("data", (b) => (log += b));
  base = `http://localhost:${PORT}`;
  for (let i = 0; i < 300; i++) {
    const up = await fetch(`${base}/api/health`).then((r) => r.status === 200, () => false);
    if (up) return true;
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(log.slice(-800));
  return false;
}
process.on("exit", () => server?.kill("SIGKILL"));

/* ---------- requests ---------- */

let ipN = 0;
const nextIp = () => `10.${180 + ((++ipN >> 16) & 15)}.${(ipN >> 8) & 255}.${ipN & 255}`;

/**
 * GET /api/table?compact=1 as a browser asks for it (brotli), read to the last byte without
 * decoding it. Returns the time, the size on the wire and the table version the server sent.
 */
function getTable(token, ip) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers = { "accept-encoding": "br, gzip", "x-forwarded-for": ip };
    if (token) headers.cookie = `rn_table=${token}`;
    const req = request(`${base}/api/table?compact=1`, { headers }, (res) => {
      let bytes = 0;
      res.on("data", (b) => (bytes += b.length));
      res.on("end", () => resolve({ status: res.statusCode, ms: performance.now() - t0, bytes, version: res.headers["x-view-version"] ?? null }));
    });
    req.on("error", (e) => resolve({ status: 0, ms: performance.now() - t0, bytes: 0, error: String(e) }));
    req.end();
  });
}
async function post(body, { token, ip } = {}) {
  const t0 = performance.now();
  const headers = { "content-type": "application/json", "x-forwarded-for": ip ?? nextIp() };
  if (token) headers.cookie = `rn_table=${token}`;
  try {
    const r = await fetch(`${base}/api/table`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: r.status, ms: performance.now() - t0, json, cookie: (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null, bytes: text.length };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, json: null, error: String(e) };
  }
}

/* ---------- numbers ---------- */

const times = { arrival: [], refresh: [], action: [], landing: [] };
const counts = { gets: 0, getBytes: 0, actions: 0, actionBytes: 0, statuses: {}, answersWithVersion: 0, answersWithMe: 0, answersOk: 0, refusals: 0 };
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (ms) => (ms === null ? "-" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const line = (name, xs) => `${name.padEnd(10)} n=${String(xs.length).padStart(4)}  p50 ${fmt(pct(xs, 50)).padStart(8)}  p90 ${fmt(pct(xs, 90)).padStart(8)}  max ${fmt(xs.length ? Math.max(...xs) : null).padStart(8)}`;
const note = (status) => (counts.statuses[status] = (counts.statuses[status] ?? 0) + 1);

/* ---------- members ---------- */

/** The version of the table the page holds, as the server writes it ("<boot>:<n>"). */
const parseVersion = (v) => {
  const m = typeof v === "string" ? v.match(/^(.+):(\d+)$/) : null;
  return m ? { boot: m[1], n: Number(m[2]) } : null;
};
/** Other members changed the table since this one downloaded it (or it can't tell): what the page checks. */
const othersChanged = (known, answer) => {
  const a = parseVersion(answer);
  const k = parseVersion(known);
  return !a || !k || a.boot !== k.boot || a.n > k.n + 1;
};

class Member {
  constructor(i, token, ip) {
    Object.assign(this, { i, token, ip, version: null, lastGet: 0, inFlight: null, again: false, timer: null });
  }
  async download(kind) {
    counts.gets++;
    const r = await getTable(this.token, this.ip);
    note(r.status);
    counts.getBytes += r.bytes;
    if (r.status === 200) {
      times[kind].push(r.ms);
      this.version = r.version;
      this.lastGet = Date.now();
    }
    return r;
  }
  /** The old page: the whole table after every action, folded while one download is on its way. */
  sync() {
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = (async () => {
      do {
        this.again = false;
        await this.download("refresh");
      } while (this.again);
      this.inFlight = null;
    })();
  }
  /** The new page: download again only when others changed the table, and then at most once a minute (plus up to 30 s, picked at random, as app/Root.tsx does). */
  stale() {
    if (this.inFlight || this.timer) return;
    const wait = Math.max(0, this.lastGet + REFRESH_EVERY + Math.random() * REFRESH_SPREAD - Date.now());
    const go = () => {
      this.timer = null;
      if (stopped) return;
      this.inFlight = this.download("refresh").finally(() => (this.inFlight = null));
    };
    if (wait === 0) go();
    else this.timer = setTimeout(go, wait);
  }
  async act(a) {
    counts.actions++;
    const r = await post({ action: a }, { token: this.token, ip: this.ip });
    note(r.status);
    counts.actionBytes += r.bytes ?? 0;
    times.action.push(r.ms);
    if (r.status === 200) {
      counts.answersOk++;
      if (r.json?.me && typeof r.json.me.credits === "number") counts.answersWithMe++;
      if (typeof r.json?.version === "string") counts.answersWithVersion++;
      if (CLIENT === "old") this.sync();
      else if (othersChanged(this.version, r.json?.version)) this.stale();
      else this.version = r.json.version;
    } else if (r.status === 400) {
      counts.refusals++;
      // A refusal reloads the table on the page, both before and after this change.
      if (CLIENT === "old") this.sync();
      else this.stale();
    }
    return r;
  }
}

let stopped = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

async function main() {
  if (!base) {
    if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
      check("a build is there (run npm run build first)", false);
      return;
    }
    if (!(await startServer())) {
      check("the test server started", false);
      return;
    }
  }
  console.log(`${MEMBERS} members, one action every ${EVERY / 1000} s each for ${SECONDS} s, ${CLIENT === "new" ? "the page as it is now" : "the old page (the whole table after every action)"}.`);

  if (process.env.LOAD_ROLES) {
    const body = JSON.parse(readFileSync(process.env.LOAD_ROLES, "utf8"));
    const r = await fetch(`${base}/api/table/scan`, { method: "POST", headers: { "content-type": "application/json", "x-cron-secret": CRON_SECRET }, body: JSON.stringify(body) });
    console.log(`open roles posted: ${r.status}`);
  }

  // Join, each from an address of their own (joining allows 10 an hour per address).
  const members = [];
  for (let i = 0; i < MEMBERS; i++) {
    const ip = nextIp();
    const a = String.fromCharCode(65 + (i % 26));
    const b = String.fromCharCode(65 + (Math.floor(i / 26) % 26));
    const j = await post({ join: { name: `Loadtest Member${a}${b}`, email: `load-${RUN}-${i}@example.com` } }, { ip });
    if (!j.cookie) {
      check("members can join", false, j.json ?? j.error);
      return;
    }
    members.push(new Member(i, j.cookie, ip));
  }

  // The arrival: everyone opens the table at once.
  const t0 = performance.now();
  const first = await Promise.all(members.map((m) => m.download("arrival")));
  const arrived = performance.now() - t0;
  const okFirst = first.filter((r) => r.status === 200).length;
  console.log(`arrival: ${okFirst} of ${MEMBERS} tables in ${fmt(arrived)} (${(first.reduce((n, r) => n + r.bytes, 0) / MEMBERS / 1024).toFixed(0)} KB each on the wire)`);

  // What to act on, from one member's table (the ids are the same for everyone).
  const one = await fetch(`${base}/api/table?compact=1`, { headers: { cookie: `rn_table=${members[0].token}`, "x-forwarded-for": members[0].ip } }).then((r) => r.json());
  const locked = [];
  const emptyHq = [];
  const companies = [];
  for (const c of one.companies ?? []) {
    companies.push(c.id);
    if (c.hidden) locked.push({ entity: "company", id: c.id, field: "identity" });
    else if (!c.cells?.hq) emptyHq.push(c.id);
    for (const e of c.engagements ?? []) for (const [field, cell] of Object.entries(e.cells ?? {})) if (cell?.s === "locked") locked.push({ entity: "engagement", id: e.id, field });
    for (const p of [...(c.people ?? []), ...(c.engagements ?? []).flatMap((e) => e.people ?? [])])
      for (const [field, cell] of Object.entries(p.cells ?? {})) if (cell?.s === "locked" && (field === "name" || field === "title")) locked.push({ entity: "contact", id: p.id, field });
  }
  console.log(`to act on: ${locked.length} locked facts, ${emptyHq.length} companies with no HQ, ${companies.length} companies`);

  // Members act, and a signed-out visitor opens the landing page every 2 seconds.
  const deadline = Date.now() + SECONDS * 1000;
  const loops = members.map(async (m) => {
    await sleep(Math.random() * EVERY);
    while (Date.now() < deadline) {
      const r = Math.random();
      if (r < 0.45 && locked.length) await m.act({ type: "unlock", ...pick(locked) });
      else if (r < 0.85 && emptyHq.length) await m.act({ type: "fill", entity: "company", id: emptyHq.splice(Math.floor(Math.random() * emptyHq.length), 1)[0], field: "hq", value: "Austin, TX" });
      else await m.act({ type: "follow", companyId: pick(companies), on: Math.random() < 0.7 });
      await sleep(EVERY * (0.8 + Math.random() * 0.4));
    }
  });
  const visitor = (async () => {
    const ip = nextIp();
    while (Date.now() < deadline) {
      const r = await getTable(null, ip);
      note(r.status);
      if (r.status === 200) times.landing.push(r.ms);
      await sleep(2000);
    }
  })();
  await Promise.all([...loops, visitor]);
  // LOAD_DRAIN=1: the downloads the actions made due still happen (up to a minute and a half later), so they are measured too.
  if (process.env.LOAD_DRAIN === "1") while (members.some((m) => m.timer)) await sleep(500);
  stopped = true;
  for (const m of members) if (m.timer) clearTimeout(m.timer);
  await Promise.race([Promise.all(members.map((m) => m.inFlight).filter(Boolean)), sleep(60_000)]);

  console.log("");
  console.log(line("arrival", times.arrival));
  console.log(line("refresh", times.refresh));
  console.log(line("action", times.action));
  console.log(line("landing", times.landing));
  const refreshes = counts.gets - MEMBERS;
  console.log(`tables downloaded after the first: ${refreshes} (${(refreshes / Math.max(1, counts.actions)).toFixed(2)} per action), ${(counts.getBytes / 1024 / 1024).toFixed(1)} MB on the wire in all`);
  console.log(`actions: ${counts.actions}, ${counts.refusals} refused, answers ${(counts.actionBytes / Math.max(1, counts.actions) / 1024).toFixed(1)} KB on average. Statuses: ${JSON.stringify(counts.statuses)}`);

  if (BUDGET) {
    console.log("");
    const serverErrors = Object.entries(counts.statuses).filter(([s]) => Number(s) >= 500 || Number(s) === 0);
    check("no server errors or dropped connections", serverErrors.length === 0, counts.statuses);
    check("every member got their first table", okFirst === MEMBERS, okFirst);
    check("every answer to an action carries the member's numbers", counts.answersWithMe === counts.answersOk, [counts.answersWithMe, counts.answersOk]);
    check("every answer to an action carries the table's version", counts.answersWithVersion === counts.answersOk, [counts.answersWithVersion, counts.answersOk]);
    if (CLIENT === "new") {
      const allowed = MEMBERS * (Math.floor(SECONDS / 60) + 1);
      check(`at most one table a minute per member after the first (${refreshes} for ${MEMBERS} members in ${SECONDS} s)`, refreshes <= allowed, refreshes);
      check(`actions answered in under 3 s at p90 (${fmt(pct(times.action, 90))})`, (pct(times.action, 90) ?? 0) < 3000, pct(times.action, 90));
    }
  }
}

try {
  await main();
} catch (e) {
  check("the load check ran to the end", false, String(e?.stack ?? e));
}
if (server && server.exitCode === null) {
  const s = server;
  await new Promise((done) => {
    s.once("exit", done);
    s.kill("SIGTERM");
    setTimeout(() => s.kill("SIGKILL"), 3000);
  });
}
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${failures ? `${failures} failed` : "load check done"}`);
process.exit(failures ? 1 : 0);
