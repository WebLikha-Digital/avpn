import { test, expect } from "@playwright/test";

async function assertResizeKeepsSection(page, from, to) {
  await page.setViewportSize({ width: from, height: 900 });
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.scrollHeight > innerHeight * 3);

  const before = await page.evaluate(() => {
    const section = document.querySelector("[data-testid=stories-stack]");
    const target = section.getBoundingClientRect().top + scrollY + 300;
    window.scrollTo(0, target);
    return { y: target };
  });

  await expect.poll(() => page.evaluate(() => scrollY), { timeout: 3_000 })
    .toBeGreaterThan(200);
  // Allow the throttled trailing anchor capture to run before resizing.
  await page.waitForTimeout(250);
  const beforeTop = await page.locator("[data-testid=stories-stack]").evaluate((element) =>
    element.getBoundingClientRect().top,
  );

  await page.setViewportSize({ width: to, height: 900 });
  await page.waitForTimeout(1_000);

  const after = await page.evaluate(() => {
    const section = document.querySelector("[data-testid=stories-stack]");
    const top = document.elementsFromPoint(innerWidth / 2, 1)
      .map((element) => element.closest("section"))
      .find(Boolean);
    return {
      y: scrollY,
      top: section.getBoundingClientRect().top,
      topSection: top?.dataset.testid ?? null,
    };
  });

  expect(after.y).toBeGreaterThan(0);
  expect(after.topSection).toBe("stories-stack");
  expect(Math.abs(after.top - beforeTop)).toBeLessThan(250);
}

test("crossing the 768px breakpoint keeps the reader in the same section", async ({ page }) => {
  await assertResizeKeepsSection(page, 800, 700);
});

test("a single mobile rotation keeps the reader in the same section", async ({ page }) => {
  await assertResizeKeepsSection(page, 390, 844);
});
