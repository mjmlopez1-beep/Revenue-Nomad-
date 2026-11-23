"use client";

/**
 * "Recently hired": the sentence over the table that finds companies which hired a fractional in
 * a function lately.
 *
 *   Companies [in my profile ▾] that hired a fractional [Finance ▾] [in the last 6 months ▾]
 *   [and have no fractional Sales yet]
 *
 * Each bracket is a control. The first is the Ideal Fractional Profile pill (on or off, or set it
 * up). The function picker lists every function with a hire on file, with how many rows each
 * one gives (one tap picks one; the filters pick several). The window is 3, 6, 12 or 24 months,
 * or any time (lib/hired.ts). The last part is the "No fractional Sales yet" switch for the
 * member's own function. The list sorts by the most recent hire (model.ts), and each row says who
 * was hired and when (Tables.tsx, Cards.tsx). The filter keys are Filters.hiredFn and .hiredWithin,
 * so the sentence lives in the address and in saved views.
 *
 * On a phone the sentence folds to one line once it has done its job, so the first company is on
 * the first screen: "Finance hires · 6 months · in my profile · no Sales yet  Change". It folds
 * after a pick (or Done), and starts folded when the view opened from a link or a saved view
 * (TradingPost decides). Tapping the line opens the sentence again.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Me } from "@/lib/tableTypes";
import { FUNCTIONS } from "@/lib/tableFields";
import { HIRED_WINDOWS, windowPhrase } from "@/lib/hired";
import { IconCheck, IconChevron, IconX } from "../ui/shared";
import { ICP_FREE_TABS, icpEmpty, namedFn, type Facets, type Filters, type RecordType, type SortKey, type Tab } from "./model";
import { Anchored } from "./ui";
import { plural } from "./hooks";
import { foldParts } from "./display";
import "./hired.css";

/** What the list is, as the sentence's subject: the view the member is on. */
const SUBJECT: Record<Tab, string> = {
  all: "Companies",
  repeat: "Repeat hirers",
  hiring: "Companies hiring now",
  following: "Companies you follow",
  unlocked: "Companies you unlocked",
  needs: "Companies",
};
const NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], engagements: ["seat", "seats"], people: ["person", "people"] };

/** The functions picked, as the chip reads them: "Finance", "Finance or Sales", "3 functions", "any function". */
export function fnChipWords(fns: string[]): string {
  if (!fns.length) return "any function";
  if (fns.length <= 2) return fns.join(" or ");
  return `${fns.length} functions`;
}

/** One of the sentence's controls: a chip in the line of text, with a chevron when it opens a list. */
function Part({
  children,
  onClick,
  menu,
  expanded,
  pressed,
  label,
  btnRef,
}: {
  children: ReactNode;
  onClick: () => void;
  menu?: boolean;
  /** Its list is open. */
  expanded?: boolean;
  pressed?: boolean;
  label?: string;
  btnRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      className={`hired-b${pressed === false ? " off" : ""}`}
      onClick={onClick}
      aria-haspopup={menu ? "menu" : undefined}
      aria-expanded={menu ? !!expanded : undefined}
      aria-pressed={pressed}
      aria-label={label}
    >
      {pressed === true && <IconCheck size={12} />}
      <span className="hired-b-t">{children}</span>
      {menu && <IconChevron size={12} />}
    </button>
  );
}

