"use client";

/**
 * The last net: the page's own layout failed, so this draws without it (no fonts or tokens
 * from globals.css). Plain words, one button that reloads.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#fafaf7", color: "#0a1a13", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <div style={{ height: 56, background: "#073f2f" }} />
        <div role="alert" style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", display: "grid", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: "30px", fontWeight: 800 }}>Merlin hit a problem</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: "24px", color: "#28322d" }}>
            Something broke on our side while the page was loading. What you added is saved. Reload the page to try again.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => (reset(), window.location.reload())}
              style={{ minHeight: 44, padding: "0 16px", border: 0, borderRadius: 8, background: "#073f2f", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}
            >
              Reload the page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
