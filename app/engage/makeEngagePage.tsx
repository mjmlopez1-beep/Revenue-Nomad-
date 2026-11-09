import type { Metadata } from "next";
import EngagePage from "./EngagePage";
import { pages, type EngageSlug } from "./content";

/**
 * Builds a "How we engage" route's exports from its content module, so each route file is a few lines.
 * The root layout's title template appends " | Revenue Nomad", so a module title that already carries the
 * suffix is trimmed first.
 */
export function makeEngagePage(slug: EngageSlug): { metadata: Metadata; Page: () => React.JSX.Element } {
  const page = pages[slug];
  const metadata: Metadata = {
    title: page.meta.title.replace(/\s*\|\s*Revenue Nomad\s*$/i, ""),
    description: page.meta.description,
    alternates: { canonical: `https://revenuenomad.com/how-we-engage/${slug}` },
  };
  function Page() {
    return <EngagePage page={page} />;
  }
  return { metadata, Page };
}
