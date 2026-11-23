/**
 * "Someone you know changed jobs" (the owner, 2026-11-23): a person in the member's own sources
 * (their LinkedIn connections file, their contacts CSV, their Google network; lib/notify/knownView.ts) who now shows as a new
 * leader at another company Merlin holds (a leader read from the company's own website, or a person
 * a member added there). Pure: no I/O, so the watch pass (lib/notify/events.ts) and the checks share it.
 *
 * Matched precisely, never guessed:
 *   - the person's whole name, first and last (lib/paths/match.ts personKey), the same in the source
 *     and on the new leader;
 *   - the source says where they were, and it is one company: two rows with the name at two
 *     companies could be two people, so nothing is said; a row with no company says nothing;
 *   - that company is not the new one (by Merlin's id, or the source's own words for it): someone
 *     the source already places there didn't move;
 *   - never the member themself.
 * The names follow the person rules: a Californian by their own location is never named (lib/california.ts),
 * and at a company the member hasn't opened the line names nobody: "someone you know started at a locked company",
 * described by its industry and size at most, never named.
 */

/** One person from the member's own sources. */
export interface KnownPerson {
  /** The name as the member's own source spells it. */
  name: string;
  /** personKey(name): "dana reyes". */
  nameKey: string;
  /** Where the source places them: a company on Merlin (internal id), and the source's own words for it. */
  companyId: string | null;
  company: string | null;
  /** The member's LinkedIn connections file, their contacts CSV, or their Google network (for that member alone). */
  src: "linkedin" | "csv" | "google";
}

/** A new leader at a company on Merlin. */
export interface NewLeader {
  /** The event's own key, for "never twice" ("lead:<company public id>:<function>:<day>"). */
  key: string;
  companyId: string;
  /** The company's name on Merlin, to compare with the source's words (never shown from here). */
  companyName: string;
  nameKey: string;
  fn: string | null;
  at: string;
  /** The person is in California by their own location: they are never named. */
  californian: boolean;
}

export interface KnownMove {
  leader: NewLeader;
  person: KnownPerson;
}

/** A company's name as two spellings compare: lower case, no punctuation, no Inc, LLC, Ltd, Corp. */
export function coKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Where a source row places the person, as one comparable key, or "" when it doesn't say. */
const placeOf = (p: KnownPerson) => (p.companyId ? `id:${p.companyId}` : coKey(p.company) ? `co:${coKey(p.company)}` : "");

/**
 * The member's people who moved to a new leader's seat, by the rules above. `self`: the member's
 * own personKey. `idOfName`: a source's company words to a company on Merlin when they name one
 * exactly (so "Acme" in the file and Acme's id from Google compare as one).
 */
export function knownMoves(people: KnownPerson[], leaders: NewLeader[], self: string | null, idOfName: (coKeyed: string) => string | null = () => null): KnownMove[] {
  const byName = new Map<string, KnownPerson[]>();
  for (const p of people) {
    if (!p.nameKey || p.nameKey === self) continue;
    const list = byName.get(p.nameKey) ?? [];
    list.push(p);
    byName.set(p.nameKey, list);
  }
  const out: KnownMove[] = [];
  const told = new Set<string>();
  for (const l of leaders) {
    if (!l.nameKey || l.nameKey === self) continue;
    const rows = byName.get(l.nameKey);
    if (!rows?.length) continue;
    const newKey = coKey(l.companyName);
    // Where the sources place them, one key per company: a source's words that name a company on Merlin read as its id.
    const places = new Set<string>();
    let there = false;
    for (const r of rows) {
      const viaName = !r.companyId && coKey(r.company) ? idOfName(coKey(r.company)) : null;
      const id = r.companyId ?? viaName;
      if (id === l.companyId || (newKey && coKey(r.company) === newKey)) there = true;
      const k = id ? `id:${id}` : placeOf(r);
      if (k) places.add(k);
    }
    // Already there by their own source, no company to move from, or two companies (maybe two people): nothing is said.
    if (there || places.size !== 1) continue;
    const k = `${l.nameKey}|${l.companyId}`;
    if (told.has(k)) continue;
    told.add(k);
    out.push({ leader: l, person: rows[0] });
  }
  return out;
}

/**
 * The line a move reads as. `companyName` null: the member hasn't opened the company, so nobody is
 * named; `locked` is then how the company reads by its free facts ("a locked SaaS company with 51-200
 * employees"), never its name.
 */
export function knownLine(m: KnownMove, companyName: string | null, locked?: string | null): string {
  if (!companyName) return `Someone you know started at ${locked && /^a locked\b/.test(locked) ? locked : "a locked company"}`;
  const who = m.leader.californian ? "Someone you know" : `${m.person.name}, someone you know,`;
  const fn = m.leader.fn && m.leader.fn !== "Other" ? ` ${m.leader.fn}` : "";
  return `${who} is a new${fn} leader at ${companyName}`;
}
