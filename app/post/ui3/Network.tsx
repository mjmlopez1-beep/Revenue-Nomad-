"use client";

/**
 * My Network in the new design (find-design/v5, rounds 7 to 9): "Your network in motion." The four
 * summary cards are filters (business opportunities, decision makers, former clients, fellow
 * fractionals); Opportunities, All contacts and Companies; quick filters (Hiring now in gold,
 * Emerging demand in purple, Strong, Fading) and the sources menu; one row a person with the
 * evidence of how the member knows them and when they last connected (only facts Merlin has: their
 * own imported contacts, their mail and calendar metadata when Google is connected, messages on
 * Merlin, a fellow member, their own seats), the company and its demand, and one action chosen by
 * the situation (Request an intro, Discuss opportunity, Reconnect). Every action opens the drafted
 * note in the member's own voice (MoveNote's NoteSheet: who, why now, the shared history); nothing
 * goes out without their tap. The right column is the next move (the real warm path, drawn) and
 * the relationships worth nurturing.
 *
 * The relationship band shows only where Merlin derives one (Google or messages); nothing is shown
 * for a contacts file alone. Never another member's network: only the member's own sources.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Me } from "@/lib/tableTypes";
import type { KnownPersonView } from "@/lib/paths/types";
import type { RadarRow } from "@/lib/radar/types";
import type { KnowPerson, Move } from "@/lib/moves";
import { fromGoogle } from "@/lib/moves";
import { useApp } from "../shell/pages";
import { useToast } from "../../ui/shared";
import { awayAct, useKnown } from "../network/usePaths";
import { useWayIn } from "../network/useWays";
import { loadPipeline, pipelineAct } from "../pipelineStore";
import { defaultSeeds } from "../find/lookalikes";
import type { CoInfo } from "../model";
import { useUi3Head } from "./head";
import { isWarm, setWarmFocus, useTargets, useWarmShared, type TRow } from "./data";
import { Art } from "./illustrations";
import { Ic, type IconName } from "./icons";
import { Av, Band, Chip, CoLogo, RowMenu, Wait } from "./parts";
import { agoWords, coName, initialsOf, numWord, plural, relOfWarmth, tintOf, type RelBand } from "./model";
import { oppTitle } from "./Home";

const NoteSheet = dynamic(() => import("../MoveNote").then((m) => m.NoteSheet), { ssr: false });

type Grp = "opps" | "dm" | "clients" | "fellows";
type Tab = "opps" | "all" | "cos";
type QF = "hire" | "emerge" | "strong" | "fading";
type Src = "google" | "file" | "messages" | "member";
type Act = { k: "intro" | "discuss" | "reconnect"; l: string; ic: IconName };

const DM_TITLE = /\b(ceo|cfo|cro|coo|cmo|cto|chief|founder|co-founder|president|owner|managing director|general manager|vp|vice president|head of|partner)\b/i;
const FRACTIONAL_TITLE = /\b(fractional|interim|advisor|consultant)\b/i;

interface Person {
  p: KnownPersonView;
  i: CoInfo | null;
  band: RelBand | null;
  /** Gold: an open role there. Purple: Crystal Ball's predicted demand. Never both. */
  demand: { k: "hire"; line: string } | { k: "emerge"; line: string } | null;
  dm: boolean;
  client: boolean;
  fellow: boolean;
  t: TRow | null;
}

/** How the member knows them, as evidence lines: only facts Merlin has. */
function evidence(x: Person, clientCos: Set<string>, byId: Map<string, CoInfo>): { ic: IconName; t: string }[] {
  const p = x.p;
  const out: { ic: IconName; t: string }[] = [];
  if (p.member) out.push({ ic: "team", t: "Fellow member on Merlin" });
  if (p.company && clientCos.has(p.company)) {
    const co = byId.get(p.company);
    out.push({ ic: "star", t: `At ${co && !co.c.hidden ? co.c.name : "a company"} where you held a seat` });
  }
  if (p.src.includes("google")) out.push({ ic: "mail", t: p.why });
  else if (p.src.includes("messages")) out.push({ ic: "chat", t: p.why });
  else if (p.src.includes("linkedin") || p.src.includes("csv")) out.push({ ic: "doc", t: "From your imported contacts" });
  if (p.last && p.lastKind) out.push({ ic: "cal", t: `${p.lastKind === "Meeting" ? "Last met" : p.lastKind === "Email" ? "Last emailed" : "Last message on Merlin"} ${(agoWords(p.last) ?? "").toLowerCase()}` });
  return out;
}

