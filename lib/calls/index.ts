/**
 * "A call ends" (behind RN_CALL_TRIGGERS, off by default, and RN_WORKFLOWS): when a sales call
 * ends in the member's call recorder, Merlin sees what was agreed and builds it, as drafts for the
 * member alone, in their inbox about 10 minutes after the call (the scheduler's 5-minute tick, then
 * the run).
 *
 *   callTick        the scheduler's tick (lib/jobs.ts): each member with a call workflow on, each
 *                   recorder they connected (lib/calls/providers.ts), the calls that ended since the
 *                   last look (a cursor per member and recorder, an overlap for notes written late,
 *                   at most CALL_WATCH.perTick a look). A call with nobody from outside the member's
 *                   company is left alone. Each other call's transcript is read once, in memory, and
 *                   its workflows run once (lib/workflows/run.ts keys: "<workflow>|call:<recorder>:<id>").
 *   companyOfCall   the company: a participant's work domain matched to the member's pipeline, then
 *                   to a company on Merlin by its website, then a participant's name in the member's
 *                   own LinkedIn file or contacts file (Google stays out: it is private to them).
 *   runCallFlow     the run's conditions (a sales or discovery call; only if they agreed to send a
 *                   proposal, an SOW, a follow-up email or a deck) and its steps:
 *                     proposal   the draft-from-call path (lib/proposals/draft.ts with Merlin's AI where
 *                                it is on, else lib/mcp/proposals.ts draftFromCall's rules) with the
 *                                member's template, Evidence Bank proof for the company (createProposal,
 *                                Close), their profile and voice: a DRAFT linked to the company. Never sent.
 *                     sow        the same with their SOW template, else a project build's structure.
 *                     followup   the recap email in their voice: a draft in "Drafts from your workflows".
 *                     deck       a slide-by-slide outline, a draft there too.
 *                     claude     a pack for their own Claude (get_call_pack) and an Open in Claude link.
 *                   then one email to the member and one bell line: "Your proposal draft for <Company> is ready".
 *
 * Privacy: the transcript is read for the run and never kept (only the drafts are); nothing goes to
 * the client; a company the member hasn't opened is described, never named (lockedWords), and no
 * person is named in a run line, a bell line or the email; Google data never feeds it.
 */
import { loadSeed, loadState, tableInternals as T, type Member, type Seed, type State } from "../table";
import { emailEnabled, sendEmail } from "../email";
import { styleOf, voiceSummary } from "../voice";
import { workflowsOn } from "../workflows/run";
import {
  CALL_DEFAULT, CALL_STEPS, DELIVERABLE_WORDS, WF_LIMITS, emptyWorkflows, oneLineWf,
  type CallOptions, type Deliverable, type MemberWorkflows, type RunStep, type WfPack, type WfRun, type WfStepKey, type Workflow, type CallsInfo,
} from "../workflows/types";
import { connectedRecorders, readTranscript, recorderOf, RECORDERS } from "./providers";
import {
  CALL_WATCH, claudeLink, claudePrompt, deckByRules, followupByRules, isSalesKind, kindByRules, kindByWords, readByRules, readyLine, slidesText, summaryByRules,
  type CallKind, type EndedCall, type RecorderKey, type RulesReading, type Slide,
} from "./types";
import { aiReadOpen, readWithAi } from "./read";
import { templateChoices } from "../proposals/kit";

export const callTriggersOn = () => /^(1|on|true|yes)$/i.test(process.env.RN_CALL_TRIGGERS ?? "");

const DAY = 86_400_000;
const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const wfIn = (d: State, memberId: string): MemberWorkflows => ((d.workflows ??= {})[memberId] ??= emptyWorkflows());

/* ---------- the company on the call ---------- */

export interface CallCompany {
  /** Internal id, when the call matched a company on Merlin. */
  id: string | null;
  pub: string | null;
  /** Its name, only when the member can see it. */
  name: string | null;
  /** How the member sees it: its name, a locked company described, or the domain of a company not on Merlin. */
  label: string;
  /** The participant's work domain the match came from. */
  domain: string | null;
  /** Its stage in the member's pipeline. */
  stage: string | null;
}
const hostOf = (raw: unknown) => {
  const h = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(h) ? h : null;
};

