"use client";

/**
 * "Add <Name> to Merlin": a client that isn't on Merlin yet, added from its website so the
 * proposal links to it (lib/proposals/addCompany.ts). The website is read as its host
 * ("sevenfigureagency.com/" is sevenfigureagency.com), and the name the site gives itself fills
 * in, for the member to change. Other members see the company, as they would any a member adds:
 * never who added it, or that there's a proposal.
 */
import { useEffect, useRef, useState } from "react";
import type { ProposalRec } from "@/lib/proposals/types";
import { normaliseSite, properCase } from "@/lib/proposals/startCall";
import { api } from "./ProposalParts";

export function AddCompany({
  proposalId,
  name: name0,
  website: site0,
  onAdded,
  onCancel,
}: {
  proposalId?: string;
  name: string;
  website?: string | null;
  onAdded: (r: { proposal: ProposalRec | null; companyId: string; name: string; added: boolean }) => void;
  onCancel?: () => void;
}) {
  const looksSite = !!normaliseSite(name0) && /\./.test(name0);
  const [site, setSite] = useState(site0 ?? (looksSite ? normaliseSite(name0) ?? "" : ""));
  const [name, setName] = useState(looksSite ? "" : properCase(name0));
  const [typedName, setTypedName] = useState(!looksSite && !!name0.trim());
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const read = useRef("");

  /** The name the site gives itself, unless the member typed one. */
  const lookUp = async (raw: string) => {
    const host = normaliseSite(raw);
    if (!host || host === read.current) return;
    read.current = host;
    setSite(host);
    setReading(true);
    const r = await api<{ website: string; name: string | null }>({ op: "site_name", website: host });
    setReading(false);
    if (!r.error && r.name && !typedName) setName(r.name);
  };
  useEffect(() => {
    if (site) void lookUp(site);
    // Once, for the website the call or the box gave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    setErr(null);
    if (!normaliseSite(site)) return setErr("Type its website, like sevenfigureagency.com.");
    if (name.trim().length < 2) return setErr("Type the company's name as it goes by.");
    setBusy(true);
    const r = await api<{ proposal: ProposalRec | null; companyId: string; name: string; added: boolean }>({ op: "add_company", id: proposalId, name: name.trim(), website: site });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onAdded(r);
  };
  const shown = name.trim() || "it";
  return (
    <form
      className="ac"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <span className="ac-t">{name.trim() ? `${name.trim()} isn't on Merlin yet.` : "Not on Merlin yet."} Add it, and your pipeline moves when they sign.</span>
      <label className="pp-field">
        <span className="pp-field-l">Its website</span>
        <input className="input" inputMode="url" autoComplete="off" value={site} placeholder="sevenfigureagency.com" onChange={(e) => setSite(e.target.value)} onBlur={(e) => void lookUp(e.target.value)} />
      </label>
      <label className="pp-field">
        <span className="pp-field-l">Its name{reading ? " · reading the site" : ""}</span>
        <input className="input" autoComplete="off" value={name} placeholder="Seven Figure Agency" onChange={(e) => (setName(e.target.value), setTypedName(true))} />
      </label>
      <span className="pp-muted ac-note">Other members see the company on Merlin, never who added it or that you have a proposal there.</span>
      {err && <span className="pp-link-err">{err}</span>}
      <span className="ac-btns">
        <button type="submit" className="btn btn-sm" aria-busy={busy} disabled={busy}>
          {busy ? "Adding it" : `Add ${shown} to Merlin`}
        </button>
        {onCancel && (
          <button type="button" className="tp-flink" onClick={onCancel}>
            Not now
          </button>
        )}
      </span>
    </form>
  );
}
