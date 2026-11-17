/**
 * Alerts in Slack and other tools: connecting a webhook, the member's switches, and sending.
 *
 * Kept in State.integrations (lib/notify/types.ts) through the same write queue as every action.
 * The webhook URL never leaves the server: views carry a masked form, the admin export drops it.
 *
 * Batching: at most one post of each kind per member every 15 minutes. The first event goes out
 * at once. Events inside the window wait (in the state, so a restart keeps them) and go out
 * together, with a count, when the window opens again. A weekly scan is one event.
 */
import { publicBase } from "../links";
import { ActionError, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type State } from "../table";
import { functionOf } from "../tableFields";
import { alertFor, bodyFor, testAlert, type Alert } from "./format";
import { integrationsAllowed } from "./plan";
import { exchangeCode, slackAppConfigured, takeState, type SlackHook } from "./slackApp";
import { checkSlackUrl, checkWebhookUrl, maskUrl, postJson, problemWords, UrlProblem, type PostResult } from "./url";
import {
  ALERT_KINDS, BATCH_WINDOW_MS, DEFAULT_ALERTS, emptyIntegrations, type AlertItem, type AlertKind, type DestView, type IntegrationsState, type IntegrationsView,
  type MemberIntegrations, type StoredDest,
} from "./types";

export type Field = "slack" | "webhook";
const SIGNED_OUT = "You're signed out. Sign in again to set up alerts.";
const NOT_ON_PLAN = "Alerts in Slack aren't part of your plan.";
/** A destination that failed this many times in a row stops getting alerts until it's connected again. */
const MAX_FAILURES = 5;

const integ = (s: State): IntegrationsState => {
  s.integrations ??= emptyIntegrations();
  s.integrations.members ??= {};
  s.integrations.stats ??= { sent: {}, failed: 0, connects: 0, removes: 0 };
  s.integrations.stats.sent ??= {};
  return s.integrations;
};
const blank = (): MemberIntegrations => ({ alerts: { ...DEFAULT_ALERTS }, lastSent: {}, pending: {} });

/** The app's address for links: RN_PUBLIC_URL, else the one last seen by the API. */
export const baseOf = (s: State | { integrations?: IntegrationsState }) =>
  (publicBase() || s.integrations?.origin || "").replace(/\/+$/, "");

/** The member's function, as the weekly email works it out. */
export const functionFor = (s: State, m: Member): string | null => {
  const prof = s.profiles[m.id] ?? {};
  return prof.function ?? functionOf(prof.title || m.title);
};

function destView(d: StoredDest | undefined): DestView | null {
  if (!d) return null;
  return {
    kind: d.kind,
    masked: maskUrl(d.url),
    addedAt: d.addedAt,
    lastOkAt: d.lastOkAt ?? null,
    problem: d.failures ? problemWords(d.lastError, d.kind) : null,
    broken: !!d.broken,
    channel: d.channel ?? null,
    team: d.team ?? null,
    viaApp: !!d.viaApp,
  };
}

function viewOf(s: State, m: Member): IntegrationsView {
  const mine = s.integrations?.members[m.id];
  return {
    allowed: integrationsAllowed(m.id),
    slackApp: slackAppConfigured(),
    function: functionFor(s, m),
    savedViews: (s.connector?.alerts?.[m.id] ?? []).length,
    slack: destView(mine?.slack),
    webhook: destView(mine?.webhook),
    alerts: { ...DEFAULT_ALERTS, ...(mine?.alerts ?? {}) },
  };
}

async function me(token: string | null): Promise<{ m: Member; s: State }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) throw new ActionError(SIGNED_OUT);
  return { m, s };
}

/** GET: what the Integrations page shows. Null when signed out. */
export async function integrationsView(token: string | null): Promise<IntegrationsView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? viewOf(s, m) : null;
}

/** Keep the app's address for links in alerts (when RN_PUBLIC_URL isn't set). Written only when it changes. */
export async function rememberOrigin(origin: string | undefined | null): Promise<void> {
  if (!origin || !/^https?:\/\/[^\s/]+$/i.test(origin) || process.env.RN_PUBLIC_URL) return;
  const s = await loadState();
  if (s.integrations?.origin === origin) return;
  await T.mutate((d) => {
    integ(d).origin = origin;
  });
}

/* ---------- connect, test, switches, remove ---------- */

