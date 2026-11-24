import type { Metadata, Viewport } from "next";
import { SignView } from "../Sign";
import { DocSignView } from "../DocSign";
import { DocSign2 } from "../DocSign2";

/** RN_CONTRACTS2, as lib/documents/store.ts contracts2On reads it (inline: this page loads no server store). */
const contracts2On = () => /^(1|on|true)$/i.test(process.env.RN_CONTRACTS2 ?? "");

export const dynamic = "force-dynamic";
/** A personal link: never in a search index, never a preview with the proposal in it. */
export const metadata: Metadata = { title: "Review and sign · Revenue Nomad", robots: { index: false, follow: false }, openGraph: null, twitter: null };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#073F2F" };

/**
 * The client's signing page: a proposal (app/sign/Sign.tsx) or a document to sign (app/sign/
 * DocSign.tsx, a "ds_" token). It works with no account: the link's token is signed and expires
 * (lib/proposals/store.ts, lib/documents/store.ts). The page loads what it shows itself, so a mail
 * scanner that fetches the link doesn't count as the client opening it.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = String(token ?? "").slice(0, 120);
  // Contracts rebuilt (RN_CONTRACTS2): a document's page is the one bar (Start, Next, Finish). Off: as before.
  if (/^ds_/.test(t)) return contracts2On() ? <DocSign2 token={t} /> : <DocSignView token={t} />;
  return <SignView token={t} />;
}
