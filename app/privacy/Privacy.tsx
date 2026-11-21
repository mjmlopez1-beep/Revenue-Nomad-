/**
 * Merlin's Privacy Policy, written from what the code does (lib/google, lib/paths, lib/pipeline*,
 * lib/proposals, lib/billing, lib/email.ts, lib/notify, lib/backup.ts, lib/mcp, lib/leaders,
 * app/remove) and kept in step with the data page (app/data, docs/data-flows.md). The "Google user
 * data" part (#google) carries Google's Limited Use disclosure, word for word as the verification
 * kit (docs/google-verification.md) quotes it. What the owner or a lawyer still has to check is in
 * that kit, never on this page. Plain words, short sentences.
 */
import { ContactLine, LegalShell, PRIVACY_VERSION, type Part } from "../legal/LegalShell";

/** Google's required sentence. Checked word for word by scripts/test-legal.mts. */
const LU_BEFORE = "Merlin's use and transfer to any other app of information received from Google APIs will adhere to the ";
const LU_LINK = "Google API Services User Data Policy";
const LU_AFTER = ", including the Limited Use requirements.";
export const LIMITED_USE = LU_BEFORE + LU_LINK + LU_AFTER;
export const GOOGLE_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";

const PROCESSORS: { who: string; gets: string }[] = [
  { who: "Railway (hosting)", gets: "Runs Merlin's server and stores its data." },
  { who: "Backup storage", gets: "A daily copy of Merlin's data, kept in a storage bucket Revenue Nomad controls, so Merlin can be restored if its server's disk is lost." },
  {
    who: "Resend (email)",
    gets: "Each email Merlin sends: the address, the subject and the text. That covers sign-in links and codes, message notices, the weekly email, Crystal Ball emails, plan notices and proposal emails.",
  },
  {
    who: "Stripe (payments)",
    gets: "At checkout, your email address, a reference code that is not your name, and the plan you chose. You type card details into Stripe directly. Merlin never sees them.",
  },
  { who: "Slack, and webhooks you add", gets: "Only the alerts you turned on, with the companies you can see and links back to Merlin. Only if you connect Slack or add a webhook." },
  {
    who: "Google",
    gets: "Only if you connect Google: your sign-in and Merlin's read-only requests, sent with your own access. Nothing about other members goes to Google.",
  },
  {
    who: "Your own AI assistant",
    gets: "Only if you add Merlin's connector to it: the answers Merlin's tools give you. See \"Your own AI assistant\" below.",
  },
];

