/**
 * The Privacy Policy (/privacy) and Terms of Service (/terms), against a running server (BASE):
 * both render with their effective date and version, the Privacy Policy carries Google's Limited
 * Use sentence word for word with its link and a #google part, the support address from
 * RN_SUPPORT_EMAIL (SUPPORT_EMAIL), the Terms' numbers are the billing rules' own and its sender's
 * duty the proposals' own, no em dashes and no owner notes on either page, the governing law
 * Connecticut's with disputes in its state and federal courts, and the landing page, the signing page, Your credits and each
 * Connect Google link to them. Also the verification kit (docs/google-verification.md): every
 * scope, the Limited Use sentence, and nothing that looks like a secret.
 *
 *   BASE=http://localhost:4600 SUPPORT_EMAIL=support-qa@example.com npx tsx scripts/test-legal.mts
 */
import { readFileSync } from "node:fs";
import { EXTEND_DAYS, PRICES, TIER_NAME, TOPUP_CREDITS, TRIAL_LABEL } from "../lib/billing/rules";
import { CLOSE_ADDS, PLANS, PLAN_ROWS } from "../lib/billing/compare";
import { SENDER_DUTY } from "../lib/proposals/types";
import { MAIN_SCOPES, SCOPE_GMAIL } from "../lib/google/config";
import { GOOGLE_POLICY_URL, LIMITED_USE } from "../app/privacy/Privacy";
import { DISPUTE_COURTS, GOVERNING_LAW, PRO_LEAVES_OUT_SAY, SIGN_LINK_DAYS } from "../app/terms/Terms";
import { LEGAL_EFFECTIVE, LEGAL_EFFECTIVE_WORDS, PRIVACY_VERSION, TERMS_VERSION } from "../app/legal/LegalShell";

