/**
 * Suggestions for how a company sells, read from the About text its own website gave (lib/about:
 * the homepage's description, already on file, so nothing new is fetched and nothing leaves Merlin).
 * Pure rules on plain words, no AI.
 *
 * A suggestion is never a fact: the app shows it as "Suggested from the company's website" beside
 * the empty fact, and it is saved only when a member confirms it (a normal fact then: it earns, and
 * can be confirmed or reported like any other). Only who the company sells to, its business model
 * and a product-led motion are suggested, and only when the text says so in plain words. Deal size
 * and sales cycle are never guessed.
 *
 * TODO(icp-fit): the About text is the homepage's description only. Reading the pricing page's
 * buttons ("Start free" suggests PLG, "Book a demo" a sales-led motion) and customer logos would
 * need lib/about/run.ts to keep those words when it reads the homepage; it does not yet.
 */
import { BUSINESS_MODELS, RN_INDUSTRIES, RN_MOTIONS, SELLS_TO_MAX } from "../tableFields";

export const SUGGESTED_FROM = "Suggested from the company's website";

export interface SellSuggestion {
  sellsTo: string[];
  businessModel: string | null;
  motion: string | null;
}

/** Customers named in plain words, and the industry on the list they are in. */
const SELLS_TO: [RegExp, string][] = [
  [/\b(hospitals?|health systems?|clinics?|physician (groups?|practices?)|care providers?|healthcare providers?|provider organizations?)\b/i, "Healthcare Providers & Health Systems"],
  [/\b(pharma(ceutical)?( companies)?|biotechs?|life sciences? companies|drug (developers|makers)|clinical trial sponsors?|sponsors and CROs)\b/i, "Pharma & Biotech"],
  [/\b(health plans?|payers|insurers|insurance (carriers|companies|agencies)|carriers and brokers)\b/i, "Insurance & Health Plans"],
  [/\b(banks?|credit unions?|community banks)\b/i, "Banking & Credit Unions"],
  [/\b(wealth managers?|financial advisors?|RIAs)\b/i, "Wealth Management & Advisory"],
  [/\b(mortgage (lenders|brokers)|lenders)\b/i, "Mortgage & Lending"],
  [/\b(accountants|accounting firms|CPAs|tax (firms|professionals))\b/i, "Accounting & Tax"],
  [/\b(restaurants?|restaurant (groups|operators))\b/i, "Restaurants"],
  [/\b(hotels?|resorts|hoteliers)\b/i, "Hotels & Resorts"],
  [/\b(law firms?|legal (teams|departments)|attorneys|lawyers)\b/i, "Law Firms & Legal Departments"],
  [/\b(school districts?|K-?12 schools?|schools and districts)\b/i, "K-12 Schools & Districts"],
  [/\b(universit(y|ies)|colleges|higher education institutions)\b/i, "Higher Education"],
  [/\b(retailers|retail stores|brick[- ]and[- ]mortar)\b/i, "Brick & Mortar Retail"],
  [/\b(e-?commerce (brands|merchants|stores)|online (stores|merchants)|D2C brands|DTC brands)\b/i, "E-Commerce & D2C"],
  [/\b(manufacturers|manufacturing (companies|plants))\b/i, "Industrial Manufacturing"],
  [/\b(general contractors|home ?builders|construction (companies|firms))\b/i, "General Contractors & Builders"],
  [/\b(property managers?|property management companies)\b/i, "Property Management"],
  [/\b(car dealerships?|auto dealers?|dealerships)\b/i, "Auto Dealerships"],
  [/\b(nonprofits?|non-profits?|associations)\b/i, "Nonprofit & Associations"],
  [/\b(staffing (firms|agencies)|recruiting (firms|agencies)|recruiters)\b/i, "Staffing & Recruiting"],
  [/\b(freight brokers?|trucking companies|carriers and shippers|shippers)\b/i, "Freight & Trucking"],
  [/\b(marketing teams?|marketers|CMOs)\b/i, "Marketing Teams & CMOs"],
  [/\b(sales teams?|revenue teams?|CROs)\b/i, "Sales Organizations & CROs"],
  [/\b(developers|engineering teams|software teams)\b/i, "Developer Tools"],
  [/\b(state and local governments?|municipalities|cities and counties|public agencies)\b/i, "State & Local Government"],
  [/\b(federal agencies|the federal government)\b/i, "Federal Government"],
  [/\b(senior living (communities|operators)|assisted living)\b/i, "Senior Living & Assisted Living"],
  [/\b(veterinar(y|ians)|vet (clinics|practices))\b/i, "Veterinary & Animal Health"],
];

/** What the About text suggests, each value one on its pick list. Empty when the text says nothing plainly. */
export function suggestFromAbout(about: string | null | undefined): SellSuggestion {
  const t = (about ?? "").replace(/\s+/g, " ").trim();
  const out: SellSuggestion = { sellsTo: [], businessModel: null, motion: null };
  if (t.length < 20) return out;
  for (const [re, ind] of SELLS_TO) {
    if (out.sellsTo.length >= SELLS_TO_MAX) break;
    if (re.test(t) && RN_INDUSTRIES.includes(ind) && !out.sellsTo.includes(ind)) out.sellsTo.push(ind);
  }
  const model = /\bB2B2C\b/i.test(t)
    ? "B2B2C"
    : /\b(D2C|DTC|direct[- ]to[- ]consumer)\b/i.test(t)
      ? "D2C"
      : /\bmarketplace\b/i.test(t)
        ? "Marketplace"
        : /\bB2B\b/i.test(t) || /\bfor (businesses|enterprises|companies|teams)\b/i.test(t)
          ? "B2B"
          : /\bB2C\b/i.test(t)
            ? "B2C"
            : null;
  if (model && BUSINESS_MODELS.includes(model)) out.businessModel = model;
  if (/\b(start (for )?free|free (trial|forever|plan)|sign up (for )?free|try (it )?(for )?free|self[- ]serve|get started (for )?free)\b/i.test(t) && RN_MOTIONS.includes("PLG")) out.motion = "PLG";
  return out;
}

/** The suggestion for one company fact, as the value a confirm would save. Null when there is none. */
export function suggestionFor(s: SellSuggestion | null | undefined, field: string): string | null {
  if (!s) return null;
  if (field === "sellsTo") return s.sellsTo.length ? RN_INDUSTRIES.filter((o) => s.sellsTo.includes(o)).join("; ") : null;
  if (field === "businessModel") return s.businessModel;
  if (field === "motion") return s.motion;
  return null;
}
