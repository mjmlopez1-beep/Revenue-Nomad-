/**
 * Words that are never a person's name: greetings and the words of a web page or a profile
 * heading ("Welcome Read", "Meet Our Team", "Learn More", "Contact Sales"). A name that holds one
 * came from a page, not from a person. Pure, no imports, so lib/personName.ts, lib/tableFields.ts,
 * lib/leaders/extract.ts and the seed scripts can all read it.
 *
 *  - NEVER_NAME: never a word of a name, wherever it stands.
 *  - NEVER_FIRST: page words that are also surnames (Read, More, Page, Story, Head, Lead, Home,
 *    Press): never a first name, but "Ashley Read" or "Larry Page" is a person.
 *
 * The leaders reader (lib/leaders/extract.ts NAME_STOP) reads a team page, where any of these is a
 * heading, so it refuses both lists anywhere in a name.
 */

/** Greetings and the words around a name on a page, a profile or a team section. */
export const NEVER_NAME: ReadonlySet<string> = new Set(
  (
    // Greetings.
    "welcome hello hi hey greetings thanks thank congratulations congrats " +
    // A page's words around a name.
    "meet about team our ours your yours the learn view contact click here join login signup subscribe menu search privacy policy terms cookies overview mission values careers blog news email bio profile " +
    // A company's words, never a person's.
    "company inc llc ltd corp services solutions global group agency " +
    // Titles and functions (a name ends before them: lib/personName.ts TITLE_WORDS).
    "sales marketing growth revenue operations finance product customer success leadership management executive executives officer director manager president vp svp evp founder cofounder co-founder partners advisors staff people"
  ).split(/\s+/),
);

/** Page words that are also surnames: never the first word of a name. */
export const NEVER_FIRST: ReadonlySet<string> = new Set("read more page story head lead home press board chief leader vice dear partner advisor".split(/\s+/));

/** A name's words as they compare: lower case, no accents or punctuation around them. */
export const nameWordsOf = (name: string): string[] =>
  String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter(Boolean);

/**
 * The never-a-name word a name holds ("welcome" in "Welcome Read"), else null: a word of
 * NEVER_NAME anywhere, or a word of NEVER_FIRST first.
 */
export function neverNameWord(name: string): string | null {
  const ws = nameWordsOf(name);
  for (const w of ws) if (NEVER_NAME.has(w)) return w;
  if (ws.length && NEVER_FIRST.has(ws[0])) return ws[0];
  return null;
}

/** True when the text reads as a greeting or a page's words, not a person's name ("Welcome Read", "Meet Our Team"). */
export const neverAName = (name: string): boolean => neverNameWord(name) !== null;

/** What a member is told when the name they typed holds one of these words. */
export const NEVER_NAME_REFUSED = "That reads like a greeting or a page heading, not a person's name. Use their first and last name, like Jane Smith.";
