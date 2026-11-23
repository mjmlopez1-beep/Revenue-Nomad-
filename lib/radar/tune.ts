/**
 * Tuning Crystal Ball (Profile.radarTune): a member leans their ball toward the kinds of signal
 * they care about, three steps a kind, Less, Normal and More. Pure, no Node imports, so the page,
 * lib/table.ts and lib/radar/match.ts all read it.
 *
 * Each signal kind (lib/radar/types.ts RadarKind) sits in one group, the way members think about
 * it ("A role like yours is posted", "They are growing"). A group's step multiplies the score of
 * every signal in it (match.ts scoreFor), before the caps that keep a company with a full-time
 * leader under Medium and a gap or an unread team page under High, and after the floor that decides
 * whether a signal is in the ball at all. So tuning re-orders the ball and can move a band, but it
 * never adds a company to the ball or drops one from it, and with every group at Normal (the
 * default, and anyone who never tuned) every score is exactly what it was.
 */
import type { RadarKind } from "./types";

export type TuneGroup = "role" | "seat" | "lead" | "adj" | "rep" | "grow" | "gap";
/** 0 Less, 1 Normal, 2 More. */
export type TuneStep = 0 | 1 | 2;
/** What the member set. A group left out is Normal. */
export type RadarTune = Partial<Record<TuneGroup, TuneStep>>;

/** Less counts a signal half, More one and a half times. */
export const TUNE_MULTIPLIERS: Record<TuneStep, number> = { 0: 0.5, 1: 1, 2: 1.5 };
export const TUNE_WORDS: Record<TuneStep, string> = { 0: "Less", 1: "Normal", 2: "More" };

/** The groups in the order the page lists them, each with the words members read and the kinds in it. */
export const TUNE_GROUPS: { key: TuneGroup; label: string; kinds: RadarKind[]; ask: string[] }[] = [
  { key: "role", label: "A role like yours is posted", kinds: ["role"], ask: ["role", "post", "job", "opening"] },
  { key: "seat", label: "A seat like yours ended, or is a year in", kinds: ["seat", "tenure"], ask: ["seat", "ended", "tenure", "year in"] },
  { key: "lead", label: "A leader left, or a new one arrived", kinds: ["departure", "arrival"], ask: ["leader", "left", "ceo", "arriv", "depart", "new leader"] },
  { key: "adj", label: "They hired a fractional in another function", kinds: ["adjacent"], ask: ["another function", "cmo", "cfo", "marketing", "finance", "adjacent", "other function"] },
  { key: "rep", label: "They have hired fractionals before", kinds: ["rehire"], ask: ["repeat", "before", "rehire", "hired fractionals"] },
  { key: "grow", label: "They are growing: money, sales hires, people", kinds: ["funding", "sales-build", "team-build", "headcount"], ask: ["grow", "money", "fund", "raise", "people", "headcount", "sales hires", "team"] },
  { key: "gap", label: "No leader like you on their team page", kinds: ["gap"], ask: ["gap", "no leader", "no sales", "team page"] },
];

const GROUP_OF = new Map<RadarKind, TuneGroup>(TUNE_GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.key] as const)));
/** The group a signal kind is in. */
export const tuneGroupOf = (kind: RadarKind): TuneGroup => GROUP_OF.get(kind) ?? "grow";

/** What the member set, cleaned: known groups only, steps 0 to 2, Normal left out. Empty when nothing is tuned. */
export function cleanTune(x: unknown): RadarTune {
  const out: RadarTune = {};
  if (!x || typeof x !== "object") return out;
  for (const g of TUNE_GROUPS) {
    const v = (x as Record<string, unknown>)[g.key];
    if (v === 0 || v === 2) out[g.key] = v;
  }
  return out;
}

/** Any group off Normal. */
export const isTuned = (t: RadarTune | null | undefined) => !!t && Object.values(t).some((v) => v === 0 || v === 2);
/** How many groups are off Normal. */
export const tunedCount = (t: RadarTune | null | undefined) => (t ? Object.values(t).filter((v) => v === 0 || v === 2).length : 0);
/** The multiplier on one signal kind for this member: 1 unless they tuned its group. */
export const tuneMultiplier = (t: RadarTune | null | undefined, kind: RadarKind) => TUNE_MULTIPLIERS[(t?.[tuneGroupOf(kind)] ?? 1) as TuneStep] ?? 1;

/**
 * "roles matter more", "count ended seats more", "growth matters less": the groups the words name
 * and the step they ask for (More unless the words say less or lower). Nothing found: an empty
 * list, and the page says so instead of guessing.
 */
export function tuneFromWords(text: string): { group: TuneGroup; step: TuneStep }[] {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return [];
  const less = /\b(less|lower|fewer|down|ignore|not much)\b/.test(t);
  const normal = /\b(normal|reset|default)\b/.test(t);
  const step: TuneStep = normal ? 1 : less ? 0 : 2;
  return TUNE_GROUPS.filter((g) => g.ask.some((w) => t.includes(w))).map((g) => ({ group: g.key, step }));
}
