import { expect, test } from "@playwright/test";
import { API_URL } from "./helpers";

test("API is healthy and public summary is aggregate-only", async ({ request }) => {
  expect((await (await request.get(`${API_URL}/api/health`)).json()).ok).toBe(true);
  const summary = await (await request.get(`${API_URL}/api/public/summary`)).json();
  expect(summary.lgas_covered).toBe(40);
  expect(summary.incidents_12m).toBeGreaterThan(0);
  expect(Object.keys(summary).sort()).toEqual(
    ["alerts_sent", "forecast_top5_capture", "incidents_12m", "lgas_covered", "subscribers", "synthetic_data", "updated_at"]);
});

test("protected endpoints reject anonymous requests", async ({ request }) => {
  for (const path of ["/api/incidents", "/api/subscribers", "/api/geo/risk", "/api/alerts"]) {
    expect((await request.get(`${API_URL}${path}`)).status(), path).toBe(401);
  }
});

test("landing page renders with live stats and dashboard preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/early warning/i);
  await expect(page.locator("#preview figure")).toBeVisible();
  const stats = page.getByText("incidents mapped and tracked in the last 12 months").locator("..");
  await stats.scrollIntoViewIfNeeded();
  await expect(stats.locator(".num")).not.toHaveText(/—|^0$/, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Staff sign in" }).first()).toHaveAttribute("href", "/login");
});
