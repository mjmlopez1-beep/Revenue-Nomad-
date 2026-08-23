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

/**
 * How strongly each signal type indicates "they need THIS role now",
 * per operator role. 0–40 points per signal, cumulative and capped.
 */
const SIGNAL_WEIGHTS: Record<SignalType, Partial<Record<OperatorProfile["role"], number>> & { default: number }> = {
  funding: { default: 25 },
  "leadership-gap": { default: 35 },
  "team-without-leader": { default: 30 },
  departure: { default: 35 },
  "ai-native": { "AI GTM": 35, default: 10 },
  "content-gap": { Marketing: 35, "AI GTM": 15, default: 10 },
  "hiring-role": { default: 25 },
};

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
};

function normCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|gmbh)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function icpFit(profile: OperatorProfile, context: string, onWatchlist: boolean): { fit: number; matched: string[] } {
  if (onWatchlist) return { fit: 100, matched: ["On your watchlist"] };
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

  const watchlistKeys = new Set(profile.watchlist.map((w) => normCompany(w.company)));

  const scored: Prospect[] = [];
  for (const [key, group] of groups) {
    // Dedupe identical signal types per company; keep the first of each.
    const seenTypes = new Set<string>();
    const sigs: TimingSignal[] = [];
    for (const s of group) {
      const k = `${s.signal.type}:${s.signal.label}`;
      if (seenTypes.has(k)) continue;
      seenTypes.add(k);
      sigs.push(s.signal);
    }

    let timing = 0;
    for (const sig of sigs) {
      const w = SIGNAL_WEIGHTS[sig.type];
      timing += w[profile.role] ?? w.default;
    }
    timing = Math.min(100, timing);

    const context = group.map((s) => s.context).join(" ").slice(0, 1500);
    const onWatchlist = watchlistKeys.has(key);
    const { fit, matched } = icpFit(profile, context, onWatchlist);

    // Timing dominates — "right company, wrong moment" can wait; the reverse can't.
    const overall = Math.round(timing * 0.6 + fit * 0.4);
    if (overall < 40) continue;

    const primary = [...sigs].sort(
      (a, b) =>
        (SIGNAL_WEIGHTS[b.type][profile.role] ?? SIGNAL_WEIGHTS[b.type].default) -
        (SIGNAL_WEIGHTS[a.type][profile.role] ?? SIGNAL_WEIGHTS[a.type].default)
    )[0];

    scored.push({
      id: createHash("sha1").update(key).digest("hex").slice(0, 16),
      company: group[0].company,
      domain: group.find((s) => s.domain)?.domain,
      summary: context.slice(0, 400),
      icpFit: fit,
      matchedIcp: matched,
      timing,
      signals: sigs,
      overall,
      suggestedPitch: PITCHES[primary.type](profile, primary),
      status: "new",
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  const db = await loadProspects();
  const byId = new Map(db.prospects.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  for (const p of scored) {
    const existing = byId.get(p.id);
    if (existing) {
      // Keep operator pipeline state; refresh the evidence.
      existing.lastSeenAt = now;
      existing.summary = p.summary;
      existing.icpFit = p.icpFit;
      existing.matchedIcp = p.matchedIcp;
      existing.timing = p.timing;
      existing.signals = p.signals;
      existing.overall = p.overall;
      existing.suggestedPitch = p.suggestedPitch;
      updated++;
    } else {
      byId.set(p.id, p);
      added++;
    }
  }

  // Prospects whose signals evaporated age out after 30 days unless the
  // operator queued or contacted them.
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const prospects = [...byId.values()]
    .filter(
      (p) =>
        p.status === "queued" ||
        p.status === "contacted" ||
        new Date(p.lastSeenAt).getTime() >= cutoff
    )
    .sort((a, b) => b.overall - a.overall);

  const scan: ProspectScan = { at: now, results, added, updated };
  await saveProspects({ prospects, lastScan: scan });
  return scan;
}
