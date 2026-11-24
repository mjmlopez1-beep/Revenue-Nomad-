/**
 * The Google connector's settings, all from the environment.
 *
 *   RN_GOOGLE=1                    the feature switch. Off: nothing shows anywhere, no tool, no page.
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *                                  the OAuth client (Web) in Google Cloud. Both, or Connect doesn't show.
 *   RN_PUBLIC_URL                  the redirect is `${RN_PUBLIC_URL}/api/integrations/google/callback`
 *                                  (else the request's own origin).
 *   RN_GOOGLE_GMAIL=1              offer "Also add Gmail" (gmail.metadata, headers only) ...
 *   RN_GOOGLE_GMAIL_TESTERS        ... only to these emails (comma-separated), matching the test users
 *                                  in Google Cloud. A member's Merlin email or connected Google email counts.
 *   GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET
 *                                  optional: Gmail through its own OAuth client in a separate Google
 *                                  Cloud project (it can stay in Testing), so the main one can be
 *                                  published without the Gmail scope. Both set: "Add Gmail" runs its
 *                                  own consent screen with only openid, email and gmail.metadata, and
 *                                  its refresh token is kept apart (MemberNetwork.gmail, ownClient).
 *                                  Sign-in, Calendar and Contacts stay on GOOGLE_CLIENT_ID. Unset: Gmail
 *                                  is added to the main grant on the main client, as before. Setup:
 *                                  docs/google-verification.md, "Gmail in its own Google Cloud project".
 *   RN_GOOGLE_TOKEN_KEY            optional: the key tokens are sealed with (else derived from RN_ID_SECRET,
 *                                  then RN_INTEL_SEED_KEY).
 *
 * Tests only: with RN_SCAN_TEST=1, RN_GOOGLE_API_TEST replaces every Google host (a fake server).
 */
export { networkOn } from "./types";

export const CALLBACK_PATH = "/api/integrations/google/callback";
export const STATE_COOKIE = "rn_google_state";
export const STATE_COOKIE_PATH = "/api/integrations/google";

export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.events.readonly";
/** Older grants, or a consent screen set up with the wider read-only scope, work the same. */
export const SCOPE_CALENDAR_WIDE = "https://www.googleapis.com/auth/calendar.readonly";
/** The list of the member's calendars, to read their other owned calendars besides the primary. */
export const SCOPE_CALENDAR_LIST = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const SCOPE_CONTACTS = "https://www.googleapis.com/auth/contacts.readonly";
export const SCOPE_OTHER_CONTACTS = "https://www.googleapis.com/auth/contacts.other.readonly";
/** Headers only (From, To, Cc, Date): no bodies, no snippets, and no search queries. */
export const SCOPE_GMAIL = "https://www.googleapis.com/auth/gmail.metadata";

/**
 * calendar.events.readonly is enough for the events (with attendees), and narrower than
 * calendar.readonly. The calendar list (to find their other owned calendars) needs
 * calendar.calendarlist.readonly; without it only the primary calendar is read.
 */
export const MAIN_SCOPES = ["openid", "email", SCOPE_CALENDAR, SCOPE_CALENDAR_LIST, SCOPE_CONTACTS, SCOPE_OTHER_CONTACTS];
export const hasCalendar = (scopes: string[]) => scopes.includes(SCOPE_CALENDAR) || scopes.includes(SCOPE_CALENDAR_WIDE);
export const hasCalendarList = (scopes: string[]) => scopes.includes(SCOPE_CALENDAR_LIST) || scopes.includes(SCOPE_CALENDAR_WIDE);
export const hasContacts = (scopes: string[]) => scopes.includes(SCOPE_CONTACTS);
export const hasOtherContacts = (scopes: string[]) => scopes.includes(SCOPE_OTHER_CONTACTS);
export const hasGmail = (scopes: string[]) => scopes.includes(SCOPE_GMAIL);

const set = (v: string | undefined) => !!v?.trim();
export const googleConfigured = () => set(process.env.GOOGLE_CLIENT_ID) && set(process.env.GOOGLE_CLIENT_SECRET);
/**
 * Google finished checking Merlin's app (RN_GOOGLE_VERIFIED=1, off by default). Until then Google
 * turns away accounts that aren't on the app's test list, so Merlin puts the LinkedIn connections
 * file first and says, before and after Google's page, how to bring in who you know without it.
 */
export const googleVerified = () => /^(1|on|true|yes)$/i.test(process.env.RN_GOOGLE_VERIFIED?.trim() ?? "");
export const gmailOwnClient = () => set(process.env.GOOGLE_GMAIL_CLIENT_ID) && set(process.env.GOOGLE_GMAIL_CLIENT_SECRET);

/**
 * The OAuth client for a flow. `own` says which a token was made with (GoogleLink.ownClient, or the
 * start's state), so a Gmail token made on the Gmail project is refreshed there, and one made on
 * the main client before GOOGLE_GMAIL_CLIENT_ID was set keeps refreshing on the main client.
 * Without `own`, Gmail uses its own client when both of its variables are set.
 */
export function clientFor(kind: "google" | "gmail", own?: boolean): { id: string; secret: string } {
  const useOwn = kind === "gmail" && (own ?? gmailOwnClient());
  if (useOwn && gmailOwnClient()) return { id: process.env.GOOGLE_GMAIL_CLIENT_ID!.trim(), secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!.trim() };
  // A token from the Gmail project whose client was since removed: no secret here to refresh it with (Google answers invalid_client, and the link asks to reconnect).
  if (useOwn) return { id: "", secret: "" };
  return { id: (process.env.GOOGLE_CLIENT_ID ?? "").trim(), secret: (process.env.GOOGLE_CLIENT_SECRET ?? "").trim() };
}
/** The scopes "Add Gmail" asks for: on its own client its own sign-in (openid, email) and gmail.metadata only; on the main client gmail.metadata, added to the main grant. */
export const gmailScopes = (own: boolean) => (own ? ["openid", "email", SCOPE_GMAIL] : [SCOPE_GMAIL]);

/** Gmail is offered to this member: RN_GOOGLE_GMAIL=1 and one of their emails is on the testers list. */
export function gmailTester(...emails: (string | null | undefined)[]): boolean {
  if (process.env.RN_GOOGLE_GMAIL !== "1") return false;
  const list = new Set(
    (process.env.RN_GOOGLE_GMAIL_TESTERS ?? "")
      .split(/[,\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
  return emails.some((e) => !!e && list.has(e.trim().toLowerCase()));
}

export interface Bases {
  auth: string;
  token: string;
  calendar: string;
  people: string;
  gmail: string;
}
/** Google's hosts, or the fake server's on a test run. */
export function bases(): Bases {
  const t = process.env.RN_SCAN_TEST === "1" ? process.env.RN_GOOGLE_API_TEST?.replace(/\/+$/, "") : undefined;
  if (t) return { auth: `${t}/accounts`, token: `${t}/oauth2`, calendar: `${t}/calendar`, people: `${t}/people`, gmail: `${t}/gmail` };
  return {
    auth: "https://accounts.google.com",
    token: "https://oauth2.googleapis.com",
    calendar: "https://www.googleapis.com",
    people: "https://people.googleapis.com",
    gmail: "https://gmail.googleapis.com",
  };
}

/** Where Google sends the member back. Must be an Authorized redirect URI on the OAuth client. */
export function redirectUri(origin: string): string {
  const base = (process.env.RN_PUBLIC_URL?.trim() || origin).replace(/\/+$/, "");
  return base + CALLBACK_PATH;
}
