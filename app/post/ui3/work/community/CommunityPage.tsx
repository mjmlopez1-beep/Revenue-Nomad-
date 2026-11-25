"use client";

/**
 * Community in the new design (RN_UI3; find-design/v5/work.html, Community): one page, four tabs.
 * Relationships should feel human: the page leads with people and the work they pass each other.
 *
 *   Fractionals        referrals for you (Take it, Not for me), team-up asks (Team up, Not now) and
 *                      the referrals you sent; the views (All, Serve the same clients as you, You
 *                      know, Referred you a company) and chips with counts; Ask Merlin sets them
 *                      from plain words (askFx); Cards (expertise, how they complement you,
 *                      availability, shared clients, how you know them) or the compact Directory. A
 *                      card opens today's card panel (Message, Refer a company, Team up, Mute; Seats,
 *                      Evidence, Connection). Initials only: a photo shows only where someone added
 *                      one, and the directory has none, so none is drawn.
 *   Peers              your circle, your teams, peers who serve your kind of client, fellow
 *                      fractionals you know, muted.
 *   Referral partners  who held seats in other functions at companies that fit your ideal client,
 *                      from your own view of the table (locks hold); Invite to connect.
 *   Messages           today's Messages (conversations, the composer with Draft with Merlin, the
 *                      context column), unchanged inside the new page.
 *
 * Free on every plan; nothing here spends a credit but a locked company's own open, which asks first.
 * Other members' networks stay private: "You know" is built from the member's own sources only.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FractionalRec } from "@/lib/tableTypes";
import { KNOWN_WORDS, type LeadRec, type PeerRec, type TeamRec } from "@/lib/peersCore";
import { INVITE_EARN, INVITE_EARN_RULE } from "@/lib/tableFields";
import { useToast, timeAgo } from "../../../../ui/shared";
import { useApp } from "../../../shell/pages";
import { ConnectButton, MessagesPage } from "../../../Messages";
import { CircleSection } from "../../../Peers";
import { TeamSpace } from "../../../PeerSheets";
import { peersAct, takePeersWant, usePeers } from "../../../peersStore";
import { useFractionals, sharedOf, type SeatAt } from "../../../Fractionals";
import { InvitePanel, InviteConnect } from "../../../Invite";
import { CardPanel, MutedList, PassButtonFor, RowAction, Teams, YourCard } from "../../../fractionals/FractionalsPage";
import { FX_CHIPS, FX_VIEWS, askFx, commonWords, fxAny, fxChipCounts, fxFlip, fxNone, fxPickers, fxRows, fxViewCounts, keyOf, leadTitle, leadsWord, withPeers, type FxCtx, type FxFilters, type FxView, type PeerLike } from "../../../fractionalsModel";
import { partnerGroups, seatLead, holderIsMember } from "../../../partnersModel";
import { shown as cellShown } from "../../../model";
import { Av, Band, Chips, CoMark, Sheet, Skel, Tabs, WorkMain, useCoFinder } from "../parts";
import { WIc } from "../icons";
import "../../../workbench/workbench.css";
import "../../../fractionals/fractionals2.css";
import "./community.css";

export type CommunityTab = "fractionals" | "peers" | "partners" | "messages";
const STEP = 60;
const nameOf = (r: FractionalRec) => r.name ?? "A fractional";
const firstOf = (r: FractionalRec) => r.first ?? "them";
/** The app's "Unlocked" chip reads as what it is here. */
const CHIP_WORDS: Record<string, string> = { unlocked: "Opened by you" };

