import type { Metadata } from "next";
import "../legal/styles";
import { supportAddress } from "../legal/LegalShell";
import { PrivacyView } from "./Privacy";
import { sendOn } from "@/lib/send";

/** Read per request, so the support address set at run time (RN_SUPPORT_EMAIL) is on the page. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy · Merlin",
  description: "What Merlin collects, where it comes from, how it is used, who receives it, how long it is kept, and how Merlin uses Google user data.",
};

/** The public Privacy Policy, linked from the landing page's footer, Your credits, the Google connect screens and the signing page. */
export default function Page() {
  return <PrivacyView support={supportAddress()} send={sendOn()} />;
}
