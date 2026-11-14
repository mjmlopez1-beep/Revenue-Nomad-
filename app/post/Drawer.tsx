"use client";

/**
 * The record drawer (440px, right) and its phone twin (full-screen sheet with a sticky
 * action bar). Everything about one company: header, actions, about, functions, every
 * engagement, people, and the missing facts to add.
 */
import { useEffect, useRef, useState } from "react";
import type { Cell, EngagementRec, PersonRec } from "@/lib/tableTypes";
import { RELATIONSHIPS, SOURCE_LABEL, cleanValue, fieldDef, type Entity } from "@/lib/tableFields";
import {
  AddPill, CompanyLogo, IconCheck, IconChevron, IconExternal, IconPlus, IconStar, IconX, fmtMonth, hrefFor, timeAgo, val,
} from "../ui/shared";
import { COMPANY_FILL, ENG_FIELDS, cellKey, fitReason, lockedInEngagement, lockedOf, shown, type CoInfo, type FactRef } from "./model";
import { FactCell, earnNote, shortLabel, useUi } from "./ui";
import { Fit } from "./Tables";
import { plural } from "./hooks";

/* ---------- small pieces ---------- */

function Meta({ t, cell }: { t: FactRef; cell: Cell }) {
  const ui = useUi();
  const [reporting, setReporting] = useState(false);
  if (cell.s === "locked")
    return cell.ver > 0 ? (
      <span className="tp-ver mono" title={`Confirmed by ${plural(cell.ver, "member")}`}>
        <IconCheck size={11} /> {cell.ver}
      </span>
    ) : null;
  if (cell.s !== "value" || cell.system) return null;
  const canCheck = !cell.mine;
  return (
    <span className="tp-meta">
      {cell.ver > 0 && (
        <span className="tp-ver mono" title={`Confirmed by ${plural(cell.ver, "member")}`}>
          <IconCheck size={11} /> {cell.ver}
        </span>
      )}
      {cell.mine && <span className="tp-yours">Yours</span>}
      {canCheck && !reporting && (
        <span className="tp-meta-acts">
          {cell.iv ? (
            <span className="tp-yours">You confirmed</span>
          ) : (
            <button type="button" className="tp-tbtn" onClick={() => ui.act({ type: "verify", ...t })}>
              Confirm
            </button>
          )}
          <button type="button" className="tp-tbtn" onClick={() => setReporting(true)}>
            Report
          </button>
        </span>
      )}
      {reporting && (
        <span className="tp-meta-acts on">
          <span className="tp-small">Hide it for review?</span>
          <button type="button" className="tp-tbtn tp-tbtn-red" onClick={() => (ui.act({ type: "report", ...t }), setReporting(false))}>
            Report
          </button>
          <button type="button" className="tp-tbtn" onClick={() => setReporting(false)}>
            Cancel
          </button>
        </span>
      )}
    </span>
  );
}

function FieldRow({ t, cell, label }: { t: FactRef; cell: Cell; label: string }) {
  return (
    <div className="tp-frow">
      <span className="tp-frow-l">{label}</span>
      <span className="tp-frow-v">
        <FactCell t={t} cell={cell} />
      </span>
      <Meta t={t} cell={cell} />
    </div>
  );
}

