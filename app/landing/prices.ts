/**
 * What the landing page says is free and what costs a credit (the matrix under "How it works"),
 * read from the field definitions so the page can't drift from what the table does, with each
 * locked chip named by what one credit opens. Pure, so scripts/test-prices.mts can check it.
 */
import * as FIELDS from "@/lib/tableFields";
import { GROUPS, type Entity } from "@/lib/tableFields";

/**
 * lib/tableFields SEAT_SCAN_ROLE_FREE, the owner's switch: true when the role of a seat Revenue
 * Nomad found with nobody named is free to see. Read by name, so this builds whether or not the
 * switch is there, and says "1 credit" (as the table does) until it is set.
 */
export const SCAN_ROLE_FREE = (FIELDS as unknown as Record<string, unknown>)[["SEAT", "SCAN", "ROLE", "FREE"].join("_")] === true;

export interface PriceRow {
  entity: Entity;
  label: string;
  free: string[];
  /** One chip per purchase, 1 credit each unless `price` says otherwise. */
  locked: string[];
  /** What the row's locked chips cost, where it isn't "1 credit each" ("2 credits" for a company). */
  price?: string;
  note?: string;
}

/**
 * The matrix. Who held a seat comes with the role they held (one unlock), and a person's name
 * with their title. A person's LinkedIn, email and phone open after the name, and a locked
 * company's people after the company. A seat's end month is free while the seat is going, and a
 * seat with nobody named keeps its role as a purchase of its own (free with SCAN_ROLE_FREE).
 */
export function priceMatrix(scanRoleFree = SCAN_ROLE_FREE): PriceRow[] {
  /** What one credit opens, where it isn't the field itself. Null leaves the field out (it comes with another). */
  const PURCHASE: Partial<Record<Entity, Record<string, string | null>>> = {
    engagement: {
      operator: "Who held it, with the role they held",
      role: scanRoleFree ? null : "Role of a seat with nobody named",
      end: "End month of a seat that ended",
    },
    contact: { name: "Name and title", title: null },
  };
  const rows: { entity: Entity; label: string; freeFirst?: string[]; freeLast?: string[]; lockedFirst?: string[]; price?: string; note?: string }[] = [
    {
      entity: "company",
      label: "The company",
      lockedFirst: ["Name, website and logo"],
      price: "2 credits",
      note: "Every company's name, website, logo and LinkedIn are locked until you unlock it. 2 credits show the company and the job posting of each open role there, with the posted rate and hours when the posting gave them. Its people and who held its seats open after that. Type a company's full name or website in search to find one you already know. Try it on this page names a few hiring companies as a sample.",
    },
    {
      entity: "engagement",
      label: "The seat",
      freeLast: ["End month while the seat is going", ...(scanRoleFree ? ["Role of a seat with nobody named"] : []), "Title of an open role", "Open and closed dates"],
      note: "Who held a seat and the role they held are one unlock, 1 credit for both. An open role's title is free while it is open, and its job posting, posted rate and hours are one credit together.",
    },
    {
      entity: "contact",
      label: "A hiring contact",
      note: "A person's name and title are one unlock, 1 credit for both. Their LinkedIn, email and phone open after that, 1 credit each.",
    },
  ];
  return rows.map((row) => {
    const fields = (GROUPS.find((g) => g.entity === row.entity)?.fields ?? []).filter((f) => !f.identity && !f.system);
    const named = PURCHASE[row.entity] ?? {};
    const gated = fields.filter((f) => f.gated);
    return {
      entity: row.entity,
      label: row.label,
      free: [...(row.freeFirst ?? []), ...fields.filter((f) => !f.gated).map((f) => f.label), ...(row.freeLast ?? [])],
      // Who held a seat first: it is the one most members come for.
      locked: [
        ...(row.lockedFirst ?? []),
        ...[...gated.filter((f) => f.key === "operator"), ...gated.filter((f) => f.key !== "operator")]
          .map((f) => (f.key in named ? named[f.key] : f.label))
          .filter((x): x is string => !!x),
      ],
      ...(row.price ? { price: row.price } : {}),
      note: row.note,
    };
  });
}
