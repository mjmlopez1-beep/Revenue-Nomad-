"use client";

/**
 * The record drawer (440px, right) and its phone twin (full-screen sheet with a sticky
 * action bar). Everything about one company: header, actions, about, functions, every
 * engagement, people, and the missing facts to add.
 */
import { useEffect, useRef, useState } from "react";
import type { Cell, EngagementRec, PersonRec } from "@/lib/tableTypes";
import { RELATIONSHIPS, SOURCE_LABEL, cleanValue, fieldDef, type Entity } from "@/lib/tableFields";
import { CompanyLogo, IconCheck, IconChevron, IconExternal, IconPlus, IconStar, IconX, fmtMonth, hrefFor, timeAgo, val } from "../ui/shared";
import { COMPANY_FILL, COMPANY_GTM, ENG_FIELDS, cellKey, fitReason, isOpenSeat, lockedInEngagement, lockedOf, seatMissingCount, shown, type CoInfo, type FactRef } from "./model";
import { EditPill, FactCell, Pro, YourSeat, ZeroCredits, earnNote, shortLabel, useUi } from "./ui";
import { sendSignal } from "./ProOffer";
import { Fit, HiddenCompany } from "./Tables";
import { RoleDate, statusText } from "./RoleDate";
import { plural } from "./hooks";

/** The team inbox that brokers intros (read at build time). Without it, the intro link only drafts the email. */
const INTRO_TO = process.env.NEXT_PUBLIC_RN_INTRO_EMAIL ?? "";

/* ---------- small pieces ---------- */

function Meta({ t, cell }: { t: FactRef; cell: Cell }) {
  const ui = useUi();
  const [reporting, setReporting] = useState(false);
  // Locked: nothing here. The lock pill's title already says how many confirmed it.
  if (cell.s !== "value" || cell.system) return null;
  // Their own name on their own seat is not theirs to confirm or report ("This isn't me" on Your seats unlinks it).
  const canCheck = !cell.mine && !cell.member?.you;
  return (
    <span className="tp-meta">
      {cell.ver > 0 && (
        <span className="tp-ver mono" title={`Confirmed by ${plural(cell.ver, "member")}`}>
          <IconCheck size={11} /> {cell.ver}
        </span>
      )}
      {cell.mine && <span className="tp-yours">Yours</span>}
      {cell.mine && (
        <button type="button" className="tp-tbtn" onClick={(e) => ui.edit(e.currentTarget, t, cell.v)}>
          Edit
        </button>
      )}
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
        <FactCell t={t} cell={cell} render={t.entity === "engagement" && t.field === "status" ? statusText : undefined} />
      </span>
      <Meta t={t} cell={cell} />
    </div>
  );
}

/** Empty fields people add most often come first. */
const EMPTY_FIRST = ["role", "reason", "rate", "status"];
const emptyRank = (f: string) => (EMPTY_FIRST.includes(f) ? EMPTY_FIRST.indexOf(f) : EMPTY_FIRST.length);

/**
 * Known and locked fields as a list; the empty ones as a compact row of add pills (three,
 * then "N more to add"). An open seat never asks who held it or when it ended.
 */
