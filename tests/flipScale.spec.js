import { test, expect } from "@playwright/test";

const ROOT = "[data-flip-scale-init]";
const TARGET = "[data-flip-scale-target]";
const LAST_WRAPPER = "[data-flip-scale-wrapper]:last-child";
const EDGE_TOLERANCE = 1;
const MONOTONIC_TOLERANCE = 1.5;
const CLIP_TOLERANCE = 0.01;

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

async function edgeDifference(page, wrapperSelector) {
  return page.evaluate(({ targetSelector, wrapperSelector }) => {
    const target = document.querySelector(targetSelector).getBoundingClientRect();
    const wrapper = document.querySelector(wrapperSelector).getBoundingClientRect();
    const element = document.querySelector(targetSelector);
    const insetY = parseFloat(element.style.clipPath.match(/^inset\(([^p]+)px/)?.[1] ?? 0);
    const scale = target.width / element.offsetWidth;
    const visible = {
      top: target.top + insetY * scale,
      right: target.right,
      bottom: target.bottom - insetY * scale,
      left: target.left,
    };
    return Math.max(
      Math.abs(visible.top - wrapper.top),
      Math.abs(visible.right - wrapper.right),
      Math.abs(visible.bottom - wrapper.bottom),
      Math.abs(visible.left - wrapper.left),
    );
  }, { targetSelector: TARGET, wrapperSelector });
}

function clipPathMetrics(clipPath) {
  const [insetPart, radiusPart] = clipPath.slice(6, -1).split(/\s+round\s+/);
  const values = insetPart.split(/\s+/).map(parseFloat);
  const [top, right = top, bottom = top, left = right] = values;

  return {
    top,
    right,
    bottom: values.length === 2 ? top : bottom,
    left: values.length < 4 ? right : left,
    radius: radiusPart ? parseFloat(radiusPart) : 0,
  };
}

test("grows monotonically during continuous scroll and fits the final waypoint", async ({ page }) => {
  await loadFixture(page);

  const bounds = await page.locator(ROOT).evaluate((root) => ({
    start: root._flipScaleTimeline.scrollTrigger.start,
    end: root._flipScaleTimeline.scrollTrigger.end,
  }));

  const steppedClipPaths = await page.locator(ROOT).evaluate((root) => {
    const target = root.querySelector("[data-flip-scale-target]");
    const clipPaths = [];
    [0, 0.25, 0.5, 0.75, 1].forEach((progress) => {
      root._flipScaleTimeline.progress(progress);
      clipPaths.push(target.style.clipPath);
    });
    root._flipScaleTimeline.progress(0);
    return clipPaths;
  });
  const steppedClips = steppedClipPaths.map(clipPathMetrics);
  steppedClips.forEach(({ left, right }) => {
    expect(Math.abs(left)).toBeLessThanOrEqual(CLIP_TOLERANCE);
    expect(Math.abs(right)).toBeLessThanOrEqual(CLIP_TOLERANCE);
  });
  for (let index = 1; index < steppedClips.length; index += 1) {
    expect(steppedClips[index].radius).toBeLessThanOrEqual(
      steppedClips[index - 1].radius + CLIP_TOLERANCE,
    );
  }
  expect(await edgeDifference(page, "[data-flip-scale-wrapper]:first-child"))
    .toBeLessThanOrEqual(EDGE_TOLERANCE);

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
        offsetWidth: target.offsetWidth,
        offsetHeight: target.offsetHeight,
        inlineWidth: target.style.width,
        inlineHeight: target.style.height,
        clipPath: target.style.clipPath,
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

  const layoutBoxes = new Set(frames.map(
    ({ offsetWidth, offsetHeight }) => `${offsetWidth}x${offsetHeight}`,
  ));
  const inlineSizes = new Set(frames.map(
    ({ inlineWidth, inlineHeight }) => `${inlineWidth}x${inlineHeight}`,
  ));
  expect(layoutBoxes.size, "target layout dimensions must stay fixed during the scrub")
    .toBe(1);
  expect(inlineSizes.size, "width and height must not be rewritten during the scrub")
    .toBe(1);
  expect(frames.every(({ clipPath }) => clipPath.startsWith("inset("))).toBe(true);

  const frameClips = frames.map(({ clipPath }) => clipPathMetrics(clipPath));
  frameClips.forEach(({ left, right }) => {
    expect(Math.abs(left)).toBeLessThanOrEqual(CLIP_TOLERANCE);
    expect(Math.abs(right)).toBeLessThanOrEqual(CLIP_TOLERANCE);
  });

  for (let index = 1; index < frames.length; index += 1) {
    expect(
      frames[index].width + MONOTONIC_TOLERANCE,
      `width reversed at sampled frame ${index}`,
    ).toBeGreaterThanOrEqual(frames[index - 1].width);
    expect(
      frames[index].height + MONOTONIC_TOLERANCE,
      `height reversed at sampled frame ${index}`,
    ).toBeGreaterThanOrEqual(frames[index - 1].height);
    expect(
      frameClips[index].radius,
      `corner radius increased at sampled frame ${index}`,
    ).toBeLessThanOrEqual(frameClips[index - 1].radius + CLIP_TOLERANCE);
  }

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), bounds.end + 100);
  await expect.poll(() => edgeDifference(page, LAST_WRAPPER)).toBeLessThanOrEqual(EDGE_TOLERANCE);
  await expect.poll(() => page.locator(TARGET).evaluate(
    (target) => parseFloat(target.style.clipPath.match(/round ([^p]+)px/)?.[1] ?? 0),
  )).toBe(0);
});

test("uses the CSS corner radius at the start and sizes the image for the final frame", async ({ page }) => {
  await loadFixture(page);

  const result = await page.locator(ROOT).evaluate(async (root) => {
    const target = root.querySelector("[data-flip-scale-target]");
    const image = target.querySelector("img");
    const last = root.querySelector("[data-flip-scale-wrapper]:last-child");
    target.style.removeProperty("border-radius");
    const cssRadius = parseFloat(getComputedStyle(target).borderTopLeftRadius);
    image.srcset = "/image-breaker-800.jpg 800w, /image-breaker-1600.jpg 1600w";
    image.sizes = "720px";

    const { initFlipScale } = await import("/src/animations/flipScale.js");
    initFlipScale();
    root._flipScaleTimeline.progress(0);

    const targetRect = target.getBoundingClientRect();
    const scale = targetRect.width / target.offsetWidth;
    const elementRadius = parseFloat(target.style.clipPath.match(/round ([^p]+)px/)?.[1] ?? 0);
    const lastRect = last.getBoundingClientRect();
    const spansViewport =
      Math.abs(lastRect.left) <= 1 && Math.abs(lastRect.right - innerWidth) <= 1;

    return {
      cssRadius,
      visualRadius: elementRadius * scale,
      sizes: image.sizes,
      expectedSizes: spansViewport ? "100vw" : `${Math.round(lastRect.width)}px`,
    };
  });

  expect(Math.abs(result.visualRadius - result.cssRadius)).toBeLessThanOrEqual(0.1);
  expect(result.sizes).toBe(result.expectedSizes);
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
  await expect.poll(() => edgeDifference(page, LAST_WRAPPER)).toBeLessThanOrEqual(EDGE_TOLERANCE);
  expect(await page.locator(TARGET).evaluate(
    (target) => parseFloat(target.style.clipPath.match(/round ([^p]+)px/)?.[1] ?? 0),
  )).toBe(0);
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
