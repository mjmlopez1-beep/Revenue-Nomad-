"use client";

/**
 * "Add what you know": find a company (type-ahead over Trading Post, or paste a website to
 * look it up), add it if it is new, then add a seat, a person, or the company details that
 * are missing. The form says what earns a credit before the member types, each answered
 * field shows its "+1", and the last screen says what the server saved and what to do next.
 *
 * It behaves as a dialog: focus moves into it and back to the control that opened it, Tab
 * stays inside, the page behind is inert, and nothing typed is thrown away without asking
 * (Esc, a click beside it, the X and the back gesture all ask first). What is typed in the
 * seat and person forms is kept when the member switches between them.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import {
  ENGAGEMENT_TYPES, FUNCTIONS, HIRE_REASONS, PERSON_NAME_RE, PRICING_MODELS, RELATIONSHIPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, SOURCED_VIA, STATUSES, cleanValue, fieldDef,
} from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import type { Cell } from "@/lib/tableTypes";
import { CompanyLogo, IconCheck, IconPlus, IconSearch, IconX, fmtMonth, hue, initials, val } from "../ui/shared";
import { COMPANY_FILL, shown, type CoInfo } from "./model";
import { SeatHolderInput, Sheet, earnNote, useUi, type AddMode, type AddOpts } from "./ui";
import { MissingFacts } from "./Drawer";
import { MonthYear } from "./MonthYear";
import { RateWho, reasonsFor, type RateChoice } from "./Seats";
import { BENCH_RATE_HELP, atTime, plural, useDebounced } from "./hooks";

interface Lookup {
  domain: string;
  name: string | null;
  industry: string | null;
  description: string | null;
  existing: { id: string; name: string; website: string | null; industry: string | null } | null;
  error?: string;
}

const looksLikeDomain = (s: string) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim());
const isLinkedIn = (s: string) => /(^|\/\/|\.)linkedin\.com(\/|$)/i.test(s.trim());
/** Free text never goes past what the server keeps. */
const MAX = 200;

/* ---------- errors at the field ---------- */

/** A problem with the form. `key` names the field it is about; null puts it beside the button. */
type FormErr = { key: string | null; text: string } | null;

/** Scroll the field into the middle of the form and put the cursor there. */
function focusField(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  });
}

/**
 * The server answers a bad field as "{label}. {what to do}". Under the field the label is
 * already there, so only the sentence shows. Anything else is about the whole form.
 */
function fromServer(text: string, entity: "engagement" | "contact" | "company", keys: readonly string[]): FormErr {
  for (const k of keys) {
    const label = fieldDef(entity, k)?.label;
    if (label && text.startsWith(`${label}. `)) return { key: k, text: text.slice(label.length + 2) };
  }
  return { key: null, text };
}

const FieldErr = ({ id, err, k }: { id: string; err: FormErr; k: string }) =>
  err && err.key === k ? (
    <p className="tp-ed-err am-ferr" id={`${id}-err`} role="alert">
      {err.text}
    </p>
  ) : null;
/** aria-invalid and aria-describedby for a field that has the error. */
const invalid = (id: string, err: FormErr, k: string) => (err && err.key === k ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {});

/** Enter in a text field moves to the next one, and submits from the last (its key says "done"). */
function onFormKey(e: ReactKeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.type === "radio" || t.type === "checkbox") return;
  const fields = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input.input:not([disabled]):not([type=radio])")];
  const k = fields.indexOf(t);
  if (k >= 0 && k < fields.length - 1) {
    e.preventDefault();
    fields[k + 1].focus();
  }
}
const nextField = (from: string) => {
  const el = document.getElementById(from);
  const form = el?.closest("form");
  if (!el || !form) return;
  const fields = [...form.querySelectorAll<HTMLInputElement>("input.input:not([disabled]):not([type=radio])")];
  const k = fields.indexOf(el as HTMLInputElement);
  if (k >= 0 && k < fields.length - 1) fields[k + 1].focus();
  else form.requestSubmit();
};

