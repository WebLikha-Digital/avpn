import { test, expect } from "@playwright/test";

const ROOT = "[data-clip-reveal-init]";
const EDGE_TOLERANCE = 1;
const POSITION_TOLERANCE = 1;
const MONOTONIC_TOLERANCE = 0.05;
const CLIP_TOLERANCE = 0.1;

async function loadFixture(page) {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() =>
      page.locator(ROOT).evaluate((root) => Boolean(root._clipRevealTimeline)),
    )
    .toBe(true);
}

function clipPathMetrics(clipPath) {
  const [insetPart, radiusPart] = clipPath.slice(6, -1).split(/\s+round\s+/);
  const values = insetPart.split(/\s+/).map(parseFloat);
  const [top, second = top, third = top, fourth = second] = values;

  return {
    top,
    right: second,
    bottom: values.length === 2 ? top : third,
    left: values.length < 4 ? second : fourth,
    radius: radiusPart ? parseFloat(radiusPart) : 0,
  };
}

function expectMonotonicDecrease(frames, property) {
  for (let index = 1; index < frames.length; index += 1) {
    expect(
      frames[index][property],
      `${property} increased at sampled frame ${index}`,
    ).toBeLessThanOrEqual(frames[index - 1][property] + MONOTONIC_TOLERANCE);
  }
}

test("reveals the stationary sticky frame monotonically during continuous scroll", async ({ page }) => {
  await loadFixture(page);

  const setup = await page.locator(ROOT).evaluate((root) => {
    const target = root.querySelector("[data-clip-reveal-target]");
    const from = root.querySelector("[data-clip-reveal-from]");
    const timeline = root._clipRevealTimeline;
    timeline.progress(0);

    const targetRect = target.getBoundingClientRect();
    const fromRect = from.getBoundingClientRect();

    return {
      bounds: {
        start: timeline.scrollTrigger.start,
        end: timeline.scrollTrigger.end,
      },
      clipPath: target.style.clipPath,
      cssRadius: parseFloat(getComputedStyle(from).borderTopLeftRadius),
      targetRect: {
        top: targetRect.top,
        right: targetRect.right,
        bottom: targetRect.bottom,
        left: targetRect.left,
      },
      fromRect: {
        top: fromRect.top,
        right: fromRect.right,
        bottom: fromRect.bottom,
        left: fromRect.left,
      },
    };
  });

  const startClip = clipPathMetrics(setup.clipPath);
  const visibleStart = {
    top: setup.targetRect.top + startClip.top,
    right: setup.targetRect.right - startClip.right,
    bottom: setup.targetRect.bottom - startClip.bottom,
    left: setup.targetRect.left + startClip.left,
  };
  expect(Math.max(
    Math.abs(visibleStart.top - setup.fromRect.top),
    Math.abs(visibleStart.right - setup.fromRect.right),
    Math.abs(visibleStart.bottom - setup.fromRect.bottom),
    Math.abs(visibleStart.left - setup.fromRect.left),
  )).toBeLessThanOrEqual(EDGE_TOLERANCE);
  expect(Math.abs(startClip.radius - setup.cssRadius)).toBeLessThanOrEqual(0.1);

  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    setup.bounds.start - 150,
  );
  await page.waitForTimeout(500);

  await page.locator(ROOT).evaluate((root) => {
    window.__clipRevealFrames = [];
    const target = root.querySelector("[data-clip-reveal-target]");
    const timeline = root._clipRevealTimeline;

    const sample = () => {
      const rect = target.getBoundingClientRect();
      window.__clipRevealFrames.push({
        scrollY: window.scrollY,
        progress: timeline.progress(),
        offsetWidth: target.offsetWidth,
        offsetHeight: target.offsetHeight,
        top: rect.top,
        clipPath: target.style.clipPath,
        inlineProperties: Array.from(target.style),
        transform: target.style.transform,
        width: target.style.width,
        height: target.style.height,
        position: target.style.position,
        inset: target.style.inset,
      });
      if (window.__clipRevealFrames.length < 1500) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });

  await page.mouse.move(600, 400);
  const steps = Math.ceil((setup.bounds.end - setup.bounds.start + 350) / 70);
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, 70);
    await page.waitForTimeout(40);
  }

  const frames = await page.evaluate(({ start, end }) =>
    window.__clipRevealFrames.filter(
      (frame) => frame.scrollY > start + 2 && frame.scrollY < end - 2,
    ), setup.bounds);

  expect(frames.length, "the target should be sampled throughout its scrub range")
    .toBeGreaterThan(10);
  expect(frames.at(-1).progress - frames[0].progress).toBeGreaterThan(0.8);

  expect(new Set(frames.map(({ offsetWidth }) => offsetWidth)).size).toBe(1);
  expect(new Set(frames.map(({ offsetHeight }) => offsetHeight)).size).toBe(1);
  expect(
    Math.max(...frames.map(({ top }) => top)) - Math.min(...frames.map(({ top }) => top)),
    "the frame viewport position must stay fixed while its wrapper is sticky",
  ).toBeLessThanOrEqual(POSITION_TOLERANCE);
  expect(frames.every(({ clipPath }) => clipPath.startsWith("inset("))).toBe(true);
  expect(frames.every(({ inlineProperties }) =>
    inlineProperties.length === 1 && inlineProperties[0] === "clip-path",
  )).toBe(true);
  expect(frames.every(({ transform, width, height, position, inset }) =>
    !transform && !width && !height && !position && !inset,
  )).toBe(true);

  const clips = frames.map(({ clipPath }) => clipPathMetrics(clipPath));
  ["top", "right", "bottom", "left", "radius"].forEach((property) =>
    expectMonotonicDecrease(clips, property),
  );

  frames.forEach((frame, index) => {
    const expectedRight = startClip.right * (1 - frame.progress);
    const expectedLeft = startClip.left * (1 - frame.progress);
    expect(
      Math.abs(clips[index].right - expectedRight),
      `right inset differed from the explicit tween at sampled frame ${index}`,
    ).toBeLessThanOrEqual(CLIP_TOLERANCE);
    expect(
      Math.abs(clips[index].left - expectedLeft),
      `left inset differed from the explicit tween at sampled frame ${index}`,
    ).toBeLessThanOrEqual(CLIP_TOLERANCE);
  });

  const endClipPath = await page.locator(ROOT).evaluate((root) => {
    root._clipRevealTimeline.progress(1);
    return root.querySelector("[data-clip-reveal-target]").style.clipPath;
  });
  expect(clipPathMetrics(endClipPath)).toEqual({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    radius: 0,
  });
});

