import { expect, test, type Page } from "@playwright/test";
import {
  HARBOR,
  NW,
  SEED,
  asOperator,
  asRole,
  closeOutbox,
  followMail,
  goto,
  inviteByName,
  mail,
  openBuyerProject,
  openOutbox,
  opByName,
  postNorthwind,
  reset,
  respond,
  responseRow,
  simulate,
  state,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await reset(page);
});

async function publishHarbor(page: Page, invite: string[]) {
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${HARBOR}/setup`);
  for (const n of invite) await inviteByName(page, n);
  await page.getByTestId("rn-publish").click();
  await expect(page.getByTestId("pipeline")).toBeVisible();
}

test("A-01 KPIs and funnel equal counts in the store", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez", "Anne Zavorskas"], visibility: "open" });
  await asRole(page, "admin");
  const s = await state(page);
  await expect(page.getByTestId("kpi-live").locator(".stat-v")).toHaveText(String(s.projects.filter((p) => p.status === "live").length));
  await expect(page.getByTestId("kpi-invites").locator(".stat-v")).toHaveText(String(s.invites.length));
  await expect(page.getByTestId("kpi-alerts").locator(".stat-v")).toHaveText(String(s.alerts.length));
  await expect(page.getByTestId("kpi-responses").locator(".stat-v")).toHaveText("0");
  expect(s.invites.length).toBe(3);
  expect(s.alerts.length).toBe(62);
  const row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByTestId("row-invited")).toHaveText("3");
  await goto(page, `/admin/projects/${NW}`);
  await expect(page.getByTestId("f-invited").locator(".stat-v")).toHaveText("3");
  await expect(page.getByTestId("f-alerted").locator(".stat-v")).toHaveText("62");
  await expect(page.getByTestId("f-responded").locator(".stat-v")).toHaveText("0");
});

test("A-02 three suggestions become rn_suggested invites, a fourth is blocked", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"], suggestions: true });
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${NW}`);
  const picked: string[] = [];
  for (let i = 0; i < 3; i++) {
    const btn = page.getByTestId("add-suggestion").first();
    picked.push((await btn.getAttribute("aria-label"))!.replace("Suggest ", ""));
    await btn.click();
    await expect(page.getByTestId("suggestions-used")).toHaveText(`${i + 1} of 3 used`);
  }
  await page.getByTestId("add-suggestion").first().click();
  await expect(page.getByTestId("admin-msg")).toHaveText("All 3 suggestions are used on this project.");
  const s = await state(page);
  expect(s.invites.filter((i) => i.source === "rn_suggested")).toHaveLength(3);
  await simulate(page, [picked[0]]);
  await openBuyerProject(page);
  await expect(responseRow(page, picked[0]).getByTestId("response-source")).toHaveText("Suggested by Revenue Nomad");
});

test("A-03 admin view of a buyer project is read only", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans"]);
  await expect(page.getByTestId("admin-response-row")).toHaveCount(1);
  await expect(page.getByTestId("buyer-action")).toHaveText("To review");
  for (const id of ["request-intro", "not-a-fit", "select", "undo", "pass-weak"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByText("Read only, the buyer runs this project")).toBeVisible();
});

