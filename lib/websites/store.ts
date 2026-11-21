/**
 * The website finder and the table's state (lib/websites): which companies to read, storing what
 * was found, and the admin's list with Undo. Every write goes through lib/table.ts's own mutate,
 * so it queues with the members' actions and the other jobs.
 *
 * A found website is a live company value by WEBSITE_FOUND_BY (a system value: nobody earns a
 * credit for it, it is never a member's fact), set only on a company with no website at all; its
 * LinkedIn page likewise, only when the company has none. How it was found (the confidence, the
 * date) is in State.websites, which only admins ever see.
 */
import { companyFirm } from "../firmRemoval";
import { isPlaceholderCompany } from "../scan/clean";
import { siteKey } from "../tableFields";
import { loadSeed, loadState, tableInternals as T, type State } from "../table";
import { ascii } from "./candidates";
import { FAILED_RETRY_DAYS, RETRY_DAYS, WEBSITE_FOUND_BY, websitesProgress, type WebsiteOutcome, type WebsiteStatus, type WebsiteTarget, type WebsitesRunSummary } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const fkey = (id: string, field: string) => `${id}.${field}`;
type Graph = ReturnType<typeof T.graph>;
type CompanyNode = Graph["companies"] extends Map<string, infer N> ? N : never;

/** An employee count that says one person ("1", "Self-employed", "1 employee"). */
const ONE_PERSON = /^\s*(1|0\s*[-–]\s*1|1 employee|self[\s-]?employed|sole (trader|proprietor))\s*$/i;
const words = (s: string) => ascii(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether the company reads as a person's own practice: its name holds one of its seat holders'
 * surnames (or their whole name), or it is a one-person company.
 */
export function personalPractice(name: string, holders: string[], employees: string | null): boolean {
  if (employees && ONE_PERSON.test(employees)) return true;
  const co = words(name);
  const flat = co.join("");
  for (const h of holders) {
    const person = words(String(h).split(/[,(|]/)[0]);
    if (person.length < 2) continue;
    const surname = person[person.length - 1];
    if (co.includes(surname) || (surname.length >= 5 && flat.includes(surname)) || (person.join("").length >= 5 && flat.includes(person.join("")))) return true;
  }
  return false;
}

/** Whether the company has a website on file in any form: our records, or any value (a removed one too: an admin took it off for a reason). */
const hasWebsite = (s: State, node: CompanyNode) => !!node.seedFields.website || !!s.values[fkey(node.id, "website")];
const hasLinkedin = (s: State, node: CompanyNode) => !!node.seedFields.linkedin || !!s.values[fkey(node.id, "linkedin")];

/** Seat holders' names at each company. */
function holdersByCompany(s: State, g: Graph): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of g.engagements.values()) {
    const n = T.live(e, s, "operator");
    if (!n) continue;
    const l = out.get(e.companyId);
    if (l) l.push(n);
    else out.set(e.companyId, [n]);
  }
  return out;
}

/** Why a company is not one to read, or null when it is (it still may not be due). */
export function skipReason(s: State, node: CompanyNode, holders: string[], firms: Set<string>): string | null {
  if (hasWebsite(s, node)) return "has a website";
  if (isPlaceholderCompany(node.name)) return "placeholder name";
  if (firms.has(node.id) || companyFirm(node.name, T.live(node, s, "about"), null)) return "fractional firm";
  if (personalPractice(node.name, holders, T.live(node, s, "employees") ?? node.seedFields.employees ?? null)) return "a person's own practice";
  return null;
}

/** Whether a company with this last status is due a read at `nowMs`. */
export function dueAgain(prev: WebsiteStatus | null | undefined, nowMs: number): boolean {
  if (!prev) return true;
  if (prev.s === "found" || prev.s === "undone" || prev.s === "kept") return false;
  const age = nowMs - Date.parse(prev.at);
  if (!Number.isFinite(age)) return true;
  return age >= (prev.s === "failed" ? FAILED_RETRY_DAYS : RETRY_DAYS) * DAY;
}

