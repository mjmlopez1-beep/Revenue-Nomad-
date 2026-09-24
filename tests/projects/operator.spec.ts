import { expect, test } from "@playwright/test";
import {
  NW,
  asOperator,
  asRole,
  closeOutbox,
  followMail,
  goto,
  mail,
  openBuyerProject,
  openOutbox,
  opByName,
  postNorthwind,
  reset,
  respond,
  responseRow,
  state,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("O-01 invite link signs Tim in with no password and opens the project", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await followMail(page, { kind: "invite", to: "Tim Evans" }, "View and respond");
  await expect(page).toHaveURL(new RegExp(`/portal\\?view=projects&project=${NW}$`));
  await expect(page.getByTestId("signed-in-as")).toContainText("Tim Evans");
  await expect(page.getByTestId("portal-tab-projects")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("role-operator")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("respond-form")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("O-02 alerted operator sees the project but it is not in the portal until he responds", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await followMail(page, { kind: "alert", to: "Guillermo Mairena" }, "See the role");
  await expect(page.getByTestId("signed-in-as")).toContainText("Guillermo Mairena");
  await expect(page.getByTestId("not-in-portal")).toBeVisible();
  await expect(page.getByTestId("op-source")).toHaveText("Open role alert");
  await goto(page, "/operator/projects");
  await expect(page.locator(`[data-testid="portal-item"][data-project="${NW}"]`)).toHaveCount(0);
  await expect(page.getByTestId("open-roles-count")).toHaveText("1");
  await respond(page, "Guillermo Mairena", NW, { rate: "180", hours: "30" });
  await goto(page, "/operator/projects");
  await expect(page.getByTestId("sec-responded").locator(`[data-project="${NW}"]`)).toBeVisible();
});

test("O-03 a saved draft is kept, hidden from the buyer, and stays in Invited", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("r-rate").fill("210");
  await page.getByTestId("r-answer-0").fill("Half-written answer");
  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Draft saved. The buyer never sees a draft.")).toBeVisible();
  await goto(page, "/operator/projects");
  const item = page.getByTestId("sec-invited").locator(`[data-project="${NW}"]`);
  await expect(item.getByTestId("op-status")).toHaveText("Draft saved");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("draft-note")).toBeVisible();
  await expect(page.getByTestId("r-rate")).toHaveValue("210");
  await expect(page.getByTestId("r-answer-0")).toHaveValue("Half-written answer");
  await openBuyerProject(page, "all");
  await expect(page.getByTestId("tab-responses")).toHaveText("Responses (0)");
  await expect(page.getByTestId("response-row")).toHaveCount(0);
});

test("O-04 a full response shows on B4 with the right score", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25", start: "2026-10-01", answers: ["I built one at Acme.", "Hired two AEs in Q1."] });
  await expect(page.getByTestId("status-now")).toHaveText("Responded");
  await openBuyerProject(page);
  const row = responseRow(page, "Tim Evans");
  await expect(row.getByTestId("fit-score").first()).toContainText("90");
  await expect(row).toContainText("$200/hr · 25 hrs · Start Oct 1");
  await row.getByTestId("view-response").click();
  await expect(row.getByTestId("response-detail")).toContainText("I built one at Acme.");
  await expect(row.getByTestId("response-detail")).toContainText("Hired two AEs in Q1.");
});

test("O-05 hours above the profile are accepted with a warning and scored", async ({ page }) => {
  // Tanya Helin lists 15 hrs a month and no rate: hours part is 12/20 on her profile.
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tanya Helin");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("r-rate").fill("200");
  await page.getByTestId("r-hours").fill("25");
  await expect(page.getByTestId("hours-warning")).toContainText("more than the 15 on your profile");
  await page.getByTestId("r-answer-0").fill("a");
  await page.getByTestId("r-answer-1").fill("b");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-view")).toBeVisible();
  await expect(page.getByTestId("hours-warning")).toBeVisible();
  await openBuyerProject(page);
  const row = responseRow(page, "Tanya Helin");
  await expect(row.getByTestId("part-3")).toHaveText("20/20");
});

test("O-06 an operator question reaches the buyer and the outbox", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("ask-text").fill("How big is the current sales team?");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("my-question")).toContainText("How big is the current sales team?");
  await openOutbox(page);
  await expect(mail(page, { kind: "question", to: "Jordan Ellis" })).toContainText("How big is the current sales team?");
  await closeOutbox(page);
  await openBuyerProject(page);
  await page.getByTestId("tab-questions").click();
  await expect(page.getByTestId("question")).toContainText("How big is the current sales team?");
});

test("O-07 not for me needs a reason, then closes without a buyer row", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("mode-pass").click();
  await page.getByTestId("pass-project").click();
  await expect(page.getByText("Pick a reason so we can send better matches.").first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`project=${NW}$`));
  await page.getByLabel("Rate is too low").check();
  await page.getByTestId("pass-project").click();
  await expect(page).toHaveURL(/\/portal\?view=projects$/);
  await expect(page.getByTestId("sec-closed").locator(`[data-project="${NW}"]`)).toContainText("You passed: Rate is too low");
  await openBuyerProject(page, "all");
  await expect(page.getByTestId("tab-responses")).toHaveText("Responses (0)");
});

