/**
 * pdf.js on the server (pdfjs-dist's Node build). In Node it runs its worker in the same process,
 * and looks for it on globalThis.pdfjsWorker before loading the worker file by its path, which a
 * bundled server can't find. Loading the worker module here first, through the bundler, makes
 * both work: the contracts reader (lib/documents/detect.ts) and uploaded templates
 * (lib/proposals/templateParse.ts).
 */
export async function pdfjsNode() {
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error: the worker module ships without types.
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
