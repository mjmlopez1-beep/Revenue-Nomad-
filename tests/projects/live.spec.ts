import { expect, test } from "@playwright/test";
import { NW, asOperator, asRole, goto, openBuyerProject, postNorthwind, reset, respond, responseRow, simulate, state } from "./helpers";

// Operator dashboard in the live revenuenomad.com layout (canvas L1 to L4).

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("L-01 overview shows the invite, the Projects badge and the live nav", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard");
  const nav = page.getByRole("navigation", { name: "Dashboard" });
  for (const l of ["Overview", "Projects", "Jobs", "Prospects", "Intros", "My Profile"]) await expect(nav.getByRole("link", { name: new RegExp(`^${l}`) })).toBeVisible();
  await expect(page.getByTestId("projects-badge")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "Welcome back, Tim." })).toBeVisible();
  const invite = page.getByTestId("overview-invite").and(page.locator(`[data-project="${NW}"]`));
  await expect(invite).toContainText("Invited by client");
  await expect(invite).toContainText("New");
  await invite.getByRole("link", { name: "Respond" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${NW}$`));
  await expect(page.getByTestId("respond-form")).toBeVisible();
});

test("L-02 projects tabs, search, scope and take-home", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard/projects");
  await expect(page.getByTestId("sec-invited").locator(`[data-project="${NW}"]`)).toContainText("Sales has been founder-led to $12M ARR");
  await page.getByTestId("lv-tab-responded").click();
  await expect(page.getByTestId("sec-invited")).toHaveCount(0);
  await page.getByTestId("lv-tab-all").click();
  await page.getByLabel("Search projects").fill("zzz");
  await expect(page.getByText('Nothing matches "zzz".')).toBeVisible();
  await page.getByLabel("Search projects").fill("founder-led");
  await expect(page.locator(`[data-testid="portal-item"][data-project="${NW}"]`)).toBeVisible();
  await goto(page, `/dashboard/projects/${NW}`);
  // Budget is $175-$250; operators see take-home after the standard 25% margin, never the budget.
  await expect(page.getByTestId("rate-to-you")).toHaveText("$130 to $190/hr");
  await expect(page.locator("main")).not.toContainText("$175");
  await expect(page.locator("main")).not.toContainText("$250");
});

test("L-03 attached case studies reach the client", async ({ page }) => {
  await postNorthwind(page, { invite: ["Matt Lopez"] });
  await asOperator(page, "Matt Lopez");
  await goto(page, `/dashboard/projects/${NW}`);
  // Matt's $300 rate is above the $250 top of the budget; the reason must not name the budget (G17).
  await expect(page.getByTestId("why-card")).toContainText("$300/hr is above the client's range");
  await expect(page.locator("main")).not.toContainText("$250");
  await page.getByTestId("choose-proof").click();
  await page.getByLabel(/^Ferry,/).check();
  await page.getByTestId("r-answer-0").fill("a");
  await page.getByTestId("r-answer-1").fill("b");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-view")).toBeVisible();
  await openBuyerProject(page);
  await expect(responseRow(page, "Matt Lopez").getByTestId("resp-proof")).toHaveText("Case studies attached: Ferry");
});

test("L-04 a response can be edited until the client opens it", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await page.getByTestId("edit-response").click();
  await page.getByTestId("r-rate").fill("190");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-now")).toHaveText("Responded");
  let s = await state(page);
  expect(s.responses.filter((r) => r.projectId === NW)).toHaveLength(1);
  expect(s.responses[0].rate).toBe(190);
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("view-response").click();
  await asOperator(page, "Tim Evans");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByTestId("status-now")).toHaveText("Client viewed");
  await expect(page.getByTestId("edit-response")).toHaveCount(0);
  await expect(page.getByText("The client read your response")).toBeVisible();
  s = await state(page);
  expect(s.responses[0].rate).toBe(190);
});

test("L-05 stage panels: intro, selected, and not selected", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await respond(page, "Matt Lopez", NW, { rate: "300", hours: "30" });
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await asOperator(page, "Tim Evans");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByTestId("intro-card")).toContainText("Northwind Health wants to talk");
  await openBuyerProject(page, "intro");
  await responseRow(page, "Tim Evans").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await asOperator(page, "Tim Evans");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByRole("heading", { name: "You're selected" })).toBeVisible();
  await expect(page.getByText("Oct 15, 2026")).toBeVisible();
  await asOperator(page, "Matt Lopez");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByRole("heading", { name: "The client went another direction" })).toBeVisible();
  await expect(page.getByTestId("op-project-status")).toHaveText("Not selected");
});

test("L-06 pass with a reason and a note; admin reports carry the reason", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, `/dashboard/projects/${NW}`);
  await page.getByTestId("mode-pass").click();
  await page.getByRole("button", { name: "Industry", exact: true }).click();
  await page.getByTestId("pass-note").fill("Healthcare is not my space.");
  await page.getByTestId("pass-project").click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  const s = await state(page);
  expect(s.events.find((e) => e.type === "response_declined")!.meta).toMatchObject({ reason: "Industry", note: "Healthcare is not my space." });
  await asRole(page, "admin");
  await goto(page, "/admin/reports");
  await expect(page.locator('[data-testid="decline-reason"][data-reason="Industry"]')).toContainText("1");
});

test("L-07 one tap confirms availability; old /operator and portal links land in the dashboard", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard/projects");
  await page.getByTestId("still-available").click();
  await expect(page.getByTestId("availability-card").getByTestId("confirmed")).toHaveText("Availability confirmed Sep 24");
  await page.goto(`/operator/projects/${NW}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${NW}$`));
  // The Operator Portal now lives in the dashboard.
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/dashboard\/jobs$/);
  await page.goto("/portal?view=prospects");
  await expect(page).toHaveURL(/\/dashboard\/prospects/);
  await page.goto(`/portal?view=projects&project=${NW}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${NW}`));
});

test("L-08 simulated responders show in the operator's count on Client viewed", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Matt Lopez", "Guillermo Mairena"]);
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("view-response").click();
  await asOperator(page, "Tim Evans");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByText("You are one of 3 operators they are reviewing")).toBeVisible();
});
