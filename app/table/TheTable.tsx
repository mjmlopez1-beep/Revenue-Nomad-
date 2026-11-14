"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { View } from "@/lib/table";

const CATEGORIES = [
  "Open to fractionals",
  "Planning to hire",
  "Who decides",
  "Problems",
  "How to pitch them",
  "Needs a specialist",
];
const PAGE = 50;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const fmtMonth = (m: string | null) => {
  if (!m) return "—";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, (mo || 1) - 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

type Give = { company: string; category: string; text: string; asOf: string; permission: boolean };
const EMPTY_GIVE: Give = { company: "", category: "", text: "", asOf: thisMonth(), permission: false };

export default function TheTable() {
  const [view, setView] = useState<View | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [give, setGive] = useState<Give | null>(null);
  const [askText, setAskText] = useState("");
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/table", { cache: "no-store" });
    setView(await r.json());
  }, []);

  useEffect(() => {
    // Personal links look like /table?k=TOKEN — trade the token for a cookie, then clean the URL.
    const k = new URLSearchParams(window.location.search).get("k");
    (async () => {
      if (k) {
        const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signIn: k }) });
        if (!r.ok) setToast({ text: "That link isn't valid.", bad: true });
        window.history.replaceState(null, "", "/table");
      }
      await load();
    })();
  }, [load]);

  const act = async (action: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      setToast({ text: j.message ?? j.error, bad: !r.ok });
      if (r.ok) await load();
      return r.ok;
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!view) return [];
    const needle = q.trim().toLowerCase();
    return needle ? view.rows.filter((r) => r.name.toLowerCase().includes(needle)) : view.rows;
  }, [view, q]);

  if (!view) return <p className="tt-empty">Loading the table…</p>;
  const me = view.me;
  const noMatch = q.trim() && rows.length === 0;

  const startGive = (company = "") => {
    setGive({ ...EMPTY_GIVE, company });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="tt">
      <header className="tt-head">
        <div>
          <h1>The Table</h1>
          <p className="tt-sub">
            Give one, get one. Share what you know about a company to earn a credit. Spend a credit to see
            what other members know, or to ask the ones who&apos;ve been there.
          </p>
        </div>
        {me ? (
          <div className="tt-me">
            <div className="tt-credits">
              <strong>{me.credits}</strong> credit{me.credits === 1 ? "" : "s"}
            </div>
            <button className="btn" onClick={() => startGive()} disabled={busy}>
              + Give
            </button>
          </div>
        ) : null}
      </header>

      {view.demo && (
        <div className="tt-banner">
          Demo data — no member seed is loaded. Build it with <code>scripts/build-intel-seed.py</code>. Try it with{" "}
          <a href="/table?k=demo">the demo link</a>.
        </div>
      )}
      {!me && !view.demo && (
        <div className="tt-banner">Open The Table from your personal Revenue Nomad link to give and get.</div>
      )}
      {toast && (
        <div className={`tt-toast ${toast.bad ? "bad" : ""}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      {give && (
        <form
          className="tt-give"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ type: "give", ...give })) setGive(null);
          }}
        >
          <div className="tt-give-row">
            <input
              list="tt-companies"
              placeholder="Company"
              value={give.company}
              onChange={(e) => setGive({ ...give, company: e.target.value })}
              autoFocus={!give.company}
            />
            <select value={give.category} onChange={(e) => setGive({ ...give, category: e.target.value })}>
              <option value="">What kind?</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="tt-asof">
              True as of
              <input type="month" value={give.asOf} max={thisMonth()} onChange={(e) => setGive({ ...give, asOf: e.target.value })} />
            </label>
          </div>
          <textarea
            placeholder="One specific line another seller can act on. e.g. “CFO signs anything over $50k; they used a fractional VP Sales in 2025 and liked it.”"
            maxLength={280}
            value={give.text}
            onChange={(e) => setGive({ ...give, text: e.target.value })}
            autoFocus={!!give.company}
          />
          <div className="tt-give-foot">
            <label className="tt-check">
              <input type="checkbox" checked={give.permission} onChange={(e) => setGive({ ...give, permission: e.target.checked })} />
              I&apos;m allowed to share this. Nothing confidential, no private personnel or financial details.
            </label>
            <span className="tt-dim">{280 - give.text.length}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setGive(null)}>
              Cancel
            </button>
            <button className="btn" disabled={busy}>
              Give · +1
            </button>
          </div>
          <datalist id="tt-companies">
            {view.rows.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </datalist>
        </form>
      )}

      {me && view.questionsForYou.length > 0 && (
        <section className="tt-strip">
          <h2>Questions for you · answer one to earn a credit</h2>
          {view.questionsForYou.map((x) => (
            <div key={x.id} className="tt-strip-item">
              <span>
                <b>{x.company}</b> — “{x.question}”
              </span>
              <button className="btn btn-ghost tt-sm" onClick={() => startGive(x.company)}>
                Answer · +1
              </button>
            </div>
          ))}
        </section>
      )}

      {me && view.toConfirm.length > 0 && (
        <section className="tt-strip">
          <h2>Is this you? We listed you on these from your profile</h2>
          {view.toConfirm.slice(0, 5).map((x) => (
            <div key={x.companyId} className="tt-strip-item">
              <span>
                <b>{x.company}</b> <span className="tt-dim">— {x.evidence.slice(0, 90)}{x.evidence.length > 90 ? "…" : ""}</span>
              </span>
              <span className="tt-inline">
                <button className="btn btn-ghost tt-sm" disabled={busy} onClick={() => act({ type: "confirm", companyId: x.companyId })}>
                  ✓ Yes, ask me
                </button>
                <button className="btn btn-ghost tt-sm" disabled={busy} onClick={() => act({ type: "remove", companyId: x.companyId })}>
                  ✕ Remove
                </button>
              </span>
            </div>
          ))}
          {view.toConfirm.length > 5 && <p className="tt-dim">+{view.toConfirm.length - 5} more</p>}
        </section>
      )}

      {me?.admin && view.flagged.length > 0 && (
        <section className="tt-strip">
          <h2>Flagged notes · admin review</h2>
          {view.flagged.map((n) => (
            <div key={n.id} className="tt-strip-item">
              <span>
                <b>{n.company}</b> — {n.text} <span className="tt-dim">(flag: {n.reason})</span>
              </span>
              <span className="tt-inline">
                <button className="btn btn-ghost tt-sm" onClick={() => act({ type: "review", noteId: n.id, decision: "restore" })}>Restore</button>
                <button className="btn btn-ghost tt-sm" onClick={() => act({ type: "review", noteId: n.id, decision: "remove" })}>Remove</button>
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="tt-search">
        <input
          placeholder={`Search ${view.rows.length} companies members know…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
        <span className="tt-dim">
          {view.stats.members} members · {view.stats.notes} notes · {view.stats.asks} asks
        </span>
      </div>

      {noMatch ? (
        <div className="tt-empty">
          Nobody&apos;s on <b>{q}</b> yet.{" "}
          {me && (
            <button className="linkish" onClick={() => startGive(q.trim())}>
              Know it? Be the first to give →
            </button>
          )}
        </div>
      ) : (
        <table className="tt-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Known by</th>
              <th>Notes</th>
              <th>Freshest</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const isOpen = open === r.id;
              const notes = view.notes[r.id] ?? [];
              return (
                <Fragment key={r.id}>
                  <tr className={isOpen ? "open" : ""} onClick={() => { setOpen(isOpen ? null : r.id); setAskText(""); }}>
                    <td>
                      <b>{r.name}</b>
                      {r.verified && <span className="tt-tag" title="At least one engagement corroborated by the buyer">✓ verified</span>}
                      {r.youKnow && <span className="tt-tag you">you</span>}
                      {r.openAsks > 0 && <span className="tt-tag ask">{r.openAsks} wanted</span>}
                    </td>
                    <td>
                      {r.knownBy > 0 ? (
                        <>
                          {r.knownBy} <span className="tt-dim">· {r.titles.join(", ")}</span>
                        </>
                      ) : (
                        <span className="tt-dim">—</span>
                      )}
                    </td>
                    <td>
                      {r.notes > 0 ? (
                        <>
                          {r.notes} <span className="tt-dim">· {r.categories.slice(0, 2).join(", ")}</span>
                        </>
                      ) : (
                        <span className="tt-dim">0</span>
                      )}
                    </td>
                    <td className="tt-dim">{fmtMonth(r.freshest)}</td>
                    <td className="tt-act">{r.notes > 0 && !r.unlocked ? "Get · 1" : r.notes > 0 ? "Open" : "Ask · 1"}</td>
                  </tr>
                  {isOpen && (
                    <tr className="tt-detail">
                      <td colSpan={5}>
                        {notes.length > 0 &&
                          notes.map((n) => (
                            <div key={n.id} className="tt-note">
                              <span className="tt-tag">{n.category}</span> {n.text}
                              <div className="tt-dim tt-note-meta">
                                Member-reported · true as of {fmtMonth(n.asOf)} · not independently verified
                                {n.mine ? (
                                  <>
                                    {" "}· yours{n.status === "flagged" ? " (flagged, hidden)" : ""} ·{" "}
                                    <button className="linkish" onClick={() => act({ type: "withdraw", noteId: n.id })}>withdraw</button>
                                  </>
                                ) : (
                                  <>
                                    {" "}·{" "}
                                    <button
                                      className="linkish"
                                      onClick={() => {
                                        const reason = window.prompt("What's wrong with this note? (inaccurate, confidential, stale…)");
                                        if (reason !== null) act({ type: "flag", noteId: n.id, reason });
                                      }}
                                    >
                                      flag
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        {!me ? (
                          <p className="tt-dim">Open your personal link to see and share notes.</p>
                        ) : (
                          <div className="tt-detail-actions">
                            {r.notes > 0 && !r.unlocked && (
                              <button className="btn tt-sm" disabled={busy} onClick={() => act({ type: "unlock", companyId: r.id })}>
                                Get {r.notes} note{r.notes > 1 ? "s" : ""} · 1 credit
                              </button>
                            )}
                            {r.knownBy > 0 && !r.youKnow && (
                              <form
                                className="tt-ask"
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  if (await act({ type: "ask", companyId: r.id, question: askText })) setAskText("");
                                }}
                              >
                                <input
                                  placeholder={`Ask the ${r.knownBy} member${r.knownBy > 1 ? "s" : ""} who know ${r.name}…`}
                                  value={askText}
                                  maxLength={200}
                                  onChange={(e) => setAskText(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button className="btn btn-ghost tt-sm" disabled={busy}>Ask · 1</button>
                              </form>
                            )}
                            <button className="btn btn-ghost tt-sm" onClick={() => startGive(r.name)}>
                              I know {r.name} · Give +1
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > limit && (
        <button className="btn btn-ghost tt-more" onClick={() => setLimit(limit + PAGE)}>
          Show more ({rows.length - limit} left)
        </button>
      )}

      {me && view.myAsks.length > 0 && (
        <section className="tt-strip">
          <h2>Your asks</h2>
          {view.myAsks.map((x) => (
            <div key={x.id} className="tt-strip-item">
              <span>
                <b>{x.company}</b> — “{x.question}”
              </span>
              <span className="tt-dim">{x.answered ? "Answered — open the row" : x.refunded ? "No answer · credit refunded" : "Waiting"}</span>
            </div>
          ))}
        </section>
      )}

      {me && (
        <p className="tt-foot tt-dim">
          Signed in as {me.name} ({me.title}). Other members only see that “a {me.title}” knows a company — never your name.{" "}
          <button className="linkish" onClick={async () => { await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signOut: true }) }); load(); }}>
            Sign out
          </button>
        </p>
      )}
    </div>
  );
}
