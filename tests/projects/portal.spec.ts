import { expect, test } from "@playwright/test";
import { NW, asOperator, postNorthwind, reset } from "./helpers";

// The operator flow lives in the existing Operator Portal (/portal), next to Job Board, Prospects and Profile.

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("P-01 invites show as a badge on the Projects tab and a strip on the Job Board", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await page.goto("/portal");
  await expect(page.getByTestId("portal-tab-board")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("projects-badge")).toHaveText("1");
  await expect(page.getByTestId("projects-strip")).toContainText("1 Revenue Nomad project invite waiting on you");
  await page.getByTestId("projects-strip").getByRole("button", { name: "Open Projects" }).click();
  await expect(page.getByTestId("portal-tab-projects")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sec-invited").locator(`[data-project="${NW}"]`)).toBeVisible();
  for (const tab of ["board", "prospects", "profile"]) await expect(page.getByTestId(`portal-tab-${tab}`)).toBeVisible();
});

test("P-02 one tap confirms availability from the Projects list", async ({ page }) => {
  await asOperator(page, "Tim Evans");
  await expect(page.getByTestId("availability-card").getByTestId("not-confirmed")).toBeVisible();
  await page.getByTestId("still-available").click();
  await expect(page.getByTestId("availability-card").getByTestId("confirmed")).toHaveText("Confirmed Sep 24");
});

test("P-03 old /operator links land in the portal", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await page.goto(`/operator/projects/${NW}`);
  await expect(page).toHaveURL(new RegExp(`/portal\\?view=projects&project=${NW}$`));
  await expect(page.getByTestId("respond-form")).toBeVisible();
  await page.goto("/operator/availability");
  await expect(page.getByTestId("availability-page")).toBeVisible();
});
