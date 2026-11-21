#!/usr/bin/env node
/**
 * "Your three moves today", the drafted note, the writing voice and the Pro welcome, looked at in
 * a real browser on a made-up seed: screenshots at 1440 and 390 (deviceScaleFactor 2), no sideways
 * scroll on Home at five widths, with a note open too, and the note's ways out clicked through.
 *
 *   npm run build
 *   OUT=<folder> node scripts/moves-check.mjs          (PORT=5940 by default)
 *   ONLY=sideways node scripts/moves-check.mjs         the widths only (ONLY=shots, ONLY=flows: the pictures, the note's ways out)
 *
 * It writes its own made-up seed (fake companies, fake people, nobody real) into a temporary data
 * folder, with one member's network as a Google sync leaves it (nothing is read from Google: the
 * connector's test address points at a closed local port), starts `next start` with billing on
 * (fake Stripe ids) and the Google connector on, and removes the folder after. Nothing leaves the
 * machine. Needs Playwright (NODE_PATH or node_modules).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = Number(process.env.PORT || 5940);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT || path.join(tmpdir(), "moves-check");
const ONLY = process.env.ONLY || "all";
mkdirSync(OUT, { recursive: true });

/* ---------- a made-up seed ---------- */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms) => new Date(t0 + ms).toISOString();
const today = iso(0).slice(0, 10);
const monthAgo = (n) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const co = (id, name, site, industry, employees, hq) => ({ id, fields: { name, website: site, industry, employees, revenue: "$5M–$20M", hq } });
const NAMED = [
  co("c_lark", "Larkfield Robotics", "larkfieldrobotics.example", "Manufacturing", "51–200", "Pittsburgh, PA"),
  co("c_corv", "Corvid Health", "corvidhealth.example", "Healthcare", "201–500", "Nashville, TN"),
  co("c_harb", "Harborline Pay", "harborlinepay.example", "Fintech", "11–50", "Charlotte, NC"),
  co("c_salt", "Saltmarsh Energy", "saltmarshenergy.example", "Manufacturing", "201–500", "Houston, TX"),
  co("c_copp", "Copperleaf Kitchens", "copperleafkitchens.example", "Manufacturing", "51–200", "Columbus, OH"),
  co("c_tall", "Tallgrass Analytics", "tallgrassanalytics.example", "SaaS", "51–200", "Omaha, NE"),
  co("c_nort", "Northwind Supply", "northwindsupply.example", "Logistics", "201–500", "Minneapolis, MN"),
  co("c_pine", "Pinecrest Logistics", "pinecrestlogistics.example", "Logistics", "51–200", "Memphis, TN"),
  co("c_blue", "Bluefin Freight", "bluefinfreight.example", "Logistics", "51–200", "Savannah, GA"),
];
const A = ["Quill", "Bramble", "Larkspur", "Driftwood", "Juniper", "Ironbark", "Tidewater", "Foxglove", "Hollowell", "Marigold", "Stonebridge", "Ashgrove"];
const B = ["Analytics", "Health", "Labs", "Software", "Payments", "Learning", "Security"];
const fillers = Array.from({ length: 36 }, (_, k) => co(`c_f${String(k).padStart(2, "0")}`, `${A[k % A.length]} ${B[(k * 3 + Math.floor(k / A.length)) % B.length]}`, `${A[k % A.length].toLowerCase()}${k}.example`, ["SaaS", "Fintech", "Healthcare"][k % 3], ["11–50", "51–200", "201–500"][k % 3], ["Austin, TX", "Denver, CO", "Chicago, IL", "Boston, MA"][k % 4]));
const companies = [...NAMED, ...fillers];
const seat = (id, companyId, fields, extra = {}) => ({ id, companyId, verified: false, fields, ...extra });
const cro = (id, companyId, months, operator) =>
  seat(id, companyId, { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: monthAgo(months), status: "Active", end: "Ongoing", ...(operator ? { operator } : {}) });
