import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteFooter from "../../home/SiteFooter";
import SiteHeader from "../../home/SiteHeader";
import { solutionBySlug, solutions } from "../content";
import SolutionPage from "../SolutionPage";
import "../../home/home.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return solutions.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = solutionBySlug(slug);
  if (!s) return {};
  return { title: s.title, description: s.lede, alternates: { canonical: `https://revenuenomad.com/problems/${s.slug}` } };
}

export default async function ProblemPage({ params }: Props) {
  const { slug } = await params;
  const s = solutionBySlug(slug);
  if (!s) notFound();
  return (
    <>
      <SiteHeader />
      <SolutionPage s={s} />
      <SiteFooter />
    </>
  );
}
