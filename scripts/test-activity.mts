/**
 * Checks of what happens after a proposal or document goes out (lib/close, app/api/sign/activity,
 * app/api/activity, the hook in app/sign/activity.tsx). No server: lib/table.ts runs in process on
 * a made-up seed in a temporary data dir, billing live with made-up Stripe settings, email "on"
 * with a fake endpoint, Slack a made-up webhook, and fetch replaced, so nothing leaves the machine.
 * Made-up people only: the client Cedar and Pine Software, its signer Dana Whitfield, the member
 * Jordan Avery.
 *
 *   npx tsx scripts/test-activity.mts      exits 1 on any failure
 *
 * Covered: beacon validation and rate limits, reader counting (a cookie, never an IP; the sender
 * not counted), section and option time (capped by the time that passed, per reader, per visit),
 * the follow-up rules, the alerts (first open, a new reader, engaged at most once in 6 hours,
 * signed with the pipeline at Won, each channel's switch, Slack only when connected), reminders
 * (day 2, day 7, before the link closes; off per proposal; stopped on sign, decline and withdraw),
 * the renewal (its date from the terms or asked once, the reminder 30 days before, the copy with
 * its dates moved on), the Close gate, a document linked to a company moving to Won, privacy (the
 * export, account closure), the plan comparison rows and the disclosure.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-activity-"));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Software", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.act@example.com`, title, token: `tok-${id.slice(4)}-act` });
const members = [member("mem_jor", "Jordan Avery", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO"), member("mem_fre", "Fred Free", "Fractional VP Sales")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_cedar", "Cedar and Pine Software", "cedarandpine.example")], engagements: [], contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional VP Sales", onboarded: true }, mem_oth: { function: "Marketing", onboarded: true }, mem_fre: { function: "Sales", onboarded: true } },
    billing: { members: { mem_jor: trial, mem_oth: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
    integrations: {
      members: { mem_jor: { slack: { kind: "slack", url: "https://hooks.slack.com/services/T000/B000/madeup", addedAt: iso(-DAY) }, alerts: { roles: true, message: true, seat: true, radar: true }, lastSent: {}, pending: {} } },
      stats: { sent: {}, failed: 0, connects: 1, removes: 0 },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-activity",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_activity",
  STRIPE_WEBHOOK_SECRET: "whsec_test_activity",
  STRIPE_PRICE_MONTH: "price_month_activity",
  STRIPE_PRICE_YEAR: "price_year_activity",
  RESEND_API_KEY: "test-key-activity",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS"]) delete process.env[k];

type Mail = { to: string; subject: string; text: string; html: string };
const mails: Mail[] = [];
const slack: { text: string; blocks: unknown[] }[] = [];
let others = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  if (url.startsWith("https://hooks.slack.com/")) {
    slack.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response("ok", { status: 200 });
  }
  others++;
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

async function main() {
  const T = await import("../lib/table");
  const PS = await import("../lib/proposals/store");
  const DS = await import("../lib/documents/store");
  const C = await import("../lib/close/server");
  const A = await import("../lib/close/activity");
  const R = await import("../lib/close/rules");
  const RM = await import("../lib/close/reminders");
  const RN = await import("../lib/close/renewal");
  const CT = await import("../lib/close/types");
  const CP = await import("../lib/billing/compare");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const BASE = "https://post.example.com";
  const JOR = "tok-jor-act";
  const OTH = "tok-oth-act";
  const FRE = "tok-fre-act";
  const who = { ip: "203.0.113.9", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" };
  const LAPTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";
  const CEDAR = T.tableInternals.pubId("c_cedar");
  const settle = () => C.closeSettled();
  const lastTo = (to: string) => [...mails].reverse().find((m) => m.to === to);
  const signTok = (t: string) => t.match(/\/sign\/((?:s|ds)_[^\s"<]+)/)?.[1] ?? "";
  const cookieA = "A".repeat(22);
  const cookieB = "B".repeat(22);
  const beacon = (token: string, events: unknown, cookie: string | null, nowMs: number, o: { ua?: string; memberToken?: string | null } = {}) =>
    C.recordBeacon({ token, events, cookie, ua: o.ua ?? who.ua, memberToken: o.memberToken ?? null }, nowMs);
  const item = async (id: string) => (await T.loadState()).close?.items?.[id];

  await T.perform(JOR, { type: "unlock", entity: "company", id: CEDAR, field: "identity" } as never, BASE);

  /* ================= a proposal goes out ================= */
  const blocks = [
    { id: "s1", blockId: "custom", title: "Summary", body: "A plan for the next 90 days." },
    { id: "s2", blockId: "custom", title: "Your situation", body: "Pipeline is thin." },
    { id: "s3", blockId: "custom", title: "First 90 days", body: "- Hire two reps\n- Weekly pipeline review" },
    { id: "s4", blockId: "custom", title: "Pricing", body: "Operator: $12,000 a month. Build: $18,000 a month." },
    { id: "s5", blockId: "custom", title: "Terms", body: "Six months, then month to month." },
  ];
  let p = await PS.createProposal(JOR, { companyId: CEDAR, title: "Fractional VP Sales", blocks, fields: { "pricing.monthlyFee": "$12,000", "term.initialMonths": "6" } }, BASE);
  // The option and add-on the client's page names: the beacon counts only ids the proposal itself offers.
  p = await PS.updateProposal(JOR, p.id, { pricing: { options: [{ id: "operator", name: "Operator", price: 12000 }], addOns: [{ id: "hiring", name: "Sales hiring support", price: 3000 }] } }, BASE);
  const sent = await PS.sendProposal(JOR, p.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "COO" } }, BASE, t0);
  p = sent.proposal;
  const tok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  check("setup: the proposal went out, with a signing link", p.status === "sent" && !!PS.readSignToken(tok), p.status);

  /* ================= beacon validation ================= */
  console.log("\nbeacon validation");
  check("parse: not a list is refused", A.parseBeacon({ t: "open" }) === null && A.parseBeacon("open") === null);
  check("parse: more than 40 events is refused", A.parseBeacon(Array.from({ length: 41 }, () => ({ t: "open" }))) === null);
  const pb = A.parseBeacon([{ t: "open" }, { t: "sec", id: "b3", ms: 4000 }, { t: "sec", id: "<script>", ms: 10 }, { t: "sec", id: "b1", ms: -5 }, { t: "sec", id: "b1", ms: 999_999 }, { t: "zap" }, { t: "addon", id: "x", on: "yes" }, { t: "pick", id: "op", label: "  Operator‮  " }]);
  check("parse: bad ids, negative or huge times, unknown kinds left out and counted", pb?.events.length === 3 && pb.bad === 5 && (pb.events[2] as { label?: string }).label === "Operator", pb);
  check("a made-up token: 404", (await beacon("s_madeupmadeup.zz.0000000000000000000000000000000x", [{ t: "open" }], null, t0)).status === 404);
  check("a tampered token: 404", (await beacon(tok.slice(0, -2) + "xx", [{ t: "open" }], null, t0)).status === 404);
  check("a malformed body: 400", (await beacon(tok, "nope", null, t0)).status === 400);
  const route = await import("../app/api/sign/activity/route");
  const { NextRequest } = await import("next/server");
  const post = (body: unknown, cookie?: string, ip = "198.51.100.77") =>
    route.POST(new NextRequest(`${BASE}/api/sign/activity`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "text/plain", "x-forwarded-for": ip, "user-agent": who.ua, ...(cookie ? { cookie } : {}) } }));
  const r0 = await post("{not json");
  check("the route: not JSON is 400 in words", r0.status === 400 && /didn't go through/.test((await r0.json()).error));
  const r1 = await post({ token: "x", events: [] }, undefined, "198.51.100.78");
  check("the route: an unknown token is 404, nothing set", r1.status === 404 && !r1.headers.get("set-cookie"));
  const big = await post({ token: tok, events: [{ t: "open", pad: "x".repeat(9000) }] }, undefined, "198.51.100.79");
  check("the route: over 8 KB is 413", big.status === 413);
  // Rate limits: 60 a minute a link, 120 a minute from one address, 40 a minute from one reader cookie.
  const junk = "s_ratelimitxyz.zz.00000000000000000000000000000000";
  let st429 = 0;
  for (let i = 0; i < 61; i++) st429 = (await post({ token: junk, events: [{ t: "open" }] }, undefined, `192.0.2.${i}`)).status;
  check("rate limit: the 61st beacon on one link in a minute is 429", st429 === 429);
  let ip429 = 0;
  for (let i = 0; i < 121; i++) ip429 = (await post({ token: `s_iplimit${String(i).padStart(5, "0")}.zz.0`, events: [] }, undefined, "192.0.2.250")).status;
  check("rate limit: the 121st request from one address in a minute is 429", ip429 === 429);
  let dev429 = 0;
  for (let i = 0; i < 41; i++) dev429 = (await post({ token: `s_devlimit${String(i).padStart(4, "0")}.zz.0`, events: [] }, `rn_reader=${"Z".repeat(22)}`, `198.18.0.${i}`)).status;
  check("rate limit: the 41st from one reader cookie in a minute is 429", dev429 === 429);

  /* ================= readers ================= */
  console.log("\nreaders");
  const sentMs = t0;
  let now = sentMs + 2 * HOUR;
  const m0 = mails.length;
  const s0 = slack.length;
  const first = await post({ token: tok, events: [{ t: "open" }] }, undefined, "198.51.100.80");
  const setCookie = first.headers.get("set-cookie") ?? "";
  check("first open through the route: ok, a random reader cookie, HttpOnly, only for the beacon path", first.status === 200 && /rn_reader=[A-Za-z0-9_-]{22};/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Path=\/api\/sign\/activity/i.test(setCookie), setCookie);
  const routeCookie = setCookie.match(/rn_reader=([^;]+)/)?.[1] ?? "";
  await settle();
  let it = await item(p.id);
  check("one reader, the signer, on a phone", it?.readers.length === 1 && it.readers[0].signer && it.readers[0].device === "phone" && it.readers[0].visits === 1, it?.readers);
  check("the cookie's value is never stored: only its HMAC", !JSON.stringify(it).includes(routeCookie) && it!.readers[0].dev.length === 22);
  check("no IP address is kept", !JSON.stringify(it).includes("198.51.100.80"));
  const openMail = mails.slice(m0).find((m) => m.to === "jor.act@example.com");
  check("first open: an email to the member in the mockup's words", /^Dana Whitfield opened your proposal for Cedar and Pine Software$/.test(openMail?.subject ?? "") && /First open, on a phone/.test(openMail?.text ?? ""), openMail?.subject);
  const sp = slack.slice(s0)[0];
  check("first open: Slack, connected, with See activity", !!sp && /Dana Whitfield opened your proposal/.test(sp.text) && JSON.stringify(sp.blocks).includes("See activity"), sp);
  let inbox = await C.inboxView(JOR);
  check("first open: in Merlin, Opened by Dana Whitfield", inbox.items[0]?.head === "Opened" && inbox.items[0].text === "by Dana Whitfield" && inbox.unread === 1, inbox.items[0]);
  // The same browser again: the same reader. A reload is the same visit.
  await post({ token: tok, events: [{ t: "open" }] }, `rn_reader=${routeCookie}`, "198.51.100.80");
  it = await item(p.id);
  check("the same cookie: the same reader, the same visit", it?.readers.length === 1 && it.readers[0].visits === 1);
  const m1 = mails.length;
  await post({ token: tok, events: [{ t: "open" }] }, `rn_reader=${routeCookie}`, "203.0.113.200");
  await settle();
  it = await item(p.id);
  check("a different IP, the same cookie: still one reader (no IP counting), and no second open alert", it?.readers.length === 1 && mails.length === m1);
  // The sender reading their own link is never counted.
  const own = await beacon(tok, [{ t: "open" }], cookieB, now, { memberToken: JOR });
  it = await item(p.id);
  check("the member who sent it, signed in: not counted", own.body.off === true && it?.readers.length === 1);
  // A forwarded link in a new browser: a new reader.
  now = sentMs + 2 * DAY + 3 * HOUR;
  await beacon(tok, [{ t: "open" }], cookieB, now, { ua: LAPTOP });
  it = await item(p.id);
  check("a new browser: a second reader, not the signer, on a computer", it?.readers.length === 2 && !it.readers[1].signer && it.readers[1].device === "computer" && it.readers[1].id === "r2");
  check("readers up to 20, the rest dropped", await (async () => {
    const s = await T.loadState();
    const copy = structuredClone(s.close!.items[p.id]);
    for (let i = 0; i < 25; i++) A.applyBeacon(copy, { dev: `dev${i}`.padEnd(22, "x"), link: "s_x", device: null, label: () => "x" }, [{ t: "open" }], now);
    return copy.readers.length === 20 && copy.dropped >= 5;
  })());

  /* ================= time on sections ================= */
  console.log("\ntime on sections");
  const A0 = A.emptyActivity("proposal", "mem_jor");
  const labels = (k: string, id: string, lab?: string) => (k === "sec" ? ({ b3: "Pricing", b0: "Summary" } as Record<string, string>)[id] ?? lab ?? null : lab ?? id);
  const ctx = { dev: "d".repeat(22), link: "s_link", device: "phone" as const, label: labels };
  A.applyBeacon(A0, ctx, [{ t: "open" }, { t: "sec", id: "b3", ms: 60_000 }], 1_000_000);
  check("a first beacon can't carry more than the slack (5 seconds)", A0.sections.b3.ms === 5000 && A0.sections.b3.label === "Pricing", A0.sections.b3);
  A.applyBeacon(A0, ctx, [{ t: "sec", id: "b3", ms: 15_000 }, { t: "sec", id: "b0", ms: 5_000 }], 1_020_000);
  check("then the time since the last beacon, shared out", A0.sections.b3.ms === 20_000 && A0.sections.b0.ms === 5_000);
  A.applyBeacon(A0, ctx, [{ t: "sec", id: "b3", ms: 60_000 }, { t: "sec", id: "b0", ms: 60_000 }], 1_030_000);
  check("two sections can't both take the whole time: scaled to what passed", A0.sections.b3.ms === 27_500 && A0.sections.b0.ms === 12_500, [A0.sections.b3.ms, A0.sections.b0.ms]);
  check("aggregated per reader", A0.sections.b3.by.r1 === 27_500 && A0.readers[0].ms === 40_000);
  check("a section read 10 seconds counts as seen in that visit, once", A0.sections.b3.visits === 1 && A0.sections.b0.visits === 1);
  A.applyBeacon(A0, ctx, [{ t: "sec", id: "zz", ms: 1000 }], 1_031_000);
  check("an id the document doesn't know, with no label: refused", !A0.sections.zz && A0.dropped === 1);
  A.applyBeacon(A0, ctx, [{ t: "open" }, { t: "sec", id: "b3", ms: 3000 }], 1_031_000 + 31 * MIN);
  check("31 minutes later: a new visit", A0.readers[0].visits === 2 && A0.visits.length === 2 && A0.visits[1].n === 2);
  const capped = A.emptyActivity("proposal", "m");
  let tt = 0;
  for (let i = 0; i < 40; i++) A.applyBeacon(capped, ctx, [{ t: "sec", id: "b3", ms: 60_000 }], (tt += 60_000));
  check("one reader's time on a section is capped at 30 minutes", capped.sections.b3.by.r1 === 30 * MIN, capped.sections.b3.by.r1);
  A.applyBeacon(A0, ctx, [{ t: "opt", id: "operator", label: "Operator", ms: 20_000 }, { t: "pick", id: "operator", label: "Operator" }, { t: "pick", id: "build", label: "Build" }, { t: "addon", id: "hiring", label: "Sales hiring support", on: true }], 1_031_000 + 31 * MIN + 30_000);
  check("options: time, picks; add-ons on", A0.options.operator.ms === 20_000 && A0.options.operator.picks === 1 && A0.options.build.picks === 1 && A.addonsOn(A0).join() === "Sales hiring support");
  check("raw events kept, bounded", A0.raw.length > 0 && A0.raw.length <= CT.CAPS.raw);
  check("words: 20 sec, 1.5 min, 5 min", A.minWords(20_000) === "20 sec" && A.minWords(90_000) === "1.5 min" && A.minWords(300_000) === "5 min" && A.minShort(90_000) === "1.5m");
  // Through the server, with the document's own titles.
  now = sentMs + 2 * DAY + 3 * HOUR + 20_000;
  await beacon(tok, [{ t: "sec", id: "b3", ms: 20_000 }, { t: "sec", id: "made-up", ms: 1000 }, { t: "sec", id: "pricing", ms: 1000 }], cookieB, now, { ua: LAPTOP });
  it = await item(p.id);
  check("the server names b3 from the frozen document: Pricing; by its title's slug too; an unknown id refused", it?.sections.b3?.label === "Pricing" && it.sections.pricing?.label === "Pricing" && !it.sections["made-up"] && it.dropped >= 1, it?.sections);

  /* ================= the follow-up rules ================= */
  console.log("\nthe follow-up rules");
  const base = { status: "viewed" as const, sentAt: iso(0), signer: "Dana Whitfield", company: "Cedar and Pine Software", reminderComing: false, nowMs: t0 + 3 * DAY };
  const act = (fn: (a: ReturnType<typeof A.emptyActivity>) => void) => {
    const a = A.emptyActivity("proposal", "m");
    fn(a);
    return a;
  };
  const read = (a: ReturnType<typeof A.emptyActivity>, dev: string, at: number, secs: [string, number][], extra: unknown[] = []) => {
    A.applyBeacon(a, { dev: dev.padEnd(22, "x"), link: "s_l", device: "computer", label: (k, id, l) => (k === "sec" ? ({ b3: "Pricing", b0: "Summary" } as Record<string, string>)[id] ?? null : l ?? id) }, [{ t: "open" }], at);
    let tm = at;
    for (const [id, ms] of secs) A.applyBeacon(a, { dev: dev.padEnd(22, "x"), link: "s_l", device: "computer", label: (k, i2, l) => (k === "sec" ? ({ b3: "Pricing", b0: "Summary" } as Record<string, string>)[i2] ?? null : l ?? i2) }, [{ t: "sec", id, ms }, ...(extra as never[])], (tm += ms));
  };
  check("nothing read, sent today: wait", R.suggest({ ...base, a: null, status: "sent", nowMs: t0 + HOUR })?.key === "wait");
  check("not opened in 2 days with the reminder coming: no need yet", R.suggest({ ...base, a: null, status: "sent", reminderComing: true, nowMs: t0 + 2 * DAY + HOUR })?.key === "not_opened" && R.suggest({ ...base, a: null, status: "sent", reminderComing: true, nowMs: t0 + 2 * DAY + HOUR })?.draft === null);
  check("not opened, reminders off: follow up, maybe spam", /spam/.test(R.suggest({ ...base, a: null, status: "sent", nowMs: t0 + 3 * DAY })?.why ?? ""));
  const twice = act((a) => {
    read(a, "one", t0 + DAY, [["b3", 20_000]]);
    read(a, "one", t0 + 2 * DAY, [["b3", 60_000], ["b3", 60_000], ["b3", 60_000], ["b3", 60_000]]);
  });
  const sp1 = R.suggest({ ...base, a: twice, nowMs: t0 + 2 * DAY + 2 * HOUR });
  check("read the pricing twice: follow up tomorrow morning, engaged, with a draft and why", sp1?.key === "pricing" && sp1.when === "Follow up tomorrow morning" && sp1.engaged && !!sp1.draft && /^Hi Dana,/.test(sp1.draft!) && /budget/.test(sp1.why) && /Second visit .*4 minutes on Pricing/.test(sp1.points[0]), sp1);
  const both = act((a) => {
    read(a, "one", t0 + DAY, [["b3", 20_000]]);
    read(a, "one", t0 + 2 * DAY, [["b3", 30_000]]);
    A.applyBeacon(a, { dev: "one".padEnd(22, "x"), link: "s_l", device: null, label: (_k, id, l) => l ?? id }, [{ t: "opt", id: "op", label: "Operator", ms: 20_000 }, { t: "pick", id: "op", label: "Operator" }, { t: "pick", id: "bd", label: "Build" }, { t: "pick", id: "op", label: "Operator" }, { t: "addon", id: "h", label: "Sales hiring support", on: true }], t0 + 2 * DAY + 50_000);
  });
  const sp2 = R.suggest({ ...base, a: both, nowMs: t0 + 2 * DAY + HOUR });
  check("two options looked at: they're deciding between them, weighing scope", sp2?.key === "options" && sp2.headline === "They're deciding between Operator and Build" && sp2.why === "They're weighing scope, not saying no." && /added Sales hiring support/.test(sp2.points[1]), sp2);
  const newR = act((a) => {
    read(a, "one", t0 + DAY, [["b0", 5_000]]);
    read(a, "two", t0 + 2 * DAY, [["b0", 5_000]]);
  });
  const sp3 = R.suggest({ ...base, a: newR, nowMs: t0 + 2 * DAY + HOUR });
  check("a new reader: follow up today, someone new is reading it", sp3?.key === "new_reader" && sp3.when === "Follow up today" && /may have shared it/.test(sp3.why) && !sp3.engaged, sp3);
  const quiet = act((a) => read(a, "one", t0, [["b0", 5_000]]));
  check("opened, then nothing for 5 days: gone quiet", R.suggest({ ...base, a: quiet, nowMs: t0 + 6 * DAY })?.key === "quiet");
  check("opened 3 days ago, not signed: follow up today", R.suggest({ ...base, a: quiet, nowMs: t0 + 3 * DAY + HOUR })?.key === "opened_not_signed");
  check("signed: no suggestion; declined: ask what would work; expired: send again", R.suggest({ ...base, a: quiet, status: "signed" }) === null && R.suggest({ ...base, a: quiet, status: "declined" })?.key === "declined" && R.suggest({ ...base, a: quiet, status: "expired" })?.key === "expired");
  check("the words: plain, no exclamation marks", [sp1, sp2, sp3].every((s) => !/!/.test(JSON.stringify(s))));

  /* ================= alerts and batching ================= */
  console.log("\nalerts and batching");
  // The second reader's first visit settles: one alert, saying what they read.
  const m2 = mails.length;
  const sl2 = slack.length;
  await C.closeTick(BASE, now + 5 * MIN);
  await settle();
  check("a new reader is told once their visit settles, not before", mails.length === m2 && slack.length === sl2);
  await C.closeTick(BASE, now + 11 * MIN);
  await settle();
  const rd = slack.slice(sl2).find((x) => /Someone new opened it/.test(x.text));
  check("someone new opened it: a second person at Cedar read Pricing on a computer", !!rd && /A second person at Cedar read Pricing on a computer\. Dana may have shared it\./.test(JSON.stringify(rd.blocks)), rd?.blocks);
  inbox = await C.inboxView(JOR);
  check("in Merlin: New reader: a second person at Cedar", inbox.items[0]?.head === "New reader:" && inbox.items[0].text === "a second person at Cedar", inbox.items[0]);
  const told = slack.length;
  await C.closeTick(BASE, now + 20 * MIN);
  await settle();
  check("the new reader isn't told twice", !slack.slice(told).some((x) => /Someone new/.test(x.text)));
  // Dana comes back to the pricing: engaged.
  const danaDev = (ms: number, ev: unknown[]) => beacon(tok, ev, routeCookie, ms);
  let tm = sentMs + 3 * DAY;
  await danaDev(tm, [{ t: "open" }]);
  for (let i = 0; i < 3; i++) await danaDev((tm += 50_000), [{ t: "sec", id: "b3", ms: 50_000 }]);
  await settle();
  const e1 = slack.find((x) => /is back on pricing/.test(x.text));
  check("engaged: Dana is back on pricing, with the follow-up and Draft the follow-up", !!e1 && /Dana is back on pricing/.test(e1.text) && JSON.stringify(e1.blocks).includes("Draft the follow-up") && /Follow up tomorrow morning/.test(JSON.stringify(e1.blocks)), e1);
  const e1mail = mails.find((m) => /^Dana is back on pricing: follow up tomorrow$/.test(m.subject));
  check("engaged by email: the subject, what they looked at, the suggested follow-up, Open in Merlin", !!e1mail && /Suggested follow-up/.test(e1mail.text) && /Open in Merlin/.test(e1mail.text) && /\/api\/go\?m=/.test(e1mail.text), e1mail?.subject);
  inbox = await C.inboxView(JOR);
  check("engaged in Merlin: Back on pricing: follow up tomorrow", inbox.items.some((x) => x.head === "Back on pricing:" && x.text === "follow up tomorrow"));
  const engagedCount = () => slack.filter((x) => /is back on pricing|gone quiet|hasn't signed/.test(x.text)).length;
  const ec = engagedCount();
  // A new visit within 6 hours: waits.
  tm = sentMs + 3 * DAY + 2 * HOUR;
  await danaDev(tm, [{ t: "open" }]);
  for (let i = 0; i < 2; i++) await danaDev((tm += 50_000), [{ t: "sec", id: "b3", ms: 50_000 }]);
  await settle();
  it = await item(p.id);
  check("another engaged moment inside 6 hours: no second alert, it waits", engagedCount() === ec && it?.alerts.engagedWaiting === true);
  await C.closeTick(BASE, sentMs + 3 * DAY + 5 * HOUR);
  await settle();
  check("still inside the 6 hours on the tick: nothing", engagedCount() === ec);
  await C.closeTick(BASE, sentMs + 3 * DAY + 6 * HOUR + MIN);
  await settle();
  check("the window opens: the waiting one goes out, once", engagedCount() === ec + 1);
  await C.closeTick(BASE, sentMs + 3 * DAY + 13 * HOUR);
  await settle();
  check("with no new visit, not again", engagedCount() === ec + 1);
  // Channel switches.
  const pr = await C.setPref(JOR, "engaged", "email", false);
  check("switches: engaged email off, the rest stay on", pr.engaged.email === false && pr.engaged.app && pr.engaged.slack && pr.open.email);
  check("a bad switch is refused", (await refused(C.setPref(JOR, "engaged", "fax", true)))?.includes("didn't come through"));
  const mEng = mails.filter((m) => /back on pricing/.test(m.subject)).length;
  tm = sentMs + 4 * DAY;
  await danaDev(tm, [{ t: "open" }]);
  for (let i = 0; i < 2; i++) await danaDev((tm += 50_000), [{ t: "sec", id: "b3", ms: 50_000 }]);
  await settle();
  check("engaged with email off: Slack and Merlin, no email", engagedCount() === ec + 2 && mails.filter((m) => /back on pricing/.test(m.subject)).length === mEng);
  check("defaults: on for Merlin and email; Slack on, sent only when connected", (() => {
    const d = C.prefsOf(undefined);
    return CT.CLOSE_ALERT_KINDS.every((k) => d[k].app && d[k].slack && (d[k].email || k === "question"));
  })());
  const oth = await C.inboxView(OTH);
  check("a member with no Slack connected: slack false in the view", oth.slack === false && (await C.inboxView(JOR)).slack === true);
  await C.markRead(JOR);
  check("read: nothing unread", (await C.inboxView(JOR)).unread === 0);

  /* ================= the activity view ================= */
  console.log("\nthe activity view");
  const v = await C.activityView(JOR, p.id, BASE, sentMs + 4 * DAY + HOUR);
  check("status words, readers, opens by the signer, reading time", v.open && v.statusWords === "Viewed · not signed" && v.stats.readers === 2 && v.stats.opens === 4 && v.stats.ms > 5 * MIN, v.stats);
  check("sections in the document's order, read or not, Pricing on top", v.sections.map((x) => x.label).join("|") === "Summary|Your situation|First 90 days|Pricing|Terms" && v.sections.find((x) => x.top)?.label === "Pricing", v.sections);
  check("the timeline: you sent it, Dana opened it on a phone, someone new on a computer, visits", v.timeline.some((x) => x.text === "You sent it") && v.timeline.some((x) => x.text === "Dana opened it, on a phone") && v.timeline.some((x) => x.text === "Someone new opened it, on a computer") && v.timeline.some((x) => x.strong === "Dana" && /third visit/.test(x.text)), v.timeline);
  check("the suggestion, with a Gmail compose link to the signer", !!v.suggestion && /^https:\/\/mail\.google\.com\/mail\/\?view=cm/.test(v.gmail ?? "") && (v.gmail ?? "").includes("dana%40cedarandpine.example"), v.gmail);
  check("the disclosure is the client's words", v.disclosure === CT.DISCLOSURE && /sees when this is opened and which sections are read/.test(CT.disclosureText("Jordan Avery")) && /never your IP address/.test(CT.DISCLOSURE));
  check("another member can't see it", (await refused(C.activityView(OTH, p.id, BASE)))?.includes("isn't there anymore"));

  /* ================= reminders ================= */
  console.log("\nreminders");
  let q = await PS.createProposal(JOR, { companyId: CEDAR, title: "Advisory retainer", blocks, fields: { "pricing.monthlyFee": "$6,000" } }, BASE);
  q = (await PS.sendProposal(JOR, q.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "COO" } }, BASE, t0)).proposal;
  const qtok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  let rv = await C.activityView(JOR, q.id, BASE, t0 + HOUR);
  check("three reminders listed, on, planned on day 2, day 7 and 2 days before the link closes", rv.reminders.map((r) => `${r.key}:${r.state}`).join() === "d2:planned,d7:planned,expiry:planned" && Date.parse(rv.reminders[0].at) === t0 + 2 * DAY && Date.parse(rv.reminders[1].at) === t0 + 7 * DAY && Date.parse(rv.reminders[2].at) === Date.parse(q.send!.expiresAt) - 2 * DAY, rv.reminders);
  check("their words, as in the mockup", rv.reminders[0].label === "Day 2, not opened" && rv.reminders[2].label === "2 days before the link closes");
  let mr = mails.length;
  await C.closeTick(BASE, t0 + DAY);
  check("day 1: nothing yet", !mails.slice(mr).some((m) => /^Reminder/.test(m.subject)));
  await C.closeTick(BASE, t0 + 2 * DAY + 10 * MIN);
  await settle();
  const r2 = mails.slice(mr).find((m) => /^Reminder/.test(m.subject));
  check("day 2, not opened: the proposal's own email, as a reminder, to the signer, with the same link", r2?.to === "dana@cedarandpine.example" && /^Reminder: Jordan Avery sent you a proposal to sign$/.test(r2.subject) && r2.text.includes(qtok) && /Making sure this reached you/.test(r2.text), r2?.subject);
  check("the member sees it in Merlin: Reminder sent to Dana", (await C.inboxView(JOR)).items.some((x) => x.head === "Reminder sent" && x.text === "to Dana: not opened in 2 days" && x.sub === "automatic"));
  mr = mails.length;
  await C.closeTick(BASE, t0 + 2 * DAY + 20 * MIN);
  check("not twice", !mails.slice(mr).some((m) => /^Reminder/.test(m.subject)));
  rv = await C.activityView(JOR, q.id, BASE, t0 + 2 * DAY + HOUR);
  check("listed as sent", rv.reminders[0].state === "sent");
  rv = await C.setReminders(JOR, q.id, { expiry: false }, BASE, t0 + 3 * DAY);
  check("the member turns one off for this proposal", rv.reminders.find((r) => r.key === "expiry")?.state === "off" && rv.reminders.find((r) => r.key === "expiry")?.on === false);
  await beacon(qtok, [{ t: "open" }], "C".repeat(22), t0 + 3 * DAY);
  mr = mails.length;
  await C.closeTick(BASE, t0 + 7 * DAY + MIN);
  await settle();
  const r7 = mails.slice(mr).find((m) => /^Reminder/.test(m.subject));
  check("day 7, opened but not signed: the reminder", !!r7 && /Following up on this/.test(r7.text));
  rv = await C.activityView(JOR, q.id, BASE, t0 + 7 * DAY + HOUR);
  check("labelled: Day 7, opened but not signed", rv.reminders.find((r) => r.key === "d7")?.label === "Day 7, opened but not signed");
  mr = mails.length;
  await C.closeTick(BASE, Date.parse(q.send!.expiresAt) - 2 * DAY + MIN);
  check("the one turned off doesn't go", !mails.slice(mr).some((m) => /^Reminder/.test(m.subject)));
  // Stop on sign, decline, withdraw: the schedule.
  const L = (done: RM.LinkInfo["done"], viewedAt: string | null = null): RM.LinkInfo => ({ link: "s_1", name: "Dana Whitfield", email: "d@x.example", base: iso(0), viewedAt, expiresAt: iso(30 * DAY), done });
  check("signed, declined, withdrawn or expired: every planned reminder stops", (["signed", "declined", "void", "expired"] as const).every((d) => RM.reminderRows([L(d)], null, t0 + DAY).every((r) => r.state === "stopped") && RM.dueReminders([L(d)], null, t0 + 8 * DAY).length === 0));
  check("opened before day 2: the day 2 one is skipped", RM.reminderRows([L(null, iso(HOUR))], null, t0 + 3 * DAY)[0].state === "skipped" && RM.dueReminders([L(null, iso(HOUR))], null, t0 + 2 * DAY + MIN).length === 0);
  check("more than 2 days late (the server was down): dropped, not sent out of turn", RM.dueReminders([L(null)], null, t0 + 4 * DAY + MIN).every((r) => r.key !== "d2"));
  check("a short link: no day 7 when the warning comes first", RM.reminderRows([{ ...L(null), expiresAt: iso(8 * DAY) }], null, t0).map((r) => r.key).join() === "d2,expiry");
  // A real sign stops them.
  let w = await PS.createProposal(JOR, { companyId: CEDAR, title: "Pipeline sprint", blocks, fields: {} }, BASE);
  w = (await PS.sendProposal(JOR, w.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example" } }, BASE, t0)).proposal;
  const wtok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  await PS.requestCode(wtok, who, t0 + DAY);
  await PS.verifyCode(wtok, lastTo("dana@cedarandpine.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "", who, BASE, t0 + DAY);
  await PS.declineProposal(wtok, { reason: "Not this quarter" }, who, BASE, t0 + DAY);
  await C.afterSignerStep(wtok, BASE, t0 + DAY);
  await settle();
  mr = mails.length;
  await C.closeTick(BASE, t0 + 2 * DAY + MIN);
  check("declined: no reminder after", !mails.slice(mr).some((m) => /^Reminder/.test(m.subject) && m.text.includes(wtok)));
  check("declined: told in Slack and Merlin, not emailed twice", slack.some((x) => x.text.startsWith("Declined")) && (await C.inboxView(JOR)).items.some((x) => x.head === "Declined:"));
  let vq = await PS.createProposal(JOR, { companyId: CEDAR, title: "Board pack", blocks, fields: {} }, BASE);
  vq = (await PS.sendProposal(JOR, vq.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example" } }, BASE, t0)).proposal;
  const vtok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  await PS.voidProposal(JOR, vq.id, BASE, t0 + HOUR);
  mr = mails.length;
  await C.closeTick(BASE, t0 + 2 * DAY + MIN);
  check("withdrawn: no reminder after", !mails.slice(mr).some((m) => m.text.includes(vtok)));
  check("withdrawn: the beacon is off, nothing kept", (await beacon(vtok, [{ t: "open" }], cookieA, t0 + 2 * HOUR)).body.off === true && !(await item(vq.id))?.readers.length);

  /* ================= signed: the pipeline at Won ================= */
  console.log("\nsigned");
  await danaDev(sentMs + 5 * DAY - HOUR, [{ t: "open" }, { t: "pick", id: "operator", label: "Operator" }, { t: "addon", id: "hiring", label: "Sales hiring support", on: true }]);
  await PS.requestCode(tok, who, sentMs + 5 * DAY);
  const code = lastTo("dana@cedarandpine.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  const sv = await PS.verifyCode(tok, code, who, BASE, sentMs + 5 * DAY);
  const sl3 = slack.length;
  await PS.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: sv.hash }, who, BASE, sentMs + 5 * DAY);
  await C.afterSignerStep(tok, BASE, sentMs + 5 * DAY);
  await settle();
  const sg = slack.slice(sl3).find((x) => x.text.startsWith("Signed"));
  check("signed: Slack says what they signed and that it moved to Won, with the signed copy", !!sg && /Cedar and Pine Software signed Operator, \$12,000 a month, plus Sales hiring support\. Moved to Won\./.test(JSON.stringify(sg.blocks)) && JSON.stringify(sg.blocks).includes("Open the signed copy"), sg?.blocks);
  check("signed in Merlin: Signed: Cedar and Pine Software, Operator · moved to Won", (await C.inboxView(JOR)).items.some((x) => x.head === "Signed:" && x.text === "Cedar and Pine Software, Operator" && x.sub === "moved to Won"));
  check("the pipeline is at Won", ((await T.loadState()).pipeline?.mem_jor?.entries ?? []).some((e) => e.companyId === "c_cedar" && e.stage === "won"));
  const sl4 = slack.length;
  await C.afterSignerStep(tok, BASE, sentMs + 5 * DAY + MIN);
  await settle();
  check("signed is told once", slack.length === sl4);
  check("after signing, beacons are off", (await beacon(tok, [{ t: "open" }], routeCookie, sentMs + 5 * DAY + 2 * MIN)).body.off === true);

  /* ================= renewal ================= */
  console.log("\nrenewal");
  check("the end from the terms: 6 months from signing, or an end date, or a start plus months", RN.termEndOf({ "term.initialMonths": "6" }, "2026-01-31T10:00:00Z") === "2026-07-31" && RN.termEndOf({ "term.endDate": "June 30, 2027" }, iso(0)) === "2027-06-30" && RN.termEndOf({ "term.startDate": "2027-01-01", "term.initialMonths": "12" }, iso(0)) === "2028-01-01" && RN.termEndOf({}, iso(0)) === null);
  check("months keep the day where they can (Jan 31 + 1 is Feb 28)", RN.addMonths("2027-01-31", 1) === "2027-02-28");
  check("due 30 days before, not 31", RN.renewalDue("2027-06-30", Date.parse("2027-05-31T12:00:00Z")) && !RN.renewalDue("2027-06-30", Date.parse("2027-05-30T00:00:00Z")));
  const rf = RN.renewalFields({ "term.startDate": "January 1, 2027", "term.endDate": "June 30, 2027", "term.initialMonths": "6", "pricing.monthlyFee": "$12,000" }, "2027-06-30", Date.parse("2027-06-01T00:00:00Z"));
  check("the renewal's fields: the dates moved on by one term, the rest kept", rf["term.startDate"] === "July 1, 2027" && rf["term.endDate"] === "January 1, 2028" && rf["proposal.date"] === "June 1, 2027" && rf["pricing.monthlyFee"] === "$12,000", rf);
  let sview = await C.activityView(JOR, p.id, BASE, sentMs + 5 * DAY + HOUR);
  const end = sview.renewal?.end ?? "";
  check("a signed proposal with 6 months: its end known, not asked", !!end && sview.renewal?.ask === false && end === RN.addMonths(new Date(sentMs + 5 * DAY).toISOString().slice(0, 10), 6), sview.renewal);
  // The trial runs 16 days from now in this test: put the end inside it, as the member would when it's known.
  const soon = new Date(t0 + 40 * DAY).toISOString().slice(0, 10);
  sview = await C.setRenewal(JOR, p.id, { end: soon }, BASE, sentMs + 5 * DAY + HOUR);
  check("the member can set the end", sview.renewal?.end === soon);
  check("a date that isn't one is refused in words", (await refused(C.setRenewal(JOR, p.id, { end: "soonish" }, BASE)))?.includes("Type the date"));
  const endMs = Date.parse(`${soon}T00:00:00Z`);
  const ren0 = slack.length;
  await C.closeTick(BASE, endMs - 31 * DAY - HOUR);
  await settle();
  check("31 days before: no renewal reminder", !slack.slice(ren0).some((x) => /engagement ends/.test(x.text)));
  const mRen = mails.length;
  await C.closeTick(BASE, endMs - 30 * DAY + HOUR);
  await settle();
  const rs = slack.slice(ren0).find((x) => /engagement ends in/.test(x.text));
  check("30 days before: Your Cedar engagement ends in 30 days, with Start the renewal", !!rs && /Your Cedar engagement ends in 30 days/.test(rs.text) && JSON.stringify(rs.blocks).includes("Start the renewal") && /You're on Operator at \$12,000 a month/.test(JSON.stringify(rs.blocks)), rs?.text);
  check("by email too, with Start the renewal", mails.slice(mRen).some((m) => /Your Cedar engagement ends in 30 days/.test(m.subject) && /Start the renewal/.test(m.text)));
  const hv = await C.inboxView(JOR, endMs - 30 * DAY + HOUR);
  check("on Home: the renewal card's facts", hv.renewals.length === 1 && hv.renewals[0].days === 30 && hv.renewals[0].terms === "You're on Operator at $12,000 a month.", hv.renewals);
  const ren1 = slack.length;
  await C.closeTick(BASE, endMs - 29 * DAY);
  await settle();
  check("the renewal reminder goes once", !slack.slice(ren1).some((x) => /engagement ends/.test(x.text)));
  const draft = await C.startRenewal(JOR, p.id, BASE, t0 + 11 * DAY);
  check("Start the renewal: a new draft, the same proposal, titled (renewal), sendable", draft.status === "draft" && draft.title === "Fractional VP Sales (renewal)" && draft.blocks.length === 5 && draft.version === 1 && draft.id !== p.id && draft.fields["pricing.monthlyFee"] === "$12,000", draft);
  check("its date is today's", draft.fields["proposal.date"] === new Date(t0 + 11 * DAY).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }));
  check("pressed again: the same draft, not another", (await C.startRenewal(JOR, p.id, BASE, t0 + 11 * DAY)).id === draft.id);
  check("once started, Home's card goes", (await C.inboxView(JOR, t0 + 11 * DAY)).renewals.length === 0);
  // Unknown end: asked once.
  const u = await PS.createProposal(JOR, { companyId: CEDAR, title: "Unknown term", blocks, fields: { "term.initialMonths": "" } }, BASE);
  await PS.sendProposal(JOR, u.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example" } }, BASE, t0);
  const utok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  await PS.requestCode(utok, who, t0 + HOUR);
  const ucode = lastTo("dana@cedarandpine.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  const uv = await PS.verifyCode(utok, ucode, who, BASE, t0 + HOUR);
  await PS.signProposal(utok, { name: "Dana Whitfield", consent: true, hash: uv.hash }, who, BASE, t0 + HOUR);
  let uview = await C.activityView(JOR, u.id, BASE, t0 + 2 * HOUR);
  check("no term in the proposal: Merlin asks for the end", uview.renewal?.ask === true && uview.renewal.end === null, [uview.status, uview.renewal]);
  uview = await C.setRenewal(JOR, u.id, { skip: true }, BASE, t0 + 2 * HOUR);
  check("Not sure: asked once, not again", uview.renewal?.ask === false);
  check("a draft has no renewal", (await refused(C.setRenewal(JOR, draft.id, { end: soon }, BASE)))?.includes("Only a signed proposal"));

  /* ================= documents linked to a company ================= */
  console.log("\ndocuments");
  const src = await PDFDocument.create();
  const font = await src.embedFont(StandardFonts.Helvetica);
  src.addPage([612, 792]).drawText("Consulting agreement, Cedar and Pine Software", { x: 54, y: 730, size: 14, font });
  src.addPage([612, 792]).drawText("Schedule A", { x: 54, y: 730, size: 14, font });
  let d = await DS.uploadDocument(JOR, "Cedar agreement.pdf", await src.save(), BASE);
  d = await DS.updateDocument(JOR, d.id, { companyId: CEDAR, signers: [{ id: "new_dana", name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "COO" }], fields: [{ id: "sig1", page: 1, x: 0.1, y: 0.7, w: 0.3, h: 0.05, kind: "signature", signer: "new_dana" }] }, BASE);
  // Out of the pipeline first, so the document's own signing is what moves it.
  await T.tableInternals.mutate((s) => {
    for (const e of s.pipeline?.mem_jor?.entries ?? []) if (e.companyId === "c_cedar") e.stage = "proposal";
  });
  await DS.sendDocument(JOR, d.id, {}, BASE, t0);
  const dtok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  await beacon(dtok, [{ t: "open" }], "D".repeat(22), t0 + HOUR, { ua: LAPTOP });
  await beacon(dtok, [{ t: "sec", id: "p1", ms: 20_000 }, { t: "sec", id: "p9", ms: 1000 }, { t: "opt", id: "x", ms: 1000, label: "X" }], "D".repeat(22), t0 + HOUR + 20_000, { ua: LAPTOP });
  const di = await item(d.id);
  check("a document: its pages are the sections (Page 2), a page it doesn't have and options refused", di?.sections.p1?.label === "Page 2" && !di.sections.p9 && !Object.keys(di.options).length && di.readers[0].signer, di?.sections);
  const dv = await C.activityView(JOR, d.id, BASE, t0 + 2 * HOUR);
  check("the document's activity view: pages, the signer, reminders", dv.kind === "document" && dv.sections.some((x) => x.label === "Page 2" && x.top) && dv.signer?.name === "Dana Whitfield" && dv.reminders.length === 3, dv);
  await DS.docRequestCode(dtok, who, t0 + 2 * HOUR);
  const dcode = lastTo("dana@cedarandpine.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  const dsv = await DS.docVerifyCode(dtok, dcode, who, BASE, t0 + 2 * HOUR);
  const sl5 = slack.length;
  await DS.docSign(dtok, { name: "Dana Whitfield", method: "typed", consent: true, hash: dsv.sha256, values: {} }, who, BASE, t0 + 2 * HOUR);
  await C.afterSignerStep(dtok, BASE, t0 + 2 * HOUR);
  await settle();
  check("a document linked to a company: signing moves the pipeline to Won", ((await T.loadState()).pipeline?.mem_jor?.entries ?? []).some((e) => e.companyId === "c_cedar" && e.stage === "won"));
  const dsg = slack.slice(sl5).find((x) => x.text.startsWith("Signed"));
  check("and it's told: signed, moved to Won, Open the signed PDF", !!dsg && /Moved to Won/.test(JSON.stringify(dsg.blocks)) && JSON.stringify(dsg.blocks).includes("Open the signed PDF"), dsg?.blocks);

  /* ================= the Close gate ================= */
  console.log("\nthe Close gate");
  const fp = await T.tableInternals.mutate((s) => {
    // A proposal Fred sent in his trial, still out now that it's over.
    const src2 = s.proposals!.find((x) => x.id === q.id)!;
    const copy = structuredClone(src2);
    copy.id = "pr_fredsproposal1";
    copy.memberId = "mem_fre";
    copy.sends = copy.sends.map((x) => ({ ...x, id: "s_fredsendxyz1", signed: undefined, declined: undefined, voided: undefined }));
    s.proposals!.push(copy);
    return copy;
  });
  const ftok = PS.signToken("s_fredsendxyz1", Date.parse(fp.sends[0].expiresAt));
  const fb = await beacon(ftok, [{ t: "open" }], cookieA, t0 + HOUR);
  check("off Close (the trial over): the beacon keeps nothing", fb.body.off === true && !(await item("pr_fredsproposal1")));
  const fv = await C.activityView(FRE, "pr_fredsproposal1", BASE);
  check("off Close: the activity view is the upgrade prompt only", fv.open === false && /p=billing/.test(fv.upgrade ?? "") && fv.timeline.length === 0 && fv.suggestion === null);
  check("off Close: reminders and renewal can't be changed, 403", (await C.setReminders(FRE, "pr_fredsproposal1", { d2: false }, BASE).then(() => 0, (e: { status: number }) => e.status)) === 403);
  const mf = mails.length;
  await C.closeTick(BASE, t0 + 2 * DAY + 5 * MIN);
  check("off Close: no reminders go out for it", !mails.slice(mf).some((m) => m.text.includes(ftok)));
  check("off Close: notifications empty", (await C.inboxView(FRE)).open === false && (await C.inboxView(FRE)).items.length === 0);

  /* ================= privacy ================= */
  console.log("\nprivacy");
  const ex = await T.exportState();
  check("the admin export leaves the activity out", !("close" in ex) && !JSON.stringify(ex).includes("Back on pricing"));
  check("the client page says so: the disclosure names the sender", /^Jordan Avery sees when this is opened and which sections are read\./.test(CT.disclosureText("Jordan Avery")));
  const { readFileSync } = await import("node:fs");
  const flows = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../docs/data-flows.md"), "utf8");
  check("docs/data-flows.md says what is collected from readers and why", /READER_COOKIE|rn_reader/.test(flows) && /lib\/close/.test(flows) && flows.includes(CT.disclosureText().split(".")[0].replace("The sender", "")));
  const dataPage = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../app/data/DataFlows.tsx"), "utf8");
  check("the /data page says it too", /proposal readers|Proposal readers/i.test(dataPage) && /DISCLOSURE_LONG|disclosureText/.test(dataPage));

  /* ================= a link with no end date (closeC3) ================= */
  console.log("\na link with no end date");
  check("linkEnd: null, missing or not a date is no end; linkExpired never for those", CT.linkEnd(null) === null && CT.linkEnd(undefined) === null && CT.linkEnd("") === null && !CT.linkExpired(null, t0 + 999 * DAY) && CT.linkExpired(iso(DAY), t0 + 2 * DAY));
  const open0: RM.LinkInfo = { link: "s_noend", name: "Dana Whitfield", email: "d@x.example", base: iso(0), viewedAt: null, expiresAt: null, done: null };
  check("no end date: no 'before the link closes' reminder, listed or due; day 2 and day 7 stay", RM.reminderRows([open0], null, t0).map((r) => r.key).join() === "d2,d7" && RM.dueReminders([open0], null, t0 + 400 * DAY).length === 0 && RM.dueReminders([open0], null, t0 + 7 * DAY + MIN).map((r) => r.key).join() === "d7");
  let ne = await PS.createProposal(JOR, { companyId: CEDAR, title: "Open-ended advisory", blocks, fields: {} }, BASE);
  ne = (await PS.sendProposal(JOR, ne.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example" } }, BASE, t0)).proposal;
  const neSend = ne.send!.id;
  await T.tableInternals.mutate((s) => {
    const x = s.proposals!.find((y) => y.id === ne.id)!.sends.find((y) => y.id === neSend)!;
    (x as { expiresAt: string | null }).expiresAt = null;
  });
  const netok = PS.signToken(neSend, C.NO_END_TOKEN_MS);
  const nb = await beacon(netok, [{ t: "open" }], "N".repeat(22), t0 + 10 * DAY);
  check("its link counts readers (the token's end is NO_END_TOKEN_MS)", nb.status === 200 && nb.body.off !== true && (await item(ne.id))?.readers.length === 1, nb);
  check("and stays open years on", C.closeInternals.target(await T.loadState(), netok, t0 + 900 * DAY)?.open === true);
  const nev = await C.activityView(JOR, ne.id, BASE, t0 + 10 * DAY);
  check("the view: no end date, no closing reminder, never expired", nev.expiresAt === null && !nev.reminders.some((r) => r.key === "expiry") && nev.status !== "expired" && nev.suggestion?.key !== "expired", [nev.expiresAt, nev.status, nev.reminders.map((r) => r.key)]);
  const neRules = R.suggest({ ...base, a: null, status: "sent", nowMs: t0 + 400 * DAY });
  check("the expired rule doesn't fire on its own: only an expired status does", neRules?.key !== "expired");

  /* ================= closeC3's events ================= */
  console.log("\na question, passed on, countersigned");
  let cs = await PS.createProposal(JOR, { companyId: CEDAR, title: "Revenue operations reset", blocks, fields: { "pricing.monthlyFee": "$9,000", "term.initialMonths": "3" } }, BASE);
  // Sent for the member to countersign after the client (closeC3's "after"): the store's own signature events tell lib/close (closeHooks).
  cs = (await PS.sendProposal(JOR, cs.id, { signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "COO" }, memberSign: "after" }, BASE, t0)).proposal;
  const cstok = signTok(lastTo("dana@cedarandpine.example")?.text ?? "");
  check("every email switch is on by default (a question, a hand-off and countersign come in one email each, the proposal's own)", C.prefsOf(undefined).question.email === true && C.prefsOf(undefined).question.app && C.prefsOf(undefined).question.slack && C.prefsOf(undefined).passed.email && C.prefsOf(undefined).countersign.email);
  let sq = slack.length;
  let mq = mails.length;
  check("afterClientAsked: told", (await C.afterClientAsked(cs.id, { by: "Dana Whitfield", text: "Can we start in January?" }, t0 + DAY)) === true);
  await settle();
  const qs = slack.slice(sq).find((x) => /asked a question/.test(x.text));
  check("a question: Dana Whitfield asked a question about Revenue operations reset, the question quoted", !!qs && qs.text.startsWith("Dana Whitfield asked a question about Revenue operations reset") && JSON.stringify(qs.blocks).includes("Can we start in January?"), qs?.text);
  check("a question: in Merlin, and the alert sends no second email (the question's own email is the one)", (await C.inboxView(JOR)).items.some((x) => x.head === "Question:" && x.text === "Dana Whitfield asked about Revenue operations reset") && !mails.slice(mq).some((m) => /asked a question/.test(m.subject)));
  sq = slack.length;
  check("afterPassedOn: told", (await C.afterPassedOn(cs.id, { by: "Dana Whitfield", to: "Sam Lee" }, t0 + 2 * DAY)) === true);
  await settle();
  check("passed on: Dana Whitfield passed Revenue operations reset to Sam Lee to sign", slack.slice(sq).some((x) => x.text.startsWith("Dana Whitfield passed Revenue operations reset to Sam Lee to sign")) && (await C.inboxView(JOR)).items.some((x) => x.head === "Passed on:" && x.text === "Dana to Sam Lee"));
  check("an unknown item, or no one to pass it to: nothing", (await C.afterClientAsked("pr_notthereatall", { text: "x" })) === false && (await C.afterPassedOn(cs.id, { to: "" })) === false);
  // The client signs; the member countersigns. signProposal tells lib/close itself (its onSigned hook), once.
  await T.tableInternals.mutate((s) => {
    for (const e of s.pipeline?.mem_jor?.entries ?? []) if (e.companyId === "c_cedar") e.stage = "proposal";
  });
  sq = slack.length;
  await PS.requestCode(cstok, who, t0 + 3 * DAY);
  const cscode = lastTo("dana@cedarandpine.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  const csv = await PS.verifyCode(cstok, cscode, who, BASE, t0 + 3 * DAY);
  await PS.signProposal(cstok, { name: "Dana Whitfield", consent: true, hash: csv.hash }, who, BASE, t0 + 3 * DAY);
  await settle();
  check("the client signs: told once to countersign, and afterClientSigned again says nothing", slack.slice(sq).filter((x) => /Countersign to finish/.test(x.text)).length === 1 && (await C.afterClientSigned(cs.id, { by: "Dana Whitfield" }, t0 + 3 * DAY)) === false);
  const ct = slack.slice(sq).find((x) => /Countersign to finish/.test(x.text));
  check("countersign: Dana Whitfield signed. Countersign to finish., with Countersign", !!ct && ct.text.startsWith("Dana Whitfield signed. Countersign to finish.") && JSON.stringify(ct.blocks).includes("Countersign"), ct?.text);
  sq = slack.length;
  await C.afterSignerStep(cstok, BASE, t0 + 3 * DAY);
  await settle();
  check("while it waits for the countersignature: no Signed alert from the sign route", !slack.slice(sq).some((x) => x.text.startsWith("Signed")));
  check("while it waits: the pipeline has not moved to Won", ((await T.loadState()).pipeline?.mem_jor?.entries ?? []).some((e) => e.companyId === "c_cedar" && e.stage === "proposal"));
  let csv2 = await C.activityView(JOR, cs.id, BASE, t0 + 3 * DAY + HOUR);
  check("while it waits: no renewal clock, the status says so", csv2.renewal === null && csv2.statusWords === "Signed by Dana · countersign to finish", [csv2.renewal, csv2.statusWords]);
  check("while it waits: no renewal to start", (await refused(C.startRenewal(JOR, cs.id, BASE, t0 + 3 * DAY + HOUR)))?.includes("Countersign it first"));
  sq = slack.length;
  const fullAt = t0 + 5 * DAY;
  await PS.countersignProposal(JOR, cs.id, { method: "typed", typed: "Jordan Avery", consent: true }, BASE, fullAt);
  await settle();
  check("the member countersigns: Signed told once (afterFullySigned again, and the sign route, say nothing)", slack.slice(sq).filter((x) => x.text.startsWith("Signed")).length === 1 && (await C.afterFullySigned(cs.id, { origin: BASE }, fullAt)) === false);
  await C.afterSignerStep(cstok, BASE, fullAt);
  await settle();
  check("fully signed: Signed, Moved to Won, once, and the pipeline at Won", slack.slice(sq).filter((x) => x.text.startsWith("Signed")).length === 1 && slack.slice(sq).some((x) => x.text.startsWith("Signed") && /Moved to Won/.test(JSON.stringify(x.blocks))) && ((await T.loadState()).pipeline?.mem_jor?.entries ?? []).some((e) => e.companyId === "c_cedar" && e.stage === "won"));
  csv2 = await C.activityView(JOR, cs.id, BASE, fullAt + HOUR);
  check("the renewal clock starts at the countersignature: 3 months from it", csv2.renewal?.end === RN.addMonths(new Date(fullAt).toISOString().slice(0, 10), 3), csv2.renewal);

  /* ================= the bell ================= */
  console.log("\nthe bell");
  const bell = await C.inboxView(JOR);
  const one = bell.items.find((x) => !x.read)!;
  await C.markRead(JOR, [one.id]);
  const after = await C.inboxView(JOR);
  check("read one: only that one, kept on the server", after.items.find((x) => x.id === one.id)?.read === true && after.unread === bell.unread - 1 && after.unread > 0);
  check("newest first", after.items.every((x, i, a) => i === 0 || a[i - 1].at >= x.at));
  const src2 = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../app/post/Activity.tsx"), "utf8");
  check("the bell: a real button with the count in its label, a dialog, Escape closes, focus back, no pine button", /aria-label=\{unread \? `Notifications, \$\{unread\} unread`/.test(src2) && /role="dialog"/.test(src2) && /e\.key === "Escape"/.test(src2) && /btn\.current\?\.focus\(\)/.test(src2) && !/btn-pine/.test(src2.slice(src2.indexOf("export function ProposalBell"))));
  check("the bell is in the top bar, desktop and phone", (readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../app/post/TopBar.tsx"), "utf8").match(/<ProposalBell/g) ?? []).length === 2);

  /* ================= the plan comparison ================= */
  console.log("\nthe plans");
  const row = (w: string) => CP.PLAN_ROWS.find((r) => r[0] === w);
  check("Know when they open it and what they read: Close", row("Know when they open it and what they read")?.[1] === "In your trial only" && /follow up/i.test(row("Know when they open it and what they read")?.[3] ?? ""));
  check("Reminders until they sign: Close", row("Reminders until they sign")?.[2] === "In your trial only" && /day 2/i.test(row("Reminders until they sign")?.[3] ?? ""));
  check("Renewal reminders: Close", row("Renewal reminders")?.[2] === "In your trial only" && /30 days/.test(row("Renewal reminders")?.[3] ?? ""));
  check("all three in what Close adds (the Terms list them)", ["Know when they open it and what they read", "Reminders until they sign", "Renewal reminders"].every((w) => CP.CLOSE_ADDS.some(([x]) => x === w)));
  check("the landing page's rows are unchanged", CP.LANDING_ROWS.map((r) => r[0]).join("|") === "Opening companies|Fellow fractionals|Proposals and e-signature|Merlin drafting and your own contracts|Pipeline after a signature|Open roles");
  check("nothing left the machine but the fake email and Slack", others === 0, others);

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