/** The company a call was with, as the member sees Merlin. */
export async function companyOfCall(seed: Seed, s: State, m: Member, c: Pick<EndedCall, "participants">): Promise<CallCompany> {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const byHost = new Map<string, string>();
  for (const co of g.companies.values()) {
    const h = hostOf(T.live(co, s, "website"));
    if (h && !byHost.has(h)) byHost.set(h, co.id);
  }
  const match = (d: string) => byHost.get(d) ?? [...byHost].find(([h]) => d.endsWith(`.${h}`))?.[1] ?? null;
  const entries = s.pipeline?.[m.id]?.entries ?? [];
  const stageOf = (id: string) => [...entries].filter((e) => e.companyId === id).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]?.stage ?? null;
  let id: string | null = null;
  let domain: string | null = null;
  // The member's pipeline first: the deal the call was about.
  for (const d of c.participants.domains) {
    const x = match(d);
    if (x && stageOf(x)) {
      id = x;
      domain = d;
      break;
    }
  }
  if (!id)
    for (const d of c.participants.domains) {
      const x = match(d);
      if (x) {
        id = x;
        domain = d;
        break;
      }
    }
  // Then the member's own files: a participant's name in their LinkedIn file or contacts file, at a company on Merlin. Never Google.
  if (!id && c.participants.names.length) {
    const [kv, { coKey }, { personKey }] = await Promise.all([import("../notify/knownView"), import("../notify/known"), import("../paths/match")]);
    const byName = kv.companyByName(g);
    const people = kv.knownPeopleOf(s, m, g).filter((p) => p.src !== "google");
    for (const n of c.participants.names) {
      const k = personKey(n);
      const p = k ? people.find((x) => x.nameKey === k) : undefined;
      const x = p ? p.companyId ?? (p.company ? byName(coKey(p.company)) : null) : null;
      if (x) {
        id = x;
        break;
      }
    }
  }
  domain ??= c.participants.domains[0] ?? null;
  if (!id) return { id: null, pub: null, name: null, label: domain ?? "the company on your call", domain, stage: null };
  const hidden = T.identityHidden(g, s, idx, tracks, m, id);
  const name = hidden ? null : g.companies.get(id)?.name || null;
  const { lockedWords } = await import("../notify/knownView");
  return { id, pub: T.pubId(id), name, label: name ?? lockedWords(g, s, id), domain, stage: stageOf(id) };
}

/* ---------- one call, read once for every workflow it runs ---------- */

export interface CallReading {
  kind: CallKind;
  /** Who read it: Merlin's AI, or Merlin's own rules. */
  via: "merlin" | "rules";
  agreed: Deliverable[];
  summary: string;
  items: string[];
  next: string[];
  followup: { subject: string; body: string } | null;
  deck: Slide[] | null;
  rules: RulesReading;
}
/** What a call event carries in memory for its runs (never stored): the call, the company, the transcript, the reading. */
export interface CallCtx {
  recorder: RecorderKey;
  id: string;
  title?: string;
  startedAt: string;
  endedAt: string;
  minutes: number | null;
  names: string[];
  company: CallCompany;
  /** The rules' kind, before the transcript. */
  ruled: CallKind;
  /** The transcript, read once; null with `unread` when the recorder couldn't give it. */
  transcript: string | null;
  unread?: string;
  reading: () => Promise<CallReading>;
}