const record = (d: StoredDest, r: PostResult, now: string) => {
  if (r.ok) {
    d.lastOkAt = now;
    d.failures = 0;
    delete d.lastError;
    delete d.lastErrorAt;
    delete d.broken;
    return;
  }
  d.failures = (d.failures ?? 0) + 1;
  d.lastError = r.error;
  d.lastErrorAt = now;
  if (r.gone || d.failures >= MAX_FAILURES) d.broken = true;
};

/** Words for a URL the service refused when it was pasted. */
export function refusedWords(field: Field, r: PostResult): string {
  // A network failure is not the URL's fault: say so, and don't send them back to copy it.
  if (r.error === "timeout" || r.error === "unreachable")
    return field === "slack"
      ? "We couldn't reach Slack right now, so nothing was saved. Try again in a minute."
      : "We couldn't reach that address right now, so nothing was saved. Check the URL, or try again in a minute.";
  if (field === "slack" && r.gone) return "Slack says this webhook doesn't exist, so nothing was saved. Copy the webhook URL again from Incoming Webhooks.";
  const why = problemWords(r.error, field === "slack" ? "slack" : "webhook");
  return field === "slack"
    ? `Slack didn't take the test message, so nothing was saved. ${why ?? ""}`.replace(/\s+/g, " ").trim()
    : `That webhook didn't take the test message, so nothing was saved. ${why ?? ""}`.replace(/\s+/g, " ").trim();
}

/**
 * Save a webhook URL for the member, once a test message to it went through. Replaces the one
 * in that field. All three alerts are on after a first connect.
 */
export async function connect(token: string | null, field: Field, raw: unknown): Promise<{ message: string; view: IntegrationsView }> {
  const { m, s } = await me(token);
  if (!integrationsAllowed(m.id)) throw new ActionError(NOT_ON_PLAN);
  let dest: { url: string; kind: StoredDest["kind"] };
  try {
    dest = field === "slack" ? checkSlackUrl(raw) : await checkWebhookUrl(raw);
  } catch (e) {
    if (e instanceof UrlProblem) throw new ActionError(e.message);
    throw e;
  }
  const view = await saveTested(token, field, dest, testAlert(baseOf(s)));
  const where = field === "slack" ? (dest.kind === "workflow" ? "your Slack workflow" : "Slack") : "your webhook";
  return { message: `Connected. We sent a test message to ${where}.`, view };
}

/** Post the test message to a checked URL and, once it went through, save it in the field. */
async function saveTested(
  token: string | null,
  field: Field,
  dest: { url: string; kind: StoredDest["kind"] },
  test: Alert,
  extra: Pick<StoredDest, "channel" | "team" | "viaApp"> = {},
): Promise<IntegrationsView> {
  const now = new Date().toISOString();
  const r = await post(dest.kind, dest.url, test, now);
  if (!r.ok) throw new ActionError(refusedWords(field, r));
  return T.mutate((d, seed) => {
    const who = memberByToken(seed, token, d);
    if (!who) throw new ActionError(SIGNED_OUT);
    const st = integ(d);
    const mine = (st.members[who.id] ??= blank());
    mine[field] = { kind: dest.kind, url: dest.url, addedAt: now, lastOkAt: now, failures: 0, ...extra };
    st.stats.connects++;
    st.stats.sent.test = (st.stats.sent.test ?? 0) + 1;
    return viewOf(d, who);
  });
}

export type SlackAppOutcome = "connected" | "denied" | "failed";

/**
 * GET /api/integrations/slack/callback, after the member answered Slack's "Add to Slack" page.
 * The state must check out (lib/notify/slackApp.ts takeState) before anything else happens. The
 * webhook Slack hands back goes through the same check and test message as a pasted one.
 * Nothing secret is logged or returned: only one of three words.
 */
