import type { Metadata, Viewport } from "next";
import { CheckView } from "./CheckView";

export const metadata: Metadata = {
  title: "Check a copy · Revenue Nomad",
  description: "Drop a PDF signed with Merlin to see whether it matches the sealed record.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#073F2F" };

/**
 * Check a copy, /check: anyone, with no account, drops a PDF and learns whether it is one Merlin
 * sealed (lib/seal.ts), and if so who signed it and when, nothing else. The file goes to
 * /api/check, is hashed in memory there and is never kept.
 */
export default function Page() {
  return <CheckView />;
}
