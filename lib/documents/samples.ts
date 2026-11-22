/**
 * Made-up contracts, built with pdf-lib: the example behind "Try it with an example" (Send a
 * contract for signature) and the PDFs scripts/test-contracts.mts reads. Every name, company and
 * address in them is made up. Runs in the browser and in Node.
 *
 *   "two-column"   a statement of work, the two parties' blocks side by side (By, Name, Title, Date)
 *   "stacked"      a consulting agreement, one block under the other, "Signature" and "Print name"
 *   "roles"        "Client" and "Consultant" blocks, written as a rule with the label under it,
 *                  the names only in the contract's definitions
 *   "none"         a letter with no signature block at all
 */
export type SampleLayout = "two-column" | "stacked" | "roles" | "none";

export const SAMPLE_NAME: Record<SampleLayout, string> = {
  "two-column": "Cedar & Pine - SOW (Nov 2026).pdf",
  stacked: "Consulting Agreement - Cedar and Pine.pdf",
  roles: "cedar_pine_msa_draft.pdf",
  none: "Kickoff notes.pdf",
};

const BODY = [
  "11.7 This Agreement may be executed in counterparts, each of which will be deemed an original and all",
  "of which together shall constitute one and the same instrument.",
  "11.8 The Consultant hereby acknowledges that the Consultant has been encouraged to consult with legal",
  "counsel prior to executing this Agreement.",
];

export async function makeSamplePdf(layout: SampleLayout, opts: { member?: string; firm?: string } = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.12, 0.15, 0.13);
  const member = opts.member || "Jordan Avery";
  const firm = opts.firm || `${member} Advisory LLC`;
  const page1 = doc.addPage([612, 792]);
  const text = (p: typeof page1, s: string, x: number, y: number, size = 11, f = font) => p.drawText(s, { x, y, size, font: f, color: ink });
  const intro =
    layout === "roles"
      ? [`This Master Services Agreement is made between Cedar and Pine Software, Inc. (the "Client") and`, `${firm} (the "Consultant"), as of the Effective Date.`]
      : layout === "none"
        ? ["Notes from our kickoff with Cedar and Pine Software.", "We agreed to meet weekly on Tuesdays and to review the forecast together."]
        : [`This ${layout === "two-column" ? "Statement of Work" : "Consulting Agreement"} is made between Cedar and Pine Software ("Company") and`, `${firm} ("Consultant").`];
  text(page1, layout === "two-column" ? "STATEMENT OF WORK" : layout === "stacked" ? "CONSULTING AGREEMENT" : layout === "roles" ? "MASTER SERVICES AGREEMENT" : "KICKOFF NOTES", 72, 720, 14, bold);
  intro.forEach((l, i) => text(page1, l, 72, 690 - i * 16, 10));
  ["1. Services. The Consultant will lead the revenue team two days a week.", "2. Fees. $11,000 a month, billed monthly in advance, net 15."].forEach((l, i) => text(page1, l, 72, 640 - i * 16, 10));
  if (layout === "none") return doc.save();

  const page = doc.addPage([612, 792]);
  BODY.forEach((l, i) => text(page, l, 72, 720 - i * 15, 10));
  text(page, "Having understood and agreed to the foregoing, the parties have signed this Agreement as of the Effective Date.", 72, 640, 10);
  const RULE = "______________________________";
  if (layout === "two-column") {
    const block = (x: number, org: string, name: string, title: string) => {
      text(page, org, x, 590, 11, bold);
      text(page, `By: ${RULE}`, x, 555, 10);
      text(page, name ? `Name: ${name}` : `Name: ${RULE}`, x, 530, 10);
      text(page, title ? `Title: ${title}` : `Title: ${RULE}`, x, 505, 10);
      text(page, `Date: ${RULE}`, x, 480, 10);
    };
    block(72, "Cedar and Pine Software", "", "");
    block(330, firm, "", "");
    text(page, "Notices to the Company: Dana Whitfield, CEO, dana@cedarpine.example", 72, 420, 9);
  } else if (layout === "stacked") {
    const block = (y: number, org: string, name: string) => {
      text(page, org, 72, y, 11, bold);
      text(page, `Signature: ${RULE}`, 72, y - 35, 10);
      text(page, name ? `Print name: ${name}` : `Print name: ${RULE}`, 72, y - 60, 10);
      text(page, `Its: ${RULE}`, 72, y - 85, 10);
      text(page, `Date: ${RULE}`, 72, y - 110, 10);
    };
    block(590, "CEDAR AND PINE SOFTWARE", "Dana Whitfield");
    block(420, firm.toUpperCase(), "");
  } else {
    const block = (x: number, role: string) => {
      text(page, `${role}:`, x, 590, 11, bold);
      for (const [i, label] of ["Signature", "Name", "Title", "Date"].entries()) {
        text(page, RULE, x, 550 - i * 45, 10);
        text(page, label, x, 538 - i * 45, 8);
      }
    };
    block(72, "CLIENT");
    block(330, "CONSULTANT");
  }
  return doc.save();
}