/** A company members added lately is read first: the low-priority queue the next run picks up. */
const QUEUE_DAYS = 60;
const SYSTEM_BY = new Set(["seed", "scan", "website", WEBSITE_FOUND_BY]);

/**
 * Companies to read now, in order: those members added lately (newest first), then the rest never
 * tried, then those whose last try is due again (oldest first). Skips companies with a website,
 * placeholder names, firms and a person's own practice.
 */
export async function websiteTargets(nowIso?: string): Promise<WebsiteTarget[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  const g = T.graph(seed, s);
  const holders = holdersByCompany(s, g);
  const firms = T.firmsInReview(seed, s);
  const addedAt = new Map<string, string>();
  for (const c of s.companies) if (!SYSTEM_BY.has(c.by) && nowMs - Date.parse(c.at) < QUEUE_DAYS * DAY) addedAt.set(c.id, c.at);
  const out: (WebsiteTarget & { added: string })[] = [];
  for (const node of g.companies.values()) {
    const prev = s.websites?.companies[node.id] ?? null;
    if (!dueAgain(prev, nowMs)) continue;
    if (skipReason(s, node, holders.get(node.id) ?? [], firms)) continue;
    const added = !prev ? addedAt.get(node.id) ?? "" : "";
    out.push({ companyId: node.id, name: node.name, country: T.geoOf(node, s).country, prev, queued: !!added, added });
  }
  out.sort((a, b) => Number(b.queued) - Number(a.queued) || b.added.localeCompare(a.added) || Number(!!a.prev) - Number(!!b.prev) || (a.prev?.at ?? "").localeCompare(b.prev?.at ?? ""));
  return out.map(({ added: _a, ...t }) => t); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Every website key on file (lib/tableFields.ts siteKey), for "never another company's site". */
export async function takenSites(): Promise<Set<string>> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  const out = new Set<string>();
  for (const c of g.companies.values()) {
    const k = siteKey(T.live(c, s, "website"));
    if (k) out.add(k);
  }
  return out;
}

/** What saveWebsites did with each outcome. */
export type WebsiteSaved = "high" | "medium" | "kept" | "none" | "failed";

/**
 * Store a batch of finds. A website goes in only where the company still has none and no other
 * company has it; its LinkedIn page only where the company has none and no other company has it.
 * Every company gets its status, so a restart carries on where this stopped. `run` is the run so far.
 */
export function saveWebsites(outcomes: WebsiteOutcome[], run: WebsitesRunSummary | null, nowIso?: string): Promise<WebsiteSaved[]> {
  return T.mutate((s, seed) => {
    const now = nowIso ?? new Date().toISOString();
    const w = (s.websites ??= { companies: {}, lastRun: null });
    const g = T.graph(seed, s);
    const sites = new Set<string>();
    const pages = new Set<string>();
    for (const c of g.companies.values()) {
      const k = siteKey(T.live(c, s, "website"));
      if (k) sites.add(k);
      const l = T.live(c, s, "linkedin");
      if (l) pages.add(l.toLowerCase());
    }
    const out: WebsiteSaved[] = [];
    for (const o of outcomes) {
      const node = g.companies.get(o.companyId);
      if (!node) {
        out.push("kept");
        continue;
      }
      const counts = { tried: o.tried, read: o.read };
      if (o.s !== "found" || !o.domain || !o.confidence) {
        w.companies[node.id] = { s: o.s === "found" ? "none" : o.s, at: now, ...(o.why ? { why: o.why } : {}), ...counts };
        out.push(o.s === "failed" ? "failed" : "none");
        continue;
      }
      if (hasWebsite(s, node)) {
        w.companies[node.id] = { s: "kept", at: now, ...counts };
        out.push("kept");
        continue;
      }
      const key = siteKey(o.domain);
      if (!key || sites.has(key)) {
        w.companies[node.id] = { s: "none", at: now, why: "on file for another company", ...counts };
        out.push("none");
        continue;
      }
      s.values[fkey(node.id, "website")] = { value: o.domain, by: WEBSITE_FOUND_BY, at: now, status: "live" };
      sites.add(key);
      let linkedin: string | undefined;
      if (o.linkedin && !hasLinkedin(s, node) && !pages.has(o.linkedin.toLowerCase())) {
        s.values[fkey(node.id, "linkedin")] = { value: o.linkedin, by: WEBSITE_FOUND_BY, at: now, status: "live" };
        pages.add(o.linkedin.toLowerCase());
        linkedin = o.linkedin;
      }
      w.companies[node.id] = { s: "found", at: now, domain: o.domain, confidence: o.confidence, ...(linkedin ? { linkedin } : {}), ...counts };
      out.push(o.confidence);
    }
    if (run) w.lastRun = { ...run };
    return out;
  });
}

