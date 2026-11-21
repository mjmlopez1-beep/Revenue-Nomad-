"use client";

/**
 * Your profile: "Show me in the Fractionals directory" (Referral partners' switch before it). It
 * saves at once (settings, fractionals), apart from the sheet's Save. On: other members see their
 * full name, title, seats and the clients they serve in Fractionals, free, never an email. Off:
 * they are out of the directory. Not chosen yet: they show by first name and last initial.
 */
import { useContext, useState } from "react";
import { IconCheck } from "../ui/shared";
import { UiCtx } from "./ui";
import { FEATURE_NAME, YOUR_FEATURE } from "@/lib/radar/types";

/**
 * Your profile: "Send me <FEATURE_NAME> emails", the radar by email and Slack (lib/radar), on
 * unless the member turned it off here or with the radar email's link. Saves at once, like the switch below.
 */
export function RadarSwitch() {
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  if (!ui) return null;
  const on = ui.me.radar !== false;
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", radar: !on });
    setBusy(false);
  };
  return (
    <div className="hunt-sub pt-switch">
      <div className="hunt-h">{YOUR_FEATURE}</div>
      <button type="button" role="switch" aria-checked={on} className={`tp-ftoggle hunt-email${on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
        <span className="tp-check" aria-hidden>
          {on && <IconCheck size={11} />}
        </span>
        <span className="tp-ftoggle-l">Send me {FEATURE_NAME} emails</span>
      </button>
      <p className="hunt-lead">On mornings when a company in your profile moves, by email and in Slack if you connected it. Never on a day with nothing new.</p>
    </div>
  );
}

export function PartnersSwitch() {
  // Only inside the app (the sheet could be shown elsewhere): it needs the member.
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  if (!ui) return null;
  const on = ui.me.fractionals === true;
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", fractionals: !on });
    setBusy(false);
  };
  return (
    <div className="hunt-sub pt-switch">
      <div className="hunt-h">Fractionals</div>
      <button type="button" role="switch" aria-checked={on} className={`tp-ftoggle hunt-email${on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
        <span className="tp-check" aria-hidden>
          {on && <IconCheck size={11} />}
        </span>
        <span className="tp-ftoggle-l">Show me in the Fractionals directory</span>
      </button>
      <p className="hunt-lead">
        {ui.me.fractionals === false
          ? "You're out of the directory. Members you already talk to can still write to you."
          : ui.me.fractionals === true
            ? "Members see your name, your seats and the clients you serve, free, and can message you. Never your email."
            : "You show as your first name and last initial until you choose. On, members see your name, your seats and the clients you serve, free, and can message you. Never your email."}
      </p>
    </div>
  );
}
