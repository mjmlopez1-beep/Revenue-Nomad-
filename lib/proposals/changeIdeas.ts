/**
 * The suggestions above "Change it": up to three changes a member often asks for, drawn from the
 * proposal itself (its price, term and sections) and the lines they kept from the call (a
 * worry about price, a date they named, a budget signal). Each is a short label and the full
 * instruction it sends. Pure: the app reads it.
 */
import type { DiscoveryNote, ProposalBlock } from "./types";

export interface ChangeIdea {
  label: string;
  instruction: string;
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function changeIdeas(p: { blocks: ProposalBlock[]; fields: Record<string, string>; notes: DiscoveryNote[] }, usual?: { terms: string } | null): ChangeIdea[] {
  const out: ChangeIdea[] = [];
  const text = p.blocks.map((b) => `${b.title}\n${b.body}`).join("\n").toLowerCase();
  const f = (k: string) => (p.fields[k] ?? "").trim();
  const note = (...keys: string[]) => p.notes.find((n) => keys.includes(n.key))?.text ?? "";

  const worry = note("objectionsRaised", "budget.signals");
  if (worry && /\b(price|budget|expensive|cost|afford|spend)\b/i.test(worry))
    out.push({ label: "Answer their worry about price", instruction: `They said: "${short(worry, 200)}". Answer it in the investment section, and if it helps, add a smaller first step at a fixed fee before the ongoing role.` });
  if (!/\b(assessment|diagnostic|discovery phase|phase 1)\b/.test(text) && f("pricing.monthlyFee"))
    out.push({ label: "Add a 30-day assessment up front", instruction: "Add a 30-day assessment up front at a fixed fee, then the ongoing role only if they opt in at the end of it. Keep the monthly fee for the ongoing role." });
  else if (/\b(assessment|phase 1)\b/.test(text) && !/\bopt[- ]?in\b/.test(text))
    out.push({ label: "Make the ongoing work an opt-in", instruction: "Make the ongoing work after the assessment an opt-in, decided at the end of the assessment." });
  const when = note("timeline");
  if (when) out.push({ label: "Use the start date from the call", instruction: `On the call they said: "${short(when, 200)}". Set the start date and the milestones to match it.` });
  if (usual?.terms) out.push({ label: "Match my usual payment terms", instruction: `Use my usual terms: ${short(usual.terms, 300)}` });
  const months = Number(f("term.initialMonths"));
  if (months >= 6) out.push({ label: `Shorten the first term to 3 months`, instruction: "Shorten the first term to 3 months, then month to month with 30 days notice. Keep the price per month the same." });
  if (f("pricing.monthlyFee") && !f("pricing.stepDownFee")) out.push({ label: "Add a lower fee from month 4", instruction: "Add a lower monthly fee from month 4, once the heavier build in months 1 to 3 is done." });
  out.push({ label: "Make it shorter", instruction: "Make it shorter: cut repetition, keep every number, date and decision." });
  return out.slice(0, 3);
}

/** The member's usual terms, from their most recent other proposal that states them. */
export function usualTerms(others: { fields: Record<string, string>; updatedAt: string }[]): { terms: string } | null {
  const p = [...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((x) => x.fields["term.noticeDays"] || x.fields["term.initialMonths"] || x.fields["payment.terms"]);
  if (!p) return null;
  const bits = [p.fields["payment.terms"], p.fields["term.initialMonths"] ? `a ${p.fields["term.initialMonths"]}-month first term` : "", p.fields["term.noticeDays"] ? `${p.fields["term.noticeDays"]} days notice` : ""].filter(Boolean);
  return bits.length ? { terms: bits.join(", ") } : null;
}
