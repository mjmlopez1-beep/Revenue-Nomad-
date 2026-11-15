"use client";

/** Phone card list: one card per company, engagement or person. Two key facts per card, one tap each. */
import { memo } from "react";
import type { Me } from "@/lib/tableTypes";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconStar, fmtMonth, val } from "../ui/shared";
import type { Row } from "./model";
import { FactCell, earnNote, useUi } from "./ui";
import { Fit, FnChips, HeldBy } from "./Tables";

function Head({ r, right }: { r: Row; right?: React.ReactNode }) {
  const i = r.i;
  return (
    <div className="tp-pcard-top">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <div className="tp-pcard-name">
        <span className="tp-co-name">
          {i.c.name}
          {i.c.following && (
            <span className="tp-co-star" title="Following">
              <IconStar size={11} filled />
            </span>
          )}
        </span>
        {i.domain && <span className="tp-co-dom mono">{i.domain}</span>}
      </div>
      {right}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tp-pfact">
      <span className="tp-pfact-l">{label}</span>
      {children}
    </div>
  );
}

const CompanyCard = memo(function CompanyCard({ r, me, onOpen }: { r: Row; me: Me; onOpen: (r: Row) => void }) {
  const ui = useUi();
  const i = r.i;
  const c = i.c;
  const e = i.latest;
  const line = ["industry", "employees", "hq"].map((k) => val(c.cells[k])).filter(Boolean);
  const room = Math.max(0, me.earnCap - me.earned24h);
  const miss = c.facts.missing;
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} right={<Fit i={i} />} />
      <div className="tp-pcard-line">{line.length ? line.join(" · ") : <span className="tp-faint">Industry, size and HQ not on file</span>}</div>
      {i.fns.length > 0 && (
        <div className="tp-pcard-fns">
          <FnChips i={i} mine={me.function} max={3} />
        </div>
      )}
      <div className="tp-pfacts">
        {e ? (
          <>
            <Fact label="Role">
              <FactCell t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} />
            </Fact>
            {e.cells.rate?.s !== "empty" || e.cells.operator?.s === "empty" ? (
              <Fact label="Rate">
                <FactCell t={{ entity: "engagement", id: e.id, field: "rate" }} cell={e.cells.rate} />
              </Fact>
            ) : (
              <Fact label="Held by">
                <HeldBy e={e} />
              </Fact>
            )}
          </>
        ) : (
          <Fact label="Seat">
            <AddPill label="Add seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: c.id, mode: "engagement" })} />
          </Fact>
        )}
      </div>
      {miss > 0 && (
        <div className="tp-pcard-miss">
          {miss} fact{miss > 1 ? "s" : ""} missing{room && !earnNote(me).capped ? `, earn ${Math.min(miss, room)}` : ""}
        </div>
      )}
    </article>
  );
});

const EngCard = memo(function EngCard({ r, onOpen }: { r: Row; onOpen: (r: Row) => void }) {
  const e = r.e!;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const fn = val(e.cells.function);
  const type = val(e.cells.type);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} right={<span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>} />
      <div className="tp-pcard-fns">
        {fn ? <span className="chip tp-fn">{fn}</span> : <FactCell t={t("function")} cell={e.cells.function} addLabel="Function" />}
        {type ? <span className="chip">{type}</span> : null}
        {val(e.cells.start) && <span className="mono tp-small muted">{fmtMonth(val(e.cells.start)!)}</span>}
      </div>
      <div className="tp-pfacts">
        <Fact label="Role">
          <FactCell t={t("role")} cell={e.cells.role} />
        </Fact>
        <Fact label="Held by">
          <HeldBy e={e} />
        </Fact>
        <Fact label="Rate">
          <FactCell t={t("rate")} cell={e.cells.rate} />
        </Fact>
      </div>
    </article>
  );
});

const PersonCard = memo(function PersonCard({ r, onOpen }: { r: Row; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} />
      <div className="tp-pcard-fns">
        <FactCell t={t("title")} cell={p.cells.title} addLabel="Title" />
        <FactCell t={t("relationship")} cell={p.cells.relationship} render={(v) => <span className="chip">{v}</span>} addLabel="Relationship" />
      </div>
      <div className="tp-pfacts">
        <Fact label="Name">
          <FactCell t={t("name")} cell={p.cells.name} />
        </Fact>
        <Fact label="Email">
          <FactCell t={t("email")} cell={p.cells.email} />
        </Fact>
      </div>
    </article>
  );
});

export function CardList({ type, rows, me, onOpen }: { type: "companies" | "engagements" | "people"; rows: Row[]; me: Me; onOpen: (r: Row) => void }) {
  return (
    <div className="tp-cards">
      {rows.map((r) =>
        type === "companies" ? (
          <CompanyCard key={r.key} r={r} me={me} onOpen={onOpen} />
        ) : type === "engagements" ? (
          <EngCard key={r.key} r={r} onOpen={onOpen} />
        ) : (
          <PersonCard key={r.key} r={r} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}