const engagements = [
  cro("e_lark_cro", "c_lark", 2),
  cro("e_corv_cro", "c_corv", 3),
  cro("e_harb_cro", "c_harb", 5),
  seat("e_harb_open", "c_harb", { source: "Demand scan", role: "Fractional Head of RevOps", function: "RevOps", status: "Open role", posting: "https://harborlinepay.example/careers/revops", rate: "$8k/mo" }),
  cro("e_salt_cro", "c_salt", 2, "Hana Okafor"),
  seat("e_copp_cmo", "c_copp", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(3), status: "Active", end: "Ongoing", operator: "Pella Quist" }, { holderFrom: "public profile" }),
  cro("e_tall_cro", "c_tall", 4),
  seat("e_tall_open", "c_tall", { source: "Demand scan", role: "Fractional VP RevOps", function: "RevOps", status: "Open role", posting: "https://tallgrassanalytics.example/careers/revops", rate: "$9k/mo" }),
  cro("e_nort_cro", "c_nort", 1),
  cro("e_pine_cro", "c_pine", 2),
  cro("e_blue_cro", "c_blue", 3),
  ...fillers.map((c, k) => seat(`e_f${k}`, c.id, { source: "Seat scan", role: `Fractional ${["CMO", "CFO", "COO"][k % 3]}`, function: ["Marketing", "Finance", "Operations"][k % 3], type: "Fractional", start: monthAgo(6 + (k % 12)), status: "Active", end: "Ongoing" })),
];
const contacts = [{ id: "p_salt_ceo", companyId: "c_salt", fields: { name: "Bastian Quell", title: "CEO", relationship: "Hiring for the seat", email: "bastian@saltmarshenergy.example" } }];
const m = (id, name, token, title = "Fractional Head of RevOps") => ({ id, name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, title, token });
const MEMBERS = {
  morgan: m("mem_morgan", "Morgan Hale", "tok-mv-morgan-0001"),
  tess: m("mem_tess", "Tess Okonkwo", "tok-mv-tess-0002"),
  fen: m("mem_fen", "Fen Albright", "tok-mv-fen-0003"),
  pat: m("mem_pat", "Pat Lindqvist", "tok-mv-pat-0004"),
  hana: m("mem_hana", "Hana Okafor", "tok-mv-hana-0005", "Fractional CRO"),
  admin: m("mem_ada", "Ada Admin", "tok-mv-ada-0006", "Admin"),
};
const seed = { builtAt: iso(-40 * DAY), members: Object.values(MEMBERS), companies, engagements, contacts };

/** One kept Crystal Ball row (lib/radar/types.ts RadarSentRow). */
const hired = (who, c, band, months, gap) => ({ k: `mv:${who}:${c}`, c, kind: "adjacent", l: `Hired a fractional CRO ${months} months ago · Sales usually comes before RevOps`, b: band, w: `Fractional CRO hired ${months} months ago · RevOps usually follows in ${gap} months` });
const role = (who, c, title) => ({ k: `mv:${who}:${c}:r`, c, kind: "role", l: `New open role: ${title} · In your function`, b: "High", w: "Open now · a direct opening in RevOps" });
const ball = (who) => ({
  sent: {},
  days: {
    [today]: [
      hired(who, "c_nort", "High", 1, "1–4"),
      role(who, "c_tall", "Fractional VP RevOps"),
      hired(who, "c_salt", "High", 2, "1–4"),
      hired(who, "c_copp", "High", 3, "1–4"),
      hired(who, "c_lark", "Medium", 2, "1–4"),
      hired(who, "c_corv", "High", 3, "1–4"),
      role(who, "c_harb", "Fractional Head of RevOps"),
      hired(who, "c_pine", "Medium", 2, "1–4"),
      hired(who, "c_blue", "Low", 3, "1–4"),
    ],
  },
});
const day = (monthsBack, d = 12) => `${monthAgo(monthsBack)}-${String(d).padStart(2, "0")}`;
const person = (email, name, title, meetings, last) => ({ key: email, email, name, title, meetings, last, first: day(15), src: ["calendar", "contacts"], saved: true });
const netCo = (domain, p) => ({ domain, people: [p], meetings: p.meetings, last: p.last, first: p.first, months: [p.last.slice(0, 7)] });
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
const ICP = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
/** A casual voice, as a member's own Claude saves it (save_my_voice), and a formal one set by hand. */
const VOICES = {
  casual: { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "sometimes", emoji: false, opener: "smalltalk", phrases: ["Hope the week's treating you well", "No rush at all"] },
  formal: { greeting: "Dear {first},", signoff: "Regards,", name: "full", length: "medium", formality: "formal", contractions: false, exclamations: "never", emoji: false, opener: "direct", phrases: [] },
};