function makeReading(m: Member, s: State, ctx: Omit<CallCtx, "reading">, want: { followup: boolean; deck: boolean }, nowMs: number): () => Promise<CallReading> {
  let p: Promise<CallReading> | null = null;
  return () =>
    (p ??= (async () => {
      const text = ctx.transcript ?? "";
      const rules = readByRules(text);
      const v = s.voice?.[m.id];
      const ai = text && aiReadOpen(await loadState(), m.id, nowMs) ? await readWithAi(m.id, text, { me: m.name, company: ctx.company.name ?? "the client", voice: v ? voiceSummary(styleOf(v), m.name) : null, want }, nowMs) : null;
      const kind: CallKind = ctx.ruled !== "unknown" ? ctx.ruled : ai ? ai.kind : kindByWords(text);
      const sum = summaryByRules(rules, { company: ctx.company.name ?? "the client", minutes: ctx.minutes });
      return ai
        ? { kind, via: "merlin" as const, agreed: ai.agreed, summary: ai.summary || sum.summary, items: ai.items.length ? ai.items : sum.items, next: ai.next.length ? ai.next : sum.next, followup: ai.followup, deck: ai.deck, rules }
        : { kind, via: "rules" as const, agreed: rules.agreed, summary: sum.summary, items: sum.items, next: sum.next, followup: null, deck: null, rules };
    })());
}

/* ---------- the scheduler's tick ---------- */

/** Members with a call workflow on (none while the switches are off). */
function callWatchers(s: State): string[] {
  if (!callTriggersOn() || !workflowsOn()) return [];
  return Object.entries(s.workflows ?? {})
    .filter(([id, w]) => !s.closures?.[id] && w.flows.some((f) => f.on && f.trigger === "call"))
    .map(([id]) => id);
}

const inTick = { running: false };
/**
 * Look for calls that ended and run the workflows they set off. Cheap when nobody has a call
 * workflow on; nothing while the switches are off. Never throws. Resolves with the runs made.
 */
export async function callTick(nowMs = Date.now(), origin?: string): Promise<number> {
  if (!callTriggersOn() || !workflowsOn() || inTick.running) return 0;
  inTick.running = true;
  try {
    const [seed, s] = await Promise.all([loadSeed(), loadState()]);
    const who = callWatchers(s);
    if (!who.length) return 0;
    const idx = T.memberIndex(seed, s);
    const { runEvents } = await import("../workflows/run");
    const evs: import("../workflows/run").WfEvent[] = [];
    for (const memberId of who) {
      const m = idx.byId.get(memberId);
      if (!m) continue;
      const flows = s.workflows![memberId].flows.filter((f) => f.on && f.trigger === "call");
      const want = { followup: flows.some((f) => f.steps.some((x) => x.key === "followup")), deck: flows.some((f) => f.steps.some((x) => x.key === "deck")) };
      for (const r of connectedRecorders(s, memberId)) {
        const cur = s.workflows![memberId].calls?.[r.key];
        const sinceMs = cur ? Math.max(Date.parse(cur.at) - CALL_WATCH.overlapMs, nowMs - CALL_WATCH.lookBackMs) : nowMs - CALL_WATCH.firstLookMs;
        let list: EndedCall[];
        try {
          list = await r.listEndedSince(m, sinceMs, nowMs - CALL_WATCH.settleMs, CALL_WATCH.perTick * 2);
        } catch (e) {
          // The cursor stays: the next tick looks again. Codes only, never a call.
          console.error(`calls: ${r.key} didn't answer (${(e as { code?: string })?.code ?? "error"})`);
          continue;
        }
        const seen = new Set(cur?.seen ?? []);
        const handled: string[] = [];
        for (const c of list.filter((x) => !seen.has(x.id)).slice(0, CALL_WATCH.perTick)) {
          const company = await companyOfCall(seed, s, m, c);
          const ruled = kindByRules({ title: c.title, external: c.participants.domains.length, stage: company.stage });
          if (ruled === "internal") {
            handled.push(c.id);
            continue;
          }
          let transcript: string | null = null;
          let unread: string | undefined;
          try {
            transcript = await readTranscript(r, m, c.id);
          } catch (e) {
            const code = (e as { code?: string })?.code ?? "";
            // Still being written: the next tick tries again, for a few hours after the call.
            if ((code === "pending" || code === "not_found") && nowMs - Date.parse(c.endedAt) < CALL_WATCH.pendingMs) continue;
            unread = e instanceof Error && e.message ? e.message : `${r.name} didn't give the transcript.`;
          }
          handled.push(c.id);
          const minutes = Math.round((Date.parse(c.endedAt) - Date.parse(c.startedAt)) / 60_000);
          const base: Omit<CallCtx, "reading"> = { recorder: r.key, id: c.id, ...(c.title ? { title: c.title } : {}), startedAt: c.startedAt, endedAt: c.endedAt, minutes: minutes > 0 && minutes < 12 * 60 ? minutes : null, names: c.participants.names, company, ruled, transcript, ...(unread ? { unread } : {}) };
          const call: CallCtx = { ...base, reading: makeReading(m, s, base, want, nowMs) };
          evs.push({ memberId, key: `call:${r.key}:${c.id}`, trigger: "call", at: c.endedAt, companyId: company.id, line: `Your call with ${company.label} ended`, href: company.pub && company.name ? `/?c=${encodeURIComponent(company.pub)}` : "/?p=alerts", call });
        }
        await T.mutate((d) => {
          const w = wfIn(d, memberId);
          const was = w.calls?.[r.key];
          (w.calls ??= {})[r.key] = { at: new Date(nowMs).toISOString(), seen: [...(was?.seen ?? []), ...handled].slice(-WF_LIMITS.seen) };
        });
      }
    }
    return evs.length ? await runEvents(evs, origin, nowMs) : 0;
  } catch (e) {
    console.error("calls: the watch failed", e instanceof Error ? e.message : "error");
    return 0;
  } finally {
    inTick.running = false;
  }
}