export function Ui3Community({ tab: tab0 }: { tab: CommunityTab }) {
  const c = useApp();
  const [tab, setTab] = useState<CommunityTab>(tab0);
  useEffect(() => setTab(tab0), [tab0]);
  const { view: peers } = usePeers();
  const { data, failed, load } = useFractionals([c.me.icp, c.me.function, c.me.fractionals, c.me.nameHidden, c.me.headline, c.me.city, c.me.leads]);
  const [you, setYou] = useState(false);
  const [invite, setInvite] = useState(false);
  const [space, setSpace] = useState<string | null>(null);
  useEffect(() => {
    const w = takePeersWant();
    if (w?.team) setSpace(w.team);
  }, []);
  const records = useMemo(() => {
    const list = data?.records ?? [];
    if (!peers || !data) return list;
    const extra: PeerLike[] = [
      ...peers.serve.map((p) => ({ ...p, memberId: p.memberId ?? "", fits: !!p.why && /clients like yours|Crystal Ball/.test(p.why), conversationId: p.thread?.id })),
      ...peers.know.map((p) => ({ ...p, memberId: p.memberId ?? "", conversationId: p.thread?.id })),
      ...[...peers.inbox, ...peers.sent].map((l) => ({ memberId: l.who.id, name: l.who.name, first: l.who.first, fn: null, conversationId: l.conversationId })),
      ...peers.teams.map((t) => ({ memberId: t.with.id, name: t.with.name, first: t.with.first, title: t.with.title, fn: t.with.fn })),
    ];
    return withPeers(list, extra, peers.unlisted ?? []);
  }, [data, peers]);
  const partners = useMemo(() => partnerGroups(c.infos, c.me), [c.infos, c.me]);
  const partnerN = partners.groups.reduce((n, g) => n + g.seats.length, 0);
  const unread = c.me.unread ?? 0;
  const go = (t: CommunityTab) => {
    setTab(t);
    // The address follows the tab, so a reload and Back land here.
    const key = t === "messages" ? "messages" : t === "partners" ? "partners" : t === "peers" ? "peers" : "fractionals";
    if (key === "messages" || c.page === "messages") c.openPage(key as never);
  };
  const titles: Record<CommunityTab, string> = { fractionals: "Fractionals", peers: "Peers", partners: "Referral partners", messages: "Messages" };
  const mine = records.find((r) => r.you) ?? null;
  const openTeam = (peers?.teams ?? []).find((t) => t.id === space) ?? null;

  return (
    <WorkMain group="Community" title={titles[tab]} cls={`w3-cm w3-cm-${tab}`}>
      {(
        <Band
          art="community"
          title={tab === "messages" ? "Messages." : "Your fellow fractionals."}
          sub={tab === "messages" ? "Intros, referrals and questions with other fractionals. Their email and phone never show here." : "Fractionals who serve your kind of client, the ones you know, and the work you pass each other. Free on every plan."}
          extra={
            <div className="w-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => setInvite(true)}>
                <WIc n="plus" /> Invite a fractional <span className="m-chip gold sm" title={INVITE_EARN_RULE}>{INVITE_EARN}</span>
              </button>
              <button type="button" className="m-btn m-btn-sm m-btn-ghost" onClick={() => setYou(true)}>
                <WIc n="user" /> Your card
              </button>
            </div>
          }
        />
      )}
      <Tabs
        label="Community"
        on={tab}
        set={go}
        items={[
          { k: "fractionals", label: "Fractionals", n: data ? records.filter((r) => !r.you).length : undefined },
          { k: "peers", label: "Peers" },
          { k: "partners", label: "Referral partners", n: partnerN || undefined },
          { k: "messages", label: "Messages", n: unread || undefined },
        ]}
      />
      <div className="cm3-body">
        {tab === "fractionals" ? (
          <Fractionals records={records} data={data} failed={failed} load={load} peers={peers} openTeam={setSpace} />
        ) : tab === "peers" ? (
          <Peers peers={peers} openTeam={setSpace} />
        ) : tab === "partners" ? (
          <Partners groups={partners.groups} fits={partners.fits} />
        ) : (
          <div className="w3-host cm3-msgs">
            <MessagesPage onBack={() => go("fractionals")} openCompany={(id) => c.openCompany(id)} />
          </div>
        )}
      </div>
      {you && (
        <Side onClose={() => setYou(false)} label="Your card">
          <YourCard me={c.me} mine={mine} first={false} peers={peers} onClose={() => setYou(false)} onKnow={() => setYou(false)} phone={c.phone} />
        </Side>
      )}
      {invite && (
        <Sheet title="Invite a fractional" onClose={() => setInvite(false)}>
          <p className="w-help">A fractional you trust, to swap the clients that aren&apos;t your fit. You both get credits once they add their first fact.</p>
          <div className="w3-host">
            <InvitePanel fn={c.me.function ?? null} code={c.me.inviteCode} />
          </div>
        </Sheet>
      )}
      {openTeam && <TeamSpace t={openTeam} onClose={() => setSpace(null)} openCompany={c.openCompany} />}
    </WorkMain>
  );
}

