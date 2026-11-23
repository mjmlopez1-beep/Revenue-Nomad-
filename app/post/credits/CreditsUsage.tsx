"use client";

/**
 * Credits and usage (Credits.dc.html), the new look's page for ?p=credits and ?p=billing, in four
 * tabs. The old look keeps Your credits (Credits.tsx) and Plan and billing (Billing.tsx).
 *
 *   Overview      the balance, earned today of the cap, free company opens today, the plan and
 *                 its end, credits in three lines; earned and spent by week or day, and by kind
 *                 (the ledger's reasons grouped: creditsModel.ts kindOf, "Other" for any reason it
 *                 doesn't know, Workflows for a line a workflow spent); Merlin's drafting
 *                 allowance (PlanView.ai); the latest lines, the quickest ways to earn, the plan.
 *   Ledger        every line with the running balance and where it happened, by tone and searched
 *                 in place. Nothing here exports or downloads: members cannot export data.
 *   Ways to earn  each way with its credit and where the member stands, the invite link, the
 *                 25-a-day cap, and every rule (How credits work).
 *   Plans         the plan now with its button, the plans side by side (Billing.tsx PlanCards:
 *                 checkout, or a move between Pro and Close), pause, cancel, the top-up, the AI
 *                 pack and Stripe's portal (PlanManageCards), Free, Pro and Close row by row. Only
 *                 while billing is live.
 *
 * The admin's review queue stays at the foot of Overview, for admins only. The sign-in link,
 * notifications, connected apps, your data and closing the account are Settings' (one line says so).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { View } from "@/lib/tableTypes";
import {
  EARN_CAP,
  FREE_EARN_RULE,
  OPENS_RULE,
  COMPANY_PRICE,
  PRO_OPENS_DAILY,
  REFERRAL_BONUS,
} from "@/lib/tableFields";
import { CRYSTAL_FREE_TODAY, FEATURE_NAME } from "@/lib/radar/types";
import { IconSearch, Num } from "../../ui/shared";
import { atTime, plural } from "../hooks";
import { ledgerLine, owedLine, unlockLimitLine } from "../ledger";
import { freeCompanyNow, freeTodayWords } from "../display";
import { useUi } from "../ui";
import {
  Review,
  canShare,
  inviteLink,
  useCopy,
  useShareInvite,
} from "../Credits";
import { ReportedMessages } from "../Messages";
import {
  AiPackLine,
  CompareTable,
  PlanCards,
  PlanManageCards,
  PlanStatusCard,
  TopupLine,
  VALUE_LINE,
  buyTopup,
  planDay,
  useStripeReturn,
} from "../Billing";
import { useApp, stripGone } from "../shell/pages";
import { CREDITS_TAB_EVENT, takeCreditsStart, takeLanding } from "../pageStart";
import { PageStrip } from "../shell/PageStrip";
import { planName } from "@/lib/billing/rules";
import {
  CAP_LINE,
  CREDIT_TABS,
  CREDIT_TAB_LABEL,
  buckets,
  byKind,
  creditTabOf,
  deltaWords,
  filterLedger,
  threeLines,
  toneOf,
  totals,
  waysToEarn,
  withBalance,
  type CreditTab,
  type LedgerFilter,
  type Line,
  type Way,
} from "./creditsModel";
import "./credits.css";

const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return `Today · ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString())
    return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

/* ---------- the ledger table (Overview's latest lines, and the Ledger tab) ---------- */

