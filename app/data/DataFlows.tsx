/**
 * Where Merlin's data goes: a plain answer, from the code, to where data leaves Merlin's server,
 * whether any of it trains an AI model, what each outside service receives, and who can switch
 * each part off. Public, no account needed. The same content, with notes for the owner, is in
 * docs/data-flows.md: keep the two in step. Phone first. Its styles are imported by page.tsx.
 */
import { Brand } from "../ui/shared";
import { DISCLOSURE_LONG, disclosureText } from "@/lib/close/types";

type Service = { who: string; gets: string; why: string; when?: string };

/** Every outside service Merlin's server talks to. */
const SERVICES: Service[] = [
  {
    who: "Company websites",
    gets: "A request from Merlin's server for public pages: a company's homepage, its team or leadership pages, its careers page, its icon, and a website a member pastes into the Add form. No member data goes with it.",
    why: "About texts, who leads each function and the company (their name and title as the company prints them, kept only for companies with a US headquarters), open roles, a company's icon, and finding a company's website. Merlin also reads the email addresses that fractionals publish on their own business websites, US only, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at /remove. Page reads check robots.txt first.",
  },
  {
    who: "Job boards and applicant tracking systems",
    gets: "Requests for public job listings: fractionaljobs.io, findfractionaljobs.com, Remotive, Remote OK, We Work Remotely, and the public job feeds of Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio, Breezy HR and Teamtailor. For a company on Merlin, the board name Merlin tries for it, made from its website or name. freehire.me's job API only when its key is set. No member data.",
    why: "The weekly scan of open fractional roles, and checking whether a role is still open.",
  },
  {
    who: "SEC EDGAR (sec.gov)",
    gets: "Requests for the day's Form D filings, with a User-Agent that names Merlin and a contact address. No member data.",
    why: "Funding events for companies already on Merlin.",
    when: "Only while the funding run is on.",
  },
  {
    who: "Google",
    gets: "Only for a member who connects Google: their sign-in and Merlin's read requests, sent with that member's own token. Merlin asks for calendar events without their title, description, location or attachments, for contacts' names, email addresses, companies and titles, and, if the member adds Gmail, only the From, To, Cc and Date headers. Never a subject, a snippet or an email's text.",
    why: "To show that member their own network inside Merlin.",
    when: "Only while the Google feature is on, and only for members who connect.",
  },
  {
    who: "Resend (email)",
    gets: "Each email Merlin sends: the address, the subject and the text. Sign-in links and codes, a note that a member wrote to you with the first 200 characters of their message, a lead or a team-up a fellow fractional sent you through Peers with their note, the weekly email, Crystal Ball emails, plan notices, proposals and their reminders to the person who signs, and proposal alerts to the member who sent it.",
    why: "Sending Merlin's email.",
    when: "Only while email is set up.",
  },
  {
    who: "Stripe (payments)",
    gets: "At checkout: the member's email address, an opaque reference that is not their name or id, and the plan. Card details go to Stripe directly. Merlin never sees them.",
    why: "Taking payment for Pro and top-ups.",
    when: "Only while billing is on.",
  },
  {
    who: "Slack, and webhooks a member adds",
    gets: "The alerts that member turned on: new roles, messages, seats, Crystal Ball and their proposal alerts (opened, a new reader, time to follow up, signed, renewal), with the companies that member can see and links back to Merlin. Company icons in Slack come from Merlin's own address.",
    why: "Alerts where the member asked for them.",
    when: "Only for members who connect Slack or add a webhook.",
  },
  {
    who: "Backup storage",
    gets: "A daily copy of Merlin's data file, in a storage bucket the owner sets up.",
    why: "Restoring Merlin if its server's disk is lost.",
    when: "Only when a backup bucket is set.",
  },
  {
    who: "Railway (hosting)",
    gets: "Merlin's server and its data run on Railway.",
    why: "Hosting.",
  },
  {
    who: "AI assistants a member connects",
    gets: "Answers to that member's own assistant, only what Merlin's tools return to that member. When an assistant first connects, Merlin reads the assistant's own public sign-in details from its address.",
    why: "Using Merlin from Claude or ChatGPT.",
    when: "Only for members who add the connector.",
  },
];

