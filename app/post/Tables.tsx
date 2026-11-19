"use client";

/**
 * The three tables: companies (default), engagements and people. 44px rows, sticky header and
 * company column. Cells are 13px in the text face; numbers are right-aligned with tabular
 * figures; a long name, role or seat holder truncates with its full text in the tooltip.
 *
 * The companies table leads with the company and who held its latest seat (the warm path), then
 * what a member can read (the seat, the functions it hired, its industry, size, revenue and HQ),
 * then the rest of what they can unlock. "Functions hired" shows 3 chips at most, then "+N". On
 * Hiring now every row is an open role, so the tables switch to the columns that tell open roles
 * apart. With Recently hired on (`hire`), a company row shows the hire it matched ("Hired a
 * fractional CFO · Mar 2026") in place of the latest seat, and who held that seat.
 *
 * Credits are never spent by a stray click. A row has at most one paying control per purchase:
 *   - a hidden company's row spends only through the lock on its logo (Unlock company, which also
 *     opens the role, posting and rate of its open roles). Its other locks are quiet and open the record.
 *   - an open role's role, posting and rate are one purchase: only the first lock spends, the others are quiet.
 * A lock's label never takes clicks (post.css), so only the lock's own box spends.
 */
import { memo, useContext, useRef, useState, type ReactNode } from "react";
import type { Cell, EngagementRec, Me, PersonRec } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconCheck, IconChevron, IconLock, IconStar, LockedName, LockedSite, fmtMonth } from "../ui/shared";
import {
  ADD_AFTER_NAME, COMPANY_GTM, NOT_YET_ON_OPEN_ROLE, PERSON_NO_ADD, coverOf, personBothLocked, personCoverOf, personNoun, personUnseen, fitReason, fitTier, hireLine, hireOfRow, isOpenRole, isUnheldOpenRole, lastClosedPosting, namedFn,
  recentSeats, seatNoun, seatWhat, shown, waitWords, gapWords, onTheTeamWords, type CoInfo, type FactRef, type HireCtx, type Row, type SortKey, type Tab,
} from "./model";
import "./hired.css";
import { Anchored, FactCell, UiCtx, YourSeat, earnNote, useCellUi, type AppPage, type Ui } from "./ui";
import { RoleDate, datesAreStatus, statusText } from "./RoleDate";
import { useFitWhy } from "./Hunt";
import { VerifyName } from "./Verify";
import { fnChipPlan } from "./display";
import { leadPhrase, type LeadLine } from "@/lib/leaders/types";

/**
 * How fractional friendly a company is, as a plain label. Hover for the reason and the score.
 * In rows and cards every tier is an outline chip, an open role included. `hot` is the record
 * header of a company with an open role: the one solid ember chip on the screen.
 */
export function Fit({ i, big, hot }: { i: CoInfo; big?: boolean; hot?: boolean }) {
  const f = i.c.friendly;
  const { label, cls } = fitTier({ ...f, recent: recentSeats(i) }, i.c.engagements.length, !!lastClosedPosting(i));
  const ember = hot && f.open > 0;
  const chip = (
    <span className={`chip tp-tier ${ember ? "chip-ember" : cls}${big ? " tp-tier-big" : ""}`} title={`${fitReason(i).replace(/\.$/, "")}. Fit score ${f.score} of 100.`}>
      {label}
    </span>
  );
  // A hiring company the member paid to see: say so beside the chip, or it looks like one that was never locked.
  if (big || !(f.open > 0 && i.c.unlocked && !i.c.hidden)) return chip;
  return (
    <span className="tp-tierwrap">
      {chip}
      <UnlockedTag />
    </span>
  );
}

/** A quiet mark on a hiring company the member unlocked. Others still see it locked. */
export function UnlockedTag() {
  return (
    <span className="tp-unlocked" title="You unlocked this company, so you see its name. It stays locked for other members until the role closes.">
      <IconCheck size={11} />
      Unlocked
    </span>
  );
}

/**
 * Functions at a company: the ones hired fractionally (the member's own first), then the
 * ones with an open role and no hire yet ("Sales · hiring"), then the ones only member stories
 * mention (muted). "No Sales seat yet" follows when they hired other functions and nothing on file
 * names the member's, so a row never says "Sales" and "No Sales seat yet" together. `gap` false
 * leaves it out (the "No Sales seat yet" filter already says it). `total` caps every chip in the
 * cell, the dashed one included: the Companies table shows 3, then "+N" (display.ts fnChipPlan).
 */
