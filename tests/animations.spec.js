import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0);
  expect(errors, "the preview should boot without browser errors").toEqual([]);
});

test("boots every preview component", async ({ page }) => {
  await expect(page.locator('.mask-demo__inner .line')).toHaveCount(1);
  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("WebGL previews allocate live render surfaces", async ({ page }) => {
  const canvases = page.locator("canvas");
  const surfaces = await canvases.evaluateAll((items) =>
    items.map((canvas) => {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return Boolean(gl && canvas.width > 0 && canvas.height > 0 && !gl.isContextLost());
    }),
  );

  expect(surfaces).toEqual([true, true, true]);
});

test("initializes the scroll-linked reveal state", async ({ page }) => {
  const heading = page.locator('.mask-demo__inner .word').first();
  await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await expect.poll(() => heading.evaluate((element) => {
    const triggers = element.closest("[data-foreword-fade-init]")?._forewordFadeTriggers;
    return Array.isArray(triggers) && triggers.length > 0 && triggers.every((trigger) => Number.isFinite(trigger.start) && Number.isFinite(trigger.end));
  })).toBe(true);
});

test("initializes the scroll-direction marquee", async ({ page }) => {
  await expect(page.locator("[data-marquee-status='normal']")).toHaveCount(1);
  expect(await page.locator("[data-marquee-scroll-direction-target]").evaluate((marquee) => ({
    collections: marquee.querySelectorAll("[data-marquee-collection-target]").length,
    hasDirectionTrigger: Boolean(marquee._marqueeScrollDirectionInstance?.directionTrigger),
    hasScrollTrigger: Boolean(marquee._marqueeScrollDirectionInstance?.scrollTimeline?.scrollTrigger),
  }))).toEqual({ collections: 3, hasDirectionTrigger: true, hasScrollTrigger: true });
});

test("draws every marked line in each draw-path wrapper", async ({ page }) => {
  const paths = page.locator("[data-draw-scroll-wrap] [data-draw-scroll-path]");
  await expect(paths).toHaveCount(5);

  expect(await page.locator("[data-draw-scroll-wrap]").evaluateAll((wrappers) =>
    wrappers.map((wrapper) => ({
      hasTrigger: Boolean(wrapper._drawTl && wrapper._drawTl.scrollTrigger),
      targetCount: wrapper._drawTl?.getChildren().reduce(
        (count, tween) => count + tween.targets().length,
        0,
      ) || 0,
    })),
  )).toEqual([
    { hasTrigger: true, targetCount: 1 },
    { hasTrigger: true, targetCount: 3 },
    // The connector inside the horizontal band: proves the wrapper still
    // builds a trigger when its scroller is the band rather than the window.
    { hasTrigger: true, targetCount: 1 },
  ]);
});

test("tolerates missing image manifests", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll("[data-tunnel-images], [data-tunnel2-images]").forEach((manifest) => {
        manifest.remove();
      });
    });
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("keeps one canvas per instance after a resize", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  await expect(page.locator("[data-tunnel-init] canvas")).toHaveCount(2);
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
});

test("keeps decorative rendering out of the accessibility tree", async ({ page }) => {
  await expect(page.locator("canvas[aria-hidden='true']")).toHaveCount(3);
  await expect(page.locator("[data-tunnel-images][aria-hidden='true']")).toHaveCount(1);
  await expect(page.locator("[data-tunnel2-images][aria-hidden='true']")).toHaveCount(1);
  expect(await page.locator("[tabindex]").evaluateAll((items) =>
    items.every((item) => Number(item.getAttribute("tabindex")) <= 0),
  )).toBe(true);
});

test("remains usable with reduced motion enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator(".mask-demo__inner")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(3);
});

test("preview remains usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("[data-tunnel2-init] canvas")).toHaveCount(1);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
});