/* ---------- a call workflow's run ---------- */

type Put = (key: WfStepKey, st: RunStep["status"], note: string, credits?: number) => void;
type Bell = { id: string; at: string; kind: "workflow"; line: string; sub?: string; href: string; alert?: string };

const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const SOW_TITLE = /\b(sow|statement of work|scope of work)\b/i;
/** The deliverable each call step builds. Claude's: the first thing agreed, else a proposal. */
const deliverableOf = (k: WfStepKey, agreed: Deliverable[]): Deliverable => (k === "proposal" ? "proposal" : k === "sow" ? "sow" : k === "followup" ? "followup" : k === "deck" ? "deck" : agreed.find((d) => d !== "followup") ?? agreed[0] ?? "proposal");

/** The member's template for it: the one the workflow names (still theirs or the library's), else the closest one to the call. */
async function templateFor(s: State, m: Member, want: string | null, text: string, sow: boolean): Promise<string | null> {
  const [{ templatesOf, isMineId }, { templateDef }, { bestTemplate }] = await Promise.all([import("../proposals/mine"), import("../proposals/library"), import("../proposals/startCall")]);
  const mine = templatesOf(s, m.id);
  if (sow) return mine.find((t) => SOW_TITLE.test(t.title))?.id ?? "revops-build";
  if (want && (isMineId(want) ? mine.some((t) => t.id === want) : !!templateDef(want))) return want;
  return bestTemplate(templateChoices(s, m.id, false), text).id;
}

/** A proposal (or an SOW) drafted from the call: Merlin's AI where it is on and agreed, else Merlin's rules. Never sent. */
async function draftProposal(m: Member, cx: { call: CallCtx; templateId: string | null; sow: boolean; origin?: string; nowMs: number }): Promise<{ id: string; via: "merlin" | "rules" }> {
  const { call } = cx;
  const text = call.transcript ?? "";
  const s = await loadState();
  const callDate = dayWords(call.endedAt);
  const callWith = call.names[0] ?? "";
  let id: string | null = null;
  let via: "merlin" | "rules" = "rules";
  if (aiReadOpen(s, m.id, cx.nowMs)) {
    try {
      const { draftWithClaude } = await import("../proposals/draft");
      const r = await draftWithClaude(m.token, { templateId: cx.templateId, companyId: call.company.pub ?? undefined, companyName: call.company.name ?? "", transcript: text, callDate, callWith, agree: false }, cx.origin, cx.nowMs);
      id = r.proposal.id;
      via = "merlin";
    } catch (e) {
      console.error("calls: the AI draft didn't come back, Merlin's rules draft it", (e as { status?: number })?.status ?? "");
    }
  }
  if (!id) {
    const { draftFromCall } = await import("../mcp/proposals");
    const out = await draftFromCall({ member: m, origin: cx.origin ?? "" }, { transcript: text, template: cx.templateId ?? undefined, company_id: call.company.pub ?? undefined, call_date: callDate });
    id = String(out.proposal_id ?? "");
    if (!id) throw new Error("no proposal");
  }
  // The call it came from, so Proposals marks this call "Draft ready" and a tap opens this draft (RN_PROPOSALS2).
  const made = id;
  await T.mutate((d) => {
    const p = (d.proposals ?? []).find((x) => x.id === made && x.memberId === m.id);
    if (p && !p.fromCall) p.fromCall = { recorder: call.recorder, id: call.id };
  });
  if (cx.sow) {
    const { updateProposal } = await import("../proposals/store");
    await updateProposal(m.token, id, { title: `Statement of work${call.company.name ? ` for ${call.company.name}` : ""}` }, cx.origin, cx.nowMs).catch(() => {});
  }
  return { id, via };
}

