"use client";

/**
 * Phone card list: one card per company, engagement or person. A label on the left, the fact
 * on the right, one tap each (44px rows). A locked fact reads "Unlock · 1 credit" in plain
 * pine text, so a card with three of them stays calm.
 */
import { memo } from "react";
import type { Me } from "@/lib/tableTypes";
import { AddPill, CompanyLogo, IconStar, fmtMonth, val } from "../ui/shared";
import type { Row } from "./model";
import { FactCell, YourSeat, earnNote, useUi } from "./ui";
import { Fit, FnChips, HeldBy, HiddenCompany, UnlockCompanyCell } from "./Tables";
import { RoleDate } from "./RoleDate";

function Head({ r, right, bare }: { r: Row; right?: React.ReactNode; bare?: boolean }) {
  const i = r.i;
  if (i.c.hidden)
    return (
      <div className="tp-pcard-top">
        <HiddenCompany i={i} bare={bare} />
        {right}
      </div>
    );
  return (
    <div className="tp-pcard-top">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <div className="tp-pcard-name">
        <span className="tp-co-name" title={i.c.name}>
          <span className="tp-co-name-t">{i.c.name}</span>
          {i.c.following && (
            <span className="tp-co-star" title="You follow this company">
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

/** A hidden company's one unlock, listed first with the card's other facts. */
function CompanyFact({ r }: { r: Row }) {
  if (!r.i.c.hidden) return null;
  return (
    <Fact label="Company">
      <UnlockCompanyCell i={r.i} />
    </Fact>
  );
}

const CompanyCard = memo(function CompanyCard({ r, me, onOpen }: { r: Row; me: Me; onOpen: (r: Row) => void }) {
  const ui = useUi();
  const i = r.i;
  const c = i.c;
  const e = i.latest;
  const emp = val(c.cells.employees);
  const line = [val(c.cells.industry), emp && `${emp} employees`, val(c.cells.hq)].filter(Boolean);
  const miss = c.facts.missing;
  // The Held by fact below already reads Your seat when the latest seat is theirs.
  const heldShown = !!e && e.cells.rate?.s === "empty" && e.cells.operator?.s !== "empty";
  const own = heldShown && e?.yours ? undefined : i.engs.find((x) => x.yours);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      {/* The line under the header already gives a hidden company's industry, size and region. */}
      <Head r={r} right={<Fit i={i} />} bare />
      <div className="tp-pcard-line">{line.length ? line.join(" · ") : <span className="tp-faint">No industry, size or HQ on file yet</span>}</div>
      {(i.fns.length > 0 || own) && (
        <div className="tp-pcard-fns">
          {own && <YourSeat id={own.id} />}
          <FnChips i={i} mine={me.function} max={own ? 2 : 3} />
        </div>
      )}
      {e?.opened && (
        <div className="tp-pcard-role">
          <RoleDate e={e} />
        </div>
      )}
      <div className="tp-pfacts">
        <CompanyFact r={r} />
        {e ? (
          <>
            <Fact label="Role">
              <FactCell t={{ entity: "engagement", id: e.id, field: "role" }} cell={e.cells.role} />
            </Fact>
            {c.hidden && e.cells.rate?.s === "empty" ? null : e.cells.rate?.s !== "empty" || e.cells.operator?.s === "empty" ? (
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
            <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: c.id, mode: "engagement" })} />
          </Fact>
        )}
      </div>
      {/* Facts at a hidden company can't be added until it is unlocked, so the card doesn't offer them. */}
      {miss > 0 && !c.hidden && (
        <div className="tp-pcard-miss">
          <span className="num">{miss}</span> {miss === 1 ? "thing" : "things"} still missing here.{earnNote(me).capped ? "" : miss === 1 ? " Add it and earn a credit." : " Add one and earn a credit."}
        </div>
      )}
    </article>
  );
});

const EngCard = memo(function EngCard({ r, me, onOpen }: { r: Row; me: Me; onOpen: (r: Row) => void }) {
  const e = r.e!;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const fn = val(e.cells.function);
  const type = val(e.cells.type);
  const start = val(e.cells.start);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} />
      <div className="tp-pcard-fns">
        {fn ? <span className={`chip tp-fn${fn === me.function ? " tp-fn-me" : ""}`}>{fn}</span> : <FactCell t={t("function")} cell={e.cells.function} addLabel="Function" />}
        {type ? <span className="chip tp-fn">{type}</span> : null}
        {start && !e.opened && <span className="num tp-pcard-when">{fmtMonth(start)}</span>}
        <RoleDate e={e} />
      </div>
      <div className="tp-pfacts">
        <CompanyFact r={r} />
        <Fact label="Role">
          <FactCell t={t("role")} cell={e.cells.role} />
        </Fact>
        <Fact label="Held by">
          <HeldBy e={e} />
        </Fact>
        {!(r.i.c.hidden && e.cells.rate?.s === "empty") && (
          <Fact label="Rate">
            <FactCell t={t("rate")} cell={e.cells.rate} />
          </Fact>
        )}
      </div>
    </article>
  );
});

const PersonCard = memo(function PersonCard({ r, onOpen }: { r: Row; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  const title = val(p.cells.title);
  const rel = val(p.cells.relationship);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} />
      <div className="tp-pcard-fns">
        {title ? <span className="tp-pcard-title">{title}</span> : <FactCell t={t("title")} cell={p.cells.title} addLabel="Title" />}
        {rel ? <span className="chip tp-fn">{rel}</span> : <FactCell t={t("relationship")} cell={p.cells.relationship} addLabel="Relationship" />}
      </div>
      <div className="tp-pfacts">
        <CompanyFact r={r} />
        <Fact label="Name">
          <FactCell t={t("name")} cell={p.cells.name} />
        </Fact>
        {!(r.i.c.hidden && p.cells.email?.s === "empty") && (
          <Fact label="Email">
            <FactCell t={t("email")} cell={p.cells.email} />
          </Fact>
        )}
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
          <EngCard key={r.key} r={r} me={me} onOpen={onOpen} />
        ) : (
          <PersonCard key={r.key} r={r} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}
