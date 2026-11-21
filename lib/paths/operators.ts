/**
 * The Revenue Nomad operator list, behind one small adapter so its source can change.
 *
 * Today the operators are Merlin's members: their names, their sign-in emails and their seats on
 * Merlin (a member's seats are theirs through the seat holder rule, lib/table.ts seatHolder). The
 * Revenue Nomad admin portal's own operator list has no connection yet. When it does, a source
 * that reads it plugs in here (setOperatorSource) and the path finder picks it up: each operator
 * with their emails and LinkedIn profile (for matching to the member's own contacts) and the
 * Merlin member they are, when they are one.
 *
 * What an operator carries is used to match people precisely (an email, a LinkedIn profile) and to
 * say whether they show in the Fractionals directory. It never leaves the server.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { slugOf } from "./match";

export interface Operator {
  /** Stable within the source. */
  id: string;
  /** The Merlin member they are, when they are one. */
  memberId: string | null;
  name: string;
  /** Lowercase. */
  emails: string[];
  /** Their LinkedIn profile's slug, when the source has it. */
  linkedin: string | null;
  /** They said "Show me in the Fractionals directory" and have signed in: their name and seats are free to every member. */
  directory: boolean;
}

export interface OperatorSource {
  /** Where the list comes from, for logs and Pilot metrics: "members", later "portal". */
  name: string;
  list: (seed: Seed, s: State) => Operator[];
}

/** Merlin's members as the operator list (the only source until the admin portal is connected). */
export const membersSource: OperatorSource = {
  name: "members",
  list(seed, s) {
    const idx = T.memberIndex(seed, s);
    const signed = (id: string) => idx.joinedAt.has(id) || !!s.seen[id] || !!s.profiles[id];
    return idx.all.map((m) => {
      const p = s.profiles[m.id];
      return {
        id: `m:${m.id}`,
        memberId: m.id,
        name: m.name,
        emails: m.email ? [m.email.trim().toLowerCase()] : [],
        linkedin: slugOf((p as { linkedin?: string } | undefined)?.linkedin ?? null),
        directory: p?.fractionals === true && !p.partnersOff && signed(m.id),
      };
    });
  },
};

let source: OperatorSource = membersSource;
/** Plug in another operator list (the admin portal's, once it is connected). */
export function setOperatorSource(next: OperatorSource): void {
  source = next;
}
export const operatorSourceName = () => source.name;

const memo = new WeakMap<State, Operator[]>();
/** The operators, once per state. */
export function operatorsOf(seed: Seed, s: State): Operator[] {
  let hit = memo.get(s);
  if (!hit) memo.set(s, (hit = source.list(seed, s)));
  return hit;
}
