"use client";

/** The signed copy's button: the browser's print dialog, where "Save as PDF" is one of the printers. Quiet when the sealed PDF's download is the page's one primary button. */
export function PrintButton({ quiet = false }: { quiet?: boolean }) {
  return (
    <button type="button" className={quiet ? "btn" : "btn btn-pine"} onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
