"use client";

/**
 * "Add what you know": find a company (type-ahead over Trading Post, or paste a website to
 * look it up), add it if it is new, then add a seat, a person, or the company details that
 * are missing. The form says what earns a credit before the member types, each answered
 * field shows its "+1", and the last screen says what was earned and what to do next.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENGAGEMENT_TYPES, FUNCTIONS, HIRE_REASONS, PERSON_NAME_RE, PRICING_MODELS, RELATIONSHIPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, SOURCED_VIA, STATUSES, cleanValue, fieldDef,
} from "@/lib/tableFields";
import { CompanyLogo, IconCheck, IconPlus, IconSearch, IconX, fmtMonth, hue, initials, val } from "../ui/shared";
import { COMPANY_FILL, shown, type CoInfo } from "./model";
import { SeatHolderInput, Sheet, earnNote, useUi, type AddMode, type AddOpts } from "./ui";
import { MissingFacts } from "./Drawer";
import { MonthYear } from "./Seats";
import { fmtTime, plural, useDebounced } from "./hooks";

interface Lookup {
  domain: string;
  name: string | null;
  industry: string | null;
  description: string | null;
  existing: { id: string; name: string; website: string | null; industry: string | null } | null;
  error?: string;
}

const looksLikeDomain = (s: string) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim());

function Chips({ options, value, onPick, label }: { options: string[]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div className="tp-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={`chip tp-chipbtn${value === o ? " chip-on" : ""}`} onClick={() => onPick(value === o ? "" : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Lbl({ text, filled, htmlFor }: { text: string; filled: boolean; htmlFor?: string }) {
  const ui = useUi();
  return (
    <label className="tp-lbl" htmlFor={htmlFor}>
      {text}
      {filled && !earnNote(ui.me).capped && <span className="tp-plus1 num">+1</span>}
    </label>
  );
}

/** Credits the member can still earn today. */
const useRoom = () => {
  const { me } = useUi();
  return me.earnResetsAt ? 0 : Math.max(0, me.earnCap - me.earned24h);
};

/** Beside the submit button: what this will earn, or why it earns nothing today. */
function EarnLine({ n, empty }: { n: number; empty: string }) {
  const { me } = useUi();
  const room = useRoom();
  if (!room)
    return (
      <span className="am-earn">
        You&apos;ve earned today&apos;s {me.earnCap} credits. This still saves{me.earnResetsAt ? `, and you can earn again at ${fmtTime(me.earnResetsAt)}` : ""}.
      </span>
    );
  if (!n) return <span className="am-earn">{empty}</span>;
  const earn = Math.min(n, room);
  return (
    <span className="am-earn">
      {plural(n, "answer")}, <b>+{plural(earn, "credit")}</b>
      {earn < n ? ` (you can earn ${room} more today)` : ""}
    </span>
  );
}

/* ---------- step 1: the company ---------- */

