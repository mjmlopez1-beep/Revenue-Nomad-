"use client";

/**
 * The claim link's page: "Is this your seat?", with the seat's free facts, and three answers.
 *  - Claim it, join free: the join form (email, then name) or, for a member, Sign in. With email on,
 *    the link we send comes back here (?k=…&go=1), signs in and claims the seat.
 *  - Not me, and Remove my name: no account needed. The name comes off at once.
 * The invite code from the link (?ref=) goes with the join and the claim, so the invite counts: a
 * claim through a member's Invite to connect link opens a conversation between them, and a new
 * member and the inviter both get the invite bonus. A seat on file under a member who has never
 * signed in (status signin) asks them to sign in, and the link connects them once they do. Phone first.
 * Every request goes to /api/table/names (claims and names) or /api/table (sign-in), and the
 * page says what happened in a sentence. It never shows a person's name.
 *
 * Activate your fractional profile (ClaimPage.person): when the link's fractional has more than one
 * seat to claim, the page shows who is waiting (the member whose link it is, their note, and how many
 * more invited them), every seat that looks like theirs with a tick and "Not mine", an email field
 * and one button, "Activate my profile · free", with "Show me in the Fractionals directory" ticked.
 * Activating claims the ticked seats, connects them with everyone who invited them, and opens the
 * app on their record and the first inviter's conversation. Only the link's own seat names its
 * company: whoever holds a link sees no other company's name.
 */
import { useEffect, useId, useRef, useState } from "react";
import "./claim.css";
import { Brand, IconCheck, fmtMonth, post, errorText } from "../ui/shared";
import type { ClaimPage } from "@/lib/table";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { seatLine } from "./seatLine";

type Done = { title: string; text: string; seats?: boolean; messages?: boolean };
/** A claim's answer from the server: claimed now, or waiting for an admin (the name on the seat isn't theirs). */
type ClaimAnswer = { message?: string; claimed?: boolean; waiting?: boolean };
const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u;
/** The server's answer for an email that already has an account: offer Sign in. */
const MEMBER_RE = /already belongs to a member|personal link/i;

async function names<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/table/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

/** The server's answer without the words the heading already says ("It's yours." under "It's yours"). */
function after(message: string, lead: string): string {
  return message.startsWith(lead) ? message.slice(lead.length).trim() : message;
}

/** What the page says once a claim went through: the seat is theirs, or an admin checks it first. */
function settled(r: ClaimAnswer, fresh: ClaimPage | null): Done {
  if (r.waiting || fresh?.status === "waiting") return { title: "We'll check your claim", text: after(r.message ?? "", "Thanks.") };
  // Through an invite: the conversation with whoever sent the link is open (lib/table.ts connectedNote).
  const messages = /conversation is open in Messages/.test(r.message ?? "");
  const text = after(after(r.message ?? "", "It's yours."), "This seat is yours already.") || "It's on Your seats, where you can fill in what's missing. Each answer earns a credit.";
  return { title: "It's yours", text, seats: fresh?.status === "yours" && !messages, messages };
}


/** Where the app opens after activating: their record in Fractionals, with the first inviter's conversation. */
function afterActivate(r: { record?: string | null; conversationId?: string | null }) {
  const q = new URLSearchParams({ p: "fractionals", welcome: "1" });
  if (r.record) q.set("fr", r.record);
  if (r.conversationId) q.set("m", r.conversationId);
  window.location.href = `/?${q.toString()}`;
}

type ActivateAnswer = { message?: string; activated?: boolean; record?: string | null; conversationId?: string | null; sent?: boolean; needName?: boolean };

/** "Dana Whitfield and 2 other fractionals want to collaborate with you on Merlin." */
function waitingLine(p: NonNullable<ClaimPage["person"]>): string | null {
  if (!p.inviter) return p.others ? `${p.others} fractionals on Merlin want to collaborate with you.` : null;
  return `${p.inviter.name}${p.others ? ` and ${p.others} other ${p.others === 1 ? "fractional" : "fractionals"}` : ""} ${p.others ? "want" : "wants"} to collaborate with you on Merlin.`;
}

