"use client";

/**
 * Home in the new design (find-design/v5 flagship, Home): the greeting and the day's line, Crystal
 * Ball's newest companies with their fit, your next move (the warmest path Merlin found), what
 * needs you today (Today's moves and the pipeline's follow-ups due), and your practice at a glance
 * (the pipeline by stage, people you know, companies to talk to, warm ways in). Every number is a
 * count of real things. The one-time trial and Pro cards and Getting started stay, as on Home today.
 */
import { useMemo } from "react";
import { buildMove } from "@/lib/moves";
import { FEATURE_NAME } from "@/lib/radar/types";
import type { RadarRow } from "@/lib/radar/types";
import { useApp } from "../shell/pages";
import { usePipeline } from "../pipelineStore";
import { useKnown } from "../network/usePaths";
import { TrialStarted } from "../Home";
import { TrialEnded } from "../Today";
import { ProWelcome, TrialSummaryCard } from "../Billing";
import { kindLabel } from "../crystal/crystalModel";
import { useCrystalClick } from "../CrystalOpen";
import { useUi3Head } from "./head";
import { askOf, goTargets, useTargets, useWarmShared, setWarmFocus, warmList } from "./data";
import { Art } from "./illustrations";
import { Ic } from "./icons";
import { Band, Chip, CoLogo, FitRing, ownClick } from "./parts";
import { coFacts, coTitle, fit7, numWord, plural, predicted } from "./model";
import { crystalButton } from "../todayModel";
import type { CoInfo } from "../model";

const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";

/** A Crystal Ball row's headline: the kind of opening its strongest signal points at, never a claim beyond it. */
export function oppTitle(row: Pick<RadarRow, "kinds">, fn: string | null): string {
  const f = fn && fn !== "Other" && fn !== "Executive" ? fn : null;
  const emerging = f ? `An emerging ${f} opportunity` : "An emerging opportunity";
  switch (row.kinds[0]) {
    case "role":
      return f ? `Hiring for ${f} now` : "Hiring a fractional now";
    case "seat":
      return "A fractional seat opening up";
    case "tenure":
      return "A fractional seat a year in";
    case "departure":
      return f ? `A ${f} leadership gap` : "A leadership gap";
    case "gap":
      return f ? `No ${f} leader on file` : "No leader on file";
    case "arrival":
      return "A new leader will need a plan";
    case "rehire":
      return "A company that hires fractionals again";
    case "funding":
      return "Growing after a raise";
    case "sales-build":
    case "team-build":
      return "Building the team";
    default:
      return emerging;
  }
}

