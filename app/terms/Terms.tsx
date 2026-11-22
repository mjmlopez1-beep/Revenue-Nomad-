/**
 * Merlin's Terms of Service. The paid plans (Pro and Close) are drawn from lib/billing/compare.ts
 * PLANS and PLAN_ROWS, the rows the plans sheet and the landing page read, so the Terms say what
 * each plan really does. The numbers are read from the rules the server runs (lib/billing/rules.ts,
 * lib/tableFields.ts EARN_CAP, lib/proposals SIGN_DAYS and SENDER_DUTY), so the page can't drift from
 * what Merlin does. Cancellation and refunds say only what the billing code does: a paid plan runs to the end
 * of the period paid for, then Free, and Merlin makes no refunds of its own. The governing law is
 * Connecticut's, where Revenue Nomad is registered (GOVERNING_LAW), with disputes in the state and
 * federal courts located in Connecticut.
 */
import { EXTEND_DAYS, FREE_MCP_PER_DAY, FREE_SAVED_VIEWS, PAUSE_MONTHS, PRICES, TIER_NAME, TOPUP_CREDITS, TRIAL_LABEL } from "@/lib/billing/rules";
import { CLOSE_ADDS, PLANS, PLAN_ROWS, PRO_LEAVES_OUT } from "@/lib/billing/compare";
import { EARN_CAP, REFERRAL_BONUS } from "@/lib/tableFields";
import { SENDER_DUTY } from "@/lib/proposals/types";
import { ContactLine, LegalShell, TERMS_VERSION, type Part } from "../legal/LegalShell";

