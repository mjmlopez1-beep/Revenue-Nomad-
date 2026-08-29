/**
 * Tuesday Tape Drop sender. Run from cron every Tuesday morning:
 *   0 14 * * 2  npm run tape-drop            (all operators)
 *   npm run tape-drop -- --limit 3           (preview: first N operators)
 *   npm run tape-drop -- --to op_001         (one operator)
 *
 * Without RESEND_API_KEY the emails land in data/outbox/*.html so the
 * one-click links can be tested locally end to end.
 *
 * Also freezes last week's Demand Index snapshot (the number the email leads
 * with) so history is stable even as this week's pulses come in.
 */
import { loadDb, saveDb } from "../lib/store";
import { composeTapeDrop, sendEmail } from "../lib/email";
import { computeIndexSnapshot } from "../lib/aggregate";
import { isoWeek, weeksAgo } from "../lib/time";

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const toIdx = args.indexOf("--to");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const only = toIdx >= 0 ? args[toIdx + 1] : null;

  const db = await loadDb();

  // Freeze last week's snapshot.
  const lastWeek = isoWeek(weeksAgo(1));
  if (!db.demandIndexSnapshots.some((s) => s.week === lastWeek)) {
    db.demandIndexSnapshots.push(computeIndexSnapshot(db, lastWeek));
    await saveDb(db);
  }

  const targets = db.operators.filter((o) => (only ? o.id === only : true)).slice(0, limit);
  let sent = 0;
  let outbox = 0;
  for (const op of targets) {
    const { subject, html } = composeTapeDrop(db, op);
    const result = await sendEmail(op.email, subject, html);
    if (result === "sent") sent++;
    else outbox++;
  }
  console.log(`Tape Drop ${isoWeek()}: ${sent} sent, ${outbox} written to data/outbox/ (${targets.length} operators).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