function actionOf(x: Person): Act {
  if (x.band === "Fading" || x.band === "Cold") return { k: "reconnect", l: "Reconnect", ic: "cal" };
  if (x.demand && x.dm) return { k: "discuss", l: "Discuss opportunity", ic: "cal" };
  if (x.demand) return { k: "intro", l: "Request an intro", ic: "send" };
  return { k: "reconnect", l: "Reconnect", ic: "cal" };
}

/** The drafted note for an action: a move with the person the member knows, and what happened there. */
function noteFor(x: Person, a: Act, me: Me): { m: Move; row: RadarRow } | null {
  const i = x.i;
  if (!i || i.c.hidden) return null;
  const p = x.p;
  const person: KnowPerson = { name: p.name, title: p.title, email: p.email, warmth: p.warmth ?? "Cold", last: p.last, meetings: 0, emails: 0, dm: x.dm, google: fromGoogle(p.src) };
  const role = x.t?.role ?? null;
  const row: RadarRow = x.demand?.k === "emerge" ? { id: i.c.id, kinds: [], lines: [x.demand.line] } : role ? { id: i.c.id, kinds: ["role"], lines: [`New open role: ${role.title}`] } : { id: i.c.id, kinds: [], lines: [] };
  const m: Move = {
    id: i.c.id,
    name: i.c.name,
    hidden: false,
    facts: "",
    hiring: !!role,
    open: role ? { kind: "role", seatId: role.e.id, title: role.title, fn: null, since: null, posting: null } : null,
    band: null,
    why: x.demand?.line ?? "You know someone here.",
    way: { kind: "know", person },
    // Never the reply note: it says "I applied", and the member may not have.
    do: a.k === "intro" ? "intro" : "message",
    title: "",
    line: "",
  };
  void me;
  return { m, row };
}