/** Revenue Nomad is registered in Connecticut: its law governs these terms. */
export const GOVERNING_LAW = "the State of Connecticut";
/** Where disputes are heard. */
export const DISPUTE_COURTS = "the state and federal courts located in Connecticut";
/** "Sending for signature, your own templates, Claude drafting and the pipeline moving itself when they sign". */
const sayList = (xs: readonly string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** What Pro leaves out that Close has, in the Terms' words (lib/billing/compare.ts PRO_LEAVES_OUT). */
export const PRO_LEAVES_OUT_SAY = sayList(PRO_LEAVES_OUT.map((x, i) => (i ? x.charAt(0).toLowerCase() + x.slice(1) : x)));

/** A paid plan in the Terms: its price and line from PLANS, and its column of PLAN_ROWS. */
function PaidPlan({ k }: { k: "pro" | "close" }) {
  const p = PLANS.find((x) => x.key === k)!;
  const col = k === "pro" ? 2 : 3;
  return (
    <li data-terms-plan={k}>
      <h3 className="df-h3">{p.name}</h3>
      <p>
        ${p.month} a month or ${p.year} a year. {p.line}
      </p>
      <ul className="df-bullets">
        {PLAN_ROWS.map((r) => (
          <li key={r[0]}>
            {r[0]}: {r[col]}.
          </li>
        ))}
      </ul>
      {k === "pro" ? (
        <p>
          {PRO_LEAVES_OUT_SAY} are not on {TIER_NAME.pro}. They are on {TIER_NAME.close}.
        </p>
      ) : (
        <p>
          What {TIER_NAME.close} adds to {TIER_NAME.pro}: {CLOSE_ADDS.map(([what]) => what.toLowerCase()).join("; ")}.
        </p>
      )}
    </li>
  );
}

/** How long a signing link works (lib/proposals/store.ts SIGN_DAYS; that module reads the server's state, so the number is repeated here and checked by scripts/test-legal.mts). */
export const SIGN_LINK_DAYS = 30;

export function TermsView({ support, starter }: { support: string | null; starter: number }) {
  const law = GOVERNING_LAW;
  const parts: Part[] = [
    {
      id: "agree",
      title: "These terms",
      body: (
        <>
          <p className="cl-p">
            These terms are an agreement between you and Revenue Nomad, which runs Merlin at merlin.revenuenomad.com. By creating an account or using Merlin, you agree to
            them. If you use Merlin for a company, you agree for that company too.
          </p>
          <p className="cl-p">
            Merlin is for professionals, for business use. You must be at least 18. Our <a href="/privacy">Privacy Policy</a> says how we handle personal data and is part of
            these terms.
          </p>
        </>
      ),
    },
    {
      id: "service",
      title: "The service",
      body: (
        <p className="cl-p">
          Merlin is a data exchange for fractional operators. Members share what they know about fractional work, such as which companies hired fractionals, for which seat,
          who held it and what it paid, and earn credits for it. They spend credits to see what other members and Revenue Nomad added. Merlin also shows open fractional
          roles, company facts from public sources, and, for each member, their own network, pipeline and proposals. We may change, add or remove features over time.
        </p>
      ),
    },
    {
      id: "plans",
      title: "Plans and credits",
      body: (
        <>
          <ul className="df-list">
            <li>
              <h3 className="df-h3">Free</h3>
              <p>
                {starter} credits to start. You earn 1 credit for each missing fact you add, up to {EARN_CAP} a day. {FREE_SAVED_VIEWS} saved view with the weekly email, the
                median rates in the benchmarks, and {FREE_MCP_PER_DAY} requests a day through the connector.
              </p>
            </li>
            <li>
              <h3 className="df-h3">Trial</h3>
              <p>
                A {TRIAL_LABEL} when you finish onboarding, with no card: everything in {TIER_NAME.close} while it runs. It may run {EXTEND_DAYS} days longer, once. When it
                ends you are on Free, and nothing is charged unless you chose {TIER_NAME.pro} or {TIER_NAME.close}.
              </p>
            </li>
            <PaidPlan k="pro" />
            <PaidPlan k="close" />
            <li>
              <h3 className="df-h3">Top-up</h3>
              <p>
                ${PRICES.topup} for {TOPUP_CREDITS} credits, once, on any plan.
              </p>
            </li>
          </ul>
          <p className="cl-p">
            Seeing a locked fact costs 1 credit. Unlocking a company costs 2. Merlin shows the cost before you spend. Credits are a way to use Merlin. They have no cash value,
            and can&apos;t be sold, transferred or exchanged for money. Credits you earned for a fact that turns out not to be true, or that you take back, can be taken back.
            Invite credits ({REFERRAL_BONUS} each) are paid as Merlin describes when you invite someone.
          </p>
          <p className="cl-p">
            Paid plans and trials apply only while we offer them. Prices may change. We will tell you before a new price applies to your plan.
          </p>
        </>
      ),
    },
    {
      id: "paid",
      title: "Paid plans and cancellation",
      body: (
        <ul className="df-bullets">
          <li>Stripe takes the payment. A paid plan ({TIER_NAME.pro} or {TIER_NAME.close}) renews by itself each month or each year, until you cancel.</li>
          <li>You can cancel at any time in Plan and billing. Your plan carries on to the end of the period you paid for, then you are on Free. Nothing more is charged.</li>
          <li>If you chose a paid plan during your trial, nothing is charged until the trial ends. Cancel before then and nothing is charged.</li>
          <li>You can pause your plan for {PAUSE_MONTHS} month: Free with no charge, then your plan comes back by itself.</li>
          <li>Invoices and your card are in Stripe&apos;s billing portal, from Plan and billing.</li>
          <li>Payments are not refunded, in full or in part, except where the law requires it.</li>
          <li>Credits you hold stay on your account when you move to Free. Top-up credits don&apos;t expire.</li>
        </ul>
      ),
    },
    {
      id: "contributions",
      title: "What you add",
      body: (
        <>
          <p className="cl-p">
            Merlin works because members give to get. When you add a fact, such as a company, a seat, a person, a rate or why a company hired, you keep any rights you have in
            it. You give Revenue Nomad a worldwide, non-exclusive, royalty-free, lasting licence to store, use, copy, correct, combine, show and share it as part of Merlin,
            including to other members for credits, and to keep using it after you leave.
          </p>
          <p className="cl-p">You confirm that what you add:</p>
          <ul className="df-bullets">
            <li>is true, to the best of your knowledge;</li>
            <li>is yours to share: not confidential, not covered by a non-disclosure agreement, and not something a client or employer asked you to keep private;</li>
            <li>breaks no law and no one else&apos;s rights, including privacy rights.</li>
          </ul>
          <p className="cl-p">
            We may check, correct, hide or remove anything added to Merlin, and take back the credits it earned, for example when it is wrong, duplicated, or someone asked to
            be removed.
          </p>
        </>
      ),
    },
    {
      id: "use",
      title: "Acceptable use",
      body: (
        <>
          <p className="cl-p">You agree not to:</p>
          <ul className="df-bullets">
            <li>scrape, crawl or bulk-copy Merlin, or collect its data by automated means, other than through the connector within its limits;</li>
            <li>resell, publish or give away Merlin&apos;s data, or use it to build a competing database or service;</li>
            <li>get around the locks, credits, limits or security, share your sign-in link, or open more than one account;</li>
            <li>harass, threaten or mislead anyone, or pretend to be someone else;</li>
            <li>send spam, or outreach that breaks anti-spam or privacy law, such as the CAN-SPAM Act. Honour every request to stop, and say who you are;</li>
            <li>use what you see on Merlin to decide on someone&apos;s employment, credit, insurance or housing;</li>
            <li>add anything false, unlawful or that you aren&apos;t allowed to share.</li>
          </ul>
          <p className="cl-p">Outreach you send from what you find on Merlin is yours. You are responsible for following the law that applies to it.</p>
        </>
      ),
    },
    {
      id: "data",
      title: "The data is as is",
      body: (
        <>
          <p className="cl-p">
            Merlin&apos;s data comes from members, public company websites, public job listings and other public sources. It can be wrong, out of date or incomplete. We
            don&apos;t promise that any fact, rate, name or role is right.
          </p>
          <ul className="df-bullets">
            <li>A likely email is a guess from the pattern other emails at the company follow. It is never checked.</li>
            <li>Rates are what members reported or a posting gave. They are not offers.</li>
            <li>Crystal Ball&apos;s likelihood is an estimate, not a promise that a company will hire.</li>
          </ul>
          <p className="cl-p">Check what matters before you rely on it.</p>
        </>
      ),
    },
    {
      id: "connector",
      title: "The connector and your AI assistant",
      body: (
        <p className="cl-p">
          You can add Merlin to your own AI assistant with Merlin&apos;s connector. Your assistant then acts as you, with your plan, locks and credits. Merlin&apos;s tools say
          what a credit opens and ask before spending one. You are responsible for what you ask your assistant to do, and for your own terms with its provider. Merlin
          doesn&apos;t control the assistant or what its provider does with the answers. You can disconnect an assistant at any time in Your credits, under Connected apps.
        </p>
      ),
    },
    {
      id: "connections",
      title: "Google, LinkedIn and other connections",
      body: (
        <p className="cl-p">
          Connecting Google, uploading your LinkedIn connections, or adding Slack or a webhook is optional. What Merlin reads, keeps and never does with them is in the{" "}
          <a href="/privacy">Privacy Policy</a>. Upload only your own export. You can disconnect or delete each one at any time.
        </p>
      ),
    },
    {
      id: "proposals",
      title: "Proposals and e-signature",
      body: (
        <>
          <p className="cl-p">
            Merlin helps you write a proposal and send it to your client to sign online. When your client signs, Merlin records their consent, their typed name, the email code
            they confirmed, the time, their IP address and device, and a fingerprint of the exact document, and keeps the signed copy and its audit trail for you both.
            Signing links work for {SIGN_LINK_DAYS} days.
          </p>
          <p className="cl-p">Before you send, you confirm what Merlin asks of every sender:</p>
          <p className="lg-key">{SENDER_DUTY}</p>
          <p className="cl-p">
            You are responsible for whether a document suits electronic signature, for its content, and for following the law where you and your client are. The templates are
            a starting point, not legal advice. Revenue Nomad is not a party to the agreement between you and your client.
          </p>
        </>
      ),
    },
    {
      id: "account",
      title: "Your account",
      body: (
        <ul className="df-bullets">
          <li>Your sign-in link is personal. Keep it to yourself. If you think someone else has it, sign out other devices in Your credits.</li>
          <li>You are responsible for what is done with your account.</li>
          <li>Messages to other members must be about fractional work and respectful. A member can block you or report a message.</li>
        </ul>
      ),
    },
    {
      id: "ending",
      title: "Ending",
      body: (
        <>
          <p className="cl-p">
            You can stop using Merlin at any time. Close my account, on Your credits, closes your account at once: you are signed out, you leave Peers and the
            Fractionals directory, and Merlin stops emailing you. For 30 days you can bring it back with the link we email you when it closes, or by writing to us,
            and so can we. After 30 days Merlin deletes your personal data, and the account can&apos;t come back. A paid plan stops renewing when the account closes.
            You can also ask us to close it: <ContactLine support={support} subject="Close my Merlin account" />
          </p>
          <p className="cl-p">
            We may suspend or close an account that breaks these terms, puts members or Merlin at risk, or that the law requires us to. We may also stop offering Merlin, and
            will tell members first. When an account closes, its credits end with it. What you added to the exchange stays, under the licence above, with your name
            taken off once your personal data is deleted.
          </p>
        </>
      ),
    },
    {
      id: "ours",
      title: "What is ours",
      body: (
        <p className="cl-p">
          Merlin&apos;s software, design, name and the database as a whole belong to Revenue Nomad. These terms let you use Merlin. They don&apos;t give you any other right in
          it.
        </p>
      ),
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      body: (
        <p className="cl-p">
          Merlin is provided as is and as available. To the extent the law allows, we give no warranties of any kind, including that Merlin is accurate, fit for a purpose,
          uninterrupted or free of errors. Nothing on Merlin is legal, financial or tax advice.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: (
        <>
          <p className="cl-p">
            To the extent the law allows, Revenue Nomad is not liable for any indirect, incidental, special or consequential loss, or for lost profits, revenue, clients or
            data, arising from Merlin or these terms.
          </p>
          <p className="cl-p">
            Our total liability for any claim about Merlin or these terms is limited to the greater of what you paid us for Merlin in the 12 months before the claim, or $100.
          </p>
          <p className="cl-p">
            You agree to cover Revenue Nomad for claims by others that come from what you added to Merlin, the outreach you sent, or your breaking these terms.
          </p>
        </>
      ),
    },
    {
      id: "law",
      title: "Governing law",
      body: (
        <p className="cl-p">
          These terms are governed by the laws of {law}, without regard to its conflict of law rules. Any dispute will be heard in {DISPUTE_COURTS}, unless the law
          where you live says otherwise.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: (
        <p className="cl-p">
          When these terms change, we update the effective date and version at the top. If a change matters, we tell members by email or in Merlin before it takes effect.
          Using Merlin after that means you accept the new terms.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p className="cl-p">
          Revenue Nomad runs Merlin. For anything about these terms, <ContactLine support={support} subject="Merlin's terms" />
        </p>
      ),
    },
  ];
  return (
    <LegalShell
      title="Terms of Service"
      version={TERMS_VERSION}
      intro={
        <p className="cl-p">
          The short version: add only what you are allowed to share, use the data fairly and lawfully, check what matters before you rely on it, and cancel a paid plan whenever you
          like.
        </p>
      }
      parts={parts}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
