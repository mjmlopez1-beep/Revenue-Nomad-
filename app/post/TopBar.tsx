"use client";

/**
 * Pine top bar: brand, search, credits pill, earn meter, "Add what you know", avatar menu.
 * Every number here (the balance, "Earned 11 of 25 today", the ledger) is the text face with
 * tabular figures, never mono.
 *
 * Also here, because the top bar is always on screen: "Questions and feedback" (the help sheet,
 * from the account menu or the ? key) and the Undo toast's host.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject, Fragment } from "react";
import type { LedgerRow, Me, View } from "@/lib/tableTypes";
import { Brand, IconCoin, IconPlus, IconSearch, IconX, IconMenu, initials, timeAgo, useToast } from "../ui/shared";
import { atTime, copyText, plural } from "./hooks";
import { ledgerLine, owedLine, unlockLimitLine } from "./ledger";
import { Anchored, Sheet, UndoHost, owedText } from "./ui";
import { UNLOCKS_LEFT_TIP, unlocksLeft, unlocksLeftWords } from "./display";
import { Questions } from "../landing/Questions";
import { mailto } from "../landing/contact";

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
      : "Without it there is no way back in yet, so keep it somewhere safe, like your notes or password manager.";

/**
 * The balance. At 3 or fewer it turns ember, unless `quiet`: the next-move card is on the page
 * and already says so, and a screen carries one urgent thing at a time. A change in the balance
 * is read out ("24 credits") for screen readers.
 *
 * When the day's unlock limit binds before the balance (Me.unlocksLeft below credits, an account's
 * first day most of all), a second line says so: "25 unlocks left today" ("25 unlocks today" on
 * the narrowest phones), so the wall is never a surprise. `unlockTip` says why, in its tooltip.
 */