function FieldList({ entity, id, cells, fields, openSeat }: { entity: Entity; id: string; cells: Record<string, Cell>; fields: string[]; openSeat?: boolean }) {
  const ui = useUi();
  const present = fields.filter((f) => cells[f] && cells[f].s !== "empty");
  const empty = fields
    .filter((f) => cells[f]?.s === "empty" && !(openSeat && (f === "operator" || f === "end")) && !ui.isHidden(id))
    .sort((a, b) => emptyRank(a) - emptyRank(b));
  const pulseHidden = empty.slice(3).some((f) => ui.pulse === cellKey(id, f));
  const [more, setMore] = useState(pulseHidden);
  const all = more || pulseHidden;
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
          {(all ? empty : empty.slice(0, 3)).map((f) => (
            <EditPill key={f} fact={{ entity, id, field: f }} />
          ))}
          {empty.length > 3 && !all && (
            <button type="button" className="tp-tbtn" onClick={() => setMore(true)}>
              {empty.length - 3} more to add
            </button>
          )}
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
  // Not enough credits: say what is missing (touch screens never show a disabled button's title).
  if (ui.me.credits < n) return <span className="tp-unlockall tp-unlock-short tp-small muted">Need {plural(n - ui.me.credits, "more credit", "more credits")}</span>;
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
      <button type="button" className={`btn btn-pine${small ? " btn-sm" : ""}`} disabled={busy} title={`${n} locked fact${n > 1 ? "s" : ""}, 1 credit each`} onClick={run}>
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
        <span className="tp-person-id">
          <span className="tp-person-title">{title ?? <FactCell t={t("title")} cell={p.cells.title} addLabel="Title" />}</span>
          {rel ? <span className="chip">{rel}</span> : <FactCell t={t("relationship")} cell={p.cells.relationship} addLabel="Relationship" />}
        </span>
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
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
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
        <label>
          <span className="tp-lbl">Phone</span>
          <input className="input mono" type="tel" inputMode="tel" placeholder={fld("phone").placeholder} value={v.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} />
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
          Add person {filled > 0 && room > 0 && <span className="mono">+{Math.min(filled, room)}</span>}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------- engagements ---------- */

function EngagementCard({
  e,
  company,
  companyId,
  focus,
  hideUnlockAll,
}: {
  e: EngagementRec;
  company: string;
  companyId: string;
  focus: boolean;
  /** The drawer's own Unlock all already covers every locked fact here. */
  hideUnlockAll?: boolean;
}) {
  const ui = useUi();
  const [adding, setAdding] = useState(false);
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const fn = e.cells.function;
  const type = e.cells.type;
  const op = shown(e.cells.operator);
  const opCell = e.cells.operator;
  const opMember = opCell?.s === "value" && opCell.member && !opCell.member.you;
  const role = shown(e.cells.role);
  const locked = lockedInEngagement(e);
  const start = shown(e.cells.start);
  const toFill = e.yours ? seatMissingCount(e, ui.me) : 0;
  const subject = op ? `Intro to ${op} about ${company}` : "";
  const seat = role ? `the ${role} seat` : "a fractional seat";
  // Nobody needs an intro to themselves.
  const intro = op && !e.yours
    ? INTRO_TO
      ? `mailto:${INTRO_TO}?cc=${encodeURIComponent(ui.me.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
          `Please introduce me (${ui.me.name}) to ${op}${opMember ? " (a Trading Post member)" : ""}, who held ${seat} at ${company}.`,
        )}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
          `Hi,\n\nCould you introduce me to ${op}? They held ${seat} at ${company} and I would like to hear how it went.\n\nThanks`,
        )}`
    : null;
  return (
    <article className={`tp-eng${focus ? " focus" : ""}`} id={`tp-d-${e.id}`}>
      <div className="tp-eng-top">
        {e.opened ? <RoleDate e={e} /> : <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>}
        {e.yours && <YourSeat id={e.id} />}
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
        {locked.length > 1 && !hideUnlockAll && (
          <span className="tp-eng-unlock">
            <UnlockAll items={locked} small label={(n) => `Unlock all (${n})`} />
          </span>
        )}
      </div>
      <FieldList entity="engagement" id={e.id} cells={e.cells} fields={ENG_FIELDS} openSeat={isOpenSeat(e)} />
      {toFill > 0 && (
        <button type="button" className="ys-fill-link" onClick={() => ui.openSeats(e.id)}>
          Fill in {toFill} missing
        </button>
      )}
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
          {!ui.isHidden(e.id) && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
              <IconPlus size={13} /> Add someone on this seat
            </button>
          )}
          {intro && (
            <span className="tp-intro-w">
              <a className="tp-intro" href={intro}>
                {INTRO_TO ? "Ask for an intro" : "Draft an intro email"} <IconExternal size={11} />
              </a>
              {!INTRO_TO && <span className="tp-small muted">Send it to someone who knows them.</span>}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- missing company facts ---------- */

/** A missing company fact: the same add pill as everywhere else, opening the shared fact editor. */
function InlineFact({ t }: { t: FactRef }) {
  return <EditPill fact={t} label={fieldDef(t.entity, t.field)!.label} />;
}

export function MissingFacts({ i, title = true, skip = [] }: { i: CoInfo; title?: boolean; skip?: string[] }) {
  const ui = useUi();
  const fields = i.c.hidden ? [] : COMPANY_FILL.filter((f) => i.c.cells[f]?.s === "empty" && !skip.includes(f));
  if (!fields.length) return null;
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const earn = earnNote(ui.me);
  const n = Math.min(fields.length, room);
  const pills = (
    <div className="tp-missing-row">
      {fields.map((f) => (
        <InlineFact key={f} t={{ entity: "company", id: i.c.id, field: f }} />
      ))}
    </div>
  );
  // Without a title it sits in the drawer header, where the summary line would be.
  if (!title) return <div className="tp-dmissing">{pills}</div>;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">{earn.capped ? "Missing company facts" : `Add these and earn up to ${plural(n, "credit")}`}</h3>
      {earn.capped && <p className="tp-small muted">You hit today&apos;s {ui.me.earnCap}. Facts you add now still earn a bonus, held until your room opens, when others confirm them.</p>}
      {pills}
    </section>
  );
}

/* ---------- the drawer ---------- */

/** Unlock a hidden company for 1 credit. At 0 credits it shows how to earn one instead (and counts the wall). */
function UnlockCompany({ id, label }: { id: string; label: string }) {
  const ui = useUi();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="btn btn-primary"
        onClick={() => {
          if (ui.me.credits > 0) return ui.unlock({ entity: "company", id, field: "identity" });
          sendSignal("wall", "identity");
          setZero(true);
        }}
      >
        {label}
      </button>
      {zero && ui.me.credits <= 0 && ref.current && <ZeroCredits anchor={ref.current} id={id} onClose={() => setZero(false)} />}
    </>
  );
}

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
  const emp = val(c.cells.employees);
  const rev = val(c.cells.revenue);
  const line = [val(c.cells.industry), emp && `${emp} employees`, rev && `${rev} revenue`, val(c.cells.hq)].filter(Boolean) as string[];
  // Functions hired fractionally, the member's own first; functions only member stories mention, muted.
  const fnCounts = new Map<string, number>();
  for (const e of i.engs) {
    const fn = shown(e.cells.function);
    if (fn) fnCounts.set(fn, (fnCounts.get(fn) ?? 0) + 1);
  }
  const mine = ui.me.function;
  const hired = [...c.friendly.functions].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : (fnCounts.get(b) ?? 0) - (fnCounts.get(a) ?? 0)));
  const storyFns = i.fns.filter((f) => !c.friendly.functions.includes(f));
  const gap = !!mine && hired.length > 0 && !hired.includes(mine);
  // Where the seats came from. A role the scan found reads as a job posting, open or closed.
  const sources = [...new Set(i.engs.map((e) => (e.source === "Demand scan" ? "Job posting" : SOURCE_LABEL[e.source] ?? e.source)))];
  const follow = () => ui.act({ type: "follow", companyId: c.id, on: !c.following });

  const actions = (
    <div className="tp-dactions">
      {c.hidden ? (
        <UnlockCompany id={c.id} label="Unlock company · 1 credit" />
      ) : (
        <>
          <UnlockAll items={i.locked} />
          <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ companyId: c.id })}>
            <IconPlus size={14} /> Add what you know
          </button>
        </>
      )}
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
        {c.hidden ? (
          <header className="tp-dhead">
            <HiddenCompany i={i} big bare />
            {!phone && followBtn}
          </header>
        ) : (
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
        )}
        {c.hidden && (
          <p className="tp-hidden-note">
            This company is hiring a fractional now. Unlock it for 1 credit to see the name, website and LinkedIn. Role, rate and contacts unlock separately.
          </p>
        )}
        {line.length ? <div className="tp-dline">{line.join(" · ")}</div> : <MissingFacts i={i} title={false} skip={["website", "linkedin"]} />}
        <div className="tp-dfit">
          <Fit i={i} big />
          <span className="tp-dfit-r">{fitReason(i)}</span>
        </div>
        {!phone && actions}
        {c.hidden && (
          <div className="pro-under">
            <Pro where="hidden_company" variant="line" />
          </div>
        )}
        {about && (
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">About</h3>
            <p className="tp-about">{about}</p>
          </section>
        )}
        {(!c.hidden || COMPANY_GTM.some((f) => c.cells[f]?.s !== "empty")) && (
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">How they sell</h3>
            <FieldList entity="company" id={c.id} cells={c.cells} fields={COMPANY_GTM} />
          </section>
        )}
        {(hired.length > 0 || storyFns.length > 0) && (
          <section className="tp-dsec">
            <h3 className="tp-dsec-h">Functions hired</h3>
            <div className="tp-chips">
              {hired.map((fn) => (
                <span key={fn} className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}`}>
                  {fn} {fnCounts.get(fn) ? <span className="mono tp-cnt">{fnCounts.get(fn)}</span> : null}
                </span>
              ))}
              {storyFns.map((fn) => (
                <span key={fn} className="chip tp-fn tp-fn-story" title="From member stories">
                  {fn} {fnCounts.get(fn) ? <span className="mono tp-cnt">{fnCounts.get(fn)}</span> : null}
                </span>
              ))}
              {gap && (
                <span className="chip tp-fn-gap" title={`No ${mine} seat on file. They hired other GTM functions fractionally.`}>
                  No {mine} yet
                </span>
              )}
            </div>
            {gap && <p className="tp-small muted tp-mt6">No {mine} seat on file. They hired other GTM functions fractionally.</p>}
            {storyFns.length > 0 && <p className="tp-small muted tp-mt6">Muted ones come from member stories.</p>}
          </section>
        )}
        <section className="tp-dsec">
          <h3 className="tp-dsec-h">
            Engagements <span className="mono tp-cnt">{i.engs.length}</span>
          </h3>
          {i.engs.length === 0 && <p className="tp-small muted">No one has added an engagement here yet. Be first and earn up to 10 credits.</p>}
          {i.engs.map((e) => (
            <EngagementCard
              key={e.id}
              e={e}
              company={c.name}
              companyId={c.id}
              focus={focus === e.id}
              hideUnlockAll={lockedInEngagement(e).length === i.locked.length}
            />
          ))}
          <button type="button" className="btn btn-sm btn-ghost tp-addeng" onClick={() => ui.openAdd({ companyId: c.id, mode: "engagement" })}>
            <IconPlus size={13} /> Add engagement
          </button>
        </section>
        <section className="tp-dsec">
          <h3 className="tp-dsec-h">
            People at {c.hidden ? "this company" : c.name} <span className="mono tp-cnt">{c.people.length}</span>
          </h3>
          {c.people.length === 0 && !addingPerson && <p className="tp-small muted">No decision makers on file. Add one you know and earn a credit for each fact.</p>}
          {c.people.map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
          {addingPerson ? (
            <AddPersonForm companyId={c.id} engagementId={null} onDone={() => setAddingPerson(false)} />
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAddingPerson(true)}>
              <IconPlus size={13} /> Add decision maker
            </button>
          )}
        </section>
        {line.length > 0 && <MissingFacts i={i} skip={["website", "linkedin"]} />}
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
          <span className="tp-rsheet-bal mono muted">{plural(ui.me.credits, "credit")}</span>
          {c.hidden ? (
            // One action while the name is hidden, as on desktop. The facts unlock after it.
            <UnlockCompany id={c.id} label="Unlock company · 1 credit" />
          ) : (
            <>
              {i.locked.length > 0 ? <UnlockAll items={i.locked} label={(n) => `Unlock all (${n})`} /> : <span className="tp-small muted">Nothing locked here</span>}
              <button type="button" className="btn btn-primary" onClick={() => ui.openAdd({ companyId: c.id })}>
                <IconPlus size={14} /> Add
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
