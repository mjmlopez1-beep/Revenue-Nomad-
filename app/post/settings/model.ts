/**
 * Settings (Settings.dc.html, Stage 8), as pure data so scripts/test-settings.mts checks it with no
 * browser: the section list, Your setup (what is done and what is next), the Connections table (each
 * source, what it reads and never does, its last activity, what it feeds, and the one call its
 * Remove makes, the same as that source's own delete), the Notifications grid (each event's
 * channels, read from Alerts and workflows' own rows, and the call a switch makes there), and the
 * sample note in the member's voice.
 *
 * Nothing here is stored. Each switch and each Remove goes to the home it has today.
 */
import type { Action } from "@/lib/tableTypes";
import type { LinkView } from "@/lib/google/types";
import type { LinkedInInfo } from "@/lib/paths/types";
import type { ExportInfo } from "@/lib/linkedin/types";
import type { DestView } from "@/lib/notify/types";
import type { GranolaStatus } from "@/lib/granola/types";
import { greetingWords, expandContractions, phraseSlot, asSentence, type VoiceStyle } from "@/lib/voice";
import type { SettingsSection } from "../place";
import type { ConnKey } from "./at";
import type { ChanKey, Group, Row } from "../alerts/model";

export type SecKey = SettingsSection;

/** The section list, in the mockup's order, with Your agents (Stage 7a's card) before Plan. */
export const SECTIONS: { key: SecKey; name: string }[] = [
  { key: "profile", name: "Profile and card" },
  { key: "ideal", name: "Ideal client" },
  { key: "voice", name: "Voice" },
  { key: "conn", name: "Connections" },
  { key: "notif", name: "Notifications" },
  { key: "sig", name: "Signature" },
  { key: "priv", name: "Privacy" },
  { key: "agents", name: "Your agents" },
  { key: "plan", name: "Plan" },
  { key: "data", name: "Your account" },
];
export const secName = (k: SecKey) => SECTIONS.find((s) => s.key === k)?.name ?? "Settings";

/** Each section's lead under its title. */
export const SEC_LEAD: Record<SecKey, string> = {
  profile: "Who you are in Merlin, and the card other members see in Fractionals.",
  ideal: "The companies you want as clients. Find, Crystal Ball, Hiring now and your lists start from this.",
  voice: "How Merlin writes as you. Style only, never the text of a message. Only you see it.",
  conn: "What Merlin is allowed to read, and where it can post. Each row says what it reads and what it never does.",
  notif: "What Merlin sends you by email, in Slack and on the bell, event by event. The same switches as Alerts and workflows.",
  sig: "Set it once. Merlin applies it when you send a proposal signed, or countersign after your client.",
  priv: "Who can see you, your name and your seats.",
  agents: "Use Merlin from your own agent, and teach it your network and your voice.",
  plan: "What you are on, what each plan gives, and where your credits go.",
  data: "Your sign-in link, where your data goes, and closing your account.",
};

/* ---------- Your setup ---------- */

