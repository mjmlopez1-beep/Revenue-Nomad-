"use client";

/**
 * Your network, everywhere it shows (lib/google): the page (You -> Your network), the record's
 * "Your way in", Crystal Ball's "You know someone" chip, the Google card on Integrations, the
 * Claude prompt, onboarding's prompt and Pilot metrics' counts. Each renders nothing with RN_GOOGLE
 * off. Everything here is the signed-in member's own: the server never sends anyone else's.
 */
import { ServiceIcon } from "../../ui/ServiceIcon";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconChevron, initials, timeAgo, useToast } from "../../ui/shared";
import { useCopy } from "../Credits";
import type { CoInfo } from "../model";
import type { Me } from "@/lib/tableTypes";
import { SOURCE_WORDS, WARMTH_RULES, goneWords, knowWords, type LinkView, type NetCompanyView, type NetPersonView, type NetSource, type NetworkView } from "@/lib/google/types";
import { NOTICE_WORDS, countsLine, daysAgo, firstName, load, monthYear, netAct, takeNotice, useNetCompany, useNetwork, type GoogleNotice } from "./useNetwork";
import { useUi } from "../ui";
import { WarmthChip } from "./parts";
import { Found, Mapping, ReadFailed } from "./Found";
import { Clients, Everyone, Introducers, TopNumbers, WarmPaths } from "./Paths";
import { NO_FILTER, setWords, topNumbers, type EveryoneFilter } from "./model";
import { HiddenPaths, LinkedInImport } from "./SmartPaths"; // [smart ways in]
import "./network.css";
import { PageHead } from "../../ui/system";
import { SendLaunch, SendPromise, draftKey, useSendOn } from "../send/Send";

const START = "/api/integrations/google/start";
const sources = (src: NetSource[]) => src.map((s) => SOURCE_WORDS[s]).join(", ");

/* ---------- small parts ---------- */

/** Google's icon wherever a Google prompt shows it: <ServiceIcon service="google" />, its G drawn until it loads. */
export function GoogleG({ size = 18 }: { size?: number }) {
  return <ServiceIcon service="google" size={size} />;
}

export { WarmthChip };

