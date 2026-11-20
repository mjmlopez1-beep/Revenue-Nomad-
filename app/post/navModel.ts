/**
 * The way around the app, as pure data: the sidebar's items (desktop), the phone's tab bar and its
 * More sheet are all drawn from navItems, so scripts/test-nav.mts checks with no browser that every
 * page is one click away, that exactly the page on screen is marked, and that what is an admin's
 * stays an admin's.
 *
 * TradingPost works out the hrefs (its own placeUrl, so a middle-click opens the same place in a
 * new tab) and the counts; this file only decides what is listed, in what order, and which is on.
 */
import type { PlanView } from "@/lib/tableTypes";
import { FEATURE_NAME } from "@/lib/radar/types";
import type { RecordType, Tab } from "./model";

/** Every page TradingPost draws (its Page type). */
export const APP_PAGES = ["today", "table", "credits", "rates", "seats", "metrics", "messages", "integrations", "partners", "billing", "radar", "network"] as const;
export type AppPageKey = (typeof APP_PAGES)[number];

export type NavGroup = "home" | "find" | "yours" | "earn" | "foot";
export type NavIcon =
  | "home" | "companies" | "seats" | "people" | "radar" | "hiring" | "views" | "view" | "following" | "yourseats" | "messages" | "network"
  | "add" | "partners" | "rates" | "invite" | "integrations" | "billing" | "credits" | "metrics";

export interface NavItem {
  /** "today", "companies", "radar", "view:<id>" and the rest: data-nav in the page, and the key the tests use. */
  key: string;
  label: string;
  group: NavGroup;
  icon: NavIcon;
  /** A place (a real link). Without one the item is a button that opens a sheet (Add what you know, Invite). */
  href?: string;
  /** The page it opens, when it opens one. */
  page?: AppPageKey;
  /** A small muted number after the label (null: not known yet, so nothing is drawn). */
  count?: number | null;
  /** A count that wants the member (unread, new): drawn as a badge when above 0. */
  badge?: number;
  /** What the badge counts, for screen readers ("3 unread"). */
  badgeOf?: string;
  /** A short note after the label ("2 to fill in", "+10 each"). */
  hint?: string;
  /** The place on screen: drawn with aria-current="page". */
  current: boolean;
  /** Admins only (never listed for a member). */
  admin?: boolean;
}

export interface SavedViewNav {
  id: string;
  name: string;
  href: string;
  /** Matches new since the last visit, null until the whole table is here. */
  fresh: number | null;
}

export interface NavInput {
  page: AppPageKey;
  /** The table's place: what it lists and its view, and the saved view it is (null: none). */
  recordType: RecordType;
  tab: Tab;
  currentView: string | null;
  /** A record is open over the table (the table's item stays on). */
  hrefs: {
    today: string;
    companies: string;
    engagements: string;
    people: string;
    hiring: string;
    following: string;
    /** ?p=<page> for each page. */
    page: (p: AppPageKey) => string;
  };
  /** An admin, not seeing the table as a member (Me.admin with View.admin). */
  admin: boolean;
  /** Billing is live (Me.plan): Plan and billing is listed. */
  plan?: PlanView;
  /** Your network is on (RN_GOOGLE). */
  network: boolean;
  networkN?: number | null;
  unread: number;
  radarNew: number;
  /** Companies, seats and people on file (null while only the first screen is here). */
  totals: Record<RecordType, number> | null;
  hiringN: number | null;
  followingN: number | null;
  seatsMissing: number | null;
  credits: number;
  views: SavedViewNav[];
  /** Invite a fractional's bonus, "+10 each". */
  inviteBonus: number;
}

