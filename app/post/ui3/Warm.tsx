"use client";

/**
 * Warm Paths in the new design (find-design/v5): the relationship graph is the hero. Pick a company
 * (the ones with a way in through someone, warmest first), see "Start with Dana" and Merlin's best
 * routes drawn (each link weighted by its relationship band, never a score; hover a person for their
 * route, pick the other route to switch), then each step of the route, and Request an intro: the
 * drafted note of the route's first step (Merlin's own words for it, in the member's voice), opened
 * in their mail or copied, and the route kept as their plan. Nothing is sent from here. No odds, no
 * timelines.
 *
 * Everything Warm paths does today (the map and list of every company's way in, its filters and
 * sources, the step-by-step plan with No reply yet and Can't help) is one click away.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { RouteStepView, RouteView } from "@/lib/paths/types";
import { gmailLink, mailtoLink } from "@/lib/moveNote";
import { useApp } from "../shell/pages";
import { useToast } from "../../ui/shared";
import { useWayIn, wayPost } from "../network/useWays";
import { useUi3Head } from "./head";
import { askOf, lockedWarm, takeWarmFocus, useWarmShared, warmList } from "./data";
import { Ic } from "./icons";
import { Av, Band, Chip, CoLogo, Wait } from "./parts";
import { coLine, coName, initialsOf, numWord } from "./model";
import { Graph, GraphLegend } from "./Graph";

const LegacyWarm = dynamic(() => import("../network/WarmPaths").then((m) => m.WarmPaths), { ssr: false, loading: () => <Wait /> });
const LegacyWay = dynamic(() => import("../network/Ways").then((m) => m.WayInPage), { ssr: false, loading: () => <Wait /> });

let lastCo: string | null = null;

export function Ui3Warm() {
  const c = useApp();
  const me = c.me;
  const toast = useToast();
  const warm = useWarmShared();
  const [focus] = useState(() => takeWarmFocus());
  const [co, setCoRaw] = useState<string | null>(() => focus?.id ?? c.shell.wayCo ?? lastCo);
  const setCo = (id: string) => ((lastCo = id), setCoRaw(id), setAlt(0));
  const [view, setView] = useState<"path" | "all" | "plan">("path");
  const [alt, setAlt] = useState(0);
  const [pick, setPick] = useState(false);
  const [ask, setAsk] = useState(!!focus?.ask);
  // The one list (data.ts warmList) behind the nav's count, Home and My Network: companies that need the member first.
  const rows = useMemo(() => warmList(warm.data), [warm.data]);
  const lockedN = lockedWarm(warm.data);
  const id = co ?? rows[0]?.id ?? null;
  const i = id ? c.byId.get(id) ?? null : null;
  const way = useWayIn(id);
  const routes: RouteView[] = way.data?.routes ?? [];
  const a = Math.min(alt, Math.max(0, routes.length - 1));
  const route = routes[a] ?? null;
  const name = i ? coName(i) : way.data?.name ?? "this company";
  useUi3Head([{ label: "Find" }], view === "all" ? "Warm Paths · Every way in" : view === "plan" ? `Warm Paths · ${name}` : "Warm Paths");
  useEffect(() => {
    if (!co && rows[0]) lastCo = rows[0].id;
  }, [co, rows]);

  if (view === "all" || view === "plan")
    return (
      <>
        <div className="u3 u3-backbar">
          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setView("path")}>
            <Ic n="back" />
            Back to the path
          </button>
        </div>
        <main className={`tp-main tp-main-page${view === "all" ? " wp-main" : ""}`}>{view === "all" ? <LegacyWarm /> : <LegacyWay company={id!} phone={c.phone} infos={c.infos} onBack={() => setView("path")} />}</main>
      </>
    );

  if (!warm.data && !warm.off && !warm.failed)
    return (
      <main className="tp-main tp-main-page u3 u3p">
        <Wait line="Finding your warm paths" />
      </main>
    );

  const target = route?.nodes[route.nodes.length - 1] ?? null;
  const first = route?.nodes.find((n) => n.role === "person") ?? null;
  const between = route?.between ?? 0;
  // A route with nobody in between that rests on nothing the two share is a cold note, said so.
  const cold = !!route && between === 0 && (route.src === "direct" || route.links[0]?.words === "You have never met");
  const targetFirst = target ? (target.locked || target.company ? target.label.charAt(0).toLowerCase() + target.label.slice(1) : target.label.split(" ")[0]) : "them";
  const rowOf = rows.find((r) => r.id === id) ?? null;
  const askAct = route ? askOf({ direct: between === 0, hiringNow: !!rowOf?.hiringNow, src: cold ? "direct" : (route.src ?? null) }, between === 0 ? targetFirst : null) : null;
  const title = !route ? "You're closer than you think." : cold ? "Start with a direct note." : between === 0 ? "One note away." : "You're closer than you think.";
  const whoAt = target?.company || target?.locked ? name : `${target?.label}${target?.sub && !target.sub.startsWith("Decides") ? `, ${target.sub.replace(/ · decides$/, "").replace(/^decides$/, "")}` : ""}`.replace(/, $/, "");
  const lede = !route ? (
    "Bring in who you know, and Merlin shows who can get you in the room."
  ) : between === 0 ? (
    cold ? (
      <>Nobody you know is in between yet. You can write to {target?.locked || target?.company ? targetFirst : target?.label} directly.</>
    ) : (
      <>
        {target?.label} at {name} is in your network
        {route.decides ? ", and decides on fractional hires" : ""}.
      </>
    )
  ) : (
    <>
      <b>
        {numWord(between)} {between === 1 ? "introduction" : "introductions"}
      </b>{" "}
      away from {target?.company || target?.locked ? name : `${whoAt} at ${name}`}.
    </>
  );
  /** How the first link reads: its band only where Merlin derives one, else how the two are connected. */
  const l0 = route?.links[0] ?? null;
  const fromWords = l0?.from ? `${l0.from.charAt(0).toLowerCase()}${l0.from.slice(1)}` : null;
  // Where it comes from only when the words don't already say it ("From your LinkedIn since 2023, not met").
  const fromTail = fromWords && !/^from /i.test(l0?.words ?? "") && !(/Merlin/.test(l0?.words ?? "") && /Merlin/.test(fromWords)) ? fromWords : null;
  const firstLine = l0 ? (l0.rel ? `${l0.rel} relationship: ${l0.words.charAt(0).toLowerCase()}${l0.words.slice(1)}${fromTail ? `, from ${fromTail}` : ""}.` : `${l0.words}${fromTail ? `. From ${fromTail}` : ""}.`) : route?.why;

  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <Band
          tight
          art="titleSign"
          eyebrow={
            <>
              <Ic n="route" />
              Warm Paths
            </>
          }
          ec="cobalt"
          title={title}
          lede={lede}
        />

        {!rows.length && !id ? (
          <section className="m-panel">
            <div className="empty">
              <b>{lockedN ? `${lockedN === 1 ? "A warm path waits" : `${numWord(lockedN)} warm paths wait`} at ${lockedN === 1 ? "a locked company" : "locked companies"}.` : "No warm paths yet."}</b>
              <span className="m-sub">
                {lockedN
                  ? "Open the company to see who can introduce you. Target Companies lists them by their industry, size and region, and says what opening one costs before anything is spent."
                  : "Connect your mail and calendar, or add your contacts, and Merlin finds who can introduce you at the companies you want. Only you see them."}
              </span>
              <div className="nm-acts">
                {lockedN > 0 && (
                  <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={() => c.openPage("table")}>
                    <Ic n="building" />
                    Target Companies
                  </button>
                )}
                <button type="button" className={`m-btn ${lockedN ? "m-btn-secondary" : "m-btn-primary"} m-btn-sm`} onClick={() => c.openPage("settings")}>
                  <Ic n="plus" />
                  Import contacts
                </button>
                <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setView("all")}>
                  Every way in
                  <Ic n="arrow" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="wp-bar">
              <div className="wp-pickbox">
                <button type="button" className="wp-pick" aria-haspopup="listbox" aria-expanded={pick} onClick={() => setPick((x) => !x)}>
                  {i ? <CoLogo i={i} s={34} /> : <span />}
                  <span>
                    <b>{name}</b>
                    <small>{i ? coLine(i) : way.data?.facts ?? ""}</small>
                  </span>
                  <Ic n="down" />
                </button>
                {pick && (
                  <>
                    <div className="m-menu-scrim" onClick={() => setPick(false)} />
                    <div className="m-menu wp-menu" role="listbox" aria-label="Companies with a warm path">
                      {rows.slice(0, 40).map((r) => {
                        const ri = c.byId.get(r.id);
                        return (
                          <button key={r.id} type="button" role="option" aria-selected={r.id === id} onClick={() => (setCo(r.id), setPick(false))}>
                            {ri ? <CoLogo i={ri} s={28} /> : <Ic n="building" />}
                            <span>
                              <b>{r.name}</b>
                              <small>{r.via}</small>
                            </span>
                          </button>
                        );
                      })}
                      {!rows.length && <p className="m-small" style={{ padding: 10 }}>No other company has a way in through someone yet.</p>}
                    </div>
                  </>
                )}
              </div>
              {route && (
                <div className="wp-start">
                  {first ? <Av name={first.label} s={44} hid={first.locked} /> : <Av name={me.name} s={44} you />}
                  <div>
                    <b>{first ? `Start with ${first.label.split(" ")[0]}.` : `Write to ${targetFirst}.`}</b>
                    <span className="m-sub">{firstLine}</span>
                  </div>
                </div>
              )}
              <div className="m-toolbar">
                {route && (
                  <button type="button" className="m-btn m-btn-primary" onClick={() => setAsk(true)}>
                    <Ic n={askAct?.k === "discuss" || askAct?.k === "reconnect" ? "cal" : "send"} />
                    {askAct?.l ?? "Request an intro"}
                  </button>
                )}
                {routes.length > 1 && (
                  <button type="button" className="m-btn m-btn-secondary" onClick={() => setAlt(a === 0 ? 1 : 0)}>
                    {a === 0 ? `Explore ${routes.length - 1} alternative ${routes.length > 2 ? "paths" : "path"}` : "Back to the warmest path"}
                  </button>
                )}
              </div>
            </div>

            {way.data === null && !way.off && !way.failed ? (
              <Wait line="Drawing your way in" />
            ) : route ? (
              <>
                <section className="m-panel gr-panel">
                  <Graph routes={routes} act={a} onPick={setAlt} youInitials={initialsOf(me.name)} youSub={me.title || "You"} />
                  <GraphLegend hint="Hover a person to see their path. Click the other path to switch." />
                </section>
                <ol className="wp-steps" style={{ "--n": route.links.length } as CSSProperties}>
                  {route.links.map((l, k) => {
                    const from = route.nodes[k];
                    const to = route.nodes[k + 1];
                    const step: RouteStepView | undefined = route.steps[k];
                    const fromName = from.role === "you" ? "You" : from.label.split(" ")[0];
                    return (
                      <li key={k}>
                        <span className="m-bignum">{k + 1}</span>
                        <p className="m-eyebrow muted">{k === 0 ? (from.role === "you" ? "You reach out" : step?.who ?? "First") : `${fromName} introduces you`}</p>
                        <p className="pair">
                          {from.role === "you" ? <Av name={me.name} s={28} you /> : <Av name={from.label} s={28} hid={from.locked} />}
                          {fromName}
                          <Ic n="arrow" />
                          <Av name={to.label} s={28} hid={to.locked} />
                          <b>{to.label}</b>
                        </p>
                        <p className="m-sub">{l.words}</p>
                        <div className="st-ft">
                          {l.rel && (
                            <Chip kind="soft" sm title="From how recently you were in touch: your mail and calendar, or messages on Merlin">
                              {l.rel} relationship
                            </Chip>
                          )}
                          {l.from && (
                            <Chip kind="forest" sm>
                              From {l.from.charAt(0).toLowerCase()}
                              {l.from.slice(1)}
                            </Chip>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {(way.data?.peers ?? 0) > 0 && (
                  <p className="m-sub wp-fellows">
                    <Ic n="info" />
                    {way.data!.peers} fellow fractional{way.data!.peers > 1 ? "s" : ""} on Merlin {way.data!.peers > 1 ? "serve" : "serves"} companies like this one. Only members who opted in are counted.
                  </p>
                )}
              </>
            ) : (
              <section className="m-panel">
                <div className="empty">
                  <b>No route on file for {name} yet.</b>
                  <span className="m-sub">Pick another company, or see every company&apos;s way in.</span>
                </div>
              </section>
            )}
            <p className="wp-co">
              {i && (
                <button type="button" className="m-btn m-btn-ghost" onClick={() => c.openCompany(i.c.id)}>
                  Everything Merlin knows about {name}
                  <Ic n="arrow" />
                </button>
              )}
              {route && (
                <button type="button" className="m-btn m-btn-ghost" onClick={() => setView("plan")}>
                  The step-by-step plan
                  <Ic n="arrow" />
                </button>
              )}
              <button type="button" className="m-btn m-btn-ghost" onClick={() => setView("all")}>
                Every company&apos;s way in
                <Ic n="arrow" />
              </button>
            </p>
          </>
        )}
      </div>
      {ask && route && id && (
        <AskSheet
          route={route}
          company={name}
          onClose={() => setAsk(false)}
          onUsed={async () => {
            const r = await wayPost(id, { do: "go", route: route.id });
            if (r.error) toast(r.error, true);
            else toast(`Kept as your plan at ${name}. Merlin reminds you when it's time to nudge.`);
          }}
        />
      )}
    </main>
  );
}

/** The drafted ask (the route's first step), editable, opened in the member's own mail or copied. Never sent from here. */
function AskSheet({ route, company, onClose, onUsed }: { route: RouteView; company: string; onClose: () => void; onUsed: () => void }) {
  const step = route.steps.find((s) => s.note) ?? route.steps[0];
  const note = step?.note ?? null;
  const [subject, setSubject] = useState(note?.subject ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [used, setUsed] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const use = () => {
    if (!used) onUsed();
    setUsed(true);
  };
  return (
    <div className="m-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="m-sheet wp-ask" role="dialog" aria-modal="true" aria-labelledby="wp-ask-h">
        <p className="m-eyebrow cobalt">{route.chain}</p>
        <h2 className="m-h2" id="wp-ask-h" style={{ marginTop: 8 }}>
          {step?.title ?? `A note about ${company}`}
        </h2>
        {note ? (
          <>
            <p className="m-small" style={{ marginTop: 8 }}>
              To {note.to}
              {note.email ? ` · ${note.email}` : ". Add their address in your mail."} Drafted by Merlin from what you both have on file. Change anything.
            </p>
            <input className="wp-subj" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <div className="m-acts">
              <button type="button" className="m-btn m-btn-ghost" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="m-btn m-btn-secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${subject}\n\n${body}`).then(() => toast("Copied. Paste it into your mail."));
                  use();
                }}
              >
                <Ic n="copy" />
                Copy
              </button>
              <a className="m-btn m-btn-secondary" href={mailtoLink(note.email, subject, body)} onClick={use}>
                Another mail app
              </a>
              <a className="m-btn m-btn-primary" href={gmailLink(note.email, subject, body)} target="_blank" rel="noreferrer" onClick={use}>
                <Ic n="send" />
                Open in Gmail
              </a>
            </div>
            <p className="m-small" style={{ marginTop: 12 }}>
              Merlin drafts, you send. Nothing goes out until you press Send in your own mail.
            </p>
          </>
        ) : (
          <>
            <p className="m-sub" style={{ marginTop: 10 }}>
              {step?.detail ?? route.why}
            </p>
            <div className="m-acts">
              <button type="button" className="m-btn m-btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
