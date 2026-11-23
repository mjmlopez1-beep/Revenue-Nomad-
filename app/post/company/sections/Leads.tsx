"use client";

/**
 * Who leads each function, from the company's own website (lib/leaders): roles only, never a person.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import type { CompanyRec } from "@/lib/tableTypes";
import { checkedWords, leadItems } from "@/lib/leaders/types";

/**
 * Who leads each function, from the company's own website (lib/leaders): "Sales: full-time CRO
 * since Nov 2024 · Marketing: fractional CMO · from the company's website, checked Nov 18". Roles
 * only, never a person, so it shows wherever the company's basics do, a hidden company too (with
 * no link to its site there).
 */
export function LeadsLine({ c }: { c: CompanyRec }) {
  const leads = c.leads;
  if (!leads?.fns.length) return null;
  const url = c.hidden ? null : leads.fns.map((l) => l.url).find((u): u is string => !!u && /^https?:\/\//i.test(u));
  // Only members' word on file ("Sales: full-time CRO (members say)"): no website to name as the source.
  const site = leads.fns.some((l) => l.how !== "members");
  return (
    <p className="tp-dleads">
      <span className="tp-dleads-h">Who leads each function</span>{" "}
      <span className="tp-dleads-t">{leadItems(leads).join(" · ")}</span>
      {site && <span className="tp-dleads-src">
        {" · from "}
        {url ? (
          <a className="tp-link" href={url} target="_blank" rel="noreferrer nofollow">
            the company&apos;s website
          </a>
        ) : (
          "the company's website"
        )}
        , checked {checkedWords(leads.checkedAt)}
      </span>}
    </p>
  );
}
