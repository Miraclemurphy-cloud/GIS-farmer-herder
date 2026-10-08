import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running deployment.
 *   WEB_URL  dashboard (default http://localhost:3000)
 *   API_URL  backend   (default http://127.0.0.1:8000)
 * Logins come from ../demo-credentials.txt (written by `python -m app.cli demo-users`)
 * or DEMO_<ROLE>_EMAIL / DEMO_<ROLE>_PASSWORD environment variables.
 */
export default defineConfig({
  testDir: "./tests",
  // Tests change shared demo data (verify, approve, send), so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // Free hosting sleeps when idle; allow for slow first responses.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalSetup: "./global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
