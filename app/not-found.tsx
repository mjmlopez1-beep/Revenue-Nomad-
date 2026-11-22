/**
 * An address that leads nowhere. Say so in a sentence, keep the frame (the pine bar), and give
 * the one way back: the table. Its picture is the Not found scene (Fractions, loud: an error page
 * is outside the app), which lives here and nowhere else.
 */
import "./ui/fractions/fractions.css";
import { Scene } from "./ui/fractions/art";
import { Logo } from "./ui/Logo";
export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="pine-bar">
        <a href="/" className="pine-bar-home" aria-label="Merlin home">
          <Logo tone="white" height={30} />
        </a>
      </div>
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", display: "grid", gap: 16, justifyItems: "start" }}>
        <Scene kind="notFound" loud="mint" style={{ width: "100%", height: "auto", borderRadius: 12 }} />
        <h1 style={{ fontSize: 24, lineHeight: "30px", fontWeight: 800, letterSpacing: "-0.02em" }}>That page isn&apos;t here</h1>
        <p style={{ fontSize: 16, lineHeight: "24px", color: "var(--body-ink)" }}>The link may be old or cut short. Everything on Merlin starts from the table.</p>
        <a className="btn btn-pine" href="/">
          Open Merlin
        </a>
      </main>
    </div>
  );
}
