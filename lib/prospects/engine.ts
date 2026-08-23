import { createHash } from "crypto";
import type {
  OperatorProfile,
  Prospect,
  ProspectScan,
  SignalType,
  TimingSignal,
} from "../types";
import { loadProfile, loadProspects, saveProspects } from "../store";
import { gatherSignals, type RawSignal } from "./signals";
import { ALLOWED_SIGNALS, QUEUE, signalDecay, signalWeight } from "./config";

const PITCHES: Record<SignalType, (p: OperatorProfile, s: TimingSignal) => string> = {
  funding: (p) =>
    `Fresh capital means GTM build-out pressure. Pitch a fractional ${p.role} engagement to deploy the raise into pipeline before the FT hires land.`,
  "leadership-gap": (p) =>
    `They're searching for full-time leadership — a 4–6 month gap. Pitch interim/fractional ${p.role} coverage while the search runs, with option to help hire your replacement.`,
  "team-without-leader": (p) =>
    `They're adding GTM ICs without a leader posted. Pitch a fractional ${p.role} leader to onboard the team and build the playbook.`,
  departure: (p) =>
    `The seat just opened. Pitch immediate interim ${p.role} coverage — continuity now, search later.`,
  "ai-native": () =>
    `Leadership is publicly committing to AI-native GTM. Pitch a fractional AI GTM engagement to turn the ambition into a working motion.`,
  "content-gap": () =>
    `Their public content engine is missing or stalled. Pitch a fractional content/marketing engagement with a 90-day publishing plan.`,
  "hiring-role": (p) =>
    `They have open GTM roles in your lane. Pitch fractional ${p.role} to deliver outcomes now while they hire.`,
  "actively-hiring": (p) =>
    `They're in build mode and hiring. Pitch fractional ${p.role} as the faster, lower-risk way to get senior GTM horsepower now.`,
  "early-inflection": (p) =>
    `They're at the founder-led-sales handoff point. Pitch fractional ${p.role} to build the first real GTM motion before they over-hire.`,
  "started-hiring": (p) =>
    `They just flipped to hiring mode. Reach out before the reqs go up — fractional ${p.role} gets them moving while they recruit.`,
  "headcount-jump": (p) =>
    `Headcount just jumped — growth is outrunning the GTM org. Pitch fractional ${p.role} to put structure under the growth.`,
  "positioning-shift": (p) =>
    `They just repositioned. New positioning needs new messaging and motion — pitch fractional ${p.role} to land it in-market.`,
  "newly-launched": (p) =>
    `They just launched publicly. First-mover window for a fractional ${p.role} pitch before they build in-house.`,
  "function-gap": (p) =>
    `They're building around your function while nobody owns it. Pitch fractional ${p.role} to fill the gap before it costs them a quarter.`,
};

const ENGINE_VERSION = "v3-diff";

function normCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|gmbh)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function icpFit(profile: OperatorProfile, context: string): { fit: number; matched: string[] } {
  const text = context.toLowerCase();
  const matched: string[] = [];
  let fit = 30; // base: it surfaced via role-relevant queries at all
  for (const ind of profile.industries) {
    if (ind && text.includes(ind.toLowerCase())) {
      matched.push(ind);
      fit += 20;
    }
  }
  for (const stage of profile.stages) {
    if (stage && text.includes(stage.toLowerCase())) {
      matched.push(stage);
      fit += 15;
    }
  }
  for (const kw of profile.keywords) {
    if (kw && text.includes(kw.toLowerCase())) {
      matched.push(kw);
      fit += 10;
    }
  }
  return { fit: Math.min(100, fit), matched };
}

