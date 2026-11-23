/**
 * Checks of Alerts (Stage 7a): the alert fields on saved lists, the plan's gates, the bell's inbox
 * (lib/inbox.ts), the alert log, the watch's triggers (lib/notify/events.ts afterWatch: a seat
 * ended, a new leader, a fact changed, funding, Companies you follow, Someone you know changed
 * jobs), the locked naming rule, the email's one-click turn-off, purge and the export. In process,
 * on a made-up seed in a temporary data dir, with fetch replaced: nothing leaves the machine.
 *
 *   npx tsx scripts/test-alerts.mts      exits 1 on any failure
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-alerts-"));
const MIN = 60_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", token: "tok-jordan-0001" },
    { id: "mem_riley", name: "Riley Moss", email: "riley@moss.example", title: "Fractional CMO", token: "tok-riley-0001" },
    { id: "mem_free", name: "Frankie Free", email: "frankie@free.example", title: "Fractional CFO", token: "tok-free-0001" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_lark", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "E-Learning Providers", employees: "51-200", hq: "Boston, MA" } },
  ],
  engagements: [
    { id: "e_north_sales", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active" } },
    { id: "e_cedar_sales", companyId: "c_cedar", fields: { source: "Published engagement", role: "Fractional CRO", function: "Sales", type: "Fractional", start: "2025-03", status: "Active" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const T1 = iso(t0 - 10 * MIN);
const seen = iso(t0 - 2 * DAY);
const listAlert = { on: true, triggers: ["seat", "leader", "fact", "funding"], every: "instant", email: true, slack: false, bell: true };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    // A seat ended at Northwind (Jordan has opened it), its status written by another member in the window.
    values: {
      "e_north_sales.status": { value: "Ended", by: "mem_riley", at: T1, status: "live" },
      "e_north_sales.end": { value: iso(t0).slice(0, 7), by: "mem_riley", at: T1, status: "live" },
      "c_lark.revenue": { value: "$5M–$20M", by: "mem_riley", at: T1, status: "live" },
    },
    // Jordan knows Northwind (they opened it). Cedar and Pine, Halcyon and Larkspur stay locked for them.
    unlocks: { "c_north.identity": ["mem_jordan"] },
    seen: { mem_jordan: seen, mem_riley: seen, mem_free: seen },
    profiles: { mem_jordan: { function: "Sales", onboarded: true }, mem_riley: { function: "Marketing", onboarded: true }, mem_free: { function: "Finance", onboarded: true } },
    follows: { mem_jordan: ["c_lark"], mem_free: ["c_lark"] },
    connector: {
      clients: [],
      grants: [],
      alerts: {
        mem_jordan: [{ id: "al_jordan01", name: "Health care and software", createdAt: seen, place: "v=all&t=companies", alert: listAlert }],
        mem_free: [{ id: "al_free0001", name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { ...listAlert, triggers: ["seat"] } }],
      },
    },
    // New leaders on two websites: Dana Reyes at Cedar and Pine (locked for Jordan), Sam Ortiz at Northwind (open).
    leaders: {
      c_cedar: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Sales: { level: "VP", kind: "full-time", how: "team page", url: "https://cedarpine.example/team", seenAt: T1, name: "Dana Reyes", title: "VP Sales" } } },
      c_north: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Marketing: { level: "VP", kind: "full-time", how: "team page", url: "https://northwind.example/team", seenAt: T1, name: "Sam Ortiz", title: "VP Marketing" }, Finance: { level: "Head", kind: "full-time", how: "team page", url: "https://northwind.example/team", seenAt: T1, name: "Pat Lee", title: "Head of Finance" } } },
    },
    leaderArrivals: [
      { companyId: "c_cedar", fn: "Sales", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_north", fn: "Marketing", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_north", fn: "Finance", kind: "full-time", level: "Head", at: T1 },
    ],
    // Funding filings, as lib/funding keeps them: one at Northwind (open), one at Cedar and Pine (locked).
    funding: {
      lastRunAt: T1, lastRunDay: T1.slice(0, 10), days: {}, last: null, totals: { filings: 2, read: 2, matched: 2, unmatched: {} },
      events: [
        { companyId: "c_north", at: T1, filed: T1.slice(0, 10), firstSale: null, band: "$1M–$5M", about: "about $2.5M", round: "equity", source: "SEC filing", accession: "0000000000-26-000001" },
        { companyId: "c_cedar", at: T1, filed: T1.slice(0, 10), firstSale: null, band: "$5M–$20M", about: "about $6M", round: "SAFE", source: "SEC filing", accession: "0000000000-26-000002" },
      ],
    },
    // Jordan's own sources: Dana was at Halcyon Freight (LinkedIn file), Sam at Larkspur Learning (contacts CSV); Pat Lee shows at two companies (maybe two people).
    paths: {
      mem_jordan: {
        linkedin: { at: seen, skipped: 0, rows: [{ f: "Dana", l: "Reyes", c: "Halcyon Freight" }, { f: "Pat", l: "Lee", c: "Halcyon Freight" }] },
        csv: { at: seen, skipped: 0, rows: [{ n: "Sam Ortiz", c: "Larkspur Learning" }, { n: "Pat Lee", c: "Larkspur Learning" }] },
      },
    },
    alertWatch: { at: iso(t0 - 20 * MIN), members: {} },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FUNDING: "1",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
  RN_FREE_COMPANY: "off",
});
for (const k of ["RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_BILLING", "STRIPE_SECRET_KEY", "RN_ADMIN_EMAILS"]) delete process.env[k];

type Sent = { url: string; body: Record<string, unknown> };
const outbox: Sent[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body ?? "{}"));
  } catch {
    body = {};
  }
  outbox.push({ url: String(input), body });
  return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const A = await import("../lib/mcp/alerts");
  const H = await import("../lib/hunt");
  const R = await import("../lib/billing/rules");
  const I = await import("../lib/inbox");
  const K = await import("../lib/notify/known");
  const t = await import("../lib/table");
  const ev = await import("../lib/notify/events");
  const n = await import("../lib/notify");
  const pub = t.tableInternals.pubId;
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 15));
      await n.settled();
    }
  };

  /* ---------- the alert fields on a list ---------- */
  const old = { id: "al_old00001", name: "Old", createdAt: seen, place: "v=all&t=companies" };
  check("a view saved before alerts reads as its weekly email", same(A.alertOf(old), { on: true, triggers: ["role"], every: "weekly", email: true, slack: true, bell: true }));
  check("a view that follows hires watches its hires", same(A.alertOf({ ...old, hiredFn: ["Finance"], hiredWithin: 6 }).triggers, ["hire"]));
  check("an alert saved in Stage 1 fills its new fields", same(A.alertOf({ ...old, alert: { on: true, every: "weekly", email: true, slack: false } as never }), { on: true, triggers: ["role"], every: "weekly", email: true, slack: false, bell: true }));
  const clean = A.cleanListFields({ alert: { on: true, triggers: ["seat", "nonsense", "funding"], every: "hourly", email: false, slack: true, bell: false } });
  check("cleanListFields keeps known triggers, drops an unknown frequency", same(clean.alert, { on: true, triggers: ["seat", "funding"], every: "weekly", email: false, slack: true, bell: false }), clean);
  const now = iso(t0);
  const newId = () => "al_new00001";
  const saved = H.savedViewAction([old], { op: "alert", id: old.id, list: { alert: { triggers: ["seat", "leader"], every: "daily", bell: true } } }, newId, now);
  check("the alert op sets triggers, how often and the bell", same(saved.list[0].alert, { on: true, triggers: ["seat", "leader"], every: "daily", email: true, slack: true, bell: true }) && /every morning/.test(saved.message), saved);
  let refused = "";
  try {
    H.savedViewAction(saved.list, { op: "alert", id: old.id, list: { alert: { every: "instant" } } }, newId, now, { free: true });
  } catch (e) {
    refused = (e as Error).message;
  }
  check("on Free, as it happens is refused in plain words", /part of Pro/.test(refused), refused);
  const pro = H.savedViewAction(saved.list, { op: "alert", id: old.id, list: { alert: { every: "instant" } } }, newId, now, { free: false });
  check("on Pro, as it happens is saved", pro.list[0].alert?.every === "instant");
  const bellOnly = H.savedViewAction(saved.list, { op: "alert", id: old.id, list: { alert: { email: false, slack: false, bell: true } } }, newId, now);
  check("an alert can go to the bell alone, and its weekly email follows it", bellOnly.list[0].alert?.bell === true && bellOnly.list[0].email === false);
  check("alertOnPlan: Free gets as it happens each morning, and no Slack beyond roles", same(R.alertOnPlan({ every: "instant", slack: true }, true, "seat"), { every: "daily", slack: false }) && R.alertOnPlan({ every: "weekly", slack: true }, true, "role").slack === true);
  check("alertOnPlan: Pro keeps what was set", same(R.alertOnPlan({ every: "instant", slack: true }, false, "seat"), { every: "instant", slack: true }));
  check("the plan's words say what Free holds back", /Pro/.test(R.ALERT_PRO_WORDS) && R.FREE_ALERT_EVERY.join() === "daily,weekly");

  /* ---------- the inbox and the log (pure) ---------- */
  const st: Parameters<typeof I.pushInbox>[0] = {};
  for (let i = 0; i < 230; i++) I.pushInbox(st, "m", [{ id: `x:${i}`, at: iso(t0 - (230 - i) * MIN), kind: "seat", line: `Line ${i}`, href: "/?c=abc" }]);
  check("the inbox keeps the newest 200", st.inbox!.m.length === I.INBOX_MAX && st.inbox!.m[0].id === "x:229" && !st.inbox!.m.some((x) => x.id === "x:0"));
  check("the same line twice is one line", I.pushInbox(st, "m", [{ id: "x:229", at: iso(t0), kind: "seat", line: "Again", href: "/" }]) === 0);
  check("an inbox link stays inside the app", I.appHref("https://evil.example/") === "/" && I.appHref("javascript:alert(1)") === "/" && I.appHref("/?c=abc") === "/?c=abc");
  check("mark read: some, then all", I.markRead(st, "m", ["x:229", "x:228"]) === 2 && I.inboxOf(st, "m").unread === 198 && I.markRead(st, "m") === 198 && I.inboxOf(st, "m").unread === 0);
  I.logAlert(st, "m", [{ at: iso(t0 - 100 * DAY), alert: "radar", kind: "radar", channel: "email", count: 1 }], t0 - 100 * DAY);
  I.logAlert(st, "m", [{ at: iso(t0 - 3 * DAY), alert: "radar", kind: "radar", channel: "email", count: 2 }, { at: iso(t0 - 1 * DAY), alert: "list:al_1", kind: "watch", channel: "bell", count: 3 }], t0);
  check("the log keeps 90 days", st.alertLog!.m.length === 2);
  const sum = I.alertsOf(st, "m", iso(t0 - 2 * DAY), t0);
  check("alerts sent since a visit, and each alert's last time", sum.sent === 1 && sum.last.radar.count === 2 && !!sum.last["list:al_1"] && !!sum.countingSince, sum);
  I.forgetAlerts(st, "m");
  check("forgetAlerts deletes the member's inbox and log", !st.inbox!.m && !st.alertLog!.m);

  /* ---------- Someone you know (pure) ---------- */
  const lead = (nameKey: string, companyId: string, companyName: string, californian = false) => ({ key: `k:${nameKey}:${companyId}`, companyId, companyName, nameKey, fn: "Sales", at: now, californian });
  const ppl = [
    { name: "Dana Reyes", nameKey: "dana reyes", companyId: null, company: "Halcyon Freight, Inc.", src: "linkedin" as const },
    { name: "Pat Lee", nameKey: "pat lee", companyId: null, company: "Halcyon Freight", src: "linkedin" as const },
    { name: "Pat Lee", nameKey: "pat lee", companyId: null, company: "Larkspur Learning", src: "csv" as const },
    { name: "Robin Hale", nameKey: "robin hale", companyId: null, company: null, src: "csv" as const },
    { name: "Ari Stone", nameKey: "ari stone", companyId: null, company: "Northwind Clinics LLC", src: "csv" as const },
    { name: "Jordan Avery", nameKey: "jordan avery", companyId: null, company: "Avery Advisory", src: "csv" as const },
  ];
  const moves = K.knownMoves(ppl, [lead("dana reyes", "c1", "Cedar and Pine"), lead("pat lee", "c1", "Cedar and Pine"), lead("robin hale", "c1", "Cedar and Pine"), lead("ari stone", "c2", "Northwind Clinics"), lead("jordan avery", "c1", "Cedar and Pine"), lead("noone here", "c1", "Cedar and Pine")], "jordan avery");
  check("a known person at one other company, now a new leader: one move", moves.length === 1 && moves[0].person.name === "Dana Reyes", moves);
  check("two companies for one name, no company, already there, the member themself, nobody known: nothing said", !moves.some((m) => ["pat lee", "robin hale", "ari stone", "jordan avery"].includes(m.leader.nameKey)));
  check("the line names the person and the company once it is open", K.knownLine(moves[0], "Cedar and Pine") === "Dana Reyes, someone you know, is a new Sales leader at Cedar and Pine");
  check("at a locked company nobody is named", K.knownLine(moves[0], null) === "Someone you know started at a locked company");
  check("a Californian is never named", K.knownLine({ ...moves[0], leader: { ...moves[0].leader, californian: true } }, "Cedar and Pine") === "Someone you know is a new Sales leader at Cedar and Pine");
  check("company names compare without Inc and LLC", K.coKey("Halcyon Freight, Inc.") === K.coKey("halcyon freight") && K.coKey("Cedar & Pine LLC") === "cedar and pine");

  /* ---------- the page's table (app/post/alerts/model.ts) ---------- */
  const M = await import("../app/post/alerts/model");
  const baseMe = { id: "x", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", function: "Sales", digest: true, radarEmail: "daily", radarSlack: true, messageEmail: true, peerEmail: true } as never as import("../lib/tableTypes").Me;
  const lists = [{ id: "al_a", name: "First", createdAt: now, place: "v=all&t=companies", email: true, criteria: {}, alert: { on: true, triggers: ["seat"], every: "instant", email: true, slack: true, bell: true } }, { id: "al_b", name: "Second", createdAt: now, place: "v=all&t=companies&f=fn:Sales", email: true, criteria: {} }];
  const starters = [{ key: "icp", name: "Your ideal client", kind: "companies", place: "v=all&t=companies&f=icp", criteria: {} }];
  const integ = { allowed: true, slackApp: false, function: "Sales", savedViews: 2, slack: null, webhook: null, alerts: { roles: true, message: true, seat: true, radar: true } };
  const rowsOf = (plan: unknown, close: unknown = null) => M.alertGroups({ me: { ...baseMe, savedViews: lists, plan } as never, email: true, digest: true, integ, close: close as never, alerts: null, starters, nowMs: t0 }).flatMap((g) => g.rows);
  const pRows = rowsOf({ name: "pro", canClose: false });
  const fRows = rowsOf({ name: "free", canClose: false });
  const r = (rs: typeof pRows, id: string) => rs.find((x) => x.id === id)!;
  check("every switch members had has a row: lists, Crystal Ball, the weekly email, follows, someone you know, messages, peers, a seat, 8 proposal alerts", ["list:al_a", "list:al_b", "radar", "digest", "follows", "known", "message", "peer", "seat"].every((id) => !!r(pRows, id)) && pRows.filter((x) => x.kind === "proposal").length === 8);
  check("Slack not connected: the chip says connect it", r(pRows, "list:al_a").chips.find((c) => c.key === "slack")?.state === "connect");
  check("on Free: as it happens shows each morning, Slack for a seat alert is Pro's, the second list is held", r(fRows, "list:al_a").every.value === "daily" && r(fRows, "list:al_a").chips.find((c) => c.key === "slack")?.state === "pro" && !!r(fRows, "list:al_b").held && r(fRows, "list:al_b").on === false);
  check("on Free with a list, a starter list is held too", !!r(fRows, "starter:icp").held && !r(fRows, "starter:icp").canSwitch && !r(pRows, "starter:icp").held);
  check("the leader trigger is Pro's on Free", r(fRows, "list:al_a").triggers!.find((t) => t.key === "leader")?.pro === true && r(pRows, "list:al_a").triggers!.find((t) => t.key === "leader")?.pro === false);
  check("proposal alerts without Close: held, tagged Close, can't switch", fRows.filter((x) => x.kind === "proposal").every((x) => x.tag === "Close" && !x.canSwitch && !x.on));
  check("an old view reads as its weekly email, by email and Slack and the bell", r(pRows, "list:al_b").every.value === "weekly" && r(pRows, "list:al_b").trig === "New open role");
  check("the status line says what the plan holds back", /Slack and as it happens are part of Pro/.test(M.statusLine({ plan: { name: "free" } } as never, 3, 19)) && /Every alert is part of your plan/.test(M.statusLine({ plan: { name: "pro", canClose: true } } as never, 3, 19)));
  check("Since Thursday, and Counting since", /^Since [A-Z][a-z]+day$/.test(M.sinceWords(iso(t0 - 2 * DAY), t0)) && /^Counting since [A-Z][a-z]{2} \d+$/.test(M.countingWords(iso(t0))));

  /* ---------- the watch, on the made-up seed ---------- */
  const r1 = await ev.afterWatch(Date.now());
  await settle();
  const s1 = await t.loadState();
  const box = s1.inbox?.mem_jordan ?? [];
  const lines = box.map((x) => x.line);
  const all = JSON.stringify(box);
  check("the watch looked and wrote lines", r1.looked && r1.lines > 0, r1);
  check("a seat ended at a list company Jordan opened: named", lines.some((l) => /seat ended at Northwind Clinics/.test(l)), lines);
  check("funding as the filing says it, named where opened", lines.some((l) => /^Northwind Clinics raised about \$2\.5M \(equity\) · SEC filing, [A-Z][a-z]{2} \d{4}$/.test(l)), lines);
  check("funding at a locked company: described, never named", lines.some((l) => /^A locked .+ company with 11.50 employees raised about \$6M \(SAFE\)/.test(l)), lines);
  check("a new leader on a list company's website", lines.some((l) => /new Marketing leader \(VP\) on the website of Northwind Clinics/.test(l)), lines);
  check("someone you know at a locked company: nobody named, the company described by its free facts", lines.some((l) => /^Someone you know started at a locked [A-Za-z ]*company( with [^ ]+ employees)?$/.test(l)) && !/Dana/.test(all), lines);
  check("someone you know at an open company: named, from the member's own source", lines.includes("Sam Ortiz, someone you know, is a new Marketing leader at Northwind Clinics"), lines);
  check("a name at two companies in the sources is never matched", !/Pat Lee/.test(all));
  check("no line names a company Jordan hasn't opened", !/Cedar and Pine|Larkspur|Halcyon/.test(all), lines);
  check("every line opens a company record inside the app", box.every((x) => /^\/\?c=/.test(x.href)));
  const mails = outbox.filter((x) => /resend|emails/.test(x.url) && (x.body.to as string[] | undefined)?.[0] === "jordan@avery.example");
  check("one email for the instant alerts", mails.length === 1, outbox.map((x) => x.url));
  const mail = mails[0]?.body ?? {};
  check("the email names no locked company", !/Cedar and Pine|Larkspur|Halcyon/.test(`${mail.text}${mail.html}${mail.subject}`));
  const fmail = outbox.find((x) => (x.body.to as string[] | undefined)?.[0] === "frankie@free.example")?.body ?? {};
  check("each alert in the email has its own turn-off link", /Turn this alert off: https:\/\/post\.example\.com\/api\/table\/unsubscribe\?m=[^&]+&r=alert&a=list%3Aal_jordan01&s=/.test(String(mail.text)) && /a=list%3Aal_free0001&s=/.test(String(fmail.text)) && /a=follows&s=/.test(String(fmail.text)));
  check("the email carries one-click unsubscribe", /List-Unsubscribe/.test(JSON.stringify(mail.headers ?? {})));
  const log1 = s1.alertLog?.mem_jordan ?? [];
  check("the log counts the bell and the email by alert", log1.some((r) => r.alert === "list:al_jordan01" && r.channel === "bell") && log1.some((r) => r.alert === "list:al_jordan01" && r.channel === "email"));
  // Free: the seat alert's email waits for the morning; no Slack.
  const fw = s1.alertWatch?.members.mem_free;
  const fbox = s1.inbox?.mem_free ?? [];
  check("with billing off nothing is held back: the alert went as it happens, by email and the bell", fbox.some((x) => x.kind === "seat") && outbox.some((x) => (x.body.to as string[] | undefined)?.[0] === "frankie@free.example") && !fw?.daily?.length, fw);
  check("a company the member hasn't opened is described for them, even where another member sees its name", fbox.some((x) => /seat ended at a locked .+ company with 51.200 employees$/.test(x.line)) && !/Northwind/.test(JSON.stringify(fbox)), fbox);
  check("Companies you follow: a fact changed at a locked company, described", fbox.some((x) => x.alert === "follows" && /^New at a locked .+ company with 51.200 employees: the revenue range$/.test(x.line)), fbox);
  check("one event is one line, whichever alerts watch it", new Set(box.map((x) => x.id)).size === box.length && box.filter((x) => /revenue range/.test(x.line)).length === 1);

  const r2 = await ev.afterWatch(Date.now());
  check("a second look inside 15 minutes does nothing", !r2.looked);
  const r3 = await ev.afterWatch(Date.now() + 16 * MIN);
  await settle();
  const s3 = await t.loadState();
  check("a later look tells nothing twice", r3.looked && (s3.inbox?.mem_jordan ?? []).length === box.length, { r3, n: s3.inbox?.mem_jordan?.length, before: box.length });

  /* ---------- the bell's actions ---------- */
  const J = "tok-jordan-0001";
  const ib = await t.perform(J, { type: "inbox.read", ids: [box[0].id] });
  check("inbox.read marks one line", (ib as { inbox?: { unread: number } }).inbox?.unread === box.length - 1);
  const fx = await t.perform(J, { type: "alerts.fixed", key: "follows", on: false });
  check("alerts.fixed turns Companies you follow off", (fx as { alerts?: { prefs: { follows: { on: boolean } } } }).alerts?.prefs.follows.on === false && /off/.test(fx.message));
  const tst = await t.perform(J, { type: "alerts.test", alert: "bell" });
  check("Send a test puts a line in the bell", /bell/.test(tst.message) && ((tst as { inbox?: { items: { kind: string }[] } }).inbox?.items[0]?.kind === "test"));
  let other = "";
  try {
    await t.perform("tok-riley-0001", { type: "inbox.read" });
  } catch (e) {
    other = (e as Error).message;
  }
  const s4 = await t.loadState();
  check("one member's inbox is never another's", !other && (s4.inbox?.mem_riley ?? []).length === 0 && (s4.inbox?.mem_jordan ?? []).some((x) => !x.read));

  /* ---------- the email's turn-off link ---------- */
  const link = /https:\/\/post\.example\.com\/api\/table\/unsubscribe\?[^\s]+a=list%3Aal_jordan01[^\s]*/.exec(String(mail.text))?.[0] ?? "";
  const q = new URL(link || "https://x.example/").searchParams;
  check("a link with a wrong signature changes nothing", (await ev.alertOffByLink(q.get("m"), q.get("a"), "wrongsignaturewrongsig")) === null);
  const off = await ev.alertOffByLink(q.get("m"), q.get("a"), q.get("s"));
  const s5 = await t.loadState();
  check("one click turns that alert off, and names it", same(off, ["Health care and software"]) && s5.connector?.alerts?.mem_jordan?.[0].alert?.on === false, off);

  /* ---------- export and purge ---------- */
  const ex = await t.exportState();
  check("the export leaves the inbox and the watch out, keeps the counts", !("inbox" in ex) && !("alertWatch" in ex) && !!(ex as { alertLog?: unknown }).alertLog);
  await t.tableInternals.mutate((d, sd) => {
    t.tableInternals.purgeMember(d, sd, "mem_jordan", iso(Date.now()));
  });
  const s6 = await t.loadState();
  check("purge deletes the member's inbox, log, switches and watch", !s6.inbox?.mem_jordan && !s6.alertLog?.mem_jordan && !s6.alertPrefs?.mem_jordan && !s6.alertWatch?.members.mem_jordan);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
