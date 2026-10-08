import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("field agent uploads coordinates, sees validation, and imports", async ({ page, request }) => {
  // A random past date and position per run, so the row is not flagged as a duplicate
  // (within 500 m and 24 h) of a row imported by an earlier run.
  const day = new Date(Date.now() - (30 + Math.floor(Math.random() * 700)) * 864e5).toISOString().slice(0, 10);
  const lat = 7.55 + Math.random() * 0.3;
  const lon = 8.45 + Math.random() * 0.3;
  const csv = [
    "latitude,longitude,date,type,fatalities,location",
    `${lat.toFixed(5)},${lon.toFixed(5)},${day},crop_destruction,0,E2E test farm`,
    `6.45,3.39,${day},attack,0,Lagos (must be rejected)`,
  ].join("\n");

  await signIn(page, request, "field_agent");
  await page.goto("/uploads");
  await page.locator('input[type="file"]').setInputFiles({ name: "e2e-upload.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  await expect(page.getByText("2 rows")).toBeVisible();
  await expect(page.getByText("1 valid")).toBeVisible();
  await expect(page.getByText(/outside Benue\/Plateau/)).toBeVisible();
  await page.getByRole("button", { name: "Import 1 incidents" }).click();
  await expect(page.getByText("1 incidents imported").first()).toBeVisible();
});
