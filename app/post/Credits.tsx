"use client";

/** "My credits": balance, earning, invite link, personal sign-in link, full ledger, admin review. */
import type { View } from "@/lib/tableTypes";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { IconChevron, timeAgo, useToast } from "../ui/shared";
import { copyText, fmtTime } from "./hooks";
import { ledgerWhat, ledgerWhere } from "./TopBar";
import { useUi } from "./ui";

export const inviteLink = (code: string) => `${window.location.origin}/?ref=${code}`;
export const signInLink = (token: string) => `${window.location.origin}/?k=${token}`;

export function useCopy() {
  const toast = useToast();
  return async (text: string, done: string) => {
    const ok = await copyText(text);
    toast(ok ? done : "Could not copy. Select the link and copy it.", !ok);
  };
}

function LinkCard({ title, note, link, actions }: { title: string; note: string; link: string; actions: React.ReactNode }) {
  return (
    <section className="tp-card tp-linkcard">
      <h3 className="tp-card-h">{title}</h3>
      <p className="tp-small muted">{note}</p>
      <input className="input mono tp-linkinput" readOnly value={link} aria-label={title} onFocus={(e) => e.currentTarget.select()} />
      <div className="tp-linkcard-acts">{actions}</div>
    </section>
  );
}

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
  return (
    <div className="tp-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">My credits</h1>
      <div className="tp-stats">
        <div className="tp-stat">
          <div className={`tp-stat-n mono${me.credits <= 3 ? " ember" : ""}`}>{me.credits}</div>
          <div className="tp-stat-l">Credits to spend</div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n mono">
            {me.earned24h}
            <span className="tp-stat-of"> / {me.earnCap}</span>
          </div>
          <div className="tp-stat-l">{capped ? `Earned today. Reopens ${fmtTime(me.earnResetsAt)}` : "Earned in the last 24 hours"}</div>
          {me.held > 0 && (
            <div className="tp-stat-l">
              {me.held} bonus credit{me.held > 1 ? "s" : ""} held, paid as your daily room opens
            </div>
          )}
          <div className={`tp-bar${capped ? " capped" : ""}`}>
            <span style={{ width: `${Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
          </div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n mono">{me.added}</div>
          <div className="tp-stat-l">Facts added</div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-n mono">{me.unlocked}</div>
          <div className="tp-stat-l">Facts unlocked</div>
        </div>
      </div>
      <div className="tp-rules">
        <p>
          <span className="tp-plus mono">+1</span> Add a missing fact. Up to {me.earnCap} earned a day, bonuses included.
        </p>
        <p>
          <span className="tp-minus mono">−1</span> Unlock a fact. It stays unlocked for you.
        </p>
        <p>
          <span className="tp-plus mono">+1</span> Two members confirm a fact you added.
        </p>
        <p>
          <span className="tp-plus mono">+{REFERRAL_BONUS}</span> A fractional you invite adds their first fact. They get {REFERRAL_BONUS} too.
        </p>
      </div>
      <div className="tp-linkcards">
        <LinkCard
          title="Invite a fractional"
          note={`You both get ${REFERRAL_BONUS} credits when they add their first fact.${me.invited ? ` ${me.invited} joined from your link so far.` : ""}`}
          link={invite}
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(invite, "Invite link copied.")}>
              Copy invite link
            </button>
          }
        />
        <LinkCard
          title="Your sign-in link"
          note="Use it to sign in on another device. Keep it private, it works like a password."
          link={signin}
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={() => copy(signin, "Sign-in link copied.")}>
                Copy
              </button>
              <a className="btn btn-sm btn-ghost" href={mail}>
                Email it to myself
              </a>
            </>
          }
        />
      </div>
      {me.admin && (
        <section className="tp-card">
          <h3 className="tp-card-h">
            Review reported facts <span className="mono tp-cnt">{view.reported.length}</span>
          </h3>
          {view.reported.length === 0 && <p className="tp-small muted">Nothing to review.</p>}
          {view.reported.map((r) => (
            <div key={`${r.id}.${r.field}`} className="tp-review-row">
              <span className="tp-review-what">
                <strong>{r.record}</strong> <span className="muted">{r.label}</span>
                <span className="tp-small muted tp-review-who">
                  Added by {r.addedBy}
                  {r.reporters.length > 0 && ` · reported by ${r.reporters.join(", ")}`}
                  {r.reportedAt && ` · ${timeAgo(r.reportedAt)}`}
                </span>
              </span>
              <span className="mono tp-review-v">{r.value}</span>
              <span className="tp-review-acts">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openCompany(r.companyId)}>
                  Open record
                </button>
                <button type="button" className="btn btn-sm" onClick={() => ui.act({ type: "review", entity: r.entity, id: r.id, field: r.field, decision: "keep" })}>
                  Keep
                </button>
                <button type="button" className="btn btn-sm tp-btn-red" onClick={() => ui.act({ type: "review", entity: r.entity, id: r.id, field: r.field, decision: "remove" })}>
                  Remove
                </button>
              </span>
            </div>
          ))}
        </section>
      )}
      <section className="tp-card tp-ledger">
        <h3 className="tp-card-h">
          History <span className="mono tp-cnt">{view.ledger.length}</span>
        </h3>
        {view.ledger.length === 0 ? (
          <p className="tp-small muted">No activity yet. Unlock a fact or add one you know.</p>
        ) : (
          <div className="tp-ledger-scroll">
            <table className="tp-ltable">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col" className="num">
                    Credits
                  </th>
                  <th scope="col">What</th>
                  <th scope="col">Company</th>
                </tr>
              </thead>
              <tbody>
                {view.ledger.map((l, k) => (
                  <tr key={k}>
                    <td className="mono muted">
                      {new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className={`num mono tp-lrow-d${l.delta > 0 ? " up" : l.delta < 0 ? " down" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta < 0 ? `−${-l.delta}` : "0"}</td>
                    <td>
                      {ledgerWhat(l)}
                      {l.company && <span className="tp-ledger-co muted">{ledgerWhere(l)}</span>}
                      {l.delta === 0 && l.reason === "fill" ? <span className="muted"> (daily max reached)</span> : null}
                    </td>
                    <td>{l.company}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
