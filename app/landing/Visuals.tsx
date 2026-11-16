"use client";

/**
 * Static product visuals for the landing page, drawn in HTML and CSS. Every company and person
 * here is made up; none of it is member data. Nothing in here is clickable.
 *
 * A fact is drawn in one of three states, the same three the app has: a value you can see,
 * a locked one (a small lock and a masked bar), and a missing one you can add for a credit.
 */
import type { ReactNode } from "react";
import { IconCheck, IconLock, IconUsers } from "../ui/shared";

/** A locked fact at rest: quiet, no value, no button. `w` is the width of the masked bar. Drawn with the app's own classes. */
function Locked({ w = 72 }: { w?: number }) {
  return (
    <span className="lock-rest lp-locked">
      <IconLock size={12} />
      <span className="lock-mask" style={{ width: w }} />
    </span>
  );
}

/** The same locked fact as it looks under the pointer: one tap, one credit. */
function Unlock() {
  return (
    <span className="lock-cta lock-cta-static">
      <IconLock size={12} />
      <span>Unlock</span>
      <span className="lock-cost num">· 1 credit</span>
    </span>
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

/**
 * Hero visual: one company record as a member first meets it. It has an open role, so the
 * company is hidden, as it is in the app, and one unlock shows the company, the role and the
 * posting. A seat a member held shows the three states side by side: a fact someone unlocked
 * (who held the seat, confirmed by 3), a locked one (the rate) and a missing one (hours).
 * It carries the page's one "Hiring now" chip.
 */
export function HeroRecord() {
  return (
    <figure className="lp-visual">
      <div className="lp-rec" aria-hidden>
        <div className="lp-rec-head">
          <span className="lp-mark lp-mark-hidden">
            <IconLock size={16} />
          </span>
          <div className="lp-rec-id">
            <div className="lp-rec-name lp-rec-name-hidden">Hidden company</div>
            <div className="lp-rec-meta num">
              Software · 51–200 people<span className="lp-rec-meta-x"> · $5M–$20M</span>
            </div>
          </div>
          <span className="chip chip-ember lp-hiring">Hiring now</span>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">
            <span>RevOps seat · Fractional</span>
            <span className="lp-rec-when num">Open since Nov 3</span>
          </div>
          <dl className="lp-rows">
            <Row k="Role">
              <Locked w={96} />
            </Row>
            <Row k="Job posting">
              <Unlock />
            </Row>
          </dl>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">
            <span>Sales seat · Fractional</span>
            <span className="lp-rec-when num">Mar 2024 to Aug 2025</span>
          </div>
          <dl className="lp-rows">
            <Row k="Role">
              <span className="lp-val">Fractional VP Sales</span>
            </Row>
            <Row k="Seat holder">
              <Confirmed n={3} />
              <span className="lp-val">Dana Whitfield</span>
            </Row>
            <Row k="Rate">
              <Locked w={84} />
            </Row>
            <Row k="Hours a week">
              <Add />
            </Row>
          </dl>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">
            <span>Hiring contact</span>
          </div>
          <div className="lp-person">
            <span className="lp-avatar">
              <IconUsers size={13} />
            </span>
            <span className="lp-person-title">Chief Revenue Officer</span>
            <Locked w={56} />
          </div>
        </div>
      </div>
      <figcaption className="lp-visual-cap">
        An example record. A company with an open role stays hidden until you unlock it, and that 1 credit shows the company, the role and the
        posting.
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
