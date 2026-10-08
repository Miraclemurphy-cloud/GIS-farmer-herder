import { expect, test } from "@playwright/test";
import { creds } from "./helpers";

test("analyst signs in through the form and out again", async ({ page }) => {
  const { email, password } = creds("analyst");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/incidents");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds("viewer").email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
