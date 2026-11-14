"use client";

/** The three tables: companies (default), engagements and people. 44px rows, sticky header and company column. */
import { memo, type ReactNode } from "react";
import type { EngagementRec, Me } from "@/lib/tableTypes";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconStar } from "../ui/shared";
import { type CoInfo, type Row } from "./model";
import { FactCell, useUi } from "./ui";

export function Fit({ i, big }: { i: CoInfo; big?: boolean }) {
  const { score, tier } = i.c.friendly;
  const segs = Math.ceil(score / 20);
  return (
    <span className={`tp-fit${big ? " tp-fit-big" : ""}`} title={`Fit ${score} of 100`}>
      <span className="mono tp-fit-n">{score}</span>
      <span className={`tp-segs t-${(tier ?? "none").toLowerCase()}`} aria-hidden>
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} className={k < segs ? "on" : ""} />
        ))}
      </span>
      {tier && <span className="tp-fit-t">{tier}</span>}
    </span>
  );
}

export function FnChips({ i, me, max = 3 }: { i: CoInfo; me: Me; max?: number }) {
  const mine = me.function;
  const fns = mine && i.fns.includes(mine) ? [mine, ...i.fns.filter((f) => f !== mine)] : i.fns;
  const showMine = !!mine && i.fns.length > 0 && !i.fns.includes(mine);
  return (
    <span className="tp-fns">
      {fns.slice(0, max).map((f) => (
        <span key={f} className="chip tp-fn">
          {f}
        </span>
      ))}
      {fns.length > max && <span className="tp-more mono">+{fns.length - max}</span>}
      {showMine && (
        <span className="chip tp-fn-mine" title={`No ${mine} seat on file here yet. They hired other GTM functions fractionally.`}>
          {mine}?
        </span>
      )}
    </span>
  );
}

function CompanyName({ i, following }: { i: CoInfo; following?: boolean }) {
  return (
    <span className="tp-co">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <span className="tp-co-text">
        <span className="tp-co-name">
          {i.c.name}
          {following && (
            <span className="tp-co-star" title="Following">
              <IconStar size={11} filled />
            </span>
          )}
        </span>
        {i.domain && <span className="tp-co-dom mono">{i.domain}</span>}
      </span>
    </span>
  );
}

const Faint = ({ children = "0" }: { children?: ReactNode }) => <span className="tp-faint mono">{children}</span>;

function SeatCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  const e = i.latest;
  if (!e) return <AddPill label="Add seat" onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
  const fn = e.cells.function;
  return (
    <span className="tp-seat">
      {fn?.s === "value" && <span className="tp-seat-fn">{fn.v}</span>}
      <FactCell t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} addLabel="Add role" />
    </span>
  );
}

function FunctionsCell({ i, me }: { i: CoInfo; me: Me }) {
  const ui = useUi();
  if (i.fns.length) return <FnChips i={i} me={me} />;
  const e = i.engs.find((x) => x.cells.function?.s === "empty");
  if (e) return <FactCell t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} />;
  return <AddPill label="Add seat" onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "engagement" })} />;
}

