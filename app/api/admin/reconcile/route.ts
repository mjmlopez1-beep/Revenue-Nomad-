import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import { monthKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * v1 Bill.com verification (spec §6): admin exports invoice data for
 * RN-placed engagements as CSV and uploads it here. Rows match on client id
 * (or operator email + client name); reported actuals within 5% of the
 * invoiced amount are marked verified. The v1.5 API sync replaces the upload
 * with the same matching logic.
 *
 * CSV columns (header optional, comma-separated):
 *   client_id,invoice_amount
 *   — or —
 *   operator_email,client_name,invoice_amount
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const { csv, month } = (await req.json()) as { csv: string; month?: string };
  if (!csv?.trim()) return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  const db = await loadDb();

  const detail: { clientId: string; invoiceAmount: number; reportedAmount: number; result: "verified" | "mismatch" | "no_report" }[] = [];
  let matched = 0;
  let flagged = 0;
  const lines = csv.trim().split(/\r?\n/);
  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2 || /invoice|amount/i.test(cells[cells.length - 1])) continue; // header
    const amount = parseFloat(cells[cells.length - 1].replace(/[$\s]/g, ""));
    if (!isFinite(amount) || amount <= 0) continue;

    let client = db.clients.find((c) => c.id === cells[0] && c.rnPlaced);
    if (!client && cells.length >= 3) {
      const op = db.operators.find((o) => o.email.toLowerCase() === cells[0].toLowerCase());
      if (op)
        client = db.clients.find(
          (c) => c.operatorId === op.id && c.rnPlaced && c.clientName.toLowerCase() === cells[1].toLowerCase()
        );
    }
    if (!client) continue;

    if (!client.actuals) {
      detail.push({ clientId: client.id, invoiceAmount: amount, reportedAmount: 0, result: "no_report" });
      continue;
    }
    const reported = client.actuals.actualMonthly;
    if (Math.abs(reported - amount) / amount <= 0.05) {
      client.verified = true;
      matched++;
      detail.push({ clientId: client.id, invoiceAmount: amount, reportedAmount: reported, result: "verified" });
    } else {
      client.verified = false;
      flagged++;
      detail.push({ clientId: client.id, invoiceAmount: amount, reportedAmount: reported, result: "mismatch" });
    }
  }

  const rec = {
    id: uid("rc"),
    uploadedAt: new Date().toISOString(),
    uploadedBy: "admin",
    month: month || monthKey(),
    rows: detail.length,
    matched,
    flagged,
    detail: detail.slice(0, 200),
  };
  db.billcomReconciliations.push(rec);
  await saveDb(db);
  return NextResponse.json({ ok: true, reconciliation: rec });
}
