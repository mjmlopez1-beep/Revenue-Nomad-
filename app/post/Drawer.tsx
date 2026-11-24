"use client";

/**
 * The record drawer (440px, right) and its phone twin (full-screen sheet with a sticky
 * action bar). Everything about one company: header, actions, about, how they sell, functions,
 * every seat, people, and the company's own details.
 *
 * One primary action. A locked company has "Unlock company, posting and rate" and nothing else to press until
 * it is unlocked. Any other company has Add to this company, with Unlock all beside it as an
 * outline button, once per record. The solid ember "Hiring now" chip lives here, in the header,
 * and nowhere else.
 *
 * Every fact is a row (FieldRow): its label, its value, and where it came from. On a desktop,
 * Confirm and Report (and Edit on the member's own facts) show on the row's hover and focus.
 * On touch screens a tap on the row opens the fact sheet with "This is right" and "This is
 * wrong", so nothing free sits next to a lock that spends a credit.
 *
 * Focus: the record takes focus when it opens (its title), arrow keys scroll it, Esc closes
 * the form open inside it before the record, and focus goes back to the row on close. On a
 * phone it is modal: Tab stays inside and the page behind is inert.
 *
 * Its sections live in company/sections/ (Record.tsx and the files beside it): the company page
 * (company/CompanyPage.tsx, the new look on wider screens) draws the same ones under its tabs.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Benchmarks } from "@/lib/tableTypes";
import { FOUND_NOTE } from "@/lib/tableFields";
import { CompanyLogo, IconChevron, IconPlus, IconX, LockedName, hrefFor, post, val } from "../ui/shared";
import { fitReason, type CoInfo, type SeatInfo } from "./model";
import { FactCell, Pro, useUi } from "./ui";
import { Fit, HiddenCompany } from "./Tables";
import { CrystalOpen } from "./CrystalOpen";
import { plural, useMedia } from "./hooks";
import { SmartWaysIn } from "./network/SmartPaths"; // [smart ways in]
import { RecordWays } from "./network/Ways";
import { Charge } from "./Charge";
import { PipelineBlock } from "./PipelineBlock";
import { WriteProposal } from "./WriteProposal";
import { Prop } from "../ui/fractions/lazy";
import { LeadsLine } from "./company/sections/Leads";
import { type Contact } from "./company/sections/env";
import { UnlockAll, UnlockCompany, MissingFacts } from "./company/sections/Unlock";
import { YourWayIn, wayInSeatsOf, wayInBuyersOf } from "./company/sections/WayIn";
import { claimLine } from "./company/sections/Seats";
import {
  AboutSection, CapLine, capShows, DetailsSection, FollowButton, FunctionsSection, GtmSection, OpenPosting, PeerSection, PeopleSection, RecordActions, RecordEnvProvider, RecordFoot, SeatsSection, recordEnv, recordPlan, summaryLine,
} from "./company/sections/Record";

// What other files read from here, from before the record's sections moved to company/sections/.
export { LeadsLine, UnlockCompany, MissingFacts, YourWayIn, wayInSeatsOf, wayInBuyersOf, claimLine };
export type { Contact };

export function Drawer({
  i,
  focus,
  onClose,
  onStep,
  pos,
  phone,
  contact,
  crystal,
  benchmarks,
  mySeats,
}: {
  i: CoInfo;
  focus: string | null;
  onClose: () => void;
  onStep: (d: 1 | -1) => void;
  pos: { n: number; of: number } | null;
  phone: boolean;
  /** View.contact. Read from the Ui context too, so either way of passing it works. */
  contact?: Contact | null;
  /**
   * Opened from Crystal Ball (or the Today card) at a company it lists: a locked company opens here
   * as it does there (CrystalOpen: free on Trial and Pro, today's free one on Free). After Free's is
   * used, and anywhere else, the record keeps its own Unlock company.
   */
  crystal?: boolean;
  /** The rate benchmarks (View.benchmarks) and the member's own seats, for "What to charge them" (Charge.tsx). */
  benchmarks?: Benchmarks;
  mySeats?: SeatInfo[];
}) {
  const ui = useUi();
  const c = i.c;
  const fromBall = !!crystal && (ui.me.crystal === "all" || ui.me.crystal === "one");
  const coarse = useMedia("(hover: none) and (pointer: coarse)");
  const touch = phone || coarse;
  // Below 1024px the record is full width (post.css) and covers the table: there it is modal, as on a phone.
  const covers = useMedia("(max-width: 1023px)");
  const modal = phone || covers;
  // Where focus was when the record opened: it goes back there when the record closes.
  const opener = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // On a phone the company name joins the bar once the header has scrolled away.
  const [headGone, setHeadGone] = useState(false);
  const env = recordEnv(i, { touch, phone, contact: contact ?? ui.contact ?? null });

  // A locked company's record opened: counted for Pilot metrics' demand (once a member, company and day; counts only).
  useEffect(() => {
    if (c.hidden && !c.found) void post({ action: { type: "lockedView", companyId: c.id } });
  }, [c.id, c.hidden, c.found]);

  // Where focus goes back to when the record closes: its row, else whatever opened it.
  const last = useRef({ focus, id: c.id, phone });
  last.current = { focus, id: c.id, phone };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const { focus: f, id, phone: p } = last.current;
      setTimeout(() => {
        const a = document.activeElement;
        // On a phone, or where the member put the cursor on purpose (a field, a dialog, a page's own heading after a page change), it stays.
        // Otherwise (Esc or the X, even with the focus wandered off to the sidebar) it goes back to the row that opened the record.
        const kept = !!a && a !== document.body && a.isConnected && (p || !!a.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .tp-modal, .tp-sheet, h1"));
        if (kept) return;
        const row = (f && document.querySelector<HTMLElement>(`[data-row="${f}"]`)) || document.querySelector<HTMLElement>(`[data-row="${id}"]`);
        if (!row && a && a !== document.body && a.isConnected) return;
        const el = row && row.tabIndex >= 0 ? row : opener?.isConnected ? opener : null;
        el?.focus({ preventScroll: p });
      });
    };
  }, []);

  // Opening a record (or stepping to the next): start where it matters, and take focus.
  useEffect(() => {
    const s = scroller.current;
    if (s) {
      // A hidden company opens at its top: the reason it is hidden and its one action come first.
      // A seat or a person opens at its card only when the card starts low on the screen.
      let top = 0;
      const el = focus && !c.hidden ? document.getElementById(`tp-d-${focus}`) : null;
      if (el) {
        const y = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
        if (y > s.clientHeight * 0.6) top = Math.max(0, y - 12);
      }
      s.scrollTo({ top });
    }
    const root = rootRef.current;
    const a = document.activeElement;
    if (root && (!a || a === document.body || !root.contains(a))) {
      const h = root.querySelector<HTMLElement>(".tp-dname") ?? root;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }, [c.id, focus, c.hidden]);

  // A record that covers the page (a phone, or any width under 1024px): what is behind it is out of reach until it closes.
  useEffect(() => {
    if (!modal) return;
    // The page's own parts beside the record (the top bar, the table, the tab bar, whatever the layout nests them in), never another layer.
    const root = rootRef.current;
    const own = root?.parentElement ? [...root.parentElement.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== root && !el.matches("[role='dialog'], [role='alertdialog'], .tp-skip, .toasts")) : [];
    const behind = [...new Set([...own, ...document.querySelectorAll<HTMLElement>(".tp-app > .tp-top, .tp-app > main, .tp-app > .tp-body")])].filter((el) => !el.contains(root));
    behind.forEach((el) => el.setAttribute("inert", ""));
    return () => behind.forEach((el) => el.removeAttribute("inert"));
  }, [modal]);
  // Closed: focus goes back to what opened it (a row, a name), when it is still on the page.
  useEffect(
    () => () => {
      const el = opener.current as HTMLElement | null;
      if (el && el.isConnected && typeof el.focus === "function" && !rootRef.current?.isConnected) requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
    },
    [],
  );

  useEffect(() => {
    const head = headRef.current;
    const s = scroller.current;
    if (!phone || !head || !s || typeof IntersectionObserver === "undefined") return setHeadGone(false);
    const io = new IntersectionObserver(([en]) => setHeadGone(!en.isIntersecting), { root: s, threshold: 0 });
    io.observe(head);
    return () => io.disconnect();
  }, [phone, c.id, c.hidden]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    // Arrow keys scroll the record (they never step to another company from inside it).
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !t.closest("input, textarea, select, [role='listbox']")) {
      e.stopPropagation();
      return;
    }
    // A record that covers the page is modal: Tab stays inside it.
    if (e.key === "Tab" && modal && rootRef.current) {
      const els = [...rootRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !rootRef.current.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const website = val(c.cells.website);
  const linkedin = val(c.cells.linkedin);
  const line = summaryLine(i);
  const { plan, posting, postedRate, hiringHere } = recordPlan(i, focus);
  // The website is stored as its host (a LinkedIn, Google Sites or Notion page keeps its path).
  const site = website?.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  const actions = <RecordActions i={i} focus={focus} fromBall={fromBall} />;
  const capLine = <CapLine i={i} plan={plan} phone={phone} />;
  const capShown = capShows(ui.me, i, plan);
  const followBtn = <FollowButton i={i} />;
  const coName = c.hidden ? "Locked company" : c.name;
  const showCo = !phone || headGone;

  return (
    <RecordEnvProvider env={env}>
      <div
        ref={rootRef}
        className={`${phone ? "tp-rsheet" : "tp-drawer"}${touch ? " tp-touchrows" : ""}`}
        role="dialog"
        aria-modal={modal}
        aria-label={coName}
        onKeyDown={onKeyDown}
      >
        <div className="tp-dbar">
          {phone ? (
            <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Back" onClick={onClose}>
              <IconChevron dir="left" size={18} />
            </button>
          ) : (
            <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Done (Esc)" onClick={onClose}>
              <IconX />
            </button>
          )}
          {pos && (
            <span className="tp-dpos num">
              {pos.n} of {pos.of}
            </span>
          )}
          {/* Which company this is, wherever the record is scrolled (it opens at a seat from the Seats list). */}
          <span className={`tp-dbar-co${showCo ? "" : " off"}`} aria-hidden={!showCo || undefined} title={showCo ? coName : undefined}>
            {showCo && (
              <>
                <span className="tp-dbar-logo">
                  <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain ?? i.domain} hidden={c.hidden} seed={c.id} />
                </span>
                <span className="tp-dbar-name">{c.hidden ? <LockedName seed={c.id} /> : coName}</span>
              </>
            )}
          </span>
          {phone && followBtn}
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Previous in the list" title="Previous in the list (K)" disabled={!!pos && pos.n <= 1} onClick={() => onStep(-1)}>
            <IconChevron dir="up" />
          </button>
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Next in the list" title="Next in the list (J)" disabled={!!pos && pos.n >= pos.of} onClick={() => onStep(1)}>
            <IconChevron dir="down" />
          </button>
        </div>
        <div className="tp-dscroll" ref={scroller}>
          {c.hidden ? (
            <div className="tp-dhead" ref={headRef}>
              <HiddenCompany i={i} big bare />
              {!phone && followBtn}
            </div>
          ) : (
            <div className="tp-dhead" ref={headRef}>
              <CompanyLogo name={c.name} domain={c.iconDomain ?? i.domain} seed={c.id} size="lg" />
              <div className="tp-dhead-t">
                <h2 className="tp-dname" title={c.name} tabIndex={-1}>
                  {c.name}
                </h2>
                <div className="tp-dlinks">
                  {website ? (
                    <a className="tp-link mono" href={hrefFor("company", "website", website)!} target="_blank" rel="noreferrer">
                      {site}
                    </a>
                  ) : (
                    <FactCell t={{ entity: "company", id: c.id, field: "website" }} cell={c.cells.website} addLabel="Website" />
                  )}
                  {linkedin ? (
                    <a className="tp-link" href={hrefFor("company", "linkedin", linkedin)!} target="_blank" rel="noreferrer">
                      LinkedIn
                    </a>
                  ) : (
                    <FactCell t={{ entity: "company", id: c.id, field: "linkedin" }} cell={c.cells.linkedin} addLabel="LinkedIn" />
                  )}
                </div>
              </div>
              {!phone && followBtn}
            </div>
          )}
          {line.length ? <div className="tp-dline num">{line.join(" · ")}</div> : <MissingFacts i={i} title={false} skip={["website", "linkedin"]} />}
          <LeadsLine c={c} />
          <div className="tp-dfit">
            <Fit i={i} big hot />
            <span className="tp-dfit-r num">{fitReason(i)}</span>
          </div>
          {c.hidden && (
            <p className="tp-hidden-note tp-hidden-pic">
              {/* The locked prompt's picture: the door, closed. The only art in the record. */}
              <Prop name="doorClosed" height={44} className="tp-hidden-art" />
              {hiringHere
                ? `Unlock to see the company's name, website and job postings${postedRate ? ", with the posted rate" : ""}. Its open roles are free to read. Who held each seat shows free after that.`
                : "Unlock to see the company's name, website and job postings. Who held each seat shows free after that."}
            </p>
          )}
          {c.found && (
            <p className="tp-found-dnote">
              {FOUND_NOTE}. It stays named for you once you add what you know, claim a seat or unlock something here. Otherwise it goes back to locked when you close it.
            </p>
          )}
          {!phone && actions}
          {!phone && capLine}
          {/* A phone's bar leads with the job posting once the company is unlocked: Unlock all moves up here. */}
          {phone && posting && plan.items.length > 0 && (
            <div className="tp-dactions">
              <UnlockAll plan={plan} />
            </div>
          )}
          {c.hidden && (
            <div className="pro-under">
              <Pro where="hidden_company" variant="line" />
            </div>
          )}
          {/* Your pipeline at this company (PipelineBlock.tsx): the member's own deal here, as Merlin moved it. Nothing when there is none. */}
          {!c.hidden && <PipelineBlock i={i} />}
          {/* About, right after the member's own deal and before the ways in: a hidden company's About shows too, without its name, web address and links (the server cuts them). */}
          <AboutSection i={i} />
          {/* Your ways in (network/Ways.tsx): the member's plan, or the route Merlin recommends, the others folded; Smart ways in (SmartPaths.tsx) while there is no route. After About and above Your way in. */}
          <RecordWays i={i} fallback={<SmartWaysIn i={i} />} />
          {/* [ux ws3] Your way in: who held the seats here and the next step with each, after About and before seats and people. */}
          <YourWayIn i={i} seats={wayInSeatsOf(i, ui.me.function)} />
          {/* What fractionals in the member's function were paid at companies this size (the Rate benchmarks' own figures and rules). */}
          <Charge i={i} benchmarks={benchmarks} seats={mySeats} />
          <WriteProposal i={i} />
          {/* Not my fit? Pass it to a peer, or team up on it (PeerSheets.tsx). After Write a proposal, before How they sell. */}
          <PeerSection i={i} crystal={crystal} />
          <GtmSection i={i} />
          <FunctionsSection i={i} />
          <SeatsSection i={i} focus={focus} />
          <PeopleSection key={c.id} i={i} />
          <DetailsSection i={i} />
          <RecordFoot i={i} />
        </div>
        {phone && (
          <div className={`tp-rsheet-bar${capShown ? " has-cap" : ""}`}>
            {capLine}
            {/* The balance stays on screen while the sheet covers the top bar. */}
            <span className={`tp-rsheet-bal${ui.me.credits <= 3 ? " low" : ""}`} aria-label={plural(ui.me.credits, "credit")}>
              <b className="num">{ui.me.credits}</b>
              <span>{ui.me.credits === 1 ? "credit" : "credits"}</span>
            </span>
            {c.hidden ? (
              // One action while the name is hidden, as on desktop. The facts unlock after it.
              fromBall ? <CrystalOpen id={c.id} name={c.shownName} bar /> : <UnlockCompany id={c.id} rate={postedRate} roles={hiringHere} bar />
            ) : posting ? (
              // Unlocked and hiring: the job posting first, Add beside it (Unlock all is in the record, under its header).
              <>
                <OpenPosting i={i} focus={focus} bar />
                <button type="button" className="btn tp-rsheet-add" aria-label="Add to this company" onClick={() => ui.openAdd({ companyId: c.id })}>
                  <IconPlus size={14} /> Add
                </button>
              </>
            ) : (
              <>
                {plan.items.length > 0 ? <UnlockAll plan={plan} bar /> : <span className="tp-rsheet-none">Nothing locked here</span>}
                <button type="button" className="btn btn-volt" onClick={() => ui.openAdd({ companyId: c.id })}>
                  <IconPlus size={14} /> Add
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </RecordEnvProvider>
  );
}

