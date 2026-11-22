/**
 * Own sites (lib/ownsites) and the table's state: who to read, storing what was found, the admin's
 * counts, sample and Undo. Every write goes through lib/table.ts's own mutate, so it queues with
 * the members' actions and the other jobs.
 *
 * Who: the people the import linked to their own firm (Seed.ownSites, United States, never
 * California), whose seat still carries the name from public profiles (not claimed by a member, not
 * taken off with Remove my name), and never a member whose own choice keeps them out of view. State.ownEmails holds what was found, by person key; a dry run's
 * finds are marked pending and are never usable. State.ownSitesJob.people holds each person's last
 * try, so a restart carries on, and a miss is tried again after RETRY_DAYS.
 */
import { nameKey } from "../personName";
import { siteKey } from "../tableFields";
import { loadSeed, loadState, tableInternals as T, type Seed, type State } from "../table";
import type { ReadOutcome, ReadTarget } from "./read";
import { emptyOwnSites, OWN_MISSES, RETRY_DAYS, type OwnAttempt, type OwnEmail, type OwnRunSummary, type OwnSiteLink, type OwnSitesState } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export type OwnTarget = ReadTarget & { how: OwnSiteLink["how"] };

/**
 * Each linked person's name on their seat, by person key: a name from public profiles on the seed
 * that no member claimed or took off (a value in the state replaces it, or keeps it off). Read from
 * the seed itself, so the job reads while the unverified-names switch hides names; the record shows
 * only where the name does (lib/table.ts ownSitePeople).
 */
function namesByKey(seed: Seed, s: State): Map<string, string> {
  const links = seed.ownSites ?? {};
  // A member whose own choice keeps them out of view (Fractionals, Referral partners) is never read.
  const priv = T.privateMemberKeys(seed, s);
  const out = new Map<string, string>();
  for (const e of seed.engagements) {
    const k = e.holderKey;
    if (!k || !links[k] || out.has(k)) continue;
    const name = e.holderFrom === "public profile" ? e.fields.operator : "";
    if (!name || s.values[`${e.id}.operator`] || priv.has(nameKey(name))) continue;
    out.set(k, name);
  }
  return out;
}

/** Whether a person is due a read. A dry run reads anyone without a usable email who wasn't taken off. */
export function dueOwn(prev: OwnAttempt | undefined, email: OwnEmail | undefined, nowMs: number, dry: boolean): boolean {
  if (email && !email.pending) return false;
  if (!prev || prev.dry) return true;
  if (prev.s === "removed" || prev.s === "undone") return false;
  if (dry) return true;
  if (prev.s === "found") return !email || !!email.pending;
  const age = nowMs - Date.parse(prev.at);
  return !Number.isFinite(age) || age >= RETRY_DAYS * DAY;
}

/**
 * The people to read now, in order: a known site first, then a firm with a site the files give,
 * then a firm known by name; within each, never tried before first, then the oldest try.
 * `knownOnly`: people with a site only.
 */
export async function ownTargets(o: { nowIso?: string; dry?: boolean; knownFirst?: boolean } = {}): Promise<OwnTarget[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const nowMs = o.nowIso ? Date.parse(o.nowIso) : Date.now();
  const links = seed.ownSites ?? {};
  const names = namesByKey(seed, s);
  const job = s.ownSitesJob ?? emptyOwnSites();
  const out: (OwnTarget & { rank: number; prevAt: string })[] = [];
  for (const [key, link] of Object.entries(links)) {
    const name = names.get(key);
    if (!name || (!link.site && !link.firm)) continue;
    const prev = job.people[key];
    if (!dueOwn(prev, s.ownEmails?.[key], nowMs, !!o.dry)) continue;
    // A firm's site the job found before is read again without another lookup.
    const site = link.site || (prev?.site && !prev.dry ? prev.site : undefined);
    const rank = link.how === "known site" ? 0 : site ? 1 : 2;
    out.push({ key, name, ...(site ? { site } : {}), ...(link.firm ? { firm: link.firm } : {}), how: link.how, rank, prevAt: prev && !prev.dry ? prev.at : "" });
  }
  out.sort((a, b) => a.rank - b.rank || Number(!!a.prevAt) - Number(!!b.prevAt) || a.prevAt.localeCompare(b.prevAt) || a.key.localeCompare(b.key));
  return out.map(({ rank: _r, prevAt: _p, ...t }) => t); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Website keys of the companies on file, so a firm found by name is never a client's site. */
export async function clientSites(): Promise<Set<string>> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  const out = new Set<string>();
  for (const c of g.companies.values()) {
    const k = siteKey(T.live(c, s, "website"));
    if (k) out.add(k);
  }
  return out;
}

