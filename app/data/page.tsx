import type { Metadata } from "next";
import "../claim/claim.css";
import "./data.css";
import { DataFlows } from "./DataFlows";
import { sendOn } from "@/lib/send";

/** Read per request, so Approve and send's switch (RN_SEND) set at run time is on the page. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Where Merlin's data goes · Merlin",
  description: "What leaves Merlin, where it goes and why, whether any of it trains an AI model, and who can switch each part off.",
};

/** The public "Where Merlin's data goes" page, linked from the landing page's footer and Your credits. Same content as docs/data-flows.md. */
export default function Page() {
  return <DataFlows send={sendOn()} />;
}
