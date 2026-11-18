/**
 * How many radar signals a member would get a day, on the real seed, over the last 90 days.
 * Prints counts only: never a company, a person or a member.
 *
 *   npx tsx scripts/radar-estimate.mts            (reads data/intel-seed.json)
 *
 * One made-up member per main function (Sales, Marketing, Finance, RevOps), each with a typical
 * Ideal Fractional Profile (United States, 11–500 people) and the suggested "hired before"
 * functions. The seed carries no times for when a seat came in or when an end was recorded, so
 * this dates each one by its own month: a leadership seat "came in" in its start month and an
 * ended seat's end "was recorded" in its end month, on a day spread across that month. A start
 * with a year alone can't be dated and is left out. Open roles are the seed's own (the weekly
 * scan's roles live in the running state, not the seed). It runs the radar's own detection and
 * matching (lib/radar) for each of the 90 days, on a copy of the seed in a temporary folder.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const src = process.env.RN_INTEL_SEED || path.join(process.cwd(), "data", "intel-seed.json");
const seed = JSON.parse(readFileSync(src, "utf8")) as { builtAt: string; members: unknown[]; engagements: { id: string; fields: Record<string, string>; addedAt?: string }[] };
const DAY = 24 * 60 * 60 * 1000;
const nowMs = Date.now();
/** A day inside the month ("2026-08"), the same for a seat every run. */
const dayIn = (ym: string, id: string) => {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const k = createHash("sha256").update(id).digest()[0] % days;
  return Date.UTC(y, m - 1, 1 + k, 12);
};
const values: Record<string, { value: string; by: string; at: string; status: "live" }> = {};
let dated = 0;
for (const e of seed.engagements) {
  const start = /^\d{4}-\d{2}$/.test(e.fields.start ?? "") ? e.fields.start : null;
  if (start) {
    e.addedAt = new Date(dayIn(start, e.id)).toISOString();
    dated++;
  }
  const end = /^\d{4}-\d{2}$/.test(e.fields.end ?? "") ? e.fields.end : null;
  if (end && e.fields.status === "Ended") values[`${e.id}.end`] = { value: end, by: "estimate", at: new Date(dayIn(end, e.id + ":end")).toISOString(), status: "live" };
}
const dir = mkdtempSync(path.join(tmpdir(), "rn-radar-est-"));
const MEMBERS = ["Sales", "Marketing", "Finance", "RevOps"].map((fn) => ({ id: `mem_est_${fn.toLowerCase()}`, fn }));
const ICP = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({ ledger: [], values, unlocks: {}, profiles: Object.fromEntries(MEMBERS.map((m) => [m.id, { function: m.fn, onboarded: true, icp: ICP }])) }),
);
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "intel-seed.json"), RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1" });
for (const k of ["RN_BILLING", "RESEND_API_KEY", "RN_SCAN", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];

async function main() {
  const t = await import("../lib/table");
  const sig = await import("../lib/radar/signals");
  const match = await import("../lib/radar/match");
  const [sd, s] = await Promise.all([t.loadSeed(), t.loadState()]);
  console.log(`seed: ${seed.engagements.length} seats, ${dated} dated by their start month, ${Object.keys(values).length} ended seats dated by their end month`);
  const profiles = MEMBERS.map((m) => ({ ...m, p: match.profileOf(sd, s, m.id, m.fn) }));
  const totals = new Map(profiles.map((x) => [x.fn, { all: 0, days: 0, max: 0, byKind: {} as Record<string, number> }]));
  for (let d = 0; d < 90; d++) {
    const end = nowMs - d * DAY;
    const all = sig.detectSignals(sd, s, end - DAY, end);
    for (const x of profiles) {
      const mine = match.signalsFor(all, x.p);
      const tt = totals.get(x.fn)!;
      tt.all += mine.length;
      if (mine.length) tt.days++;
      tt.max = Math.max(tt.max, mine.length);
      for (const m of mine) tt.byKind[m.kind] = (tt.byKind[m.kind] ?? 0) + 1;
    }
  }
  for (const x of profiles) {
    const tt = totals.get(x.fn)!;
    console.log(
      `${x.fn.padEnd(10)} watches ${x.p.before.join(", ").padEnd(32)} ${(tt.all / 90).toFixed(2)} signals a day on average (${tt.all} in 90 days; ${tt.days} days with at least one; at most ${tt.max} in a day; ${Object.entries(tt.byKind).map(([k, n]) => `${k} ${n}`).join(", ") || "none"})`,
    );
  }
}
main()
  .catch((e) => console.error(e))
  .finally(() => rmSync(dir, { recursive: true, force: true }));