const dir = mkdtempSync(path.join(tmpdir(), "rn-moves-"));
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((x) => [x.id, iso(-3 * DAY)])),
    profiles: Object.fromEntries(seed.members.map((x) => [x.id, { function: x.id === "mem_hana" ? "Sales" : "RevOps", onboarded: true, icp: ICP, before: ["Sales"] }])),
    billing: {
      members: {
        mem_morgan: trial,
        mem_tess: trial,
        mem_hana: trial,
        mem_fen: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY), notices: { trialEndedSeen: iso(-8 * DAY) } },
        mem_pat: { trialStartedAt: iso(-22 * DAY), trialEndsAt: iso(-1 * DAY), proUntil: iso(29 * DAY), interval: "month", paidSince: iso(-HOUR), subscriptionId: "sub_mv_pat", customerId: "cus_mv_pat" },
      },
      events: [],
      payments: [],
      ended: [],
    },
    radar: { lastRunAt: null, lastRunDay: null, members: Object.fromEntries(["mem_morgan", "mem_tess", "mem_fen", "mem_pat"].map((id) => [id, ball(id)])), stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 } },
    // Morgan's voice, saved by her own Claude two days ago.
    voice: { mem_morgan: { ...VOICES.casual, at: iso(-2 * DAY), by: "claude" } },
    network: {
      mem_morgan: {
        google: { token: "sealed-not-a-real-token", email: "morgan@halerevops.example", scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/contacts.readonly"], connectedAt: iso(-3 * DAY), syncedAt: iso(-20 * 60_000), status: "ok" },
        cal: {
          at: iso(-20 * 60_000),
          unmatched: 131,
          real: 22,
          companies: {
            c_lark: netCo("larkfieldrobotics.example", person("dana@larkfieldrobotics.example", "Dana Whitfield", "CEO", 4, day(8))),
            c_corv: netCo("corvidhealth.example", person("priya@corvidhealth.example", "Priya Raman", "Director of Operations", 5, iso(-16 * DAY).slice(0, 10))),
            c_harb: netCo("harborlinepay.example", person("nia@harborlinepay.example", "Nia Castell", "Head of Growth", 2, day(2))),
          },
        },
      },
    },
  }),
);

