import { redirect } from "next/navigation";

/** Old links pointed at /table; Merlin now lives at the root. Keep the sign-in code. */
export default async function TablePage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  redirect(k ? `/?k=${encodeURIComponent(k)}` : "/");
}
