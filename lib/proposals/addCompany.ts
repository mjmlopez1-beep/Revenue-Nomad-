/**
 * A client company that isn't on Merlin yet (a small agency, say), added from its website so a
 * proposal can be linked and the pipeline moves when they sign.
 *
 *  - siteName: the website as typed ("sevenfigureagency.com/", "https://www.X.com/about") read as
 *    its host, and the name the site gives itself (og:site_name, else its title), read the way
 *    lib/about reads homepages (robots.txt first, every hop checked) with a short timeout. The
 *    member can change the name.
 *  - addCompanyFor: the ordinary Add a company action (lib/table.ts "add"): a company already on
 *    Merlin by that website or name is that company, and its refusals still apply (an example or
 *    placeholder name, a fractional firm). What it earns is what that action earns. Then the
 *    proposal or document is linked to it. Other members see a company on Merlin, like any other
 *    a member adds: never who added it, and never that there is a proposal (the pipeline is the
 *    member's own).
 */
import { ActionError, perform } from "../table";
import { fetchHomepage } from "../about/fetch";
import { ProposalProblem, linkProposal, lookUpCompany } from "./store";
import { normaliseSite, properCase } from "./startCall";
import type { ProposalRec } from "./types";

/** How long reading the site's name may take. */
export const SITE_NAME_MS = 3500;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const unent = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));

/** The name a homepage gives itself: og:site_name, else the title's shortest telling part ("Home | Seven Figure Agency" is "Seven Figure Agency"). */
export function nameFromHtml(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']{2,80})["']/i) ?? html.match(/<meta[^>]+content=["']([^"']{2,80})["'][^>]*property=["']og:site_name["']/i);
  if (og) return unent(og[1]).trim();
  const t = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i);
  if (!t) return null;
  const parts = unent(t[1])
    .split(/\s+[|·–—-]\s+|\s*\|\s*/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(home|homepage|welcome|official site|official website)$/i.test(x));
  if (!parts.length) return null;
  // A tagline is long; the name is short.
  return [...parts].sort((a, b) => a.length - b.length)[0].slice(0, 80);
}

/** The website as its host, and the name its homepage gives, when it can be read in time. */
export async function siteName(raw: unknown, read: typeof fetchHomepage = fetchHomepage): Promise<{ website: string; name: string | null }> {
  const website = normaliseSite(String(raw ?? ""));
  if (!website) throw new ProposalProblem("Type its website, like sevenfigureagency.com.");
  try {
    const page = await read(website, { timeoutMs: SITE_NAME_MS, maxBytes: 200 * 1024 });
    return { website, name: page.ok ? nameFromHtml(page.html) : null };
  } catch {
    return { website, name: null };
  }
}

/** Add the company (or find it, when it's on Merlin already) and link the proposal to it. */
export async function addCompanyFor(token: string | null, a: { proposalId?: unknown; name?: unknown; website?: unknown }, origin?: string, nowMs = Date.now()): Promise<{ proposal: ProposalRec | null; companyId: string; name: string; added: boolean }> {
  if (!token) throw new ProposalProblem("You're signed out. Sign in again.", 401);
  const website = normaliseSite(String(a.website ?? ""));
  if (!website) throw new ProposalProblem("Type its website, like sevenfigureagency.com.");
  const name = properCase(String(a.name ?? "").replace(/\s+/g, " ").trim()).slice(0, 80);
  if (name.length < 2) throw new ProposalProblem("Type the company's name as it goes by.");
  // On Merlin already, by its website or its exact name: that company.
  let pub = (await lookUpCompany(token, website, origin)) ?? (await lookUpCompany(token, name, origin));
  let added = false;
  if (!pub) {
    try {
      const r = await perform(token, { type: "add", company: name, website }, origin, { asMember: true });
      pub = (r as { id?: string }).id ?? null;
      added = true;
    } catch (e) {
      if (e instanceof ActionError) throw new ProposalProblem(e.message);
      throw e;
    }
  }
  if (!pub) throw new ProposalProblem("Merlin couldn't add that company. Check its name and website.");
  const proposal = typeof a.proposalId === "string" && a.proposalId ? await linkProposal(token, a.proposalId, { companyId: pub }, origin, nowMs) : null;
  return { proposal, companyId: pub, name, added };
}
