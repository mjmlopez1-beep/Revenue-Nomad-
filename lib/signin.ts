/**
 * Sign-in by email: one-time links and codes, and "Sign out on other devices".
 *
 * With email on, Sign in can email a link that signs the member in once and expires after 20
 * minutes, with a 6-digit code in the same email for opening Merlin on another device.
 * Joining sends the same kind of link to finish joining, and using it proves the address
 * (State.members[].proven, see trustOf in lib/table.ts). The personal link (?k= with the
 * member's own token) keeps working as before. The Crystal Ball and weekly emails' links make
 * a one-time link like these when opened (purpose "email", lib/emailIn.ts): 20 minutes, no code,
 * and using it spends the email link it was made from.
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
import { escHtml, footerNote, mailButton, mailCode, mailH, mailLinkLine, mailP, mailShell, mailSmall, oneLine } from "./email";

export const SIGNIN_TTL_MS = 20 * 60 * 1000;
export const CODE_TRIES = 5;
/** Links a member can have waiting at once. A newer one pushes the oldest out. */
const LIVE_MAX = 3;

/** A one-time link's token: "o" and 32 base64url characters (24 random bytes). A personal token is 16 characters. */
export const isOneTimeToken = (t: string) => /^o[A-Za-z0-9_-]{32}$/.test(t);
const hashToken = (t: string) => createHash("sha256").update(`rn-signin:${t}`).digest("hex");
const hashCode = (recordId: string, code: string) => createHmac("sha256", T.ID_KEY).update(`rn-code:${recordId}:${code}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Drop links that expired, and the spent email links once they would have expired anyway. */
function cleanup(s: State, nowMs: number) {
  if (s.signins?.length) s.signins = s.signins.filter((x) => Date.parse(x.exp) > nowMs);
  if (s.emailGrants) for (const [k, exp] of Object.entries(s.emailGrants)) if (!(Date.parse(exp) > nowMs)) delete s.emailGrants[k];
}

/** The member by id, with the personal token that works now. */
function memberById(seed: Seed, s: State, id: string): Member | null {
  const m = seed.members.find((x) => x.id === id);
  if (m) return s.tokens?.[m.id] ? { ...m, token: s.tokens[m.id] } : m;
  return s.members.find((x) => x.id === id) ?? null;
}

/** Using a link or code made for joining proves the address. */
function finish(s: State, memberId: string, purpose: Purpose) {
  if (purpose !== "join") return;
  const j = s.members.find((x) => x.id === memberId);
  if (j) j.proven = true;
}

/** How long the link in a message email works. It still works only once. */
export const MESSAGE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Message-email links a member can have waiting at once (one per conversation an hour at most). */
const MESSAGE_LIVE_MAX = 10;
/** Links made when a member opens a link in the Crystal Ball or weekly email (lib/emailIn.ts). Each is used within seconds. */
const EMAIL_LIVE_MAX = 5;

type Purpose = "signin" | "join" | "message" | "email";
/** The kinds capped apart: sign-in and join links, a message email's, and the ones made from an email link. */
const capGroup = (p: Purpose) => (p === "message" ? "message" : p === "email" ? "email" : "signin");

/**
 * Put a new one-time link (and code) for a member into the state, inside a change already
 * under way. Links of each kind are capped apart, so a message email never pushes out the
 * sign-in link the member just asked for. `grant` (purpose "email" only): the email link it is
 * made from, and when that one expires. Using this link spends that email link (redeemLink).
 */
export function addSignIn(s: State, memberId: string, purpose: Purpose, nowMs = Date.now(), grant?: { id: string; exp: string }): { token: string; code: string } {
  const token = `o${randomBytes(24).toString("base64url")}`;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  cleanup(s, nowMs);
  s.signins ??= [];
  const id = hashToken(token);
  const group = capGroup(purpose);
  const cap = group === "message" ? MESSAGE_LIVE_MAX : group === "email" ? EMAIL_LIVE_MAX : LIVE_MAX;
  const mine = s.signins.filter((x) => x.memberId === memberId && capGroup(x.purpose) === group).sort((a, b) => a.exp.localeCompare(b.exp));
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - (cap - 1))).map((x) => x.id));
  s.signins = s.signins.filter((x) => !drop.has(x.id));
  const ttl = purpose === "message" ? MESSAGE_LINK_TTL_MS : SIGNIN_TTL_MS;
  s.signins.push({
    id,
    memberId,
    code: hashCode(id, code),
    purpose,
    exp: new Date(nowMs + ttl).toISOString(),
    tries: 0,
    ...(purpose === "email" && grant ? { grant: grant.id, grantExp: grant.exp } : {}),
  });
  return { token, code };
}

/** A new one-time link and code for a member. Returns the token and the code (only their hashes are kept). */
export async function createSignIn(memberId: string, purpose: "signin" | "join"): Promise<{ token: string; code: string }> {
  return T.mutate((s) => addSignIn(s, memberId, purpose));
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
    // Made from an email link: that email link is spent now, and any other link made from it (a mail scanner's visit, say) goes too.
    if (rec.grant) {
      if (s.emailGrants?.[rec.grant]) return null;
      s.emailGrants = { ...(s.emailGrants ?? {}), [rec.grant]: rec.grantExp ?? rec.exp };
      s.signins = s.signins.filter((x) => x.grant !== rec.grant);
    }
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
    // A message email carries no code, nor does a link made from an email link, so a typed code opens neither.
    const live = (s.signins ?? []).filter((x) => x.memberId === who.id && x.purpose !== "message" && x.purpose !== "email");
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
  const subject = join ? "Finish joining Merlin" : "Your Merlin sign-in link";
  const head = join ? "Finish joining Merlin" : "Here's your sign-in link";
  const lead = "The button works once, for the next 20 minutes.";
  const codeLine = "On another device? Type this code in the sign-in box instead.";
  const why = join
    ? "You got this because someone joined Merlin with this email address. If it wasn't you, ignore this email and nothing happens."
    : "You got this because someone asked to sign in to Merlin with this email address. If it wasn't you, ignore this email. Nobody gets in without the link or the code.";
  const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";
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
  const body = [
    mailP(`Hi ${escHtml(first)},`),
    mailH(escHtml(head)),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    mailButton(url, join ? "Open Merlin" : "Sign in to Merlin", "margin:0 0 24px"),
    mailSmall(escHtml(codeLine), "margin-bottom:8px;"),
    mailCode(digits),
    mailSmall("If the button doesn&#39;t work, paste this link into your browser."),
    mailLinkLine(url, "margin:0"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead, body, link: url, art: "door", footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}
