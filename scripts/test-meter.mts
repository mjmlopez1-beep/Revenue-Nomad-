/**
 * Checks of the credits meter (lib/creditsMeter.ts, Me.meter in lib/table.ts, the connector's line
 * in lib/mcp/log.ts, the bell's lines in perform, credits/Meter.tsx and where it shows). Pure parts
 * first; then lib/table.ts in process on a made-up seed in a temporary data dir, with billing live on
 * made-up Stripe keys (nothing is called), and the connector driven over an in-memory transport.
 *
 *   npx tsx scripts/test-meter.mts      exits 1 on any failure
 *
 * Covered:
 *   - the period: since the latest monthly plan grant on a paid plan, else the UTC calendar month;
 *     another member's grant, a future grant and a stale one don't count; Free and the trial use the month;
 *   - spent: unlocks less refunds in the period, never below 0; reversals and plan grants are not spending;
 *   - leftPct: 100 with nothing spent, 0 at no balance, a whole percent between (1 to 99);
 *   - the next grant: a monthly plan's renewal, a yearly plan's next month, none when cancelled or a pause is booked;
 *   - the connector's line, "N credits left (P% of this month's).", and at 20% or less how to get more
 *     (a top-up, an upgrade off Pro, the billing link); never words that ask a member to hold back;
 *   - the bell: once a period at 80% used and once at 0, again in a new period, nothing without a spend;
 *   - in process: Me.meter on Pro (since the grant, next grant on the renewal) and on Free (the month);
 *     a spend through the connector adds the line; the bell's lines land once each; the stored mark;
 *   - the pages: Agent access, Credits and usage and the header pill draw it; No limit (default) and
 *     the limit is optional; the low moment's buttons are pine, never volt; no export.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-meter-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** Words that would ask a member to use less. The meter never says them. */
const HOLD_BACK = /\bsav(e|ing) (your |their )?credits|conserve|hold back|careful with|slow down|\bration|cut back|use less/i;

