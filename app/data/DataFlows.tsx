/**
 * Where Merlin's data goes: a plain answer, from the code, to where data leaves Merlin's server,
 * whether any of it trains an AI model, what each outside service receives, and who can switch
 * each part off. Public, no account needed. The same content, with notes for the owner, is in
 * docs/data-flows.md: keep the two in step. Phone first. Its styles are imported by page.tsx.
 */
import { Brand } from "../ui/shared";
import { DISCLOSURE_LONG, disclosureText, signedDisclosureText } from "@/lib/close/types";

type Service = { who: string; gets: string; why: string; when?: string };

/** Every outside service Merlin's server talks to. */
const SERVICES: Service[] = [
  {
    who: "Company websites",
    gets: "A request from Merlin's server for public pages: a company's homepage, its team or leadership pages, its careers page, its icon, and a website a member pastes into the Add form. No member data goes with it.",
    why: "About texts, who leads each function and the company (their name and title as the company prints them, kept only for companies with a US headquarters, and never for a person in California), open roles, a company's icon, and finding a company's website. Merlin also reads the email addresses that fractionals publish on their own business websites, US only and never for a person in California, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at /remove. Page reads check robots.txt first.",
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
    who: "Granola",
    gets: "Only for a member who connects Granola: with Connect Granola, the member signs in at Granola and says yes there, and Merlin gets an access token for their calls; or, as a fallback, the member pastes their own Granola API key. When the member opens the call picker, Merlin asks Granola for their recent meetings with a company's web address or a person's email on the invite, and reads when each call was and who was on it. Only when the member picks a call does Merlin read its transcript, to draft that one proposal. Merlin never reads a call the member didn't pick. Merlin keeps the access and refresh tokens, or the key, encrypted, and nothing else from Granola: no note, title, summary or transcript.",
    why: "Starting a proposal from a call the member recorded in Granola, and the member's call workflows.",
    when: "Only while the Granola feature is on, and only for members who connect it.",
  },
  {
    who: "Fathom",
    gets: "Only for a member who pastes their own Fathom API key, sent with each request. For a member with a call workflow on, Merlin asks Fathom every few minutes for the calls that ended since it last looked, when they ended and who was invited, and reads one call's transcript for that run. Merlin keeps the key, encrypted, and nothing else from Fathom: no call, title, invitee or transcript.",
    why: "Building what the member agreed on a call, as drafts for them.",
    when: "Only while the Fathom feature is on, and only for members who connect it.",
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
              Merlin&apos;s server calls no AI model, with one exception: Merlin drafting or changing a proposal for a member. Then that one request&apos;s inputs (the call&apos;s
              transcript or notes, pasted or picked from Granola, the template, the company&apos;s facts the member can see, the rate range, their name, title and writing voice) go to Anthropic&apos;s
              API to write it. Merlin keeps the draft, not the transcript. It is off unless Revenue Nomad switches it on, and each member agrees before their first draft.
            </p>
            <p className="cl-p">
              The same switch lets Merlin draft a reply in Messages, once a member agrees: that one conversation&apos;s messages, what it is about as the member sees it (a company
              still locked for them is never named) and their writing voice go to Anthropic&apos;s API, and the draft comes back to their message box. Merlin keeps no word of it.
              Otherwise &quot;Draft with Merlin&quot; fills the box from a template in the member&apos;s voice, with no AI. An unsent draft stays in the member&apos;s own browser.
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
            <p className="cl-p">A member can see every assistant they connected, and disconnect it, in Your credits under Connected apps, or on Agent access.</p>
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
              Inside Merlin: Fractionals and Peers
            </h2>
            <p className="cl-p">
              When you pass a lead to another fractional, team up with one on a company, or post in a circle, Merlin keeps who, which company and what you wrote. Only
              the members in it see it: the two of you for a lead or a team-up, a circle&apos;s members for its posts. None of it goes to an outside service, except the
              email that tells the other member, and Revenue Nomad&apos;s copy for admins leaves out what members wrote.
            </p>
            <p className="cl-p">
              Your card in Fractionals can carry one line about you and where you are based, both written by you and optional, and whether you are open to
              leads. Members see the line and the place only while you are in the directory; leave them empty and nothing shows. Emails, links and phone
              numbers are refused there, because members write to you in Messages. Turn Open to leads off and nobody can pass you a company. A fractional who
              stays out of the directory, or hides their name on their seats, is not listed to other members at all. All of it is deleted with your profile when you close your account.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-known">
            <h2 className="df-h" id="df-known">
              Inside Merlin: who you know
            </h2>
            <p className="cl-p">
              You can bring in who you know from three places, each on its own: your Google contacts and calendar, your connections file, and any contacts
              CSV. The two files need no Google. Merlin matches the people in them to the companies it holds, so you see who you know there and your ways in. A
              connections file with names and profile links only is matched by the profile link alone, to a person on file with that same profile, never by a name.
            </p>
            <p className="cl-p">
              A contacts CSV is read in your browser first. Merlin guesses which columns are the name, company, title and email, shows you a preview, and you can
              change its guess. Only those four columns are sent to Merlin: every other column of your file stays on your computer. Merlin keeps the name, company,
              title and email of each person, and when you added the file. Never the file itself.
            </p>
            <p className="cl-p">
              Only you see the people you bring in. They are never shown to another member or an admin, never in Revenue Nomad&apos;s copy for admins, and never named
              to an assistant you connect. When you mark someone Not a relationship, Merlin keeps only that you did. You can delete your connections file or your
              contacts file at any time, and every way in found from it goes with it.
            </p>
            <p className="cl-p">
              Suggested additions (when Revenue Nomad turns it on): after you bring in your connections file or a contacts CSV, Merlin can list the people in
              it who look like a leader at a company on Merlin with nobody like that on file. Nothing is added unless you tick it. For each person you tick, only
              their name, title and that they decide go on the company&apos;s record, never an email, a phone or anything else from your file, and you earn 1 credit
              within the daily limit. Your Google contacts are never used for this. Nobody at a company based in California or outside the United States is
              suggested, and anyone can take their name off at Remove my name.
            </p>
            <p className="cl-p">
              Your connections export, the whole archive: it is read in your browser, never uploaded. Merlin opens only the files it uses (connections,
              invitations, your positions, messages, recommendations, endorsements, companies you follow, your posts and comments, and skills) and never
              opens the rest: logins, security, receipts, phone numbers, email addresses, ads data, what the service infers about you, searches, job
              applications, learning, events, reactions, your profile summary, education and notes. You see that list and tick what Merlin may use.
            </p>
            <p className="cl-p">
              From the messages file, your browser counts only how many messages you and each person sent each other and the first and last day; the words,
              subjects and attachments never leave your device. Pending invitations are kept as weaker ties by profile link. Recommendations and endorsements
              mark the people who vouched for you, matched by name and company together, never a name alone. Your positions become seats you can confirm one by one,
              and the companies you follow there become companies you can follow here: nothing is added until you tick it. If you tick them, your posts set
              your writing voice (only the style is kept, never a post), and the recommendations you received are kept as proof in your Evidence Bank by first
              name and company. Only you see any of it, and Remove in Settings deletes all of it.
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
              so the estimate gets better as members record what worked. No member, company or person is in those counts. Deleting your Google network, your connections file
              or your contacts file deletes the plans that went through them. When you close your account they stay for the 30 days you can bring it back, then all of them are deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-notes">
            <h2 className="df-h" id="df-notes">
              Inside Merlin: your notes on a company
            </h2>
            <p className="cl-p">
              On a company&apos;s page you can keep private notes: what you learned, who said what, when to come back. Merlin keeps the text you typed and when you
              wrote or changed it. Only you see your notes. They are not in anyone else&apos;s view, in what your assistant can read, in an email or in Revenue
              Nomad&apos;s copy for admins, and none of it goes to an outside service. Remove a note from the page at any time. When you close your account they stay
              for the 30 days you can bring it back, then they are deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-evidence">
            <h2 className="df-h" id="df-evidence">
              Inside Merlin: your Evidence Bank
            </h2>
            <p className="cl-p">
              On Close you can keep up to 50 case studies of your work: the client, the problem, what you did, the numbers before and after as you typed them, and
              the type of work. The client is hidden unless you choose to name it: it reads as a short description, like a health care company of its size, and
              its name is taken out of the words wherever a case is used. Only you see your cases. They are not in anyone else&apos;s view or in Revenue
              Nomad&apos;s copy for admins. When you start a proposal, Merlin puts your one or two closest ready cases in its Proof part, read as above, and you can
              swap them or take them out before it goes; the proposal keeps which of your cases it holds, so the case can show where it was used. A case goes onto
              your Fractionals card only when you put it there.
            </p>
            <p className="cl-p">
              Merlin writes a case by joining your answers. Only if you switch on writing with Merlin and agree, your answers and anything you paste go to Merlin&apos;s
              AI service for that one request; what you paste is never kept, and no number goes into a case unless you gave it. Remove a case at any time. When
              you close your account they stay for the 30 days you can bring it back, then they are deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-alerts">
            <h2 className="df-h" id="df-alerts">
              Inside Merlin: your alerts and the bell
            </h2>
            <p className="cl-p">
              An alert watches one of your lists, or the companies you follow, or the people you know. When something changes, a new role, a seat that ended, a
              new leader on a company&apos;s website, a fact, or a raise as its SEC filing says it, Merlin tells you by email, in Slack or in the bell, as you
              set it. The bell keeps your newest 200 lines: what happened, when, and where it opens. A company you haven&apos;t opened is described, never
              named. Someone you know changed jobs reads only your own contacts and matches a whole name and a new company, never a guess.
            </p>
            <p className="cl-p">
              Merlin also counts the alerts it sends, by channel and number, for 90 days, so the page can say how many went since your last visit. The count
              never holds what an alert said. Only you see your bell and your alerts, and none of it is in Revenue Nomad&apos;s copy for admins beyond those
              counts. Every alert email has a link that turns that alert off in one click. When you close your account they are deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-workflows">
            <h2 className="df-h" id="df-workflows">
              Inside Merlin: your workflows (Beta)
            </h2>
            <p className="cl-p">
              A workflow is an alert that also does the next step: add the company to your pipeline, find your way in, remind you, open the company or who
              decides there, or draft a note. It runs on what your alerts already watch, as you, through the same actions and at the same prices as the app.
              Each run is quoted before it spends and spends exactly that. You can set a monthly limit: past it the run waits in the bell until you say yes.
              Every credit a workflow spends shows in your credit history with the workflow&apos;s name.
            </p>
            <p className="cl-p">
              Nothing is ever sent to a client or a contact: a note is a draft in Messages, for you to copy. A run&apos;s line describes a company you
              haven&apos;t opened, never names it, and never names someone in California. A name from your Google account stays on your own screens. Only you
              see your workflows and their runs; Revenue Nomad&apos;s copy for admins keeps the workflows themselves and none of their runs or drafts. They are
              deleted with your personal data when you close your account.
            </p>
            <p className="cl-p">
              A call workflow runs when a call ends in your call recorder (Granola or Fathom). Merlin matches the company by the email of who was on the
              call, reads the transcript for that run and never keeps it, and builds what you agreed to send as drafts for you: a proposal or an SOW in
              Proposals, a follow-up email or a deck outline in Messages, or a summary and a prompt for your own Claude. Nothing goes to your client. Where
              Merlin&apos;s AI reads the call, the transcript goes to Anthropic for that request alone, as with a proposal draft, and it counts against your
              AI usage. For Claude, Merlin keeps the call&apos;s summary and what was agreed for 30 days, and the transcript only reaches your Claude if you
              tick it, read from your recorder at that moment.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-agent">
            <h2 className="df-h" id="df-agent">
              Inside Merlin: your agents
            </h2>
            <p className="cl-p">
              On Agent access you can switch off any of the tools your assistant uses, a whole group or one at a time, and set how many credits all your
              assistants together may spend in a day. Spending credits and sending for signature always ask you first, whatever you switch. A tool you switched
              off tells your assistant so, and does nothing.
            </p>
            <p className="cl-p">
              Merlin keeps a log of what your assistants did for 90 days: which tool, when, which assistant, the credits it spent and what came of it. Never what
              it asked for or what came back: no search, no company, no name. Only you see it. It is not in Revenue Nomad&apos;s copy for admins, and none of it goes
              to an outside service. When you close your account it stays for the 30 days you can bring it back, then it is deleted with your personal data.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-crystal">
            <h2 className="df-h" id="df-crystal">
              Inside Merlin: tuning your Crystal Ball
            </h2>
            <p className="cl-p">
              In Crystal Ball you can say which kinds of signal count more or less for you, and take a company out of your ball with a reason. Merlin keeps the weights
              you changed, and each company you took out with your reason and when. They change only your own Crystal Ball and its email. None of it goes to an outside
              service or to another member. Reset your weights or bring a company back at any time. When you close your account they are deleted with your personal
              data after the 30 days you can bring it back.
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
              address and never a fingerprint of the device. Nothing is read once it is signed, declined, withdrawn or expired: after a signature only a download of
              the signed PDF from its page is counted, and that page says so.
            </p>
            <p className="cl-p">
              Why: so the member who sent it knows when it was opened and what was read, and when to follow up. Only that member sees it. It is kept with the proposal,
              capped, and deleted with it. The page tells the client, near its foot: &ldquo;{disclosureText()}&rdquo; Once signed it reads: &ldquo;{signedDisclosureText()}&rdquo;
            </p>
            <p className="cl-p">
              Reminders: until it is signed or declined, Merlin emails the person who signs for the member, 2 days after it was sent if it isn&apos;t opened, 7 days
              after if it isn&apos;t signed, and 2 days before the link closes. The member can switch each one off as they send and afterwards. A link works for 30
              days unless the member picks 14, 60 or 90 days or no end date; a link with no end date gets no warning before it closes.
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
            <p className="cl-p">
              A member&apos;s saved signature (the words they typed, or a drawing) is kept privately on Merlin&apos;s own storage, for that member alone. Each time it is
              applied, to a proposal as it goes out, as a countersignature, or to a document they sign themselves, a copy goes with that signed record and the audit
              trail says when and how. The member can replace or delete it at any time, and it is deleted with their account&apos;s personal data. A client who
              draws their signature on a proposal has the drawing kept with that signed proposal and stamped into its sealed PDF. A contract a member saves to
              reuse keeps its PDF and where its fields go, never the other side&apos;s names or emails.
            </p>
            <p className="cl-p">
              On the client&apos;s page, a question is emailed to the member (its first 300 characters go on the audit trail), and a client can pass the proposal to
              someone else to sign: the name, title and email they give are kept with the proposal, that person gets their own link, and the member is told.
            </p>
          </section>

          <section className="df-sec" aria-labelledby="df-off">
            <h2 className="df-h" id="df-off">
              Who can switch it off
            </h2>
            <h3 className="df-h3">You</h3>
            <ul className="df-bullets">
              <li>Your connections file and your contacts file: People, Bring in who you know, or Your network. Each has its own Delete, and every way in found from it goes with it.</li>
              <li>Your connections export: Settings, Connections, Remove. Everything it brought in is deleted, with the ways in found from it.</li>
              <li>Google: Your network, Disconnect and delete everything. Merlin revokes its access at Google and deletes what it kept about your network, and what came from Google on Your pipeline. If you remove Merlin in your Google Account instead, Merlin deletes the same 30 days later unless you reconnect.</li>
              <li>Assistants: Your credits, Connected apps, or Integrations. Disconnect any assistant you added. On Agent access: Revoke an assistant, switch off its tools, or set a daily spend limit for all of them.</li>
              <li>Fathom: Settings, Connections, Remove. Merlin deletes your key at once, and closing your account does the same. You can revoke the key in Fathom too.</li>
              <li>Granola: Integrations, Disconnect (or Settings, Connections). Merlin asks Granola to end its access and deletes it at once, and closing your account does the same. If you connected a key, revoke it in Granola as well, under Settings, Connectors, API keys.</li>
              <li>Your way in: drop a plan from its page. Your deal stays in your pipeline.</li>
              <li>Your notes on a company: remove any note from the company&apos;s Notes and activity tab.</li>
              <li>Your Evidence Bank: remove any case, hide its client, or take it off your card, on the Evidence Bank page.</li>
              <li>Crystal Ball: Reset in Tune puts every weight back, and Bring it back in Not in your ball returns a company you took out.</li>
              <li>Email: the weekly email and message emails each have a switch in Your credits. Crystal Ball emails have an unsubscribe link. Peers emails have a switch in Notifications.</li>
              <li>Peers: mute a member, or leave a circle.</li>
              <li>Slack and webhooks: remove them in Integrations.</li>
              <li>Proposal alerts: each one on or off for Slack, email and Merlin in Notifications. Reminders to the person who signs: off for each proposal on its activity page.</li>
              <li>Your name on a seat, and an email read from your own website: take them off at Remove my name, no account needed.</li>
              <li>A fact you just added: Undo takes it back, with its credit, until someone unlocks or confirms it.</li>
              <li>Your account: Close my account, on Your credits. It closes at once (signed out, out of Peers and the directory, no more email) and can be brought back for 30 days. After 30 days Merlin deletes your personal data: your profile, your Google connection, the connections file, connections export and contacts file you brought in, your network, your pipeline and plans for a way in, your notes on companies, your Evidence Bank, your alerts and the bell, the messages you wrote, proposals and documents, AI usage log and saved views. Facts you added to companies stay, with your name taken off.</li>
            </ul>
            <h3 className="df-h3">Revenue Nomad</h3>
            <p className="cl-p">Each part that talks to an outside service has its own server switch, and stays off until it is turned on, except where noted:</p>
            <ul className="df-bullets">
              <li>Google network: off unless turned on.</li>
              <li>Granola: off unless turned on.</li>
              <li>Fathom: off unless turned on.</li>
              <li>Call workflows (a call ends): off unless turned on.</li>
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