export interface CallRunCtx {
  m: Member;
  f: Workflow;
  call: CallCtx;
  run: WfRun;
  keys: WfStepKey[];
  status: Map<WfStepKey, RunStep>;
  put: Put;
  bells: Bell[];
  origin?: string;
  nowMs: number;
}

/**
 * A call workflow's run (lib/workflows/run.ts runOne hands it over): its conditions, then its call
 * steps, then the ready email and bell line. { skip: true }: the call isn't one this workflow
 * builds for (not a sales call): no run is recorded.
 */
export async function runCallFlow(x: CallRunCtx): Promise<{ skip: boolean }> {
  const { m, f, call, run, keys, status, put, bells, nowMs } = x;
  const opts: CallOptions = f.call ?? CALL_DEFAULT;
  const steps = keys.filter((k) => CALL_STEPS.includes(k) && !status.has(k));
  if (opts.sales && (call.ruled === "other" || call.ruled === "client")) return { skip: true };
  if (call.transcript === null) {
    for (const k of steps) put(k, "skipped", `Nothing built: ${call.unread ?? "the transcript wasn't there."}`);
    run.line = oneLineWf(`${run.line} · The transcript wasn't there`, WF_LIMITS.line);
    return { skip: false };
  }
  const r = await call.reading();
  if (opts.sales && !isSalesKind(r.kind)) return { skip: true };
  // Only if we agreed to send ...: nothing of it agreed, nothing built.
  if (opts.agreed.length && !opts.agreed.some((d) => r.agreed.includes(d))) {
    for (const k of steps) put(k, "skipped", "Nothing agreed, nothing built.");
    run.line = oneLineWf(`${run.line} · Nothing agreed, nothing built`, WF_LIMITS.line);
    return { skip: false };
  }
  const s = await loadState();
  const label = call.company.label;
  const built: ("claude" | Deliverable)[] = [];
  const at = new Date(nowMs).toISOString();
  const lines: ReadyItem[] = [];
  const by = r.via === "merlin" ? "Merlin's AI read the call" : "Merlin's rules read the call";
  run.built = {};
  for (const k of steps) {
    const d = deliverableOf(k, r.agreed);
    if (k !== "claude" && opts.agreed.includes(d) && !r.agreed.includes(d)) {
      put(k, "skipped", `Not agreed on the call, so no ${DELIVERABLE_WORDS[d].the}.`);
      continue;
    }
    try {
      if (k === "proposal" || k === "sow") {
        const templateId = await templateFor(s, m, k === "sow" ? null : opts.template, call.transcript, k === "sow");
        const p = await draftProposal(m, { call, templateId, sow: k === "sow", origin: x.origin, nowMs });
        run.built[k] = p.id;
        built.push(d);
        lines.push({ kind: d, label: k === "sow" ? "Statement of work draft" : "Proposal draft", href: `/?p=proposals&pr=${encodeURIComponent(p.id)}` });
        put(k, "done", `${k === "sow" ? "An SOW" : "The proposal"} is a draft in Proposals${call.company.pub ? ", linked to the company" : ""}. ${p.via === "merlin" ? "Merlin's AI wrote it" : "Merlin's rules filled it"} from the call. Nothing is sent.`);
      } else if (k === "followup") {
        const v = s.voice?.[m.id];
        const st = v ? styleOf(v) : null;
        const fu = r.followup ?? followupByRules(r.rules, { me: m.name, to: call.names[0] ?? null, company: call.company.name ?? "your team", voice: st ? { greeting: st.greeting, signoff: st.signoff, name: st.name, contractions: st.contractions, formality: st.formality } : null });
        const id = newId("drf");
        await T.mutate((dd) => {
          const w = wfIn(dd, m.id);
          w.drafts.unshift({ id, wf: f.id, at, company: call.company.name ? call.company.pub ?? "" : "", companyName: call.company.name ?? label, subject: oneLineWf(fu.subject, 160), body: String(fu.body).slice(0, WF_LIMITS.body), kind: "followup" });
          w.drafts = w.drafts.slice(0, WF_LIMITS.drafts);
        });
        run.built.followup = id;
        built.push("followup");
        lines.push({ kind: "followup", label: "Follow-up email", href: "/?p=messages", text: `${fu.subject}\n\n${fu.body}` });
        put(k, "done", "The follow-up email is a draft in Messages, in your voice. It is for you: nothing is sent.");
      } else if (k === "deck") {
        const { proofFor } = await import("../evidence/store");
        const cases = (await proofFor(m.id, call.company.id).catch(() => [])).map((c) => c.title).filter(Boolean);
        const slides = r.deck ?? deckByRules(r.rules, { company: call.company.name ?? "Your client", cases });
        const id = newId("drf");
        const body = slidesText(slides).slice(0, WF_LIMITS.body);
        await T.mutate((dd) => {
          const w = wfIn(dd, m.id);
          w.drafts.unshift({ id, wf: f.id, at, company: call.company.name ? call.company.pub ?? "" : "", companyName: call.company.name ?? label, subject: `Deck outline${call.company.name ? `: ${call.company.name}` : ""}`, body, kind: "deck" });
          w.drafts = w.drafts.slice(0, WF_LIMITS.drafts);
        });
        run.built.deck = id;
        built.push("deck");
        lines.push({ kind: "deck", label: "Deck outline", href: "/?p=messages", text: body });
        put(k, "done", `A deck outline, ${slides.length} slides, is a draft in Messages.`);
      } else if (k === "claude") {
        const id = `cp_${Math.random().toString(36).slice(2, 12)}`;
        const pack: WfPack = {
          id,
          wf: f.id,
          run: run.id,
          at,
          recorder: call.recorder,
          call: call.id,
          deliverable: d,
          company: call.company.pub,
          companyName: call.company.name,
          summary: oneLineWf(r.summary, WF_LIMITS.pack),
          agreed: r.items.map((i) => oneLineWf(i, 200)).slice(0, 8),
          next: r.next.map((i) => oneLineWf(i, 200)).slice(0, 8),
          template: d === "proposal" || d === "sow" ? await templateFor(s, m, d === "sow" ? null : opts.template, call.transcript, d === "sow") : null,
          transcript: opts.transcript,
        };
        const link = claudeLink(claudePrompt({ pack: id, deliverable: d, company: call.company.name, transcript: opts.transcript }));
        await T.mutate((dd) => {
          const w = wfIn(dd, m.id);
          const cut = new Date(nowMs - WF_LIMITS.packDays * DAY).toISOString();
          w.packs = [pack, ...(w.packs ?? []).filter((p) => p.at >= cut)].slice(0, WF_LIMITS.packs);
        });
        run.built.pack = id;
        run.built.claude = link;
        built.push("claude");
        lines.push({ kind: "claude", label: "Open in Claude", href: link, external: true });
        put(k, "done", `Ready for Claude: a prompt and a pack with your template, closest case studies, profile and voice, and the call's summary${opts.transcript ? ", and the transcript when Claude asks" : ", without the transcript"}.`);
      }
    } catch (e) {
      put(k, "skipped", `It didn't go through: ${e instanceof Error && e.message ? oneLineWf(e.message, 140) : "try it again from the call"}.`);
    }
  }
  if (!built.length) return { skip: false };
  run.line = oneLineWf(`${run.line} · ${by}`, WF_LIMITS.line);
  const line = readyLine(built, label);
  const first = lines.find((l) => !l.external) ?? lines[0];
  bells.push({ id: `wf-call:${run.id}`, at, kind: "workflow", line, sub: `${lines.map((l) => l.label).join(", ")} · ${f.name}`, href: first.external ? "/?p=alerts" : first.href, alert: `wf:${f.id}` });
  await readyEmail(m, { line, lines, company: label, flow: f.name, origin: x.origin, nowMs }).catch((e) => console.error("calls: the ready email failed", e instanceof Error ? e.message : "error"));
  return { skip: false };
}

