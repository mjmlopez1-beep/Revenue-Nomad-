import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Network, { VERSIONS } from "../Network";

export const dynamicParams = false;
export function generateStaticParams() {
  return VERSIONS.map((x) => ({ v: String(x.v) }));
}
type Params = Promise<{ v: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { v } = await params;
  const x = VERSIONS.find((y) => String(y.v) === v);
  return { title: `My Network, version ${v}${x ? `: ${x.name}` : ""}` };
}

export default async function Page({ params }: { params: Params }) {
  const { v } = await params;
  const n = Number(v);
  if (!VERSIONS.some((x) => x.v === n)) notFound();
  return <Network v={n} />;
}