test("A-04 nudge buyer sends an outbox entry and logs an event", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${NW}`);
  await page.getByTestId("nudge-open").click();
  await page.getByTestId("nudge-text").fill("Jordan, want us to add suggestions?");
  await page.getByTestId("nudge-send").click();
  await expect(page.getByTestId("admin-msg")).toContainText("Nudge sent to Jordan Ellis");
  await openOutbox(page);
  await expect(mail(page, { kind: "nudge", to: "Jordan Ellis" })).toContainText("want us to add suggestions?");
  await closeOutbox(page);
  const s = await state(page);
  expect(s.events.filter((e) => e.type === "nudge_sent" && e.projectId === NW)).toHaveLength(1);
  await expect(page.getByTestId("activity")).toContainText("Buyer nudged");
});

test("A-05 three days with no responses flags the project", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"], visibility: "invite_only", suggestions: false });
  await asRole(page, "admin");
  const row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByText("No responses in 72 hrs")).toHaveCount(0);
  await page.getByTestId("clock-1d").click();
  await page.getByTestId("clock-1d").click();
  await expect(row.getByText("No responses in 72 hrs")).toHaveCount(0);
  await page.getByTestId("clock-1d").click();
  await expect(row.getByText("No responses in 72 hrs")).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("Sun, Sep 27");
  await openBuyerProject(page);
  await expect(page.getByTestId("nudge-widen")).toBeVisible();
});

test("A-06 Harbor economics, and operators only see $160", async ({ page }) => {
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${HARBOR}/setup`);
  await expect(page.getByTestId("rn-spread").locator(".stat-v")).toHaveText("$40/hr");
  await expect(page.getByTestId("rn-margin").locator(".stat-v")).toHaveText("20%");
  await expect(page.getByTestId("rn-month")).toContainText("Per month at 45 hrs");
  await expect(page.getByTestId("rn-month").locator(".stat-v")).toHaveText("$1,800");
  await inviteByName(page, "Matt Lopez");
  await page.getByTestId("rn-publish").click();
  await expect(page.getByTestId("rn-econ")).toContainText("$200 bill · $160 to operator · 20%");
  await followMail(page, { kind: "invite", to: "Matt Lopez" });
  await expect(page.getByTestId("rate-to-you")).toHaveText("$160/hr");
  const text = await page.locator("main").innerText();
  expect(text).not.toContain("$200");
  expect(text).not.toContain("Harbor Logistics");
  await openOutbox(page);
  const body = await mail(page, { kind: "invite", to: "Matt Lopez" }).innerText();
  expect(body).toContain("$160/hr");
  expect(body).not.toContain("$200");
});

test("A-07 moving a Harbor operator to Selected staffs the project (rule 5)", async ({ page }) => {
  await publishHarbor(page, ["Jose Robledo", "Matt Lopez"]);
  await respond(page, "Jose Robledo", HARBOR, { rate: "160", hours: "45" });
  await respond(page, "Matt Lopez", HARBOR, { rate: "160", hours: "40" });
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${HARBOR}`);
  const jose = page.getByTestId("pipeline-card").and(page.locator('[data-op="Jose Robledo"]'));
  await expect(page.getByTestId("col-responded").getByTestId("pipeline-card")).toHaveCount(2);
  await jose.getByTestId("move-next").click();
  await expect(page.getByTestId("col-shortlisted").getByTestId("pipeline-card")).toHaveCount(1);
  await page.getByTestId("pipeline-card").and(page.locator('[data-op="Jose Robledo"]')).getByTestId("move-any").selectOption("selected");
  await expect(page.getByTestId("staffed-banner")).toContainText("Jose Robledo");
  const s = await state(page);
  expect(s.projects.find((p) => p.id === HARBOR)!.status).toBe("staffed");
  expect(s.outbox.filter((m) => m.kind === "selected").map((m) => m.to.name)).toEqual(["Jose Robledo"]);
  expect(s.outbox.filter((m) => m.kind === "close").map((m) => m.to.name)).toEqual(["Matt Lopez"]);
  expect(s.pipeline.find((e) => e.operatorId === opByName("Matt Lopez").id)!.stage).toBe("not_selected");
});

test("A-08 the shortlist to the client has only shortlisted operators, no operator rate or notes", async ({ page }) => {
  await publishHarbor(page, ["Jose Robledo", "Matt Lopez"]);
  await respond(page, "Jose Robledo", HARBOR, { rate: "160", hours: "45" });
  await respond(page, "Matt Lopez", HARBOR, { rate: "160", hours: "40" });
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${HARBOR}`);
  const jose = page.getByTestId("pipeline-card").and(page.locator('[data-op="Jose Robledo"]'));
  await jose.getByPlaceholder("Admin note").fill("Internal: pushed hard on comp");
  await jose.getByPlaceholder("Admin note").blur();
  await jose.getByTestId("move-next").click();
  await page.getByTestId("send-shortlist").click();
  await expect(page.getByTestId("admin-msg")).toContainText("Shortlist sent");
  await openOutbox(page);
  const entry = mail(page, { kind: "shortlist" });
  await expect(entry).toHaveCount(1);
  const text = await entry.innerText();
  expect(text).toContain("Jose Robledo");
  expect(text).not.toContain("Matt Lopez");
  expect(text).not.toContain("160");
  expect(text).not.toContain("pushed hard on comp");
  await entry.getByRole("link", { name: "Review the shortlist" }).click();
  await expect(page.getByTestId("shortlist-op")).toHaveCount(1);
  await expect(page.getByTestId("shortlist-op")).toContainText("Jose Robledo");
  const client = await page.getByTestId("client-shortlist").innerText();
  expect(client).not.toContain("160");
  expect(client).not.toContain("pushed hard");
});

