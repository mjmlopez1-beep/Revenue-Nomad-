"use client";

/**
 * Pilot metrics, for admins. Everything comes from View.admin (AdminStats). Laid out to be
 * scanned: four headline numbers, then one compact card per question the pilot asks, each
 * labeled the way a founder would ask it. Numbers are right-aligned with tabular figures.
 * No ember here: it is a report. Without the admin block (not an admin) the page renders nothing.
 *
 * Two lists let an admin act: who added the most this week (with "Remove everything this
 * member added", behind a confirm), and the open roles members said they took.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminStats, View } from "@/lib/tableTypes";
import { IconChevron, Num } from "../ui/shared";
import { useUi } from "./ui";
import { FEATURE_NAME } from "@/lib/radar/types";
import { FUNDING_SKIP_WORDS, type FundingSkip } from "@/lib/funding/types";
import "./pages.css";
import "./verify.css";
import { NetworkMetrics } from "./network/Network"; // [google network]
import { AutoJobs } from "./AdminJobs";
import { Health } from "./AdminHealth";
import { PageHead, Stat } from "../ui/system";

const n0 = (n: number) => n.toLocaleString("en-US");
/** Facts added for each fact unlocked, to two places. No unlocks yet reads as a dash. */
const ratio = (adds: number, unlocks: number) => (unlocks > 0 ? (adds / unlocks).toFixed(2) : "–");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
const stamp = (iso: string | null, none: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : none;
/** Where the Pro offer sits. Keys the app sends get a plain name; anything else shows as words. */
const PLACES: Record<string, string> = {
  zero_credits: "Out of credits, at a lock",
  hidden_company: "A locked company's record",
  my_credits: "Your credits",
  hiring_tab: "The Hiring now tab",
};
const placeName = (k: string) => {
  if (PLACES[k]) return PLACES[k];
  const s = k.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Unknown";
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="tp-pm-stat">
      <Stat n={<Num>{value}</Num>} label={label} />
      {sub && <div className="tp-pm-sub">{sub}</div>}
    </div>
  );
}

