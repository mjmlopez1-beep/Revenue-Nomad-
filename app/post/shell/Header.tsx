"use client";

/**
 * The new look's header, the same on every page (the mockups' top row): the breadcrumb or the
 * page's title on the left; on the right the bell (Bell.tsx), the credits pill (it opens the same
 * credits popover as before) and the volt "Add what you know". Search left the header (BUILD_PLAN
 * part 2): "/" opens the table's search for now, Find's lookup once Find is built; a page that
 * still needs the old search (the table, until the workbench) gets the field in the header.
 *
 * Phones: the mark, the title, the bell and the credits; Add what you know stays the table's
 * floating button. The header also hosts the help sheet, the Undo toast and the spend question
 * (TopBar.tsx TopHosts), as the top bar did.
 */
import type { ReactNode } from "react";
import { IconPlus } from "../../ui/shared";
import { ownClick, Mark } from "./Rail";
import "./shell.css";

export interface Crumb {
  label: string;
  /** A link back (a real address) and what a plain click does. */
  href?: string;
  go?: () => void;
}

/** Bell, credits and Add, for the header and for a page that draws its own header (AppCtx.headerActions). */
export function HeaderActions({ bell, credits, onAdd, phone }: { bell: ReactNode; credits: ReactNode; onAdd: () => void; phone?: boolean }) {
  return (
    <div className="ws-hacts">
      {bell}
      {credits}
      {!phone && (
        <button type="button" className="ws-add" onClick={onAdd} title="Add a seat, a rate or a hiring contact (A)">
          <IconPlus size={16} /> Add what you know
        </button>
      )}
    </div>
  );
}

export function ShellHeader({ crumbs, title, search, actions, phone, onHome, hosts }: { crumbs: Crumb[]; title: string; search?: ReactNode; actions: ReactNode; phone: boolean; onHome: () => void; hosts: ReactNode }) {
  return (
    <header className={`ws-head${phone ? " ws-head-phone" : ""}`}>
      {phone && (
        <a
          href="/"
          className="ws-head-mark"
          aria-label="Merlin home"
          onClick={(e) => {
            if (!ownClick(e)) return;
            e.preventDefault();
            onHome();
          }}
        >
          <Mark size={22} />
        </a>
      )}
      <nav aria-label="Breadcrumb" className="ws-crumbs">
        {!phone &&
          crumbs.map((c) => (
            <span key={c.label} className="ws-crumb">
              {c.href ? (
                <a
                  href={c.href}
                  onClick={(e) => {
                    if (!c.go || !ownClick(e)) return;
                    e.preventDefault();
                    c.go();
                  }}
                >
                  {c.label}
                </a>
              ) : (
                <span>{c.label}</span>
              )}
              <span className="ws-crumb-sep" aria-hidden>
                /
              </span>
            </span>
          ))}
        <strong className="ws-crumb-now" aria-current="page">
          {title}
        </strong>
      </nav>
      {search && <div className="ws-head-search">{search}</div>}
      {actions}
      {hosts}
    </header>
  );
}
