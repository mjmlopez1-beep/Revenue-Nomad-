/**
 * Evidence Bank's page model (Evidence.dc.html), pure so scripts/test-evidence-page.mts checks it
 * with no browser: who sees the page (Close only), the rows (ready cases, drafts, the seats still
 * without a case, and on a first visit two rows marked Example), the client words (hidden by
 * default, a reveal shows the member their own client), filters, sorts, the fill line under each
 * column, how a case reads in a Proof part, match words, and what the library covers.
 *
 * Rules it keeps:
 *   - Close only (BUILD_PLAN part 8): on Free and Pro the page is the upgrade screen.
 *   - The client is hidden by default, row by row and in the case view. Showing it is for this
 *     screen only and never stored; naming the client to readers is the case's clientNamed switch.
 *   - Example rows are Example<T> (app/post/examples.ts): never counted, never selected, never
 *     matched, never sent.
 *   - Numbers are the member's own. An empty answer stays empty; nothing is invented.
 *   - No export: nothing here downloads anything.
 */
import { example, isExample, type Example } from "../examples";
import { catOf, tagGroups, type EvidenceCase, type EvidenceMatch, type EvidenceOutcome } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const low = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/* ---------- who sees it ---------- */

/** Close is the member's (the trial counts; no plan means billing is off and nothing is gated). */
export const evidenceOpen = (plan: { canClose: boolean } | null | undefined) => !plan || plan.canClose;

/** The upgrade screen's words: what Evidence Bank does, for a member on Free or Pro. */
export const UPGRADE = {
  title: "Evidence Bank is part of Close",
  lead: "Your private library of case studies. Write a case once, match it to any company, and Merlin puts the closest one in the Proof part of every proposal.",
  points: [
    { h: "Built from your seats", p: "Each seat you held starts a draft with the industry, size and dates filled in. Three questions finish it: the problem, what you did, and the numbers before and after." },
    { h: "Private by default", p: "Only you see your cases. The client name stays hidden. A reader sees a line like \"A health care company, $20M to $50M\" until you name the client." },
    { h: "Matched to any company", p: "Merlin says which case is closest to a company and why, in words: what is the same and what is different. Matching never costs a credit." },
    { h: "In the Proof part of your proposals", p: "The closest one or two cases go into the proposals you send. If you choose, a case also shows on your card in Fractionals." },
  ],
  cta: "See the Close plan",
} as const;

/* ---------- a seat, as the page reads it ---------- */

/** A seat of the member's, as much of it as a case needs (from SeatInfo: the company's free facts, the seat's own). */
export interface SeatLite {
  id: string;
  companyId: string;
  /** The client's name, for the member's own eyes only. */
  company: string;
  /** The company's name is locked for this member (not theirs yet): only its facts show. */
  hidden: boolean;
  industry: string;
  size: string;
  revenue: string;
  motion: string;
  role: string;
  /** "Feb 2024 to Dec 2024", "Since Jun 2026". */
  dates: string;
  hours: string;
  /** Why they hired, from the seat. */
  why: string;
}

/** What a reader sees in place of the client's name: "A health care company, $20M to $50M". */
export function labelFrom(f: { industry?: string; size?: string; revenue?: string }): string {
  const ind = (f.industry ?? "").trim();
  const band = (f.revenue ?? "").trim() || ((f.size ?? "").trim() ? `${f.size!.trim()} people` : "");
  // "Health Care" reads "health care"; a word with capitals inside it (EdTech, SaaS) keeps them.
  const words = ind.replace(/&/g, "and").split(/\s+/).map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(" ");
  const what = ind ? `${/^[aeiou]/i.test(ind) ? "An" : "A"} ${words} company` : "A company";
  return band ? `${what}, ${band.replace(/–/g, " to ")}` : what;
}
export const labelOf = (c: Pick<EvidenceCase, "clientLabel" | "industry" | "size" | "revenue">) => c.clientLabel?.trim() || labelFrom(c);

/* ---------- the rows ---------- */

/** An example case for a first visit: made up, shown with its Example label, never the member's. */
export interface ExampleCase {
  title: string;
  role: string;
  dates: string;
  label: string;
  industry: string;
  size: string;
  revenue: string;
  motion: string;
  soldTo: string;
  problems: string[];
  workType: string[];
  outcomes: EvidenceOutcome[];
  workedWith: string;
}

