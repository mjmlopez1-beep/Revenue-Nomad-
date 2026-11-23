import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { brotliCompress, constants as zc, gzip } from "zlib";
import {
  ABOUT_MAX, ActionError, aboutCells, billingVisit, companyNotesFor, buildView, exportState, inviterName, isAdmin, joinMember, memberByEmail, memberForToken, partnersView, perform, searchMembers, touch, viewPatch, viewVersion, type Action,
} from "@/lib/table";
import { stateVersion } from "@/lib/table";
import type { ActionResult } from "@/lib/tableTypes";
import { emailEnabled, sendEmail } from "@/lib/email";
import { clientIp, limited } from "@/lib/rateLimit";
import { guarded } from "@/lib/apiGuard";
import { shared } from "@/lib/viewQueue";
import { packedViewJson } from "@/lib/viewWire";
import { todayView } from "@/lib/today";
import { movesFor } from "@/lib/movesView";
import { firstPage } from "@/lib/firstPage";
import { isHome } from "@/app/post/place";
import { inSlot } from "@/lib/viewQueue";
import type { View } from "@/lib/tableTypes";
import { workflowsOn } from "@/lib/workflows/run";
import { networkOn } from "@/lib/google/types";
import { googleConfigured } from "@/lib/google/config";
import { tidy, wellFormed } from "@/lib/tableFields";
import { createSignIn, isOneTimeToken, oneTimeEmail, redeemCode, redeemLink, rotateToken } from "@/lib/signin";
import { listConversations, unreadFor } from "@/lib/messages";
import { PreviewError, preview } from "@/lib/preview";
import { radarView, returnQuery } from "@/lib/radar";
import { yourFeature } from "@/lib/radar/types";
import { runDueJobs } from "@/lib/jobs";
import { fractionalsHome, fractionalsView } from "@/lib/fractionals";
import { pipelineViewFor } from "@/lib/pipelineActions";
import { peerPicks, peersHome, peersView } from "@/lib/peers";
import { quoteUnlock } from "@/lib/unlockQuote";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
/** "See it as a member": an admin's view built as a member's (buildView's asMember). Does nothing for anyone else. */
const AS_MEMBER_COOKIE = "rn_as_member";
const gz = promisify(gzip);
const br = promisify(brotliCompress);
/** The largest request body a POST may carry. The biggest real one (Add with ten people) is a few KB. */
const MAX_BODY = 64 * 1024;

function withSession(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Follow the real protocol (proxies set x-forwarded-proto) so http:// localhost still works.
    secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
/** Lookups by exact name in a minute, per member (GET ?find= and the action "find" together). */
const FIND_PER_MINUTE = 30;
/** Past a per-minute limit. The limits are high enough that a person only meets this by accident. */
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";
/** An action with no member behind it. The same words perform() uses. */
const SIGNED_OUT = "You're signed out. Sign in again to add, confirm or unlock.";
const SIGNED_OUT_READ = "You're signed out. Sign in again to see your messages.";
const SIGNED_OUT_ALERTS = "You're signed out. Sign in again to see your alerts.";
/** The same answer whether or not the email belongs to a member, so nobody can test which emails are members. */
const LINK_ON_ITS_WAY = "If that email is on Merlin, a link is on its way.";
const LINK_USED = "That sign-in link has expired or was already used. A link works once, for 20 minutes. Ask for a new one in Sign in.";
const CODE_FAILED = "That code didn't work. A code works once, for 20 minutes, and stops after 5 wrong tries. Ask for a new email if you need one.";
/** The key an email is counted under for the per-address limits (case and spaces don't make a new one). */
const mailKey = (raw: unknown) => String(raw ?? "").trim().toLowerCase().slice(0, 120);

/**
 * Email a one-time link and code to a member, in the background: the answer doesn't wait for
 * it, so it takes as long for an address that is nobody's. `back`: returnQuery, so the link opens
 * where the visitor asked from.
 */
function sendOneTime(req: NextRequest, m: { id: string; name: string; email: string }, purpose: "signin" | "join", back = "") {
  void (async () => {
    const { token, code } = await createSignIn(m.id, purpose);
    const e = oneTimeEmail(m.name, `${origin(req)}/?k=${encodeURIComponent(token)}${back}`, code, purpose);
    await sendEmail(m.email, e.subject, e.text, e.html);
  })().catch((e) => console.error("sign-in email failed", e));
}

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store", vary: "Accept-Encoding" };

/** How an answer is compressed. Brotli when the client takes it (every current browser does over https), else gzip. */
type Enc = "br" | "gzip";
/** The encoding to answer in, from Accept-Encoding (a coding with q=0 is refused). Null: send it as it is. */
function encodingFor(req: NextRequest): Enc | null {
  const ok = new Set<string>();
  for (const part of (req.headers.get("accept-encoding") ?? "").toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (name && !(q && Number(q.slice(2)) === 0)) ok.add(name.trim());
  }
  return ok.has("br") ? "br" : ok.has("gzip") ? "gzip" : null;
}
/** Smaller than this is sent as it is: compressing saves nothing worth the time. */
const MIN_COMPRESS = 2048;
/**
 * Brotli quality 5: the member's table (about 1 MB of JSON) comes to about a fifth less than gzip
 * level 6 in about the same time. Higher qualities save a few more KB for several times the CPU.
 */
const compress = async (body: string, enc: Enc): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    enc === "br"
      ? await br(body, {
          params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_MODE]: zc.BROTLI_MODE_TEXT, [zc.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(body) },
        })
      : await gz(body, { level: 6 }),
  );