function NewCompany({
  initialName,
  lookup,
  onAdded,
}: {
  initialName: string;
  lookup: Lookup | null;
  onAdded: (id: string) => void;
}) {
  const ui = useUi();
  const [name, setName] = useState(lookup?.name ?? initialName);
  const [website, setWebsite] = useState(lookup?.domain ?? "");
  const [industry, setIndustry] = useState(lookup?.industry ?? "");
  const [employees, setEmployees] = useState("");
  const [revenue, setRevenue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (lookup) {
      setName(lookup.name ?? initialName);
      setWebsite(lookup.domain);
      setIndustry(lookup.industry ?? "");
    }
  }, [lookup, initialName]);
  const n = [website, industry, employees, revenue].filter(Boolean).length;
  const submit = async () => {
    if (name.trim().length < 2) return setErr("What's the company called?");
    if (website) {
      const { error } = cleanValue(fieldDef("company", "website")!, website);
      if (error) return setErr(`Website. ${error}`);
    }
    setErr(null);
    setBusy(true);
    const companyFields: Record<string, string> = {};
    if (industry) companyFields.industry = industry;
    if (employees) companyFields.employees = employees;
    if (revenue) companyFields.revenue = revenue;
    const r = await ui.act({ type: "add", company: name.trim(), website: website || undefined, companyFields });
    setBusy(false);
    if (r.ok && r.id) onAdded(r.id);
  };
  return (
    <div className="tp-newco">
      <div className="am-newco-h">
        <h3 className="am-h3">New company</h3>
        <p className="am-note">Add the basics you know. You can add a seat or a person there next.</p>
      </div>
      <div className="tp-newco-head">
        <CompanyLogo name={name || "?"} domain={website || null} size="lg" />
        <div className="tp-newco-names">
          <input className="input tp-newco-name" aria-label="Company name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
          {lookup ? (
            <span className="mono tp-small muted">{lookup.domain}</span>
          ) : (
            <input className="input mono" aria-label="Website" inputMode="url" autoCapitalize="none" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website, like acme.com" />
          )}
        </div>
      </div>
      {lookup?.description && <p className="tp-small muted tp-newco-desc">{lookup.description}</p>}
      <div className="tp-form-row">
        <Lbl text="Industry" filled={!!industry} htmlFor="tp-nc-ind" />
        <select id="tp-nc-ind" className="select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">Pick one</option>
          {RN_INDUSTRIES.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="tp-form-row">
        <Lbl text="Employees" filled={!!employees} />
        <Chips options={RN_EMPLOYEES} value={employees} onPick={setEmployees} label="Employees" />
      </div>
      <div className="tp-form-row">
        <Lbl text="Revenue" filled={!!revenue} />
        <Chips options={RN_REVENUE} value={revenue} onPick={setRevenue} label="Revenue" />
      </div>
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add this company"}
        </button>
        <EarnLine n={n} empty="The website, industry, size and revenue each earn 1 credit." />
      </div>
    </div>
  );
}

/* ---------- step 2: what you know there ---------- */

const ENG_ORDER = ["function", "role", "type", "status", "operator", "start", "end", "pricing", "rate", "hours", "reason", "sourced"] as const;