export const EXAMPLE_CASES: readonly Example<ExampleCase>[] = [
  example({
    title: "Sales off the founder's desk",
    role: "Fractional VP Sales",
    dates: "Mar to Sep 2023",
    label: "A 120-person EdTech company",
    industry: "EdTech",
    size: "51–200",
    revenue: "$5M–$20M",
    motion: "Inside sales",
    soldTo: "School districts",
    problems: ["The founder closed every deal", "Nothing written down for a new hire"],
    workType: ["Founder-led sales exit", "Sales team hiring and ramp", "Sales playbook"],
    outcomes: [
      { k: "Win rate", before: "18%", after: "27%" },
      { k: "Founder hours on sales", before: "30 a week", after: "10 a week" },
    ],
    workedWith: "The CEO and 2 new account executives",
  }),
  example({
    title: "A sales team on top of self-serve sign-ups",
    role: "Fractional VP Sales",
    dates: "Apr to Dec 2021",
    label: "A 60-person software company",
    industry: "Software",
    size: "51–200",
    revenue: "$5M–$20M",
    motion: "PLG to sales",
    soldTo: "Tech teams",
    problems: ["Sign-ups grew but nobody followed up"],
    workType: ["Product-led to sales bridge", "AI lead scoring", "CRM sales configuration"],
    outcomes: [
      { k: "Sign-ups that pay", before: "2.1%", after: "3.4%" },
      { k: "Average contract", before: "$4K", after: "$11K" },
    ],
    workedWith: "The CEO and the head of product",
  }),
];

export type EvRow =
  | { kind: "case"; key: string; c: EvidenceCase; seat: SeatLite | null }
  | { kind: "seat"; key: string; seat: SeatLite }
  | { kind: "example"; key: string; x: Example<ExampleCase> };

/** A first visit (step 6): no case is ready yet. */
export const isFirstVisit = (cases: readonly EvidenceCase[]) => !cases.some((c) => c.status === "ready");

/**
 * The library: the member's cases (each with its seat when it came from one), then every seat of
 * theirs that has no case yet (a draft to start), then on a first visit the two Example rows.
 */
export function rowsOf(cases: readonly EvidenceCase[], seats: readonly SeatLite[], first: boolean): EvRow[] {
  const bySeat = new Map(seats.map((s) => [s.id, s]));
  const caseRows: EvRow[] = cases.map((c) => ({ kind: "case", key: c.id, c, seat: c.seatId ? bySeat.get(c.seatId) ?? null : null }));
  const taken = new Set(cases.map((c) => c.seatId).filter(Boolean));
  const seatRows: EvRow[] = seats.filter((s) => !taken.has(s.id)).map((s) => ({ kind: "seat", key: `seat:${s.id}`, seat: s }));
  const ex: EvRow[] = first ? EXAMPLE_CASES.map((x, n) => ({ kind: "example", key: `example:${n}`, x })) : [];
  return [...caseRows, ...seatRows, ...ex];
}

/** The member's own rows (cases and seat drafts): what counts, selects, ranks and sends. Examples never. */
export const ownRows = (rows: readonly EvRow[]) => rows.filter((r): r is Exclude<EvRow, { kind: "example" }> => r.kind !== "example" && !isExample(r));
export const isReady = (r: EvRow) => r.kind === "case" && r.c.status === "ready";

/** A row's title: the case's, or for a draft not written yet "<role> seat, <dates>". */
export function titleOf(r: EvRow): string {
  if (r.kind === "example") return r.x.value.title;
  if (r.kind === "case" && r.c.status === "ready" && r.c.title.trim()) return r.c.title;
  const s = r.seat;
  const t = r.kind === "case" ? r.c.title.trim() : "";
  if (t) return t;
  return s ? `${s.role || "Fractional"} seat${s.dates ? `, ${s.dates}` : ""}` : "A case not written yet";
}
export const statusWord = (r: EvRow) => (r.kind === "example" ? "Example" : isReady(r) ? "Ready" : "Draft");
export function subOf(r: EvRow): string {
  if (r.kind === "example") return `${r.x.value.role} · ${r.x.value.dates}`;
  if (!isReady(r)) return r.seat ? "From your seat · 3 questions, about 3 minutes" : "3 questions, about 3 minutes";
  const s = r.seat;
  return s ? [s.role, s.dates].filter(Boolean).join(" · ") : "Written by you";
}

/** The facts a row shows (from the case, else from its seat). */
export function factsOf(r: EvRow): { industry: string; size: string; revenue: string; motion: string; soldTo: string } {
  if (r.kind === "example") return r.x.value;
  const s = r.seat;
  const c = r.kind === "case" ? r.c : null;
  return {
    industry: c?.industry || s?.industry || "",
    size: c?.size || s?.size || "",
    revenue: c?.revenue || s?.revenue || "",
    motion: c?.motion || s?.motion || "",
    soldTo: c?.soldTo || "",
  };
}
export const sizeWords = (f: { size: string; revenue: string }) => [f.size ? `${f.size.replace(/–/g, " to ")} people` : "", f.revenue ? `${f.revenue.replace(/–/g, " to ")} revenue` : ""].filter(Boolean).join(" · ");

