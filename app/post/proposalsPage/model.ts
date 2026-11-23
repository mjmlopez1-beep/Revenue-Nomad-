/**
 * Proposals in the new look (Proposals.dc.html, ProposalEditor.dc.html), as pure data so
 * scripts/test-proposals-page.mts checks it with no browser:
 *
 *   rowOf          one proposal as the table reads it: status, reader activity, the next step,
 *                  the seat and value, when the link ends, and which views it is in
 *   VIEWS, inView  All, Needs you, Out with clients, Drafts, Signed or closed
 *   blockState     a section's state in the editor's outline ("2 blanks", "Ready", "Changed, not saved yet")
 *   templateMarkdown   a library example, as the file a template is saved from (the upload reads it into sections)
 *   frozenOf       the proposal as the client will read it, for the preview (the same shape the server freezes)
 *   EXAMPLE_ROWS   the two example rows on a first visit: labelled, never counted, never sent
 *
 * Nothing here is guessed: a value Merlin doesn't have reads "Not set yet", never a made-up number.
 */
import type { FrozenDoc, ProposalBlock, ProposalRec } from "@/lib/proposals/types";
import type { ActivityView } from "@/lib/close/types";
import { blanksOf, docFields, fieldLabel, fill, templateBlocks, templateDef, TEMPLATES } from "@/lib/proposals/library";
import { priced } from "@/lib/proposals/pricing";
import { minWords } from "@/lib/close/activity";
import { example, type Example } from "../examples";

const DAY = 86_400_000;
const short = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const firstName = (s: string | null | undefined) => String(s ?? "").trim().split(/\s+/)[0] ?? "";

/* ---------- the views ---------- */

export type ViewKey = "all" | "needs" | "out" | "draft" | "done";
export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs you" },
  { key: "out", label: "Out with clients" },
  { key: "draft", label: "Drafts" },
  { key: "done", label: "Signed or closed" },
];

/** What the table needs from a proposal's activity (GET /api/activity?id=): read once a row is sent. */
export type ActivityLite = Pick<ActivityView, "stats" | "suggestion" | "timeline" | "reminders" | "sections">;

/** The next step's button: what it does when pressed. */
export type NextKind = "open" | "countersign" | "follow" | "pipeline";

export interface Row {
  id: string;
  co: string;
  who: string;
  status: ProposalRec["status"];
  version: number;
  /** Reader activity, two lines. */
  a1: string;
  a2: string;
  next: { label: string; kind: NextKind; main: boolean };
  ns: string;
  seat: string;
  days: string;
  val: string;
  vs: string;
  /** Link ends, two lines, and whether it ends within 10 days (the one ember dot a row may carry). */
  l1: string;
  l2: string;
  due: boolean;
  tpl: string;
  tv: string;
  views: ViewKey[];
  /** Has a price (for the column's fill line). */
  priced: boolean;
  /** Has a signer (name and email). */
  signer: boolean;
  /** Sent at least once and still out. */
  out: boolean;
  opened: boolean;
}

/** The fee a proposal carries: the recommended option (or the only one), else the fee fields in its words. */
export function valueOf(p: ProposalRec): { val: string; vs: string; priced: boolean } {
  const opts = p.pricing?.options ?? [];
  if (opts.length) {
    const rec = opts.find((o) => o.recommended) ?? opts[0];
    const adds = p.pricing?.addOns.length ?? 0;
    return {
      val: rec.price ? priced(rec.price, rec.billing) : "No price yet",
      vs: opts.length > 1 ? `${opts.length} options${rec.recommended ? ", this one recommended" : ""}` : adds ? plural(adds, "add-on") : "One price",
      priced: rec.price > 0,
    };
  }
  const f = p.fields;
  const monthly = f["pricing.monthlyFee"]?.trim();
  const fixed = f["pricing.fixedFee"]?.trim();
  const months = f["term.initialMonths"]?.trim();
  if (monthly) return { val: /month/i.test(monthly) ? monthly : `${monthly} a month`, vs: months ? `${months} month term` : fixed ? `Plus ${fixed} fixed` : "From the call", priced: true };
  if (fixed) return { val: `${fixed} fixed`, vs: "One fixed fee", priced: true };
  return { val: "Not set yet", vs: "Set it in the draft", priced: false };
}