/** JSON, compressed when the client accepts it (Next doesn't compress route handlers). */
async function sendJson(req: NextRequest, data: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  const headers: Record<string, string> = { ...JSON_HEADERS, ...extra };
  const enc = encodingFor(req);
  if (enc && body.length > MIN_COMPRESS) return new NextResponse(await compress(body, enc), { headers: { ...headers, "content-encoding": enc } });
  return new NextResponse(body, { headers });
}

/**
 * The table view, built, turned into JSON and compressed inside the view queue (lib/viewQueue.ts):
 * at most 4 at once, the rest wait, and past 50 waiting the answer is 503 with Retry-After. One
 * member's requests share one build while the state has not changed under it, so a tab that
 * fires a burst of loads costs one. It is compressed in the encoding the first request asked for;
 * a request that joins it asking for another encoding compresses its own copy once.
 */
type Built = { body: string; packed: Map<Enc, Promise<Uint8Array<ArrayBuffer>>>; version: string };
const viewFlights = new Map<string, { p: Promise<Built>; started: number | null }>();
const viewKey = (token: string | null, asMember = false, packed = false) => `${token ?? ""}${asMember ? "|member" : ""}${packed ? "|packed" : ""}`;
/**
 * The member's whole view that GET ?first=1 just built for its first page: the page asks for the
 * full view right after it, so that answer starts from this one instead of building it again,
 * while the state is the one it was built on and for FIRST_KEEP_MS at most.
 */
const FIRST_KEEP_MS = 30_000;
const firstBuilt = new Map<string, { view: View; version: number; at: number }>();
function keepFirst(key: string, view: View) {
  firstBuilt.delete(key);
  firstBuilt.set(key, { view, version: stateVersion(), at: Date.now() });
  while (firstBuilt.size > VIEW_KEEP_MAX) firstBuilt.delete(firstBuilt.keys().next().value!);
}
function takeFirst(key: string): View | null {
  const k = firstBuilt.get(key);
  firstBuilt.delete(key);
  return k && k.version === stateVersion() && Date.now() - k.at < FIRST_KEEP_MS && utcDayOf(k.at) === utcDayOf(Date.now()) ? k.view : null;
}
const utcDayOf = (ms: number) => Math.floor(ms / 86_400_000);
const builtView = (token: string | null, enc: Enc | null, asMember = false, packed = false) =>
  shared(viewFlights, viewKey(token, asMember, packed), stateVersion, async (): Promise<Built> => {
    const view = takeFirst(viewKey(token, asMember)) ?? (await buildView(token, { asMember }));
    // Packed: each company's JSON is kept with its record, and most records are shared between members (packedViewJson).
    const body = packed ? packedViewJson(view) : JSON.stringify(view);
    const built: Built = { body, packed: new Map(), version: view.version ?? "" };
    if (enc && body.length > MIN_COMPRESS) {
      const p = compress(body, enc);
      built.packed.set(enc, p);
      await p;
    }
    return built;
  });

/**
 * A member's table as sent last, compressed, kept while the state is the one it was built from
 * (any change by anyone makes a new one) and for VIEW_KEEP_MS at most, and never past the end of
 * the UTC day it was built on, since a few of its numbers move with the clock (the unlocks left in
 * the last 24 hours, the free company of the day, the trial's days). A tab that loads twice, or two
 * tabs, cost one build. Only the compressed bytes are kept (about a third of a megabyte each), for
 * the VIEW_KEEP_MAX members who loaded last.
 */
const VIEW_KEEP_MS = 5 * 60_000;
const VIEW_KEEP_MAX = 64;
const keptViews = new Map<string, { version: string; at: number; enc: Enc; bytes: Uint8Array<ArrayBuffer> }>();
function keepView(key: string, version: string, enc: Enc, bytes: Uint8Array<ArrayBuffer>) {
  keptViews.delete(key);
  keptViews.set(key, { version, at: Date.now(), enc, bytes });
  while (keptViews.size > VIEW_KEEP_MAX) keptViews.delete(keptViews.keys().next().value!);
}
function keptView(key: string, enc: Enc | null): NextResponse | null {
  const k = keptViews.get(key);
  const now = Date.now();
  if (!k || !enc || k.enc !== enc || k.version !== viewVersion() || now - k.at > VIEW_KEEP_MS || Math.floor(now / 86_400_000) !== Math.floor(k.at / 86_400_000)) return null;
  return new NextResponse(k.bytes, { headers: { ...JSON_HEADERS, "content-encoding": enc, "x-view-version": k.version } });
}

