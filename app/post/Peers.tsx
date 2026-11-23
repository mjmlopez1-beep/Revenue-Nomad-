"use client";

/**
 * Peers (page "peers"; the Fractionals directory's old address, ?p=fractionals, opens its Every
 * fractional view): fellow fractionals to work with, from GET /api/table?peers=1 (lib/peers.ts).
 *
 *   Passed to you        leads peers passed the member, and team-up asks waiting on them
 *   Fractionals you already know   from the member's own LinkedIn, Google contacts and conversations (only they see this)
 *   Peers who serve your kind of clients   complementary functions, their Crystal Ball first
 *   Your circle          a small group with a monthly thread, or Join a circle
 *   Your teams           companies pursued with a peer
 *   Leads you passed     and what came of them
 *
 * Each person: name, function, what they're working on (their current seats), companies you both
 * know, where your conversation stands, and Message, Pass a lead and Team up. Every fractional on
 * file is a tap away (the directory, Fractionals.tsx). The art: one page-head prop and the quiet
 * empty-state spots, never by a data row.
 */
import { useEffect, useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { KNOWN_WORDS, monthName, type CircleRec, type LeadRec, type PeerRec, type TeamRec } from "@/lib/peersCore";
import { IconChevron, IconUsers, timeAgo, useToast } from "../ui/shared";
import { useUi, SecondaryCtx, usePine } from "./ui";
import { ConnectButton, openConversation } from "./Messages";
import { Avatar, PassSheet, TeamSheet, TeamSpace } from "./PeerSheets";
import { peersAct, takePeersWant, usePeers } from "./peersStore";
import { Fractionals } from "./Fractionals";
import type { CoInfo } from "./model";
import { Prop } from "../ui/fractions/lazy";
import { Chip, EmptyState, PageHead } from "../ui/system";
import { useAppMaybe } from "./shell/pages";
import "./peers.css";

/** The new look's one Fractionals page (fractionals/FractionalsPage.tsx), loaded on its own so the old look carries none of it. */
const FractionalsPage = dynamic(() => import("./fractionals/FractionalsPage").then((m) => m.FractionalsPage), {
  ssr: false,
  loading: () => (
    <div className="tp-allwait" role="status" aria-busy>
      <p className="tp-allwait-t">Loading…</p>
    </div>
  ),
});

export function PeersPage(props: { infos: CoInfo[]; waiting?: boolean; all: boolean; onAll: (on: boolean) => void; onProfile: () => void; openCompany: (id: string) => void }) {
  // The new look: Peers and the directory are one page, Fractionals (?p=peers, ?p=fractionals and ?p=partners land there).
  if (useAppMaybe()?.ui2) return <FractionalsPage />;
  return <PeersOld {...props} />;
}

function PeersOld({ infos, waiting, all, onAll, onProfile, openCompany }: { infos: CoInfo[]; waiting?: boolean; all: boolean; onAll: (on: boolean) => void; onProfile: () => void; openCompany: (id: string) => void }) {
  const { view, failed } = usePeers();
  const [space, setSpace] = useState<string | null>(null);
  const [focusLead, setFocusLead] = useState<string | null>(null);
  useEffect(() => {
    // An email's link (?p=peers&team= or &lead=), or Home's card: the team's space, or the lead, once.
    const w = takePeersWant();
    if (w?.team) setSpace(w.team);
    if (w?.lead) setFocusLead(w.lead);
  }, []);
  useEffect(() => {
    if (!focusLead) return;
    const t = setTimeout(() => document.getElementById(`lead-${focusLead}`)?.scrollIntoView({ block: "center" }), 300);
    return () => clearTimeout(t);
  }, [focusLead, view]);
  if (all)
    return (
      <div className="pe-all">
        <Fractionals infos={infos} waiting={waiting} onBack={() => onAll(false)} onProfile={onProfile} />
      </div>
    );
  const openTeam = view?.teams.find((t) => t.id === space) ?? null;
  const newLeads = view?.inbox.filter((l) => l.status === "new") ?? [];
  const asks = view?.teams.filter((t) => !t.invited && t.status === "invited") ?? [];
  // One filled button on the page: the first card's (in the order drawn). Every card after it is outline (SecondaryCtx).
  let lead = true;
  const later = () => {
    const was = !lead;
    lead = false;
    return was;
  };
  return (
    <div className="page-wide pe-page">
      <PageHead title="Peers" lead={<>Fractionals to do your best work with. Pass a lead that isn&apos;t your fit, team up on a pitch, and keep a small circle close.</>} art={<Prop name="camp" height={72} on="bg" />} />
      <div className="pe-tabs" role="tablist" aria-label="Which peers">
        <button type="button" role="tab" aria-selected className="pe-tab on">
          Your peers
        </button>
        <button type="button" role="tab" aria-selected={false} className="pe-tab" onClick={() => onAll(true)}>
          Every fractional {view ? <span className="num pe-tab-n">{view.everyone.toLocaleString("en-US")}</span> : null}
        </button>
      </div>
      {failed && !view ? (
        <p className="pe-muted" role="alert">
          {failed}
        </p>
      ) : !view ? (
        <p className="pe-muted" role="status">
          Finding your peers…
        </p>
      ) : (
        <>
          {(newLeads.length > 0 || asks.length > 0) && (
            <section className="pe-sec pe-sec-inbox" aria-labelledby="pe-in-h">
              <h2 className="pe-h2" id="pe-in-h">
                Passed to you
              </h2>
              <ul className="pe-leads">
                {newLeads.map((l) => (
                  <SecondaryCtx.Provider key={l.id} value={later()}>
                    <LeadCard l={l} focus={l.id === focusLead} openCompany={openCompany} />
                  </SecondaryCtx.Provider>
                ))}
                {asks.map((t) => (
                  <SecondaryCtx.Provider key={t.id} value={later()}>
                    <TeamAsk t={t} onOpen={() => setSpace(t.id)} />
                  </SecondaryCtx.Provider>
                ))}
              </ul>
            </section>
          )}

          <section className="pe-sec" aria-labelledby="pe-know-h">
            <h2 className="pe-h2" id="pe-know-h">
              Fractionals you already know
            </h2>
            <p className="pe-sub">From your own LinkedIn, Google contacts and conversations. Only you see this list.</p>
            {view.know.length ? (
              <ul className="pe-grid">
                {view.know.map((r) => (
                  <SecondaryCtx.Provider key={r.id} value={later()}>
                    <PeerCard r={r} infos={infos} />
                  </SecondaryCtx.Provider>
                ))}
              </ul>
            ) : (
              <EmptyState spot="noMessages" title="No fractionals you know yet" framed={false} ember={false} className="pe-empty">
                {view.sources.linkedin || view.sources.google ? "Nobody you know is a fractional on Merlin yet. Invite them from Every fractional." : "Bring in your LinkedIn connections or connect Google in Your network, and the fractionals you already know show here."}
              </EmptyState>
            )}
          </section>

          <section className="pe-sec" aria-labelledby="pe-serve-h">
            <h2 className="pe-h2" id="pe-serve-h">
              Peers who serve your kind of clients
            </h2>
            <p className="pe-sub">{view.fn ? `Fractionals who work beside a ${view.fn} leader, at companies like yours.` : "Tell us your function and Merlin finds the fractionals who work beside you."}</p>
            {view.serve.length ? (
              <ul className="pe-grid">
                {view.serve.map((r) => (
                  <SecondaryCtx.Provider key={r.id} value={later()}>
                    <PeerCard r={r} infos={infos} />
                  </SecondaryCtx.Provider>
                ))}
              </ul>
            ) : (
              <EmptyState spot="noResults" title="No one yet" framed={false} ember={false} className="pe-empty" action={{ label: "Say who you serve", onClick: onProfile }}>
                Say who you serve, and Merlin looks again.
              </EmptyState>
            )}
          </section>

          <CircleSection circle={view.circle} offer={view.offer} />

          {view.teams.length > 0 && (
            <section className="pe-sec" aria-labelledby="pe-teams-h">
              <h2 className="pe-h2" id="pe-teams-h">
                Your teams
              </h2>
              <ul className="pe-teams">
                {view.teams.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="pe-team" onClick={() => setSpace(t.id)}>
                      <IconUsers size={16} />
                      <span className="pe-team-t">
                        <b>{t.name ?? (t.kind ? `A ${t.kind}` : "A locked company")}</b>
                        <span>
                          {t.status === "active" ? `With ${t.with.name}` : t.status === "invited" ? (t.invited ? `Waiting for ${t.with.first}` : `${t.with.first} asked you`) : t.left === "you" ? "You left" : `${t.with.first} left`}
                          {t.status === "active" && t.stages.you ? ` · You: ${t.stages.you}` : ""}
                        </span>
                      </span>
                      <IconChevron dir="right" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(view.sent.length > 0 || view.inbox.some((l) => l.status !== "new")) && (
            <section className="pe-sec" aria-labelledby="pe-sent-h">
              <h2 className="pe-h2" id="pe-sent-h">
                Leads between you and your peers
              </h2>
              <ul className="pe-leads pe-leads-past">
                {[...view.sent, ...view.inbox.filter((l) => l.status !== "new")]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 20)
                  .map((l) => (
                    <LeadCard key={l.id} l={l} openCompany={openCompany} />
                  ))}
              </ul>
            </section>
          )}

          {view.muted.length > 0 && <Muted list={view.muted} />}
          <p className="pe-limits num">You can pass {view.passesLeft} more {view.passesLeft === 1 ? "lead" : "leads"} today.</p>
        </>
      )}
      {openTeam && <TeamSpace t={openTeam} onClose={() => setSpace(null)} openCompany={openCompany} />}
    </div>
  );
}

/* ---------- a person ---------- */

function PeerCard({ r, infos }: { r: PeerRec; infos: CoInfo[] }) {
  const pine = usePine();
  const ui = useUi();
  const toast = useToast();
  const [sheet, setSheet] = useState<"pass" | "team" | null>(null);
  const to = r.memberId ? { id: r.memberId, first: r.first } : null;
  return (
    <li className="card pe-card">
      <div className="pe-card-top">
        <Avatar name={r.name} initials={r.initials} />
        <div className="pe-card-who">
          <h3 className="pe-name">{r.name}</h3>
          <p className="pe-title">{r.title || (r.fn ? `Fractional ${r.fn}` : "Fractional")}</p>
        </div>
        {r.thread && (
          <button type="button" className={`pe-thread pe-thread-${r.thread.state}`} onClick={() => openConversation(ui.openPage, r.thread!.id)}>
            {r.thread.words}
          </button>
        )}
      </div>
      <div className="pe-chips">
        {r.fn && <Chip className="pe-chip">{[r.level, r.fn].filter(Boolean).join(" · ")}</Chip>}
        {r.known && (
          <Chip tone="mint" className="pe-chip">
            {r.known.from.map((f) => KNOWN_WORDS[f]).join(", ")}
          </Chip>
        )}
        {r.why && <Chip className="pe-chip">{r.why}</Chip>}
        {!r.onMerlin && <Chip className="pe-chip">Not on Merlin yet</Chip>}
      </div>
      {r.working.length > 0 && (
        <p className="pe-line">
          <span className="pe-line-k">Working on</span>{" "}
          {r.working.map((w, n) => (
            <span key={w.co + n}>
              {n ? "; " : ""}
              {w.role ? `${w.role} at ` : ""}
              {w.name ?? (w.kind ? `a ${w.kind}` : "a locked company")}
            </span>
          ))}
        </p>
      )}
      {r.both.length > 0 && (
        <p className="pe-line">
          <span className="pe-line-k">You both know</span> {r.both.join(", ")}
        </p>
      )}
      {r.passed && (
        <p className="pe-line pe-muted">
          {[r.passed.toThem ? `You passed ${r.first} ${r.passed.toThem === 1 ? "a lead" : `${r.passed.toThem} leads`}` : "", r.passed.fromThem ? `${r.first} passed you ${r.passed.fromThem === 1 ? "one" : r.passed.fromThem}` : ""].filter(Boolean).join(". ")}
        </p>
      )}
      <div className="pe-card-acts">
        {r.memberId ? (
          <>
            <ConnectButton member={{ id: r.memberId, first: r.first }} conversationId={r.thread?.id ?? null} label="Message" className={`btn btn-sm ${pine}`} />
            <button type="button" className="btn btn-sm" onClick={() => setSheet("pass")}>
              Pass a lead
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSheet("team")}>
              Team up
            </button>
            <button
              type="button"
              className="pe-mute"
              onClick={() =>
                void peersAct({ type: "peer.mute", memberId: r.memberId!, on: !r.muted }).then((x) => toast(x.message, !x.ok))
              }
            >
              {r.muted ? "Unmute" : "Mute"}
            </button>
          </>
        ) : r.invite ? (
          <a className={`btn btn-sm ${pine}`} href={r.invite.path} onClick={(e) => (e.preventDefault(), ui.openPage("fractionals"))}>
            Invite to connect
          </a>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => ui.openPage("fractionals")}>
            Find them in Every fractional
          </button>
        )}
      </div>
      {sheet === "pass" && <PassSheet from="record" to={to} infos={infos} onClose={() => setSheet(null)} />}
      {sheet === "team" && <TeamSheet to={to} infos={infos} onClose={() => setSheet(null)} />}
    </li>
  );
}

