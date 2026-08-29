import { verifyPulseToken } from "@/lib/sign";
import { loadDb, saveDb, uid } from "@/lib/store";
import { award } from "@/lib/credits";
import { computeIndexSnapshot } from "@/lib/aggregate";
import { balance } from "@/lib/credits";
import { isoWeek } from "@/lib/time";
import { BAND_PROMPTS } from "./labels";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * The in-email one-click pulse (spec §2.2/§10): each button in the Tuesday
 * Tape Drop email carries an HMAC-signed token encoding operator+week+band.
 * Tapping it records the answer and grants credits with NO login and NO
 * session — literally one click on mobile. Re-taps are idempotent.
 */
export default async function PulsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = verifyPulseToken(token);
  const db = await loadDb();
  const week = isoWeek();

  let heading = "That link didn't check out.";
  let detail = "The link may be malformed. Open the app and answer the pulse there instead.";
  let awarded = 0;
  let indexTotal: number | null = null;
  let ok = false;

  if (t) {
    const op = db.operators.find((o) => o.id === t.op);
    if (!op) {
      detail = "We couldn't find your operator profile.";
    } else if (t.week !== week) {
      heading = "This pulse week has closed.";
      detail = "One-click links are valid only for the week they were sent. This week's pulse is waiting in the app.";
    } else {
      const existing = db.pulseResponses.find((p) => p.operatorId === op.id && p.week === week);
      if (existing) {
        ok = true;
        heading = "Already counted this week.";
        detail = `You answered "${BAND_PROMPTS[existing.band]}" earlier — one pulse per week, one payment per question.`;
        indexTotal = computeIndexSnapshot(db, week).total;
      } else {
        db.pulseResponses.push({
          id: uid("pl"),
          operatorId: op.id,
          week,
          band: t.band as never,
          via: "email",
          at: new Date().toISOString(),
        });
        const res = award(db, op.id, "weekly_pulse", db.config.earn.weeklyPulse, week, `Weekly pipeline pulse (${week}, via email)`);
        awarded = res.amount;
        const snap = computeIndexSnapshot(db, week);
        const i = db.demandIndexSnapshots.findIndex((s) => s.week === week);
        if (i >= 0) db.demandIndexSnapshots[i] = snap;
        else db.demandIndexSnapshots.push(snap);
        await saveDb(db);
        ok = true;
        heading = `Counted. +${awarded} credits.`;
        detail = `You answered "${BAND_PROMPTS[t.band]}". The current-week Demand Index is now unlocked for you.`;
        indexTotal = snap.total;
      }
    }
  }

  return (
    <div className="pulse-landing">
      <div className={`pulse-card ${ok ? "ok" : "bad"}`}>
        <div className="pulse-mark">{ok ? "✓" : "!"}</div>
        <h1>{heading}</h1>
        <p>{detail}</p>
        {indexTotal !== null && (
          <div className="pulse-index">
            <span className="pulse-index-num">{indexTotal}</span>
            <span className="pulse-index-label">active buyer conversations across the network this week</span>
          </div>
        )}
        <Link href="/dashboard" className="btn">Open the Benchmark</Link>
      </div>
    </div>
  );
}
