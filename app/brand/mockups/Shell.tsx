import Link from "next/link";
import type React from "react";
import type { ReactNode } from "react";
import Illustration from "../Illustration";
import type { IllustrationId } from "@/lib/brand/manifest";

export const THEMES = ["color", "night"] as const;
export type MockTheme = (typeof THEMES)[number];
/** Which illustration set goes with a mockup theme. */
export const artOf = (theme: MockTheme) => (theme === "color" ? "color" : "dark") as "color" | "dark";

const LOGO_HUES = ["#B65E40", "#7955B5", "#2B5B4B", "#D29B43", "#3E6FD1", "#2A8C8C", "#C8506F", "#10392F"];

export const MOCKUPS = [
  { slug: "landing", label: "Landing", note: "Signed-out home page with the join form, features and pricing." },
  { slug: "home", label: "Home", note: "The signed-in start page: three moves for today." },
  { slug: "crystal-ball", label: "Crystal Ball", note: "Ranked forecast of who will hire your function next." },
  { slug: "company", label: "Company", note: "A company record with seats, who decides and your way in." },
  { slug: "pipeline", label: "Pipeline", note: "Deals from first outreach to won." },
] as const;

const ICONS: Record<string, string> = {
  home: "M3 9.5 10 3l7 6.5V17H3z",
  find: "M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12zm4.5-1.5L17 17",
  companies: "M4 17V4h7v13M11 8h5v9M2 17h16M7 7h1M7 10h1M7 13h1",
  people: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 8c0-3 2.2-5 5-5s5 2 5 5m1-8a2.5 2.5 0 1 0 0-5m1 13c0-2.4-1-4-2.6-4.7",
  seats: "M5 10V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5M4 10h12v4H4zM6 14v3m8-3v3",
  crystal: "M10 15A6 6 0 1 0 10 3a6 6 0 0 0 0 12zm-4 2h8M8 7a3 3 0 0 1 2-1.5",
  hiring: "M11 2 4 11h5l-1 7 7-9h-5z",
  paths: "M3 16c5 0 3-6 7-6s2-6 7-6M3 16h.01M17 4h.01",
  pipeline: "M3 4h4v12H3zm5 0h4v8H8zm5 0h4v5h-4z",
  proposals: "M5 2h7l4 4v12H5zm7 0v4h4M8 10h5M8 13h5",
  contracts: "M5 2h10v16H5zM8 6h4M8 9h4m-4 5c1-1.5 2 1 3-.5s1 .5 1.5.5",
  evidence: "M3 5h14v11H3zM3 5l2-2h10l2 2M8 9h4",
  fractionals: "M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 8c0-3 2.7-5 6-5s6 2 6 5",
  messages: "M3 4h14v10H9l-4 3v-3H3z",
  alerts: "M10 3a5 5 0 0 0-5 5v3l-1.5 3h13L15 11V8a5 5 0 0 0-5-5zm-2 13a2 2 0 0 0 4 0",
  agent: "M5 7h10v9H5zM10 4v3M8 11h.01M12 11h.01M3 10v3m14-3v3",
  rates: "M3 17h14M5 17v-5m4 5V8m4 9v-7m4 7V4",
  credits: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-10v6m-2-4.5c0-1 4-1 4 0s-4 2-4 3 4 1 4 0",
  settings: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4M5.7 14.3l-1.4 1.4",
  bell: "M10 3a5 5 0 0 0-5 5v3l-1.5 3h13L15 11V8a5 5 0 0 0-5-5zm-2 13a2 2 0 0 0 4 0",
  spark: "M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z",
};

export function Icon({ name }: { name: keyof typeof ICONS | string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.home} />
    </svg>
  );
}

