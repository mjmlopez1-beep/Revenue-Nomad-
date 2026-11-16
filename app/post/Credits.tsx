"use client";

/**
^ * "Your credits": the balance, how credits work (the one place the rules are written out),
 * the invite link, the personal sign-in link, the weekly email switch, the admin review
 * queue, and the full history, set out like a bank statement with a running balance.
 */
import type { LedgerRow, View } from "@/lib/tableTypes";
import { REFERRAL_BONUS, REFERRAL_LIMIT, fieldDef } from "@/lib/tableFields";
import { IconChevron, Num, timeAgo, useToast } from "../ui/shared";
import { atTime, copyText, plural } from "./hooks";
import { ledgerLine } from "./ledger";
import { Pro, useUi } from "./ui";
import { WeeklyEmail } from "./Settings";
import "./pages.css";

export const inviteLink = (code: string) => `${window.location.origin}/?ref=${code}`;
export const signInLink = (token: string) => `${window.location.origin}/?k=${token}`;

export function useCopy() {
  const toast = useToast();
  return async (text: string, done: string) => {
    const ok = await copyText(text);
    toast(ok ? done : "That didn't copy. Select the link and copy it yourself.", !ok);
  };
}

function LinkCard({ title, note, link, actions }: { title: string; note: string; link: string; actions: React.ReactNode }) {
  return (
    <section className="tp-card tp-linkcard">
      <h2 className="tp-card-h">{title}</h2>
      <p className="cr-note">{note}</p>
      <input className="input mono tp-linkinput" readOnly value={link} aria-label={title} onFocus={(e) => e.currentTarget.select()} />
      <div className="tp-linkcard-acts">{actions}</div>
    </section>
  );
}

/* ---------- history ---------- */

const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}
const amount = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

function History({ ledger, credits, starter, earnCap }: { ledger: LedgerRow[]; credits: number; starter: number; earnCap: number }) {
  // The ledger is newest first, so the balance after each line is worked back from today's.
  let bal = credits;
  const rows = ledger.map((l) => {
    const after = bal;
    bal -= l.delta;
    return { l, after };
  });
  const opening = bal;
  return (
    <section className="tp-card tp-ledger" aria-labelledby="cr-history">
      <h2 className="tp-card-h" id="cr-history">
        History
      </h2>
      {ledger.length === 0 && <p className="cr-note">Nothing has happened yet. The first fact you unlock or add shows up here.</p>}
      <div className="tp-ledger-scroll">
        <table className="tp-ltable">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">What happened</th>
              <th scope="col" className="num">
                Credits
              </th>
              <th scope="col" className="num">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ l, after }, k) => {
              const s = ledgerLine(l, earnCap);
              const newDay = k === 0 || dayKey(rows[k - 1].l.at) !== dayKey(l.at);
              const time = new Date(l.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              return [
                newDay && (
                  <tr key={`d${k}`} className="cr-day">
                    <th colSpan={4} scope="colgroup">
                      {dayLabel(l.at)}
                    </th>
                  </tr>
                ),
                <tr key={k}>
                  <td className="cr-time">
                    <Num>{time}</Num>
                  </td>
                  <td className="cr-what">
                    {s.text}
                    {s.note && <span className="cr-what-note"> {s.note}</span>}
                    <span className="cr-what-time">
                      <Num>{time}</Num>
                    </span>
                  </td>
                  <td className={`num cr-amt${l.delta > 0 ? " up" : ""}`}>{amount(l.delta)}</td>
                  <td className="num cr-bal">{after}</td>
                </tr>,
              ];
            })}
            <tr className="cr-open">
              <td className="cr-time" />
              <td className="cr-what">{opening === starter ? "Starting credits" : "Balance before this"}</td>
              <td className="num cr-amt up">{opening === starter ? `+${opening}` : ""}</td>
              <td className="num cr-bal">{opening}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- the page ---------- */

