"use client";

/** Member settings shown on Your credits. Today that is one switch: the weekly email of new open roles. */
import { useEffect, useState } from "react";
import { useUi } from "./ui";
import "./pages.css";

export function WeeklyEmail() {
  const ui = useUi();
  const saved = ui.me.digest;
  const fn = ui.me.function;
  // What the member just picked, shown until the server's answer arrives.
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? saved;
  useEffect(() => {
    if (picked !== null && picked === saved) setPicked(null);
  }, [picked, saved]);
  const toggle = async () => {
    const next = !on;
    setPicked(next);
    const r = await ui.act({ type: "settings", digest: next });
    if (!r.ok) setPicked(null);
  };
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h" id="tp-set-digest">
          Weekly email
        </h2>
        <p className="cr-note" id="tp-set-digest-d">
          {fn && fn !== "Other" ? `One email a week, after the scan, with the new open ${fn} roles and the ones that closed.` : "One email a week, after the scan, with the new open roles and the ones that closed."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="tp-set-digest"
        aria-describedby="tp-set-digest-d"
        className={`tp-switch${on ? " on" : ""}`}
        onClick={() => void toggle()}
      >
        <span className="tp-switch-track" aria-hidden>
          <span className="tp-switch-knob" />
        </span>
        <span className="tp-switch-l">{on ? "On" : "Off"}</span>
      </button>
    </section>
  );
}
