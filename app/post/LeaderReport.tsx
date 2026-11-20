"use client";

/**
 * "They have a full-time Sales leader": a member corrects Crystal Ball (on its page and on the
 * record). A link opens a small form: the function (the member's own first) and the title from a
 * pick list (lib/leaders/types.ts memberRoles). Saving is a fact like any other (1 credit, the daily
 * limits, action "leaderReport"), and Crystal Ball stops pointing at that function there for
 * everyone. Only at a company the member can see, and not where the company's website already
 * shows a full-time leader in that function.
 */
import { useState } from "react";
import { FUNCTIONS } from "@/lib/tableFields";
import { memberRoles, type CompanyLeads } from "@/lib/leaders/types";
import { useUi } from "./ui";

const PICKABLE = FUNCTIONS.filter((f) => f !== "Other" && f !== "Executive");

export function LeaderReport({ companyId, fn, leads, from }: { companyId: string; fn: string | null; leads?: CompanyLeads; from: "radar" | "record" }) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(fn && PICKABLE.includes(fn) ? fn : "Sales");
  const [role, setRole] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const said = leads?.fns.find((l) => l.how === "members" && l.mine && l.fn === pick);
  const siteLed = (f: string) => leads?.fns.some((l) => l.fn === f && l.how !== "members" && l.kind === "full-time");
  if (fn && siteLed(fn) && !open) return null;
  const roles = memberRoles(pick);
  const save = async () => {
    if (!role) return setErr("Pick their title.");
    setBusy(true);
    setErr(null);
    const r = await ui.act({ type: "leaderReport", companyId, fn: pick, role, from }, { silentError: true });
    setBusy(false);
    if (r.ok) setOpen(false);
    else setErr(r.message);
  };
  if (!open)
    return (
      <button type="button" className="lr-open" onClick={() => setOpen(true)}>
        {said ? `You said: full-time ${said.role ?? pick} leader. Change` : `They have a full-time ${pick} leader`}
      </button>
    );
  return (
    <div className="lr-form" role="group" aria-label="They have a full-time leader">
      <label className="lr-field">
        <span>Function</span>
        <select
          className="select"
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
            setRole("");
          }}
        >
          {PICKABLE.filter((f) => !siteLed(f)).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="lr-field">
        <span>Title</span>
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Pick one</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <div className="lr-actions">
        <button type="button" className="btn btn-sm btn-pine" disabled={busy} aria-busy={busy} onClick={() => void save()}>
          {said ? "Save" : "Save · earn 1 credit"}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="lr-note">Crystal Ball stops pointing at {pick} there, for everyone.</p>
      {err && (
        <p className="lr-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
