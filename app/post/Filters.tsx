"use client";

/**
 * Filter groups (sidebar on desktop, overlay on tablet, bottom sheet on phones). Every option
 * shows a count: a number in the text face, right-aligned, so a column of them lines up.
 */
import { useState, type ReactNode } from "react";
import type { Me } from "@/lib/tableTypes";
import { SOURCE_LABEL } from "@/lib/tableFields";
import { IconCheck, IconSearch, IconX } from "../ui/shared";
import {
  EMPTY_FILTERS, FIT_STEPS, LIST_OPTIONS, TOGGLE_LABEL, activeCount, type Facets, type Filters, type ListKey, type ToggleKey,
} from "./model";

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

/** A list filter that only appears once some record has a value for it (new fields start empty). */
function ListBlock({ k, title, f, setF, counts }: { k: ListKey; title: string; f: Filters; setF: (f: Filters) => void; counts: Record<string, number> }) {
  if (!f[k].length && !Object.values(counts).some((n) => n > 0)) return null;
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">{title}</div>
      <ChipSet k={k} f={f} setF={setF} counts={counts} options={LIST_OPTIONS[k as Exclude<ListKey, "hq">]} />
    </div>
  );
}

function ChipSet({ k, f, setF, counts, label = (o: string) => o, options }: { k: ListKey; f: Filters; setF: (f: Filters) => void; counts: Record<string, number>; label?: (o: string) => string; options: string[] }) {
  const sel = f[k];
  return (
    <div className="tp-fchips">
      {options.map((o) => {
        const on = sel.includes(o);
        const n = counts[o] ?? 0;
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
  const list = all || q ? opts : withData.slice(0, 8);
  return (
    <div className="tp-fblock">
      <div className="tp-flabel">Industry</div>
      <label className="tp-fsearch">
        <IconSearch size={13} />
        <input className="tp-bare" placeholder="Search industries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search industries" />
      </label>
      <div className="tp-flist">
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
      {!q && (
        <button type="button" className="tp-flink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${LIST_OPTIONS.industry.length} industries`}
        </button>
      )}
    </div>
  );
}

function Hq({ f, setF, counts }: { f: Filters; setF: (f: Filters) => void; counts: Record<string, number> }) {
  const [q, setQ] = useState("");
  const all = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sugg = all.filter(([v]) => !f.hq.includes(v) && v.toLowerCase().includes(q.toLowerCase())).slice(0, q ? 8 : 4);
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
        <input className="tp-bare" placeholder="City or state" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by HQ city or state" />
      </label>
      <div className="tp-flist">
        {sugg.map(([v, n]) => (
          <button key={v} type="button" className="tp-ftoggle tp-ftoggle-sm" onClick={() => (setF({ ...f, hq: [...f.hq, v] }), setQ(""))}>
            <span className="tp-ftoggle-l">{v}</span>
            <span className="tp-cnt num">{n}</span>
          </button>
        ))}
        {!all.length && <p className="tp-fnote">No company has an HQ on file yet.</p>}
        {all.length > 0 && !sugg.length && q && <p className="tp-fnote">No HQ on file matches {q}.</p>}
      </div>
    </div>
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
}) {
  const n = activeCount(f);
  const t = facets.toggles;
  const l = facets.lists;
  return (
    <div className="tp-filters">
      {head !== undefined ? (
        head
      ) : (
        <div className="tp-filters-head">
          <span className="tp-filters-title">Filters</span>
          {n > 0 && (
            <button type="button" className="tp-flink" onClick={() => setF(EMPTY_FILTERS)}>
              Clear all
            </button>
          )}
        </div>
      )}
      <Group title="Shortcuts">
        <Toggle k="rateKnown" f={f} setF={setF} n={t.rateKnown} />
        <Toggle k="contactKnown" f={f} setF={setF} n={t.contactKnown} />
        {me.function && <Toggle k="notMine" f={f} setF={setF} n={t.notMine} label={`No ${me.function} seat yet`} />}
        {me.function && <p className="tp-fnote">Companies that hired fractionals in other GTM functions and have no {me.function} seat on file.</p>}
      </Group>
      {(hasRoles || f.roleState.length > 0) && (
        <Group title="Open roles">
          <div className="tp-fblock">
            <ChipSet k="roleState" f={f} setF={setF} counts={l.roleState} options={LIST_OPTIONS.roleState} />
          </div>
          <p className="tp-fnote">A role is open while its job posting was still up at our last weekly scan. Closed roles stay on file with their dates.</p>
        </Group>
      )}
      <Group title="Company">
        <Industry f={f} setF={setF} counts={l.industry} hasIndustry={hasIndustry} />
        <div className="tp-fblock">
          <div className="tp-flabel">Employees</div>
          <ChipSet k="employees" f={f} setF={setF} counts={l.employees} options={LIST_OPTIONS.employees} />
        </div>
        <div className="tp-fblock">
          <div className="tp-flabel">Revenue</div>
          <ChipSet k="revenue" f={f} setF={setF} counts={l.revenue} options={LIST_OPTIONS.revenue} />
        </div>
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
        </div>
      </Group>
      <Group title="Seat">
        <div className="tp-fblock">
          <div className="tp-flabel">Function</div>
          <ChipSet k="fn" f={f} setF={setF} counts={l.fn} options={LIST_OPTIONS.fn} />
        </div>
        <div className="tp-fblock">
          <div className="tp-flabel">Type</div>
          <ChipSet k="type" f={f} setF={setF} counts={l.type} options={LIST_OPTIONS.type} />
        </div>
        <Toggle k="statusKnown" f={f} setF={setF} n={t.statusKnown} />
        <ListBlock k="reason" title="Why they hired" f={f} setF={setF} counts={l.reason} />
        <ListBlock k="pricing" title="Pricing model" f={f} setF={setF} counts={l.pricing} />
        <div className="tp-fblock">
          <div className="tp-flabel">Source</div>
          <ChipSet k="source" f={f} setF={setF} counts={l.source} options={LIST_OPTIONS.source} label={(o) => SOURCE_LABEL[o] ?? o} />
        </div>
      </Group>
      <Group title="People">
        <Toggle k="fractionalNamed" f={f} setF={setF} n={t.fractionalNamed} />
        <Toggle k="emailKnown" f={f} setF={setF} n={t.emailKnown} />
        <div className="tp-fblock">
          <div className="tp-flabel">Relationship</div>
          <ChipSet k="relationship" f={f} setF={setF} counts={l.relationship} options={LIST_OPTIONS.relationship} />
        </div>
      </Group>
      <p className="tp-fnote tp-fnote-end">A filter can tell that a locked fact is on file. It never reads what the fact says.</p>
    </div>
  );
}
