/**
 * Who Workflows v2 applies to (RN_WORKFLOWS_V2):
 *
 *   off     the default (unset included): nobody. Today's runner runs every workflow, the API is a 404.
 *   on      everyone (1, on, true, yes): the graph runner takes every event.
 *   optin   only members with the new design on (lib/ui3.ts ui3Me: RN_UI3 on, or optin with an
 *           admin's own choice on their profile). Everyone else keeps today's runner exactly.
 *
 * Under optin a member who switches the new design off keeps every v2 workflow they saved: it is
 * paused, never deleted. Their saved graphs don't run (today's flow of the same id doesn't take its
 * place either), a run waiting on them holds, and the API answers 404. Switching the new design
 * back on carries on where it was.
 *
 * Pure apart from reading the environment: no I/O, relative imports only.
 */
import { ui2Me } from "../ui2";
import { ui3Me, type Ui3Prof } from "../ui3";
import { WFV2_ENV } from "./graph";

export type V2Mode = "off" | "optin" | "on";
export function v2Mode(): V2Mode {
  const v = (typeof process !== "undefined" ? process.env[WFV2_ENV] ?? "" : "").trim().toLowerCase();
  return /^(1|on|true|yes)$/.test(v) ? "on" : v === "optin" ? "optin" : "off";
}
/** Any member can be on v2 (the API and the scheduler's v2 work run at all). */
export const v2Any = (mode: V2Mode = v2Mode()) => mode !== "off";

const adminEmail = (email: string | null | undefined) => {
  const admins = (process.env.RN_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
};

/** Is v2 on for this member: their profile (the new design's switch) and email (an admin, for RN_UI3=optin). */
export function v2For(prof: (Ui3Prof & { ui2?: boolean; stripsOff?: string[] }) | undefined, email: string | null | undefined, mode: V2Mode = v2Mode()): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  const p = prof ?? {};
  return ui3Me(p, { admin: adminEmail(email), ui2: !!ui2Me(p).ui2 }).ui3 === true;
}

/**
 * Which runner a member's events go to: "v2" (the graph runner), "paused" (optin, the new design
 * off, with v2 workflows saved: today's runner, and those workflows held), or "today" (exactly as before).
 */
export type Runner = "v2" | "paused" | "today";
export function runnerOf(isV2: boolean, w: { graphs?: unknown[] } | undefined, mode: V2Mode = v2Mode()): Runner {
  if (isV2) return "v2";
  return mode === "optin" && (w?.graphs?.length ?? 0) > 0 ? "paused" : "today";
}

/** Emails by member id from the seed and the members who joined (an admin, for RN_UI3=optin). */
export const emailsFrom = (seed: { members: { id: string; email?: string }[] } | null | undefined, s: { members?: { id: string; email?: string }[] }) => {
  const m = new Map<string, string>();
  for (const x of [...(seed?.members ?? []), ...(s.members ?? [])]) if (x.email) m.set(x.id, x.email);
  return (id: string) => m.get(id) ?? null;
};

/** v2For by member id, from the state's profiles and the member index's emails. */
export function v2Of(s: { profiles?: Record<string, unknown> }, emailOf: (id: string) => string | null | undefined, mode: V2Mode = v2Mode()): (id: string) => boolean {
  if (mode !== "optin") return () => mode === "on";
  const memo = new Map<string, boolean>();
  return (id) => {
    let v = memo.get(id);
    if (v === undefined) memo.set(id, (v = v2For(s.profiles?.[id] as Ui3Prof | undefined, emailOf(id), mode)));
    return v;
  };
}
