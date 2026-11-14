"use client";

/** Building blocks for Trading Post: cells, editors, icons, sign-in, add-record form. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "@/lib/table";
import { RELATIONSHIPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, type FieldDef } from "@/lib/tableFields";

export const initials = (s: string) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const HUES = [142, 200, 265, 25, 330, 175, 45];
export const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
export const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y && mo ? new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : m;
};

export function CompanyIcon({ name, domain }: { name: string; domain: string | null }) {
  const sources = useMemo(
    () =>
      domain
        ? [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`]
        : [],
    [domain],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [domain]);
  if (idx >= sources.length)
    return (
      <span className="tt-avatar" style={{ background: `hsl(${hue(name)} 55% 92%)`, color: `hsl(${hue(name)} 45% 30%)` }}>
        {initials(name)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="tt-avatar tt-logo"
      src={sources[idx]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(e) => idx === 0 && e.currentTarget.naturalWidth <= 16 && setIdx(1)}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

/** Page numbers with gaps: 0 … 4 5 6 … 20 (-1 = gap). */
export function pageList(cur: number, pages: number): number[] {
  if (pages <= 7) return [...Array(pages).keys()];
  const sorted = [...new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < pages))].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(-1);
    out.push(p);
  });
  return out;
}

export type AddPayload = {
  company: string;
  newEngagement?: boolean;
  website: string;
  companyFields: Record<string, string>;
  engagementFields: Record<string, string>;
  people: Record<string, string>[];
};
type Person = { name: string; title: string; relationship: string; email: string; linkedin: string };
const blankPerson = (): Person => ({ name: "", title: "", relationship: "", email: "", linkedin: "" });

/**
 * Add record: company URL first. The lookup prefills the icon, name and a suggested
 * industry; revenue stage and employee count are picked from the Revenue Nomad lists
 * (as they were when you worked there). Every prefilled value is editable.
 */
