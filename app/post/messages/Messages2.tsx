"use client";

/**
 * Messages in the new look (Messages.dc.html; the old look is Messages.tsx). Three columns on a
 * wide screen: the conversations with their kind (intro request, lead passed, question, team up,
 * fellow fractional, invite claimed), filters with counts and a search; the conversation with its
 * intro line, its lead and the composer; and the context column: the fractional's card, then This
 * thread (companies in common, the company or lead in question with its actions: add to pipeline,
 * pass a lead, open the company), Suggested (fractionals to write to) and Leads (every lead between
 * the member and other fractionals).
 *
 * The composer drafts with Merlin in the member's voice: from a template (lib/messagesDraft.ts), or
 * written by Merlin's AI when the drafting switch is on, the member is on Close, agreed once and has
 * AI usage left (lib/messagesAi.ts, as proposals do). Each conversation keeps its own unsent draft
 * in this browser (drafts.ts).
 *
 * Every rule of Messages holds: one conversation per fractional and seat, Unlock and send with one
 * question before any credit, closed conversations and "not taking intros", block, report, unread
 * counts that follow at once in the rail and the bell (data.ts tellUnread). Neither member's email
 * or phone is ever on screen.
 *
 * First visit (no conversations): the three reasons members write, each with a starter that opens a
 * draft, example rows labelled Example (never sent, never counted) and suggested fractionals.
 * Phones: one column. The list, then a conversation or a new message fills the screen.
 */
import { WorkflowDrafts } from "../alerts/Workflows";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConversationRec, FractionalRec, FractionalsView } from "@/lib/tableTypes";
import type { LeadRec, PeerRec } from "@/lib/peersCore";
import { STAGE_WORDS, type PipelineRec } from "@/lib/pipeline";
import { bestBuyer } from "@/lib/moves";
import { clientKinds, seatWords } from "@/lib/partners";
import { draftMessage, draftWords, type DraftFacts, type DraftReason } from "@/lib/messagesDraft";
import { HIDDEN_COMPANY } from "@/lib/tableFields";
import { IconChevron, IconPlus, IconSearch, LockedName, TileLogo, errorText, initials, useToast, val } from "../../ui/shared";
import { FactCell, askSpend, needsSpendConfirm, spendWhat, useFocusTrap, useUi } from "../ui";
import type { FactRef } from "../model";
import { useApp } from "../shell/pages";
import { PageStrip } from "../shell/PageStrip";
import { usePeers, peersAct } from "../peersStore";
import { usePipeline, pipelineAct } from "../pipelineStore";
import { PassSheet } from "../PeerSheets";
import { openFractionalFor } from "../fractionalsModel";
import { openWay } from "../network/useWays";
import { IntroLine } from "../IntroLine";
import { SEAT_LOCKED_FIRST, readM, rememberOne, send, tellUnread, unlockSendCost, unlockSendPrice, useConversations, when, type Act, type ActAnswer } from "./data";
import { setDraft, useDrafts } from "./drafts";
import {
  EXAMPLE_ROWS, FILTERS, KINDS, aboutLine, closedNote, companyWords, contextLine, filterCounts, inFilter, introsByConversation, isClosed, kindOf, lastLine, leadStatus, leadsByConversation, listHead, matches, rowAbout,
  type FilterKey, type Kind, type ThreadCtx,
} from "./model";
import "../messages.css";

const MAX = 2000;
const PASS_DAILY = 10;
const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];
const tint = (s: string) => TINTS[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];

/* ---------- what the page reads ---------- */

/** The Fractionals directory (free on every plan), for a fractional's card and the seats to write about. */
let dirCache: Promise<FractionalRec[] | null> | null = null;
function useDirectory(): FractionalRec[] | null {
  const [d, setD] = useState<FractionalRec[] | null>(null);
  useEffect(() => {
    let live = true;
    dirCache ??= fetch("/api/table?fractionals=1", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<FractionalsView>) : null))
      .then((j) => j?.records ?? null)
      .catch(() => null);
    void dirCache.then((r) => {
      if (!r) dirCache = null;
      if (live) setD(r ?? []);
    });
    return () => {
      live = false;
    };
  }, []);
  return d;
}

/** Whether Merlin's AI can draft here (lib/messagesAi.ts MessageAiView). */
interface AiView {
  ai: "off" | "plan" | "on";
  agreed: boolean;
  usedUp: { words: string; link: string } | null;
  consent: string;
}
function useMessageAi(): [AiView | null, (v: AiView) => void] {
  const [v, setV] = useState<AiView | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/messages", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AiView>) : null))
      .then((j) => live && setV(j))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return [v, setV];
}
async function aiPost(body: Record<string, unknown>): Promise<{ text?: string; ai?: AiView; error?: string; link?: string; status: number }> {
  try {
    const r = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ...j, status: r.status } : { error: errorText(r.status, j.error, "The draft didn't come back. Try again."), link: j.link, status: r.status };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again.", status: 0 };
  }
}

/** A fractional to write to: a member on Merlin, why they are suggested, and a seat of theirs to write about. */
interface Pick {
  memberId: string;
  name: string;
  first: string;
  title: string;
  fn: string | null;
  why: string;
  seat: { engagementId: string; companyId: string } | null;
}

const firstOf = (n: string) => n.trim().split(/\s+/)[0] || n;
/** "Software companies" reads "software companies" mid-sentence; "US", "SaaS" and "B2B" stay as they are. */
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/* ---------- the page ---------- */

type Mode = "thread" | "compose";
type Ctab = "about" | "sug" | "leads";
type Reason = "intro" | "lead" | "q";