export function FnChips({ i, mine, max = 3, gap = true, total }: { i: CoInfo; mine: string | null; max?: number; gap?: boolean; total?: number }) {
  const { chips, rest, gap: showGap, led, team } = fnChipPlan(i, mine, { max, total, gap });
  return (
    <span className="tp-fns">
      {chips.map(({ f, kind }) => (
        <span
          key={f}
          className={`chip tp-fn${kind === "story" ? " tp-fn-story" : kind === "hiring" ? " tp-fn-hiring" : f === mine ? " tp-fn-me" : ""}`}
          title={kind === "story" ? storyTitle(i, f) : kind === "hiring" ? `An open ${f} role. Nobody is on file in a ${f} seat yet.` : f === mine ? "Your function" : undefined}
        >
          {f}
          {kind === "hiring" && <span className="tp-fn-tag"> · hiring</span>}
          {/* Muted text alone would carry the meaning: say it for screen readers too (the tooltip says it on hover). */}
          {kind === "story" && <span className="sr-only">, {storyWhy(i, f)}</span>}
          {kind === "hired" && f === mine && <span className="sr-only">, your function</span>}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="tp-more num" title={rest.join(", ")}>
          <span aria-hidden>+{rest.length}</span>
          <span className="sr-only">, and {rest.join(", ")}</span>
        </span>
      )}
      {team && <OnTheTeam l={team} />}
      {showGap && mine && <NoSeatYet fn={mine} led={led} />}
    </span>
  );
}

/** Why a function is muted: only a full-time hire is on file for it, or a posting for it came down with nobody named. */
const postingOnly = (i: CoInfo, fn: string) => {
  const seats = i.engs.filter((e) => shown(e.cells.function) === fn);
  return seats.length > 0 && seats.every((e) => e.source === "Demand scan");
};
export function storyTitle(i: CoInfo, fn: string) {
  if (postingOnly(i, fn)) return `A ${fn} job posting came down. Nobody is on file in the seat.`;
  return `A full-time ${fn} hire is on file. No fractional ${fn} seat is on file yet.`;
}
/** The chip's short tag: "posting closed" or "full-time". */
export const storyTag = (i: CoInfo, fn: string) => (postingOnly(i, fn) ? "posting closed" : "full-time");
/** The same, short, for a screen reader after the chip's name. */
const storyWhy = (i: CoInfo, fn: string) => (postingOnly(i, fn) ? "from a posting that came down" : "a full-time hire");

/** They hired fractionals in other functions, not the member's yet. Dashed, like anything missing. */
export function NoSeatYet({ fn, led }: { fn: string; led?: LeadLine | null }) {
  const named = namedFn(fn);
  // A full-time leader of the function is on the company's website: no opening to point at, and it says so.
  if (led)
    return (
      <span className="chip tp-fn tp-fn-story tp-fn-led" title={`From the company's website: a ${leadPhrase(led)} leads ${fn}. No fractional ${fn} seat is on file.`}>
        {gapWords(fn, led)}
      </span>
    );
  return (
    <span className="chip chip-outline tp-fn-gap" title={`They hired fractionals in other functions. ${named ? `No fractional ${named} seat` : "No fractional seat in your function"} is on file yet.`}>
      {named ? `No fractional ${named} yet` : "No fractional in your function yet"}
    </span>
  );
}

/** A fractional or interim leader of the function on the company's website: "Fractional CMO on the team". */
export function OnTheTeam({ l }: { l: LeadLine }) {
  return (
    <span className="chip tp-fn tp-fn-team" title={`From the company's website: a ${leadPhrase(l)} leads ${l.fn}.`}>
      {onTheTeamWords(l)}
    </span>
  );
}

/** Who held the seat. An open role has nobody yet, so it never asks for a name. */
export function HeldBy({ e, cover }: { e: EngagementRec; cover?: string | null }) {
  if (e.yours) return <YourSeat id={e.id} />;
  // A seat Revenue Nomad found with nobody named: its holder isn't a member yet, so there is no name to add or unlock. They claim it in the record.
  if (e.claimable && (!e.cells.operator || e.cells.operator.s === "empty"))
    return (
      <span className="tp-notyet" title="The seat holder isn't on Merlin yet. If it's your seat, claim it in the record.">
        Not on Merlin yet
      </span>
    );
  // A name from public profiles nobody has verified: the name, with Verify beside it (no "not verified" label).
  const op = e.cells.operator;
  if (op?.s === "value" && op.unverified)
    return (
      <span className="vf-held">
        <RowFact t={{ entity: "engagement", id: e.id, field: "operator" }} cell={op} cover={cover} noun={seatNoun(e, "operator")} what={seatWhat(e, "operator")} />
        <VerifyName engagementId={e.id} confirmed={!!op.iv} count={op.ver} waiting={!!e.claimWaiting} />
      </span>
    );
  if (isOpenRole(e) && e.cells.operator?.s === "empty")
    return (
      <span className="tp-open" title="Nobody holds this seat yet">
        Open seat
      </span>
    );
  // "Unlock who held it · 1 credit": the name, with the role they held, for one credit.
  return <RowFact t={{ entity: "engagement", id: e.id, field: "operator" }} cell={e.cells.operator} cover={cover} noun={seatNoun(e, "operator")} what={seatWhat(e, "operator")} />;
}

/** The one unlock for a hidden company: its name, website, LinkedIn and About, and the role, posting and rate of its open roles. */
export function UnlockCompanyCell({ i }: { i: CoInfo }) {
  const ui = useCellUi();
  // Today's unlocks are used up (a company counts as COMPANY_PRICE): the hidden logo already shows the lock, and its record says when.
  if ((ui.me.unlocksLeft ?? Infinity) < COMPANY_PRICE && ui.me.credits >= COMPANY_PRICE) return null;
  return <FactCell t={{ entity: "company", id: i.c.id, field: "identity" }} cell={{ s: "locked", ver: 0 }} />;
}

/* ---------- facts in a row ---------- */

/** Company answers whose credit counts toward the 5 a day (Me.sellEarnLeft). */
const SELL_FIELDS = new Set(["industry", "employees", "revenue", ...COMPANY_GTM]);
/** The member added this company or holds a seat here, so its answers are not held to the 5 a day. */
export const ownCompany = (i: CoInfo) => !!i.c.added || i.engs.some((e) => e.yours);

/**
 * A locked fact that another control on the row buys, or the record: a quiet lock, never a button.
 * `words` ("Opens after the name"): a lock that waits for another purchase says so where there is
 * room (phone cards). In a table row it rests like the others, and its tooltip says it.
 */
function Covered({ title, words }: { title: string; words?: string | null }) {
  return (
    <span className="tp-cell tp-covered" title={title}>
      <IconLock />
      {words ? <span className="tp-lockwait-t">{words}</span> : <span className="lock-mask" aria-hidden />}
      <span className="sr-only">{words ? title.slice(words.length) : `Locked. ${title}`}</span>
    </span>
  );
}

/** Today's unlocks are used up and credits are left: a lock that says when, never a button. */
function LockWait() {
  return (
    <span className="tp-cell tp-lockwait" title="You've used today's unlocks. Your credits are still here.">
      <IconLock />
      <span className="lock-mask" aria-hidden />
      <span className="tp-lockwait-t">Unlocks again tomorrow</span>
    </span>
  );
}

/**
 * A fact in a list row or card. It is FactCell, plus four rules only lists need: a lock another
 * control buys (or that waits for another purchase) is quiet (`cover`), a lock past today's unlock
 * limit says "Unlocks again tomorrow", an empty fact the member can't add here is a dash with the
 * reason (`noAdd`), and a company answer past the 5 that earn today drops its "+1".
 */
export function RowFact({
  t,
  cell,
  render,
  addLabel,
  cover,
  own,
  at,
  noun,
  what,
  noAdd,
}: {
  t: FactRef;
  cell: Cell | undefined;
  render?: (v: string) => ReactNode;
  addLabel?: string;
  cover?: string | null;
  /** A company the member added or holds a seat at: its answers always earn (no 5 a day limit). */
  own?: boolean;
  /** The company's name, for the button names where the row does not show it next to them (phone cards). */
  at?: string;
  /** Where one lock opens more than this fact, what it opens ("name and title", "who held it"). */
  noun?: string;
  /** The lock's tooltip for what it opens, where that is more than this fact (see seatWhat). */
  what?: string;
  /** Why this empty fact can't be added here (a person the member can't see yet): a dash, never "+ Add". */
  noAdd?: string | null;
}) {
  const ui = useCellUi();
  const ref = useRef<HTMLSpanElement>(null);
  if (cell?.s === "locked") {
    if (cover) return <Covered title={cover} words={ui.layout === "phone" ? waitWords(cover) : null} />;
    if (ui.me.unlocksLeft === 0 && ui.me.credits > 0) return <LockWait />;
  }
  if (cell?.s === "empty" && noAdd) return <None title={noAdd} />;
  if (cell?.s === "empty" && t.entity === "company" && !own && SELL_FIELDS.has(t.field) && ui.me.sellEarnLeft === 0 && !ui.isHidden(t.id)) {
    return (
      <span className="tp-cell" data-cell={`${t.id}.${t.field}`} ref={ref} title="Only 5 answers like this earn a credit each day. You can still add it.">
        <AddPill label={addLabel} earn={false} onAdd={() => ref.current && ui.edit(ref.current, t)} />
      </span>
    );
  }
  return <FactCell t={t} cell={cell} render={render} addLabel={addLabel} at={at} noun={noun} what={what} />;
}

/** The tooltip on a locked company's name. */
export const LOCKED_TIP = "This company is locked. Unlock it to see its name, website and job postings.";

/**
 * A company the member hasn't unlocked (every company, until they know it): a blurred tile where
 * the logo would be, a blurred made-up name (LockedName, from the public id only), and what is
 * free to know ("SaaS · $1M–$5M · 11–50 · TX") where the domain would be. The record's header adds a blurred site.
 *   table   the lock is the button, and only its own 28px box spends. Point at it, or tab to
 *           it, and its label reads "Unlock company · 2 credits". The name and the line under it
 *           open the record, so a click meant for the record never spends a credit.
 *   phone   the card has no unlock button: it opens the record (see Cards.tsx).
 *   big     the record's header. Its own Unlock company button sits below.
 * `bare` leaves out the industry, size and region line where the same facts are printed right under it.
 * `quiet` leaves out the lock button where the row has its own Unlock company button (the radar's day).
 */
export function HiddenCompany({ i, big, bare, quiet }: { i: CoInfo; big?: boolean; bare?: boolean; quiet?: boolean }) {
  const ui = useCellUi();
  const why = useFitWhy(i);
  const teaser = !bare && <span className="tp-co-dom" title={why ?? undefined}>{i.teaser || "Industry, size and HQ not on file yet"}</span>;
  if (big)
    return (
      <span className="tp-co tp-co-hidden big">
        <CompanyLogo name="" domain={null} hidden seed={i.c.id} size="lg" />
        <span className="tp-co-text">
          <h2 className="tp-dname">
            <LockedName seed={i.c.id} />
          </h2>
          <LockedSite seed={i.c.id} className="tp-co-dom" />
          {teaser}
        </span>
      </span>
    );
  const table = ui.layout !== "phone";
  return (
    <span className={`tp-co tp-co-hidden${table ? " in-table" : ""}`}>
      <CompanyLogo name="" domain={null} hidden seed={i.c.id} />
      <span className="tp-co-text">
        <span className="tp-co-name">
          <span className="tp-hidden-name" title={LOCKED_TIP}>
            <LockedName seed={i.c.id} />
          </span>
        </span>
        {teaser}
        {table && !quiet && <UnlockCompanyCell i={i} />}
      </span>
    </span>
  );
}

/**
 * `tagged`: a hiring company the member unlocked says "Unlocked" beside its name. The companies
 * table says it beside its Hiring now chip instead (Fit), so it passes false.
 */
function CompanyName({ i, following, tagged = true, quiet }: { i: CoInfo; following?: boolean; tagged?: boolean; quiet?: boolean }) {
  const why = useFitWhy(i);
  // Best fit for you: a maybe (part of the ideal client not on file) says so under the name, not only in the tooltip.
  const unknown = why?.match(/(?:^|· )([^·]*not on file)$/)?.[1] ?? null;
  if (i.c.hidden) return <HiddenCompany i={i} quiet={quiet} />;
  return (
    <span className="tp-co">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <span className="tp-co-text">
        <span className="tp-co-name" title={why ? `${i.c.name}. ${why}` : i.c.name}>
          <span className="tp-co-name-t">{i.c.name}</span>
          {following && (
            <span className="tp-co-star" title="You follow this company">
              <IconStar size={11} filled />
            </span>
          )}
          {tagged && i.c.unlocked && i.c.friendly.open > 0 && <UnlockedTag />}
        </span>
        {i.domain && (
          <span className="tp-co-dom mono" title={i.domain}>
            {i.domain}
          </span>
        )}
        {unknown && <span className="hunt-unknown">{unknown}</span>}
      </span>
    </span>
  );
}

/** Nothing to show and nothing to add here. */
const None = ({ title }: { title?: string }) => (
  <span className="tp-none" title={title}>
    –
  </span>
);
const NOT_YET = "This role is still open, so it has no start or end yet.";

/**
 * Recently hired: who the hire was and when, "Hired a fractional CFO · Mar 2026". The role title
 * only when the member can see it: a seat whose holder is on file keeps its role locked with the
 * holder (one purchase), so until then it reads "Hired a fractional Finance leader".
 */
export function HireLine({ e }: { e: EngagementRec }) {
  const { what, when } = hireLine(e);
  return (
    <span className="hired-line" title={when ? `${what} · ${when}` : what}>
      <span className="hired-what">{what}</span>
      {when && <span className="hired-when num">&nbsp;· {when}</span>}
    </span>
  );
}

/** The latest seat: the role, and under it when it started (or since when the role is open). */
function SeatCell({ i }: { i: CoInfo }) {
  const ui = useCellUi();
  const e = i.latest;
  if (!e) return <AddPill label="Add your seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
  const start = shown(e.cells.start);
  return (
    <span className="tp-stack">
      {/* On a seat whose holder is on file the role comes with who held it: this lock opens both. */}
      <RowFact t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} addLabel="Add role" cover={coverOf(i, e, "role")} noun={seatNoun(e, "role")} what={seatWhat(e, "role")} />
      {e.opened ? <RoleDate e={e} /> : start && <span className="tp-stack-sub num">{fmtMonth(start)}</span>}
    </span>
  );
}

