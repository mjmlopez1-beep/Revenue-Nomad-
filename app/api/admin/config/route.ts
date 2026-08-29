import { NextResponse } from "next/server";
import { loadDb, saveDb } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import type { EconomyConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Economy retune — every earn/spend/gate value editable without a deploy. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const patch = (await req.json()) as Partial<EconomyConfig>;
  const db = await loadDb();
  const num = (v: unknown, fallback: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : fallback);
  const deepMergeNumbers = <T extends Record<string, unknown>>(base: T, over: Partial<T> | undefined): T => {
    if (!over) return base;
    const out = { ...base };
    for (const k of Object.keys(base) as (keyof T)[]) {
      const bv = base[k];
      const ov = over[k];
      if (typeof bv === "number") out[k] = num(ov, bv) as T[keyof T];
      else if (typeof bv === "boolean") out[k] = (typeof ov === "boolean" ? ov : bv) as T[keyof T];
      else if (typeof bv === "string") out[k] = (typeof ov === "string" ? ov : bv) as T[keyof T];
    }
    return out;
  };
  db.config = {
    ...db.config,
    earn: deepMergeNumbers(db.config.earn, patch.earn),
    spend: deepMergeNumbers(db.config.spend, patch.spend),
    gates: deepMergeNumbers(db.config.gates, patch.gates),
    streak: deepMergeNumbers(db.config.streak, patch.streak),
    insider: deepMergeNumbers(db.config.insider, patch.insider),
    status: deepMergeNumbers(db.config.status, patch.status),
    verification: deepMergeNumbers(db.config.verification, patch.verification),
    launchDate: typeof patch.launchDate === "string" ? patch.launchDate : db.config.launchDate,
  };
  await saveDb(db);
  return NextResponse.json({ ok: true, config: db.config });
}
