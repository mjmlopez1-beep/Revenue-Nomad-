/**
 * One run of the About filler (lib/about/run.ts) against a data folder, outside the server.
 *
 *   RN_DATA_DIR=/path/to/data RN_INTEL_SEED_KEY=... npx tsx scripts/about-run.mts [--limit N] [--dry]
 *
 * RN_DATA_DIR holds intel.json (the state). The seed comes from RN_INTEL_SEED, <data>/intel-seed.json,
 * data/intel-seed.json, or data/intel-seed.enc opened with RN_INTEL_SEED_KEY, as for the server.
 * Stop the server on that data folder first: two processes writing one intel.json lose each
 * other's changes. A run carries on where the last one stopped (each company's status is in the
 * state), so it can be stopped with Ctrl-C and started again.
 *
 *   --limit N   read at most N companies
 *   --dry       read the sites and print what would be stored, store nothing
 *
 * It reads real websites: run it where the internet is open (it is not in the sandbox).
 * RN_ABOUT does not need to be set here.
 */
const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number.parseInt(args[limitAt + 1] ?? "", 10) : undefined;
const dry = args.includes("--dry");
if (!process.env.RN_DATA_DIR) {
  console.error("Set RN_DATA_DIR to the data folder (the one holding intel.json).");
  process.exit(2);
}
if (limit !== undefined && !(limit >= 0)) {
  console.error("--limit takes a number.");
  process.exit(2);
}

const { aboutTargets } = await import("../lib/table");
const { aboutOne, runAbout } = await import("../lib/about/run");

if (dry) {
  const targets = (await aboutTargets()).slice(0, limit ?? 25);
  console.log(`${targets.length} companies (dry run, nothing stored)`);
  for (const t of targets) {
    const o = await aboutOne(t);
    console.log(`${o.s.padEnd(8)} ${t.domain.padEnd(32)} ${o.text ? o.text.slice(0, 140) : o.why ?? ""}`);
  }
  process.exit(0);
}

const run = await runAbout({
  limit,
  onBatch: (r) => console.log(`  ${r.done} of ${r.total}: filled ${r.filled}, unchanged ${r.unchanged}, skipped ${r.skipped}, failed ${r.failed}`),
});
console.log(`Done: ${run.total} companies, filled ${run.filled}, unchanged ${run.unchanged}, skipped ${run.skipped}, failed ${run.failed}.`);
process.exit(0);
