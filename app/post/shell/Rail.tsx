"use client";

/**
 * The new look's rail (RN_UI2, Rail.dc.html): white, 248px, on screens 1024px and wider. The
 * groups from navModel.ts navItems2 (the two at the top, Data, Signals, Close, Community, Automate,
 * Workspace), each item a real link with its count or pill; the foot holds Getting started while
 * steps are left, the plan line with Upgrade, and the member chip, whose menu holds the account.
 *
 * A plain click moves in the app (onNav); a middle, Ctrl or Cmd click is the browser's. The item
 * on screen has aria-current="page".
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { initials } from "../../ui/shared";
import type { Me, PlanView } from "@/lib/tableTypes";
import { GROUPS2, planLine, type NavIcon2, type NavItem2 } from "../navModel";
import { GettingStartedCard } from "./GettingStarted";
import type { SixSteps } from "../getStarted";
import "./shell.css";

/* ---------- icons: 24 viewBox, 1.9 stroke, round caps (the mockup's) ---------- */

const I: Record<NavIcon2, string> = {
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  find: "M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4-4",
  companies: "M4 20V6l8-2v16M12 9l8 2v9M4 20h16M7 9h2M7 13h2M15 14h2",
  people: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0-1-5.8M18 14.5a5.5 5.5 0 0 1 3.5 5.5",
  seats: "M7 4h10v8H7zM5 12h14v4H5zM7 16v4M17 16v4",
  radar: "M12 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM8 21h8M10 9a3 3 0 0 1 3-2",
  hiring: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  warm: "M5 18a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM19 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM7 16c4 0 6-8 10-8",
  pipeline: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4",
  proposals: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  contracts: "M4 17c3-6 5-6 6-2s3 3 4 0 3-2 6 2M4 21h16",
  evidence: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  fractionals: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0-1-5.8M18 14.5a5.5 5.5 0 0 1 3.5 5.5",
  messages: "M5 5h14v11H10l-5 4z",
  alerts: "M13 3L5 14h6l-1 7 8-11h-6z",
  agent: "M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4",
  rates: "M4 20V10M10 20V4M16 20v-8M3 20h18",
  credits: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3",
  settings: "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  metrics: "M4 19h16M6 15l4-5 3 3 5-7",
};
export function NavIcon2({ name, size = 18 }: { name: NavIcon2; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ws-ico">
      <path d={I[name]} />
    </svg>
  );
}
/** The Merlin mark (the mockup's path), for the rail's head and the phone header. */
export const MARK =
  "M85.2 208.6a27.3 27.3 0 1 0 54.5 0a27.3 27.3 0 1 0 -54.5 0ZM99 4.4L97.1 6.5L96.4 12.2L95.5 23.9L92.6 42.1L89.7 54.1L86.6 63.9L82.4 75.4L78.1 85L72.8 95.8L64.8 109.1L56.8 120.7L49.2 130.2L41.1 139.3L29.1 150.9L20.6 158L8.3 167.1L6.1 169.5L5.6 171.7L6.4 174.1L18 192.4L20.3 194.4L23.1 194.6L25.2 193.6L37 185.1L45.6 178.3L55.1 169.9L63.7 161.4L73.4 150.6L80.9 141.2L89.2 129.6L95.8 119.1L104.1 104.2L110.7 89.9L112.1 88.4L113.6 88.8L114.5 90L119.7 101.4L127.4 115.8L133.2 125.5L142.2 138.5L152.9 151.9L160.4 160.2L167.6 167.5L178.8 177.6L188.4 185.4L200.2 193.9L202.8 194.8L204.9 194.3L207.2 192.1L218.7 173.9L219.5 171.5L218.9 169.3L217.5 167.6L209.1 161.7L196.8 151.7L185.5 141.1L174.9 129.2L164.8 116.1L157.6 105.1L149 89.8L143.6 78L137.1 60.2L133.3 46.4L130.1 29.8L128.8 18.4L128.4 8.1L127.4 5.5L125 4L101.5 3.8Z";
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 225 240" width={size} height={Math.round(size * 1.08)} aria-hidden>
      <path fill="#073F2F" fillRule="evenodd" d={MARK} />
    </svg>
  );
}

/** A plain left click moves in the app; a middle, Ctrl, Cmd or Shift click is the browser's. */
export const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** What a screen reader hears: the name, then its count or pill. */
const spoken = (it: NavItem2) => [it.label, it.spoken ?? (it.pill ? it.pill.text : it.count != null ? String(it.count) : "")].filter(Boolean).join(", ");

