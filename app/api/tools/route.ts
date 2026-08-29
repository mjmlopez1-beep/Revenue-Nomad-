import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award, toolReviewCount } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** GTM tool review: +10 (+5 with monthly spend), once per tool, max 10. */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { tool, rating, monthlySpend, note } = (await req.json()) as {
    tool: string;
    rating: number;
    monthlySpend?: number;
    note?: string;
  };
  const cfg = db.config.earn;
  if (!tool?.trim() || !(rating >= 1 && rating <= 5))
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (toolReviewCount(db, op.id) >= cfg.toolReviewCap)
    return NextResponse.json({ error: `Tool review cap (${cfg.toolReviewCap}) reached` }, { status: 400 });
  const name = tool.trim().slice(0, 60);
  if (db.toolReviews.some((r) => r.operatorId === op.id && r.tool.toLowerCase() === name.toLowerCase()))
    return NextResponse.json({ error: "Already reviewed this tool" }, { status: 409 });
  db.toolReviews.push({
    id: uid("tr"),
    operatorId: op.id,
    tool: name,
    rating: Math.round(rating),
    monthlySpend: monthlySpend && monthlySpend > 0 ? Math.round(monthlySpend) : null,
    note: (note ?? "").slice(0, 300),
    at: new Date().toISOString(),
  });
  const bonus = monthlySpend && monthlySpend > 0 ? cfg.toolReviewSpend : 0;
  const res = award(db, op.id, "tool_review", cfg.toolReview + bonus, name, `Tool review — ${name}`);
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded: res.amount });
}