/** `mine`: a seat the member held. They are the seat holder, and the seat goes on their Your seats page. */
function EngagementForm({ i, onDone, mine }: { i: CoInfo; onDone: (n: number, before: number) => void; mine?: boolean }) {
  const ui = useUi();
  // Their name as the seat holder, when it reads as a first and last name. Otherwise they type it.
  const asMe = mine && PERSON_NAME_RE.test(ui.me.name.trim());
  const blank: Record<string, string> = asMe ? { operator: ui.me.name.trim() } : {};
  const [v, setV] = useState<Record<string, string>>(blank);
  const [seatMember, setSeatMember] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setErr(null));
  const filled = ENG_ORDER.filter((k) => v[k]?.trim());
  const submit = async () => {
    if (!filled.length) return setErr("Fill in at least one thing about the seat.");
    const fields: Record<string, string> = {};
    for (const k of filled) {
      const { error, value } = cleanValue(fieldDef("engagement", k)!, v[k]);
      if (error) return setErr(`${k === "operator" ? "Who held the seat" : fieldDef("engagement", k)!.label}. ${error}`);
      fields[k] = value!;
    }
    setBusy(true);
    const before = ui.me.credits;
    const r = await ui.act(
      {
        type: "add",
        company: i.c.name,
        website: shown(i.c.cells.website) ?? undefined,
        newEngagement: true,
        engagementFields: fields,
        ...(fields.operator && (mine || seatMember) ? { operatorMemberId: mine ? "me" : seatMember! } : {}),
      },
      { quiet: true },
    );
    setBusy(false);
    if (r.ok) {
      setV(blank);
      setSeatMember(null);
      onDone(filled.length, before);
    }
  };
  const txt = (k: string, opts: { label?: string; type?: string; hint?: string } = {}) => {
    const f = fieldDef("engagement", k)!;
    const type = opts.type ?? "text";
    return (
      <div className="tp-form-row">
        <Lbl text={opts.label ?? f.label} filled={!!v[k]?.trim()} htmlFor={`tp-ef-${k}`} />
        <input
          id={`tp-ef-${k}`}
          className="input"
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          autoComplete="off"
          placeholder={f.placeholder ?? ""}
          value={v[k] ?? ""}
          onChange={(e) => set(k)(e.target.value)}
        />
        {opts.hint && <p className="am-hint">{opts.hint}</p>}
      </div>
    );
  };
  const picks = (k: string, label: string, options: string[]) => (
    <div className="tp-form-row">
      <Lbl text={label} filled={!!v[k]} />
      <Chips options={options} value={v[k] ?? ""} onPick={set(k)} label={label} />
    </div>
  );
  return (
    <div className="tp-engform">
      <p className="am-note">
        {mine
          ? `Your seat at ${i.c.name}. Fill in what you remember and leave the rest. Each answer earns 1 credit.`
          : `A fractional seat at ${i.c.name}, one you held or one you know about. Fill in what you know and leave the rest. Each answer earns 1 credit.`}
      </p>
      <section className="am-group" aria-label="The seat">
        <h3 className="am-h3">The seat</h3>
        {picks("function", "Function", FUNCTIONS)}
        {txt("role")}
        {picks("type", "Type", ENGAGEMENT_TYPES)}
        {picks("status", "Status", mine ? STATUSES.filter((x) => x === "Active" || x === "Ended") : STATUSES)}
        <div className="tp-form-row">
          <Lbl text={mine && !asMe ? "Your first and last name" : "Who held the seat"} filled={!!v.operator?.trim()} htmlFor="tp-ef-operator" />
          {asMe ? (
            <div className="tp-seat-linked">
              <span className="tp-seat-av" style={{ background: `hsl(${hue(ui.me.name)} 45% 90%)`, color: `hsl(${hue(ui.me.name)} 45% 28%)` }}>
                {initials(ui.me.name)}
              </span>
              <span className="tp-seat-who">
                <b>You</b>
                <span>It goes on Your seats when you add it</span>
              </span>
            </div>
          ) : mine ? (
            <input id="tp-ef-operator" className="input" placeholder="First and last name" autoComplete="name" value={v.operator ?? ""} onChange={(e) => set("operator")(e.target.value)} />
          ) : (
            <>
              <SeatHolderInput id="tp-ef-operator" value={v.operator ?? ""} memberId={seatMember} onChange={(x, m) => (set("operator")(x), setSeatMember(m))} />
              <p className="am-hint">Leave it empty for an open role. Members spend 1 credit to see the name.</p>
            </>
          )}
        </div>
      </section>
      <section className="am-group" aria-label="Dates and pay">
        <h3 className="am-h3">Dates and pay</h3>
        <div className="tp-form-2">
          <div className="tp-form-row">
            <Lbl text="Start" filled={!!v.start} />
            <MonthYear label="Start" value={v.start ?? ""} onChange={set("start")} />
          </div>
          <div className="tp-form-row">
            <Lbl text="End" filled={!!v.end} />
            <div className="tp-month">
              <MonthYear label="End" value={v.end === "Ongoing" ? "" : v.end ?? ""} disabled={v.end === "Ongoing"} onChange={set("end")} />
              <button type="button" aria-pressed={v.end === "Ongoing"} className={`chip tp-chipbtn${v.end === "Ongoing" ? " chip-on" : ""}`} onClick={() => set("end")(v.end === "Ongoing" ? "" : "Ongoing")}>
                Ongoing
              </button>
            </div>
          </div>
        </div>
        <p className="am-hint am-hint-up">The year is enough if you don&apos;t know the month.</p>
        {picks("pricing", "Pricing model", PRICING_MODELS)}
        <div className="tp-form-2">
          {txt("rate", { hint: "Members spend 1 credit to see it." })}
          {txt("hours", { type: "number" })}
        </div>
      </section>
      <section className="am-group" aria-label="How it came about">
        <h3 className="am-h3">How it came about</h3>
        {picks("reason", "Why they hired", HIRE_REASONS)}
        {picks("sourced", "How it was sourced", SOURCED_VIA)}
      </section>
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add this seat"}
        </button>
        <EarnLine n={filled.length} empty="Each answer earns 1 credit." />
      </div>
    </div>
  );
}

