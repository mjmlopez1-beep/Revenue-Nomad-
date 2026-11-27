"use client";

/**
 * Target Companies in the new design (find-design/v5, ref-target-companies-v2): three questions
 * (who's hiring for my expertise, who fits my ideal client, find clients like my past clients),
 * Opportunities, All Companies and Saved with their counts, quick filters with counts, and one row a
 * company: name and "Industry · City", the fit ring (criteria of the ideal client matched, of the ones on file), the hiring
 * signal (an open role, its age, the rate only when posted; else Crystal Ball's signal or the past
 * hires), the warm introduction (who the best way in goes through), the functions it hired
 * fractionals for, Add to pipeline, and "..." with Save, Watch, Find my warmest introduction, Hide.
 *
 * The full Companies table (every column, filter, sort and saved view) is today's workbench, one
 * click away ("Full table"). The top bar's search narrows these lists too.
 */
import { useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useApp } from "../shell/pages";
import { useUi } from "../ui";
import { freeCompanyNow } from "../display";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { useToast } from "../../ui/shared";
import { ui3Action } from "@/lib/ui3";
import { useUi3Head } from "./head";
import { isWarm, setWarmFocus, useCoActs, useTargets, type TRow } from "./data";
import { Art } from "./illustrations";
import { Ic, type IconName } from "./icons";
import { Av, Band, Chip, CoLogo, FitRing, RowMenu, Wait, ownClick } from "./parts";
import { FIT_TIP, coLine, coName, isGoodFit, isStrong, numWord, plural, predicted } from "./model";
import { oppTitle } from "./Home";

const Workbench = dynamic(() => import("../shell/workbenchPage").then((m) => m.WorkbenchPage), { ssr: false, loading: () => <Wait /> });
const Lookalikes = dynamic(() => import("./Lookalikes").then((m) => m.Ui3Lookalikes), { ssr: false, loading: () => <Wait /> });

type TabK = "opps" | "all" | "saved";
type Tile = "all" | "hiring" | "ideal";
type QF = "fit" | "hiring" | "warm" | "new";
const QFS: { k: QF; l: string; ic: IconName; f: (r: TRow) => boolean }[] = [
  { k: "fit", l: "High fit", ic: "diamond", f: (r) => isStrong(r.fit) },
  { k: "hiring", l: "Hiring now", ic: "brief", f: (r) => r.hire },
  { k: "warm", l: "Warm ways in", ic: "route", f: (r) => isWarm(r.warm) },
  { k: "new", l: "New this week", ic: "calnew", f: (r) => r.hire && !!r.role?.fresh },
];
const PAGE = 40;
let mode: "list" | "table" | "lookalikes" = "list";
let lastTab: TabK = "opps";

export function Ui3Targets() {
  const c = useApp();
  const [view, setViewRaw] = useState(mode);
  const setView = (v: typeof mode) => ((mode = v), setViewRaw(v));
  if (view === "lookalikes") return <Lookalikes onBack={() => setView("list")} />;
  if (view === "table")
    return (
      <>
        <TableHead onBack={() => setView("list")} />
        <Workbench />
      </>
    );
  return <List onTable={() => setView("table")} onLike={() => setView("lookalikes")} c={c} />;
}

function TableHead({ onBack }: { onBack: () => void }) {
  useUi3Head([{ label: "Find" }, { label: "Target Companies", go: onBack, href: "#" }], "Full table");
  return (
    <div className="u3 u3-backbar">
      <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={onBack}>
        <Ic n="back" />
        Back to Target Companies
      </button>
    </div>
  );
}

