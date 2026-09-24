import { expect, test, type Page } from "@playwright/test";
import {
  NW,
  asOperator,
  asRole,
  followMail,
  goto,
  inviteByName,
  mail,
  noHorizontalScroll,
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

test("X-01 full happy path from post to staffed, every screen agrees", async ({ page }) => {
  // Buyer posts
  await postNorthwind(page, { invite: ["Tim Evans", "Matt Lopez"] });
  await asRole(page, "admin");
  let row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByTestId("row-invited")).toHaveText("2");
  // Operator responds from the invite email
  await followMail(page, { kind: "invite", to: "Tim Evans" });
  await expect(page.getByTestId("op-source")).toHaveText("Invited by client");
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  // Buyer sees it
  await openBuyerProject(page);
  await expect(responseRow(page, "Tim Evans")).toBeVisible();
  await goto(page, "/buyer/projects");
  await expect(page.getByTestId("card-responses").locator(".stat-v")).toHaveText("1");
  await expect(page.getByTestId("card-strong").locator(".stat-v")).toHaveText("1");
  // Admin agrees
  await asRole(page, "admin");
  row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row.getByTestId("row-responses")).toHaveText("1");
  // Intro
  await openBuyerProject(page);
  await responseRow(page, "Tim Evans").getByTestId("request-intro").click();
  await goto(page, "/buyer/projects");
  await expect(page.getByTestId("card-intros").locator(".stat-v")).toHaveText("1");
  await followMail(page, { kind: "intro", to: "Tim Evans" });
  await expect(page.getByTestId("status-now")).toHaveText("Intro requested");
  await asRole(page, "admin");
  await goto(page, `/admin/projects/${NW}`);
  await expect(page.getByTestId("buyer-action")).toHaveText("Intro requested");
  // Select
  await openBuyerProject(page, "intro");
  await responseRow(page, "Tim Evans").getByTestId("select").click();
  await page.getByTestId("confirm-select").click();
  await expect(page.getByTestId("staffed-banner")).toBeVisible();
  await asOperator(page, "Tim Evans");
  await expect(page.getByTestId("sec-responded").locator(`[data-project="${NW}"]`).getByTestId("op-status")).toHaveText("Selected");
  await asOperator(page, "Matt Lopez");
  await expect(page.getByTestId("sec-closed").locator(`[data-project="${NW}"]`)).toBeVisible();
  await asRole(page, "admin");
  // Staffed projects move to the Placed tab.
  await page.getByTestId("adm-tab-placed").click();
  row = page.getByTestId("admin-row").and(page.locator(`[data-project="${NW}"]`));
  await expect(row).toContainText("Placed");
  await expect(page.getByTestId("kpi-staffed").locator(".stat-v")).toHaveText("1");
});

test("X-02 inviting the same operator twice keeps one row and one portal entry", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  const before = (await state(page)).invites.find((i) => i.operatorId === opByName("Tim Evans").id)!;
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.getByTestId("invite-search").fill("Tim Evans");
  await page.getByRole("button", { name: "Resend invite to Tim Evans" }).click();
  const s = await state(page);
  const rows = s.invites.filter((i) => i.projectId === NW && i.operatorId === opByName("Tim Evans").id);
  expect(rows).toHaveLength(1);
  expect(rows[0].sentAt).toBeGreaterThan(before.sentAt);
  await asOperator(page, "Tim Evans");
  await expect(page.locator(`[data-testid="portal-item"][data-project="${NW}"]`)).toHaveCount(1);
});

