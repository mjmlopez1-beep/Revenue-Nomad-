/**
 * Alerts and workflows (Alerts.dc.html, Stage 7a): the one table of every alert a member has, worked
 * out from what each alert's home keeps today. Pure: the page (alerts/Alerts.tsx) draws it and turns
 * a change into the call its home takes, and scripts/test-alerts-page.mts checks it.
 *
 * Each row's home, and so its switches:
 *   a saved list      its alert (lib/mcp/alerts.ts ListAlert): triggers, how often, email, Slack, bell
 *   a starter list    not saved yet: turning it on saves it with its alert on (Home's starter lists)
 *   Crystal Ball      Me.radarEmail (how often, or off) and Me.radarSlack
 *   New open roles    the weekly email (Me.digest) and the weekly Slack post (/api/integrations alerts.roles)
 *   Companies you follow, Someone you know changed jobs   lib/inbox.ts alerts.fixed
 *   New messages      Me.messageEmail and Slack's alerts.message
 *   From your peers   Me.peerEmail
 *   Someone engages your seat   Slack's alerts.seat (Pro), and the bell
 *   Proposal alerts   Close's switches (lib/close, /api/activity op pref), by email, Slack and in Merlin (the bell)
 * Every switch members have today is here; nothing new is stored for a row that had a home already.
 */
import type { Me } from "@/lib/tableTypes";
import type { IntegrationsView } from "@/lib/notify/types";
import type { CloseAlertKind, CloseInboxView } from "@/lib/close/types";
import { ALERT_ROWS } from "@/lib/close/types";
import type { AlertsView } from "@/lib/inbox";
import { ALERT_EVERY, EVERY_WORDS, TRIGGER_DETAIL, TRIGGER_WORDS, type AlertEvery, type AlertTrigger } from "@/lib/mcp/alerts";
import { listOf, type SavedListRec } from "@/lib/hunt";
import { RADAR_EVERY_WORDS, FEATURE_NAME } from "@/lib/radar/types";

export type ChanKey = "email" | "slack" | "bell";
/** A channel chip: lit, or why it can't be: Slack not connected, Pro's, fixed (always on, or always off). */
export interface Chip {
  key: ChanKey;
  label: string;
  on: boolean;
  state: "ok" | "connect" | "pro" | "fixed" | "none";
  /** Said on hover and to a screen reader. */
  note: string;
}
export type RowKind = "list" | "starter" | "radar" | "digest" | "follows" | "known" | "message" | "peer" | "seat" | "proposal";
export interface Row {
  id: string;
  group: "lists" | "proposals" | "you";
  kind: RowKind;
  name: string;
  watch: string;
  tag: "Pro" | "Close" | "New" | "Made for you" | null;
  trig: string;
  det: string;
  /** A list's triggers, to pick from (each on or off; Pro's marked). */
  triggers: { key: AlertTrigger; label: string; on: boolean; pro: boolean }[] | null;
  chips: Chip[];
  /** How often: the choices when it has any (each Pro's or not), else one fixed line. */
  every: { value: string; label: string; options: { key: string; label: string; pro: boolean }[] | null };
  on: boolean;
  /** The switch can move (a Close row without Close can't, nor a list Free doesn't watch). */
  canSwitch: boolean;
  /** Last fired: when, in words, or "Not fired yet", and the alert log's key. */
  last: string;
  logKey: string;
  /** Why the row is held back, in a word under its name (Free watches one list). */
  held: string | null;
  list?: SavedListRec;
  starter?: StarterRef;
  proposal?: CloseAlertKind;
}
/** A starter list as the page passes it (find/lists.ts starterLists). */
export interface StarterRef {
  key: string;
  name: string;
  kind: string;
  place: string;
  criteria: unknown;
}

export interface Group {
  key: Row["group"];
  name: string;
  note: string;
  rows: Row[];
  on: number;
}

