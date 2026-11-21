/**
 * Your network's page, without React: what each of its four parts lists, in order, from the
 * member's own NetworkView (lib/google). The page draws exactly these lists, and every count on it
 * (the four numbers at the top, the connect moment's) is one of these lists' length, so a number
 * always leads to that many rows.
 *
 *   1. warmRows: warm paths into companies likely to hire the member (view.warm, the server's order).
 *   2. clientRows: their clients now, by the calendar or their own seat.
 *   3. view.intros: people who can introduce them.
 *   4. everyone: every company and person, searchable and filtered; peopleCount is its people.
 *
 * Pure, so the checks (scripts/test-google-pages.mts) run it on the answers the server gives.
 */
import type { IntroView, LooseView, NetCompanyView, NetPersonView, NetworkView, Warmth } from "@/lib/google/types";

/** The person a warm path leads with: a decision maker who isn't cold, else the warmest with a name. Never someone the member hid. */
export function bestPerson(c: NetCompanyView): NetPersonView | null {
  const named = c.people.filter((p) => !p.hidden && !!p.name);
  return named.find((p) => p.dm && p.warmth !== "Cold") ?? named[0] ?? null;
}

export type WarmFilter = "all" | "likely" | "fit" | "ball";

/** Warm paths, best first, cut by the filter. */
export function warmRows(view: NetworkView, f: WarmFilter = "all"): NetCompanyView[] {
  const by = new Map(view.companies.map((c) => [c.id, c]));
  const rows = view.warm.map((id) => by.get(id)).filter((c): c is NetCompanyView => !!c);
  if (f === "likely") return rows.filter((c) => c.odds?.band === "High" || c.odds?.band === "Medium");
  if (f === "fit") return rows.filter((c) => c.fit === true);
  if (f === "ball") return rows.filter((c) => c.ball);
  return rows;
}

/** The member's clients now: confirmed seats first, then the ones the calendar shows, most meetings first. */
export function clientRows(view: NetworkView): NetCompanyView[] {
  return view.companies.filter((c) => !!c.client).sort((a, b) => Number(!!b.client!.seat) - Number(!!a.client!.seat) || b.meetings - a.meetings || a.name.localeCompare(b.name));
}

/** "fits": a company in the profile; "no": not; "any". */
export type FitFilter = "any" | "fits" | "no";
export const SIZE_GROUPS: { key: string; label: string; of: string[] }[] = [
  { key: "small", label: "1–50", of: ["1–10", "11–50"] },
  { key: "mid", label: "51–200", of: ["51–200"] },
  { key: "large", label: "201–1,000", of: ["201–500", "501–1,000"] },
  { key: "xl", label: "1,001+", of: ["1,001+"] },
];
export interface EveryoneFilter {
  q: string;
  warmth: Warmth | "any";
  fit: FitFilter;
  size: string;
  /** Show what is set aside and the people hidden, instead of the relationships. */
  hidden: boolean;
}
export const NO_FILTER: EveryoneFilter = { q: "", warmth: "any", fit: "any", size: "any", hidden: false };

const has = (hay: (string | null | undefined)[], q: string) => hay.some((x) => !!x && x.toLowerCase().includes(q));

/**
 * Everyone, filtered: companies (each with the people to show) and the people at no company on
 * Merlin. Relationships by default; with `hidden`, only what is set aside and the people hidden.
 */
export function everyone(view: NetworkView, f: EveryoneFilter = NO_FILTER): { companies: { c: NetCompanyView; people: NetPersonView[] }[]; loose: LooseView[] } {
  const q = f.q.trim().toLowerCase();
  const size = SIZE_GROUPS.find((g) => g.key === f.size);
  const companies: { c: NetCompanyView; people: NetPersonView[] }[] = [];
  for (const c of view.companies) {
    if (f.fit === "fits" && c.fit !== true) continue;
    if (f.fit === "no" && c.fit !== false) continue;
    if (size && !(c.employees && size.of.includes(c.employees))) continue;
    const coMatch = !q || has([c.name, c.site, c.industry], q);
    const people = c.people.filter((p) => {
      if (f.hidden ? !(c.set || p.hidden) : c.set || p.hidden) return false;
      if (f.warmth !== "any" && p.warmth !== f.warmth) return false;
      return coMatch || has([p.name, p.title, p.email], q);
    });
    // A company with nobody named (counts only) still lists, as itself, when it matches.
    const bare = !c.people.some((p) => p.name);
    const showBare = bare && (f.hidden ? !!c.set : !c.set) && (f.warmth === "any" || c.warmth === f.warmth) && coMatch;
    if (people.length || showBare) companies.push({ c, people });
  }
  const loose = f.fit !== "any" || size ? [] : view.loose.filter((p) => (f.hidden ? p.hidden : !p.hidden) && (f.warmth === "any" || p.warmth === f.warmth) && (!q || has([p.name, p.title, p.org, p.domain, p.email], q)));
  return { companies, loose };
}

/** The people the Everyone list shows with no filter: the "N people" number at the top is this. */
export function peopleCount(view: NetworkView): number {
  const e = everyone(view);
  return e.companies.reduce((a, x) => a + x.people.length, 0) + e.loose.length;
}

/** What the four numbers at the top say, each the length of the list it opens. */
export function topNumbers(view: NetworkView): { warm: number; clients: number; intros: number; people: number } {
  return { warm: view.warm.length, clients: clientRows(view).length, intros: view.intros.length, people: peopleCount(view) };
}

/** "Fits your profile: SaaS · 51–200" when it fits, else null. */
export const fitWords = (c: NetCompanyView) => (c.fit ? `Fits your profile${[c.industry, c.employees].some(Boolean) ? `: ${[c.industry, c.employees].filter(Boolean).join(" · ")}` : ""}` : null);

/** The set-aside line: "Looks like a vendor: …" (Merlin's, with Undo) or "You said: a vendor selling to you". */
export function setWords(c: Pick<NetCompanyView, "set">): string | null {
  const s = c.set;
  if (!s) return null;
  if (s.by === "you") return `You said: ${s.why.charAt(0).toLowerCase()}${s.why.slice(1)}`;
  const what = s.kind === "vendor" ? "Looks like someone selling to you" : s.kind === "recruiter" ? "Looks like a recruiter" : "Looks like an investor";
  return `${what}. ${s.why}.`;
}

/** An introducer's line under their name: "Partner · Northpeak Ventures". */
export const introWho = (p: IntroView) => [p.title, p.org].filter(Boolean).join(" · ");