/** A table row's functions: 3 chips at most, the dashed "No fractional Sales yet" counted, then "+N", so the column keeps one width. */
function FunctionsCell({ i, mine, gap }: { i: CoInfo; mine: string | null; gap: boolean }) {
  const ui = useCellUi();
  if (i.fns.length) return <FnChips i={i} mine={mine} gap={gap} total={3} />;
  const e = i.engs.find((x) => x.cells.function?.s === "empty");
  if (e) return <RowFact t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} />;
  return <AddPill label="Add your seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
}

/** The decision maker on file (else the first person): title, then the name, then how many more. */
function PeopleCell({ i }: { i: CoInfo }) {
  const ui = useCellUi();
  if (!i.people.length) {
    if (i.c.hidden) return <None title="Unlock the company first, then you can add who hired here." />;
    return <AddPill label="Add a person" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "person" })} />;
  }
  const dm = i.people.find(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker") ?? i.people[0];
  const tc = dm.p.cells.title;
  const title = tc?.s === "value" ? tc.v : "Title not on file";
  const more = i.people.length - 1;
  return (
    <span className="tp-stack">
      {/* A locked name and title are one purchase: one lock, on the name's line ("Unlock name and title"). */}
      {personBothLocked(dm.p.cells) ? null : tc?.s === "locked" ? (
        <span className="tp-ppl-t">
          <RowFact t={{ entity: "contact", id: dm.p.id, field: "title" }} cell={tc} cover={personCoverOf(i, dm.e, dm.p, "title")} />
        </span>
      ) : (
        <span className="tp-ppl-t" title={title}>
          {title}
        </span>
      )}
      <span className="tp-ppl-who">
        <RowFact t={{ entity: "contact", id: dm.p.id, field: "name" }} cell={dm.p.cells.name} cover={personCoverOf(i, dm.e, dm.p, "name")} noun={personNoun(dm.p.cells, "name")} />
        {more > 0 && <span className="tp-stack-sub num">+{more} more</span>}
      </span>
    </span>
  );
}

