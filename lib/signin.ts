/**
 * Sign-in by email: one-time links and codes, and "Sign out on other devices".
 *
 * With email on, Sign in can email a link that signs the member in once and expires after 20
 * minutes, with a 6-digit code in the same email for opening Trading Post on another device.
 * Joining sends the same kind of link to finish joining, and using it proves the address
 * (State.members[].proven, see trustOf in lib/table.ts). The personal link (?k= with the
 * member's own token) keeps working as before.
 *
 * Only hashes are stored: the link's token as SHA-256, the code as an HMAC. A link or code works
 * once. A code stops after 5 wrong tries. Expired ones are cleaned up whenever a link is made or
 * used. Every answer the route gives is the same whether or not the email belongs to a member.
 *
 * Rotation: a new personal token. A seed member's goes into State.tokens (the seed's stops
 * working), a joined member's replaces theirs. Every other device is signed out.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import { MAIL, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine } from "./email";

export const SIGNIN_TTL_MS = 20 * 60 * 1000;
export const CODE_TRIES = 5;
/** Links a member can have waiting at once. A newer one pushes the oldest out. */
const LIVE_MAX = 3;

/** A one-time link's token: "o" and 32 base64url characters (24 random bytes). A personal token is 16 characters. */
export const isOneTimeToken = (t: string) => /^o[A-Za-z0-9_-]{32}$/.test(t);
const hashToken = (t: string) => createHash("sha256").update(`rn-signin:${t}`).digest("hex");
const hashCode = (recordId: string, code: string) => createHmac("sha256", T.ID_KEY).update(`rn-code:${recordId}:${code}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Drop links that expired. */
function cleanup(s: State, nowMs: number) {
  if (s.signins?.length) s.signins = s.signins.filter((x) => Date.parse(x.exp) > nowMs);
}

/** The member by id, with the personal token that works now. */
function memberById(seed: Seed, s: State, id: string): Member | null {
  const m = seed.members.find((x) => x.id === id);
  if (m) return s.tokens?.[m.id] ? { ...m, token: s.tokens[m.id] } : m;
  return s.members.find((x) => x.id === id) ?? null;
}

/** Using a link or code made for joining proves the address. */
function finish(s: State, memberId: string, purpose: "signin" | "join") {
  if (purpose !== "join") return;
  const j = s.members.find((x) => x.id === memberId);
  if (j) j.proven = true;
}

/** A new one-time link and code for a member. Returns the token and the code (only their hashes are kept). */
export async function createSignIn(memberId: string, purpose: "signin" | "join"): Promise<{ token: string; code: string }> {
  const token = `o${randomBytes(24).toString("base64url")}`;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await T.mutate((s) => {
    const nowMs = Date.now();
    cleanup(s, nowMs);
    s.signins ??= [];
    const id = hashToken(token);
    const mine = s.signins.filter((x) => x.memberId === memberId).sort((a, b) => a.exp.localeCompare(b.exp));
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - (LIVE_MAX - 1))).map((x) => x.id));
    s.signins = s.signins.filter((x) => !drop.has(x.id));
    s.signins.push({ id, memberId, code: hashCode(id, code), purpose, exp: new Date(nowMs + SIGNIN_TTL_MS).toISOString(), tries: 0 });
  });
  return { token, code };
}

/** Use a one-time link. The member it signs in (with their personal token), or null when it expired, was used or never existed. */
export async function redeemLink(token: string): Promise<Member | null> {
  if (!isOneTimeToken(token)) return null;
  const id = hashToken(token);
  return T.mutate((s, seed) => {
    cleanup(s, Date.now());
    const rec = s.signins?.find((x) => x.id === id);
    if (!rec) return null;
    s.signins = s.signins!.filter((x) => x !== rec);
    finish(s, rec.memberId, rec.purpose);
    return memberById(seed, s, rec.memberId);
  });
}

/**
 * Use a code typed into Sign in, with the email it was sent to. A wrong code counts against
 * every link waiting for that member, and a link with 5 wrong tries is gone.
 */
export async function redeemCode(emailRaw: string, codeRaw: string): Promise<Member | null> {
  const code = String(codeRaw ?? "").replace(/\D/g, "");
  if (code.length !== 6) return null;
  const inbox = T.inboxKey(String(emailRaw ?? ""));
  const [seed0, s0] = await Promise.all([loadSeed(), loadState()]);
  const who = seed0.members.find((m) => m.email && T.inboxKey(m.email) === inbox) ?? s0.members.find((m) => T.inboxKey(m.email) === inbox);
  if (!who) return null;
  return T.mutate((s, seed) => {
    cleanup(s, Date.now());
    const live = (s.signins ?? []).filter((x) => x.memberId === who.id);
    if (!live.length) return null;
    const hit = live.find((x) => same(x.code, hashCode(x.id, code)));
    if (hit) {
      s.signins = s.signins!.filter((x) => x !== hit);
      finish(s, hit.memberId, hit.purpose);
      return memberById(seed, s, hit.memberId);
    }
    for (const x of live) x.tries++;
    s.signins = s.signins!.filter((x) => x.tries < CODE_TRIES);
    return null;
  });
}

/** "Sign out on other devices": a new personal token for the member behind `token`. Null when nobody is signed in. */
export async function rotateToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const fresh = randomBytes(12).toString("base64url");
  return T.mutate((s, seed) => {
    const me = memberByToken(seed, token, s);
    if (!me) return null;
    const joined = s.members.find((x) => x.id === me.id);
    if (joined) joined.token = fresh;
    else s.tokens = { ...(s.tokens ?? {}), [me.id]: fresh };
    // Links waiting in an inbox somewhere stop working too.
    if (s.signins?.length) s.signins = s.signins.filter((x) => x.memberId !== me.id);
    return fresh;
  });
}

/* ---------- the email ---------- */

/**
 * The one-time sign-in email: a button that signs in once, and the code for another device.
 * `purpose` join: the same thing, worded as finishing joining.
 */
export function oneTimeEmail(name: string, link: string, code: string, purpose: "signin" | "join") {
  const first = oneLine(name).split(" ")[0].slice(0, 40) || "there";
  const url = oneLine(link);
  const digits = String(code).replace(/\D/g, "").slice(0, 6);
  const join = purpose === "join";
  const subject = join ? "Finish joining Trading Post" : "Your Trading Post sign-in link";
  const head = join ? "Finish joining Trading Post" : "Here's your sign-in link";
  const lead = "The button works once, for the next 20 minutes.";
  const codeLine = "On another device? Type this code in the sign-in box instead.";
  const why = join
    ? "You got this because someone joined Trading Post with this email address. If it wasn't you, ignore this email and nothing happens."
    : "You got this because someone asked to sign in to Trading Post with this email address. If it wasn't you, ignore this email. Nobody gets in without the link or the code.";
  const from = "Trading Post is a free pilot from Revenue Nomad.";
  const note = footerNote();
  const text = [
    `Hi ${first},`,
    "",
    `${head}. ${lead}`,
    "",
    url,
    "",
    codeLine,
    digits,
    "",
    "--",
    why,
    from,
    ...(note ? [note] : []),
  ].join("\n");
  const small = `font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}`;
  const body = [
    mailP(`Hi ${escHtml(first)},`),
    mailH(escHtml(head)),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    mailButton(url, join ? "Open Trading Post" : "Sign in to Trading Post", "margin:0 0 24px"),
    `<p style="margin:0 0 8px;${small}">${escHtml(codeLine)}</p>`,
    `<p style="margin:0 0 24px;font-family:${MAIL.font};font-size:28px;line-height:36px;font-weight:800;letter-spacing:0.12em;font-variant-numeric:tabular-nums;color:${MAIL.ink}">${escHtml(digits)}</p>`,
    `<p style="margin:0 0 4px;${small}">If the button doesn&#39;t work, paste this link into your browser.</p>`,
    `<p style="margin:0;font-family:${MAIL.mono};font-size:13px;line-height:20px;word-break:break-all"><a href="${escHtml(url)}" style="color:${MAIL.pine};text-decoration:underline">${escHtml(url)}</a></p>`,
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead, body, footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}
