/**
 * A workflow's steps on the server (lib/workflows/run.ts runs them in order). Each step does what
 * the member would do in the app, through the same code, as that member:
 *   open, dm, draft   the unlocks the app sells (lib/table.ts perform, "unlock" / "unlockMany"), quoted
 *                     first with a dry run, so the estimate is the app's price; a locked company opens
 *                     before who decides or a note, as in the app ("open the company first")
 *   pipe              pipeline.add (a locked company is refused there, as in the app)
 *   way               Your way in (lib/paths/ways.ts routesOf): how many routes, the strongest kind
 *   draft             the move note's template in the member's voice (lib/moveNote.ts draftNote), to nobody
 *                     by name: a draft in Messages, never sent
 *   evidence          Evidence Bank's own save (Close)
 * Nothing here names a locked company, a person, or anyone from the member's Google account.
 */
import { randomBytes } from "node:crypto";
import { ActionError, perform, tableInternals as T, type Member, type Seed, type State } from "../table";
import type { Action } from "../tableTypes";
import { STEPS, type WfStepKey, type WfTrigger, sawOf } from "./types";

type FactRef = { entity: "company" | "engagement" | "contact"; id: string; field: string };
export const newWfId = (p: string) => `${p}_${randomBytes(6).toString("base64url")}`;

/** What the paid steps would unlock, step by step, with why a step has nothing to buy. */
export interface PaidPlan {
  /** In run order: each paid step's own items (the company first, once). */
  per: { key: WfStepKey; items: FactRef[]; note: string | null }[];
  ball: boolean;
}

/** The buyer at a company as the member's own view has them (lib/moves.ts isBuyer): hiring for the seat, decision maker, reported to. */
const BUYER_RANK: Record<string, number> = { "Hiring for the seat": 0, "Decision maker": 1, "Reported to": 2 };
const cellV = (c: unknown): string | null => {
  const x = c as { s?: string; v?: unknown } | undefined;
  return x?.s === "value" && typeof x.v === "string" ? x.v : null;
};

/** The paid steps' unlocks at the company, from the member's own view. */
export async function paidPlan(m: Member, companyPub: string | null, keys: WfStepKey[]): Promise<PaidPlan> {
  const out: PaidPlan = { per: [], ball: false };
  if (!companyPub) {
    for (const k of keys) out.per.push({ key: k, items: [], note: "Nothing to open: this isn't about a company." });
    return out;
  }
  const { memberView, forgetView } = await import("../mcp/view");
  forgetView(m.id);
  const mv = await memberView(m);
  const i = mv.byId.get(companyPub);
  if (!i) {
    for (const k of keys) out.per.push({ key: k, items: [], note: "That company isn't on Merlin anymore." });
    return out;
  }
  out.ball = mv.ball.has(companyPub);
  let companyTaken = !i.c.hidden;
  const company: FactRef = { entity: "company", id: i.c.id, field: "identity" };
  /** Who decides there, as the member's view has them (hiring for the seat first). */
  const buyer = () =>
    i.people
      .filter(({ p }) => {
        const n = p.cells.name as { s?: string } | undefined;
        const rel = cellV(p.cells.relationship);
        return (n?.s === "value" || n?.s === "locked") && rel !== null && rel in BUYER_RANK;
      })
      .sort((a, b) => BUYER_RANK[cellV(a.p.cells.relationship)!] - BUYER_RANK[cellV(b.p.cells.relationship)!])[0];
  let nameTaken = false;
  for (const k of keys) {
    const items: FactRef[] = [];
    if (!companyTaken) {
      items.push(company);
      companyTaken = true;
    }
    let note: string | null = null;
    if (k === "dm") {
      const buyers = i.people
        .filter(({ p }) => {
          const n = p.cells.name as { s?: string } | undefined;
          const rel = cellV(p.cells.relationship);
          return (n?.s === "value" || n?.s === "locked") && rel !== null && rel in BUYER_RANK;
        })
        .sort((a, b) => BUYER_RANK[cellV(a.p.cells.relationship)!] - BUYER_RANK[cellV(b.p.cells.relationship)!]);
      const b = buyers[0];
      if (!b) note = "Nobody who decides is on file there yet.";
      else if ((b.p.cells.name as { s?: string }).s === "locked") items.push({ entity: "contact", id: b.p.id, field: "name" }), (nameTaken = true);
      else note = "Who decides there is open to you already.";
    } else if (k === "email") {
      // Their email: the name and title open first (once), then the email, 1 credit on every plan.
      const b = buyer();
      const em = (b?.p.cells.email as { s?: string } | undefined)?.s;
      if (!b) note = "Nobody who decides is on file there yet.";
      else if (em === "value") note = "Their email is open to you already.";
      else if (em !== "locked") note = "No email on file for who decides there yet.";
      else {
        if (!nameTaken && (b.p.cells.name as { s?: string }).s === "locked") items.push({ entity: "contact", id: b.p.id, field: "name" }), (nameTaken = true);
        items.push({ entity: "contact", id: b.p.id, field: "email" });
      }
    } else if (k === "open" && !items.length) note = "The company is open to you already.";
    out.per.push({ key: k, items, note });
  }
  return out;
}

