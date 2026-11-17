"use client";

/**
 * Who the member hunts. Their Ideal Fractional Profile (IFP, Me.icp: the companies they want as
 * clients) as chips to pick (onboarding and the Edit sheet share IcpFields), the pine "Your Ideal
 * Fractional Profile" pill over the table, and saved views: "Save
 * this view" with its weekly email, and the saved views as chips at the top of the filters.
 * Saved views share one store with the Claude connector's saved searches (lib/hunt.ts).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CompanyRec, Icp, SavedViewRec } from "@/lib/tableTypes";
import { FUNCTIONS, INDUSTRY_GROUPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE } from "@/lib/tableFields";
import { IconCheck, IconSearch, IconX } from "../ui/shared";
import { countryKey, countryName, countryOf, icpEmpty, icpLabel, isFirm, shown, type CoInfo } from "./model";
import { Sheet } from "./ui";
import "./hunt.css";

export const EMPTY_ICP: Icp = { industries: [], employees: [], revenue: [], countries: [] };
const US = "United States";

/** Industries by how many companies on file are in them, then the rest of the list. Fractional firms don't count. */
export function industriesByCount(companies: CompanyRec[]): { name: string; n: number }[] {
  const n = new Map<string, number>(RN_INDUSTRIES.map((x) => [x, 0]));
  for (const c of companies) {
    if (isFirm(c)) continue;
    const v = shown(c.cells.industry);
    if (v && n.has(v)) n.set(v, n.get(v)! + 1);
  }
  return [...n].map(([name, k]) => ({ name, n: k })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
/** Countries on file, most common first, the United States first of all. */
export function countriesByCount(companies: CompanyRec[]): { name: string; n: number }[] {
  const n = new Map<string, { name: string; n: number }>();
  for (const c of companies) {
    const v = countryOf(c);
    if (!v || isFirm(c)) continue;
    const k = countryKey(v);
    const cur = n.get(k) ?? { name: countryName(v), n: 0 };
    cur.n++;
    n.set(k, cur);
  }
  return [...n.values()].sort((a, b) => Number(countryKey(b.name) === "united states") - Number(countryKey(a.name) === "united states") || b.n - a.n || a.name.localeCompare(b.name));
}

function Chips({ options, on, toggle, label, name }: { options: string[]; on: (o: string) => boolean; toggle: (o: string) => void; label?: (o: string) => ReactNode; name: string }) {
  return (
    <div className="hunt-chips" role="group" aria-label={name}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={on(o)} className={`chip hunt-chip${on(o) ? " chip-on" : ""}`} onClick={() => toggle(o)}>
          {on(o) && <IconCheck size={11} />}
          {label ? label(o) : o}
        </button>
      ))}
    </div>
  );
}

