"use client";

/**
 * How each workbench column draws a row: the cells of the old tables (Tables.tsx), with their
 * locks and prices, so a column here spends exactly as the same cell does there (one purchase per
 * click, a lock another control buys is quiet). Keyed by the ids in columns.ts.
 */
import type { ReactNode } from "react";
import type { Row } from "../model";
import { coverOf, personCoverOf, personNoun, personUnseen, ADD_AFTER_NAME, PERSON_NO_ADD } from "../model";
import { CompanyName, engCell, Fit, FunctionsCell, HeldBy, NameAndTitle, None, PeopleCell, RowFact, SeatCell, ownCompany } from "../Tables";
import { RoleDate, datesAreStatus, statusText } from "../RoleDate";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { deciderOf } from "./columns";
import { closestOf } from "./closest";
import { useUi } from "../ui";
import { openPlans } from "../Billing";

/**
 * Closest evidence (Evidence Bank, Close): the member's own case most like this company, its match
 * word and why (closest.ts, filled by useClosest). Off Close: the Close pill, which opens the plans.
 */
export function ClosestCell({ id }: { id: string }) {
  const close = useUi().me.plan?.canClose ?? true;
  if (!close)
    return (
      <button type="button" className="wb-pill-gate wb-pill-btn" onClick={(e) => (e.stopPropagation(), openPlans("proposals"))} title="Evidence Bank is on the Close plan">
        Close
      </button>
    );
  const r = closestOf(id);
  if (!r) return <None title="None of your ready Evidence Bank cases is matched to this company." label="No close case" />;
  const why = r.same.slice(0, 2).join(" · ") || r.diff[0] || "";
  return (
    <span className="wb-ev" data-label={r.label}>
      <span className="wb-ev-t">{r.title || "Your case"}</span>
      <span className="wb-ev-why">
        <strong>{r.label}</strong>
        {why ? ` · ${why}` : ""}
      </span>
    </span>
  );
}

const coFact = (r: Row, field: string) => <RowFact t={{ entity: "company", id: r.i.c.id, field }} cell={r.i.c.cells[field]} cover={coverOf(r.i, null, field)} own={ownCompany(r.i)} />;

function DeciderEmail({ r }: { r: Row }) {
  const d = deciderOf(r.i);
  if (!d) return <None title="Nobody who decides is on file here yet." />;
  const p = d.p;
  return (
    <RowFact
      t={{ entity: "contact", id: p.id, field: "email" }}
      cell={p.cells.email}
      cover={personCoverOf(r.i, d.e, p, "email")}
      noAdd={personUnseen(p.cells) ? ADD_AFTER_NAME : null}
    />
  );
}

/** A company row's cell for a column. `mine`: the member's function. */
export function companyCell(id: string, r: Row, mine: string | null): ReactNode {
  const i = r.i;
  const e = i.latest;
  switch (id) {
    case "company":
      return <CompanyName i={i} following={i.c.following} tagged={false} />;
    case "heldBy":
      return e ? <HeldBy e={e} cover={coverOf(i, e, "operator")} /> : <None />;
    case "seat":
      return <SeatCell i={i} />;
    case "fns":
      return <FunctionsCell i={i} mine={mine} gap />;
    case "history":
      return <Fit i={i} />;
    case "rate":
      return e ? engCell(i, e, "rate") : <None />;
    case "decider":
      return <PeopleCell i={i} />;
    case "email":
      return <DeciderEmail r={r} />;
    case "evidence":
      return <ClosestCell id={i.c.id} />;
    default:
      return coFact(r, id);
  }
}

/** A seat row's cell. */
export function seatCell(id: string, r: Row, mine: string | null): ReactNode {
  const i = r.i;
  const e = r.e;
  if (id === "company") return <CompanyName i={i} following={i.c.following} />;
  if (!e) return <None />;
  switch (id) {
    case "function":
      return <RowFact t={{ entity: "engagement", id: e.id, field: "function" }} cell={e.cells.function} render={(v) => <span className={`chip tp-fn${v === mine ? " tp-fn-me" : ""}`}>{v}</span>} />;
    case "status":
      return datesAreStatus(e) ? <RoleDate e={e} /> : engCell(i, e, "status", { render: statusText });
    case "operator":
      return <HeldBy e={e} cover={coverOf(i, e, "operator")} />;
    case "source":
      return <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>;
    default:
      return engCell(i, e, id);
  }
}

/** A person row's cell. */
export function personCell(id: string, r: Row): ReactNode {
  const i = r.i;
  const p = r.p;
  if (id === "company") return <CompanyName i={i} following={i.c.following} />;
  if (!p) return <None />;
  if (id === "name") return <NameAndTitle i={i} e={r.e} p={p} />;
  // The member's own columns (how you know them, last touch, pipeline) are the People page's to fill.
  if (id === "know" || id === "last" || id === "pipe") return <None />;
  const unseen = personUnseen(p.cells);
  return (
    <RowFact
      t={{ entity: "contact", id: p.id, field: id }}
      cell={p.cells[id]}
      cover={personCoverOf(i, r.e, p, id)}
      noun={personNoun(p.cells, id)}
      noAdd={unseen && PERSON_NO_ADD.includes(id) ? ADD_AFTER_NAME : null}
      render={id === "linkedin" ? profileLink : undefined}
    />
  );
}

/** A public profile, once open: a link, never called a source. */
export const profileLink = (v: string) =>
  /^https?:\/\//i.test(v) ? (
    <a className="wb-profile" href={v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      Public profile
    </a>
  ) : (
    v
  );
