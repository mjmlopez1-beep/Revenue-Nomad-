"use client";

/**
 * Filter groups (sidebar on desktop, overlay on tablet, bottom sheet on phones). Every option
 * shows a count: a number in the text face, right-aligned, so a column of them lines up.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { Me } from "@/lib/tableTypes";
import { IconCheck, IconChevron, IconSearch, IconX } from "../ui/shared";
import {
  EMPTY_FILTERS, FIT_STEPS, LIST_OPTIONS, TOGGLE_LABEL, activeCount, clearedFilters, countryKey, namedFn, notMineLabel, placeWords, type Facets, type Filters, type ListKey, type ToggleKey,
} from "./model";
import { useOpenPage } from "./Tables";
import { FUNCTIONS, INDUSTRY_GROUPS } from "@/lib/tableFields";
import { HIRED_WINDOWS, windowWords } from "@/lib/hired";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tp-fgroup">
      <h3 className="tp-fgroup-h">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ k, f, setF, n, label }: { k: ToggleKey; f: Filters; setF: (f: Filters) => void; n: number; label?: string }) {
  const on = f[k];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={`tp-ftoggle${on ? " on" : ""}${!n && !on ? " zero" : ""}`}
      onClick={() => setF({ ...f, [k]: !on })}
    >
      <span className="tp-check" aria-hidden>
        {on && <IconCheck size={11} />}
      </span>
      <span className="tp-ftoggle-l">{label ?? TOGGLE_LABEL[k]}</span>
      <span className="tp-cnt num">{n}</span>
    </button>
  );
}

/**
 * A list filter. It only appears once some record in view has a value for it, and an option
 * with nothing behind it is left out unless it is selected (a filter that finds nothing isn't
 * worth a slot).
 */
function ListBlock({ k, title, f, setF, counts, label }: { k: ListKey; title: string; f: Filters; setF: (f: Filters) => void; counts: Record<string, number>; label?: (o: string) => string }) {
  if (!f[k].length && !Object.values(counts).some((n) => n > 0)) return null;
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">{title}</div>
      <ChipSet k={k} f={f} setF={setF} counts={counts} options={LIST_OPTIONS[k as keyof typeof LIST_OPTIONS]} label={label} />
    </div>
  );
}

