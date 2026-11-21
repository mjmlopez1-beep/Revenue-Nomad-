/**
 * Whether a homepage is the company's own (lib/websites): read its title, og:site_name, the first
 * h1, a logo's alt text and the footer's copyright line, and compare them with the name. Pure: the
 * page comes in as text.
 *
 * Accept when the name's distinctive words appear there (with the same legal-suffix and "&"
 * variations the candidates allow). A page reached by a domain built from part of the name (its
 * first word, the words after the first, its initials) also needs the rest of the name somewhere
 * on the page. Reject: parked and for-sale pages (their phrases and hosts), error, login and
 * placeholder pages, directory, social, registry and site-builder hosts, a redirect to a brand
 * whose domain carries none of the name, and a country TLD that conflicts with the HQ on file.
 *
 * Confidence: "high" when the domain and the page both match, "medium" when only the page does.
 */
import { cleanText, decodeEntities, pageJunk, PARKING_HOSTS, titleOf } from "../about/extract";
import { registrable } from "../about/fetch";
import { isSharedHost } from "../tableFields";
import { ascii, COUNTRY_OF_TLD, COUNTRY_TLDS, fullLabels, nameParts, type Candidate } from "./candidates";
import type { Confidence } from "./types";

/** Directories, registries, social networks, marketplaces and site builders: never a company's own site, whatever the page says. */
export const DIRECTORY_HOSTS = [
  "zoominfo.com", "dnb.com", "bloomberg.com", "opencorporates.com", "company-information.service.gov.uk", "companieshouse.gov.uk", "northdata.com", "northdata.de",
  "bizapedia.com", "manta.com", "yelp.com", "yellowpages.com", "yell.com", "kompass.com", "owler.com", "rocketreach.co", "apollo.io", "pitchbook.com", "cbinsights.com",
  "tracxn.com", "dealroom.co", "f6s.com", "clutch.co", "g2.com", "capterra.com", "trustpilot.com", "wikipedia.org", "wikidata.org", "amazon.com", "ebay.com", "etsy.com",
  "apps.apple.com", "play.google.com", "endole.co.uk", "companycheck.co.uk", "societe.com", "pappers.fr", "infogreffe.fr", "kvk.nl", "handelsregister.de", "firmenwissen.de",
  "allbiz.com", "chamberofcommerce.com", "buzzfile.com", "corporationwiki.com", "bbb.org", "mapquest.com", "foursquare.com", "tripadvisor.com", "zaubacorp.com",
  "companiesmarketcap.com", "craft.co", "signalhire.com", "lusha.com", "leadiq.com", "seamless.ai", "datanyze.com", "builtwith.com", "similarweb.com", "semrush.com",
  "substack.com", "wixsite.com", "myshopify.com", "webflow.io", "wordpress.com", "godaddysites.com", "weebly.com", "jimdosite.com", "strikingly.com", "site123.me",
  "business.site", "hubspot.com", "linktr.ee", "beacons.ai", "carrd.co", "notion.site", "sites.google.com", "blogspot.com", "tumblr.com", "pinterest.com", "reddit.com",
  "github.io", "gitbook.io", "vercel.app", "netlify.app", "herokuapp.com", "pages.dev", "framer.website", "framer.app",
];
const onList = (host: string, list: readonly string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));
/** A directory, registry, social, marketplace or site-builder host (lib/tableFields.ts SHARED_HOSTS too). */
export const isDirectoryHost = (host: string) => {
  const h = host.toLowerCase().replace(/^www\./, "");
  return isSharedHost(h) || onList(h, DIRECTORY_HOSTS);
};
/** A host that sells or parks domains (lib/about/extract.ts PARKING_HOSTS, and a few more). */
const MORE_PARKING = ["parkingcrew.com", "parked.com", "domainnamesales.com", "namebright.com", "dynadot.com", "spaceship.com", "afternic.net", "smartname.com", "bodis.net", "skenzo.com", "voodoo.com", "domainsponsor.com", "huge-domains.com", "namesilo.com"];
export const isParkingHost = (host: string) => onList(host.toLowerCase().replace(/^www\./, ""), [...PARKING_HOSTS, ...MORE_PARKING]);

