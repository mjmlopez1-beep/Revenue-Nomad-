/**
 * "Bring in your LinkedIn data export", on the server (lib/linkedin/types.ts says what is kept and
 * why). It takes only the derived payload the member's browser built (lib/linkedin/read.ts), checks
 * every field's shape and size (cleanPayload: anything else refuses the whole of it), and keeps it
 * for the member alone in State.paths[memberId].lix, beside their connections file:
 *
 *   know     the Connections.csv (read again with lib/paths/csv.ts parseConnections, kept as the
 *            connections file is) and pending invitations as weaker ties placed by profile link only;
 *   warm     per person they message: counts each way, first and last day (lib/paths contactsOf
 *            grades it with Your network's warmth rules);
 *   vouch    recommendations matched to their own connections by exact name AND company (never a
 *            name alone), endorsements by profile link: strong-tie flags;
 *   proof    the text of recommendations received, by first name and company, only with the tick
 *            and only on Close (Evidence Bank);
 *   seats    their own roles as seats to confirm (nothing is added: Confirm is the existing Add);
 *   follows  companies on Merlin matched by exact name, to follow (the existing follow action);
 *   voice    style conclusions only, through lib/voice.ts cleanVoice, saved as Settings, Voice saves;
 *   skills   the function and title, each only where the profile has none.
 *
 * Remove (removeExport) deletes all of it, with the connections it brought; closing the account
 * deletes State.paths with the rest (lib/table.ts purgeMember). Nothing here is shown to another
 * member, used for anyone else's results or sent through the connector by name.
 */
import { createHash, randomBytes } from "node:crypto";
import { ActionError, tableInternals as T, type State } from "../table";
import { FUNCTIONS, functionOf } from "../tableFields";
import { cleanVoice, VoiceProblem, type VoiceProfile } from "../voice";
import { parseConnections, profileSlug } from "../paths/csv";
import { IMPORTS_DAILY, type MemberPaths, type PathsState } from "../paths/types";
import { carryOver, factsOf, pathsOn, who } from "../paths";
import { directoryOf } from "../paths/world";
import { forgetSource } from "../paths/plan";
import { matchOrg } from "../google/compute";
import { ownSeatTest } from "../google/odds";
import { READS } from "./files";
import { kindOfTitle } from "./read";
import { vouchKey } from "./warmth";
import {
  LIX_LIMITS, USE_KEYS,
  type EndorseRow, type ExportAnswer, type ExportPayload, type ExportStore, type InviteRow, type PositionRow, type ProofRec, type RecRow, type SeatOffer, type UseKey, type WarmRow,
} from "./types";

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again.";
const OFF = "Bringing in your export isn't on for Merlin yet.";
const REFUSED = "Merlin takes only what your browser worked out from the export, in its own shape. Nothing was saved. Pick the export again.";

type WithPaths = State & { paths?: PathsState; voice?: Record<string, VoiceProfile> };
const allPaths = (s: State) => ((s as WithPaths).paths ??= {});
const importsToday = (p: MemberPaths | undefined, nowMs: number) => (p?.imports ?? []).filter((at) => nowMs - Date.parse(at) < DAY).length;

/* ---------- the payload, checked ---------- */

class Bad extends Error {}
const bad = (why: string): never => {
  throw new Bad(why);
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** Only these keys, each present one of the right kind. */
function only(x: unknown, keys: string[], need: string[] = keys): Record<string, unknown> {
  if (!isObj(x)) return bad("not an object");
  for (const k of Object.keys(x)) if (!keys.includes(k)) bad(`unknown field ${k.slice(0, 40)}`);
  for (const k of need) if (x[k] === undefined) bad(`missing ${k}`);
  return x;
}
const text = (v: unknown, max: number, field: string): string => {
  if (typeof v !== "string") return bad(`${field} is not text`);
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) bad(`${field} is empty`);
  if (t.length > max) bad(`${field} is too long`);
  return t;
};
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const day = (v: unknown, field: string): string => (typeof v === "string" && DAY_RE.test(v) ? v : bad(`${field} is not a day`));
const month = (v: unknown, field: string): string => (typeof v === "string" && MONTH_RE.test(v) ? v : bad(`${field} is not a month`));
/** A profile link's slug as the browser read it (lib/paths/csv.ts profileSlug): never a Sales Navigator id. */
const slug = (v: unknown, field: string): string => {
  if (typeof v !== "string" || v.length > 100) return bad(`${field} is not a profile link`);
  const s = profileSlug(`linkedin.com/in/${v}`);
  return s && s === v ? s : bad(`${field} is not a profile link`);
};
const count = (v: unknown, field: string): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000 ? (v as number) : bad(`${field} is not a count`));
const list = <T>(v: unknown, max: number, field: string, each: (x: unknown) => T): T[] => {
  if (!Array.isArray(v)) return bad(`${field} is not a list`);
  if (v.length > max) bad(`${field} has more than ${max}`);
  return v.map(each);
};

