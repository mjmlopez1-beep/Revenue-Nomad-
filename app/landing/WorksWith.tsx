/**
 * "Works with": the tools Merlin truly connects to, in one quiet line under the hero. Each is the
 * product's name beside a plain glyph drawn here (a calendar, a chat bubble, a spark, a note), in
 * one color: no brand artwork, no image files, nothing loaded from anywhere.
 *
 *  - Google (Calendar, Contacts, Gmail): only when the server's signed-out answer says Google is
 *    on (View.live.google).
 *  - Slack: alerts in a member's Slack.
 *  - Claude: an AI assistant a member can connect (Agent access). Agent access also connects other
 *    assistants, so it says "and other AI assistants" rather than naming more of them.
 *  - Granola: only when RN_GRANOLA is on (View.live.granola).
 *
 * LinkedIn is never named here.
 */
import "./worksWith.css";

type Live = { google: boolean; granola: boolean };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Calendar() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" {...stroke} />
      <path d="M3 8.5h14M7 2.75v3.5M13 2.75v3.5" {...stroke} />
    </svg>
  );
}
function Chat() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
      <path d="M4.5 4h11A2.5 2.5 0 0 1 18 6.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3h-.5A2.5 2.5 0 0 1 2 12.5v-6A2.5 2.5 0 0 1 4.5 4Z" {...stroke} />
    </svg>
  );
}
function Spark() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
      <path d="M10 2.5c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z" {...stroke} />
      <path d="M15.5 13.5c.2 1.2.8 1.8 2 2-1.2.2-1.8.8-2 2-.2-1.2-.8-1.8-2-2 1.2-.2 1.8-.8 2-2Z" {...stroke} strokeWidth={1.3} />
    </svg>
  );
}
function Note() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
      <path d="M5.5 2.75h6.25L15.5 6.5v9.25a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 15.75v-11.5a1.5 1.5 0 0 1 1.5-1.5Z" {...stroke} />
      <path d="M7 9.5h6M7 12.5h4.5" {...stroke} />
    </svg>
  );
}

/** The tools as the line shows them, in order: only those the server has on. */
export function worksWithTools(live: Live): { name: string; detail?: string; glyph: "calendar" | "chat" | "spark" | "note" }[] {
  return [
    ...(live.google ? [{ name: "Google", detail: "Calendar, Contacts, Gmail", glyph: "calendar" as const }] : []),
    { name: "Slack", glyph: "chat" as const },
    { name: "Claude", detail: "and other AI assistants", glyph: "spark" as const },
    ...(live.granola ? [{ name: "Granola", glyph: "note" as const }] : []),
  ];
}

const GLYPHS = { calendar: Calendar, chat: Chat, spark: Spark, note: Note };

export default function WorksWith({ live }: { live: Live }) {
  const tools = worksWithTools(live);
  return (
    <section className="lp-works" aria-labelledby="works-h">
      <div className="lp-wrap lp-works-in">
        <h2 className="lp-works-h" id="works-h">
          Works with
        </h2>
        <ul className="lp-works-list">
          {tools.map((t) => {
            const G = GLYPHS[t.glyph];
            return (
              <li key={t.name} className="lp-works-item">
                <G />
                <span className="lp-works-name">{t.name}</span>
                {t.detail ? <span className="lp-works-detail">{t.detail}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
