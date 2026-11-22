/**
 * Peers: fellow fractionals working together on Merlin. The rules and words that need no state, so
 * the server (lib/peers.ts), the app (app/post/Peers.tsx, PeerSheets.tsx) and the checks share them.
 * Pure, relative imports only.
 *
 *  - Pass a lead ("Not my fit? Pass it to someone great"): a member hands a company (from their
 *    Crystal Ball, an open role, a record or a deal) to a peer, with a note. The company opens free
 *    for that peer alone (a gift, no credits and no daily cap), it lands in their Messages and on
 *    their Home, and they can take it into their pipeline. When they do, the passer earns
 *    PASS_CREDIT credits (within the daily earning cap, once per peer and company), and a win there
 *    later is counted for the passer too (outcomeStats: leads passed, taken, won).
 *  - Team up: two members pursue one company together (a CMO and a VP Sales co-pitching). A shared
 *    thread (a conversation of kind "team"), both pipeline entries there marked "Teamed with Ana",
 *    a shared note draft, and a Team block in the proposal builder. Either can leave.
 *  - Circles: small opt-in peer groups (CIRCLE_MIN to CIRCLE_MAX members) with complementary
 *    functions and overlapping kinds of client. A monthly thread with a prompt, and a shared view of
 *    the member's own Crystal Ball companies where someone in the circle has held a seat. Counts and
 *    names only where the viewer can see them: never a locked company's name, never anyone's Google
 *    or LinkedIn contacts.
 *
 * What is stored lives in State.peers (PeersState). Internal ids only; the app gets public ids.
 */

/* ---------- limits ---------- */

/** Leads a member can pass in any 24 hours. */
export const PASS_DAILY = 10;
/** Credits the passer earns when the peer takes the lead (once per peer and company). */
export const PASS_CREDIT = 5;
/** A pass's note, a team's shared draft and a circle post, at most. */
export const NOTE_MAX = 600;
export const DRAFT_MAX = 2000;
export const POST_MAX = 2000;
/** Team-up invites a member can send in any 24 hours, and active teams at once. */
export const TEAM_DAILY = 5;
export const TEAMS_OPEN = 20;
/** A circle: small enough that everyone can know everyone. */
export const CIRCLE_MIN = 6;
export const CIRCLE_MAX = 8;
/** Circle posts a member can write in any 24 hours. */
export const CIRCLE_POSTS_DAILY = 10;
/** Most people a Peers section lists. */
export const SECTION_MAX = 24;

/* ---------- what is stored (State.peers) ---------- */

export type PassFrom = "crystal" | "role" | "record" | "deal" | "connector";
export const PASS_FROM: readonly PassFrom[] = ["crystal", "role", "record", "deal", "connector"];
export type PassStatus = "new" | "taken" | "declined";

export interface LeadPass {
  id: string;
  /** The member who passed it, and the peer it went to (member ids). */
  by: string;
  to: string;
  /** Internal company id. */
  companyId: string;
  /** An open role there it is about (internal seat id). */
  roleId?: string;
  from: PassFrom;
  note: string;
  at: string;
  status: PassStatus;
  answeredAt?: string;
  /** The company was locked for the peer, and the pass opened it for them (and its open roles' postings). */
  opened?: boolean;
  /** The peer's pipeline entry it became. */
  entryId?: string;
  /** The passer's credits for it were paid (or held at the cap). */
  paid?: boolean;
  /** The conversation between the two it was written into. */
  conversationId?: string;
}

export type TeamStatus = "invited" | "active" | "declined" | "ended";

export interface TeamUp {
  id: string;
  companyId: string;
  /** Who invited, and who was invited (member ids). */
  by: string;
  with: string;
  status: TeamStatus;
  at: string;
  answeredAt?: string;
  /** Who left, and when (status "ended"). */
  left?: { by: string; at: string };
  /** The shared thread (a conversation of kind "team"). */
  conversationId: string;
  /** The shared note draft both can edit: "We've done this together before…". */
  draft: { text: string; by: string; at: string } | null;
}

export interface CirclePost {
  id: string;
  by: string;
  at: string;
  /** YYYY-MM: the month's thread it is in. */
  month: string;
  text: string;
  removed?: boolean;
}

export interface Circle {
  id: string;
  name: string;
  at: string;
  /** Members in order of joining. A member who left is gone from the list. */
  members: { id: string; at: string }[];
  /** The kind of client it formed around (the first member's Ideal Fractional Profile). */
  industries: string[];
  employees: string[];
  posts: CirclePost[];
  /** When each member last read the thread. */
  readAt: Record<string, string>;
}