/** Landscape art in the color theme, architecture line art in the night theme. */
export function Art({ theme, land, arch, labeled, className, priority }: { theme: MockTheme; land: string; arch?: IllustrationId; labeled?: boolean; className?: string; priority?: boolean }) {
  if (theme === "color") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/brand/landscape/${land}.svg`} alt="" className={className} loading={priority ? "eager" : "lazy"} />;
  }
  return arch ? <Illustration theme="dark" name={arch} labeled={labeled} alt="" className={className} priority={priority} /> : null;
}

export function Lock({ children }: { children: ReactNode }) {
  return (
    <span className="mk-lock">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="2" y="5.2" width="8" height="5.6" rx="1.2" />
        <path d="M4 5.2V3.8a2 2 0 0 1 4 0v1.4" />
      </svg>
      {children}
    </span>
  );
}

export function Logo({ name, size }: { name: string; size?: "sm" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.toLowerCase() !== "and")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`mk-logo${size ? ` ${size}` : ""}`} style={{ "--lg": LOGO_HUES[h % LOGO_HUES.length] } as React.CSSProperties}>
      {initials}
    </span>
  );
}

/** You, the person in between, and who decides, joined by the gold path. */
export function Route({ from = "You", via, viaNote, to, toNote }: { from?: string; via: string; viaNote: string; to: ReactNode; toNote: string }) {
  return (
    <div className="mk-route">
      <div>
        <i />
        <b>{from}</b>
        Way in
      </div>
      <div>
        <i />
        <b>{via}</b>
        {viaNote}
      </div>
      <div>
        <i />
        <b>{to}</b>
        {toNote}
      </div>
    </div>
  );
}

export function Switcher({ active, theme }: { active: string; theme: MockTheme }) {
  const other = theme === "color" ? "night" : "color";
  return (
    <nav className="mk-switch" aria-label="Mockups">
      <Link href="/brand/mockups">All</Link>
      {MOCKUPS.map((m) => (
        <Link key={m.slug} href={`/brand/mockups/${theme}/${m.slug}`} className={m.slug === active ? "on" : undefined}>
          {m.label}
        </Link>
      ))}
      <Link href={`/brand/mockups/${other}/${active}`} className="alt">
        {other === "night" ? "Night version" : "Color version"}
      </Link>
    </nav>
  );
}

const NAV: { heading?: string; items: { label: string; icon: string; count?: string; hot?: boolean; tag?: string; slug?: string }[] }[] = [
  { items: [{ label: "Home", icon: "home", slug: "home" }, { label: "Find", icon: "find" }] },
  {
    heading: "Data",
    items: [
      { label: "Companies", icon: "companies", count: "64", slug: "company" },
      { label: "People", icon: "people", count: "212" },
      { label: "Seats", icon: "seats", count: "97" },
    ],
  },
  {
    heading: "Signals",
    items: [
      { label: "Crystal Ball", icon: "crystal", count: "14", slug: "crystal-ball" },
      { label: "Hiring now", icon: "hiring", count: "6", hot: true },
      { label: "Warm paths", icon: "paths", count: "9" },
    ],
  },
  {
    heading: "Close",
    items: [
      { label: "Pipeline", icon: "pipeline", count: "4", slug: "pipeline" },
      { label: "Proposals", icon: "proposals", count: "2" },
      { label: "Contracts", icon: "contracts", tag: "New" },
      { label: "Evidence Bank", icon: "evidence", tag: "New" },
    ],
  },
  {
    heading: "Community",
    items: [
      { label: "Fractionals", icon: "fractionals", count: "38" },
      { label: "Messages", icon: "messages", count: "1" },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { label: "Rate benchmarks", icon: "rates" },
      { label: "Credits and usage", icon: "credits" },
      { label: "Settings", icon: "settings" },
    ],
  },
];

export function Shell({ active, theme, crumb, children }: { active: string; theme: MockTheme; crumb: ReactNode; children: ReactNode }) {
  return (
    <div className={`ml mk mk-${theme}`}>
      <div className="mk-shell">
        <aside className="mk-side">
          <Link href="/brand/mockups" className="mk-wordmark">
            merlin<i>.</i>
          </Link>
          <div className="mk-nav-scroll">
            {NAV.map((g, i) => (
              <div className="mk-nav" key={i}>
                {g.heading && <h4>{g.heading}</h4>}
                {g.items.map((it) => (
                  <Link key={it.label} href={it.slug ? `/brand/mockups/${theme}/${it.slug}` : "#"} className={it.slug === active ? "on" : undefined}>
                    <Icon name={it.icon} />
                    {it.label}
                    {it.count && (it.hot ? <span className="mk-pill solid" style={{ marginLeft: "auto", padding: "0 8px" }}>{it.count}</span> : <em>{it.count}</em>)}
                    {it.tag && <span className="mk-pill" style={{ marginLeft: "auto", padding: "0 8px" }}>{it.tag}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {theme === "color" && <img className="mk-rail-art" src="/brand/landscape/rail-night.svg" alt="" />}
          <div className="mk-side-foot">
            <div className="mk-credits">
              <div className="mk-row between">
                <span style={{ fontWeight: 700 }}>Close trial</span>
                <a className="mk-pill lime" href="#">Upgrade</a>
              </div>
              <small>16 days left</small>
              <div className="mk-bar"><i style={{ width: "24%" }} /></div>
            </div>
            <div className="mk-me">
              <span>JS</span>
              <div>
                <b>Jane Smith</b>
                <small>Fractional VP Sales</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="mk-main">
          <header className="mk-topbar">
            <div className="mk-dim" style={{ fontWeight: 600 }}>{crumb}</div>
            <div className="spacer" />
            <span className="mk-dim" style={{ width: 18, height: 18, display: "inline-flex" }}><Icon name="bell" /></span>
            <span className="mk-pill gold"><span className="mk-dot" />25 credits</span>
            <a className="mk-btn" href="#">+ Add what you know</a>
          </header>
          {children}
        </div>
      </div>
      <Switcher active={active} theme={theme} />
    </div>
  );
}
