"use client";

/**
 * The three tables: companies (default), engagements and people. 44px rows, sticky header and
 * company column. Cells are 13px in the text face; numbers are right-aligned with tabular
 * figures; a long name, role or seat holder truncates with its full text in the tooltip.
 *
 * Each table leads with what a member can read (the company, its latest seat, the functions it
 * hired, its industry, size, revenue and HQ), then what they can unlock. On Hiring now every
 * row is an open role, so the tables switch to the columns that tell open roles apart.
 *
 * Credits are never spent by a stray click. A row has at most one paying control per purchase:
 *   - a hidden company's row spends only through the lock on its logo (Unlock company, which also
 *     opens the role and the posting of its open roles). Its other locks are quiet and open the record.
 *   - an open role's role and posting are one purchase: the posting is quiet while the role is locked.
 * A lock's label never takes clicks (post.css), so only the lock's own box spends.
 */
import { memo, useContext, useRef, type ReactNode } from "react";
import type { Cell, EngagementRec, Me } from "@/lib/tableTypes";
import { AddPill, CompanyLogo, IconChevron, IconLock, IconStar, fmtMonth } from "../ui/shared";
import {
  COMPANY_GTM, NOT_YET_ON_OPEN_ROLE, coverOf, fitReason, fitTier, isOpenRole, isUnheldOpenRole, lastClosedPosting, namedFn, recentSeats, shown, type CoInfo, type FactRef, type Row, type SortKey, type Tab,
} from "./model";
import { FactCell, UiCtx, YourSeat, earnNote, useUi, type Ui } from "./ui";
import { RoleDate, datesAreStatus, statusText } from "./RoleDate";

/**
 * How fractional friendly a company is, as a plain label. Hover for the reason and the score.
 * In rows and cards every tier is an outline chip, an open role included. `hot` is the record
 * header of a company with an open role: the one solid ember chip on the screen.
 */
export function Fit({ i, big, hot }: { i: CoInfo; big?: boolean; hot?: boolean }) {
  const f = i.c.friendly;
  const { label, cls } = fitTier({ ...f, recent: recentSeats(i) }, i.c.engagements.length, !!lastClosedPosting(i));
  const ember = hot && f.open > 0;
  return (
    <span className={`chip tp-tier ${ember ? "chip-ember" : cls}${big ? " tp-tier-big" : ""}`} title={`${fitReason(i).replace(/\.$/, "")}. Fit score ${f.score} of 100.`}>
      {label}
    </span>
  );
}

/**
 * GTM functions at a company: the ones hired fractionally (the member's own first), then the
 * ones with an open role and no hire yet ("Sales · hiring"), then the ones only member stories
 * mention (muted). "No Sales yet" follows when they hired other functions and nothing on file
 * names the member's, so a row never says "Sales" and "No Sales yet" together. `gap` false
 * leaves it out (the "No Sales seat yet" filter already says it).
 */
