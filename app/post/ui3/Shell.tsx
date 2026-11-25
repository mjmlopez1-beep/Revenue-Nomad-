"use client";

/**
 * The new design's shell (RN_UI3, lib/ui3.ts): the forest navigation, the top bar, and on phones
 * and tablets the forest top bar, the tab bar and More. TradingPost draws these in place of the new
 * look's rail, header and tab bar while Me.ui3 is on; every page and address works as before.
 *
 *   Ui3Nav      Home and Crystal Ball, then Find (My Network, Target Companies, Warm Paths), Work
 *               (Pipeline, Workflows, Proposals, Contracts, Evidence Bank) and Community
 *               (Fractionals, Messages), each with a count from real data. The foot is a landscape
 *               behind the account row (the account menu) and its gear (the rest of Merlin: Find,
 *               People, Seats, Hiring now, Settings, Credits and usage, Rate benchmarks, Agent
 *               access, Pilot metrics).
 *   Ui3Top      the breadcrumb, the search, the bell, credits and Add what you know.
 *   Ui3MobileTop, Ui3TabBar, Ui3More   phones and tablets.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Me } from "@/lib/tableTypes";
import type { NavItem2 } from "../navModel";
import type { Crumb } from "../shell/Header";
import { useApp } from "../shell/pages";
import { useKnown, usePaths } from "../network/usePaths";
import { store } from "../hooks";
import { Art, MarkIcon } from "./illustrations";
import { Ic, type IconName } from "./icons";
import { useTargets, useWarmShared } from "./data";
import { initialsOf } from "./model";
import "./fonts";
import "./shell.css";

const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/* ---------- theme: light, dark or the system's (a per-viewer convenience) ---------- */

