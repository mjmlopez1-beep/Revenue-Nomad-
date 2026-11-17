"use client";

/**
 * "Try it" on the landing page: the visitor picks their function, and optionally an industry
 * and a country, and gets real numbers from the table and a small working table in the app's
 * style, with three tabs (all, hiring now, no fractional in this function yet). The rows come
 * from GET /api/table?preview=1 (lib/preview.ts): the first 10 name their company with its logo
 * and domain; the rest come without one (`blur`) and show the app's blurred made-up name
 * (lockedLook, from the row's opaque seed), so the server never sends who they are. A bar under
 * the table says how many more there are. Never a person, a posting link or a rate. While
 * lib/preview.ts keeps open-role companies back, those rows say the company unlocks with 1 credit.
 * The same answer carries the hero's example record, handed up with `onExample`.
 *
 * The section is up before any answer arrives: the counts are quiet bars until they land.
 * The picked function is kept in localStorage (tp_try_fn) so onboarding starts with it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CompanyLogo, IconLock, LockedName, LockedSite, Num } from "../ui/shared";
import { GTM_FUNCTIONS } from "@/lib/tableFields";

/** Read by app/onboard/Onboarding.tsx. */
const TRY_FN_KEY = "tp_try_fn";
const DEFAULT_FN = "Sales";

