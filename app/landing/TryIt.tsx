"use client";

/**
 * "Try it" on the landing page: the visitor picks their function, and optionally an industry
 * and a country, and sees real numbers from the table and a few sample rows. The rows come from
 * GET /api/table?preview=1 (lib/preview.ts), which sends free facts only. Each company is drawn
 * the way the app draws a locked one: a blurred made-up name from an opaque seed.
 *
 * The section is up before any answer arrives: the counts are quiet bars until they land.
 * The picked function is kept in localStorage (tp_try_fn) so onboarding starts with it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CompanyLogo, LockedName, Num } from "../ui/shared";
import { GTM_FUNCTIONS } from "@/lib/tableFields";

/** Read by app/onboard/Onboarding.tsx. */
const TRY_FN_KEY = "tp_try_fn";
const DEFAULT_FN = "Sales";

interface PreviewRow {
  seed: string;
  kind: "open" | "hired";
  title: string;
  function: string;
  when: string | null;
  industry: string | null;
  employees: string | null;
  country: string | null;
  holder?: boolean;
}
interface PreviewAnswer {
  fn: string;
  industry: string | null;
  country: string | null;
  counts: { hired: number; notYet: number; hiring: number; holders: number; repeat: number; anyHire: number };
  rows: PreviewRow[];
  options: { functions: string[]; industries: string[]; countries: string[] };
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
const seatNoun = (fn: string) => SEAT_NOUN[fn] ?? `${fn} lead`;

const fmt = (n: number) => n.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function readFn(): string {
  try {
    return localStorage.getItem(TRY_FN_KEY) || DEFAULT_FN;
  } catch {
    return DEFAULT_FN;
  }
}

export interface TryItProps {
  /** Take the visitor to the join form. */
  onJoin: () => void;
  /** The button is the one primary action in view (no join form is on screen). */
  primary: boolean;
  /** The button's row, so the page can tell when it is on screen. */
  ctaRef?: React.RefObject<HTMLDivElement | null>;
}

export default function TryIt({ onJoin, primary, ctaRef }: TryItProps) {
  const [fn, setFn] = useState(DEFAULT_FN);
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);

  // The function picked on an earlier visit, once the page is in the browser.
  useEffect(() => {
    setFn(readFn());
    setReady(true);
  }, []);

