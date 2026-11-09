import type { Metadata } from "next";
import RolePage from "./RolePage";
import { pages, type RoleSlug } from "./content";

/**
 * Builds a role route's exports from its content module, so each route file is a few lines.
 * The root layout's title template appends " | Revenue Nomad", so a module title that already carries the
 * suffix is trimmed first.
 */
export function makeRolePage(slug: RoleSlug): { metadata: Metadata; Page: () => React.JSX.Element } {
  const page = pages[slug];
  const metadata: Metadata = {
    title: page.meta.title.replace(/\s*\|\s*Revenue Nomad\s*$/i, ""),
    description: page.meta.description,
    alternates: { canonical: `https://revenuenomad.com/${slug}` },
  };
  function Page() {
    return <RolePage page={page} />;
  }
  return { metadata, Page };
}
