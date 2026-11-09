import { cookies } from "next/headers";
import { field, recordLead, type LeadDelivery } from "../leads/record";
import { guide } from "./content/guide";

/** Cookie that opens every chapter. Value is a flag, never personal data. */
export const GUIDE_COOKIE = "rn_guide";
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const delivery: LeadDelivery = {
  formIdEnv: "HUBSPOT_GUIDE_FORM_ID",
  localFile: "guide-requests.json",
  pageUri: `https://revenuenomad.com${guide.path}`,
  pageName: guide.title,
};

export type GuideLead = { email: string; name?: string; company?: string; requested: string };

/**
 * Records a guide reader (HubSpot form when configured, else the local store) and sets the one-year cookie.
 * Shared by the chapter gate and the homepage "Get your copy" form; callers validate and redirect.
 */
export async function openGuide(lead: GuideLead): Promise<void> {
  const [firstName, ...rest] = (lead.name ?? "").split(/\s+/).filter(Boolean);
  await recordLead(
    delivery,
    [
      field("email", lead.email),
      ...(firstName ? [field("firstname", firstName)] : []),
      ...(rest.length ? [field("lastname", rest.join(" "))] : []),
      ...(lead.company ? [field("company", lead.company)] : []),
    ],
    lead
  );
  const jar = await cookies();
  jar.set(GUIDE_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