/** The payload as it is kept: every field in its shape and size, or Bad (nothing is saved). */
export function cleanPayload(raw: unknown): ExportPayload {
  const x = only(raw, ["v", "uses", "files", "connections", "invites", "positions", "warm", "recs", "endorsements", "follows", "voice", "skills"], ["v", "uses", "files"]);
  if (x.v !== 1) bad("not this version");
  const uses = list(x.uses, USE_KEYS.length, "uses", (u) => (USE_KEYS.includes(u as UseKey) ? (u as UseKey) : bad("unknown use")));
  const known = new Set<string>(READS.map((r) => r.key));
  const files = list(x.files, READS.length, "files", (f) => (typeof f === "string" && known.has(f) ? f : bad("unknown file")));
  const has = (u: UseKey) => uses.includes(u);
  const out: ExportPayload = { v: 1, uses: [...new Set(uses)], files: [...new Set(files)] };
  if (x.connections !== undefined) {
    if (!has("know")) bad("connections without Who you know");
    if (typeof x.connections !== "string" || !x.connections || x.connections.length > 8 * 1024 * 1024) bad("connections is not the file");
    out.connections = x.connections as string;
  }
  if (x.invites !== undefined) {
    if (!has("know")) bad("invitations without Who you know");
    out.invites = list(x.invites, LIX_LIMITS.invites, "invites", (r): InviteRow => {
      const o = only(r, ["u", "n", "out", "d"], ["u", "n", "out"]);
      if (typeof o.out !== "boolean") bad("out is not true or false");
      return { u: slug(o.u, "u"), n: text(o.n, 120, "n"), out: o.out as boolean, ...(o.d !== undefined ? { d: day(o.d, "d") } : {}) };
    });
  }
  if (x.positions !== undefined) {
    if (!has("seats")) bad("positions without Your seats");
    out.positions = list(x.positions, LIX_LIMITS.positions, "positions", (r): PositionRow => {
      const o = only(r, ["c", "t", "s", "e"], ["c", "t"]);
      return { c: text(o.c, 120, "c"), t: text(o.t, 120, "t"), ...(o.s !== undefined ? { s: month(o.s, "s") } : {}), ...(o.e !== undefined ? { e: month(o.e, "e") } : {}) };
    });
  }
  if (x.warm !== undefined) {
    if (!has("warm")) bad("warmth without How warm");
    out.warm = list(x.warm, LIX_LIMITS.warm, "warm", (r): WarmRow => {
      const o = only(r, ["profileSlug", "sent", "received", "first", "last"]);
      const w = { profileSlug: slug(o.profileSlug, "profileSlug"), sent: count(o.sent, "sent"), received: count(o.received, "received"), first: day(o.first, "first"), last: day(o.last, "last") };
      if (w.first > w.last || w.sent + w.received === 0) bad("warmth doesn't add up");
      return w;
    });
  }
  if (x.recs !== undefined) {
    if (!has("vouch") && !has("proof")) bad("recommendations without a use");
    out.recs = list(x.recs, LIX_LIMITS.recs * 2, "recs", (r): RecRow => {
      const o = only(r, ["f", "l", "c", "k", "d", "text"], ["f", "l", "c", "k"]);
      if (o.k !== "in" && o.k !== "out") bad("k is not in or out");
      if (o.text !== undefined && (!has("proof") || o.k !== "in")) bad("text without the proof tick");
      const c = typeof o.c === "string" ? o.c.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) : bad("c is not text");
      return { f: text(o.f, 60, "f"), l: text(o.l, 80, "l"), c, k: o.k as "in" | "out", ...(o.d !== undefined ? { d: day(o.d, "d") } : {}), ...(o.text !== undefined ? { text: text(o.text, LIX_LIMITS.proofChars, "text") } : {}) };
    });
  }
  if (x.endorsements !== undefined) {
    if (!has("vouch")) bad("endorsements without Who vouched for you");
    out.endorsements = list(x.endorsements, LIX_LIMITS.endorsements * 2, "endorsements", (r): EndorseRow => {
      const o = only(r, ["u", "k"]);
      if (o.k !== "in" && o.k !== "out") bad("k is not in or out");
      return { u: slug(o.u, "u"), k: o.k as "in" | "out" };
    });
  }
  if (x.follows !== undefined) {
    if (!has("follows")) bad("follows without Companies you follow");
    out.follows = list(x.follows, LIX_LIMITS.follows, "follows", (f) => text(f, 120, "follow"));
  }
  if (x.voice !== undefined) {
    if (!has("voice")) bad("a voice without the voice tick");
    try {
      out.voice = cleanVoice(x.voice);
    } catch (e) {
      if (e instanceof VoiceProblem) bad("the voice isn't style conclusions");
      throw e;
    }
  }
  if (x.skills !== undefined) {
    if (!has("skills")) bad("skills without the Skills tick");
    const o = only(x.skills, ["fn", "title"], []);
    out.skills = {
      ...(o.fn !== undefined ? { fn: typeof o.fn === "string" && FUNCTIONS.includes(o.fn) && o.fn !== "Other" ? o.fn : bad("fn is not a function") } : {}),
      ...(o.title !== undefined ? { title: text(o.title, 80, "title") } : {}),
    };
  }
  return out;
}

