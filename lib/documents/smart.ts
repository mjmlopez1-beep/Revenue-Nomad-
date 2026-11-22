/**
 * "Drop in a contract, fields placed for you": Merlin reads an uploaded PDF's signature blocks
 * (lib/documents/detect.ts) and proposes, for the member to check before anything is saved:
 *
 *  - who signs, in order: the other party first, the member's own party last (countersigning).
 *    The member's party is the block that names them or their firm (their name inside it, like
 *    "Jordan Avery Advisory LLC"), else the block whose role is the consultant's side. The other
 *    party's signer is who the contract names in their block, else the decision maker on the
 *    company's Merlin record (only what the member's own table shows them), else the person their
 *    pipeline deal is with. Their email: the block's, an address in the contract with their first
 *    name, or the record's. What isn't found stays blank for the member to type.
 *  - a field for each labelled line: Signature, Full name, a Title the signer can check (filled
 *    in), Date signed. A line already answered in print gets no field.
 *  - a title from the file's name and the parties ("Cedar and Pine · Statement of Work"), and a
 *    short note to the signer in the member's saved voice (lib/voice.ts).
 *
 * Close (lib/billing/rules.ts canClose, the trial included). Nothing is stored here: the app saves
 * the fields and signers it keeps through the ordinary update (lib/documents/store.ts).
 */
import { loadSeed, loadState, viewPatch, tableInternals as T } from "../table";
import { NEUTRAL_VOICE, expandContractions, styleOf, type VoiceStyle } from "../voice";
import { upgradeUrl } from "../plan";
import { PRICES } from "../billing/rules";
import { ProposalProblem, companyFor, lookUpCompany, proposalInternals as PI } from "../proposals/store";
import { readOriginal } from "./files";
import { docRec } from "./store";
import { emailsIn, findParties, readPdfText, type FoundParty, type PageText, type RowKind } from "./detect";
import type { DocField, DocumentRec, FieldKind } from "./types";

export const SMART_PLAN = `Merlin placing the fields for you is on Close: $${PRICES.closeMonth} a month. You can place them by hand.`;
export const NOTHING_FOUND = "Merlin couldn't find signature lines in this contract, so place the fields by hand.";

export interface SmartSigner {
  /** The app's id for this signer until it is saved ("new_p0"). */
  key: string;
  name: string;
  email: string;
  title: string;
  /** The member, countersigning. */
  me: boolean;
  /** The company or firm the block is for. */
  party: string;
  /** Where Merlin found them, in words. */
  found: string;
}

export interface SmartReading {
  found: boolean;
  title: string;
  message: string;
  /** In signing order: the other party, then the member. */
  signers: SmartSigner[];
  /** Fields with `signer` set to a SmartSigner's key. */
  fields: DocField[];
  /** "8 fields placed" and the one line on what they are. */
  count: number;
  summary: string;
  /** The pages with fields, 0-based. */
  pages: number[];
  /** The company on Merlin the contract is with, when Merlin found it. */
  company: { id: string | null; name: string };
  /** What the contract is: "statement of work", "consulting agreement". */
  kind: string;
}

/* ---------- pure: the plan from what was read ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const LEGAL = /[,\s]+(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|lp|llp|pc)\.?$/i;
/** "Cedar and Pine Software, Inc." reads "Cedar and Pine Software". */
export const plainName = (s: string) => {
  let t = s.trim();
  for (let i = 0; i < 2; i++) t = t.replace(LEGAL, "").trim();
  return t.replace(/[,\s]+$/, "");
};
/** For a title: "Cedar and Pine Software" reads "Cedar and Pine". */
const shortName = (s: string) => plainName(s).replace(/\s+(software|technologies|technology|systems|group|holdings|labs|solutions)$/i, "") || plainName(s);
const firstOf = (s: string) => s.trim().split(/\s+/)[0] ?? "";

const KINDS: [RegExp, string][] = [
  [/\b(sow|statement of work)\b/i, "statement of work"],
  [/\bmsa\b|master services agreement/i, "master services agreement"],
  [/\bnda\b|non-?disclosure|confidentiality agreement/i, "confidentiality agreement"],
  [/\bconsulting agreement\b/i, "consulting agreement"],
  [/\bengagement letter\b/i, "engagement letter"],
  [/\border form\b/i, "order form"],
  [/\b(services agreement|service agreement)\b/i, "services agreement"],
  [/\bproposal\b/i, "proposal"],
  [/\bcontract\b/i, "contract"],
  [/\bagreement\b/i, "agreement"],
];
/** What the contract is, from its file name, then its first lines. */
export function contractKind(fileName: string, firstText: string): string {
  const name = fileName.replace(/[_-]+/g, " ");
  for (const [re, k] of KINDS) if (re.test(name)) return k;
  for (const [re, k] of KINDS) if (re.test(firstText.slice(0, 600))) return k;
  return "agreement";
}
/** "Statement of Work". */
const cap = (s: string) => s.replace(/\b[a-z]+/g, (w, i: number) => (i > 0 && /^(of|and|the|for|to|a|an)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));