export function CreditsPill({
  me,
  onClick,
  btnRef,
  quiet,
  unlockTip,
}: {
  me: Me;
  onClick: () => void;
  btnRef?: RefObject<HTMLButtonElement | null>;
  quiet?: boolean;
  /** Why the limit binds today (ledger.ts unlockLimitLine): the tooltip beside "25 unlocks left today". */
  unlockTip?: string | null;
}) {
  const low = me.credits <= 3 && !quiet;
  const owed = me.owed ?? 0;
  const left = unlocksLeft(me);
  const leftWords = unlocksLeftWords(me);
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
        className={`tp-credits${low ? " low" : ""}${leftWords ? " has-cap" : ""}`}
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-label={`You have ${plural(me.credits, "credit")}${owed > 0 ? ` and owe ${owed}` : ""}${leftWords ? `, ${leftWords.charAt(0).toLowerCase()}${leftWords.slice(1)}` : ""}. Show where they came from.`}
        title={
          owed > 0
            ? owedText(owed)
            : me.credits <= 0
              ? "You're out of credits. Add a fact you know and you earn one."
              : me.credits <= 3
                ? "You're running low. Add a fact you know and you earn a credit."
                : leftWords
                  ? (unlockTip ?? UNLOCKS_LEFT_TIP)
                  : undefined
        }
      >
        {/* One line: the balance. With the day's limit binding, a second line under it (the pill then stacks the two). */}
        <span className="tp-credits-top">
          <span className="tp-credits-i" aria-hidden>
            <IconCoin size={14} />
          </span>
          <span className="num tp-credits-n">{me.credits}</span>
          <span className="tp-credits-l">credit{me.credits === 1 ? "" : "s"}</span>
        </span>
        {left !== null && (
          <span className="tp-credits-cap" aria-hidden>
            {left === 0 ? "No unlocks" : <><span className="num">{left}</span> {left === 1 ? "unlock" : "unlocks"}</>}
            <span className="tp-credits-cap-left"> left</span> today
          </span>
        )}
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
 * earned (an empty slot of the same width), so a new member never reads it as credits used. At the limit the bar is full and the
 * time earning opens again is in the title and the credits popover, so the bar keeps its width.
 */
export function EarnMeter({ me, onClick, compact }: { me: Me; onClick: () => void; compact?: boolean }) {
  const capped = capOf(me);
  // Nothing earned yet: the meter's slot stays, empty, so the search beside it does not jump on the first credit earned.
  if (!capped && me.earned24h <= 0) return <span className="tp-meter tp-meter-slot" aria-hidden />;
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
  // The same lines as Your credits (ledger.ts), so the two never say different things. Day one is read from the ledger.
  const owed = owedLine(me.owed);
  const unlocks = unlockLimitLine(me, ledger);
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
        {owed && <p className="tp-credpop-warn">{owed}</p>}
        {unlocks && <p>{unlocks}</p>}
        {!capped && me.sellEarnLeft === 0 && <p>Answers for a company&apos;s industry, size, revenue or how they sell earn no more credits today. An HQ, a website, a person or a fact on your own seat still earns.</p>}
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
 * Questions only a signed-in member asks. The rest are the landing page's own (Questions in
 * app/landing/Questions.tsx), rendered here as they are, so the two never say different things.
 */
const APP_HELP: [string, string][] = [
  [
    "Can I take back something I added?",
    "A fact you add in the table or a record shows Undo for 10 seconds, and the credit goes back too. After that you can edit it from the company's record. A seat or person you add through Add what you know can be edited from the company's record.",
  ],
];

const KEYS: [string, string][] = [
  ["/", "Search"],
  ["Ctrl K", "Search, from anywhere"],
  ["F", "Show or hide the filters"],
  ["A", "Add what you know"],
  ["J  K", "Next and previous record, with a record open"],
  ["Esc", "Close what is on top"],
  ["?", "This list"],
];

export function HelpSheet({ me, contact, emailOn, starter, onClose }: { me: Me; contact?: Contact; emailOn?: boolean; starter?: number; onClose: () => void }) {
  const toast = useToast();
  const support = contact?.support?.trim() || null;
  const write = support ? mailto(support, "Merlin feedback") : null;
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
        {/* The landing page's questions; the email line is in "Tell us what to fix" below. */}
        <Questions starter={starter ?? 25} support={null} />
        <div className="lp-faq tp-help-more">
          {APP_HELP.map(([q, a]) => (
            <details key={q} className="lp-qa">
              <summary>
                <span>{q}</span>
                <span className="lp-qa-icon" aria-hidden />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
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
            {write ? (
              <a className="mono" href={write}>
                {support}
              </a>
            ) : (
              <span className="mono">{support}</span>
            )}{" "}
            and a person reads it.
          </p>
          {write && (
            <div>
              <a className="btn btn-sm btn-pine" href={write}>
                Email the Merlin team
              </a>
            </div>
          )}
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
function HelpHost({ me, contact, emailOn, starter }: { me: Me; contact?: Contact; emailOn?: boolean; starter?: number }) {
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
  return open ? <HelpSheet me={me} contact={contact} emailOn={emailOn} starter={starter} onClose={() => setHelp(false)} /> : null;
}

/* ---------- the account menu ---------- */

export interface MenuItem {
  label: string;
  onClick: () => void;
  hint?: string;
  /** The page the member is on (the table, from the menu's first item). */
  current?: boolean;
  /** A switch: on or off (an admin's "See it as a member"). */
  checked?: boolean;
  /** A count that needs the member (unread messages). Shown as a badge when above 0. */
  badge?: number;
  /** The section it sits in. A small heading shows where the section changes. */
  group?: string;
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
          {me.title && me.title !== "Member" ? `${me.title} · ` : me.function ? `${me.function} · ` : ""}
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
          {list.map((it, i) => (
            <Fragment key={it.label}>
            {it.group && it.group !== list[i - 1]?.group && (
              <div className={`tp-menu-group${i ? " sep" : ""}`} role="presentation">
                {it.group}
              </div>
            )}
            <button
              type="button"
              role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={it.checked === undefined ? undefined : it.checked}
              aria-current={it.current ? "page" : undefined}
              className={`tp-menu-item${it.checked ? " on" : ""}${it.current ? " here" : ""}`}
              onClick={() => {
                it.onClick();
                onClose();
              }}
            >
              <span>{it.label}</span>
              {it.hint && <span className="tp-menu-hint num">{it.hint}</span>}
              {!!it.badge && (
                <span className="tp-badge num" aria-label={`${it.badge} unread`}>
                  {it.badge}
                </span>
              )}
            </button>
            </Fragment>
          ))}
          <div className="tp-menu-sep" role="separator" />
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

/** A speech bubble, for Messages. */
const IconChat = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

/**
 * Messages, in the bar itself, with the unread count, so a member who was written to sees it at
 * once. On a phone it shows only while something is unread (the menu has Messages too).
 */
function MessagesBtn({ unread, onClick, here }: { unread: number; onClick: () => void; here?: boolean }) {
  return (
    <button
      type="button"
      className={`tp-iconbtn tp-has-badge tp-msgbtn${unread ? " on" : ""}`}
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      aria-current={here ? "page" : undefined}
      title={unread ? `${unread} unread ${unread === 1 ? "conversation" : "conversations"}` : "Messages"}
      onClick={onClick}
    >
      <IconChat />
      {unread > 0 && (
        <span className="tp-badge tp-badge-dot num" aria-hidden>
          {unread}
        </span>
      )}
    </button>
  );
}

export function TopBar({
  me,
  query,
  setQuery,
  onSearchEnter,
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
  starter,
  listSwitch,
  searchInList,
  unread = 0,
  onMessages,
  onMessagesPage,
  unlockTip,
}: {
  me: Me;
  query: string;
  setQuery: (q: string) => void;
  /** Enter in the search: look the text up as a company's exact name or website. */
  onSearchEnter?: () => void;
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
  /** View.stats.starter: the credits a new member starts with, for the help sheet's answers. */
  starter?: number;
  /** Phones, on the table: what to list (Companies, Seats, People), as the list's title after the mark. */
  listSwitch?: ReactNode;
  /** Phones, on the table: the search is a field at the top of the list, so the bar has no search of its own. */
  searchInList?: boolean;
  /** Conversations with something unread: the count on the Messages button (or on the avatar, without one). */
  unread?: number;
  /** Open Messages. With it the bar has its own Messages button. */
  onMessages?: () => void;
  /** The Messages page is open. */
  onMessagesPage?: boolean;
  /** Why the day's unlock limit binds (ledger.ts unlockLimitLine), for the credits pill's tooltip. */
  unlockTip?: string | null;
}) {
  const msgBtn = !!onMessages;
  const [searchOpen, setSearchOpen] = useState(false);
  const hosts = (
    <>
      <HelpHost me={me} contact={contact} emailOn={emailOn} starter={starter} />
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
        placeholder={phone ? "Search" : "Search companies, seats and people"}
        aria-label="Search companies, seats and people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearchEnter?.();
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
          <kbd className="tp-kbd" title="Press / or Ctrl K to search">
            /
          </kbd>
        ))}
    </label>
  );
  if (phone) {
    const open = !searchInList && (searchOpen || !!query);
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
            <button type="button" className="tp-brand tp-brand-phone" onClick={onHome} aria-label="Merlin home">
              <Brand dark size={32} className="tp-brand-wm" />
              <Brand dark size={30} kind="mark" className="tp-brand-mark" />
            </button>
            {listSwitch}
            <div className="tp-top-right">
              {!searchInList && (
                <button type="button" className="tp-iconbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
                  <IconSearch size={18} />
                </button>
              )}
              <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} quiet={quietCredits} unlockTip={unlockTip} />
              {msgBtn && unread > 0 && <MessagesBtn unread={unread} onClick={onMessages!} here={onMessagesPage} />}
              {/* The main action on a phone is the labeled "Add what you know" at the foot of the list, in thumb reach. Pages reach it from the menu. */}
              <button ref={menuRef} type="button" className="tp-iconbtn tp-has-badge" aria-label={unread ? `Menu, ${unread} unread` : "Menu"} aria-haspopup="menu" aria-expanded={false} onClick={onMenu}>
                <IconMenu />
                {unread > 0 && !msgBtn && <span className="tp-badge tp-badge-dot num" aria-hidden>{unread}</span>}
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
      <button type="button" className="tp-brand" onClick={onHome} aria-label="Merlin home">
        <span className="tp-brand-logo">
          <Brand dark size={36} />
        </span>
      </button>
      <div className="tp-top-mid">{search}</div>
      <div className="tp-top-right">
        {/* The meter's slot is first, so with nothing earned yet its room is the gap after the search, not a hole between the balance and Add. */}
        <EarnMeter me={me} onClick={onCredits} />
        <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} quiet={quietCredits} unlockTip={unlockTip} />
        <button type="button" className="btn btn-primary tp-add-btn" onClick={onAdd} title="Add a seat, a rate or a hiring contact (A)">
          <IconPlus size={16} /> <span className="tp-add-long">Add what you know</span>
          <span className="tp-add-short">Add</span>
        </button>
        {msgBtn && <MessagesBtn unread={unread} onClick={onMessages!} here={onMessagesPage} />}
        <button
          ref={menuRef}
          type="button"
          className="tp-avatar tp-has-badge"
          aria-label={unread && !msgBtn ? `Your account, ${unread} unread` : "Your account"}
          aria-haspopup="menu"
          aria-expanded={false}
          title="Your account"
          onClick={onMenu}
        >
          {initials(me.name)}
          {unread > 0 && !msgBtn && <span className="tp-badge tp-badge-dot num" aria-hidden>{unread}</span>}
        </button>
      </div>
      {hosts}
    </header>
  );
}