const unlockAction = (items: FactRef[], ball: boolean): Action =>
  (items.length === 1 ? { type: "unlock", ...items[0], ...(ball ? { from: "crystal" } : {}) } : { type: "unlockMany", items, ...(ball ? { from: "crystal" } : {}) }) as Action;

/**
 * The price of the paid steps, step by step, from dry runs of the app's own unlock (what it would
 * spend; nothing is kept). A step the app refuses (today's unlock limit, too few credits) stops the
 * steps after it: they are left out of the quote, with the app's reason.
 */
export async function quotePaid(m: Member, plan: PaidPlan, origin?: string): Promise<{ total: number; items: FactRef[]; per: Partial<Record<WfStepKey, number>>; refused: Partial<Record<WfStepKey, string>> }> {
  const per: Partial<Record<WfStepKey, number>> = {};
  const refused: Partial<Record<WfStepKey, string>> = {};
  let items: FactRef[] = [];
  let total = 0;
  let stop: string | null = null;
  for (const st of plan.per) {
    if (stop) {
      refused[st.key] = stop;
      continue;
    }
    if (!st.items.length) {
      per[st.key] = 0;
      continue;
    }
    const next = [...items, ...st.items];
    try {
      const q = await perform(m.token, unlockAction(next, plan.ball), origin, { dryRun: true, asMember: true });
      per[st.key] = Math.max(0, (q.spent ?? 0) - total);
      total = Math.max(0, q.spent ?? 0);
      items = next;
    } catch (e) {
      if (!(e instanceof ActionError)) throw e;
      stop = e.message;
      refused[st.key] = e.message;
    }
  }
  return { total, items, per, refused };
}

/** Spend the quoted unlocks, as the member, each ledger line marked with the workflow's name. Returns what it spent. */
export async function spendPaid(m: Member, items: FactRef[], ball: boolean, workflow: string, origin?: string): Promise<number> {
  if (!items.length) return 0;
  const r = await perform(m.token, unlockAction(items, ball), origin, { asMember: true, workflow });
  const { forgetView } = await import("../mcp/view");
  forgetView(m.id);
  return r.spent ?? 0;
}

/** The company is open to the member now (read fresh). */
export async function companyOpen(m: Member, companyId: string): Promise<{ open: boolean; name: string | null; seed: Seed; s: State }> {
  const { loadSeed, loadState } = await import("../table");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  const hidden = T.identityHidden(g, s, T.memberIndex(seed, s), T.tracksOf(seed, s), m, companyId);
  return { open: !hidden, name: hidden ? null : g.companies.get(companyId)?.name || null, seed, s };
}

