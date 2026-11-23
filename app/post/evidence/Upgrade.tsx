"use client";

/**
 * Evidence Bank on Free and Pro: the upgrade screen (BUILD_PLAN part 8, Close only). What the page
 * does, in four points, and See the Close plan. The rail already shows the Close pill; nothing here
 * reads or shows a case.
 */
import { IconCheck, IconLock } from "../../ui/shared";
import { openPlans } from "../Billing";
import { UPGRADE } from "./evidenceModel";

export function EvidenceUpgrade({ tier }: { tier: "free" | "pro" | "close" }) {
  return (
    <div className="ev-upg" data-plan={tier} data-evidence-gate>
      <div className="ev-upg-card">
        <span className="ev-upg-pill">
          <IconLock size={12} /> Close
        </span>
        <h1 className="ev-upg-title">{UPGRADE.title}</h1>
        <p className="ev-upg-lead">{UPGRADE.lead}</p>
        <ul className="ev-upg-points">
          {UPGRADE.points.map((x) => (
            <li key={x.h}>
              <span className="ev-upg-tick" aria-hidden>
                <IconCheck size={14} />
              </span>
              <span>
                <strong>{x.h}</strong>
                <span>{x.p}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="ev-upg-foot">
          <button type="button" className="btn btn-pine" onClick={() => openPlans("proposals")}>
            {UPGRADE.cta}
          </button>
          <span className="ev-upg-note">
            You are on {tier === "pro" ? "Pro" : "Free"}. Close also has proposals and contracts. Building a case never costs credits.
          </span>
        </div>
      </div>
    </div>
  );
}
