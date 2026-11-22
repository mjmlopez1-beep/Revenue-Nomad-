"use client";

/**
 * Remove my name, with no account and no claim link: a name and a company. A name on a seat at
 * that company that is the same person, and that nobody verified or claimed, comes off at once
 * (POST /api/table/names { op: "forget" }). The answer is the same whether or not anything
 * matched, so the page can't be used to look names up. Phone first.
 */
import { useId, useRef, useState } from "react";
import "../claim/claim.css";
import { Brand, IconCheck } from "../ui/shared";

const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u;

export function RemoveView() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = useId();
  const head = useRef<HTMLHeadingElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = name.trim().replace(/\s+/g, " ");
    const c = company.trim();
    if (!NAME_RE.test(n)) return setError("Type your first and last name, the way they show on the seat.");
    if (c.length < 2) return setError("Type the company's name or its website.");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/table/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "forget", name: n, company: c }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error || "That didn't go through. Try again.");
      else {
        setDone(j.message || "Done.");
        setTimeout(() => head.current?.focus());
      }
    } catch {
      setError("We couldn't reach Merlin. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="cl">
      <header className="cl-top">
        <a className="cl-brand" href="/" aria-label="Merlin, by Revenue Nomad">
          <Brand dark size={36} />
        </a>
      </header>
      <main className="cl-main">
        <section className="cl-card" aria-live="polite">
          {done ? (
            <>
              <span className="cl-done" aria-hidden>
                <IconCheck size={20} />
              </span>
              <h1 className="cl-h" ref={head} tabIndex={-1}>
                Thanks
              </h1>
              <p className="cl-p">{done}</p>
              <button
                type="button"
                className="btn btn-lg cl-wide"
                onClick={() => {
                  setDone(null);
                  setName("");
                  setCompany("");
                }}
              >
                Remove it from another company
              </button>
              <a className="cl-link" href="/">
                Open Merlin
              </a>
            </>
          ) : (
            <>
              <h1 className="cl-h">Remove my name</h1>
              <p className="cl-p">
                Merlin lists seats fractional leaders hold at their clients, and the leaders a company names on its own website. If your name is on Merlin and you&apos;d
                rather it wasn&apos;t, tell us where. It comes off at once and stays off, with any email Merlin read from your own website. You don&apos;t need an account.
              </p>
              <form className="cl-form" onSubmit={submit} noValidate>
                <label className="cl-label" htmlFor={`${id}-name`}>
                  Your first and last name
                </label>
                <input id={`${id}-name`} className="input" autoComplete="name" placeholder="Jane Smith" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                <label className="cl-label" htmlFor={`${id}-co`}>
                  The company
                </label>
                <input id={`${id}-co`} className="input" autoComplete="organization" placeholder="Acme, or acme.com" maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
                {error && (
                  <p className="cl-err" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn btn-pine btn-lg cl-wide" disabled={busy} aria-busy={busy}>
                  {busy ? "Removing" : "Remove my name"}
                </button>
              </form>
              <p className="cl-help">Got a link from us about your seat? It has a Remove my name button too.</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
