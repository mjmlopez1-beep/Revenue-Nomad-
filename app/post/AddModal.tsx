"use client";

/**
 * "Add what you know": find a company (type-ahead over Trading Post, or paste a website to
 * look it up), add it if it is new, then add an engagement, a person, or its missing facts.
 * Each filled field shows its "+1".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENGAGEMENT_TYPES, FUNCTIONS, HIRE_REASONS, PRICING_MODELS, RELATIONSHIPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, SOURCED_VIA, STATUSES, cleanValue, fieldDef,
} from "@/lib/tableFields";
import { CompanyLogo, IconCheck, IconSearch, IconX, fmtMonth, val } from "../ui/shared";
import { COMPANY_FILL, shown, type CoInfo } from "./model";
import { SeatHolderInput, Sheet, earnNote, useUi, type AddMode, type AddOpts } from "./ui";
import { MissingFacts } from "./Drawer";
import { plural, thisMonth, useDebounced } from "./hooks";

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
      {filled && !earnNote(ui.me).capped && <span className="tp-plus1 mono">+1</span>}
    </label>
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
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
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
      <div className="tp-newco-head">
        <CompanyLogo name={name || "?"} domain={website || null} size="lg" />
        <div className="tp-newco-names">
          <input className="input tp-newco-name" aria-label="Company name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
          {lookup ? (
            <span className="mono tp-small muted">{lookup.domain}</span>
          ) : (
            <input className="input mono" aria-label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website, e.g. acme.com" />
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
      {err && <p className="tp-ed-err">{err}</p>}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add company"} {n > 0 && room > 0 && <span className="mono">+{Math.min(n, room)}</span>}
        </button>
        <span className="tp-small muted">Then add a seat or a person there.</span>
      </div>
    </div>
  );
}

/* ---------- step 2: what you know there ---------- */

const ENG_ORDER = ["function", "role", "type", "status", "reason", "sourced", "pricing", "start", "end", "rate", "hours", "operator"] as const;