const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** The Ideal Fractional Profile as chips: industries, company size, client revenue and where. Every part is optional. */
export function IcpFields({
  value,
  onChange,
  industries,
  countries,
  headingClass = "hunt-h",
}: {
  value: Icp;
  onChange: (v: Icp) => void;
  industries: { name: string; n: number }[];
  countries: { name: string; n: number }[];
  /** The class of each part's heading (onboarding uses its own). */
  headingClass?: string;
}) {
  const [indQ, setIndQ] = useState("");
  // The standard list is long (RN_INDUSTRIES): the most common 12 as chips, the ones picked, and a search for the rest.
  const q = indQ.trim().toLowerCase();
  const found = q ? industries.filter((x) => x.name.toLowerCase().includes(q) && !value.industries.includes(x.name)).slice(0, 12).map((x) => x.name) : [];
  const shownInd = q ? [...value.industries, ...found] : [...new Set([...industries.slice(0, 12).map((x) => x.name), ...value.industries])];
  // "Software (all)" first: one tap picks SaaS, Enterprise Software, SMB Software and Developer Tools (stored as the four).
  const groups = INDUSTRY_GROUPS.filter((g) => !q || g.label.toLowerCase().includes(q) || g.values.some((v) => v.toLowerCase().includes(q)));
  const groupOf = (o: string) => groups.find((g) => g.label === o);
  const indOn = (o: string) => {
    const g = groupOf(o);
    return g ? g.values.every((v) => value.industries.includes(v)) : value.industries.includes(o);
  };
  const indToggle = (o: string) => {
    const g = groupOf(o);
    // A pick ends the search (as Enter does), so no "no match" line is left under the chip just picked.
    if (q && !indOn(o)) setIndQ("");
    if (!g) return onChange({ ...value, industries: flip(value.industries, o) });
    const on = indOn(o);
    onChange({ ...value, industries: on ? value.industries.filter((v) => !g.values.includes(v)) : [...new Set([...value.industries, ...g.values])] });
  };
  const others = countries.filter((c) => countryKey(c.name) !== "united states").slice(0, 6).map((c) => c.name);
  const usOnly = value.countries.length === 1 && countryKey(value.countries[0]) === "united states";
  const anywhere = value.countries.length === 0;
  return (
    <div className="hunt-fields">
      <fieldset className="hunt-q">
        <legend className={headingClass}>Industries</legend>
        <Chips name="Industries" options={[...groups.map((g) => g.label), ...shownInd]} on={indOn} toggle={indToggle} />
        {industries.length > 12 && (
          <label className="tp-fsearch hunt-isearch">
            <IconSearch size={13} />
            <input
              className="tp-bare"
              type="search"
              placeholder={`Search all ${industries.length} industries`}
              aria-label={`Search all ${industries.length} industries`}
              value={indQ}
              onChange={(e) => setIndQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the first match, so a typed industry is one key away.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (found[0]) onChange({ ...value, industries: [...value.industries, found[0]] });
                  setIndQ("");
                }
              }}
              enterKeyHint="done"
            />
          </label>
        )}
        {q && !found.length && !groups.length && !industries.some((x) => x.name.toLowerCase().includes(q)) && <p className="hunt-note">No industry on the list matches {indQ.trim()}.</p>}
      </fieldset>
      <fieldset className="hunt-q">
        <legend className={headingClass}>Company size</legend>
        <Chips name="Company size" options={RN_EMPLOYEES} on={(o) => value.employees.includes(o)} toggle={(o) => onChange({ ...value, employees: flip(value.employees, o) })} label={(o) => `${o} people`} />
      </fieldset>
      <fieldset className="hunt-q">
        <legend className={headingClass}>Client revenue</legend>
        <Chips name="Client revenue" options={RN_REVENUE} on={(o) => value.revenue.includes(o)} toggle={(o) => onChange({ ...value, revenue: flip(value.revenue, o) })} />
      </fieldset>
      <fieldset className="hunt-q">
        <legend className={headingClass}>Where</legend>
        <div className="hunt-chips" role="group" aria-label="Where">
          <button type="button" aria-pressed={usOnly} className={`chip hunt-chip${usOnly ? " chip-on" : ""}`} onClick={() => onChange({ ...value, countries: usOnly ? [] : [US] })}>
            {usOnly && <IconCheck size={11} />}
            US only
          </button>
          <button type="button" aria-pressed={anywhere} className={`chip hunt-chip${anywhere ? " chip-on" : ""}`} onClick={() => onChange({ ...value, countries: [] })}>
            {anywhere && <IconCheck size={11} />}
            Anywhere
          </button>
          {others.map((o) => {
            const on = value.countries.some((x) => countryKey(x) === countryKey(o));
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                className={`chip hunt-chip${on ? " chip-on" : ""}`}
                onClick={() => onChange({ ...value, countries: on ? value.countries.filter((x) => countryKey(x) !== countryKey(o)) : [...value.countries, o] })}
              >
                {on && <IconCheck size={11} />}
                {o}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * "Ideal Fractional Profile" (IFP): the companies a fractional wants as clients. Written out in
 * full, and as "IFP" only where a phone can't fit the words (hunt.css shows one or the other).
 */
export function IfpName({ short = "IFP" }: { short?: string }) {
  return (
    <>
      <span className="ifp-long">Ideal Fractional Profile</span>
      <span className="ifp-short" aria-hidden>
        {short}
      </span>
    </>
  );
}

/**
 * The pine pill over the list. On: "Your Ideal Fractional Profile Software · 11–200 · $5M–$20M · US",
 * with Edit and Show everyone. Off: the same profile, one tap to narrow again. None yet: a way to set it.
 */
export function IcpPill({ icp, on, everyone, shownN, onToggle, onEdit }: { icp: Icp | null | undefined; on: boolean; everyone: number; shownN: number; onToggle: () => void; onEdit: () => void }) {
  const label = icpLabel(icp);
  if (icpEmpty(icp))
    return (
      <div className="hunt-pill hunt-pill-off" role="group" aria-label="Your Ideal Fractional Profile">
        <span className="hunt-pill-text">Set your Ideal Fractional Profile, the companies you want as clients, and the table leads with companies like them.</span>
        <button type="button" className="hunt-pill-btn" onClick={onEdit}>
          Set it up
        </button>
      </div>
    );
  return (
    <div className={`hunt-pill${on ? "" : " hunt-pill-off"}`} role="group" aria-label="Your Ideal Fractional Profile">
      <span className="hunt-pill-text">
        {on ? (
          <>
            <span className="hunt-pill-k">
              Your <IfpName />
            </span>{" "}
            <b>{label}</b>
          </>
        ) : (
          <>
            <span className="hunt-pill-k">Showing everyone.</span> Your <IfpName /> is <b>{label}</b>
          </>
        )}
      </span>
      <span className="hunt-pill-acts">
        <button type="button" className="hunt-pill-btn hunt-pill-edit" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="hunt-pill-btn" aria-pressed={!on} onClick={onToggle} title={on ? `${everyone} without your Ideal Fractional Profile` : `${shownN} shown`}>
          {on ? "Show everyone" : "Show your matches"}
        </button>
      </span>
    </div>
  );
}

/** What a member tells us about themselves: title, function and Ideal Fractional Profile. */
export interface ProfileEdit {
  title: string;
  fn: string | null;
  icp: Icp;
}

/**
 * "Your profile" in a sheet (a dialog on wider screens): title, function and Ideal Fractional Profile.
 * The function decides what the table points out and leads with; the profile narrows it.
 * Opened from the account menu and from the Ideal Fractional Profile pill.
 */
export function IcpSheet({
  icp,
  title,
  fn,
  companies,
  onSave,
  onClose,
}: {
  icp: Icp | null | undefined;
  title: string;
  fn: string | null;
  companies: CompanyRec[];
  onSave: (v: ProfileEdit) => Promise<boolean>;
  onClose: () => void;
}) {
  const [v, setV] = useState<Icp>(icp ?? EMPTY_ICP);
  const [t, setT] = useState(title);
  const [f, setF] = useState<string | null>(fn && FUNCTIONS.includes(fn) ? fn : null);
  const [busy, setBusy] = useState(false);
  const industries = useMemo(() => industriesByCount(companies), [companies]);
  const countries = useMemo(() => countriesByCount(companies), [companies]);
  const save = async () => {
    setBusy(true);
    const ok = await onSave({ title: t.trim(), fn: f, icp: v });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      dialog
      className="hunt-sheet"
      title="Your profile"
      onClose={onClose}
      footer={
        <div className="tp-sheet-actions">
          <button type="button" className="btn btn-pine btn-lg tp-grow" disabled={busy} aria-busy={busy} onClick={save}>
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      }
    >
      <div className="hunt-fields">
        <div className="hunt-q hunt-q-title">
          <label className="hunt-h" htmlFor="hunt-title">
            Your title
          </label>
          <input id="hunt-title" className="input" value={t} maxLength={80} placeholder="Fractional VP Sales" onChange={(e) => setT(e.target.value)} />
        </div>
        <fieldset className="hunt-q">
          <legend className="hunt-h">Your function</legend>
          <div className="hunt-chips" role="radiogroup" aria-label="Your function">
            {FUNCTIONS.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={f === o} className={`chip hunt-chip${f === o ? " chip-on" : ""}`} onClick={() => setF(f === o ? null : o)}>
                {f === o && <IconCheck size={11} />}
                {o}
              </button>
            ))}
          </div>
          <p className="hunt-lead">We point out open roles in your function and companies that haven&apos;t hired it yet.</p>
        </fieldset>
      </div>
      <div className="hunt-sub">
        <div className="hunt-h">Your Ideal Fractional Profile</div>
        <p className="hunt-lead">The companies you want as clients. The table leads with companies like these. Pick as many as fit, and leave a part empty for any.</p>
        {!icpEmpty(v) && (
          <button type="button" className="btn btn-sm" onClick={() => setV(EMPTY_ICP)}>
            Clear your Ideal Fractional Profile
          </button>
        )}
      </div>
      <IcpFields value={v} onChange={setV} industries={industries} countries={countries} />
    </Sheet>
  );
}

/** "Save this view": a name (made from the filters) and the weekly email. */
export function SaveViewSheet({ defaultName, emailOn, onSave, onClose }: { defaultName: string; emailOn: boolean; onSave: (name: string, email: boolean) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(name.trim() || defaultName, email);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      dialog
      className="hunt-sheet hunt-save"
      title="Save this view"
      onClose={onClose}
      footer={
        <div className="tp-sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-pine btn-lg tp-grow" disabled={busy} aria-busy={busy} onClick={save}>
            {busy ? "Saving" : "Save view"}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="hunt-label" htmlFor="hunt-view-name">
          Name
        </label>
        <input id="hunt-view-name" className="input hunt-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="button" role="checkbox" aria-checked={email} className={`tp-ftoggle hunt-email${email ? " on" : ""}`} onClick={() => setEmail(!email)}>
          <span className="tp-check" aria-hidden>
            {email && <IconCheck size={11} />}
          </span>
          <span className="tp-ftoggle-l">Email me new matches each week</span>
        </button>
        <p className="hunt-note">
          {emailOn
            ? "The weekly email lists the open roles that came in matching this view. Claude sees this view too, if you use Merlin there."
            : "Email isn't switched on for the pilot yet. Your view is saved, and the weekly email starts once it is. Claude sees this view too."}
        </p>
      </form>
    </Sheet>
  );
}

/** Saved views at the top of the filters: tap one to open it. Manage turns the weekly email on or off, or removes one. */
export function SavedViews({
  views,
  current,
  onOpen,
  onSave,
  onEmail,
  onRemove,
}: {
  views: SavedViewRec[];
  current: string | null;
  onOpen: (v: SavedViewRec) => void;
  onSave: () => void;
  onEmail: (v: SavedViewRec, on: boolean) => void;
  onRemove: (v: SavedViewRec) => void;
}) {
  const [manage, setManage] = useState(false);
  return (
    <section className="tp-fgroup hunt-views">
      <div className="hunt-views-h">
        <h3 className="tp-fgroup-h">Saved views</h3>
        {views.length > 0 && (
          <button type="button" className="tp-flink" onClick={() => setManage(!manage)} aria-expanded={manage}>
            {manage ? "Done" : "Manage"}
          </button>
        )}
      </div>
      {manage ? (
        <ul className="hunt-vlist">
          {views.map((v) => (
            <li key={v.id}>
              <span className="hunt-vname" title={v.name}>
                {v.name}
                {v.place === null && <span className="hunt-vfrom"> · saved in Claude</span>}
              </span>
              <button type="button" role="checkbox" aria-checked={v.email} className={`tp-ftoggle tp-ftoggle-sm${v.email ? " on" : ""}`} onClick={() => onEmail(v, !v.email)}>
                <span className="tp-check" aria-hidden>
                  {v.email && <IconCheck size={11} />}
                </span>
                <span className="tp-ftoggle-l">Weekly email</span>
              </button>
              <button type="button" className="tp-iconbtn tp-iconbtn-sm hunt-vx" aria-label={`Remove ${v.name}`} onClick={() => onRemove(v)}>
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="hunt-chips">
          {views.map((v) => (
            <button key={v.id} type="button" className={`chip hunt-chip hunt-vchip${current === v.id ? " chip-on" : ""}`} aria-pressed={current === v.id} onClick={() => onOpen(v)} title={v.name}>
              <span className="hunt-vchip-t">{v.name}</span>
            </button>
          ))}
          <button type="button" className="chip hunt-chip hunt-vsave" onClick={onSave}>
            Save this view
          </button>
        </div>
      )}
      {!views.length && <p className="tp-fnote">Save the filters you use most and open them in one tap. We can email you new matches each week.</p>}
    </section>
  );
}

/**
 * While the list is sorted by "Best fit for you": why each company ranks where it does, one line
 * ("Software · 51–200 · $5M–$20M · hired Sales in 2025 · no Marketing seat"). Cards show it under
 * the name, the desktop table in the name's tooltip. Null under any other sort.
 */
export const FitWhyCtx = createContext<((i: CoInfo) => string) | null>(null);
export const useFitWhy = (i: CoInfo): string | null => {
  const why = useContext(FitWhyCtx);
  return why ? why(i) || null : null;
};
