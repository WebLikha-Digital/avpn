import { test, expect } from "@playwright/test";

const block = '[data-testid="stories-stack"]';
const list = `${block} [data-stories-init]`;
const firstHeading = `${list} [data-stories-item] h3`;

async function loadFixture(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(() => {
    window.__storiesEffectiveTransform = (element) => {
      const styles = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      const individualScale = styles.scale === "none" ? 1 : parseFloat(styles.scale);
      const translate = styles.translate === "none" ? 0 : parseFloat(styles.translate);
      return {
        scale: Math.hypot(matrix.a, matrix.b) * individualScale,
        translate: Number.isFinite(translate) ? translate : 0,
      };
    };
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

async function storyRange(page) {
  return page.locator(list).evaluate((element) => {
    const tween = element._storiesScaleTweens?.[0];
    return { start: tween.scrollTrigger.start, end: tween.scrollTrigger.end };
  });
}

async function sampleScales(page, start, end, count = 18) {
  return page.evaluate(
    ({ start, end, count }) => new Promise((resolve) => {
      const heading = document.querySelector('[data-testid="stories-stack"] h3');
      const samples = [];
      let index = 0;

      const sample = () => {
        samples.push({ scrollY: window.scrollY, scale: window.__storiesEffectiveTransform(heading).scale });
        index += 1;
        if (index >= count) {
          resolve(samples);
          return;
        }
        window.scrollTo({
          top: start + ((end - start) * index) / (count - 1),
          behavior: "instant",
        });
        requestAnimationFrame(sample);
      };

      window.scrollTo({ top: start, behavior: "instant" });
      requestAnimationFrame(sample);
    }),
    { start, end, count },
  );
}

async function sampleFastScroll(page, start, end) {
  return page.evaluate(
    ({ start, end }) => new Promise((resolve) => {
      const heading = document.querySelector('[data-testid="stories-stack"] h3');
      const paragraph = document.querySelector('[data-testid="stories-stack"] p');
      const samples = [];
      let top = start;

      const sample = () => {
        samples.push({
          headingScale: window.__storiesEffectiveTransform(heading).scale,
          paragraphScale: window.__storiesEffectiveTransform(paragraph).scale,
        });
        top += 20;
        if (top > end) {
          resolve(samples);
          return;
        }
        window.scrollTo({ top, behavior: "instant" });
        requestAnimationFrame(sample);
      };

      window.scrollTo({ top, behavior: "instant" });
      requestAnimationFrame(sample);
    }),
    { start, end },
  );
}

test("desktop rows recede continuously from 1 toward the configured half scale", async ({ page }) => {
  await loadFixture(page, 1200);
  await expect.poll(() => page.locator(list).evaluate((element) =>
    (element._storiesScaleTweens?.length ?? 0) > 0,
  )).toBe(true);

  const { start, end } = await storyRange(page);
  const samples = await sampleScales(page, start + 2, end - 2);

  expect(samples.length).toBeGreaterThan(10);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].scale).toBeLessThanOrEqual(samples[index - 1].scale + 0.02);
  }
  expect(samples[0].scale).toBeCloseTo(1, 1);
  expect(samples.at(-1).scale).toBeCloseTo(0.5, 1);
});

test("entrance rendering never increases either scrubbed scale during fast scrolling", async ({ page }) => {
  await loadFixture(page, 1200);
  const row = page.locator(`${list} [data-stories-item]`).first();
  const entrance = await page.locator(list).evaluate((element) =>
    element._storiesTweens[0].scrollTrigger.start,
  );
  const { end } = await storyRange(page);
  const samples = await sampleFastScroll(page, entrance, end);

  expect(samples.length).toBeGreaterThan(10);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].headingScale).toBeLessThanOrEqual(samples[index - 1].headingScale + 0.001);
    expect(samples[index].paragraphScale).toBeLessThanOrEqual(samples[index - 1].paragraphScale + 0.001);
  }
});

test("recede scale remains applied while the entrance is still running", async ({ page }) => {
  await loadFixture(page, 1200);
  const row = page.locator(`${list} [data-stories-item]`).first();
  const { start, end } = await storyRange(page);
  const rowHeight = await row.evaluate((element) => element.getBoundingClientRect().height);
  const target = start + 150;

  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), target);
  await page.waitForTimeout(1200);

  const scales = await row.evaluate((element) => {
    const heading = element.querySelector("h3");
    const paragraph = element.querySelector("p");
    return {
      heading: window.__storiesEffectiveTransform(heading).scale,
      paragraph: window.__storiesEffectiveTransform(paragraph).scale,
    };
  });
  const expectedProgress = 150 / (end - start);
  expect(scales.heading).toBeCloseTo(1 - expectedProgress * 0.5, 1);
  expect(scales.paragraph).toBeCloseTo(1 - expectedProgress * 0.25, 1);
  expect(Math.abs(scales.heading - (1 - 150 / rowHeight * 0.5))).toBeLessThan(0.05);
  expect(Math.abs(scales.paragraph - (1 - 150 / rowHeight * 0.25))).toBeLessThan(0.05);
});

test("mobile rows have no recede scale transform", async ({ page }) => {
  await loadFixture(page, 767);
  const heading = page.locator(firstHeading).first();
  const rowTop = await heading.evaluate((element) =>
    element.closest("[data-stories-item]").getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), rowTop);
  await page.waitForTimeout(1000);

  // The entrance tween still runs below the breakpoint and leaves a zero
  // translate behind, so read the scale out of the computed matrix rather
  // than asserting an empty transform string.
  await expect.poll(() => heading.evaluate((element) => {
    return {
      scale: window.__storiesEffectiveTransform(element).scale,
      scaleTweenCount: element.closest("[data-stories-init]")._storiesScaleTweens?.length ?? 0,
    };
  })).toEqual({ scale: 1, scaleTweenCount: 0 });
});