function EngagementForm({ i, onDone }: { i: CoInfo; onDone: (n: number) => void }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>({});
  const [seatMember, setSeatMember] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setErr(null));
  const filled = ENG_ORDER.filter((k) => v[k]?.trim());
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const submit = async () => {
    if (!filled.length) return setErr("Fill at least one field.");
    const fields: Record<string, string> = {};
    for (const k of filled) {
      const { error, value } = cleanValue(fieldDef("engagement", k)!, v[k]);
      if (error) return setErr(`${fieldDef("engagement", k)!.label}. ${error}`);
      fields[k] = value!;
    }
    setBusy(true);
    const r = await ui.act({
      type: "add",
      company: i.c.name,
      website: shown(i.c.cells.website) ?? undefined,
      newEngagement: true,
      engagementFields: fields,
      ...(fields.operator && seatMember ? { operatorMemberId: seatMember } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setV({});
      setSeatMember(null);
      onDone(filled.length);
    }
  };
  const txt = (k: string, mono = false, type = "text") => {
    const f = fieldDef("engagement", k)!;
    return (
      <div className="tp-form-row">
        <Lbl text={k === "operator" ? "Who held the seat" : f.label} filled={!!v[k]?.trim()} htmlFor={`tp-ef-${k}`} />
        <input
          id={`tp-ef-${k}`}
          className={`input${mono ? " mono" : ""}`}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          placeholder={f.placeholder ?? ""}
          value={v[k] ?? ""}
          onChange={(e) => set(k)(e.target.value)}
        />
      </div>
    );
  };
  return (
    <div className="tp-engform">
      <div className="tp-form-row">
        <Lbl text="Function" filled={!!v.function} />
        <Chips options={FUNCTIONS} value={v.function ?? ""} onPick={set("function")} label="Function" />
      </div>
      {txt("role")}
      <div className="tp-form-row">
        <Lbl text="Type" filled={!!v.type} />
        <Chips options={ENGAGEMENT_TYPES} value={v.type ?? ""} onPick={set("type")} label="Type" />
      </div>
      <div className="tp-form-row">
        <Lbl text="Status" filled={!!v.status} />
        <Chips options={STATUSES} value={v.status ?? ""} onPick={set("status")} label="Status" />
      </div>
      <div className="tp-form-row">
        <Lbl text="Why they hired" filled={!!v.reason} />
        <Chips options={HIRE_REASONS} value={v.reason ?? ""} onPick={set("reason")} label="Why they hired" />
      </div>
      <div className="tp-form-row">
        <Lbl text="How it was sourced" filled={!!v.sourced} />
        <Chips options={SOURCED_VIA} value={v.sourced ?? ""} onPick={set("sourced")} label="How it was sourced" />
      </div>
      <div className="tp-form-row">
        <Lbl text="Pricing model" filled={!!v.pricing} />
        <Chips options={PRICING_MODELS} value={v.pricing ?? ""} onPick={set("pricing")} label="Pricing model" />
      </div>
      <div className="tp-form-2">
        <div className="tp-form-row">
          <Lbl text="Start" filled={!!v.start} htmlFor="tp-ef-start" />
          <input id="tp-ef-start" className="input mono" type="month" max={thisMonth()} value={v.start ?? ""} onChange={(e) => set("start")(e.target.value)} />
        </div>
        <div className="tp-form-row">
          <Lbl text="End" filled={!!v.end} htmlFor="tp-ef-end" />
          <div className="tp-month">
            <input
              id="tp-ef-end"
              className="input mono"
              type="month"
              max={thisMonth()}
              value={v.end === "Ongoing" ? "" : v.end ?? ""}
              disabled={v.end === "Ongoing"}
              onChange={(e) => set("end")(e.target.value)}
            />
            <button type="button" className={`chip tp-chipbtn${v.end === "Ongoing" ? " chip-on" : ""}`} onClick={() => set("end")(v.end === "Ongoing" ? "" : "Ongoing")}>
              Ongoing
            </button>
          </div>
        </div>
      </div>
      <div className="tp-form-2">
        {txt("rate", true)}
        {txt("hours", true, "number")}
      </div>
      <div className="tp-form-row">
        <Lbl text="Who held the seat" filled={!!v.operator?.trim()} htmlFor="tp-ef-operator" />
        <SeatHolderInput
          id="tp-ef-operator"
          value={v.operator ?? ""}
          memberId={seatMember}
          onChange={(x, m) => (set("operator")(x), setSeatMember(m))}
        />
      </div>
      {err && <p className="tp-ed-err">{err}</p>}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add engagement"} {filled.length > 0 && room > 0 && <span className="mono">+{Math.min(filled.length, room)}</span>}
        </button>
        <span className="tp-small muted">{room ? `Each field earns 1. ${plural(room, "credit")} left to earn today.` : earnNote(ui.me).text}</span>
      </div>
    </div>
  );
}

const PERSON_ORDER = ["name", "title", "relationship", "email", "linkedin", "phone"] as const;

function PersonForm({ i, engagementId, onDone }: { i: CoInfo; engagementId?: string; onDone: (n: number) => void }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>({});
  const [seat, setSeat] = useState<string>(engagementId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setErr(null));
  const filled = PERSON_ORDER.filter((k) => v[k]?.trim());
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const submit = async () => {
    if (!v.name?.trim()) return setErr("Add the person's name.");
    const person: Record<string, string> = {};
    for (const k of filled) {
      const { error, value } = cleanValue(fieldDef("contact", k)!, v[k]);
      if (error) return setErr(`${fieldDef("contact", k)!.label}. ${error}`);
      person[k] = value!;
    }
    setBusy(true);
    const r = await ui.act({ type: "addPerson", companyId: i.c.id, engagementId: seat || null, person });
    setBusy(false);
    if (r.ok) {
      setV({});
      onDone(filled.length);
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
        <input id={`tp-pf-${k}`} className={`input${mono ? " mono" : ""}`} type={type} placeholder={f.placeholder ?? ""} value={v[k] ?? ""} onChange={(e) => set(k)(e.target.value)} />
      </div>
    );
  };
  return (
    <div className="tp-engform">
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
      <div className="tp-form-2">{txt("phone", true, "tel")}</div>
      {i.engs.length > 0 && (
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-pf-seat">
            Tied to
          </label>
          <select id="tp-pf-seat" className="select" value={seat} onChange={(e) => setSeat(e.target.value)}>
            <option value="">The company (a decision maker)</option>
            {i.engs.map((e) => (
              <option key={e.id} value={e.id}>
                {seatLabel(e)}
              </option>
            ))}
          </select>
        </div>
      )}
      {err && <p className="tp-ed-err">{err}</p>}
      <div className="tp-modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Adding" : "Add person"} {filled.length > 0 && room > 0 && <span className="mono">+{Math.min(filled.length, room)}</span>}
        </button>
        <span className="tp-small muted">Names and contact details stay locked for others until they unlock them.</span>
      </div>
    </div>
  );
}

/* ---------- the modal ---------- */

