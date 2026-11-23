"use client";

/**
 * "Write a proposal" on a company record: opens Proposals (Proposals.tsx) with this company
 * picked, to choose a template. Small on purpose: the record's own sections are other builders'.
 *
 * It also keeps what Proposals reads once when it opens, since the page's own code arrives after
 * the table has rewritten the address: the company picked here, and ?pr= (a proposal to open, from
 * the connector's edit link).
 */
import { IconPencil } from "../ui/shared";
import type { CoInfo } from "./model";
import { useUi } from "./ui";
import "./proposals.css";

const START = typeof window !== "undefined" ? window.location.search : "";
let startUsed = false;
let want: string | null = null;

/**
 * The proposal the address opened with (?p=proposals&pr=ID), until the page has opened it
 * (startDone): the page can mount twice while the table loads.
 */
export function startProposal(): string | null {
  const q = new URLSearchParams(startUsed ? "" : START);
  return q.get("p") === "proposals" ? q.get("pr") : null;
}
export const startDone = () => {
  startUsed = true;
};
/** The company "Write a proposal" was pressed on, once. */
export const takeWantCompany = () => {
  const c = want;
  want = null;
  return c;
};

/** Open Proposals with a proposal started for this company (its public id), as "Write a proposal" does. */
export function proposalFor(ui: { openPage: (p: "proposals") => void }, companyId: string) {
  want = companyId;
  ui.openPage("proposals");
}

export function WriteProposal({ i }: { i: CoInfo }) {
  const ui = useUi();
  return (
    <div className="tp-dsec pp-write">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          want = i.c.id;
          ui.openPage("proposals");
        }}
      >
        <IconPencil /> Write a proposal
      </button>
      <span className="pp-write-s">From templates that won, sent for signature from Merlin.</span>
    </div>
  );
}
