import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.beforeEach(async ({ page, request }) => signIn(page, request, "analyst"));

test("dashboard shows every card and the demo banner", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Demo mode/)).toBeVisible();
  for (const title of ["Incident pipeline", "Report sources", "Incident tracking", "Causes of incidents", "Other data"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText("active incidents")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Incidents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Most affected LGAs" })).toBeVisible();
});

test("map, hotspots, predictions and surveillance pages load data", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Layers" })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.goto("/hotspots");
  await expect(page.getByText("incident clusters (HDBSCAN)")).toBeVisible();
  await expect(page.getByText(/^Cluster \d+$/).first()).toBeVisible();

  await page.goto("/predictions");
  await expect(page.getByRole("heading", { name: "Model performance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Highest-risk areas" })).toBeVisible();
  await expect(page.getByText("Incidents caught in top 5 % of area")).toBeVisible();

  await page.goto("/surveillance");
  await expect(page.getByText("Satellite fire detections · last 7 days")).toBeVisible();
});

test("communities page lists masked subscribers", async ({ page }) => {
  await page.goto("/communities");
  await expect(page.getByText("active subscribers")).toBeVisible();
  await expect(page.getByText(/•••• \d{4}/).first()).toBeVisible();
  await expect(page.getByText(/\+234\d{6,}/)).toHaveCount(0);
});
