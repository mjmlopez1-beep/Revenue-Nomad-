/**
 * Links in the emails that bring a member back (Crystal Ball, lib/radar; the weekly email,
 * lib/digest.ts; the footers' Notifications link) that sign the member in, as a message email's
 * link does (lib/signin.ts, ?k=). Server only.
 *
 * Each link carries a grant: the member, when it expires (EMAIL_LINK_TTL_MS, 7 days from the
 * email) and where it goes, signed with an HMAC that also covers the member's personal sign-in
 * token, so "Sign out on other devices" stops every older email's links too. Nothing is stored
 * when the email goes out. Opening one (GET /api/radar/go for Crystal Ball, GET /api/go for the
 * rest) checks the grant and makes a fresh one-time sign-in link for that one member (20
 * minutes, no code), then sends the browser to it: /?k=<one-time>&<where it goes>. The page
 * redeems it as it redeems any one-time link.
 *
 * Each link works once: redeeming the one-time link spends the grant (State.emailGrants, kept
 * until it would have expired), and the other one-time links made from it go. A mail scanner
 * that opens the link only makes a one-time link it never uses, so the member's own tap still
 * works. A browser already signed in as that member goes straight there. A link that was used,
 * expired or cut off opens the page with ?in=used, and on a browser that isn't signed in the
 * landing page's Sign in says so (app/Root.tsx).
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Seed, type State } from "./table";
import { addSignIn, MESSAGE_LINK_TTL_MS } from "./signin";

/** Notifications in the app: every email's footer links there. */
export const NOTIFICATIONS_PATH = "/?p=notifications";

/** How long a link in these emails signs the member in: 7 days, as a message email's. */
export const EMAIL_LINK_TTL_MS = MESSAGE_LINK_TTL_MS;

/**
 * A path a link may send to: the app's root with a query, nothing else (no open redirect). The
 * day's companies (/?p=radar&sig=2026-11-19) and a company (/?c=…) are two.
 */
export const safePath = (to: unknown): string | null => {
  const v = String(to ?? "");
  return /^\/(\?[A-Za-z0-9_\-.~%=&:+,]*)?$/.test(v) && v.length <= 300 ? v : null;
};

/** The member's personal token as it works now (a seed member's after "Sign out on other devices" is in State.tokens). */
function tokenOf(seed: Seed, s: State, memberId: string): string {
  if (s.tokens?.[memberId]) return s.tokens[memberId];
  return seed.members.find((m) => m.id === memberId)?.token ?? s.members.find((m) => m.id === memberId)?.token ?? "";
}

const grantSig = (memberId: string, token: string, exp: string, to: string) =>
  createHmac("sha256", T.ID_KEY).update(`email-in:${memberId}:${token}:${exp}:${to}`).digest("base64url").slice(0, 27);
const grantId = (sig: string) => createHash("sha256").update(`rn-email-in:${sig}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The grant's query for one link: x (expiry, base-36 seconds) and t (the signature). `to` is checked by safePath. */
export function grantQuery(seed: Seed, s: State, memberId: string, to: string, nowMs: number): string {
  const exp = Math.floor((nowMs + EMAIL_LINK_TTL_MS) / 1000).toString(36);
  return `x=${exp}&t=${grantSig(memberId, tokenOf(seed, s, memberId), exp, to)}`;
}

/** Makes the links for one email: each `to` a path in the app (safePath), signed for this member. */
export type EmailLinker = (to: string) => string;

/**
 * The weekly email's and the footers' links: base/api/go?m=…&x=…&t=…&to=…. A path safePath
 * refuses goes to the app's home.
 */
export function emailLinker(seed: Seed, s: State, memberId: string, base: string, nowMs = Date.now()): EmailLinker {
  const m = encodeURIComponent(T.pubId(memberId));
  return (to) => {
    const path = safePath(to) ?? "/";
    return `${base}/api/go?m=${m}&${grantQuery(seed, s, memberId, path, nowMs)}&to=${encodeURIComponent(path)}`;
  };
}

/** The same, reading the seed and state itself (for an email made outside a change). */
export async function emailLinkerFor(memberId: string, base: string, nowMs = Date.now()): Promise<EmailLinker> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return emailLinker(seed, s, memberId, base, nowMs);
}

/** "/?k=…&p=radar" from a path and a one-time token. */
const withQuery = (path: string, q: string) => `/?${q}${path.length > 2 ? `&${path.slice(2)}` : ""}`;

/**
 * Where an opened link sends the browser: the path with a fresh one-time sign-in link (?k=), the
 * path alone (signed in here as that member already, or a link with no grant, like an older
 * email's), or the path with in=used (spent, expired, or not this member's any more). Null when
 * the path isn't one the app has. `cookie` is the browser's own sign-in, if any.
 */
export async function emailLanding(q: { m: unknown; x: unknown; t: unknown; to: unknown }, cookie: string | null, nowMs = Date.now()): Promise<string | null> {
  const path = safePath(q.to);
  if (!path) return null;
  const x = String(q.x ?? "");
  const t = String(q.t ?? "");
  if (!x && !t) return path;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const member = T.memberIndex(seed, s).all.find((m) => T.pubId(m.id) === String(q.m ?? ""));
  const expMs = parseInt(x, 36) * 1000;
  const valid = !!member && /^[0-9a-z]{1,9}$/.test(x) && Number.isFinite(expMs) && same(grantSig(member.id, tokenOf(seed, s, member.id), x, path), t);
  if (!valid) return withQuery(path, "in=used");
  if (memberByToken(seed, cookie, s)?.id === member!.id) return path;
  if (expMs <= nowMs) return withQuery(path, "in=used");
  const id = grantId(t);
  const token = await T.mutate((d) => {
    if (d.emailGrants?.[id] && Date.parse(d.emailGrants[id]) > nowMs) return null;
    return addSignIn(d, member!.id, "email", nowMs, { id, exp: new Date(expMs).toISOString() }).token;
  });
  return token ? withQuery(path, `k=${encodeURIComponent(token)}`) : withQuery(path, "in=used");
}
