/**
 * The words of Close's proposal alerts, in Slack, by email and in Merlin (the mockup's wording),
 * from the facts lib/close/server.ts works out. Pure apart from the shared email look.
 *
 *   open      "Morgan Lee opened your proposal for Larkspur Learning" / First open, on a phone, 2 hours after you sent it.
 *   reader    "Someone new opened it" / A second person at Larkspur read Plan and Pricing on a computer. Morgan may have shared it.
 *   engaged   "Morgan is back on pricing." / Third visit, 4 minutes on Pricing. ... / Follow up tomorrow morning. ...
 *   signed    "Signed" / Larkspur Learning signed Operator, $12,000 a month. Moved to Won.
 *   renewal   "Your Larkspur engagement ends in 30 days" / Start the renewal
 * Never the signer's email address, never what Merlin can't see.
 */
import type { Alert } from "../notify/format";
import { escHtml, footerNote, mailButton, mailCallout, mailFootLink, mailH, mailP, mailQuote, mailShell, mailSmall, oneLine } from "../email";
import { andList, firstName, minSentence, minWords, ordinal } from "./activity";
import type { CloseAlertKind, DeviceKind, InboxItem, Suggestion } from "./types";

export interface AlertFacts {
  kind: CloseAlertKind;
  item: string;
  what: "proposal" | "document";
  title: string;
  company: string;
  signer: string;
  device?: DeviceKind | null;
  /** First open: how long after it was sent. */
  afterMs?: number;
  /** New reader: which one (2 = a second person), what they read. */
  readerN?: number;
  read?: string[];
  /** Engaged: the suggestion and the reading behind it. */
  suggestion?: Suggestion;
  visits?: number;
  pricing?: { label: string; ms: number };
  looked?: string[];
  adds?: string[];
  opens?: number;
  totalMs?: number;
  mostRead?: string | null;
  skipped?: string[];
  signed?: { option: string | null; fee: string | null; won: boolean; copyUrl: string | null };
  declined?: { reason: string };
  renewal?: { end: string; endWords: string; days: number; terms: string | null };
  /** The client's question (closeC3), and who asked. */
  question?: { by: string; text: string };
  /** Passed to someone else to sign: who passed it, to whom. */
  passed?: { by: string; to: string };
  /** Signed by the client, waiting for the member to countersign. */
  countersign?: { by: string };
  /** The link into Merlin (absolute), and the one with the follow-up drafted. */
  url: string;
}

export interface AlertOut {
  slack: Alert;
  /** Null: no email for this one (signed and declined have their own). */
  email: { subject: string; text: string; html: string } | null;
  inbox: Omit<InboxItem, "id" | "at">;
}

const cut = (s: string, n: number) => oneLine(s).slice(0, n);
const companyOf = (f: AlertFacts) => cut(f.company, 80) || cut(f.title, 80);
/** "Larkspur" from "Larkspur Learning": the first word, for "a second person at Larkspur". */
const shortCo = (c: string) => oneLine(c).split(/\s+/)[0] || c;
const DEVICE: Record<DeviceKind, string> = { phone: "on a phone", tablet: "on a tablet", computer: "on a computer" };
export const afterWords = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  if (ms < 3_600_000) return "within the hour";
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} after you sent it`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} after you sent it`;
};
const whenShort = (when: string) => when.replace(/ morning$/, "").replace(/^Follow up /, "follow up ").replace(/^Check in /, "check in ");

