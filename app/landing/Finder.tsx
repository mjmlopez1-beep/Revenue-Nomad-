"use client";

/**
 * "What are you looking for?" on the landing page: one large box that reads like a search field,
 * with the visitor's function in it, three suggested questions under it, and the industry and
 * country filters behind Refine. The answer under it is real: counts and a short list of rows
 * from GET /api/table?preview=1 (lib/preview.ts), with three tabs (all, hiring now, no fractional
 * in this function yet). Every number comes from that one endpoint and obeys its limits: the
 * first 10 rows of an answer name their company, the rest come without one (`blur`) and show the
 * app's blurred made-up name (lockedLook, from the row's opaque seed), and a company with an
 * open role is named only when it is one of the few the server picked (lib/preview.ts
 * PREVIEW_OPEN_NAMED); the others say the company unlocks with 2 credits. Never a person, a
 * posting link or a rate. The page shows fewer rows than the answer carries, never more.
 *
 * No function is assumed. Until the visitor picks one, the box shows example questions that
 * rotate across functions (a placeholder: still under prefers-reduced-motion), and the answer
 * is for one example function, a different one each day, and says so. The picked function is
 * kept in localStorage (tp_try_fn) so onboarding starts with it; an example is never kept.
 *
 * A suggested question picks the tab that answers it. "What fractionals charge" has no public
 * answer (rates are for members: medians by function, client size on Pro), so it says where they
 * are and shows no number. A picked country keeps the companies whose country isn't on file yet, and the line
 * under the tabs says how many are in that country. The same answer carries the hero's example
 * record (`onExample`) and the page's totals across every function (`onTotals`).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CompanyLogo, IconChevron, IconLock, IconSearch, IconX, LockedSite, Num, lockedLook } from "../ui/shared";
import { FUNCTIONS, GTM_FUNCTIONS } from "@/lib/tableFields";
import { SparkMark } from "./scenes";

/** Read by app/onboard/Onboarding.tsx. */
const TRY_FN_KEY = "tp_try_fn";
/** Every function a visitor can pick until the first answer brings the server's list (lib/preview.ts PREVIEW_FUNCTIONS). */
const ALL_FUNCTIONS = FUNCTIONS.filter((f) => f !== "Other");
/** The functions the example answer and the placeholder rotate through. */
const EXAMPLE_FNS = ["Marketing", "Finance", "RevOps", "Customer Success", "Sales", "Product", "Technology", "Operations"];
/** How long each example question stays in the box. */
const ROTATE_MS = 3200;
/** Rows drawn: the first ones named, then a couple of blurred ones, so the list ends on what joining opens. */
const ROWS_NAMED = 6;
const ROWS_BLUR = 2;

/** What GET /api/table?preview=1 sends (lib/preview.ts PreviewAnswer). */
export interface PreviewCompany {
  name: string;
  domain: string | null;
  logo: string | null;
  /** The icon's id for GET /api/logo/<id> ("lp_" and the row's seed). Older servers leave it out. */
  logoId?: string | null;
}
interface PreviewRow {
  seed: string;
  kind: "open" | "hired" | "notyet";
  company: PreviewCompany | null;
  /** Past the first 10: no company sent, the page blurs a made-up name from `seed`. */
  blur?: boolean;
  title: string;
  function: string;
  /** Type of work (Fractional, Interim, Advisory, Project…), or null when not on file. */
  type: string | null;
  when: string | null;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  country: string | null;
  holder?: boolean;
  /** No fractional in this function yet, and the company's website shows a full-time leader of it, since this year ("" when it doesn't say). */
  ledSince?: string;
}
export interface PreviewExample {
  company: PreviewCompany & {
    industry: string | null;
    employees: string | null;
    revenue: string | null;
    country: string | null;
  };
  open: { title: string; function: string; when: string | null } | null;
  seat: { function: string; start: string | null; rnMember: boolean };
}
type View = "all" | "hiring" | "notyet";
/** A question the box can hold: a tab, the All tab read for who held the seat, or rates (no public answer). */
type Ask = View | "held" | "rates";
interface PreviewAnswer {
  fn: string;
  view?: View;
  total?: number;
  industry: string | null;
  country: string | null;
  counts: {
    hired: number;
    notYet: number;
    hiring: number;
    holders: number;
    all?: number;
    repeat: number;
    anyHire: number;
  };
  /** With a country picked: how many of each count are in it. The rest have no country on file yet. */
  inCountry?: { hired: number; notYet: number; hiring: number; holders: number; all: number } | null;
  rows: PreviewRow[];
  example?: PreviewExample | null;
  openRoleCompanies?: boolean;
  options: { functions: string[]; industries: string[]; countries: string[] };
}

