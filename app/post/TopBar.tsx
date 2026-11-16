"use client";

/**
 * Pine top bar: brand, search, credits pill, earn meter, "Add what you know", avatar menu.
 * Every number here (the balance, "Earned 11 of 25 today", the ledger) is the text face with
 * tabular figures, never mono.
 *
 * Also here, because the top bar is always on screen: "Questions and feedback" (the help sheet,
 * from the account menu or the ? key) and the Undo toast's host.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { LedgerRow, Me, View } from "@/lib/tableTypes";
import { Brand, IconPlus, IconSearch, IconX, IconMenu, initials, timeAgo, useToast } from "../ui/shared";
import { atTime, copyText, plural } from "./hooks";
import { ledgerLine } from "./ledger";
import { Anchored, Sheet, UndoHost, owedText } from "./ui";

/** Where to ask for help, from the server (View.contact). Either address can be missing. */
export type Contact = View["contact"] | null;

const capOf = (me: Me) => !!me.earnResetsAt || me.earned24h >= me.earnCap;
const signInLink = (token: string) => `${window.location.origin}/?k=${token}`;

/** What a member who loses their sign-in link can do, in one sentence. */
export const lostLinkText = (support: string | null | undefined, emailOn: boolean | undefined) =>
  support
    ? `If you lose it, email ${support} and we'll send it again.`
    : emailOn
      ? "If you lose it, ask for a new one by email on the sign-in screen."
      : "If you lose it, ask the member who invited you to send your link again.";

/**
 * The balance. At 3 or fewer it turns ember, unless `quiet`: the next-move card is on the page
 * and already says so, and a screen carries one urgent thing at a time. A change in the balance
 * is read out ("24 credits") for screen readers.
 */