export async function runProspectScan(): Promise<ProspectScan> {
  const now = new Date().toISOString();
  const profile = await loadProfile();
  const { signals, results } = await gatherSignals(profile);

  // Group signals by company.
  const groups = new Map<string, RawSignal[]>();
  for (const s of signals) {
    const key = normCompany(s.company);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const scored: Prospect[] = [];
  for (const [key, group] of groups) {
    // Dedupe identical signal types per company; keep the first of each.
    const seenTypes = new Set<string>();
    const allowed = ALLOWED_SIGNALS[profile.role];
    const sigs: TimingSignal[] = [];
    for (const s of group) {
      // Role gating: signals that don't inform this role category are noise.
      if (!allowed.includes(s.signal.type)) continue;
      const k = `${s.signal.type}:${s.signal.label}`;
      if (seenTypes.has(k)) continue;
      seenTypes.add(k);
      sigs.push(s.signal);
    }
    if (sigs.length === 0) continue;

    // Timing: noisy-OR with per-signal half-life decay (spec §5.1). Signals
    // compound but saturate — three medium signals beat one strong one, but
    // ten never blow past 100. Standing signals don't decay; their ceiling
    // weights are set lower in config.
    const nowMs = Date.now();
    let survival = 1;
    for (const sig of sigs) {
      const effective = signalWeight(sig.type, profile.role) * signalDecay(sig.type, sig.detectedOn, nowMs);
      survival *= 1 - effective;
    }
    const timing = Math.round(100 * (1 - survival));

    const context = group.map((s) => s.context).join(" ").slice(0, 1500);
    // Universe-derived candidates carry a structured, precomputed ICP fit;
    // news-derived companies fall back to text matching against the profile.
    const universeMember = group.find((s) => s.fit !== undefined);
    const { fit, matched } = universeMember
      ? { fit: universeMember.fit!, matched: universeMember.matched || [] }
      : icpFit(profile, context);

    // Composite (spec §5.2): fit exponent > 1 punishes weak fit harder than
    // weak timing — a perfectly-timed company outside the ICP is noise.
    const overall = Math.round(Math.pow(fit / 100, 1.5) * timing);
    if (overall < QUEUE.minComposite) continue;

    const primary = [...sigs].sort(
      (a, b) => signalWeight(b.type, profile.role) - signalWeight(a.type, profile.role)
    )[0];

    scored.push({
      id: createHash("sha1").update(key).digest("hex").slice(0, 16),
      company: group[0].company,
      domain: group.find((s) => s.domain)?.domain,
      logo: group.find((s) => s.logo)?.logo,
      summary: context.slice(0, 400),
      icpFit: fit,
      matchedIcp: matched,
      timing,
      signals: sigs,
      overall,
      suggestedPitch: PITCHES[primary.type](profile, primary),
      status: "new",
      role: profile.role,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  const db = await loadProspects();
  const byId = new Map(db.prospects.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  // Queue rule (spec §5.3): cap NEW entries per scan so the queue stays
  // reviewable; refreshes of known prospects are not capped.
  for (const p of scored.sort((a, b) => b.overall - a.overall)) {
    const existing = byId.get(p.id);
    if (existing) {
      // Keep operator pipeline state; refresh the evidence.
      existing.lastSeenAt = now;
      existing.summary = p.summary;
      existing.logo = p.logo ?? existing.logo;
      existing.domain = p.domain ?? existing.domain;
      existing.icpFit = p.icpFit;
      existing.matchedIcp = p.matchedIcp;
      existing.timing = p.timing;
      existing.signals = p.signals;
      existing.overall = p.overall;
      existing.suggestedPitch = p.suggestedPitch;
      existing.role = profile.role;
      updated++;
    } else if (added < QUEUE.maxNewPerScan) {
      byId.set(p.id, p);
      added++;
    }
  }

  // Prospects whose signals evaporated age out after 30 days unless the
  // operator queued or contacted them — and a role switch flushes the queue
  // entirely: matches generated for another role category are not this
  // role's matches.
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const prospects = [...byId.values()]
    .filter(
      (p) =>
        p.status === "queued" ||
        p.status === "contacted" ||
        (p.role === profile.role && new Date(p.lastSeenAt).getTime() >= cutoff)
    )
    .sort((a, b) => b.overall - a.overall);

  const scan: ProspectScan = { at: now, results, added, updated, engineVersion: ENGINE_VERSION };
  await saveProspects({ prospects, lastScan: scan });
  return scan;
}