export function AddRecord({
  busy,
  onAdd,
  onCancel,
  initialUrl,
  forCompany,
}: {
  busy: boolean;
  onAdd: (p: AddPayload) => void;
  onCancel: () => void;
  /** From the header box: look this URL up straight away. */
  initialUrl?: string;
  /** From a company row's "+": the company is known, just add an engagement. */
  forCompany?: { name: string; domain: string | null };
}) {
  const [url, setUrl] = useState(initialUrl ?? forCompany?.domain ?? "");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<{ domain: string; existing: { name: string } | null; description: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hq, setHq] = useState("");
  const [eng, setEng] = useState({ role: "", status: "", revenue: "", employees: "", start: "", end: "" });
  const [ongoing, setOngoing] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (forCompany) {
      setFound({ domain: forCompany.domain ?? "", existing: { name: forCompany.name }, description: null });
      setName(forCompany.name);
    } else if (initialUrl) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setE = (k: keyof typeof eng) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEng({ ...eng, [k]: e.target.value });

  const lookup = async () => {
    if (!url.trim()) return;
    setLooking(true);
    setErr(null);
    try {
      const r = await fetch(`/api/table/lookup?url=${encodeURIComponent(url)}`);
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? "Couldn't look that up.");
        return;
      }
      setFound({ domain: j.domain, existing: j.existing, description: j.description });
      setName(j.existing?.name ?? j.name ?? "");
      setIndustry(j.existing?.industry ?? j.industry ?? "");
      setHq(j.existing?.hq ?? "");
    } finally {
      setLooking(false);
    }
  };

  const submit = () =>
    onAdd({
      company: name,
      newEngagement: !!forCompany,
      website: found?.domain ?? "",
      companyFields: { industry, hq },
      engagementFields: { ...eng, end: ongoing ? "Ongoing" : eng.end },
      people: people.filter((p) => p.name.trim()).map((p) => ({ ...p })),
    });

  return (
    <div className="tt-add-rec">
      <div className="tt-add-rec-head">
        <b>{forCompany ? `Add an engagement at ${forCompany.name}` : "Add a company"}</b>
        <button type="button" className="tt-linkbtn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!forCompany && (
      <form
        className="tt-add-rec-url"
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <input autoFocus placeholder="Company website, e.g. acme.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
        <button className="tt-primary" disabled={looking || url.trim().length < 4}>
          {looking ? "Looking up…" : found ? "Look up again" : "Look up"}
        </button>
      </form>
      )}
      {err && <p className="tt-add-err">{err}</p>}

      {found && (
        <form
          className="tt-add-rec-body"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="tt-add-co">
            <CompanyIcon name={name || found.domain} domain={found.domain} />
            <div>
              <b>{name || found.domain}</b>
              <div className="tt-dim tt-small">
                {found.domain}
                {found.existing && !forCompany ? " · already on Trading Post. Your engagement goes under it, no duplicate company." : ""}
              </div>
              {found.description && <div className="tt-dim tt-small tt-add-desc">{found.description}</div>}
            </div>
          </div>

          {!forCompany && (
          <fieldset>
            <legend>Company</legend>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!found.existing} />
            </label>
            <label>
              Industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Pick…</option>
                {RN_INDUSTRIES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              HQ
              <input value={hq} placeholder="Chicago, IL" onChange={(e) => setHq(e.target.value)} />
            </label>
          </fieldset>
          )}

          <fieldset>
            <legend>Fractional engagement, as it was when you worked there</legend>
            <label>
              Role
              <input value={eng.role} placeholder="Fractional VP Sales" onChange={setE("role")} />
            </label>
            <label>
              Status
              <select value={eng.status} onChange={setE("status")}>
                <option value="">Pick…</option>
                {["Open role", "Active", "Ended"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              Revenue stage
              <select value={eng.revenue} onChange={setE("revenue")}>
                <option value="">Pick…</option>
                {RN_REVENUE.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              Employees
              <select value={eng.employees} onChange={setE("employees")}>
                <option value="">Pick…</option>
                {RN_EMPLOYEES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              Start
              <input type="month" value={eng.start} onChange={setE("start")} />
            </label>
            <label>
              End
              <span className="tt-end">
                <input type="month" value={eng.end} disabled={ongoing} onChange={setE("end")} />
                <label className="tt-check-inline">
                  <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} /> Ongoing
                </label>
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend>People at {name || "the company"}</legend>
            {people.map((p, i) => {
              const set = (k: keyof Person) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
                setPeople(people.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
              return (
                <div key={i} className="tt-person">
                  <input placeholder="Name" value={p.name} onChange={set("name")} />
                  <input placeholder="Title" value={p.title} onChange={set("title")} />
                  <select value={p.relationship} onChange={set("relationship")}>
                    <option value="">Relationship…</option>
                    {RELATIONSHIPS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <input placeholder="Email 🔒" value={p.email} onChange={set("email")} />
                  <input placeholder="LinkedIn 🔒" value={p.linkedin} onChange={set("linkedin")} />
                  <button type="button" className="tt-x" title="Remove" onClick={() => setPeople(people.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              );
            })}
            <button type="button" className="tt-btn" onClick={() => setPeople([...people, blankPerson()])}>
              + Add a person
            </button>
          </fieldset>

          <div className="tt-add-rec-foot">
            <span className="tt-dim tt-small">Every field you fill earns 1 credit. Email and LinkedIn are locked for others until they spend a credit.</span>
            <button className="tt-primary" disabled={busy || name.trim().length < 2}>
              Add record
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function CellView(props: {
  /** Continuation row: this company/engagement cell repeats the row above, so show it quietly. */
  shared: boolean;
  f: FieldDef;
  cell: Cell;
  canAct: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (v: string) => void;
  onUnlock: () => void;
  onReport: () => void;
  onVerify: () => void;
}) {
  const { f, cell, canAct, busy, editing } = props;
  if (editing) return <Editor f={f} initial={cell.s === "value" ? cell.v : ""} busy={busy} onSave={props.onSave} onCancel={props.onCancel} />;
  if (props.shared && cell.s !== "value") return <span className="tt-ditto" title="Same as the row above">〃</span>;

  if (cell.s === "empty")
    return canAct ? (
      <button className="tt-add" onClick={props.onEdit} title={`Add ${f.label} · earn 1 credit`}>
        + Add <span>+1</span>
      </button>
    ) : (
      <span className="tt-empty-dash">—</span>
    );

  if (cell.s === "locked")
    return (
      <span className="tt-val">
        {canAct ? (
          <button className="tt-lock" disabled={busy} onClick={props.onUnlock} title={`Unlock ${f.label} for 1 credit`}>
            🔒 Unlock <span>1</span>
          </button>
        ) : (
          <span className="tt-lock tt-lock-static">🔒</span>
        )}
        <VerBadge n={cell.ver} />
      </span>
    );

  if (cell.s === "reported") return <span className="tt-dim tt-small">{cell.mine ? "Reported · in review" : "In review"}</span>;

  const v = cell.v;
  if (cell.system) return <span className={`tt-src tt-src-${v.split(" ")[0].toLowerCase()}`}>{v}</span>;
  let content: React.ReactNode = v;
  if (f.kind === "choice") content = <span className={`tt-pill tt-pill-${(f.options?.indexOf(v) ?? 0) % 4} tt-pill-${f.key}-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{v}</span>;
  else if (f.kind === "url") content = <a href={`https://${v}`} target="_blank" rel="noopener noreferrer nofollow">{v.replace(/^www\./, "")}</a>;
  else if (f.kind === "email") content = <a href={`mailto:${v}`}>{v}</a>;
  else if (f.kind === "month" || (f.kind === "monthOrOngoing" && v !== "Ongoing")) content = fmtMonth(v);
  else if (f.kind === "number") content = `${v} h`;

  return (
    <span className="tt-val">
      <span className="tt-val-text" title={v}>
        {content}
      </span>
      <VerBadge n={cell.ver} mine={cell.iv} />
      {cell.mine ? (
        <button className="tt-hover-act" onClick={props.onEdit} title="Edit your value">
          ✎
        </button>
      ) : canAct ? (
        <>
          {!cell.iv && (
            <button className="tt-hover-act tt-verify" disabled={busy} onClick={props.onVerify} title="This is right. Verify it">
              ✓
            </button>
          )}
          <button className="tt-hover-act" onClick={props.onReport} title="Report as wrong">
            ⚑
          </button>
        </>
      ) : null}
    </span>
  );
}

/** How many confirmations a value has. Our own records count as one. */
export function VerBadge({ n, mine }: { n: number; mine?: boolean }) {
  if (!n) return null;
  return (
    <span className={`tt-ver ${mine ? "mine" : ""}`} title={`Confirmed ${n} time${n === 1 ? "" : "s"}${mine ? ", including by you" : ""}. Revenue Nomad records count as one.`}>
      ✓{n}
    </span>
  );
}

/** Signed-out landing: join (anyone) or sign in with a personal link/code (members). */
export function AuthPanel({ busy, onDone, setToast }: { busy: boolean; onDone: () => void; setToast: (t: { text: string; bad?: boolean }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const post = async (body: unknown) => {
    const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setToast({ text: j.error ?? "Something went wrong.", bad: true });
    else {
      setToast({ text: "You're in. Give to get." });
      onDone();
    }
  };
  return (
    <div className="tt-auth">
      <form
        className="tt-auth-box"
        onSubmit={(e) => {
          e.preventDefault();
          post({ join: { name, email } });
        }}
      >
        <b>Join Trading Post</b>
        <span className="tt-dim">Start with free credits. Add what you know, confirm what&apos;s right, unlock the rest.</span>
        <div className="tt-auth-row">
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="tt-primary" disabled={busy || name.trim().length < 2 || !email.includes("@")}>
            Join
          </button>
        </div>
      </form>
      <form
        className="tt-auth-box"
        onSubmit={(e) => {
          e.preventDefault();
          post({ signIn: code });
        }}
      >
        <b>Revenue Nomad member?</b>
        <span className="tt-dim">Paste the personal link we sent you (or the code at the end of it).</span>
        <div className="tt-auth-row">
          <input placeholder="Sign-in link or code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="tt-btn" disabled={busy || code.trim().length < 4}>
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}

export function Editor({ f, initial, busy, onSave, onCancel }: { f: FieldDef; initial: string; busy: boolean; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };
  return (
    <form
      className="tt-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {f.kind === "monthOrOngoing" ? (
        <>
          <input ref={ref} type="month" value={v === "Ongoing" ? "" : v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} />
          <button type="button" className={`tt-btn tt-ongoing ${v === "Ongoing" ? "on" : ""}`} onClick={() => setV(v === "Ongoing" ? "" : "Ongoing")}>
            Ongoing
          </button>
        </>
      ) : f.kind === "choice" ? (
        <select ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys}>
          <option value="">Pick…</option>
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          ref={ref}
          type={f.kind === "month" ? "month" : f.kind === "email" ? "email" : f.kind === "number" ? "number" : "text"}
          placeholder={f.placeholder}
          value={v}
          maxLength={200}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={keys}
        />
      )}
      <button className="tt-ok" disabled={busy || !v.trim()} title="Save (Enter)">
        ✓
      </button>
      <button type="button" className="tt-x" onClick={onCancel} title="Cancel (Esc)">
        ✕
      </button>
    </form>
  );
}
