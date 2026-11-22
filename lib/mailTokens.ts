/**
 * What every Merlin email is made of, with nothing else in it: the colours and faces (MAIL), the
 * escaping, and the site an email's links and pictures come from. lib/email.ts (the sender) and
 * lib/emailArt.ts (the frame and its parts) both read it, so neither needs the other to load first.
 *
 * Mail clients don't load web fonts, so email is set in the reader's system face, with the
 * product's colours, spacing and weights. Pine for the button, ember only on a number that is live.
 */
export const MAIL = {
  pine: "#073F2F",
  volt: "#2EE59D",
  voltSoft: "#E8FBF2",
  /** Mint as text on white (labels, the "+1"): volt-ink. */
  voltInk: "#0B6B45",
  ember: "#FF5A1F",
  /** Ember text on white (the full ember is for dots and fills). */
  emberInk: "#B23A0A",
  sand: "#F5ECD9",
  ink: "#0A1A13",
  body: "#28322D",
  muted: "#5B6661",
  line: "#E2E6E3",
  page: "#FAFAF7",
  /** On pine: secondary words (the date, the greeting). */
  onPine: "#C9D9D1",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  /** Links shown as data. */
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const;

export const escHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** One line of text: no control characters, no line breaks. */
export const oneLine = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
/** The optional footer line (a postal address, usually). */
export const footerNote = () => oneLine(typeof process !== "undefined" ? process.env.RN_EMAIL_FOOTER : "").slice(0, 300);

/** The site an email's links go to (http or https origin), or "" when there is none. */
export function mailOrigin(...links: (string | undefined)[]): string {
  for (const l of links) {
    try {
      const u = new URL(oneLine(l));
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* not a link */
    }
  }
  return "";
}
