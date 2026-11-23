"use client";

/**
 * Warm paths (WarmPaths.dc.html, Signals / Warm paths in the new look): every company that fits
 * the member, on a map with two axes, how well it fits them (up) and how strong their way in is
 * (across), beside the list of them best first; a company picked shows its path as a chain (you,
 * the person, the company) with why Merlin believes it and how fresh it is, and "Ask for an intro"
 * drafts the note. Below: the Sources (Google, the LinkedIn file, a CSV, Merlin messages, fellow
 * fractionals) with what each gives, and, behind RN_SUGGEST, Suggested additions from the files.
 *
 *   Data       GET /api/paths?warm=1 (lib/paths/ways.ts warmOf): the rows placed and ranked on the
 *              server, the two middle lines placed from these companies (rank.ts splitLine) so the
 *              marks spread across all four quadrants, and the words for where each line sits.
 *              A company's routes come from GET ?way= (useWayIn), as Your way in reads them.
 *   Table      the same rows on the Stage 1 workbench (workbench/Workbench.tsx): its fill row,
 *              its checkboxes, and a bulk bar that follows or adds to the pipeline (no export).
 *   Locked     a locked company is its facts; its routes and names open with it, and ways in from
 *              the member's own files there are a count only (the locked-match rule).
 *   First visit  never empty: the paths Merlin already sees (fellow fractionals who held a seat at
 *              companies that fit), the Bring in who you know step inline, and a labelled Example
 *              of the map after connecting (examples are never counted, sent or clicked through).
 *   Phone      the list as cards; a company opens Your way in (the full page).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Zone } from "@/lib/paths/rank";
import { ZONES, betweenWords } from "@/lib/paths/rank";
import { EXPORT_STEPS, lockedWaysWords, type RouteView, type SuggestRow, type WarmRow, type WarmView, type WaySource } from "@/lib/paths/types";
import { gmailLink } from "@/lib/moveNote";
import { IconX, useToast } from "../../ui/shared";
import { useCopy } from "../Credits";
import { useUi } from "../ui";
import { UnlockCompany } from "../company/sections/Unlock";
import { rowsFor, type Row } from "../model";
import { stripGone, useApp } from "../shell/pages";
import { Workbench } from "../workbench/Workbench";
import { COMPANY_COLUMNS, type ColumnDef } from "../workbench/columns";
import { pipelineAct } from "../pipelineStore";
import { ConnectPanel, type SourceKey } from "./ConnectPanel";
import { useNetwork } from "./useNetwork";
import { usePaths } from "./usePaths";
import { openWay, suggestPost, useSuggest, useWarm, useWayIn, wayPost } from "./useWays";
import { EXAMPLE_ROWS, exampleRoute } from "./warmExamples";
import "../workbench/workbench.css";
import "./warm.css";

const cx = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" ");
const n = (x: number) => x.toLocaleString("en-US");
const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];
const BAND_W: Record<string, [number, string]> = { Strong: [6, "#073F2F"], Good: [4, "#0B6B45"], Fading: [3, "#808A85"], Cold: [2, "#B4BDB8"] };

/** The quadrants, said honestly: the lines sit in the middle of the member's own companies. */
export const QUADRANTS: Record<Zone, { title: string; hint: string }> = {
  go: { title: "Go now", hint: "Fits you better, and one of your warmer ways in. Ask for the intro." },
  find: { title: "Find a way in", hint: "Fits you better, but your way in is colder. Bring in who you know, or ask a fellow fractional." },
  warm: { title: "Keep warm", hint: "A warmer way in, a looser fit. Stay in touch, ask who they know." },
  watch: { title: "Watch", hint: "A looser fit and a colder way in. Merlin tells you when that changes." },
};
const SRC_TAG: Record<WaySource, string> = {
  google: "Google",
  linkedin: "LinkedIn file",
  csv: "Your CSV",
  messages: "Merlin messages",
  fellow: "a fellow fractional",
  seat: "seats on Merlin",
  direct: "a note out of the blue",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "and")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const label = (r: WarmRow) => r.name ?? "Locked company";
const kindOf = (r: WarmRow) => r.facts.split(" · ")[0] || "A company";
const estText = (r: WarmRow) => (r.best === null ? "None" : `${r.best}%`);
const fitLine = (r: WarmRow) => `Fits you ${r.fit} of 5${r.fitWords.length ? `: ${listWords(r.fitWords)}` : ": nothing on file matches your ideal client yet"}.`;
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

type Filt = { ball?: boolean; list?: string | null; hiring?: boolean; fellow?: boolean };
const passes = (r: WarmRow, zone: Zone | "all", f: Filt, who: string | null) =>
  (zone === "all" || r.zone === zone) && (!f.ball || r.ball) && (!f.list || r.list === f.list) && (!f.hiring || r.hiringNow) && (!f.fellow || r.src === "fellow") && (!who || r.people.some((p) => p.key === who));

/* ---------- the page ---------- */

