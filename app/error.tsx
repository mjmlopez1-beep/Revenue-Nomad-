"use client";

/**
 * Something on the page broke while it rendered. Say so plainly, keep the frame (the pine bar with
 * the white lockup), and offer the two ways out: try the page again, or reload it fresh. Nothing
 * the member added is lost: every fact is saved on the server the moment it is added. The same
 * shape as Merlin did not load (app/ui/Problem.tsx).
 */
import { useEffect } from "react";
import { PineBar, Problem } from "./ui/Problem";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <PineBar />
      <Problem title="This page hit a problem" onRetry={reset}>
        Something broke on our side while the page was drawing. What you added is saved. Try again, and if it happens again, reload the page.
      </Problem>
    </div>
  );
}
