/**
 * Closing an account, and bringing it back.
 *
 *  - Close (the member, from Your credits, or an admin): at once. The account is signed out
 *    everywhere (its token changes and every sign-in link goes; lib/table.ts memberByToken answers
 *    null for it), it leaves Peers, the Fractionals directory and every list (memberIndex), and no
 *    email goes to its address (lib/email.ts setMailBlock). A paid plan is set to end at the end of
 *    the period already paid for. The member gets one email, with a restore link that works for
 *    CLOSURE_DAYS.
 *  - Restore, until then: the restore link (GET /api/account/restore?k=..., signs them in), or the
 *    owner or an admin in Pilot metrics. Everything is as it was; a plan set to end stays set to end
 *    (they can keep it on Plan and billing).
 *  - After CLOSURE_DAYS, on the job scheduler's tick (lib/jobs.ts runDueJobs, purgeDue): their
 *    personal data is deleted (lib/table.ts purgeMember), their Google grants are revoked at
 *    Google and their documents' files removed from the volume. Facts they added to companies stay,
 *    attributed to nobody. The account can't come back after that.
 *
 * State.closures keeps, per closed account, when, by whom, the restore key's hash and the address's
 * hash: never an address or a name. Logs carry counts only.
 */
import { createHash, randomBytes } from "crypto";
import { emailEnabled, escHtml, mailButton, mailH, mailP, mailShell, mailSmall, oneLine, sendEmail } from "./email";
import { publicBase } from "./links";
import { billingLive } from "./plan";
import {
  ActionError,
  CLOSURE_DAYS,
  isAdmin,
  loadSeed,
  loadState,
  mailHashOf,
  memberByToken,
  tableInternals as T,
  type AccountClosure,
  type Member,
  type Seed,
  type State,
} from "./table";

const DAY = 86_400_000;
const hashKey = (k: string) => createHash("sha256").update(`rn-restore:${k}`).digest("hex");
const base = (origin?: string) => (publicBase() ?? origin ?? "").replace(/\/$/, "");
export const restoreLink = (origin: string | undefined, key: string) => `${base(origin)}/api/account/restore?k=${encodeURIComponent(key)}`;
const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** What the member reads before they close it (Your credits, Close your account). */
export const CLOSE_WORDS = {
  title: "Close your account",
  lead: `Your account closes now: you're signed out everywhere, you leave Peers and the Fractionals directory, and Merlin stops emailing you.`,
  restore: `For ${CLOSURE_DAYS} days you can bring it back with the link we email you, or by writing to us.`,
  after: `After ${CLOSURE_DAYS} days Merlin deletes your personal data: your profile, your Google and LinkedIn imports and network, the messages you wrote, your proposals and documents, your AI usage log and your saved views. Facts you added to companies stay, with your name taken off.`,
  plan: "A paid plan stops renewing. You keep nothing of it after the period you paid for.",
  confirm: "Close my account",
};

/** Every member record (seed and joined), closed ones included, by id. */
const anyMember = (seed: Seed, s: State, id: string): Member | null => {
  const m = seed.members.find((x) => x.id === id) ?? s.members.find((x) => x.id === id) ?? null;
  return m ? (s.tokens?.[m.id] ? { ...m, token: s.tokens[m.id] } : m) : null;
};

/** A new personal token: every device and every old link signs out. */
function rotate(s: State, seed: Seed, id: string) {
  const fresh = randomBytes(12).toString("base64url");
  const joined = s.members.find((x) => x.id === id);
  if (joined) joined.token = fresh;
  else if (seed.members.some((x) => x.id === id)) s.tokens = { ...(s.tokens ?? {}), [id]: fresh };
  if (s.signins?.length) s.signins = s.signins.filter((x) => x.memberId !== id);
}

