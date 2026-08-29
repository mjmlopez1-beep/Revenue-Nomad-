import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import { isoWeek } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Create or replace the question of the week (admin-configured, spec §3.1). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const { question, options, credits, week } = (await req.json()) as {
    question: string;
    options: string[];
    credits: number;
    week?: string;
  };
  if (!question?.trim() || !Array.isArray(options) || options.filter((o) => o?.trim()).length < 2)
    return NextResponse.json({ error: "Need a question and 2+ options" }, { status: 400 });
  const db = await loadDb();
  const wk = week || isoWeek();
  const existing = db.questions.find((q) => q.week === wk);
  const clean = {
    week: wk,
    question: question.trim().slice(0, 200),
    options: options.map((o) => o.trim().slice(0, 60)).filter(Boolean).slice(0, 6),
    credits: Math.min(20, Math.max(10, Math.round(credits) || 15)), // spec: +10 to +20
  };
  if (existing) Object.assign(existing, clean);
  else db.questions.push({ id: uid("qw"), ...clean });
  await saveDb(db);
  return NextResponse.json({ ok: true });
}