/** The view as an answer, in the encoding this request asked for. */
async function viewAnswer(view: Built, enc: Enc | null, key?: string): Promise<NextResponse> {
  const headers = { ...JSON_HEADERS, "x-view-version": view.version };
  if (!enc || view.body.length <= MIN_COMPRESS) return new NextResponse(view.body, { headers });
  let p = view.packed.get(enc);
  if (!p) view.packed.set(enc, (p = compress(view.body, enc)));
  const bytes = await p;
  if (key) keepView(key, view.version, enc, bytes);
  return new NextResponse(bytes, { headers: { ...headers, "content-encoding": enc } });
}

/**
 * What an action's answer carries besides its message, so the page can update without the whole
 * table: the records it touched (viewPatch in lib/table.ts). These actions change nothing a page
 * shows, or answer with what they changed themselves (messages), or change too much (an admin
 * removing everything a member added: the page loads the table again).
 */
const NO_PATCH = new Set(["scanNow", "aboutNow", "leadersNow", "adminRemoveMember", "lockedView", "promoCode", "companyNote"]);
/** Actions that can move the rate benchmarks. */
const BENCH_ACTIONS = new Set(["benchRate", "benchRateRemove", "fill", "retract", "review", "adminRemove", "report"]);
/** The public ids of the records an action touched: what it named, what it made, and the cells it changed. */
function touchedIds(a: Action, out: ActionResult): string[] {
  const ids: string[] = [];
  const x = a as unknown as Record<string, unknown>;
  // A saved view's id, a rate's id or a conversation's id names no record.
  if (["fill", "unlock", "report", "verify", "review", "adminRemove", "retract"].includes(a.type) && typeof x.id === "string") ids.push(x.id);
  for (const k of ["companyId", "engagementId"]) if (typeof x[k] === "string" && a.type !== "benchRate") ids.push(x[k] as string);
  if (a.type === "unlockMany" && Array.isArray(a.items)) for (const it of a.items.slice(0, 60)) if (typeof it?.id === "string") ids.push(it.id);
  if ((a.type === "add" || a.type === "addPerson") && typeof out.id === "string") ids.push(out.id);
  if (a.type === "find") for (const id of out.ids ?? []) if (typeof id === "string") ids.push(id);
  for (const c of out.cells ?? []) if (typeof c?.id === "string") ids.push(c.id);
  return ids;
}
const patchless = (a: Action) =>
  !a || typeof a.type !== "string" || a.type.startsWith("message.") || a.type.startsWith("pipeline.") || a.type.startsWith("peer.") || a.type.startsWith("inbox.") || a.type.startsWith("alerts.") || (a.type.startsWith("workflow.") && (a.type as string) !== "workflow.approve") || NO_PATCH.has(a.type) || (a.type === "claimSeat" && !!a.preview) || (a.type === "signal" && a.name !== "pro_interest");

/**
 * GET              the table as the signed-in member sees it (signed out: counts only).
 * GET ?people=Q    { members }: up to 8 members whose name matches (signed in only), for the seat-holder picker.
 * GET ?known=1    Someone you know changed jobs for Home and Warm paths (lib/notify/knownView.ts KnownView): the last
 *                  30 days' moves from the member's own LinkedIn file, contacts CSV and Google. 401 signed out.
 * GET ?inbox=1    the bell (lib/inbox.ts InboxView): the member's inbox, newest first, and how many are unread. 401 signed out.
 *                  POST { action: { type: "inbox.read", ids? } } marks lines read.
 * GET ?alerts=1&since=ISO   the Alerts page (lib/inbox.ts AlertsView): the fixed alerts' switches, alerts sent since then,
 *                  each alert's last time. 401 signed out.
 * GET ?workflows=1   the Workflows tab (lib/workflows WorkflowsAnswer): the member's workflows, runs, prices and plan, or
 *                  { on: false } while RN_WORKFLOWS is off. ?workflows=drafts: the notes workflows drafted (drafts only). 401 signed out.
 * GET ?ref=CODE    { inviter }: the first name of the member who sent this invite code, or null.
 * GET ?preview=1&fn=F&ind=I&country=C&view=all|hiring|notyet   the landing page's "Try it" and example record: counts, sample rows with their companies, never
 *                  a person, email, phone, posting link or rate (lib/preview.ts). 400 on a value not on its list.
 * GET ?messages=1  { conversations, unread }: the viewer's conversations (lib/messages.ts). 401 signed out.
 * GET ?unread=1    { unread }: conversations with something unread, for the badge.
 * GET ?peers=1     PeersView: the Peers page (lib/peers.ts). ?peers=home: PeersHome, Home's From your peers. ?peers=picks&c=ID[&role=ID][&for=team]:
 *                  PeerPicks, who to pass a company to or team up with. 401 signed out.
 * GET ?notes=ID   { notes }: the member's own private notes on that company, newest first (lib/companyNotes.ts). 404 for an id
 *                  that names no company, 401 signed out.
 * GET ?pipeline=1  PipelineView: the member's own pipeline, follow-ups due and intros (lib/pipelineActions.ts). 401 signed out.
 * GET ?partners=1  PartnersView: the Referral partners page's server half (lib/table.ts partnersView). 401 signed out.
 * GET ?fractionals=1  FractionalsView: the Fractionals directory, one record per fractional as the member may see it
 *                  (lib/fractionals.ts). ?fractionals=home: FractionalsHome, Home's one line. 401 signed out.
 * GET ?radar=1[&day=YYYY-MM-DD][&range=today|7d|30d|auto]  RadarView: one day's companies from the member's radar (lib/radar radarView), the list its email and
 *                  Slack links open. With &range= (Crystal Ball's page): that range of days, each company once (auto, or any other value: Today
 *                  if it has companies, else Last 7 days, else Last 30 days), or a kept day asked for alone. 401 signed out.
 * GET ?today=1[&since=ISO]  TodayView (lib/viewWire.ts, lib/today.ts): what Today draws before the table, under 20 KB: me,
 *                  plan, the free company, Crystal Ball's top 4, today's moves (lib/movesView.ts: up to three of the day's companies
 *                  with their records and, from the member's own network, who they know there), and "Since Tuesday" counts. 401 signed out.
 * GET ?first=1&place=QUERY[&off=a,b][&since=ISO]  the first screen before the full view (lib/firstPage.ts): for Today's
 *                  address (QUERY names no place) { today: TodayView }, else { view, first }: the member's view with the
 *                  companies of the list's first 50 rows only (and the one ?c= opens), exactly as the full view has them,
 *                  and `first`, the counts the table's first screen shows on the whole table. 401 signed out.
 * GET ?export=1   admins: download the runtime state (a backup).
 * GET ?as=member   admins: the table as a member sees it (so does the cookie rn_as_member=1).
 * GET ?compact=1   the table without its empty cells (lib/viewWire.ts). The page asks for this.
 *                  Anyone else gets their own view, as without it.
 * GET ?find=TEXT   a company by its exact name or website (the action "find", within its daily limits): its record
 *                  named for this answer only (CompanyRec.found), or { found: "none", message }. 401 signed out.
 * GET ?about=ID,ID { about: { [companyId]: Cell } }: up to 50 companies' About cells, which the table carries
 *                  without their text (Cell.lazy). The same locks as the table: a locked company's About without its
 *                  name, web address, links and emails. &found=1 from a record opened by its exact name: the whole
 *                  About while that lookup lasts. 401 signed out.
 *
 * See also POST /api/table/scan (the weekly scan, for a cron), GET /api/table/unsubscribe and
 * GET /api/health. Every handler answers 503 while Merlin cannot serve (lib/apiGuard.ts).
 */
