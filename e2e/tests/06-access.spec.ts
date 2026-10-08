import { expect, test } from "@playwright/test";
import { api, API_URL, signIn } from "./helpers";

test("each role gets exactly the access it should", async ({ request }) => {
  // viewer: read-only
  expect((await api(request, "viewer", "/api/incidents?limit=1")).status).toBe(200);
  expect((await api(request, "viewer", "/api/subscribers")).status).toBe(403);
  expect((await api(request, "viewer", "/api/incidents", { method: "POST",
    data: { lat: 7.7, lon: 8.6, occurred_at: new Date().toISOString() } })).status).toBe(403);
  // field agent: may record incidents, may not approve alerts or see subscribers
  expect((await api(request, "field_agent", "/api/subscribers")).status).toBe(403);
  expect((await api(request, "field_agent", "/api/alerts/1/approve", { method: "POST" })).status).toBe(403);
  // analyst: no user management
  expect((await api(request, "analyst", "/api/auth/users")).status).toBe(403);
  // admin: user management
  expect((await api(request, "admin", "/api/auth/users")).status).toBe(200);
});

test("viewer sees the restriction message on Communities", async ({ page, request }) => {
  await signIn(page, request, "viewer");
  await page.goto("/communities");
  await expect(page.getByText("Subscriber records are restricted to analysts and administrators.")).toBeVisible();
});

test("inbound SMS webhook accepts reports only with the shared token", async ({ request }) => {
  const bad = await request.post(`${API_URL}/api/sms/inbound?token=wrong`, { form: { from: "+2348000000002", text: "STOP" } });
  expect(bad.status()).toBe(403);

  const tokenValue = process.env.SMS_WEBHOOK_TOKEN;
  test.skip(!tokenValue, "Set SMS_WEBHOOK_TOKEN to also test an accepted report");
  const ok = await request.post(`${API_URL}/api/sms/inbound?token=${tokenValue}`,
    { form: { from: "+2348000000002", text: "REPORT Riyom e2e test: smoke seen near the market" } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).action).toBe("report");
});