/** Counted across every function, from an answer with no industry or country picked. */
export interface Totals {
  /** Companies that hired any fractional. */
  anyHire: number;
  /** Companies with 2 or more fractional hires, or hires in 2 or more functions. */
  repeat: number;
  /** Functions a visitor can pick. */
  functions: number;
}

/** How a fractional in each function is usually called, for "have hired a fractional CMO". */
const SEAT_NOUN: Record<string, string> = {
  Sales: "sales leader",
  Marketing: "CMO",
  RevOps: "RevOps lead",
  "Customer Success": "customer success leader",
  Partnerships: "partnerships lead",
  Growth: "growth lead",
  "Product Marketing": "product marketing lead",
  Enablement: "enablement lead",
  "AI GTM": "AI GTM lead",
  Technology: "CTO",
  Finance: "CFO",
  Operations: "COO",
  People: "people leader",
  Product: "product leader",
  Legal: "general counsel",
  Executive: "executive",
};
export const seatNoun = (fn: string) => SEAT_NOUN[fn] ?? `${fn} lead`;

const fmt = (n: number) => n.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "the United States", "Canada": a country as it reads after "in". */
const inCountryName = (c: string) => (/^(United |Netherlands$|Philippines$|Czech Republic$|Dominican Republic$|Bahamas$|Gambia$|Maldives$)/.test(c) ? `the ${c}` : c);
/**
 * What a count holds once a country is picked: "28 in the United States, plus 1,328 where the
 * country isn't on file yet". Null with no country picked or nothing counted.
 */
function countrySplit(n: number, inC: number | undefined, country: string | null): string | null {
  if (!country || inC === undefined || n <= 0) return null;
  const rest = n - inC;
  if (rest <= 0) return `All in ${inCountryName(country)}`;
  return `${fmt(inC)} in ${inCountryName(country)}, plus ${fmt(rest)} where the country isn't on file yet`;
}

/** "posted today", "posted 3 days ago", "posted 2 weeks ago". */
function postedAgo(day: string | null): string {
  if (!day) return "Open now";
  const ms = Date.now() - Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
  const days = Math.max(0, Math.round(ms / 86_400_000));
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 14) return `Posted ${days} days ago`;
  if (days < 60) return `Posted ${Math.round(days / 7)} weeks ago`;
  return `Posted ${Math.round(days / 30)} months ago`;
}
/** "Started Oct 2025". */
function startedOn(month: string | null): string | null {
  if (!month) return null;
  const [y, m] = month.split("-").map(Number);
  return y && m ? `Started ${MONTHS[m - 1]} ${y}` : null;
}

const VIEWS: View[] = ["all", "hiring", "notyet"];
const viewLabel = (v: View, fn: string) => (v === "all" ? "All" : v === "hiring" ? "Hiring now" : `No fractional ${seatNoun(fn)} yet`);
const viewOf = (a: Ask | null): View => (a === "hiring" || a === "notyet" ? a : "all");

/** A question as the box says it: with the visitor's function, or in general words until they pick one. */
function askText(a: Ask, fn: string | null): string {
  const noun = fn ? seatNoun(fn) : null;
  switch (a) {
    case "hiring":
      return noun ? `Companies hiring a fractional ${noun} now` : "Companies hiring in my function now";
    case "held":
      return fn ? `Who held the ${fn} seat before me` : "Who held the seat before me";
    case "notyet":
      return noun ? `Companies with no fractional ${noun} yet` : "Companies with nobody in my function yet";
    case "rates":
      return noun ? `What a fractional ${noun} charges` : "What fractionals charge";
    default:
      return noun ? `Companies that hire a fractional ${noun}` : "Companies that hire fractionals in my function";
  }
}
/** The suggestions under the box, in the order a fractional asks them. */
const SUGGESTED: Ask[] = ["hiring", "held", "rates"];
/** The example questions the empty box rotates through: a different function each time. */
const exampleAt = (n: number) => askText(SUGGESTED[n % SUGGESTED.length], EXAMPLE_FNS[n % EXAMPLE_FNS.length]);

