/**
 * The domain a company's icon is drawn from: its filled-in Website's host, nothing else.
 *
 * Merlin used to look a domain up from the company's name with an outside autocomplete service
 * for companies with no website. It no longer does: a company's name never leaves Merlin for an
 * icon. A company with no website gets its lettered tile. The icon itself is read by our own
 * server from that website (lib/logo.ts), never by the member's browser from an icon service.
 */

/** Domains for icons, keyed by company id: the website's host, for the companies that have one. */
export async function iconDomains(companies: { id: string; name: string; website?: string | null }[], _opts: { lookup?: boolean } = {}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const co of companies) {
    const host = co.website?.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
    if (host) out[co.id] = host;
  }
  return out;
}
