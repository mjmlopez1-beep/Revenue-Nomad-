"use client";

/**
 * Your profile: "Show me in Referral partners", on unless the member turned it off. It saves at
 * once (settings, partners), apart from the sheet's Save. Listed, other members see their first
 * name, title, function and the clients they want on the Referral partners page, never an email.
 */
import { useContext, useState } from "react";
import { IconCheck } from "../ui/shared";
import { UiCtx } from "./ui";

export function PartnersSwitch() {
  // Only inside the app (the sheet could be shown elsewhere): it needs the member.
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  if (!ui) return null;
  const on = ui.me.partners !== false;
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", partners: !on });
    setBusy(false);
  };
  return (
    <div className="hunt-sub pt-switch">
      <div className="hunt-h">Referral partners</div>
      <button type="button" role="switch" aria-checked={on} className={`tp-ftoggle hunt-email${on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
        <span className="tp-check" aria-hidden>
          {on && <IconCheck size={11} />}
        </span>
        <span className="tp-ftoggle-l">Show me in Referral partners</span>
      </button>
      <p className="hunt-lead">Members see your first name, title, function and the clients you want, and can write to you. Never your email.</p>
    </div>
  );
}