/** One rail item: a link to its place. */
export function NavEntry2({ it, onNav, className = "" }: { it: NavItem2; onNav: (it: NavItem2) => void; className?: string }) {
  return (
    <a
      href={it.href}
      className={`ws-i${it.current ? " on" : ""}${className ? ` ${className}` : ""}`}
      data-nav={it.key}
      aria-current={it.current ? "page" : undefined}
      aria-label={spoken(it)}
      onClick={(e) => {
        if (!ownClick(e)) return;
        e.preventDefault();
        onNav(it);
      }}
    >
      <NavIcon2 name={it.icon} />
      <span className="ws-i-l">{it.label}</span>
      {it.pill ? (
        <span className={`ws-pill ws-pill-${it.pill.kind}`} aria-hidden>
          {it.pill.text}
        </span>
      ) : it.count != null ? (
        <span className="ws-i-n num" aria-hidden>
          {it.count.toLocaleString("en-US")}
        </span>
      ) : null}
    </a>
  );
}

/** The groups as lists. */
export function NavGroups2({ items, onNav, skip = [] }: { items: NavItem2[]; onNav: (it: NavItem2) => void; skip?: readonly string[] }) {
  return (
    <>
      {GROUPS2.map((g) => {
        const list = items.filter((it) => it.group === g.key && !skip.includes(it.key));
        if (!list.length) return null;
        const hid = `ws-g-${g.key}`;
        return (
          <div key={g.key} className="ws-g">
            {g.label && (
              <div className="ws-g-h" id={hid}>
                {g.label}
              </div>
            )}
            <ul className="ws-ul" aria-labelledby={g.label ? hid : undefined}>
              {list.map((it) => (
                <li key={it.key}>
                  <NavEntry2 it={it} onNav={onNav} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** "Close trial · 16 days left" and Upgrade (Free too); nothing on Pro or with billing off. */
export function PlanLine2({ plan, onUpgrade }: { plan?: PlanView; onUpgrade: () => void }) {
  if (!plan || plan.name === "pro") return null;
  return (
    <button type="button" className={`ws-plan${plan.name === "trial" && plan.ending ? " end" : ""}`} onClick={onUpgrade}>
      <span className="num">{planLine(plan)}</span>
      <strong>Upgrade</strong>
    </button>
  );
}

/** The member chip: their initials, name and title. It opens the member menu. */
export function MemberChip({ me, onClick, chipRef, hint }: { me: Me; onClick: () => void; chipRef?: RefObject<HTMLButtonElement | null>; hint?: ReactNode }) {
  return (
    <button ref={chipRef} type="button" className="ws-me" aria-haspopup="menu" aria-expanded={false} aria-label={`${me.name}, your account`} onClick={onClick}>
      <span className="ws-av" aria-hidden>
        {initials(me.name)}
      </span>
      <span className="ws-me-t">
        <strong>{me.name}</strong>
        <span>{hint ?? (me.title && me.title !== "Member" ? me.title : me.function ?? "Your account")}</span>
      </span>
    </button>
  );
}

export function Rail({
  items,
  me,
  onNav,
  onHome,
  onUpgrade,
  onAccount,
  accountRef,
  six,
  showStart,
  onStart,
}: {
  items: NavItem2[];
  me: Me;
  onNav: (it: NavItem2) => void;
  onHome: () => void;
  onUpgrade: () => void;
  onAccount: () => void;
  accountRef: RefObject<HTMLButtonElement | null>;
  six: SixSteps;
  /** Getting started is on (not hidden, steps left). */
  showStart: boolean;
  onStart: () => void;
}) {
  const home = items.find((it) => it.key === "today");
  const scroll = useRef<HTMLDivElement>(null);
  const on = items.find((it) => it.current)?.key;
  // The item on screen is always in sight in the rail (Settings sits low on a short screen).
  useEffect(() => {
    const box = scroll.current;
    const el = on ? box?.querySelector<HTMLElement>(`[data-nav="${on}"]`) : null;
    if (!box || !el) return;
    // Only the rail scrolls (never the shell around it, which is clipped).
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    else if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
  }, [on]);
  return (
    <nav className="ws-rail" aria-label="Merlin">
      <a
        href={home?.href ?? "/"}
        className="ws-brand"
        aria-label="Merlin home"
        onClick={(e) => {
          if (!ownClick(e)) return;
          e.preventDefault();
          onHome();
        }}
      >
        <Mark />
        <span className="ws-brand-t">
          <span className="ws-brand-n">MERLIN</span>
          <span className="ws-brand-s">REVENUE NOMAD</span>
        </span>
      </a>
      <div className="ws-rail-scroll" ref={scroll}>
        <NavGroups2 items={items} onNav={onNav} />
      </div>
      <div className="ws-foot">
        {showStart && <GettingStartedCard six={six} onClick={onStart} />}
        <PlanLine2 plan={me.plan} onUpgrade={onUpgrade} />
        <MemberChip me={me} onClick={onAccount} chipRef={accountRef} />
      </div>
    </nav>
  );
}