/* ---------- the import ---------- */

const lc = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
const offerKey = (p: PositionRow) => createHash("sha256").update(`${lc(p.c)}|${lc(p.t)}|${p.s ?? ""}`).digest("base64url").slice(0, 16);

/**
 * POST /api/paths/export { op: "import", payload }: what the member ticked, kept for them alone. A
 * new export replaces the last one (a seat they confirmed or said was not a seat stays decided).
 * It counts as one upload in the files' daily limit (IMPORTS_DAILY).
 */
export async function importExport(token: string | null, raw: unknown, nowMs = Date.now()): Promise<{ answer: ExportAnswer; message: string }> {
  if (!pathsOn()) throw new ActionError(OFF);
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  let pay: ExportPayload;
  try {
    pay = cleanPayload(raw);
  } catch (e) {
    if (e instanceof Bad) throw new ActionError(REFUSED);
    throw e;
  }
  const limit = `That's ${IMPORTS_DAILY} uploads today, the most in a day. Try again tomorrow.`;
  if (importsToday(allPaths(w.s)[w.m.id], nowMs) >= IMPORTS_DAILY) throw new ActionError(limit);
  const conn = pay.connections ? parseConnections(pay.connections) : null;
  if (conn && !conn.ok) throw new ActionError("Connections.csv in the export didn't read as LinkedIn's connections file. Nothing was saved.");
  const close = T.closeNow(w.s, w.m.id, nowMs);
  const at = new Date(nowMs).toISOString();
  const said: string[] = [];
  let c: ExportStore["counts"] = {};
  await T.mutate((s) => {
    const p = (allPaths(s)[w.m.id] ??= {});
    if (importsToday(p, nowMs) >= IMPORTS_DAILY) throw new ActionError(limit);
    p.imports = [...(p.imports ?? []).filter((x) => nowMs - Date.parse(x) < DAY), at];
    const was = p.lix;
    const store: ExportStore = { at, uses: pay.uses, files: pay.files, counts: {} };
    // Who you know: the connections file, kept as the connections file is (lib/paths/index.ts importConnections).
    if (conn && conn.ok) {
      const rows = conn.namesOnly && p.linkedin?.rows.length ? carryOver(conn.rows, p.linkedin.rows) : conn.rows;
      const keptNames = !!conn.namesOnly && rows.every((x) => !x.c && !x.e);
      p.linkedin = { at, rows, skipped: conn.skipped, ...(keptNames ? { namesOnly: true as const } : {}) };
      store.connections = true;
      store.counts.connections = rows.length;
    } else if (was?.connections && p.linkedin) store.connections = true;
    const conns = p.linkedin?.rows ?? [];
    const connSlugs = new Set(conns.map((r) => r.u).filter(Boolean) as string[]);
    // Pending invitations: weaker ties, by profile link; one already a connection is a connection.
    if (pay.invites?.length) {
      store.invites = pay.invites.filter((x) => !connSlugs.has(x.u));
      store.counts.invites = store.invites.length;
    }
    const tieSlugs = new Set([...connSlugs, ...(store.invites ?? []).map((x) => x.u)]);
    if (pay.warm?.length) {
      store.warm = pay.warm;
      store.counts.warm = pay.warm.length;
    }
    // Who vouched: recommendations by exact name AND company to one connection (never a name alone), endorsements by link.
    if (pay.uses.includes("vouch")) {
      const vouch: Record<string, string> = {};
      const flag = (k: string, f: string) => {
        if (!(vouch[k] ?? "").includes(f)) vouch[k] = (vouch[k] ?? "") + f;
      };
      for (const r of pay.recs ?? []) {
        if (!r.c) continue;
        const hits = conns.filter((c) => !!c.c && lc(c.f) === lc(r.f) && lc(c.l) === lc(r.l) && lc(c.c) === lc(r.c));
        if (hits.length !== 1) continue;
        flag(vouchKey(hits[0]), r.k === "in" ? "r" : "R");
      }
      for (const e of pay.endorsements ?? []) if (tieSlugs.has(e.u)) flag(e.u, e.k === "in" ? "e" : "E");
      if (Object.keys(vouch).length) store.vouch = vouch;
      store.counts.vouch = Object.keys(vouch).length;
    }
    // Recommendations as proof (Evidence Bank, Close): first name and company only, with the tick.
    if (pay.uses.includes("proof")) {
      if (!close) said.push("Recommendations as proof are part of Close, so their text wasn't kept.");
      else {
        const proof: ProofRec[] = (pay.recs ?? [])
          .filter((r) => r.k === "in" && r.text)
          .slice(0, LIX_LIMITS.proof)
          .map((r) => ({ id: randomBytes(6).toString("base64url"), first: r.f, company: r.c, text: r.text!, ...(r.d ? { d: r.d } : {}) }));
        if (proof.length) store.proof = proof;
        store.counts.proof = proof.length;
      }
    }
    // Your seats: offers to confirm, the fractional-looking ones first. Decisions on the same role stay.
    if (pay.positions?.length) {
      const done = new Map((was?.seats ?? []).filter((o) => o.done).map((o) => [o.k, o.done!]));
      const offers: SeatOffer[] = pay.positions.map((x) => {
        const k = offerKey(x);
        const d = done.get(k);
        return { k, c: x.c, t: x.t, ...(x.s ? { s: x.s } : {}), ...(x.e ? { e: x.e } : {}), kind: kindOfTitle(x.t), fn: functionOf(x.t), ...(d ? { done: d } : {}) };
      });
      offers.sort((a, b) => Number(!a.kind) - Number(!b.kind) || (b.s ?? "").localeCompare(a.s ?? ""));
      store.seats = offers;
      store.counts.positions = offers.length;
    }
    // Companies you follow: matched by exact name to companies on Merlin. Following is the member's own tick.
    if (pay.follows?.length) {
      const dir = directoryOf(w.seed, s);
      const ids = [...new Set(pay.follows.map((n) => matchOrg(dir, n)).filter((x): x is string => !!x))];
      store.follow = ids;
      store.counts.follows = ids.length;
    }
    // Your writing voice: style conclusions only, saved as Settings, Voice saves them.
    if (pay.voice) {
      (s as WithPaths).voice ??= {};
      (s as WithPaths).voice![w.m.id] = { ...pay.voice, at, by: "you" };
      store.counts.voice = 1;
    }
    // Skills: the function and title, each only where the profile has none.
    if (pay.skills) {
      const prof = (s.profiles[w.m.id] ??= {});
      const filled: ("function" | "title")[] = [];
      if (pay.skills.fn && !prof.function) (prof.function = pay.skills.fn), filled.push("function");
      if (pay.skills.title && !prof.title) (prof.title = pay.skills.title), filled.push("title");
      if (filled.length) store.filled = filled;
      store.counts.skills = filled.length;
    }
    p.lix = store;
    c = store.counts;
  });
  const answer = (await exportView(token, nowMs))!;
  const parts = [
    c.connections ? `${c.connections.toLocaleString("en-US")} connections` : "",
    c.invites ? `${c.invites.toLocaleString("en-US")} invited` : "",
    c.warm ? `warmth for ${c.warm.toLocaleString("en-US")} people` : "",
    c.positions ? `${c.positions} roles to confirm as seats` : "",
    c.follows ? `${c.follows} companies to follow` : "",
  ].filter(Boolean);
  return { answer, message: [`Brought in ${parts.length ? parts.join(", ") : "your export"}. Only you see it.`, ...said].join(" ") };
}

