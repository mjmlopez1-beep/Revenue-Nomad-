import type { Metadata, Viewport } from "next";
// Self-hosted type: one family for everything, mono only for domains and links.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/red-hat-mono/wght.css";
import "./globals.css";
// Sortable table headers (app/ui/sortable.tsx), here so the component stays free of a CSS import (the in-process tests load it).
import "./ui/sortable.css";

const TITLE = "Merlin · The data exchange for fractional operators";
const DESCRIPTION =
  "Merlin is a data exchange for fractional operators. Share what you know about fractional work to earn credits, and see which companies hire fractionals, what they've paid and which roles are open now. From Revenue Nomad.";

/** Link previews need absolute image URLs: the public address when it is set. */
function base(): URL | undefined {
  try {
    // Link previews need an absolute image address. Without RN_PUBLIC_URL (the homepage is built
    // ahead of time, so it must be there at build time) the pilot's own address is used.
    return new URL(process.env.RN_PUBLIC_URL || "https://table-pilot.up.railway.app");
  } catch {
    return undefined;
  }
}

/** Read per request where the page is dynamic, so the public address set at run time is used. */
export const generateMetadata = (): Metadata => ({
  metadataBase: base(),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Merlin",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Merlin by Revenue Nomad",
    type: "website",
    images: [{ url: "/brand/merlin-og-banner.png", width: 1200, height: 630, alt: "Merlin by Revenue Nomad" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/brand/merlin-og-banner.png"] },
});

/**
 * viewport-fit=cover lets the safe-area padding in the CSS take effect (a phone on its side keeps
 * content clear of the notch). The browser's own bar takes the pine of the top bar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#073F2F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
