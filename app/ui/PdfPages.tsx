"use client";

/**
 * A PDF's pages drawn in the browser with pdf.js (pdfjs-dist, its worker loaded from this app's
 * own bundle), each page a canvas at the width it is shown, with anything laid over it (the
 * fields of a document to sign) positioned in shares of the page. Pages draw as they come near
 * the screen, so a long document opens fast. Used by the document builder (Proposals) and the
 * signing page. Nothing here sends the file anywhere: it is read from Merlin's own address.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  return (lib ??= import("pdfjs-dist").then((m) => {
    if (!m.GlobalWorkerOptions.workerPort) m.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    return m;
  }));
}

function Page({ doc, n, w, h, children, onPointerDown }: { doc: PDFDocumentProxy | null; n: number; w: number; h: number; children?: ReactNode; onPointerDown?: (e: React.PointerEvent<HTMLDivElement>, page: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(n < 2);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!doc || !near || !canvas.current || !box.current) return;
    let stop = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await doc.getPage(n + 1);
      if (stop) return;
      const width = box.current?.clientWidth || 600;
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(2.5, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = canvas.current!;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const t = page.render({ canvas: c, viewport: vp });
      task = t;
      await t.promise.catch(() => {});
      if (!stop) setDrawn(true);
    })();
    return () => {
      stop = true;
      task?.cancel();
    };
  }, [doc, near, n]);
  return (
    <div ref={box} className="pdf-page" data-drawn={drawn} style={{ aspectRatio: `${w} / ${h}` }} onPointerDown={onPointerDown ? (e) => onPointerDown(e, n) : undefined} aria-label={`Page ${n + 1}`}>
      <canvas ref={canvas} className="pdf-canvas" aria-hidden />
      {children}
    </div>
  );
}

export function PdfPages({
  src,
  pages,
  overlay,
  onPointerDown,
  className = "",
  only,
}: {
  /** Where the PDF is read from (same origin). */
  src: string;
  /** Each page as shown, in PDF points: the layout is right before a page is drawn. */
  pages: { w: number; h: number }[];
  overlay?: (page: number) => ReactNode;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>, page: number) => void;
  className?: string;
  /** Show only these pages (0-based), each still numbered "Page n of all". */
  only?: number[];
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let task: { destroy: () => Promise<void> } | null = null;
    void pdfjs()
      .then((m) => {
        const t = m.getDocument({ url: src });
        task = t;
        return t.promise;
      })
      .then((x) => !stop && setDoc(x))
      .catch(() => !stop && setErr("The document didn't load. Check your connection and reload the page."));
    return () => {
      stop = true;
      void task?.destroy();
    };
  }, [src]);
  return (
    <div className={`pdf-pages ${className}`}>
      {err && <p className="pdf-err">{err}</p>}
      {pages.map((p, i) => (only && !only.includes(i) ? null : (
        <div key={i} className="pdf-pagewrap">
          <Page doc={doc} n={i} w={p.w} h={p.h} onPointerDown={onPointerDown}>
            {overlay?.(i)}
          </Page>
          {pages.length > 1 && <span className="pdf-num">Page {i + 1} of {pages.length}</span>}
        </div>
      )))}
    </div>
  );
}
