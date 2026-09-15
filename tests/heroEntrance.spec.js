import { test, expect } from "@playwright/test";

const state = (page) => page.evaluate(() => ({
  classPresent: document.documentElement.classList.contains("is-hero-entering"),
  targets: [...document.querySelectorAll("[data-preloader-target]")].map((node) => getComputedStyle(node).opacity),
  reveals: [...document.querySelectorAll("[data-preloader-reveal]")].map((node) => getComputedStyle(node).opacity),
  media: [...document.querySelectorAll("[data-preloader-media]")].map((node) => getComputedStyle(node).opacity),
  complete: window.__heroEntranceComplete === true,
}));

const installHeroEntranceObserver = (page) => page.addInitScript(() => {
  window.__heroEntranceComplete = false;
  window.addEventListener("hero-entrance:complete", () => { window.__heroEntranceComplete = true; }, { once: true });
  const snapshot = () => {
    window.__heroEntranceInitial = {
      classPresent: document.documentElement.classList.contains("is-hero-entering"),
      targets: [...document.querySelectorAll("[data-preloader-target]")].map((node) => getComputedStyle(node).opacity),
      reveals: [...document.querySelectorAll("[data-preloader-reveal]")].map((node) => getComputedStyle(node).opacity),
      media: [...document.querySelectorAll("[data-preloader-media]")].map((node) => getComputedStyle(node).opacity),
      sweeps: [...document.querySelectorAll("[data-hero-sweep]")].map((node) => ({
        value: node.style.getPropertyValue("--hero-sweep"),
        masked: [node.style.getPropertyValue("mask-image"), node.style.getPropertyValue("-webkit-mask-image")]
          .some((value) => value.includes("conic-gradient")),
      })),
    };
  };
  document.addEventListener("DOMContentLoaded", snapshot, { once: true });
});

test("reveals the hero and dispatches completion", async ({ page }) => {
  await installHeroEntranceObserver(page);
  await page.goto("/?hero-entrance=1");
  // The sandbox module runs before DOMContentLoaded, so the snapshot is post-init; the class assertion exercises the head-gate CSS.
  await expect.poll(() => page.evaluate(() => window.__heroEntranceInitial)).toEqual({
    classPresent: true,
    targets: ["0", "0"],
    reveals: ["1", "1", "0", "0"],
    media: ["0"],
    sweeps: [
      { value: "0deg", masked: true },
      { value: "0deg", masked: true },
    ],
  });
  await expect.poll(() => state(page)).toMatchObject({
    classPresent: false,
    targets: ["1", "1"],
    reveals: ["1", "1", "1", "1"],
    media: ["1"],
    complete: true,
  }, { timeout: 4000 });
});

test("reveals year targets before the paragraph", async ({ page }) => {
  await installHeroEntranceObserver(page);
  await page.goto("/?hero-entrance=1");
  await page.waitForFunction(() => document.querySelector("[data-hero-entrance]")?._heroEntranceInstance?.timeline);
  const sample = await page.locator("[data-hero-entrance]").evaluate((container) => {
    const timeline = container._heroEntranceInstance.timeline;
    timeline.pause().seek(1);
    const targets = [...document.querySelectorAll("[data-preloader-target]")];
    const paragraph = document.querySelector("[data-preloader-reveal]:last-child");
    return { years: targets.map((node) => Number.parseFloat(getComputedStyle(node).opacity)), paragraph: Number.parseFloat(getComputedStyle(paragraph).opacity) };
  });
  expect(sample.years[0]).toBeGreaterThan(sample.paragraph);
  expect(sample.years[1]).toBeGreaterThan(sample.paragraph);
});

test("sweep shapes reveal clockwise with a conic mask", async ({ page }) => {
  await installHeroEntranceObserver(page);
  // Pause from an init script so the heavy sandbox cannot finish the timeline before the mid-animation sample.
  await page.addInitScript(() => {
    window.__heroEntrancePaused = false;
    const pauseWhenReady = () => {
      const timeline = document.querySelector("[data-hero-entrance]")?._heroEntranceInstance?.timeline;
      if (timeline) {
        timeline.pause();
        window.__heroEntrancePaused = true;
        return;
      }
      requestAnimationFrame(pauseWhenReady);
    };
    pauseWhenReady();
  });
  await page.goto("/?hero-entrance=1");
  await page.waitForFunction(() => window.__heroEntrancePaused);
  await expect.poll(() => page.locator("[data-hero-entrance]").evaluate((container) => container._heroEntranceInstance.completed)).toBe(false);
  const sample = await page.locator("[data-hero-entrance]").evaluate((container) => {
    const timeline = container._heroEntranceInstance.timeline;
    timeline.pause().seek(1.2);
    return [...document.querySelectorAll("[data-hero-sweep]")].map((element) => ({
      sweep: element.style.getPropertyValue("--hero-sweep"),
      mask: element.style.getPropertyValue("mask-image") || element.style.getPropertyValue("-webkit-mask-image"),
    }));
  });
  expect(sample).toHaveLength(2);
  sample.forEach(({ sweep, mask }) => {
    const degrees = Number.parseFloat(sweep);
    expect(degrees).toBeGreaterThan(0);
    expect(degrees).toBeLessThan(90);
    expect(mask).toContain("conic-gradient");
  });
  await page.locator("[data-hero-entrance]").evaluate((container) => container._heroEntranceInstance.timeline.play());
  await expect.poll(() => page.locator("[data-hero-sweep]").evaluateAll((elements) => elements.map((element) => ({
    sweep: element.style.getPropertyValue("--hero-sweep"),
    mask: element.style.getPropertyValue("mask-image") || element.style.getPropertyValue("-webkit-mask-image"),
    opacity: getComputedStyle(element).opacity,
  })))).toEqual([
    { sweep: "90deg", mask: "", opacity: "1" },
    { sweep: "90deg", mask: "", opacity: "1" },
  ]);
});

test("reduced motion completes immediately", async ({ page }) => {
  await installHeroEntranceObserver(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?hero-entrance=1");
  await expect.poll(() => state(page)).toMatchObject({
    classPresent: false,
    targets: ["1", "1"],
    reveals: ["1", "1", "1", "1"],
    media: ["1"],
    complete: true,
  });
});

test("runs when the head gate class is absent", async ({ page }) => {
  await installHeroEntranceObserver(page);
  await page.goto("/");
  await expect.poll(() => state(page)).toMatchObject({
    classPresent: false,
    targets: ["1", "1"],
    reveals: ["1", "1", "1", "1"],
    media: ["1"],
    complete: true,
  }, { timeout: 4000 });
});
