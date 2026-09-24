import { expect, test } from "@playwright/test";
import { NW, asOperator, goto, postNorthwind, reset, state } from "./helpers";

// Jobs, Prospects and the overview insights inside the operator dashboard.

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await reset(page);
});

const jobRow = (page: import("@playwright/test").Page, title: RegExp | string) => page.getByTestId("job-row").filter({ hasText: title });

test("W-01 jobs are scored for each operator and every mark is theirs alone", async ({ page }) => {
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard/jobs");
  await expect(page.getByTestId("job-row").first()).toBeVisible();
  const cro = jobRow(page, "Fractional CRO");
  const timFit = await cro.locator(".lv-ring b").innerText();
  await cro.getByTestId("job-save").click();
  await expect(cro.getByTestId("job-save")).toHaveAttribute("aria-pressed", "true");
  await jobRow(page, "Interim VP Sales").getByTestId("job-applied").click();
  await jobRow(page, "Part-time Partnerships").getByTestId("job-dismiss").click();
  await expect(jobRow(page, "Part-time Partnerships")).toHaveCount(0);
  await expect(page.getByTestId("seg-saved")).toContainText("1");
  await page.getByTestId("seg-applied").click();
  await expect(jobRow(page, "Interim VP Sales")).toContainText("Applied Sep 24");
  await expect(jobRow(page, "Interim VP Sales")).toContainText("Follow up Sep 29");

  // Another operator sees none of Tim's marks, and a different score.
  await asOperator(page, "Anne Zavorskas");
  await goto(page, "/dashboard/jobs");
  const annCro = jobRow(page, "Fractional CRO");
  await expect(annCro.getByTestId("job-save")).toHaveAttribute("aria-pressed", "false");
  await expect(jobRow(page, "Part-time Partnerships")).toHaveCount(1);
  expect(await annCro.locator(".lv-ring b").innerText()).not.toBe(timFit);

  // Five days later the follow-up shows on Tim's overview, and one tap clears it.
  await page.getByTestId("clock-7d").click();
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard");
  const move = page.getByTestId("next-move").filter({ hasText: "Follow up on Interim VP Sales" });
  await expect(move).toBeVisible();
  await move.getByRole("button", { name: "Done" }).click();
  await expect(move).toHaveCount(0);
  await expect(page.getByTestId("your-pipeline")).toContainText("1Jobs applied");
});

test("W-02 prospects: draft, copy and mark sent, then a reply trains the ranking", async ({ page }) => {
  await asOperator(page, "Tim Evans");
  await goto(page, "/dashboard/prospects");
  const first = page.getByTestId("prospect-row").first();
  await expect(first.getByTestId("find-contact")).toHaveAttribute("href", /linkedin\.com\/search\/results\/people/);
  const company = (await first.getAttribute("data-company"))!;
  await first.getByTestId("prospect-draft-btn").click();
  await expect(first.getByTestId("prospect-draft")).toContainText("I'm Tim Evans");
  await first.getByTestId("prospect-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Subject: ${company}`);
  await expect(page.locator(`[data-testid="prospect-row"][data-company="${company}"]`)).toHaveCount(0);
  await page.getByTestId("seg-active").click();
  const sent = page.locator(`[data-testid="prospect-row"][data-company="${company}"]`);
  await expect(sent.getByTestId("prospect-state")).toContainText("Sent Sep 24 · Follow up Sep 29");
  await sent.getByTestId("prospect-replied").click();
  await expect(sent.getByTestId("prospect-state")).toContainText("Replied");
  await expect(page.getByTestId("prospects-summary")).toContainText("100%");
  await expect(page.getByTestId("prospect-insight")).toContainText("Your replies come from");
  await sent.getByTestId("prospect-meeting").click();
  await page.getByTestId("seg-meetings").click();
  await expect(page.locator(`[data-testid="prospect-row"][data-company="${company}"]`)).toContainText("Meeting booked");
  const s = await state(page);
  expect(s.events.filter((e) => e.type.startsWith("prospect_")).map((e) => e.type)).toEqual(["prospect_sent", "prospect_replied", "prospect_meeting"]);
});

test("W-03 overview: next up leads with the invite, raise-your-fit is re-scored", async ({ page }) => {
  await postNorthwind(page, { invite: ["Anne Zavorskas"] });
  await asOperator(page, "Anne Zavorskas");
  await goto(page, "/dashboard");
  await expect(page.getByTestId("hello-sub")).toContainText("need you");
  await expect(page.getByTestId("next-moves").getByTestId("overview-invite").first()).toHaveAttribute("data-project", NW);
  await expect(page.getByTestId("raise-fit")).toBeVisible();
  const lifts = page.getByTestId("fit-lift");
  if (await lifts.count()) await expect(lifts.first()).toContainText(/roles? (reach a strong fit|score 5\+ points higher)/);
  await expect(page.getByTestId("your-pipeline")).toBeVisible();
});

test("W-04 a rate above the client's take-home range warns, one tap fixes it", async ({ page }) => {
  await postNorthwind(page, { invite: ["Anne Zavorskas"] });
  await asOperator(page, "Anne Zavorskas");
  await goto(page, `/dashboard/projects/${NW}`);
  await expect(page.getByTestId("r-rate")).toHaveValue("235");
  await expect(page.getByTestId("rate-warn")).toContainText("$235 is more than this role pays ($130 to $190/hr)");
  await page.getByTestId("rate-use-max").click();
  await expect(page.getByTestId("r-rate")).toHaveValue("190");
  await expect(page.getByTestId("rate-warn")).toHaveCount(0);
});

test("W-05 the home page has a door for companies and one for operators", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Hire a fractional operator/ })).toHaveAttribute("href", "/buyer/projects");
  await expect(page.getByRole("link", { name: /Find your next engagement/ })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByLabel("Revenue Nomad in numbers")).toContainText("100vetted operators");
});
