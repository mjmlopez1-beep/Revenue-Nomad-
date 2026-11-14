"use client";

/**
 * Trading Post. Jigsaw for the fractional GTM community.
 *
 * Three views over the same linked records:
 *  - Engagements (default): one row per company; its other engagements expand underneath.
 *  - Companies: one row per company with its shared facts and a Signal score.
 *  - Contacts: one row per person, with the company and engagement they belong to.
 * Fill an empty field to earn a credit, spend a credit to unlock a locked field, confirm what's right.
 * Styled to the Revenue Nomad design system v2 (pine, volt, ember; Figtree).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Row, View } from "@/lib/table";
import { fieldDef, type Entity, type FieldDef } from "@/lib/tableFields";
import { AddRecord, AuthPanel, CellView, CompanyIcon, hue, initials, pageList, type AddPayload } from "./parts";

type Mode = "engagements" | "companies" | "contacts";
type Quick = "all" | "open" | "engagements" | "stories" | "verified" | "needs" | "locked" | "mine";
type Col = { entity: Entity; key: string; label: string; f: FieldDef };
type Toast = { text: string; bad?: boolean };

const col = (entity: Entity, key: string, label?: string): Col => {
  const f = fieldDef(entity, key)!;
  return { entity, key, label: label ?? f.label, f };
};
const VIEW_COLS: Record<Mode, Col[]> = {
  engagements: [
    col("engagement", "role"),
    col("engagement", "operator"),
    col("engagement", "status"),
    col("engagement", "revenue", "Revenue"),
    col("engagement", "employees"),
    col("company", "industry"),
    col("engagement", "type"),
    col("engagement", "start"),
    col("engagement", "end"),
    col("engagement", "rate"),
    col("engagement", "hours"),
    col("engagement", "posting"),
  ],
  companies: [
    col("company", "website"),
    col("company", "industry"),
    col("engagement", "revenue", "Revenue"),
    col("engagement", "employees"),
    col("company", "hq"),
  ],
  contacts: [col("contact", "title"), col("contact", "relationship"), col("contact", "email"), col("contact", "phone"), col("contact", "linkedin")],
};
const ckey = (c: Col) => `${c.entity}.${c.key}`;
const has = (c?: Cell) => !!c && (c.s === "value" || c.s === "locked");
const entityId = (r: Row, e: Entity) => (e === "company" ? r.companyId : e === "engagement" ? r.engagementId : r.contactId);
const cellText = (c?: Cell) => (c && c.s === "value" ? c.v : "");
const PER = 25;

interface CompanyGroup {
  id: string;
  name: string;
  iconDomain: string | null;
  verified: boolean;
  /** One row per engagement, richest first. */
  engagements: Row[];
  /** One row per person. */
  contacts: Row[];
  facts: number;
}

/** Facts a company has: its own fields once, plus every engagement's and person's fields. */
function countFacts(g: { engagements: Row[]; contacts: Row[] }): number {
  const first = g.engagements[0];
  if (!first) return 0;
  let n = 0;
  for (const [k, c] of Object.entries(first.cells)) if (k.startsWith("company.") && has(c)) n++;
  for (const e of g.engagements) for (const [k, c] of Object.entries(e.cells)) if (k.startsWith("engagement.") && k !== "engagement.source" && has(c)) n++;
  for (const p of g.contacts) for (const [k, c] of Object.entries(p.cells)) if (k.startsWith("contact.") && has(c)) n++;
  return n;
}
const signalLevel = (n: number) => (n >= 15 ? 5 : n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);

