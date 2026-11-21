"use client";

/**
 * Something on the page broke while it rendered. Say so plainly, keep the frame (the pine bar),
 * and offer the two ways out: try the page again, or reload it fresh. Nothing the member added
 * is lost: every fact is saved on the server the moment it is added.
 */
import { useEffect } from "react";
import "./ui/fractions/fractions.css";
import { Spot } from "./ui/fractions/art";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ height: 56, background: "var(--pine)" }} />
      <div role="alert" style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", display: "grid", gap: 16, justifyItems: "start" }}>
        {/* The two halves have come apart (Fractions, the quiet register on the app's off-white). */}
        <Spot name="offline" size={128} on="bg" ember />
        <h1 style={{ fontSize: 24, lineHeight: "30px", fontWeight: 800, letterSpacing: "-0.02em" }}>This page hit a problem</h1>
        <p style={{ fontSize: 16, lineHeight: "24px", color: "var(--body-ink)" }}>
          Something broke on our side while the page was drawing. What you added is saved. Try again, and if it happens again, reload the page.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-pine" onClick={reset}>
            Try again
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}
