"use client";

/**
 * "Your credits": the balance, how credits work (the one place the rules are written out),
 * the invite link, the personal sign-in link, the weekly email switch, the admin review
 * queue, and the history, set out like a bank statement with a running balance.
 *
 * On phones a returning member comes for the history, so it follows the balance, and the
 * rules fold into one closed "How credits work".
 */
import { useEffect, useRef, useState } from "react";
import type { LedgerRow, View } from "@/lib/tableTypes";
import { COMPANY_PRICE, EARN_CAP, FREE_EARN_RULE, PRO_OPENS_DAILY, REFERRAL_BONUS, REFERRAL_LIMIT, fieldDef } from "@/lib/tableFields";
import { IconChevron, Num, timeAgo, useToast } from "../ui/shared";
import { atTime, copyText, plural } from "./hooks";
import { ledgerLine, owedLine, unlockLimitLine } from "./ledger";
import { freeCompanyNow, freeTodayWords } from "./display";
import { CRYSTAL_FREE_TODAY, FEATURE_NAME } from "@/lib/radar/types";
import { Pro, useUi } from "./ui";
import { CloseAccount, DataLink, NotificationsCard, SignInActions } from "./Settings";
import { ReportedMessages } from "./Messages";
import { ConnectedApps } from "./ConnectedApps";
import "./pages.css";
import { Prop, Spot } from "../ui/fractions/lazy";
import { PageHead, Stat } from "../ui/system";

export const inviteLink = (code: string) => `${window.location.origin}/?ref=${code}`;
export const signInLink = (token: string) => `${window.location.origin}/?k=${token}`;

export function useCopy() {
  const toast = useToast();
  return async (text: string, done: string) => {
    const ok = await copyText(text);
    toast(ok ? done : "That didn't copy. Select the link and copy it yourself.", !ok);
  };
}

/** What a shared invite says, before the link. */
export const INVITE_TEXT = `Join me on Merlin. We both get ${REFERRAL_BONUS} credits when you add your first fact to a company or a seat.`;
/** The phone's share sheet exists (phones and some tablets). Copying is the fallback everywhere else. */
export const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * Invite on a phone: the share sheet with a line and the link, so it goes straight into
 * Messages, WhatsApp or LinkedIn. Without one, or if sharing fails, the link is copied.
 */
