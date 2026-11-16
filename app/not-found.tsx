/**
 * An address that leads nowhere. Say so in a sentence, keep the frame (the pine bar), and give
 * the one way back: the table.
 */
export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ height: 56, background: "var(--pine)" }} />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", display: "grid", gap: 16, justifyItems: "start" }}>
        <h1 style={{ fontSize: 24, lineHeight: "30px", fontWeight: 800, letterSpacing: "-0.02em" }}>That page isn&apos;t here</h1>
        <p style={{ fontSize: 16, lineHeight: "24px", color: "var(--body-ink)" }}>The link may be old or cut short. Everything on Trading Post starts from the table.</p>
        <a className="btn btn-pine" href="/">
          Open Trading Post
        </a>
      </main>
    </div>
  );
}