function ChipSet({
  k,
  f,
  setF,
  counts,
  label = (o: string) => o,
  options,
  keepZero,
}: {
  k: ListKey;
  f: Filters;
  setF: (f: Filters) => void;
  counts: Record<string, number>;
  label?: (o: string) => string;
  options: string[];
  /** Show options with a count of 0 too (Open now and Closed are a pair). */
  keepZero?: boolean;
}) {
  const sel = f[k];
  return (
    <div className="tp-fchips">
      {options.map((o) => {
        const on = sel.includes(o);
        const n = counts[o] ?? 0;
        if (!n && !on && !keepZero) return null;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            className={`chip tp-fchip${on ? " chip-on" : ""}${!n && !on ? " zero" : ""}`}
            onClick={() => setF({ ...f, [k]: on ? sel.filter((x) => x !== o) : [...sel, o] })}
          >
            {label(o)} <span className="tp-cnt num">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function Industry({ f, setF, counts, hasIndustry }: { f: Filters; setF: (f: Filters) => void; counts: Record<string, number>; hasIndustry: boolean }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const opts = LIST_OPTIONS.industry
    .filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b));
  const withData = opts.filter((o) => (counts[o] ?? 0) > 0 || f.industry.includes(o));
  // Only industries with companies on file here (the standard list is long), most first.
  const list = all || q ? withData : withData.slice(0, 8);
  // "Software (all)" picks SaaS, Enterprise Software, SMB Software and Developer Tools in one tap (stored as the four).
  const groups = INDUSTRY_GROUPS.map((g) => ({ ...g, n: g.values.reduce((t, v) => t + (counts[v] ?? 0), 0), on: g.values.every((v) => f.industry.includes(v)) })).filter(
    (g) => (g.n > 0 || g.on) && (!q || g.label.toLowerCase().includes(q.toLowerCase()) || g.values.some((v) => v.toLowerCase().includes(q.toLowerCase()))),
  );
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">Industry</div>
      <label className="tp-fsearch">
        <IconSearch size={13} />
        <input className="tp-bare" placeholder="Search industries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search industries" />
      </label>
      <div className="tp-flist">
        {groups.map((g) => (
          <button
            key={g.label}
            type="button"
            role="checkbox"
            aria-checked={g.on}
            className={`tp-ftoggle tp-ftoggle-sm tp-fgroupopt${g.on ? " on" : ""}`}
            title={g.values.join(", ")}
            onClick={() => setF({ ...f, industry: g.on ? f.industry.filter((x) => !g.values.includes(x)) : [...new Set([...f.industry, ...g.values])] })}
          >
            <span className="tp-check" aria-hidden>
              {g.on && <IconCheck size={11} />}
            </span>
            <span className="tp-ftoggle-l">{g.label}</span>
            <span className="tp-cnt num">{g.n}</span>
          </button>
        ))}
        {list.map((o) => {
          const on = f.industry.includes(o);
          const n = counts[o] ?? 0;
          return (
            <button
              key={o}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={`tp-ftoggle tp-ftoggle-sm${on ? " on" : ""}${!n && !on ? " zero" : ""}`}
              onClick={() => setF({ ...f, industry: on ? f.industry.filter((x) => x !== o) : [...f.industry, o] })}
            >
              <span className="tp-check" aria-hidden>
                {on && <IconCheck size={11} />}
              </span>
              <span className="tp-ftoggle-l">{o}</span>
              <span className="tp-cnt num">{n}</span>
            </button>
          );
        })}
        {!list.length && !!q && <p className="tp-fnote">No industry on the list matches {q}.</p>}
        {!list.length && !q && (
          <p className="tp-fnote">{hasIndustry ? "None of these companies has an industry on file." : "No company has an industry on file yet. Add one and you can filter by it."}</p>
        )}
      </div>
      {!q && withData.length > 8 && (
        <button type="button" className="tp-flink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${withData.length} industries`}
        </button>
      )}
    </div>
  );
}

/**
 * HQ by place. Type a city, state or country and press Enter (or pick the first line) to match
 * every spelling of it: "california" catches "San Diego, CA" and "Venice , Ca". The lines under
 * it are the HQs on file that contain what was typed.
 */
function Hq({ f, setF, counts }: { f: Filters; setF: (f: Filters) => void; counts: Record<string, number> }) {
  const [q, setQ] = useState("");
  const all = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const typed = q.trim();
  const want = placeWords(typed);
  // Every HQ on file that is in the typed place, by its words ("ca" reads as California).
  const inPlace = want.length
    ? all.filter(([v]) => {
        const have = new Set(placeWords(v));
        return want.every((w) => have.has(w));
      })
    : [];
  const placeN = inPlace.reduce((n, [, c]) => n + c, 0);
  const already = f.hq.some((v) => v.toLowerCase() === typed.toLowerCase());
  const offerPlace = !!typed && !already && placeN > 0;
  const sugg = all.filter(([v]) => !f.hq.includes(v) && (typed ? inPlace.some(([x]) => x === v) || v.toLowerCase().includes(typed.toLowerCase()) : true)).slice(0, typed ? 6 : 4);
  const addPlace = () => {
    if (!offerPlace) return;
    setF({ ...f, hq: [...f.hq, typed] });
    setQ("");
  };
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">HQ</div>
      {f.hq.length > 0 && (
        <div className="tp-fchips">
          {f.hq.map((v) => (
            <button key={v} type="button" className="chip chip-on tp-fchip" onClick={() => setF({ ...f, hq: f.hq.filter((x) => x !== v) })} aria-label={`Remove the filter ${v}`}>
              {v} <IconX size={11} />
            </button>
          ))}
        </div>
      )}
      <label className="tp-fsearch">
        <IconSearch size={13} />
        <input
          className="tp-bare"
          placeholder="City, state or country"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPlace();
            }
          }}
          aria-label="Filter by HQ city, state or country. Press Enter to add it."
          enterKeyHint="done"
        />
      </label>
      <div className="tp-flist">
        {offerPlace && (
          <button type="button" className="tp-ftoggle tp-ftoggle-sm tp-fplace" onClick={addPlace}>
            <span className="tp-ftoggle-l">
              Anywhere in <b>{typed}</b>
            </span>
            <span className="tp-cnt num">{placeN}</span>
          </button>
        )}
        {sugg.map(([v, n]) => (
          <button key={v} type="button" className="tp-ftoggle tp-ftoggle-sm" onClick={() => (setF({ ...f, hq: [...f.hq, v] }), setQ(""))}>
            <span className="tp-ftoggle-l">{v}</span>
            <span className="tp-cnt num">{n}</span>
          </button>
        ))}
        {!all.length && <p className="tp-fnote">No company has an HQ on file yet.</p>}
        {all.length > 0 && !sugg.length && !offerPlace && typed && <p className="tp-fnote">No HQ on file is in {typed}.</p>}
      </div>
    </div>
  );
}

/**
 * Country, most common first with the United States first of all, and the regions (US states)
 * under it once a country is picked.
 */