export function useShareInvite() {
  const copy = useCopy();
  return async (link: string) => {
    if (canShare()) {
      try {
        await navigator.share({ title: "Merlin", text: INVITE_TEXT, url: link });
        return;
      } catch (e) {
        // Closing the sheet is a choice, not a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(link, `Invite link copied. You both get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat.`);
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

function History({ ledger, credits, owed, starter, earnCap, first }: { ledger: LedgerRow[]; credits: number; owed: number; starter: number; earnCap: number; first: number }) {
  const [all, setAll] = useState(false);
  // The ledger is newest first, so the balance after each line is worked back from today's (below 0 while credits are owed).
  let bal = credits - owed;
  const rows = ledger.map((l) => {
    const after = bal;
    bal -= l.delta;
    return { l, after };
  });
  const opening = bal;
  const shown = all ? rows : rows.slice(0, first);
  const hiddenN = rows.length - shown.length;
  return (
    <section className="tp-card tp-ledger" aria-labelledby="cr-history">
      <h2 className="tp-card-h" id="cr-history">
        History
      </h2>
      {ledger.length === 0 && <p className="cr-note">Each fact you unlock or add shows up here, under your starting credits.</p>}
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
            {shown.map(({ l, after }, k) => {
              const s = ledgerLine(l, earnCap);
              const newDay = k === 0 || dayKey(shown[k - 1].l.at) !== dayKey(l.at);
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
                  <td className="num cr-bal">{after < 0 ? `−${-after}` : after}</td>
                </tr>,
              ];
            })}
            {(all || hiddenN === 0) && (
              <tr className="cr-open">
                <td className="cr-time" />
                <td className="cr-what">{opening === starter ? "Starting credits" : "Balance before this"}</td>
                <td className="num cr-amt up">{opening === starter ? `+${opening}` : ""}</td>
                <td className="num cr-bal">{opening}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > first && (
        <button type="button" className="tp-tbtn tp-tbtn-strong cr-more" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? `Show the latest ${first}` : `Show all ${rows.length} lines`}
        </button>
      )}
    </section>
  );
}

/* ---------- admin review ---------- */

function ReviewRow({ r }: { r: View["reported"][number] }) {
  const ui = useUi();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    // Into the question on the safe answer, and back to Remove it when it closes.
    if (asking) noRef.current?.focus();
    else if (wasAsking.current) removeRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const kind = fieldDef(r.entity, r.field)?.kind;
  // The server says whether it is hidden from everyone (a seat holder's one report is, two reports on a listed posting are not).
  const hidden = r.hidden ?? r.reporters.length >= 2;
  const decide = async (decision: "keep" | "remove") => {
    if (busy) return;
    setBusy(true);
    const res = await ui.act({ type: "review", entity: r.entity, id: r.id, field: r.field, decision });
    if (!res.ok) setBusy(false);
  };
  return (
    <div className="tp-review-row">
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
      {asking ? (
        <div
          className="tp-review-acts cr-review-ask"
          role="group"
          aria-label={`Remove ${r.label.toLowerCase()} at ${r.record}?`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAsking(false);
            }
          }}
        >
          <span className="cr-review-q">Remove this fact? Whoever unlocked it gets the credit back.</span>
          <button type="button" className="btn btn-sm tp-btn-red" disabled={busy} onClick={() => void decide("remove")}>
            Remove it
          </button>
          <button ref={noRef} type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="tp-review-acts">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openCompany(r.companyId)}>
            Open the company
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void decide("keep")}>
            Keep it
          </button>
          <button ref={removeRef} type="button" className="btn btn-sm tp-btn-red" disabled={busy} onClick={() => setAsking(true)}>
            Remove it
          </button>
        </div>
      )}
    </div>
  );
}

function Review({ view }: { view: View }) {
  return (
    <section className="tp-card cr-review" aria-labelledby="cr-review">
      <h2 className="tp-card-h" id="cr-review">
        Reported facts to review
        {view.reported.length > 0 && <span className="chip cr-count num">{view.reported.length}</span>}
      </h2>
      {view.reported.length === 0 ? (
        <p className="cr-note">Nothing to review. A fact lands here when a member reports it, or when a seat holder says a seat isn&apos;t theirs.</p>
      ) : (
        <p className="cr-note">
          Two reports hide a fact from every member until you decide, and a seat holder&apos;s report on their own seat hides it at once. A posting that is still listed stays up for others.
          Keep it and it shows again. Remove it and whoever unlocked it gets the credit back.
        </p>
      )}
      {view.reported.map((r) => (
        <ReviewRow key={`${r.id}.${r.field}`} r={r} />
      ))}
    </section>
  );
}

/* ---------- the page ---------- */