export function Ui3Home() {
  const c = useApp();
  const hp = c.legacy.homeProps;
  const me = c.me;
  useUi3Head([], "Home");
  const data = hp.data;
  const pipe = usePipeline(true).view;
  const known = useKnown().known;
  const { opps } = useTargets();
  const warm = useWarmShared().data;
  const fn = me.function ?? null;
  // Crystal Ball's own open: free on Trial and Pro, one a day on Free, else the record with its price.
  const crystalClick = useCrystalClick();

  const hello = useMemo(() => ((h) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"))(new Date().getHours()), []);
  const today = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), []);

  /* Crystal Ball's newest three, with their fit: predicted demand only (a posted role is Hiring now, in gold, never here) */
  const ball = useMemo(() => predicted(data?.rows ?? []).map((row) => ({ row, i: c.byId.get(row.id) })).filter((x): x is { row: RadarRow; i: CoInfo } => !!x.i).slice(0, 3), [data, c.byId]);
  // Free: a click on a locked company spends the one free open of the day, so the row says so.
  const freeOpen = crystalButton(me);
  // One number with the nav's badge: Crystal Ball's companies new since the last visit (TodayData.newCount, TradingPost radarN).
  const newN = data?.newCount ?? 0;

  /* your next move: the warm path to a company that needs the member most (data.ts warmList: the nav's and Warm Paths' one list) */
  const wl = useMemo(() => warmList(warm), [warm]);
  const next = wl[0] ?? null;
  const warmN = wl.length;
  const nextAsk = next ? askOf(next, next.person?.name.split(" ")[0] ?? null) : null;

  /* what needs you today: Today's moves, then the follow-ups due */
  const moves = useMemo(() => {
    const out: { id: string; i: CoInfo; title: string; line: string }[] = [];
    let opens = 0;
    for (const w of data?.moves?.list ?? []) {
      const i = c.byId.get(w.id);
      if (!i) continue;
      const m = buildMove(i.c, w.row, w.know, me);
      // A locked company is its free facts, never "Locked company"; and on Free only one "open it" move a day (Free opens one free).
      if (m.hidden) {
        if (opens++ && me.crystal !== "all") continue;
        out.push({ id: w.id, i, title: `${m.title}: ${coTitle(i).replace(/^./, (x) => x.toLowerCase())}`, line: [coFacts(i), m.line].filter(Boolean).join(". ") });
        continue;
      }
      out.push({ id: w.id, i, title: m.name ? `${m.title} at ${m.name}`.replace(/ at (.+) at \1$/, " at $1") : m.title, line: m.line });
    }
    return out.slice(0, 3);
  }, [data, c.byId, me]);
  const due = (pipe?.due ?? []).slice(0, Math.max(0, 4 - moves.length));
  const todoN = moves.length + (pipe?.due.length ?? 0);

  /* the practice at a glance */
  const stages = pipe
    ? [
        { k: "To reach out", n: pipe.counts.reach, col: "var(--m-cobalt)" },
        { k: "Talking", n: pipe.counts.sent + pipe.counts.replied + pipe.counts.meeting, col: "var(--m-forest-3)" },
        { k: "Proposal", n: pipe.counts.proposal, col: "var(--m-gold)" },
        { k: "Won", n: pipe.counts.won, col: "var(--m-amethyst)" },
      ]
    : [];
  const pipeN = stages.reduce((a, s) => a + s.n, 0);
  const knownN = known ? known.people.filter((p) => !p.away).length : null;

  const lede = [
    newN > 0 ? `${numWord(newN)} ${newN === 1 ? "company" : "companies"} may need you soon` : (data?.total ?? 0) > 0 ? `Your ${FEATURE_NAME} holds ${plural(data!.total, "company", "companies")}` : null,
    next ? `a warm path to ${next.name} is ready` : null,
  ].filter(Boolean);
  const ledeText = lede.length ? `${lede.join(", and ")}.`.replace(/^./, (x) => x.toUpperCase()) : todoN ? `${numWord(todoN)} ${todoN === 1 ? "move" : "moves"} for today.` : "Your lists and your Crystal Ball are below.";

  const goRadar = () => c.openPage("radar");
  const radarHref = c.hrefOf("radar");
  const six = c.start.hidden ? null : c.start.six;

  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <Band art="titleHome" eyebrow={today} ec="muted" title={`${hello}, ${firstName(me.name)}.`} lede={ledeText} />

        <TrialSummaryCard plan={me.plan} />
        {hp.trialStarted && me.plan?.name === "trial" ? <TrialStarted days={me.plan.trialDaysLeft} opens={me.proOpens} crystal={newN} radar={hp.radar} onSeen={hp.onTrialStartSeen} /> : null}
        {hp.trialEnded ? <TrialEnded onSeePro={hp.onSeePro} onSeen={hp.onTrialSeen} /> : null}
        {hp.proWelcome && me.plan ? <ProWelcome plan={me.plan} onSeen={hp.onProSeen} /> : null}

        {six && six.next && (
          <section className="m-panel h-start">
            <div>
              <p className="m-eyebrow forest">
                Getting started · {six.done} of {six.of}
              </p>
              <p className="h-start-t">{six.next.label}</p>
              <p className="m-small">{six.next.gives}</p>
            </div>
            <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => c.start.run(six.next!.key)}>
              {six.next.go}
              <Ic n="arrow" />
            </button>
          </section>
        )}

        {/* The panels: two rows of two up to a laptop, one row on a wide screen (pages.css, wide screens). */}
        <div className="h-cols">
          <div className="h-grid">
            <section className="m-panel cbprev" aria-labelledby="h-cb">
              <div className="m-panel-h">
                <div>
                  <p className="m-eyebrow">
                    <Ic n="sparkle" />
                    Crystal Ball
                  </p>
                  <h2 className="m-h2" id="h-cb" style={{ marginTop: 8 }}>
                    Companies that
                    <br />
                    may need you soon.
                  </h2>
                </div>
                <a className="m-btn m-btn-secondary m-btn-sm ph-hide" href={radarHref} onClick={(e) => ownClick(e) && (e.preventDefault(), goRadar())}>
                  Open Crystal Ball
                  <Ic n="arrow" />
                </a>
              </div>
              {ball.length ? (
                <ul className="cbp-rows">
                  {ball.map(({ row, i }) => {
                    const fit = fit7(i, me);
                    return (
                      <li key={row.id}>
                        <button type="button" className="cbp-row" onClick={() => void crystalClick(row.id, !!i.c.hidden, () => c.openCompany(row.id))}>
                          <CoLogo i={i} s={44} />
                          <span className="cbp-t">
                            <b>{row.name ?? coTitle(i)}</b>
                            <span>{i.c.hidden && !row.name ? [coFacts(i), oppTitle(row, fn)].filter(Boolean).join(" · ") : oppTitle(row, fn)}</span>
                            <Chip kind="am" sm dot>
                              {kindLabel(row.kinds[0], fn)}
                            </Chip>
                            {i.c.hidden && !row.name && freeOpen?.kind === "crystal" && me.crystal === "one" && (
                              <small className="m-small" style={{ marginLeft: 10 }}>
                                {freeOpen.label}
                              </small>
                            )}
                          </span>
                          <FitRing fit={fit} inside />
                          <span className="m-row-go">
                            <Ic n="right" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="m-panel-b">
                  <p className="m-sub">{!data && !hp.failed ? "Reading your Crystal Ball." : "Nothing new this week. Merlin keeps watching for the signals that come before a posting."}</p>
                </div>
              )}
              <div className="m-panel-b ph-only">
                <a className="m-btn m-btn-secondary" style={{ width: "100%" }} href={radarHref} onClick={(e) => ownClick(e) && (e.preventDefault(), goRadar())}>
                  Open Crystal Ball
                  <Ic n="arrow" />
                </a>
              </div>
            </section>

            <section className="m-panel nextmove" aria-labelledby="h-nm">
              <div className="nm-art">
                <Art name="signpost" />
              </div>
              <div className="nm-b">
                <p className="m-eyebrow forest">Your next move</p>
                {next ? (
                  <>
                    <h2 className="m-h2" id="h-nm">
                      {next.direct ? `Who decides at ${next.name} is in your network.` : `A warm path to ${next.name}.`}
                    </h2>
                    <p className="m-sub">
                      {next.via}.{next.hiringNow ? " They're hiring for your expertise." : ""}
                    </p>
                    <div className="nm-acts">
                      <button type="button" className="m-btn m-btn-primary" onClick={() => (setWarmFocus(next.id, true), c.openPage("warm"))}>
                        <Ic n={nextAsk?.k === "discuss" || nextAsk?.k === "reconnect" ? "cal" : "send"} />
                        {nextAsk?.k === "intro" ? "Request an intro" : nextAsk?.l}
                      </button>
                      <button type="button" className="m-btn m-btn-ghost" onClick={() => (setWarmFocus(next.id), c.openPage("warm"))}>
                        See the path
                        <Ic n="arrow" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="m-h2" id="h-nm">
                      Find your warmest way in.
                    </h2>
                    <p className="m-sub">Bring in who you know and Merlin shows who can introduce you at the companies you want.</p>
                    <div className="nm-acts">
                      <button type="button" className="m-btn m-btn-primary" onClick={() => c.openPage("warm")}>
                        <Ic n="route" />
                        Open Warm Paths
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="h-grid two">
            <section className="m-panel" aria-labelledby="h-today">
              <div className="m-panel-h">
                <h2 className="m-h3" id="h-today">
                  Needs you today
                </h2>
                <span className="m-small">{todoN ? plural(todoN, "move") : ""}</span>
              </div>
              {moves.length || due.length ? (
                <ul className="moves">
                  {moves.map((m) => (
                    <li key={m.id}>
                      <CoLogo i={m.i} s={40} />
                      <div>
                        <b>{m.title}</b>
                        <small>{m.line}</small>
                      </div>
                      <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => c.openCompany(m.id)}>
                        Open
                      </button>
                    </li>
                  ))}
                  {due.map((d) => {
                    const i = c.byId.get(d.company);
                    return (
                      <li key={d.id}>
                        {i ? <CoLogo i={i} s={40} /> : <span />}
                        <div>
                          <b>{d.title}</b>
                          <small>{d.line}</small>
                        </div>
                        <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => c.openPage("pipeline")}>
                          Follow up
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="m-panel-b">
                  <p className="m-sub">{!data && !hp.failed ? "Finding your moves for today." : "Nothing is due today. Your Crystal Ball and Target Companies have what is next."}</p>
                </div>
              )}
            </section>

            <section className="m-panel kpis" aria-labelledby="h-glance">
              <div className="m-panel-h">
                <h2 className="m-h3" id="h-glance">
                  Your practice at a glance
                </h2>
              </div>
              <div className="m-panel-b">
                <div className="pipe">
                  <span className="m-bignum">{pipe ? pipeN : "·"}</span>
                  <span className="m-sub">{pipeN === 1 ? "company" : "companies"} in your pipeline</span>
                </div>
                {pipeN > 0 && (
                  <div className="pipe-bar" role="img" aria-label={stages.map((s) => `${s.n} ${s.k}`).join(", ")}>
                    {stages.filter((s) => s.n > 0).map((s) => (
                      <span key={s.k} style={{ flex: s.n, background: s.col }} />
                    ))}
                  </div>
                )}
                <ul className="pipe-leg">
                  {stages.map((s) => (
                    <li key={s.k}>
                      <span>
                        <i style={{ background: s.col }} />
                        {s.k}
                      </span>
                      <b>{s.n}</b>
                    </li>
                  ))}
                </ul>
                <div className="findx">
                  <button type="button" onClick={() => c.openPage("network")}>
                    <span className="m-bignum" style={{ color: "var(--m-forest-ink)" }}>
                      {knownN ?? "·"}
                    </span>
                    <span>people you already know</span>
                  </button>
                  <button type="button" onClick={() => goTargets(c)}>
                    <span className="m-bignum" style={{ color: "var(--m-co-ink)" }}>
                      {opps.length}
                    </span>
                    <span>companies to talk to</span>
                  </button>
                  <button type="button" onClick={() => c.openPage("warm")}>
                    <span className="m-bignum" style={{ color: "var(--m-am-ink)" }}>
                      {warm ? warmN : "·"}
                    </span>
                    <span>{warmN === 1 ? "company with a warm way in" : "companies with a warm way in"}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