/** Phrases parked and for-sale pages use, beyond lib/about's (which pageJunk reads). */
const PARKED_MORE =
  /\b(this|the) domain( name)? ([a-z0-9.-]+ )?(is|may be|might be) (for sale|available)\b|\bget this domain\b|\bown this domain\b|\bpurchase this domain\b|\bbuy now for\b[^.]{0,40}\bdomain\b|\bdomain (is )?(available|for sale)\b|\brelated (searches|links)\b[^.]{0,80}\b(sponsored|ads?)\b|\bsponsored listings\b|\bthis (web ?page|page) (was|is) (generated|provided) by the domain owner\b|\bfuture home of\b|\bthis domain (is|has been) registered\b|\bregistered (at|with|by) (namecheap|godaddy|porkbun|dynadot|hostinger|ionos|gandi)\b|\bparked (page|domain)\b|\bdomain (holding|placeholder) page\b|\bwebsite is (currently )?under construction\b|\bnothing (to see|here) yet\b/i;

/* ---------- reading the page ---------- */

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}
/** The content of the first <meta> whose property or name is `key`. */
function meta(html: string, key: string): string | null {
  const re = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    const k = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase().trim();
    if (k === key) {
      const c = attr(m[0], "content");
      if (c !== null) return cleanText(c);
    }
  }
  return null;
}

/** What a homepage says it is: the parts the name is looked for in. */
export interface Evidence {
  title: string;
  siteName: string | null;
  ogTitle: string | null;
  h1: string | null;
  logoAlt: string | null;
  copyright: string | null;
  /** The page's text (no scripts or styles), for the rest of a name a part-of-the-name domain carries. */
  text: string;
}

/** The evidence on a homepage. */
export function evidenceOf(html: string): Evidence {
  const head = html.slice(0, 400_000);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(head)?.[1];
  let logoAlt: string | null = null;
  for (const m of head.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const alt = attr(m[0], "alt");
    const hint = `${attr(m[0], "class") ?? ""} ${attr(m[0], "src") ?? ""} ${attr(m[0], "id") ?? ""} ${alt ?? ""}`;
    if (alt && /logo/i.test(hint)) {
      logoAlt = cleanText(alt);
      break;
    }
  }
  const text = cleanText(head.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")).slice(0, 60_000);
  // The last copyright line on the page is the footer's.
  const marks = [...text.matchAll(/(?:©|\(c\)|\bcopyright\b)\s*(?:©\s*)?(?:(?:19|20)\d{2}\s*(?:[-–]\s*(?:(?:19|20)\d{2}|present)\s*)?)?,?\s*([^|•·]{2,90})/gi)];
  const copyright = marks.length ? marks[marks.length - 1][1].replace(/\b(all rights reserved|alle rechte vorbehalten|tous droits r[ée]serv[ée]s|todos los derechos reservados)\b.*$/i, "").trim() || null : null;
  return { title: titleOf(head), siteName: meta(head, "og:site_name"), ogTitle: meta(head, "og:title"), h1: h1 ? cleanText(h1) || null : null, logoAlt, copyright, text };
}

/** The company's LinkedIn page the homepage links to (linkedin.com/company/slug), when it links exactly one. */
export function linkedinOf(html: string): string | null {
  const slugs = new Set<string>();
  for (const m of decodeEntities(html).matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([A-Za-z0-9][A-Za-z0-9_.%-]{0,99})/gi)) {
    let slug = m[1].replace(/[.]+$/, "");
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep it as written */
    }
    if (/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u.test(slug)) slugs.add(slug.toLowerCase());
  }
  return slugs.size === 1 ? `linkedin.com/company/${[...slugs][0]}` : null;
}

