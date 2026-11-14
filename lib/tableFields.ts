/**
 * Field definitions for The Table. Shared by server and client (no Node imports).
 *
 * One record = one fractional engagement, joined to the company that used the
 * fractional and the contacts who hired or worked with them. Each group's data
 * is stored once on its own entity and linked, so a company field filled on one
 * row shows on every row for that company.
 *
 * Filling an empty field earns 1 credit. `gated` fields are locked; unlocking
 * one someone else filled costs 1 credit.
 */
export type Entity = "company" | "engagement" | "contact";
export type FieldKind = "text" | "url" | "email" | "phone" | "month" | "number" | "choice";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  gated: boolean;
  /** Set when the record is created; not fillable in a cell. */
  identity?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface GroupDef {
  entity: Entity;
  label: string;
  fields: FieldDef[];
}

export const GROUPS: GroupDef[] = [
  {
    entity: "company",
    label: "Company",
    fields: [
      { key: "name", label: "Company", kind: "text", gated: false, identity: true },
      { key: "website", label: "Website", kind: "url", gated: false, placeholder: "acme.com" },
      { key: "industry", label: "Industry", kind: "text", gated: false, placeholder: "B2B SaaS" },
      { key: "employees", label: "Employees", kind: "choice", gated: false, options: ["1-10", "11-50", "51-200", "201-1,000", "1,000+"] },
      { key: "hq", label: "HQ", kind: "text", gated: false, placeholder: "Chicago, IL" },
    ],
  },
  {
    entity: "engagement",
    label: "Fractional engagement",
    fields: [
      { key: "role", label: "Role", kind: "text", gated: false, placeholder: "Fractional VP Sales" },
      { key: "status", label: "Status", kind: "choice", gated: false, options: ["Open role", "Active", "Ended"] },
      { key: "operator", label: "Fractional", kind: "text", gated: true, placeholder: "Who held the seat" },
      { key: "start", label: "Start", kind: "month", gated: false },
      { key: "end", label: "End", kind: "text", gated: false, placeholder: "2026-06 or Ongoing" },
      { key: "rate", label: "Rate", kind: "text", gated: true, placeholder: "$8k/mo" },
      { key: "hours", label: "Hrs/wk", kind: "number", gated: true, placeholder: "15" },
      { key: "outcome", label: "Outcome", kind: "text", gated: true, placeholder: "Renewed; built team of 4" },
      { key: "posting", label: "Posting", kind: "url", gated: false, placeholder: "Link to the job post" },
    ],
  },
  {
    entity: "contact",
    label: "Contact",
    fields: [
      { key: "name", label: "Contact", kind: "text", gated: false, placeholder: "Jane Doe" },
      { key: "title", label: "Title", kind: "text", gated: false, placeholder: "CEO" },
      { key: "relationship", label: "Relationship", kind: "choice", gated: false, options: ["Hiring for the seat", "Hired the fractional", "Worked with them"] },
      { key: "email", label: "Email", kind: "email", gated: true, placeholder: "jane@acme.com" },
      { key: "phone", label: "Phone", kind: "phone", gated: true, placeholder: "+1 555 010 0000" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: true, placeholder: "linkedin.com/in/…" },
    ],
  },
];

export const ALL_FIELDS = GROUPS.flatMap((g) => g.fields.map((f) => ({ entity: g.entity, f, col: `${g.entity}.${f.key}` })));
/** Fields a member can fill (identity fields are set when a record is created). */
export const FILLABLE = ALL_FIELDS.filter((x) => !x.f.identity);

export const fieldDef = (entity: string, key: string) =>
  GROUPS.find((g) => g.entity === entity)?.fields.find((f) => f.key === key);

/** Normalize and validate a value for a field. Returns the clean value or an error message. */
export function cleanValue(f: FieldDef, raw: unknown): { value?: string; error?: string } {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!v) return { error: `${f.label} is empty.` };
  switch (f.kind) {
    case "url": {
      const u = v.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      return /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u) ? { value: u } : { error: "That doesn't look like a web address." };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? { value: v.toLowerCase() } : { error: "That doesn't look like an email." };
    case "phone":
      return v.replace(/\D/g, "").length >= 7 ? { value: v } : { error: "That doesn't look like a phone number." };
    case "month":
      return /^\d{4}-\d{2}$/.test(v) ? { value: v } : { error: "Use a month (YYYY-MM)." };
    case "number":
      return /^\d{1,3}$/.test(v) ? { value: v } : { error: "Use a number." };
    case "choice":
      return f.options?.includes(v) ? { value: v } : { error: "Pick one of the options." };
    default:
      return v.length >= 2 ? { value: v } : { error: "Too short." };
  }
}
