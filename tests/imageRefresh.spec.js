import { test, expect } from "@playwright/test";

test("refreshes only when a lazy image load grows the document", async ({ page }) => {
  await page.addInitScript(() => {
    window.__refreshTestLifecycle = { hero: false };
    window.addEventListener("hero-entrance:complete", () => {
      window.__refreshTestLifecycle.hero = true;
    }, { once: true });
  });
  // Hold the fixture back so both images are still incomplete at DOM ready and
  // the window load refresh lands after the measurement window.
  let releaseLazyImages;
  const lazyImagesHeld = new Promise((resolve) => { releaseLazyImages = resolve; });
  await page.route("**/fixtures/lazy-refresh.svg", async (route) => {
    await lazyImagesHeld;
    await route.fulfill({ contentType: "image/svg+xml", body: "<svg />" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => window.__refreshTestLifecycle), { timeout: 10000 }).toEqual({
    hero: true,
  });

  try {
    await page.evaluate(async () => {
      const { ScrollTrigger } = await import("/src/lib/gsap.js");
      window.__refreshTestCount = 0;
      window.__refreshTestOnRefresh = () => { window.__refreshTestCount += 1; };
      ScrollTrigger.addEventListener("refresh", window.__refreshTestOnRefresh);
      const container = document.querySelector("[data-refresh-test-container]");
      const images = container.querySelectorAll("img");
      images[0].dispatchEvent(new Event("load"));
    });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__refreshTestCount)).toBe(0);

    await page.evaluate(() => {
      const container = document.querySelector("[data-refresh-test-container]");
      const image = container.querySelectorAll("img")[1];
      container.style.height = "101px";
      image.dispatchEvent(new Event("load"));
    });
    await expect.poll(() => page.evaluate(() => window.__refreshTestCount), { timeout: 2000 }).toBe(1);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__refreshTestCount)).toBe(1);
  } finally {
    await page.evaluate(async () => {
      const { ScrollTrigger } = await import("/src/lib/gsap.js");
      if (window.__refreshTestOnRefresh) {
        ScrollTrigger.removeEventListener("refresh", window.__refreshTestOnRefresh);
      }
    }).catch(() => {});
    releaseLazyImages();
  }
});
