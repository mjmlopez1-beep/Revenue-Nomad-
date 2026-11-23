"use client";

/**
 * "What's new in Merlin": the short release notes for members who used the old look (BUILD_PLAN
 * part 2, Stage 9). Shown at the top of the page in the new look until the member closes it, then
 * never again: the dismissal is kept on their profile like a page's first-visit strip
 * (Profile.stripsOff, key "whatsnew", lib/ui2.ts), so a second device agrees. A member who starts in
 * the new look never sees it (the set-up turns it off as it ends, app/onboard/Setup.tsx).
 *
 * The three things moved out of sight on purpose each get a line (saved views, Invite, search),
 * with Settings in one place and Alerts and workflows. Plain words, no numbers.
 */
import { useState } from "react";
import { IconX } from "../../ui/shared";
import { setFindStart } from "../find/start";
import { setCreditsStart } from "../pageStart";
import { useAppMaybe } from "./pages";
import { WHATS_NEW, WHATS_NEW_KEY, whatsNewShown } from "./releaseNotes";
import "./shell.css";

export function WhatsNew() {
  const c = useAppMaybe();
  // On a phone the five lines fold behind one button, so the page stays on the first screen (desktop shows them all).
  const [open, setOpen] = useState(false);
  if (!c || !whatsNewShown({ ui2: c.ui2, stripsOff: c.me.stripsOff, gone: c.start.stripOff(WHATS_NEW_KEY) })) return null;
  const close = () => c.start.dismissStrip(WHATS_NEW_KEY);
  return (
    <section className="ws-strip ws-new" aria-label="What's new in Merlin">
      <div className="ws-new-t">
        <strong>What&apos;s new in Merlin.</strong> Everything you had is still here. A few things moved
        <span className="ws-new-colon">:</span>
        <span className="ws-new-more">
          .{" "}
          <button type="button" className="ws-new-go" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide what moved" : `See what moved (${WHATS_NEW.length})`}
          </button>
        </span>
        <ul className={`ws-new-list${open ? " is-open" : ""}`}>
          {WHATS_NEW.map((x) => (
            <li key={x.key}>
              {x.text}{" "}
              <button
                type="button"
                className="ws-new-go"
                onClick={() => {
                  if (x.find) setFindStart({ lookup: "" });
                  if (x.tab) setCreditsStart(x.tab);
                  c.openPage(x.page);
                }}
              >
                {x.go}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <span className="ws-strip-acts">
        <button type="button" className="btn btn-sm" onClick={close}>
          Got it
        </button>
      </span>
      <button type="button" className="ws-strip-x" aria-label="Close What's new" onClick={close}>
        <IconX size={16} />
      </button>
    </section>
  );
}
