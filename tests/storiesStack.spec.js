import { test, expect } from "@playwright/test";

const ROOT = '[data-testid="stories-stack"]';
const ITEM = `${ROOT} [data-stories-item]`;

async function loadStories(page, width = 1200, reducedMotion = "no-preference") {
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.locator(`${ITEM} .stories-community_shape`).count()).toBe(3);
}

async function pinState(page) {
  return page.locator(ROOT).evaluate(async (root) => {
    const { ScrollTrigger } = await import("/src/lib/gsap.js");
    return {
      pins: ScrollTrigger.getAll().filter((trigger) => trigger.vars.pin && trigger.vars.trigger?.matches?.("[data-stories-item]")).length,
      spacers: root.querySelectorAll(".pin-spacer").length,
      scales: [
        ...root.querySelectorAll("h1, h2, h3, h4, h5, h6"),
        ...root.querySelectorAll(".stories-community_shape"),
        ...root.querySelectorAll("p"),
      ].map((part) => {
        const transform = getComputedStyle(part).transform;
        return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
      }),
    };
  });
}

test("pins each non-final row and keeps the line behind the stack", async ({ page }) => {
  await loadStories(page);
  const result = await pinState(page);
  expect(result.pins).toBe(2);
  expect(result.spacers).toBe(2);
  expect(result.scales).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  await expect(page.locator(`${ROOT} .stories-stack-demo__line`)).toBeVisible();
});

test("holds a row during continuous scroll, scales monotonically, and releases at its runway", async ({ page }) => {
  await loadStories(page);
  const range = await page.locator(ITEM).first().evaluate((item) => {
    const trigger = item.closest("[data-stories-init]")._storiesPinTweens?.[0]?.scrollTrigger;
    return { start: trigger.start, end: trigger.end };
  });

  const samples = await page.evaluate(({ start, end }) => new Promise((resolve, reject) => {
    const list = document.querySelector('[data-testid="stories-stack"] [data-stories-init]');
    const items = list?.querySelectorAll("[data-stories-item]");
    const item = items?.[0];
    const next = items?.[1];
    const heading = item?.querySelector("h1, h2, h3, h4, h5, h6");
    const shape = item?.querySelector(".stories-community_shape");
    const body = item?.querySelector("p");
    const content = item?.querySelector(".stories-community_item-inner");
    const values = [];
    let count = 0;
    const sample = () => {
      try {
        const scale = (part) => {
          const transform = getComputedStyle(part).transform;
          return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
        };
        values.push({
          scrollY: window.scrollY,
          itemTop: item.getBoundingClientRect().top,
          nextTop: next.getBoundingClientRect().top,
          contentBottom: content.getBoundingClientRect().bottom,
          headingScale: scale(heading),
          shapeScale: scale(shape),
          bodyScale: scale(body),
        });
        count += 1;
        if (count >= 45) return resolve(values);
        window.scrollTo({ top: start + (end - start) * count / 44, behavior: "instant" });
        requestAnimationFrame(sample);
      } catch (error) {
        reject(error);
      }
    };
    window.scrollTo({ top: start - 40, behavior: "instant" });
    const entranceStarted = performance.now();
    const waitForEntrance = () => {
      try {
        const transform = getComputedStyle(shape).transform;
        const translateY = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).f;
        if (getComputedStyle(shape).opacity === "1" && translateY === 0) {
          requestAnimationFrame(sample);
          return;
        }
        if (performance.now() - entranceStarted >= 3000) {
          reject(new Error("Stories entrance did not complete within 3 seconds"));
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      requestAnimationFrame(waitForEntrance);
    };
    requestAnimationFrame(waitForEntrance);
  }), range);

  expect(samples.length).toBeGreaterThan(20);
  const pinned = samples.filter((sample) => sample.scrollY >= range.start + 2 && sample.scrollY <= range.end - 2);
  expect(pinned.length).toBeGreaterThan(5);
  expect(pinned[0].headingScale).toBeGreaterThan(0.9);
  expect(pinned[0].shapeScale).toBeGreaterThan(0.9);
  expect(pinned[0].bodyScale).toBeGreaterThan(0.9);
  expect(pinned.at(-1).headingScale).toBeLessThan(0.6);
  expect(pinned.at(-1).shapeScale).toBeLessThan(0.6);
  expect(pinned.at(-1).bodyScale).toBeLessThan(0.8);
  expect(pinned.at(-1).bodyScale).toBeGreaterThan(0.7);
  expect(Math.max(...pinned.map((sample) => sample.itemTop)) - Math.min(...pinned.map((sample) => sample.itemTop))).toBeLessThan(2);
  for (let index = 1; index < pinned.length; index += 1) {
    expect(pinned[index].headingScale).toBeLessThanOrEqual(pinned[index - 1].headingScale + 0.02);
    expect(pinned[index].shapeScale).toBeLessThanOrEqual(pinned[index - 1].shapeScale + 0.02);
    expect(pinned[index].bodyScale).toBeLessThanOrEqual(pinned[index - 1].bodyScale + 0.02);
    expect(pinned[index].nextTop).toBeGreaterThanOrEqual(pinned[index].contentBottom - 2);
  }
  expect(samples.at(-1).headingScale).toBeLessThan(0.6);
  expect(samples.at(-1).shapeScale).toBeLessThan(0.6);
  expect(samples.at(-1).bodyScale).toBeLessThan(0.8);
  expect(samples.at(-1).bodyScale).toBeGreaterThan(0.7);

  await page.evaluate((start) => {
    window.scrollTo({ top: start - 40, behavior: "instant" });
  }, range.start);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    requestAnimationFrame(resolve);
  })));
  const reverseScales = await page.locator(ITEM).first().evaluate((item) => [
    item.querySelector("h1, h2, h3, h4, h5, h6"),
    item.querySelector(".stories-community_shape"),
    item.querySelector("p"),
  ].map((part) => {
    const transform = getComputedStyle(part).transform;
    return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
  }));
  reverseScales.forEach((scale) => expect(scale).toBeCloseTo(1, 1));
});

