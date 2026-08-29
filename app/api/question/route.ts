import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award } from "@/lib/credits";
import { daysFromNow } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Question of the week — answers pay expiring credits (spec §2.2). */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { questionId, option } = (await req.json()) as { questionId: string; option: number };
  const q = db.questions.find((x) => x.id === questionId);
  if (!q || !(option >= 0 && option < q.options.length))
    return NextResponse.json({ error: "Bad question/option" }, { status: 400 });
  if (db.questionAnswers.some((a) => a.operatorId === op.id && a.questionId === q.id))
    return NextResponse.json({ error: "Already answered" }, { status: 409 });
  db.questionAnswers.push({ id: uid("qa"), operatorId: op.id, questionId: q.id, option, at: new Date().toISOString() });
  const res = award(db, op.id, "question_of_week", q.credits, q.id, `Question of the week (${q.week})`, {
    expiresAt: daysFromNow(45).toISOString(), // expiring credits: use them or lose them
  });
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded: res.amount });
}
