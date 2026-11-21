"use client";

/**
 * Health, at the top of Pilot metrics: what's working and what isn't, in plain sentences, then the
 * numbers behind them (AdminStats.health, lib/health.ts). Counts only: never a name. Every table
 * has "Copy as CSV", which copies it to the clipboard (no download).
 */
import { useState, type ReactNode } from "react";
import type { AdminStats } from "@/lib/tableTypes";
import { Num } from "../ui/shared";

type Health = NonNullable<AdminStats["health"]>;
type Share = Health["cohorts"][number]["w1"];

const n0 = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;
const weekName = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(8, 10))}`;
const shareText = (x: Share) => (x.of ? `${pct(x.back, x.of)} (${n0(x.back)}/${n0(x.of)})` : "–");

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
const csvField = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (head: string[], rows: (string | number)[][]) => [head, ...rows].map((r) => r.map(csvField).join(",")).join("\n");

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page without clipboard permission: a hidden field and the copy command.
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyCsv({ csv, what }: { csv: () => string; what: string }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <span className="tp-hl-copy">
      <button
        type="button"
        className="btn btn-sm"
        aria-label={`Copy ${what} as CSV`}
        onClick={async () => {
          const ok = await copyText(csv());
          setSaid(ok ? "Copied" : "Couldn't copy");
          setTimeout(() => setSaid(null), 2000);
        }}
      >
        Copy as CSV
      </button>
      <span className="tp-small muted" role="status">
        {said}
      </span>
    </span>
  );
}

function HCard({ title, span = 3, children, action }: { title: string; span?: 2 | 3 | 6; children: ReactNode; action?: ReactNode }) {
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

/** A table with a header row, a label column and number columns, and its Copy as CSV. */
function HTable({ title, span = 3, head, rows, csv, foot }: { title: string; span?: 3 | 6; head: string[]; rows: { label: string; cells: string[] }[]; csv: (string | number)[][]; foot?: ReactNode }) {
  return (
    <HCard title={title} span={span} action={<CopyCsv what={title.toLowerCase()} csv={() => toCsv(head, csv)} />}>
      <div className="tp-pm-scroll">
        <table className="tp-pm-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={i ? "num" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className="num">
                    <Num>{c}</Num>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {foot && <p className="tp-small muted tp-pm-foot">{foot}</p>}
    </HCard>
  );
}

function Said({ title, tone, list, none }: { title: string; tone: "good" | "bad"; list: Health["insights"]["working"]; none: string }) {
  return (
    <HCard title={title}>
      {list.length ? (
        <ol className={`tp-hl-said tp-hl-${tone}`}>
          {list.map((x) => (
            <li key={x.text}>
              <span className="tp-hl-said-t">{x.text}</span>
              <span className="tp-hl-said-d">{x.detail}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="tp-small muted">{none}</p>
      )}
    </HCard>
  );
}

export function Health({ h }: { h: Health }) {
  const joined = h.funnel[0]?.n ?? 0;
  const earnedSum = (w: Health["credits"][number]) => Object.values(w.earned).reduce((a, b) => a + b, 0);
  const spentSum = (w: Health["credits"][number]) => Object.values(w.spent).reduce((a, b) => a + b, 0);
  const total = (f: (w: Health["credits"][number]) => number) => h.credits.reduce((n, w) => n + f(w), 0);
  const factsMember = h.weeks.reduce((n, w) => n + w.member, 0);
  const factsImported = h.weeks.reduce((n, w) => n + w.imported, 0);
  const E = ["seats", "facts", "invites", "pro", "topups", "starting", "refunds"] as const;
  const S = ["company", "person", "contact", "other", "takenBack"] as const;
  return (
    <div className="tp-hl">
      <h2 className="tp-hl-h">Health</h2>
      <div className="tp-pm-grid tp-hl-grid">
        <Said title="What's working" tone="good" list={h.insights.working} none="Nothing stands out yet. Statements show once each group has 20 members." />
        <Said title="What isn't" tone="bad" list={h.insights.notWorking} none="Nothing stands out yet. Statements show once each group has 20 members." />
        {h.insights.waiting.length > 0 && (
          <section className="tp-card tp-pm-card tp-pm-span6 tp-hl-wait">
            <details>
              <summary>Not enough members yet for {h.insights.waiting.length === 1 ? "1 more statement" : `${h.insights.waiting.length} more statements`}</summary>
              <ul>
                {h.insights.waiting.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          </section>
        )}

        <HTable
          title="Activation"
          head={["Step", "Members", "From the step before", "From joined"]}
          rows={h.funnel.map((f, i) => ({ label: f.step, cells: [n0(f.n), i ? pct(f.n, h.funnel[i - 1].n) : "–", pct(f.n, joined)] }))}
          csv={h.funnel.map((f, i) => [f.step, f.n, i && h.funnel[i - 1].n ? (f.n / h.funnel[i - 1].n).toFixed(3) : "", joined ? (f.n / joined).toFixed(3) : ""])}
          foot="Members who joined through the site. Each step counts members who also did every step before it."
        />
        <section className="tp-pm-span3 tp-hl-stack">
          <HCard title="Invites" span={6}>
            <dl className="tp-pm-rows">
              {(
                [
                  ["Invites to connect sent", n0(h.invites.sent)],
                  ["Members who joined through an invite", n0(h.invites.joined)],
                  ["Members paid the invite bonus", n0(h.invites.bonusMembers)],
                  ["Invite bonus credits paid", n0(h.invites.bonusCredits)],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>
                    <Num>{v}</Num>
                  </dd>
                </div>
              ))}
            </dl>
          </HCard>
          <HCard title="Plans" span={6}>
            {h.plans.billing ? (
              <dl className="tp-pm-rows">
                {(
                  [
                    ["Trial to paid", `${pct(h.plans.trialsPaid, h.plans.trialsEnded)} (${n0(h.plans.trialsPaid)} of ${n0(h.plans.trialsEnded)})`],
                    ["Paid members now", n0(h.plans.paidNow)],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l}>
                    <dt>{l}</dt>
                    <dd>
                      <Num>{v}</Num>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="tp-small muted">Billing is off, so nobody is on a trial or a paid plan.</p>
            )}
          </HCard>
          <HCard title="Outcomes" span={6}>
            {h.outcomes ? (
              <>
                {/* Every member's pipeline in counts and sums (lib/health.ts outcomeRows): never whose. */}
                <dl className="tp-pm-rows">
                  {h.outcomes.map((x) => (
                    <div key={x.label}>
                      <dt>{x.label}</dt>
                      <dd>
                        <Num>{x.unit === "$" ? `$${n0(x.n)}` : x.unit === "%" ? `${x.n}%` : n0(x.n)}</Num>
                      </dd>
                    </div>
                  ))}
                </dl>
                {!h.outcomes.some((x) => x.label === "Deals" && x.n > 0) && <p className="tp-small muted">No deals in anyone&apos;s pipeline yet.</p>}
              </>
            ) : (
              <p className="tp-small muted">Deal tracking not live yet.</p>
            )}
          </HCard>
        </section>

        <HTable
          title="Coming back, by month joined"
          span={6}
          head={["Joined in", "Members", "Week 1", "Week 4", "Week 8"]}
          rows={h.cohorts.length ? h.cohorts.map((c) => ({ label: monthName(c.month), cells: [n0(c.joined), shareText(c.w1), shareText(c.w4), shareText(c.w8)] })) : [{ label: "Nobody has joined yet", cells: ["0", "–", "–", "–"] }]}
          csv={h.cohorts.map((c) => [c.month, c.joined, c.w1.back, c.w1.of, c.w4.back, c.w4.of, c.w8.back, c.w8.of])}
          foot="Came back: did anything Merlin keeps a time for in that week after joining (a fact, an unlock, a message, an invite, a tap in the app, a locked company opened, or the last visit). Week 1 is days 7 to 13. A member counts once their week is over. Visits with none of these aren't kept, so this is a floor. Each cell is the share, then came back/counted. The CSV has both numbers for each week."
        />

        <HTable
          title="Facts added, last 12 weeks"
          span={6}
          head={["Week of", "By members", "Scanned or imported", "Total"]}
          rows={[
            ...h.weeks.map((w) => ({ label: weekName(w.week), cells: [n0(w.member), n0(w.imported), n0(w.member + w.imported)] })),
            { label: "12 weeks", cells: [n0(factsMember), n0(factsImported), n0(factsMember + factsImported)] },
          ]}
          csv={h.weeks.map((w) => [w.week, w.member, w.imported])}
          foot={
            <>
              Scanned or imported: the weekly scan, website reads, the website finder and dated seat scans. <Num>{pct(h.confirmed.confirmed, h.confirmed.facts)}</Num> of the{" "}
              <Num>{n0(h.confirmed.facts)}</Num> facts members added that are on file now were confirmed by a second member (<Num>{n0(h.confirmed.confirmed)}</Num>).
            </>
          }
        />
        <HTable
          title="Credits earned, last 12 weeks"
          span={6}
          head={["Week of", "Seats", "Company facts", "Invites", "Pro grants", "Top-ups", "Starting credits", "Refunds", "Total"]}
          rows={[
            ...h.credits.map((w) => ({ label: weekName(w.week), cells: [...E.map((k) => n0(w.earned[k])), n0(earnedSum(w))] })),
            { label: "12 weeks", cells: [...E.map((k) => n0(total((w) => w.earned[k]))), n0(total(earnedSum))] },
          ]}
          csv={h.credits.map((w) => [w.week, ...E.map((k) => w.earned[k])])}
          foot="Seats: facts and rates added to seats, and their confirmations. Company facts: facts about companies and their people. Starting credits: each member who joined that week."
        />
        <HTable
          title="Credits spent, last 12 weeks"
          span={6}
          head={["Week of", "Companies", "People", "Contact details", "Other facts", "Taken back", "Total"]}
          rows={[
            ...h.credits.map((w) => ({ label: weekName(w.week), cells: [...S.map((k) => n0(w.spent[k])), n0(spentSum(w))] })),
            { label: "12 weeks", cells: [...S.map((k) => n0(total((w) => w.spent[k]))), n0(total(spentSum))] },
          ]}
          csv={h.credits.map((w) => [w.week, ...S.map((k) => w.spent[k])])}
          foot="People: a person's name and title. Contact details: their email, phone or profile link. Other facts: seats, open roles and the rest. Taken back: credits for a fact a member took back. Free unlocks spend 0."
        />
      </div>
    </div>
  );
}