export function CreditsPill({ me, onClick, btnRef, quiet }: { me: Me; onClick: () => void; btnRef?: RefObject<HTMLButtonElement | null>; quiet?: boolean }) {
  const low = me.credits <= 3 && !quiet;
  const owed = me.owed ?? 0;
  const [delta, setDelta] = useState<{ n: number; id: number } | null>(null);
  const [said, setSaid] = useState("");
  const prev = useRef(me.credits);
  useEffect(() => {
    const d = me.credits - prev.current;
    prev.current = me.credits;
    if (!d) return;
    const id = Date.now();
    setDelta({ n: d, id });
    setSaid(`${d > 0 ? `${plural(d, "credit")} added` : `${plural(-d, "credit")} spent`}. You have ${plural(me.credits, "credit")}.`);
    const t = setTimeout(() => setDelta((x) => (x?.id === id ? null : x)), 1400);
    return () => clearTimeout(t);
  }, [me.credits]);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`tp-credits${low ? " low" : ""}`}
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-label={`You have ${plural(me.credits, "credit")}${owed > 0 ? ` and owe ${owed}` : ""}. Show where they came from.`}
        title={owed > 0 ? owedText(owed) : me.credits <= 3 ? "You're running low. Add a fact you know and you earn a credit." : undefined}
      >
        <span className="num tp-credits-n">{me.credits}</span>
        <span className="tp-credits-l">credit{me.credits === 1 ? "" : "s"}</span>
        {delta && (
          <span key={delta.id} className={`tp-delta${delta.n > 0 ? " up" : " down"}`} aria-hidden>
            {delta.n > 0 ? `+${delta.n}` : `−${-delta.n}`}
          </span>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}

/**
 * What the member earned today, out of the daily limit: "Earned 11 of 25 today". Nothing at 0
 * earned, so a new member never reads it as credits used. At the limit the bar is full and the
 * time earning opens again is in the title and the credits popover, so the bar keeps its width.
 */
export function EarnMeter({ me, onClick, compact }: { me: Me; onClick: () => void; compact?: boolean }) {
  const capped = capOf(me);
  if (!capped && me.earned24h <= 0) return null;
  const pct = capped ? 100 : Math.min(100, (me.earned24h / me.earnCap) * 100);
  const n = capped ? me.earnCap : me.earned24h;
  return (
    <button
      type="button"
      className={`tp-meter${capped ? " capped" : ""}`}
      onClick={onClick}
      aria-label={capped ? `You've earned today's ${me.earnCap} credits. You can earn again ${atTime(me.earnResetsAt)}.` : `Earned ${n} of ${me.earnCap} credits today`}
      title={capped ? `You've earned today's ${me.earnCap} credits. You can earn again ${atTime(me.earnResetsAt)}.` : `You've earned ${n} of the ${me.earnCap} credits you can earn today.`}
    >
      <span className="tp-meter-text num">
        {compact ? "Earned " : "Earned "}
        <b>{n}</b> of {me.earnCap}
        {compact ? "" : " today"}
      </span>
      <span className="tp-meter-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

/** The unlock limit, when it binds before the balance does (Me.unlocksLeft). */
function unlockLine(me: Me): string | null {
  const left = me.unlocksLeft;
  if (typeof left !== "number" || left >= me.credits) return null;
  // On day one the limit is 25: everything unlocked so far was unlocked today.
  const dayOne = left + me.unlocked <= 25;
  if (left <= 0) return `You've used today's unlocks. Your ${plural(me.credits, "credit")} ${me.credits === 1 ? "is" : "are"} here tomorrow.${dayOne ? " New accounts can unlock 25 facts on day one." : ""}`;
  return `You can unlock ${plural(left, "more fact", "more facts")} today.${dayOne ? " New accounts can unlock 25 facts on day one." : ""}`;
}

export function CreditsPopover({
  me,
  ledger,
  anchor,
  onClose,
  onSeeAll,
}: {
  me: Me;
  ledger: LedgerRow[];
  anchor: HTMLElement;
  onClose: () => void;
  onSeeAll: () => void;
}) {
  const capped = capOf(me);
  const owed = me.owed ?? 0;
  const unlocks = unlockLine(me);
  return (
    <Anchored anchor={anchor} onClose={onClose} width={340} className="tp-credpop" align="end" label="Your credits">
      <div className="tp-credpop-top">
        <div>
          <div className={`tp-credpop-n num${me.credits <= 3 ? " low" : ""}`}>{me.credits}</div>
          <div className="tp-credpop-l">{me.credits === 1 ? "credit" : "credits"} to spend</div>
        </div>
        <div className="tp-credpop-earn">
          <div className="tp-credpop-l">Earned today</div>
          <div className="num tp-credpop-e">
            <b>{capped ? me.earnCap : me.earned24h}</b> <span className="muted">of {me.earnCap}</span>
          </div>
          <div className={`tp-bar${capped ? " capped" : ""}`} aria-hidden>
            <span style={{ width: `${capped ? 100 : Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="tp-credpop-rules">
        <p>
          {capped
            ? `You've earned today's ${me.earnCap} credits. You can earn again ${atTime(me.earnResetsAt)}. The credits you have still unlock facts.`
            : `Add a fact you know and you earn a credit, up to ${me.earnCap} a day. Spend a credit to see one someone else added.`}
        </p>
        {owed > 0 && <p className="tp-credpop-warn">{owedText(owed)}</p>}
        {unlocks && <p>{unlocks}</p>}
        {!capped && me.sellEarnLeft === 0 && <p>Answers for a company&apos;s industry, size, revenue or how they sell earn no more credits today. A role, a rate or who held a seat still earns.</p>}
      </div>
      <div className="tp-credpop-ledger">
        {ledger.length === 0 && <p className="muted tp-small">Nothing yet. Each credit you earn or spend is listed here.</p>}
        {ledger.slice(0, 5).map((l, i) => {
          const s = ledgerLine(l, me.earnCap);
          return (
            <div key={i} className="tp-lrow">
              <span className={`num tp-lrow-d${l.delta > 0 ? " up" : l.delta < 0 ? " down" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta < 0 ? `−${-l.delta}` : "0"}</span>
              <span className="tp-lrow-t" title={s.note ? `${s.text}. ${s.note}` : s.text}>
                {s.text}
              </span>
              <span className="tp-lrow-at num">{timeAgo(l.at)}</span>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn btn-sm tp-credpop-all" onClick={onSeeAll}>
        Open your credits
      </button>
    </Anchored>
  );
}

/* ---------- Questions and feedback ---------- */

const helpSubs = new Set<() => void>();
let helpOpen = false;
const setHelp = (on: boolean) => {
  helpOpen = on;
  helpSubs.forEach((f) => f());
};
/** Open the Questions and feedback sheet (the top bar renders it). */
export const openHelp = () => setHelp(true);

/**
 * The landing page's questions, said for a member who is signed in, with today's rules. Keep
 * them in step with the questions on the landing page (app/landing/Landing.tsx).
 */
const HELP: [string, string][] = [
  [
    "What will other members see about me?",
    "Your name and title show on seats you held, behind a lock that costs a member 1 credit. Members can also find you by name when they add a seat you held. Your email is never shown, and a fact you add never says who added it.",
  ],
  [
    "What happens to a rate I share?",
    "A rate you add to a seat sits behind a lock, and a member spends 1 credit to see it. It also counts in the rate benchmarks. Or share it for the benchmarks only. Then it counts in the medians and is never shown with your name or the seat. A median shows only once 5 different people have a rate in the group.",
  ],
  [
    "What does a credit buy?",
    "One fact someone else added: a role, a rate, who held a seat, or a hiring contact's name, email, phone or LinkedIn. A hidden company is one credit for the company, its open role and the job posting together. What you unlock stays unlocked for you.",
  ],
  [
    "Can I take back something I added?",
    "Yes, for 10 seconds. Press Undo on the message that says it was added, and the credit goes back too. After that you can edit it from the company's record.",
  ],
  [
    "What if something is wrong?",
    "Report it. It hides for you at once, and for everyone after a second report, until we review it. If we remove it, the member who added it loses that credit and everyone who unlocked it gets theirs back.",
  ],
  [
    "Why can I only earn 25 credits a day?",
    "So nobody has a reason to add guesses for credits. Answers for a company's industry, size, revenue and how they sell earn for 5 a day. Invite and confirmation bonuses count toward the 25, and a bonus that would take you past it waits until you have room.",
  ],
  ["Is there a limit on unlocking?", "Yes. A new account can unlock 25 facts on day one and 100 a day after that."],
  ["What does it cost?", "Nothing. The pilot is free. If you run low, add something you know or invite a fractional you trust."],
];

const KEYS: [string, string][] = [
  ["/", "Search"],
  ["F", "Show or hide the filters"],
  ["A", "Add what you know"],
  ["J  K", "Next and previous record, with a record open"],
  ["Esc", "Close what is on top"],
  ["?", "This list"],
];

export function HelpSheet({ me, contact, emailOn, onClose }: { me: Me; contact?: Contact; emailOn?: boolean; onClose: () => void }) {
  const toast = useToast();
  const support = contact?.support ?? null;
  const copy = async () => {
    const ok = await copyText(signInLink(me.token));
    toast(ok ? "Sign-in link copied. It signs in as you, so keep it to yourself." : "That didn't copy. Open Your credits and copy the link from there.", !ok);
  };
  return (
    // Opened from the account menu, whose item is gone by now: focus goes back to the menu button.
    <Sheet title="Questions and feedback" onClose={onClose} dialog className="tp-help" restore={() => document.querySelector<HTMLElement>(".tp-avatar, .tp-top [aria-label='Menu']")}>
      <section className="tp-help-sec" aria-labelledby="tp-help-q">
        <h3 id="tp-help-q" className="tp-help-h">
          Questions
        </h3>
        {HELP.map(([q, a]) => (
          <details key={q} className="tp-help-qa">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <section className="tp-help-sec" aria-labelledby="tp-help-link">
        <h3 id="tp-help-link" className="tp-help-h">
          Your sign-in link
        </h3>
        <p>
          There is no password. Your personal link signs you in, so keep it somewhere safe. {lostLinkText(support, emailOn)}
        </p>
        <div>
          <button type="button" className="btn btn-sm" onClick={copy}>
            Copy my sign-in link
          </button>
        </div>
      </section>
      {support && (
        <section className="tp-help-sec" aria-labelledby="tp-help-fb">
          <h3 id="tp-help-fb" className="tp-help-h">
            Tell us what to fix
          </h3>
          <p>
            A question, something that looks wrong, or an idea for the pilot. Email{" "}
            <a className="mono" href={`mailto:${support}`}>
              {support}
            </a>{" "}
            and a person reads it.
          </p>
          <div>
            <a className="btn btn-sm btn-pine" href={`mailto:${support}?subject=${encodeURIComponent("Trading Post feedback")}`}>
              Email the Trading Post team
            </a>
          </div>
        </section>
      )}
      <section className="tp-help-sec tp-help-keys" aria-labelledby="tp-help-k">
        <h3 id="tp-help-k" className="tp-help-h">
          Keyboard shortcuts
        </h3>
        <dl>
          {KEYS.map(([k, what]) => (
            <div key={k}>
              <dt>
                {k.split("  ").map((x) => (
                  <kbd key={x} className="tp-help-kbd">
                    {x}
                  </kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  );
}

/** The help sheet, mounted by the top bar. Opens from the menu, or with ? when focus is not in a field. */
function HelpHost({ me, contact, emailOn }: { me: Me; contact?: Contact; emailOn?: boolean }) {
  const open = useSyncExternalStore(
    (f) => (helpSubs.add(f), () => helpSubs.delete(f)),
    () => helpOpen,
    () => false,
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // Not while typing, and not over another overlay of ours (the record is fine).
      if (el?.closest("input, textarea, select, [contenteditable='true'], .tp-pop, .tp-sheet-wrap, .tp-modal-wrap")) return;
      e.preventDefault();
      openHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setHelp(false);
    };
  }, []);
  return open ? <HelpSheet me={me} contact={contact} emailOn={emailOn} onClose={() => setHelp(false)} /> : null;
}

/* ---------- the account menu ---------- */

export interface MenuItem {
  label: string;
  onClick: () => void;
  hint?: string;
}

/**
 * The account menu. A real menu: focus starts on the first item, Up and Down move, Tab or Esc
 * close it and focus goes back to the avatar. "Questions and feedback" opens the help sheet.
 * "Sign out" asks first while email sign-in is off, because the link is then the only way back.
 * Pass `onSignOut`; without it the item labeled "Sign out" in `items` is used.
 */
export function AvatarMenu({
  me,
  anchor,
  onClose,
  items,
  onSignOut,
  emailOn,
  contact,
}: {
  me: Me;
  anchor: HTMLElement;
  onClose: () => void;
  items: MenuItem[];
  onSignOut?: () => void | Promise<void>;
  /** View.email: sign-in links can be emailed. */
  emailOn?: boolean;
  contact?: Contact;
}) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const given = items.find((it) => it.label === "Sign out");
  const signOut = onSignOut ?? given?.onClick;
  const list = items.filter((it) => it !== given);
  useEffect(() => {
    if (asking) firstRef.current?.focus();
  }, [asking]);
  const out = async () => {
    setLeaving(true);
    await signOut?.();
    onClose();
  };
  const copy = async () => {
    const ok = await copyText(signInLink(me.token));
    toast(ok ? "Sign-in link copied. Keep it somewhere safe, then sign out." : "That didn't copy. Open Your credits and copy the link from there.", !ok);
  };
  return (
    <Anchored anchor={anchor} onClose={onClose} width={280} className="tp-menu" align="end" label="Your account">
      <div className="tp-menu-me" role="presentation">
        <div className="tp-menu-name">{me.name}</div>
        <div className="muted tp-small num">
          {me.function ? `${me.function} · ` : ""}
          {plural(me.added, "fact")} added
        </div>
      </div>
      {asking ? (
        <div className="tp-menu-ask" role="group" aria-label="Sign out?">
          <p className="tp-menu-ask-t">You need your sign-in link to come back. Copy it first.</p>
          <p className="tp-small muted">{lostLinkText(contact?.support, emailOn)}</p>
          <div className="tp-menu-ask-acts">
            <button ref={firstRef} type="button" role="menuitem" className="btn btn-sm btn-pine" onClick={copy}>
              Copy my link
            </button>
            <button type="button" role="menuitem" className="btn btn-sm" disabled={leaving} aria-busy={leaving} onClick={out}>
              {leaving ? "Signing out" : "Sign out"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {list.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="tp-menu-item"
              onClick={() => {
                it.onClick();
                onClose();
              }}
            >
              <span>{it.label}</span>
              {it.hint && <span className="tp-menu-hint num">{it.hint}</span>}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="tp-menu-item"
            onClick={() => {
              onClose();
              openHelp();
            }}
          >
            <span>Questions and feedback</span>
          </button>
          {signOut && (
            <>
              <div className="tp-menu-sep" role="separator" />
              <button type="button" role="menuitem" className="tp-menu-item" disabled={leaving} onClick={() => (emailOn ? out() : setAsking(true))}>
                <span>Sign out</span>
              </button>
            </>
          )}
        </>
      )}
    </Anchored>
  );
}

export function TopBar({
  me,
  query,
  setQuery,
  searchRef,
  phone,
  onCredits,
  creditsRef,
  onAdd,
  onMenu,
  menuRef,
  onHome,
  quietCredits,
  contact,
  emailOn,
}: {
  me: Me;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  phone: boolean;
  onCredits: () => void;
  creditsRef: RefObject<HTMLButtonElement | null>;
  onAdd: () => void;
  onMenu: () => void;
  menuRef: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
  /** The next-move card is on the page: a low balance stays in the bar's own colors. */
  quietCredits?: boolean;
  /** View.contact and View.email, for the help sheet. */
  contact?: Contact;
  emailOn?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const hosts = (
    <>
      <HelpHost me={me} contact={contact} emailOn={emailOn} />
      <UndoHost />
    </>
  );
  const search = (
    <label className={`tp-search${phone ? " tp-search-phone" : ""}`}>
      <IconSearch size={16} />
      <input
        ref={searchRef}
        className="tp-bare"
        type="search"
        placeholder={phone ? "Search" : "Search companies, functions, people"}
        aria-label="Search companies, functions and people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            e.currentTarget.blur();
            setSearchOpen(false);
          }
        }}
        autoFocus={phone && searchOpen}
      />
      {/* Phones close (and clear) search with the button next to the field. */}
      {!phone &&
        (query ? (
          <button type="button" className="tp-search-x" aria-label="Clear search" onClick={() => setQuery("")}>
            <IconX size={14} />
          </button>
        ) : (
          <kbd className="tp-kbd" title="Press / to search">
            /
          </kbd>
        ))}
    </label>
  );
  if (phone) {
    const open = searchOpen || !!query;
    return (
      <header className="tp-top tp-top-phone">
        {open ? (
          <>
            {search}
            <button type="button" className="tp-iconbtn" aria-label="Close search" onClick={() => (setQuery(""), setSearchOpen(false))}>
              <IconX />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="tp-brand tp-brand-phone" onClick={onHome} aria-label="Trading Post home">
              <span className="tp-mark">
                <Brand dark />
              </span>
              <span className="tp-wordmark">Trading Post</span>
            </button>
            <div className="tp-top-right">
              <button type="button" className="tp-iconbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
                <IconSearch size={18} />
              </button>
              <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} quiet={quietCredits} />
              <button type="button" className="tp-iconbtn tp-iconbtn-volt" aria-label="Add what you know" onClick={onAdd}>
                <IconPlus size={18} />
              </button>
              <button ref={menuRef} type="button" className="tp-iconbtn" aria-label="Menu" aria-haspopup="menu" aria-expanded={false} onClick={onMenu}>
                <IconMenu />
              </button>
            </div>
          </>
        )}
        {hosts}
      </header>
    );
  }
  return (
    <header className="tp-top">
      <button type="button" className="tp-brand" onClick={onHome} aria-label="Trading Post home">
        <span className="tp-brand-logo">
          <Brand dark />
        </span>
        <span className="tp-brand-div" aria-hidden />
        <span className="tp-wordmark">Trading Post</span>
      </button>
      <div className="tp-top-mid">{search}</div>
      <div className="tp-top-right">
        <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} quiet={quietCredits} />
        <EarnMeter me={me} onClick={onCredits} />
        <button type="button" className="btn btn-primary tp-add-btn" onClick={onAdd} title="Add a seat, a rate or a hiring contact (A)">
          <IconPlus size={16} /> <span className="tp-add-long">Add what you know</span>
          <span className="tp-add-short">Add</span>
        </button>
        <button ref={menuRef} type="button" className="tp-avatar" aria-label="Your account" aria-haspopup="menu" aria-expanded={false} title="Your account" onClick={onMenu}>
          {initials(me.name)}
        </button>
      </div>
      {hosts}
    </header>
  );
}
