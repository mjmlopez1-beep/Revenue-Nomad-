/**
 * The three Gmail calls Approve and send makes, with fetch (no SDK), against Google or the test
 * server (lib/google/config.ts bases, RN_GOOGLE_API_TEST under RN_SCAN_TEST=1):
 *
 *   send       users.messages.send (gmail.send): the member's approved note, as RFC 2822
 *   messageId  users.messages.get, format=metadata, the Message-ID header of the note just sent,
 *              so a follow-up can name it in In-Reply-To (gmail.metadata, when the member has it)
 *   replied    users.threads.get, format=metadata, the From header and time of each message in the
 *              thread a note started: did someone other than the member write after it?
 *              (gmail.metadata, already granted for Gmail headers)
 *
 * Never a message's text, snippet or subject is asked for: metadata with named headers only.
 * Nothing here logs a token or a response body, only short codes.
 */
import { bases } from "../google/config";
import { GoogleError } from "../google/api";

const TIMEOUT_MS = 20_000;

async function call(url: string, access: string, init: RequestInit = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${access}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new GoogleError((e as { name?: string })?.name === "TimeoutError" ? "timeout" : "unreachable");
  }
  const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
  if (!r.ok) {
    const err = typeof j?.error === "string" ? j.error : typeof (j?.error as { status?: unknown })?.status === "string" ? String((j!.error as { status: string }).status) : "";
    throw new GoogleError(/^[A-Za-z_]{2,40}$/.test(err) ? err : `http_${r.status}`, r.status);
  }
  return j;
}

export async function gmailSend(access: string, raw: string, threadId?: string | null): Promise<{ id: string; threadId: string | null }> {
  const j = (await call(`${bases().gmail}/gmail/v1/users/me/messages/send`, access, { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) })) as { id?: unknown; threadId?: unknown };
  const id = typeof j?.id === "string" && /^[\w-]{1,64}$/.test(j.id) ? j.id : null;
  if (!id) throw new GoogleError("no_id");
  return { id, threadId: typeof j.threadId === "string" && /^[\w-]{1,64}$/.test(j.threadId) ? j.threadId : null };
}

/** The Message-ID Gmail kept on a message (headers only). Null when it isn't there. */
export async function gmailMessageId(access: string, id: string): Promise<string | null> {
  const j = (await call(`${bases().gmail}/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID&fields=payload/headers`, access)) as {
    payload?: { headers?: { name?: string; value?: string }[] };
  };
  const h = (j?.payload?.headers ?? []).find((x) => String(x.name ?? "").toLowerCase() === "message-id");
  const v = String(h?.value ?? "").trim();
  return /^<[^<>\s]{3,250}>$/.test(v) ? v : null;
}

const addressIn = (v: string) => (/<([^<>\s]+@[^<>\s]+)>/.exec(v)?.[1] ?? v).trim().toLowerCase();

/**
 * Whether anyone other than the member wrote in the thread after `afterMs`: the From header and the
 * time of each message, nothing else.
 */
export async function gmailReplied(access: string, threadId: string, afterMs: number, mine: Set<string>): Promise<boolean> {
  const j = (await call(`${bases().gmail}/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&fields=messages(internalDate,labelIds,payload/headers)`, access)) as {
    messages?: { internalDate?: string; labelIds?: string[]; payload?: { headers?: { name?: string; value?: string }[] } }[];
  };
  for (const m of j?.messages ?? []) {
    if (!(Number(m.internalDate) > afterMs)) continue;
    if ((m.labelIds ?? []).includes("DRAFT")) continue;
    const from = (m.payload?.headers ?? []).find((h) => String(h.name ?? "").toLowerCase() === "from");
    const who = addressIn(String(from?.value ?? ""));
    if (who && !mine.has(who)) return true;
  }
  return false;
}
