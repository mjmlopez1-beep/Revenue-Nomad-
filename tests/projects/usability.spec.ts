import { expect, test } from "@playwright/test";
import { NW, asRole, followMail, goto, mail, openBuyerProject, openOutbox, postNorthwind, reset, responseRow, simulate, state } from "./helpers";

// Fast paths from USABILITY_AUDIT.md: fewer clicks and keystrokes for buyers.

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("U-01 template to live project in 3 clicks and no typing", async ({ page }) => {
  await page.getByTestId("new-project").click();
  await page.getByTestId("tpl-vp-sales").click();
  await page.getByTestId("post-now").click();
  await expect(page.getByTestId("project-msg")).toContainText("Posted and live");
  const s = await state(page);
  const p = s.projects.find((x) => x.id !== NW && x.id !== "proj-harbor-revops")!;
  expect(p.status).toBe("live");
  expect(p.visibility).toBe("invites_plus_open");
  expect(s.alerts.filter((a) => a.projectId === p.id).length).toBeGreaterThan(50);
});

test("U-02 hour and budget presets fill both fields with one click", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/edit`);
  await page.getByRole("group", { name: "Common hours" }).getByRole("button", { name: "40-60" }).click();
  await page.getByRole("group", { name: "Common budgets" }).getByRole("button", { name: "$250-350" }).click();
  await expect(page.getByTestId("f-hmin")).toHaveValue("40");
  await expect(page.getByTestId("f-hmax")).toHaveValue("60");
  await expect(page.getByTestId("f-bmin")).toHaveValue("250");
  await expect(page.getByTestId("f-bmax")).toHaveValue("350");
  await expect(page.getByTestId("live-match")).toContainText("40+ hrs a month open");
});

test("U-03 suggested must-haves add with one click", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/edit`);
  const chip = page.getByTestId("musthave-suggestion").first();
  const label = (await chip.textContent())!.replace("+ ", "").trim();
  await chip.click();
  await expect(page.getByRole("button", { name: `Remove ${label}` })).toBeVisible();
});

test("U-04 one-click pass with undo", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Guillermo Mairena"]);
  await openBuyerProject(page);
  await responseRow(page, "Guillermo Mairena").getByTestId("not-a-fit").click();
  await expect(responseRow(page, "Guillermo Mairena")).toHaveCount(0);
  await page.getByTestId("msg-undo").click();
  await expect(responseRow(page, "Guillermo Mairena")).toHaveAttribute("data-decision", "none");
});

test("U-05 bulk select, bulk pass, and intros with all strong fits", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await simulate(page, ["Tim Evans", "Matt Lopez", "Guillermo Mairena", "Tanya Helin", "Ron Ariana"]);
  await openBuyerProject(page);
  await responseRow(page, "Guillermo Mairena").getByTestId("pick").check();
  await responseRow(page, "Ron Ariana").getByTestId("pick").check();
  await expect(page.getByTestId("bulk-bar")).toContainText("2 selected");
  await page.getByTestId("bulk-pass").click();
  await expect(responseRow(page, "Guillermo Mairena")).toHaveCount(0);
  await expect(responseRow(page, "Ron Ariana")).toHaveCount(0);
  await page.getByTestId("intro-strong").click();
  // Simulated responses use profile rates: Tim's $200 pay is $265 all-in, over budget, so one strong fit remains.
  await expect(page.getByTestId("project-msg")).toContainText("Intro requested with 1 strong fit");
  const s = await state(page);
  const decided = Object.fromEntries(s.responses.map((r) => [r.operatorId, r.decision]));
  expect(Object.values(decided).sort()).toEqual(["intro_requested", "none", "none", "not_a_fit", "not_a_fit"]);
  expect(s.outbox.filter((m) => m.kind === "intro")).toHaveLength(1);
});

test("U-06 one tap from the intro email books the call, and the buyer sees it", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans"]);
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await openOutbox(page);
  const intro = mail(page, { kind: "intro", to: "Tim Evans" });
  await expect(intro.getByRole("link", { name: /^Book / })).toHaveCount(3);
  const slot = (await intro.getByRole("link", { name: /^Book / }).first().textContent())!.replace("Book ", "");
  await page.keyboard.press("Escape");
  await followMail(page, { kind: "intro", to: "Tim Evans" }, /^Book /);
  await expect(page.getByTestId("booked")).toContainText(slot);
  const s = await state(page);
  expect(s.outbox.filter((m) => m.kind === "booking" && m.to.name === "Jordan Ellis")).toHaveLength(1);
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}?view=intro`);
  await expect(responseRow(page, "Tim Evans").getByTestId("call-status")).toContainText(`Call booked ${slot}`);
  await goto(page, "/buyer/intros");
  await expect(page.getByTestId("intro-booked")).toContainText(slot);
});

test("U-07 invite the top 5 matches in one click", async ({ page }) => {
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.getByTestId("invite-top5").click();
  await expect(page.getByTestId("invited-count")).toHaveText("5 invited");
});

test("U-08 compare two or three responses side by side and request the intro there", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await simulate(page, ["Tim Evans", "Matt Lopez", "Ron Ariana"]);
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("pick").check();
  await expect(page.getByTestId("compare")).toHaveCount(0);
  await responseRow(page, "Matt Lopez").getByTestId("pick").check();
  await page.getByTestId("compare").click();
  const panel = page.getByTestId("compare-panel");
  await expect(panel).toContainText("Tim Evans");
  await expect(panel).toContainText("Matt Lopez");
  await expect(panel).toContainText("Walk us through the last sales process you built from scratch.");
  await panel.getByTestId("compare-intro").first().click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("project-msg")).toContainText("Intro requested");
  const s = await state(page);
  expect(s.intros.filter((i) => i.projectId === NW)).toHaveLength(1);
});

test("U-09 operators you liked before sit on your bench, one click invites them to the next project", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans"]);
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await goto(page, "/buyer/projects");
  await expect(page.locator(".band-sub")).toContainText("1 operator on your bench");
  await page.getByTestId("new-project").click();
  await expect(page).toHaveURL(/\/edit$/);
  const id = new URL(page.url()).pathname.split("/")[3];
  await goto(page, `/buyer/projects/${id}/invite`);
  await expect(page.getByTestId("invite-row").first()).toHaveAttribute("data-op", "Tim Evans");
  await expect(page.getByTestId("invite-row").first().getByTestId("bench-chip")).toBeVisible();
  await page.getByTestId("invite-bench").click();
  await expect(page.getByTestId("invited-count")).toHaveText("1 invited");
});