/**
 * Remove: everything the export brought in goes (the connections it brought, the invitations,
 * warmth, vouches, roles, matches and proof), with every plan through a connection from it.
 * What the member did with it stays theirs: seats they confirmed, companies they followed, the
 * voice and the profile they kept (each changed where it lives).
 */
export async function removeExport(token: string | null): Promise<ExportAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const all = allPaths(s);
    const p = all[w.m.id];
    if (!p?.lix) return;
    if (p.lix.connections) {
      forgetSource(s.routes, w.m.id, "linkedin");
      delete p.linkedin;
    }
    delete p.lix;
    if (!p.linkedin && !p.csv && !(p.imports ?? []).length && !(p.away ?? []).length) delete all[w.m.id];
  });
  return (await exportView(token))!;
}

/** Confirm (after the member's own Add went through) or Not a seat, on one offered role. */
export async function seatOfferDone(token: string | null, key: unknown, what: unknown): Promise<ExportAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  const k = typeof key === "string" ? key.slice(0, 40) : "";
  if (what !== "added" && what !== "no") throw new ActionError("That didn't go through. Refresh the page and try again.");
  await T.mutate((s) => {
    const o = allPaths(s)[w.m.id]?.lix?.seats?.find((x) => x.k === k);
    if (!o) throw new ActionError("That role isn't in your export any more. Refresh the page.");
    o.done = what;
  });
  return (await exportView(token))!;
}

