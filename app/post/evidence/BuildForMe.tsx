"use client";

/**
 * "Build this for me": the member's own Claude builds their case studies. With Claude connected
 * through Agent access, a link opens Claude with the prompt ready (evidenceModel buildPrompt); the
 * member presses send there, and nothing runs before they do. Claude uses its memory and the
 * member's email (Gmail or Outlook, connected in Claude: Merlin never sees it), asks which clients
 * to save, and saves each with Merlin's save_evidence_case, blanks marked where it isn't sure. Each
 * one shows "From Claude · review" here until the member checks it. Without Claude connected, the
 * three steps to connect it come first.
 *
 * This is the member's own assistant, named as the service it is. Merlin's own writing is never
 * called Claude.
 */
import { useState } from "react";
import { copyText } from "../hooks";
import { useToast } from "../../ui/shared";
import * as api from "./api";
import { agentState, buildPrompt, claudeLink } from "./evidenceModel";

type Agents = ReturnType<typeof agentState>;

export function BuildForMeButton({ onOpen, quiet }: { onOpen: () => void; quiet?: boolean }) {
  return (
    <button type="button" className={`btn ${quiet ? "" : "btn-pine "}ev-build-btn`} onClick={onOpen} data-build-for-me>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
      Build this for me
    </button>
  );
}

/** What the panel says for the member's agents: the link to Claude, the prompt to copy, or the steps to connect. */
export function BuildForMePanel({ agents, origin, onRecheck, checking, onClose, onAgentAccess, agentHref }: { agents: Agents | null; origin: string; onRecheck: () => void; checking: boolean; onClose: () => void; onAgentAccess: () => void; agentHref: string }) {
  const toast = useToast();
  const [seePrompt, setSeePrompt] = useState(false);
  const prompt = buildPrompt(origin);
  const addr = `${origin.replace(/\/$/, "")}/api/mcp`;
  const copy = async (t: string, done: string) => {
    const ok = await copyText(t);
    toast(ok ? done : "That didn't copy. Select it and copy it yourself.", !ok);
  };
  return (
    <section className="ev-bfm" aria-label="Build this for me" data-agents={agents ? (agents.claude ? "claude" : agents.any ? "other" : "none") : "loading"}>
      <div className="ev-bfm-head">
        <strong>{!agents ? "Checking your agents" : agents.claude ? "Claude builds your case studies" : agents.any ? "Your agent builds your case studies" : "First, connect Claude to Merlin"}</strong>
        <button type="button" className="ev-link" onClick={onClose}>
          Close
        </button>
      </div>
      {!agents ? (
        <p className="ev-bfm-p" role="status">
          Looking for Claude in Agent access.
        </p>
      ) : agents.claude || agents.any ? (
        <>
          <p className="ev-bfm-p">
            {agents.claude ? "Claude opens in a new tab with the prompt ready. Press send there." : "Copy the prompt and paste it into your agent."} It looks through your email (Gmail or Outlook, connected in Claude) and what it remembers of your work, asks you which clients to save, and saves each one here with blanks marked where it isn't sure. It never makes up a number.
          </p>
          <p className="ev-bfm-p ev-bfm-quiet">Your email stays in your own Claude account. Merlin never sees it, only the case studies you tell Claude to save. Each one shows here as From Claude, review, until you check it.</p>
          <div className="ev-bfm-actions">
            {agents.claude && (
              <a className="btn btn-pine" href={claudeLink(prompt)} target="_blank" rel="noopener noreferrer" data-claude-link>
                Open Claude with the prompt
              </a>
            )}
            <button type="button" className={`btn${agents.claude ? "" : " btn-pine"}`} onClick={() => void copy(prompt, "The prompt is copied. Paste it into Claude and press send.")}>
              Copy the prompt
            </button>
            <button type="button" className="ev-link" aria-expanded={seePrompt} onClick={() => setSeePrompt(!seePrompt)}>
              {seePrompt ? "Hide the prompt" : "See the prompt"}
            </button>
          </div>
          {seePrompt && <pre className="ev-bfm-prompt">{prompt}</pre>}
        </>
      ) : (
        <>
          <p className="ev-bfm-p">Claude does the digging for you once it can reach Merlin. Three steps, about two minutes, then press Build this for me again.</p>
          <ol className="ev-bfm-steps">
            <li>
              <strong>Copy your Merlin address</strong>
              <span className="ev-bfm-code">
                <code>{addr}</code>
                <button type="button" className="btn btn-sm" onClick={() => void copy(addr, "The address is copied.")}>
                  Copy
                </button>
              </span>
            </li>
            <li>
              <strong>Add it in Claude</strong>
              <span>In Claude, open Settings, then Connectors. Pick Add custom connector, name it Merlin and paste the address. Connect Gmail or Outlook there too, so Claude can look through your email.</span>
            </li>
            <li>
              <strong>Sign in to Merlin and allow it</strong>
              <span>Pick Connect. Merlin opens and asks if Claude may use your account. Pick Allow, then come back here.</span>
            </li>
          </ol>
          <div className="ev-bfm-actions">
            <a
              className="btn btn-pine"
              href={agentHref}
              onClick={(e) => {
                e.preventDefault();
                onAgentAccess();
              }}
            >
              Open Agent access
            </a>
            <button type="button" className="btn" disabled={checking} aria-busy={checking} onClick={onRecheck}>
              {checking ? "Checking" : "Check again"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** The panel's state: the member's agents, read when it opens and on Check again. */
export function useAgents() {
  const [agents, setAgents] = useState<Agents | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    const r = await api.agents();
    setChecking(false);
    setAgents(agentState(api.failed(r) ? [] : r));
  };
  return { agents, checking, check };
}
