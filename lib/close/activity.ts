/**
 * Reading activity on a signing page, pure: checking a beacon from the page, and adding it to the
 * proposal's or document's record (lib/close/types.ts ItemActivity). No Node imports, no state:
 * lib/close/server.ts finds the item, hashes the reader's cookie and calls applyBeacon inside a
 * change, and the tests call it directly.
 *
 * A beacon is a short list of events from one browser (app/sign/activity.ts):
 *   { t: "open" }                              the page opened (a reload inside a visit is the same visit)
 *   { t: "sec", id, label?, ms }               time with that section on screen and the reader active
 *   { t: "opt", id, label?, ms }               the same for a pricing option
 *   { t: "pick", id, label? }                  they picked that option
 *   { t: "addon", id, label?, on }             they turned an add-on on or off
 *   { t: "dl" }                                they downloaded it
 * Time is believed only up to the time since that reader's last beacon (plus CAPS.slackMs), at
 * most CAPS.beaconMs a beacon, and CAPS.sectionMs per reader per section: a page left open, or a
 * made-up beacon, can't pile up time.
 */
import { CAPS, SEEN_MS, type DeviceKind, type ItemActivity, type OptionAgg, type Reader, type SectionAgg } from "./types";

export type BeaconEvent =
  | { t: "open" }
  | { t: "sec"; id: string; label?: string; ms: number }
  | { t: "opt"; id: string; label?: string; ms: number }
  | { t: "pick"; id: string; label?: string }
  | { t: "addon"; id: string; label?: string; on: boolean }
  | { t: "dl" };

const ID = /^[A-Za-z0-9_.:-]{1,48}$/;
const CTRL = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
/** A label from the page, on one line, plain, at most CAPS.label characters. */
export const cleanLabel = (raw: unknown): string =>
  String(raw ?? "")
    .replace(CTRL, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CAPS.label);

/**
 * A beacon's events, checked. Null when it isn't a list or has more than CAPS.events (the whole
 * beacon is refused); events that don't check out are left out and counted in `bad`.
 */
export function parseBeacon(raw: unknown): { events: BeaconEvent[]; bad: number } | null {
  if (!Array.isArray(raw) || raw.length > CAPS.events) return null;
  const events: BeaconEvent[] = [];
  let bad = 0;
  for (const r of raw) {
    const o = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" && ID.test(o.id) ? o.id : null;
    const label = o.label === undefined ? undefined : cleanLabel(o.label) || undefined;
    const ms = typeof o.ms === "number" && Number.isFinite(o.ms) && o.ms >= 0 && o.ms <= CAPS.beaconMs ? Math.round(o.ms) : null;
    if (o.t === "open") events.push({ t: "open" });
    else if (o.t === "dl") events.push({ t: "dl" });
    else if ((o.t === "sec" || o.t === "opt") && id && ms !== null) events.push({ t: o.t, id, ms, ...(label ? { label } : {}) });
    else if (o.t === "pick" && id) events.push({ t: "pick", id, ...(label ? { label } : {}) });
    else if (o.t === "addon" && id && typeof o.on === "boolean") events.push({ t: "addon", id, on: o.on, ...(label ? { label } : {}) });
    else bad++;
  }
  return { events, bad };
}

export const emptyActivity = (kind: ItemActivity["kind"], memberId: string): ItemActivity => ({
  kind,
  memberId,
  readers: [],
  sections: {},
  options: {},
  addons: {},
  visits: [],
  downloads: [],
  raw: [],
  dropped: 0,
  alerts: { opened: [], readers: [], done: [] },
  reminders: { off: {}, sent: {} },
});

/** Fill in parts an older record may lack. */
export function normalize(a: ItemActivity): ItemActivity {
  a.readers ??= [];
  a.sections ??= {};
  a.options ??= {};
  a.addons ??= {};
  a.visits ??= [];
  a.downloads ??= [];
  a.raw ??= [];
  a.dropped ??= 0;
  a.alerts ??= { opened: [], readers: [], done: [] };
  a.alerts.opened ??= [];
  a.alerts.readers ??= [];
  a.alerts.done ??= [];
  a.reminders ??= { off: {}, sent: {} };
  a.reminders.off ??= {};
  a.reminders.sent ??= {};
  return a;
}

export interface BeaconContext {
  /** HMAC of the reader's cookie. */
  dev: string;
  /** The link it came through. */
  link: string;
  device: DeviceKind | null;
  /** A section's or option's label as the member should read it, from the document when it can be; null refuses the id. */
  label: (kind: "sec" | "opt" | "addon", id: string, fromPage: string | undefined) => string | null;
}

export interface BeaconResult {
  reader: Reader;
  newReader: boolean;
  /** This reader is the first to open this link. */
  firstOnLink: boolean;
  newVisit: boolean;
}

