/**
 * The Privacy Policy (/privacy) and Terms of Service (/terms), against a running server (BASE):
 * both render with their effective date and version, the Privacy Policy carries Google's Limited
 * Use sentence word for word with its link and a #google part, the support address from
 * RN_SUPPORT_EMAIL (SUPPORT_EMAIL), the Terms' numbers are the billing rules' own and its sender's
 * duty the proposals' own, no em dashes and no owner notes on either page (but the governing law's
 * placeholder while it is unset), and the landing page, the signing page, Your credits and each
 * Connect Google link to them. Also the verification kit (docs/google-verification.md): every
 * scope, the Limited Use sentence, and nothing that looks like a secret.
 *
 *   BASE=http://localhost:4600 SUPPORT_EMAIL=support-qa@example.com npx tsx scripts/test-legal.mts
 */
import { readFileSync } from "node:fs";
import { EXTEND_DAYS, PRICES, PRO_CREDITS, TOPUP_CREDITS, TRIAL_DAYS } from "../lib/billing/rules";
import { SENDER_DUTY } from "../lib/proposals/types";
import { MAIN_SCOPES, SCOPE_GMAIL } from "../lib/google/config";
import { GOOGLE_POLICY_URL, LIMITED_USE } from "../app/privacy/Privacy";
import { GOVERNING_LAW, SIGN_LINK_DAYS } from "../app/terms/Terms";
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
    "drafting with Claude: the transcript and the draft's inputs go to Anthropic's API, and Merlin doesn't keep the transcript",
    pt.includes("Anthropic (drafting with Claude)") && pt.includes("If you turn on drafting with Claude, the transcript and the draft's inputs are sent to Anthropic's API") && pt.includes("are not kept by Merlin") && pt.includes("A transcript you draft from with Claude: not kept"),
  );
  check("documents to sign: stored privately, for the member and the people they send it to", pt.includes("Documents you upload to be signed") && pt.includes("stored privately on Merlin's server") && pt.includes("a proposal or a document for signature") && pt.includes("drawn signature"));
  check("the version was bumped for it", PRIVACY_VERSION === "1.2");
  check("never sells, never trains, the server calls no AI model", pt.includes("We never sell personal data") && pt.includes("We never use any data to train AI models") && pt.includes("calls no AI model"));
  check("deletion: Disconnect, the LinkedIn import, Remove my name, closing an account", ["Disconnect and delete everything", "Delete removes the file", "Remove my name", "Closing your account"].every((t) => pt.includes(t)));
  // Own sites (lib/ownsites): one plain sentence, in the policy, the data page and the doc, with version 1.2.
  const ownLine = "Merlin also reads the email addresses that fractionals publish on their own business websites";
  check(
    "own sites: the policy says Merlin reads the emails fractionals publish on their own business websites, US only, to invite them and show members, removable at /remove; version 1.2",
    PRIVACY_VERSION === "1.2" &&
      pt.includes(`${ownLine}, for people in the United States only, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at Remove my name.`) &&
      src("app/data/DataFlows.tsx").includes(`${ownLine}, US only, to invite them to join Merlin or claim their seats and to show members. Anyone can remove their name and email at /remove.`) &&
      src("docs/data-flows.md").includes("the email addresses that fractionals publish on their own business websites, US only, to invite them to join Merlin or claim their seats and to show members, and anyone can remove their name and email at `/remove`"),
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
  check(
    "the plans' numbers are the billing rules' own",
    [`$${PRICES.month} a month`, `$${PRICES.year} a year`, `$${PRICES.topup} for ${TOPUP_CREDITS} credits`, `${PRO_CREDITS} credits with each paid month`, `${TRIAL_DAYS} days of Pro`, `${EXTEND_DAYS} days longer`].every((x) => tt.includes(x)),
  );
  check("the sender's duty, word for word from the proposals", tt.includes(SENDER_DUTY));
  check("signing links' days match the server's", /export const SIGN_DAYS = (\d+);/.exec(src("lib/proposals/store.ts"))?.[1] === String(SIGN_LINK_DAYS) && tt.includes(`Signing links work for ${SIGN_LINK_DAYS} days`));
  check("contributions, acceptable use, as is, the connector, cancellation, liability", ["give Revenue Nomad a worldwide", "scrape", "resell", "harass", "anti-spam", "A likely email is a guess", "The connector and your AI assistant", "You can cancel at any time", "Limitation of liability"].every((x) => tt.includes(x)));
  check("no refund is promised", tt.includes("Payments are not refunded") && !/we (will )?refund|full refund/i.test(tt));
  check(
    GOVERNING_LAW ? `governing law: ${GOVERNING_LAW}` : "governing law: the owner's placeholder shows until it is set",
    GOVERNING_LAW ? tt.includes(GOVERNING_LAW) && !tt.includes("To confirm") : tt.includes("[To confirm: State of ___]"),
  );
  check("no other owner notes and no em dashes", !tt.replace("[To confirm: State of ___]", "").includes("To confirm") && !tt.includes("—"), (tt.match(/.{30}—.{30}/) ?? [])[0]);
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
    flat("app/data/DataFlows.tsx").includes("Inside Merlin: Peers") && flat("app/data/DataFlows.tsx").includes("Only the members in it see it") && flat("app/data/DataFlows.tsx").includes("leaves out what members wrote") && src("docs/data-flows.md").includes("## 4. Inside Merlin: Peers") && src("docs/data-flows.md").includes("leaves out what members wrote"),
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