function Card({ title, span = 2, children, action }: { title: string; span?: 2 | 3 | 6; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={`tp-card tp-pm-card tp-pm-span${span}`}>
      <div className="tp-pm-card-top">
        <h2 className="tp-card-h">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label and number pairs, one per line. */
function Rows({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="tp-pm-rows">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{typeof value === "string" ? <Num>{value}</Num> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A ranked list as thin bars from one baseline, each with its label and count. */
function Bars({ items, tone, unit, empty }: { items: { field: string; n: number }[]; tone: "pine" | "volt"; unit: string; empty: string }) {
  if (!items.length) return <p className="tp-small muted">{empty}</p>;
  const max = Math.max(...items.map((x) => x.n), 1);
  return (
    <ol className="tp-pm-bars">
      {items.map((x) => (
        <li key={x.field} title={`${x.field}, ${n0(x.n)} ${unit}`}>
          <span className="tp-pm-bar-l">{x.field}</span>
          <span className="tp-pm-bar-track" aria-hidden>
            <span className={`tp-pm-bar ${tone}`} style={{ width: `${Math.max(2, (x.n / max) * 100)}%` }} />
          </span>
          <span className="tp-pm-bar-n">
            <Num>{n0(x.n)}</Num>
          </span>
        </li>
      ))}
    </ol>
  );
}

type BoardRow = { source: string; fetched: number | null; matched: number | null; lastOkAt: string | null; problem: string | null; error: boolean };

/** The last run's boards and every board's health in one list: what it read, when it last ran clean, and what is wrong. */
function boardRows(a: AdminStats): BoardRow[] {
  const health = new Map((a.boards ?? []).map((b) => [b.source, b]));
  const names = [...new Set([...a.scan.sources.map((x) => x.source), ...health.keys()])];
  return names.map((source) => {
    const run = a.scan.sources.find((x) => x.source === source);
    const h = health.get(source);
    const distrust = h && !h.healthy ? `Not trusted on the last run.${h.baseline > 0 ? ` It usually matches ${n0(h.baseline)} ${h.baseline === 1 ? "role" : "roles"}.` : ""}` : null;
    return {
      source,
      fetched: run ? run.fetched : null,
      matched: run ? run.matched : null,
      lastOkAt: h?.lastOkAt ?? null,
      // The board's own error, as a sentence, then the trust note.
      problem: run?.error ? [/[.!?]$/.test(run.error.trim()) ? run.error.trim() : `${run.error.trim()}.`, distrust].filter(Boolean).join(" ") : distrust,
      error: !!run?.error,
    };
  });
}

/** The radar (lib/radar, FEATURE_NAME): who has it on, what went out, opens and clicks. Run now is in Automatic jobs. */
function Radar({ r }: { r: NonNullable<AdminStats["radar"]> }) {
  return (
    <Card title={FEATURE_NAME}>
      <Rows
        items={[
          [`Members with ${FEATURE_NAME} on`, n0(r.on)],
          ["Members who turned it off", n0(r.off)],
          ["Sent today", n0(r.sentToday)],
          ["Sent in the last 7 days", n0(r.sent7)],
          ["Opened in the last 7 days", n0(r.opens7)],
          ["Clicks in the last 7 days", n0(r.clicks7)],
          ["Clicks in all", n0(r.clicks)],
          ["Last run", stamp(r.lastRunAt, "Not yet")],
        ]}
      />
    </Card>
  );
}

/** The open-roles scan: the last run, the open roles, each job board. Run now is in Automatic jobs. */
function Scan({ a, lastOkAt }: { a: AdminStats; lastOkAt: string | null | undefined }) {
  const s = a.scan;
  const boards = boardRows(a);
  const distrusted = boards.some((b) => b.problem && !b.error);
  return (
    <Card title="Open roles scan" span={6}>
      <div className="tp-pm-scan">
        <Rows
          items={[
            ["Last scan", stamp(s.lastRunAt, "Not yet")],
            ...(lastOkAt !== undefined ? [["Last clean scan", s.lastRunAt && !lastOkAt ? "None yet" : stamp(lastOkAt, "Not yet")] as [string, string]] : []),
            ["Open roles now", n0(s.openNow)],
            ["Opened in the last 7 days", n0(s.opened7)],
            ["Closed in the last 30 days", n0(s.closed30)],
          ]}
        />
        <div className="tp-pm-sources">
          {boards.length === 0 ? (
            <p className="tp-small muted">{s.lastRunAt ? "The last scan read no job boards." : "No scan has run yet, so there are no job boards to list."}</p>
          ) : (
            <div className="tp-pm-scroll">
              <table className="tp-pm-table">
                <thead>
                  <tr>
                    <th scope="col">Job board</th>
                    <th scope="col" className="num">
                      Postings read
                    </th>
                    <th scope="col" className="num">
                      Roles kept
                    </th>
                    <th scope="col">Last clean scan</th>
                    <th scope="col">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.map((x) => (
                    <tr key={x.source}>
                      <td>{x.source}</td>
                      <td className="num">{x.fetched === null ? "–" : n0(x.fetched)}</td>
                      <td className="num">{x.matched === null ? "–" : n0(x.matched)}</td>
                      <td>{stamp(x.lastOkAt, "Never")}</td>
                      <td className={x.error ? "tp-pm-err" : x.problem ? "tp-pm-warn" : "tp-pm-none"}>{x.problem || "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {distrusted && <p className="tp-small muted tp-pm-foot">A board that is not trusted on a run never closes a role. Its roles stay as they were until it reads clean again.</p>}
        </div>
      </div>
      <p className="tp-small muted tp-pm-foot">A scan reads every job board and keeps the fractional GTM roles, then sends the weekly email. It can take a minute or two.</p>
    </Card>
  );
}

/**
 * About texts from company websites (lib/about): the run under way or the last one, and what is
 * on file. Run now and the schedule are in Automatic jobs, which reads the view again while it runs.
 */
function AboutFill({ a }: { a: AdminStats }) {
  const x = a.about!;
  const running = x.running;
  const r = x.run;
  return (
    <Card title="About texts from company websites" span={3}>
      <Rows
        items={[
          ["Companies with an About", `${n0(x.withAbout)} of ${n0(x.companies)}`],
          [x.running ? "This run" : "Last run", r ? `${n0(r.done)} of ${n0(r.total)} done` : "Not yet"],
          ["Filled", n0(r?.filled ?? 0)],
          ["Skipped", n0(r?.skipped ?? 0)],
          ["Failed", n0(r?.failed ?? 0)],
          [x.running ? "Started" : "Finished", r ? stamp(x.running ? r.startedAt : r.endedAt, "Stopped before the end") : "Not yet"],
          ["Never tried yet", n0(x.waiting)],
        ]}
      />
      {x.reasons.length > 0 && (
        <>
          <h3 className="tp-pm-h3">Why some were skipped</h3>
          <Rows items={x.reasons.map((q) => [q.why[0].toUpperCase() + q.why.slice(1), n0(q.n)] as [string, string])} />
        </>
      )}
      <p className="tp-small muted tp-pm-foot" role="status">
        {!x.enabled
          ? "Off. It starts once RN_ABOUT=1 is set on the server, then runs on its schedule and after each weekly scan."
          : running
            ? "Reading company websites, four at a time. This page updates as it goes."
            : "Reads the homepage of each company with no About yet. Nobody earns credits for these texts."}
      </p>
    </Card>
  );
}

/**
 * Funding from SEC Form D filings (lib/funding): the last daily run and all runs, counts only:
 * filings read, matched to a company on file, and unmatched by reason. Never a company or a person.
 */
function FundingFilings({ a }: { a: AdminStats }) {
  const x = a.funding!;
  const last = x.last;
  const reasons = (Object.entries(x.totals.unmatched) as [FundingSkip, number][]).filter(([, n]) => n > 0).sort((p, q) => q[1] - p[1]);
  return (
    <Card title="Funding from SEC filings" span={3}>
      <Rows
        items={[
          ["Daily run", <span key="f" className={`tp-pm-flag${x.enabled ? " on" : ""}`}>{x.enabled ? "On" : "Off"}</span>],
          ["Last run", stamp(x.lastRunAt, "Not yet")],
          ["Filings read, last run", last ? `${n0(last.filings)} (${n0(last.read)} documents)` : "Not yet"],
          ["Matched, last run", n0(last?.matched ?? 0)],
          ["Filings read, all runs", n0(x.totals.filings)],
          ["Matched, all runs", n0(x.totals.matched)],
          ["Events, last 30 days", `${n0(x.events30)} at ${n0(x.companies30)} companies`],
        ]}
      />
      {reasons.length > 0 && (
        <>
          <h3 className="tp-pm-h3">Unmatched, all runs</h3>
          <Rows items={reasons.map(([k, n]) => [FUNDING_SKIP_WORDS[k] ? FUNDING_SKIP_WORDS[k][0].toUpperCase() + FUNDING_SKIP_WORDS[k].slice(1) : k, n0(n)] as [string, string])} />
        </>
      )}
      <p className="tp-small muted tp-pm-foot" role="status">
        {!x.enabled
          ? "Off. It starts once RN_FUNDING=1 is set on the server: then it reads EDGAR once a day and Crystal Ball shows each raise."
          : last?.error
            ? `The last run stopped: ${last.error}. It tries again in 6 hours.`
            : "Reads each day's Form D filings and keeps a raise only for a company already on file whose exact name, place and industry agree. No person's name is kept."}
      </p>
    </Card>
  );
}

/**
 * Who leads each function, read from company websites (lib/leaders): a run of the next 200
 * companies or all of them (only with RN_LEADERS=1 on the server), its counts as it goes, and
 * what is on file. While a run goes on the view is read again every few seconds.
 */
function LeadersRead({ a, refresh }: { a: AdminStats; refresh: () => Promise<void> }) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"next" | "all">("next");
  const x = a.leaders!;
  const running = x.running || busy;
  const live = useRef(refresh);
  live.current = refresh;
  useEffect(() => {
    if (!x.running) return;
    const t = setInterval(() => void live.current(), 5000);
    return () => clearInterval(t);
  }, [x.running]);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    const r = await ui.act({ type: "leadersNow", scope }, { quiet: true });
    if (r.ok) await sleep(1500);
    await refresh();
    setBusy(false);
  };
  const r = x.run;
  const f = x.onFile;
  return (
    <Card
      title="Who leads each function"
      span={3}
      action={
        <span className="tp-pm-leads-act">
          <select className="select tp-pm-select" aria-label="Which companies" value={scope} disabled={running || !x.enabled} onChange={(e) => setScope(e.target.value === "all" ? "all" : "next")}>
            <option value="next">Next 200 companies</option>
            <option value="all">All companies</option>
          </select>
          <button type="button" className="btn btn-sm btn-pine" disabled={running || !x.enabled} onClick={() => void start()}>
            {running ? "Reading" : "Read leadership pages"}
          </button>
        </span>
      }
    >
      <Rows
        items={[
          [x.running ? "This run" : "Last run", r ? `${n0(r.done)} of ${n0(r.total)} done` : "Not yet"],
          ["Companies read", n0(r?.read ?? 0)],
          ["Pages read", n0(r?.pages ?? 0)],
          ["With a team or leadership page", n0(r?.team ?? 0)],
          ["With a press release", n0(r?.press ?? 0)],
          ["Functions found", n0(r?.functions ?? 0)],
          ["Fractional or interim found", n0(r?.fractional ?? 0)],
          ["Full-time found", n0(r?.fullTime ?? 0)],
          ["Named leaders kept", n0(r?.named ?? 0)],
          ["Failed, blocked by robots.txt, skipped", r ? `${n0(r.failed)} · ${n0(r.robots)} · ${n0(Math.max(0, r.skipped - r.robots))}` : "0 · 0 · 0"],
          [x.running ? "Started" : "Finished", r ? stamp(x.running ? r.startedAt : r.endedAt, "Stopped before the end") : "Not yet"],
        ]}
      />
      <h3 className="tp-pm-h3">On file</h3>
      <Rows
        items={[
          ["Companies read", n0(f.read)],
          ["Functions with a leader", n0(f.functions)],
          ["Fractional or interim", n0(f.fractional)],
          ["Full-time", n0(f.fullTime)],
          ["Named leaders (US companies)", n0(f.named ?? 0)],
          ["Nobody found", n0(f.none)],
          ["Failed, blocked by robots.txt, skipped", `${n0(f.failed)} · ${n0(f.robots)} · ${n0(f.skipped)}`],
          ["Due for a read", n0(x.due)],
        ]}
      />
      {x.coverage && (
        <>
          <h3 className="tp-pm-h3">Coverage</h3>
          <Rows
            items={[
              ["Companies with a website to read", n0(x.coverage.sites)],
              ["Read in the last 90 days", n0(x.coverage.known)],
              ["With a team page read then", n0(x.coverage.withTeam)],
              ["Last read", x.coverage.lastReadAt ? stamp(x.coverage.lastReadAt, "Not yet") : "Not yet"],
              ["Members said a full-time leader is in place", n0(x.coverage.reports)],
              ["Read each day in the background", x.enabled ? `${n0(x.coverage.dailyBatch)} companies` : "Off"],
              ["Days to read every company due", x.enabled ? n0(x.coverage.daysToCover) : "Off"],
              ["Last daily read", x.coverage.lastDaily ?? "Not yet"],
            ]}
          />
        </>
      )}
      {x.reasons.length > 0 && (
        <>
          <h3 className="tp-pm-h3">Why some were not read</h3>
          <Rows items={x.reasons.map((q) => [q.why[0].toUpperCase() + q.why.slice(1), n0(q.n)] as [string, string])} />
        </>
      )}
      <p className="tp-small muted tp-pm-foot" role="status">
        {!x.enabled
          ? "Off. It starts once RN_LEADERS=1 is set on the server."
          : running
            ? "Reading company websites, four at a time. This page updates as it goes."
            : "Reads each company's leadership, team and press pages for who leads each function. Keeps the name and title of the CEO and each function's leader at US companies, nobody below them."}
      </p>
    </Card>
  );
}

type RecentAdd = NonNullable<AdminStats["recentAdds"]>[number];

/** The remove-everything step: a question first, focus on the safe answer, Esc to back out. */
function useAsk(r: RecentAdd) {
  const ui = useUi();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    // Into the question on the safe answer, and back to the button when it closes.
    if (asking) noRef.current?.focus();
    else if (wasAsking.current) askRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const res = await ui.act({ type: "adminRemoveMember", memberId: r.memberId });
    setBusy(false);
    if (res.ok) setAsking(false);
  };
  const rates = r.privateRates > 0 ? `, ${r.privateRates === 1 ? "their private rate" : `their ${n0(r.privateRates)} private rates`}` : "";
  const button = (
    <button ref={askRef} type="button" className="tp-tbtn tp-pm-remove" onClick={() => setAsking(true)} aria-label={`Remove everything ${r.name} added`}>
      Remove everything this member added
    </button>
  );
  const question = (
    <div
      className="tp-pm-ask-in"
      role="group"
      aria-label={`Remove everything ${r.name} added?`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setAsking(false);
        }
      }}
    >
      <p>
        Remove everything {r.name} added? That is every fact they added on any record{rates}, and any record they made that is left empty. The credits they earned come off their balance,
        and anyone who unlocked those facts gets the credit back. This can&apos;t be undone.
      </p>
      <div className="tp-pm-ask-acts">
        <button type="button" className="btn btn-sm tp-btn-red" disabled={busy} onClick={() => void remove()}>
          {busy ? "Removing" : "Remove everything"}
        </button>
        <button ref={noRef} type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
  return { asking, button, question };
}

/** One member in "Most facts added this week" as a table row (wider screens). */
function AddsRow({ r }: { r: RecentAdd }) {
  const { asking, button, question } = useAsk(r);
  return (
    <>
      <tr className={asking ? "tp-pm-asking" : undefined}>
        <th scope="row">{r.name}</th>
        <td className="num">{n0(r.adds24h)}</td>
        <td className="num">{n0(r.adds7)}</td>
        <td className="num">{n0(r.privateRates)}</td>
        <td>{stamp(r.lastAt, "–")}</td>
        <td className="tp-pm-act">{!asking && button}</td>
      </tr>
      {asking && (
        <tr className="tp-pm-ask">
          <td colSpan={6}>{question}</td>
        </tr>
      )}
    </>
  );
}

/** The same member as a list item (phones): the counts in a line, the action under them. */
function AddsItem({ r }: { r: RecentAdd }) {
  const { asking, button, question } = useAsk(r);
  return (
    <li className="tp-pm-item">
      <div className="tp-pm-item-h">{r.name}</div>
      <div className="tp-pm-item-l">
        <Num>{n0(r.adds24h)}</Num> in the last 24 hours, <Num>{n0(r.adds7)}</Num> in 7 days
        {r.privateRates > 0 && (
          <>
            , <Num>{n0(r.privateRates)}</Num> private {r.privateRates === 1 ? "rate" : "rates"}
          </>
        )}
        . Last add {stamp(r.lastAt, "–")}.
      </div>
      {asking ? question : button}
    </li>
  );
}

function RecentAdds({ rows }: { rows: RecentAdd[] }) {
  const phone = useUi().layout === "phone";
  return (
    <Card title="Most facts added this week" span={6}>
      {rows.length === 0 ? (
        <p className="tp-small muted">Nobody has added a fact in the last 7 days.</p>
      ) : (
        <>
          {phone ? (
            <ul className="tp-pm-list">
              {rows.map((r) => (
                <AddsItem key={r.memberId} r={r} />
              ))}
            </ul>
          ) : (
            <div className="tp-pm-scroll">
              <table className="tp-pm-table tp-pm-people">
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col" className="num">
                      Last 24 hours
                    </th>
                    <th scope="col" className="num">
                      7 days
                    </th>
                    <th scope="col" className="num">
                      Private rates
                    </th>
                    <th scope="col">Last add</th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <AddsRow key={r.memberId} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tp-small muted tp-pm-foot">Counts are facts on records that still stand. Private rates is how many rates the member shared for the benchmarks only, never an amount.</p>
        </>
      )}
    </Card>
  );
}

type RoleClaim = NonNullable<AdminStats["roleClaims"]>[number];
const claimState = (c: RoleClaim, seats: boolean) =>
  seats ? (c.standing ? "Name on the seat" : "Released or removed") : !c.standing ? "Name since removed" : c.closed ? "Closed the role" : "Name kept, role still open";
const claimKey = (c: RoleClaim) => `${c.engagementId}.${c.memberId}.${c.at}`;

/** Open roles members said they took, or (`seats`) seats Revenue Nomad found that members claimed as theirs. */
function RoleClaims({ rows, seats = false }: { rows: RoleClaim[]; seats?: boolean }) {
  const phone = useUi().layout === "phone";
  return (
    <Card title={seats ? "Seats members claimed" : "Open roles members said they took"} span={6}>
      {rows.length === 0 ? (
        <p className="tp-small muted">
          {seats ? "Nobody has claimed a seat Revenue Nomad found in the last 30 days." : "Nobody has picked themselves as the seat holder of an open role in the last 30 days."}
        </p>
      ) : (
        <>
          {phone ? (
            <ul className="tp-pm-list">
              {rows.map((c) => (
                <li key={claimKey(c)} className="tp-pm-item">
                  <div className="tp-pm-item-h">
                    {c.name}
                    {c.company && <span className="tp-pm-item-at"> at {c.company}</span>}
                  </div>
                  <div className="tp-pm-item-l">
                    {claimState(c, seats)}. {stamp(c.at, "–")}.
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tp-pm-scroll">
              <table className="tp-pm-table tp-pm-people">
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Company</th>
                    <th scope="col">When</th>
                    <th scope="col">What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={claimKey(c)}>
                      <th scope="row">{c.name}</th>
                      <td>{c.company || "–"}</td>
                      <td>{stamp(c.at, "–")}</td>
                      <td className={c.standing && c.closed ? undefined : "tp-pm-quiet"}>{claimState(c, seats)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tp-small muted tp-pm-foot">
            A claim closes the role for everyone when the member counts (a seed member, a proven email, or a fact two members confirmed). Otherwise the name is kept and the role stays open
            until its posting comes down.
          </p>
        </>
      )}
    </Card>
  );
}

type NameClaim = NonNullable<AdminStats["names"]>["claims"][number];

/** One claim waiting: who says the seat is theirs, the name on file, and the four answers. */
/**
 * Members' own seats at companies new to Merlin, waiting to be confirmed. Their credits wait too
 * ("+4 when confirmed"); Confirm pays them. Another member confirming a fact on the seat does the same.
 */
function PendingSeats({ rows, refresh }: { rows: NonNullable<AdminStats["pendingSeats"]>; refresh: () => Promise<void> }) {
  const ui = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = async (id: string) => {
    if (busy) return;
    setBusy(id);
    const r = await ui.act({ type: "confirmSeat", engagementId: id });
    if (r.ok) await refresh();
    setBusy(null);
  };
  return (
    <Card title="Seats waiting to be confirmed" span={6}>
      <p className="tp-small muted">
        A member&apos;s own seat at a company that wasn&apos;t on Merlin. What they added there earns once it is confirmed: another member confirms a fact on the seat, or you do here.
      </p>
      {rows.length === 0 ? (
        <p className="tp-small muted">Nothing is waiting.</p>
      ) : (
        <ul className="tp-pm-list">
          {rows.map((c) => (
            <li key={c.engagementId} className="tp-pm-item tp-pm-claim">
              <div className="tp-pm-item-h">
                {c.name}
                <span className="tp-pm-item-at">
                  {" "}
                  added a seat at {c.company || "a company"} · {stamp(c.at, "–")}
                </span>
              </div>
              <div className="tp-pm-item-l">
                {c.credits} {c.credits === 1 ? "credit waits" : "credits wait"} for it.
              </div>
              <div className="tp-pm-ask-acts">
                <button type="button" className="btn btn-sm btn-pine" disabled={!!busy} aria-busy={busy === c.engagementId} onClick={() => void confirm(c.engagementId)}>
                  Confirm the seat
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NameClaimRow({ c }: { c: NameClaim }) {
  const ui = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, op: "approve" | "decline" | "verify" | "remove") => {
    if (busy) return;
    setBusy(key);
    await ui.act(op === "approve" || op === "decline" ? { type: "names", op, engagementId: c.engagementId, memberId: c.memberId } : { type: "names", op, engagementId: c.engagementId });
    setBusy(null);
  };
  return (
    <li className="tp-pm-item tp-pm-claim">
      <div className="tp-pm-item-h">
        {c.member}
        <span className="tp-pm-item-at"> says they held {c.seat ? `the ${c.seat} seat` : "a seat"}{c.company ? ` at ${c.company}` : ""}</span>
      </div>
      <div className="tp-pm-item-l">
        The name on file is {c.onFile || "gone"}. {stamp(c.at, "–")}.
      </div>
      <div className="tp-pm-ask-acts">
        <button type="button" className="btn btn-sm btn-pine" disabled={!!busy} aria-busy={busy === "approve"} onClick={() => void run("approve", "approve")}>
          Give it to {c.member.split(" ")[0]}
        </button>
        <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "decline"} onClick={() => void run("decline", "decline")}>
          Decline the claim
        </button>
        {c.onFile && (
          <>
            <button type="button" className="tp-tbtn" disabled={!!busy} onClick={() => void run("verify", "verify")}>
              The name on file is right
            </button>
            <button type="button" className="tp-tbtn tp-tbtn-red" disabled={!!busy} onClick={() => void run("remove", "remove")}>
              Remove the name
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Seat-holder names from public profiles: the switch "Show names from public profiles until we
 * reach N seats", where the table stands against it, the counts, and "This is me" claims whose
 * name doesn't match the one on file, for an admin to decide.
 */
function PublicNames({ n, refresh }: { n: NonNullable<AdminStats["names"]>; refresh: () => Promise<void> }) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    const r = await ui.act({ type: "names", op: "show", on: !n.on });
    // Every seat with such a name changes, so the table is read again whole.
    if (r.ok) await refresh();
    setBusy(false);
  };
  const limit = n0(n.limit);
  return (
    <Card title="Names from public profiles" span={6}>
      <label className="tp-pm-switch">
        <input type="checkbox" checked={n.on} disabled={busy} onChange={() => void flip()} />
        <span>Show names from public profiles until we reach {limit} seats</span>
      </label>
      <p className="tp-small muted tp-pm-foot" role="status">
        {!n.on
          ? "Off. Those seats read as unnamed, their role is free, and claims still work. Verified and claimed names still show."
          : n.shown
            ? `Showing. The table has ${n0(n.seats)} seats, so they show until it reaches ${limit}.`
            : `Not showing. The table has ${n0(n.seats)} seats, past ${limit}, so they read as unnamed.`}
      </p>
      <Rows
        items={[
          ["Names on seats", n0(n.onFile)],
          ["Not verified yet", n0(n.unverified)],
          ["Claimed by the person", n0(n.claimed)],
          ["Taken off", n0(n.removed)],
        ]}
      />
      <h3 className="tp-pm-h3">Claims waiting for you</h3>
      {n.claims.length === 0 ? (
        <p className="tp-small muted">Nobody is waiting. A claim lands here when a member says a seat is theirs and their name doesn&apos;t match the one on file.</p>
      ) : (
        <ul className="tp-pm-list">
          {n.claims.map((c) => (
            <NameClaimRow key={`${c.engagementId}.${c.memberId}`} c={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Dollars from cents, whole when they are whole ("$1,239", "$49.17"). */
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Billing, while it is live (lib/billing): plans, trial-to-paid, recurring revenue, churn, top-ups. Counts and money only. */
interface ClosedRow {
  memberId: string;
  name: string;
  at: string;
  purgeAt: string;
  by: "member" | "admin";
  purged: boolean;
}

/** Closed accounts (lib/account.ts): when each closed, the day its personal data goes, and Restore until then. */
function ClosedAccounts() {
  const [rows, setRows] = useState<ClosedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = async () => {
    const r = await fetch("/api/account?closed=1", { headers: { accept: "application/json" } }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { closed: ClosedRow[] }) : null;
    setRows(j?.closed ?? []);
  };
  useEffect(() => {
    void load();
  }, []);
  if (!rows?.length) return null;
  const day = (iso: string) => iso.slice(0, 10);
  const restore = async (x: ClosedRow) => {
    setBusy(x.memberId);
    const r = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "restore", memberId: x.memberId }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { message?: string; error?: string } | undefined;
    setBusy(null);
    setNote(j?.message ?? j?.error ?? "That didn't go through.");
    await load();
  };
  return (
    <Card title="Closed accounts" span={3}>
      <ul className="tp-pm-list" data-closed-accounts>
        {rows.map((x) => (
          <li key={x.memberId}>
            {x.purged ? (
              <span>Closed {day(x.at)}, personal data deleted</span>
            ) : (
              <>
                <span>
                  {x.name || "A member"}, closed {day(x.at)}
                  {x.by === "admin" ? " by an admin" : ""}. Personal data goes {day(x.purgeAt)}.
                </span>{" "}
                <button type="button" className="btn btn-sm" disabled={busy === x.memberId} onClick={() => void restore(x)}>
                  {busy === x.memberId ? "Restoring" : "Restore"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="tp-small muted">{note}</p>}
    </Card>
  );
}

function BillingCard({ b }: { b: NonNullable<NonNullable<View["admin"]>["billing"]> }) {
  return (
    <Card title="Billing" span={6}>
      <div className="tp-stats tp-pm-bill">
        <Tile value={usd(b.mrrCents)} label="Monthly recurring revenue" sub="A yearly plan counts a twelfth. Plans set to end are left out." />
        <Tile value={n0(b.pro)} label={b.pro === 1 ? "Member on Pro" : "Members on Pro"} sub={`${n0(b.trial)} on the trial, ${n0(b.free)} on Free${b.paused ? `, ${n0(b.paused)} paused` : ""}`} />
        <Tile value={pct(b.trialsPaid, b.trialsEnded)} label="Trial to paid" sub={`${n0(b.trialsPaid)} of ${n0(b.trialsEnded)} trials that ended`} />
        <Tile value={n0(b.churnMonth)} label="Ended this month" sub="Paid plans that stopped" />
      </div>
      <Rows
        items={[
          ["Paid this month", usd(b.paidMonthCents)],
          ["Top-ups this month", n0(b.topupsMonth)],
          ["Top-ups in all", `${n0(b.topups)} (${usd(b.topupCents)})`],
        ]}
      />
    </Card>
  );
}

export function Admin({ view, refresh }: { view: View; refresh: () => Promise<void> }) {
  const a = view.admin;
  if (!a) return null;
  const act = a.activity;
  const places = Object.entries(a.pro.byWhere).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  return (
    <div className="page-wide tp-pm">
      <PageHead
        title="Pilot metrics"
        actions={
          <a className="btn btn-sm" href="/api/table?export=1" download>
            Download backup
          </a>
        }
      />
      {/* Health first: what's working, what isn't, and the numbers behind it (lib/health.ts). */}
      {a.health && <Health h={a.health} />}
      {/* Then the background jobs: what runs on its own, how often, and Run now. */}
      <div className="tp-pm-grid tp-pm-jobs-top">
        <AutoJobs refresh={refresh} />
      </div>

      <div className="tp-stats">
        <Tile value={n0(a.members.active7)} label="Members active this week" sub={`${n0(a.members.active30)} in the last 30 days`} />
        <Tile value={ratio(act.adds, act.unlocks)} label="Facts added per unlock" sub={`${n0(act.adds)} added, ${n0(act.unlocks)} unlocked`} />
        <Tile value={n0(a.credits.atZero)} label={a.credits.atZero === 1 ? "Member out of credits" : "Members out of credits"} sub={`${n0(a.credits.low)} more with 1 to 3 left`} />
        {a.billing ? (
          <Tile value={n0(a.billing.pro)} label={a.billing.pro === 1 ? "Member on Pro" : "Members on Pro"} sub={`${n0(a.billing.trial)} on the trial`} />
        ) : (
          <Tile value={n0(a.pro.interested)} label="On the Pro waitlist" sub={`${n0(a.pro.views)} saw the offer`} />
        )}
      </div>

      <div className="tp-pm-grid">
        {a.billing && <BillingCard b={a.billing} />}
        <Card title="Members">
          <Rows
            items={[
              ["On the member list", n0(a.members.total)],
              ["Joined since launch", n0(a.members.joined)],
              ["Finished onboarding", n0(a.members.onboarded)],
              ["Active in the last 7 days", n0(a.members.active7)],
              ["Active in the last 30 days", n0(a.members.active30)],
            ]}
          />
        </Card>
        <Card title="Credit balances">
          <Rows
            items={[
              ["Out of credits", n0(a.credits.atZero)],
              ["1 to 3 left", n0(a.credits.low)],
              ["Median balance", n0(a.credits.median)],
            ]}
          />
          <p className="tp-small muted tp-pm-foot">Only members who have signed in or joined are counted.</p>
        </Card>
        <Card title="Tried to unlock with 0 credits">
          <Rows
            items={[
              ["Members it happened to", n0(a.walls.members)],
              ["Times it happened", n0(a.walls.hits)],
            ]}
          />
          <p className="tp-small muted tp-pm-foot">A member with no credits tapped a lock. This is demand the credits did not cover.</p>
        </Card>
        {a.lockedViews && (
          <Card title="Locked companies opened" span={3}>
            <table className="tp-pm-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Measure</span>
                  </th>
                  <th scope="col" className="num">
                    Last 7 days
                  </th>
                  <th scope="col" className="num">
                    Last 30 days
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Views", n0(a.lockedViews.views7), n0(a.lockedViews.views30)],
                    ["Members who looked", n0(a.lockedViews.members7), n0(a.lockedViews.members30)],
                    ["Unlocked after a view", n0(a.lockedViews.unlocked7), n0(a.lockedViews.unlocked30)],
                    ["View to unlock", pct(a.lockedViews.unlocked7, a.lockedViews.views7), pct(a.lockedViews.unlocked30, a.lockedViews.views30)],
                  ] as const
                ).map(([label, w, m]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td className="num">
                      <Num>{w}</Num>
                    </td>
                    <td className="num">
                      <Num>{m}</Num>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tp-small muted tp-pm-foot">A view is one member opening one locked company&apos;s record on one day. Counts only: never which company.</p>
          </Card>
        )}

        <Card title="Added and unlocked" span={3}>
          <table className="tp-pm-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Measure</span>
                </th>
                <th scope="col" className="num">
                  All time
                </th>
                <th scope="col" className="num">
                  Last 7 days
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Facts added</th>
                <td className="num">
                  <Num>{n0(act.adds)}</Num>
                </td>
                <td className="num">
                  <Num>{n0(act.adds7)}</Num>
                </td>
              </tr>
              <tr>
                <th scope="row">Facts unlocked</th>
                <td className="num">
                  <Num>{n0(act.unlocks)}</Num>
                </td>
                <td className="num">
                  <Num>{n0(act.unlocks7)}</Num>
                </td>
              </tr>
              <tr>
                <th scope="row">Added per unlock</th>
                <td className="num">
                  <Num>{ratio(act.adds, act.unlocks)}</Num>
                </td>
                <td className="num">
                  <Num>{ratio(act.adds7, act.unlocks7)}</Num>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
        {/* The waitlist from before billing: gone once billing is on. */}
        {!a.billing && (
          <Card title="Pro waitlist" span={3}>
            <Rows
              items={[
                ["Asked to hear about Pro", n0(a.pro.interested)],
                ["Saw the offer", n0(a.pro.views)],
                ["Asked, out of those who saw it", pct(a.pro.interested, a.pro.views)],
              ]}
            />
            <h3 className="tp-pm-h3">Where they asked</h3>
            {places.length ? (
              <Rows items={places.map(([k, n]) => [placeName(k), n0(n)])} />
            ) : (
              <p className="tp-small muted">Nobody has asked yet.</p>
            )}
          </Card>
        )}

        <Card title="What members unlock most" span={3}>
          <Bars items={a.topUnlocked} tone="pine" unit="unlocks" empty="Nothing has been unlocked yet." />
        </Card>
        <Card title="What members add most" span={3}>
          <Bars items={a.topAdded} tone="volt" unit="added" empty="Nothing has been added yet." />
        </Card>

        {a.recentAdds && <RecentAdds rows={a.recentAdds} />}
        <ClosedAccounts />
        {a.roleClaims && <RoleClaims rows={a.roleClaims} />}
        {a.seatClaims && <RoleClaims rows={a.seatClaims.map((c) => ({ ...c, closed: false }))} seats />}
        {a.names && <PublicNames n={a.names} refresh={refresh} />}
        {a.pendingSeats && <PendingSeats rows={a.pendingSeats} refresh={refresh} />}

        <Scan a={a} lastOkAt={view.scan ? view.scan.lastOkAt ?? (a.boards ? null : undefined) : undefined} />
        {a.about && <AboutFill a={a} />}
        {a.leaders && <LeadersRead a={a} refresh={refresh} />}
        {a.funding && <FundingFilings a={a} />}

        <Card title="Weekly email">
          <Rows
            items={[
              ["Sending", <span key="s" className={`tp-pm-flag${a.digest.enabled ? " on" : ""}`}>{a.digest.enabled ? "On" : "Off"}</span>],
              ["Last sent", stamp(a.digest.lastSentAt, "Not yet")],
              ["Emails sent", n0(a.digest.sent)],
              ["Members who turned it off", n0(a.digest.optedOut)],
            ]}
          />
          {!a.digest.enabled && <p className="tp-small muted tp-pm-foot">It starts going out once email sending is set up.</p>}
        </Card>
        <Card title="Your seats">
          <Rows
            items={[
              ["Members matched to a seat", n0(a.seats.linkedMembers)],
              ["Facts still missing on those seats", n0(a.seats.factsMissing)],
            ]}
          />
        </Card>
        <Card title="Rates in the benchmarks">
          <Rows
            items={[
              ["On seats", n0(a.benchmarks.memberRates)],
              ["Shared privately", n0(a.benchmarks.privateRates)],
              ["From the Rate Index", n0(a.benchmarks.indexRates)],
            ]}
          />
        </Card>
        {a.radar && <Radar r={a.radar} />}
        {a.radarModel && (
          <Card title={`${FEATURE_NAME}: what our data says`}>
            <Rows
              items={[
                ["Seat-to-seat transitions on file", n0(a.radarModel.transitions)],
                ["Companies they come from", n0(a.radarModel.companies)],
                ...a.radarModel.byStage.map((x): [string, string] => [`At ${x.stage}`, n0(x.n)]),
                ...a.radarModel.top.map((x): [string, string] => [`${x.from} then ${x.to}`, n0(x.n)]),
                ["Companies with ownership on file", n0(a.radarModel.facts.ownership)],
                ["Seats with why now", n0(a.radarModel.facts.whyNow)],
                ["Seats with why it ended", n0(a.radarModel.facts.endReason)],
                ["Seats with revenue then", n0(a.radarModel.facts.revenueThen)],
                ["Seats with employees then", n0(a.radarModel.facts.employeesThen)],
                ["Seats with who introduced them (never shown)", n0(a.radarModel.facts.introducedBy)],
                ["Companies whose sales hires are counted", n0(a.radarModel.salesBuild.companies)],
                ["Sales builds seen", n0(a.radarModel.salesBuild.rises)],
                ["Leaders gone from a website (180 days)", n0(a.radarModel.departures)],
              ]}
            />
            <p className="tp-small muted tp-pm-foot">Each next seat moves the research&apos;s priors a little. About 30 in a cell before it can be trusted on its own.</p>
          </Card>
        )}
        {a.finds && (
          <Card title="Found by exact name (24 hours)">
            <Rows
              items={[
                ["Companies looked up", n0(a.finds.today)],
                ["Members who looked one up", n0(a.finds.members)],
                ["Members at their daily limit", n0(a.finds.atCap)],
                ["Lookups with no match", n0(a.finds.misses)],
                ["Members at the no-match limit", n0(a.finds.missCap)],
              ]}
            />
          </Card>
        )}
        {a.integrations && (
          <Card title="Alerts in Slack">
            <Rows
              items={[
                ["Members connected to Slack", n0(a.integrations.slackConnected)],
                ["Members with a webhook", n0(a.integrations.webhookConnected)],
                ["Role alerts sent", n0(a.integrations.sent.roles)],
                ["Message alerts sent", n0(a.integrations.sent.message)],
                ["Seat alerts sent", n0(a.integrations.sent.seat)],
                [`${FEATURE_NAME} posts sent`, n0(a.integrations.sent.radar ?? 0)],
                ["Tests sent", n0(a.integrations.sent.test)],
                ["Posts that failed", n0(a.integrations.failed)],
                ["Connections that stopped", n0(a.integrations.broken)],
              ]}
            />
          </Card>
        )}
        {/* [google network] counts only: no names, no emails (nothing with RN_GOOGLE off). */}
        <NetworkMetrics Card={Card} Rows={Rows} />
      </div>
    </div>
  );
}