const PERSON_ORDER = ["name", "title", "relationship", "email", "linkedin", "phone"] as const;

function PersonForm({ i, engagementId, onDone }: { i: CoInfo; engagementId?: string; onDone: (n: number, before: number) => void }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>({});
  const [seat, setSeat] = useState<string>(engagementId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setErr(null));
  const filled = PERSON_ORDER.filter((k) => v[k]?.trim());
  const submit = async () => {
    if (!v.name?.trim()) return setErr("Add the person's name.");
    const person: Record<string, string> = {};
    for (const k of filled) {
      const { error, value } = cleanValue(fieldDef("contact", k)!, v[k]);
      if (error) return setErr(`${fieldDef("contact", k)!.label}. ${error}`);
      person[k] = value!;
    }
    setBusy(true);
    const before = ui.me.credits;
    const r = await ui.act({ type: "addPerson", companyId: i.c.id, engagementId: seat || null, person }, { quiet: true });
    setBusy(false);
    if (r.ok) {
      setV({});
      onDone(filled.length, before);
    }
  };
  const seatLabel = (e: CoInfo["engs"][number]) => {
    const fn = shown(e.cells.function);
    const role = shown(e.cells.role);
    const start = shown(e.cells.start);
    return [role ?? (fn ? `${fn} seat` : "Seat"), start ? fmtMonth(start) : null].filter(Boolean).join(", ");
  };
  const txt = (k: string, mono = false, type = "text") => {
    const f = fieldDef("contact", k)!;
    return (
      <div className="tp-form-row">
        <Lbl text={f.label} filled={!!v[k]?.trim()} htmlFor={`tp-pf-${k}`} />
        <input
          id={`tp-pf-${k}`}
          className={`input${mono ? " mono" : ""}`}
          type={type}
          autoCapitalize={mono ? "none" : undefined}
          placeholder={f.placeholder ?? ""}
          value={v[k] ?? ""}
          onChange={(e) => set(k)(e.target.value)}
        />
      </div>
    );
  };
  return (
    <div className="tp-engform">
      <p className="am-note">
        Add someone at {i.c.name} a fractional would want to know, like the person who hires or who a seat reported to. Members spend 1 credit to see the name or a contact detail.
        Each answer earns you 1.
      </p>
      <div className="tp-form-2">
        {txt("name")}
        {txt("title")}
      </div>
      <div className="tp-form-row">
        <Lbl text="Relationship" filled={!!v.relationship} />
        <Chips options={RELATIONSHIPS} value={v.relationship ?? ""} onPick={set("relationship")} label="Relationship" />
      </div>
      <div className="tp-form-2">
        {txt("email", true, "email")}
        {txt("linkedin", true)}
      </div>
      <div className="tp-form-2">{txt("phone", false, "tel")}</div>
      {i.engs.length > 0 && (
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-pf-seat">
            They belong to
          </label>
          <select id="tp-pf-seat" className="select" value={seat} onChange={(e) => setSeat(e.target.value)}>
            <option value="">The company, as a decision maker</option>
            {i.engs.map((e) => (
              <option key={e.id} value={e.id}>
                {seatLabel(e)}
              </option>
            ))}
          </select>
        </div>
      )}
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add this person"}
        </button>
        <EarnLine n={filled.length} empty="Start with their name. Each answer earns 1 credit." />
      </div>
    </div>
  );
}