/* ---------- the client: hidden by default ---------- */

/**
 * The client cell's two lines. Hidden by default ("Client hidden", and what a reader sees);
 * `shown` reveals the member's own client to them on this screen. A locked company never shows a name.
 */
export function clientWords(r: EvRow, shown: boolean): [string, string] {
  if (r.kind === "example") return ["Example client", r.x.value.label];
  const c = r.kind === "case" ? r.c : null;
  const named = !!c?.clientNamed;
  const name = r.seat && !r.seat.hidden ? r.seat.company : c?.clientName ?? "";
  const label = c ? labelOf(c) : labelFrom(r.seat ?? {});
  if (shown && name) return [name, named ? "Named in proposals" : "Kept out of proposals"];
  return ["Client hidden", named ? "Named in proposals" : `Reads as ${low(label)}`];
}
/** Whether a row has a name the member can reveal (their own client, a company they can see). */
export const canReveal = (r: EvRow) => r.kind !== "example" && ((!!r.seat && !r.seat.hidden && !!r.seat.company) || (r.kind === "case" && !r.seat && !!r.c.clientName));

/* ---------- filters and sorts ---------- */

export interface EvFilters {
  /** A type of work category, or "" for all. */
  cat: string;
  motion: string;
  /** The bottom tabs: all, ready, drafts. */
  tab: "all" | "ready" | "draft";
  /** Typed words: a case whose title, problems, tags or facts carry them. */
  q: string;
}
export const NO_FILTERS: EvFilters = { cat: "", motion: "", tab: "all", q: "" };

export const tagsOf = (r: EvRow): string[] => (r.kind === "example" ? r.x.value.workType : r.kind === "case" ? r.c.workType : []);
export const problemsOf = (r: EvRow): string[] => (r.kind === "example" ? r.x.value.problems : r.kind === "case" ? r.c.problems : []);
export const outcomesOf = (r: EvRow): EvidenceOutcome[] => (r.kind === "example" ? r.x.value.outcomes : r.kind === "case" ? r.c.outcomes : []);
export const hasCat = (r: EvRow, cat: string) => (r.kind === "example" || isReady(r)) && tagsOf(r).some((t) => catOf(t) === cat);

export function filterRows(rows: readonly EvRow[], f: EvFilters): EvRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.cat && !hasCat(r, f.cat)) return false;
    if (f.motion && factsOf(r).motion !== f.motion) return false;
    if (f.tab === "ready" && !isReady(r)) return false;
    if (f.tab === "draft" && (r.kind === "example" || isReady(r))) return false;
    if (q) {
      const fx = factsOf(r);
      const hay = [titleOf(r), ...problemsOf(r), ...tagsOf(r), fx.industry, fx.motion, fx.soldTo, ...outcomesOf(r).map((o) => o.k)].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}
/** The motions the rows carry, for the Motion chips. */
export const motionsOf = (rows: readonly EvRow[]) => [...new Set(rows.map((r) => factsOf(r).motion).filter(Boolean))].sort();
/** How many of the rows carry a category (the chip's count). */
export const catCount = (rows: readonly EvRow[], cat: string) => rows.filter((r) => hasCat(r, cat)).length;

export type EvSort = "used" | "drafts" | "new" | "match";
export const SORT_WORDS: Record<EvSort, string> = { used: "Sort: most used", drafts: "Sort: drafts first", new: "Sort: newest first", match: "Sort: closest match" };

/** Rank of a match label: Same over Close over Different, then more the same and less different. */
export const matchRank = (m: EvidenceMatch | undefined) => (m ? (m.label === "Same" ? 300 : m.label === "Close" ? 200 : 100) + m.same.length * 10 - m.diff.length : -1);

