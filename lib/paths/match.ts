/**
 * How a person the member knows is matched to a person Merlin has. Precision first: a weak match
 * is no match.
 *
 *  - A name compares as its first and last words with accents, case, punctuation, middle names,
 *    initials, credentials, pronouns and nicknames left out ("Dana Q. Reyes, MBA (she/her)" is
 *    "dana reyes"). A name that is one word, or whose last name is only an initial, never matches.
 *  - A name alone never matches anyone. It needs the same company too (the contact's company,
 *    matched to a company on Merlin by its exact name or by website, lib/google/compute.ts), or a
 *    key that is a person's own: the same LinkedIn profile, or the same email.
 *  - A company matches by its website (an email's domain) or by its exact name, legal suffixes and
 *    "The" aside. A name two companies share, a generic word ("Consulting", "Stealth"), or a part
 *    of a name matches nothing.
 *
 * Pure: relative imports only.
 */
import { cleanPersonName } from "../personName";

/** Name words as they compare: no accents, case or punctuation, and no initials. */
function words(n: string): string[] {
  return String(n ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.replace(/[^a-z]/g, "").length >= 2);
}

/** A person's name as it matches ("dana reyes"), or null when it can't match anyone safely. */
export function personKey(raw: string | null | undefined): string | null {
  const c = cleanPersonName(raw ?? "");
  if (!("name" in c)) return null;
  const w = words(c.name);
  return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : null;
}

/** The pair a name and a company match on. */
export const nameCo = (nameKey: string, companyId: string) => `${nameKey}|${companyId}`;

/** A LinkedIn profile's slug from a stored value (an address or a slug), lower case, or null. */
export function slugOf(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /linkedin\.com\/in\/([^/?#\s]+)/i.exec(s);
  const raw = m ? m[1] : /^[a-z0-9][a-z0-9_%-]{2,99}$/i.test(s) ? s : "";
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** The first name to greet someone by. */
export function firstWord(name: string): string {
  const c = cleanPersonName(name);
  return "first" in c ? c.first : String(name).trim().split(/\s+/)[0] ?? "";
}
