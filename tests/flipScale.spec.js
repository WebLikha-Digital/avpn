import { test, expect } from "@playwright/test";

const ROOT = "[data-flip-scale-init]";
const TARGET = "[data-flip-scale-target]";
const LAST_WRAPPER = "[data-flip-scale-wrapper]:last-child";
const EDGE_TOLERANCE = 1;
const MONOTONIC_TOLERANCE = 1.5;

async function loadFixture(page) {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() =>
      page.locator(ROOT).evaluate((root) => Boolean(root._flipScaleTimeline)),
    )
    .toBe(true);
}

async function edgeDifference(page) {
  return page.evaluate(({ targetSelector, wrapperSelector }) => {
    const target = document.querySelector(targetSelector).getBoundingClientRect();
    const wrapper = document.querySelector(wrapperSelector).getBoundingClientRect();
    return Math.max(
      Math.abs(target.top - wrapper.top),
      Math.abs(target.right - wrapper.right),
      Math.abs(target.bottom - wrapper.bottom),
      Math.abs(target.left - wrapper.left),
    );
  }, { targetSelector: TARGET, wrapperSelector: LAST_WRAPPER });
}

test("grows monotonically during continuous scroll and fits the final waypoint", async ({ page }) => {
  await loadFixture(page);

  const bounds = await page.locator(ROOT).evaluate((root) => ({
    start: root._flipScaleTimeline.scrollTrigger.start,
    end: root._flipScaleTimeline.scrollTrigger.end,
  }));

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), bounds.start - 150);
  await page.waitForTimeout(500);

  await page.evaluate((selector) => {
    window.__flipScaleFrames = [];
    const target = document.querySelector(selector);
    const sample = () => {
      const rect = target.getBoundingClientRect();
      window.__flipScaleFrames.push({
        scrollY: window.scrollY,
        width: rect.width,
        height: rect.height,
      });
      if (window.__flipScaleFrames.length < 1000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, TARGET);

  await page.mouse.move(600, 400);
  const steps = Math.ceil((bounds.end - bounds.start + 350) / 70);
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, 70);
    await page.waitForTimeout(40);
  }

  const frames = await page.evaluate(({ start, end }) =>
    window.__flipScaleFrames.filter(
      (frame) => frame.scrollY >= start && frame.scrollY <= end,
    ), bounds);

  expect(frames.length, "the target should be sampled throughout its scrub range").toBeGreaterThan(10);
  expect(frames.at(-1).width - frames[0].width).toBeGreaterThan(100);

  for (let index = 1; index < frames.length; index += 1) {
    expect(
      frames[index].width + MONOTONIC_TOLERANCE,
      `width reversed at sampled frame ${index}`,
    ).toBeGreaterThanOrEqual(frames[index - 1].width);
    expect(
      frames[index].height + MONOTONIC_TOLERANCE,
      `height reversed at sampled frame ${index}`,
    ).toBeGreaterThanOrEqual(frames[index - 1].height);
  }

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), bounds.end + 100);
  await expect.poll(() => edgeDifference(page)).toBeLessThanOrEqual(EDGE_TOLERANCE);
});

test("re-initializes and rebuilds on width changes without stacking triggers", async ({ page }) => {
  await loadFixture(page);

  const reinitialized = await page.evaluate(async (rootSelector) => {
    const { initFlipScale } = await import("/src/animations/flipScale.js");
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const root = document.querySelector(rootSelector);
    const previous = root._flipScaleTimeline;

    initFlipScale();
    initFlipScale();

    window.__flipScaleBeforeResize = root._flipScaleTimeline;
    return {
      replaced: root._flipScaleTimeline !== previous,
      triggerCount: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === root.querySelector("[data-flip-scale-wrapper]"),
      ).length,
    };
  }, ROOT);

  expect(reinitialized).toEqual({ replaced: true, triggerCount: 1 });

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect
    .poll(() => page.locator(ROOT).evaluate(
      (root) => root._flipScaleTimeline !== window.__flipScaleBeforeResize,
    ))
    .toBe(true);
});

test("reduced motion fits the target to the last waypoint without a scrub", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(await page.locator(ROOT).evaluate(
    (root) => root._flipScaleTimeline?.scrollTrigger ?? null,
  )).toBeNull();
  await expect.poll(() => edgeDifference(page)).toBeLessThanOrEqual(EDGE_TOLERANCE);
});

test("skips incomplete roots without throwing", async ({ page }) => {
  await loadFixture(page);

  const result = await page.evaluate(async () => {
    const oneWrapper = document.createElement("div");
    oneWrapper.setAttribute("data-flip-scale-init", "");
    oneWrapper.innerHTML = "<div data-flip-scale-wrapper></div>";

    const noTarget = document.createElement("div");
    noTarget.setAttribute("data-flip-scale-init", "");
    noTarget.innerHTML =
      "<div data-flip-scale-wrapper></div><div data-flip-scale-wrapper></div>";

    document.body.append(oneWrapper, noTarget);
    const { initFlipScale } = await import("/src/animations/flipScale.js");
    initFlipScale();

    return [oneWrapper._flipScaleTimeline ?? null, noTarget._flipScaleTimeline ?? null];
  });

  expect(result).toEqual([null, null]);
});
