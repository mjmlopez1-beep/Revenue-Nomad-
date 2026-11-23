"use client";

/**
 * The record's own sections, as the drawer drew them in one long column: the header's links and
 * Follow, the actions (Unlock company, Open the job posting, Add to this company, Unlock all),
 * About, How they sell, Functions hired, every seat, the decision makers, the company's details,
 * With a peer, and the last line (where the facts came from). The record drawer (Drawer.tsx, on
 * phones and with RN_UI2 off) stacks them as before; the company page (company/CompanyPage.tsx)
 * puts them under its tabs. Each one reads the record's env (RecordEnvProvider) for who is
 * looking: a touch screen, a phone, the company's name or "this company" while it is locked.
 */
import { useState, type ReactNode } from "react";
import type { CoInfo } from "../../model";
import { COMPANY_GTM, fnGap, namedFn, shown } from "../../model";
import { FieldList } from "./Facts";
import { EngagementCard } from "./Seats";
import { AddPersonForm, PersonCard } from "./People";
import { MissingFacts, UnlockAll, UnlockCompany, planOf, type Plan } from "./Unlock";
import { COMPANY_ROWS, EnvCtx, SELL_NOTE, SOURCE_SAY, earnLine, hasPostedRate, listOf, openRole, pickExempt, seatKind, seatSplit, seatsTitle, type Contact, type DrawerEnv } from "./env";
import { wayInSeatsOf } from "./WayIn";
import { earnNote, useUi } from "../../ui";
import { NoSeatYet, OnTheTeam, storyTag, storyTitle } from "../../Tables";
import { isFractionalLead, ledFullTimeWords, monthYear } from "@/lib/leaders/types";
import { LeaderReport } from "../../LeaderReport";
import { CrystalOpen } from "../../CrystalOpen";
import { AboutText } from "../../About";
import { PeerActions } from "../../PeerSheets";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { buyersOf } from "@/lib/moves";
import { IconExternal, IconPlus, IconStar, timeAgo } from "../../../ui/shared";
import { plural } from "../../hooks";
import { UNLOCKS_LEFT_TIP, postingToOpen, unlocksLeft, unlocksLeftWords } from "../../display";

/** The record's env for a company: who is looking and how. */
export function recordEnv(i: CoInfo, o: { touch: boolean; phone: boolean; contact: Contact | null }): DrawerEnv {
  const c = i.c;
  return { touch: o.touch, phone: o.phone, contact: o.contact, company: c.hidden ? "this company" : c.name, hidden: !!c.hidden, exempt: pickExempt(i), companyId: c.id, found: !!c.found };
}
export function RecordEnvProvider({ env, children }: { env: DrawerEnv; children: ReactNode }) {
  return <EnvCtx.Provider value={env}>{children}</EnvCtx.Provider>;
}

/** Follow: free, and new facts here reach the member (the Following view, the weekly email, Alerts). */
export function FollowButton({ i, big }: { i: CoInfo; big?: boolean }) {
  const ui = useUi();
  const c = i.c;
  return (
    <button
      type="button"
      className={`btn${big ? "" : " btn-sm"} tp-followbtn${c.following ? " tp-following" : ""}`}
      onClick={() => ui.act({ type: "follow", companyId: c.id, on: !c.following })}
      aria-pressed={c.following}
      aria-label={c.following ? "Following" : "Follow"}
      title={c.following ? "Stop following this company" : "Following is free. New facts here show up in your Following view."}
    >
      <IconStar size={13} filled={c.following} /> <span className="tp-follow-t">{c.following ? "Following" : "Follow"}</span>
    </button>
  );
}

/** What the record's actions need: the plan for Unlock all, and the job posting to open (a hiring company the member can see). */
export function recordPlan(i: CoInfo, focus: string | null) {
  const plan = planOf(i);
  const posting = postingToOpen(i, focus);
  return { plan, posting, postedRate: hasPostedRate(i), hiringHere: i.engs.some(openRole) };
}

