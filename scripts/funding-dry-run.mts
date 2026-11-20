/**
 * A dry run of the daily funding run (lib/funding) against live EDGAR: reads the last few filing
 * days, matches them to the companies on Merlin and prints the counts. Keeps nothing, and prints
 * no company or person: counts only.
 *
 *   npx tsx scripts/funding-dry-run.mts [days]        (default 5; reads the seed the server reads)
 *
 * It needs www.sec.gov (and efts.sec.gov as a fallback) reachable from where it runs.
 */
const days = Math.max(1, Math.min(30, Number(process.argv[2]) || 5));
const { runFunding } = await import("../lib/funding/run");
delete process.env.RN_SCAN_TEST;
const r = await runFunding({ dryRun: true, lookback: days });
const c = r.counts;
if (!c) {
  console.log("Nothing ran.");
  process.exit(1);
}
console.log(`Filing days read: ${c.days.length} of ${days}`);
console.log(`Form D filings listed: ${c.filings}`);
console.log(`Documents fetched and read: ${c.read}`);
console.log(`Matched to a company on Merlin: ${c.matched} (about ${(c.matched / Math.max(1, days)).toFixed(2)} a calendar day)`);
for (const [k, n] of Object.entries(c.unmatched).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) console.log(`  unmatched, ${k}: ${n}`);
console.log(`Requests failed: ${c.failed}${c.error ? `; stopped: ${c.error}` : ""}`);
