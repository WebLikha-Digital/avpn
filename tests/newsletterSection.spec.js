import { test, expect } from "@playwright/test";

const root = "[data-newsletter-section]";

test("newsletter card reveals with a dashed form placeholder and no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const section = page.locator(root);
  await expect(section).toHaveCount(1);
  await section.scrollIntoViewIfNeeded();

  const card = section.locator("[data-newsletter-card]");
  await expect(card).toHaveAttribute("data-reveal-group", "");
  await expect.poll(() =>
    card.locator(".newsletter_intro").evaluate((el) => getComputedStyle(el).opacity),
  ).toBe("1");

  const slot = section.locator("[data-newsletter-form]");
  await expect(slot).toHaveText(/form embed here/i);
  await expect(slot).toHaveCSS("border-style", "dashed");
  await expect(section.locator("form")).toHaveCount(0);

  for (const width of [1440, 991, 767, 479]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${width}`).toBeLessThanOrEqual(0);
  }
});
