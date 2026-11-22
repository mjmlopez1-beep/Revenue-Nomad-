# Where Merlin's data goes

The same content as the public page at `/data` (`app/data/DataFlows.tsx`), with the code it was checked against and the points the owner still has to confirm. Keep the two in step. Lines marked **To confirm** are for the owner or a lawyer and are not on the public page.

## 1. When an AI model is used

- Merlin's server calls no AI model, except drafting a proposal with Claude (`lib/proposals/draft.ts`), which is off unless `RN_AI_DRAFTS=1`, `ANTHROPIC_API_KEY` and `RN_AI_MODEL` are all set (`lib/proposals/aiConfig.ts`), and which a member agrees to before their first draft (`State.aiDrafts`). Then one request to Anthropic's Messages API carries that draft's inputs: the transcript or notes the member pasted, the template, the company's facts as the member's table shows them, the rate range from the benchmarks, the member's name, title and writing voice. The transcript is used for that request only and never stored or logged; only the draft is saved. It is on Pro + Close and the trial (`lib/billing/rules.ts` `canClose`), metered against each member's monthly AI usage (`lib/proposals/aiUsage.ts`): for each call Merlin keeps only how many tokens went in and out and what that cost, as numbers (`State.aiUsage`, the last 200 calls), never a word of the call or the draft. The member sees a percentage of the month's AI usage; the owner sees the month's totals in Pilot metrics.
- **To confirm:** Anthropic's commercial terms and data retention for the API key Revenue Nomad uses, before turning `RN_AI_DRAFTS` on.
- AI comes in only when a member adds Merlin to their own assistant (Claude, ChatGPT) with the connector (`app/api/mcp`, `lib/mcp`). The assistant calls Merlin's tools as that member, with a token that member granted (OAuth 2.1 with PKCE, `lib/mcp/oauth.ts`). Each tool answers from the member's own view (`lib/mcp/view.ts`, `lib/mcp/tools.ts`): the same locks, credits and limits as the app. Nothing is sent to the assistant that the member couldn't see in the app.
- What the assistant's provider does with those answers is governed by the member's own account with that provider.
- The member sees and disconnects connected assistants in Your credits, Connected apps (`app/post/ConnectedApps.tsx`, `disconnectApp` in `lib/mcp/oauth.ts`). An assistant can also revoke its own grant (`/api/oauth/revoke`).

## 2. Does any of it train a third party's model?

- Merlin sends no data to model providers, so nothing from Merlin goes into their training.
- Google user data (`lib/google`) is used under the Google API Services User Data Policy, including its Limited Use requirements: never sold, never used for ads, never used to train AI models, used only to show a member their own network, never shown to another member or an admin, never added to shared counts or Crystal Ball's model (`lib/google/types.ts`).
- Merlin never reads email text or meeting titles:
  - Calendar events are requested with a `fields` mask that leaves out the title (summary), description, location and attachments (`lib/google/api.ts` `EVENT_FIELDS`, `calendarEvents`).
  - Gmail is read with `format=metadata` and only the From, To, Cc, Date and bulk-mail headers (List-Unsubscribe, List-Id, Precedence, Auto-Submitted), under the `gmail.metadata` scope, which cannot read bodies (`lib/google/api.ts` `HEADERS`, `lib/google/config.ts` `SCOPE_GMAIL`).
  - Contacts: names, email addresses, organization and job title only (`personFields` / `readMask` in `contacts`).
- **To confirm:** Google's OAuth verification status for the scopes in `MAIN_SCOPES` and `gmail.metadata` (Gmail is offered only to listed testers today, `RN_GOOGLE_GMAIL_TESTERS`), and whether a Limited Use disclosure is also needed in a privacy policy on revenuenomad.com.
- The Privacy Policy (`/privacy`, `app/privacy/Privacy.tsx`) and Terms of Service (`/terms`, `app/terms/Terms.tsx`) sit beside this page. The Google verification kit, with what the owner still has to confirm for them, is `docs/google-verification.md`.

