import { test, expect } from "@playwright/test";

const carousels = ".prog-highlights_mobile-preview [data-snap-carousel]";

for (const viewport of [
  { width: 375, height: 812 },
  { width: 767, height: 390 },
]) {
  test.describe(`${viewport.width}px mobile snap carousels`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    });

    test("pages each disc one card and keeps page scroll stationary", async ({ page }) => {
      const discs = page.locator(carousels);
      await expect(discs).toHaveCount(3);

      for (let index = 0; index < 3; index += 1) {
        const disc = discs.nth(index);
        await disc.evaluate((root) => {
          root.scrollIntoView({ block: "center", behavior: "instant" });
        });
        const state = await disc.evaluate((root) => {
          const hub = root.querySelector("[data-snap-carousel-track]");
          const items = [...hub.children];
          return {
            left: hub.scrollLeft,
            step: items[1].offsetLeft - items[0].offsetLeft,
            prevDisabled: root.querySelector("[data-snap-carousel-prev]").disabled,
            nextDisabled: root.querySelector("[data-snap-carousel-next]").disabled,
          };
        });
        expect(state.prevDisabled).toBe(true);
        expect(state.nextDisabled).toBe(false);

        const scrollY = await page.evaluate(() => window.scrollY);
        await disc.locator("[data-snap-carousel-next]").click();
        await expect.poll(() => disc.locator("[data-snap-carousel-track]").evaluate((hub) => hub.scrollLeft)).toBeGreaterThan(state.left);
        await expect.poll(() => disc.locator("[data-snap-carousel-track]").evaluate((hub) => Math.round(hub.scrollLeft))).toBe(Math.round(state.step));
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

        await disc.locator("[data-snap-carousel-prev]").click();
        await expect.poll(() => disc.locator("[data-snap-carousel-track]").evaluate((hub) => Math.round(hub.scrollLeft))).toBe(0);
      }
    });

    test("updates disabled state after a manual scroll", async ({ page }) => {
      const disc = page.locator(carousels).first();
      const hub = disc.locator("[data-snap-carousel-track]");

      await hub.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        element.dispatchEvent(new Event("scroll"));
      });

      await expect(disc.locator("[data-snap-carousel-next]")).toBeDisabled();
      await expect(disc.locator("[data-snap-carousel-next]")).toHaveAttribute("aria-disabled", "true");
      await expect(disc.locator("[data-snap-carousel-prev]")).not.toBeDisabled();
    });
  });
}

test("hides controls and leaves the preview hub non-scrollable at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const controls = page.locator(`${carousels} [data-snap-carousel-controls]`);
  await expect(controls).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(controls.nth(index)).toBeHidden();
  }
  const desktop = await page.locator(carousels).first().evaluate((root) => {
    const hub = root.querySelector("[data-snap-carousel-track]");
    return { overflowX: getComputedStyle(hub).overflowX, left: hub.scrollLeft };
  });
  expect(desktop.overflowX).toBe("hidden");
  expect(desktop.left).toBe(0);
});