export async function finishSlackApp(
  token: string | null,
  q: { state: string | null; code: string | null; error: string | null },
  cookieState: string | null,
  origin: string,
): Promise<SlackAppOutcome> {
  if (!slackAppConfigured()) return "failed";
  const who = await takeState(q.state, cookieState, token);
  if (!who) return "failed";
  if (q.error) return q.error === "access_denied" ? "denied" : "failed";
  if (!integrationsAllowed(who.memberId)) return "failed";
  const hook: SlackHook | null = await exchangeCode(String(q.code ?? ""), origin);
  if (!hook) return "failed";
  let dest: { url: string; kind: StoredDest["kind"] };
  try {
    dest = checkSlackUrl(hook.url);
  } catch {
    console.error("Add to Slack: Slack's webhook wasn't a hooks.slack.com URL");
    return "failed";
  }
  if (dest.kind !== "slack") return "failed";
  const s = await loadState();
  const test: Alert = { ...testAlert(baseOf(s)), headline: hook.channel ? `Merlin is connected to ${hook.channel}` : "Merlin is connected" };
  try {
    await saveTested(token, "slack", dest, test, { channel: hook.channel ?? undefined, team: hook.team ?? undefined, viaApp: true });
  } catch (e) {
    if (e instanceof ActionError) return "failed";
    throw e;
  }
  return "connected";
}

/** "Send a test": a short message to the URL on file. */
export async function sendTest(token: string | null, field: Field): Promise<{ message: string; view: IntegrationsView }> {
  const { m, s } = await me(token);
  if (!integrationsAllowed(m.id)) throw new ActionError(NOT_ON_PLAN);
  const d0 = s.integrations?.members[m.id]?.[field];
  if (!d0) throw new ActionError(field === "slack" ? "Connect Slack first." : "Connect a webhook first.");
  const now = new Date().toISOString();
  const r = await post(d0.kind, d0.url, testAlert(baseOf(s)), now);
  const view = await T.mutate((d) => {
    const st = integ(d);
    const cur = st.members[m.id]?.[field];
    if (cur && cur.url === d0.url) record(cur, r, now);
    if (r.ok) st.stats.sent.test = (st.stats.sent.test ?? 0) + 1;
    else st.stats.failed++;
    return viewOf(d, m);
  });
  if (!r.ok) throw new ActionError(`The test didn't go through. ${problemWords(r.error, d0.kind) ?? ""}`.trim());
  return { message: field === "slack" ? "Sent. Check Slack for the test message." : "Sent. Check your tool for the test message.", view };
}

/** Turn alerts on or off. Unknown keys are ignored. */
export async function setAlerts(token: string | null, patch: Partial<Record<AlertKind, unknown>>): Promise<{ message: string; view: IntegrationsView }> {
  const { m } = await me(token);
  const view = await T.mutate((d) => {
    const mine = (integ(d).members[m.id] ??= blank());
    for (const k of ALERT_KINDS) {
      if (typeof patch[k] !== "boolean") continue;
      mine.alerts[k] = patch[k] as boolean;
      if (!patch[k]) delete mine.pending[k];
    }
    return viewOf(d, m);
  });
  return { message: "Saved.", view };
}

/** Remove a URL. With nothing left connected, waiting alerts are dropped too. */
export async function removeDest(token: string | null, field: Field): Promise<{ message: string; view: IntegrationsView }> {
  const { m } = await me(token);
  let viaApp = false;
  const view = await T.mutate((d) => {
    const st = integ(d);
    const mine = st.members[m.id];
    viaApp = !!mine?.[field]?.viaApp;
    if (mine?.[field]) {
      delete mine[field];
      st.stats.removes++;
      if (!mine.slack && !mine.webhook) mine.pending = {};
    }
    return viewOf(d, m);
  });
  const words =
    field !== "slack"
      ? "Removed. That webhook won't get any more alerts."
      : viaApp
        ? "Removed. Slack won't get any more alerts. You can also remove Merlin Alerts from your Slack's apps."
        : "Removed. Slack won't get any more alerts.";
  return { message: words, view };
}

/* ---------- sending ---------- */

