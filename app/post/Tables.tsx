"use client";

/**
 * The three tables: companies (default), engagements and people. 44px rows, sticky header and
 * company column. Cells are 13px in the text face; numbers are right-aligned with tabular
 * figures; a long name, role or seat holder truncates with its full text in the tooltip.
 */
import { memo, type ReactNode } from "react";
import type { EngagementRec, Me } from "@/lib/tableTypes";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconStar, fmtMonth } from "../ui/shared";
import { fitReason, fitTier, isOpenSeat, recentSeats, shown, type CoInfo, type Row } from "./model";
import { FactCell, YourSeat, earnNote, useUi } from "./ui";
import { RoleDate, datesAreStatus, statusText } from "./RoleDate";

/**
 * How fractional friendly a company is, as a plain label. Hover for the reason and the score.
 * In rows and cards every tier is an outline chip, an open role included. `hot` is the record
 * header of a company with an open role: the one solid ember chip on the screen.
 */
export function Fit({ i, big, hot }: { i: CoInfo; big?: boolean; hot?: boolean }) {
  const f = i.c.friendly;
  const { label, cls } = fitTier({ ...f, recent: recentSeats(i) }, i.c.engagements.length);
  const ember = hot && f.open > 0;
  return (
    <span className={`chip tp-tier ${ember ? "chip-ember" : cls}${big ? " tp-tier-big" : ""}`} title={`${fitReason(i).replace(/\.$/, "")}. Fit score ${f.score} of 100.`}>
      {label}
    </span>
  );
}

/**
 * GTM functions hired fractionally (the member's own first), then functions only member stories
 * mention (muted), then "No Sales yet" when they hired other functions but not the member's.
 */
export function FnChips({ i, mine, max = 3 }: { i: CoInfo; mine: string | null; max?: number }) {
  const fr = i.c.friendly.functions;
  const ordered = mine && fr.includes(mine) ? [mine, ...fr.filter((f) => f !== mine)] : fr;
  const all = [...ordered.map((f) => ({ f, story: false })), ...i.fns.filter((f) => !fr.includes(f)).map((f) => ({ f, story: true }))];
  const showMine = !!mine && fr.length > 0 && !fr.includes(mine);
  const rest = all.slice(max).map((x) => x.f);
  return (
    <span className="tp-fns">
      {all.slice(0, max).map(({ f, story }) => (
        <span key={f} className={`chip tp-fn${story ? " tp-fn-story" : f === mine ? " tp-fn-me" : ""}`} title={story ? "A member story mentions it. No seat is on file yet." : f === mine ? "Your function" : undefined}>
          {f}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="tp-more num" title={rest.join(", ")}>
          +{rest.length}
        </span>
      )}
      {showMine && <NoSeatYet fn={mine} />}
    </span>
  );
}

/** They hired fractionals in other functions, not the member's yet. Dashed, like anything missing. */
export function NoSeatYet({ fn }: { fn: string }) {
  return (
    <span className="chip chip-outline tp-fn-gap" title={`They hired fractionals in other GTM functions. No ${fn} seat is on file yet.`}>
      No {fn} yet
    </span>
  );
}

/** Who held the seat. An open role has nobody yet, so it never asks for a name. */
export function HeldBy({ e }: { e: EngagementRec }) {
  if (e.yours) return <YourSeat id={e.id} />;
  if (isOpenSeat(e) && e.cells.operator?.s === "empty")
    return (
      <span className="tp-open" title="Nobody holds this seat yet">
        Open seat
      </span>
    );
  return <FactCell t={{ entity: "engagement", id: e.id, field: "operator" }} cell={e.cells.operator} />;
}

/** The one unlock for a hidden company: its name, website, LinkedIn and About. */
export function UnlockCompanyCell({ i }: { i: CoInfo }) {
  return <FactCell t={{ entity: "company", id: i.c.id, field: "identity" }} cell={{ s: "locked", ver: 0 }} />;
}

/**
 * A company with an open role the member hasn't unlocked: a lock where the logo would be, and
 * what is free to know (industry, size, region) where the domain would be.
 *   table   the lock is the button. Point at it, or tab to it, and it opens into
 *           "Unlock company · 1 credit". The name and the line under it still open the record,
 *           so a click meant for the record never spends a credit.
 *   phone   the card lists the unlock with its other facts (see Cards.tsx).
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

/** The latest seat: the role, and under it when it started (or since when the role is open). */
function SeatCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  const e = i.latest;
  if (!e) return <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
  const start = shown(e.cells.start);
  return (
    <span className="tp-stack">
      <FactCell t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} addLabel="Add role" />
      {e.opened ? <RoleDate e={e} /> : start && <span className="tp-stack-sub num">{fmtMonth(start)}</span>}
    </span>
  );
}

