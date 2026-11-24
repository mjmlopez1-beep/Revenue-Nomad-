/**
 * Evidence Bank's page model, pure so scripts/test-evidence-page.mts checks it with no browser:
 * who sees the page (Close only), the table (column A the client company with its real name and
 * logo, column B its case studies as tiles), each tile's words, the blanks an agent left, the tag
 * search and the quick picks, the wizard's steps and where it picks up, and the "Build this for
 * me" prompt the member takes to their own Claude.
 *
 * Rules it keeps:
 *   - Close only (BUILD_PLAN part 8): on Free and Pro the page is the upgrade screen.
 *   - The page is the member's own: the client's name and logo show here. Whether the name goes
 *     into proposals and onto their card is each case study's own switch (clientNamed, off).
 *   - Numbers are the member's own. An empty answer stays empty; nothing is invented, and the
 *     prompt tells their agent the same.
 *   - No export: nothing here downloads anything.
 */
import { datesOf, outcomeLine } from "@/lib/evidence/types";
import type { Study, TagCatalogue, TagRef } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- who sees it ---------- */

/** Close is the member's (the trial counts; no plan means billing is off and nothing is gated). */
export const evidenceOpen = (plan: { canClose: boolean } | null | undefined) => !plan || plan.canClose;

/** The upgrade screen's words: what Evidence Bank does, for a member on Free or Pro. */
export const UPGRADE = {
  title: "Evidence Bank is part of Close",
  lead: "Your case studies in one place: each client, what you did there and the result. Merlin puts the closest one into every proposal you send.",
  points: [
    { h: "Built from your seats", p: "Each client you worked with starts a case study with the company, your role and the dates filled in. A few short questions finish it: the problem, what you did, the result." },
    { h: "Private by default", p: "Only you see your case studies. In a proposal the client's name stays out, and it reads like \"A health care company, $20M to $50M\", until you choose to name the client." },
    { h: "Matched to any company", p: "Merlin says which case study is closest to a company and why, in words. Matching never costs a credit." },
    { h: "Build this for me", p: "With Claude connected, Claude looks through your email and its memory of your work, saves the case studies it finds, and leaves blanks for you to fill." },
  ],
  cta: "See the Close plan",
} as const;

/* ---------- a seat, as the page reads it ---------- */

