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
  check("the email lists the saved view and its new roles", moMail.text.includes("Your saved views\n  Fractional Marketing roles  1 new") && moMail.html.includes("Fractional Marketing roles") && !moMail.text.includes("RevOps roles in Texas"), moMail.text);
  check("the email never names the company of a saved search's match", !moMail.text.includes("Gamma Co") && !moMail.html.includes("Gamma Co"));
  check("everyone with an email who hasn't opted out is on the list", list.map((x) => x.memberId).sort().join() === "m1,m2,m4,m6", list.map((x) => x.memberId));
  delete process.env.RN_DIGEST_ALL;
  const signedIn = (await t.digestList(at(0), BASE)).map((x) => x.memberId);
  check("without RN_DIGEST_ALL only members who have signed in are on the list", !signedIn.includes("m1") && !signedIn.includes("m2") && !signedIn.includes("m4"), signedIn);
  process.env.RN_DIGEST_ALL = "1";
  check("new roles are counted for all functions and for the member's own", sal?.newRoles === 3 && sal.newRolesMine === 2 && mo?.newRolesMine === 1, { sal: sal?.newRolesMine, mo: mo?.newRolesMine });
  check("hidden companies are counted for that member (a seat holder sees their own company)", sal?.newRolesMineHidden === 1 && mo?.newRolesMineHidden === 1, { sal: sal?.newRolesMineHidden, mo: mo?.newRolesMineHidden });
  check("functions come most roles first", JSON.stringify(sal?.byFunction) === JSON.stringify([{ function: "Sales", n: 2 }, { function: "Marketing", n: 1 }]), sal?.byFunction);
  check("facts missing on the member's own seats are counted", sal?.seatFactsMissing === 13 && mo?.seatFactsMissing === 0, { sal: sal?.seatFactsMissing, mo: mo?.seatFactsMissing });
  check("credits, function and links are the member's own", sal?.credits === 25 && sal.function === "Sales" && sal.appUrl === BASE && sal.unsubscribeUrl.startsWith(`${BASE}/api/table/unsubscribe?m=m_`) && sal.unsubscribeUrl !== mo?.unsubscribeUrl, sal);
  check("the app link carries no sign-in code", !sal?.appUrl.includes("tok-") && !sal?.unsubscribeUrl.includes("tok-"));

  // The button opens the list the headline counts: Hiring now in the member's function, with the profile off (f names it).
  const place = (u: string | undefined) => (u ? new URL(u) : null);
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
      salRoles.every((r) => r.function === "Sales" && /^Fractional (VP|Head of) Sales$/.test(r.title) && r.url.startsWith(`${sal!.rolesUrl}&c=`) && /^\d{4}-\d{2}-\d{2}$/.test(r.listed ?? "")) &&
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
  check("a locked role says the credit shows which company is hiring (the hiring contact is a separate unlock)", /to see which company is hiring/.test(moMail.text) && !/see who is hiring/.test(moMail.text + salMail.text), moMail.text.split("\n")[2]);

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
