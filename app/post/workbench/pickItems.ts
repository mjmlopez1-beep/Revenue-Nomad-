/**
 * What the bulk bar's Unlock and Open buy for the rows picked (SelectionBar.tsx), as pure functions
 * so the scripts read them with no browser. One purchase per row at most; rows with nothing to buy
 * are left out, and a row that opens only after its company says so (wait).
 */
import { bundleLead, isOpenRole, type FactRef, type RecordType, type Row } from "../model";

/** What Unlock buys for each picked row: a company's own unlock, a person's name and title, who held a seat, an open role's posting (with its rate and hours). Rows with nothing to buy are left out. */
export function unlockItems(type: RecordType, rows: Row[]): { items: FactRef[]; wait: number } {
  const items: FactRef[] = [];
  const seen = new Set<string>();
  let wait = 0;
  for (const r of rows) {
    const i = r.i;
    if (type === "companies") {
      if (i.c.hidden && !seen.has(i.c.id)) (seen.add(i.c.id), items.push({ entity: "company", id: i.c.id, field: "identity" }));
      continue;
    }
    // An open role's posting, rate and hours come with its company: nothing waits there, the company's own open is the buy.
    if (type === "engagements" && r.e && isOpenRole(r.e)) {
      const lead = i.c.hidden ? null : bundleLead(r.e);
      if (lead) items.push({ entity: "engagement", id: r.e.id, field: lead });
      continue;
    }
    if (i.c.hidden) {
      wait++;
      continue;
    }
    if (type === "people" && r.p) {
      const lead = (["name", "title"] as const).find((f) => r.p!.cells[f]?.s === "locked");
      if (lead) items.push({ entity: "contact", id: r.p.id, field: lead });
    } else if (type === "engagements" && r.e) {
      const lead = (["operator", "role"] as const).find((f) => r.e!.cells[f]?.s === "locked");
      if (lead) items.push({ entity: "engagement", id: r.e.id, field: lead });
    }
  }
  return { items, wait };
}

/** People and seats: the locked companies of the picked rows, so the ones waiting on their company can open it first (each company once). */
export function companyItems(type: RecordType, rows: Row[]): FactRef[] {
  if (type === "companies") return [];
  const seen = new Set<string>();
  const out: FactRef[] = [];
  for (const r of rows) if (r.i.c.hidden && !seen.has(r.i.c.id)) (seen.add(r.i.c.id), out.push({ entity: "company", id: r.i.c.id, field: "identity" }));
  return out;
}
