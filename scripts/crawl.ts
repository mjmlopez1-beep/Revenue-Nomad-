import { runCrawl } from "../lib/crawler";

runCrawl()
  .then((run) => {
    console.log(`Crawl finished at ${run.at}`);
    for (const r of run.results) {
      console.log(
        `  ${r.source}: fetched ${r.fetched}, matched ${r.matched}${r.error ? ` — ERROR: ${r.error}` : ""}`
      );
    }
    console.log(`  → ${run.added} added, ${run.updated} updated`);
  })
  .catch((err) => {
    console.error("Crawl failed:", err);
    process.exit(1);
  });