  const load = useCallback((f: string, ind: string, ctry: string) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    const q = new URLSearchParams({ preview: "1", fn: f });
    if (ind) q.set("ind", ind);
    if (ctry) q.set("country", ctry);
    fetch(`/api/table?${q}`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: PreviewAnswer) => {
        if (c.signal.aborted || !a?.counts) return;
        setAnswer(a);
        setFailed(false);
        setBusy(false);
      })
      .catch(() => {
        if (c.signal.aborted) return;
        setFailed(true);
        setBusy(false);
      });
  }, []);

  useEffect(() => {
    if (ready) load(fn, industry, country);
  }, [ready, fn, industry, country, load]);
  useEffect(() => () => ctl.current?.abort(), []);

  const pickFn = (f: string) => {
    setFn(f);
    try {
      localStorage.setItem(TRY_FN_KEY, f);
    } catch {
      /* storage blocked: onboarding asks again */
    }
  };

  const functions = answer?.options.functions ?? GTM_FUNCTIONS;
  const more = functions.filter((f) => !GTM_FUNCTIONS.includes(f));
  const noun = seatNoun(fn);
  const c = answer && answer.fn === fn ? answer.counts : null;
  const rows = answer && answer.fn === fn ? answer.rows : [];
  const openRows = rows.filter((r) => r.kind === "open").length;

  return (
    <section className="lp-try" id="try" aria-labelledby="try-h">
      <div className="lp-wrap">
        <div className="lp-try-card">
          <div className="lp-try-head">
            <h2 className="lp-h2" id="try-h">
              Try it with your function
            </h2>
            <p className="lp-lead">Pick what you do. The numbers and rows below come from the table today.</p>
          </div>

          <div className="lp-try-pick">
            <div className="lp-try-fns" role="group" aria-label="Your function">
              {GTM_FUNCTIONS.map((f) => (
                <button key={f} type="button" className={`chip lp-try-chip${f === fn ? " chip-on" : ""}`} aria-pressed={f === fn} onClick={() => pickFn(f)}>
                  {f}
                </button>
              ))}
            </div>
            <div className="lp-try-filters">
              {more.length ? (
                <label className={`lp-try-field lp-try-more${more.includes(fn) ? " is-on" : ""}`}>
                  <span className="lp-try-label">Other functions</span>
                  <select className="select lp-try-select" value={more.includes(fn) ? fn : ""} onChange={(e) => e.target.value && pickFn(e.target.value)}>
                    <option value="">Finance, product and more</option>
                    {more.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="lp-try-field">
                <span className="lp-try-label">Industry</span>
                <select className="select lp-try-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  <option value="">Any industry</option>
                  {(answer?.options.industries ?? []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lp-try-field">
                <span className="lp-try-label">Country</span>
                <select className="select lp-try-select" value={country} onChange={(e) => setCountry(e.target.value)}>
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

          <div className="lp-try-body" aria-busy={busy} aria-live="polite">
            {failed && !c ? (
              <p className="lp-try-empty">We couldn&apos;t load the numbers just now. Try another function, or join and see the whole table.</p>
            ) : (
              <>
                <dl className="lp-try-counts">
                  <div className="lp-try-count">
                    <dt>
                      {c && c.hired === 1 ? "company has" : "companies have"} hired a fractional {noun}
                    </dt>
                    <dd className="num">{c ? fmt(c.hired) : <span className="lp-skel" aria-label="Loading" />}</dd>
                  </div>
                  <div className="lp-try-count">
                    <dt>
                      hire fractionals but have no fractional {noun} yet
                    </dt>
                    <dd className="num">{c ? fmt(c.notYet) : <span className="lp-skel" aria-label="Loading" />}</dd>
                  </div>
                  <div className="lp-try-count">
                    <dt>{c && c.hiring === 1 ? "is hiring one now" : "are hiring one now"}</dt>
                    <dd className="num">{c ? fmt(c.hiring) : <span className="lp-skel" aria-label="Loading" />}</dd>
                  </div>
                </dl>
                {c && c.holders > 0 ? (
                  <p className="lp-try-holders">
                    At <Num>{fmt(c.holders)}</Num> of these companies, the fractional who held the seat is on file. Unlock them and ask for an intro.
                  </p>
                ) : null}

                {c && rows.length === 0 ? (
                  <p className="lp-try-empty">Nothing on file for that mix yet. Try any industry or any country.</p>
                ) : (
                  <ul className="lp-try-rows" aria-label={openRows ? `Open ${fn} roles and past seats` : `Companies with a past ${fn} seat`}>
                    {(rows.length ? rows : Array.from({ length: 4 }, () => null)).map((r, n) =>
                      r ? (
                        <li key={`${r.seed}-${n}`} className="lp-try-row">
                          <CompanyLogo name="" domain={null} hidden seed={r.seed} />
                          <div className="lp-try-co">
                            <LockedName seed={r.seed} className="lp-try-name" />
                            <span className="lp-try-meta">{[r.industry, r.employees && `${r.employees} people`, r.country].filter(Boolean).join(" · ") || "No company details yet"}</span>
                          </div>
                          <div className="lp-try-role">
                            <span className="lp-try-title">{r.title}</span>
                            <span className="lp-try-when">
                              {r.kind === "open" ? (
                                <>
                                  <span className="lp-try-tag">Open role</span> {postedAgo(r.when)}
                                </>
                              ) : (
                                <>
                                  <span className="lp-try-tag lp-try-tag-quiet">Past seat</span> {[startedOn(r.when), r.holder ? "Seat holder on file" : null].filter(Boolean).join(" · ") || "Fractional hire on file"}
                                </>
                              )}
                            </span>
                          </div>
                        </li>
                      ) : (
                        <li key={`sk-${n}`} className="lp-try-row lp-try-row-skel" aria-hidden>
                          <span className="lp-try-skel-logo" />
                          <span className="lp-try-skel-line" />
                          <span className="lp-try-skel-line lp-try-skel-short" />
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="lp-try-foot" ref={ctaRef}>
            <button type="button" className={`btn btn-lg lp-try-cta${primary ? " btn-primary" : " btn-pine"}`} onClick={onJoin}>
              Join free to see these companies
            </button>
            <p className="lp-try-note">One credit shows a company, its job posting and the posted rate. Another shows who held a seat.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