function Country({ f, setF, counts, regions }: { f: Filters; setF: (f: Filters) => void; counts: Record<string, number>; regions: Record<string, number> }) {
  const [all, setAll] = useState(false);
  const us = (v: string) => countryKey(v) === "united states";
  const opts = Object.entries(counts)
    .sort((a, b) => Number(us(b[0])) - Number(us(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v]) => v);
  for (const v of f.country) if (!opts.includes(v)) opts.push(v);
  if (!opts.length) return null;
  const list = all ? opts : opts.slice(0, 6);
  const regionOpts = Object.entries(regions).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  for (const v of f.region) if (!regionOpts.includes(v)) regionOpts.push(v);
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">Country</div>
      <ChipSet
        k="country"
        f={f}
        // A region means something inside its country: taking the country off takes its regions off too.
        setF={(nf) => setF(nf.country.length ? nf : { ...nf, region: [] })}
        counts={counts}
        options={list}
      />
      {opts.length > 6 && (
        <button type="button" className="tp-flink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${opts.length} countries`}
        </button>
      )}
      {f.country.length > 0 && regionOpts.length > 0 && (
        <>
          <div className="tp-flabel">{f.country.length === 1 && us(f.country[0]) ? "State" : "Region"}</div>
          <ChipSet k="region" f={f} setF={setF} counts={regions} options={regionOpts.slice(0, 24)} />
        </>
      )}
    </div>
  );
}

/**
 * Recently hired: "Hired a fractional … in the last …". Functions (pick several) and the window,
 * each with what it gives. A function with nothing behind it is left out unless picked. The same
 * filter as the sentence over the table (Hired.tsx), so the two always agree.
 */
