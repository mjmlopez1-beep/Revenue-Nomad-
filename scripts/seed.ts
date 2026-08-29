/**
 * Deterministic seed generator (spec §9, day 0-1): imports the ~300-operator
 * roster with profile list rates, the RN-placed engagement roster with
 * Bill.com billing history (pre-fill payloads), 12 weeks of pulse history,
 * deals, signals, and a first monthly edition — so the realization-rate
 * marquee is real before the first operator logs in.
 *
 * In production this script is replaced by the real CSV import
 * (/admin → Operators); the generated data models the same shape.
 *
 * Run: npm run seed  → writes data/seed.json
 */
import { promises as fs } from "fs";
import path from "path";
import type {
  Database,
  Operator,
  ClientEngagement,
  EngagementActuals,
  Func,
  Stage,
  Industry,
  ScopeArea,
  DealSource,
  PulseBand,
  RetainerBand,
  QuestionOfWeek,
} from "../lib/types";
import { DEFAULT_CONFIG } from "../lib/config";
import { emptyDb } from "../lib/store";
import { isoWeek, weeksAgo, lastWeeks, monthKey, daysAgo, daysFromNow } from "../lib/time";
import { computeIndexSnapshot } from "../lib/aggregate";

/* ---------- deterministic PRNG ---------- */
let seedState = 0x9e3779b9;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number): boolean => rand() < p;
const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);
const round50 = (n: number): number => Math.round(n / 50) * 50;

/* ---------- vocabulary ---------- */
const FIRST = ["Ava","Noah","Maya","Liam","Zoe","Ethan","Ivy","Owen","Ruth","Cole","Nina","Jude","Tess","Reid","Lena","Beck","Cora","Dean","Faye","Gray","Hope","Ian","June","Kai","Lila","Marc","Nell","Omar","Piper","Quinn","Rosa","Seth","Tara","Umar","Vera","Wade","Xena","Yael","Zack","Dara"] as const;
const LAST = ["Torres","Chen","Okafor","Lindqvist","Marsh","Vance","Ito","Delgado","Fromm","Grant","Hale","Iqbal","Joyce","Kaur","Lam","Moreau","Ncube","Ortiz","Pratt","Qureshi","Reyes","Silva","Tanaka","Ueda","Voss","Whitfield","Xu","Yang","Zamora","Adler","Bishop","Cruz","Dutta","Egan","Farrell","Gomez","Huang","Irwin","Jensen","Kline"] as const;
const FUNCS: Func[] = ["cmo","cro","vp_sales","vp_marketing","revops","growth","sdr_leader"];
const FUNC_WEIGHTS = [0.22, 0.14, 0.18, 0.16, 0.12, 0.12, 0.06];
const STAGES: Stage[] = ["pre_seed","seed","series_a","series_b","series_c_plus"];
const STAGE_WEIGHTS = [0.08, 0.28, 0.34, 0.2, 0.1];
const INDUSTRIES: Industry[] = ["b2b_saas","fintech","healthtech","devtools","cybersecurity","ai_ml","ecommerce","services"];
const IND_WEIGHTS = [0.34, 0.12, 0.1, 0.1, 0.08, 0.14, 0.07, 0.05];
const SCOPES: ScopeArea[] = ["full_gtm","sales_leadership","marketing_leadership","pipeline_gen","revops_systems","pricing_packaging","hiring_enablement"];
const SOURCES: DealSource[] = ["rn","referral","inbound","outbound","community","past_client"];
const SOURCE_WEIGHTS = [0.3, 0.28, 0.14, 0.08, 0.12, 0.08];
const CLIENT_WORDS = ["Northwind","Acumen","Brightline","Cobalt","Driftwood","Emberly","Fathom","Gridline","Harbor","Junction","Keystone","Lumen","Meridian","Nimbus","Orchard","Pinnacle","Quarry","Ridgeline","Summit","Tidewater","Vantage","Wavelength","Zephyr","Basecamp","Crestline"] as const;
const CLIENT_SUFFIX = ["Labs","Systems","Health","AI","Software","Robotics","Commerce","Security","Analytics","HQ"] as const;