/** Known and locked fields as a list; the empty ones as a compact row of add pills. */
function FieldList({ entity, id, cells, fields }: { entity: Entity; id: string; cells: Record<string, Cell>; fields: string[] }) {
  const ui = useUi();
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  const present = fields.filter((f) => cells[f] && cells[f].s !== "empty");
  const empty = fields.filter((f) => cells[f]?.s === "empty");
  return (
    <>
      {present.length > 0 && (
        <div className="tp-flist-d">
          {present.map((f) => (
            <FieldRow key={f} t={{ entity, id, field: f }} cell={cells[f]} label={shortLabel(fieldDef(entity, f)!)} />
          ))}
        </div>
      )}
      {empty.length > 0 && (
        <div className="tp-missing-row">
          {empty.map((f) => (
            <span key={f} ref={(el) => void (refs.current[f] = el)} data-cell={cellKey(id, f)} className={ui.pulse === cellKey(id, f) ? "tp-pulse" : ""}>
              <AddPill label={shortLabel(fieldDef(entity, f)!)} onAdd={() => refs.current[f] && ui.edit(refs.current[f]!, { entity, id, field: f })} />
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function UnlockAll({ items, label, small }: { items: FactRef[]; label?: (n: number) => string; small?: boolean }) {
  const ui = useUi();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = items.length;
  if (!n) return null;
  const short = ui.me.credits < n;
  const run = async () => {
    if (n > 10 && !confirm) return setConfirm(true);
    setBusy(true);
    await ui.unlockMany(items);
    setBusy(false);
    setConfirm(false);
  };
  const text = confirm ? `Spend ${n} credits` : label ? label(n) : `Unlock all (${n} credit${n > 1 ? "s" : ""})`;
  return (
    <span className="tp-unlockall">
      <button
        type="button"
        className={`btn btn-pine${small ? " btn-sm" : ""}`}
        disabled={busy || short}
        title={short ? `You have ${ui.me.credits} credits. Add facts to earn more.` : `${n} locked fact${n > 1 ? "s" : ""}, 1 credit each`}
        onClick={run}
      >
        {busy ? "Unlocking" : text}
      </button>
      {confirm && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      )}
    </span>
  );
}

/* ---------- people ---------- */

function PersonCard({ p }: { p: PersonRec }) {
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  const title = val(p.cells.title);
  const rel = val(p.cells.relationship);
  const locked = lockedOf("contact", p.id, p.cells);
  return (
    <div className="tp-person" id={`tp-d-${p.id}`}>
      <div className="tp-person-top">
        <span className="tp-person-title">{title ?? <FactCell t={t("title")} cell={p.cells.title} addLabel="Title" />}</span>
        {rel ? <span className="chip">{rel}</span> : <FactCell t={t("relationship")} cell={p.cells.relationship} addLabel="Relationship" />}
        {locked.length > 1 && <UnlockAll items={locked} small label={(n) => `Unlock all (${n})`} />}
      </div>
      <FieldList entity="contact" id={p.id} cells={p.cells} fields={["name", "email", "linkedin", "phone"]} />
    </div>
  );
}

function AddPersonForm({ companyId, engagementId, onDone }: { companyId: string; engagementId: string | null; onDone: () => void }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const filled = Object.values(v).filter((x) => x.trim()).length;
  const submit = async () => {
    if (!v.name?.trim()) return setErr("Add the person's name.");
    for (const [k, x] of Object.entries(v)) {
      if (!x.trim()) continue;
      const { error } = cleanValue(fieldDef("contact", k)!, x);
      if (error) return setErr(`${fieldDef("contact", k)!.label}. ${error}`);
    }
    setBusy(true);
    const r = await ui.act({ type: "addPerson", companyId, engagementId, person: v });
    setBusy(false);
    if (r.ok) onDone();
  };
  const fld = (k: string) => fieldDef("contact", k)!;
  return (
    <form
      className="tp-pform"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tp-pform-grid">
        <label>
          <span className="tp-lbl">Name</span>
          <input className="input" autoFocus placeholder={fld("name").placeholder} value={v.name ?? ""} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Title</span>
          <input className="input" placeholder={fld("title").placeholder} value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Email</span>
          <input className="input mono" type="email" placeholder={fld("email").placeholder} value={v.email ?? ""} onChange={(e) => set("email")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">LinkedIn</span>
          <input className="input mono" placeholder={fld("linkedin").placeholder} value={v.linkedin ?? ""} onChange={(e) => set("linkedin")(e.target.value)} />
        </label>
      </div>
      <span className="tp-lbl">Relationship</span>
      <div className="tp-chips">
        {RELATIONSHIPS.map((o) => (
          <button key={o} type="button" className={`chip tp-chipbtn${v.relationship === o ? " chip-on" : ""}`} onClick={() => set("relationship")(v.relationship === o ? "" : o)}>
            {o}
          </button>
        ))}
      </div>
      {err && <p className="tp-ed-err">{err}</p>}
      <div className="tp-pform-foot">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          Add person {filled > 0 && <span className="mono">+{filled}</span>}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------- engagements ---------- */

function EngagementCard({ e, company, companyId, focus }: { e: EngagementRec; company: string; companyId: string; focus: boolean }) {
  const [adding, setAdding] = useState(false);
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const fn = e.cells.function;
  const type = e.cells.type;
  const op = shown(e.cells.operator);
  const role = shown(e.cells.role);
  const locked = lockedInEngagement(e);
  const start = shown(e.cells.start);
  const subject = op ? `Intro to ${op} about ${company}` : "";
  const body = op
    ? `Hi,\n\nCould you introduce me to ${op}? They held ${role ? `the ${role} seat` : "a fractional seat"} at ${company} and I would like to hear how it went.\n\nThanks`
    : "";
  return (
    <article className={`tp-eng${focus ? " focus" : ""}`} id={`tp-d-${e.id}`}>
      <div className="tp-eng-top">
        <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>
        {e.verified && (
          <span className="tp-verified">
            <IconCheck size={11} /> Confirmed by the client
          </span>
        )}
        {start && <span className="tp-eng-when mono">{fmtMonth(start)}</span>}
      </div>
      <div className="tp-eng-chips">
        {fn?.s === "value" ? <span className="chip tp-fn">{fn.v}</span> : <FactCell t={t("function")} cell={fn} addLabel="Function" />}
        {type?.s === "value" ? <span className="chip">{type.v}</span> : <FactCell t={t("type")} cell={type} addLabel="Type" />}
        {locked.length > 1 && (
          <span className="tp-eng-unlock">
            <UnlockAll items={locked} small label={(n) => `Unlock all (${n})`} />
          </span>
        )}
      </div>
      <FieldList entity="engagement" id={e.id} cells={e.cells} fields={ENG_FIELDS} />
      {e.people.length > 0 && (
        <div className="tp-eng-people">
          <div className="tp-sublabel">People on this seat</div>
          {e.people.map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {adding ? (
        <AddPersonForm companyId={companyId} engagementId={e.id} onDone={() => setAdding(false)} />
      ) : (
        <div className="tp-eng-foot">
          <button type="button" className="tp-tbtn tp-tbtn-strong" onClick={() => setAdding(true)}>
            <IconPlus size={12} /> person
          </button>
          {op && (
            <a className="tp-intro" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              Ask for an intro <IconExternal size={11} />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- missing company facts ---------- */

function InlineFact({ t, onSaved }: { t: FactRef; onSaved?: () => void }) {
  const ui = useUi();
  const f = fieldDef(t.entity, t.field)!;
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async (raw: string) => {
    if (!raw.trim()) return;
    const { error, value } = cleanValue(f, raw);
    if (error) return setErr(error);
    setErr(null);
    const ok = await ui.fill(t, value!);
    if (ok) onSaved?.();
  };
  const id = `tp-if-${t.id}-${t.field}`;
  return (
    <div className="tp-ifact" data-cell={cellKey(t.id, t.field)}>
      <label className="tp-ifact-l" htmlFor={id}>
        {f.label}
      </label>
      {f.kind === "choice" ? (
        <select id={id} className="select" value="" onChange={(e) => save(e.target.value)}>
          <option value="">Pick one</option>
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={`input${f.kind === "text" ? "" : " mono"}`}
          placeholder={f.placeholder ?? ""}
          value={v}
          onChange={(e) => (setV(e.target.value), setErr(null))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(v);
            } else if (e.key === "Tab" && !e.shiftKey && v.trim()) save(v);
          }}
        />
      )}
      <span className="tp-plus1 mono">+1</span>
      {err && <span className="tp-ed-err tp-ifact-err">{err}</span>}
    </div>
  );
}

export function MissingFacts({ i, title = true, skip = [] }: { i: CoInfo; title?: boolean; skip?: string[] }) {
  const ui = useUi();
  const fields = COMPANY_FILL.filter((f) => i.c.cells[f]?.s === "empty" && !skip.includes(f));
  if (!fields.length) return null;
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const earn = earnNote(ui.me);
  const n = Math.min(fields.length, room);
  return (
    <section className="tp-dsec">
      {title && (
        <h3 className="tp-dsec-h">
          {earn.capped ? "Missing company facts" : `Add these and earn up to ${plural(n, "credit")}`}
        </h3>
      )}
      {earn.capped && <p className="tp-small muted">You hit today&apos;s {ui.me.earnCap}. Facts you add still count when others confirm them.</p>}
      <div className="tp-ifacts">
        {fields.map((f) => (
          <InlineFact key={f} t={{ entity: "company", id: i.c.id, field: f }} />
        ))}
      </div>
    </section>
  );
}

/* ---------- the drawer ---------- */

export function Drawer({
  i,
  focus,
  onClose,
  onStep,
  pos,
  phone,
}: {
  i: CoInfo;
  focus: string | null;
  onClose: () => void;
  onStep: (d: 1 | -1) => void;
  pos: { n: number; of: number } | null;
  phone: boolean;
}) {
  const ui = useUi();
  const c = i.c;
  const scroller = useRef<HTMLDivElement>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  useEffect(() => {
    setAddingPerson(false);
    if (focus) {
      const el = document.getElementById(`tp-d-${focus}`);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
    }
    scroller.current?.scrollTo({ top: 0 });
  }, [c.id, focus]);
  const website = val(c.cells.website);
  const linkedin = val(c.cells.linkedin);
  const about = val(c.cells.about);
  const line = ["industry", "employees", "revenue", "hq"].map((k) => val(c.cells[k])).filter(Boolean) as string[];
  const fnCounts = new Map<string, number>();
  for (const e of i.engs) {
    const fn = shown(e.cells.function);
    if (fn) fnCounts.set(fn, (fnCounts.get(fn) ?? 0) + 1);
  }
  for (const fn of i.fns) if (!fnCounts.has(fn)) fnCounts.set(fn, 1);
  const mine = ui.me.function;
  const fnList = [...fnCounts.entries()].sort((a, b) => (a[0] === mine ? -1 : b[0] === mine ? 1 : b[1] - a[1]));
  const sources = [...new Set(i.engs.map((e) => SOURCE_LABEL[e.source] ?? e.source))];
  const follow = () => ui.act({ type: "follow", companyId: c.id, on: !c.following });

  const actions = (
    <div className="tp-dactions">
      <UnlockAll items={i.locked} />
      <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ companyId: c.id })}>
        <IconPlus size={14} /> Add what you know
      </button>
    </div>
  );
  const followBtn = (
    <button type="button" className={`btn btn-sm tp-followbtn${c.following ? " tp-following" : ""}`} onClick={follow} aria-pressed={c.following}>
      <IconStar size={13} filled={c.following} /> {c.following ? "Following" : "Follow"}
    </button>
  );

  return (
    <div className={phone ? "tp-rsheet" : "tp-drawer"} role="dialog" aria-modal={phone} aria-label={c.name}>
      <div className="tp-dbar">
        {phone ? (
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Back" onClick={onClose}>
            <IconChevron dir="left" size={18} />
          </button>
        ) : (
          <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Close (Esc)" onClick={onClose}>
            <IconX />
          </button>
        )}
        {pos && (
          <span className="tp-dpos mono">
            {pos.n} of {pos.of}
          </span>
        )}
        <span className="tp-dbar-sp" />
        {!phone && <span className="tp-dkeys">J K to move</span>}
        {phone && followBtn}
        <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Previous record (K)" onClick={() => onStep(-1)}>
          <IconChevron dir="up" />
        </button>
        <button type="button" className="tp-iconbtn tp-iconbtn-dark" aria-label="Next record (J)" onClick={() => onStep(1)}>
          <IconChevron dir="down" />
        </button>
      </div>
      <div className="tp-dscroll" ref={scroller}>
        <header className="tp-dhead">
          <CompanyLogo name={c.name} domain={c.iconDomain ?? i.domain} size="lg" />
          <div className="tp-dhead-t">
            <h2 className="tp-dname">{c.name}</h2>
            <div className="tp-dlinks">
              {website ? (
                <a className="tp-link mono" href={hrefFor("company", "website", website)!} target="_blank" rel="noreferrer">
                  {website.replace(/^www\./, "")}
                </a>
              ) : (
                <FactCell t={{ entity: "company", id: c.id, field: "website" }} cell={c.cells.website} addLabel="Website" />
              )}
              {linkedin ? (
                <a className="tp-link" href={hrefFor("company", "linkedin", linkedin)!} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              ) : (
                <FactCell t={{ entity: "company", id: c.id, field: "linkedin" }} cell={c.cells.linkedin} addLabel="LinkedIn" />
              )}
            </div>
          </div>
          {!phone && followBtn}
        </header>
        <div className={`tp-dline${line.length ? " mono" : " tp-dline-empty"}`}>{line.length ? line.join(" · ") : "Industry, size and HQ not on file yet"}</div>
        <div className="tp-dfit">
          <Fit i={i} big />
          <span className="tp-dfit-r">{fitReason(i)}</span>
        </div>
        {!phone && actions}
        {about && (
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">About</h3>
            <p className="tp-about">{about}</p>
          </section>
        )}
        {fnList.length > 0 && (
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">Functions hired</h3>
            <div className="tp-chips">
              {fnList.map(([fn, n]) => (
                <span key={fn} className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}`}>
                  {fn} <span className="mono tp-cnt">{n}</span>
                </span>
              ))}
              {mine && !fnCounts.has(mine) && (
                <span className="chip tp-fn-mine" title={`No ${mine} seat on file here yet`}>
                  {mine}?
                </span>
              )}
            </div>
            {mine && !fnCounts.has(mine) && <p className="tp-small muted tp-mt6">No {mine} seat on file here yet. They hired other GTM functions, so {mine} may be next.</p>}
          </section>
        )}
        <section className="tp-dsec">
          <h3 className="tp-dsec-h">
            Engagements <span className="mono tp-cnt">{i.engs.length}</span>
          </h3>
          {i.engs.length === 0 && <p className="tp-small muted">No one has added an engagement here yet. Be first and earn up to 10 credits.</p>}
          {i.engs.map((e) => (
            <EngagementCard key={e.id} e={e} company={c.name} companyId={c.id} focus={focus === e.id} />
          ))}
          <button type="button" className="btn btn-sm tp-addeng" onClick={() => ui.openAdd({ companyId: c.id, mode: "engagement" })}>
            <IconPlus size={13} /> engagement
          </button>
        </section>
        <section className="tp-dsec">
          <h3 className="tp-dsec-h">
            People at {c.name} <span className="mono tp-cnt">{c.people.length}</span>
          </h3>
          {c.people.length === 0 && !addingPerson && <p className="tp-small muted">No decision makers on file. Add one you know and earn a credit for each fact.</p>}
          {c.people.map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
          {addingPerson ? (
            <AddPersonForm companyId={c.id} engagementId={null} onDone={() => setAddingPerson(false)} />
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => setAddingPerson(true)}>
              <IconPlus size={13} /> person
            </button>
          )}
        </section>
        <MissingFacts i={i} skip={["website", "linkedin"]} />
        <footer className="tp-dfoot">
          {sources.length > 0 && <span>From {sources.join(", ").toLowerCase()}</span>}
          {c.updatedAt && <span>Updated {timeAgo(c.updatedAt)}</span>}
          <span>
            {c.facts.known + c.facts.locked} facts on file, {c.facts.missing} missing
          </span>
        </footer>
      </div>
      {phone && (
        <div className="tp-rsheet-bar">
          {i.locked.length > 0 ? (
            <UnlockAll items={i.locked} label={(n) => `Unlock all (${n})`} />
          ) : (
            <span className="tp-small muted">Nothing locked here</span>
          )}
          <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ companyId: c.id })}>
            <IconPlus size={14} /> Add
          </button>
        </div>
      )}
    </div>
  );
}