export const GET = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  // The seat-holder picker searches as you type, so it has its own limit (per member): enough
  // to find a few people, too slow to page through everyone.
  const people = req.nextUrl.searchParams.get("people");
  if (people !== null) {
    // Keyed like the action limit: on the member, or on the address when the cookie is nobody's (any value can be made up).
    const who = (await memberForToken(token))?.id;
    if (limited(who ? `people:${who}` : `people:ip:${ip}`, 30, 60_000)) return err(SLOW, 429);
    return NextResponse.json({ members: await searchMembers(token, people) }, { headers: { "cache-control": "no-store" } });
  }
  if (limited(`get:${ip}`, 120, 60_000)) return err(SLOW, 429);
  // A company's About, loaded when its record opens (the table leaves the text out, lib/table.ts aboutCells).
  const aboutIds = req.nextUrl.searchParams.get("about");
  if (aboutIds !== null) {
    const asMember = req.cookies.get(AS_MEMBER_COOKIE)?.value === "1" || req.nextUrl.searchParams.get("as") === "member";
    const ids = [...new Set(aboutIds.split(",").map((x) => x.trim()).filter(Boolean))];
    if (!(await memberForToken(token))) return err("You're signed out. Sign in again to see this company.", 401);
    if (!ids.length || ids.length > ABOUT_MAX) return err(`Ask for 1 to ${ABOUT_MAX} companies at a time.`);
    // found=1: asked by a record opened from a lookup by exact name, which shows the whole About; otherwise a locked company's comes without its name.
    const a = await aboutCells(token, ids, { asMember, found: req.nextUrl.searchParams.get("found") === "1" });
    return a ? sendJson(req, a) : err("You're signed out. Sign in again to see this company.", 401);
  }
  // A company by its exact name or website (the action "find", lib/table.ts): it opens for the member, with its record.
  const find = req.nextUrl.searchParams.get("find");
  if (find !== null) {
    const me = await memberForToken(token);
    if (!me) return err("You're signed out. Sign in again to find a company.", 401);
    if (limited(`find:${me.id}`, FIND_PER_MINUTE, 60_000)) return err(SLOW, 429);
    const asMember = req.cookies.get(AS_MEMBER_COOKIE)?.value === "1" || req.nextUrl.searchParams.get("as") === "member";
    try {
      const action: Action = { type: "find", text: find };
      const since = new Date().toISOString();
      const out = await perform(token, action, origin(req), { asMember });
      // Named in this answer only (CompanyRec.found): the page shows it in the search and its record, never in the tables.
      const patch = out.ids?.length ? await viewPatch(token, out.ids, { asMember, since, found: true }).catch(() => null) : null;
      return sendJson(req, patch ? { ...out, ...patch, me: { ...patch.me, ...out.me } } : { ...out, version: viewVersion() });
    } catch (e) {
      if (e instanceof ActionError) return err(e.message);
      throw e;
    }
  }
  // The bell, v2 (lib/inbox.ts): the member's inbox, newest first, with the unread count. And what the Alerts page reads besides Me.
  if (req.nextUrl.searchParams.get("inbox") !== null) {
    const v = await (await import("@/lib/inbox")).inboxFor(token);
    return v ? NextResponse.json(v, { headers: { "cache-control": "no-store" } }) : err(SIGNED_OUT_ALERTS, 401);
  }
  // Workflows (lib/workflows, Beta): the Workflows tab, or the notes they drafted (Messages). { on: false } while RN_WORKFLOWS is off.
  const wfq = req.nextUrl.searchParams.get("workflows");
  if (wfq !== null) {
    const W = await import("@/lib/workflows");
    const v = wfq === "drafts" ? await W.draftsFor(token) : await W.workflowsFor(token);
    return v ? NextResponse.json(v, { headers: { "cache-control": "no-store" } }) : err("You're signed out. Sign in again to see your workflows.", 401);
  }
  if (req.nextUrl.searchParams.get("known") !== null) {
    const v = await (await import("@/lib/notify/knownView")).knownFor(token);
    return v ? NextResponse.json(v, { headers: { "cache-control": "no-store" } }) : err("You're signed out. Sign in again to see who you know.", 401);
  }
  if (req.nextUrl.searchParams.get("alerts") !== null) {
    const v = await (await import("@/lib/inbox")).alertsFor(token, req.nextUrl.searchParams.get("since"));
    return v ? NextResponse.json(v, { headers: { "cache-control": "no-store" } }) : err(SIGNED_OUT_ALERTS, 401);
  }
  // Messages between members (lib/messages.ts): the viewer's conversations, or only the unread count for the badge.
  if (req.nextUrl.searchParams.get("messages") !== null) {
    const list = await listConversations(token);
    return list ? sendJson(req, list) : err(SIGNED_OUT_READ, 401);
  }
  if (req.nextUrl.searchParams.get("unread") !== null) {
    const unread = await unreadFor(token);
    return unread === null ? err(SIGNED_OUT_READ, 401) : NextResponse.json({ unread }, { headers: { "cache-control": "no-store" } });
  }
  // Referral partners (lib/table.ts partnersView): who gets hired before and after the member, counts of members' answers, and the members listed.
  // The member's radar (lib/radar radarView): one day's companies, the list its email and Slack open; with &range=, the page's ranges.
  if (req.nextUrl.searchParams.get("radar") !== null) {
    const r = await radarView(token, req.nextUrl.searchParams.get("day"), undefined, req.nextUrl.searchParams.get("range"));
    return r ? sendJson(req, r) : err(`You're signed out. Sign in again to see ${yourFeature}.`, 401);
  }
  // Fractionals (lib/fractionals.ts): one record per fractional, with its locks; or Home's line about who joined this week.
  const fr = req.nextUrl.searchParams.get("fractionals");
  if (fr !== null) {
    const f = fr === "home" ? await fractionalsHome(token) : await fractionalsView(token);
    return f ? sendJson(req, f) : err("You're signed out. Sign in again to see Fractionals.", 401);
  }
  // Peers (lib/peers.ts): the Peers page, Home's From your peers, and who to pass a company to or team up with.
  const pr = req.nextUrl.searchParams.get("peers");
  if (pr !== null) {
    const q = req.nextUrl.searchParams;
    const out = pr === "home" ? await peersHome(token) : pr === "picks" ? await peerPicks(token, q.get("c") ?? "", q.get("role"), q.get("for") === "team") : await peersView(token);
    if (out) return sendJson(req, out);
    return (await memberForToken(token)) ? err("That company isn't on Merlin anymore.", 404) : err("You're signed out. Sign in again to see your peers.", 401);
  }
  // Your notes on a company (lib/companyNotes.ts): the member's own, never anyone else's.
  const notesId = req.nextUrl.searchParams.get("notes");
  if (notesId !== null) {
    const n = await companyNotesFor(token, notesId);
    if (n === null) return err("You're signed out. Sign in again to see your notes.", 401);
    return n ? sendJson(req, n) : err("That company isn't on Merlin anymore.", 404);
  }
  // Your pipeline (lib/pipelineActions.ts): the member's own deals, moved by what Merlin sees, with the follow-ups due and their intros.
  if (req.nextUrl.searchParams.get("pipeline") !== null) {
    const p = await pipelineViewFor(token);
    return p ? sendJson(req, p) : err("You're signed out. Sign in again to see your pipeline.", 401);
  }
  if (req.nextUrl.searchParams.get("partners") !== null) {
    const p = await partnersView(token);
    return p ? sendJson(req, p) : err("You're signed out. Sign in again to see your referral partners.", 401);
  }
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref !== null) {
    if (limited(`ref:${ip}`, 30, 60_000)) return err(SLOW, 429);
    return NextResponse.json({ inviter: await inviterName(ref) }, { headers: { "cache-control": "no-store" } });
  }
  // "Try it" on the landing page: counts, sample rows and the example record, never a person, posting or rate (lib/preview.ts).
  if (req.nextUrl.searchParams.get("preview") !== null) {
    if (limited(`preview:${ip}`, 60, 60_000)) return err(SLOW, 429);
    const q = req.nextUrl.searchParams;
    try {
      const a = await preview({ fn: q.get("fn"), industry: q.get("ind"), country: q.get("country"), view: q.get("view") });
      return NextResponse.json(a, { headers: { "cache-control": "public, max-age=120" } });
    } catch (e) {
      if (e instanceof PreviewError) return err(e.message, 400);
      throw e;
    }
  }
  if (req.nextUrl.searchParams.get("export")) {
    if (!isAdmin(await memberForToken(token))) return err("Only admins can download the export.", 403);
    return sendJson(req, await exportState(), {
      "content-disposition": `attachment; filename="merlin-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }
  // Neither holds the page up: the visit is noted (at most once per 6 hours per member), and the
  // background jobs that are due start (lib/jobs.ts runDueJobs: the scan, Crystal Ball, leadership
  // pages, funding filings, About texts, each on its schedule and its env switch). The scheduler's
  // timer (instrumentation.ts) runs the same checks every few minutes; this is the backup.
  if (token) void touch(token, ip).catch((e) => console.error("last seen not saved", e));
  void runDueJobs(origin(req)).catch((e) => console.error("job checks failed", e));
  // Signed out: the counts only, kept for a few minutes (buildView), so the landing page never waits in line behind members' tables.
  if (!token || !(await memberForToken(token))) {
    // Today's answer is a member's alone: signed out it is 401, as documented (the page asks for it only for a member).
    if (req.nextUrl.searchParams.get("today") !== null) return err("You're signed out. Sign in again to see Today.", 401);
    // The first screen: with no sign-in cookie at all, 401 (the page never asks for it then). With a cookie that is nobody's
    // (expired, or from another server), the signed-out view itself, so the landing page draws without a second request
    // (app/ui/shared.tsx fetchFirst, scripts/test-firstvisit.mts).
    if (req.nextUrl.searchParams.get("first") !== null && !token) return err("You're signed out. Sign in again to see your table.", 401);
    const view: View = { ...(await buildView(null)), live: { workflows: workflowsOn(), google: networkOn() && googleConfigured() } };
    return sendJson(req, view, { "x-view-version": view.version ?? "" });
  }
  // Plans (only while billing is live): a trial due to start, or a month's Pro credits, lands before the view is built. Nothing to do costs nothing.
  await billingVisit(token, origin(req)).catch((e) => console.error("plan visit failed", e));
  // The first screen before the full view (lib/firstPage.ts): Today's answer for Today's address, else the list's first page.
  // The list's first page builds the member's whole table, so it waits in the view queue like the view.
  if (req.nextUrl.searchParams.get("first") !== null) {
    const q = req.nextUrl.searchParams;
    const place = q.get("place") ?? "";
    const asMember = req.cookies.get(AS_MEMBER_COOKIE)?.value === "1" || q.get("as") === "member";
    const opts = { off: q.get("off"), since: q.get("since"), asMember, built: (v: View) => keepFirst(viewKey(token, asMember), v) };
    const f = isHome(place) ? await firstPage(token, place, opts) : await inSlot(() => firstPage(token, place, opts));
    return f ? sendJson(req, f, "view" in f ? { "x-view-version": f.view.version ?? "" } : {}) : err("You're signed out. Sign in again to see your table.", 401);
  }
  // Today, before the full view (TodayView in lib/viewWire.ts): not in the view queue, a few milliseconds.
  if (req.nextUrl.searchParams.get("today") !== null) {
    const t = await todayView(token, req.nextUrl.searchParams.get("since"));
    return t ? sendJson(req, t) : err("You're signed out. Sign in again to see Today.", 401);
  }
  const enc = encodingFor(req);
  // An admin's "See it as a member". buildView ignores it for anyone who is not an admin.
  const asMember = req.cookies.get(AS_MEMBER_COOKIE)?.value === "1" || req.nextUrl.searchParams.get("as") === "member";
  // ?compact=1 (the page asks for it): empty cells left out, put back by unpackView (lib/viewWire.ts).
  const packed = req.nextUrl.searchParams.get("compact") === "1";
  const key = viewKey(token, asMember, packed);
  return keptView(key, enc) ?? viewAnswer(await builtView(token, enc, asMember, packed), enc, key);
});

/** The request body as JSON, or null when it is not JSON. "too large" past MAX_BODY, whatever Content-Length says. */
async function readBody(req: NextRequest): Promise<unknown | "too large"> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return "too large";
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      void reader.cancel().catch(() => {});
      return "too large";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/** Every text in what the client sent, with half characters removed (a lone surrogate breaks whoever encodes it later). */
function sound<T>(x: T, depth = 0): T {
  if (typeof x === "string") return wellFormed(x) as T;
  if (!x || typeof x !== "object" || depth > 6) return x;
  if (Array.isArray(x)) return x.map((v) => sound(v, depth + 1)) as T;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sound(v, depth + 1)])) as T;
}

/**
 * POST { signIn: tokenOrLink }        sign in with a personal link or the code at the end of it.
 *                                     A one-time link from a sign-in email (lib/signin.ts) works here once.
 * POST { emailLink: email }           email me a one-time sign-in link and code (email on). Same answer for any address.
 * POST { signInCode: { email, code } } sign in with the 6-digit code from that email.
 * POST { emailMe: true }              signed in: email myself a one-time link (another device).
 * POST { rotateLink: true }           signed in: "Sign out on other devices" (a new personal token, set here).
 * POST { join: { name, email, ref, code } } join (code: a discount code from ?code=, kept for checkout). With email switched on, we email a sign-in link
 *                                     (that's the email check); without it, you're in at once
 *                                     (the answer carries `me`, so onboarding opens before the table),
 *                                     except with an address in RN_ADMIN_EMAILS, which then needs
 *                                     the header x-cron-secret: RN_CRON_SECRET.
 * POST { signOut: true }              sign out.
 * POST { action: {...} }              see Action and ActionResult in lib/tableTypes.ts.
 * POST { action: { type: "unlockMany", items, quote: true } }  { quote: UnlockQuote }: what the bulk unlock would spend
 *                                     (lib/unlockQuote.ts, a dry run of the unlock in batches of 60). Spends nothing.
 *
 * A body over 64 KB is refused (413). An action from someone who is not signed in is answered
 * at once and never queued as a change.
 */
export const POST = guarded(async (req: NextRequest) => {
  const read = await readBody(req);
  if (read === "too large") return err("That's too much to send at once. Shorten it, then try again.", 413);
  const body = sound(read) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!body || typeof body !== "object") return err("That didn't go through. Refresh the page and try again.");
  const ip = clientIp(req);

  if (typeof body.signIn === "string") {
    if (limited(`signin:${ip}`, 30, 10 * 60_000)) return err("That's 30 sign-in tries in 10 minutes, which is the limit. Wait 10 minutes, then try again.", 429);
    const raw = body.signIn.trim();
    // Tokens are base64url, so a link copied with a trailing "." or inside <…> still works.
    const token = raw.match(/[?&]k=([A-Za-z0-9_-]+)/)?.[1] ?? raw.replace(/[^A-Za-z0-9_-]/g, "");
    // A personal link, else a one-time link from a sign-in email (lib/signin.ts), used up here.
    const m = token ? (await memberForToken(token)) ?? (isOneTimeToken(token) ? await redeemLink(token) : null) : null;
    if (!m) return err(isOneTimeToken(token) ? LINK_USED : "That sign-in link or code didn't work. Paste the whole thing, or ask us for a new one.", 401);
    // The network a member signs in from is kept (hashed) for the invite rule: see touch().
    await touch(m.token, ip).catch((e) => console.error("sign-in network not saved", e));
    return withSession(req, NextResponse.json({ ok: true }), m.token);
  }

  // The 6-digit code from a sign-in email, typed with the email it went to.
  if (body.signInCode && typeof body.signInCode === "object") {
    if (!emailEnabled()) return err("Email sign-in isn't on yet. Use the personal link we sent you.");
    const key = mailKey(body.signInCode.email);
    if (limited(`code:${ip}`, 20, 10 * 60_000) || limited(`code:${key}`, 10, 10 * 60_000))
      return err("That's a lot of tries in 10 minutes. Wait 10 minutes, or open the link in the email instead.", 429);
    const code = String(body.signInCode.code ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return err("Type the 6 digits from the email.");
    const m = await redeemCode(key, code);
    if (!m) return err(CODE_FAILED, 401);
    await touch(m.token, ip).catch((e) => console.error("sign-in network not saved", e));
    return withSession(req, NextResponse.json({ ok: true }), m.token);
  }

  if (typeof body.emailLink === "string") {
    if (!emailEnabled()) return err("Email sign-in isn't on yet. Use the personal link we sent you.");
    if (limited(`email:${ip}`, 5, 60 * 60_000)) return err("That's 5 requests in an hour, which is the limit. Check your inbox, or try again in an hour.", 429);
    // Counted for every address, member or not, so the limit says nothing about who is a member.
    if (limited(`email:${mailKey(body.emailLink)}`, 3, 20 * 60_000))
      return err("We've sent 3 links to that email in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    const m = await memberByEmail(body.emailLink);
    // A one-time link and code (lib/signin.ts), in the background. Same answer either way.
    if (m?.email) sendOneTime(req, m, "signin", returnQuery(body.to));
    return NextResponse.json({ ok: true, sent: true, message: LINK_ON_ITS_WAY });
  }

  // Signed in: email myself a one-time link (to open Merlin on another device).
  if (body.emailMe === true) {
    const me = await memberForToken(req.cookies.get(COOKIE)?.value ?? null);
    if (!me) return err(SIGNED_OUT, 401);
    if (!emailEnabled() || !me.email) return err("Email sign-in isn't on yet. Copy your personal link instead.");
    if (limited(`email:${mailKey(me.email)}`, 3, 20 * 60_000)) return err("We've sent 3 links in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    sendOneTime(req, me, "signin");
    return NextResponse.json({ ok: true, sent: true, message: "Sent. Check your email for a link that works once, for 20 minutes." });
  }

  // "Sign out on other devices": a new personal token. This device stays signed in with it.
  if (body.rotateLink === true) {
    if (limited(`rotate:${ip}`, 10, 60 * 60_000)) return err("That's 10 in an hour, which is the limit. Try again in an hour.", 429);
    const fresh = await rotateToken(req.cookies.get(COOKIE)?.value ?? null);
    if (!fresh) return err(SIGNED_OUT, 401);
    return withSession(req, NextResponse.json({ ok: true, token: fresh, message: "Signed out everywhere else. Your old sign-in link stopped working, so copy the new one." }), fresh);
  }

  if (body.join && typeof body.join === "object") {
    if (limited(`join:${ip}`, 10, 60 * 60_000)) return err("That's 10 sign-ups from this network in an hour, which is the limit. Try again in an hour.", 429);
    // The name is cut to its 80 characters here, on a whole character (joinMember cuts by unit).
    body.join.name = tidy(body.join.name, 80);
    // The per-address limit of the sign-in emails, counted for every address (member or not).
    if (emailEnabled() && limited(`email:${mailKey(body.join.email)}`, 3, 20 * 60_000))
      return err("We've sent 3 links to that email in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    try {
      // x-cron-secret: only so whoever runs the server can create the first admin while email is off (see joinMember).
      const m = await joinMember(body.join.name, body.join.email, body.join.ref, ip, req.headers.get("x-cron-secret"), body.join.code);
      if (emailEnabled()) {
        // A one-time link to finish joining (using it proves the address), or for a member, to sign in. Same answer either way.
        sendOneTime(req, m, m.existing ? "signin" : "join");
        return NextResponse.json({ ok: true, sent: true });
      }
      // The member's Me with it (viewPatch of no records, a few milliseconds), so onboarding opens at once and the table follows in the background.
      // A trial due to start lands first, as on the view's GET.
      await billingVisit(m.token, origin(req)).catch((e) => console.error("plan visit failed", e));
      const me = (await viewPatch(m.token, []).catch(() => null))?.me;
      return withSession(req, NextResponse.json({ ok: true, ...(me ? { me } : {}) }), m.token);
    } catch (e) {
      if (e instanceof ActionError) return err(e.message);
      throw e;
    }
  }

  if (body.signOut) {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  }

  // Who is acting comes first. Nobody signed in means an answer at once: nothing is queued, and
  // the limit is on the address, since any cookie value can be made up.
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) {
    if (limited(`act:ip:${ip}`, 60, 60_000)) return err(SLOW, 429);
    return err(SIGNED_OUT, 401);
  }
  if (limited(`act:${me.id}`, 240, 60_000)) return err(SLOW, 429);
  const action = body.action as Action;
  // Finding a company by its exact name has a per-minute limit of its own, besides its daily ones (lib/table.ts).
  if (action?.type === "find" && limited(`find:${me.id}`, FIND_PER_MINUTE, 60_000)) return err(SLOW, 429);
  // Profile texts are cut on a whole character here (perform cuts them by unit).
  if (action?.type === "profile") {
    if (typeof action.title === "string") action.title = tidy(action.title, 80);
    if (typeof action.goal === "string") action.goal = tidy(action.goal, 40);
  }
  try {
    const asMember = req.cookies.get(AS_MEMBER_COOKIE)?.value === "1";
    // A bulk unlock's quote (the workbench): the unlock as a dry run, in batches of 60, naming any limit that stops part of it.
    // Nothing is spent: a quote never reaches perform as an unlock.
    if (action?.type === "unlockMany" && !!(action as { quote?: unknown }).quote) {
      const quote = await quoteUnlock(token, action.items, { asMember, ...(action.from === "crystal" ? { from: "crystal" as const } : {}) });
      if (!quote) return err(SIGNED_OUT, 401);
      return sendJson(req, { message: "", quote, version: viewVersion() });
    }
    // Anything the action writes to the credit history is dated after this.
    const since = new Date().toISOString();
    const out = await perform(token, action, origin(req), { asMember });
    if (patchless(action)) return sendJson(req, { ...out, version: viewVersion() });
    // What changed, as the member now sees it (viewPatch). Without it the answer still stands, and the page loads the table again.
    const patch = await viewPatch(token, touchedIds(action, out), { asMember, since, benchmarks: BENCH_ACTIONS.has(action.type), found: action.type === "find" }).catch((e) => {
      console.error("action answer without its records", e);
      return null;
    });
    if (!patch) return sendJson(req, { ...out, partial: true, version: viewVersion() });
    // A move done, snoozed or taken back: today's moves as they now stand, the next best in place, with their records.
    if (action.type === "move") {
      const mv = await movesFor(token).catch(() => null);
      if (mv) return sendJson(req, { ...out, ...patch, companies: mv.companies, moves: mv.wire, me: { ...patch.me, ...out.me } });
    }
    return sendJson(req, { ...out, ...patch, me: { ...patch.me, ...out.me } });
  } catch (e) {
    if (e instanceof ActionError) return err(e.message);
    throw e;
  }
});