/* ---------- the made-up seed (before lib/table.ts loads) ---------- */
const co = (n: number) => ({ id: `c_m${n}`, fields: { name: `Meterco ${n}`, website: `meterco${n}.example`, hq: "Denver, CO", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M" } });
const companies = Array.from({ length: 8 }, (_, i) => co(i));
const engagements = companies.map((c, i) => ({ id: `e_m${i}`, companyId: c.id, verified: false, fields: { source: "Member success story", operator: "Sam Example", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2024-02", end: "2024-12", status: "Ended" } }));
const contacts = companies.map((c, i) => ({ id: `p_m${i}`, companyId: c.id, engagementId: null, fields: { name: `Dana Example${i}`, title: "CEO", relationship: "Decision maker" } }));
const M = (id: string, name: string) => ({ id, name, email: `${id}.meter@example.com`, title: "Fractional VP Sales", token: `tok-${id}-meter` });
const members = [M("mem_jordan", "Jordan Avery"), M("mem_pro", "Riley Stone")];
const onb = { onboarded: true, function: "Sales", title: "Fractional VP Sales" };
const GRANT_AT = iso(-5 * DAY);
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    // Pro's grant for this month is on the ledger already (the visit then grants nothing more).
    ledger: [{ memberId: "mem_pro", delta: 100, reason: "plan", ref: "plan.in_meter_1.0", at: GRANT_AT }],
    values: {},
    unlocks: {},
    seen: {},
    profiles: { mem_jordan: onb, mem_pro: onb },
    members: [],
    billing: {
      members: {
        // Free: the trial ended 9 days ago.
        mem_jordan: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY), notices: { trialEndedSeen: iso(-8 * DAY) } },
        // Paid Pro, monthly, renewing in 25 days.
        mem_pro: { trialStartedAt: iso(-60 * DAY), trialEndsAt: iso(-39 * DAY), subscriptionId: "sub_meter_1", customerId: "cus_meter_1", proUntil: iso(25 * DAY), paidSince: iso(-39 * DAY), interval: "month", tier: "pro", invoiceId: "in_meter_1", periodStart: iso(-5 * DAY), cents: 5900, notices: { proWelcomeSeen: iso(-30 * DAY) } },
      },
      events: [],
      payments: [],
      ended: [],
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-meter",
  RN_STARTER_CREDITS: "10",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_SCHEDULER: "0",
  // Billing live on made-up keys: nothing here calls Stripe.
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_meter_made_up",
  STRIPE_WEBHOOK_SECRET: "whsec_meter_made_up",
  STRIPE_PRICE_MONTH: "price_meter_m",
  STRIPE_PRICE_YEAR: "price_meter_y",
  STRIPE_PRICE_TOPUP: "price_meter_top",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_GRANOLA", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "RESEND_API_KEY", "STRIPE_API_URL"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

async function main() {
  const C = await import("../lib/creditsMeter");
  const R = await import("../lib/billing/rules");

  /* ---------- pure: the period ---------- */
  console.log("\nThe period");
  {
    const now = Date.parse("2026-11-23T15:00:00.000Z");
    const rows = [
      { memberId: "m", delta: 100, reason: "plan", at: "2026-10-12T09:00:00.000Z" },
      { memberId: "m", delta: 100, reason: "plan", at: "2026-11-12T09:00:00.000Z" },
      { memberId: "x", delta: 100, reason: "plan", at: "2026-11-20T09:00:00.000Z" },
      { memberId: "m", delta: 100, reason: "plan", at: "2026-11-30T09:00:00.000Z" },
    ];
    const p = C.meterPeriod(rows, "m", now, true);
    check("on a paid plan: since the latest plan grant (not another member's, not one in the future)", p.since === "2026-11-12T09:00:00.000Z" && p.basis === "plan", p);
    const f = C.meterPeriod(rows, "m", now, false);
    check("Free and the trial: since the start of the UTC calendar month", f.since === "2026-11-01T00:00:00.000Z" && f.basis === "month", f);
    const stale = C.meterPeriod([{ memberId: "m", delta: 100, reason: "plan", at: "2026-09-01T00:00:00.000Z" }], "m", now, true);
    check(`a grant older than ${C.STALE_GRANT_DAYS} days is no period: the month`, stale.basis === "month" && stale.since === "2026-11-01T00:00:00.000Z", stale);
    check("a paid plan with no grant yet: the month", C.meterPeriod([], "m", now, true).basis === "month");
    check("the grant is PRO_CREDITS on Pro and Close (lib/billing/rules.ts)", R.PRO_CREDITS === 100 && R.TOPUP_CREDITS === 50 && R.PRICES.topup === 19);
  }

  /* ---------- pure: spent and leftPct ---------- */
  console.log("\nSpent and what is left");
  {
    const now = Date.parse("2026-11-23T15:00:00.000Z");
    const since = "2026-11-12T09:00:00.000Z";
    const rows = [
      { memberId: "m", delta: -2, reason: "unlock", at: "2026-11-10T00:00:00.000Z" }, // before the period
      { memberId: "m", delta: -2, reason: "unlock", at: "2026-11-13T00:00:00.000Z" },
      { memberId: "m", delta: -1, reason: "unlock", at: "2026-11-14T00:00:00.000Z" },
      { memberId: "m", delta: 0, reason: "unlock", at: "2026-11-14T01:00:00.000Z" }, // a free open
      { memberId: "m", delta: 1, reason: "refund", at: "2026-11-15T00:00:00.000Z" },
      { memberId: "m", delta: -1, reason: "reversal", at: "2026-11-15T00:00:00.000Z" }, // took back a fact they added: not spending
      { memberId: "m", delta: 100, reason: "plan", at: since },
      { memberId: "x", delta: -9, reason: "unlock", at: "2026-11-15T00:00:00.000Z" },
    ];
    check("spent: unlocks less refunds in the period (2 + 1 - 1)", C.spentSince(rows, "m", since, now) === 2, C.spentSince(rows, "m", since, now));
    check("  never below 0 (a refund for a spend before the period)", C.spentSince([{ memberId: "m", delta: 3, reason: "refund", at: "2026-11-20T00:00:00.000Z" }], "m", since, now) === 0);
    check("leftPct: 100 when nothing was spent", C.leftPctOf(40, 0) === 100);
    check("leftPct: 0 at a balance of 0, and when owing", C.leftPctOf(0, 30) === 0 && C.leftPctOf(-3, 5) === 0 && C.leftPctOf(0, 0) === 0);
    check("leftPct: balance / (balance + spent), rounded (60 of 100: 60%; 2 of 3: 67%)", C.leftPctOf(60, 40) === 60 && C.leftPctOf(2, 1) === 67);
    check("leftPct: anything left reads at least 1%, anything spent at most 99%", C.leftPctOf(1, 500) === 1 && C.leftPctOf(500, 1) === 99);
    const m = C.creditsMeterOf({ rows, memberId: "m", balance: 18, nowMs: now, onPaidPlan: true, plan: { interval: "month", periodStart: since, proUntil: "2026-12-12T09:00:00.000Z" } });
    check("the meter on Pro: since the grant, spent, leftPct, the next grant on the renewal", m.since === since && m.basis === "plan" && m.spent === 2 && m.leftPct === 90 && m.nextGrantAt === "2026-12-12T09:00:00.000Z" && m.resetsAt === m.nextGrantAt && !m.low, m);
    const free = C.creditsMeterOf({ rows: [{ memberId: "f", delta: -20, reason: "unlock", at: "2026-11-20T00:00:00.000Z" }], memberId: "f", balance: 5, nowMs: now, onPaidPlan: false });
    check("the meter on Free: the month, resets on the 1st, no grant, low at 20%", free.basis === "month" && free.resetsAt === "2026-12-01T00:00:00.000Z" && free.nextGrantAt === null && free.leftPct === 20 && free.low, free);
    const zero = C.creditsMeterOf({ rows: [], memberId: "z", balance: -2, nowMs: now, onPaidPlan: false });
    check("at 0 (or owing): 0%, balance 0, low", zero.leftPct === 0 && zero.balance === 0 && zero.low, zero);
    check("21% is not low, 20% is", !C.creditsMeterOf({ rows: [{ memberId: "a", delta: -79, reason: "unlock", at: "2026-11-20T00:00:00.000Z" }], memberId: "a", balance: 21, nowMs: now, onPaidPlan: false }).low && C.LOW_PCT === 20);
  }

  /* ---------- pure: the next grant ---------- */
  console.log("\nThe next grant");
  {
    const now = Date.parse("2026-11-23T15:00:00.000Z");
    check("monthly: the renewal (proUntil)", C.nextGrantOf({ interval: "month", periodStart: "2026-11-12T09:00:00.000Z", proUntil: "2026-12-12T09:00:00.000Z" }, now) === "2026-12-12T09:00:00.000Z");
    check("cancelled: none", C.nextGrantOf({ interval: "month", periodStart: "2026-11-12T09:00:00.000Z", proUntil: "2026-12-12T09:00:00.000Z", cancelAt: "2026-12-12T09:00:00.000Z" }, now) === null);
    check("a pause booked from the renewal: none", C.nextGrantOf({ interval: "month", periodStart: "2026-11-12T09:00:00.000Z", proUntil: "2026-12-12T09:00:00.000Z", pausedFrom: "2026-12-12T09:00:00.000Z", pausedUntil: "2027-01-12T09:00:00.000Z" }, now) === null);
    check("yearly: next month from the period start", C.nextGrantOf({ interval: "year", periodStart: "2026-03-05T00:00:00.000Z", proUntil: "2027-03-05T00:00:00.000Z" }, now) === "2026-12-05T00:00:00.000Z");
    check("yearly, cancelled: the months already paid still come", C.nextGrantOf({ interval: "year", periodStart: "2026-03-05T00:00:00.000Z", proUntil: "2027-03-05T00:00:00.000Z", cancelAt: "2027-03-05T00:00:00.000Z" }, now) === "2026-12-05T00:00:00.000Z");
    check("no plan: none", C.nextGrantOf(undefined, now) === null);
  }

  /* ---------- pure: the connector's line ---------- */
  console.log("\nThe connector's line");
  {
    const now = Date.parse("2026-11-23T15:00:00.000Z");
    const link = "https://post.example.com/?p=billing&plans=1&from=claude_credits";
    const at = (balance: number, spent: number) => C.creditsMeterOf({ rows: spent ? [{ memberId: "m", delta: -spent, reason: "unlock", at: "2026-11-20T00:00:00.000Z" }] : [], memberId: "m", balance, nowMs: now, onPaidPlan: false });
    const ok = C.connectorLine(at(60, 40), { plan: "pro", topup: true }, link);
    check("after a spend: one line, \"60 credits left (60% of this month's).\"", ok === "60 credits left (60% of this month's).", ok);
    check("  one credit is singular", C.connectorLine(at(1, 3), { plan: "pro", topup: true }, link).startsWith("1 credit left (25% of this month's)."));
    const proLow = C.connectorLine(at(20, 80), { plan: "pro", topup: true }, link);
    check("at 20% on Pro: the top-up, its credits and price, and the billing link", proLow === `20 credits left (20% of this month's). To keep going, top up 50 credits for $19. ${link}`, proLow);
    const freeLow = C.connectorLine(at(2, 23), { plan: "free", topup: true }, link);
    check("low on Free: the top-up or Pro's monthly credits, with the link", /top up 50 credits for \$19, or move to Pro for 100 credits each month\. https:\/\/post\.example\.com\/\?p=billing&plans=1/.test(freeLow), freeLow);
    const trialZero = C.connectorLine(at(0, 25), { plan: "trial", topup: false }, link);
    check("at 0 in the trial without a top-up set up: Pro, with the link", trialZero === `0 credits left (0% of this month's). To keep going, move to Pro for 100 credits each month. ${link}`, trialZero);
    const off = C.connectorLine(at(1, 24), { plan: null, topup: false }, "https://post.example.com/?p=credits&tab=earn");
    check("billing off: earning, with the credits page", /add what you know on Merlin: each fact earns a credit\. https:\/\/post\.example\.com\/\?p=credits&tab=earn$/.test(off), off);
    check("above 20%: no pitch at all", !/top up|Pro/.test(C.connectorLine(at(21, 79), { plan: "free", topup: true }, link)));
    check("never words that ask a member to hold back", ![ok, proLow, freeLow, trialZero, off].some((x) => HOLD_BACK.test(x)), [ok, proLow, freeLow, trialZero, off].find((x) => HOLD_BACK.test(x)));
  }

  /* ---------- pure: the bell ---------- */
  console.log("\nThe bell");
  {
    const nowIso = "2026-11-23T15:00:00.000Z";
    const now = Date.parse(nowIso);
    const meter = (balance: number, spent: number, since = "2026-11-12T09:00:00.000Z", at = now) =>
      C.creditsMeterOf({ rows: [{ memberId: "m", delta: 100, reason: "plan", at: since }, ...(spent ? [{ memberId: "m", delta: -spent, reason: "unlock", at: new Date(Date.parse(since) + DAY).toISOString() }] : [])], memberId: "m", balance, nowMs: at, onPaidPlan: true, plan: { interval: "month", periodStart: since, proUntil: new Date(Date.parse(since) + 30 * DAY).toISOString() } });
    const free = { plan: "free" as const, topup: true };
    const pro = { plan: "pro" as const, topup: true };
    check("nothing spent: nothing said", C.meterBell(meter(100, 0), undefined, pro, nowIso).mark === null);
    check("under 80% used: nothing", C.meterBell(meter(21, 79), undefined, pro, nowIso).lines.length === 0);
    const a = C.meterBell(meter(20, 80), undefined, free, nowIso);
    check("80% used: one line, the owner's words, to Credits and usage Plans", a.lines.length === 1 && a.lines[0].line === "You've used 80% of this month's credits · Top up or upgrade" && a.lines[0].href === "/?p=billing&plans=1" && a.lines[0].kind === "credits" && a.lines[0].id === "credits:80:2026-11-12T09:00:00.000Z", a.lines);
    check("  its small line: what is left and the next grant", a.lines[0].sub === "20 credits left. Your next 100 credits come Dec 12.", a.lines[0].sub);
    check("  and the mark keeps the period and what was said", JSON.stringify(a.mark) === JSON.stringify({ since: "2026-11-12T09:00:00.000Z", told: ["80"] }), a.mark);
    check("on Pro the line offers the top-up", C.meterBell(meter(20, 80), undefined, pro, nowIso).lines[0].line === "You've used 80% of this month's credits · Top up for more");
    const again = C.meterBell(meter(10, 90), a.mark!, free, nowIso);
    check("once a period: 85%, 90% used say nothing more", again.mark === null && again.lines.length === 0);
    const z = C.meterBell(meter(0, 100), a.mark!, free, nowIso);
    check("at 0: the second line, once", z.lines.length === 1 && z.lines[0].line === "You've used all of this month's credits · Top up or upgrade" && z.lines[0].id === "credits:0:2026-11-12T09:00:00.000Z" && JSON.stringify(z.mark!.told) === '["80","0"]', z.lines);
    check("  and not again", C.meterBell(meter(0, 101), z.mark!, free, nowIso).mark === null);
    const jump = C.meterBell(meter(0, 100), undefined, free, nowIso);
    check("straight to 0: only the 0 line, and both are marked", jump.lines.length === 1 && jump.lines[0].id.startsWith("credits:0:") && JSON.stringify(jump.mark!.told) === '["80","0"]', jump);
    const next = C.meterBell(meter(20, 80, "2026-12-12T09:00:00.000Z", Date.parse("2026-12-20T00:00:00.000Z")), z.mark!, free, "2026-12-20T00:00:00.000Z");
    check("a new period: the 80% line comes again", next.lines.length === 1 && next.lines[0].id === "credits:80:2026-12-12T09:00:00.000Z");
    check("billing off: earning, to Ways to earn", C.meterBell(meter(20, 80), undefined, { plan: null, topup: false }, nowIso).lines[0].href === "/?p=credits&tab=earn");
    check("the bell's words never ask a member to hold back", ![a, z, jump].some((r) => r.lines.some((l) => HOLD_BACK.test(l.line + (l.sub ?? "")))));
  }

  /* ---------- in process ---------- */
  const t = await import("../lib/table");
  const S = await import("../lib/mcp/server");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  async function agent(id: string) {
    const server = S.makeServer({ member: (await t.memberById(id))!, origin: "https://post.example.com", app: "Claude" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: "qa-meter", version: "1" });
    await client.connect(a);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      let out: Record<string, unknown> = {};
      try {
        out = JSON.parse(r.content?.[0]?.text ?? "");
      } catch {
        /* words */
      }
      return { texts: (r.content ?? []).map((x) => x.text), out, isError: !!r.isError };
    };
    return { client, call };
  }
  const meOf = async (id: string) => (await t.buildView(`tok-${id}-meter`, { fresh: true })).me!;

  console.log("\nMe.meter");
  {
    const pro = await meOf("mem_pro");
    check("Pro: since the month's grant, nothing spent, 100%, the next grant on the renewal", pro.meter?.basis === "plan" && pro.meter.since === GRANT_AT && pro.meter.leftPct === 100 && pro.meter.balance === 110 && pro.meter.nextGrantAt === iso(25 * DAY), pro.meter);
    const free = await meOf("mem_jordan");
    const month = new Date(t0);
    check("Free: since the start of the UTC month, 100% of 10", free.meter?.basis === "month" && free.meter.since === new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).toISOString() && free.meter.leftPct === 100 && free.meter.balance === 10 && free.meter.nextGrantAt === null, free.meter);
  }

  console.log("\nThe connector after a spend");
  {
    const j = await agent("mem_jordan");
    const ids = ((await j.call("search_companies", { limit: 10 })).out.companies as { id: string }[]).map((x) => x.id);
    check("setup: five locked companies to open (2 credits each on Free)", ids.length >= 5, ids.length);
    const quote = await j.call("unlock", { entity: "company", id: ids[0], field: "identity" });
    check("a quote spends nothing: no credits line", quote.out.confirmed === false && quote.texts.length === 1, quote.texts);
    const one = await j.call("unlock", { entity: "company", id: ids[0], field: "identity", confirm: true });
    check("a spend: the answer adds one line, \"8 credits left (80% of this month's).\"", one.out.confirmed === true && one.texts.length === 2 && one.texts[1] === "8 credits left (80% of this month's).", one.texts);
    await j.call("unlock", { entity: "company", id: ids[1], field: "identity", confirm: true });
    await j.call("unlock", { entity: "company", id: ids[2], field: "identity", confirm: true });
    const low = await j.call("unlock", { entity: "company", id: ids[3], field: "identity", confirm: true });
    check(
      "at 20%: how to get more, with the connector's billing link",
      low.texts[1] === "2 credits left (20% of this month's). To keep going, top up 50 credits for $19, or move to Pro for 100 credits each month. https://post.example.com/?p=billing&plans=1&from=claude_credits",
      low.texts[1],
    );
    const box = (await t.loadState()).inbox?.mem_jordan ?? [];
    check("the bell: one line at 80% used, to Credits and usage Plans", box.filter((x) => x.kind === "credits").length === 1 && box[0].line === "You've used 80% of this month's credits · Top up or upgrade" && box[0].href === "/?p=billing&plans=1", box.map((x) => x.line));
    await j.call("unlock", { entity: "company", id: ids[4], field: "identity", confirm: true });
    const after = (await t.loadState()).inbox?.mem_jordan ?? [];
    const lines = after.filter((x) => x.kind === "credits").map((x) => x.line);
    check("at 0: the second line, and the 80% line only once", lines.length === 2 && lines.filter((l) => /80%/.test(l)).length === 1 && lines.includes("You've used all of this month's credits · Top up or upgrade"), lines);
    const prof = ((await t.loadState()).profiles as Record<string, { meterBell?: { since: string; told: string[] } }>).mem_jordan;
    check("the stored mark: the period's start and what was said, nothing else", JSON.stringify(Object.keys(prof.meterBell ?? {})) === '["since","told"]' && JSON.stringify(prof.meterBell?.told) === '["80","0"]', prof.meterBell);
    const me = await meOf("mem_jordan");
    check("Me.meter at 0: 0%, low", me.meter?.leftPct === 0 && me.meter.low && me.meter.spent === 10, me.meter);
    check("a read call adds nothing", (await j.call("my_account")).texts.length === 1);
    await j.client.close();
  }

  console.log("\nPro spends");
  {
    const p = await agent("mem_pro");
    const pid = ((await p.call("search_companies", { limit: 10 })).out.companies as { id: string }[])[0].id;
    const open = await p.call("unlock", { entity: "company", id: pid, field: "identity", confirm: true });
    // The test server's RN_FREE_COMPANY=off: Pro's free opens are off here, so the company is 2 credits.
    check("a company for 2 credits on Pro: 108 credits left (98% of this month's)", open.out.confirmed === true && open.texts[1] === "108 credits left (98% of this month's).", open.texts.slice(1));
    const co = (await p.call("get_company", { company: pid })).out as Record<string, unknown>;
    const people = (JSON.stringify(co).match(/"(p_[A-Za-z0-9_-]+|[A-Za-z0-9_-]{8,})"/g) ?? []).map((x) => x.slice(1, -1));
    let named: string[] = [];
    for (const id of [...new Set(people)]) {
      const r = await p.call("unlock", { entity: "person", id, field: "name", confirm: true });
      if (r.out.confirmed === true) {
        named = r.texts;
        break;
      }
    }
    check("a name for 1 credit: 107 credits left (97% of this month's)", named[1] === "107 credits left (97% of this month's).", { named, co: JSON.stringify(co).slice(0, 400) });
    await p.client.close();
  }

  /* ---------- the pages ---------- */
  console.log("\nThe pages");
  {
    const meter = src("app/post/credits/Meter.tsx");
    const agentPage = src("app/post/agent/AgentAccess.tsx");
    const credits = src("app/post/credits/CreditsUsage.tsx");
    const top = src("app/post/TopBar.tsx");
    check("the meter: a thin bar and \"N% of your credits left\" with the count", /role="meter"/.test(meter) && /of your credits left/.test(meter) && /meterSub/.test(meter));
    check("  low: Top up and Upgrade, pine, never volt", /btn-pine/.test(meter) && !/btn-volt|--volt/.test(meter + src("app/post/credits/meter.css")) && /Top up \$\{plan\.prices\.topupCredits\} credits/.test(meter) && /Upgrade for/.test(meter));
    check("Agent access: the meter near the top, with the words that encourage use", agentPage.indexOf("<CreditsMeterBar") > 0 && agentPage.indexOf("<CreditsMeterBar") < agentPage.indexOf("{/* Your agents */}") && /Your agents use the same credits you do/.test(agentPage));
    check("  the spend limit says No limit (default) and that a limit is optional", /No limit \(default\)/.test(agentPage) && /A limit is optional/.test(agentPage) && /Optional\. All your agents together/.test(agentPage));
    check("Credits and usage: the meter on Overview", /tab === "overview" && me\.meter/.test(credits) && /<CreditsMeterBar/.test(credits));
    check("the header pill: a thin bar, the percent in its title and spoken name, the meter in its popover", /tp-credits-meter/.test(top) && /meterTip\(me\.meter, me\.plan\)/.test(top) && /% of this month's left/.test(top) && /<CreditsMeterBar me=\{me\} variant="pop" \/>/.test(top));
    check("  the pill's bar shows only in the new look's header, 2px", /\.ws-hacts \.tp-credits-meter \{[^}]*height: 2px/.test(src("app/post/shell/shell.css")) && /\.tp-credits-meter \{\s*display: none;/.test(src("app/post/credits/meter.css")));
    const words = [meter, agentPage, credits].join("\n");
    check("no words that ask a member to hold back", !HOLD_BACK.test(words.replace(/asks a member to use less|asking them to use less/g, "")), words.match(HOLD_BACK)?.[0]);
    check("no export, no CSV, no download", !/Export CSV|\.csv|download/i.test(meter));
    check("the default stays no limit (lib/mcp/log.ts)", /export const DEFAULT_LIMIT: number \| null = null;/.test(src("lib/mcp/log.ts")));
    check("docs/data-flows.md says what the meter stores", /Profile\.meterBell/.test(src("docs/data-flows.md")));
  }
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    try {
      const L = await import("../lib/mcp/log");
      await L.flushAgentLog();
    } catch {
      /* nothing waiting */
    }
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
