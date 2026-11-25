"use client";

/**
 * Lookalikes in the new design ("Repeat your success", find-design/v5): pick one of your past
 * clients (the companies of your own seats), see its profile (the traits on file: industry, revenue,
 * size, region, the functions it hired, repeat hiring; turn one off to widen the list), the top match
 * compared trait by trait with its demand, way in and why it fits, and more companies like it with
 * how many traits they share. Every match is Find's own lookalike logic (find/lookalikes.ts): never
 * a past client and never one already in the pipeline. Counts are traits shared of the traits on
 * file, never a percentage.
 */
import { useMemo, useState } from "react";
import type { RadarRow } from "@/lib/radar/types";
import { useApp } from "../shell/pages";
import { useToast } from "../../ui/shared";
import { LIKE_TRAITS, applyFilters, likeParts, regionOf, repeatHirer, rowsFor, shown, type CoInfo, type LikeTrait } from "../model";
import { defaultSeeds, likeFilters, profileOf, rankLike, withoutTrait, type LikeRow } from "../find/lookalikes";
import { kindLabel } from "../crystal/crystalModel";
import { tuneGroupOf } from "@/lib/radar/tune";
import { useUi3Head } from "./head";
import { isWarm, setWarmFocus, useCoActs, useTargets } from "./data";
import { Art } from "./illustrations";
import { Ic, type IconName } from "./icons";
import { Band, Chip, CoLogo, FitRing, RowMenu, Traits, Wait } from "./parts";
import { coLine, coName, plural } from "./model";
import { oppTitle } from "./Home";

const TRAIT: Record<LikeTrait, { l: string; ic: IconName }> = {
  industry: { l: "Industry", ic: "building" },
  revenue: { l: "Revenue", ic: "pipe" },
  employees: { l: "Size", ic: "network" },
  region: { l: "Region", ic: "pin" },
  fns: { l: "Fractional hiring", ic: "user" },
  repeat: { l: "Repeat hirer", ic: "loop" },
};
const valOf = (i: CoInfo, k: LikeTrait): string =>
  (k === "industry" ? shown(i.c.cells.industry) : k === "employees" ? shown(i.c.cells.employees) : k === "revenue" ? shown(i.c.cells.revenue) : k === "region" ? regionOf(i.c) : k === "fns" ? (i.fnState.hired.length ? `Hired ${i.fnState.hired.join(", ")}` : null) : repeatHirer(i) ? "Yes" : "Not yet") ??
  "Not on file";
const bandOf = (same: number, of: number) => (same >= of && of > 0 ? "Same on every trait" : same >= Math.max(2, of - 1) ? "Strong match" : same >= Math.ceil(of / 2) ? "Good match" : "Some overlap");