export function Messages2() {
  const app = useApp();
  const ui = useUi();
  const toast = useToast();
  const { me, phone } = app;
  const { list, failed, load, put } = useConversations();
  const { view: pipe } = usePipeline();
  const { view: peers } = usePeers();
  const dir = useDirectory();
  const [ai, setAi] = useMessageAi();
  const drafts = useDrafts(me.id);
  const [sel, setSel] = useState<string | null>(() => readM());
  const [mode, setMode] = useState<Mode | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [ctab, setCtab] = useState<Ctab | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [toIdx, setToIdx] = useState(0);
  const [justSent, setJustSent] = useState<string | null>(null);
  // Phones: the list, or one conversation or a new message on top of it.
  const [phoneOpen, setPhoneOpen] = useState(() => !!sel);

  const tctx: ThreadCtx = useMemo(
    () => ({
      intros: introsByConversation(pipe?.intros),
      leads: leadsByConversation([...(peers?.inbox ?? []), ...(peers?.sent ?? [])]),
      drafts: new Set(Object.keys(drafts).filter((k) => k !== "new" && drafts[k].text.trim())),
    }),
    [pipe?.intros, peers?.inbox, peers?.sent, drafts],
  );
  const all = useMemo(() => list ?? [], [list]);
  const first = !!list && !list.length;
  const shown = all.filter((c) => inFilter(filter, c, tctx) && matches(q, c, tctx.leads.get(c.id)));
  const counts = filterCounts(all, tctx);
  const cur = all.find((c) => c.id === sel) ?? null;
  // A wide screen opens the newest conversation; with none, a new message.
  const m: Mode = mode ?? (cur || (!phone && all.length) ? "thread" : "compose");
  useEffect(() => {
    if (!phone && list?.length && !sel && m === "thread") setSel(list[0].id);
  }, [phone, list, sel, m]);
  const open = m === "thread" ? cur : null;

  // Opening a conversation with something unread marks it read, and the rail and the bell follow.
  const unread = open?.unread ?? 0;
  useEffect(() => {
    if (!open || unread === 0) return;
    void send({ type: "message.read", conversationId: open.id }).then((r) => {
      if (r.conversation) put(r.conversation);
      if (typeof r.unread === "number") tellUnread(r.unread);
    });
  }, [open?.id, unread, put]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- who to write to ----- */
  const recByMember = useMemo(() => new Map((dir ?? []).filter((r) => r.memberId && !r.locked).map((r) => [r.memberId!, r])), [dir]);
  const picks: Pick[] = useMemo(() => {
    const out: Pick[] = [];
    const seen = new Set<string>();
    const seatOf = (memberId: string) => {
      const r = recByMember.get(memberId);
      const s = r?.seats.find((x) => app.byId.has(x.co)) ?? r?.seats[0];
      return s ? { engagementId: s.id, companyId: s.co } : null;
    };
    const add = (p: PeerRec) => {
      const id = p.memberId ?? (p.onMerlin ? p.id : null);
      if (!id || seen.has(id) || !p.onMerlin) return;
      seen.add(id);
      out.push({ memberId: id, name: p.name, first: p.first, title: p.title, fn: p.fn, why: p.known?.why ?? p.why ?? (p.both.length ? `You both know ${p.both.slice(0, 2).join(" and ")}.` : "A fractional on Merlin."), seat: seatOf(id) });
    };
    for (const p of [...(peers?.serve ?? []), ...(peers?.know ?? [])]) add(p);
    // Fewer than three new people to write to: the directory's fractionals, those whose clients look like the member's first.
    const talked = new Set(all.map((c) => c.with.id).filter(Boolean));
    const fresh = () => out.filter((p) => !talked.has(p.memberId)).length;
    const fromDir = [...(dir ?? [])].sort((a, b) => Number(!!b.fits) - Number(!!a.fits));
    if (fresh() < 3)
      for (const r of fromDir) {
        if (fresh() >= 3) break;
        if (!r.onMerlin || !r.memberId || r.you || r.locked || seen.has(r.memberId) || !r.name) continue;
        seen.add(r.memberId);
        out.push({ memberId: r.memberId, name: r.name, first: r.first ?? firstOf(r.name), title: r.title ?? "", fn: r.fn, why: r.fits ? `Serves ${r.clients?.line ? midSentence(r.clients.line).replace(/\.$/, "") : "clients like yours"}.` : r.clients?.line ?? "A fractional on Merlin.", seat: seatOf(r.memberId) });
      }
    // Someone new first: a fractional the member already talks to opens that conversation instead.
    return out.sort((a, b) => Number(talked.has(a.memberId)) - Number(talked.has(b.memberId))).slice(0, 5);
  }, [peers?.serve, peers?.know, dir, recByMember, app.byId, all]);
  const threadWith = (memberId: string) => all.find((c) => c.with.id === memberId) ?? null;
  const toI = Math.max(0, Math.min(picks.length - 1, toIdx));
  const to = picks[toI] ?? null;

  /* ----- the draft facts ----- */
  const meFacts = { first: firstOf(me.name), name: me.name, title: me.title || null, clients: clientKinds(me.icp) };
  const seatInfo = (s: Pick["seat"]) => {
    if (!s) return null;
    const info = app.byId.get(s.companyId) ?? null;
    const e = info?.engs.find((x) => x.id === s.engagementId) ?? null;
    const role = e ? val(e.cells.role) : null;
    const fn = e ? val(e.cells.function) : null;
    return { info, named: !!info && !info.c.hidden, words: seatWords(role, fn), role: role ?? (fn ? `Fractional ${fn}` : null) };
  };
  const toSeat = seatInfo(to?.seat ?? null);
  const composeReason: DraftReason = reason === "intro" || reason === "q" ? (to?.seat ? reason : "peer") : reason === "lead" ? "lead" : "peer";
  const composeFacts = (r: DraftReason, p: Pick | null): DraftFacts => {
    const si = seatInfo(p?.seat ?? null);
    return { reason: r, to: p?.first ?? "", me: meFacts, seat: si?.words ?? null, company: si?.named ? si.info!.c.name : null };
  };
  const voice = me.voice ?? null;
  const startWith = (r: Reason, idx = toI) => {
    const p = picks[Math.max(0, Math.min(picks.length - 1, idx))] ?? null;
    const rr: DraftReason = r === "lead" ? "lead" : p?.seat ? r : "peer";
    setReason(r);
    setToIdx(idx);
    setMode("compose");
    setCtab(null);
    setPassing(null);
    if (phone) setPhoneOpen(true);
    setDraft(me.id, "new", { text: draftMessage(composeFacts(rr, p), voice), merlin: "template", auto: true });
    // The draft is in the message box below the reasons: bring it into view.
    setTimeout(() => document.querySelector<HTMLElement>(".ms2-compose .ms2-composer")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  const pickTo = (i: number) => {
    const p = picks[i];
    if (!p) return;
    const th = threadWith(p.memberId);
    if (th) return openThread(th.id);
    setToIdx(i);
    setMode("compose");
    const d = drafts["new"];
    // A draft still as Merlin wrote it follows the new name; one the member typed stays.
    if (reason && (!d || d.auto)) {
      const rr: DraftReason = reason === "lead" ? "lead" : p.seat ? reason : "peer";
      setDraft(me.id, "new", { text: draftMessage(composeFacts(rr, p), voice), merlin: "template", auto: true });
    }
  };
  const openThread = (id: string) => {
    setSel(id);
    setMode("thread");
    setCtab(null);
    setPassing(null);
    if (phone) setPhoneOpen(true);
  };
  const newMessage = () => {
    setMode("compose");
    setCtab(null);
    if (phone) setPhoneOpen(true);
  };

  /* ----- sending ----- */
  const [needs, setNeeds] = useState<FactRef | null>(null);
  const toLocked = composeReason !== "peer" && composeReason !== "lead" && !!to?.seat && !!toSeat && !toSeat.named;
  const needNow: FactRef | null = needs ?? (toLocked && to?.seat ? { entity: "company", id: to.seat.companyId, field: "identity" } : null);
  useEffect(() => setNeeds(null), [toI, reason]);
  const sendNew = async (text: string): Promise<string | null> => {
    if (!to) return "Pick who to write to under Suggested.";
    if (needNow) {
      const cost = unlockSendCost(me, needNow);
      if (needsSpendConfirm(cost) && me.credits >= cost) {
        const yes = await askSpend({ cost, what: spendWhat(needNow), credits: me.credits, then: `Then your message to ${to.first} sends.`, go: needNow.field === "identity" ? "Open and send" : "Unlock and send" });
        if (!yes) return "";
      }
      const ok = await ui.unlock(needNow, { asked: true });
      if (ok === false) return "";
      setNeeds(null);
    }
    const seatMsg = (composeReason === "intro" || composeReason === "q") && to.seat;
    const r: ActAnswer = await send(seatMsg ? { type: "message.start", engagementId: to.seat!.engagementId, text } : { type: "message.connect", memberId: to.memberId, text });
    if (r.error && seatMsg && SEAT_LOCKED_FIRST.test(r.error)) {
      setNeeds({ entity: "engagement", id: to.seat!.engagementId, field: "operator" });
      return `To write to ${to.first}, unlock who held this seat first. Your message is kept.`;
    }
    if (r.error) return r.error;
    const c = r.conversation;
    if (c) {
      put(c);
      rememberOne(c);
      // An intro request is logged on the conversation, so a made intro and a win there are credited to it.
      if (composeReason === "intro") void pipelineAct({ type: "pipeline.intro", conversationId: c.id });
      setJustSent(c.id);
      setReason(null);
      openThread(c.id);
    }
    toast(r.message || "Sent.");
    return null;
  };
  const sendReply = async (c: ConversationRec, text: string): Promise<string | null> => {
    const r = await send({ type: "message.send", conversationId: c.id, text });
    if (r.error) return r.error;
    if (r.conversation) put(r.conversation);
    if (typeof r.unread === "number") tellUnread(r.unread);
    setJustSent(null);
    return null;
  };

  /* ----- the columns ----- */
  if (failed && !list)
    return (
      <div className="ms2 ms2-wait" role="alert">
        <p>{failed}</p>
        <button type="button" className="ms2-btn" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!list)
    return (
      <div className="ms2 ms2-wait" role="status">
        <p>Opening your messages</p>
      </div>
    );

  const passesLeft = peers?.passesLeft ?? PASS_DAILY;
  const passLeft = `${passesLeft} of ${PASS_DAILY} passes left today`;
  const lead = open ? tctx.leads.get(open.id) ?? null : null;
  const kind: Kind | null = open ? kindOf(open, tctx) : null;
  const wp = m === "compose" ? (to ? { id: to.memberId, name: to.name, first: to.first, title: to.title } : null) : open ? open.with : null;
  const ctxCo = m === "compose" ? to?.seat?.companyId ?? null : open ? (lead ? lead.company : open.about.companyId || null) : null;
  const tab: Ctab = ctab ?? (m === "compose" ? "sug" : "about");
  const leads = [...(peers?.inbox ?? []), ...(peers?.sent ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  const listCol = (
    <section className="ms2-list" aria-label="Conversations">
      <div className="ms2-list-h">
        <span>{listHead(all)}</span>
        <span className="ms2-muted">Newest first</span>
      </div>
      {/* Notes a workflow drafted (lib/workflows, Beta): drafts only, never sent. Nothing shows while workflows are off. */}
      <WorkflowDrafts openCompany={(id) => app.openCompany(id)} />
      {first && <p className="ms2-list-note">Nobody has written yet. These three show what lands here. Pick one and Merlin opens the same kind of draft in the message box.</p>}
      <ul>
        {first
          ? EXAMPLE_ROWS.map((e, i) => {
              const p = picks[i] ?? null;
              // Never a real member's name beside words they never wrote: the example speaks as a kind of fractional.
              const name = ["A fractional CRO", "A fractional CFO", "A fractional CMO"][i];
              return (
                <li key={e.reason}>
                  <button type="button" className="ms2-row" onClick={() => startWith(e.reason, p ? i : toI)}>
                    <span className="ms2-av" aria-hidden style={{ background: tint(name) }}>
                      {initials(name)}
                    </span>
                    <span className="ms2-row-main">
                      <span className="ms2-row-top">
                        <span className="ms2-row-name">{name}</span>
                      </span>
                      <span className="ms2-row-mid">
                        <KindPill k={e.kind} />
                        <span className="ms2-row-about">{e.about}</span>
                      </span>
                      <span className="ms2-row-last">{e.last}</span>
                    </span>
                    <span className="ms2-tag">Example</span>
                  </button>
                </li>
              );
            })
          : shown.map((c) => {
              const k = kindOf(c, tctx);
              const on = m === "thread" && c.id === open?.id;
              const draft = drafts[c.id]?.text;
              return (
                <li key={c.id}>
                  <button type="button" className={`ms2-row${on ? " on" : ""}${c.unread ? " unread" : ""}`} aria-current={on ? "true" : undefined} onClick={() => openThread(c.id)}>
                    <span className="ms2-av" aria-hidden style={{ background: tint(c.with.name) }}>
                      {initials(c.with.name)}
                    </span>
                    <span className="ms2-row-main">
                      <span className="ms2-row-top">
                        <span className="ms2-row-name">{c.with.name}</span>
                        <span className="ms2-row-when num">{when(c.updatedAt)}</span>
                      </span>
                      <span className="ms2-row-mid">
                        <KindPill k={k} />
                        <span className="ms2-row-about">{rowAbout(c, k, tctx.leads.get(c.id))}</span>
                      </span>
                      <span className="ms2-row-last">{lastLine(c, draft)}</span>
                    </span>
                    {c.unread > 0 ? (
                      <span className="ms2-dot num" aria-label={`${c.unread} unread`}>
                        {c.unread}
                      </span>
                    ) : draft?.trim() ? (
                      <span className="ms2-tag">Draft</span>
                    ) : isClosed(c) ? (
                      <span className="ms2-tag">{c.blocked ? "Blocked" : "Closed"}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
      </ul>
      {!first && !shown.length && (
        <div className="ms2-none">
          <span>No conversation matches that. Your conversations are all still here.</span>
          <button type="button" className="ms2-btn" onClick={() => (setFilter("all"), setQ(""))}>
            Show all
          </button>
        </div>
      )}
      <p className="ms2-list-foot">{first ? "Your own conversations replace the examples as soon as you send one." : "New replies show here without a reload, and by email with a link to the conversation."}</p>
    </section>
  );

  const center =
    m === "thread" && open ? (
      <ThreadPane
        key={open.id}
        c={open}
        kind={kind!}
        lead={lead}
        justSent={justSent === open.id}
        put={put}
        onBack={phone ? () => setPhoneOpen(false) : undefined}
        composer={
          <Composer
            k={open.id}
            label={`Reply to ${open.with.first}`}
            to={open.with.first}
            canSend={open.canSend}
            rows={phone ? 2 : 4}
            ai={ai}
            setAi={setAi}
            conversationId={open.id}
            template={(short) =>
              draftMessage(
                {
                  reason: "reply",
                  to: open.with.first,
                  me: meFacts,
                  company: (lead ? lead.name : open.about.company && open.about.company !== HIDDEN_COMPANY ? open.about.company : null) ?? null,
                  kind: kind!,
                  mine: open.started,
                  lead: lead ? { side: lead.side === "to-you" ? "in" : "out", taken: lead.status === "taken" } : null,
                },
                voice,
                short,
              )
            }
            onSend={(t) => sendReply(open, t)}
          />
        }
      />
    ) : (
      <ComposePane
        first={first}
        canCancel={!!all.length}
        onCancel={() => (setMode("thread"), phone && setPhoneOpen(false))}
        reason={reason}
        onReason={(r) => startWith(r)}
        to={to}
        toSeat={toSeat}
        composeReason={composeReason}
        opensLeft={me.proOpens ? me.proOpens.left : null}
        onOpenCompany={(id) => app.openCompany(id)}
        onBack={phone ? () => setPhoneOpen(false) : undefined}
        composer={
          <Composer
            k="new"
            label={to ? `Your message to ${to.first}` : "Your message"}
            to={to?.first ?? ""}
            canSend={!!to}
            rows={phone ? 5 : 4}
            ai={null}
            setAi={setAi}
            conversationId={null}
            template={(short) => draftMessage(composeFacts(composeReason, to), voice, short)}
            onSend={sendNew}
            sendText={needNow ? `${needNow.field === "identity" ? "Open the company and send" : "Unlock and send"} · ${unlockSendPrice(me, needNow)}` : undefined}
          />
        }
      />
    );

  const side = (
    <aside className="ms2-side" aria-label="About this conversation">
      {wp && <PersonCard p={wp} rec={wp.id ? recByMember.get(wp.id) ?? null : null} blocked={!!open?.blocked} onProfile={() => (wp.id && openFractionalFor(wp.id), app.openPage("fractionals"))} />}
      <div role="tablist" aria-label="Context" className="ms2-ctabs">
        {(
          [
            ["about", m === "compose" ? "This draft" : "This thread"],
            ["sug", `Suggested · ${picks.length}`],
            ["leads", `Leads · ${leads.length}`],
          ] as [Ctab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ms2-ctab${tab === k ? " on" : ""}`} onClick={() => setCtab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "about" && (
        <>
          <Common rec={wp?.id ? recByMember.get(wp.id) ?? null : null} first={wp?.first ?? ""} skip={ctxCo} entries={pipe?.entries ?? []} firstVisit={first} />
          {ctxCo && (
            <CompanyCard
              id={ctxCo}
              label={m === "thread" && lead ? "The lead" : m === "compose" && composeReason !== "intro" && composeReason !== "q" ? `A company ${wp?.first ?? "they"} know${wp ? "s" : ""}` : "The company in question"}
              fallbackName={m === "thread" && open ? companyWords(open, lead) : ""}
              seat={m === "thread" && open && !lead ? [open.about.seat, open.about.years].filter(Boolean).join(", ") : m === "compose" ? toSeat?.role ?? "" : lead?.role ?? ""}
              entries={pipe?.entries ?? []}
              onPass={(id) => setPassing(id)}
            />
          )}
        </>
      )}
      {tab === "sug" && (
        <div className="ms2-pane">
          <p className="ms2-small">
            {first
              ? `Picked from the ideal client you gave${clientKinds(me.icp) ? `: ${clientKinds(me.icp)}` : ""}. Writing to them is free.`
              : "Fractionals on Merlin who serve clients like yours. Writing to them is free."}
          </p>
          {!picks.length && <p className="ms2-small">{dir ? "Nobody to suggest yet. The Fractionals directory lists everyone on Merlin." : "Finding fractionals for you"}</p>}
          {picks.map((p, i) => {
            const th = threadWith(p.memberId);
            const on = m === "compose" && i === toI;
            return (
              <div key={p.memberId} className={`ms2-sug${on ? " on" : ""}`}>
                <span className="ms2-av" aria-hidden style={{ background: tint(p.name) }}>
                  {initials(p.name)}
                </span>
                <span className="ms2-sug-main">
                  <strong>{p.name}</strong>
                  <span>{p.title}</span>
                  <span className="ms2-muted">{p.why}</span>
                </span>
                <button type="button" className={`ms2-btn${on ? " ms2-btn-on" : " ms2-btn-line"}`} aria-pressed={on} onClick={() => pickTo(i)}>
                  {th ? "Open conversation" : on ? `Writing to ${p.first}` : `Write to ${p.first}`}
                </button>
              </div>
            );
          })}
          <button type="button" className="ms2-link" onClick={() => app.openPage("fractionals")}>
            {peers?.everyone ? `See all ${peers.everyone.toLocaleString("en-US")} fractionals` : "See every fractional"}
          </button>
          <p className="ms2-small ms2-muted">Know a fractional who is not on Merlin yet? Invite them from their seat. When they claim it, a conversation opens here by itself.</p>
        </div>
      )}
      {tab === "leads" && (
        <div className="ms2-pane">
          <p className="ms2-small">{leads.length ? "Every lead between you and other fractionals, newest first." : "Leads you pass and leads passed to you are listed here. You have none yet, so this row is an example."}</p>
          {leads.length ? leads.slice(0, 20).map((l) => <LeadRow key={l.id} l={l} />) : <LeadRow example />}
          <div className="ms2-note-box">
            <strong>{passLeft}</strong>
            <span>Passing costs no credits. The company opens free for the fractional you pick, and you earn 5 credits when they take it.</span>
          </div>
          {ctxCo && app.byId.get(ctxCo) && !app.byId.get(ctxCo)!.c.hidden && (
            <button type="button" className="ms2-btn ms2-btn-line" onClick={() => setPassing(ctxCo)}>
              Pass {app.byId.get(ctxCo)!.c.name}
            </button>
          )}
        </div>
      )}
    </aside>
  );

  const bar = (
    <div className="ms2-bar">
      <div role="tablist" aria-label="Show conversations" className="ms2-filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`ms2-filter${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className={`ms2-filter-n num${f.key === "unread" && counts.unread > 0 ? " hot" : ""}`}>{counts[f.key]}</span>
          </button>
        ))}
      </div>
      <span className="ms2-grow" />
      <label className="ms2-search">
        <IconSearch size={15} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" placeholder={phone ? "Search" : "Search a name or company"} />
      </label>
      <button type="button" className={`ms2-new${m === "compose" ? " on" : ""}`} aria-pressed={m === "compose"} onClick={newMessage}>
        <IconPlus size={15} />
        New message
      </button>
    </div>
  );

  const strip = (
    <PageStrip page="messages" own={all.length}>
      Writing to fellow fractionals on Merlin. Ask for an intro, pass a company that is not your fit, or ask about a seat. Sending costs no credits, and nobody sees your email or phone.
    </PageStrip>
  );
  const pass = passing ? <PassSheet company={passing} from="record" infos={app.infos} onClose={() => (setPassing(null), void load())} /> : null;

  if (phone)
    return (
      <div className="ms2 ms2-phone">
        {strip}
        {bar}
        {listCol}
        {phoneOpen && <PhoneLayer onClose={() => setPhoneOpen(false)}>{center}</PhoneLayer>}
        {pass}
      </div>
    );
  return (
    <div className="ms2">
      {strip}
      {bar}
      <div className="ms2-cols">
        {listCol}
        {center}
        {side}
      </div>
      <div className="ms2-status">
        <span>{m === "thread" ? "Checked for new replies just now" : "Nothing is sent until you press Send"} · Sending and passing a lead cost no credits · {passLeft}</span>
        <span className="ms2-status-r">Your email and phone are never shown to another member.</span>
      </div>
      {pass}
    </div>
  );
}

/* ---------- small parts ---------- */

function KindPill({ k }: { k: Kind }) {
  return (
    <span className="ms2-kind" style={{ background: KINDS[k].tint }}>
      {KINDS[k].label}
    </span>
  );
}

/** A phone's conversation or new message: the visible part of the screen, so the composer rides above the keyboard. Esc closes it. */
function PhoneLayer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="ms2-layer" role="dialog" aria-modal tabIndex={-1} aria-label="Conversation">
      {children}
    </div>
  );
}

/* ---------- one conversation ---------- */

function ThreadPane({ c, kind, lead, justSent, put, composer, onBack }: { c: ConversationRec; kind: Kind; lead: LeadRec | null; justSent: boolean; put: (c: ConversationRec) => void; composer: ReactNode; onBack?: () => void }) {
  const app = useApp();
  const toast = useToast();
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = c.messages.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  const run = async (what: string, action: Act, done?: (r: ActAnswer) => void) => {
    setBusy(what);
    setErr(null);
    const r = await send(action);
    setBusy(null);
    if (r.error) return setErr(r.error);
    if (r.conversation) put(r.conversation);
    if (typeof r.unread === "number") tellUnread(r.unread);
    done?.(r);
  };
  const note = closedNote(c);
  const co = c.about.companyId;
  const firstNew = c.unread > 0 ? c.messages.length - c.unread : -1;
  return (
    <section className="ms2-center" aria-labelledby={`${id}-h`}>
      <header className="ms2-head">
        {onBack && (
          <button type="button" className="ms2-back" aria-label="Back to your messages" onClick={onBack}>
            <IconChevron dir="left" size={18} />
          </button>
        )}
        <span className="ms2-av ms2-av-l" aria-hidden style={{ background: tint(c.with.name) }}>
          {initials(c.with.name)}
        </span>
        <div className="ms2-head-main">
          <span className="ms2-head-top">
            <h2 id={`${id}-h`}>{c.with.name}</h2>
            {c.with.title && <span className="ms2-head-title">{c.with.title}</span>}
            <KindPill k={kind} />
          </span>
          <span className="ms2-head-about">
            {aboutLine(c, kind, lead)}{" "}
            {(co || lead) && (
              <button type="button" className="ms2-link" onClick={() => app.openCompany(lead ? lead.company : co)}>
                Open the company
              </button>
            )}
          </span>
        </div>
        {c.status === "open" && !c.blocked && !c.started && (
          <button type="button" className="ms2-btn" disabled={!!busy} title={`${c.with.first} sees that you are not taking intros right now. Write again any time to reopen it.`} onClick={() => void run("close", { type: "message.close", conversationId: c.id }, (r) => r.message && toast(r.message))}>
            Not now
          </button>
        )}
        {c.blocked ? (
          <button type="button" className="ms2-plain" disabled={!!busy} onClick={() => void run("block", { type: "message.block", conversationId: c.id, on: false }, (r) => r.message && toast(r.message))}>
            Unblock
          </button>
        ) : (
          <button type="button" className="ms2-plain" disabled={!!busy} onClick={() => setAsking(true)}>
            Block
          </button>
        )}
      </header>
      {(kind === "intro" || kind === "q") && <IntroLine c={c} bar />}
      {asking && !c.blocked && (
        <div className="ms2-ask" role="group" aria-label={`Block ${c.with.first}?`}>
          <span>Block {c.with.first}? They cannot start a conversation with you, and this one closes. They see that you are not taking intros right now.</span>
          <button type="button" className="ms2-btn ms2-btn-pine ms2-btn-l" autoFocus disabled={!!busy} onClick={() => void run("block", { type: "message.block", conversationId: c.id }, (r) => (setAsking(false), r.message && toast(r.message)))}>
            Block {c.with.first}
          </button>
          <button type="button" className="ms2-btn ms2-btn-l" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </div>
      )}
      <div ref={scrollRef} className="ms2-scroll" aria-live="polite" aria-relevant="additions">
        <p className="ms2-context">{contextLine(c, kind, lead)}</p>
        {lead && <LeadCard l={lead} first={c.with.first} />}
        {c.messages.map((msg, i) => (
          <div key={msg.id}>
            {i === firstNew && (
              <div className="ms2-new-line" aria-hidden>
                <span />
                New
                <span />
              </div>
            )}
            <div className={`ms2-msg${msg.mine ? " mine" : ""}`}>
              <div className={`ms2-bubble${msg.removed ? " removed" : ""}`}>{msg.removed ? "Removed by an admin." : msg.text}</div>
              <div className="ms2-msg-foot">
                <span className="num">{when(msg.at)}</span>
                {msg.removed ? (
                  <span>An admin removed this message.</span>
                ) : msg.reported ? (
                  <span>You reported this message. An admin sees this one message and nothing else from the conversation.</span>
                ) : (
                  !msg.mine && (
                    <button type="button" className="ms2-report" aria-label="Report this message" disabled={!!busy} onClick={() => void run("report", { type: "message.report", conversationId: c.id, messageId: msg.id }, (r) => r.message && toast(r.message))}>
                      Report
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
        {note ? (
          <div className="ms2-note">
            <span>{note.text}</span>
            {note.alt && (
              <span className="ms2-note-acts">
                <button type="button" className="ms2-link" onClick={() => openWay(co)}>
                  See other ways in at {companyWords(c) === "A locked company" ? "this company" : companyWords(c)}
                </button>
                <button type="button" className="ms2-link" onClick={() => app.openPage("fractionals")}>
                  Find another fractional who knows them
                </button>
              </span>
            )}
          </div>
        ) : (
          justSent &&
          c.messages.length === 1 && (
            <div className="ms2-note">
              <span>Sent. {c.with.first} gets an email with your name and title, never your address. A reply lands here, in your bell and in your email.</span>
            </div>
          )
        )}
        {err && (
          <p className="ms2-err" role="alert">
            {err}
          </p>
        )}
      </div>
      {c.canSend && composer}
    </section>
  );
}

/** A lead passed in this conversation: open for the member, free, with Add to pipeline and Not for me; or one they passed, and where it stands. */
function LeadCard({ l, first }: { l: LeadRec; first: string }) {
  const app = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const name = l.name ?? (l.kind ? `A locked ${l.kind}` : "A locked company");
  const answer = async (take: boolean) => {
    setBusy(true);
    const r = await peersAct({ type: "peer.answer", id: l.id, take });
    setBusy(false);
    toast(r.message, !r.ok);
  };
  const inn = l.side === "to-you";
  return (
    <div className="ms2-lead">
      <span className="ms2-tile" aria-hidden style={{ background: l.name ? tint(l.name) : "#EEF1EF" }}>
        {l.name ? initials(l.name) : "?"}
      </span>
      <div className="ms2-lead-main">
        <span className="ms2-label">{inn ? `Lead from ${first} · open for you, free` : `Lead you passed to ${first}`}</span>
        {l.name ? (
          <button type="button" className="ms2-lead-name" onClick={() => app.openCompany(l.company)}>
            {name}
          </button>
        ) : (
          <strong className="ms2-lead-name">{name}</strong>
        )}
        <span className="ms2-small">{l.line}</span>
        {l.note && <span className="ms2-small ms2-ink">{l.note}</span>}
      </div>
      {inn && l.status === "new" ? (
        <span className="ms2-lead-acts">
          <button type="button" className="ms2-btn ms2-btn-pine ms2-btn-l" disabled={busy} onClick={() => void answer(true)}>
            Add to pipeline
          </button>
          <button type="button" className="ms2-btn ms2-btn-l" disabled={busy} onClick={() => void answer(false)}>
            Not for me
          </button>
        </span>
      ) : (
        <span className="ms2-lead-done">
          <span>
            {inn
              ? l.status === "taken"
                ? `In your pipeline${l.stage ? ` at ${l.stage}` : ""}. ${first} earns 5 credits for thinking of you.`
                : `You passed on it. ${first} sees that and nothing else. The company stays open for you.`
              : l.status === "taken"
                ? `${first} took it. It is in their pipeline${l.credited ? ", and you earned 5 credits" : ""}.`
                : l.status === "declined"
                  ? `${first} passed on it.`
                  : `Waiting for ${first} to answer. You earn 5 credits when they take it.`}
          </span>
          {!inn && l.status === "taken" && !!l.credited && <span className="ms2-earn">+{l.credited} credits</span>}
          {inn && l.status === "taken" && (
            <button type="button" className="ms2-link" onClick={() => app.openPage("pipeline")}>
              Open pipeline
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* ---------- writing a new one ---------- */

const REASONS: { key: Reason; t: string; b: string; eg: string; btn: string; icon: string; earn?: boolean }[] = [
  { key: "intro", t: "Ask for an intro", b: "A fractional who held a seat at a company knows who hires there. Ask them to introduce you.", eg: "Best for a company on your list.", btn: "Draft an intro request", icon: "M5 18a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM19 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM7 16c4 0 6-8 10-8" },
  { key: "lead", t: "Pass a lead", b: "A company that is not your fit is right for someone else. Line up who you will send it to.", eg: "To pass a company you have opened, use Pass a lead on its card.", btn: "Draft a lead note", icon: "M4 12h14M13 6l6 6-6 6", earn: true },
  { key: "q", t: "Ask a question", b: "Ask what a seat was like, how they won it, or what the CEO cared about.", eg: "What a seat paid stays on the seat, as a fact you can open.", btn: "Draft a question", icon: "M5 5h14v11H10l-5 4z" },
];

function ComposePane({
  first, canCancel, onCancel, reason, onReason, to, toSeat, composeReason, opensLeft, onOpenCompany, onBack, composer,
}: {
  first: boolean;
  canCancel: boolean;
  onCancel: () => void;
  reason: Reason | null;
  onReason: (r: Reason) => void;
  to: Pick | null;
  toSeat: { named: boolean; info: { c: { id: string; name: string } } | null; words: string; role: string | null } | null;
  composeReason: DraftReason;
  opensLeft: number | null;
  onOpenCompany: (id: string) => void;
  onBack?: () => void;
  composer: ReactNode;
}) {
  const id = useId();
  const aboutSeat = (composeReason === "intro" || composeReason === "q") && !!to?.seat;
  const locked = aboutSeat && !!toSeat && !toSeat.named;
  return (
    <section className="ms2-center ms2-compose" aria-labelledby={`${id}-h`}>
      <div className="ms2-compose-in">
        <div className="ms2-compose-head">
          {onBack && (
            <button type="button" className="ms2-back" aria-label="Back to your messages" onClick={onBack}>
              <IconChevron dir="left" size={18} />
            </button>
          )}
          <div className="ms2-compose-t">
            <h2 id={`${id}-h`}>{first ? "Start your first conversation" : "New message"}</h2>
            <span>
              {first
                ? "Members write to each other for three reasons. Pick one and Merlin opens a draft in your voice. Nothing goes until you press Send."
                : "Pick a reason and Merlin opens a draft in your voice, or write your own below. One conversation per fractional: if you already talk, it opens that one."}
            </span>
          </div>
          {canCancel && !onBack && (
            <button type="button" className="ms2-btn" onClick={onCancel}>
              Back to conversations
            </button>
          )}
        </div>
        <div className="ms2-reasons">
          {REASONS.map((r, i) => {
            const on = reason === r.key;
            return (
              <div key={r.key} className={`ms2-reason${on ? " on" : ""}`}>
                <span className="ms2-reason-t">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={r.icon} />
                  </svg>
                  <strong>{r.t}</strong>
                </span>
                <span className="ms2-small ms2-body">{r.b}</span>
                <span className="ms2-small ms2-muted">{r.eg}</span>
                {r.earn && <span className="ms2-earn">Earn 5 credits when they take it</span>}
                <button type="button" aria-pressed={on} className={`ms2-btn ms2-btn-l ms2-reason-go${on ? " ms2-btn-on" : !reason && i === 0 ? " ms2-btn-pine" : " ms2-btn-line"}`} onClick={() => onReason(r.key)}>
                  {on ? "Draft open below" : r.btn}
                </button>
              </div>
            );
          })}
        </div>
        <div className="ms2-to">
          <div className="ms2-to-row">
            <span className="ms2-to-k">To</span>
            {to ? (
              <>
                <span className="ms2-av ms2-av-s" aria-hidden style={{ background: tint(to.name) }}>
                  {initials(to.name)}
                </span>
                <span className="ms2-to-v">
                  <strong>{to.name}</strong>
                  {to.title ? `, ${to.title}` : ""}
                </span>
                <span className="ms2-muted ms2-small">Change who under Suggested.</span>
              </>
            ) : (
              <span className="ms2-to-v">Pick a fractional under Suggested.</span>
            )}
          </div>
          <div className="ms2-to-row">
            <span className="ms2-to-k">About</span>
            <span className="ms2-to-v">
              {!to
                ? "Nothing yet."
                : aboutSeat
                  ? toSeat?.named
                    ? `Their ${toSeat.role ?? "fractional"} seat at ${toSeat.info!.c.name}.`
                    : `Their ${toSeat?.role ?? "fractional"} seat at a company that is still locked for you.`
                  : (reason === "intro" || reason === "q") && !to.seat
                    ? `No seat of ${to.first}'s is on file yet. A first note between fellow fractionals.`
                    : "No seat in question. A first note between fellow fractionals."}
            </span>
            {locked && to?.seat && (
              <>
                <span className="ms2-to-lock">
                  <FactCell t={{ entity: "company", id: to.seat.companyId, field: "identity" }} cell={{ s: "locked", ver: 0 }} />
                </span>
                <span className="ms2-small ms2-muted ms2-full">
                  The name fills in when the company opens{opensLeft != null ? `. ${opensLeft} free opens left today` : ""}. Or send as it is: the button opens it first, and asks before any credit.
                </span>
              </>
            )}
            {aboutSeat && toSeat?.named && toSeat.info && (
              <button type="button" className="ms2-link" onClick={() => onOpenCompany(toSeat.info!.c.id)}>
                Open the company
              </button>
            )}
          </div>
        </div>
        <div className="ms2-after">
          <h3>After you send</h3>
          <ol>
            <li>
              <span className="ms2-step" aria-hidden>
                1
              </span>
              <span>
                <strong>{to ? `${to.first} gets an email.` : "They get an email."}</strong> It shows your name and title, never your address or phone.
              </span>
            </li>
            <li>
              <span className="ms2-step" aria-hidden>
                2
              </span>
              <span>
                <strong>The reply lands here.</strong> Also in your bell and your email, with a link to the conversation.
              </span>
            </li>
            <li>
              <span className="ms2-step" aria-hidden>
                3
              </span>
              <span>
                <strong>You mark what came of it.</strong> An intro that is made puts the company in your pipeline. A lead that is taken earns you 5 credits.
              </span>
            </li>
          </ol>
        </div>
      </div>
      {composer}
    </section>
  );
}

/* ---------- the composer ---------- */

function Composer({
  k, label, to, canSend, rows, ai, setAi, conversationId, template, onSend, sendText,
}: {
  /** The draft's key: a conversation id, or "new". */
  k: string;
  label: string;
  to: string;
  canSend: boolean;
  rows: number;
  ai: AiView | null;
  setAi: (v: AiView) => void;
  /** Merlin's AI drafts only a reply in a conversation. */
  conversationId: string | null;
  template: (short: boolean) => string;
  /** null when sent, else the words to show ("" for a quiet stop, such as No to the spend question). */
  onSend: (text: string) => Promise<string | null>;
  sendText?: string;
}) {
  const app = useApp();
  const id = useId();
  const drafts = useDrafts(app.me.id);
  const d = drafts[k] ?? null;
  const text = d?.text ?? "";
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  // "Use the template" once: this composer drafts from the template until the page opens again.
  const [noAi, setNoAi] = useState(false);
  const len = [...text].length;
  const ok = canSend && !!text.trim() && len <= MAX && !busy;
  const aiOn = !!conversationId && ai?.ai === "on" && !ai.usedUp && !noAi;
  const put = (t: string, merlin: "template" | "ai" | null, auto = false) => setDraft(app.me.id, k, { text: t, merlin, auto });
  const viaAi = async (short: boolean, agree = false) => {
    setBusy("ai");
    setErr(null);
    const r = await aiPost({ op: "draft", conversationId, short, ...(agree ? { agree: true } : {}) });
    setBusy(null);
    if (r.ai) setAi(r.ai);
    if (r.status === 428) return setConsent(true);
    if (r.error) return setErr(r.error);
    setConsent(false);
    if (r.text) put(r.text, "ai", true);
  };
  const draft = (short: boolean) => {
    setErr(null);
    if (aiOn && ai?.agreed) return void viaAi(short);
    if (aiOn && !ai?.agreed) return setConsent(true);
    put(template(short), "template", true);
  };
  const submit = async () => {
    if (!ok) return;
    setBusy("send");
    setErr(null);
    const r = await onSend(text.trim());
    setBusy(null);
    if (r === null) setDraft(app.me.id, k, null);
    else if (r) setErr(r);
  };
  const tooLong = len > MAX;
  return (
    <form
      className="ms2-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="ms2-composer-top">
        <label htmlFor={`${id}-t`}>{label}</label>
        <span className={`ms2-count num${tooLong ? " bad" : ""}`} id={`${id}-n`}>
          {tooLong ? `That is ${len.toLocaleString("en-US")} characters. Keep it to 2,000.` : len > MAX - 200 ? `${MAX - len} characters left` : `${len.toLocaleString("en-US")} of 2,000 characters`}
        </span>
      </div>
      <textarea
        id={`${id}-t`}
        className="ms2-input"
        rows={rows}
        value={text}
        placeholder={to ? `Write to ${to}, or let Merlin draft it` : "Pick who to write to, or let Merlin draft it"}
        maxLength={MAX + 200}
        onChange={(e) => {
          put(e.target.value, d?.merlin ?? null, false);
          if (err) setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-invalid={!!err || tooLong}
        aria-describedby={`${id}-n${err ? ` ${id}-e` : ""}`}
      />
      {consent && aiOn && (
        <div className="ms2-drafted" role="group" aria-label="Draft with Merlin's AI">
          <span className="ms2-drafted-t">{ai?.consent}</span>
          <button type="button" className="ms2-btn ms2-btn-mint" disabled={!!busy} onClick={() => void viaAi(false, true)}>
            Agree and draft
          </button>
          <button type="button" className="ms2-btn ms2-btn-mint" disabled={!!busy} onClick={() => (setConsent(false), setNoAi(true), put(template(false), "template", true))}>
            Use the template
          </button>
        </div>
      )}
      {!consent && d?.merlin && !!text && (
        <div className="ms2-drafted">
          <span className="ms2-drafted-t">
            <strong>Drafted by Merlin, in your voice.</strong> {draftWords({ ai: d.merlin === "ai", voiced: !!app.me.voice })}
          </span>
          <button type="button" className="ms2-btn ms2-btn-mint" disabled={!!busy} onClick={() => draft(true)}>
            Shorter
          </button>
          <button type="button" className="ms2-btn ms2-btn-mint" disabled={!!busy} onClick={() => setDraft(app.me.id, k, null)}>
            Start over
          </button>
          <button type="button" className="ms2-link" onClick={() => app.openProfile()}>
            Edit your voice
          </button>
        </div>
      )}
      {ai?.usedUp && conversationId && ai.ai === "on" && (
        <p className="ms2-small ms2-muted">
          {ai.usedUp.words} Draft with Merlin uses the template until then.{" "}
          <a href={ai.usedUp.link} className="ms2-link">
            Add a usage pack
          </a>
        </p>
      )}
      {err && (
        <p className="ms2-err" id={`${id}-e`} role="alert">
          {err}
        </p>
      )}
      <div className="ms2-composer-acts">
        <button type="button" className="ms2-merlin" disabled={!!busy} aria-busy={busy === "ai"} onClick={() => draft(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
          </svg>
          {busy === "ai" ? "Drafting" : "Draft with Merlin"}
        </button>
        <span className="ms2-privacy">{to ? `${to} sees your name and title, never your email or phone. ` : ""}Drafting and sending cost no credits. Ctrl and Enter sends.</span>
        <button type="submit" className="ms2-send" aria-disabled={!ok} disabled={busy === "send"} aria-busy={busy === "send"}>
          {busy === "send" ? "Sending" : sendText ?? "Send"}
        </button>
      </div>
    </form>
  );
}

/* ---------- the context column ---------- */

function PersonCard({ p, rec, blocked, onProfile }: { p: { id?: string; name: string; first: string; title: string }; rec: FractionalRec | null; blocked: boolean; onProfile: () => void }) {
  const seats = rec ? rec.now + rec.past : null;
  return (
    <div className="ms2-person">
      <div className="ms2-person-top">
        <span className="ms2-av ms2-av-l" aria-hidden style={{ background: tint(p.name) }}>
          {initials(p.name)}
        </span>
        <span className="ms2-person-main">
          <strong>{p.name}</strong>
          <span>{p.title || rec?.title || ""}</span>
        </span>
        <button type="button" className="ms2-link" onClick={onProfile}>
          Profile
        </button>
      </div>
      <div className="ms2-chips">
        {rec?.fn && <span className="ms2-chip">{rec.fn}</span>}
        <span className="ms2-chip">On Merlin</span>
        <span className="ms2-chip">{blocked ? "Blocked by you" : "Free to message"}</span>
      </div>
      {(rec?.clients?.line || seats != null) && (
        <span className="ms2-small">
          {rec?.clients?.line ? `Serves ${midSentence(rec.clients.line).replace(/\.$/, "")}. ` : ""}
          {seats != null ? `${seats} ${seats === 1 ? "seat" : "seats"} on file.` : ""}
        </span>
      )}
    </div>
  );
}

/** Companies both of you know: their seats at companies the member can see by name, with where each stands in the member's pipeline. */
function Common({ rec, first, skip, entries, firstVisit }: { rec: FractionalRec | null; first: string; skip: string | null; entries: PipelineRec[]; firstVisit: boolean }) {
  const app = useApp();
  const rows = (rec?.seats ?? [])
    .filter((s) => s.co !== skip)
    .map((s) => ({ s, info: app.byId.get(s.co) }))
    .filter((x) => x.info && !x.info.c.hidden)
    .filter((x, i, a) => a.findIndex((y) => y.s.co === x.s.co) === i)
    .slice(0, 3);
  return (
    <div className="ms2-pane">
      <span className="ms2-pane-h">Companies in common</span>
      {rows.map(({ s, info }) => {
        const e = entries.find((x) => x.company === s.co);
        return (
          <button key={s.co} type="button" className="ms2-common" onClick={() => app.openCompany(s.co)}>
            <span className="ms2-tile" aria-hidden style={{ background: tint(info!.c.name) }}>
              {initials(info!.c.name)}
              <TileLogo seed={s.co} />
            </span>
            <span className="ms2-common-main">
              <strong>{info!.c.name}</strong>
              <span className="ms2-muted">
                {first} {s.now ? "holds" : "held"} a seat there. {e ? `In your pipeline: ${STAGE_WORDS[e.stage]}.` : "Not in your pipeline yet."}
              </span>
            </span>
          </button>
        );
      })}
      {!rows.length && <span className="ms2-small">{firstVisit ? `None yet. This fills in as you open companies. Until then, the company below is where ${first || "they"} fits your ideal client.` : "None on file yet. It fills in as either of you adds seats."}</span>}
    </div>
  );
}

/** The company or lead in question: its free facts, the seat, who decides (a lock with its price), the pipeline, and what to do. */
function CompanyCard({ id, label, fallbackName, seat, entries, onPass }: { id: string; label: string; fallbackName: string; seat: string; entries: PipelineRec[]; onPass: (id: string) => void }) {
  const app = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const info = app.byId.get(id) ?? null;
  const named = !!info && !info.c.hidden;
  const entry = entries.find((e) => e.company === id) ?? null;
  const facts = info ? (named ? [val(info.c.cells.industry), val(info.c.cells.revenue), val(info.c.cells.employees) ? `${val(info.c.cells.employees)} people` : null].filter(Boolean).join(" · ") : info.teaser) : "";
  const buyer = info && named ? bestBuyer(info.c, app.me.function) : null;
  const add = async () => {
    setBusy(true);
    const r = await pipelineAct({ type: "pipeline.add", companyIds: [id] });
    setBusy(false);
    toast(r.message, !r.ok);
  };
  const name = named ? info!.c.name : fallbackName && fallbackName !== HIDDEN_COMPANY ? fallbackName : "A locked company";
  return (
    <div className="ms2-co">
      <div className="ms2-co-top">
        <span className="ms2-tile" aria-hidden style={{ background: named ? tint(name) : "#EEF1EF" }}>
          {named ? initials(name) : "?"}
        </span>
        <span className="ms2-co-main">
          <span className="ms2-label">{label}</span>
          {named ? (
            <button type="button" className="ms2-co-name" onClick={() => app.openCompany(id)}>
              {name}
            </button>
          ) : info ? (
            <strong className="ms2-co-name">
              <LockedName seed={id} />
            </strong>
          ) : (
            <strong className="ms2-co-name">{name}</strong>
          )}
          {facts && <span className="ms2-muted ms2-small">{facts}</span>}
        </span>
      </div>
      {seat && <Row k="Seat">{seat}</Row>}
      {info && (
        <Row k="Who decides">
          {!named ? (
            <span className="ms2-muted">Opens after the company. Then 1 credit.</span>
          ) : buyer ? (
            <span className="ms2-co-cell">
              <FactCell t={{ entity: "contact", id: buyer.p.id, field: "name" }} cell={buyer.p.cells.name} noun="name and title" at={name} />
              {buyer.p.cells.name?.s === "value" && val(buyer.p.cells.title) ? <span className="ms2-muted">, {val(buyer.p.cells.title)}</span> : null}
            </span>
          ) : (
            <span className="ms2-muted">Nobody on file yet.</span>
          )}
        </Row>
      )}
      {buyer && buyer.p.cells.name?.s === "value" && buyer.p.cells.email && buyer.p.cells.email.s !== "empty" && (
        <Row k="Work email">
          <span className="ms2-co-cell">
            <FactCell t={{ entity: "contact", id: buyer.p.id, field: "email" }} cell={buyer.p.cells.email} at={name} />
          </span>
        </Row>
      )}
      <Row k="Pipeline">{entry ? STAGE_WORDS[entry.stage] : "Not in your pipeline"}</Row>
      <div className="ms2-co-acts">
        {named ? (
          <>
            {entry ? (
              <button type="button" className="ms2-btn ms2-btn-on ms2-btn-l" onClick={() => app.openPage("pipeline")}>
                In your pipeline: {STAGE_WORDS[entry.stage]}
              </button>
            ) : (
              <button type="button" className="ms2-btn ms2-btn-pine ms2-btn-l" disabled={busy} onClick={() => void add()}>
                Add to pipeline
              </button>
            )}
            <button type="button" className="ms2-btn ms2-btn-line ms2-btn-l" onClick={() => onPass(id)}>
              Pass a lead
            </button>
            <button type="button" className="ms2-link" onClick={() => app.openCompany(id)}>
              Open the company
            </button>
            <button type="button" className="ms2-link" onClick={() => app.openPage("proposals")}>
              Start a proposal <span className="ms2-pill">Close</span>
            </button>
          </>
        ) : info ? (
          <>
            <span className="ms2-co-cell">
              <FactCell t={{ entity: "company", id, field: "identity" }} cell={{ s: "locked", ver: 0 }} />
            </span>
            <span className="ms2-small ms2-muted ms2-full">Then you can add it to your pipeline or pass it on{app.me.proOpens ? `. ${app.me.proOpens.left} of ${app.me.proOpens.of} free opens left today` : ""}.</span>
          </>
        ) : (
          <button type="button" className="ms2-link" onClick={() => app.openCompany(id)}>
            Open the company
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="ms2-co-row">
      <span className="ms2-co-k">{k}</span>
      <span className="ms2-co-v">{children}</span>
    </div>
  );
}

function LeadRow({ l, example }: { l?: LeadRec; example?: boolean }) {
  if (example || !l)
    return (
      <div className="ms2-ledger">
        <span className="ms2-kind ms2-kind-plain">Example</span>
        <span className="ms2-ledger-main">
          <strong>A fintech company</strong>
          <span className="ms2-muted">To a fractional CFO · needs a finance leader</span>
        </span>
        <span className="ms2-ledger-st">Taken</span>
        <span className="ms2-earn">+5 credits</span>
      </div>
    );
  return (
    <div className="ms2-ledger">
      <span className="ms2-kind ms2-kind-plain">{l.side === "to-you" ? "To you" : "From you"}</span>
      <span className="ms2-ledger-main">
        <strong>{l.name ?? (l.kind ? `A locked ${l.kind}` : "A locked company")}</strong>
        <span className="ms2-muted">
          {l.side === "to-you" ? "From" : "To"} {l.who.name} · {when(l.at)}
        </span>
      </span>
      <span className="ms2-ledger-st">{leadStatus(l)}</span>
      {!!l.credited && <span className="ms2-earn">+{l.credited} credits</span>}
    </div>
  );
}