// List monthly retainer ranges by function [lo, hi]; realization varies by
// function too — CROs realize highest (spec's example: 91% of list).
const LIST_RANGE: Record<Func, [number, number]> = {
  cmo: [8000, 15000],
  cro: [10000, 17000],
  vp_sales: [7000, 12000],
  vp_marketing: [6500, 11500],
  revops: [5500, 10000],
  growth: [6000, 11000],
  sdr_leader: [4500, 8000],
};
const REALIZATION_CENTER: Record<Func, number> = {
  cmo: 0.84, cro: 0.91, vp_sales: 0.87, vp_marketing: 0.82, revops: 0.88, growth: 0.85, sdr_leader: 0.86,
};

function weighted<T>(items: T[], weights: number[]): T {
  const r = rand();
  let cum = 0;
  for (let i = 0; i < items.length; i++) {
    cum += weights[i];
    if (r <= cum) return items[i];
  }
  return items[items.length - 1];
}

function bandFor(amount: number): RetainerBand {
  if (amount < 3000) return "under_3k";
  if (amount < 6000) return "3k_6k";
  if (amount < 10000) return "6k_10k";
  if (amount < 15000) return "10k_15k";
  return "15k_plus";
}

/* ---------- build ---------- */
async function main() {
  const now = new Date();
  const db: Database = emptyDb();
  db.config = { ...DEFAULT_CONFIG, launchDate: daysAgo(5, now).toISOString().slice(0, 10) };
  let idCounter = 0;
  const uid = (p: string) => `${p}_${(++idCounter).toString(36).padStart(4, "0")}`;

  const award = (
    operatorId: string,
    action: Parameters<Database["credits"]["push"]>[0]["action"],
    amount: number,
    ref: string,
    note: string,
    at: string,
    expiresAt: string | null = null
  ) => {
    db.credits.push({ id: uid("cr"), operatorId, action, amount, ref, note, at, expiresAt });
  };

  /* operators */
  const N = 300;
  for (let i = 0; i < N; i++) {
    // Diagonal pairing keeps all 300 names unique without repeating surnames in a block.
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i + Math.floor(i / FIRST.length)) % LAST.length]}`;
    const func = i === 0 ? "cmo" : weighted(FUNCS, FUNC_WEIGHTS);
    const [lo, hi] = LIST_RANGE[func];
    const op: Operator = {
      id: `op_${String(i + 1).padStart(3, "0")}`,
      name,
      email: `${name.toLowerCase().replace(" ", ".")}.${i + 1}@example.com`,
      func,
      listMonthlyRate: round50(between(lo, hi)),
      listHourlyRate: Math.round(between(150, 375) / 5) * 5,
      foundingFifty: i < 50,
      insider: i >= 50 && chance(0.08),
      follows: chance(0.6)
        ? [{ func: chance(0.5) ? func : undefined, industry: weighted(INDUSTRIES, IND_WEIGHTS), stage: chance(0.5) ? weighted(STAGES, STAGE_WEIGHTS) : undefined }]
        : [],
      joinedAt: daysAgo(Math.floor(between(0, 6)), now).toISOString(),
      statedCapacityHours: chance(0.5) ? Math.round(between(60, 140) / 10) * 10 : null,
      takingClients: chance(0.5) ? chance(0.6) : null,
    };
    db.operators.push(op);
  }

  /* engagements: RN-placed roster (pre-filled from Bill.com) + off-platform */
  const weekKeys = lastWeeks(12, now);
  for (const op of db.operators) {
    const demo = op.id === "op_001"; // first Founding 50 profile: shows every first-session state
    const activated = demo || (op.foundingFifty ? chance(0.85) : chance(0.3)); // has engaged with the product
    const rnCount = demo ? 2 : chance(0.45) ? (chance(0.35) ? 2 : 1) : 0;

    const makeActuals = (rn: boolean): EngagementActuals => {
      const center = REALIZATION_CENTER[op.func];
      const realization = Math.min(1.12, Math.max(0.55, center + between(-0.14, 0.14)));
      const actual = round50(op.listMonthlyRate * realization);
      return {
        actualMonthly: actual,
        hoursPerMonth: Math.round(between(20, 70) / 5) * 5,
        stage: weighted(STAGES, STAGE_WEIGHTS),
        industry: weighted(INDUSTRIES, IND_WEIGHTS),
        scopeArea: pick(SCOPES),
        source: rn ? "rn" : weighted(SOURCES.slice(1), [0.34, 0.17, 0.1, 0.25, 0.14]),
        pricingModel: chance(0.82) ? "monthly_retainer" : pick(["day_rate","project","retainer_plus_equity"] as const),
        vsList: actual < op.listMonthlyRate * 0.97 ? "below_list" : actual > op.listMonthlyRate * 1.03 ? "above_list" : "at_list",
      };
    };

    for (let k = 0; k < rnCount; k++) {
      const prefill = makeActuals(true);
      // Demo operator: first RN engagement confirmed, second still pre-filled.
      const confirmed = demo ? k === 0 : activated && chance(0.75);
      const confirmedAt = confirmed ? daysAgo(Math.floor(between(0, 5)), now).toISOString() : null;
      const c: ClientEngagement = {
        id: uid("cl"),
        operatorId: op.id,
        clientName: `${pick(CLIENT_WORDS)} ${pick(CLIENT_SUFFIX)}`,
        rnPlaced: true,
        status: "active",
        prefill,
        actuals: confirmed ? prefill : null,
        confirmedAt,
        verified: confirmed, // pre-filled RN rows are verified at confirmation
        startedAt: daysAgo(Math.floor(between(60, 400)), now).toISOString(),
        endedAt: null,
        endReason: null,
        debrief: null,
        refreshDueAt: daysFromNow(Math.floor(between(30, 90)), now).toISOString(),
        lastRefreshedAt: null,
        moderation: "ok",
      };
      db.clients.push(c);
      if (confirmed)
        award(op.id, "engagement_confirm_prefill", db.config.earn.confirmPrefill, c.id, `Confirmed ${c.clientName} (RN-placed, verified)`, confirmedAt!);
    }

    if (activated) {
      // 1-2 off-platform active clients, self-reported.
      const offCount = demo ? 1 : chance(0.7) ? (chance(0.3) ? 2 : 1) : 0;
      for (let k = 0; k < offCount; k++) {
        const actuals = makeActuals(false);
        const at = daysAgo(Math.floor(between(0, 5)), now).toISOString();
        const c: ClientEngagement = {
          id: uid("cl"),
          operatorId: op.id,
          clientName: `${pick(CLIENT_WORDS)} ${pick(CLIENT_SUFFIX)}`,
          rnPlaced: false,
          status: "active",
          prefill: null,
          actuals,
          confirmedAt: at,
          verified: false,
          startedAt: daysAgo(Math.floor(between(30, 500)), now).toISOString(),
          endedAt: null,
          endReason: null,
          debrief: null,
          refreshDueAt: daysFromNow(Math.floor(between(60, 92)), now).toISOString(),
          lastRefreshedAt: null,
          moderation: "ok",
        };
        db.clients.push(c);
        award(op.id, "engagement_actuals", db.config.earn.engagementActuals, c.id, `Engagement actuals — ${c.clientName}`, at);
      }
      // Past engagements (historical backfill, launch bonus active).
      if (chance(0.4)) {
        const actuals = makeActuals(chance(0.3));
        const endedAt = daysAgo(Math.floor(between(30, 330)), now).toISOString();
        const at = daysAgo(Math.floor(between(0, 5)), now).toISOString();
        const outcome = pick(["completed","churned","completed","renewed"] as const);
        const c: ClientEngagement = {
          id: uid("cl"),
          operatorId: op.id,
          clientName: `${pick(CLIENT_WORDS)} ${pick(CLIENT_SUFFIX)}`,
          rnPlaced: false,
          status: "past",
          prefill: null,
          actuals,
          confirmedAt: at,
          verified: false,
          startedAt: daysAgo(Math.floor(between(340, 700)), now).toISOString(),
          endedAt,
          endReason: outcome,
          debrief: {
            outcome,
            reason:
              outcome === "churned"
                ? pick([
                    "New full-time hire took the function in-house",
                    "Budget cut after missed quarter",
                    "Founder wanted daily presence, not fractional",
                    "Scope drifted into execution work; retainer stopped making sense",
                    "Company paused GTM spend during bridge round",
                  ])
                : "",
            at,
          },
          refreshDueAt: daysFromNow(90, now).toISOString(),
          lastRefreshedAt: null,
          moderation: "ok",
        };
        db.clients.push(c);
        const bonus = db.config.earn.pastEngagementLaunchBonus;
        award(op.id, "past_engagement", db.config.earn.pastEngagement + bonus, c.id, `Past engagement — ${c.clientName} (launch bonus +${bonus})`, at);
      }
    }
  }

  /* pulses: 12 weeks, participation ramping toward launch */
  for (const [wi, wk] of weekKeys.entries()) {
    const participation = 0.18 + (wi / (weekKeys.length - 1)) * 0.24; // 18% → 42%
    for (const op of db.operators) {
      const habitual = op.foundingFifty ? 0.5 : 0;
      if (!chance(Math.min(0.92, participation + habitual))) continue;
      // Current week: leave room for the live demo — only ~60% answered so far.
      if (wk === isoWeek(now) && !chance(0.6)) continue;
      if (op.id === "op_001" && wk === isoWeek(now)) continue; // demo operator hasn't pulsed this week
      const band = weighted<PulseBand>(["0","1_2","3_5","6_plus"], [0.18, 0.42, 0.3, 0.1]);
      const at = new Date(weeksAgo(weekKeys.length - 1 - wi, now));
      at.setUTCDate(at.getUTCDate() - 2);
      db.pulseResponses.push({ id: uid("pl"), operatorId: op.id, week: wk, band, via: chance(0.55) ? "email" : "app", at: at.toISOString() });
      award(op.id, "weekly_pulse", db.config.earn.weeklyPulse, wk, `Weekly pipeline pulse (${wk})`, at.toISOString());
    }
  }
  // Guarantee the demo operator a live 5-week streak (weeks -1..-5, not current).
  for (let i = 1; i <= 5; i++) {
    const wk = isoWeek(weeksAgo(i, now));
    if (!db.pulseResponses.some((p) => p.operatorId === "op_001" && p.week === wk)) {
      const at = daysAgo(7 * i - 1, now).toISOString();
      db.pulseResponses.push({ id: uid("pl"), operatorId: "op_001", week: wk, band: "3_5", via: "app", at });
      award("op_001", "weekly_pulse", db.config.earn.weeklyPulse, wk, `Weekly pipeline pulse (${wk})`, at);
    }
  }

  /* frozen demand-index snapshots for past weeks */
  for (const wk of weekKeys) {
    if (wk === isoWeek(now)) continue;
    db.demandIndexSnapshots.push(computeIndexSnapshot(db, wk));
  }

  /* deals: ~10/week across the network */
  for (const [wi, wk] of weekKeys.entries()) {
    const nDeals = 6 + Math.floor(rand() * 8);
    for (let k = 0; k < nDeals; k++) {
      const op = pick(db.operators);
      const source = weighted(SOURCES, SOURCE_WEIGHTS);
      const won = chance(source === "rn" || source === "referral" ? 0.62 : 0.38);
      const amount = round50(op.listMonthlyRate * between(0.6, 1.1));
      const at = new Date(weeksAgo(weekKeys.length - 1 - wi, now));
      at.setUTCDate(at.getUTCDate() - Math.floor(between(0, 5)));
      const id = uid("dl");
      db.deals.push({
        id,
        operatorId: op.id,
        outcome: won ? "won" : "lost",
        source,
        competitor: !won && chance(0.4) ? pick(["another fractional","full-time hire","agency","did nothing"]) : null,
        cycleWeeks: Math.max(1, Math.round(between(1, 12))),
        retainerBand: bandFor(amount),
        func: op.func,
        stage: weighted(STAGES, STAGE_WEIGHTS),
        why: chance(0.5) ? (won ? "Referral trust + fast scoping call" : "Chose a full-time hire instead") : null,
        week: wk,
        at: at.toISOString(),
        verified: source === "rn",
        moderation: "ok",
      });
      award(op.id, "deal_log", db.config.earn.dealLog, id, `Deal logged (${won ? "won" : "lost"})`, at.toISOString());
    }
  }

  /* buyer signals across the funnel; one converted with bounty paid */
  const signalStatuses = ["new","new","qualifying","intro_made","dead","converted"] as const;
  for (let k = 0; k < 16; k++) {
    const op = pick(db.operators.slice(0, 120));
    const status = k === 0 ? "converted" : pick(signalStatuses);
    const at = daysAgo(Math.floor(between(0, 28)), now).toISOString();
    const named = chance(0.55);
    const id = uid("sg");
    db.signals.push({
      id,
      operatorId: op.id,
      segment: { func: chance(0.6) ? weighted(FUNCS, FUNC_WEIGHTS) : undefined, industry: weighted(INDUSTRIES, IND_WEIGHTS), stage: weighted(STAGES, STAGE_WEIGHTS) },
      signalType: pick(["hiring_intent","budget_opened","exec_departure","asked_for_intro","expansion"] as const),
      timing: pick(["now","this_quarter","exploring"] as const),
      strength: pick(["strong","medium","weak"] as const),
      companyName: named ? `${pick(CLIENT_WORDS)} ${pick(CLIENT_SUFFIX)}` : null,
      note: pick([
        "Founder asked me who does fractional CRO work at this stage",
        "They just lost their VP Marketing and aren't backfilling full-time",
        "Board pushed for pipeline discipline; budget opened for RevOps help",
        "Raised an A, first sales hire posted, founder overwhelmed",
      ]),
      status,
      bountyPaid: status === "converted",
      at,
      statusLog: [{ status: "new", at }, ...(status !== "new" ? [{ status, at: daysAgo(Math.floor(between(0, 5)), now).toISOString() }] : [])],
    });
    award(op.id, "buyer_signal", db.config.earn.buyerSignal + (named ? db.config.earn.buyerSignalNamed : 0), id, `Buyer signal${named ? " (named)" : ""}`, at);
  }

  /* capacity pulses for current month */
  const m = monthKey(now);
  for (const op of db.operators) {
    if (!chance(0.35)) continue;
    const at = daysAgo(Math.floor(between(0, 20)), now).toISOString();
    db.capacityPulses.push({
      id: uid("cap"),
      operatorId: op.id,
      month: m,
      hoursFree: Math.round(between(0, 80) / 5) * 5,
      takingClients: chance(0.6),
      at,
    });
    award(op.id, "capacity_pulse", db.config.earn.capacityPulse, m, `Monthly capacity pulse (${m})`, at);
  }

  /* tool reviews */
  const TOOLS = ["Clay","Apollo","HubSpot","Smartlead","Attio","Gong","Instantly","LinkedIn Sales Nav"];
  for (let k = 0; k < 40; k++) {
    const op = pick(db.operators);
    const tool = pick(TOOLS);
    if (db.toolReviews.some((r) => r.operatorId === op.id && r.tool === tool)) continue;
    const at = daysAgo(Math.floor(between(0, 25)), now).toISOString();
    const withSpend = chance(0.6);
    db.toolReviews.push({
      id: uid("tr"),
      operatorId: op.id,
      tool,
      rating: Math.ceil(between(2, 5)),
      monthlySpend: withSpend ? Math.round(between(50, 900)) : null,
      note: "",
      at,
    });
    award(op.id, "tool_review", db.config.earn.toolReview + (withSpend ? db.config.earn.toolReviewSpend : 0), tool, `Tool review — ${tool}`, at);
  }

  /* question of the week: last week's (answered) + this week's (open) */
  const lastWk = isoWeek(weeksAgo(1, now));
  const thisWk = isoWeek(now);
  const q1: QuestionOfWeek = {
    id: uid("qw"),
    week: lastWk,
    question: "Have you raised your list rate in the last 6 months?",
    options: ["Yes, 10%+", "Yes, under 10%", "No", "I lowered it"],
    credits: 15,
  };
  const q2: QuestionOfWeek = {
    id: uid("qw"),
    week: thisWk,
    question: "What share of your revenue comes from your single largest client?",
    options: ["Under 25%", "25–50%", "50–75%", "Over 75%"],
    credits: 15,
  };
  db.questions.push(q1, q2);
  for (const op of db.operators) {
    if (!chance(0.3)) continue;
    const at = daysAgo(Math.floor(between(3, 9)), now).toISOString();
    db.questionAnswers.push({ id: uid("qa"), operatorId: op.id, questionId: q1.id, option: weighted([0,1,2,3], [0.2,0.3,0.42,0.08]), at });
    // QoW credits expire at the end of next edition.
    const exp = daysFromNow(45, now).toISOString();
    award(op.id, "question_of_week", q1.credits, q1.id, `Question of the week (${lastWk})`, at, exp);
  }

  /* a few unlocks for the current edition */
  for (const op of db.operators.slice(0, 40)) {
    if (!chance(0.3)) continue;
    const asset = pick(["realization_rate","retainers_by_stage","win_rate_by_source"] as const);
    const cost = db.config.spend[asset];
    const at = daysAgo(Math.floor(between(0, 4)), now).toISOString();
    db.unlocks.push({ id: uid("ul"), operatorId: op.id, edition: m, asset, cost, at });
    db.credits.push({ id: uid("cr"), operatorId: op.id, action: "spend", amount: -cost, ref: `${m}:${asset}`, note: `Unlocked ${asset} (${m})`, at, expiresAt: null });
  }

  /* one reconciliation run from "last month" (admin, Bill.com CSV) */
  const verifiedRn = db.clients.filter((c) => c.rnPlaced && c.verified);
  db.billcomReconciliations.push({
    id: uid("rc"),
    uploadedAt: daysAgo(3, now).toISOString(),
    uploadedBy: "admin",
    month: monthKey(daysAgo(30, now)),
    rows: verifiedRn.length,
    matched: verifiedRn.length,
    flagged: 0,
    detail: verifiedRn.slice(0, 25).map((c) => ({
      clientId: c.id,
      invoiceAmount: c.actuals!.actualMonthly,
      reportedAmount: c.actuals!.actualMonthly,
      result: "verified" as const,
    })),
  });

  db.meta.seededAt = now.toISOString();

  const out = path.join(process.cwd(), "data", "seed.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(db), "utf8");

  const activated = new Set(db.clients.filter((c) => c.actuals).map((c) => c.operatorId)).size;
  console.log(`Seeded ${db.operators.length} operators, ${db.clients.length} engagements (${activated} operators with actuals), ${db.pulseResponses.length} pulses, ${db.deals.length} deals, ${db.signals.length} signals → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