function PeopleCell({ i }: { i: CoInfo }) {
  const ui = useUi();
  if (!i.people.length) return <AddPill label="Add person" onAdd={() => ui.openAdd({ companyId: i.c.id, mode: "person" })} />;
  const dm = i.people.find(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker") ?? i.people[0];
  const title = dm.p.cells.title?.s === "value" ? dm.p.cells.title.v : "Person";
  return (
    <span className="tp-ppl">
      <span className="mono tp-ppl-n">{i.people.length}</span>
      <span className="tp-ppl-t">{title}</span>
      <FactCell t={{ entity: "contact", id: dm.p.id, field: "name" }} cell={dm.p.cells.name} />
    </span>
  );
}

const CompanyRow = memo(function CompanyRow({ r, me, sel, onOpen, isNew }: { r: Row; me: Me; sel: boolean; onOpen: (r: Row) => void; isNew: boolean }) {
  const i = r.i;
  const c = i.c;
  const e = i.latest;
  return (
    <tr className={sel ? "sel" : ""} onClick={() => onOpen(r)} onKeyDown={(ev) => ev.key === "Enter" && ev.target === ev.currentTarget && onOpen(r)} tabIndex={0} data-row={r.key}>
      <td className="tp-sticky">
        <CompanyName i={i} following={c.following} />
        {isNew && <span className="tp-new" title="New facts since your last visit" />}
      </td>
      <td>
        <Fit i={i} />
      </td>
      <td>
        <FunctionsCell i={i} me={me} />
      </td>
      <td className="num">{c.friendly.open ? <span className="chip chip-ember tp-open">Hiring <span className="mono">{c.friendly.open}</span></span> : <Faint />}</td>
      <td>
        <SeatCell i={i} />
      </td>
      <td>{e ? <FactCell t={{ entity: "engagement", id: e.id, field: "operator" }} cell={e.cells.operator} /> : <Faint>·</Faint>}</td>
      <td>{e ? <FactCell t={{ entity: "engagement", id: e.id, field: "rate" }} cell={e.cells.rate} /> : <Faint>·</Faint>}</td>
      <td>
        <PeopleCell i={i} />
      </td>
      <td>
        <FactCell t={{ entity: "company", id: c.id, field: "industry" }} cell={c.cells.industry} />
      </td>
      <td>
        <FactCell t={{ entity: "company", id: c.id, field: "employees" }} cell={c.cells.employees} />
      </td>
      <td>
        <FactCell t={{ entity: "company", id: c.id, field: "revenue" }} cell={c.cells.revenue} />
      </td>
      <td>
        <FactCell t={{ entity: "company", id: c.id, field: "hq" }} cell={c.cells.hq} />
      </td>
    </tr>
  );
});

const EngRow = memo(function EngRow({ r, sel, onOpen }: { r: Row; sel: boolean; onOpen: (r: Row) => void }) {
  const e = r.e as EngagementRec;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const cellOf = (f: string) => <FactCell t={t(f)} cell={e.cells[f]} />;
  return (
    <tr className={sel ? "sel" : ""} onClick={() => onOpen(r)} onKeyDown={(ev) => ev.key === "Enter" && ev.target === ev.currentTarget && onOpen(r)} tabIndex={0} data-row={r.key}>
      <td className="tp-sticky">
        <CompanyName i={r.i} following={r.i.c.following} />
      </td>
      <td>
        <FactCell t={t("function")} cell={e.cells.function} render={(v) => <span className="chip tp-fn">{v}</span>} />
      </td>
      <td>{cellOf("role")}</td>
      <td>{cellOf("type")}</td>
      <td>
        <FactCell t={t("status")} cell={e.cells.status} render={(v) => <span className={`tp-status s-${v.split(" ")[0].toLowerCase()}`}>{v}</span>} />
      </td>
      <td>{cellOf("operator")}</td>
      <td>{cellOf("start")}</td>
      <td>{cellOf("end")}</td>
      <td>{cellOf("rate")}</td>
      <td>{cellOf("hours")}</td>
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
    <tr className={sel ? "sel" : ""} onClick={() => onOpen(r)} onKeyDown={(ev) => ev.key === "Enter" && ev.target === ev.currentTarget && onOpen(r)} tabIndex={0} data-row={r.key}>
      <td className="tp-sticky">
        <CompanyName i={r.i} following={r.i.c.following} />
      </td>
      <td>{cellOf("title")}</td>
      <td>
        <FactCell t={t("relationship")} cell={p.cells.relationship} render={(v) => <span className="chip">{v}</span>} />
      </td>
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

const HEAD: Record<string, { label: string; cls?: string }[]> = {
  companies: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Fit", cls: "w-fit" },
    { label: "Functions hired", cls: "w-fns" },
    { label: "Open roles", cls: "num w-open" },
    { label: "Latest seat", cls: "w-seat" },
    { label: "Fractional", cls: "w-op" },
    { label: "Rate", cls: "w-rate" },
    { label: "People", cls: "w-ppl" },
    { label: "Industry", cls: "w-ind" },
    { label: "Employees", cls: "w-emp" },
    { label: "Revenue", cls: "w-rev" },
    { label: "HQ", cls: "w-hq" },
  ],
  engagements: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Function", cls: "w-fn" },
    { label: "Role", cls: "w-role" },
    { label: "Type", cls: "w-type" },
    { label: "Status", cls: "w-status" },
    { label: "Fractional", cls: "w-op" },
    { label: "Start", cls: "w-date" },
    { label: "End", cls: "w-date" },
    { label: "Rate", cls: "w-rate" },
    { label: "Hrs/wk", cls: "w-hrs" },
    { label: "Posting", cls: "w-post" },
    { label: "Source", cls: "w-src" },
  ],
  people: [
    { label: "Company", cls: "tp-sticky w-co" },
    { label: "Title", cls: "w-title" },
    { label: "Relationship", cls: "w-rel" },
    { label: "Name", cls: "w-name" },
    { label: "Email", cls: "w-email" },
    { label: "LinkedIn", cls: "w-li" },
    { label: "Phone", cls: "w-phone" },
    { label: "Source", cls: "w-src" },
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
  return (
    <table className={`tp-table tp-table-${type}`}>
      <thead>
        <tr>
          {HEAD[type].map((h) => (
            <th key={h.label} className={h.cls} scope="col">
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          type === "companies" ? (
            <CompanyRow key={r.key} r={r} me={me} sel={selected === r.key} onOpen={onOpen} isNew={!!newSince && !!r.i.c.updatedAt && r.i.c.updatedAt > newSince && r.i.c.following} />
          ) : type === "engagements" ? (
            <EngRow key={r.key} r={r} sel={selected === r.key} onOpen={onOpen} />
          ) : (
            <PersonRow key={r.key} r={r} sel={selected === r.key} onOpen={onOpen} />
          ),
        )}
      </tbody>
    </table>
  );
}
