import { expect, test } from "@playwright/test";
import {
  NW,
  SEED,
  asOperator,
  asRole,
  closeOutbox,
  goto,
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

test("B-01 live match panel on the Northwind draft", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/edit`);
  // Budgets are client dollars, operator rates are pay: only pay of $130 to $190 fits $175 to $250 all-in.
  await expect(page.getByTestId("lm-70")).toHaveText("10");
  await expect(page.getByTestId("lm-rate")).toHaveText("1");
  await expect(page.getByTestId("lm-norate")).toContainText("81 of 100 operators have no rate");
  await expect(page.getByTestId("live-match")).toContainText("of 100 live profiles score 70+");
});

test("B-02 changing hours to 40-50 recalculates the match", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/edit`);
  const before = Number(await page.getByTestId("lm-70").textContent());
  const hoursBefore = Number(await page.getByTestId("lm-hours").textContent());
  await page.getByTestId("f-hmax").fill("50");
  await page.getByTestId("f-hmin").fill("40");
  await expect(page.getByTestId("live-match")).toContainText("40+ hrs a month open");
  const after = Number(await page.getByTestId("lm-70").textContent());
  const hoursAfter = Number(await page.getByTestId("lm-hours").textContent());
  expect(after).toBeLessThan(before);
  expect(hoursAfter).toBeLessThan(hoursBefore);
  // Hours part of each shown score now uses the 40 hr minimum.
  const tops = page.getByTestId("lm-top");
  const n = await tops.count();
  for (let i = 0; i < n; i++) {
    const name = (await tops.nth(i).locator("b").first().textContent())!.trim();
    const hrs = opByName(name).hrs;
    const expected = hrs >= 40 ? 20 : hrs >= 30 ? 12 : hrs >= 20 ? 6 : 3;
    await expect(tops.nth(i).getByTestId("part-3")).toHaveText(`${expected}/20`);
  }
});

test("B-03 posting is blocked on bad input with a message on the field", async ({ page }) => {
  // No title
  await page.getByTestId("new-project").click();
  await page.getByTestId("continue").click();
  await expect(page.getByText("Add a role title so operators know what the seat is.")).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);
  // Budget min above max
  await goto(page, `/buyer/projects/${NW}/edit`);
  await page.getByTestId("f-bmin").fill("300");
  await page.getByTestId("continue").click();
  await expect(page.getByText("Budget minimum can't be more than the maximum.")).toBeVisible();
  await page.getByTestId("f-bmin").fill("175");
  // Six screening questions
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("add-question").click();
    await page.getByLabel(`Screening question ${3 + i}`).fill(`Extra question ${i + 1}?`);
  }
  await page.getByTestId("continue").click();
  await expect(page.locator("#err-screening")).toHaveText("Up to 5 screening questions. Remove 1 to continue.");
  await expect(page).toHaveURL(/\/edit$/);
  const s = await state(page);
  expect(s.projects.find((p) => p.id === NW)!.status).toBe("draft");
});