export function sortRows(rows: readonly EvRow[], sort: EvSort, matches?: ReadonlyMap<string, EvidenceMatch>): EvRow[] {
  const at = new Map(rows.map((r, n) => [r.key, n]));
  const pos = (r: EvRow) => at.get(r.key) ?? 0;
  const used = (r: EvRow) => (r.kind === "case" ? r.c.usedIn.length : -1);
  const when = (r: EvRow) => (r.kind === "case" ? r.c.updatedAt || r.c.createdAt : r.kind === "seat" ? "" : "0");
  const exLast = (r: EvRow) => (r.kind === "example" ? 1 : 0);
  const draft = (r: EvRow) => (r.kind === "example" ? 2 : isReady(r) ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (sort === "match") return matchRank(b.kind === "case" ? matches?.get(b.c.id) : undefined) - matchRank(a.kind === "case" ? matches?.get(a.c.id) : undefined) || exLast(a) - exLast(b) || pos(a) - pos(b);
    if (sort === "drafts") return draft(a) - draft(b) || pos(a) - pos(b);
    if (sort === "new") return exLast(a) - exLast(b) || when(b).localeCompare(when(a)) || pos(a) - pos(b);
    return exLast(a) - exLast(b) || used(b) - used(a) || draft(b) - draft(a) || pos(a) - pos(b);
  });
}

/* ---------- match words ---------- */

/** A match label in words: the top one is the closest; Same reads Very close, Different Not close. */
export function matchWord(m: EvidenceMatch | undefined, top: boolean): string {
  if (!m) return "Not run";
  if (top && m.label !== "Different") return "Closest match";
  return m.label === "Same" ? "Very close" : m.label === "Close" ? "Close" : "Not close";
}
/** The row's match cell: why it is close, or why there is no ranking. */
export function matchCell(r: EvRow, m: EvidenceMatch | undefined, top: boolean): { word: string; why: string; strong: boolean } {
  if (r.kind === "example") return { word: "Example, not ranked", why: "", strong: false };
  if (!isReady(r)) return { word: "Finish the case to rank it", why: "", strong: false };
  if (!m) return { word: "Not run", why: "", strong: false };
  const why = m.same.length ? m.same.join(", ") : m.diff.length ? `Different: ${m.diff.join(", ")}` : "";
  return { word: matchWord(m, top), why, strong: m.label !== "Different" };
}
/** The key of the top-ranked case, or null. */
export function topOf(matches: ReadonlyMap<string, EvidenceMatch>): string | null {
  let best: string | null = null;
  let n = -1;
  for (const [k, m] of matches) if (matchRank(m) > n) (n = matchRank(m)), (best = k);
  return best;
}

/* ---------- the columns' fill line ---------- */

export function fillLine(rows: readonly EvRow[], matching: string | null, matchedN: number) {
  const own = ownRows(rows);
  const ready = own.filter(isReady);
  const pct = (n: number) => (own.length ? `${Math.round((n / own.length) * 100)}%` : "0%");
  const named = own.filter((r) => r.kind === "case" && r.c.clientNamed).length;
  const fromSeats = own.filter((r) => !!r.seat).length;
  const used = new Set(own.flatMap((r) => (r.kind === "case" ? r.c.usedIn : []))).size;
  const out: { key: string; name: string; fill: string }[] = [
    { key: "case", name: "Case", fill: `${ready.length} ready · ${plural(own.length - ready.length, "draft")}` },
  ];
  if (matching) out.push({ key: "match", name: `Match to ${matching}`, fill: `${matchedN} of ${own.length} ranked` });
  out.push(
    { key: "client", name: "Client", fill: `${named} named in proposals` },
    { key: "ind", name: "Industry and size", fill: own.length && fromSeats === own.length ? "100% from your seats" : pct(own.filter((r) => factsOf(r).industry).length) },
    { key: "motion", name: "Motion and sold to", fill: pct(own.filter((r) => factsOf(r).motion || factsOf(r).soldTo).length) },
    { key: "probs", name: "Problems solved", fill: `${pct(own.filter((r) => problemsOf(r).length).length)} written` },
    { key: "work", name: "Type of work", fill: `${pct(own.filter((r) => tagsOf(r).length).length)} tagged` },
    { key: "outs", name: "Before and after", fill: `${pct(own.filter((r) => outcomesOf(r).length).length)} have numbers` },
    { key: "with", name: "Worked with", fill: pct(own.filter((r) => r.kind === "case" && r.c.workedWith.length).length) },
    { key: "used", name: "Used in", fill: plural(used, "proposal") },
    { key: "card", name: "On my card", fill: `${own.filter((r) => r.kind === "case" && r.c.showOnCard).length} shown` },
  );
  return out;
}

/* ---------- the three questions ---------- */

export const QUESTIONS = [
  { q: "What was the problem?", hint: "What was broken or stuck when you arrived. Pick what fits, or write it in your words, one problem a line.", ph: "Four reps sold four different ways, and the forecast missed by 30% a quarter." },
  { q: "What did you do?", hint: "The work itself, in your words. Then tag the type of work: it is what Merlin matches companies on.", ph: "Set one sales process and a weekly forecast, and wrote the first playbook." },
  { q: "What changed, in numbers?", hint: "Before and after, with the unit. Rough numbers are fine. Leave it empty if you have none: Merlin never fills a number in for you.", ph: "" },
] as const;

