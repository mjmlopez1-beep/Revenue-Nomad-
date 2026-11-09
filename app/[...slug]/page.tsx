import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import { hrefs, routes, stubRoutes, type Route } from "../home/content/links";
import "../home/home.css";

/**
 * Stub for every destination the homepage links to that is not built yet (design 4.5).
 * Static: only paths in links.ts are generated; anything else is the Next.js 404.
 * Not indexed, and it never reads query strings.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return stubRoutes.map((p) => ({ slug: p.slice(1).split("/") }));
}

type Props = { params: Promise<{ slug: string[] }> };

async function routeOf(params: Props["params"]): Promise<Route> {
  const { slug } = await params;
  return `/${slug.join("/")}` as Route;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = await routeOf(params);
  return { title: routes[path], robots: { index: false, follow: true } };
}

export default async function StubPage({ params }: Props) {
  const path = await routeOf(params);
  const title = routes[path];
  return (
    <>
      <SiteHeader />
      <main className="stub">
        <div className="rn-wrap">
          <p className="rn-eyebrow">Revenue Nomad</p>
          <h1 className="rn-h1">{title}</h1>
          <p className="rn-lede">This page is being built. Talk to us in the meantime.</p>
          <Link className="rn-btn" href={hrefs.talk}>
            Talk to us
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
