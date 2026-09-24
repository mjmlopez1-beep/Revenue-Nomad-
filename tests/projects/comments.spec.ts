import { expect, test } from "@playwright/test";
import { NW, asOperator, asRole, goto, opByName, openBuyerProject, postNorthwind, reset, responseRow, simulate, state } from "./helpers";

const TIM = () => opByName("Tim Evans").slug;

// Changes from the review comments on the published prototype.

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("C-01 operator insights: week over week, ranges, and top search terms; buyer searches feed them", async ({ page }) => {
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.getByTestId("invite-search").fill("Tim Evans");
  await page.waitForTimeout(1000);
  await goto(page, `/operators/${TIM()}?q=hubspot`);
  await expect(page.getByTestId("profile-name")).toHaveText("Tim Evans");
  let s = await state(page);
  expect(s.events.filter((e) => e.type === "search_impression" && e.meta?.term === "tim evans").length).toBeGreaterThan(0);
  expect(s.events.find((e) => e.type === "profile_viewed")!.meta).toMatchObject({ term: "hubspot", source: "search" });
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard/insights");
  await expect(page.getByTestId("kpi-views")).toContainText("vs previous 30 days");
  const views30 = await page.getByTestId("kpi-views").locator("b").innerText();
  await page.getByTestId("range-90").click();
  await expect(page.getByTestId("kpi-views")).toContainText("vs previous 90 days");
  expect(Number((await page.getByTestId("kpi-views").locator("b").innerText()).replace(/,/g, ""))).toBeGreaterThan(Number(views30.replace(/,/g, "")));
  await expect(page.getByTestId("term-row")).toHaveCount(5);
  await expect(page.getByTestId("chart-views")).toBeVisible();
  await expect(page.getByTestId("chart-compares")).toBeVisible();
  // Viewing your own profile never counts.
  await goto(page, `/operators/${TIM()}`);
  s = await state(page);
  expect(s.events.filter((e) => e.type === "profile_viewed")).toHaveLength(1);
});

test("C-02 company profile drives company fit on responses, live match and profiles", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await simulate(page, ["Tim Evans", "Matt Lopez"]);
  await asRole(page, "buyer");
  await goto(page, "/buyer/company");
  await page.getByTestId("cp-stage").getByRole("button", { name: "Series A" }).click();
  await expect(page.getByTestId("cp-stage").getByRole("button", { name: "Series A" })).toHaveAttribute("aria-pressed", "true");
  const s = await state(page);
  expect(s.buyerProfiles!["buyer-northwind"].stage).toBe("series_a");
  await goto(page, `/buyer/projects/${NW}`);
  await expect(responseRow(page, "Tim Evans").getByTestId("company-fit")).toContainText("company fit");
  await goto(page, `/operators/${TIM()}`);
  await expect(page.getByTestId("profile-company-fit")).toBeVisible();
  await goto(page, "/buyer/projects");
  await page.getByTestId("new-project").click();
  await page.getByTestId("tpl-vp-sales").click();
  await expect(page.getByTestId("lm-company")).toContainText("Series A");
  await expect(page.getByTestId("lm-company-fit").first()).toBeVisible();
});

test("C-03 seat form: empty live match, function picklist, standard-title templates, no paste box", async ({ page }) => {
  await asRole(page, "buyer");
  await page.getByTestId("new-project").click();
  await expect(page.getByTestId("lm-empty")).toBeVisible();
  await expect(page.getByTestId("lm-70")).toHaveCount(0);
  await expect(page.getByText("Or paste a job description")).toHaveCount(0);
  await expect(page.getByTestId("tpl-cmo")).toContainText("Chief Marketing Officer");
  await expect(page.getByTestId("tpl-ai-architect")).toContainText("GTM AI Architect");
  await expect(page.getByTestId("tpl-cro")).toContainText("Chief Revenue Officer");
  await page.getByTestId("f-function").getByRole("button", { name: "Marketing", exact: true }).click();
  await expect(page.getByText("Matching on Marketing operators.")).toBeVisible();
  await page.getByTestId("f-titles").getByRole("button", { name: "VP of Marketing" }).click();
  await expect(page.getByTestId("f-title")).toHaveValue("Fractional VP of Marketing");
  await expect(page.getByTestId("lm-70")).toBeVisible();
});

test("C-04 invite filters narrow the list; buyers see hours, rate and location flags, not completeness", async ({ page }) => {
  await postNorthwind(page, { invite: ["Matt Lopez"] });
  await simulate(page, ["Matt Lopez"]);
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.getByTestId("flt-cat").selectOption("Marketing");
  await expect(page.getByTestId("invite-matchline")).toContainText("with 1 filter");
  const n = Number((await page.getByTestId("invite-matchline").innerText()).match(/^(\d+)/)![1]);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(100);
  await page.getByTestId("flt-rep").selectOption("60");
  await expect(page.getByTestId("invite-matchline")).toContainText("with 2 filters");
  await page.getByTestId("flt-clear").click();
  await expect(page.getByTestId("invite-matchline")).toContainText("All 100 live profiles");
  await expect(page.getByTestId("completeness")).toHaveCount(0);
  await openBuyerProject(page);
  const row = responseRow(page, "Matt Lopez");
  await expect(row.getByTestId("flag-rate")).toHaveText("$150/hr over budget");
  await expect(row.getByTestId("flag-location")).toContainText("on site in Austin");
  await expect(row.getByTestId("completeness")).toHaveCount(0);
});