/** "Open the job posting", in a new tab: what the member paid for at a hiring company they unlocked. */
export function OpenPosting({ i, focus, bar }: { i: CoInfo; focus: string | null; bar?: boolean }) {
  const posting = postingToOpen(i, focus);
  if (!posting) return null;
  const role = shown(posting.e.cells.role);
  return (
    <a className={`btn btn-pine${bar ? " tp-rsheet-post" : ""}`} href={posting.href} target="_blank" rel="noreferrer" title={role ? `The job posting for ${role}, in a new tab` : "The job posting, in a new tab"}>
      Open the job posting <IconExternal size={12} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The record's one action at a locked company (Unlock company, or Crystal Ball's own open where
 * it applies), else the job posting, Add to this company and Unlock all.
 */
export function RecordActions({ i, focus, fromBall, add = true }: { i: CoInfo; focus: string | null; fromBall: boolean; add?: boolean }) {
  const ui = useUi();
  const c = i.c;
  const { plan, posting, postedRate, hiringHere } = recordPlan(i, focus);
  return (
    <div className="tp-dactions">
      {c.hidden ? (
        fromBall ? <CrystalOpen id={c.id} name={c.shownName} /> : <UnlockCompany id={c.id} rate={postedRate} roles={hiringHere} />
      ) : (
        <>
          <OpenPosting i={i} focus={focus} />
          {/* The top bar's "Add what you know" starts from a search. This one adds to the company on screen. */}
          {add && (
            <button type="button" className={`btn${posting ? "" : " btn-volt"}`} onClick={() => ui.openAdd({ companyId: c.id })}>
              <IconPlus size={14} /> Add to this company
            </button>
          )}
          <UnlockAll plan={plan} />
        </>
      )}
    </div>
  );
}

/** The day's unlock limit, while it binds before the balance (an account's first day): "25 unlocks left today". */
export const capShows = (me: Parameters<typeof unlocksLeft>[0], i: CoInfo, plan: Plan) => {
  const left = unlocksLeft(me);
  return !!unlocksLeftWords(me) && !!left && (!!i.c.hidden || (plan.items.length > 0 && plan.cost <= left));
};
export function CapLine({ i, plan, phone }: { i: CoInfo; plan: Plan; phone?: boolean }) {
  const ui = useUi();
  const words = unlocksLeftWords(ui.me);
  if (!capShows(ui.me, i, plan)) return null;
  return (
    <p className={phone ? "tp-rsheet-cap" : "tp-capline"} title={UNLOCKS_LEFT_TIP}>
      {words}
    </p>
  );
}

/** About: a hidden company's About shows too, without its name, web address and links (the server cuts them). */
export function AboutSection({ i, title = "About" }: { i: CoInfo; title?: string }) {
  const c = i.c;
  if (c.hidden && c.cells.about?.s !== "value") return null;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">{title}</h3>
      <AboutText id={c.id} cell={c.cells.about} as={c.hidden ? "locked" : c.found ? "found" : "open"} />
    </section>
  );
}

/** Not my fit? Pass it to a peer, or team up on it (PeerSheets.tsx). Only at a company the member can see by name. */
export function PeerSection({ i, crystal }: { i: CoInfo; crystal?: boolean }) {
  if (i.c.hidden) return null;
  return (
    <section className="tp-dsec pe-sec-peer" aria-labelledby="pe-dsec-h">
      <h3 className="tp-dsec-h" id="pe-dsec-h">
        With a peer
      </h3>
      <p className="tp-dsec-note">Not your fit? Pass it to someone great, free for them. Or team up and pitch it together.</p>
      <PeerActions company={i.c.id} role={i.engs.find(openRole)?.id ?? null} from={i.engs.some(openRole) ? "role" : crystal ? "crystal" : "record"} />
    </section>
  );
}

/** How they sell (the company's go-to-market facts). */
export function GtmSection({ i, title = "How they sell", head }: { i: CoInfo; title?: string; head?: ReactNode }) {
  const ui = useUi();
  const c = i.c;
  if (c.hidden && !COMPANY_GTM.some((f) => c.cells[f]?.s !== "empty")) return null;
  const gtmEmpty = COMPANY_GTM.filter((f) => c.cells[f]?.s === "empty");
  const sellOut = !pickExempt(i) && (ui.me.sellEarnLeft ?? 1) <= 0 && !earnNote(ui.me).capped;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">
        {title}
        {head}
      </h3>
      <FieldList entity="company" id={c.id} cells={c.cells} fields={COMPANY_GTM} emptyNote={sellOut && gtmEmpty.length > 0 ? SELL_NOTE : undefined} />
    </section>
  );
}

/**
 * The company's own facts as rows. Missing ones are added in the drawer's header while it has no
 * summary line, and the website and LinkedIn always are, so this offers only the rest. `all`: the
 * page has no such header, so every missing one is offered here.
 */