/** Sends in flight, so tests (and a clean shutdown) can wait for them. */
const inflight = new Set<Promise<unknown>>();
export const track = <P extends Promise<unknown>>(p: P): P => {
  inflight.add(p);
  void p.finally(() => inflight.delete(p)).catch(() => {});
  return p;
};
/** Resolves once every send started so far is done (tests). */
export async function settled(): Promise<void> {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

const post = (kind: StoredDest["kind"], url: string, a: Alert, now: string) => postJson(url, kind, bodyFor(kind, a, now));

const live = (mine: MemberIntegrations | undefined) => [mine?.slack, mine?.webhook].filter((x): x is StoredDest => !!x && !x.broken);

/** Post one alert of `kind` to every working destination of the member, and record how it went. */
async function sendNow(memberId: string, kind: AlertKind, items: AlertItem[]): Promise<void> {
  const s = await loadState();
  const mine = s.integrations?.members[memberId];
  const a = alertFor(items, baseOf(s));
  const dests = live(mine);
  if (!a || !dests.length) return;
  const now = new Date().toISOString();
  const results = await Promise.all(dests.map(async (d) => ({ url: d.url, r: await post(d.kind, d.url, a, now) })));
  await T.mutate((d) => {
    const st = integ(d);
    const cur = st.members[memberId];
    for (const { url, r } of results) {
      const dest = [cur?.slack, cur?.webhook].find((x) => x?.url === url);
      if (dest) record(dest, r, now);
      if (r.ok) st.stats.sent[kind] = (st.stats.sent[kind] ?? 0) + 1;
      else st.stats.failed++;
    }
  });
  for (const { r } of results) if (!r.ok) console.error(`alert not delivered (${kind}): ${r.error}`);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let timerAt = Infinity;
function wakeAt(ms: number) {
  if (ms >= timerAt && timer) return;
  if (timer) clearTimeout(timer);
  timerAt = ms;
  timer = setTimeout(() => {
    timer = null;
    timerAt = Infinity;
    void flushDue().catch((e) => console.error("alert batch failed", e));
  }, Math.max(1000, ms - Date.now()));
  timer.unref?.();
}

/**
 * An event for one member. Goes out now if no post of its kind went out in the last 15
 * minutes, else waits and goes out with the rest when the window opens. Dropped when the member
 * has nothing connected, turned this alert off, or isn't allowed integrations.
 */
export function deliver(memberId: string, item: AlertItem): Promise<void> {
  return track(
    (async () => {
      if (!integrationsAllowed(memberId)) return;
      const s0 = await loadState();
      const m0 = s0.integrations?.members[memberId];
      if (!live(m0).length || m0?.alerts[item.kind] === false) return;
      const nowMs = Date.now();
      const due = await T.mutate((d): { send: AlertItem[] } | { wait: number } | null => {
        const mine = integ(d).members[memberId];
        if (!mine || !live(mine).length || mine.alerts[item.kind] === false) return null;
        const last = Date.parse(mine.lastSent[item.kind] ?? "");
        const waiting = mine.pending[item.kind];
        if (waiting?.length || (Number.isFinite(last) && nowMs - last < BATCH_WINDOW_MS)) {
          mine.pending[item.kind] = [...(waiting ?? []), item].slice(-50);
          return { wait: (Number.isFinite(last) ? last : nowMs) + BATCH_WINDOW_MS };
        }
        mine.lastSent[item.kind] = new Date(nowMs).toISOString();
        return { send: [item] };
      });
      if (!due) return;
      if ("wait" in due) return wakeAt(due.wait);
      await sendNow(memberId, item.kind, due.send);
    })(),
  );
}

/** Send every batch whose window has opened. Runs on a timer, and once after a restart. */
export function flushDue(): Promise<number> {
  return track(
    (async () => {
      const nowMs = Date.now();
      const s0 = await loadState();
      const any = Object.values(s0.integrations?.members ?? {}).some((m) => Object.values(m.pending ?? {}).some((x) => x?.length));
      if (!any) return 0;
      let next = Infinity;
      const ready = await T.mutate((d) => {
        const out: { memberId: string; kind: AlertKind; items: AlertItem[] }[] = [];
        for (const [memberId, mine] of Object.entries(integ(d).members)) {
          for (const kind of ALERT_KINDS) {
            const items = mine.pending?.[kind];
            if (!items?.length) continue;
            const last = Date.parse(mine.lastSent[kind] ?? "");
            const opens = Number.isFinite(last) ? last + BATCH_WINDOW_MS : 0;
            if (opens > nowMs) {
              next = Math.min(next, opens);
              continue;
            }
            delete mine.pending[kind];
            if (!live(mine).length || mine.alerts[kind] === false || !integrationsAllowed(memberId)) continue;
            mine.lastSent[kind] = new Date(nowMs).toISOString();
            out.push({ memberId, kind, items });
          }
        }
        return out;
      });
      if (Number.isFinite(next)) wakeAt(next);
      await Promise.all(ready.map((x) => sendNow(x.memberId, x.kind, x.items)));
      return ready.length;
    })(),
  );
}

// After a restart, batches that were waiting go out once their window opens.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  const t = setTimeout(() => void flushDue().catch(() => {}), 5000);
  t.unref?.();
}