export function WarmPaths() {
  const c = useApp();
  const ui = useUi();
  const w = useWarm();
  const paths = usePaths();
  // A file brought in (or deleted) here or on People: the map is read again.
  const fileAt = `${paths.view?.linkedin?.at ?? ""}|${paths.view?.csv?.at ?? ""}`;
  const firstFile = useRef(fileAt);
  useEffect(() => {
    if (fileAt !== firstFile.current) (firstFile.current = fileAt), void w.reload();
  }, [fileAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!w.data)
    return (
      <div className="wp-wait" role="status">
        {w.failed ? (
          <>
            <p>Your map didn&apos;t load. Check your connection and try again.</p>
            <button type="button" className="btn" onClick={() => void w.reload()}>
              Try again
            </button>
          </>
        ) : w.off ? (
          <p>Ways in aren&apos;t on for Merlin yet.</p>
        ) : (
          <p>Placing your companies…</p>
        )}
      </div>
    );
  return <WarmBody v={w.data} reload={w.reload} phone={c.phone} isHidden={ui.isHidden} />;
}

/** Warm paths for a view in hand (the page fetches it; the checks pass one). */
export function WarmBody({ v, reload, phone, isHidden }: { v: WarmView; reload: () => Promise<void>; phone: boolean; isHidden?: (id: string) => boolean }) {
  const c = useApp();
  const own = v.own.google || v.own.linkedin || v.own.csv;
  const first = !own;
  const [view, setView] = useState<"map" | "table">("map");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [f, setF] = useState<Filt>({});
  const [who, setWho] = useState<string | null>(null);
  const [tab, setTab] = useState<"co" | "ppl">("co");
  const [ex, setEx] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState(false);
  const [src, setSrc] = useState<SourceKey | null>(null);
  const exRows = useMemo(() => EXAMPLE_ROWS.map((x) => x.value), []);
  const rows = ex ? exRows : v.rows;
  const shown = rows.filter((r) => passes(r, zone, f, who));
  // The map's marks, and the company picked from the list even when it isn't one of them (at its place, unspread).
  const onMap = rows.filter((r) => r.onMap || r.id === sel);
  const cur = rows.find((r) => r.id === sel) ?? shown[0] ?? rows[0] ?? null;
  // A company opened here (the usual unlock): read again so its name and routes come.
  const hiddenNow = cur && isHidden ? isHidden(cur.id) : null;
  const wasHidden = useRef(hiddenNow);
  useEffect(() => {
    if (wasHidden.current && hiddenNow === false && !ex) void reload();
    wasHidden.current = hiddenNow;
  }, [hiddenNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id: string, o: { note?: boolean } = {}) => {
    if (phone && !ex) return openWay(id);
    setSel(id);
    setNote(!!o.note);
  };
  const counts = ex ? zoneCounts(exRows) : v.countsAll;
  const people = useMemo(() => peopleOf(rows), [rows]);
  const withPath = v.rows.filter((r) => r.best !== null).length;
  // Paths through someone (not a cold note to who decides), and those through fellow fractionals.
  const through = v.rows.filter((r) => r.best !== null && r.src !== "direct").length;
  const fellowN = v.rows.filter((r) => r.src === "fellow").length;
  const onCount = 2 + Number(v.own.google) + Number(v.own.linkedin) + Number(v.own.csv);
  const goSources = (k?: SourceKey) => {
    if (k) setSrc(k);
    setTimeout(() => document.getElementById("wp-sources")?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };
  const filters: { k: keyof Filt; label: string; n: number; val?: string }[] = [
    ...(v.ball && !ex ? [{ k: "ball" as const, label: "Crystal Ball", n: v.ball }] : []),
    ...(!ex ? v.lists.slice(0, 2).map((l) => ({ k: "list" as const, label: `List: ${l.name}`, n: l.n, val: l.name })) : []),
    { k: "hiring", label: "Hiring now", n: rows.filter((r) => r.hiringNow).length },
    { k: "fellow", label: "Through fellow fractionals", n: rows.filter((r) => r.src === "fellow").length },
  ];

  const sources = <Sources v={v} first={first} open={src} onOpen={setSrc} onRead={() => void reload()} />;
  return (
    <div className={cx("wp", first && "wp-first")} data-warm>
      {first && !stripGone(c, "warm") && (
        <section className="ws-strip wp-strip" aria-label="About this page">
          <span className="ws-strip-t">
            <strong>What this page is for.</strong> Every company that fits you, placed by how well it fits and how strong your way in is. Pick one to see the path, then ask for the intro.{" "}
            {fellowN
              ? `Merlin already found ${fellowN === 1 ? "1 path" : `${fellowN} paths`} through fellow fractionals who held a seat there. They are free.`
              : "Bring in who you know and each person at a company that fits becomes a path here."}
            {withPath > through ? ` Until then a cold note to who decides is the way in at ${n(withPath - through)}, said as one.` : ""}
          </span>
          <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip("warm")}>
            <IconX size={16} />
          </button>
        </section>
      )}

      {first && sources}

      <div className="wp-bar">
        {!phone && (
          <span className="wp-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
              Map
            </button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              Table
            </button>
          </span>
        )}
        <span className="wp-zones" role="group" aria-label="Show one quadrant">
          {(["all", ...ZONES] as const).map((z) => (
            <button key={z} type="button" className="wp-zbtn" aria-pressed={zone === z} onClick={() => setZone(z)}>
              {z === "all" ? "All" : QUADRANTS[z].title}
              <strong>{z === "all" ? n(rows.length) : n(counts[z])}</strong>
            </button>
          ))}
        </span>
        <span className="wp-grow" />
        <button type="button" className="wp-srclink" onClick={() => goSources()}>
          Sources <strong>{onCount} of 5 on</strong>
        </button>
      </div>
      <div className="wp-bar wp-bar2">
        {filters.map((x) => {
          const on = x.k === "list" ? f.list === x.val : !!f[x.k];
          return (
            <button
              key={`${x.k}${x.val ?? ""}`}
              type="button"
              className="wp-fbtn"
              aria-pressed={on}
              onClick={() => setF((o) => ({ ...o, [x.k]: x.k === "list" ? (on ? null : x.val) : !on }))}
            >
              {x.label}
              <strong>{n(x.n)}</strong>
            </button>
          );
        })}
        {who && (
          <button type="button" className="wp-fbtn" aria-pressed onClick={() => setWho(null)}>
            Through {people.find((p) => p.key === who)?.name ?? "them"} · clear
          </button>
        )}
        {first && v.icp && (
          <span className="wp-icp">
            Showing companies that fit the ideal client you gave: {v.icp}.{" "}
            <button type="button" className="wp-link" onClick={c.openProfile}>
              Change your ideal client
            </button>
          </span>
        )}
      </div>
      {!ex && lockedWaysWords(v.lockedWays) && (
        <p className="wp-note" role="note">
          {lockedWaysWords(v.lockedWays)} Each one names its company and the person once it is open.
        </p>
      )}

      {!v.rows.length && !ex ? (
        <NoFits onProfile={c.openProfile} onRadar={() => c.openPage("radar")} onExample={first ? () => setEx(true) : undefined} />
      ) : (
        <div className={cx("wp-body", view === "table" && "wp-body-table", phone && "wp-body-phone")}>
          {(view === "map" || phone) && (
            <section className="wp-list" aria-label="Ranked list, best first">
              <div className="wp-tabs" role="tablist" aria-label="Rank by">
                <button type="button" role="tab" aria-selected={tab === "co"} onClick={() => setTab("co")}>
                  Companies · {n(shown.length)}
                </button>
                <button type="button" role="tab" aria-selected={tab === "ppl"} onClick={() => setTab("ppl")}>
                  People · {n(people.length)}
                </button>
              </div>
              <div className="wp-list-scroll">
                {tab === "co" ? (
                  <>
                    {shown.map((r, k) => (
                      <button key={r.id} type="button" className="wp-row" aria-pressed={r === cur} onClick={() => pick(r.id)} data-row={r.id}>
                        <span className="wp-n num">{k + 1}</span>
                        <Tile r={r} size={32} />
                        <span className="wp-row-main">
                          <span className="wp-row-top">
                            <span className="wp-ell wp-row-name">{r.locked ? `Locked · ${kindOf(r)}` : label(r)}</span>
                            <strong className={cx("wp-est", r.best !== null && r.zone !== "watch" && r.zone !== "find" && "on")}>{estText(r)}</strong>
                          </span>
                          <span className="wp-row-sub">
                            <span className="wp-ell">{r.plan ? "Your plan is on" : r.via ?? "No way in yet"}</span>
                            <span className="wp-row-zone">{QUADRANTS[r.zone].title}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                    {!shown.length && (
                      <div className="wp-empty">
                        No company matches these filters.{" "}
                        <button type="button" className="wp-link" onClick={() => (setZone("all"), setF({}), setWho(null))}>
                          Clear the filters
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <span className="wp-list-lead">People who can get you in, by how many of these companies each one opens. Pick one to light up their companies.</span>
                    {people.map((p, k) => (
                      <button key={p.key} type="button" className="wp-row" aria-pressed={who === p.key} onClick={() => (who === p.key ? setWho(null) : (setWho(p.key), setZone("all"), setSel(p.best)))}>
                        <span className="wp-av" style={{ background: TINTS[(k + 2) % 6] }} aria-hidden>
                          {initials(p.name)}
                        </span>
                        <span className="wp-row-main">
                          <span className="wp-row-top">
                            <span className="wp-ell wp-row-name">{p.name}</span>
                            <strong className="wp-est">{p.n === 1 ? "1 company" : `${p.n} companies`}</strong>
                          </span>
                          <span className="wp-row-sub">
                            <span className="wp-ell">{p.sub ?? ""}</span>
                            <span className="wp-row-zone">{p.band}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                    {!people.length && (
                      <div className="wp-empty">
                        Nobody is named yet. Open a company with a path and the fellow fractional who held the seat shows here, free.{" "}
                        <button type="button" className="wp-link" onClick={() => goSources()}>
                          Or bring in who you know
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {view === "map" && !phone && (
            <MapCard
              rows={onMap}
              shownIds={new Set(shown.map((r) => r.id))}
              cur={cur}
              v={v}
              ex={ex}
              zone={zone}
              onZone={(z) => setZone(zone === z ? "all" : z)}
              onPick={pick}
              modes={first ? { ex, set: (on) => (setEx(on), setSel(null), setWho(null), setZone("all"), setF({})) } : null}
            />
          )}

          {view === "table" && !phone && <WarmTable rows={shown} ex={ex} cur={cur} onPick={pick} />}

          {!phone && cur && (ex ? <ExampleAside r={cur} /> : <Aside key={cur.id} r={cur} noteOpen={note} setNote={setNote} onSources={() => goSources()} />)}
        </div>
      )}

      {!first && sources}
      {!first && <Suggestions linkedin={v.own.linkedin} csv={v.own.csv} />}

      <div className="wp-foot" role="status">
        <span>
          {ex ? "Example: made-up companies and people, never counted." : `${n(v.total)} companies that fit you · ${through === 1 ? "1 has a way in through someone" : `${n(through)} have a way in through someone`}`}
        </span>
        <button type="button" className="wp-link" onClick={() => c.start.run("network")}>
          Everyone you know
        </button>
        <button type="button" className="wp-link" onClick={() => c.openSeats()}>
          Seats you have held
        </button>
        <button type="button" className="wp-link" onClick={() => c.openPage("messages")}>
          Messages
        </button>
      </div>
    </div>
  );
}

const zoneCounts = (rows: WarmRow[]) => {
  const o: Record<Zone, number> = { go: 0, find: 0, warm: 0, watch: 0 };
  for (const r of rows) o[r.zone]++;
  return o;
};

/** People who can get you in, from the routes of the companies the member can see, by how many companies each opens. */
function peopleOf(rows: WarmRow[]) {
  const m = new Map<string, { key: string; name: string; sub: string | null; n: number; band: string; best: string; bestRank: number }>();
  const order = ["Cold", "Fading", "Good", "Strong"];
  for (const r of rows)
    for (const p of r.people) {
      const was = m.get(p.key);
      if (!was) m.set(p.key, { key: p.key, name: p.name, sub: p.sub, n: 1, band: p.band, best: r.id, bestRank: r.rank });
      else {
        was.n++;
        if (order.indexOf(p.band) > order.indexOf(was.band)) was.band = p.band;
        if (r.rank < was.bestRank) (was.best = r.id), (was.bestRank = r.rank);
      }
    }
  return [...m.values()].sort((a, b) => b.n - a.n || order.indexOf(b.band) - order.indexOf(a.band) || a.name.localeCompare(b.name));
}

function Tile({ r, size }: { r: WarmRow; size: number }) {
  return (
    <span className={cx("wp-tile", r.locked && "locked")} style={{ width: size, height: size, flex: `0 0 ${size}px`, background: r.locked ? undefined : TINTS[r.rank % 6] }} aria-hidden>
      {r.locked ? "?" : initials(label(r))}
    </span>
  );
}

/** No company fits yet: the three ways to give Merlin companies, each a link. */
function NoFits({ onProfile, onRadar, onExample }: { onProfile: () => void; onRadar: () => void; onExample?: () => void }) {
  return (
    <div className="wp-nofit">
      <strong>No companies fit you yet</strong>
      <span>The map places the companies that fit you. Give Merlin something to fit:</span>
      <span className="wp-nofit-acts">
        <button type="button" className="btn btn-pine" onClick={onProfile}>
          Fill in your ideal client
        </button>
        <button type="button" className="btn" onClick={onRadar}>
          Open your Crystal Ball
        </button>
        {onExample && (
          <button type="button" className="btn btn-ghost" onClick={onExample}>
            See an example map
          </button>
        )}
      </span>
    </div>
  );
}

/* ---------- the map ---------- */

const QPOS: Record<Zone, string> = { find: "tl", go: "tr", watch: "bl", warm: "br" };

function MapCard({
  rows, shownIds, cur, v, ex, zone, onZone, onPick, modes,
}: {
  rows: WarmRow[];
  shownIds: Set<string>;
  cur: WarmRow | null;
  v: WarmView;
  ex: boolean;
  zone: Zone | "all";
  onZone: (z: Zone) => void;
  onPick: (id: string) => void;
  modes: { ex: boolean; set: (on: boolean) => void } | null;
}) {
  const per = zoneCounts(rows);
  const all = ex ? per : v.countsAll;
  // A few names on the map: the one picked, then the best few that keep clear of each other.
  const named = new Set<string>();
  if (cur) named.add(cur.id);
  const spots: [number, number][] = cur ? [[cur.x, cur.y]] : [];
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (named.size >= 6) break;
    if (r.locked || !shownIds.has(r.id) || named.has(r.id)) continue;
    // The picked company's label is wider (its estimate in a pill): keep further clear of it.
    if (spots.some(([x, y], k) => Math.abs(x - r.x) < (k === 0 && cur ? 60 : 26) && Math.abs(y - r.y) < 8)) continue;
    named.add(r.id);
    spots.push([r.x, r.y]);
  }
  const lines = ex ? { fit: { words: "Fit 3 of 5 or more" }, way: { words: "Est. success 35% or more" } } : v.lines;
  const warmest = ex ? 75 : v.warmest;
  return (
    <section className="wp-map" aria-label="Map">
      <div className="wp-map-head">
        {modes ? (
          <span className="wp-seg wp-seg-sm" role="group" aria-label="Which map">
            <button type="button" aria-pressed={!modes.ex} onClick={() => modes.set(false)}>
              Your map today
            </button>
            <button type="button" aria-pressed={modes.ex} onClick={() => modes.set(true)}>
              Example: after you connect
            </button>
          </span>
        ) : (
          <strong className="wp-map-t">Fit by way in</strong>
        )}
        <span className="wp-legend">
          <span>
            <span className="wp-lg-hot" aria-hidden /> Hiring now
          </span>
          <span>
            <span className="wp-lg-plan" aria-hidden /> Your plan
          </span>
          <span>
            <span className="wp-lg-lock" aria-hidden>
              ?
            </span>{" "}
            Locked
          </span>
        </span>
      </div>
      {ex && (
        <div className="wp-exnote" role="note">
          <strong>Example.</strong> Made-up companies and people. This is what the map looks like once Google or your connections file is in.
        </div>
      )}
      <div className="wp-plot">
        <div className="wp-yaxis" aria-hidden>
          <span className="wp-y-top">Strong fit</span>
          <strong className="wp-y-mid">How well the company fits you</strong>
          <span className="wp-y-bot">Loose fit</span>
        </div>
        <div className="wp-plot-main">
          <div className={cx("wp-field", ex && "wp-field-ex")} role="group" aria-label="Companies by how well they fit you and how strong your way in is">
            {(["find", "go", "watch", "warm"] as Zone[]).map((z) => (
              <div key={z} className={`wp-q wp-q-${QPOS[z]} wp-q-${z}`} aria-hidden />
            ))}
            <div className="wp-noroute" aria-hidden>
              <span>No route</span>
            </div>
            {(["find", "go", "watch", "warm"] as Zone[]).map((z) => (
              <button key={z} type="button" className={`wp-qlab wp-qlab-${QPOS[z]}`} aria-pressed={zone === z} onClick={() => onZone(z)}>
                <span className="wp-qlab-t">
                  {QUADRANTS[z].title} · {per[z] < all[z] ? `${per[z]} of ${all[z]}` : all[z]}
                </span>
                <span className="wp-qlab-h">{QUADRANTS[z].hint}</span>
              </button>
            ))}
            <div className="wp-mid wp-mid-v" aria-hidden />
            <div className="wp-mid wp-mid-h" aria-hidden />
            {cur && cur.onMap && (
              <>
                <div className="wp-cross-v" style={{ left: `${cur.x}%`, height: `${cur.y}%` }} aria-hidden />
                <div className="wp-cross-h" style={{ bottom: `${cur.y}%`, width: `${cur.x}%` }} aria-hidden />
              </>
            )}
            {rows.map((r) => {
              const on = cur?.id === r.id;
              const dim = !shownIds.has(r.id);
              const left = r.x > 62;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cx("wp-mark", on && "on", r.plan && "plan", dim && "dim", ex && "ex")}
                  style={{ left: `${r.x}%`, bottom: `${r.y}%`, zIndex: on ? 4 : named.has(r.id) ? 2 : 1 } as CSSProperties}
                  aria-pressed={on}
                  aria-label={`${r.locked ? `Locked company, ${r.facts}` : `${label(r)}, ${r.facts}`}. ${QUADRANTS[r.zone].title}. ${r.best === null ? "No way in yet" : `Est. success ${r.best}%`}. Fit ${r.fit} of 5${r.hiringNow ? ". Hiring now" : ""}${ex ? ". Example" : ""}`}
                  onClick={() => onPick(r.id)}
                  data-mark={r.id}
                >
                  <Tile r={r} size={28} />
                  {r.hiringNow && <span className="wp-hot" aria-hidden />}
                  {named.has(r.id) && (
                    <span className={cx("wp-mlab", left && "left", on && "on")} aria-hidden>
                      {r.locked ? `${kindOf(r)}, locked` : label(r)}
                      {on && r.best !== null ? ` · ${r.best}%` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="wp-xaxis" aria-hidden>
            <span style={{ left: "6.5%" }}>No route</span>
            <span style={{ left: "29%" }}>Colder</span>
            <span style={{ left: "73%" }}>Warmer</span>
            {cur && cur.onMap && (
              <span className="wp-cross-pill" style={{ left: `${Math.max(10, Math.min(90, cur.x))}%` }}>
                {cur.best === null ? "No way in yet" : `${cur.band ?? ""} · ${cur.best}%`}
              </span>
            )}
          </div>
          <strong className="wp-xaxis-t">How strong your way in is: Merlin&apos;s estimate of success, from 5% to 85%</strong>
        </div>
      </div>
      <p className="wp-lines">
        The lines sit in the middle of {ex ? "these" : `your ${n(v.total)}`} companies, so each quadrant holds some. Above the line across: {lines.fit.words}. Right of the line down: {lines.way.words}. They move as your companies and ways in change.{" "}
        {warmest === null
          ? "No way in yet at any of them."
          : warmest < 35
            ? `Your warmest way in today is ${warmest}%, so even Go now is a cold start. Bring in who you know to warm them up.`
            : `Your warmest way in today is ${warmest}%.`}
        {rows.length < (ex ? rows.length : v.total) ? ` The map shows the best ${rows.length} across the four quadrants; the list has all ${n(v.total)}.` : ""}
      </p>
    </section>
  );
}

/* ---------- the table (the workbench) ---------- */

function WarmTable({ rows, ex, cur, onPick }: { rows: WarmRow[]; ex: boolean; cur: WarmRow | null; onPick: (id: string, o?: { note?: boolean }) => void }) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const byRow = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const tRows: Row[] = useMemo(() => {
    if (ex) return [];
    const all = new Map(rowsFor("companies", c.infos).map((r) => [r.i.c.id, r]));
    return rows.map((r) => all.get(r.id)).filter((x): x is Row => !!x);
  }, [rows, c.infos, ex]);
  const wr = (r: Row) => byRow.get(r.i.c.id);
  const col = (id: string, label: string, width: string, fill: (w: WarmRow) => "value" | "empty", extra: Partial<ColumnDef> = {}): ColumnDef => ({
    id, type: "companies", label, cost: "free", word: "on file", width, fill: (r) => (wr(r) ? fill(wr(r)!) : "empty"), ...extra,
  });
  const cols: ColumnDef[] = [
    COMPANY_COLUMNS[0],
    col("wpZone", "Quadrant", "minmax(112px, 0.6fr)", () => "value"),
    col("wpWay", "Way in through", "minmax(160px, 1.1fr)", (w) => (w.best !== null ? "value" : "empty"), { word: "have a path" }),
    col("wpEst", "Est. success", "minmax(96px, 0.5fr)", (w) => (w.best !== null ? "value" : "empty"), { num: true }),
    col("wpFit", "Fit", "minmax(84px, 0.5fr)", () => "value"),
    col("wpWhy", "Why Merlin believes it", "minmax(190px, 1.3fr)", (w) => (w.best !== null ? "value" : "empty")),
    col("wpFresh", "Fresh", "minmax(100px, 0.6fr)", (w) => (w.fresh?.word ? "value" : "empty")),
    col("wpNext", "Next", "minmax(150px, 0.8fr)", () => "value"),
  ];
  if (ex)
    return (
      <section className="wp-tablewrap" aria-label="Paths table">
        <div className="wp-exnote" role="note">
          <strong>Example.</strong> The table fills with your own companies once you are past the first visit. Switch to the map to see the example.
        </div>
      </section>
    );
  const cell = (id: string, r: Row): ReactNode | undefined => {
    const w = wr(r);
    if (!w) return undefined;
    switch (id) {
      case "wpZone":
        return <span className={`wp-zchip wp-zchip-${w.zone}`}>{QUADRANTS[w.zone].title}</span>;
      case "wpWay":
        return (
          <span className="wp-td2">
            <span className="wp-ell">{w.best === null ? "No way in yet" : w.locked ? (w.src === "fellow" ? "A fellow fractional" : "Someone, once open") : w.person?.name ?? (w.via ?? "")}</span>
            <span className="wp-ell wp-sub">{w.best === null ? "Find one" : w.person?.sub ?? w.via ?? ""}</span>
          </span>
        );
      case "wpEst":
        return (
          <span className="wp-td2">
            <strong className={cx("wp-est", w.best !== null && w.best >= 35 && "on")}>{estText(w)}</strong>
            <span className="wp-bar-t" aria-hidden>
              <span style={{ width: `${Math.round(((w.best ?? 0) / 85) * 100)}%` }} />
            </span>
          </span>
        );
      case "wpFit":
        return (
          <span className="wp-td2">
            <span>{w.fit} of 5</span>
            <span className="wp-bar-t" aria-hidden>
              <span style={{ width: `${w.fit * 20}%`, background: "#0B6B45" }} />
            </span>
          </span>
        );
      case "wpWhy":
        return (
          <span className="wp-td2">
            <span className="wp-ell">{w.best === null ? "Nobody you know leads here" : `${w.band ?? ""}${w.src ? ` · through ${SRC_TAG[w.src]}` : ""}`}</span>
            <span className="wp-ell wp-sub">{w.fitWords.length ? listWords(w.fitWords) : "No fit traits on file"}</span>
          </span>
        );
      case "wpFresh":
        return (
          <span className="wp-td2">
            <span>{w.fresh?.word ?? (w.best === null ? "No signal" : "Undated")}</span>
            <span className="wp-sub">{w.fresh?.days !== null && w.fresh?.days !== undefined ? (w.fresh.days === 0 ? "Going now" : `${n(w.fresh.days)} days old`) : ""}</span>
          </span>
        );
      case "wpNext":
        return (
          <button
            type="button"
            className={cx("btn btn-sm", w.best !== null && !w.locked && !w.plan ? "btn-pine" : "")}
            onClick={(e) => {
              e.stopPropagation();
              if (w.locked) c.openCompany(w.id);
              else if (w.plan) openWay(w.id);
              else onPick(w.id, { note: w.best !== null });
            }}
          >
            {w.locked ? "Open the company" : w.plan ? "Open your plan" : w.best === null ? "Find a way in" : "Ask for an intro"}
          </button>
        );
    }
    return undefined;
  };
  const open = [...picked].filter((id) => byRow.get(id) && !byRow.get(id)!.locked);
  return (
    <section className="wp-tablewrap" aria-label="Paths table">
      {picked.size > 0 && (
        <div className="wp-bulk" role="toolbar" aria-label="Actions for selected rows">
          <strong>{picked.size} selected</strong>
          <button
            type="button"
            className="wp-bulk-1"
            onClick={async () => {
              for (const id of picked) await ui.act({ type: "follow", companyId: id, on: true } as never, { quiet: true });
              toast(`Following ${picked.size}. Merlin tells you when a new way in appears.`);
            }}
          >
            Follow for new routes
          </button>
          <button
            type="button"
            className="wp-bulk-2"
            disabled={!open.length}
            onClick={async () => {
              const r = await pipelineAct({ type: "pipeline.add", companyIds: open });
              if (r?.message) toast(r.message);
            }}
          >
            Add {open.length || ""} to pipeline
          </button>
          <button type="button" className="wp-bulk-x" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}
      <Workbench
        type="companies"
        rows={tRows}
        cols={cols}
        mine={c.me.function ?? null}
        selected={new Set(tRows.filter((r) => picked.has(r.i.c.id)).map((r) => r.key))}
        onPick={(key, on) => {
          const id = tRows.find((r) => r.key === key)?.i.c.id;
          if (!id) return;
          setPicked((s) => {
            const x = new Set(s);
            if (on) x.add(id);
            else x.delete(id);
            return x;
          });
        }}
        onPickAll={(on) => setPicked(on ? new Set(tRows.map((r) => r.i.c.id)) : new Set())}
        onOpen={(r) => onPick(r.i.c.id)}
        sort="name"
        onAddColumn={() => toast("Warm paths keeps these columns. Add more on Companies.")}
        cell={cell}
        rowClass={(r) => (cur?.id === r.i.c.id ? "wp-tr-cur" : "")}
      />
    </section>
  );
}

/* ---------- the company picked ---------- */

function Chain({ r, locked }: { r: RouteView; locked: boolean }) {
  const items: ReactNode[] = [];
  r.nodes.forEach((nd, k) => {
    const you = nd.role === "you";
    const square = nd.role === "target" && (nd.company || k === r.nodes.length - 1);
    items.push(
      <li key={`n${k}`} className="wp-ch-node">
        <span className={cx("wp-ch-mark", you && "you", square && "co", nd.locked && "locked")} aria-hidden>
          {you ? "You" : nd.locked || locked ? "?" : initials(nd.label)}
        </span>
        <span className="wp-ch-text">
          <span className="wp-ch-t">{you ? "You" : nd.label}</span>
          {nd.sub ? <span className="wp-ch-s">{nd.sub}</span> : null}
        </span>
      </li>,
    );
    const l = r.links[k];
    if (l) {
      const [wpx, col] = BAND_W[l.band] ?? [2, "#B4BDB8"];
      items.push(
        <li key={`l${k}`} className="wp-ch-link">
          <span className="wp-ch-bar" style={{ width: wpx, background: col, margin: `0 ${17 - wpx / 2}px` }} aria-hidden />
          <span className="wp-ch-text">
            <span className={cx("wp-ch-lt", (l.band === "Strong" || l.band === "Good") && "warm")}>
              {l.band} · {l.words}
            </span>
            {l.from ? <span className="wp-ch-s">{l.from}</span> : null}
          </span>
        </li>,
      );
    }
  });
  return (
    <ol className="wp-chain" aria-label={`Your path: ${r.chain}`}>
      {items}
    </ol>
  );
}

function Aside({ r, noteOpen, setNote, onSources }: { r: WarmRow; noteOpen: boolean; setNote: (on: boolean) => void; onSources: () => void }) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const copy = useCopy();
  const w = useWayIn(r.locked ? null : r.id);
  const [routeIdx, setRouteIdx] = useState(0);
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const v = w.data;
  const routes = v?.routes ?? [];
  const rt = routes[Math.min(routeIdx, Math.max(0, routes.length - 1))] ?? null;
  const ask = rt?.steps[0] ?? null;
  const [text, setText] = useState("");
  useEffect(() => setText(ask?.note?.body ?? ""), [ask?.note?.body]);
  const direct = !!rt && rt.between === 0;
  const pFirst = rt ? (rt.nodes[1]?.locked ? "them" : (rt.nodes[1]?.label ?? "").split(" ")[0]) : "";
  const chips = (
    <div className="wp-chips">
      <span className={`wp-zchip wp-zchip-${r.zone}`}>{QUADRANTS[r.zone].title}</span>
      <span className="wp-chip">Fit {r.fit} of 5</span>
      {r.hiringNow && <span className="wp-chip wp-chip-hot">Hiring now</span>}
      {r.ball && <span className="wp-chip">In your Crystal Ball</span>}
    </div>
  );
  const head = (
    <div className="wp-as-head">
      <Tile r={r} size={40} />
      <span className="wp-as-name">
        {r.locked ? (
          <strong>Locked company</strong>
        ) : (
          <button type="button" className="wp-as-link" onClick={() => c.openCompany(r.id)}>
            {label(r)}
          </button>
        )}
        <span className="wp-sub">{r.facts}</span>
      </span>
    </div>
  );
  const markSent = async () => {
    if (!rt) return;
    setBusy(true);
    const a = await wayPost(r.id, { do: "go", route: rt.id });
    const b = a.error ? a : await wayPost(r.id, { do: "step", step: 1, answer: "sent" });
    setBusy(false);
    if (b.error) return toast(b.error);
    setSent(true);
    setNote(false);
    toast(`${label(r)} is in your pipeline under Reached out.`);
    if (b.view) w.set(b.view);
  };
  const sendIt = async () => {
    if (!ask?.note) return;
    const act = ask.act;
    if (act?.kind === "message") {
      const res = await ui.act(act.conversation ? { type: "message.send", conversationId: act.conversation, text: text.trim() } : ({ type: "message.connect", memberId: act.member, text: text.trim() } as never), { quiet: true });
      if (!res.ok) return;
    } else window.open(gmailLink(ask.note.email, ask.note.subject, text), "_blank", "noopener");
    await markSent();
  };
  return (
    <aside className="wp-aside" aria-label="The path into the company you picked" data-aside={r.id}>
      {head}
      {chips}
      {r.locked ? (
        <div className="wp-as-box">
          <span>
            Open it to see its name{r.best !== null ? " and who can get you in" : " and who held each seat"}.{r.best !== null && r.src === "fellow" ? " A fellow fractional held a seat there." : ""} Nothing is spent until you press Unlock.
          </span>
          <UnlockCompany id={r.id} rate={false} roles={r.hiringNow} />
        </div>
      ) : r.best === null ? (
        <div className="wp-as-box">
          <strong>No way in yet</strong>
          <span>Nobody you know leads here yet. Three ways to find one:</span>
          <button type="button" className="wp-way" onClick={onSources}>
            <strong>Bring in more people you know</strong>
            <span>Google, your LinkedIn connections file or a CSV. Each person at a company that fits becomes a path.</span>
          </button>
          <button type="button" className="wp-way" onClick={() => c.openPage("peers")}>
            <strong>Ask a fellow fractional</strong>
            <span>Fellow fractionals who serve companies like this one. Free to message.</span>
          </button>
          <button type="button" className="wp-way" onClick={() => void ui.act({ type: "follow", companyId: r.id, on: true } as never).then((x) => x.ok && toast(`Following ${label(r)} for new routes.`))}>
            <strong>Follow for new routes</strong>
            <span>Merlin tells you when a way in appears.</span>
          </button>
        </div>
      ) : !v ? (
        <p className="wp-sub" role="status">
          {w.failed ? "The path didn't load. Pick the company again." : "Finding the path…"}
        </p>
      ) : !rt ? (
        <div className="wp-as-box">
          <span>The routes there changed since the map was read.</span>
          <button type="button" className="btn" onClick={() => openWay(r.id)}>
            See your way in
          </button>
        </div>
      ) : (
        <>
          <dl className="wp-stats">
            <div>
              <dt>Est. success</dt>
              <dd className="num">{rt.est}%</dd>
            </div>
            <div>
              <dt>In between</dt>
              <dd>{betweenWords(rt.between)}</dd>
            </div>
            <div>
              <dt>To a meeting</dt>
              <dd>{rt.time}</dd>
            </div>
          </dl>
          <div className="wp-path">
            <span className="wp-eyebrow">Your path, and why Merlin believes it</span>
            <Chain r={rt} locked={false} />
            <span className="wp-why">{rt.why}</span>
            <span className="wp-fitline">{fitLine(r)}</span>
          </div>
          {rt.fresh && (
            <div className="wp-fresh">
              <span className={cx("wp-fpill", rt.fresh.word && `wp-fpill-${rt.fresh.word.toLowerCase()}`)}>{rt.fresh.word ?? "Undated"}</span>
              <span>{rt.fresh.line} Merlin read it today.</span>
            </div>
          )}
          {v.plan || sent ? (
            <div className="wp-as-box">
              <span className="wp-eyebrow">Your plan · in your pipeline</span>
              <span>{v.plan ? `Step ${Math.min(v.plan.step, v.plan.steps)} of ${v.plan.steps}${v.plan.current ? ` · ${v.plan.current.steps[Math.min(v.plan.step, v.plan.steps) - 1]?.title ?? ""}` : ""}` : "Sent. Waiting on a reply."}</span>
              <span className="wp-acts">
                <button type="button" className="btn btn-pine" onClick={() => openWay(r.id)}>
                  Open your plan
                </button>
                <button type="button" className="btn" onClick={() => c.openPage("pipeline")}>
                  See it in Pipeline
                </button>
              </span>
            </div>
          ) : (
            <>
              <span className="wp-acts">
                <button type="button" className="btn btn-pine btn-lg" aria-expanded={noteOpen} onClick={() => setNote(!noteOpen)}>
                  {direct ? `Draft a note to ${pFirst}` : `Ask ${pFirst} for an intro`}
                </button>
                <button type="button" className="btn btn-lg" onClick={() => c.openCompany(r.id)}>
                  Open the record
                </button>
              </span>
              {noteOpen && ask?.note && (
                <div className="wp-note-box">
                  <span className="wp-eyebrow">Drafted by Merlin in your voice · to {ask.note.to}</span>
                  <strong>{ask.note.subject}</strong>
                  <textarea aria-label={`The note to ${ask.note.to}`} value={text} onChange={(e) => setText(e.target.value)} rows={8} />
                  <span className="wp-acts">
                    <button type="button" className="btn btn-pine" disabled={busy} aria-busy={busy} onClick={() => void sendIt()}>
                      {ask.act?.kind === "message" ? `Send to ${ask.act.first} on Merlin` : "Open in Gmail"}
                    </button>
                    {ask.act?.kind !== "message" && (
                      <button type="button" className="btn" onClick={() => void copy(text, "Note copied.")}>
                        Copy
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void markSent()}>
                      Mark as sent
                    </button>
                  </span>
                  <span className="wp-sub">Merlin never sends for you. Marking it sent puts the company in your pipeline under Reached out.</span>
                </div>
              )}
            </>
          )}
          {routes.length > 1 && (
            <div className="wp-alts">
              <span className="wp-eyebrow">Compare the routes</span>
              {routes.map((x, k) => (
                <button key={x.id} type="button" className="wp-alt" aria-pressed={x.id === rt.id} onClick={() => (setRouteIdx(k), setNote(false))}>
                  <span className="wp-ell">
                    {k === 0 ? "Recommended: " : ""}
                    {x.between === 0 ? "straight to " : "through "}
                    {x.between === 0 ? x.nodes[1]?.label : x.nodes[1]?.label}
                  </span>
                  <strong>{x.est}%</strong>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="wp-link" aria-expanded={why} onClick={() => setWhy(!why)}>
            How Merlin estimates this
          </button>
          {why && <span className="wp-sub">{v.explain} It is an estimate, never a promise.</span>}
        </>
      )}
    </aside>
  );
}

/** The example's company: the same layout, labelled, with nothing to press. */
function ExampleAside({ r }: { r: WarmRow }) {
  const rt = exampleRoute(r);
  return (
    <aside className="wp-aside" aria-label="An example path" data-aside="example">
      <div className="wp-as-head">
        <Tile r={r} size={40} />
        <span className="wp-as-name">
          <strong>{label(r)}</strong>
          <span className="wp-sub">{r.facts}</span>
        </span>
        <span className="wp-exlabel">Example</span>
      </div>
      <div className="wp-chips">
        <span className={`wp-zchip wp-zchip-${r.zone}`}>{QUADRANTS[r.zone].title}</span>
        <span className="wp-chip">Fit {r.fit} of 5</span>
      </div>
      {rt ? (
        <>
          <dl className="wp-stats">
            <div>
              <dt>Est. success</dt>
              <dd className="num">{rt.est}%</dd>
            </div>
            <div>
              <dt>In between</dt>
              <dd>{betweenWords(rt.between)}</dd>
            </div>
            <div>
              <dt>To a meeting</dt>
              <dd>{rt.time}</dd>
            </div>
          </dl>
          <div className="wp-path">
            <span className="wp-eyebrow">The path, and why Merlin would believe it</span>
            <Chain r={rt} locked={false} />
            <span className="wp-why">{rt.why}</span>
          </div>
        </>
      ) : (
        <div className="wp-as-box">No way in yet, even after connecting. Merlin would say so here.</div>
      )}
      <span className="wp-sub">An example only: made-up people, nothing to send.</span>
    </aside>
  );
}

/* ---------- Sources ---------- */

const ICONS: Record<string, string> = {
  google: "M4 5h16v14H4zM9 11a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM6 16a3 3 0 0 1 6 0M14 9h4M14 13h3",
  linkedin: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  csv: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  messages: "M5 5h14v11H10l-5 4z",
  fellow: "M7 4h10v8H7zM5 12h14v4H5zM7 16v4M17 16v4",
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Sources({ v, first, open, onOpen, onRead }: { v: WarmView; first: boolean; open: SourceKey | null; onOpen: (k: SourceKey | null) => void; onRead: () => void }) {
  const c = useApp();
  const net = useNetwork();
  const { view: pv } = usePaths();
  const [li, setLi] = useState(false);
  const g = net.view?.google ?? null;
  const gOn = !net.off && !!g && g.status !== "reconnect";
  const paths = (k: WaySource) => {
    const x = v.bySource[k] ?? 0;
    return x === 1 ? "1 path" : `${n(x)} paths`;
  };
  type Card = { k: string; name: string; on: boolean; status: string; count: string; meta: string; btn?: { t: string; go: () => void; primary?: boolean }; link?: { t: string; go: () => void }; paths?: string };
  const cards: Card[] = [
    {
      k: "google",
      name: "Google contacts",
      on: gOn,
      status: net.off ? "Not on for Merlin yet" : gOn ? "Connected" : "Not connected",
      count: gOn ? (g?.syncedAt ? `Read ${fmtDay(g.syncedAt)}` : "Reading now") : "Contacts and calendar names only.",
      meta: gOn ? "Merlin reads it again each day." : net.off ? "Your LinkedIn file or a CSV works without it." : "About 1 minute. Disconnect any time.",
      btn: net.off ? undefined : { t: gOn ? "Open Your network" : "Connect Google", go: () => (gOn ? c.openPage("network") : onOpen("google")), primary: first && !gOn },
      paths: gOn ? paths("google") : undefined,
    },
    {
      k: "linkedin",
      name: "LinkedIn connections file",
      on: !!pv?.linkedin,
      status: pv?.linkedin ? `Added ${fmtDay(pv.linkedin.at)}` : "Not added",
      count: pv?.linkedin ? `${n(pv.linkedin.rows)} connections · ${n(pv.linkedin.matched)} at companies on Merlin` : "The Connections.csv from your own export.",
      meta: pv?.linkedin ? "A newer file finds more." : "Three steps, about 10 minutes.",
      btn: { t: pv?.linkedin ? "Upload a newer file" : "Add your file", go: () => onOpen("linkedin"), primary: first && net.off },
      paths: pv?.linkedin ? paths("linkedin") : undefined,
    },
    {
      k: "csv",
      name: "CSV",
      on: !!pv?.csv,
      status: pv?.csv ? `Added ${fmtDay(pv.csv.at)}` : "Not added",
      count: pv?.csv ? `${n(pv.csv.rows)} rows · ${n(pv.csv.matched)} at companies on Merlin` : "A list from your CRM or a spreadsheet.",
      meta: pv?.csv ? "Import a newer one any time." : "Name and company are enough.",
      btn: { t: pv?.csv ? "Import a newer CSV" : "Import a CSV", go: () => onOpen("csv") },
      paths: pv?.csv ? paths("csv") : undefined,
    },
    {
      k: "messages",
      name: "Merlin messages",
      on: true,
      status: "On",
      count: v.conversations ? `${n(v.conversations)} ${v.conversations === 1 ? "conversation" : "conversations"}` : "No conversations yet",
      meta: "A reply from a fellow fractional becomes a path.",
      link: { t: "Open Messages", go: () => c.openPage("messages") },
      paths: paths("messages"),
    },
    {
      k: "fellow",
      name: "Fellow fractionals",
      on: true,
      status: "Free",
      count: `${n(v.directory)} in the directory`,
      meta: "Who held a seat there. Free on every plan.",
      link: { t: "Open Fractionals", go: () => c.openPage("peers") },
      paths: paths("fellow"),
    },
  ];
  return (
    <section id="wp-sources" className={cx("wp-src", first && "wp-src-first")} aria-label="Sources">
      <div className="wp-src-head">
        <h2>{first ? "Step 3 of 6. Bring in who you know" : "Sources"}</h2>
        <span className="wp-sub">
          {first
            ? "Each person you know at a company that fits you becomes a warm path on the map. Only you see them. Each source works on its own."
            : `Where your ${(() => {
                const k = Object.entries(v.bySource).reduce((a, [src, x]) => a + (src === "direct" ? 0 : (x ?? 0)), 0);
                return k === 1 ? "1 way in through someone comes" : `${n(k)} ways in through someone come`;
              })()} from. Only you see what you bring in.`}
        </span>
        {!first && (
          <span className="wp-src-links">
            <button type="button" className="wp-link" onClick={() => c.openPage("agent")}>
              Let your agent read your ways in
            </button>
            <button type="button" className="wp-link" onClick={() => c.start.run("network")}>
              Delete what you brought in
            </button>
          </span>
        )}
      </div>
      <div className="wp-src-cards">
        {cards.map((x) => (
          <div key={x.k} className={cx("wp-scard", x.btn?.primary && "primary", open === x.k && "open")} data-source={x.k}>
            <div className="wp-scard-top">
              <span className="wp-sicon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#073F2F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[x.k]} />
                </svg>
              </span>
              <strong>{x.name}</strong>
            </div>
            <span className="wp-scard-st">
              <span className={cx("wp-spill", x.on && "on")}>{x.status}</span>
              {x.paths && <strong>{x.paths}</strong>}
            </span>
            <span className="wp-scard-c">{x.count}</span>
            <span className="wp-sub">{x.meta}</span>
            {x.btn && (
              <button type="button" className={cx("btn", x.btn.primary ? "btn-pine" : "btn-outline", "wp-scard-b")} aria-expanded={open === x.k} onClick={x.btn.go}>
                {x.btn.t}
              </button>
            )}
            {x.link && (
              <button type="button" className="wp-link wp-scard-b" onClick={x.link.go}>
                {x.link.t}
              </button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div className="wp-src-panel">
          <button type="button" className="wp-src-close" aria-label="Close" onClick={() => onOpen(null)}>
            <IconX size={16} />
          </button>
          <ConnectPanel key={open} start={open} variant="inline" onNext={() => (onOpen(null), onRead())} nextLabel="See your map" onSeeKnown={() => c.start.run("network")} />
        </div>
      )}
      <div className="wp-src-foot">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B6B45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Merlin reads names, companies, titles and meeting dates.
        </span>
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#28322D" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          Never message text. Never shown to another member. Never contacts anyone.
        </span>
        <button type="button" className="wp-link" aria-expanded={li} onClick={() => setLi(!li)}>
          How to get your LinkedIn connections file
        </button>
      </div>
      {li && (
        <ol className="wp-li">
          {EXPORT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li>Up to 3 uploads a day.</li>
        </ol>
      )}
    </section>
  );
}

/* ---------- Suggested additions from your connections (RN_SUGGEST) ---------- */

function Suggestions({ linkedin, csv }: { linkedin: boolean; csv: boolean }) {
  const s = useSuggest(linkedin || csv);
  const toast = useToast();
  const c = useApp();
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const d = s.data;
  if (!d || !d.on || (!d.rows.length && !d.locked)) return null;
  const picked = d.rows.filter((r) => ticks.has(r.key));
  const earn = Math.min(picked.length, d.earnLeft);
  const run = async (op: "suggestAdd" | "suggestSkip") => {
    setBusy(true);
    const r = await suggestPost(op, picked.map((x) => x.key));
    setBusy(false);
    if (r.error) return toast(r.error);
    if (r.view) s.set(r.view);
    setTicks(new Set());
    if (r.message) toast(r.message);
    if (op === "suggestAdd") void c.refresh();
  };
  const tick = (x: SuggestRow, on: boolean) =>
    setTicks((t) => {
      const y = new Set(t);
      if (on) y.add(x.key);
      else y.delete(x.key);
      return y;
    });
  return (
    <section className="wp-sug" aria-labelledby="wp-sug-h">
      <div className="wp-src-head">
        <h2 id="wp-sug-h">Suggested additions from your connections</h2>
        <span className="wp-sub">
          People in your own LinkedIn file or CSV who look like a leader at a company on Merlin with nobody like that on file. Tick who to add. Only their name, title and relationship go in, never an email, a phone or anything else from your file. You earn 1 credit for each person, up to {d.earnLeft} more today.
        </span>
      </div>
      {d.rows.length > 0 && (
        <ul className="wp-sug-list">
          {d.rows.map((x) => (
            <li key={x.key}>
              <label className="wp-sug-row">
                <input type="checkbox" className="wb-check" checked={ticks.has(x.key)} onChange={(e) => tick(x, e.target.checked)} />
                <span className="wp-row-main">
                  <span className="wp-row-name">{x.name}</span>
                  <span className="wp-sub">
                    {x.title} at {x.company} · {x.rel}
                  </span>
                </span>
                <span className="wp-sub">From your {x.from === "linkedin" ? "LinkedIn file" : "CSV"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {d.locked > 0 && (
        <p className="wp-sub">
          {d.locked} more at {d.locked === 1 ? "a company" : "companies"} still locked for you. Open {d.locked === 1 ? "it" : "them"} and they show here.
        </p>
      )}
      {d.rows.length > 0 && (
        <span className="wp-acts">
          <button type="button" className="btn wp-earn" disabled={!picked.length || busy} aria-busy={busy} onClick={() => void run("suggestAdd")}>
            {picked.length ? `Add ${picked.length} · earn ${earn} ${earn === 1 ? "credit" : "credits"}` : "Tick people to add"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!picked.length || busy} onClick={() => void run("suggestSkip")}>
            Don&apos;t suggest these again
          </button>
        </span>
      )}
    </section>
  );
}
