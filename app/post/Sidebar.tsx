"use client";

/**
 * The way around the app (items from navModel.ts):
 *   - Sidebar: a persistent <nav> on screens 1024px and wider, collapsible to icons (remembered in
 *     this browser). Home; Find; Yours (the saved views by name); Earn; then the foot: Integrations,
 *     Plan and billing, Credits, and the member, whose menu holds the account items.
 *   - TabBar: phones and tablets under 1024px, at the foot of the screen: Home, Companies, Crystal
 *     Ball, Messages, More. More opens MoreSheet, the rest of the sidebar.
 *
 * Every place is a real link (its href is the address TradingPost writes for it), so a middle-click
 * or Ctrl-click opens it in a new tab; a plain click moves in the app (onNav). The item on screen
 * has aria-current="page".
 */
import { useRef, type ReactNode, type RefObject } from "react";
import { Brand, IconChevron, initials } from "../ui/shared";
import { Sheet } from "./ui";
import { plural } from "./hooks";
import { TAB_KEYS, moreOn, planLine, type NavIcon as NavIconName, type NavItem } from "./navModel";
import type { Me, PlanView } from "@/lib/tableTypes";
import { Divider } from "../ui/fractions/lazy";

/* ---------- icons: simple line icons, 18px, currentColor ---------- */

const P: Record<NavIconName, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  companies: (
    <>
      <path d="M4 20V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14" />
      <path d="M14 10h5a1 1 0 0 1 1 1v9M3 20h18M7.5 9h3M7.5 12.5h3M7.5 16h3" />
    </>
  ),
  seats: (
    <>
      <path d="M7 11V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" />
      <path d="M5 11h14v4H5zM7 15v5M17 15v5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="11" r="7" />
      <path d="M8 21h8M10 9.5l1 2 2 .6-2 .6-1 2-.6-2-2-.6 2-.6z" />
    </>
  ),
  hiring: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  views: <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />,
  view: <path d="M7 5h10v14l-5-3-5 3z" />,
  following: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8z" />,
  yourseats: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  messages: <path d="M4 5h16v11H9l-5 4z" />,
  network: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <circle cx="5.5" cy="18" r="2.5" />
      <circle cx="18.5" cy="18" r="2.5" />
      <path d="M10.8 7.7 6.7 15.8M13.2 7.7l4.1 8.1M8 18h8" />
    </>
  ),
  add: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  partners: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0" />
    </>
  ),
  rates: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  invite: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  integrations: (
    <>
      <path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z" />
      <path d="M12 16v5" />
    </>
  ),
  billing: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  credits: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 9.8c0-.9 1.1-1.6 2.5-1.6s2.5.7 2.5 1.6-1.1 1.4-2.5 1.7-2.5.9-2.5 1.8 1.1 1.6 2.5 1.6 2.5-.7 2.5-1.6" />
    </>
  ),
  metrics: <path d="M4 19h16M6 15l4-5 3 3 5-7" />,
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  fractionals: (
    <>
      <circle cx="8" cy="8.5" r="3" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M2.5 19.5a5.5 5.5 0 0 1 11 0M13.5 15.2a4.5 4.5 0 0 1 8 3.8" />
    </>
  ),
};
export function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="tp-nav-ico">
      {P[name]}
    </svg>
  );
}
const IconMore = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="tp-nav-ico">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

/** A plain left click moves in the app; a middle, Ctrl, Cmd or Shift click is the browser's (a new tab or window). */
const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** What a screen reader hears for an item: its name, then its count or badge. */
const spoken = (it: NavItem) =>
  [it.label, it.badge ? `${it.badge} ${it.badgeOf ?? "new"}` : it.count != null ? String(it.count) : "", it.hint ?? ""].filter(Boolean).join(", ");

/** One item: a link to a place, or a button for a sheet. */
export function NavEntry({ it, onNav, compact, className = "" }: { it: NavItem; onNav: (it: NavItem) => void; compact?: boolean; className?: string }) {
  const inner = (
    <>
      <NavIcon name={it.icon} />
      <span className="tp-nav-l">{it.label}</span>
      {it.badge ? (
        <span className="tp-nav-badge num" aria-hidden>
          {it.badge}
        </span>
      ) : it.count != null ? (
        <span className="tp-nav-n num" aria-hidden>
          {it.count.toLocaleString("en-US")}
        </span>
      ) : it.hint ? (
        <span className="tp-nav-hint" aria-hidden>
          {it.hint}
        </span>
      ) : null}
      {compact && it.badge ? <span className="tp-nav-dot" aria-hidden /> : null}
    </>
  );
  const cls = `tp-nav-i${it.current ? " on" : ""}${className ? ` ${className}` : ""}`;
  if (!it.href)
    return (
      <button type="button" className={cls} data-nav={it.key} aria-label={spoken(it)} title={compact ? it.label : undefined} onClick={() => onNav(it)}>
        {inner}
      </button>
    );
  return (
    <a
      href={it.href}
      className={cls}
      data-nav={it.key}
      aria-current={it.current ? "page" : undefined}
      aria-label={spoken(it)}
      title={compact ? it.label : it.key.startsWith("view:") ? it.label : undefined}
      onClick={(e) => {
        if (!ownClick(e)) return;
        e.preventDefault();
        onNav(it);
      }}
    >
      {inner}
    </a>
  );
}