export function MyCredits({ view, refresh, onUseInClaude, onNotifications }: { view: View; refresh?: () => Promise<void>; onUseInClaude?: () => void; onNotifications?: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const phone = ui.layout === "phone";
  const copy = useCopy();
  const shareInvite = useShareInvite();
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const invite = inviteLink(me.inviteCode);
  const signin = signInLink(me.token);
  const mail = `mailto:${encodeURIComponent(me.email)}?subject=${encodeURIComponent("My Merlin sign-in link")}&body=${encodeURIComponent(
    `Open this link to sign in to Merlin on any device. Keep it to yourself.\n\n${signin}`,
  )}`;
  const starter = view.stats.starter;
  const paid = me.invitesPaid ?? 0;
  const owed = me.owed ?? 0;
  const owes = owedLine(owed);
  const unlocks = unlockLimitLine(me, view.ledger);
  const share = phone && canShare();
  const rules: [string, "plus" | "minus" | "flat", string][] = [
    [String(starter), "flat", `You start with ${starter} credits.`],
    ["+1", "plus", "You add a fact that's missing. Every answer on a seat you held earns 1, and so do company facts like the HQ or size, or a hiring contact."],
    ["−1", "minus", "You unlock a fact, like a person's name and title, or their email, phone or LinkedIn. It stays unlocked for you from then on."],
    [
      `−${COMPANY_PRICE}`,
      "minus",
      `You unlock a company: its name and website, with the job posting of each open role there. ${
        // Free (billing live): the free one a day is Crystal Ball's, with everything on it. Trial and Pro: any company free, up to PRO_OPENS_DAILY a day, and Crystal Ball's on top.
        me.crystal === "one" || me.crystal === "used"
          ? `On Free, one ${FEATURE_NAME} company a day opens free, with everything on it. On Pro, companies open free, up to ${PRO_OPENS_DAILY} a day plus all of ${FEATURE_NAME}.`
          : me.proOpens
            ? `On your plan, companies open free, up to ${PRO_OPENS_DAILY} a day plus every company in your ${FEATURE_NAME}. Past ${PRO_OPENS_DAILY}, a company is ${COMPANY_PRICE} credits until tomorrow.`
            : `Your first company each day is free.${me.crystal === "all" ? ` Every company in your ${FEATURE_NAME} opens free.` : ""}`
      }`,
    ],
    ["0", "flat", "Fellow fractionals are free: who held a seat and the role they held show once you can see the company, and the Fractionals directory never costs a credit."],
    ["+1", "plus", "Two other members confirm a fact you added."],
    [`+${REFERRAL_BONUS}`, "plus", `Someone you invited adds their first fact to a company already on Merlin. They get ${REFERRAL_BONUS} too.`],
  ];

  const tiles = (
    <div className="stats cr-stats">
      <div className="cr-stat cr-balance">
        <Stat n={<span className={me.credits <= 3 ? "cr-low" : undefined}>{me.credits}</span>} label={me.credits === 1 ? "Credit to spend" : "Credits to spend"} />
        {me.credits <= 3 && !owed && <div className="cr-stat-sub">{capped ? `You can earn again ${atTime(me.earnResetsAt)}.` : "Add a fact you know and you earn one."}</div>}
        {freeCompanyNow(me) && <div className="cr-stat-sub">Plus {freeTodayWords(me)}: {me.proOpens ? "they open for no credits" : "unlock one company for no credits"}.</div>}
        {me.crystal === "one" && <div className="cr-stat-sub">Plus {CRYSTAL_FREE_TODAY}: open one company there with everything on it.</div>}
        {!!me.pending && <div className="cr-stat-sub">+{me.pending} when confirmed: facts on a seat of yours at a company new to Merlin.</div>}
      </div>
      <div className="cr-stat">
        <Stat
          n={
            <>
              {me.earned24h}
              <span className="tp-stat-of"> of {me.earnCap}</span>
            </>
          }
          label="Earned today"
        />
        <div className="cr-bar" role="img" aria-label={`${me.earned24h} of ${me.earnCap} credits earned today`}>
          <span style={{ width: `${Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
        </div>
        {capped && <div className="cr-stat-sub">That is the daily limit. You can earn again {atTime(me.earnResetsAt)}.</div>}
        {me.held > 0 && (
          <div className="cr-stat-sub">
            {plural(me.held, "bonus credit is", "bonus credits are")} waiting. You get {me.held === 1 ? "it" : "them"} once you&apos;re under today&apos;s {me.earnCap}.
          </div>
        )}
      </div>
      <Stat n={me.added} label={me.added === 1 ? "Fact you added" : "Facts you added"} />
      <Stat n={me.unlocked} label={me.unlocked === 1 ? "Fact you unlocked" : "Facts you unlocked"} />
    </div>
  );

  // What limits the balance right now: credits owed, or the day's unlocks running out first.
  const limits = (owes || unlocks) && (
    <div className="cr-limits" role="status">
      {owes && <p>{owes}</p>}
      {unlocks && <p>{unlocks}</p>}
    </div>
  );

  const ruleBody = (
    <>
      <dl className="cr-rules">
        {rules.map(([n, tone, text], k) => (
          <div key={k}>
            <dt className={`num ${tone}`}>{n}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <div className="cr-limit">
        <h3 className="cr-limit-h">The daily limits</h3>
        <p>
          You can earn up to {me.earnCap} credits in any 24 hours, bonuses included. A bonus that would take you past {me.earnCap} is held and paid as soon as you have room. What you add past
          the limit still saves.
        </p>
        <p>Only 5 answers a day about a company&apos;s industry, size, revenue or how they sell earn a credit. You can unlock up to 100 facts a day, or 25 on your first day.</p>
        {/* Free earns like every plan, for good (lib/tableFields.ts FREE_EARN_RULE), stated while billing is live. */}
        {me.plan && <p data-free-earn>{FREE_EARN_RULE}</p>}
      </div>
    </>
  );
  const rulesCard = phone ? (
    <details className="tp-card cr-rulescard cr-rules-fold">
      <summary className="cr-rules-sum">
        <span className="tp-card-h">How credits work</span>
        <IconChevron dir="down" />
      </summary>
      {ruleBody}
    </details>
  ) : (
    <section className="tp-card cr-rulescard" aria-labelledby="cr-rules">
      <h2 className="tp-card-h" id="cr-rules">
        How credits work
      </h2>
      {ruleBody}
    </section>
  );

  const inviteCard = (
    <LinkCard
      title="Invite a fractional"
      note={`Send this link to a fractional you'd vouch for. You both get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat. Up to ${REFERRAL_LIMIT} invite bonuses every 30 days. Bonuses count toward the ${EARN_CAP} you can earn a day and wait if you are over. Someone who joins from your own network (the same internet connection) earns no bonus.${
        me.invited ? ` ${plural(me.invited, "person has", "people have")} joined from your link so far${paid ? `, and ${paid} of them added a first fact` : ""}.` : ""
      }`}
      link={invite}
      actions={
        share ? (
          <>
            <button type="button" className="btn btn-pine btn-sm" onClick={() => void shareInvite(invite)}>
              Share invite link
            </button>
            <button type="button" className="btn btn-sm" onClick={() => copy(invite, "Invite link copied.")}>
              Copy link
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-pine btn-sm" onClick={() => copy(invite, "Invite link copied.")}>
            Copy invite link
          </button>
        )
      }
    />
  );
  const signinCard = (
    <LinkCard
      title="Your sign-in link"
      note="Open it on another device to sign in there. Anyone who has this link can sign in as you, so keep it to yourself."
      link={signin}
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => copy(signin, "Sign-in link copied. Keep it to yourself.")}>
            Copy link
          </button>
          {!view.email && (
            <a className="btn btn-sm btn-ghost" href={mail}>
              Email it to myself
            </a>
          )}
          <SignInActions emailOn={view.email} refresh={refresh} />
        </>
      }
    />
  );
  const history = <History ledger={view.ledger} credits={me.credits} owed={owed} starter={starter} earnCap={me.earnCap} first={phone ? 5 : 25} />;
  const review = me.admin && (
    <>
      <Review view={view} />
      <ReportedMessages list={view.reportedMessages ?? []} refresh={refresh} />
    </>
  );

  return (
    <div className="page-narrow cr-page">
      {/* The balance as coins seen edge on; at zero, the empty stack with one coin to earn. Drawn calm: a low balance is already ember. */}
      <PageHead title="Your credits" art={me.credits <= 0 ? <Spot name="noCredits" size={72} on="bg" /> : <Prop name="coinStack" height={72} on="bg" />} />
      {tiles}
      {limits}
      {phone ? (
        <>
          {review}
          {history}
          {inviteCard}
          {rulesCard}
          {signinCard}
          <NotificationsCard onOpen={onNotifications} />
          <ConnectedApps onHowTo={onUseInClaude} />
          <DataLink />
          <CloseAccount />
        </>
      ) : (
        <>
          {rulesCard}
          <div className="tp-linkcards">
            {inviteCard}
            {signinCard}
          </div>
          <NotificationsCard onOpen={onNotifications} />
          <ConnectedApps onHowTo={onUseInClaude} />
          <DataLink />
          {review}
          {history}
          <CloseAccount />
        </>
      )}
      <Pro where="my_credits" />
    </div>
  );
}
