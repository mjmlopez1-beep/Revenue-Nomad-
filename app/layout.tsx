import type { Metadata, Viewport } from "next";
// Self-hosted type: one family for everything, mono only for domains and links.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/red-hat-mono/wght.css";
import "./globals.css";

const TITLE = "Merlin · Companies that hire fractional leaders";
const DESCRIPTION =
  "See which companies hire fractional sales, marketing and RevOps leaders, who held each seat, what it paid and which roles are open now. Add what you know to see more. A free pilot from Revenue Nomad.";

/** Link previews need absolute image URLs: the public address when it is set. */
function base(): URL | undefined {
  try {
    return process.env.RN_PUBLIC_URL ? new URL(process.env.RN_PUBLIC_URL) : undefined;
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
