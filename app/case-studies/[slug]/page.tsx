import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CasePage from "../../cases/CasePage";
import { caseBySlug, cases } from "../../cases/content";
import SiteFooter from "../../home/SiteFooter";
import SiteHeader from "../../home/SiteHeader";
import "../../home/home.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = caseBySlug(slug);
  if (!c) return {};
  return { title: `${c.company}: ${c.title} | Revenue Nomad`, description: c.lede, alternates: { canonical: `https://revenuenomad.com/case-studies/${c.slug}` } };
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params;
  const c = caseBySlug(slug);
  if (!c) notFound();
  const i = cases.indexOf(c);
  const others = [...cases.slice(i + 1), ...cases.slice(0, i)];
  return (
    <>
      <SiteHeader />
      <CasePage c={c} others={others} />
      <SiteFooter />
    </>
  );
}
