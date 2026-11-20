/**
 * Reading SEC EDGAR: which Form D filings a day brought (the daily form index, or EDGAR's
 * full-text search as a fallback), and what one filing says (its primary_doc.xml). The parsers
 * are pure; the fetcher follows SEC's fair-access rules:
 *   - a User-Agent that says who we are, with a generic contact (SEC_UA);
 *   - one request at a time, at least MIN_GAP_MS apart (well under SEC's 10 a second);
 *   - on 429, a 5xx or a network error, back off (1, 2, then 4 seconds, or Retry-After) and try
 *     again, at most RETRIES times; on 403 (SEC refusing an undeclared or too fast client) stop
 *     the whole run (SecRefused), never retry.
 *
 * Only the issuer is read from a filing: its name, state or country, industry group, the kind of
 * security, the date of first sale and the amounts. Form D also lists related persons (executives,
 * directors, promoters) and a signature: those parts are never read.
 */
import { fetchWithTimeout } from "../crawler/fetch";

/** SEC asks automated clients to say who they are. A generic company contact, never a person's. */
export const SEC_UA = "Merlin data bot admin@revenuenomad.com";
export const MIN_GAP_MS = 150;
export const RETRIES = 3;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8_000_000;

/* ---------- fetching ---------- */

/** A GET that never throws: the status (0 on a network error or timeout) and the body. */
export type SecFetch = (url: string) => Promise<{ status: number; text: string }>;

/** SEC answered 403: it refuses this client for now. The run stops and says so. */
export class SecRefused extends Error {
  constructor(url: string) {
    super(`SEC refused the request (403) for ${new URL(url).pathname}; the run stopped`);
    this.name = "SecRefused";
  }
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The SEC fetcher: one request at a time, MIN_GAP_MS apart, with backoff. `raw` is the single
 * GET (tests pass their own; nothing in the tests reaches the network). Throws SecRefused on 403.
 */
export function secFetcher(opts: { raw?: (url: string) => Promise<{ status: number; text: string; retryAfter?: string | null }>; gapMs?: number; sleep?: (ms: number) => Promise<void>; retries?: number } = {}): SecFetch & { requests: () => number } {
  const raw = opts.raw ?? rawGet;
  const gap = opts.gapMs ?? MIN_GAP_MS;
  const sleep = opts.sleep ?? sleepMs;
  const retries = opts.retries ?? RETRIES;
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  let n = 0;
  const one = async (url: string) => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + gap - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      n++;
      const r = await raw(url);
      if (r.status === 403) throw new SecRefused(url);
      const transient = r.status === 0 || r.status === 429 || r.status >= 500;
      if (!transient || attempt >= retries) return { status: r.status, text: r.text };
      const after = Number(r.retryAfter);
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 1000 * 2 ** attempt);
    }
  };
  const f = ((url: string) => {
    const p = chain.then(() => one(url));
    chain = p.catch(() => undefined);
    return p;
  }) as SecFetch & { requests: () => number };
  f.requests = () => n;
  return f;
}

