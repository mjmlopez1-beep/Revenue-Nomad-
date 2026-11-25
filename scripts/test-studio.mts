/**
 * The studio pass, phase 1 (docs/design-system.md): the system's pieces render, every email wears
 * the new frame, the brand pictures are where and what they should be.
 *
 *   npx tsx scripts/test-studio.mts                 in process
 *   BASE=http://localhost:4600 npx tsx scripts/test-studio.mts   also checks the page's loading shell
 *   STUDIO_OUT=<dir> ...                             also writes each email's HTML there (for screenshots)
 *
 * Checks:
 *   - every email (sign-in, one-time link and code, joining, a message, a claimed invite, someone
 *     joined, a proposal, its code, signed for each side, declined, the trial's three, renewal, the
 *     weekly email, Crystal Ball) opens with the pine header: the white lockup and its Fractions
 *     strip from public/email/header, never the old photo banner; the white sheet; dark mode; one
 *     filled button; a plain-text twin; no em dash in the words
 *   - the header strips and the link preview exist at their sizes, the photo banners are gone
 *   - monogram tiles take brand tints only, a locked logo is one neutral tile
 *   - Chip, Stat, EmptyState, PageHead, Logo and WonMoment render; WonMoment is in Home's won card
 *     and the pipeline's Won column; the loading shell draws the lockup
 *   - phase 2: every signed-in page renders a PageHead in the system's page width, no hand-made
 *     title or back link; numbers are Stats and empty lists EmptyStates; no volt button that earns
 *     nothing (Open in Gmail and the rest are pine), btn-volt only where a credit is earned; status,
 *     stage, likelihood and strength chips from system.tsx; 44px buttons on a phone
 */
import * as ReactNS from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { join, resolve } from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

// The app's components are compiled with the classic JSX transform here: React must be a global.
(globalThis as { React?: unknown }).React = ReactNS;
const ROOT = resolve(import.meta.dirname, "..");
const OUT = process.env.STUDIO_OUT ? resolve(process.env.STUDIO_OUT) : null;
if (OUT) mkdirSync(OUT, { recursive: true });
process.env.RN_PUBLIC_URL = process.env.STUDIO_ORIGIN || "https://merlin.example.com";
const ORIGIN = process.env.RN_PUBLIC_URL;

let pass = 0;
let fail = 0;
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${typeof detail === "string" ? detail.slice(0, 400) : JSON.stringify(detail)?.slice(0, 400)}`}`);
  }
}

