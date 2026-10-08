import { expect, test } from "@playwright/test";
import { api, signIn } from "./helpers";

/**
 * Walks the staged demo story: verify the fresh Guma SMS report, then approve and send the alert drafted
 * for the verified Guma attack. Re-stage with `python -m app.cli demo-scenario` before re-running.
 */
test.describe.configure({ mode: "serial" });

type Incident = { id: number; status: string; source: string; location_name: string };
type Alert = { id: number; status: string; title: string; trigger: string; recipients_estimate: number | null };

test("analyst verifies the community SMS report from Guma", async ({ page, request }) => {
  const { body } = await api<{ items: Incident[] }>(request, "analyst", "/api/incidents?q=Guma&source=community_sms&status=reported&limit=5");
  const report = body.items.find((i) => i.location_name === "Guma");
  test.skip(!report, "No unverified Guma SMS report: run `python -m app.cli demo-scenario` first");

  await signIn(page, request, "analyst");
  await page.goto(`/incidents?id=${report!.id}`);
  const drawer = page.getByRole("heading", { name: `Incident #${report!.id}` }).locator("../..");
  await expect(drawer.getByText("armed men seen near the farms")).toBeVisible();
  await drawer.getByPlaceholder(/Note/).fill("Called the community coordinator; confirmed armed group sighted.");
  await drawer.getByRole("button", { name: "Mark verified" }).click();
  await expect(drawer.getByRole("button", { name: "Mark responded" })).toBeVisible();
  await expect(drawer.getByText("Called the community coordinator")).toBeVisible();

  const after = await api<Incident>(request, "analyst", `/api/incidents/${report!.id}`);
  expect(after.body.status).toBe("verified");
});

test("analyst approves and sends the Guma alert", async ({ page, request }) => {
  const { body } = await api<Alert[]>(request, "analyst", "/api/alerts?status=draft");
  const draft = body.find((a) => a.trigger === "incident" && a.title.includes("Guma"));
  test.skip(!draft, "No Guma incident draft: run `python -m app.cli demo-scenario` first");

  await signIn(page, request, "analyst");
  await page.goto("/alerts");
  const card = page.locator("article").filter({ hasText: draft!.title });
  await expect(card).toBeVisible();
  await expect(card.getByText("English", { exact: true })).toBeVisible();
  await expect(card.getByText("Hausa", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();

  await page.getByRole("button", { name: "Approved", exact: true }).click();
  const approved = page.locator("article").filter({ hasText: draft!.title });
  page.once("dialog", (d) => d.accept());
  await approved.getByRole("button", { name: /Send SMS to \d+ subscribers/ }).click();

  await expect.poll(async () => (await api<Alert>(request, "analyst", "/api/alerts?status=sent")).body,
    { timeout: 60_000 }).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft!.id })]));
  await page.getByRole("button", { name: "Sent", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: draft!.title }).getByText(/\d+ delivered/)).toBeVisible();
});
