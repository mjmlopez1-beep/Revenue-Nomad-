"use client";

/**
 * Product visuals for the landing page, drawn in HTML and CSS. In the hero's record, the controls a
 * member would use (Unlock, Message the seat holder, Find them on LinkedIn) are real buttons that
 * take the visitor to the join form (`onJoin`). The small "how credits work" demos are pictures.
 *
 * The hero's record is a real company from the table (lib/preview.ts PreviewExample): its free
 * facts, an open role when it has one, and a past seat whose holder is on file. It never names
 * the seat holder or anyone else, and nothing on it is blurred. The small "how credits work"
 * demos below are generic: no company in them.
 *
 * A fact is drawn in one of three states, the same three the app has: a value you can see,
 * a locked one (a small lock and a masked bar), and a missing one you can add for a credit.
 */
import type { ReactNode } from "react";
import { CompanyLogo, IconCheck, IconLock } from "../ui/shared";
import type { PreviewExample } from "./TryIt";

/** A locked fact at rest: quiet, no value, no button. `w` is the width of the masked bar. Drawn with the app's own classes. */
function Locked({ w = 72 }: { w?: number }) {
  return (
    <span className="lock-rest lp-locked">
      <IconLock size={12} />
      <span className="lock-mask" style={{ width: w }} />
    </span>
  );
}

/** The same locked fact as it looks under the pointer: one tap, one credit. With `onJoin`, a button that takes the visitor to the join form. */
function Unlock({ onJoin, what }: { onJoin?: () => void; what?: string }) {
  const label = (
    <span className="lock-cta lock-cta-static">
      <IconLock size={12} />
      <span>Unlock</span>
      <span className="lock-cost num">· 1 credit</span>
    </span>
  );
  if (!onJoin) return label;
  return (
    <button type="button" className="lp-rec-btn" onClick={onJoin} aria-label={`Join free to unlock ${what ?? "this"} for 1 credit`}>
      {label}
    </button>
  );
}

/** A missing fact: add it and earn a credit. */
function Add() {
  return (
    <span className="add">
      + Add
      <span className="plus1 num">+1</span>
    </span>
  );
}