/** A PNG's width and height, from its IHDR. */
function pngSize(file: string): { w: number; h: number } | null {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ---------- the emails ---------- */
console.log("Emails");
const { signInEmail } = await import("../lib/email");
const { oneTimeEmail } = await import("../lib/signin");
const { messageEmail, connectEmail } = await import("../lib/messages");
const { joinedEmail } = await import("../lib/notify/joined");
const P = await import("../lib/proposals/emails");
const B = await import("../lib/billing/emails");
const { renderDigest } = await import("../lib/digest");
const { renderRadarEmail } = await import("../lib/radar/format");
const { HEADER_ART_KINDS, ART_VERSION } = await import("../lib/emailArt");

const app = `${ORIGIN}`;
const counts = { conversations: 3, invites: 2, unlocks: 9, roles: 14, function: "Sales" };
type Mail = { subject: string; text: string; html: string };
const MAILS: [string, string, Mail][] = [
  ["signin", "door", signInEmail("Jordan Avery", `${app}/in/abc123`)],
  ["onetime", "door", oneTimeEmail("Jordan Avery", `${app}/?k=tok_123`, "482913", "signin")],
  ["join", "door", oneTimeEmail("Jordan Avery", `${app}/?k=tok_456`, "120734", "join")],
  ["message", "letter", messageEmail({ from: "Dana", company: "Hollowell Freight", holder: true, text: "Hi Jordan, I held the CRO seat there last year. Happy to tell you how they buy, and who to talk to first.", link: `${app}/?k=m1&msg=c1`, settingsUrl: `${app}/?k=s1&page=notifications` })],
  ["invite", "letter", connectEmail({ partner: "Ana", company: "Juniper Freight", link: `${app}/?k=c1&msg=c2`, settingsUrl: `${app}/?k=s1&page=notifications` })],
  ["joined", "letter", joinedEmail({ first: "Sam", both: true, bonus: 5, link: `${app}/?k=j1`, settingsUrl: `${app}/?k=s1&page=notifications` })],
  ["proposal", "proposal", P.proposalEmail({ signer: "Morgan Buyer", member: "Jordan Avery", memberTitle: "Fractional VP Sales", title: "Fractional VP Sales: 90-day plan", company: "Hollowell Freight", link: `${app}/sign/tok_1`, expiresAt: "2026-12-21T00:00:00Z", note: "Morgan, here is the plan we talked through on Thursday. Two pages, and the price is on the second." })],
  ["signcode", "door", P.codeEmail({ member: "Jordan Avery", title: "Fractional VP Sales: 90-day plan", code: "604218" })],
  ["signed-member", "signed", P.signedEmail({ to: "member", name: "Jordan Avery", member: "Jordan Avery", signer: "Morgan Buyer", title: "Fractional VP Sales: 90-day plan", signedAt: "2026-11-22T15:00:00Z", copy: `${app}/signed/tok_1`, hash: "9f2c1a7be0d44c3f8e51b6a2d97f0c1e4a8b3d6f2e9c7a1b5d8e0f3a6c9b2d4e" })],
  ["signed-signer", "signed", P.signedEmail({ to: "signer", name: "Morgan Buyer", member: "Jordan Avery", signer: "Morgan Buyer", title: "Fractional VP Sales: 90-day plan", signedAt: "2026-11-22T15:00:00Z", copy: `${app}/signed/tok_1`, hash: "9f2c1a7be0d44c3f8e51b6a2d97f0c1e4a8b3d6f2e9c7a1b5d8e0f3a6c9b2d4e" })],
  ["declined", "proposal", P.declinedEmail({ member: "Jordan Avery", signer: "Morgan Buyer", title: "Fractional VP Sales: 90-day plan", reason: "We are holding hiring until Q2.", app: `${app}/?k=p1&page=proposals` })],
  ["trial-ending", "plan", B.trialEndingEmail({ first: "Jordan", days: 1, notLooking: false, rateLine: "Less than an hour of your time a month.", link: `${app}/?k=b1&page=billing` })],
  ["trial-receipt", "plan", B.trialReceiptEmail({ first: "Jordan", days: 3, counts, rateLine: null, link: `${app}/?k=b1&page=billing` })],
  ["trial-ended", "plan", B.trialEndedEmail({ first: "Jordan", counts, notLooking: false, rateLine: null, link: `${app}/?k=b1&page=billing` })],
  ["renewal", "plan", B.renewalEmail({ first: "Jordan", counts, interval: "month", link: `${app}/?k=b1&page=billing` })],
  [
    "digest",
    "week",
    renderDigest({
      name: "Jordan Avery",
      email: "jordan@example.com",
      function: "Sales",
      newRoles: 12,
      newRolesMine: 4,
      newRolesMineHidden: 3,
      byFunction: [
        { function: "Sales", n: 4 },
        { function: "Marketing", n: 3 },
        { function: "Finance", n: 2 },
      ],
      closedRoles: 2,
      seatFactsMissing: 5,
      credits: 11,
      appUrl: `${app}/?k=d1&tab=roles`,
      unsubscribeUrl: `${app}/api/table/unsubscribe?m=x&s=y`,
    }),
  ],
];
const day0 = "2026-11-22";
const card = (i: number, o: Record<string, unknown> = {}) => ({
  id: `id${i}`,
  co: `co${i}`,
  kind: "adjacent" as const,
  headline: "A SaaS company just hired a fractional Marketing leader",
  signal: "Just hired a fractional Marketing leader",
  facts: ["51–200 people", "SaaS", "Texas, US"],
  about: { industry: ["SaaS", "Fintech", "Health Care"][i % 3], size: "51–200 people", hq: ["Texas, US", "Illinois, US", "Washington, US"][i % 3], revenue: "$5M–$20M" },
  why: "Marketing usually comes before Sales",
  whyNow: "Hired 1 month ago · Sales can follow in 3–12 months",
  band: "Medium" as const,
  company: null,
  locked: true,
  opens: "one" as const,
  url: `${app}/?radar=${day0}`,
  at: `${day0}T08:00:00Z`,
  ...o,
});
const cb = renderRadarEmail({
  name: "Jordan Avery",
  day: { cards: [card(1), card(2), card(3)], total: 3, companies: 3, day: day0, url: `${app}/?radar=${day0}`, mode: "daily" } as never,
  unsubscribeUrl: `${app}/api/table/unsubscribe?m=x&s=y&r=radar`,
  settingsUrl: `${app}/?k=s1&page=notifications`,
  appUrl: app,
});

const LOCKUP = `${ORIGIN}/email/crystal-ball/merlin@2x.png?v=${ART_VERSION}`;
for (const [name, art, m] of MAILS) {
  const html = m.html;
  const imgs = html.match(/<img [^>]*>/g) ?? [];
  check(`${name}: opens with the white lockup on pine`, imgs[0]?.includes(`src="${LOCKUP}"`) && /<td bgcolor="#073F2F"[^>]*>[\s\S]*?<img src="[^"]*merlin@2x\.png/.test(html), imgs[0]);
  check(`${name}: its Fractions strip is the "${art}" header`, imgs[1]?.includes(`src="${ORIGIN}/email/header/${art}@2x.png?v=${ART_VERSION}"`) && /width="600" height="120"/.test(imgs[1] ?? ""), imgs[1]);
  check(`${name}: no photo banner, no old frame`, !/merlin-banner|max-width:560px|\.webp|\.jpe?g/i.test(html));
  check(`${name}: the white sheet, dark mode, a phone's gutters`, html.includes('class="cb-sheet"') && /prefers-color-scheme:dark/.test(html) && html.includes("[data-ogsc]") && html.includes("cb-sheet-pad"));
  const filled = (html.match(/class="cb-cta"/g) ?? []).length;
  const pine = (html.match(/<td bgcolor="#073F2F" class="cb-cta"/g) ?? []).length;
  // The signing code is the one email with nothing to click: the code is typed on the page it came from.
  const want = name === "signcode" ? 0 : 1;
  check(`${name}: ${want ? "one filled button, pine with white words" : "no button"}`, filled === want && pine === want && (!want || /class="cb-cta"[^>]*><a [^>]*color:#FFFFFF/.test(html)), { filled, pine });
  check(`${name}: no volt fill (volt is for earning)`, !/bgcolor="#2EE59D"/.test(html));
  check(`${name}: a plain-text twin and a subject`, m.text.length > 40 && m.subject.length > 5 && !/<[a-z]/i.test(m.text));
  check(`${name}: no em dash in the words`, !/—/.test(m.text) && !/—|&mdash;/.test(html));
  check(`${name}: the footer is on the page, small and muted`, /<p class="cb-muted" style="margin:0 0 6px;[^"]*font-size:12px;line-height:18px/.test(html));
  if (OUT) writeFileSync(join(OUT, `email-${name}.html`), html);
}
{
  const imgs = cb.html.match(/<img [^>]*>/g) ?? [];
  check("Crystal Ball: the same lockup, its own hero, untouched", imgs[0]?.includes(`src="${LOCKUP}"`) && cb.html.includes("/email/crystal-ball/hero-morning@2x.png") && !cb.html.includes("/email/header/"), imgs.slice(0, 2));
  check("Crystal Ball: its big button is pine now, its card buttons too", /<td bgcolor="#073F2F" class="cb-cta" style="border-radius:8px;background-color:#073F2F"><a [^>]*>See all 3 companies</.test(cb.html), cb.html.match(/See all[^<]*/)?.[0]);
  if (OUT) writeFileSync(join(OUT, "email-crystalball.html"), cb.html);
}
{
  // No site to load pictures from: the name in text on pine, no broken images.
  const was = process.env.RN_PUBLIC_URL;
  delete process.env.RN_PUBLIC_URL;
  const bare = P.codeEmail({ member: "Jordan Avery", title: "A plan", code: "111222" });
  process.env.RN_PUBLIC_URL = was;
  check("no site: the pine header says Merlin in text, and no image is left broken", !/<img /.test(bare.html) && /font-weight:800;color:#FFFFFF">Merlin<\/td>/.test(bare.html), bare.html.match(/<img [^>]*>/g));
  // The pictures come from the email's own link, never another site.
  const own = signInEmail("Jordan", "https://other.example.org/in/x");
  check("pictures come from the site the email links to", own.html.includes('src="https://other.example.org/email/header/door@2x.png?v=') && !own.html.includes(ORIGIN));
}

/* ---------- the pictures ---------- */
console.log("Pictures");
for (const k of HEADER_ART_KINDS) {
  const s = pngSize(join(ROOT, `public/email/header/${k}@2x.png`));
  check(`header strip ${k} is 1200 by 240`, s?.w === 1200 && s.h === 240, s);
}
{
  const og = pngSize(join(ROOT, "public/brand/merlin-og-banner.png"));
  check("the link preview is 1200 by 630", og?.w === 1200 && og.h === 630, og);
  const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
  check("the page's metadata points at it, at its size", /images: \[\{ url: "\/brand\/merlin-og-banner\.png", width: 1200, height: 630/.test(layout) && layout.includes('images: ["/brand/merlin-og-banner.png"]'));
  for (const f of ["merlin-lockup.png", "merlin-wordmark.png", "merlin-lockup-on-dark.png", "merlin-wordmark-on-dark.png"]) {
    const s = pngSize(join(ROOT, "public/brand", f));
    check(`${f} is the 811 by 240 lockup`, s?.w === 811 && s.h === 240, s);
  }
  check("no photographs: the mountain banners are gone", !existsSync(join(ROOT, "public/brand/merlin-banner-email.png")) && !existsSync(join(ROOT, "public/brand/merlin-banner-onboarding.webp")));
}

/* ---------- monograms ---------- */
console.log("Monograms");
const shared = await import("../app/ui/shared");
const BRAND_TINTS = ["var(--pine-8)", "var(--volt-soft)", "var(--sand)", "var(--saffron-hi)", "var(--ink-6)"];
check("the tints are the brand's five, with pine or ink letters", shared.MONO_TINTS.length === 5 && shared.MONO_TINTS.every((t) => BRAND_TINTS.includes(t.background) && ["var(--pine)", "var(--ink)"].includes(t.color)), shared.MONO_TINTS);
{
  const names = ["Hollowell Freight", "Juniper Freight", "Stonebridge Learning", "Larkspur Freight", "Paper Kite Labs", "Moonbeam Freight", "Tin Robot Health", "Jordan Avery", "A", "Ezra Empty"];
  check("every name lands on a brand tint", names.every((n) => BRAND_TINTS.includes(shared.monoTint(n).background)));
  const used = new Set(names.map((n) => shared.monoTint(n).background));
  check("names spread over the tints", used.size >= 3, [...used]);
  const sources = ["app/ui/shared.tsx", "app/post/AddModal.tsx", "app/post/ui.tsx", "app/landing/Features.tsx"].map((f) => readFileSync(join(ROOT, f), "utf8"));
  check("no monogram draws its own hue any more", sources.every((s) => !/hsl\(\$\{hue/.test(s) && !/background: `hsl\(/.test(s)));
  const logoHtml = renderToStaticMarkup(h(shared.CompanyLogo, { name: "", domain: null, hidden: true, seed: "c_abcdef1234", noLogo: true }));
  check("a locked logo is one neutral tile with the lock, no colour of its own", /class="logo logo-locked"/.test(logoHtml) && !/style=/.test(logoHtml.match(/<span class="logo logo-locked"[^>]*>/)?.[0] ?? "x") && /<rect x="5" y="11"/.test(logoHtml), logoHtml);
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  check("the locked tile is surface-2 in the stylesheet", /\.logo\.logo-locked \{\s*border-color: transparent;\s*background: var\(--surface-2\);/.test(css));
}

/* ---------- the system's components ---------- */
console.log("Components");
const sys = await import("../app/ui/system");
const { Logo } = await import("../app/ui/Logo");
const { WonMoment } = await import("../app/ui/WonMoment");
{
  const chips = renderToStaticMarkup(h("div", null, h(sys.Chip, { tone: "outline" }, "Sales"), h(sys.LikelihoodChip, { band: "High" }), h(sys.LikelihoodChip, { band: "Medium" }), h(sys.LikelihoodChip, { band: "Low" }), h(sys.WarmthChip, { warmth: "Warm" }), h(sys.StatusChip, { status: "Signed" }), h(sys.Chip, { tone: "ember" }, "Hiring")));
  check("Chip: four tones on the existing chip classes", chips.includes('<span class="chip">Sales</span>') && chips.includes('class="chip chip-on">High') && chips.includes('class="chip chip-volt">Medium') && chips.includes('class="chip">Low') && chips.includes('class="chip chip-ember">Hiring'), chips);
  check("Chip: warmth carries its glyph, status its tone", /class="chip chip-volt"><span class="fx fx-glyph"[^>]*><\/span>Warm/.test(chips) && chips.includes('class="chip chip-on">Signed'), chips);
  const strengthChips = (["Strong", "Good", "Fading", "Cold"] as const).map((w) => renderToStaticMarkup(h(sys.WarmthChip, { warmth: w })));
  check("WarmthChip takes the strength words in the same tones: Strong pine as Hot, Good mint as Warm, Fading and Cold outline", sys.STRENGTH_TONE.Strong === sys.WARMTH_TONE.Hot && sys.STRENGTH_TONE.Good === sys.WARMTH_TONE.Warm && sys.STRENGTH_TONE.Cold === sys.WARMTH_TONE.Cold && sys.STRENGTH_TONE.Fading === "outline" && strengthChips[0] === renderToStaticMarkup(h(sys.WarmthChip, { warmth: "Hot" })).replace(">Hot<", ">Strong<") && strengthChips[1] === renderToStaticMarkup(h(sys.WarmthChip, { warmth: "Warm" })).replace(">Warm<", ">Good<") && strengthChips.every((x, i) => x.includes(["Strong", "Good", "Fading", "Cold"][i])), strengthChips);
  check("the scales: likelihood, warmth, status", sys.LIKELIHOOD_TONE.High === "pine" && sys.LIKELIHOOD_TONE.Medium === "mint" && sys.LIKELIHOOD_TONE.Low === "outline" && sys.WARMTH_TONE.Hot === "pine" && sys.STATUS_TONE.Won === "pine" && sys.STATUS_TONE.Viewed === "mint" && sys.STATUS_TONE.Draft === "outline" && !Object.values(sys.STATUS_TONE).includes("ember"));
  const stat = renderToStaticMarkup(h(sys.Stat, { n: "6", label: "open deals", link: { label: "See them", href: "/?page=pipeline" } }));
  check("Stat: the number, its label, its link; no tile", stat === '<div class="stat"><span class="stat-n">6</span><span class="stat-l">open deals</span><a class="stat-a" href="/?page=pipeline">See them</a></div>', stat);
  const empty = renderToStaticMarkup(h(sys.EmptyState, { spot: "noSeats", title: "No seats yet", action: { label: "Add a seat", onClick: () => {} } }, "Add the seat you held and it earns credits."));
  check("EmptyState: a 128 spot, a 17/24 title, the words, one pine button", /^<div class="empty-state card"><span class="fx fx-spot" style="width:128px;height:128px"/.test(empty) && empty.includes('<h2 class="t-section">No seats yet</h2>') && empty.includes("<p>Add the seat you held and it earns credits.</p>") && (empty.match(/class="btn btn-pine"/g) ?? []).length === 1, empty);
  const head = renderToStaticMarkup(h(sys.PageHead, { title: "Your pipeline", lead: "Merlin moves each deal by itself.", art: h("span", { className: "art" }), actions: h("button", { className: "btn btn-pine" }, "Add a deal") }));
  check("PageHead: the title in t-page, the lead, the prop slot, the actions, no back link on a top-level page", head.includes('<h1 class="t-page">Your pipeline</h1>') && head.includes('<p class="page-head-lead">Merlin moves each deal by itself.</p>') && head.includes('<div class="page-head-art"><span class="art"></span></div>') && head.includes('<div class="page-head-act">') && !head.includes("page-back"), head);
  const nested = renderToStaticMarkup(h(sys.PageHead, { title: "Connect Google", back: { label: "Integrations", onClick: () => {} } }));
  check("PageHead: a nested page gets its back link", /<button type="button" class="page-back"><svg[^>]*>[\s\S]*<\/svg> Integrations<\/button>/.test(nested), nested);
  const card2 = renderToStaticMarkup(h(sys.Card, { as: "section" }, "x")) + renderToStaticMarkup(h(sys.Callout, { tone: "sand" }, "y"));
  check("Card and Callout", card2 === '<section class="card">x</section><div class="callout callout-sand">y</div>', card2);
  const logo = renderToStaticMarkup(h(Logo, { height: 30 })) + renderToStaticMarkup(h(Logo, { height: 30, tone: "white" }));
  check("Logo: the pine mark and the ink wordmark, all white on pine, sized from its height", /<svg class="logo-svg" viewBox="0 0 811 240" width="101" height="30"[^>]*role="img" aria-label="Merlin by Revenue Nomad"><path fill="#073F2F"[^>]*>(<\/path>)?<path fill="#0A1A13"/.test(logo) && /<path fill="#FFFFFF"[^>]*>(<\/path>)?<path fill="#FFFFFF"/.test(logo), logo.slice(0, 300));
  const won = renderToStaticMarkup(h(WonMoment, { rec: { name: "Hollowell Freight", won: { pricing: "monthly", rate: 8000, hours: null, start: "2026-12", months: null, merlin: true, monthly: 8000 } as never, seat: undefined, how: "From your proposal on Nov 22" }, onSeat: () => {} }));
  check("WonMoment: the keep, the client, what it is worth a month, Add it as your seat", /^<div class="won"><span class="fx fx-scene fx-won won-art" style="width:288px;height:160px"/.test(won) && won.includes('<span class="won-h">Hollowell Freight</span>') && won.includes("$8,000 a month") && won.includes(">Add it as your seat</button>"), won);
  const compact = renderToStaticMarkup(h(WonMoment, { rec: { name: null, won: undefined, seat: undefined, how: null }, compact: true }));
  check("WonMoment compact (the Won column): smaller art, no button, no locked name", compact.includes("won-compact") && compact.includes("height:88px") && !compact.includes("<button") && compact.includes("a new client"), compact);
  const fu = readFileSync(join(ROOT, "app/post/FollowUps.tsx"), "utf8");
  check("Home's You won card is the WonMoment", /wins\.map\(\(e\) => \(\s*<li key=\{e\.id\}>\s*<WonMoment rec=\{e\} onSeat=\{\(\) => setWinning\(e\.id\)\} \/>/.test(fu));
  const pl = readFileSync(join(ROOT, "app/post/Pipeline.tsx"), "utf8");
  check("the pipeline's Won column opens with it", pl.includes('{s === "won" && list[0] ? <WonMoment rec={list[0]} compact /> : null}'));
  const sign = readFileSync(join(ROOT, "app/sign/Sign.tsx"), "utf8");
  // SignedArt (Sign.tsx) is shared by the proposal's and the uploaded document's signing pages: the open lock on the mint signed card.
  const docSign = readFileSync(join(ROOT, "app/sign/DocSign.tsx"), "utf8");
  check(
    "the signer's Signed card has its spot, not a check icon",
    sign.includes('export const SignedArt = ({ on = "mint" }: { on?: "mint" | "white" }) => <Spot name="unlocked" size={112} on={on} ember className="sg-done-art" />;') &&
      sign.includes("<SignedArt />") &&
      docSign.includes('<SignedArt on={v.status === "signed" ? "mint" : "white"} />') &&
      !sign.includes('className="sg-done"'),
  );
}

/* ---------- phase 2: every signed-in page on the system ---------- */
console.log("Pages");
{
  const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
  // Each signed-in page draws its title with PageHead, inside the system's page width (Home's band has its own).
  const PAGES: [string, string, "page-wide" | "page-narrow" | null][] = [
    ["Home", "app/post/Home.tsx", null],
    ["Your pipeline", "app/post/Pipeline.tsx", "page-wide"],
    ["Proposals", "app/post/Proposals.tsx", "page-wide"],
    ["Peers", "app/post/Peers.tsx", "page-wide"],
    ["Fractionals", "app/post/Fractionals.tsx", null],
    ["Your seats", "app/post/Seats.tsx", "page-narrow"],
    ["Your credits", "app/post/Credits.tsx", "page-narrow"],
    ["Plan and billing", "app/post/Billing.tsx", "page-narrow"],
    ["Notifications", "app/post/Notifications.tsx", "page-narrow"],
    ["Messages", "app/post/Messages.tsx", "page-wide"],
    ["Integrations", "app/post/Integrations.tsx", "page-narrow"],
    ["Use it in Claude", "app/post/UseInClaude.tsx", "page-narrow"],
    ["Rate benchmarks", "app/post/Benchmarks.tsx", "page-wide"],
    ["Crystal Ball", "app/post/Radar.tsx", "page-wide"],
    ["Pilot metrics", "app/post/Admin.tsx", "page-wide"],
    ["Your network", "app/post/network/Network.tsx", "page-wide"],
  ];
  for (const [name, file, width] of PAGES) {
    const s = src(file);
    check(`${name}: renders a PageHead`, /<PageHead\b/.test(s) && /import \{[^}]*\bPageHead\b[^}]*\} from "(\.\.\/)+ui\/system"/.test(s));
    check(`${name}: no hand-made page title or old back link`, !/<h1\b/.test(s) && !/tp-page-h|className="tp-back"|className="tp-page /.test(s));
    if (width) check(`${name}: the system's page width (${width})`, s.includes(`"${width} `) || s.includes(`\`${width} `) || s.includes(`"${width}"`));
  }
  check("no page draws its own title anywhere in the app", readdirSync(join(ROOT, "app/post"), { recursive: true }).filter((f) => String(f).endsWith(".tsx")).every((f) => !/tp-page-h\b/.test(src(join("app/post", String(f))))));
  // A top-level page has no back link; a nested one carries it in PageHead (Your seats back to a record, the directory under Peers).
  check("a nested page's way back goes through PageHead", /back=\{back \? \{ label: `Back to \$\{back\.name\}`, onClick: back\.go \} : undefined\}/.test(src("app/post/Seats.tsx")) && /back=\{\{ label: "Back to the table", onClick: onBack \}\}/.test(src("app/post/Fractionals.tsx")));

  // Numbers are Stats, empty lists EmptyStates.
  check("Your pipeline's numbers are Stats and its empty states EmptyStates", (src("app/post/Pipeline.tsx").match(/<Stat /g) ?? []).length === 4 && (src("app/post/Pipeline.tsx").match(/<EmptyState /g) ?? []).length === 2 && !src("app/post/Pipeline.tsx").includes("pl-stats num"));
  check("Your credits' and Pilot metrics' numbers are Stats, never a filled tile", /<Stat n=\{me\.added\}/.test(src("app/post/Credits.tsx")) && /<Stat n=\{<Num>\{value\}<\/Num>\} label=\{label\} \/>/.test(src("app/post/Admin.tsx")) && !/className="tp-stat[" ]/.test(src("app/post/Credits.tsx") + src("app/post/Admin.tsx")));
  check("Proposals, Messages and Peers use EmptyState, Peers' spots calm beside the head's prop", /<EmptyState spot="noMessages" title="Nothing sent yet">/.test(src("app/post/Proposals.tsx")) && /<EmptyState spot="noMessages" title="No messages yet"/.test(src("app/post/Messages.tsx")) && (src("app/post/Peers.tsx").match(/<EmptyState [^>]*ember=\{false\}/g) ?? []).length === 2);

  // Volt is for earning only: no btn-primary in the member's app, and btn-volt only on the buttons that earn a credit.
  const files = readdirSync(join(ROOT, "app/post"), { recursive: true })
    .map(String)
    .filter((f) => /\.(tsx|ts)$/.test(f));
  const volt: Record<string, number> = {};
  for (const f of files) {
    const s = src(join("app/post", f));
    const n = (s.match(/btn-volt/g) ?? []).length;
    if (n) volt[f] = n;
  }
  check("no btn-primary in the member's app (volt says btn-volt where a credit is earned)", files.every((f) => !/(?<!m-)btn-primary/.test(src(join("app/post", f)))) && !src("app/ui/system.tsx").includes("btn-primary"));
  // Each one earns: Add what you know (top bar, the phone's button, the record twice, the add flow, the Seats page's button); the company page's Add what you know here, a fact or a seat saved (Your seats, the editor, the record's person), claiming or confirming a seat (Your seats' Confirm, and Confirm this seat on a role from the LinkedIn export), Add who hired for it, Add it as your seat, Share a rate (Benchmarks and Rate benchmarks' Share yours), Earn credits, the earning next move and nudge; Hiring now's Add what you know on a phone.
  const EARNS: Record<string, number> = { "AddModal.tsx": 6, "seatsPage/SeatsPage.tsx": 1, "seatsPage/YourSeats.tsx": 1, "Benchmarks.tsx": 1, "Billing.tsx": 1, "Drawer.tsx": 1, "company/sections/People.tsx": 1, "company/sections/Record.tsx": 1, "company/sections/Seats.tsx": 2, "company/parts.tsx": 1, "hiring/HiringNow.tsx": 1, "NextMove.tsx": 1, "Seats.tsx": 4, "TopBar.tsx": 1, "TradingPost.tsx": 1, "WonSheet.tsx": 2, "network/ExportPanel.tsx": 1, "network/SeatGuesses.tsx": 1, "nudges.ts": 1, "rates/RatesPage.tsx": 1, "ui.tsx": 2 };
  check("btn-volt only on the buttons that earn a credit", JSON.stringify(Object.fromEntries(Object.entries(volt).sort())) === JSON.stringify(Object.fromEntries(Object.entries(EARNS).sort())), volt);
  check("the next move is volt only when it earns (seats), pine for open roles", src("app/post/NextMove.tsx").includes('className={`btn ${kind === "roles" ? "btn-pine" : "btn-volt"} nm-go`}'));
  check("a nudge is volt only when its tone is earn", /c\.tone === "earn" \? " btn-volt" : c\.tone === "pine" \? " btn-pine"/.test(src("app/post/nudges.ts")));
  const gmail = [src("app/post/MoveNote.tsx"), src("app/post/FollowUpSheet.tsx")].map((s) => s.match(/<a className=[^\n]*\n\s*<IconExternal size=\{14\} \/> Open in Gmail/)?.[0] ?? "");
  check("Open in Gmail is a pine primary or an outline secondary, never volt", gmail.every((g) => g && /btn-pine|className=\{`btn\$\{/.test(g) && !/btn-volt|btn-primary/.test(g)), gmail);
  check("the other buttons that earn nothing are pine: post on Merlin, open the posting, draft a note, connect Google, copy a prompt, Show my Crystal Ball", /btn btn-pine mn-go" disabled=\{busy \|\| !body\.trim\(\)/.test(src("app/post/MoveNote.tsx")) && /<a className="btn btn-pine mn-go" href=\{posting\}/.test(src("app/post/MoveNote.tsx")) && /btn btn-sm btn-pine" onClick=\{\(\) => onDraft\(b\)\}/.test(src("app/post/company/sections/WayIn.tsx")) && (src("app/post/network/Network.tsx").match(/btn btn-pine nw-connect/g) ?? []).length === 2 && /btn btn-pine" onClick=\{\(\) => void copy\(\)\}/.test(src("app/post/Voice.tsx")) && /btn btn-pine rd-btn/.test(src("app/post/Radar.tsx")) && /btn btn-pine btn-sm" onClick=\{\(\) => void shareInvite/.test(src("app/post/Credits.tsx")));
  const billingCss = src("app/post/billing.css");
  check("the trial's last days: Upgrade is pine, not volt", /\.tp-plan-trial\.end \.tp-plan-go \{\s*background: var\(--pine\);/.test(billingCss) && /\.tp-plan-trial\.end\.tp-plan-phone \{\s*background: var\(--pine\);/.test(billingCss));
  const css = ["app/post/post.css", "app/post/pages.css", "app/post/home.css", "app/post/pipeline.css", "app/post/proposals.css", "app/post/peers.css", "app/post/radar.css", "app/post/network/network.css"].map(src).join("\n");
  check("no stylesheet still styles .btn-primary in the member's app", !/\.btn-primary\b/.test(css));
  check("no pink chip: a declined proposal is an outline chip", !src("app/post/proposals.css").includes("pp-chip-lost") && !/#fdecef|#f2c4cd/i.test(src("app/post/proposals.css")));

  // The scales come from system.tsx.
  const PP = await import("../app/post/ProposalParts");
  const status = (s: string) => renderToStaticMarkup(h(PP.ProposalStatus, { status: s as never }));
  check("a proposal's status is the system's StatusChip: Signed pine, Viewed mint, Draft, Sent and Declined outline, Voided and Expired outline", status("signed") === '<span class="chip chip-on">Signed</span>' && status("viewed") === '<span class="chip chip-volt">Viewed</span>' && ["draft", "sent", "declined"].every((x) => status(x) === `<span class="chip">${x[0].toUpperCase()}${x.slice(1)}</span>`) && status("void") === '<span class="chip">Voided</span>' && status("expired") === '<span class="chip">Expired</span>', ["signed", "viewed", "declined", "void"].map(status));
  const PLP = await import("../app/post/PipelineParts");
  const stage = (s: string) => renderToStaticMarkup(h(PLP.StageChip, { stage: s as never }));
  check("a deal's stage on the status scale: Won pine, Replied, Meeting and Proposal mint, the rest outline", stage("won") === '<span class="chip chip-on pl-stage">Won</span>' && ["replied", "meeting", "proposal"].every((x) => stage(x).startsWith('<span class="chip chip-volt pl-stage">')) && ["sent", "lost", "notnow", "quiet"].every((x) => stage(x).startsWith('<span class="chip pl-stage">')), ["won", "replied", "lost"].map(stage));
  check("Crystal Ball's likelihood words are the system's chips (High pine, Medium mint, Low outline)", src("app/post/Radar.tsx").includes('<LikelihoodChip band="High" /> <LikelihoodChip band="Medium" /> come by email. <LikelihoodChip band="Low" />') && /LIKELIHOOD_TONE\[likely\.band\]/.test(src("app/post/network/Paths.tsx")) && /LIKELIHOOD_TONE\[band as Likelihood\]/.test(src("app/post/Tables.tsx")) && !/className=\{?[`"]rd-band rd-band-/.test(src("app/post/Radar.tsx") + src("app/post/Tables.tsx") + src("app/post/network/Paths.tsx")));
  const NP = await import("../app/post/network/parts");
  const strong = (["Hot", "Warm", "Fading", "Cold"] as const).map((w) => renderToStaticMarkup(h(NP.WarmthChip, { w, strength: true })));
  check("strength chips say Strong, Good, Fading or Cold, on the system's WarmthChip", strong.every((x, i) => x === renderToStaticMarkup(h(sys.WarmthChip, { warmth: (["Strong", "Good", "Fading", "Cold"] as const)[i] }))), strong);
  check("the move card's warmth is the system's chip too", /<WarmthChip warmth=\{p\.warmth\} \/>/.test(src("app/post/Moves.tsx")) && !src("app/post/Moves.tsx").includes("mv-warm"));

  // Phones: 44px to the thumb.
  const post = src("app/post/post.css");
  check("phones: every button in the app, a sheet or a dialog is 44px tall", /@media \(max-width: 767px\) \{\s*\.tp-app \.btn,\s*\.tp-sheet \.btn,\s*\.tp-rsheet \.btn,\s*\.tp-modal \.btn \{\s*min-height: 44px;/.test(post));
  check("the page column holds the system's page wrappers 24px under the top bar, with no second padding", /\.tp-main-page > \.page-narrow,\s*\.tp-main-page > \.page-wide \{\s*padding-top: 0;/.test(post));
  check("a page head's words sit at its top, whatever the art beside them", /\.page-head-main \{[^}]*align-content: start;/.test(src("app/globals.css")));
}

/* ---------- the loading shell and the problem pages ---------- */
console.log("Loading shell");
{
  const root = readFileSync(join(ROOT, "app/Root.tsx"), "utf8");
  const skel = root.slice(root.indexOf("function Skeleton("), root.indexOf("const appLoading"));
  check("the member's shell: the sidebar with the lockup, the white top bar with it under 1024px", skel.includes('<div className="sk-rail-top">\n            <Logo height={30}') && skel.includes('<span className="sk-top-logo">\n              <Logo height={30} />') && /\.sk-top\{height:56px;[^}]*background:var\(--surface\);border-bottom:1px solid var\(--line\)\}/.test(root));
  check("nothing in the member's shell is pine (no pine bar to flash)", !/\.sk-(bar|top|rail)[^{]*\{[^}]*var\(--pine\)/.test(root));
  check("the visitor's shell: the landing's pine bar with the white lockup", skel.includes('<Logo tone="white" height={54} />'));
  check("did not load and too many requests use the error page's shape", root.includes("<Skeleton problem={loadProblem(failed, load)} />") && /status === 429 \? "Too many requests at once"/.test(root));
  const errorPage = readFileSync(join(ROOT, "app/error.tsx"), "utf8");
  const problem = readFileSync(join(ROOT, "app/ui/Problem.tsx"), "utf8");
  check("the error page: the pine bar with the white lockup, the offline spot at 128, pine then plain buttons", errorPage.includes("<PineBar />") && problem.includes('<Spot name="offline" size={128}') && problem.includes('<Logo tone="white" height={30} />') && /btn btn-pine[\s\S]*Reload the page/.test(problem));
  const nf = readFileSync(join(ROOT, "app/not-found.tsx"), "utf8");
  check("the 404's pine bar has the white lockup", nf.includes('<Logo tone="white" height={30} />'));
  if (process.env.BASE) {
    const page = await fetch(`${process.env.BASE}/`).then((r) => r.text());
    check("served: the page's first HTML is the shell with the lockup in it", page.includes('class="sk sk-lp"') && /<svg class="logo-svg" viewBox="0 0 811 240" width="182" height="54"/.test(page), page.slice(0, 300));
    check("served: the link preview in the page's metadata", /<meta property="og:image" content="[^"]*\/brand\/merlin-og-banner\.png"/.test(page));
    const og = await fetch(`${process.env.BASE}/brand/merlin-og-banner.png`);
    check("served: the link preview image", og.ok && og.headers.get("content-type") === "image/png");
    const strip = await fetch(`${process.env.BASE}/email/header/door@2x.png`);
    check("served: an email header strip", strip.ok && strip.headers.get("content-type") === "image/png");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
