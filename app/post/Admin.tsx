"use client";

/**
 * Pilot metrics, for admins. Everything comes from View.admin (AdminStats). Laid out to be
 * scanned: four headline numbers, then one compact card per question the pilot asks, each
 * labeled the way a founder would ask it. Numbers are right-aligned with tabular figures.
 * No ember here: it is a report. Without the admin block (not an admin) the page renders nothing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminStats, View } from "@/lib/tableTypes";
import { IconChevron } from "../ui/shared";
import { useUi } from "./ui";
import { Num } from "./Benchmarks";
import "./pages.css";

const n0 = (n: number) => n.toLocaleString("en-US");
/** Facts added for each fact unlocked, to two places. No unlocks yet reads as a dash. */
const ratio = (adds: number, unlocks: number) => (unlocks > 0 ? (adds / unlocks).toFixed(2) : "–");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
const stamp = (iso: string | null, none: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : none;
/** Where the Pro offer sits. Keys the app sends get a plain name; anything else shows as words. */
const PLACES: Record<string, string> = {
  zero_credits: "Out of credits, at a lock",
  hidden_company: "A hidden company's record",
  my_credits: "My credits",
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
    <div className="tp-stat">
      <div className="tp-stat-n">
        <Num>{value}</Num>
      </div>
      <div className="tp-stat-l">{label}</div>
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

function Scan({ a, refresh }: { a: AdminStats; refresh: () => Promise<void> }) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  /** How the last run from this page ended: it finished, or it is still going after two minutes. */
  const [ended, setEnded] = useState<"done" | "slow" | null>(null);
  const lastRun = useRef(a.scan.lastRunAt);
  lastRun.current = a.scan.lastRunAt;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Start a scan, then keep reading the view until its last run time moves (a scan runs in the background). */
  const run = async () => {
    if (busy) return;
    const before = lastRun.current;
    setBusy(true);
    setEnded(null);
    const r = await ui.act({ type: "scanNow" }, { quiet: true });
    if (!r.ok) return setBusy(false);
    let done = false;
    for (let i = 0; i < 45 && alive.current; i++) {
      await sleep(i < 4 ? 1200 : 4000);
      if (lastRun.current !== before) {
        done = true;
        break;
      }
      await refresh();
    }
    if (!alive.current) return;
    setBusy(false);
    setEnded(done ? "done" : "slow");
  };

  const s = a.scan;
  return (
    <Card
      title="Weekly scan for open roles"
      span={6}
      action={
        <button type="button" className="btn btn-sm btn-pine" disabled={busy} onClick={() => void run()}>
          {busy ? "Scanning" : "Run scan now"}
        </button>
      }
    >
      <div className="tp-pm-scan">
        <Rows
          items={[
            ["Last scan", stamp(s.lastRunAt, "Not yet")],
            ["Open roles now", n0(s.openNow)],
            ["Opened in the last 7 days", n0(s.opened7)],
            ["Closed in the last 30 days", n0(s.closed30)],
          ]}
        />
        <div className="tp-pm-sources">
          {s.sources.length === 0 ? (
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
                    <th scope="col">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sources.map((x) => (
                    <tr key={x.source}>
                      <td>{x.source}</td>
                      <td className="num">
                  <Num>{n0(x.fetched)}</Num>
                </td>
                      <td className="num">
                  <Num>{n0(x.matched)}</Num>
                </td>
                      <td className={x.error ? "tp-pm-err" : "tp-pm-none"}>{x.error || "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <p className="tp-small muted tp-pm-foot" role="status">
        {busy
          ? "Reading the job boards. This page updates when the scan finishes."
          : ended === "slow"
            ? "The scan is still running. Reload this page in a few minutes to see the result."
            : ended === "done"
              ? "The scan finished. These numbers are current."
              : "A scan reads every job board and keeps the fractional GTM roles. It can take a minute or two."}
      </p>
    </Card>
  );
}

export function Admin({ view, refresh, onBack }: { view: View; refresh: () => Promise<void>; onBack: () => void }) {
  const a = view.admin;
  if (!a) return null;
  const act = a.activity;
  const places = Object.entries(a.pro.byWhere).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  return (
    <div className="tp-page tp-pm">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <div className="tp-pm-head">
        <h1 className="tp-page-h">Pilot metrics</h1>
        <a className="btn btn-sm" href="/api/table?export=1" download>
          Download backup
        </a>
      </div>

      <div className="tp-stats">
        <Tile value={n0(a.members.active7)} label="Members active this week" sub={`${n0(a.members.active30)} in the last 30 days`} />
        <Tile value={ratio(act.adds, act.unlocks)} label="Facts added per unlock" sub={`${n0(act.adds)} added, ${n0(act.unlocks)} unlocked`} />
        <Tile value={n0(a.credits.atZero)} label={a.credits.atZero === 1 ? "Member out of credits" : "Members out of credits"} sub={`${n0(a.credits.low)} more with 1 to 3 left`} />
        <Tile value={n0(a.pro.interested)} label="On the Pro waitlist" sub={`${n0(a.pro.views)} saw the offer`} />
      </div>

      <div className="tp-pm-grid">
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

        <Card title="What members unlock most" span={3}>
          <Bars items={a.topUnlocked} tone="pine" unit="unlocks" empty="Nothing has been unlocked yet." />
        </Card>
        <Card title="What members add most" span={3}>
          <Bars items={a.topAdded} tone="volt" unit="added" empty="Nothing has been added yet." />
        </Card>

        <Scan a={a} refresh={refresh} />

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
      </div>
    </div>
  );
}