const GROUPS: { key: NavItem["group"]; label: string | null }[] = [
  { key: "home", label: null },
  { key: "find", label: "Find" },
  { key: "community", label: "Community" },
  { key: "yours", label: "Yours" },
  { key: "earn", label: "Earn" },
];

/** The groups as lists, with the saved views as a sub-list under Yours. */
function NavLists({ items, onNav, compact, onManageViews }: { items: NavItem[]; onNav: (it: NavItem) => void; compact?: boolean; onManageViews?: () => void }) {
  return (
    <>
      {GROUPS.map((g) => {
        const list = items.filter((it) => it.group === g.key);
        if (!list.length) return null;
        const views = list.filter((it) => it.key.startsWith("view:"));
        const rest = list.filter((it) => !it.key.startsWith("view:"));
        return (
          <div key={g.key} className={`tp-nav-g tp-nav-g-${g.key}`}>
            {g.label && (
              <div className="tp-nav-h" id={`tp-nav-h-${g.key}`}>
                {g.label}
              </div>
            )}
            <ul className="tp-nav-ul" aria-labelledby={g.label ? `tp-nav-h-${g.key}` : undefined}>
              {g.key === "yours" && views.length > 0 && !compact && (
                <li className="tp-nav-views">
                  <div className="tp-nav-sub">
                    <span className="tp-nav-sub-h" id="tp-nav-h-views">
                      Saved views
                    </span>
                    {onManageViews && (
                      <button type="button" className="tp-nav-manage" onClick={onManageViews}>
                        Manage
                      </button>
                    )}
                  </div>
                  <ul className="tp-nav-ul" aria-labelledby="tp-nav-h-views">
                    {views.map((it) => (
                      <li key={it.key}>
                        <NavEntry it={it} onNav={onNav} className="tp-nav-view" />
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              {g.key === "yours" && views.length > 0 && compact && onManageViews && (
                <li>
                  <button type="button" className={`tp-nav-i${views.some((v) => v.current) ? " on" : ""}`} aria-label={`Saved views, ${views.length}`} title="Saved views" onClick={onManageViews}>
                    <NavIcon name="views" />
                    <span className="tp-nav-l">Saved views</span>
                  </button>
                </li>
              )}
              {rest.map((it) => (
                <li key={it.key}>
                  <NavEntry it={it} onNav={onNav} compact={compact} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** The plan in the foot: "Pro trial · 9 days left" and Upgrade, Free and Upgrade, or Pro. */
function PlanFoot({ plan, onUpgrade, compact }: { plan?: PlanView; onUpgrade: () => void; compact?: boolean }) {
  if (!plan || plan.name === "pro" || compact) return null;
  return (
    <div className={`tp-nav-plan${plan.name === "trial" && plan.ending ? " end" : ""}`}>
      <span className="tp-nav-plan-t num">{planLine(plan)}</span>
      <button type="button" className="tp-nav-plan-go" onClick={onUpgrade}>
        Upgrade
      </button>
    </div>
  );
}

export function Sidebar({
  items,
  me,
  collapsed,
  onCollapse,
  onNav,
  onManageViews,
  onUpgrade,
  onAccount,
  accountRef,
  onHome,
}: {
  items: NavItem[];
  me: Me;
  collapsed: boolean;
  onCollapse: (on: boolean) => void;
  onNav: (it: NavItem) => void;
  onManageViews: () => void;
  onUpgrade: () => void;
  onAccount: () => void;
  accountRef: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
}) {
  const foot = items.filter((it) => it.group === "foot");
  const home = items.find((it) => it.key === "today");
  return (
    <nav className={`tp-nav${collapsed ? " collapsed" : ""}`} aria-label="Merlin">
      <div className="tp-nav-top">
        <a
          href={home?.href ?? "/"}
          className="tp-nav-brand"
          aria-label="Merlin home"
          onClick={(e) => {
            if (!ownClick(e)) return;
            e.preventDefault();
            onHome();
          }}
        >
          {collapsed ? <Brand size={28} kind="mark" /> : <Brand size={30} />}
        </a>
        <button
          type="button"
          className="tp-nav-collapse"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          onClick={() => onCollapse(!collapsed)}
        >
          <IconChevron dir={collapsed ? "right" : "left"} size={16} />
        </button>
      </div>
      <div className="tp-nav-scroll">
        <NavLists items={items.filter((it) => it.group !== "foot")} onNav={onNav} compact={collapsed} onManageViews={onManageViews} />
      </div>
      <div className="tp-nav-foot">
        {/* The trail's steps, the thread between screens, where the hairline was. */}
        <Divider kind="steps" on="bg" className="tp-nav-thread" />
        <ul className="tp-nav-ul" aria-label="Settings">
          {foot.map((it) => (
            <li key={it.key}>
              <NavEntry it={it} onNav={onNav} compact={collapsed} />
            </li>
          ))}
        </ul>
        <PlanFoot plan={me.plan} onUpgrade={onUpgrade} compact={collapsed} />
        <button
          ref={accountRef}
          type="button"
          className="tp-nav-me"
          aria-haspopup="menu"
          aria-expanded={false}
          aria-label={`${me.name}, your account`}
          title={collapsed ? me.name : undefined}
          onClick={onAccount}
        >
          <span className="tp-nav-av" aria-hidden>
            {initials(me.name)}
          </span>
          <span className="tp-nav-me-t">
            <span className="tp-nav-me-n">{me.name}</span>
            <span className="tp-nav-me-s">{me.title && me.title !== "Member" ? me.title : me.function ?? `${plural(me.added, "fact")} added`}</span>
          </span>
          <IconChevron dir="up" size={14} />
        </button>
      </div>
    </nav>
  );
}

/** Phones and tablets: Home, Companies, Crystal Ball, Messages and More, at the foot of the screen. */
export function TabBar({ items, onNav, onMore, moreRef, moreOpen }: { items: NavItem[]; onNav: (it: NavItem) => void; onMore: () => void; moreRef: RefObject<HTMLButtonElement | null>; moreOpen: boolean }) {
  const tabs = TAB_KEYS.map((k) => items.find((it) => it.key === k)).filter((x): x is NavItem => !!x);
  const more = moreOn(items) || moreOpen;
  return (
    <nav className="tp-tabbar" aria-label="Merlin">
      <ul>
        {tabs.map((it) => (
          <li key={it.key}>
            <NavEntry it={{ ...it, label: it.key === "today" ? "Home" : it.label, count: null, hint: undefined }} onNav={onNav} className="tp-tab-i" />
          </li>
        ))}
        <li>
          <button ref={moreRef} type="button" className={`tp-nav-i tp-tab-i${more ? " on" : ""}`} data-nav="more" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}>
            <IconMore />
            <span className="tp-nav-l">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** More, on a phone: everything the sidebar has that the tab bar doesn't, and the member's account. */
export function MoreSheet({
  items,
  me,
  onNav,
  onClose,
  onManageViews,
  onUpgrade,
  onAccount,
}: {
  items: NavItem[];
  me: Me;
  onNav: (it: NavItem) => void;
  onClose: () => void;
  onManageViews: () => void;
  onUpgrade: () => void;
  onAccount: () => void;
}) {
  const rest = items.filter((it) => !(TAB_KEYS as readonly string[]).includes(it.key));
  const go = (it: NavItem) => {
    onClose();
    onNav(it);
  };
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Sheet title="More" onClose={onClose} className="tp-more-sheet" restore={() => document.querySelector<HTMLElement>(".tp-tabbar [data-nav='more']")}>
      <div ref={ref} className="tp-nav tp-nav-sheet">
        <NavLists items={rest.filter((it) => it.group !== "foot")} onNav={go} onManageViews={() => (onClose(), onManageViews())} />
        <div className="tp-nav-g">
          <div className="tp-nav-h" id="tp-nav-h-settings">Settings</div>
          <ul className="tp-nav-ul" aria-labelledby="tp-nav-h-settings">
            {rest
              .filter((it) => it.group === "foot")
              .map((it) => (
                <li key={it.key}>
                  <NavEntry it={it} onNav={go} />
                </li>
              ))}
          </ul>
        </div>
        <PlanFoot plan={me.plan} onUpgrade={() => (onClose(), onUpgrade())} />
        <button type="button" className="tp-nav-me" onClick={onAccount} aria-haspopup="menu">
          <span className="tp-nav-av" aria-hidden>
            {initials(me.name)}
          </span>
          <span className="tp-nav-me-t">
            <span className="tp-nav-me-n">{me.name}</span>
            <span className="tp-nav-me-s">Your profile, sign-in link, sign out</span>
          </span>
          <IconChevron dir="right" size={14} />
        </button>
      </div>
    </Sheet>
  );
}
