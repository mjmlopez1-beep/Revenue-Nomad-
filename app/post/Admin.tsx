"use client";

/**
 * Pilot metrics, for admins. Everything comes from View.admin (AdminStats). Laid out to be
 * scanned: four headline numbers, then one compact card per question the pilot asks. Without
 * the admin block (not an admin) the page renders nothing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminStats, View } from "@/lib/tableTypes";
import { IconChevron } from "../ui/shared";
import { useUi } from "./ui";
import "./pages.css";

const n0 = (n: number) => n.toLocaleString("en-US");
/** Facts added for each fact unlocked, to two places. No unlocks yet reads as a dash. */
const ratio = (adds: number, unlocks: number) => (unlocks > 0 ? (adds / unlocks).toFixed(2) : "–");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
const stamp = (iso: string | null, none: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : none;
/** Place names arrive as short keys ("zero_popover"); show them as words. */
const placeName = (k: string) => {
  const s = k.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Unknown";
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Tile({ value, label, sub, ember }: { value: ReactNode; label: string; sub?: string; ember?: boolean }) {
  return (
    <div className="tp-stat">
      <div className={`tp-stat-n mono${ember ? " ember" : ""}`}>{value}</div>
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
          {/* Numbers and dates are set in mono; words ("Not yet", "Off") use the UI font. */}
          <dd className={typeof value === "string" && /\d/.test(value) ? "mono" : undefined}>{value}</dd>
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
          <span className="mono tp-pm-bar-n">{n0(x.n)}</span>
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
      title="Open-role scan"
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
            ["Last run", stamp(s.lastRunAt, "Not yet")],
            ["Open now", n0(s.openNow)],
            ["Opened in 7 days", n0(s.opened7)],
            ["Closed in 30 days", n0(s.closed30)],
          ]}
        />
        <div className="tp-pm-sources">
          {s.sources.length === 0 ? (
            <p className="tp-small muted">{s.lastRunAt ? "The last scan read no job boards." : "No scan has run yet, so there are no sources to show."}</p>
          ) : (
            <div className="tp-pm-scroll">
              <table className="tp-pm-table">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col" className="num">
                      Fetched
                    </th>
                    <th scope="col" className="num">
                      Matched
                    </th>
                    <th scope="col">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sources.map((x) => (
                    <tr key={x.source}>
                      <td>{x.source}</td>
                      <td className="num mono">{n0(x.fetched)}</td>
                      <td className="num mono">{n0(x.matched)}</td>
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
            ? "The scan is still running. Reload this page in a few minutes to see it."
            : ended === "done"
              ? "Scan finished. These numbers are current."
              : "A scan reads every job board and can take a minute or two."}
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
        <Tile value={ratio(act.adds, act.unlocks)} label="Facts added per fact unlocked" sub={`${n0(act.adds)} added, ${n0(act.unlocks)} unlocked`} />
        <Tile value={n0(a.credits.atZero)} label="Members at zero credits" sub={`${n0(a.credits.low)} more at 1 to 3`} ember={a.credits.atZero > 0} />
        <Tile value={n0(a.pro.interested)} label="Pro waitlist" sub={`${n0(a.pro.views)} views of the offer`} />
      </div>

      <div className="tp-pm-grid">
        <Card title="Members">
          <Rows
            items={[
              ["On the member list", n0(a.members.total)],
              ["Joined since launch", n0(a.members.joined)],
              ["Finished onboarding", n0(a.members.onboarded)],
              ["Active in 7 days", n0(a.members.active7)],
              ["Active in 30 days", n0(a.members.active30)],
            ]}
          />
        </Card>
        <Card title="Credits">
          <Rows
            items={[
              ["At zero", n0(a.credits.atZero)],
              ["At 1 to 3", n0(a.credits.low)],
              ["Median balance", n0(a.credits.median)],
            ]}
          />
          <p className="tp-small muted tp-pm-foot">Counts members who have signed in or joined, not the whole list.</p>
        </Card>
        <Card title="The wall">
          <Rows
            items={[
              ["Members who hit it", n0(a.walls.members)],
              ["Times it was hit", n0(a.walls.hits)],
            ]}
          />
          <p className="tp-small muted tp-pm-foot">Hitting the wall is trying to unlock a fact with zero credits.</p>
        </Card>

        <Card title="Giving and getting" span={3}>
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
                <td className="num mono">{n0(act.adds)}</td>
                <td className="num mono">{n0(act.adds7)}</td>
              </tr>
              <tr>
                <th scope="row">Facts unlocked</th>
                <td className="num mono">{n0(act.unlocks)}</td>
                <td className="num mono">{n0(act.unlocks7)}</td>
              </tr>
              <tr>
                <th scope="row">Added per unlocked</th>
                <td className="num mono">{ratio(act.adds, act.unlocks)}</td>
                <td className="num mono">{ratio(act.adds7, act.unlocks7)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card title="Pro waitlist" span={3}>
          <Rows
            items={[
              ["Interested", n0(a.pro.interested)],
              ["Views of the offer", n0(a.pro.views)],
              ["Conversion", pct(a.pro.interested, a.pro.views)],
            ]}
          />
          <h3 className="tp-pm-h3">By place</h3>
          {places.length ? (
            <Rows items={places.map(([k, n]) => [placeName(k), n0(n)])} />
          ) : (
            <p className="tp-small muted">Nobody has asked yet.</p>
          )}
        </Card>

        <Card title="Most unlocked" span={3}>
          <Bars items={a.topUnlocked} tone="pine" unit="unlocks" empty="No facts unlocked yet." />
        </Card>
        <Card title="Most added" span={3}>
          <Bars items={a.topAdded} tone="volt" unit="added" empty="No facts added yet." />
        </Card>

        <Scan a={a} refresh={refresh} />

        <Card title="Weekly email">
          <Rows
            items={[
              ["Sending", <span key="s" className={`tp-pm-flag${a.digest.enabled ? " on" : ""}`}>{a.digest.enabled ? "On" : "Off"}</span>],
              ["Last sent", stamp(a.digest.lastSentAt, "Not yet")],
              ["Emails sent", n0(a.digest.sent)],
              ["Opted out", n0(a.digest.optedOut)],
            ]}
          />
          {!a.digest.enabled && <p className="tp-small muted tp-pm-foot">It starts once email sending is set up.</p>}
        </Card>
        <Card title="Seats">
          <Rows
            items={[
              ["Members linked to a seat", n0(a.seats.linkedMembers)],
              ["Facts missing on those seats", n0(a.seats.factsMissing)],
            ]}
          />
        </Card>
        <Card title="Benchmarks">
          <Rows
            items={[
              ["Rates on records", n0(a.benchmarks.memberRates)],
              ["Rates shared privately", n0(a.benchmarks.privateRates)],
              ["Rate Index rates", n0(a.benchmarks.indexRates)],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