async function rawGet(url: string): Promise<{ status: number; text: string; retryAfter?: string | null }> {
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json, text/xml, text/plain, */*", "Accept-Encoding": "gzip, deflate" } }, TIMEOUT_MS);
    const text = (await res.text()).slice(0, MAX_BYTES);
    return { status: res.status, text, retryAfter: res.headers.get("retry-after") };
  } catch {
    return { status: 0, text: "" };
  }
}

/* ---------- where things are ---------- */

const quarter = (day: string) => Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1;
/** The daily form index for a filing day: https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261117.idx */
export const dayIndexUrl = (day: string) => `https://www.sec.gov/Archives/edgar/daily-index/${day.slice(0, 4)}/QTR${quarter(day)}/form.${day.replace(/-/g, "")}.idx`;
/** EDGAR full-text search, Form D for one day, 100 a page. */
export const eftsUrl = (day: string, from = 0) => `https://efts.sec.gov/LATEST/search-index?forms=D&dateRange=custom&startdt=${day}&enddt=${day}${from ? `&from=${from}` : ""}`;
/** A filing's Form D document. */
export const primaryDocUrl = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${String(Number(cik))}/${accession.replace(/-/g, "")}/primary_doc.xml`;

/* ---------- the listings ---------- */

/** One Form D or D/A as a listing names it. `state` only from full-text search (two-letter EDGAR code). */
export interface FormDListing {
  form: "D" | "D/A";
  name: string;
  cik: string;
  /** YYYY-MM-DD */
  filed: string;
  accession: string;
  state?: string | null;
}

const ACCESSION = /\d{10}-\d{2}-\d{6}/;
const isoDay = (raw: string) => {
  const m = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
};

/**
 * The Form D and D/A lines of a daily form index (form.YYYYMMDD.idx): fixed columns of form type,
 * company name, CIK, date filed and file name. Other forms are left out. Never throws.
 */
export function parseFormIndex(text: string): FormDListing[] {
  const out: FormDListing[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!/^D(?:\/A)?\s/.test(line)) continue;
    const m = line.match(/^(D(?:\/A)?)\s+(.+?)\s+(\d{1,10})\s+(\d{8}|\d{4}-\d{2}-\d{2})\s+(edgar\/\S+)\s*$/);
    if (!m) continue;
    const acc = m[5].match(ACCESSION)?.[0];
    const filed = isoDay(m[4]);
    if (!acc || !filed) continue;
    out.push({ form: m[1] as FormDListing["form"], name: m[2].trim(), cik: m[3], filed, accession: acc });
  }
  return out;
}

/** Full-text search's answer: the listings on this page and the total for the day. Null when it isn't that answer. */
export function parseEfts(body: unknown): { listings: FormDListing[]; total: number } | null {
  const hits = (body as { hits?: { total?: { value?: number }; hits?: unknown[] } } | null)?.hits;
  if (!hits || !Array.isArray(hits.hits)) return null;
  const out: FormDListing[] = [];
  for (const h of hits.hits) {
    const src = (h as { _source?: Record<string, unknown> })?._source ?? {};
    const form = String(src.form ?? src.file_type ?? "");
    if (form !== "D" && form !== "D/A") continue;
    const acc = String(src.adsh ?? (h as { _id?: string })._id ?? "").match(ACCESSION)?.[0];
    const filed = isoDay(String(src.file_date ?? ""));
    if (!acc || !filed) continue;
    const names = Array.isArray(src.display_names) ? src.display_names.map(String) : [];
    const ciks = Array.isArray(src.ciks) ? src.ciks.map(String) : [];
    const states = Array.isArray(src.biz_states) ? src.biz_states.map(String) : [];
    // One entry per issuer of the filing (a filing can name co-issuers).
    names.forEach((dn, i) => {
      const name = dn.replace(/\s*\(CIK\s*\d+\)\s*$/i, "").trim();
      const cik = (ciks[i] ?? dn.match(/\(CIK\s*(\d+)\)/i)?.[1] ?? "").replace(/^0+(?=\d)/, "");
      if (name && cik) out.push({ form: form as FormDListing["form"], name, cik, filed, accession: acc, state: states[i] ?? null });
    });
  }
  return { listings: out, total: Number(hits.total?.value ?? out.length) || 0 };
}

/* ---------- one filing ---------- */

/** What a Form D says about the issuer and the offering. No person is ever in here. */
export interface FormD {
  name: string;
  /** EDGAR's two-letter state or country code ("CA", "X0"). */
  stateCode: string | null;
  /** Its description ("CALIFORNIA", "UNITED KINGDOM"). */
  stateName: string | null;
  industry: string | null;
  amendment: boolean;
  /** YYYY-MM-DD, or null (yet to occur, or not given). */
  firstSale: string | null;
  /** Dollars. Null when not a number ("Indefinite"). */
  offered: number | null;
  sold: number | null;
  types: { equity: boolean; debt: boolean; option: boolean; acquired: boolean; fund: boolean; other: string | null };
  /** "Pooled Investment Fund" industry, or fund interests offered. */
  isFund: boolean;
  combination: boolean;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
/** The inner text of the first <name> element in `xml`, or null. */
const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
};
/** The XML of the first <name> element, tags and all, or "". */
const block = (xml: string, name: string): string => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, "i"))?.[0] ?? "";
const yes = (xml: string, name: string) => /^(?:true|y|yes|1)$/i.test(tag(xml, name) ?? "");
const dollars = (v: string | null): number | null => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return v != null && /\d/.test(v) && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * A Form D's primary_doc.xml, read for the issuer and the offering only. Null when it isn't a
 * Form D. The related persons and the signature block are cut out before anything is read.
 */
export function parseFormD(xml: string): FormD | null {
  const doc = String(xml ?? "");
  if (!/<edgarSubmission\b/i.test(doc) || !/<offeringData\b/i.test(doc)) return null;
  // Never read the people: drop their parts first.
  const safe = doc.replace(/<relatedPersonsList\b[\s\S]*?<\/relatedPersonsList>/gi, "").replace(/<signatureBlock\b[\s\S]*?<\/signatureBlock>/gi, "");
  const issuer = block(safe, "primaryIssuer");
  const offering = block(safe, "offeringData");
  const name = tag(issuer, "entityName");
  if (!name) return null;
  const address = block(issuer, "issuerAddress");
  const types = block(offering, "typesOfSecuritiesOffered");
  const filing = block(offering, "typeOfFiling");
  const firstSale = tag(block(filing, "dateOfFirstSale"), "value");
  const amounts = block(offering, "offeringSalesAmounts");
  const industry = tag(block(offering, "industryGroup"), "industryGroupType");
  const submission = tag(safe, "submissionType") ?? "";
  const t = {
    equity: yes(types, "isEquityType"),
    debt: yes(types, "isDebtType"),
    option: yes(types, "isOptionToAcquireType"),
    acquired: yes(types, "isSecurityToBeAcquiredType"),
    fund: yes(types, "isPooledInvestmentFundType"),
    other: yes(types, "isOtherType") ? tag(types, "descriptionOfOtherType") || "other" : null,
  };
  return {
    name,
    stateCode: tag(address, "stateOrCountry"),
    stateName: tag(address, "stateOrCountryDescription"),
    industry,
    amendment: /\/A$/i.test(submission) || yes(filing, "isAmendment"),
    firstSale: firstSale && /^\d{4}-\d{2}-\d{2}$/.test(firstSale) ? firstSale : null,
    offered: dollars(tag(amounts, "totalOfferingAmount")),
    sold: dollars(tag(amounts, "totalAmountSold")),
    types: t,
    isFund: t.fund || /pooled investment fund/i.test(industry ?? "") || !!block(offering, "investmentFundInfo"),
    combination: yes(block(offering, "businessCombinationTransaction"), "isBusinessCombinationTransaction"),
  };
}

/* ---------- what a card says ---------- */

/** "$1M–$5M": the band the amount falls in. */
export function amountBand(usd: number): string {
  const bands: [number, string][] = [
    [250_000, "Under $250K"],
    [1_000_000, "$250K–$1M"],
    [5_000_000, "$1M–$5M"],
    [20_000_000, "$5M–$20M"],
    [50_000_000, "$20M–$50M"],
    [100_000_000, "$50M–$100M"],
  ];
  for (const [top, label] of bands) if (usd < top) return label;
  return "$100M+";
}

/** "about $2.5M", "about $450K", "about $12M", "about $1.2B": two significant figures at most. */
export function aboutAmount(usd: number): string {
  const fmt = (v: number, unit: string) => `about $${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
  if (usd >= 1e9) return fmt(usd / 1e9, "B");
  if (usd >= 1e6) return fmt(usd / 1e6, "M");
  if (usd >= 1e3) return `about $${Math.max(10, Math.round(usd / 1e4) * 10)}K`;
  return `about $${Math.round(usd)}`;
}

/**
 * The kind of security, when the filing makes it clear: a SAFE, a convertible note (debt with a
 * right to convert), equity, or debt. Null otherwise (Form D never says "Seed" or "Series A").
 */
export function roundOf(f: Pick<FormD, "types">): string | null {
  const t = f.types;
  if (t.other && /\bsafe\b|simple agreement for future equity/i.test(t.other)) return "SAFE";
  if ((t.other && /convertible/i.test(t.other)) || (t.debt && (t.option || t.acquired))) return "convertible note";
  if (t.equity && !t.debt) return "equity";
  if (t.debt && !t.equity && !t.other) return "debt";
  return null;
}