function FunctionsCell({ i, mine }: { i: CoInfo; mine: string | null }) {
  const ui = useUi();
  if (i.fns.length) return <FnChips i={i} mine={mine} />;
  const e = i.engs.find((x) => x.cells.function?.s === "empty");
  if (e) return <FactCell t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} />;
  return <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
}

/** The decision maker on file (else the first person): title, then the name, then how many more. */
function PeopleCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  if (!i.people.length) return <AddPill label="Add a person" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "person" })} />;
  const dm = i.people.find(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker") ?? i.people[0];
  const title = dm.p.cells.title?.s === "value" ? dm.p.cells.title.v : "Title not on file";
  const more = i.people.length - 1;
  return (
    <span className="tp-stack">
      <span className="tp-ppl-t" title={title}>
        {title}
      </span>
      <span className="tp-ppl-who">
        <FactCell t={{ entity: "contact", id: dm.p.id, field: "name" }} cell={dm.p.cells.name} />
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

const CompanyRow = memo(function CompanyRow({ r, mine, sel, onOpen, isNew }: { r: Row; mine: string | null; sel: boolean; onOpen: (r: Row) => void; isNew: boolean }) {
  const i = r.i;
  const c = i.c;
  const e = i.latest;
  const co = (field: string) => <FactCell t={{ entity: "company", id: c.id, field }} cell={c.cells[field]} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} />
        {isNew && <span className="tp-new" title="New since your last visit" />}
      </td>
      <td>
        <SeatCell i={i} />
      </td>
      <td>{e ? <HeldBy e={e} /> : <None />}</td>
      <td className="num">{e ? <FactCell t={{ entity: "engagement", id: e.id, field: "rate" }} cell={e.cells.rate} /> : <None />}</td>
      <td>
        <Fit i={i} />
      </td>
      <td>
        <FunctionsCell i={i} mine={mine} />
      </td>
      <td>
        <PeopleCell i={i} />
      </td>
      <td>{co("industry")}</td>
      <td className="num">{co("employees")}</td>
      <td className="num">{co("revenue")}</td>
      <td>{co("hq")}</td>
    </tr>
  );
});

const EngRow = memo(function EngRow({ r, mine, sel, onOpen }: { r: Row; mine: string | null; sel: boolean; onOpen: (r: Row) => void }) {
  const e = r.e as EngagementRec;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const cellOf = (f: string) => <FactCell t={t(f)} cell={e.cells[f]} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={r.i} following={r.i.c.following} />
      </td>
      <td>
        <FactCell t={t("function")} cell={e.cells.function} render={(v) => <span className={`chip tp-fn${v === mine ? " tp-fn-me" : ""}`}>{v}</span>} />
      </td>
      <td>{cellOf("role")}</td>
      <td>{cellOf("type")}</td>
      <td>{datesAreStatus(e) ? <RoleDate e={e} /> : <FactCell t={t("status")} cell={e.cells.status} render={statusText} />}</td>
      <td>
        <HeldBy e={e} />
      </td>
      <td>{cellOf("start")}</td>
      <td>{cellOf("end")}</td>
      <td className="num">{cellOf("rate")}</td>
      <td className="num">{cellOf("hours")}</td>
      <td>{cellOf("posting")}</td>
      <td>
        <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>
      </td>
    </tr>
  );
});