/** "Pro trial · 9 days left", "Pro", "Free": the plan's line in the sidebar's foot. */
export function planLine(plan: PlanView | undefined): string | null {
  if (!plan) return null;
  if (plan.name === "trial") return `Pro trial · ${plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft ?? 0} days left`}`;
  return plan.name === "pro" ? "Pro" : "Free";
}

/** Which item is on: the page, else on the table the saved view, Hiring now, Following or the list. */
export function currentKey(x: Pick<NavInput, "page" | "recordType" | "tab" | "currentView">): string {
  if (x.page !== "table") return x.page;
  if (x.currentView) return `view:${x.currentView}`;
  if (x.tab === "hiring") return "hiring";
  if (x.tab === "following") return "following";
  return x.recordType;
}

/** The sidebar, top to bottom: Home, Find, Yours, Earn, then the foot. */
export function navItems(x: NavInput): NavItem[] {
  const on = currentKey(x);
  const t = x.totals;
  const items: Omit<NavItem, "current">[] = [
    { key: "today", label: "Home", group: "home", icon: "home", href: x.hrefs.today, page: "today" },
    { key: "companies", label: "Companies", group: "find", icon: "companies", href: x.hrefs.companies, page: "table", count: t ? t.companies : null },
    { key: "engagements", label: "Seats", group: "find", icon: "seats", href: x.hrefs.engagements, page: "table", count: t ? t.engagements : null },
    { key: "people", label: "People", group: "find", icon: "people", href: x.hrefs.people, page: "table", count: t ? t.people : null },
    { key: "radar", label: FEATURE_NAME, group: "find", icon: "radar", href: x.hrefs.page("radar"), page: "radar", badge: x.radarNew, badgeOf: "new today" },
    { key: "hiring", label: "Hiring now", group: "find", icon: "hiring", href: x.hrefs.hiring, page: "table", count: x.hiringN },
    ...x.views.map((v) => ({ key: `view:${v.id}`, label: v.name, group: "yours" as const, icon: "view" as const, href: v.href, page: "table" as const, badge: v.fresh ?? 0, badgeOf: "new since your last visit" })),
    { key: "following", label: "Following", group: "yours", icon: "following", href: x.hrefs.following, page: "table", count: x.followingN },
    { key: "seats", label: "Your seats", group: "yours", icon: "yourseats", href: x.hrefs.page("seats"), page: "seats", hint: x.seatsMissing ? `${x.seatsMissing} to fill in` : undefined },
    { key: "messages", label: "Messages", group: "yours", icon: "messages", href: x.hrefs.page("messages"), page: "messages", badge: x.unread, badgeOf: "unread" },
    ...(x.network ? [{ key: "network", label: "Your network", group: "yours" as const, icon: "network" as const, href: x.hrefs.page("network"), page: "network" as const, count: x.networkN ?? null }] : []),
    { key: "add", label: "Add what you know", group: "earn", icon: "add" },
    { key: "partners", label: "Referral partners", group: "earn", icon: "partners", href: x.hrefs.page("partners"), page: "partners" },
    { key: "rates", label: "Rate benchmarks", group: "earn", icon: "rates", href: x.hrefs.page("rates"), page: "rates" },
    { key: "invite", label: "Invite a fractional", group: "earn", icon: "invite", hint: `+${x.inviteBonus}` },
    { key: "integrations", label: "Integrations", group: "foot", icon: "integrations", href: x.hrefs.page("integrations"), page: "integrations" },
    ...(x.plan ? [{ key: "billing", label: "Plan and billing", group: "foot" as const, icon: "billing" as const, href: x.hrefs.page("billing"), page: "billing" as const, hint: x.plan.name === "pro" ? "Pro" : undefined }] : []),
    { key: "credits", label: "Credits", group: "foot", icon: "credits", href: x.hrefs.page("credits"), page: "credits", count: x.credits },
    ...(x.admin ? [{ key: "metrics", label: "Pilot metrics", group: "foot" as const, icon: "metrics" as const, href: x.hrefs.page("metrics"), page: "metrics" as const, admin: true }] : []),
  ];
  return items.map((it) => ({ ...it, current: it.key === on }));
}

/** The phone's tab bar: these four, then More (the rest of the sidebar, in a sheet). */
export const TAB_KEYS = ["today", "companies", "radar", "messages"] as const;

/** Whether More is the place on screen (none of the four tabs is). */
export const moreOn = (items: NavItem[]) => !items.some((it) => it.current && (TAB_KEYS as readonly string[]).includes(it.key));

/**
 * What Home's search box offers before Enter: the pages whose names start a word the member typed
 * ("rates" finds Rate benchmarks, "crystal" Crystal Ball), at most 3. Enter itself searches the table.
 */
export function navMatches(text: string, items: NavItem[]): NavItem[] {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return [];
  const words = q.split(/\s+/).filter((w) => w.length >= 3);
  return items
    .filter((it) => it.href && !it.key.startsWith("view:") && it.key !== "today")
    .filter((it) => {
      const label = it.label.toLowerCase();
      const parts = label.split(/[\s-]+/);
      return label.startsWith(q) || words.some((w) => parts.some((p) => p.startsWith(w) || (w.length >= 4 && w.startsWith(p) && p.length >= 4)));
    })
    .slice(0, 3);
}
