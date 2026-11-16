import type { Metadata } from "next";
import Consent from "./Consent";

export const metadata: Metadata = {
  title: "Connect an app · Trading Post",
  robots: { index: false, follow: false },
};

/** The OAuth consent page: /api/oauth/authorize sends the browser here with ?r=. */
export default function ConsentPage() {
  return <Consent />;
}