function Chips({ options, value, onPick, label, id, err }: { options: string[]; value: string; onPick: (v: string) => void; label: string; id?: string; err?: FormErr }) {
  return (
    <div className="tp-chips" role="radiogroup" aria-label={label} id={id} tabIndex={id ? -1 : undefined} {...(id && err ? invalid(id, err, id.replace(/^tp-ef-/, "")) : {})}>
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

/** Beside the submit button: what this will earn, or why it earns nothing today. A problem with the form takes its place. */
function EarnLine({ n, empty, err }: { n: number; empty: string; err?: FormErr }) {
  const { me } = useUi();
  const room = useRoom();
  if (err && err.key === null)
    return (
      <p className="tp-ed-err am-earn am-earn-err" role="alert">
        {err.text}
      </p>
    );
  if (!n) return <span className="am-earn">{empty}</span>;
  if (!room)
    return (
      <span className="am-earn">
        You&apos;ve earned today&apos;s {me.earnCap} credits. This still saves, and you can earn again {atTime(me.earnResetsAt)}.
      </span>
    );
  const earn = Math.min(n, room);
  return (
    <span className="am-earn">
      {plural(n, "answer")}, <b>+{plural(earn, "credit")}</b>
      {earn < n ? `. You can earn ${room} more today.` : ""}
    </span>
  );
}

/* ---------- step 1: the company ---------- */

function NewCompany({
  initialName,
  lookup,
  onAdded,
  onDirty,
}: {
  initialName: string;
  lookup: Lookup | null;
  onAdded: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const ui = useUi();
  const [name, setName] = useState(lookup?.name ?? initialName);
  const [website, setWebsite] = useState(lookup?.domain ?? "");
  const [industry, setIndustry] = useState(lookup?.industry ?? "");
  const [employees, setEmployees] = useState("");
  const [revenue, setRevenue] = useState("");
  const [err, setErr] = useState<FormErr>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (lookup) {
      setName(lookup.name ?? initialName);
      setWebsite(lookup.domain);
      setIndustry(lookup.industry ?? "");
    }
  }, [lookup, initialName]);
  // What the member chose themselves (a looked-up name, website and industry are ours).
  const typed = (!lookup && !!website.trim()) || (!!industry && industry !== (lookup?.industry ?? "")) || !!employees || !!revenue;
  useEffect(() => {
    onDirty(typed);
    return () => onDirty(false);
  }, [typed, onDirty]);
  const linkedin = !lookup && isLinkedIn(website);
  const n = [website, industry, employees, revenue].filter(Boolean).length;
  const fail = (e: FormErr) => {
    setErr(e);
    if (e?.key) focusField(`tp-nc-${e.key}`);
  };
  const submit = async () => {
    if (busy) return;
    if (name.trim().length < 2) return fail({ key: "name", text: "What's the company called?" });
    if (website) {
      const { error } = cleanValue(fieldDef("company", linkedin ? "linkedin" : "website")!, website);
      if (error) return fail({ key: "website", text: error });
    }
    setErr(null);
    setBusy(true);
    const companyFields: Record<string, string> = {};
    if (industry) companyFields.industry = industry;
    if (employees) companyFields.employees = employees;
    if (revenue) companyFields.revenue = revenue;
    // A LinkedIn page is the company's LinkedIn, not its website.
    if (linkedin) companyFields.linkedin = website.trim();
    const r = await ui.act({ type: "add", company: name.trim(), website: (!linkedin && website.trim()) || undefined, companyFields }, { quiet: true });
    setBusy(false);
    if (r.ok && r.id) return onAdded(r.id);
    if (!r.ok) {
      const e = fromServer(r.message, "company", ["website", "industry", "employees", "revenue", "linkedin"]);
      fail(e?.key === "linkedin" ? { key: "website", text: e.text } : /company (name|is called)|What's the company called/i.test(r.message) ? { key: "name", text: r.message } : e);
    }
  };
  return (
    <form
      className="tp-newco"
      noValidate
      onKeyDown={onFormKey}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="am-newco-h">
        <h3 className="am-h3">New company</h3>
        <p className="am-note">Add the basics you know. You can add a seat or a person there next.</p>
      </div>
      <div className="tp-newco-head">
        <CompanyLogo name={name || "?"} domain={(!linkedin && website) || null} size="lg" />
        <div className="tp-newco-names">
          <input
            id="tp-nc-name"
            className="input tp-newco-name"
            aria-label="Company name"
            maxLength={80}
            autoComplete="off"
            enterKeyHint={lookup ? "done" : "next"}
            value={name}
            onChange={(e) => (setName(e.target.value), setErr(null))}
            placeholder="Company name"
            {...invalid("tp-nc-name", err, "name")}
          />
          <FieldErr id="tp-nc-name" err={err} k="name" />
          {lookup ? (
            <span className="mono tp-small muted">{lookup.domain}</span>
          ) : (
            <>
              <input
                id="tp-nc-website"
                className="input mono"
                aria-label="Website"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX}
                enterKeyHint="done"
                value={website}
                onChange={(e) => (setWebsite(e.target.value), setErr(null))}
                placeholder="Website, like acme.com"
                {...invalid("tp-nc-website", err, "website")}
              />
              <FieldErr id="tp-nc-website" err={err} k="website" />
              {!(err?.key === "website") && (
                <p className="am-hint">
                  {linkedin ? "That's a LinkedIn page, so it goes in as the company's LinkedIn. Add its own website here if it has one." : "The company's own site, like acme.com. A LinkedIn page goes in the company's LinkedIn field."}
                </p>
              )}
            </>
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
      <div className="tp-modal-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding" : "Add this company"}
        </button>
        <EarnLine n={n} err={err} empty="The website, industry, size and revenue each earn 1 credit." />
      </div>
    </form>
  );
}

/* ---------- step 2: what you know there ---------- */

const ENG_ORDER = ["function", "role", "type", "status", "operator", "start", "end", "pricing", "rate", "hours", "reason", "sourced"] as const;
/** An open role nobody holds has none of these yet. */
const OPEN_ROLE_SKIP = ["start", "end", "reason", "sourced"];
/** Statuses a member can give a seat. "Closed" is what the weekly scan sets when a posting comes down. */
const MEMBER_STATUSES = STATUSES.filter((x) => x !== "Closed");
const MINE_STATUSES = STATUSES.filter((x) => x === "Active" || x === "Ended");

/** "2024" or "2024-03" as a number of months, for comparing. A year alone counts as its first or last month. */
const monthNo = (v: string, end: boolean) => {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(v);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : end ? 11 : 0) : null;
};

/** What the seat form holds. It lives in the modal, so switching to "A person" and back keeps it. */
export interface SeatDraft {
  v: Record<string, string>;
  member: string | null;
  who: RateChoice | null;
}
export const emptySeat: SeatDraft = { v: {}, member: null, who: null };

/** What a save sent back, for the last screen. */
interface Sent {
  n: number;
  before: number;
  message: string;
  capped: boolean;
  /** A rate shared for the benchmarks only, after the seat was saved. */
  bench?: { ok: boolean; message: string };
}

/** `mine`: a seat the member held. They are the seat holder, and the seat goes on their Your seats page. */
function EngagementForm({ i, onDone, mine, draft, setDraft }: { i: CoInfo; onDone: (s: Sent) => void; mine?: boolean; draft: SeatDraft; setDraft: Dispatch<SetStateAction<SeatDraft>> }) {
  const ui = useUi();
  // Their name as the seat holder, when it reads as a first and last name. Otherwise they type it.
  const asMe = mine && PERSON_NAME_RE.test(ui.me.name.trim());
  const v = draft.v;
  const [err, setErr] = useState<FormErr>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setDraft((d) => ({ ...d, v: { ...d.v, [k]: x } })), setErr(null));
  // An open role nobody holds yet: no start, end or story, and the rate and hours are the posting's.
  const openRole = !mine && v.status === "Open role" && !v.operator?.trim();
  const asked = ENG_ORDER.filter((k) => !(openRole && OPEN_ROLE_SKIP.includes(k)));
  // The member's own name, filled in for them, is not an answer.
  const filled = asked.filter((k) => v[k]?.trim() && !(asMe && k === "operator"));
  // Their name counts (and earns) once there is something else: alone it makes no seat.
  const answers = filled.length + (asMe && filled.length ? 1 : 0);
  const fail = (e: FormErr) => {
    setErr(e);
    if (e?.key) focusField(`tp-ef-${e.key}`);
  };
  const submit = async () => {
    if (busy) return;
    if (!filled.length) return fail({ key: null, text: "Fill in at least one thing about the seat." });
    if (!v.function?.trim() && !v.role?.trim()) return fail({ key: "function", text: "Add the function or the role first, so members know what the seat was." });
    const fields: Record<string, string> = {};
    for (const k of asked) {
      if (!v[k]?.trim() || (asMe && k === "operator")) continue;
      if (k === "rate" && mine && draft.who === "bench") continue;
      const { error, value } = cleanValue(fieldDef("engagement", k)!, v[k]);
      if (error) return fail({ key: k, text: error });
      fields[k] = value!;
    }
    if (asMe) fields.operator = ui.me.name.trim();
    // Dates and status that can't both be true.
    const s = v.start ? monthNo(v.start, false) : null;
    const en = v.end && v.end !== "Ongoing" ? monthNo(v.end, true) : null;
    if (s !== null && en !== null && en < s) return fail({ key: "end", text: "The end month can't be before the start." });
    if (v.status === "Active" && en !== null) return fail({ key: "end", text: "An active seat has no end month yet. Pick Ongoing, or set the status to Ended." });
    // A rate the member held: who sees it.
    let bench: { kind: "monthly" | "hourly" } | null = null;
    if (mine && v.rate?.trim()) {
      if (!draft.who) return fail({ key: "rate", text: "Pick who can see your rate." });
      if (draft.who === "bench") {
        const read = readRate(v.rate, v.pricing || null);
        if (!read) return fail({ key: "rate", text: BENCH_RATE_HELP });
        bench = read;
      }
    }
    setErr(null);
    setBusy(true);
    const before = ui.me.credits;
    const r = await ui.act(
      {
        type: "add",
        company: i.c.name,
        website: shown(i.c.cells.website) ?? undefined,
        newEngagement: true,
        engagementFields: fields,
        ...(fields.operator && (mine || draft.member) ? { operatorMemberId: mine ? "me" : draft.member! } : {}),
      },
      { quiet: true },
    );
    if (!r.ok) {
      setBusy(false);
      return fail(fromServer(r.message, "engagement", ENG_ORDER));
    }
    let shared: Sent["bench"];
    if (bench && r.id) {
      const b = await ui.act({ type: "benchRate", engagementId: r.id, pricing: bench.kind === "hourly" ? "Hourly" : "Monthly retainer", rate: v.rate.trim() }, { quiet: true });
      shared = { ok: b.ok, message: b.message };
    }
    setBusy(false);
    setDraft(emptySeat);
    onDone({ n: answers, before, message: r.message, capped: !!r.capped, bench: shared });
  };
  const id = (k: string) => `tp-ef-${k}`;
  const txt = (k: string, opts: { label?: string; type?: string; hint?: ReactNode; last?: boolean } = {}) => {
    const f = fieldDef("engagement", k)!;
    const type = opts.type ?? "text";
    return (
      <div className="tp-form-row">
        <Lbl text={opts.label ?? f.label} filled={!!v[k]?.trim()} htmlFor={id(k)} />
        <input
          id={id(k)}
          className="input"
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          autoComplete="off"
          maxLength={type === "number" ? undefined : MAX}
          enterKeyHint={opts.last ? "done" : "next"}
          placeholder={f.placeholder ?? ""}
          value={v[k] ?? ""}
          onChange={(e) => set(k)(e.target.value)}
          {...invalid(id(k), err, k)}
        />
        <FieldErr id={id(k)} err={err} k={k} />
        {opts.hint && <div className="am-hint">{opts.hint}</div>}
      </div>
    );
  };
  const picks = (k: string, label: string, options: string[]) => (
    <div className="tp-form-row">
      <Lbl text={label} filled={!!v[k]} />
      <Chips options={options} value={v[k] ?? ""} onPick={set(k)} label={label} id={id(k)} err={err} />
      <FieldErr id={id(k)} err={err} k={k} />
    </div>
  );
  // The seat holder picker owns its input, so its error state is set here.
  const opInvalid = err?.key === "operator";
  useEffect(() => {
    const el = document.getElementById("tp-ef-operator");
    if (!el || el.closest(".tp-seat") === null) return;
    if (opInvalid) {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", "tp-ef-operator-err");
    } else {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    }
  }, [opInvalid]);
  const emptyLine = mine ? "Pick the function or type your title to add this seat." : "Fill in the function or the role to add this seat.";
  return (
    <form
      className="tp-engform"
      noValidate
      onKeyDown={onFormKey}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="am-note">
        {mine
          ? `Your seat at ${i.c.name}. Fill in what you remember and leave the rest. Each answer earns 1 credit.`
          : `A fractional seat at ${i.c.name}, one you held or one you know about. Fill in what you know and leave the rest. Each answer earns 1 credit.`}
      </p>
      <section className="am-group" aria-label="The seat">
        <h3 className="am-h3">The seat</h3>
        {picks("function", "Function", FUNCTIONS)}
        {txt("role", { label: mine ? "Your title" : undefined })}
        {picks("type", "Type", ENGAGEMENT_TYPES)}
        {picks("status", "Status", mine ? MINE_STATUSES : MEMBER_STATUSES)}
        <div className="tp-form-row">
          <Lbl text={mine && !asMe ? "Your first and last name" : "Who held the seat"} filled={!!v.operator?.trim() && !asMe} htmlFor={id("operator")} />
          {asMe ? (
            <>
              <div className="tp-seat-linked">
                <span className="tp-seat-av" style={{ background: `hsl(${hue(ui.me.name)} 45% 90%)`, color: `hsl(${hue(ui.me.name)} 45% 28%)` }}>
                  {initials(ui.me.name)}
                </span>
                <span className="tp-seat-who">
                  <b>You</b>
                  <span>It goes on Your seats when you add it</span>
                </span>
              </div>
              <p className="am-hint">Members spend 1 credit to see your name on it.</p>
            </>
          ) : mine ? (
            <>
              <input
                id={id("operator")}
                className="input"
                placeholder="First and last name"
                autoComplete="name"
                maxLength={MAX}
                enterKeyHint="next"
                value={v.operator ?? ""}
                onChange={(e) => set("operator")(e.target.value)}
                {...invalid(id("operator"), err, "operator")}
              />
              <FieldErr id={id("operator")} err={err} k="operator" />
            </>
          ) : (
            <>
              <SeatHolderInput
                id={id("operator")}
                value={v.operator ?? ""}
                memberId={draft.member}
                onChange={(x, m) => (setDraft((d) => ({ ...d, v: { ...d.v, operator: x }, member: m })), setErr(null))}
                onEnter={() => nextField(id("operator"))}
              />
              <FieldErr id={id("operator")} err={err} k="operator" />
              <p className="am-hint">Leave it empty for an open role. Members spend 1 credit to see the name.</p>
            </>
          )}
        </div>
      </section>
      <section className="am-group" aria-label={openRole ? "Pay" : "Dates and pay"}>
        <h3 className="am-h3">{openRole ? "Pay" : "Dates and pay"}</h3>
        {openRole ? (
          <p className="am-hint am-hint-up">An open role has no start, end or hiring story yet. Add the posted rate and hours if the posting gives them.</p>
        ) : (
          <>
            <div className="tp-form-2">
              <div className="tp-form-row">
                <Lbl text="Start" filled={!!v.start} />
                <MonthYear id={id("start")} label="Start" value={v.start ?? ""} onChange={set("start")} invalid={err?.key === "start"} describedBy={err?.key === "start" ? `${id("start")}-err` : undefined} />
                <FieldErr id={id("start")} err={err} k="start" />
              </div>
              <div className="tp-form-row">
                <Lbl text="End" filled={!!v.end} />
                <div className="tp-month">
                  <MonthYear
                    id={id("end")}
                    label="End"
                    value={v.end === "Ongoing" ? "" : v.end ?? ""}
                    disabled={v.end === "Ongoing"}
                    onChange={set("end")}
                    invalid={err?.key === "end"}
                    describedBy={err?.key === "end" ? `${id("end")}-err` : undefined}
                  />
                  <button type="button" aria-pressed={v.end === "Ongoing"} className={`chip tp-chipbtn${v.end === "Ongoing" ? " chip-on" : ""}`} onClick={() => set("end")(v.end === "Ongoing" ? "" : "Ongoing")}>
                    Ongoing
                  </button>
                </div>
                <FieldErr id={id("end")} err={err} k="end" />
              </div>
            </div>
            <p className="am-hint am-hint-up">{v.status === "Active" ? "An active seat has no end month yet, so pick Ongoing." : "The year is enough if you don't know the month."}</p>
          </>
        )}
        {picks("pricing", "Pricing model", PRICING_MODELS)}
        <div className="tp-form-2">
          {txt("rate", {
            label: openRole ? "Posted rate" : undefined,
            hint: mine ? undefined : "Members spend 1 credit to see it. It never says who added it.",
          })}
          {txt("hours", { type: "number", label: openRole ? "Posted hours a week" : undefined, last: true })}
        </div>
        {mine && v.rate?.trim() && (
          <RateWho value={draft.who} onChange={(w) => (setDraft((d) => ({ ...d, who: w })), setErr((e) => (e?.key === "rate" ? null : e)))} disabled={busy} />
        )}
      </section>
      {!openRole && (
        <section className="am-group" aria-label="How it came about">
          <h3 className="am-h3">How it came about</h3>
          {picks("reason", "Why they hired", reasonsFor(v.function, HIRE_REASONS))}
          {picks("sourced", "How it was sourced", SOURCED_VIA)}
        </section>
      )}
      <div className="tp-modal-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !filled.length}>
          {busy ? "Adding" : "Add this seat"}
        </button>
        <EarnLine n={answers} err={err} empty={emptyLine} />
      </div>
    </form>
  );
}

