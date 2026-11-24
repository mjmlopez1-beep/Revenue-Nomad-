/**
 * The thin client for Evidence Bank's route (app/api/evidence/route.ts). Every call is a POST
 * { op, ... } to /api/evidence. The page asks with reveal: it is the member's own, so the client's
 * name shows there (and only there).
 *
 *   bank()                 the member's case studies, newest first, and the tag catalogue
 *   list()                 the case studies only (Your seats' column reads them)
 *   save(input)            a new case study (no id) or a change to one; returns it. A save on this
 *                          page is the member's check: a case their agent saved loses "review"
 *   remove(id)             deletes one of theirs
 *   draftFromSeat(seatId)  the draft for a seat of theirs: the one there is, or a new one with the
 *                          company's facts, the role and the dates from the seat
 *   card(id, on)           shows it on the member's card in Fractionals, or not
 *   agents()               the member's connected agents (Agent access, GET /api/agent)
 *
 * Nothing here spends a credit: Evidence Bank is part of Close, and none of its actions cost.
 * Errors come back as { error } in plain words, never thrown.
 */
import { errorText } from "../../ui/shared";
import { refreshEvidence } from "../useClosest";
import type { Study, StudyInput, TagCatalogue } from "./types";

const URL = "/api/evidence";
const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";

export type Fail = { error: string; upgrade?: string };
export const failed = (x: unknown): x is Fail => !!x && typeof x === "object" && typeof (x as Fail).error === "string";

type J = Record<string, unknown>;
async function post(op: string, body: J = {}): Promise<J | Fail> {
  try {
    const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ op, ...body }) });
    const j = (await r.json().catch(() => ({}))) as J;
    if (!r.ok) return { error: errorText(r.status, j.error, "That didn't go through. Try again."), ...(typeof j.upgrade === "string" ? { upgrade: j.upgrade } : {}) };
    return j;
  } catch {
    return { error: NETWORK };
  }
}

const isStudy = (x: unknown): x is Study => !!x && typeof x === "object" && typeof (x as Study).id === "string" && !!(x as Study).client && !!(x as Study).answers;

export interface Bank {
  cases: Study[];
  tags: TagCatalogue;
  limit: number;
}

/** The member's case studies with their clients named, and the tag catalogue. */
export async function bank(): Promise<Bank | Fail> {
  const j = await post("list", { reveal: true });
  if (failed(j)) return j;
  const t = (j.tags && typeof j.tags === "object" ? j.tags : {}) as { categories?: unknown; tags?: unknown };
  const categories = Array.isArray(t.categories) ? t.categories.filter((x): x is string => typeof x === "string") : [];
  const tags = (Array.isArray(t.tags) ? t.tags : []).filter((x): x is { name: string; category: string } => !!x && typeof x === "object" && typeof (x as J).name === "string" && typeof (x as J).category === "string");
  return { cases: (Array.isArray(j.cases) ? j.cases : []).filter(isStudy), tags: { categories, tags }, limit: typeof j.limit === "number" ? j.limit : 50 };
}

/** The case studies only. */
export async function list(): Promise<Study[] | Fail> {
  const b = await bank();
  return failed(b) ? b : b.cases;
}

/** Save: the route's own fields. The case study comes back as the member's page reads it. */
export async function save(input: StudyInput): Promise<Study | Fail> {
  const j = await post("save", { ...input });
  if (failed(j)) return j;
  if (!isStudy(j)) return { error: "That didn't save. Try again." };
  refreshEvidence();
  return j;
}

export async function remove(id: string): Promise<{ ok: true } | Fail> {
  const j = await post("remove", { id });
  if (failed(j)) return j;
  refreshEvidence();
  return { ok: true };
}

export async function draftFromSeat(seatId: string): Promise<Study | Fail> {
  const j = await post("draftFromSeat", { seatId });
  if (failed(j)) return j;
  return isStudy(j) ? j : { error: "Merlin couldn't start a case study from that seat. Try again." };
}

/** Show a ready case study on the member's card, or take it off. */
export async function card(id: string, on: boolean): Promise<{ ok: true } | Fail> {
  const j = await post("card", { id, on });
  return failed(j) ? j : { ok: true };
}

/** The member's connected agents, by the name each registered (Agent access). */
export async function agents(): Promise<{ name: string }[] | Fail> {
  try {
    const r = await fetch("/api/agent", { cache: "no-store", headers: { accept: "application/json" } });
    const j = (await r.json().catch(() => ({}))) as { view?: { apps?: { name?: unknown }[] }; error?: unknown };
    if (!r.ok) return { error: errorText(r.status, j.error, "Your agents didn't load. Try again.") };
    return (j.view?.apps ?? []).filter((a) => typeof a?.name === "string").map((a) => ({ name: String(a.name) }));
  } catch {
    return { error: NETWORK };
  }
}

/**
 * Draft on seat add: a seat that arrives while the member is on Your seats (a confirmed guess, an
 * Add) starts its draft case study, for Close members only. Quiet: a failure here costs nothing,
 * and the seat's "Finish its case study" starts the same draft again when pressed. Resolves with
 * the seats it asked for, once their drafts are in.
 */
const asked = new Set<string>();
export async function draftNewSeats(before: ReadonlySet<string>, now: readonly string[], close: boolean): Promise<string[]> {
  if (!close) return [];
  const fresh = now.filter((id) => !before.has(id) && !asked.has(id));
  for (const id of fresh) asked.add(id);
  await Promise.all(fresh.map((id) => draftFromSeat(id)));
  if (fresh.length) refreshEvidence();
  return fresh;
}
