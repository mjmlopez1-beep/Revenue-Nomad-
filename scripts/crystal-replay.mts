/**
 * Crystal Ball's daily flow, replayed on the real seed (data/intel-seed.json, git-ignored, never
 * committed) as if the daily run had gone out every day. Prints counts only: never a company, a
 * person or a member.
 *
 *   npx tsx scripts/crystal-replay.mts [--days 60] [--end 2026-11-21] [--json out.json]
 *
 * One made-up member per function (FUNCTIONS but Other), twice: at a typical Ideal Fractional
 * Profile (United States, 11–500 people) and at "any company". Each simulated day runs at 13:00 UTC,
 * looks back to the previous day's run, and does what the morning run does: the radar's own
 * detection (lib/radar/signals.ts), scoring (lib/radar/match.ts) and the daily selection
 * (match.ts pickDaily when it exists, else every High and Medium signal not sent before). What was
 * sent is remembered from day to day, as the run remembers it.
 *
 * The seed is the only data here: the running state's open roles, leadership reads, career feeds,
 * Form D matches and headcount history are not in it, so the signals that read them (role,
 * departure, sales-build, funding, arrival, team-build, headcount, gap) count 0 in this replay.
 * That is a floor, not the production number. A seat with no addedAt came in with the seed (builtAt).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const DAYS = Number(arg("--days") ?? 60);
const END = arg("--end") ?? new Date().toISOString().slice(0, 10);
const JSON_OUT = arg("--json");

const seedPath = process.env.RN_REPLAY_SEED || path.resolve(process.cwd(), "data/intel-seed.json");
if (!existsSync(seedPath)) {
  console.log("No data/intel-seed.json here: the replay runs on the real seed only.");
  process.exit(0);
}
const DAY = 86_400_000;
const ICP = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };

const dir = mkdtempSync(path.join(tmpdir(), "rn-replay-"));
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_ID_SECRET: process.env.RN_ID_SECRET || "replay", RN_SCAN_TEST: "1" });
for (const k of ["RN_BILLING", "RESEND_API_KEY", "RN_SCAN", "RN_BACKUP_S3_ENDPOINT", "RN_FUNDING", "RN_LEADERS"]) delete process.env[k];
globalThis.fetch = (async () => new Response("no network", { status: 599 })) as typeof fetch;

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const zero = (xs: number[]) => (xs.length ? xs.filter((x) => x === 0).length / xs.length : 0);

async function main() {
  const { FUNCTIONS } = await import("../lib/tableFields");
  const fns = FUNCTIONS.filter((f) => f !== "Other");
  const members = fns.flatMap((fn) => [
    { id: `mem_replay_${fn.replace(/\W+/g, "").toLowerCase()}_icp`, fn, any: false },
    { id: `mem_replay_${fn.replace(/\W+/g, "").toLowerCase()}_any`, fn, any: true },
  ]);
  writeFileSync(
    path.join(dir, "intel.json"),
    JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: {}, profiles: Object.fromEntries(members.map((m) => [m.id, { function: m.fn, onboarded: true, icp: m.any ? null : ICP }])) }),
  );
  const t = await import("../lib/table");
  const S = await import("../lib/radar/signals");
  const M = await import("../lib/radar/match");
  const Ty = (await import("../lib/radar/types")) as { RADAR_CARRY_DAYS?: number };
  const [seed, s] = await Promise.all([t.loadSeed(), t.loadState()]);
  // As if the seed's companies were on file when the replay starts (the universe uploaded): a seat with no addedAt
  // came in with the seed, so the seed is dated the replay's first day. Seats with their own addedAt keep it.
  const firstMs = Date.parse(`${END}T13:00:00.000Z`) - DAYS * DAY;
  const builtWas = seed.builtAt;
  if (!process.argv.includes("--seed-date")) seed.builtAt = new Date(Math.min(firstMs, Date.parse(seed.builtAt ?? "") || firstMs)).toISOString();
  const counts = S.observedTransitions(seed, s);
  const pick = (M as { pickDaily?: (typeof M)["pickDaily"] }).pickDaily;
  const standingOf = (S as { standingSignals?: (typeof S)["standingSignals"] }).standingSignals;
  const profiles = members.map((m) => ({ ...m, p: { ...M.profileOf(seed, s, m.id, m.fn), ...(m.any ? { any: true } : {}) } }));
  type Tally = { fresh: number[]; sent: number[]; sentCos: number[]; kinds: Record<string, number>; bands: Record<string, number>; sentKinds: Record<string, number>; still: number };
  const tallies = new Map(profiles.map((x) => [x.id, { fresh: [], sent: [], sentCos: [], kinds: {}, bands: {}, sentKinds: {}, still: 0 } as Tally]));
  const memory = new Map(profiles.map((x) => [x.id, { sent: {} as Record<string, string>, shown: {} as Record<string, string> }]));
  const dom: Record<number, number> = {};
  const endMs = Date.parse(`${END}T13:00:00.000Z`);
  for (let d = DAYS - 1; d >= 0; d--) {
    const nowMs = endMs - d * DAY;
    const nowIso = new Date(nowMs).toISOString();
    const sinceMs = nowMs - DAY;
    // The run looks back past its last run for unsent events the cap held back (RADAR_CARRY_DAYS), when it does.
    const carry = pick ? (Ty.RADAR_CARRY_DAYS ?? 1) : 1;
    const all = S.detectSignals(seed, s, nowMs - carry * DAY, nowMs);
    const standing = standingOf ? standingOf(seed, s, nowMs) : [];
    for (const x of profiles) {
      const tl = tallies.get(x.id)!;
      const mem = memory.get(x.id)!;
      const ctx = { counts, nowMs };
      const mine = M.signalsFor(all, x.p, ctx).filter((y) => !mem.sent[y.key] && !(y.of && mem.sent[y.of]));
      const today = mine.filter((y) => y.atMs > sinceMs);
      tl.fresh.push(today.length);
      for (const y of today) {
        tl.kinds[y.kind] = (tl.kinds[y.kind] ?? 0) + 1;
        tl.bands[y.band] = (tl.bands[y.band] ?? 0) + 1;
        if (!x.any && y.reopen) dom[new Date(y.atMs).getUTCDate()] = (dom[new Date(y.atMs).getUTCDate()] ?? 0) + 1;
      }
      let send: typeof mine;
      if (pick) {
        const still = M.signalsFor(standing, x.p, ctx).filter((y) => !mem.sent[y.key]);
        send = pick(mine, still, mem, nowMs).send;
      } else send = M.deliverable(mine);
      for (const y of send) {
        mem.sent[y.key] = nowIso;
        mem.shown[y.companyId] = nowIso;
        tl.sentKinds[y.kind] = (tl.sentKinds[y.kind] ?? 0) + 1;
        if (y.standing) tl.still++;
      }
      tl.sent.push(send.length);
      tl.sentCos.push(new Set(send.map((y) => y.companyId)).size);
    }
  }
  const f2 = (n: number) => n.toFixed(2);
  const pct = (n: number) => `${Math.round(100 * n)}%`;
  console.log(`Replay: ${DAYS} days to ${END}, ${seed.companies.length} companies, ${seed.engagements.length} seats. Counts only.`);
  console.log(`Seats with no addedAt read as on file from ${seed.builtAt?.slice(0, 10)} (the seed says ${builtWas?.slice(0, 10)}; --seed-date keeps the seed's).`);
  console.log(`Selection: ${pick ? "pickDaily (cap and floor)" : "every High and Medium signal not sent before"}; standing states: ${standingOf ? "yes" : "none"}.`);
  console.log("");
  console.log("Function            | profile | fresh/day med mean zero% | delivered cos/day med mean zero% | of them standing | fresh by kind | fresh by band");
  const out: Record<string, unknown>[] = [];
  for (const x of profiles) {
    const tl = tallies.get(x.id)!;
    const row = {
      fn: x.fn,
      profile: x.any ? "any" : "icp",
      fresh: { median: median(tl.fresh), mean: mean(tl.fresh), zero: zero(tl.fresh) },
      delivered: { median: median(tl.sentCos), mean: mean(tl.sentCos), zero: zero(tl.sentCos), signals: mean(tl.sent) },
      standing: tl.still,
      kinds: tl.kinds,
      bands: tl.bands,
      sentKinds: tl.sentKinds,
    };
    out.push(row);
    console.log(
      `${x.fn.padEnd(19)} | ${row.profile.padEnd(7)} | ${String(row.fresh.median).padStart(4)} ${f2(row.fresh.mean).padStart(6)} ${pct(row.fresh.zero).padStart(5)} | ${String(row.delivered.median).padStart(4)} ${f2(row.delivered.mean).padStart(6)} ${pct(row.delivered.zero).padStart(5)} | ${String(tl.still).padStart(5)} | ${Object.entries(tl.kinds).map(([k, n]) => `${k} ${n}`).join(", ") || "none"} | ${Object.entries(tl.bands).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
    );
  }
  console.log("");
  console.log("Delivered signals by kind (fresh events and standing states), per member:");
  for (const x of profiles) {
    const tl = tallies.get(x.id)!;
    console.log(`  ${x.fn.padEnd(19)} ${(x.any ? "any" : "icp").padEnd(4)} ${Object.entries(tl.sentKinds).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  }
  console.log("");
  console.log(`Re-surfaced hires (icp members) by day of month: ${Object.entries(dom).map(([k, n]) => `${k}:${n}`).join(" ") || "none"}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ days: DAYS, end: END, rows: out, dayOfMonth: dom }, null, 1));
}

main()
  .catch((e) => {
    console.error("the replay threw", e);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
