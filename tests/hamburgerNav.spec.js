import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator('[data-nav-init] [data-navigation-toggle="toggle"]');
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("MENU opens, CLOSE closes, and scroll locks while open", async ({ page }) => {
  const nav = page.locator("[data-nav-init]");
  const toggle = nav.locator('[data-navigation-toggle="toggle"]');
  await toggle.click();
  await expect(nav).toHaveAttribute("data-navigation-status", "active");
  await expect(page.locator("html")).toHaveClass(/lenis-stopped/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // The MENU pill fades out while the panel is open; CLOSE takes over.
  await expect(toggle).toBeHidden();
  await nav.locator(".nav_close-btn").click();
  await expect(nav).toHaveAttribute("data-navigation-status", "not-active");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("html")).not.toHaveClass(/lenis-stopped/);
});

test("close button, overlay, and Escape close the navigation", async ({ page }) => {
  const nav = page.locator("[data-nav-init]");
  const toggle = nav.locator('[data-navigation-toggle="toggle"]');
  for (const close of [nav.locator(".nav_close-btn"), nav.locator(".nav_dark-bg")]) {
    await toggle.click();
    await close.click({ force: true });
    await expect(nav).toHaveAttribute("data-navigation-status", "not-active");
  }
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(nav).toHaveAttribute("data-navigation-status", "not-active");
});

test("accordion closes active siblings", async ({ page }) => {
  const nav = page.locator("[data-nav-init]");
  const toggles = nav.locator("[data-accordion-toggle]");
  await nav.locator('[data-navigation-toggle="toggle"]').click();
  await toggles.nth(0).click();
  await toggles.nth(1).click();
  await expect(nav.locator("[data-accordion-status]").nth(0)).toHaveAttribute("data-accordion-status", "not-active");
  await expect(nav.locator("[data-accordion-status]").nth(1)).toHaveAttribute("data-accordion-status", "active");
});

test("anchor closes before Locomotive scroll handling and placeholder stays hashless", async ({ page }) => {
  const nav = page.locator("[data-nav-init]");
  await nav.locator('[data-navigation-toggle="toggle"]').click();
  await nav.locator("[data-accordion-toggle]").first().click();
  await nav.locator('a[href="#key-highlights"]').click();
  await expect(nav).toHaveAttribute("data-navigation-status", "not-active");
  await expect(page.locator("html")).not.toHaveClass(/lenis-stopped/);
  await nav.locator('[data-navigation-toggle="toggle"]').click();
  await nav.locator("[data-accordion-toggle]").nth(1).click();
  const hashBeforePlaceholder = await page.evaluate(() => location.hash);
  await nav.locator('a.nav_sublink[href="#"]').first().click();
  await expect(nav).toHaveAttribute("data-navigation-status", "not-active");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(hashBeforePlaceholder);
});