function Hired({ f, setF, facets }: { f: Filters; setF: (f: Filters) => void; facets: Facets }) {
  const counts = facets.hiredFn ?? {};
  const fns = FUNCTIONS.filter((o) => (counts[o] ?? 0) > 0 || f.hiredFn.includes(o));
  return (
    <>
    <div className="tp-fblock">
      <div className="tp-flabel">Hired a fractional</div>
      {fns.length > 0 ? (
        <div className="tp-fchips">
          {fns.map((o) => {
            const on = f.hiredFn.includes(o);
            const n = counts[o] ?? 0;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                className={`chip tp-fchip${on ? " chip-on" : ""}${!n && !on ? " zero" : ""}`}
                onClick={() => setF({ ...f, hiredFn: on ? f.hiredFn.filter((x) => x !== o) : [...f.hiredFn, o] })}
              >
                {o} <span className="tp-cnt num">{n}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="tp-fnote">No fractional hires in this view yet.</p>
      )}
    </div>
    <div className="tp-fblock">
      <div className="tp-flabel">In the last</div>
      <div className="tp-fchips" role="radiogroup" aria-label="In the last">
        {HIRED_WINDOWS.map((w) => {
          const on = f.hiredWithin === w;
          return (
            <button key={w} type="button" role="radio" aria-checked={on} className={`chip tp-fchip${on ? " chip-on" : ""}`} onClick={() => setF({ ...f, hiredWithin: w })}>
              {w ? windowWords(w) : "Any time"} <span className="tp-cnt num">{facets.hiredWithin?.[w] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}

/** A group that starts folded (Seat, People): open while one of its filters is on. */
function Fold({ title, on, children }: { title: string; on: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(on);
  useEffect(() => {
    if (on) setOpen(true);
  }, [on]);
  return (
    <details className="tp-fgroup tp-ffold" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="tp-fgroup-h">
        {title}
        <IconChevron size={14} dir={open ? "up" : "down"} />
      </summary>
      {children}
    </details>
  );
}

export function FilterPanel({
  f,
  setF,
  facets,
  me,
  head,
  hasIndustry = true,
  hasRoles = false,
  top,
}: {
  f: Filters;
  setF: (f: Filters) => void;
  facets: Facets;
  me: Me;
  head?: ReactNode;
  /** Whether any company has an industry on file (else the empty note invites adding one). */
  hasIndustry?: boolean;
  /** Whether any role on file carries open and closed dates (the weekly scan follows it). */
  hasRoles?: boolean;
  /** Above the groups: the saved views. */
  top?: ReactNode;
}) {
  const n = activeCount(f);
  const t = facets.toggles;
  const l = facets.lists;
  const openPage = useOpenPage();
  return (
    <div className="tp-filters">
      {head !== undefined ? (
        head
      ) : (
        <div className="tp-filters-head">
          <span className="tp-filters-title">Filters</span>
          {n > 0 && (
            <button type="button" className="tp-flink" onClick={() => setF(clearedFilters(f))}>
              Clear all
            </button>
          )}
        </div>
      )}
      {top}
      {/* The filter a fractional reaches for first: always open, at the top (C28). */}
      <Group title="Function">
        <ListBlock k="fn" title="Seat or open role in" f={f} setF={setF} counts={l.fn} />
      </Group>
      <Group title="Recently hired">
        <Hired f={f} setF={setF} facets={facets} />
        <p className="tp-fnote">
          A hire is a fractional leader&apos;s seat on file that started in the window. Full-time seats, open roles and titles below Lead, like Finance Manager, don&apos;t count. A start with only a year counts as December of that year.
        </p>
      </Group>
      <Group title="Shortcuts">
        <Toggle k="rateKnown" f={f} setF={setF} n={t.rateKnown} />
        {openPage && (
          <p className="tp-fnote tp-fnote-link">
            What fractionals charge, by function and client revenue.{" "}
            <button type="button" className="tp-flink" onClick={() => openPage("rates")}>
              Rate benchmarks
            </button>
          </p>
        )}
        <Toggle k="contactKnown" f={f} setF={setF} n={t.contactKnown} />
        {me.function && <Toggle k="notMine" f={f} setF={setF} n={t.notMine} label={notMineLabel(me.function)} />}
        {me.function && (
          <p className="tp-fnote">
            Companies that hired fractionals in other functions and have no {namedFn(me.function) ? `fractional ${me.function} seat` : "fractional seat in your function"} on file.
          </p>
        )}
      </Group>
      {(hasRoles || f.roleState.length > 0) && (
        <Group title="Open roles">
          <div className="tp-fblock">
            <ChipSet k="roleState" f={f} setF={setF} counts={l.roleState} options={LIST_OPTIONS.roleState} keepZero />
          </div>
          <p className="tp-fnote">Open now is every open role on file, the same list as Hiring now. Closed roles stay on file with their dates.</p>
        </Group>
      )}
      <Group title="Company">
        <Industry f={f} setF={setF} counts={l.industry} hasIndustry={hasIndustry} />
        <ListBlock k="employees" title="Employees" f={f} setF={setF} counts={l.employees} />
        <ListBlock k="revenue" title="Revenue" f={f} setF={setF} counts={l.revenue} />
        <Country f={f} setF={setF} counts={l.country} regions={l.region} />
        <Hq f={f} setF={setF} counts={l.hq} />
        <ListBlock k="businessModel" title="Business model" f={f} setF={setF} counts={l.businessModel} />
        <ListBlock k="motion" title="Sales motion" f={f} setF={setF} counts={l.motion} />
        <ListBlock k="dealSize" title="Average deal size" f={f} setF={setF} counts={l.dealSize} />
        <ListBlock k="salesCycle" title="Average sales cycle" f={f} setF={setF} counts={l.salesCycle} />
        <div className="tp-fblock">
          <div className="tp-flabel">Fit score</div>
          <div className="tp-fchips">
            {FIT_STEPS.filter((s) => s === 0 || facets.fit[s] || f.fitMin === s).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={f.fitMin === s}
                className={`chip tp-fchip${f.fitMin === s ? " chip-on" : ""}${!facets.fit[s] && f.fitMin !== s ? " zero" : ""}`}
                onClick={() => setF({ ...f, fitMin: s })}
              >
                {s ? `${s}+` : "Any"} <span className="tp-cnt num">{facets.fit[s]}</span>
              </button>
            ))}
          </div>
          <p className="tp-fnote">How often a company hires fractionals, from 0 to 100: its fractional seats on file, how recent they are and how many functions.</p>
        </div>
      </Group>
      <Fold title="Seat" on={f.type.length + f.reason.length + f.pricing.length + f.source.length > 0 || f.statusKnown}>
        <ListBlock k="type" title="Type" f={f} setF={setF} counts={l.type} />
        <Toggle k="statusKnown" f={f} setF={setF} n={t.statusKnown} />
        <ListBlock k="reason" title="Why they hired" f={f} setF={setF} counts={l.reason} />
        <ListBlock k="pricing" title="Pricing model" f={f} setF={setF} counts={l.pricing} />
      </Fold>
      <Fold title="People" on={f.fractionalNamed || f.emailKnown || f.relationship.length > 0}>
        <Toggle k="fractionalNamed" f={f} setF={setF} n={t.fractionalNamed} />
        <Toggle k="emailKnown" f={f} setF={setF} n={t.emailKnown} />
        <ListBlock k="relationship" title="Relationship" f={f} setF={setF} counts={l.relationship} />
      </Fold>
      <p className="tp-fnote tp-fnote-end">Filters show which seats have a rate or a name on file. They never show the rate or the name.</p>
    </div>
  );
}
