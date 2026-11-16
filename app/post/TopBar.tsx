"use client";

/**
 * Pine top bar: brand, search, credits pill, earn meter, "Add what you know", avatar menu.
 * Every number here (the balance, "0 of 25 today", the ledger) is the text face with tabular
 * figures, never mono.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LedgerRow, Me } from "@/lib/tableTypes";
import { Brand, IconPlus, IconSearch, IconX, IconMenu, initials, timeAgo } from "../ui/shared";
import { atTime, plural } from "./hooks";
import { ledgerLine } from "./ledger";
import { Anchored } from "./ui";

/**
 * The balance. At 3 or fewer it turns ember, unless `quiet`: the next-move card is on the page
 * and already says so, and a screen carries one urgent thing at a time.
 */
export function CreditsPill({ me, onClick, btnRef, quiet }: { me: Me; onClick: () => void; btnRef?: RefObject<HTMLButtonElement | null>; quiet?: boolean }) {
  const low = me.credits <= 3 && !quiet;
  const [delta, setDelta] = useState<{ n: number; id: number } | null>(null);
  const prev = useRef(me.credits);
  useEffect(() => {
    const d = me.credits - prev.current;
    prev.current = me.credits;
    if (!d) return;
    const id = Date.now();
    setDelta({ n: d, id });
    const t = setTimeout(() => setDelta((x) => (x?.id === id ? null : x)), 1400);
    return () => clearTimeout(t);
  }, [me.credits]);
  return (
    <button
      ref={btnRef}
      type="button"
      className={`tp-credits${low ? " low" : ""}`}
      onClick={onClick}
      aria-label={`You have ${plural(me.credits, "credit")}. Show where they came from.`}
      title={me.credits <= 3 ? "You're running low. Add a fact you know and you earn a credit." : undefined}
    >
      <span className="num tp-credits-n">{me.credits}</span>
      <span className="tp-credits-l">credit{me.credits === 1 ? "" : "s"}</span>
      {delta && (
        <span key={delta.id} className={`tp-delta${delta.n > 0 ? " up" : " down"}`} aria-hidden>
          {delta.n > 0 ? `+${delta.n}` : `−${-delta.n}`}
        </span>
      )}
    </button>
  );
}

export function EarnMeter({ me, onClick, compact }: { me: Me; onClick: () => void; compact?: boolean }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const pct = Math.min(100, (me.earned24h / me.earnCap) * 100);
  return (
    <button
      type="button"
      className={`tp-meter${capped ? " capped" : ""}`}
      onClick={onClick}
      title={capped ? `You've earned today's ${me.earnCap} credits. You can earn again ${atTime(me.earnResetsAt)}.` : `You've earned ${me.earned24h} of the ${me.earnCap} credits you can earn in 24 hours.`}
    >
      <span className="tp-meter-text num">
        {capped && !compact && me.earnResetsAt ? (
          <>Earn again {atTime(me.earnResetsAt)}</>
        ) : (
          <>
            <b>{capped ? me.earnCap : me.earned24h}</b> of {me.earnCap}
            {compact ? "" : " today"}
          </>
        )}
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
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  return (
    <Anchored anchor={anchor} onClose={onClose} width={340} className="tp-credpop" align="end">
      <div className="tp-credpop-top">
        <div>
          <div className={`tp-credpop-n num${me.credits <= 3 ? " low" : ""}`}>{me.credits}</div>
          <div className="tp-credpop-l">{me.credits === 1 ? "credit" : "credits"} to spend</div>
        </div>
        <div className="tp-credpop-earn">
          <div className="tp-credpop-l">Earned today</div>
          <div className="num tp-credpop-e">
            <b>{me.earned24h}</b> <span className="muted">of {me.earnCap}</span>
          </div>
          <div className={`tp-bar${capped ? " capped" : ""}`}>
            <span style={{ width: `${Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
          </div>
        </div>
      </div>
      <p className="tp-credpop-rules">
        {capped
          ? `You've earned today's ${me.earnCap} credits. You can earn again ${atTime(me.earnResetsAt)}. The credits you have still unlock facts.`
          : `Add a fact you know and you earn a credit, up to ${me.earnCap} a day. Spend a credit to see one someone else added.`}
      </p>
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

export function AvatarMenu({
  me,
  anchor,
  onClose,
  items,
}: {
  me: Me;
  anchor: HTMLElement;
  onClose: () => void;
  items: { label: string; onClick: () => void; hint?: string }[];
}) {
  return (
    <Anchored anchor={anchor} onClose={onClose} width={260} className="tp-menu" align="end">
      <div className="tp-menu-me">
        <div className="tp-menu-name">{me.name}</div>
        <div className="muted tp-small num">
          {me.function ? `${me.function} · ` : ""}
          {plural(me.added, "fact")} added
        </div>
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
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
}) {
  const [searchOpen, setSearchOpen] = useState(false);
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
              <button ref={menuRef} type="button" className="tp-iconbtn" aria-label="Menu" onClick={onMenu}>
                <IconMenu />
              </button>
            </div>
          </>
        )}
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
        <button ref={menuRef} type="button" className="tp-avatar" aria-label="Your account" title="Your account" onClick={onMenu}>
          {initials(me.name)}
        </button>
      </div>
    </header>
  );
}
