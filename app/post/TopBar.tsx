"use client";

/** Pine top bar: brand, search, credits pill, earn meter, "Add what you know", avatar menu. */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LedgerRow, Me } from "@/lib/tableTypes";
import { Brand, IconPlus, IconSearch, IconX, IconMenu, initials, timeAgo } from "../ui/shared";
import { fmtTime, plural } from "./hooks";
import { Anchored } from "./ui";

export const REASON_LABEL: Record<string, string> = {
  fill: "Added",
  unlock: "Unlocked",
  refund: "Refund",
  reversal: "Removed fact",
  referral: "Invite bonus",
  confirm: "Confirmed by members",
};

export function CreditsPill({ me, onClick, btnRef }: { me: Me; onClick: () => void; btnRef?: RefObject<HTMLButtonElement | null> }) {
  const low = me.credits <= 3;
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
      aria-label={`${me.credits} credits. Open credits.`}
    >
      <span className="mono tp-credits-n">{me.credits}</span>
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
    <button type="button" className={`tp-meter${capped ? " capped" : ""}`} onClick={onClick} title="Credits earned in the last 24 hours">
      <span className="tp-meter-text">
        {capped ? (
          <>
            <span className="mono">{me.earnCap}</span> earned{compact ? "" : `, reopens ${fmtTime(me.earnResetsAt)}`}
          </>
        ) : (
          <>
            <span className="mono">{me.earned24h}</span> of <span className="mono">{me.earnCap}</span>
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
          <div className="tp-credpop-n mono">{me.credits}</div>
          <div className="tp-credpop-l">credits to spend</div>
        </div>
        <div className="tp-credpop-earn">
          <div className="tp-credpop-l">Earned today</div>
          <div className="mono tp-credpop-e">
            {me.earned24h} <span className="muted">/ {me.earnCap}</span>
          </div>
          <div className={`tp-bar${capped ? " capped" : ""}`}>
            <span style={{ width: `${Math.min(100, (me.earned24h / me.earnCap) * 100)}%` }} />
          </div>
        </div>
      </div>
      {capped && <p className="tp-credpop-cap">You earned today&apos;s {me.earnCap}. Earning reopens {fmtTime(me.earnResetsAt)}.</p>}
      <div className="tp-credpop-rules">
        <p>
          <span className="tp-plus mono">+1</span> Add a missing fact, earn 1. Up to {me.earnCap} a day.
        </p>
        <p>
          <span className="tp-minus mono">−1</span> Unlock a fact, spend 1.
        </p>
      </div>
      <div className="tp-credpop-ledger">
        {ledger.length === 0 && <p className="muted tp-small">No activity yet. Unlock or add a fact to start.</p>}
        {ledger.slice(0, 5).map((l, i) => (
          <div key={i} className="tp-lrow">
            <span className={`mono tp-lrow-d${l.delta > 0 ? " up" : l.delta < 0 ? " down" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta < 0 ? `−${-l.delta}` : "0"}</span>
            <span className="tp-lrow-t">
              {REASON_LABEL[l.reason] ?? l.reason} {l.reason !== "referral" && l.field ? l.field.toLowerCase() : ""}
              {l.company ? <span className="muted"> at {l.company}</span> : null}
            </span>
            <span className="tp-lrow-at mono">{timeAgo(l.at)}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm tp-credpop-all" onClick={onSeeAll}>
        My credits and invite link
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
        <div className="muted tp-small">
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
          {it.hint && <span className="tp-menu-hint">{it.hint}</span>}
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
        aria-label="Search"
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
      {query ? (
        <button type="button" className="tp-search-x" aria-label="Clear search" onClick={() => (setQuery(""), phone && setSearchOpen(false))}>
          <IconX size={14} />
        </button>
      ) : (
        !phone && <kbd className="tp-kbd">/</kbd>
      )}
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
              <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} />
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
        <CreditsPill me={me} onClick={onCredits} btnRef={creditsRef} />
        <EarnMeter me={me} onClick={onCredits} />
        <button type="button" className="btn btn-primary tp-add-btn" onClick={onAdd}>
          <IconPlus size={16} /> <span className="tp-add-long">Add what you know</span>
          <span className="tp-add-short">Add</span>
        </button>
        <button ref={menuRef} type="button" className="tp-avatar" aria-label="Account menu" onClick={onMenu}>
          {initials(me.name)}
        </button>
      </div>
    </header>
  );
}