/* ---------- the admin's list ---------- */

/** One row of the admin's list of recent finds. `live`: the found website is still the company's. */
export interface WebsiteFind {
  companyId: string;
  name: string;
  domain: string;
  linkedin: string | null;
  confidence: "high" | "medium";
  at: string;
  undone: boolean;
  live: boolean;
}

export interface WebsiteFinds {
  finds: WebsiteFind[];
  /** Finds on file in all (the list shows the newest). */
  total: number;
  /** The last dry run's finds, in this process only (nothing was written). */
  dry: { at: string; finds: { companyId: string; name: string; domain: string; confidence: "high" | "medium" }[] } | null;
}

/** The newest finds, for admins (the caller checks). Company ids are public ids. */
export async function websiteFinds(limit = 50): Promise<WebsiteFinds> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  const rows = Object.entries(s.websites?.companies ?? {}).filter(([id, st]) => (st.s === "found" || st.s === "undone") && st.domain && st.confidence && g.companies.has(id));
  rows.sort((a, b) => b[1].at.localeCompare(a[1].at));
  const finds = rows.slice(0, limit).map(([id, st]): WebsiteFind => {
    const node = g.companies.get(id)!;
    const v = s.values[fkey(id, "website")];
    return {
      companyId: T.pubId(id),
      name: node.name,
      domain: st.domain!,
      linkedin: st.linkedin ?? null,
      confidence: st.confidence!,
      at: st.at,
      undone: st.s === "undone",
      live: st.s === "found" && !!v && v.by === WEBSITE_FOUND_BY && v.status === "live" && v.value === st.domain,
    };
  });
  const dry = websitesProgress.dry;
  return {
    finds,
    total: rows.length,
    dry: dry
      ? {
          at: dry.run.startedAt,
          finds: dry.finds.slice(0, limit).map((f) => ({ companyId: T.pubId(f.companyId), name: g.companies.get(f.companyId)?.name ?? f.name, domain: f.domain, confidence: f.confidence })),
        }
      : null,
  };
}

/**
 * An admin takes a find back: the website (and the LinkedIn page found with it) come off where
 * they are still Merlin's, and the company is never tried again on its own. A value someone else
 * set since stays. `companyId` is the public id.
 */
export function undoWebsite(companyId: string, adminId: string, nowIso?: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  return T.mutate((s, seed) => {
    const g = T.graph(seed, s);
    const node = [...g.companies.values()].find((c) => T.pubId(c.id) === companyId);
    const st = node ? s.websites?.companies[node.id] : undefined;
    if (!node || !st || !st.domain) return { ok: false as const, error: "Merlin didn't find a website for that company. Refresh the list and try again." };
    if (st.s === "undone") return { ok: true as const, message: "Already taken back." };
    const now = nowIso ?? new Date().toISOString();
    let gone = 0;
    for (const field of ["website", "linkedin"] as const) {
      const k = fkey(node.id, field);
      const v = s.values[k];
      const ours = field === "website" ? st.domain : st.linkedin;
      if (!v || !ours || v.by !== WEBSITE_FOUND_BY || v.value !== ours) continue;
      delete s.values[k];
      delete s.verifications[k];
      delete s.unlocks[k];
      gone++;
    }
    s.websites!.companies[node.id] = { ...st, s: "undone", at: now, undoneBy: adminId };
    return { ok: true as const, message: gone ? `Took back ${st.domain} for ${node.name}. Merlin won't look for it again.` : `${node.name} has a website someone else set since, so it stays. Merlin won't look again.` };
  });
}