/* ---------- the ready email ---------- */

export interface ReadyItem {
  kind: Deliverable | "claude";
  label: string;
  href: string;
  /** The draft's text, shown in the email (a follow-up email, a deck's outline). */
  text?: string;
  external?: boolean;
}

/** The email to the member: what is ready, each with its link, the follow-up email's and the outline's text. Pure. */
export async function renderReadyEmail(o: { name: string; line: string; lines: (ReadyItem & { url: string })[]; company: string; flow: string; alertsUrl: string; appUrl: string }): Promise<{ subject: string; text: string; html: string }> {
  const { mailShell, mailP, mailH, mailSmall, mailButton, mailCallout, escHtml, mailFootLink } = await import("../email");
  const first = String(o.name ?? "").trim().split(/\s+/)[0] || "there";
  const parts: string[] = [mailH(escHtml(o.line)), mailP(`Hi ${escHtml(first)}, your call with ${escHtml(o.company)} ended and Merlin built what you set it to. These are drafts for you. Nothing was sent to anyone.`)];
  const text: string[] = [o.line, "", `Hi ${first}, your call with ${o.company} ended and Merlin built what you set it to. These are drafts for you. Nothing was sent to anyone.`, ""];
  for (const l of o.lines) {
    if (l.text) {
      parts.push(mailSmall(escHtml(l.label)), mailCallout(escHtml(l.text).replace(/\n/g, "<br>"), "page"));
      text.push(`${l.label}:`, l.text, "");
    }
    parts.push(mailButton(l.url, l.kind === "claude" ? "Open in Claude" : `Open the ${l.label.toLowerCase()}`, "margin:0 0 20px", l.kind === "claude" ? "pine" : "pine"));
    text.push(`${l.kind === "claude" ? "Open in Claude" : `Open the ${l.label.toLowerCase()}`}: ${l.url}`, "");
  }
  parts.push(mailSmall(`From your workflow: ${escHtml(o.flow)}. The transcript was read for this and not kept.`));
  text.push(`From your workflow: ${o.flow}. The transcript was read for this and not kept.`, "", `Change your workflows: ${o.alertsUrl}`);
  const html = mailShell({ title: o.line, preheader: "Drafts for you. Nothing was sent.", body: parts.join(""), footer: [mailFootLink(o.alertsUrl, "Change your workflows"), mailFootLink(o.appUrl, "Merlin")], link: o.appUrl, art: "proposal" });
  return { subject: o.line, text: text.join("\n"), html };
}