/** The engaged alert's lead, by rule. */
function engagedHead(f: AlertFacts): { slack: string; inbox: string } {
  const first = firstName(f.signer) || "They";
  switch (f.suggestion?.key) {
    case "options":
    case "pricing":
      return { slack: `${first} is back on pricing.`, inbox: "Back on pricing:" };
    case "quiet":
      return { slack: "It's gone quiet.", inbox: "Gone quiet:" };
    default:
      return { slack: `${first} opened it but hasn't signed.`, inbox: "Not signed yet:" };
  }
}
function engagedOffer(f: AlertFacts): string {
  const s = f.suggestion!;
  if (s.key === "options" && (f.looked?.length ?? 0) >= 2) return `Offer 15 minutes to pick between ${f.looked![0]} and ${f.looked![1]}.`;
  if (s.key === "pricing") return "Offer 15 minutes on the price and the scope.";
  if (s.key === "quiet") return "A short check-in brings most back.";
  return "Ask if anything should change before they sign.";
}
/** "Third visit, 4 minutes on Pricing. They compared Operator and Build and added Sales hiring support." */
function engagedLine(f: AlertFacts): string {
  const parts: string[] = [];
  if (f.visits && f.pricing) parts.push(`${ordinal(f.visits)[0].toUpperCase()}${ordinal(f.visits).slice(1)} visit, ${minSentence(f.pricing.ms)} on ${f.pricing.label}.`);
  else if (f.visits) parts.push(`${f.visits} ${f.visits === 1 ? "visit" : "visits"} so far.`);
  const looked = f.looked ?? [];
  const adds = f.adds ?? [];
  if (looked.length >= 2) parts.push(`They compared ${andList(looked.slice(0, 3))}${adds.length ? ` and added ${andList(adds)}` : ""}.`);
  else if (adds.length) parts.push(`They added ${andList(adds)}.`);
  if (f.suggestion && f.suggestion.key !== "options" && f.suggestion.key !== "pricing") parts.push(f.suggestion.why);
  return parts.join(" ");
}

function memberFoot(notifications: string): string[] {
  const note = footerNote();
  return [`Proposal alerts from Merlin. Choose which come by email in ${mailFootLink(notifications, "Notifications")}.`, note ? escHtml(note) : ""];
}
const textFoot = (notifications: string) => ["--", `Proposal alerts from Merlin. Choose which come by email in Notifications: ${notifications}`, ...(footerNote() ? [footerNote()] : [])];

