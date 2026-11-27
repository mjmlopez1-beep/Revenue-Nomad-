import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../brand.css";
import "../../mock.css";
import { MOCKUPS, THEMES, type MockTheme } from "../../Shell";
import Landing from "../../views/Landing";
import Home from "../../views/Home";
import CrystalBall from "../../views/CrystalBall";
import Company from "../../views/Company";
import Pipeline from "../../views/Pipeline";

const VIEWS = { landing: Landing, home: Home, "crystal-ball": CrystalBall, company: Company, pipeline: Pipeline } as const;

export const dynamicParams = false;
export function generateStaticParams() {
  return THEMES.flatMap((theme) => MOCKUPS.map((m) => ({ theme, slug: m.slug })));
}

type Params = Promise<{ theme: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const m = MOCKUPS.find((x) => x.slug === slug);
  return { title: `Merlin mockup: ${m?.label ?? slug}` };
}

export default async function MockupPage({ params }: { params: Params }) {
  const { theme, slug } = await params;
  const View = VIEWS[slug as keyof typeof VIEWS];
  if (!View || !THEMES.includes(theme as MockTheme)) notFound();
  return <View theme={theme as MockTheme} />;
}
