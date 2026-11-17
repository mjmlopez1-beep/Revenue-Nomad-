"use client";

/**
 * Static product visuals for the landing page, drawn in HTML and CSS. Every company and person
 * here is made up; none of it is member data. Nothing in here is clickable.
 *
 * A fact is drawn in one of three states, the same three the app has: a value you can see,
 * a locked one (a small lock and a masked bar), and a missing one you can add for a credit.
 */
import type { ReactNode } from "react";
import { CompanyLogo, IconCheck, IconLock, IconUsers, LockedName, LockedSite } from "../ui/shared";

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
 * company is locked, as it is in the app: a blurred made-up name, site and logo. The role title
 * is free. Under it, a past seat with who held it (unlocked, confirmed by 3) and the two ways
 * to reach them: a message inside Trading Post, or an intro from us when the intro address is set.
 * It carries the page's one "Hiring now" chip.
 */
/** Any fixed id, so the example card shows the same made-up name on every visit. */
const EXAMPLE_SEED = "lp-example-record";

/** The two ways to reach a seat holder, drawn like the record's buttons. Not clickable. */
function ReachOut({ intro }: { intro: boolean }) {
  return (
    <div className="lp-reach">
      <span className="lp-fake-btn lp-fake-btn-pine">Message Dana</span>
      {intro ? <span className="lp-fake-btn">Ask for an intro</span> : <span className="lp-fake-btn">LinkedIn</span>}
    </div>
  );
}

export function HeroRecord({ intro = true }: { intro?: boolean }) {
  return (
    <figure className="lp-visual">
      <div className="lp-rec" aria-hidden>
        <div className="lp-rec-head">
          <CompanyLogo name="" domain={null} hidden seed={EXAMPLE_SEED} size="lg" />
          <div className="lp-rec-id">
            <div className="lp-rec-name">
              <LockedName seed={EXAMPLE_SEED} />
            </div>
            <LockedSite seed={EXAMPLE_SEED} className="lp-rec-site" />
            <div className="lp-rec-meta num">
              SaaS · 51–200 people<span className="lp-rec-meta-x"> · $5M–$20M</span>
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
              <span className="lp-val">Fractional Head of RevOps</span>
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
              <span className="chip lp-member">Member</span>
            </Row>
            <Row k="Rate">
              <Locked w={84} />
            </Row>
          </dl>
          <ReachOut intro={intro} />
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
        An example record. The open role is free to see. Dana held the Sales seat here, so you can ask her how it went before you pitch for the RevOps role.
      </figcaption>
    </figure>
  );
}

/**
 * The feature card's picture: a seat holder someone unlocked, and the first message to them.
 * Made up, like every visual here.
 */
export function IntroVisual({ intro = true }: { intro?: boolean }) {
  return (
    <div className="lp-intro" aria-hidden>
      <div className="lp-intro-who">
        <span className="lp-intro-av">DW</span>
        <div className="lp-intro-id">
          <span className="lp-intro-name">Dana Whitfield</span>
          <span className="lp-intro-meta num">Held the Sales seat · Mar 2024 to Aug 2025</span>
        </div>
        <span className="chip lp-member">Member</span>
      </div>
      <p className="lp-intro-msg">
        Hi Dana, I&apos;m talking to them about their open RevOps role. You held the Sales seat there. How did the engagement go, and who made the call?
      </p>
      <ReachOut intro={intro} />
    </div>
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