/** Every channel's words for one alert. `notifications` is the link to the Notifications page. */
export function alertWords(f: AlertFacts, notifications: string): AlertOut {
  const company = companyOf(f);
  const signer = cut(f.signer, 80) || "Your client";
  const first = firstName(signer) || "They";
  const what = f.what === "document" ? "document" : "proposal";
  const foot = { html: memberFoot(notifications), text: textFoot(notifications) };
  const mail = (subject: string, lead: string, bodyHtml: string[], bodyText: string[], button: string) => ({
    subject,
    text: [`Hi,`, "", lead, ...bodyText, "", `${button}: ${f.url}`, "", ...foot.text].join("\n"),
    html: mailShell({ title: subject, preheader: lead, body: [mailP(escHtml(lead)), ...bodyHtml, mailButton(f.url, button, "margin:8px 0 0")].join("\n"), link: f.url, art: "proposal", footer: foot.html }),
  });
  switch (f.kind) {
    case "open": {
      const headline = `${signer} opened your ${what}${company ? ` for ${company}` : ""}`;
      const line = ["First open", f.device ? DEVICE[f.device] : "", f.afterMs !== undefined ? afterWords(f.afterMs) : ""].filter(Boolean).join(", ") + ".";
      return {
        slack: { kind: "proposal", count: 1, headline, lines: [line], url: f.url, button: "See activity", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: mail(headline, `${headline}. ${line}`, [], [], "See activity"),
        inbox: { kind: "open", item: f.item, head: "Opened", text: `by ${signer}` },
      };
    }
    case "reader": {
      const nth = ordinal(f.readerN ?? 2);
      const read = f.read?.length ? `read ${andList(f.read.slice(0, 3))}` : "opened it";
      const line = `A ${nth} person${company ? ` at ${shortCo(company)}` : ""} ${read}${f.device ? ` ${DEVICE[f.device]}` : ""}. ${first} may have shared it.`;
      return {
        slack: { kind: "proposal", count: 1, headline: "Someone new opened it", lines: [line], url: f.url, button: "See activity", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: mail(`Someone new opened your ${what}${company ? ` for ${company}` : ""}`, line, [], [], "See activity"),
        inbox: { kind: "reader", item: f.item, head: "New reader:", text: `a ${nth} person${company ? ` at ${shortCo(company)}` : ""}` },
      };
    }
    case "engaged": {
      const s = f.suggestion!;
      const head = engagedHead(f);
      const line = engagedLine(f);
      const callout = `*${s.when}.* ${s.key === "options" || s.key === "pricing" ? `${s.why} ` : ""}${engagedOffer(f)}`;
      const subject = `${head.slack.replace(/\.$/, "")}: ${whenShort(s.when)}`;
      const lead =
        f.pricing && f.visits
          ? `${signer} opened your ${company ? `${company} ` : ""}${what} for the ${ordinal(f.visits)} time and spent ${minSentence(f.pricing.ms)} on ${f.pricing.label}.`
          : `${head.slack} ${line}`;
      const tiles = [
        `<strong>${f.opens ?? f.visits ?? 0}</strong> opens`,
        `<strong>${escHtml(minWords(f.totalMs ?? 0))}</strong> reading`,
        ...(f.mostRead ? [`<strong>${escHtml(f.mostRead)}</strong> most read`] : []),
      ].join(" &nbsp;·&nbsp; ");
      const lookedLine = [
        (f.looked?.length ?? 0) >= 2 ? `Compared ${andList(f.looked!.slice(0, 3))}.` : "",
        f.adds?.length ? `Added ${andList(f.adds)}.` : "",
        f.skipped?.length ? `Skipped ${andList(f.skipped.slice(0, 3))}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        slack: { kind: "proposal", count: 1, headline: head.slack, lines: [line, callout].filter(Boolean), url: `${f.url}&draft=1`, button: "Draft the follow-up", footer: "Proposal alerts from Merlin. At most one of these every 6 hours for each proposal." },
        email: mail(
          subject,
          lead,
          [
            mailCallout(tiles, "page"),
            lookedLine ? mailSmall("What they looked at") + mailP(escHtml(lookedLine)) : "",
            mailP(`<strong>${escHtml(s.when)}.</strong> ${escHtml(s.why)}`),
            s.draft ? mailSmall("Suggested follow-up") + mailQuote(escHtml(s.draft)) : "",
          ],
          [
            "",
            `${f.opens ?? f.visits ?? 0} opens · ${minWords(f.totalMs ?? 0)} reading${f.mostRead ? ` · ${f.mostRead} most read` : ""}`,
            ...(lookedLine ? ["", `What they looked at: ${lookedLine}`] : []),
            "",
            `${s.when}. ${s.why}`,
            ...(s.draft ? ["", `Suggested follow-up: "${s.draft}"`] : []),
          ],
          "Open in Merlin",
        ),
        inbox: { kind: "engaged", item: f.item, head: head.inbox, text: whenShort(s.when) },
      };
    }
    case "signed": {
      if (f.declined) {
        const reason = cut(f.declined.reason, 200);
        return {
          slack: { kind: "proposal", count: 1, headline: "Declined", lines: [`${signer} declined ${cut(f.title, 120)}${reason ? `: "${reason}"` : "."}`], url: f.url, button: "See activity", footer: "Proposal alerts from Merlin. Change them in Notifications." },
          email: null,
          inbox: { kind: "signed", item: f.item, head: "Declined:", text: company || cut(f.title, 80) },
        };
      }
      const g = f.signed!;
      const what2 = g.option ? `${g.option}${g.fee ? `, ${g.fee} a month` : ""}` : g.fee ? `${cut(f.title, 100)}, ${g.fee} a month` : cut(f.title, 100);
      const adds = f.adds?.length ? `, plus ${andList(f.adds)}` : "";
      return {
        slack: {
          kind: "proposal",
          count: 1,
          headline: "Signed",
          lines: [`${company || signer} signed ${what2}${adds}.${g.won ? " Moved to Won." : ""}`],
          url: g.copyUrl || f.url,
          button: g.copyUrl ? (f.what === "document" ? "Open the signed PDF" : "Open the signed copy") : "Open in Merlin",
          footer: "Proposal alerts from Merlin. Change them in Notifications.",
        },
        email: null,
        inbox: { kind: "signed", item: f.item, head: "Signed:", text: `${company || signer}${g.option ? `, ${g.option}` : ""}`, ...(g.won ? { sub: "moved to Won" } : {}) },
      };
    }
    case "question": {
      const q = f.question!;
      const by = cut(q.by, 80) || signer;
      const headline = `${by} asked a question about ${cut(f.title, 120)}`;
      const text = cut(q.text, 280);
      return {
        slack: { kind: "proposal", count: 1, headline, lines: text ? [`"${text}"`] : [], url: f.url, button: "See activity", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: mail(headline, `${headline}.`, text ? [mailQuote(escHtml(text))] : [], text ? ["", `"${text}"`] : [], "Open in Merlin"),
        inbox: { kind: "question", item: f.item, head: "Question:", text: `${by} asked about ${cut(f.title, 80)}` },
      };
    }
    case "passed": {
      const g = f.passed!;
      const by = cut(g.by, 80) || signer;
      const to = cut(g.to, 80);
      const headline = `${by} passed ${cut(f.title, 120)} to ${to} to sign`;
      return {
        slack: { kind: "proposal", count: 1, headline, lines: [`${firstName(to) || to} gets the signing link now. Follow up with them, not ${firstName(by) || by}.`], url: f.url, button: "See activity", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: mail(headline, `${headline}.`, [], [], "See activity"),
        inbox: { kind: "passed", item: f.item, head: "Passed on:", text: `${firstName(by) || by} to ${to}` },
      };
    }
    case "countersign": {
      const by = cut(f.countersign!.by, 80) || signer;
      const headline = `${by} signed. Countersign to finish.`;
      return {
        slack: { kind: "proposal", count: 1, headline, lines: [`${company ? `${company}, ` : ""}${cut(f.title, 120)}. It moves to Won once you countersign.`], url: f.url, button: "Countersign", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: mail(headline, `${by} signed ${cut(f.title, 120)}. It's finished, and your pipeline moves to Won, once you countersign.`, [], [], "Countersign"),
        inbox: { kind: "countersign", item: f.item, head: `Signed by ${firstName(by) || by}:`, text: "countersign to finish" },
      };
    }
    case "renewal": {
      const r = f.renewal!;
      const headline = r.days > 0 ? `Your ${shortCo(company)} engagement ends in ${r.days} ${r.days === 1 ? "day" : "days"}` : `Your ${shortCo(company)} engagement ends today`;
      const line = `${r.terms ? `${r.terms} ` : ""}A good moment to propose the next term. Start the renewal: Merlin copies the signed proposal as a new draft, with the dates moved on.`;
      return {
        slack: { kind: "proposal", count: 1, headline, lines: [line], url: `${f.url}&renew=1`, button: "Start the renewal", footer: "Proposal alerts from Merlin. Change them in Notifications." },
        email: { ...mail(headline, `${company ? `${company}: ` : ""}the term ends ${r.endWords}.`, [mailH(escHtml(headline)), mailP(escHtml(line))], ["", line], "Start the renewal"), subject: headline },
        inbox: { kind: "renewal", item: f.item, head: "Renewal:", text: `${company || cut(f.title, 80)} ends ${r.endWords}` },
      };
    }
  }
}

/** The in-app line for a reminder that went out. */
export const reminderInbox = (item: string, to: string, short: string): Omit<InboxItem, "id" | "at"> => ({ kind: "reminder", item, head: "Reminder sent", text: `to ${firstName(to) || to}: ${short}`, sub: "automatic" });