/** The seat a proposal is for, in a few words: the library example's kind, else what the title says it is for. */
const SEAT: Record<string, string> = { "fractional-sales-leader": "Fractional sales leader", "sprint-90": "90 day program", "ongoing-retainer": "Retainer", "revops-build": "RevOps build", advisory: "Advisory" };
export function seatOf(p: ProposalRec): string {
  if (p.templateId && SEAT[p.templateId]) return SEAT[p.templateId];
  const t = p.title.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{3,48}?)\s+(?:for|at|with)\s+\S/i);
  return m && !/^(a |an |the )?proposal$/i.test(m[1]) ? m[1] : "Not set yet";
}

/** The template's short name ("Fractional sales leader"), or the member's own template's title. */
export function templateName(p: ProposalRec, mine: { id: string; title: string }[] = []): string {
  if (!p.templateId) return "Blank";
  const own = mine.find((t) => t.id === p.templateId);
  if (own) return own.title;
  const t = templateDef(p.templateId);
  return t ? t.title.split(":")[0] : "Your own template";
}

export function rowOf(p: ProposalRec, act: ActivityLite | null, nowMs = Date.now(), mine: { id: string; title: string }[] = []): Row {
  const x = p.send;
  const st = p.status;
  const signerName = x?.signer.name || p.signer?.name || p.fields["client.signerName"] || "";
  const signerTitle = x?.signer.title || p.signer?.title || p.fields["client.signerTitle"] || "";
  const who = signerName ? `${signerName}${signerTitle ? `, ${signerTitle}` : ""}` : "Signer not set yet";
  const first = firstName(signerName) || "They";
  const v = valueOf(p);
  const allocation = p.fields["pricing.allocation"]?.trim();
  const months = p.fields["term.initialMonths"]?.trim();
  const blanks = blanksOf(p.blocks, docFields(p)).length;
  const opens = act?.stats.opens ?? 0;
  const out = st === "sent" || st === "viewed";
  const opened = !!x?.viewedAt || opens > 0;

  // Reader activity: counted only once it went out.
  let a1: string;
  let a2: string;
  if (st === "draft") {
    a1 = blanks ? `${plural(blanks, "blank")} to fill` : "Nothing left blank";
    a2 = `Edited ${short(p.updatedAt)}. Not sent.`;
  } else if (!opened) {
    a1 = "Not opened yet";
    const days = x ? Math.max(0, Math.floor((nowMs - Date.parse(x.sentAt)) / DAY)) : 0;
    a2 = x ? `Sent ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.` : "";
  } else {
    const most = act?.stats.mostRead;
    const mostMs = act?.sections.find((s) => s.top)?.ms ?? 0;
    a1 = opens ? `Opened ${opens === 1 ? "once" : opens === 2 ? "twice" : `${opens} times`}${act && act.stats.readers > 1 ? ` · ${act.stats.readers} readers` : most && mostMs ? ` · ${minWords(mostMs)} on ${most}` : ""}` : `Opened ${short(x?.viewedAt)}`;
    const last = act?.timeline.find((t) => !/^you sent/i.test(`${t.strong ?? ""}${t.text}`.trim()));
    a2 = st === "client_signed" ? `${first} signed ${short(x?.signedAt)}` : st === "signed" ? `Signed by both${x?.memberSignedAt || x?.signedAt ? ` on ${short(x?.memberSignedAt ?? x?.signedAt)}` : ""}` : st === "declined" ? `Declined ${short(x?.declinedAt)}${x?.declineReason ? `. Reason: ${x.declineReason}` : "."}` : last ? `${last.strong ?? ""}${last.text}`.trim() : `Sent ${short(x?.sentAt)}`;
  }

  // The next step: one button, the main one only where it's the member's turn.
  const sug = act?.suggestion ?? null;
  let next: Row["next"];
  let ns: string;
  if (st === "draft") (next = { label: "Finish draft", kind: "open", main: false }), (ns = blanks ? "Fill the blanks, then send it" : "Then send it to sign");
  else if (st === "client_signed") (next = { label: "Countersign", kind: "countersign", main: true }), (ns = "Your turn. Then it's sealed");
  else if (st === "signed") (next = { label: "See Pipeline", kind: "pipeline", main: false }), (ns = "Moved to Won");
  else if (st === "declined") (next = { label: "See why", kind: "follow", main: false }), (ns = x?.declineReason ? "A smaller scope, or later" : "Ask what would work");
  else if (st === "void" || st === "expired") (next = { label: "Send again", kind: "open", main: false }), (ns = st === "void" ? "You voided the link" : "The link expired");
  else if (sug && sug.key !== "wait") (next = { label: sug.key === "question" ? "Answer" : "Follow up", kind: "follow", main: false }), (ns = sug.when);
  else {
    const planned = act?.reminders.filter((r) => r.state === "planned" && r.on).sort((a, b) => a.at.localeCompare(b.at))[0];
    next = { label: "See activity", kind: "follow", main: false };
    ns = planned ? `Next reminder: ${short(planned.at)}` : "Nothing to do yet";
  }

  // When the link ends.
  let l1: string;
  let l2: string;
  let due = false;
  if (st === "draft") (l1 = "Not sent"), (l2 = p.linkDays === 0 ? "No end date once sent" : `${p.linkDays} days once sent`);
  else if (!out) (l1 = "Closed"), (l2 = st === "signed" ? "Copy sent to both" : st === "client_signed" ? "Waiting for you" : st === "declined" ? "Moved to Lost" : st === "void" ? "Voided" : "Expired");
  else if (!x?.expiresAt) (l1 = "No end date"), (l2 = "You chose no end");
  else {
    const left = Math.ceil((Date.parse(x.expiresAt) - nowMs) / DAY);
    l1 = left <= 0 ? "Ends today" : `${plural(left, "day")} left`;
    l2 = `Ends ${short(x.expiresAt)}`;
    due = left <= 10;
  }
  if (st === "client_signed") (l1 = "Signed by them"), (l2 = "Waiting for you"), (due = false);

  const views: ViewKey[] = ["all"];
  if (st === "client_signed" || (out && sug && sug.key !== "wait")) views.push("needs");
  if (out || st === "client_signed") views.push("out");
  if (st === "draft") views.push("draft");
  if (st === "signed" || st === "declined" || st === "void" || st === "expired") views.push("done");

  return {
    id: p.id,
    co: p.company.name || "No company yet",
    who,
    status: st,
    version: p.version,
    a1,
    a2,
    next,
    ns,
    seat: seatOf(p),
    days: allocation || (months ? `${months} months` : "Set it in the draft"),
    val: v.val,
    vs: v.vs,
    l1,
    l2,
    due,
    tpl: templateName(p, mine),
    tv: st === "draft" ? (p.version > 1 ? `Version ${p.version}, a draft` : "Draft") : `Version ${p.version}`,
    views,
    priced: v.priced,
    signer: !!(p.signer?.email || x?.signer.email),
    out,
    opened,
  };
}