/** Problems typed one a line, cleaned: no blanks, no repeats, each at most 200 characters, at most 8. */
export function problemLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const t = raw.replace(/^[\s\-•*]+/, "").trim().slice(0, 200);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, 8);
}
/** The numbers kept: a row needs what was measured and at least one side. */
export const cleanOutcomes = (xs: readonly EvidenceOutcome[]): EvidenceOutcome[] =>
  xs
    .map((o) => ({ k: o.k.trim().slice(0, 80), before: o.before.trim().slice(0, 40), after: o.after.trim().slice(0, 40), ...(o.unit?.trim() ? { unit: o.unit.trim().slice(0, 20) } : {}) }))
    .filter((o) => o.k && (o.before || o.after))
    .slice(0, 6);

/** Q1's first words, from why they hired on the seat ("Build the first sales motion"), for the member to change. */
export const seededProblem = (s: SeatLite | null) => (s?.why ? `They brought me in to ${low(s.why)}.` : "");

/** A case is ready once the problem and what they did are written (numbers are welcome, never required). */
export const canBeReady = (x: { problems: readonly string[]; text: string }) => x.problems.length > 0 && x.text.trim().length > 0;

/** A title from the answers when the member gave none: the first problem turned around, else the seat. */
export function titleFrom(problems: readonly string[], seat: SeatLite | null): string {
  const p = problems[0]?.replace(/\.$/, "");
  if (p) return p.length > 70 ? `${p.slice(0, 67)}...` : p;
  return seat ? `${seat.role || "Fractional"} seat${seat.dates ? `, ${seat.dates}` : ""}` : "A case";
}

/* ---------- how it reads in a Proof part ---------- */

/**
 * The case as a reader sees it in a proposal's Proof part: a template that joins the member's own
 * answers (no AI writes it). The client is "a health care company, $20M to $50M" unless named.
 */
export function readsAs(c: Pick<EvidenceCase, "clientNamed" | "clientLabel" | "industry" | "size" | "revenue" | "problems" | "text" | "outcomes">, clientName: string | null): string {
  const who = c.clientNamed && clientName ? `${clientName}, ${low(labelOf(c))},` : labelOf(c);
  const probs = c.problems.map((p) => low(p.replace(/\.$/, "")));
  const had = probs.length ? ` came in with ${probs.length > 1 ? `${probs.slice(0, -1).join(", ")} and ${probs[probs.length - 1]}` : probs[0]}.` : ".";
  const did = c.text.trim() ? ` ${c.text.trim().replace(/([^.])$/, "$1.")}` : "";
  const nums = c.outcomes.length ? ` ${c.outcomes.map((o, n) => `${n ? low(o.k) : o.k} went from ${o.before || "not measured"} to ${o.after || "not measured"}${o.unit ? ` ${o.unit}` : ""}`).join(", ")}.` : "";
  return `${who}${had}${did}${nums}`;
}

/* ---------- what the library covers, and the status line ---------- */

export function coverage(rows: readonly EvRow[]) {
  const own = ownRows(rows);
  const groups = tagGroups();
  const proven = groups.map((g) => own.some((r) => hasCat(r, g.cat)));
  const n = proven.filter(Boolean).length;
  const missing = groups.filter((_, i) => !proven[i]).map((g) => g.cat);
  return {
    n,
    of: groups.length,
    line: n === 0 ? "Build your first case and the work it proves shows here and, if you choose, on your card." : n === groups.length ? "Every category has a finished case." : `None yet for ${missing.join(", ")}.`,
  };
}

export function statusLine(rows: readonly EvRow[], first: boolean, matching: string | null, matchedN: number): string {
  const own = ownRows(rows);
  const ready = own.filter(isReady).length;
  if (matching) return `Match to ${matching} · ${matchedN} of ${own.length} ranked · free`;
  const used = new Set(own.flatMap((r) => (r.kind === "case" ? r.c.usedIn : []))).size;
  if (first) return `Private to you. Building a case costs no credits. ${ready} of ${own.length} ready.`;
  return `Private to you · ${ready} ready, ${plural(own.length - ready, "draft")} · used in ${plural(used, "proposal")}`;
}

/** Words for no export, kept here so the test can check the page never offers one. */
export const NO_EXPORT = /\b(export|download|csv)\b/i;