async function readyEmail(m: Member, o: { line: string; lines: ReadyItem[]; company: string; flow: string; origin?: string; nowMs: number }): Promise<void> {
  if (!emailEnabled() || !/@/.test(m.email ?? "")) return;
  const s = await loadState();
  const n = await import("../notify/index");
  const base = n.baseOf(s) || (o.origin ?? "").replace(/\/+$/, "");
  if (!base) return;
  const [{ emailLinker }, seed] = await Promise.all([import("../emailIn"), loadSeed()]);
  const linker = emailLinker(seed, s, m.id, base, o.nowMs);
  const mail = await renderReadyEmail({ name: m.name, line: o.line, lines: o.lines.map((l) => ({ ...l, url: l.external ? l.href : linker(l.href) })), company: o.company, flow: o.flow, alertsUrl: linker("/?p=alerts"), appUrl: base });
  await sendEmail(m.email, mail.subject, mail.text, mail.html);
}

/* ---------- what the Workflows tab reads ---------- */

/** The builder's "A call ends": the recorders, the templates, and whether Merlin's AI reads the call. Undefined while off. */
export function callsInfo(s: State, m: Member, nowMs = Date.now()): CallsInfo | undefined {
  if (!callTriggersOn()) return undefined;
  return {
    recorders: Object.values(RECORDERS)
      .filter((r) => r.on())
      .map((r) => ({ key: r.key, name: r.name, connected: r.connected(s, m.id) })),
    templates: templateChoices(s, m.id, false).map((t) => ({ id: t.id, title: t.title, mine: t.mine })),
    ai: aiReadOpen(s, m.id, nowMs),
  };
}

