/**
 * The owner's California rule, one everywhere (BUILD_PLAN part 8): a person's name and email never
 * show when the person is in California, judged by the person's own location, not the company's.
 *
 * Where Merlin reads a person's location, it is at import, from the person's own profile row
 * (`person_location`), read here as a yes or no and never stored:
 *
 *   scripts/add-own-sites.mjs     the email finder on their own website: a Californian is never
 *                                 linked, so no email of theirs is read or shown
 *   scripts/seat-import.mjs       a seat holder's name from public profiles (add-seat-names.mjs,
 *                                 add-past-seats.mjs): a Californian is never named, and a run
 *                                 takes off a name already there when the row says California
 *
 * So every name from public profiles on the seed is someone outside California, and the places
 * that show those names (the table, ways in: lib/paths/ways.ts) need no rule of their own; they
 * used to judge by the company's state, which is not the rule. Leaders read from company websites
 * (lib/table.ts leaderPeople) come with no location of their own: `californian` is asked with what
 * the record has, and while that is nothing it says no, so they show as before (US companies only).
 *
 * Shared by the importers (under tsx), the server and the tests. No Node imports.
 */

/**
 * Whether a LinkedIn-style location reads as California: the state by name or ", CA", or one of its
 * metro areas and larger cities.
 */
const CA_PLACES =
  /\b(california|san francisco|bay area|silicon valley|los angeles|san diego|sacramento|san jose|oakland|fresno|santa barbara|san luis obispo|bakersfield|modesto|stockton|riverside|inland empire|oxnard|santa rosa|salinas|santa cruz|monterey|redding|chico|visalia|merced|palo alto|irvine|pasadena|santa clara|sunnyvale|mountain view|berkeley|anaheim|santa monica|napa|sonoma)\b|,\s*ca\b/i;
export const inCalifornia = (location: unknown) => CA_PLACES.test(String(location ?? ""));

/** What Merlin knows of where a person is: their own location as their profile gives it, or a yes or no an import kept. */
export interface PersonPlace {
  location?: unknown;
  california?: boolean | null;
}

/** The person is in California by their own location (the company's state never counts). Unknown is no. */
export const californian = (p: PersonPlace | null | undefined): boolean => !!p && (p.california === true || inCalifornia(p.location));

/** A person's name and email may show: not a Californian by their own location. */
export const nameMayShow = (p: PersonPlace | null | undefined): boolean => !californian(p);