export function MyCredits({ view, onBack }: { view: View; onBack: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const copy = useCopy();
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const invite = inviteLink(me.inviteCode);
  const signin = signInLink(me.token);
  const mail = `mailto:${encodeURIComponent(me.email)}?subject=${encodeURIComponent("My Trading Post sign-in link")}&body=${encodeURIComponent(
    `Open this link to sign in to Trading Post on any device. Keep it private.\n\n${signin}`,
  )}`;
  const starter = view.stats.starter;
  const paid = me.invitesPaid ?? 0;
  const rules: [string, "plus" | "minus" | "flat", string][] = [
    [String(starter), "flat", `You start with ${starter} credits.`],
    ["+1", "plus", "You add a fact that's missing, like a role, a rate, who held a seat or a hiring contact."],
    ["−1", "minus", "You unlock a fact another member added. It stays open for you from then on."],
    ["+1", "plus", "Two other members confirm a fact you added."],
    [`+${REFERRAL_BONUS}`, "plus", `Someone you invited adds their first fact. They get ${REFERRAL_BONUS} too.`],
  ];
  return (
    <div className="tp-page cr-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Your credits</h1>
      <div className="tp-stats cr-stats">
        <div className="tp-stat cr-balance">
          <div className={`tp-stat-n num${me.credits <= 3 ? " ember" : ""}`}>{me.credits}</div>
          <div className="tp-stat-l">{me.credits === 1 ? "Credit to spend" : "Credits to spend"}</div>
          {me.credits <= 3 && <div className="cr-stat-sub">{capped ? `You can earn again ${atTime(me.earnResetsAt)}.` : "Add a fact you know and you earn one."}</div>}
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n num">
            {me.earned24h}
            <span className="tp-stat-of"> of {me.earnCap}</span>
          </div>
          <div className="tp-stat-l">Earned in the last 24 hours</div>
          <div className="cr-bar" role="img" aria-label={`${me.earned24h} of ${me.earnCap} credits earned in the last 24 hours`}>
            <span style={{ width: `${Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
          </div>
          {capped && <div className="cr-stat-sub">That is the daily limit. You can earn again {atTime(me.earnResetsAt)}.</div>}
          {me.held > 0 && (
            <div className="cr-stat-sub">
              {plural(me.held, "bonus credit is", "bonus credits are")} held. {me.held === 1 ? "It is" : "They are"} paid when you have room.
            </div>
          )}
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n num">{me.added}</div>
          <div className="tp-stat-l">{me.added === 1 ? "Fact you added" : "Facts you added"}</div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n num">{me.unlocked}</div>
          <div className="tp-stat-l">{me.unlocked === 1 ? "Fact you unlocked" : "Facts you unlocked"}</div>
        </div>
      </div>

      <section className="tp-card cr-rulescard" aria-labelledby="cr-rules">
        <h2 className="tp-card-h" id="cr-rules">
          How credits work
        </h2>
        <dl className="cr-rules">
          {rules.map(([n, tone, text], k) => (
            <div key={k}>
              <dt className={`num ${tone}`}>{n}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <div className="cr-limit">
          <h3 className="cr-limit-h">The daily limit</h3>
          <p>
            You can earn up to {me.earnCap} credits in any 24 hours, bonuses included. A bonus that would take you past {me.earnCap} is held and paid as soon as you have room. What you add
            past the limit still saves.
          </p>
        </div>
      </section>

      <div className="tp-linkcards">
        <LinkCard
          title="Invite a fractional"
          note={`Send this link to a fractional you'd vouch for. You each get ${REFERRAL_BONUS} credits when they add their first fact. Up to ${REFERRAL_LIMIT} invites pay out every 30 days.${
            me.invited ? ` ${plural(me.invited, "person has", "people have")} joined from your link so far${paid ? `, and ${paid} of them added a first fact` : ""}.` : ""
          }`}
          link={invite}
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(invite, "Invite link copied.")}>
              Copy invite link
            </button>
          }
        />
        <LinkCard
          title="Your sign-in link"
          note="Open it on another device to sign in there. Anyone who has this link can sign in as you, so keep it to yourself."
          link={signin}
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={() => copy(signin, "Sign-in link copied. Keep it to yourself.")}>
                Copy link
              </button>
              <a className="btn btn-sm btn-ghost" href={mail}>
                Email it to myself
              </a>
            </>
          }
        />
      </div>
      {view.scan?.digest && <WeeklyEmail />}
      {me.admin && (
        <section className="tp-card cr-review" aria-labelledby="cr-review">
          <h2 className="tp-card-h" id="cr-review">
            Reported facts to review
            {view.reported.length > 0 && <span className="chip cr-count num">{view.reported.length}</span>}
          </h2>
          {view.reported.length === 0 ? (
            <p className="cr-note">Nothing to review. A fact lands here when a member reports it.</p>
          ) : (
            <p className="cr-note">Two reports hide a fact from every member until you decide. Keep it and it shows again. Remove it and whoever unlocked it gets the credit back.</p>
          )}
          {view.reported.map((r) => {
            const kind = fieldDef(r.entity, r.field)?.kind;
            const hidden = r.reporters.length >= 2;
            return (
              <div key={`${r.id}.${r.field}`} className="tp-review-row">
                <div className="tp-review-what">
                  <div className="cr-review-h">
                    <strong>{r.label}</strong> <span>at {r.record}</span>
                    <span className={`chip${hidden ? " chip-on" : ""} cr-review-state`}>{hidden ? "Hidden from members" : plural(r.reporters.length, "report")}</span>
                  </div>
                  <div className={`tp-review-v${kind === "url" || kind === "email" ? " mono" : ""}`}>{r.value}</div>
                  <div className="tp-review-who">
                    Added by {r.addedBy}.{r.reporters.length > 0 && ` Reported by ${r.reporters.join(" and ")}`}
                    {r.reportedAt && `, ${timeAgo(r.reportedAt)}`}
                    {r.reporters.length > 0 && "."}
                  </div>
                </div>
                <div className="tp-review-acts">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openCompany(r.companyId)}>
                    Open the record
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => ui.act({ type: "review", entity: r.entity, id: r.id, field: r.field, decision: "keep" })}>
                    Keep it
                  </button>
                  <button type="button" className="btn btn-sm tp-btn-red" onClick={() => ui.act({ type: "review", entity: r.entity, id: r.id, field: r.field, decision: "remove" })}>
                    Remove it
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <History ledger={view.ledger} credits={me.credits} starter={starter} earnCap={me.earnCap} />
      <Pro where="my_credits" />
    </div>
  );
}
