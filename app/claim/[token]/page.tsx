import type { Metadata } from "next";
import { cookies } from "next/headers";
import { STARTER_CREDITS, claimPage, contactInfo, type ClaimPage } from "@/lib/table";
import { ClaimView } from "../Claim";

export const dynamic = "force-dynamic";
/** A personal link: never in a search index. */
export const metadata: Metadata = { title: "Is this your seat? · Merlin", robots: { index: false, follow: false } };

/**
 * A seat's personal claim link, /claim/<token> (lib/claimToken.ts), optionally with ?ref=<inviteCode>.
 * It works signed out. What the seat says comes from lib/table.ts claimPage (free facts only), and
 * anything that goes wrong reading it is a friendly page, never an error page.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const q = await searchParams;
  const ref = typeof q.ref === "string" ? q.ref.slice(0, 40) : null;
  let info: ClaimPage | null = null;
  try {
    info = await claimPage(token, (await cookies()).get("rn_table")?.value ?? null, ref);
  } catch (e) {
    console.error("claim page could not be read", e);
  }
  return <ClaimView token={String(token ?? "").slice(0, 64)} initial={info} refCode={ref} support={contactInfo().support} starter={STARTER_CREDITS} />;
}
