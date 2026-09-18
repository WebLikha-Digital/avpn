import { test, expect } from "@playwright/test";

const ROOT = '[data-testid="fade-near-top"]';
const TEXT = `${ROOT} [data-fade-top]:not(img):not([data-fade-top-trigger])`;
const IMAGE = `${ROOT} img[data-fade-top]`;
const TRIGGERED = `${ROOT} [data-fade-top][data-fade-top-trigger]`;

async function loadFixture(page, width = 1200) {
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

async function triggerRange(page, selector) {
  return page.locator(selector).evaluate((element) => ({
    start: element._fadeNearTop.scrollTrigger.start,
    end: element._fadeNearTop.scrollTrigger.end,
  }));
}

async function sampleWhileScrolling(page, selector, start, end, count = 40) {
  return page.evaluate(
    ({ selector, start, end, count }) =>
      new Promise((resolve) => {
        const element = document.querySelector(selector);
        const trigger = element._fadeNearTop.scrollTrigger.trigger;
        const samples = [];
        let index = 0;

        const sample = () => {
          const rect = element.getBoundingClientRect();
          samples.push({
            top: rect.top,
            bottom: rect.bottom,
            triggerBottom: trigger.getBoundingClientRect().bottom,
            opacity: Number.parseFloat(getComputedStyle(element).opacity),
          });

          index += 1;
          if (index >= count) {
            resolve(samples);
            return;
          }

          const progress = index / (count - 1);
          window.scrollTo({
            top: start + (end - start) * progress,
            behavior: "instant",
          });
          requestAnimationFrame(sample);
        };

        window.scrollTo({ top: start, behavior: "instant" });
        requestAnimationFrame(sample);
      }),
    { selector, start, end, count },
  );
}

test("scrubs opacity through the top and restores it on reverse scroll", async ({ page }) => {
  await loadFixture(page);
  await expect.poll(() => page.locator(TEXT).evaluate((element) => Boolean(element._fadeNearTop))).toBe(true);

  const { start, end } = await triggerRange(page, TEXT);
  const samples = await sampleWhileScrolling(page, TEXT, start - 80, end + 80);
  expect(samples.length).toBeGreaterThan(10);

  for (const sample of samples) {
    if (sample.top > 280) expect(sample.opacity).toBeCloseTo(1, 2);
    if (sample.top <= 120) expect(sample.opacity).toBeCloseTo(0, 2);
  }

  const fading = samples.filter((sample) => sample.top <= 280 && sample.top > 120);
  expect(fading.length).toBeGreaterThan(5);
  for (let index = 1; index < fading.length; index += 1) {
    expect(fading[index].opacity).toBeLessThan(fading[index - 1].opacity);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.locator(TEXT).evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))).toBeCloseTo(1, 2);
});

test("does not create fade tweens below the minimum width", async ({ page }) => {
  await loadFixture(page, 900);
  await expect(page.locator(`${ROOT} [data-fade-top]`)).toHaveCount(3);
  await expect.poll(() => page.locator(`${ROOT} [data-fade-top]`).evaluateAll((elements) => elements.map((element) => Boolean(element._fadeNearTop)))).toEqual([false, false, false]);
});

test("passes authored start and end values to ScrollTrigger", async ({ page }) => {
  await loadFixture(page);
  const values = await page.locator(IMAGE).evaluate((element) => ({
    varsStart: element._fadeNearTop.scrollTrigger.vars.start,
    varsEnd: element._fadeNearTop.scrollTrigger.vars.end,
    start: element._fadeNearTop.scrollTrigger.start,
    end: element._fadeNearTop.scrollTrigger.end,
    top: element.getBoundingClientRect().top + window.scrollY,
    height: element.getBoundingClientRect().height,
  }));

  expect(values.varsStart).toBe("top 50%");
  expect(values.varsEnd).toBe("top 30%");
  expect(values.start).toBeCloseTo(values.top - 400, 0);
  expect(values.end).toBeCloseTo(values.top - 240, 0);
});

test("uses the authored trigger for range and opacity", async ({ page }) => {
  await loadFixture(page);
  const values = await page.locator(TRIGGERED).evaluate((element) => {
    const trigger = element._fadeNearTop.scrollTrigger;
    const ancestor = element.closest('[data-testid="fade-near-top"]');
    return {
      triggerIsAncestor: trigger.trigger === ancestor,
      ancestorBottom: ancestor.getBoundingClientRect().bottom + window.scrollY,
      start: trigger.start,
      end: trigger.end,
    };
  });

  expect(values.triggerIsAncestor).toBe(true);
  expect(values.start).toBeCloseTo(values.ancestorBottom - 800, 0);
  expect(values.end).toBeCloseTo(values.ancestorBottom - 440, 0);

  const samples = await sampleWhileScrolling(
    page,
    TRIGGERED,
    values.start - 100,
    values.end + 100,
  );
  expect(samples.length).toBeGreaterThan(10);

  const beforeStart = samples.find((sample) => sample.triggerBottom > 800);
  const afterEnd = samples.find((sample) => sample.triggerBottom < 440);
  expect(beforeStart?.opacity).toBeCloseTo(1, 2);
  expect(afterEnd?.opacity).toBeCloseTo(0, 2);
});
