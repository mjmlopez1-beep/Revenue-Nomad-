#!/usr/bin/env node
/**
 * Add Revenue Nomad's Rate Index points to the private seed, so rate benchmarks have numbers
 * from day one. Reads data/rate-index.private.json (an array of { fn, hourly, hours, revenue })
 * and data/intel-seed.json, sets seed.rateIndex, and writes the seed back. Both files are
 * git-ignored. Run scripts/seal-intel-seed.mjs afterward to refresh data/intel-seed.enc.
 *
 * The points are anonymous: a GTM function, an hourly rate, hours a month and the client's
 * revenue band. No names, emails, clients or free text. This script prints counts only.
 *
 *   node scripts/add-rate-index.mjs
 *   node scripts/add-rate-index.mjs <rate-index.json> <intel-seed.json>
 */
import { readFileSync, writeFileSync } from "fs";

const FUNCTIONS = ["Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "AI GTM", "Executive", "Other"];
const REVENUE = ["Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"];

const indexPath = process.argv[2] || "data/rate-index.private.json";
const seedPath = process.argv[3] || "data/intel-seed.json";

const raw = JSON.parse(readFileSync(indexPath, "utf8"));
if (!Array.isArray(raw)) throw new Error(`${indexPath} must be an array of rate points`);

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const points = [];
let dropped = 0;
for (const p of raw) {
  const hourly = num(p?.hourly);
  if (!hourly) {
    dropped++;
    continue;
  }
  // Only these four keys ever reach the seed, whatever else the input carries.
  points.push({
    fn: FUNCTIONS.includes(p.fn) ? p.fn : "Other",
    hourly,
    hours: num(p.hours),
    revenue: REVENUE.includes(p.revenue) ? p.revenue : null,
  });
}
if (!points.length) throw new Error(`${indexPath} has no usable rate points`);

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
if (!Array.isArray(seed.members) || !Array.isArray(seed.engagements)) throw new Error(`${seedPath} does not look like the seed`);
const before = Array.isArray(seed.rateIndex) ? seed.rateIndex.length : 0;
seed.rateIndex = points;
writeFileSync(seedPath, JSON.stringify(seed, null, 1));

const byFn = {};
for (const p of points) byFn[p.fn] = (byFn[p.fn] || 0) + 1;
console.log(`rateIndex: ${points.length} points (was ${before}), ${dropped} dropped`);
console.log(
  `  with hours a month: ${points.filter((p) => p.hours).length}, with a revenue band: ${points.filter((p) => p.revenue).length}`
);
for (const [fn, n] of Object.entries(byFn).sort((a, b) => b[1] - a[1])) console.log(`  ${fn}: ${n}`);
console.log(`seed: ${seed.members.length} members, ${seed.companies.length} companies, ${seed.engagements.length} engagements`);
