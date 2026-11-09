import type { Metadata } from "next";

/**
 * Homepage metadata (design 4.7). The root layout's title template appends " | Revenue Nomad".
 * The description is the first sentence of the footer's entity paragraph (SiteFooter.tsx).
 */
export const homeMetadata: Metadata = {
  title: "Fractional revenue leadership for $1M to $200M companies",
  description: "Revenue Nomad is a fractional GTM leadership firm.",
  alternates: { canonical: "https://revenuenomad.com/" },
};