export function DetailsSection({ i, all, title = "Company details", head }: { i: CoInfo; all?: boolean; title?: string; head?: ReactNode }) {
  const ui = useUi();
  const c = i.c;
  if (c.hidden) return null;
  const line = summaryLine(i);
  const coNoAdd = all ? [] : line.length ? ["website", "linkedin"] : COMPANY_ROWS;
  const coEmpty = COMPANY_ROWS.filter((f) => c.cells[f]?.s === "empty" && !coNoAdd.includes(f)).map((f) => ({ entity: "company" as const, id: c.id, field: f }));
  const coKnown = COMPANY_ROWS.some((f) => c.cells[f] && c.cells[f].s !== "empty");
  if (!coKnown && !coEmpty.length) return null;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">
        {title}
        {head}
      </h3>
      <FieldList entity="company" id={c.id} cells={c.cells} fields={COMPANY_ROWS} noAdd={coNoAdd} emptyNote={coEmpty.length > 0 ? earnLine(ui, { exempt: pickExempt(i) }, coEmpty) : undefined} />
    </section>
  );
}

/** The free facts in one line: industry, size, revenue, HQ. */
export function summaryLine(i: CoInfo): string[] {
  const v = (f: string) => shown(i.c.cells[f]);
  const emp = v("employees");
  const rev = v("revenue");
  return [v("industry"), emp && `${emp} employees`, rev && `${rev} revenue`, v("hq")].filter(Boolean) as string[];
}

/** How many fractional hires per function here, counted as the header's "N fractional seats" is (the server's friendliness). */
export function fnCountsOf(i: CoInfo): Map<string, number> {
  const fnCounts = new Map<string, number>();
  for (const e of i.engs) {
    const fn = shown(e.cells.function);
    if (fn && seatKind(e) === "hire") fnCounts.set(fn, (fnCounts.get(fn) ?? 0) + 1);
  }
  return fnCounts;
}

/**
 * Functions hired fractionally, the member's own first; then the ones with an open role and no hire
 * yet ("Hiring now"); then the ones only member stories (or a posting that came down) mention, muted.
 * "No fractional Sales yet", or what the company's website says in its place (lib/leaders), and
 * Tell Merlin when they have a full-time leader there.
 */