export function Ui3Lookalikes({ onBack }: { onBack: () => void }) {
  const c = useApp();
  const me = c.me;
  useUi3Head([{ label: "Find" }, { label: "Target Companies", href: "#", go: onBack }], "Lookalikes");
  const toast = useToast();
  const acts = useCoActs();
  const t = useTargets();
  const seeds = useMemo(() => defaultSeeds(c.infos, me).map((id) => c.byId.get(id)).filter((i): i is CoInfo => !!i && !i.c.hidden), [c.infos, c.byId, me]);
  const [seedId, setSeedId] = useState<string | null>(null);
  const seed = seeds.find((s) => s.c.id === seedId) ?? seeds[0] ?? null;
  const [off, setOff] = useState<Set<LikeTrait>>(new Set());
  const [profOpen, setProfOpen] = useState(true);
  const [feat, setFeat] = useState<string | null>(null);
  const [cmp, setCmp] = useState<"compare" | "opp">("compare");
  const [lq, setLq] = useState<"hire" | "warm" | "most" | null>(null);

  const tokens0 = useMemo(() => (seed ? profileOf([seed]) : []), [seed]);
  const traits0 = useMemo(() => likeParts(tokens0).traits, [tokens0]);
  const tokens = useMemo(() => [...off].reduce((acc, k) => withoutTrait(acc, k), tokens0), [tokens0, off]);
  const of = likeParts(tokens).traits.length;
  const ranked: LikeRow[] = useMemo(() => {
    if (!seed || !of) return [];
    const rows = applyFilters(rowsFor("companies", c.infos), likeFilters(tokens), "all", "", me, true).rows;
    const hidden = new Set(me.ui3Hidden ?? []);
    return rankLike(rows, tokens, [seed]).filter((r) => !hidden.has(r.row.i.c.id));
  }, [seed, of, tokens, c.infos, me]);
  const byT = useMemo(() => new Map(t.rows.map((r) => [r.i.c.id, r])), [t.rows]);
  const radarOf = useMemo(() => {
    const m = new Map<string, RadarRow>();
    for (const r of [...(c.legacy.homeProps.data?.rows ?? []), ...(c.shell.radar.data?.rows ?? [])]) m.set(r.id, r);
    return m;
  }, [c.legacy.homeProps.data, c.shell.radar.data]);

  const top = ranked.find((r) => r.row.i.c.id === feat) ?? ranked[0] ?? null;
  const others = ranked.filter((r) => r !== top);
  const LQ = [
    { k: "hire" as const, l: "Hiring now", ic: "brief" as IconName, f: (r: LikeRow) => !!byT.get(r.row.i.c.id)?.role },
    { k: "warm" as const, l: "Warm intros", ic: "route" as IconName, f: (r: LikeRow) => isWarm(byT.get(r.row.i.c.id)?.warm) },
    { k: "most" as const, l: `${Math.max(1, of - 1)}+ traits`, ic: "diamond" as IconName, f: (r: LikeRow) => r.shared.length >= Math.max(1, of - 1) },
  ];
  const lqf = LQ.find((x) => x.k === lq);
  const shownOthers = lqf ? others.filter(lqf.f) : others;
  const fn = me.function && me.function !== "Other" ? me.function : null;
  const seat = seed ? seed.engs.find((e) => e.yours) : null;
  const seatLine = seat ? [shown(seat.cells.role) ?? (shown(seat.cells.function) ? `Fractional ${shown(seat.cells.function)}` : "Your seat"), [shown(seat.cells.start)?.slice(0, 4), ((e) => (e && /^\d{4}/.test(e) ? e.slice(0, 4) : e || shown(seat.cells.status) === "Active" ? "now" : null))(shown(seat.cells.end))].filter(Boolean).join(" to ")].filter(Boolean).join(", ") : null;

  const addPipe = async (id: string) => {
    const res = await acts.addPipe(id);
    toast(res.message || (res.ok ? "Added to your pipeline, under To reach out." : "That didn't go through. Try again."), !res.ok);
  };

  if (c.waiting && !c.infos.length) return <Wait />;

  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <Band
          art="titleWalk"
          eyebrow={
            <>
              <Ic n="layers" />
              Lookalikes
            </>
          }
          title={
            seed ? (
              <>
                Find your next <em>{seed.c.name}.</em>
              </>
            ) : (
              "Repeat your success."
            )
          }
          lede="Discover companies like the clients you've already helped: similar profile, similar needs, and a way in."
        />

        <div className="lk-past">
          <span className="m-sub">Your past clients</span>
          {seeds.map((s) => (
            <button key={s.c.id} type="button" className="lk-pp" aria-pressed={seed?.c.id === s.c.id} onClick={() => (setSeedId(s.c.id), setFeat(null), setOff(new Set()))}>
              <CoLogo i={s} s={28} />
              {s.c.name}
            </button>
          ))}
          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => c.openSeats()}>
            <Ic n="plus" />
            Add client
          </button>
        </div>

        {!seed ? (
          <section className="m-panel">
            <div className="empty">
              <b>Add a seat you held to start.</b>
              <span className="m-sub">Merlin finds companies like your past clients: same industry, size, revenue, region and the functions they hire.</span>
              <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={() => c.openSeats()}>
                Add your seats
              </button>
            </div>
          </section>
        ) : (
          <div className="lk-grid">
            <div className="lk-left">
              <section className="m-panel deep fc">
                <p className="m-eyebrow" style={{ color: "#e6d8ff" }}>
                  <Ic n="flag" />
                  Former client
                </p>
                <div className="fc-top">
                  <CoLogo i={seed} s={52} />
                  <div>
                    <h2 className="m-h2" style={{ color: "#fff" }}>
                      {seed.c.name}
                    </h2>
                    <p className="m-small">{coLine(seed)}</p>
                  </div>
                </div>
                {seatLine && (
                  <p className="fc-case">
                    <Ic n="check2" />
                    <span>
                      <b>Your seat</b>
                      <small>{seatLine}</small>
                    </span>
                  </p>
                )}
                <Art name="harbor" className="fc-art" />
              </section>
              <section className="m-panel prof">
                <button type="button" className="prof-h" aria-expanded={profOpen} onClick={() => setProfOpen((x) => !x)}>
                  <h3 className="m-h3">The {seed.c.name} profile</h3>
                  <Ic n="down" />
                </button>
                {profOpen && (
                  <>
                    <ul className="prof-l">
                      {LIKE_TRAITS.filter((k) => traits0.includes(k)).map((k) => (
                        <li key={k}>
                          <button
                            type="button"
                            aria-pressed={!off.has(k)}
                            title={off.has(k) ? "Turn back on" : "Turn off to widen the list"}
                            onClick={() => (setOff((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; }), setFeat(null))}
                          >
                            <Ic n={TRAIT[k].ic} />
                            <span>{TRAIT[k].l}</span>
                            <b>{valOf(seed, k)}</b>
                            <i>
                              <Ic n="check" />
                            </i>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="m-small prof-n">{traits0.length ? "Turn a trait off to widen the list." : "Nothing on file at this company to match yet. Add its industry, size or revenue on its record."}</p>
                  </>
                )}
              </section>
            </div>

            <div className="lk-right">
              {!top ? (
                <section className="m-panel">
                  <div className="empty">
                    <b>No close matches.</b>
                    <span className="m-sub">{off.size ? "Turn a trait back on, or another off, in the profile." : "Turn a trait off in the profile to widen the list."}</span>
                  </div>
                </section>
              ) : (
                <TopMatch
                  r={top}
                  seed={seed}
                  of={of}
                  off={off}
                  cmp={cmp}
                  setCmp={setCmp}
                  radar={radarOf.get(top.row.i.c.id) ?? null}
                  fn={fn}
                  t={byT.get(top.row.i.c.id) ?? null}
                />
              )}
              {others.length > 0 && (
                <section className="m-panel others">
                  <div className="m-panel-h">
                    <h3 className="m-h3">More companies like {seed.c.name}</h3>
                    <span className="m-small">{plural(others.length, "company", "companies")}</span>
                  </div>
                  <div className="m-panel-b" style={{ paddingBottom: 4 }}>
                    <div className="m-fchips" role="group" aria-label="Quick filters">
                      {LQ.map((x) => {
                        const n = others.filter(x.f).length;
                        return (
                          <button key={x.k} type="button" className="m-fchip" aria-pressed={lq === x.k} disabled={!n && lq !== x.k} onClick={() => setLq(lq === x.k ? null : x.k)}>
                            <Ic n={x.ic} />
                            {x.l} ({n})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <ul>
                    {shownOthers.slice(0, 30).map((r) => {
                      const i = r.row.i;
                      const tr = byT.get(i.c.id);
                      const warm = isWarm(tr?.warm);
                      return (
                        <li key={i.c.id} className="ot-li">
                          <button type="button" className="ot-row" onClick={() => (setFeat(i.c.id), window.scrollTo?.({ top: 0 }), document.getElementById("tp-page")?.scrollTo({ top: 0, behavior: "smooth" }))}>
                            <CoLogo i={i} s={40} />
                            <span className="ot-n">
                              <b>{coName(i)}</b>
                              <small>{coLine(i)}</small>
                            </span>
                            <span className="ot-t">
                              <Traits n={r.shared.length} of={of} />
                              <small>
                                {r.shared.length} of {of} traits match
                              </small>
                            </span>
                            <span className="m-chips m-ph-hide">
                              {tr?.role ? (
                                <Chip kind="gold" sm icon="brief">
                                  Hiring now
                                </Chip>
                              ) : warm ? (
                                <Chip kind="cobalt" sm icon="network">
                                  Warm intro
                                </Chip>
                              ) : radarOf.get(i.c.id) ? (
                                <Chip kind="am" sm icon="trend">
                                  Emerging demand
                                </Chip>
                              ) : (
                                <Chip kind="soft" sm icon="target">
                                  No signal yet
                                </Chip>
                              )}
                            </span>
                          </button>
                          <div className="m-rowact">
                            {tr?.inPipe ? (
                              <span className="m-btn m-btn-done">
                                <Ic n="check" />
                                In pipeline
                              </span>
                            ) : (
                              <button type="button" className="m-btn m-btn-primary" disabled={acts.busy === i.c.id} onClick={() => void addPipe(i.c.id)}>
                                Add to pipeline
                              </button>
                            )}
                            <RowMenu
                              label={`More for ${coName(i)}`}
                              title={coName(i)}
                              items={[
                                { icon: "layers", label: "View match details", sub: "Compare it trait by trait", onClick: () => setFeat(i.c.id) },
                                { icon: "building", label: "Explore company", sub: "Fit, need, who you know, how you get in", onClick: () => c.openCompany(i.c.id) },
                                { icon: "bookmark", label: tr?.saved ? "Saved" : "Save", sub: tr?.saved ? "Take it out of Saved" : "Keep it in Saved", onClick: () => void acts.save(i.c.id, !tr?.saved) },
                                { icon: "eye", label: i.c.following ? "Watching" : "Watch", sub: "Tell me when it moves", onClick: () => void acts.follow(i.c.id, !i.c.following) },
                              ]}
                            />
                          </div>
                        </li>
                      );
                    })}
                    {!shownOthers.length && (
                      <li className="ot-li">
                        <span className="m-sub" style={{ padding: 12 }}>
                          Nothing else with that filter.
                        </span>
                      </li>
                    )}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function TopMatch({ r, seed, of, off, cmp, setCmp, radar, fn, t }: { r: LikeRow; seed: CoInfo; of: number; off: Set<LikeTrait>; cmp: "compare" | "opp"; setCmp: (x: "compare" | "opp") => void; radar: RadarRow | null; fn: string | null; t: ReturnType<typeof useTargets>["rows"][number] | null }) {
  const c = useApp();
  const i = r.row.i;
  const same = r.shared.length;
  const warm = isWarm(t?.warm) ? t!.warm : null;
  const role = t?.role ?? null;
  const grow = radar?.sigs?.find((g) => tuneGroupOf(g.kind) === "grow");
  const band = bandOf(same, of);
  const facts: { ic: IconName; b: string; s: string }[] = [
    { ic: "brief", b: role ? "Hiring now" : "Demand", s: role ? role.title : radar ? oppTitle(radar, fn) : "No signal on file" },
    { ic: "team", b: "Warm intro", s: warm ? warm.via ?? "A way in" : t?.ways?.n ? plural(t.ways.n, "way") + " in" : "No path yet" },
    { ic: "trend", b: "Growth signal", s: grow ? grow.line.split(" · ")[0] : "None on file" },
    { ic: "layers", b: "Why it's a fit", s: r.why || "Shares the profile" },
  ];
  const move = `${coName(i)} ${same >= of ? "matches" : "closely matches"} ${seed.c.name}${role ? ", is hiring" : radar ? ", shows an early signal" : ""}${warm ? ", and you have a warm way in." : ". Start with a note to who decides."}`;
  return (
    <section className="m-panel tm">
      <div className="tm-h">
        <Chip kind="am" sm icon="sparkle">
          Top match
        </Chip>
        <Chip kind={same >= of - 1 ? "gold" : "soft"} sm dot>
          {band}
        </Chip>
      </div>
      <div className="tm-top">
        <button type="button" className="m-co" onClick={() => c.openCompany(i.c.id)}>
          <CoLogo i={i} s={56} />
          <div>
            <span className="m-name tm-name">
              <span>{coName(i)}</span>
            </span>
            <small>{coLine(i)}</small>
          </div>
        </button>
        <div className="tm-fit">
          <FitRing lg am fit={{ n: same, of, band, traits: LIKE_TRAITS.filter((k) => !off.has(k) && likeParts(profileOf([seed])).traits.includes(k)).map((k) => ({ label: TRAIT[k].l, on: r.shared.includes(k), value: valOf(i, k) })) }} />
          <div>
            <b className="m-h3">
              {same} of {of} traits match
            </b>
            <span className="m-sub">
              {same >= of ? "Highly similar to " : "Similar to "}
              {seed.c.name}
            </span>
          </div>
        </div>
      </div>
      <ul className="tm-facts">
        {facts.map((f) => (
          <li key={f.b}>
            <Ic n={f.ic} />
            <span>
              <b>{f.b}</b>
              <small>{f.s}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="tm-body">
        <div className="tm-cmp">
          <div className="m-tabs" role="tablist">
            <button type="button" className="m-tab" role="tab" aria-selected={cmp === "compare"} onClick={() => setCmp("compare")}>
              How they compare
            </button>
            <button type="button" className="m-tab" role="tab" aria-selected={cmp === "opp"} onClick={() => setCmp("opp")}>
              Opportunity details
            </button>
          </div>
          {cmp === "compare" ? (
            <table className="m-compare">
              <thead>
                <tr>
                  <th>Trait</th>
                  <th>
                    <span className="th-co">
                      <CoLogo i={seed} s={22} />
                      <span>
                        <b>{seed.c.name}</b>
                        <small>Your former client</small>
                      </span>
                    </span>
                  </th>
                  <th>
                    <span className="th-co">
                      <CoLogo i={i} s={22} />
                      <span>
                        <b>{coName(i)}</b>
                        <small>Lookalike</small>
                      </span>
                    </span>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {LIKE_TRAITS.filter((k) => likeParts(profileOf([seed])).traits.includes(k)).map((k) => {
                  const hit = r.shared.includes(k);
                  return (
                    <tr key={k} className={off.has(k) ? "off" : ""}>
                      <td>
                        <Ic n={TRAIT[k].ic} />
                        {TRAIT[k].l}
                      </td>
                      <td>{valOf(seed, k)}</td>
                      <td>{valOf(i, k)}</td>
                      <td>
                        <span className={`m-check${hit ? "" : " no"}`}>
                          <Ic n={hit ? "check" : "x"} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <ul className="sigs">
              {role && (
                <li className={role.fresh ? "new" : ""}>
                  <i />
                  <span>
                    <b>{role.title}</b>
                    <small>{[role.ago ? `Posted ${role.ago.toLowerCase()}` : null, role.rate].filter(Boolean).join(" · ")}</small>
                  </span>
                </li>
              )}
              {(radar?.sigs ?? []).map((g, k) => (
                <li key={k}>
                  <i />
                  <span>
                    <b>{g.line.split(" · ")[0]}</b>
                    <small>{kindLabel(g.kind, fn)}</small>
                  </span>
                </li>
              ))}
              {!role && !radar?.sigs?.length && (
                <li className="quiet">
                  <i />
                  <span>
                    <b>No signals on file yet</b>
                    <small>Watch it and Merlin tells you when it moves.</small>
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
        <aside className="m-panel am move">
          <p className="m-eyebrow">
            <Ic n="sparkle" />
            Your move
          </p>
          <p className="mv-t">{move}</p>
          <button type="button" className="m-btn m-btn-primary" onClick={() => (warm ? (setWarmFocus(i.c.id, true), c.openPage("warm")) : c.openCompany(i.c.id))}>
            <Ic n="send" />
            {warm ? "Request an intro" : "Explore opportunity"}
            <Ic n="arrow" />
          </button>
        </aside>
      </div>
    </section>
  );
}