/** The closure email: closed now, the restore link and the day it stops working. */
export function closedEmail(o: { first: string; link: string; purgeAt: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const subject = "Your Merlin account is closed";
  const until = dayWords(o.purgeAt);
  const lead = `Your Merlin account is closed. You're signed out, you're out of Peers and the directory, and this is the last email Merlin sends you.`;
  const back = `Changed your mind? This link brings it back until ${until}. After that Merlin deletes your personal data, and facts you added to companies stay with your name taken off.`;
  const text = [`Hi ${first},`, "", lead, "", back, "", o.link, "", "If you didn't close it, open the link to bring it back, then write to us."].join("\n");
  const html = mailShell({
    title: subject,
    preheader: lead.slice(0, 120),
    body: [mailP(`Hi ${escHtml(first)},`), mailH(subject), mailP(escHtml(lead)), mailP(escHtml(back), "margin-bottom:24px;"), mailButton(o.link, "Bring my account back", "margin:0 0 8px"), mailSmall("If you didn't close it, open the link to bring it back, then write to us.")].join("\n"),
    link: o.link,
    art: "plan",
    footer: [],
  });
  return { subject, text, html };
}

export interface CloseResult {
  message: string;
  purgeAt: string;
  /** The email with the restore link went out. */
  emailed: boolean;
}

/**
 * Close an account now. `token` is the member's own; an admin closes another's with `memberId`.
 * `nowMs` for tests. The restore link is emailed (when email is on).
 */
export async function closeAccount(token: string | null, o: { origin?: string; memberId?: string; nowMs?: number } = {}): Promise<CloseResult> {
  const nowMs = o.nowMs ?? Date.now();
  const at = new Date(nowMs).toISOString();
  const purgeAt = new Date(nowMs + CLOSURE_DAYS * DAY).toISOString();
  const key = randomBytes(24).toString("base64url");
  const out = await T.mutate((s, seed) => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("You're signed out. Sign in again to close your account.");
    let id = me.id;
    let by: AccountClosure["by"] = "member";
    if (o.memberId && o.memberId !== T.pubId(me.id)) {
      if (!isAdmin(me)) throw new ActionError("Only admins can close another member's account.");
      const target = T.memberIndex(seed, s).all.find((m) => T.pubId(m.id) === o.memberId);
      if (!target) throw new ActionError("We couldn't find that member.");
      id = target.id;
      by = "admin";
    }
    const m = anyMember(seed, s, id)!;
    (s.closures ??= {})[id] = { at, purgeAt, by, restore: hashKey(key), ...(m.email ? { mail: mailHashOf(m.email) } : {}) };
    rotate(s, seed, id);
    const sub = s.billing?.members[id];
    return { email: m.email, name: m.name, id, sub: sub?.subscriptionId && !sub.cancelAt ? sub.subscriptionId : null };
  });
  // A paid plan stops renewing (Stripe: cancel at the period's end). Best effort: the closure stands either way.
  if (out.sub && billingLive()) {
    try {
      const stripe = await import("./billing/stripe");
      await stripe.setCancel(out.sub, true);
      await T.mutate((s) => {
        const r = s.billing?.members[out.id];
        if (r) r.cancelAt = r.proUntil ?? at;
      });
    } catch (e) {
      console.error("account close: the plan's renewal couldn't be stopped", e instanceof Error ? e.message : "error");
    }
  }
  let emailed = false;
  if (out.email && emailEnabled() && base(o.origin)) {
    const e = closedEmail({ first: T.firstName(out.name), link: restoreLink(o.origin, key), purgeAt });
    emailed = await sendEmail(out.email, e.subject, e.text, e.html, { evenClosed: true }).catch(() => false);
  }
  return {
    message: `Your account is closed. ${emailed ? "We emailed you a link that brings it back" : "Write to us to bring it back"} until ${dayWords(purgeAt)}.`,
    purgeAt,
    emailed,
  };
}

