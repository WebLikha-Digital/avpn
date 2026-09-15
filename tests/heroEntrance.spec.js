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
    };
  };
  document.addEventListener("DOMContentLoaded", snapshot, { once: true });
});

test("reveals the hero and dispatches completion", async ({ page }) => {
  await installHeroEntranceObserver(page);
  await page.goto("/?hero-entrance=1");
  await expect.poll(() => page.evaluate(() => window.__heroEntranceInitial)).toEqual({
    classPresent: true,
    targets: ["0", "0"],
    reveals: ["0", "0", "0", "0"],
    media: ["0"],
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
