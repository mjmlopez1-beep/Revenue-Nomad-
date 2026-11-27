"use client";

/**
 * The company intelligence view in the new design (find-design/v5, Company): the name and its free
 * facts, one primary action, and four answers at a glance (fit, need, who you know, how you get in),
 * then Fits your practice (the criteria on file, the buying signals apart, the closest past client), Need over time
 * (the open role and every dated signal in the last six months), Who you know there (with the
 * relationship band only where Merlin derives one) and How you get in (Merlin's best routes, drawn).
 *
 * Everything the record does today (unlocking with its quote, seats, people, ways in, open roles,
 * notes and activity, the deal) is the "Full record" tab: today's record page, unchanged.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { RadarRow } from "@/lib/radar/types";
import type { RouteView } from "@/lib/paths/types";
import { useApp } from "../shell/pages";
import { useToast } from "../../ui/shared";
import { useKnown } from "../network/usePaths";
import { useWayIn } from "../network/useWays";
import { likeParts, likeShared, shown, type CoInfo } from "../model";
import { defaultSeeds, profileOf } from "../find/lookalikes";
import { kindLabel } from "../crystal/crystalModel";
import { Ui3HeaderCtx, useUi3Head, useUi3Header } from "./head";
import { isWarm, setWarmFocus, useCoActs, useTargets } from "./data";
import { Art } from "./illustrations";
import { Ic } from "./icons";
import { Av, Chip, CoLogo, FitRing, RelChip, Traits, Wait } from "./parts";
import { loadAbout } from "../About";
import { SUGGESTED_FROM, suggestFromAbout, suggestionFor } from "@/lib/about/suggest";
import { ADD_WHAT_YOU_KNOW, FIT_FOOT, NOT_ON_FILE, agoWords, coLine, coName, fitCount, fitSentence, initialsOf, numWord, plural, relOfWarmth } from "./model";
import { Graph, GraphLegend } from "./Graph";
import { oppTitle } from "./Home";

const Record = dynamic(() => import("../company/CompanyPage").then((m) => m.CompanyPage), { ssr: false, loading: () => <Wait /> });
const SRC_WORDS: Record<string, string> = { google: "your mail and calendar", messages: "your messages on Merlin", linkedin: "your LinkedIn file", csv: "your contacts file" };
const DAY = 86_400_000;

export function Ui3Company() {
  const c = useApp();
  const rec = c.record!;
  const i = rec.info;
  const [tab, setTab] = useState<"intel" | "record">("intel");
  // Opened from a list of companies: it sits under Target Companies. From another page (Crystal Ball, Warm Paths, Pipeline...): under that page.
  const from = rec.crumbs.filter((x) => x.label !== "Home");
  const pageCrumb = from.length === 1 && !/compan|ideal client|lookalike/i.test(from[0].label);
  const crumbs = pageCrumb ? from : [{ label: "Find" }, { label: "Target Companies", href: from[from.length - 1]?.href, go: rec.onClose }];
  const api = useUi3Header();
  useUi3Head(crumbs.length ? crumbs : [{ label: "Find" }, { label: "Target Companies" }], coName(i));
  return (
    <>
      <div className="u3 u3-cvtabs">
        <button type="button" className="m-btn m-btn-ghost m-btn-sm cv-back" onClick={rec.onClose}>
          <Ic n="back" />
          {crumbs[crumbs.length - 1]?.label ?? "Back"}
        </button>
        <div className="m-seg" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-pressed={tab === "intel"} aria-selected={tab === "intel"} onClick={() => setTab("intel")}>
            Intelligence
          </button>
          <button type="button" role="tab" aria-pressed={tab === "record"} aria-selected={tab === "record"} onClick={() => setTab("record")}>
            Full record
          </button>
        </div>
        {rec.pos && (
          <span className="m-small u3-pos">
            {rec.pos.n} of {rec.pos.of}
            <button type="button" className="m-iconbtn sm plain" aria-label="Previous company" onClick={() => rec.onStep(-1)}>
              <Ic n="back" />
            </button>
            <button type="button" className="m-iconbtn sm plain" aria-label="Next company" onClick={() => rec.onStep(1)}>
              <Ic n="arrow" />
            </button>
          </span>
        )}
      </div>
      {tab === "record" ? (
        // Today's record draws its own header: inside the new design the shell's top bar is already there.
        <Ui3HeaderCtx.Provider value={api ? { ...api, top: (h) => <>{h.hosts}</> } : null}>
          <Record />
        </Ui3HeaderCtx.Provider>
      ) : (
        <Intel i={i} onRecord={() => setTab("record")} />
      )}
    </>
  );
}

function Intel({ i, onRecord }: { i: CoInfo; onRecord: () => void }) {
  const c = useApp();
  const me = c.me;
  const id = i.c.id;
  const toast = useToast();
  const acts = useCoActs();
  const t = useTargets();
  const row = t.rows.find((r) => r.i.c.id === id);
  const fit = row?.fit;
  const role = row?.role ?? null;
  const warm = isWarm(row?.warm) ? row!.warm : null;
  const way = useWayIn(i.c.hidden ? null : id);
  const routes: RouteView[] = way.data?.routes ?? [];
  const best = routes[0] ?? null;
  const [alt, setAlt] = useState(0);
  const [traitsOpen, setTraitsOpen] = useState(false);
  const known = useKnown().known;
  const people = useMemo(() => (known?.people ?? []).filter((p) => p.company === id && !p.away), [known, id]);
  const fn = me.function && me.function !== "Other" ? me.function : null;
  const radar: RadarRow | null = useMemo(() => [...(c.shell.radar.data?.rows ?? []), ...(c.legacy.homeProps.data?.rows ?? [])].find((r) => r.id === id) ?? null, [c.shell.radar.data, c.legacy.homeProps.data, id]);

  // Suggestions for how it sells, from the About text its own website gave (nothing new is fetched). Shown beside an empty fact until a member confirms.
  const aboutCell = i.c.cells.about;
  const fromSite = !i.c.hidden && aboutCell?.s === "value" && aboutCell.from === "website";
  const [aboutText, setAboutText] = useState<string | null>(null);
  useEffect(() => {
    setAboutText(null);
    if (!fromSite) return;
    let live = true;
    void loadAbout(id).then((cell) => live && setAboutText(cell?.s === "value" ? cell.v || null : null));
    return () => {
      live = false;
    };
  }, [id, fromSite]);
  const suggested = useMemo(() => (aboutText ? suggestFromAbout(aboutText) : null), [aboutText]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirm = async (field: string, value: string) => {
    setConfirming(field);
    const res = await c.act({ type: "fill", entity: "company", id, field, value }, { quiet: true });
    setConfirming(null);
    toast(res.message || (res.ok ? "Saved." : "That didn't go through. Try again."), !res.ok);
  };

  // The closest past client: the member's own seats' companies, by traits shared.
  const like = useMemo(() => {
    let out: { name: string; same: number; of: number } | null = null;
    for (const sid of defaultSeeds(c.infos, me)) {
      if (sid === id) continue;
      const s = c.byId.get(sid);
      if (!s || s.c.hidden) continue;
      const parts = likeParts(profileOf([s]));
      if (!parts.traits.length) continue;
      const same = likeShared(parts, { key: id, i }).length;
      if (!out || same > out.same) out = { name: s.c.name, same, of: parts.traits.length };
    }
    return out;
  }, [c.infos, c.byId, me, id, i]);

  // Need over time: dated facts in the last six months.
  const now = Date.now();
  const events = useMemo(() => {
    const ev: { at: string; t: string; s: string; hot: boolean }[] = [];
    const add = (at: string | null | undefined, t: string, s: string) => {
      if (!at) return;
      const iso = at.length === 7 ? `${at}-01` : at.slice(0, 10);
      const ms = Date.parse(`${iso}T12:00:00Z`);
      if (!Number.isFinite(ms) || now - ms > 182 * DAY || ms > now + DAY) return;
      ev.push({ at: iso, t, s, hot: now - ms < 14 * DAY });
    };
    // The seats and postings on file first, by the day each happened; Crystal Ball's signal about the same event (a hire
    // that month, a role posted within the week) is the same dot, never drawn twice (acceptance F5).
    const near = (a: string, b: string, days: number) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) <= days * DAY;
    const kinds: { at: string; k: "role" | "hire" }[] = [];
    for (const e of i.engs) {
      const f = shown(e.cells.function);
      if (e.opened || e.posted) {
        const at = (e.posted ?? e.opened)!;
        add(at, "Role posted", `${shown(e.cells.role) ?? "An open role"} · from the job posting`);
        kinds.push({ at: at.length === 7 ? `${at}-01` : at.slice(0, 10), k: "role" });
      }
      const start = shown(e.cells.start);
      if (start && !e.opened) {
        add(start, f ? `Fractional ${f} started` : "A fractional seat started", "From seats on file");
        kinds.push({ at: start.length === 7 ? `${start}-01` : start.slice(0, 10), k: "hire" });
      }
    }
    for (const g of radar?.sigs ?? []) {
      const k = g.kind === "role" ? "role" : g.kind === "adjacent" || g.kind === "rehire" ? "hire" : null;
      if (k && g.at && kinds.some((x) => x.k === k && near(x.at, g.at!, k === "role" ? 10 : 31))) continue;
      add(g.at, kindLabel(g.kind, fn), `${g.line.split(" · ")[0]} · from Crystal Ball`);
    }
    return ev.sort((a, b) => a.at.localeCompare(b.at)).slice(-6);
  }, [radar, i, fn, now]);

  const need = role?.mine ? "Hiring now" : role ? "Hiring" : radar ? "An early signal" : i.c.friendly.fractional ? "Hired fractionals before" : "Quiet for now";
  const needLine = role ? role.title : radar ? oppTitle(radar, fn) : i.c.friendly.fractional ? plural(i.c.friendly.fractional, "fractional hire") : "No signal on file";
  const via = best?.nodes.find((n) => n.role === "person");
  /** The route's first person is a fellow fractional on Merlin (not someone the member knows). */
  const viaFellow = !!via && best?.src === "fellow";

  const addPipe = async () => {
    const res = await acts.addPipe(id);
    toast(res.message || (res.ok ? "Added to your pipeline, under To reach out." : "That didn't go through. Try again."), !res.ok);
  };
  const ask = () => (setWarmFocus(id, true), c.openPage("warm"));
  const size = shown(i.c.cells.employees);
  const stage = shown(i.c.cells.revenue);
  // Each fact once (F30): a locked company's line already carries its size and revenue.
  const line = coLine(i);
  const sub = [line, size && !line.includes(size) ? `${size} people` : null, stage && !line.includes(stage) ? stage : null].filter(Boolean).join(" · ");

  if (!fit) return <Wait />;
  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <header className="cv-h">
          <CoLogo i={i} s={64} />
          <div className="cv-t">
            <h1 className="m-display" tabIndex={-1}>
              {coName(i)}
            </h1>
            <p className="m-sub">{sub}</p>
            {i.c.hidden && <p className="m-small">This company is locked. Its name, website and people open with it. The full record says what it costs, and nothing is spent until you say yes.</p>}
          </div>
          <div className="cv-acts">
            {i.c.hidden ? (
              <button type="button" className="m-btn m-btn-primary" onClick={onRecord}>
                <Ic n="lock" />
                See what opens it
              </button>
            ) : (best && best.between > 0) || (!best && warm) ? (
              <button type="button" className="m-btn m-btn-primary" onClick={ask}>
                <Ic n="send" />
                Request an intro
              </button>
            ) : best && best.src !== "direct" ? (
              // The person the member knows decides: talk to them, never an intro to themself.
              <button type="button" className="m-btn m-btn-primary" onClick={ask}>
                <Ic n="cal" />
                {role ? "Discuss opportunity" : "Reconnect"}
              </button>
            ) : best ? (
              <button type="button" className="m-btn m-btn-primary" onClick={ask}>
                <Ic n="send" />
                Write to {(best.nodes[best.nodes.length - 1]?.label ?? "them").split(" ")[0]}
              </button>
            ) : row?.inPipe ? (
              <span className="m-btn m-btn-done">
                <Ic n="check" />
                In pipeline
              </span>
            ) : (
              <button type="button" className="m-btn m-btn-primary" onClick={() => void addPipe()}>
                <Ic n="plus" />
                Add to pipeline
              </button>
            )}
            <div className="cv-sec">
              {(i.c.hidden || best || warm) &&
                (row?.inPipe ? (
                  <Chip kind="forest" icon="check">
                    In pipeline
                  </Chip>
                ) : (
                  <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => void addPipe()}>
                    <Ic n="plus" />
                    Add to pipeline
                  </button>
                ))}
              <button type="button" className="m-iconbtn" onClick={() => void acts.follow(id, !i.c.following)} aria-pressed={i.c.following} aria-label={i.c.following ? "Watching" : "Watch"} title={i.c.following ? "Watching. Merlin tells you when it moves." : "Watch: tell me when it moves"}>
                <Ic n={i.c.following ? "check" : "eye"} />
              </button>
              <button type="button" className="m-iconbtn" onClick={() => void acts.save(id, !row?.saved)} aria-pressed={!!row?.saved} aria-label={row?.saved ? "Saved" : "Save"} title={row?.saved ? "Saved. Take it out of Saved." : "Save: keep it in Saved"}>
                <Ic n="bookmark" />
              </button>
            </div>
          </div>
        </header>

        <div className="cv-sum">
          <div className="cv-cell">
            {fit.client ? (
              <>
                <span className="cv-ic forest">
                  <Ic n="check" />
                </span>
                <div>
                  <p className="m-eyebrow forest">{fit.client.current ? "Your client" : "Past client"}</p>
                  <b>{fit.client.words}</b>
                  <span className="m-small">Your own clients are not fit-scored</span>
                </div>
              </>
            ) : (
              <>
                <FitRing fit={fit} lg />
                <div>
                  <p className="m-eyebrow forest">Fits your practice</p>
                  <b>{fitCount(fit)}</b>
                  <span className="m-small">{fit.of ? fit.band : fit.asked ? "Add what you know to see it" : "No ideal client yet"}</span>
                </div>
              </>
            )}
          </div>
          <div className="cv-cell">
            <span className="cv-ic gold">
              <Ic n="brief" />
            </span>
            <div>
              <p className="m-eyebrow gold">Need</p>
              <b>{need}</b>
              <span className="m-small">{needLine}</span>
            </div>
          </div>
          <div className="cv-cell">
            <span className="m-stack">
              {people.length ? people.slice(0, 3).map((p) => <Av key={p.key} name={p.name} s={38} />) : via ? <Av name={via.label} s={38} hid={via.locked} /> : <Av name="" s={38} hid />}
            </span>
            <div>
              <p className="m-eyebrow">Who you know</p>
              <b>{people.length ? `${people.length} there` : via && !viaFellow ? `Through ${via.label.split(" ")[0]}` : "Nobody there yet"}</b>
              <span className="m-small">{people.length ? people[0].title ?? "Someone you know" : viaFellow ? `A fellow fractional, ${via!.locked ? "on Merlin" : via!.label.split(" ")[0]}, can help` : via ? "Someone you know knows them" : "Bring in who you know"}</span>
            </div>
          </div>
          <div className="cv-cell">
            <span className="cv-ic co">
              <Ic n="route" />
            </span>
            <div>
              <p className="m-eyebrow cobalt">How you get in</p>
              <b>{best ? (best.between === 0 ? (best.src === "direct" ? "Write to them yourself" : "Who decides, in your network") : best.between === 1 ? "1 introduction" : `${best.between} introductions`) : "Direct note"}</b>
              <span className="m-small">{best ? best.short : "No warm path yet"}</span>
            </div>
          </div>
        </div>

        <div className="cv-grid">
          <section className="m-panel">
            <div className="m-panel-h">
              <div>
                <p className="m-eyebrow forest">{fit.client ? "Your client" : "Fits your practice"}</p>
                <h2 className="m-h3" style={{ marginTop: 8 }}>
                  {fit.client ? `${fit.client.words}.` : fitSentence(fit)}
                </h2>
              </div>
            </div>
            <div className="m-panel-b">
              {fit.client ? (
                <>
                  <p className="m-sub" style={{ margin: 0 }}>
                    Fit is for companies you could win, so your own client is never scored. What {coName(i)} has in common with your other clients shapes your ideal client.
                  </p>
                  <button type="button" className="m-btn m-btn-ghost m-btn-sm evb" onClick={c.openProfile}>
                    See your ideal client
                    <Ic n="arrow" />
                  </button>
                </>
              ) : (
                <>
                  <div className="fitrow">
                    {fit.of > 0 && <Traits n={fit.n} of={fit.of} />}
                    <span>
                      {fit.of ? (
                        <>
                          <b>
                            {fit.n} of {fit.of}
                          </b>{" "}
                          criteria of your ideal client, from what is on file
                        </>
                      ) : fit.asked ? (
                        "Nothing your ideal client asks about is on file here yet."
                      ) : (
                        <>
                          <button type="button" className="m-link" onClick={c.openProfile}>
                            Set your ideal client
                          </button>{" "}
                          to see how this company fits.
                        </>
                      )}
                    </span>
                  </div>
                  {like && (
                    <div className="fitrow">
                      <Traits n={like.same} of={like.of} am />
                      <span>
                        <b>
                          {like.same} of {like.of}
                        </b>{" "}
                        like {like.name}, your past client
                      </span>
                    </div>
                  )}
                  {fit.traits.length > 0 && (
                    <table className="m-compare fitcmp">
                      <thead>
                        <tr>
                          <th>Your ideal client</th>
                          <th>{coName(i)}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(traitsOpen ? fit.traits : fit.traits.slice(0, 5)).map((tr) => (
                          <tr key={tr.key} className={tr.unknown ? "none" : undefined}>
                            <td>{tr.label}</td>
                            <td>
                              {tr.unknown ? (
                                <>
                                  {NOT_ON_FILE} ·{" "}
                                  <button type="button" className="m-link" onClick={onRecord}>
                                    {ADD_WHAT_YOU_KNOW}
                                  </button>
                                  {tr.fact && suggestionFor(suggested, tr.fact) && (
                                    <span className="fitsug">
                                      {SUGGESTED_FROM}: <b>{suggestionFor(suggested, tr.fact)!.replace(/; /g, ", ")}</b>{" "}
                                      <button type="button" className="m-link" disabled={confirming === tr.fact} onClick={() => void confirm(tr.fact!, suggestionFor(suggested, tr.fact!)!)}>
                                        {confirming === tr.fact ? "Saving" : "Confirm"}
                                      </button>
                                    </span>
                                  )}
                                </>
                              ) : (
                                tr.value
                              )}
                            </td>
                            <td>
                              {tr.unknown ? (
                                <span className="m-small">Not counted</span>
                              ) : (
                                <span className={`m-check${tr.on ? "" : " no"}`} role="img" aria-label={tr.on ? "Matches" : "Doesn't match"}>
                                  <Ic n={tr.on ? "check" : "x"} />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {fit.traits.length > 5 && (
                    <button type="button" className="m-btn m-btn-ghost m-btn-sm evb" aria-expanded={traitsOpen} onClick={() => setTraitsOpen((x) => !x)}>
                      {traitsOpen ? "Show fewer" : `See all ${fit.traits.length} criteria`}
                      <Ic n="down" />
                    </button>
                  )}
                </>
              )}
              <p className="m-eyebrow fitsig-h">Buying signals</p>
              <ul className="fitsig">
                {fit.signals.map((g) => (
                  <li key={g.key} className={g.on ? "on" : undefined}>
                    <Ic n={g.on ? "check" : "x"} />
                    <span>
                      <b>{g.label}</b>
                      <small>{g.value}</small>
                    </span>
                  </li>
                ))}
              </ul>
              {!fit.client && <p className="m-small fitfoot">{FIT_FOOT}</p>}
            </div>
          </section>

          <section className="m-panel">
            <div className="m-panel-h">
              <div>
                <p className="m-eyebrow gold">Need over time</p>
                <h2 className="m-h3" style={{ marginTop: 8 }}>
                  {role?.mine ? "It needs your expertise now." : role || events.length >= 3 ? "Demand is building." : events.length ? "An early signal." : "Quiet, for now."}
                </h2>
              </div>
              {role && (
                <Chip kind="gold" sm dot>
                  Hiring now
                </Chip>
              )}
            </div>
            <div className="m-panel-b">
              {role && (
                <p className="cv-hire">
                  <b>{role.title}</b>
                  <span className="m-sub">
                    {role.ago ? ` · posted ${role.ago.toLowerCase()}` : ""}
                    {role.rate ? ` · ${role.rate}` : ""}
                  </span>
                </p>
              )}
              {events.length ? (
                <>
                  <Timeline events={events} />
                  <p className="m-small">Hover a signal for where it came from.</p>
                </>
              ) : (
                <p className="m-sub">No dated signals on file in the last six months.</p>
              )}
            </div>
          </section>

          <section className="m-panel">
            <div className="m-panel-h">
              <div>
                <p className="m-eyebrow forest">Who you know</p>
                <h2 className="m-h3" style={{ marginTop: 8 }}>
                  {people.length ? (people.length === 1 ? "You know someone there." : `You know ${numWord(people.length).toLowerCase()} people there.`) : viaFellow ? "Nobody you know yet. A fellow fractional can help." : best && best.between > 0 ? "Nobody there yet. Someone you know can introduce you." : "Nobody you know there yet."}
                </h2>
              </div>
            </div>
            <ul className="m-list cv-people">
              {people.map((p) => {
                const band = relOfWarmth(p.warmth);
                const from = p.src.map((s) => SRC_WORDS[s]).filter(Boolean).join(" and ");
                return (
                  <li key={p.key} style={{ "--cols": "minmax(0,1fr) auto" } as CSSProperties}>
                    <div className="m-person">
                      <Av name={p.name} s={42} />
                      <div>
                        <b>{p.name}</b>
                        <small>{[p.title, p.why].filter(Boolean).join(" · ")}</small>
                      </div>
                    </div>
                    {band && <RelChip band={band} from={`${p.last ? `Last ${(p.lastKind ?? "touch").toLowerCase()}: ${agoWords(p.last)?.toLowerCase()}. ` : ""}From ${from || "your own sources"}.`} />}
                  </li>
                );
              })}
              {best?.nodes
                .filter((n) => n.role === "person" && !people.some((p) => p.name === n.label))
                .map((n) => (
                  <li key={n.label} style={{ "--cols": "minmax(0,1fr) auto" } as CSSProperties}>
                    <div className="m-person">
                      <Av name={n.label} s={42} hid={n.locked} />
                      <div>
                        <b>{n.label}</b>
                        <small>{n.sub ?? ""}</small>
                      </div>
                    </div>
                    <Chip kind="cobalt" sm>
                      {viaFellow && n === via ? "Fellow fractional" : "On your path"}
                    </Chip>
                  </li>
                ))}
              {!people.length && !best && (
                <li style={{ "--cols": "1fr" } as CSSProperties}>
                  <span className="m-sub">Bring in your contacts to see who you know here.</span>
                </li>
              )}
            </ul>
          </section>

          <section className="m-panel">
            <div className="m-panel-h">
              <div>
                <p className="m-eyebrow cobalt">How you get in</p>
                <h2 className="m-h3" style={{ marginTop: 8 }}>
                  {best ? (best.between === 0 ? (best.src === "direct" ? "You can write to them yourself." : "Who decides is in your network.") : best.between === 1 ? "One introduction gets you in." : `${numWord(best.between)} introductions get you in.`) : "Start with a direct note."}
                </h2>
              </div>
              {best && (
                <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => (setWarmFocus(id), c.openPage("warm"))}>
                  Full path
                  <Ic n="arrow" />
                </button>
              )}
            </div>
            {way.data === null && !way.off && !way.failed && !i.c.hidden ? (
              <Wait line="Finding your way in" />
            ) : best ? (
              <>
                <Graph routes={routes} act={alt} onPick={setAlt} compact youInitials={initialsOf(me.name)} youSub={me.title || "You"} />
                <div className="m-panel-b">
                  <p className="m-sub">{routes[Math.min(alt, routes.length - 1)].because || routes[Math.min(alt, routes.length - 1)].why}</p>
                </div>
              </>
            ) : (
              <div className="m-panel-b nopath">
                <div className="np-art">
                  <Art name="trailhead" />
                </div>
                <p className="m-sub">{i.c.hidden ? "Ways in show once the company is open." : "No warm path on file. Bring in who you know, or write to them directly from the full record."}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Timeline({ events }: { events: { at: string; t: string; s: string; hot: boolean }[] }) {
  const W = 520;
  const H = 150;
  const L = 14;
  const R = W - 14;
  const y = 68;
  const now = Date.now();
  const span = 182 * DAY;
  const x = (at: string) => L + ((Date.parse(`${at}T12:00:00Z`) - (now - span)) / span) * (R - L);
  const months: { m: string; x: number }[] = [];
  for (const k of [5, 3, 1]) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - k);
    months.push({ m: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), x: x(d.toISOString().slice(0, 10)) });
  }
  return (
    <div className="tl">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signals at this company over six months">
        <rect x={R - 26} y="8" width="32" height={H - 30} rx="12" className="rv-band" />
        <line x1={L} x2={R} y1={y} y2={y} className="rv-base" />
        {months.map((m) => (
          <text key={m.m} className="rv-m" x={m.x.toFixed(1)} y={H - 4} textAnchor="middle">
            {m.m}
          </text>
        ))}
        <text className="rv-m now" x={R} y={H - 4} textAnchor="end">
          Now
        </text>
        {events.map((e, k) => {
          const cx = Math.min(R - 10, Math.max(L + 10, x(e.at)));
          const up = k % 2 === 0;
          const r = e.hot ? 10 : 7;
          const anchor = cx > W - 90 ? "end" : cx < 90 ? "start" : "middle";
          const tx = anchor === "end" ? cx + 10 : anchor === "start" ? cx - 10 : cx;
          const when = agoWords(e.at) ?? "";
          return (
            <g key={k}>
              <line x1={cx} x2={cx} y1={up ? y - 34 : y + r} y2={up ? y - r : y + 26} className="tl-stem" />
              {e.hot && <circle cx={cx} cy={y} r="18" className="rv-glow" />}
              <circle cx={cx} cy={y} r={r} className={`rv-dot ${e.hot ? "new" : "old"}`} tabIndex={0} aria-label={`${e.t}, ${when}`}>
                <title>{`${e.t}. ${when}. ${e.s}`}</title>
              </circle>
              <text className="tl-w" x={tx} y={up ? y - 52 : y + 40} textAnchor={anchor}>
                {when}
              </text>
              <text className="tl-l" x={tx} y={up ? y - 38 : y + 56} textAnchor={anchor}>
                {e.t.length > 26 ? `${e.t.slice(0, 25)}…` : e.t}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
