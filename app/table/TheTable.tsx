"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Row, View } from "@/lib/table";
import { COLUMNS, FILLABLE, GROUPS, RELATIONSHIPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, type Entity, type FieldDef } from "@/lib/tableFields";

type Filter = "all" | "open" | "engagements" | "stories" | "verified" | "needs" | "locked" | "nocontact" | "mine";
type Sort = { key: string; dir: 1 | -1 };

const initials = (s: string) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const HUES = [142, 200, 265, 25, 330, 175, 45];
const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y && mo ? new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : m;
};
const cellRank = (c: Cell) => (c.s === "value" ? 0 : c.s === "locked" ? 1 : c.s === "reported" ? 2 : 3);
const entityId = (r: Row, e: Entity) => (e === "company" ? r.companyId : e === "engagement" ? r.engagementId : r.contactId);
const COLS = COLUMNS; // every column after the frozen company name
const FILLABLE_COUNT = FILLABLE.length;
const GROUP_SPANS = GROUPS.map((g) => ({ ...g, span: g.fields.filter((f) => !f.identity).length }));

export default function TheTable() {
  const [view, setView] = useState<View | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(0);
  const [per, setPer] = useState(25);
  const [editing, setEditing] = useState<string | null>(null); // `${row.id}|${col}`
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState<string | null>(null); // row id to pin to the top + highlight
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/table", { cache: "no-store" });
    setView(await r.json());
  }, []);

  useEffect(() => {
    // Personal links look like /table?k=TOKEN: trade it for a cookie, then clean the URL.
    const k = new URLSearchParams(window.location.search).get("k");
    (async () => {
      if (k) {
        const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signIn: k }) });
        if (!r.ok) setToast({ text: "That link isn't valid.", bad: true });
        window.history.replaceState(null, "", "/");
      }
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const act = async (action: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      setToast({ text: j.message ?? j.error, bad: !r.ok });
      if (r.ok) await load();
      return r.ok ? (j as { rowId?: string }) : null;
    } finally {
      setBusy(false);
    }
  };

  const showRow = (rowId?: string | null) => {
    if (!rowId) return;
    setQ("");
    setFilter("all");
    setPage(0);
    setPin(rowId);
  };

  const rows = useMemo(() => {
    if (!view) return [];
    const needle = q.trim().toLowerCase();
    let list = view.rows.filter((r) => {
      if (needle && !r.company.toLowerCase().includes(needle) && !Object.values(r.cells).some((c) => c.s === "value" && c.v.toLowerCase().includes(needle))) return false;
      const cells = Object.values(r.cells);
      const src = r.cells["engagement.source"], st = r.cells["engagement.status"];
      if (filter === "open") return st?.s === "value" && st.v === "Open role";
      if (filter === "engagements") return src?.s === "value" && src.v === "Published engagement";
      if (filter === "stories") return src?.s === "value" && src.v === "Member success story";
      if (filter === "verified") return r.verified || cells.some((c) => (c.s === "value" || c.s === "locked") && c.ver > 1);
      if (filter === "needs") return cells.some((c) => c.s === "empty");
      if (filter === "locked") return cells.some((c) => c.s === "locked");
      if (filter === "nocontact") return !r.contactId;
      if (filter === "mine") return cells.some((c) => c.s === "value" && c.mine);
      return true;
    });
    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => {
        if (key === "_company") return a.company.localeCompare(b.company) * dir;
        if (key === "_filled") return (a.filled - b.filled) * dir;
        const ca = a.cells[key], cb = b.cells[key];
        const r = cellRank(ca) - cellRank(cb);
        if (r) return r * dir;
        return ca.s === "value" && cb.s === "value" ? ca.v.localeCompare(cb.v) * dir : 0;
      });
    }
    if (pin) list = [...list.filter((r) => r.id === pin), ...list.filter((r) => r.id !== pin)];
    return list;
  }, [view, q, filter, sort, pin]);

  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * per, cur * per + per);
  const me = view?.me ?? null;

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortIcon = (key: string) => (sort?.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕");

  return (
    <div className="tt">
      <header className="tt-head">
        <div>
          <h1>The Table</h1>
          <p className="tt-sub">
            Jigsaw for the fractional GTM community. Every row is a company that used a fractional (or is hiring one), the seat, and
            the people involved. <b>Give:</b> add what&apos;s missing for 1 credit, and verify what&apos;s right. <b>Get:</b> spend 1 credit to
            unlock a <span>🔒</span> field someone else filled.
          </p>
        </div>
        {me && (
          <div className="tt-credits" title={`Signed in as ${me.name}`}>
            <span className="tt-credits-n">{me.credits}</span>
            <span>credit{me.credits === 1 ? "" : "s"}</span>
          </div>
        )}
      </header>

      {view?.demo && (
        <div className="tt-banner">
          Demo data: no member seed is loaded (build it with <code>scripts/build-intel-seed.py</code>). <a href="/?k=demo">Sign in as a demo member →</a>
        </div>
      )}
      {view && !me && <AuthPanel busy={busy} onDone={load} setToast={setToast} />}

      {me?.admin && view && view.reported.length > 0 && (
        <div className="tt-review">
          <b>Reported values</b>
          {view.reported.map((x) => (
            <div key={`${x.id}.${x.field}`} className="tt-review-item">
              <span>
                {x.record} · {x.label}: <code>{x.value}</code>
              </span>
              <span>
                <button className="tt-btn" onClick={() => act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "keep" })}>Keep</button>
                <button className="tt-btn" onClick={() => act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "remove" })}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="tt-card">
        {/* Toolbar */}
        <div className="tt-toolbar">
          <label className="tt-search">
            <span aria-hidden>⌕</span>
            <input
              placeholder="Search companies, roles, people…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
                setPin(null);
              }}
            />
          </label>
          <label className="tt-select">
            <span>Show:</span>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as Filter);
                setPage(0);
                setPin(null);
              }}
            >
              <option value="all">All records</option>
              <option value="open">Open fractional roles</option>
              <option value="engagements">Fractional engagements</option>
              <option value="stories">Member success stories</option>
              <option value="verified">Verified by members</option>
              <option value="needs">Needs enrichment</option>
              <option value="locked">Has locked fields</option>
              <option value="nocontact">No contact yet</option>
              {me && <option value="mine">I enriched</option>}
            </select>
          </label>
          {view && (
            <span className="tt-dim tt-stats">
              {view.stats.companies} companies · {view.stats.engagements} engagements · {view.stats.contacts} contacts
            </span>
          )}
          <div className="tt-spacer" />
          {me && (
            <button className="tt-primary" onClick={() => setAdding((a) => !a)}>
              + Add record
            </button>
          )}
        </div>

        {adding && view && (
          <AddRecord
            busy={busy}
            onCancel={() => setAdding(false)}
            onAdd={async (payload) => {
              const res = await act({ type: "add", ...payload });
              if (res) {
                setAdding(false);
                showRow(res.rowId);
              }
            }}
          />
        )}

        {/* Header + body */}
        <div className="tt-scroll">
          <table className="tt-grid">
            <thead>
              <tr className="tt-groups">
                <th className="tt-frozen tt-g-company" />
                {GROUP_SPANS.map((g) => (
                  <th key={g.entity} colSpan={g.span} className={`tt-g-${g.entity}`}>
                    {g.label}
                  </th>
                ))}
                <th />
              </tr>
              <tr>
                <th className="tt-frozen" onClick={() => toggleSort("_company")}>
                  Company <span className="tt-sort">{sortIcon("_company")}</span>
                </th>
                {COLS.map(({ col, f, entity }) => (
                  <th key={col} onClick={() => toggleSort(col)} className={f === GROUPS.find((g) => g.entity === entity)!.fields.find((x) => !x.identity) ? "tt-g-start" : ""}>
                    {f.label}
                    {f.gated && <span className="tt-th-lock" title="Gated: 1 credit to unlock">🔒</span>} <span className="tt-sort">{sortIcon(col)}</span>
                  </th>
                ))}
                <th onClick={() => toggleSort("_filled")}>
                  Filled <span className="tt-sort">{sortIcon("_filled")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!view ? (
                <tr>
                  <td className="tt-none" colSpan={COLS.length + 2}>Loading…</td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td className="tt-none" colSpan={COLS.length + 2}>
                    {q ? <>No records match “{q}”.</> : <>No records yet.</>}{" "}
                    {me && (
                      <button className="tt-linkbtn" onClick={() => setAdding(true)}>
                        Add one →
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                shown.map((r, i) => {
                  // A row continuing the same engagement shares its company + engagement data.
                  const cont = i > 0 && shown[i - 1].engagementId === r.engagementId;
                  return (
                    <tr key={r.id} className={`${r.id === pin ? "tt-flash" : ""} ${cont ? "tt-cont" : ""}`}>
                      <td className="tt-frozen">
                        <div className="tt-ident">
                          {cont ? (
                            <span className="tt-avatar tt-avatar-cont" aria-hidden>↳</span>
                          ) : (
                            <CompanyIcon name={r.company} domain={r.iconDomain} />
                          )}
                          <span className="tt-name">{r.company}</span>
                          {r.verified && (
                            <span className="tt-verified" title="Engagement corroborated by the buyer">
                              ✓
                            </span>
                          )}
                        </div>
                      </td>
                      {COLS.map(({ col, f, entity }) => {
                        const id = entityId(r, entity);
                        const key = `${r.id}|${col}`;
                        return (
                          <td key={col} className={`${cont && entity !== "contact" ? "tt-shared" : ""} ${f === GROUPS.find((g) => g.entity === entity)!.fields.find((x) => !x.identity) ? "tt-g-start" : ""}`}>
                            <CellView
                              shared={cont && entity !== "contact"}
                              f={f}
                              cell={r.cells[col]}
                              canAct={!!me}
                              busy={busy}
                              editing={editing === key}
                              onEdit={() => setEditing(key)}
                              onCancel={() => setEditing(null)}
                              onSave={async (value) => {
                                const res = await act({ type: "fill", engagementId: r.engagementId, contactId: r.contactId, entity, field: f.key, value });
                                if (res) {
                                  setEditing(null);
                                  if (res.rowId && res.rowId !== r.id && r.id === pin) setPin(res.rowId);
                                }
                              }}
                              onUnlock={() => id && act({ type: "unlock", entity, id, field: f.key })}
                              onVerify={() => id && act({ type: "verify", entity, id, field: f.key })}
                              onReport={() => {
                                if (id && window.confirm(`Report ${f.label} on ${r.company} as wrong? It'll be hidden until reviewed.`)) act({ type: "report", entity, id, field: f.key });
                              }}
                            />
                          </td>
                        );
                      })}
                      <td>
                        <div className="tt-rowend">
                          <span className="tt-meter" title={`${r.filled} of ${FILLABLE_COUNT} fields filled`}>
                            <span style={{ width: `${(r.filled / FILLABLE_COUNT) * 100}%` }} />
                          </span>
                          <span className="tt-meter-n">
                            {r.filled}/{FILLABLE_COUNT}
                          </span>
                          {me && (
                            <button
                              className="tt-addcontact"
                              disabled={busy}
                              title="Add a person at this company: who you reported to, who reported to you, or who you worked with"
                              onClick={async () => {
                                const res = await act({ type: "addContact", engagementId: r.engagementId });
                                showRow(res?.rowId);
                              }}
                            >
                              + person
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="tt-footer">
          <span className="tt-dim">
            {rows.length === 0 ? "No results" : `Showing ${cur * per + 1} to ${Math.min(rows.length, cur * per + per)} of ${rows.length} records`}
          </span>
          <div className="tt-pager">
            <label className="tt-dim">
              Rows per page:{" "}
              <select
                value={per}
                onChange={(e) => {
                  setPer(Number(e.target.value));
                  setPage(0);
                }}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button className="tt-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              ‹ Previous
            </button>
            {pageList(cur, pages).map((p, i) =>
              p < 0 ? (
                <span key={`gap${i}`} className="tt-dim">…</span>
              ) : (
                <button key={p} className={`tt-btn tt-page ${p === cur ? "active" : ""}`} onClick={() => setPage(p)}>
                  {p + 1}
                </button>
              ),
            )}
            <button className="tt-btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              Next ›
            </button>
          </div>
        </div>
      </div>

      {me && (
        <p className="tt-foot tt-dim">
          Signed in as {me.name}. Values you fill are credited to you; other members never see who filled what.{" "}
          <button
            className="tt-linkbtn"
            onClick={() => {
              const link = `${window.location.origin}/?k=${me.token}`;
              navigator.clipboard?.writeText(link).then(
                () => setToast({ text: "Your sign-in link is copied. Keep it private — it's your login." }),
                () => window.prompt("Your private sign-in link:", link),
              );
            }}
          >
            Copy my sign-in link
          </button>
          {" · "}
          <button
            className="tt-linkbtn"
            onClick={async () => {
              await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signOut: true }) });
              load();
            }}
          >
            Sign out
          </button>
        </p>
      )}

      {toast && (
        <div className={`tt-toast ${toast.bad ? "bad" : ""}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

/**
 * Company icon from its domain: Google's favicon service first, DuckDuckGo's as
 * backup, initials last. Google answers unknown domains with a tiny generic
 * globe instead of an error, so anything 16px or smaller counts as a miss.
 */
function CompanyIcon({ name, domain }: { name: string; domain: string | null }) {
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
function pageList(cur: number, pages: number): number[] {
  if (pages <= 7) return [...Array(pages).keys()];
  const sorted = [...new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < pages))].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(-1);
    out.push(p);
  });
  return out;
}

type AddPayload = {
  company: string;
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
function AddRecord({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (p: AddPayload) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<{ domain: string; existing: { name: string } | null; description: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hq, setHq] = useState("");
  const [eng, setEng] = useState({ role: "", status: "", revenue: "", employees: "", start: "", end: "" });
  const [ongoing, setOngoing] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
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
      website: found?.domain ?? "",
      companyFields: { industry, hq },
      engagementFields: { ...eng, end: ongoing ? "Ongoing" : eng.end },
      people: people.filter((p) => p.name.trim()).map((p) => ({ ...p })),
    });

  return (
    <div className="tt-add-rec">
      <div className="tt-add-rec-head">
        <b>Add a record</b>
        <button type="button" className="tt-linkbtn" onClick={onCancel}>
          Cancel
        </button>
      </div>
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
                {found.existing ? " · already on The Table — this adds a new record there" : ""}
              </div>
              {found.description && <div className="tt-dim tt-small tt-add-desc">{found.description}</div>}
            </div>
          </div>

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

          <fieldset>
            <legend>Fractional engagement (as it was when you worked there)</legend>
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

function CellView(props: {
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
  if (f.kind === "choice") content = <span className={`tt-pill tt-pill-${(f.options?.indexOf(v) ?? 0) % 4}`}>{v}</span>;
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
            <button className="tt-hover-act tt-verify" disabled={busy} onClick={props.onVerify} title="This is correct — verify it">
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
function VerBadge({ n, mine }: { n: number; mine?: boolean }) {
  if (!n) return null;
  return (
    <span className={`tt-ver ${mine ? "mine" : ""}`} title={`Verified ${n}× ${mine ? "(including you)" : ""}— Revenue Nomad records count as one`}>
      ✓{n}
    </span>
  );
}

/** Signed-out landing: join (anyone) or sign in with a personal link/code (members). */
function AuthPanel({ busy, onDone, setToast }: { busy: boolean; onDone: () => void; setToast: (t: { text: string; bad?: boolean }) => void }) {
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
        <b>Join The Table</b>
        <span className="tt-dim">Start with free credits. Add what you know, verify what&apos;s right, unlock the rest.</span>
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

function Editor({ f, initial, busy, onSave, onCancel }: { f: FieldDef; initial: string; busy: boolean; onSave: (v: string) => void; onCancel: () => void }) {
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