/** The quiet line under a row's title. */
function happening(r: PreviewRow, fn: string): string {
  if (r.kind === "open") return `Open role · ${postedAgo(r.when)}`;
  // The company's website shows a full-time leader of the function: it says so, in place of "No fractional CMO yet".
  if (r.kind === "notyet" && r.ledSince !== undefined) return `FT ${fn} Leader${r.ledSince ? ` since ${r.ledSince}` : ""}`;
  if (r.kind === "notyet")
    return [`No fractional ${seatNoun(fn)} yet`, r.when ? startedOn(r.when)?.replace("Started", "Latest hire") : null].filter(Boolean).join(" · ");
  return [startedOn(r.when), r.holder ? "Seat holder on file" : null].filter(Boolean).join(" · ") || "Fractional hire on file";
}

/** The company on a row: logo, name and domain, a blurred made-up one past the first 10, or "unlocks with 2 credits" for a company with an open role kept back. */
function CompanyCell({ r }: { r: PreviewRow }) {
  if (r.blur)
    return (
      <span className="lp-rw-co">
        <CompanyLogo name="" domain={null} hidden noLogo seed={r.seed} />
        <span className="lp-rw-cotext">
          <span className="lp-rw-name">
            <span className="locked-name">
              <span className="locked-blur" aria-hidden>
                {lockedLook(r.seed).name}
              </span>
              <span className="sr-only">Company shown after you join</span>
            </span>
          </span>
          <LockedSite seed={r.seed} className="lp-rw-dom" />
        </span>
      </span>
    );
  if (!r.company)
    return (
      <span className="lp-rw-co">
        <span className="logo lp-rw-logo-kept" aria-hidden>
          <IconLock size={13} />
        </span>
        <span className="lp-rw-cotext">
          <span className="lp-rw-name lp-rw-name-kept">Company unlocks with 2 credits</span>
        </span>
      </span>
    );
  return (
    <span className="lp-rw-co">
      <CompanyLogo name={r.company.name} domain={r.company.logo} seed={r.company.logoId ?? undefined} />
      <span className="lp-rw-cotext">
        <span className="lp-rw-name" title={r.company.name}>
          {r.company.name}
        </span>
        {r.company.domain ? <span className="lp-rw-dom mono">{r.company.domain}</span> : null}
      </span>
    </span>
  );
}

/** The function the visitor picked on an earlier visit, or null. */
function readFn(): string | null {
  try {
    const f = localStorage.getItem(TRY_FN_KEY);
    return f && ALL_FUNCTIONS.includes(f) ? f : null;
  } catch {
    return null;
  }
}
/** Today's example function: a different one each day, so no one function stands for the page. */
const exampleFn = () => EXAMPLE_FNS[Math.floor(Date.now() / 86_400_000) % EXAMPLE_FNS.length];

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface FinderProps {
  /** Take the visitor to the join form. */
  onJoin: () => void;
  /** The button is the one primary action in view (no join form is on screen). */
  primary: boolean;
  /** The button's row, so the page can tell when it is on screen. */
  ctaRef?: React.RefObject<HTMLDivElement | null>;
  /** The hero's example record, from the first answer that carries one (null when none fits). */
  onExample?: (x: PreviewExample | null) => void;
  /** The counts across every function, from an answer with no industry or country picked. Null: the first answer could not be had. */
  onTotals?: (t: Totals | null) => void;
}