export function FnChips({ i, mine, max = 3, gap = true }: { i: CoInfo; mine: string | null; max?: number; gap?: boolean }) {
  const { hired, hiring, story } = i.fnState;
  const ordered = mine && hired.includes(mine) ? [mine, ...hired.filter((f) => f !== mine)] : hired;
  const all = [
    ...ordered.map((f) => ({ f, kind: "hired" as const })),
    ...hiring.map((f) => ({ f, kind: "hiring" as const })),
    ...story.map((f) => ({ f, kind: "story" as const })),
  ];
  const showGap = gap && !!mine && hired.length > 0 && !i.fns.includes(mine);
  const rest = all.slice(max).map((x) => x.f);
  return (
    <span className="tp-fns">
      {all.slice(0, max).map(({ f, kind }) => (
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
          +{rest.length}
        </span>
      )}
      {showGap && <NoSeatYet fn={mine} />}
    </span>
  );
}

/** Why a function is muted: only member stories mention it, or a posting for it came down with nobody named. */
const postingOnly = (i: CoInfo, fn: string) => {
  const seats = i.engs.filter((e) => shown(e.cells.function) === fn);
  return seats.length > 0 && seats.every((e) => e.source === "Demand scan");
};
export function storyTitle(i: CoInfo, fn: string) {
  if (postingOnly(i, fn)) return `A ${fn} job posting came down. Nobody is on file in the seat.`;
  return `A member story mentions ${fn}. No fractional ${fn} seat is on file yet.`;
}
/** The same, short, for a screen reader after the chip's name. */
const storyWhy = (i: CoInfo, fn: string) => (postingOnly(i, fn) ? "from a posting that came down" : "from a member story");

/** They hired fractionals in other functions, not the member's yet. Dashed, like anything missing. */
export function NoSeatYet({ fn }: { fn: string }) {
  const named = namedFn(fn);
  return (
    <span className="chip chip-outline tp-fn-gap" title={`They hired fractionals in other GTM functions. ${named ? `No ${named} seat` : "No seat in your function"} is on file yet.`}>
      {named ? `No ${named} yet` : "None in your function yet"}
    </span>
  );
}

/** Who held the seat. An open role has nobody yet, so it never asks for a name. */
export function HeldBy({ e, cover }: { e: EngagementRec; cover?: string | null }) {
  if (e.yours) return <YourSeat id={e.id} />;
  if (isOpenRole(e) && e.cells.operator?.s === "empty")
    return (
      <span className="tp-open" title="Nobody holds this seat yet">
        Open seat
      </span>
    );
  return <RowFact t={{ entity: "engagement", id: e.id, field: "operator" }} cell={e.cells.operator} cover={cover} />;
}

/** The one unlock for a hidden company: its name, website, LinkedIn and About, and the role and posting of its open roles. */
export function UnlockCompanyCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  // Today's unlocks are used up: the hidden logo already shows the lock, and its record says when.
  if (ui.me.unlocksLeft === 0 && ui.me.credits > 0) return null;
  return <FactCell t={{ entity: "company", id: i.c.id, field: "identity" }} cell={{ s: "locked", ver: 0 }} />;
}

/* ---------- facts in a row ---------- */

/** Company answers whose credit counts toward the 5 a day (Me.sellEarnLeft). */
const SELL_FIELDS = new Set(["industry", "employees", "revenue", ...COMPANY_GTM]);
/** The member added this company or holds a seat here, so its answers are not held to the 5 a day. */
export const ownCompany = (i: CoInfo) => !!i.c.added || i.engs.some((e) => e.yours);