export type Ui3Theme = "light" | "dark" | "system";
const THEME_KEY = "rn_ui3_theme";
const RAIL_KEY = "rn_ui3_nav";
export const readTheme = (): Ui3Theme => {
  const v = store.get(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
};
/** The theme on <html> while the new design is on; taken off again when it goes. */
export function useUi3Theme(): [Ui3Theme, (t: Ui3Theme) => void] {
  const [t, setT] = useState<Ui3Theme>("system");
  useEffect(() => setT(readTheme()), []);
  useEffect(() => {
    const el = document.documentElement;
    if (t === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", t);
    return () => el.removeAttribute("data-theme");
  }, [t]);
  return [t, (x) => (store.set(THEME_KEY, x), setT(x))];
}

/* ---------- the items ---------- */

export interface U3Item {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  count?: number | null;
  badge?: number | null;
  pill?: string | null;
  current: boolean;
  /** The new look's item it opens (navTo2), or a page key for the new design's own. */
  nav: NavItem2;
}
export interface U3Groups {
  top: U3Item[];
  find: U3Item[];
  work: U3Item[];
  community: U3Item[];
  /** Behind the gear (and in More on phones): the rest of Merlin. */
  more: U3Item[];
}

const ICON: Record<string, IconName> = {
  today: "home", radar: "sparkle", network: "network", companies: "building", warm: "route", pipeline: "pipe", alerts: "flow", proposals: "doc",
  contracts: "contract", evidence: "vault", fractionals: "team", messages: "chat", find: "search", people: "person", engagements: "seat", hiring: "brief",
  agent: "bolt", rates: "coin", credits: "coin", settings: "gear", metrics: "trend",
};
const LABEL: Record<string, string> = { network: "My Network", radar: "Crystal Ball", companies: "Target Companies", warm: "Warm Paths", alerts: "Workflows", people: "People", engagements: "Seats", find: "Find" };

/** The nav's counts, from real data: people the member knows, Opportunities, companies with a way in. */
function useCounts() {
  const known = useKnown().known;
  const { opps } = useTargets();
  const warm = useWarmShared().data;
  const { view: paths } = usePaths();
  return {
    network: known ? known.people.filter((p) => !p.away).length : null,
    companies: opps.length,
    warm: warm ? warm.rows.filter((r) => !!r.via).length : paths ? Object.values(paths.counts).filter((c) => c.n > 0).length : null,
  };
}

export function useUi3Groups(nav2: NavItem2[], current: string | null, hrefOf: (k: string) => string): U3Groups {
  const counts = useCounts();
  return useMemo(() => {
    const by = new Map(nav2.map((n) => [n.key, n]));
    const synth = (key: string, page: string): NavItem2 => ({ key, label: LABEL[key] ?? key, group: "top", icon: "home", href: hrefOf(page), page: page as NavItem2["page"], current: false });
    const mk = (key: string, extra: Partial<U3Item> = {}): U3Item | null => {
      const n = by.get(key) ?? (key === "network" ? synth("network", "network") : key === "warm" ? synth("warm", "warm") : null);
      if (!n) return null;
      return { key, label: LABEL[key] ?? n.label, icon: ICON[key] ?? "home", href: n.href, count: n.count ?? null, pill: n.pill?.kind === "plan" ? n.pill.text : null, current: current === key, nav: n, ...extra };
    };
    const list = (xs: (U3Item | null)[]) => xs.filter((x): x is U3Item => !!x);
    const radar = by.get("radar");
    return {
      top: list([mk("today", { count: null }), mk("radar", { count: null, badge: radar?.count ?? null })]),
      find: list([mk("network", { count: counts.network }), mk("companies", { count: counts.companies }), mk("warm", { count: counts.warm })]),
      work: list([mk("pipeline"), mk("alerts", { count: null }), mk("proposals"), mk("contracts", { count: null }), mk("evidence", { count: null })]),
      community: list([mk("fractionals", { count: null }), mk("messages", { count: null, badge: by.get("messages")?.count ?? null })]),
      more: list([mk("find", { count: null }), mk("people", { count: null }), mk("engagements", { count: null }), mk("hiring", { count: null, pill: null }), mk("settings", { count: null }), mk("credits"), mk("rates"), mk("agent"), mk("metrics")]),
    };
  }, [nav2, current, hrefOf, counts.network, counts.companies, counts.warm]);
}

function NavLink({ it, onNav, cls }: { it: U3Item; onNav: (n: NavItem2) => void; cls: string }) {
  return (
    <a
      className={cls}
      href={it.href}
      title={it.label}
      aria-current={it.current ? "page" : undefined}
      data-nav={it.key}
      onClick={(e) => {
        if (!ownClick(e)) return;
        e.preventDefault();
        onNav(it.nav);
      }}
    >
      <Ic n={it.icon} />
      <span className="u3-nl">{it.label}</span>
      {it.badge ? <span className="m-badge" aria-label={`${it.badge} new`}>{it.badge}</span> : it.pill ? <span className="u3-pill">{it.pill}</span> : it.count != null && it.count > 0 ? <span className="m-count">{it.count.toLocaleString("en-US")}</span> : null}
    </a>
  );
}

/* ---------- the navigation ---------- */

export function Ui3Nav({
  groups,
  me,
  onNav,
  onHome,
  onAccount,
  accountRef,
  onGear,
  gearRef,
}: {
  groups: U3Groups;
  me: Me;
  onNav: (n: NavItem2) => void;
  onHome: () => void;
  onAccount: () => void;
  accountRef: RefObject<HTMLButtonElement | null>;
  onGear: () => void;
  gearRef: RefObject<HTMLButtonElement | null>;
}) {
  const sec = (title: string, items: U3Item[]) =>
    items.length ? (
      <>
        <div className="m-nav-sec">{title}</div>
        {items.map((it) => (
          <NavLink key={it.key} it={it} onNav={onNav} cls="m-nav-item" />
        ))}
      </>
    ) : null;
  const sub = me.title || (me.function ? `Fractional ${me.function}` : "Member");
  // The sidebar folds to a 72px icon rail. The member's choice is kept in this browser; with none yet, Pipeline under 1366px opens folded.
  const onPipe = [...groups.work].some((x) => x.key === "pipeline" && x.current);
  const [pref, setPref] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    setPref(store.get(RAIL_KEY));
    const on = () => setWide(window.innerWidth >= 1366);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const rail = pref ? pref === "rail" : onPipe && !wide;
  useEffect(() => {
    document.documentElement.classList.toggle("u3-railed", rail);
    return () => document.documentElement.classList.remove("u3-railed");
  }, [rail]);
  const flip = () => {
    const v = rail ? "full" : "rail";
    store.set(RAIL_KEY, v);
    setPref(v);
  };
  return (
    <aside className={`m-nav u3${rail ? " u3-rail" : ""}`} aria-label="Main">
      <Art name="navLand" className="m-nav-art" />
      <a
        className="m-brand"
        href="/"
        onClick={(e) => {
          if (!ownClick(e)) return;
          e.preventDefault();
          onHome();
        }}
      >
        <MarkIcon color="#f6f2e8" />
        <span className="u3-bw">Merlin</span>
      </a>
      <button type="button" className="u3-railbtn" onClick={flip} aria-label={rail ? "Expand the sidebar" : "Collapse the sidebar"} title={rail ? "Expand the sidebar" : "Collapse the sidebar"}>
        <Ic n="panel" />
      </button>
      <nav className="u3-navlist" aria-label="Pages">
        {groups.top.map((it) => (
          <NavLink key={it.key} it={it} onNav={onNav} cls="m-nav-item" />
        ))}
        {sec("Find", groups.find)}
        {sec("Work", groups.work)}
        {sec("Community", groups.community)}
      </nav>
      <div className="m-nav-foot m-account">
        <button type="button" className="m-user" ref={accountRef} onClick={onAccount} aria-haspopup="menu">
          <span className="m-av">{initialsOf(me.name || "You")}</span>
          <span className="u3-ellip">
            <b>{me.name}</b>
            <small>{sub}</small>
          </span>
        </button>
        <button type="button" className="m-gear" ref={gearRef} onClick={onGear} aria-label="Settings and more" aria-haspopup="menu">
          <Ic n="gear" />
        </button>
      </div>
    </aside>
  );
}

/* ---------- the gear's menu: the rest of Merlin, and the theme ---------- */

export function Ui3GearMenu({ groups, anchor, onNav, onClose, theme, setTheme }: { groups: U3Groups; anchor: HTMLElement; onNav: (n: NavItem2) => void; onClose: () => void; theme: Ui3Theme; setTheme: (t: Ui3Theme) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    setPos({ left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 8 });
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && (onClose(), anchor.focus());
    const out = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", out);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", out);
    };
  }, [anchor, onClose]);
  return (
    <div className="m-menu u3 u3-gear" role="menu" ref={ref} style={pos ? { position: "fixed", left: pos.left, bottom: pos.bottom } : { visibility: "hidden" }}>
      {groups.more.map((it) => (
        <button key={it.key} type="button" role="menuitem" onClick={() => (onClose(), onNav(it.nav))} aria-current={it.current ? "page" : undefined}>
          <Ic n={it.icon} />
          <span>
            <b>{it.label}</b>
          </span>
        </button>
      ))}
      <div className="u3-menu-sec">Theme</div>
      <div className="m-seg u3-theme" role="group" aria-label="Theme">
        {(["light", "dark", "system"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {t === "system" ? "Auto" : t === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- the top bar ---------- */

export function Crumbs({ crumbs, title }: { crumbs: Crumb[]; title: string }) {
  return (
    <nav className="m-crumb" aria-label="Breadcrumb">
      {crumbs.map((c) => (
        <span key={c.label} className="u3-cr">
          {c.href && c.go ? (
            <a
              href={c.href}
              onClick={(e) => {
                if (!ownClick(e)) return;
                e.preventDefault();
                c.go!();
              }}
            >
              {c.label}
            </a>
          ) : (
            <span>{c.label}</span>
          )}
          <Ic n="right" />
        </span>
      ))}
      <b aria-current="page">{title}</b>
    </nav>
  );
}

export function Ui3Top({ crumbs, title, search, actions, hosts }: { crumbs: Crumb[]; title: string; search?: ReactNode; actions?: ReactNode; hosts?: ReactNode }) {
  return (
    <header className="m-top u3">
      <Crumbs crumbs={crumbs} title={title} />
      <div className="m-sp" />
      {search && <div className="m-search u3-search">{search}</div>}
      {actions && <div className="u3-acts">{actions}</div>}
      {hosts}
    </header>
  );
}

/* ---------- phones and tablets ---------- */

export function Ui3MobileTop({ onHome, search, actions, onAccount, accountRef, hosts }: { onHome: () => void; search: ReactNode; actions?: ReactNode; onAccount: () => void; accountRef: RefObject<HTMLButtonElement | null>; hosts?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open]);
  return (
    <>
      <header className="m-mtop u3">
        <a
          className="m-brand"
          href="/"
          onClick={(e) => {
            if (!ownClick(e)) return;
            e.preventDefault();
            onHome();
          }}
        >
          <MarkIcon color="#f6f2e8" />
          Merlin
        </a>
        <div className="m-sp" />
        <button type="button" className="m-iconbtn" aria-label={open ? "Close search" : "Search"} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          <Ic n={open ? "x" : "search"} />
        </button>
        {actions && <div className="u3-macts">{actions}</div>}
        <button type="button" className="m-iconbtn" aria-label="Your account" aria-haspopup="menu" ref={accountRef} onClick={onAccount}>
          <Ic n="user" />
        </button>
        {hosts}
      </header>
      {open && (
        <div className="u3-msearch u3" ref={box}>
          <div className="m-search u3-search">{search}</div>
        </div>
      )}
    </>
  );
}

const TABS = ["today", "radar", "companies", "warm"] as const;
const TAB_LABEL: Record<string, string> = { today: "Home", radar: "Crystal Ball", companies: "Targets", warm: "Paths" };

export function Ui3TabBar({ groups, onNav, onMore, moreOpen, moreRef }: { groups: U3Groups; onNav: (n: NavItem2) => void; onMore: () => void; moreOpen: boolean; moreRef: RefObject<HTMLButtonElement | null> }) {
  const all = [...groups.top, ...groups.find];
  const tabs = TABS.map((k) => all.find((x) => x.key === k)).filter((x): x is U3Item => !!x);
  const onTab = tabs.some((t) => t.current);
  return (
    <nav className="m-tabbar u3" aria-label="Main">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          data-nav={t.key}
          onClick={(e) => {
            if (!ownClick(e)) return;
            e.preventDefault();
            onNav(t.nav);
          }}
        >
          <span className="ti">
            <Ic n={t.icon} />
          </span>
          {TAB_LABEL[t.key]}
          {t.badge ? <span className="bd">{t.badge}</span> : null}
        </a>
      ))}
      <button type="button" ref={moreRef} aria-expanded={moreOpen} aria-current={!onTab && !moreOpen ? "page" : undefined} onClick={onMore}>
        <span className="ti">
          <Ic n="grid" />
        </span>
        More
      </button>
    </nav>
  );
}

export function Ui3More({ groups, onNav, onClose, theme, setTheme }: { groups: U3Groups; onNav: (n: NavItem2) => void; onClose: () => void; theme: Ui3Theme; setTheme: (t: Ui3Theme) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("a,button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const sec = (title: string, items: U3Item[]) =>
    items.length ? (
      <section className="u3-more-sec">
        <h2 className="m-nav-sec">{title}</h2>
        <div className="u3-more-grid">
          {items.map((it) => (
            <a
              key={it.key}
              href={it.href}
              aria-current={it.current ? "page" : undefined}
              onClick={(e) => {
                if (!ownClick(e)) return;
                e.preventDefault();
                onClose();
                onNav(it.nav);
              }}
            >
              <Ic n={it.icon} />
              <span>{it.label}</span>
              {it.badge ? <span className="m-badge">{it.badge}</span> : it.pill ? <span className="u3-pill">{it.pill}</span> : null}
            </a>
          ))}
        </div>
      </section>
    ) : null;
  const find = groups.find.filter((x) => !(TABS as readonly string[]).includes(x.key));
  return (
    <div className="m-scrim u3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="m-sheet u3-more" role="dialog" aria-label="More" ref={ref}>
        {sec("Find", find)}
        {sec("Work", groups.work)}
        {sec("Community", groups.community)}
        {sec("More", groups.more)}
        <div className="u3-more-sec">
          <h2 className="m-nav-sec">Theme</h2>
          <div className="m-seg u3-theme" role="group" aria-label="Theme">
            {(["light", "dark", "system"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t === "system" ? "Auto" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** For pages: the new design's AppCtx, plus the shell's own hooks. */
export { useApp };
