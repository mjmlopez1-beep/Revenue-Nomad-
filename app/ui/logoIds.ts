/**
 * Known companies' public ids by the domain their logo is drawn from, so CompanyLogo (shared.tsx)
 * can draw a logo given only a domain from our own GET /api/logo/<public id>. Filled in the browser
 * from the member's own table as it loads (app/post/model.ts infoOf): only companies the page
 * already names are in it, so a locked company's domain is never here. Nothing on the server.
 */
const COMPANY_ID = /^c_[\w-]{6,40}$/;
const ids = new Map<string, string>();

export const logoKey = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

export function rememberLogo(domain: string | null | undefined, id: string): void {
  if (typeof window === "undefined" || !domain || !COMPANY_ID.test(id)) return;
  const k = logoKey(domain);
  if (k) ids.set(k, id);
}

export const logoIdFor = (domain: string | null | undefined): string | undefined => (domain ? ids.get(logoKey(domain)) : undefined);
