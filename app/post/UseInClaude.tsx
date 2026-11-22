"use client";

/**
 * "Use it in Claude": how a member connects Merlin to Claude, ChatGPT, Claude Code or
 * Cursor. One address (this site's /api/mcp), sign-in in the browser, no key. Page key `claude`.
 */
import { IconChevron } from "../ui/shared";
import { useCopy } from "./Credits";
import "./connect.css";
import { PageHead } from "../ui/system";

/**
 * Questions to paste into Claude. One that names a company is a template with the blanks in
 * [brackets], so pasting it as it is can't add a seat at a made-up company or ask about one.
 */
const EXAMPLES = [
  "Which companies are the best fit for me to prospect as a fractional VP Marketing?",
  "What's the best way into [a company you want as a client]?",
  "What are my three moves today? Draft each note in my voice.",
  "Set up alerts on fractional Marketing roles at SaaS companies from $5M to $20M.",
  "What's new in open Sales roles this week?",
  "What does a fractional RevOps lead charge?",
  "Draft the [client] proposal from my call with [name] this morning. Use my [template name] template.",
  "Change my [client] proposal: make it two phases, an assessment first, then the ongoing role if they opt in.",
  "Give [client] three options to pick from in my proposal, with a hiring add-on, and keep the link open for 60 days.",
  "Add my seat. I was the fractional [your title] at [a client you worked with] from [month and year] to [month and year].",
];
/** A question with blanks to fill in before it is sent. */
const isTemplate = (q: string) => /\[[^\]]+\]/.test(q);

function Code({ text, label, block = false }: { text: string; label: string; block?: boolean }) {
  const copy = useCopy();
  return (
    <div className={`uc-code${block ? " uc-block" : ""}`}>
      <code className="mono">{text}</code>
      <button type="button" className="btn btn-sm" onClick={() => void copy(text, `${label} copied.`)}>
        Copy
      </button>
    </div>
  );
}

/** `embedded`: inside the Integrations page, which has its own back link and heading. */
export function UseInClaude({ onCredits, embedded = false }: { onBack?: () => void; onCredits: () => void; embedded?: boolean }) {
  const copy = useCopy();
  const address = `${typeof window === "undefined" ? "" : window.location.origin}/api/mcp`;
  const cursorJson = JSON.stringify({ mcpServers: { "merlin": { url: address } } }, null, 2);
  return (
    <div className={embedded ? "uc-page uc-embedded" : "page-narrow uc-page"}>
      {!embedded && <PageHead title="Use it in Claude" />}
      <p className="uc-lead">
        Connect Merlin to Claude and ask the table in your own words. It searches as you, sees what you&apos;ve unlocked, and can add what you know. It asks before it
        spends a credit.
      </p>

      <section className="tp-card uc-address" aria-labelledby="uc-addr-h">
        <h2 className="tp-card-h" id="uc-addr-h">
          Your connector address
        </h2>
        <p className="cr-note">The same address works in every app. You sign in to Merlin once in your browser, so there&apos;s no key to paste.</p>
        <div className="uc-addr-row">
          <input className="input mono uc-addr" readOnly value={address} aria-label="Connector address" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-pine" onClick={() => void copy(address, "Address copied. Paste it into your app.")}>
            Copy address
          </button>
        </div>
      </section>

      <div className="uc-grid">
        <section className="tp-card uc-app" aria-labelledby="uc-claude">
          <h2 className="tp-card-h" id="uc-claude">
            Claude
          </h2>
          <p className="uc-where">On claude.ai and in the desktop app</p>
          <ol className="uc-steps">
            <li>Open Settings, then Connectors.</li>
            <li>Pick Add custom connector.</li>
            <li>Name it Merlin and paste the address.</li>
            <li>Pick Connect, sign in to Merlin and allow it.</li>
          </ol>
          <p className="uc-tip">In a chat, turn Merlin on from the tools menu if Claude doesn&apos;t use it on its own.</p>
        </section>

        <section className="tp-card uc-app" aria-labelledby="uc-chatgpt">
          <h2 className="tp-card-h" id="uc-chatgpt">
            ChatGPT
          </h2>
          <p className="uc-where">On chatgpt.com, with developer mode on</p>
          <ol className="uc-steps">
            <li>Open Settings, then Apps and connectors.</li>
            <li>Under Advanced settings, turn on Developer mode.</li>
            <li>Pick Create, name it Merlin and paste the address. Choose OAuth for sign-in.</li>
            <li>Sign in to Merlin and allow it.</li>
          </ol>
        </section>

        <section className="tp-card uc-app" aria-labelledby="uc-code">
          <h2 className="tp-card-h" id="uc-code">
            Claude Code
          </h2>
          <p className="uc-where">In your terminal</p>
          <ol className="uc-steps">
            <li>Run this command.</li>
          </ol>
          <Code text={`claude mcp add --transport http merlin ${address}`} label="Command" />
          <ol className="uc-steps" start={2}>
            <li>In Claude Code, type /mcp, pick merlin and sign in.</li>
          </ol>
        </section>

        <section className="tp-card uc-app" aria-labelledby="uc-cursor">
          <h2 className="tp-card-h" id="uc-cursor">
            Cursor
          </h2>
          <p className="uc-where">In Cursor Settings, under MCP</p>
          <ol className="uc-steps">
            <li>Pick Add new MCP server, or add this to your mcp.json.</li>
          </ol>
          <Code text={cursorJson} label="Settings" block />
          <ol className="uc-steps" start={2}>
            <li>Pick Connect next to merlin and sign in.</li>
          </ol>
        </section>
      </div>

      <section className="tp-card" aria-labelledby="uc-ask">
        <h2 className="tp-card-h" id="uc-ask">
          Things to ask
        </h2>
        <ul className="uc-asks">
          {EXAMPLES.map((q) => (
            <li key={q}>
              <button
                type="button"
                className="uc-ask"
                onClick={() => void copy(q, isTemplate(q) ? "Question copied. Paste it into Claude and fill in the brackets." : "Question copied. Paste it into Claude.")}
                title="Copy this question"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="tp-card uc-note" aria-labelledby="uc-safe">
        <h2 className="tp-card-h" id="uc-safe">
          Every unlock and every send asks you first
        </h2>
        <p className="cr-note">
          Before it spends a credit, the app tells you what it costs and what you&apos;ll see, and waits for your yes. A proposal or a contract goes out for signature only after you say send, and a change it makes is saved only after you accept it. It only sees what you can see in Merlin, and it never sees
          your sign-in link. You can disconnect it any time in{" "}
          <button type="button" className="ca-link" onClick={onCredits}>
            Your credits
          </button>
          .
        </p>
      </section>
    </div>
  );
}
