/**
 * Checks of the weekly email run (lib/table.ts sendDigests), without a server or a mailbox.
 *
 *   npx tsx scripts/test-digest.ts
 *
 * It runs on a made-up seed in a temporary data dir, and replaces fetch so every email that
 * would go to the mail provider is caught instead. Nothing leaves the machine.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-digest-"));
const BASE = "https://post.example.com";
const seed = {
  builtAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  members: [
    { id: "m1", name: "Sal Sales", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" },
    { id: "m2", name: "Mo Marketing", email: "mo@example.com", title: "Fractional CMO", token: "tok-mo" },
    { id: "m3", name: "Opal Optout", email: "opal@example.com", title: "Fractional CRO", token: "tok-opal" },
    { id: "m4", name: "Flo Fails", email: "flo@example.com", title: "RevOps lead", token: "tok-flo" },
    { id: "m5", name: "Ned Noemail", email: "", title: "VP Sales", token: "tok-ned" },
    { id: "m6", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
  ],
  companies: [{ id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example" } }],
  engagements: [
    // Sal's own seat: he sees Acme even while it has an open role, and 2 facts are filled out of 15.
    { id: "e_acme_sal", companyId: "c_acme", fields: { source: "Published engagement", operator: "Sal Sales", function: "Sales" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
// A state from before: Ned's saved view from onboarding spelled his profile out as hard filters (it opened
// empty), and he saved another view himself. On load the first opens with the profile pill on.
const ICP = { industries: ["SaaS"], employees: ["11–50"], revenue: [], countries: ["United States"] };
const OLD_PLACE = new URLSearchParams({ v: "hiring", t: "seats", f: "industry:SaaS~employees:11–50~fn:Sales~country:United States" }).toString();
const OWN_PLACE = "v=all&t=companies&f=industry:SaaS";
const before = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    profiles: { m5: { function: "Sales", icp: ICP, onboarded: true } },
    connector: {
      clients: [],
      grants: [],
      alerts: {
        m5: [
          { id: "al_old", name: "Sales roles at SaaS companies", function: "Sales", industry: ["SaaS"], employees: ["11–50"], country: ["United States"], createdAt: before, place: OLD_PLACE, email: true },
          { id: "al_own", name: "SaaS companies", industry: ["SaaS"], createdAt: before, place: OWN_PLACE, email: false },
        ],
      },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
  RESEND_API_KEY: "test-key",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_DIGEST_ALL: "1",
});
delete process.env.RN_DIGEST;

/** Every email the run tried to send. `failFor` makes the provider refuse one address. */
const outbox: { to: string; subject: string; text: string; html: string }[] = [];
let failFor = "";
let otherCalls = 0;
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  if (String(url) !== "https://api.resend.com/emails") {
    otherCalls++;
    return new Response("{}", { status: 404 });
  }
  const mail = JSON.parse(String(init?.body ?? "{}"));
  if (mail.to[0] === failFor) return new Response("refused", { status: 500 });
  outbox.push({ to: mail.to[0], subject: mail.subject, text: mail.text, html: mail.html });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
};