/** What GET /api/table?preview=1 sends (lib/preview.ts PreviewAnswer). */
export interface PreviewCompany {
  name: string;
  domain: string | null;
  logo: string | null;
}
interface PreviewRow {
  seed: string;
  kind: "open" | "hired" | "notyet";
  company: PreviewCompany | null;
  /** Past the first 10: no company sent, the page blurs a made-up name from `seed`. */
  blur?: boolean;
  title: string;
  function: string;
  when: string | null;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  country: string | null;
  holder?: boolean;
}
export interface PreviewExample {
  company: PreviewCompany & { industry: string | null; employees: string | null; revenue: string | null; country: string | null };
  open: { title: string; function: string; when: string | null } | null;
  seat: { function: string; start: string | null; rnMember: boolean };
}
type View = "all" | "hiring" | "notyet";
interface PreviewAnswer {
  fn: string;
  view?: View;
  total?: number;
  industry: string | null;
  country: string | null;
  counts: { hired: number; notYet: number; hiring: number; holders: number; repeat: number; anyHire: number };
  rows: PreviewRow[];
  example?: PreviewExample | null;
  openRoleCompanies?: boolean;
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

const VIEWS: View[] = ["all", "hiring", "notyet"];
const viewLabel = (v: View, fn: string) => (v === "all" ? "All" : v === "hiring" ? "Hiring now" : `No fractional ${fn} yet`);

/** The quiet line under a row's title. */
function happening(r: PreviewRow, fn: string): string {
  if (r.kind === "open") return `Open role · ${postedAgo(r.when)}`;
  if (r.kind === "notyet") return [`No fractional ${fn} yet`, r.when ? startedOn(r.when)?.replace("Started", "Latest hire") : null].filter(Boolean).join(" · ");
  return [startedOn(r.when), r.holder ? "Seat holder on file" : null].filter(Boolean).join(" · ") || "Fractional hire on file";
}

/** The company cell: logo, name and domain, a blurred made-up one past the first 10, or "unlocks with 1 credit" for a kept-back open role. */
function CompanyCell({ r }: { r: PreviewRow }) {
  if (r.blur)
    return (
      <span className="lp-tt-cobox">
        <CompanyLogo name="" domain={null} hidden seed={r.seed} />
        <span className="lp-tt-cotext">
          <span className="lp-tt-name">
            <LockedName seed={r.seed} />
          </span>
          <LockedSite seed={r.seed} className="lp-tt-dom" />
        </span>
      </span>
    );
  if (!r.company)
    return (
      <span className="lp-tt-cobox">
        <span className="logo lp-try-logo-kept" aria-hidden>
          <IconLock size={13} />
        </span>
        <span className="lp-tt-cotext">
          <span className="lp-tt-name lp-try-name-kept">Unlocks with 1 credit</span>
        </span>
      </span>
    );
  return (
    <span className="lp-tt-cobox">
      <CompanyLogo name={r.company.name} domain={r.company.logo} />
      <span className="lp-tt-cotext">
        <span className="lp-tt-name" title={r.company.name}>
          {r.company.name}
        </span>
        {r.company.domain ? <span className="lp-tt-dom mono">{r.company.domain}</span> : null}
      </span>
    </span>
  );
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
  /** The hero's example record, from the first answer that carries one (null when none fits). */
  onExample?: (x: PreviewExample | null) => void;
}

export default function TryIt({ onJoin, primary, ctaRef, onExample }: TryItProps) {
  const [fn, setFn] = useState(DEFAULT_FN);
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [view, setView] = useState<View>("all");
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
        setAnswer(a);
        setFailed(false);
        setBusy(false);
      })
      .catch(() => {
        if (c.signal.aborted) return;
        setFailed(true);
        setBusy(false);
      });
    // onExample is the page's state setter: stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) load(fn, industry, country, view);
  }, [ready, fn, industry, country, view, load]);
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
  const named = rows.filter((r) => !r.blur).length;
  const moreN = answer && answer.fn === fn && answer.view === view ? Math.max(0, (answer.total ?? rows.length) - named) : 0;

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

                <div className="lp-tt-tabs" role="tablist" aria-label="Which companies">
                  {VIEWS.map((v) => {
                    const n = v === "hiring" ? c?.hiring : v === "notyet" ? c?.notYet : null;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={v === view}
                        className={`lp-tt-tab${v === view ? " is-on" : ""}`}
                        onClick={() => setView(v)}
                      >
                        {viewLabel(v, fn)}
                        {n != null ? <span className="lp-tt-tab-n num">{fmt(n)}</span> : null}
                      </button>
                    );
                  })}
                </div>

                {c && answer?.view === view && rows.length === 0 ? (
                  <p className="lp-try-empty">{view === "hiring" ? `No open ${fn} roles on file for that mix right now. Try All, or any industry or country.` : "Nothing on file for that mix yet. Try any industry or any country."}</p>
                ) : (
                  <div className="lp-tt-scroll" role="region" aria-label={`${viewLabel(view, fn)}: companies`} tabIndex={0}>
                    <table className="lp-tt">
                      <thead>
                        <tr>
                          <th scope="col" className="lp-tt-co">
                            Company
                          </th>
                          <th scope="col">What&apos;s happening</th>
                          <th scope="col">Industry</th>
                          <th scope="col">Size</th>
                          <th scope="col">Revenue</th>
                          <th scope="col">Country</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rows.length && answer?.view === view ? rows : Array.from({ length: 6 }, () => null)).map((r, n) =>
                          r ? (
                            <tr key={`${r.seed}-${n}`} className={r.blur ? "is-blur" : undefined}>
                              <td className="lp-tt-co">
                                <CompanyCell r={r} />
                              </td>
                              <td className="lp-tt-what">
                                <span className="lp-tt-title" title={r.title}>
                                  {r.title}
                                </span>
                                <span className="lp-tt-sub">{happening(r, fn)}</span>
                              </td>
                              <td className="lp-tt-ind" title={r.industry ?? undefined}>
                                {r.industry ?? <span className="lp-tt-none">Not on file</span>}
                              </td>
                              <td className="num">{r.employees ? `${r.employees}` : <span className="lp-tt-none">Not on file</span>}</td>
                              <td className="num">{r.revenue ?? <span className="lp-tt-none">Not on file</span>}</td>
                              <td>{r.country ?? <span className="lp-tt-none">Not on file</span>}</td>
                            </tr>
                          ) : (
                            <tr key={`sk-${n}`} className="lp-tt-skel" aria-hidden>
                              <td className="lp-tt-co">
                                <span className="lp-try-skel-logo" />
                                <span className="lp-try-skel-line" />
                              </td>
                              <td>
                                <span className="lp-try-skel-line" />
                              </td>
                              <td>
                                <span className="lp-try-skel-line lp-try-skel-short" />
                              </td>
                              <td>
                                <span className="lp-try-skel-line lp-try-skel-short" />
                              </td>
                              <td>
                                <span className="lp-try-skel-line lp-try-skel-short" />
                              </td>
                              <td>
                                <span className="lp-try-skel-line lp-try-skel-short" />
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="lp-try-foot" ref={ctaRef}>
            {moreN > 0 ? (
              <p className="lp-tt-more">
                <strong className="num">{fmt(moreN)}</strong> more {moreN === 1 ? "company" : "companies"} after these {named}. Join free to see them all.
              </p>
            ) : null}
            <button type="button" className={`btn btn-lg lp-try-cta${primary ? " btn-primary" : " btn-pine"}`} onClick={onJoin}>
              {moreN > 0 ? "Join free to see them all" : answer?.openRoleCompanies === false ? "Join free to see these companies" : "Join free to see who held these seats"}
            </button>
            <p className="lp-try-note">
              {answer?.openRoleCompanies === false
                ? "One credit shows a company with an open role, its job posting and the posted rate. Another shows who held a seat."
                : "One credit shows who held a seat. Another shows an open role's job posting and posted rate."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
