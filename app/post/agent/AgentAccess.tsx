"use client";

/**
 * Agent access (AgentAccess.dc.html), page key "agent" in the new look; ?p=claude lands here.
 * The member's own agent (Claude, ChatGPT, Claude Code, Cursor) uses Merlin through the connector
 * as them. This page draws, over what Connected apps (ConnectedApps.tsx) and Use it in Claude
 * (UseInClaude.tsx) had:
 *
 *   Your agents        each connected agent, its use today, Revoke (asks once, inline); the agents
 *                      not connected yet, each with How to connect: three steps with the address
 *                      to copy and Check the connection (reads the agents again).
 *   What it can do     the tools in four groups (read, add, spend, send), a switch for each group
 *                      and each tool, cost and how it asks, use in 30 days. Spending credits and
 *                      sending for signature always ask first: no switch turns that off.
 *   What they did      the log (lib/mcp/log.ts): what, when, which agent, credits. Never arguments.
 *   Credits            the credits meter (credits/Meter.tsx): N% of this month's credits left,
 *                      Top up or Upgrade at 20% or less. Agents use the member's own credits.
 *   Daily spend limit  for all agents together: No limit (the default), or 5, 10, 25, 50 a day.
 *   Things to ask      prompts to copy, by kind; What your agent taught Merlin (voice, network).
 *
 * First visit (no agent has done anything yet): the strip, the steps open, what an agent can and
 * cannot do, and four rows labelled Example in the log (never sent, never counted).
 * Data: GET and POST /api/agent, POST /api/oauth/apps { revoke }.
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { COST_WORDS, LIMIT_CHOICES, TOOL_BY_KEY, askWords, rowWords, tabOf, type AgentGroup, type AgentLogRow, type AgentView, type LogTab } from "@/lib/mcp/agentTools";
import type { VoiceProfile } from "@/lib/voice";
import { errorText, timeAgo, useToast } from "../../ui/shared";
import { copyText } from "../hooks";
import { useApp, stripGone, type ShellPage } from "../shell/pages";
import { useNetwork } from "../network/useNetwork";
import { CreditsMeterBar } from "../credits/Meter";
import "./agent.css";

/* ---------- the agents Merlin knows how to connect ---------- */

type Kind = "claude" | "chatgpt" | "code" | "cursor";
interface KindDef {
  id: Kind;
  name: string;
  where: string;
  how: string;
  code?: (addr: string) => string;
  tip: string;
}
const KINDS: KindDef[] = [
  { id: "claude", name: "Claude", where: "On claude.ai and in the desktop app", how: "Open Settings, then Connectors. Pick Add custom connector, name it Merlin and paste the address.", tip: "You have 30 minutes to allow it. In a chat, turn Merlin on from the tools menu if Claude does not use it on its own." },
  { id: "chatgpt", name: "ChatGPT", where: "On chatgpt.com, with developer mode on", how: "Open Settings, then Apps and connectors. Under Advanced settings, turn on Developer mode. Pick Create, name it Merlin, paste the address and choose OAuth for sign-in.", tip: "You have 30 minutes to allow it. Developer mode is a ChatGPT setting, and Merlin needs nothing else from it." },
  { id: "code", name: "Claude Code", where: "In your terminal", how: "Run this command. Then type /mcp in Claude Code and pick merlin.", code: (a) => `claude mcp add --transport http merlin ${a}`, tip: "You have 30 minutes to allow it. The sign-in opens in your browser, not in the terminal." },
  { id: "cursor", name: "Cursor", where: "In Cursor Settings, under MCP", how: "Pick Add new MCP server, or add this to your mcp.json. Then pick Connect next to merlin.", code: (a) => JSON.stringify({ mcpServers: { merlin: { url: a } } }), tip: "You have 30 minutes to allow it. If merlin shows a red dot, pick Connect again." },
];
/** Which kind a connected app is, by the name it registered. */
export function kindOf(name: string): Kind | null {
  if (/claude\s*code/i.test(name)) return "code";
  if (/cursor/i.test(name)) return "cursor";
  if (/chatgpt|openai/i.test(name)) return "chatgpt";
  if (/claude/i.test(name)) return "claude";
  return null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayWord = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(t.getTime() - 86_400_000);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return t.getTime() - d.getTime() < 6 * 86_400_000 ? d.toLocaleDateString("en-US", { weekday: "long" }) : day(iso);
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- small parts ---------- */

function Switch({ on, label, onFlip, disabled, text }: { on: boolean; label: string; onFlip: () => void; disabled?: boolean; text?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ag-sw${on ? " on" : ""}`} disabled={disabled} onClick={onFlip}>
      <span className="ag-sw-track" aria-hidden>
        <span className="ag-sw-knob" />
      </span>
      {text}
    </button>
  );
}

const LockIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </svg>
);
const AgentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4" />
  </svg>
);
const Tick = ({ cross }: { cross?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cross ? "ag-cross" : "ag-tick"}>
    <path d={cross ? "M6 6l12 12M18 6L6 18" : "M5 12.5l4.5 4.5L19 7.5"} />
  </svg>
);

function CopyButton({ text, done, label, hot, children = "Copy" }: { text: string; done: string; label?: string; hot?: boolean; children?: ReactNode }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${copied ? "ag-copied" : hot ? "btn-pine" : ""}`}
      aria-label={label}
      onClick={async () => {
        const ok = await copyText(text);
        toast(ok ? done : "That didn't copy. Select it and copy it yourself.", !ok);
        if (ok) setCopied(true);
      }}
    >
      {copied ? "Copied" : children}
    </button>
  );
}

