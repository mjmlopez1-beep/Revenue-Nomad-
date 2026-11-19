/**
 * Which signals are for which member. Pure, apart from beforeSuggested, which reads the table.
 *
 *   - The company is in the member's Ideal Fractional Profile, read the way the table's profile
 *     pill reads it (icpTest in app/post/model.ts): no known fact conflicts, and at least one part
 *     the profile asks for is on file and matches. A member with no profile matches nothing.
 *   - role and seat: the role or seat is in the member's function.
 *   - adjacent: the hire is in a function that usually comes before theirs: the ones they named
 *     (Profile.before), else the suggestion onboarding makes (beforeOrder in
 *     app/onboard/firstView.ts: our data where it says something, else the usual ones), and the
 *     company has no fractional in the member's own function yet.
 *   - funding: any function.
 * A member with no function (or "Other") has no radar: nothing says what's theirs.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { countryKey } from "../mcp/alerts";
import { beforeOrder } from "@/app/onboard/firstView";
import type { CoInfo } from "@/app/post/model";
import type { CompanyRec, EngagementRec, Icp } from "../tableTypes";
import type { CompanyFacts, RawSignal } from "./signals";
import { isLeaderRaw } from "./signals";

export interface RadarProfile {
  memberId: string;
  fn: string | null;
  icp: Icp | null;
  /** Functions that usually come before theirs. */
  before: string[];
  /** `before` is the member's own answer (else the suggestion). */
  beforeFromMember: boolean;
}

export const icpIsEmpty = (icp: Icp | null | undefined) => !icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);

/** The company against the profile: icpTest's rule on the company's free facts. */
export function inIcp(icp: Icp | null | undefined, co: CompanyFacts): boolean {
  if (icpIsEmpty(icp)) return false;
  const p = icp!;
  const key = (v: string) => v.trim().toLowerCase();
  const parts = [
    p.industries.length ? (co.industry ? p.industries.map(key).includes(key(co.industry)) : null) : undefined,
    p.employees.length ? (co.employees ? p.employees.includes(co.employees) : null) : undefined,
    p.revenue.length ? (co.revenue ? p.revenue.includes(co.revenue) : null) : undefined,
    p.countries.length ? (co.country ? p.countries.some((x) => countryKey(x) === countryKey(co.country!)) : null) : undefined,
  ];
  if (parts.includes(false)) return false;
  return parts.includes(true);
}

/** Why a signal is for this member, or null when it isn't. */
export function matchWhy(sig: RawSignal, p: RadarProfile): string | null {
  if (!p.fn || p.fn === "Other" || !inIcp(p.icp, sig.co)) return null;
  switch (sig.kind) {
    case "role":
      return sig.fn === p.fn ? `An open ${p.fn} role, at a company in your profile` : null;
    case "seat":
      return sig.fn === p.fn ? `A ${p.fn} seat like yours, at a company in your profile` : null;
    case "adjacent":
      if (!sig.fn || sig.fn === p.fn || !p.before.includes(sig.fn) || sig.hiredFns.includes(p.fn)) return null;
      // A full-time leader of the member's function on the company's website: said in place of "no fractional yet".
      if (sig.ledFullTime && p.fn in sig.ledFullTime) return `${sig.fn} usually comes before ${p.fn}. FT ${p.fn} Leader${sig.ledFullTime[p.fn] ? ` since ${sig.ledFullTime[p.fn]}` : ""}`;
      return `${sig.fn} usually comes before ${p.fn}, and they have no fractional ${p.fn} yet`;
    case "funding":
      return "Money in usually means hiring, at a company in your profile";
  }
}

const ledLast = (x: RawSignal, p: RadarProfile) => Number(x.kind === "adjacent" && !!p.fn && !!x.ledFullTime && p.fn in x.ledFullTime);

/** The signals for this member, in the order a free member sees the first one: roles, then ended seats, adjacent hires, funding; newest first within each. */
export function signalsFor(all: RawSignal[], p: RadarProfile): (RawSignal & { why: string })[] {
  const rank = { role: 0, seat: 1, adjacent: 2, funding: 3 } as const;
  return all
    .map((x) => ({ ...x, why: matchWhy(x, p) }))
    .filter((x): x is RawSignal & { why: string } => !!x.why)
    // An adjacent hire where a full-time leader already runs the member's function comes after the ones where nobody does.
    .sort((a, b) => rank[a.kind] - rank[b.kind] || ledLast(a, p) - ledLast(b, p) || b.atMs - a.atMs || a.key.localeCompare(b.key));
}

/**
 * The functions onboarding would suggest as "usually hired before" `fn`, from the table's
 * leadership hires (beforeOrder). Its rows are read from the state, not from a member's view:
 * only the free facts beforeOrder reads (function, start, type) and the leadership flag, which the
 * server sets the same for every member. Kept per state.
 */
const suggestedMemo = new WeakMap<State, Map<string, string[]>>();
const infosMemo = new WeakMap<State, CoInfo[]>();
export function beforeSuggested(seed: Seed, s: State, fn: string | null): string[] {
  let m = suggestedMemo.get(s);
  if (!m) suggestedMemo.set(s, (m = new Map()));
  const k = fn ?? "";
  const hit = m.get(k);
  if (hit) return hit;
  let infos = infosMemo.get(s);
  if (!infos) {
    const g = T.graph(seed, s);
    const tracks = T.tracksOf(seed, s);
    const firms = T.firmsInReview(seed, s);
    const byCo = new Map<string, EngagementRec[]>();
    for (const e of g.engagements.values()) {
      if (firms.has(e.companyId) || !isLeaderRaw(e, s, tracks)) continue;
      const cell = (v: string | null) => (v ? { s: "value" as const, v, ver: 0 } : { s: "empty" as const });
      // Only leadership hires go in, so the row reads as one (no open role, not below Lead).
      const rec = {
        id: e.id,
        source: "radar",
        verified: false,
        cells: { function: cell(T.fnOf(e, s)), start: cell(T.live(e, s, "start")), type: cell(T.live(e, s, "type")), operator: { s: "locked" as const, ver: 0 } },
        people: [],
        updatedAt: null,
        yours: false,
        opened: null,
        closed: null,
      } as EngagementRec;
      const l = byCo.get(e.companyId) ?? [];
      l.push(rec);
      byCo.set(e.companyId, l);
    }
    infos = [...byCo.values()].map((engs) => ({ c: {} as CompanyRec, engs }) as unknown as CoInfo);
    infosMemo.set(s, infos);
  }
  const out = beforeOrder(infos, fn).suggested;
  m.set(k, out);
  return out;
}

/** The member's radar profile: function, Ideal Fractional Profile, and the functions before theirs. */
export function profileOf(seed: Seed, s: State, memberId: string, fn: string | null): RadarProfile {
  const prof = s.profiles[memberId] ?? {};
  const own = Array.isArray(prof.before) ? prof.before.filter((x) => typeof x === "string" && x !== fn) : [];
  return {
    memberId,
    fn: fn && fn !== "Other" ? fn : null,
    icp: prof.icp ?? null,
    before: own.length ? own : fn && fn !== "Other" ? beforeSuggested(seed, s, fn) : [],
    beforeFromMember: own.length > 0,
  };
}