/** "since Feb 2026", "Mar 2024 to Jan 2026", for one seat on the activation page. */
function seatDates(x: NonNullable<ClaimPage["person"]>["seats"][number]): string {
  if (!x.start) return "";
  return x.now ? `since ${fmtMonth(x.start)}` : x.end ? `${fmtMonth(x.start)} to ${fmtMonth(x.end)}` : `from ${fmtMonth(x.start)}`;
}

function Activate({
  token,
  info,
  refCode,
  onInfo,
  onDone,
}: {
  token: string;
  info: ClaimPage;
  refCode: string | null;
  onInfo: () => Promise<void>;
  onDone: (d: Done) => void;
}) {
  const p = info.person!;
  const id = useId();
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [show, setShow] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const signedIn = !!info.me;
  const first = p.inviter ? p.inviter.name.split(/\s+/)[0] : null;
  const ticked = p.seats.filter((x) => !skip.has(x.id)).length;

  const activate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!ticked) return setError("Tick at least one seat that's yours, or use This isn't me.");
    const em = email.trim();
    if (!signedIn && !EMAIL_RE.test(em)) return setError(em ? "That doesn't look like an email address. Check it for a typo." : "Type your email first.");
    if (needName && !NAME_RE.test(name.trim().replace(/\s+/g, " "))) return setError("Add your first and last name, like Jane Smith.");
    setBusy("activate");
    setError(null);
    const r = await names<ActivateAnswer>({ op: "activate", t: token, ref: refCode ?? undefined, skip: [...skip], show, ...(signedIn ? {} : { email: em }), ...(needName ? { name: name.trim() } : {}) });
    setBusy(null);
    if (r.needName) {
      setNeedName(true);
      return setError(r.error ?? "Add your first and last name.");
    }
    if (r.error) return setError(r.error);
    if (r.sent) return setSent(true);
    if (r.activated) return afterActivate(r);
    onDone({ title: "You're in", text: r.message ?? "" });
  };
  const notMine = async (seat: string) => {
    setBusy(`nm-${seat}`);
    setError(null);
    const r = await names<{ message?: string }>({ op: "notmine-seat", t: token, seat });
    setBusy(null);
    if (r.error) return setError(r.error);
    await onInfo();
  };
  const nameOff = async (op: "notme" | "remove") => {
    setBusy(op);
    setError(null);
    const r = await names<{ message?: string; done?: boolean }>({ op, t: token });
    setBusy(null);
    if (r.error) return setError(r.error);
    onDone({ title: op === "remove" ? (r.done ? "Your name is off" : "Nothing to take off") : "Thanks for telling us", text: r.message ?? "" });
  };
  const line = waitingLine(p);

  if (sent)
    return (
      <div className="cl-box" role="status">
        <p className="cl-box-h">Check your inbox</p>
        <p className="cl-p cl-p-flush">
          We sent a link to <span className="mono">{email}</span>. Open it and your profile is activated with the seats you ticked. It works once, for 20 minutes, and it sometimes lands in spam.
        </p>
      </div>
    );
  return (
    <>
      {line && <p className="cl-from">{line}</p>}
      <h1 className="cl-h">Activate your fractional profile</h1>
      {p.inviter && (
        <div className="cl-inviter">
          <div className="cl-inviter-top">
            <span className="cl-av" aria-hidden>
              {p.inviter.name
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span>
              <span className="cl-inviter-n">{p.inviter.name}</span>
              <span className="cl-inviter-t">{[p.inviter.title, p.inviter.since ? `on Merlin since ${fmtMonth(p.inviter.since.slice(0, 7))}` : "on Merlin"].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
          {p.inviter.note && <p className="cl-inviter-note">&ldquo;{p.inviter.note}&rdquo;</p>}
          {p.others > 0 && <p className="cl-inviter-more">{p.others === 1 ? "1 other member invited you too." : `${p.others} other members invited you too.`}</p>}
        </div>
      )}
      <h2 className="cl-h2">
        We found {p.seats.length} fractional seats that look like yours
      </h2>
      <ul className="cl-seats">
        {p.seats.map((x) => {
          const on = !skip.has(x.id);
          return (
            <li key={x.id} className={`cl-seatrow${on ? "" : " off"}`}>
              <label className="cl-tick">
                <input type="checkbox" checked={on} onChange={() => setSkip((s) => (on ? new Set([...s, x.id]) : new Set([...s].filter((y) => y !== x.id))))} />
                <span>
                  <span className="cl-seat-co">
                    {x.company ?? (x.facts ? `A ${x.facts.split(" · ")[0]} company` : "A company")}
                    {x.now && <span className="cl-now">Now</span>}
                  </span>
                  <span className="cl-seat-what">{[x.role || (x.fn ? `Fractional ${x.fn} seat` : "Fractional seat"), seatDates(x)].filter(Boolean).join(" · ")}</span>
                  {!x.company && x.facts && <span className="cl-seat-what">{x.facts}</span>}
                </span>
              </label>
              {!x.link && (
                <button type="button" className="cl-notmine" disabled={!!busy} aria-busy={busy === `nm-${x.id}`} onClick={() => void notMine(x.id)}>
                  Not mine
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form className="cl-form" onSubmit={activate} noValidate>
        {!signedIn && (
          <>
            <label className="cl-label" htmlFor={`${id}-email`}>
              Your email
            </label>
            <input id={`${id}-email`} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@yourfirm.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="cl-help">To sign you in. Other members never see it.</p>
          </>
        )}
        {needName && (
          <>
            <label className="cl-label" htmlFor={`${id}-name`}>
              Your first and last name
            </label>
            <input id={`${id}-name`} className="input" autoComplete="name" placeholder="Jane Smith" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label className="cl-show">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>
            <b>Show me in the Fractionals directory.</b> Members see your name, your seats and the clients you serve, free, and can message you. Never your email.
          </span>
        </label>
        {error && (
          <p className="cl-err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "activate"}>
          {busy === "activate" ? "Activating" : "Activate my profile · free"}
        </button>
        <p className="cl-help cl-center">
          Your seats move to your profile{first ? `, you're connected with ${first},` : ""} and {first ? "you both earn credits" : "you start with credits"}.{signedIn ? ` Signed in as ${info.me!.first}.` : ""}
        </p>
      </form>
      <ul className="cl-gains">
        <li>Fractionals who serve the same clients can find you.</li>
        <li>You see the companies likely to hire you next.</li>
        <li>You see what fractionals charge, by function and client size.</li>
      </ul>
      <div className="cl-row cl-row-quiet">
        <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "notme"} onClick={() => void nameOff("notme")}>
          This isn&apos;t me
        </button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "remove"} onClick={() => void nameOff("remove")}>
          Remove my name
        </button>
      </div>
    </>
  );
}

export function ClaimView({ token, initial, refCode, support, starter }: { token: string; initial: ClaimPage | null; refCode: string | null; support: string | null; starter: number }) {
  const [info, setInfo] = useState<ClaimPage | null>(initial);
  const [done, setDone] = useState<Done | null>(null);
  // A seat on file under a member who has never signed in: the page opens on signing in (they are a member already).
  const [mode, setMode] = useState<"ask" | "join" | "signin" | "sent" | "remove">(initial?.status === "signin" ? "signin" : "ask");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const id = useId();
  const head = useRef<HTMLHeadingElement>(null);
  const q = `t=${encodeURIComponent(token)}${refCode ? `&ref=${encodeURIComponent(refCode)}` : ""}`;

  const fetchInfo = async (): Promise<ClaimPage | null> => {
    try {
      const r = await fetch(`/api/table/names?${q}`, { cache: "no-store" });
      return r.ok ? ((await r.json()) as ClaimPage) : null;
    } catch {
      return null;
    }
  };

  const claim = async () => {
    setBusy("claim");
    setError(null);
    const r = await names<ClaimAnswer>({ op: "claim", t: token, ref: refCode ?? undefined });
    setBusy(null);
    if (r.error) return setError(r.error);
    const fresh = await fetchInfo();
    if (fresh) setInfo(fresh);
    setDone(settled(r, fresh));
  };

  // Signed in already, on their own seat, through an invite link: that connects them with whoever sent it (once, on arrival).
  useEffect(() => {
    if (initial?.status !== "yours" || !refCode || new URL(window.location.href).searchParams.get("k")) return;
    void (async () => {
      const r = await names<ClaimAnswer>({ op: "claim", t: token, ref: refCode });
      if (!r.error && /conversation is open in Messages/.test(r.message ?? "")) setDone(settled(r, initial));
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The heading takes focus when the page changes what it says, so a screen reader hears it.
  useEffect(() => {
    if (done) head.current?.focus();
  }, [done]);

  // An invite code that came with the link counts on the homepage too (app/Root.tsx keeps it the same way).
  useEffect(() => {
    if (!refCode) return;
    try {
      localStorage.setItem("tp_ref", refCode);
    } catch {}
  }, [refCode]);

  // ?k= from the link we emailed: sign in here, then claim the seat (go=1 says the member asked to claim it).
  useEffect(() => {
    const url = new URL(window.location.href);
    const k = url.searchParams.get("k");
    const go = url.searchParams.get("go") === "1";
    if (!k) return;
    url.searchParams.delete("k");
    url.searchParams.delete("go");
    const ticks = new URL(url.toString());
    url.searchParams.delete("skip");
    url.searchParams.delete("show");
    window.history.replaceState(null, "", url.pathname + url.search);
    void (async () => {
      setBusy("signin");
      const r = await post({ signIn: k });
      if (r.error) {
        setBusy(null);
        return setError(r.error);
      }
      const fresh = await fetchInfo();
      if (fresh) setInfo(fresh);
      setBusy(null);
      // Activate your fractional profile: the seats ticked and the directory choice came back in the link.
      if (go && fresh?.status === "open" && fresh.person) {
        setBusy("signin");
        const skip = (ticks.searchParams.get("skip") ?? "").split(",").filter(Boolean);
        const r = await names<ActivateAnswer>({ op: "activate", t: token, ref: refCode ?? undefined, skip, show: ticks.searchParams.get("show") !== "0" });
        setBusy(null);
        if (r.error) return setError(r.error);
        if (r.activated) return afterActivate(r);
        return setDone({ title: "You're in", text: r.message ?? "" });
      }
      if (go && (fresh?.status === "open" || (refCode && fresh?.status === "yours"))) await claim();
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const em = email.trim();
    const nm = name.trim().replace(/\s+/g, " ");
    if (!EMAIL_RE.test(em)) return setError(em ? "That doesn't look like an email address. Check it for a typo." : "Type your email first.");
    if (!NAME_RE.test(nm)) return setError("Add your first and last name, like Jane Smith.");
    setBusy("join");
    setError(null);
    const r = await names<ClaimAnswer & { sent?: boolean }>({ op: "join", t: token, email: em, name: nm, ref: refCode ?? undefined });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      if (MEMBER_RE.test(r.error)) setMode("signin");
      return;
    }
    if (r.sent) return setMode("sent");
    const fresh = await fetchInfo();
    if (fresh) setInfo(fresh);
    // Joined: the seat is theirs, or their claim waits for an admin. A claim that couldn't go through says why.
    setDone(r.claimed || r.waiting ? settled(r, fresh) : { title: "You're in", text: r.message ?? "" });
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = link.trim();
    if (!v) return setError("Paste the whole sign-in link we sent you.");
    setBusy("link");
    setError(null);
    const r = await post({ signIn: v });
    if (r.error) {
      setBusy(null);
      return setError(r.error);
    }
    const fresh = await fetchInfo();
    if (fresh) setInfo(fresh);
    setBusy(null);
    setMode("ask");
    // Their seat to claim, or (an invite) theirs already: the claim connects them with whoever sent the link.
    if (fresh?.status === "open" || (refCode && fresh?.status === "yours")) await claim();
  };

  const emailMe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setError(em ? "That doesn't look like an email address. Check it for a typo." : "Type your email first.");
    setBusy("email");
    setError(null);
    const r = await names({ op: "email", t: token, email: em, ref: refCode ?? undefined });
    setBusy(null);
    if (r.error) return setError(r.error);
    setMode("sent");
  };

  const typeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = code.replace(/\D/g, "");
    if (v.length !== 6) return setError("Type the 6 digits from the email.");
    setBusy("code");
    setError(null);
    const r = await post({ signInCode: { email: email.trim(), code: v } });
    if (r.error) {
      setBusy(null);
      return setError(r.error);
    }
    const fresh = await fetchInfo();
    if (fresh) setInfo(fresh);
    setBusy(null);
    if (fresh?.status === "open" || (refCode && fresh?.status === "yours")) await claim();
    else setMode("ask");
  };

  const nameOff = async (op: "notme" | "remove") => {
    if (busy) return;
    setBusy(op);
    setError(null);
    const r = await names<{ message?: string; done?: boolean }>({ op, t: token });
    setBusy(null);
    if (r.error) return setError(r.error);
    const fresh = await fetchInfo();
    if (fresh) setInfo(fresh);
    setDone({ title: op === "remove" ? (r.done ? "Your name is off" : "Nothing to take off") : "Thanks for telling us", text: r.message ?? "" });
  };

  const supportHref = support ? `mailto:${support}?subject=${encodeURIComponent("My seat on Merlin")}` : null;
  const err = error ? (
    <p className="cl-err" role="alert">
      {error}
    </p>
  ) : null;

  let body: React.ReactNode;
  if (done) {
    body = (
      <>
        <span className="cl-done" aria-hidden>
          <IconCheck size={20} />
        </span>
        <h1 className="cl-h" ref={head} tabIndex={-1}>
          {done.title}
        </h1>
        <p className="cl-p">{done.text}</p>
        <a className="btn btn-pine btn-lg cl-wide" href={done.messages ? "/?p=messages" : done.seats ? "/?p=seats" : "/"}>
          {done.messages ? "Open Messages" : done.seats ? "Open Your seats" : "Open Merlin"}
        </a>
      </>
    );
  } else if (!info) {
    body = (
      <>
        <h1 className="cl-h">We couldn&apos;t open this link just now</h1>
        <p className="cl-p">Merlin may be busy for a moment. Try again in a few minutes.</p>
        <button type="button" className="btn btn-pine btn-lg cl-wide" onClick={() => window.location.reload()}>
          Try again
        </button>
      </>
    );
  } else if (info.status === "open" && info.person && info.person.seats.length > 1) {
    body = (
      <Activate
        token={token}
        info={info}
        refCode={refCode}
        onInfo={async () => {
          const fresh = await fetchInfo();
          if (fresh) setInfo(fresh);
        }}
        onDone={setDone}
      />
    );
  } else if (info.status === "invalid" || !info.seat) {
    body = (
      <>
        <h1 className="cl-h">That link didn&apos;t work</h1>
        <p className="cl-p">It may be cut short, or the seat it pointed to is gone. Open the whole link from the message, or have a look around Merlin.</p>
        <a className="btn btn-pine btn-lg cl-wide" href="/">
          Open Merlin
        </a>
      </>
    );
  } else if (info.status === "yours") {
    body = (
      <>
        <h1 className="cl-h">This is your seat</h1>
        <p className="cl-seat">{seatLine(info.seat)}</p>
        <p className="cl-p">It&apos;s on Your seats, where you can fill in what&apos;s missing. Each answer earns a credit.</p>
        <a className="btn btn-pine btn-lg cl-wide" href="/?p=seats">
          Open Your seats
        </a>
      </>
    );
  } else if (info.status === "waiting") {
    body = (
      <>
        <h1 className="cl-h">We&apos;re checking your claim</h1>
        <p className="cl-seat">{seatLine(info.seat)}</p>
        <p className="cl-p">You said this seat is yours, and an admin is checking it. Your name goes on it once they agree.</p>
        <a className="btn btn-lg cl-wide" href="/">
          Open Merlin
        </a>
      </>
    );
  } else if (info.status === "held") {
    body = (
      <>
        <h1 className="cl-h">This seat is already claimed</h1>
        <p className="cl-seat">{seatLine(info.seat)}</p>
        <p className="cl-p">
          A member holds it on Merlin now.{" "}
          {supportHref ? (
            <>
              If it&apos;s yours, write to <a href={supportHref}>{support}</a> and we&apos;ll sort it out.
            </>
          ) : (
            "If it's yours, write to us and we'll sort it out."
          )}
        </p>
        <a className="btn btn-lg cl-wide" href="/">
          Open Merlin
        </a>
      </>
    );
  } else {
    const signedIn = !!info.me;
    // On file under a member who has never signed in: if it's theirs, signing in is all it takes.
    const holder = info.status === "signin";
    body = (
      <>
        {info.inviter && <p className="cl-from">{info.inviter} sent you this link.</p>}
        <h1 className="cl-h">Is this your seat?</h1>
        <p className="cl-seat">{seatLine(info.seat)}</p>
        {holder ? (
          <p className="cl-p">
            It&apos;s on Merlin already, under the name of the fractional who held it. If that&apos;s you, sign in and it&apos;s yours to fill in.
            {info.inviter ? ` Signing in connects you with ${info.inviter} as referral partners.` : ""}
          </p>
        ) : (
          <p className="cl-p">
            Merlin is a data exchange for fractional operators, run by Revenue Nomad. Claim your seat and it&apos;s yours there.{" "}
            {signedIn ? "Fill in what you know and each answer earns a credit." : `You start with ${starter} credits to see who held other seats, what clients paid and which roles are open now.`}
            {info.inviter
              ? signedIn
                ? ` Claiming it connects you with ${info.inviter} as referral partners.`
                : ` Claiming it connects you with ${info.inviter} as referral partners, and if you're new to Merlin you both get ${REFERRAL_BONUS} credits.`
              : ""}
          </p>
        )}
        {mode === "sent" ? (
          <div className="cl-box" role="status">
            <p className="cl-box-h">Check your inbox</p>
            <p className="cl-p cl-p-flush">
              We sent a link to <span className="mono">{email}</span>. Open it and the seat is yours. It works once, for 20 minutes, and it sometimes lands in spam.
            </p>
            <form className="cl-form" onSubmit={typeCode} noValidate>
              <label className="cl-label" htmlFor={`${id}-code`}>
                Opening it on another device? Type the 6-digit code from the email here
              </label>
              <input id={`${id}-code`} className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              {err}
              <button type="submit" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "code" || busy === "claim"}>
                {busy === "code" || busy === "claim" ? "Claiming" : "Claim it"}
              </button>
            </form>
          </div>
        ) : mode === "join" ? (
          <form className="cl-form" onSubmit={join} noValidate>
            <label className="cl-label" htmlFor={`${id}-email`}>
              Your email
            </label>
            <input id={`${id}-email`} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@yourfirm.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="cl-label" htmlFor={`${id}-name`}>
              Your first and last name
            </label>
            <input id={`${id}-name`} className="input" autoComplete="name" placeholder="Jane Smith" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="cl-help">Use the name you work under. Other members see it on your seat, and never your email.</p>
            {err}
            <button type="submit" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "join"}>
              {busy === "join" ? "Joining" : info.email ? "Email me my link" : "Join and claim it"}
            </button>
            <button type="button" className="cl-link" onClick={() => (setMode("signin"), setError(null))}>
              Already on Merlin? Sign in
            </button>
          </form>
        ) : mode === "signin" ? (
          <div className="cl-form">
            {info.email && (
              <form className="cl-form" onSubmit={emailMe} noValidate>
                <label className="cl-label" htmlFor={`${id}-semail`}>
                  Your email
                </label>
                <input id={`${id}-semail`} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@yourfirm.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "email"}>
                  {busy === "email" ? "Sending" : "Email me a sign-in link"}
                </button>
              </form>
            )}
            <form className="cl-form" onSubmit={signIn} noValidate>
              <label className="cl-label" htmlFor={`${id}-link`}>
                {info.email ? "Or paste your personal sign-in link" : "Paste your personal sign-in link"}
              </label>
              <input id={`${id}-link`} className="input mono" inputMode="url" autoComplete="off" autoCapitalize="none" placeholder="The link from your welcome email" value={link} onChange={(e) => setLink(e.target.value)} />
              {err}
              <button type="submit" className={`btn btn-lg cl-wide${info.email ? "" : " btn-pine"}`} disabled={!!busy} aria-busy={busy === "link" || busy === "claim"}>
                {busy === "link" || busy === "claim" ? "Signing in" : holder ? "Sign in" : "Sign in and claim it"}
              </button>
            </form>
            {holder ? (
              <div className="cl-row cl-row-quiet">
                <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "notme"} onClick={() => void nameOff("notme")}>
                  Not me
                </button>
              </div>
            ) : (
              <button type="button" className="cl-link" onClick={() => (setMode("join"), setError(null))}>
                New to Merlin? Join free
              </button>
            )}
          </div>
        ) : mode === "remove" ? (
          <div className="cl-box" role="group" aria-label="Remove my name">
            <p className="cl-box-h">Take your name off this seat?</p>
            <p className="cl-p cl-p-flush">It comes off for everyone at once, and the seat shows nobody named. You don&apos;t need an account.</p>
            {err}
            <div className="cl-row">
              <button type="button" className="btn btn-lg cl-red" disabled={!!busy} aria-busy={busy === "remove"} onClick={() => void nameOff("remove")}>
                {busy === "remove" ? "Removing" : "Remove my name"}
              </button>
              <button type="button" className="btn btn-lg btn-ghost" onClick={() => setMode("ask")}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <>
            {err}
            {signedIn ? (
              <>
                <button type="button" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "claim" || busy === "signin"} onClick={() => void claim()}>
                  {busy === "claim" ? "Claiming" : busy === "signin" ? "Signing you in" : "Claim it"}
                </button>
                <p className="cl-help cl-center">Signed in as {info.me!.first}.</p>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-pine btn-lg cl-wide" disabled={!!busy} aria-busy={busy === "signin"} onClick={() => (setMode("join"), setError(null))}>
                  {busy === "signin" ? "Signing you in" : "Claim it, join free"}
                </button>
                <button type="button" className="cl-link" onClick={() => (setMode("signin"), setError(null))}>
                  Already on Merlin? Sign in
                </button>
              </>
            )}
            <div className="cl-row cl-row-quiet">
              <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "notme"} onClick={() => void nameOff("notme")}>
                Not me
              </button>
              {info.seat.named && (
                <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => (setMode("remove"), setError(null))}>
                  Remove my name
                </button>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="cl">
      <header className="cl-top">
        <a className="cl-brand" href="/" aria-label="Merlin, by Revenue Nomad">
          <Brand dark size={36} />
        </a>
      </header>
      <main className="cl-main">
        <section className="cl-card" aria-live="polite">
          {body}
        </section>
        <p className="cl-foot">
          Is your name on another seat? <a href="/remove">Remove my name</a>
        </p>
      </main>
    </div>
  );
}