/** "Hi Dana, here's the statement of work we discussed. Happy to walk through anything before you sign." In the member's voice. */
export function contractMessage(voice: VoiceStyle | null, signer: string, kind: string, me: string): string {
  const v = voice ?? NEUTRAL_VOICE;
  const first = firstOf(signer);
  const greet = v.greeting === "none" || !first ? "" : v.greeting.replace("{first}", first);
  const formal = v.formality === "formal";
  let body = formal ? `Here's the ${kind} we discussed, ready for your signature. I'm glad to walk through anything before you sign.` : `Here's the ${kind} we discussed. Happy to walk through anything before you sign.`;
  // "Hi Dana, here's the ..." reads as one sentence; after "Dear Dana," a new one starts.
  if (greet && !formal) body = body.charAt(0).toLowerCase() + body.slice(1);
  if (!v.contractions) body = expandContractions(body).replace(/\b([Hh])ere's\b/g, "$1ere is");
  const name = v.name === "none" ? "" : v.name === "full" ? me : firstOf(me);
  const sign = v.signoff === "none" ? "" : `${v.signoff} ${name}`.trim();
  return [greet, body, sign].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

const SAY: Record<RowKind, string> = { signature: "a signature", name: "name", title: "title", date: "date" };
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const pagesWords = (ps: number[]) => (ps.length === 1 ? `page ${ps[0] + 1}` : `pages ${listWords(ps.map((p) => String(p + 1)))}`);

const NOTICE = /([A-Z][a-z'’-]+(?: [A-Z][a-z'’-]+){1,2}),\s*([A-Z][A-Za-z ]{1,40}?),\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
/** A person named with their title and email anywhere in the contract (its notices clause), not the member. */
function noticeOf(pages: PageText[], myEmail: string): { name: string; title: string; email: string; page: number } | null {
  for (const [page, pg] of pages.entries())
    for (const r of pg.runs) {
      const m = r.text.match(NOTICE);
      if (m && m[3].toLowerCase() !== myEmail.toLowerCase()) return { name: m[1], title: m[2].trim(), email: m[3].toLowerCase(), page };
    }
  return null;
}

export interface PlanContext {
  me: { name: string; email: string; title: string };
  voice: VoiceStyle | null;
  fileName: string;
  /** The other party's company on Merlin, with its decision maker as the member's table shows them. */
  company?: { id: string; name: string; maker?: { name: string; title?: string; email?: string } | null; dealWith?: { name: string; title?: string } | null } | null;
  /** The page sizes as shown, in points. */
  sizes: { w: number; h: number }[];
}

/** Is this block the member's own: their name or their firm. */
export function isMine(p: FoundParty, me: { name: string; email: string }): boolean {
  const n = norm(me.name);
  if (!n) return false;
  const last = n.split(" ").slice(-1)[0];
  const first = n.split(" ")[0];
  const org = norm(p.org);
  const nm = norm(p.name ?? "");
  return (!!org && (org.includes(n) || (first !== last && org.includes(`${first} ${last}`)))) || nm === n || (!!p.email && p.email === me.email.toLowerCase());
}
const CONSULTANT_SIDE = /^(consultant|contractor|provider|service provider|vendor|agency|advisor|adviser|supplier)$/i;

/** The plan from the blocks read: signers in order, the fields, the title and the note. */
export function planFrom(parties: FoundParty[], pages: PageText[], ctx: PlanContext): SmartReading {
  const firstText = pages[0]?.runs.map((r) => r.text).join(" ") ?? "";
  const kind = contractKind(ctx.fileName, firstText);
  const empty: SmartReading = { found: false, title: "", message: "", signers: [], fields: [], count: 0, summary: "", pages: [], company: { id: null, name: "" }, kind };
  const usable = parties.filter((p) => p.rows.some((r) => r.kind === "signature"));
  if (!usable.length) return empty;

  // The same company with two blocks (two pages) is one signer.
  const groups: { key: string; parties: FoundParty[] }[] = [];
  for (const p of usable) {
    const k = norm(plainName(p.org)) || norm(p.role ?? "") || `#${groups.length}`;
    const g = groups.find((x) => x.key === k);
    if (g) g.parties.push(p);
    else groups.push({ key: k, parties: [p] });
  }
  let mineAt = groups.findIndex((g) => g.parties.some((p) => isMine(p, ctx.me)));
  if (mineAt < 0) mineAt = groups.findIndex((g) => g.parties.some((p) => p.role && CONSULTANT_SIDE.test(p.role)));
  // Two blocks, one of them the company on Merlin: the other is the member's.
  if (mineAt < 0 && groups.length === 2 && ctx.company) {
    const co = norm(plainName(ctx.company.name));
    const theirs = groups.findIndex((g) => g.parties.some((p) => co && norm(plainName(p.org)) === co));
    if (theirs >= 0) mineAt = 1 - theirs;
  }
  const docEmails = emailsIn(pages);
  const others = groups.filter((_, i) => i !== mineAt);
  const signers: SmartSigner[] = [];
  const keyOf = new Map<(typeof groups)[number], string>();
  others.forEach((g, i) => {
    const p = g.parties.find((x) => x.name) ?? g.parties[0];
    const org = plainName(g.parties.find((x) => x.org)?.org ?? "") || p.role || "";
    const onMerlin = ctx.company && (i === 0 || norm(plainName(org)) === norm(plainName(ctx.company.name))) ? ctx.company : null;
    const maker = onMerlin?.maker ?? null;
    const deal = onMerlin?.dealWith ?? null;
    let name = p.name ?? "";
    let title = g.parties.find((x) => x.title)?.title ?? "";
    let email = g.parties.find((x) => x.email)?.email ?? "";
    const where: string[] = [];
    const pg = pagesWords([...new Set(g.parties.map((x) => x.page))]);
    if (name) where.push(`on ${pg}`);
    let fromRecord = false;
    // A notices line: "Notices to the Company: Dana Whitfield, CEO, dana@cedarpine.example".
    if (!name && i === 0) {
      const hit = noticeOf(pages, ctx.me.email);
      if (hit) (name = hit.name), (title ||= hit.title), (email ||= hit.email), where.push(`on ${pagesWords([hit.page])}`);
    }
    if (!name && maker?.name) (name = maker.name), (title ||= maker.title ?? ""), (fromRecord = true);
    else if (!name && deal?.name) (name = deal.name), (title ||= deal.title ?? ""), (fromRecord = true);
    if (name && maker && norm(maker.name) === norm(name)) {
      title ||= maker.title ?? "";
      if (!email && maker.email) (email = maker.email.toLowerCase()), (fromRecord = true);
      fromRecord = true;
    }
    if (!email && name) {
      const f = firstOf(name).toLowerCase();
      const hit = docEmails.find((e) => e.split("@")[0].split(/[._-]/).includes(f) && e !== ctx.me.email.toLowerCase());
      if (hit) (email = hit), where.length || where.push(`on ${pg}`);
    }
    if (!name && !email && docEmails.length === 1 && docEmails[0] !== ctx.me.email.toLowerCase()) email = docEmails[0];
    const found = fromRecord
      ? `Found on ${pg} and in your Merlin record`
      : where.length
        ? `Found ${where.join(" ")}`
        : `Their signature line is on ${pg}. Type who signs for ${org || "them"}.`;
    const key = `new_p${i}`;
    keyOf.set(g, key);
    signers.push({ key, name, email, title, me: false, party: org, found });
  });
  if (mineAt >= 0) {
    const g = groups[mineAt];
    const org = plainName(g.parties.find((x) => x.org)?.org ?? "") || g.parties[0].role || "";
    const title = g.parties.find((x) => x.title)?.title || ctx.me.title;
    keyOf.set(g, "new_me");
    const before = signers[0] ? firstOf(signers[0].name) : "";
    signers.push({ key: "new_me", name: ctx.me.name, email: ctx.me.email.toLowerCase(), title, me: true, party: org, found: signers.length ? (before ? `Countersign after ${before}` : "Countersign last") : "You sign" });
  }

  const KIND: Record<RowKind, FieldKind> = { signature: "signature", name: "name", title: "text", date: "date" };
  const fields: DocField[] = [];
  let n = 0;
  for (const g of groups) {
    const key = keyOf.get(g)!;
    const sg = signers.find((x) => x.key === key)!;
    for (const p of g.parties)
      for (const r of p.rows) {
        if (r.value) continue;
        const f: DocField = { id: `f_auto${(n++).toString(36)}`, page: r.page, x: r.x, y: r.y, w: r.w, h: r.h, kind: KIND[r.kind], signer: key, required: true };
        if (r.kind === "title") {
          f.label = "Title";
          if (sg.title) f.prefill = sg.title;
        }
        fields.push(f);
      }
  }
  // A block with only printed answers and no signature line left (impossible by the filter above) still needs one.
  const pagesUsed = [...new Set(fields.map((f) => f.page))].sort((a, b) => a - b);
  const kinds = (["signature", "name", "title", "date"] as RowKind[]).filter((k) => usable.some((p) => p.rows.some((r) => r.kind === k && !r.value)));
  const rank = (k: RowKind) => ["signature", "name", "title", "date"].indexOf(k);
  const labels = [...new Set(usable.flatMap((p) => p.rows.filter((r) => !r.value)).sort((a, b) => rank(a.kind) - rank(b.kind)).map((r) => r.label))];
  const each = groups.length > 1 ? (mineAt >= 0 && groups.length === 2 ? "for each of you" : "for each signer") : `for ${firstOf(signers[0]?.name ?? "") || "the signer"}`;
  const other = signers.find((x) => !x.me);
  const titled = fields.some((f) => f.prefill && f.signer === other?.key);
  const otherFirst = firstOf(other?.name ?? "") || "them";
  const fills = kinds.includes("title") ? (titled ? ` Names and titles are filled in for ${otherFirst} to check.` : " Names fill in from each signature.") : kinds.includes("name") ? " Names fill in from each signature." : "";
  const summary = `${listWords(kinds.map((k) => SAY[k]))} ${each}, next to ${listWords(labels.map((l) => `"${l}"`))} on ${pagesWords(pagesUsed)}.${fills}`.replace(/^([a-z])/, (c) => c.toUpperCase());

  const co = other?.party ? shortName(other.party) : ctx.company ? shortName(ctx.company.name) : "";
  const title = `${co ? `${co} · ` : ""}${cap(kind)}`.slice(0, 160);
  const message = other ? contractMessage(ctx.voice, other.name, kind, ctx.me.name) : "";
  return {
    found: true,
    title,
    message,
    signers,
    fields,
    count: fields.length,
    summary,
    pages: pagesUsed,
    company: ctx.company ? { id: ctx.company.id, name: ctx.company.name } : { id: null, name: other?.party ?? "" },
    kind,
  };
}

/* ---------- the server: read one of the member's drafts ---------- */

/** The decision maker on a company's record, as the member's own table shows them (a locked name stays out). */
async function makerOf(token: string, pub: string): Promise<{ name: string; title?: string; email?: string } | null> {
  const patch = await viewPatch(token, [pub], { asMember: true });
  const c = patch?.companies?.find((x) => x.id === pub);
  if (!c) return null;
  const v = (cells: Record<string, { s: string; v?: unknown }>, k: string) => (cells[k]?.s === "value" ? String(cells[k].v ?? "").trim() : "");
  const dm = c.people.find((p) => !p.engagementId && /decision maker/i.test(v(p.cells as never, "relationship")) && v(p.cells as never, "name"));
  if (!dm) return null;
  const cells = dm.cells as never;
  return { name: v(cells, "name"), ...(v(cells, "title") ? { title: v(cells, "title") } : {}), ...(v(cells, "email") ? { email: v(cells, "email") } : {}) };
}

/** Read one of the member's draft documents and propose where everything goes. */
export async function readContract(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<{ document: DocumentRec; reading: SmartReading }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s, token);
  if (!T.closeNow(s, me.id, nowMs)) throw new ProposalProblem(SMART_PLAN, 403, upgradeUrl(PI.base(origin), "proposals"));
  const d = (s.documents ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!d) throw new ProposalProblem("That document isn't there anymore. Open Proposals again.", 404);
  if (d.sentAt) throw new ProposalProblem("It went out for signature already.");
  const bytes = await readOriginal(d.id);
  if (!bytes) throw new ProposalProblem("The file isn't there anymore. Upload it again.", 410);
  let pages: PageText[];
  try {
    pages = await readPdfText(bytes);
  } catch {
    pages = [];
  }
  const parties = findParties(pages);
  // The other party's company on Merlin: the one already linked, else its name as find_company finds it.
  let company: PlanContext["company"] = null;
  const mineProbe = { name: me.name, email: me.email };
  const theirs = parties.find((p) => p.org && !isMine(p, mineProbe));
  const pub = d.companyPub ?? (theirs ? (await lookUpCompany(token, theirs.org, origin)) ?? (await lookUpCompany(token, plainName(theirs.org), origin)) : null);
  if (pub && token) {
    const co = await companyFor(token, pub);
    if (co) {
      const deal = [...(s.pipeline?.[me.id]?.entries ?? [])].filter((e) => e.companyId === co.internal).sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""))[0];
      company = {
        id: pub,
        name: co.name || theirs?.org || d.companyName,
        maker: await makerOf(token, pub),
        dealWith: deal?.to?.name && !deal.to.google ? { name: deal.to.name, ...(deal.to.role ? { title: deal.to.role } : {}) } : null,
      };
    }
  }
  const voice = s.voice?.[me.id] ? styleOf(s.voice[me.id]) : null;
  const reading = planFrom(parties, pages, { me: { name: me.name, email: me.email, title: PI.titleOf(s, me) }, voice, fileName: d.fileName, company, sizes: pages.map((p) => ({ w: p.w, h: p.h })) });
  return { document: docRec(d, nowMs, origin), reading };
}
