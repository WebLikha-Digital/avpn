import { test, expect } from "@playwright/test";

async function signatureRange(page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector(".signature-demo");
    const top = wrapper.getBoundingClientRect().top + scrollY;
    const start = top - innerHeight / 2;
    const end = top + wrapper.offsetHeight - innerHeight / 2;
    return { start, end };
  });
}

async function reloadAt(page, target) {
  await page.evaluate((y) => window.scrollTo(0, y), target);
  await expect.poll(() => page.evaluate((y) => Math.abs(scrollY - y) < 2, target), {
    timeout: 15_000,
  }).toBe(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => {
    const path = document.querySelector(".signature-demo [data-draw-scroll-path]");
    return path?.style.strokeDasharray;
  });
  await expect.poll(() => page.evaluate((y) => Math.abs(scrollY - y) < 2, target), {
    timeout: 15_000,
  }).toBe(true);

  await page.waitForFunction(() => document.readyState === "complete");
  await page.evaluate(() => document.fonts?.ready);
  return settleSignature(page);
}

async function settleSignature(page) {
  // A ResizeObserver-triggered ScrollTrigger refresh can run several seconds
  // after load while the page finishes measuring its content, so sample long
  // enough to catch the delayed hidden state on the broken implementation.
  return page.evaluate(async () => {
    const samples = [];
    const deadline = performance.now() + 4_500;
    while (performance.now() < deadline) {
      const path = document.querySelector(".signature-demo [data-draw-scroll-path]");
      const drawn = Number.parseFloat(path?.style.strokeDasharray) > 0;
      samples.push({
        drawn,
        visible: getComputedStyle(path).visibility === "visible",
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return samples;
  });
}

async function signatureState(page) {
  return page.evaluate(() => {
    const paths = [...document.querySelectorAll(".signature-demo [data-draw-scroll-path]")];
    const drawn = paths.filter((path) => Number.parseFloat(path.style.strokeDasharray) > 0);
    const visible = paths.filter((path) => getComputedStyle(path).visibility === "visible");
    return { drawn: drawn.length, visible: visible.length };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("mask signature is visible at its rendered progress after a deep reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".signature-demo"));
  const { end } = await signatureRange(page);
  const target = await page.evaluate((drawEnd) => Math.min(
    document.documentElement.scrollHeight - innerHeight,
    drawEnd + 200,
  ), end);

  const samples = await reloadAt(page, target);
  const state = await signatureState(page);

  expect(state.drawn).toBe(1);
  expect(state.visible).toBe(state.drawn);
  expect(samples.some((sample) => sample.drawn)).toBe(true);
  expect(samples.filter((sample) => sample.drawn).every((sample) => sample.visible)).toBe(true);
});

test("mask signature visibility matches its drawn amount after a mid-range reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".signature-demo"));
  const { start, end } = await signatureRange(page);
  const target = (start + end) / 2;

  const samples = await reloadAt(page, target);
  const state = await signatureState(page);

  expect(state.drawn).toBe(1);
  expect(state.visible).toBe(state.drawn);
  expect(samples.some((sample) => sample.drawn)).toBe(true);
  expect(samples.filter((sample) => sample.drawn).every((sample) => sample.visible)).toBe(true);
});

test("mask signature stays hidden before its draw range", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".signature-demo"));
  const { start } = await signatureRange(page);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), start - 200);

  await expect.poll(() => page.evaluate(() => {
    const path = document.querySelector(".signature-demo [data-draw-scroll-path]");
    return getComputedStyle(path).visibility;
  })).toBe("hidden");

  const state = await signatureState(page);
  expect(state.drawn).toBe(0);
  expect(state.visible).toBe(0);
});