/** Add to my pipeline: the app's pipeline.add. */
export async function stepPipe(m: Member, companyPub: string): Promise<{ ok: boolean; note: string }> {
  try {
    const r = await perform(m.token, { type: "pipeline.add", companyIds: [companyPub] } as Action);
    return { ok: true, note: r.message || "Added to your pipeline at To reach out." };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, note: e.message };
    throw e;
  }
}

/** Find my way in: how many routes Merlin sees, and the strongest one's kind. Never a name. */
export async function stepWay(seed: Seed, s: State, m: Member, companyId: string, nowMs: number): Promise<{ ok: boolean; note: string }> {
  const { routesOf } = await import("../paths/ways");
  // Through people only: writing to who decides yourself is a cold note, never called a way in or a good path.
  const all = routesOf(seed, s, m, companyId, nowMs);
  const routes = all.filter((r) => r.view.kind !== DIRECT);
  const direct = routes.length !== all.length;
  if (!routes.length) return { ok: true, note: direct ? "No warm way in on file yet. You can write to who decides yourself." : "No way in on file yet. Warm paths fills in as your sources grow." };
  const best = routes[0].view;
  return { ok: true, note: `${routes.length === 1 ? "1 way in" : `${routes.length} ways in`} through people you know. The strongest: ${best.kind.charAt(0).toLowerCase()}${best.kind.slice(1)}, ${best.way.toLowerCase()}.` };
}

/** The route Warm Paths offers when nobody stands between: a cold note from the member. */
const DIRECT = "Write to them yourself";

/** Who decides at the company, by name, when the member can see them: their name for the note's greeting. Never a locked name. */
export async function deciderName(m: Member, companyPub: string | null): Promise<string | null> {
  if (!companyPub) return null;
  const { memberView } = await import("../mcp/view");
  const i = (await memberView(m)).byId.get(companyPub);
  if (!i || i.c.hidden) return null;
  const b = i.people
    .filter(({ p }) => (p.cells.name as { s?: string } | undefined)?.s === "value" && (cellV(p.cells.relationship) ?? "") in BUYER_RANK)
    .sort((a, b2) => BUYER_RANK[cellV(a.p.cells.relationship)!] - BUYER_RANK[cellV(b2.p.cells.relationship)!])[0];
  return b ? cellV(b.p.cells.name) : null;
}

/** Draft a note: the move note's template in the member's voice, to who decides when the member can see them (else nobody by name). Only for a company the member can see. */
export async function stepDraft(s: State, m: Member, trigger: WfTrigger, company: string, fn: string | null, to: string | null = null): Promise<{ subject: string; body: string }> {
  const { draftNote } = await import("../moveNote");
  const { functionFor } = await import("../notify/index");
  const myFn = functionFor(s, m);
  const f = myFn && myFn !== "Other" && myFn !== "Executive" ? myFn : null;
  const first = T.firstName(m.name);
  const d = draftNote(
    {
      kind: "buyer",
      company,
      to: to ? { name: to, email: null, from: null } : null,
      since: null,
      saw: sawOf(trigger, company, fn),
      me: { first, name: m.name, as: f ? `a fractional ${f} leader` : "a fractional leader", fn: f, clients: null },
      seat: null,
      role: null,
      link: null,
    },
    s.voice?.[m.id] ?? null,
  );
  return { subject: d.subject, body: d.body };
}

/** Start an Evidence Bank draft (Close): an empty case to fill, the client hidden. */
export async function stepEvidence(m: Member, title: string, origin?: string): Promise<{ ok: boolean; note: string }> {
  try {
    const { saveCase } = await import("../evidence/store");
    await saveCase(m.token, { title: title.slice(0, 120) }, { origin });
    return { ok: true, note: "A draft case is in Evidence Bank. The client's name stays hidden until you name it." };
  } catch (e) {
    return { ok: false, note: e instanceof Error && e.message ? e.message : "Evidence Bank didn't take it." };
  }
}

export const isPaid = (k: WfStepKey) => STEPS[k].paid;