const rowProps = (r: Row, sel: boolean, onOpen: (r: Row) => void) => ({
  className: sel ? "sel" : undefined,
  onClick: () => onOpen(r),
  onKeyDown: (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter" && ev.target === ev.currentTarget) onOpen(r);
  },
  tabIndex: 0,
  "data-row": r.key,
});

/**
 * A fact of a seat in a row: quiet when another control buys it, a dash when an open role can't
 * have it yet. Its role, on a seat whose holder is on file, opens with who held it (one lock each, one purchase).
 */
function engCell(i: CoInfo, e: EngagementRec, field: string, opts: { render?: (v: string) => ReactNode; addLabel?: string } = {}) {
  if (NOT_YET_ON_OPEN_ROLE.includes(field) && isUnheldOpenRole(e) && e.cells[field]?.s === "empty") return <None title={NOT_YET} />;
  return <RowFact t={{ entity: "engagement", id: e.id, field }} cell={e.cells[field]} cover={coverOf(i, e, field)} noun={seatNoun(e, field)} what={seatWhat(e, field)} {...opts} />;
}

const CompanyRow = memo(function CompanyRow({
  r,
  mine,
  sel,
  onOpen,
  isNew,
  gap,
  hire,
}: {
  r: Row;
  mine: string | null;
  sel: boolean;
  onOpen: (r: Row) => void;
  isNew: boolean;
  gap: boolean;
  /** Recently hired: the row leads with the hire it matched, and Held by and Rate are that seat's. */
  hire?: HireCtx | null;
}) {
  const i = r.i;
  const c = i.c;
  const hired = hire ? hireOfRow(r, hire.fns, hire.within) : null;
  const e = hired ?? i.latest;
  const co = (field: string) => <RowFact t={{ entity: "company", id: c.id, field }} cell={c.cells[field]} cover={coverOf(i, null, field)} own={ownCompany(i)} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} tagged={false} />
        {isNew && (
          <span className="tp-new" title="New since your last visit">
            <span className="sr-only">New since your last visit</span>
          </span>
        )}
      </td>
      {/* Who held the seat comes right after the company: the warm path is the first thing a row offers. */}
      <td>{e ? <HeldBy e={e} cover={coverOf(i, e, "operator")} /> : <None />}</td>
      <td>{hired ? <HireLine e={hired} /> : <SeatCell i={i} />}</td>
      <td>
        <FunctionsCell i={i} mine={mine} gap={gap} />
      </td>
      <td>{co("industry")}</td>
      <td className="num">{co("employees")}</td>
      <td className="num c-lo">{co("revenue")}</td>
      <td className="c-lo">{co("hq")}</td>
      <td>
        <Fit i={i} />
      </td>
      <td className="num">{e ? engCell(i, e, "rate") : <None />}</td>
      <td className="c-lo">
        <PeopleCell i={i} />
      </td>
    </tr>
  );
});

