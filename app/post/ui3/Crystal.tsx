"use client";

/**
 * Crystal Ball in the new design (find-design/v5 flagship): the editorial top with the count, the
 * new ones and the ideal client; Demand over six months (each company's dated signals on one lane,
 * gold when this week; hover a dot for what it was and when, click a lane to show only that
 * company); tabs by the kind of signal; and one row a company with the opening its strongest signal
 * points at, its fit (seven traits), Explore (Crystal Ball's own open: free on Trial and Pro, one a
 * day on Free, else the record with its price), Watch (follow) and Why it matters (every signal,
 * dated, why now, where Merlin found it, and how it fits).
 *
 * Everything else Crystal Ball does today (the ranges' table with its columns, picking rows, What
 * counts most, Not for me, delivery) is one click away in "Table and tuning": today's page, in the shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { RADAR_RANGES, type RadarRange, type RadarRow, type RadarSigView } from "@/lib/radar/types";
import { TUNE_GROUPS, tuneGroupOf, type TuneGroup } from "@/lib/radar/tune";
import { useApp } from "../shell/pages";
import { useCrystalClick } from "../CrystalOpen";
import { dateWords, kindLabel, sourcesLine, whenLong } from "../crystal/crystalModel";
import type { CoInfo } from "../model";
import { useUi3Head } from "./head";
import { useCoActs } from "./data";
import { Ic } from "./icons";
import { Band, Chip, CoLogo, FitRing, Traits, Wait } from "./parts";
import { coLine, coName, fit7 } from "./model";
import { oppTitle } from "./Home";

const Legacy = dynamic(() => import("../crystal/CrystalBall").then((m) => m.CrystalBallPage), { ssr: false, loading: () => <Wait /> });

/** The tabs' short words for each kind of signal. */
const GROUP_WORD: Record<TuneGroup, string> = { role: "Role posted", seat: "Seat ending", lead: "Leadership change", adj: "Fractional hires", rep: "History", grow: "Growth", gap: "Leadership gap" };
const DAY = 86_400_000;
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
let tableMode = false;

interface CRow {
  row: RadarRow;
  i: CoInfo;
  fresh: boolean;
  group: TuneGroup;
}

