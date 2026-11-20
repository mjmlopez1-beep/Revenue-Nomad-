"use client";

/**
 * Who the member hunts. Their Ideal Fractional Profile (IFP, Me.icp: the companies they want as
 * clients) as chips to pick (onboarding and the Edit sheet share IcpFields), the pine "Your Ideal
 * Fractional Profile" pill over the table, and saved views: "Save
 * this view" with its weekly email, and the saved views as chips at the top of the filters.
 * Wherever they are listed to manage (the filters' Manage, the account menu's Manage saved views,
 * Your profile), each one has Weekly email, Rename and Remove (SavedViewList). Saved views share
 * one store with the Claude connector's saved searches (lib/hunt.ts).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CompanyRec, Icp, SavedViewRec } from "@/lib/tableTypes";
import { FUNCTIONS, INDUSTRY_GROUPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE } from "@/lib/tableFields";
import { IconCheck, IconSearch } from "../ui/shared";
import { countryKey, countryName, countryOf, deriveAll, icpEmpty, icpLabel, isFirm, shown, type CoInfo } from "./model";
import { BEFORE_MAX, beforeOrder, toggleBefore } from "../onboard/firstView";
import { Sheet, UiCtx } from "./ui";
import { PartnersSwitch, RadarSwitch } from "./PartnersSwitch";
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
export function IcpPill({
  icp,
  on,
  everyone,
  shownN,
  split,
  noun = ["company", "companies"],
  onToggle,
  onEdit,
}: {
  icp: Icp | null | undefined;
  on: boolean;
  everyone: number;
  shownN: number;
  /** While on: rows that match every part the profile asks for, and maybes (a part isn't on file). */
  split?: { match: number; maybe: number } | null;
  noun?: [string, string];
  onToggle: () => void;
  onEdit: () => void;
}) {
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
              Your <IfpName short="profile" />:
            </span>{" "}
            <b>{label}</b>
            {split && split.maybe > 0 && (
              <span className="hunt-pill-split">
                {" "}
                · <span className="num">{split.match}</span> confirmed, <span className="num">{split.maybe}</span> where a part isn&apos;t on file
              </span>
            )}
          </>
        ) : (
          <>
            <span className="hunt-pill-k">Showing everyone.</span> Your <IfpName short="profile" /> is <b>{label}</b>
          </>
        )}
      </span>
      <span className="hunt-pill-acts">
        <button type="button" className="hunt-pill-btn hunt-pill-edit" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="hunt-pill-btn" aria-pressed={!on} onClick={onToggle} title={on ? `${everyone} ${everyone === 1 ? noun[0] : noun[1]} without your Ideal Fractional Profile` : `${shownN} ${shownN === 1 ? noun[0] : noun[1]} shown`}>
          {on ? "Show everyone" : "Show your matches"}
        </button>
      </span>
    </div>
  );
}

/**
 * What a member tells us about themselves: title, function, Ideal Fractional Profile, and the
 * fractionals usually hired before them (`before`: up to 3, [] for Not sure, left out when they
 * didn't answer or didn't change it).
 */
export interface ProfileEdit {
  title: string;
  fn: string | null;
  icp: Icp;
  before?: string[];
}

/**
 * "Which fractional usually gets hired before you?" as chips: every function but the member's
 * own and Other, the suggested ones first (app/onboard/firstView.ts beforeOrder), up to
 * BEFORE_MAX, or Not sure. `value` null is not answered.
 */