export default function Finder({ onJoin, primary, ctaRef, onExample, onTotals }: FinderProps) {
  /** The visitor's own function. Null until they pick one: the answer is then for `eg`, and says so. */
  const [fn, setFn] = useState<string | null>(null);
  const [eg, setEg] = useState(EXAMPLE_FNS[0]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [refine, setRefine] = useState(false);
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  /** Which example question the empty box shows. */
  const [tick, setTick] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  /** The page has its totals: a later answer that fails takes nothing back. */
  const sent = useRef(false);
  const id = useId();

  // The function picked on an earlier visit and today's example, once the page is in the browser.
  useEffect(() => {
    setFn(readFn());
    setEg(exampleFn());
    setReady(true);
  }, []);

  // The empty box moves through example questions. Nothing moves once a question is in it, or under reduced motion.
  useEffect(() => {
    if (ask || reducedMotion()) return;
    const t = window.setInterval(() => setTick((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [ask]);

  const shownFn = fn ?? eg;
  const view = viewOf(ask);

  const load = useCallback((f: string, ind: string, ctry: string, v: View) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    const q = new URLSearchParams({ preview: "1", fn: f });
    if (ind) q.set("ind", ind);
    if (ctry) q.set("country", ctry);
    if (v !== "all") q.set("view", v);
    fetch(`/api/table?${q}`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: PreviewAnswer) => {
        if (c.signal.aborted || !a?.counts) return;
        if (a.example !== undefined) onExample?.(a.example);
        if (!a.industry && !a.country) {
          sent.current = true;
          onTotals?.({ anyHire: a.counts.anyHire, repeat: a.counts.repeat, functions: a.options.functions.length });
        }
        setAnswer(a);
        setFailed(false);
        setBusy(false);
      })
      .catch(() => {
        if (c.signal.aborted) return;
        if (!sent.current) onTotals?.(null);
        setFailed(true);
        setBusy(false);
      });
    // onExample and onTotals are the page's state setters: stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) load(shownFn, industry, country, view);
  }, [ready, shownFn, industry, country, view, load]);
  useEffect(() => () => ctl.current?.abort(), []);

  const pickFn = (f: string) => {
    if (!f) return;
    setFn(f);
    try {
      localStorage.setItem(TRY_FN_KEY, f);
    } catch {
      /* storage blocked: onboarding asks again */
    }
  };

  const functions = answer?.options.functions ?? ALL_FUNCTIONS;
  const gtm = functions.filter((f) => GTM_FUNCTIONS.includes(f));
  const more = functions.filter((f) => !GTM_FUNCTIONS.includes(f));
  const noun = seatNoun(shownFn);
  const mine = !!answer && answer.fn === shownFn;
  const c = mine ? answer.counts : null;
  const rows = mine ? answer.rows : [];
  const here = mine && answer.view === view;
  /** One number set: each tab's count is the one its button names ("Join free to see all 898"). */
  const tabCount = (v: View) => (!c ? null : v === "hiring" ? c.hiring : v === "notyet" ? c.notYet : (c.all ?? null));
  const total = here ? (tabCount(view) ?? answer.total ?? rows.length) : 0;
  /**
   * Fewer rows than the answer carries, in its order: the first open roles (at most half the
   * list while there are past seats to show, so it never reads as a wall of locked companies),
   * then seats, then a couple of the blurred rows.
   */
  const lead = rows.filter((r) => !r.blur);
  const seats = lead.filter((r) => r.kind !== "open");
  const opens = lead.filter((r) => r.kind === "open").slice(0, Math.max(ROWS_NAMED / 2, ROWS_NAMED - seats.length));
  const drawn = here ? [...opens, ...seats].slice(0, ROWS_NAMED).concat(rows.filter((r) => r.blur).slice(0, ROWS_BLUR)) : [];
  const moreN = here ? Math.max(0, total - drawn.length) : 0;
  const scoped = !!(industry || country);
  const filters = Number(!!industry) + Number(!!country);
  /** With a country picked, what the tab's count holds: "28 in the United States, plus 1,328 where the country isn't on file yet". */
  const inC = mine && answer.country ? answer.inCountry : null;
  const splitKey = view === "hiring" ? "hiring" : view === "notyet" ? "notYet" : "all";
  const split = c && inC && answer?.country ? countrySplit(tabCount(view) ?? 0, inC[splitKey], answer.country) : null;
  // "customer success" in running text, but RevOps and AI GTM keep their capitals.
  const fnLow = /^[A-Z][a-z]+( [A-Z][a-z]+)*$/.test(shownFn) ? shownFn.toLowerCase() : shownFn;
  /** What to say when the tab has no rows: widen the filters only when one is set. */
  const emptyText = () => {
    if (scoped)
      return view === "hiring"
        ? `No open ${fnLow} roles on file for that mix right now. Try All, or any industry or country.`
        : "Nothing on file for that mix yet. Try any industry or any country.";
    if (view === "hiring")
      return `No open ${fnLow} roles on file right now. We check every week. Try All to see the companies that hired a fractional ${noun}.`;
    if (view === "notyet") return `Every company on file that hires fractionals has hired a fractional ${noun} already.`;
    return c && c.notYet > 0
      ? `No fractional ${noun} seats on file yet. ${fmt(c.notYet)} companies hire fractionals in other functions, so they are good places to start. Join, add a seat you held and earn credits.`
      : `No fractional ${noun} seats on file yet. Join, add a seat you held and earn credits.`;
  };
  const ctaText =
    ask === "rates"
      ? "Join free to see rate benchmarks"
      : moreN > 0
        ? `Join free to see all ${fmt(total)}`
        : here && rows.length === 0
          ? view === "all" && !scoped && c?.notYet
            ? "Join free to see these companies"
            : "Join free to see the whole table"
          : view === "hiring"
            ? "Join free to see who is hiring"
            : view === "all" && c && c.holders > 0
              ? "Join free to see who held these seats"
              : "Join free to see these companies";
  const an = /^[AEIOU]/.test(shownFn) ? "an" : "a";

  return (
    <section className="lp-sec lp-find" id="find" aria-labelledby="find-h">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-sec-head-c">
          <span className="lp-sec-tag">
            <SparkMark className="lp-spark" />
            <span className="lp-pill lp-pill-pine">Live data</span>
            <SparkMark className="lp-spark lp-spark-sm" t="pine" />
          </span>
          <h2 className="lp-h2" id="find-h">
            What are you looking for?
          </h2>
          <p className="lp-lead">Pick your function and a question. The answer is on Merlin today.</p>
        </div>

        <div className="lp-ask">
          <div className={`lp-ask-box${ask ? " is-asked" : ""}`} role="group" aria-labelledby="find-h">
            <span className="lp-ask-icon" aria-hidden>
              <IconSearch size={22} />
            </span>
            <div className="lp-ask-q">
              {ask ? (
                <p className="lp-ask-text" aria-live="polite">
                  {askText(ask, fn)}
                </p>
              ) : (
                <>
                  <p className="lp-ask-ph" aria-hidden key={tick}>
                    {exampleAt(tick)}
                  </p>
                  <span className="sr-only">No question picked yet. Pick one of the suggestions.</span>
                </>
              )}
            </div>
            {ask ? (
              <button type="button" className="lp-ask-clear" aria-label="Clear the question" onClick={() => setAsk(null)}>
                <IconX size={16} />
              </button>
            ) : null}
            <label className={`lp-ask-fn${fn ? " is-on" : ""}`}>
              <span className="sr-only">Your function</span>
              <select className="lp-ask-select" value={fn ?? ""} data-fn={fn ?? ""} onChange={(e) => pickFn(e.target.value)}>
                <option value="" disabled>
                  Your function
                </option>
                <optgroup label="Go-to-market">
                  {gtm.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </optgroup>
                {more.length ? (
                  <optgroup label="More functions">
                    {more.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <IconChevron size={16} />
            </label>
          </div>

          <div className="lp-ask-row">
            <ul className="lp-ask-sug" aria-label="Suggested questions">
              {SUGGESTED.map((a) => (
                <li key={a}>
                  <button type="button" className={`lp-sug${ask === a ? " is-on" : ""}`} aria-pressed={ask === a} onClick={() => setAsk(a)}>
                    {askText(a, fn)}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={`lp-refine-btn${refine ? " is-open" : ""}`} aria-expanded={refine} aria-controls={`${id}-refine`} onClick={() => setRefine(!refine)}>
              Refine
              {filters ? <span className="lp-refine-n num">{filters}</span> : null}
              <IconChevron size={14} dir={refine ? "up" : "down"} />
            </button>
          </div>
          <div className="lp-refine" id={`${id}-refine`} hidden={!refine}>
            <label className="lp-refine-field">
              <span className="lp-refine-label">Industry</span>
              <select className="select lp-refine-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Any industry</option>
                {(answer?.options.industries ?? []).map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="lp-refine-field">
              <span className="lp-refine-label">Country</span>
              <select className="select lp-refine-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Any country</option>
                {(answer?.options.countries ?? []).map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="lp-res" aria-busy={busy} aria-live="polite">
          <p className="lp-res-scope">
            <span className="lp-res-fn">{shownFn}</span>
            <span>{industry || "Any industry"}</span>
            <span>{country || "Any country"}</span>
            {!fn ? <span className="lp-res-eg">Shown as an example. Pick your function above.</span> : null}
          </p>

          {failed && !c ? (
            <p className="lp-res-empty">We couldn&apos;t load the numbers just now. Try another function, or join and see the whole table.</p>
          ) : ask === "rates" ? (
            <div className="lp-res-note">
              <h3>Rates are inside Merlin</h3>
              <p>
                Members see median monthly and hourly rates by function, and on Pro by client size too. What should I charge works out a price for a
                client and shows the working. A figure shows only once enough people share a rate, and never whose it is, so there is no number to show
                here.
              </p>
            </div>
          ) : (
            <>
              <div className="lp-tabs" role="tablist" aria-label="Which companies">
                {VIEWS.map((v) => {
                  const n = tabCount(v);
                  return (
                    <button key={v} type="button" role="tab" aria-selected={v === view} className={`lp-tab${v === view ? " is-on" : ""}`} onClick={() => setAsk(v)}>
                      {viewLabel(v, shownFn)}
                      {n != null ? <span className="lp-tab-n num">{fmt(n)}</span> : <span className="lp-tab-n lp-skel" aria-label="Loading" />}
                    </button>
                  );
                })}
              </div>
              {split ? <p className="lp-res-split num">{split}</p> : null}
              {view === "all" && c && c.holders > 0 ? (
                <p className={`lp-res-held${ask === "held" ? " is-on" : ""}`}>
                  At <Num>{fmt(c.holders)}</Num> {c.holders === 1 ? "company" : "companies"}, the person who held {an} {shownFn} seat is on file. Unlock who it is
                  and ask how it went.
                </p>
              ) : ask === "held" && c ? (
                <p className="lp-res-held">No {shownFn} seat has its holder on file yet. Held one? Join, add it and earn credits.</p>
              ) : null}

              {c && here && rows.length === 0 ? (
                <p className="lp-res-empty">{emptyText()}</p>
              ) : (
                <ul className="lp-rws" aria-label={`${viewLabel(view, shownFn)}: companies`}>
                  {(drawn.length ? drawn : Array.from({ length: ROWS_NAMED }, () => null)).map((r, n) =>
                    r ? (
                      <li key={`${r.seed}-${n}`} className={`lp-rw${r.blur ? " is-blur" : ""}`} onClick={onJoin}>
                        <CompanyCell r={r} />
                        <span className="lp-rw-what">
                          <span className="lp-rw-title" title={r.title}>
                            {r.title}
                          </span>
                          <span className="lp-rw-sub num">{happening(r, shownFn)}</span>
                        </span>
                        <span className="lp-rw-facts num">
                          {[r.type, r.industry, r.employees ? `${r.employees} people` : null, r.revenue].filter(Boolean).map((x, k) => (
                            <span key={k}>{x}</span>
                          ))}
                        </span>
                      </li>
                    ) : (
                      <li key={`sk-${n}`} className="lp-rw lp-rw-skel" aria-hidden>
                        <span className="lp-rw-co">
                          <span className="lp-skel-logo" />
                          <span className="lp-skel-line" />
                        </span>
                        <span className="lp-skel-line" />
                        <span className="lp-skel-line lp-skel-short" />
                      </li>
                    ),
                  )}
                </ul>
              )}
            </>
          )}

          <div className="lp-res-foot" ref={ctaRef}>
            <button type="button" className={`btn btn-lg lp-res-cta num${primary ? " btn-primary" : " btn-pine"}`} onClick={onJoin}>
              {ctaText}
            </button>
            {ask === "rates" ? null : (
              <p className="lp-res-fine">
                {answer?.openRoleCompanies === false
                  ? "An open role's title is free. Inside Merlin, 2 credits show the company behind it and its job posting. Who held each seat, and the role they held, then show free."
                  : "An open role's title is free. Here we name a few of the companies hiring. Inside Merlin, 2 credits show the company behind an open role and its job posting. Who held each seat, and the role they held, then show free."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
