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
import { RADAR_EVERY_WORDS, YOUR_FEATURE, type RadarEmail } from "@/lib/radar/types";
import { NAME_HIDDEN_SAY, seatNameWho } from "@/lib/tableFields";

/** "Every morning by email, and in Slack": Crystal Ball's delivery as the member set it on Notifications. */
export function radarDelivery(me: { radarEmail?: RadarEmail; radarSlack?: boolean }, slack: boolean): string {
  const email = me.radarEmail ?? "daily";
  const inSlack = slack && me.radarSlack !== false;
  if (email === "off") return inSlack ? `The email is off. It still comes in Slack.` : `The email is off.`;
  const when = email === "daily" ? "Every morning something moves" : RADAR_EVERY_WORDS[email];
  return `${when}, by email${inSlack ? " and in Slack" : ""}.`;
}

/**
 * Your profile: Crystal Ball's delivery, said as it is, and a way to Notifications, where the
 * email's frequency and Slack are set (the switch that was here turned both off at once).
 */
export function RadarSwitch() {
  const ui = useContext(UiCtx);
  if (!ui) return null;
  return (
    <div className="hunt-sub pt-switch">
      <div className="hunt-h">{YOUR_FEATURE}</div>
      <p className="hunt-lead">{radarDelivery(ui.me, false)} Never on a day with nothing new.</p>
      <button type="button" className="btn btn-sm" onClick={() => ui.openPage("notifications")}>
        Change in Notifications
      </button>
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
            : "You show as your first name and last initial until you choose. On, members see your name, your seats and the clients you serve, free, and can message you. Never your email."}{" "}
        {seatNameWho(ui.me.fractionals ?? null)}{" "}
        {!ui.me.nameHidden && (
          <a className="tp-flink" href="#hide-my-name" onClick={(e) => (e.preventDefault(), document.getElementById("hide-my-name")?.focus())}>
            Hide my name on my seats
          </a>
        )}
      </p>
    </div>
  );
}

/**
 * "Hide my name on my seats" (Your profile, Your seats; linked from onboarding and the directory
 * switch). Saves at once (settings, nameHidden). On: every seat of theirs reads NAME_HIDDEN to
 * everyone else, the connector included, and they are out of the directory. Seats and roles still count.
 */
export function HideNameSwitch({ className = "hunt-sub pt-switch" }: { className?: string }) {
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  if (!ui) return null;
  const on = !!ui.me.nameHidden;
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", nameHidden: !on });
    setBusy(false);
  };
  return (
    <div className={className}>
      <div className="hunt-h">Your name on your seats</div>
      <button id="hide-my-name" type="button" role="switch" aria-checked={on} className={`tp-ftoggle hunt-email${on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
        <span className="tp-check" aria-hidden>
          {on && <IconCheck size={11} />}
        </span>
        <span className="tp-ftoggle-l">Hide my name on my seats</span>
      </button>
      <p className="hunt-lead">{on ? `${NAME_HIDDEN_SAY.replace(/^Hide your name and your/, "Your")} You're out of the Fractionals directory while it's on.` : `${seatNameWho(ui.me.fractionals ?? null)} ${NAME_HIDDEN_SAY}`}</p>
    </div>
  );
}