/** Remove one recommendation kept as proof. */
export async function removeProof(token: string | null, id: unknown): Promise<ExportAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const x = allPaths(s)[w.m.id]?.lix;
    if (!x?.proof) return;
    x.proof = x.proof.filter((r) => r.id !== id);
    x.counts.proof = x.proof.length;
    if (!x.proof.length) delete x.proof;
  });
  return (await exportView(token))!;
}

/* ---------- what the app gets ---------- */

/** GET /api/paths/export: what came in, the roles to confirm, the companies to follow, and the proof. The member's own only. */
export async function exportView(token: string | null, nowMs = Date.now()): Promise<ExportAnswer | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const { seed, s, m } = w;
  const p = allPaths(s)[m.id];
  const x = p?.lix;
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const visible = (id: string) => !T.identityHidden(g, s, idx, tracks, m, id);
  const dir = directoryOf(seed, s);
  const own = ownSeatTest(seed, s, m);
  const waiting = new Set((s.pendingSeats ?? []).map((q) => q.companyId));
  const prof = s.profiles[m.id] ?? {};
  const thisMonth = new Date(nowMs).toISOString().slice(0, 7);
  const seats = (x?.seats ?? [])
    .filter((o) => !o.done)
    .map((o) => {
      const id = matchOrg(dir, o.c);
      const at = id ? [...g.engagements.values()].filter((e) => e.companyId === id) : [];
      // A seat already theirs there: nothing to confirm.
      if (at.some(own)) return null;
      const active = !o.e || o.e >= thisMonth;
      const fields: Record<string, string> = { operator: m.name, ...(o.fn ? { function: o.fn } : {}), role: o.t, ...(o.s ? { start: o.s } : {}), ...(active ? { status: "Active" } : o.e ? { end: o.e } : {}) };
      const hit = id ? T.claimableSeats(at, s, m, fields)[0] : undefined;
      return { key: o.k, company: o.c, companyId: id ? T.pubId(id) : null, title: o.t, from: o.s ?? null, to: active ? null : (o.e ?? null), active, kind: o.kind, fn: o.fn, claim: hit ? T.pubId(hit.id) : null, waits: !!id && waiting.has(id) };
    })
    .filter((v): v is NonNullable<typeof v> => !!v);
  const following = new Set(s.follows?.[m.id] ?? []);
  const follows = (x?.follow ?? [])
    .filter((id) => g.companies.has(id))
    .map((id) => ({ id: T.pubId(id), name: visible(id) ? (g.companies.get(id)?.name ?? null) : null, facts: factsOf(seed, s, id), following: following.has(id) }));
  return {
    on: true,
    info: x ? { at: x.at, uses: x.uses, files: x.files, counts: x.counts } : null,
    seats,
    follows,
    proof: (x?.proof ?? []).map((r) => ({ id: r.id, first: r.first, company: r.company, text: r.text, d: r.d ?? null })),
    proofAllowed: T.closeNow(s, m.id, nowMs),
    hasVoice: !!(s as WithPaths).voice?.[m.id],
    emptyProfile: { function: !prof.function, title: !prof.title },
    importsLeft: Math.max(0, IMPORTS_DAILY - importsToday(p, nowMs)),
  };
}