/**
 * Store a batch of tries. A real run's find is usable (with RN_OWNSITES=1); a dry run's is stored
 * pending, never over a usable one, and its tries never hold a person back from the next real run.
 * A person taken off or undone since the read started stays off.
 */
export function saveOwn(outcomes: ReadOutcome[], dry: boolean, nowIso?: string, run?: OwnRunSummary | null): Promise<void> {
  return T.mutate((s) => {
    const now = nowIso ?? new Date().toISOString();
    const job = (s.ownSitesJob ??= emptyOwnSites());
    const emails = (s.ownEmails ??= {});
    for (const o of outcomes) {
      const prev = job.people[o.key];
      if (prev && (prev.s === "removed" || prev.s === "undone")) continue;
      const had = emails[o.key];
      if (dry && had && !had.pending) continue;
      const site = o.s === "found" ? (o.lookedUp ?? undefined) : o.site;
      if (dry && prev && !prev.dry) {
        // A real try stays: the dry run's find is kept apart as pending.
      } else job.people[o.key] = { s: o.s, at: now, pages: o.pages, ...(site ? { site } : {}), ...(dry ? { dry: true as const } : {}) };
      if (o.s === "found") emails[o.key] = { email: o.email, page: o.page, at: now, how: o.how, site: o.site, ...(dry ? { pending: true as const } : {}) };
      else if (!dry && had?.pending) delete emails[o.key];
    }
    if (run) {
      if (run.dry) job.lastDry = { ...run };
      else job.lastRun = { ...run };
    }
  });
}

/** A dry run of this size has started: a restart doesn't run it again. False when it already had. */
export function claimDry(n: number): Promise<boolean> {
  return T.mutate((s) => {
    const job = (s.ownSitesJob ??= emptyOwnSites());
    if (job.dryDone.includes(n)) return false;
    job.dryDone = [...job.dryDone, n].slice(-20);
    return true;
  });
}

/* ---------- the admin's card ---------- */

export interface OwnStats {
  linked: number;
  withSite: number;
  firmOnly: number;
  usable: number;
  pending: number;
  byHow: Record<string, number>;
  misses: Record<string, number>;
  removed: number;
  undone: number;
}

/** Counts for the admin's card. */
export async function ownStats(): Promise<OwnStats> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const links = Object.values(seed.ownSites ?? {});
  const job = s.ownSitesJob ?? emptyOwnSites();
  const emails = Object.values(s.ownEmails ?? {});
  const misses: Record<string, number> = Object.fromEntries(OWN_MISSES.map((m) => [m, 0]));
  let removed = 0;
  let undone = 0;
  for (const a of Object.values(job.people)) {
    if (a.dry) continue;
    if (a.s === "removed") removed++;
    else if (a.s === "undone") undone++;
    else if (a.s !== "found") misses[a.s] = (misses[a.s] ?? 0) + 1;
  }
  const byHow: Record<string, number> = {};
  for (const e of emails) if (!e.pending) byHow[e.how] = (byHow[e.how] ?? 0) + 1;
  return {
    linked: links.length,
    withSite: links.filter((l) => !!l.site).length,
    firmOnly: links.filter((l) => !l.site).length,
    usable: emails.filter((e) => !e.pending).length,
    pending: emails.filter((e) => e.pending).length,
    byHow,
    misses,
    removed,
    undone,
  };
}

export interface OwnSample {
  name: string;
  email: string;
  site: string;
  page: string;
  how: string;
  at: string;
  pending: boolean;
}

/** A short sample of found emails with the seat holder's name, for the owner only (the caller checks admin). Newest first. */
export async function ownSample(limit = 25): Promise<{ rows: OwnSample[]; total: number }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const names = namesByKey(seed, s);
  const rows = Object.entries(s.ownEmails ?? {}).sort((a, b) => b[1].at.localeCompare(a[1].at));
  return {
    total: rows.length,
    rows: rows.slice(0, limit).map(([k, e]) => ({ name: names.get(k) ?? "", email: e.email, site: e.site, page: e.page, how: e.how, at: e.at, pending: !!e.pending })),
  };
}

/**
 * Undo: every found email goes (usable and pending), whoever paid to see one gets the credit back,
 * and those people are not read again on their own. Returns how many went.
 */
export function undoOwnEmails(adminId: string, nowIso?: string): Promise<number> {
  return T.mutate((s) => {
    const now = nowIso ?? new Date().toISOString();
    const job = (s.ownSitesJob ??= emptyOwnSites());
    const keys = Object.keys(s.ownEmails ?? {});
    for (const k of keys) job.people[k] = { s: "undone", at: now };
    s.ownEmails = {};
    T.refundOwnEmails(s, now, undefined, null);
    void adminId;
    return keys.length;
  });
}

export type { OwnSitesState };