function List({ c, onTable, onLike }: { c: ReturnType<typeof useApp>; onTable: () => void; onLike: () => void }) {
  useUi3Head([{ label: "Find" }], "Target Companies");
  const t = useTargets();
  const acts = useCoActs();
  const toast = useToast();
  const [tab, setTabRaw] = useState<TabK>(lastTab);
  const setTab = (k: TabK) => ((lastTab = k), setTabRaw(k), setLimit(PAGE));
  const [tile, setTile] = useState<Tile>("all");
  const [qf, setQf] = useState<QF | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const q = c.table.query.trim().toLowerCase();
  const fn = c.me.function && c.me.function !== "Other" ? c.me.function : null;

  // Crystal Ball's rows, for a company's signal when it isn't hiring.
  const radar = useMemo(() => {
    const m = new Map<string, import("@/lib/radar/types").RadarRow>();
    for (const r of c.legacy.homeProps.data?.rows ?? []) m.set(r.id, r);
    for (const r of c.shell.radar.data?.rows ?? []) m.set(r.id, r);
    return m;
  }, [c.legacy.homeProps.data, c.shell.radar.data]);

  const hiringMine = t.all.filter((r) => r.hire);
  const ideal = t.all.filter((r) => isGoodFit(r.fit));
  const base = useMemo(() => {
    let xs = tab === "opps" ? t.opps : tab === "saved" ? t.saved : t.all;
    if (tile === "hiring") xs = xs.filter((r) => r.hire);
    if (tile === "ideal") xs = xs.filter((r) => isGoodFit(r.fit));
    if (q) xs = xs.filter((r) => r.i.hay.toLowerCase().includes(q));
    return xs;
  }, [tab, tile, q, t.opps, t.saved, t.all]);
  const chip = QFS.find((x) => x.k === qf);
  const rows = chip ? base.filter(chip.f) : base;
  const n = rows.length;

  const head =
    tab === "saved"
      ? n
        ? `${numWord(n)} saved ${n === 1 ? "company" : "companies"}${chip ? `, ${chip.l.toLowerCase()}` : ""}.`
        : "Nothing saved here yet."
      : tab === "all"
        ? `${plural(n, "company", "companies")} you could talk to${chip ? `, ${chip.l.toLowerCase()}` : ""}.`
        : n
          ? `${n === 1 ? "One company is" : `${numWord(n)} companies are`} hiring for your expertise or ${n === 1 ? "fits" : "fit"} well with a way in.`
          : "No opportunities yet.";

  const addPipe = async (r: TRow) => {
    const res = await acts.addPipe(r.i.c.id);
    toast(res.message || (res.ok ? "Added to your pipeline, under To reach out." : "That didn't go through. Try again."), !res.ok);
  };
  const hide = async (r: TRow) => {
    const res = await c.act(ui3Action({ ui3Hide: { id: r.i.c.id, on: true } }), { quiet: true });
    if (!res.ok) return;
    toast("Hidden from these lists.", false, { action: { label: "Undo", onClick: () => void c.act(ui3Action({ ui3Hide: { id: r.i.c.id, on: false } }), { quiet: true }) } });
  };

  const cols = "minmax(240px,1.4fr) 84px minmax(220px,1.5fr) minmax(170px,1fr) minmax(110px,.7fr) auto";

  return (
    <main className="tp-main tp-main-page u3 u3p" id="tp-page">
      <div className="u3-wrap">
        <Band art="titleSpy" title="Target Companies" lede="Find and prioritize the right companies for your next engagement." />

        <h2 className="sr-only">Start from a question</h2>
        <div className="m-qcards">
          <button type="button" className="m-qcard am" aria-pressed={tile === "hiring"} onClick={() => (setTile(tile === "hiring" ? "all" : "hiring"), setTab("all"))}>
            <Ic n="brief" className="m-qi" />
            <h3 className="m-h3">Who&apos;s hiring for my expertise?</h3>
            <p>{hiringMine.length ? `${plural(hiringMine.length, "company", "companies")} with an open ${fn ? `${fn} ` : ""}role now.` : "Companies with an open role in your function."}</p>
            <Art name="doorway" className="m-qart" />
            <span className="m-iconbtn m-go" aria-hidden="true">
              <Ic n="arrow" />
            </span>
          </button>
          <button type="button" className="m-qcard co" aria-pressed={tile === "ideal"} onClick={() => (setTile(tile === "ideal" ? "all" : "ideal"), setTab("all"))}>
            <Ic n="star" className="m-qi" />
            <h3 className="m-h3">Who fits my ideal client?</h3>
            <p>{ideal.length ? `${plural(ideal.length, "company", "companies")} match most of what is on file against your ideal client.` : "Companies that match most of your ideal client, from the facts on file."}</p>
            <Art name="summit" className="m-qart" />
            <span className="m-iconbtn m-go" aria-hidden="true">
              <Ic n="arrow" />
            </span>
          </button>
          <button type="button" className="m-qcard gold" onClick={onLike}>
            <Ic n="layers" className="m-qi" />
            <h3 className="m-h3">Find clients like my past clients.</h3>
            <p>Lookalikes of the companies you held seats at.</p>
            <Art name="arches" className="m-qart" />
            <span className="m-iconbtn m-go" aria-hidden="true">
              <Ic n="arrow" />
            </span>
          </button>
        </div>

        <div className="tg-bar">
          <div className="m-tabs" role="tablist" aria-label="Lists">
            {(
              [
                ["opps", "Opportunities", t.opps.length],
                ["all", "All Companies", t.all.length],
                ["saved", "Saved", t.saved.length],
              ] as const
            ).map(([k, l, cnt]) => (
              <button key={k} type="button" className="m-tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {l} <span className="m-tc">{cnt.toLocaleString("en-US")}</span>
              </button>
            ))}
          </div>
          <div className="m-toolbar m-ph-hide">
            {tile !== "all" && (
              <button type="button" className="m-chip am" onClick={() => setTile("all")}>
                {tile === "hiring" ? "Hiring for my expertise" : "Fits my ideal client"} <Ic n="x" />
              </button>
            )}
            {q && (
              <button type="button" className="m-chip cobalt" onClick={() => c.table.setQuery("")}>
                &ldquo;{c.table.query}&rdquo; <Ic n="x" />
              </button>
            )}
            <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={c.openProfile}>
              <Ic n="target" />
              My ideal client
            </button>
            <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={onTable} title="Every column, filter, sort and saved view">
              <Ic n="sliders" />
              Full table
            </button>
          </div>
        </div>

        <div className="m-fchips" role="group" aria-label="Quick filters">
          {QFS.map((x) => {
            const cnt = base.filter(x.f).length;
            return (
              <button key={x.k} type="button" className="m-fchip" aria-pressed={qf === x.k} disabled={!cnt && qf !== x.k} onClick={() => (setQf(qf === x.k ? null : x.k), setLimit(PAGE))}>
                <Ic n={x.ic} />
                {x.l} ({cnt})
              </button>
            );
          })}
        </div>

        <div className="ph-only tg-phtools">
          <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={c.openProfile}>
            <Ic n="target" />
            My ideal client
          </button>
          <button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={onTable}>
            <Ic n="sliders" />
            Full table
          </button>
        </div>
        <p className="m-eyebrow" style={{ marginTop: 22 }}>
          {tab === "opps" ? "Prioritized opportunities" : tab === "all" ? "All companies" : "Saved"} · {n.toLocaleString("en-US")}
        </p>
        <h2 className="m-h2 tg-h">{head}</h2>
        {tab === "opps" && !t.opps.length && (
          <p className="m-sub tg-why">Opportunities are companies hiring in your function, or a good fit for your practice with a way in. {c.me.icp ? "Widen your ideal client, or" : "Set your ideal client, or"} bring in who you know on Warm Paths.</p>
        )}

        {t.loading && !t.all.length ? (
          <Wait line="Loading every company" />
        ) : (
          <div className="m-table tg">
            <div className="m-thead" style={{ "--cols": cols } as CSSProperties}>
              <span>Company</span>
              <span title={FIT_TIP}>
                Fit
                <Ic n="info" />
              </span>
              <span title="The strongest sign this company needs your expertise now: an open role, else Crystal Ball's signal, else its past fractional hires.">
                Hiring signal
                <Ic n="info" />
              </span>
              <span>Your way in</span>
              <span className="tg-exp">Hired fractionals for</span>
              <span />
            </div>
            {rows.length ? (
              rows.slice(0, limit).map((r) => <TRowView key={r.i.c.id} r={r} cols={cols} radar={radar.get(r.i.c.id) ?? null} fn={fn} onPipe={() => void addPipe(r)} onHide={() => void hide(r)} busy={acts.busy === r.i.c.id} />)
            ) : (
              <div className="empty">
                <b>Nothing here yet.</b>
                <span className="m-sub">{tab === "saved" ? "Save companies from the other tabs with the … menu on a row." : "Try another quick filter or tab."}</span>
              </div>
            )}
          </div>
        )}
        {rows.length > limit && (
          <div className="tg-more">
            <button type="button" className="m-btn m-btn-secondary" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, rows.length - limit)} more
            </button>
            <span className="m-small">
              {limit} of {rows.length.toLocaleString("en-US")}
            </span>
          </div>
        )}
        {t.hiddenN > 0 && (
          <p className="m-small tg-hidden">
            {plural(t.hiddenN, "company", "companies")} hidden from these lists.{" "}
            <button type="button" className="u3-link" onClick={() => (c.me.ui3Hidden ?? []).forEach((id) => void c.act(ui3Action({ ui3Hide: { id, on: false } }), { quiet: true }))}>
              Show them again
            </button>
          </p>
        )}
      </div>
    </main>
  );
}