const PERSON_ORDER = ["name", "title", "relationship", "email", "linkedin", "phone"] as const;

export interface PersonDraft {
  v: Record<string, string>;
  seat: string;
}

function PersonForm({ i, onDone, draft, setDraft }: { i: CoInfo; onDone: (s: Sent) => void; draft: PersonDraft; setDraft: Dispatch<SetStateAction<PersonDraft>> }) {
  const ui = useUi();
  const v = draft.v;
  const [err, setErr] = useState<FormErr>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => (setDraft((d) => ({ ...d, v: { ...d.v, [k]: x } })), setErr(null));
  const filled = PERSON_ORDER.filter((k) => v[k]?.trim());
  const fail = (e: FormErr) => {
    setErr(e);
    if (e?.key) focusField(`tp-pf-${e.key}`);
  };
  const submit = async () => {
    if (busy) return;
    if (!v.name?.trim()) return fail({ key: "name", text: "Add the person's name." });
    const person: Record<string, string> = {};
    for (const k of filled) {
      const { error, value } = cleanValue(fieldDef("contact", k)!, v[k]);
      if (error) return fail({ key: k, text: error });
      person[k] = value!;
    }
    setErr(null);
    setBusy(true);
    const before = ui.me.credits;
    const r = await ui.act({ type: "addPerson", companyId: i.c.id, engagementId: draft.seat || null, person }, { quiet: true });
    setBusy(false);
    if (!r.ok) return fail(fromServer(r.message, "contact", PERSON_ORDER));
    setDraft((d) => ({ ...d, v: {} }));
    onDone({ n: filled.length, before, message: r.message, capped: !!r.capped });
  };
  const seatLabel = (e: CoInfo["engs"][number]) => {
    const fn = shown(e.cells.function);
    const role = shown(e.cells.role);
    const start = shown(e.cells.start);
    return [role ?? (fn ? `${fn} seat` : "Seat"), start ? fmtMonth(start) : null].filter(Boolean).join(", ");
  };
  const txt = (k: string, o: { mono?: boolean; type?: string; mode?: "url" | "email" | "tel"; last?: boolean } = {}) => {
    const f = fieldDef("contact", k)!;
    const id = `tp-pf-${k}`;
    return (
      <div className="tp-form-row">
        <Lbl text={f.label} filled={!!v[k]?.trim()} htmlFor={id} />
        <input
          id={id}
          className={`input${o.mono ? " mono" : ""}`}
          type={o.type ?? "text"}
          inputMode={o.mode}
          // These are someone else's details: the browser should not offer the member's own.
          autoComplete="off"
          autoCapitalize={o.mono ? "none" : undefined}
          autoCorrect={o.mono ? "off" : undefined}
          spellCheck={o.mono ? false : undefined}
          maxLength={MAX}
          enterKeyHint={o.last ? "done" : "next"}
          placeholder={f.placeholder ?? ""}
          value={v[k] ?? ""}
          onChange={(e) => set(k)(e.target.value)}
          {...invalid(id, err, k)}
        />
        <FieldErr id={id} err={err} k={k} />
      </div>
    );
  };
  return (
    <form
      className="tp-engform"
      noValidate
      onKeyDown={onFormKey}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="am-note">
        Add someone at {i.c.name} a fractional would want to know, like the person who hires or who a seat reported to. Members spend 1 credit to see the name, and 1 more for each contact detail.
        Each answer earns 1 credit.
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
        {txt("email", { mono: true, type: "email", mode: "email" })}
        {txt("linkedin", { mono: true, mode: "url" })}
      </div>
      <div className="tp-form-2">{txt("phone", { type: "tel", mode: "tel", last: true })}</div>
      {i.engs.length > 0 && (
        <div className="tp-form-row">
          <label className="tp-lbl" htmlFor="tp-pf-seat">
            They belong to
          </label>
          <select id="tp-pf-seat" className="select" value={draft.seat} onChange={(e) => setDraft((d) => ({ ...d, seat: e.target.value }))}>
            <option value="">The company, as a decision maker</option>
            {i.engs.map((e) => (
              <option key={e.id} value={e.id}>
                {seatLabel(e)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="tp-modal-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !filled.length}>
          {busy ? "Adding" : "Add this person"}
        </button>
        <EarnLine n={filled.length} err={err} empty="Start with their name. Each answer earns 1 credit." />
      </div>
    </form>
  );
}

/* ---------- discarding a half-filled form ---------- */

/** "Discard this seat?" over the form. Keep editing is the default (focused, Esc, a click beside it). */
function DiscardAsk({ what, onKeep, onDiscard }: { what: string; onKeep: () => void; onDiscard: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return createPortal(
    <div className="am-ask-wrap" onMouseDown={(e) => e.target === e.currentTarget && onKeep()}>
      <div
        ref={boxRef}
        className="am-ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}h`}
        aria-describedby={`${id}p`}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || !boxRef.current) return;
          const els = [...boxRef.current.querySelectorAll<HTMLElement>("button")];
          const first = els[0];
          const last = els[els.length - 1];
          if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
          else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
        }}
      >
        <h3 className="am-ask-h" id={`${id}h`}>
          Discard {what}?
        </h3>
        <p className="am-ask-p" id={`${id}p`}>
          What you typed isn&apos;t saved yet.
        </p>
        <div className="am-ask-acts">
          <button ref={keepRef} type="button" className="btn btn-pine" onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="btn" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- the modal ---------- */

/** What was just added, for the last screen. */
interface Done extends Sent {
  what: "seat" | "person";
}

/** The server's first sentence repeats the heading ("Added a seat at Acme."), so the panel leaves it out. */
const restOf = (message: string, company: string) => {
  const n = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(`^(Added (a seat at |.*? at )?${n}\\.|${n} was already on Trading Post, so we added what you know to it\\.|That seat is already on file\\.)\\s*`);
  return message.replace(head, "").trim();
};

/** Facts a member can only see after paying (status and the posting of a closed role are free, so they don't count). */
const PAID_SEAT = ["role", "operator", "end", "sourced", "rate"];
const PAID_PERSON = ["name", "email", "phone", "linkedin"];
const paidCell = (c: Cell | undefined) => c?.s === "value" && !c.mine && !c.system && c.from !== "posting";
/** The member paid to see something at this company (a hidden company they unlocked, a seat holder, a contact). */
const paidHere = (x: CoInfo) =>
  !!(x.c as { unlocked?: boolean }).unlocked ||
  x.engs.some((e) => !e.yours && PAID_SEAT.some((f) => paidCell(e.cells[f]))) ||
  x.people.some(({ p }) => PAID_PERSON.some((f) => paidCell(p.cells[f])));

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The open Add form's answer to the back gesture: true when it kept the gesture (something is
 * typed, so it put the history entry back and asks first). The listener is added when this
 * module loads, so it runs before the app's own popstate listener, which closes the top
 * overlay (TradingPost registers it when it mounts).
 */
let backGuard: (() => boolean) | null = null;
if (typeof window !== "undefined")
  window.addEventListener("popstate", (e) => {
    if (backGuard?.()) e.stopImmediatePropagation();
  });

export function AddModal({ infos, opts, onClose }: { infos: CoInfo[]; opts: AddOpts; onClose: () => void }) {
  const ui = useUi();
  const [selected, setSelected] = useState<string | null>(opts.companyId ?? null);
  const [q, setQ] = useState(opts.query ?? "");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<AddMode>(opts.mode ?? "engagement");
  const [done, setDone] = useState<Done | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  // The forms' drafts live here, so a switch between "A seat" and "A person" keeps both.
  const [seat, setSeat] = useState<SeatDraft>(emptySeat);
  const [person, setPerson] = useState<PersonDraft>({ v: {}, seat: opts.engagementId ?? "" });
  const [coDirty, setCoDirty] = useState(false);
  const [ask, setAsk] = useState<null | { then: () => void }>(null);
  const dq = useDebounced(q, 400);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const i = selected ? infos.find((x) => x.c.id === selected) ?? null : null;
  const me = ui.me;
  const capped = earnNote(me).capped;

  const seatDirty = Object.values(seat.v).some((x) => x?.trim());
  const personDirty = Object.values(person.v).some((x) => x?.trim());
  const dirty = !done && (seatDirty || personDirty || coDirty);
  const what = coDirty && !i ? "this company" : mode === "person" && personDirty ? "this person" : seatDirty ? (opts.mine ? "your seat" : "this seat") : personDirty ? "this person" : "what you typed";
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const askRef = useRef(ask);
  askRef.current = ask;

  /** Close, or ask first when something typed would be lost. `then` runs instead of closing (to open a company). */
  const leave = useCallback(
    (then: () => void = onClose) => {
      if (dirtyRef.current) setAsk({ then });
      else then();
    },
    [onClose],
  );
  const onCoDirty = useCallback((x: boolean) => setCoDirty(x), []);

  // The control that opened Add, read before anything here takes focus.
  const [opener] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    // The page behind is out of reach while Add is open (keyboard, screen readers, clicks).
    const app = document.querySelector<HTMLElement>(".tp-app");
    const wasInert = !!app?.hasAttribute("inert");
    if (app && !wasInert) app.setAttribute("inert", "");
    return () => {
      if (app && !wasInert) app.removeAttribute("inert");
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  // Esc asks first when something is typed (and steps back out of the question when it is up).
  // It runs before the app's own Esc, which would close Add at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (askRef.current) {
        e.stopPropagation();
        e.preventDefault();
        setAsk(null);
        return;
      }
      if (!dirtyRef.current) return;
      const t = e.target as Node | null;
      const dialog = rootRef.current?.closest('[role="dialog"]');
      // Another layer on top (the fact editor, a popover) takes its own Esc.
      if (t && t !== document.body && !dialog?.contains(t)) return;
      e.stopPropagation();
      e.preventDefault();
      setAsk({ then: onClose });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // The back gesture (phones) or Back (desktop) asks first too: the history entry is put back.
  const entry = useRef<{ state: unknown; url: string } | null>(null);
  useEffect(() => {
    if (dirty) entry.current = { state: window.history.state, url: window.location.href };
  }, [dirty]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    backGuard = () => {
      if (!dirtyRef.current || !entry.current) return false;
      window.history.pushState(entry.current.state, "", entry.current.url);
      setAsk({ then: () => closeRef.current() });
      return true;
    };
    // Leaving the page (a reload, or Back past the app) gets the browser's own question.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      backGuard = null;
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  // Focus lands on the first thing to do: the tab or the first answer once a company is picked,
  // the next step after a save. (With no company yet, the search field has autoFocus.)
  useEffect(() => {
    if (!i) return;
    const t = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const el = done ? root.querySelector<HTMLElement>(".am-next-b") : root.querySelector<HTMLElement>(".tp-seg-b.on") ?? root.querySelector<HTMLElement>(".tp-engform button.tp-chipbtn, .tp-engform input");
      el?.focus({ preventScroll: !done });
      if (done) root.querySelector(".tp-done-panel")?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, !!done]);

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
  // With an empty search: companies the member follows or unlocked that still have gaps. None, no list:
  // a stranger's company is not something they know.
  const suggestions = useMemo(
    () =>
      infos
        .filter((x) => !x.c.hidden && x.c.facts.missing > 0 && (x.c.following || paidHere(x)))
        .sort((a, b) => Number(b.c.following) - Number(a.c.following) || b.c.facts.missing - a.c.facts.missing)
        .slice(0, 5),
    [infos],
  );
  const allFollowed = suggestions.every((s) => s.c.following);
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
    ? `You've earned today's ${me.earnCap} credits. What you add still saves, and you can earn again ${atTime(me.earnResetsAt)}.`
    : "You earn 1 credit for each thing you add that we don't have yet.";

  const gained = done ? me.credits - done.before : 0;
  // Nothing went in: no credit, not because of the daily limit, and the server did not say it added anything.
  const nothingNew = !!done && done.what === "seat" && gained <= 0 && !done.capped && !/^Added |so we added/.test(done.message) && !done.bench?.ok;
  const doneLine = (d: Done, company: string) => {
    const rest = restOf(d.message, company);
    const now = gained > 0 ? ` You have ${me.credits} now.` : "";
    if (rest) return `${rest}${now}`;
    if (gained > 0) return `You earned ${plural(gained, "credit")}.${now}`;
    if (d.capped) return `${plural(d.n, "answer")} saved. No credit this time, because you've already earned today's ${me.earnCap}.`;
    return `${plural(d.n, "answer")} saved.`;
  };
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
              maxLength={MAX}
              autoComplete="off"
              autoCapitalize="none"
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
              <div className="tp-sublabel">{allFollowed ? "Companies you follow with something missing" : "Companies you follow or unlocked with something missing"}</div>
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
                    <IconCheck size={13} /> We already have {lookup.existing.name}. Add what you know to it, so everything about the company stays in one place.
                  </p>
                  <div className="tp-exists-acts">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => pick(lookup.existing!.id)}>
                      Add to {lookup.existing.name.length > 22 ? "it" : lookup.existing.name}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => leave(() => (ui.openCompany(lookup.existing!.id), onClose()))}>
                      Open the company
                    </button>
                  </div>
                </div>
              )}
              {lookup && !lookup.error && !lookup.existing && <NewCompany initialName={q} lookup={lookup} onAdded={pick} onDirty={onCoDirty} />}
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
          {creating && !domainish && <NewCompany initialName={q.trim()} lookup={null} onAdded={pick} onDirty={onCoDirty} />}
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
            {/* What is typed stays: it shows under the company picked next. */}
            <button type="button" className="tp-tbtn am-change" onClick={() => (setSelected(null), setDone(null), setTimeout(() => inputRef.current?.focus()))}>
              Change company
            </button>
          </div>
          {done ? (
            <div className="tp-done-panel">
              <div className={`tp-done${nothingNew ? " am-done-same" : ""}`} role="status">
                <span className="am-done-check" aria-hidden>
                  <IconCheck size={13} />
                </span>
                <span className="am-done-t">
                  <b>
                    {done.what === "person"
                      ? `Person added at ${i.c.name}`
                      : nothingNew
                        ? "That seat is already on file"
                        : opts.mine
                          ? `Your seat at ${i.c.name} is added`
                          : `Seat added at ${i.c.name}`}
                  </b>
                  <span>{doneLine(done, i.c.name)}</span>
                  {nothingNew && <span>Open the company to confirm what&apos;s there, or report what&apos;s wrong.</span>}
                  {done.bench && <span className={done.bench.ok ? undefined : "am-done-warn"}>{done.bench.ok ? done.bench.message || "Your rate is in the benchmarks only. It is never shown with your name or the seat." : `Your rate didn't go in. ${done.bench.message}`}</span>}
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
                  Open the company
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : opts.mine ? (
            <EngagementForm i={i} mine draft={seat} setDraft={setSeat} onDone={(s) => setDone({ ...s, what: "seat" })} />
          ) : (
            <>
              <div className="tp-seg" role="tablist" aria-label="What to add">
                {(
                  [
                    ["engagement", seatDirty && mode !== "engagement" ? "A seat (draft)" : "A seat"],
                    ["person", personDirty && mode !== "person" ? "A person (draft)" : "A person"],
                    ...(missingCo ? ([["facts", ui.layout === "phone" ? `Company (${missingCo})` : `Company details (${missingCo})`]] as const) : []),
                  ] as [AddMode, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tp-seg-b${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === "engagement" && <EngagementForm i={i} draft={seat} setDraft={setSeat} onDone={(s) => setDone({ ...s, what: "seat" })} />}
              {mode === "person" && <PersonForm i={i} draft={person} setDraft={setPerson} onDone={(s) => setDone({ ...s, what: "person" })} />}
              {mode === "facts" && (missingCo ? <MissingFacts i={i} /> : <p className="am-note">Every company detail is filled in.</p>)}
            </>
          )}
        </div>
      )}
    </>
  );

  const title = opts.mine ? "Add a seat you held" : "Add what you know";
  const asking = ask && (
    <DiscardAsk
      what={what}
      onKeep={() => {
        setAsk(null);
        requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[aria-invalid=true], input.input, .tp-find-input input")?.focus({ preventScroll: true }));
      }}
      onDiscard={() => {
        const then = ask.then;
        setAsk(null);
        dirtyRef.current = false;
        then();
      }}
    />
  );
  if (ui.layout === "phone")
    return (
      <>
        <Sheet title={title} onClose={() => leave()} full>
          <div ref={rootRef} className="am-root">
            {body}
          </div>
        </Sheet>
        {asking}
      </>
    );
  return (
    <>
      {createPortal(
        <div className="tp-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && leave()}>
          <div
            className="tp-modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={(e) => {
              // Tab stays inside the dialog.
              if (e.key !== "Tab") return;
              const els = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
              if (!els.length) return;
              const first = els[0];
              const last = els[els.length - 1];
              if (e.shiftKey && (document.activeElement === first || !e.currentTarget.contains(document.activeElement))) (e.preventDefault(), last.focus());
              else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
            }}
          >
            <div className="tp-modal-head">
              <h2 className="tp-modal-title">{title}</h2>
              <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Close (Esc)" onClick={() => leave()}>
                <IconX />
              </button>
            </div>
            <div className="tp-modal-body" ref={rootRef}>
              {body}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {asking}
    </>
  );
}