export function AddModal({ infos, opts, onClose }: { infos: CoInfo[]; opts: AddOpts; onClose: () => void }) {
  const ui = useUi();
  const [selected, setSelected] = useState<string | null>(opts.companyId ?? null);
  const [q, setQ] = useState(opts.query ?? "");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<AddMode>(opts.mode ?? "engagement");
  const [done, setDone] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const dq = useDebounced(q, 400);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  // After adding, bring the success panel into view (the form above it was scrolled).
  useEffect(() => {
    if (done) doneRef.current?.scrollIntoView({ block: "nearest" });
  }, [done]);
  const i = selected ? infos.find((x) => x.c.id === selected) ?? null : null;
  const capped = earnNote(ui.me).capped;

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
  // With an empty search: followed companies first, then the best fits, that still need facts.
  const suggestions = useMemo(
    () =>
      infos
        .filter((x) => !x.c.hidden && x.c.facts.missing > 0)
        .sort((a, b) => Number(b.c.following) - Number(a.c.following) || b.c.friendly.score - a.c.friendly.score)
        .slice(0, 5),
    [infos],
  );
  // The looked-up company shows once, in its "Already here" card.
  const shownMatches = lookup?.existing ? matches.filter((m) => m.c.id !== lookup.existing!.id) : matches;
  const exactMatch = matches.some((m) => m.c.name.toLowerCase() === q.trim().toLowerCase());

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
          {!q && <p className="tp-small muted tp-find-hint">Type a company name, or paste its website to add a new one in one click.</p>}
          {!q && suggestions.length > 0 && (
            <>
              <div className="tp-sublabel">{suggestions.some((s) => s.c.following) ? "Companies you follow that need facts" : "Top companies that need facts"}</div>
              <div className="tp-matches">
                {suggestions.map((m) => (
                  <button key={m.c.id} type="button" className="tp-match" onClick={() => pick(m.c.id)}>
                    <CompanyLogo name={m.c.name} domain={m.c.iconDomain ?? m.domain} />
                    <span className="tp-match-t">
                      <span className="tp-match-n">{m.c.name}</span>
                      <span className="mono tp-small muted">{m.domain ?? plural(m.c.engagements.length, "engagement")}</span>
                    </span>
                    <span className="tp-match-miss tp-small">
                      {m.c.facts.missing} missing {!capped && <span className="tp-plus1 mono">+{m.c.facts.missing}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {shownMatches.length > 0 && !creating && (
            <div className="tp-matches">
              {shownMatches.map((m) => (
                <button key={m.c.id} type="button" className="tp-match" onClick={() => pick(m.c.id)}>
                  <CompanyLogo name={m.c.name} domain={m.c.iconDomain ?? m.domain} />
                  <span className="tp-match-t">
                    <span className="tp-match-n">{m.c.name}</span>
                    <span className="mono tp-small muted">{m.domain ?? `${plural(m.c.engagements.length, "engagement")}`}</span>
                  </span>
                  <span className="tp-match-miss tp-small">
                    {m.c.facts.missing} missing {!capped && <span className="tp-plus1 mono">+{m.c.facts.missing}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {domainish && (looking || lookup) && (
            <div className="tp-lookup">
              {looking && !lookup && <p className="tp-small muted">Looking up {dq.trim()}</p>}
              {lookup?.error && <p className="tp-ed-err">{lookup.error}</p>}
              {lookup && !lookup.error && lookup.existing && (
                <div className="tp-exists">
                  <CompanyLogo name={lookup.existing.name} domain={lookup.existing.website ?? lookup.domain} size="lg" />
                  <div className="tp-exists-t">
                    <div className="tp-match-n">{lookup.existing.name}</div>
                    <div className="mono tp-small muted">{lookup.existing.website ?? lookup.domain}</div>
                  </div>
                  <span className="chip chip-volt">
                    <IconCheck size={11} /> Already here
                  </span>
                  <div className="tp-exists-acts">
                    <button type="button" className="btn btn-sm" onClick={() => (ui.openCompany(lookup.existing!.id), onClose())}>
                      Open record
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => pick(lookup.existing!.id)}>
                      Add to it
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
                +
              </span>
              <span className="tp-match-t">
                <span className="tp-match-n">Add {q.trim()} as a new company</span>
                <span className="tp-small muted">Paste its website instead to fill the name and industry for you</span>
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
              <div className="mono tp-small muted">
                {[i.domain, val(i.c.cells.industry), plural(i.c.engagements.length, "engagement")].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button type="button" className="tp-tbtn" onClick={() => (setSelected(null), setDone(null), setTimeout(() => inputRef.current?.focus()))}>
              Change
            </button>
          </div>
          {done ? (
            <div className="tp-done-panel">
              <div className="tp-done" role="status" ref={doneRef}>
                <IconCheck size={14} /> {done}
              </div>
              <div className="tp-done-acts">
                <button type="button" className="btn btn-primary" onClick={() => (setDone(null), setMode("engagement"))}>
                  Add another engagement
                </button>
                <button type="button" className="btn" onClick={() => (setDone(null), setMode("person"))}>
                  Add a person there
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => (ui.openCompany(i.c.id), onClose())}>
                  Open record
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="tp-seg" role="tablist" aria-label="What to add">
                {(
                  [
                    ["engagement", "Engagement"],
                    ["person", "Person"],
                    ...(missingCo ? ([["facts", `Company facts ${missingCo}`]] as const) : []),
                  ] as [AddMode, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tp-seg-b${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === "engagement" && <EngagementForm i={i} onDone={(n) => setDone(`Engagement added with ${plural(n, "fact")}.`)} />}
              {mode === "person" && <PersonForm i={i} engagementId={opts.engagementId} onDone={(n) => setDone(`Person added with ${plural(n, "fact")}.`)} />}
              {mode === "facts" && (missingCo ? <MissingFacts i={i} /> : <p className="tp-small muted">Every company fact is on file.</p>)}
            </>
          )}
        </div>
      )}
    </>
  );

  const title = i ? "Add what you know" : "Add what you know";
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
          <span className="tp-small muted">{earnNote(ui.me).capped ? earnNote(ui.me).text : "Each missing fact earns 1 credit"}</span>
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