export function Ui3Crystal() {
  const c = useApp();
  const s = c.shell;
  const view = s.radar.data;
  const me = c.me;
  const fn = view?.function ?? me.function ?? null;
  const [table, setTable] = useState(tableMode);
  useUi3Head([], table ? "Crystal Ball · Table and tuning" : "Crystal Ball");
  const flip = (on: boolean) => ((tableMode = on), setTable(on));

  const today = view?.today ?? new Date().toISOString().slice(0, 10);
  const rows: CRow[] = useMemo(
    () =>
      (view?.rows ?? [])
        .map((row) => ({ row, i: c.byId.get(row.id) }))
        .filter((x): x is { row: RadarRow; i: CoInfo } => !!x.i)
        .map(({ row, i }) => ({ row, i, fresh: !!row.day && dayMs(today) - dayMs(row.day) < 7 * DAY, group: tuneGroupOf(row.kinds[0]) })),
    [view, c.byId, today],
  );
  const newN = rows.filter((r) => r.fresh).length;
  const [kind, setKind] = useState<"all" | "new" | TuneGroup>("all");
  const [only, setOnly] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const list = rows.filter((r) => (!only || r.row.id === only) && (kind === "all" || (kind === "new" ? r.fresh : r.group === kind)));
  const groups = TUNE_GROUPS.map((g) => ({ k: g.key, n: rows.filter((r) => r.group === g.key).length })).filter((g) => g.n > 0);

  const crystalClick = useCrystalClick();
  const explore = useCallback((r: CRow) => void crystalClick(r.row.id, !!r.i.c.hidden, () => c.openCompany(r.row.id)), [crystalClick, c]);
  const acts = useCoActs();

  if (table)
    return (
      <>
        <div className="u3 u3-backbar">
          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => flip(false)}>
            <Ic n="back" />
            Back to the overview
          </button>
        </div>
        <main className="tp-main tp-main-page wb-host cb-host">
          <Legacy />
        </main>
      </>
    );

  if (!view)
    return (
      <main className="tp-main tp-main-page u3 u3p">
        {s.radar.failed ? (
          <div className="u3-wrap empty">
            <b>Crystal Ball didn&apos;t load.</b>
            <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={s.radar.reload}>
              Try again
            </button>
          </div>
        ) : (
          <Wait line="Reading your Crystal Ball" />
        )}
      </main>
    );

  const icpWords = [fn && fn !== "Other" ? fn : null, "your ideal client"].filter(Boolean).join(" · ");
  const ranges = (view.ranges ?? []).filter((r) => RADAR_RANGES.some((x) => x.range === r.range));

  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <Band
          art="titleBall"
          eyebrow={
            <>
              <Ic n="sparkle" />
              Crystal Ball
            </>
          }
          title={
            <>
              See demand before it becomes a <em>job posting.</em>
            </>
          }
          lede="Emerging opportunities for your fractional practice."
          extra={
            <div className="cb-meta">
              <span className="m-bignum">{rows.length}</span>
              <span>{rows.length === 1 ? "company showing early signals" : "companies showing early signals"}</span>
              {newN > 0 && (
                <Chip kind="gold" dot>
                  {newN} new this week
                </Chip>
              )}
              <button type="button" className="m-chip soft" onClick={c.openProfile} title="Your function and ideal client decide what Crystal Ball watches. Change them in your profile.">
                <Ic n="sliders" />
                {icpWords}
              </button>
              {ranges.length > 1 && view.range && (
                <span className="m-seg cb-range" role="group" aria-label="Range">
                  {ranges.map((r) => (
                    <button key={r.range} type="button" aria-pressed={view.range === r.range} onClick={() => s.setRadarRange(r.range as RadarRange)}>
                      {RADAR_RANGES.find((x) => x.range === r.range)!.label.replace("Last ", "")}
                    </button>
                  ))}
                </span>
              )}
            </div>
          }
        />

        {!view.ready ? (
          <section className="m-panel">
            <div className="m-panel-b empty">
              <b>Tell Merlin your function.</b>
              <span className="m-sub">Crystal Ball watches for the signals that come before a fractional role like yours.</span>
              <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={c.openProfile}>
                Set your function
              </button>
            </div>
          </section>
        ) : (
          <>
            {rows.length > 0 && <River rows={rows} today={today} only={only} setOnly={setOnly} />}

            <div className="cb-tabs">
              <div className="m-tabs" role="tablist" aria-label="Kind of signal">
                <Tab on={kind === "all"} n={rows.length} onClick={() => setKind("all")}>
                  All
                </Tab>
                <Tab on={kind === "new"} n={newN} onClick={() => setKind("new")}>
                  New this week
                </Tab>
                {groups.map((g) => (
                  <Tab key={g.k} on={kind === g.k} n={g.n} onClick={() => setKind(g.k)}>
                    {GROUP_WORD[g.k]}
                  </Tab>
                ))}
              </div>
              <div className="m-toolbar">
                {only && (
                  <button type="button" className="m-chip am" onClick={() => setOnly(null)}>
                    {coName(rows.find((r) => r.row.id === only)!.i)} only <Ic n="x" />
                  </button>
                )}
                <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => flip(true)}>
                  <Ic n="sliders" />
                  Table and tuning
                </button>
              </div>
            </div>

            <div className="m-table opps">
              {list.length ? (
                list.map((r) => (
                  <OppRow
                    key={r.row.id}
                    r={r}
                    fn={fn}
                    today={today}
                    open={!!open[r.row.id]}
                    onWhy={() => setOpen((o) => ({ ...o, [r.row.id]: !o[r.row.id] }))}
                    onExplore={() => explore(r)}
                    onWatch={() => void acts.follow(r.row.id, !r.i.c.following)}
                  />
                ))
              ) : (
                <div className="empty">
                  <b>{rows.length ? "Nothing here this week." : "No early signals yet."}</b>
                  <span className="m-sub">{rows.length ? "Merlin shows it the week it appears." : "Merlin keeps watching your kind of client and shows them here as signals appear."}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Tab({ on, n, onClick, children }: { on: boolean; n: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="m-tab" role="tab" aria-selected={on} onClick={onClick}>
      {children} <span className="m-tc">{n}</span>
    </button>
  );
}

function OppRow({ r, fn, today, open, onWhy, onExplore, onWatch }: { r: CRow; fn: string | null; today: string; open: boolean; onWhy: () => void; onExplore: () => void; onWatch: () => void }) {
  const c = useApp();
  const { row, i } = r;
  const sigs: RadarSigView[] = row.sigs?.length ? row.sigs : row.lines.map((line, k) => ({ kind: row.kinds[k] ?? row.kinds[0], line }));
  const fit = fit7(i, c.me);
  const name = row.name ?? coName(i);
  const following = i.c.following;
  const first = sigs[0];
  const hiring = whenLong(row.h);
  return (
    <article className={`op${open ? " open" : ""}`}>
      <div className="op-main">
        <button type="button" className="m-co" onClick={onExplore}>
          <CoLogo i={i} s={48} />
          <div>
            <span className="m-name">
              <span>{name}</span>
            </span>
            <small>{coLine(i)}</small>
          </div>
        </button>
        <div className="op-opp">
          <b>{oppTitle(row, fn)}</b>
          <span>{row.lines[0]?.split(" · ")[0]}</span>
        </div>
        <div className="op-sig m-ph-hide">
          <Chip kind={r.fresh ? "gold" : "soft"} sm dot>
            {hiring ?? kindLabel(first.kind, fn)}
          </Chip>
          <small>{GROUP_WORD[r.group]}</small>
        </div>
        <FitRing fit={fit} />
        <div className="op-acts">
          <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={onExplore}>
            Explore
          </button>
          <button type="button" className="m-iconbtn sm" onClick={onWatch} aria-pressed={following} aria-label={following ? `Watching ${name}` : `Watch ${name}`} title={following ? "Watching. Merlin tells you when it moves." : "Watch: tell me when it moves"}>
            <Ic n={following ? "check" : "eye"} />
          </button>
          <button type="button" className="m-iconbtn sm plain wm" onClick={onWhy} aria-expanded={open} aria-label="Why it matters" title="Why it matters">
            <Ic n="down" />
          </button>
        </div>
      </div>
      {open && (
        <div className="op-why">
          <div>
            <p className="m-eyebrow">What Merlin sees</p>
            <ul className="sigs">
              {sigs.map((g, k) => {
                const at = g.at;
                const fresh = !!at && dayMs(today) - dayMs(at) < 7 * DAY;
                return (
                  <li key={k} className={fresh ? "new" : ""}>
                    <i />
                    <span>
                      <b>{g.line.split(" · ")[0]}</b>
                      {g.line.includes(" · ") && <small className="sig-more">{g.line.split(" · ").slice(1).join(" · ")}</small>}
                      <small>{[kindLabel(g.kind, fn), at ? dateWords(at, today) : null].filter(Boolean).join(" · ")}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <p className="m-eyebrow">Why it matters</p>
            <p className="op-wt">{sigs.map((g) => g.whyNow).find(Boolean) ?? row.notes?.[0] ?? "Signals like these usually come before a fractional role is posted."}</p>
            <details>
              <summary>
                <Ic n="right" />
                How Merlin found this
              </summary>
              <p className="m-small">{sourcesLine(sigs)} Merlin never guesses when they hire, and shows no odds.</p>
            </details>
          </div>
          <figure className="spark fitfig">
            <figcaption>
              <span className="m-small">How it fits</span>
              <b>{fit.n} of 7 traits</b>
            </figcaption>
            <Traits n={fit.n} />
            <ul className="fitlist">
              {fit.traits.map((t) => (
                <li key={t.key} className={t.on ? "on" : ""}>
                  <Ic n={t.on ? "check" : "x"} />
                  {t.label}
                </li>
              ))}
            </ul>
          </figure>
        </div>
      )}
    </article>
  );
}

/* ---------- Demand over six months ---------- */

const LANES = 8;
function River({ rows, today, only, setOnly }: { rows: CRow[]; today: string; only: string | null; setOnly: (id: string | null) => void }) {
  const c = useApp();
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; t: string; s: string } | null>(null);
  const lanes = rows.slice(0, LANES);
  // Drawn at the width it has, so its words stay their size on a phone.
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => setW(Math.max(300, Math.round(el.clientWidth) || 1000));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = W < 620;
  const LH = phone ? 44 : 50;
  const top = 28;
  const H = top + lanes.length * LH + 6;
  const lx = phone ? 46 : 270;
  const rx = W - 20;
  const span = 182 * DAY;
  const now = dayMs(today);
  const x = (at: string) => lx + ((dayMs(at) - (now - span)) / span) * (rx - lx);
  const months: { m: string; x: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - k);
    const iso = d.toISOString().slice(0, 10);
    const xx = x(iso);
    if (xx > lx + 20 && xx < rx - (phone ? 30 : 40)) months.push({ m: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), x: xx });
  }
  const show = (e: React.MouseEvent | React.FocusEvent, t: string, s: string) => {
    const b = box.current!.getBoundingClientRect();
    const r = (e.target as Element).getBoundingClientRect();
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, t, s });
  };
  return (
    <section className="m-panel river" aria-labelledby="rv-h">
      <div className="m-panel-h">
        <div>
          <p className="m-eyebrow">Demand over six months</p>
          <h2 className="m-h3" id="rv-h" style={{ marginTop: 8 }}>
            Signals pile up before a role is posted.
          </h2>
        </div>
        <ul className="rv-leg">
          <li>
            <i className="new" />
            New this week
          </li>
          <li>
            <i className="old" />
            Earlier signal
          </li>
          <li className="m-ph-hide">
            <span className="m-small">Hover a signal for detail. Click a company to filter.</span>
          </li>
        </ul>
      </div>
      <div className="rv" ref={box} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signals for each company over six months">
          {months.map((m) => (
            <text key={m.m} className="rv-m" x={m.x.toFixed(1)} y="14" textAnchor="middle">
              {m.m}
            </text>
          ))}
          <rect x={(rx - 28).toFixed(1)} y="22" width="40" height={H - 24} rx="12" className="rv-band" />
          <text className="rv-m now" x={rx} y="14" textAnchor="end">
            Now
          </text>
          {lanes.map((r, li) => {
            const y = top + li * LH + LH / 2;
            const sigs = (r.row.sigs ?? []).filter((g) => g.at && now - dayMs(g.at) <= span);
            const name = r.row.name ?? coName(r.i);
            const hot = sigs.some((g) => now - dayMs(g.at!) < 7 * DAY);
            return (
              <g
                key={r.row.id}
                className={`rv-lane${hot ? " hot" : ""}${only && only !== r.row.id ? " dim" : ""}${only === r.row.id ? " sel" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={only === r.row.id ? `Show every company` : `Show only ${name}`}
                onClick={() => setOnly(only === r.row.id ? null : r.row.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOnly(only === r.row.id ? null : r.row.id))}
              >
                <rect x="0" y={y - LH / 2 + 2} width={W} height={LH - 4} rx="12" className="rv-hit" />
                <line x1={lx} x2={rx} y1={y} y2={y} className="rv-base" />
                {sigs.map((g, k) => {
                  const fresh = now - dayMs(g.at!) < 7 * DAY;
                  const cx = Math.min(rx - 8, x(g.at!));
                  const words = `${dateWords(g.at, today)} · ${kindLabel(g.kind, null)}`;
                  return (
                    <g key={k}>
                      {fresh && <circle cx={cx.toFixed(1)} cy={y} r="17" className="rv-glow" />}
                      <circle
                        cx={cx.toFixed(1)}
                        cy={y}
                        r={fresh ? 9 : 6.5}
                        className={`rv-dot ${fresh ? "new" : "old"}`}
                        onMouseEnter={(e) => show(e, g.line, words)}
                        onMouseLeave={() => setTip(null)}
                      >
                        <title>{`${g.line}. ${words}`}</title>
                      </circle>
                    </g>
                  );
                })}
                <rect x={phone ? 6 : 2} y={y - 14} width="28" height="28" rx="7" fill={r.i.c.hidden ? "var(--m-line-2)" : "var(--m-am-soft)"} />
                <text x={phone ? 20 : 16} y={y + 5} textAnchor="middle" className="rv-ini">
                  {r.i.c.hidden ? "" : name.slice(0, 1)}
                </text>
                {!phone && (
                  <>
                    <text className="rv-t" x="42" y={y - 1}>
                      {name.length > 28 ? `${name.slice(0, 27)}…` : name}
                    </text>
                    <text className="rv-s" x="42" y={y + 15}>
                      {GROUP_WORD[r.group]}
                      {hot ? " · new" : ""}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {tip && (
          <div className="m-tip" style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}>
            <b>{tip.t}</b>
            <small>{tip.s}</small>
          </div>
        )}
      </div>
      {rows.length > LANES && <p className="m-small rv-more">The first {LANES} of {rows.length}, by how likely. Every company is in the list below.</p>}
    </section>
  );
}