/* ---------- the name ---------- */

/** Words that say nothing about which company it is. */
const STOP = new Set(["and", "the", "of", "de", "la", "le", "les", "du", "des", "der", "die", "das", "y", "e", "et", "und", "a", "an", "for", "to", "in", "on", "at", "by", "da", "di", "del", "van", "von"]);
/** Text as comparable words: ASCII, lowercase, "&" and "+" as "and". */
const wordsIn = (s: string) => ascii(s).replace(/[’'`]/g, "").replace(/\s*[&+]\s*/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
const squash = (ws: string[]) => ws.filter((w) => w !== "and").join("");

/** The name's distinctive words, and its tagline's ("Corvane Farms - Lupin Wines": both are names). */
export function distinctive(name: string): string[][] {
  const p = nameParts(name);
  const out = [p.words.filter((w) => !STOP.has(w))];
  if (p.alt) out.push(p.alt.filter((w) => !STOP.has(w)));
  return out.filter((ws) => ws.length && ws.join("").length >= 2);
}

/** Whether `text` names the company: its distinctive words squeezed together appear squeezed, or each of them appears as a word. */
export function names(text: string, words: string[]): boolean {
  if (!words.length || !text) return false;
  const tw = wordsIn(text);
  const flat = squash(tw);
  const want = squash(words);
  // Squeezed, a name of five letters or more may run into its neighbours ("SupportQuokka" for Support Quokka); a shorter one must stand as a word ("Quiv" is not in "quiver").
  if (want.length >= 5 && flat.includes(want)) return true;
  const set = new Set(tw);
  if (want.length < 5 && words.length === 1) return set.has(want);
  return words.filter((w) => w !== "and").every((w) => set.has(w) || (w.length >= 5 && flat.includes(w)));
}

/** The evidence as one text, with the site's own host taken out (a parked page's title is often just its domain). */
function evidenceText(e: Evidence, host: string): string {
  const parts = [e.title, e.siteName, e.ogTitle, e.h1, e.logoAlt, e.copyright].filter((x): x is string => !!x);
  const bare = host.toLowerCase().replace(/^www\./, "");
  const re = new RegExp(`\\b(?:www\\.)?${bare.replace(/[.-]/g, (c) => `\\${c}`)}\\b`, "gi");
  return parts.map((x) => x.replace(re, " ")).join(" | ");
}

/* ---------- the domain ---------- */

/** The part of a domain before its public suffix ("acme" of acme.co.uk). */
export const labelOf = (host: string) => {
  const r = registrable(host.toLowerCase().replace(/^www\./, ""));
  return r.split(".")[0];
};
const AFFIX = /^(get|try|use|join|go|my|the)|(hq|app|labs|inc|group|global|co|io|ai|uk|us|usa|online|digital|tech|software|official)$/;

/** Whether a domain is built from the whole name: a full label, or one with an affix around it. */
export function domainNames(host: string, name: string): boolean {
  const label = labelOf(host);
  const full = fullLabels(name);
  if (full.has(label)) return true;
  for (const f of full) {
    if (f.length < 3 || !label.includes(f)) continue;
    const rest = label.replace(f, "").replace(/^-|-$/g, "");
    if (!rest || AFFIX.test(rest)) return true;
  }
  // "revquill.pro": the name's last word is the TLD.
  const r = registrable(host.toLowerCase().replace(/^www\./, ""));
  return full.has(r.replace(/\./g, ""));
}

/** Two-letter TLDs that are used as generic ones, never read as a country. */
const GENERIC_CC = new Set(["io", "co", "ai", "me", "tv", "fm", "ly", "to", "so", "gg", "cc", "ws", "la", "sh", "ac", "vc", "is", "am", "im", "re", "md"]);
/** The country a domain's TLD says, when it says one: ours (COUNTRY_OF_TLD), or "a country" for any other two-letter one. */
function tldCountry(host: string): string | null {
  const r = registrable(host.toLowerCase().replace(/^www\./, ""));
  const tld = r.slice(r.indexOf(".") + 1);
  if (COUNTRY_OF_TLD[tld]) return COUNTRY_OF_TLD[tld];
  const last = tld.split(".").pop()!;
  if (last === "us") return "United States";
  if (last.length === 2 && !GENERIC_CC.has(last)) return `cc:${last}`;
  // ".it" reads as Italy only through COUNTRY_OF_TLD, above.
  return null;
}
/** Whether the domain's country TLD conflicts with the HQ on file. A generic TLD never does. */
export function countryConflicts(host: string, hqCountry: string | null | undefined): boolean {
  if (!hqCountry) return false;
  const c = tldCountry(host);
  if (!c) return false;
  if (c === hqCountry) return false;
  // .uk and .co.uk are the United Kingdom's.
  if ((COUNTRY_TLDS[hqCountry] ?? []).some((t) => registrable(host).endsWith(`.${t}`))) return false;
  return true;
}

/* ---------- the verdict ---------- */

export type Verdict =
  | { ok: true; confidence: Confidence; domain: string; linkedin: string | null }
  | { ok: false; why: string };

/**
 * Whether the page at `finalUrl`, reached from `cand`, is the company's own. `domain` in the
 * answer is where the page is (a redirect's target), as a website value is stored: the host
 * without "www.".
 */
export function verify(o: { name: string; cand: Candidate; finalUrl: string; html: string; country?: string | null }): Verdict {
  let host: string;
  try {
    host = new URL(o.finalUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return { ok: false, why: "bad address" };
  }
  const bare = host.replace(/^www\./, "");
  if (isParkingHost(bare)) return { ok: false, why: "parked domain" };
  if (isDirectoryHost(bare)) return { ok: false, why: "directory or social site" };
  const junk = pageJunk(o.html);
  if (junk) return { ok: false, why: junk };
  const ev = evidenceOf(o.html);
  if (PARKED_MORE.test(ev.title) || PARKED_MORE.test(ev.text.slice(0, 4000))) return { ok: false, why: "parked domain" };
  if (countryConflicts(bare, o.country)) return { ok: false, why: "country conflicts" };
  const moved = registrable(bare) !== registrable(o.cand.domain);
  const domainMatch = domainNames(bare, o.name);
  // A redirect elsewhere: the domain it lands on has to carry the name.
  if (moved && !domainMatch) return { ok: false, why: "redirect to another brand" };
  const text = evidenceText(ev, bare);
  const sets = distinctive(o.name);
  let pageMatch = sets.some((ws) => names(text, ws));
  // A domain from part of the name: that part where the name shows, and the rest of the name on the page.
  if (!pageMatch && o.cand.kind === "part" && !moved) pageMatch = sets.some((ws) => partNamed(labelOf(bare), ws, text, ev.text));
  if (!pageMatch) return { ok: false, why: "page doesn't name the company" };
  return { ok: true, confidence: domainMatch ? "high" : "medium", domain: bare, linkedin: linkedinOf(o.html) };
}

/**
 * A domain made of part of the name ("ternwick" of Ternwick Cyber, "iwso" of a long name's
 * initials): that part where the page says what it is, and every other word of the name somewhere
 * on the page, so "Industrial Quokkas" is not found at industrial.com.
 */
function partNamed(label: string, ws: string[], evidence: string, page: string): boolean {
  const initials = ws.length >= 3 && label === ws.map((w) => w[0]).join("");
  if (initials) return names(evidence, [label]) && names(page, ws);
  const part = ws.filter((w) => w.length >= 2 && label.includes(w));
  const others = ws.filter((w) => !part.includes(w));
  return part.length > 0 && others.length > 0 && names(evidence, part) && names(page, others);
}