test("X-03 inviting someone who already responded from an alert sends no invite email", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Guillermo Mairena", NW, { rate: "180", hours: "30" });
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}/invite`);
  await inviteByName(page, "Guillermo Mairena");
  const s = await state(page);
  expect(s.outbox.filter((m) => m.kind === "invite" && m.to.name === "Guillermo Mairena")).toHaveLength(0);
  expect(s.responses.filter((r) => r.operatorId === opByName("Guillermo Mairena").id && r.submittedAt)).toHaveLength(1);
  await openBuyerProject(page);
  await expect(responseRow(page, "Guillermo Mairena").getByTestId("response-source")).toHaveText("Invited");
});

test("X-04 reset returns everything to seed and empties the outbox", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await respond(page, "Tim Evans", NW, { rate: "200", hours: "25" });
  await page.getByTestId("clock-7d").click();
  await page.getByTestId("reset-demo").click();
  await expect(page.getByTestId("outbox-count")).toHaveText("0");
  await expect(page.getByTestId("clock")).toHaveText("Thu, Sep 24");
  const s = await state(page);
  expect(s.projects.map((p) => [p.id, p.status])).toEqual([
    [NW, "draft"],
    ["proj-harbor-revops", "draft"],
  ]);
  expect([s.invites.length, s.alerts.length, s.responses.length, s.outbox.length, s.events.length]).toEqual([0, 0, 0, 0, 0]);
  await asOperator(page, "Tim Evans");
  await expect(page.locator('[data-testid="portal-item"]')).toHaveCount(0);
});

test("X-05 at 400px wide B4, O3 and A1 have no horizontal scroll", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Guillermo Mairena"]);
  await page.setViewportSize({ width: 400, height: 860 });
  const reachable = async (testId: string) => {
    const el = page.getByTestId(testId).first();
    await el.scrollIntoViewIfNeeded();
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(400);
  };
  await openBuyerProject(page);
  await noHorizontalScroll(page);
  for (const id of ["request-intro", "not-a-fit", "select", "pass-weak", "pause", "tab-questions"]) await reachable(id);
  await asOperator(page, "Matt Lopez");
  await goto(page, `/operator/projects/${NW}`);
  await noHorizontalScroll(page);
  for (const id of ["save-draft", "submit-response", "ask-send", "mode-pass"]) await reachable(id);
  await asRole(page, "admin");
  await noHorizontalScroll(page);
  await reachable("new-rn-project");
  await expect(page.getByTestId("admin-row").first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("X-06 dark theme keeps text readable and tiers distinct", async ({ page }) => {
  await postNorthwind(page, { invite: ["Tim Evans"] });
  await simulate(page, ["Tim Evans", "Ron Ariana", "Guillermo Mairena"]);
  await openBuyerProject(page, "all");
  await page.getByTestId("theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.mouse.move(0, 0);
  // Buttons animate color for 150ms; measure the settled state.
  await page.waitForTimeout(400);
  const report = await page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const alpha = (c: string) => {
      const m = c.match(/[\d.]+/g) || [];
      return m.length > 3 ? Number(m[3]) : 1;
    };
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const bgOf = (el: Element): number[] => {
      let e: Element | null = el;
      while (e) {
        const c = getComputedStyle(e).backgroundColor;
        const p = parse(c);
        // Translucent layers (band buttons) sit over the dark band, so keep walking up.
        if (c && alpha(c) >= 0.5 && getComputedStyle(e).backgroundImage === "none") return p;
        if (getComputedStyle(e).backgroundImage !== "none" && e.classList.contains("band")) return [11, 58, 43];
        e = e.parentElement;
      }
      return [255, 255, 255];
    };
    const worst: { sel: string; ratio: number }[] = [];
    const sels = [".page-h", ".band h1", ".resp-name", ".resp-meta", ".muted", ".part-l", ".part-v", ".tier-tile span", ".fit b", ".src", ".btn", ".chip", ".why p", ".tabs button", ".site nav a", ".proto-tabs button"];
    for (const sel of sels) {
      for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 6)) {
        const r = contrast(parse(getComputedStyle(el).color), bgOf(el));
        worst.push({ sel: `${sel} "${(el.textContent || "").trim().slice(0, 24)}"`, ratio: Math.round(r * 100) / 100 });
      }
    }
    const tierColors = ["strong", "possible", "weak"].map((t) => getComputedStyle(document.querySelector(`.tt-${t} b`)!).color);
    const canvas = getComputedStyle(document.querySelector(".rnp")!).backgroundColor;
    return { worst: worst.sort((a, b) => a.ratio - b.ratio).slice(0, 5), tierColors, canvas };
  });
  expect(report.canvas).toBe("rgb(12, 19, 16)");
  expect(report.worst[0].ratio, JSON.stringify(report.worst)).toBeGreaterThanOrEqual(4.5);
  expect(new Set(report.tierColors).size).toBe(3);
});

async function tabTo(page: Page, testId: string, max = 400) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { id: null, visible: true };
      const cs = getComputedStyle(el);
      return { id: el.getAttribute("data-testid") || el.getAttribute("aria-label"), visible: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 };
    });
    expect(info.visible, `focus ring on ${info.id}`).toBe(true);
    if (info.id === testId) return;
  }
  throw new Error(`Could not reach ${testId} with Tab`);
}

test("X-07 keyboard only through post, respond and select", async ({ page }) => {
  test.setTimeout(180_000);
  // Post
  await asRole(page, "buyer");
  await goto(page, `/buyer/projects/${NW}/invite`);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await tabTo(page, "invite-search");
  await page.keyboard.type("Tim Evans");
  await tabTo(page, "Invite Tim Evans");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("invited-count")).toHaveText("1 invited");
  await tabTo(page, "post-project");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("project-msg")).toContainText("Posted");
  // Respond as an alerted operator
  await asOperator(page, "Guillermo Mairena");
  await goto(page, `/operator/projects/${NW}`);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await tabTo(page, "r-rate");
  await page.keyboard.type("190");
  await tabTo(page, "r-answer-0");
  await page.keyboard.type("Keyboard answer one");
  await tabTo(page, "r-answer-1");
  await page.keyboard.type("Keyboard answer two");
  await tabTo(page, "submit-response");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-view")).toBeVisible();
  // Select as buyer
  await openBuyerProject(page);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await tabTo(page, "select");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("select-confirm")).toBeVisible();
  await tabTo(page, "confirm-select");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("staffed-banner")).toContainText("Guillermo Mairena");
  const s = await state(page);
  expect(s.outbox.some((m) => m.kind === "selected" && m.to.name === "Guillermo Mairena")).toBe(true);
  await openOutbox(page);
  await expect(mail(page, { kind: "selected" })).toHaveCount(1);
});