export interface PeersState {
  passes: LeadPass[];
  teams: TeamUp[];
  circles: Circle[];
  /** Member id -> members they muted: no leads, team-up invites or circle posts from them reach them. */
  mutes: Record<string, string[]>;
  /** Member id -> when they last looked at From your peers on Home. */
  seen: Record<string, string>;
}

export const emptyPeers = (): PeersState => ({ passes: [], teams: [], circles: [], mutes: {}, seen: {} });

/* ---------- functions that work together ---------- */

/**
 * Functions whose fractionals tend to serve the same clients side by side, for "Peers who serve
 * your kind of clients". Read both ways. A function not listed pairs with every other function.
 */
const COMPLEMENTS: Record<string, string[]> = {
  Sales: ["Marketing", "RevOps", "Finance", "Customer Success", "Product Marketing", "Enablement", "Partnerships", "Growth"],
  Marketing: ["Sales", "RevOps", "Product Marketing", "Growth", "Finance", "Customer Success"],
  RevOps: ["Sales", "Marketing", "Customer Success", "Finance", "Enablement"],
  Finance: ["Sales", "Marketing", "Operations", "People", "RevOps", "Technology"],
  "Customer Success": ["Sales", "RevOps", "Marketing", "Product"],
  Operations: ["Finance", "People", "Technology", "Sales"],
  People: ["Finance", "Operations", "Executive"],
  Technology: ["Product", "Finance", "Operations"],
  Product: ["Technology", "Product Marketing", "Customer Success", "Marketing"],
  Growth: ["Sales", "Marketing", "Product", "RevOps"],
  "Product Marketing": ["Marketing", "Sales", "Product"],
};

/** Whether two functions are complementary: different, and known to serve clients together. */
export function complements(mine: string | null | undefined, theirs: string | null | undefined): boolean {
  if (!theirs || theirs === "Other") return false;
  if (!mine || mine === "Other") return true;
  if (mine === theirs) return false;
  const a = COMPLEMENTS[mine];
  const b = COMPLEMENTS[theirs];
  if (!a && !b) return true;
  return !!a?.includes(theirs) || !!b?.includes(mine);
}

/* ---------- the kind of client, as circles and suggestions compare it ---------- */

export interface ClientShape {
  industries: string[];
  employees: string[];
}

/** How much two kinds of client overlap: shared industries count most, then sizes. 0 is none. */
export function overlapOf(a: ClientShape | null | undefined, b: ClientShape | null | undefined): number {
  if (!a || !b) return 0;
  const ind = a.industries.filter((x) => b.industries.includes(x)).length;
  const emp = a.employees.filter((x) => b.employees.includes(x)).length;
  return ind * 2 + emp;
}

/** "SaaS, 51–200": a circle's name from the kind of client it formed around. */
export function circleName(shape: ClientShape): string {
  const ind = shape.industries.slice(0, 2).join(" and ");
  const emp = shape.employees.slice(0, 2).join(" and ");
  if (ind && emp) return `${ind}, ${emp} people`;
  return ind || (emp ? `Companies of ${emp} people` : "Fractionals together");
}

/**
 * How well a circle fits a member who wants to join: room left, their function not already there
 * (one of each reads best), and the kinds of client overlapping. Null when it can't take them.
 */
export function circleFit(c: { size: number; fns: string[]; shape: ClientShape }, me: { fn: string | null; shape: ClientShape | null }): number | null {
  if (c.size >= CIRCLE_MAX) return null;
  const same = me.fn ? c.fns.filter((f) => f === me.fn).length : 0;
  if (same >= 2) return null;
  const fresh = me.fn && !c.fns.includes(me.fn) ? 3 : 0;
  const pairs = me.fn ? c.fns.filter((f) => complements(me.fn, f)).length : 0;
  return fresh + pairs + overlapOf(c.shape, me.shape) * 2 + (c.size >= 2 ? 1 : 0) - same * 2;
}

/* ---------- the circle's monthly thread ---------- */

