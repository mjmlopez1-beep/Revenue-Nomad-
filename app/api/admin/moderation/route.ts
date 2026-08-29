import { NextResponse } from "next/server";
import { loadDb, saveDb } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import { award, inLaunchWindow } from "@/lib/credits";

export const dynamic = "force-dynamic";

/**
 * Moderation queue: plausibility-flagged rows sit here with credits held
 * (spec §6). Clearing a row releases the held credits; rejecting removes it.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const { kind, id, decision } = (await req.json()) as {
    kind: "client" | "deal";
    id: string;
    decision: "clear" | "reject";
  };
  const db = await loadDb();
  const cfg = db.config.earn;

  if (kind === "client") {
    const c = db.clients.find((x) => x.id === id);
    if (!c || c.moderation !== "held") return NextResponse.json({ error: "Not held" }, { status: 404 });
    if (decision === "clear") {
      c.moderation = "ok";
      if (c.status === "past") {
        const bonus = inLaunchWindow(db) ? cfg.pastEngagementLaunchBonus : 0;
        award(db, c.operatorId, "past_engagement", cfg.pastEngagement + bonus, c.id, `Past engagement — ${c.clientName} (cleared by moderation)`);
      } else {
        award(db, c.operatorId, "engagement_actuals", cfg.engagementActuals, c.id, `Engagement actuals — ${c.clientName} (cleared by moderation)`);
      }
    } else {
      db.clients = db.clients.filter((x) => x.id !== id);
    }
  } else {
    const d = db.deals.find((x) => x.id === id);
    if (!d || d.moderation !== "held") return NextResponse.json({ error: "Not held" }, { status: 404 });
    if (decision === "clear") {
      d.moderation = "ok";
      const bonus = d.why?.trim() ? cfg.dealLogWhy : 0;
      award(db, d.operatorId, "deal_log", cfg.dealLog + bonus, d.id, `Deal logged (${d.outcome}, cleared by moderation)`);
    } else {
      db.deals = db.deals.filter((x) => x.id !== id);
    }
  }
  await saveDb(db);
  return NextResponse.json({ ok: true });
}
