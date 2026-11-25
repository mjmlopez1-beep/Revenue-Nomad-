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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPlus, IconSearch, IconX } from "../../ui/shared";
import { ownClick, Mark } from "./Rail";
import { useUi3Header } from "../ui3/head";
import "./shell.css";

export interface Crumb {
  label: string;
  /** A link back (a real address) and what a plain click does. */
  href?: string;
  go?: () => void;
}

/** Bell, credits and Add, for the header and for a page that draws its own header (AppCtx.headerActions). */
export function HeaderActions({ bell, credits, onAdd, phone, hideAdd }: { bell: ReactNode; credits: ReactNode; onAdd: () => void; phone?: boolean; /** Not on this page (the one-screen Proposals keeps to the proposal). */ hideAdd?: boolean }) {
  return (
    <div className="ws-hacts">
      {bell}
      {credits}
      {!phone && !hideAdd && (
        <button type="button" className="ws-add" onClick={onAdd} title="Add a seat, a rate or a hiring contact (A)">
          <IconPlus size={16} /> Add what you know
        </button>
      )}
    </div>
  );
}

export function ShellHeader({
  crumbs,
  title,
  search,
  actions,
  phone,
  onHome,
  hosts,
  searching,
  onCloseSearch,
}: {
  crumbs: Crumb[];
  title: string;
  /** The search field: in the row on wider screens; on phones behind a search button (the old top bar's). */
  search?: ReactNode;
  actions: ReactNode;
  phone: boolean;
  onHome: () => void;
  hosts: ReactNode;
  /** Phones: a search is typed (the field stays open). */
  searching?: boolean;
  /** Phones: the search closed (clear it). */
  onCloseSearch?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The new design (RN_UI3): its own top bar with this page's breadcrumb (on phones, the shell's forest bar).
  const ui3 = useUi3Header();
  const shown = phone && !!search && (open || !!searching);
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open]);
  if (ui3) return <>{ui3.top({ crumbs, title, actions, hosts })}</>;
  if (shown)
    return (
      <header className="ws-head ws-head-phone">
        <div className="ws-head-search ws-head-search-phone" ref={box}>
          {search}
        </div>
        <button type="button" className="ws-hbtn" aria-label="Close search" onClick={() => (setOpen(false), onCloseSearch?.())}>
          <IconX size={18} />
        </button>
        {hosts}
      </header>
    );
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
      {search && !phone && <div className="ws-head-search">{search}</div>}
      {search && phone && (
        <button type="button" className="ws-hbtn" aria-label="Search" onClick={() => setOpen(true)}>
          <IconSearch size={18} />
        </button>
      )}
      {actions}
      {hosts}
    </header>
  );
}