/** The month's prompt, the same for every circle that month. */
const PROMPTS = [
  "What are you seeing? Who's hiring? Who needs what?",
  "Which company should someone here be talking to this month, and why?",
  "What's one thing a client asked you for that's outside your function?",
  "Who in your world is about to raise, hire, or replace a leader?",
  "What's working for you in getting a first meeting right now?",
  "Which kind of client are you saying no to, and who should get them instead?",
];
export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
export function promptFor(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const n = Number.isFinite(y) && Number.isFinite(m) ? y * 12 + m : 0;
  return PROMPTS[n % PROMPTS.length];
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "November" from "2026-11". */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/* ---------- text ---------- */

/** Text a member wrote, kept as typed (line breaks too), within `max` characters. */
export function cleanText(raw: unknown, max: number): string {
  return [
    ...String(raw ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim(),
  ]
    .slice(0, max)
    .join("")
    .trim();
}

const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export const firstOf = (name: string) => flat(name).split(" ")[0] || flat(name) || "A peer";

/**
 * "Ana passed you Acme: open Sales role, posted $9k/mo". `company` is the name the peer can see
 * (the pass opens it for them); `role` the open role's function, `rate` its posted rate when the
 * posting gave one.
 */
export function leadLine(o: { from: string; company: string; role?: string | null; rate?: string | null }): string {
  const role = o.role ? `open ${o.role} role${o.rate ? `, posted ${o.rate}` : ""}` : "";
  return `${firstOf(o.from)} passed you ${flat(o.company) || "a company"}${role ? `: ${role}` : ""}`;
}

/** A pass's message in the pair's conversation: the line, then the note. */
export function passMessage(o: { from: string; company: string; role?: string | null; rate?: string | null; note: string }): string {
  const line = leadLine(o).replace(/^\S+ passed you /, "Passing you ");
  return o.note ? `${line}.\n\n${o.note}` : `${line}. I think you'd be great here.`;
}

/** The note a member starts from when they pass a lead (they change it before it goes). */
export function passNote(o: { peer: string; company: string; fn?: string | null }): string {
  const fit = o.fn ? `They need ${/^[aeiou]/i.test(o.fn) ? "an" : "a"} ${o.fn} leader, and I think you'd do great work there.` : "I think you'd do great work there.";
  return `Hi ${firstOf(o.peer)}, ${flat(o.company)} isn't my fit right now. ${fit} Happy to share what I know.`;
}

/** The first message of a team's shared thread. `company` as the invitee may see it. */
export function teamMessage(o: { from: string; company: string; myFn?: string | null; theirFn?: string | null; note: string }): string {
  const pair = o.myFn && o.theirFn ? ` A ${o.myFn} and ${o.theirFn} pitch, together.` : "";
  return o.note ? o.note : `Want to team up on ${flat(o.company) || "a company"}?${pair}`;
}

/** The shared draft a team starts from (either can change it). */
export function teamDraft(o: { company: string; a: { first: string; fn: string | null }; b: { first: string; fn: string | null } }): string {
  const who = (x: { first: string; fn: string | null }) => (x.fn ? `${x.first} (${x.fn})` : x.first);
  return [
    `Hi there,`,
    ``,
    `We're two fractional leaders who work with companies like ${flat(o.company) || "yours"}: ${who(o.a)} and ${who(o.b)}. We've done this together before, and we'd like to show you how we'd take on the next quarter as one team.`,
    ``,
    `Would a 30-minute call next week work?`,
  ].join("\n");
}

/* ---------- thread state on a person ---------- */

export type ThreadState = "you" | "replied" | "them" | "unread";

/** "You wrote 2 days ago", "Replied", "Wrote to you yesterday", "New message". */
export function threadWords(state: ThreadState, at: string, nowMs: number): string {
  if (state === "replied") return "Replied";
  if (state === "unread") return "New message";
  const ago = agoWords(at, nowMs);
  return state === "you" ? `You wrote ${ago}` : `Wrote to you ${ago}`;
}

/** "just now", "3 hours ago", "yesterday", "2 days ago", "Nov 3". */
export function agoWords(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "a while ago";
  const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const d = new Date(t);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ---------- what the app gets ---------- */

/** Where the member knows someone from, for "Fractionals you already know". Their own sources only. */
export type KnownFrom = "linkedin" | "google" | "messages";
export const KNOWN_WORDS: Record<KnownFrom, string> = { linkedin: "Your LinkedIn", google: "Your Google contacts", messages: "You've talked on Merlin" };

/** One seat a peer holds now, as the viewer may see it: the company named only when the viewer can see its name. */
export interface PeerSeat {
  co: string;
  name: string | null;
  /** The company's free facts when it is locked: "SaaS, 51–200". */
  kind: string | null;
  role: string | null;
}

export interface PeerRec {
  /** A member's public id, or a fractional record's id for someone not on Merlin yet. */
  id: string;
  memberId?: string;
  name: string;
  first: string;
  initials: string;
  title: string;
  fn: string | null;
  level: string | null;
  onMerlin: boolean;
  /** What they're working on: their current seats on Merlin. */
  working: PeerSeat[];
  /** Companies both know: their seats at companies the viewer knows by name. */
  both: string[];
  /** Fractionals you already know: where from (the viewer's own sources), and the line. Only in that section. */
  known?: { from: KnownFrom[]; why: string };
  /** The latest conversation with them, and where it stands. */
  thread?: { id: string; state: ThreadState; at: string; words: string };
  /** The viewer muted them. */
  muted?: boolean;
  /** Leads passed between the two (counts). */
  passed?: { toThem: number; fromThem: number };
  /** Teams with them (ids). */
  teams?: string[];
  /** Not on Merlin yet: the claim link to invite them, as the directory has it. */
  invite?: { path: string; seat: string; at?: string };
  /** Why they're suggested: "Serves 2 companies in your Crystal Ball", "Works with SaaS, 51–200". */
  why?: string;
}

export interface LeadRec {
  id: string;
  side: "to-you" | "from-you";
  /** The other member: first name, name, public id. */
  who: { id: string; name: string; first: string };
  company: string;
  /** The company as this viewer sees it (the pass opened it for the peer). Null while locked for them. */
  name: string | null;
  kind: string | null;
  role: string | null;
  rate: string | null;
  line: string;
  note: string;
  from: PassFrom;
  at: string;
  status: PassStatus;
  answeredAt?: string;
  /** The peer's pipeline entry reached Won there. */
  won?: boolean;
  conversationId?: string;
  /** The passer's credits for it. */
  credited?: number;
  /** The recipient hasn't seen it on Home yet. */
  fresh?: boolean;
}

export interface TeamRec {
  id: string;
  company: string;
  name: string | null;
  kind: string | null;
  status: TeamStatus;
  /** The viewer invited the other member. */
  invited: boolean;
  with: { id: string; name: string; first: string; title: string; fn: string | null };
  me: { fn: string | null };
  at: string;
  conversationId: string;
  draft: { text: string; by: "you" | "them"; at: string } | null;
  /** Where each side's pipeline entry there stands (the stage's words), when there is one. */
  stages: { you: string | null; them: string | null };
  left?: "you" | "them";
  fresh?: boolean;
}

export interface CircleMemberRec {
  id: string;
  name: string;
  first: string;
  initials: string;
  title: string;
  fn: string | null;
  you?: boolean;
}

export interface CirclePostRec {
  id: string;
  mine: boolean;
  who: { name: string; first: string; initials: string };
  at: string;
  text: string;
  removed?: boolean;
}

/** One of the viewer's own Crystal Ball companies where someone in the circle held a seat. */
export interface CircleWayIn {
  company: string;
  /** Named only when the viewer can see the company's name. */
  name: string | null;
  kind: string | null;
  /** Circle members who hold or held a seat there (first names), and how many. */
  who: string[];
  now: boolean;
}

export interface CircleRec {
  id: string;
  name: string;
  members: CircleMemberRec[];
  size: number;
  forming: boolean;
  month: string;
  prompt: string;
  posts: CirclePostRec[];
  unread: number;
  /** The viewer's Crystal Ball companies where a circle member held a seat. */
  ways: CircleWayIn[];
}

/** "Join a circle": the one Merlin proposes, or a new one started by the viewer. */
export interface CircleOffer {
  id: string | null;
  name: string;
  /** Who is in it now: function and first name only. */
  members: { first: string; fn: string | null }[];
  size: number;
  why: string;
}

export interface PeersView {
  fn: string | null;
  know: PeerRec[];
  serve: PeerRec[];
  /** Leads passed to the viewer, and the ones they passed. */
  inbox: LeadRec[];
  sent: LeadRec[];
  teams: TeamRec[];
  circle: CircleRec | null;
  offer: CircleOffer | null;
  passesLeft: number;
  /** Fractionals in the directory, for "See every fractional". */
  everyone: number;
  /** The viewer's own sources: whether they connected Google or imported LinkedIn (so the empty state can say what to do). */
  sources: { linkedin: boolean; google: boolean };
  /** Members the viewer muted. */
  muted: { id: string; name: string }[];
}

/** GET ?peers=home: From your peers on Home. */
export interface PeersHome {
  leads: LeadRec[];
  teams: TeamRec[];
  circle: { id: string; name: string; unread: number; latest: { first: string; text: string } | null; prompt: string } | null;
}

/** A peer suggested in the Pass a lead or Team up sheet. */
export interface PeerPick {
  id: string;
  name: string;
  first: string;
  initials: string;
  title: string;
  fn: string | null;
  why: string;
  /** Best fit for the function the company needs. */
  best: boolean;
  /** Already passed this company to them. */
  passed?: boolean;
  /** Already on a team with them here. */
  teamed?: boolean;
}

export interface PeerPicks {
  company: string;
  name: string | null;
  /** The function the company needs, as Merlin reads it (an open role, else the member's own). */
  needs: string | null;
  role: { id: string; fn: string | null; title: string | null; rate: string | null } | null;
  roles: { id: string; fn: string | null; title: string | null }[];
  picks: PeerPick[];
  passesLeft: number;
}