/** A seat of the member's, as much of it as a case study needs (from SeatInfo: the company's free facts, the seat's own). */
export interface SeatLite {
  id: string;
  /** The company's public id (its logo comes from /api/logo/<id>). */
  companyId: string;
  /** The client's name, for the member's own eyes. Empty while the company is locked for them. */
  company: string;
  hidden: boolean;
  industry: string;
  size: string;
  revenue: string;
  motion: string;
  role: string;
  /** "Feb to Dec 2024", "Since Jun 2026". */
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
/** "201 to 500 people · $20M to $50M revenue". */
export const sizeWords = (f: { size?: string; revenue?: string }) => [f.size ? `${f.size.replace(/–/g, " to ")} people` : "", f.revenue ? `${f.revenue.replace(/–/g, " to ")} revenue` : ""].filter(Boolean).join(" · ");

/* ---------- the table: column A the company, column B its case studies ---------- */

export interface CompanyRow {
  key: string;
  /** The client's real name (this page is the member's own), or "" when there is none to show. */
  name: string;
  /** The company's public id, for its logo; null for a company typed in that isn't on Merlin. */
  logoId: string | null;
  /** "Health Care · 201 to 500 people". */
  facts: string;
  /** A seat the member held there, when there is one (Add a case study starts from it). */
  seat: SeatLite | null;
  cases: Study[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameOf = (c: Study) => (c.client.name ?? "").trim();
const keyOfCase = (c: Study) => (nameOf(c) ? `n:${norm(nameOf(c))}` : c.companyId ? `c:${c.companyId}` : "x:unnamed");

/**
 * One row a company: its case studies (newest first), the company's name and logo, its facts. A
 * seat the member held with no case study yet is a row too, so its "Add a case study" is one
 * click. Companies with case studies come first, the one changed last on top.
 */
export function companyRows(cases: readonly Study[], seats: readonly SeatLite[]): CompanyRow[] {
  const rows = new Map<string, CompanyRow>();
  const seatKey = (s: SeatLite) => (s.company ? `n:${norm(s.company)}` : `c:${s.companyId}`);
  const seatsByKey = new Map(seats.map((s) => [seatKey(s), s]));
  const sorted = [...cases].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  for (const c of sorted) {
    const k = keyOfCase(c);
    let r = rows.get(k);
    if (!r) {
      const seat = seatsByKey.get(k) ?? (c.seatId ? seats.find((s) => s.id === c.seatId) ?? null : null);
      r = { key: k, name: nameOf(c) || seat?.company || "", logoId: c.companyId ?? seat?.companyId ?? null, facts: "", seat: seat ?? null, cases: [] };
      rows.set(k, r);
    }
    if (!r.logoId && c.companyId) r.logoId = c.companyId;
    r.cases.push(c);
  }
  for (const s of seats) {
    const k = seatKey(s);
    if (!rows.has(k)) rows.set(k, { key: k, name: s.company, logoId: s.companyId, facts: "", seat: s, cases: [] });
  }
  for (const r of rows.values()) {
    const f = r.cases.find((c) => c.industry || c.size) ?? null;
    const industry = f?.industry || r.seat?.industry || "";
    const size = f?.size || r.seat?.size || "";
    r.facts = [industry, size ? `${size.replace(/–/g, " to ")} people` : ""].filter(Boolean).join(" · ");
  }
  return [...rows.values()].sort((a, b) => Number(!a.cases.length) - Number(!b.cases.length));
}
/** The company's name as column A shows it. */
export const companyName = (r: Pick<CompanyRow, "name" | "facts">) => r.name || "Client company";

/** The rows a search keeps: the company's name, or any word of a case study (title, role, problem, what you did, result, tags). */
export function searchRows(rows: readonly CompanyRow[], q: string): CompanyRow[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [...rows];
  const hay = (c: Study) => norm([c.title, c.role, c.answers.problem, c.answers.did, c.answers.numbers, c.took, c.quote?.text ?? "", ...c.workType, c.industry].join(" "));
  const out: CompanyRow[] = [];
  for (const r of rows) {
    const co = norm(`${r.name} ${r.facts}`);
    if (words.every((w) => co.includes(w))) {
      out.push(r);
      continue;
    }
    const cases = r.cases.filter((c) => words.every((w) => hay(c).includes(w) || co.includes(w)));
    if (cases.length) out.push({ ...r, cases });
  }
  return out;
}

/* ---------- one tile ---------- */

/** The tile's title: the member's, else the role and dates. */
export const titleOf = (c: Pick<Study, "title" | "role" | "dates">) => c.title.trim() || `${c.role || "Fractional work"}${c.dates ? `, ${c.dates}` : ""}`;
/** The result in one line: the first number as typed, else the result's first sentence, else "". */
export function resultLine(c: Pick<Study, "outcomes" | "answers" | "took">): string {
  const o = c.outcomes[0];
  const took = c.took?.trim() ? ` in ${c.took.trim().replace(/^in\s+/i, "")}` : "";
  if (o) return `${outcomeLine(o)}${took}`;
  const first = c.answers.numbers.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  if (!first) return "";
  return `${first.length > 110 ? `${first.slice(0, 107).trimEnd()}...` : first.replace(/[.]$/, "")}${took}`;
}
export type Tone = "ready" | "draft" | "review";
/** Where a case study stands, in a word or two: Ready, Draft (and how many blanks), From Claude · review. */
export function statusOf(c: Pick<Study, "status" | "review" | "from" | "blanks">): { word: string; tone: Tone } {
  if (c.review) return { word: `From ${c.from || "your agent"} · review`, tone: "review" };
  if (c.blanks.length) return { word: `Draft · ${plural(c.blanks.length, "blank")} to fill`, tone: "draft" };
  return c.status === "ready" ? { word: "Ready", tone: "ready" } : { word: "Draft", tone: "draft" };
}
/** Words with the blanks marked: [{ t, blank }]. */
export function splitBlanks(text: string): { t: string; blank: boolean }[] {
  const out: { t: string; blank: boolean }[] = [];
  let at = 0;
  for (const m of String(text ?? "").matchAll(/\[[^[\]\n]{2,80}\]/g)) {
    if (m.index! > at) out.push({ t: text.slice(at, m.index), blank: false });
    out.push({ t: m[0], blank: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at), blank: false });
  return out;
}
/** A blank is still in these words. */
export const hasBlank = (...t: (string | undefined)[]) => t.some((x) => /\[[^[\]\n]{2,80}\]/.test(x ?? ""));

/** A case study is ready once the problem and what you did are written, and no blank is left. */
export const canBeReady = (x: { problem: string; did: string }, ...rest: (string | undefined)[]) => !!x.problem.trim() && !!x.did.trim() && !hasBlank(x.problem, x.did, ...rest);

/** Months for the form: "2024-02" stays, "Ongoing" is no end. */
export const monthOk = (m: string) => !m || /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(m);
export const datesWords = (start: string, end: string) => datesOf(start, end);

/* ---------- tags: search, and the quick picks ---------- */

/** The catalogue to search: every known tag, or the categories alone when the full list isn't loaded. */
export function tagPool(cat: TagCatalogue): TagRef[] {
  return cat.tags.length ? cat.tags : cat.categories.map((c) => ({ name: c, category: c }));
}

/** Tags matching what was typed, best first: a tag that starts with it, then a word that does, then anywhere. Picked ones left out. */
export function searchTags(q: string, cat: TagCatalogue, picked: readonly string[], max = 8): TagRef[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const have = new Set(picked.map((x) => x.toLowerCase()));
  const words = t.split(/\s+/);
  const scored: { r: TagRef; s: number }[] = [];
  for (const r of tagPool(cat)) {
    const n = r.name.toLowerCase();
    if (have.has(n)) continue;
    const inCat = r.category.toLowerCase();
    if (!words.every((w) => n.includes(w) || inCat.includes(w))) continue;
    const s = n.startsWith(t) ? 0 : n.split(/[\s/-]+/).some((w) => w.startsWith(words[0])) ? 1 : words.every((w) => n.includes(w)) ? 2 : 3;
    scored.push({ r, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.r.name.length - b.r.name.length || a.r.name.localeCompare(b.r.name)).slice(0, max).map((x) => x.r);
}

const STOP = new Set("the and for with from that this into over our their them they then than was were are has have had its it's out off per via all any one two new how what when who why your you yours about after before more most less very just also each team teams work worked working".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
const tokens = (s: string) => new Set(String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem));
/** The tag categories a seat's function or role points to. */
export function categoriesFor(fn: string, role: string): string[] {
  const t = `${fn} ${role}`.toLowerCase();
  const out: string[] = [];
  if (/revops|revenue op|sales op|gtm stack/.test(t)) out.push("Revenue Operations");
  if (/enablement/.test(t)) out.push("Sales Enablement");
  if (/sales|cro|revenue|business development|bdr|sdr/.test(t)) out.push("Sales Leadership", "Sellers");
  if (/marketing|cmo|growth|brand|demand/.test(t)) out.push("Marketing");
  if (/customer success|\bcs\b|account management|retention/.test(t)) out.push("Customer Success and Growth");
  if (/partner|channel|alliance/.test(t)) out.push("Partnerships");
  if (/\bai\b|ai gtm/.test(t)) out.push("AI go-to-market");
  if (/finance|cfo|controller|fp&a|accounting/.test(t)) out.push("Finance");
  if (/technology|cto|engineering|it\b|product/.test(t)) out.push("Technology");
  return [...new Set(out)];
}
/**
 * The 5 to 8 tags most likely to fit a case study, for quick picks: tags whose words are in its
 * words (title, role, the problem, what you did, the result, the company's industry), the ones in
 * its function's categories first; then, to make five, its categories' own tags. Picked ones left out.
 */
export function suggestTagsFor(c: { title?: string; role?: string; fn?: string; industry?: string; answers?: { problem?: string; did?: string; numbers?: string } }, cat: TagCatalogue, picked: readonly string[], max = 8): string[] {
  const pool = tagPool(cat);
  const have = new Set(picked.map((x) => x.toLowerCase()));
  const words = tokens([c.title, c.role, c.fn, c.industry, c.answers?.problem, c.answers?.did, c.answers?.numbers].join(" "));
  const cats = categoriesFor(c.fn ?? "", c.role ?? "");
  const scored: { name: string; s: number }[] = [];
  for (const r of pool) {
    if (have.has(r.name.toLowerCase())) continue;
    const tw = [...tokens(r.name)];
    const hit = tw.filter((w) => words.has(w)).length;
    if (!hit) continue;
    scored.push({ name: r.name, s: hit * 10 + (hit === tw.length ? 5 : 0) + (cats.includes(r.category) ? 3 : 0) });
  }
  const out = scored.sort((a, b) => b.s - a.s || a.name.length - b.name.length).map((x) => x.name);
  for (const k of cats) {
    if (out.length >= 5) break;
    for (const r of pool) {
      if (out.length >= 5) break;
      if (r.category === k && !have.has(r.name.toLowerCase()) && !out.includes(r.name)) out.push(r.name);
    }
  }
  return [...new Set(out)].slice(0, max);
}

/**
 * Which tag categories the member's saved case studies cover ("3 of 10 categories"), from the case
 * studies themselves, the same list the table draws, so a save moves it at once: each case study
 * counts for its tags' categories (a category's own name counts as that category), and a case
 * study with no tag yet for the category its seat or role points to. Every saved case study counts,
 * drafts and ones to review included: it is what is in the bank, not what is in proposals.
 */
export function coverageOf(cases: readonly Pick<Study, "workType" | "fn" | "role">[], cat: TagCatalogue): { n: number; of: number; covered: string[] } {
  const all = cat.categories.length ? cat.categories : [];
  const byTag = new Map(cat.tags.map((t) => [t.name.toLowerCase(), t.category]));
  const named = new Map(all.map((k) => [k.toLowerCase(), k]));
  const covered = new Set<string>();
  for (const c of cases) {
    const fromTags = c.workType.map((t) => byTag.get(t.toLowerCase()) ?? named.get(t.toLowerCase())).filter((k): k is string => !!k);
    const ks = fromTags.length ? fromTags : categoriesFor(c.fn, c.role).slice(0, 1);
    for (const k of ks) if (!all.length || all.includes(k)) covered.add(k);
  }
  const order = all.length ? all : [...covered];
  return { n: covered.size, of: all.length || covered.size, covered: order.filter((k) => covered.has(k)) };
}

/* ---------- the wizard ---------- */

export const WIZ_STEPS = [
  { key: "client", h: "Pick a client you did great work for", p: "One of your seats on Merlin, or type the company." },
  { key: "work", h: "What was the problem, and what did you do?", p: "Two short answers, in your own words." },
  { key: "result", h: "What changed?", p: "The result with a number, and how long it took." },
  { key: "vouch", h: "Who can vouch for it?", p: "A quote from the client, if you have one. You can skip this." },
] as const;
export type WizStep = 0 | 1 | 2 | 3 | 4;

/** The step a case study picks up at: the problem and what you did, then the result, then who can vouch. */
export function stepOf(c: Pick<Study, "answers"> | null): WizStep {
  if (!c) return 0;
  if (!c.answers.problem.trim() || !c.answers.did.trim()) return 1;
  if (!c.answers.numbers.trim()) return 2;
  return 3;
}
/** Where the wizard was left, kept in this browser only (the case study itself is on Merlin). */
export interface WizResume {
  caseId: string;
  step: WizStep;
}
export const wizKey = (memberId: string) => `rn-ev-wizard:${memberId}`;
export function readResume(raw: string | null | undefined): WizResume | null {
  try {
    const j = JSON.parse(String(raw ?? "")) as Partial<WizResume>;
    if (typeof j.caseId !== "string" || !j.caseId || typeof j.step !== "number" || j.step < 0 || j.step > 3) return null;
    return { caseId: j.caseId, step: j.step as WizStep };
  } catch {
    return null;
  }
}
/**
 * Where to pick up: the case study the wizard was on, while it is still unfinished, at the later
 * of the step kept and the step its answers say. On a first visit with nothing kept, the newest
 * unfinished draft. Null when there is nothing to pick up.
 */
export function resumeAt(kept: WizResume | null, cases: readonly Study[], first: boolean): WizResume | null {
  const open = (c: Study) => c.status !== "ready" && !c.review;
  const c = kept ? cases.find((x) => x.id === kept.caseId) : null;
  if (c && open(c)) return { caseId: c.id, step: Math.max(kept!.step, stepOf(c)) as WizStep };
  if (!first) return null;
  const d = [...cases].filter((x) => open(x) && !!(x.answers.problem || x.answers.did)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  return d ? { caseId: d.id, step: stepOf(d) } : null;
}
/** A first visit: no case study is ready yet. */
export const isFirstVisit = (cases: readonly Study[]) => !cases.some((c) => c.status === "ready");

/* ---------- Build this for me ---------- */

/** Which agent the member connected, by the name it registered (Agent access). Claude on claude.ai and the desktop app opens by a link. */
export function agentState(apps: readonly { name: string }[]): { claude: boolean; any: boolean; names: string[] } {
  const names = apps.map((a) => a.name);
  return { claude: names.some((n) => /claude/i.test(n) && !/claude[\s_-]*code/i.test(n)), any: names.length > 0, names };
}

/**
 * The prompt the member takes to their own Claude: use its memory and their connected email to
 * find past client engagements, save each one with Merlin's save_evidence_case, leave marked
 * blanks where unsure and never invent a number. It asks before it saves. Claude reads the email
 * in the member's own Claude account: Merlin never sees it.
 */
export function buildPrompt(origin: string): string {
  const page = `${origin.replace(/\/$/, "")}/?p=evidence`;
  return [
    "Please build my case studies in Merlin's Evidence Bank. Merlin is connected to you as a connector.",
    "",
    "1. Use what you remember about my work, and search my connected email (Gmail or Outlook) for my past client engagements: proposals, statements of work, kickoff and wrap-up notes, results updates, thank-you notes.",
    "2. For each client, find: the company, my seat or role (like Fractional VP Sales), the start and end month, the problem when I got there, what I did, the result with numbers, how long it took, and a quote from someone there who can vouch for it, with their name and title.",
    "3. Never invent, round or guess a number, a date, a name or a quote. Where you are not sure, leave a clearly marked blank like [add the result number], [add how long it took] or [add a quote]. Leave a date out rather than guess it.",
    "4. Show me the list first and ask which ones to save. Then call Merlin's save_evidence_case once per case study, with confirm: true. Put the company in client_name and leave client_named off, so the client's name stays out of my proposals until I choose.",
    `5. When you're done, tell me how many you saved and which blanks are left, and remind me to review them in Merlin's Evidence Bank (${page}), where each one shows "From Claude · review" until I check it.`,
  ].join("\n");
}
/** Claude with the prompt ready to send (the member presses send there; nothing runs before that). */
export const claudeLink = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

/** Words this page never uses: generic AI talk, not how fractionals speak. */
export const NOT_OUR_WORDS = /\b(insights?|leverag\w*|unlock (your )?potential|artifacts?|entit(y|ies)|synerg\w*|empower\w*|supercharge\w*|seamless\w*)\b/i;