export default function TheTable() {
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<"table" | "credits">("table");
  const [mode, setMode] = useState<Mode>("engagements");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<Quick>("all");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | { url?: string; forCompany?: { name: string; domain: string | null } }>(null);
  const [personFor, setPersonFor] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const authRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/table", { cache: "no-store" });
    setView(await r.json());
  }, []);

  useEffect(() => {
    // Personal links look like /?k=CODE. Trade it for a session cookie, then clean the URL.
    const k = new URLSearchParams(window.location.search).get("k");
    (async () => {
      if (k) {
        const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signIn: k }) });
        if (!r.ok) setToast({ text: "That sign-in link isn't valid.", bad: true });
        window.history.replaceState(null, "", "/");
      }
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
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

  const me = view?.me ?? null;
  const cols = VIEW_COLS[mode];

  /* ---------- group rows into companies ---------- */
  const groups = useMemo(() => {
    const map = new Map<string, CompanyGroup>();
    const seenEng = new Set<string>();
    for (const r of view?.rows ?? []) {
      let g = map.get(r.companyId);
      if (!g) map.set(r.companyId, (g = { id: r.companyId, name: r.company, iconDomain: r.iconDomain, verified: false, engagements: [], contacts: [], facts: 0 }));
      if (!seenEng.has(r.engagementId)) {
        seenEng.add(r.engagementId);
        g.engagements.push(r);
      }
      if (r.contactId) g.contacts.push(r);
      g.verified ||= r.verified;
    }
    for (const g of map.values()) {
      g.engagements.sort((a, b) => b.filled - a.filled);
      g.facts = countFacts(g);
    }
    return [...map.values()];
  }, [view]);

  /* ---------- filtering ---------- */
  const rowPasses = useCallback(
    (r: Row) => {
      const cells = Object.values(r.cells);
      const src = cellText(r.cells["engagement.source"]);
      if (quick === "open" && cellText(r.cells["engagement.status"]) !== "Open role") return false;
      if (quick === "engagements" && src !== "Published engagement") return false;
      if (quick === "stories" && src !== "Member success story") return false;
      if (quick === "verified" && !(r.verified || cells.some((c) => (c.s === "value" || c.s === "locked") && c.ver > 1))) return false;
      if (quick === "needs" && !cells.some((c) => c.s === "empty")) return false;
      if (quick === "locked" && !cells.some((c) => c.s === "locked")) return false;
      if (quick === "mine" && !cells.some((c) => c.s === "value" && c.mine)) return false;
      for (const [k, want] of Object.entries(colFilters)) {
        if (k === "_signal") continue;
        const c = r.cells[k];
        if (want === "__has" && !has(c)) return false;
        if (want === "__empty" && c?.s !== "empty") return false;
        if (want === "__locked" && c?.s !== "locked") return false;
        if (!want.startsWith("__") && cellText(c) !== want) return false;
      }
      return true;
    },
    [quick, colFilters],
  );
  const needle = q.trim().toLowerCase();
  const textHit = useCallback(
    (r: Row) => r.company.toLowerCase().includes(needle) || Object.values(r.cells).some((c) => c.s === "value" && c.v.toLowerCase().includes(needle)),
    [needle],
  );

  const visibleGroups = useMemo(() => {
    let list = groups
      .map((g) => ({
        ...g,
        shown: g.engagements.filter((e) => rowPasses(e) && (!needle || textHit(e) || g.contacts.some((p) => p.engagementId === e.engagementId && textHit(p)))),
      }))
      .filter((g) => g.shown.length > 0)
      .filter((g) => {
        const want = colFilters["_signal"];
        const l = signalLevel(g.facts);
        return !want || (want === "__strong" ? l >= 4 : want === "__some" ? l === 2 || l === 3 : l <= 1);
      });
    if (sort) {
      const { key, dir } = sort;
      const val = (g: (typeof list)[number]): string | number =>
        key === "_company" ? g.name : key === "_signal" ? g.facts : key === "_engs" ? g.engagements.length : key === "_contacts" ? g.contacts.length : cellText(g.shown[0].cells[key]) || (has(g.shown[0].cells[key]) ? "￿" : "");
      list = [...list].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        if (!va && vb) return 1;
        if (va && !vb) return -1;
        return String(va).localeCompare(String(vb)) * dir;
      });
    }
    return list;
  }, [groups, rowPasses, needle, textHit, sort]);

  const visibleContacts = useMemo(() => groups.flatMap((g) => g.contacts).filter((r) => rowPasses(r) && (!needle || textHit(r))), [groups, rowPasses, needle, textHit]);

  const total = mode === "contacts" ? visibleContacts.length : visibleGroups.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  const cur = Math.min(page, pages - 1);
  const resetPage = () => setPage(0);
  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortMark = (key: string) => (sort?.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  /** Distinct values a column takes, for its filter menu. */
  const distinct = (c: Col) => {
    const rows = c.entity === "contact" ? groups.flatMap((g) => g.contacts) : groups.flatMap((g) => g.engagements);
    const vals = new Set<string>();
    for (const r of rows) {
      const v = cellText(r.cells[ckey(c)]);
      if (v) vals.add(v);
    }
    return [...vals].sort().slice(0, 14);
  };

  const cell = (r: Row, c: Col) => {
    const k = `${r.id}|${ckey(c)}`;
    const id = entityId(r, c.entity);
    return (
      <CellView
        shared={false}
        f={c.f}
        cell={r.cells[ckey(c)] ?? { s: "empty" }}
        canAct={!!me}
        busy={busy}
        editing={editing === k}
        onEdit={() => setEditing(k)}
        onCancel={() => setEditing(null)}
        onSave={async (value) => {
          if (await act({ type: "fill", engagementId: r.engagementId, contactId: r.contactId, entity: c.entity, field: c.key, value })) setEditing(null);
        }}
        onUnlock={() => id && act({ type: "unlock", entity: c.entity, id, field: c.key })}
        onVerify={() => id && act({ type: "verify", entity: c.entity, id, field: c.key })}
        onReport={() => {
          if (id && window.confirm(`Report ${c.label} on ${r.company} as wrong? It's hidden until it's reviewed.`)) act({ type: "report", entity: c.entity, id, field: c.key });
        }}
      />
    );
  };

  const addPayload = async (payload: AddPayload) => {
    if (await act({ type: "add", ...payload })) {
      setAdding(null);
    }
  };
  const signOut = async () => {
    setMenu(false);
    await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signOut: true }) });
    setTab("table");
    load();
  };
  const copyLink = () => {
    setMenu(false);
    if (!me) return;
    const link = `${window.location.origin}/?k=${me.token}`;
    navigator.clipboard?.writeText(link).then(
      () => setToast({ text: "Your sign-in link is copied. Keep it private, it's your login." }),
      () => window.prompt("Your private sign-in link", link),
    );
  };
  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const stats = view?.stats;
  const colSpan = cols.length + (mode === "companies" ? 4 : mode === "contacts" ? 2 : 2);

  return (
    <div className="tt2">
      {/* ---------- top bar ---------- */}
      <header className="tt-top">
        <div className="tt-top-in">
          <a href="/" className="tt-top-brand" aria-label="Revenue Nomad">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-on-dark.png" alt="Revenue Nomad" width={425} height={48} />
          </a>
          <span className="tt-top-sep" />
          <span className="tt-top-title">Trading Post</span>
          <nav className="tt-top-nav">
            <button className={tab === "table" ? "on" : ""} onClick={() => setTab("table")}>
              Browse
            </button>
            {me && (
              <button className={tab === "credits" ? "on" : ""} onClick={() => setTab("credits")}>
                My credits
              </button>
            )}
          </nav>
          <div className="tt-top-right">
            {me ? (
              <>
                <button className="tt-pill" onClick={() => setTab("credits")} title="Your credits">
                  {me.credits} credit{me.credits === 1 ? "" : "s"}
                </button>
                <div className="tt-me">
                  <button className="tt-me-btn" onClick={() => setMenu((m) => !m)} title={me.name} aria-haspopup="menu">
                    {initials(me.name)}
                  </button>
                  {menu && (
                    <div className="tt-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                      <div className="tt-menu-who">
                        <b>{me.name}</b>
                        <span>{me.title}</span>
                      </div>
                      <button role="menuitem" onClick={copyLink}>
                        Copy my sign-in link
                      </button>
                      <button role="menuitem" onClick={signOut}>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button className="tt-pill" onClick={() => authRef.current?.scrollIntoView({ behavior: "smooth" })}>
                Join or sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="tt-main">
        {tab === "credits" && me && view ? (
          <MyCredits view={view} onBack={() => setTab("table")} />
        ) : (
          <>
            {/* ---------- page header ---------- */}
            <div className="tt-hero">
              <div>
                <h1>Trading Post</h1>
                <p className="tt-hero-stats">
                  {stats ? `${stats.companies.toLocaleString()} companies. ${stats.engagements.toLocaleString()} engagements. ${stats.contacts.toLocaleString()} contacts.` : "Loading."}
                </p>
                <p className="tt-hero-sub">
                  Bring what you know. Take what you need. Add a missing fact about fractional work to earn 1 credit, and trade 1 credit to unlock what other operators know.
                </p>
              </div>
              {me && (
                <QuickAdd
                  busy={busy}
                  onGoTo={(name) => {
                    setQ(name);
                    setMode("engagements");
                    resetPage();
                  }}
                  onAdd={async (p) => {
                    const ok = await act({ type: "add", company: p.name, website: p.domain, companyFields: { industry: p.industry } });
                    if (ok) {
                      setQ(p.name);
                      setMode("engagements");
                      resetPage();
                    }
                    return !!ok;
                  }}
                />
              )}
            </div>

            {view?.demo && (
              <div className="tt-banner">
                Demo data. No member data is loaded. <a href="/?k=demo">Sign in as a demo member</a>
              </div>
            )}
            {view && !me && (
              <div ref={authRef}>
                <AuthPanel busy={busy} onDone={load} setToast={setToast} />
              </div>
            )}

            {me?.admin && view && view.reported.length > 0 && (
              <div className="tt-review">
                <b>Reported values</b>
                {view.reported.map((x) => (
                  <div key={`${x.id}.${x.field}`} className="tt-review-item">
                    <span>
                      {x.record} · {x.label} · <code>{x.value}</code>
                    </span>
                    <span>
                      <button className="tt-btn" onClick={() => act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "keep" })}>
                        Keep
                      </button>
                      <button className="tt-btn" onClick={() => act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "remove" })}>
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="tt-card">
              {/* ---------- toolbar ---------- */}
              <div className="tt-toolbar">
                <label className="tt-search">
                  <span aria-hidden>⌕</span>
                  <input
                    placeholder="Search companies, roles, people"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      resetPage();
                    }}
                  />
                </label>
                <select
                  className="tt-quick"
                  value={quick}
                  onChange={(e) => {
                    setQuick(e.target.value as Quick);
                    resetPage();
                  }}
                  aria-label="Quick filter"
                >
                  <option value="all">Everything</option>
                  <option value="open">Open fractional roles</option>
                  <option value="engagements">Fractional engagements</option>
                  <option value="stories">Member success stories</option>
                  <option value="verified">Confirmed by members</option>
                  <option value="needs">Missing intel</option>
                  <option value="locked">Locked intel</option>
                  {me && <option value="mine">What I added</option>}
                </select>
                <div className="tt-show" role="tablist" aria-label="Show">
                  <span>Show</span>
                  {(["companies", "engagements", "contacts"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={mode === m}
                      className={mode === m ? "on" : ""}
                      onClick={() => {
                        setMode(m);
                        setColFilters({});
                        setSort(null);
                        resetPage();
                      }}
                    >
                      {m[0].toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {Object.keys(colFilters).length > 0 && (
                <div className="tt-chips">
                  {Object.entries(colFilters).map(([k, v]) => (
                    <button key={k} className="tt-chip" onClick={() => setColFilters((f) => Object.fromEntries(Object.entries(f).filter(([x]) => x !== k)))}>
                      {k === "_signal" ? "Signal" : fieldDef(k.split(".")[0], k.split(".")[1])?.label} · {v === "__has" ? "Known" : v === "__empty" ? "Missing" : v === "__locked" ? "Locked" : v === "__strong" ? "Strong" : v === "__some" ? "Some" : v === "__thin" ? "Thin" : v} ✕
                    </button>
                  ))}
                  <button className="tt-linkbtn" onClick={() => setColFilters({})}>
                    Clear filters
                  </button>
                </div>
              )}

              {adding && (
                <AddRecord key={JSON.stringify(adding)} busy={busy} initialUrl={adding.url} forCompany={adding.forCompany} onCancel={() => setAdding(null)} onAdd={addPayload} />
              )}

              {/* ---------- table ---------- */}
              <div className="tt-scroll">
                <table className="tt-grid tt-grid2">
                  <thead>
                    <tr>
                      <th className="tt-frozen">
                        <button className="tt-th-sort" onClick={() => toggleSort("_company")}>
                          {mode === "contacts" ? "Person" : "Company"}
                          {sortMark("_company")}
                        </button>
                      </th>
                      {mode === "contacts" && <th>Company</th>}
                      {cols.map((c) => (
                        <th key={ckey(c)}>
                          <span className="tt-th">
                            <button className="tt-th-sort" onClick={() => toggleSort(ckey(c))}>
                              {c.label}
                              {c.f.gated && (
                                <span className="tt-th-lock" title="Locked. 1 credit to unlock">
                                  🔒
                                </span>
                              )}
                              {sortMark(ckey(c))}
                            </button>
                            <ColumnFilter
                              col={c}
                              value={colFilters[ckey(c)]}
                              options={distinct(c)}
                              onChange={(v) => {
                                setColFilters((f) => {
                                  const n = { ...f };
                                  if (v) n[ckey(c)] = v;
                                  else delete n[ckey(c)];
                                  return n;
                                });
                                resetPage();
                              }}
                            />
                          </span>
                        </th>
                      ))}
                      {mode === "companies" && (
                        <>
                          <th>
                            <button className="tt-th-sort" onClick={() => toggleSort("_engs")}>
                              Engagements{sortMark("_engs")}
                            </button>
                          </th>
                          <th>
                            <button className="tt-th-sort" onClick={() => toggleSort("_contacts")}>
                              People{sortMark("_contacts")}
                            </button>
                          </th>
                        </>
                      )}
                      {mode !== "contacts" && (
                        <th>
                          <span className="tt-th">
                            <button className="tt-th-sort" onClick={() => toggleSort("_signal")}>
                              Signal{sortMark("_signal")}
                            </button>
                            <SignalFilter
                              value={colFilters["_signal"]}
                              onChange={(v) => {
                                setColFilters((f) => {
                                  const n = { ...f };
                                  if (v) n["_signal"] = v;
                                  else delete n["_signal"];
                                  return n;
                                });
                                resetPage();
                              }}
                            />
                          </span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {!view ? (
                      <tr>
                        <td className="tt-none" colSpan={colSpan}>
                          Loading.
                        </td>
                      </tr>
                    ) : total === 0 ? (
                      <tr>
                        <td className="tt-none" colSpan={colSpan}>
                          {mode === "contacts" ? "No people yet. Add someone from any engagement with + person." : "Nothing matches. Try clearing a filter."}
                        </td>
                      </tr>
                    ) : mode === "contacts" ? (
                      visibleContacts.slice(cur * PER, cur * PER + PER).map((r) => {
                        const nm = cellText(r.cells["contact.name"]) || "?";
                        return (
                          <tr key={r.id}>
                            <td className="tt-frozen">
                              <div className="tt-ident">
                                <span className="tt-avatar" style={{ background: `hsl(${hue(nm)} 55% 92%)`, color: `hsl(${hue(nm)} 45% 26%)` }}>
                                  {initials(nm)}
                                </span>
                                <span className="tt-name">{cell(r, col("contact", "name"))}</span>
                              </div>
                            </td>
                            <td>
                              <span className="tt-co-inline">
                                <CompanyIcon name={r.company} domain={r.iconDomain} />
                                <span>
                                  {r.company}
                                  {cellText(r.cells["engagement.role"]) && <span className="tt-dim tt-small"> · {cellText(r.cells["engagement.role"])}</span>}
                                </span>
                              </span>
                            </td>
                            {cols.map((c) => (
                              <td key={ckey(c)}>{cell(r, c)}</td>
                            ))}
                          </tr>
                        );
                      })
                    ) : (
                      visibleGroups.slice(cur * PER, cur * PER + PER).map((g) => {
                        const open = expanded.has(g.id);
                        const first = g.shown[0];
                        const more = g.shown.slice(1);
                        const lvl = signalLevel(g.facts);
                        const src = cellText(first.cells["engagement.source"]);
                        const personRow = (engagementId: string) =>
                          personFor === engagementId && (
                            <tr className="tt-sub-row">
                              <td colSpan={colSpan}>
                                <AddPerson
                                  company={g.name}
                                  busy={busy}
                                  onCancel={() => setPersonFor(null)}
                                  onAdd={async (person) => {
                                    if (await act({ type: "addPerson", engagementId, person })) setPersonFor(null);
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        return (
                          <Fragment key={g.id}>
                            <tr className="tt-co-row">
                              <td className="tt-frozen">
                                <div className="tt-ident">
                                  <CompanyIcon name={g.name} domain={g.iconDomain} />
                                  <div className="tt-co-meta">
                                    <span className="tt-name">
                                      {g.name}
                                      {g.verified && (
                                        <span className="tt-verified" title="Confirmed by the client">
                                          ✓
                                        </span>
                                      )}
                                    </span>
                                    <span className="tt-co-sub">
                                      {mode === "engagements" && g.engagements.length > 1 ? (
                                        <button className="tt-engs-btn" onClick={() => toggleExpand(g.id)}>
                                          {open ? `Hide ${g.engagements.length - 1} more` : `${g.engagements.length} engagements`} {open ? "▴" : "▾"}
                                        </button>
                                      ) : src ? (
                                        <span className={`tt-src tt-src-${src.split(" ")[0].toLowerCase()}`}>{src}</span>
                                      ) : (
                                        <span className="tt-dim">1 engagement</span>
                                      )}
                                      {me && (
                                        <>
                                          <button
                                            className="tt-plus tt-plus-wide"
                                            title={`Add another fractional engagement at ${g.name}`}
                                            onClick={() => setAdding({ forCompany: { name: g.name, domain: cellText(first.cells["company.website"]) || g.iconDomain } })}
                                          >
                                            + engagement
                                          </button>
                                          {mode === "engagements" && (
                                            <button className="tt-plus tt-plus-wide" title="Add a person to this engagement" onClick={() => setPersonFor(personFor === first.engagementId ? null : first.engagementId)}>
                                              + person
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {cols.map((c) => (
                                <td key={ckey(c)}>{cell(first, c)}</td>
                              ))}
                              {mode === "companies" && (
                                <>
                                  <td className="tt-num">{g.engagements.length}</td>
                                  <td className="tt-num">{g.contacts.length}</td>
                                </>
                              )}
                              <td>
                                <span className="tt-signal" title={`${g.facts} facts known about ${g.name}, across its engagements and people`}>
                                  <span className="tt-bars" aria-hidden>
                                    {[1, 2, 3, 4, 5].map((i) => (
                                      <i key={i} className={i <= lvl ? "on" : ""} style={{ height: 4 + i * 3 }} />
                                    ))}
                                  </span>
                                  {g.facts} fact{g.facts === 1 ? "" : "s"}
                                </span>
                              </td>
                            </tr>
                            {mode === "engagements" && personRow(first.engagementId)}
                            {mode === "engagements" &&
                              open &&
                              more.map((e, i) => (
                                <Fragment key={e.engagementId}>
                                  <tr className="tt-sub-row">
                                    <td className="tt-frozen">
                                      <div className="tt-sub-label">
                                        ↳ Engagement {i + 2}
                                        {cellText(e.cells["engagement.source"]) && <span className="tt-dim tt-small"> · {cellText(e.cells["engagement.source"])}</span>}
                                        {me && (
                                          <button className="tt-plus tt-plus-wide" onClick={() => setPersonFor(personFor === e.engagementId ? null : e.engagementId)}>
                                            + person
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    {cols.map((c) => (
                                      <td key={ckey(c)}>{cell(e, c)}</td>
                                    ))}
                                    <td />
                                  </tr>
                                  {personRow(e.engagementId)}
                                </Fragment>
                              ))}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ---------- footer ---------- */}
              <div className="tt-footer">
                <span className="tt-dim">
                  {total === 0 ? "No results" : `Showing ${cur * PER + 1} to ${Math.min(total, cur * PER + PER)} of ${total.toLocaleString()} ${mode === "contacts" ? "people" : "companies"}`}
                </span>
                <div className="tt-pager">
                  <button className="tt-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                    ‹ Previous
                  </button>
                  {pageList(cur, pages).map((p, i) =>
                    p < 0 ? (
                      <span key={`gap${i}`} className="tt-dim">
                        …
                      </span>
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
              <div className="tt-legend">
                <span>
                  <b>+ Add</b> earns 1 credit. <b>Unlock</b> costs 1 credit and stays yours.
                </span>
                <span>
                  <b className="tt-ver">✓2</b> means 2 confirmations. Revenue Nomad records count as one. Hover a fact to confirm or report it.
                </span>
                <span>
                  <b>Signal</b> counts every fact a company has, across its engagements and people.
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {toast && (
        <div className={`tt-toast ${toast.bad ? "bad" : ""}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

/** Funnel on a column header. Filter by filled, empty, locked, or an exact value. */
function ColumnFilter({ col: c, value, options, onChange }: { col: Col; value?: string; options: string[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const label = (v: string) => (v === "__has" ? "Known" : v === "__empty" ? "Missing" : v === "__locked" ? "Locked" : v);
  const choices = ["__has", "__empty", ...(c.f.gated ? ["__locked"] : []), ...(c.f.kind === "choice" || options.length <= 14 ? options : [])];
  return (
    <span className="tt-filter">
      <button className={`tt-funnel ${value ? "on" : ""}`} onClick={() => setOpen((o) => !o)} title={`Filter ${c.label}`} aria-label={`Filter ${c.label}`}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path d="M2 3h12l-4.5 5.5V13l-3 1V8.5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="tt-filter-pop" onMouseLeave={() => setOpen(false)}>
          <button
            className={!value ? "on" : ""}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Any
          </button>
          {choices.map((v) => (
            <button
              key={v}
              className={value === v ? "on" : ""}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              {label(v)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Inline + person form. Who you reported to, who reported to you, or who you worked with. */
function AddPerson({ company, busy, onAdd, onCancel }: { company: string; busy: boolean; onAdd: (p: Record<string, string>) => void; onCancel: () => void }) {
  const [p, setP] = useState({ name: "", title: "", relationship: "", email: "", linkedin: "" });
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
  const rel = fieldDef("contact", "relationship")!.options!;
  return (
    <form
      className="tt-person tt-person-inline"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(p);
      }}
    >
      <b>Add a person at {company}</b>
      <input autoFocus placeholder="Name" value={p.name} onChange={set("name")} />
      <input placeholder="Title" value={p.title} onChange={set("title")} />
      <select value={p.relationship} onChange={set("relationship")}>
        <option value="">Relationship</option>
        {rel.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <input placeholder="Email (locked for others)" value={p.email} onChange={set("email")} />
      <input placeholder="LinkedIn (locked for others)" value={p.linkedin} onChange={set("linkedin")} />
      <button className="tt-primary" disabled={busy || p.name.trim().length < 2}>
        Add person
      </button>
      <button type="button" className="tt-btn" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/** My credits. Balance and every credit earned or spent. */
function MyCredits({ view, onBack }: { view: View; onBack: () => void }) {
  const me = view.me!;
  const added = view.ledger.filter((l) => l.reason === "fill").length;
  const unlocked = view.ledger.filter((l) => l.reason === "unlock").length;
  const what = (r: string) => (r === "fill" ? "Added" : r === "unlock" ? "Unlocked" : r === "refund" ? "Refund, the fact was removed" : r === "reversal" ? "Taken back, the fact was removed" : r);
  return (
    <div className="tt-credits-page">
      <button className="tt-linkbtn" onClick={onBack}>
        ‹ Back to Trading Post
      </button>
      <h1>My credits</h1>
      <div className="tt-credit-cards">
        <div>
          <span>Balance</span>
          <b>{me.credits}</b>
        </div>
        <div>
          <span>Facts you added</span>
          <b>{added}</b>
        </div>
        <div>
          <span>Facts you unlocked</span>
          <b>{unlocked}</b>
        </div>
      </div>
      <p className="tt-dim">Every fact you add earns 1 credit. Unlocking a fact someone else added costs 1, and it stays unlocked for you.</p>
      <div className="tt-card">
        <table className="tt-grid tt-grid2">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Company</th>
              <th>Field</th>
              <th>Credits</th>
            </tr>
          </thead>
          <tbody>
            {view.ledger.length === 0 ? (
              <tr>
                <td colSpan={5} className="tt-none">
                  Nothing yet. Add a missing fact on Trading Post to earn your first credit.
                </td>
              </tr>
            ) : (
              view.ledger.slice(0, 200).map((l, i) => (
                <tr key={i}>
                  <td className="tt-dim">{new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td>{what(l.reason)}</td>
                  <td>{l.company}</td>
                  <td>{l.field}</td>
                  <td className={l.delta > 0 ? "tt-plus-cr" : "tt-minus-cr"}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Signal filter: strong, some or thin intel on the company. */
function SignalFilter({ value, onChange }: { value?: string; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const opts: [string, string][] = [
    ["__strong", "Strong (10+ facts)"],
    ["__some", "Some (3 to 9)"],
    ["__thin", "Thin (0 to 2)"],
  ];
  return (
    <span className="tt-filter">
      <button className={`tt-funnel ${value ? "on" : ""}`} onClick={() => setOpen((o) => !o)} title="Filter Signal" aria-label="Filter Signal">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path d="M2 3h12l-4.5 5.5V13l-3 1V8.5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="tt-filter-pop" onMouseLeave={() => setOpen(false)}>
          <button className={!value ? "on" : ""} onClick={() => (onChange(null), setOpen(false))}>
            Any
          </button>
          {opts.map(([v, l]) => (
            <button key={v} className={value === v ? "on" : ""} onClick={() => (onChange(v), setOpen(false))}>
              {l}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Add a company in one step. Paste the website; the icon, name and industry fill in right
 * here (each editable), then one click adds the row. Already on Trading Post? It takes you there.
 */
function QuickAdd({ busy, onAdd, onGoTo }: { busy: boolean; onAdd: (p: { domain: string; name: string; industry: string }) => Promise<boolean>; onGoTo: (name: string) => void }) {
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<{ domain: string; name: string; industry: string; existing: string | null } | null>(null);
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const industries = fieldDef("company", "industry")!.options!;

  useEffect(() => {
    const u = url.trim();
    setErr(null);
    if (u.length < 4 || !u.includes(".")) {
      setFound(null);
      return;
    }
    const t = setTimeout(async () => {
      setLooking(true);
      try {
        const r = await fetch(`/api/table/lookup?url=${encodeURIComponent(u)}`);
        const j = await r.json();
        if (!r.ok) {
          setErr(j.error ?? "Couldn't read that website.");
          setFound(null);
          return;
        }
        setFound({ domain: j.domain, name: j.existing?.name ?? j.name ?? "", industry: j.existing?.industry ?? j.industry ?? "", existing: j.existing?.name ?? null });
      } finally {
        setLooking(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <form
      className="tt-hero-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!found) return;
        if (found.existing) return onGoTo(found.existing);
        if (await onAdd(found)) {
          setUrl("");
          setFound(null);
        }
      }}
    >
      <label htmlFor="tt-add-url">Add a company. Paste its website and we fill in the rest.</label>
      <div>
        <input id="tt-add-url" placeholder="acme.com" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        <button className="tt-primary" disabled={busy || looking || !found || (!found.existing && found.name.trim().length < 2)}>
          {looking ? "Looking up" : found?.existing ? `Go to ${found.existing}` : "Add company"}
        </button>
      </div>
      {err && <span className="tt-add-err">{err}</span>}
      {found && (
        <div className="tt-qa-preview">
          <CompanyIcon name={found.name || found.domain} domain={found.domain} />
          {found.existing ? (
            <span>
              <b>{found.existing}</b> is already on Trading Post.
            </span>
          ) : (
            <>
              <input aria-label="Company name" value={found.name} onChange={(e) => setFound({ ...found, name: e.target.value })} />
              <select aria-label="Industry" value={found.industry} onChange={(e) => setFound({ ...found, industry: e.target.value })}>
                <option value="">Industry</option>
                {industries.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
    </form>
  );
}