/* ---------- the connector's get_call_pack ---------- */

/**
 * A call's pack for the member's own Claude: the call's summary and what was agreed (as the run
 * kept them), the template's kit (sections and guidance, the rate band, the company as the member
 * sees it, their profile and voice), their closest case studies, and the transcript only when they
 * ticked it, read from the recorder now for this answer alone. Close, as the proposal kit is.
 */
export async function callPack(m: Member, packId: string, nowMs = Date.now()): Promise<Record<string, unknown>> {
  const s = await loadState();
  if (!callTriggersOn()) throw new CallProblem("Calls aren't switched on for Merlin yet.");
  if (!T.closeNow(s, m.id, nowMs)) throw new CallProblem("A call's pack is part of Close, as the proposal kit is.");
  const p = s.workflows?.[m.id]?.packs?.find((x) => x.id === packId);
  if (!p) throw new CallProblem("That pack isn't there anymore. Packs are kept 30 days. Ask the member to open the call's run in Merlin.");
  const seed = await loadSeed();
  const g = T.graph(seed, s);
  const internal = p.company ? [...g.companies.keys()].find((id) => T.pubId(id) === p.company) ?? null : null;
  const [{ proposalKit }, { proofFor }] = await Promise.all([import("../proposals/kit"), import("../evidence/store")]);
  const kit = await proposalKit(m.token, { templateId: p.template, companyId: p.company, companyName: p.companyName ?? "" }).catch(() => null);
  const cases = await proofFor(m.id, internal, nowMs).catch(() => []);
  let transcript: string | null = null;
  let transcriptNote = "The member didn't include the transcript. Use the summary and what was agreed.";
  if (p.transcript) {
    const r = recorderOf(p.recorder);
    try {
      transcript = r ? await readTranscript(r, m, p.call) : null;
      transcriptNote = transcript ? "Read from the member's call recorder for this answer only. Merlin doesn't keep it: paraphrase, never paste it." : "The recorder didn't give the transcript.";
    } catch (e) {
      transcriptNote = e instanceof Error ? e.message : "The recorder didn't give the transcript.";
    }
  }
  return {
    pack_id: p.id,
    deliverable: p.deliverable,
    company: p.companyName ? { id: p.company, name: p.companyName } : p.company ? { id: p.company, name: "A locked company on Merlin (its name is hidden)" } : { id: null, name: "Not on Merlin" },
    call: { summary: p.summary, agreed: p.agreed, next_steps: p.next, recorder: RECORDERS[p.recorder as RecorderKey]?.name ?? p.recorder },
    kit,
    case_studies: cases,
    transcript,
    transcript_note: transcriptNote,
    next:
      p.deliverable === "proposal" || p.deliverable === "sow"
        ? "Write it in the kit's sections, in the member's voice, with the closest case studies where they fit and one price. Leave a {{blank}} for anything the call didn't settle. Save it with create_or_update_proposal (a draft), show the member, and send only through send_proposal_for_signature after they say yes."
        : "Write it in the member's voice from the summary and what was agreed, and show it to the member. Merlin never sends it to the client.",
  };
}
export class CallProblem extends Error {}
