/**
 * Clean the private seed in place (lib/firmRemoval.ts cleanSeed): industry, employees and
 * revenue take their standard value (lib/industryMap.ts: "< $1M" is Under $1M, "51-200" is
 * 51–200), each HQ gets its country and region, and fractional firms, agencies,
 * marketplaces, staffing firms and placeholders ("Contractor") go with their seats and people.
 *
 *   node --import tsx scripts/clean-intel-seed.mts [--seed data/intel-seed.json] [--seal]
 *
 * Prints counts and the removed company names (never a person's name: a company named after
 * its seat holder is counted, not named). --seal re-seals data/intel-seed.enc afterwards.
 */
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { cleanSeed } from "../lib/firmRemoval.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--seed");
const seedPath = at >= 0 ? args[at + 1] : "data/intel-seed.json";
const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const before = { companies: seed.companies.length, seats: seed.engagements.length, people: (seed.contacts ?? []).length };
const st = cleanSeed(seed);
writeFileSync(seedPath, JSON.stringify(seed, null, 1));

const named = (x: { name: string; reason: string }) => (x.reason === "named after its seat holder" ? "(named after its seat holder)" : x.name);
console.log(`values moved to their standard value: ${JSON.stringify(st.remapped)}`);
console.log(`values nothing maps (left empty): ${JSON.stringify(st.unmapped)}`);
console.log(`companies with a country from their HQ: ${st.places}`);
console.log(`firms removed: ${st.removed.companies} companies, ${st.removed.seats} seats, ${st.removed.people} people`);
for (const [why, n] of Object.entries(st.removed.reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${why}: ${n}`);
if (st.removed.names.length) console.log(`removed: ${st.removed.names.map(named).join(" | ")}`);
if (st.kept.length) console.log(`kept for admin review: ${st.kept.map((k) => `${k.reason === "named after its seat holder" ? "(named after its seat holder)" : k.name} (${k.reason})`).join(" | ")}`);
console.log(`seed was ${before.companies} companies, ${before.seats} seats, ${before.people} people; now ${seed.companies.length}, ${seed.engagements.length}, ${(seed.contacts ?? []).length}`);
if (args.includes("--seal") && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