test("A-09 paging through operators at 10 per page is complete and stable", async ({ page }) => {
  await asRole(page, "admin");
  await goto(page, "/admin/operators");
  const seen: string[] = [];
  const pages: string[][] = [];
  for (let i = 1; i <= 10; i++) {
    await expect(page.getByTestId("ops-count")).toContainText(`page ${i} of 10`);
    const ids = await page.getByTestId("op-dir-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));
    expect(ids).toHaveLength(10);
    pages.push(ids);
    seen.push(...ids);
    if (i < 10) await page.getByTestId("page-next").click();
  }
  expect(new Set(seen).size).toBe(100);
  await page.goto("/admin/operators?page=3");
  const again = await page.getByTestId("op-dir-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));
  expect(again).toEqual(pages[2]);
});

test("A-10 every seeded operator is findable by their role and first tag", async ({ page }) => {
  test.setTimeout(240_000);
  await asRole(page, "admin");
  await goto(page, "/admin/operators");
  const missing: string[] = [];
  for (const o of SEED) {
    await page.getByTestId("ops-search").fill(`${o.role} ${o.allTags[0]}`);
    let found = false;
    for (let pg = 0; pg < 10 && !found; pg++) {
      found = (await page.locator(`[data-testid="op-dir-row"][data-id="${o.id}"]`).count()) > 0;
      if (!found) {
        const next = page.getByTestId("page-next");
        if (await next.isDisabled()) break;
        await next.click();
      }
    }
    if (!found) missing.push(o.name);
    await page.getByTestId("ops-search").fill("");
    await goto(page, "/admin/operators");
  }
  expect(missing).toEqual([]);
});

test("A-11 reports match the event log", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await page.getByTestId("clock-1d").click();
  await simulate(page, ["Matt Lopez"]);
  await asOperator(page, "Guillermo Mairena");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("mode-pass").click();
  await page.getByLabel("Timing doesn't work").check();
  await page.getByTestId("pass-project").click();
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await asRole(page, "admin");
  await goto(page, "/admin/reports");
  const s = await state(page);
  const ev = s.events.filter((e) => e.projectId === NW);
  const reached = new Set(ev.filter((e) => e.type === "invite_sent" || e.type === "alert_sent").map((e) => e.operatorId)).size;
  const responders = new Set(ev.filter((e) => e.type === "response_submitted").map((e) => e.operatorId)).size;
  const intros = new Set(ev.filter((e) => e.type === "intro_requested").map((e) => e.operatorId)).size;
  const posted = ev.find((e) => e.type === "project_posted")!.at;
  const first = Math.min(...ev.filter((e) => e.type === "response_submitted").map((e) => e.at));
  expect([reached, responders, intros]).toEqual([64, 2, 1]);
  const row = page.getByTestId("report-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByTestId("rep-reached")).toHaveText(String(reached));
  await expect(row.getByTestId("rep-responders")).toHaveText(String(responders));
  await expect(row.getByTestId("rep-rate")).toHaveText(`${Math.round((responders / reached) * 100)}%`);
  await expect(row.getByTestId("rep-intros")).toHaveText(String(intros));
  await expect(row.getByTestId("rep-intro-rate")).toHaveText(`${Math.round((intros / responders) * 100)}%`);
  const mins = Math.round((first - posted) / 60000);
  await expect(row.getByTestId("rep-first")).toHaveText(`${mins} min`);
  await expect(page.locator('[data-testid="decline-reason"][data-reason="Timing doesn\'t work"]')).toContainText("1");
  await expect(page.locator('[data-testid="alerts-role"][data-role="Sales Leadership"]')).toContainText(String(s.alerts.length));
});

test("A-12 operators with 120+ hours show Check hours", async ({ page }) => {
  await asRole(page, "admin");
  await goto(page, "/admin/operators");
  for (const o of SEED.filter((x) => x.hrs >= 120)) {
    await page.getByTestId("ops-search").fill(o.name);
    await expect(page.locator(`[data-testid="op-dir-row"][data-id="${o.id}"]`).getByTestId("check-hours")).toBeVisible();
  }
  await page.getByTestId("ops-search").fill("Matt Lopez");
  await expect(page.locator(`[data-testid="op-dir-row"][data-id="${opByName("Matt Lopez").id}"]`).getByTestId("check-hours")).toHaveCount(0);
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans"]);
  await expect(page.getByTestId("admin-response-row").getByTestId("check-hours")).toBeVisible();
});