const addTime = (agg: SectionAgg, r: string, vkey: string, want: number): number => {
  const had = agg.by[r] ?? 0;
  const add = Math.max(0, Math.min(want, CAPS.sectionMs - had));
  if (!add) return 0;
  agg.by[r] = had + add;
  agg.ms += add;
  if (agg.cur?.v !== vkey) agg.cur = { v: vkey, ms: 0 };
  const before = agg.cur.ms;
  agg.cur.ms += add;
  if (before < SEEN_MS && agg.cur.ms >= SEEN_MS) agg.visits++;
  return add;
};

/**
 * Add one checked beacon to the item's record. Null when the item already has CAPS.readers readers
 * and this is a new one (the events are counted as dropped).
 */
export function applyBeacon(a: ItemActivity, ctx: BeaconContext, events: BeaconEvent[], nowMs: number): BeaconResult | null {
  normalize(a);
  const now = new Date(nowMs).toISOString();
  let reader = a.readers.find((r) => r.dev === ctx.dev);
  let newReader = false;
  let firstOnLink = false;
  if (!reader) {
    if (a.readers.length >= CAPS.readers) {
      a.dropped += events.length || 1;
      return null;
    }
    firstOnLink = !a.readers.some((r) => r.link === ctx.link);
    reader = { id: `r${a.readers.length + 1}`, dev: ctx.dev, link: ctx.link, signer: firstOnLink, device: ctx.device, firstAt: now, lastAt: now, visits: 0, ms: 0 };
    a.readers.push(reader);
    newReader = true;
  }
  if (!reader.device && ctx.device) reader.device = ctx.device;
  const r = reader;
  const lastMs = Date.parse(r.lastAt);
  const gap = !r.visits || !Number.isFinite(lastMs) || nowMs - lastMs > CAPS.visitGapMs;
  let visit = [...a.visits].reverse().find((v) => v.r === r.id && v.n === r.visits);
  const newVisit = gap || !visit;
  if (newVisit) {
    r.visits++;
    visit = { r: r.id, n: r.visits, at: now, end: now, ms: 0, secs: {} };
    a.visits.push(visit);
    if (a.visits.length > CAPS.visits) a.visits.splice(0, a.visits.length - CAPS.visits);
  }
  const v = visit!;
  const vkey = `${r.id}:${v.n}`;
  // What this beacon may carry: the time since this reader's last one, and a little slack.
  const budget = Math.min(CAPS.beaconMs, (gap ? 0 : Math.max(0, nowMs - lastMs)) + CAPS.slackMs);
  const scaleOf = (t: "sec" | "opt") => {
    const sum = events.reduce((n, e) => n + (e.t === t ? e.ms : 0), 0);
    return sum > budget ? budget / sum : 1;
  };
  const secScale = scaleOf("sec");
  const optScale = scaleOf("opt");
  for (const e of events) {
    if (e.t === "open") {
      a.raw.push({ at: now, r: r.id, t: "open" });
      continue;
    }
    if (e.t === "dl") {
      a.downloads.push({ r: r.id, at: now });
      if (a.downloads.length > CAPS.downloads) a.downloads.splice(0, a.downloads.length - CAPS.downloads);
      a.raw.push({ at: now, r: r.id, t: "dl" });
      continue;
    }
    const kind = e.t === "sec" ? "sec" : e.t === "addon" ? "addon" : "opt";
    const label = ctx.label(kind, e.id, e.label);
    if (label === null) {
      a.dropped++;
      continue;
    }
    if (e.t === "sec") {
      let agg = a.sections[e.id];
      if (!agg) {
        if (Object.keys(a.sections).length >= CAPS.sections) {
          a.dropped++;
          continue;
        }
        agg = a.sections[e.id] = { label, ms: 0, by: {}, visits: 0 };
      }
      const add = addTime(agg, r.id, vkey, Math.round(e.ms * secScale));
      r.ms += add;
      v.ms += add;
      if (add && (e.id in v.secs || Object.keys(v.secs).length < 12)) v.secs[e.id] = (v.secs[e.id] ?? 0) + add;
      a.raw.push({ at: now, r: r.id, t: "sec", id: e.id, ms: add });
    } else if (e.t === "opt" || e.t === "pick") {
      let agg: OptionAgg | undefined = a.options[e.id];
      if (!agg) {
        if (Object.keys(a.options).length >= CAPS.options) {
          a.dropped++;
          continue;
        }
        agg = a.options[e.id] = { label, ms: 0, by: {}, visits: 0, picks: 0 };
      }
      if (e.t === "opt") {
        const add = addTime(agg, r.id, vkey, Math.round(e.ms * optScale));
        a.raw.push({ at: now, r: r.id, t: "opt", id: e.id, ms: add });
      } else {
        agg.picks++;
        agg.pickedAt = now;
        a.raw.push({ at: now, r: r.id, t: "pick", id: e.id });
      }
    } else if (e.t === "addon") {
      let agg = a.addons[e.id];
      if (!agg) {
        if (Object.keys(a.addons).length >= CAPS.addons) {
          a.dropped++;
          continue;
        }
        agg = a.addons[e.id] = { label, on: 0, off: 0, now: false };
      }
      if (e.on) agg.on++;
      else agg.off++;
      agg.now = e.on;
      a.raw.push({ at: now, r: r.id, t: e.on ? "addon_on" : "addon_off", id: e.id });
    }
  }
  if (a.raw.length > CAPS.raw) a.raw.splice(0, a.raw.length - CAPS.raw);
  r.lastAt = now;
  v.end = now;
  return { reader: r, newReader, firstOnLink, newVisit };
}

