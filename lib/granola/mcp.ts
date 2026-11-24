/**
 * A small MCP client for Granola's MCP server over Streamable HTTP (JSON-RPC 2.0 by POST; the
 * answer comes back as JSON or as a short event stream): initialize, notifications/initialized,
 * then tools/call. A client keeps its session for the next calls (lib/granola/index.ts mcpFor keeps
 * one per member for a few minutes), and starts a new one when the server says it has ended it.
 * Calls at once share one initialize.
 *
 * The member's access token goes as a Bearer token. A 401 asks for one renewal (the refresh
 * token) and tries again, unless another call renewed it meanwhile (then it simply tries again);
 * a second 401 for the same message is the end of the connection (bad_key). Requests share the
 * key path's pacing (lib/granola/api.ts turn: a burst of 10, 4 a second, per member) and its
 * backoff on 429. Nothing here logs a token, a meeting or an answer: only short codes.
 */
import { GranolaError, _pace, retryAfter, turn } from "./api";

const PROTOCOL = "2025-06-18";
const TIMEOUT_MS = 20_000;
const RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ToolAnswer {
  /** The text parts of the result, joined. */
  text: string;
  /** structuredContent when the server sent it, else the text read as JSON when it is JSON. */
  data: unknown;
  isError: boolean;
}

type Rpc = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

/** The JSON-RPC answer to `id` in an event stream (data: lines, events split by blank lines). */
function fromStream(raw: string, id: number): Record<string, unknown> | null {
  for (const ev of raw.split(/\r?\n\r?\n/)) {
    const data = ev
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const j = JSON.parse(data) as Record<string, unknown> | Record<string, unknown>[];
      for (const m of Array.isArray(j) ? j : [j]) if (m && m.id === id && ("result" in m || "error" in m)) return m;
    } catch {}
  }
  return null;
}

/** A tool's error text, as a code. */
export function codeOfToolError(text: string): GranolaError["code"] {
  if (/not found|no meeting|couldn.t find|cannot be found|does not exist|doesn.t exist|unknown meeting/i.test(text)) return "not_found";
  if (/rate.?limit|too many requests/i.test(text)) return "busy";
  if (/access (is )?denied|permission|not permitted|forbidden|not allowed|disabled/i.test(text)) return "forbidden";
  return "bad_answer";
}

export class McpClient {
  private session: string | null = null;
  private protocol = PROTOCOL;
  private ready = false;
  private n = 0;
  private starting: Promise<void> | null = null;

  /**
   * url: the MCP server. access(): the current access token. renew(): a new one (refresh), or a
   * GranolaError. pace: the pacing bucket's id.
   */
  constructor(
    private url: string,
    private access: () => string,
    private renew: () => Promise<string>,
    private pace: string,
  ) {}

  private async send(msg: Rpc): Promise<Record<string, unknown> | null> {
    const wantsReply = msg.id !== undefined;
    let reinit = false;
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      await turn(this.pace);
      let r: Response;
      const token = this.access();
      try {
        r = await fetch(this.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...(this.ready || msg.method === "notifications/initialized" ? { "mcp-protocol-version": this.protocol } : {}),
            ...(this.session ? { "mcp-session-id": this.session } : {}),
          },
          body: JSON.stringify(msg),
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        const timeout = (e as { name?: string })?.name === "TimeoutError";
        if (attempt < 1 && !timeout) continue;
        throw new GranolaError(timeout ? "timeout" : "unreachable");
      }
      if (r.status === 401) {
        await r.body?.cancel().catch(() => {});
        if (!renewed) {
          renewed = true;
          // Another call on this client renewed it while this one was out: try again with that one.
          if (this.access() === token) await this.renew();
          continue;
        }
        throw new GranolaError("bad_key", 401);
      }
      // A session the server has ended: start a new one, once.
      if (r.status === 404 && this.session && msg.method !== "initialize" && !reinit) {
        await r.body?.cancel().catch(() => {});
        reinit = true;
        this.session = null;
        this.ready = false;
        await this.init();
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        await r.body?.cancel().catch(() => {});
        if ((r.status === 429 && attempt < RETRIES) || (r.status >= 500 && attempt < 1)) {
          await sleep(retryAfter(r.headers.get("retry-after")) ?? _pace.backoffMs * 2 ** attempt + Math.floor(Math.random() * 100));
          continue;
        }
        throw new GranolaError(r.status === 429 ? "busy" : "server", r.status);
      }
      if (r.status === 403) throw new GranolaError("forbidden", 403);
      if (msg.method === "initialize") this.session = r.headers.get("mcp-session-id") || null;
      if (!wantsReply) {
        await r.body?.cancel().catch(() => {});
        if (!r.ok) throw new GranolaError("bad_answer", r.status);
        return null;
      }
      if (!r.ok) throw new GranolaError(r.status === 400 ? "invalid" : "bad_answer", r.status);
      const raw = await r.text().catch(() => "");
      let j: Record<string, unknown> | null = null;
      if (/text\/event-stream/i.test(r.headers.get("content-type") ?? "")) j = fromStream(raw, msg.id!);
      else
        try {
          const x = JSON.parse(raw) as Record<string, unknown> | Record<string, unknown>[];
          j = (Array.isArray(x) ? x.find((m) => m?.id === msg.id) : x) ?? null;
        } catch {}
      if (!j) throw new GranolaError("bad_answer", r.status);
      if (j.error) {
        const code = (j.error as { code?: unknown })?.code;
        throw new GranolaError(code === -32602 ? "invalid" : "bad_answer", r.status);
      }
      return (j.result as Record<string, unknown>) ?? {};
    }
  }

  private async init(): Promise<void> {
    const res = await this.send({ jsonrpc: "2.0", id: ++this.n, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "Merlin", version: "1.0" } } });
    if (typeof res?.protocolVersion === "string" && res.protocolVersion.length < 40) this.protocol = res.protocolVersion;
    this.ready = true;
    await this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  /** tools/call: the answer's text and data. A tool that says it failed comes back with isError. */
  async tool(name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
    if (!this.ready) await (this.starting ??= this.init().finally(() => (this.starting = null)));
    const res = await this.send({ jsonrpc: "2.0", id: ++this.n, method: "tools/call", params: { name, arguments: args } });
    const parts = Array.isArray(res?.content) ? (res!.content as { type?: string; text?: unknown }[]) : [];
    const text = parts
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n");
    let data: unknown = res?.structuredContent && typeof res.structuredContent === "object" ? res.structuredContent : null;
    if (data === null && /^\s*[[{]/.test(text))
      try {
        data = JSON.parse(text);
      } catch {}
    return { text, data, isError: res?.isError === true };
  }
}
