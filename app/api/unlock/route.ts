import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { balance, spend } from "@/lib/credits";
import { hasUnlock } from "@/lib/gates";
import { currentEdition } from "@/lib/aggregate";
import { ASSET_LABELS } from "@/lib/config";
import type { EditionAsset } from "@/lib/types";

export const dynamic = "force-dynamic";

const ASSETS: EditionAsset[] = [
  "index_trend",
  "retainers_by_function",
  "retainers_by_stage",
  "retainers_by_industry",
  "realization_rate",
  "win_rate_by_source",
  "pricing_models",
  "utilization_renewal",
  "full_edition",
];

/** Spend credits to unlock an edition asset. Unlocks expire with the edition. */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { asset } = (await req.json()) as { asset: EditionAsset };
  if (!ASSETS.includes(asset)) return NextResponse.json({ error: "Unknown asset" }, { status: 400 });
  const edition = currentEdition();
  if (hasUnlock(db, op.id, edition, asset))
    return NextResponse.json({ error: "Already unlocked" }, { status: 409 });
  const cost = db.config.spend[asset];
  const bal = balance(db, op.id);
  if (bal < cost)
    return NextResponse.json({ error: `Not enough credits (${bal}/${cost}). Contribute to earn more.` }, { status: 402 });
  db.unlocks.push({ id: uid("ul"), operatorId: op.id, edition, asset, cost, at: new Date().toISOString() });
  spend(db, op.id, cost, `${edition}:${asset}`, `Unlocked ${ASSET_LABELS[asset]} (${edition})`);
  await saveDb(db);
  return NextResponse.json({ ok: true, balance: balance(db, op.id) });
}
