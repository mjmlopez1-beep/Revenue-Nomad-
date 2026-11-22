# Google OAuth verification: the submission kit

Everything needed to submit Merlin's Google sign-in for verification in Google Cloud Console, except the clicks only the owner can make. Written from the code (`lib/google`), the Privacy Policy (`/privacy`, `app/privacy/Privacy.tsx`) and the Terms of Service (`/terms`, `app/terms/Terms.tsx`). This file is in a public repository: it holds no secrets, no client ids and no member data. Keep it that way.

## The recommendation

**Submit Calendar and Contacts now. Leave Gmail for later.**

- Calendar and Contacts use four **sensitive** scopes. Verification is a review of the consent screen, the policy and a demo video, usually a few weeks, with no fee and no outside audit.
- Gmail (`gmail.metadata`) is a **restricted** scope. Besides the same review it needs a CASA security assessment by an authorized assessor, paid for by the developer and repeated every 12 months. It is offered today only to listed testers (`RN_GOOGLE_GMAIL=1` with `RN_GOOGLE_GMAIL_TESTERS`), and members can already save Gmail conclusions through their own Claude (`save_my_network`) without Merlin reading Gmail at all.
- Keep Gmail on its own OAuth client in a separate Google Cloud project that stays in Testing (`GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, see `lib/google/config.ts`). Then the main project's consent screen lists only Calendar and Contacts, and can be verified and published without Gmail holding it back.
- Publishing also ends Testing's 7-day refresh tokens, so members stop being asked to reconnect every week.

## (a) The OAuth consent screen

In Google Cloud Console, the main project (the one whose client is `GOOGLE_CLIENT_ID`): Google Auth Platform, Branding, Audience and Data Access (older consoles: APIs and Services, OAuth consent screen).

| Field | Value |
|---|---|
| App name | `Merlin by Revenue Nomad` |
| User support email | **Owner:** a Google group or address on revenuenomad.com that someone reads, such as the address in `RN_SUPPORT_EMAIL`. It shows on the consent screen. |
| App logo | `public/brand/merlin-icon-120.png`: 120 x 120 PNG, square, under 1 MB, made from `public/brand/merlin-icon-512.png` (the app's own icon, as `app/icon.png` and `app/apple-icon.png`). Uploading a logo means the brand is reviewed too: keep it. |
| Application home page | `https://merlin.revenuenomad.com` |
| Application privacy policy link | `https://merlin.revenuenomad.com/privacy` |
| Application terms of service link | `https://merlin.revenuenomad.com/terms` |
| Authorized domains | `revenuenomad.com` |
| Developer contact information | **Owner:** one or more addresses Google can reach about the review (an alias on revenuenomad.com is best, so it doesn't depend on one person). |
| User type / audience | External. Publishing status: In production once submitted. |

**Scopes (Data Access) on the main project: exactly these, nothing else.**

| Scope | Type | Used for |
|---|---|---|
| `openid`, `email` | non-sensitive | Which Google account was connected (shown to the member only). |
| `https://www.googleapis.com/auth/calendar.events.readonly` | sensitive | Meetings with people at companies on Merlin. |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | sensitive | Finding the member's other calendars that they own. |
| `https://www.googleapis.com/auth/contacts.readonly` | sensitive | Saved contacts' names, emails, company and title. |
| `https://www.googleapis.com/auth/contacts.other.readonly` | sensitive | Other contacts' names and emails. |

Do **not** add `https://www.googleapis.com/auth/calendar.readonly` (the code accepts it from older grants, `SCOPE_CALENDAR_WIDE`, but never asks for it) or `https://www.googleapis.com/auth/gmail.metadata` to this project.

**The OAuth client** (Clients, the Web application whose id is `GOOGLE_CLIENT_ID`):

- Authorized redirect URI: `https://merlin.revenuenomad.com/api/integrations/google/callback` (`lib/google/config.ts` `CALLBACK_PATH`, built from `RN_PUBLIC_URL`). Remove any test or Railway address from the production client once the domain is live.
- `RN_PUBLIC_URL` on the server must be `https://merlin.revenuenomad.com`, so the redirect Merlin sends matches.

## (a2) Gmail in its own Google Cloud project

Merlin supports Gmail on a second OAuth client in a separate Google Cloud project, so the main project (sign-in, Calendar, Contacts) can be verified and published without the restricted Gmail scope. When `GOOGLE_GMAIL_CLIENT_ID` and `GOOGLE_GMAIL_CLIENT_SECRET` are both set, Add Gmail runs its own OAuth flow on that client, asking only for `openid`, `email` and `gmail.metadata`; members see a second, separate consent screen. Its refresh token is stored apart from the main one (sealed, marked as the Gmail client's), is refreshed on the client it was made with, and is revoked at Google on Drop Gmail and on Disconnect and delete everything. When either variable is unset, Gmail is added to the main grant on the main client, as before, so nothing breaks. Merlin still never reads a message's text or subject: headers only (From, To, Cc, Date).

Steps for the owner:

1. In Google Cloud, create a second project (for example "Merlin Gmail"). Enable the Gmail API there. Calendar and People APIs stay on the main project only.
2. OAuth consent screen of the Gmail project: External, the same app name, logo, support email, home page, privacy policy and terms as the main project. Scopes: `openid`, `.../auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.metadata` only. Leave it in Testing and add each Gmail tester as a test user (the same emails as `RN_GOOGLE_GMAIL_TESTERS`).
3. Clients in the Gmail project: create a Web application client. Authorized redirect URI: the same one as the main client, `https://merlin.revenuenomad.com/api/integrations/google/callback` (one callback serves both; Merlin tells the flows apart by their state). Add a test origin's callback only while testing there.
4. Main project: remove `gmail.metadata` from its consent screen's scopes. It keeps `openid`, `email`, `calendar.events.readonly`, `calendar.calendarlist.readonly`, `contacts.readonly` and `contacts.other.readonly`.
5. In Railway, set `GOOGLE_GMAIL_CLIENT_ID` and `GOOGLE_GMAIL_CLIENT_SECRET` to the Gmail client's values (never in the repo or a message). `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` stay the main client's. `RN_GOOGLE_GMAIL=1` and `RN_GOOGLE_GMAIL_TESTERS` still decide who is offered Gmail.
6. Members who added Gmail before the switch keep working on the main client (their link isn't marked as the Gmail client's). To move one to the new project, they drop Gmail and add it again.

## (b) Verify revenuenomad.com in Search Console

Google checks that the people submitting own the domains on the consent screen. A Domain property covers `merlin.revenuenomad.com` too.

1. Sign in to https://search.google.com/search-console with a Google account that is an Owner or Editor of the Google Cloud project.
2. Add property, choose **Domain**, type `revenuenomad.com`, Continue.
3. Copy the TXT record Google shows (`google-site-verification=...`).
4. At the DNS host for revenuenomad.com, add a TXT record on the root (`@`) with that value. Leave any existing TXT records (SPF, Resend's) as they are.
5. Back in Search Console, Verify. DNS can take from minutes to a day. If it fails, wait and try again; nothing else needs changing.
6. If someone else verified the domain, add the Cloud project's Owner as an Owner in Search Console (Settings, Users and permissions). The account that submits verification must be a verified owner.
7. In Cloud Console, Branding, check that `revenuenomad.com` shows as an authorized domain with no warning.

## (c) Scope justifications, ready to paste

Google asks, per sensitive scope, how it is used and why a narrower scope won't do. Paste each one into its box.

### calendar.events.readonly

> Merlin is a data exchange for fractional executives. When a member connects Google, Merlin shows them, privately, which companies they already have a relationship with: who they have met and how recently. This scope is used for three features the member sees: (1) "Your way in" on a company's record and Your network, which show the member the people they have met at that company and when; (2) Your pipeline, where a meeting with someone at a company the member reached out to moves that deal to Meeting by itself; (3) "We think you held these seats", which suggests past client engagements from months of regular meetings, added only when the member confirms. Merlin reads only each event's start time, status, event type and guests (email, name, response, organizer flag), for the past 24 months and the next 30 days. Every request sets the `fields` parameter so the title (summary), description, location and attachments are never returned. Nothing is written. Narrower scopes don't work: the free/busy scopes return busy times without guests, and the features above need to know who a meeting was with. The data is shown only to that member, never to other members, never sold, never used for ads or to train AI models, and it is deleted when the member clicks Disconnect and delete everything, or 30 days after they remove Merlin's access in their Google Account without reconnecting.

### calendar.calendarlist.readonly

> Many members keep client meetings on a second calendar they own, not only on their primary calendar. Merlin uses this scope only to list the member's calendars and pick the ones they own (accessRole owner, at most 10 including the primary), so the meeting features described for calendar.events.readonly see their whole work week. It reads each calendar's id, whether it is primary, its access role and whether it was deleted: never calendar names, descriptions, colours, sharing or settings. Without this scope Merlin reads the primary calendar only, which it does when the member doesn't grant it. No narrower scope lists the member's calendars. Nothing is written.

### contacts.readonly

> Merlin shows a member which companies they already know someone at, and who that person is (for example, the VP Sales they met there), on the company's record, in Your network and in Your three moves today. Saved contacts are the member's own record of who they know. Merlin reads each saved contact's name, email addresses (up to 5), organization name and job title (`personFields=names,emailAddresses,organizations`), matches the email domain or organization to companies on Merlin, and keeps up to 8 people per company for that member alone. It never reads phone numbers, addresses, birthdays, notes, photos or groups, and writes nothing. There is no narrower read-only contacts scope. The data is never shown to other members, sold, used for ads or used to train AI models, and is deleted on Disconnect and delete everything, or 30 days after the member removes Merlin's access in their Google Account without reconnecting.

### contacts.other.readonly

> Many people a fractional executive works with are never saved as contacts: Google keeps them as "Other contacts" after an email exchange. Merlin reads only their names and email addresses (`readMask=names,emailAddresses`) to find the same warm paths described for contacts.readonly (which companies the member knows someone at, and who), for that member alone. Saved contacts (contacts.readonly) don't include these people, and no narrower scope reads them. Nothing is written. The same limits apply: never shown to other members, sold, used for ads or to train AI models, and deleted on Disconnect and delete everything.

### Later: gmail.metadata (restricted, needs CASA)

Submit only when Gmail goes beyond testers. Before submitting: a CASA assessment (Tier 2 is typical for this size; the assessor confirms the tier) with an authorized lab, paid by Revenue Nomad, renewed every 12 months, and the Privacy Policy's Gmail line moved out of "only for members we invite to test it".

> Merlin uses gmail.metadata only to see who the member emails and when, to show them their own warm paths and to move their own pipeline: an email out to a company they are pursuing marks it Sent, and a reply from someone there marks it Replied. Merlin requests messages with format=metadata and only the From, To, Cc, Date and bulk-mail headers (List-Unsubscribe, List-Id, Precedence, Auto-Submitted), and the fields internalDate, labelIds and payload.headers. It never reads a subject, a snippet, a body or an attachment, and the scope itself cannot return them. It keeps per company the times of the latest email out and in and counts, never message ids or headers. gmail.readonly would expose message bodies Merlin never needs, so the narrower metadata scope is used. Calendar and Contacts can't show replies. Data is shown only to that member, never sold, never used for ads or to train AI models, and deleted when the member drops Gmail or disconnects.

## (d) Demo video script (about 3 minutes)

Google wants one unlisted YouTube video, in English, on the production domain, showing the whole OAuth flow and each sensitive scope in use. Record with a test member who has a few real-looking meetings and contacts at companies on Merlin (a test Google account with made-up events, never a real member's data). Browser window at full size, address bar always visible. Narrate or caption each step.

| # | Time | Shot | Say or caption |
|---|---|---|---|
| 1 | 0:00 to 0:15 | `https://merlin.revenuenomad.com`, signed out. Scroll to the footer. Hover Privacy and Terms. | "Merlin by Revenue Nomad, a data exchange for fractional executives. The Privacy Policy and Terms are linked from the homepage." |
| 2 | 0:15 to 0:30 | Click Privacy. Jump to Google user data (`/privacy#google`). Pause on the Limited Use sentence. | "Our Privacy Policy has a Google user data section with the Limited Use disclosure." |
| 3 | 0:30 to 0:45 | Back on the homepage, Sign in with the test member (email link or code). | "A member signs in." |
| 4 | 0:45 to 1:00 | Open Your network. Show What Merlin reads and What it never does, and the How Merlin uses your Google data link. Click Connect Google. | "Connecting Google is optional and read-only." |
| 5 | 1:00 to 1:30 | Google's consent screen. Zoom on the address bar until the `client_id=` value is readable. Show the app name Merlin by Revenue Nomad and each requested permission: calendar events, calendar list, contacts, other contacts. Expand each. Click Continue. | "This is the OAuth client under review. Merlin asks for read-only Calendar events, the calendar list, Contacts and Other contacts." |
| 6 | 1:30 to 1:45 | Back in Merlin: the connect moment while it maps, then the result: "you know someone at N companies on Merlin". | "Merlin reads in the background and keeps conclusions only." |
| 7 | 1:45 to 2:05 | **contacts.readonly and contacts.other.readonly.** Open a company in Your network or its record: Your way in, the person the member knows there with their title, from Contacts. Point at a person who came from Other contacts. | "From Contacts and Other contacts: who the member already knows at this company. Only this member sees it." |
| 8 | 2:05 to 2:25 | **calendar.events.readonly.** Your pipeline: a deal at Meeting, "From your calendar on ...". Then Your seats: "We think you held these seats", from months of meetings, with Confirm. | "From calendar events: meetings move the member's own pipeline, and months of meetings suggest past client seats. Merlin never reads event titles, descriptions or locations." |
| 9 | 2:25 to 2:40 | **calendar.calendarlist.readonly.** Show a meeting that lives on a second calendar the test account owns (show it in Google Calendar first, then the same company's meeting in Merlin). | "The calendar list lets Merlin include other calendars the member owns, not only the primary." |
| 10 | 2:40 to 2:55 | Your network, Disconnect and delete everything. Confirm. Show the empty state. Optionally show Merlin gone from the Google Account's third-party access page. | "Disconnect revokes access at Google and deletes what Merlin kept." |
| 11 | 2:55 to 3:00 | End card: merlin.revenuenomad.com/privacy | |

Upload as Unlisted. Paste the link in the verification form.

## (e) Checklist

### Owner, before submitting

- [x] The Terms' governing law is set: the State of Connecticut, disputes in the state and federal courts located in Connecticut (`GOVERNING_LAW`, `DISPUTE_COURTS` in `app/terms/Terms.tsx`).
- [ ] Have a lawyer read `/privacy` and `/terms` (the list under "To confirm" below).
- [ ] Set `RN_SUPPORT_EMAIL` on the production server, so `/privacy` and `/terms` show the address (without it they say "Write to us from revenuenomad.com").
- [ ] Production runs at `https://merlin.revenuenomad.com` with `RN_PUBLIC_URL` set to it; `/privacy` and `/terms` open signed out.
- [ ] Verify revenuenomad.com in Search Console (b).
- [ ] Move Gmail to its own OAuth client in a separate project that stays in Testing (`GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`), and remove `gmail.metadata` from the main project's scopes.
- [ ] Fill in the consent screen (a), upload `public/brand/merlin-icon-120.png`, add only the four sensitive scopes.
- [ ] Record and upload the demo video (d).
- [ ] Paste the justifications (c). Submit for verification.

### While Google reviews

- Watch the developer contact inbox and the Cloud Console notifications every day. Google writes from the Trust and Safety team and expects an answer within days.
- Don't change the consent screen, scopes, logo or domains while the review runs: a change can restart it.
- Members can keep connecting meanwhile. An unverified app shows a warning screen and is limited to 100 users.

### If Google asks

| Google asks | Answer |
|---|---|
| The privacy policy doesn't disclose how Google data is used. | Point to `https://merlin.revenuenomad.com/privacy#google`: what is read, how it is used, what is kept, transfers, deletion, and the Limited Use sentence with its link. |
| The homepage doesn't explain the app or link the policy. | The homepage describes Merlin above the fold, and its footer links Privacy and Terms. Send a screenshot. |
| Why calendar.events.readonly and not calendar.readonly? | Merlin already uses the narrower one, and never asks for calendar.readonly. |
| Why not a narrower calendar scope, such as one for events on calendars you own (calendar.events.owned.readonly)? | Check first whether Google offers it for this project. Merlin reads only the primary calendar and calendars the member owns, so if it is offered, switching to it (and dropping calendar.calendarlist.readonly if that scope then covers what Merlin needs) is the easy answer. Changing scopes means a code change in `lib/google/config.ts` and its checks (`scripts/test-google.mts`) and a new demo shot. |
| Why do you need other contacts? | People members work with are often never saved; Merlin reads only names and emails. |
| The demo video doesn't show the client id / the consent screen / a scope in use. | Re-record that shot (d, shots 5 and 7 to 9) and reply with the new link. |
| Your app sends Google data to an AI assistant. | Only the member's own assistant, only when the member adds Merlin's connector and asks, only company-level conclusions (companies, warmth, last contact), never contacts' names or emails (`lib/google/index.ts` `myNetworkForClaude`). Merlin's server calls no AI model and nothing is used for training. If Google objects, the connector's `my_network` tool can be limited to companies only. |
| Domain ownership not verified. | Finish (b) with the account that submits, then reply. |
| Do you need restricted scopes? | No, not in this submission. Gmail is on a separate project in Testing. |
| How does a user delete their Google data? | Your network, Disconnect and delete everything: Merlin revokes its token at Google and deletes the member's whole network, and what came from Google on their pipeline (`lib/google/index.ts` `disconnectAll`, `forgetIn`; `lib/pipeline.ts` `forgetGoogle`). A pipeline entry Gmail opened that the member never acted on in Merlin is deleted; the rest keep their stages and dates without the contact's name, title or email and without the Gmail and calendar details. Nothing Google-derived is kept elsewhere: smart ways in, Your way in, moves and Crystal Ball's "You know someone" are worked out from the network when shown. |
| What if the user removes access in their Google Account? | The next read gets `invalid_grant`. Merlin marks the connection Needs reconnecting and records the day (`GoogleLink.goneAt`). Your network says "Google access was removed on (day). Reconnect within 30 days or Merlin deletes what it read from Google on (day)." 30 days later, unless the member connected again, Merlin deletes it the same way (`expireRevoked`, run by the automatic jobs' timer, before the daily reads and before the member's own view). What the member's own assistant saved stays until they delete it. |

## To confirm (owner and lawyer)

These are not on the public pages, or are phrased there conservatively, until someone confirms them.

- **Governing law:** set to the State of Connecticut, where Revenue Nomad is registered, with disputes in the state and federal courts located in Connecticut.
- **Support address:** `RN_SUPPORT_EMAIL` must be set in production; the pages read it at run time.
- **Closing an account:** there is no in-app button. The policy says to write to us and that we will say what we keep (such as payment records). The process, how long it takes, and what stays (ledger rows, facts other members unlocked, signed proposals) need deciding.
- **Backups:** daily snapshots on the server are kept 14 days (`lib/backup.ts`). The off-site bucket keeps a file per day with no expiry set in Merlin, and it holds Google network data. Set a lifecycle rule on the bucket (for example 30 days), then the policy can name the number. Whether the off-site copy needs its own encryption is for the owner.
- **Hosting region and transfers:** where Railway runs the server and volume, and whether members outside the US need a transfer notice (GDPR, UK GDPR).
- **Privacy law rights:** the policy says members can ask for a copy, a correction or a deletion, and that local law may give more. A lawyer should say whether CCPA/CPRA or GDPR wording, a data controller statement or a representative is needed.
- **Processors' terms:** a data processing agreement, or the provider's standard terms, with Railway, the backup provider, Resend, Stripe and Slack.
- **Seat names from research and outreach:** the policy says names on seats come from members or from research of public professional profiles (US only, unverified until confirmed), and that we may write to a named person so they can claim the seat or take their name off. Confirm that matches what the owner does, and the legal basis.
- **Leaders' names:** company leaders' names and titles from company websites (US headquarters only). The data page used to say titles only; it now says names too, matching `lib/leaders`.
- **Mergers:** the policy says member data may move with Merlin in a merger or sale, under the policy, with notice first.
- **Changes notice:** both pages promise to tell members before a change that matters takes effect.
- **Terms:** the contributions licence (worldwide, non-exclusive, royalty-free, lasting, survives leaving), credits having no cash value and ending with the account, no refunds except where law requires, the liability cap (12 months' fees or $100), the indemnity, and the "not for employment, credit, insurance or housing decisions" line (FCRA). Also whether taxes need a line.
- **E-signature consent:** the signer's consent text (`lib/proposals/types.ts` `consentText`, version `CONSENT_VERSION`) needs its own review before launch, as its comment says.
- **The connector and Google data:** `my_network` sends company-level conclusions from Google to the member's own assistant on request. Confirm the owner is content to describe this to Google as a user-directed transfer (see "If Google asks").
- **A narrower calendar scope:** check whether `calendar.events.owned.readonly` is available to the project (see "If Google asks").

## Where things are

- Pages: `app/privacy/Privacy.tsx`, `app/terms/Terms.tsx`, shared look `app/legal/LegalShell.tsx`. Effective date and versions: `LEGAL_EFFECTIVE`, `PRIVACY_VERSION`, `TERMS_VERSION`. Bump a version and the date with every change.
- Links: the landing footer (`app/landing/Landing.tsx`), Your credits (`app/post/Settings.tsx` `DataLink`), each Connect Google (`app/post/network/Network.tsx` `GooglePolicyLink`), the signing page and signed copy (`app/sign/Sign.tsx` `SignLegal`), the data page.
- Checks: `scripts/test-legal.mts` (in `scripts/test-all.sh` as `legal`).
- The Limited Use sentence, as on the page:

> Merlin's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.

Linked to https://developers.google.com/terms/api-services-user-data-policy