const Tick = () => (
  <svg className="nw-tick" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const Cross = () => (
  <svg className="nw-cross" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** What Merlin reads and what it never does: the same words on the page, the Integrations card and onboarding. */
export function ReadsList({ gmail = false }: { gmail?: boolean }) {
  return (
    <div className="nw-reads">
      <span className="nw-reads-h">What Merlin reads</span>
      <p>
        <Tick /> Who you meet with, and when, from your calendar
      </p>
      <p>
        <Tick /> Names, companies and titles in your contacts
      </p>
      <p>
        <Tick /> Meetings over months that look like a seat you held
      </p>
      {gmail && (
        <p>
          <Tick /> Gmail, if you add it: who you email and when, from the From, To and Date lines
        </p>
      )}
      <span className="nw-reads-sep" aria-hidden />
      <span className="nw-reads-h">What it never does</span>
      <p>
        <Cross /> {gmail ? "Read the subject or text of any email" : "Read your email"}
      </p>
      <p>
        <Cross /> Keep meeting titles, notes or guest lists
      </p>
      <p>
        <Cross /> Show your contacts to anyone else
      </p>
      <p>
        <Cross /> Change, send or delete anything
      </p>
    </div>
  );
}

function ConnectButton({ label = "Connect Google", href = START, onClick }: { label?: string; href?: string; onClick?: () => void }) {
  return onClick ? (
    <button type="button" className="btn btn-pine nw-connect" onClick={onClick}>
      <span className="nw-g" aria-hidden>
        <GoogleG />
      </span>
      {label}
    </button>
  ) : (
    <a className="btn btn-pine nw-connect" href={href}>
      <span className="nw-g" aria-hidden>
        <GoogleG />
      </span>
      {label}
    </a>
  );
}

/** The one line under each Connect Google: how Merlin uses Google data (the Privacy Policy's Google part). */
export function GooglePolicyLink() {
  return (
    <a className="nw-policy" href="/privacy#google">
      How Merlin uses your Google data
    </a>
  );
}

function Notice({ n, onClose }: { n: GoogleNotice | null; onClose: () => void }) {
  if (!n) return null;
  return (
    <div className={`in-notice${n === "connected" || n === "gmail" ? " ok" : ""}`} role="status">
      <p>{NOTICE_WORDS[n]}</p>
      <button type="button" className="btn btn-ghost in-notice-x" onClick={onClose} aria-label="Dismiss">
        OK
      </button>
    </div>
  );
}

const updated = (l: LinkView | null) => (l?.syncedAt ? `updated ${timeAgo(l.syncedAt)}` : "not read yet");

/** Disconnect and delete everything, with one "are you sure" step in place. */
function DeleteAll({ busy, onDone }: { busy: boolean; onDone?: () => void }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [working, setWorking] = useState(false);
  if (!ask)
    return (
      <button type="button" className="btn nw-danger" disabled={busy} onClick={() => setAsk(true)}>
        Disconnect and delete everything
      </button>
    );
  return (
    <div className="nw-confirm" role="group" aria-label="Delete everything?">
      <p>
        Merlin revokes its access at Google and deletes everything it kept about your network, what Claude saved included. Your pipeline keeps your deals and their stages, without
        the names and details that came from Google. This can&apos;t be undone.
      </p>
      <div className="nw-row">
        <button
          type="button"
          className="btn nw-danger-solid"
          aria-busy={working}
          disabled={working}
          onClick={async () => {
            setWorking(true);
            const r = await netAct("disconnect");
            setWorking(false);
            setAsk(false);
            toast(r.error ?? r.message ?? "Deleted.", !!r.error);
            if (!r.error) onDone?.();
          }}
        >
          {working ? "Deleting" : "Delete everything"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>
          Keep it
        </button>
      </div>
    </div>
  );
}

/* ---------- the Your network page ---------- */

/**
 * Your network answers "what do I do with this?", in this order: warm paths into companies likely
 * to hire you, your clients, people who can introduce you, then everyone (Paths.tsx). The four
 * numbers at the top are those four lists' lengths, and each opens its list.
 */
export function NetworkPage({
  infos, me, onBack, openCompany, onSeats, onClaude, onProfile, refresh, section,
}: {
  infos: CoInfo[];
  me: Me;
  onBack: () => void;
  openCompany: (id: string) => void;
  onSeats: () => void;
  onClaude: () => void;
  /** The member's profile (function, Ideal Fractional Profile). */
  onProfile: () => void;
  refresh: () => void;
  /** Opened at one of its parts (Crystal Ball's "Where you know someone", Home): its element id. */
  section?: string | null;
}) {
  const { view, off, failed } = useNetwork();
  const ui = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<GoogleNotice | null>(null);
  const [filter, setFilter] = useState<EveryoneFilter>(NO_FILTER);
  useEffect(() => setNotice(takeNotice()), []);
  /**
   * The connect moment (Found.tsx): "auto" the one time after connecting, until the member has
   * seen the result; "again" when they open it from the first number. `left`: they moved on, so it
   * doesn't open by itself again in this visit while the server's answer is on its way.
   */
  const [moment, setMoment] = useState<"auto" | "again" | null>(null);
  const left = useRef(false);
  const first = view?.first ?? null;
  const connected = !!view?.google && view.google.status !== "reconnect";
  useEffect(() => {
    if (connected && first && !first.seen && moment === null && !left.current) setMoment("auto");
  }, [connected, first, moment]);
  const read = !!view?.google?.syncedAt;
  // Once the result is on screen it has been shown: the server remembers, so it opens by itself only this once.
  const marked = useRef(false);
  useEffect(() => {
    if (moment !== "auto" || !read || view?.syncing || marked.current) return;
    marked.current = true;
    void netAct("seen-found");
  }, [moment, read, view?.syncing]);
  const go = (id: string) => {
    if (id === "nw-everyone") setFilter(NO_FILTER);
    // After the page has drawn: the part's heading at the top of the page's own scroll.
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };
  const leave = (to?: string) => {
    left.current = true;
    setMoment(null);
    if (to) go(to);
    else window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (off) onBack();
  }, [off, onBack]);
  // Opened at a part: go there once the network is here.
  const went = useRef(false);
  useEffect(() => {
    if (!section || !view || went.current || (moment && !left.current)) return;
    went.current = true;
    go(section);
  }, [section, view, moment]);
  // When a read finishes, the table picks up the companies it named for you.
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && view && !view.syncing) refresh();
    wasSyncing.current = !!view?.syncing;
  }, [view, refresh]);

  const companies = view?.companies ?? [];
  const nums = view ? topNumbers(view) : { warm: 0, clients: 0, intros: 0, people: 0 };
  // The seats that ended (an active one is under Your clients): confirmed in Your seats.
  const past = (view?.seats ?? []).filter((g) => !g.active);
  const people = nums.people;

  const run = async (key: string, op: Parameters<typeof netAct>[0]) => {
    setBusy(key);
    const r = await netAct(op);
    setBusy(null);
    toast(r.error ?? r.message ?? "Done.", !!r.error);
  };

  const g = view?.google ?? null;
  // The moment is on screen: while the first read runs, when it failed, or its result.
  const inMoment = !!view && connected && moment !== null;
  return (
    <div className={`page-wide nw-page${inMoment ? " nw-page-found" : ""}`}>
      {/* What Merlin found again is a step under Your network: its way back. Your network itself is a top-level page. */}
      {inMoment && moment === "again" ? (
        <button type="button" className="page-back" onClick={() => leave()}>
          <IconChevron dir="left" /> Your network
        </button>
      ) : null}
      {/* "Google is connected" is the moment's own first line. */}
      <Notice n={inMoment && notice === "connected" ? null : notice} onClose={() => setNotice(null)} />
      {!view ? (
        <p className="cr-note" role="status">
          {failed ? "We couldn't load your network. Refresh the page to try again." : "Loading your network…"}
        </p>
      ) : !g && !view.claude ? (
        <>
          <ConnectHero view={view} onClaude={onClaude} />
          {/* [smart ways in] the member's own LinkedIn connections work without Google too. */}
          <HiddenPaths infos={infos} openCompany={openCompany} google={false} />
          <LinkedInImport />
        </>
      ) : inMoment && view.syncing && (moment === "auto" || !read) ? (
        <Mapping view={view} />
      ) : inMoment && !read ? (
        <ReadFailed busy={busy === "sync"} onRetry={() => void run("sync", "sync")} onStay={() => leave()} />
      ) : inMoment ? (
        <Found
          view={view}
          infos={infos}
          fn={me.function}
          people={people}
          again={moment === "again"}
          onWarm={() => leave("nw-warm")}
          onStay={() => leave()}
          onClients={() => leave("nw-clients")}
          onProfile={() => (leave(), onProfile())}
          onAdd={() => (leave(), ui.openAdd())}
        />
      ) : (
        <>
          <span className="nw-status">
            {view.syncing ? "Mapping who you know…" : g ? `Google connected · read-only · ${updated(g)}` : `Saved from your Gmail via Claude · ${timeAgo(view.claude!.at)}`}
            {g?.syncedAt && g.status !== "reconnect" ? (
              <>
                {" · "}
                <button type="button" className="nw-link nw-link-sm" onClick={() => (setMoment("again"), window.scrollTo(0, 0))}>
                  What Merlin found
                </button>
              </>
            ) : null}
          </span>
          <PageHead
            className="nw-head"
            title={companies.length ? "Where you have a way in" : view.syncing ? "Your network" : "No one you know is at a company on Merlin yet"}
            lead={
              companies.length > 0 ? (
                <>
                  From your {g ? "calendar and contacts" : "Gmail, via your Claude"}: you know someone at {companies.length} {companies.length === 1 ? "company" : "companies"} on Merlin. Only you see this.
                </>
              ) : undefined
            }
          />
          {g?.status === "reconnect" && <Reconnect what="Google" note={goneNote("Google", g)} href={START} />}
          {view.gmail?.status === "reconnect" && g?.status !== "reconnect" && (
            <Reconnect what="Gmail" label="Reconnect Gmail (test access lasts 7 days)" note={goneNote("Gmail", view.gmail)} href={`${START}?gmail=1`} />
          )}
          {(companies.length > 0 || view.loose.length > 0) && (
            <>
              <TopNumbers n={nums} go={go} />
              <WarmPaths view={view} infos={infos} me={me} openCompany={openCompany} onProfile={onProfile} onClaude={onClaude} onEveryone={() => go("nw-everyone")} />
              <Clients view={view} infos={infos} me={me} />
              <Introducers view={view} me={me} onClaude={onClaude} />
              <Everyone view={view} openCompany={openCompany} filter={filter} setFilter={setFilter} />
            </>
          )}

          {/* [smart ways in] Your hidden paths, then the member's own LinkedIn connections (SmartPaths.tsx). */}
          <HiddenPaths infos={infos} openCompany={openCompany} google={!!g} />
          <LinkedInImport />

          {past.length > 0 && (
            <section className="tp-card nw-card" aria-labelledby="nw-seats-h">
              <h2 className="tp-card-h" id="nw-seats-h">
                {past.length === 1 ? "A seat you might have held" : `${past.length} seats you might have held`}
              </h2>
              <p className="nw-muted">Months of regular meetings that ended. If one was a seat, confirm it in Your seats in one click. Nothing is added until you do.</p>
              <ul className="nw-seats">
                {past.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <span className="nw-seat-t">{c.name}</span>
                    <span className="nw-muted">
                      {c.meetings} meetings · {monthYear(c.from)} to {monthYear(c.to)}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn nw-wide" onClick={onSeats}>
                Confirm in Your seats
              </button>
            </section>
          )}

          <Sources view={view} busy={busy} run={run} onClaude={onClaude} />

          <section className="tp-card nw-card" aria-labelledby="nw-keeps-h">
            <h2 className="tp-card-h" id="nw-keeps-h">
              What Merlin keeps, and how it judges
            </h2>
            {companies[0]?.people[0] ? <Keeps c={companies[0]} p={companies[0].people[0]} /> : null}
            <p className="nw-body">
              That&apos;s all of it: conclusions, never a meeting title, a note or the text of an email. Only you see your network. Other members never learn who you know,
              and it never feeds anyone else&apos;s counts.
            </p>
            <p className="nw-body">
              <b>Warmth.</b> {WARMTH_RULES}
            </p>
            <p className="nw-body">
              <b>Set aside.</b> A company is set aside when a title on your contacts reads like sales or recruiting, when it is a software company of over 1,000 people, when they
              sent every invite for a short burst of meetings with several of their people, or when it is a staffing firm or an investor (investors are under People who can introduce
              you). Each one says why, and Undo puts it back.
            </p>
            <div className="nw-row nw-wrap">
              {g && g.status !== "reconnect" && (
                <button type="button" className="btn" aria-busy={busy === "sync"} disabled={!!busy || view.syncing} onClick={() => void run("sync", "sync")}>
                  {view.syncing ? "Reading" : "Read again now"}
                </button>
              )}
              <DeleteAll busy={!!busy} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** "Google access was removed on <date>. Reconnect within 30 days or Merlin deletes what it read from Google on <date>." */
export function goneNote(what: "Google" | "Gmail", l: LinkView): string {
  return l.goneAt ? goneWords(what, l.goneAt, l.deleteOn ?? undefined) : `Reconnect within 30 days or Merlin deletes what it read from ${what}.`;
}

export function Reconnect({ what, label, note, href }: { what: string; label?: string; note: string; href: string }) {
  return (
    <div className="nw-reconnect" role="status">
      <span>
        <strong>{what} needs reconnecting.</strong> {note}
      </span>
      <a className="btn btn-sm" href={href}>
        {label ?? `Reconnect ${what}`}
      </a>
    </div>
  );
}

function ConnectHero({ view, onClaude }: { view: NetworkView; onClaude: () => void }) {
  return (
    <div className="nw-hero">
      <span className="nw-new">New · Your network</span>
      <PageHead
        className="nw-head"
        title="See where you already have a way in"
        lead="Connect your Google account and Merlin shows your warm paths into companies likely to hire you, the clients your calendar shows, and the people who can introduce you."
      />
      <ReadsList />
      {view.configured ? <ConnectButton /> : <p className="nw-muted">Google isn&apos;t set up on Merlin yet. Ask us to switch it on.</p>}
      <p className="nw-small">Read-only. Takes a minute or two to map. Disconnect and delete everything any time.</p>
      <GooglePolicyLink />
      <button type="button" className="nw-link" onClick={onClaude}>
        Rather keep it in Claude? Use your own Claude instead
      </button>
    </div>
  );
}

function Keeps({ c, p }: { c: NetCompanyView; p: NetPersonView }) {
  const name = firstName(p.name) ?? "this person";
  return (
    <>
      <p className="nw-muted">Everything Merlin keeps about {name}:</p>
      <dl className="nw-keeps">
        <div>
          <dt>Company</dt>
          <dd>{c.site ?? c.name}</dd>
        </div>
        {p.title && (
          <div>
            <dt>Title</dt>
            <dd>{p.title}</dd>
          </div>
        )}
        <div>
          <dt>Warmth</dt>
          <dd>{p.warmth}</dd>
        </div>
        <div>
          <dt>Meetings / emails</dt>
          <dd className="num">
            {p.meetings} / {p.emails}
          </dd>
        </div>
        {p.last && (
          <div>
            <dt>Last in touch</dt>
            <dd>{new Date(`${p.last}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</dd>
          </div>
        )}
        <div>
          <dt>From</dt>
          <dd>{sources(p.src)}</dd>
        </div>
      </dl>
    </>
  );
}

/** Where it came from: Google, Gmail (test members), Gmail via Claude, each with its own off switch. */
function Sources({ view, busy, run, onClaude }: { view: NetworkView; busy: string | null; run: (key: string, op: "sync" | "drop-gmail" | "forget-claude") => Promise<void>; onClaude: () => void }) {
  const g = view.google;
  return (
    <section className="tp-card nw-card" aria-labelledby="nw-src-h">
      <h2 className="tp-card-h" id="nw-src-h">
        Where it comes from
      </h2>
      <div className="nw-src">
        <span className="nw-g" aria-hidden>
          <GoogleG />
        </span>
        <span className="nw-src-t">
          <strong>Calendar and Contacts</strong>
          <span className="nw-muted">{g ? `${g.email || "Google"} · ${g.status === "reconnect" ? "needs reconnecting" : updated(g)}` : "Not connected"}</span>
        </span>
        {!g && view.configured && (
          <a className="btn btn-sm" href={START}>
            Connect
          </a>
        )}
      </div>
      {view.gmailOffered && (
        <div className="nw-src">
          <span className="nw-g" aria-hidden>
            <GoogleG />
          </span>
          <span className="nw-src-t">
            <strong>Gmail (test members)</strong>
            <span className="nw-muted">
              {view.gmail
                ? `${view.gmail.status === "reconnect" ? "Needs reconnecting" : updated(view.gmail)} · who you email and when, never a subject or a word of an email`
                : "Also add who you email and when: the From, To and Date lines only, never a subject or a word of an email. Test access lasts 7 days, then you reconnect."}
            </span>
          </span>
          {view.gmail ? (
            <button type="button" className="btn btn-sm" aria-busy={busy === "gmail"} disabled={!!busy} onClick={() => void run("gmail", "drop-gmail")}>
              Drop Gmail
            </button>
          ) : (
            <a className="btn btn-sm" href={`${START}?gmail=1`}>
              Add Gmail
            </a>
          )}
        </div>
      )}
      {view.gmail && !view.gmailOwnClient && (
        <p className="nw-small">Dropping Gmail deletes what it found here. To take Gmail access back at Google too, remove Merlin in your Google Account&apos;s security settings, which also stops Calendar and Contacts.</p>
      )}
      <div className="nw-src">
        <span className="nw-claude" aria-hidden>
          C
        </span>
        <span className="nw-src-t">
          <strong>Gmail via Claude</strong>
          <span className="nw-muted">
            {view.claude
              ? `Your Claude saved ${view.claude.companies} ${view.claude.companies === 1 ? "company" : "companies"} · ${timeAgo(view.claude.at)}`
              : "Your own Claude reads your inbox on your side and saves only conclusions here. Merlin never reads your email."}
          </span>
        </span>
        {view.claude ? (
          <button type="button" className="btn btn-sm" aria-busy={busy === "claude"} disabled={!!busy} onClick={() => void run("claude", "forget-claude")}>
            Delete what Claude saved
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onClaude}>
            How
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- the record: Your way in ---------- */

const noteFor = (p: NetPersonView, company: string) => {
  const first = firstName(p.name) ?? "there";
  return `Hi ${first},\n\nIt's been a little while. ${company} came up for me this week and I'd love to hear what's next for the team. Open to 20 minutes next week?\n\n`;
};

/** "from your calendar, contacts": where the people on a record's "Your way in" came from. */
export const wayInFrom = (c: NetCompanyView) => `from your ${sources(c.src).toLowerCase().replace("gmail via claude", "Claude")}`;

/**
 * The people the member knows at a company, warmest first, and a note to send themselves. The
 * first rows of the record's "Your way in" (Drawer.tsx YourWayIn holds the one heading; the seats
 * someone held follow). `c` is the member's own entry (useNetCompany): nothing with RN_GOOGLE off.
 */
export function WayInPeople({ c, company }: { c: NetCompanyView; company: string }) {
  const copy = useCopy();
  const [draft, setDraft] = useState<number | null>(null);
  const [undoing, setUndoing] = useState(false);
  const sendOn = useSendOn();
  const people = c.people.filter((p) => !p.hidden).slice(0, 4);
  // Set aside (someone selling to them, a recruiter, an investor, or what they said): not a way in, said with why, and Undo.
  if (c.set)
    return (
      <div className="nw-wayin">
        <p className="nw-set" role="note">
          {setWords(c)}{" "}
          <button
            type="button"
            className="nw-link"
            disabled={undoing}
            onClick={async () => {
              setUndoing(true);
              await netAct("mark", { company: c.id, as: c.set!.by === "merlin" ? "rel" : "undo" });
              setUndoing(false);
            }}
          >
            {c.set.by === "merlin" ? "Undo: it is a relationship" : "Undo"}
          </button>
        </p>
        <p className="nw-small">You met {people.map((p) => p.name).filter(Boolean).slice(0, 2).join(" and ") || "people"} here ({c.touch}). Only you see this.</p>
      </div>
    );
  const p = draft !== null ? people[draft] : null;
  const note = p ? noteFor(p, company) : "";
  return (
    <div className="nw-wayin">
      <ol className="nw-people" aria-label="People you know here, warmest first">
        {people.map((x, k) => (
          <li key={k}>
            <span className="nw-pn num" aria-hidden>
              {k + 1}
            </span>
            <span className="nw-pt">
              <span className="nw-pname">
                {x.name ?? "Someone you know"}
                {x.title ? ` · ${x.title}` : ""}
                {x.dm && <span className="nw-dm"> · Decision maker</span>}
                {x.seat && <span className="nw-dm"> · {x.seat.now ? "Holds" : "Held"} their {x.seat.fn && x.seat.fn !== "Other" ? `${x.seat.fn} ` : ""}seat</span>}
              </span>
              <span className="nw-muted">
                {x.why || [countsLine(x), x.both ? "replies both ways" : "", x.last ? `last ${daysAgo(x.last)}` : "", x.next ? `meeting ${daysAgo(x.next)}` : ""].filter(Boolean).join(" · ") || `From ${sources(x.src)}`}
              </span>
              <span className="nw-pw">
                <WarmthChip w={x.warmth} />
                {draft !== k && (
                  <button type="button" className="nw-link" onClick={() => setDraft(k)}>
                    Draft a note
                  </button>
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {c.more > 0 && <p className="nw-small">And {c.more} more you know there.</p>}
      {p && (
        <div className="nw-note">
          <span className="nw-note-h">Suggested note to {firstName(p.name) ?? "them"}</span>
          <p>{note.trim()}</p>
          <div className="nw-row nw-wrap">
            <SendLaunch
              className="btn btn-sm btn-pine"
              d={() => ({
                key: draftKey(`net:${c.id}:${p.name ?? ""}`, p.email, note.trim()),
                kind: "network",
                to: p.email,
                toName: p.name,
                subject: "Catching up",
                body: note.trim(),
                company: c.id,
                effect: { type: "pipeline.sent", companyId: c.id, from: "network", channel: "email", to: { name: p.name, role: p.title, google: true } },
              })}
            />
            {p.email && (
              <a className={`btn btn-sm${sendOn ? "" : " btn-pine"}`} href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent("Catching up")}&body=${encodeURIComponent(note)}`}>
                Open in your email
              </a>
            )}
            <button type="button" className="btn btn-sm" onClick={() => void copy(note.trim(), "Note copied.")}>
              Copy
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>
              Done
            </button>
          </div>
          <SendPromise small off={<span className="nw-small">Merlin never sends for you. You review and send it yourself.</span>} />
        </div>
      )}
      <p className="nw-small">{c.people.every((x) => x.seat) ? "From your own contacts. Only you see this." : "Named for you free: you already know someone here. Only you see this."}</p>
    </div>
  );
}

/** Crystal Ball's row and card: "You know someone · Warm". The warmth is printed; the colour says it a second time. */
export function KnowChip({ companyId }: { companyId: string }) {
  const c = useNetCompany(companyId);
  // Someone selling to them, a recruiter or an investor isn't "someone you know" for a client.
  if (!c || c.set) return null;
  return (
    <span className={`nw-know nw-l-${c.warmth.toLowerCase()}`} data-warmth={c.warmth} aria-label={`You know someone here: ${c.warmth}`} title={`${c.warmth}, from your ${sources(c.src)}`}>
      {knowWords(c.warmth)}
    </span>
  );
}

/* ---------- Integrations ---------- */

/** The Google card on Integrations: Connect, or what's connected, Disconnect and delete. */
export function GoogleSection({ onNetwork }: { onNetwork: () => void }) {
  const { view } = useNetwork();
  if (!view) return null;
  const g = view.google;
  return (
    <section className="in-section" id="google" aria-labelledby="in-google-h">
      <h2 className="in-h" id="in-google-h">
        Your network from Google
      </h2>
      <p className="uc-lead">See who you already know at companies on Merlin, from your calendar and contacts. Read-only, no email, and never shown to other members.</p>
      <section className="tp-card in-card nw-card" aria-labelledby="in-google-card">
        <div className="in-card-h">
          <span className="in-mark in-mark-sm" aria-hidden>
            <GoogleG />
          </span>
          <h3 className="tp-card-h" id="in-google-card">
            Google Calendar and Contacts
          </h3>
          <span className={`chip ${g && g.status !== "reconnect" ? "chip-volt" : "chip-outline"}`}>{g ? (g.status === "reconnect" ? "Needs reconnecting" : "Connected") : "Not set up"}</span>
        </div>
        {g ? (
          <>
            <p className="nw-body">
              {g.email ? `${g.email} · ` : ""}
              {updated(g)} · {view.companies.length} {view.companies.length === 1 ? "company" : "companies"} you know people at
            </p>
            {g.status === "reconnect" && <Reconnect what="Google" note={goneNote("Google", g)} href={START} />}
            {view.gmailOffered && (
              <p className="nw-body">
                {view.gmail ? (
                  view.gmail.status === "reconnect" ? (
                    <a className="btn btn-sm" href={`${START}?gmail=1`}>
                      Reconnect Gmail (test access lasts 7 days)
                    </a>
                  ) : (
                    `Gmail added · ${updated(view.gmail)}`
                  )
                ) : (
                  <a className="btn btn-sm" href={`${START}?gmail=1`}>
                    Also add Gmail (test members)
                  </a>
                )}
              </p>
            )}
            <div className="nw-row nw-wrap">
              <button type="button" className="btn" onClick={onNetwork}>
                Open Your network
              </button>
              <DeleteAll busy={false} />
            </div>
          </>
        ) : (
          <>
            <ReadsList />
            {view.configured ? <ConnectButton /> : <p className="nw-muted">Google isn&apos;t set up on Merlin yet.</p>}
            <GooglePolicyLink />
          </>
        )}
      </section>
    </section>
  );
}

export const CLAUDE_PROMPT =
  "Look through my Gmail for the last 2 years. Find people I've emailed back and forth with at companies, and save my network to Merlin: company website, their name and title, how many emails, and when we last spoke. Don't send any email text.";

/** Integrations, Claude section: the prompt to copy, and what Merlin keeps. */
export function ClaudeNetworkPrompt() {
  const { view } = useNetwork();
  const copy = useCopy();
  if (!view) return null;
  return (
    <section className="tp-card in-card nw-card" id="claude-network" aria-labelledby="nw-claude-h">
      <h3 className="tp-card-h" id="nw-claude-h">
        Add your Gmail network through your own Claude
      </h3>
      <p className="nw-body">
        With Merlin and Gmail both connected in your Claude, ask it to look through your inbox. Claude reads your email on your side, and you choose what it saves here: only
        conclusions. Merlin never reads your email.
      </p>
      <blockquote className="nw-prompt">{CLAUDE_PROMPT}</blockquote>
      <div className="nw-row nw-wrap">
        <button type="button" className="btn btn-pine" onClick={() => void copy(CLAUDE_PROMPT, "Copied. Paste it into Claude.")}>
          Copy the prompt
        </button>
      </div>
      <p className="nw-small">
        What Merlin keeps: the company, the person&apos;s name and title, about how many emails, when you last spoke and whether replies go both ways. Never a subject or a word of an
        email. Only you see it, and you can delete it on Your network.
        {view.claude ? ` Your Claude has saved ${view.claude.companies} ${view.claude.companies === 1 ? "company" : "companies"} so far.` : ""}
      </p>
    </section>
  );
}

/* ---------- onboarding ---------- */

/** An optional prompt on onboarding's last step. Skipping it is the step's own Next. */
export function OnboardGoogle({ onConnect }: { onConnect: () => void }) {
  const { view } = useNetwork();
  if (!view || !view.configured || view.google) return null;
  return (
    <div className="nw-onboard">
      <span className="nw-g nw-g-lg" aria-hidden>
        <GoogleG size={22} />
      </span>
      <span className="nw-onboard-t">
        <strong>Connect Google to see who you already know</strong>
        <span className="nw-muted">Your calendar and contacts, read-only. Merlin shows you which companies you have a way into. Only you see it. Optional: skip it for now.</span>
        <GooglePolicyLink />
      </span>
      <ConnectButton label="Connect Google" onClick={onConnect} />
    </div>
  );
}
export const startGoogle = (from = "") => window.location.assign(`${START}${from ? `?from=${from}` : ""}`);

/* ---------- Pilot metrics (admins): counts only ---------- */

export function NetworkMetrics({ Card, Rows }: { Card: (p: { title: string; children: ReactNode }) => ReactNode; Rows: (p: { items: [string, ReactNode][] }) => ReactNode }) {
  const [n, setN] = useState<{ connected: number; gmail: number; claude: number; reconnect: number; companies: number; matched: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/integrations/google?stats=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j?.counts && setN(j.counts))
      .catch(() => {});
    void load();
    return () => {
      live = false;
    };
  }, []);
  if (!n) return null;
  const f = (x: number) => x.toLocaleString("en-US");
  return (
    <Card title="Your network (counts only)">
      <Rows
        items={[
          ["Members connected to Google", f(n.connected)],
          ["Members with Gmail (test)", f(n.gmail)],
          ["Members who saved from Claude", f(n.claude)],
          ["Connections that need reconnecting", f(n.reconnect)],
          ["Companies matched, all members", f(n.matched)],
          ["Different companies matched", f(n.companies)],
        ]}
      />
    </Card>
  );
}
