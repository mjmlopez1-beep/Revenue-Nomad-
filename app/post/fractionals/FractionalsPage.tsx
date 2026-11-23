"use client";

/**
 * Fractionals in the new look (Fractionals.dc.html, both states): one page for the directory and
 * Peers, drawn in place of both for ?p=peers, ?p=fractionals and ?p=partners (Peers.tsx PeersPage
 * hands over here while the new look is on).
 *
 *   Leads           a strip on top: leads passed to you (Take it, Not for me; team-up asks) and the
 *                   ones you passed, with what came of them
 *   Views           All, Serve the same clients as you, You know (the member's own sources, and the
 *                   sources themselves: "Your network" lives here), Passed you a lead
 *   The list        a table (Name, Function, Seats held, Companies in common, Industries, Evidence
 *                   shown, Open to leads, and How you know them as an eighth column) or cards, with
 *                   chips that narrow it and Ask Merlin, which sets the chips from plain words
 *   The card        a row opens it on the right: Message, Pass a lead, Team up, Mute, and tabs
 *                   Seats, Evidence (only the cases they chose to show, the client hidden) and
 *                   Connection (how you are connected)
 *   Your card       what other members see of you, with the privacy switches, your one line and
 *                   where you are based, Open to leads, and your network
 *   Bottom tabs     Directory, Your teams, Your circle, Muted
 *
 * First visit (the member hasn't chosen to show their card, and has no lead or team yet): the panel
 * opens on Your card, outlined, the view is Serve the same clients as you, and three fractionals who
 * serve the same kind of client sit on top of the list. Every record arrives locked as the member may
 * see it (lib/fractionals.ts); a fractional who keeps out of the directory, or hides their name, is
 * never listed. Free on every plan; nothing here spends a credit but a locked company's own unlock, which
 * asks first (ui.unlock). No export.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { FractionalRec, Me } from "@/lib/tableTypes";
import { KNOWN_WORDS, type LeadRec, type PeerRec, type TeamRec } from "@/lib/peersCore";
import { countryShort } from "../model";
import { IconCheck, IconChevron, IconSearch, IconUsers, IconX, fmtMonth, timeAgo, useToast } from "../../ui/shared";
import { useApp } from "../shell/pages";
import { ShellHeader } from "../shell/Header";
import { useUi } from "../ui";
import { plural } from "../hooks";
import { ConnectButton, openConversation } from "../Messages";
import { PassSheet, TeamSheet, TeamSpace } from "../PeerSheets";
import { CircleSection } from "../Peers";
import { peersAct, takePeersWant, usePeers } from "../peersStore";
import { ConnectPanel } from "../network/ConnectPanel";
import { InviteSheet, SeatCard, Welcome, sharedOf, useFractionals, type SeatAt } from "../Fractionals";
import {
  CARD_CITY_MAX,
  CARD_LINE_MAX,
  FX_CHIPS,
  FX_VIEWS,
  askFx,
  ballChip,
  cardName,
  commonWords,
  fxAny,
  fxChipCounts,
  fxFill,
  fxFlip,
  fxNone,
  fxPickers,
  fxRows,
  fxViewCounts,
  industryWords,
  keyOf,
  leadTitle,
  leadsWord,
  levelLine,
  startPlaceNow,
  startThree,
  takeWantSeat,
  withPeers,
  type FxCtx,
  type FxFilters,
  type PeerLike,
  type FxView,
} from "../fractionalsModel";
import "../workbench/workbench.css";
import "./fractionals2.css";

type Bottom = "dir" | "teams" | "circle" | "muted";
type Panel = { kind: "card"; id: string } | { kind: "you" } | null;
type Tab = "seats" | "ev" | "conn";

/** Rows drawn before "Show more": the directory can run to thousands. */
const STEP = 60;
const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];
const tintOf = (id: string) => TINTS[[...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % TINTS.length];

function Face({ r, size = 32 }: { r: Pick<FractionalRec, "id" | "initials" | "locked">; size?: number }) {
  const grey = !r.initials;
  return (
    <span className="fy-av" aria-hidden style={{ width: size, height: size, flexBasis: size, fontSize: size > 40 ? 15 : 12, background: grey ? "#EEF1EF" : tintOf(r.id) }}>
      {r.initials ?? "?"}
    </span>
  );
}

const nameOf = (r: FractionalRec) => r.name ?? "A fractional";
const firstOfRec = (r: FractionalRec) => r.first ?? "them";

export function FractionalsPage() {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const me = c.me;
  const phone = c.phone;
  const { data, failed, load } = useFractionals([me.icp, me.function, me.fractionals, me.nameHidden, me.headline, me.city, me.leads]);
  const { view: peers } = usePeers();
  const [addr] = useState(() => startPlaceNow());
  const hasIcp = !!me.icp && !!(me.icp.industries.length || me.icp.employees.length || me.icp.revenue.length || me.icp.countries.length);
  // The directory's records, and the members Peers shows that hold no seat on file (withPeers).
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
  const mine = records.find((r) => r.you) ?? null;
  const own = (peers?.inbox.length ?? 0) + (peers?.sent.length ?? 0) + (peers?.teams.length ?? 0);
  // First visit: no choice about the card yet, and nothing between them and a fellow fractional.
  const first = me.fractionals === null && !!peers && own === 0;
  const [view, setView] = useState<FxView | null>(null);
  const viewNow: FxView = view ?? (first && hasIcp ? "same" : "all");
  const [bottom, setBottom] = useState<Bottom>("dir");
  const [f, setF] = useState<FxFilters>(() => ({ ...fxNone(), chips: addr.diff ? ["diff"] : [] }));
  const [asked, setAsked] = useState<{ said: string[]; unknown: string[] } | null>(null);
  const [askText, setAskText] = useState("");
  const [cards, setCards] = useState(false);
  const [knowCol, setKnowCol] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [n, setN] = useState(STEP);
  const [panel, setPanel] = useState<Panel | undefined>(addr.rec ? { kind: "card", id: addr.rec } : undefined);
  const [space, setSpace] = useState<string | null>(null);
  const [focusLead, setFocusLead] = useState<string | null>(null);
  const [allLeads, setAllLeads] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const panelNow: Panel = panel === undefined ? (first && !phone ? { kind: "you" } : null) : panel;
  // The first visit's view and panel stay put once the member acts (showing the card ends the first visit).
  useEffect(() => {
    if (!first) return;
    setView((v) => v ?? (hasIcp ? "same" : "all"));
    if (!phone) setPanel((p) => (p === undefined ? { kind: "you" } : p));
  }, [first, hasIcp, phone]);

  useEffect(() => {
    // An email's link (?p=peers&team= or &lead=), or Home's card: the team's space, or the lead, once.
    const w = takePeersWant();
    if (w?.team) setSpace(w.team);
    if (w?.lead) setFocusLead(w.lead);
  }, []);
  useEffect(() => {
    if (!focusLead) return;
    const t = setTimeout(() => document.getElementById(`fy-lead-${focusLead}`)?.scrollIntoView({ block: "center" }), 300);
    return () => clearTimeout(t);
  }, [focusLead, peers]);
  // The company record's "See their record", or ?fs=<seat>: the record that seat is on.
  const [wantSeat] = useState(() => takeWantSeat() ?? addr.seat);
  useEffect(() => {
    if (!wantSeat || !records.length) return;
    const r = records.find((x) => x.seats.some((s) => s.id === wantSeat));
    if (r) setPanel({ kind: "card", id: r.id });
  }, [records, wantSeat]);

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

  const three = useMemo(() => (first && viewNow === "same" && !fxAny(f) && bottom === "dir" ? startThree(records, (peers?.serve ?? []).map((p) => p.memberId ?? p.id), ctx) : []), [first, viewNow, f, bottom, records, peers, ctx]);
  const rows = useMemo(() => fxRows(records, viewNow, f, ctx).filter((r) => !three.includes(r)), [records, viewNow, f, ctx, three]);
  const counts = useMemo(() => fxViewCounts(records, ctx), [records, ctx]);
  const chipN = useMemo(() => fxChipCounts(records, viewNow, f, ctx), [records, viewNow, f, ctx]);
  const pick = useMemo(() => fxPickers(records, viewNow, ctx), [records, viewNow, ctx]);
  const fill = useMemo(() => fxFill(rows), [rows]);
  useEffect(() => setN(STEP), [viewNow, f]);
  const showKnow = knowCol || viewNow === "know";

  const open = panelNow?.kind === "card" ? records.find((r) => r.id === panelNow.id) ?? null : null;
  const at = open ? rows.findIndex((r) => r.id === open.id) : -1;
  const openCard = (r: FractionalRec) => setPanel({ kind: "card", id: r.id });
  const move = (d: number) => {
    const next = rows[at < 0 ? 0 : at + d];
    if (next) openCard(next);
  };

  const ask = (text: string) => {
    const all = new Set<string>();
    for (const r of records) for (const i of r.clients?.industries ?? []) all.add(i);
    const a = askFx(text, [...all], pick.fn.map(([x]) => x));
    setF(a.f);
    if (a.view) setView(a.view);
    setBottom("dir");
    setAsked({ said: a.said, unknown: a.unknown });
  };

  const viewLabel = bottom === "dir" ? FX_VIEWS.find((v) => v.key === viewNow)!.label : bottom === "teams" ? "Your teams" : bottom === "circle" ? "Your circle" : "Muted";
  const header = (
    <ShellHeader
      crumbs={[
        { label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") },
        { label: "Fractionals", href: c.hrefOf("peers"), go: () => (setBottom("dir"), setView("all")) },
      ]}
      title={viewLabel}
      phone={phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );

  /* ----- the strip, first visit ----- */
  const stage = me.fractionals === null ? 0 : ctx.know.size || peers?.sources.linkedin || peers?.sources.google ? 2 : 1;
  const stripKey = stage === 0 ? "fractionals" : stage === 1 ? "fractionals-card" : "fractionals-know";
  const showStrip = (first || (stage > 0 && own === 0 && me.fractionals !== null && !c.start.stripOff("fractionals-card"))) && !c.start.stripOff(stripKey) && c.ui2;
  const strip = showStrip && (
    <section aria-label="About this page" className={`wb-strip${stage ? " wb-strip-done" : ""}`}>
      {stage === 0 ? (
        <span className="wb-strip-t">
          <strong>What this page is for.</strong> Every fractional on Merlin&apos;s files, free to see on any plan. Find the ones who serve the same clients as you, message them, and pass each other the leads that are not your fit. Start with your own card.
        </span>
      ) : stage === 1 ? (
        <>
          <span className="wb-strip-t">
            <strong>{me.fractionals ? `Your card is live. Members see ${cardName(me).name}.` : "Your choice is saved. You are out of the directory."}</strong> Next, bring in who you know. The You know view then fills with the fractionals you have already met.
          </span>
          <button type="button" className="btn btn-pine" onClick={() => (setBottom("dir"), setView("know"))}>
            Bring in who you know
          </button>
        </>
      ) : (
        <>
          <span className="wb-strip-t">
            <strong>You already know {plural(ctx.know.size, "of these fractionals", "of these fractionals")}.</strong> Next, open a company and pass the ones that are not your fit.
          </span>
          <button type="button" className="btn btn-pine" onClick={() => c.openPage("table")}>
            Open a company
          </button>
          <a className="wb-strip-link" href={c.hrefOf("warm")} onClick={(e) => (e.preventDefault(), c.openPage("warm"))}>
            See your warm paths
          </a>
        </>
      )}
      <button type="button" className="wb-iconbtn" aria-label="Dismiss" onClick={() => c.start.dismissStrip(stripKey)}>
        <IconX size={16} />
      </button>
    </section>
  );

  /* ----- the leads strip ----- */
  const leads = <LeadsStrip peers={peers} first={first} all={allLeads} onAll={() => setAllLeads(!allLeads)} focus={focusLead} openTeam={setSpace} />;

  /* ----- views, layout, columns, your card ----- */
  const youOn = panelNow?.kind === "you";
  const viewsRow = (
    <div className="fy-views">
      {phone ? (
        <label className="fy-viewpick">
          <span className="sr-only">View</span>
          <select value={viewNow} onChange={(e) => (setView(e.target.value as FxView), setBottom("dir"))}>
            {FX_VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label} · {counts[v.key].toLocaleString("en-US")}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div role="tablist" aria-label="Views" className="fy-tabs">
          {FX_VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={viewNow === v.key && bottom === "dir"} className={`fy-tab${viewNow === v.key && bottom === "dir" ? " on" : ""}`} onClick={() => (setView(v.key), setBottom("dir"))}>
              {v.label} <span className="fy-tab-n num">{data ? counts[v.key].toLocaleString("en-US") : ""}</span>
            </button>
          ))}
        </div>
      )}
      {!phone && (
        <span role="group" aria-label="Layout" className="fy-seg">
          <button type="button" aria-pressed={!cards} className={!cards ? "on" : undefined} onClick={() => (setCards(false), setBottom("dir"))}>
            Table
          </button>
          <button type="button" aria-pressed={cards} className={cards ? "on" : undefined} onClick={() => (setCards(true), setBottom("dir"))}>
            Cards
          </button>
        </span>
      )}
      {!phone && !cards && (
        <button type="button" className="wb-tb" aria-pressed={showKnow} disabled={viewNow === "know"} onClick={() => setKnowCol(!knowCol)}>
          {showKnow ? 8 : 7} of 8 columns
        </button>
      )}
      <button type="button" aria-pressed={youOn} className={`fy-you${youOn ? " on" : ""}`} onClick={() => setPanel(youOn ? null : { kind: "you" })}>
        Your card
      </button>
    </div>
  );
  const askId = useId();
  const askRow = (
    <div className="wb-ask fy-ask">
      <form
        className="fy-askbox"
        onSubmit={(e) => {
          e.preventDefault();
          if (askText.trim()) ask(askText);
        }}
      >
        <IconSearch size={16} />
        <label className="sr-only" htmlFor={askId}>
          Ask Merlin to narrow this list
        </label>
        <input id={askId} type="text" value={askText} maxLength={160} placeholder="Ask Merlin: a fractional CFO who serves fintech and takes leads" onChange={(e) => setAskText(e.target.value)} />
      </form>
      {!phone && (
        <button type="button" className="wb-askchip" onClick={() => (setAskText(`${ctx.myFn ? "Other functions" : "Leaders"} who serve my clients and take leads`), ask("other functions who serve my clients and take leads"))}>
          {ctx.myFn ? "Other functions" : "Leaders"} who serve my clients and take leads
        </button>
      )}
      <span role="status" className="fy-headline">
        {asked && fxAny(f)
          ? `Merlin set ${asked.said.join(", ") || "these filters"}. ${plural(rows.length, "fractional matches", "fractionals match")}.${asked.unknown.length ? ` It skipped: ${asked.unknown.slice(0, 5).join(", ")}.` : ""}`
          : headlineOf(viewNow, records, rows, counts, fxAny(f), data ? null : failed ?? "Finding fractionals")}
      </span>
    </div>
  );
  const chipsRow = (
    <div className="fy-chips" role="group" aria-label="Narrow the list">
      {/* A chip that would show nobody in this view stays out of the way, unless it is on. */}
      {FX_CHIPS.filter((x) => ((x.key !== "same" && x.key !== "diff") || ctx.myFn) && (chipN[x.key] > 0 || f.chips.includes(x.key))).map((x) => {
        const on = f.chips.includes(x.key);
        return (
          <button key={x.key} type="button" aria-pressed={on} className={`fy-chip${on ? " on" : ""}`} onClick={() => (setF(fxFlip(f, x.key)), setAsked(null))}>
            {x.label} <span className="num fy-chip-n">{chipN[x.key].toLocaleString("en-US")}</span>
          </button>
        );
      })}
      <Picker label="Function" value={f.fn} list={pick.fn} onPick={(v) => (setF({ ...f, fn: v }), setAsked(null))} />
      <Picker label="Level" value={f.level} list={pick.level} onPick={(v) => (setF({ ...f, level: v }), setAsked(null))} />
      {pick.region.length > 1 && <Picker label="Region" value={f.region} list={pick.region} onPick={(v) => (setF({ ...f, region: v }), setAsked(null))} />}
      {pick.industry.length > 0 && <Picker label="Industry" value={f.industry} list={pick.industry} onPick={(v) => (setF({ ...f, industry: v }), setAsked(null))} />}
      {fxAny(f) && (
        <button type="button" className="fy-clear" onClick={() => (setF(fxNone()), setAsked(null), setAskText(""))}>
          Clear
        </button>
      )}
    </div>
  );

  /* ----- above the list: the ideal client, your network, three to start with ----- */
  const ideal = viewNow === "same" && bottom === "dir" && (
    <div className="fy-ideal">
      {hasIcp ? (
        <>
          <span>{first ? "Already filtered to your ideal client, from what you said when you signed up:" : "Fractionals whose clients look like your ideal client:"}</span>
          {icpChips(me).map((t) => (
            <span key={t} className="fy-ichip">
              {t}
            </span>
          ))}
        </>
      ) : (
        <span>Say who your clients are and this view fills with the fractionals who serve the same kind.</span>
      )}
      <button type="button" className="fy-link" onClick={c.openProfile}>
        {hasIcp ? "Change your ideal client" : "Say who you serve"}
      </button>
    </div>
  );
  const anySource = !!(peers?.sources.linkedin || peers?.sources.google);
  const network = viewNow === "know" && bottom === "dir" && (
    <div className="fy-net">
      <div className="fy-net-h">
        <strong>Your network</strong>
        <span>{anySource ? "Built from your own sources and shown to you alone. Merlin never shows who you know to another member." : "Bring in who you know and this view fills with the fractionals you have already met. It is yours alone: no other member sees it."}</span>
      </div>
      {anySource && (
        <div className="fy-net-row">
          {peers?.sources.google && <span className="fy-src">Google contacts and calendar</span>}
          {peers?.sources.linkedin && <span className="fy-src">LinkedIn connections file</span>}
          <a className="fy-link" href={c.hrefOf("warm")} onClick={(e) => (e.preventDefault(), c.openPage("warm"))}>
            See your warm paths
          </a>
          <button type="button" className="fy-link" aria-expanded={showSources} onClick={() => setShowSources(!showSources)}>
            {showSources ? "Close sources" : "Manage sources"}
          </button>
        </div>
      )}
      {(!anySource || showSources) && <ConnectPanel variant="inline" start={peers?.sources.linkedin ? "csv" : "linkedin"} onSeeKnown={() => (setShowSources(false), setView("know"))} />}
    </div>
  );
  const starters = three.length > 0 && (
    <div className="fy-three">
      <div className="fy-three-h">
        <h2>Three to start with</h2>
        <span>They serve your kind of client{ctx.myFn ? `, in functions that work beside ${ctx.myFn}` : ""}. A message never costs a credit.</span>
      </div>
      <div className="fy-three-grid">
        {three.map((r) => (
          <div key={r.id} className="fy-three-card">
            <div className="fy-who">
              <Face r={r} size={40} />
              <span className="fy-who-t">
                <strong>{nameOf(r)}</strong>
                <span className="fy-sub">
                  {leadTitle(r)} · {r.now} now, {r.past} past
                </span>
              </span>
            </div>
            <span className="fy-why">{whyLine(r, peerBy.get(keyOf(r)))}</span>
            <div className="fy-three-acts">
              {r.memberId && <ConnectButton member={{ id: r.memberId, first: firstOfRec(r) }} conversationId={r.conversationId} label="Say hello" className="btn fy-btn-line" shared={sharedOf(r)} />}
              <button type="button" className="btn" onClick={() => openCard(r)}>
                See card
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ----- the bulk bar ----- */
  const selRecs = rows.filter((r) => sel.has(r.id));
  const selbar = selRecs.length > 0 && bottom === "dir" && (
    <div className="wb-selbar" role="toolbar" aria-label="Actions for selected rows">
      <strong className="wb-sel-n">{selRecs.length} selected</strong>
      <button
        type="button"
        className="wb-sel-btn wb-sel-primary"
        disabled={!selRecs.some((r) => r.memberId && !muted.has(r.memberId))}
        onClick={async () => {
          const ids = selRecs.map((r) => r.memberId).filter((x): x is string => !!x && !muted.has(x));
          let last = "";
          for (const id of ids) last = (await peersAct({ type: "peer.mute", memberId: id, on: true })).message;
          toast(ids.length === 1 ? last : `Muted ${ids.length} fractionals. Their leads, team-ups and circle posts won't reach you.`);
          setSel(new Set());
        }}
      >
        Mute
      </button>
      <span className="fy-selnote">A lead goes to one fractional at a time. Open a card to pass one.</span>
      <button type="button" className="wb-sel-clear" onClick={() => setSel(new Set())}>
        Clear
      </button>
    </div>
  );

  /* ----- the table and the cards ----- */
  const toggleSel = (id: string) =>
    setSel((s) => {
      const x = new Set(s);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });
  const heads: { k: string; name: string; fill: string }[] = [
    { k: "name", name: "Name", fill: `${fill.named}% named` },
    { k: "fn", name: "Function", fill: "100%" },
    { k: "seats", name: "Seats held", fill: "100%" },
    { k: "common", name: "Companies in common", fill: `${fill.common}% share one` },
    { k: "ind", name: "Industries", fill: `${fill.industries}% on file` },
    { k: "ev", name: "Evidence shown", fill: `${fill.ev}% show` },
    { k: "open", name: "Open to leads", fill: `${fill.open}% open` },
    ...(showKnow ? [{ k: "know", name: "How you know them", fill: `${rows.length ? Math.round((100 * rows.filter((r) => ctx.know.has(keyOf(r))).length) / rows.length) : 0}% known` }] : []),
  ];
  const shown = rows.slice(0, n);
  const subOf = (r: FractionalRec) =>
    !r.onMerlin ? (r.invite?.at ? `Invited ${timeAgo(r.invite.at)}` : "Not on Merlin yet") : r.memberId && muted.has(r.memberId) ? "Muted" : peerBy.get(keyOf(r))?.thread?.words ?? (r.name && /\.$/.test(r.name) ? "First name only for now" : "On Merlin");
  const table = (
    <div className="wb-scroll fy-scroll">
      <table className="wb-table fy-table">
        <thead>
          <tr className="wb-head">
            <th scope="col" className="wb-th-check">
              <span className="sr-only">Select</span>
            </th>
            {heads.map((h) => (
              <th key={h.k} scope="col" className={`fy-th-${h.k}`}>
                {h.name}
              </th>
            ))}
          </tr>
          <tr className="wb-fill">
            <td />
            {heads.map((h) => (
              <td key={h.k} className="wb-fill-td">
                {h.fill}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const on = open?.id === r.id;
            const cw = commonWords(r);
            const iw = industryWords(r);
            const lw = leadsWord(r);
            const kn = ctx.know.get(keyOf(r));
            return (
              <tr key={r.id} className={`${on || sel.has(r.id) ? "wb-on" : ""}${on ? " fy-open" : ""}`} onClick={(e) => !(e.target as HTMLElement).closest("button, a, input") && openCard(r)}>
                <td className="wb-td-check">
                  <input type="checkbox" className="wb-check" aria-label={`Select row ${i + 1}`} checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} />
                </td>
                <td className="fy-td-name">
                  <span className="fy-namecell">
                    <button type="button" className="fy-namebtn" aria-label={`Open the card of ${nameOf(r)}, row ${i + 1}`} onClick={() => openCard(r)}>
                      <Face r={r} />
                      <span className="fy-who-t">
                        <span className="fy-name">{nameOf(r)}</span>
                        <span className="fy-sub">{subOf(r)}</span>
                      </span>
                    </button>
                    <RowAction r={r} reload={load} />
                  </span>
                </td>
                <td>
                  <Two a={leadTitle(r)} b={levelLine(r)} />
                </td>
                <td>
                  <Two a={`${r.now} now`} b={`${r.past} past`} />
                </td>
                <td>{cw ? <Two a={cw.a} b={cw.b} /> : <Muted>None yet</Muted>}</td>
                <td>{iw ? <Two a={iw.a} b={iw.b} /> : <Muted>Not on file</Muted>}</td>
                <td>{!r.onMerlin ? <Muted>Not yet</Muted> : r.cases?.length ? <Two a={plural(r.cases.length, "case")} b="Chose to show" strong /> : <Muted>Not shared</Muted>}</td>
                <td>{lw === "Open" ? <span className="fy-pill fy-pill-mint">Open</span> : lw === "Not now" ? <span className="fy-pill">Not now</span> : <Muted>{lw || "Not said"}</Muted>}</td>
                {showKnow && <td>{kn ? <Two a={kn.from} b={kn.why} /> : <Muted>Not in your sources</Muted>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const cardList = (
    <div className="fy-cards">
      {shown.map((r) => (
        <article key={r.id} className={`fy-card${open?.id === r.id ? " on" : ""}`}>
          <button type="button" className="fy-namebtn" aria-label={`Open the card of ${nameOf(r)}`} onClick={() => openCard(r)}>
            <Face r={r} />
            <span className="fy-who-t">
              <span className="fy-name">{nameOf(r)}</span>
              <span className="fy-sub">{subOf(r)}</span>
            </span>
          </button>
          <span className="fy-card-t">
            {leadTitle(r)}
            <span className="fy-sub"> · {r.now} now, {r.past} past</span>
          </span>
          <span className="fy-card-line">{cardLine(r)}</span>
          <div className="fy-card-acts">
            {r.memberId ? (
              <>
                <ConnectButton member={{ id: r.memberId, first: firstOfRec(r) }} conversationId={r.conversationId} label="Message" className="btn fy-pine" shared={sharedOf(r)} />
                <PassButtonFor r={r} />
              </>
            ) : (
              <RowAction r={r} reload={load} wide />
            )}
          </div>
        </article>
      ))}
    </div>
  );
  const empty = data && !rows.length && !three.length && bottom === "dir" && (
    <div className="wb-empty-list">
      <strong>{emptyWords(viewNow, fxAny(f), anySource)}</strong>
      {fxAny(f) && (
        <button type="button" className="btn btn-sm" onClick={() => (setF(fxNone()), setAsked(null))}>
          Clear the filters
        </button>
      )}
    </div>
  );
  const more = rows.length > n && bottom === "dir" && (
    <button type="button" className="btn fy-more" onClick={() => setN((x) => x + STEP)}>
      Show {Math.min(STEP, rows.length - n)} more of {rows.length.toLocaleString("en-US")}
    </button>
  );

  /* ----- the panel ----- */
  const panelEl =
    panelNow?.kind === "you" ? (
      <YourCard me={me} mine={mine} first={first} peers={peers} onClose={() => setPanel(null)} onKnow={() => (setBottom("dir"), setView("know"))} phone={phone} />
    ) : open ? (
      <CardPanel
        key={open.id}
        r={open}
        peer={peerBy.get(keyOf(open))}
        know={ctx.know.get(keyOf(open))}
        leadsWith={[...(peers?.inbox ?? []), ...(peers?.sent ?? [])].filter((l) => !!open.memberId && l.who.id === open.memberId)}
        muted={!!open.memberId && muted.has(open.memberId)}
        myFn={ctx.myFn}
        pos={at >= 0 ? `${at + 1} of ${rows.length.toLocaleString("en-US")}` : three.includes(open) ? "Suggested" : "Not in this view"}
        onMove={move}
        onClose={() => setPanel(null)}
        seatIndex={seatIndex}
        waiting={c.waiting}
        reload={load}
        phone={phone}
      />
    ) : null;

  /* ----- the bottom tabs ----- */
  const teams = peers?.teams ?? [];
  const circleN = peers?.circle?.size ?? 0;
  const bottoms: [Bottom, string][] = [
    ["dir", `Directory · ${(data ? records.filter((r) => !r.you).length : 0).toLocaleString("en-US")}`],
    ["teams", `Your teams · ${teams.length}`],
    ["circle", peers?.circle ? `Your circle · ${circleN}` : "Join a circle"],
    ["muted", `Muted · ${peers?.muted.length ?? 0}`],
  ];
  const openTeam = teams.find((t) => t.id === space) ?? null;
  const extra =
    bottom === "teams" ? (
      <Teams teams={teams} onOpen={setSpace} />
    ) : bottom === "circle" ? (
      <div className="fy-extra">
        <CircleSection circle={peers?.circle ?? null} offer={peers?.offer ?? null} />
      </div>
    ) : bottom === "muted" ? (
      <MutedList list={peers?.muted ?? []} />
    ) : null;

  return (
    <>
      {header}
      <div className={`wb fy${phone ? " fy-phone" : ""}`}>
        <h1 className="sr-only">Fractionals</h1>
        {strip}
        {addr.welcome && <Welcome m={addr.m} mine={mine} onRecord={(id) => setPanel({ kind: "card", id })} />}
        {leads}
        {viewsRow}
        {bottom === "dir" && askRow}
        {bottom === "dir" && chipsRow}
        <div className="wb-body fy-body">
          <section aria-label={bottom === "dir" ? "Fractionals" : viewLabel} className="wb-main fy-main">
            {extra ?? (
              <>
                {ideal}
                {network}
                {starters}
                {selbar}
                {empty}
                {!!rows.length && (cards || phone ? cardList : table)}
                {more}
              </>
            )}
          </section>
          {panelEl && (phone ? <div className="fy-sheet" role="dialog" aria-modal aria-label={panelNow?.kind === "you" ? "Your card" : `Card of ${open ? nameOf(open) : ""}`}>{panelEl}</div> : panelEl)}
        </div>
        <div className="wb-bottom">
          <div role="tablist" aria-label="Fractionals and you" className="wb-bottom-tabs">
            {bottoms.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={bottom === k} className={`wb-btab${bottom === k ? " on" : ""}`} onClick={() => setBottom(k)}>
                {t}
              </button>
            ))}
          </div>
          <span className="wb-status" role="status" aria-live="polite">
            {bottom !== "dir"
              ? "Free on every plan"
              : first
                ? "Fellow fractionals are free to see on every plan. A message never costs a credit."
                : `Showing ${Math.min(n, rows.length).toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")}. Free on every plan${peers ? ` · ${peers.passesLeft} of 10 passes left today` : ""}`}
          </span>
        </div>
      </div>
      {openTeam && <TeamSpace t={openTeam} onClose={() => setSpace(null)} openCompany={c.openCompany} />}
    </>
  );
}

/* ---------- small parts ---------- */

function Two({ a, b, strong }: { a: string; b?: string; strong?: boolean }) {
  return (
    <span className="fy-two">
      <span className={strong ? "fy-strong" : undefined}>{a}</span>
      {b ? <span className="fy-sub">{b}</span> : null}
    </span>
  );
}
const Muted = ({ children }: { children: ReactNode }) => <span className="fy-muted">{children}</span>;

function Picker({ label, value, list, onPick }: { label: string; value: string; list: [string, number][]; onPick: (v: string) => void }) {
  const id = useId();
  if (!list.length) return null;
  return (
    <span className={`fy-picker${value ? " on" : ""}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">{label}: any</option>
        {list.map(([k, n]) => (
          <option key={k} value={k}>
            {k} · {n.toLocaleString("en-US")}
          </option>
        ))}
      </select>
    </span>
  );
}

function icpChips(me: Me): string[] {
  const icp = me.icp;
  if (!icp) return [];
  return [icp.industries.length ? `Industries: ${icp.industries.slice(0, 4).join(", ")}` : "", icp.employees.length ? `Size: ${icp.employees.join(", ")} people` : "", icp.revenue.length ? `Revenue: ${icp.revenue.join(", ")}` : "", icp.countries.length ? `Where: ${icp.countries.map(countryShort).join(", ")}` : ""].filter(Boolean);
}

function headlineOf(view: FxView, records: FractionalRec[], rows: FractionalRec[], counts: Record<FxView, number>, filtered: boolean, wait: string | null): string {
  if (wait) return wait;
  const others = records.filter((r) => !r.you);
  const on = (list: FractionalRec[]) => list.filter((r) => r.onMerlin).length;
  if (filtered) return `${plural(rows.length, "row matches", "rows match")} these filters`;
  if (view === "all") return `${others.length.toLocaleString("en-US")} fractionals on file. ${on(others).toLocaleString("en-US")} are on Merlin.`;
  if (view === "same") {
    const same = others.filter((r) => r.fits);
    return `${same.length.toLocaleString("en-US")} ${same.length === 1 ? "fractional serves" : "fractionals serve"} companies like yours. ${on(same).toLocaleString("en-US")} are on Merlin.`;
  }
  if (view === "know") return `${plural(counts.know, "fractional", "fractionals")} you already know. Only you see this view.`;
  return `${plural(counts.passed, "fractional has", "fractionals have")} passed you a lead.`;
}

function emptyWords(view: FxView, filtered: boolean, anySource: boolean): string {
  if (filtered) return "Nobody matches these filters.";
  if (view === "know") return anySource ? "Nobody you know is a fractional on Merlin yet. Invite them from All." : "Bring in who you know above, and the fractionals you have already met show here.";
  if (view === "passed") return "Nobody has passed you a lead yet. While you are open to leads, a company a fractional passes you opens free for you.";
  if (view === "same") return "Say who your clients are, and Merlin finds the fractionals who serve the same kind.";
  return "Nobody on file yet.";
}

/** "Software, EdTech · 51–200 people. In common: Halcyon Freight. Shows 2 cases. Open to leads." */
function cardLine(r: FractionalRec): string {
  const iw = industryWords(r);
  const cw = commonWords(r);
  return [iw ? [iw.a, iw.b].filter(Boolean).join(" · ") : "", cw ? `In common: ${cw.a}` : "", r.cases?.length ? `Shows ${plural(r.cases.length, "case")}` : "", r.leads === "open" ? "Open to leads" : ""].filter(Boolean).join(". ");
}

/** Why Merlin suggests them: their kind of client, then what you have in common, else Peers' own words. */
function whyLine(r: FractionalRec, p: PeerRec | undefined): string {
  const iw = industryWords(r);
  const cw = commonWords(r);
  const out = [iw ? [iw.a, iw.b].filter(Boolean).join(" · ") : "", cw ? `${cw.a}: ${cw.b.charAt(0).toLowerCase()}${cw.b.slice(1)}` : p?.why ?? ballChip(r) ?? ""].filter(Boolean).join(". ");
  return out ? `${out}.` : r.fn ? `A ${r.fn} fractional on Merlin.` : "A fractional on Merlin.";
}

/** The one action in a row: Invite (not on Merlin, the member can see a seat's company), See who (a locked name, free), or the Message icon. */
function RowAction({ r, reload, wide }: { r: FractionalRec; reload: () => Promise<void>; wide?: boolean }) {
  const ui = useUi();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (r.you) return null;
  if (r.memberId)
    return wide ? null : (
      <ConnectButton member={{ id: r.memberId, first: firstOfRec(r) }} conversationId={r.conversationId} label={<span className="sr-only">Message {firstOfRec(r)}</span>} className="fy-msg" shared={sharedOf(r)} />
    );
  if (r.locked && !r.onMerlin)
    return (
      <button
        type="button"
        className={`btn btn-sm${wide ? " fy-wide" : ""}`}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          const out = await ui.act({ type: "unlockFractional", id: r.id });
          setBusy(false);
          if (out.ok) await reload();
        }}
      >
        See who · free
      </button>
    );
  if (r.invite)
    return (
      <>
        <button ref={btn} type="button" className={`fy-invite${wide ? " fy-wide" : ""}`} aria-label={`Invite ${nameOf(r)} to connect`} onClick={() => setInviting(true)}>
          {wide ? "Invite to connect" : "Invite"}
        </button>
        {inviting && <InviteSheet r={r} onClose={() => setInviting(false)} restore={() => btn.current} reload={reload} />}
      </>
    );
  return null;
}

function PassButtonFor({ r, className = "btn fy-btn-line" }: { r: FractionalRec; className?: string }) {
  const c = useApp();
  const [open, setOpen] = useState(false);
  if (!r.memberId) return null;
  const off = r.leads === "off";
  return (
    <>
      <button type="button" className={className} disabled={off} title={off ? `${firstOfRec(r)} is not taking leads right now.` : undefined} onClick={() => setOpen(true)}>
        Pass a lead
      </button>
      {open && <PassSheet from="record" to={{ id: r.memberId, first: firstOfRec(r) }} infos={c.infos} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---------- the leads strip ---------- */

function LeadsStrip({ peers, first, all, onAll, focus, openTeam }: { peers: ReturnType<typeof usePeers>["view"]; first: boolean; all: boolean; onAll: () => void; focus: string | null; openTeam: (id: string) => void }) {
  const c = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!peers) return null;
  // Two of each before "Show all"; one on a phone, where the list should show on the first screen.
  const few = c.phone ? 1 : 2;
  const asks = peers.teams.filter((t) => !t.invited && t.status === "invited");
  const inbox = [...peers.inbox].sort((a, b) => Number(b.status === "new") - Number(a.status === "new") || b.at.localeCompare(a.at));
  const fresh = inbox.filter((l) => l.status === "new").length + asks.length;
  const answer = async (l: LeadRec, take: boolean) => {
    setBusy(l.id + take);
    const r = await peersAct({ type: "peer.answer", id: l.id, take });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const teamAnswer = async (t: TeamRec, join: boolean) => {
    setBusy(t.id + join);
    const r = await peersAct({ type: "peer.teamAnswer", id: t.id, join });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const toItems: ReactNode[] = [
    ...asks.map((t) => (
      <LeadLine key={t.id} id={t.id} face={t.with.name} line={`${t.with.first} wants to team up on ${t.name ?? (t.kind ? `a ${t.kind}` : "a company")}`} sub={`${t.me.fn && t.with.fn ? `A ${t.with.fn} and ${t.me.fn} pitch, together · ` : ""}${timeAgo(t.at)}`}>
        <button type="button" className="btn btn-sm btn-pine" aria-busy={busy === t.id + "true"} onClick={() => void teamAnswer(t, true)}>
          Team up
        </button>
        <button type="button" className="btn btn-sm" aria-busy={busy === t.id + "false"} onClick={() => void teamAnswer(t, false)}>
          Not now
        </button>
        <button type="button" className="fy-link" onClick={() => openTeam(t.id)}>
          See the team space
        </button>
      </LeadLine>
    )),
    ...inbox.map((l) => (
      <LeadLine
        key={l.id}
        id={l.id}
        focus={focus === l.id}
        face={l.who.name}
        line={l.line}
        sub={
          l.status === "new"
            ? `${l.note ? `“${l.note.slice(0, 90)}${l.note.length > 90 ? "…" : ""}” · ` : ""}${timeAgo(l.at)} · Opened free for you`
            : l.status === "taken"
              ? `${timeAgo(l.at)} · ${l.won ? "You won it" : `In your pipeline${l.stage ? `, at ${l.stage}` : ""}`}`
              : `${timeAgo(l.at)} · You said it is not for you. ${l.who.first} has been told.`
        }
      >
        {l.status === "new" ? (
          <>
            <button type="button" className="btn btn-sm btn-pine" aria-busy={busy === l.id + "true"} onClick={() => void answer(l, true)}>
              Take it
            </button>
            <button type="button" className="btn btn-sm" aria-busy={busy === l.id + "false"} onClick={() => void answer(l, false)}>
              Not for me
            </button>
          </>
        ) : null}
        <button type="button" className="fy-link" onClick={() => c.openCompany(l.company)}>
          Open the company
        </button>
        {l.conversationId && l.status !== "new" && (
          <button type="button" className="fy-link" onClick={() => openConversation(c.openPage, l.conversationId!)}>
            Thank {l.who.first}
          </button>
        )}
      </LeadLine>
    )),
  ];
  const byItems: ReactNode[] = peers.sent.map((l) => (
    <LeadLine key={l.id} id={l.id} face={l.who.name} line={`${l.name ?? (l.kind ? `A ${l.kind}` : "A company")} to ${l.who.name}`} sub={`${timeAgo(l.at)} · ${l.won ? `${l.who.first} won it, and the win counts for you too` : l.status === "taken" ? `${l.who.first} took it into the pipeline` : l.status === "declined" ? `${l.who.first} said it was not a fit` : "No answer yet"}`}>
      <span className={`fy-pill${l.status === "taken" ? " fy-pill-volt" : ""}`}>{l.won ? `Won${l.credited ? ` · ${l.credited} credits earned` : ""}` : l.status === "taken" ? `Taken${l.credited ? ` · ${l.credited} credits earned` : ""}` : l.status === "declined" ? "Not taken" : "Waiting"}</span>
      {l.conversationId && (
        <button type="button" className="fy-link" onClick={() => openConversation(c.openPage, l.conversationId!)}>
          Your thread
        </button>
      )}
    </LeadLine>
  ));
  const taken = peers.sent.filter((l) => l.status === "taken").length;
  const won = peers.sent.filter((l) => l.won).length;
  const earned = peers.sent.reduce((n, l) => n + (l.credited ?? 0), 0);
  const col = (title: string, items: ReactNode[], sum: string, emptyText: ReactNode, badge?: number) => (
    <div className="fy-leadcol">
      <div className="fy-leadcol-h">
        <h2>{title}</h2>
        {!!badge && <span className="fy-hot">{badge} new</span>}
        <span className="fy-sub fy-grow">{sum}</span>
        {items.length > few && (
          <button type="button" className="fy-link" aria-expanded={all} onClick={onAll}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        )}
      </div>
      {items.length ? (all ? items : items.slice(0, few)) : <p className="fy-leadempty">{emptyText}</p>}
    </div>
  );
  return (
    <section id="leads" aria-label="Leads" className="fy-leads">
      {col(
        "Leads passed to you",
        toItems,
        first ? (peers ? "" : "") : "Each one opened free for you",
        first ? (
          <>
            <span className="fy-pill">Example</span> A fractional passes you a company with an open role in your function. It opens free for you: take it, or say it is not for you.
          </>
        ) : (
          "Nothing passed to you yet. While you are open to leads, a company a fractional passes you opens free for you."
        ),
        fresh,
      )}
      {col(
        "Leads you passed",
        byItems,
        peers.sent.length ? `${peers.sent.length} passed · ${taken} taken · ${won} won${earned ? ` · ${earned} credits earned` : ""}` : `${peers.passesLeft} of 10 passes left today`,
        "Nothing passed yet. Open a card and choose Pass a lead. The company opens free for them, and you earn 5 credits when it is taken.",
      )}
    </section>
  );
}

function LeadLine({ id, face, line, sub, focus, children }: { id: string; face: string; line: string; sub: string; focus?: boolean; children?: ReactNode }) {
  const ini = face
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div id={`fy-lead-${id}`} className={`fy-lead${focus ? " fy-lead-focus" : ""}`}>
      <span className="fy-av" aria-hidden style={{ width: 30, height: 30, flexBasis: 30, background: tintOf(face) }}>
        {ini}
      </span>
      <span className="fy-lead-t">
        <strong>{line}</strong>
        <span className="fy-sub">{sub}</span>
      </span>
      <span className="fy-lead-acts">{children}</span>
    </div>
  );
}

/* ---------- a fractional's card ---------- */

function CardPanel({
  r,
  peer,
  know,
  leadsWith,
  muted,
  myFn,
  pos,
  onMove,
  onClose,
  seatIndex,
  waiting,
  reload,
  phone,
}: {
  r: FractionalRec;
  peer: PeerRec | undefined;
  know: { from: string; why: string } | undefined;
  leadsWith: LeadRec[];
  muted: boolean;
  myFn: string | null;
  pos: string;
  onMove: (d: number) => void;
  onClose: () => void;
  seatIndex: Map<string, SeatAt>;
  waiting: boolean;
  reload: () => Promise<void>;
  phone: boolean;
}) {
  const c = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("seats");
  const [sheet, setSheet] = useState<"team" | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), [r.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".sheet, [role=dialog][aria-modal=true]:not(.fy-sheet)")) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const fnm = firstOfRec(r);
  const total = r.now + r.past;
  const cl = r.clients;
  const serve = cl ? [...cl.industries.slice(0, 4), ...cl.employees.slice(0, 2).map((x) => `${x} people`), ...cl.countries.slice(0, 2).map(countryShort)] : [];
  const conn: { k: string; v: string; link?: { t: string; go: () => void } }[] = [];
  const cw = commonWords(r);
  if (cw) conn.push({ k: "Companies in common", v: `${cw.a}. ${cw.b}.` });
  if (know) conn.push({ k: "Where you know them from", v: `${know.from}. ${know.why ? `${know.why}. ` : ""}Only you see this.` });
  if (peer?.thread) conn.push({ k: "Your thread", v: `${peer.thread.words}.`, link: { t: "Open the thread", go: () => openConversation(c.openPage, peer.thread!.id) } });
  else if (r.conversationId) conn.push({ k: "Your thread", v: "You have a conversation on Merlin.", link: { t: "Open the thread", go: () => openConversation(c.openPage, r.conversationId!) } });
  if (leadsWith.length) {
    const to = leadsWith.filter((l) => l.side === "from-you");
    const from = leadsWith.filter((l) => l.side === "to-you");
    conn.push({ k: "Leads between you", v: [from.length ? `${fnm} passed you ${from.length === 1 ? from[0].name ?? "a company" : `${from.length} leads`}.` : "", to.length ? `You passed ${fnm} ${to.length === 1 ? to[0].name ?? "a company" : `${to.length} leads`}${to.some((l) => l.won) ? ", and one was won" : ""}.` : ""].filter(Boolean).join(" ") });
  }
  const ball = ballChip(r);
  if (ball && !cw) conn.push({ k: "Your Crystal Ball", v: `${ball}.` });
  conn.push({
    k: "Why Merlin shows them",
    v: `${r.fits ? "Serves the same kind of client as you. " : ""}${r.fn && myFn && r.fn === myFn ? "Same function as you: a good home for a lead you cannot take." : r.fn ? `${r.fn} leaders work beside ${myFn ?? "you"} at the same clients.` : "A fellow fractional on Merlin's files."}`,
  });
  const tabs: [Tab, string][] = [
    ["seats", `Seats · ${total}`],
    ["ev", `Evidence · ${r.cases?.length ?? 0}`],
    ["conn", "Connection"],
  ];
  return (
    <aside className="fy-panel" aria-labelledby="fy-card-h">
      <div className="fy-panel-bar">
        <strong>Card</strong>
        <span className="fy-sub fy-grow">{pos}</span>
        <button type="button" className="wb-iconbtn" aria-label="Previous fractional" onClick={() => onMove(-1)}>
          <IconChevron dir="up" />
        </button>
        <button type="button" className="wb-iconbtn" aria-label="Next fractional" onClick={() => onMove(1)}>
          <IconChevron dir="down" />
        </button>
        <button type="button" className="wb-iconbtn" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <div className="fy-panel-body">
        <div className="fy-who">
          <Face r={r} size={48} />
          <div className="fy-who-t">
            <h2 id="fy-card-h" ref={head} tabIndex={-1} className="fy-card-name">
              {nameOf(r)}
            </h2>
            <span className="fy-card-title">{leadTitle(r)}</span>
            <span className="fy-sub">{[levelLine(r), `${r.now} now, ${r.past} past`].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        {(r.headline || r.city) && (
          <p className="fy-headline-own">
            {r.headline && <span>{r.headline}</span>}
            {r.city && <span className="fy-sub">Based in {r.city}</span>}
          </p>
        )}
        <div className="fy-tags">
          {!r.onMerlin ? (
            <span className="fy-pill">{r.invite?.at ? `Invited ${timeAgo(r.invite.at)}` : "Not on Merlin yet"}</span>
          ) : (
            <>
              <span className="fy-pill fy-pill-mint">On Merlin{r.since ? ` since ${fmtMonth(r.since.slice(0, 7))}` : ""}</span>
              {r.name && /\.$/.test(r.name) && <span className="fy-pill">First name only for now</span>}
              {r.leads === "open" ? <span className="fy-pill fy-pill-mint">Open to leads</span> : r.leads === "off" ? <span className="fy-pill">Not taking leads now</span> : null}
              {muted && <span className="fy-pill">Muted</span>}
            </>
          )}
          {r.unlocked && <span className="fy-pill">You unlocked them</span>}
        </div>
        {r.memberId ? (
          <>
            <div className="fy-card-acts">
              <ConnectButton member={{ id: r.memberId, first: fnm }} conversationId={r.conversationId ?? peer?.thread?.id} label="Message" className="btn fy-pine fy-big" shared={sharedOf(r)} />
              <PassButtonFor r={r} className="btn fy-btn-line fy-big" />
            </div>
            <div className="fy-card-more">
              <button type="button" className="fy-link" onClick={() => setSheet("team")}>
                <IconUsers size={13} /> Team up on a company
              </button>
              <button type="button" className="fy-link fy-under" aria-pressed={muted} onClick={() => void peersAct({ type: "peer.mute", memberId: r.memberId!, on: !muted }).then((x) => toast(x.message, !x.ok))}>
                {muted ? `Unmute ${fnm}` : `Mute ${fnm}`}
              </button>
            </div>
          </>
        ) : (
          <div className="fy-card-acts fy-col">
            <RowAction r={r} reload={reload} wide />
            {r.invite && <span className="fy-note">Merlin does not have their email. You send the note yourself. When they join through your link you are connected, and you both earn credits.</span>}
            {!r.invite && !r.locked && <span className="fy-note">Open one of their companies to invite them to connect.</span>}
          </div>
        )}
        <div role="tablist" aria-label="Card" className="wb-tabs fy-cardtabs">
          {tabs.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`wb-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
              {t}
            </button>
          ))}
        </div>
        {tab === "seats" && (
          <div className="fy-tabbody">
            {serve.length > 0 && (
              <div className="fy-serve">
                <span className="fy-k">Who they serve</span>
                {serve.map((t) => (
                  <span key={t} className="fy-schip">
                    {t}
                  </span>
                ))}
                <span className="fy-sub">{cl?.from === "stated" ? "In their own words" : "Read from their seats"}</span>
              </div>
            )}
            {waiting ? (
              <p className="fy-sub" role="status">
                Loading their seats
              </p>
            ) : !r.seats.length ? (
              <p className="fy-note">No seat of {r.onMerlin && r.memberId ? `${fnm}'s` : "theirs"} is on file yet.</p>
            ) : (
              <ul className="fy-seats">
                {r.seats.map((s) => (
                  <li key={s.id}>
                    <SeatCard at={seatIndex.get(s.id) ?? null} now={s.now} />
                  </li>
                ))}
              </ul>
            )}
            <span className="fy-sub">{r.onMerlin ? `From ${fnm}, and Revenue Nomad research.` : "From Revenue Nomad research."}</span>
          </div>
        )}
        {tab === "ev" && (
          <div className="fy-tabbody">
            <span className="fy-note">
              {r.cases?.length
                ? `${fnm} chose to show ${plural(r.cases.length, "case")}. Client names stay hidden unless the client agreed.`
                : r.onMerlin
                  ? `${fnm} has not chosen to show any evidence. You can ask in a message.`
                  : `Evidence shows once ${fnm} joins Merlin and chooses to show it.`}
            </span>
            {(r.cases ?? []).map((x, i) => (
              <div key={i} className="fy-case">
                <strong>{x.title}</strong>
                {x.outcome && <span>{x.outcome}</span>}
                <span className="fy-sub">Client name hidden unless they agreed</span>
              </div>
            ))}
          </div>
        )}
        {tab === "conn" && (
          <div className="fy-tabbody">
            <strong className="fy-conn-h">How you are connected</strong>
            {conn.map((x) => (
              <div key={x.k} className="fy-conn">
                <span className="fy-k">{x.k}</span>
                <span>{x.v}</span>
                {x.link && (
                  <button type="button" className="fy-link" onClick={x.link.go}>
                    {x.link.t}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {sheet === "team" && r.memberId && <TeamSheet to={{ id: r.memberId, first: fnm }} infos={c.infos} onClose={() => setSheet(null)} />}
      {phone ? null : null}
    </aside>
  );
}

/* ---------- your own card ---------- */

function YourCard({ me, mine, first, peers, onClose, onKnow, phone }: { me: Me; mine: FractionalRec | null; first: boolean; peers: ReturnType<typeof usePeers>["view"]; onClose: () => void; onKnow: () => void; phone: boolean }) {
  const c = useApp();
  const ui = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState(me.headline ?? "");
  const [city, setCity] = useState(me.city ?? "");
  const lineId = useId();
  const cityId = useId();
  useEffect(() => setLine(me.headline ?? ""), [me.headline]);
  useEffect(() => setCity(me.city ?? ""), [me.city]);
  const close = me.plan?.canClose ?? true;
  const shownName = cardName(me);
  const listed = me.fractionals === true && !me.nameHidden;
  const run = async (key: string, a: Parameters<typeof ui.act>[0]) => {
    setBusy(key);
    await ui.act(a);
    setBusy(null);
  };
  const dirty = line !== (me.headline ?? "") || city !== (me.city ?? "");
  const ini = me.nameHidden ? "?" : me.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const cases = mine?.cases?.length ?? 0;
  const icp = me.icp;
  const chips = [...(icp?.industries.slice(0, 4) ?? []), ...(icp?.employees.slice(0, 2).map((x) => `${x} people`) ?? [])];
  const sw = (key: string, name: string, on: boolean, note: string, flip: () => void, link?: { t: string; go: () => void; href: string }, disabled?: boolean) => (
    <div className="fy-sw">
      <button type="button" role="switch" aria-checked={on} className="fy-sw-b" disabled={disabled || busy === key} aria-busy={busy === key} onClick={flip}>
        <span className={`fy-track${on ? " on" : ""}`} aria-hidden>
          <span />
        </span>
        {name}
      </button>
      <span className="fy-sub">
        {note}{" "}
        {link && (
          <a href={link.href} onClick={(e) => (e.preventDefault(), link.go())}>
            {link.t}
          </a>
        )}
      </span>
    </div>
  );
  const sources = peers?.sources;
  const nSources = (sources?.google ? 1 : 0) + (sources?.linkedin ? 1 : 0);
  return (
    <aside className="fy-panel" aria-labelledby="fy-you-h">
      <div className="fy-panel-bar">
        <strong id="fy-you-h">Your card</strong>
        <span className="fy-sub fy-grow">What other members see</span>
        <button type="button" className="wb-iconbtn" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <div className="fy-panel-body">
        <div className={`fy-mine${first && me.fractionals === null ? " fy-mine-first" : ""}`}>
          <div className="fy-who">
            <span className="fy-av fy-av-me" aria-hidden style={{ width: 44, height: 44, flexBasis: 44 }}>
              {ini}
            </span>
            <div className="fy-who-t">
              <strong className="fy-card-name">{shownName.name}</strong>
              <span>{[me.title || (me.function ? `Fractional ${me.function} leader` : ""), mine?.level].filter(Boolean).join(" · ")}</span>
              <span className="fy-sub">
                {mine ? `${mine.now} ${mine.now === 1 ? "seat" : "seats"} now, ${mine.past} past. ` : ""}
                <a href={c.hrefOf("seats")} onClick={(e) => (e.preventDefault(), c.openPage("seats"))}>
                  Your seats
                </a>
              </span>
            </div>
          </div>
          {(me.headline || me.city) && (
            <p className="fy-headline-own">
              {me.headline && <span>{me.headline}</span>}
              {me.city && <span className="fy-sub">Based in {me.city}</span>}
            </p>
          )}
          <div className="fy-tags">
            {chips.map((t) => (
              <span key={t} className="fy-schip">
                {t}
              </span>
            ))}
            {me.leads !== false && <span className="fy-pill fy-pill-mint">Open to leads</span>}
            {close && cases > 0 && <span className="fy-pill fy-pill-mint">{plural(cases, "evidence case")}</span>}
            <button type="button" className="fy-link" onClick={c.openProfile}>
              Change who you serve
            </button>
          </div>
          <span className="fy-sub">{shownName.state} Never shown: your email, rates or pipeline.</span>
        </div>
        {first && me.fractionals === null && !me.nameHidden && (
          <button type="button" className="btn btn-pine fy-big" disabled={busy === "dir"} aria-busy={busy === "dir"} onClick={() => void run("dir", { type: "settings", fractionals: true })}>
            Show my card to members
          </button>
        )}
        <form
          className="fy-own"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) void run("line", { type: "settings", headline: line, city });
          }}
        >
          <label htmlFor={lineId} className="fy-k">
            One line about you
          </label>
          <input id={lineId} className="input" value={line} maxLength={CARD_LINE_MAX} placeholder="I build the first sales team at software companies" onChange={(e) => setLine(e.target.value)} />
          <label htmlFor={cityId} className="fy-k">
            Based in
          </label>
          <input id={cityId} className="input" value={city} maxLength={CARD_CITY_MAX} placeholder="Denver, CO" onChange={(e) => setCity(e.target.value)} />
          <span className="fy-own-foot">
            <span className="fy-sub">{listed ? "Members see both on your card." : "Both show once you are in the directory."} No emails, links or phone numbers.</span>
            <button type="submit" className="btn btn-sm" disabled={!dirty || busy === "line"} aria-busy={busy === "line"}>
              Save
            </button>
          </span>
        </form>
        <div className="fy-sws">
          {sw(
            "dir",
            "Show me in the Fractionals directory",
            listed,
            me.nameHidden ? "Off while your name is hidden." : me.fractionals === true ? "On. Members see this card, free." : me.fractionals === false ? "Off. You are out of the directory." : "Not chosen yet.",
            () => void run("dir", me.nameHidden ? { type: "settings", nameHidden: false } : { type: "settings", fractionals: !listed }),
          )}
          {sw("hide", "Hide my name on my seats", !!me.nameHidden, me.nameHidden ? 'On. Seats read "A fractional (name hidden)".' : "Off. Your name shows on your seats.", () => void run("hide", { type: "settings", nameHidden: !me.nameHidden }))}
          {sw("leads", "Open to leads", me.leads !== false, me.leads !== false ? "On. A passed company opens free for you." : "Off. Nobody can pass you a lead.", () => void run("leads", { type: "settings", leads: me.leads === false }))}
          {close ? (
            sw(
              "ev",
              "Show evidence on my card",
              cases > 0,
              cases > 0 ? `${plural(cases, "case")} ${cases === 1 ? "shows" : "show"}, client names hidden.` : "No case on your card yet.",
              () => c.openPage("evidence"),
              { t: cases > 0 ? "Choose which" : "Choose one in Evidence Bank", go: () => c.openPage("evidence"), href: c.hrefOf("evidence") },
            )
          ) : (
            <div className="fy-sw">
              <span className="fy-sw-b fy-sw-static">
                Show evidence on my card <span className="fy-pill">Close</span>
              </span>
              <span className="fy-sub">
                Evidence Bank comes with the Close plan.{" "}
                <a href={c.hrefOf("evidence")} onClick={(e) => (e.preventDefault(), c.openPage("evidence"))}>
                  See what it does
                </a>
              </span>
            </div>
          )}
        </div>
        <div className="fy-mynet">
          <span>
            <strong>Your network.</strong> {nSources ? `${plural(nSources, "source")} connected. Only you see who you know.` : "Nothing connected yet."}
          </span>
          <button type="button" className="fy-link" onClick={onKnow}>
            {nSources ? "See the fractionals you know" : "Bring in who you know"}
          </button>
        </div>
        {phone && (
          <button type="button" className="btn" onClick={onClose}>
            Back to the list
          </button>
        )}
      </div>
    </aside>
  );
}

/* ---------- teams and muted ---------- */

function Teams({ teams, onOpen }: { teams: TeamRec[]; onOpen: (id: string) => void }) {
  return (
    <div className="fy-extra">
      <h2>Your teams</h2>
      <p className="fy-note">Companies you pursue with another fractional, such as a CMO and a VP Sales pitching together. To start one, open a card and choose Team up on a company.</p>
      {teams.length ? (
        teams.map((t) => (
          <div key={t.id} className="fy-xrow">
            <span className="fy-av" aria-hidden style={{ width: 34, height: 34, flexBasis: 34, background: tintOf(t.with.name) }}>
              <IconUsers size={14} />
            </span>
            <span className="fy-lead-t">
              <strong>
                {t.name ?? (t.kind ? `A ${t.kind}` : "A locked company")}, with {t.with.name}
              </strong>
              <span className="fy-sub">
                {t.status === "active"
                  ? `Active since ${timeAgo(t.at)}.${t.stages.you ? ` You: ${t.stages.you}.` : ""}${t.stages.them ? ` ${t.with.first}: ${t.stages.them}.` : ""}`
                  : t.status === "invited"
                    ? t.invited
                      ? `Waiting for ${t.with.first} since ${timeAgo(t.at)}.`
                      : `${t.with.first} asked you to team up, ${timeAgo(t.at)}.`
                    : t.left === "you"
                      ? "You left this team."
                      : `${t.with.first} left this team.`}
              </span>
            </span>
            <button type="button" className="btn fy-btn-line" onClick={() => onOpen(t.id)}>
              Open the team space
            </button>
          </div>
        ))
      ) : (
        <div className="fy-xrow">
          <span className="fy-pill">Example</span>
          <span className="fy-lead-t">
            <strong>A company, with a fractional CMO</strong>
            <span className="fy-sub">A shared thread, one note you both edit, and both deals marked as teamed. Either of you can leave.</span>
          </span>
        </div>
      )}
    </div>
  );
}

function MutedList({ list }: { list: { id: string; name: string }[] }) {
  const toast = useToast();
  return (
    <div className="fy-extra">
      <h2>Muted</h2>
      <p className="fy-note">No leads, team asks or circle posts from a muted member reach you. They are not told. Mute someone from their card.</p>
      {list.length ? (
        list.map((m) => (
          <div key={m.id} className="fy-xrow">
            <span className="fy-lead-t">
              <strong>{m.name}</strong>
            </span>
            <button type="button" className="btn fy-btn-line" onClick={() => void peersAct({ type: "peer.mute", memberId: m.id, on: false }).then((x) => toast(x.message, !x.ok))}>
              <IconCheck size={13} /> Unmute
            </button>
          </div>
        ))
      ) : (
        <p className="fy-sub">Nobody is muted. You hear from every fractional you talk to.</p>
      )}
    </div>
  );
}