export type SetupKey = "profile" | "ideal" | "seats" | "source" | "voice" | "sig" | "alerts";
export interface SetupInput {
  /** One line about them on their card (Profile.headline). */
  headline: boolean;
  /** An ideal client and a function. */
  icp: boolean;
  /** Seats they held, on file. */
  seats: number;
  /** A source of who they know: Google, the LinkedIn connections file or a contacts file. */
  source: boolean;
  voice: boolean;
  /** A saved signature; null when signing isn't part of their plan (it then isn't counted). */
  sig: boolean | null;
  /** A list with its alert on. */
  alert: boolean;
}
export interface SetupItem {
  key: SetupKey;
  label: string;
  done: boolean;
  /** The next step's words: what to do, and why. */
  next: string;
  why: string;
  /** Where its button goes: a section here, or a page. */
  go: { sec: SecKey } | { page: "seats" | "alerts" };
}
/** The order "Next" walks: the ones that change what Merlin shows first. */
const SETUP: { key: SetupKey; label: string; next: string; why: string; go: SetupItem["go"] }[] = [
  { key: "ideal", label: "Ideal client", next: "Say who you want as clients", why: "Find, Crystal Ball and your lists start from it.", go: { sec: "ideal" } },
  { key: "source", label: "A source connected", next: "Bring in who you know", why: "Step 3 of getting started. It turns into warm paths.", go: { sec: "conn" } },
  { key: "seats", label: "Seats", next: "Add the seats you held", why: "Each fact Merlin does not have earns a credit.", go: { page: "seats" } },
  { key: "alerts", label: "Alerts", next: "Turn on an alert", why: "Merlin watches a list for you.", go: { page: "alerts" } },
  { key: "voice", label: "Voice", next: "Set how Merlin writes as you", why: "So drafts sound like you.", go: { sec: "voice" } },
  { key: "profile", label: "Profile", next: "Add your one line", why: "It shows on your card.", go: { sec: "profile" } },
  { key: "sig", label: "Signature", next: "Add your signature", why: "So proposals go out signed.", go: { sec: "sig" } },
];
export function setupMeter(x: SetupInput): { items: SetupItem[]; done: number; of: number; next: SetupItem | null; text: string; note: string } {
  const has: Record<SetupKey, boolean | null> = { profile: x.headline, ideal: x.icp, seats: x.seats > 0, source: x.source, voice: x.voice, sig: x.sig, alerts: x.alert };
  const items: SetupItem[] = SETUP.filter((s) => has[s.key] !== null).map((s) => ({ ...s, done: !!has[s.key] }));
  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done) ?? null;
  return {
    items,
    done,
    of: items.length,
    next,
    text: `${done} of ${items.length} done`,
    note: next ? `Next: ${next.next.charAt(0).toLowerCase()}${next.next.slice(1)}. ${next.why}` : "All set. Nothing is waiting on you.",
  };
}

/* ---------- Connections ---------- */