test("re-initializes and rebuilds once on width changes without stacking triggers", async ({ page }) => {
  await loadFixture(page);

  const reinitialized = await page.evaluate(async (rootSelector) => {
    const { initClipReveal } = await import("/src/animations/clipReveal.js");
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const root = document.querySelector(rootSelector);
    const previous = root._clipRevealTimeline;

    initClipReveal();
    initClipReveal();

    window.__clipRevealBeforeResize = root._clipRevealTimeline;
    return {
      replaced: root._clipRevealTimeline !== previous,
      triggerCount: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === root,
      ).length,
    };
  }, ROOT);

  expect(reinitialized).toEqual({ replaced: true, triggerCount: 1 });

  await page.setViewportSize({ width: 700, height: 800 });
  await expect
    .poll(() => page.locator(ROOT).evaluate(
      (root) => root._clipRevealTimeline !== window.__clipRevealBeforeResize,
    ))
    .toBe(true);

  const rebuilt = await page.locator(ROOT).evaluate(async (root) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    const timeline = root._clipRevealTimeline;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      rebuiltAgain: root._clipRevealTimeline !== timeline,
      triggerCount: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === root,
      ).length,
    };
  });

  expect(rebuilt).toEqual({ rebuiltAgain: false, triggerCount: 1 });
});

test("reduced motion creates no ScrollTrigger and fully reveals the target", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const result = await page.locator(ROOT).evaluate(async (root) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    return {
      clipPath: root.querySelector("[data-clip-reveal-target]").style.clipPath,
      timelineTrigger: root._clipRevealTimeline?.scrollTrigger ?? null,
      triggerCount: ScrollTrigger.getAll().filter(
        (trigger) => trigger.vars.trigger === root,
      ).length,
    };
  });

  expect(result.timelineTrigger).toBeNull();
  expect(result.triggerCount).toBe(0);
  expect(clipPathMetrics(result.clipPath)).toEqual({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    radius: 0,
  });
});

test("uses the default clip without a from-box and skips roots without a target", async ({ page }) => {
  await loadFixture(page);

  const result = await page.evaluate(async () => {
    const fallbackRoot = document.createElement("div");
    fallbackRoot.setAttribute("data-clip-reveal-init", "");
    fallbackRoot.innerHTML =
      '<div data-clip-reveal-target style="width: 200px; height: 100px"></div>';

    const noTarget = document.createElement("div");
    noTarget.setAttribute("data-clip-reveal-init", "");

    document.body.append(fallbackRoot, noTarget);
    const { initClipReveal } = await import("/src/animations/clipReveal.js");
    initClipReveal();
    fallbackRoot._clipRevealTimeline.progress(0);

    return {
      fallbackClip: fallbackRoot.querySelector("[data-clip-reveal-target]").style.clipPath,
      noTargetTimeline: noTarget._clipRevealTimeline ?? null,
    };
  });

  expect(clipPathMetrics(result.fallbackClip)).toEqual({
    top: 25,
    right: 50,
    bottom: 25,
    left: 50,
    radius: 0,
  });
  expect(result.noTargetTimeline).toBeNull();
});