function TRowView({ r, cols, radar, fn, onPipe, onHide, busy }: { r: TRow; cols: string; radar: import("@/lib/radar/types").RadarRow | null; fn: string | null; onPipe: () => void; onHide: () => void; busy: boolean }) {
  const c = useApp();
  const ui = useUi();
  const acts = useCoActs();
  const i = r.i;
  const name = coName(i);
  const open = () => c.openCompany(i.c.id);
  // Hiring for the member's function (gold), else Crystal Ball's predicted signal, else an open role in another function, else past hires.
  const pred = radar ? predicted([radar])[0] ?? null : null;
  const sig: { ic: IconName; cls: string; b: string; s: string | null } = r.role && r.hire
    ? { ic: "brief", cls: "gold", b: r.role.title, s: [r.role.ago, r.role.rate].filter(Boolean).join(" · ") || null }
    : pred
      ? { ic: "trend", cls: "", b: oppTitle(pred, fn), s: pred.lines[0]?.split(" · ")[0] ?? null }
      : r.role
        ? { ic: "brief", cls: "", b: `Open role: ${r.role.title}`, s: [fn ? `Outside ${fn}` : null, r.role.ago].filter(Boolean).join(" · ") || null }
        : i.c.friendly.fractional
        ? { ic: "loop", cls: "forest", b: `Hired ${plural(i.c.friendly.fractional, "fractional")} before`, s: i.c.friendly.functions.slice(0, 2).join(", ") || null }
        : { ic: "eye", cls: "", b: "No signal yet", s: "Merlin is watching" };
  const warm = isWarm(r.warm) ? r.warm : null;
  const person = warm?.person;
  const fns = i.c.friendly.functions;
  return (
    <div className="m-tr" style={{ "--cols": cols } as CSSProperties}>
      <a
        className="m-co"
        href={`?c=${encodeURIComponent(i.c.id)}`}
        onClick={(e) => {
          if (!ownClick(e)) return;
          e.preventDefault();
          open();
        }}
      >
        <CoLogo i={i} s={42} />
        <div>
          <span className="m-name">
            {/* A locked company says so in its name and its lock: no second "Locked" chip to squeeze the name (F29). */}
            <span title={i.c.hidden ? "Locked. Open it to see its name, website and job postings." : undefined}>{name}</span>
          </span>
          <small>{coLine(i)}</small>
        </div>
      </a>
      <span className="m-ph-z">
        <FitRing fit={r.fit} />
      </span>
      <div className="m-opp">
        <Ic n={sig.ic} className={sig.cls} />
        <div>
          <b title={sig.b}>{sig.b}</b>
          {sig.s && <small>{sig.s}</small>}
        </div>
      </div>
      {warm ? (
        <button type="button" className="m-intro" onClick={() => (setWarmFocus(i.c.id), c.openPage("warm"))}>
          {person ? <Av name={person.name} s={36} /> : <Av name="" s={36} hid />}
          <span>
            <b>{person ? warm.direct ? <>Write to <em>{person.name.split(" ")[0]}</em> yourself</> : <>1 intro via <em>{person.name.split(" ")[0]}</em></> : warm.via}</b>
            <small>{person?.sub ?? warm.wayType ?? warm.way ?? "A way in"}</small>
          </span>
        </button>
      ) : r.ways?.n ? (
        <button type="button" className="m-intro" onClick={() => (setWarmFocus(i.c.id), c.openPage("warm"))}>
          <span className="m-av hid" style={{ "--s": "36px" } as CSSProperties} aria-hidden="true">
            <Ic n="route" />
          </span>
          <span>
            <b>{plural(r.ways.n, "way")} in</b>
            <small>{r.ways.first ? "Through people you know" : "Through people they know"}</small>
          </span>
        </button>
      ) : (
        <span className="m-intro">
          <span className="m-av hid" style={{ "--s": "36px" } as CSSProperties} aria-hidden="true">
            <Ic n="person" />
          </span>
          <span>
            <b>No path yet</b>
            <small>Start with a direct note</small>
          </span>
        </span>
      )}
      <div className="m-chips m-ph-hide tg-exp">
        {fns.length ? (
          <>
            <Chip sm>{fns[0]}</Chip>
            {fns.length > 1 && (
              <Chip sm kind="soft" title={fns.join(", ")}>
                +{fns.length - 1}
              </Chip>
            )}
          </>
        ) : (
          <span className="m-small">None on file</span>
        )}
      </div>
      <div className="m-rowact">
        {r.inPipe ? (
          <span className="m-btn m-btn-done">
            <Ic n="check" />
            In pipeline
          </span>
        ) : i.c.hidden ? (
          // A locked company opens first (F10): the record's own unlock, which quotes and asks before it spends.
          <button type="button" className="m-btn m-btn-secondary" title={freeCompanyNow(c.me) ? "Opens free today: its name, website and job postings." : `${COMPANY_PRICE} credits: its name, website and job postings. Merlin asks before it spends.`} aria-label={freeCompanyNow(c.me) ? `Open ${name} free` : `Open company, ${COMPANY_PRICE} credits`} onClick={() => void ui.unlock({ entity: "company", id: i.c.id, field: "identity" })}>
            {freeCompanyNow(c.me) ? "Open free" : "Open company"}
          </button>
        ) : (
          <button type="button" className="m-btn m-btn-primary" disabled={busy} aria-busy={busy} onClick={onPipe}>
            Add to pipeline
          </button>
        )}
        <RowMenu
          label={`More for ${name}`}
          title={name}
          items={[
            { icon: "bookmark", label: r.saved ? "Saved" : "Save", sub: r.saved ? "Take it out of Saved" : "Keep it in Saved", onClick: () => void acts.save(i.c.id, !r.saved) },
            { icon: "eye", label: i.c.following ? "Watching" : "Watch", sub: i.c.following ? "Stop watching it" : "Tell me when it moves", onClick: () => void acts.follow(i.c.id, !i.c.following) },
            { icon: "route", label: "Find my warmest introduction", sub: warm || r.ways?.n ? "See the path in" : "No path on file yet", disabled: !warm && !r.ways?.n, onClick: () => (setWarmFocus(i.c.id), c.openPage("warm")) },
            { icon: "hide", label: "Hide", sub: "Leave it out of these lists", onClick: onHide },
          ]}
        />
      </div>
    </div>
  );
}