/** The restore link: the account is back, signed in. Null when the key is wrong, used, or past its days. */
export async function restoreByLink(key: unknown, nowMs = Date.now()): Promise<Member | null> {
  const k = String(key ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(k)) return null;
  const h = hashKey(k);
  return T.mutate((s, seed) => {
    const hit = Object.entries(s.closures ?? {}).find(([, c]) => c.restore === h);
    if (!hit) return null;
    const [id, c] = hit;
    if (c.purgedAt || Date.parse(c.purgeAt) <= nowMs) return null;
    delete s.closures![id];
    T.memberIndexReset();
    return anyMember(seed, s, id);
  });
}

/** The owner or an admin brings a closed account back, within its days. */
export async function adminRestore(token: string | null, memberId: unknown, nowMs = Date.now()): Promise<{ message: string }> {
  return T.mutate((s, seed) => {
    const me = memberByToken(seed, token, s);
    if (!isAdmin(me)) throw new ActionError("Only admins can restore an account.");
    const id = Object.keys(s.closures ?? {}).find((x) => T.pubId(x) === String(memberId ?? ""));
    const c = id ? s.closures![id] : undefined;
    if (!id || !c) throw new ActionError("That account isn't closed.");
    if (c.purgedAt || Date.parse(c.purgeAt) <= nowMs) throw new ActionError("Its personal data has been deleted, so it can't come back.");
    delete s.closures![id];
    T.memberIndexReset();
    return { message: `${anyMember(seed, s, id)?.name ?? "The account"} is back. They sign in with their email as before.` };
  });
}

export interface ClosedRow {
  memberId: string;
  name: string;
  at: string;
  purgeAt: string;
  by: AccountClosure["by"];
  purged: boolean;
}

/** Closed accounts for Pilot metrics (admins only): who, when, and when their data goes. A purged one is a row with no name. */
export async function closedAccounts(token: string | null): Promise<ClosedRow[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  if (!isAdmin(memberByToken(seed, token, s))) throw new ActionError("Only admins can see closed accounts.");
  return Object.entries(s.closures ?? {})
    .map(([id, c]) => ({ memberId: T.pubId(id), name: c.purgedAt ? "" : anyMember(seed, s, id)?.name ?? "", at: c.at, purgeAt: c.purgeAt, by: c.by, purged: !!c.purgedAt }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * The scheduled delete (lib/jobs.ts runDueJobs, every tick; cheap when nothing is due): every
 * account closed CLOSURE_DAYS ago loses its personal data. Google grants are revoked and document
 * files removed after the state is saved. Returns how many. Never throws.
 */
export async function purgeDue(nowMs = Date.now()): Promise<number> {
  try {
    const s0 = await loadState();
    const due = Object.entries(s0.closures ?? {}).filter(([, c]) => !c.purgedAt && Date.parse(c.purgeAt) <= nowMs).map(([id]) => id);
    if (!due.length) return 0;
    const done = await T.mutate((s, seed) => {
      const out: { googleTokens: string[]; documentIds: string[] }[] = [];
      for (const id of due) {
        const c = s.closures?.[id];
        if (!c || c.purgedAt || Date.parse(c.purgeAt) > nowMs) continue;
        out.push(T.purgeMember(s, seed, id, new Date(nowMs).toISOString()));
      }
      return out;
    });
    const tokens = done.flatMap((d) => d.googleTokens);
    if (tokens.length) {
      const [{ unseal }, G] = await Promise.all([import("./google/crypto"), import("./google/api")]);
      await Promise.all(tokens.map((t) => unseal(t)).filter((t): t is string => !!t).map((t) => G.revoke(t).catch(() => false)));
    }
    const docs = done.flatMap((d) => d.documentIds);
    if (docs.length) {
      const { removeFiles } = await import("./documents/files");
      await Promise.all(docs.map((id) => removeFiles(id).catch(() => undefined)));
    }
    if (done.length) console.log(`Deleted the personal data of ${done.length} account${done.length === 1 ? "" : "s"} closed ${CLOSURE_DAYS} days ago.`);
    return done.length;
  } catch (e) {
    console.error("account purge failed", e instanceof Error ? e.message : "error");
    return 0;
  }
}