/** Today's card panels (a fractional's card, Your card) in a panel from the right. */
function Side({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <>
      <div className="w-drawer-scrim" onClick={onClose} />
      <div className="w-drawer wide cm3-side w3-host" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>
  );
}

/* ---------------- Fractionals ---------------- */

function Fractionals({ records, data, failed, load, peers, openTeam }: { records: FractionalRec[]; data: ReturnType<typeof useFractionals>["data"]; failed: ReturnType<typeof useFractionals>["failed"]; load: () => Promise<void>; peers: ReturnType<typeof usePeers>["view"]; openTeam: (id: string) => void }) {
  const c = useApp();
  const find = useCoFinder();
  const me = c.me;
  const hasIcp = !!me.icp && !!(me.icp.industries.length || me.icp.employees.length || me.icp.revenue.length || me.icp.countries.length);
  const [view, setView] = useState<FxView>("all");
  const [f, setF] = useState<FxFilters>(fxNone());
  const [askText, setAskText] = useState("");
  const [asked, setAsked] = useState<{ said: string[]; unknown: string[] } | null>(null);
  const [layout, setLayout] = useState<"cards" | "dir">("cards");
  const [n, setN] = useState(STEP);
  const [open, setOpen] = useState<string | null>(null);
  const ctx: FxCtx = useMemo(() => {
    const know = new Map<string, { from: string; why: string }>();
    for (const k of peers?.know ?? []) if (k.known) know.set(k.memberId ?? k.id, { from: k.known.from.map((x) => KNOWN_WORDS[x]).join(", "), why: k.known.why });
    const passed = new Set((peers?.inbox ?? []).map((l) => l.who.id));
    return { myFn: data?.fn ?? me.function ?? null, hasIcp, know, passed };
  }, [peers, data, me.function, hasIcp]);
  const peerBy = useMemo(() => {
    const m = new Map<string, PeerRec>();
    for (const p of [...(peers?.serve ?? []), ...(peers?.know ?? [])]) m.set(p.memberId ?? p.id, p);
    return m;
  }, [peers]);
  const muted = useMemo(() => new Set((peers?.muted ?? []).map((m) => m.id)), [peers]);
  const seatIndex = useMemo(() => {
    const m = new Map<string, SeatAt>();
    for (const i of c.infos) for (const e of i.engs) m.set(e.id, { i, e });
    return m;
  }, [c.infos]);
  const rows = useMemo(() => fxRows(records, view, f, ctx), [records, view, f, ctx]);
  const counts = useMemo(() => fxViewCounts(records, ctx), [records, ctx]);
  const chipN = useMemo(() => fxChipCounts(records, view, f, ctx), [records, view, f, ctx]);
  const pick = useMemo(() => fxPickers(records, view, ctx), [records, view, ctx]);
  useEffect(() => setN(STEP), [view, f]);
  const ask = (text: string) => {
    const all = new Set<string>();
    for (const r of records) for (const i of r.clients?.industries ?? []) all.add(i);
    const a = askFx(text, [...all], pick.fn.map(([x]) => x));
    setF(a.f);
    if (a.view) setView(a.view);
    setAsked({ said: a.said, unknown: a.unknown });
  };
  const openRec = open ? records.find((r) => r.id === open) ?? null : null;
  const at = openRec ? rows.findIndex((r) => r.id === openRec.id) : -1;
  const shownRows = rows.slice(0, n);

  return (
    <>
      <Referrals peers={peers} openTeam={openTeam} />
      <div className="w-toolbar cm3-tools">
        <Chips items={FX_VIEWS.map((v) => ({ k: v.key, label: v.label, n: data ? counts[v.key] : undefined }))} on={view} set={(k) => (setView(k), setAsked(null))} label="Views" cls="cm3-views" />
        <form
          className="cm-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (askText.trim()) ask(askText);
          }}
        >
          <WIc n="spark" />
          <input value={askText} maxLength={160} aria-label="Ask Merlin to narrow this list" placeholder="Ask Merlin: a fintech CFO open to leads" onChange={(e) => setAskText(e.target.value)} />
          <button type="submit" className="m-btn m-btn-sm m-btn-primary">
            Ask
          </button>
        </form>
      </div>
      <div className="w-chiprow cm3-chips" role="group" aria-label="Narrow the list">
        {FX_CHIPS.filter((x) => ((x.key !== "same" && x.key !== "diff") || ctx.myFn) && (chipN[x.key] > 0 || f.chips.includes(x.key))).map((x) => (
          <button key={x.key} type="button" className="m-chip sm" aria-pressed={f.chips.includes(x.key)} onClick={() => (setF(fxFlip(f, x.key)), setAsked(null))}>
            {CHIP_WORDS[x.key] ?? x.label} ({chipN[x.key].toLocaleString("en-US")})
          </button>
        ))}
        {fxAny(f) && (
          <button type="button" className="w-link" onClick={() => (setF(fxNone()), setAsked(null), setAskText(""))}>
            Clear
          </button>
        )}
      </div>
      <div className="w-row cm3-count">
        <span className="m-small" role="status">
          {!data ? (failed ? "Fellow fractionals didn't load." : "Finding fractionals") : asked && fxAny(f) ? `Merlin set ${asked.said.join(", ") || "these filters"}. ${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "fractional matches" : "fractionals match"}.` : `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "fractional" : "fractionals"}`}
        </span>
        <span className="w-sp" />
        <span className="m-seg" role="group" aria-label="Layout">
          <button type="button" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")}>
            Cards
          </button>
          <button type="button" aria-pressed={layout === "dir"} onClick={() => setLayout("dir")}>
            Directory
          </button>
        </span>
      </div>
      {!data ? (
        failed ? (
          <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        ) : (
          <Skel rows={3} />
        )
      ) : !rows.length ? (
        <div className="pr3-empty">
          <b className="w-h4">{view === "know" ? "Nobody you know is here yet" : view === "passed" ? "No fractional has referred you a company yet" : view === "same" && !hasIcp ? "Say who your clients are" : "Nobody matches"}</b>
          <p className="w-help">
            {view === "know" ? "Bring in who you know from Your network and fellow fractionals you've met show here. Only you see it." : view === "same" && !hasIcp ? "Set your ideal client and this view fills with the fractionals who serve the same kind." : "Try fewer chips."}
          </p>
          {fxAny(f) && (
            <button type="button" className="w-link" onClick={() => (setF(fxNone()), setAsked(null))}>
              Clear the filters
            </button>
          )}
        </div>
      ) : layout === "cards" ? (
        <div className="cm-cards">
          {shownRows.map((r) => (
            <FrCard key={r.id} r={r} myFn={ctx.myFn} know={ctx.know.get(keyOf(r))} muted={!!r.memberId && muted.has(r.memberId)} onOpen={() => setOpen(r.id)} reload={load} find={find} />
          ))}
        </div>
      ) : (
        <div className="m-table cm-dir" role="table" aria-label="Fellow fractionals">
          <div className="m-thead" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Function</span>
            <span role="columnheader">Shared clients</span>
            <span role="columnheader">Industries</span>
            <span role="columnheader">Leads</span>
            <span role="columnheader">
              <span className="w-sr">Actions</span>
            </span>
          </div>
          {shownRows.map((r) => {
            const cw = commonWords(r);
            const lw = leadsWord(r);
            return (
              <div key={r.id} className="m-tr" role="row" tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setOpen(r.id)}>
                <div className="m-co" role="cell">
                  <Av name={r.locked ? "?" : nameOf(r)} s={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="m-name">
                      <span>{nameOf(r)}</span>
                    </div>
                    <small>{!r.onMerlin ? "Not on Merlin yet" : r.memberId && muted.has(r.memberId) ? "Muted" : ctx.know.get(keyOf(r))?.from ?? "On Merlin"}</small>
                  </div>
                </div>
                <span className="m-ph-hide" role="cell">
                  {leadTitle(r)}
                  <small className="cm3-sub">
                    {r.now} now, {r.past} past
                  </small>
                </span>
                <span className="m-ph-hide cm-common" role="cell">
                  {cw ? <b title={cw.b}>{cw.a}</b> : <span className="m-small">None yet</span>}
                </span>
                <span className="m-ph-hide m-small" role="cell">
                  {r.clients?.industries.slice(0, 2).join(", ") || "Not on file"}
                </span>
                <span className="m-ph-hide" role="cell">
                  {lw === "Open" ? <span className="cm-open">Open to leads</span> : <span className="m-small">{lw || "Not said"}</span>}
                </span>
                <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
                  {r.memberId ? <ConnectButton member={{ id: r.memberId, first: firstOf(r) }} conversationId={r.conversationId} label="Message" className="m-btn m-btn-sm m-btn-secondary" shared={sharedOf(r)} /> : <RowAction r={r} reload={load} wide />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > n && (
        <button type="button" className="m-btn m-btn-sm m-btn-secondary cm3-more" onClick={() => setN((x) => x + STEP)}>
          Show {Math.min(STEP, rows.length - n)} more of {rows.length.toLocaleString("en-US")}
        </button>
      )}
      {openRec && (
        <Side onClose={() => setOpen(null)} label={`Card of ${nameOf(openRec)}`}>
          <CardPanel
            key={openRec.id}
            r={openRec}
            peer={peerBy.get(keyOf(openRec))}
            know={ctx.know.get(keyOf(openRec))}
            leadsWith={[...(peers?.inbox ?? []), ...(peers?.sent ?? [])].filter((l) => !!openRec.memberId && l.who.id === openRec.memberId)}
            muted={!!openRec.memberId && muted.has(openRec.memberId)}
            myFn={ctx.myFn}
            pos={at >= 0 ? `${at + 1} of ${rows.length.toLocaleString("en-US")}` : "Not in this view"}
            onMove={(d: number) => {
              const next = rows[at < 0 ? 0 : at + d];
              if (next) setOpen(next.id);
            }}
            onClose={() => setOpen(null)}
            seatIndex={seatIndex}
            waiting={c.waiting}
            reload={load}
            phone={c.phone}
          />
        </Side>
      )}
    </>
  );
}

/** One fractional as a card: who they are, what they bring, how you would work together. Only facts on file. */
function FrCard({ r, myFn, know, muted, onOpen, reload, find }: { r: FractionalRec; myFn: string | null; know?: { from: string; why: string }; muted: boolean; onOpen: () => void; reload: () => Promise<void>; find: ReturnType<typeof useCoFinder> }) {
  const lw = leadsWord(r);
  const expertise = [...new Set([...(r.fns ?? []), ...(r.clients?.industries ?? [])])].slice(0, 3);
  const complement = !r.fn || !myFn ? null : r.fn !== myFn ? `Works beside your ${myFn} work: ${r.fn}` : `Same function: someone to pass the clients you can't take`;
  const cw = r.common;
  return (
    <article className="cm-card" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()} aria-label={`${nameOf(r)}, ${leadTitle(r)}`}>
      <div className="cm-card-h">
        <Av name={r.locked ? "?" : nameOf(r)} s={56} />
        <div style={{ minWidth: 0 }}>
          <b>{nameOf(r)}</b>
          <small>{r.title ?? leadTitle(r)}</small>
          <span className={`cm3-avail${lw === "Open" ? " on" : ""}`}>{!r.onMerlin ? "Not on Merlin yet" : muted ? "Muted" : lw === "Open" ? "Open to leads" : lw === "Not now" ? "Not taking leads now" : "On Merlin"}</span>
        </div>
      </div>
      {expertise.length > 0 && (
        <div className="w3-tags">
          {expertise.map((t) => (
            <span key={t} className="m-chip soft">
              {t}
            </span>
          ))}
        </div>
      )}
      {complement && (
        <p className="cm-comp">
          <WIc n="people" /> {complement}
        </p>
      )}
      {r.headline && <p className="cm3-line">{r.headline}</p>}
      <dl className="cm-facts">
        {cw && (cw.names.length > 0 || cw.locked > 0) && (
          <div>
            <dt>{cw.why === "seat" ? "Shared clients" : cw.why === "pipeline" ? "In your pipeline" : "In your Crystal Ball"}</dt>
            <dd className="cm-common">
              {cw.names[0] && <CoMark i={find(null, cw.names[0])} name={cw.names[0]} s={20} />}
              <b>{cw.names[0] ?? `${cw.locked} locked`}</b>
              {cw.names.length + cw.locked > 1 && <span className="m-chip sm">+{cw.names.length + cw.locked - 1}</span>}
            </dd>
          </div>
        )}
        <div>
          <dt>Seats held</dt>
          <dd>
            {r.now} now, {r.past} past
          </dd>
        </div>
        {know && (
          <div>
            <dt>How you know them</dt>
            <dd>{know.from}</dd>
          </div>
        )}
        {r.cases?.length ? (
          <div>
            <dt>Evidence</dt>
            <dd>{r.cases.length === 1 ? "1 case study shown" : `${r.cases.length} case studies shown`}</dd>
          </div>
        ) : null}
      </dl>
      <div className="cm-card-f" onClick={(e) => e.stopPropagation()}>
        <div className="m-rowact">
          {r.memberId ? (
            <>
              <ConnectButton member={{ id: r.memberId, first: firstOf(r) }} conversationId={r.conversationId} label="Message" className="m-btn m-btn-sm m-btn-primary" shared={sharedOf(r)} />
              <PassButtonFor r={r} className="m-btn m-btn-sm m-btn-secondary" />
            </>
          ) : (
            <RowAction r={r} reload={reload} wide />
          )}
        </div>
      </div>
    </article>
  );
}

/** Referrals and team-up asks, on top: the work fractionals pass each other. */
function Referrals({ peers, openTeam }: { peers: ReturnType<typeof usePeers>["view"]; openTeam: (id: string) => void }) {
  const c = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!peers) return null;
  const lead = [...peers.inbox].filter((l) => l.status === "new").sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const ask = peers.teams.filter((t) => !t.invited && t.status === "invited")[0] ?? null;
  const sent = peers.sent.slice(0, 2);
  const answer = async (l: LeadRec, take: boolean) => {
    setBusy(l.id);
    const r = await peersAct({ type: "peer.answer", id: l.id, take });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const teamAnswer = async (t: TeamRec, join: boolean) => {
    setBusy(t.id);
    const r = await peersAct({ type: "peer.teamAnswer", id: t.id, join });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  return (
    <section className="cm-refs" aria-label="Referrals">
      {lead ? (
        <div className="cm-ref gold">
          <div className="w-row">
            <Av name={lead.who.name} s={32} />
            <span className="w-kicker cm3-k gold">
              <WIc n="send" /> Referral for you
            </span>
          </div>
          <p>
            <b>
              {lead.who.first} referred {lead.name ?? (lead.kind ? `a ${lead.kind}` : "a company")} to you.
            </b>{" "}
            {lead.line}
            {lead.note ? ` "${lead.note.slice(0, 90)}"` : ""} It opened free for you.
          </p>
          <div className="w-row" style={{ marginTop: "auto" }}>
            <button type="button" className="w-link" onClick={() => c.openCompany(lead.company)}>
              Open the company
            </button>
            <span className="w-sp" />
            <button type="button" className="m-btn m-btn-sm m-btn-ghost" disabled={busy === lead.id} onClick={() => void answer(lead, false)}>
              Not for me
            </button>
            <button type="button" className="m-btn m-btn-sm m-btn-primary" disabled={busy === lead.id} onClick={() => void answer(lead, true)}>
              Take it
            </button>
          </div>
        </div>
      ) : (
        <div className="cm-ref">
          <span className="w-kicker cm3-k">Referrals for you</span>
          <p>None waiting. While you are open to leads, a company a fractional refers to you opens free for you.</p>
        </div>
      )}
      {ask ? (
        <div className="cm-ref am">
          <div className="w-row">
            <Av name={ask.with.name} s={32} />
            <span className="w-kicker cm3-k am">
              <WIc n="people" /> Team-up ask
            </span>
          </div>
          <p>
            <b>
              {ask.with.first} asks to team up on {ask.name ?? (ask.kind ? `a ${ask.kind}` : "a company")}.
            </b>{" "}
            {ask.me.fn && ask.with.fn ? `A ${ask.with.fn} and ${ask.me.fn} pitch, together.` : ""} {timeAgo(ask.at)}
          </p>
          <div className="w-row" style={{ marginTop: "auto" }}>
            <button type="button" className="w-link" onClick={() => openTeam(ask.id)}>
              See the team space
            </button>
            <span className="w-sp" />
            <button type="button" className="m-btn m-btn-sm m-btn-ghost" disabled={busy === ask.id} onClick={() => void teamAnswer(ask, false)}>
              Not now
            </button>
            <button type="button" className="m-btn m-btn-sm m-btn-primary" disabled={busy === ask.id} onClick={() => void teamAnswer(ask, true)}>
              Team up
            </button>
          </div>
        </div>
      ) : (
        <div className="cm-ref">
          <span className="w-kicker cm3-k">Team-up asks</span>
          <p>None yet. Open a card and choose Team up to pitch a client together, each in your own function.</p>
        </div>
      )}
      <div className="cm-ref">
        <span className="w-kicker cm3-k forest">
          <WIc n="check" /> Referrals you sent
        </span>
        {sent.length ? (
          sent.map((l) => (
            <p key={l.id}>
              <b>
                {l.name ?? "A company"} to {l.who.first}:
              </b>{" "}
              {l.won ? "they won it." : l.status === "taken" ? "they took it." : l.status === "declined" ? "not a fit." : "waiting."}
            </p>
          ))
        ) : (
          <p>None yet. Refer a company that isn&apos;t your fit from a fractional&apos;s card. You earn 5 credits when it is taken.</p>
        )}
        <span className="m-small">{peers.passesLeft} of 10 referrals left today</span>
        {peers.sent.length > 0 && (
          <button type="button" className="w-link" onClick={() => c.openPage("peers")}>
            See all <WIc n="arrow" />
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------- Peers ---------------- */

function Peers({ peers, openTeam }: { peers: ReturnType<typeof usePeers>["view"]; openTeam: (id: string) => void }) {
  if (!peers) return <Skel rows={3} />;
  const person = (p: PeerRec) => (
    <div key={p.id} className="cm-post">
      <Av name={p.name} s={36} />
      <div style={{ minWidth: 0 }}>
        <div className="w-row" style={{ gap: 8 }}>
          <b style={{ fontSize: 15 }}>{p.name}</b>
          <span className="m-small">{p.title}</span>
        </div>
        <p>{p.known ? `${p.known.from.map((x) => KNOWN_WORDS[x]).join(", ")}. ${p.known.why}` : p.why ?? (p.both.length ? `Both at ${p.both.slice(0, 2).join(", ")}` : "A fellow fractional on Merlin")}</p>
        {p.memberId && (
          <div style={{ marginTop: 6 }}>
            <ConnectButton member={{ id: p.memberId, first: p.first }} conversationId={p.thread?.id} label={p.thread ? "Open the thread" : "Message"} className="m-btn m-btn-sm m-btn-secondary" />
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div className="cm-peer-grid">
      <div className="w-stack">
        <section className="m-panel cm3-pan">
          <div className="m-panel-h">
            <h2 className="m-h3">Your circle</h2>
          </div>
          <div className="m-panel-b w3-host">
            <CircleSection circle={peers.circle ?? null} offer={peers.offer ?? null} />
          </div>
        </section>
        <section className="m-panel cm3-pan">
          <div className="m-panel-h">
            <h2 className="m-h3">Your teams</h2>
          </div>
          <div className="m-panel-b w3-host">{peers.teams.length ? <Teams teams={peers.teams} onOpen={openTeam} /> : <p className="w-help">No teams yet. Open a fractional&apos;s card and choose Team up: a shared space for one company, its note and its thread.</p>}</div>
        </section>
      </div>
      <div className="w-stack">
        <section className="m-panel cm3-pan">
          <div className="m-panel-h">
            <h2 className="m-h3">Fellow fractionals you know</h2>
          </div>
          <div className="m-panel-b">{peers.know.length ? peers.know.slice(0, 8).map(person) : <p className="w-help">From your own sources only. Bring in who you know from Your network; no other member sees it.</p>}</div>
        </section>
        <section className="m-panel cm3-pan">
          <div className="m-panel-h">
            <h2 className="m-h3">Peers who serve your kind of client</h2>
          </div>
          <div className="m-panel-b">{peers.serve.length ? peers.serve.slice(0, 6).map(person) : <p className="w-help">Set your ideal client and Merlin lists the fractionals who serve the same kind.</p>}</div>
        </section>
        {peers.muted.length > 0 && (
          <section className="m-panel cm3-pan">
            <div className="m-panel-h">
              <h2 className="m-h3">Muted</h2>
            </div>
            <div className="m-panel-b w3-host">
              <MutedList list={peers.muted} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ---------------- Referral partners ---------------- */

function Partners({ groups, fits }: { groups: ReturnType<typeof partnerGroups>["groups"]; fits: number }) {
  const c = useApp();
  if (!c.me.icp)
    return (
      <div className="pr3-empty">
        <b className="w-h4">Say who your clients are</b>
        <p className="w-help">Referral partners are the fractionals in other functions at companies that fit your ideal client. Set it and they show here.</p>
        <button type="button" className="w-link" onClick={c.openProfile}>
          Set your ideal client
        </button>
      </div>
    );
  if (!groups.length)
    return (
      <div className="pr3-empty">
        <b className="w-h4">No referral partners yet</b>
        <p className="w-help">{fits ? `${fits} companies fit your ideal client, and none has a seat in another function on file yet.` : "No company on file fits your ideal client yet."}</p>
      </div>
    );
  return (
    <>
      <p className="m-small cm3-count">
        Who held seats in other functions at {fits} {fits === 1 ? "company" : "companies"} that fit your ideal client. Names you haven&apos;t opened stay locked.
      </p>
      {groups.map((g) => (
        <section key={g.fn} className="cm3-pgroup">
          <h2 className="m-h3">
            {g.fn} <span className="m-small">{g.seats.length + g.unnamed} {g.seats.length + g.unnamed === 1 ? "seat" : "seats"}</span>
          </h2>
          <div className="cm-partners">
            {g.seats.slice(0, 6).map(({ i, e }) => {
              const op = e.cells.operator;
              const who = op && op.s === "value" ? String(op.v) : null;
              return (
                <div key={e.id} className="cm-pcard">
                  <div className="w-row">
                    <CoMark i={i} s={36} />
                    <div style={{ minWidth: 0 }}>
                      <b className="cm3-pco">{i.c.hidden ? "Locked company" : i.c.name}</b>
                      <small className="m-small" style={{ display: "block" }}>
                        {[cellShown(i.c.cells.industry), cellShown(e.cells.start)].filter(Boolean).join(" · ")}
                      </small>
                    </div>
                  </div>
                  <div className="role">{seatLead(e)}</div>
                  <p className="m-small">{who ? `${who}${holderIsMember(e) ? " · on Merlin" : ""}` : "Name locked: open it on the company"}</p>
                  <div className="w-row" style={{ marginTop: "auto", flexWrap: "wrap" }}>
                    {who && e.invite ? <InviteConnect e={e} name={who} company={i.c.name} /> : null}
                    <button type="button" className="w-link" onClick={() => c.openCompany(i.c.id, e.id)}>
                      Open the company <WIc n="arrow" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {g.unnamed > 0 && <p className="m-small">And {g.unnamed} more with nobody named yet.</p>}
        </section>
      ))}
    </>
  );
}