/* ---------- the server ---------- */
const env = {
  ...process.env,
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  // A made-up seed key, so found seats have claim links (Invite to connect).
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 5).toString("base64"),
  RN_ID_SECRET: "moves-check-not-real",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: MEMBERS.admin.email,
  RN_SCAN_TEST: "1",
  RN_LOGO_LOOKUP: "off",
  RN_DIGEST: "0",
  RN_RADAR: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_movescheck",
  STRIPE_WEBHOOK_SECRET: "whsec_movescheck",
  STRIPE_PRICE_MONTH: "price_movescheck_m",
  STRIPE_PRICE_YEAR: "price_movescheck_y",
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "moves-check-client",
  GOOGLE_CLIENT_SECRET: "moves-check-secret",
  // Nothing is read from Google: its test address is a closed local port.
  RN_GOOGLE_API_TEST: "http://127.0.0.1:9",
};
for (const k of ["RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE_GMAIL"]) delete env[k];
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = () => {
  try {
    server.kill();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
};
process.on("exit", stop);
for (let k = 0; k < 120; k++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (token, action) => {
  const r = await fetch(`${BASE}/api/table`, { method: "POST", headers: { "content-type": "application/json", cookie: `rn_table=${token}` }, body: JSON.stringify({ action }) });
  return r.json().catch(() => null);
};
const todayOf = async (token) => (await fetch(`${BASE}/api/table?today=1`, { headers: { cookie: `rn_table=${token}` } })).json();

/* ---------- Tess opens her three and sees who held the seats (as a member would, at the usual prices) ---------- */
{
  const T = MEMBERS.tess.token;
  const t = await todayOf(T);
  for (const w of t.moves.list) await api(T, { type: "unlock", entity: "company", id: w.id, field: "identity", from: "crystal" });
  const t2 = await todayOf(T);
  for (const c of t2.companies) for (const e of c.engagements) if (e.cells?.operator?.s === "locked") await api(T, { type: "unlock", entity: "engagement", id: e.id, field: "operator" });
}

/* ---------- how long ?today=1 takes on the server, and how big it is (a member with a network, one without) ---------- */
const results = { shots: [], sideways: null };
{
  const time = async (token) => {
    const ms = [];
    let bytes = 0;
    for (let k = 0; k < 12; k++) {
      const at = performance.now();
      const r = await fetch(`${BASE}/api/table?today=1`, { headers: { cookie: `rn_table=${token}` } });
      bytes = (await r.text()).length;
      ms.push(performance.now() - at);
    }
    ms.sort((a, b) => a - b);
    return { medianMs: Math.round(ms[6] * 10) / 10, bytes };
  };
  results.today = { withNetwork: await time(MEMBERS.morgan.token), without: await time(MEMBERS.fen.token) };
  console.log("?today=1", JSON.stringify(results.today));
}

/* ---------- the browser ---------- */
const browser = await chromium.launch();
const iphone = devices["iPhone 13"];
const WIDE = { viewport: { width: 1440, height: 900 } };
async function context(member, opts = WIDE) {
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "rn_table", value: member.token, url: BASE }]);
  await ctx.addInitScript((at) => {
    try {
      if (!localStorage.getItem("tp_last_visit")) localStorage.setItem("tp_last_visit", at);
    } catch {}
  }, iso(-3 * DAY));
  return ctx;
}
/** Home is drawn: the top bar is there, the moves have landed and nothing is still loading. */
const settle = async (page) => {
  await page.waitForFunction(() => !!document.querySelector(".tp-top") && !document.querySelector(".tp-allwait, .mv-skel, .td-card-skel, .hm-card-wait"), null, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(900);
};
const shot = async (page, name, opts = {}) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  results.shots.push(`${name}.png`);
  console.log(`shot ${name}.png`);
};
/** The whole of Home on a phone, in one picture no taller than 3,900 CSS px (7,800 device px). */
const tall = async (page, name) => {
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.querySelector(".tp-main-page")?.scrollHeight ?? 0));
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: Math.min(3900, Math.max(vp.height, h + 140)) });
  await page.waitForTimeout(400);
  await shot(page, name);
  await page.setViewportSize(vp);
};
const home = async (member, opts) => {
  const ctx = await context(member, opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  return { ctx, page };
};
const SIZES = [
  ["1440", WIDE],
  ["390", { ...iphone }],
];
const draft = async (page, title) => {
  await page.locator(".mv-card", { hasText: title }).first().locator(".mv-main").click();
  await page.waitForSelector(".mn-sheet", { timeout: 10_000 });
  await page.waitForTimeout(500);
};

async function shots() {
  // The note in a casual voice (from her Claude), Your profile's "Your writing voice", then a formal one (set by hand), then none.
  for (const [w, opts] of SIZES) {
    const { ctx, page } = await home(MEMBERS.morgan, opts);
    await draft(page, "Message Dana");
    await shot(page, `note-voice-casual-${w}`);
    await ctx.close();
  }
  for (const [w, opts] of SIZES) {
    const { ctx, page } = await home(MEMBERS.morgan, opts);
    // Your profile, from the account menu (through More on a phone).
    if (w === "390") {
      await page.locator(".tp-tabbar [data-nav='more']").click();
      await page.waitForTimeout(400);
    }
    await page.locator(".tp-nav-me").last().click();
    await page.waitForTimeout(400);
    await page.getByText("Your profile", { exact: true }).first().click();
    await page.waitForSelector(".vo-sec", { timeout: 10_000 });
    await page.evaluate(() => document.querySelector(".vo-sec")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    await shot(page, `voice-profile-${w}`);
    await page.locator(".vo-sec .btn", { hasText: "Edit" }).click();
    await page.waitForSelector(".vo-sheet", { timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot(page, `voice-edit-${w}`);
    await ctx.close();
  }
  await api(MEMBERS.morgan.token, { type: "voice", voice: VOICES.formal });
  for (const [w, opts] of SIZES) {
    const { ctx, page } = await home(MEMBERS.morgan, opts);
    await draft(page, "Message Dana");
    await shot(page, `note-voice-formal-${w}`);
    await ctx.close();
  }
  await api(MEMBERS.morgan.token, { type: "voice", remove: true });

  // Home with three moves: Trial with Google connected, Trial without, Free.
  for (const [who, name] of [["morgan", "home-trial-google"], ["tess", "home-trial-no-google"], ["fen", "home-free"]])
    for (const [w, opts] of SIZES) {
      const { ctx, page } = await home(MEMBERS[who], opts);
      await shot(page, `${name}-${w}`);
      if (w === "390") await tall(page, `${name}-${w}-full`);
      else {
        await page.evaluate(() => document.querySelector(".tp-main-page")?.scrollTo(0, 99999));
        await page.waitForTimeout(400);
        await shot(page, `${name}-${w}-lower`);
      }
      await ctx.close();
    }

  // In between: a tablet and a small laptop, where a move's three parts fold to two rows.
  for (const w of [768, 1024]) {
    const { ctx, page } = await home(MEMBERS.morgan, { viewport: { width: w, height: 900 } });
    await shot(page, `home-trial-google-${w}`);
    await ctx.close();
  }

  // The drafted note: someone you know, the seat holder, an open role.
  for (const [who, title, name] of [["morgan", "Message Dana", "note-someone-you-know"], ["tess", "Message the seat holder", "note-seat-holder"], ["tess", "Reply to the open role", "note-open-role"], ["tess", "Invite them to connect", "note-invite"]])
    for (const [w, opts] of SIZES) {
      const { ctx, page } = await home(MEMBERS[who], opts);
      await draft(page, title);
      await shot(page, `${name}-${w}`);
      await ctx.close();
    }

  // Done, then Snooze: the next best takes each one's place, and the month's count shows.
  {
    const { ctx, page } = await home(MEMBERS.morgan);
    await page.locator(".mv-card").first().getByRole("button", { name: /^Done/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, "after-done-1440");
    await page.waitForTimeout(6000);
    await page.locator(".mv-card").nth(1).getByRole("button", { name: /^Snooze/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, "after-snooze-1440");
    await ctx.close();
    const phone = await home(MEMBERS.morgan, { ...iphone });
    await shot(phone.page, "after-done-snooze-390");
    await tall(phone.page, "after-done-snooze-390-full");
    await phone.ctx.close();
  }

  // The Pro welcome, once, on Home.
  for (const [w, opts] of SIZES) {
    const { ctx, page } = await home(MEMBERS.pat, opts);
    await page.waitForSelector(".bl-hello", { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await shot(page, `pro-welcome-${w}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await home(MEMBERS.pat);
    await page.locator(".bl-hello .btn", { hasText: "Got it" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await settle(page);
    results.proWelcomeOnce = (await page.locator(".bl-hello").count()) === 0;
    console.log("pro welcome gone after Got it and a reload:", results.proWelcomeOnce);
    await ctx.close();
  }
}

/**
 * The note's ways out, clicked through as Tess (who has no voice and no network): the Gmail link
 * carries the note as it reads now and no address she doesn't have, a voice set by hand rewrites
 * an untouched note, Message on Merlin sends and marks the move done, Mark as sent does too.
 */
async function flows() {
  const out = {};
  const { ctx, page } = await home(MEMBERS.tess);
  const titles = () => page.$$eval(".mv-card .mv-do-t", (els) => els.map((e) => e.textContent));
  const href = () => page.locator(".mn-sheet a.mn-go").getAttribute("href");
  out.before = await titles();
  // An open role: nobody to write to, so no address; what she types is what the link carries.
  await draft(page, "Reply to the open role");
  const first = new URL(await href());
  out.roleLinkHasNoAddress = !first.searchParams.get("to") && first.hostname === "mail.google.com" && /Tallgrass Analytics/.test(first.searchParams.get("su") ?? "");
  await page.locator("#mn-body").fill("Hello, a note I wrote myself.");
  out.linkCarriesTheEdit = new URL(await href()).searchParams.get("body") === "Hello, a note I wrote myself.";
  out.mailtoToo = ((await page.locator(".mn-sheet a.mn-other").getAttribute("href")) ?? "").startsWith("mailto:?subject=");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // A voice set by hand from the note rewrites it (it was still as drafted).
  await draft(page, "Message the seat holder");
  out.plainFirst = /^Hi Hana,/.test(await page.locator("#mn-body").inputValue());
  await page.locator(".mn-sheet .vo-line").getByText("Set it by hand").click();
  await page.waitForSelector(".vo-sheet", { timeout: 10_000 });
  await page.locator(".vo-sheet").getByRole("radio", { name: "Formal" }).click();
  await page.locator(".vo-sheet").getByRole("radio", { name: "Dear Dana," }).click();
  await page.locator(".vo-sheet").getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".vo-sheet", { state: "detached", timeout: 10_000 });
  await page.waitForTimeout(500);
  const formal = await page.locator("#mn-body").inputValue();
  out.voiceRewritesTheNote = /^Dear Hana,/.test(formal) && /I noticed that you held/.test(formal) && (await page.locator(".mn-sheet .vo-on").count()) === 1;
  // Message on Merlin: sent as written, and the move is done.
  await page.locator(".mn-sheet").getByRole("button", { name: "Message on Merlin" }).click();
  await page.waitForSelector(".mn-sheet", { state: "detached", timeout: 10_000 });
  await page.waitForTimeout(1200);
  out.afterMerlin = await titles();
  out.merlinMarksDone = !out.afterMerlin.includes("Message the seat holder") && /This month:\s*1\s*move done/.test((await page.locator(".mv-tally").textContent()) ?? "");
  const hana = await (await fetch(`${BASE}/api/table?messages=1`, { headers: { cookie: `rn_table=${MEMBERS.hana.token}` } })).json();
  out.hanaGotIt = (hana.conversations ?? []).some((c) => c.messages?.some((m) => /^Dear Hana,/.test(m.text)));
  // Mark as sent: the move leaves today's moves (and counts), and the company goes into Your pipeline at
  // Sent with a follow-up in 3 business days (lib/pipeline.ts), no longer simply hidden for 30 days.
  await draft(page, "Invite them to connect");
  await page.locator(".mn-sheet").getByRole("button", { name: "Mark as sent" }).click();
  await page.waitForSelector(".mn-sheet", { state: "detached", timeout: 10_000 });
  await page.waitForTimeout(1200);
  out.afterSent = await titles();
  out.sentMarksDone = !out.afterSent.includes("Invite them to connect") && /This month:\s*2\s*moves done/.test((await page.locator(".mv-tally").textContent()) ?? "");
  const pipe = await (await fetch(`${BASE}/api/table?pipeline=1`, { headers: { cookie: `rn_table=${MEMBERS.tess.token}` } })).json();
  out.sentInPipeline = (pipe.entries ?? []).some((e) => e.stage === "sent" && /^\d{4}-\d{2}-\d{2}$/.test(e.due ?? ""));
  await api(MEMBERS.tess.token, { type: "voice", remove: true });
  await ctx.close();
  results.flows = out;
  console.log("flows", JSON.stringify(out));
}

/** Home doesn't scroll sideways at 320, 390, 768, 1024 and 1440, for each kind of member, nor with a note open. */
async function sideways() {
  const out = [];
  for (const w of [320, 390, 768, 1024, 1440])
    for (const who of ["morgan", "tess", "fen", "pat"]) {
      const { ctx, page } = await home(MEMBERS[who], w < 768 ? { ...iphone, viewport: { width: w, height: 800 } } : { viewport: { width: w, height: 900 } });
      const over = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, ...[...document.querySelectorAll(".tp-main-page, .tp-sheet-body")].map((el) => el.scrollWidth - el.clientWidth)));
      out.push({ w, who, at: "home", over: await over() });
      const main = page.locator(".mv-card .mv-main", { hasText: "Draft" }).first();
      if (await main.count()) {
        await main.click();
        await page.waitForSelector(".mn-sheet", { timeout: 10_000 });
        await page.waitForTimeout(300);
        out.push({ w, who, at: "note", over: await over() });
      }
      await ctx.close();
    }
  results.sideways = { bad: out.filter((x) => x.over > 0), checked: out.length };
  console.log("sideways", JSON.stringify(results.sideways));
}

try {
  if (ONLY === "shots" || ONLY === "all") await shots();
  if (ONLY === "sideways" || ONLY === "all") await sideways();
  // Last: it marks two of Tess's moves done.
  if (ONLY === "flows" || ONLY === "all") await flows();
  writeFileSync(path.join(OUT, `results-${ONLY}.json`), JSON.stringify(results, null, 2));
} catch (e) {
  console.error(e);
  console.error(serverLog.slice(-3000));
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