export function FunctionsSection({ i, title }: { i: CoInfo; title?: string }) {
  const ui = useUi();
  const c = i.c;
  const fnCounts = fnCountsOf(i);
  const mine = ui.me.function;
  const hired = [...i.fnState.hired].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : (fnCounts.get(b) ?? 0) - (fnCounts.get(a) ?? 0)));
  const hiringFns = i.fnState.hiring;
  const storyFns = i.fnState.story;
  const fg = fnGap(i, mine);
  const gap = fg.gap;
  const teamLeads = i.leads.filter((l) => isFractionalLead(l) && !hired.includes(l.fn));
  const mineNamed = namedFn(mine);
  if (!(hired.length > 0 || hiringFns.length > 0 || storyFns.length > 0 || teamLeads.length > 0)) return null;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">{title ?? (hired.length ? "Functions hired" : "Functions")}</h3>
      <div className="tp-chips">
        {hired.map((fn) => (
          <span key={fn} className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}`} title={seatsTitle(fnCounts.get(fn))}>
            {fn} {(fnCounts.get(fn) ?? 0) > 1 ? <span className="num tp-cnt">{fnCounts.get(fn)}</span> : null}
            {fn === mine && <span className="sr-only">, your function</span>}
          </span>
        ))}
        {hiringFns.map((fn) => (
          <span key={fn} className="chip tp-fn tp-fn-hiring" title={`An open ${fn} role. Nobody is on file in a ${fn} seat yet.`}>
            {fn}
            <span className="tp-fn-tag"> · hiring now</span>
          </span>
        ))}
        {storyFns.map((fn) => (
          <span key={fn} className="chip tp-fn tp-fn-story" title={storyTitle(i, fn)}>
            {fn}
            <span className="tp-fn-tag"> · {storyTag(i, fn)}</span>
          </span>
        ))}
        {teamLeads.map((l) => (
          <OnTheTeam key={l.fn} l={l} />
        ))}
        {gap && mine && <NoSeatYet fn={mine} led={fg.led} teamAt={c.leads?.teamAt} />}
      </div>
      {gap &&
        mine &&
        (fg.led ? (
          <p className="tp-dsec-note tp-mt8">
            {ledFullTimeWords(mine, fg.led)}
            {fg.led.how === "members" ? "" : ", from the company's website"}. No fractional {mine} seat is on file.
          </p>
        ) : (
          <p className="tp-dsec-note tp-mt8">
            They hired fractionals in other functions. {mineNamed ? `No fractional ${mineNamed} seat` : "No fractional seat in your function"} is on file yet.{" "}
            {/* Never "no Sales leader" unless their team page was read (lib/leaders/types.ts noLeaderWords). */}
            {c.leads?.teamAt ? `Their team page names no ${mine} leader (checked ${monthYear(c.leads.teamAt)}).` : "We haven't checked their team page yet."}
          </p>
        ))}
      {gap && mine && !c.hidden && !(fg.led && fg.led.how !== "members") && <LeaderReport companyId={c.id} fn={mine} leads={c.leads} from="record" />}
      {storyFns.length > 0 && <p className="tp-dsec-note tp-mt8">Functions marked full-time or posting closed are a full-time hire, or a job posting that came down with nobody named. Their seats are listed below but aren&apos;t counted as fractional hires.</p>}
    </section>
  );
}

/** Every seat on file, as cards, with Add a fractional seat you held. */
export function SeatsSection({ i, focus, title = "Fractional seats", only }: { i: CoInfo; focus: string | null; title?: string; only?: (e: CoInfo["engs"][number]) => boolean }) {
  const ui = useUi();
  const c = i.c;
  const wayInSeats = wayInSeatsOf(i, ui.me.function);
  const engs = only ? i.engs.filter(only) : i.engs;
  const notHires = engs.filter((e) => seatKind(e) === "story").length;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">
        {title} <span className="num tp-cnt">{engs.length}</span>
      </h3>
      {notHires > 0 && <p className="tp-dsec-note">{seatSplit(engs)}</p>}
      {engs.length === 0 && <p className="tp-dsec-note">No fractional seats on file here yet. Add one you know and earn a credit for each fact.</p>}
      {engs.map((e) => (
        <EngagementCard key={e.id} e={e} companyId={c.id} company={c.hidden ? "this company" : c.name} focus={focus === e.id} coPeople={c.people} wayIn={wayInSeats.includes(e)} />
      ))}
      {/* Nothing can be added to a hidden company until it is unlocked, so nothing offers to. */}
      {!c.hidden && (
        <button type="button" className="btn btn-sm btn-ghost tp-addlink tp-addeng" onClick={() => ui.openAdd({ companyId: c.id, mode: "engagement" })}>
          <IconPlus size={13} /> Add a fractional seat you held
        </button>
      )}
    </section>
  );
}

/** The decision makers: the company's people, and who hired or managed a fractional here (listed with their seat). Add a person. */
export function PeopleSection({ i, title }: { i: CoInfo; title?: ReactNode }) {
  const c = i.c;
  const [adding, setAdding] = useState(false);
  const seatBuyers = buyersOf(c).filter((b) => !!b.e);
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">
        <span className="tp-dsec-ht">{title ?? `Decision makers at ${c.hidden ? "this company" : c.name}`}</span> <span className="num tp-cnt">{c.people.length + seatBuyers.length}</span>
      </h3>
      {c.people.length + seatBuyers.length === 0 && !adding && <p className="tp-dsec-note">{c.hidden ? "Nobody is on file here yet." : "Nobody is on file here yet. Add someone you know and earn a credit for each fact."}</p>}
      {c.people.map((p) => (
        <PersonCard key={p.id} p={p} />
      ))}
      {/* Who hired or managed a fractional here decides too: listed with their seat (the seat's card has them as well). */}
      {seatBuyers.map((b) => (
        <div key={b.p.id} className="tp-person-box tp-dm-seat">
          <div className="tp-sublabel">{[b.rel, b.e && shown(b.e.cells.function) ? `${shown(b.e.cells.function)} seat` : null].filter(Boolean).join(" · ")}</div>
          <PersonCard p={b.p} inSeat anchor={false} />
        </div>
      ))}
      {c.hidden ? null : adding ? (
        <AddPersonForm companyId={c.id} engagementId={null} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(true)}>
          <IconPlus size={13} /> Add a person
        </button>
      )}
    </section>
  );
}

/** Where the seats came from, as the record's last line reads them ("From job postings and what members added"). */
export function sourcesOf(i: CoInfo): string[] {
  return [...new Set(i.engs.map((e) => SOURCE_SAY[e.source] ?? (SOURCE_LABEL[e.source] ?? e.source).toLowerCase()))];
}

/** The record's last line: where its facts came from, when it changed, and how many facts are on file. */
export function RecordFoot({ i, children }: { i: CoInfo; children?: ReactNode }) {
  const c = i.c;
  const sources = sourcesOf(i);
  return (
    <footer className="tp-dfoot num">
      {sources.length > 0 && <span>From {listOf(sources)}</span>}
      {c.updatedAt && <span>Updated {timeAgo(c.updatedAt)}</span>}
      <span>
        {plural(c.facts.known + c.facts.locked, "fact")} on file, {c.facts.missing} missing
      </span>
      {children}
    </footer>
  );
}

export { MissingFacts };