/* ---------- reading it back ---------- */

/** Sections that are about the price, by their label. */
export const PRICING = /pric|\bfees?\b|invest|\bcosts?\b|budget|\brates?\b|\boptions\b|packages?\b/i;

export const pricingIds = (a: ItemActivity): string[] => Object.entries(a.sections).filter(([, s]) => PRICING.test(s.label)).map(([id]) => id);

/** Visits that spent SEEN_MS or more on a pricing section (or on the options). */
export function pricingVisits(a: ItemActivity): { n: number; lastAt: string | null; lastMs: number; label: string } {
  const ids = new Set(pricingIds(a));
  let n = 0;
  let lastAt: string | null = null;
  let lastMs = 0;
  for (const v of a.visits) {
    const ms = Object.entries(v.secs).reduce((t, [id, x]) => t + (ids.has(id) ? x : 0), 0);
    if (ms >= SEEN_MS) {
      n++;
      lastAt = v.end;
      lastMs = ms;
    }
  }
  // Visits trimmed off the list still count on the sections themselves.
  const counted = Math.max(n, ...[...ids].map((id) => a.sections[id]?.visits ?? 0), 0);
  const label = [...ids].map((id) => a.sections[id]).sort((x, y) => y.ms - x.ms)[0]?.label ?? "Pricing";
  return { n: counted, lastAt, lastMs, label };
}

/** Options they looked at for a while, or picked, most first. */
export function optionsLooked(a: ItemActivity): { id: string; label: string; ms: number; picks: number }[] {
  return Object.entries(a.options)
    .map(([id, o]) => ({ id, label: o.label, ms: o.ms, picks: o.picks }))
    .filter((o) => o.picks > 0 || o.ms >= 15_000)
    .sort((x, y) => y.picks - x.picks || y.ms - x.ms);
}

/** The option picked last, or null. */
export function optionNow(a: ItemActivity): string | null {
  const o = Object.values(a.options)
    .filter((x) => x.pickedAt)
    .sort((x, y) => (y.pickedAt ?? "").localeCompare(x.pickedAt ?? ""))[0];
  return o?.label ?? null;
}

export const addonsOn = (a: ItemActivity): string[] => Object.values(a.addons).filter((x) => x.now).map((x) => x.label);

export const totalMs = (a: ItemActivity) => a.readers.reduce((n, r) => n + r.ms, 0);
export const lastActivity = (a: ItemActivity): string | null => a.readers.map((r) => r.lastAt).sort().pop() ?? null;
export const totalVisits = (a: ItemActivity) => a.readers.reduce((n, r) => n + r.visits, 0);

/* ---------- words ---------- */

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
export const ordinal = (n: number) => ORD[n] ?? `${n}th`;
export const timesWords = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "20 sec", "1 min", "1.5 min", "12 min", "1 hr 5 min". */
export function minWords(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(s < 10 ? s : Math.round(s / 10) * 10, 0)} sec`;
  const m = Math.round((ms / 60_000) * 2) / 2;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} hr${m % 60 ? ` ${Math.round(m % 60)} min` : ""}`;
}
/** The short form, for phones: "20s", "1.5m", "11m". */
export const minShort = (ms: number) => minWords(ms).replace(" sec", "s").replace(" min", "m").replace(" hr", "h");
/** "4 minutes", "20 seconds", in a sentence. */
export const minSentence = (ms: number) => minWords(ms).replace(/ sec$/, " seconds").replace(/^1 min$/, "1 minute").replace(/ min$/, " minutes");

/** "3 hours ago", "yesterday", "4 days ago": no time of day, so no time zone. */
export function agoWords(at: string | null, nowMs: number): string {
  const ms = nowMs - Date.parse(at ?? "");
  if (!Number.isFinite(ms)) return "";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const firstName = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] || "";
export const andList = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
