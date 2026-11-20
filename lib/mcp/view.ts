/**
 * The table as one member sees it, for the connector's tools. It is the app's own view
 * (buildView in lib/table.ts, built inside the view queue in lib/viewQueue.ts), so gating, hidden
 * companies and the seat-holder rules are exactly the app's. An admin gets the member's view
 * (asMember), so what Claude says is what members see. A view is kept for a few seconds
 * while the state has not changed, so a model's burst of calls costs one build.
 */
import { buildView, stateVersion, type Member } from "../table";
import type { View } from "../tableTypes";
import { shared } from "../viewQueue";
import { deriveAll, type CoInfo } from "@/app/post/model";

export interface MemberView {
  view: View;
  infos: CoInfo[];
  byId: Map<string, CoInfo>;
  /** Engagement id -> its company's info. */
  bySeat: Map<string, CoInfo>;
  /** Person id -> its company's info. */
  byPerson: Map<string, CoInfo>;
  /**
   * Trial and Pro (Me.crystal "all"): the public ids of the companies in the member's Crystal Ball,
   * each of which opens free (lib/radar crystalCompanyIds; the server checks it again on the unlock). Empty otherwise.
   */
  ball: Set<string>;
}

const KEEP_MS = 15_000;
const kept = new Map<string, { version: number; at: number; mv: MemberView }>();
const flights = new Map<string, { p: Promise<MemberView>; started: number | null }>();

export async function memberView(member: Member): Promise<MemberView> {
  const hit = kept.get(member.id);
  if (hit && hit.version === stateVersion() && Date.now() - hit.at < KEEP_MS) return hit.mv;
  return shared(flights, `mcp:${member.id}`, stateVersion, async () => {
    const version = stateVersion();
    // An admin's connector answers as a member sees the table ("See it as a member" in the app): hidden companies stay hidden.
    const view = await buildView(member.token, { asMember: true });
    const infos = deriveAll(view.companies);
    const byId = new Map<string, CoInfo>();
    const bySeat = new Map<string, CoInfo>();
    const byPerson = new Map<string, CoInfo>();
    for (const i of infos) {
      byId.set(i.c.id, i);
      for (const e of i.engs) bySeat.set(e.id, i);
      for (const { p } of i.people) byPerson.set(p.id, i);
    }
    // Loaded here, so the connector and the radar don't import each other at start.
    const ball = view.me?.crystal === "all" ? await (await import("../radar")).crystalPublicIds(member.token) : new Set<string>();
    const mv = { view, infos, byId, bySeat, byPerson, ball };
    kept.set(member.id, { version, at: Date.now(), mv });
    if (kept.size > 200) kept.delete(kept.keys().next().value!);
    return mv;
  });
}

/** Forget a member's kept view (after they change something, so the next call reads it fresh). */
export const forgetView = (memberId: string) => kept.delete(memberId);