/** How many members confirmed a value. */
function Confirmed({ n }: { n: number }) {
  return (
    <span className="lp-ver num">
      <IconCheck size={12} />
      {n}
    </span>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="lp-row">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2024" from "2024-03". */
const monthLabel = (m: string | null) => {
  if (!m) return null;
  const [y, n] = m.split("-").map(Number);
  return y && n ? `${MONTHS[n - 1]} ${y}` : null;
};
/** "Nov 3" from an ISO day. */
const dayLabel = (d: string | null) => {
  if (!d) return null;
  const [, m, n] = d.slice(0, 10).split("-").map(Number);
  return m && n ? `${MONTHS[m - 1]} ${n}` : null;
};

/** What a member can do once they unlock the seat holder. Each button takes the visitor to the join form. */
function ReachOut({ intro, onJoin }: { intro: boolean; onJoin?: () => void }) {
  return (
    <div className="lp-reach-wrap">
      <span className="lp-reach-k">Once you join</span>
      <div className="lp-reach">
        <button type="button" className="lp-fake-btn lp-fake-btn-pine" onClick={onJoin}>
          Message the seat holder
        </button>
        <button type="button" className="lp-fake-btn" onClick={onJoin}>
          {intro ? "Ask for an intro" : "Find them on LinkedIn"}
        </button>
      </div>
    </div>
  );
}

/** The record's shape while the example is on its way: quiet bars, no made-up company. */
function RecordLoading() {
  return (
    <div className="lp-rec lp-rec-loading" aria-hidden>
      <div className="lp-rec-head">
        <span className="lp-try-skel-logo lp-rec-skel-logo" />
        <div className="lp-rec-id">
          <span className="lp-try-skel-line lp-rec-skel-name" />
          <span className="lp-try-skel-line lp-try-skel-short" />
        </div>
      </div>
      {[0, 1].map((n) => (
        <div key={n} className="lp-rec-sec">
          <span className="lp-try-skel-line" />
          <span className="lp-try-skel-line lp-try-skel-short" />
          <span className="lp-try-skel-line" />
        </div>
      ))}
    </div>
  );
}

/**
 * Hero visual: one real company record as a member first meets it. The company's free facts,
 * its open role when it has one (title free, posting behind a credit), and a past seat whose
 * holder is on file, with what a member can do next. It carries the page's one "Hiring now"
 * chip when the company is hiring. `example` undefined: still loading. Null: nothing fits.
 * `onJoin`: what the record's buttons do (the page's join form).
 */
export function HeroRecord({ example, intro = true, onJoin }: { example: PreviewExample | null | undefined; intro?: boolean; onJoin?: () => void }) {
  if (example === null) return null;
  if (!example)
    return (
      <figure className="lp-visual">
        <RecordLoading />
        <figcaption className="lp-visual-cap">A real record from the table.</figcaption>
      </figure>
    );
  const { company: co, open, seat } = example;
  const started = monthLabel(seat.start);
  return (
    <figure className="lp-visual">
      <div className="lp-rec">
        <div className="lp-rec-head">
          <CompanyLogo name={co.name} domain={co.logo} size="lg" />
          <div className="lp-rec-id">
            <div className={`lp-rec-name${open ? " lp-rec-name-chip" : ""}`}>{co.name}</div>
            {co.domain ? <span className="mono lp-rec-site">{co.domain}</span> : null}
            <div className="lp-rec-meta num">
              {[co.industry, co.employees && `${co.employees} people`].filter(Boolean).join(" · ")}
              {co.revenue ? <span className="lp-rec-meta-x"> · {co.revenue}</span> : null}
            </div>
          </div>
          {open ? <span className="chip chip-ember lp-hiring">Hiring now</span> : null}
        </div>

        {open ? (
          <div className="lp-rec-sec">
            <div className="lp-rec-k">
              <span>{open.function} role · Open now</span>
              {dayLabel(open.when) ? <span className="lp-rec-when num">Open since {dayLabel(open.when)}</span> : null}
            </div>
            <dl className="lp-rows">
              <Row k="Role">
                <span className="lp-val lp-val-wrap">{open.title}</span>
              </Row>
              <Row k="Job posting">
                <Unlock onJoin={onJoin} what="the job posting" />
              </Row>
            </dl>
          </div>
        ) : null}

        <div className="lp-rec-sec">
          <div className="lp-rec-k">
            <span>{seat.function} seat · Fractional</span>
            {started ? <span className="lp-rec-when num">Started {started}</span> : null}
          </div>
          <dl className="lp-rows">
            <Row k="Seat holder">
              <span className="lp-val">On file</span>
              {seat.rnMember ? <span className="chip lp-member">Revenue Nomad member</span> : null}
            </Row>
            <Row k="Name and role">
              <Unlock onJoin={onJoin} what="who held the seat and the role they held" />
            </Row>
            <Row k="Rate">
              <Locked w={84} />
            </Row>
          </dl>
          <ReachOut intro={intro} onJoin={onJoin} />
        </div>
      </div>
      <figcaption className="lp-visual-cap">
        {open
          ? `A real record from the table. ${co.name} is hiring for ${open.function} now, and the fractional who held its ${seat.function} seat is on file. Ask them how it went before you pitch.`
          : `A real record from the table. The fractional who held ${co.name}'s ${seat.function} seat is on file. Ask them how it went before you pitch for the next one.`}
      </figcaption>
    </figure>
  );
}

/* ---------- how credits work: one small before and after per card ---------- */

export function DemoAdd() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Hours a week</span>
      <Add />
      <span className="lp-demo-arrow">→</span>
      <span className="lp-demo-v num">15</span>
      <span className="lp-plus num">+1</span>
    </div>
  );
}

export function DemoUnlock() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Seat holder</span>
      <Unlock />
      <span className="lp-demo-arrow">→</span>
      <span className="lp-demo-v">Dana Whitfield</span>
    </div>
  );
}

export function DemoConfirm() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Role</span>
      <span className="lp-demo-v">Fractional VP Sales</span>
      <Confirmed n={3} />
      <span className="lp-demo-btn">Confirm</span>
      <span className="lp-demo-btn lp-demo-btn-quiet">Report</span>
    </div>
  );
}