function LedgerTable({
  rows,
  opening,
  starter,
  showOpening,
  openCo,
}: {
  rows: { l: Line; after: number; text: string; note?: string }[];
  opening: number;
  starter: number;
  showOpening: boolean;
  openCo: (name: string) => (() => void) | null;
}) {
  return (
    <div className="cnu-scroll">
      <table className="cnu-ledger" aria-label="Credit ledger">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">What happened</th>
            <th scope="col" className="num">
              Credits
            </th>
            <th scope="col" className="num">
              Balance
            </th>
            <th scope="col">Where</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ l, after, text, note }, k) => {
            const newDay = k === 0 || dayKey(rows[k - 1].l.at) !== dayKey(l.at);
            const tone = toneOf(l);
            const go = l.company ? openCo(l.company) : null;
            return [
              newDay && (
                <tr key={`d${k}`} className="cnu-day">
                  <th colSpan={5} scope="colgroup">
                    {dayLabel(l.at)}
                  </th>
                </tr>
              ),
              <tr key={k} data-tone={tone}>
                <td className="cnu-when">
                  <Num>{time(l.at)}</Num>
                </td>
                <td className="cnu-what">
                  <span className="cnu-what-t">{text}</span>
                  {note && <span className="cnu-what-n">{note}</span>}
                </td>
                <td className="num cnu-amt">
                  <span className={`cnu-delta cnu-delta-${tone}`}>
                    {deltaWords(l)}
                  </span>
                </td>
                <td className="num cnu-bal">
                  {after < 0 ? `−${-after}` : after}
                </td>
                <td className="cnu-where">
                  {go ? (
                    <button type="button" className="cnu-link" onClick={go}>
                      {l.company}
                    </button>
                  ) : null}
                </td>
              </tr>,
            ];
          })}
          {showOpening && (
            <tr className="cnu-open">
              <td className="cnu-when" />
              <td className="cnu-what">
                <span className="cnu-what-t">
                  {opening === starter
                    ? "Starting credits"
                    : "Balance before this"}
                </span>
                {opening === starter && (
                  <span className="cnu-what-n">
                    Yours from the moment you joined
                  </span>
                )}
              </td>
              <td className="num cnu-amt">
                {opening === starter ? (
                  <span className="cnu-delta cnu-delta-earned">+{opening}</span>
                ) : (
                  ""
                )}
              </td>
              <td className="num cnu-bal">{opening}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the page ---------- */

export function CreditsUsage({ page }: { page: "credits" | "billing" }) {
  const c = useApp();
  const ui = useUi();
  const me = ui.me;
  const view: View = c.view;
  const plan = me.plan;
  const phone = ui.layout === "phone";
  const copy = useCopy();
  const shareInvite = useShareInvite();
  const [tab, setTab0] = useState<CreditTab>(() => {
    // A tab another page asked for (What's new's Invite line: Ways to earn), else the address's.
    const asked = takeCreditsStart();
    return creditTabOf(
      page,
      asked
        ? `?tab=${asked}`
        : typeof window === "undefined"
          ? ""
          : takeLanding(page) || window.location.search,
      !!plan,
    );
  });
  const [by, setBy] = useState<"week" | "day">("week");
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [topupSaid, setTopupSaid] = useState<string | null>(null);
  useStripeReturn(plan, c.refresh);
  const setTab = (t: CreditTab) => {
    setTab0(t);
    setAll(false);
    // The panel's top, so a tab picked from a button lower down opens where it reads.
    if (typeof document !== "undefined")
      document.getElementById("cnu-tabs")?.scrollIntoView({ block: "nearest" });
  };
  // Asked for a tab while the page is already open (What's new's Invite line): that tab.
  useEffect(() => {
    const on = () => {
      const t = takeCreditsStart();
      if (t) setTab(creditTabOf(page, `?tab=${t}`, !!plan));
    };
    window.addEventListener(CREDITS_TAB_EVENT, on);
    return () => window.removeEventListener(CREDITS_TAB_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, !!plan]);

  const starter = view.stats.starter;
  const owed = me.owed ?? 0;
  const ledger = view.ledger as Line[];
  const bal = useMemo(
    () => withBalance(ledger, me.credits, owed),
    [ledger, me.credits, owed],
  );
  const lines = useMemo(
    () => bal.rows.map((r) => ({ ...r, ...ledgerLine(r.l, me.earnCap) })),
    [bal, me.earnCap],
  );
  const kinds = useMemo(() => byKind(ledger), [ledger]);
  const sums = useMemo(() => totals(ledger), [ledger]);
  const bars = useMemo(
    () => buckets(ledger, me.credits, owed, Date.now(), by),
    [ledger, me.credits, owed, by],
  );
  const first = ledger.length === 0;
  const seatsNoRate = c.shell.seats.filter((s) =>
    s.missing.includes("rate"),
  ).length;
  const ways = waysToEarn(me, { seatsNoRate, seats: c.shell.seats.length });
  const tabs = CREDIT_TABS.filter((t) => t !== "plans" || !!plan);
  const owes = owedLine(owed);
  const unlocks = unlockLimitLine(me, view.ledger);
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;

  // A company in a line opens when the member can see it by that name (never a locked one).
  const coByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of c.infos)
      if (!i.c.hidden && i.c.name) m.set(i.c.name.toLowerCase(), i.c.id);
    return m;
  }, [c.infos]);
  const openCo = (name: string) => {
    const id = coByName.get(name.toLowerCase());
    return id ? () => c.openCompany(id) : null;
  };

  /* ----- the four tiles ----- */
  const used = me.proOpens ? me.proOpens.of - me.proOpens.left : 0;
  const tiles = (
    <section className="cnu-tiles" aria-label="Today">
      <div className="cnu-tile cnu-tile-bal">
        <span className="cnu-k">Credits to spend</span>
        <strong className={`cnu-big${me.credits <= 3 ? " cnu-low" : ""}`}>
          <Num>{me.credits}</Num>
        </strong>
        <span className="cnu-s">
          {owed
            ? owes
            : first
              ? "Your starting credits. They do not expire."
              : me.pending
                ? `Plus ${me.pending} when a seat of yours is confirmed.`
                : me.credits <= 3
                  ? capped
                    ? `You can earn again ${atTime(me.earnResetsAt)}.`
                    : "Add a fact you know and you earn one."
                  : "They do not expire."}
        </span>
        <button
          type="button"
          className="btn btn-sm cnu-tile-go"
          onClick={() => setTab("earn")}
        >
          Ways to earn more
        </button>
      </div>
      <div className="cnu-tile">
        <span className="cnu-k">Earned today</span>
        <span className="cnu-of">
          <strong>
            <Num>{me.earned24h}</Num>
          </strong>
          <span>of {me.earnCap} credits</span>
        </span>
        <span
          className="cnu-bar"
          role="img"
          aria-label={`${me.earned24h} of ${me.earnCap} credits earned today`}
        >
          <span
            style={{
              width: `${Math.min(100, (me.earned24h / Math.max(1, me.earnCap)) * 100)}%`,
            }}
          />
        </span>
        <span className="cnu-s">
          {capped
            ? `That is the daily limit. You can earn again ${atTime(me.earnResetsAt)}. What you add still saves.`
            : me.earned24h
              ? `Room for ${me.earnCap - me.earned24h} more today. What you add past ${me.earnCap} still saves.`
              : "Nothing yet. Each fact Merlin does not have earns 1."}
          {me.held > 0 &&
            ` ${plural(me.held, "bonus credit is", "bonus credits are")} waiting for room.`}
        </span>
      </div>
      <div className="cnu-tile">
        {me.proOpens ? (
          <>
            <span className="cnu-k">Free company opens today</span>
            <span className="cnu-of">
              <strong>
                <Num>{used}</Num>
              </strong>
              <span>of {me.proOpens.of} used</span>
            </span>
            <span
              className="cnu-pips"
              role="img"
              aria-label={`${used} of ${me.proOpens.of} free company opens used today`}
            >
              {Array.from({ length: me.proOpens.of }, (_, k) => (
                <span key={k} className={k < used ? "on" : undefined} />
              ))}
            </span>
            <span className="cnu-s">
              {plan?.name === "trial"
                ? "Free on your trial."
                : "Free on your plan."}{" "}
              {FEATURE_NAME} companies do not count. Past {PRO_OPENS_DAILY}, a
              company is {COMPANY_PRICE} credits until tomorrow.
            </span>
          </>
        ) : me.crystal ? (
          <>
            <span className="cnu-k">Free company today</span>
            <span className="cnu-of">
              <strong>{me.crystal === "used" ? "Used" : "1"}</strong>
              <span>
                {me.crystal === "used" ? "today" : `in ${FEATURE_NAME}`}
              </span>
            </span>
            <span className="cnu-s">
              {me.crystal === "used"
                ? `Your ${FEATURE_NAME} company of the day is open. Another opens free tomorrow.`
                : `${CRYSTAL_FREE_TODAY}: one company there opens with everything on it.`}{" "}
              Others are {COMPANY_PRICE} credits.
            </span>
          </>
        ) : (
          <>
            <span className="cnu-k">Free company today</span>
            <span className="cnu-of">
              <strong>{freeCompanyNow(me) ? "1" : "0"}</strong>
              <span>left</span>
            </span>
            <span className="cnu-s">
              {freeCompanyNow(me)
                ? `${freeTodayWords(me)}: unlock one company for no credits.`
                : `Your free company of the day is used. Others are ${COMPANY_PRICE} credits.`}
            </span>
          </>
        )}
      </div>
      {plan && (
        <div className="cnu-tile">
          <span className="cnu-k">
            Your plan:{" "}
            {plan.name === "trial"
              ? planName(plan)
              : plan.name === "pro"
                ? planName(plan)
                : plan.pause === "now"
                  ? "Paused"
                  : "Free"}
          </span>
          {plan.name === "trial" ? (
            <>
              <span className="cnu-of">
                <strong>
                  <Num>{plan.trialDaysLeft}</Num>
                </strong>
                <span>
                  {plan.trialDaysLeft === 1 ? "day left" : "days left"}
                </span>
              </span>
              <span className="cnu-s">
                Ends {planDay(plan.trialEndsAt)}. No card is asked. After that
                you are on Free, unless you choose a plan.
              </span>
            </>
          ) : plan.name === "pro" ? (
            <span className="cnu-s">
              {plan.cancelAt
                ? `Cancelled. Yours until ${planDay(plan.proUntil)}.`
                : plan.proStartsAt
                  ? `Starts ${planDay(plan.proStartsAt)}.`
                  : plan.pause === "booked"
                    ? `Paused from ${planDay(plan.pausedFrom)}.`
                    : `Renews ${planDay(plan.proUntil)}, with ${plan.prices.proCredits} credits.`}
            </span>
          ) : (
            <span className="cnu-s">
              {plan.pause === "now"
                ? `On Free until ${planDay(plan.pausedUntil)}, then your plan comes back.`
                : `You keep earning up to ${me.earnCap} credits a day, for as long as you are a member.`}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm cnu-tile-go"
            onClick={() => setTab("plans")}
          >
            See the plans
          </button>
        </div>
      )}
    </section>
  );

  /* ----- Overview ----- */
  const maxBar = Math.max(1, ...bars.map((b) => Math.max(b.earned, b.spent)));
  const chart = (
    <section className="cnu-card" aria-labelledby="cnu-ch">
      <div className="cnu-head">
        <h2 id="cnu-ch">Earned and spent</h2>
        <span className="cnu-sub">
          {first
            ? `You start at ${starter}`
            : `Earned ${sums.earned.toLocaleString("en-US")}, spent ${sums.spent.toLocaleString("en-US")} in ${plural(ledger.length, "line")}`}
        </span>
        <span className="cnu-sp" />
        <span className="cnu-legend">
          <span className="cnu-key cnu-key-e" aria-hidden /> Earned
        </span>
        <span className="cnu-legend">
          <span className="cnu-key cnu-key-s" aria-hidden /> Spent
        </span>
        {!first && (
          <span className="cnu-seg" role="group" aria-label="Group the chart">
            {(["week", "day"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={by === k}
                className={by === k ? "on" : undefined}
                onClick={() => setBy(k)}
              >
                {k === "week" ? "By week" : "By day"}
              </button>
            ))}
          </span>
        )}
      </div>
      <div
        className="cnu-bars"
        role="img"
        aria-label={bars
          .map(
            (b) =>
              `${b.label}: earned ${b.earned}, spent ${b.spent}, balance ${b.bal}`,
          )
          .join(". ")}
      >
        {bars.map((b) => (
          <div key={b.from} className="cnu-col">
            <div className="cnu-pair" aria-hidden>
              <span className="cnu-b">
                <span className="cnu-bt">
                  {b.earned ? `+${b.earned}` : "0"}
                </span>
                <span
                  className="cnu-be"
                  style={{
                    height: `${Math.max(2, Math.round((b.earned / maxBar) * 96))}px`,
                  }}
                />
              </span>
              <span className="cnu-b">
                <span className="cnu-bt">{b.spent ? `−${b.spent}` : "0"}</span>
                <span
                  className="cnu-bs"
                  style={{
                    height: `${Math.max(2, Math.round((b.spent / maxBar) * 96))}px`,
                  }}
                />
              </span>
            </div>
            <span className="cnu-bl">{b.label}</span>
            <span className="cnu-bb">Balance {b.bal}</span>
          </div>
        ))}
      </div>
      <p className="cnu-note">
        {first
          ? "Nothing earned or spent yet. Each week fills in as you go."
          : `Counted from your ledger, ${sums.free ? `with ${plural(sums.free, "line")} that cost nothing (companies opened free).` : "line by line."}`}
      </p>
    </section>
  );
  const maxKind = Math.max(1, ...kinds.map((k) => k.earned + k.spent));
  const usage = (
    <section className="cnu-card" aria-labelledby="cnu-us">
      <div className="cnu-head">
        <h2 id="cnu-us">{first ? "What things cost" : "By kind"}</h2>
        <span className="cnu-sub">
          {first
            ? "You always see the cost before you spend"
            : "Every line in your ledger, grouped by what earned or spent it"}
        </span>
      </div>
      {first ? (
        <ul className="cnu-kinds">
          <li>
            <span className="cnu-kind-t">
              <strong>Company opens</strong>
              <span className="cnu-kind-c">
                {me.proOpens
                  ? `Free, up to ${PRO_OPENS_DAILY} a day`
                  : `${COMPANY_PRICE} credits`}
              </span>
            </span>
            <span className="cnu-kind-s">
              Its name, website and the job posting of each open role.
            </span>
          </li>
          <li>
            <span className="cnu-kind-t">
              <strong>Facts</strong>
              <span className="cnu-kind-c">1 credit</span>
            </span>
            <span className="cnu-kind-s">
              A name and title, an email, a rate, an ended seat&apos;s end date.
              Yours for good.
            </span>
          </li>
          <li>
            <span className="cnu-kind-t">
              <strong>Fellow fractionals</strong>
              <span className="cnu-kind-c">Free</span>
            </span>
            <span className="cnu-kind-s">
              Who held a seat and their role show once you can see the company.
            </span>
          </li>
        </ul>
      ) : (
        <ul className="cnu-kinds">
          {kinds.map((k) => (
            <li key={k.kind} data-kind={k.kind}>
              <span className="cnu-kind-t">
                <strong>{k.label}</strong>
                <span className="cnu-kind-c">
                  {k.earned ? (
                    <span className="cnu-delta cnu-delta-earned">
                      +{k.earned}
                    </span>
                  ) : null}
                  {k.spent ? (
                    <span className="cnu-delta cnu-delta-spent">
                      −{k.spent}
                    </span>
                  ) : null}
                  {!k.earned && !k.spent ? (
                    <span className="cnu-delta cnu-delta-free">Free</span>
                  ) : null}
                </span>
              </span>
              <span className="cnu-kbar" aria-hidden>
                <span
                  style={{
                    width: `${Math.round(((k.earned + k.spent) / maxKind) * 100)}%`,
                  }}
                />
              </span>
              <span className="cnu-kind-s">
                {plural(k.lines, "line")}
                {k.free ? `, ${k.free} free` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {plan?.ai && (
        <div className="cnu-ai">
          <span className="cnu-ai-t">
            <strong>Merlin drafting allowance.</strong>{" "}
            {plan.ai.trial
              ? `${plan.ai.percent}% of your trial allowance used.`
              : `${plan.ai.percent}% used${plan.ai.resetsOn ? `, resets ${new Date(`${plan.ai.resetsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}.`}
            {plan.ai.usedUp
              ? " It is used up: add a pack, or edit proposals by hand."
              : plan.ai.onPack
                ? " Your usage pack keeps you drafting."
                : ""}
          </span>
          <span
            className="cnu-bar"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={plan.ai.percent}
            aria-label="Merlin drafting allowance used"
          >
            <span style={{ width: `${plan.ai.percent}%` }} />
          </span>
          {plan.aiPack && <AiPackLine plan={plan} />}
        </div>
      )}
    </section>
  );

  /* ----- Ledger ----- */
  const shownLines = tab === "ledger" ? filterLedger(lines, filter, q) : lines;
  const limit = tab === "overview" ? 8 : all ? Infinity : 25;
  const cut = shownLines.slice(0, limit);
  const count = (f: LedgerFilter) =>
    f === "all" ? lines.length : lines.filter((r) => toneOf(r.l) === f).length;
  const ledgerCard = (
    <section className="cnu-card" aria-labelledby="cnu-lg">
      <div className="cnu-head">
        <h2 id="cnu-lg">Ledger</h2>
        <span className="cnu-sub">
          {first
            ? "Every credit in or out gets a line here"
            : `${plural(lines.length, "line")}, newest first, with your balance after each`}
        </span>
        <span className="cnu-sp" />
        {tab === "overview" && !first && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTab("ledger")}
          >
            Open the ledger
          </button>
        )}
        {tab === "ledger" && (
          <label className="cnu-search">
            <IconSearch size={14} />
            <input
              type="search"
              aria-label="Search the ledger"
              placeholder="A company, a fact, a kind"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={80}
            />
          </label>
        )}
      </div>
      {tab === "ledger" && !first && (
        <div
          className="cnu-seg cnu-filters"
          role="group"
          aria-label="Filter the ledger"
        >
          {(["all", "earned", "spent", "free"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={filter === f ? "on" : undefined}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All"
                : f === "earned"
                  ? "Earned"
                  : f === "spent"
                    ? "Spent"
                    : "Free"}{" "}
              <span className="num">{count(f)}</span>
            </button>
          ))}
        </div>
      )}
      <LedgerTable
        rows={cut}
        opening={bal.opening}
        starter={starter}
        showOpening={
          (tab === "ledger" &&
            filter === "all" &&
            !q.trim() &&
            cut.length === shownLines.length) ||
          first
        }
        openCo={openCo}
      />
      <div className="cnu-foot">
        <span className="cnu-sub">
          {q.trim()
            ? cut.length
              ? `${plural(shownLines.length, "line")} match "${q.trim()}".`
              : `No line matches "${q.trim()}". Try a company or a fact.`
            : tab === "overview"
              ? first
                ? "Each fact you unlock or add shows up here, under your starting credits."
                : `The latest ${Math.min(8, lines.length)} of ${lines.length}.`
              : filter !== "all" && !cut.length
                ? "No lines like that yet."
                : "Each line says what happened, the credits in or out, and your balance after it."}
        </span>
        {tab === "ledger" && shownLines.length > 25 && (
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={all}
            onClick={() => setAll((x) => !x)}
          >
            {all
              ? "Show only the latest 25"
              : `Show all ${shownLines.length} lines`}
          </button>
        )}
      </div>
    </section>
  );

  /* ----- Ways to earn ----- */
  const invite = inviteLink(me.inviteCode);
  const wayGo = (w: Way): (() => void) => {
    switch (w.id) {
      case "seatRates":
      case "seat":
      case "confirm":
        return () => c.openSeats();
      case "fact":
        return () => c.openAdd();
      case "rate":
        return () => c.openPage("rates");
      case "invite":
        return () =>
          void (canShare() && ui.layout === "phone"
            ? shareInvite(invite)
            : copy(
                invite,
                `Invite link copied. You both get ${REFERRAL_BONUS} credits when they add their first fact.`,
              ));
      case "lead":
        return () => c.openPage("fractionals");
      case "plan":
        return () => setTab("plans");
      case "topup":
        return () => void buyTopup().then((m) => setTopupSaid(m));
    }
  };
  const wayList = (list: Way[], ranked: boolean) => (
    <ul className="cnu-ways">
      {list.map((w, k) => (
        <li
          key={w.id}
          className={`cnu-way${ranked && k === 0 ? " cnu-way-hero" : ""}`}
          data-way={w.id}
        >
          {ranked && (
            <span className="cnu-rank" aria-hidden>
              {k + 1}
            </span>
          )}
          <span className="cnu-way-b">
            <span className="cnu-way-t">
              <strong>{w.title}</strong>
              <span className={`cnu-pill${w.earns ? " cnu-pill-earn" : ""}`}>
                {w.reward}
              </span>
            </span>
            <span className="cnu-way-s">{w.what}</span>
            {w.id === "invite" && tab === "earn" && (
              <input
                className="input mono cnu-invite"
                readOnly
                value={invite}
                aria-label="Your invite link"
                onFocus={(e) => e.currentTarget.select()}
              />
            )}
            <span className="cnu-way-f">
              <span className="cnu-way-st">
                {w.id === "topup" && topupSaid ? topupSaid : w.status}
              </span>
              <button
                type="button"
                className={`btn btn-sm${ranked && k === 0 ? " btn-pine" : ""}`}
                onClick={wayGo(w)}
              >
                {w.go}
              </button>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
  const waysCard = (overview: boolean) => (
    <section className="cnu-card" aria-labelledby="cnu-we">
      <div className="cnu-head">
        <h2 id="cnu-we">
          {overview && first ? "Three quickest ways to earn" : "Ways to earn"}
        </h2>
        <span className="cnu-sub">
          {overview
            ? "Ready now"
            : `Credits you earn never expire. Up to ${me.earnCap} a day.`}
        </span>
        <span className="cnu-sp" />
        {overview && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTab("earn")}
          >
            All {ways.length} ways
          </button>
        )}
      </div>
      {wayList(
        overview ? ways.filter((w) => w.earns).slice(0, 3) : ways,
        overview && first,
      )}
      {!overview && <p className="cnu-note cnu-cap">{CAP_LINE}</p>}
    </section>
  );
  const rules: [string, "plus" | "minus" | "flat", string][] = [
    [
      String(starter),
      "flat",
      `You start with ${starter} credits. They do not expire.`,
    ],
    [
      "+1",
      "plus",
      "You add a fact that is missing. Every answer on a seat you held earns 1, and so do company facts like the HQ or size, or a hiring contact.",
    ],
    [
      "−1",
      "minus",
      "You unlock a fact: a person's name and title, their email, phone or public profile link, a rate, or the end date of a seat that ended. It stays unlocked for you.",
    ],
    [
      `−${COMPANY_PRICE}`,
      "minus",
      `You unlock a company: its name and website, with the job posting of each open role there. ${
        me.crystal === "one" || me.crystal === "used"
          ? `On Free, one ${FEATURE_NAME} company a day opens free, with everything on it. ${OPENS_RULE}`
          : me.proOpens
            ? `${OPENS_RULE} Past ${PRO_OPENS_DAILY}, a company is ${COMPANY_PRICE} credits until tomorrow.`
            : `Your first company each day is free.${me.crystal === "all" ? ` Every company in your ${FEATURE_NAME} opens free.` : ""}`
      }`,
    ],
    [
      "0",
      "flat",
      "Fellow fractionals are free: who held a seat and the role they held show once you can see the company, and the Fractionals directory never costs a credit.",
    ],
    ["+1", "plus", "Two other members confirm a fact you added."],
    [
      `+${REFERRAL_BONUS}`,
      "plus",
      `Someone you invited adds their first fact to a company already on Merlin. They get ${REFERRAL_BONUS} too.`,
    ],
  ];
  const rulesCard = (
    <section className="cnu-card" aria-labelledby="cnu-ru">
      <div className="cnu-head">
        <h2 id="cnu-ru">How credits work</h2>
        <span className="cnu-sub">Every rule, in one place</span>
      </div>
      <dl className="cnu-rules">
        {rules.map(([n, tone, text], k) => (
          <div key={k}>
            <dt className={`num cnu-rn cnu-rn-${tone}`}>{n}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <div className="cnu-pad">
        <button
          type="button"
          className="tp-flink"
          aria-expanded={rulesOpen}
          onClick={() => setRulesOpen((x) => !x)}
        >
          {rulesOpen
            ? "Hide the daily limits"
            : "The daily limits, and what happens when a fact is removed"}
        </button>
        {rulesOpen && (
          <ul className="cnu-limits">
            <li>{CAP_LINE.replace(/25/g, String(me.earnCap))}</li>
            <li>
              Only 5 answers a day about a company&apos;s industry, size,
              revenue or how they sell earn a credit.
            </li>
            <li>
              You can unlock up to 100 facts a day, or 25 on your first day. A
              company counts as {COMPANY_PRICE}.
            </li>
            <li>
              Invite bonuses count toward the {EARN_CAP} a day. Someone who
              joins from your own internet connection earns no bonus.
            </li>
            {plan && <li>{FREE_EARN_RULE}</li>}
            <li>
              If a fact you unlocked is removed after review, you get the credit
              back. If one you added is removed, its credit is taken back, and
              the next fact you add clears anything you owe.
            </li>
          </ul>
        )}
      </div>
    </section>
  );

  /* ----- Plans ----- */
  const showCards =
    !!plan &&
    plan.pause !== "now" &&
    (plan.name !== "pro" ||
      (!!plan.subscribed && !plan.proStartsAt && !plan.cancelAt));
  const plansPanel = plan ? (
    <>
      <PlanStatusCard
        plan={plan}
        refresh={c.refresh}
        art={false}
        className="cnu-plan-now"
      />
      {showCards && (
        <section className="cnu-card cnu-pad" aria-labelledby="cnu-pl">
          <div className="cnu-head cnu-head-flat">
            <h2 id="cnu-pl">Free, Pro and Close, side by side</h2>
            <span className="cnu-sub">
              Flat prices. No fee on what you win.
            </span>
          </div>
          {!plan.notLooking && <p className="cnu-note">{VALUE_LINE}</p>}
          <PlanCards plan={plan} from="billing" onDone={c.refresh} />
        </section>
      )}
      <PlanManageCards plan={plan} refresh={c.refresh} ai={false} />
      <section className="cnu-card cnu-pad" aria-labelledby="cnu-cmp">
        <div className="cnu-head cnu-head-flat">
          <h2 id="cnu-cmp">Row by row</h2>
          <span className="cnu-sub">
            {plan.name === "pro"
              ? `Everything in the ${planName(plan)} column is yours.`
              : "On a paid plan you can pause for a month when your book is full, cancel any month, and switch between Pro and Close."}
          </span>
        </div>
        <div className="cnu-scroll">
          <CompareTable current={plan.tier} />
        </div>
      </section>
    </>
  ) : null;

  const overviewPlan = plan ? (
    <section className="cnu-card cnu-pad" aria-labelledby="cnu-plo">
      <div className="cnu-head cnu-head-flat">
        <h2 id="cnu-plo">Your plan</h2>
        <span className="cnu-sub">
          {plan.name === "trial"
            ? `${planName(plan)} · ${plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft} days left`}`
            : plan.name === "pro"
              ? planName(plan)
              : "Free"}
        </span>
        <span className="cnu-sp" />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setTab("plans")}
        >
          Compare the plans
        </button>
      </div>
      <p className="cnu-note">
        {plan.name === "trial"
          ? `Your trial is the Close plan, proposals included. It ends on ${planDay(plan.trialEndsAt)}. Nothing to do: when it ends you are on Free, and no card is asked.`
          : plan.name === "pro"
            ? `${plan.prices.proCredits} credits come with each paid month, and companies open free, up to ${PRO_OPENS_DAILY} a day.`
            : "Free keeps earning, 1 list with the weekly email, median rates by function, and one Crystal Ball company a day."}
      </p>
      {plan.topup && plan.name !== "pro" && <TopupLine plan={plan} />}
    </section>
  ) : null;

  const admin = me.admin && (
    <>
      <Review view={view} />
      <ReportedMessages
        list={view.reportedMessages ?? []}
        refresh={c.refresh}
      />
    </>
  );

  let panel: ReactNode;
  if (tab === "ledger") panel = ledgerCard;
  else if (tab === "earn")
    panel = (
      <>
        {waysCard(false)}
        {rulesCard}
      </>
    );
  else if (tab === "plans" && plan) panel = plansPanel;
  else
    panel = (
      <>
        <div className="cnu-two">
          {chart}
          {usage}
        </div>
        {ledgerCard}
        <div className="cnu-two">
          {waysCard(true)}
          {overviewPlan}
        </div>
        {admin}
      </>
    );

  return (
    <div className="cnu-page" data-tab={tab}>
      <p className="cnu-lead">
        What you earned, what you spent and what your plan gives you.
      </p>
      {!stripGone(c, "credits") && <PageStrip page="credits" />}
      {/* Phones: the tiles and the three lines on Overview only, so the ledger, the ways and the plans start near the top. */}
      {(!phone || tab === "overview") && tiles}
      {(!phone || tab === "overview") && (
        <section className="cnu-three" aria-label="Credits in three lines">
          {threeLines(me, starter).map((x) => (
            <span key={x.t} className="cnu-three-l">
              <strong className="num">{x.n}</strong>
              <span>
                <strong>{x.t}</strong> {x.s}
              </span>
            </span>
          ))}
        </section>
      )}
      {(owes || unlocks) && (
        <div className="cnu-limitsnow" role="status">
          {owes && <p>{owes}</p>}
          {unlocks && <p>{unlocks}</p>}
        </div>
      )}
      <div
        className="cnu-tabs"
        role="tablist"
        aria-label="Credits and usage"
        id="cnu-tabs"
      >
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`cnu-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="cnu-panel"
            className={tab === t ? "on" : undefined}
            onClick={() => setTab(t)}
          >
            {CREDIT_TAB_LABEL[t]}
            {t === "ledger" && (
              <span className="cnu-tab-n num">{lines.length}</span>
            )}
            {t === "earn" && (
              <span className="cnu-tab-n num">{ways.length}</span>
            )}
            {t === "plans" && <span className="cnu-tab-n num">3</span>}
          </button>
        ))}
      </div>
      <div
        className="cnu-panel"
        id="cnu-panel"
        role="tabpanel"
        aria-labelledby={`cnu-tab-${tab}`}
      >
        {panel}
      </div>
      <p className="cnu-settings">
        Your sign-in link, notification emails, connected apps, your data and
        closing your account are in{" "}
        <a
          href={c.hrefOf("settings")}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            c.openPage("settings");
          }}
        >
          Settings
        </a>
        .
      </p>
    </div>
  );
}