/** A locked fact that another control on the row buys, or the record: a quiet lock, never a button. */
function Covered({ title }: { title: string }) {
  return (
    <span className="tp-cell tp-covered" title={title}>
      <IconLock />
      <span className="lock-mask" aria-hidden />
      <span className="sr-only">Locked. {title}</span>
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
 * A fact in a list row or card. It is FactCell, plus three rules only lists need: a lock another
 * control buys is quiet (`cover`), a lock past today's unlock limit says "Unlocks again
 * tomorrow", and a company answer past the 5 that earn today drops its "+1".
 */
export function RowFact({
  t,
  cell,
  render,
  addLabel,
  cover,
  own,
}: {
  t: FactRef;
  cell: Cell | undefined;
  render?: (v: string) => ReactNode;
  addLabel?: string;
  cover?: string | null;
  /** A company the member added or holds a seat at: its answers always earn (no 5 a day limit). */
  own?: boolean;
}) {
  const ui = useUi();
  const ref = useRef<HTMLSpanElement>(null);
  if (cell?.s === "locked") {
    if (cover) return <Covered title={cover} />;
    if (ui.me.unlocksLeft === 0 && ui.me.credits > 0) return <LockWait />;
  }
  if (cell?.s === "empty" && t.entity === "company" && !own && SELL_FIELDS.has(t.field) && ui.me.sellEarnLeft === 0 && !ui.isHidden(t.id)) {
    return (
      <span className="tp-cell" data-cell={`${t.id}.${t.field}`} ref={ref} title="Only 5 answers like this earn a credit each day. You can still add it.">
        <AddPill label={addLabel} earn={false} onAdd={() => ref.current && ui.edit(ref.current, t)} />
      </span>
    );
  }
  return <FactCell t={t} cell={cell} render={render} addLabel={addLabel} />;
}

/**
 * A company with an open role the member hasn't unlocked: a lock where the logo would be, and
 * what is free to know (industry, size, region) where the domain would be.
 *   table   the lock is the button, and only its own 28px box spends. Point at it, or tab to
 *           it, and its label reads "Unlock company · 1 credit". The name and the line under it
 *           open the record, so a click meant for the record never spends a credit.
 *   phone   the card has no unlock button: it opens the record (see Cards.tsx).
 *   big     the record's header. Its own Unlock company button sits below.
 * `bare` leaves out the industry, size and region line where the same facts are printed right under it.
 */
export function HiddenCompany({ i, big, bare }: { i: CoInfo; big?: boolean; bare?: boolean }) {
  const ui = useUi();
  const teaser = !bare && <span className="tp-co-dom">{i.teaser || "Hiring a fractional now"}</span>;
  if (big)
    return (
      <span className="tp-co tp-co-hidden big">
        <CompanyLogo name="" domain={null} hidden size="lg" />
        <span className="tp-co-text">
          <h2 className="tp-dname">Hidden company</h2>
          {teaser}
        </span>
      </span>
    );
  const table = ui.layout !== "phone";
  return (
    <span className={`tp-co tp-co-hidden${table ? " in-table" : ""}`}>
      <CompanyLogo name="" domain={null} hidden />
      <span className="tp-co-text">
        <span className="tp-co-name">
          <span className="tp-hidden-name" title="This company has an open role, so its name is hidden until you unlock it.">
            Hidden company
          </span>
        </span>
        {teaser}
        {table && <UnlockCompanyCell i={i} />}
      </span>
    </span>
  );
}

function CompanyName({ i, following }: { i: CoInfo; following?: boolean }) {
  if (i.c.hidden) return <HiddenCompany i={i} />;
  return (
    <span className="tp-co">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <span className="tp-co-text">
        <span className="tp-co-name" title={i.c.name}>
          <span className="tp-co-name-t">{i.c.name}</span>
          {following && (
            <span className="tp-co-star" title="You follow this company">
              <IconStar size={11} filled />
            </span>
          )}
        </span>
        {i.domain && (
          <span className="tp-co-dom mono" title={i.domain}>
            {i.domain}
          </span>
        )}
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

/** The latest seat: the role, and under it when it started (or since when the role is open). */
function SeatCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  const e = i.latest;
  if (!e) return <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
  const start = shown(e.cells.start);
  return (
    <span className="tp-stack">
      <RowFact t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} addLabel="Add role" cover={coverOf(i, e, "role")} />
      {e.opened ? <RoleDate e={e} /> : start && <span className="tp-stack-sub num">{fmtMonth(start)}</span>}
    </span>
  );
}

function FunctionsCell({ i, mine, gap }: { i: CoInfo; mine: string | null; gap: boolean }) {
  const ui = useUi();
  if (i.fns.length) return <FnChips i={i} mine={mine} gap={gap} />;
  const e = i.engs.find((x) => x.cells.function?.s === "empty");
  if (e) return <RowFact t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} />;
  return <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
}

/** The decision maker on file (else the first person): title, then the name, then how many more. */
function PeopleCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  if (!i.people.length) {
    if (i.c.hidden) return <None title="Unlock the company first, then you can add who hired here." />;
    return <AddPill label="Add a person" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "person" })} />;
  }
  const dm = i.people.find(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker") ?? i.people[0];
  const title = dm.p.cells.title?.s === "value" ? dm.p.cells.title.v : "Title not on file";
  const more = i.people.length - 1;
  return (
    <span className="tp-stack">
      <span className="tp-ppl-t" title={title}>
        {title}
      </span>
      <span className="tp-ppl-who">
        <RowFact t={{ entity: "contact", id: dm.p.id, field: "name" }} cell={dm.p.cells.name} cover={coverOf(i, dm.e, "name")} />
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

/** A fact of a seat in a row: quiet when another control buys it, a dash when an open role can't have it yet. */
function engCell(i: CoInfo, e: EngagementRec, field: string, opts: { render?: (v: string) => ReactNode; addLabel?: string } = {}) {
  if (NOT_YET_ON_OPEN_ROLE.includes(field) && isUnheldOpenRole(e) && e.cells[field]?.s === "empty") return <None title={NOT_YET} />;
  return <RowFact t={{ entity: "engagement", id: e.id, field }} cell={e.cells[field]} cover={coverOf(i, e, field)} {...opts} />;
}

const CompanyRow = memo(function CompanyRow({ r, mine, sel, onOpen, isNew, gap }: { r: Row; mine: string | null; sel: boolean; onOpen: (r: Row) => void; isNew: boolean; gap: boolean }) {
  const i = r.i;
  const c = i.c;
  const e = i.latest;
  const co = (field: string) => <RowFact t={{ entity: "company", id: c.id, field }} cell={c.cells[field]} cover={coverOf(i, null, field)} own={ownCompany(i)} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} />
        {isNew && (
          <span className="tp-new" title="New since your last visit">
            <span className="sr-only">New since your last visit</span>
          </span>
        )}
      </td>
      <td>
        <SeatCell i={i} />
      </td>
      <td>
        <FunctionsCell i={i} mine={mine} gap={gap} />
      </td>
      <td>{co("industry")}</td>
      <td className="num">{co("employees")}</td>
      <td className="num">{co("revenue")}</td>
      <td>{co("hq")}</td>
      <td>
        <Fit i={i} />
      </td>
      <td>{e ? <HeldBy e={e} cover={coverOf(i, e, "operator")} /> : <None />}</td>
      <td className="num">{e ? engCell(i, e, "rate") : <None />}</td>
      <td>
        <PeopleCell i={i} />
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
      <td className="num">{engCell(i, e, "hours")}</td>
      <td>{engCell(i, e, "posting")}</td>
    </tr>
  );
});

