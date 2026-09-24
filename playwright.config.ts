import { defineConfig, devices } from "@playwright/test";

// Projects prototype end-to-end suite (docs/projects-handoff/QA_PLAN.md).
// Runs headless against the production build: `npm run test:e2e`.
const PORT = Number(process.env.RNP_PORT || 3100);

export default defineConfig({
  testDir: "tests/projects",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["json", { outputFile: "test-results/projects-results.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/buyer/projects`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
