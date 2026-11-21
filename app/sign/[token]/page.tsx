import type { Metadata, Viewport } from "next";
import { SignView } from "../Sign";

export const dynamic = "force-dynamic";
/** A personal link: never in a search index, never a preview with the proposal in it. */
export const metadata: Metadata = { title: "Review and sign · Revenue Nomad", robots: { index: false, follow: false }, openGraph: null, twitter: null };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#073F2F" };

/**
 * The client's signing page (app/sign/Sign.tsx). It works with no account: the link's token is
 * signed and expires (lib/proposals/store.ts). The page loads the proposal itself, so a mail
 * scanner that fetches the link doesn't count as the client opening it.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignView token={String(token ?? "").slice(0, 120)} />;
}