export function DataFlows() {
  return (
    <div className="cl">
      <header className="cl-top">
        <a className="cl-brand" href="/" aria-label="Merlin, by Revenue Nomad">
          <Brand dark size={36} />
        </a>
      </header>
      <main className="cl-main df-main">
        <article className="cl-card df-card">
          <h1 className="cl-h">Where Merlin&apos;s data goes</h1>
          <p className="cl-p">
            Merlin is run by Revenue Nomad. This page says what leaves Merlin&apos;s server, where it goes and why, and who can switch each part off. It is written from
            Merlin&apos;s code.
          </p>

          <section className="df-sec" aria-labelledby="df-ai">
            <h2 className="df-h" id="df-ai">
              When an AI model is used
            </h2>
            <p className="cl-p">
              Merlin&apos;s server calls no AI model, with one exception a member turns on: drafting a proposal with Claude. Then that one draft&apos;s inputs (the call&apos;s
              transcript or notes, the template, the company&apos;s facts the member can see, the rate range, their name, title and writing voice) go to Anthropic&apos;s
              API to write it. Merlin keeps the draft, not the transcript. It is off unless Revenue Nomad switches it on, and each member agrees before their first draft.
            </p>
            <p className="cl-p">
              To meter each member&apos;s monthly AI usage, Merlin keeps for each draft only how much it used, as numbers: never a word of the call or the draft. You see
              the share of this month&apos;s AI usage you have used in Plan and billing.
            </p>
            <p className="cl-p">
              AI comes in only when a member adds Merlin to their own assistant, such as Claude or ChatGPT, with Merlin&apos;s connector. The assistant then asks
              Merlin&apos;s tools as that member, and gets only what those tools return to that member: what they would see in the app, with the same locks and credits. That
              happens under the member&apos;s own account with their assistant.
            </p>
            <p className="cl-p">A member can see every assistant they connected, and disconnect it, in Your credits under Connected apps.</p>
          </section>

          <section className="df-sec" aria-labelledby="df-train">
            <h2 className="df-h" id="df-train">
              Does any of it train someone&apos;s AI model?
            </h2>
            <p className="cl-p">Merlin sends no data to model providers, so nothing from Merlin goes into their training.</p>
            <p className="cl-p">
              Google user data is used under the Google API Services User Data Policy, including its Limited Use requirements. It is never sold, never used for ads and
              never used to train AI models. It is used only to show a member their own network, and is never shown to another member or an admin. Merlin never reads
              an email&apos;s text or subject, or a meeting&apos;s title.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-who">
            <h2 className="df-h" id="df-who">
              Who receives what
            </h2>
            <p className="cl-p">
              Your browser only talks to Merlin. The app loads no outside scripts, fonts, trackers or icons. Company icons are read by Merlin&apos;s server from each
              company&apos;s own website and sent from Merlin&apos;s own address.
            </p>
            <ul className="df-list">
              {SERVICES.map((s) => (
                <li key={s.who}>
                  <h3 className="df-h3">{s.who}</h3>
                  <p>
                    <strong>Gets:</strong> {s.gets}
                  </p>
                  <p>
                    <strong>Why:</strong> {s.why}
                  </p>
                  {s.when && <p className="df-when">{s.when}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className="df-sec" aria-labelledby="df-peers">
            <h2 className="df-h" id="df-peers">
              Inside Merlin: Peers
            </h2>
            <p className="cl-p">
              When you pass a lead to another fractional, team up with one on a company, or post in a circle, Merlin keeps who, which company and what you wrote. Only
              the members in it see it: the two of you for a lead or a team-up, a circle&apos;s members for its posts. None of it goes to an outside service, except the
              email that tells the other member, and Revenue Nomad&apos;s copy for admins leaves out what members wrote.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-ways">
            <h2 className="df-h" id="df-ways">
              Inside Merlin: Your way in
            </h2>
            <p className="cl-p">
              When you go with a route into a company, Merlin keeps your plan: which route, when you chose it, the step you are on, your plan B, and what happened at
              each step. It keeps who the route goes through as codes, never as names, and works the names out each time it shows you the plan. Only you see your plan.
            </p>
            <p className="cl-p">
              What happened at each step is also counted without anyone in it (how many people were in between, how warm each link was, whether the last person decides),
              so the estimate gets better as members record what worked. No member, company or person is in those counts. Deleting your Google network or your contacts
              file deletes the plans that went through them. When you close your account they stay for the 30 days you can bring it back, then all of them are deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-readers">
            <h2 className="df-h" id="df-readers">
              Inside Merlin: proposal readers
            </h2>
            <p className="cl-p">{DISCLOSURE_LONG}</p>
            <p className="cl-p">
              What is collected: that the proposal or document was opened, which section or page and which price option was on screen while the reader was active, in
              seconds, an option picked, an add-on chosen, and a download. A random id in a cookie, sent only to Merlin&apos;s own address for this, tells one
              reader&apos;s browser from another, so a forward opened somewhere else counts as a new reader. Merlin keeps only a scrambled form of that id, never the IP
              address and never a fingerprint of the device. Nothing is counted once it is signed, declined, withdrawn or expired.
            </p>
            <p className="cl-p">
              Why: so the member who sent it knows when it was opened and what was read, and when to follow up. Only that member sees it. It is kept with the proposal,
              capped, and deleted with it. The page tells the client, near its foot: &ldquo;{disclosureText()}&rdquo;
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-check">
            <h2 className="df-h" id="df-check">
              Inside Merlin: signed copies and Check a copy
            </h2>
            <p className="cl-p">
              When a proposal or document is signed, Merlin keeps the final PDF on its own storage, private to the two sides, and seals it: a fingerprint of the file
              (SHA-256), signed with Merlin&apos;s own key. Anyone can check a copy at /check, with no account. The PDF dropped there is read in memory to work out its
              fingerprint, compared with the sealed records, and never stored, logged or sent anywhere. The answer says only whether it matches, and if so who signed and when.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-off">
            <h2 className="df-h" id="df-off">
              Who can switch it off
            </h2>
            <h3 className="df-h3">You</h3>
            <ul className="df-bullets">
              <li>Google: Your network, Disconnect and delete everything. Merlin revokes its access at Google and deletes what it kept about your network, and what came from Google on Your pipeline. If you remove Merlin in your Google Account instead, Merlin deletes the same 30 days later unless you reconnect.</li>
              <li>Assistants: Your credits, Connected apps. Disconnect any assistant you added.</li>
              <li>Your way in: drop a plan from its page. Your deal stays in your pipeline.</li>
              <li>Email: the weekly email and message emails each have a switch in Your credits. Crystal Ball emails have an unsubscribe link. Peers emails have a switch in Notifications.</li>
              <li>Peers: mute a member, or leave a circle.</li>
              <li>Slack and webhooks: remove them in Integrations.</li>
              <li>Proposal alerts: each one on or off for Slack, email and Merlin in Notifications. Reminders to the person who signs: off for each proposal on its activity page.</li>
              <li>Your name on a seat, and an email read from your own website: take them off at Remove my name, no account needed.</li>
              <li>A fact you just added: Undo takes it back, with its credit, until someone unlocks or confirms it.</li>
              <li>Your account: Close my account, on Your credits. It closes at once (signed out, out of Peers and the directory, no more email) and can be brought back for 30 days. After 30 days Merlin deletes your personal data: your profile, your Google connection and the connections file you uploaded, your network, your pipeline and plans for a way in, the messages you wrote, proposals and documents, AI usage log and saved views. Facts you added to companies stay, with your name taken off.</li>
            </ul>
            <h3 className="df-h3">Revenue Nomad</h3>
            <p className="cl-p">Each part that talks to an outside service has its own server switch, and stays off until it is turned on, except where noted:</p>
            <ul className="df-bullets">
              <li>Google network: off unless turned on.</li>
              <li>Leadership pages from company websites: off unless turned on.</li>
              <li>Finding company websites: off unless turned on.</li>
              <li>About texts from company websites: off unless turned on.</li>
              <li>Funding from SEC filings: off unless turned on.</li>
              <li>The weekly scan of job boards: off unless turned on.</li>
              <li>The weekly email: on while email is set up, with its own off switch.</li>
              <li>Crystal Ball: on, with its own off switch.</li>
              <li>Company icons: on, with its own off switch.</li>
              <li>Payments: off unless turned on.</li>
            </ul>
            <p className="cl-p">An admin can also set each automatic job to off in Pilot metrics.</p>
          </section>

          <p className="cl-help">
            Questions? Write to us from <a href="https://revenuenomad.com">revenuenomad.com</a>. See also the <a href="/privacy">Privacy Policy</a> and the{" "}
            <a href="/terms">Terms of Service</a>.
          </p>
          <a className="cl-link" href="/">
            Open Merlin
          </a>
        </article>
      </main>
    </div>
  );
}
