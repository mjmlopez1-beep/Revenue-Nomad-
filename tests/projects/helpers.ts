import { expect, type Locator, type Page } from "@playwright/test";

export const NW = "proj-northwind-vps";
export const HARBOR = "proj-harbor-revops";

export interface Snapshot {
  projects: { id: string; status: string; visibility: string; postedAt: number | null; staffedAt: number | null }[];
  invites: { projectId: string; operatorId: string; source: string; sentAt: number; silent?: boolean }[];
  alerts: { projectId: string; operatorId: string }[];
  responses: { projectId: string; operatorId: string; draft: boolean; submittedAt: number | null; interest: string; decision: string; rate: number | null }[];
  outbox: { kind: string; to: { name: string; id: string }; subject: string; body: string; operatorId?: string }[];
  events: { type: string; at: number; projectId?: string; operatorId?: string; meta?: Record<string, unknown> }[];
  intros: { projectId: string; operatorId: string; status: string }[];
  pipeline: { projectId: string; operatorId: string; stage: string }[];
  shortlists: unknown[];
  questions: unknown[];
}

/** Every test starts from "Reset demo data" in the prototype bar. */
export async function reset(page: Page, path = "/buyer/projects") {
  await page.goto(path);
  await page.getByTestId("reset-demo").click();
  await expect(page.getByTestId("outbox-count")).toHaveText("0");
  if (path !== "/buyer/projects") await page.goto(path);
}

export async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("rnp:state:v1") || "{}"));
}

import seedOperators from "../../projects/seed/operators.json";
export const SEED = seedOperators as unknown as { id: string; name: string; slug: string; cat: string; role: string; allTags: string[]; photo: string | null; rate: number | null; hrs: number; reputation: number }[];
export const opByName = (n: string) => SEED.find((o) => o.name === n)!;

export async function asRole(page: Page, role: "buyer" | "operator" | "admin") {
  await page.getByTestId(`role-${role}`).click();
  await expect(page.getByTestId(`role-${role}`)).toHaveAttribute("aria-pressed", "true");
}

export async function asOperator(page: Page, name: string) {
  await asRole(page, "operator");
  const picker = page.getByTestId("operator-picker");
  await picker.fill(name);
  await expect(page.getByTestId("signed-in-as")).toContainText(name);
  // Operators land on Overview; most scenarios start from the Projects list.
  await goto(page, "/dashboard/projects");
}

/** Operator screens live in the operator dashboard; mirror the app's alias for old /operator paths. */
export function portalPath(to: string): string {
  const [path, q = ""] = to.split("?");
  const qs = q ? `?${q}` : "";
  if (path === "/operator/roles") return `/dashboard/projects?tab=open${q ? `&${q}` : ""}`;
  if (path === "/operator" || path === "/operator/projects") return `/dashboard/projects${qs}`;
  if (path.startsWith("/operator/")) return `/dashboard/${path.slice("/operator/".length)}${qs}`;
  return to;
}

export async function goto(page: Page, path: string) {
  const target = portalPath(path);
  const onPortal = new URL(page.url()).pathname === "/portal";
  const toPortal = target.startsWith("/portal");
  if (onPortal !== toPortal) {
    // The portal and the Projects pages are separate Next.js pages: a real page load.
    await page.goto(target);
    return;
  }
  // Same page: in-app navigation keeps state and mirrors a normal click through.
  await page.evaluate((p) => {
    window.history.pushState(window.history.state, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, target);
  await page.waitForTimeout(50);
}

export async function openOutbox(page: Page) {
  await page.getByTestId("open-outbox").click();
  await expect(page.getByTestId("outbox")).toBeVisible();
}
export async function closeOutbox(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("outbox")).toBeHidden();
}

export function mail(page: Page, opts: { kind?: string; to?: string; subject?: string | RegExp } = {}): Locator {
  let loc = page.getByTestId("outbox-entry");
  if (opts.kind) loc = loc.and(page.locator(`[data-kind="${opts.kind}"]`));
  if (opts.to) loc = loc.and(page.locator(`[data-to="${opts.to}"]`));
  if (opts.subject) loc = loc.filter({ hasText: opts.subject });
  return loc;
}

/** Open the outbox, click a link in the newest matching entry, which signs in as its recipient. */
export async function followMail(page: Page, opts: { kind?: string; to?: string; subject?: string | RegExp }, link?: string | RegExp) {
  await openOutbox(page);
  await page.getByTestId("outbox-filter").fill(opts.to || "");
  const entry = mail(page, opts).first();
  await expect(entry).toBeVisible();
  const a = link ? entry.getByRole("link", { name: link }).first() : entry.getByRole("link").first();
  await a.click();
  await expect(page.getByTestId("outbox")).toBeHidden();
}

export async function inviteByName(page: Page, name: string) {
  await page.getByTestId("invite-search").fill(name);
  const row = page.getByTestId("invite-row").and(page.locator(`[data-op="${name}"]`));
  await row.getByRole("button", { name: `Invite ${name}` }).click();
  await expect(row.getByText("Invited", { exact: true })).toBeVisible();
}

/** Post the seeded Northwind draft as Jordan Ellis. */
export async function postNorthwind(page: Page, opts: { invite?: string[]; visibility?: "invite_only" | "open"; suggestions?: boolean } = {}) {
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.getByTestId(opts.visibility === "invite_only" ? "vis-invite-only" : "vis-open").click();
  for (const n of opts.invite || []) await inviteByName(page, n);
  const sug = page.getByTestId("wants-suggestions");
  if (opts.suggestions === false && (await sug.isChecked())) await sug.uncheck();
  if (opts.suggestions === true && !(await sug.isChecked())) await sug.check();
  await page.getByTestId("post-project").click();
  await expect(page.getByTestId("project-msg")).toContainText("Posted");
}

export async function respond(
  page: Page,
  name: string,
  project = NW,
  r: { rate?: string; hours?: string; start?: string; answers?: string[]; note?: string } = {},
) {
  await asOperator(page, name);
  await goto(page, `/operator/projects/${project}`);
  await expect(page.getByTestId("respond-form")).toBeVisible();
  if (r.rate !== undefined) await page.getByTestId("r-rate").fill(r.rate);
  if (r.hours !== undefined) await page.getByTestId("r-hours").fill(r.hours);
  if (r.start !== undefined) await page.getByTestId("r-start").fill(r.start);
  const qs = await page.locator('[data-testid^="r-answer-"]').count();
  for (let i = 0; i < qs; i++) await page.getByTestId(`r-answer-${i}`).fill(r.answers?.[i] ?? `Answer ${i + 1} from ${name}.`);
  if (r.note) await page.getByTestId("r-note").fill(r.note);
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-view")).toBeVisible();
}

export async function simulate(page: Page, names: string[], project = NW) {
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${project}`);
  for (const n of names) {
    const sel = page.getByTestId("sim-op");
    const value = await sel.locator("option", { hasText: new RegExp(`^${n},`) }).getAttribute("value");
    expect(value, `simulate: ${n} must be invited or alerted`).toBeTruthy();
    await sel.selectOption(value!);
    await page.getByTestId("sim-send").click();
    await expect(page.getByTestId("admin-msg")).toContainText("Simulated response added");
  }
}

export function responseRow(page: Page, name: string) {
  return page.getByTestId("response-row").and(page.locator(`[data-op="${name}"]`));
}

export async function openBuyerProject(page: Page, view?: "review" | "intro" | "notfit" | "all") {
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}`);
  if (view) await page.getByTestId(`view-${view}`).click();
}

export async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, "page must not scroll sideways").toBeLessThanOrEqual(cw);
}
