import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem("avpn-preloader"));
});

test("counter is monotonic and reaches 100", async ({ page }) => {
  await page.goto("/?preloader=1");
  const values = await page.evaluate(async () => {
    const counter = document.querySelector("[data-preloader-counter]");
    const values = [];
    while (document.documentElement.classList.contains("is-preloading")) {
      values.push(Number.parseInt(counter.textContent, 10));
      await new Promise(requestAnimationFrame);
    }
    values.push(Number.parseInt(counter.textContent, 10));
    return values;
  });
  expect(values.at(-1)).toBe(100);
  values.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(values[index]));
});

test("preloader entrance moves the counter up from below the viewport", async ({ page }) => {
  await page.goto("/?preloader=1");
  const positions = await page.evaluate(() => {
    const container = document.querySelector("[data-preloader-init]");
    const counter = document.querySelector("[data-preloader-counter]");
    const { entrance } = container._preloaderInstance;
    entrance.pause();
    entrance.seek(0);
    const start = counter.getBoundingClientRect().top;
    entrance.seek(entrance.duration());
    const end = counter.getBoundingClientRect().top;
    return { start, end, viewport: window.innerHeight };
  });
  expect(positions.start).toBeGreaterThan(positions.viewport);
  expect(positions.end).toBeLessThan(positions.viewport);
  expect(positions.start).toBeGreaterThan(positions.end);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`FLIP lands year copies on targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      window.addEventListener("preloader:exit", (event) => {
        event.detail.timeline.pause();
        window.__preloaderTimeline = event.detail.timeline;
      });
    });
    await page.goto("/?preloader=1");
    await page.waitForFunction(() => Boolean(window.__preloaderTimeline));
    const result = await page.evaluate(() => {
      window.__preloaderTimeline.seek(1);
      return ["2025", "2026"].map((year) => {
        const copy = document.querySelector(`[data-preloader-year="${year}"]`).getBoundingClientRect();
        const target = document.querySelector(`[data-preloader-target="${year}"]`).getBoundingClientRect();
        return Math.max(Math.abs(copy.left - target.left), Math.abs(copy.top - target.top), Math.abs(copy.width - target.width), Math.abs(copy.height - target.height));
      });
    });
    result.forEach((difference) => expect(difference).toBeLessThanOrEqual(1));
  });
}

test("completes with final visibility and dispatches its event", async ({ page }) => {
  await page.goto("/?preloader=1");
  const event = page.evaluate(() => new Promise((resolve) => window.addEventListener("preloader:complete", resolve, { once: true })));
  await event;
  await expect(page.locator("[data-preloader-init]")).toHaveCSS("display", "none");
  await expect(page.locator("[data-preloader-target]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-reveal]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-media]").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-preloader-year]").first()).toHaveCSS("visibility", "hidden");
});

test("session gate is a complete no-op", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => ({
    instance: document.querySelector("[data-preloader-init]")._preloaderInstance ?? null,
    classPresent: document.documentElement.classList.contains("is-preloading"),
  }));
  expect(result).toEqual({ instance: null, classPresent: false });
});

test("reduced motion resolves without a timeline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?preloader=1");
  await expect(page.locator("[data-preloader-init]")).toHaveCSS("display", "none");
  await expect.poll(() => page.locator("[data-preloader-init]").evaluate((node) => Boolean(node._preloaderInstance?.timeline))).toBe(false);
});