export function PrivacyView({ support }: { support: string | null }) {
  const parts: Part[] = [
    {
      id: "who",
      title: "Who we are",
      body: (
        <>
          <p className="cl-p">
            Merlin is a data exchange for fractional operators, at merlin.revenuenomad.com. It is run by Revenue Nomad, a firm of fractional executives. In this policy,
            &quot;we&quot; and &quot;us&quot; mean Revenue Nomad, and &quot;members&quot; means people with a Merlin account.
          </p>
          <p className="cl-p">
            This policy says what Merlin collects, where it comes from, how it is used, who receives it, how long it is kept and how to remove it. It is written from
            Merlin&apos;s code. Questions? <ContactLine support={support} subject="Privacy question" />
          </p>
        </>
      ),
    },
    {
      id: "collect",
      title: "What we collect and where it comes from",
      body: (
        <>
          <h3 className="df-h3">From you, when you are a member</h3>
          <ul className="df-bullets">
            <li>Your account: your email address, your name, and the sign-in links and codes we email you.</li>
            <li>Your profile: your title, your function, your goal, the clients you serve and the kind of client you look for, and your choices on emails and alerts.</li>
            <li>What you add to the exchange: facts about companies, seats, people and rates. These are your contributions. See &quot;What other members see&quot; below.</li>
            <li>Your messages to other members, and the reports you make about a message.</li>
            <li>Your pipeline: the companies you reached out to, its stages, your notes and follow-ups.</li>
            <li>Your proposals: drafts, the lines you accept from a call, and what you send for signature. A call&apos;s transcript is read in your browser and never sent to Merlin. Only the lines you accept are saved.</li>
            <li>Your writing voice, if you set it: a few style choices, such as how you open and close a note.</li>
            <li>Your plan and payments: your plan, its dates and the amounts paid. Stripe holds the card.</li>
          </ul>
          <h3 className="df-h3">From public sources, about companies</h3>
          <ul className="df-bullets">
            <li>Company websites: about texts, careers pages, a company&apos;s icon, and who leads each function. Merlin reads robots.txt first for these pages.</li>
            <li>
              The names and titles of company leaders, as a company prints them on its own website. Merlin keeps these names only for companies with their headquarters in
              the United States, only for a function&apos;s leader and the company&apos;s top leader, and never for someone who asked us to remove them.
            </li>
            <li>Public job boards and the public job feeds of applicant tracking systems, for open fractional roles.</li>
            <li>SEC EDGAR&apos;s public Form D filings, for funding events at companies already on Merlin.</li>
          </ul>
          <h3 className="df-h3">Names on seats</h3>
          <p className="cl-p">
            A seat is a fractional role at a company. The name of the person who held it comes from members, or from Revenue Nomad&apos;s research of public professional
            profiles for people based in the United States. A name from research is marked as not yet confirmed until the person claims the seat, two members confirm it,
            or we check it. We may write to someone named on a seat so they can claim it or take their name off. Anyone can take their name off a seat at{" "}
            <a href="/remove">Remove my name</a>, with no account.
          </p>
          <h3 className="df-h3">From Google, only if you connect it</h3>
          <p className="cl-p">
            Read-only access to your calendar and contacts. Exactly what Merlin reads, and what it never reads, is in <a href="#google">Google user data</a>.
          </p>
          <h3 className="df-h3">From your LinkedIn export, only if you upload it</h3>
          <p className="cl-p">
            You can upload the Connections.csv file from your own LinkedIn data export. Merlin keeps each connection&apos;s first and last name, company, position, the day you
            connected, their profile address, and their email when LinkedIn included it. It is used only to show you your own ways into companies. Only you see it, and you
            can delete it at any time.
          </p>
          <h3 className="df-h3">From people who sign a proposal</h3>
          <p className="cl-p">
            When a member sends a proposal for signature, Merlin keeps the signer&apos;s name, email and title as the member entered them. When the signer opens, confirms
            and signs it, Merlin records the time, their IP address and device (browser), the email code they confirmed, their typed name, the consent they agreed to, and
            a fingerprint (SHA-256) of the exact document. This audit trail is kept with the signed copy and shared with both parties.
          </p>
          <h3 className="df-h3">When you use the site</h3>
          <p className="cl-p">
            Merlin sets a sign-in cookie for members, and short-lived cookies while you connect Google or Slack. It saves a few preferences in your browser&apos;s own
            storage. It uses your IP address, in memory only, to limit how often requests can be made. Merlin loads no outside scripts, fonts, analytics, trackers or ad tags.
          </p>
        </>
      ),
    },
    {
      id: "use",
      title: "How we use it",
      body: (
        <ul className="df-bullets">
          <li>To run the exchange: show members what is known about companies, seats and open roles, and keep the credits fair.</li>
          <li>To show you your own warm paths, your network, your pipeline and Crystal Ball, ranked for you.</li>
          <li>To send the emails and alerts you asked for, and the ones the service needs, such as sign-in links and plan notices.</li>
          <li>To take payment for Pro and top-ups.</li>
          <li>To send proposals for signature and keep the signed record.</li>
          <li>To keep Merlin safe: limit abuse, review a reported message, and fix problems.</li>
          <li>To count how Merlin is used, as totals only. Admins see counts for private features, never a member&apos;s network, pipeline or notes.</li>
        </ul>
      ),
    },
    {
      id: "never",
      title: "What we never do",
      body: (
        <ul className="df-bullets">
          <li>We never sell personal data.</li>
          <li>We never use Google data for advertising, and we show no ads.</li>
          <li>We never use any data to train AI models. Merlin&apos;s server calls no AI model and sends nothing to a model provider.</li>
          <li>We never show your Google data, your LinkedIn import, your pipeline or your writing voice to another member.</li>
          <li>We never read the text or subject of an email, or a meeting&apos;s title, description or location.</li>
        </ul>
      ),
    },
    {
      id: "google",
      title: "Google user data",
      body: (
        <>
          <p className="lg-key">
            {LU_BEFORE}
            <a href={GOOGLE_POLICY_URL}>{LU_LINK}</a>
            {LU_AFTER}
          </p>
          <p className="cl-p">Connecting Google is optional. Merlin asks for read-only access. It never changes, sends or deletes anything in your Google account.</p>
          <h3 className="df-h3">What Merlin reads</h3>
          <ul className="df-bullets">
            <li>Your Google account&apos;s email address, so we know which account you connected.</li>
            <li>
              Calendar events (read-only): when each event starts, whether it was cancelled, and its guests: their email address, name, whether they accepted, and who sent the
              invite. Never an event&apos;s title, description, location or attachments. Merlin asks Google to leave those out, so they never reach Merlin.
            </li>
            <li>Your list of calendars (read-only): to find the other calendars you own besides your main one. Merlin reads at most 10 calendars in all.</li>
            <li>Your contacts (read-only): each saved contact&apos;s name, email addresses, company and job title.</li>
            <li>Your other contacts (read-only): the names and email addresses of people Google keeps as other contacts, such as people you emailed who aren&apos;t saved.</li>
            <li>
              Gmail, only for members we invite to test it: the From, To, Cc and Date lines of your messages, and the lines that mark bulk mail. Never a subject, a snippet, the
              text of an email or an attachment.
            </li>
          </ul>
          <p className="cl-p">Merlin reads the past 24 months and the next 30 days of your calendar, and reads again about once a day while you stay connected.</p>
          <h3 className="df-h3">How Merlin uses it</h3>
          <p className="cl-p">
            Google data is used only to show you your own warm paths, meetings and pipeline: who you know at companies on Merlin, how recently you were in touch, meetings that
            move your own pipeline, seats your calendar suggests you held (nothing is added unless you confirm it), and Crystal Ball ranked by the people you really know.
          </p>
          <h3 className="df-h3">What Merlin keeps</h3>
          <p className="cl-p">
            Conclusions, not your calendar or address book. For each company on Merlin: counts and dates of meetings and contacts, and up to 8 people there with their name,
            email and title. A limited list of people you know well at companies not on Merlin. What you said about a company or a person, such as &quot;Not a
            relationship&quot;. And the Google access token, encrypted.
          </p>
          <h3 className="df-h3">What Merlin never does with it</h3>
          <ul className="df-bullets">
            <li>Show it to other members. Admins see counts only, such as how many members connected Google.</li>
            <li>Sell it.</li>
            <li>Use it for advertising.</li>
            <li>Use it to train AI models, ours or anyone else&apos;s.</li>
            <li>Add it to shared counts, other members&apos; results or Crystal Ball&apos;s shared model.</li>
            <li>
              Let people read it. Humans at Revenue Nomad don&apos;t read your Google data, except with your permission, for security (such as looking into abuse), or as the
              law requires.
            </li>
          </ul>
          <h3 className="df-h3">Transfers</h3>
          <p className="cl-p">
            Merlin transfers Google data to no one, with one exception you control: if you add Merlin&apos;s connector to your own AI assistant and ask it about your
            network, Merlin answers with the companies you know people at, how warm each is and when you were last in touch. It never sends your contacts&apos; names or email
            addresses that way. See <a href="#assistant">Your own AI assistant</a>.
          </p>
          <h3 className="df-h3">Disconnecting</h3>
          <p className="cl-p">
            On Your network, Disconnect and delete everything revokes Merlin&apos;s access at Google and deletes everything Merlin kept from your Google account. You can
            also remove Merlin in your Google Account&apos;s security settings: that stops Merlin&apos;s access, and what Merlin already worked out stays on Your network until
            you choose Disconnect and delete everything. Entries in Your pipeline are yours and stay until you remove them, with the contact&apos;s name and title on an entry
            and the dates it moved.
          </p>
        </>
      ),
    },
    {
      id: "assistant",
      title: "Your own AI assistant",
      body: (
        <>
          <p className="cl-p">
            You can add Merlin to your own AI assistant, such as Claude or ChatGPT, with Merlin&apos;s connector. Your assistant then asks Merlin&apos;s tools as you, after you
            say yes, and gets only what those tools return to you: what you would see in the app, with the same locks and credits.
          </p>
          <p className="cl-p">
            What your assistant&apos;s provider does with those answers is set by your own account with that provider. Merlin itself calls no AI model. You can see and
            disconnect every assistant you added in Your credits, under Connected apps.
          </p>
          <p className="cl-p">
            Your assistant can also save things to Merlin for you, if you ask it to: conclusions about your network from your own inbox, or your writing voice. Merlin
            refuses email text. Only you see what it saved, and you can delete it on Your network.
          </p>
        </>
      ),
    },
    {
      id: "share",
      title: "Who we share it with",
      body: (
        <>
          <p className="cl-p">We share personal data only with the services that run Merlin for us, each for its own job:</p>
          <ul className="df-list">
            {PROCESSORS.map((p) => (
              <li key={p.who}>
                <h3 className="df-h3">{p.who}</h3>
                <p>{p.gets}</p>
              </li>
            ))}
          </ul>
          <p className="cl-p">
            Company websites, job boards and SEC EDGAR receive Merlin&apos;s requests for public pages. No member data goes with them. The full list, with what each service
            receives, is on <a href="/data">Where your data goes</a>.
          </p>
          <p className="cl-p">
            We may also share information when the law requires it, or to protect members, the public or Revenue Nomad from harm or fraud. If Revenue Nomad is part of a
            merger or sale, member data may move with Merlin, still under this policy, and we will tell members first.
          </p>
        </>
      ),
    },
    {
      id: "members",
      title: "What other members see",
      body: (
        <ul className="df-bullets">
          <li>Facts you add to a company, a seat or a person become part of the exchange. Other members see them free or for a credit, depending on the fact.</li>
          <li>The seats you hold, with your name, to members who unlock who held them.</li>
          <li>
            In the Fractionals directory, your first name and last initial until you choose. You can show your full name, seats and clients, or leave the directory, in Your
            profile. You can also turn off Show me in Referral partners.
          </li>
          <li>Your messages, to the member you write to. A message you report goes to the admins on its own. They never read the rest of the conversation.</li>
          <li>Messaging on Merlin never shows your email address or phone number to the other member.</li>
        </ul>
      ),
    },
    {
      id: "keep",
      title: "How long we keep it, and how to delete it",
      body: (
        <ul className="df-bullets">
          <li>Your account and what you add: while your account is open.</li>
          <li>Google: until you disconnect. Disconnect and delete everything, on Your network, deletes all of it at once and revokes Merlin&apos;s access at Google.</li>
          <li>Gmail, for test members: Drop Gmail deletes what it found.</li>
          <li>What your assistant saved: Delete on Your network removes it.</li>
          <li>Your LinkedIn import: Delete removes the file and everything worked out from it. Uploading a new file replaces the old one.</li>
          <li>Your name on a seat, or as a company&apos;s leader: <a href="/remove">Remove my name</a> takes it off at once, and it stays off.</li>
          <li>A fact you just added: Undo takes it back, with its credit, until someone unlocks or confirms it.</li>
          <li>A signed proposal and its audit trail: kept with the signed copy for both parties.</li>
          <li>
            Closing your account: there is no button for this yet. <ContactLine support={support} subject="Close my Merlin account" /> We will close it, delete your private data and
            tell you what we have to keep, such as payment records.
          </li>
          <li>Backups: deleted data can remain in backup copies until those are deleted. Copies on Merlin&apos;s own server are kept for 14 days.</li>
        </ul>
      ),
    },
    {
      id: "rights",
      title: "Your choices",
      body: (
        <p className="cl-p">
          You can see and change most of your data in Merlin, and switch each email and alert on or off in Notifications. To ask for a copy of your data, a correction or a
          deletion, <ContactLine support={support} subject="My data on Merlin" /> Depending on where you live, the law may give you more rights, and we will honour them.
        </p>
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <ul className="df-bullets">
          <li>Merlin is served over HTTPS.</li>
          <li>Google access tokens are encrypted at rest (AES-256-GCM), opened only on the server when Merlin talks to Google, and never logged or sent to a browser.</li>
          <li>Tokens for connected assistants are stored only as one-way hashes. Access tokens last an hour.</li>
          <li>Card details go to Stripe directly and never reach Merlin.</li>
          <li>Private data, such as your network and pipeline, is checked by automated tests never to show in another member&apos;s view, the shared table or the export.</li>
          <li>No method is perfect. If we learn of a breach that affects your data, we will tell you as the law requires.</li>
        </ul>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: <p className="cl-p">Merlin is for professionals. It is not for anyone under 18, and we do not knowingly collect data from anyone under 18.</p>,
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: (
        <p className="cl-p">
          When this policy changes, we update the effective date and version at the top. If a change matters to how your data is used, we tell members by email or in Merlin
          before it takes effect. We will never use Google data in a new way without asking you first.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p className="cl-p">
          Revenue Nomad runs Merlin. For anything about this policy or your data, <ContactLine support={support} subject="Privacy question" />
        </p>
      ),
    },
  ];
  return (
    <LegalShell
      title="Privacy Policy"
      version={PRIVACY_VERSION}
      intro={
        <p className="cl-p">
          The short version: Merlin never sells personal data, never uses data to train AI models, and never shows your Google data, your network or your pipeline to anyone
          else.
        </p>
      }
      parts={parts}
      other={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
