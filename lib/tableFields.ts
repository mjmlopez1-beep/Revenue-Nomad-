/**
 * Field definitions for The Table. Shared by server and client (no Node imports).
 *
 * Every record type has one identity field (always visible, free to add) and a
 * set of enrichable fields. Filling an empty field earns 1 credit. Fields
 * marked `gated` are hidden behind a lock; ungating one costs 1 credit.
 */
export type RecordType = "company" | "person" | "history";
export type FieldKind = "text" | "url" | "email" | "phone" | "month" | "number" | "choice";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  gated: boolean;
  options?: string[];
  placeholder?: string;
}

export interface TypeDef {
  type: RecordType;
  label: string;
  singular: string;
  identity: FieldDef;
  fields: FieldDef[];
}

export const TYPES: TypeDef[] = [
  {
    type: "company",
    label: "Companies",
    singular: "company",
    identity: { key: "name", label: "Company", kind: "text", gated: false },
    fields: [
      { key: "website", label: "Website", kind: "url", gated: false, placeholder: "acme.com" },
      { key: "industry", label: "Industry", kind: "text", gated: false, placeholder: "B2B SaaS" },
      { key: "employees", label: "Employees", kind: "choice", gated: false, options: ["1-10", "11-50", "51-200", "201-1,000", "1,000+"] },
      { key: "hq", label: "HQ", kind: "text", gated: false, placeholder: "Chicago, IL" },
      { key: "usesFractionals", label: "Uses fractionals", kind: "choice", gated: true, options: ["Yes, now", "Has before", "Open to it", "No"] },
      { key: "buyer", label: "Who buys", kind: "text", gated: true, placeholder: "CEO signs; CFO approves >$50k" },
      { key: "needs", label: "What they need", kind: "text", gated: true, placeholder: "Outbound engine before Series B" },
    ],
  },
  {
    type: "person",
    label: "People",
    singular: "person",
    identity: { key: "name", label: "Name", kind: "text", gated: false },
    fields: [
      { key: "title", label: "Title", kind: "text", gated: false, placeholder: "CEO" },
      { key: "company", label: "Company", kind: "text", gated: false, placeholder: "Acme" },
      { key: "email", label: "Email", kind: "email", gated: true, placeholder: "jane@acme.com" },
      { key: "phone", label: "Phone", kind: "phone", gated: true, placeholder: "+1 555 010 0000" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: true, placeholder: "linkedin.com/in/…" },
      { key: "openToFractionals", label: "Open to fractionals", kind: "choice", gated: true, options: ["Yes", "Has hired before", "No", "Unsure"] },
    ],
  },
  {
    type: "history",
    label: "Fractional History",
    singular: "engagement",
    identity: { key: "company", label: "Company", kind: "text", gated: false },
    fields: [
      { key: "role", label: "Role", kind: "text", gated: false, placeholder: "Fractional VP Sales" },
      { key: "start", label: "Start", kind: "month", gated: false },
      { key: "end", label: "End", kind: "text", gated: false, placeholder: "2026-06 or Ongoing" },
      { key: "operator", label: "Operator", kind: "text", gated: true, placeholder: "Who held the seat" },
      { key: "rate", label: "Rate", kind: "text", gated: true, placeholder: "$8k/mo" },
      { key: "hours", label: "Hrs/week", kind: "number", gated: true, placeholder: "15" },
      { key: "outcome", label: "Outcome", kind: "text", gated: true, placeholder: "Renewed; built team of 4" },
      { key: "buyerContact", label: "Hired by", kind: "text", gated: true, placeholder: "CEO, Jane Doe" },
    ],
  },
];

export const typeDef = (t: string) => TYPES.find((d) => d.type === t);

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