## 3. What each outside service receives, and why

The browser only talks to Merlin: the app loads no outside scripts, fonts (they are bundled), analytics or icons. Company icons used to come from Google's and DuckDuckGo's favicon services in the member's browser, and from Clearbit's autocomplete on the server by company name. That is gone: the server reads each icon from the company's own website and serves it from `/api/logo/<company id>` (`lib/logo.ts`).

Every outside host the server calls, from `lib/` and `app/api/`:

| Service | Hosts | What it receives | Why | When |
|---|---|---|---|---|
| Company websites | each company's own domain | GET requests from the server with a plain User-Agent (`Merlin-About/1.0`, or a generic one for careers pages). No member data. | About texts (`lib/about`), who leads each function and the top leader, with the name and title as the page prints them, kept only for companies with a US headquarters and never for someone who used Remove my name (`lib/leaders`, `lib/table.ts` `saveLeaders`), finding a company's website from its name (`lib/websites`), the email addresses that fractionals publish on their own business websites, US only, to invite them to join Merlin or claim their seats and to show members, and anyone can remove their name and email at `/remove` (`lib/ownsites`, read only with `RN_OWNSITES=1`, which also makes them usable), careers page links (`lib/scan/sources/ats.ts`), posting checks (`lib/scan/posting.ts`), company icons (`lib/logo.ts`), the Add form's prefill from a website a member pastes (`lib/companyLookup.ts`). robots.txt is read first for About, leaders, the website finder, own sites and icons. | About: `RN_ABOUT=1`. Leaders: `RN_LEADERS=1`. Website finder: `RN_WEBSITES=1`. Own sites: `RN_OWNSITES=1` (a dry run with `RN_OWNSITES_DRYRUN=N` makes nothing usable). Careers and posting checks: with the scan. Icons: unless `RN_LOGO_LOOKUP=off`. Add form: when a member uses it. |
| Job boards | www.fractionaljobs.io, findfractionaljobs.com, remotive.com, remoteok.com, weworkremotely.com, boards-api.greenhouse.io (boards in `RN_GREENHOUSE_BOARDS`), freehire.me (only with `RN_FREEHIRE_KEY`) | Requests for public listings. freehire gets Merlin's API key. No member data. | The weekly scan of open roles (`lib/scan/collect.ts`). | `RN_SCAN=1` or a cron call with `RN_CRON_SECRET`. |
| Applicant tracking systems | boards-api.greenhouse.io, api.lever.co, api.ashbyhq.com, apply.workable.com, api.smartrecruiters.com, `<board>.recruitee.com`, `<board>.jobs.personio.de`, `<board>.breezy.hr`, `<board>.teamtailor.com` | Requests for a company's public job feed, including the board names Merlin guesses from a company's domain or name. That tells the system which companies Merlin looks at, not anything about members. | Open roles at companies already on Merlin, and whether a role is still open. | With the scan. |
| SEC EDGAR | efts.sec.gov, www.sec.gov | Requests for daily Form D indexes and filings, with a User-Agent naming Merlin and a contact address. No member data. | Funding events (`lib/funding`). | `RN_FUNDING=1`. |
| Google | accounts.google.com, oauth2.googleapis.com, www.googleapis.com, people.googleapis.com, gmail.googleapis.com | Sign-in and token exchange for a member who connects, read requests with that member's token, and token revocation on disconnect. | The member's own network (`lib/google`). | `RN_GOOGLE=1` with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; Gmail only with `RN_GOOGLE_GMAIL=1` for listed testers. |
| Resend (email) | api.resend.com | For each email: the recipient's address, subject, text and HTML. Sign-in links and codes, message emails (the sender's first name, the company, and the first 200 characters of the message, `lib/messages.ts`), Peers notices (a lead passed or a team-up asked: the sender's first name, the company as the recipient may see it, and the sender's note, `lib/peers.ts`), the weekly email, Crystal Ball emails, join and invite notices, plan notices. | Sending email (`lib/email.ts`). | `RESEND_API_KEY` and `RN_EMAIL_FROM`. |
| Stripe | api.stripe.com | At checkout: the member's email (until Stripe has a customer id), an opaque HMAC reference that is not the member's id or name (`billingRef`), the plan interval, a promotion code. Card details go to Stripe directly. | Pro and top-ups (`lib/billing`). | `RN_BILLING=1` with the Stripe keys. |
| Slack | slack.com, hooks.slack.com | OAuth code exchange when a member connects the Slack app; then the alerts that member turned on, with companies they can see and links back to Merlin. Logos in Slack posts now point at Merlin's own `/api/logo/<id>` (was Google's favicon service). | Alerts (`lib/notify`, `lib/radar`). | Per member. |
| Webhooks a member adds | any public https host the member pastes | The same alerts, as JSON. Private and internal addresses are refused (`lib/notify/url.ts`). | Alerts in other tools. | Per member. |
| Backup storage | `RN_BACKUP_S3_ENDPOINT` (for example storage.railway.app) | A daily copy of the whole state file (`intel.json`): members, what they added, unlocks, credits, messages, Google network data. | Off-site backup (`lib/backup.ts`). | Only when the `RN_BACKUP_S3_*` settings are set. |
| AI assistants' sign-in details | the assistant's own client id address (for example on claude.ai) | A GET for the assistant's public client metadata document. No member data. | Registering an assistant for the connector (`lib/mcp/oauth.ts` `fetchCimd`). | When an assistant connects. |
| Hosting | Railway | Runs the server; the data volume (`RN_DATA_DIR`) lives there. | Hosting. | Always. |

