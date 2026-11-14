"use client";

/** Filter groups (sidebar on desktop, overlay on tablet, bottom sheet on phones). Every option shows a count. */
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

function Toggle({ k, f, setF, n }: { k: ToggleKey; f: Filters; setF: (f: Filters) => void; n: number }) {
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
      <span className="tp-ftoggle-l">{TOGGLE_LABEL[k]}</span>
      <span className="tp-cnt mono">{n}</span>
    </button>
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
            {label(o)} <span className="tp-cnt mono">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function Industry({ f, setF, counts }: { f: Filters; setF: (f: Filters) => void; counts: Record<string, number> }) {
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
              <span className="tp-cnt mono">{n}</span>
            </button>
          );
        })}
        {!list.length && !q && <p className="tp-fnote">No industries on file yet. Add one to a company to filter by it.</p>}
      </div>
      {!q && (
        <button type="button" className="tp-flink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${LIST_OPTIONS.industry.length}`}
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
            <button key={v} type="button" className="chip chip-on tp-fchip" onClick={() => setF({ ...f, hq: f.hq.filter((x) => x !== v) })} aria-label={`Remove ${v}`}>
              {v} <IconX size={11} />
            </button>
          ))}
        </div>
      )}
      <label className="tp-fsearch">
        <IconSearch size={13} />
        <input className="tp-bare" placeholder="City or state" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search HQ" />
      </label>
      <div className="tp-flist">
        {sugg.map(([v, n]) => (
          <button key={v} type="button" className="tp-ftoggle tp-ftoggle-sm" onClick={() => (setF({ ...f, hq: [...f.hq, v] }), setQ(""))}>
            <span className="tp-ftoggle-l">{v}</span>
            <span className="tp-cnt mono">{n}</span>
          </button>
        ))}
        {!all.length && <p className="tp-fnote">No HQs on file yet.</p>}
        {all.length > 0 && !sugg.length && q && <p className="tp-fnote">No HQ matches {q}.</p>}
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
}: {
  f: Filters;
  setF: (f: Filters) => void;
  facets: Facets;
  me: Me;
  head?: ReactNode;
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
      <Group title="Quick">
        <Toggle k="friendly" f={f} setF={setF} n={t.friendly} />
        <Toggle k="hiring" f={f} setF={setF} n={t.hiring} />
        <Toggle k="following" f={f} setF={setF} n={t.following} />
        <Toggle k="rateKnown" f={f} setF={setF} n={t.rateKnown} />
        <Toggle k="contactKnown" f={f} setF={setF} n={t.contactKnown} />
        {me.function && <Toggle k="notMine" f={f} setF={setF} n={t.notMine} />}
        {me.function && <p className="tp-fnote">Not yet hired my function shows companies that hired other GTM seats but not {me.function} yet.</p>}
      </Group>
      <Group title="Company">
        <Industry f={f} setF={setF} counts={l.industry} />
        <div className="tp-fblock">
          <div className="tp-flabel">Employees</div>
          <ChipSet k="employees" f={f} setF={setF} counts={l.employees} options={LIST_OPTIONS.employees} />
        </div>
        <div className="tp-fblock">
          <div className="tp-flabel">Revenue</div>
          <ChipSet k="revenue" f={f} setF={setF} counts={l.revenue} options={LIST_OPTIONS.revenue} />
        </div>
        <Hq f={f} setF={setF} counts={l.hq} />
        <div className="tp-fblock">
          <div className="tp-flabel">Fit score</div>
          <div className="tp-fchips">
            {FIT_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={f.fitMin === s}
                className={`chip tp-fchip${f.fitMin === s ? " chip-on" : ""}${!facets.fit[s] && f.fitMin !== s ? " zero" : ""}`}
                onClick={() => setF({ ...f, fitMin: s })}
              >
                {s ? `${s}+` : "Any"} <span className="tp-cnt mono">{facets.fit[s]}</span>
              </button>
            ))}
          </div>
        </div>
      </Group>
      <Group title="Engagement">
        <div className="tp-fblock">
          <div className="tp-flabel">Function</div>
          <ChipSet k="fn" f={f} setF={setF} counts={l.fn} options={LIST_OPTIONS.fn} />
        </div>
        <div className="tp-fblock">
          <div className="tp-flabel">Type</div>
          <ChipSet k="type" f={f} setF={setF} counts={l.type} options={LIST_OPTIONS.type} />
        </div>
        <Toggle k="statusKnown" f={f} setF={setF} n={t.statusKnown} />
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
      <p className="tp-fnote tp-fnote-end">Locked facts filter by whether they are on file, never by value.</p>
    </div>
  );
}