test("B-04 invite search filters all 100 and shows an empty state", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/invite`);
  await expect(page.getByTestId("invite-matchline")).toContainText("All 100 live profiles");
  await page.getByTestId("invite-search").fill("hubspot");
  await expect(page.getByTestId("invite-matchline")).toContainText(/of 100 match "hubspot"/);
  const n = Number((await page.getByTestId("invite-matchline").textContent())!.split(" ")[0]);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(100);
  await expect(page.getByTestId("invite-row").first()).toBeVisible();
  await page.getByTestId("invite-search").fill("zzz");
  await expect(page.getByTestId("invite-empty")).toBeVisible();
  await expect(page.getByTestId("invite-row")).toHaveCount(0);
});

test("B-05 invite only: three invites, no alerts, portals updated", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez", "Anne Zavorskas"], visibility: "invite_only" });
  await expect(page.locator(".band .pill-live")).toHaveText("Live");
  await openOutbox(page);
  await expect(mail(page, { kind: "invite" })).toHaveCount(3);
  await expect(mail(page, { kind: "alert" })).toHaveCount(0);
  await closeOutbox(page);
  for (const n of ["Tim Evans", "Matt Lopez", "Anne Zavorskas"]) {
    await asOperator(page, n);
    await expect(page.getByTestId("sec-invited").locator(`[data-project="${NW}"]`)).toBeVisible();
  }
});

test("B-06 invites plus open: one alert per matching non-invited operator", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez", "Anne Zavorskas"], visibility: "open" });
  const s = await state(page);
  const invited = new Set(s.invites.map((i) => i.operatorId));
  const expected = SEED.filter((o) => o.cat === "Sales Leadership" && !invited.has(o.id));
  const alertOps = s.alerts.map((a) => a.operatorId);
  expect(new Set(alertOps).size).toBe(alertOps.length);
  expect(alertOps.sort()).toEqual(expected.map((o) => o.id).sort());
  for (const n of ["Tim Evans", "Matt Lopez", "Anne Zavorskas"]) expect(alertOps).not.toContain(opByName(n).id);
  await openOutbox(page);
  await expect(mail(page, { kind: "alert" })).toHaveCount(expected.length);
  await expect(mail(page, { kind: "invite" })).toHaveCount(3);
  await expect(mail(page, { kind: "alert", to: "Tim Evans" })).toHaveCount(0);
});

test("B-07 suggestions on: admin sees the Wants 3 RN suggestions flag", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"], suggestions: true });
  await asRole(page, "admin");
  const row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByTestId("flag")).toContainText(["Wants 3 RN suggestions"]);
});

test("B-08 sort by rate puts operators with no rate last", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await simulate(page, ["Guillermo Mairena", "Tim Evans", "Matt Lopez", "Ron Ariana"]);
  await openBuyerProject(page, "all");
  await page.getByTestId("sort").selectOption("rate");
  const rates = await page.getByTestId("resp-rate").allTextContents();
  expect(rates).toEqual(["$265/hr all-in", "$400/hr all-in", "No rate listed", "No rate listed"]);
});

test("B-09 pass on all weak fits moves only under-70 responders, no email", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Guillermo Mairena", "Ron Ariana", "Tanya Helin"]);
  const before = (await state(page)).outbox.length;
  await openBuyerProject(page, "all");
  await page.getByTestId("pass-weak").click();
  await expect(page.getByTestId("project-msg")).toContainText("Passed on 2 weak fits");
  await expect(responseRow(page, "Guillermo Mairena")).toHaveAttribute("data-decision", "not_a_fit");
  await expect(responseRow(page, "Tanya Helin")).toHaveAttribute("data-decision", "not_a_fit");
  await expect(responseRow(page, "Tim Evans")).toHaveAttribute("data-decision", "none");
  await expect(responseRow(page, "Ron Ariana")).toHaveAttribute("data-decision", "none");
  expect((await state(page)).outbox.length).toBe(before);
});

test("B-10 undo a not a fit returns the row to To review", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Guillermo Mairena"]);
  await openBuyerProject(page);
  await responseRow(page, "Guillermo Mairena").getByTestId("not-a-fit").click();
  await expect(responseRow(page, "Guillermo Mairena")).toHaveCount(0);
  await page.getByTestId("view-notfit").click();
  await responseRow(page, "Guillermo Mairena").getByTestId("undo").click();
  await page.getByTestId("view-review").click();
  await expect(responseRow(page, "Guillermo Mairena")).toHaveAttribute("data-decision", "none");
});

test("B-11 request intro on Tim reveals the company to Tim only", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await respond(page, "Matt Lopez", NW, { rate: "300", hours: "30" });
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await expect(page.getByTestId("project-msg")).toContainText("Intro requested");
  await openOutbox(page);
  await expect(mail(page, { kind: "intro", to: "Tim Evans" })).toHaveCount(1);
  await closeOutbox(page);
  await goto(page, "/buyer/intros");
  await expect(page.getByTestId("intro-row")).toContainText("Tim Evans");
  await asOperator(page, "Tim Evans");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("op-project-status")).toHaveText("Intro requested");
  await expect(page.getByTestId("company-revealed")).toContainText("Northwind Health");
  await asOperator(page, "Matt Lopez");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("company-revealed")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Northwind Health");
});

test("B-12 select Tim staffs the project and sends one email each", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez", "Anne Zavorskas"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await respond(page, "Matt Lopez", NW, { rate: "300", hours: "30" });
  await respond(page, "Guillermo Mairena", NW, { rate: "180", hours: "30" });
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await expect(page.getByTestId("staffed-banner")).toContainText("Tim Evans");
  const s = await state(page);
  expect(s.projects.find((p) => p.id === NW)!.status).toBe("staffed");
  const sel = s.outbox.filter((m) => m.kind === "selected");
  const close = s.outbox.filter((m) => m.kind === "close");
  expect(sel.map((m) => m.to.name)).toEqual(["Tim Evans"]);
  expect(close.map((m) => m.to.name).sort()).toEqual(["Guillermo Mairena", "Matt Lopez"]);
  expect(s.outbox.filter((m) => (m.kind === "close" || m.kind === "selected") && m.to.name === "Anne Zavorskas")).toHaveLength(0);
  await asOperator(page, "Anne Zavorskas");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("respond-blocked")).toContainText("staffed");
});

test("B-13 undo after staffing is not allowed and explains why", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Guillermo Mairena"]);
  await openBuyerProject(page);
  await responseRow(page, "Guillermo Mairena").getByTestId("not-a-fit").click();
  await responseRow(page, "Tim Evans").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await page.getByTestId("view-notfit").click();
  await responseRow(page, "Guillermo Mairena").getByTestId("undo").click();
  await expect(page.getByTestId("project-msg")).toContainText("This project is staffed. Decisions are final once you select someone, so they can't be undone.");
  await expect(responseRow(page, "Guillermo Mairena")).toHaveAttribute("data-decision", "not_a_fit");
});

test("B-14 pause hides the project from open roles and blocks new responses", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Guillermo Mairena");
  await goto(page, "/operator/roles");
  await expect(page.getByTestId("open-role").and(page.locator(`[data-project="${NW}"]`))).toBeVisible();
  await openBuyerProject(page);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("project-msg")).toContainText("Paused");
  await asOperator(page, "Guillermo Mairena");
  await goto(page, "/operator/roles");
  await expect(page.getByTestId("open-role").and(page.locator(`[data-project="${NW}"]`))).toHaveCount(0);
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("respond-blocked")).toContainText("paused");
  await expect(page.getByTestId("respond-blocked").getByRole("button", { name: "I'm interested" })).toBeDisabled();
});

test("B-15 answering an operator question reaches the operator page and outbox", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await asOperator(page, "Guillermo Mairena");
  await goto(page, `/operator/projects/${NW}`);
  await page.getByTestId("ask-text").fill("Is the quarterly on site in Austin required?");
  await page.getByTestId("ask-send").click();
  await openBuyerProject(page);
  await page.getByTestId("tab-questions").click();
  await expect(page.getByTestId("question")).toContainText("Is the quarterly on site in Austin required?");
  await page.getByTestId("answer-input").fill("Yes, two days each quarter, travel covered.");
  await page.getByTestId("answer-send").click();
  await expect(page.getByTestId("question")).toContainText("Yes, two days each quarter");
  await openOutbox(page);
  await expect(mail(page, { kind: "answer", to: "Guillermo Mairena" })).toContainText("Yes, two days each quarter");
  await closeOutbox(page);
  await asOperator(page, "Guillermo Mairena");
  await goto(page, `/operator/projects/${NW}`);
  await expect(page.getByTestId("my-answer")).toContainText("Yes, two days each quarter");
});

test("B-16 profile from a response, including one with no photo", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Ron Ariana"]);
  await openBuyerProject(page);
  // The name opens the profile; "View full profile" also sits under Answers and score.
  await responseRow(page, "Ron Ariana").getByRole("link", { name: "Ron Ariana" }).click();
  await expect(page.getByTestId("profile-name")).toHaveText("Ron Ariana");
  await expect(page.getByTestId("avatar-initials").first()).toBeVisible();
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  expect(broken).toEqual([]);
  await goto(page, `/buyer/projects/${NW}`);
  await responseRow(page, "Tim Evans").getByRole("link", { name: "Tim Evans" }).click();
  await expect(page.getByTestId("profile-name")).toHaveText("Tim Evans");
  const img = page.locator(".band-profile img.avatar");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});
