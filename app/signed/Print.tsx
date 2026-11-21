"use client";

/** The signed copy's one button: the browser's print dialog, where "Save as PDF" is one of the printers. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-pine" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