const PersonRow = memo(function PersonRow({ r, sel, onOpen }: { r: Row; sel: boolean; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  const cellOf = (f: string) => <FactCell t={t(f)} cell={p.cells[f]} />;
  return (
    <tr {...rowProps(r, sel, onOpen)}>
      <td className="tp-sticky">
        <CompanyName i={r.i} following={r.i.c.following} />
      </td>
      <td>{cellOf("title")}</td>
      <td>{cellOf("relationship")}</td>
      <td>{cellOf("name")}</td>
      <td>{cellOf("email")}</td>
      <td>{cellOf("linkedin")}</td>
      <td>{cellOf("phone")}</td>
      <td>
        <span className="tp-src">{SOURCE_LABEL[p.source] ?? p.source}</span>
      </td>
    </tr>
  );
});

/** Column headers, in sentence case. `num` right-aligns the column. `tip` says what a short header means. */
const HEAD: Record<string, { label: string; cls?: string; tip?: string }[]> = {
  companies: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Latest seat", cls: "w-seat" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the seat" },
    { label: "Rate", cls: "w-rate num" },
    { label: "Fit", cls: "w-fit", tip: "How often they hire fractionals" },
    { label: "Functions hired", cls: "w-fns" },
    { label: "People", cls: "w-ppl", tip: "The decision maker on file" },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp num" },
    { label: "Revenue", cls: "w-rev num" },
    { label: "HQ", cls: "w-hq" },
  ],
  engagements: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Function", cls: "w-fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Status", cls: "w-status" },
    { label: "Held by", cls: "w-op", tip: "The fractional who held the seat" },
    { label: "Start", cls: "w-date" },
    { label: "End", cls: "w-date" },
    { label: "Rate", cls: "w-rate num" },
    { label: "Hours a week", cls: "w-hrs num" },
    { label: "Job posting", cls: "w-post" },
    { label: "Source", cls: "w-src", tip: "Where this seat came from" },
  ],
  people: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Title", cls: "w-title" },
    { label: "Relationship", cls: "w-rel", tip: "Their part in hiring the fractional" },
    { label: "Name", cls: "w-name" },
    { label: "Email", cls: "w-email" },
    { label: "LinkedIn", cls: "w-li" },
    { label: "Phone", cls: "w-phone" },
    { label: "Source", cls: "w-src", tip: "Where this person came from" },
  ],
};

export function DataTable({
  type,
  rows,
  me,
  selected,
  onOpen,
  newSince,
}: {
  type: "companies" | "engagements" | "people";
  rows: Row[];
  me: Me;
  selected: string | null;
  onOpen: (r: Row) => void;
  newSince: string | null;
}) {
  const head: ReactNode = HEAD[type].map((h) => (
    <th key={h.label} className={h.cls} scope="col" title={h.tip}>
      {h.label}
    </th>
  ));
  return (
    <table className={`tp-table tp-table-${type}`}>
      <thead>
        <tr>{head}</tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          type === "companies" ? (
            <CompanyRow key={r.key} r={r} mine={me.function} sel={selected === r.key} onOpen={onOpen} isNew={!!newSince && !!r.i.c.updatedAt && r.i.c.updatedAt > newSince && r.i.c.following} />
          ) : type === "engagements" ? (
            <EngRow key={r.key} r={r} mine={me.function} sel={selected === r.key} onOpen={onOpen} />
          ) : (
            <PersonRow key={r.key} r={r} sel={selected === r.key} onOpen={onOpen} />
          ),
        )}
      </tbody>
    </table>
  );
}