export interface ConnInput {
  /** Google (RN_GOOGLE): null while it is off for Merlin, so no row. */
  google: { configured: boolean; link: LinkView | null; gmail: LinkView | null; claude: { at: string; companies: number } | null; syncing: boolean; companies: number } | null;
  /** The member's own files (RN_PATHS): null while off, so no rows. */
  paths: { linkedin: LinkedInInfo | null; csv: LinkedInInfo | null; /** The LinkedIn data export (lib/linkedin): its row shows once its answer is in (undefined: no row). */ lix?: ExportInfo | null } | null;
  /** GET /api/integrations, or null while it loads. */
  integ: { allowed: boolean; slackApp: boolean; slack: DestView | null; webhook: DestView | null } | null;
  /** Granola (RN_GRANOLA, off by default): no row unless it is on. */
  granola: GranolaStatus | null;
  /** Agents with a live grant (GET /api/oauth/apps), or null while loading. */
  apps: { id: string; name: string; connectedAt: string; lastUsedAt: string }[] | null;
  nowMs: number;
}
export interface Feed {
  label: string;
  why: string;
  page: "warm" | "people" | "radar" | "seats" | "alerts" | "messages" | "proposals" | "pipeline" | "agent" | "credits";
}
export interface ConnRow {
  key: ConnKey;
  name: string;
  sub: string;
  on: boolean;
  /** A word for its state, and the line under it. */
  status: string;
  since: string;
  /** Needs attention (a Google link that stopped, a Slack URL that failed). */
  trouble: boolean;
  reads: string;
  never: string;
  last: string;
  feeds: Feed[];
  /** The button that opens its row: Connect, Add the file, Manage. */
  go: string;
  /** Remove: the question first, then what Yes says. Null while there is nothing to remove. */
  remove: { ask: string; yes: string } | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Today", "Yesterday", "Nov 18". */
export function dayWords(iso: string | null | undefined, nowMs: number): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  if (key(d) === key(new Date(nowMs))) return "Today";
  if (key(d) === key(new Date(nowMs - 86_400_000))) return "Yesterday";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
const n = (x: number) => x.toLocaleString("en-US");
const ALERT_FEEDS: Feed[] = [
  { label: "Alerts and workflows", why: "The alerts you pick post here", page: "alerts" },
  { label: "Crystal Ball", why: "Each company as it moves", page: "radar" },
  { label: "Messages", why: "Who wrote, with a link to reply", page: "messages" },
];

export function connRows(x: ConnInput): ConnRow[] {
  const rows: ConnRow[] = [];
  // In a phrase: "Read today", "Posted yesterday", "Since Nov 18".
  const day = (iso: string | null | undefined) => {
    const w = dayWords(iso, x.nowMs);
    return w === "Today" || w === "Yesterday" ? w.toLowerCase() : w;
  };
  if (x.google) {
    const g = x.google.link;
    const stopped = !!g && g.status === "reconnect";
    rows.push({
      key: "google",
      name: "Google",
      sub: "Contacts and calendar",
      on: !!g,
      status: !g ? (x.google.configured ? "Not connected" : "Not set up on Merlin") : stopped ? "Needs reconnecting" : "Connected",
      since: g ? `Since ${day(g.connectedAt)}${x.google.gmail ? " · Gmail too" : ""}` : "Step 3 of getting started",
      trouble: stopped,
      reads: "Names, companies and titles in your contacts. Who you met, and when, from your calendar.",
      never: "Read email text or subjects, keep meeting titles or notes, or show your contacts to anyone.",
      last: x.google.syncing ? "Reading now" : g?.syncedAt ? `Read ${day(g.syncedAt)}` : g ? "Not read yet" : "Nothing yet",
      feeds: [
        { label: "Warm paths", why: "Who can introduce you", page: "warm" },
        { label: "People", why: "Marks the people you know", page: "people" },
        { label: "Crystal Ball", why: "Ranks by real relationships", page: "radar" },
        { label: "Seats", why: "Seats you might have held", page: "seats" },
      ],
      go: g ? "Manage" : "Connect",
      remove: g
        ? {
            ask: "Disconnect Google? Merlin revokes its access at Google and deletes everything it kept about your network, what your agent saved included, at once. Your pipeline keeps your deals without the names that came from Google.",
            yes: "Disconnect and delete",
          }
        : null,
    });
  }
  if (x.paths) {
    const li = x.paths.linkedin;
    rows.push({
      key: "linkedin",
      name: "LinkedIn connections file",
      sub: "Your own file from LinkedIn",
      on: !!li,
      status: li ? "Added" : "Not added",
      since: li ? (li.namesOnly ? `${n(li.rows)} people · ${n(li.byLink ?? 0)} matched by profile link` : `${n(li.rows)} people · ${n(li.matched)} at companies on Merlin`) : "Step 3 of getting started",
      trouble: false,
      // LinkedIn's files from December 2026 have names and profile links only.
      reads: "Names, profile links and the date you connected, and companies and titles where the file has them.",
      never: "Ask for your LinkedIn sign-in, contact anyone in it, or show it to another member.",
      last: li ? `Added ${day(li.at)}` : "Nothing yet",
      feeds: [
        { label: "Warm paths", why: "More ways in", page: "warm" },
        { label: "People", why: "Marks the people you know", page: "people" },
      ],
      go: li ? "Manage" : "Add the file",
      remove: li ? { ask: "Delete your LinkedIn connections? The ways in found only from them go too. This can't be undone.", yes: "Delete the file" } : null,
    });
    // The whole LinkedIn data export (lib/linkedin): read on the member's device, only what they ticked brought in.
    if (x.paths.lix !== undefined) {
      const lx = x.paths.lix;
      const c = lx?.counts ?? {};
      rows.push({
        key: "lix",
        name: "LinkedIn data export",
        sub: "Your own export, read on your device",
        on: !!lx,
        status: lx ? "Brought in" : "Not added",
        since: lx ? [c.connections ? `${n(c.connections)} connections` : "", c.warm ? `warmth for ${n(c.warm)}` : "", c.positions ? `${n(c.positions)} roles` : "", c.follows ? `${n(c.follows)} to follow` : ""].filter(Boolean).join(" · ") || "Nothing ticked" : "Request it early",
        trouble: false,
        reads: "Connections, invitations, your roles, who you message and how often, who vouched for you, companies you follow, skills, and your posts for your voice if you tick it.",
        never: "Read your messages' words, logins, receipts, phone numbers or ads data, upload the archive, or show any of it to another member.",
        last: lx ? `Brought in ${day(lx.at)}` : "Nothing yet",
        feeds: [
          { label: "Warm paths", why: "How warm each way in is", page: "warm" },
          { label: "People", why: "Marks the people you know", page: "people" },
          { label: "Seats", why: "Roles to confirm as seats", page: "seats" },
        ],
        go: lx ? "Manage" : "Bring it in",
        remove: lx ? { ask: "Remove what your export brought in? Its connections, invitations, warmth, who vouched, roles and proof go, with the ways in found only from them. Seats you confirmed, companies you followed and your voice stay.", yes: "Remove it" } : null,
      });
    }
    const cv = x.paths.csv;
    rows.push({
      key: "csv",
      name: "A contacts file",
      sub: "Any list with a name and a company",
      on: !!cv,
      status: cv ? "Added" : "Not added",
      since: cv ? `${n(cv.rows)} people · ${n(cv.matched)} at companies on Merlin` : "Optional",
      trouble: false,
      reads: "Only the columns you pick: name, company, title and email.",
      never: "Read any other column, email anyone on it, or share it with another member.",
      last: cv ? `Added ${day(cv.at)}` : "Nothing yet",
      feeds: [
        { label: "Warm paths", why: "More ways in", page: "warm" },
        { label: "People", why: "Marks the people you know", page: "people" },
      ],
      go: cv ? "Manage" : "Add the file",
      remove: cv ? { ask: "Delete your contacts file? The ways in found only from it go too. This can't be undone.", yes: "Delete the file" } : null,
    });
  }
  const integ = x.integ;
  if (!integ || integ.allowed) {
    const s = integ?.slack ?? null;
    rows.push({
      key: "slack",
      name: "Slack",
      sub: "Alerts in a channel you pick",
      on: !!s,
      status: !integ ? "Loading" : s ? (s.broken ? "Stopped" : "Connected") : "Not connected",
      since: s ? (s.channel ? `${s.channel}${s.team ? ` in ${s.team}` : ""}` : `Since ${day(s.addedAt)}`) : "Email alerts still reach you",
      trouble: !!s && (s.broken || !!s.problem),
      reads: "Nothing. It can only post to the one channel you pick.",
      never: "Read your messages, your channels or your people.",
      last: s ? (s.lastOkAt ? `Posted ${day(s.lastOkAt)}` : "Not posted yet") : "Nothing yet",
      feeds: ALERT_FEEDS,
      go: s ? "Manage" : "Connect",
      remove: s ? { ask: "Remove Slack? Alerts to it stop at once.", yes: "Remove Slack" } : null,
    });
    const h = integ?.webhook ?? null;
    rows.push({
      key: "hook",
      name: "Other tools",
      sub: "A webhook for Zapier, Make or n8n",
      on: !!h,
      status: !integ ? "Loading" : h ? (h.broken ? "Stopped" : "Connected") : "Not connected",
      since: h ? `URL ends ${h.masked.slice(-4)}` : "Optional",
      trouble: !!h && (h.broken || !!h.problem),
      reads: "Nothing. Merlin posts one alert at a time to your URL.",
      never: "Read anything inside your tool.",
      last: h ? (h.lastOkAt ? `Posted ${day(h.lastOkAt)}` : "Not posted yet") : "Nothing yet",
      feeds: ALERT_FEEDS.slice(0, 1),
      go: h ? "Manage" : "Connect",
      remove: h ? { ask: "Remove the webhook? Alerts to it stop at once.", yes: "Remove it" } : null,
    });
  }
  const gr = x.granola;
  if (gr?.on) {
    rows.push({
      key: "granola",
      name: "Granola",
      sub: "Call notes for proposals",
      on: gr.connected,
      status: gr.connected ? (gr.broken ? (gr.via === "oauth" ? "Needs connecting again" : "Key stopped working") : "Connected") : "Not connected",
      since: gr.connected ? (gr.via === "oauth" ? "Your Granola account" : gr.last4 ? `Key ends ${gr.last4}` : "Connected") : "Optional",
      trouble: !!gr.broken,
      reads: "Your recent calls when you start a proposal, and one transcript, of the call you pick, when you ask for a draft.",
      never: "Read a call you did not pick, or store a transcript.",
      last: gr.connected && gr.connectedAt ? `Since ${day(gr.connectedAt)}` : "Nothing yet",
      feeds: [
        { label: "Proposals", why: "Draft from a call", page: "proposals" },
        { label: "Pipeline", why: "Recent calls on a deal", page: "pipeline" },
      ],
      go: gr.connected ? "Manage" : "Connect",
      remove: gr.connected ? { ask: gr.via === "oauth" ? "Disconnect Granola? Merlin ends its access and deletes it. Proposals you already drafted stay." : "Disconnect Granola? Merlin deletes your key. Proposals you already drafted stay.", yes: "Disconnect" } : null,
    });
  }
  const apps = x.apps ?? [];
  const lastUsed = [...apps].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
  rows.push({
    key: "agent",
    name: "An agent, such as Claude",
    sub: "Ask Merlin in your own words",
    on: apps.length > 0,
    status: !x.apps ? "Loading" : apps.length ? "Connected" : "Not connected",
    since: apps.length ? (apps.length === 1 ? apps[0].name : `${apps.length} apps`) : "Optional",
    trouble: false,
    reads: "What you can already see in Merlin. It acts as you.",
    never: "Spend a credit or send for signature without asking you first.",
    last: lastUsed ? `Used ${day(lastUsed.lastUsedAt)}` : "Nothing yet",
    feeds: [
      { label: "Agent access", why: "Set up, switches and limits", page: "agent" },
      { label: "Credits and usage", why: "What each ask spent", page: "credits" },
    ],
    go: apps.length ? "Manage" : "Connect",
    remove: apps.length
      ? { ask: apps.length === 1 ? `Disconnect ${apps[0].name}? Its access stops at once.` : `Disconnect all ${apps.length} apps? Their access stops at once.`, yes: apps.length === 1 ? "Disconnect" : "Disconnect all" }
      : null,
  });
  return rows;
}

/** What each source's Remove calls: the very call its own delete makes today. */
export type RemoveCall =
  | { via: "google"; op: "disconnect" }
  | { via: "paths"; op: "delete" | "deleteCsv" }
  | { via: "export"; op: "remove" }
  | { via: "integrations"; body: { op: "remove"; field: "slack" | "webhook" } }
  | { via: "granola"; op: "disconnect" }
  | { via: "oauth"; op: "revoke" };
export const REMOVE: Record<ConnKey, RemoveCall> = {
  // Your network's Disconnect and delete everything (network/Network.tsx DeleteAll): POST /api/integrations/google { op: "disconnect" }.
  google: { via: "google", op: "disconnect" },
  // Bring in who you know's Delete (network/ConnectPanel.tsx): POST /api/paths { op: "delete" } and { op: "deleteCsv" }.
  linkedin: { via: "paths", op: "delete" },
  // The LinkedIn data export's Remove (network/ExportPanel.tsx): POST /api/paths/export { op: "remove" }.
  lix: { via: "export", op: "remove" },
  csv: { via: "paths", op: "deleteCsv" },
  // Integrations' Remove (Integrations.tsx): POST /api/integrations { op: "remove", field }.
  slack: { via: "integrations", body: { op: "remove", field: "slack" } },
  hook: { via: "integrations", body: { op: "remove", field: "webhook" } },
  // Granola's Disconnect (GranolaSection.tsx): POST /api/integrations/granola/disconnect.
  granola: { via: "granola", op: "disconnect" },
  // Connected apps' Disconnect (ConnectedApps.tsx, Agent access): POST /api/oauth/apps { revoke: id }, for each app.
  agent: { via: "oauth", op: "revoke" },
};

/* ---------- Notifications ---------- */

/** The rows the grid shows: every event with a fixed home (Crystal Ball, the weekly roles, Companies you follow, you and your network, proposals). Lists keep their own alerts on Alerts and workflows. */
export function notifRows(groups: Group[]): Row[] {
  return groups.flatMap((g) => g.rows).filter((r) => r.kind !== "list" && r.kind !== "starter");
}
/** A list's alerts in a line, for the grid's link to Alerts and workflows. */
export function listsLine(groups: Group[]): string {
  const lists = groups.flatMap((g) => g.rows).filter((r) => r.kind === "list");
  const on = lists.filter((r) => r.on).length;
  if (!lists.length) return "No saved list yet. Save a list and Merlin can watch it for you.";
  return `${on} of ${lists.length} ${lists.length === 1 ? "list has" : "lists have"} an alert on.`;
}

/** The call one switch makes: the member's settings, Slack's alert kinds, Close's switches, or the fixed rows' own (lib/inbox.ts). */
export type NotifCall =
  | { via: "act"; action: Action }
  | { via: "integrations"; body: { op: "alerts"; roles?: boolean; message?: boolean; seat?: boolean } }
  | { via: "close"; kind: string; channel: "email" | "slack" | "app"; on: boolean }
  | { via: "act-fixed"; action: Action };
/** The same call Alerts and workflows makes when the same chip is flipped there (alerts/Alerts.tsx flipChip). Null where the switch can't move. */
export function chipCall(r: Row, key: ChanKey, on: boolean): NotifCall | null {
  const chip = r.chips.find((c) => c.key === key);
  if (!chip || chip.state !== "ok" || !r.canSwitch) return null;
  switch (r.kind) {
    case "radar":
      return key === "email" ? { via: "act", action: { type: "settings", radarEmail: on ? "daily" : "off" } } : key === "slack" ? { via: "act", action: { type: "settings", radarSlack: on } } : null;
    case "digest":
      return key === "email" ? { via: "act", action: { type: "settings", digest: on } } : key === "slack" ? { via: "integrations", body: { op: "alerts", roles: on } } : null;
    case "follows":
    case "known":
      return { via: "act-fixed", action: { type: "alerts.fixed", key: r.kind, [key]: on, ...(on ? { on: true } : {}) } as Action };
    case "message":
      return key === "email" ? { via: "act", action: { type: "settings", messageEmail: on } } : key === "slack" ? { via: "integrations", body: { op: "alerts", message: on } } : null;
    case "peer":
      return key === "email" ? { via: "act", action: { type: "settings", peerEmail: on } } : null;
    case "seat":
      return key === "slack" ? { via: "integrations", body: { op: "alerts", seat: on } } : null;
    case "proposal":
      return r.proposal ? { via: "close", kind: r.proposal, channel: key === "bell" ? "app" : key, on } : null;
    default:
      return null;
  }
}
/** Crystal Ball's email, how often (the same setting as on Alerts and workflows). */
export const RADAR_FREQ: { key: "daily" | "twice" | "weekly" | "off"; label: string }[] = [
  { key: "daily", label: "Every morning" },
  { key: "twice", label: "Twice a week" },
  { key: "weekly", label: "Once a week" },
  { key: "off", label: "Off" },
];

/* ---------- Voice: the sample note ---------- */

/**
 * The note the sample shows, built from the style as picked (never from a message): to a made-up
 * person at a made-up company, so nothing real is ever in it.
 */
export function sampleNote(v: VoiceStyle, me: { name: string; fn: string | null }): string {
  const short = v.contractions;
  const bang = v.exclamations === "sometimes" ? "!" : ".";
  const say = (t: string) => (short ? t : expandContractions(t));
  const lines: string[] = [];
  const open = v.phrases.find((p) => phraseSlot(p) === "open");
  const close = v.phrases.find((p) => phraseSlot(p) === "close");
  if (v.opener === "smalltalk") lines.push(open ? asSentence(open) : v.formality === "formal" ? "I hope the quarter has started well." : `Hope the quarter is treating you well${bang}`);
  lines.push(`${v.formality === "casual" ? "Saw" : v.formality === "formal" ? "I noticed" : "I saw"} that Cedar and Pine just brought in a fractional CFO.`);
  lines.push(say(`I've led ${(me.fn ?? "sales").toLowerCase() === "revops" ? "RevOps" : (me.fn ?? "sales").toLowerCase()} at two software companies your size, and I'd be glad to share what worked.`));
  if (v.length === "medium") lines.push("At Northwind Clinics we took the sales cycle from 71 days to 48.", say("It's the same motion you run today."));
  lines.push(v.formality === "casual" ? "Worth a quick call next week?" : v.formality === "formal" ? "Would you be open to a short call next week?" : "Open to a short call next week?");
  if (close) lines.push(asSentence(close));
  const greet = v.greeting === "none" ? "" : `${greetingWords(v.greeting)}\n\n`;
  const first = me.name.trim().split(/\s+/)[0] || "";
  const name = v.name === "none" ? "" : v.name === "full" ? me.name.trim() : first;
  const sign = v.signoff === "none" ? (name ? `\n\n${name}` : "") : `\n\n${v.signoff}${name ? `\n${name}` : ""}`;
  return `${greet}${lines.join(" ")}${sign}`;
}