export interface Inputs {
  me: Me;
  /** Merlin sends email (View.email). */
  email: boolean;
  /** The weekly email of new open roles is on for this server (View.scan.digest). */
  digest: boolean;
  integ: IntegrationsView | null;
  close: CloseInboxView | null;
  alerts: AlertsView | null;
  starters: StarterRef[];
  nowMs: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2 hours ago", "Yesterday", "Nov 16". */
export function whenWords(iso: string | null | undefined, nowMs: number): string {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "Not fired yet";
  const s = Math.max(0, (nowMs - ms) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return Math.floor(s / 3600) === 1 ? "1 hour ago" : `${Math.floor(s / 3600)} hours ago`;
  const d = new Date(ms);
  const today = new Date(nowMs);
  const yest = new Date(nowMs - 86_400_000);
  if (d.toISOString().slice(0, 10) === yest.toISOString().slice(0, 10) && d.toISOString().slice(0, 10) !== today.toISOString().slice(0, 10)) return "Yesterday";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "Since Thursday", "Since Nov 2" (a visit over a week ago), "Since your last visit". */
export function sinceWords(iso: string | null | undefined, nowMs: number): string {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "Since your last visit";
  const d = new Date(ms);
  if (nowMs - ms < 6 * 86_400_000) return `Since ${DAYS[d.getUTCDay()]}`;
  return `Since ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "Counting since Dec 2". */
export const countingWords = (iso: string | null | undefined) => {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "Counting starts with your first alert";
  const d = new Date(ms);
  return `Counting since ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The member is on Free now (billing live). Off or on Pro, the trial or Close: nothing is held back. */
export const onFree = (me: Pick<Me, "plan">) => me.plan?.name === "free";

/** Triggers a Free member can't pick: the leader trigger reads company websites, Pro's (BUILD_PLAN part 6). */
const PRO_TRIGGERS: AlertTrigger[] = ["leader"];

/** Every row, grouped as the mockup groups them. */
export function alertGroups(x: Inputs): Group[] {
  const { me, integ, close, alerts } = x;
  const free = onFree(me);
  const slackConnected = !!(integ?.slack || integ?.webhook);
  const slackAllowed = integ ? integ.allowed : true;
  const last = (key: string) => whenWords(alerts?.last[key]?.at, x.nowMs);
  const chip = (key: ChanKey, on: boolean, state: Chip["state"] = "ok", note?: string): Chip => ({
    key,
    label: key === "email" ? "Email" : key === "slack" ? "Slack" : "Bell",
    on: on && state !== "connect" && state !== "pro" && state !== "none",
    state,
    note: note ?? (state === "connect" ? "Slack is not connected. Connect it in Where alerts go" : state === "pro" ? "Slack for this alert is part of Pro" : state === "fixed" ? "Always on" : key === "bell" ? "In the bell at the top of every page" : ""),
  });
  const slackChip = (on: boolean, pro: boolean) => (!slackAllowed ? chip("slack", false, "none", "Alerts in Slack aren't part of your plan") : pro ? chip("slack", false, "pro") : !slackConnected ? chip("slack", false, "connect") : chip("slack", on));
  const emailChip = (on: boolean) => (x.email ? chip("email", on) : chip("email", false, "none", "Merlin doesn't send email yet"));

  /* ---- lists ---- */
  const lists = (me.savedViews ?? []).map(listOf);
  const listRows: Row[] = lists.map((v, i) => {
    const a = v.alert;
    const held = free && i >= 1 ? "On Free, Merlin watches your first list" : null;
    const slackFreeOk = a.every !== "instant" && a.triggers.every((t) => t === "role" || t === "hire");
    const everyOpts = ALERT_EVERY.map((k) => ({ key: k, label: EVERY_WORDS[k], pro: k === "instant" && free }));
    const shownEvery: AlertEvery = free && a.every === "instant" ? "daily" : a.every;
    return {
      id: `list:${v.id}`,
      group: "lists",
      kind: "list",
      name: v.name,
      watch: `${v.place ? "List" : "Saved filter from your agent"} · ${kindWords(v)}`,
      tag: v.starter ? "Made for you" : null,
      trig: a.triggers.map((t) => TRIGGER_WORDS[t]).join(", "),
      det: a.triggers.length === 1 ? TRIGGER_DETAIL[a.triggers[0]] : `${a.triggers.length} triggers`,
      triggers: (["role", "seat", "leader", "fact", "funding", "hire"] as AlertTrigger[]).map((t) => ({ key: t, label: TRIGGER_WORDS[t], on: a.triggers.includes(t), pro: free && PRO_TRIGGERS.includes(t) })),
      chips: [emailChip(a.email), slackChip(a.slack, free && !slackFreeOk), chip("bell", a.bell)],
      every: { value: shownEvery, label: EVERY_WORDS[shownEvery], options: everyOpts },
      on: a.on && !held,
      canSwitch: !held,
      last: last(`list:${v.id}`),
      logKey: `list:${v.id}`,
      held,
      list: v,
    };
  });
  // Free keeps one saved list: a starter can't be saved beside it, and says so.
  const starterHeld = free && lists.length >= 1 ? "On Free you keep 1 list. Pro watches as many as you want" : null;
  const starterRows: Row[] = x.starters.map((s) => ({
    id: `starter:${s.key}`,
    group: "lists",
    kind: "starter",
    name: s.name,
    watch: `Starter list · ${s.kind === "seats" ? "seats" : s.kind === "roles" ? "open roles" : "companies"} · free to watch`,
    tag: "Made for you",
    trig: s.kind === "seats" ? TRIGGER_WORDS.seat : TRIGGER_WORDS.role,
    det: s.kind === "seats" ? TRIGGER_DETAIL.seat : TRIGGER_DETAIL.role,
    triggers: null,
    chips: [emailChip(true), slackChip(false, free), chip("bell", true)],
    every: { value: free ? "daily" : "instant", label: free ? EVERY_WORDS.daily : EVERY_WORDS.instant, options: null },
    on: false,
    canSwitch: !starterHeld,
    last: "Not fired yet",
    logKey: `starter:${s.key}`,
    held: starterHeld,
    starter: s,
  }));

  /* ---- Crystal Ball, the weekly roles, Companies you follow ---- */
  const radarEmail = me.radarEmail ?? "daily";
  const radarSlack = me.radarSlack !== false;
  const radar: Row = {
    id: "radar",
    group: "lists",
    kind: "radar",
    name: FEATURE_NAME,
    watch: "Your ideal client · the companies likely to hire you next",
    tag: null,
    trig: "A company moves",
    det: "only on a day something moved",
    triggers: null,
    chips: [emailChip(radarEmail !== "off"), slackChip(radarSlack, false), chip("bell", true, "fixed", "Each email or post also shows in the bell")],
    every: { value: radarEmail === "off" ? "daily" : radarEmail, label: RADAR_EVERY_WORDS[radarEmail === "off" ? "daily" : radarEmail], options: (["daily", "twice", "weekly"] as const).map((k) => ({ key: k, label: RADAR_EVERY_WORDS[k], pro: false })) },
    on: radarEmail !== "off" || (radarSlack && slackConnected),
    canSwitch: true,
    last: last("radar"),
    logKey: "radar",
    held: null,
  };
  const fn = me.function && me.function !== "Other" ? me.function : null;
  const rolesSlack = integ?.alerts.roles !== false;
  const digest: Row | null = x.digest
    ? {
        id: "digest",
        group: "lists",
        kind: "digest",
        name: fn ? `Every open ${fn} role` : "Every new open role",
        watch: "Weekly email from Merlin, after the scan",
        tag: null,
        trig: TRIGGER_WORDS.role,
        det: "skips a week with none",
        triggers: null,
        chips: [emailChip(me.digest), slackChip(rolesSlack, false), chip("bell", true, "fixed", "The week's email also shows in the bell")],
        every: { value: "weekly", label: "Weekly, after the scan", options: null },
        on: me.digest || (rolesSlack && slackConnected),
        canSwitch: true,
        last: whenLatest([alerts?.last.digest?.at, alerts?.last.roles?.at], x.nowMs),
        logKey: "digest",
        held: null,
      }
    : null;
  const fx = (k: "follows" | "known") => alerts?.prefs[k] ?? { on: true, email: true, slack: false, bell: true };
  const fol = fx("follows");
  const follows: Row = {
    id: "follows",
    group: "lists",
    kind: "follows",
    name: "Companies you follow",
    watch: "Followed · the companies you follow",
    tag: null,
    trig: TRIGGER_WORDS.fact,
    det: "a seat, a role or a leader",
    triggers: null,
    chips: [emailChip(fol.email), slackChip(fol.slack, free), chip("bell", fol.bell)],
    every: { value: "instant", label: EVERY_WORDS.instant, options: null },
    on: fol.on,
    canSwitch: true,
    last: last("follows"),
    logKey: "follows",
    held: null,
  };

  /* ---- you and your network ---- */
  const kn = fx("known");
  const known: Row = {
    id: "known",
    group: "you",
    kind: "known",
    name: "Someone you know changed jobs",
    watch: alerts?.sources ? "Your own contacts · Google, your LinkedIn file, your contacts file" : "Bring in who you know to start",
    tag: "New",
    trig: "A new leader you know",
    det: "matched on their whole name and the new company",
    triggers: null,
    chips: [emailChip(kn.email), slackChip(kn.slack, free), chip("bell", kn.bell)],
    every: { value: "instant", label: EVERY_WORDS.instant, options: null },
    on: kn.on,
    canSwitch: true,
    last: last("known"),
    logKey: "known",
    held: null,
  };
  const msgSlack = integ?.alerts.message !== false;
  const message: Row = {
    id: "message",
    group: "you",
    kind: "message",
    name: "New messages",
    watch: "Your conversations",
    tag: null,
    trig: "A member writes to you",
    det: "or joins from your invite",
    triggers: null,
    chips: [emailChip(me.messageEmail !== false), slackChip(msgSlack, free), chip("bell", true, "fixed", "Unread conversations show in the bell")],
    every: { value: "hourly", label: "As they come, hourly at most", options: null },
    on: me.messageEmail !== false || (msgSlack && slackConnected && !free),
    canSwitch: true,
    last: last("message"),
    logKey: "message",
    held: null,
  };
  const peer: Row = {
    id: "peer",
    group: "you",
    kind: "peer",
    name: "From your peers",
    watch: "Fractionals who know you",
    tag: null,
    trig: "A lead is passed to you",
    det: "or someone asks to team up",
    triggers: null,
    chips: [emailChip(me.peerEmail !== false), chip("slack", false, "none", "Not sent to Slack"), chip("bell", true, "fixed", "Leads and team-ups show in the bell")],
    every: { value: "instant", label: EVERY_WORDS.instant, options: null },
    on: me.peerEmail !== false,
    canSwitch: true,
    last: last("peer"),
    logKey: "peer",
    held: null,
  };
  const seatSlack = integ?.alerts.seat !== false;
  const seat: Row = {
    id: "seat",
    group: "you",
    kind: "seat",
    name: "Someone engages your seat",
    watch: "Your seats",
    tag: free ? "Pro" : null,
    trig: "Your seat is unlocked",
    det: "or someone writes about it",
    triggers: null,
    chips: [chip("email", false, "none", "Not emailed"), slackChip(seatSlack, free), chip("bell", !free, free ? "pro" : "fixed", free ? "Part of Pro" : "Always in the bell")],
    every: { value: "instant", label: EVERY_WORDS.instant, options: null },
    on: !free,
    canSwitch: false,
    last: last("seat"),
    logKey: "seat",
    held: free ? "Part of Pro" : null,
  };

  /* ---- proposals (Close) ---- */
  const closeOpen = !!close?.open;
  const latest = new Map<string, string>();
  for (const it of close?.items ?? []) if (!latest.has(it.kind) || it.at > (latest.get(it.kind) ?? "")) latest.set(it.kind, it.at);
  const proposalRows: Row[] = ALERT_ROWS.map((r) => {
    const p = close?.prefs?.[r.kind];
    const fixedEmail = r.kind === "signed";
    const chips: Chip[] = [
      !closeOpen ? chip("email", false, "none", "Part of Close") : !close?.email ? chip("email", false, "none", "Merlin doesn't send email yet") : fixedEmail ? chip("email", true, "fixed", "The signed copy and a decline always come by email") : chip("email", !!p?.email),
      !closeOpen ? chip("slack", false, "none", "Part of Close") : !close?.slack ? chip("slack", false, "connect") : chip("slack", !!p?.slack),
      !closeOpen ? chip("bell", false, "none", "Part of Close") : chip("bell", !!p?.app),
    ];
    return {
      id: `proposal:${r.kind}`,
      group: "proposals",
      kind: "proposal",
      name: r.label,
      watch: "Your proposals",
      tag: closeOpen ? null : "Close",
      trig: r.label,
      det: r.line.replace(/\.$/, ""),
      triggers: null,
      chips,
      every: { value: r.kind, label: r.kind === "engaged" ? "Every 6 hours at most" : r.kind === "renewal" ? "Once, 30 days before" : EVERY_WORDS.instant, options: null },
      on: closeOpen && chips.some((c) => c.on),
      canSwitch: closeOpen,
      last: whenWords(latest.get(r.kind), x.nowMs),
      logKey: `proposal:${r.kind}`,
      held: closeOpen ? null : "Part of Close",
      proposal: r.kind,
    };
  });

  const mk = (key: Group["key"], name: string, note: string, rows: Row[]): Group => ({ key, name, note, rows, on: rows.filter((r) => r.on).length });
  return [
    mk("lists", "Your lists", starterRows.length && !listRows.length ? "Your starter lists are here. Turn one on." : "", [...listRows, ...starterRows, radar, ...(digest ? [digest] : []), follows]),
    mk("proposals", "Proposals and contracts", closeOpen ? "Part of Close" : "Part of Close. They start with your first proposal.", proposalRows),
    mk("you", "You and your network", "", [known, message, peer, seat]),
  ];
}

/** The newest of several times, in words. */
function whenLatest(isos: (string | undefined)[], nowMs: number): string {
  const xs = isos.filter((x): x is string => !!x).sort();
  return whenWords(xs[xs.length - 1], nowMs);
}

function kindWords(v: SavedListRec): string {
  const p = new URLSearchParams(v.place ?? "");
  const k = v.kind ?? (p.get("v") === "hiring" ? "roles" : p.get("t") === "seats" ? "seats" : p.get("t") === "people" ? "people" : "companies");
  return k === "roles" ? "open roles" : k === "seats" ? "seats" : k === "people" ? "people" : k === "fractionals" ? "fractionals" : "companies";
}

/** The column heads' small lines: how many alerts, the triggers by group, where they go, how often, how many on. */
export function headLines(groups: Group[], alerts: AlertsView | null, nowMs: number) {
  const rows = groups.flatMap((g) => g.rows);
  const on = rows.filter((r) => r.on);
  const n = (k: ChanKey) => on.filter((r) => r.chips.some((c) => c.key === k && c.on)).length;
  return {
    alerts: plural(rows.length, "alert"),
    trigger: groups.map((g) => `${g.key === "lists" ? "Lists" : g.key === "proposals" ? "Proposals" : "You"} ${g.rows.length}`).join(" · "),
    where: `Email ${n("email")} · Slack ${n("slack")} · Bell ${n("bell")}`,
    often: `${on.filter((r) => r.every.value === "instant").length} as it happens`,
    last: alerts && alerts.sent > 0 ? `${alerts.sent} ${sinceWords(alerts.since, nowMs).toLowerCase()}` : "None yet",
    on: `${on.length} of ${rows.length}`,
    nOn: on.length,
    nAll: rows.length,
  };
}

/** The status line under the table, as the member's plan has it. */
export function statusLine(me: Pick<Me, "plan">, nOn: number, nAll: number): string {
  const p = me.plan;
  const head = `${nOn} of ${nAll} alerts on. Alerts never spend credits.`;
  if (!p) return head;
  if (p.name === "trial") return `${head} On your trial every alert is included. After it, email and bell alerts stay free, Slack and as it happens need Pro, and proposal alerts need Close.`;
  if (p.name === "free") return `${head} On Free your alert comes by email and in the bell, every morning or weekly. Slack and as it happens are part of Pro, and proposal alerts of Close.`;
  return p.canClose ? `${head} Every alert is part of your plan.` : `${head} Proposal alerts are part of Close.`;
}

/** The starter gallery's cards (first visit): what each does, what it costs, its plan. */
export interface Recipe {
  key: string;
  say: string;
  plan: "Pro" | null;
  cost: string;
}
export function recipes(me: Me, starters: StarterRef[], hasSources: boolean): Recipe[] {
  const fn = me.function && me.function !== "Other" ? me.function : null;
  const icp = starters.find((s) => s.key === "icp");
  const ended = starters.find((s) => s.key === "ended");
  const out: Recipe[] = [];
  if (icp) out.push({ key: "icp-role", say: `When a company on ${icp.name.toLowerCase()} posts a ${fn ? `${fn} ` : ""}role, tell me.`, plan: null, cost: "Free" });
  if (ended) out.push({ key: "ended-seat", say: `When a ${fn ? `${fn} ` : ""}seat ends at your kind of company, tell me.`, plan: null, cost: "Free" });
  if (icp) out.push({ key: "icp-leader", say: "When a new leader starts at a company on your ideal client list, tell me.", plan: onFree(me) ? "Pro" : null, cost: "Free" });
  if (icp) out.push({ key: "icp-funding", say: "When a company on your ideal client list raises money, as its SEC filing says, tell me.", plan: null, cost: "Free" });
  out.push({ key: "known", say: hasSources ? "When someone you know starts at another company, tell me." : "When someone you know starts at another company, tell me. Bring in who you know first.", plan: null, cost: "Free" });
  out.push({ key: "radar", say: `When a company moves into your ${FEATURE_NAME}, tell me every morning.`, plan: null, cost: "Free" });
  return out.slice(0, 6);
}