/**
 * The radar's day (Radar.tsx): what happened at each company, and the one action. `action` is the
 * row's own Unlock company button for a locked company (the lock on its logo steps aside, so the
 * row has one paying control), else Open. Both come from Radar.tsx.
 */
export interface SignalRows {
  /** Company public id -> its lines ("Hired a fractional Finance leader · Finance usually comes before Sales"). */
  lines: Map<string, string[]>;
  /** Company public id -> the note beside each line: "High · Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months". */
  notes?: Map<string, string[]>;
  action: (i: CoInfo) => ReactNode;
}

/**
 * The lines of what happened at a company, one a signal, each with its likelihood (a word, never a
 * percentage) and why now under it.
 */
export function SignalLines({ lines, notes }: { lines: string[]; notes?: string[] }) {
  return (
    <span className="rd-lines">
      {lines.map((l, i) => {
        const note = notes?.[i] ?? "";
        const cut = note.indexOf(" · ");
        const band = cut > 0 ? note.slice(0, cut) : "";
        return (
          <span key={l} className="rd-line-wrap">
            <span className="rd-line" title={l}>
              {l}
            </span>
            {note && (
              <span className="rd-note-line" title={note}>
                {band && <span className={`rd-band rd-band-${band.toLowerCase()}`}>{band}</span>}
                <span className="rd-why-now">{cut > 0 ? note.slice(cut + 3) : note}</span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** The action never opens the record behind it: its own click only. */
const own = (ev: React.SyntheticEvent) => ev.stopPropagation();

const SignalCompanyRow = memo(function SignalCompanyRow({ r, sel, onOpen, lines, notes, action }: { r: Row; sel: boolean; onOpen: (r: Row) => void; lines: string[]; notes?: string[]; action: SignalRows["action"] }) {
  const i = r.i;
  const c = i.c;
  const co = (field: string) => <RowFact t={{ entity: "company", id: c.id, field }} cell={c.cells[field]} cover={coverOf(i, null, field)} own={ownCompany(i)} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} quiet />
      </td>
      <td className="rd-td-what">
        <SignalLines lines={lines} notes={notes} />
      </td>
      <td className="num">{co("employees")}</td>
      <td>{co("hq")}</td>
      <td className="rd-td-act" onClick={own} onKeyDown={own}>
        {action(i)}
      </td>
    </tr>
  );
});

/** The open role a Hiring now row stands for: the newest one still open. */
const openRoleOf = (r: Row): EngagementRec | null => (r.e && isOpenRole(r.e) ? r.e : r.i.engs.find(isOpenRole) ?? null);

/** Hiring now, companies: the open role first, then what tells open roles apart. */
const HiringCompanyRow = memo(function HiringCompanyRow({ r, mine, sel, onOpen }: { r: Row; mine: string | null; sel: boolean; onOpen: (r: Row) => void }) {
  const i = r.i;
  const c = i.c;
  const e = openRoleOf(r);
  const more = i.engs.filter(isOpenRole).length - 1;
  const co = (field: string) => <RowFact t={{ entity: "company", id: c.id, field }} cell={c.cells[field]} cover={coverOf(i, null, field)} own={ownCompany(i)} />;
  const fn = e && shown(e.cells.function);
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} />
      </td>
      <td>
        {e ? (
          <span className="tp-stack">
            {engCell(i, e, "role", { addLabel: "Add role" })}
            <span className="tp-role-line">
              <RoleDate e={e} />
              {more > 0 && <span className="tp-stack-sub num"> · {more} more open</span>}
            </span>
          </span>
        ) : (
          <None />
        )}
      </td>
      <td>{fn ? <span className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}`}>{fn}</span> : e ? engCell(i, e, "function") : <None />}</td>
      <td>{e ? engCell(i, e, "type") : <None />}</td>
      <td className="num">{e ? engCell(i, e, "hours") : <None />}</td>
      <td className="num">{e ? engCell(i, e, "rate") : <None />}</td>
      <td>{co("industry")}</td>
      <td className="num">{co("employees")}</td>
      <td className="num">{co("revenue")}</td>
      <td>{co("hq")}</td>
      <td>
        <PeopleCell i={i} />
      </td>
    </tr>
  );
});

const EngRow = memo(function EngRow({ r, mine, sel, onOpen, hiring }: { r: Row; mine: string | null; sel: boolean; onOpen: (r: Row) => void; hiring: boolean }) {
  const e = r.e as EngagementRec;
  const i = r.i;
  const fnCell = <RowFact t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} render={(v) => <span className={`chip tp-fn${v === mine ? " tp-fn-me" : ""}`}>{v}</span>} />;
  if (hiring)
    return (
      <tr {...rowProps(r, sel, onOpen)}>
        <td className="tp-sticky">
          <CompanyName i={i} following={i.c.following} />
        </td>
        <td>{fnCell}</td>
        <td>{engCell(i, e, "role")}</td>
        <td>{engCell(i, e, "type")}</td>
        <td>
          <RoleDate e={e} />
        </td>
        <td className="num">{engCell(i, e, "hours")}</td>
        <td className="num">{engCell(i, e, "rate")}</td>
        <td>{engCell(i, e, "posting")}</td>
      </tr>
    );
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={i.c.following} />
      </td>
      <td>{fnCell}</td>
      <td>{engCell(i, e, "role")}</td>
      <td>{engCell(i, e, "type")}</td>
      <td>{datesAreStatus(e) ? <RoleDate e={e} /> : engCell(i, e, "status", { render: statusText })}</td>
      <td>
        <HeldBy e={e} cover={coverOf(i, e, "operator")} />
      </td>
      <td>{engCell(i, e, "start")}</td>
      <td>{engCell(i, e, "end")}</td>
      <td className="num">{engCell(i, e, "rate")}</td>
      <td className="num c-lo">{engCell(i, e, "hours")}</td>
      <td>{engCell(i, e, "posting")}</td>
    </tr>
  );
});

/**
 * A person's name and title in one cell. While both are locked: one lock, "Unlock name and title ·
 * 1 credit", that opens the two. Otherwise the name, with the title under it.
 */
function NameAndTitle({ i, e, p }: { i: CoInfo; e: EngagementRec | null | undefined; p: PersonRec }) {
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  if (personBothLocked(p.cells)) return <RowFact t={t("name")} cell={p.cells.name} cover={personCoverOf(i, e, p, "name")} noun={personNoun(p.cells, "name")} />;
  return (
    <span className="tp-stack">
      <RowFact t={t("name")} cell={p.cells.name} cover={personCoverOf(i, e, p, "name")} addLabel="Name" />
      <span className="tp-stack-sub">
        <RowFact t={t("title")} cell={p.cells.title} cover={personCoverOf(i, e, p, "title")} addLabel="Title" noAdd={personUnseen(p.cells) ? ADD_AFTER_NAME : null} />
      </span>
    </span>
  );
}

const PersonRow = memo(function PersonRow({ r, sel, onOpen }: { r: Row; sel: boolean; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const i = r.i;
  // Their LinkedIn, email and phone open after the name and title: quiet locks, and no "+ Add", until then.
  const unseen = personUnseen(p.cells);
  const cellOf = (f: string) => (
    <RowFact t={{ entity: "contact", id: p.id, field: f }} cell={p.cells[f]} cover={personCoverOf(i, r.e, p, f)} noun={personNoun(p.cells, f)} noAdd={unseen && PERSON_NO_ADD.includes(f) ? ADD_AFTER_NAME : null} />
  );
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={i.c.following} />
      </td>
      <td>
        <NameAndTitle i={i} e={r.e} p={p} />
      </td>
      <td>{cellOf("relationship")}</td>
      <td>{cellOf("linkedin")}</td>
      <td>{cellOf("email")}</td>
      <td>{cellOf("phone")}</td>
    </tr>
  );
});

/**
 * Ui.openPage (LOGIC-7), for the "Rate benchmarks" links where rates show. Null outside the
 * app's Ui provider, so the links stay off the screen instead of doing nothing.
 */
export function useOpenPage(): ((p: AppPage) => void) | null {
  const ui = useContext(UiCtx);
  return ui?.openPage ?? null;
}

const AZ: SortKey[] = ["name", "fn", "title", "hq"];

/**
 * What a short column header means, for a click, a tap or the keyboard (a title tooltip never
 * shows on focus or touch). A small "?" after the header opens it.
 */
function HeadTip({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="tp-th-tip"
        aria-label={`What ${label} means`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((x) => !x);
        }}
      >
        <span aria-hidden>?</span>
      </button>
      {open && ref.current && (
        <Anchored anchor={ref.current} onClose={() => setOpen(false)} width={280} className="tp-th-pop" label={label}>
          <p>
            <b>{label}</b>. {tip.replace(/\.?$/, ".")}
          </p>
        </Anchored>
      )}
    </>
  );
}

/** Column headers, in sentence case. `num` right-aligns the column. `tip` says what a short header means. `rates` links to Rate benchmarks. */
const HEAD: Record<string, { label: string; cls?: string; tip?: string; sort?: SortKey; rates?: boolean }[]> = {
  // Held by comes right after Company: at 1440, with the filters open, it is on screen without scrolling.
  companies: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the latest seat. 1 credit shows who it was and the role they held." },
    { label: "Latest seat", cls: "w-seat", sort: "start" },
    { label: "Functions hired", cls: "w-fns", tip: "The functions this company hired a fractional for, 3 at most, then how many more. A dashed chip means none in your function is on file yet." },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp num", sort: "employees" },
    { label: "Revenue", cls: "w-rev num c-lo", sort: "revenue" },
    { label: "HQ", cls: "w-hq c-lo", sort: "hq" },
    { label: "History", cls: "w-fit", tip: "How often this company hires fractionals (not how well it fits your profile). It counts the fractional seats on file, how recent they are and how many functions they cover.", sort: "fit" },
    { label: "Rate", cls: "w-rate num", rates: true },
    { label: "People", cls: "w-ppl c-lo", tip: "The decision maker on file" },
  ],
  // Recently hired: the same columns, with the hire each company matched in place of the latest seat. Held by and Rate are that seat's.
  hiredCompanies: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the recent hire's seat, a possible referral partner. 1 credit shows who it was and the role they held." },
    { label: "Recent hire", cls: "w-seat w-hire", sort: "hired", tip: "The most recent fractional hire that fits the sentence above, and the month it started. The role shows once you can see it." },
    { label: "Functions hired", cls: "w-fns", tip: "The functions this company hired a fractional for, 3 at most, then how many more. A dashed chip means none in your function is on file yet." },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp num", sort: "employees" },
    { label: "Revenue", cls: "w-rev num c-lo", sort: "revenue" },
    { label: "HQ", cls: "w-hq c-lo", sort: "hq" },
    { label: "History", cls: "w-fit", tip: "How often this company hires fractionals (not how well it fits your profile). It counts the fractional seats on file, how recent they are and how many functions they cover.", sort: "fit" },
    { label: "Rate", cls: "w-rate num", rates: true },
    { label: "People", cls: "w-ppl c-lo", tip: "The decision maker on file" },
  ],
  // The radar's day: what happened at each company, two facts, and its one action (Unlock company or Open), fitted to the page.
  signalCompanies: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "What happened", cls: "rd-w-what" },
    { label: "Employees", cls: "w-emp num" },
    { label: "HQ", cls: "w-hq" },
    { label: "", cls: "rd-w-act" },
  ],
  hiringCompanies: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Open role", cls: "w-seat", tip: "The role, and when we first saw it listed" },
    { label: "Function", cls: "w-fn" },
    { label: "Type", cls: "w-type" },
    { label: "Posted hours", cls: "w-hrs num", tip: "Hours a week, as the job posting gives them" },
    { label: "Posted rate", cls: "w-rate num", tip: "The rate the job posting gives" },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp num", sort: "employees" },
    { label: "Revenue", cls: "w-rev num", sort: "revenue" },
    { label: "HQ", cls: "w-hq", sort: "hq" },
    { label: "People", cls: "w-ppl", tip: "The decision maker on file" },
  ],
  engagements: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Function", cls: "w-fn", sort: "fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Status", cls: "w-status" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the seat. 1 credit shows who it was and the role they held." },
    { label: "Start", cls: "w-date", sort: "start" },
    { label: "End", cls: "w-date" },
    { label: "Rate", cls: "w-rate num", rates: true },
    { label: "Hours a week", cls: "w-hrs num c-lo" },
    { label: "Job posting", cls: "w-post" },
  ],
  hiringEngagements: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Function", cls: "w-fn", sort: "fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Listed", cls: "w-listed", tip: "When we first saw the job posting, or the day it was posted" },
    { label: "Posted hours", cls: "w-hrs num", tip: "Hours a week, as the job posting gives them" },
    { label: "Posted rate", cls: "w-rate num", tip: "The rate the job posting gives" },
    { label: "Job posting", cls: "w-post" },
  ],
  people: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Name and title", cls: "w-name", sort: "title", tip: "1 credit shows a person's name and title together. Their LinkedIn, email and phone open after that, 1 credit each." },
    { label: "Relationship", cls: "w-rel", tip: "Their part in hiring the fractional" },
    { label: "LinkedIn", cls: "w-li" },
    { label: "Email", cls: "w-email" },
    { label: "Phone", cls: "w-phone" },
  ],
};

const NO_LINES: string[] = [];

/** Every row is an open role (Hiring now, or the Open now filter): the open-role columns. */
export const allOpenRoles = (rows: Row[]) => rows.length > 0 && rows.every((r) => !!openRoleOf(r));

export function DataTable({
  type,
  rows,
  me,
  selected,
  onOpen,
  newSince,
  tab,
  notMine = false,
  hire = null,
  sort,
  onSort,
  signals = null,
}: {
  type: "companies" | "engagements" | "people";
  rows: Row[];
  me: Me;
  selected: string | null;
  onOpen: (r: Row) => void;
  newSince: string | null;
  /** The view tab. Hiring now gets its own columns. Without it, a list of open roles alone does. */
  tab?: Tab;
  /** The "No Sales seat yet" filter is on, so rows leave out their "No Sales seat yet" chip (Recently hired keeps it: each row says so). */
  notMine?: boolean;
  /** Recently hired is on: company rows lead with the hire they matched. */
  hire?: HireCtx | null;
  /** The sort in use, and how to change it from a column header (headers stay plain text without it). */
  sort?: SortKey;
  onSort?: (s: SortKey) => void;
  /** The radar's day: each company's lines and its one action, in their own columns. */
  signals?: SignalRows | null;
}) {
  const sig = !!signals && type === "companies";
  const hiring = !sig && type !== "people" && (tab ? tab === "hiring" && allOpenRoles(rows) : allOpenRoles(rows));
  const hired = !sig && !!hire && type === "companies" && !hiring;
  const key = sig ? "signalCompanies" : hiring ? (type === "companies" ? "hiringCompanies" : "hiringEngagements") : hired ? "hiredCompanies" : type;
  const openPage = useOpenPage();
  // A header that sorts is a button: name A to Z, everything else highest or newest first.
  const head: ReactNode = HEAD[key].map((h) => {
    const by = onSort && h.sort;
    const on = !!by && sort === h.sort;
    // Names, functions, titles and places go A to Z. Everything else highest or newest first.
    const az = !!h.sort && AZ.includes(h.sort);
    return (
      <th key={h.label || "act"} className={h.cls} scope="col" title={h.tip} aria-sort={on ? (az ? "ascending" : "descending") : undefined}>
        {h.rates && openPage ? (
          // Where rates show, the medians are one click away (LOGIC-7).
          <button type="button" className="tp-th-sort tp-th-link" onClick={() => openPage("rates")} title="See rate benchmarks: medians by function and client revenue">
            {h.label}
            <IconChevron size={12} dir="right" />
            <span className="sr-only">. Open rate benchmarks</span>
          </button>
        ) : by ? (
          <button type="button" className={`tp-th-sort${on ? " on" : ""}`} onClick={() => onSort(by)} title={h.tip ? `${h.tip}. Sort by this column.` : "Sort by this column"}>
            {h.label}
            <IconChevron size={12} dir={az ? "up" : "down"} />
          </button>
        ) : h.label ? (
          h.label
        ) : (
          <span className="sr-only">Unlock or open</span>
        )}
        {h.tip && <HeadTip label={h.label} tip={h.tip} />}
      </th>
    );
  });
  return (
    <table className={`tp-table tp-table-${type}${hiring ? " tp-table-hiring" : ""}${hired ? " tp-table-hired" : ""}${sig ? " rd-table" : ""}`}>
      <thead>
        <tr>{head}</tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          type === "companies" ? (
            sig ? (
              <SignalCompanyRow key={r.key} r={r} sel={selected === r.key} onOpen={onOpen} lines={signals!.lines.get(r.i.c.id) ?? NO_LINES} notes={signals!.notes?.get(r.i.c.id)} action={signals!.action} />
            ) : hiring ? (
              <HiringCompanyRow key={r.key} r={r} mine={me.function} sel={selected === r.key} onOpen={onOpen} />
            ) : (
              <CompanyRow
                key={r.key}
                r={r}
                mine={me.function}
                sel={selected === r.key}
                onOpen={onOpen}
                isNew={!!newSince && !!r.i.c.updatedAt && r.i.c.updatedAt > newSince && r.i.c.following}
                gap={!notMine || hired}
                hire={hired ? hire : null}
              />
            )
          ) : type === "engagements" ? (
            <EngRow key={r.key} r={r} mine={me.function} sel={selected === r.key} onOpen={onOpen} hiring={hiring} />
          ) : (
            <PersonRow key={r.key} r={r} sel={selected === r.key} onOpen={onOpen} />
          ),
        )}
      </tbody>
    </table>
  );
}