export function HiredSentence({
  f,
  setF,
  me,
  facets,
  type,
  tab,
  icpOn,
  shownN,
  sort,
  onEditIcp,
  onOff,
  folded = false,
  onFold,
  onUnfold,
}: {
  f: Filters;
  setF: (f: Filters) => void;
  me: Me;
  facets: Facets;
  type: RecordType;
  tab: Tab;
  /** The Ideal Fractional Profile narrows this list now (icpApplies). */
  icpOn: boolean;
  /** Rows listed, for the line under the sentence. */
  shownN: number;
  sort: SortKey;
  onEditIcp: () => void;
  /** Turn "Recently hired" off: the hire functions and the window go, the other filters stay. */
  onOff: () => void;
  /** Phones: show the one line ("Finance hires · 6 months · …  Change") instead of the sentence. */
  folded?: boolean;
  /** Phones: fold the sentence (after a pick, or Done). Without it the sentence never folds. */
  onFold?: () => void;
  /** Open the folded line into the sentence again. */
  onUnfold?: () => void;
}) {
  const [open, setOpen] = useState<"scope" | "fn" | "when" | null>(null);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const fnRef = useRef<HTMLButtonElement>(null);
  const whenRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  // Folding or opening takes away the control that was used: focus stays in the card (the line, or the sentence's first control).
  const wasFolded = useRef(folded);
  useEffect(() => {
    if (wasFolded.current === folded) return;
    wasFolded.current = folded;
    const a = document.activeElement;
    if (a && a !== document.body && !cardRef.current?.contains(a)) return;
    cardRef.current?.querySelector<HTMLElement>(folded ? ".hired-fold-b" : ".hired-b")?.focus({ preventScroll: true });
  }, [folded]);
  const hasIcp = !icpEmpty(me.icp);
  // Following and Unlocked are the member's own lists: the profile never narrows them, so the subject is plain text there.
  const ownList = ICP_FREE_TABS.includes(tab);
  const subject = SUBJECT[tab] ?? "Companies";
  const scopeWords = ownList ? subject : icpOn ? `${subject} in my profile` : `All ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
  const scopeLower = scopeWords.charAt(0).toLowerCase() + scopeWords.slice(1);
  const mine = namedFn(me.function);
  const fnCounts = facets.hiredFn ?? {};
  // Every function, the ones with hires on file first: one with none here is listed, muted, so the member sees it was looked for.
  const fnOptions = [...FUNCTIONS].sort((a, b) => Number((fnCounts[b] ?? 0) > 0) - Number((fnCounts[a] ?? 0) > 0));
  const close = () => setOpen(null);
  // A pick done, the sentence folds on a phone so the list it picked is on screen.
  const pick = (nf: Filters) => {
    setF(nf);
    close();
    onFold?.();
  };
  const noun = NOUN[type];

  if (folded) {
    // Which companies, as the line names them: "in my profile", "all companies", "companies you follow".
    const scopeFold = ownList ? subject.toLowerCase() : icpOn ? "in my profile" : `all ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
    const parts = foldParts({ fns: f.hiredFn, within: f.hiredWithin, scope: scopeFold, mine, notMine: f.notMine });
    return (
      <section ref={cardRef} className="hired hired-fold" aria-label="Recently hired">
        <button
          type="button"
          className="hired-fold-b"
          aria-expanded={false}
          aria-label={`Recently hired: ${parts.join(", ")}. ${plural(shownN, noun[0], noun[1])}. Change it`}
          onClick={onUnfold}
        >
          {/* The line breaks only between parts, never inside "in my profile". */}
          <span className="hired-fold-t" aria-hidden>
            {parts.map((p, k) => (
              <Fragment key={k}>
                {k > 0 && " "}
                <span className="hired-fold-p">
                  {p}
                  {k < parts.length - 1 && " ·"}
                </span>
              </Fragment>
            ))}
          </span>
          <span className="hired-fold-c" aria-hidden>
            Change <IconChevron size={12} />
          </span>
        </button>
      </section>
    );
  }

  const scope = ownList ? (
    <span className="hired-fixed">{type === "companies" ? scopeWords : scopeLower}</span>
  ) : (
    <Part btnRef={scopeRef} menu expanded={open === "scope"} onClick={() => setOpen(open === "scope" ? null : "scope")} label={`${scopeWords}. Change which companies`}>
      {type === "companies" ? scopeWords : scopeLower}
    </Part>
  );
  const fn = (
    <Part btnRef={fnRef} menu expanded={open === "fn"} onClick={() => setOpen(open === "fn" ? null : "fn")} label={`Hired a fractional ${fnChipWords(f.hiredFn)}. Change the function`}>
      {fnChipWords(f.hiredFn)}
    </Part>
  );
  const when = (
    <Part btnRef={whenRef} menu expanded={open === "when"} onClick={() => setOpen(open === "when" ? null : "when")} label={`${windowPhrase(f.hiredWithin)}. Change how recent`}>
      {windowPhrase(f.hiredWithin)}
    </Part>
  );
  // The member's own function, when it can be named: "and have no fractional Sales yet", the No fractional Sales yet filter.
  const gap = mine ? (
    <Part pressed={f.notMine} onClick={() => (setF({ ...f, notMine: !f.notMine }), onFold?.())}>
      {type === "engagements" ? "with" : "and have"} no fractional {mine} yet
    </Part>
  ) : null;

  // The sentence for each list. Companies is the owner's own words.
  const sentence =
    type === "engagements" ? (
      <>
        Fractional {fn} seats that started {when} at {scope}
        {gap && <> {gap}</>}
      </>
    ) : type === "people" ? (
      <>
        Decision makers at {scope} that hired a fractional {fn} {when}
        {gap && <> {gap}</>}
      </>
    ) : (
      <>
        {scope} that hired a fractional {fn} {when}
        {gap && <> {gap}</>}
      </>
    );

  return (
    <section ref={cardRef} className="hired" aria-label="Recently hired">
      <div className="hired-main">
        <p className="hired-s">{sentence}</p>
        <div className="hired-foot">
          <p className="hired-n" aria-live="polite">
            <span className="num">{plural(shownN, noun[0], noun[1])}</span>
            {sort === "hired" && shownN > 1 ? ", the most recent hire first" : ""}
          </p>
          {/* Phones: fold it to one line and see the list. */}
          {onFold && (
            <button type="button" className="hired-done" onClick={onFold}>
              Done
            </button>
          )}
        </div>
      </div>
      <button type="button" className="hired-x" aria-label="Turn off Recently hired" title="Turn off Recently hired" onClick={onOff}>
        <IconX size={14} />
      </button>

      {open === "scope" && scopeRef.current && (
        <Anchored anchor={scopeRef.current} onClose={close} width={280} className="tp-menu hired-menu" label="Which companies">
          {hasIcp && (
            <button type="button" role="menuitemradio" aria-checked={icpOn} className={`tp-menu-item${icpOn ? " on" : ""}`} onClick={() => pick({ ...f, icp: true })}>
              {subject} in my profile
            </button>
          )}
          <button type="button" role="menuitemradio" aria-checked={!icpOn} className={`tp-menu-item${!icpOn ? " on" : ""}`} onClick={() => pick({ ...f, icp: false })}>
            All {subject.charAt(0).toLowerCase() + subject.slice(1)}
          </button>
          <div className="tp-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="tp-menu-item"
            onClick={() => {
              close();
              onEditIcp();
            }}
          >
            {hasIcp ? "Edit your profile" : "Set your ideal client"}
          </button>
        </Anchored>
      )}

      {open === "fn" && fnRef.current && (
        <Anchored anchor={fnRef.current} onClose={close} width={300} className="tp-menu hired-menu" label="Hired a fractional in">
          <button type="button" role="menuitemradio" aria-checked={!f.hiredFn.length} className={`tp-menu-item${!f.hiredFn.length ? " on" : ""}`} onClick={() => pick({ ...f, hiredFn: [] })}>
            <span>Any function</span>
            <span className="hired-cnt num">{facets.hiredAny ?? 0}</span>
          </button>
          {fnOptions.map((o) => {
            const on = f.hiredFn.includes(o);
            return (
              <button
                key={o}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={`tp-menu-item${on ? " on" : ""}${(fnCounts[o] ?? 0) === 0 && !on ? " hired-zero" : ""}`}
                onClick={() => pick({ ...f, hiredFn: [o] })}
              >
                <span>
                  {o}
                  {o === mine && <span className="hired-yours"> · your function</span>}
                </span>
                <span className="hired-cnt num">{fnCounts[o] ?? 0}</span>
              </button>
            );
          })}
          <p className="hired-note">Pick more than one function in Filters.</p>
        </Anchored>
      )}

      {open === "when" && whenRef.current && (
        <Anchored anchor={whenRef.current} onClose={close} width={260} className="tp-menu hired-menu" label="How recent">
          {HIRED_WINDOWS.map((w) => (
            <button key={w} type="button" role="menuitemradio" aria-checked={f.hiredWithin === w} className={`tp-menu-item${f.hiredWithin === w ? " on" : ""}`} onClick={() => pick({ ...f, hiredWithin: w })}>
              <span>{w ? `In the last ${w} months` : "At any time"}</span>
              <span className="hired-cnt num">{facets.hiredWithin?.[w] ?? 0}</span>
            </button>
          ))}
          <p className="hired-note">A start with only a year counts as December of that year.</p>
        </Anchored>
      )}
    </section>
  );
}

/** The way in: "Recently hired", beside the views. On: the sentence is up. */
export function HiredButton({ on, onClick, phone }: { on: boolean; onClick: () => void; phone?: boolean }) {
  return (
    <button
      type="button"
      className={phone ? `chip tp-pchip hired-pchip${on ? " chip-on" : ""}` : `chip hired-btn${on ? " chip-on" : ""}`}
      aria-pressed={on}
      title={on ? "Turn off Recently hired" : "Companies that hired a fractional in a function lately"}
      onClick={onClick}
    >
      <HiredIcon />
      Recently hired
    </button>
  );
}

/** A small clock with a check: hired lately. */
function HiredIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="hired-icon">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.25 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