test("honours scale attributes and falls back for invalid values", async ({ page }) => {
  await loadStories(page);
  await page.locator(`${ROOT} [data-stories-init]`).evaluate(async (list) => {
    list.setAttribute("data-stories-heading-scale", "0.4");
    list.setAttribute("data-stories-shape-scale", "not-a-number");
    list.setAttribute("data-stories-body-scale", "0.65");
    const { initStoriesStack } = await import("/src/animations/storiesStack.js");
    initStoriesStack();
  });
  const scales = await page.locator(ITEM).first().evaluate((item) => {
    const timeline = item.closest("[data-stories-init]")._storiesPinTweens[0];
    return timeline.getChildren().map((tween) => tween.vars.scale);
  });
  expect(scales).toEqual([0.4, 0.5, 0.65]);
});

test("honours the kill switch and skips pinning below desktop and for reduced motion", async ({ page }) => {
  await loadStories(page, 991);
  expect(await pinState(page)).toMatchObject({ pins: 0, spacers: 0, scales: [1, 1, 1, 1, 1, 1, 1, 1, 1] });

  await loadStories(page, 1200, "reduce");
  expect(await pinState(page)).toMatchObject({ pins: 0, spacers: 0, scales: [1, 1, 1, 1, 1, 1, 1, 1, 1] });

  await loadStories(page);
  await page.locator(ROOT).evaluate(async (root) => {
    root.querySelector("[data-stories-init]").setAttribute("data-stories-pin", "off");
    const { initStoriesStack } = await import("/src/animations/storiesStack.js");
    initStoriesStack();
  });
  expect(await pinState(page)).toMatchObject({ pins: 0, spacers: 0, scales: [1, 1, 1, 1, 1, 1, 1, 1, 1] });
});