const BASE = (process.env.BASE || "http://localhost:4600").replace(/\/+$/, "");
const SUPPORT = process.env.SUPPORT_EMAIL || "";
let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== undefined ? `\n     ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}` : ""}`);
};
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** The page's words, as a reader sees them: tags out, entities decoded, spaces folded. */
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
/** The page's body markup only (no Next.js payload scripts, which repeat the words). */
const bodyOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, "");

async function get(path: string): Promise<{ status: number; html: string }> {
  const r = await fetch(BASE + path, { redirect: "manual", headers: { accept: "text/html" } });
  return { status: r.status, html: await r.text() };
}

async function main() {
  console.log("The Privacy Policy");
  const p = await get("/privacy");
  const pb = bodyOf(p.html);
  const pt = textOf(p.html);
  check("/privacy answers 200", p.status === 200, p.status);
  check("its title and heading", /<title>Privacy Policy · Merlin<\/title>/.test(p.html) && pt.includes("Privacy Policy"));
  check("the effective date and version", pb.includes(`dateTime="${LEGAL_EFFECTIVE}"`) && pt.includes(`Effective ${LEGAL_EFFECTIVE_WORDS}`) && pt.includes(`Version ${PRIVACY_VERSION}`) && LEGAL_EFFECTIVE === "2026-11-22");
  check(
    "Google's Limited Use sentence, word for word",
    LIMITED_USE === "Merlin's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements." && pt.includes(LIMITED_USE),
    (pt.match(/.{0,80}Limited Use requirements.{0,10}/) ?? [])[0],
  );
  check("it links the User Data Policy", GOOGLE_POLICY_URL === "https://developers.google.com/terms/api-services-user-data-policy" && pb.includes(`href="${GOOGLE_POLICY_URL}"`));
  check("a Google user data part at #google", /<section[^>]*id="google"/.test(pb) && pt.includes("Google user data"));
  check(
    "it says Google data is for the member alone: never other members, sold, ads, AI training; humans only with permission, security or law",
    ["Show it to other members", "Sell it", "Use it for advertising", "Use it to train AI models", "except with your permission, for security", "as the law requires", "your own warm paths, meetings and pipeline"].every((t) => pt.includes(t)),
  );
  check("it says what is never read: titles, descriptions, locations, subjects, text", ["Never an event's title, description, location or attachments", "Never a subject, a snippet, the text of an email"].every((t) => pt.includes(t)));
  check("each source: members, public company websites, job boards, Google, the LinkedIn export, signers", ["From you, when you are a member", "Company websites", "job boards", "From Google, only if you connect it", "From your LinkedIn export, only if you upload it", "From people who sign a proposal"].every((t) => pt.includes(t)));
  check("every processor is named", ["Railway", "Backup storage", "Resend", "Stripe", "Slack", "Google", "Your own AI assistant"].every((t) => pt.includes(t)));
  check(
    "Merlin drafting: Anthropic named as the AI service, the transcript and the draft's inputs go to its API, it doesn't train on them, and Merlin doesn't keep the transcript",
    pt.includes("Anthropic (the AI service that writes Merlin's drafts)") && pt.includes("If Merlin drafts it for you, the transcript and the draft's inputs are sent to Anthropic's API") && pt.includes("don't let it train its models") && pt.includes("are not kept by Merlin") && pt.includes("A transcript Merlin drafts from: not kept"),
  );
  check("documents to sign: stored privately, for the member and the people they send it to", pt.includes("Documents you upload to be signed") && pt.includes("stored privately on Merlin's server") && pt.includes("a proposal or a document for signature") && pt.includes("drawn signature"));
  check("the version was bumped for it", PRIVACY_VERSION === "1.3");
  // Close as merged (Privacy 1.3): readers and the notice, reminders, link length, sealed PDFs and Check a copy, the member's saved signature, Granola.
  check(
    "the policy carries Close as merged: readers told on the page and a download after signing, reminders, link length, the sealed PDF and Check a copy, the saved signature, Granola's key encrypted and nothing else kept, off until switched on",
    [
      "The page says so near its foot",
      "only a download of the signed PDF from its page is, and that page says so too",
      "2 days after it was sent if it hasn't been opened, 7 days after if it hasn't been signed, and 2 days before the link closes",
      "A signing link works for 30 days unless the sender picked another length (14, 60 or 90 days) or no end date",
      "The PDF is sealed: a fingerprint of the file (SHA-256), signed with Merlin's own key",
      "is never stored, logged or sent anywhere",
      "Your saved signature, if you set one",
      "Only you can apply it",
      "Your Granola key, if you connect Granola: kept encrypted",
      "no note, title, summary or transcript",
      "used to draft that one proposal, and not kept",
      "Granola on Merlin stays off until Revenue Nomad switches it on",
      "the option and add-ons they picked",
    ].every((x) => pt.includes(x)) && pt.includes("Granola") && /Granola[\s\S]{0,200}Only if you connect Granola with your own Granola API key/.test(pt),
  );
  check("never sells, never trains, the server calls no AI model", pt.includes("We never sell personal data") && pt.includes("We never use any data to train AI models") && pt.includes("calls no AI model"));
  check("deletion: Disconnect, the LinkedIn import, Remove my name, closing an account", ["Disconnect and delete everything", "Delete removes the file", "Remove my name", "Closing your account"].every((t) => pt.includes(t)));
  // Own sites (lib/ownsites): one plain sentence, in the policy, the data page and the doc (since version 1.2).
  const ownLine = "Merlin also reads the email addresses that fractionals publish on their own business websites";
  check(
    "own sites: the policy says Merlin reads the emails fractionals publish on their own business websites, US only, to invite them and show members, removable at /remove",
    PRIVACY_VERSION === "1.3" &&
      pt.includes(`${ownLine}, for people in the United States only, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at Remove my name.`) &&
      src("app/data/DataFlows.tsx").includes(`${ownLine}, US only and never for a person in California, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at /remove.`) &&
      src("docs/data-flows.md").includes("the email addresses that fractionals publish on their own business websites, US only and never for a person in California by their own location (`lib/california.ts`), to invite them to join Merlin or claim their seats and to show members, and anyone can remove their name and email at `/remove`"),
  );
  check(
    "deletion of Google data: the pipeline is cleared too, and access removed at Google means deleted after 30 days",
    ["That includes what came from Google on Your pipeline", "An entry Merlin opened from your Gmail alone is deleted", "without the contact's name, title or email from Google", "If you don't reconnect within 30 days of that date, Merlin deletes what it read from Google", "Merlin deletes it 30 days after it finds the access removed"].every((t) => pt.includes(t)),
  );
  check(
    "no caveat that pipeline entries keep Google names, or that revoked data is kept",
    !/stay until you remove them, with the contact|stays on Your network until you choose|keeps what it already worked out/.test(pt) && !/keeps what it already worked out until/.test(src("docs/google-verification.md")),
  );
  check("the verification kit and the data page say the 30-day rule", /30 days/.test(src("docs/google-verification.md")) && /30 days later unless you reconnect/.test(src("app/data/DataFlows.tsx")) && /30 days/.test(src("docs/data-flows.md")));
  check("not for under 18", pt.includes("not for anyone under 18"));
  check(SUPPORT ? `the support address (${SUPPORT}) from RN_SUPPORT_EMAIL` : "no support address set: it says revenuenomad.com", SUPPORT ? pb.includes(`mailto:${SUPPORT}`) : pt.includes("Write to us from revenuenomad.com"));
  check("no owner notes and no em dashes", !/To confirm|—/.test(pt), (pt.match(/.{30}(To confirm|—).{30}/) ?? [])[0]);
  check("LinkedIn only as the member's own export", (pt.match(/LinkedIn/g) ?? []).length > 0 && [...pt.matchAll(/[^.]*LinkedIn[^.]*\./g)].every((m) => /your own LinkedIn|LinkedIn export|LinkedIn included|LinkedIn import/i.test(m[0])), [...pt.matchAll(/[^.]*LinkedIn[^.]*\./g)].map((m) => m[0]));
  check("it links Terms, the data page and Remove my name", ['href="/terms"', 'href="/data"', 'href="/remove"'].every((t) => pb.includes(t)));

  console.log("\nThe Terms of Service");
  const t = await get("/terms");
  const tb = bodyOf(t.html);
  const tt = textOf(t.html);
  check("/terms answers 200", t.status === 200, t.status);
  check("its title and heading", /<title>Terms of Service · Merlin<\/title>/.test(t.html) && tt.includes("Terms of Service"));
  check("the effective date and version", tb.includes(`dateTime="${LEGAL_EFFECTIVE}"`) && tt.includes(`Effective ${LEGAL_EFFECTIVE_WORDS}`) && tt.includes(`Version ${TERMS_VERSION}`));
  // The Terms changed again for Close (reading activity and reminders, options, sealed PDFs, the member's own signature, contracts, Merlin's drafting by Anthropic, Granola): version 1.2, effective the same day.
  check("the Terms' version was bumped for it: 1.2, effective November 22, 2026", TERMS_VERSION === "1.2" && LEGAL_EFFECTIVE === "2026-11-22" && LEGAL_EFFECTIVE_WORDS === "November 22, 2026" && tt.includes("Version 1.2") && !tt.includes("Version 1.1"));
  check(
    "the Terms carry Close as merged: reading activity told to the client, reminders and their switches, link length, options, the sealed PDF and /check, the member's signature, contracts, Anthropic, Granola off until switched on",
    [
      "tells your client so on the page",
      "only a download of the signed PDF is counted",
      "2 days after you send it if it isn't opened, 7 days after if it isn't signed, and 2 days before the link closes (never for a link with no end date)",
      "You can turn each reminder off as you send and afterwards",
      "(14, 60 or 90 days, or no end date)",
      "up to three options, and add-ons",
      "Anyone can check a copy at /check",
      "with a signature you save once; only you can apply it",
      "your saved signature can go on in one click",
      "Merlin reads it to find where everyone signs and places the fields",
      "written by an AI service, Anthropic, through its API",
      "Merlin reads a call's transcript from your Granola only when you pick that call to draft from, and doesn't keep it",
      "Granola on Merlin is off until Revenue Nomad switches it on",
    ].every((x) => tt.includes(x)),
  );
  check("the Terms' plans say the pipeline row as compare.ts does: You move it, Moves to Won when they sign", tt.includes("Pipeline after a signature: You move it.") && tt.includes("Pipeline after a signature: Moves to Won when they sign.") && !/Moves itself when they sign|moving itself/.test(tt));
  check(
    "the plans' numbers are the billing rules' own",
    [`$${PRICES.month} a month or $${PRICES.year} a year`, `$${PRICES.closeMonth} a month or $${PRICES.closeYear} a year`, `$${PRICES.topup} for ${TOPUP_CREDITS} credits`, `A ${TRIAL_LABEL} when you finish onboarding`, `${EXTEND_DAYS} days longer`].every((x) => tt.includes(x)),
  );
  // Pro and Close in the Terms are lib/billing/compare.ts's own: each plan's price and line, and its column of every row.
  const planText = (k: "pro" | "close") => {
    const from = tb.indexOf(`data-terms-plan="${k}"`);
    const to = k === "pro" ? tb.indexOf('data-terms-plan="close"') : tb.indexOf("Top-up", from);
    return from < 0 || to < 0 ? "" : textOf(tb.slice(from, to));
  };
  const [proT, closeT] = [planText("pro"), planText("close")];
  check(
    "Terms and lib/billing/compare.ts agree: Pro's and Close's names, prices, lines and every row",
    (["pro", "close"] as const).every((k) => {
      const p = PLANS.find((x) => x.key === k)!;
      const t = k === "pro" ? proT : closeT;
      return t.includes(p.name) && t.includes(`$${p.month} a month or $${p.year} a year. ${p.line}`) && PLAN_ROWS.every((r) => t.includes(`${r[0]}: ${r[k === "pro" ? 2 : 3]}.`));
    }),
    [proT.slice(0, 400), closeT.slice(0, 400)],
  );
  check(
    "Pro can't send for signature in the Terms; Close can",
    proT.includes(`${PRO_LEAVES_OUT_SAY} are not on ${TIER_NAME.pro}`) && /^Sending for signature/.test(PRO_LEAVES_OUT_SAY) && !/sending proposals for signature/i.test(proT) && CLOSE_ADDS.every(([what]) => closeT.includes(what.toLowerCase())) && closeT.includes("send and get signed"),
    proT,
  );
  check("the sender's duty, word for word from the proposals", tt.includes(SENDER_DUTY));
  check("signing links' days match the server's", /export const SIGN_DAYS = (\d+);/.exec(src("lib/proposals/store.ts"))?.[1] === String(SIGN_LINK_DAYS) && tt.includes(`Signing links work for ${SIGN_LINK_DAYS} days`));
  check("contributions, acceptable use, as is, the connector, cancellation, liability", ["give Revenue Nomad a worldwide", "scrape", "resell", "harass", "anti-spam", "A likely email is a guess", "The connector and your AI assistant", "You can cancel at any time", "Limitation of liability"].every((x) => tt.includes(x)));
  check("no refund is promised", tt.includes("Payments are not refunded") && !/we (will )?refund|full refund/i.test(tt));
  check(
    "governing law: the State of Connecticut, disputes in the state and federal courts located in Connecticut, no placeholder",
    GOVERNING_LAW === "the State of Connecticut" && DISPUTE_COURTS === "the state and federal courts located in Connecticut" && tt.includes("governed by the laws of the State of Connecticut") && tt.includes("heard in the state and federal courts located in Connecticut") && !/To confirm|State of ___|\[STATE\]/.test(tt),
  );
  check("no owner notes and no em dashes", !tt.includes("To confirm") && !tt.includes("—"), (tt.match(/.{30}—.{30}/) ?? [])[0]);
  check("it links the Privacy Policy", tb.includes('href="/privacy"'));

  console.log("\nWhere they are linked");
  // The landing page is drawn in the browser (app/Root.tsx), so its footer is checked in its source: next to the data page's link.
  const home = await get("/");
  const foot = /<footer className="lp-foot">[\s\S]*?<\/footer>/.exec(src("app/landing/Landing.tsx"))?.[0] ?? "";
  check("the landing page's footer links Privacy and Terms, next to the data page", home.status === 200 && /href="\/data"[\s\S]{0,120}href="\/privacy"[\s\S]{0,80}href="\/terms"/.test(foot), home.status);
  const sign = await get("/sign/not-a-real-link");
  check("the signing page links Privacy and Terms", sign.status === 200 && bodyOf(sign.html).includes('href="/privacy"') && bodyOf(sign.html).includes('href="/terms"'), sign.status);
  const signed = await get("/signed/not-a-real-link");
  check("the signed copy links Privacy and Terms", bodyOf(signed.html).includes('href="/privacy"') && bodyOf(signed.html).includes('href="/terms"'), signed.status);
  const settings = src("app/post/Settings.tsx");
  check("Your credits' data card links both", /export function DataLink[\s\S]*href="\/privacy"[\s\S]*href="\/terms"/.test(settings) && src("app/post/Credits.tsx").includes("<DataLink />"));
  const net = src("app/post/network/Network.tsx");
  check(
    "each Connect Google has How Merlin uses your Google data, to /privacy#google",
    net.includes('href="/privacy#google"') && net.includes("How Merlin uses your Google data") && (net.match(/<GooglePolicyLink \/>/g) ?? []).length >= 3,
    (net.match(/<GooglePolicyLink \/>/g) ?? []).length,
  );
  const flat = (f: string) => src(f).replace(/\s+/g, " ");
  check(
    "the data page and its notes say the AI usage metering: numbers only, never a word of the call or the draft",
    flat("app/data/DataFlows.tsx").includes("Merlin keeps for each draft only how much it used, as numbers: never a word of the call or the draft") && src("docs/data-flows.md").includes("never a word of the call or the draft") && src("docs/data-flows.md").includes("`State.aiUsage`"),
  );
  check(
    "the data page and its notes say Peers: shown to the members in it, nothing outside but the email, the export without what members wrote",
    flat("app/data/DataFlows.tsx").includes("Inside Merlin: Fractionals and Peers") && flat("app/data/DataFlows.tsx").includes("Only the members in it see it") && flat("app/data/DataFlows.tsx").includes("leaves out what members wrote") && src("docs/data-flows.md").includes("## 4. Inside Merlin: Peers") && src("docs/data-flows.md").includes("leaves out what members wrote"),
  );
  check("the data page links both", src("app/data/DataFlows.tsx").includes('href="/privacy"') && src("app/data/DataFlows.tsx").includes('href="/terms"'));

  console.log("\nThe verification kit");
  const kit = src("docs/google-verification.md");
  check("it has every scope Merlin asks for, Gmail's apart", [...MAIN_SCOPES.filter((s) => s.startsWith("https://")), SCOPE_GMAIL].every((s) => kit.includes(s)));
  check("the URLs and the Limited Use sentence", ["https://merlin.revenuenomad.com/privacy", "https://merlin.revenuenomad.com/terms", "revenuenomad.com", LIMITED_USE].every((s) => kit.includes(s)));
  check("the demo video, CASA, and the recommendation", kit.includes("Demo video") && kit.includes("CASA") && /Calendar and Contacts now/i.test(kit));
  check("nothing that looks like a secret or a real client id", !/GOCSPX-|\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com|sk_live_|re_[A-Za-z0-9]{20,}/.test(kit));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