export function Ui3Network() {
  const c = useApp();
  const me = c.me;
  useUi3Head([{ label: "Find" }], "My Network");
  const toast = useToast();
  const k = useKnown();
  const t = useTargets();
  const warm = useWarmShared().data;
  const [grp, setGrp] = useState<Grp | null>(null);
  const [tab, setTab] = useState<Tab>("opps");
  const [qf, setQf] = useState<QF | null>(null);
  const [src, setSrc] = useState<Src | null>(null);
  const [sort, setSort] = useState<"due" | "recent" | "name">("due");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ m: Move; row: RadarRow; intro: boolean; first: string; strength: string | null } | null>(null);
  const [pop, setPop] = useState<{ key: string; x: number; y: number } | null>(null);

  const byT = useMemo(() => new Map(t.rows.map((r) => [r.i.c.id, r])), [t.rows]);
  const radarOf = useMemo(() => {
    const m = new Map<string, RadarRow>();
    for (const r of [...(c.legacy.homeProps.data?.rows ?? []), ...(c.shell.radar.data?.rows ?? [])]) m.set(r.id, r);
    return m;
  }, [c.legacy.homeProps.data, c.shell.radar.data]);
  const clientCos = useMemo(() => new Set(defaultSeeds(c.infos, me)), [c.infos, me]);
  const fn = me.function && me.function !== "Other" ? me.function : null;

  const people: Person[] = useMemo(
    () =>
      (k.known?.people ?? [])
        .filter((p) => !p.away)
        .map((p) => {
          const i = p.company ? c.byId.get(p.company) ?? null : null;
          const tr = p.company ? byT.get(p.company) ?? null : null;
          const rr = p.company ? radarOf.get(p.company) : undefined;
          const demand = tr?.role ? { k: "hire" as const, line: tr.role.title } : rr ? { k: "emerge" as const, line: rr.lines[0]?.split(" · ")[0] ?? oppTitle(rr, fn) } : null;
          return { p, i, band: relOfWarmth(p.warmth), demand, dm: !!p.title && DM_TITLE.test(p.title), client: !!p.company && clientCos.has(p.company), fellow: !!p.member || (!!p.title && FRACTIONAL_TITLE.test(p.title)), t: tr };
        }),
    [k.known, c.byId, byT, radarOf, clientCos, fn],
  );
  const GRP: { k: Grp; l: string; s: string; ic: IconName; f: (x: Person) => boolean }[] = [
    { k: "opps", l: "Business opportunities", s: "Contacts connected to active demand", ic: "bolt", f: (x) => !!x.demand },
    { k: "dm", l: "Decision makers", s: "Titles that decide", ic: "network", f: (x) => x.dm },
    { k: "clients", l: "Former clients", s: "Where you held a seat", ic: "layers", f: (x) => x.client },
    { k: "fellows", l: "Fellow fractionals", s: "Peers who can open doors", ic: "team", f: (x) => x.fellow },
  ];
  const QFS: { k: QF; l: string; ic: IconName; f: (x: Person) => boolean }[] = [
    { k: "hire", l: "Hiring now", ic: "brief", f: (x) => x.demand?.k === "hire" },
    { k: "emerge", l: "Emerging demand", ic: "sparkle", f: (x) => x.demand?.k === "emerge" },
    { k: "strong", l: "Strong", ic: "network", f: (x) => x.band === "Strong" },
    { k: "fading", l: "Fading", ic: "trend", f: (x) => x.band === "Fading" },
  ];
  const SRC: { k: Src; l: string; f: (x: Person) => boolean }[] = [
    { k: "google", l: "Mail and calendar", f: (x) => x.p.src.includes("google") },
    { k: "file", l: "Imported contacts", f: (x) => x.p.src.includes("linkedin") || x.p.src.includes("csv") },
    { k: "messages", l: "Messages on Merlin", f: (x) => x.p.src.includes("messages") },
    { k: "member", l: "Fellow members", f: (x) => !!x.p.member },
  ];
  const due = (x: Person) => (x.demand ? (x.demand.k === "hire" ? 0 : 1) : x.band === "Fading" || x.band === "Cold" ? 2 : 3);
  const lastMs = (x: Person) => (x.p.last ? Date.parse(`${x.p.last}T12:00:00Z`) : 0);
  let base = tab === "opps" ? people.filter((x) => !!x.demand) : people;
  const g = GRP.find((x) => x.k === grp);
  if (g) base = base.filter(g.f);
  const sf = SRC.find((x) => x.k === src);
  if (sf) base = base.filter(sf.f);
  const q = QFS.find((x) => x.k === qf);
  const list = (q ? base.filter(q.f) : base).slice().sort((a, b) => (sort === "name" ? a.p.name.localeCompare(b.p.name) : sort === "recent" ? lastMs(b) - lastMs(a) : due(a) - due(b) || lastMs(b) - lastMs(a)));
  const cos = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const x of people) if (x.i) m.set(x.i.c.id, [...(m.get(x.i.c.id) ?? []), x]);
    return [...m.entries()].map(([id, ps]) => ({ i: ps[0].i!, ps, demand: ps[0].demand })).sort((a, b) => Number(!!b.demand) - Number(!!a.demand) || b.ps.length - a.ps.length);
  }, [people]);

  const act = (x: Person, a: Act) => {
    const n = noteFor(x, a, me);
    if (!n) {
      if (x.i) c.openCompany(x.i.c.id);
      return;
    }
    setDraft({ ...n, intro: a.k === "intro", first: x.p.name.split(" ")[0], strength: x.band });
  };
  const nurture = people.filter((x) => (x.band === "Fading" || x.band === "Cold") && x.i && !x.i.c.hidden && (!!x.demand || (x.t?.fit.n ?? 0) >= 4 || !!x.t?.saved)).sort((a, b) => Number(!!b.demand) - Number(!!a.demand) || lastMs(b) - lastMs(a)).slice(0, 4);
  const hot = people.filter((x) => !!x.t?.role?.fresh || (!!x.i && !!radarOf.get(x.i.c.id)?.day && Date.now() - Date.parse(`${radarOf.get(x.i.c.id)!.day}T12:00:00Z`) < 7 * 86_400_000)).length;
  const next = (warm?.rows ?? []).filter((r) => isWarm(r) && !r.locked && r.name).sort((a, b) => Number(b.hiringNow) - Number(a.hiringNow) || (b.best ?? 0) - (a.best ?? 0))[0] ?? null;
  const popP = pop ? people.find((x) => x.p.key === pop.key) ?? null : null;

  if (!k.known && !k.off && !k.failed)
    return (
      <main className="tp-main tp-main-page u3 u3p">
        <Wait line="Reading who you know" />
      </main>
    );

  return (
    <main className="tp-main tp-main-page u3 u3p u3-nw" id="tp-page" onClick={() => pop && setPop(null)}>
      <div className="u3-wrap">
        <Band
          art="titleCamp"
          title="Your network in motion."
          lede="The relationships that can grow your practice."
          extra={
            <div className="nw-hacts">
              <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => c.openPage("settings")}>
                <Ic n="plus" />
                Import contacts
              </button>
              <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={() => (setTab("all"), setGrp(null), setQf(null), setSrc(null))}>
                All contacts ({people.length})
              </button>
            </div>
          }
        />

        {!people.length ? (
          <section className="m-panel nw-empty-p">
            <div className="nw-empty-art">
              <Art name="bridgeCamps" />
            </div>
            <div>
              <h2 className="m-h3">Bring in who you know.</h2>
              <p className="m-sub">Connect your mail and calendar, or add a contacts file, and Merlin shows who you know at the companies you want, how you know them, and when you last spoke. Only you see it.</p>
              <div className="nm-acts">
                <button type="button" className="m-btn m-btn-primary" onClick={() => c.openPage("settings")}>
                  <Ic n="plus" />
                  Import contacts
                </button>
                <button type="button" className="m-btn m-btn-ghost" onClick={() => c.openPage("warm")}>
                  Warm Paths
                  <Ic n="arrow" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="m-kpis">
              {GRP.map((x) => (
                <button key={x.k} type="button" className="m-kpi" aria-pressed={grp === x.k} onClick={() => setGrp(grp === x.k ? null : x.k)}>
                  <span className="m-ki">
                    <Ic n={x.ic} />
                  </span>
                  <span>
                    <b>{x.l}</b>
                    <small>{x.s}</small>
                  </span>
                  <span className="m-bignum">{people.filter(x.f).length}</span>
                  <Ic n="right" />
                </button>
              ))}
            </div>

            <div className="nw-grid">
              <section className="nw-main">
                <div className="tg-bar">
                  <div className="m-tabs" role="tablist" aria-label="Lists">
                    {(
                      [
                        ["opps", "Opportunities", people.filter((x) => !!x.demand).length],
                        ["all", "All contacts", people.length],
                        ["cos", "Companies", cos.length],
                      ] as const
                    ).map(([key, l, n]) => (
                      <button key={key} type="button" className="m-tab" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                        {l} <span className="m-tc">{n}</span>
                      </button>
                    ))}
                  </div>
                  <label className="m-select nw-sort">
                    Sort:
                    <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                      <option value="due">Next move due</option>
                      <option value="recent">Last in touch</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                </div>
                {tab !== "cos" && (
                  <div className="m-fchips" role="group" aria-label="Quick filters">
                    {QFS.map((x) => {
                      const n = base.filter(x.f).length;
                      return (
                        <button key={x.k} type="button" className="m-fchip" aria-pressed={qf === x.k} disabled={!n && qf !== x.k} onClick={() => setQf(qf === x.k ? null : x.k)}>
                          <Ic n={x.ic} />
                          {x.l} ({n})
                        </button>
                      );
                    })}
                    <label className={`m-fchip nw-src${src ? " on" : ""}`}>
                      <select value={src ?? ""} onChange={(e) => setSrc((e.target.value || null) as Src | null)} aria-label="My relationships">
                        <option value="">My relationships</option>
                        {SRC.map((x) => (
                          <option key={x.k} value={x.k}>
                            {x.l} ({people.filter(x.f).length})
                          </option>
                        ))}
                      </select>
                      <Ic n="down" />
                    </label>
                  </div>
                )}
                <div className="m-panel nw-panel">
                  {tab === "cos" ? (
                    <ul className="m-list nw-list nw-cos">
                      {cos.map((co) => (
                        <li key={co.i.c.id} className="nw-corow">
                          <button type="button" className="m-co" onClick={() => c.openCompany(co.i.c.id)}>
                            <CoLogo i={co.i} s={40} />
                            <div>
                              <span className="m-name">
                                <span>{coName(co.i)}</span>
                              </span>
                              <small>{co.demand ? co.demand.line : co.i.c.hidden ? co.i.teaser : ""}</small>
                            </div>
                          </button>
                          <span className="nw-dm">{co.demand && <DemandChip d={co.demand} />}</span>
                          <span className="nw-who">
                            <span className="m-stack">
                              {co.ps.slice(0, 4).map((x) => (
                                <Av key={x.p.key} name={x.p.name} s={30} />
                              ))}
                            </span>
                            {co.ps.length} you know
                          </span>
                          <div className="m-rowact">
                            <button type="button" className="m-btn m-btn-secondary" onClick={() => c.openCompany(co.i.c.id)}>
                              Open company
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : list.length ? (
                    <ul className="m-list nw-list">
                      {list.map((x, n) => {
                        const a = actionOf(x);
                        const rec = n === 0 && sort === "due";
                        const ev = evidence(x, clientCos, c.byId);
                        return (
                          <li key={x.p.key} className={`nw-row${sel === x.p.key || (rec && !sel) ? " hl" : ""}`} onClick={() => setSel(x.p.key)}>
                            <div className="m-person nw-p">
                              <Av name={x.p.name} s={48} />
                              <div>
                                {rec && <span className="nw-rec">Recommended next move</span>}
                                <b title={x.p.name}>{x.p.name}</b>
                                {x.p.title && <small>{x.p.title}</small>}
                                {x.band && (
                                  <button
                                    type="button"
                                    className={`m-rel ${x.band.toLowerCase()}`}
                                    aria-haspopup="dialog"
                                    aria-label={`${x.band} relationship. Why?`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setPop({ key: x.p.key, x: r.left, y: r.bottom + 6 });
                                    }}
                                  >
                                    {x.band}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="nw-ev">
                              {ev.map((e) => (
                                <p key={e.t}>
                                  <Ic n={e.ic} />
                                  <span>{e.t}</span>
                                </p>
                              ))}
                            </div>
                            {x.i ? (
                              <button type="button" className="m-co nw-co" onClick={(e) => (e.stopPropagation(), c.openCompany(x.i!.c.id))}>
                                <div>
                                  <span className="m-name">
                                    <CoLogo i={x.i} s={26} />
                                    <span>{coName(x.i)}</span>
                                  </span>
                                  {x.demand && (
                                    <span className="nw-dm">
                                      <DemandChip d={x.demand} />
                                    </span>
                                  )}
                                  <small>{x.demand ? x.demand.line : x.i.c.hidden ? x.i.teaser : ""}</small>
                                </div>
                              </button>
                            ) : (
                              <span className="nw-co m-small">{x.p.member ? "A member of Merlin" : "No company on Merlin"}</span>
                            )}
                            <div className="m-rowact" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className={`m-btn ${rec ? "m-btn-primary" : "m-btn-secondary"}`} onClick={() => act(x, a)} title={x.i && !x.i.c.hidden ? "Opens a drafted note in your voice. Nothing goes out until you send it." : "The company is locked: open it first"}>
                                <Ic n={a.ic} />
                                {a.l}
                              </button>
                              <RowMenu
                                label={`More for ${x.p.name}`}
                                title={x.p.name}
                                items={[
                                  ...(a.k !== "reconnect" ? [{ icon: "cal" as IconName, label: "Reconnect", sub: "A drafted catch-up note", disabled: !x.i || x.i.c.hidden, onClick: () => act(x, { k: "reconnect", l: "Reconnect", ic: "cal" }) }] : []),
                                  ...(a.k !== "intro" && x.demand ? [{ icon: "send" as IconName, label: "Request an intro", sub: "A drafted ask in your voice", disabled: !x.i || x.i.c.hidden, onClick: () => act(x, { k: "intro", l: "Request an intro", ic: "send" }) }] : []),
                                  ...(x.i ? [{ icon: "building" as IconName, label: "Open company", sub: "Fit, need, who you know", onClick: () => c.openCompany(x.i!.c.id) }] : []),
                                  ...(x.i && !x.i.c.hidden ? [{ icon: "route" as IconName, label: "Find my warmest introduction", sub: "Every way in there", onClick: () => (setWarmFocus(x.i!.c.id), c.openPage("warm")) }] : []),
                                  {
                                    icon: "hide",
                                    label: "Not a relationship",
                                    sub: "Leave them out of your ways in",
                                    onClick: async () => {
                                      const r = await awayAct(x.p.key, true);
                                      toast(r.error ?? r.message ?? `${x.p.name} is set aside.`, !!r.error, r.error ? undefined : { action: { label: "Undo", onClick: () => void awayAct(x.p.key, false) } });
                                    },
                                  },
                                ]}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="empty">
                      <b>Nobody here with these filters.</b>
                      <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => (setGrp(null), setQf(null), setSrc(null), setTab("all"))}>
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <div className="nw-side">
                <NextMove next={next} me={me} onAsk={(id) => (setWarmFocus(id, true), c.openPage("warm"))} />
                <section className="m-panel nw-nurture">
                  <div className="m-panel-h">
                    <div>
                      <h2 className="m-h2">Relationships worth nurturing</h2>
                      <p className="m-sub" style={{ marginTop: 6 }}>
                        Fading or cold, at companies you want to work with.
                      </p>
                    </div>
                  </div>
                  {nurture.length ? (
                    <ul className="nw-nl">
                      {nurture.map((x) => (
                        <li key={x.p.key} className={sel === x.p.key ? "hl" : ""}>
                          <div className="m-person">
                            <Av name={x.p.name} s={40} />
                            <div>
                              <b>{x.p.name}</b>
                              {x.band && <span className={`m-rel ${x.band.toLowerCase()}`}>{x.band}</span>}
                            </div>
                          </div>
                          <p className="m-small nw-nwhy">
                            {x.i && <CoLogo i={x.i} s={18} />}
                            <span>
                              {x.i ? coName(x.i) : "Their company"} {x.demand ? (x.demand.k === "hire" ? `is hiring: ${x.demand.line}` : `shows emerging demand: ${x.demand.line}`) : "is one of your target companies"}.
                              {x.p.last && x.p.lastKind ? ` ${x.p.lastKind === "Meeting" ? "Last met" : x.p.lastKind === "Email" ? "Last emailed" : "Last message"} ${(agoWords(x.p.last) ?? "").toLowerCase()}.` : ""}
                            </span>
                          </p>
                          <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => act(x, { k: "reconnect", l: "Reconnect", ic: "cal" })}>
                            <Ic n="cal" />
                            Reconnect
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="m-panel-b">
                      <p className="m-sub">Nothing fading at your target companies.</p>
                    </div>
                  )}
                  {hot > 0 && (
                    <div className="m-panel-b">
                      <div className="nw-call">
                        <Ic n="sparkle" />
                        <div>
                          <p>{plural(hot, "contact")} {hot === 1 ? "has" : "have"} new demand at their company this week.</p>
                          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => (setTab("opps"), setGrp(null), setQf(null))}>
                            Review opportunities
                            <Ic n="arrow" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {warm && warm.directory > 0 && (
                    <p className="m-small fellows">
                      <Ic n="info" />
                      {plural(warm.directory, "fellow fractional")} on Merlin {warm.directory === 1 ? "is" : "are"} in the directory. Only members who opted in are counted, and you see only what each allows.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {pop && popP && <RelPop x={popP} at={pop} clientCos={clientCos} byId={c.byId} onClose={() => setPop(null)} />}

      {draft && (
        <NoteSheet
          key={draft.m.id + draft.first}
          m={draft.m}
          row={draft.row}
          me={me}
          intro={draft.intro ? { plan: null, first: draft.first, strength: draft.strength } : null}
          hideWarmth={!draft.strength}
          sentLabel="Mark as sent"
          onClose={() => setDraft(null)}
          sendAs={{
            effect: { type: "pipeline.sent", companyId: draft.m.id, from: "network", intro: draft.intro, channel: draft.intro ? "intro" : "email", ...(draft.m.way.kind === "know" ? { to: { name: draft.m.way.person.name, role: draft.m.way.person.title, google: draft.m.way.person.google } } : {}) },
            kind: draft.intro ? "intro" : "network",
            onGmailSent: () => void loadPipeline(true),
          }}
          onUsed={() => {
            const pw = draft.m.way.kind === "know" ? draft.m.way.person : null;
            void pipelineAct({ type: "pipeline.sent", companyId: draft.m.id, from: "network", intro: draft.intro, ...(pw ? { to: { name: pw.name, role: pw.title, google: pw.google } } : {}) });
          }}
          onSent={() => setDraft(null)}
          onClaude={() => (setDraft(null), c.openPage("agent"))}
        />
      )}
    </main>
  );
}

function DemandChip({ d }: { d: { k: "hire" | "emerge" } }) {
  return d.k === "hire" ? (
    <Chip kind="gold" sm dot>
      Hiring now
    </Chip>
  ) : (
    <Chip kind="am" sm icon="sparkle">
      Emerging demand
    </Chip>
  );
}

/** Why a band: the evidence behind it, only what Merlin has. */
function RelPop({ x, at, clientCos, byId, onClose }: { x: Person; at: { x: number; y: number }; clientCos: Set<string>; byId: Map<string, CoInfo>; onClose: () => void }) {
  const p = x.p;
  const rows: [IconName, string, ReactNode][] = [];
  if (p.last) rows.push(["cal", p.lastKind === "Meeting" ? "Last met" : p.lastKind === "Email" ? "Last emailed" : "Last in touch", `${agoWords(p.last)}`]);
  rows.push(["trend", "How often", p.why]);
  const how = evidence(x, clientCos, byId).filter((e) => e.ic !== "cal" && e.t !== p.why)[0];
  if (how) rows.push(["network", "How you know them", how.t]);
  const from = [p.src.includes("google") ? "your mail and calendar (dates only, never what was said)" : null, p.src.includes("messages") ? "your messages on Merlin" : null].filter(Boolean).join(" and ");
  const left = Math.max(12, Math.min(at.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 312));
  return (
    <div className="m-menu relpop" role="dialog" aria-label={`Why ${x.band}`} style={{ position: "fixed", left, top: at.y }} onClick={(e) => e.stopPropagation()}>
      <p className="m-eyebrow muted">{x.band} relationship</p>
      <dl>
        {rows.map(([ic, k, v]) => (
          <div key={k}>
            <dt>
              <Ic n={ic} />
              {k}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="m-small">Strong within 3 weeks, Good within 2 months, Fading within 4 months, else Cold. From {from || "your own sources"}.</p>
      <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/** The next move: the warmest real path, drawn small, and the ask. */
function NextMove({ next, me, onAsk }: { next: import("@/lib/paths/types").WarmRow | null; me: Me; onAsk: (id: string) => void }) {
  const way = useWayIn(next?.id ?? null);
  const r = way.data?.routes[0] ?? null;
  if (!next) return null;
  const nodes = (r?.nodes ?? []).slice(0, 4);
  const via = nodes.find((n) => n.role === "person");
  const W = 300;
  const xs = nodes.map((_, i) => 22 + (i * (W - 44)) / Math.max(1, nodes.length - 1));
  return (
    <section className="m-panel nw-next">
      <p className="m-eyebrow forest">Your next move</p>
      <h2 className="m-h2">A warm path to {next.name}.</h2>
      <p className="m-sub">
        {next.via}.{next.hiringNow ? " They're hiring for your expertise." : ""}
      </p>
      {nodes.length > 1 && (
        <svg className="nw-mini" viewBox={`0 0 ${W} 104`} role="img" aria-label={r?.chain ?? ""}>
          {nodes.slice(1).map((_, i) => (
            <line key={i} x1={xs[i] + 18} x2={xs[i + 1] - 18} y1="32" y2="32" className={`nm-e ${r?.links[i]?.band === "Strong" || r?.links[i]?.band === "Good" ? "strong" : "inf"}`} />
          ))}
          {via && nodes.length > 2 && (
            <>
              <text x={(xs[1] + xs[2]) / 2} y="8" textAnchor="middle" className="nm-l">
                Can introduce
              </text>
              <path d={`M${xs[2] - 26} 27l6 5-6 5`} className="nm-arr" />
            </>
          )}
          {nodes.map((n, i) => (
            <g key={i}>
              <circle cx={xs[i]} cy="32" r="18" fill={n.role === "you" ? "#2f7a5f" : n.locked ? "#cfc8bb" : tintOf(n.label)} />
              <text x={xs[i]} y="37" textAnchor="middle" className="nm-i" fill={n.role === "you" ? "#fff" : "#2a2218"}>
                {n.role === "you" ? initialsOf(me.name) : n.locked ? "?" : n.initials}
              </text>
              <text x={xs[i]} y="72" textAnchor="middle" className="nm-n">
                {n.role === "you" ? "You" : n.label.split(" ")[0]}
              </text>
              {n.sub && n.role !== "you" && (
                <text x={xs[i]} y="89" textAnchor="middle" className="nm-r">
                  {n.sub.length > 18 ? `${n.sub.slice(0, 17)}…` : n.sub}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <div className="m-rowact nw-next-a">
        <button type="button" className="m-btn m-btn-primary" onClick={() => onAsk(next.id)}>
          <Ic n="send" />
          Request an intro{via ? ` from ${via.label.split(" ")[0]}` : ""}
        </button>
      </div>
    </section>
  );
}