test("O-08 buyer opening the response shows Buyer viewed to the operator", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await expect(page.getByTestId("status-now")).toHaveText("Responded");
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("view-response").click();
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("status-now")).toHaveText("Buyer viewed");
});

test("O-09 intro requested reveals company and contact; Book a time and Reply work", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await followMail(page, { kind: "intro", to: "Tim Evans" }, "None work, reply instead");
  await expect(page.getByTestId("company-revealed")).toContainText("Northwind Health");
  await expect(page.getByTestId("buyer-contact")).toHaveText("Jordan Ellis");
  await page.getByTestId("book-slot").first().click();
  await expect(page.getByTestId("booked")).toContainText("Call booked");
  await page.getByTestId("reply").click();
  await page.getByTestId("reply-text").fill("Thursday works, looking forward to it.");
  await page.getByTestId("reply-send").click();
  await expect(page.getByTestId("intro-card")).toContainText("Reply sent to Jordan Ellis");
  const s = await state(page);
  expect(s.outbox.filter((m) => m.kind === "booking" && m.to.name === "Jordan Ellis")).toHaveLength(1);
  expect(s.outbox.filter((m) => m.kind === "reply" && m.to.name === "Jordan Ellis" && m.body.includes("Thursday works"))).toHaveLength(1);
});

test("O-10 selected and not selected emails follow rule 5", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await respond(page, "Matt Lopez", NW, { rate: "300", hours: "30" });
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await openOutbox(page);
  await expect(mail(page, { kind: "selected" })).toHaveCount(1);
  await expect(mail(page, { kind: "selected", to: "Tim Evans" })).toContainText("You were selected, Fractional VP of Sales");
  await expect(mail(page, { kind: "close" })).toHaveCount(1);
  await expect(mail(page, { kind: "close", to: "Matt Lopez" })).toContainText("Update on Fractional VP of Sales");
  await expect(mail(page, { kind: "close", to: "Matt Lopez" })).toContainText("The seat has been filled by another operator");
  await closeOutbox(page);
  await asOperator(page, "Matt Lopez");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("status-now")).toHaveText("Closed");
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("status-now")).toHaveText("Selected");
});

test("O-11 an operator with no rate must give one; profile rate stays empty", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Guillermo Mairena");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("r-rate")).toHaveValue("");
  await page.getByTestId("r-answer-0").fill("a");
  await page.getByTestId("r-answer-1").fill("b");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("respond-error")).toContainText("Add your hourly rate for this project.");
  await page.getByTestId("r-rate").fill("190");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-view")).toBeVisible();
  const s = await state(page);
  expect(s.responses.find((r) => r.operatorId === opByName("Guillermo Mairena").id)!.rate).toBe(190);
  await goto(page, `/operators/${opByName("Guillermo Mairena").slug}`);
  await expect(page.locator(".band-meta")).toContainText("No rate listed");
});

test("O-12 confirming availability from a pulse link", async ({ page }) => {
  await asRole(page, "admin");
  await goto(page, "/admin/operators");
  await page.getByTestId("ops-search").fill("Tim Evans");
  await page.getByRole("button", { name: "Send availability pulse to Tim Evans" }).click();
  await followMail(page, { kind: "pulse", to: "Tim Evans" }, "Yes, I'm open now");
  await expect(page.getByTestId("signed-in-as")).toContainText("Tim Evans");
  await expect(page.getByTestId("availability-page").getByTestId("confirmed")).toHaveText("Confirmed Sep 24");
  await expect(page.getByTestId("availability-page").getByTestId("not-confirmed")).toHaveCount(0);
  await goto(page, "/operator/projects");
  await expect(page.getByTestId("availability-card").getByTestId("confirmed")).toHaveText("Confirmed Sep 24");
});

test("O-13 responding from an old link to a paused or staffed project is blocked", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await openBuyerProject(page);
  await page.getByTestId("pause").click();
  await followMail(page, { kind: "invite", to: "Tim Evans" });
  await expect(page.getByTestId("respond-blocked")).toContainText("This project is paused");
  await openBuyerProject(page);
  await page.getByTestId("resume").click();
  await respond(page, "Matt Lopez", NW, { rate: "300", hours: "30" });
  await openBuyerProject(page);
  await responseRow(page, "Matt Lopez").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await followMail(page, { kind: "invite", to: "Tim Evans" });
  await expect(page.getByTestId("respond-blocked")).toContainText("This project has been staffed");
});

test("O-14 two tabs never create a duplicate response", async ({ page, context }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  const other = await context.newPage();
  await other.goto(`/operator/projects/${NW}`);
  await expect(other.getByTestId("respond-form")).toBeVisible();
  // Tab 1 responds.
  await page.getByTestId("r-answer-0").fill("a");
  await page.getByTestId("r-answer-1").fill("b");
  await page.getByTestId("submit-response").click();
  await expect(page.getByTestId("status-view")).toBeVisible();
  // Tab 2 syncs through the storage event; if it still tries to submit it is refused.
  await other.reload();
  await expect(other.getByTestId("status-view")).toBeVisible();
  const s = await state(other);
  expect(s.responses.filter((r) => r.projectId === NW && r.operatorId === opByName("Tim Evans").id)).toHaveLength(1);
  await openBuyerProject(page, "all");
  await expect(page.getByTestId("response-row")).toHaveCount(1);
});
