/**
 * Options the client picks from (Close): a proposal's 1, 2 or 3 priced options and its add-ons,
 * cleaned as they come in, and what a choice adds up to. Pure (no Node or React imports): the
 * server, the client's page, the signed copy, the PDF and the editor all read it, so a total is
 * worked out one way everywhere.
 *
 * A Free or Pro member's proposal has no pricing: one price, in the proposal's own words, as before.
 */
import { BILLING_SAY, type Billing, type Choice, type ChoiceRec, type PriceAddOn, type PriceOption, type Pricing } from "./types";

export const PRICING_LIMITS = { options: 3, addOns: 6, name: 80, note: 120, about: 300, included: 12, line: 140, price: 10_000_000 } as const;

/** "$15,000". */
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** "$15,000 a month", "$6,000 once". */
export const priced = (n: number, b: Billing) => `${money(n)} ${BILLING_SAY[b]}`;

/** What a problem with the pricing says, for the editor. */
export class PricingProblem extends Error {}

const CTRL = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
const line = (raw: unknown, max: number) =>
  String(raw ?? "")
    .replace(CTRL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const cleanId = (raw: unknown, prefix: string, used: Set<string>) => {
  let id = line(raw, 24).replace(/[^A-Za-z0-9_-]/g, "") || `${prefix}${Math.random().toString(36).slice(2, 8)}`;
  while (used.has(id)) id += "x";
  used.add(id);
  return id;
};
const cleanPrice = (raw: unknown, name: string) => {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new PricingProblem(`Type a price for "${name}", in dollars.`);
  if (n > PRICING_LIMITS.price) throw new PricingProblem(`"${name}" costs more than ${money(PRICING_LIMITS.price)}. Check the price.`);
  return Math.round(n);
};
const cleanBilling = (raw: unknown): Billing => (raw === "once" ? "once" : "month");

/**
 * The pricing as the member saved it: up to 3 options (each named and priced, at most one
 * recommended) and up to 6 add-ons. Null or no options: no pricing, one price as before.
 */
export function cleanPricing(raw: unknown): Pricing | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new PricingProblem("The options didn't come through. Refresh and try again.");
  const o = raw as Record<string, unknown>;
  const opts = Array.isArray(o.options) ? o.options : [];
  const adds = Array.isArray(o.addOns) ? o.addOns : [];
  if (opts.length > PRICING_LIMITS.options) throw new PricingProblem(`Give them at most ${PRICING_LIMITS.options} options.`);
  if (adds.length > PRICING_LIMITS.addOns) throw new PricingProblem(`Keep it to ${PRICING_LIMITS.addOns} add-ons.`);
  const used = new Set<string>();
  let rec = false;
  const options: PriceOption[] = opts.map((x, i) => {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const name = line(r.name, PRICING_LIMITS.name) || `Option ${i + 1}`;
    const included = (Array.isArray(r.included) ? r.included : String(r.included ?? "").split("\n"))
      .map((t) => line(t, PRICING_LIMITS.line).replace(/^[-•]\s*/, ""))
      .filter(Boolean)
      .slice(0, PRICING_LIMITS.included);
    const note = line(r.note, PRICING_LIMITS.note);
    const about = line(r.about, PRICING_LIMITS.about);
    // One recommended at most: the first one marked.
    const recommended = r.recommended === true && !rec;
    if (recommended) rec = true;
    return { id: cleanId(r.id, "o", used), name, price: cleanPrice(r.price, name), billing: cleanBilling(r.billing), ...(note ? { note } : {}), ...(about ? { about } : {}), included, ...(recommended ? { recommended } : {}) };
  });
  const addOns: PriceAddOn[] = adds.map((x, i) => {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const name = line(r.name, PRICING_LIMITS.name) || `Add-on ${i + 1}`;
    const about = line(r.about, PRICING_LIMITS.about);
    return { id: cleanId(r.id, "a", used), name, price: cleanPrice(r.price, name), billing: cleanBilling(r.billing), ...(about ? { about } : {}) };
  });
  if (!options.length && !addOns.length) return null;
  if (!options.length) throw new PricingProblem("Add an option with its price before adding add-ons.");
  return { options, addOns };
}

/** The option a new page starts on: the recommended one, else the first. */
export const startOption = (p: Pricing) => (p.options.find((o) => o.recommended) ?? p.options[0]).id;

/** A choice that holds against this pricing (a known option, known add-ons, each once), or null. */
export function validChoice(p: Pricing | undefined | null, raw: unknown): Choice | null {
  if (!p || !p.options.length || !raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const opt = p.options.find((o) => o.id === r.optionId);
  if (!opt) return null;
  const want = new Set(Array.isArray(r.addOnIds) ? r.addOnIds.map(String) : []);
  return { optionId: opt.id, addOnIds: p.addOns.filter((a) => want.has(a.id)).map((a) => a.id) };
}

/** What a choice adds up to, in numbers and words. */
export function choiceRec(p: Pricing, c: Choice): ChoiceRec {
  const opt = p.options.find((o) => o.id === c.optionId) ?? p.options[0];
  const addOns = p.addOns.filter((a) => c.addOnIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, price: a.price, billing: a.billing }));
  const all = [{ price: opt.price, billing: opt.billing }, ...addOns];
  const monthly = all.filter((x) => x.billing === "month").reduce((n, x) => n + x.price, 0);
  const once = all.filter((x) => x.billing === "once").reduce((n, x) => n + x.price, 0);
  const total = monthly && once ? `${priced(monthly, "month")}, plus ${priced(once, "once")}` : monthly ? priced(monthly, "month") : priced(once, "once");
  const names = addOns.map((a) => a.name);
  const withAdds = names.length ? ` with ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}` : "";
  return { optionId: opt.id, option: opt.name, price: opt.price, billing: opt.billing, addOns, monthly, once, total, summary: `${opt.name} (${priced(opt.price, opt.billing)})${withAdds}` };
}

/** The comparison table's rows: every "what's included" line, in the order they first appear, ticked per option. */
export function includedRows(p: Pricing): { label: string; cells: boolean[] }[] {
  const seen: string[] = [];
  for (const o of p.options) for (const t of o.included) if (!seen.some((x) => x.toLowerCase() === t.toLowerCase())) seen.push(t);
  return seen.map((label) => ({ label, cells: p.options.map((o) => o.included.some((t) => t.toLowerCase() === label.toLowerCase())) }));
}