export function BeforeFields({ fn, companies, value, onChange }: { fn: string | null; companies: CompanyRec[]; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const order = useMemo(() => beforeOrder(deriveAll(companies), fn), [companies, fn]);
  const picked = value ?? [];
  const unsure = value !== null && value.length === 0;
  const full = picked.length >= BEFORE_MAX;
  return (
    <fieldset className="hunt-q">
      <legend className="hunt-h">Which fractional usually gets hired before you?</legend>
      <div className="hunt-chips" role="group" aria-label="Which fractional usually gets hired before you">
        {order.order.map((o) => {
          const on = picked.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              aria-disabled={!on && full}
              className={`chip hunt-chip${on ? " chip-on" : ""}${!on && full ? " hunt-chip-full" : ""}`}
              onClick={() => onChange(toggleBefore(value, o))}
            >
              {on && <IconCheck size={11} />}
              {o}
            </button>
          );
        })}
        <button type="button" aria-pressed={unsure} className={`chip hunt-chip hunt-chip-unsure${unsure ? " chip-on" : ""}`} onClick={() => onChange(unsure ? null : [])}>
          {unsure && <IconCheck size={11} />}
          Not sure
        </button>
      </div>
      <p className="hunt-lead">Up to {BEFORE_MAX}. Recently hired opens on the first one. Other members never see your answer, only how many members gave each one.</p>
    </fieldset>
  );
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
  before,
  companies,
  views,
  onSave,
  onClose,
}: {
  icp: Icp | null | undefined;
  title: string;
  fn: string | null;
  /** Me.before: the fractionals usually hired before them, [] Not sure, undefined never asked. */
  before?: string[];
  companies: CompanyRec[];
  /** The member's saved views to rename or remove (SavedViewList). They change at once, apart from the sheet's Save. */
  views?: ReactNode;
  onSave: (v: ProfileEdit) => Promise<boolean>;
  onClose: () => void;
}) {
  const [v, setV] = useState<Icp>(icp ?? EMPTY_ICP);
  const [t, setT] = useState(title);
  const [f, setF] = useState<string | null>(fn && FUNCTIONS.includes(fn) ? fn : null);
  const [b, setB] = useState<string[] | null>(Array.isArray(before) ? before : null);
  const [busy, setBusy] = useState(false);
  const industries = useMemo(() => industriesByCount(companies), [companies]);
  const countries = useMemo(() => countriesByCount(companies), [companies]);
  // Their own function can't come before them. Taking off their only pick leaves the question unanswered, not "Not sure".
  const rest = b === null ? null : b.filter((x) => x !== f);
  const nb = b !== null && b.length > 0 && rest !== null && rest.length === 0 ? null : rest;
  const save = async () => {
    setBusy(true);
    // An answer left as it was (or never given) isn't sent.
    const changed = nb !== null && JSON.stringify(nb) !== JSON.stringify(before ?? null);
    const ok = await onSave({ title: t.trim(), fn: f, icp: v, ...(changed ? { before: nb! } : {}) });
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
        <BeforeFields fn={f} companies={companies} value={nb} onChange={setB} />
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
      <LookingSwitch />
      <RadarSwitch />
      <PartnersSwitch />
      {views ? (
        <div className="hunt-sub hunt-views-sub">
          <div className="hunt-h">Saved views</div>
          <p className="hunt-lead">Open one from its name, or rename or remove it here.</p>
          {views}
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * [ux ws3] "Are you looking for a new client?", now that onboarding no longer asks it: Yes or Not
 * now, saved at once where onboarding kept it (profile.looking). Not now is the softer pitch on Pro
 * (PlanView.notLooking), never a hard sell.
 */
function LookingSwitch() {
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  if (!ui) return null;
  const now = ui.me.looking ?? null;
  const set = async (v: boolean) => {
    if (v === now) return;
    setBusy(true);
    await ui.act({ type: "profile", looking: v }, { quiet: true });
    setBusy(false);
  };
  return (
    <div className="hunt-sub">
      <div className="hunt-h" id="hunt-looking">
        Are you looking for a new client?
      </div>
      <div className="hunt-chips" role="radiogroup" aria-labelledby="hunt-looking">
        {([
          [true, "Yes"],
          [false, "Not now"],
        ] as const).map(([v, label]) => (
          <button key={label} type="button" role="radio" aria-checked={now === v} disabled={busy} className={`chip hunt-chip${now === v ? " chip-on" : ""}`} onClick={() => void set(v)}>
            {now === v && <IconCheck size={11} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Save this view": a name (made from the filters) and the weekly email. `hires`: the view follows
 * hires (Recently hired), so the email sends new hires, not open roles. `existing`: the view on
 * screen is saved already ("Saved view"), so the sheet edits it instead: its name and weekly email,
 * and Remove.
 */
export function SaveViewSheet({
  defaultName,
  emailOn,
  hires = false,
  existing,
  onSave,
  onRemove,
  onClose,
}: {
  defaultName: string;
  emailOn: boolean;
  hires?: boolean;
  existing?: SavedViewRec | null;
  onSave: (name: string, email: boolean) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? defaultName);
  const [email, setEmail] = useState(existing ? existing.email : true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(name.trim() || existing?.name || defaultName, email);
    setBusy(false);
    if (ok) onClose();
  };
  const remove = async () => {
    setBusy(true);
    const ok = await onRemove?.();
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      dialog
      className="hunt-sheet hunt-save"
      title={existing ? "Saved view" : "Save this view"}
      onClose={onClose}
      footer={
        <div className="tp-sheet-actions">
          {existing && onRemove ? (
            <button type="button" className="btn hunt-vremove-btn" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-pine btn-lg tp-grow" disabled={busy} aria-busy={busy} onClick={save}>
            {busy ? "Saving" : existing ? "Save changes" : "Save view"}
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
          {!emailOn
            ? "Email isn't switched on for the pilot yet. Your view is saved, and the weekly email starts once it is. If you connect Merlin to Claude (Integrations), it can open this view too."
            : hires
              ? "The weekly email lists the companies that newly match this view, when a hire like this one is added. Slack gets them too if you connect it (Integrations)."
              : "The weekly email lists the open roles that came in matching this view. If you connect Merlin to Claude (Integrations), it can open this view too."}
        </p>
      </form>
    </Sheet>
  );
}

/**
 * What a list of saved views can do with each one: open it (where the list offers that), turn its
 * weekly email on or off, rename it and remove it. Rename and remove answer whether it went through.
 */
export interface SavedViewActs {
  onOpen?: (v: SavedViewRec) => void;
  onEmail: (v: SavedViewRec, on: boolean) => void;
  onRename: (v: SavedViewRec, name: string) => Promise<boolean>;
  onRemove: (v: SavedViewRec) => Promise<boolean> | void;
}

/**
 * One saved view in a list that manages them: its name (tap opens it, where the list offers that),
 * then Weekly email, Rename and Remove under it. Rename turns the name into a field: Enter or Save
 * name keeps the new one, Cancel keeps the old one.
 */
function SavedViewItem({ v, current, onOpen, onEmail, onRename, onRemove }: SavedViewActs & { v: SavedViewRec; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.name);
  const [busy, setBusy] = useState(false);
  const stop = () => {
    setEditing(false);
    setName(v.name);
  };
  const rename = async () => {
    const next = name.trim();
    if (!next || next === v.name) return stop();
    setBusy(true);
    const ok = await onRename(v, next);
    setBusy(false);
    if (ok) setEditing(false);
  };
  const from = v.place === null && <span className="hunt-vfrom"> · saved in Claude</span>;
  if (editing)
    return (
      <li className="hunt-vitem">
        <form
          className="hunt-vrename"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label className="sr-only" htmlFor={`hunt-vname-${v.id}`}>
            New name for {v.name}
          </label>
          <input id={`hunt-vname-${v.id}`} className="input hunt-vinput" value={name} maxLength={100} autoFocus enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
          <span className="hunt-vacts">
            <button type="submit" className="btn btn-sm btn-pine" disabled={busy || !name.trim()} aria-busy={busy}>
              {busy ? "Saving" : "Save name"}
            </button>
            <button type="button" className="btn btn-sm" onClick={stop}>
              Cancel
            </button>
          </span>
        </form>
      </li>
    );
  return (
    <li className={`hunt-vitem${current ? " on" : ""}`}>
      {onOpen ? (
        <button type="button" className="hunt-vname hunt-vopen" title={`Open ${v.name}`} aria-current={current || undefined} onClick={() => onOpen(v)}>
          {v.name}
          {from}
        </button>
      ) : (
        <span className="hunt-vname" title={v.name}>
          {v.name}
          {from}
        </span>
      )}
      <span className="hunt-vacts">
        <button type="button" role="checkbox" aria-checked={v.email} className={`tp-ftoggle tp-ftoggle-sm${v.email ? " on" : ""}`} onClick={() => onEmail(v, !v.email)}>
          <span className="tp-check" aria-hidden>
            {v.email && <IconCheck size={11} />}
          </span>
          <span className="tp-ftoggle-l">Weekly email</span>
        </button>
        {/* Rename and Remove stay together: beside the email where there is room, under it in the narrow filters. */}
        <span className="hunt-vbtns">
          <button
            type="button"
            className="hunt-vact"
            aria-label={`Rename ${v.name}`}
            onClick={() => {
              setName(v.name);
              setEditing(true);
            }}
          >
            Rename
          </button>
          <button type="button" className="hunt-vact hunt-vremove" aria-label={`Remove ${v.name}`} onClick={() => void onRemove(v)}>
            Remove
          </button>
        </span>
      </span>
    </li>
  );
}

/** Saved views as a list to manage: each one with Weekly email, Rename and Remove (SavedViewItem). */
export function SavedViewList({ views, current, ...acts }: SavedViewActs & { views: SavedViewRec[]; current: string | null }) {
  return (
    <ul className="hunt-vlist">
      {views.map((v) => (
        <SavedViewItem key={v.id} v={v} current={current === v.id} {...acts} />
      ))}
    </ul>
  );
}

/** "Manage saved views" from the account menu: every saved view, to open, rename or remove. */
export function SavedViewsSheet({ views, current, onClose, ...acts }: SavedViewActs & { views: SavedViewRec[]; current: string | null; onClose: () => void }) {
  return (
    <Sheet dialog className="hunt-sheet hunt-views-sheet" title="Saved views" onClose={onClose}>
      {views.length ? (
        <>
          <p className="hunt-lead">Open a view from its name. The weekly email lists what&apos;s new for each view that has it on.</p>
          <SavedViewList views={views} current={current} {...acts} />
        </>
      ) : (
        <p className="hunt-lead">No saved views now. Save the filters you use most from the table, and open them in one tap.</p>
      )}
    </Sheet>
  );
}

/** Saved views at the top of the filters: tap one to open it. Manage turns the weekly email on or off, renames one or removes it. */
export function SavedViews({
  views,
  current,
  onOpen,
  onSave,
  saveTag,
  onEmail,
  onRename,
  onRemove,
}: SavedViewActs & {
  views: SavedViewRec[];
  current: string | null;
  onOpen: (v: SavedViewRec) => void;
  onSave: () => void;
  /** A view past Free's one is Pro's (billing live): its tag on Save this view, locked on Free. */
  saveTag?: ReactNode;
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
      {manage && views.length > 0 ? (
        <SavedViewList views={views} current={current} onEmail={onEmail} onRename={onRename} onRemove={onRemove} />
      ) : (
        <div className="hunt-chips">
          {views.map((v) => (
            <button key={v.id} type="button" className={`chip hunt-chip hunt-vchip${current === v.id ? " chip-on" : ""}`} aria-pressed={current === v.id} onClick={() => onOpen(v)} title={v.name}>
              <span className="hunt-vchip-t">{v.name}</span>
            </button>
          ))}
          <button type="button" className="chip hunt-chip hunt-vsave" onClick={onSave}>
            Save this view
            {saveTag}
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
