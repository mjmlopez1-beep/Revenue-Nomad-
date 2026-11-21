/**
 * A likely email for a leader read from a company's website, from the pattern of the emails
 * members added at the company's own domain. No outside service is asked: only the emails on file.
 *
 * The patterns: first.last@, first@, flast@, firstl@ and first_last@. Each email on file at the
 * domain (with its person's first and last name) is read for the patterns it follows. A pattern
 * stands when at least LIKELY_MIN emails follow it and every one of them does (an email on file
 * that follows another pattern, or none of these, means the company has no one pattern). Pure:
 * lib/table.ts and the checks run it as it is.
 */
export type EmailPattern = "first.last" | "first" | "flast" | "firstl" | "first_last";
/** In this order when an email reads two ways. */
export const PATTERNS: EmailPattern[] = ["first.last", "first_last", "flast", "firstl", "first"];
/** Emails on file at the domain that must follow one pattern before a likely email is offered. */
export const LIKELY_MIN = 2;

/** "Likely, from the pattern of 3 emails on file". */
export const likelyWords = (n: number) => `Likely, from the pattern of ${n} emails on file`;

/** A first and a last name as an address spells them: lower case, letters only. Null without both. */
function parts(name: string): { f: string; l: string } | null {
  const w = String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((x) => x.replace(/[^a-z]/g, ""))
    .filter((x) => x.length >= 2);
  return w.length >= 2 ? { f: w[0], l: w[w.length - 1] } : null;
}

/** The address's part before the @ for a name in a pattern. */
export function localFor(p: EmailPattern, name: string): string | null {
  const n = parts(name);
  if (!n) return null;
  switch (p) {
    case "first.last":
      return `${n.f}.${n.l}`;
    case "first_last":
      return `${n.f}_${n.l}`;
    case "flast":
      return `${n.f[0]}${n.l}`;
    case "firstl":
      return `${n.f}${n.l[0]}`;
    case "first":
      return n.f;
  }
}

/** The domain of an email, lower case, without "www.". Null when it isn't one. */
export function emailDomain(email: string): string | null {
  const m = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(String(email ?? "").trim());
  return m ? m[1].toLowerCase().replace(/^www\./, "") : null;
}

/** The patterns one email follows for its person's name. */
export function patternsOf(name: string, email: string): EmailPattern[] {
  const local = String(email ?? "").trim().toLowerCase().split("@")[0];
  return PATTERNS.filter((p) => localFor(p, name) === local);
}

/**
 * The likely email for `name` at `domain` from the emails on file there ({name, email}), or null.
 * `n`: how many emails on file follow the pattern.
 */
export function likelyEmail(name: string, domain: string, onFile: { name: string; email: string }[]): { email: string; n: number; pattern: EmailPattern } | null {
  const site = domain.toLowerCase().replace(/^www\./, "");
  const here = onFile.filter((x) => emailDomain(x.email) === site && parts(x.name));
  if (here.length < LIKELY_MIN) return null;
  let common: EmailPattern[] | null = null;
  for (const x of here) {
    const ps = patternsOf(x.name, x.email);
    common = common ? common.filter((p) => ps.includes(p)) : ps;
    if (!common.length) return null;
  }
  const pattern = common![0];
  const local = localFor(pattern, name);
  if (!local) return null;
  // The person's own email is on file already: nothing to guess.
  if (here.some((x) => x.email.trim().toLowerCase() === `${local}@${site}`)) return null;
  return { email: `${local}@${site}`, n: here.length, pattern };
}