Not called: no AI model provider (except Anthropic's API for drafting with Claude, when it is switched on, see part 1), no analytics, no ad network, no icon service, no company-data or autocomplete service. The older job sources in `lib/crawler/sources` for Hacker News and Reddit are in the repo but not read by the scan.

- **To confirm:** a data processing agreement, or the provider's standard terms, for each vendor that receives member data: Railway (hosting and the volume), the backup bucket's provider, Resend, Stripe, Slack. And whether Railway's region needs saying for members outside the US.
- **To confirm:** the backup copy holds Google network data. Whether that copy needs its own encryption key or retention limit under Google's policy. It is overwritten daily under a dated name; how long the bucket keeps old days is set in the bucket, not in Merlin.
- **To confirm:** freehire.me's terms for showing its postings (the code reads it only with a paid plan key).
- **To confirm:** robots.txt is not read for the ATS feeds and careers-page discovery, which use the systems' public job APIs. Whether that needs saying.

## 4. Inside Merlin: Peers

- Peers (`lib/peers.ts`, `lib/peersCore.ts`, `State.peers`) keeps the leads members pass to each other, the team-ups they start and the circles they join: who, which company, and what they wrote (a pass's note, a team's draft, a circle's posts). Each is shown only to the members in it: a pass to its two members, a team to its two, a circle's posts to its members.
- None of it goes to an outside service, except the Peers notices by email (part 3). The admin export keeps who and which company and leaves out what members wrote (`lib/table.ts` `exportState`).
- Names in Peers follow the Fractionals directory (`lib/fractionals.ts`): a member who said no to the directory is left out, and names taken off with Remove my name, outside the US or unverified are not on file.

## 5. Who can switch a feature off

### The owner (server settings, all checked in the code)

| Switch | Off by default? | What it stops | Where |
|---|---|---|---|
| `RN_GOOGLE=1` | off unless set | The Google network: no page, no tool, no Google calls. | `lib/google/types.ts` `networkOn` |
| `RN_GOOGLE_GMAIL=1` | off unless set | Offering Gmail headers (and only to `RN_GOOGLE_GMAIL_TESTERS`). | `lib/google/config.ts` |
| `RN_LEADERS=1` | off unless set | Reading leadership pages. `RN_LEADERS_DAILY=0` stops only the daily batch. | `lib/leaders/types.ts`, `lib/schedule.ts` |
| `RN_WEBSITES=1` | off unless set | The website finder. | `lib/websites/types.ts` |
| `RN_OWNSITES=1` | off unless set | Own sites: the daily read of fractionals' own firm websites for the email they publish, and showing it (locked, "From their website"). `RN_OWNSITES_DRYRUN=N` reads up to N once after a start and makes nothing usable. | `lib/ownsites/types.ts` |
| `RN_ABOUT=1` | off unless set | About texts from homepages. | `lib/about/types.ts` |
| `RN_FUNDING=1` | off unless set | SEC Form D reads. | `lib/funding/types.ts` |
| `RN_SCAN=1` | off unless set | The weekly scan on its own timer. A cron call with `RN_CRON_SECRET` can still run it. | `lib/table.ts` `maybeScan`, `lib/schedule.ts` |
| `RN_DIGEST=0` | on while email is set up | The weekly email. | `lib/table.ts` `digestOn` |
| `RN_RADAR=0` | on | Crystal Ball's daily run. | `lib/radar/index.ts`, `lib/schedule.ts` |
| `RN_LOGO_LOOKUP=off` | on | Reading icons from company websites. Icons already kept still show; the rest are lettered tiles. | `lib/logo.ts` |
| `RN_BILLING=1` | off unless set | Payments, trials, Stripe calls. | `lib/plan.ts` |
| `RESEND_API_KEY` unset | off unless set | All email. | `lib/email.ts` |
| Automatic jobs (Pilot metrics) | | An admin can set each job (scan, Crystal Ball, leaders, funding, About, website finder, own sites) to off. Own sites' Undo takes every found email back, with refunds. The env switches still win. | `lib/schedule.ts`, `app/post/AdminJobs.tsx` |

- The connector has no server switch: it is on for every member, and each member controls their own connections. **To confirm:** whether the owner wants an off switch for it.

### The member

- Google: Your network, Disconnect and delete everything. Merlin revokes its token at Google and deletes what it kept, what their assistant saved there included, and what came from Google on Your pipeline: an entry Gmail opened that the member never acted on in Merlin goes, the rest keep their stages and dates without the contact's name, title, email or Gmail and calendar details (`app/post/network/Network.tsx`, `POST /api/integrations/google { op: "disconnect" }`, `lib/google/index.ts` `forgetIn`, `lib/pipeline.ts` `forgetGoogle`). Drop Gmail does the same for Gmail alone.
- Google, access removed in the member's Google Account: the next read marks the connection Needs reconnecting and records the day (`GoogleLink.goneAt`), and Your network shows when Merlin will delete it. If the member doesn't reconnect within 30 days, Merlin deletes what it read from Google the same way, and keeps only what their assistant saved (`lib/google/index.ts` `expireRevoked`, run by the automatic jobs' timer in `lib/jobs.ts`, before the daily reads and before the member's own view).
- Assistants: Your credits, Connected apps, Disconnect.
- Email: switches for the weekly email and message emails in Your credits; Crystal Ball's email has its own unsubscribe link. Peers emails have their own switch in Notifications (`Me.peerEmail`).
- Peers: a member can mute another member, and leave a circle.
- Slack and webhooks: removed in Integrations.
- A name on a seat, and the email read from their own website with it: `/remove`, no account needed, or Remove my name on a claim link (`lib/table.ts` `ownEmailOff`).
- A fact just added: Undo takes it back with its credit until someone unlocks or confirms it.
- Closing an account: there is no in-app button today; the member writes to support. **To confirm:** the process and how long it takes, and what is kept (ledger rows, facts others unlocked) after an account closes.
