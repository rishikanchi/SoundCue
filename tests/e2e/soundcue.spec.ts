import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing, legal content, and responsive accessibility", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A clearer signal from your voice." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin screening" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Begin screening" })).toBeEnabled();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "A clearer signal from your voice." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Your voice is personal." })).toBeVisible();
  await page.goto("/accessibility");
  await expect(page.getByRole("heading", { name: "A calm experience should be an accessible one." })).toBeVisible();
});

test("consent through recording, analysis, result, history, PDF, and deletion", async ({ page }) => {
  const email = `e2e-${Date.now()}@soundcue.test`;
  const password = "SoundCue-Test-2026!";

  await page.goto("/");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Begin screening" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/screenings\/new/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("Keep holding the sound")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("You can stop when ready")).toBeVisible({ timeout: 9_000 });
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Listen before continuing")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/enough clear audio/)).toBeVisible();
  await page.getByRole("button", { name: "Use this recording" }).click();

  await expect(page.getByRole("heading", { name: "Looking at your voice patterns." })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/screenings\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /vocal changes detected\./i })).toBeVisible();
  await expect(page.getByText("Placeholder analysis", { exact: true })).toBeVisible();
  await expect(page.getByText("This result is not a diagnosis.")).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(1);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download clinician summary" }).click();
  expect((await download).suggestedFilename()).toMatch(/^soundcue-summary-.*\.pdf$/);

  await page.getByRole("link", { name: "Your history" }).click();
  await expect(page.getByRole("heading", { name: "Your screening history." })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Delete screening from/ }).click();
  await expect(page.getByText("Screening deleted.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Your history will appear here.")).toBeVisible();

  await page.getByRole("link", { name: /e2e-/ }).click();
  await expect(page.getByRole("heading", { name: "Settings and privacy." })).toBeVisible();
  await page.getByLabel(/Type DELETE to confirm/).fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page).toHaveURL(/\/?account=deleted/, { timeout: 12_000 });
});

test("seeded demo history is synthetic and has no audio", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email address").fill("demo@soundcue.local");
  await page.getByLabel("Password", { exact: true }).fill("SoundCue-Demo-Only-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/screenings\/new/);
  await page.goto("/history");
  await expect(page.getByText("Synthetic sample")).toHaveCount(5);
  await expect(page.getByText("Not available")).toHaveCount(5);
  await expect(page.getByRole("row")).toHaveCount(6);
});