export const inView = (r: { views: ViewKey[] }, v: ViewKey) => r.views.includes(v);
/** The order "what needs you first": your turn, then out with a nudge due, then out, drafts, closed. */
export function needsFirst(rows: Row[]): Row[] {
  const rank = (r: Row) => (r.status === "client_signed" ? 0 : r.views.includes("needs") ? 1 : r.out ? 2 : r.status === "draft" ? 3 : 4);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/* ---------- the editor's outline ---------- */

export type BlockTone = "ready" | "wait" | "work" | "fix";
export function blockState(b: ProposalBlock, p: ProposalRec, fields: Record<string, string>, o: { marked?: boolean; editing?: boolean; close?: boolean } = {}): { text: string; tone: BlockTone } {
  if (o.marked) return { text: "Changed, not saved yet", tone: "work" };
  if (o.editing) return { text: "Editing", tone: "work" };
  // Evidence Bank is a Close feature: without Close (a proposal kept read only) Proof reads as any section.
  // With it: how many of the member's cases Proof holds, or that it needs one (Merlin never writes a case).
  if (b.blockId === "proof" && o.close !== false) {
    const n = p.proofCases?.length ?? 0;
    if (n && (fields.caseStudies ?? "").trim()) return { text: `${plural(n, "case")} from Evidence Bank`, tone: "ready" };
    if (!(fields.caseStudies ?? "").trim()) return { text: "Needs a case", tone: "fix" };
  }
  const n = blanksOf([b], fields).length;
  if (n) return { text: plural(n, "blank"), tone: "fix" };
  if (b.blockId === "investment" && p.pricing?.options.length) return { text: `${plural(p.pricing.options.length, "option")} · ${plural(p.pricing.addOns.length, "add-on")}`, tone: "ready" };
  if (b.blockId === "signature") return { text: p.memberSign === "now" ? "You sign as it goes" : p.memberSign === "after" ? "You countersign" : "No signature from you", tone: "ready" };
  return { text: "Ready", tone: "ready" };
}

/* ---------- templates ---------- */

/** The five examples in the library, in the mockup's words: title, sections, who it suits. */
const ABOUT: Record<string, string> = {
  "fractional-sales-leader": "An assessment first, then you lead the team",
  "sprint-90": "A fixed program with a clear end",
  "ongoing-retainer": "Extend or grow a seat you already hold",
  "revops-build": "A scoped build with milestones",
  advisory: "A few hours a month, no delivery",
};
export const LIBRARY = TEMPLATES.map((t) => ({ id: t.id, title: t.title, short: t.title.split(":")[0], sections: t.blocks.length, about: ABOUT[t.id] ?? t.bestFor.split(/[.:]/)[0] }));
/** How many sections a blank proposal starts with. */
export const BLANK_SECTIONS = templateBlocks(null).length;

/**
 * A library example as the Markdown file a template of the member's own is saved from: its title as
 * the first heading, each section as a heading with its starting text (fields stay as {{blanks}}).
 * The upload reads it back into sections (lib/proposals/templateParse.ts), so a template made here
 * is stored exactly like one uploaded.
 */
export function templateMarkdown(templateId: string, name: string): string {
  const blocks = templateBlocks(templateId);
  const lines = [`# ${name.replace(/\s+/g, " ").trim() || "My template"}`, ""];
  for (const b of blocks) lines.push(`## ${b.title}`, "", b.body.trim() || "Write this section in your own words.", "");
  return lines.join("\n");
}
/** The file name a template made from an example is saved under: what its tile says it came from. */
export const BUILT_FROM = "Built from a Merlin example.md";
export const fromWords = (fileName: string) => (fileName === BUILT_FROM ? "Built from a Merlin example" : `Read from ${fileName}`);

/* ---------- the client's view, for the preview ---------- */

/** The proposal as the client will read it: what the server freezes when it is sent (lib/proposals/store.ts freeze). */
export function frozenOf(p: ProposalRec, close: boolean, nowIso = new Date().toISOString(), me?: { name: string; title: string }): FrozenDoc {
  const signer = p.signer ?? { name: p.fields["client.signerName"] ?? "", email: p.fields["client.signerEmail"] ?? "", title: p.fields["client.signerTitle"] ?? "" };
  const f = docFields({ ...p, signer });
  // A blank still to fill reads as its label in brackets: it can't go out like that, and the preview says what is missing.
  const blank = (k: string) => `[${fieldLabel(k)}]`;
  return {
    title: p.title,
    version: p.version,
    company: p.company.name,
    from: { name: f["provider.name"] || me?.name || "", title: f["provider.title"] || me?.title || "" },
    to: { name: signer.name, title: signer.title ?? "", email: signer.email },
    blocks: p.blocks.map((b) => ({ title: b.title, text: fill(b.body, f, blank), kind: b.blockId })),
    ...(close && p.pricing?.options.length ? { pricing: structuredClone(p.pricing) } : {}),
    preparedAt: nowIso,
  };
}

/** What a template's opening reads like in the voice picked (the maker's preview). */
export const GREETINGS = ["Hi {first},", "{first},", "Hello {first},"] as const;
export const TONES = [
  { key: "neutral", label: "Plain and direct", line: "Here is what I heard on our call, what I will do about it, and what it costs." },
  { key: "casual", label: "Warm", line: "Thank you for the time on our call. I enjoyed it, and here is how I would help." },
  { key: "formal", label: "Formal", line: "Further to our conversation, please find my proposed scope, terms and fees below." },
] as const;
export const LENGTHS = [
  { key: "short", label: "Short" },
  { key: "medium", label: "Medium" },
] as const;
export function openingLine(greeting: string, tone: number, client = "Dana"): string {
  return `${greeting.replace("{first}", client)} ${TONES[tone]?.line ?? TONES[0].line}`;
}
/** The first sections of an example, each with where it fills from, for the preview. */
export function previewSections(templateId: string): { title: string; from: string }[] {
  return templateBlocks(templateId)
    .filter((b) => b.blockId !== "cover")
    .slice(0, 5)
    .map((b) => ({ title: b.title, from: b.blockId === "proof" ? "Your Evidence Bank cases, closest first" : b.blockId === "terms" ? "Your standing terms, kept" : b.blockId === "investment" ? "Set for each client" : /what_we_heard|why_now|the_math/.test(b.blockId) ? "Filled from the call" : "From this example" }));
}
/** The text a section starts with, filled with what is known (the editor's preview of a block). */
export const filled = (b: ProposalBlock, fields: Record<string, string>) => fill(b.body, fields);

/* ---------- first visit ---------- */

/** An example row on a first visit: what a sent proposal looks like before the member has one. Never counted or sent. */
export type ExampleRow = Pick<Row, "co" | "who" | "a1" | "a2" | "ns" | "seat" | "days" | "val" | "vs" | "l1" | "l2" | "tpl" | "tv"> & { status: "client_signed" | "viewed"; key: string };
export const EXAMPLE_ROWS: readonly Example<ExampleRow>[] = [
  example({ key: "ex-north", co: "Northwind Clinics", who: "Dana Whitfield, COO", status: "client_signed", a1: "Opened 5 times · 2 readers", a2: "Dana signed yesterday", ns: "An example, not yours", seat: "Fractional sales leader", days: "2 days a week", val: "$11,000 a month", vs: "6 month term", l1: "Signed by them", l2: "Waiting for you", tpl: "Fractional sales leader", tv: "Version 1" }),
  example({ key: "ex-lark", co: "Larkspur Learning", who: "Avery Ashby, CEO", status: "viewed", a1: "Opened twice · 6 min on Pricing", a2: "Looked at the 3 days a week option", ns: "An example, not yours", seat: "Fractional sales leader", days: "3 days a week", val: "$12,000 a month", vs: "3 options", l1: "24 days left", l2: "Ends in December", tpl: "Fractional sales leader", tv: "Version 2" }),
];

/** What the Close trial includes, in the mockup's words (said on a first visit). */
export const TRIAL_INCLUDES = ["Proposals Merlin drafts from a call or a template", "Contracts: send a PDF to sign", "Signing, with your signature or a countersignature", "Reader activity and when to follow up", "Reminders on day 2 and day 7"];