/* ---------- the modal ---------- */

/** What was just added, for the last screen. `before` is the balance when it was sent. */
interface Done {
  what: "seat" | "person";
  n: number;
  before: number;
}

export function AddModal({ infos, opts, onClose }: { infos: CoInfo[]; opts: AddOpts; onClose: () => void }) {
  const ui = useUi();
  const [selected, setSelected] = useState<string | null>(opts.companyId ?? null);
  const [q, setQ] = useState(opts.query ?? "");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<AddMode>(opts.mode ?? "engagement");
  const [done, setDone] = useState<Done | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const dq = useDebounced(q, 400);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  // After adding, bring the result into view (the form above it was scrolled).
  useEffect(() => {
    if (done) doneRef.current?.scrollIntoView({ block: "nearest" });
  }, [done]);
  const i = selected ? infos.find((x) => x.c.id === selected) ?? null : null;
  const me = ui.me;
  const capped = earnNote(me).capped;

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
    if (!s) return [];
    return infos
      .filter((x) => !x.c.hidden && (x.c.name.toLowerCase().includes(s) || (x.domain ?? "").includes(s)))
      .sort((a, b) => Number(b.c.name.toLowerCase().startsWith(s)) - Number(a.c.name.toLowerCase().startsWith(s)) || b.c.friendly.score - a.c.friendly.score)
      .slice(0, 6);
  }, [q, infos]);

  useEffect(() => {
    if (selected || !looksLikeDomain(dq)) {
      setLookup(null);
      return;
    }
    let live = true;
    setLooking(true);
    fetch(`/api/table/lookup?url=${encodeURIComponent(dq.trim())}`)
      .then((r) => r.json())
      .then((j: Lookup) => live && setLookup(j))
      .catch(() => live && setLookup(null))
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [dq, selected]);

  const pick = (id: string) => {
    setSelected(id);
    setCreating(false);
    setDone(null);
    const x = infos.find((y) => y.c.id === id);
    if (x && !x.engs.length && opts.mode === undefined) setMode("engagement");
  };
  const missingCo = i ? COMPANY_FILL.filter((f) => i.c.cells[f]?.s === "empty").length : 0;
  const domainish = looksLikeDomain(q);
  // With an empty search: followed companies first, then the best fits, that still have gaps.
  const suggestions = useMemo(
    () =>
      infos
        .filter((x) => !x.c.hidden && x.c.facts.missing > 0)
        .sort((a, b) => Number(b.c.following) - Number(a.c.following) || b.c.friendly.score - a.c.friendly.score)
        .slice(0, 5),
    [infos],
  );
  // The looked-up company shows once, in its "already here" card.
  const shownMatches = lookup?.existing ? matches.filter((m) => m.c.id !== lookup.existing!.id) : matches;
  const exactMatch = matches.some((m) => m.c.name.toLowerCase() === q.trim().toLowerCase());

  const matchRow = (m: CoInfo) => (
    <button key={m.c.id} type="button" className="tp-match" onClick={() => pick(m.c.id)}>
      <CompanyLogo name={m.c.name} domain={m.c.iconDomain ?? m.domain} />
      <span className="tp-match-t">
        <span className="tp-match-n">{m.c.name}</span>
        {m.domain ? <span className="mono tp-small muted">{m.domain}</span> : <span className="tp-small muted num">{plural(m.c.engagements.length, "seat")} on file</span>}
      </span>
      {m.c.facts.missing > 0 && <span className="tp-match-miss tp-small num">{m.c.facts.missing} missing</span>}
    </button>
  );
  const earnLine = capped
    ? `You've earned today's ${me.earnCap} credits. What you add still saves${me.earnResetsAt ? `, and you can earn again at ${fmtTime(me.earnResetsAt)}` : ""}.`
    : "You earn 1 credit for each thing you add that we don't have yet.";

  const gained = done ? me.credits - done.before : 0;
  const body = (
    <>
      {!i && (
        <div className="tp-find">
          <label className="tp-find-input">
            <IconSearch size={16} />
            <input
              ref={inputRef}
              className="tp-bare"
              autoFocus
              placeholder="Company name or website"
              value={q}
              onChange={(e) => (setQ(e.target.value), setCreating(false))}
              aria-label="Company name or website"
            />
          </label>
          {!q && (
            <p className="am-note tp-find-hint">
              {opts.mine ? "Which company was the seat at? Type its name. If we don't have it, paste its website and we'll fill in the basics." : "Start with the company. Type its name, or paste its website to add one we don't have."}{" "}
              {earnLine}
            </p>
          )}
          {!q && !opts.mine && suggestions.length > 0 && (
            <>
              <div className="tp-sublabel">{suggestions.some((s) => s.c.following) ? "Companies you follow with something missing" : "Companies with the most missing"}</div>
              <div className="tp-matches">{suggestions.map(matchRow)}</div>
            </>
          )}
          {shownMatches.length > 0 && !creating && <div className="tp-matches">{shownMatches.map(matchRow)}</div>}
          {domainish && (looking || lookup) && (
            <div className="tp-lookup">
              {looking && !lookup && (
                <p className="tp-small muted" role="status">
                  Looking up {dq.trim()}
                </p>
              )}
              {lookup?.error && (
                <p className="tp-ed-err" role="alert">
                  {lookup.error}
                </p>
              )}
              {lookup && !lookup.error && lookup.existing && (
                <div className="tp-exists">
                  <CompanyLogo name={lookup.existing.name} domain={lookup.existing.website ?? lookup.domain} size="lg" />
                  <div className="tp-exists-t">
                    <div className="tp-match-n">{lookup.existing.name}</div>
                    <div className="mono tp-small muted">{lookup.existing.website ?? lookup.domain}</div>
                  </div>
                  <p className="am-exists-p">
                    <IconCheck size={13} /> We already have {lookup.existing.name}. Add what you know to it, so there is one record of the company.
                  </p>
                  <div className="tp-exists-acts">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => pick(lookup.existing!.id)}>
                      Add to {lookup.existing.name.length > 22 ? "it" : lookup.existing.name}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => (ui.openCompany(lookup.existing!.id), onClose())}>
                      Open the record
                    </button>
                  </div>
                </div>
              )}
              {lookup && !lookup.error && !lookup.existing && <NewCompany initialName={q} lookup={lookup} onAdded={pick} />}
            </div>
          )}
          {q.trim().length >= 2 && !domainish && !exactMatch && !creating && (
            <button type="button" className="tp-match tp-match-new" onClick={() => setCreating(true)}>
              <span className="tp-match-plus" aria-hidden>
                <IconPlus size={14} />
              </span>
              <span className="tp-match-t">
                <span className="tp-match-n">Add {q.trim()} as a new company</span>
                <span className="tp-small muted">Or paste its website and we&apos;ll fill in the name and industry.</span>
              </span>
            </button>
          )}
          {creating && !domainish && <NewCompany initialName={q.trim()} lookup={null} onAdded={pick} />}
        </div>
      )}
      {i && (
        <div className="tp-picked">
          <div className="tp-picked-head">
            <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} size="lg" />
            <div className="tp-picked-t">
              <div className="tp-match-n">{i.c.name}</div>
              <div className="tp-small muted am-sub">
                {i.domain && <span className="mono">{i.domain}</span>}
                {val(i.c.cells.industry) && <span>{val(i.c.cells.industry)}</span>}
                <span className="num">{plural(i.c.engagements.length, "seat")} on file</span>
              </div>
            </div>
            <button type="button" className="tp-tbtn am-change" onClick={() => (setSelected(null), setDone(null), setTimeout(() => inputRef.current?.focus()))}>
              Change company
            </button>
          </div>
          {done ? (
            <div className="tp-done-panel" ref={doneRef}>
              <div className="tp-done" role="status">
                <span className="am-done-check" aria-hidden>
                  <IconCheck size={13} />
                </span>
                <span className="am-done-t">
                  <b>
                    {done.what === "seat" ? (opts.mine ? `Your seat at ${i.c.name} is added` : `Seat added at ${i.c.name}`) : `Person added at ${i.c.name}`}
                  </b>
                  <span>
                    {gained > 0
                      ? `You earned ${plural(gained, "credit")}. You have ${me.credits} now.`
                      : capped
                        ? `${plural(done.n, "answer")} saved. No credit this time, because you've already earned today's ${me.earnCap}.`
                        : `${plural(done.n, "answer")} saved.`}
                  </span>
                </span>
              </div>
              <h3 className="am-h3">What next?</h3>
              <div className="am-next">
                {opts.mine ? (
                  <>
                    <button type="button" className="am-next-b primary" onClick={onClose}>
                      <b>Back to your seats</b>
                      <span>The new seat is there. Answer more about it and earn 1 credit each.</span>
                    </button>
                    <button type="button" className="am-next-b" onClick={() => (setDone(null), setSelected(null), setQ(""))}>
                      <b>Add another seat you held</b>
                      <span>At this company or a different one.</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="am-next-b primary" onClick={() => (setDone(null), setMode(done.what === "seat" ? "person" : "engagement"))}>
                      <b>{done.what === "seat" ? "Add a person there" : "Add a seat there"}</b>
                      <span>{done.what === "seat" ? "Who hired for the seat, or who it reported to. 1 credit for each answer." : "A fractional seat you held or know about. 1 credit for each answer."}</span>
                    </button>
                    <button type="button" className="am-next-b" onClick={() => (setDone(null), setMode(done.what === "seat" ? "engagement" : "person"))}>
                      <b>{done.what === "seat" ? "Add another seat" : "Add another person"}</b>
                      <span>Also at {i.c.name}.</span>
                    </button>
                    <button type="button" className="am-next-b" onClick={() => (setDone(null), setSelected(null), setQ(""), setTimeout(() => inputRef.current?.focus()))}>
                      <b>Add to a different company</b>
                      <span>Search for it, or paste its website.</span>
                    </button>
                  </>
                )}
              </div>
              <div className="tp-done-acts">
                <button type="button" className="btn btn-sm" onClick={() => (ui.openCompany(i.c.id), onClose())}>
                  Open the record
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : opts.mine ? (
            <EngagementForm i={i} mine onDone={(n, before) => setDone({ what: "seat", n, before })} />
          ) : (
            <>
              <div className="tp-seg" role="tablist" aria-label="What to add">
                {(
                  [
                    ["engagement", "A seat"],
                    ["person", "A person"],
                    ...(missingCo ? ([["facts", ui.layout === "phone" ? `Company (${missingCo})` : `Company details (${missingCo})`]] as const) : []),
                  ] as [AddMode, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tp-seg-b${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === "engagement" && <EngagementForm i={i} onDone={(n, before) => setDone({ what: "seat", n, before })} />}
              {mode === "person" && <PersonForm i={i} engagementId={opts.engagementId} onDone={(n, before) => setDone({ what: "person", n, before })} />}
              {mode === "facts" && (missingCo ? <MissingFacts i={i} /> : <p className="am-note">Every company detail is filled in.</p>)}
            </>
          )}
        </div>
      )}
    </>
  );

  const title = opts.mine ? "Add a seat you held" : "Add what you know";
  if (ui.layout === "phone")
    return (
      <Sheet title={title} onClose={onClose} full>
        {body}
      </Sheet>
    );
  return createPortal(
    <div className="tp-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tp-modal-head">
          <h2 className="tp-modal-title">{title}</h2>
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Close (Esc)" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="tp-modal-body">{body}</div>
      </div>
    </div>,
    document.body,
  );
}