const PersonRow = memo(function PersonRow({ r, sel, onOpen }: { r: Row; sel: boolean; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const i = r.i;
  const cellOf = (f: string) => <RowFact t={{ entity: "contact", id: p.id, field: f }} cell={p.cells[f]} cover={coverOf(i, r.e, f)} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={i.c.following} />
      </td>
      <td>{cellOf("title")}</td>
      <td>{cellOf("relationship")}</td>
      <td>{cellOf("name")}</td>
      <td>{cellOf("linkedin")}</td>
      <td>{cellOf("email")}</td>
      <td>{cellOf("phone")}</td>
    </tr>
  );
});

/** A page of the app the shell can open (Rate benchmarks from where rates show). */
export type AppPage = "rates" | "credits" | "seats" | "metrics";
/**
 * Ui.openPage, when the shell offers it (LOGIC-7). Null until then, so the links that use it
 * stay off the screen instead of doing nothing.
 */
export function useOpenPage(): ((p: AppPage) => void) | null {
  const ui = useContext(UiCtx) as (Ui & { openPage?: (p: AppPage) => void }) | null;
  return ui?.openPage ?? null;
}

/** Column headers, in sentence case. `num` right-aligns the column. `tip` says what a short header means. `rates` links to Rate benchmarks. */
const HEAD: Record<string, { label: string; cls?: string; tip?: string; sort?: SortKey; rates?: boolean }[]> = {
  companies: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Latest seat", cls: "w-seat", sort: "start" },
    { label: "Functions hired", cls: "w-fns" },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp num", sort: "employees" },
    { label: "Revenue", cls: "w-rev num", sort: "revenue" },
    { label: "HQ", cls: "w-hq" },
    { label: "Fit", cls: "w-fit", tip: "How often they hire fractionals", sort: "fit" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the seat" },
    { label: "Rate", cls: "w-rate num", rates: true },
    { label: "People", cls: "w-ppl", tip: "The decision maker on file" },
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
    { label: "HQ", cls: "w-hq" },
    { label: "People", cls: "w-ppl", tip: "The decision maker on file" },
  ],
  engagements: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Function", cls: "w-fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Status", cls: "w-status" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the seat" },
    { label: "Start", cls: "w-date", sort: "start" },
    { label: "End", cls: "w-date" },
    { label: "Rate", cls: "w-rate num", rates: true },
    { label: "Hours a week", cls: "w-hrs num" },
    { label: "Job posting", cls: "w-post" },
  ],
  hiringEngagements: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Function", cls: "w-fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Listed", cls: "w-listed", tip: "When we first saw the job posting, or the day it was posted" },
    { label: "Posted hours", cls: "w-hrs num", tip: "Hours a week, as the job posting gives them" },
    { label: "Posted rate", cls: "w-rate num", tip: "The rate the job posting gives" },
    { label: "Job posting", cls: "w-post" },
  ],
  people: [
    { label: "Company", cls: "tp-sticky w-co", sort: "name" },
    { label: "Title", cls: "w-title" },
    { label: "Relationship", cls: "w-rel", tip: "Their part in hiring the fractional" },
    { label: "Name", cls: "w-name" },
    { label: "LinkedIn", cls: "w-li" },
    { label: "Email", cls: "w-email" },
    { label: "Phone", cls: "w-phone" },
  ],
};

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
  sort,
  onSort,
}: {
  type: "companies" | "engagements" | "people";
  rows: Row[];
  me: Me;
  selected: string | null;
  onOpen: (r: Row) => void;
  newSince: string | null;
  /** The view tab. Hiring now gets its own columns. Without it, a list of open roles alone does. */
  tab?: Tab;
  /** The "No Sales seat yet" filter is on, so rows leave out their "No Sales yet" chip. */
  notMine?: boolean;
  /** The sort in use, and how to change it from a column header (headers stay plain text without it). */
  sort?: SortKey;
  onSort?: (s: SortKey) => void;
}) {
  const hiring = type !== "people" && (tab ? tab === "hiring" && allOpenRoles(rows) : allOpenRoles(rows));
  const key = hiring ? (type === "companies" ? "hiringCompanies" : "hiringEngagements") : type;
  const openPage = useOpenPage();
  // A header that sorts is a button: name A to Z, everything else highest or newest first.
  const head: ReactNode = HEAD[key].map((h) => {
    const by = onSort && h.sort;
    const on = !!by && sort === h.sort;
    return (
      <th key={h.label} className={h.cls} scope="col" title={h.tip} aria-sort={on ? (h.sort === "name" ? "ascending" : "descending") : undefined}>
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
            <IconChevron size={12} dir={h.sort === "name" ? "up" : "down"} />
          </button>
        ) : (
          h.label
        )}
      </th>
    );
  });
  return (
    <table className={`tp-table tp-table-${type}${hiring ? " tp-table-hiring" : ""}`}>
      <thead>
        <tr>{head}</tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          type === "companies" ? (
            hiring ? (
              <HiringCompanyRow key={r.key} r={r} mine={me.function} sel={selected === r.key} onOpen={onOpen} />
            ) : (
              <CompanyRow
                key={r.key}
                r={r}
                mine={me.function}
                sel={selected === r.key}
                onOpen={onOpen}
                isNew={!!newSince && !!r.i.c.updatedAt && r.i.c.updatedAt > newSince && r.i.c.following}
                gap={!notMine}
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