/* ---------- what the page reads ---------- */

async function load(): Promise<{ view?: AgentView; error?: string }> {
  try {
    const r = await fetch("/api/agent", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { view?: AgentView; error?: string };
    return r.ok && j.view ? { view: j.view } : { error: errorText(r.status, j.error, "Your agents didn't load. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
async function send(url: string, body: unknown): Promise<{ view?: AgentView; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { view?: AgentView; error?: string };
    return r.ok ? { view: j.view } : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/* ---------- Example rows for a first visit: labelled, never sent, never counted ---------- */

const EXAMPLE_ROWS: { agent: string; kind: string; tone: string; t: string; s: string; c: string }[] = [
  { agent: "Claude", kind: "Read", tone: "grey", t: "Searched companies hiring sales", s: "Reading costs nothing and changes nothing", c: "No cost" },
  { agent: "Claude", kind: "Added", tone: "earn", t: "Added a seat you held", s: "Adding earns the same credit as adding it yourself", c: "Earns 1 credit" },
  { agent: "Claude", kind: "Spent", tone: "paid", t: "Opened who decides at a company", s: "It quotes 1 credit, then waits for your yes", c: "1 credit spent" },
  { agent: "Claude", kind: "Drafted", tone: "free", t: "Drafted a proposal from a call", s: "Lands in Proposals as a draft. Never sent", c: "No cost" },
];

const LAND: Partial<Record<string, { page: ShellPage; label: string }>> = {
  proposals: { page: "proposals", label: "Open in Proposals" },
  contracts: { page: "contracts", label: "Open in Contracts" },
  seats: { page: "seats", label: "Open your seats" },
  alerts: { page: "alerts", label: "Open your alerts" },
  pipeline: { page: "pipeline", label: "Open your pipeline" },
  warm: { page: "warm", label: "See your warm paths" },
  settings: { page: "settings", label: "Open Settings" },
  evidence: { page: "evidence", label: "Open Evidence Bank" },
  fractionals: { page: "fractionals", label: "Open Fractionals" },
  find: { page: "find", label: "Open in Find" },
  rates: { page: "rates", label: "Open rate benchmarks" },
  today: { page: "today", label: "Open Home" },
  credits: { page: "credits", label: "Open your credits" },
  messages: { page: "messages", label: "Open Messages" },
};

/* ---------- the page ---------- */

export function AgentAccess() {
  const c = useApp();
  const toast = useToast();
  const net = useNetwork().view;
  const [view, setView] = useState<AgentView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pick, setPick] = useState<Kind | null>(null);
  const [stepsOpen, setStepsOpen] = useState<boolean | null>(null);
  const [addrCopied, setAddrCopied] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grp, setGrp] = useState<AgentGroup>("spend");
  const [logTab, setLogTab] = useState<LogTab>("all");
  const [askTab, setAskTab] = useState<"find" | "add" | "close" | "teach">("find");
  const [checking, setChecking] = useState(false);

  const addr = `${typeof window === "undefined" ? "" : window.location.origin}/api/mcp`;

  const reload = useCallback(async () => {
    const r = await load();
    if (r.view) setView(r.view), setFailed(null);
    else setFailed(r.error ?? "");
    return r.view ?? null;
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Read once per visit: what the member does here doesn't swap the page under them.
  const [first, setFirst] = useState<boolean | null>(null);
  useEffect(() => {
    if (view && first === null) setFirst(view.log.length === 0);
  }, [view, first]);

  // In the order Merlin lists the agents (Claude, ChatGPT, Claude Code, Cursor), any other app last.
  const connected = useMemo(() => {
    const rank = (k: Kind | null) => (k ? KINDS.findIndex((x) => x.id === k) : KINDS.length);
    return (view?.apps ?? []).map((a) => ({ ...a, kind: kindOf(a.name) })).sort((a, b) => rank(a.kind) - rank(b.kind));
  }, [view]);
  const kindOn = (k: Kind) => connected.some((a) => a.kind === k);
  const curKind: Kind = pick ?? KINDS.find((k) => !kindOn(k.id))?.id ?? "claude";
  const cur = KINDS.find((k) => k.id === curKind)!;
  const curOn = kindOn(curKind);
  const open = stepsOpen ?? (!!first && !connected.length);

  if (failed && !view)
    return (
      <div className="ag-page">
        <p className="ag-lead">Use Merlin from your own agent, such as Claude. It works as you, and it asks before it spends or sends.</p>
        <section className="ag-card ag-pad" role="alert">
          <p>{failed}</p>
          <button type="button" className="btn btn-pine" onClick={() => void reload()}>
            Try again
          </button>
        </section>
      </div>
    );
  if (!view || first === null)
    return (
      <div className="tp-allwait" role="status" aria-busy>
        <p className="tp-allwait-t">Loading your agents…</p>
      </div>
    );

  /* ----- actions ----- */
  const flip = async (key: string, on: boolean) => {
    setView((v) => v && applyFlip(v, key, on));
    const r = await send("/api/agent", { key, on });
    if (r.view) setView(r.view);
    else toast(r.error ?? "", true), void reload();
  };
  const setLimit = async (limit: number | null) => {
    setView((v) => v && { ...v, limit });
    const r = await send("/api/agent", { limit });
    if (r.view) setView(r.view);
    else toast(r.error ?? "", true), void reload();
  };
  const revoke = async (id: string, name: string) => {
    setBusy(id);
    const r = await send("/api/oauth/apps", { revoke: id });
    setBusy(null);
    setAsking(null);
    if (r.error) return toast(r.error, true);
    setSaid(`Disconnected ${name}. It cannot use your account any more.`);
    await reload();
  };
  const check = async () => {
    setChecking(true);
    const v = await reload();
    setChecking(false);
    const now = (v?.apps ?? []).some((a) => kindOf(a.name) === curKind);
    setSaid(now ? `${cur.name} is connected. It reads and adds as you, and it still asks before it spends or sends.` : `${cur.name} is not connected yet. Finish the sign-in in ${cur.name}, pick Allow, then check again.`);
  };

  /* ----- the parts ----- */
  const spendOn = view.groups.find((g) => g.id === "spend")?.on ?? true;
  const stripOn = !stripGone(c, "agent") && view.log.length === 0;
  const fnWords = (c.me.title || "").replace(/^fractional\s+/i, "") || (c.me.function ? `${c.me.function} leader` : "leader");
  const firstQ = `Which companies are the best fit for me to prospect as a fractional ${fnWords}?`;

  const tiles = [
    ...connected.map((a) => ({ key: a.id, app: a, def: a.kind ? KINDS.find((k) => k.id === a.kind)! : null })),
    ...KINDS.filter((k) => !kindOn(k.id)).map((k) => ({ key: k.id, app: null, def: k })),
  ];

  const steps = [
    { n: 1, t: "Copy your address", d: "It works in every agent. You sign in to Merlin in your browser, so there is no key to paste.", done: addrCopied || curOn, code: addr, codeLabel: "Connector address", hot: !!first && !addrCopied && !curOn, onCopy: () => setAddrCopied(true) },
    { n: 2, t: `Add it in ${cur.name}`, d: cur.how, done: curOn, code: cur.code?.(addr), codeLabel: `Text to paste for ${cur.name}`, note: `${cur.where}.` },
    { n: 3, t: "Sign in to Merlin and allow it", d: `Pick Connect. Merlin opens in your browser and asks if ${cur.name} may use your account. Pick Allow, or Do not allow to stop there.`, done: curOn, go: !curOn, note: curOn ? `${cur.name} is connected. Revoke it above at any time.` : cur.tip },
  ];
  const nowStep = curOn ? 0 : addrCopied ? 2 : 1;

  return (
    <div className="ag-page">
      <p className="ag-lead">Use Merlin from your own agent, such as Claude. It works as you, and it asks before it spends or sends.</p>

      {stripOn && (
        <section className={`ag-strip${connected.length ? " ag-strip-on" : ""}`} aria-label="About this page">
          {connected.length ? (
            <>
              <span className="ag-strip-t">
                <strong>{connected[0].name} is connected.</strong> Ask it a first question. Reading is free, and nothing is spent until you say yes.
              </span>
              <CopyButton text={firstQ} done="Question copied. Paste it into your agent." hot>
                Copy a first question
              </CopyButton>
            </>
          ) : (
            <span className="ag-strip-t">
              <strong>What this page is for.</strong> Connect your own agent, such as Claude, to Merlin. Then ask in your own words: it finds companies, adds what you know and drafts proposals, as you. It always asks before it spends a credit or sends anything for signature.
            </span>
          )}
          <button type="button" className="ag-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip("agent")}>
            <Tick cross />
          </button>
        </section>
      )}

      {/* Credits: the same meter as Credits and usage (credits/Meter.tsx). Agents spend the member's own credits, and that is the point. */}
      {c.me.meter && (
        <section className="ag-card ag-pad ag-credits" aria-label="Your credits">
          <CreditsMeterBar me={c.me} lead="Your agents use the same credits you do. Let them work: each spend still asks you first." from="claude" onEarn={() => c.openPage("credits")}>
            <span className="ag-credits-lim">
              Daily spend limit: <a href="#ag-limit">{view.limit === null ? "No limit (default)" : `${view.limit} credits a day`}</a>. A limit is optional.
            </span>
          </CreditsMeterBar>
        </section>
      )}

      {/* Your agents */}
      <section className="ag-card" aria-labelledby="ag-conn">
        <div className="ag-head">
          <h2 id="ag-conn">Your agents</h2>
          <span className={`ag-pill ${connected.length ? "ag-pill-free" : "ag-pill-grey"}`}>{connected.length ? `${connected.length} connected` : "None connected yet"}</span>
          <span className="ag-sub">One address works in every agent. Revoke one and it stops at once. An agent you do not use for 30 days is signed out and has to ask again.</span>
        </div>
        {said && (
          <div className="ag-said" role="status">
            {said}
          </div>
        )}
        <div className="ag-tiles">
          {tiles.map(({ key, app, def }) => {
            const picked = !app && def?.id === curKind && open;
            const isAsking = app && asking === app.id;
            return (
              <div key={key} className={`ag-tile${picked ? " ag-picked" : ""}`}>
                <div className="ag-tile-top">
                  <span className={`ag-mark ag-mark-${def?.id ?? "other"}`}>
                    <AgentIcon />
                  </span>
                  <span className="ag-tile-name">
                    <strong>{app?.name ?? def?.name}</strong>
                    {!first && def && <span className="ag-meta">{def.where}</span>}
                  </span>
                </div>
                {(app || !first) && (
                  <span className="ag-tile-line">
                    {app
                      ? `Since ${day(app.connectedAt)}, used ${timeAgo(app.lastUsedAt)}. ${plural(app.requestsToday, "request")} and ${plural(app.creditsToday, "credit")} today.`
                      : "It cannot see or do anything in your account."}
                  </span>
                )}
                <div className="ag-tile-acts">
                  {app && !isAsking && (
                    <button type="button" className="btn btn-sm" aria-label={`Disconnect ${app.name}`} onClick={() => setAsking(app.id)}>
                      Revoke
                    </button>
                  )}
                  {app && isAsking && (
                    <span className="ag-ask" role="group" aria-label={`Disconnect ${app.name}`}>
                      <strong>Disconnect {app.name}?</strong>
                      <button type="button" className="btn btn-sm btn-pine" disabled={!!busy} aria-busy={busy === app.id} onClick={() => void revoke(app.id, app.name)}>
                        {busy === app.id ? "Disconnecting" : "Disconnect"}
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => setAsking(null)}>
                        Keep it
                      </button>
                    </span>
                  )}
                  {!app && def && (
                    <button type="button" className={`btn btn-sm${picked ? " ag-copied" : ""}`} aria-pressed={picked} onClick={() => (setPick(def.id), setStepsOpen(true))}>
                      {picked ? "Steps below" : "How to connect"}
                    </button>
                  )}
                  {!isAsking && <span className={`ag-pill ag-right ${app ? "ag-pill-free" : "ag-pill-grey"}`}>{app ? "Connected" : "Not connected"}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {!open ? (
          <div className="ag-another">
            <strong>Connect another agent</strong>
            <code className="ag-code" aria-label="Connector address">
              {addr}
            </code>
            <CopyButton text={addr} done="Address copied. Paste it into your agent." hot>
              Copy address
            </CopyButton>
            <button type="button" className="btn btn-sm" aria-expanded={false} onClick={() => setStepsOpen(true)}>
              Show the three steps
            </button>
          </div>
        ) : (
          <div className="ag-steps">
            <div className="ag-steps-head">
              <strong>{curOn ? `${cur.name} is connected` : `Connect ${cur.name} in three steps`}</strong>
              <span className="ag-sub">{curOn ? "" : "About 2 minutes. "}Pick another agent above to see its steps.</span>
              {!first && (
                <button type="button" className="btn btn-sm" aria-expanded onClick={() => setStepsOpen(false)}>
                  Hide the steps
                </button>
              )}
            </div>
            <ol className="ag-steplist">
              {steps.map((s) => (
                <li key={s.n} className={`ag-step${first && s.n === nowStep ? " ag-step-now" : ""}`}>
                  <span className={`ag-dot${s.done ? " done" : s.n === nowStep ? " now" : ""}`}>{s.done ? <Tick /> : s.n}</span>
                  <span className="ag-step-body">
                    <strong>{s.t}</strong>
                    <span>{s.d}</span>
                    {s.code && (
                      <span className="ag-step-code">
                        <code aria-label={s.codeLabel}>{s.code}</code>
                        <span onClick={s.onCopy}>
                          <CopyButton text={s.code} done={s.n === 1 ? "Address copied. Paste it into your agent." : "Copied. Paste it where the step says."} hot={s.hot}>
                            {s.n === 1 ? "Copy address" : "Copy"}
                          </CopyButton>
                        </span>
                      </span>
                    )}
                    {s.go && (
                      <button type="button" className="btn btn-sm ag-check" onClick={() => void check()} aria-busy={checking} disabled={checking}>
                        {checking ? "Checking" : "Check the connection"}
                      </button>
                    )}
                    {s.note && <span className="ag-note">{s.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div className="ag-cols">
        <div className="ag-main">
          <Tools view={view} first={first} grp={grp} setGrp={setGrp} flip={flip} />
          <Log view={view} first={first} tab={logTab} setTab={setLogTab} />
        </div>
        <div className="ag-side">
          <Limit view={view} spendOn={spendOn} setLimit={setLimit} />
          <Asks view={view} first={first} tab={askTab} setTab={setAskTab} firstQ={firstQ} />
          <Taught voice={c.me.voice ?? null} network={net?.claude ?? null} />
        </div>
      </div>
    </div>
  );
}

/** The view with one switch flipped, as the server will answer (so the switch moves at once). */
function applyFlip(v: AgentView, key: string, on: boolean): AgentView {
  if (key.startsWith("g:")) {
    const g = key.slice(2);
    const groups = v.groups.map((x) => (x.id === g ? { ...x, on } : x));
    return { ...v, groups, tools: v.tools.map((t) => (t.group === g ? { ...t, on: on && t.self } : t)) };
  }
  return { ...v, tools: v.tools.map((t) => (t.key === key ? { ...t, self: on, on } : t)) };
}

/* ---------- What your agent can do ---------- */

function Tools({ view, first, grp, setGrp, flip }: { view: AgentView; first: boolean; grp: AgentGroup; setGrp: (g: AgentGroup) => void; flip: (key: string, on: boolean) => void }) {
  const total = view.tools.length;
  const groupOn = (g: AgentGroup) => view.groups.find((x) => x.id === g)?.on ?? true;
  const live = view.tools.filter((t) => t.on).length;
  const shown = view.tools.filter((t) => t.group === grp);
  const gName = view.groups.find((g) => g.id === grp)?.name ?? "";
  const gOn = groupOn(grp);
  const liveHere = shown.filter((t) => t.on).length;
  const status = !gOn
    ? `${gName} is off. Your agents cannot use these until you turn the group back on.`
    : `${liveHere} of ${shown.length} on in ${gName}. ${grp === "spend" ? "Each spend is checked against your daily limit, after your yes." : grp === "send" ? "Nothing leaves Merlin until you say yes." : grp === "add" ? "What it adds earns the same credits as adding it yourself." : "Reading never costs a credit."}`;
  return (
    <section className="ag-card" id="ag-tools" aria-labelledby="ag-tools-h">
      <div className="ag-head">
        <h2 id="ag-tools-h">What your agent can do</h2>
        <span className="ag-sub">
          {total} tools in four groups. {live === total ? "All are on." : `${live} are on.`}
          {first && !view.apps.length ? " Switch off what you do not want before you connect." : ""}
        </span>
      </div>
      <div className="ag-rule">
        <LockIcon size={18} />
        <span>
          <strong>Two things always ask first: spending credits and sending for signature.</strong> Your agent says what it costs, or who it goes to, then waits for your yes. No switch on this page turns that off. It sees only what you can see in Merlin, and never your sign-in link.
        </span>
      </div>
      {first && (
        <div className="ag-can">
          <div>
            <strong>It can</strong>
            {["Search and read, as far as you can see", "Add what you know, and earn credits for it", "Draft proposals, save alerts, update your pipeline"].map((t) => (
              <span key={t} className="ag-can-i">
                <Tick />
                <span>{t}</span>
              </span>
            ))}
          </div>
          <div>
            <strong>It cannot</strong>
            {["Spend or send for signature without your yes", "See your sign-in link, or more than you can", "Send email for you, or pass its text to Merlin"].map((t) => (
              <span key={t} className="ag-can-i">
                <Tick cross />
                <span>{t}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="ag-groups">
        {view.groups.map((g) => {
          const n = view.tools.filter((t) => t.group === g.id);
          const on = n.filter((t) => t.on).length;
          return (
            <div key={g.id} className={`ag-group${g.id === grp ? " ag-picked" : ""}`}>
              <button type="button" className="ag-group-pick" aria-pressed={g.id === grp} aria-label={`Show the ${g.name} tools`} onClick={() => setGrp(g.id)}>
                <span className="ag-group-name">
                  <strong>{g.name}</strong>
                  <span className="ag-meta">
                    {g.id === "spend" ? `1 tool, ${n.length} kinds` : `${n.length} tools`}
                    {on < n.length ? ` · ${on} on` : ""}
                  </span>
                </span>
                <span className="ag-group-d">{g.d}</span>
              </button>
              <span className="ag-group-foot">
                <Switch on={g.on} label={`${g.name} tools`} text={g.on ? "On" : "Off"} onFlip={() => flip(`g:${g.id}`, !g.on)} />
                {(g.id === "spend" || g.id === "send") && (
                  <span className="ag-asks">
                    <LockIcon size={13} />
                    Asks first
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ag-table" role="table" aria-label={`${gName} · ${grp === "spend" ? `${shown.length} kinds` : `${shown.length} tools`}`}>
        <div className="ag-tr ag-th ag-tools-row" role="row">
          <span role="columnheader">
            {gName} · {grp === "spend" ? `${shown.length} kinds` : `${shown.length} tools`}
          </span>
          <span role="columnheader">What it does</span>
          <span role="columnheader">Cost and asking</span>
          <span role="columnheader">Used, 30 days</span>
          <span role="columnheader">On</span>
        </div>
        {shown.map((t) => (
          <ToolRow key={t.key} t={t} first={first} gOn={gOn} flip={flip} />
        ))}
      </div>
      <div className="ag-foot">
        <span>{status}</span>
        <a href="#ag-log">See what each one did</a>
      </div>
    </section>
  );
}

function ToolRow({ t, first, gOn, flip }: { t: AgentView["tools"][number]; first: boolean; gOn: boolean; flip: (key: string, on: boolean) => void }) {
  const lock = t.group === "spend" || t.group === "send";
  return (
    <div className={`ag-tr ag-tools-row${t.on ? "" : " ag-off"}`} role="row">
      <span role="cell" className="ag-two">
        <strong>{t.name}</strong>
        <span className="ag-mono">{t.tool}</span>
      </span>
      <span role="cell" className="ag-d">
        {t.d}
      </span>
      <span role="cell" className="ag-cost">
        <span className="ag-cost-top">
          {lock && (
            <span role="img" aria-label="Asks first" className="ag-lock">
              <LockIcon />
            </span>
          )}
          <span className={`ag-pill ${t.cost === "earn" || t.cost === "earn5" ? "ag-pill-earn" : t.cost === "c1" || t.cost === "c2" ? "ag-pill-paid" : t.cost === "close" ? "ag-pill-grey" : "ag-pill-free"}`}>{COST_WORDS[t.cost]}</span>
        </span>
        <span className="ag-meta">{askWords(t)}</span>
      </span>
      <span role="cell" className="ag-used">
        {first || !t.used30 ? "Not yet" : plural(t.used30, "time")}
      </span>
      <span role="cell">
        <Switch on={t.on} label={t.name} disabled={!gOn} onFlip={() => flip(t.key, !t.self)} />
      </span>
    </div>
  );
}

/* ---------- What your agents did ---------- */

function Log({ view, first, tab, setTab }: { view: AgentView; first: boolean; tab: LogTab; setTab: (t: LogTab) => void }) {
  const c = useApp();
  const rows = view.log.filter((r) => tab === "all" || tabOf(r) === tab);
  const examples = view.log.length === 0;
  const TABS: [LogTab, string][] = [
    ["all", "All"],
    ["read", "Read"],
    ["add", "Added"],
    ["spend", "Asked to spend"],
    ["out", "Drafted and sent"],
  ];
  const sub = examples
    ? "Nothing yet. Four example rows show what you will see: a read, an add, a spend and a draft."
    : first
      ? "Your first real rows are in."
      : `Last 7 days · ${plural(view.week.all, "request")} · ${plural(view.weekSpent, "credit")} spent`;
  const since = view.since ? `Merlin keeps this log for 90 days. Counting since ${day(view.since)}.` : "Merlin keeps this log for 90 days.";
  return (
    <section className="ag-card ag-log" id="ag-log" aria-labelledby="ag-log-h">
      <div className="ag-head">
        <h2 id="ag-log-h">What your agents did</h2>
        <span className="ag-sub">{sub}</span>
      </div>
      <div className="ag-tabs" role="tablist" aria-label="Kind of activity">
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {name}
            {!examples && <span className="ag-tab-n">{view.week[k]}</span>}
          </button>
        ))}
      </div>
      <div className="ag-table" role="table" aria-label="Agent activity">
        <div className="ag-tr ag-th ag-log-row" role="row">
          <span role="columnheader">When</span>
          <span role="columnheader">Agent</span>
          <span role="columnheader">What it did</span>
          <span role="columnheader">Credits</span>
          <span role="columnheader">Where it landed</span>
        </div>
        {examples
          ? EXAMPLE_ROWS.filter((r) => tab === "all" || tabOfExample(r.kind) === tab).map((r) => (
              <div key={r.t} className="ag-tr ag-log-row ag-ex" role="row">
                <span role="cell">
                  <span className="ag-pill ag-pill-grey">Example</span>
                </span>
                <span role="cell" className="ag-agent">
                  <span className={`ag-pill ag-tone-${r.tone}`}>{r.kind}</span>
                  {r.agent}
                </span>
                <span role="cell" className="ag-two">
                  <strong>{r.t}</strong>
                  <span className="ag-meta">{r.s}</span>
                </span>
                <span role="cell" className="ag-credits">
                  {r.c}
                </span>
                <span role="cell" />
              </div>
            ))
          : rows.map((r, i) => <LogRow key={`${r.at}-${i}`} r={r} limit={view.limit} hrefOf={c.hrefOf} openPage={c.openPage} />)}
        {!examples && !rows.length && (
          <div className="ag-empty">{tab === "add" ? "Nothing added yet. Ask your agent to add a seat you held. It shows here with the credits it earned." : "Nothing of this kind in the last 90 days."}</div>
        )}
      </div>
      <div className="ag-foot">
        <span role="status">{examples ? "No requests yet." : `Showing ${rows.length} of the last ${plural(view.log.length, "request")}.`}</span>
        <span className="ag-meta">{since}</span>
      </div>
    </section>
  );
}
const tabOfExample = (kind: string): LogTab => (kind === "Read" ? "read" : kind === "Added" ? "add" : kind === "Spent" ? "spend" : "out");

function LogRow({ r, limit, hrefOf, openPage }: { r: AgentLogRow; limit: number | null; hrefOf: (p: ShellPage) => string; openPage: (p: ShellPage) => void }) {
  const w = rowWords(r, limit);
  const t = AGENT_LAND(r);
  return (
    <div className="ag-tr ag-log-row" role="row">
      <span role="cell" className="ag-two">
        <strong>{hm(r.at)}</strong>
        <span className="ag-meta">{dayWord(r.at)}</span>
      </span>
      <span role="cell" className="ag-agent">
        <span className={`ag-pill ag-tone-${w.tone}`}>{w.kind}</span>
        {r.a ?? "Your agent"}
      </span>
      <span role="cell" className="ag-two">
        <strong>{w.t}</strong>
        <span className="ag-meta">{w.s}</span>
      </span>
      <span role="cell" className={`ag-credits${r.c ? " ag-ink" : ""}`}>
        {w.c}
      </span>
      <span role="cell">
        {r.o === "limit" ? (
          <a href="#ag-limit">Change the limit</a>
        ) : r.o === "off" ? (
          <a href="#ag-tools">Turn it on</a>
        ) : t ? (
          <a
            href={hrefOf(t.page)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              openPage(t.page);
            }}
          >
            {t.label}
          </a>
        ) : null}
      </span>
    </div>
  );
}
function AGENT_LAND(r: AgentLogRow) {
  if (r.o !== "ok") return null;
  const land = TOOL_LAND(r.t);
  return land ? LAND[land] ?? null : null;
}
const TOOL_LAND = (key: string) => TOOL_BY_KEY.get(key)?.land ?? null;

/* ---------- Daily spend limit ---------- */

function Limit({ view, spendOn, setLimit }: { view: AgentView; spendOn: boolean; setLimit: (n: number | null) => void }) {
  const c = useApp();
  const { limit, spentToday } = view;
  const meter = spendOn && limit ? Math.min(100, Math.round((spentToday / limit) * 100)) : 0;
  const meterText = !spendOn
    ? "Your agents cannot spend credits. Turn Spend back on to use a limit."
    : limit
      ? `${spentToday} of ${limit} credits spent by your agents today. Resets at midnight UTC.`
      : `${plural(spentToday, "credit")} spent by your agents today. Each spend still asks you first.`;
  // No limit is the default (lib/mcp/log.ts DEFAULT_LIMIT): agents should be free to use credits. A cap is the member's choice.
  const note = !spendOn
    ? "Pick a limit now and it applies when you turn Spend back on. Reading, adding and drafting still work."
    : limit
      ? `${limit} credits opens about ${limit} names and titles, or ${Math.floor(limit / 2)} people with an email each. At the limit your agent is told to stop until tomorrow. You can still spend in Merlin yourself. A company that opens free on your plan does not count.`
      : "No limit is the default: your agents may spend what you say yes to, as you would. A limit is optional. Pick one if you want them to stop at it each day.";
  const opens = c.me.proOpens;
  return (
    <section className="ag-card ag-pad ag-limit" id="ag-limit" aria-labelledby="ag-lim-h">
      <div className="ag-head ag-head-flat">
        <h2 id="ag-lim-h">Daily spend limit</h2>
        <span className="ag-sub">Optional. All your agents together</span>
      </div>
      <div className="ag-big">
        <strong>{spendOn ? (limit ? limit : "No limit") : "Off"}</strong>
        <span>{spendOn ? (limit ? "credits a day" : "the default") : "Spend is switched off"}</span>
      </div>
      <div className="ag-meter" role="img" aria-label={meterText}>
        <span style={{ width: `${meter}%` }} />
      </div>
      <span className="ag-meter-t">{meterText}</span>
      <div className="ag-radios" role="radiogroup" aria-label="Credits your agents may spend in a day">
        <button type="button" role="radio" aria-checked={limit === null} aria-label="No limit, the default" className={`ag-radio-none${limit === null ? " on" : ""}`} onClick={() => setLimit(null)}>
          No limit (default)
        </button>
        {LIMIT_CHOICES.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={limit === n} aria-label={`${n} credits a day`} className={limit === n ? "on" : ""} onClick={() => setLimit(n)}>
            {n}
          </button>
        ))}
      </div>
      <span className="ag-note">{note}</span>
      <div className="ag-caps">
        <span>
          <span>Agent requests today</span>
          <strong>
            {view.requestsToday.toLocaleString("en-US")} of {(view.freeCap ?? 2000).toLocaleString("en-US")}
          </strong>
        </span>
        {opens && (
          <span>
            <span>Free company opens today</span>
            <strong>
              {opens.of - opens.left} of {opens.of}
            </strong>
          </span>
        )}
        <span>
          <span>Fair use</span>
          <strong>60 requests a minute</strong>
        </span>
        <span className="ag-caps-foot">
          <span>{view.freeCap ? `Free allows ${view.freeCap} questions a day. Pro, Close and the trial have no daily cap on questions.` : "No daily cap on questions on your plan beyond fair use."}</span>
          <a
            href={c.hrefOf("credits")}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              c.openPage("credits");
            }}
          >
            See plans
          </a>
        </span>
      </div>
    </section>
  );
}

/* ---------- Things to ask ---------- */

type AskTab = "find" | "add" | "close" | "teach";
function Asks({ view, first, tab, setTab, firstQ }: { view: AgentView; first: boolean; tab: AskTab; setTab: (t: AskTab) => void; firstQ: string }) {
  const c = useApp();
  const has = (k: string) => view.tools.some((t) => t.key === k);
  const ASKS: { tab: AskTab; q: string; n: string; tag?: string; link?: { page: ShellPage; label: string } }[] = [
    { tab: "find", q: firstQ, n: first ? "Free. Uses your ideal client from sign-up." : "Free. Uses your ideal client.", tag: first ? "Start here" : undefined },
    { tab: "find", q: "What is the best way into [a company you want as a client]?", n: "Free." },
    { tab: "find", q: "What are my three moves today? Draft each note in my voice.", n: "Free. It drafts, you send the notes yourself." },
    { tab: "find", q: "What is new in open Sales roles this week?", n: "Free." },
    { tab: "find", q: "What does a fractional RevOps lead charge?", n: "Free. From rate benchmarks." },
    { tab: "find", q: "Who decides at [a company I have opened]? Tell me the cost first.", n: "Asks first. 1 credit a person." },
    { tab: "add", q: "Add my seat. I was the fractional [your title] at [a client you worked with] from [month and year] to [month and year].", n: "Each seat becomes a way in and a draft evidence case.", tag: "Earns credits" },
    { tab: "add", q: "Set up alerts on fractional Sales roles at SaaS companies from $5M to $20M.", n: "Free. Alerts come by email or Slack.", link: { page: "alerts", label: "Open your alerts" } },
    { tab: "add", q: "Move [a company in my pipeline] to Replied and add a note: [what happened].", n: "Free." },
    { tab: "add", q: "Follow [a company] and tell me when it posts a fractional role.", n: "Free." },
    { tab: "close", q: "Use my [template name] template and draft a proposal for [company] from my call with [who you spoke to].", n: "Close plan, and on the trial. Lands in Proposals as a draft." },
    { tab: "close", q: "Change the [company] proposal: add a second pricing option at [price] a month.", n: "Close plan, and on the trial." },
    { tab: "close", q: "Send the [company] proposal to [who signs] for signature.", n: "Asks first. It shows who it goes to." },
    { tab: "close", q: "Pass [a company that is not my fit] to a peer who does RevOps.", n: "Asks first. Earns 5 credits when it is picked up." },
    ...(has("save_my_network")
      ? [{ tab: "teach" as const, q: TEACH_NETWORK, n: "Needs your mail connected in your agent. Merlin never gets message text.", link: { page: "warm" as ShellPage, label: "See your warm paths" } }]
      : []),
    { tab: "teach", q: TEACH_VOICE, n: "Merlin keeps conclusions only: greeting, sign-off, length and tone.", link: { page: "settings", label: "Or set your voice by hand" } },
  ];
  const TABS: [AskTab, string][] = [
    ["find", "Find"],
    ["add", "Add"],
    ["close", "Close"],
    ["teach", "Teach Merlin"],
  ];
  return (
    <section className="ag-card ag-pad" aria-labelledby="ag-ask-h">
      <div className="ag-head ag-head-flat">
        <h2 id="ag-ask-h">Things to ask</h2>
        <span className="ag-sub">Copy one into your agent. Fill in [brackets] first. In Claude, turn Merlin on from the tools menu if it does not use it on its own.</span>
      </div>
      <div className="ag-tabs ag-tabs-flat" role="tablist" aria-label="Kind of question">
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {name}
          </button>
        ))}
      </div>
      {ASKS.filter((a) => a.tab === tab).map((a) => (
        <div key={a.q} className="ag-q">
          <span className="ag-q-body">
            {a.tag && <span className={`ag-pill ${/credit/.test(a.tag) ? "ag-pill-earn" : "ag-pill-mint"}`}>{a.tag}</span>}
            <span className="ag-q-t">{a.q}</span>
            <span className="ag-meta">{a.n}</span>
            {a.link && (
              <a
                href={c.hrefOf(a.link.page)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  c.openPage(a.link!.page);
                }}
              >
                {a.link.label}
              </a>
            )}
          </span>
          <CopyButton text={a.q} label={`Copy: ${a.q.slice(0, 60)}`} done={/\[[^\]]+\]/.test(a.q) ? "Question copied. Paste it into your agent and fill in the brackets." : "Question copied. Paste it into your agent."} />
        </div>
      ))}
    </section>
  );
}
const TEACH_NETWORK =
  "Look through my Gmail for the last 2 years. Find people I have emailed back and forth with at companies, and save my network to Merlin: company website, their name and title, how many emails, and when we last spoke. Do not send any email text.";
const TEACH_VOICE =
  "Read about 40 short emails I sent in the last few months and work out how I write: my greeting, my sign-off, how long my notes are, how formal I am, and a few phrases I use a lot. Show me the summary. When I say it is right, save my writing voice to Merlin. Do not send Merlin any email text, names or addresses.";

/* ---------- What your agent taught Merlin ---------- */

function Taught({ voice, network }: { voice: VoiceProfile | null; network: { at: string; companies: number } | null }) {
  const c = useApp();
  if (!voice && !network) return null;
  const go = (p: ShellPage) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    c.openPage(p);
  };
  return (
    <section className="ag-card ag-pad" aria-labelledby="ag-taught-h">
      <div className="ag-head ag-head-flat">
        <h2 id="ag-taught-h">What your agent taught Merlin</h2>
        <span className="ag-sub">Your agent reads your mail on its side. Merlin keeps conclusions only, never a subject or a word of an email. Only you see them.</span>
      </div>
      {network && (
        <div className="ag-taught">
          <span className="ag-two">
            <strong>Your network</strong>
            <span className="ag-meta">Saved by your agent, {day(network.at)}</span>
          </span>
          <span>{plural(network.companies, "company", "companies")}, with titles, about how many emails and when you last spoke.</span>
          <span className="ag-taught-acts">
            <a href={c.hrefOf("warm")} onClick={go("warm")}>
              See your warm paths
            </a>
            <CopyButton text={TEACH_NETWORK} label="Copy the prompt for: Your network" done="Prompt copied. Paste it into your agent.">
              Copy prompt
            </CopyButton>
          </span>
        </div>
      )}
      {voice && (
        <div className="ag-taught">
          <span className="ag-two">
            <strong>Your writing voice</strong>
            <span className="ag-meta">
              {voice.by === "claude" ? "Saved by your agent" : "Set by you"}, {timeAgo(voice.at)}
            </span>
          </span>
          <span>
            Greeting &ldquo;{voice.greeting.replace("{first}", "[first name]")}&rdquo;. {voice.signoff && voice.signoff !== "none" ? <>Sign-off &ldquo;{voice.signoff}&rdquo;. </> : ""}
            {voice.length[0].toUpperCase() + voice.length.slice(1)} notes, {voice.formality} tone{voice.phrases.length ? `, ${plural(voice.phrases.length, "stock phrase")}` : ""}.
          </span>
          <span className="ag-taught-acts">
            <a href={c.hrefOf("settings")} onClick={go("settings")}>
              Edit your voice
            </a>
            <CopyButton text={TEACH_VOICE} label="Copy the prompt for: Your writing voice" done="Prompt copied. Paste it into your agent.">
              Copy prompt
            </CopyButton>
          </span>
        </div>
      )}
    </section>
  );
}