/* ---------- leads ---------- */

export function LeadCard({ l, focus, openCompany }: { l: LeadRec; focus?: boolean; openCompany: (id: string) => void }) {
  const pine = usePine();
  const ui = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (take: boolean) => {
    setBusy(take ? "take" : "no");
    const r = await peersAct({ type: "peer.answer", id: l.id, take });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const mine = l.side === "from-you";
  const status = mine
    ? l.won
      ? `Won. ${l.who.first} won it, thanks to you.`
      : l.status === "taken"
        ? `${l.who.first} took it${l.credited ? `. You earned ${l.credited} credits` : ""}.`
        : l.status === "declined"
          ? `${l.who.first} passed on it.`
          : `Waiting for ${l.who.first}.`
    : l.won
      ? "You won it."
      : l.status === "taken"
        ? "In your pipeline."
        : l.status === "declined"
          ? "You passed on it."
          : null;
  return (
    <li id={`lead-${l.id}`} className={`pe-lead${focus ? " pe-lead-focus" : ""}${l.status === "new" && !mine ? " pe-lead-new" : ""}`}>
      <Avatar name={l.who.name} small />
      <div className="pe-lead-main">
        <p className="pe-lead-line">
          <b>{l.line}</b>
        </p>
        {l.note && !mine && <p className="pe-lead-note">&ldquo;{l.note}&rdquo;</p>}
        <p className="pe-muted pe-lead-meta">
          {timeAgo(l.at)}
          {!mine && l.status === "new" ? " · Opened free for you, a gift from a peer" : ""}
          {status ? ` · ${status}` : ""}
        </p>
        <div className="pe-row">
          {!mine && l.status === "new" && (
            <>
              <button type="button" className={`btn btn-sm ${pine}`} aria-busy={busy === "take"} onClick={() => void answer(true)}>
                Take it
              </button>
              <button type="button" className="btn btn-sm" aria-busy={busy === "no"} onClick={() => void answer(false)}>
                Not for me
              </button>
            </>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openCompany(l.company)}>
            Open the company
          </button>
          {l.conversationId && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => openConversation(ui.openPage, l.conversationId!)}>
              {mine ? "Your thread" : `Thank ${l.who.first}`}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function TeamAsk({ t, onOpen }: { t: TeamRec; onOpen: () => void }) {
  const pine = usePine();
  return (
    <li className="pe-lead pe-lead-new">
      <Avatar name={t.with.name} small />
      <div className="pe-lead-main">
        <p className="pe-lead-line">
          <b>
            {t.with.first} wants to team up on {t.name ?? (t.kind ? `a ${t.kind}` : "a company")}
          </b>
        </p>
        <p className="pe-muted pe-lead-meta">
          {t.me.fn && t.with.fn ? `A ${t.with.fn} and ${t.me.fn} pitch, together. ` : ""}
          {timeAgo(t.at)}
        </p>
        <div className="pe-row">
          <button type="button" className={`btn btn-sm ${pine}`} onClick={onOpen}>
            See the team space
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------- the circle ---------- */

export function CircleSection({ circle, offer }: { circle: CircleRec | null; offer: import("@/lib/peersCore").CircleOffer | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const postId = useId();
  const unread = circle?.unread ?? 0;
  useEffect(() => {
    if (unread) void peersAct({ type: "peer.circleRead" });
  }, [unread]);
  const months = useMemo(() => {
    if (!circle) return [];
    const by = new Map<string, typeof circle.posts>();
    for (const p of circle.posts) {
      const m = p.at.slice(0, 7);
      by.set(m, [...(by.get(m) ?? []), p]);
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [circle]);
  const run = async (action: Parameters<typeof peersAct>[0]) => {
    setBusy(true);
    const r = await peersAct(action);
    setBusy(false);
    toast(r.message, !r.ok);
    return r.ok;
  };
  return (
    <section className="pe-sec pe-circle" aria-labelledby="pe-circle-h">
      <h2 className="pe-h2" id="pe-circle-h">
        Your circle
      </h2>
      {!circle && offer ? (
        <div className="pe-offer">
          <Prop name="camp" height={44} className="pe-offer-art" />
          <div>
            <p className="pe-offer-t">
              <b>{offer.id ? offer.name : `Start a circle: ${offer.name}`}</b>
            </p>
            <p className="pe-sub">{offer.why} A circle is 6 to 8 fractionals in different functions. Once a month you share what you&apos;re seeing, who&apos;s hiring and who needs what.</p>
            {offer.members.length > 0 && <p className="pe-line">{offer.members.map((m) => `${m.first}${m.fn ? ` (${m.fn})` : ""}`).join(", ")}</p>}
            <button type="button" className="btn btn-pine btn-sm" aria-busy={busy} onClick={() => void run({ type: "peer.circleJoin", circleId: offer.id })}>
              {offer.id ? "Join this circle" : "Start a circle"}
            </button>
          </div>
        </div>
      ) : circle ? (
        <div className="pe-circle-body">
          <p className="pe-sub">
            <b>{circle.name}</b> · {circle.size} of 8{circle.forming ? ". Still forming: Merlin suggests it to peers who fit." : "."}
          </p>
          <ul className="pe-faces" aria-label="In your circle">
            {circle.members.map((m) => (
              <li key={m.id} title={`${m.name}${m.fn ? `, ${m.fn}` : ""}`}>
                <Avatar name={m.name} initials={m.initials} small />
                <span>
                  {m.you ? "You" : m.first}
                  {m.fn ? <span className="pe-muted"> · {m.fn}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="pe-thread-box">
            <p className="pe-eyebrow">{monthName(circle.month)}&apos;s thread</p>
            <p className="pe-prompt">{circle.prompt}</p>
            <form
              className="pe-post"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) void run({ type: "peer.circlePost", text: text.trim() }).then((ok) => ok && setText(""));
              }}
            >
              <label className="sr-only" htmlFor={postId}>
                Your answer to the circle
              </label>
              <textarea id={postId} className="input" rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="What you're seeing, who's hiring, who needs what." />
              <button type="submit" className="btn btn-pine btn-sm" disabled={!text.trim() || busy}>
                Post
              </button>
            </form>
            {months.length ? (
              months.map(([m, posts]) => (
                <div key={m}>
                  {m !== circle.month && <p className="pe-eyebrow">{monthName(m)}</p>}
                  <ul className="pe-posts">
                    {[...posts].reverse().map((p) => (
                      <li key={p.id} className="pe-postrow">
                        <Avatar name={p.who.name} initials={p.who.initials} small />
                        <div>
                          <p className="pe-post-who">
                            <b>{p.mine ? "You" : p.who.first}</b> <span className="pe-muted">{timeAgo(p.at)}</span>
                          </p>
                          <p className="pe-post-text">{p.removed ? "An admin removed this post." : p.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="pe-muted">Nobody has posted this month. Go first.</p>
            )}
          </div>
          <div className="pe-ways">
            <h3 className="pe-h4">Your Crystal Ball, through your circle</h3>
            {circle.ways.length ? (
              <ul className="pe-wayslist">
                {circle.ways.map((w) => (
                  <li key={w.company}>
                    <b>{w.name ?? (w.kind ? `A ${w.kind}` : "A locked company")}</b>
                    <span className="pe-muted">
                      {" "}
                      · {w.who.join(", ")} {w.who.length === 1 ? (w.now ? "holds a seat there" : "held a seat there") : w.now ? "have held seats there, one of them now" : "held seats there"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pe-muted">None of your Crystal Ball companies has a seat held by someone in your circle yet.</p>
            )}
          </div>
          <button type="button" className="pe-mute" onClick={() => window.confirm(`Leave ${circle.name}?`) && void run({ type: "peer.circleLeave" })}>
            Leave the circle
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function Muted({ list }: { list: { id: string; name: string }[] }) {
  const toast = useToast();
  return (
    <section className="pe-sec" aria-labelledby="pe-muted-h">
      <h2 className="pe-h4" id="pe-muted-h">
        Muted
      </h2>
      <ul className="pe-mutedlist">
        {list.map((m) => (
          <li key={m.id}>
            {m.name}{" "}
            <button type="button" className="pe-mute" onClick={() => void peersAct({ type: "peer.mute", memberId: m.id, on: false }).then((x) => toast(x.message, !x.ok))}>
              Unmute
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