async function main() {
  const t = await import("../lib/table");
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = Date.now();
  const at = (days: number) => new Date(t0 + days * DAY).toISOString();
  const role = (n: number, company: string, title: string, fn: string) => ({
    key: `k${n}`, company, domain: null, title, function: fn, type: "Fractional", url: `https://jobs.example.com/${n}`, source: "board", postedAt: null, rate: null, hoursPerWeek: null,
  });
  const clean = [{ source: "board", fetched: 10, matched: 3 }];
  const adminDigest = async () => (await t.buildView("tok-ada")).admin!.digest;

  check("pilot metrics say the weekly email is on", (await adminDigest()).enabled === true);

  // The saved view onboarding made before the pill now opens with it (only the function a hard filter); the member's own view is untouched.
  const { alertView } = await import("../app/onboard/suggest");
  const nedViews = (await t.buildView("tok-ned")).me?.savedViews ?? [];
  const oldOne = nedViews.find((v) => v.id === "al_old");
  check(
    "an onboarding view saved with the profile spelled out opens with the profile pill on now",
    oldOne?.place === alertView("Sales", ICP).place && new URLSearchParams(oldOne.place ?? "").get("f") === "fn:Sales~icp" && oldOne.criteria.industry?.[0] === "SaaS" && oldOne.email === true,
    oldOne,
  );
  check("a view the member saved themselves keeps its place", nedViews.find((v) => v.id === "al_own")?.place === OWN_PLACE, nedViews.map((v) => v.place));
  check("no email in a week with no new roles", (await t.sendDigests(at(0))) === 0 && outbox.length === 0, outbox.length);

  await t.perform("tok-opal", { type: "settings", digest: false });
  await t.applyScan({ roles: [role(1, "Acme Robotics", "Fractional VP Sales", "Sales"), role(2, "Beta Co", "Fractional Head of Sales", "Sales"), role(3, "Gamma Co", "Fractional CMO", "Marketing")], sources: clean }, at(0));

  // Saved searches (the Claude connector's alerts): Mo has one that matches this week's Marketing role and one that doesn't.
  await t.updateConnector((c) => {
    c.alerts.m2 = [
      { id: "al_1", name: "Fractional Marketing roles", function: "Marketing", createdAt: at(0) },
      { id: "al_2", name: "RevOps roles in Texas", function: "RevOps", hq: "Texas", createdAt: at(0) },
    ];
  });
  const list = await t.digestList(at(0), BASE);
  const sal = list.find((x) => x.memberId === "m1")?.data;
  const mo = list.find((x) => x.memberId === "m2")?.data;
  check("a saved search with new matches is in that member's email data", JSON.stringify(mo?.alerts) === JSON.stringify([{ name: "Fractional Marketing roles", n: 1 }]), mo?.alerts);
  check("a member without saved searches has none", Array.isArray(sal?.alerts) && sal!.alerts!.length === 0, sal?.alerts);
  const moMail = (await import("../lib/digest")).renderDigest(mo!);
  check("the email lists the saved view and its new roles", moMail.text.includes("Your lists\n  Fractional Marketing roles  1 new") && moMail.html.includes("Fractional Marketing roles") && !moMail.text.includes("RevOps roles in Texas"), moMail.text);
  check("the email never names the company of a saved search's match", !moMail.text.includes("Gamma Co") && !moMail.html.includes("Gamma Co"));
  check("everyone with an email who hasn't opted out is on the list", list.map((x) => x.memberId).sort().join() === "m1,m2,m4,m6", list.map((x) => x.memberId));
  delete process.env.RN_DIGEST_ALL;
  const signedIn = (await t.digestList(at(0), BASE)).map((x) => x.memberId);
  check("without RN_DIGEST_ALL only members who have signed in are on the list", !signedIn.includes("m1") && !signedIn.includes("m2") && !signedIn.includes("m4"), signedIn);
  process.env.RN_DIGEST_ALL = "1";
  check("new roles are counted for all functions and for the member's own", sal?.newRoles === 3 && sal.newRolesMine === 2 && mo?.newRolesMine === 1, { sal: sal?.newRolesMine, mo: mo?.newRolesMine });
  check("hidden companies are counted for that member (a seat holder sees their own company)", sal?.newRolesMineHidden === 1 && mo?.newRolesMineHidden === 1, { sal: sal?.newRolesMineHidden, mo: mo?.newRolesMineHidden });
  check("functions come most roles first", JSON.stringify(sal?.byFunction) === JSON.stringify([{ function: "Sales", n: 2 }, { function: "Marketing", n: 1 }]), sal?.byFunction);
  // 14: the seat's 13 facts and its Why now (Why it ended is only missing once a seat has ended).
  check("facts missing on the member's own seats are counted", sal?.seatFactsMissing === 14 && mo?.seatFactsMissing === 0, { sal: sal?.seatFactsMissing, mo: mo?.seatFactsMissing });
  // Changed: the links used to go straight to the app, so a phone that wasn't signed in landed on Sign in. Each now goes
  // through /api/go, which signs that member in once (lib/emailIn.ts) and opens the same place: `goTo` reads where.
  const isGo = (u: string | undefined, id: string) => !!u && u.startsWith(`${BASE}/api/go?m=${encodeURIComponent(t.tableInternals.pubId(id))}&x=`) && /&t=[\w-]{27}&to=/.test(u);
  const goTo = (u: string | undefined) => (u ? new URL(u).searchParams.get("to") ?? "" : "");
  check("credits, function and links are the member's own", sal?.credits === 25 && sal.function === "Sales" && isGo(sal.appUrl, "m1") && goTo(sal.appUrl) === "/" && sal.unsubscribeUrl.startsWith(`${BASE}/api/table/unsubscribe?m=m_`) && sal.unsubscribeUrl !== mo?.unsubscribeUrl, sal);
  check("the app link carries no sign-in code", !sal?.appUrl.includes("tok-") && !sal?.unsubscribeUrl.includes("tok-") && !/[?&]k=/.test(sal?.appUrl ?? ""));
  check(
    "every link to the app signs in that member only: the list, each role, Notifications, Your seats, Your credits",
    [sal?.rolesUrl, ...(sal?.roles ?? []).map((r) => r.url), sal?.settingsUrl, sal?.seatsUrl, sal?.creditsUrl].every((u) => isGo(u, "m1")) && goTo(sal?.settingsUrl) === "/?p=notifications" && goTo(sal?.seatsUrl) === "/?p=seats" && goTo(sal?.creditsUrl) === "/?p=credits" && isGo(mo?.rolesUrl, "m2"),
    [sal?.rolesUrl, sal?.settingsUrl],
  );
  const ein = await import("../lib/emailIn");
  const landed = await ein.emailLanding(Object.fromEntries(new URL(sal!.seatsUrl!).searchParams) as never, null);
  check("opening one signs Sal in once and opens the place", /^\/\?k=o[\w-]{32}&p=seats$/.test(landed ?? ""), landed);

  // The button opens the list the headline counts: Hiring now in the member's function, with the profile off (f names it).
  const place = (u: string | undefined) => (u ? new URL(`${BASE}${goTo(u)}`) : null);
  const salList = place(sal?.rolesUrl);
  check(
    "the button opens Hiring now on seats in the member's function, the list the email counted",
    salList?.origin === BASE && salList.searchParams.get("v") === "hiring" && salList.searchParams.get("t") === "seats" && salList.searchParams.get("f") === "fn:Sales" && place(mo?.rolesUrl)?.searchParams.get("f") === "fn:Marketing",
    [sal?.rolesUrl, mo?.rolesUrl],
  );
  const ada = list.find((x) => x.memberId === "m6")?.data;
  const adaList = place(ada?.rolesUrl);
  check(
    "a member with no new roles in a function of theirs gets every function's new roles (all functions, no filter)",
    ada?.newRolesMine === 0 && adaList?.searchParams.get("af") === "1" && adaList.searchParams.get("f") === "-" && ada.roles?.length === 3,
    { rolesUrl: ada?.rolesUrl, roles: ada?.roles?.length, mine: ada?.newRolesMine },
  );
  // Up to 5 roles, free facts only: the title, function, industry, size, region and listed day, linked to the record. Never the company.
  const salRoles = sal?.roles ?? [];
  check(
    "the email data lists the member's new roles in free facts only, each linked to its record over that list",
    salRoles.length === 2 &&
      salRoles.every((r) => r.function === "Sales" && /^Fractional (VP|Head of) Sales$/.test(r.title) && goTo(r.url).startsWith(`${goTo(sal!.rolesUrl)}&c=`) && /^\d{4}-\d{2}-\d{2}$/.test(r.listed ?? "")) &&
      salRoles.every((r) => Object.keys(r).sort().join() === "employees,function,industry,listed,region,title,url"),
    salRoles,
  );
  check("no company name anywhere in the roles the email lists", !JSON.stringify([sal?.roles, mo?.roles, ada?.roles]).match(/Acme|Beta Co|Gamma Co/), [sal?.roles, mo?.roles]);
  const salMail = (await import("../lib/digest")).renderDigest(sal!);
  check(
    "the email shows each role with a link to its record, and the button links to the counted list",
    salMail.text.includes("Fractional VP Sales") && salMail.text.includes(salRoles[0]?.url ?? "-") && salMail.html.includes(sal!.rolesUrl!.replace(/&/g, "&amp;")) && salMail.html.includes(salRoles[0]?.url.replace(/&/g, "&amp;") ?? "-"),
    salMail.text,
  );
  check("the rendered email never names a company it counted", !/Acme|Beta Co|Gamma Co/.test(salMail.text + salMail.html + moMail.text + moMail.html));
  // Changed: with billing off a member's first company each day opens free, so the email says so instead of "Unlock it for 2 credits".
  check("billing off: a locked role says the first company each day opens free, then 2 credits", mo?.unlock === "day" && /The company is locked\. Your first company each day opens free, then each is 2 credits\./.test(moMail.text) && !/see who is hiring/.test(moMail.text + salMail.text), moMail.text.split("\n")[2]);

  /* ---------- the words, by plan, and the lines that are links ---------- */
  const { renderDigest } = await import("../lib/digest");
  const G = (to: string) => `${BASE}/api/go?m=m_x&x=1&t=${"a".repeat(27)}&to=${encodeURIComponent(to)}`;
  const base = { ...sal!, newRoles: 2, newRolesMine: 2, newRolesMineHidden: 2, seatFactsMissing: 5, credits: 0, settingsUrl: G("/?p=notifications"), seatsUrl: G("/?p=seats"), creditsUrl: G("/?p=credits") };
  const freeMail = renderDigest({ ...base, unlock: "free" });
  check("two locked companies: Both companies are locked (never All 2)", /Both companies are locked\. Unlock one for 2 credits to see which company is hiring\./.test(freeMail.text) && !/All 2 companies/.test(freeMail.text + freeMail.html), freeMail.text.split("\n")[2]);
  check("All N for three or more", /All 3 companies are locked\./.test(renderDigest({ ...base, newRoles: 3, newRolesMine: 3, newRolesMineHidden: 3, unlock: "free" }).text));
  for (const unlock of ["pro", "day"] as const) {
    const m = renderDigest({ ...base, unlock });
    check(`${unlock === "pro" ? "Trial and Pro" : "Billing off"}: never "Unlock one for 2 credits"`, !/Unlock (one|it) for 2 credits/.test(m.text + m.html) && /Your first company each day opens free/.test(m.text), m.text.split("\n")[2]);
  }
  check("Trial and Pro: Crystal Ball companies open free too", /Your first company each day opens free, and so does any company in your Crystal Ball\./.test(renderDigest({ ...base, unlock: "pro" }).text));
  check("Trial and Pro, none in their function: no 2 credits either", ((m) => /None are in Sales\. Each company stays locked until you open it\. Your first company each day opens free/.test(m.text) && !/2 credits/.test(m.text))(renderDigest({ ...base, newRolesMine: 0, newRolesMineHidden: 0, unlock: "pro" })));
  check(
    "the seats line's Add one is a link to Your seats, signed in",
    freeMail.html.includes(`5 things are still missing on your seats. <a href="${G("/?p=seats").replace(/&/g, "&amp;")}"`) && />Add one<\/a> and you earn a credit\./.test(freeMail.html) && freeMail.text.includes(`5 things are still missing on your seats. Add one and you earn a credit.\n${G("/?p=seats")}`),
    freeMail.html.match(/still missing[^\n]+/)?.[0],
  );
  check("0 credits: the line links to Your credits", freeMail.html.includes(`You have <a href="${G("/?p=credits").replace(/&/g, "&amp;")}"`) && />0 credits<\/a>\./.test(freeMail.html), freeMail.html.match(/You have[^\n]+/)?.[0]);
  const noSeats = renderDigest({ ...base, seatFactsMissing: 0, unlock: "free" });
  check("0 credits and nothing missing: Add a fact you know is the link", />Add a fact you know<\/a> and you earn one\./.test(noSeats.html) && noSeats.text.includes(`You have 0 credits. Add a fact you know and you earn one.\n${G("/?p=credits")}`), noSeats.html.match(/You have[^\n]+/)?.[0]);
  check("the footer links to Notifications", />Notifications<\/a>/.test(freeMail.html) && freeMail.text.includes(`Notifications\n${G("/?p=notifications")}`) && /Choose which emails you get in Notifications/.test(freeMail.text));
  const hireMail = renderDigest({
    ...base,
    newRoles: 0,
    newRolesMine: 0,
    newRolesMineHidden: 0,
    hires: [{ name: "Finance hires", n: 2, functions: ["Finance"], inProfile: true, url: G("/?v=all"), rows: [{ company: "A locked company", function: "Finance", start: "2026-03", url: G("/?v=all&c=c_1") }] }],
  });
  check(
    "a hire found this week that started earlier says added this week, and when it started",
    hireMail.subject === "2 companies that fit your ideal client and hired a fractional Finance leader, added this week" && /Finance · started Mar 2026/.test(hireMail.text) && !/hired a fractional Finance leader this week/.test(hireMail.text + hireMail.html),
    { subject: hireMail.subject, text: hireMail.text.slice(0, 400) },
  );

  failFor = "flo@example.com";
  const n1 = await t.sendDigests(at(0));
  check("one email each, and a failed send doesn't stop the rest", n1 === 3 && outbox.map((m) => m.to).sort().join() === "ada@example.com,mo@example.com,sal@example.com", { n1, to: outbox.map((m) => m.to) });
  check("nobody who opted out or has no email is sent one", !outbox.some((m) => m.to === "opal@example.com" || m.to === ""));
  const d1 = await adminDigest();
  check("the run is recorded: last sent, total sent, opted out", d1.sent === 3 && d1.lastSentAt === at(0) && d1.optedOut === 1, d1);

  failFor = "";
  const n2 = await t.sendDigests(at(1));
  check("a second run inside 6 days only reaches the member whose send failed", n2 === 1 && outbox[outbox.length - 1].to === "flo@example.com", { n2, last: outbox[outbox.length - 1]?.to });

  // The unsubscribe link in a sent email works without signing in; a changed signature doesn't.
  const link = new URL(list.find((x) => x.memberId === "m2")!.data.unsubscribeUrl);
  check("the email carries the member's unsubscribe link", outbox.find((m) => m.to === "mo@example.com")!.text.includes(link.toString()));
  const m = link.searchParams.get("m");
  const s = link.searchParams.get("s")!;
  check("a changed signature is refused", (await t.unsubscribe(m, s.slice(0, -1) + (s.endsWith("A") ? "B" : "A"))) === false && (await t.buildView("tok-mo")).me!.digest === true);
  check("another member's signature is refused", (await t.unsubscribe(m, new URL(sal!.unsubscribeUrl).searchParams.get("s"))) === false);
  check("the link unsubscribes its member", (await t.unsubscribe(m, s)) === true && (await t.buildView("tok-mo")).me!.digest === false);

  // The next week: a new role, and everyone still subscribed gets one again.
  outbox.length = 0;
  await t.applyScan({ roles: [role(1, "Acme Robotics", "Fractional VP Sales", "Sales"), role(4, "Delta Co", "Fractional RevOps Lead", "RevOps")], sources: clean }, at(7));
  const n3 = await t.sendDigests(at(7));
  check("a week later the subscribed members get the next one", n3 === 3 && outbox.map((x) => x.to).sort().join() === "ada@example.com,flo@example.com,sal@example.com", { n3, to: outbox.map((x) => x.to) });
  const week2 = (await t.digestList(at(14), BASE)).length;
  check("a week with no new roles sends nothing", week2 === 0 && (await t.sendDigests(at(14))) === 0, week2);

  outbox.length = 0;
  await t.applyScan({ roles: [role(5, "Epsilon Co", "Fractional CRO at Epsilon Co", "Sales")], sources: clean }, at(21));
  const wk3 = (await t.digestList(at(21), BASE)).find((x) => x.memberId === "m1")?.data;
  check("a role whose title names its company is listed without the name", wk3?.roles?.length === 1 && /^Fractional CRO/.test(wk3.roles[0].title) && !/Epsilon/i.test(JSON.stringify(wk3.roles)), wk3?.roles);
  process.env.RN_DIGEST = "0";
  check("RN_DIGEST=0 keeps it off", (await t.sendDigests(at(21))) === 0 && outbox.length === 0 && (await adminDigest()).enabled === false);
  delete process.env.RN_DIGEST;
  delete process.env.RN_PUBLIC_URL;
  check("without RN_PUBLIC_URL or a request origin nothing is sent", (await t.sendDigests(at(21))) === 0 && outbox.length === 0);
  check("with a request origin the links use it", (await t.sendDigests(at(21), "https://origin.example.com/")) === 3 && outbox.every((x) => x.text.includes("https://origin.example.com/")), outbox.length);
  check("no request went anywhere but the mail provider", otherCalls === 0, otherCalls);

  // The bell (lib/inbox.ts): each weekly email sent is a line in the member's inbox and a row in the alert log, counts only.
  const sb = await t.loadState();
  const boxes = Object.entries(sb.inbox ?? {}).filter(([, l]) => l.some((x) => x.alert === "digest"));
  check("each weekly email sent is a line in that member's bell, linking to Hiring now", boxes.length >= 3 && boxes.every(([, l]) => l.some((x) => x.alert === "digest" && x.href === "/?v=hiring" && x.kind === "roles")), boxes.length);
  check("and a row in the alert log, by email", Object.values(sb.alertLog ?? {}).filter((l) => l.some((r) => r.alert === "digest" && r.channel === "email")).length >= 3);

  // A list alert's email (Stage 7a, renderAlertEmail): each alert its own group and its own one-click turn-off.
  const { renderAlertEmail } = await import("../lib/digest");
  const am = renderAlertEmail({
    name: "Jordan Avery",
    every: "daily",
    groups: [
      { name: "Health care, hiring", lines: [{ text: "A fractional Sales seat ended at Northwind Clinics", url: "https://post.example.com/?c=abc" }, { text: "A locked SaaS company with 11–50 employees raised about $6M (SAFE) · SEC filing, Nov 2026", url: "https://post.example.com/?c=def" }], offUrl: "https://post.example.com/api/table/unsubscribe?m=x&r=alert&a=list%3Aal_1&s=y" },
      { name: "Companies you follow", lines: [{ text: "New at <b>Cedar</b>: the rate", url: "javascript:alert(1)" }], offUrl: "https://post.example.com/api/table/unsubscribe?m=x&r=alert&a=follows&s=z" },
      { name: "Empty", lines: [], offUrl: "" },
    ],
    alertsUrl: "https://post.example.com/?p=alerts",
    appUrl: "https://post.example.com",
    unsubscribeUrl: "https://post.example.com/api/table/unsubscribe?m=x&r=alert&a=list%3Aal_1%2Cfollows&s=w",
  });
  check("an alert email: a subject that counts, an empty group left out", /^3 alerts this morning: Health care, hiring, Companies you follow$/.test(am.subject) && !/Empty/.test(am.text), am.subject);
  check("each group has its own turn-off link", (am.text.match(/Turn this alert off: https:\/\/post\.example\.com\/api\/table\/unsubscribe/g) ?? []).length === 2 && (am.html.match(/Turn this alert off/g) ?? []).length === 2);
  check("its words are escaped, and only web links are links", am.html.includes("&lt;b&gt;Cedar&lt;/b&gt;") && !am.html.includes("javascript:"));
  check("it links to Alerts and workflows, and says why it came", /Alerts and workflows\nhttps:\/\/post\.example\.com\/\?p=alerts/.test(am.text) && /an alert of yours is on/.test(am.text));
  const one = renderAlertEmail({ name: "Jordan", every: "instant", groups: [{ name: "A list", lines: [{ text: "A fractional Sales seat ended at Northwind Clinics", url: "" }], offUrl: "" }], alertsUrl: "", appUrl: "", unsubscribeUrl: "" });
  check("one line: the subject is the line", one.subject === "A fractional Sales seat ended at Northwind Clinics");
  // A workflow's approval email (acceptance F25): a short subject, and the footer in the new names.
  const ask = renderAlertEmail({ name: "Jordan", every: "instant", oneRun: true, groups: [{ name: "Be first in the door", lines: [{ text: "A note waits for your tap: Approve and send. It is skipped if you don't answer in 7 days.", url: "https://post.example.com/?p=messages" }, { text: "A fractional seat ended at Northwind Clinics", url: "" }], offUrl: "https://post.example.com/api/table/unsubscribe?m=x&r=alert&a=wf%3Awf_1&s=y" }], alertsUrl: "https://post.example.com/?p=alerts", appUrl: "https://post.example.com", unsubscribeUrl: "https://post.example.com/u" });
  check("a workflow's email: a short subject, what happened and the workflow", ask.subject === "A note waits for your tap · Be first in the door", ask.subject);
  check("…its footer speaks of workflows: never 'an alert of yours', never 'Alerts and workflows'", /one of your workflows is on/.test(ask.text) && !/an alert of yours|Alerts and workflows|Turn this alert off/.test(ask.text + ask.html) && /Pause this workflow/.test(ask.html), ask.text);

  // "Email me my link" finds a member the way joining does: one Gmail inbox is one account.
  await t.joinMember("Gia Gmail", "gia.mail+post@gmail.com");
  const found = await Promise.all(["gia.mail+post@gmail.com", "GiaMail@googlemail.com", "g.i.a.mail+x@gmail.com"].map((e) => t.memberByEmail(e)));
  check("another spelling of a member's Gmail address finds the same member", found.every((m) => m?.name === "Gia Gmail"), found.map((m) => m?.name ?? null));
  check("a different address finds nobody, and other domains compare as typed", (await t.memberByEmail("gia.mail@example.com")) === null && (await t.memberByEmail("s.al@example.com")) === null && (await t.memberByEmail("SAL@example.com"))?.name === "Sal Sales");
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${String(e?.stack ?? e)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
