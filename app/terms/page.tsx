import type { Metadata } from "next";
import "../legal/styles";
import { supportAddress } from "../legal/LegalShell";
import { TermsView } from "./Terms";

/** Read per request, so the support address set at run time (RN_SUPPORT_EMAIL) is on the page. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service · Merlin",
  description: "The rules for using Merlin: plans and credits, what members add, acceptable use, the connector, proposals and e-signature, payments, and liability.",
};

/** The public Terms of Service, linked from the landing page's footer, Your credits and the signing page. */
export default function Page() {
  // The credits a new member starts with, as lib/table.ts STARTER_CREDITS reads them (25 unless RN_STARTER_CREDITS says otherwise).
  const n = Number.parseInt(process.env.RN_STARTER_CREDITS ?? "", 10);
  return <TermsView support={supportAddress()} starter={Number.isFinite(n) && n >= 0 ? n : 25} />;
}
